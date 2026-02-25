import type { ReactNode } from 'react'
import { useLocation } from 'react-router-dom'

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { houseDividers, houseLayout, houseSurfaces, houseTypography } from '@/lib/house-style'
import { getHouseLeftBorderToneClass, resolveSectionTone, type HouseSectionTone } from '@/lib/section-tone'
import { cn } from '@/lib/utils'

type PageFrameProps = {
  title: string
  description: string
  tone?: HouseSectionTone
  children?: ReactNode
}

export function PageFrame({ title, description, tone, children }: PageFrameProps) {
  const location = useLocation()
  const resolvedTone = tone ?? resolveSectionTone(location.pathname)

  return (
    <section data-house-role="page" className="space-y-4">
      <header
        data-house-role="page-header"
        className={cn(houseLayout.pageHeader, houseSurfaces.leftBorder, getHouseLeftBorderToneClass(resolvedTone))}
      >
        <h1 data-house-role="page-title" className={houseTypography.title}>{title}</h1>
        <p data-house-role="page-subtitle" className={houseTypography.subtitle}>{description}</p>
      </header>
      <div data-house-role="section-divider" className={houseDividers.strong} />
      <Card data-house-role="page-card">
        <CardHeader>
          <CardTitle data-house-role="section-title">Workspace scaffold</CardTitle>
          <CardDescription data-house-role="section-subtitle">
            Interactive UI elements can be expanded here as backend features are connected.
          </CardDescription>
        </CardHeader>
        <CardContent data-house-role="page-content">{children}</CardContent>
      </Card>
    </section>
  )
}
