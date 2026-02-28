import { Outlet, useLocation } from 'react-router-dom'

import { ProfilePanel } from '@/components/layout/profile-panel'
import { StudyNavigator } from '@/components/layout/study-navigator'
import { TopBar } from '@/components/layout/top-bar'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Sheet, SheetContent } from '@/components/ui/sheet'
import { cn } from '@/lib/utils'
import { useAaweStore } from '@/store/use-aawe-store'

export function AppShell() {
  const location = useLocation()
  const leftPanelOpen = useAaweStore((state) => state.leftPanelOpen)
  const rightPanelOpen = useAaweStore((state) => state.rightPanelOpen)
  const setLeftPanelOpen = useAaweStore((state) => state.setLeftPanelOpen)
  const setRightPanelOpen = useAaweStore((state) => state.setRightPanelOpen)
  const isStudyCoreRoute = location.pathname === '/study-core'
  const isProfileLandingRoute = location.pathname === '/profile' || location.pathname === '/impact'
  const isProfileSectionRoute = location.pathname.startsWith('/profile') || location.pathname === '/impact'
  const showRightPanel = isProfileLandingRoute
  const rightPanel = <ProfilePanel />

  return (
    <div data-house-scope="app" data-house-role="app-shell" className="flex h-screen flex-col bg-background text-foreground">
      <TopBar
        scope={isProfileSectionRoute ? 'account' : 'workspace'}
        onOpenLeftNav={() => setLeftPanelOpen(true)}
      />

      <div
        data-house-role="app-grid"
        className={cn(
          'grid min-h-0 flex-1 grid-cols-1 nav:grid-cols-[280px_minmax(0,1fr)]',
          showRightPanel && 'insight:grid-cols-[280px_minmax(0,1fr)_320px]',
        )}
      >
        <aside data-house-role="left-nav-panel" className="hidden border-r border-border nav:block">
          <StudyNavigator />
        </aside>

        <main data-house-role="content-main" className="min-w-0 overflow-hidden bg-background">
          <ScrollArea className="h-full">
            <div
              data-house-role="content-container"
              className={cn(
                'house-content-container',
                isStudyCoreRoute
                  ? 'house-content-container-fluid'
                  : isProfileSectionRoute
                    ? 'house-content-container-wide'
                    : null,
              )}
            >
              <Outlet />
            </div>
          </ScrollArea>
        </main>

        {showRightPanel ? (
          <aside data-house-role="right-insight-panel" className="hidden border-l border-border insight:block">
            {rightPanel}
          </aside>
        ) : null}
      </div>

      <Sheet open={leftPanelOpen} onOpenChange={setLeftPanelOpen}>
        <SheetContent side="left" className="w-sz-290 p-0 nav:hidden">
          <StudyNavigator onNavigate={() => setLeftPanelOpen(false)} />
        </SheetContent>
      </Sheet>

      {showRightPanel ? (
        <Sheet open={rightPanelOpen} onOpenChange={setRightPanelOpen}>
          <SheetContent
            side="right"
            className="w-sz-320 p-0 insight:hidden sm:w-sz-320"
          >
            {rightPanel}
          </SheetContent>
        </Sheet>
      ) : null}
    </div>
  )
}
