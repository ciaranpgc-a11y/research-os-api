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
}

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
    <header className="flex h-14 items-center gap-3 border-b border-border bg-card/80 px-3 backdrop-blur nav:px-4">
      <div className="flex items-center gap-2">
        {showLeftNavButton ? (
          <TooltipProvider delayDuration={100}>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button variant="outline" size="icon" className="nav:hidden" onClick={onOpenLeftNav}>
                  <Menu className="h-4 w-4" />
                  <span className="sr-only">Open navigator</span>
                </Button>
              </TooltipTrigger>
              <TooltipContent>Open navigation</TooltipContent>
            </Tooltip>
          </TooltipProvider>
        ) : null}
        <div className="flex items-center gap-2">
          <span className="text-base font-semibold tracking-tight">AAWE</span>
          <span className="hidden text-xs text-muted-foreground md:inline">Autonomous Academic Writing Engine</span>
        </div>
        <nav className="ml-3 hidden items-center gap-1 xl:flex">
          <button
            type="button"
            onClick={() => navigate('/workspaces')}
            className={cn(
              'rounded-md px-2.5 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground',
              scope === 'workspace' && 'bg-accent text-foreground',
            )}
          >
            Workspaces
          </button>
          <button
            type="button"
            onClick={() => navigate('/profile')}
            className={cn(
              'rounded-md px-2.5 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground',
              scope === 'account' && 'bg-accent text-foreground',
            )}
          >
            Profile
          </button>
        </nav>
      </div>

      <div className="mx-auto hidden w-full max-w-xl items-center gap-2 md:flex">
        <Search className="h-4 w-4 text-muted-foreground" />
        <Input
          placeholder={
            scope === 'account'
              ? 'Search people, works, themes...'
              : 'Search sections, tables, figures, claims...'
          }
          className="h-8"
          value={searchQuery}
          onChange={(event) => setSearchQuery(event.target.value)}
        />
      </div>

      <div className="ml-auto flex items-center gap-2">
        {isGuest ? (
          <Button size="sm" variant="outline" onClick={() => navigate('/auth')}>
            Sign in
          </Button>
        ) : (
          <Button size="sm" variant="outline" onClick={() => void onSignOut()} disabled={isSigningOut}>
            {isSigningOut ? <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" /> : null}
            {isSigningOut ? 'Signing out...' : 'Sign out'}
          </Button>
        )}

        <TooltipProvider delayDuration={100}>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button variant="outline" size="icon" onClick={toggleTheme}>
                {theme === 'dark' ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
                <span className="sr-only">Toggle theme</span>
              </Button>
            </TooltipTrigger>
            <TooltipContent>{theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}</TooltipContent>
          </Tooltip>
        </TooltipProvider>
      </div>
    </header>
  )
}
