import { houseLayout, houseSurfaces, houseTypography } from '@/lib/house-style'
import { cn } from '@/lib/utils'

export function ImpactPage() {
  return (
    <section data-house-role="page" className="space-y-4">
      <header data-house-role="page-header" className={cn(houseLayout.pageHeader, houseSurfaces.leftBorder, houseSurfaces.leftBorderResearch)}>
        <h1 data-house-role="page-title" className={houseTypography.title}>Impact</h1>
        <p data-house-role="page-subtitle" className={houseTypography.subtitle}>
          This page has been cleared. Add impact content here when ready.
        </p>
      </header>
    </section>
  )
}
