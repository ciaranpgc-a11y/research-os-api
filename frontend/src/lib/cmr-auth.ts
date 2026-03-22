/**
 * CMR access control — sessionStorage helpers and API calls.
 * Fully separate from Axiomos auth (lib/auth-session.ts).
 */

const SESSION_TOKEN_KEY = 'cmr_session_token'
const USER_NAME_KEY = 'cmr_user_name'
const IS_ADMIN_KEY = 'cmr_is_admin'

// --- Subdomain detection ---

export function isCmrSubdomain(): boolean {
  if (typeof window === 'undefined') return false
  const host = window.location.hostname
  return host === 'cmr.axiomos.studio' || host === 'cmr.localhost'
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

export function setCmrSession(token: string, name: string, isAdmin: boolean): void {
  sessionStorage.setItem(SESSION_TOKEN_KEY, token)
  sessionStorage.setItem(USER_NAME_KEY, name)
  sessionStorage.setItem(IS_ADMIN_KEY, String(isAdmin))
}

export function clearCmrSession(): void {
  sessionStorage.removeItem(SESSION_TOKEN_KEY)
  sessionStorage.removeItem(USER_NAME_KEY)
  sessionStorage.removeItem(IS_ADMIN_KEY)
}

// --- API base URL ---

function apiBase(): string {
  const env = (import.meta.env.VITE_API_BASE_URL || '').trim()
  if (env) return env.replace(/\/+$/, '')
  if (typeof window !== 'undefined') {
    const host = window.location.hostname
    if (host === 'cmr.axiomos.studio' || host === 'cmr.localhost') {
      return window.location.origin
    }
  }
  return 'http://127.0.0.1:8000'
}

function cmrHeaders(token?: string | null): Record<string, string> {
  const h: Record<string, string> = { 'Content-Type': 'application/json' }
  if (token) h.Authorization = `Bearer ${token}`
  return h
}

// --- API calls ---

export type CmrLoginResult = {
  session_token: string
  name: string
  is_admin: boolean
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

export async function cmrCheckSession(token: string): Promise<{ name: string; is_admin: boolean } | null> {
  try {
    const resp = await fetch(`${apiBase()}/v1/cmr/auth/me`, {
      headers: cmrHeaders(token),
    })
    if (!resp.ok) return null
    return resp.json()
  } catch {
    return null
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
