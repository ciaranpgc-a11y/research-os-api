import { useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'

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
  const [token, setToken] = useState<string>(() => getAuthSessionToken())
  const [user, setUser] = useState<AuthUser | null>(null)
  const [orcidStatus, setOrcidStatus] = useState<OrcidStatusPayload | null>(null)
  const [personaState, setPersonaState] = useState<PersonaStatePayload | null>(null)
  const [providerStatuses, setProviderStatuses] = useState<AuthOAuthProviderStatusItem[]>([])
  const [loading, setLoading] = useState(false)
  const [status, setStatus] = useState('')
  const [error, setError] = useState('')

  const loadData = useCallback(async (sessionToken: string) => {
    setLoading(true)
    setError('')
    setStatus('')
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
      setPersonaState(stateResult.status === 'fulfilled' ? stateResult.value : null)
      setProviderStatuses(providerResult.status === 'fulfilled' ? providerResult.value.providers || [] : [])
      const failedCount = settled.filter((item) => item.status === 'rejected').length
      if (failedCount > 0) {
        setStatus(`Integrations loaded with ${failedCount} unavailable source${failedCount === 1 ? '' : 's'}.`)
      }
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Could not load integrations.')
    } finally {
      setLoading(false)
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

  const providerByName = useMemo(() => {
    const map = new Map<string, AuthOAuthProviderStatusItem>()
    for (const provider of providerStatuses) {
      map.set(provider.provider, provider)
    }
    return map
  }, [providerStatuses])

  const metricsRows = personaState?.metrics.works ?? []
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
      setStatus(orcidStatus.issues[0] || 'ORCID is not configured in backend environment.')
      return
    }
    setError('')
    setStatus('')
    try {
      const payload = await fetchOrcidConnect(token)
      window.location.assign(payload.url)
    } catch (connectError) {
      setError(connectError instanceof Error ? connectError.message : 'ORCID connect failed.')
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
    setLoading(true)
    setError('')
    setStatus('')
    try {
      const payload = await importOrcidWorks(token)
      await syncPersonaMetrics(token, ['openalex', 'semantic_scholar'])
      setStatus(`Imported ${payload.imported_count} ORCID work(s) and refreshed citation metrics.`)
      await loadData(token)
    } catch (importError) {
      setError(importError instanceof Error ? importError.message : 'Could not import ORCID works.')
    } finally {
      setLoading(false)
    }
  }

  const onSyncMetrics = async () => {
    if (!token) {
      return
    }
    setLoading(true)
    setError('')
    setStatus('')
    try {
      const payload = await syncPersonaMetrics(token, ['openalex', 'semantic_scholar', 'manual'])
      setStatus(`Citations synchronised (${payload.synced_snapshots} metric snapshot(s)).`)
      await loadData(token)
    } catch (syncError) {
      setError(syncError instanceof Error ? syncError.message : 'Could not synchronise citations.')
    } finally {
      setLoading(false)
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
              <p>{formatTimestamp(personaState?.sync_status.orcid_last_synced_at)}</p>
            </div>
            <div className="rounded border border-border px-3 py-2">
              <p className="text-xs text-muted-foreground">Last metrics sync</p>
              <p>{formatTimestamp(personaState?.sync_status.metrics_last_synced_at)}</p>
            </div>
          </div>
          {orcidStatus?.issues.length ? (
            <div className="rounded border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
              {orcidStatus.issues[0]}
            </div>
          ) : null}
          <div className="flex flex-wrap gap-2">
            <Button type="button" variant="outline" onClick={onConnectOrcid} disabled={loading}>
              Connect ORCID
            </Button>
            <Button type="button" onClick={onImportOrcid} disabled={loading}>
              Import ORCID works
            </Button>
            <Button type="button" variant="outline" onClick={onSyncMetrics} disabled={loading}>
              Sync citations
            </Button>
          </div>
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
            <p>{formatTimestamp(personaState?.sync_status.works_last_updated_at)}</p>
          </div>
        </CardContent>
      </Card>

      {status ? <p className="text-sm text-emerald-700">{status}</p> : null}
      {error ? <p className="text-sm text-destructive">{error}</p> : null}
      {loading ? <p className="text-xs text-muted-foreground">Working...</p> : null}
    </section>
  )
}
