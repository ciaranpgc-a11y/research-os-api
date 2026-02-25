const INBOX_KEYS_STORAGE_KEY = 'aawe-workspace-inbox-keys-v1'

type InboxKeyMap = Record<string, string>

export type EncryptedInboxPayload = {
  ciphertext: string
  iv: string
}

function hasWebCrypto(): boolean {
  return typeof window !== 'undefined' && Boolean(window.crypto?.subtle)
}

function toBase64(bytes: Uint8Array): string {
  let binary = ''
  for (const byte of bytes) {
    binary += String.fromCharCode(byte)
  }
  return window.btoa(binary)
}

function fromBase64(value: string): Uint8Array {
  const binary = window.atob(value)
  const bytes = new Uint8Array(binary.length)
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index)
  }
  return bytes
}

function readKeyMap(): InboxKeyMap {
  if (typeof window === 'undefined') {
    return {}
  }
  const raw = window.localStorage.getItem(INBOX_KEYS_STORAGE_KEY)
  if (!raw) {
    return {}
  }
  try {
    const parsed = JSON.parse(raw) as InboxKeyMap
    return typeof parsed === 'object' && parsed ? parsed : {}
  } catch {
    return {}
  }
}

function writeKeyMap(value: InboxKeyMap): void {
  if (typeof window === 'undefined') {
    return
  }
  window.localStorage.setItem(INBOX_KEYS_STORAGE_KEY, JSON.stringify(value))
}

async function importAesKey(rawKeyBase64: string): Promise<CryptoKey> {
  const keyBytes = fromBase64(rawKeyBase64)
  return window.crypto.subtle.importKey(
    'raw',
    keyBytes,
    { name: 'AES-GCM' },
    false,
    ['encrypt', 'decrypt'],
  )
}

async function ensureWorkspaceInboxKey(workspaceId: string): Promise<CryptoKey> {
  if (!hasWebCrypto()) {
    throw new Error('Secure inbox encryption is not available in this browser.')
  }

  const cleanWorkspaceId = workspaceId.trim()
  if (!cleanWorkspaceId) {
    throw new Error('Workspace id is required for inbox encryption.')
  }

  const keyMap = readKeyMap()
  const existingRawKey = keyMap[cleanWorkspaceId]
  if (existingRawKey) {
    return importAesKey(existingRawKey)
  }

  const key = await window.crypto.subtle.generateKey(
    { name: 'AES-GCM', length: 256 },
    true,
    ['encrypt', 'decrypt'],
  )
  const rawKey = await window.crypto.subtle.exportKey('raw', key)
  keyMap[cleanWorkspaceId] = toBase64(new Uint8Array(rawKey))
  writeKeyMap(keyMap)
  return importAesKey(keyMap[cleanWorkspaceId])
}

export async function encryptWorkspaceInboxText(
  workspaceId: string,
  plaintext: string,
): Promise<EncryptedInboxPayload> {
  const key = await ensureWorkspaceInboxKey(workspaceId)
  const iv = window.crypto.getRandomValues(new Uint8Array(12))
  const encoder = new TextEncoder()
  const cipherBuffer = await window.crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    key,
    encoder.encode(plaintext),
  )
  return {
    ciphertext: toBase64(new Uint8Array(cipherBuffer)),
    iv: toBase64(iv),
  }
}

export async function decryptWorkspaceInboxText(
  workspaceId: string,
  payload: EncryptedInboxPayload,
): Promise<string> {
  const key = await ensureWorkspaceInboxKey(workspaceId)
  const cipherBytes = fromBase64(payload.ciphertext)
  const iv = fromBase64(payload.iv)
  const plainBuffer = await window.crypto.subtle.decrypt(
    { name: 'AES-GCM', iv },
    key,
    cipherBytes,
  )
  const decoder = new TextDecoder()
  return decoder.decode(plainBuffer)
}
