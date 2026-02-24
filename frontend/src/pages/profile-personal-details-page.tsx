import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'

import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { getAuthSessionToken } from '@/lib/auth-session'
import { fetchMe, fetchOrcidStatus } from '@/lib/impact-api'
import type { AuthUser, OrcidStatusPayload } from '@/types/impact'

function formatTimestamp(value: string | null | undefined): string {
  if (!value) {
    return 'Not available'
  }
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

function renderValue(value: string | null | undefined): string {
  const clean = (value || '').trim()
  return clean || 'Not available'
}

export function ProfilePersonalDetailsPage() {
  const navigate = useNavigate()
  const [user, setUser] = useState<AuthUser | null>(null)
  const [orcidStatus, setOrcidStatus] = useState<OrcidStatusPayload | null>(null)
  const [loading, setLoading] = useState(false)
  const [status, setStatus] = useState('')
  const [error, setError] = useState('')

  useEffect(() => {
    const token = getAuthSessionToken()
    if (!token) {
      navigate('/auth', { replace: true })
      return
    }

    const load = async () => {
      setLoading(true)
      setStatus('')
      setError('')
      try {
        const settled = await Promise.allSettled([fetchMe(token), fetchOrcidStatus(token)])
        const [meResult, orcidResult] = settled
        setUser(meResult.status === 'fulfilled' ? meResult.value : null)
        setOrcidStatus(orcidResult.status === 'fulfilled' ? orcidResult.value : null)

        const failedCount = settled.filter((item) => item.status === 'rejected').length
        if (failedCount > 0) {
          setStatus(`Personal details loaded with ${failedCount} unavailable source${failedCount === 1 ? '' : 's'}.`)
        }
      } catch (loadError) {
        setError(loadError instanceof Error ? loadError.message : 'Could not load personal details.')
      } finally {
        setLoading(false)
      }
    }

    void load()
  }, [navigate])

  const orcidId = renderValue(orcidStatus?.orcid_id || user?.orcid_id)
  const orcidLinked = Boolean(orcidStatus?.linked || user?.orcid_id)
  const profileSource = orcidLinked
    ? 'ORCID-linked profile with registration fallback'
    : 'Registration profile'

  return (
    <section className="space-y-4">
      <header className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">Personal details</h1>
        <p className="text-sm text-[hsl(var(--tone-neutral-600))]">
          Identity data shown from ORCID when linked, otherwise from your registration profile.
        </p>
      </header>

      <Card className="border-[hsl(var(--tone-neutral-200))]">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-semibold text-[hsl(var(--tone-neutral-900))]">Profile identity</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid gap-2.5 md:grid-cols-2">
            <div className="rounded-md border border-[hsl(var(--tone-neutral-200))] bg-card px-3 py-2">
              <p className="text-caption uppercase tracking-[0.08em] text-[hsl(var(--tone-neutral-500))]">Full name</p>
              <p className="mt-1 text-sm font-medium text-[hsl(var(--tone-neutral-900))]">{renderValue(user?.name)}</p>
            </div>
            <div className="rounded-md border border-[hsl(var(--tone-neutral-200))] bg-card px-3 py-2">
              <p className="text-caption uppercase tracking-[0.08em] text-[hsl(var(--tone-neutral-500))]">Email</p>
              <p className="mt-1 text-sm font-medium text-[hsl(var(--tone-neutral-900))]">{renderValue(user?.email)}</p>
            </div>
            <div className="rounded-md border border-[hsl(var(--tone-neutral-200))] bg-card px-3 py-2">
              <p className="text-caption uppercase tracking-[0.08em] text-[hsl(var(--tone-neutral-500))]">ORCID iD</p>
              <p className="mt-1 text-sm font-medium text-[hsl(var(--tone-neutral-900))]">{orcidId}</p>
            </div>
            <div className="rounded-md border border-[hsl(var(--tone-neutral-200))] bg-card px-3 py-2">
              <p className="text-caption uppercase tracking-[0.08em] text-[hsl(var(--tone-neutral-500))]">Source</p>
              <p className="mt-1 text-sm font-medium text-[hsl(var(--tone-neutral-900))]">{profileSource}</p>
            </div>
            <div className="rounded-md border border-[hsl(var(--tone-neutral-200))] bg-card px-3 py-2">
              <p className="text-caption uppercase tracking-[0.08em] text-[hsl(var(--tone-neutral-500))]">Email verification</p>
              <p className="mt-1 text-sm font-medium text-[hsl(var(--tone-neutral-900))]">
                {user?.email_verified_at ? `Verified ${formatTimestamp(user.email_verified_at)}` : 'Not verified'}
              </p>
            </div>
            <div className="rounded-md border border-[hsl(var(--tone-neutral-200))] bg-card px-3 py-2">
              <p className="text-caption uppercase tracking-[0.08em] text-[hsl(var(--tone-neutral-500))]">Role</p>
              <p className="mt-1 text-sm font-medium text-[hsl(var(--tone-neutral-900))]">{renderValue(user?.role)}</p>
            </div>
            <div className="rounded-md border border-[hsl(var(--tone-neutral-200))] bg-card px-3 py-2">
              <p className="text-caption uppercase tracking-[0.08em] text-[hsl(var(--tone-neutral-500))]">Last sign-in</p>
              <p className="mt-1 text-sm font-medium text-[hsl(var(--tone-neutral-900))]">{formatTimestamp(user?.last_sign_in_at)}</p>
            </div>
            <div className="rounded-md border border-[hsl(var(--tone-neutral-200))] bg-card px-3 py-2">
              <p className="text-caption uppercase tracking-[0.08em] text-[hsl(var(--tone-neutral-500))]">Account created</p>
              <p className="mt-1 text-sm font-medium text-[hsl(var(--tone-neutral-900))]">{formatTimestamp(user?.created_at)}</p>
            </div>
          </div>

          <div className="flex flex-wrap gap-2 border-t border-[hsl(var(--tone-neutral-200))] pt-3">
            <Button type="button" variant="outline" size="sm" onClick={() => navigate('/profile/integrations')}>
              Open integrations
            </Button>
            <Button type="button" variant="outline" size="sm" onClick={() => navigate('/settings')}>
              Open settings
            </Button>
          </div>
        </CardContent>
      </Card>

      {status ? <p className="text-sm text-[hsl(var(--tone-positive-700))]">{status}</p> : null}
      {error ? <p className="text-sm text-[hsl(var(--tone-danger-700))]">{error}</p> : null}
      {loading ? <p className="text-xs text-[hsl(var(--tone-neutral-500))]">Loading personal details...</p> : null}
    </section>
  )
}
