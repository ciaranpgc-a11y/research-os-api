import { useMemo, useRef, useEffect, useState } from 'react'
import { Loader2 } from 'lucide-react'
import { useLocation, useNavigate } from 'react-router-dom'

import { CardPrimitive, CardContent, CardHeader, CardTitle } from '@/components/primitives/CardPrimitive'
import { setAuthSessionToken } from '@/lib/auth-session'
import { completeOAuthCallback } from '@/lib/impact-api'

type OAuthProvider = 'orcid' | 'google' | 'microsoft'

function isProvider(value: string): value is OAuthProvider {
  return value === 'orcid' || value === 'google' || value === 'microsoft'
}

const processedCallbackKeys = new Set<string>()

export function AuthCallbackPage() {
  const navigate = useNavigate()
  const location = useLocation()
  const [status, setStatus] = useState('Completing sign-in...')
  const [error, setError] = useState('')
  const inFlightKeyRef = useRef<string | null>(null)

  const query = useMemo(() => new URLSearchParams(location.search), [location.search])
  const providerRaw = (query.get('provider') || '').toLowerCase()
  const state = query.get('state') || ''
  const code = query.get('code') || ''
  const oauthError = query.get('error') || ''
  const callbackKey = `${providerRaw}:${state}:${code}`

  useEffect(() => {
    if (oauthError) {
      setError(`OAuth provider returned an error: ${oauthError}`)
      return
    }
    if (!isProvider(providerRaw) || !state || !code) {
      setError('OAuth callback is missing provider, state, or code.')
      return
    }
    if (inFlightKeyRef.current === callbackKey) {
      return
    }
    if (processedCallbackKeys.has(callbackKey)) {
      // Ignore duplicate effect/callback executions without notifying opener as an error.
      // A duplicate run can occur in development/re-render scenarios while the first run
      // is still completing successfully.
      setStatus('Sign-in callback already processing. You can close this window.')
      return
    }
    inFlightKeyRef.current = callbackKey
    processedCallbackKeys.add(callbackKey)

    void (async () => {
      try {
        const payload = await completeOAuthCallback({
          provider: providerRaw,
          state,
          code,
        })
        const hasOpener = typeof window !== 'undefined' && window.opener && !window.opener.closed
        if (hasOpener) {
          window.opener.postMessage(
            {
              type: 'aawe-oauth-success',
              payload,
            },
            window.location.origin,
          )
          setStatus('Sign-in complete. Returning to app...')
          window.close()
          return
        }
        setAuthSessionToken(payload.session_token)
        setStatus('Sign-in complete. Redirecting to profile...')
        navigate('/profile', { replace: true })
      } catch (callbackError) {
        const detail = callbackError instanceof Error ? callbackError.message : 'OAuth callback failed.'
        const normalizedDetail = detail.toLowerCase()
        const staleState =
          normalizedDetail.includes('oauth state has already been used') ||
          normalizedDetail.includes('oauth state has expired')
        const hasOpener = typeof window !== 'undefined' && window.opener && !window.opener.closed
        if (hasOpener && !staleState) {
          window.opener.postMessage(
            {
              type: 'aawe-oauth-error',
              provider: providerRaw,
              error: detail,
            },
            window.location.origin,
          )
        }
        if (staleState) {
          setStatus('Sign-in session expired. Start ORCID sign-in again from the main window.')
          return
        }
        setError(detail)
      } finally {
        inFlightKeyRef.current = null
      }
    })()
  }, [callbackKey, code, navigate, oauthError, providerRaw, state])

  return (
    <div className="min-h-screen bg-slate-50">
      <div className="house-content-container house-content-container-wide">
        <div className="mx-auto w-full max-w-md">
        <CardPrimitive>
          <CardHeader>
            <CardTitle>Sign-in callback</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            {error ? <p className="text-red-700">{error}</p> : <p className="text-slate-700">{status}</p>}
            {!error ? (
              <p className="flex items-center gap-2 text-xs text-slate-500">
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                Processing authentication response...
              </p>
            ) : null}
          </CardContent>
        </CardPrimitive>
        </div>
      </div>
    </div>
  )
}

