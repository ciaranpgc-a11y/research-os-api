import { useNavigate, useParams } from 'react-router-dom'

import { PageHeader, Row, Section, Stack } from '@/components/primitives'
import { SectionMarker } from '@/components/patterns'
import { Button } from '@/components/ui'
import { houseLayout } from '@/lib/house-style'
import { getSectionMarkerTone } from '@/lib/section-tone'
import { PageFrame } from '@/pages/page-frame'

const HOUSE_SECTION_ANCHOR_CLASS = houseLayout.sectionAnchor

export function WorkspaceExportsPage() {
  const navigate = useNavigate()
  const params = useParams<{ workspaceId: string }>()
  const workspaceId = params.workspaceId || 'hf-registry'

  return (
    <PageFrame tone="workspace" hideScaffoldHeader>
      <Stack data-house-role="page" space="lg">
        <Row
          align="center"
          gap="md"
          wrap={false}
          className="house-page-title-row"
        >
          <SectionMarker tone={getSectionMarkerTone('workspace')} size="title" className="self-stretch h-auto" />
          <PageHeader
            heading="Exports"
            description="Package manuscript outputs and quality checks for submission workflows."
            className="!ml-0 !mt-0"
          />
        </Row>

        <Section className={`${HOUSE_SECTION_ANCHOR_CLASS} space-y-4`} surface="transparent" inset="none" spaceY="none">
          <div>
            <h2 data-house-role="section-title" className="house-section-title">Export checklist</h2>
            <p data-house-role="section-subtitle" className="house-section-subtitle mt-1">
              Run QC first, then export manuscript and supporting evidence.
            </p>
          </div>
          <Stack space="sm">
            <Button type="button" variant="outline" onClick={() => navigate(`/w/${workspaceId}/qc`)}>
              Open quality check
            </Button>
            <Button type="button" variant="outline" onClick={() => navigate(`/w/${workspaceId}/manuscript/introduction`)}>
              Open manuscript
            </Button>
            <Button type="button" variant="outline" onClick={() => navigate(`/w/${workspaceId}/run-wizard`)}>
              Open run wizard
            </Button>
          </Stack>
        </Section>
      </Stack>
    </PageFrame>
  )
}
