import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'

import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { readAccountSettings, settingsCompleteness } from '@/lib/account-preferences'
import { getAuthSessionToken } from '@/lib/auth-session'
import { fetchMe, fetchOrcidStatus, fetchPersonaState } from '@/lib/impact-api'
import type { AuthUser, OrcidStatusPayload, PersonaStatePayload } from '@/types/impact'

const CITATION_HISTORY_STORAGE_KEY = 'aawe-citation-history'

type CitationSnapshot = {
  at: string
  total: number
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

function readCitationHistory(): CitationSnapshot[] {
  if (typeof window === 'undefined') {
    return []
  }
  const raw = window.localStorage.getItem(CITATION_HISTORY_STORAGE_KEY)
  if (!raw) {
    return []
  }
  try {
    const parsed = JSON.parse(raw) as CitationSnapshot[]
    if (!Array.isArray(parsed)) {
      return []
    }
    return parsed
      .filter((item) => typeof item?.at === 'string' && typeof item?.total === 'number')
      .slice(-180)
  } catch {
    return []
  }
}

function writeCitationHistory(history: CitationSnapshot[]): void {
  if (typeof window === 'undefined') {
    return
  }
  window.localStorage.setItem(CITATION_HISTORY_STORAGE_KEY, JSON.stringify(history.slice(-180)))
}

function recordCitationSnapshot(totalCitations: number): void {
  if (totalCitations < 0) {
    return
  }
  const history = readCitationHistory()
  const now = new Date().toISOString()
  const last = history[history.length - 1]
  if (last) {
    const lastAt = Date.parse(last.at)
    const sixHoursMs = 6 * 60 * 60 * 1000
    if (last.total === totalCitations && !Number.isNaN(lastAt) && Date.now() - lastAt < sixHoursMs) {
      return
    }
  }
  history.push({ at: now, total: totalCitations })
  writeCitationHistory(history)
}

function newCitationsInLast30Days(currentTotal: number): number | null {
  const history = readCitationHistory()
  if (history.length === 0) {
    return null
  }
  const threshold = Date.now() - 30 * 24 * 60 * 60 * 1000
  let baseline: CitationSnapshot | null = null
  for (const point of history) {
    const parsed = Date.parse(point.at)
    if (Number.isNaN(parsed)) {
      continue
    }
    if (parsed <= threshold) {
      baseline = point
    }
  }
  if (!baseline) {
    return null
  }
  return Math.max(0, currentTotal - baseline.total)
}

export function ProfilePage() {
  const navigate = useNavigate()
  const [user, setUser] = useState<AuthUser | null>(null)
  const [orcidStatus, setOrcidStatus] = useState<OrcidStatusPayload | null>(null)
  const [personaState, setPersonaState] = useState<PersonaStatePayload | null>(null)
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
          fetchPersonaState(token),
        ])
        const [meResult, orcidResult, stateResult] = settled
        setUser(meResult.status === 'fulfilled' ? meResult.value : null)
        setOrcidStatus(orcidResult.status === 'fulfilled' ? orcidResult.value : null)
        setPersonaState(stateResult.status === 'fulfilled' ? stateResult.value : null)
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
  const works = personaState?.works ?? []
  const metricsRows = personaState?.metrics.works ?? []
  const totalCitations = useMemo(
    () => metricsRows.reduce((sum, row) => sum + Math.max(0, Number(row.citations || 0)), 0),
    [metricsRows],
  )
  const citationsLast30Days = useMemo(() => newCitationsInLast30Days(totalCitations), [totalCitations])
  const topPapers = useMemo(
    () =>
      [...metricsRows]
        .sort((a, b) => Number(b.citations || 0) - Number(a.citations || 0))
        .slice(0, 5),
    [metricsRows],
  )
  const topCollaborators = useMemo(
    () => (personaState?.collaborators.collaborators ?? []).slice(0, 3),
    [personaState?.collaborators.collaborators],
  )

  const profileCompleteness = useMemo(() => {
    const identityFields = [
      Boolean(user?.name.trim()),
      Boolean(user?.email.trim()),
      Boolean(orcidStatus?.linked || user?.orcid_id),
    ]
    const identityScore = Math.round((identityFields.filter(Boolean).length / identityFields.length) * 100)
    const libraryScore = works.length > 0 ? 100 : 0
    const preferenceScore = settingsCompleteness(settings)
    return Math.round((identityScore + libraryScore + preferenceScore) / 3)
  }, [orcidStatus?.linked, settings, user?.email, user?.name, user?.orcid_id, works.length])

  useEffect(() => {
    recordCitationSnapshot(totalCitations)
  }, [totalCitations])

  return (
    <section className="space-y-4">
      <header className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">Profile home</h1>
      </header>

      <Card>
        <CardContent className="grid gap-3 p-4 md:grid-cols-4">
          <div className="rounded border border-border px-3 py-2 text-sm">
            <p className="text-xs text-muted-foreground">Profile completeness</p>
            <p className="font-semibold">{profileCompleteness}%</p>
          </div>
          <div className="rounded border border-border px-3 py-2 text-sm">
            <p className="text-xs text-muted-foreground">Total works</p>
            <p className="font-semibold">{works.length}</p>
          </div>
          <div className="rounded border border-border px-3 py-2 text-sm">
            <p className="text-xs text-muted-foreground">Total citations</p>
            <p className="font-semibold">{totalCitations}</p>
          </div>
          <div className="rounded border border-border px-3 py-2 text-sm">
            <p className="text-xs text-muted-foreground">New citations (30 days)</p>
            <p className="font-semibold">
              {citationsLast30Days === null ? 'Insufficient history' : citationsLast30Days}
            </p>
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-3 xl:grid-cols-2">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Top papers</CardTitle>
            <CardDescription>Highest citations from latest metrics snapshot.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            {topPapers.length > 0 ? (
              topPapers.map((paper) => (
                <div key={paper.work_id} className="rounded border border-border px-3 py-2">
                  <p className="font-medium">{paper.title}</p>
                  <p className="text-xs text-muted-foreground">
                    {paper.year ?? 'Year n/a'} | {paper.citations} citations | {paper.provider}
                  </p>
                </div>
              ))
            ) : (
              <p className="text-muted-foreground">No citation metrics available yet.</p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Top collaborators</CardTitle>
            <CardDescription>Top three by shared publication count.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            {topCollaborators.length > 0 ? (
              topCollaborators.map((collaborator) => (
                <div
                  key={collaborator.author_id}
                  className="flex items-center justify-between rounded border border-border px-3 py-2"
                >
                  <span className="font-medium">{collaborator.name}</span>
                  <span className="text-xs text-muted-foreground">{collaborator.n_shared_works} shared</span>
                </div>
              ))
            ) : (
              <p className="text-muted-foreground">No collaborator data available yet.</p>
            )}
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
            <p className="text-muted-foreground">
              Last ORCID sync: {formatTimestamp(personaState?.sync_status.orcid_last_synced_at)}
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
              Library size: <strong>{works.length}</strong>
            </p>
            <p className="text-muted-foreground">
              Last update: {formatTimestamp(personaState?.sync_status.works_last_updated_at)}
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
              Last impact run: {formatTimestamp(personaState?.sync_status.impact_last_computed_at || user?.impact_last_computed_at)}
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

      {works.length === 0 ? (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Start profile data</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <ol className="list-decimal space-y-1 pl-5">
              <li>Connect ORCID in Integrations.</li>
              <li>Import works into Publications.</li>
              <li>Run Impact analysis after citations sync.</li>
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

