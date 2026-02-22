import { useNavigate } from 'react-router-dom'

import { Button } from '@/components/ui/button'

export function LandingPage() {
  const navigate = useNavigate()

  return (
    <div className="min-h-screen bg-slate-100 px-4 py-12">
      <div className="mx-auto flex w-full max-w-5xl flex-col gap-10">
        <header className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-2xl font-semibold tracking-tight text-slate-900">AAWE</span>
            <span className="hidden text-sm text-slate-600 md:inline">
              Autonomous Academic Writing Engine
            </span>
          </div>
          <Button type="button" variant="outline" onClick={() => navigate('/auth')}>
            Sign in
          </Button>
        </header>

        <main className="rounded-2xl border border-slate-200 bg-white p-8 shadow-sm md:p-12">
          <div className="max-w-3xl space-y-5">
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-emerald-700">
              Research writing workspace
            </p>
            <h1 className="text-4xl font-semibold tracking-tight text-slate-900 md:text-5xl">
              Plan, draft, and quality-check manuscripts in one workflow
            </h1>
            <p className="text-base leading-relaxed text-slate-600">
              AAWE helps you structure research context, build a rigorous manuscript plan, and
              produce draft-ready sections with transparent guardrails.
            </p>
            <div className="flex flex-wrap gap-3">
              <Button type="button" className="bg-emerald-600 hover:bg-emerald-700" onClick={() => navigate('/auth')}>
                Get started
              </Button>
              <Button type="button" variant="outline" onClick={() => navigate('/auth')}>
                Create account
              </Button>
            </div>
          </div>

          <div className="mt-10 grid gap-3 md:grid-cols-3">
            <div className="rounded-lg border border-slate-200 bg-slate-50 p-4">
              <p className="text-sm font-semibold text-slate-900">Structured planning</p>
              <p className="mt-1 text-sm text-slate-600">
                Build manuscript plans section-by-section with explicit assumptions and unresolved items.
              </p>
            </div>
            <div className="rounded-lg border border-slate-200 bg-slate-50 p-4">
              <p className="text-sm font-semibold text-slate-900">Profile-driven context</p>
              <p className="mt-1 text-sm text-slate-600">
                Connect account and publication context so planning decisions are traceable and reusable.
              </p>
            </div>
            <div className="rounded-lg border border-slate-200 bg-slate-50 p-4">
              <p className="text-sm font-semibold text-slate-900">QC-ready outputs</p>
              <p className="mt-1 text-sm text-slate-600">
                Keep methods and interpretations constrained before generation and export.
              </p>
            </div>
          </div>
        </main>
      </div>
    </div>
  )
}

