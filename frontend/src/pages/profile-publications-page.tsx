import { useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'

import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { fetchOrcidStatus, fetchPersonaState, importOrcidWorks, syncPersonaMetrics } from '@/lib/impact-api'
import { readCachedPersonaState, writeCachedPersonaState } from '@/lib/persona-cache'
import { getAuthSessionToken } from '@/lib/auth-session'
import type { OrcidStatusPayload, PersonaStatePayload } from '@/types/impact'

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

export function ProfilePublicationsPage() {
  const navigate = useNavigate()
  const [token, setToken] = useState<string>(() => getAuthSessionToken())
  const [personaState, setPersonaState] = useState<PersonaStatePayload | null>(null)
  const [orcidStatus, setOrcidStatus] = useState<OrcidStatusPayload | null>(null)
  const [query, setQuery] = useState('')
  const [loading, setLoading] = useState(false)
  const [refreshing, setRefreshing] = useState(false)
  const [importing, setImporting] = useState(false)
  const [syncing, setSyncing] = useState(false)
  const [fullSyncing, setFullSyncing] = useState(false)
  const [status, setStatus] = useState('')
  const [error, setError] = useState('')
  const syncStatus = personaState?.sync_status || {
    works_last_synced_at: null,
    metrics_last_synced_at: null,
  }

  const loadData = useCallback(async (sessionToken: string, resetMessages = true) => {
    setLoading(true)
    setRefreshing(true)
    setError('')
    if (resetMessages) {
      setStatus('')
    }
    try {
      const settled = await Promise.allSettled([fetchPersonaState(sessionToken), fetchOrcidStatus(sessionToken)])
      const [stateResult, orcidResult] = settled
      if (stateResult.status === 'fulfilled') {
        setPersonaState(stateResult.value)
        writeCachedPersonaState(stateResult.value)
      } else {
        const cached = readCachedPersonaState()
        setPersonaState(cached)
        if (cached) {
          setStatus('Showing cached publications while live data reloads.')
        }
      }
      setOrcidStatus(orcidResult.status === 'fulfilled' ? orcidResult.value : null)
      const failedCount = settled.filter((item) => item.status === 'rejected').length
      if (failedCount > 0) {
        setStatus(`Publications loaded with ${failedCount} unavailable source${failedCount === 1 ? '' : 's'}.`)
      }
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Could not load publications.')
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }, [])

  useEffect(() => {
    const sessionToken = getAuthSessionToken()
    setToken(sessionToken)
    if (!sessionToken) {
      navigate('/auth', { replace: true })
      return
    }
    void loadData(sessionToken)
  }, [loadData, navigate])

  const metricsByWorkId = useMemo(() => {
    const map = new Map<string, { citations: number; provider: string }>()
    for (const row of personaState?.metrics.works ?? []) {
      map.set(row.work_id, {
        citations: Number(row.citations || 0),
        provider: row.provider,
      })
    }
    return map
  }, [personaState?.metrics.works])

  const filteredWorks = useMemo(() => {
    const cleanQuery = query.trim().toLowerCase()
    const works = personaState?.works ?? []
    if (!cleanQuery) {
      return works
    }
    return works.filter((work) => {
      return (
        work.title.toLowerCase().includes(cleanQuery) ||
        work.venue_name.toLowerCase().includes(cleanQuery) ||
        (work.doi || '').toLowerCase().includes(cleanQuery)
      )
    })
  }, [personaState?.works, query])

  const totalCitations = useMemo(() => {
    let count = 0
    for (const row of personaState?.metrics.works ?? []) {
      count += Math.max(0, Number(row.citations || 0))
    }
    return count
  }, [personaState?.metrics.works])
  const worksCount = personaState?.works.length ?? 0
  const busy = loading || importing || syncing || fullSyncing
  const canImportOrcid = Boolean(orcidStatus?.can_import) && !busy
  const canSyncCitations = worksCount > 0 && !busy

  const onImportOrcid = async () => {
    if (!token) {
      return
    }
    if (!orcidStatus?.linked) {
      setStatus('Connect ORCID in Integrations before importing publications.')
      return
    }
    setImporting(true)
    setError('')
    setStatus('')
    try {
      const payload = await importOrcidWorks(token)
      if (payload.imported_count > 0) {
        setStatus(`Imported ${payload.imported_count} ORCID work(s).`)
      } else {
        setStatus('No new ORCID works were imported. Library is already up to date.')
      }
      await loadData(token, false)
    } catch (importError) {
      setError(importError instanceof Error ? importError.message : 'Could not import ORCID works.')
    } finally {
      setImporting(false)
    }
  }

  const onSyncCitations = async () => {
    if (!token) {
      return
    }
    if (worksCount === 0) {
      setStatus('Import at least one work before syncing citations.')
      return
    }
    setSyncing(true)
    setError('')
    setStatus('')
    try {
      const payload = await syncPersonaMetrics(token, ['openalex'])
      setStatus(`Citations synchronised via OpenAlex (${payload.synced_snapshots} snapshot(s)).`)
      await loadData(token, false)
    } catch (syncError) {
      setError(syncError instanceof Error ? syncError.message : 'Could not synchronise citations.')
    } finally {
      setSyncing(false)
    }
  }

  const onFullSyncCitations = async () => {
    if (!token) {
      return
    }
    if (worksCount === 0) {
      setStatus('Import at least one work before syncing citations.')
      return
    }
    setFullSyncing(true)
    setError('')
    setStatus('')
    try {
      const payload = await syncPersonaMetrics(token, ['openalex', 'semantic_scholar', 'manual'])
      setStatus(`Full citation sync complete (${payload.synced_snapshots} snapshot(s)).`)
      await loadData(token, false)
    } catch (syncError) {
      setError(syncError instanceof Error ? syncError.message : 'Could not run full citation sync.')
    } finally {
      setFullSyncing(false)
    }
  }

  const onCreateCollection = () => {
    setStatus('Collection creation scaffold is ready. Named collections will be added next.')
  }

  return (
    <section className="space-y-4">
      <header className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">Publications</h1>
      </header>

      <Card>
        <CardContent className="grid gap-2 p-4 md:grid-cols-4">
          <div className="rounded border border-border px-3 py-2 text-sm">
            <p className="text-xs text-muted-foreground">Total works</p>
            <p className="font-semibold">{personaState?.works.length ?? 0}</p>
          </div>
          <div className="rounded border border-border px-3 py-2 text-sm">
            <p className="text-xs text-muted-foreground">Total citations</p>
            <p className="font-semibold">{totalCitations}</p>
          </div>
          <div className="rounded border border-border px-3 py-2 text-sm">
            <p className="text-xs text-muted-foreground">Last works sync</p>
            <p>{formatTimestamp(syncStatus.works_last_synced_at)}</p>
          </div>
          <div className="rounded border border-border px-3 py-2 text-sm">
            <p className="text-xs text-muted-foreground">Last metrics sync</p>
            <p>{formatTimestamp(syncStatus.metrics_last_synced_at)}</p>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">Import controls</CardTitle>
          <CardDescription>ORCID import is active; DOI/BibTeX upload is scaffolded.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-2">
          <Button type="button" onClick={onImportOrcid} disabled={!canImportOrcid}>
            {importing ? 'Importing...' : 'Import ORCID works'}
          </Button>
          <Button type="button" variant="outline" onClick={onSyncCitations} disabled={!canSyncCitations}>
            {syncing ? 'Syncing...' : 'Sync citations'}
          </Button>
          <Button type="button" variant="outline" onClick={onFullSyncCitations} disabled={!canSyncCitations}>
            {fullSyncing ? 'Full sync...' : 'Full sync (slower)'}
          </Button>
          <Button
            type="button"
            variant="outline"
            onClick={() => setStatus('DOI / BibTeX import scaffold is next.')}
          >
            Import DOI / BibTeX (scaffold)
          </Button>
          <Button type="button" variant="outline" onClick={onCreateCollection}>
            Create collection (scaffold)
          </Button>
          <Button type="button" variant="outline" onClick={() => navigate('/profile/integrations')}>
            Open integrations
          </Button>
          <Button
            type="button"
            variant="outline"
            onClick={() => (token ? void loadData(token, false) : undefined)}
            disabled={!token || busy}
          >
            {refreshing ? 'Refreshing...' : 'Refresh library'}
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">Library</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <Input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Filter by title, venue, DOI"
          />

          {filteredWorks.length === 0 ? (
            <div className="rounded border border-dashed border-border p-4 text-sm text-muted-foreground">
              <p className="mb-2 text-foreground">No works in your library yet.</p>
              <ol className="list-decimal space-y-1 pl-5">
                <li>Connect ORCID in Integrations.</li>
                <li>Import works from ORCID or DOI/BibTeX.</li>
                <li>Create a collection for manuscript planning.</li>
              </ol>
            </div>
          ) : (
            <div className="overflow-x-auto rounded border border-border">
              <table className="w-full min-w-[920px] text-sm">
                <thead className="bg-muted/35 text-left text-xs text-muted-foreground">
                  <tr>
                    <th className="px-2 py-2">Title</th>
                    <th className="px-2 py-2">Year</th>
                    <th className="px-2 py-2">Venue</th>
                    <th className="px-2 py-2">Type</th>
                    <th className="px-2 py-2">Topic tags</th>
                    <th className="px-2 py-2">Citations</th>
                    <th className="px-2 py-2">Provider</th>
                    <th className="px-2 py-2">Source</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredWorks.map((work) => {
                    const metrics = metricsByWorkId.get(work.id)
                    return (
                      <tr key={work.id} className="border-t border-border">
                        <td className="px-2 py-2">{work.title}</td>
                        <td className="px-2 py-2">{work.year ?? 'n/a'}</td>
                        <td className="px-2 py-2">{work.venue_name || 'n/a'}</td>
                        <td className="px-2 py-2">{work.work_type || 'n/a'}</td>
                        <td className="px-2 py-2">
                          {work.keywords.length > 0 ? work.keywords.slice(0, 3).join(', ') : 'n/a'}
                        </td>
                        <td className="px-2 py-2">{metrics?.citations ?? 0}</td>
                        <td className="px-2 py-2">{metrics?.provider || 'not synced'}</td>
                        <td className="px-2 py-2">{work.provenance}</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {status ? <p className="text-sm text-emerald-700">{status}</p> : null}
      {error ? <p className="text-sm text-destructive">{error}</p> : null}
      {(loading || importing || syncing || fullSyncing) ? (
        <p className="text-xs text-muted-foreground">Working...</p>
      ) : null}
    </section>
  )
}
