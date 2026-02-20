import { Check, Loader2, RefreshCcw } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { fetchManuscript, generateGroundedDraft, updateManuscriptSections } from '@/lib/study-core-api'
import { manuscriptParagraphs } from '@/mock/manuscript'
import type { ClaimLinkSuggestion } from '@/types/study-core'

type RunContext = { projectId: string; manuscriptId: string } | null

type StepDraftReviewProps = {
  runContext: RunContext
  selectedSections: string[]
  generationBrief: string
  styleProfile: 'technical' | 'concise' | 'narrative_review'
  draftsBySection: Record<string, string>
  acceptedSectionKeys: string[]
  links: ClaimLinkSuggestion[]
  onStyleProfileChange: (value: 'technical' | 'concise' | 'narrative_review') => void
  onDraftChange: (section: string, draft: string) => void
  onSectionAccepted: (section: string) => void
  onStatus: (message: string) => void
  onError: (message: string) => void
}

function labelForSection(section: string): string {
  return section
    .split('_')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ')
}

function evidenceCountForSection(section: string, links: ClaimLinkSuggestion[]): number {
  const claimIds = manuscriptParagraphs
    .filter((paragraph) => paragraph.section === section)
    .map((paragraph) => paragraph.id)
  return links.filter((link) => claimIds.includes(link.claim_id)).length
}

export function StepDraftReview({
  runContext,
  selectedSections,
  generationBrief,
  styleProfile,
  draftsBySection,
  acceptedSectionKeys,
  links,
  onStyleProfileChange,
  onDraftChange,
  onSectionAccepted,
  onStatus,
  onError,
}: StepDraftReviewProps) {
  const sections = useMemo(() => (selectedSections.length > 0 ? selectedSections : ['introduction', 'methods', 'results', 'discussion']), [selectedSections])
  const [activeSection, setActiveSection] = useState(sections[0] ?? 'introduction')
  const [busySection, setBusySection] = useState<string>('')

  useEffect(() => {
    if (!sections.includes(activeSection)) {
      setActiveSection(sections[0] ?? 'introduction')
    }
  }, [activeSection, sections])

  useEffect(() => {
    if (!runContext) {
      return
    }
    const missingSection = sections.find((section) => !draftsBySection[section]?.trim())
    if (!missingSection) {
      return
    }
    void fetchManuscript(runContext.projectId, runContext.manuscriptId)
      .then((payload) => {
        for (const section of sections) {
          const sectionText = payload.sections[section]
          if (typeof sectionText === 'string' && sectionText.trim()) {
            onDraftChange(section, sectionText)
          }
        }
      })
      .catch(() => {
        // Keep silent here to avoid noisy toast loops on initial hydration.
      })
  }, [draftsBySection, onDraftChange, runContext, sections])

  const onRegenerateSection = async (section: string) => {
    if (!runContext) {
      onError('Context must be saved before regenerating a section.')
      return
    }
    setBusySection(section)
    onError('')
    try {
      const payload = await generateGroundedDraft({
        section,
        notesContext: generationBrief,
        styleProfile,
        generationMode: 'full',
        planObjective: null,
        mustInclude: [],
        evidenceLinks: links
          .filter((item) => evidenceCountForSection(section, [item]) > 0)
          .map((item) => ({
            claim_id: item.claim_id,
            claim_heading: item.claim_heading,
            result_id: item.result_id,
            confidence: item.confidence,
            rationale: item.rationale,
            suggested_anchor_label: item.suggested_anchor_label,
          })),
        targetInstruction: null,
        lockedText: draftsBySection[section] || null,
        persistToManuscript: true,
        projectId: runContext.projectId,
        manuscriptId: runContext.manuscriptId,
      })
      onDraftChange(section, payload.draft)
      onStatus(`Regenerated ${section} draft.`)
    } catch (error) {
      onError(error instanceof Error ? error.message : `Could not regenerate ${section}.`)
    } finally {
      setBusySection('')
    }
  }

  const onAcceptSection = async (section: string) => {
    if (!runContext) {
      onError('Context must be saved before accepting drafts.')
      return
    }
    const draft = draftsBySection[section] || ''
    if (!draft.trim()) {
      onError('Draft text is empty; regenerate before accepting.')
      return
    }
    setBusySection(section)
    onError('')
    try {
      await updateManuscriptSections({
        projectId: runContext.projectId,
        manuscriptId: runContext.manuscriptId,
        sections: { [section]: draft },
      })
      onSectionAccepted(section)
      onStatus(`Accepted ${section} into manuscript.`)
    } catch (error) {
      onError(error instanceof Error ? error.message : `Could not accept ${section}.`)
    } finally {
      setBusySection('')
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Step 4: Draft Review</CardTitle>
        <CardDescription>Review each generated section, accept what is ready, or regenerate sections as needed.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-sm text-muted-foreground">Open each section tab, confirm quality, and accept the sections you want in the manuscript.</p>

        <div className="flex flex-wrap items-center gap-2">
          <label className="text-xs font-medium text-muted-foreground">Style</label>
          <select
            className="h-9 rounded-md border border-border bg-background px-3 text-sm"
            value={styleProfile}
            onChange={(event) => onStyleProfileChange(event.target.value as 'technical' | 'concise' | 'narrative_review')}
          >
            <option value="technical">technical</option>
            <option value="narrative_review">clinical</option>
            <option value="concise">concise</option>
          </select>
          <Badge variant="outline">Accepted sections: {acceptedSectionKeys.length}</Badge>
        </div>

        <Tabs value={activeSection} onValueChange={setActiveSection}>
          <TabsList className="h-auto flex-wrap bg-muted/70 p-1">
            {sections.map((section) => (
              <TabsTrigger key={section} value={section} className="mb-1">
                {labelForSection(section)}
              </TabsTrigger>
            ))}
          </TabsList>

          {sections.map((section) => {
            const evidenceCount = evidenceCountForSection(section, links)
            const isAccepted = acceptedSectionKeys.includes(section)
            return (
              <TabsContent key={section} value={section} className="space-y-2">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge variant={isAccepted ? 'default' : 'outline'}>
                      {isAccepted ? 'Accepted' : 'Pending'}
                    </Badge>
                    <Badge variant="secondary">Evidence links: {evidenceCount}</Badge>
                  </div>
                  <div className="flex gap-2">
                    <Button size="sm" variant="outline" onClick={() => void onRegenerateSection(section)} disabled={busySection === section}>
                      {busySection === section ? <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" /> : <RefreshCcw className="mr-1 h-3.5 w-3.5" />}
                      Regenerate section
                    </Button>
                    <Button size="sm" onClick={() => void onAcceptSection(section)} disabled={busySection === section}>
                      {busySection === section ? <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" /> : <Check className="mr-1 h-3.5 w-3.5" />}
                      Accept to manuscript
                    </Button>
                  </div>
                </div>
                <textarea
                  className="min-h-60 w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
                  value={draftsBySection[section] ?? ''}
                  onChange={(event) => onDraftChange(section, event.target.value)}
                />
              </TabsContent>
            )
          })}
        </Tabs>
      </CardContent>
    </Card>
  )
}
