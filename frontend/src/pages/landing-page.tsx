import { useNavigate } from 'react-router-dom'

import { AxiomosMark } from '@/components/auth/AxiomosMark'
import { ButtonPrimitive } from '@/components/primitives/ButtonPrimitive'
import { houseSurfaces, houseTypography } from '@/lib/house-style'
import { cn } from '@/lib/utils'

export function LandingPage() {
  const navigate = useNavigate()

  return (
    <div className="min-h-screen bg-background px-4 py-10 md:py-12">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-8">
        <header className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <AxiomosMark className="h-8 text-[hsl(var(--primary))]" />
            <div className="min-w-0">
              <span className="block truncate text-2xl font-semibold tracking-tight text-[hsl(var(--tone-neutral-900))]">
                Axiomos
              </span>
              <span className="hidden truncate text-caption uppercase tracking-[0.12em] text-[hsl(var(--tone-neutral-500))] md:block">
                The Research Operating System
              </span>
            </div>
          </div>
          <ButtonPrimitive type="button" variant="secondary" onClick={() => navigate('/auth')}>
            Sign in
          </ButtonPrimitive>
        </header>

        <main className={cn('rounded-xl border border-border p-8 md:p-10', houseSurfaces.card)}>
          <div className="max-w-3xl space-y-5">
            <p className={houseTypography.h1}>
              Research writing workspace
            </p>
            <h1 className={houseTypography.title}>
              Plan, draft, and quality-check manuscripts in one workflow
            </h1>
            <p className={houseTypography.subtitle}>
              Axiomos helps you structure research context, build a rigorous manuscript plan, and
              produce draft-ready sections with transparent guardrails.
            </p>
            <div className="flex flex-wrap gap-3">
              <ButtonPrimitive type="button" variant="primary" onClick={() => navigate('/auth')}>
                Get started
              </ButtonPrimitive>
              <ButtonPrimitive type="button" variant="secondary" onClick={() => navigate('/auth')}>
                Create account
              </ButtonPrimitive>
            </div>
          </div>

          <div className="mt-10 grid gap-3 md:grid-cols-3">
            <div className={cn('rounded-lg p-4', houseSurfaces.softPanel)}>
              <p className={houseTypography.sectionTitle}>Structured planning</p>
              <p data-house-role="feature-description" className={cn('mt-1', houseTypography.textSoft)}>
                Build manuscript plans section-by-section with explicit assumptions and unresolved items.
              </p>
            </div>
            <div className={cn('rounded-lg p-4', houseSurfaces.softPanel)}>
              <p className={houseTypography.sectionTitle}>Profile-driven context</p>
              <p data-house-role="feature-description" className={cn('mt-1', houseTypography.textSoft)}>
                Connect account and publication context so planning decisions are traceable and reusable.
              </p>
            </div>
            <div className={cn('rounded-lg p-4', houseSurfaces.softPanel)}>
              <p className={houseTypography.sectionTitle}>QC-ready outputs</p>
              <p data-house-role="feature-description" className={cn('mt-1', houseTypography.textSoft)}>
                Keep methods and interpretations constrained before generation and export.
              </p>
            </div>
          </div>
        </main>
      </div>
    </div>
  )
}



