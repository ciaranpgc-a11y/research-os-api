import { type FormEvent, useCallback, useEffect, useRef, useState } from 'react'
import { Navigate } from 'react-router-dom'
import { Copy, KeyRound, RefreshCw, ShieldCheck, Trash2, X } from 'lucide-react'

import {
  extractListCodes,
  extractCreateCode,
  extractRevokeCode,
  getExtractSessionToken,
  isExtractAdmin,
  type ExtractAccessCodeEntry,
} from '@/lib/extract-auth'
import { cn } from '@/lib/utils'

const RECENT_ACCESS_WINDOW_MS = 7 * 24 * 60 * 60 * 1000
const GENERATED_CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'

function timeAgo(iso: string | null): string {
  if (!iso) return 'Never'
  const diff = Date.now() - new Date(iso).getTime()
  const mins = Math.floor(diff / 60_000)
  if (mins < 1) return 'Just now'
  if (mins < 60) return `${mins}m ago`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  return `${days}d ago`
}

function formatDate(iso: string | null): string {
  if (!iso) return '-'
  return new Date(iso).toLocaleDateString(undefined, {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  })
}

function usedRecently(iso: string | null): boolean {
  if (!iso) return false
  return Date.now() - new Date(iso).getTime() <= RECENT_ACCESS_WINDOW_MS
}

function createGeneratedCode(): string {
  const values = new Uint32Array(8)
  crypto.getRandomValues(values)
  const segment = (start: number) =>
    Array.from({ length: 4 }, (_, offset) => GENERATED_CODE_ALPHABET[values[start + offset] % GENERATED_CODE_ALPHABET.length]).join('')
  return `EXT-${segment(0)}-${segment(4)}`
}

async function copyTextToClipboard(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text)
      return true
    }
  } catch {
    // fall through
  }

  try {
    const textarea = document.createElement('textarea')
    textarea.value = text
    textarea.setAttribute('readonly', '')
    textarea.style.position = 'absolute'
    textarea.style.left = '-9999px'
    document.body.appendChild(textarea)
    textarea.select()
    const copied = document.execCommand('copy')
    document.body.removeChild(textarea)
    return copied
  } catch {
    return false
  }
}

function StatPill({
  label,
  value,
  tone = 'neutral',
}: {
  label: string
  value: number
  tone?: 'neutral' | 'positive' | 'accent'
}) {
  return (
    <div
      className={cn(
        'inline-flex min-w-[8.5rem] items-center justify-between gap-4 rounded-lg border px-3 py-2',
        tone === 'neutral' && 'border-[hsl(var(--stroke-soft)/0.72)] bg-white',
        tone === 'positive' && 'border-[hsl(163_22%_80%)] bg-[hsl(162_22%_94%)]',
        tone === 'accent' && 'border-[hsl(var(--tone-accent-200))] bg-[hsl(var(--tone-accent-50))]',
      )}
    >
      <span className="text-xs font-semibold uppercase tracking-[0.08em] text-[hsl(var(--tone-neutral-600))]">{label}</span>
      <span className="text-lg font-semibold tabular-nums text-[hsl(var(--foreground))]">{value}</span>
    </div>
  )
}

export function ExtractAdminPage() {
  const admin = isExtractAdmin()

  const [codes, setCodes] = useState<ExtractAccessCodeEntry[]>([])
  const [newName, setNewName] = useState('')
  const [newCode, setNewCode] = useState('')
  const [creating, setCreating] = useState(false)
  const [createError, setCreateError] = useState<string | null>(null)
  const [createdCode, setCreatedCode] = useState<{ name: string; code: string } | null>(null)
  const [copyState, setCopyState] = useState<'idle' | 'copied' | 'error'>('idle')
  const [menu, setMenu] = useState<{ x: number; y: number; entry: ExtractAccessCodeEntry } | null>(null)
  const menuRef = useRef<HTMLDivElement>(null)

  const loadCodes = useCallback(async () => {
    const token = getExtractSessionToken()
    if (!token) return
    try {
      const list = await extractListCodes(token)
      setCodes(list)
    } catch {
      // Keep the existing view if refresh fails.
    }
  }, [])

  useEffect(() => {
    if (!admin) return
    setNewCode((current) => current || createGeneratedCode())
  }, [admin])

  useEffect(() => {
    if (!admin) return
    void loadCodes()
  }, [admin, loadCodes])

  useEffect(() => {
    if (!menu) return
    const close = (event: MouseEvent) => {
      if (menuRef.current?.contains(event.target as Node)) return
      setMenu(null)
    }
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setMenu(null)
    }
    document.addEventListener('mousedown', close)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', close)
      document.removeEventListener('keydown', onKey)
    }
  }, [menu])

  if (!admin) {
    return <Navigate to="/extract-cohort" replace />
  }

  const handleGenerateCode = () => {
    setNewCode(createGeneratedCode())
    setCreateError(null)
    setCopyState('idle')
  }

  const handleCopy = async (text: string) => {
    const copied = await copyTextToClipboard(text)
    setCopyState(copied ? 'copied' : 'error')
  }

  const handleCreate = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!newName.trim()) return

    const codeToCreate = newCode.trim() || createGeneratedCode()
    setCreating(true)
    setCreateError(null)
    setCreatedCode(null)
    setCopyState('idle')
    try {
      const token = getExtractSessionToken()
      if (!token) throw new Error('Missing admin session')
      await extractCreateCode(token, newName.trim(), codeToCreate)
      setCreatedCode({ name: newName.trim(), code: codeToCreate })
      setNewName('')
      setNewCode(createGeneratedCode())
      await loadCodes()
    } catch {
      setCreateError('Unable to create access code.')
    } finally {
      setCreating(false)
    }
  }

  const handleRevoke = async (id: string, name: string) => {
    if (!confirm(`Remove access for ${name}?`)) return
    const token = getExtractSessionToken()
    if (!token) return
    try {
      await extractRevokeCode(token, id)
      setCodes((previous) => previous.filter((entry) => entry.id !== id))
      setMenu(null)
    } catch {
      await loadCodes()
    }
  }

  const issuedCodes = codes.filter((entry) => entry.id !== 'admin' && entry.is_active)
  const activeCount = issuedCodes.length
  const recentCount = issuedCodes.filter((entry) => usedRecently(entry.last_accessed_at)).length
  const totalSessions = issuedCodes.reduce((sum, entry) => sum + Number(entry.session_count || 0), 0)

  return (
    <div data-house-role="page" className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="border-l-4 border-[hsl(var(--tone-accent-500))] pl-4">
          <h1 className="text-2xl font-semibold tracking-[-0.02em] text-[hsl(var(--foreground))]">Access management</h1>
        </div>
        <div className="flex flex-wrap gap-2">
          <StatPill label="Active" value={activeCount} tone="positive" />
          <StatPill label="Recent" value={recentCount} tone="accent" />
          <StatPill label="Sessions" value={totalSessions} />
        </div>
      </div>

      <section className="overflow-hidden rounded-lg border border-[hsl(var(--stroke-soft)/0.72)] bg-white shadow-[0_10px_30px_rgba(15,23,42,0.05)]">
        <div className="flex items-center justify-between gap-3 border-b border-[hsl(var(--stroke-soft)/0.72)] bg-[hsl(var(--tone-neutral-50))] px-4 py-3">
          <h2 className="text-sm font-semibold text-[hsl(var(--foreground))]">Issue access code</h2>
          <KeyRound className="h-4 w-4 text-[hsl(var(--tone-accent-600))]" />
        </div>

        <form onSubmit={handleCreate} className="grid gap-3 p-4 xl:grid-cols-[minmax(0,18rem)_minmax(0,25rem)_auto_auto] xl:items-end">
          <label className="grid gap-1.5">
            <span className="house-field-label">Name</span>
            <input
              type="text"
              value={newName}
              onChange={(event) => setNewName(event.target.value)}
              placeholder="Rui Li"
              autoComplete="off"
              className="house-input h-10 rounded-lg px-3 py-2 text-sm"
            />
          </label>

          <label className="grid gap-1.5">
            <span className="house-field-label">Access code</span>
            <input
              type="text"
              value={newCode}
              onChange={(event) => setNewCode(event.target.value.toUpperCase())}
              placeholder="EXT-XXXX-XXXX"
              autoComplete="off"
              autoCorrect="off"
              spellCheck={false}
              inputMode="text"
              className="house-input h-10 rounded-lg px-3 py-2 font-mono text-sm tracking-[0.12em]"
            />
          </label>

          <button
            type="button"
            onClick={handleGenerateCode}
            className="inline-flex h-10 items-center justify-center gap-2 rounded-md border border-[hsl(var(--border))] bg-white px-3 text-sm font-semibold text-[hsl(var(--foreground))] hover:bg-[hsl(var(--tone-neutral-50))]"
          >
            <RefreshCw className="h-4 w-4" />
            Generate
          </button>

          <button
            type="submit"
            disabled={creating || !newName.trim()}
            className="inline-flex h-10 items-center justify-center gap-2 rounded-md bg-[hsl(var(--tone-accent-600))] px-4 text-sm font-semibold text-white hover:bg-[hsl(var(--tone-accent-700))] disabled:cursor-not-allowed disabled:opacity-55"
          >
            <ShieldCheck className="h-4 w-4" />
            {creating ? 'Issuing...' : 'Issue code'}
          </button>
        </form>

        {createdCode && (
          <div className="mx-4 mb-4 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-[hsl(163_22%_78%)] bg-[hsl(162_22%_94%)] px-3 py-2.5">
            <div className="min-w-0">
              <span className="text-sm font-medium text-[hsl(var(--foreground))]">{createdCode.name}</span>
              <span className="ml-3 rounded-md bg-white px-2 py-1 font-mono text-xs tracking-[0.12em] text-[hsl(var(--foreground))]">
                {createdCode.code}
              </span>
            </div>
            <button
              type="button"
              onClick={() => void handleCopy(createdCode.code)}
              className="inline-flex h-8 items-center gap-1.5 rounded-md border border-[hsl(163_22%_72%)] bg-white px-2.5 text-xs font-semibold text-[hsl(164_30%_28%)] hover:bg-[hsl(162_22%_96%)]"
            >
              <Copy className="h-3.5 w-3.5" />
              {copyState === 'copied' ? 'Copied' : copyState === 'error' ? 'Retry' : 'Copy'}
            </button>
          </div>
        )}

        {createError && (
          <div className="mx-4 mb-4 rounded-lg border border-[hsl(var(--tone-danger-200))] bg-[hsl(var(--tone-danger-50))] px-3 py-2 text-sm text-[hsl(var(--tone-danger-700))]">
            {createError}
          </div>
        )}
      </section>

      <section className="overflow-hidden rounded-lg border border-[hsl(var(--stroke-soft)/0.72)] bg-white shadow-[0_10px_30px_rgba(15,23,42,0.05)]">
        <div className="border-b border-[hsl(var(--stroke-soft)/0.72)] bg-[hsl(var(--tone-neutral-50))] px-4 py-3">
          <h2 className="text-sm font-semibold text-[hsl(var(--foreground))]">Active access codes</h2>
        </div>

        <div className="p-4">
          <div className="overflow-hidden rounded-lg border border-[hsl(var(--stroke-soft)/0.72)]">
            <table className="w-full table-fixed border-collapse text-sm">
              <colgroup>
                <col style={{ width: '34%' }} />
                <col style={{ width: '18%' }} />
                <col style={{ width: '20%' }} />
                <col style={{ width: '12%' }} />
                <col style={{ width: '16%' }} />
              </colgroup>
              <thead className="bg-[hsl(var(--tone-neutral-50))]">
                <tr>
                  <th className="border-b border-[hsl(var(--stroke-soft)/0.72)] px-4 py-2.5 text-left text-xs font-semibold text-[hsl(var(--tone-neutral-700))]">Name</th>
                  <th className="border-b border-[hsl(var(--stroke-soft)/0.72)] px-3 py-2.5 text-left text-xs font-semibold text-[hsl(var(--tone-neutral-700))]">Created</th>
                  <th className="border-b border-[hsl(var(--stroke-soft)/0.72)] px-3 py-2.5 text-left text-xs font-semibold text-[hsl(var(--tone-neutral-700))]">Last access</th>
                  <th className="border-b border-[hsl(var(--stroke-soft)/0.72)] px-3 py-2.5 text-right text-xs font-semibold text-[hsl(var(--tone-neutral-700))]">Sessions</th>
                  <th className="border-b border-[hsl(var(--stroke-soft)/0.72)] px-4 py-2.5 text-right text-xs font-semibold text-[hsl(var(--tone-neutral-700))]">Action</th>
                </tr>
              </thead>
              <tbody>
                {issuedCodes.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="px-4 py-8 text-center text-sm text-[hsl(var(--muted-foreground))]">
                      No active access codes.
                    </td>
                  </tr>
                ) : issuedCodes.map((entry) => (
                  <tr key={entry.id} className="border-b border-[hsl(var(--stroke-soft)/0.42)] last:border-b-0 hover:bg-[hsl(var(--tone-neutral-50)/0.6)]">
                    <td className="px-4 py-3">
                      <button
                        type="button"
                        onContextMenu={(event) => {
                          event.preventDefault()
                          setCopyState('idle')
                          setMenu({
                            x: Math.min(event.clientX, window.innerWidth - 260),
                            y: Math.min(event.clientY, window.innerHeight - 180),
                            entry,
                          })
                        }}
                        className="max-w-full truncate rounded-md px-1 py-0.5 text-left font-medium text-[hsl(var(--foreground))] hover:bg-[hsl(var(--tone-accent-50))]"
                        title="Right-click to view access code"
                      >
                        {entry.name}
                      </button>
                    </td>
                    <td className="whitespace-nowrap px-3 py-3 text-[hsl(var(--tone-neutral-600))]">{formatDate(entry.created_at)}</td>
                    <td className="whitespace-nowrap px-3 py-3 text-[hsl(var(--tone-neutral-600))]">{timeAgo(entry.last_accessed_at)}</td>
                    <td className="px-3 py-3 text-right tabular-nums text-[hsl(var(--foreground))]">{entry.session_count}</td>
                    <td className="px-4 py-3 text-right">
                      <button
                        type="button"
                        onClick={() => void handleRevoke(entry.id, entry.name)}
                        className="inline-flex h-8 items-center justify-center gap-1.5 rounded-md border border-[hsl(var(--tone-danger-300))] bg-white px-3 text-xs font-semibold text-[hsl(var(--tone-danger-600))] hover:bg-[hsl(var(--tone-danger-50))]"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                        Remove
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      {menu && (
        <div
          ref={menuRef}
          className="fixed z-50 w-[250px] overflow-hidden rounded-lg border border-[hsl(var(--stroke-soft)/0.8)] bg-white shadow-[0_16px_38px_rgba(15,23,42,0.18)]"
          style={{ left: menu.x, top: menu.y }}
        >
          <div className="flex items-center justify-between gap-2 border-b border-[hsl(var(--stroke-soft)/0.65)] bg-[hsl(var(--tone-neutral-50))] px-3 py-2">
            <div className="min-w-0 truncate text-sm font-semibold text-[hsl(var(--foreground))]">{menu.entry.name}</div>
            <button
              type="button"
              onClick={() => setMenu(null)}
              className="inline-flex h-7 w-7 items-center justify-center rounded-md text-[hsl(var(--muted-foreground))] hover:bg-white"
              aria-label="Close access code menu"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
          <div className="space-y-3 p-3">
            {menu.entry.code ? (
              <>
                <div className="rounded-md border border-[hsl(var(--stroke-soft)/0.72)] bg-[hsl(var(--tone-neutral-50))] px-3 py-2 font-mono text-sm tracking-[0.12em] text-[hsl(var(--foreground))]">
                  {menu.entry.code}
                </div>
                <button
                  type="button"
                  onClick={() => void handleCopy(menu.entry.code || '')}
                  className="inline-flex h-8 w-full items-center justify-center gap-1.5 rounded-md bg-[hsl(var(--tone-accent-600))] px-3 text-xs font-semibold text-white hover:bg-[hsl(var(--tone-accent-700))]"
                >
                  <Copy className="h-3.5 w-3.5" />
                  {copyState === 'copied' ? 'Copied' : copyState === 'error' ? 'Retry copy' : 'Copy code'}
                </button>
              </>
            ) : (
              <p className="text-sm leading-5 text-[hsl(var(--muted-foreground))]">
                Code not available for older entries. Generate a new code if needed.
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
