import { useCallback, useEffect, useMemo, useState } from 'react'
import { Loader2, Unplug } from 'lucide-react'
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

function formatDateOnly(value: string | null | undefined): string | null {
  if (!value) {
    return null
  }
  const parsed = Date.parse(value)
  if (Number.isNaN(parsed)) {
    return null
  }
  return new Date(parsed).toLocaleDateString('en-GB', {
    year: 'numeric',
    month: 'short',
    day: '2-digit',
  })
}

function totalCitationsFromPersonaState(state: PersonaStatePayload | null | undefined): number {
  const rows = state?.metrics?.works ?? []
  return rows.reduce((sum, row) => sum + Math.max(0, Number(row.citations || 0)), 0)
}

const ORCID_SYNC_SUMMARY_STORAGE_PREFIX = 'aawe_orcid_sync_summary:'

type OrcidSyncSummaryStorage = {
  lastImportedCount: number | null
  lastReferencesSyncedCount: number | null
  lastSyncSinceLabel: string | null
  lastSyncOutcome: string | null
}

function syncSummaryStorageKey(userId: string): string {
  return `${ORCID_SYNC_SUMMARY_STORAGE_PREFIX}${userId}`
}

function loadSyncSummary(userId: string): OrcidSyncSummaryStorage | null {
  if (typeof window === 'undefined') {
    return null
  }
  const raw = window.localStorage.getItem(syncSummaryStorageKey(userId))
  if (!raw) {
    return null
  }
  try {
    const parsed = JSON.parse(raw) as Partial<OrcidSyncSummaryStorage>
    return {
      lastImportedCount:
        typeof parsed.lastImportedCount === 'number' ? parsed.lastImportedCount : null,
      lastReferencesSyncedCount:
        typeof parsed.lastReferencesSyncedCount === 'number'
          ? parsed.lastReferencesSyncedCount
          : null,
      lastSyncSinceLabel:
        typeof parsed.lastSyncSinceLabel === 'string' ? parsed.lastSyncSinceLabel : null,
      lastSyncOutcome:
        typeof parsed.lastSyncOutcome === 'string' ? parsed.lastSyncOutcome : null,
    }
  } catch {
    return null
  }
}

function saveSyncSummary(
  userId: string,
  payload: OrcidSyncSummaryStorage,
): void {
  if (typeof window === 'undefined') {
    return
  }
  window.localStorage.setItem(syncSummaryStorageKey(userId), JSON.stringify(payload))
}

function clearSyncSummary(userId: string): void {
  if (typeof window === 'undefined') {
    return
  }
  window.localStorage.removeItem(syncSummaryStorageKey(userId))
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
  const [orcidStatusResolved, setOrcidStatusResolved] = useState(false)
  const [connecting, setConnecting] = useState(false)
  const [importing, setImporting] = useState(false)
  const [disconnecting, setDisconnecting] = useState(false)
  const [confirmDisconnectOpen, setConfirmDisconnectOpen] = useState(false)
  const [status, setStatus] = useState('')
  const [googleStatus, setGoogleStatus] = useState('')
  const [error, setError] = useState('')
  const [lastImportedCount, setLastImportedCount] = useState<number | null>(null)
  const [lastReferencesSyncedCount, setLastReferencesSyncedCount] = useState<number | null>(null)
  const [lastSyncSinceLabel, setLastSyncSinceLabel] = useState<string | null>(null)
  const [lastSyncOutcome, setLastSyncOutcome] = useState<string | null>(null)
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
      setOrcidStatusResolved(true)
      setLoading(false)
      setRefreshing(false)
    }
  }, [handleSessionExpiry])

  useEffect(() => {
    const sessionToken = getAuthSessionToken()
    setToken(sessionToken)
    setOrcidStatusResolved(false)
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
      const parsed = JSON.parse(raw) as { imported_count?: number; synced_at?: string }
      if (typeof parsed.imported_count === 'number') {
        setLastImportedCount(parsed.imported_count)
        if (!lastSyncSinceLabel && parsed.synced_at) {
          const short = formatShortTimestamp(parsed.synced_at)
          if (short) {
            setLastSyncSinceLabel(short)
          }
        }
      }
    } catch {
      // Ignore malformed payload and continue with live state.
    } finally {
      window.sessionStorage.removeItem('aawe_orcid_auto_sync_result')
    }
  }, [])

  useEffect(() => {
    if (!user?.id) {
      return
    }
    const stored = loadSyncSummary(user.id)
    if (!stored) {
      setLastImportedCount(null)
      setLastReferencesSyncedCount(null)
      setLastSyncSinceLabel(null)
      setLastSyncOutcome(null)
      return
    }
    setLastImportedCount(stored.lastImportedCount)
    setLastReferencesSyncedCount(stored.lastReferencesSyncedCount)
    setLastSyncSinceLabel(stored.lastSyncSinceLabel)
    setLastSyncOutcome(stored.lastSyncOutcome)
  }, [user?.id])

  const providerByName = useMemo(() => {
    const map = new Map<string, AuthOAuthProviderStatusItem>()
    for (const provider of providerStatuses) {
      map.set(provider.provider, provider)
    }
    return map
  }, [providerStatuses])

  const worksCount = personaState?.works.length ?? 0
  const emailVerified = Boolean(user?.email_verified_at)
  const orcidStatusPending = !orcidStatusResolved
  const orcidConfigured = orcidStatusPending ? true : Boolean(orcidStatus?.configured)
  const orcidLinked = orcidStatusPending
    ? Boolean(user?.orcid_id)
    : Boolean(orcidStatus?.linked || user?.orcid_id)
  const busy = loading || connecting || importing || disconnecting
  const canConnectOrcid = !orcidStatusPending && orcidConfigured && !busy
  const canImportOrcid =
    !orcidStatusPending && emailVerified && orcidConfigured && orcidLinked && !busy
  const canDisconnectOrcid = !orcidStatusPending && orcidLinked && !busy
  const shortLastSync = formatShortTimestamp(syncStatus.orcid_last_synced_at)
  const connectionStatusLabel = orcidStatusPending
    ? 'Checking status...'
    : orcidLinked
      ? shortLastSync
        ? `Connected (${shortLastSync})`
        : 'Connected'
      : 'Not connected'
  const totalCitations = useMemo(() => totalCitationsFromPersonaState(personaState), [personaState])
  const worksLastSyncDate = formatDateOnly(syncStatus.orcid_last_synced_at)
  const referencesLastSyncDate = formatDateOnly(
    syncStatus.metrics_last_synced_at || syncStatus.orcid_last_synced_at,
  )
  const globalLastSync = formatTimestamp(
    syncStatus.metrics_last_synced_at || syncStatus.orcid_last_synced_at,
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
      const newWorksImported = Math.max(0, worksAfterImport - worksBeforeImport)
      const newReferencesSynced = Math.max(0, citationsAfterImport - citationsBeforeImport)
      const syncOutcome =
        newWorksImported > 0 || newReferencesSynced > 0
          ? `+${newWorksImported} works, +${newReferencesSynced} citations`
          : 'No new records'
      setLastImportedCount(newWorksImported)
      setLastReferencesSyncedCount(newReferencesSynced)
      setLastSyncSinceLabel(syncSinceLabel)
      setLastSyncOutcome(syncOutcome)
      if (user?.id) {
        saveSyncSummary(user.id, {
          lastImportedCount: newWorksImported,
          lastReferencesSyncedCount: newReferencesSynced,
          lastSyncSinceLabel: syncSinceLabel,
          lastSyncOutcome: syncOutcome,
        })
      }
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
          const newWorksImported = Math.max(0, worksAfterImport - worksBeforeImport)
          const newReferencesSynced = Math.max(0, citationsAfterImport - citationsBeforeImport)
          const syncOutcome =
            newWorksImported > 0 || newReferencesSynced > 0
              ? `+${newWorksImported} works, +${newReferencesSynced} citations`
              : 'No new records'
          setLastImportedCount(newWorksImported)
          setLastReferencesSyncedCount(newReferencesSynced)
          setLastSyncSinceLabel(syncSinceLabel)
          setLastSyncOutcome(syncOutcome)
          if (user?.id) {
            saveSyncSummary(user.id, {
              lastImportedCount: newWorksImported,
              lastReferencesSyncedCount: newReferencesSynced,
              lastSyncSinceLabel: syncSinceLabel,
              lastSyncOutcome: syncOutcome,
            })
          }
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

  const requestDisconnectOrcid = () => {
    if (!token || !orcidLinked || disconnecting) {
      return
    }
    setConfirmDisconnectOpen(true)
  }

  const onDisconnectOrcid = async () => {
    if (!token || !orcidLinked) {
      return
    }
    setConfirmDisconnectOpen(false)
    setDisconnecting(true)
    setError('')
    setStatus('')
    setGoogleStatus('')
    try {
      const payload = await disconnectOrcid(token)
      setOrcidStatus(payload)
      setStatus('ORCID disconnected successfully.')
      if (user?.id) {
        clearSyncSummary(user.id)
      }
      setLastImportedCount(null)
      setLastReferencesSyncedCount(null)
      setLastSyncSinceLabel(null)
      setLastSyncOutcome(null)
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
                    orcidStatusPending
                      ? 'bg-slate-100 text-slate-700'
                      : orcidLinked
                        ? 'bg-emerald-50 text-emerald-700'
                        : 'bg-amber-50 text-amber-800'
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
                  onClick={requestDisconnectOrcid}
                  disabled={!canDisconnectOrcid}
                  className="border-red-300 text-red-700 hover:border-red-400 hover:bg-red-50 hover:text-red-800"
                >
                  <Unplug className="mr-1 h-3.5 w-3.5" />
                  {disconnecting ? 'Disconnecting...' : 'Disconnect'}
                </Button>
              ) : null}
            </div>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          {orcidLinked ? (
            <div className="rounded border border-border/70 bg-slate-50 px-3 py-2 text-xs text-muted-foreground">
              Last sync: {globalLastSync}
            </div>
          ) : null}
          <div className="grid gap-2 md:grid-cols-[260px_1fr]">
            <div className="rounded border border-border px-3 py-2">
              <p className="text-xs text-muted-foreground">ORCID id</p>
              <p className="font-medium">
                {orcidStatusPending ? 'Loading...' : orcidStatus?.orcid_id || user?.orcid_id || 'Not linked'}
              </p>
              {orcidStatus?.orcid_id || user?.orcid_id ? (
                <a
                  href={`https://orcid.org/${orcidStatus?.orcid_id || user?.orcid_id}`}
                  target="_blank"
                  rel="noreferrer"
                  className="mt-1 inline-flex text-xs text-emerald-700 underline underline-offset-2"
                >
                  Open ORCID profile
                </a>
              ) : null}
            </div>
            {orcidLinked ? (
              <div className="grid gap-2 sm:grid-cols-2">
                <div className="rounded border border-border px-3 py-2 min-h-[86px]">
                  <p className="text-xs text-muted-foreground">Total works</p>
                  <p className="text-2xl font-semibold leading-tight">{worksCount}</p>
                  {worksLastSyncDate ? (
                    <p className="text-xs text-muted-foreground">last sync {worksLastSyncDate}</p>
                  ) : null}
                </div>
                <div className="rounded border border-border px-3 py-2 min-h-[86px]">
                  <p className="text-xs text-muted-foreground">New works</p>
                  <p className="text-2xl font-semibold leading-tight">{lastImportedCount ?? 0}</p>
                  <p className={`text-xs ${(lastImportedCount ?? 0) > 0 ? 'text-emerald-700' : 'text-muted-foreground'}`}>
                    {(lastImportedCount ?? 0) > 0 ? 'In latest sync' : 'No new works'}
                  </p>
                </div>
                <div className="rounded border border-border px-3 py-2 min-h-[86px]">
                  <p className="text-xs text-muted-foreground">Total citations (provider-estimated)</p>
                  <p className="text-2xl font-semibold leading-tight">{totalCitations}</p>
                  {referencesLastSyncDate ? (
                    <p className="text-xs text-muted-foreground">last sync {referencesLastSyncDate}</p>
                  ) : null}
                </div>
                <div className="rounded border border-border px-3 py-2 min-h-[86px]">
                  <p className="text-xs text-muted-foreground">New citations</p>
                  <p className="text-2xl font-semibold leading-tight">{lastReferencesSyncedCount ?? 0}</p>
                  <p className={`text-xs ${(lastReferencesSyncedCount ?? 0) > 0 ? 'text-emerald-700' : 'text-muted-foreground'}`}>
                    {(lastReferencesSyncedCount ?? 0) > 0 ? 'In latest sync' : 'No new citations'}
                  </p>
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
            {!orcidStatusPending && !orcidLinked ? (
              <Button type="button" onClick={onConnectOrcid} disabled={!canConnectOrcid}>
                {connecting ? 'Opening ORCID...' : 'Connect ORCID'}
              </Button>
            ) : null}
            {!orcidStatusPending && orcidLinked ? (
              <Button
                type="button"
                variant={importing ? 'default' : 'outline'}
                onClick={onImportOrcid}
                disabled={!canImportOrcid}
                className={importing ? 'bg-emerald-600 text-white hover:bg-emerald-700' : ''}
              >
                {importing ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                {importing
                  ? 'Finding research work and citations...'
                  : syncStatus.orcid_last_synced_at || worksCount > 0
                    ? 'Sync ORCID now'
                    : 'Import research work and citations'}
              </Button>
            ) : null}
          </div>
          {orcidStatusPending ? (
            <p className="text-xs text-muted-foreground">Checking ORCID connection...</p>
          ) : null}
          {orcidLinked && (lastSyncOutcome || lastSyncSinceLabel) ? (
            <p className="text-xs text-muted-foreground">
              {lastSyncOutcome ? (
                <span className="font-medium text-emerald-700">{lastSyncOutcome}</span>
              ) : null}
              {lastSyncSinceLabel ? (
                <span className={lastSyncOutcome ? 'ml-1' : ''}>since {lastSyncSinceLabel}</span>
              ) : null}
            </p>
          ) : null}
          {!orcidStatusPending && !orcidConfigured ? (
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

      {confirmDisconnectOpen ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/45 p-4"
          onClick={() => {
            if (!disconnecting) {
              setConfirmDisconnectOpen(false)
            }
          }}
          role="presentation"
        >
          <div
            className="w-full max-w-md rounded-lg border border-border bg-background p-5 shadow-lg"
            onClick={(event) => event.stopPropagation()}
            role="dialog"
            aria-modal="true"
            aria-label="Disconnect ORCID confirmation"
          >
            <h3 className="text-base font-semibold">Disconnect ORCID?</h3>
            <p className="mt-2 text-sm text-muted-foreground">
              Existing imported works stay in your library. You can reconnect ORCID later.
            </p>
            <div className="mt-4 flex justify-end gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => setConfirmDisconnectOpen(false)}
                disabled={disconnecting}
              >
                Cancel
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={() => void onDisconnectOrcid()}
                disabled={disconnecting}
                className="border-red-300 text-red-700 hover:border-red-400 hover:bg-red-50 hover:text-red-800"
              >
                {disconnecting ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Disconnecting...
                  </>
                ) : (
                  'Disconnect ORCID'
                )}
              </Button>
            </div>
          </div>
        </div>
      ) : null}

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
