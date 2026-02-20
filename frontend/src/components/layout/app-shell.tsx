import { Outlet } from 'react-router-dom'

import { InsightPanel } from '@/components/layout/insight-panel'
import { StudyNavigator } from '@/components/layout/study-navigator'
import { TopBar } from '@/components/layout/top-bar'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Sheet, SheetContent } from '@/components/ui/sheet'
import { useAaweStore } from '@/store/use-aawe-store'

export function AppShell() {
  const leftPanelOpen = useAaweStore((state) => state.leftPanelOpen)
  const rightPanelOpen = useAaweStore((state) => state.rightPanelOpen)
  const setLeftPanelOpen = useAaweStore((state) => state.setLeftPanelOpen)
  const setRightPanelOpen = useAaweStore((state) => state.setRightPanelOpen)

  return (
    <div className="flex h-screen flex-col bg-background text-foreground">
      <TopBar onOpenLeftNav={() => setLeftPanelOpen(true)} onOpenRightPanel={() => setRightPanelOpen(true)} />

      <div className="grid min-h-0 flex-1 grid-cols-1 nav:grid-cols-[280px_minmax(0,1fr)] insight:grid-cols-[280px_minmax(0,1fr)_360px]">
        <aside className="hidden border-r border-border nav:block">
          <StudyNavigator />
        </aside>

        <main className="min-w-0 overflow-hidden bg-background">
          <ScrollArea className="h-full">
            <div className="mx-auto w-full max-w-6xl px-4 py-4 md:px-6">
              <Outlet />
            </div>
          </ScrollArea>
        </main>

        <aside className="hidden border-l border-border insight:block">
          <InsightPanel />
        </aside>
      </div>

      <Sheet open={leftPanelOpen} onOpenChange={setLeftPanelOpen}>
        <SheetContent side="left" className="w-[290px] p-0 nav:hidden">
          <StudyNavigator onNavigate={() => setLeftPanelOpen(false)} />
        </SheetContent>
      </Sheet>

      <Sheet open={rightPanelOpen} onOpenChange={setRightPanelOpen}>
        <SheetContent side="right" className="w-[360px] p-0 insight:hidden sm:w-[360px]">
          <InsightPanel />
        </SheetContent>
      </Sheet>
    </div>
  )
}
