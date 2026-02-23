function isUiHost(hostname: string): boolean {
  const host = (hostname || '').toLowerCase()
  return host.includes('-ui-') || host.includes('-ui.')
}

function toApiHost(hostname: string): string {
  return hostname.replace('-ui-', '-api-').replace('-ui.', '-api.')
}

function isLocalHost(hostname: string): boolean {
  const host = (hostname || '').toLowerCase()
  return host === 'localhost' || host === '127.0.0.1'
}

function normaliseUrlCandidate(value: string): string {
  const trimmed = value.trim()
  if (!trimmed) {
    return ''
  }
  if (/^https?:\/\//i.test(trimmed)) {
    return trimmed
  }
  if (trimmed.startsWith('//')) {
    return `https:${trimmed}`
  }
  const hostPortPathMatch = trimmed.match(/^([a-z0-9.-]+)(:\d+)?(\/.*)?$/i)
  if (hostPortPathMatch) {
    const host = (hostPortPathMatch[1] || '').toLowerCase()
    const protocol = isLocalHost(host) ? 'http' : 'https'
    return `${protocol}://${trimmed}`
  }
  return trimmed
}

function parseUrlCandidate(value: string): URL | null {
  const candidate = normaliseUrlCandidate(value)
  if (!candidate) {
    return null
  }
  try {
    return new URL(candidate)
  } catch {
    return null
  }
}

function resolveApiBaseUrl(): string {
  const envValue = (import.meta.env.VITE_API_BASE_URL || '').trim()
  if (envValue) {
    const parsed = parseUrlCandidate(envValue)
    if (parsed) {
      if (isUiHost(parsed.hostname)) {
        parsed.hostname = toApiHost(parsed.hostname)
      }
      return `${parsed.origin}${parsed.pathname}`.replace(/\/+$/, '')
    }
  }

  if (typeof window !== 'undefined') {
    const parsed = parseUrlCandidate(window.location.origin)
    if (parsed) {
      if (isUiHost(parsed.hostname)) {
        parsed.hostname = toApiHost(parsed.hostname)
        return `${parsed.origin}${parsed.pathname}`.replace(/\/+$/, '')
      }
    }
  }
  return 'http://127.0.0.1:8000'
}

const rawApiBaseUrl = resolveApiBaseUrl()

// Accept either ".../v1" or the API root in env; all callers append "/v1/..." paths.
export const API_BASE_URL = rawApiBaseUrl.replace(/\/+$/, '').replace(/\/v1$/i, '')
