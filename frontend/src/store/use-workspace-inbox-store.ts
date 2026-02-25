import { create } from 'zustand'

import { encryptWorkspaceInboxText } from '@/lib/workspace-inbox-crypto'

export type WorkspaceInboxMessageRecord = {
  id: string
  workspaceId: string
  senderName: string
  encryptedBody: string
  iv: string
  createdAt: string
}

type WorkspaceInboxStore = {
  messages: WorkspaceInboxMessageRecord[]
  listWorkspaceMessages: (workspaceId: string) => WorkspaceInboxMessageRecord[]
  refreshMessagesFromStorage: () => void
  sendWorkspaceMessage: (input: {
    workspaceId: string
    senderName: string
    body: string
  }) => Promise<WorkspaceInboxMessageRecord>
}

export const INBOX_MESSAGES_STORAGE_KEY = 'aawe-workspace-inbox-messages-v1'

function trimValue(value: string | null | undefined): string {
  return (value || '').trim()
}

function normalizeSenderName(value: string | null | undefined): string {
  return trimValue(value).replace(/\s+/g, ' ')
}

function nowIso(): string {
  return new Date().toISOString()
}

function buildMessageId(): string {
  return `msg-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
}

function readStoredMessages(): WorkspaceInboxMessageRecord[] {
  if (typeof window === 'undefined') {
    return []
  }
  const raw = window.localStorage.getItem(INBOX_MESSAGES_STORAGE_KEY)
  if (!raw) {
    return []
  }
  try {
    const parsed = JSON.parse(raw) as Array<Partial<WorkspaceInboxMessageRecord>>
    if (!Array.isArray(parsed)) {
      return []
    }
    return parsed
      .map((message) => ({
        id: trimValue(message.id) || buildMessageId(),
        workspaceId: trimValue(message.workspaceId),
        senderName: normalizeSenderName(message.senderName) || 'Unknown sender',
        encryptedBody: trimValue(message.encryptedBody),
        iv: trimValue(message.iv),
        createdAt: trimValue(message.createdAt) || nowIso(),
      }))
      .filter((message) => message.workspaceId && message.encryptedBody && message.iv)
  } catch {
    return []
  }
}

function persistMessages(messages: WorkspaceInboxMessageRecord[]): void {
  if (typeof window === 'undefined') {
    return
  }
  window.localStorage.setItem(INBOX_MESSAGES_STORAGE_KEY, JSON.stringify(messages))
}

const initialMessages = readStoredMessages()

export const useWorkspaceInboxStore = create<WorkspaceInboxStore>((set, get) => ({
  messages: initialMessages,
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
    persistMessages(nextMessages)
    set({ messages: nextMessages })
    return nextMessage
  },
}))
