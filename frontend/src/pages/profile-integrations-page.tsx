import { useCallback, useEffect, useMemo, useState } from 'react'
import { Loader2, Unplug } from 'lucide-react'
import { useNavigate, useSearchParams } from 'react-router-dom'

import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  disconnectOrcid,
  enqueueOrcidImportSyncJob,
  fetchPersonaSyncJob,
  fetchMe,
  fetchOrcidConnect,
  fetchOrcidStatus,
  fetchPersonaState,
  listPersonaSyncJobs,
  pingApiHealth,
} from '@/lib/impact-api'
import { readCachedPersonaState, writeCachedPersonaState } from '@/lib/persona-cache'
import { clearAuthSessionToken, getAuthSessionToken } from '@/lib/auth-session'
import type { AuthUser, OrcidStatusPayload, PersonaStatePayload, PersonaSyncJobPayload } from '@/types/impact'

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

function formatMetricNumber(value: number | null | undefined): string {
  const numeric = Number(value)
  if (!Number.isFinite(numeric)) {
    return '0'
  }
  return Math.max(0, Math.round(numeric)).toLocaleString('en-GB')
}

function formatSyncStageLabel(value: string | null | undefined): string {
  const clean = (value || '').trim().replace(/[_-]+/g, ' ')
  if (!clean) {
    return 'processing'
  }
  return clean.charAt(0).toUpperCase() + clean.slice(1)
}
const INTEGRATIONS_USER_CACHE_KEY = 'aawe_integrations_user_cache'
const INTEGRATIONS_ORCID_STATUS_CACHE_KEY = 'aawe_integrations_orcid_status_cache'
const ORCID_SYNC_SUMMARY_STORAGE_PREFIX = 'aawe_orcid_sync_summary:'
const ORCID_ACTIVE_SYNC_JOB_STORAGE_PREFIX = 'aawe_orcid_active_sync_job:'

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

function activeSyncJobStorageKey(userId: string): string {
  return `${ORCID_ACTIVE_SYNC_JOB_STORAGE_PREFIX}${userId}`
}

function loadActiveSyncJobId(userId: string): string | null {
  if (typeof window === 'undefined') {
    return null
  }
  const raw = window.localStorage.getItem(activeSyncJobStorageKey(userId))
  const clean = (raw || '').trim()
  return clean || null
}

function saveActiveSyncJobId(userId: string, jobId: string): void {
  if (typeof window === 'undefined') {
    return
  }
  window.localStorage.setItem(activeSyncJobStorageKey(userId), jobId)
}

function clearActiveSyncJobId(userId: string): void {
  if (typeof window === 'undefined') {
    return
  }
  window.localStorage.removeItem(activeSyncJobStorageKey(userId))
}

function loadCachedIntegrationsUser(): AuthUser | null {
  if (typeof window === 'undefined') {
    return null
  }
  const raw = window.localStorage.getItem(INTEGRATIONS_USER_CACHE_KEY)
  if (!raw) {
    return null
  }
  try {
    return JSON.parse(raw) as AuthUser
  } catch {
    return null
  }
}

function saveCachedIntegrationsUser(value: AuthUser): void {
  if (typeof window === 'undefined') {
    return
  }
  window.localStorage.setItem(INTEGRATIONS_USER_CACHE_KEY, JSON.stringify(value))
}

function clearCachedIntegrationsUser(): void {
  if (typeof window === 'undefined') {
    return
  }
  window.localStorage.removeItem(INTEGRATIONS_USER_CACHE_KEY)
}

function loadCachedOrcidStatus(): OrcidStatusPayload | null {
  if (typeof window === 'undefined') {
    return null
  }
  const raw = window.localStorage.getItem(INTEGRATIONS_ORCID_STATUS_CACHE_KEY)
  if (!raw) {
    return null
  }
  try {
    return JSON.parse(raw) as OrcidStatusPayload
  } catch {
    return null
  }
}

function saveCachedOrcidStatus(value: OrcidStatusPayload): void {
  if (typeof window === 'undefined') {
    return
  }
  window.localStorage.setItem(INTEGRATIONS_ORCID_STATUS_CACHE_KEY, JSON.stringify(value))
}

function clearCachedOrcidStatus(): void {
  if (typeof window === 'undefined') {
    return
  }
  window.localStorage.removeItem(INTEGRATIONS_ORCID_STATUS_CACHE_KEY)
}

export type ProfileIntegrationsPageFixture = {
  token?: string
  user?: AuthUser | null
  orcidStatus?: OrcidStatusPayload | null
  personaState?: PersonaStatePayload | null
  status?: string
  error?: string
  lastImportedCount?: number | null
  lastReferencesSyncedCount?: number | null
  lastSyncSinceLabel?: string | null
  lastSyncOutcome?: string | null
  activeSyncJob?: PersonaSyncJobPayload | null
}

type ProfileIntegrationsPageProps = {
  fixture?: ProfileIntegrationsPageFixture
}
export function ProfileIntegrationsPage({ fixture }: ProfileIntegrationsPageProps = {}) {
  const navigate = useNavigate()
  const isFixtureMode = Boolean(fixture)
  const [searchParams] = useSearchParams()
  const initialCachedUser = fixture?.user ?? loadCachedIntegrationsUser()
  const initialCachedOrcidStatus = fixture?.orcidStatus ?? loadCachedOrcidStatus()
  const initialCachedPersonaState = fixture?.personaState ?? readCachedPersonaState()
  const [token, setToken] = useState<string>(() => fixture?.token ?? getAuthSessionToken())
  const [user, setUser] = useState<AuthUser | null>(initialCachedUser)
  const [orcidStatus, setOrcidStatus] = useState<OrcidStatusPayload | null>(initialCachedOrcidStatus)
  const [personaState, setPersonaState] = useState<PersonaStatePayload | null>(initialCachedPersonaState)
  const [loading, setLoading] = useState(false)
  const [refreshing, setRefreshing] = useState(false)
  const [orcidStatusResolved, setOrcidStatusResolved] = useState(
    Boolean(initialCachedOrcidStatus || initialCachedUser?.orcid_id || fixture?.orcidStatus),
  )
  const [connecting, setConnecting] = useState(false)
  const [importing, setImporting] = useState(false)
  const [disconnecting, setDisconnecting] = useState(false)
  const [confirmDisconnectOpen, setConfirmDisconnectOpen] = useState(false)
  const [status, setStatus] = useState(fixture?.status ?? '')
  const [error, setError] = useState(fixture?.error ?? '')
  const [lastImportedCount, setLastImportedCount] = useState<number | null>(fixture?.lastImportedCount ?? null)
  const [lastReferencesSyncedCount, setLastReferencesSyncedCount] = useState<number | null>(fixture?.lastReferencesSyncedCount ?? null)
  const [lastSyncSinceLabel, setLastSyncSinceLabel] = useState<string | null>(fixture?.lastSyncSinceLabel ?? null)
  const [lastSyncOutcome, setLastSyncOutcome] = useState<string | null>(fixture?.lastSyncOutcome ?? null)
  const [activeSyncJob, setActiveSyncJob] = useState<PersonaSyncJobPayload | null>(fixture?.activeSyncJob ?? null)
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
      clearCachedIntegrationsUser()
      clearCachedOrcidStatus()
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
        listPersonaSyncJobs(sessionToken, 5),
      ])
      const [meResult, orcidResult, stateResult, jobsResult] = settled
      if (meResult.status === 'fulfilled') {
        setUser(meResult.value)
        saveCachedIntegrationsUser(meResult.value)
        const activeJobId = loadActiveSyncJobId(meResult.value.id)
        if (activeJobId && !activeSyncJob) {
          setActiveSyncJob({
            id: activeJobId,
            user_id: meResult.value.id,
            job_type: 'orcid_import',
            status: 'queued',
            overwrite_user_metadata: false,
            run_metrics_sync: false,
            refresh_analytics: true,
            refresh_metrics: false,
            providers: [],
            progress_percent: 0,
            current_stage: 'queued',
            result_json: {},
            error_detail: null,
            started_at: null,
            completed_at: null,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          })
        }
      }
      if (orcidResult.status === 'fulfilled') {
        setOrcidStatus(orcidResult.value)
        saveCachedOrcidStatus(orcidResult.value)
      }
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
      if (jobsResult.status === 'fulfilled') {
        const activeJob = (jobsResult.value || []).find((item) => item.status === 'queued' || item.status === 'running') || null
        if (activeJob) {
          setActiveSyncJob(activeJob)
          if (activeJob.user_id) {
            saveActiveSyncJobId(activeJob.user_id, activeJob.id)
          }
        } else if (meResult.status === 'fulfilled') {
          clearActiveSyncJobId(meResult.value.id)
          setActiveSyncJob(null)
        }
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
    if (isFixtureMode) {
      return
    }
    const sessionToken = getAuthSessionToken()
    setToken(sessionToken)
    if (!sessionToken) {
      clearCachedIntegrationsUser()
      clearCachedOrcidStatus()
      navigate('/auth', { replace: true })
      return
    }
    void loadData(sessionToken)
  }, [isFixtureMode, loadData, navigate])

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
    if (user) {
      saveCachedIntegrationsUser(user)
      return
    }
    clearCachedIntegrationsUser()
  }, [user])

  useEffect(() => {
    if (orcidStatus) {
      saveCachedOrcidStatus(orcidStatus)
      return
    }
    clearCachedOrcidStatus()
  }, [orcidStatus])

  useEffect(() => {
    if (activeSyncJob && (activeSyncJob.status === 'queued' || activeSyncJob.status === 'running')) {
      setImporting(true)
      return
    }
    setImporting(false)
  }, [activeSyncJob])

  useEffect(() => {
    if (isFixtureMode || typeof window === 'undefined') {
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
  }, [isFixtureMode])

  useEffect(() => {
    if (isFixtureMode || !user?.id) {
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
  }, [isFixtureMode, user?.id])

  const worksCount = personaState?.works.length ?? 0
  const emailVerified = Boolean(user?.email_verified_at)
  const orcidStatusPending = !orcidStatusResolved
  const orcidConfigured = orcidStatusPending ? true : Boolean(orcidStatus?.configured)
  const orcidLinked = orcidStatusPending
    ? Boolean(user?.orcid_id)
    : Boolean(orcidStatus?.linked || user?.orcid_id)
  const busy = loading || connecting || importing || disconnecting
  const canConnectOrcid = !isFixtureMode && !orcidStatusPending && orcidConfigured && !busy
  const canImportOrcid =
    !isFixtureMode && !orcidStatusPending && emailVerified && orcidConfigured && orcidLinked && !busy
  const canDisconnectOrcid = !isFixtureMode && !orcidStatusPending && orcidLinked && !busy
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
  const normalizedNewWorks = Math.max(0, Math.round(Number(lastImportedCount || 0)))
  const normalizedNewCitations = Math.max(0, Math.round(Number(lastReferencesSyncedCount || 0)))
  const syncInProgress =
    activeSyncJob?.status === 'queued' || activeSyncJob?.status === 'running'
  const syncProgressPercent = syncInProgress
    ? Math.min(100, Math.max(0, Math.round(Number(activeSyncJob?.progress_percent || 0))))
    : 0
  const syncStageLabel = formatSyncStageLabel(activeSyncJob?.current_stage)
  const statusLower = status.toLowerCase()
  const statusToneClass = error
    ? 'border-[hsl(var(--tone-danger-200))] bg-[hsl(var(--tone-danger-50))] text-[hsl(var(--tone-danger-800))]'
    : statusLower.includes('verify') || statusLower.includes('not configured')
      ? 'border-[hsl(var(--tone-warning-200))] bg-[hsl(var(--tone-warning-50))] text-[hsl(var(--tone-warning-800))]'
      : 'border-[hsl(var(--tone-positive-200))] bg-[hsl(var(--tone-positive-50))] text-[hsl(var(--tone-positive-700))]'
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
      return
    }
    setImporting(true)
    setError('')
    setStatus('')
    try {
      const job = await enqueueOrcidImportSyncJob(token, {
        overwriteUserMetadata: false,
        runMetricsSync: false,
        providers: ['openalex'],
        refreshAnalytics: true,
        refreshMetrics: false,
      })
      setActiveSyncJob(job)
      if (user?.id) {
        saveActiveSyncJobId(user.id, job.id)
      }
      setStatus('ORCID sync started in background. You can leave this page.')
    } catch (importError) {
      if (handleSessionExpiry(importError)) {
        setImporting(false)
        return
      }
      setStatus('')
      setError(importError instanceof Error ? importError.message : 'Could not queue ORCID sync.')
    } finally {
      // `importing` remains controlled by active background job state.
    }
  }

  useEffect(() => {
    if (isFixtureMode || !token || !activeSyncJob?.id) {
      return
    }
    let cancelled = false

    const poll = async () => {
      try {
        const job = await fetchPersonaSyncJob(token, activeSyncJob.id)
        if (cancelled) {
          return
        }
        setActiveSyncJob(job)
        if (job.status === 'queued' || job.status === 'running') {
          setStatus('')
          return
        }

        if (job.status === 'completed') {
          if (user?.id) {
            clearActiveSyncJobId(user.id)
          }
          setActiveSyncJob(null)
          const result = (job.result_json || {}) as Record<string, unknown>
          const importPayload = (result.orcid_import || {}) as Record<string, unknown>
          const importedCount = Number(importPayload.imported_count || 0)
          if (Number.isFinite(importedCount)) {
            const cleanImported = Math.max(0, Math.round(importedCount))
            setLastImportedCount(cleanImported)
            setLastSyncSinceLabel(formatShortTimestamp(new Date().toISOString()))
            setLastSyncOutcome(cleanImported > 0 ? `+${cleanImported} works` : 'No new records')
            if (user?.id) {
              saveSyncSummary(user.id, {
                lastImportedCount: cleanImported,
                lastReferencesSyncedCount: lastReferencesSyncedCount,
                lastSyncSinceLabel: formatShortTimestamp(new Date().toISOString()),
                lastSyncOutcome: cleanImported > 0 ? `+${cleanImported} works` : 'No new records',
              })
            }
          }
          await loadData(token, false)
          return
        }

        if (user?.id) {
          clearActiveSyncJobId(user.id)
        }
        setActiveSyncJob(null)
        setStatus('')
        setError(job.error_detail || 'ORCID sync failed in background.')
      } catch (pollError) {
        if (cancelled) {
          return
        }
        if (handleSessionExpiry(pollError)) {
          return
        }
      }
    }

    void poll()
    const timer = window.setInterval(() => {
      void poll()
    }, 2500)
    return () => {
      cancelled = true
      window.clearInterval(timer)
    }
  }, [activeSyncJob?.id, handleSessionExpiry, isFixtureMode, loadData, token, user?.id])

  const onRetryApiConnection = async () => {
    if (!token) {
      return
    }
    setRefreshing(true)
    setError('')
    setStatus('')
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
    try {
      const payload = await disconnectOrcid(token)
      setOrcidStatus(payload)
      setStatus('ORCID disconnected successfully.')
      if (user?.id) {
        clearSyncSummary(user.id)
        clearActiveSyncJobId(user.id)
      }
      setActiveSyncJob(null)
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

      <Card className="border-[hsl(var(--tone-neutral-200))]">
        <CardHeader className="space-y-3 border-b border-[hsl(var(--tone-neutral-200))] pb-3">
          <div className="flex w-full flex-wrap items-start justify-between gap-3">
            <div className="flex flex-wrap items-center gap-2.5">
              <span className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-brand-orcid text-xs font-semibold text-white">
                iD
              </span>
              <div className="space-y-0.5">
                <CardTitle className="text-base font-semibold tracking-tight text-[hsl(var(--tone-neutral-900))]">ORCID</CardTitle>
                <p className="text-caption uppercase tracking-[0.1em] text-[hsl(var(--tone-neutral-500))]">
                  Research identity and publication sync
                </p>
              </div>
              <span
                className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium ${
                  orcidStatusPending
                    ? 'border-[hsl(var(--tone-neutral-200))] bg-[hsl(var(--tone-neutral-100))] text-[hsl(var(--tone-neutral-700))]'
                    : orcidLinked
                      ? 'border-[hsl(var(--tone-positive-200))] bg-[hsl(var(--tone-positive-50))] text-[hsl(var(--tone-positive-700))]'
                      : 'border-[hsl(var(--tone-danger-200))] bg-[hsl(var(--tone-danger-50))] text-[hsl(var(--tone-danger-700))]'
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
                className="border-[hsl(var(--tone-danger-200))] text-[hsl(var(--tone-danger-700))] hover:border-[hsl(var(--tone-danger-300))] hover:bg-[hsl(var(--tone-danger-50))] hover:text-[hsl(var(--tone-danger-800))]"
              >
                <Unplug className="mr-1 h-3.5 w-3.5" />
                {disconnecting ? 'Disconnecting...' : 'Disconnect'}
              </Button>
            ) : null}
          </div>
          {orcidLinked ? (
            <div className="rounded-md border border-[hsl(var(--tone-neutral-200))] bg-[hsl(var(--tone-neutral-50))] px-3 py-2 text-xs text-[hsl(var(--tone-neutral-600))]">
              Last sync: {globalLastSync}
            </div>
          ) : null}
        </CardHeader>
        <CardContent className="space-y-4 pt-4 text-sm">

          <div className="grid gap-3 md:grid-cols-[280px_1fr]">
            <div className="rounded-md border border-[hsl(var(--tone-neutral-200))] bg-[hsl(var(--tone-neutral-50))] px-3 py-3">
              <p className="text-caption uppercase tracking-[0.08em] text-[hsl(var(--tone-neutral-500))]">ORCID iD</p>
              <p className="mt-1 text-base font-semibold text-[hsl(var(--tone-neutral-900))]">
                {orcidStatusPending ? 'Loading...' : orcidStatus?.orcid_id || user?.orcid_id || 'Not linked'}
              </p>
              {orcidStatus?.orcid_id || user?.orcid_id ? (
                <a
                  href={`https://orcid.org/${orcidStatus?.orcid_id || user?.orcid_id}`}
                  target="_blank"
                  rel="noreferrer"
                  className="mt-2 inline-flex text-label font-medium text-[hsl(var(--tone-accent-700))] underline underline-offset-2"
                >
                  Open ORCID profile
                </a>
              ) : (
                <p className="mt-2 text-xs text-[hsl(var(--tone-neutral-500))]">Link ORCID to enable full citation sync.</p>
              )}
            </div>

            {orcidLinked ? (
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="flex min-h-sz-96 flex-col justify-between rounded-md border border-[hsl(var(--tone-neutral-200))] bg-card px-3 py-2.5">
                  <div>
                    <p className="text-caption uppercase tracking-[0.08em] text-[hsl(var(--tone-neutral-500))]">Total works</p>
                    <p className="mt-1 text-2xl font-semibold leading-tight text-[hsl(var(--tone-neutral-900))]">{formatMetricNumber(worksCount)}</p>
                  </div>
                  {worksLastSyncDate ? (
                    <p className="text-xs text-[hsl(var(--tone-neutral-500))]">Last sync {worksLastSyncDate}</p>
                  ) : <span />}
                </div>
                <div className="flex min-h-sz-96 flex-col justify-between rounded-md border border-[hsl(var(--tone-neutral-200))] bg-card px-3 py-2.5">
                  <div>
                    <p className="text-caption uppercase tracking-[0.08em] text-[hsl(var(--tone-neutral-500))]">New works</p>
                    <p className="mt-1 text-2xl font-semibold leading-tight text-[hsl(var(--tone-neutral-900))]">{formatMetricNumber(normalizedNewWorks)}</p>
                  </div>
                  <p className={`text-xs ${normalizedNewWorks > 0 ? 'text-[hsl(var(--tone-positive-700))]' : 'text-[hsl(var(--tone-neutral-500))]'}`}>
                    {normalizedNewWorks > 0 ? 'In latest sync' : 'No new works'}
                  </p>
                </div>
                <div className="flex min-h-sz-96 flex-col justify-between rounded-md border border-[hsl(var(--tone-neutral-200))] bg-card px-3 py-2.5">
                  <div>
                    <p className="text-caption uppercase tracking-[0.08em] text-[hsl(var(--tone-neutral-500))]">Total citations</p>
                    <p className="mt-1 text-2xl font-semibold leading-tight text-[hsl(var(--tone-neutral-900))]">{formatMetricNumber(totalCitations)}</p>
                  </div>
                  {referencesLastSyncDate ? (
                    <p className="text-xs text-[hsl(var(--tone-neutral-500))]">Last sync {referencesLastSyncDate}</p>
                  ) : <span />}
                </div>
                <div className="flex min-h-sz-96 flex-col justify-between rounded-md border border-[hsl(var(--tone-neutral-200))] bg-card px-3 py-2.5">
                  <div>
                    <p className="text-caption uppercase tracking-[0.08em] text-[hsl(var(--tone-neutral-500))]">New citations</p>
                    <p className="mt-1 text-2xl font-semibold leading-tight text-[hsl(var(--tone-neutral-900))]">{formatMetricNumber(normalizedNewCitations)}</p>
                  </div>
                  <p className={`text-xs ${normalizedNewCitations > 0 ? 'text-[hsl(var(--tone-positive-700))]' : 'text-[hsl(var(--tone-neutral-500))]'}`}>
                    {normalizedNewCitations > 0 ? 'In latest sync' : 'No new citations'}
                  </p>
                </div>
              </div>
            ) : (
              <div className="flex min-h-sz-96 flex-col justify-center rounded-md border border-dashed border-[hsl(var(--tone-neutral-300))] bg-[hsl(var(--tone-neutral-50))] px-4 py-4">
                <p className="text-sm font-semibold text-[hsl(var(--tone-neutral-900))]">No ORCID connection</p>
                <p className="mt-1 text-sm text-[hsl(var(--tone-neutral-600))]">
                  Connect ORCID to import your publications, citations, and profile metrics.
                </p>
                <p className="mt-2 text-xs uppercase tracking-[0.08em] text-[hsl(var(--tone-neutral-500))]">
                  Expected sync: works, citation deltas, and source timestamps
                </p>
              </div>
            )}
          </div>

          {orcidIssues.length ? (
            <div className="rounded-md border border-[hsl(var(--tone-warning-200))] bg-[hsl(var(--tone-warning-50))] px-3 py-2 text-xs text-[hsl(var(--tone-warning-800))]">
              {orcidIssues[0]}
            </div>
          ) : null}

          <div className="flex flex-wrap items-center gap-2 border-t border-[hsl(var(--tone-neutral-200))] pt-3">
            {!orcidStatusPending && !orcidLinked ? (
              <Button
                type="button"
                onClick={onConnectOrcid}
                disabled={!canConnectOrcid}
                className="bg-[hsl(var(--tone-accent-700))] text-white hover:bg-[hsl(var(--tone-accent-800))]"
              >
                {connecting ? 'Opening ORCID...' : 'Connect ORCID'}
              </Button>
            ) : null}
            {!orcidStatusPending && orcidLinked ? (
              <Button
                type="button"
                variant={importing ? 'default' : 'outline'}
                onClick={onImportOrcid}
                disabled={!canImportOrcid}
                className={importing ? 'bg-[hsl(var(--tone-positive-600))] text-white hover:bg-[hsl(var(--tone-positive-700))]' : ''}
              >
                {importing ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                {importing
                  ? 'Finding research work and citations...'
                  : syncStatus.orcid_last_synced_at || worksCount > 0
                    ? 'Sync ORCID now'
                    : 'Import research work and citations'}
              </Button>
            ) : null}
            {orcidStatusPending ? (
              <p className="text-xs text-[hsl(var(--tone-neutral-500))]">Checking ORCID connection...</p>
            ) : null}
            {orcidLinked && (lastSyncOutcome || lastSyncSinceLabel) ? (
              <p className="text-xs text-[hsl(var(--tone-neutral-500))]">
                {lastSyncOutcome ? (
                  <span className="font-medium text-[hsl(var(--tone-positive-700))]">{lastSyncOutcome}</span>
                ) : null}
                {lastSyncSinceLabel ? (
                  <span className={lastSyncOutcome ? 'ml-1' : ''}>since {lastSyncSinceLabel}</span>
                ) : null}
              </p>
            ) : null}
          </div>

          {syncInProgress ? (
            <div className="rounded-md border border-[hsl(var(--tone-accent-200))] bg-[hsl(var(--tone-accent-50))] px-3 py-2">
              <div className="flex items-center justify-between gap-2 text-xs text-[hsl(var(--tone-accent-800))]">
                <p className="font-medium">ORCID sync in progress</p>
                <p>{syncProgressPercent}%</p>
              </div>
              <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-[hsl(var(--tone-accent-100))]">
                <div className="h-full bg-[hsl(var(--tone-accent-600))] transition-[width] duration-300" style={{ width: `${syncProgressPercent}%` }} />
              </div>
              <p className="mt-1 text-xs text-[hsl(var(--tone-accent-700))]">Stage: {syncStageLabel}</p>
            </div>
          ) : null}

          {!orcidStatusPending && !orcidConfigured ? (
            <p className="text-xs text-[hsl(var(--tone-warning-700))]">ORCID provider is not configured in backend environment.</p>
          ) : null}

          {status || error ? (
            <div className={`space-y-2 rounded-md border px-3 py-2 ${statusToneClass}`}>
              <p className="text-sm">{error || status}</p>
              {error && (error.toLowerCase().includes('could not reach api') || error.toLowerCase().includes('failed to fetch')) ? (
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

    </section>
  )
}







