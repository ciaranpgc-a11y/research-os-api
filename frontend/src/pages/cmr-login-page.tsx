import { type FormEvent, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'

import { CmrMark } from '@/components/layout/cmr-mark'
import { cmrLogin, setCmrSession } from '@/lib/cmr-auth'
import { cn } from '@/lib/utils'

const ACCESS_FEATURES = [
  {
    label: 'Reference tables',
    detail: 'Immediate access to indexed CMR measurements and reference ranges.',
  },
  {
    label: 'Reporting workflow',
    detail: 'Structured tools for LGE, RWMA, valves, and downstream report creation.',
  },
  {
    label: 'Admin-managed access',
    detail: 'Codes and permissions are issued centrally and can be rotated when needed.',
  },
] as const

const ACCESS_CHIPS = ['Protected workspace', 'Clinical review tools', 'Session-based access'] as const

export function CmrLoginPage() {
  const [code, setCode] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const navigate = useNavigate()

  const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    if (!code.trim()) return

    setLoading(true)
    setError(null)
    try {
      const result = await cmrLogin(code.trim())
      setCmrSession(result.session_token, result.name, result.is_admin)
      navigate('/cmr-reference-table', { replace: true })
    } catch {
      setError('Invalid access code')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="relative min-h-screen overflow-hidden bg-[hsl(var(--tone-neutral-100))]">
      <div className="absolute inset-0 bg-[linear-gradient(180deg,hsl(var(--tone-neutral-50))_0%,hsl(var(--tone-accent-50))_100%)]" />
      <div className="absolute left-[-10rem] top-[-9rem] h-[26rem] w-[26rem] rounded-full bg-[hsl(var(--tone-accent-200))] opacity-45 blur-3xl" />
      <div className="absolute bottom-[-8rem] right-[-8rem] h-[22rem] w-[22rem] rounded-full bg-[hsl(var(--tone-positive-200))] opacity-40 blur-3xl" />

      <div className="relative mx-auto flex min-h-screen w-full max-w-7xl items-center px-4 py-8 sm:px-6 lg:px-8">
        <div className="grid w-full gap-6 lg:grid-cols-[minmax(0,1.15fr)_minmax(24rem,28rem)] lg:items-stretch">
          <section className="order-1 flex items-center justify-center lg:order-2">
            <div className="w-full max-w-md rounded-[1.75rem] border border-white/75 bg-white/88 p-6 shadow-[0_22px_70px_hsl(var(--tone-neutral-900)/0.12)] backdrop-blur-xl sm:p-8">
              <div className="mb-8 space-y-4">
                <div className="flex items-center justify-between gap-4">
                  <div className="inline-flex items-center gap-3 rounded-full border border-[hsl(var(--tone-accent-200))] bg-[hsl(var(--tone-accent-50))] px-3 py-2 text-sm font-medium text-[hsl(var(--tone-accent-800))]">
                    <CmrMark className="h-6 text-[hsl(var(--tone-accent-700))]" />
                    <span>CMR Analysis</span>
                  </div>
                  <span className="rounded-full bg-[hsl(var(--tone-positive-50))] px-3 py-1 text-xs font-medium text-[hsl(var(--tone-positive-800))]">
                    Secure session
                  </span>
                </div>

                <div className="space-y-2">
                  <h2 className="text-3xl font-semibold tracking-[-0.03em] text-foreground">
                    Enter access code
                  </h2>
                  <p className="text-sm leading-6 text-muted-foreground">
                    Use the code provided by your administrator to open the CMR workspace.
                  </p>
                </div>
              </div>

              <form onSubmit={handleSubmit} className="space-y-4">
                <div className="space-y-2">
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
                      'house-input w-full border border-[hsl(var(--tone-neutral-250))] bg-white text-center text-lg tracking-[0.22em] shadow-none transition focus:border-[hsl(var(--tone-accent-300))] focus:bg-[hsl(var(--tone-neutral-50))]',
                      error && 'ring-2 ring-[hsl(var(--tone-danger-400))]',
                    )}
                  />
                  <p className="text-xs leading-5 text-muted-foreground">
                    Access is limited to issued codes and active sessions.
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
                  className="house-button-primary w-full shadow-[0_14px_32px_hsl(var(--tone-accent-600)/0.18)] transition hover:shadow-[0_18px_38px_hsl(var(--tone-accent-700)/0.24)]"
                >
                  {loading ? 'Verifying...' : 'Open workspace'}
                </button>
              </form>

              <div className="mt-6 flex flex-col gap-3 border-t border-[hsl(var(--tone-neutral-200))] pt-6 sm:flex-row sm:items-center sm:justify-between">
                <p className="text-xs leading-5 text-muted-foreground">
                  Need a new code or elevated permissions?
                </p>
                <Link
                  to="/cmr-admin"
                  className="inline-flex items-center justify-center rounded-full border border-[hsl(var(--tone-accent-200))] px-4 py-2 text-sm font-medium text-[hsl(var(--tone-accent-800))] transition hover:border-[hsl(var(--tone-accent-300))] hover:bg-[hsl(var(--tone-accent-50))]"
                >
                  Admin access
                </Link>
              </div>
            </div>
          </section>

          <section className="order-2 overflow-hidden rounded-[2rem] border border-white/60 bg-[linear-gradient(160deg,hsl(var(--tone-accent-900))_0%,hsl(var(--tone-accent-700))_55%,hsl(var(--tone-neutral-900))_100%)] text-white shadow-[0_24px_80px_hsl(var(--tone-accent-900)/0.24)] lg:order-1">
            <div className="flex h-full flex-col justify-between gap-10 p-6 sm:p-8 lg:p-10">
              <div className="space-y-6">
                <div className="inline-flex items-center gap-3 rounded-full border border-white/15 bg-white/10 px-4 py-2 text-sm font-medium tracking-[0.18em] text-white/88 uppercase backdrop-blur">
                  <CmrMark className="h-7 text-white" />
                  <span>CMR Workspace</span>
                </div>

                <div className="max-w-2xl space-y-4">
                  <p className="text-xs font-semibold uppercase tracking-[0.24em] text-white/64">
                    Controlled Access
                  </p>
                  <h1 className="max-w-2xl text-4xl font-semibold tracking-[-0.04em] text-white sm:text-5xl">
                    Secure entry for CMR analysis, reporting, and reference review.
                  </h1>
                  <p className="max-w-xl text-sm leading-7 text-white/78 sm:text-base">
                    Enter the access code issued by your team to open the reporting workspace.
                    The session is created only after successful verification and can be managed
                    centrally from the admin panel.
                  </p>
                </div>

                <div className="flex flex-wrap gap-2">
                  {ACCESS_CHIPS.map((chip) => (
                    <span
                      key={chip}
                      className="rounded-full border border-white/15 bg-white/10 px-3 py-1.5 text-xs font-medium text-white/84 backdrop-blur"
                    >
                      {chip}
                    </span>
                  ))}
                </div>
              </div>

              <div className="grid gap-3 sm:grid-cols-3">
                {ACCESS_FEATURES.map((feature) => (
                  <div
                    key={feature.label}
                    className="rounded-[1.4rem] border border-white/12 bg-white/10 p-4 backdrop-blur-sm"
                  >
                    <p className="text-sm font-semibold text-white">{feature.label}</p>
                    <p className="mt-2 text-sm leading-6 text-white/70">{feature.detail}</p>
                  </div>
                ))}
              </div>
            </div>
          </section>
        </div>
      </div>
    </div>
  )
}
