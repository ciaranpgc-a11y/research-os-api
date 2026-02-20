import { Loader2, Play, RotateCcw, Square } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  cancelGeneration,
  enqueueGeneration,
  estimateGeneration,
  fetchGenerationJob,
  retryGeneration,
} from '@/lib/study-core-api'
import type { GenerationEstimate, GenerationJobPayload } from '@/types/study-core'

type RunContext = { projectId: string; manuscriptId: string } | null

type RunRecommendations = {
  conservativeWithLimitations: boolean
  uncertaintyInResults: boolean
  mechanisticAsHypothesis: boolean
}

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
  recommendations: RunRecommendations
  onSectionsChange: (sections: string[]) => void
  onGenerationBriefChange: (value: string) => void
  onTemperatureChange: (value: number) => void
  onReasoningEffortChange: (value: 'low' | 'medium' | 'high') => void
  onMaxCostChange: (value: string) => void
  onDailyBudgetChange: (value: string) => void
  onEstimateChange: (value: GenerationEstimate | null) => void
  onActiveJobChange: (value: GenerationJobPayload | null) => void
  onJobStatusChange: (value: 'idle' | 'running' | 'succeeded' | 'failed') => void
  onRegisterRunActions?: (actions: { runWithRecommended: () => void; runAnyway: () => void } | null) => void
  onStatus: (message: string) => void
  onError: (message: string) => void
}

const CORE_SECTIONS = ['introduction', 'methods', 'results', 'discussion']

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

function toggleSection(section: string, current: string[]): string[] {
  if (current.includes(section)) {
    return current.filter((item) => item !== section)
  }
  return [...current, section]
}

function titleCaseSection(section: string): string {
  return section
    .split('_')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ')
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
  recommendations,
  onSectionsChange,
  onGenerationBriefChange,
  onTemperatureChange,
  onReasoningEffortChange,
  onMaxCostChange,
  onDailyBudgetChange,
  onEstimateChange,
  onActiveJobChange,
  onJobStatusChange,
  onRegisterRunActions,
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

  const recommendationLines = useMemo(() => {
    const lines: string[] = []
    if (recommendations.conservativeWithLimitations) {
      lines.push('Use conservative associative phrasing and emphasize study limitations.')
    }
    if (recommendations.uncertaintyInResults) {
      lines.push('Report uncertainty with every primary estimate in Results.')
    }
    if (recommendations.mechanisticAsHypothesis) {
      lines.push('Label mechanistic statements as hypotheses, not established mechanisms.')
    }
    return lines
  }, [recommendations.conservativeWithLimitations, recommendations.mechanisticAsHypothesis, recommendations.uncertaintyInResults])

  const buildNotesContext = (forceRecommended: boolean): string => {
    const activeRecommendationLines = forceRecommended
      ? [
          'Use conservative associative phrasing and emphasize study limitations.',
          'Report uncertainty with every primary estimate in Results.',
          'Label mechanistic statements as hypotheses, not established mechanisms.',
        ]
      : recommendationLines

    return [
      generationBrief.trim(),
      ...activeRecommendationLines,
      `run_temperature: ${temperature}`,
      `reasoning_effort: ${reasoningEffort}`,
    ]
      .filter(Boolean)
      .join('\n')
  }

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
        notesContext: buildNotesContext(false),
      })
      onEstimateChange(payload)
      onStatus(`Estimated high-side cost: $${payload.estimated_cost_usd_high.toFixed(4)}.`)
    } catch (error) {
      onError(error instanceof Error ? error.message : 'Could not estimate generation.')
    } finally {
      setBusy('')
    }
  }

  const runGeneration = async (forceRecommended: boolean) => {
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
      setInlineError('Select at least one section before running generation.')
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
        notesContext: buildNotesContext(forceRecommended),
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

  useEffect(() => {
    if (!onRegisterRunActions) {
      return
    }
    onRegisterRunActions({
      runWithRecommended: () => {
        void runGeneration(true)
      },
      runAnyway: () => {
        void runGeneration(false)
      },
    })
    return () => {
      onRegisterRunActions(null)
    }
  }, [
    dailyBudgetUsd,
    generationBrief,
    maxCostUsd,
    onRegisterRunActions,
    recommendations.conservativeWithLimitations,
    recommendations.mechanisticAsHypothesis,
    recommendations.uncertaintyInResults,
    reasoningEffort,
    runContext,
    selectedSections,
    temperature,
  ])

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
    <div className="space-y-4 rounded-lg border border-border bg-card p-4">
      <div className="space-y-1">
        <h2 className="text-base font-semibold">Step 3: Run Generation</h2>
        <p className="text-sm text-muted-foreground">Select sections and run generation.</p>
      </div>

      <div className="space-y-2">
        <p className="text-xs font-medium text-muted-foreground">Sections to generate</p>
        <div className="flex flex-wrap gap-2">
          {CORE_SECTIONS.map((section) => (
            <Button
              key={section}
              size="sm"
              variant="outline"
              className={
                selectedSections.includes(section)
                  ? 'border-border bg-muted text-foreground hover:bg-muted/80'
                  : 'text-muted-foreground hover:text-foreground'
              }
              onClick={() => onSectionsChange(toggleSection(section, selectedSections))}
            >
              {titleCaseSection(section)}
            </Button>
          ))}
        </div>
      </div>

      <Button onClick={() => void runGeneration(false)} disabled={busy === 'run'}>
        {busy === 'run' ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <Play className="mr-1 h-4 w-4" />}
        Run generation
      </Button>

      {attemptedRun && inlineError ? <p className="text-xs text-destructive">{inlineError}</p> : null}

      <details className="rounded-md border border-border/70 bg-muted/20 p-3">
        <summary className="cursor-pointer text-sm font-medium">Details</summary>
        <div className="mt-3 space-y-3">
          <div className="space-y-1">
            <div className="flex items-center justify-between gap-2">
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
                <Button size="sm" variant="ghost" className="text-muted-foreground hover:text-foreground" onClick={() => onGenerationBriefChange('')}>
                  Clear
                </Button>
              </div>
            </div>
            <textarea
              className="min-h-28 w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
              value={generationBrief}
              onChange={(event) => onGenerationBriefChange(event.target.value)}
              placeholder={'Objective: ...\nConstraints: ...'}
            />
          </div>

          <div className="grid gap-3 md:grid-cols-2">
            <div className="space-y-1">
              <p className="text-xs font-medium text-muted-foreground">Temperature</p>
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
              <p className="text-xs font-medium text-muted-foreground">Reasoning effort</p>
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

          <div className="flex flex-wrap items-center gap-2">
            <Button
              variant="outline"
              className="text-muted-foreground hover:text-foreground"
              onClick={onEstimateCost}
              disabled={busy === 'estimate' || selectedSections.length === 0}
            >
              {busy === 'estimate' ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : null}
              Estimate cost
            </Button>
            {estimate ? (
              <p className="text-xs text-muted-foreground">
                Cost range: ${estimate.estimated_cost_usd_low.toFixed(4)}-${estimate.estimated_cost_usd_high.toFixed(4)}
              </p>
            ) : (
              <p className="text-xs text-muted-foreground">No estimate yet.</p>
            )}
          </div>

          <div className="rounded-md border border-border bg-background p-3 text-xs">
            <p className="font-medium">Job status</p>
            {!activeJob ? (
              <p className="text-muted-foreground">No generation job started yet.</p>
            ) : (
              <div className="space-y-1 text-muted-foreground">
                <p>Status: {activeJob.status}</p>
                <p>Progress: {activeJob.progress_percent}%</p>
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
        </div>
      </details>
    </div>
  )
}
