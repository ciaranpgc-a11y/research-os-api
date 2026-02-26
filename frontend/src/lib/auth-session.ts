const AUTH_TOKEN_STORAGE_KEY = 'aawe-impact-session-token'
const AUTH_ROLE_STORAGE_KEY = 'aawe-impact-session-role'
const DEV_AUTH_BYPASS_TOKEN = 'aawe-dev-auth-bypass-token'
const DEV_AUTH_BYPASS_ROLE = 'admin'

export function isAuthBypassEnabled(): boolean {
  return import.meta.env.DEV && import.meta.env.VITE_AUTH_BYPASS === 'true'
}

export function getAuthSessionToken(): string {
  if (isAuthBypassEnabled()) {
    window.sessionStorage.setItem(AUTH_ROLE_STORAGE_KEY, DEV_AUTH_BYPASS_ROLE)
    window.localStorage.setItem(AUTH_ROLE_STORAGE_KEY, DEV_AUTH_BYPASS_ROLE)
    return DEV_AUTH_BYPASS_TOKEN
  }

  const sessionValue = window.sessionStorage.getItem(AUTH_TOKEN_STORAGE_KEY)
  if (sessionValue) {
    // Keep local copy for durability across refresh/restart.
    window.localStorage.setItem(AUTH_TOKEN_STORAGE_KEY, sessionValue)
    return sessionValue
  }
  const localValue = window.localStorage.getItem(AUTH_TOKEN_STORAGE_KEY)
  if (!localValue) {
    return ''
  }
  window.sessionStorage.setItem(AUTH_TOKEN_STORAGE_KEY, localValue)
  return localValue
}

export function setAuthSessionToken(token: string): void {
  const clean = token.trim()
  if (!clean) {
    clearAuthSessionToken()
    return
  }
  window.sessionStorage.setItem(AUTH_TOKEN_STORAGE_KEY, clean)
  window.localStorage.setItem(AUTH_TOKEN_STORAGE_KEY, clean)
}

export function clearAuthSessionToken(): void {
  window.sessionStorage.removeItem(AUTH_TOKEN_STORAGE_KEY)
  window.localStorage.removeItem(AUTH_TOKEN_STORAGE_KEY)
  window.sessionStorage.removeItem(AUTH_ROLE_STORAGE_KEY)
  window.localStorage.removeItem(AUTH_ROLE_STORAGE_KEY)
}

export function getCachedAuthRole(): 'admin' | 'user' | '' {
  if (isAuthBypassEnabled()) {
    return 'admin'
  }
  const sessionValue = window.sessionStorage.getItem(AUTH_ROLE_STORAGE_KEY)
  if (sessionValue === 'admin' || sessionValue === 'user') {
    window.localStorage.setItem(AUTH_ROLE_STORAGE_KEY, sessionValue)
    return sessionValue
  }
  const localValue = window.localStorage.getItem(AUTH_ROLE_STORAGE_KEY)
  if (localValue !== 'admin' && localValue !== 'user') {
    return ''
  }
  window.sessionStorage.setItem(AUTH_ROLE_STORAGE_KEY, localValue)
  return localValue
}

export function setCachedAuthRole(role: 'admin' | 'user'): void {
  window.sessionStorage.setItem(AUTH_ROLE_STORAGE_KEY, role)
  window.localStorage.setItem(AUTH_ROLE_STORAGE_KEY, role)
}
