import { create } from 'zustand'

import { getAuthSessionToken } from '@/lib/auth-session'
import {
  createWorkspaceInboxMessageApi,
  listWorkspaceInboxMessagesApi,
  listWorkspaceInboxReadsApi,
  markWorkspaceInboxReadApi,
} from '@/lib/workspace-api'
import {
  readScopedStorageItem,
  writeScopedStorageItem,
} from '@/lib/user-scoped-storage'
import { encryptWorkspaceInboxText } from '@/lib/workspace-inbox-crypto'

export type WorkspaceInboxMessageRecord = {
  id: string
  workspaceId: string
  senderName: string
  encryptedBody: string
  iv: string
  createdAt: string
}

export type WorkspaceInboxReadMap = Record<string, Record<string, string>>

type WorkspaceInboxStore = {
  messages: WorkspaceInboxMessageRecord[]
  reads: WorkspaceInboxReadMap
  hydrateFromRemote: () => Promise<void>
  listWorkspaceMessages: (workspaceId: string) => WorkspaceInboxMessageRecord[]
  refreshMessagesFromStorage: () => void
  refreshReadsFromStorage: () => void
  getWorkspaceLastReadAt: (workspaceId: string, readerName: string) => string | null
  getWorkspaceUnreadCount: (workspaceId: string, readerName: string) => number
  getWorkspaceFirstUnreadMessageId: (workspaceId: string, readerName: string) => string | null
  markWorkspaceRead: (input: {
    workspaceId: string
    readerName: string
    readAt?: string
  }) => string
  sendWorkspaceMessage: (input: {
    workspaceId: string
    senderName: string
    body: string
  }) => Promise<WorkspaceInboxMessageRecord>
}

export const INBOX_MESSAGES_STORAGE_KEY = 'aawe-workspace-inbox-messages-v1'
export const INBOX_READS_STORAGE_KEY = 'aawe-workspace-inbox-reads-v1'

function trimValue(value: string | null | undefined): string {
  return (value || '').trim()
}

function normalizeSenderName(value: string | null | undefined): string {
  return trimValue(value).replace(/\s+/g, ' ')
}

function normalizeReaderKey(value: string | null | undefined): string {
  return normalizeSenderName(value).toLowerCase()
}

function isSamePerson(left: string, right: string): boolean {
  return normalizeReaderKey(left) === normalizeReaderKey(right)
}

function nowIso(): string {
  return new Date().toISOString()
}

function buildMessageId(): string {
  return `msg-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
}

function normalizeMessageRecords(values: Array<Partial<WorkspaceInboxMessageRecord>>): WorkspaceInboxMessageRecord[] {
  return values
    .map((message) => ({
      id: trimValue(message.id) || buildMessageId(),
      workspaceId: trimValue(message.workspaceId),
      senderName: normalizeSenderName(message.senderName) || 'Unknown sender',
      encryptedBody: trimValue(message.encryptedBody),
      iv: trimValue(message.iv),
      createdAt: trimValue(message.createdAt) || nowIso(),
    }))
    .filter((message) => message.workspaceId && message.encryptedBody && message.iv)
}

function normalizeReadMap(value: WorkspaceInboxReadMap): WorkspaceInboxReadMap {
  const next: WorkspaceInboxReadMap = {}
  for (const [workspaceId, readerMap] of Object.entries(value || {})) {
    const cleanWorkspaceId = trimValue(workspaceId)
    if (!cleanWorkspaceId || !readerMap || typeof readerMap !== 'object') {
      continue
    }
    const nextReaderMap: Record<string, string> = {}
    for (const [readerName, timestamp] of Object.entries(readerMap)) {
      const readerKey = normalizeReaderKey(readerName)
      const readAt = trimValue(timestamp)
      if (!readerKey || !readAt || Number.isNaN(Date.parse(readAt))) {
        continue
      }
      nextReaderMap[readerKey] = readAt
    }
    if (Object.keys(nextReaderMap).length > 0) {
      next[cleanWorkspaceId] = nextReaderMap
    }
  }
  return next
}

function readStoredMessages(): WorkspaceInboxMessageRecord[] {
  if (typeof window === 'undefined') {
    return []
  }
  const raw = readScopedStorageItem(INBOX_MESSAGES_STORAGE_KEY)
  if (!raw) {
    return []
  }
  try {
    const parsed = JSON.parse(raw) as Array<Partial<WorkspaceInboxMessageRecord>>
    if (!Array.isArray(parsed)) {
      return []
    }
    return normalizeMessageRecords(parsed)
  } catch {
    return []
  }
}

function persistMessages(messages: WorkspaceInboxMessageRecord[]): void {
  if (typeof window === 'undefined') {
    return
  }
  writeScopedStorageItem(INBOX_MESSAGES_STORAGE_KEY, JSON.stringify(messages))
}

function readStoredReads(): WorkspaceInboxReadMap {
  if (typeof window === 'undefined') {
    return {}
  }
  const raw = readScopedStorageItem(INBOX_READS_STORAGE_KEY)
  if (!raw) {
    return {}
  }
  try {
    const parsed = JSON.parse(raw) as WorkspaceInboxReadMap
    if (!parsed || typeof parsed !== 'object') {
      return {}
    }
    return normalizeReadMap(parsed)
  } catch {
    return {}
  }
}

function persistReads(reads: WorkspaceInboxReadMap): void {
  if (typeof window === 'undefined') {
    return
  }
  writeScopedStorageItem(INBOX_READS_STORAGE_KEY, JSON.stringify(reads))
}

type WorkspaceInboxSnapshot = {
  messages: WorkspaceInboxMessageRecord[]
  reads: WorkspaceInboxReadMap
}

function persistInboxSnapshotLocal(snapshot: WorkspaceInboxSnapshot): void {
  persistMessages(snapshot.messages)
  persistReads(snapshot.reads)
}

function runRemoteInboxAction(action: (token: string) => Promise<unknown>): void {
  const token = getAuthSessionToken()
  if (!token) {
    return
  }
  void action(token).catch(() => {
    // Keep local state when remote mutation fails.
  })
}

function latestReadTimestamp(left: string | null, right: string | null): string | null {
  if (!left && !right) {
    return null
  }
  if (!left) {
    return right
  }
  if (!right) {
    return left
  }
  return Date.parse(left) >= Date.parse(right) ? left : right
}

const initialMessages = readStoredMessages()
const initialReads = readStoredReads()

export const useWorkspaceInboxStore = create<WorkspaceInboxStore>((set, get) => ({
  messages: initialMessages,
  reads: initialReads,
  hydrateFromRemote: async () => {
    const token = getAuthSessionToken()
    if (!token) {
      return
    }
    try {
      const [messages, reads] = await Promise.all([
        listWorkspaceInboxMessagesApi(token),
        listWorkspaceInboxReadsApi(token),
      ])
      const remote = { messages, reads }
      const normalizedMessages = normalizeMessageRecords(
        (remote.messages || []) as Array<Partial<WorkspaceInboxMessageRecord>>,
      ).sort((left, right) => Date.parse(left.createdAt) - Date.parse(right.createdAt))
      const normalizedReads = normalizeReadMap(remote.reads || {})

      const snapshot: WorkspaceInboxSnapshot = {
        messages: normalizedMessages,
        reads: normalizedReads,
      }
      persistInboxSnapshotLocal(snapshot)
      set(snapshot)
    } catch {
      // Keep local state when remote hydration fails.
    }
  },
  listWorkspaceMessages: (workspaceId) => {
    const cleanWorkspaceId = trimValue(workspaceId)
    if (!cleanWorkspaceId) {
      return []
    }
    return get()
      .messages
      .filter((message) => message.workspaceId === cleanWorkspaceId)
      .sort((left, right) => Date.parse(left.createdAt) - Date.parse(right.createdAt))
  },
  refreshMessagesFromStorage: () => {
    set({ messages: readStoredMessages() })
  },
  refreshReadsFromStorage: () => {
    set({ reads: readStoredReads() })
  },
  getWorkspaceLastReadAt: (workspaceId, readerName) => {
    const cleanWorkspaceId = trimValue(workspaceId)
    const readerKey = normalizeReaderKey(readerName)
    if (!cleanWorkspaceId || !readerKey) {
      return null
    }
    return get().reads[cleanWorkspaceId]?.[readerKey] || null
  },
  getWorkspaceUnreadCount: (workspaceId, readerName) => {
    const cleanWorkspaceId = trimValue(workspaceId)
    const cleanReader = normalizeSenderName(readerName)
    if (!cleanWorkspaceId || !cleanReader) {
      return 0
    }
    const lastReadAt = get().getWorkspaceLastReadAt(cleanWorkspaceId, cleanReader)
    const cutoff = lastReadAt ? Date.parse(lastReadAt) : Number.NEGATIVE_INFINITY
    return get()
      .messages
      .filter((message) => {
        if (message.workspaceId !== cleanWorkspaceId) {
          return false
        }
        if (isSamePerson(message.senderName, cleanReader)) {
          return false
        }
        return Date.parse(message.createdAt) > cutoff
      })
      .length
  },
  getWorkspaceFirstUnreadMessageId: (workspaceId, readerName) => {
    const cleanWorkspaceId = trimValue(workspaceId)
    const cleanReader = normalizeSenderName(readerName)
    if (!cleanWorkspaceId || !cleanReader) {
      return null
    }
    const lastReadAt = get().getWorkspaceLastReadAt(cleanWorkspaceId, cleanReader)
    const cutoff = lastReadAt ? Date.parse(lastReadAt) : Number.NEGATIVE_INFINITY
    const firstUnread = get()
      .messages
      .filter((message) => message.workspaceId === cleanWorkspaceId)
      .sort((left, right) => Date.parse(left.createdAt) - Date.parse(right.createdAt))
      .find((message) => !isSamePerson(message.senderName, cleanReader) && Date.parse(message.createdAt) > cutoff)
    return firstUnread?.id || null
  },
  markWorkspaceRead: ({ workspaceId, readerName, readAt }) => {
    const cleanWorkspaceId = trimValue(workspaceId)
    const readerKey = normalizeReaderKey(readerName)
    if (!cleanWorkspaceId || !readerKey) {
      return nowIso()
    }
    const nextReadAt = trimValue(readAt) || nowIso()
    const state = get()
    const existingReadAt = state.reads[cleanWorkspaceId]?.[readerKey] || null
    const resolvedReadAt = latestReadTimestamp(existingReadAt, nextReadAt) || nextReadAt
    if (existingReadAt === resolvedReadAt) {
      return resolvedReadAt
    }
    const nextReads: WorkspaceInboxReadMap = {
      ...state.reads,
      [cleanWorkspaceId]: {
        ...(state.reads[cleanWorkspaceId] || {}),
        [readerKey]: resolvedReadAt,
      },
    }
    persistInboxSnapshotLocal({ messages: state.messages, reads: nextReads })
    set({ reads: nextReads })
    runRemoteInboxAction((token) =>
      markWorkspaceInboxReadApi(token, {
        workspaceId: cleanWorkspaceId,
        readerName,
        readAt: resolvedReadAt,
      }),
    )
    return resolvedReadAt
  },
  sendWorkspaceMessage: async ({ workspaceId, senderName, body }) => {
    const cleanWorkspaceId = trimValue(workspaceId)
    const cleanSenderName = normalizeSenderName(senderName) || 'Unknown sender'
    const cleanBody = trimValue(body)
    if (!cleanWorkspaceId) {
      throw new Error('Workspace id is required.')
    }
    if (!cleanBody) {
      throw new Error('Message cannot be empty.')
    }

    const encrypted = await encryptWorkspaceInboxText(cleanWorkspaceId, cleanBody)
    const nextMessage: WorkspaceInboxMessageRecord = {
      id: buildMessageId(),
      workspaceId: cleanWorkspaceId,
      senderName: cleanSenderName,
      encryptedBody: encrypted.ciphertext,
      iv: encrypted.iv,
      createdAt: nowIso(),
    }
    const state = get()
    const nextMessages = [...state.messages, nextMessage]
    const readerKey = normalizeReaderKey(cleanSenderName)
    const existingReadAt = state.reads[cleanWorkspaceId]?.[readerKey] || null
    const resolvedReadAt = latestReadTimestamp(existingReadAt, nextMessage.createdAt)
    const nextReads: WorkspaceInboxReadMap =
      resolvedReadAt
        ? {
            ...state.reads,
            [cleanWorkspaceId]: {
              ...(state.reads[cleanWorkspaceId] || {}),
              [readerKey]: resolvedReadAt,
            },
          }
        : state.reads
    persistInboxSnapshotLocal({ messages: nextMessages, reads: nextReads })
    set({ messages: nextMessages, reads: nextReads })
    runRemoteInboxAction((token) => createWorkspaceInboxMessageApi(token, nextMessage))
    return nextMessage
  },
}))
