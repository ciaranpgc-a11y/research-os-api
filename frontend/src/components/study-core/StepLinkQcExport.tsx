import { Download, Loader2, ShieldCheck } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
  exportManuscriptMarkdownWithWarnings,
  exportQcGatedMarkdown,
  exportReferencePack,
  runClaimLinker,
  runQcChecks,
} from '@/lib/study-core-api'
import { manuscriptParagraphs } from '@/mock/manuscript'
import type { QCRunResponse } from '@/types/qc-run'
import type { ClaimLinkSuggestion } from '@/types/study-core'

type RunContext = { projectId: string; manuscriptId: string } | null

type StepLinkQcExportProps = {
  runContext: RunContext
  selectedSections: string[]
  links: ClaimLinkSuggestion[]
  onLinksChange: (links: ClaimLinkSuggestion[]) => void
  onQcStatusChange: (status: 'idle' | 'pass' | 'warn' | 'fail') => void
  onStatus: (message: string) => void
  onError: (message: string) => void
  onRegisterPrimaryExportAction?: (action: (() => void) | null) => void
}

const REQUIRED_QC_CATEGORIES = [
  'Unsupported claims',
  'Missing citations',
  'Inconsistent numbers',
  'Journal non-compliance',
  'Word budget',
]

function downloadText(filename: string, content: string, type: string) {
  const blob = new Blob([content], { type })
  const url = window.URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = filename
  document.body.appendChild(anchor)
  anchor.click()
  anchor.remove()
  window.URL.revokeObjectURL(url)
}

function deriveQcStatus(payload: QCRunResponse | null): 'idle' | 'pass' | 'warn' | 'fail' {
  if (!payload) {
    return 'idle'
  }
  if (payload.high_severity_count > 0) {
    return 'fail'
  }
  if (payload.total_findings > 0) {
    return 'warn'
  }
  return 'pass'
}

export function StepLinkQcExport({
  runContext,
  selectedSections,
  links,
  onLinksChange,
  onQcStatusChange,
  onStatus,
  onError,
  onRegisterPrimaryExportAction,
}: StepLinkQcExportProps) {
  const [minConfidence, setMinConfidence] = useState<'high' | 'medium' | 'low'>('medium')
  const [referenceStyle, setReferenceStyle] = useState<'vancouver' | 'ama'>('vancouver')
  const [suggestionDecisions, setSuggestionDecisions] = useState<Record<string, 'accepted' | 'rejected'>>({})
  const [qcRun, setQcRun] = useState<QCRunResponse | null>(null)
  const [busy, setBusy] = useState<'link' | 'qc' | 'export' | 'export-override' | 'refs' | ''>('')

  const claimIds = useMemo(
    () =>
      manuscriptParagraphs
        .filter((paragraph) => selectedSections.includes(paragraph.section))
        .map((paragraph) => paragraph.id),
    [selectedSections],
  )

  const qcStatus = useMemo(() => deriveQcStatus(qcRun), [qcRun])
  useEffect(() => {
    onQcStatusChange(qcStatus)
  }, [onQcStatusChange, qcStatus])

  const qcChecklist = useMemo(() => {
    const issues = qcRun?.issues ?? []
    return REQUIRED_QC_CATEGORIES.map((category) => {
      const issue = issues.find((item) => item.category.toLowerCase() === category.toLowerCase())
      return {
        category,
        count: issue?.count ?? 0,
        severity: issue?.severity ?? 'low',
        summary: issue?.summary ?? 'No findings in this category.',
      }
    })
  }, [qcRun])

  const onRunLinker = async () => {
    setBusy('link')
    onError('')
    try {
      const payload = await runClaimLinker({
        claimIds: claimIds.length > 0 ? claimIds : manuscriptParagraphs.map((paragraph) => paragraph.id),
        minConfidence,
      })
      onLinksChange(payload.suggestions)
      onStatus(`Linker returned ${payload.suggestions.length} suggestion(s).`)
    } catch (error) {
      onError(error instanceof Error ? error.message : 'Could not run linker.')
    } finally {
      setBusy('')
    }
  }

  const onRunQc = async () => {
    setBusy('qc')
    onError('')
    try {
      const payload = await runQcChecks()
      setQcRun(payload)
      const status = deriveQcStatus(payload)
      onStatus(`QC completed (${status}).`)
    } catch (error) {
      onError(error instanceof Error ? error.message : 'Could not run QC.')
    } finally {
      setBusy('')
    }
  }

  const onExportStrict = async () => {
    if (!runContext) {
      onError('Context must be saved before export.')
      return
    }
    setBusy('export')
    onError('')
    try {
      const payload = await exportQcGatedMarkdown(runContext.projectId, runContext.manuscriptId)
      downloadText(payload.filename, payload.content, 'text/markdown;charset=utf-8')
      onStatus(`Exported ${payload.filename}.`)
    } catch (error) {
      onError(error instanceof Error ? error.message : 'Could not export manuscript.')
    } finally {
      setBusy('')
    }
  }

  useEffect(() => {
    if (!onRegisterPrimaryExportAction) {
      return
    }
    if (qcStatus === 'pass') {
      onRegisterPrimaryExportAction(() => {
        void onExportStrict()
      })
      return () => {
        onRegisterPrimaryExportAction(null)
      }
    }
    onRegisterPrimaryExportAction(null)
    return () => {
      onRegisterPrimaryExportAction(null)
    }
  }, [onRegisterPrimaryExportAction, qcStatus, runContext])

  const onExportWithWarnings = async () => {
    if (!runContext) {
      onError('Context must be saved before export.')
      return
    }
    setBusy('export-override')
    onError('')
    try {
      const payload = await exportManuscriptMarkdownWithWarnings(runContext.projectId, runContext.manuscriptId)
      downloadText(payload.filename, payload.content, 'text/markdown;charset=utf-8')
      onStatus(`Exported ${payload.filename} with warnings.`)
    } catch (error) {
      onError(error instanceof Error ? error.message : 'Could not export with warnings.')
    } finally {
      setBusy('')
    }
  }

  const onExportReferences = async () => {
    setBusy('refs')
    onError('')
    try {
      const payload = await exportReferencePack({
        style: referenceStyle,
        claimIds: claimIds.length > 0 ? claimIds : manuscriptParagraphs.map((paragraph) => paragraph.id),
      })
      downloadText(payload.filename, payload.content, 'text/plain;charset=utf-8')
      onStatus(`Reference pack exported (${referenceStyle.toUpperCase()}).`)
    } catch (error) {
      onError(error instanceof Error ? error.message : 'Could not export reference pack.')
    } finally {
      setBusy('')
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Step 5: Link Claims to Evidence + Quality Check & Export</CardTitle>
        <CardDescription>Link claims, run quality checks, and export once the QC gate is ready.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-sm text-muted-foreground">Use Linking to review claim-result mapping, then run QC and export in the final tab.</p>

        <Tabs defaultValue="linking">
          <TabsList>
            <TabsTrigger value="linking">Linking</TabsTrigger>
            <TabsTrigger value="qc-export">QC + Export</TabsTrigger>
          </TabsList>

          <TabsContent value="linking" className="space-y-3">
            <div className="flex flex-wrap items-center gap-2">
              <select
                className="h-9 rounded-md border border-border bg-background px-3 text-sm"
                value={minConfidence}
                onChange={(event) => setMinConfidence(event.target.value as 'high' | 'medium' | 'low')}
              >
                <option value="high">high</option>
                <option value="medium">medium+</option>
                <option value="low">all</option>
              </select>
              <Button variant="outline" onClick={onRunLinker} disabled={busy === 'link'}>
                {busy === 'link' ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : null}
                Run Linker
              </Button>
              <Badge variant="secondary">Suggestions: {links.length}</Badge>
            </div>

            <div className="space-y-2">
              {links.map((suggestion) => {
                const decisionKey = `${suggestion.claim_id}-${suggestion.result_id}`
                const decision = suggestionDecisions[decisionKey]
                return (
                  <div key={decisionKey} className="rounded-md border border-border p-2 text-xs">
                    <p>
                      {suggestion.claim_heading} {' -> '} {suggestion.result_id} ({suggestion.confidence})
                    </p>
                    <p className="text-muted-foreground">{suggestion.rationale}</p>
                    <div className="mt-2 flex gap-2">
                      <Button
                        size="sm"
                        variant={decision === 'accepted' ? 'default' : 'outline'}
                        onClick={() => setSuggestionDecisions((current) => ({ ...current, [decisionKey]: 'accepted' }))}
                      >
                        Accept
                      </Button>
                      <Button
                        size="sm"
                        variant={decision === 'rejected' ? 'default' : 'outline'}
                        onClick={() => setSuggestionDecisions((current) => ({ ...current, [decisionKey]: 'rejected' }))}
                      >
                        Reject
                      </Button>
                    </div>
                  </div>
                )
              })}
              {links.length === 0 ? <p className="text-xs text-muted-foreground">Run linker to load evidence suggestions.</p> : null}
            </div>
          </TabsContent>

          <TabsContent value="qc-export" className="space-y-3">
            <div className="flex flex-wrap items-center gap-2">
              <Button variant="outline" onClick={onRunQc} disabled={busy === 'qc'}>
                {busy === 'qc' ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <ShieldCheck className="mr-1 h-4 w-4" />}
                Run QC
              </Button>
              <Badge variant={qcStatus === 'pass' ? 'default' : 'secondary'}>QC status: {qcStatus}</Badge>
            </div>

            <div className="grid gap-2 md:grid-cols-2">
              {qcChecklist.map((item) => (
                <div key={item.category} className="rounded-md border border-border p-2 text-xs">
                  <p className="font-medium">{item.category}</p>
                  <p className="text-muted-foreground">
                    {item.count > 0 ? `${item.count} issue(s) - ${item.summary}` : 'Clear'}
                  </p>
                </div>
              ))}
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <Button onClick={() => void onExportStrict()} disabled={busy === 'export' || qcStatus !== 'pass'}>
                {busy === 'export' ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <Download className="mr-1 h-4 w-4" />}
                Export
              </Button>
              {qcStatus !== 'pass' ? (
                <Button variant="outline" onClick={() => void onExportWithWarnings()} disabled={busy === 'export-override'}>
                  {busy === 'export-override' ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <Download className="mr-1 h-4 w-4" />}
                  Export with warnings
                </Button>
              ) : null}

              <select
                className="h-9 rounded-md border border-border bg-background px-3 text-sm"
                value={referenceStyle}
                onChange={(event) => setReferenceStyle(event.target.value as 'vancouver' | 'ama')}
              >
                <option value="vancouver">Vancouver</option>
                <option value="ama">AMA</option>
              </select>
              <Button variant="outline" onClick={onExportReferences} disabled={busy === 'refs'}>
                {busy === 'refs' ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : null}
                Export Reference Pack
              </Button>
            </div>
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  )
}
