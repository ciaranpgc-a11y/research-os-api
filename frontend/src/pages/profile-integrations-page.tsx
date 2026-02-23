import { useCallback, useEffect, useMemo, useState } from 'react'
import { Unplug } from 'lucide-react'
import { useNavigate, useSearchParams } from 'react-router-dom'

import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import {
  disconnectOrcid,
  fetchMe,
  fetchOAuthProviderStatuses,
  fetchOrcidConnect,
  fetchOrcidStatus,
  fetchPersonaState,
  importOrcidWorks,
  pingApiHealth,
} from '@/lib/impact-api'
import { readCachedPersonaState, writeCachedPersonaState } from '@/lib/persona-cache'
import { clearAuthSessionToken, getAuthSessionToken } from '@/lib/auth-session'
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

function formatShortTimestamp(value: string | null | undefined): string | null {
  if (!value) {
    return null
  }
  const parsed = Date.parse(value)
  if (Number.isNaN(parsed)) {
    return null
  }
  return new Date(parsed).toLocaleString('en-GB', {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function totalCitationsFromPersonaState(state: PersonaStatePayload | null | undefined): number {
  const rows = state?.metrics?.works ?? []
  return rows.reduce((sum, row) => sum + Math.max(0, Number(row.citations || 0)), 0)
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
  const [disconnecting, setDisconnecting] = useState(false)
  const [status, setStatus] = useState('')
  const [googleStatus, setGoogleStatus] = useState('')
  const [error, setError] = useState('')
  const [lastImportedCount, setLastImportedCount] = useState<number | null>(null)
  const [lastReferencesSyncedCount, setLastReferencesSyncedCount] = useState<number | null>(null)
  const [lastSyncSinceLabel, setLastSyncSinceLabel] = useState<string | null>(null)
  const syncStatus = personaState?.sync_status || {
    orcid_last_synced_at: null,
    metrics_last_synced_at: null,
    works_last_updated_at: null,
  }
  const orcidIssues = Array.isArray(orcidStatus?.issues) ? orcidStatus.issues : []

  const handleSessionExpiry = useCallback(
    (err: unknown): boolean => {
      const message = err instanceof Error ? err.message : ''
      const lowered = message.toLowerCase()
      const isExpired =
        lowered.includes('session is invalid or expired') ||
        lowered.includes('session was not found') ||
        lowered.includes('session token is required')
      if (!isExpired) {
        return false
      }
      clearAuthSessionToken()
      setToken('')
      navigate('/auth?next=/profile/integrations&reason=session_expired', { replace: true })
      return true
    },
    [navigate],
  )

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
      let resolvedPersonaState: PersonaStatePayload | null = null
      if (stateResult.status === 'fulfilled') {
        setPersonaState(stateResult.value)
        writeCachedPersonaState(stateResult.value)
        resolvedPersonaState = stateResult.value
      } else {
        const cached = readCachedPersonaState()
        setPersonaState(cached)
        resolvedPersonaState = cached
        if (cached) {
          setStatus('Showing cached publications data while live profile data reloads.')
        }
      }
      setProviderStatuses(providerResult.status === 'fulfilled' ? providerResult.value.providers || [] : [])
      const failedCount = settled.filter((item) => item.status === 'rejected').length
      if (failedCount > 0) {
        setStatus(`Integrations loaded with ${failedCount} unavailable source${failedCount === 1 ? '' : 's'}.`)
      }
      return { personaState: resolvedPersonaState }
    } catch (loadError) {
      if (handleSessionExpiry(loadError)) {
        return null
      }
      setError(loadError instanceof Error ? loadError.message : 'Could not load integrations.')
      return null
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }, [handleSessionExpiry])

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

  useEffect(() => {
    if (typeof window === 'undefined') {
      return
    }
    const raw = window.sessionStorage.getItem('aawe_orcid_auto_sync_result')
    if (!raw) {
      return
    }
    try {
      const parsed = JSON.parse(raw) as { imported_count?: number }
      if (typeof parsed.imported_count === 'number') {
        setLastImportedCount(parsed.imported_count)
      }
    } catch {
      // Ignore malformed payload and continue with live state.
    } finally {
      window.sessionStorage.removeItem('aawe_orcid_auto_sync_result')
    }
  }, [])

  const providerByName = useMemo(() => {
    const map = new Map<string, AuthOAuthProviderStatusItem>()
    for (const provider of providerStatuses) {
      map.set(provider.provider, provider)
    }
    return map
  }, [providerStatuses])

  const worksCount = personaState?.works.length ?? 0
  const emailVerified = Boolean(user?.email_verified_at)
  const orcidConfigured = Boolean(orcidStatus?.configured)
  const orcidLinked = Boolean(orcidStatus?.linked || user?.orcid_id)
  const busy = loading || connecting || importing || disconnecting
  const canConnectOrcid = orcidConfigured && !busy
  const canImportOrcid = emailVerified && orcidConfigured && orcidLinked && !busy
  const canDisconnectOrcid = orcidLinked && !busy
  const shortLastSync = formatShortTimestamp(syncStatus.orcid_last_synced_at)
  const connectionStatusLabel = orcidLinked
    ? shortLastSync
      ? `Connected (${shortLastSync})`
      : 'Connected'
    : 'Not connected'
  const totalCitations = useMemo(() => totalCitationsFromPersonaState(personaState), [personaState])
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
    setGoogleStatus('')
    try {
      const payload = await fetchOrcidConnect(token)
      window.location.assign(payload.url)
    } catch (connectError) {
      if (handleSessionExpiry(connectError)) {
        return
      }
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
    setGoogleStatus('')
    const worksBeforeImport = worksCount
    const citationsBeforeImport = totalCitations
    const syncSinceLabel =
      formatShortTimestamp(syncStatus.metrics_last_synced_at) ||
      formatShortTimestamp(syncStatus.orcid_last_synced_at) ||
      'initial sync'
    try {
      await pingApiHealth()
      await importOrcidWorks(token)
      const refreshed = await loadData(token, false)
      const worksAfterImport = refreshed?.personaState?.works?.length ?? worksBeforeImport
      const citationsAfterImport = totalCitationsFromPersonaState(refreshed?.personaState)
      setLastImportedCount(Math.max(0, worksAfterImport - worksBeforeImport))
      setLastReferencesSyncedCount(Math.max(0, citationsAfterImport - citationsBeforeImport))
      setLastSyncSinceLabel(syncSinceLabel)
    } catch (importError) {
      if (handleSessionExpiry(importError)) {
        setImporting(false)
        return
      }
      const detail = importError instanceof Error ? importError.message : 'Could not import ORCID works.'
      const maybeNetwork = detail.toLowerCase().includes('could not reach api') || detail.toLowerCase().includes('failed to fetch')
      if (maybeNetwork) {
        try {
          setStatus('API connection looked unstable. Retrying import once...')
          await pingApiHealth()
          await importOrcidWorks(token)
          const refreshed = await loadData(token, false)
          const worksAfterImport = refreshed?.personaState?.works?.length ?? worksBeforeImport
          const citationsAfterImport = totalCitationsFromPersonaState(refreshed?.personaState)
          setLastImportedCount(Math.max(0, worksAfterImport - worksBeforeImport))
          setLastReferencesSyncedCount(Math.max(0, citationsAfterImport - citationsBeforeImport))
          setLastSyncSinceLabel(syncSinceLabel)
          setStatus('')
          return
        } catch (retryError) {
          const retryDetail = retryError instanceof Error ? retryError.message : detail
          setError(retryDetail)
          return
        }
      }
      setError(detail)
    } finally {
      setImporting(false)
    }
  }

  const onRetryApiConnection = async () => {
    if (!token) {
      return
    }
    setRefreshing(true)
    setError('')
    setStatus('')
    setGoogleStatus('')
    try {
      await pingApiHealth()
      setStatus('API connection restored. Reloading integrations...')
      await loadData(token, false)
    } catch (retryError) {
      setError(retryError instanceof Error ? retryError.message : 'API connection retry failed.')
    } finally {
      setRefreshing(false)
    }
  }

  const onDisconnectOrcid = async () => {
    if (!token || !orcidLinked) {
      return
    }
    const confirmed = window.confirm(
      'Disconnect ORCID from this account? Existing imported works stay in your library.',
    )
    if (!confirmed) {
      return
    }
    setDisconnecting(true)
    setError('')
    setStatus('')
    setGoogleStatus('')
    try {
      const payload = await disconnectOrcid(token)
      setOrcidStatus(payload)
      setStatus('ORCID disconnected successfully.')
      await loadData(token, false)
    } catch (disconnectError) {
      if (handleSessionExpiry(disconnectError)) {
        return
      }
      setError(
        disconnectError instanceof Error
          ? disconnectError.message
          : 'Could not disconnect ORCID.',
      )
    } finally {
      setDisconnecting(false)
    }
  }

  return (
    <section className="space-y-4">
      <header className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">Integrations</h1>
      </header>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">
            <div className="flex w-full items-center justify-between gap-2">
              <div className="flex flex-wrap items-center gap-2">
                <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-[#A6CE39] text-xs font-semibold text-white">
                  iD
                </span>
                <span>ORCID</span>
                <span
                  className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${
                    orcidLinked ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-800'
                  }`}
                >
                  {connectionStatusLabel}
                </span>
              </div>
              {orcidLinked ? (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={onDisconnectOrcid}
                  disabled={!canDisconnectOrcid}
                  className="border-red-300 text-red-700 hover:border-red-400 hover:bg-red-50 hover:text-red-800"
                >
                  <Unplug className="mr-1 h-3.5 w-3.5" />
                  {disconnecting ? 'Disconnecting...' : 'Disconnect'}
                </Button>
              ) : null}
            </div>
          </CardTitle>
          <CardDescription>Primary source for publication import.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          <div className="grid gap-2 md:grid-cols-3">
            <div className="rounded border border-border px-3 py-2 md:col-span-1">
              <p className="text-xs text-muted-foreground">ORCID id</p>
              <p className="font-medium">{orcidStatus?.orcid_id || user?.orcid_id || 'Not linked'}</p>
            </div>
            {orcidLinked ? (
              <div className="grid gap-2 sm:grid-cols-2 md:col-span-2">
                <div className="rounded border border-border px-3 py-2">
                  <p className="text-xs text-muted-foreground">Total works</p>
                  <p className="text-sm font-semibold">{worksCount}</p>
                </div>
                <div className="rounded border border-border px-3 py-2">
                  <p className="text-xs text-muted-foreground">New works imported</p>
                  <p className="text-sm font-semibold">{lastImportedCount ?? 0}</p>
                  {lastSyncSinceLabel ? (
                    <p className="text-xs font-medium text-emerald-700">since {lastSyncSinceLabel}</p>
                  ) : null}
                </div>
                <div className="rounded border border-border px-3 py-2">
                  <p className="text-xs text-muted-foreground">Total references</p>
                  <p className="text-sm font-semibold">{totalCitations}</p>
                </div>
                <div className="rounded border border-border px-3 py-2">
                  <p className="text-xs text-muted-foreground">New references synced</p>
                  <p className="text-sm font-semibold">{lastReferencesSyncedCount ?? 0}</p>
                  {lastSyncSinceLabel ? (
                    <p className="text-xs font-medium text-emerald-700">since {lastSyncSinceLabel}</p>
                  ) : null}
                </div>
              </div>
            ) : null}
          </div>
          {orcidIssues.length ? (
            <div className="rounded border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
              {orcidIssues[0]}
            </div>
          ) : null}
          <div className="flex flex-wrap gap-2">
            {!orcidLinked ? (
              <Button type="button" onClick={onConnectOrcid} disabled={!canConnectOrcid}>
                {connecting ? 'Opening ORCID...' : 'Connect ORCID'}
              </Button>
            ) : null}
            {orcidLinked ? (
              <Button
                type="button"
                variant={importing ? 'default' : 'outline'}
                onClick={onImportOrcid}
                disabled={!canImportOrcid}
                className={importing ? 'bg-emerald-600 text-white hover:bg-emerald-700' : ''}
              >
                {importing
                  ? 'Importing + syncing...'
                  : syncStatus.orcid_last_synced_at || worksCount > 0
                    ? 'Refresh works + sync citations'
                    : 'Import works + sync citations'}
              </Button>
            ) : null}
          </div>
          {!orcidConfigured ? (
            <p className="text-xs text-amber-700">ORCID provider is not configured in backend environment.</p>
          ) : null}
          {status ? <p className="text-sm text-emerald-700">{status}</p> : null}
          {error ? (
            <div className="space-y-2">
              <p className="text-sm text-destructive">{error}</p>
              {error.toLowerCase().includes('could not reach api') || error.toLowerCase().includes('failed to fetch') ? (
                <Button type="button" variant="outline" size="sm" onClick={() => void onRetryApiConnection()} disabled={refreshing}>
                  {refreshing ? 'Retrying...' : 'Retry API connection'}
                </Button>
              ) : null}
            </div>
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
              onClick={() => {
                setGoogleStatus(
                  'BibTeX / DOI list import scaffold is ready. Direct Google Scholar scraping is not supported.',
                )
              }}
            >
              Open import scaffold
            </Button>
          </div>
          {googleStatus ? <p className="text-xs text-muted-foreground">{googleStatus}</p> : null}
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

    </section>
  )
}
