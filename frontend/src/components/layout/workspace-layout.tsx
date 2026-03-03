import { useEffect } from 'react'
import { Outlet, useParams } from 'react-router-dom'

import { TopBar } from '@/components/layout/top-bar'
import { WorkspaceNavigator } from '@/components/layout/workspace-navigator'
import { ScrollArea } from '@/components/ui'
import { Sheet, SheetContent } from '@/components/ui'
import { getAuthSessionToken } from '@/lib/auth-session'
import { useAaweStore } from '@/store/use-aawe-store'
import { useWorkspaceStore } from '@/store/use-workspace-store'

export function WorkspaceLayout() {
  const params = useParams<{ workspaceId: string }>()
  const workspaceId = (params.workspaceId || '').trim()
  const isGuest = !getAuthSessionToken()
  const leftPanelOpen = useAaweStore((state) => state.leftPanelOpen)
  const setLeftPanelOpen = useAaweStore((state) => state.setLeftPanelOpen)
  const ensureWorkspace = useWorkspaceStore((state) => state.ensureWorkspace)
  const setActiveWorkspaceId = useWorkspaceStore((state) => state.setActiveWorkspaceId)

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
        className="grid min-h-0 flex-1 grid-cols-1 nav:grid-cols-[var(--layout-left-nav-width)_minmax(0,1fr)]"
      >
        <aside data-house-role="left-nav-panel" className="hidden border-r border-border nav:block">
          <WorkspaceNavigator workspaceId={workspaceId} />
        </aside>

        <main data-house-role="content-main" className="min-w-0 overflow-hidden bg-background">
          <ScrollArea className="h-full">
            <div
              data-house-role="content-container"
              className="house-content-container house-content-container-wide"
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
      </div>

      <Sheet open={leftPanelOpen} onOpenChange={setLeftPanelOpen}>
        <SheetContent side="left" className="w-[var(--layout-left-nav-width-mobile)] p-0 nav:hidden">
          <WorkspaceNavigator workspaceId={workspaceId} onNavigate={() => setLeftPanelOpen(false)} />
        </SheetContent>
      </Sheet>
    </div>
  )
}
