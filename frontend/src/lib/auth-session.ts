const AUTH_TOKEN_STORAGE_KEY = 'aawe-impact-session-token'

export function getAuthSessionToken(): string {
  const sessionValue = window.sessionStorage.getItem(AUTH_TOKEN_STORAGE_KEY)
  if (sessionValue) {
    return sessionValue
  }
  const legacyLocal = window.localStorage.getItem(AUTH_TOKEN_STORAGE_KEY)
  if (!legacyLocal) {
    return ''
  }
  window.sessionStorage.setItem(AUTH_TOKEN_STORAGE_KEY, legacyLocal)
  window.localStorage.removeItem(AUTH_TOKEN_STORAGE_KEY)
  return legacyLocal
}

export function setAuthSessionToken(token: string): void {
  const clean = token.trim()
  if (!clean) {
    clearAuthSessionToken()
    return
  }
  window.sessionStorage.setItem(AUTH_TOKEN_STORAGE_KEY, clean)
  window.localStorage.removeItem(AUTH_TOKEN_STORAGE_KEY)
}

export function clearAuthSessionToken(): void {
  window.sessionStorage.removeItem(AUTH_TOKEN_STORAGE_KEY)
  window.localStorage.removeItem(AUTH_TOKEN_STORAGE_KEY)
}
