import type { ReactNode } from 'react'

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { houseTypography } from '@/lib/house-style'

type PageFrameProps = {
  title: string
  description: string
  children?: ReactNode
}

export function PageFrame({ title, description, children }: PageFrameProps) {
  return (
    <section data-house-role="page" className="space-y-4">
      <header data-house-role="page-header" className="space-y-1">
        <h1 data-house-role="page-title" className={houseTypography.title}>{title}</h1>
        <p data-house-role="page-subtitle" className={houseTypography.subtitle}>{description}</p>
      </header>
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
