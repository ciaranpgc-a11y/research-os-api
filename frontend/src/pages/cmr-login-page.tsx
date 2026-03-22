import { type FormEvent, useState } from 'react'
import { useNavigate } from 'react-router-dom'

import { CmrMark } from '@/components/layout/cmr-mark'
import { cmrLogin, isCmrSubdomain, setCmrSession } from '@/lib/cmr-auth'
import { cn } from '@/lib/utils'

const ACCESS_FEATURES = [
  {
    label: 'Reference tables',
    detail: 'Browse indexed CMR measurements and normal ranges.',
  },
  {
    label: 'Reporting tools',
    detail: 'Create and review structured CMR reports.',
  },
  {
    label: 'Admin-managed access',
    detail: 'Codes can be issued, revoked, and rotated by your administrator.',
  },
] as const

export function CmrLoginPage() {
  const [code, setCode] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const navigate = useNavigate()

  const resolveLoginError = (error: unknown): string => {
    if (error instanceof TypeError) {
      return isCmrSubdomain()
        ? 'Unable to reach the local CMR API. Start the backend and try again.'
        : 'Unable to reach the CMR service. Try again.'
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
      setCmrSession(result.session_token, result.name, result.is_admin)
      navigate('/cmr-reference-table', { replace: true })
    } catch (error) {
      setError(resolveLoginError(error))
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="relative min-h-screen overflow-hidden bg-[#f7f3ec] text-[hsl(var(--tone-neutral-900))]">
      <div className="absolute inset-0 bg-[linear-gradient(180deg,#fbf8f2_0%,#f6f2ea_100%)]" />
      <div className="absolute left-[-6rem] top-[-6rem] h-[24rem] w-[24rem] rounded-full bg-[#f0d3a7] opacity-30 blur-3xl" />
      <div className="absolute bottom-[-7rem] right-[-6rem] h-[24rem] w-[24rem] rounded-full bg-[hsl(var(--tone-accent-200))] opacity-25 blur-3xl" />

      <div className="relative mx-auto min-h-screen w-full max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
        <div className="mb-5 flex items-center justify-between gap-4 py-2">
          <div className="inline-flex items-center gap-3 text-sm font-semibold uppercase tracking-[0.18em] text-[hsl(var(--tone-accent-800))]">
            <CmrMark className="h-8 text-[hsl(var(--tone-accent-700))]" />
            <span>CMR Reporting Workspace</span>
          </div>
        </div>

        <div className="grid gap-5 lg:grid-cols-[minmax(0,1.18fr)_minmax(24rem,26rem)] lg:items-stretch">
          <section className="order-2 overflow-hidden rounded-[2.25rem] border border-white/70 bg-[linear-gradient(145deg,rgba(255,255,255,0.72),rgba(255,248,240,0.92))] shadow-[0_28px_80px_rgba(20,35,46,0.12)] backdrop-blur-xl lg:order-1">
            <div className="flex h-full flex-col justify-between gap-10 p-7 sm:p-9 lg:p-12">
              <div className="space-y-6">
                <p className="text-xs font-semibold uppercase tracking-[0.24em] text-[hsl(var(--tone-accent-700))]">
                  Secure Access
                </p>

                <div className="max-w-3xl space-y-5">
                  <h1 className="max-w-[10ch] font-serif text-5xl font-semibold leading-[0.9] tracking-[-0.06em] text-[hsl(var(--tone-neutral-900))] sm:text-6xl lg:text-7xl">
                    Access the CMR reporting workspace
                  </h1>
                  <p className="max-w-2xl text-base leading-8 text-[hsl(var(--tone-neutral-600))]">
                    Enter the access code provided by your administrator to open reference
                    tables, analysis tools, and structured reporting.
                  </p>
                </div>
              </div>

              <div className="space-y-5">
                <div className="grid gap-3 sm:grid-cols-3">
                  {ACCESS_FEATURES.map((feature) => (
                    <div
                      key={feature.label}
                      className="rounded-[1.55rem] border border-[rgba(19,35,46,0.13)] bg-white/55 p-5"
                    >
                      <p className="text-sm font-semibold text-[hsl(var(--tone-neutral-900))]">
                        {feature.label}
                      </p>
                      <p className="mt-3 text-sm leading-7 text-[hsl(var(--tone-neutral-600))]">
                        {feature.detail}
                      </p>
                    </div>
                  ))}
                </div>

                <div className="border-l-[3px] border-[#d08f4d] bg-white/50 px-5 py-4 text-sm leading-7 text-[hsl(var(--tone-neutral-700))]">
                  Need access? Contact your administrator.
                </div>
              </div>
            </div>
          </section>

          <section className="order-1 flex items-stretch justify-center lg:order-2">
            <div className="w-full rounded-[2.25rem] border border-white/80 bg-white/88 p-6 shadow-[0_28px_80px_rgba(20,35,46,0.12)] backdrop-blur-xl sm:p-8">
              <div className="mb-8 flex items-center justify-between gap-4">
                <p className="text-xs font-semibold uppercase tracking-[0.22em] text-[hsl(var(--tone-accent-700))]">
                  Sign in
                </p>
                <span className="rounded-full bg-[hsl(var(--tone-accent-50))] px-3 py-1 text-xs font-medium text-[hsl(var(--tone-accent-800))]">
                  Code required
                </span>
              </div>

              <div className="space-y-3">
                <h2 className="max-w-[10ch] font-serif text-4xl font-semibold leading-[0.95] tracking-[-0.05em] text-[hsl(var(--tone-neutral-900))]">
                  Enter your access code
                </h2>
                <p className="text-sm leading-7 text-[hsl(var(--tone-neutral-600))]">
                  Use the code provided by your administrator.
                </p>
              </div>

              <form onSubmit={handleSubmit} className="mt-8 space-y-5">
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
                  <p className="text-xs leading-6 text-[hsl(var(--tone-neutral-600))]">
                    If you do not have a code, contact your administrator.
                  </p>
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
              </form>

              <div className="mt-8 border-t border-[rgba(19,35,46,0.1)] pt-6">
                <p className="text-sm leading-7 text-[hsl(var(--tone-neutral-600))]">
                  Need access? Contact your administrator.
                </p>
              </div>
            </div>
          </section>
        </div>
      </div>
    </div>
  )
}
