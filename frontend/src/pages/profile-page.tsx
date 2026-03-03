import { PageHeader, Row, Stack } from '@/components/primitives'
import { SectionMarker } from '@/components/patterns'
import { getSectionMarkerTone } from '@/lib/section-tone'
import { PageFrame } from '@/pages/page-frame'

export function ProfilePage() {
  return (
    <PageFrame tone="profile" hideScaffoldHeader>
      <Stack space="lg">
        <Row
          align="center"
          gap="md"
          wrap={false}
          className="house-page-title-row"
        >
          <SectionMarker tone={getSectionMarkerTone('profile')} size="title" className="self-stretch h-auto" />
          <PageHeader
            heading="Profile home"
            description="Your research identity and professional profile."
            className="!ml-0 !mt-0"
          />
        </Row>

        <section data-house-role="section-content" className="space-y-4">
          <p className="m-0 text-body text-[hsl(var(--muted-foreground))]">
            Profile dashboard content will appear here.
          </p>
        </section>
      </Stack>
    </PageFrame>
  )
}
