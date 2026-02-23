function isUiHost(hostname: string): boolean {
  const host = (hostname || '').toLowerCase()
  return host.includes('-ui-') || host.includes('-ui.')
}

function toApiHost(hostname: string): string {
  return hostname.replace('-ui-', '-api-').replace('-ui.', '-api.')
}

function resolveApiBaseUrl(): string {
  const envValue = (import.meta.env.VITE_API_BASE_URL || '').trim()
  if (envValue) {
    try {
      const parsed = new URL(envValue)
      if (isUiHost(parsed.hostname)) {
        parsed.hostname = toApiHost(parsed.hostname)
        return parsed.toString()
      }
      return envValue
    } catch {
      return envValue
    }
  }

  if (typeof window !== 'undefined') {
    try {
      const parsed = new URL(window.location.origin)
      if (isUiHost(parsed.hostname)) {
        parsed.hostname = toApiHost(parsed.hostname)
        return parsed.toString()
      }
    } catch {
      // Ignore and use localhost fallback.
    }
  }
  return 'http://127.0.0.1:8000'
}

const rawApiBaseUrl = resolveApiBaseUrl()

// Accept either ".../v1" or the API root in env; all callers append "/v1/..." paths.
export const API_BASE_URL = rawApiBaseUrl.replace(/\/+$/, '').replace(/\/v1$/i, '')
