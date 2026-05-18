import { type FormEvent, useState } from 'react'
import { useNavigate } from 'react-router-dom'

import { CmrMark } from '@/components/layout/cmr-mark'
import {
  cmrLogin,
  createLocalCmrDevSession,
  isCmrSubdomain,
  isLocalCmrDev,
  setCmrSession,
} from '@/lib/cmr-auth'
import { cn } from '@/lib/utils'
import { useCmrCaseStore } from '@/store/use-cmr-case-store'

export function CmrLoginPage() {
  const [code, setCode] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const navigate = useNavigate()
  const isLocalDev = isLocalCmrDev()
  const syncSessionScope = useCmrCaseStore((state) => state.syncSessionScope)

  const resolveLoginError = (error: unknown): string => {
    if (error instanceof TypeError) {
      return isCmrSubdomain()
        ? 'Unable to reach the local CMR API. Start the backend and try again.'
        : 'Unable to reach the CMR service. Try again.'
    }
    if (isLocalDev) {
      return 'Localhost access-code validation is unavailable. Use the local dev entry below.'
    }
    return 'Invalid access code'
  }

  const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    if (!code.trim()) return

    setLoading(true)
    setError(null)
    try {
      const result = await cmrLogin(code.trim())
      setCmrSession(result.session_token, result.name, result.is_admin, result.access_code_id)
      syncSessionScope(`cmr-access:${result.access_code_id}`)
      navigate('/cmr-reports', { replace: true })
    } catch (error) {
      setError(resolveLoginError(error))
    } finally {
      setLoading(false)
    }
  }

  const handleLocalDevEntry = () => {
    const result = createLocalCmrDevSession()
    setError(null)
    setCmrSession(result.session_token, result.name, result.is_admin, result.access_code_id)
    syncSessionScope(`cmr-access:${result.access_code_id}`)
    navigate('/cmr-reports', { replace: true })
  }

  return (
    <div className="relative min-h-screen overflow-hidden bg-[#f7f3ec] text-[hsl(var(--tone-neutral-900))]">
      <div className="absolute inset-0 bg-[linear-gradient(180deg,#fbf8f2_0%,#f6f2ea_100%)]" />
      <div className="absolute left-[-6rem] top-[-6rem] h-[24rem] w-[24rem] rounded-full bg-[#f0d3a7] opacity-30 blur-3xl" />
      <div className="absolute bottom-[-7rem] right-[-6rem] h-[24rem] w-[24rem] rounded-full bg-[hsl(var(--tone-accent-200))] opacity-25 blur-3xl" />

      <div className="relative mx-auto flex min-h-screen w-full max-w-5xl flex-col items-center justify-center px-4 py-8 sm:px-6 lg:px-8">
        <div className="mb-8 flex items-center justify-center gap-4 py-2">
          <div className="inline-flex items-center gap-3 text-sm font-semibold uppercase tracking-[0.18em] text-[hsl(var(--tone-accent-800))]">
            <CmrMark className="h-8 text-[hsl(var(--tone-accent-700))]" />
            <span>CMR Reporting Workspace</span>
          </div>
        </div>

        <section className="w-full max-w-[29rem]">
          <div className="w-full rounded-[2.25rem] border border-white/80 bg-white/88 p-6 shadow-[0_28px_80px_rgba(20,35,46,0.12)] backdrop-blur-xl sm:p-8">
            <div className="mb-8">
              <div className="mb-6 flex items-center justify-between gap-4">
                <p className="text-xs font-semibold uppercase tracking-[0.22em] text-[hsl(var(--tone-accent-700))]">
                  Sign in
                </p>
              </div>

              <div>
                <h2 className="max-w-[10ch] font-serif text-4xl font-semibold leading-[0.95] tracking-[-0.05em] text-[hsl(var(--tone-neutral-900))]">
                  Enter your access code
                </h2>
              </div>
            </div>

            <form onSubmit={handleSubmit} className="space-y-5">
              <div className="space-y-3">
                <label htmlFor="cmr-access-code" className="text-sm font-medium text-foreground">
                  Access code
                </label>
                <input
                  id="cmr-access-code"
                  type="password"
                  value={code}
                  onChange={(e) => setCode(e.target.value)}
                  placeholder="Enter code"
                  autoFocus
                  autoComplete="one-time-code"
                  className={cn(
                    'house-input h-14 w-full rounded-[1.2rem] border border-[rgba(50,95,111,0.24)] bg-white/84 px-5 text-center text-lg tracking-[0.22em] shadow-none transition focus:border-[hsl(var(--tone-accent-300))] focus:bg-white',
                    error && 'ring-2 ring-[hsl(var(--tone-danger-400))]',
                  )}
                />
                {error && (
                  <p className="rounded-2xl border border-[hsl(var(--tone-danger-200))] bg-[hsl(var(--tone-danger-50))] px-3 py-2 text-sm text-[hsl(var(--tone-danger-700))]">
                    {error}
                  </p>
                )}
              </div>

              <button
                type="submit"
                disabled={loading || !code.trim()}
                className="house-button-primary h-14 w-full rounded-full bg-[hsl(var(--tone-accent-700))] text-white shadow-[0_16px_34px_rgba(50,95,111,0.24)] transition hover:bg-[hsl(var(--tone-accent-800))]"
              >
                {loading ? 'Verifying...' : 'Enter workspace'}
              </button>

              {isLocalDev && (
                <button
                  type="button"
                  onClick={handleLocalDevEntry}
                  className="house-button-secondary h-14 w-full rounded-full border border-[rgba(50,95,111,0.22)] bg-white text-[hsl(var(--tone-accent-800))] shadow-sm transition hover:bg-[hsl(var(--tone-accent-50))]"
                >
                  Enter local dev workspace
                </button>
              )}
            </form>
          </div>
        </section>
      </div>
    </div>
  )
}
