import type { ReactNode } from 'react'

import { AxiomosMark } from '@/components/auth/AxiomosMark'
import { Card, CardContent } from '@/components/ui/card'
import { cn } from '@/lib/utils'

type AuthMode = 'signin' | 'register'

type OAuthAction = {
  id: string
  label: string
  icon: ReactNode
  onClick: () => void
  disabled?: boolean
  title?: string
}

type LoginCardProps = {
  mode: AuthMode
  title: string
  subtitle: string
  loading?: boolean
  status?: string
  error?: string
  errorAction?: ReactNode
  oauthActions: OAuthAction[]
  onModeChange: (mode: AuthMode) => void
  children: ReactNode
  footer: ReactNode
  className?: string
}

export function LoginCard({
  mode,
  title,
  subtitle,
  loading = false,
  status,
  error,
  errorAction,
  oauthActions,
  onModeChange,
  children,
  footer,
  className,
}: LoginCardProps) {
  return (
    <div className={cn('mx-auto w-full max-w-md', className)}>
      <Card aria-busy={loading} className="rounded-xl border-[hsl(var(--tone-neutral-200))] bg-card shadow-none">
        <CardContent className="space-y-5 p-6 sm:p-7">
          <header className="space-y-2">
            <div className="flex items-center gap-3">
              <AxiomosMark className="h-8 text-[hsl(var(--tone-accent-600))]" />
              <div className="min-w-0">
                <p className="truncate text-xl font-semibold tracking-tight text-[hsl(var(--tone-neutral-900))]">
                  Axiomos
                </p>
                <p className="truncate text-caption uppercase tracking-[0.14em] text-[hsl(var(--tone-neutral-500))]">
                  The Research Operating System
                </p>
              </div>
            </div>

            <div style={{ marginTop: '1.75rem' }} className="space-y-1">
              <h1
                className="text-h1 font-semibold tracking-tight text-[hsl(var(--tone-neutral-900))]"
              >
                {title}
              </h1>
              <p
                className="text-body-secondary leading-relaxed text-[hsl(var(--tone-neutral-600))]"
              >
                {subtitle}
              </p>
            </div>

            <div
              role="tablist"
              aria-label="Auth mode"
              style={{ marginTop: '1.75rem' }}
              className="flex gap-8 border-b border-[hsl(var(--tone-neutral-200))]"
            >
              <button
                type="button"
                role="tab"
                aria-selected={mode === 'signin'}
                onClick={() => onModeChange('signin')}
                className={`
                  h-9
                  font-medium
                  border-b-2
                  border-transparent
                  transition-colors duration-[var(--motion-duration-ui)]
                  cursor-pointer
                  pb-2
                  ${mode === 'signin'
                    ? 'border-[hsl(var(--tone-accent-700))] text-[hsl(var(--tone-neutral-900))]'
                    : 'text-[hsl(var(--tone-neutral-600))] hover:text-[hsl(var(--tone-neutral-900))]'
                  }
                `}
                style={{
                  fontSize: '0.75rem',
                }}
              >
                Sign in
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={mode === 'register'}
                onClick={() => onModeChange('register')}
                className={`
                  h-9
                  font-medium
                  border-b-2
                  border-transparent
                  transition-colors duration-[var(--motion-duration-ui)]
                  cursor-pointer
                  pb-2
                  ${mode === 'register'
                    ? 'border-[hsl(var(--tone-accent-700))] text-[hsl(var(--tone-neutral-900))]'
                    : 'text-[hsl(var(--tone-neutral-600))] hover:text-[hsl(var(--tone-neutral-900))]'
                  }
                `}
                style={{
                  fontSize: '0.75rem',
                }}
              >
                Register
              </button>
            </div>
          </header>

          <div style={{ marginTop: '1rem' }} className="space-y-3">
            {children}
          </div>

          <div style={{ marginTop: '1.75rem' }}>
            <div className="flex items-center gap-2 text-caption uppercase tracking-[0.12em] text-[hsl(var(--tone-neutral-400))]">
              <span className="h-px flex-1 bg-[hsl(var(--tone-neutral-200))]" />
              <span>Or continue with</span>
              <span className="h-px flex-1 bg-[hsl(var(--tone-neutral-200))]" />
            </div>

            <div style={{ marginTop: '0.75rem' }} className="grid grid-cols-3 gap-2">
              {oauthActions.map((action) => (
                <button
                  key={action.id}
                  type="button"
                  onClick={action.onClick}
                  disabled={action.disabled}
                  title={action.title || action.label}
                  className={cn(
                    'inline-flex h-9 items-center justify-center gap-1.5 rounded-md border px-2 text-label font-medium transition-[background-color,color,box-shadow,opacity] duration-[var(--motion-duration-ui)]',
                    'border-[hsl(var(--tone-neutral-200))] bg-card text-[hsl(var(--tone-neutral-700))] hover:bg-[hsl(var(--tone-neutral-100))] hover:text-[hsl(var(--tone-neutral-900))] hover:shadow-sm',
                    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--tone-accent-500))]',
                    'disabled:cursor-not-allowed disabled:opacity-55',
                  )}
                  aria-label={action.label}
                >
                  {action.icon}
                  <span>{action.label}</span>
                </button>
              ))}
            </div>
          </div>

          {status ? (
            <div className="rounded-md border border-[hsl(var(--tone-positive-200))] bg-[hsl(var(--tone-positive-50))] px-3 py-2 text-sm text-[hsl(var(--tone-positive-700))]">
              {status}
            </div>
          ) : null}

          {error ? (
            <div className="space-y-2 rounded-md border border-[hsl(var(--tone-danger-200))] bg-[hsl(var(--tone-danger-50))] px-3 py-2.5">
              <p className="text-sm text-[hsl(var(--tone-danger-700))]">{error}</p>
              {errorAction ? <div>{errorAction}</div> : null}
            </div>
          ) : null}

          <footer
            style={{ marginTop: '1.75rem' }}
            className="border-t border-[hsl(var(--tone-neutral-200))] pt-3 text-sm text-[hsl(var(--tone-neutral-600))]"
          >
            {footer}
          </footer>
        </CardContent>
      </Card>
    </div>
  )
}
