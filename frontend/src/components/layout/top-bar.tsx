import { useState } from 'react'
import { Loader2, Menu, Moon, Search, Sun } from 'lucide-react'
import { useNavigate } from 'react-router-dom'

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
  workspaceLabel?: string
  profileLabel?: string
  brandLabel?: string
  brandTagline?: string
}

const topNavItemBase =
  'inline-flex h-8 items-center rounded-md border border-transparent px-3 text-label font-medium leading-5 transition-colors'
const topNavItemIdle = 'text-muted-foreground hover:bg-muted/45 hover:text-foreground'
const topNavItemActive = 'border-border bg-accent/45 text-foreground'
const authButtonClass = 'h-8 rounded-md px-3 text-label font-medium'

export function TopBar({
  scope,
  onOpenLeftNav,
  showLeftNavButton = true,
  workspaceLabel = 'Workspaces',
  profileLabel = 'Profile',
  brandLabel = 'AAWE',
  brandTagline = 'Autonomous Academic Writing Engine',
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
    <header className="border-b border-border bg-card/80 backdrop-blur">
      <div className="grid h-14 grid-cols-[minmax(0,1fr)_auto] items-center gap-3 px-3 nav:px-4 md:grid-cols-[minmax(0,1fr)_minmax(16rem,34rem)_minmax(0,1fr)]">
        <div className="flex min-w-0 items-center gap-2.5">
          {showLeftNavButton ? (
            <TooltipProvider delayDuration={100}>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button variant="outline" size="icon" className="h-8 w-8 nav:hidden" onClick={onOpenLeftNav}>
                    <Menu className="h-4 w-4" />
                    <span className="sr-only">Open navigator</span>
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Open navigation</TooltipContent>
              </Tooltip>
            </TooltipProvider>
          ) : null}

          <div className="flex min-w-0 items-center gap-3">
            <span className="truncate text-base font-semibold tracking-tight">{brandLabel}</span>
            <span className="hidden truncate text-caption text-muted-foreground xl:inline">{brandTagline}</span>
          </div>

          <nav className="ml-2 hidden items-center gap-1 nav:flex">
            <button
              type="button"
              onClick={() => navigate('/workspaces')}
              className={cn(topNavItemBase, topNavItemIdle, scope === 'workspace' && topNavItemActive)}
            >
              {workspaceLabel}
            </button>
            <button
              type="button"
              onClick={() => navigate('/profile')}
              className={cn(topNavItemBase, topNavItemIdle, scope === 'account' && topNavItemActive)}
            >
              {profileLabel}
            </button>
          </nav>
        </div>

        <div className="hidden items-center gap-2 md:flex">
          <Search className="h-4 w-4 text-muted-foreground" />
          <Input
            placeholder={
              scope === 'account'
                ? 'Search people, works, themes...'
                : 'Search sections, tables, figures, claims...'
            }
            className="h-8 text-label"
            value={searchQuery}
            onChange={(event) => setSearchQuery(event.target.value)}
          />
        </div>

        <div className="flex items-center justify-end gap-2">
          {isGuest ? (
            <Button size="sm" variant="outline" className={authButtonClass} onClick={() => navigate('/auth')}>
              Sign in
            </Button>
          ) : (
            <Button
              size="sm"
              variant="outline"
              className={authButtonClass}
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
                <Button variant="outline" size="icon" className="h-8 w-8" onClick={toggleTheme}>
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
