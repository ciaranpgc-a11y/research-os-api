/**
 * Extract (Cardiology Data Extractor) access control — sessionStorage helpers and API calls.
 * Fully separate from Axiomos auth (lib/auth-session.ts) and CMR auth (lib/cmr-auth.ts).
 */

const SESSION_TOKEN_KEY = 'extract_session_token'
const USER_NAME_KEY = 'extract_user_name'
const IS_ADMIN_KEY = 'extract_is_admin'
const ACCESS_CODE_ID_KEY = 'extract_access_code_id'
const LOCAL_EXTRACT_DEV_API_BASE = 'http://127.0.0.1:8011'

// --- Subdomain detection ---

function isLocalExtractDevRoute(): boolean {
  if (typeof window === 'undefined') return false
  const host = window.location.hostname
  if (host !== 'localhost' && host !== '127.0.0.1') return false
  return window.location.pathname.startsWith('/extract')
}

export function isExtractSubdomain(): boolean {
  if (typeof window === 'undefined') return false
  const host = window.location.hostname
  return host === 'extract.axiomos.studio' || host === 'extract.localhost' || isLocalExtractDevRoute()
}

export function isLocalExtractDev(): boolean {
  return isLocalExtractDevRoute()
}

// --- Session storage ---

export function getExtractSessionToken(): string | null {
  return sessionStorage.getItem(SESSION_TOKEN_KEY)
}

export function getExtractUserName(): string | null {
  return sessionStorage.getItem(USER_NAME_KEY)
}

export function isExtractAdmin(): boolean {
  return sessionStorage.getItem(IS_ADMIN_KEY) === 'true'
}

export function getExtractAccessCodeId(): string | null {
  return sessionStorage.getItem(ACCESS_CODE_ID_KEY)
}

export function setExtractSession(token: string, name: string, isAdmin: boolean, accessCodeId: string): void {
  sessionStorage.setItem(SESSION_TOKEN_KEY, token)
  sessionStorage.setItem(USER_NAME_KEY, name)
  sessionStorage.setItem(IS_ADMIN_KEY, String(isAdmin))
  sessionStorage.setItem(ACCESS_CODE_ID_KEY, accessCodeId)
}

export function clearExtractSession(): void {
  sessionStorage.removeItem(SESSION_TOKEN_KEY)
  sessionStorage.removeItem(USER_NAME_KEY)
  sessionStorage.removeItem(IS_ADMIN_KEY)
  sessionStorage.removeItem(ACCESS_CODE_ID_KEY)
}

// --- API base URL ---

function apiBase(): string {
  if (typeof window !== 'undefined') {
    const host = window.location.hostname
    // Local dev: always hit the backend directly
    if (isLocalExtractDevRoute()) return LOCAL_EXTRACT_DEV_API_BASE
    if (host === 'extract.localhost') return LOCAL_EXTRACT_DEV_API_BASE
    // Production: same origin (backend and frontend served from same host)
    if (host === 'extract.axiomos.studio') return window.location.origin
  }

  const env = (import.meta.env.VITE_API_BASE_URL || '').trim()
  if (env) return env.replace(/\/+$/, '')
  return LOCAL_EXTRACT_DEV_API_BASE
}

function extractHeaders(token?: string | null): Record<string, string> {
  const h: Record<string, string> = { 'Content-Type': 'application/json' }
  if (token) h.Authorization = `Bearer ${token}`
  return h
}

export function getExtractApiBase(): string {
  return apiBase()
}

export function buildExtractHeaders(token?: string | null): Record<string, string> {
  return extractHeaders(token)
}

export type ExtractLoginResult = {
  session_token: string
  name: string
  is_admin: boolean
  access_code_id: string
}

type ExtractSessionCheckResult = Pick<ExtractLoginResult, 'name' | 'is_admin' | 'access_code_id'>

function localSessionFallback(token: string): ExtractSessionCheckResult | null {
  if (typeof window === 'undefined') return null
  if (!isLocalExtractDevRoute()) return null
  if (getExtractSessionToken() !== token) return null

  const name = getExtractUserName()
  const accessCodeId = getExtractAccessCodeId()
  if (!name || !accessCodeId) return null
  return { name, is_admin: isExtractAdmin(), access_code_id: accessCodeId }
}

// --- API calls ---

export function createLocalExtractDevSession(name = 'Local Dev'): ExtractLoginResult {
  const tokenSeed =
    typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
      ? crypto.randomUUID()
      : `${Date.now()}`

  return {
    session_token: `extract-local-dev-${tokenSeed}`,
    name,
    is_admin: false,
    access_code_id: 'local-dev',
  }
}

export async function extractLogin(code: string): Promise<ExtractLoginResult> {
  const resp = await fetch(`${apiBase()}/v1/extract/auth/login`, {
    method: 'POST',
    headers: extractHeaders(),
    body: JSON.stringify({ code }),
  })
  if (!resp.ok) throw new Error('Invalid access code')
  return resp.json()
}

export async function extractAdminLogin(password: string): Promise<ExtractLoginResult> {
  const resp = await fetch(`${apiBase()}/v1/extract/auth/admin-login`, {
    method: 'POST',
    headers: extractHeaders(),
    body: JSON.stringify({ password }),
  })
  if (!resp.ok) throw new Error('Invalid admin password')
  return resp.json()
}

export async function extractCheckSession(token: string): Promise<ExtractSessionCheckResult | null> {
  try {
    const resp = await fetch(`${apiBase()}/v1/extract/auth/session`, {
      headers: extractHeaders(token),
    })
    if (!resp.ok) return localSessionFallback(token)
    return resp.json()
  } catch {
    return localSessionFallback(token)
  }
}

export async function extractLogout(token: string): Promise<void> {
  try {
    await fetch(`${apiBase()}/v1/extract/auth/logout`, {
      method: 'POST',
      headers: extractHeaders(token),
    })
  } catch {
    // Best-effort
  }
  clearExtractSession()
}

// --- Admin API calls ---

export type ExtractAccessCodeEntry = {
  id: string
  name: string
  code?: string | null
  created_at: string | null
  last_accessed_at: string | null
  session_count: number
  is_active: boolean
}

export async function extractListCodes(token: string): Promise<ExtractAccessCodeEntry[]> {
  const resp = await fetch(`${apiBase()}/v1/extract/auth/codes`, {
    headers: extractHeaders(token),
  })
  if (!resp.ok) throw new Error('Failed to list codes')
  return resp.json()
}

export async function extractCreateCode(
  token: string,
  name: string,
  code: string,
): Promise<{ id: string; name: string; code?: string | null }> {
  const resp = await fetch(`${apiBase()}/v1/extract/auth/codes`, {
    method: 'POST',
    headers: extractHeaders(token),
    body: JSON.stringify({ name, code }),
  })
  if (!resp.ok) throw new Error('Failed to create code')
  return resp.json()
}

export async function extractRevokeCode(token: string, codeId: string): Promise<void> {
  const resp = await fetch(`${apiBase()}/v1/extract/auth/codes/${codeId}`, {
    method: 'DELETE',
    headers: extractHeaders(token),
  })
  if (!resp.ok) throw new Error('Failed to revoke code')
}
