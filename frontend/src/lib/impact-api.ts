import { API_BASE_URL } from '@/lib/api'
import { getAuthAccountKeyHint, rememberAuthUserIdentity, setCachedAuthRole } from '@/lib/auth-session'
import type { ApiErrorPayload } from '@/types/insight'
import type {
  AdminAuditEventsListPayload,
  AdminJobActionPayload,
  AdminJobsListPayload,
  AdminUserDeletePayload,
  AdminUserLibraryStorageRecoverPayload,
  AdminUserLibraryReconcilePayload,
  AdminUserPublicationsRefreshPayload,
  AffiliationAddressResolutionPayload,
  AffiliationSuggestionsPayload,
  AdminOrganisationsListPayload,
  AdminOverviewPayload,
  AdminOrganisationImpersonationStartPayload,
  AdminApiMonitorPayload,
  AdminJournalProfilesListPayload,
  AdminPublicationsAutoSyncSettingUpdatePayload,
  AdminCollaborationMetricsRecomputeAllPayload,
  AdminPublicationsSyncRunAllPayload,
  AdminRuntimeSettingsPayload,
  AdminUsageCostsPayload,
  AdminUsersListPayload,
  AdminWorkspacesListPayload,
  AdminWorkTypeLlmSettingUpdatePayload,
  AuthEmailVerificationRequestPayload,
  AuthLoginChallengePayload,
  AuthOAuthProviderStatusesPayload,
  AuthOAuthCallbackPayload,
  AuthOAuthConnectPayload,
  AuthPasswordResetConfirmPayload,
  AuthPasswordResetRequestPayload,
  AuthSessionPayload,
  AuthTwoFactorSetupPayload,
  AuthTwoFactorStatePayload,
  AuthUser,
  CollaboratorPayload,
  CollaboratorSharedWorksByCollaboratorPayload,
  CollaboratorSharedWorksListPayload,
  CollaboratorsListPayload,
  CollaborationAiAffiliationsNormalisePayload,
  CollaborationAiAuthorSuggestionsPayload,
  CollaborationAiContributionDraftPayload,
  CollaborationAiInsightsPayload,
  CollaborationEnrichOpenAlexPayload,
  CollaborationImportOpenAlexPayload,
  CollaborationLandingPayload,
  CollaborationMetricsSummaryPayload,
  ImpactAnalysePayload,
  ImpactCollaboratorsPayload,
  ImpactRecomputePayload,
  ImpactReportPayload,
  ImpactThemesPayload,
  PersonaSyncJobPayload,
  PublicationAiInsightsResponsePayload,
  PublicationInsightsAgentPayload,
  PublicationAuthorsPayload,
  PublicationDetailPayload,
  PublicationMetricDetailPayload,
  PublicationFileLinkPayload,
  PublicationFilePayload,
  PublicationFilesListPayload,
  PublicationImpactResponsePayload,
  PersonaStatePayload,
  PersonaContextPayload,
  PersonaGrantsPayload,
  PersonaEmbeddingsGeneratePayload,
  PersonaMetricsSyncPayload,
  PersonaJournal,
  PersonaJournalRefreshPayload,
  PublicationsAnalyticsResponsePayload,
  PublicationsAnalyticsSummaryPayload,
  PublicationsAnalyticsTimeseriesPayload,
  PublicationsAnalyticsTopDriversPayload,
  PublicationsTopMetricsPayload,
  PublicationsTopMetricsRefreshPayload,
  PersonaWork,
} from '@/types/impact'

async function parseApiError(response: Response, fallback: string): Promise<string> {
  try {
    const payload = (await response.json()) as ApiErrorPayload
    return payload.error?.detail || payload.error?.message || fallback
  } catch {
    return fallback
  }
}

function authHeaders(token: string): Record<string, string> {
  const clean = token.trim()
  const accountKeyHint = getAuthAccountKeyHint()
  const headers: Record<string, string> = {}
  if (accountKeyHint) {
    headers['X-AAWE-Account-Key'] = accountKeyHint
  }
  if (!clean) {
    return headers
  }
  headers.Authorization = `Bearer ${clean}`
  return headers
}

function cacheAuthIdentity(user: AuthUser): void {
  setCachedAuthRole(user.role)
  rememberAuthUserIdentity({
    email: user.email,
    accountKey: user.account_key,
  })
}

const REQUEST_TIMEOUT_MS =
  Number(import.meta.env.VITE_API_REQUEST_TIMEOUT_MS || '90000') || 90_000
const REQUEST_RETRY_COUNT =
  Number(import.meta.env.VITE_API_REQUEST_RETRY_COUNT || '3') || 3

function isRetryableStatus(status: number): boolean {
  return status === 408 || status === 425 || status === 429 || status === 500 || status === 502 || status === 503 || status === 504
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, ms))
}

function isAbortError(error: unknown): boolean {
  return error instanceof DOMException && error.name === 'AbortError'
}

type RequestOverrides = {
  timeoutMs?: number
  retryCount?: number
}

async function requestJson<T>(
  url: string,
  init: RequestInit,
  fallbackError: string,
  overrides?: RequestOverrides,
): Promise<T> {
  const timeoutMs = Math.max(5000, Number(overrides?.timeoutMs || REQUEST_TIMEOUT_MS))
  const retryCount = Math.max(0, Number(overrides?.retryCount ?? REQUEST_RETRY_COUNT))
  let lastError: Error | null = null
  for (let attempt = 0; attempt <= retryCount; attempt += 1) {
    const controller = new AbortController()
    const timeout = window.setTimeout(() => controller.abort(), timeoutMs)
    let response: Response | null = null
    try {
      response = await fetch(url, { ...init, signal: controller.signal })
    } catch (error) {
      if (attempt < retryCount) {
        await sleep(900 * (attempt + 1))
        continue
      }
      const origin = typeof window !== 'undefined' ? window.location.origin : 'unknown-origin'
      const detail = isAbortError(error)
        ? `Request timed out after ${Math.round(timeoutMs / 1000)}s`
        : error instanceof Error
          ? error.message
          : 'Network error'
      lastError = new Error(`Could not reach API at ${API_BASE_URL}. UI origin: ${origin}. Detail: ${detail}`)
    } finally {
      window.clearTimeout(timeout)
    }
    if (!response) {
      continue
    }
    if (!response.ok) {
      if (isRetryableStatus(response.status) && attempt < retryCount) {
        await sleep(900 * (attempt + 1))
        continue
      }
      throw new Error(await parseApiError(response, `${fallbackError} (${response.status})`))
    }
    return (await response.json()) as T
  }
  throw lastError || new Error(`Could not reach API at ${API_BASE_URL}.`)
}

export async function registerAuth(input: {
  email: string
  password: string
  name: string
}): Promise<AuthSessionPayload> {
  const payload = await requestJson<AuthSessionPayload>(
    `${API_BASE_URL}/v1/auth/register`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
    },
    'Registration failed',
    { timeoutMs: 30_000, retryCount: 0 },
  )
  cacheAuthIdentity(payload.user)
  return payload
}

export async function loginAuth(input: {
  email: string
  password: string
}): Promise<AuthSessionPayload> {
  const payload = await requestJson<AuthSessionPayload>(
    `${API_BASE_URL}/v1/auth/login`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
    },
    'Login failed',
    { timeoutMs: 30_000, retryCount: 0 },
  )
  cacheAuthIdentity(payload.user)
  return payload
}

export async function loginAuthChallenge(input: {
  email: string
  password: string
}): Promise<AuthLoginChallengePayload> {
  return requestJson<AuthLoginChallengePayload>(
    `${API_BASE_URL}/v1/auth/login/challenge`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
    },
    'Login challenge failed',
    { timeoutMs: 30_000, retryCount: 0 },
  )
}

export async function verifyLoginTwoFactor(input: {
  challengeToken: string
  code: string
}): Promise<AuthSessionPayload> {
  const payload = await requestJson<AuthSessionPayload>(
    `${API_BASE_URL}/v1/auth/login/verify-2fa`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        challenge_token: input.challengeToken,
        code: input.code,
      }),
    },
    '2FA verification failed',
    { timeoutMs: 30_000, retryCount: 0 },
  )
  cacheAuthIdentity(payload.user)
  return payload
}

export async function logoutAuth(token: string): Promise<{ success: boolean }> {
  return requestJson<{ success: boolean }>(
    `${API_BASE_URL}/v1/auth/logout`,
    {
      method: 'POST',
      headers: authHeaders(token),
    },
    'Logout failed',
  )
}

export async function fetchMe(token: string): Promise<AuthUser> {
  const payload = await requestJson<AuthUser>(
    `${API_BASE_URL}/v1/auth/me`,
    {
      method: 'GET',
      headers: authHeaders(token),
    },
    'User lookup failed',
  )
  cacheAuthIdentity(payload)
  return payload
}

export async function fetchAdminOverview(token: string): Promise<AdminOverviewPayload> {
  return requestJson<AdminOverviewPayload>(
    `${API_BASE_URL}/v1/admin/overview`,
    {
      method: 'GET',
      headers: authHeaders(token),
    },
    'Admin overview lookup failed',
  )
}

export async function fetchAdminUsers(
  token: string,
  options?: {
    query?: string
    limit?: number
    offset?: number
  },
): Promise<AdminUsersListPayload> {
  const params = new URLSearchParams()
  if (String(options?.query || '').trim()) {
    params.set('query', String(options?.query || '').trim())
  }
  params.set('limit', String(Math.max(1, Math.min(200, Number(options?.limit || 50)))))
  params.set('offset', String(Math.max(0, Number(options?.offset || 0))))
  return requestJson<AdminUsersListPayload>(
    `${API_BASE_URL}/v1/admin/users?${params.toString()}`,
    {
      method: 'GET',
      headers: authHeaders(token),
    },
    'Admin users lookup failed',
  )
}

export async function reconcileAdminUserLibrary(
  token: string,
  userId: string,
): Promise<AdminUserLibraryReconcilePayload> {
  return requestJson<AdminUserLibraryReconcilePayload>(
    `${API_BASE_URL}/v1/admin/users/${encodeURIComponent(userId)}/library/reconcile`,
    {
      method: 'POST',
      headers: authHeaders(token),
    },
    'Admin user library reconcile failed',
    { timeoutMs: 120_000, retryCount: 0 },
  )
}

export async function recoverAdminUserLibraryStorage(
  token: string,
  userId: string,
  input?: { reason?: string },
): Promise<AdminUserLibraryStorageRecoverPayload> {
  return requestJson<AdminUserLibraryStorageRecoverPayload>(
    `${API_BASE_URL}/v1/admin/users/${encodeURIComponent(userId)}/library/recover-storage`,
    {
      method: 'POST',
      headers: { ...authHeaders(token), 'Content-Type': 'application/json' },
      body: JSON.stringify({
        reason: String(input?.reason || ''),
      }),
    },
    'Admin user library storage recovery failed',
    { timeoutMs: 120_000, retryCount: 0 },
  )
}

export async function refreshAdminUserPublications(
  token: string,
  userId: string,
  input?: { reason?: string },
): Promise<AdminUserPublicationsRefreshPayload> {
  return requestJson<AdminUserPublicationsRefreshPayload>(
    `${API_BASE_URL}/v1/admin/users/${encodeURIComponent(userId)}/publications/refresh`,
    {
      method: 'POST',
      headers: { ...authHeaders(token), 'Content-Type': 'application/json' },
      body: JSON.stringify({
        reason: String(input?.reason || ''),
      }),
    },
    'Admin user publication refresh failed',
    { timeoutMs: 120_000, retryCount: 0 },
  )
}

export async function deleteAdminUserAccount(
  token: string,
  userId: string,
  input: {
    confirmPhrase: string
    reason?: string
  },
): Promise<AdminUserDeletePayload> {
  return requestJson<AdminUserDeletePayload>(
    `${API_BASE_URL}/v1/admin/users/${encodeURIComponent(userId)}`,
    {
      method: 'DELETE',
      headers: { ...authHeaders(token), 'Content-Type': 'application/json' },
      body: JSON.stringify({
        confirm_phrase: String(input.confirmPhrase || ''),
        reason: String(input.reason || ''),
      }),
    },
    'Admin user delete failed',
    { timeoutMs: 120_000, retryCount: 0 },
  )
}

export async function fetchAdminOrganisations(
  token: string,
  options?: {
    query?: string
    limit?: number
    offset?: number
  },
): Promise<AdminOrganisationsListPayload> {
  const params = new URLSearchParams()
  if (String(options?.query || '').trim()) {
    params.set('query', String(options?.query || '').trim())
  }
  params.set('limit', String(Math.max(1, Math.min(200, Number(options?.limit || 25)))))
  params.set('offset', String(Math.max(0, Number(options?.offset || 0))))
  return requestJson<AdminOrganisationsListPayload>(
    `${API_BASE_URL}/v1/admin/organisations?${params.toString()}`,
    {
      method: 'GET',
      headers: authHeaders(token),
    },
    'Admin organisations lookup failed',
  )
}

export async function fetchAdminWorkspaces(
  token: string,
  options?: {
    query?: string
    limit?: number
    offset?: number
  },
): Promise<AdminWorkspacesListPayload> {
  const params = new URLSearchParams()
  if (String(options?.query || '').trim()) {
    params.set('query', String(options?.query || '').trim())
  }
  params.set('limit', String(Math.max(1, Math.min(200, Number(options?.limit || 50)))))
  params.set('offset', String(Math.max(0, Number(options?.offset || 0))))
  return requestJson<AdminWorkspacesListPayload>(
    `${API_BASE_URL}/v1/admin/workspaces?${params.toString()}`,
    {
      method: 'GET',
      headers: authHeaders(token),
    },
    'Admin workspaces lookup failed',
  )
}

export async function fetchAdminUsageCosts(
  token: string,
  options?: {
    query?: string
  },
): Promise<AdminUsageCostsPayload> {
  const params = new URLSearchParams()
  if (String(options?.query || '').trim()) {
    params.set('query', String(options?.query || '').trim())
  }
  const queryString = params.toString()
  const suffix = queryString ? `?${queryString}` : ''
  return requestJson<AdminUsageCostsPayload>(
    `${API_BASE_URL}/v1/admin/usage-costs${suffix}`,
    {
      method: 'GET',
      headers: authHeaders(token),
    },
    'Admin usage and costs lookup failed',
  )
}

export async function fetchAdminJournalProfiles(
  token: string,
  options?: {
    query?: string
    limit?: number
    offset?: number
  },
): Promise<AdminJournalProfilesListPayload> {
  const params = new URLSearchParams()
  if (String(options?.query || '').trim()) {
    params.set('query', String(options?.query || '').trim())
  }
  params.set('limit', String(Math.max(1, Math.min(500, Number(options?.limit || 100)))))
  params.set('offset', String(Math.max(0, Number(options?.offset || 0))))
  return requestJson<AdminJournalProfilesListPayload>(
    `${API_BASE_URL}/v1/admin/journals?${params.toString()}`,
    {
      method: 'GET',
      headers: authHeaders(token),
    },
    'Admin journal cache lookup failed',
  )
}

export async function fetchAdminApiMonitor(
  token: string,
  options?: {
    query?: string
  },
): Promise<AdminApiMonitorPayload> {
  const params = new URLSearchParams()
  if (String(options?.query || '').trim()) {
    params.set('query', String(options?.query || '').trim())
  }
  const queryString = params.toString()
  const suffix = queryString ? `?${queryString}` : ''
  return requestJson<AdminApiMonitorPayload>(
    `${API_BASE_URL}/v1/admin/apis${suffix}`,
    {
      method: 'GET',
      headers: authHeaders(token),
    },
    'Admin API monitor lookup failed',
  )
}

export async function fetchAdminRuntimeSettings(
  token: string,
): Promise<AdminRuntimeSettingsPayload> {
  return requestJson<AdminRuntimeSettingsPayload>(
    `${API_BASE_URL}/v1/admin/system/runtime-settings`,
    {
      method: 'GET',
      headers: authHeaders(token),
    },
    'Admin runtime settings lookup failed',
  )
}

export async function updateAdminWorkTypeLlmSetting(
  token: string,
  input: {
    enabled: boolean
    reason?: string
  },
): Promise<AdminWorkTypeLlmSettingUpdatePayload> {
  return requestJson<AdminWorkTypeLlmSettingUpdatePayload>(
    `${API_BASE_URL}/v1/admin/system/runtime-settings/work-type-llm`,
    {
      method: 'POST',
      headers: { ...authHeaders(token), 'Content-Type': 'application/json' },
      body: JSON.stringify({
        enabled: Boolean(input.enabled),
        reason: String(input.reason || ''),
      }),
    },
    'Admin runtime setting update failed',
  )
}

export async function updateAdminPublicationsAutoSyncSetting(
  token: string,
  input: {
    enabled?: boolean
    intervalHours?: number
    reason?: string
  },
): Promise<AdminPublicationsAutoSyncSettingUpdatePayload> {
  return requestJson<AdminPublicationsAutoSyncSettingUpdatePayload>(
    `${API_BASE_URL}/v1/admin/system/runtime-settings/publications-auto-sync`,
    {
      method: 'POST',
      headers: { ...authHeaders(token), 'Content-Type': 'application/json' },
      body: JSON.stringify({
        enabled: typeof input.enabled === 'boolean' ? input.enabled : null,
        interval_hours:
          Number.isFinite(Number(input.intervalHours))
            ? Math.max(6, Math.min(2160, Math.round(Number(input.intervalHours))))
            : null,
        reason: String(input.reason || ''),
      }),
    },
    'Admin publications auto-sync setting update failed',
  )
}

export async function runAdminPublicationsSyncAllUsers(
  token: string,
  input?: {
    dueOnly?: boolean
    reason?: string
  },
): Promise<AdminPublicationsSyncRunAllPayload> {
  return requestJson<AdminPublicationsSyncRunAllPayload>(
    `${API_BASE_URL}/v1/admin/system/publications-sync/run-all`,
    {
      method: 'POST',
      headers: { ...authHeaders(token), 'Content-Type': 'application/json' },
      body: JSON.stringify({
        due_only: Boolean(input?.dueOnly),
        reason: String(input?.reason || ''),
      }),
    },
    'Admin publications sync run failed',
  )
}

export async function runAdminCollaborationMetricsRecomputeAllUsers(
  token: string,
  input?: {
    includeInactive?: boolean
    reason?: string
  },
): Promise<AdminCollaborationMetricsRecomputeAllPayload> {
  return requestJson<AdminCollaborationMetricsRecomputeAllPayload>(
    `${API_BASE_URL}/v1/admin/system/collaboration-metrics/recompute-all`,
    {
      method: 'POST',
      headers: { ...authHeaders(token), 'Content-Type': 'application/json' },
      body: JSON.stringify({
        include_inactive: Boolean(input?.includeInactive),
        reason: String(input?.reason || ''),
      }),
    },
    'Admin collaboration metrics run failed',
  )
}

export async function fetchAdminJobs(
  token: string,
  options?: {
    query?: string
    status?: string
    workspaceId?: string
    projectId?: string
    ownerUserId?: string
    limit?: number
    offset?: number
  },
): Promise<AdminJobsListPayload> {
  const params = new URLSearchParams()
  if (String(options?.query || '').trim()) {
    params.set('query', String(options?.query || '').trim())
  }
  if (String(options?.status || '').trim()) {
    params.set('status', String(options?.status || '').trim())
  }
  if (String(options?.workspaceId || '').trim()) {
    params.set('workspace_id', String(options?.workspaceId || '').trim())
  }
  if (String(options?.projectId || '').trim()) {
    params.set('project_id', String(options?.projectId || '').trim())
  }
  if (String(options?.ownerUserId || '').trim()) {
    params.set('owner_user_id', String(options?.ownerUserId || '').trim())
  }
  params.set('limit', String(Math.max(1, Math.min(200, Number(options?.limit || 50)))))
  params.set('offset', String(Math.max(0, Number(options?.offset || 0))))
  return requestJson<AdminJobsListPayload>(
    `${API_BASE_URL}/v1/admin/jobs?${params.toString()}`,
    {
      method: 'GET',
      headers: authHeaders(token),
    },
    'Admin jobs lookup failed',
  )
}

export async function cancelAdminJob(
  token: string,
  jobId: string,
  input?: { reason?: string },
): Promise<AdminJobActionPayload> {
  return requestJson<AdminJobActionPayload>(
    `${API_BASE_URL}/v1/admin/jobs/${encodeURIComponent(jobId)}/cancel`,
    {
      method: 'POST',
      headers: { ...authHeaders(token), 'Content-Type': 'application/json' },
      body: JSON.stringify({
        reason: String(input?.reason || ''),
      }),
    },
    'Admin job cancel failed',
  )
}

export async function retryAdminJob(
  token: string,
  jobId: string,
  input?: {
    reason?: string
    maxEstimatedCostUsd?: number
    projectDailyBudgetUsd?: number
  },
): Promise<AdminJobActionPayload> {
  return requestJson<AdminJobActionPayload>(
    `${API_BASE_URL}/v1/admin/jobs/${encodeURIComponent(jobId)}/retry`,
    {
      method: 'POST',
      headers: { ...authHeaders(token), 'Content-Type': 'application/json' },
      body: JSON.stringify({
        reason: String(input?.reason || ''),
        max_estimated_cost_usd: input?.maxEstimatedCostUsd ?? null,
        project_daily_budget_usd: input?.projectDailyBudgetUsd ?? null,
      }),
    },
    'Admin job retry failed',
  )
}

export async function impersonateAdminOrganisation(
  token: string,
  orgId: string,
  input?: { reason?: string },
): Promise<AdminOrganisationImpersonationStartPayload> {
  return requestJson<AdminOrganisationImpersonationStartPayload>(
    `${API_BASE_URL}/v1/admin/organisations/${encodeURIComponent(orgId)}/impersonate`,
    {
      method: 'POST',
      headers: { ...authHeaders(token), 'Content-Type': 'application/json' },
      body: JSON.stringify({
        reason: String(input?.reason || ''),
      }),
    },
    'Admin organisation impersonation failed',
  )
}

export async function fetchAdminAuditEvents(
  token: string,
  options?: {
    query?: string
    action?: string
    targetType?: string
    limit?: number
    offset?: number
  },
): Promise<AdminAuditEventsListPayload> {
  const params = new URLSearchParams()
  if (String(options?.query || '').trim()) {
    params.set('query', String(options?.query || '').trim())
  }
  if (String(options?.action || '').trim()) {
    params.set('action', String(options?.action || '').trim())
  }
  if (String(options?.targetType || '').trim()) {
    params.set('target_type', String(options?.targetType || '').trim())
  }
  params.set('limit', String(Math.max(1, Math.min(200, Number(options?.limit || 100)))))
  params.set('offset', String(Math.max(0, Number(options?.offset || 0))))
  return requestJson<AdminAuditEventsListPayload>(
    `${API_BASE_URL}/v1/admin/audit/events?${params.toString()}`,
    {
      method: 'GET',
      headers: authHeaders(token),
    },
    'Admin audit events lookup failed',
  )
}

export async function fetchAffiliationSuggestionsForMe(
  token: string,
  input: { query: string; limit?: number },
): Promise<AffiliationSuggestionsPayload> {
  const query = String(input.query || '').trim()
  const limit = Math.max(1, Math.min(8, Number(input.limit || 8)))
  const params = new URLSearchParams({
    query,
    limit: String(limit),
  })
  return requestJson<AffiliationSuggestionsPayload>(
    `${API_BASE_URL}/v1/auth/me/affiliation-suggestions?${params.toString()}`,
    {
      method: 'GET',
      headers: authHeaders(token),
    },
    'Affiliation suggestions lookup failed',
    { timeoutMs: 45_000, retryCount: 1 },
  )
}

export async function fetchAffiliationAddressForMe(
  token: string,
  input: {
    name: string
    city?: string
    region?: string
    country?: string
  },
): Promise<AffiliationAddressResolutionPayload> {
  const params = new URLSearchParams({
    name: String(input.name || '').trim(),
  })
  if (String(input.city || '').trim()) {
    params.set('city', String(input.city || '').trim())
  }
  if (String(input.region || '').trim()) {
    params.set('region', String(input.region || '').trim())
  }
  if (String(input.country || '').trim()) {
    params.set('country', String(input.country || '').trim())
  }
  return requestJson<AffiliationAddressResolutionPayload>(
    `${API_BASE_URL}/v1/auth/me/affiliation-address?${params.toString()}`,
    {
      method: 'GET',
      headers: authHeaders(token),
    },
    'Affiliation address lookup failed',
    { timeoutMs: 45_000, retryCount: 1 },
  )
}

export async function updateMe(
  token: string,
  input: {
    name?: string
    email?: string
    password?: string
    openalex_author_id?: string | null
    openalex_integration_approved?: boolean
    openalex_auto_update_enabled?: boolean
  },
): Promise<AuthUser> {
  const payload = await requestJson<AuthUser>(
    `${API_BASE_URL}/v1/auth/me`,
    {
      method: 'PATCH',
      headers: { ...authHeaders(token), 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
    },
    'User update failed',
  )
  cacheAuthIdentity(payload)
  return payload
}

export async function deleteMe(
  token: string,
  input: { confirmPhrase: string },
): Promise<{ success: boolean }> {
  return requestJson<{ success: boolean }>(
    `${API_BASE_URL}/v1/auth/me`,
    {
      method: 'DELETE',
      headers: { ...authHeaders(token), 'Content-Type': 'application/json' },
      body: JSON.stringify({
        confirm_phrase: input.confirmPhrase,
      }),
    },
    'Account deletion failed',
  )
}

export async function fetchTwoFactorState(token: string): Promise<AuthTwoFactorStatePayload> {
  return requestJson<AuthTwoFactorStatePayload>(
    `${API_BASE_URL}/v1/auth/2fa`,
    {
      method: 'GET',
      headers: authHeaders(token),
    },
    '2FA state lookup failed',
  )
}

export async function setupTwoFactor(token: string): Promise<AuthTwoFactorSetupPayload> {
  return requestJson<AuthTwoFactorSetupPayload>(
    `${API_BASE_URL}/v1/auth/2fa/setup`,
    {
      method: 'POST',
      headers: authHeaders(token),
    },
    '2FA setup failed',
  )
}

export async function enableTwoFactor(input: {
  token: string
  secret: string
  code: string
  backupCodes: string[]
}): Promise<AuthTwoFactorStatePayload> {
  return requestJson<AuthTwoFactorStatePayload>(
    `${API_BASE_URL}/v1/auth/2fa/enable`,
    {
      method: 'POST',
      headers: { ...authHeaders(input.token), 'Content-Type': 'application/json' },
      body: JSON.stringify({
        secret: input.secret,
        code: input.code,
        backup_codes: input.backupCodes,
      }),
    },
    '2FA enable failed',
  )
}

export async function disableTwoFactor(input: {
  token: string
  code: string
}): Promise<AuthTwoFactorStatePayload> {
  return requestJson<AuthTwoFactorStatePayload>(
    `${API_BASE_URL}/v1/auth/2fa/disable`,
    {
      method: 'POST',
      headers: { ...authHeaders(input.token), 'Content-Type': 'application/json' },
      body: JSON.stringify({
        code: input.code,
      }),
    },
    '2FA disable failed',
  )
}

export async function fetchOAuthConnect(provider: 'google' | 'microsoft'): Promise<AuthOAuthConnectPayload> {
  return requestJson<AuthOAuthConnectPayload>(
    `${API_BASE_URL}/v1/auth/oauth/connect?provider=${encodeURIComponent(provider)}`,
    {
      method: 'GET',
    },
    'OAuth connect failed',
  )
}

export async function fetchOAuthProviderStatuses(): Promise<AuthOAuthProviderStatusesPayload> {
  return requestJson<AuthOAuthProviderStatusesPayload>(
    `${API_BASE_URL}/v1/auth/oauth/providers`,
    {
      method: 'GET',
    },
    'OAuth provider lookup failed',
  )
}

export async function completeOAuthCallback(input: {
  provider: 'google' | 'microsoft'
  state: string
  code: string
}): Promise<AuthOAuthCallbackPayload> {
  const payload = await requestJson<AuthOAuthCallbackPayload>(
    `${API_BASE_URL}/v1/auth/oauth/callback`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        provider: input.provider,
        state: input.state,
        code: input.code,
      }),
    },
    'OAuth callback failed',
  )
  cacheAuthIdentity(payload.user)
  return payload
}

export async function requestEmailVerification(token: string): Promise<AuthEmailVerificationRequestPayload> {
  return requestJson<AuthEmailVerificationRequestPayload>(
    `${API_BASE_URL}/v1/auth/email-verification/request`,
    {
      method: 'POST',
      headers: authHeaders(token),
    },
    'Email verification request failed',
  )
}

export async function confirmEmailVerification(input: {
  token: string
  code: string
}): Promise<AuthUser> {
  const payload = await requestJson<AuthUser>(
    `${API_BASE_URL}/v1/auth/email-verification/confirm`,
    {
      method: 'POST',
      headers: { ...authHeaders(input.token), 'Content-Type': 'application/json' },
      body: JSON.stringify({ code: input.code }),
    },
    'Email verification failed',
  )
  cacheAuthIdentity(payload)
  return payload
}

export async function requestPasswordReset(email: string): Promise<AuthPasswordResetRequestPayload> {
  return requestJson<AuthPasswordResetRequestPayload>(
    `${API_BASE_URL}/v1/auth/password-reset/request`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email }),
    },
    'Password reset request failed',
  )
}

export async function confirmPasswordReset(input: {
  email: string
  code: string
  newPassword: string
}): Promise<AuthPasswordResetConfirmPayload> {
  return requestJson<AuthPasswordResetConfirmPayload>(
    `${API_BASE_URL}/v1/auth/password-reset/confirm`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: input.email,
        code: input.code,
        new_password: input.newPassword,
      }),
    },
    'Password reset failed',
  )
}

export async function searchOpenAlexAuthors(
  token: string,
  query: string,
  options?: { limit?: number },
): Promise<{
  results: Array<{
    id: string
    display_name: string
    works_count: number
    cited_by_count: number
    orcid: string | null
  }>
}> {
  return requestJson<{
    results: Array<{
      id: string
      display_name: string
      works_count: number
      cited_by_count: number
      orcid: string | null
    }>
  }>(
    `${API_BASE_URL}/v1/openalex/search-authors`,
    {
      method: 'POST',
      headers: { ...authHeaders(token), 'Content-Type': 'application/json' },
      body: JSON.stringify({
        query: query.trim(),
        limit: options?.limit || 10,
      }),
    },
    'OpenAlex author search failed',
  )
}

export async function enqueueOpenAlexImportJob(
  token: string,
  openalexAuthorId: string,
  options?: {
    overwriteUserMetadata?: boolean
    runMetricsSync?: boolean
    providers?: Array<'openalex' | 'semantic_scholar' | 'manual'>
    refreshAnalytics?: boolean
    refreshMetrics?: boolean
  },
): Promise<{ job_id: string; openalex_author_id: string; openalex_author_name: string }> {
  return requestJson<{ job_id: string; openalex_author_id: string; openalex_author_name: string }>(
    `${API_BASE_URL}/v1/openalex/import`,
    {
      method: 'POST',
      headers: { ...authHeaders(token), 'Content-Type': 'application/json' },
      body: JSON.stringify({
        openalex_author_id: openalexAuthorId.trim(),
        overwrite_user_metadata: Boolean(options?.overwriteUserMetadata),
        run_metrics_sync: options?.runMetricsSync ?? true,
        providers: options?.providers || ['openalex', 'semantic_scholar'],
        refresh_analytics: options?.refreshAnalytics ?? true,
        refresh_metrics: options?.refreshMetrics ?? true,
      }),
    },
    'Could not start OpenAlex import job',
  )
}

export async function enqueueMetricsSyncJob(
  token: string,
  options?: {
    providers?: Array<'openalex' | 'semantic_scholar' | 'manual'>
    refreshAnalytics?: boolean
    refreshMetrics?: boolean
  },
): Promise<PersonaSyncJobPayload> {
  return requestJson<PersonaSyncJobPayload>(
    `${API_BASE_URL}/v1/persona/jobs/metrics-sync`,
    {
      method: 'POST',
      headers: { ...authHeaders(token), 'Content-Type': 'application/json' },
      body: JSON.stringify({
        providers: options?.providers || ['openalex'],
        refresh_analytics: options?.refreshAnalytics ?? true,
        refresh_metrics: Boolean(options?.refreshMetrics),
      }),
    },
    'Could not start metrics sync job',
  )
}

export async function fetchPersonaSyncJob(token: string, jobId: string): Promise<PersonaSyncJobPayload> {
  return requestJson<PersonaSyncJobPayload>(
    `${API_BASE_URL}/v1/persona/jobs/${encodeURIComponent(jobId)}`,
    {
      method: 'GET',
      headers: authHeaders(token),
    },
    'Persona sync job lookup failed',
  )
}

export async function listPersonaSyncJobs(token: string, limit = 10): Promise<PersonaSyncJobPayload[]> {
  const cleanLimit = Math.max(1, Math.min(50, Number(limit || 10)))
  return requestJson<PersonaSyncJobPayload[]>(
    `${API_BASE_URL}/v1/persona/jobs?limit=${cleanLimit}`,
    {
      method: 'GET',
      headers: authHeaders(token),
    },
    'Persona sync jobs lookup failed',
  )
}

export async function listPersonaWorks(token: string): Promise<PersonaWork[]> {
  return requestJson<PersonaWork[]>(
    `${API_BASE_URL}/v1/persona/works`,
    {
      method: 'GET',
      headers: authHeaders(token),
    },
    'Works lookup failed',
  )
}

export async function listPersonaJournals(token: string): Promise<PersonaJournal[]> {
  return requestJson<PersonaJournal[]>(
    `${API_BASE_URL}/v1/persona/journals`,
    {
      method: 'GET',
      headers: authHeaders(token),
    },
    'Journals lookup failed',
  )
}

export async function refreshPersonaJournals(
  token: string,
  input: {
    includeEditorialIntel?: boolean
    force?: boolean
  } = {},
): Promise<PersonaJournalRefreshPayload> {
  return requestJson<PersonaJournalRefreshPayload>(
    `${API_BASE_URL}/v1/persona/journals/refresh`,
    {
      method: 'POST',
      headers: {
        ...authHeaders(token),
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        include_editorial_intel: input.includeEditorialIntel ?? true,
        force: input.force ?? false,
      }),
    },
    'Journal intelligence refresh failed',
    { timeoutMs: 120_000, retryCount: 1 },
  )
}

export async function fetchPersonaGrants(
  token: string,
  input: {
    firstName: string
    lastName: string
    limit?: number
    relationship?: 'all' | 'won' | 'published_under'
    refresh?: boolean
  },
): Promise<PersonaGrantsPayload> {
  const firstName = String(input.firstName || '').trim()
  const lastName = String(input.lastName || '').trim()
  const limit = Math.max(1, Math.min(100, Number(input.limit || 30)))
  const relationship = input.relationship || 'all'
  const refresh = Boolean(input.refresh)
  const params = new URLSearchParams({
    first_name: firstName,
    last_name: lastName,
    limit: String(limit),
    relationship,
    refresh: refresh ? 'true' : 'false',
  })
  return requestJson<PersonaGrantsPayload>(
    `${API_BASE_URL}/v1/persona/grants?${params.toString()}`,
    {
      method: 'GET',
      headers: authHeaders(token),
    },
    'Grants lookup failed',
    { timeoutMs: 90_000, retryCount: 1 },
  )
}

export async function syncPersonaMetrics(
  token: string,
  providers: Array<'openalex' | 'semantic_scholar' | 'manual'>,
): Promise<PersonaMetricsSyncPayload> {
  return requestJson<PersonaMetricsSyncPayload>(
    `${API_BASE_URL}/v1/persona/metrics/sync`,
    {
      method: 'POST',
      headers: { ...authHeaders(token), 'Content-Type': 'application/json' },
      body: JSON.stringify({ providers }),
    },
    'Metrics sync failed',
    { timeoutMs: 180_000, retryCount: 2 },
  )
}

export async function fetchPublicationsAnalyticsSummary(
  token: string,
  options?: {
    refresh?: boolean
    refreshMetrics?: boolean
  },
): Promise<PublicationsAnalyticsSummaryPayload> {
  const refresh = options?.refresh ? '1' : '0'
  const refreshMetrics = options?.refreshMetrics ? '1' : '0'
  return requestJson<PublicationsAnalyticsSummaryPayload>(
    `${API_BASE_URL}/v1/publications/analytics/summary?refresh=${refresh}&refresh_metrics=${refreshMetrics}`,
    {
      method: 'GET',
      headers: authHeaders(token),
    },
    'Publications analytics summary lookup failed',
    { timeoutMs: 120_000, retryCount: 2 },
  )
}

export async function fetchPublicationsTopMetrics(
  token: string,
): Promise<PublicationsTopMetricsPayload> {
  return requestJson<PublicationsTopMetricsPayload>(
    `${API_BASE_URL}/v1/publications/metrics`,
    {
      method: 'GET',
      headers: authHeaders(token),
    },
    'Publications top metrics lookup failed',
    { timeoutMs: 120_000, retryCount: 2 },
  )
}

export async function triggerPublicationsTopMetricsRefresh(
  token: string,
): Promise<PublicationsTopMetricsRefreshPayload> {
  return requestJson<PublicationsTopMetricsRefreshPayload>(
    `${API_BASE_URL}/v1/publications/refresh`,
    {
      method: 'POST',
      headers: authHeaders(token),
    },
    'Publications top metrics refresh failed',
    { timeoutMs: 60_000, retryCount: 1 },
  )
}

export async function fetchPublicationMetricDetail(
  token: string,
  metricId: string,
): Promise<PublicationMetricDetailPayload> {
  const encodedMetricId = encodeURIComponent(String(metricId || '').trim())
  return requestJson<PublicationMetricDetailPayload>(
    `${API_BASE_URL}/v1/publications/metric/${encodedMetricId}`,
    {
      method: 'GET',
      headers: authHeaders(token),
    },
    'Publication metric detail lookup failed',
    { timeoutMs: 90_000, retryCount: 2 },
  )
}

export async function fetchPublicationsAnalytics(
  token: string,
): Promise<PublicationsAnalyticsResponsePayload> {
  return requestJson<PublicationsAnalyticsResponsePayload>(
    `${API_BASE_URL}/v1/publications/analytics`,
    {
      method: 'GET',
      headers: authHeaders(token),
    },
    'Publications analytics lookup failed',
    { timeoutMs: 120_000, retryCount: 2 },
  )
}

export async function fetchPublicationsAnalyticsTimeseries(
  token: string,
  options?: {
    refresh?: boolean
    refreshMetrics?: boolean
  },
): Promise<PublicationsAnalyticsTimeseriesPayload> {
  const refresh = options?.refresh ? '1' : '0'
  const refreshMetrics = options?.refreshMetrics ? '1' : '0'
  return requestJson<PublicationsAnalyticsTimeseriesPayload>(
    `${API_BASE_URL}/v1/publications/analytics/timeseries?refresh=${refresh}&refresh_metrics=${refreshMetrics}`,
    {
      method: 'GET',
      headers: authHeaders(token),
    },
    'Publications analytics timeseries lookup failed',
    { timeoutMs: 120_000, retryCount: 2 },
  )
}

export async function fetchPublicationsAnalyticsTopDrivers(
  token: string,
  options?: {
    limit?: number
    refresh?: boolean
    refreshMetrics?: boolean
  },
): Promise<PublicationsAnalyticsTopDriversPayload> {
  const limit = Math.max(1, Math.min(25, Number(options?.limit || 5)))
  const refresh = options?.refresh ? '1' : '0'
  const refreshMetrics = options?.refreshMetrics ? '1' : '0'
  return requestJson<PublicationsAnalyticsTopDriversPayload>(
    `${API_BASE_URL}/v1/publications/analytics/top-drivers?limit=${limit}&refresh=${refresh}&refresh_metrics=${refreshMetrics}`,
    {
      method: 'GET',
      headers: authHeaders(token),
    },
    'Publications analytics top drivers lookup failed',
    { timeoutMs: 120_000, retryCount: 2 },
  )
}

export async function fetchPublicationDetail(
  token: string,
  publicationId: string,
): Promise<PublicationDetailPayload> {
  return requestJson<PublicationDetailPayload>(
    `${API_BASE_URL}/v1/publications/${encodeURIComponent(publicationId)}`,
    {
      method: 'GET',
      headers: authHeaders(token),
    },
    'Publication detail lookup failed',
    { timeoutMs: 60_000, retryCount: 2 },
  )
}

export async function fetchPublicationAuthors(
  token: string,
  publicationId: string,
): Promise<PublicationAuthorsPayload> {
  return requestJson<PublicationAuthorsPayload>(
    `${API_BASE_URL}/v1/publications/${encodeURIComponent(publicationId)}/authors`,
    {
      method: 'GET',
      headers: authHeaders(token),
    },
    'Publication authors lookup failed',
    { timeoutMs: 60_000, retryCount: 2 },
  )
}

export async function fetchPublicationImpact(
  token: string,
  publicationId: string,
): Promise<PublicationImpactResponsePayload> {
  return requestJson<PublicationImpactResponsePayload>(
    `${API_BASE_URL}/v1/publications/${encodeURIComponent(publicationId)}/impact`,
    {
      method: 'GET',
      headers: authHeaders(token),
    },
    'Publication impact lookup failed',
    { timeoutMs: 120_000, retryCount: 2 },
  )
}

export async function fetchPublicationAiInsights(
  token: string,
  publicationId: string,
): Promise<PublicationAiInsightsResponsePayload> {
  return requestJson<PublicationAiInsightsResponsePayload>(
    `${API_BASE_URL}/v1/publications/${encodeURIComponent(publicationId)}/ai-insights`,
    {
      method: 'GET',
      headers: authHeaders(token),
    },
    'Publication AI insights lookup failed',
    { timeoutMs: 120_000, retryCount: 2 },
  )
}

export async function fetchPublicationInsightsAgent(
  token: string,
  options?: {
    windowId?: '1y' | '3y' | '5y' | 'all'
    scope?: 'window' | 'section'
    sectionKey?: 'uncited_works' | 'citation_drivers' | 'citation_activation' | 'citation_activation_history' | 'publication_output_pattern' | 'publication_production_phase' | 'publication_volume_over_time' | 'publication_article_type_over_time' | 'publication_type_over_time'
  },
): Promise<PublicationInsightsAgentPayload> {
  const windowId = options?.windowId || '1y'
  const scope = options?.scope || 'window'
  const sectionKey = options?.sectionKey
  const searchParams = new URLSearchParams({
    window_id: windowId,
    scope,
  })
  if (sectionKey) {
    searchParams.set('section_key', sectionKey)
  }
  return requestJson<PublicationInsightsAgentPayload>(
    `${API_BASE_URL}/v1/publications/ai/insights?${searchParams.toString()}`,
    {
      method: 'GET',
      headers: authHeaders(token),
    },
    'Publication insights agent lookup failed',
    { timeoutMs: 30_000, retryCount: 0 },
  )
}

export async function fetchPublicationFiles(
  token: string,
  publicationId: string,
): Promise<PublicationFilesListPayload> {
  return requestJson<PublicationFilesListPayload>(
    `${API_BASE_URL}/v1/publications/${encodeURIComponent(publicationId)}/files`,
    {
      method: 'GET',
      headers: authHeaders(token),
    },
    'Publication files lookup failed',
    { timeoutMs: 60_000, retryCount: 2 },
  )
}

export async function uploadPublicationFile(
  token: string,
  publicationId: string,
  file: File,
): Promise<PublicationFilePayload> {
  const body = new FormData()
  body.append('file', file)
  return requestJson<PublicationFilePayload>(
    `${API_BASE_URL}/v1/publications/${encodeURIComponent(publicationId)}/files/upload`,
    {
      method: 'POST',
      headers: authHeaders(token),
      body,
    },
    'Publication file upload failed',
    { timeoutMs: 120_000, retryCount: 1 },
  )
}

export async function linkPublicationOpenAccessPdf(
  token: string,
  publicationId: string,
): Promise<PublicationFileLinkPayload> {
  return requestJson<PublicationFileLinkPayload>(
    `${API_BASE_URL}/v1/publications/${encodeURIComponent(publicationId)}/files/link-oa`,
    {
      method: 'POST',
      headers: authHeaders(token),
    },
    'Open-access PDF lookup failed',
    { timeoutMs: 60_000, retryCount: 1 },
  )
}

export async function deletePublicationFile(
  token: string,
  publicationId: string,
  fileId: string,
): Promise<{ deleted: boolean }> {
  return requestJson<{ deleted: boolean }>(
    `${API_BASE_URL}/v1/publications/${encodeURIComponent(publicationId)}/files/${encodeURIComponent(fileId)}`,
    {
      method: 'DELETE',
      headers: authHeaders(token),
    },
    'Publication file delete failed',
  )
}

function parseDispositionFilename(disposition: string | null): string | null {
  const raw = String(disposition || '')
  if (!raw) {
    return null
  }
  const utf8Match = raw.match(/filename\\*=UTF-8''([^;]+)/i)
  if (utf8Match?.[1]) {
    try {
      return decodeURIComponent(utf8Match[1]).trim()
    } catch {
      // fall through
    }
  }
  const plainMatch = raw.match(/filename="?([^";]+)"?/i)
  if (plainMatch?.[1]) {
    return plainMatch[1].trim()
  }
  return null
}

export async function downloadPublicationFile(
  token: string,
  publicationId: string,
  fileId: string,
): Promise<{ fileName: string; blob: Blob }> {
  const response = await fetch(
    `${API_BASE_URL}/v1/publications/${encodeURIComponent(publicationId)}/files/${encodeURIComponent(fileId)}/download`,
    {
      method: 'GET',
      headers: authHeaders(token),
    },
  )
  if (!response.ok) {
    throw new Error(await parseApiError(response, 'Publication file download failed'))
  }
  const fileName =
    parseDispositionFilename(response.headers.get('content-disposition')) ||
    `publication-file-${fileId}`
  const blob = await response.blob()
  return { fileName, blob }
}

export async function fetchCollaborationMetricsSummary(
  token: string,
): Promise<CollaborationMetricsSummaryPayload> {
  return requestJson<CollaborationMetricsSummaryPayload>(
    `${API_BASE_URL}/v1/account/collaboration/metrics/summary`,
    {
      method: 'GET',
      headers: authHeaders(token),
    },
    'Collaboration summary lookup failed',
    { timeoutMs: 60_000, retryCount: 2 },
  )
}

export async function fetchCollaborationLanding(
  token: string,
  options?: {
    query?: string
    sort?: string
    page?: number
    pageSize?: number
    includeSharedWorks?: boolean
  },
): Promise<CollaborationLandingPayload> {
  const params = new URLSearchParams()
  if ((options?.query || '').trim()) {
    params.set('query', String(options?.query || '').trim())
  }
  if ((options?.sort || '').trim()) {
    params.set('sort', String(options?.sort || '').trim())
  }
  params.set('page', String(Math.max(1, Number(options?.page || 1))))
  params.set('page_size', String(Math.max(1, Math.min(200, Number(options?.pageSize || 50)))))
  if (options?.includeSharedWorks) {
    params.set('include_shared_works', 'true')
  }
  return requestJson<CollaborationLandingPayload>(
    `${API_BASE_URL}/v1/account/collaboration/landing?${params.toString()}`,
    {
      method: 'GET',
      headers: authHeaders(token),
    },
    'Collaboration landing lookup failed',
    { timeoutMs: 60_000, retryCount: 2 },
  )
}

export async function listCollaborators(
  token: string,
  options?: {
    query?: string
    sort?: string
    page?: number
    pageSize?: number
  },
): Promise<CollaboratorsListPayload> {
  const params = new URLSearchParams()
  if ((options?.query || '').trim()) {
    params.set('query', String(options?.query || '').trim())
  }
  if ((options?.sort || '').trim()) {
    params.set('sort', String(options?.sort || '').trim())
  }
  params.set('page', String(Math.max(1, Number(options?.page || 1))))
  params.set('page_size', String(Math.max(1, Math.min(200, Number(options?.pageSize || 50)))))
  return requestJson<CollaboratorsListPayload>(
    `${API_BASE_URL}/v1/account/collaboration/collaborators?${params.toString()}`,
    {
      method: 'GET',
      headers: authHeaders(token),
    },
    'Collaborators lookup failed',
  )
}

export async function createCollaborator(
  token: string,
  input: {
    full_name: string
    preferred_name?: string | null
    email?: string | null
    secondary_email?: string | null
    contact_salutation?: string | null
    contact_first_name?: string | null
    contact_middle_initial?: string | null
    contact_surname?: string | null
    contact_email?: string | null
    contact_secondary_email?: string | null
    orcid_id?: string | null
    openalex_author_id?: string | null
    primary_institution?: string | null
    contact_primary_institution?: string | null
    contact_secondary_institution?: string | null
    contact_primary_institution_openalex_id?: string | null
    contact_secondary_institution_openalex_id?: string | null
    contact_primary_affiliation_department?: string | null
    contact_primary_affiliation_address_line_1?: string | null
    contact_primary_affiliation_city?: string | null
    contact_primary_affiliation_region?: string | null
    contact_primary_affiliation_postal_code?: string | null
    contact_primary_affiliation_country?: string | null
    contact_secondary_affiliation_department?: string | null
    contact_secondary_affiliation_address_line_1?: string | null
    contact_secondary_affiliation_city?: string | null
    contact_secondary_affiliation_region?: string | null
    contact_secondary_affiliation_postal_code?: string | null
    contact_secondary_affiliation_country?: string | null
    department?: string | null
    country?: string | null
    contact_country?: string | null
    current_position?: string | null
    research_domains?: string[]
    notes?: string | null
  },
): Promise<CollaboratorPayload> {
  return requestJson<CollaboratorPayload>(
    `${API_BASE_URL}/v1/account/collaboration/collaborators`,
    {
      method: 'POST',
      headers: { ...authHeaders(token), 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
    },
    'Collaborator create failed',
  )
}

export async function getCollaborator(token: string, collaboratorId: string): Promise<CollaboratorPayload> {
  return requestJson<CollaboratorPayload>(
    `${API_BASE_URL}/v1/account/collaboration/collaborators/${encodeURIComponent(collaboratorId)}`,
    {
      method: 'GET',
      headers: authHeaders(token),
    },
    'Collaborator lookup failed',
  )
}

export async function listCollaboratorSharedWorks(
  token: string,
  collaboratorId: string,
): Promise<CollaboratorSharedWorksListPayload> {
  return requestJson<CollaboratorSharedWorksListPayload>(
    `${API_BASE_URL}/v1/account/collaboration/collaborators/${encodeURIComponent(collaboratorId)}/shared-works`,
    {
      method: 'GET',
      headers: authHeaders(token),
    },
    'Collaborator shared works lookup failed',
  )
}

export async function listCollaboratorsSharedWorks(
  token: string,
): Promise<CollaboratorSharedWorksByCollaboratorPayload> {
  return requestJson<CollaboratorSharedWorksByCollaboratorPayload>(
    `${API_BASE_URL}/v1/account/collaboration/shared-works`,
    {
      method: 'GET',
      headers: authHeaders(token),
    },
    'Collaborator shared works preload failed',
  )
}

export async function updateCollaborator(
  token: string,
  collaboratorId: string,
  input: {
    full_name?: string
    preferred_name?: string | null
    email?: string | null
    secondary_email?: string | null
    contact_salutation?: string | null
    contact_first_name?: string | null
    contact_middle_initial?: string | null
    contact_surname?: string | null
    contact_email?: string | null
    contact_secondary_email?: string | null
    orcid_id?: string | null
    openalex_author_id?: string | null
    primary_institution?: string | null
    contact_primary_institution?: string | null
    contact_secondary_institution?: string | null
    contact_primary_institution_openalex_id?: string | null
    contact_secondary_institution_openalex_id?: string | null
    contact_primary_affiliation_department?: string | null
    contact_primary_affiliation_address_line_1?: string | null
    contact_primary_affiliation_city?: string | null
    contact_primary_affiliation_region?: string | null
    contact_primary_affiliation_postal_code?: string | null
    contact_primary_affiliation_country?: string | null
    contact_secondary_affiliation_department?: string | null
    contact_secondary_affiliation_address_line_1?: string | null
    contact_secondary_affiliation_city?: string | null
    contact_secondary_affiliation_region?: string | null
    contact_secondary_affiliation_postal_code?: string | null
    contact_secondary_affiliation_country?: string | null
    department?: string | null
    country?: string | null
    contact_country?: string | null
    current_position?: string | null
    research_domains?: string[]
    notes?: string | null
  },
): Promise<CollaboratorPayload> {
  return requestJson<CollaboratorPayload>(
    `${API_BASE_URL}/v1/account/collaboration/collaborators/${encodeURIComponent(collaboratorId)}`,
    {
      method: 'PATCH',
      headers: { ...authHeaders(token), 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
    },
    'Collaborator update failed',
  )
}

export async function deleteCollaborator(token: string, collaboratorId: string): Promise<{ deleted: boolean }> {
  return requestJson<{ deleted: boolean }>(
    `${API_BASE_URL}/v1/account/collaboration/collaborators/${encodeURIComponent(collaboratorId)}`,
    {
      method: 'DELETE',
      headers: authHeaders(token),
    },
    'Collaborator delete failed',
  )
}

export async function importCollaboratorsFromOpenAlex(
  token: string,
): Promise<CollaborationImportOpenAlexPayload> {
  return requestJson<CollaborationImportOpenAlexPayload>(
    `${API_BASE_URL}/v1/account/collaboration/import/openalex`,
    {
      method: 'POST',
      headers: authHeaders(token),
    },
    'OpenAlex collaborator import failed',
    { timeoutMs: 120_000, retryCount: 2 },
  )
}

export async function enrichCollaboratorsFromOpenAlex(
  token: string,
  input: {
    onlyMissing?: boolean
    limit?: number
  } = {},
): Promise<CollaborationEnrichOpenAlexPayload> {
  return requestJson<CollaborationEnrichOpenAlexPayload>(
    `${API_BASE_URL}/v1/account/collaboration/enrich/openalex`,
    {
      method: 'POST',
      headers: { ...authHeaders(token), 'Content-Type': 'application/json' },
      body: JSON.stringify({
        only_missing: input.onlyMissing ?? true,
        limit: Math.max(1, Math.min(500, Number(input.limit || 200))),
      }),
    },
    'OpenAlex collaborator enrichment failed',
    { timeoutMs: 120_000, retryCount: 2 },
  )
}

export async function exportCollaboratorsCsv(
  token: string,
): Promise<{ filename: string; content: string }> {
  const response = await fetch(`${API_BASE_URL}/v1/account/collaboration/collaborators/export`, {
    method: 'GET',
    headers: authHeaders(token),
  })
  if (!response.ok) {
    throw new Error(await parseApiError(response, `Collaborator export failed (${response.status})`))
  }
  const content = await response.text()
  const filename = response.headers.get('content-disposition')?.match(/filename="?([^";]+)"?/i)?.[1] || 'collaborators.csv'
  return { filename, content }
}

export async function generateCollaborationAiInsights(
  token: string,
): Promise<CollaborationAiInsightsPayload> {
  return requestJson<CollaborationAiInsightsPayload>(
    `${API_BASE_URL}/v1/account/collaboration/ai/insights`,
    {
      method: 'POST',
      headers: authHeaders(token),
    },
    'Collaboration insights draft failed',
  )
}

export async function generateCollaborationAiAuthorSuggestions(
  token: string,
  input: {
    topicKeywords?: string[]
    methods?: string[]
    limit?: number
  },
): Promise<CollaborationAiAuthorSuggestionsPayload> {
  return requestJson<CollaborationAiAuthorSuggestionsPayload>(
    `${API_BASE_URL}/v1/account/collaboration/ai/author-suggestions`,
    {
      method: 'POST',
      headers: { ...authHeaders(token), 'Content-Type': 'application/json' },
      body: JSON.stringify({
        topic_keywords: input.topicKeywords || [],
        methods: input.methods || [],
        limit: Math.max(1, Math.min(20, Number(input.limit || 5))),
      }),
    },
    'Author suggestion draft failed',
  )
}

export async function generateCollaborationAiContributionStatement(
  token: string,
  input: {
    authors: Array<{
      full_name: string
      roles?: string[]
      is_corresponding?: boolean
      equal_contribution?: boolean
      is_external?: boolean
    }>
  },
): Promise<CollaborationAiContributionDraftPayload> {
  return requestJson<CollaborationAiContributionDraftPayload>(
    `${API_BASE_URL}/v1/account/collaboration/ai/contribution-statement`,
    {
      method: 'POST',
      headers: { ...authHeaders(token), 'Content-Type': 'application/json' },
      body: JSON.stringify({
        authors: input.authors || [],
      }),
    },
    'Contribution statement draft failed',
  )
}

export async function generateCollaborationAiAffiliationsNormaliser(
  token: string,
  input: {
    authors: Array<{
      full_name: string
      institution?: string | null
      orcid_id?: string | null
    }>
  },
): Promise<CollaborationAiAffiliationsNormalisePayload> {
  return requestJson<CollaborationAiAffiliationsNormalisePayload>(
    `${API_BASE_URL}/v1/account/collaboration/ai/affiliations-normaliser`,
    {
      method: 'POST',
      headers: { ...authHeaders(token), 'Content-Type': 'application/json' },
      body: JSON.stringify({
        authors: input.authors || [],
      }),
    },
    'Affiliation normalisation draft failed',
  )
}

export async function generatePersonaEmbeddings(token: string): Promise<PersonaEmbeddingsGeneratePayload> {
  return requestJson<PersonaEmbeddingsGeneratePayload>(
    `${API_BASE_URL}/v1/persona/embeddings/generate`,
    {
      method: 'POST',
      headers: { ...authHeaders(token), 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    },
    'Embeddings generation failed',
  )
}

export async function recomputeImpact(token: string): Promise<ImpactRecomputePayload> {
  return requestJson<ImpactRecomputePayload>(
    `${API_BASE_URL}/v1/impact/recompute`,
    {
      method: 'POST',
      headers: authHeaders(token),
    },
    'Impact recompute failed',
  )
}

export async function fetchImpactCollaborators(token: string): Promise<ImpactCollaboratorsPayload> {
  return requestJson<ImpactCollaboratorsPayload>(
    `${API_BASE_URL}/v1/impact/collaborators`,
    {
      method: 'GET',
      headers: authHeaders(token),
    },
    'Collaborators lookup failed',
  )
}

export async function fetchImpactThemes(token: string): Promise<ImpactThemesPayload> {
  return requestJson<ImpactThemesPayload>(
    `${API_BASE_URL}/v1/impact/themes`,
    {
      method: 'GET',
      headers: authHeaders(token),
    },
    'Themes lookup failed',
  )
}

export async function analyseImpact(token: string): Promise<ImpactAnalysePayload> {
  return requestJson<ImpactAnalysePayload>(
    `${API_BASE_URL}/v1/impact/analyse`,
    {
      method: 'POST',
      headers: { ...authHeaders(token), 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    },
    'Impact analysis failed',
  )
}

export async function generateImpactReport(token: string): Promise<ImpactReportPayload> {
  return requestJson<ImpactReportPayload>(
    `${API_BASE_URL}/v1/impact/report`,
    {
      method: 'POST',
      headers: { ...authHeaders(token), 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    },
    'Impact report failed',
  )
}

export async function fetchPersonaContext(token: string): Promise<PersonaContextPayload> {
  return requestJson<PersonaContextPayload>(
    `${API_BASE_URL}/v1/persona/context`,
    {
      method: 'GET',
      headers: authHeaders(token),
    },
    'Persona context lookup failed',
  )
}

export async function fetchPersonaState(token: string): Promise<PersonaStatePayload> {
  return requestJson<PersonaStatePayload>(
    `${API_BASE_URL}/v1/persona/state`,
    {
      method: 'GET',
      headers: authHeaders(token),
    },
    'Persona state lookup failed',
    { timeoutMs: 120_000, retryCount: 2 },
  )
}

export async function pingApiHealth(): Promise<{ status: string }> {
  return requestJson<{ status: string }>(
    `${API_BASE_URL}/v1/health`,
    {
      method: 'GET',
    },
    'API health check failed',
  )
}
