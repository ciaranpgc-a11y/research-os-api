/**
 * CMR access control — sessionStorage helpers and API calls.
 * Fully separate from Axiomos auth (lib/auth-session.ts).
 */

const SESSION_TOKEN_KEY = 'cmr_session_token'
const USER_NAME_KEY = 'cmr_user_name'
const IS_ADMIN_KEY = 'cmr_is_admin'

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
    if (host === 'cmr.axiomos.studio' || host === 'cmr.localhost' || isLocalCmrDevRoute()) {
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

function cmrMultipartHeaders(token?: string | null): Record<string, string> {
  const h: Record<string, string> = {}
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

export type CmrSaxAssistResult = {
  roi: {
    center_x_pct: number
    center_y_pct: number
    inner_radius_pct: number
    outer_radius_pct: number
    enhancement_threshold: number
  }
  registration: {
    shift_x_px: number
    shift_y_px: number
    note: string
  }
  metrics: {
    confidence: string
    candidate_fraction_pct: number
    mean_delta: number
    roi_mean_pre: number
    roi_mean_post: number
  }
  suggested_sectors: Array<{
    label: string
    coverage_pct: number
  }>
  notes: string[]
  images: {
    aligned_pre: string
    aligned_post: string
    difference_map: string
    candidate_overlay: string
  }
}

export type CmrSaxAssistInput = {
  preImage: File
  postImage: File
  centerXPct: number
  centerYPct: number
  innerRadiusPct: number
  outerRadiusPct: number
  enhancementThreshold: number
}

export async function cmrAnalyseSaxPair(token: string, input: CmrSaxAssistInput): Promise<CmrSaxAssistResult> {
  const formData = new FormData()
  formData.append('pre_image', input.preImage)
  formData.append('post_image', input.postImage)
  formData.append('center_x_pct', String(input.centerXPct))
  formData.append('center_y_pct', String(input.centerYPct))
  formData.append('inner_radius_pct', String(input.innerRadiusPct))
  formData.append('outer_radius_pct', String(input.outerRadiusPct))
  formData.append('enhancement_threshold', String(input.enhancementThreshold))

  const resp = await fetch(`${apiBase()}/v1/cmr/image-analyser/sax-assist`, {
    method: 'POST',
    headers: cmrMultipartHeaders(token),
    body: formData,
  })

  if (!resp.ok) {
    const detail = await resp.json().catch(() => ({ detail: 'SAX analysis failed' }))
    throw new Error(detail.detail || 'SAX analysis failed')
  }

  return resp.json()
}
