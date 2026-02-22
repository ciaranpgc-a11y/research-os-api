const rawApiBaseUrl = import.meta.env.VITE_API_BASE_URL?.trim() || 'http://127.0.0.1:8000'

// Accept either ".../v1" or the API root in env; all callers append "/v1/..." paths.
export const API_BASE_URL = rawApiBaseUrl.replace(/\/+$/, '').replace(/\/v1$/i, '')
