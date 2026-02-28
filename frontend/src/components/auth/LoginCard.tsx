import type { CSSProperties, ReactNode } from 'react'

import { AxiomosMark } from '@/components/auth/AxiomosMark'
import { Card, CardContent } from '@/components/ui/card'
import { cn } from '@/lib/utils'

type OAuthAction = {
  id: string
  label: string
  icon: ReactNode
  onClick: () => void
  disabled?: boolean
  title?: string
}

type LoginCardProps = {
  title: string
  subtitle: string
  loading?: boolean
  status?: string
  error?: string
  errorAction?: ReactNode
  oauthActions: OAuthAction[]
  children: ReactNode
  footer: ReactNode
  className?: string
}

function oauthButtonBrandStyle(providerId: string): CSSProperties {
  if (providerId === 'orcid') {
    return {
      ['--oauth-hover-bg' as string]: 'rgba(166, 206, 57, 0.05)',
      ['--oauth-hover-border' as string]: '#A6CE39',
      ['--oauth-focus-ring' as string]: 'rgba(166, 206, 57, 0.42)',
    }
  }
  if (providerId === 'google') {
    return {
      ['--oauth-hover-bg' as string]: 'rgba(234, 67, 53, 0.05)',
      ['--oauth-hover-border' as string]: '#4285F4',
      ['--oauth-focus-ring' as string]: 'rgba(66, 133, 244, 0.42)',
    }
  }
  return {
    ['--oauth-hover-bg' as string]: 'rgba(0, 164, 239, 0.045)',
    ['--oauth-hover-border' as string]: '#00A4EF',
    ['--oauth-focus-ring' as string]: 'rgba(0, 164, 239, 0.42)',
  }
}

export function LoginCard({
  title,
  subtitle,
  loading = false,
  status,
  error,
  errorAction,
  oauthActions,
  children,
  footer,
  className,
}: LoginCardProps) {
  const oauthTopGap = '1.625rem'

  return (
    <div className={cn('mx-auto w-full max-w-md', className)}>
      <Card aria-busy={loading} className="rounded-xl border-[hsl(var(--tone-neutral-200))] bg-card shadow-none">
        <CardContent className="space-y-4 p-5 sm:p-6">
          <header className="space-y-2">
            <div className="flex items-center gap-3">
              <AxiomosMark className="h-8 text-[hsl(var(--tone-accent-600))]" />
              <div className="min-w-0">
                <p className="truncate text-lg font-semibold tracking-tight text-[hsl(var(--tone-neutral-900))]">
                  Axiomos
                </p>
                <p className="truncate text-caption uppercase tracking-[0.14em] text-[hsl(var(--tone-neutral-500))]">
                  The Research Operating System
                </p>
              </div>
            </div>

            <div style={{ marginTop: '1.5rem' }} className="space-y-1">
              <h1
                className="font-semibold tracking-tight text-[hsl(var(--tone-neutral-900))]"
                style={{
                  fontSize: 'var(--text-display-size)',
                  lineHeight: 'var(--text-display-line)',
                  letterSpacing: '-0.02em',
                }}
              >
                {title}
              </h1>
              <p
                className="text-body-secondary leading-relaxed text-[hsl(var(--tone-neutral-600))]"
              >
                {subtitle}
              </p>
            </div>

          </header>

          <div style={{ marginTop: '1.25rem' }} className="space-y-4">
            {children}
          </div>

          {status ? (
            <div className="rounded-md border border-[hsl(var(--tone-positive-200))] bg-[hsl(var(--tone-positive-50))] px-3 py-2 text-sm text-[hsl(var(--tone-positive-700))]">
              {status}
            </div>
          ) : null}

          {error ? (
            errorAction ? (
              <div className="space-y-2 rounded-md border border-[hsl(var(--tone-danger-200))] bg-[hsl(var(--tone-danger-50))] px-3 py-2.5">
                <p className="text-sm text-[hsl(var(--tone-danger-700))]">{error}</p>
                <div>{errorAction}</div>
              </div>
            ) : (
              <div
                className="flex items-center justify-center border border-[hsl(var(--tone-danger-200))] bg-[hsl(var(--tone-danger-50))] px-3 text-center"
                style={{
                  height: 'calc(var(--button-auth-height, 2.5rem) - 2px)',
                  minHeight: 'calc(var(--button-auth-height, 2.5rem) - 2px)',
                  borderRadius: '0.25rem',
                }}
              >
                <p className="text-sm leading-none text-[hsl(var(--tone-danger-700))]">{error}</p>
              </div>
            )
          ) : null}

          <div style={{ marginTop: '1.5rem' }}>
            <div className="flex items-center gap-2 text-[0.86rem] font-medium uppercase tracking-[0.08em] text-[hsl(var(--tone-neutral-600))]">
              <span className="h-px flex-1 !bg-[hsl(var(--tone-neutral-500))]" />
              <span>Or continue with</span>
              <span className="h-px flex-1 !bg-[hsl(var(--tone-neutral-500))]" />
            </div>

            <div style={{ marginTop: oauthTopGap }} className="grid grid-cols-3 gap-2">
              {oauthActions.map((action) => (
                <button
                  key={action.id}
                  type="button"
                  onClick={action.onClick}
                  disabled={action.disabled}
                  title={action.title || action.label}
                  style={oauthButtonBrandStyle(action.id)}
                  className={cn(
                    'inline-flex h-10 items-center justify-center gap-2 rounded-md border px-3 text-[0.86rem] font-medium uppercase tracking-[0.08em] transition-[background-color,color,box-shadow,opacity,border-color] duration-[var(--motion-duration-ui)]',
                    'border-[hsl(var(--tone-neutral-400))] bg-card text-[hsl(var(--tone-neutral-600))] hover:bg-[var(--oauth-hover-bg)] hover:text-[hsl(var(--tone-neutral-700))] hover:shadow-sm',
                    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--oauth-focus-ring)]',
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

          <footer
            style={{ marginTop: '1.75rem' }}
            className="border-t border-[hsl(var(--tone-neutral-400))] pt-3 text-sm text-[hsl(var(--tone-neutral-600))]"
          >
            {footer}
          </footer>
        </CardContent>
      </Card>
    </div>
  )
}
