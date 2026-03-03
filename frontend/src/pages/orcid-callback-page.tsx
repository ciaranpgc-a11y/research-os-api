import { useEffect, useState } from 'react'
import { Loader2 } from 'lucide-react'
import { useNavigate, useSearchParams } from 'react-router-dom'

import { Container, Stack } from '@/components/primitives'
import { PanelShell } from '@/components/patterns'
import { completeOrcidLink } from '@/lib/impact-api'

export function OrcidCallbackPage() {
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const [status, setStatus] = useState('Completing ORCID link...')
  const [error, setError] = useState('')

  useEffect(() => {
    const state = (params.get('state') || '').trim()
    const code = (params.get('code') || '').trim()
    const oauthError = (params.get('error') || '').trim()

    if (oauthError) {
      setError(`ORCID returned an error: ${oauthError}`)
      return
    }
    if (!state || !code) {
      setError('ORCID callback is missing required parameters (state/code).')
      return
    }

    void (async () => {
      try {
        const payload = await completeOrcidLink({ state, code })
        sessionStorage.setItem(
          'aawe_orcid_link_result',
          JSON.stringify({
            linked: payload.connected,
            orcidId: payload.orcid_id,
            at: Date.now(),
          }),
        )
        setStatus('ORCID linked. Returning to integrations...')
        navigate('/profile/integrations?orcid=linked', { replace: true })
      } catch (callbackError) {
        setError(callbackError instanceof Error ? callbackError.message : 'Could not complete ORCID link.')
      }
    })()
  }, [navigate, params])

  return (
    <main className="min-h-screen bg-[hsl(var(--muted))]">
      <Container size="content" gutter="default" className="py-[var(--space-7)]">
        <div className="mx-auto w-full max-w-sz-560">
          <PanelShell heading="ORCID callback">
            <Stack space="sm">
              {error ? (
                <p className="m-0 text-body text-[hsl(var(--tone-danger-700))]">{error}</p>
              ) : (
                <p className="m-0 text-body text-[hsl(var(--tone-neutral-700))]">{status}</p>
              )}
              {!error ? (
                <p className="m-0 flex items-center gap-[var(--space-2)] text-caption text-[hsl(var(--tone-neutral-500))]">
                  <Loader2 className="h-[var(--space-3)] w-[var(--space-3)] animate-spin" />
                  Finalizing ORCID account link...
                </p>
              ) : null}
            </Stack>
          </PanelShell>
        </div>
      </Container>
    </main>
  )
}
