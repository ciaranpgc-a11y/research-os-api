import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useParams, useSearchParams } from 'react-router-dom'

import { TopBar } from '@/components/layout/top-bar'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { API_BASE_URL } from '@/lib/api'
import { getAuthSessionToken } from '@/lib/auth-session'
import { decryptWorkspaceInboxText } from '@/lib/workspace-inbox-crypto'
import { houseForms, houseLayout, houseNavigation, houseSurfaces, houseTypography } from '@/lib/house-style'
import { getHouseLeftBorderToneClass, getHouseNavToneClass } from '@/lib/section-tone'
import { matchesScopedStorageEventKey } from '@/lib/user-scoped-storage'
import { readWorkspaceOwnerNameFromProfile, WORKSPACE_OWNER_REQUIRED_MESSAGE } from '@/lib/workspace-owner'
import { cn } from '@/lib/utils'
import {
  INBOX_MESSAGES_STORAGE_KEY,
  INBOX_READS_STORAGE_KEY,
  useWorkspaceInboxStore,
} from '@/store/use-workspace-inbox-store'
import { type WorkspaceRecord, useWorkspaceStore } from '@/store/use-workspace-store'

type FilterKey = 'all' | 'active' | 'pinned' | 'archived' | 'recent'
type ParticipantFilterKey = 'all' | 'online'
type InboxMainView = 'conversation' | 'all-conversations'

type DecryptedInboxMessage = {
  id: string
  senderName: string
  body: string
  createdAt: string
}

type TypingMapRecord = Record<string, Record<string, string>>
type InboxRealtimeEventType = 'typing' | 'message_sent' | 'read_marked' | 'presence'
type RealtimeConnectionState = 'offline' | 'connecting' | 'connected' | 'reconnecting'
type PresenceMapRecord = Record<string, Record<string, boolean>>

type WorkspaceThreadSummary = {
  workspaceId: string
  workspaceName: string
  ownerName: string
  collaboratorCount: number
  unreadCount: number
  messageCount: number
  lastActivityAt: string | null
}

type TextMatchRange = {
  start: number
  end: number
}

type MessageSearchMatch = {
  messageId: string
  ranges: TextMatchRange[]
}

type InboxRealtimeEvent = {
  type: InboxRealtimeEventType
  workspace_id: string
  sender_name?: string
  active?: boolean
  message_id?: string
  created_at?: string
  reader_name?: string
  read_at?: string
  status?: 'joined' | 'left'
}

type SpeechRecognitionLike = {
  continuous: boolean
  interimResults: boolean
  lang: string
  onresult: ((event: unknown) => void) | null
  onerror: ((event: unknown) => void) | null
  onend: (() => void) | null
  start: () => void
  stop: () => void
}

type SpeechRecognitionConstructor = new () => SpeechRecognitionLike

type WindowWithSpeechRecognition = Window & {
  SpeechRecognition?: SpeechRecognitionConstructor
  webkitSpeechRecognition?: SpeechRecognitionConstructor
}

const INBOX_TYPING_STORAGE_KEY = 'aawe-workspace-inbox-typing-v1'
const TYPING_STALE_MS = 5000
const TYPING_HEARTBEAT_MS = 1200
const DEFAULT_REALTIME_RECONNECT_DELAY_MS = 1500
const DEFAULT_REALTIME_FALLBACK_SYNC_MS = 30000

function resolveRealtimeIntervalMs(
  rawValue: string | undefined,
  fallback: number,
  min: number,
  max: number,
): number {
  const parsed = Number(rawValue || '')
  if (!Number.isFinite(parsed)) {
    return fallback
  }
  const normalized = Math.trunc(parsed)
  if (normalized < min || normalized > max) {
    return fallback
  }
  return normalized
}

const REALTIME_RECONNECT_DELAY_MS = resolveRealtimeIntervalMs(
  import.meta.env.VITE_WORKSPACE_INBOX_WS_RECONNECT_DELAY_MS,
  DEFAULT_REALTIME_RECONNECT_DELAY_MS,
  250,
  60000,
)
const REALTIME_FALLBACK_SYNC_MS = resolveRealtimeIntervalMs(
  import.meta.env.VITE_WORKSPACE_INBOX_FALLBACK_SYNC_MS,
  DEFAULT_REALTIME_FALLBACK_SYNC_MS,
  5000,
  300000,
)
const FILTER_OPTIONS: Array<{ key: FilterKey; label: string }> = [
  { key: 'all', label: 'All' },
  { key: 'active', label: 'Active' },
  { key: 'pinned', label: 'Pinned' },
  { key: 'recent', label: 'Recent (14 days)' },
  { key: 'archived', label: 'Archived' },
]
const HOUSE_LEFT_BORDER_WORKSPACE_CLASS = getHouseLeftBorderToneClass('workspace')
const HOUSE_NAV_ITEM_WORKSPACE_CLASS = getHouseNavToneClass('workspace')
const HOUSE_NAV_ITEM_GOVERNANCE_CLASS = getHouseNavToneClass('governance')
const HOUSE_NAV_ITEM_DATA_CLASS = getHouseNavToneClass('data')

function buildWorkspaceInboxWsUrl(input: { workspaceId: string }): string {
  const base = API_BASE_URL.replace(/\/+$/, '')
  const wsBase = base.replace(/^http/i, 'ws')
  const query = new URLSearchParams({
    workspace_id: input.workspaceId,
  })
  return `${wsBase}/v1/workspaces/inbox/ws?${query.toString()}`
}

function buildWorkspaceInboxWsProtocols(token: string): string[] {
  const clean = token.trim()
  if (!clean) {
    return ['aawe-realtime-v1']
  }
  return ['aawe-realtime-v1', `aawe-session.${clean}`]
}

function formatTimestamp(value: string): string {
  const parsed = Date.parse(value)
  if (Number.isNaN(parsed)) {
    return 'Not available'
  }
  return new Date(parsed).toLocaleString('en-GB', {
    year: 'numeric',
    month: 'short',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function isRecentWorkspace(value: string): boolean {
  const parsed = Date.parse(value)
  if (Number.isNaN(parsed)) {
    return false
  }
  const fourteenDaysMs = 14 * 24 * 60 * 60 * 1000
  return Date.now() - parsed <= fourteenDaysMs
}

function normalizeName(value: string | null | undefined): string {
  return (value || '').trim().replace(/\s+/g, ' ')
}

function isSamePerson(left: string, right: string): boolean {
  return normalizeName(left).toLowerCase() === normalizeName(right).toLowerCase()
}

function hasWorkspaceInboxWriteAccess(
  workspace: WorkspaceRecord | null,
  currentUserName: string,
): boolean {
  if (!workspace) {
    return false
  }
  const currentUserKey = normalizeName(currentUserName).toLowerCase()
  if (!currentUserKey) {
    return false
  }
  const ownerKey = normalizeName(workspace.ownerName).toLowerCase()
  if (ownerKey && ownerKey === currentUserKey) {
    return true
  }
  const collaboratorKeys = new Set((workspace.collaborators || []).map((value) => normalizeName(value).toLowerCase()))
  if (!collaboratorKeys.has(currentUserKey)) {
    return false
  }
  const removedKeys = new Set((workspace.removedCollaborators || []).map((value) => normalizeName(value).toLowerCase()))
  return !removedKeys.has(currentUserKey)
}

const INBOX_READ_ONLY_MESSAGE = 'This inbox is read-only for your current workspace access.'

function sanitizeReturnTo(value: string | null): string | null {
  const clean = (value || '').trim()
  if (!clean.startsWith('/workspaces')) {
    return null
  }
  return clean
}

function sanitizeParticipantFilter(value: string | null): ParticipantFilterKey {
  return (value || '').trim().toLowerCase() === 'online' ? 'online' : 'all'
}

function sanitizeInboxMainView(value: string | null): InboxMainView {
  return (value || '').trim().toLowerCase() === 'all-conversations'
    ? 'all-conversations'
    : 'conversation'
}

function hashSender(value: string): number {
  const clean = normalizeName(value)
  let hash = 0
  for (let index = 0; index < clean.length; index += 1) {
    hash = (hash * 31 + clean.charCodeAt(index)) | 0
  }
  return Math.abs(hash)
}

function participantTone(senderName: string, currentUserName: string): {
  dotClass: string
  bubbleClass: string
} {
  if (isSamePerson(senderName, currentUserName)) {
    return {
      dotClass: 'bg-[hsl(var(--tone-accent-500))]',
      bubbleClass: 'border-[hsl(var(--tone-accent-200))] bg-[hsl(var(--tone-accent-50))] text-[hsl(var(--tone-accent-900))]',
    }
  }
  const palette = [
    {
      dotClass: 'bg-[hsl(var(--tone-positive-500))]',
      bubbleClass: 'border-[hsl(var(--tone-positive-200))] bg-[hsl(var(--tone-positive-50))] text-[hsl(var(--tone-positive-800))]',
    },
    {
      dotClass: 'bg-[hsl(var(--tone-warning-500))]',
      bubbleClass: 'border-[hsl(var(--tone-warning-200))] bg-[hsl(var(--tone-warning-50))] text-[hsl(var(--tone-warning-800))]',
    },
    {
      dotClass: 'bg-[hsl(var(--tone-danger-500))]',
      bubbleClass: 'border-[hsl(var(--tone-danger-200))] bg-[hsl(var(--tone-danger-50))] text-[hsl(var(--tone-danger-800))]',
    },
    {
      dotClass: 'bg-[hsl(var(--tone-neutral-500))]',
      bubbleClass: 'border-[hsl(var(--tone-neutral-200))] bg-[hsl(var(--tone-neutral-100))] text-[hsl(var(--tone-neutral-800))]',
    },
  ] as const

  return palette[hashSender(senderName) % palette.length]
}

function readTypingMap(): TypingMapRecord {
  if (typeof window === 'undefined') {
    return {}
  }
  const raw = window.localStorage.getItem(INBOX_TYPING_STORAGE_KEY)
  if (!raw) {
    return {}
  }
  try {
    const parsed = JSON.parse(raw) as TypingMapRecord
    return typeof parsed === 'object' && parsed ? parsed : {}
  } catch {
    return {}
  }
}

function pruneTypingMap(value: TypingMapRecord, nowMs = Date.now()): TypingMapRecord {
  const next: TypingMapRecord = {}
  for (const [workspaceId, senders] of Object.entries(value)) {
    const nextSenders: Record<string, string> = {}
    for (const [senderName, timestamp] of Object.entries(senders || {})) {
      const parsed = Date.parse(timestamp)
      if (Number.isNaN(parsed)) {
        continue
      }
      if (nowMs - parsed <= TYPING_STALE_MS) {
        nextSenders[senderName] = timestamp
      }
    }
    if (Object.keys(nextSenders).length > 0) {
      next[workspaceId] = nextSenders
    }
  }
  return next
}

function writeTypingMap(value: TypingMapRecord): void {
  if (typeof window === 'undefined') {
    return
  }
  window.localStorage.setItem(INBOX_TYPING_STORAGE_KEY, JSON.stringify(value))
}

function appendTranscript(current: string, transcript: string): string {
  const cleanTranscript = transcript.trim()
  if (!cleanTranscript) {
    return current
  }
  if (!current.trim()) {
    return cleanTranscript
  }
  return `${current.trimEnd()} ${cleanTranscript}`
}

function findTextMatchRanges(text: string, normalizedQuery: string): TextMatchRange[] {
  if (!normalizedQuery) {
    return []
  }
  const lowerText = text.toLowerCase()
  const ranges: TextMatchRange[] = []
  let searchFromIndex = 0

  while (searchFromIndex < lowerText.length) {
    const foundAt = lowerText.indexOf(normalizedQuery, searchFromIndex)
    if (foundAt < 0) {
      break
    }
    ranges.push({
      start: foundAt,
      end: foundAt + normalizedQuery.length,
    })
    searchFromIndex = foundAt + normalizedQuery.length
  }

  return ranges
}

function renderTextWithHighlights(text: string, ranges: TextMatchRange[]) {
  if (ranges.length === 0) {
    return text
  }
  const output: Array<string | JSX.Element> = []
  let cursor = 0

  for (const range of ranges) {
    if (range.start > cursor) {
      output.push(text.slice(cursor, range.start))
    }
    output.push(
      <mark
        key={`${range.start}-${range.end}`}
        className="rounded bg-[hsl(var(--tone-warning-100))] px-0.5 text-[hsl(var(--tone-warning-900))]"
      >
        {text.slice(range.start, range.end)}
      </mark>,
    )
    cursor = range.end
  }
  if (cursor < text.length) {
    output.push(text.slice(cursor))
  }

  return output
}

export function WorkspaceInboxPage() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const params = useParams<{ workspaceId: string }>()
  const workspaceId = (params.workspaceId || '').trim()
  const ensureWorkspace = useWorkspaceStore((state) => state.ensureWorkspace)
  const setActiveWorkspaceId = useWorkspaceStore((state) => state.setActiveWorkspaceId)
  const createWorkspace = useWorkspaceStore((state) => state.createWorkspace)
  const workspaces = useWorkspaceStore((state) => state.workspaces)
  const authorRequests = useWorkspaceStore((state) => state.authorRequests)
  const invitationsSent = useWorkspaceStore((state) => state.invitationsSent)
  const hydrateWorkspaceStoreFromRemote = useWorkspaceStore((state) => state.hydrateFromRemote)
  const sendWorkspaceMessage = useWorkspaceInboxStore((state) => state.sendWorkspaceMessage)
  const hydrateWorkspaceInboxFromRemote = useWorkspaceInboxStore((state) => state.hydrateFromRemote)
  const refreshMessagesFromStorage = useWorkspaceInboxStore((state) => state.refreshMessagesFromStorage)
  const refreshReadsFromStorage = useWorkspaceInboxStore((state) => state.refreshReadsFromStorage)
  const markWorkspaceRead = useWorkspaceInboxStore((state) => state.markWorkspaceRead)
  const reads = useWorkspaceInboxStore((state) => state.reads)
  const allMessages = useWorkspaceInboxStore((state) => state.messages)
  const encryptedMessages = useMemo(
    () =>
      allMessages
        .filter((message) => message.workspaceId === workspaceId)
        .sort((left, right) => Date.parse(left.createdAt) - Date.parse(right.createdAt)),
    [allMessages, workspaceId],
  )
  const workspace = workspaces.find((item) => item.id === workspaceId) || null
  const currentUserName = useMemo(
    () => normalizeName(readWorkspaceOwnerNameFromProfile() || 'You'),
    [],
  )
  const canContributeToWorkspaceInbox = useMemo(
    () => hasWorkspaceInboxWriteAccess(workspace, currentUserName),
    [currentUserName, workspace],
  )
  const participants = useMemo(() => {
    const output: string[] = []
    const pushUnique = (value: string) => {
      const clean = normalizeName(value)
      if (!clean || output.some((item) => isSamePerson(item, clean))) {
        return
      }
      output.push(clean)
    }
    pushUnique(workspace?.ownerName || '')
    workspace?.collaborators.forEach(pushUnique)
    pushUnique(currentUserName)
    return output
  }, [currentUserName, workspace])

  const [workspaceOwnerName, setWorkspaceOwnerName] = useState<string | null>(() =>
    readWorkspaceOwnerNameFromProfile(),
  )
  const [draft, setDraft] = useState('')
  const [messages, setMessages] = useState<DecryptedInboxMessage[]>([])
  const [, setTypingMap] = useState<TypingMapRecord>(() => pruneTypingMap(readTypingMap()))
  const [loadingMessages, setLoadingMessages] = useState(false)
  const [sending, setSending] = useState(false)
  const [dictating, setDictating] = useState(false)
  const [dictationSupported, setDictationSupported] = useState(false)
  const [realtimeConnectionState, setRealtimeConnectionState] = useState<RealtimeConnectionState>('offline')
  const [presenceMap, setPresenceMap] = useState<PresenceMapRecord>({})
  const [participantFilter, setParticipantFilter] = useState<ParticipantFilterKey>(() =>
    sanitizeParticipantFilter(searchParams.get('participants')),
  )
  const [rightNavCollapsed, setRightNavCollapsed] = useState(false)
  const [conversationSearchQuery, setConversationSearchQuery] = useState('')
  const [messageSearchQuery, setMessageSearchQuery] = useState('')
  const [activeMessageSearchIndex, setActiveMessageSearchIndex] = useState(0)
  const [status, setStatus] = useState('')
  const [error, setError] = useState('')
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null)
  const conversationRef = useRef<HTMLDivElement | null>(null)
  const composerRef = useRef<HTMLTextAreaElement | null>(null)
  const unreadAnchorHandledRef = useRef(false)
  const realtimeSocketRef = useRef<WebSocket | null>(null)
  const realtimeHasConnectedRef = useRef(false)
  const lastBroadcastReadAtRef = useRef<string | null>(null)

  useEffect(() => {
    void hydrateWorkspaceStoreFromRemote()
    void hydrateWorkspaceInboxFromRemote()
  }, [hydrateWorkspaceInboxFromRemote, hydrateWorkspaceStoreFromRemote])

  useEffect(() => {
    if (!workspaceId) {
      return
    }
    ensureWorkspace(workspaceId)
    setActiveWorkspaceId(workspaceId)
  }, [ensureWorkspace, setActiveWorkspaceId, workspaceId])

  useEffect(() => {
    const refreshOwner = () => {
      setWorkspaceOwnerName(readWorkspaceOwnerNameFromProfile())
    }
    window.addEventListener('storage', refreshOwner)
    window.addEventListener('focus', refreshOwner)
    return () => {
      window.removeEventListener('storage', refreshOwner)
      window.removeEventListener('focus', refreshOwner)
    }
  }, [])

  const returnToPath = useMemo(
    () => sanitizeReturnTo(searchParams.get('returnTo')),
    [searchParams],
  )
  const inboxMainView = useMemo(
    () => sanitizeInboxMainView(searchParams.get('inboxView')),
    [searchParams],
  )
  const isAllConversationsView = inboxMainView === 'all-conversations'
  const shouldAnchorFirstUnread = searchParams.get('at') === 'first-unread'
  useEffect(() => {
    setParticipantFilter(sanitizeParticipantFilter(searchParams.get('participants')))
  }, [searchParams])
  useEffect(() => {
    setMessageSearchQuery('')
    setActiveMessageSearchIndex(0)
  }, [workspaceId, isAllConversationsView])
  const readerKey = useMemo(
    () => normalizeName(currentUserName).toLowerCase(),
    [currentUserName],
  )
  const lastReadAt = useMemo(
    () => reads[workspaceId]?.[readerKey] || null,
    [readerKey, reads, workspaceId],
  )
  const unreadCount = useMemo(() => {
    const cutoff = lastReadAt ? Date.parse(lastReadAt) : Number.NEGATIVE_INFINITY
    return allMessages.filter((message) => {
      if (message.workspaceId !== workspaceId) {
        return false
      }
      if (normalizeName(message.senderName).toLowerCase() === readerKey) {
        return false
      }
      return Date.parse(message.createdAt) > cutoff
    }).length
  }, [allMessages, lastReadAt, readerKey, workspaceId])
  const firstUnreadMessageId = useMemo(() => {
    const cutoffMs = lastReadAt ? Date.parse(lastReadAt) : Number.NEGATIVE_INFINITY
    return (
      messages.find(
        (message) =>
          !isSamePerson(message.senderName, currentUserName) &&
          Date.parse(message.createdAt) > cutoffMs,
      )?.id || null
    )
  }, [currentUserName, lastReadAt, messages])
  const normalizedMessageSearchQuery = useMemo(
    () => normalizeName(messageSearchQuery).toLowerCase(),
    [messageSearchQuery],
  )
  const messageSearchMatches = useMemo<MessageSearchMatch[]>(
    () => {
      if (isAllConversationsView || !normalizedMessageSearchQuery) {
        return []
      }
      const matches: MessageSearchMatch[] = []
      messages.forEach((message) => {
        const ranges = findTextMatchRanges(message.body, normalizedMessageSearchQuery)
        if (ranges.length === 0) {
          return
        }
        matches.push({
          messageId: message.id,
          ranges,
        })
      })
      return matches
    },
    [isAllConversationsView, messages, normalizedMessageSearchQuery],
  )
  const messageSearchRangesByMessageId = useMemo(
    () => new Map(messageSearchMatches.map((match) => [match.messageId, match.ranges])),
    [messageSearchMatches],
  )
  const messageSearchMatchCount = messageSearchMatches.length
  const activeSearchMatchIndex = messageSearchMatchCount === 0
    ? -1
    : Math.min(activeMessageSearchIndex, messageSearchMatchCount - 1)
  const activeSearchMessageId = activeSearchMatchIndex >= 0
    ? messageSearchMatches[activeSearchMatchIndex].messageId
    : null
  const searchResultLabel = normalizedMessageSearchQuery
    ? (messageSearchMatchCount === 0
      ? 'No matches'
      : `${activeSearchMatchIndex + 1} of ${messageSearchMatchCount}`)
    : ''

  useEffect(() => {
    unreadAnchorHandledRef.current = false
  }, [workspaceId, shouldAnchorFirstUnread])

  const publishRealtimeEvent = useCallback((event: InboxRealtimeEvent) => {
    const socket = realtimeSocketRef.current
    if (!socket || socket.readyState !== WebSocket.OPEN) {
      return
    }
    try {
      socket.send(JSON.stringify(event))
    } catch {
      // Ignore transient realtime send failures and rely on API persistence.
    }
  }, [])

  const setParticipantPresence = useCallback((input: {
    workspaceId: string
    participantName: string
    online: boolean
  }) => {
    const cleanWorkspaceId = normalizeName(input.workspaceId)
    const cleanParticipantName = normalizeName(input.participantName)
    if (!cleanWorkspaceId || !cleanParticipantName) {
      return
    }
    const participantKey = cleanParticipantName.toLowerCase()
    setPresenceMap((current) => {
      const workspacePresence = current[cleanWorkspaceId] || {}
      if (workspacePresence[participantKey] === input.online) {
        return current
      }
      const next: PresenceMapRecord = { ...current }
      next[cleanWorkspaceId] = {
        ...workspacePresence,
        [participantKey]: input.online,
      }
      return next
    })
  }, [])

  const applyRemoteTypingEvent = useCallback((event: InboxRealtimeEvent) => {
    if (event.type !== 'typing') {
      return
    }
    const eventWorkspaceId = normalizeName(event.workspace_id)
    const senderName = normalizeName(event.sender_name)
    if (!eventWorkspaceId || !senderName) {
      return
    }
    if (eventWorkspaceId !== workspaceId) {
      return
    }
    if (isSamePerson(senderName, currentUserName)) {
      return
    }
    const current = pruneTypingMap(readTypingMap())
    const next: TypingMapRecord = { ...current }
    const workspaceTyping = { ...(next[eventWorkspaceId] || {}) }
    if (event.active) {
      workspaceTyping[senderName] = new Date().toISOString()
      next[eventWorkspaceId] = workspaceTyping
    } else {
      delete workspaceTyping[senderName]
      if (Object.keys(workspaceTyping).length === 0) {
        delete next[eventWorkspaceId]
      } else {
        next[eventWorkspaceId] = workspaceTyping
      }
    }
    writeTypingMap(next)
    setTypingMap(next)
  }, [currentUserName, workspaceId])

  const applyRemotePresenceEvent = useCallback((event: InboxRealtimeEvent) => {
    if (event.type !== 'presence') {
      return
    }
    const eventWorkspaceId = normalizeName(event.workspace_id)
    const senderName = normalizeName(event.sender_name)
    if (!eventWorkspaceId || !senderName) {
      return
    }
    if (eventWorkspaceId !== workspaceId) {
      return
    }
    const isOnline = event.status === 'joined'
    setParticipantPresence({
      workspaceId: eventWorkspaceId,
      participantName: senderName,
      online: isOnline,
    })
  }, [setParticipantPresence, workspaceId])

  const publishTypingState = useCallback((typing: boolean) => {
    if (!workspaceId || !currentUserName) {
      return
    }
    const current = pruneTypingMap(readTypingMap())
    const next: TypingMapRecord = { ...current }
    const workspaceTyping = { ...(next[workspaceId] || {}) }
    if (typing) {
      workspaceTyping[currentUserName] = new Date().toISOString()
      next[workspaceId] = workspaceTyping
    } else {
      delete workspaceTyping[currentUserName]
      if (Object.keys(workspaceTyping).length === 0) {
        delete next[workspaceId]
      } else {
        next[workspaceId] = workspaceTyping
      }
    }
    writeTypingMap(next)
    setTypingMap(next)
    publishRealtimeEvent({
      type: 'typing',
      workspace_id: workspaceId,
      sender_name: currentUserName,
      active: typing,
    })
  }, [currentUserName, publishRealtimeEvent, workspaceId])

  useEffect(() => {
    let cancelled = false

    const load = async () => {
      setLoadingMessages(true)
      try {
        const decrypted = await Promise.all(
          encryptedMessages.map(async (message) => {
            try {
              const body = await decryptWorkspaceInboxText(message.workspaceId, {
                ciphertext: message.encryptedBody,
                iv: message.iv,
              })
              return {
                id: message.id,
                senderName: message.senderName,
                body,
                createdAt: message.createdAt,
              } satisfies DecryptedInboxMessage
            } catch {
              return {
                id: message.id,
                senderName: message.senderName,
                body: '[Encrypted message could not be decrypted]',
                createdAt: message.createdAt,
              } satisfies DecryptedInboxMessage
            }
          }),
        )
        if (!cancelled) {
          setMessages(decrypted)
        }
      } finally {
        if (!cancelled) {
          setLoadingMessages(false)
        }
      }
    }

    void load()

    return () => {
      cancelled = true
    }
  }, [encryptedMessages])

  useEffect(() => {
    const element = conversationRef.current
    if (!element) {
      return
    }
    if (normalizedMessageSearchQuery) {
      return
    }
    if (shouldAnchorFirstUnread && firstUnreadMessageId && !unreadAnchorHandledRef.current) {
      return
    }
    element.scrollTop = element.scrollHeight
  }, [firstUnreadMessageId, messages, normalizedMessageSearchQuery, shouldAnchorFirstUnread])

  useEffect(() => {
    if (!shouldAnchorFirstUnread || unreadAnchorHandledRef.current || !firstUnreadMessageId) {
      return
    }
    const target = document.getElementById(`inbox-message-${firstUnreadMessageId}`)
    if (!target) {
      return
    }
    target.scrollIntoView({ block: 'center' })
    unreadAnchorHandledRef.current = true
  }, [firstUnreadMessageId, shouldAnchorFirstUnread])

  useEffect(() => {
    if (activeMessageSearchIndex < 0) {
      setActiveMessageSearchIndex(0)
      return
    }
    if (messageSearchMatchCount === 0) {
      return
    }
    if (activeMessageSearchIndex >= messageSearchMatchCount) {
      setActiveMessageSearchIndex(messageSearchMatchCount - 1)
    }
  }, [activeMessageSearchIndex, messageSearchMatchCount])

  useEffect(() => {
    if (!normalizedMessageSearchQuery || !activeSearchMessageId) {
      return
    }
    const target = document.getElementById(`inbox-message-${activeSearchMessageId}`)
    if (!target) {
      return
    }
    target.scrollIntoView({ block: 'center', behavior: 'smooth' })
  }, [activeSearchMessageId, normalizedMessageSearchQuery])

  useEffect(() => {
    if (typeof window === 'undefined') {
      return
    }
    const onStorage = (event: StorageEvent) => {
      if (matchesScopedStorageEventKey(event.key, INBOX_MESSAGES_STORAGE_KEY)) {
        refreshMessagesFromStorage()
      }
      if (matchesScopedStorageEventKey(event.key, INBOX_READS_STORAGE_KEY)) {
        refreshReadsFromStorage()
      }
      if (event.key === INBOX_TYPING_STORAGE_KEY) {
        setTypingMap(pruneTypingMap(readTypingMap()))
      }
    }
    window.addEventListener('storage', onStorage)
    return () => {
      window.removeEventListener('storage', onStorage)
    }
  }, [refreshMessagesFromStorage, refreshReadsFromStorage])

  useEffect(() => {
    if (typeof window === 'undefined') {
      return
    }
    const timer = window.setInterval(() => {
      setTypingMap(pruneTypingMap(readTypingMap()))
    }, TYPING_HEARTBEAT_MS)
    return () => {
      window.clearInterval(timer)
    }
  }, [])

  useEffect(() => {
    if (!canContributeToWorkspaceInbox) {
      publishTypingState(false)
      return
    }
    const hasDraft = draft.trim().length > 0 || dictating
    publishTypingState(hasDraft)
    if (!hasDraft) {
      return
    }
    const timer = window.setInterval(() => {
      publishTypingState(true)
    }, TYPING_HEARTBEAT_MS)
    return () => {
      window.clearInterval(timer)
    }
  }, [canContributeToWorkspaceInbox, dictating, draft, publishTypingState])

  useEffect(() => {
    return () => {
      publishTypingState(false)
    }
  }, [publishTypingState])

  useEffect(() => {
    if (typeof window === 'undefined' || !workspaceId || !canContributeToWorkspaceInbox) {
      setRealtimeConnectionState('offline')
      return
    }

    realtimeHasConnectedRef.current = false
    let cancelled = false
    let reconnectTimer: number | null = null

    const connect = () => {
      if (cancelled) {
        return
      }
      const token = getAuthSessionToken()
      if (!token) {
        setRealtimeConnectionState('offline')
        return
      }
      setRealtimeConnectionState(realtimeHasConnectedRef.current ? 'reconnecting' : 'connecting')
      const socket = new WebSocket(
        buildWorkspaceInboxWsUrl({
          workspaceId,
        }),
        buildWorkspaceInboxWsProtocols(token),
      )
      realtimeSocketRef.current = socket
      socket.onopen = () => {
        realtimeHasConnectedRef.current = true
        setRealtimeConnectionState('connected')
      }

      socket.onmessage = (rawEvent) => {
        let parsed: unknown = null
        try {
          parsed = JSON.parse(String(rawEvent.data || ''))
        } catch {
          return
        }
        if (!parsed || typeof parsed !== 'object') {
          return
        }
        const event = parsed as Partial<InboxRealtimeEvent>
        const eventType = normalizeName(event.type).toLowerCase()
        const eventSenderName = normalizeName(event.sender_name)
        if (eventType !== 'presence' && eventSenderName && normalizeName(event.workspace_id) === workspaceId) {
          setParticipantPresence({
            workspaceId,
            participantName: eventSenderName,
            online: true,
          })
        }
        if (eventType === 'presence') {
          applyRemotePresenceEvent(event as InboxRealtimeEvent)
          return
        }
        if (eventType === 'typing') {
          applyRemoteTypingEvent(event as InboxRealtimeEvent)
          return
        }
        if (eventType === 'message_sent' || eventType === 'read_marked') {
          void hydrateWorkspaceInboxFromRemote()
        }
      }

      socket.onclose = () => {
        if (realtimeSocketRef.current === socket) {
          realtimeSocketRef.current = null
        }
        if (cancelled) {
          return
        }
        const hasToken = Boolean(getAuthSessionToken())
        setRealtimeConnectionState(hasToken ? 'reconnecting' : 'offline')
        reconnectTimer = window.setTimeout(connect, REALTIME_RECONNECT_DELAY_MS)
      }

      socket.onerror = () => {
        setRealtimeConnectionState('reconnecting')
        try {
          socket.close()
        } catch {
          // Ignore close errors after failed websocket writes.
        }
      }
    }

    connect()

    return () => {
      cancelled = true
      if (reconnectTimer !== null) {
        window.clearTimeout(reconnectTimer)
      }
      const socket = realtimeSocketRef.current
      realtimeSocketRef.current = null
      setRealtimeConnectionState('offline')
      if (socket && (socket.readyState === WebSocket.CONNECTING || socket.readyState === WebSocket.OPEN)) {
        try {
          socket.close()
        } catch {
          // Ignore close errors during unmount.
        }
      }
    }
  }, [applyRemotePresenceEvent, applyRemoteTypingEvent, canContributeToWorkspaceInbox, hydrateWorkspaceInboxFromRemote, setParticipantPresence, workspaceId])

  useEffect(() => {
    if (typeof window === 'undefined' || !workspaceId || !canContributeToWorkspaceInbox) {
      return
    }
    if (realtimeConnectionState === 'connected') {
      return
    }
    const token = getAuthSessionToken()
    if (!token) {
      return
    }
    void hydrateWorkspaceInboxFromRemote()
    const timer = window.setInterval(() => {
      void hydrateWorkspaceInboxFromRemote()
    }, REALTIME_FALLBACK_SYNC_MS)
    return () => {
      window.clearInterval(timer)
    }
  }, [canContributeToWorkspaceInbox, hydrateWorkspaceInboxFromRemote, realtimeConnectionState, workspaceId])

  useEffect(() => {
    if (!workspaceId) {
      return
    }
    const cleanCurrentUserName = normalizeName(currentUserName)
    if (!cleanCurrentUserName) {
      return
    }
    setParticipantPresence({
      workspaceId,
      participantName: cleanCurrentUserName,
      online: realtimeConnectionState === 'connected',
    })
  }, [currentUserName, realtimeConnectionState, setParticipantPresence, workspaceId])

  useEffect(() => {
    if (!workspaceId || !currentUserName || loadingMessages || isAllConversationsView) {
      return
    }
    if (shouldAnchorFirstUnread && !unreadAnchorHandledRef.current && firstUnreadMessageId) {
      return
    }
    const latestMessageAt = messages[messages.length - 1]?.createdAt || new Date().toISOString()
    const resolvedReadAt = markWorkspaceRead({
      workspaceId,
      readerName: currentUserName,
      readAt: latestMessageAt,
    })
    if (resolvedReadAt && resolvedReadAt !== lastBroadcastReadAtRef.current) {
      lastBroadcastReadAtRef.current = resolvedReadAt
      publishRealtimeEvent({
        type: 'read_marked',
        workspace_id: workspaceId,
        reader_name: currentUserName,
        read_at: resolvedReadAt,
      })
    }
  }, [
    currentUserName,
    firstUnreadMessageId,
    loadingMessages,
    markWorkspaceRead,
    messages,
    publishRealtimeEvent,
    shouldAnchorFirstUnread,
    isAllConversationsView,
    workspaceId,
  ])

  useEffect(() => {
    if (typeof window === 'undefined') {
      return
    }
    const speechWindow = window as WindowWithSpeechRecognition
    const RecognitionCtor = speechWindow.SpeechRecognition || speechWindow.webkitSpeechRecognition
    if (!RecognitionCtor) {
      setDictationSupported(false)
      return
    }

    setDictationSupported(true)
    const recognition = new RecognitionCtor()
    recognition.continuous = true
    recognition.interimResults = true
    recognition.lang = 'en-GB'
    recognition.onresult = (event: unknown) => {
      const record = event as {
        resultIndex: number
        results: ArrayLike<{
          isFinal: boolean
          0: { transcript: string }
        }>
      }
      let finalTranscript = ''
      for (let index = record.resultIndex; index < record.results.length; index += 1) {
        const result = record.results[index]
        if (result?.isFinal) {
          finalTranscript += ` ${result[0]?.transcript || ''}`
        }
      }
      if (finalTranscript.trim()) {
        setDraft((current) => appendTranscript(current, finalTranscript))
      }
    }
    recognition.onerror = () => {
      setDictating(false)
      setError('Voice dictation failed. Check microphone permissions.')
    }
    recognition.onend = () => {
      setDictating(false)
    }
    recognitionRef.current = recognition

    return () => {
      recognition.onresult = null
      recognition.onerror = null
      recognition.onend = null
      try {
        recognition.stop()
      } catch {
        // Ignore cleanup errors.
      }
      recognitionRef.current = null
    }
  }, [])

  const onToggleDictation = () => {
    setError('')
    if (!canContributeToWorkspaceInbox) {
      setError(INBOX_READ_ONLY_MESSAGE)
      return
    }
    if (!dictationSupported || !recognitionRef.current) {
      setError('Voice dictation is not available in this browser.')
      return
    }
    if (dictating) {
      recognitionRef.current.stop()
      setDictating(false)
      return
    }
    try {
      recognitionRef.current.start()
      setDictating(true)
      setStatus('Listening to microphone for message composition.')
    } catch {
      setDictating(false)
      setError('Microphone could not be started.')
    }
  }

  const onSend = async () => {
    setError('')
    if (!workspaceId) {
      setError('Workspace is not selected.')
      return
    }
    if (!canContributeToWorkspaceInbox) {
      setError(INBOX_READ_ONLY_MESSAGE)
      return
    }
    const cleanDraft = draft.trim()
    if (!cleanDraft) {
      setError('Type a message to send.')
      return
    }

    setSending(true)
    try {
      const sentMessage = await sendWorkspaceMessage({
        workspaceId,
        senderName: currentUserName,
        body: cleanDraft,
      })
      publishRealtimeEvent({
        type: 'message_sent',
        workspace_id: workspaceId,
        sender_name: currentUserName,
        message_id: sentMessage.id,
        created_at: sentMessage.createdAt,
      })
      setDraft('')
      publishTypingState(false)
      setStatus('Message sent with inbox encryption.')
    } catch (sendError) {
      setError(sendError instanceof Error ? sendError.message : 'Message could not be sent.')
    } finally {
      setSending(false)
    }
  }

  const onOpenWorkspacesHome = () => {
    navigate(returnToPath || '/workspaces')
  }

  const onOpenWorkspacesView = (view: 'workspaces' | 'invitations', filter?: FilterKey) => {
    const queryParams = new URLSearchParams()
    queryParams.set('view', view)
    if (filter) {
      queryParams.set('filter', filter)
    }
    const query = queryParams.toString()
    navigate(query ? `/workspaces?${query}` : '/workspaces')
  }

  const onCreateWorkspaceFromSidebar = () => {
    if (!workspaceOwnerName) {
      setError(WORKSPACE_OWNER_REQUIRED_MESSAGE)
      return
    }
    try {
      const created = createWorkspace('New Workspace')
      setActiveWorkspaceId(created.id)
      navigate(`/w/${created.id}/overview`)
    } catch (createWorkspaceError) {
      setError(
        createWorkspaceError instanceof Error
          ? createWorkspaceError.message
          : 'Workspace could not be created.',
      )
    }
  }

  const onOpenWorkspaceOverview = () => {
    if (!workspaceId) {
      return
    }
    navigate(`/w/${workspaceId}/overview`)
  }

  const onOpenWorkspaceThread = useCallback((targetWorkspaceId: string) => {
    const cleanWorkspaceId = normalizeName(targetWorkspaceId)
    if (!cleanWorkspaceId) {
      return
    }
    const nextQuery = new URLSearchParams()
    if (returnToPath) {
      nextQuery.set('returnTo', returnToPath)
    }
    nextQuery.set('at', 'first-unread')
    const query = nextQuery.toString()
    navigate(query ? `/w/${cleanWorkspaceId}/inbox?${query}` : `/w/${cleanWorkspaceId}/inbox`)
  }, [navigate, returnToPath])

  const onOpenAllConversationsView = useCallback(() => {
    if (!workspaceId) {
      return
    }
    const nextQuery = new URLSearchParams()
    if (returnToPath) {
      nextQuery.set('returnTo', returnToPath)
    }
    nextQuery.set('inboxView', 'all-conversations')
    const query = nextQuery.toString()
    navigate(query ? `/w/${workspaceId}/inbox?${query}` : `/w/${workspaceId}/inbox`)
  }, [navigate, returnToPath, workspaceId])

  const onMoveSearchResult = useCallback((direction: -1 | 1) => {
    if (messageSearchMatchCount === 0) {
      return
    }
    setActiveMessageSearchIndex((current) => {
      const currentIndex = current >= 0 ? current : 0
      const nextIndex = (currentIndex + direction + messageSearchMatchCount) % messageSearchMatchCount
      return nextIndex
    })
  }, [messageSearchMatchCount])

  const filterCounts = useMemo<Record<FilterKey, number>>(
    () => ({
      all: workspaces.length,
      active: workspaces.filter((item) => !item.archived).length,
      pinned: workspaces.filter((item) => item.pinned).length,
      archived: workspaces.filter((item) => item.archived).length,
      recent: workspaces.filter((item) => isRecentWorkspace(item.updatedAt)).length,
    }),
    [workspaces],
  )
  const incomingInvitationCount = authorRequests.length
  const outgoingInvitationCount = invitationsSent.length
  const totalInvitationCount = incomingInvitationCount + outgoingInvitationCount
  const canCreateWorkspace = Boolean(workspaceOwnerName)

  const conversationLastUpdated = useMemo(() => {
    if (messages.length === 0) {
      return 'Not available'
    }
    return formatTimestamp(messages[messages.length - 1].createdAt)
  }, [messages])
  const unreadCutoffMs = useMemo(
    () => (lastReadAt ? Date.parse(lastReadAt) : Number.NEGATIVE_INFINITY),
    [lastReadAt],
  )
  const isParticipantOnline = useCallback((participant: string) => {
    const participantKey = normalizeName(participant).toLowerCase()
    if (!participantKey) {
      return false
    }
    const isMe = isSamePerson(participant, currentUserName)
    return realtimeConnectionState === 'connected' && (isMe || Boolean(presenceMap[workspaceId]?.[participantKey]))
  }, [currentUserName, presenceMap, realtimeConnectionState, workspaceId])
  const onlineParticipantCount = useMemo(
    () => participants.filter((participant) => isParticipantOnline(participant)).length,
    [isParticipantOnline, participants],
  )
  const visibleParticipants = useMemo(
    () => (participantFilter === 'online'
      ? participants.filter((participant) => isParticipantOnline(participant))
      : participants),
    [isParticipantOnline, participantFilter, participants],
  )
  const workspaceThreads = useMemo<WorkspaceThreadSummary[]>(() => {
    const workspaceById = workspaces.reduce<Record<string, (typeof workspaces)[number]>>((acc, item) => {
      acc[item.id] = item
      return acc
    }, {})
    const messageCountByWorkspace: Record<string, number> = {}
    const unreadCountByWorkspace: Record<string, number> = {}
    const lastActivityByWorkspace: Record<string, string> = {}
    const readCutoffByWorkspace: Record<string, number> = {}

    for (const [id, readers] of Object.entries(reads)) {
      const value = readers?.[readerKey]
      readCutoffByWorkspace[id] = value ? Date.parse(value) : Number.NEGATIVE_INFINITY
    }

    const readCutoffFor = (id: string): number => {
      if (id in readCutoffByWorkspace) {
        return readCutoffByWorkspace[id]
      }
      return Number.NEGATIVE_INFINITY
    }

    for (const message of allMessages) {
      const id = normalizeName(message.workspaceId)
      if (!id) {
        continue
      }
      messageCountByWorkspace[id] = (messageCountByWorkspace[id] || 0) + 1
      const messageAtMs = Date.parse(message.createdAt)
      const previousAtMs = Date.parse(lastActivityByWorkspace[id] || '')
      if (!lastActivityByWorkspace[id] || (!Number.isNaN(messageAtMs) && (Number.isNaN(previousAtMs) || messageAtMs > previousAtMs))) {
        lastActivityByWorkspace[id] = message.createdAt
      }
      if (
        !isSamePerson(message.senderName, currentUserName) &&
        !Number.isNaN(messageAtMs) &&
        messageAtMs > readCutoffFor(id)
      ) {
        unreadCountByWorkspace[id] = (unreadCountByWorkspace[id] || 0) + 1
      }
    }

    const rows: WorkspaceThreadSummary[] = []
    const seenWorkspaceIds = new Set<string>()
    const appendWorkspace = (idInput: string, nameInput: string) => {
      const id = normalizeName(idInput)
      if (!id || seenWorkspaceIds.has(id)) {
        return
      }
      seenWorkspaceIds.add(id)
      const sourceWorkspace = workspaceById[id]
      rows.push({
        workspaceId: id,
        workspaceName: normalizeName(nameInput) || 'Unnamed workspace',
        ownerName: normalizeName(sourceWorkspace?.ownerName || ''),
        collaboratorCount: sourceWorkspace?.collaborators.length || 0,
        unreadCount: unreadCountByWorkspace[id] || 0,
        messageCount: messageCountByWorkspace[id] || 0,
        lastActivityAt: lastActivityByWorkspace[id] || null,
      })
    }

    workspaces.forEach((item) => appendWorkspace(item.id, item.name))
    if (workspaceId) {
      appendWorkspace(workspaceId, workspace?.name || workspaceId)
    }

    rows.sort((left, right) => {
      const leftRaw = left.lastActivityAt || workspaceById[left.workspaceId]?.updatedAt || ''
      const rightRaw = right.lastActivityAt || workspaceById[right.workspaceId]?.updatedAt || ''
      const leftAt = Date.parse(leftRaw)
      const rightAt = Date.parse(rightRaw)
      const leftScore = Number.isNaN(leftAt) ? Number.NEGATIVE_INFINITY : leftAt
      const rightScore = Number.isNaN(rightAt) ? Number.NEGATIVE_INFINITY : rightAt
      if (rightScore !== leftScore) {
        return rightScore - leftScore
      }
      return left.workspaceName.localeCompare(right.workspaceName)
    })

    return rows
  }, [allMessages, currentUserName, readerKey, reads, workspace?.name, workspaceId, workspaces])
  const normalizedConversationSearch = normalizeName(conversationSearchQuery).toLowerCase()
  const filteredWorkspaceThreads = useMemo(
    () => workspaceThreads.filter((thread) => {
      if (!normalizedConversationSearch) {
        return true
      }
      const searchBlob = [
        thread.workspaceName,
        thread.ownerName,
        thread.workspaceId,
      ].join(' ').toLowerCase()
      return searchBlob.includes(normalizedConversationSearch)
    }),
    [normalizedConversationSearch, workspaceThreads],
  )
  const allThreadsUnreadCount = useMemo(
    () => workspaceThreads.reduce((sum, thread) => sum + thread.unreadCount, 0),
    [workspaceThreads],
  )
  const allThreadsMessageCount = useMemo(
    () => workspaceThreads.reduce((sum, thread) => sum + thread.messageCount, 0),
    [workspaceThreads],
  )
  const allThreadsLastUpdate = useMemo(() => {
    if (workspaceThreads.length === 0) {
      return 'Not available'
    }
    const firstWithActivity = workspaceThreads.find((thread) => Boolean(thread.lastActivityAt))
    if (!firstWithActivity?.lastActivityAt) {
      return 'Not available'
    }
    return formatTimestamp(firstWithActivity.lastActivityAt)
  }, [workspaceThreads])
  const currentWorkspaceLabel = workspace?.name || workspaceId || 'Current workspace'
  const currentInboxLocationLabel = isAllConversationsView ? 'All conversations' : currentWorkspaceLabel
  const conversationTitle = `Conversation: ${currentWorkspaceLabel}`

  return (
    <div data-house-scope="workspace-inbox" className="flex h-screen flex-col bg-background text-foreground">
      <TopBar
        scope="workspace"
        onOpenLeftNav={() => {}}
        showLeftNavButton={false}
      />
      <section
        className={cn(
          'grid min-h-0 flex-1 grid-cols-1',
          rightNavCollapsed
            ? 'nav:grid-cols-[17.5rem_minmax(0,1fr)_3.5rem]'
            : 'nav:grid-cols-[17.5rem_minmax(0,1fr)_17.5rem]',
        )}
      >
        <aside className="hidden border-r border-border nav:block">
          <div className={cn('flex h-full flex-col', houseLayout.sidebar)} data-house-role="left-nav-shell">
            <div className={houseLayout.sidebarHeader}>
              <div className={cn(houseLayout.pageHeader, houseSurfaces.leftBorder, HOUSE_LEFT_BORDER_WORKSPACE_CLASS)}>
                <h2 className={houseTypography.sectionTitle}>My Workspace</h2>
                <p className={houseTypography.fieldHelper}>
                  Library-level filters and actions for all workspaces.
                </p>
              </div>
            </div>

            <div className="flex-1 space-y-4 overflow-y-auto p-3">
              <section className={houseLayout.sidebarSection}>
                <p className={houseNavigation.sectionLabel}>Views</p>
                <div className="space-y-1">
                  <button
                    type="button"
                    onClick={() => onOpenWorkspacesView('workspaces')}
                    className={cn(houseNavigation.item, HOUSE_NAV_ITEM_WORKSPACE_CLASS)}
                  >
                    <span className="truncate pl-2">Workspaces</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => onOpenWorkspacesView('invitations')}
                    className={cn(houseNavigation.item, HOUSE_NAV_ITEM_WORKSPACE_CLASS)}
                  >
                    <span className="truncate pl-2">Invitations</span>
                    <div className={cn('ml-2 flex items-center gap-1.5', houseNavigation.itemMeta)}>
                      <span className={cn(houseNavigation.itemCount, 'gap-1')}>
                        <span className="inline-block h-1.5 w-1.5 rounded-full bg-emerald-500" />
                        {incomingInvitationCount}
                      </span>
                      <span className={cn(houseNavigation.itemCount, 'gap-1')}>
                        <span className="inline-block h-1.5 w-1.5 rounded-full bg-red-500" />
                        {outgoingInvitationCount}
                      </span>
                      <span className={houseNavigation.itemCount}>{totalInvitationCount}</span>
                    </div>
                  </button>
                  <div className={cn(houseNavigation.item, HOUSE_NAV_ITEM_WORKSPACE_CLASS, houseNavigation.itemActive)}>
                    <span className="truncate pl-2">Inbox</span>
                  </div>
                  <button
                    type="button"
                    onClick={onOpenWorkspaceOverview}
                    className={cn(houseNavigation.item, HOUSE_NAV_ITEM_WORKSPACE_CLASS)}
                    disabled={!workspaceId}
                  >
                    <span className="truncate pl-2">Workspace overview</span>
                  </button>
                </div>
              </section>

              <section className={houseLayout.sidebarSection}>
                <p className={houseNavigation.sectionLabel}>States</p>
                <div className="space-y-1">
                  {FILTER_OPTIONS.map((option) => (
                    <button
                      key={option.key}
                      type="button"
                      onClick={() => onOpenWorkspacesView('workspaces', option.key)}
                      className={cn(houseNavigation.item, HOUSE_NAV_ITEM_GOVERNANCE_CLASS)}
                    >
                      <span className="truncate pl-2 text-left">{option.label}</span>
                      <span className={cn(houseNavigation.itemCount, 'ml-2')}>
                        {filterCounts[option.key]}
                      </span>
                    </button>
                  ))}
                </div>
              </section>

              <section className={houseLayout.sidebarSection}>
                <p className={houseNavigation.sectionLabel}>Actions</p>
                <Button
                  type="button"
                  className={cn('w-full justify-start', houseForms.actionButtonPrimary, houseTypography.buttonText)}
                  onClick={onCreateWorkspaceFromSidebar}
                  disabled={!canCreateWorkspace}
                >
                  Create workspace
                </Button>
                {!canCreateWorkspace ? (
                  <p className={houseTypography.fieldHelper}>{WORKSPACE_OWNER_REQUIRED_MESSAGE}</p>
                ) : null}
                <Button
                  type="button"
                  className={cn('w-full justify-start', houseForms.actionButton, houseTypography.buttonText)}
                  onClick={onOpenWorkspacesHome}
                >
                  Open workspaces home
                </Button>
              </section>
            </div>
          </div>
        </aside>

        <main className="min-w-0 flex-1 overflow-hidden bg-background">
          <div data-house-role="content-container" className="house-content-container house-content-container-wide h-full">
            <header
              data-house-role="page-header"
              className={cn(houseLayout.pageHeader, houseSurfaces.leftBorder, HOUSE_LEFT_BORDER_WORKSPACE_CLASS)}
            >
              <h1 data-house-role="page-title" className={houseTypography.title}>Inbox</h1>
            </header>
            <section className={cn('flex h-full min-h-0 flex-col rounded-lg border border-border', houseSurfaces.card)}>
              {isAllConversationsView ? (
                <>
                  <div className="border-b border-border px-4 py-3">
                    <h2 className={houseTypography.sectionTitle}>All conversations</h2>
                    <p className={houseTypography.sectionSubtitle}>
                      Search every workspace thread and open the conversation you need.
                    </p>
                  </div>
                  <div className="space-y-2 border-b border-border p-3">
                    <label htmlFor="workspace-inbox-conversation-search" className={houseTypography.fieldLabel}>
                      Search conversations
                    </label>
                    <input
                      id="workspace-inbox-conversation-search"
                      type="search"
                      value={conversationSearchQuery}
                      onChange={(event) => setConversationSearchQuery(event.target.value)}
                      placeholder="Search by workspace, owner, or workspace id"
                      className={cn('w-full rounded-md px-3 py-2 text-sm', houseForms.input)}
                    />
                    <p className={houseTypography.fieldHelper}>
                      {filteredWorkspaceThreads.length} of {workspaceThreads.length} conversation
                      {workspaceThreads.length === 1 ? '' : 's'} shown.
                    </p>
                  </div>
                  <div className="flex-1 space-y-1 overflow-y-auto p-3">
                    {filteredWorkspaceThreads.length === 0 ? (
                      <p className={houseTypography.fieldHelper}>No conversations match this search.</p>
                    ) : (
                      filteredWorkspaceThreads.map((thread) => {
                        const lastActivityLabel = thread.lastActivityAt
                          ? formatTimestamp(thread.lastActivityAt)
                          : 'No messages yet'
                        return (
                          <button
                            key={thread.workspaceId}
                            type="button"
                            className={cn(houseNavigation.item, HOUSE_NAV_ITEM_WORKSPACE_CLASS, 'w-full')}
                            onClick={() => onOpenWorkspaceThread(thread.workspaceId)}
                            data-ui="inbox-all-conversations-item"
                            aria-label={`Open ${thread.workspaceName} conversation`}
                          >
                            <div className="min-w-0 flex-1">
                              <p className={cn('truncate pl-2', houseTypography.fieldLabel)}>
                                {thread.workspaceName}
                              </p>
                              <p className={cn('truncate pl-2', houseTypography.fieldHelper)}>
                                {thread.ownerName
                                  ? `Owner: ${thread.ownerName} • ${thread.collaboratorCount} collaborator${thread.collaboratorCount === 1 ? '' : 's'}`
                                  : `${thread.collaboratorCount} collaborator${thread.collaboratorCount === 1 ? '' : 's'}`}
                              </p>
                            </div>
                            <div className={cn('ml-2 flex items-center gap-1.5', houseNavigation.itemMeta)}>
                              <span className={cn('max-w-[8.5rem] truncate', houseNavigation.itemMeta)}>
                                {lastActivityLabel}
                              </span>
                              <span className={houseNavigation.itemCount}>
                                {thread.unreadCount > 0 ? thread.unreadCount : thread.messageCount}
                              </span>
                            </div>
                          </button>
                        )
                      })
                    )}
                  </div>
                </>
              ) : (
                <>
                  <div className="border-b border-border px-4 py-3">
                    <div className="flex flex-col gap-3 xl:flex-row xl:items-start xl:justify-between">
                      <div className="min-w-0">
                        <h2 className={houseTypography.sectionTitle}>{conversationTitle}</h2>
                        {unreadCount > 0 ? (
                          <p className={houseTypography.sectionSubtitle}>
                            {unreadCount} unread message{unreadCount === 1 ? '' : 's'} pending.
                          </p>
                        ) : null}
                      </div>
                      <div className="w-full max-w-lg xl:ml-4" data-ui="inbox-conversation-search">
                        <label
                          htmlFor="workspace-inbox-message-search"
                          className={cn(houseTypography.fieldLabel, 'sr-only')}
                        >
                          Search this conversation
                        </label>
                        <div className="flex flex-wrap items-center justify-end gap-2">
                          <input
                            id="workspace-inbox-message-search"
                            type="search"
                            value={messageSearchQuery}
                            onChange={(event) => {
                              setMessageSearchQuery(event.target.value)
                              setActiveMessageSearchIndex(0)
                            }}
                            onKeyDown={(event) => {
                              if (event.key !== 'Enter') {
                                return
                              }
                              event.preventDefault()
                              onMoveSearchResult(event.shiftKey ? -1 : 1)
                            }}
                            placeholder="Search this conversation"
                            className={cn('min-w-[14rem] flex-1 rounded-md px-3 py-2 text-sm xl:max-w-[18rem]', houseForms.input)}
                            data-ui="inbox-conversation-search-input"
                          />
                          <Button
                            type="button"
                            size="sm"
                            variant="house"
                            className="h-9 px-2"
                            onClick={() => onMoveSearchResult(-1)}
                            disabled={messageSearchMatchCount === 0}
                            data-ui="inbox-conversation-search-prev"
                          >
                            Previous
                          </Button>
                          <Button
                            type="button"
                            size="sm"
                            variant="house"
                            className="h-9 px-2"
                            onClick={() => onMoveSearchResult(1)}
                            disabled={messageSearchMatchCount === 0}
                            data-ui="inbox-conversation-search-next"
                          >
                            Next
                          </Button>
                        </div>
                        {searchResultLabel ? (
                          <p className={cn('pt-1 text-right', houseTypography.fieldHelper)} data-ui="inbox-conversation-search-meta">
                            {searchResultLabel}
                          </p>
                        ) : null}
                      </div>
                    </div>
                  </div>

                  <div ref={conversationRef} className="flex-1 space-y-2 overflow-y-auto p-3">
                    {loadingMessages ? (
                      <p className={houseTypography.fieldHelper}>Decrypting inbox messages...</p>
                    ) : messages.length === 0 ? (
                      <p className={houseTypography.fieldHelper}>No messages yet.</p>
                    ) : (
                      messages.map((message) => {
                        const isMine = isSamePerson(message.senderName, currentUserName)
                        const isUnread = !isMine && Date.parse(message.createdAt) > unreadCutoffMs
                        const messageSearchRanges = messageSearchRangesByMessageId.get(message.id) || []
                        const isSearchMatched = messageSearchRanges.length > 0
                        const isActiveSearchMatch = isSearchMatched && message.id === activeSearchMessageId
                        const tone = participantTone(message.senderName, currentUserName)
                        return (
                          <article
                            key={message.id}
                            id={`inbox-message-${message.id}`}
                            data-inbox-message-id={message.id}
                            className={cn(
                              'max-w-[82%] rounded-md border px-3 py-2',
                              tone.bubbleClass,
                              isUnread && 'ring-1 ring-[hsl(var(--tone-accent-300))]',
                              isSearchMatched && 'outline outline-1 outline-[hsl(var(--tone-warning-300))]',
                              isActiveSearchMatch && 'outline-2 outline-[hsl(var(--tone-warning-500))]',
                              isMine ? 'ml-auto' : 'mr-auto',
                            )}
                          >
                            <div className="flex flex-wrap items-center justify-between gap-2">
                              <p className={houseTypography.fieldLabel}>{isMine ? `${message.senderName} (You)` : message.senderName}</p>
                              <div className="flex items-center gap-2">
                                {isUnread ? (
                                  <span data-house-role="message-unread-badge" className="rounded border border-[hsl(var(--tone-accent-300))] bg-[hsl(var(--tone-accent-50))] px-1.5 py-0.5 text-xs text-[hsl(var(--tone-accent-800))]">
                                    Unread
                                  </span>
                                ) : null}
                                <p data-house-role="message-timestamp" className={houseTypography.fieldHelper}>{formatTimestamp(message.createdAt)}</p>
                              </div>
                            </div>
                            <p data-house-role="message-body" className={cn('mt-1 whitespace-pre-wrap', houseTypography.text)}>
                              {renderTextWithHighlights(message.body, messageSearchRanges)}
                            </p>
                          </article>
                        )
                      })
                    )}
                  </div>

                  <footer data-house-role="inbox-composer-footer" className="space-y-2 border-t border-border p-3">
                    <label data-house-role="inbox-composer-label" htmlFor="workspace-inbox-message" className={houseTypography.fieldLabel}>Compose message</label>
                    <Textarea
                      data-house-role="inbox-composer-textarea"
                      id="workspace-inbox-message"
                      ref={composerRef}
                      value={draft}
                      onChange={(event) => setDraft(event.target.value)}
                      placeholder={canContributeToWorkspaceInbox ? 'Write an inbox message...' : INBOX_READ_ONLY_MESSAGE}
                      className="min-h-24"
                      disabled={sending || !canContributeToWorkspaceInbox}
                    />
                    <div data-house-role="inbox-composer-actions" className="flex flex-wrap items-center justify-between gap-2">
                      <div data-house-role="inbox-composer-left-actions" className="flex flex-wrap items-center gap-2">
                        <Button
                          type="button"
                          className={cn(houseForms.actionButton, houseTypography.buttonText)}
                          onClick={onToggleDictation}
                          disabled={!dictationSupported || !canContributeToWorkspaceInbox}
                        >
                          {dictating ? 'Stop dictation' : 'Voice compose'}
                        </Button>
                      </div>
                      <Button
                        type="button"
                        onClick={() => void onSend()}
                        className={cn(houseForms.actionButtonPrimary, houseTypography.buttonText)}
                        disabled={sending || !canContributeToWorkspaceInbox}
                      >
                        {sending ? 'Sending...' : 'Send encrypted'}
                      </Button>
                    </div>
                    {!canContributeToWorkspaceInbox ? (
                      <p className={houseTypography.fieldHelper}>{INBOX_READ_ONLY_MESSAGE}</p>
                    ) : null}
                    {status ? <p data-house-role="inbox-composer-status" className={houseTypography.fieldHelper}>{status}</p> : null}
                    {error ? <p data-house-role="inbox-composer-error" className="text-sm text-[hsl(var(--tone-danger-700))]">{error}</p> : null}
                  </footer>
                </>
              )}
            </section>
          </div>
        </main>

        <aside
          data-house-role="right-nav-aside"
          className={cn('hidden border-l border-border nav:block', rightNavCollapsed && 'bg-card')}
        >
          {rightNavCollapsed ? (
            <div className={cn('flex h-full flex-col items-center gap-2 p-2', houseLayout.sidebar)} data-house-role="right-nav-shell-collapsed">
              <Button
                type="button"
                size="sm"
                variant="house"
                className="h-8 px-2"
                onClick={() => setRightNavCollapsed(false)}
                data-ui="inbox-right-nav-expand"
                aria-label="Expand inbox navigation panel"
              >
                Expand
              </Button>
              <p className={cn('text-xs uppercase tracking-[0.08em]', houseTypography.fieldHelper)} data-ui="inbox-right-nav-collapsed-label">
                Inbox
              </p>
            </div>
          ) : (
            <div className={cn('flex h-full flex-col', houseLayout.sidebar)} data-house-role="right-nav-shell">
              <div data-house-role="right-nav-header" className={houseLayout.sidebarHeader}>
                <div className="flex items-start justify-between gap-2">
                  <div data-house-role="right-nav-title-wrap" className={cn(houseLayout.pageHeader, houseSurfaces.leftBorder, HOUSE_LEFT_BORDER_WORKSPACE_CLASS)}>
                    <h2 data-house-role="right-nav-title" className={houseTypography.sectionTitle}>Inbox</h2>
                    <p data-house-role="right-nav-subtitle" className={houseTypography.fieldHelper}>
                      {currentInboxLocationLabel}
                    </p>
                  </div>
                  <Button
                    type="button"
                    size="sm"
                    variant="house"
                    className="h-8 px-2"
                    onClick={() => setRightNavCollapsed(true)}
                    data-ui="inbox-right-nav-collapse"
                    aria-label="Collapse inbox navigation panel"
                  >
                    Collapse
                  </Button>
                </div>
              </div>

              <div data-house-role="right-nav-content" className="flex-1 space-y-4 overflow-y-auto p-3">
              <section className={houseLayout.sidebarSection} data-ui="inbox-right-views-section">
                <p className={houseNavigation.sectionLabel} data-ui="inbox-right-views-label">Views</p>
                <div className="space-y-1" data-ui="inbox-right-views-list">
                  <button
                    type="button"
                    className={cn(
                      houseNavigation.item,
                      HOUSE_NAV_ITEM_WORKSPACE_CLASS,
                      inboxMainView === 'all-conversations' && houseNavigation.itemActive,
                    )}
                    onClick={onOpenAllConversationsView}
                    data-ui="inbox-right-view-all-conversations"
                  >
                    <span className="truncate pl-2" data-ui="inbox-right-view-all-conversations-label">All conversations</span>
                  </button>
                  {!isAllConversationsView ? (
                    <div
                      className={cn(houseNavigation.item, HOUSE_NAV_ITEM_WORKSPACE_CLASS, houseNavigation.itemActive)}
                      data-ui="inbox-right-view-current-workspace"
                    >
                      <span className="truncate pl-2" data-ui="inbox-right-view-current-workspace-label">{currentWorkspaceLabel}</span>
                    </div>
                  ) : null}
                </div>
              </section>

              <section className={houseLayout.sidebarSection} data-ui="inbox-right-conversation-section">
                <p className={houseNavigation.sectionLabel} data-ui="inbox-right-conversation-label">
                  {isAllConversationsView ? 'Inbox' : conversationTitle}
                </p>
                <div className="space-y-1" data-ui="inbox-right-conversation-list">
                  <div className={cn(houseNavigation.item, HOUSE_NAV_ITEM_DATA_CLASS)} data-ui="inbox-right-stat-item">
                    <span className="truncate pl-2" data-ui="inbox-right-stat-name">Messages</span>
                    <span className={houseNavigation.itemCount} data-ui="inbox-right-stat-value">
                      {isAllConversationsView ? allThreadsMessageCount : messages.length}
                    </span>
                  </div>
                  <div className={cn(houseNavigation.item, HOUSE_NAV_ITEM_DATA_CLASS)} data-ui="inbox-right-stat-item">
                    <span className="truncate pl-2" data-ui="inbox-right-stat-name">Unread</span>
                    <span className={houseNavigation.itemCount} data-ui="inbox-right-stat-value">
                      {isAllConversationsView ? allThreadsUnreadCount : unreadCount}
                    </span>
                  </div>
                  <div className={cn(houseNavigation.item, HOUSE_NAV_ITEM_DATA_CLASS)} data-ui="inbox-right-stat-item">
                    <span className="truncate pl-2" data-ui="inbox-right-stat-name">
                      {isAllConversationsView ? 'Conversations' : 'Participants'}
                    </span>
                    <span className={houseNavigation.itemCount} data-ui="inbox-right-stat-value">
                      {isAllConversationsView ? workspaceThreads.length : participants.length}
                    </span>
                  </div>
                  <div className={cn(houseNavigation.item, HOUSE_NAV_ITEM_DATA_CLASS)} data-ui="inbox-right-stat-item">
                    <span className="truncate pl-2" data-ui="inbox-right-stat-name">Last update</span>
                    <span className={cn('max-w-sz-130 truncate', houseNavigation.itemMeta)} data-ui="inbox-right-stat-meta">
                      {isAllConversationsView ? allThreadsLastUpdate : conversationLastUpdated}
                    </span>
                  </div>
                  {!isAllConversationsView ? (
                    <div className={cn(houseNavigation.item, HOUSE_NAV_ITEM_DATA_CLASS)} data-ui="inbox-right-stat-item">
                      <span className="truncate pl-2" data-ui="inbox-right-stat-name">Online</span>
                      <span className={houseNavigation.itemCount} data-ui="inbox-right-stat-value">{onlineParticipantCount}</span>
                    </div>
                  ) : null}
                </div>
              </section>

              {!isAllConversationsView ? (
                <section className={houseLayout.sidebarSection} data-ui="inbox-right-participants-section">
                  <p className={houseNavigation.sectionLabel} data-ui="inbox-right-participants-label">Participants</p>
                  <div className="flex items-center gap-2 px-2" data-ui="inbox-right-participants-filter">
                    <Button
                      type="button"
                      size="sm"
                      variant={participantFilter === 'all' ? 'housePrimary' : 'house'}
                      className="h-8 px-2"
                      onClick={() => setParticipantFilter('all')}
                      data-ui="inbox-right-participants-filter-all"
                    >
                      All
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant={participantFilter === 'online' ? 'housePrimary' : 'house'}
                      className="h-8 px-2"
                      onClick={() => setParticipantFilter('online')}
                      data-ui="inbox-right-participants-filter-online"
                    >
                      Online only
                    </Button>
                  </div>
                  <div className="space-y-1" data-ui="inbox-right-participants-list">
                    {visibleParticipants.length === 0 ? (
                      <p className={houseTypography.fieldHelper} data-ui="inbox-right-participants-empty">
                        {participantFilter === 'online' ? 'No participants are online.' : 'No participants'}
                      </p>
                    ) : (
                      visibleParticipants.map((participant) => {
                        const isMe = isSamePerson(participant, currentUserName)
                        const isOnline = isParticipantOnline(participant)
                        const onlineLabel = isOnline ? 'online' : 'offline'
                        return (
                          <div key={participant} className={cn(houseNavigation.item, HOUSE_NAV_ITEM_WORKSPACE_CLASS)} data-ui="inbox-right-participant-item">
                            <p className={cn('truncate', houseTypography.text)} data-ui="inbox-right-participant-name">
                              {participant}
                              {isMe ? ' (You)' : ''}
                            </p>
                            <div className={cn('ml-2 flex items-center gap-1.5', houseNavigation.itemMeta)} data-ui="inbox-right-participant-meta">
                              <span
                                className={cn(houseNavigation.itemCount, 'gap-1')}
                                data-ui="inbox-right-participant-online"
                                aria-label={`${participant} ${onlineLabel}`}
                              >
                                <span data-house-role="participant-online-dot" className={cn('inline-block h-1.5 w-1.5 rounded-full', isOnline ? 'bg-emerald-500' : 'bg-red-500')} />
                                {onlineLabel}
                              </span>
                            </div>
                          </div>
                        )
                      })
                    )}
                  </div>
                </section>
              ) : null}

              {!isAllConversationsView ? (
                <section className={houseLayout.sidebarSection} data-ui="inbox-right-workspace-section">
                  <p className={houseNavigation.sectionLabel} data-ui="inbox-right-workspace-label">Workspace</p>
                  <div className="space-y-1" data-ui="inbox-right-workspace-list">
                    <button
                      type="button"
                      className={cn(houseNavigation.item, HOUSE_NAV_ITEM_WORKSPACE_CLASS)}
                      onClick={onOpenWorkspaceOverview}
                      disabled={!workspaceId}
                      data-ui="inbox-right-workspace-open"
                    >
                      <span className="truncate pl-2" data-ui="inbox-right-workspace-open-label">Open workspace</span>
                    </button>
                  </div>
                </section>
              ) : null}
              </div>
            </div>
          )}
        </aside>
      </section>
    </div>
  )
}
