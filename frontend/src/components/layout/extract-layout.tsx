import { Outlet, useLocation } from 'react-router-dom'

import { ExtractTopBar } from '@/components/layout/extract-top-bar'
import { ScrollArea } from '@/components/ui'

export function ExtractLayout() {
  const { pathname } = useLocation()
  // Patient detail pages have their own internal sidebar layout and need full bleed
  const isFullBleed = pathname.startsWith('/extract-patient/') || pathname === '/extract-cohort'

  return (
    <div data-house-scope="extract" data-house-role="extract-shell" className="flex h-screen flex-col bg-background text-foreground">
      <ExtractTopBar />

      {isFullBleed ? (
        <div data-house-role="content-main" className="min-w-0 flex-1 overflow-hidden bg-background">
          <Outlet />
        </div>
      ) : (
        <main data-house-role="content-main" className="min-w-0 flex-1 overflow-hidden bg-background">
          <ScrollArea className="h-full">
            <div
              data-house-role="content-container"
              className="house-content-container house-content-container-wide"
            >
              <Outlet />
            </div>
          </ScrollArea>
        </main>
      )}
    </div>
  )
}
