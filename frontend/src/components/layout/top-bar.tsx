import { useState } from 'react'
import { Loader2, Menu, Moon, Search, Sun } from 'lucide-react'
import { useNavigate } from 'react-router-dom'

import { AxiomosMark } from '@/components/auth/AxiomosMark'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import { clearAuthSessionToken, getAuthSessionToken } from '@/lib/auth-session'
import { logoutAuth } from '@/lib/impact-api'
import { cn } from '@/lib/utils'
import { useAaweStore } from '@/store/use-aawe-store'

type TopBarScope = 'account' | 'workspace'

type TopBarProps = {
  scope: TopBarScope
  onOpenLeftNav: () => void
  showLeftNavButton?: boolean
}

const topNavItemBase =
  'inline-flex h-8 items-center rounded-md border border-transparent px-3 text-label font-medium leading-5 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--tone-accent-600))]'
const topNavItemIdle = 'text-[hsl(var(--tone-neutral-600))] hover:bg-[hsl(var(--tone-neutral-100))] hover:text-[hsl(var(--tone-neutral-900))]'
const topNavItemActive =
  'border-[hsl(var(--tone-accent-200))] bg-[hsl(var(--tone-accent-100))] text-[hsl(var(--tone-accent-800))]'
const utilityButtonClass =
  'h-8 border-[hsl(var(--tone-neutral-200))] bg-card text-[hsl(var(--tone-neutral-700))] hover:bg-[hsl(var(--tone-neutral-100))] hover:text-[hsl(var(--tone-neutral-900))] focus-visible:ring-[hsl(var(--tone-accent-600))]'
const searchInputClass =
  'h-8 border-[hsl(var(--tone-neutral-200))] bg-card text-label placeholder:text-[hsl(var(--tone-neutral-500))] focus-visible:ring-[hsl(var(--tone-accent-600))]'

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
  const sessionToken = getAuthSessionToken()
  const isGuest = !sessionToken

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
    <header className="border-b border-[hsl(var(--tone-neutral-200))] bg-[hsl(var(--tone-neutral-50))]/95 backdrop-blur">
      <div className="flex h-14 items-center gap-3 px-3 nav:px-4">
        <div className="flex min-w-0 items-center gap-2">
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
            <AxiomosMark className="h-7 text-[hsl(var(--primary))]" />
            <div className="min-w-0">
              <span className="block truncate text-base font-semibold tracking-tight text-[hsl(var(--tone-neutral-900))]">
                Axiomos
              </span>
              <span className="hidden truncate text-caption uppercase tracking-[0.12em] text-[hsl(var(--tone-neutral-500))] lg:block">
                The Research Operating System
              </span>
            </div>
          </div>

          <nav className="ml-3 hidden items-center gap-1 xl:flex">
            <button
              type="button"
              onClick={() => navigate('/workspaces')}
              className={cn(topNavItemBase, topNavItemIdle, scope === 'workspace' && topNavItemActive)}
            >
              Workspaces
            </button>
            <button
              type="button"
              onClick={() => navigate('/profile')}
              className={cn(topNavItemBase, topNavItemIdle, scope === 'account' && topNavItemActive)}
            >
              Profile
            </button>
          </nav>
        </div>

        <div className="mx-auto hidden w-full max-w-xl items-center gap-2 md:flex">
          <Search className="h-4 w-4 text-[hsl(var(--tone-neutral-500))]" />
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

        <div className="ml-auto flex items-center gap-2">
          {isGuest ? (
            <Button
              size="sm"
              variant="outline"
              className={cn(utilityButtonClass, 'px-3 text-label font-medium')}
              onClick={() => navigate('/auth')}
            >
              Sign in
            </Button>
          ) : (
            <Button
              size="sm"
              variant="outline"
              className={cn(utilityButtonClass, 'px-3 text-label font-medium')}
              onClick={() => void onSignOut()}
              disabled={isSigningOut}
            >
              {isSigningOut ? <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" /> : null}
              {isSigningOut ? 'Signing out...' : 'Sign out'}
            </Button>
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
