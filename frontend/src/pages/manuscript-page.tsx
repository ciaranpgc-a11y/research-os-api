import { useEffect, useMemo, useState } from 'react'
import { Check, ExternalLink, Loader2, Search } from 'lucide-react'
import { useParams } from 'react-router-dom'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Separator } from '@/components/ui/separator'
import { Sheet, SheetContent } from '@/components/ui/sheet'
import {
  exportClaimCitations,
  fetchCitationLibrary,
  fetchClaimCitations,
  updateClaimCitations,
} from '@/lib/citation-api'
import { manuscriptParagraphs } from '@/mock/manuscript'
import { PageFrame } from '@/pages/page-frame'
import { useAaweStore } from '@/store/use-aawe-store'
import type { ClaimCitationState } from '@/types/citation'
import type { ManuscriptParagraph, ManuscriptSectionSlug } from '@/types/selection'

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
  const searchQuery = useAaweStore((state) => state.searchQuery)
  const [citationSheetOpen, setCitationSheetOpen] = useState(false)
  const [activeClaim, setActiveClaim] = useState<ManuscriptParagraph | null>(null)
  const [claimCitationState, setClaimCitationState] = useState<ClaimCitationState | null>(null)
  const [claimCitationById, setClaimCitationById] = useState<Record<string, ClaimCitationState>>({})
  const [citationLibraryQuery, setCitationLibraryQuery] = useState('')
  const [citationLibrary, setCitationLibrary] = useState<ClaimCitationState['attached_citations']>([])
  const [loadingClaimCitations, setLoadingClaimCitations] = useState(false)
  const [loadingCitationLibrary, setLoadingCitationLibrary] = useState(false)
  const [savingClaimCitations, setSavingClaimCitations] = useState(false)
  const [exportingClaimCitations, setExportingClaimCitations] = useState(false)
  const [citationStatus, setCitationStatus] = useState('')
  const [citationError, setCitationError] = useState('')

  const sectionSlug = normalizeSection(section)
  const sectionTitle = sectionDisplayNames[sectionSlug]
  const sectionParagraphs = useMemo(
    () => manuscriptParagraphs.filter((paragraph) => paragraph.section === sectionSlug),
    [sectionSlug],
  )
  const normalizedQuery = searchQuery.trim().toLowerCase()
  const paragraphs = useMemo(() => {
    if (!normalizedQuery) {
      return sectionParagraphs
    }
    return sectionParagraphs.filter((paragraph) => {
      const text = [
        paragraph.id,
        paragraph.heading,
        paragraph.tag,
        paragraph.text,
        ...paragraph.suggestedCitations,
        ...paragraph.evidenceAnchors.map((anchor) => `${anchor.id} ${anchor.label} ${anchor.source}`),
      ]
        .join(' ')
        .toLowerCase()
      return text.includes(normalizedQuery)
    })
  }, [normalizedQuery, sectionParagraphs])

  useEffect(() => {
    let cancelled = false

    const loadSectionCitationState = async () => {
      if (sectionParagraphs.length === 0) {
        return
      }
      const stateEntries = await Promise.all(
        sectionParagraphs.map(async (paragraph) => {
          try {
            const state = await fetchClaimCitations(paragraph.id, paragraph.citationSlots)
            return [paragraph.id, state] as const
          } catch {
            return [paragraph.id, null] as const
          }
        }),
      )
      if (cancelled) {
        return
      }
      setClaimCitationById((current) => {
        const next = { ...current }
        stateEntries.forEach(([claimId, state]) => {
          if (state) {
            next[claimId] = state
          }
        })
        return next
      })
    }

    void loadSectionCitationState()

    return () => {
      cancelled = true
    }
  }, [sectionParagraphs])

  useEffect(() => {
    if (!citationSheetOpen) {
      return
    }
    let cancelled = false
    const timer = window.setTimeout(async () => {
      setLoadingCitationLibrary(true)
      try {
        const library = await fetchCitationLibrary(citationLibraryQuery, 100)
        if (!cancelled) {
          setCitationLibrary(library)
        }
      } catch (error) {
        if (!cancelled) {
          setCitationError(error instanceof Error ? error.message : 'Could not load citation records.')
        }
      } finally {
        if (!cancelled) {
          setLoadingCitationLibrary(false)
        }
      }
    }, 200)

    return () => {
      cancelled = true
      window.clearTimeout(timer)
    }
  }, [citationLibraryQuery, citationSheetOpen])

  const openCitationManager = async (paragraph: ManuscriptParagraph) => {
    setSelectedItem({ type: 'claim', data: paragraph })
    setActiveClaim(paragraph)
    setCitationSheetOpen(true)
    setCitationStatus('')
    setCitationError('')
    setCitationLibraryQuery('')
    setClaimCitationState(claimCitationById[paragraph.id] ?? null)
    setLoadingClaimCitations(true)
    try {
      const state = await fetchClaimCitations(paragraph.id, paragraph.citationSlots)
      setClaimCitationState(state)
      setClaimCitationById((current) => ({ ...current, [paragraph.id]: state }))
    } catch (error) {
      setCitationError(error instanceof Error ? error.message : 'Could not load claim citations.')
    } finally {
      setLoadingClaimCitations(false)
    }
  }

  const persistClaimCitations = async (citationIds: string[]) => {
    if (!activeClaim) {
      return
    }
    setSavingClaimCitations(true)
    setCitationError('')
    setCitationStatus('')
    try {
      const nextState = await updateClaimCitations(activeClaim.id, citationIds, activeClaim.citationSlots)
      setClaimCitationState(nextState)
      setClaimCitationById((current) => ({ ...current, [activeClaim.id]: nextState }))
      setCitationStatus(`Saved ${nextState.attached_citation_ids.length} attached citation(s).`)
      if (selectedItem?.type === 'claim' && selectedItem.data.id === activeClaim.id) {
        setSelectedItem({
          type: 'claim',
          data: {
            ...selectedItem.data,
            suggestedCitations: nextState.attached_citations.map((record) => record.citation_text),
          },
        })
      }
    } catch (error) {
      setCitationError(error instanceof Error ? error.message : 'Could not update claim citations.')
    } finally {
      setSavingClaimCitations(false)
    }
  }

  const onToggleCitation = (citationId: string) => {
    if (!claimCitationState) {
      return
    }
    const isAttached = claimCitationState.attached_citation_ids.includes(citationId)
    const nextCitationIds = isAttached
      ? claimCitationState.attached_citation_ids.filter((id) => id !== citationId)
      : [...claimCitationState.attached_citation_ids, citationId]
    void persistClaimCitations(nextCitationIds)
  }

  const onExportClaimCitations = async () => {
    if (!activeClaim) {
      return
    }
    setExportingClaimCitations(true)
    setCitationError('')
    setCitationStatus('')
    try {
      const payload = await exportClaimCitations(activeClaim.id)
      const blob = new Blob([payload.content], { type: 'text/plain;charset=utf-8' })
      const url = window.URL.createObjectURL(blob)
      const anchor = document.createElement('a')
      anchor.href = url
      anchor.download = payload.filename
      document.body.appendChild(anchor)
      anchor.click()
      anchor.remove()
      window.URL.revokeObjectURL(url)
      setCitationStatus(`Exported references for ${activeClaim.id}.`)
    } catch (error) {
      setCitationError(error instanceof Error ? error.message : 'Could not export claim references.')
    } finally {
      setExportingClaimCitations(false)
    }
  }

  const attachedCitationIds = new Set(claimCitationState?.attached_citation_ids ?? [])

  return (
    <>
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
              <CardTitle className="text-sm">
                {normalizedQuery ? 'No paragraph cards match search' : 'No paragraph cards yet'}
              </CardTitle>
              <CardDescription>
                {normalizedQuery
                  ? 'Try a different query or clear search to view all paragraph cards.'
                  : 'This section is scaffolded. Populate paragraph cards as drafting starts.'}
              </CardDescription>
            </CardHeader>
          </Card>
        ) : (
          <div className="space-y-3">
            {paragraphs.map((paragraph) => {
              const isActive = selectedItem?.type === 'claim' && selectedItem.data.id === paragraph.id
              const citationState = claimCitationById[paragraph.id]
              const attachedCount = citationState
                ? citationState.attached_citation_ids.length
                : Math.min(paragraph.suggestedCitations.length, paragraph.citationSlots)
              const missingCount = citationState
                ? citationState.missing_slots
                : Math.max(0, paragraph.citationSlots - attachedCount)
              return (
                <Card
                  key={paragraph.id}
                  className={`cursor-pointer transition-colors ${isActive ? 'border-primary/70 bg-primary/5' : ''}`}
                  onClick={() => setSelectedItem({ type: 'claim', data: paragraph })}
                >
                  <CardHeader className="space-y-2">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <CardTitle className="text-sm">{claimMapView ? `Claim Node ${paragraph.id}` : paragraph.heading}</CardTitle>
                      <div className="flex items-center gap-2">
                        <Badge variant="secondary">{paragraph.tag}</Badge>
                        {missingCount > 0 ? (
                          <Badge variant="outline" className="border-amber-500/60 text-amber-600">
                            {missingCount} missing citation slot{missingCount === 1 ? '' : 's'}
                          </Badge>
                        ) : (
                          <Badge variant="outline">Citation-complete</Badge>
                        )}
                      </div>
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
                        <p className="font-medium">
                          {attachedCount}/{paragraph.citationSlots}
                        </p>
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
                    <div className="flex flex-wrap items-center justify-between gap-3">
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
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={(event) => {
                          event.stopPropagation()
                          void openCitationManager(paragraph)
                        }}
                      >
                        Manage citations
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              )
            })}
          </div>
        )}
      </PageFrame>
      <Sheet open={citationSheetOpen} onOpenChange={setCitationSheetOpen}>
        <SheetContent side="right" className="w-full p-0 sm:max-w-[520px]">
          <div className="flex h-full flex-col">
            <div className="space-y-1 border-b border-border px-5 py-4 pr-11">
              <h3 className="text-sm font-semibold">Citation Manager</h3>
              <p className="text-xs text-muted-foreground">
                {activeClaim ? `${activeClaim.heading} (${activeClaim.id})` : 'Select a claim paragraph to edit citations.'}
              </p>
            </div>

            <div className="space-y-3 border-b border-border px-5 py-4">
              <div className="grid grid-cols-3 gap-2 text-xs">
                <Card className="border-border bg-muted/30">
                  <CardContent className="p-3">
                    <p className="text-muted-foreground">Required</p>
                    <p className="text-sm font-semibold">{activeClaim?.citationSlots ?? 0}</p>
                  </CardContent>
                </Card>
                <Card className="border-border bg-muted/30">
                  <CardContent className="p-3">
                    <p className="text-muted-foreground">Attached</p>
                    <p className="text-sm font-semibold">{claimCitationState?.attached_citation_ids.length ?? 0}</p>
                  </CardContent>
                </Card>
                <Card className="border-border bg-muted/30">
                  <CardContent className="p-3">
                    <p className="text-muted-foreground">Missing</p>
                    <p className="text-sm font-semibold">{claimCitationState?.missing_slots ?? 0}</p>
                  </CardContent>
                </Card>
              </div>
              <div className="flex items-center gap-2">
                <Search className="h-4 w-4 text-muted-foreground" />
                <Input
                  value={citationLibraryQuery}
                  onChange={(event) => setCitationLibraryQuery(event.target.value)}
                  placeholder="Search title, author, journal, DOI..."
                  disabled={!activeClaim}
                />
              </div>
              {citationStatus ? <p className="text-xs text-emerald-600">{citationStatus}</p> : null}
              {citationError ? <p className="text-xs text-destructive">{citationError}</p> : null}
            </div>

            <ScrollArea className="flex-1">
              <div className="space-y-3 px-5 py-4">
                {loadingClaimCitations ? (
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    Loading claim citation state...
                  </div>
                ) : null}
                {!loadingClaimCitations && claimCitationState ? (
                  <Card className="border-border bg-muted/20">
                    <CardHeader className="pb-2">
                      <CardTitle className="text-xs">Attached citations</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-2">
                      {claimCitationState.attached_citations.length === 0 ? (
                        <p className="text-xs text-muted-foreground">No citations attached yet.</p>
                      ) : (
                        claimCitationState.attached_citations.map((citation) => (
                          <div key={citation.id} className="rounded-md border border-border px-3 py-2 text-xs">
                            <p className="font-medium">{citation.id}</p>
                            <p className="text-muted-foreground">{citation.citation_text}</p>
                          </div>
                        ))
                      )}
                    </CardContent>
                  </Card>
                ) : null}

                <Separator />

                {loadingCitationLibrary ? (
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    Searching citation library...
                  </div>
                ) : citationLibrary.length === 0 ? (
                  <Card>
                    <CardHeader>
                      <CardTitle className="text-sm">No citation records found</CardTitle>
                      <CardDescription>Try a different query.</CardDescription>
                    </CardHeader>
                  </Card>
                ) : (
                  citationLibrary.map((citation) => {
                    const isAttached = attachedCitationIds.has(citation.id)
                    return (
                      <Card key={citation.id}>
                        <CardHeader className="space-y-1 pb-2">
                          <div className="flex items-start justify-between gap-2">
                            <CardTitle className="text-sm leading-snug">{citation.title}</CardTitle>
                            <Badge variant="outline">{citation.id}</Badge>
                          </div>
                          <CardDescription>
                            {citation.authors} | {citation.journal} {citation.year}
                          </CardDescription>
                        </CardHeader>
                        <CardContent className="space-y-2 text-xs">
                          <p className="rounded-md border border-border bg-muted/20 px-2 py-1">{citation.citation_text}</p>
                          <div className="flex flex-wrap items-center gap-2">
                            <Button
                              size="sm"
                              variant={isAttached ? 'secondary' : 'outline'}
                              disabled={!activeClaim || savingClaimCitations || loadingClaimCitations}
                              onClick={() => onToggleCitation(citation.id)}
                            >
                              {savingClaimCitations ? <Loader2 className="mr-1 h-3 w-3 animate-spin" /> : null}
                              {isAttached ? (
                                <>
                                  <Check className="mr-1 h-3 w-3" />
                                  Detach
                                </>
                              ) : (
                                'Attach'
                              )}
                            </Button>
                            {citation.url ? (
                              <Button asChild size="sm" variant="ghost">
                                <a href={citation.url} target="_blank" rel="noreferrer">
                                  <ExternalLink className="mr-1 h-3 w-3" />
                                  Source
                                </a>
                              </Button>
                            ) : null}
                          </div>
                        </CardContent>
                      </Card>
                    )
                  })
                )}
              </div>
            </ScrollArea>

            <div className="flex items-center justify-end gap-2 border-t border-border px-5 py-3">
              <Button
                variant="outline"
                size="sm"
                onClick={onExportClaimCitations}
                disabled={!activeClaim || exportingClaimCitations || loadingClaimCitations}
              >
                {exportingClaimCitations ? <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" /> : null}
                Export references
              </Button>
            </div>
          </div>
        </SheetContent>
      </Sheet>
    </>
  )
}
