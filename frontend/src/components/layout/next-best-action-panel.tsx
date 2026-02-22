import { useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'

import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { ScrollArea } from '@/components/ui/scroll-area'
import { fetchMe, fetchOrcidStatus, fetchPersonaState } from '@/lib/impact-api'
import { getAuthSessionToken } from '@/lib/auth-session'
import type { AuthUser, OrcidStatusPayload, PersonaStatePayload } from '@/types/impact'

type RankedAction = {
  title: string
  reason: string
  cta: string
  href: string
}

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

export function NextBestActionPanel() {
  const navigate = useNavigate()
  const [token, setToken] = useState<string>(() => getAuthSessionToken())
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [user, setUser] = useState<AuthUser | null>(null)
  const [personaState, setPersonaState] = useState<PersonaStatePayload | null>(null)
  const [orcidStatus, setOrcidStatus] = useState<OrcidStatusPayload | null>(null)

  const refresh = useCallback(async () => {
    const currentToken = getAuthSessionToken()
    setToken(currentToken)
    if (!currentToken) {
      setUser(null)
      setPersonaState(null)
      setOrcidStatus(null)
      setError('')
      return
    }
    setLoading(true)
    setError('')
    try {
      const [userResult, stateResult, orcidResult] = await Promise.allSettled([
        fetchMe(currentToken),
        fetchPersonaState(currentToken),
        fetchOrcidStatus(currentToken),
      ])
      if (userResult.status === 'fulfilled') {
        setUser(userResult.value)
      } else {
        setUser(null)
        setError(userResult.reason instanceof Error ? userResult.reason.message : 'Could not load account context.')
      }
      setPersonaState(stateResult.status === 'fulfilled' ? stateResult.value : null)
      setOrcidStatus(orcidResult.status === 'fulfilled' ? orcidResult.value : null)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void refresh()
  }, [refresh])

  const actions = useMemo<RankedAction[]>(() => {
    if (!token || !user) {
      return [
        {
          title: 'Create account',
          reason: 'Sign-in is required to save profile details, sync ORCID, and keep works.',
          cta: 'Open account access',
          href: '/auth',
        },
      ]
    }
    const worksCount = personaState?.works.length ?? 0
    const metricsRows = personaState?.metrics.works ?? []
    const worksWithCitations = metricsRows.filter((item) => Number(item.citations || 0) > 0).length
    const citationCoverage = worksCount > 0 ? Math.round((worksWithCitations / worksCount) * 100) : 0
    const preferencesReady = Boolean(window.localStorage.getItem('aawe-profile-writing-preferences'))
    const ranked: RankedAction[] = []
    if (!user.email_verified_at) {
      ranked.push({
        title: 'Verify email',
        reason: 'Email verification is required before ORCID import and metrics sync.',
        cta: 'Open profile verification',
        href: '/profile',
      })
    }
    if (!orcidStatus?.linked) {
      ranked.push({
        title: 'Connect ORCID',
        reason: 'Link ORCID to build your publication graph and import works.',
        cta: 'Open integrations',
        href: '/profile',
      })
    }
    if (worksCount === 0) {
      ranked.push({
        title: 'Import works',
        reason: 'No publications found; import works to enable collaborator and impact analysis.',
        cta: 'Open library import',
        href: '/profile',
      })
    }
    if (worksCount > 0 && citationCoverage < 60) {
      ranked.push({
        title: 'Synchronise citations',
        reason: 'Citation coverage is incomplete; refresh provider metrics before impact interpretation.',
        cta: 'Open integrations',
        href: '/profile',
      })
    }
    if (
      worksCount > 0 &&
      citationCoverage >= 60 &&
      !personaState?.sync_status.impact_last_computed_at
    ) {
      ranked.push({
        title: 'Generate impact analysis',
        reason: 'Works and citations are available; generate strategic analysis for planning context.',
        cta: 'Open impact workspace',
        href: '/impact',
      })
    }
    if (!preferencesReady) {
      ranked.push({
        title: 'Set writing preferences',
        reason: 'Defaults stabilise manuscript output style and reporting expectations.',
        cta: 'Open writing preferences',
        href: '/profile',
      })
    }
    if (ranked.length === 0) {
      ranked.push({
        title: 'Continue in Run Wizard',
        reason: 'Profile context is in place; proceed to workspace manuscript planning.',
        cta: 'Open Run Wizard',
        href: '/w/hf-registry/run-wizard',
      })
    }
    return ranked.slice(0, 3)
  }, [orcidStatus?.linked, personaState, token, user])

  const contextCitationCoverage = useMemo(() => {
    const worksCount = personaState?.works.length ?? 0
    if (!worksCount) {
      return '0%'
    }
    const citedCount = (personaState?.metrics.works ?? []).filter((item) => Number(item.citations || 0) > 0).length
    return `${Math.round((citedCount / Math.max(1, worksCount)) * 100)}%`
  }, [personaState])

  return (
    <aside className="flex h-full flex-col bg-card">
      <div className="space-y-2 border-b border-border p-4">
        <h2 className="text-sm font-semibold">Next best action</h2>
        {error ? <p className="text-xs text-destructive">{error}</p> : null}
      </div>
      <ScrollArea className="flex-1">
        <div className="space-y-3 p-4">
          {actions.map((action) => (
            <Card key={action.title}>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm">{action.title}</CardTitle>
                <CardDescription className="text-xs">{action.reason}</CardDescription>
              </CardHeader>
              <CardContent>
                <Button size="sm" variant="outline" onClick={() => navigate(action.href)}>
                  {action.cta}
                </Button>
              </CardContent>
            </Card>
          ))}

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">Context snapshot</CardTitle>
            </CardHeader>
            <CardContent className="space-y-1 text-xs">
              <p>Session: {token && user ? 'Signed in' : 'Guest'}</p>
              <p>ORCID: {orcidStatus?.linked ? 'Linked' : 'Not linked'}</p>
              <p>Works: {personaState?.works.length ?? 0}</p>
              <p>Citation coverage: {contextCitationCoverage}</p>
              <p>Metrics sync: {formatTimestamp(personaState?.sync_status.metrics_last_synced_at)}</p>
              <p>Impact snapshot: {formatTimestamp(personaState?.sync_status.impact_last_computed_at)}</p>
              <Button size="sm" variant="outline" onClick={() => void refresh()} disabled={loading}>
                {loading ? 'Refreshing...' : 'Refresh'}
              </Button>
            </CardContent>
          </Card>
        </div>
      </ScrollArea>
    </aside>
  )
}
