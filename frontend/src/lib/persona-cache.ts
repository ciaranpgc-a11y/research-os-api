import type { PersonaStatePayload } from '@/types/impact'

const PERSONA_STATE_CACHE_KEY = 'aawe-persona-state-cache-v2'
const MAX_AGE_MS = 1000 * 60 * 60 * 24 * 7

type CachedPersonaState = {
  cachedAt: number
  payload: PersonaStatePayload
}

export function readCachedPersonaState(): PersonaStatePayload | null {
  if (typeof window === 'undefined') {
    return null
  }
  const raw = window.localStorage.getItem(PERSONA_STATE_CACHE_KEY)
  if (!raw) {
    return null
  }
  try {
    const parsed = JSON.parse(raw) as CachedPersonaState
    if (!parsed || typeof parsed.cachedAt !== 'number' || !parsed.payload) {
      return null
    }
    if (Date.now() - parsed.cachedAt > MAX_AGE_MS) {
      window.localStorage.removeItem(PERSONA_STATE_CACHE_KEY)
      return null
    }
    return parsed.payload
  } catch {
    return null
  }
}

export function writeCachedPersonaState(payload: PersonaStatePayload): void {
  if (typeof window === 'undefined') {
    return
  }
  const cache: CachedPersonaState = {
    cachedAt: Date.now(),
    payload,
  }
  window.localStorage.setItem(PERSONA_STATE_CACHE_KEY, JSON.stringify(cache))
}

