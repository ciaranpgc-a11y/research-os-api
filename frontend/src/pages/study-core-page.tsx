import { useEffect, useMemo, useState } from 'react'
import { Download, Loader2, Play, ShieldCheck, Sparkles } from 'lucide-react'
import { useNavigate } from 'react-router-dom'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Separator } from '@/components/ui/separator'
import {
  bootstrapRunContext,
  cancelGeneration,
  enqueueGeneration,
  estimateGeneration,
  exportQcGatedMarkdown,
  exportReferencePack,
  fetchGenerationJob,
  fetchJournalOptions,
  planSections,
  retryGeneration,
  runClaimLinker,
} from '@/lib/study-core-api'
import { manuscriptParagraphs } from '@/mock/manuscript'
import { resultObjects } from '@/mock/results'
import { PageFrame } from '@/pages/page-frame'
import { useAaweStore } from '@/store/use-aawe-store'
import type { ClaimLinkSuggestion, GenerationEstimate, GenerationJobPayload, JournalOption, SectionPlanPayload } from '@/types/study-core'

type RunContext = { projectId: string; manuscriptId: string }

const CONTEXT_KEY = 'aawe-run-context'
const SECTIONS = ['introduction', 'methods', 'results', 'discussion']

function parseOptionalNumber(value: string): number | null {
  if (!value.trim()) {
    return null
  }
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : null
}

function isActive(job: GenerationJobPayload) {
  return job.status === 'queued' || job.status === 'running' || job.status === 'cancel_requested'
}

function downloadText(filename: string, content: string, type: string) {
  const blob = new Blob([content], { type })
  const url = window.URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  window.URL.revokeObjectURL(url)
}

export function StudyCorePage() {
  const navigate = useNavigate()
  const setSelectedItem = useAaweStore((state) => state.setSelectedItem)
  const setRightPanelOpen = useAaweStore((state) => state.setRightPanelOpen)

  const [journals, setJournals] = useState<JournalOption[]>([])
  const [runContext, setRunContext] = useState<RunContext | null>(() => {
    const raw = window.localStorage.getItem(CONTEXT_KEY)
    if (!raw) return null
    try {
      return JSON.parse(raw) as RunContext
    } catch {
      return null
    }
  })
  const [targetJournal, setTargetJournal] = useState('generic-original')
  const [projectTitle, setProjectTitle] = useState('AAWE Manuscript Workspace')
  const [answers, setAnswers] = useState({
    disease_focus: 'Heart failure',
    population: 'Adults admitted with decompensated HF',
    primary_outcome: '90-day all-cause readmission',
    analysis_summary: 'Adjusted Cox model with bootstrap validation',
    key_findings: 'Lower readmission risk in intervention group',
  })
  const [selectedSections, setSelectedSections] = useState<string[]>(SECTIONS)
  const [notesContext, setNotesContext] = useState(
    'disease_focus: Heart failure\npopulation: Adults admitted with decompensated HF\nprimary_outcome: 90-day all-cause readmission',
  )
  const [maxCostUsd, setMaxCostUsd] = useState('0.08')
  const [dailyBudgetUsd, setDailyBudgetUsd] = useState('0.25')
  const [referenceStyle, setReferenceStyle] = useState<'vancouver' | 'ama'>('vancouver')
  const [minConfidence, setMinConfidence] = useState<'high' | 'medium' | 'low'>('medium')

  const [plan, setPlan] = useState<SectionPlanPayload | null>(null)
  const [estimate, setEstimate] = useState<GenerationEstimate | null>(null)
  const [links, setLinks] = useState<ClaimLinkSuggestion[]>([])
  const [activeJob, setActiveJob] = useState<GenerationJobPayload | null>(null)
  const [busy, setBusy] = useState<string>('')
  const [status, setStatus] = useState('')
  const [error, setError] = useState('')

  const claimIds = useMemo(
    () =>
      manuscriptParagraphs
        .filter((paragraph) => selectedSections.includes(paragraph.section))
        .map((paragraph) => paragraph.id),
    [selectedSections],
  )

  useEffect(() => {
    void fetchJournalOptions()
      .then((payload) => {
        setJournals(payload)
        if (!payload.some((journal) => journal.slug === targetJournal)) {
          setTargetJournal(payload[0]?.slug ?? 'generic-original')
        }
      })
      .catch((e: unknown) => setError(e instanceof Error ? e.message : 'Could not load journals.'))
  }, [targetJournal])

  useEffect(() => {
    if (!runContext) return
    window.localStorage.setItem(CONTEXT_KEY, JSON.stringify(runContext))
  }, [runContext])

  useEffect(() => {
    if (!activeJob || !isActive(activeJob)) return
    const timer = window.setInterval(() => {
      void fetchGenerationJob(activeJob.id)
        .then(setActiveJob)
        .catch((e: unknown) => setError(e instanceof Error ? e.message : 'Could not refresh generation job.'))
    }, 1500)
    return () => window.clearInterval(timer)
  }, [activeJob])

  const onBootstrap = async () => {
    setBusy('bootstrap')
    setError('')
    setStatus('')
    try {
      const payload = await bootstrapRunContext({
        title: projectTitle,
        targetJournal,
        answers: { ...answers, manuscript_goal: 'generate_full_manuscript', data_source: 'manual_entry' },
      })
      setRunContext({ projectId: payload.project.id, manuscriptId: payload.manuscript.id })
      setSelectedSections(payload.inference.recommended_sections)
      setStatus(`Context ready: ${payload.project.id.slice(0, 8)} / ${payload.manuscript.id.slice(0, 8)}`)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not create run context.')
    } finally {
      setBusy('')
    }
  }

  const onPlan = async () => {
    setBusy('plan')
    setError('')
    setStatus('')
    try {
      const payload = await planSections({
        targetJournal,
        answers: { ...answers, manuscript_goal: 'generate_full_manuscript', data_source: 'manual_entry' },
        sections: selectedSections,
      })
      setPlan(payload)
      setStatus(`Planned ${payload.items.length} section(s).`)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not build plan.')
    } finally {
      setBusy('')
    }
  }

  const onEstimate = async () => {
    setBusy('estimate')
    setError('')
    setStatus('')
    try {
      const payload = await estimateGeneration({ sections: selectedSections, notesContext })
      setEstimate(payload)
      setStatus(`Estimated high-side cost $${payload.estimated_cost_usd_high.toFixed(4)}`)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not estimate generation.')
    } finally {
      setBusy('')
    }
  }

  const onRun = async () => {
    if (!runContext) {
      setError('Create run context first.')
      return
    }
    const maxCost = parseOptionalNumber(maxCostUsd)
    const dailyBudget = parseOptionalNumber(dailyBudgetUsd)
    if (maxCostUsd.trim() && maxCost === null) {
      setError('Max estimated cost must be numeric.')
      return
    }
    if (dailyBudgetUsd.trim() && dailyBudget === null) {
      setError('Daily budget must be numeric.')
      return
    }
    setBusy('run')
    setError('')
    setStatus('')
    try {
      const job = await enqueueGeneration({
        projectId: runContext.projectId,
        manuscriptId: runContext.manuscriptId,
        sections: selectedSections,
        notesContext,
        maxEstimatedCostUsd: maxCost,
        projectDailyBudgetUsd: dailyBudget,
      })
      setActiveJob(job)
      setStatus(`Generation queued: ${job.id.slice(0, 8)}`)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not run generation.')
    } finally {
      setBusy('')
    }
  }

  const onCancel = async () => {
    if (!activeJob) return
    setBusy('cancel')
    setError('')
    try {
      const payload = await cancelGeneration(activeJob.id)
      setActiveJob(payload)
      setStatus(`Job ${payload.id.slice(0, 8)} is ${payload.status}.`)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not cancel job.')
    } finally {
      setBusy('')
    }
  }

  const onRetry = async () => {
    if (!activeJob || (activeJob.status !== 'failed' && activeJob.status !== 'cancelled')) return
    setBusy('retry')
    setError('')
    try {
      const payload = await retryGeneration(activeJob.id)
      setActiveJob(payload)
      setStatus(`Retry queued: ${payload.id.slice(0, 8)}`)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not retry job.')
    } finally {
      setBusy('')
    }
  }

  const onLink = async () => {
    setBusy('link')
    setError('')
    try {
      const payload = await runClaimLinker({
        claimIds: claimIds.length > 0 ? claimIds : manuscriptParagraphs.map((paragraph) => paragraph.id),
        minConfidence,
      })
      setLinks(payload.suggestions)
      setStatus(`Linker returned ${payload.suggestions.length} suggestion(s).`)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not run linker.')
    } finally {
      setBusy('')
    }
  }

  const onInspectLink = (suggestion: ClaimLinkSuggestion) => {
    const claim = manuscriptParagraphs.find((paragraph) => paragraph.id === suggestion.claim_id)
    if (claim) {
      setSelectedItem({ type: 'claim', data: claim })
      setRightPanelOpen(true)
      navigate(`/manuscript/${claim.section}`)
      return
    }
    const result = resultObjects.find((item) => item.id === suggestion.result_id)
    if (result) {
      setSelectedItem({ type: 'result', data: result })
      setRightPanelOpen(true)
      navigate('/results')
    }
  }

  const onExportMarkdown = async () => {
    if (!runContext) {
      setError('Create run context first.')
      return
    }
    setBusy('markdown')
    setError('')
    try {
      const payload = await exportQcGatedMarkdown(runContext.projectId, runContext.manuscriptId)
      downloadText(payload.filename, payload.content, 'text/markdown;charset=utf-8')
      setStatus(`Exported ${payload.filename}`)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not export markdown.')
    } finally {
      setBusy('')
    }
  }

  const onExportReferences = async () => {
    setBusy('refs')
    setError('')
    try {
      const payload = await exportReferencePack({ style: referenceStyle, claimIds: claimIds.length > 0 ? claimIds : manuscriptParagraphs.map((p) => p.id) })
      downloadText(payload.filename, payload.content, 'text/plain;charset=utf-8')
      setStatus(`Reference pack exported (${referenceStyle.toUpperCase()}).`)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not export reference pack.')
    } finally {
      setBusy('')
    }
  }

  return (
    <PageFrame title="Study Core - Generation Run Center" description="Planning, generation, linker suggestions, QC-gated export, and reference pack builder.">
      <div className="grid gap-4">
        <Card>
          <CardHeader><CardTitle className="text-base">Context + Planning</CardTitle><CardDescription>Bootstrap a project/manuscript context and generate section plans with estimated costs.</CardDescription></CardHeader>
          <CardContent className="space-y-3">
            <div className="grid gap-3 md:grid-cols-3">
              <Input value={projectTitle} onChange={(event) => setProjectTitle(event.target.value)} />
              <select className="h-9 rounded-md border border-border bg-background px-3 text-sm" value={targetJournal} onChange={(event) => setTargetJournal(event.target.value)}>{journals.map((journal) => <option key={journal.slug} value={journal.slug}>{journal.display_name}</option>)}</select>
              <Button onClick={onBootstrap} disabled={busy === 'bootstrap'}>{busy === 'bootstrap' ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <Sparkles className="mr-1 h-4 w-4" />}Create Run Context</Button>
            </div>
            <div className="grid gap-3 md:grid-cols-2">
              <Input value={answers.disease_focus} onChange={(event) => setAnswers((current) => ({ ...current, disease_focus: event.target.value }))} />
              <Input value={answers.population} onChange={(event) => setAnswers((current) => ({ ...current, population: event.target.value }))} />
              <Input value={answers.primary_outcome} onChange={(event) => setAnswers((current) => ({ ...current, primary_outcome: event.target.value }))} />
              <Input value={answers.analysis_summary} onChange={(event) => setAnswers((current) => ({ ...current, analysis_summary: event.target.value }))} />
            </div>
            <div className="flex flex-wrap items-center gap-2">{SECTIONS.map((section) => <Button key={section} size="sm" variant={selectedSections.includes(section) ? 'default' : 'outline'} onClick={() => setSelectedSections((current) => current.includes(section) ? current.filter((item) => item !== section) : [...current, section])}>{section}</Button>)}</div>
            <div className="flex flex-wrap items-center gap-2">
              <Button variant="outline" onClick={onPlan} disabled={busy === 'plan'}>{busy === 'plan' ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : null}Build Plan</Button>
              {plan ? <Badge variant="secondary">${plan.total_estimated_cost_usd_low.toFixed(4)}-${plan.total_estimated_cost_usd_high.toFixed(4)}</Badge> : null}
              {runContext ? <Badge variant="outline">{runContext.projectId.slice(0, 8)} / {runContext.manuscriptId.slice(0, 8)}</Badge> : null}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="text-base">Generation Run Center</CardTitle><CardDescription>Estimate, run, monitor, cancel, and retry generation jobs.</CardDescription></CardHeader>
          <CardContent className="space-y-3">
            <textarea className="min-h-24 w-full rounded-md border border-border bg-background px-3 py-2 text-sm" value={notesContext} onChange={(event) => setNotesContext(event.target.value)} />
            <div className="grid gap-3 md:grid-cols-3">
              <Input value={maxCostUsd} onChange={(event) => setMaxCostUsd(event.target.value)} />
              <Input value={dailyBudgetUsd} onChange={(event) => setDailyBudgetUsd(event.target.value)} />
              <div className="flex gap-2">
                <Button variant="outline" onClick={onEstimate} disabled={busy === 'estimate'}>{busy === 'estimate' ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : null}Estimate</Button>
                <Button onClick={onRun} disabled={busy === 'run' || !runContext}>{busy === 'run' ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <Play className="mr-1 h-4 w-4" />}Run</Button>
              </div>
            </div>
            {estimate ? <p className="text-xs text-muted-foreground">Estimated cost: ${estimate.estimated_cost_usd_low.toFixed(4)}-${estimate.estimated_cost_usd_high.toFixed(4)}.</p> : null}
            {activeJob ? <><Separator /><div className="flex flex-wrap items-center justify-between gap-2 text-xs"><span>{activeJob.id.slice(0, 8)} | {activeJob.status} | {activeJob.progress_percent}% | {activeJob.current_section ?? 'n/a'}</span><div className="flex gap-2"><Button size="sm" variant="outline" onClick={onCancel} disabled={!isActive(activeJob) || busy === 'cancel'}>Cancel</Button><Button size="sm" variant="outline" onClick={onRetry} disabled={(activeJob.status !== 'failed' && activeJob.status !== 'cancelled') || busy === 'retry'}>Retry</Button></div></div></> : null}
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="text-base">Evidence-to-Claim Linker</CardTitle><CardDescription>Suggest claim-result links and inspect directly in workspace.</CardDescription></CardHeader>
          <CardContent className="space-y-3">
            <div className="flex flex-wrap items-center gap-2">
              <select className="h-9 rounded-md border border-border bg-background px-3 text-sm" value={minConfidence} onChange={(event) => setMinConfidence(event.target.value as 'high' | 'medium' | 'low')}><option value="high">high</option><option value="medium">medium+</option><option value="low">all</option></select>
              <Button variant="outline" onClick={onLink} disabled={busy === 'link'}>{busy === 'link' ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : null}Run Linker</Button>
            </div>
            <div className="space-y-2">
              {links.map((suggestion) => (
                <div
                  key={`${suggestion.claim_id}-${suggestion.result_id}`}
                  className="flex items-center justify-between rounded-md border border-border px-2 py-1 text-xs"
                >
                  <span>
                    {suggestion.claim_heading}
                    {' -> '}
                    {suggestion.result_id} ({suggestion.confidence})
                  </span>
                  <Button size="sm" variant="outline" onClick={() => onInspectLink(suggestion)}>
                    Inspect
                  </Button>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="text-base">QC Gate + Reference Pack</CardTitle><CardDescription>Export manuscript only if high-severity QC issues are cleared, and build formatted references.</CardDescription></CardHeader>
          <CardContent className="flex flex-wrap items-center gap-2">
            <Button variant="outline" onClick={onExportMarkdown} disabled={busy === 'markdown' || !runContext}>{busy === 'markdown' ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <ShieldCheck className="mr-1 h-4 w-4" />}Export Manuscript (QC-gated)</Button>
            <select className="h-9 rounded-md border border-border bg-background px-3 text-sm" value={referenceStyle} onChange={(event) => setReferenceStyle(event.target.value as 'vancouver' | 'ama')}><option value="vancouver">Vancouver</option><option value="ama">AMA</option></select>
            <Button variant="outline" onClick={onExportReferences} disabled={busy === 'refs'}>{busy === 'refs' ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <Download className="mr-1 h-4 w-4" />}Export Reference Pack</Button>
          </CardContent>
        </Card>

        {status ? <p className="text-sm text-emerald-600">{status}</p> : null}
        {error ? <p className="text-sm text-destructive">{error}</p> : null}
      </div>
    </PageFrame>
  )
}
