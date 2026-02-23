import { API_BASE_URL } from '@/lib/api'
import type { ApiErrorPayload } from '@/types/insight'
import type {
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
  ImpactAnalysePayload,
  ImpactCollaboratorsPayload,
  ImpactRecomputePayload,
  ImpactReportPayload,
  ImpactThemesPayload,
  OrcidConnectPayload,
  OrcidStatusPayload,
  OrcidImportPayload,
  PersonaSyncJobPayload,
  PersonaStatePayload,
  PersonaContextPayload,
  PersonaEmbeddingsGeneratePayload,
  PersonaMetricsSyncPayload,
  PublicationsAnalyticsResponsePayload,
  PublicationsAnalyticsSummaryPayload,
  PublicationsAnalyticsTimeseriesPayload,
  PublicationsAnalyticsTopDriversPayload,
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
  if (!clean) {
    return {}
  }
  return { Authorization: `Bearer ${clean}` }
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
  return requestJson<AuthSessionPayload>(
    `${API_BASE_URL}/v1/auth/register`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
    },
    'Registration failed',
  )
}

export async function loginAuth(input: {
  email: string
  password: string
}): Promise<AuthSessionPayload> {
  return requestJson<AuthSessionPayload>(
    `${API_BASE_URL}/v1/auth/login`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
    },
    'Login failed',
  )
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
  )
}

export async function verifyLoginTwoFactor(input: {
  challengeToken: string
  code: string
}): Promise<AuthSessionPayload> {
  return requestJson<AuthSessionPayload>(
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
  )
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
  return requestJson<AuthUser>(
    `${API_BASE_URL}/v1/auth/me`,
    {
      method: 'GET',
      headers: authHeaders(token),
    },
    'User lookup failed',
  )
}

export async function updateMe(
  token: string,
  input: { name?: string; email?: string; password?: string },
): Promise<AuthUser> {
  return requestJson<AuthUser>(
    `${API_BASE_URL}/v1/auth/me`,
    {
      method: 'PATCH',
      headers: { ...authHeaders(token), 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
    },
    'User update failed',
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

export async function fetchOAuthConnect(provider: 'orcid' | 'google' | 'microsoft'): Promise<AuthOAuthConnectPayload> {
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
  provider: 'orcid' | 'google' | 'microsoft'
  state: string
  code: string
}): Promise<AuthOAuthCallbackPayload> {
  return requestJson<AuthOAuthCallbackPayload>(
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
  return requestJson<AuthUser>(
    `${API_BASE_URL}/v1/auth/email-verification/confirm`,
    {
      method: 'POST',
      headers: { ...authHeaders(input.token), 'Content-Type': 'application/json' },
      body: JSON.stringify({ code: input.code }),
    },
    'Email verification failed',
  )
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

export async function fetchOrcidConnect(token: string): Promise<OrcidConnectPayload> {
  return requestJson<OrcidConnectPayload>(
    `${API_BASE_URL}/v1/orcid/connect`,
    {
      method: 'GET',
      headers: authHeaders(token),
    },
    'ORCID connect failed',
  )
}

export async function fetchOrcidStatus(token: string): Promise<OrcidStatusPayload> {
  return requestJson<OrcidStatusPayload>(
    `${API_BASE_URL}/v1/orcid/status`,
    {
      method: 'GET',
      headers: authHeaders(token),
    },
    'ORCID status lookup failed',
  )
}

export async function disconnectOrcid(token: string): Promise<OrcidStatusPayload> {
  return requestJson<OrcidStatusPayload>(
    `${API_BASE_URL}/v1/orcid/disconnect`,
    {
      method: 'POST',
      headers: authHeaders(token),
    },
    'ORCID disconnect failed',
  )
}

export async function completeOrcidLink(input: {
  state: string
  code: string
}): Promise<{ connected: boolean; user_id: string; orcid_id: string }> {
  const state = encodeURIComponent(input.state.trim())
  const code = encodeURIComponent(input.code.trim())
  return requestJson<{ connected: boolean; user_id: string; orcid_id: string }>(
    `${API_BASE_URL}/v1/orcid/callback?mode=json&state=${state}&code=${code}`,
    {
      method: 'GET',
    },
    'ORCID callback failed',
  )
}

export async function importOrcidWorks(
  token: string,
  options?: {
    overwriteUserMetadata?: boolean
  },
): Promise<OrcidImportPayload> {
  return requestJson<OrcidImportPayload>(
    `${API_BASE_URL}/v1/persona/import/orcid`,
    {
      method: 'POST',
      headers: { ...authHeaders(token), 'Content-Type': 'application/json' },
      body: JSON.stringify({ overwrite_user_metadata: Boolean(options?.overwriteUserMetadata) }),
    },
    'ORCID import failed',
    { timeoutMs: 90_000, retryCount: 1 },
  )
}

export async function enqueueOrcidImportSyncJob(
  token: string,
  options?: {
    overwriteUserMetadata?: boolean
    runMetricsSync?: boolean
    providers?: Array<'openalex' | 'semantic_scholar' | 'manual'>
    refreshAnalytics?: boolean
    refreshMetrics?: boolean
  },
): Promise<PersonaSyncJobPayload> {
  return requestJson<PersonaSyncJobPayload>(
    `${API_BASE_URL}/v1/persona/jobs/orcid-import`,
    {
      method: 'POST',
      headers: { ...authHeaders(token), 'Content-Type': 'application/json' },
      body: JSON.stringify({
        overwrite_user_metadata: Boolean(options?.overwriteUserMetadata),
        run_metrics_sync: Boolean(options?.runMetricsSync),
        providers: options?.providers || ['openalex', 'semantic_scholar'],
        refresh_analytics: options?.refreshAnalytics ?? true,
        refresh_metrics: Boolean(options?.refreshMetrics),
      }),
    },
    'Could not start ORCID sync job',
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
