const AUTH_TOKEN_STORAGE_KEY = 'aawe-impact-session-token'
const DEV_AUTH_BYPASS_TOKEN = 'aawe-dev-auth-bypass-token'

export function isAuthBypassEnabled(): boolean {
  return import.meta.env.DEV && import.meta.env.VITE_AUTH_BYPASS === 'true'
}

export function getAuthSessionToken(): string {
  if (isAuthBypassEnabled()) {
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
}
