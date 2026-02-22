import { API_BASE_URL } from '@/lib/api'
import type { ApiErrorPayload } from '@/types/insight'
import type {
  AuthLoginChallengePayload,
  AuthOAuthCallbackPayload,
  AuthOAuthConnectPayload,
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
  OrcidImportPayload,
  PersonaStatePayload,
  PersonaContextPayload,
  PersonaEmbeddingsGeneratePayload,
  PersonaMetricsSyncPayload,
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

const REQUEST_TIMEOUT_MS = 20_000

async function requestJson<T>(url: string, init: RequestInit, fallbackError: string): Promise<T> {
  const controller = new AbortController()
  const timeout = window.setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS)
  let response: Response
  try {
    response = await fetch(url, { ...init, signal: controller.signal })
  } catch (error) {
    const origin = typeof window !== 'undefined' ? window.location.origin : 'unknown-origin'
    const detail = error instanceof Error ? error.message : 'Network error'
    throw new Error(`Could not reach API at ${API_BASE_URL}. UI origin: ${origin}. Detail: ${detail}`)
  } finally {
    window.clearTimeout(timeout)
  }
  if (!response.ok) {
    throw new Error(await parseApiError(response, `${fallbackError} (${response.status})`))
  }
  return (await response.json()) as T
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

export async function importOrcidWorks(token: string): Promise<OrcidImportPayload> {
  return requestJson<OrcidImportPayload>(
    `${API_BASE_URL}/v1/persona/import/orcid`,
    {
      method: 'POST',
      headers: { ...authHeaders(token), 'Content-Type': 'application/json' },
      body: JSON.stringify({ overwrite_user_metadata: false }),
    },
    'ORCID import failed',
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
  )
}
