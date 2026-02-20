import { Outlet, useLocation } from 'react-router-dom'

import { InsightPanel } from '@/components/layout/insight-panel'
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
  const showInsightPanel = !isStudyCoreRoute

  return (
    <div className="flex h-screen flex-col bg-background text-foreground">
      <TopBar
        onOpenLeftNav={() => setLeftPanelOpen(true)}
        onOpenRightPanel={() => setRightPanelOpen(true)}
        showRightPanelButton={showInsightPanel}
      />

      <div
        className={cn(
          'grid min-h-0 flex-1 grid-cols-1 nav:grid-cols-[280px_minmax(0,1fr)]',
          showInsightPanel && 'insight:grid-cols-[280px_minmax(0,1fr)_360px]',
        )}
      >
        <aside className="hidden border-r border-border nav:block">
          <StudyNavigator />
        </aside>

        <main className="min-w-0 overflow-hidden bg-background">
          <ScrollArea className="h-full">
            <div
              className={cn(
                'mx-auto w-full py-4',
                isStudyCoreRoute ? 'max-w-none px-3 md:px-4' : 'max-w-6xl px-4 md:px-6',
              )}
            >
              <Outlet />
            </div>
          </ScrollArea>
        </main>

        {showInsightPanel ? (
          <aside className="hidden border-l border-border insight:block">
            <InsightPanel />
          </aside>
        ) : null}
      </div>

      <Sheet open={leftPanelOpen} onOpenChange={setLeftPanelOpen}>
        <SheetContent side="left" className="w-[290px] p-0 nav:hidden">
          <StudyNavigator onNavigate={() => setLeftPanelOpen(false)} />
        </SheetContent>
      </Sheet>

      {showInsightPanel ? (
        <Sheet open={rightPanelOpen} onOpenChange={setRightPanelOpen}>
          <SheetContent side="right" className="w-[360px] p-0 insight:hidden sm:w-[360px]">
            <InsightPanel />
          </SheetContent>
        </Sheet>
      ) : null}
    </div>
  )
}
