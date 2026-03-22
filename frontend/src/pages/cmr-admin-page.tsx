import { useCallback, useEffect, useState } from 'react'

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

function timeAgo(iso: string | null): string {
  if (!iso) return '—'
  const diff = Date.now() - new Date(iso).getTime()
  const mins = Math.floor(diff / 60_000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m ago`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  return `${days}d ago`
}

export function CmrAdminPage() {
  const [phase, setPhase] = useState<'login' | 'checking' | 'panel'>('checking')
  const [password, setPassword] = useState('')
  const [loginError, setLoginError] = useState<string | null>(null)
  const [loginLoading, setLoginLoading] = useState(false)

  const [codes, setCodes] = useState<CmrAccessCodeEntry[]>([])
  const [newName, setNewName] = useState('')
  const [newCode, setNewCode] = useState('')
  const [creating, setCreating] = useState(false)

  // Check if already has admin session
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
    if (phase === 'panel') loadCodes()
  }, [phase, loadCodes])

  const handleAdminLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoginLoading(true)
    setLoginError(null)
    try {
      const result = await cmrAdminLogin(password.trim())
      setCmrSession(result.session_token, result.name, result.is_admin)
      setPhase('panel')
    } catch {
      setLoginError('Invalid admin password')
    } finally {
      setLoginLoading(false)
    }
  }

  const handleCreate = async (e: React.FormEvent) => {
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

  if (phase === 'checking') {
    return <div className="flex min-h-screen items-center justify-center text-sm text-muted-foreground">Checking session...</div>
  }

  if (phase === 'login') {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background p-4">
        <div className="w-full max-w-sm">
          <h1 className="mb-6 text-center text-xl font-semibold">CMR Admin</h1>
          <form onSubmit={handleAdminLogin} className="space-y-4">
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Admin password"
              autoFocus
              className={cn('house-input w-full', loginError && 'ring-2 ring-[hsl(var(--tone-danger-400))]')}
            />
            {loginError && <p className="text-xs text-[hsl(var(--tone-danger-500))]">{loginError}</p>}
            <button type="submit" disabled={loginLoading} className="house-button-primary w-full">
              {loginLoading ? 'Verifying...' : 'Sign in'}
            </button>
          </form>
        </div>
      </div>
    )
  }

  // --- Admin panel ---
  const activeCodes = codes.filter((c) => c.id !== 'admin')

  return (
    <div className="mx-auto max-w-2xl p-8">
      <h1 className="text-xl font-semibold">CMR Access Management</h1>
      <p className="mt-1 text-sm text-muted-foreground">{activeCodes.filter((c) => c.is_active).length} active access codes</p>

      {/* Add new code */}
      <form onSubmit={handleCreate} className="mt-6 flex items-end gap-3">
        <div className="flex-1">
          <label className="mb-1 block text-xs font-medium text-muted-foreground">Name</label>
          <input value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="Dr. Smith" className="house-input w-full" />
        </div>
        <div className="flex-1">
          <label className="mb-1 block text-xs font-medium text-muted-foreground">Access code</label>
          <input value={newCode} onChange={(e) => setNewCode(e.target.value)} placeholder="their-access-code" className="house-input w-full" />
        </div>
        <button type="submit" disabled={creating || !newName.trim() || !newCode.trim()} className="house-button-primary whitespace-nowrap">
          {creating ? 'Creating...' : 'Create'}
        </button>
      </form>

      {/* Codes table */}
      <div className="mt-8 overflow-hidden rounded-lg border border-border">
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
                <td className="px-4 py-2.5 text-muted-foreground">{timeAgo(c.last_accessed_at)}</td>
                <td className="px-4 py-2.5 text-right tabular-nums">{c.session_count}</td>
                <td className="px-4 py-2.5 text-center">
                  <span className={cn(
                    'inline-block rounded-full px-2 py-0.5 text-[10px] font-semibold',
                    c.is_active
                      ? 'bg-[hsl(var(--tone-positive-100))] text-[hsl(var(--tone-positive-600))]'
                      : 'bg-[hsl(var(--tone-danger-100))] text-[hsl(var(--tone-danger-600))]',
                  )}>
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
                <td colSpan={5} className="px-4 py-6 text-center text-muted-foreground">No access codes yet</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
