import { useEffect, useState } from 'react'
import { Loader2 } from 'lucide-react'
import { useNavigate, useSearchParams } from 'react-router-dom'

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
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
    <div className="min-h-screen bg-slate-50 px-4 py-10">
      <div className="mx-auto w-full max-w-md">
        <Card>
          <CardHeader>
            <CardTitle>ORCID callback</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            {error ? <p className="text-red-700">{error}</p> : <p className="text-slate-700">{status}</p>}
            {!error ? (
              <p className="flex items-center gap-2 text-xs text-slate-500">
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                Finalising ORCID account link...
              </p>
            ) : null}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
