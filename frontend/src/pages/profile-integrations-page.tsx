import { useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'

import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import {
  fetchMe,
  fetchOAuthProviderStatuses,
  fetchOrcidConnect,
  fetchOrcidStatus,
  fetchPersonaState,
  importOrcidWorks,
  syncPersonaMetrics,
} from '@/lib/impact-api'
import { readCachedPersonaState, writeCachedPersonaState } from '@/lib/persona-cache'
import { getAuthSessionToken } from '@/lib/auth-session'
import type { AuthOAuthProviderStatusItem, AuthUser, OrcidStatusPayload, PersonaStatePayload } from '@/types/impact'

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

export function ProfileIntegrationsPage() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const [token, setToken] = useState<string>(() => getAuthSessionToken())
  const [user, setUser] = useState<AuthUser | null>(null)
  const [orcidStatus, setOrcidStatus] = useState<OrcidStatusPayload | null>(null)
  const [personaState, setPersonaState] = useState<PersonaStatePayload | null>(null)
  const [providerStatuses, setProviderStatuses] = useState<AuthOAuthProviderStatusItem[]>([])
  const [loading, setLoading] = useState(false)
  const [refreshing, setRefreshing] = useState(false)
  const [connecting, setConnecting] = useState(false)
  const [importing, setImporting] = useState(false)
  const [syncing, setSyncing] = useState(false)
  const [fullSyncing, setFullSyncing] = useState(false)
  const [status, setStatus] = useState('')
  const [error, setError] = useState('')
  const syncStatus = personaState?.sync_status || {
    orcid_last_synced_at: null,
    metrics_last_synced_at: null,
    works_last_updated_at: null,
  }
  const orcidIssues = Array.isArray(orcidStatus?.issues) ? orcidStatus.issues : []

  const loadData = useCallback(async (sessionToken: string, resetMessages = true) => {
    setLoading(true)
    setRefreshing(true)
    setError('')
    if (resetMessages) {
      setStatus('')
    }
    try {
      const settled = await Promise.allSettled([
        fetchMe(sessionToken),
        fetchOrcidStatus(sessionToken),
        fetchPersonaState(sessionToken),
        fetchOAuthProviderStatuses(),
      ])
      const [meResult, orcidResult, stateResult, providerResult] = settled
      setUser(meResult.status === 'fulfilled' ? meResult.value : null)
      setOrcidStatus(orcidResult.status === 'fulfilled' ? orcidResult.value : null)
      if (stateResult.status === 'fulfilled') {
        setPersonaState(stateResult.value)
        writeCachedPersonaState(stateResult.value)
      } else {
        const cached = readCachedPersonaState()
        setPersonaState(cached)
        if (cached) {
          setStatus('Showing cached publications data while live profile data reloads.')
        }
      }
      setProviderStatuses(providerResult.status === 'fulfilled' ? providerResult.value.providers || [] : [])
      const failedCount = settled.filter((item) => item.status === 'rejected').length
      if (failedCount > 0) {
        setStatus(`Integrations loaded with ${failedCount} unavailable source${failedCount === 1 ? '' : 's'}.`)
      }
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Could not load integrations.')
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

  useEffect(() => {
    const linked = searchParams.get('orcid')
    if (linked !== 'linked') {
      return
    }
    const raw = sessionStorage.getItem('aawe_orcid_link_result')
    if (!raw) {
      setStatus('ORCID linked successfully.')
      return
    }
    try {
      const payload = JSON.parse(raw) as { linked?: boolean; orcidId?: string }
      if (payload.linked) {
        setStatus(
          payload.orcidId
            ? `ORCID linked successfully (${payload.orcidId}).`
            : 'ORCID linked successfully.',
        )
      }
    } catch {
      setStatus('ORCID linked successfully.')
    } finally {
      sessionStorage.removeItem('aawe_orcid_link_result')
    }
  }, [searchParams])

  const providerByName = useMemo(() => {
    const map = new Map<string, AuthOAuthProviderStatusItem>()
    for (const provider of providerStatuses) {
      map.set(provider.provider, provider)
    }
    return map
  }, [providerStatuses])

  const metricsRows = personaState?.metrics.works ?? []
  const worksCount = personaState?.works.length ?? 0
  const emailVerified = Boolean(user?.email_verified_at)
  const orcidConfigured = Boolean(orcidStatus?.configured)
  const orcidLinked = Boolean(orcidStatus?.linked || user?.orcid_id)
  const busy = loading || connecting || importing || syncing || fullSyncing
  const canConnectOrcid = emailVerified && orcidConfigured && !busy
  const canImportOrcid = emailVerified && orcidConfigured && orcidLinked && !busy
  const canSyncCitations = worksCount > 0 && !busy
  const connectLabel = orcidLinked ? 'Reconnect ORCID' : 'Connect ORCID'
  const totalCitations = useMemo(
    () => metricsRows.reduce((sum, row) => sum + Math.max(0, Number(row.citations || 0)), 0),
    [metricsRows],
  )

  const onConnectOrcid = async () => {
    if (!token) {
      return
    }
    if (!user?.email_verified_at) {
      setStatus('Verify your email before connecting ORCID.')
      return
    }
    if (orcidStatus && !orcidStatus.configured) {
      setStatus(orcidIssues[0] || 'ORCID is not configured in backend environment.')
      return
    }
    setError('')
    setStatus('')
    setConnecting(true)
    try {
      const payload = await fetchOrcidConnect(token)
      window.location.assign(payload.url)
    } catch (connectError) {
      setError(connectError instanceof Error ? connectError.message : 'ORCID connect failed.')
    } finally {
      setConnecting(false)
    }
  }

  const onImportOrcid = async () => {
    if (!token) {
      return
    }
    if (!(orcidStatus?.linked || user?.orcid_id)) {
      setStatus('Connect ORCID before importing works.')
      return
    }
    setImporting(true)
    setError('')
    setStatus('')
    try {
      const payload = await importOrcidWorks(token)
      if (payload.imported_count > 0) {
        setStatus(`Imported ${payload.imported_count} ORCID work(s). Run citation sync next.`)
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

  const onSyncMetrics = async () => {
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

  const onFullSyncMetrics = async () => {
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

  return (
    <section className="space-y-4">
      <header className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">Integrations</h1>
      </header>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">ORCID</CardTitle>
          <CardDescription>Primary source for publication import.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          <div className="grid gap-2 md:grid-cols-2">
            <div className="rounded border border-border px-3 py-2">
              <p className="text-xs text-muted-foreground">Connection status</p>
              <p className="font-medium">{orcidStatus?.linked ? 'Connected' : 'Not connected'}</p>
            </div>
            <div className="rounded border border-border px-3 py-2">
              <p className="text-xs text-muted-foreground">ORCID id</p>
              <p className="font-medium">{orcidStatus?.orcid_id || user?.orcid_id || 'Not linked'}</p>
            </div>
            <div className="rounded border border-border px-3 py-2">
              <p className="text-xs text-muted-foreground">Last ORCID sync</p>
              <p>{formatTimestamp(syncStatus.orcid_last_synced_at)}</p>
            </div>
            <div className="rounded border border-border px-3 py-2">
              <p className="text-xs text-muted-foreground">Last metrics sync</p>
              <p>{formatTimestamp(syncStatus.metrics_last_synced_at)}</p>
            </div>
          </div>
          {orcidIssues.length ? (
            <div className="rounded border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
              {orcidIssues[0]}
            </div>
          ) : null}
          <div className="flex flex-wrap gap-2">
            <Button type="button" variant="outline" onClick={onConnectOrcid} disabled={!canConnectOrcid}>
              {connecting ? 'Opening ORCID...' : connectLabel}
            </Button>
            <Button type="button" onClick={onImportOrcid} disabled={!canImportOrcid}>
              {importing ? 'Importing...' : 'Import ORCID works'}
            </Button>
            <Button type="button" variant="outline" onClick={onSyncMetrics} disabled={!canSyncCitations}>
              {syncing ? 'Syncing...' : 'Sync citations'}
            </Button>
            <Button type="button" variant="outline" onClick={onFullSyncMetrics} disabled={!canSyncCitations}>
              {fullSyncing ? 'Full sync...' : 'Full sync (slower)'}
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={() => (token ? void loadData(token, false) : undefined)}
              disabled={!token || busy}
            >
              {refreshing ? 'Refreshing...' : 'Refresh status'}
            </Button>
          </div>
          {!emailVerified ? (
            <p className="text-xs text-amber-700">Verify your email to enable ORCID connect and import.</p>
          ) : null}
          {!orcidConfigured ? (
            <p className="text-xs text-amber-700">ORCID provider is not configured in backend environment.</p>
          ) : null}
          {worksCount === 0 ? (
            <p className="text-xs text-muted-foreground">Citation sync becomes available after your first works import.</p>
          ) : null}
          {worksCount > 0 ? (
            <p className="text-xs text-muted-foreground">
              Quick sync uses OpenAlex. Full sync also queries Semantic Scholar.
            </p>
          ) : null}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">Google Scholar</CardTitle>
          <CardDescription>Managed as import pipeline, not direct scraping.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-2 text-sm">
          <div className="grid gap-2 md:grid-cols-2">
            <div className="rounded border border-border px-3 py-2">
              <p className="text-xs text-muted-foreground">Google OAuth status</p>
              <p className="font-medium">
                {providerByName.get('google')?.configured ? 'Configured' : 'Not configured'}
              </p>
            </div>
            <div className="rounded border border-border px-3 py-2">
              <p className="text-xs text-muted-foreground">Google provider detail</p>
              <p className="font-medium">{providerByName.get('google')?.reason || 'No provider message available'}</p>
            </div>
            <div className="rounded border border-border px-3 py-2">
              <p className="text-xs text-muted-foreground">Import mode</p>
              <p className="font-medium">BibTeX / DOI list (scaffold)</p>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => setStatus('BibTeX / DOI list import scaffold is ready. Direct Google Scholar scraping is not supported.')}
            >
              Open import scaffold
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">Integration summary</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-2 text-sm md:grid-cols-3">
          <div className="rounded border border-border px-3 py-2">
            <p className="text-xs text-muted-foreground">Imported works</p>
            <p className="font-medium">{personaState?.works.length ?? 0}</p>
          </div>
          <div className="rounded border border-border px-3 py-2">
            <p className="text-xs text-muted-foreground">Total citations</p>
            <p className="font-medium">{totalCitations}</p>
          </div>
          <div className="rounded border border-border px-3 py-2">
            <p className="text-xs text-muted-foreground">Last data update</p>
            <p>{formatTimestamp(syncStatus.works_last_updated_at)}</p>
          </div>
        </CardContent>
      </Card>

      {status ? <p className="text-sm text-emerald-700">{status}</p> : null}
      {error ? <p className="text-sm text-destructive">{error}</p> : null}
      {(loading || connecting || importing || syncing || fullSyncing) ? (
        <p className="text-xs text-muted-foreground">Working...</p>
      ) : null}
    </section>
  )
}
