import { useMemo } from 'react'
import { useParams } from 'react-router-dom'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Separator } from '@/components/ui/separator'
import { manuscriptParagraphs } from '@/mock/manuscript'
import { PageFrame } from '@/pages/page-frame'
import { useAaweStore } from '@/store/use-aawe-store'
import type { ManuscriptSectionSlug } from '@/types/selection'

const sectionDisplayNames: Record<ManuscriptSectionSlug, string> = {
  title: 'Title',
  abstract: 'Abstract',
  introduction: 'Introduction',
  methods: 'Methods',
  results: 'Results',
  discussion: 'Discussion',
  limitations: 'Limitations',
  conclusion: 'Conclusion',
  figures: 'Figures',
  tables: 'Tables',
}

const validSections = new Set(Object.keys(sectionDisplayNames))

function normalizeSection(sectionParam: string | undefined): ManuscriptSectionSlug {
  if (!sectionParam) {
    return 'introduction'
  }
  if (validSections.has(sectionParam)) {
    return sectionParam as ManuscriptSectionSlug
  }
  return 'introduction'
}

export function ManuscriptPage() {
  const { section } = useParams<{ section: string }>()
  const selectedItem = useAaweStore((state) => state.selectedItem)
  const setSelectedItem = useAaweStore((state) => state.setSelectedItem)
  const claimMapView = useAaweStore((state) => state.claimMapView)
  const toggleClaimMapView = useAaweStore((state) => state.toggleClaimMapView)

  const sectionSlug = normalizeSection(section)
  const sectionTitle = sectionDisplayNames[sectionSlug]
  const paragraphs = useMemo(
    () => manuscriptParagraphs.filter((paragraph) => paragraph.section === sectionSlug),
    [sectionSlug],
  )

  return (
    <PageFrame
      title={`Manuscript - ${sectionTitle}`}
      description="Paragraph cards preserve evidence anchoring and integrity checks at sentence-level granularity."
    >
      <div className="flex items-center justify-between rounded-md border border-border bg-muted/40 p-3">
        <div>
          <p className="text-sm font-medium">Paragraph Cards</p>
          <p className="text-xs text-muted-foreground">
            Click a card to inspect evidence and citation metadata in the Insight panel.
          </p>
        </div>
        <Button variant={claimMapView ? 'default' : 'outline'} size="sm" onClick={toggleClaimMapView}>
          {claimMapView ? 'Claim Map View On' : 'Claim Map View Off'}
        </Button>
      </div>

      {paragraphs.length === 0 ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">No paragraph cards yet</CardTitle>
            <CardDescription>
              This section is scaffolded. Populate paragraph cards as drafting starts.
            </CardDescription>
          </CardHeader>
        </Card>
      ) : (
        <div className="space-y-3">
          {paragraphs.map((paragraph) => {
            const isActive = selectedItem?.type === 'claim' && selectedItem.data.id === paragraph.id
            return (
              <Card
                key={paragraph.id}
                className={`cursor-pointer transition-colors ${isActive ? 'border-primary/70 bg-primary/5' : ''}`}
                onClick={() => setSelectedItem({ type: 'claim', data: paragraph })}
              >
                <CardHeader className="space-y-2">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <CardTitle className="text-sm">{claimMapView ? `Claim Node ${paragraph.id}` : paragraph.heading}</CardTitle>
                    <Badge variant="secondary">{paragraph.tag}</Badge>
                  </div>
                  <CardDescription>{claimMapView ? 'Mapped claim statement' : paragraph.text}</CardDescription>
                </CardHeader>
                <CardContent className="space-y-3 text-xs">
                  <div className="grid gap-2 md:grid-cols-4">
                    <div>
                      <p className="text-muted-foreground">Word target</p>
                      <p className="font-medium">{paragraph.wordTarget}</p>
                    </div>
                    <div>
                      <p className="text-muted-foreground">Evidence anchors</p>
                      <p className="font-medium">{paragraph.evidenceAnchors.length}</p>
                    </div>
                    <div>
                      <p className="text-muted-foreground">Citation slots</p>
                      <p className="font-medium">{paragraph.citationSlots}</p>
                    </div>
                    <div>
                      <p className="text-muted-foreground">Claim strength</p>
                      <div className="mt-1 h-2 w-full rounded-full bg-muted">
                        <div
                          className="h-2 rounded-full bg-primary transition-all"
                          style={{ width: `${paragraph.claimStrength}%` }}
                        />
                      </div>
                    </div>
                  </div>
                  <Separator />
                  <div>
                    <p className="mb-1 text-muted-foreground">Evidence anchors</p>
                    <div className="flex flex-wrap gap-1">
                      {paragraph.evidenceAnchors.map((anchor) => (
                        <Badge key={anchor.id} variant="outline">
                          {claimMapView ? anchor.id : anchor.label}
                        </Badge>
                      ))}
                    </div>
                  </div>
                </CardContent>
              </Card>
            )
          })}
        </div>
      )}
    </PageFrame>
  )
}
