import { Outlet } from 'react-router-dom'

import { AccountNavigator } from '@/components/layout/account-navigator'
import { TopBar } from '@/components/layout/top-bar'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Sheet, SheetContent } from '@/components/ui/sheet'
import { useAaweStore } from '@/store/use-aawe-store'

export function AccountLayout() {
  const leftPanelOpen = useAaweStore((state) => state.leftPanelOpen)
  const setLeftPanelOpen = useAaweStore((state) => state.setLeftPanelOpen)

  return (
    <div className="flex h-screen flex-col bg-background text-foreground">
      <TopBar
        scope="account"
        onOpenLeftNav={() => setLeftPanelOpen(true)}
      />

      <div className="grid min-h-0 flex-1 grid-cols-1 nav:grid-cols-[250px_minmax(0,1fr)]">
        <aside className="hidden border-r border-border nav:block">
          <AccountNavigator />
        </aside>

        <main className="min-w-0 overflow-hidden bg-background">
          <ScrollArea className="h-full">
            <div className="mx-auto w-full max-w-sz-1320 px-4 py-4 md:px-6">
              <Outlet />
            </div>
          </ScrollArea>
        </main>
      </div>

      <Sheet open={leftPanelOpen} onOpenChange={setLeftPanelOpen}>
        <SheetContent side="left" className="w-sz-260 p-0 nav:hidden">
          <AccountNavigator onNavigate={() => setLeftPanelOpen(false)} />
        </SheetContent>
      </Sheet>
    </div>
  )
}
