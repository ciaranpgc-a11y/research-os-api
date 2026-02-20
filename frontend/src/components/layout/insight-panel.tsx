import { AlertTriangle, BookOpen, FlaskConical, ShieldCheck } from 'lucide-react'

import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Separator } from '@/components/ui/separator'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { useAaweStore } from '@/store/use-aawe-store'
import type { SelectionItem } from '@/types/selection'

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

function renderEvidence(selection: SelectionItem) {
  if (!selection) {
    return <EmptyState />
  }
  if (selection.type === 'claim') {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-sm">{selection.data.heading}</CardTitle>
          <CardDescription>{selection.data.tag} claim</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {selection.data.evidenceAnchors.map((anchor) => (
            <div key={anchor.id} className="space-y-1 rounded-md border border-border p-2">
              <p className="text-xs font-medium">{anchor.label}</p>
              <p className="text-xs text-muted-foreground">{anchor.source}</p>
              <Badge variant="secondary">{anchor.confidence} confidence</Badge>
            </div>
          ))}
        </CardContent>
      </Card>
    )
  }
  if (selection.type === 'result') {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-sm">Result {selection.data.id}</CardTitle>
          <CardDescription>{selection.data.type}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-2 text-xs">
          <p>
            Effect: <span className="font-medium">{selection.data.effect}</span>
          </p>
          <p>Interval: {selection.data.ci}</p>
          <p>Model: {selection.data.model}</p>
          <p>Population filter: {selection.data.derivation.populationFilter}</p>
        </CardContent>
      </Card>
    )
  }
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm">{selection.data.category}</CardTitle>
        <CardDescription>{selection.data.summary}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-2 text-xs">
        <p>
          Severity: <Badge variant={selection.data.severity === 'High' ? 'destructive' : 'secondary'}>{selection.data.severity}</Badge>
        </p>
        <p>Affected items: {selection.data.affectedItems.join(', ')}</p>
      </CardContent>
    </Card>
  )
}

function renderQc(selection: SelectionItem) {
  if (!selection) {
    return <EmptyState />
  }
  if (selection.type === 'qc') {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-sm">QC Focus</CardTitle>
          <CardDescription>{selection.data.category}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-2 text-xs">
          <p>Issue count: {selection.data.count}</p>
          <p>Recommendation: {selection.data.recommendation}</p>
        </CardContent>
      </Card>
    )
  }
  if (selection.type === 'result') {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-sm">Result QC</CardTitle>
          <CardDescription>{selection.data.id}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-2 text-xs">
          <p>Adjusted: {selection.data.adjusted ? 'Yes' : 'No'}</p>
          <p>Validated: {selection.data.validated ? 'Yes' : 'No'}</p>
          <p>Checks: {selection.data.derivation.validationChecks.join('; ')}</p>
        </CardContent>
      </Card>
    )
  }
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm">Claim QC</CardTitle>
        <CardDescription>{selection.data.id}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-2 text-xs">
        <p>Evidence anchors: {selection.data.evidenceAnchors.length}</p>
        <p>Citation slots: {selection.data.citationSlots}</p>
        <p>Claim strength: {selection.data.claimStrength}%</p>
      </CardContent>
    </Card>
  )
}

function renderDerivation(selection: SelectionItem) {
  if (!selection) {
    return <EmptyState />
  }
  if (selection.type === 'result') {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-sm">Derivation Trace</CardTitle>
          <CardDescription>{selection.data.id}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-2 text-xs">
          <p>Dataset: {selection.data.derivation.dataset}</p>
          <p>Estimation: {selection.data.derivation.estimation}</p>
          <p>Covariates: {selection.data.derivation.covariates.join(', ')}</p>
          <p>Validation: {selection.data.derivation.validationChecks.join('; ')}</p>
        </CardContent>
      </Card>
    )
  }
  if (selection.type === 'claim') {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-sm">Claim Assembly</CardTitle>
          <CardDescription>{selection.data.id}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-2 text-xs">
          <p>Section: {selection.data.section}</p>
          <p>Tag: {selection.data.tag}</p>
          <p>Word target: {selection.data.wordTarget}</p>
          <p>Anchors linked: {selection.data.evidenceAnchors.map((anchor) => anchor.id).join(', ')}</p>
        </CardContent>
      </Card>
    )
  }
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm">QC Derivation</CardTitle>
      </CardHeader>
      <CardContent className="space-y-2 text-xs">
        <p>Rule ID: {selection.data.id}</p>
        <p>Summary: {selection.data.summary}</p>
      </CardContent>
    </Card>
  )
}

function renderCitations(selection: SelectionItem) {
  if (!selection) {
    return <EmptyState />
  }
  const citations =
    selection.type === 'claim'
      ? selection.data.suggestedCitations
      : selection.type === 'result'
        ? selection.data.citations
        : selection.data.referenceGuidelines

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm">Citation Guidance</CardTitle>
        <CardDescription>Context-aware references for the selected item.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-2">
        {citations.map((citation) => (
          <div key={citation} className="rounded-md border border-border px-2 py-1 text-xs">
            {citation}
          </div>
        ))}
      </CardContent>
    </Card>
  )
}

export function InsightPanel() {
  const selectedItem = useAaweStore((state) => state.selectedItem)

  return (
    <aside className="flex h-full flex-col bg-card">
      <div className="space-y-2 border-b border-border p-4">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold">Insight & Integrity</h2>
          {selectedItem ? <Badge variant="outline">{selectedItem.type}</Badge> : <Badge variant="secondary">idle</Badge>}
        </div>
        <p className="text-xs text-muted-foreground">
          Evidence, QC, derivation, and citations are synchronized to your current selection.
        </p>
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
            <TabsContent value="evidence">{renderEvidence(selectedItem)}</TabsContent>
            <TabsContent value="qc">{renderQc(selectedItem)}</TabsContent>
            <TabsContent value="derivation">{renderDerivation(selectedItem)}</TabsContent>
            <TabsContent value="citations">{renderCitations(selectedItem)}</TabsContent>
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
