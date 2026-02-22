import { useEffect, useState } from 'react'
import { Loader2 } from 'lucide-react'
import { useNavigate, useSearchParams } from 'react-router-dom'

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { setAuthSessionToken } from '@/lib/auth-session'
import { completeOAuthCallback } from '@/lib/impact-api'

type OAuthProvider = 'orcid' | 'google' | 'microsoft'

function isProvider(value: string): value is OAuthProvider {
  return value === 'orcid' || value === 'google' || value === 'microsoft'
}

export function AuthCallbackPage() {
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const [status, setStatus] = useState('Completing sign-in...')
  const [error, setError] = useState('')

  useEffect(() => {
    const providerRaw = (params.get('provider') || '').toLowerCase()
    const state = params.get('state') || ''
    const code = params.get('code') || ''
    const oauthError = params.get('error') || ''

    if (oauthError) {
      setError(`OAuth provider returned an error: ${oauthError}`)
      return
    }
    if (!isProvider(providerRaw) || !state || !code) {
      setError('OAuth callback is missing provider, state, or code.')
      return
    }

    void (async () => {
      try {
        const payload = await completeOAuthCallback({
          provider: providerRaw,
          state,
          code,
        })
        setAuthSessionToken(payload.session_token)
        setStatus('Sign-in complete. Redirecting to profile...')
        navigate('/profile', { replace: true })
      } catch (callbackError) {
        setError(callbackError instanceof Error ? callbackError.message : 'OAuth callback failed.')
      }
    })()
  }, [navigate, params])

  return (
    <div className="min-h-screen bg-slate-50 px-4 py-10">
      <div className="mx-auto w-full max-w-md">
        <Card>
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
        </Card>
      </div>
    </div>
  )
}

