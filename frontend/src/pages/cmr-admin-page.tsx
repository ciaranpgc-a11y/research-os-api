import { type FormEvent, useCallback, useEffect, useState } from 'react'
import {
  Clock3,
  Copy,
  KeyRound,
  RefreshCw,
  ShieldCheck,
  type LucideIcon,
} from 'lucide-react'

import { SectionMarker } from '@/components/patterns'
import { CardHeader, CardPrimitive, CardTitle, PageHeader, Row, Stack } from '@/components/primitives'
import {
  cmrAdminCreateCode,
  cmrAdminListCodes,
  cmrAdminLogin,
  cmrAdminRevokeCode,
  cmrCheckSession,
  getCmrSessionToken,
  isCmrAdmin,
  setCmrSession,
  type CmrAccessCodeEntry,
} from '@/lib/cmr-auth'
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
  return `CMR-${segment(0)}-${segment(4)}`
}

async function copyTextToClipboard(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text)
      return true
    }
  } catch {
    // fall through to legacy path
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

function AdminMetricCard({
  icon: Icon,
  label,
  value,
  description,
}: {
  icon: LucideIcon
  label: string
  value: string
  description: string
}) {
  return (
    <CardPrimitive className="overflow-hidden border-[hsl(var(--section-style-admin-accent)/0.14)] bg-[hsl(var(--card))] shadow-[0_20px_48px_rgba(20,35,46,0.06)]">
      <div className="flex h-full flex-col gap-4 p-[var(--space-4)]">
        <div className="flex items-center justify-between gap-4">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[hsl(var(--section-style-admin-accent))]">
            {label}
          </p>
          <span className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-[hsl(var(--section-style-admin-accent)/0.16)] bg-[hsl(var(--tone-accent-50))] text-[hsl(var(--section-style-admin-accent))]">
            <Icon className="h-4 w-4" />
          </span>
        </div>
        <p className="text-[2.2rem] font-semibold tracking-[-0.05em] text-[hsl(var(--foreground))]">{value}</p>
        <p className="text-sm leading-7 text-muted-foreground">{description}</p>
      </div>
    </CardPrimitive>
  )
}

type CmrAdminPageProps = {
  standalone?: boolean
}

export function CmrAdminPage({ standalone = false }: CmrAdminPageProps) {
  const [phase, setPhase] = useState<'login' | 'checking' | 'panel'>('checking')
  const [password, setPassword] = useState('')
  const [loginError, setLoginError] = useState<string | null>(null)
  const [loginLoading, setLoginLoading] = useState(false)

  const [codes, setCodes] = useState<CmrAccessCodeEntry[]>([])
  const [newName, setNewName] = useState('')
  const [newCode, setNewCode] = useState('')
  const [creating, setCreating] = useState(false)
  const [createError, setCreateError] = useState<string | null>(null)
  const [createdCode, setCreatedCode] = useState<{ name: string; code: string } | null>(null)
  const [copyState, setCopyState] = useState<'idle' | 'copied' | 'error'>('idle')

  useEffect(() => {
    const token = getCmrSessionToken()
    if (!token || !isCmrAdmin()) {
      setPhase('login')
      return
    }
    cmrCheckSession(token).then((user) => {
      if (user?.is_admin) {
        setPhase('panel')
      } else {
        setPhase('login')
      }
    })
  }, [])

  useEffect(() => {
    if (phase === 'panel') {
      setNewCode((current) => current || createGeneratedCode())
    }
  }, [phase])

  const loadCodes = useCallback(async () => {
    const token = getCmrSessionToken()
    if (!token) return
    try {
      const list = await cmrAdminListCodes(token)
      setCodes(list)
    } catch {
      // Keep the existing view if the refresh fails.
    }
  }, [])

  useEffect(() => {
    if (phase === 'panel') {
      void loadCodes()
    }
  }, [phase, loadCodes])

  const handleAdminLogin = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    setLoginLoading(true)
    setLoginError(null)
    try {
      const result = await cmrAdminLogin(password.trim())
      setCmrSession(result.session_token, result.name, result.is_admin)
      window.location.href = '/cmr-admin'
    } catch {
      setLoginError('Invalid admin password')
    } finally {
      setLoginLoading(false)
    }
  }

  const handleGenerateCode = () => {
    setNewCode(createGeneratedCode())
    setCreateError(null)
    setCopyState('idle')
  }

  const handleCopyCreatedCode = async () => {
    if (!createdCode) return
    const copied = await copyTextToClipboard(createdCode.code)
    setCopyState(copied ? 'copied' : 'error')
  }

  const handleCreate = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    if (!newName.trim()) return

    const codeToCreate = newCode.trim() || createGeneratedCode()

    setCreating(true)
    setCreateError(null)
    setCreatedCode(null)
    setCopyState('idle')
    try {
      const token = getCmrSessionToken()
      if (!token) throw new Error('Missing admin session')
      await cmrAdminCreateCode(token, newName.trim(), codeToCreate)
      setCreatedCode({ name: newName.trim(), code: codeToCreate })
      setNewName('')
      setNewCode(createGeneratedCode())
      await loadCodes()
    } catch {
      setCreateError('Unable to create the access code right now.')
    } finally {
      setCreating(false)
    }
  }

  const handleRevoke = async (id: string, name: string) => {
    if (!confirm(`Revoke access for ${name}?`)) return
    const token = getCmrSessionToken()
    if (!token) return
    try {
      await cmrAdminRevokeCode(token, id)
      await loadCodes()
    } catch {
      // Keep the current list if revoke fails.
    }
  }

  const issuedCodes = codes.filter((entry) => entry.id !== 'admin')
  const issuedCount = issuedCodes.length
  const activeCount = issuedCodes.filter((entry) => entry.is_active).length
  const revokedCount = issuedCodes.filter((entry) => !entry.is_active).length
  const recentCount = issuedCodes.filter((entry) => usedRecently(entry.last_accessed_at)).length
  const adminSurfaceClassName =
    'border-[hsl(var(--section-style-admin-accent)/0.16)] bg-[linear-gradient(180deg,hsl(var(--card))_0%,hsl(var(--tone-accent-50)/0.44)_100%)] shadow-[0_20px_48px_rgba(20,35,46,0.08)]'

  const titleRow = (
    <Row align="center" gap="md" wrap={false} className="house-page-title-row">
      <SectionMarker tone="admin" size="title" className="self-stretch h-auto" />
      <PageHeader
        heading="CMR Access Management"
        description="Manage access codes inside the CMR reporting workspace."
        className="!ml-0 !mt-0"
      />
    </Row>
  )

  const loginForm = (
    <form onSubmit={handleAdminLogin} className="mt-6 space-y-4">
      <div className="space-y-2">
        <label
          htmlFor="cmr-admin-password"
          className="block text-xs font-semibold uppercase tracking-[0.14em] text-[hsl(var(--tone-neutral-600))]"
        >
          Admin password
        </label>
        <input
          id="cmr-admin-password"
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="Enter admin password"
          autoComplete="current-password"
          autoFocus
          className={cn(
            'house-input w-full',
            loginError && 'ring-2 ring-[hsl(var(--tone-danger-400))]',
          )}
        />
      </div>
      {loginError && (
        <p className="rounded-[var(--radius-sm)] border border-[hsl(var(--tone-danger-200))] bg-[hsl(var(--tone-danger-50))] px-3 py-2 text-sm text-[hsl(var(--tone-danger-700))]">
          {loginError}
        </p>
      )}
      <button
        type="submit"
        disabled={loginLoading}
        className="house-button-action-primary inline-flex h-10 w-full items-center justify-center rounded-md px-4 text-sm font-semibold disabled:cursor-not-allowed disabled:opacity-60"
      >
        {loginLoading ? 'Verifying...' : 'Unlock admin controls'}
      </button>
    </form>
  )

  if (phase === 'checking') {
    if (standalone) {
      return (
        <div className="flex min-h-screen items-center justify-center bg-background p-4">
          <CardPrimitive className={`w-full max-w-md ${adminSurfaceClassName}`}>
            <div className="p-6 text-center text-sm text-muted-foreground">
              Checking administrator access...
            </div>
          </CardPrimitive>
        </div>
      )
    }

    return (
      <Stack data-house-role="page" space="lg">
        <section data-section-key="Overview" className="scroll-mt-20 space-y-6">
          {titleRow}
          <CardPrimitive className={adminSurfaceClassName}>
            <div className="p-[var(--space-4)] text-sm text-muted-foreground">
              Checking administrator access...
            </div>
          </CardPrimitive>
        </section>
      </Stack>
    )
  }

  if (phase === 'login') {
    if (standalone) {
      return (
        <div className="flex min-h-screen items-center justify-center bg-background p-4">
          <CardPrimitive className={`w-full max-w-md overflow-hidden ${adminSurfaceClassName}`}>
            <div className="border-b border-[hsl(var(--section-style-admin-accent)/0.14)] px-6 py-6">
              <h1 className="text-[2rem] font-semibold tracking-[-0.04em] text-[hsl(var(--foreground))]">
                CMR Access Management
              </h1>
              <p className="mt-3 text-sm leading-7 text-muted-foreground">
                Enter your administrator password to continue.
              </p>
            </div>
            <div className="p-6">{loginForm}</div>
          </CardPrimitive>
        </div>
      )
    }

    return (
      <Stack data-house-role="page" space="lg">
        <section data-section-key="Overview" className="scroll-mt-20 space-y-6">
          {titleRow}

          <div className="max-w-xl">
            <CardPrimitive className={adminSurfaceClassName}>
              <CardHeader>
                <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[hsl(var(--section-style-admin-accent))]">
                  Verification
                </p>
                <CardTitle>Unlock admin controls</CardTitle>
              </CardHeader>
              <div className="px-[var(--space-3)] pb-[var(--space-3)]">{loginForm}</div>
            </CardPrimitive>
          </div>
        </section>
      </Stack>
    )
  }

  return (
    <Stack data-house-role="page" space="lg">
      <section data-section-key="Overview" className="scroll-mt-20 space-y-6">
        {titleRow}

        <div className="grid gap-3 xl:grid-cols-3">
          <AdminMetricCard
            icon={KeyRound}
            label="Issued Codes"
            value={String(issuedCount)}
            description="Tracked access codes."
          />
          <AdminMetricCard
            icon={ShieldCheck}
            label="Active"
            value={String(activeCount)}
            description="Codes that can still sign in."
          />
          <AdminMetricCard
            icon={Clock3}
            label="Recent Use"
            value={String(recentCount)}
            description="Codes used in the last 7 days."
          />
        </div>
      </section>

      <section data-section-key="Access Codes" className="scroll-mt-20">
        <div className="space-y-6">
          <CardPrimitive className={adminSurfaceClassName}>
            <CardHeader className="border-b border-[hsl(var(--border))]">
              <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                <div className="space-y-2">
                  <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[hsl(var(--section-style-admin-accent))]">
                    Issue Code
                  </p>
                  <CardTitle>Issue a new access code</CardTitle>
                </div>
                <div className="rounded-full border border-[hsl(var(--section-style-admin-accent)/0.14)] bg-[hsl(var(--tone-accent-50))] px-3 py-1 text-xs font-semibold text-[hsl(var(--tone-accent-800))]">
                  Generate or enter a code
                </div>
              </div>
            </CardHeader>

            <div className="space-y-5 px-[var(--space-3)] pb-[var(--space-3)]">
              {createdCode && (
                <div className="rounded-[var(--radius-md)] border border-[hsl(var(--tone-positive-300))] bg-[hsl(var(--tone-positive-50))] p-[var(--space-3)]">
                  <div className="flex items-start justify-between gap-4">
                    <div className="min-w-0 space-y-2">
                      <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[hsl(var(--tone-positive-700))]">
                        Code ready
                      </p>
                      <p className="text-sm text-[hsl(var(--tone-positive-900))]">
                        Created for <span className="font-semibold">{createdCode.name}</span>
                      </p>
                      <p className="rounded-[var(--radius-sm)] border border-[hsl(var(--tone-positive-200))] bg-white px-3 py-2 font-mono text-sm tracking-[0.18em] text-[hsl(var(--tone-neutral-900))]">
                        {createdCode.code}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={handleCopyCreatedCode}
                      className="house-button-action inline-flex h-10 shrink-0 items-center gap-2 rounded-md px-3 text-sm font-semibold"
                    >
                      <Copy className="h-4 w-4" />
                      {copyState === 'copied' ? 'Copied' : copyState === 'error' ? 'Retry copy' : 'Copy'}
                    </button>
                  </div>
                </div>
              )}

              {createError && (
                <p className="rounded-[var(--radius-md)] border border-[hsl(var(--tone-danger-200))] bg-[hsl(var(--tone-danger-50))] px-3 py-2 text-sm text-[hsl(var(--tone-danger-700))]">
                  {createError}
                </p>
              )}

              <form onSubmit={handleCreate} className="grid gap-4 xl:grid-cols-[minmax(0,18rem)_minmax(0,22rem)_auto] xl:items-end">
                <div className="space-y-2">
                  <label
                    htmlFor="cmr-code-name"
                    className="block text-xs font-semibold uppercase tracking-[0.14em] text-[hsl(var(--tone-neutral-600))]"
                  >
                    Name
                  </label>
                  <input
                    id="cmr-code-name"
                    value={newName}
                    onChange={(e) => setNewName(e.target.value)}
                    placeholder="Dr. Smith"
                    className="house-input w-full"
                  />
                </div>

                <div className="space-y-2">
                  <label
                    htmlFor="cmr-issued-code"
                    className="block text-xs font-semibold uppercase tracking-[0.14em] text-[hsl(var(--tone-neutral-600))]"
                  >
                    Access code
                  </label>
                  <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto]">
                    <input
                      id="cmr-issued-code"
                      value={newCode}
                      onChange={(e) => setNewCode(e.target.value.toUpperCase())}
                      placeholder="CMR-XXXX-XXXX"
                      className="house-input w-full font-mono tracking-[0.16em]"
                    />
                    <button
                      type="button"
                      onClick={handleGenerateCode}
                      className="house-button-action inline-flex h-10 items-center justify-center gap-2 rounded-md px-3 text-sm font-semibold"
                    >
                      <RefreshCw className="h-4 w-4" />
                      Generate
                    </button>
                  </div>
                </div>

                <div className="flex items-end">
                  <button
                    type="submit"
                    disabled={creating || !newName.trim()}
                    className="house-button-action-primary inline-flex h-10 w-full items-center justify-center rounded-md px-4 text-sm font-semibold disabled:cursor-not-allowed disabled:opacity-60 xl:min-w-[14rem]"
                  >
                    {creating ? 'Issuing code...' : 'Issue access code'}
                  </button>
                </div>
              </form>
            </div>
          </CardPrimitive>

          <CardPrimitive className="overflow-hidden shadow-[0_20px_48px_rgba(20,35,46,0.08)]">
            <CardHeader className="border-b border-[hsl(var(--border))]">
              <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                <div className="space-y-2">
                  <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[hsl(var(--section-style-admin-accent))]">
                    Access Codes
                  </p>
                  <CardTitle>Issued access codes</CardTitle>
                </div>
                <div className="rounded-full border border-[hsl(var(--section-style-admin-accent)/0.14)] bg-[hsl(var(--tone-accent-50))] px-3 py-1 text-xs font-semibold text-[hsl(var(--tone-accent-800))]">
                  {activeCount} active / {revokedCount} revoked
                </div>
              </div>
            </CardHeader>

            <div className="p-[var(--space-3)] pt-0">
              <div className="house-table-context-admin overflow-hidden rounded-[var(--radius-md)] border border-[hsl(var(--border))] bg-[hsl(var(--card))]">
                <table data-house-no-column-resize="true" className="w-full table-fixed border-collapse text-sm">
                  <colgroup>
                    <col style={{ width: '34%' }} />
                    <col style={{ width: '16%' }} />
                    <col style={{ width: '16%' }} />
                    <col style={{ width: '12%' }} />
                    <col style={{ width: '12%' }} />
                    <col style={{ width: '10%' }} />
                  </colgroup>
                  <thead className="house-table-head">
                    <tr>
                      <th className="house-table-head-text px-4 py-3 text-left">Name</th>
                      <th className="house-table-head-text px-4 py-3 text-left">Created</th>
                      <th className="house-table-head-text px-4 py-3 text-left">Last access</th>
                      <th className="house-table-head-text px-4 py-3 text-right">Sessions</th>
                      <th className="house-table-head-text px-4 py-3 text-center">Status</th>
                      <th className="house-table-head-text px-4 py-3 text-right">Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {issuedCodes.map((entry) => (
                      <tr
                        key={entry.id}
                        className="house-table-row border-b border-[hsl(var(--stroke-soft)/0.42)] last:border-b-0 hover:bg-[hsl(var(--tone-neutral-50)/0.72)]"
                      >
                        <td className="house-table-cell-text break-words px-4 py-3 font-medium text-[hsl(var(--foreground))]">
                          {entry.name}
                        </td>
                        <td className="house-table-cell-text px-4 py-3 text-[hsl(var(--tone-neutral-600))]">
                          {formatDate(entry.created_at)}
                        </td>
                        <td className="house-table-cell-text px-4 py-3 text-[hsl(var(--tone-neutral-600))]">
                          {timeAgo(entry.last_accessed_at)}
                        </td>
                        <td className="house-table-cell-text px-4 py-3 text-right tabular-nums text-[hsl(var(--foreground))]">
                          {entry.session_count}
                        </td>
                        <td className="house-table-cell-text px-4 py-3 text-center">
                          <span
                            className={cn(
                              'inline-flex items-center rounded-full px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.12em]',
                              entry.is_active
                                ? 'border border-[hsl(var(--tone-positive-300))] bg-[hsl(var(--tone-positive-50))] text-[hsl(var(--tone-positive-800))]'
                                : 'border border-[hsl(var(--tone-danger-300))] bg-[hsl(var(--tone-danger-50))] text-[hsl(var(--tone-danger-800))]',
                            )}
                          >
                            {entry.is_active ? 'Active' : 'Revoked'}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-right">
                          {entry.is_active ? (
                            <button
                              type="button"
                              onClick={() => handleRevoke(entry.id, entry.name)}
                              className="house-button-action-danger inline-flex h-8 items-center justify-center rounded-md px-3 text-xs font-semibold whitespace-nowrap"
                            >
                              Revoke
                            </button>
                          ) : (
                            <span className="text-xs text-muted-foreground">-</span>
                          )}
                        </td>
                      </tr>
                    ))}

                    {issuedCodes.length === 0 && (
                      <tr>
                        <td
                          colSpan={6}
                          className="px-4 py-8 text-center text-sm text-[hsl(var(--tone-neutral-600))]"
                        >
                          No access codes issued yet. Generate the first one from the form above.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </CardPrimitive>
        </div>
      </section>
    </Stack>
  )
}
