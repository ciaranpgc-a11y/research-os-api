import { type FormEvent, useCallback, useEffect, useState } from 'react'

import { SectionMarker } from '@/components/patterns'
import { PageHeader, Row, Stack } from '@/components/primitives'
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

function timeAgo(iso: string | null): string {
  if (!iso) return '-'
  const diff = Date.now() - new Date(iso).getTime()
  const mins = Math.floor(diff / 60_000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m ago`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  return `${days}d ago`
}

function usedRecently(iso: string | null): boolean {
  if (!iso) return false
  return Date.now() - new Date(iso).getTime() <= RECENT_ACCESS_WINDOW_MS
}

function AdminMetricCard({
  label,
  value,
  description,
}: {
  label: string
  value: string
  description: string
}) {
  return (
    <div className="rounded-[1.25rem] border border-[rgba(19,35,46,0.1)] bg-white/94 p-5 shadow-[0_18px_44px_rgba(20,35,46,0.06)]">
      <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[hsl(var(--tone-warning-700))]">
        {label}
      </p>
      <p className="mt-3 text-3xl font-semibold tracking-[-0.04em] text-foreground">{value}</p>
      <p className="mt-2 text-sm leading-6 text-muted-foreground">{description}</p>
    </div>
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

  const loadCodes = useCallback(async () => {
    const token = getCmrSessionToken()
    if (!token) return
    try {
      const list = await cmrAdminListCodes(token)
      setCodes(list)
    } catch {
      // ignore
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

  const handleCreate = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    if (!newName.trim() || !newCode.trim()) return
    setCreating(true)
    try {
      const token = getCmrSessionToken()!
      await cmrAdminCreateCode(token, newName.trim(), newCode.trim())
      setNewName('')
      setNewCode('')
      await loadCodes()
    } catch {
      // ignore
    } finally {
      setCreating(false)
    }
  }

  const handleRevoke = async (id: string, name: string) => {
    if (!confirm(`Revoke access for ${name}?`)) return
    const token = getCmrSessionToken()!
    try {
      await cmrAdminRevokeCode(token, id)
      await loadCodes()
    } catch {
      // ignore
    }
  }

  const activeCodes = codes.filter((c) => c.id !== 'admin')
  const issuedCount = activeCodes.length
  const activeCount = activeCodes.filter((c) => c.is_active).length
  const revokedCount = activeCodes.filter((c) => !c.is_active).length
  const recentCount = activeCodes.filter((c) => usedRecently(c.last_accessed_at)).length

  const titleRow = (
    <Row align="center" gap="md" wrap={false} className="house-page-title-row">
      <SectionMarker tone="warning" size="title" className="self-stretch h-auto" />
      <PageHeader
        eyebrow="Administrator"
        heading="CMR Access Management"
        description="Issue, monitor, and revoke access codes without leaving the CMR reporting workspace."
        className="!ml-0 !mt-0"
      />
    </Row>
  )

  const loginForm = (
    <form onSubmit={handleAdminLogin} className="mt-6 space-y-4">
      <input
        type="password"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        placeholder="Admin password"
        autoComplete="current-password"
        autoFocus
        className={cn('house-input w-full', loginError && 'ring-2 ring-[hsl(var(--tone-danger-400))]')}
      />
      {loginError && (
        <p className="text-xs text-[hsl(var(--tone-danger-500))]">{loginError}</p>
      )}
      <button type="submit" disabled={loginLoading} className="house-button-primary w-full">
        {loginLoading ? 'Verifying...' : 'Unlock admin controls'}
      </button>
    </form>
  )

  if (phase === 'checking') {
    if (standalone) {
      return (
        <div className="flex min-h-screen items-center justify-center bg-background p-4 text-sm text-muted-foreground">
          Checking administrator access...
        </div>
      )
    }

    return (
      <Stack data-house-role="page" space="lg">
        <section data-section-key="Overview" className="scroll-mt-20">
          {titleRow}
        </section>
        <div className="rounded-[1.5rem] border border-[rgba(19,35,46,0.1)] bg-white/92 p-6 text-sm text-muted-foreground shadow-[0_18px_44px_rgba(20,35,46,0.06)]">
          Checking administrator access...
        </div>
      </Stack>
    )
  }

  if (phase === 'login') {
    if (standalone) {
      return (
        <div className="flex min-h-screen items-center justify-center bg-background p-4">
          <div className="w-full max-w-md rounded-[1.75rem] border border-[rgba(19,35,46,0.1)] bg-white/94 p-7 shadow-[0_22px_70px_rgba(20,35,46,0.08)] sm:p-8">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[hsl(var(--tone-warning-700))]">
              Administrator
            </p>
            <h1 className="mt-3 text-2xl font-semibold tracking-[-0.03em] text-foreground">
              CMR access management
            </h1>
            <p className="mt-3 text-sm leading-7 text-muted-foreground">
              Enter your administrator password to unlock access-code management.
            </p>
            {loginForm}
          </div>
        </div>
      )
    }

    return (
      <Stack data-house-role="page" space="lg">
        <section data-section-key="Overview" className="scroll-mt-20 space-y-6">
          {titleRow}
          <div className="grid gap-4 md:grid-cols-3">
            <AdminMetricCard
              label="Embedded"
              value="In App"
              description="Admin controls now live inside the same shell as reference tables and reporting."
            />
            <AdminMetricCard
              label="Issued Codes"
              value="Managed"
              description="Create and revoke access codes without sending people to a separate admin portal."
            />
            <AdminMetricCard
              label="Session Gate"
              value="Verified"
              description="Administrator verification unlocks access management while keeping the normal workspace flow intact."
            />
          </div>
        </section>

        <section data-section-key="Access Codes" className="scroll-mt-20">
          <div className="grid gap-6 xl:grid-cols-[minmax(0,1.1fr)_minmax(20rem,0.9fr)]">
            <div className="rounded-[1.5rem] border border-[rgba(19,35,46,0.1)] bg-white/94 p-6 shadow-[0_18px_44px_rgba(20,35,46,0.06)]">
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[hsl(var(--tone-warning-700))]">
                Access Codes
              </p>
              <h2 className="mt-3 text-2xl font-semibold tracking-[-0.03em] text-foreground">
                Manage access from inside the workspace
              </h2>
              <p className="mt-3 text-sm leading-7 text-muted-foreground">
                Verify your administrator password to issue codes, review recent use, and revoke access without leaving the CMR platform.
              </p>
              <div className="mt-5 grid gap-3 sm:grid-cols-2">
                <div className="rounded-[1.1rem] border border-[rgba(19,35,46,0.08)] bg-[hsl(var(--tone-neutral-50))] p-4">
                  <p className="text-sm font-semibold text-foreground">Issue deliberate access</p>
                  <p className="mt-2 text-sm leading-6 text-muted-foreground">
                    Create named codes for specific readers, collaborators, or cohorts.
                  </p>
                </div>
                <div className="rounded-[1.1rem] border border-[rgba(19,35,46,0.08)] bg-[hsl(var(--tone-neutral-50))] p-4">
                  <p className="text-sm font-semibold text-foreground">Control the full lifecycle</p>
                  <p className="mt-2 text-sm leading-6 text-muted-foreground">
                    Check recent access, count sessions, and revoke codes instantly when needed.
                  </p>
                </div>
              </div>
            </div>

            <div className="rounded-[1.5rem] border border-[rgba(19,35,46,0.1)] bg-white/94 p-6 shadow-[0_18px_44px_rgba(20,35,46,0.06)]">
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[hsl(var(--tone-warning-700))]">
                Administrator Verification
              </p>
              <h2 className="mt-3 text-2xl font-semibold tracking-[-0.03em] text-foreground">
                Unlock admin controls
              </h2>
              <p className="mt-3 text-sm leading-7 text-muted-foreground">
                Enter your administrator password to continue.
              </p>
              {loginForm}
            </div>
          </div>
        </section>
      </Stack>
    )
  }

  return (
    <Stack data-house-role="page" space="lg">
      <section data-section-key="Overview" className="scroll-mt-20 space-y-6">
        {titleRow}
        <div className="grid gap-4 md:grid-cols-3">
          <AdminMetricCard
            label="Issued Codes"
            value={String(issuedCount)}
            description="Named access codes currently tracked for the CMR workspace."
          />
          <AdminMetricCard
            label="Active"
            value={String(activeCount)}
            description="Codes that can still be used to sign in right now."
          />
          <AdminMetricCard
            label="Recent Use"
            value={String(recentCount)}
            description="Issued codes accessed within the last 7 days."
          />
        </div>
      </section>

      <section data-section-key="Access Codes" className="scroll-mt-20">
        <div className="grid gap-6 xl:grid-cols-[minmax(20rem,24rem)_minmax(0,1fr)]">
          <div className="rounded-[1.5rem] border border-[rgba(19,35,46,0.1)] bg-white/94 p-6 shadow-[0_18px_44px_rgba(20,35,46,0.06)]">
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[hsl(var(--tone-warning-700))]">
              Create Access Code
            </p>
            <h2 className="mt-3 text-2xl font-semibold tracking-[-0.03em] text-foreground">
              Issue a new code
            </h2>
            <p className="mt-3 text-sm leading-7 text-muted-foreground">
              Assign a clear name so you can track who the code belongs to later.
            </p>

            <form onSubmit={handleCreate} className="mt-6 space-y-4">
              <div>
                <label className="mb-1 block text-xs font-medium uppercase tracking-[0.12em] text-muted-foreground">
                  Name
                </label>
                <input
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  placeholder="Dr. Smith"
                  className="house-input w-full"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium uppercase tracking-[0.12em] text-muted-foreground">
                  Access code
                </label>
                <input
                  value={newCode}
                  onChange={(e) => setNewCode(e.target.value)}
                  placeholder="their-access-code"
                  className="house-input w-full"
                />
              </div>
              <button
                type="submit"
                disabled={creating || !newName.trim() || !newCode.trim()}
                className="house-button-primary w-full"
              >
                {creating ? 'Creating...' : 'Create access code'}
              </button>
            </form>
          </div>

          <div className="overflow-hidden rounded-[1.5rem] border border-[rgba(19,35,46,0.1)] bg-white/94 shadow-[0_18px_44px_rgba(20,35,46,0.06)]">
            <div className="flex flex-col gap-3 border-b border-border px-5 py-5 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[hsl(var(--tone-warning-700))]">
                  Access Codes
                </p>
                <h2 className="mt-2 text-2xl font-semibold tracking-[-0.03em] text-foreground">
                  Issued access codes
                </h2>
                <p className="mt-2 text-sm leading-7 text-muted-foreground">
                  Review recent access, session counts, and revoke codes when they should no longer work.
                </p>
              </div>
              <div className="rounded-full bg-[hsl(var(--tone-neutral-100))] px-3 py-1 text-xs font-medium text-muted-foreground">
                {activeCount} active · {revokedCount} revoked
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border bg-muted/50 text-xs font-medium text-muted-foreground">
                    <th className="px-4 py-2 text-left">Name</th>
                    <th className="px-4 py-2 text-left">Last access</th>
                    <th className="px-4 py-2 text-right">Sessions</th>
                    <th className="px-4 py-2 text-center">Status</th>
                    <th className="px-4 py-2" />
                  </tr>
                </thead>
                <tbody>
                  {activeCodes.map((c) => (
                    <tr key={c.id} className="border-b border-border last:border-b-0">
                      <td className="px-4 py-2.5 font-medium">{c.name}</td>
                      <td className="px-4 py-2.5 text-muted-foreground">
                        {timeAgo(c.last_accessed_at)}
                      </td>
                      <td className="px-4 py-2.5 text-right tabular-nums">{c.session_count}</td>
                      <td className="px-4 py-2.5 text-center">
                        <span
                          className={cn(
                            'inline-block rounded-full px-2 py-0.5 text-[10px] font-semibold',
                            c.is_active
                              ? 'bg-[hsl(var(--tone-positive-100))] text-[hsl(var(--tone-positive-600))]'
                              : 'bg-[hsl(var(--tone-danger-100))] text-[hsl(var(--tone-danger-600))]',
                          )}
                        >
                          {c.is_active ? 'Active' : 'Revoked'}
                        </span>
                      </td>
                      <td className="px-4 py-2.5 text-right">
                        {c.is_active && (
                          <button
                            onClick={() => handleRevoke(c.id, c.name)}
                            className="text-xs text-muted-foreground underline hover:text-[hsl(var(--tone-danger-500))]"
                          >
                            Revoke
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                  {activeCodes.length === 0 && (
                    <tr>
                      <td colSpan={5} className="px-4 py-6 text-center text-muted-foreground">
                        No access codes yet
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </section>
    </Stack>
  )
}
