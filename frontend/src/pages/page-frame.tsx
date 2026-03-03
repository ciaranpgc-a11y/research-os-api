import type { ReactNode } from 'react'
import { useLocation } from 'react-router-dom'

import { PageHeader, Row, Stack } from '@/components/primitives'
import { PanelShell, SectionMarker } from '@/components/patterns'
import { getSectionMarkerTone, resolveSectionTone, type HouseSectionTone } from '@/lib/section-tone'

type PageFrameProps = {
  title?: string
  description?: string
  tone?: HouseSectionTone
  hideScaffoldHeader?: boolean
  children?: ReactNode
}

export function PageFrame({ title, description = '', tone, hideScaffoldHeader = false, children }: PageFrameProps) {
  const location = useLocation()
  const resolvedTone = tone ?? resolveSectionTone(location.pathname)

  return (
    <Stack data-house-role="page" space="lg">
      {!hideScaffoldHeader ? (
        <Row align="center" gap="sm" wrap={false}>
          <SectionMarker tone={getSectionMarkerTone(resolvedTone)} size="header" />
          <PageHeader heading={title} description={description.trim().length > 0 ? description : undefined} />
        </Row>
      ) : null}

      {hideScaffoldHeader ? (
        children
      ) : (
        <PanelShell
          heading="Workspace scaffold"
          description="Interactive UI elements can be expanded here as backend features are connected."
        >
          {children}
        </PanelShell>
      )}
    </Stack>
  )
}
