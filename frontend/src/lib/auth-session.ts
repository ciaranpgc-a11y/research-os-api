const AUTH_TOKEN_STORAGE_KEY = 'aawe-impact-session-token'
const AUTH_ROLE_STORAGE_KEY = 'aawe-impact-session-role'
const AUTH_ACCOUNT_KEY_MAP_STORAGE_KEY = 'aawe-impact-account-key-map'
const AUTH_ACTIVE_EMAIL_STORAGE_KEY = 'aawe-impact-active-email'
const DEV_AUTH_BYPASS_TOKEN = 'aawe-dev-auth-bypass-token'
const DEV_AUTH_BYPASS_ROLE = 'admin'

type AccountKeyMap = Record<string, string>

function normalizeEmail(value: string): string {
  return String(value || '').trim().toLowerCase()
}

function normalizeAccountKey(value: string): string {
  return String(value || '').trim()
}

function readAccountKeyMap(): AccountKeyMap {
  try {
    const raw = window.localStorage.getItem(AUTH_ACCOUNT_KEY_MAP_STORAGE_KEY)
    if (!raw) {
      return {}
    }
    const parsed = JSON.parse(raw) as Record<string, string>
    const next: AccountKeyMap = {}
    Object.entries(parsed || {}).forEach(([email, accountKey]) => {
      const cleanEmail = normalizeEmail(email)
      const cleanKey = normalizeAccountKey(accountKey)
      if (!cleanEmail || !cleanKey) {
        return
      }
      next[cleanEmail] = cleanKey
    })
    return next
  } catch {
    return {}
  }
}

function writeAccountKeyMap(value: AccountKeyMap): void {
  window.localStorage.setItem(AUTH_ACCOUNT_KEY_MAP_STORAGE_KEY, JSON.stringify(value))
}

export function rememberAuthUserIdentity(input: {
  email: string
  accountKey?: string | null
}): void {
  const cleanEmail = normalizeEmail(input.email)
  if (!cleanEmail) {
    return
  }
  window.sessionStorage.setItem(AUTH_ACTIVE_EMAIL_STORAGE_KEY, cleanEmail)
  window.localStorage.setItem(AUTH_ACTIVE_EMAIL_STORAGE_KEY, cleanEmail)
  const cleanAccountKey = normalizeAccountKey(input.accountKey || '')
  if (!cleanAccountKey) {
    return
  }
  const map = readAccountKeyMap()
  map[cleanEmail] = cleanAccountKey
  writeAccountKeyMap(map)
}

function readActiveAuthEmail(): string {
  const sessionValue = normalizeEmail(window.sessionStorage.getItem(AUTH_ACTIVE_EMAIL_STORAGE_KEY) || '')
  if (sessionValue) {
    window.localStorage.setItem(AUTH_ACTIVE_EMAIL_STORAGE_KEY, sessionValue)
    return sessionValue
  }
  const localValue = normalizeEmail(window.localStorage.getItem(AUTH_ACTIVE_EMAIL_STORAGE_KEY) || '')
  if (!localValue) {
    return ''
  }
  window.sessionStorage.setItem(AUTH_ACTIVE_EMAIL_STORAGE_KEY, localValue)
  return localValue
}

export function getAuthAccountKeyHint(): string {
  if (typeof window === 'undefined') {
    return ''
  }
  const email = readActiveAuthEmail()
  if (!email) {
    return ''
  }
  const map = readAccountKeyMap()
  return normalizeAccountKey(map[email] || '')
}

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
    window.localStorage.setItem(AUTH_TOKEN_STORAGE_KEY, sessionValue)
    return sessionValue
  }
  const localValue = window.localStorage.getItem(AUTH_TOKEN_STORAGE_KEY)
  if (!localValue) {
    return ''
  }
  // Keep both stores aligned for resilient local navigation/reloads.
  window.sessionStorage.setItem(AUTH_TOKEN_STORAGE_KEY, localValue)
  window.localStorage.setItem(AUTH_TOKEN_STORAGE_KEY, localValue)
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
  window.sessionStorage.removeItem(AUTH_ACTIVE_EMAIL_STORAGE_KEY)
  window.localStorage.removeItem(AUTH_ACTIVE_EMAIL_STORAGE_KEY)
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
