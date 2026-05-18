/**
 * CMR access control — sessionStorage helpers and API calls.
 * Fully separate from Axiomos auth (lib/auth-session.ts).
 */

const SESSION_TOKEN_KEY = 'cmr_session_token'
const USER_NAME_KEY = 'cmr_user_name'
const IS_ADMIN_KEY = 'cmr_is_admin'
const ACCESS_CODE_ID_KEY = 'cmr_access_code_id'
const LOCAL_CMR_DEV_API_BASE = 'http://127.0.0.1:8011'

// --- Subdomain detection ---

function isLocalCmrDevRoute(): boolean {
  if (typeof window === 'undefined') return false
  const host = window.location.hostname
  if (host !== 'localhost' && host !== '127.0.0.1') return false
  return window.location.pathname.startsWith('/cmr')
}

export function isCmrSubdomain(): boolean {
  if (typeof window === 'undefined') return false
  const host = window.location.hostname
  return host === 'cmr.axiomos.studio' || host === 'cmr.localhost' || isLocalCmrDevRoute()
}

export function isLocalCmrDev(): boolean {
  return isLocalCmrDevRoute()
}

// --- Session storage ---

export function getCmrSessionToken(): string | null {
  return sessionStorage.getItem(SESSION_TOKEN_KEY)
}

export function getCmrUserName(): string | null {
  return sessionStorage.getItem(USER_NAME_KEY)
}

export function isCmrAdmin(): boolean {
  return sessionStorage.getItem(IS_ADMIN_KEY) === 'true'
}

export function getCmrAccessCodeId(): string | null {
  return sessionStorage.getItem(ACCESS_CODE_ID_KEY)
}

export function getCmrSessionScopeKey(): string | null {
  const accessCodeId = getCmrAccessCodeId()
  if (!accessCodeId) return null
  return `cmr-access:${accessCodeId}`
}

export function setCmrSession(token: string, name: string, isAdmin: boolean, accessCodeId: string): void {
  sessionStorage.setItem(SESSION_TOKEN_KEY, token)
  sessionStorage.setItem(USER_NAME_KEY, name)
  sessionStorage.setItem(IS_ADMIN_KEY, String(isAdmin))
  sessionStorage.setItem(ACCESS_CODE_ID_KEY, accessCodeId)
}

export function clearCmrSession(): void {
  sessionStorage.removeItem(SESSION_TOKEN_KEY)
  sessionStorage.removeItem(USER_NAME_KEY)
  sessionStorage.removeItem(IS_ADMIN_KEY)
  sessionStorage.removeItem(ACCESS_CODE_ID_KEY)
}

// --- API base URL ---

function apiBase(): string {
  if (typeof window !== 'undefined') {
    const host = window.location.hostname
    // Local CMR development runs against the repo-backed API on port 8011.
    if (isLocalCmrDevRoute()) return LOCAL_CMR_DEV_API_BASE
    if (host === 'cmr.axiomos.studio' || host === 'cmr.localhost') {
      return window.location.origin
    }
  }

  const env = (import.meta.env.VITE_API_BASE_URL || '').trim()
  if (env) return env.replace(/\/+$/, '')
  return LOCAL_CMR_DEV_API_BASE
}

function cmrHeaders(token?: string | null): Record<string, string> {
  const h: Record<string, string> = { 'Content-Type': 'application/json' }
  if (token) h.Authorization = `Bearer ${token}`
  return h
}

export function getCmrApiBase(): string {
  return apiBase()
}

export function buildCmrHeaders(token?: string | null): Record<string, string> {
  return cmrHeaders(token)
}

export type CmrLoginResult = {
  session_token: string
  name: string
  is_admin: boolean
  access_code_id: string
}

type CmrSessionCheckResult = Pick<CmrLoginResult, 'name' | 'is_admin' | 'access_code_id'>

function localSessionFallback(token: string): CmrSessionCheckResult | null {
  if (typeof window === 'undefined') return null
  if (!isLocalCmrDevRoute()) return null
  if (getCmrSessionToken() !== token) return null

  const name = getCmrUserName()
  const accessCodeId = getCmrAccessCodeId()
  if (!name || !accessCodeId) return null
  return { name, is_admin: isCmrAdmin(), access_code_id: accessCodeId }
}

// --- API calls ---

export function createLocalCmrDevSession(name = 'Local Dev'): CmrLoginResult {
  const tokenSeed =
    typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
      ? crypto.randomUUID()
      : `${Date.now()}`

  return {
    session_token: `cmr-local-dev-${tokenSeed}`,
    name,
    is_admin: false,
    access_code_id: 'local-dev',
  }
}

export async function cmrLogin(code: string): Promise<CmrLoginResult> {
  const resp = await fetch(`${apiBase()}/v1/cmr/auth/login`, {
    method: 'POST',
    headers: cmrHeaders(),
    body: JSON.stringify({ code }),
  })
  if (!resp.ok) throw new Error('Invalid access code')
  return resp.json()
}

export async function cmrAdminLogin(password: string): Promise<CmrLoginResult> {
  const resp = await fetch(`${apiBase()}/v1/cmr/admin/login`, {
    method: 'POST',
    headers: cmrHeaders(),
    body: JSON.stringify({ password }),
  })
  if (!resp.ok) throw new Error('Invalid admin password')
  return resp.json()
}

export async function cmrCheckSession(token: string): Promise<CmrSessionCheckResult | null> {
  try {
    const resp = await fetch(`${apiBase()}/v1/cmr/auth/me`, {
      headers: cmrHeaders(token),
    })
    if (!resp.ok) return localSessionFallback(token)
    return resp.json()
  } catch {
    return localSessionFallback(token)
  }
}

export async function cmrLogout(token: string): Promise<void> {
  try {
    await fetch(`${apiBase()}/v1/cmr/auth/logout`, {
      method: 'POST',
      headers: cmrHeaders(token),
    })
  } catch {
    // Best-effort
  }
  clearCmrSession()
}

// --- Admin API calls ---

export type CmrAccessCodeEntry = {
  id: string
  name: string
  created_at: string | null
  last_accessed_at: string | null
  session_count: number
  is_active: boolean
}

export async function cmrAdminListCodes(token: string): Promise<CmrAccessCodeEntry[]> {
  const resp = await fetch(`${apiBase()}/v1/cmr/admin/codes`, {
    headers: cmrHeaders(token),
  })
  if (!resp.ok) throw new Error('Failed to list codes')
  return resp.json()
}

export async function cmrAdminCreateCode(
  token: string,
  name: string,
  code: string,
): Promise<{ id: string; name: string }> {
  const resp = await fetch(`${apiBase()}/v1/cmr/admin/codes`, {
    method: 'POST',
    headers: cmrHeaders(token),
    body: JSON.stringify({ name, code }),
  })
  if (!resp.ok) throw new Error('Failed to create code')
  return resp.json()
}

export async function cmrAdminRevokeCode(token: string, codeId: string): Promise<void> {
  const resp = await fetch(`${apiBase()}/v1/cmr/admin/codes/${codeId}`, {
    method: 'DELETE',
    headers: cmrHeaders(token),
  })
  if (!resp.ok) throw new Error('Failed to revoke code')
}
