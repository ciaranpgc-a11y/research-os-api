import { useMemo, useRef, useEffect, useState } from 'react'
import { Loader2 } from 'lucide-react'
import { useLocation, useNavigate } from 'react-router-dom'

import { Container, Stack } from '@/components/primitives'
import { PanelShell } from '@/components/patterns'
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
    <main className="min-h-screen bg-[hsl(var(--muted))]">
      <Container size="content" gutter="default" className="py-[var(--space-7)]">
        <div className="mx-auto w-full max-w-sz-560">
          <PanelShell heading="Sign-in callback">
            <Stack space="sm">
              {error ? (
                <p className="m-0 text-body text-[hsl(var(--tone-danger-700))]">{error}</p>
              ) : (
                <p className="m-0 text-body text-[hsl(var(--tone-neutral-700))]">{status}</p>
              )}
              {!error ? (
                <p className="m-0 flex items-center gap-[var(--space-2)] text-caption text-[hsl(var(--tone-neutral-500))]">
                  <Loader2 className="h-[var(--space-3)] w-[var(--space-3)] animate-spin" />
                  Processing authentication response...
                </p>
              ) : null}
            </Stack>
          </PanelShell>
        </div>
      </Container>
    </main>
  )
}

