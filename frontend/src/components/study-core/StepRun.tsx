import { Loader2, Play, RotateCcw, Square, Info } from 'lucide-react'
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
  notesContext: string
  temperature: number
  reasoningEffort: 'low' | 'medium' | 'high'
  maxCostUsd: string
  dailyBudgetUsd: string
  estimate: GenerationEstimate | null
  activeJob: GenerationJobPayload | null
  onNotesContextChange: (value: string) => void
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

export function StepRun({
  runContext,
  selectedSections,
  notesContext,
  temperature,
  reasoningEffort,
  maxCostUsd,
  dailyBudgetUsd,
  estimate,
  activeJob,
  onNotesContextChange,
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
  const explainReasoning = 'Higher effort spends more reasoning budget to refine structure and phrasing.'

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
        notesContext: `${notesContext}\nrun_temperature: ${temperature}\nreasoning_effort: ${reasoningEffort}`,
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

    setBusy('run')
    onError('')
    try {
      const payload = await enqueueGeneration({
        projectId: runContext.projectId,
        manuscriptId: runContext.manuscriptId,
        sections: selectedSections,
        notesContext: `${notesContext}\nrun_temperature: ${temperature}\nreasoning_effort: ${reasoningEffort}`,
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
        <CardTitle className="text-base">Step 3: Estimate + Run Generation</CardTitle>
        <CardDescription>Estimate expected cost, then run generation and monitor job status in one place.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-sm text-muted-foreground">Set run parameters, estimate the cost, then launch generation for the selected sections.</p>

        <div className="space-y-2">
          <label className="text-xs font-medium text-muted-foreground">Notes context</label>
          <textarea
            className="min-h-24 w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
            value={notesContext}
            onChange={(event) => onNotesContextChange(event.target.value)}
          />
        </div>

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
          <Button variant="outline" onClick={onEstimateCost} disabled={busy === 'estimate'}>
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

