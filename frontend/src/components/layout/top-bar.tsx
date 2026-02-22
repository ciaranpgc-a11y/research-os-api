import { useState } from 'react'
import { Loader2, Menu, Moon, Search, Sun } from 'lucide-react'
import { useNavigate } from 'react-router-dom'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Sheet, SheetContent } from '@/components/ui/sheet'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import { clearAuthSessionToken, getAuthSessionToken } from '@/lib/auth-session'
import { logoutAuth } from '@/lib/impact-api'
import { cn } from '@/lib/utils'
import { useAaweStore } from '@/store/use-aawe-store'
import { useWorkspaceStore } from '@/store/use-workspace-store'

type TopBarScope = 'account' | 'workspace'

type TopBarProps = {
  scope: TopBarScope
  workspaceId?: string | null
  onOpenLeftNav: () => void
}

export function TopBar({
  scope,
  workspaceId = null,
  onOpenLeftNav,
}: TopBarProps) {
  const navigate = useNavigate()
  const theme = useAaweStore((state) => state.theme)
  const toggleTheme = useAaweStore((state) => state.toggleTheme)
  const searchQuery = useAaweStore((state) => state.searchQuery)
  const setSearchQuery = useAaweStore((state) => state.setSearchQuery)
  const activeWorkspaceId = useWorkspaceStore((state) => state.activeWorkspaceId)
  const workspaces = useWorkspaceStore((state) => state.workspaces)
  const setActiveWorkspaceId = useWorkspaceStore((state) => state.setActiveWorkspaceId)
  const createWorkspace = useWorkspaceStore((state) => state.createWorkspace)

  const [isSigningOut, setIsSigningOut] = useState(false)
  const [workspacePickerOpen, setWorkspacePickerOpen] = useState(false)
  const [newWorkspaceName, setNewWorkspaceName] = useState('')
  const sessionToken = getAuthSessionToken()
  const isGuest = !sessionToken

  const effectiveWorkspaceId = (workspaceId || activeWorkspaceId || '').trim()
  const workspaceOverviewHref = effectiveWorkspaceId ? `/w/${effectiveWorkspaceId}/overview` : ''

  const goToWorkspaces = () => {
    if (workspaceOverviewHref) {
      navigate(workspaceOverviewHref)
      return
    }
    setWorkspacePickerOpen(true)
  }

  const onChooseWorkspace = (nextWorkspaceId: string) => {
    if (!nextWorkspaceId) {
      return
    }
    setActiveWorkspaceId(nextWorkspaceId)
    navigate(`/w/${nextWorkspaceId}/overview`)
    setWorkspacePickerOpen(false)
  }

  const onCreateWorkspace = () => {
    const nextWorkspace = createWorkspace(newWorkspaceName || 'New Workspace')
    setNewWorkspaceName('')
    navigate(`/w/${nextWorkspace.id}/overview`)
    setWorkspacePickerOpen(false)
  }

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
        <div className="flex items-center gap-2">
          <span className="text-base font-semibold tracking-tight">AAWE</span>
          <span className="hidden text-xs text-muted-foreground md:inline">Autonomous Academic Writing Engine</span>
        </div>
        <nav className="ml-3 hidden items-center gap-1 xl:flex">
          <button
            type="button"
            onClick={goToWorkspaces}
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

      <Sheet open={workspacePickerOpen} onOpenChange={setWorkspacePickerOpen}>
        <SheetContent side="right" className="w-[360px] p-4 sm:w-[360px]">
          <h2 className="text-base font-semibold">Choose workspace</h2>
          <div className="mt-4 space-y-3">
            {isGuest ? (
              <div className="rounded-md border border-amber-300 bg-amber-50 p-2 text-xs text-amber-900">
                Guest mode: workspace changes are local only and are not saved to your account.
              </div>
            ) : null}
            <div className="space-y-2">
              {workspaces.map((workspace) => (
                <button
                  key={workspace.id}
                  type="button"
                  onClick={() => onChooseWorkspace(workspace.id)}
                  className="w-full rounded-md border border-border bg-background px-3 py-2 text-left text-sm hover:bg-accent/35"
                >
                  <p className="font-medium">{workspace.name}</p>
                  <p className="text-xs text-muted-foreground">Version {workspace.version}</p>
                </button>
              ))}
            </div>
            <div className="space-y-2 rounded-md border border-border p-2">
              <p className="text-xs font-medium text-muted-foreground">Create new workspace</p>
              <Input
                value={newWorkspaceName}
                onChange={(event) => setNewWorkspaceName(event.target.value)}
                placeholder="Workspace name"
              />
              <Button type="button" size="sm" onClick={onCreateWorkspace}>
                Create and open workspace
              </Button>
            </div>
          </div>
        </SheetContent>
      </Sheet>
    </header>
  )
}
