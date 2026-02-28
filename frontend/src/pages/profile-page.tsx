import { houseLayout, houseSurfaces, houseTypography } from '@/lib/house-style'
import { cn } from '@/lib/utils'

export function ProfilePage() {
  return (
    <section data-house-role="page" className="space-y-4">
      <header
        data-house-role="page-header"
        className={cn(houseLayout.pageHeader, houseSurfaces.leftBorder, houseSurfaces.leftBorderProfile)}
      >
        <h1 data-house-role="page-title" className={houseTypography.title}>Profile home</h1>
      </header>
    </section>
  )
}
