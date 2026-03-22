import { useCallback, useEffect, useState } from 'react'
import { Outlet, useLocation } from 'react-router-dom'

import { CmrTopBar } from '@/components/layout/cmr-top-bar'
import { CmrReferenceNavigator } from '@/components/layout/cmr-reference-navigator'
import { ScrollArea } from '@/components/ui'
import { Sheet, SheetContent } from '@/components/ui'

export function CmrReferenceLayout() {
  const [leftPanelOpen, setLeftPanelOpen] = useState(false)
  const { pathname } = useLocation()
  const isAdminPage = pathname === '/cmr-admin'
  const [activeSection, setActiveSection] = useState<string | null>(() =>
    isAdminPage ? 'Overview' : null,
  )

  const variant = isAdminPage
    ? 'admin'
    : pathname.includes('database')
      ? 'database'
      : (pathname.includes('new-report')
        || pathname.includes('upload-report')
        || pathname.includes('rwma')
        || pathname.includes('lge')
        || pathname.includes('valves')
        || pathname.includes('lv-thrombus')
        || pathname.includes('cmr-ph'))
        ? 'report'
        : 'reference'

  useEffect(() => {
    setActiveSection(isAdminPage ? 'Overview' : null)
  }, [isAdminPage])

  const handleSectionJump = useCallback((key: string) => {
    setActiveSection(key)
    // Scroll the section into view in the main content area
    const el = document.querySelector(`[data-section-key="${key}"]`)
    if (el) {
      const viewport = el.closest('[data-radix-scroll-area-viewport]')
      if (viewport) {
        viewport.scrollTo({ top: (el as HTMLElement).offsetTop - 80, behavior: 'smooth' })
      } else {
        el.scrollIntoView({ behavior: 'smooth', block: 'start' })
      }
    }
  }, [])

  return (
    <div data-house-scope="cmr" data-house-role="cmr-shell" className="flex h-screen flex-col bg-background text-foreground">
      <CmrTopBar onOpenLeftNav={() => setLeftPanelOpen(true)} />

      <div
        data-house-role="cmr-grid"
        className="grid min-h-0 flex-1 grid-cols-1 nav:grid-cols-[var(--layout-left-nav-width)_minmax(0,1fr)]"
      >
        <aside data-house-role="left-nav-panel" className="hidden border-r border-border nav:block">
          <CmrReferenceNavigator
            activeSection={activeSection}
            onSectionJump={handleSectionJump}
            variant={variant}
          />
        </aside>

        <main data-house-role="content-main" className="min-w-0 overflow-hidden bg-background">
          <ScrollArea className="h-full">
            <div
              data-house-role="content-container"
              className="house-content-container house-content-container-wide"
            >
              <Outlet />
            </div>
          </ScrollArea>
        </main>
      </div>

      <Sheet open={leftPanelOpen} onOpenChange={setLeftPanelOpen}>
        <SheetContent side="left" className="w-[var(--layout-left-nav-width-mobile)] p-0 nav:hidden">
          <CmrReferenceNavigator
            activeSection={activeSection}
            onSectionJump={handleSectionJump}
            onNavigate={() => setLeftPanelOpen(false)}
            variant={variant}
          />
        </SheetContent>
      </Sheet>
    </div>
  )
}
