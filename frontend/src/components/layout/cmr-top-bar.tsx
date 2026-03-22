import { Menu } from 'lucide-react'
import { useNavigate, useLocation } from 'react-router-dom'

import { CmrMark } from '@/components/layout/cmr-mark'
import { Button } from '@/components/ui'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui'
import { cn } from '@/lib/utils'
import { isCmrSubdomain, getCmrUserName, getCmrSessionToken, cmrLogout, isCmrAdmin } from '@/lib/cmr-auth'

type CmrTopBarProps = {
  onOpenLeftNav: () => void
}

const topNavItemBase =
  'house-top-nav-item text-body-strong focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--tone-accent-500))]'
const topNavItemActive = 'house-top-nav-item-active'
const topNavItemWorkspace = 'house-top-nav-item-workspace'
const topNavItemProfile = 'house-top-nav-item-profile'
const utilityButtonClass =
  'house-top-utility-button focus-visible:ring-[hsl(var(--tone-accent-500))]'

export function CmrTopBar({ onOpenLeftNav }: CmrTopBarProps) {
  const navigate = useNavigate()
  const { pathname } = useLocation()

  const isReference = pathname === '/cmr-reference-table'
  const isRefDb = pathname === '/cmr-reference-database'
  const isNewReport = pathname === '/cmr-new-report' || pathname === '/cmr-upload-report'

  return (
    <header className="border-b border-[hsl(var(--stroke-soft)/0.82)] bg-card/95 backdrop-blur">
      <div className="flex h-14 items-center px-[var(--header-side-padding)] xl:px-[var(--header-side-padding-xl)]">
        <div className="flex min-w-[11.5rem] shrink-0 items-center gap-[var(--header-gap-group)] xl:min-w-[14.5rem] 2xl:min-w-72">
          <TooltipProvider delayDuration={100}>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button variant="outline" size="icon" className={cn('nav:hidden', utilityButtonClass)} onClick={onOpenLeftNav}>
                  <Menu className="h-4 w-4" />
                  <span className="sr-only">Open navigator</span>
                </Button>
              </TooltipTrigger>
              <TooltipContent>Open navigation</TooltipContent>
            </Tooltip>
          </TooltipProvider>

          <div className="flex min-w-0 items-center gap-[var(--header-gap-tight)]">
            <CmrMark className="h-7 w-auto shrink-0 text-[hsl(var(--primary))]" />
            <div className="min-w-0 pr-1">
              <span className="block whitespace-nowrap text-base font-semibold tracking-tight text-[hsl(var(--tone-neutral-900))]">
                CMR
              </span>
              <span className="hidden whitespace-nowrap text-caption uppercase tracking-[0.12em] text-[hsl(var(--tone-neutral-500))] 2xl:block">
                Cardiac MR Analysis
              </span>
            </div>
          </div>

          <nav className="hidden items-center gap-[var(--header-gap-tight)] xl:flex">
            <button
              type="button"
              onClick={() => navigate('/cmr-reference-table')}
              className={cn(topNavItemBase, topNavItemProfile, isReference && topNavItemActive)}
            >
              Reference
            </button>
            {(!isCmrSubdomain() || isCmrAdmin()) && (
              <button
                type="button"
                onClick={() => navigate('/cmr-reference-database')}
                className={cn(topNavItemBase, 'house-top-nav-item-learning-centre', isRefDb && topNavItemActive)}
              >
                Reference Database
              </button>
            )}
          </nav>
        </div>

        <div className="ml-[var(--header-gap-group)] hidden min-w-0 flex-1 items-center gap-[var(--header-gap-group)] md:flex">
          <div className="flex-1" />
          <button
            type="button"
            onClick={() => navigate('/cmr-upload-report')}
            className={cn(
              topNavItemBase,
              'house-top-nav-item-report',
              isNewReport && topNavItemActive,
            )}
          >
            New Report
          </button>

          {isCmrSubdomain() && getCmrSessionToken() && (
            <div className="flex items-center gap-3">
              <span className="text-xs text-muted-foreground">{getCmrUserName()}</span>
              <button
                onClick={async () => {
                  const token = getCmrSessionToken()
                  if (token) await cmrLogout(token)
                  window.location.href = '/cmr-login'
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
