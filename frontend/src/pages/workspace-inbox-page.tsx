import { useEffect, useMemo, useState } from 'react'
import { useParams } from 'react-router-dom'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { ScrollArea } from '@/components/ui/scroll-area'
import { decryptWorkspaceInboxText } from '@/lib/workspace-inbox-crypto'
import { houseForms, houseSurfaces, houseTypography } from '@/lib/house-style'
import { readWorkspaceOwnerNameFromProfile } from '@/lib/workspace-owner'
import { cn } from '@/lib/utils'
import { useWorkspaceInboxStore } from '@/store/use-workspace-inbox-store'
import { useWorkspaceStore } from '@/store/use-workspace-store'

type DecryptedInboxMessage = {
  id: string
  senderName: string
  body: string
  createdAt: string
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

export function WorkspaceInboxPage() {
  const params = useParams<{ workspaceId: string }>()
  const workspaceId = (params.workspaceId || '').trim()
  const workspaces = useWorkspaceStore((state) => state.workspaces)
  const sendWorkspaceMessage = useWorkspaceInboxStore((state) => state.sendWorkspaceMessage)
  const encryptedMessages = useWorkspaceInboxStore((state) => state.listWorkspaceMessages(workspaceId))
  const workspace = workspaces.find((item) => item.id === workspaceId) || null
  const currentUserName = useMemo(
    () => readWorkspaceOwnerNameFromProfile() || 'You',
    [],
  )

  const [draft, setDraft] = useState('')
  const [messages, setMessages] = useState<DecryptedInboxMessage[]>([])
  const [loadingMessages, setLoadingMessages] = useState(false)
  const [sending, setSending] = useState(false)
  const [status, setStatus] = useState('')
  const [error, setError] = useState('')

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
      setStatus('Message sent with inbox encryption.')
    } catch (sendError) {
      setError(sendError instanceof Error ? sendError.message : 'Message could not be sent.')
    } finally {
      setSending(false)
    }
  }

  return (
    <section className="space-y-4">
      <header className={cn('space-y-1', houseSurfaces.leftBorder)}>
        <h1 className={houseTypography.title}>Inbox</h1>
        <p className={houseTypography.subtitle}>
          Workspace messaging for contributors. Messages are encrypted at rest in this client.
        </p>
      </header>

      <section className={cn('space-y-3 rounded-lg border border-border p-4', houseSurfaces.card)}>
        <div className="grid gap-3 md:grid-cols-3">
          <div className="rounded-md border border-border bg-background px-3 py-2">
            <p className={houseTypography.fieldLabel}>Workspace</p>
            <p className={cn('mt-1 truncate', houseTypography.text)}>
              {workspace?.name || workspaceId || 'Unknown workspace'}
            </p>
          </div>
          <div className="rounded-md border border-border bg-background px-3 py-2">
            <p className={houseTypography.fieldLabel}>Owner</p>
            <p className={cn('mt-1 truncate', houseTypography.text)}>{workspace?.ownerName || 'Unknown owner'}</p>
          </div>
          <div className="rounded-md border border-border bg-background px-3 py-2">
            <p className={houseTypography.fieldLabel}>Collaborators</p>
            <p className={cn('mt-1 truncate', houseTypography.text)}>
              {workspace?.collaborators.length ? workspace.collaborators.join(', ') : '-'}
            </p>
          </div>
        </div>

        <div className="space-y-2">
          <label htmlFor="workspace-inbox-message" className={houseTypography.fieldLabel}>New message</label>
          <div className="flex flex-col gap-2 md:flex-row">
            <Input
              id="workspace-inbox-message"
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              placeholder="Write an inbox message..."
              className={cn('md:flex-1', houseForms.input)}
              disabled={sending}
            />
            <Button
              type="button"
              onClick={() => void onSend()}
              className={cn('md:min-w-[10rem]', houseForms.actionButtonPrimary, houseTypography.buttonText)}
              disabled={sending}
            >
              {sending ? 'Sending...' : 'Send encrypted'}
            </Button>
          </div>
          {status ? <p className={houseTypography.fieldHelper}>{status}</p> : null}
          {error ? <p className="text-sm text-[hsl(var(--tone-danger-700))]">{error}</p> : null}
        </div>
      </section>

      <section className={cn('rounded-lg border border-border', houseSurfaces.card)}>
        <div className="border-b border-border px-4 py-3">
          <h2 className={houseTypography.sectionTitle}>Conversation</h2>
        </div>
        <ScrollArea className="max-h-sz-520">
          <div className="space-y-2 p-3">
            {loadingMessages ? (
              <p className={houseTypography.fieldHelper}>Decrypting inbox messages...</p>
            ) : messages.length === 0 ? (
              <p className={houseTypography.fieldHelper}>No messages yet.</p>
            ) : (
              messages.map((message) => (
                <article
                  key={message.id}
                  className="rounded-md border border-border bg-background px-3 py-2"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className={houseTypography.fieldLabel}>{message.senderName}</p>
                    <p className={houseTypography.fieldHelper}>{formatTimestamp(message.createdAt)}</p>
                  </div>
                  <p className={cn('mt-1 whitespace-pre-wrap', houseTypography.text)}>{message.body}</p>
                </article>
              ))
            )}
          </div>
        </ScrollArea>
      </section>
    </section>
  )
}
