import { useEffect, useMemo, useState } from 'react'
import { AlertTriangle, BookOpen, FlaskConical, Loader2, ShieldCheck } from 'lucide-react'

import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Separator } from '@/components/ui/separator'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { API_BASE_URL } from '@/lib/api'
import { useAaweStore } from '@/store/use-aawe-store'
import type { ApiErrorPayload, SelectionInsight } from '@/types/insight'
import type { SelectionItem } from '@/types/selection'

type InsightTarget = {
  selectionType: 'claim' | 'result' | 'qc'
  itemId: string
}

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
        {insight.derivation.covariates.length > 0 && (
          <p>Covariates: {insight.derivation.covariates.join(', ')}</p>
        )}
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

export function InsightPanel() {
  const selectedItem = useAaweStore((state) => state.selectedItem)
  const [apiInsight, setApiInsight] = useState<SelectionInsight | null>(null)
  const [loadingInsight, setLoadingInsight] = useState(false)
  const [insightError, setInsightError] = useState('')

  const target = useMemo(() => getInsightTarget(selectedItem), [selectedItem])
  const fallbackInsight = useMemo(() => buildFallbackInsight(selectedItem), [selectedItem])
  const activeInsight = apiInsight ?? fallbackInsight

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

    loadInsight()

    return () => {
      isCancelled = true
      controller.abort()
    }
  }, [target])

  return (
    <aside className="flex h-full flex-col bg-card">
      <div className="space-y-2 border-b border-border p-4">
        <div className="flex items-center justify-between gap-2">
          <h2 className="text-sm font-semibold">Insight & Integrity</h2>
          <div className="flex items-center gap-1">
            {loadingInsight && <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />}
            {selectedItem ? <Badge variant="outline">{selectedItem.type}</Badge> : <Badge variant="secondary">idle</Badge>}
          </div>
        </div>
        <p className="text-xs text-muted-foreground">
          Evidence, QC, derivation, and citations are synchronized to your current selection.
        </p>
        {insightError && <p className="text-xs text-destructive">{insightError}</p>}
      </div>
      <ScrollArea className="flex-1">
        <div className="p-4">
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
        </div>
      </ScrollArea>
    </aside>
  )
}
