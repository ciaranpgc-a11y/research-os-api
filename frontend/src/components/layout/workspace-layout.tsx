import { useEffect } from 'react'
import { Outlet, useLocation, useParams } from 'react-router-dom'

import { InsightPanel } from '@/components/layout/insight-panel'
import { TopBar } from '@/components/layout/top-bar'
import { WorkspaceNavigator } from '@/components/layout/workspace-navigator'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Sheet, SheetContent } from '@/components/ui/sheet'
import { cn } from '@/lib/utils'
import { getAuthSessionToken } from '@/lib/auth-session'
import { useAaweStore } from '@/store/use-aawe-store'
import { useWorkspaceStore } from '@/store/use-workspace-store'

export function WorkspaceLayout() {
  const location = useLocation()
  const params = useParams<{ workspaceId: string }>()
  const workspaceId = (params.workspaceId || '').trim()
  const isGuest = !getAuthSessionToken()
  const leftPanelOpen = useAaweStore((state) => state.leftPanelOpen)
  const rightPanelOpen = useAaweStore((state) => state.rightPanelOpen)
  const setLeftPanelOpen = useAaweStore((state) => state.setLeftPanelOpen)
  const setRightPanelOpen = useAaweStore((state) => state.setRightPanelOpen)
  const ensureWorkspace = useWorkspaceStore((state) => state.ensureWorkspace)
  const setActiveWorkspaceId = useWorkspaceStore((state) => state.setActiveWorkspaceId)
  const isRunWizardRoute = location.pathname.includes('/run-wizard')
  const showRightPanel = !isRunWizardRoute

  useEffect(() => {
    if (!workspaceId) {
      return
    }
    ensureWorkspace(workspaceId)
    setActiveWorkspaceId(workspaceId)
  }, [ensureWorkspace, setActiveWorkspaceId, workspaceId])

  return (
    <div data-house-scope="workspace" data-house-role="workspace-shell" className="flex h-screen flex-col bg-background text-foreground">
      <TopBar
        scope="workspace"
        onOpenLeftNav={() => setLeftPanelOpen(true)}
      />

      <div
        data-house-role="workspace-grid"
        className={cn(
          'grid min-h-0 flex-1 grid-cols-1 nav:grid-cols-[280px_minmax(0,1fr)]',
          showRightPanel && 'insight:grid-cols-[280px_minmax(0,1fr)_340px]',
        )}
      >
        <aside data-house-role="left-nav-panel" className="hidden border-r border-border nav:block">
          <WorkspaceNavigator workspaceId={workspaceId} />
        </aside>

        <main data-house-role="content-main" className="min-w-0 overflow-hidden bg-background">
          <ScrollArea className="h-full">
            <div
              data-house-role="content-container"
              className={cn('mx-auto w-full py-4', isRunWizardRoute ? 'max-w-none px-3 md:px-4' : 'max-w-6xl px-4 md:px-6')}
            >
              {isGuest ? (
                <div data-house-role="guest-banner" className="mb-3 rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900">
                  Not saved. Create an account to keep this workspace and sync profile context.
                </div>
              ) : null}
              <Outlet />
            </div>
          </ScrollArea>
        </main>

        {showRightPanel ? (
          <aside data-house-role="right-insight-panel" className="hidden border-l border-border insight:block">
            <InsightPanel />
          </aside>
        ) : null}
      </div>

      <Sheet open={leftPanelOpen} onOpenChange={setLeftPanelOpen}>
        <SheetContent side="left" className="w-sz-290 p-0 nav:hidden">
          <WorkspaceNavigator workspaceId={workspaceId} onNavigate={() => setLeftPanelOpen(false)} />
        </SheetContent>
      </Sheet>

      {showRightPanel ? (
        <Sheet open={rightPanelOpen} onOpenChange={setRightPanelOpen}>
          <SheetContent side="right" className="w-sz-340 p-0 insight:hidden sm:w-sz-340">
            <InsightPanel />
          </SheetContent>
        </Sheet>
      ) : null}
    </div>
  )
}
