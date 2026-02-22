const AUTH_TOKEN_STORAGE_KEY = 'aawe-impact-session-token'

export function getAuthSessionToken(): string {
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
