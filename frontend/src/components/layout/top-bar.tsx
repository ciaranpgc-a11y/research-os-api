import { useEffect, useState } from 'react'
import { Loader2, Menu, Moon, Search, Sun } from 'lucide-react'
import { useNavigate } from 'react-router-dom'

import { AxiomosMark } from '@/components/auth/AxiomosMark'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import { clearAuthSessionToken, getAuthSessionToken } from '@/lib/auth-session'
import { fetchMe, logoutAuth } from '@/lib/impact-api'
import { cn } from '@/lib/utils'
import { useAaweStore } from '@/store/use-aawe-store'

type TopBarScope = 'account' | 'workspace'

type TopBarProps = {
  scope: TopBarScope
  onOpenLeftNav: () => void
  showLeftNavButton?: boolean
}

const topNavItemBase =
  'house-top-nav-item text-label focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--tone-accent-500))]'
const topNavItemIdle = ''
const topNavItemActive = 'house-top-nav-item-active'
const topNavItemWorkspace = 'house-top-nav-item-workspace'
const topNavItemProfile = 'house-top-nav-item-profile'
const utilityButtonClass =
  'house-top-utility-button focus-visible:ring-[hsl(var(--tone-accent-500))]'
const searchInputClass =
  'h-9 bg-[hsl(var(--tone-neutral-100)/0.72)] pl-9 text-label text-[hsl(var(--tone-neutral-800))] placeholder:text-[hsl(var(--tone-neutral-500))] focus-visible:ring-[hsl(var(--tone-accent-500))]'

export function TopBar({
  scope,
  onOpenLeftNav,
  showLeftNavButton = true,
}: TopBarProps) {
  const navigate = useNavigate()
  const theme = useAaweStore((state) => state.theme)
  const toggleTheme = useAaweStore((state) => state.toggleTheme)
  const searchQuery = useAaweStore((state) => state.searchQuery)
  const setSearchQuery = useAaweStore((state) => state.setSearchQuery)

  const [isSigningOut, setIsSigningOut] = useState(false)
  const [isAdmin, setIsAdmin] = useState(false)
  const sessionToken = getAuthSessionToken()
  const isGuest = !sessionToken

  useEffect(() => {
    let cancelled = false
    if (!sessionToken) {
      setIsAdmin(false)
      return () => {
        cancelled = true
      }
    }
    void fetchMe(sessionToken)
      .then((user) => {
        if (cancelled) {
          return
        }
        setIsAdmin(user.role === 'admin')
      })
      .catch(() => {
        if (cancelled) {
          return
        }
        setIsAdmin(false)
      })
    return () => {
      cancelled = true
    }
  }, [sessionToken])

  const onSignOut = async () => {
    const token = getAuthSessionToken()
    if (!token) {
      clearAuthSessionToken()
      navigate('/auth', { replace: true })
      return
    }
    setIsSigningOut(true)
    try {
      await logoutAuth(token)
    } catch {
      // Clear local session even if remote logout fails.
    } finally {
      clearAuthSessionToken()
      setIsSigningOut(false)
      navigate('/auth', { replace: true })
    }
  }

  return (
    <header className="border-b border-[hsl(var(--stroke-soft)/0.82)] bg-card/95 backdrop-blur">
      <div className="flex h-14 items-center gap-3 px-3 nav:px-4">
        <div className="flex min-w-[12.5rem] shrink-0 items-center gap-2 xl:min-w-[15.5rem] 2xl:min-w-72">
          {showLeftNavButton ? (
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
          ) : null}

          <div className="flex min-w-0 items-center gap-2.5">
            <AxiomosMark className="h-7 w-auto shrink-0 text-[hsl(var(--primary))]" />
            <div className="min-w-0 pr-1">
              <span className="block whitespace-nowrap text-base font-semibold tracking-tight text-[hsl(var(--tone-neutral-900))]">
                Axiomos
              </span>
              <span className="hidden whitespace-nowrap text-caption uppercase tracking-[0.12em] text-[hsl(var(--tone-neutral-500))] 2xl:block">
                The Research Operating System
              </span>
            </div>
          </div>

          <nav className="ml-3 hidden items-center gap-1 xl:flex">
            <button
              type="button"
              onClick={() => navigate('/workspaces')}
              className={cn(topNavItemBase, topNavItemWorkspace, topNavItemIdle, scope === 'workspace' && topNavItemActive)}
            >
              Workspaces
            </button>
            <button
              type="button"
              onClick={() => navigate('/profile')}
              className={cn(topNavItemBase, topNavItemProfile, topNavItemIdle, scope === 'account' && topNavItemActive)}
            >
              Profile
            </button>
          </nav>
        </div>

        <div className="mx-auto hidden w-full max-w-3xl items-center gap-2 md:flex">
          <div className="relative min-w-0 flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[hsl(var(--tone-neutral-500))]" />
            <Input
              placeholder={
                scope === 'account'
                  ? 'Search people, works, themes...'
                  : 'Search sections, tables, figures, claims...'
              }
              className={searchInputClass}
              value={searchQuery}
              onChange={(event) => setSearchQuery(event.target.value)}
            />
          </div>
          <button type="button" className={cn(topNavItemBase, topNavItemIdle)}>
            Learning centre
          </button>
          <button type="button" className={cn(topNavItemBase, topNavItemIdle)}>
            Opportunities
          </button>
        </div>

        <div className="ml-auto flex items-center gap-2">
          {isGuest ? (
            <Button
              size="sm"
              variant="outline"
              className={cn(utilityButtonClass, 'px-3 text-label font-semibold')}
              onClick={() => navigate('/auth')}
            >
              Sign in
            </Button>
          ) : (
            <>
              {isAdmin ? (
                <Button
                  size="sm"
                  variant="outline"
                  className={cn(utilityButtonClass, 'px-3 text-label font-semibold')}
                  onClick={() => navigate('/admin/overview')}
                >
                  Admin
                </Button>
              ) : null}
              <Button
                size="sm"
                variant="outline"
                className={cn(utilityButtonClass, 'px-3 text-label font-semibold')}
                onClick={() => void onSignOut()}
                disabled={isSigningOut}
              >
                {isSigningOut ? <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" /> : null}
                {isSigningOut ? 'Signing out...' : 'Sign out'}
              </Button>
            </>
          )}

          <TooltipProvider delayDuration={100}>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button variant="outline" size="icon" className={utilityButtonClass} onClick={toggleTheme}>
                  {theme === 'dark' ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
                  <span className="sr-only">Toggle theme</span>
                </Button>
              </TooltipTrigger>
              <TooltipContent>{theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}</TooltipContent>
            </Tooltip>
          </TooltipProvider>
        </div>
      </div>
    </header>
  )
}
