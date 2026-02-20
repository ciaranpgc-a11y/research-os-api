import { AlertTriangle, Info, Loader2, Play, RotateCcw, Square } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import {
  cancelGeneration,
  enqueueGeneration,
  estimateGeneration,
  fetchGenerationJob,
  retryGeneration,
} from '@/lib/study-core-api'
import type { GenerationEstimate, GenerationJobPayload } from '@/types/study-core'

type RunContext = { projectId: string; manuscriptId: string } | null

type StepRunProps = {
  runContext: RunContext
  selectedSections: string[]
  generationBrief: string
  suggestedBrief: string
  temperature: number
  reasoningEffort: 'low' | 'medium' | 'high'
  maxCostUsd: string
  dailyBudgetUsd: string
  estimate: GenerationEstimate | null
  activeJob: GenerationJobPayload | null
  onGenerationBriefChange: (value: string) => void
  onTemperatureChange: (value: number) => void
  onReasoningEffortChange: (value: 'low' | 'medium' | 'high') => void
  onMaxCostChange: (value: string) => void
  onDailyBudgetChange: (value: string) => void
  onEstimateChange: (value: GenerationEstimate | null) => void
  onActiveJobChange: (value: GenerationJobPayload | null) => void
  onJobStatusChange: (value: 'idle' | 'running' | 'succeeded' | 'failed') => void
  onStatus: (message: string) => void
  onError: (message: string) => void
}

type RunFlag = {
  tone: 'warn' | 'info'
  text: string
}

function parseOptionalNumber(value: string): number | null {
  if (!value.trim()) {
    return null
  }
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : null
}

function isActive(job: GenerationJobPayload): boolean {
  return job.status === 'queued' || job.status === 'running' || job.status === 'cancel_requested'
}

function toWizardStatus(job: GenerationJobPayload): 'running' | 'succeeded' | 'failed' {
  if (job.status === 'completed') {
    return 'succeeded'
  }
  if (job.status === 'queued' || job.status === 'running' || job.status === 'cancel_requested') {
    return 'running'
  }
  return 'failed'
}

function formatTimestamp(value: string | null): string {
  if (!value) {
    return 'n/a'
  }
  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) {
    return value
  }
  return parsed.toLocaleString()
}

function computeRunFlags({
  hasContext,
  selectedSections,
  generationBrief,
  estimate,
}: {
  hasContext: boolean
  selectedSections: string[]
  generationBrief: string
  estimate: GenerationEstimate | null
}): RunFlag[] {
  const flags: RunFlag[] = []
  if (!hasContext) {
    flags.push({ tone: 'warn', text: 'Context is not saved. Complete Step 1 before running generation.' })
  }
  if (selectedSections.length === 0) {
    flags.push({ tone: 'warn', text: 'No sections selected. Build a section plan in Step 2 first.' })
  }
  const briefWords = generationBrief.trim().split(/\s+/).filter(Boolean).length
  if (briefWords < 20) {
    flags.push({ tone: 'warn', text: 'Generation brief is sparse. Add objective, data source, and expected output detail.' })
  } else if (briefWords < 40) {
    flags.push({ tone: 'info', text: 'Generation brief is usable but could be more specific for stronger output control.' })
  }
  if (!estimate) {
    flags.push({ tone: 'info', text: 'Run cost is not estimated yet. Use Estimate cost before launching.' })
  }
  return flags
}

export function StepRun({
  runContext,
  selectedSections,
  generationBrief,
  suggestedBrief,
  temperature,
  reasoningEffort,
  maxCostUsd,
  dailyBudgetUsd,
  estimate,
  activeJob,
  onGenerationBriefChange,
  onTemperatureChange,
  onReasoningEffortChange,
  onMaxCostChange,
  onDailyBudgetChange,
  onEstimateChange,
  onActiveJobChange,
  onJobStatusChange,
  onStatus,
  onError,
}: StepRunProps) {
  const [attemptedRun, setAttemptedRun] = useState(false)
  const [busy, setBusy] = useState<'estimate' | 'run' | 'cancel' | 'retry' | ''>('')
  const [inlineError, setInlineError] = useState('')

  useEffect(() => {
    if (!activeJob || !isActive(activeJob)) {
      return
    }
    const timer = window.setInterval(() => {
      void fetchGenerationJob(activeJob.id)
        .then((payload) => {
          onActiveJobChange(payload)
          onJobStatusChange(toWizardStatus(payload))
        })
        .catch((error) => {
          onError(error instanceof Error ? error.message : 'Could not refresh generation job.')
        })
    }, 1500)
    return () => window.clearInterval(timer)
  }, [activeJob, onActiveJobChange, onError, onJobStatusChange])

  useEffect(() => {
    if (!activeJob) {
      return
    }
    onJobStatusChange(toWizardStatus(activeJob))
  }, [activeJob, onJobStatusChange])

  const explainTemperature = 'Lower values keep writing steadier; higher values allow more variation.'
  const explainReasoning = 'Higher effort spends more reasoning budget to improve structure and phrasing.'

  const summaryBadge = useMemo(() => {
    if (!activeJob) {
      return null
    }
    return (
      <Badge variant={activeJob.status === 'completed' ? 'default' : 'secondary'}>
        {activeJob.status} | {activeJob.progress_percent}%
      </Badge>
    )
  }, [activeJob])

  const runFlags = useMemo(
    () =>
      computeRunFlags({
        hasContext: Boolean(runContext),
        selectedSections,
        generationBrief,
        estimate,
      }),
    [estimate, generationBrief, runContext, selectedSections],
  )

  const onEstimateCost = async () => {
    if (selectedSections.length === 0) {
      return
    }
    setBusy('estimate')
    setInlineError('')
    onError('')
    try {
      const payload = await estimateGeneration({
        sections: selectedSections,
        notesContext: `${generationBrief}\nrun_temperature: ${temperature}\nreasoning_effort: ${reasoningEffort}`,
      })
      onEstimateChange(payload)
      onStatus(`Estimated high-side cost: $${payload.estimated_cost_usd_high.toFixed(4)}.`)
    } catch (error) {
      onError(error instanceof Error ? error.message : 'Could not estimate generation.')
    } finally {
      setBusy('')
    }
  }

  const onRunGeneration = async () => {
    setAttemptedRun(true)
    setInlineError('')
    if (!runContext) {
      setInlineError('Context must be saved before running generation.')
      return
    }
    const maxCost = parseOptionalNumber(maxCostUsd)
    const dailyBudget = parseOptionalNumber(dailyBudgetUsd)
    if (maxCostUsd.trim() && maxCost === null) {
      setInlineError('Cost cap must be numeric.')
      return
    }
    if (dailyBudgetUsd.trim() && dailyBudget === null) {
      setInlineError('Daily budget must be numeric.')
      return
    }
    if (selectedSections.length === 0) {
      setInlineError('Select at least one section in Step 2 before running generation.')
      return
    }
    if (!generationBrief.trim()) {
      setInlineError('Generation brief cannot be empty.')
      return
    }

    setBusy('run')
    onError('')
    try {
      const payload = await enqueueGeneration({
        projectId: runContext.projectId,
        manuscriptId: runContext.manuscriptId,
        sections: selectedSections,
        notesContext: `${generationBrief}\nrun_temperature: ${temperature}\nreasoning_effort: ${reasoningEffort}`,
        maxEstimatedCostUsd: maxCost,
        projectDailyBudgetUsd: dailyBudget,
      })
      onActiveJobChange(payload)
      onJobStatusChange('running')
      onStatus(`Generation queued (${payload.id.slice(0, 8)}).`)
    } catch (error) {
      onError(error instanceof Error ? error.message : 'Could not run generation.')
    } finally {
      setBusy('')
    }
  }

  const onCancel = async () => {
    if (!activeJob || !isActive(activeJob)) {
      return
    }
    setBusy('cancel')
    onError('')
    try {
      const payload = await cancelGeneration(activeJob.id)
      onActiveJobChange(payload)
      onJobStatusChange(toWizardStatus(payload))
      onStatus(`Job ${payload.id.slice(0, 8)} is ${payload.status}.`)
    } catch (error) {
      onError(error instanceof Error ? error.message : 'Could not cancel generation.')
    } finally {
      setBusy('')
    }
  }

  const onRetry = async () => {
    if (!activeJob || (activeJob.status !== 'failed' && activeJob.status !== 'cancelled')) {
      return
    }
    setBusy('retry')
    onError('')
    try {
      const payload = await retryGeneration(activeJob.id)
      onActiveJobChange(payload)
      onJobStatusChange('running')
      onStatus(`Retry queued (${payload.id.slice(0, 8)}).`)
    } catch (error) {
      onError(error instanceof Error ? error.message : 'Could not retry generation.')
    } finally {
      setBusy('')
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Step 3: Estimate and Run Generation</CardTitle>
        <CardDescription>Set run parameters, estimate spend, and launch generation from one panel.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-sm text-muted-foreground">Use the generation brief to tell the model exactly what to prioritise in this run.</p>

        <div className="rounded-md border border-border/70 bg-muted/20 p-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-xs font-medium text-muted-foreground">Generation brief</p>
            <div className="flex gap-2">
              <Button
                size="sm"
                variant="outline"
                className="text-muted-foreground hover:text-foreground"
                onClick={() => onGenerationBriefChange(suggestedBrief)}
              >
                Use suggested brief
              </Button>
              <Button
                size="sm"
                variant="ghost"
                className="text-muted-foreground hover:text-foreground"
                onClick={() => onGenerationBriefChange('')}
              >
                Clear
              </Button>
            </div>
          </div>
          <p className="mt-1 text-xs text-muted-foreground">
            Include objective, data source, section priorities, and any wording constraints.
          </p>
          <textarea
            className="mt-2 min-h-28 w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
            value={generationBrief}
            onChange={(event) => onGenerationBriefChange(event.target.value)}
            placeholder={'Objective: ...\nData source: ...\nPriority sections: ...\nConstraints: ...'}
          />
        </div>

        {runFlags.length > 0 ? (
          <div className="space-y-2 rounded-md border border-border/70 bg-muted/20 p-3 text-xs">
            <p className="font-medium">Pre-flight flags</p>
            {runFlags.map((flag) => (
              <div
                key={flag.text}
                className={flag.tone === 'warn' ? 'flex items-start gap-2 text-amber-700' : 'flex items-start gap-2 text-muted-foreground'}
              >
                <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                <span>{flag.text}</span>
              </div>
            ))}
          </div>
        ) : null}

        <div className="grid gap-3 md:grid-cols-2">
          <div className="space-y-1">
            <div className="flex items-center gap-1 text-xs font-medium text-muted-foreground">
              Temperature
              <TooltipProvider delayDuration={100}>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Info className="h-3.5 w-3.5 cursor-help" />
                  </TooltipTrigger>
                  <TooltipContent>{explainTemperature}</TooltipContent>
                </Tooltip>
              </TooltipProvider>
            </div>
            <div className="flex items-center gap-2">
              <input
                type="range"
                min={0}
                max={1}
                step={0.1}
                value={temperature}
                onChange={(event) => onTemperatureChange(Number(event.target.value))}
                className="h-2 w-full"
              />
              <span className="w-10 text-right text-xs">{temperature.toFixed(1)}</span>
            </div>
          </div>

          <div className="space-y-1">
            <div className="flex items-center gap-1 text-xs font-medium text-muted-foreground">
              Reasoning effort
              <TooltipProvider delayDuration={100}>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Info className="h-3.5 w-3.5 cursor-help" />
                  </TooltipTrigger>
                  <TooltipContent>{explainReasoning}</TooltipContent>
                </Tooltip>
              </TooltipProvider>
            </div>
            <select
              className="h-9 w-full rounded-md border border-border bg-background px-3 text-sm"
              value={reasoningEffort}
              onChange={(event) => onReasoningEffortChange(event.target.value as 'low' | 'medium' | 'high')}
            >
              <option value="low">low</option>
              <option value="medium">medium</option>
              <option value="high">high</option>
            </select>
          </div>
        </div>

        <div className="grid gap-3 md:grid-cols-2">
          <Input value={maxCostUsd} onChange={(event) => onMaxCostChange(event.target.value)} placeholder="Per-run cost cap (USD)" />
          <Input value={dailyBudgetUsd} onChange={(event) => onDailyBudgetChange(event.target.value)} placeholder="Daily budget cap (USD)" />
        </div>

        {attemptedRun && inlineError ? <p className="text-xs text-destructive">{inlineError}</p> : null}

        <div className="flex flex-wrap items-center gap-2">
          <Button variant="outline" className="text-muted-foreground hover:text-foreground" onClick={onEstimateCost} disabled={busy === 'estimate'}>
            {busy === 'estimate' ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : null}
            Estimate cost
          </Button>
          <Button onClick={onRunGeneration} disabled={busy === 'run'}>
            {busy === 'run' ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <Play className="mr-1 h-4 w-4" />}
            Run generation
          </Button>
          {estimate ? (
            <Badge variant="secondary">
              ${estimate.estimated_cost_usd_low.toFixed(4)}-${estimate.estimated_cost_usd_high.toFixed(4)}
            </Badge>
          ) : null}
          {summaryBadge}
        </div>

        <div className="rounded-md border border-border p-3 text-xs">
          <p className="font-medium">Job status</p>
          {!activeJob ? (
            <p className="text-muted-foreground">No generation job started yet.</p>
          ) : (
            <div className="space-y-1 text-muted-foreground">
              <p>Status: {activeJob.status}</p>
              <p>Created: {formatTimestamp(activeJob.created_at)}</p>
              <p>Started: {formatTimestamp(activeJob.started_at)}</p>
              <p>Completed: {formatTimestamp(activeJob.completed_at)}</p>
              <p>Current section: {activeJob.current_section ?? 'n/a'}</p>
            </div>
          )}

          {activeJob ? (
            <div className="mt-2 flex flex-wrap gap-2">
              <Button size="sm" variant="outline" onClick={onCancel} disabled={!isActive(activeJob) || busy === 'cancel'}>
                {busy === 'cancel' ? <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" /> : <Square className="mr-1 h-3.5 w-3.5" />}
                Cancel
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={onRetry}
                disabled={(activeJob.status !== 'failed' && activeJob.status !== 'cancelled') || busy === 'retry'}
              >
                {busy === 'retry' ? <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" /> : <RotateCcw className="mr-1 h-3.5 w-3.5" />}
                Retry
              </Button>
            </div>
          ) : null}
        </div>
      </CardContent>
    </Card>
  )
}
