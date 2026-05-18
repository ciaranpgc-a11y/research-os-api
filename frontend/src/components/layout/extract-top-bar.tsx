import { useNavigate, useLocation } from 'react-router-dom'

import { ExtractMark } from '@/components/layout/extract-mark'
import { cn } from '@/lib/utils'
import {
  isExtractSubdomain,
  getExtractSessionToken,
  extractLogout,
  isExtractAdmin,
} from '@/lib/extract-auth'

const topNavItemBase =
  'house-top-nav-item text-body-strong focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--tone-accent-500))]'
const topNavItemActive = 'house-top-nav-item-active'

export function ExtractTopBar() {
  const navigate = useNavigate()
  const { pathname } = useLocation()

  const isCohort = pathname === '/extract-cohort'
  const isExtraction =
    pathname === '/extract-new' || pathname.startsWith('/extract-patient/')
  const isAdminPage = pathname === '/extract-admin'
  const admin = isExtractAdmin()

  return (
    <header className="border-b border-[hsl(var(--stroke-soft)/0.82)] bg-card/95 backdrop-blur">
      <div className="flex h-14 items-center px-[var(--header-side-padding)] xl:px-[var(--header-side-padding-xl)]">
        <div className="flex min-w-[11.5rem] shrink-0 items-center gap-[var(--header-gap-group)] xl:min-w-[14.5rem] 2xl:min-w-72">
          <div className="flex min-w-0 items-center gap-[var(--header-gap-tight)]">
            <ExtractMark className="h-7 w-auto shrink-0 text-[hsl(var(--primary))]" />
            <div className="min-w-0 pr-1">
              <span className="block whitespace-nowrap text-base font-semibold tracking-tight text-[hsl(var(--tone-neutral-900))]">
                EXTRACT
              </span>
              <span className="hidden whitespace-nowrap text-caption uppercase tracking-[0.12em] text-[hsl(var(--tone-neutral-500))] 2xl:block">
                Cardiology Data Extractor
              </span>
            </div>
          </div>

          <nav className="hidden items-center gap-[var(--header-gap-tight)] xl:flex">
            <button
              type="button"
              onClick={() => navigate('/extract-cohort')}
              className={cn(
                topNavItemBase,
                'house-top-nav-item-extract',
                isCohort && topNavItemActive,
              )}
            >
              PH Cohort
            </button>
            <button
              type="button"
              onClick={() => navigate('/extract-new')}
              className={cn(
                topNavItemBase,
                'house-top-nav-item-extract',
                isExtraction && topNavItemActive,
              )}
            >
              Extract
            </button>
          </nav>
        </div>

        <div className="ml-[var(--header-gap-group)] hidden min-w-0 flex-1 items-center gap-[var(--header-gap-group)] md:flex">
          <nav className="hidden items-center gap-[var(--header-gap-tight)] xl:flex">
            {admin && (
              <button
                type="button"
                onClick={() => navigate('/extract-admin')}
                className={cn(
                  topNavItemBase,
                  'house-top-nav-item-extract-admin',
                  isAdminPage && topNavItemActive,
                )}
              >
                Admin
              </button>
            )}
          </nav>

          <div className="flex-1" />

          {isExtractSubdomain() && getExtractSessionToken() && (
            <div className="flex items-center gap-2">
              <button
                onClick={async () => {
                  const token = getExtractSessionToken()
                  if (token) await extractLogout(token)
                  window.location.href = '/extract-login'
                }}
                className="text-xs text-muted-foreground underline hover:text-foreground"
              >
                Sign out
              </button>
            </div>
          )}
        </div>
      </div>
    </header>
  )
}
