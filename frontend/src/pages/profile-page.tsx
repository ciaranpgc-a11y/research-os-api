import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'

import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { readAccountSettings, settingsCompleteness } from '@/lib/account-preferences'
import { getAuthSessionToken } from '@/lib/auth-session'
import { houseLayout, houseSurfaces, houseTypography } from '@/lib/house-style'
import { fetchMe, fetchOrcidStatus, fetchPublicationsAnalyticsSummary } from '@/lib/impact-api'
import { cn } from '@/lib/utils'
import type {
  AuthUser,
  OrcidStatusPayload,
  PublicationsAnalyticsSummaryPayload,
} from '@/types/impact'

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

function formatSignedPercent(value: number | null): string {
  if (value === null || Number.isNaN(value)) {
    return 'n/a'
  }
  const rounded = Math.round(value * 10) / 10
  if (rounded > 0) {
    return `+${rounded}%`
  }
  return `${rounded}%`
}

function growthToneClass(value: number | null): string {
  if (value === null || Number.isNaN(value)) {
    return 'text-muted-foreground'
  }
  if (value > 0) {
    return 'text-emerald-700'
  }
  if (value < 0) {
    return 'text-rose-700'
  }
  return 'text-muted-foreground'
}

export function ProfilePage() {
  const navigate = useNavigate()
  const [user, setUser] = useState<AuthUser | null>(null)
  const [orcidStatus, setOrcidStatus] = useState<OrcidStatusPayload | null>(null)
  const [citationSummary, setCitationSummary] = useState<PublicationsAnalyticsSummaryPayload | null>(null)
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
        const settled = await Promise.allSettled([
          fetchMe(token),
          fetchOrcidStatus(token),
          fetchPublicationsAnalyticsSummary(token),
        ])
        const [meResult, orcidResult, summaryResult] = settled
        setUser(meResult.status === 'fulfilled' ? meResult.value : null)
        setOrcidStatus(orcidResult.status === 'fulfilled' ? orcidResult.value : null)
        setCitationSummary(summaryResult.status === 'fulfilled' ? summaryResult.value : null)
        const failedCount = settled.filter((item) => item.status === 'rejected').length
        if (failedCount > 0) {
          setStatus(`Profile loaded with ${failedCount} unavailable source${failedCount === 1 ? '' : 's'}.`)
        }
      } catch (loadError) {
        setError(loadError instanceof Error ? loadError.message : 'Could not load profile summary.')
      } finally {
        setLoading(false)
      }
    }
    void load()
  }, [navigate])

  const settings = readAccountSettings()
  return (
    <section data-house-role="page" className="space-y-4">
      <header data-house-role="page-header" className={cn(houseLayout.pageHeader, houseSurfaces.leftBorder)}>
        <h1 data-house-role="page-title" className={houseTypography.title}>Profile home</h1>
      </header>

      <Card>
        <CardContent className="grid gap-3 p-4 md:grid-cols-2">
          <div className="rounded border border-border px-3 py-2 text-sm">
            <p className="text-xs text-muted-foreground">Citations (12m)</p>
            <p className="font-semibold">{citationSummary?.citations_last_12_months ?? 'n/a'}</p>
          </div>
          <div className="rounded border border-border px-3 py-2 text-sm">
            <p className="text-xs text-muted-foreground">YoY %</p>
            <p className={`font-semibold ${growthToneClass(citationSummary?.yoy_percent ?? null)}`}>
              {formatSignedPercent(citationSummary?.yoy_percent ?? null)}
            </p>
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-3 xl:grid-cols-2">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Citation executive summary</CardTitle>
            <CardDescription>Computed in Publications analytics and surfaced here only.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <p>
              Citations (12m):{' '}
              <strong>{citationSummary?.citations_last_12_months ?? 'n/a'}</strong>
            </p>
            <p>
              YoY %:{' '}
              <strong className={growthToneClass(citationSummary?.yoy_percent ?? null)}>
                {formatSignedPercent(citationSummary?.yoy_percent ?? null)}
              </strong>
            </p>
            <p className="text-xs text-muted-foreground">
              Last computed: {formatTimestamp(citationSummary?.computed_at)}
            </p>
            <Button type="button" size="sm" variant="outline" onClick={() => navigate('/profile/publications')}>
              Open publications analytics
            </Button>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-3 xl:grid-cols-2">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Integrations</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <p>
              ORCID: <strong>{orcidStatus?.linked ? 'Connected' : 'Not connected'}</strong>
            </p>
            <Button type="button" size="sm" variant="outline" onClick={() => navigate('/profile/integrations')}>
              Open integrations
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Publications</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <p>
              Citation metrics source: <strong>Publications analytics</strong>
            </p>
            <p className="text-muted-foreground">
              Full citation intelligence lives in Publications.
            </p>
            <Button type="button" size="sm" variant="outline" onClick={() => navigate('/profile/publications')}>
              Open publications
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Impact</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <p className="text-muted-foreground">
              Last impact run: {formatTimestamp(user?.impact_last_computed_at)}
            </p>
            <Button type="button" size="sm" variant="outline" onClick={() => navigate('/impact')}>
              Open impact
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Settings & preferences</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <p>
              Preferences completeness: <strong>{settingsCompleteness(settings)}%</strong>
            </p>
            <p className="text-muted-foreground">
              Journals: {settings.preferredJournals.length} | Study types: {settings.defaultStudyTypes.length}
            </p>
            <Button type="button" size="sm" variant="outline" onClick={() => navigate('/settings')}>
              Open settings
            </Button>
          </CardContent>
        </Card>
      </div>

      {!citationSummary ? (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Start profile data</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <ol className="list-decimal space-y-1 pl-5">
              <li>Connect ORCID in Integrations.</li>
              <li>Run citation sync in Publications.</li>
              <li>Return here for executive citation summary.</li>
            </ol>
          </CardContent>
        </Card>
      ) : null}

      {status ? <p className="text-sm text-emerald-700">{status}</p> : null}
      {error ? <p className="text-sm text-destructive">{error}</p> : null}
      {loading ? <p className="text-xs text-muted-foreground">Loading profile summary...</p> : null}
    </section>
  )
}
