const INTEGRATIONS_USER_CACHE_KEY = 'aawe_integrations_user_cache'
const ANONYMOUS_SCOPE = 'anonymous'

type CachedUserRecord = {
  id?: string | null
}

function trimValue(value: string | null | undefined): string {
  return (value || '').trim()
}

function sanitizeScopePart(value: string): string {
  return value.replace(/[^a-zA-Z0-9_-]/g, '_')
}

export function readStorageScopeUserId(): string {
  if (typeof window === 'undefined') {
    return ANONYMOUS_SCOPE
  }
  const raw = window.localStorage.getItem(INTEGRATIONS_USER_CACHE_KEY)
  if (!raw) {
    return ANONYMOUS_SCOPE
  }
  try {
    const parsed = JSON.parse(raw) as CachedUserRecord
    const clean = trimValue(parsed.id)
    if (!clean) {
      return ANONYMOUS_SCOPE
    }
    return sanitizeScopePart(clean)
  } catch {
    return ANONYMOUS_SCOPE
  }
}

export function scopedStorageKey(baseKey: string): string {
  return `${baseKey}:${readStorageScopeUserId()}`
}

export function readScopedStorageItem(baseKey: string): string | null {
  if (typeof window === 'undefined') {
    return null
  }
  const scopedKey = scopedStorageKey(baseKey)
  const scoped = window.localStorage.getItem(scopedKey)
  if (scoped !== null) {
    return scoped
  }

  // Backward compatibility with legacy unscoped keys.
  const legacy = window.localStorage.getItem(baseKey)
  if (legacy !== null) {
    window.localStorage.setItem(scopedKey, legacy)
    return legacy
  }
  return null
}

export function writeScopedStorageItem(baseKey: string, value: string): void {
  if (typeof window === 'undefined') {
    return
  }
  window.localStorage.setItem(scopedStorageKey(baseKey), value)
}

export function removeScopedStorageItem(baseKey: string): void {
  if (typeof window === 'undefined') {
    return
  }
  window.localStorage.removeItem(scopedStorageKey(baseKey))
}

export function matchesScopedStorageEventKey(eventKey: string | null, baseKey: string): boolean {
  if (!eventKey) {
    return false
  }
  return eventKey === baseKey || eventKey.startsWith(`${baseKey}:`)
}
