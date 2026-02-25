import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'

import { Button } from '@/components/ui/button'
import { decryptWorkspaceInboxText } from '@/lib/workspace-inbox-crypto'
import { houseForms, houseLayout, houseSurfaces, houseTypography } from '@/lib/house-style'
import { readWorkspaceOwnerNameFromProfile } from '@/lib/workspace-owner'
import { cn } from '@/lib/utils'
import {
  INBOX_MESSAGES_STORAGE_KEY,
  useWorkspaceInboxStore,
} from '@/store/use-workspace-inbox-store'
import { useWorkspaceStore } from '@/store/use-workspace-store'

type DecryptedInboxMessage = {
  id: string
  senderName: string
  body: string
  createdAt: string
}

type TypingMapRecord = Record<string, Record<string, string>>

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

function normalizeName(value: string | null | undefined): string {
  return (value || '').trim().replace(/\s+/g, ' ')
}

function isSamePerson(left: string, right: string): boolean {
  return normalizeName(left).toLowerCase() === normalizeName(right).toLowerCase()
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

export function WorkspaceInboxPage() {
  const navigate = useNavigate()
  const params = useParams<{ workspaceId: string }>()
  const workspaceId = (params.workspaceId || '').trim()
  const workspaces = useWorkspaceStore((state) => state.workspaces)
  const sendWorkspaceMessage = useWorkspaceInboxStore((state) => state.sendWorkspaceMessage)
  const refreshMessagesFromStorage = useWorkspaceInboxStore((state) => state.refreshMessagesFromStorage)
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
  const canSpeakDraft = typeof window !== 'undefined' && 'speechSynthesis' in window

  const [draft, setDraft] = useState('')
  const [messages, setMessages] = useState<DecryptedInboxMessage[]>([])
  const [typingMap, setTypingMap] = useState<TypingMapRecord>(() => pruneTypingMap(readTypingMap()))
  const [loadingMessages, setLoadingMessages] = useState(false)
  const [sending, setSending] = useState(false)
  const [dictating, setDictating] = useState(false)
  const [dictationSupported, setDictationSupported] = useState(false)
  const [status, setStatus] = useState('')
  const [error, setError] = useState('')
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null)
  const conversationRef = useRef<HTMLDivElement | null>(null)

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
  }, [currentUserName, workspaceId])

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
    element.scrollTop = element.scrollHeight
  }, [messages])

  useEffect(() => {
    if (typeof window === 'undefined') {
      return
    }
    const onStorage = (event: StorageEvent) => {
      if (event.key === INBOX_MESSAGES_STORAGE_KEY) {
        refreshMessagesFromStorage()
      }
      if (event.key === INBOX_TYPING_STORAGE_KEY) {
        setTypingMap(pruneTypingMap(readTypingMap()))
      }
    }
    window.addEventListener('storage', onStorage)
    return () => {
      window.removeEventListener('storage', onStorage)
    }
  }, [refreshMessagesFromStorage])

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
  }, [dictating, draft, publishTypingState])

  useEffect(() => {
    return () => {
      publishTypingState(false)
    }
  }, [publishTypingState])

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

  const activeTypingNames = useMemo(() => {
    const byWorkspace = typingMap[workspaceId] || {}
    return Object.keys(byWorkspace).filter((senderName) => !isSamePerson(senderName, currentUserName))
  }, [currentUserName, typingMap, workspaceId])

  const typingSummary = useMemo(() => {
    if (activeTypingNames.length === 0) {
      return ''
    }
    if (activeTypingNames.length === 1) {
      return `${activeTypingNames[0]} is typing...`
    }
    if (activeTypingNames.length === 2) {
      return `${activeTypingNames[0]} and ${activeTypingNames[1]} are typing...`
    }
    return `${activeTypingNames.length} collaborators are typing...`
  }, [activeTypingNames])

  const onToggleDictation = () => {
    setError('')
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

  const onReadDraft = () => {
    setError('')
    if (!canSpeakDraft) {
      setError('Text-to-speech is not available in this browser.')
      return
    }
    const cleanDraft = draft.trim()
    if (!cleanDraft) {
      setError('Type a message before using text-to-speech.')
      return
    }
    window.speechSynthesis.cancel()
    const utterance = new SpeechSynthesisUtterance(cleanDraft)
    utterance.lang = 'en-GB'
    window.speechSynthesis.speak(utterance)
    setStatus('Reading draft aloud.')
  }

  const onSend = async () => {
    setError('')
    const cleanDraft = draft.trim()
    if (!workspaceId) {
      setError('Workspace is not selected.')
      return
    }
    if (!cleanDraft) {
      setError('Type a message to send.')
      return
    }

    setSending(true)
    try {
      await sendWorkspaceMessage({
        workspaceId,
        senderName: currentUserName,
        body: cleanDraft,
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
    navigate('/workspaces')
  }

  const onOpenWorkspaceOverview = () => {
    if (!workspaceId) {
      return
    }
    navigate(`/w/${workspaceId}/overview`)
  }

  const conversationLastUpdated = useMemo(() => {
    if (messages.length === 0) {
      return 'Not available'
    }
    return formatTimestamp(messages[messages.length - 1].createdAt)
  }, [messages])

  return (
    <section className="space-y-4">
      <header className={cn(houseLayout.pageHeader, houseSurfaces.leftBorder)}>
        <h1 data-house-role="page-title" className={houseTypography.title}>Inbox</h1>
        <p data-house-role="page-subtitle" className={houseTypography.subtitle}>
          Workspace messaging for contributors. Messages are encrypted at rest in this client.
        </p>
      </header>

      <section className="grid gap-4 xl:grid-cols-[280px_minmax(0,1fr)]">
        <aside className={cn('space-y-3 rounded-lg border border-border p-3', houseSurfaces.card)}>
          <section className="space-y-2 rounded-md border border-border bg-background px-3 py-2">
            <p className={houseTypography.fieldLabel}>Navigate</p>
            <div className="space-y-2">
              <Button
                type="button"
                onClick={onOpenWorkspacesHome}
                className={cn('w-full justify-start', houseForms.actionButton, houseTypography.buttonText)}
              >
                Workspaces home
              </Button>
              <Button
                type="button"
                onClick={onOpenWorkspaceOverview}
                className={cn('w-full justify-start', houseForms.actionButton, houseTypography.buttonText)}
                disabled={!workspaceId}
              >
                Workspace overview
              </Button>
            </div>
          </section>

          <section className="space-y-1 rounded-md border border-border bg-background px-3 py-2">
            <p className={houseTypography.fieldLabel}>Workspace</p>
            <p className={cn('truncate', houseTypography.text)}>
              {workspace?.name || workspaceId || 'Unknown workspace'}
            </p>
          </section>

          <section className="space-y-1 rounded-md border border-border bg-background px-3 py-2">
            <p className={houseTypography.fieldLabel}>Conversation</p>
            <p className={houseTypography.text}>
              {messages.length} {messages.length === 1 ? 'message' : 'messages'}
            </p>
            <p className={houseTypography.fieldHelper}>
              Last message {conversationLastUpdated}
            </p>
          </section>

          <section className="space-y-2 rounded-md border border-border bg-background px-3 py-2">
            <p className={houseTypography.fieldLabel}>Participants</p>
            <div className="space-y-1.5">
              {participants.length === 0 ? (
                <p className={houseTypography.fieldHelper}>No participants</p>
              ) : (
                participants.map((participant) => {
                  const tone = participantTone(participant, currentUserName)
                  const isMe = isSamePerson(participant, currentUserName)
                  return (
                    <div key={participant} className="flex items-center gap-2">
                      <span className={cn('inline-block h-2 w-2 rounded-full', tone.dotClass)} />
                      <p className={cn('truncate', houseTypography.text)}>
                        {participant}
                        {isMe ? ' (You)' : ''}
                      </p>
                    </div>
                  )
                })
              )}
            </div>
          </section>

          <section className="space-y-1 rounded-md border border-border bg-background px-3 py-2">
            <p className={houseTypography.fieldLabel}>Live activity</p>
            {typingSummary ? (
              <p className={houseTypography.textSoft}>{typingSummary}</p>
            ) : (
              <p className={houseTypography.fieldHelper}>No one is typing.</p>
            )}
          </section>
        </aside>

        <section className={cn('flex min-h-[38rem] flex-col rounded-lg border border-border', houseSurfaces.card)}>
          <div className="border-b border-border px-4 py-3">
            <h2 className={houseTypography.sectionTitle}>Conversation</h2>
            <p className={houseTypography.sectionSubtitle}>Messages cannot be deleted. Newest messages appear at the bottom.</p>
          </div>

          <div ref={conversationRef} className="flex-1 space-y-2 overflow-y-auto p-3">
            {loadingMessages ? (
              <p className={houseTypography.fieldHelper}>Decrypting inbox messages...</p>
            ) : messages.length === 0 ? (
              <p className={houseTypography.fieldHelper}>No messages yet.</p>
            ) : (
              messages.map((message) => {
                const isMine = isSamePerson(message.senderName, currentUserName)
                const tone = participantTone(message.senderName, currentUserName)
                return (
                  <article
                    key={message.id}
                    className={cn(
                      'max-w-[82%] rounded-md border px-3 py-2',
                      tone.bubbleClass,
                      isMine ? 'ml-auto' : 'mr-auto',
                    )}
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <p className={houseTypography.fieldLabel}>{isMine ? `${message.senderName} (You)` : message.senderName}</p>
                      <p className={houseTypography.fieldHelper}>{formatTimestamp(message.createdAt)}</p>
                    </div>
                    <p className={cn('mt-1 whitespace-pre-wrap', houseTypography.text)}>{message.body}</p>
                  </article>
                )
              })
            )}
          </div>

          <footer className="space-y-2 border-t border-border p-3">
            <label htmlFor="workspace-inbox-message" className={houseTypography.fieldLabel}>Compose message</label>
            <textarea
              id="workspace-inbox-message"
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              placeholder="Write an inbox message..."
              className={cn('min-h-24 w-full rounded-md px-3 py-2 text-sm', houseForms.textarea)}
              disabled={sending}
            />
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex flex-wrap items-center gap-2">
                <Button
                  type="button"
                  className={cn(houseForms.actionButton, houseTypography.buttonText)}
                  onClick={onToggleDictation}
                  disabled={!dictationSupported}
                >
                  {dictating ? 'Stop dictation' : 'Voice compose'}
                </Button>
                <Button
                  type="button"
                  className={cn(houseForms.actionButton, houseTypography.buttonText)}
                  onClick={onReadDraft}
                  disabled={!canSpeakDraft}
                >
                  Read draft
                </Button>
              </div>
              <Button
                type="button"
                onClick={() => void onSend()}
                className={cn(houseForms.actionButtonPrimary, houseTypography.buttonText)}
                disabled={sending}
              >
                {sending ? 'Sending...' : 'Send encrypted'}
              </Button>
            </div>
            {typingSummary ? <p className={houseTypography.fieldHelper}>{typingSummary}</p> : null}
            {status ? <p className={houseTypography.fieldHelper}>{status}</p> : null}
            {error ? <p className="text-sm text-[hsl(var(--tone-danger-700))]">{error}</p> : null}
          </footer>
        </section>
      </section>
    </section>
  )
}
