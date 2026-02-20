import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { AlertTriangle, BookOpen, FlaskConical, Loader2, ShieldCheck } from 'lucide-react'
import { useLocation } from 'react-router-dom'

import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Separator } from '@/components/ui/separator'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { API_BASE_URL } from '@/lib/api'
import { useAaweStore } from '@/store/use-aawe-store'
import { useStudyCoreWizardStore } from '@/store/use-study-core-wizard-store'
import type { ApiErrorPayload, SelectionInsight } from '@/types/insight'
import type { SelectionItem } from '@/types/selection'
import type { OutlinePlanState } from '@/types/study-core'

type InsightTarget = {
  selectionType: 'claim' | 'result' | 'qc'
  itemId: string
}

type SectionOutline = {
  name: string
  bullets: string[]
}

const CORE_SECTIONS = ['introduction', 'methods', 'results', 'discussion']
const STOP_WORDS = new Set([
  'the',
  'and',
  'for',
  'with',
  'from',
  'that',
  'this',
  'into',
  'over',
  'under',
  'between',
  'using',
  'study',
  'research',
  'objective',
  'question',
  'primary',
  'data',
  'source',
  'or',
  'of',
  'to',
  'in',
  'a',
  'an',
])

function EmptyState() {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm">No active selection</CardTitle>
        <CardDescription>Click a sentence or result to inspect.</CardDescription>
      </CardHeader>
      <CardContent className="text-xs text-muted-foreground">
        Evidence links, derivation metadata, QC checks, and citation cues will appear here.
      </CardContent>
    </Card>
  )
}

function DiagnosticCard({
  title,
  description,
  children,
}: {
  title: string
  description: string
  children: ReactNode
}) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm">{title}</CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-2 text-xs">{children}</CardContent>
    </Card>
  )
}

function getInsightTarget(selection: SelectionItem): InsightTarget | null {
  if (!selection) {
    return null
  }
  if (selection.type === 'claim') {
    return { selectionType: 'claim', itemId: selection.data.id }
  }
  if (selection.type === 'result') {
    return { selectionType: 'result', itemId: selection.data.id }
  }
  return { selectionType: 'qc', itemId: selection.data.id }
}

function buildFallbackInsight(selection: SelectionItem): SelectionInsight | null {
  if (!selection) {
    return null
  }

  if (selection.type === 'claim') {
    return {
      selection_type: 'claim',
      item_id: selection.data.id,
      title: selection.data.heading,
      summary: selection.data.text,
      evidence: selection.data.evidenceAnchors.map((anchor) => ({
        id: anchor.id,
        label: anchor.label,
        source: anchor.source,
        confidence: anchor.confidence,
      })),
      qc: [
        `Claim strength ${selection.data.claimStrength}%`,
        `${selection.data.citationSlots} citation slots currently configured.`,
      ],
      derivation: {
        dataset: 'Local manuscript state',
        population_filter: `Section ${selection.data.section}`,
        model: `${selection.data.tag} claim composition`,
        covariates: [],
        validation_checks: [`${selection.data.evidenceAnchors.length} evidence anchors linked`],
        notes: [`Word target ${selection.data.wordTarget}`],
      },
      citations: selection.data.suggestedCitations,
    }
  }

  if (selection.type === 'result') {
    return {
      selection_type: 'result',
      item_id: selection.data.id,
      title: `${selection.data.type} ${selection.data.id}`,
      summary: `${selection.data.effect} (${selection.data.ci})`,
      evidence: [
        {
          id: selection.data.id,
          label: 'Result object',
          source: selection.data.model,
          confidence: selection.data.validated ? 'High' : 'Moderate',
        },
      ],
      qc: [
        `Adjusted: ${selection.data.adjusted ? 'Yes' : 'No'}`,
        `Validated: ${selection.data.validated ? 'Yes' : 'No'}`,
      ],
      derivation: {
        dataset: selection.data.derivation.dataset,
        population_filter: selection.data.derivation.populationFilter,
        model: selection.data.derivation.estimation,
        covariates: selection.data.derivation.covariates,
        validation_checks: selection.data.derivation.validationChecks,
        notes: [],
      },
      citations: selection.data.citations,
    }
  }

  return {
    selection_type: 'qc',
    item_id: selection.data.id,
    title: selection.data.category,
    summary: selection.data.summary,
    evidence: [
      {
        id: selection.data.id,
        label: 'QC finding',
        source: selection.data.category,
        confidence: selection.data.severity,
      },
    ],
    qc: [
      `${selection.data.count} findings detected.`,
      selection.data.recommendation,
    ],
    derivation: {
      dataset: 'Local QC item',
      population_filter: selection.data.affectedItems.join(', ') || 'N/A',
      model: 'Rule-based QC card',
      covariates: [],
      validation_checks: [],
      notes: [],
    },
    citations: selection.data.referenceGuidelines,
  }
}

function renderEvidence(insight: SelectionInsight | null) {
  if (!insight) {
    return <EmptyState />
  }
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm">{insight.title}</CardTitle>
        <CardDescription>{insight.summary}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {insight.evidence.map((evidence) => (
          <div key={evidence.id} className="space-y-1 rounded-md border border-border p-2">
            <p className="text-xs font-medium">{evidence.label}</p>
            <p className="text-xs text-muted-foreground">{evidence.source}</p>
            {evidence.confidence && <Badge variant="secondary">{evidence.confidence} confidence</Badge>}
          </div>
        ))}
      </CardContent>
    </Card>
  )
}

function renderQc(insight: SelectionInsight | null) {
  if (!insight) {
    return <EmptyState />
  }
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm">QC Perspective</CardTitle>
        <CardDescription>{insight.title}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-2 text-xs">
        {insight.qc.length === 0 ? (
          <p className="text-muted-foreground">No QC notes available for this selection.</p>
        ) : (
          insight.qc.map((item) => (
            <div key={item} className="rounded-md border border-border px-2 py-1">
              {item}
            </div>
          ))
        )}
      </CardContent>
    </Card>
  )
}

function renderDerivation(insight: SelectionInsight | null) {
  if (!insight) {
    return <EmptyState />
  }
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm">Derivation Trace</CardTitle>
        <CardDescription>{insight.item_id}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-2 text-xs">
        <p>Dataset: {insight.derivation.dataset}</p>
        <p>Population: {insight.derivation.population_filter}</p>
        <p>Model: {insight.derivation.model}</p>
        {insight.derivation.covariates.length > 0 && <p>Covariates: {insight.derivation.covariates.join(', ')}</p>}
        {insight.derivation.validation_checks.length > 0 && (
          <p>Validation: {insight.derivation.validation_checks.join('; ')}</p>
        )}
      </CardContent>
    </Card>
  )
}

function renderCitations(insight: SelectionInsight | null) {
  if (!insight) {
    return <EmptyState />
  }
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm">Citation Guidance</CardTitle>
        <CardDescription>Context-aware references for the selected item.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-2">
        {insight.citations.length === 0 ? (
          <p className="text-xs text-muted-foreground">No citations available for this selection.</p>
        ) : (
          insight.citations.map((citation) => (
            <div key={citation} className="rounded-md border border-border px-2 py-1 text-xs">
              {citation}
            </div>
          ))
        )}
      </CardContent>
    </Card>
  )
}

function toTitleCaseSection(section: string): string {
  return section
    .split('_')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ')
}

function normaliseBullet(text: string): string {
  return text.toLowerCase().replace(/\s+/g, ' ').trim()
}

function tokenise(text: string): Set<string> {
  return new Set(
    text
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, ' ')
      .split(/\s+/)
      .filter((token) => token.length > 2),
  )
}

function extractObjectiveKeywords(objective: string): string[] {
  return objective
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter((token) => token.length > 3 && !STOP_WORDS.has(token))
}

function jaccardSimilarity(left: Set<string>, right: Set<string>): number {
  if (left.size === 0 || right.size === 0) {
    return 0
  }
  const intersection = [...left].filter((token) => right.has(token)).length
  const union = new Set([...left, ...right]).size
  return union === 0 ? 0 : intersection / union
}

function buildSectionOutlines(selectedSections: string[], outlinePlan: OutlinePlanState | null): SectionOutline[] {
  const byName = new Map(
    (outlinePlan?.sections ?? []).map((section) => [section.name.toLowerCase(), section]),
  )
  return selectedSections.map((name) => {
    const fromPlan = byName.get(name.toLowerCase())
    return {
      name,
      bullets: (fromPlan?.bullets ?? []).map((bullet) => bullet.trim()).filter(Boolean),
    }
  })
}

function renderStepOneIntelligence(researchObjective: string, selectedSections: string[], requiredReady: boolean) {
  const objectiveKeywords = extractObjectiveKeywords(researchObjective)
  return (
    <div className="space-y-3">
      <DiagnosticCard title="Frame readiness" description="Checks whether Step 1 has enough structure for planning.">
        <p>{requiredReady ? 'Ready to plan.' : 'Complete title, objective, and study type to proceed.'}</p>
      </DiagnosticCard>
      <DiagnosticCard title="Objective signal" description="Keyword density from the current research objective.">
        <p>{objectiveKeywords.length} objective keyword(s) detected.</p>
        <p className="text-muted-foreground">{objectiveKeywords.slice(0, 8).join(', ') || 'No objective keywords detected yet.'}</p>
      </DiagnosticCard>
      <DiagnosticCard title="Section setup" description="Current section selection for upcoming planning.">
        <p>{selectedSections.length} section(s) currently selected.</p>
      </DiagnosticCard>
    </div>
  )
}

function renderStepThreeIntelligence({
  selectedSections,
  planBuilt,
  jobStatus,
}: {
  selectedSections: string[]
  planBuilt: boolean
  jobStatus: 'idle' | 'running' | 'succeeded' | 'failed'
}) {
  return (
    <div className="space-y-3">
      <DiagnosticCard title="Run prerequisites" description="Generation prerequisites before launching or retrying runs.">
        <p>Plan status: {planBuilt ? 'Built' : 'Not built'}</p>
        <p>Selected sections: {selectedSections.length}</p>
      </DiagnosticCard>
      <DiagnosticCard title="Job monitor" description="Current generation job state from the wizard store.">
        <p>Status: {jobStatus}</p>
        <p className="text-muted-foreground">
          {jobStatus === 'running' ? 'Generation is active.' : 'No active generation process.'}
        </p>
      </DiagnosticCard>
    </div>
  )
}

function renderStepTwoPlanIntelligence({
  selectedSections,
  outlinePlan,
  researchObjective,
}: {
  selectedSections: string[]
  outlinePlan: OutlinePlanState | null
  researchObjective: string
}) {
  const sectionOutlines = buildSectionOutlines(selectedSections, outlinePlan)
  const coreSelectedCount = selectedSections.filter((section) => CORE_SECTIONS.includes(section.toLowerCase())).length
  const optionalSelectedCount = Math.max(0, selectedSections.length - coreSelectedCount)
  const missingCoreSections = CORE_SECTIONS.filter((section) => !selectedSections.includes(section))

  const objectiveKeywords = extractObjectiveKeywords(researchObjective)
  const alignmentBySection = sectionOutlines.map((section) => {
    const sectionText = section.bullets.join(' ')
    const sectionTokens = tokenise(sectionText)
    const overlapCount = objectiveKeywords.filter((keyword) => sectionTokens.has(keyword)).length
    const reflected = objectiveKeywords.length > 0 && overlapCount >= 2
    return {
      name: section.name,
      reflected,
      overlapCount,
    }
  })

  const depthBySection = sectionOutlines.map((section) => ({
    name: section.name,
    bulletCount: section.bullets.length,
    underSpecified: section.bullets.length < 2,
  }))

  type BulletEntry = {
    section: string
    text: string
    normalized: string
    tokens: Set<string>
  }

  const entries: BulletEntry[] = []
  for (const section of sectionOutlines) {
    for (const bullet of section.bullets) {
      const normalized = normaliseBullet(bullet)
      if (!normalized) {
        continue
      }
      entries.push({
        section: section.name,
        text: bullet,
        normalized,
        tokens: tokenise(bullet),
      })
    }
  }

  const redundancies: string[] = []
  for (let leftIndex = 0; leftIndex < entries.length; leftIndex += 1) {
    for (let rightIndex = leftIndex + 1; rightIndex < entries.length; rightIndex += 1) {
      const left = entries[leftIndex]
      const right = entries[rightIndex]
      if (left.section === right.section) {
        continue
      }
      const exactDuplicate = left.normalized === right.normalized
      const similarDuplicate = jaccardSimilarity(left.tokens, right.tokens) >= 0.82
      if (!exactDuplicate && !similarDuplicate) {
        continue
      }
      redundancies.push(
        `${toTitleCaseSection(left.section)} ↔ ${toTitleCaseSection(right.section)}: "${left.text}"`,
      )
    }
  }

  return (
    <div className="space-y-3">
      <DiagnosticCard title="Structural coverage" description="Section selection coverage versus the standard IMRaD core.">
        <p>Core selected: {coreSelectedCount}</p>
        <p>Optional selected: {optionalSelectedCount}</p>
        <p>
          Missing standard sections:{' '}
          {missingCoreSections.length === 0 ? 'None' : missingCoreSections.map((section) => toTitleCaseSection(section)).join(', ')}
        </p>
      </DiagnosticCard>

      <DiagnosticCard title="Objective alignment" description="Keyword overlap between research objective and section bullets.">
        {alignmentBySection.length === 0 ? (
          <p className="text-muted-foreground">Build an outline to evaluate objective alignment.</p>
        ) : (
          alignmentBySection.map((section) => (
            <div key={section.name} className="flex items-center justify-between rounded-md border border-border px-2 py-1">
              <span>{toTitleCaseSection(section.name)}</span>
              <span className={section.reflected ? 'text-emerald-600' : 'text-amber-600'}>
                {section.reflected ? '✔ Objective reflected' : '⚠ Weak alignment'} ({section.overlapCount} keyword matches)
              </span>
            </div>
          ))
        )}
      </DiagnosticCard>

      <DiagnosticCard title="Depth balance" description="Bullet depth per section; low-depth sections are under-specified.">
        {depthBySection.length === 0 ? (
          <p className="text-muted-foreground">Build an outline to check depth balance.</p>
        ) : (
          depthBySection.map((section) => (
            <div key={section.name} className="flex items-center justify-between rounded-md border border-border px-2 py-1">
              <span>{toTitleCaseSection(section.name)}</span>
              <span className={section.underSpecified ? 'text-amber-600' : 'text-foreground'}>
                {section.bulletCount} bullet(s){section.underSpecified ? ' - Under-specified' : ''}
              </span>
            </div>
          ))
        )}
      </DiagnosticCard>

      <DiagnosticCard title="Redundancy detection" description="Duplicate or highly similar bullets across sections.">
        {redundancies.length === 0 ? (
          <p className="text-emerald-600">No cross-section redundancy detected.</p>
        ) : (
          <div className="space-y-1">
            <p className="text-amber-600">{redundancies.length} potential duplicate(s) detected.</p>
            {redundancies.slice(0, 5).map((item) => (
              <div key={item} className="rounded-md border border-amber-300/60 bg-amber-50/60 px-2 py-1 text-amber-700">
                {item}
              </div>
            ))}
          </div>
        )}
      </DiagnosticCard>
    </div>
  )
}

export function InsightPanel() {
  const location = useLocation()
  const selectedItem = useAaweStore((state) => state.selectedItem)
  const currentStep = useStudyCoreWizardStore((state) => state.currentStep)
  const contextFields = useStudyCoreWizardStore((state) => state.contextFields)
  const selectedSections = useStudyCoreWizardStore((state) => state.selectedSections)
  const outlinePlan = useStudyCoreWizardStore((state) => state.outlinePlan)
  const planStatus = useStudyCoreWizardStore((state) => state.planStatus)
  const jobStatus = useStudyCoreWizardStore((state) => state.jobStatus)

  const [apiInsight, setApiInsight] = useState<SelectionInsight | null>(null)
  const [loadingInsight, setLoadingInsight] = useState(false)
  const [insightError, setInsightError] = useState('')

  const target = useMemo(() => getInsightTarget(selectedItem), [selectedItem])
  const fallbackInsight = useMemo(() => buildFallbackInsight(selectedItem), [selectedItem])
  const activeInsight = apiInsight ?? fallbackInsight

  const onStudyCoreRoute = location.pathname === '/study-core'
  const showLegacyInspector = !onStudyCoreRoute || currentStep >= 4

  const panelTitle = useMemo(() => {
    if (!onStudyCoreRoute) {
      return 'Insight & Integrity'
    }
    if (currentStep === 2) {
      return 'Plan Intelligence'
    }
    if (currentStep === 1) {
      return 'Research Frame Intelligence'
    }
    if (currentStep === 3) {
      return 'Run Intelligence'
    }
    return 'Insight & Integrity'
  }, [currentStep, onStudyCoreRoute])

  const panelDescription = useMemo(() => {
    if (!onStudyCoreRoute) {
      return 'Evidence, QC, derivation, and citations are synchronized to your current selection.'
    }
    if (currentStep === 2) {
      return 'Live diagnostics for section coverage, alignment, depth, and redundancy.'
    }
    if (currentStep === 1) {
      return 'Checks on research frame completeness before planning.'
    }
    if (currentStep === 3) {
      return 'Run-focused diagnostics while generation controls are active.'
    }
    return 'Evidence, QC, derivation, and citations are synchronized to your current selection.'
  }, [currentStep, onStudyCoreRoute])

  useEffect(() => {
    if (!target) {
      setApiInsight(null)
      setInsightError('')
      setLoadingInsight(false)
      return
    }

    const controller = new AbortController()
    let isCancelled = false

    const loadInsight = async () => {
      setLoadingInsight(true)
      setInsightError('')
      try {
        const response = await fetch(
          `${API_BASE_URL}/v1/aawe/insights/${target.selectionType}/${encodeURIComponent(target.itemId)}`,
          { signal: controller.signal },
        )
        if (!response.ok) {
          let detail = `Insight lookup failed (${response.status})`
          try {
            const payload = (await response.json()) as ApiErrorPayload
            detail = payload.error?.detail || payload.error?.message || detail
          } catch {
            // keep default detail
          }
          throw new Error(detail)
        }
        const payload = (await response.json()) as SelectionInsight
        if (!isCancelled) {
          setApiInsight(payload)
        }
      } catch (error) {
        if (!isCancelled && !controller.signal.aborted) {
          setApiInsight(null)
          setInsightError(error instanceof Error ? error.message : 'Could not load insight payload.')
        }
      } finally {
        if (!isCancelled) {
          setLoadingInsight(false)
        }
      }
    }

    void loadInsight()

    return () => {
      isCancelled = true
      controller.abort()
    }
  }, [target])

  return (
    <aside className="flex h-full flex-col bg-card">
      <div className="space-y-2 border-b border-border p-4">
        <div className="flex items-center justify-between gap-2">
          <h2 className="text-sm font-semibold">{panelTitle}</h2>
          <div className="flex items-center gap-1">
            {loadingInsight && <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />}
            {showLegacyInspector ? (
              selectedItem ? <Badge variant="outline">{selectedItem.type}</Badge> : <Badge variant="secondary">idle</Badge>
            ) : (
              <Badge variant="outline">Step {currentStep}</Badge>
            )}
          </div>
        </div>
        <p className="text-xs text-muted-foreground">{panelDescription}</p>
        {insightError && showLegacyInspector ? <p className="text-xs text-destructive">{insightError}</p> : null}
      </div>
      <ScrollArea className="flex-1">
        <div className="p-4">
          {showLegacyInspector ? (
            <>
              <Tabs defaultValue="evidence">
                <TabsList className="grid w-full grid-cols-4">
                  <TabsTrigger value="evidence" className="gap-1">
                    <BookOpen className="h-3.5 w-3.5" />
                    Evidence
                  </TabsTrigger>
                  <TabsTrigger value="qc" className="gap-1">
                    <ShieldCheck className="h-3.5 w-3.5" />
                    QC
                  </TabsTrigger>
                  <TabsTrigger value="derivation" className="gap-1">
                    <FlaskConical className="h-3.5 w-3.5" />
                    Derivation
                  </TabsTrigger>
                  <TabsTrigger value="citations" className="gap-1">
                    <AlertTriangle className="h-3.5 w-3.5" />
                    Citations
                  </TabsTrigger>
                </TabsList>
                <TabsContent value="evidence">{renderEvidence(activeInsight)}</TabsContent>
                <TabsContent value="qc">{renderQc(activeInsight)}</TabsContent>
                <TabsContent value="derivation">{renderDerivation(activeInsight)}</TabsContent>
                <TabsContent value="citations">{renderCitations(activeInsight)}</TabsContent>
              </Tabs>
              <Separator className="my-4" />
              <p className="text-xs text-muted-foreground">
                Tip: Press <kbd className="rounded border border-border px-1">Esc</kbd> to clear selection.
              </p>
            </>
          ) : null}

          {!showLegacyInspector && currentStep === 1
            ? renderStepOneIntelligence(
                contextFields.researchObjective,
                selectedSections,
                Boolean(contextFields.projectTitle.trim() && contextFields.researchObjective.trim() && contextFields.studyType.trim()),
              )
            : null}

          {!showLegacyInspector && currentStep === 2
            ? renderStepTwoPlanIntelligence({
                selectedSections,
                outlinePlan,
                researchObjective: contextFields.researchObjective,
              })
            : null}

          {!showLegacyInspector && currentStep === 3
            ? renderStepThreeIntelligence({
                selectedSections,
                planBuilt: planStatus === 'built',
                jobStatus,
              })
            : null}
        </div>
      </ScrollArea>
    </aside>
  )
}
