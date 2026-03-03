import { useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'

import { Button } from '@/components/ui'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui'
import { ScrollArea } from '@/components/ui'
import { fetchMe, fetchPersonaState } from '@/lib/impact-api'
import { clearAuthSessionToken, getAuthSessionToken } from '@/lib/auth-session'
import type { AuthUser, PersonaStatePayload } from '@/types/impact'

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

type NextAction = {
  title: string
  detail: string
}

export function ProfilePanel() {
  const navigate = useNavigate()
  const [token, setToken] = useState<string>(() => getAuthSessionToken())
  const [user, setUser] = useState<AuthUser | null>(null)
  const [personaState, setPersonaState] = useState<PersonaStatePayload | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const refreshPanel = useCallback(async () => {
    if (!token) {
      setUser(null)
      setPersonaState(null)
      setError('')
      return
    }

    setLoading(true)
    setError('')
    try {
      const mePromise = fetchMe(token)
      const statePromise = fetchPersonaState(token)
      const [meResult, stateResult] = await Promise.allSettled([mePromise, statePromise])

      if (meResult.status === 'fulfilled') {
        setUser(meResult.value)
      } else {
        setUser(null)
        setError(meResult.reason instanceof Error ? meResult.reason.message : 'Could not load profile session.')
      }

      if (stateResult.status === 'fulfilled') {
        setPersonaState(stateResult.value)
      } else {
        setPersonaState(null)
      }
    } finally {
      setLoading(false)
    }
  }, [token])

  useEffect(() => {
    setToken(getAuthSessionToken())
    void refreshPanel()
  }, [refreshPanel])

  const worksCount = personaState?.works.length ?? 0
  const syncStatus = personaState?.sync_status

  const nextAction = useMemo<NextAction>(() => {
    if (!token || !user) {
      return {
        title: 'Sign in',
        detail: 'Open account access to load profile, works, and impact metrics.',
      }
    }
    if (!user.email_verified_at) {
      return {
        title: 'Verify email',
        detail: 'Email verification is required before ORCID import and metric sync.',
      }
    }
    if (!user.orcid_id) {
      return {
        title: 'Link ORCID',
        detail: 'Connect ORCID to import works and initialise persona metrics.',
      }
    }
    if (worksCount === 0) {
      return {
        title: 'Import works',
        detail: 'No publications detected yet. Import from ORCID to start impact analysis.',
      }
    }
    if (!syncStatus?.metrics_last_synced_at) {
      return {
        title: 'Sync metrics',
        detail: 'Run metrics sync so citation and collaborator insights populate.',
      }
    }
    return {
      title: 'Open Run Wizard',
      detail: 'Profile context is ready; continue manuscript planning with persona context.',
    }
  }, [syncStatus?.metrics_last_synced_at, token, user, worksCount])

  const onSignOut = () => {
    clearAuthSessionToken()
    setToken('')
    setUser(null)
    setPersonaState(null)
    navigate('/auth', { replace: true })
  }

  return (
    <aside className="flex h-full flex-col bg-card">
      <div className="space-y-2 border-b border-border p-4">
        <div className="flex items-center justify-between">
          <h2 className="house-section-title">Profile context</h2>
          <span
            className={
              token && user
                ? 'rounded-full border border-emerald-300 bg-emerald-50 px-2 py-0.5 text-micro text-emerald-700'
                : 'rounded-full border border-border bg-muted px-2 py-0.5 text-micro text-muted-foreground'
            }
          >
            {token && user ? 'live' : 'guest'}
          </span>
        </div>
        <p className="text-xs text-muted-foreground">
          Account status, sync readiness, and the next best action for Impact/Profile.
        </p>
        {error ? <p className="text-xs text-destructive">{error}</p> : null}
      </div>

      <ScrollArea className="flex-1">
        <div className="space-y-3 p-4">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle>Session</CardTitle>
              <CardDescription className="text-xs">
                {token && user ? user.email : 'No active account session in this browser tab.'}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-2 text-xs">
              <p>Email verification: {user?.email_verified_at ? 'Complete' : 'Pending'}</p>
              <p>ORCID: {user?.orcid_id ? 'Linked' : 'Not linked'}</p>
              <p>Last sign-in: {formatTimestamp(user?.last_sign_in_at)}</p>
              <div className="flex flex-wrap gap-2 pt-1">
                {token ? (
                  <Button size="sm" variant="outline" onClick={onSignOut}>
                    Sign out
                  </Button>
                ) : (
                  <Button size="sm" onClick={() => navigate('/auth')}>
                    Open sign-in
                  </Button>
                )}
                <Button size="sm" variant="outline" onClick={() => void refreshPanel()} disabled={loading}>
                  {loading ? 'Refreshing...' : 'Refresh'}
                </Button>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle>Impact readiness</CardTitle>
              <CardDescription className="text-xs">Quick profile health checks.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-2 text-xs">
              <p>Works in library: {worksCount}</p>
              <p>Works last synced: {formatTimestamp(syncStatus?.works_last_synced_at)}</p>
              <p>Metrics last synced: {formatTimestamp(syncStatus?.metrics_last_synced_at)}</p>
              <p>Themes generated: {formatTimestamp(syncStatus?.themes_last_generated_at)}</p>
              <p>Impact recompute: {formatTimestamp(syncStatus?.impact_last_computed_at)}</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle>Next action</CardTitle>
              <CardDescription className="text-xs">{nextAction.detail}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-2">
              {nextAction.title === 'Sign in' ? (
                <Button size="sm" onClick={() => navigate('/auth')}>
                  Open sign-in
                </Button>
              ) : nextAction.title === 'Open Run Wizard' ? (
                <Button size="sm" onClick={() => navigate('/study-core')}>
                  Open Run Wizard
                </Button>
              ) : (
                <Button size="sm" variant="outline" onClick={() => navigate('/profile')}>
                  Go to Profile
                </Button>
              )}
            </CardContent>
          </Card>
        </div>
      </ScrollArea>
    </aside>
  )
}
