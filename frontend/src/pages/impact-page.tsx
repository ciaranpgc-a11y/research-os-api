import { PageHeader, Row } from '@/components/primitives'
import { SectionMarker } from '@/components/patterns'
import { getSectionMarkerTone } from '@/lib/section-tone'
import { PageFrame } from '@/pages/page-frame'

export function ImpactPage() {
  return (
    <PageFrame tone="research" hideScaffoldHeader>
      <Row
        align="center"
        gap="md"
        wrap={false}
        className="house-page-title-row"
      >
        <SectionMarker tone={getSectionMarkerTone('research')} size="title" className="self-stretch h-auto" />
        <PageHeader
          heading="Impact"
          description="Discover the reach and real-world influence of your research."
          className="!ml-0 !mt-0"
        />
      </Row>
    </PageFrame>
  )
}
