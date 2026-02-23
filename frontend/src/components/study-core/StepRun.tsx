import { Loader2, Play, RotateCcw, Square } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { getAuthSessionToken } from '@/lib/auth-session'
import {
  cancelGeneration,
  enqueueGeneration,
  estimateGeneration,
  fetchManuscriptAuthorSuggestions,
  fetchManuscriptAuthors,
  fetchGenerationJob,
  retryGeneration,
  saveManuscriptAuthors,
} from '@/lib/study-core-api'
import type {
  GenerationEstimate,
  GenerationJobPayload,
  ManuscriptAuthorSuggestion,
  ManuscriptAuthorsPayload,
} from '@/types/study-core'

type RunContext = { projectId: string; manuscriptId: string } | null

type RunRecommendations = {
  conservativeWithLimitations: boolean
  uncertaintyInResults: boolean
  mechanisticAsHypothesis: boolean
}

type AuthorDraft = {
  collaborator_id: string | null
  full_name: string
  orcid_id: string | null
  institution: string | null
  is_corresponding: boolean
  equal_contribution: boolean
  is_external: boolean
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

function draftsFromPayload(payload: ManuscriptAuthorsPayload | null): AuthorDraft[] {
  if (!payload) {
    return []
  }
  return (payload.authors || []).map((item) => ({
    collaborator_id: item.collaborator_id || null,
    full_name: item.full_name || '',
    orcid_id: item.orcid_id || null,
    institution: item.institution || null,
    is_corresponding: Boolean(item.is_corresponding),
    equal_contribution: Boolean(item.equal_contribution),
    is_external: Boolean(item.is_external),
  }))
}

function emptyExternalAuthor(): AuthorDraft {
  return {
    collaborator_id: null,
    full_name: '',
    orcid_id: null,
    institution: null,
    is_corresponding: false,
    equal_contribution: false,
    is_external: true,
  }
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
  const [authorQuery, setAuthorQuery] = useState('')
  const [authorSuggestions, setAuthorSuggestions] = useState<ManuscriptAuthorSuggestion[]>([])
  const [authorsDraft, setAuthorsDraft] = useState<AuthorDraft[]>([])
  const [authorsBlock, setAuthorsBlock] = useState('')
  const [authorsStatus, setAuthorsStatus] = useState('')
  const [authorsError, setAuthorsError] = useState('')
  const [authorsBusy, setAuthorsBusy] = useState(false)

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

  useEffect(() => {
    if (!runContext) {
      setAuthorsDraft([])
      setAuthorsBlock('')
      return
    }
    const token = getAuthSessionToken()
    if (!token) {
      return
    }
    let cancelled = false
    setAuthorsBusy(true)
    Promise.allSettled([
      fetchManuscriptAuthors({
        token,
        workspaceId: runContext.manuscriptId,
      }),
      fetchManuscriptAuthorSuggestions({
        token,
        query: '',
        limit: 80,
      }),
    ])
      .then(([authorsResult, suggestionsResult]) => {
        if (cancelled) {
          return
        }
        if (authorsResult.status === 'fulfilled') {
          setAuthorsDraft(draftsFromPayload(authorsResult.value))
          setAuthorsBlock(authorsResult.value.rendered_authors_block || '')
        }
        if (suggestionsResult.status === 'fulfilled') {
          setAuthorSuggestions(suggestionsResult.value)
        }
      })
      .catch((error) => {
        if (cancelled) {
          return
        }
        setAuthorsError(error instanceof Error ? error.message : 'Could not load manuscript authors.')
      })
      .finally(() => {
        if (!cancelled) {
          setAuthorsBusy(false)
        }
      })
    return () => {
      cancelled = true
    }
  }, [runContext])

  const filteredSuggestions = useMemo(() => {
    const query = authorQuery.trim().toLowerCase()
    if (!query) {
      return authorSuggestions.slice(0, 8)
    }
    return authorSuggestions
      .filter((item) =>
        `${item.full_name} ${item.institution || ''} ${item.orcid_id || ''}`.toLowerCase().includes(query),
      )
      .slice(0, 8)
  }, [authorQuery, authorSuggestions])

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

  const addSuggestedAuthor = (suggestion: ManuscriptAuthorSuggestion) => {
    setAuthorsStatus('')
    setAuthorsError('')
    setAuthorsDraft((current) => {
      if (current.some((item) => item.collaborator_id && item.collaborator_id === suggestion.collaborator_id)) {
        return current
      }
      return [
        ...current,
        {
          collaborator_id: suggestion.collaborator_id,
          full_name: suggestion.full_name,
          orcid_id: suggestion.orcid_id || null,
          institution: suggestion.institution || null,
          is_corresponding: false,
          equal_contribution: false,
          is_external: false,
        },
      ]
    })
  }

  const addExternalAuthor = () => {
    setAuthorsStatus('')
    setAuthorsError('')
    setAuthorsDraft((current) => [...current, emptyExternalAuthor()])
  }

  const updateAuthor = (index: number, patch: Partial<AuthorDraft>) => {
    setAuthorsDraft((current) =>
      current.map((item, rowIndex) => {
        if (rowIndex !== index) {
          return item
        }
        return { ...item, ...patch }
      }),
    )
  }

  const removeAuthor = (index: number) => {
    setAuthorsDraft((current) => current.filter((_, rowIndex) => rowIndex !== index))
  }

  const onSaveAuthors = async () => {
    if (!runContext) {
      setAuthorsError('Save context first, then configure authors.')
      return
    }
    const token = getAuthSessionToken()
    if (!token) {
      setAuthorsError('Session token is required.')
      return
    }
    const cleaned = authorsDraft
      .map((item) => ({
        collaborator_id: item.collaborator_id || null,
        full_name: item.full_name.trim(),
        orcid_id: item.orcid_id?.trim() || null,
        institution: item.institution?.trim() || null,
        is_corresponding: Boolean(item.is_corresponding),
        equal_contribution: Boolean(item.equal_contribution),
        is_external: Boolean(item.is_external),
      }))
      .filter((item) => item.full_name.length > 0)
    if (cleaned.length === 0) {
      setAuthorsError('At least one author is required.')
      return
    }
    setAuthorsBusy(true)
    setAuthorsStatus('')
    setAuthorsError('')
    try {
      const payload = await saveManuscriptAuthors({
        token,
        workspaceId: runContext.manuscriptId,
        authors: cleaned,
      })
      setAuthorsDraft(draftsFromPayload(payload))
      setAuthorsBlock(payload.rendered_authors_block || '')
      setAuthorsStatus('Manuscript authors saved.')
    } catch (error) {
      setAuthorsError(error instanceof Error ? error.message : 'Could not save manuscript authors.')
    } finally {
      setAuthorsBusy(false)
    }
  }

  return (
    <div className="space-y-4 rounded-lg border border-border bg-card p-4">
      <div className="space-y-1">
        <h2 className="text-base font-semibold">Step 3: Run Generation</h2>
        <p className="text-sm text-muted-foreground">Select sections and run generation.</p>
      </div>

      <div className="space-y-3 rounded-md border border-border/70 bg-muted/20 p-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-sm font-medium">Authors</p>
          <Button type="button" size="sm" variant="outline" onClick={addExternalAuthor}>
            Add external author
          </Button>
        </div>
        <p className="text-xs text-muted-foreground">
          Pick collaborators for the manuscript author block. Institutions and ORCID are auto-filled and editable.
        </p>

        <div className="space-y-2">
          <Input
            value={authorQuery}
            onChange={(event) => setAuthorQuery(event.target.value)}
            placeholder="Search collaborators..."
          />
          <div className="flex flex-wrap gap-2">
            {filteredSuggestions.map((suggestion) => (
              <Button
                key={suggestion.collaborator_id}
                type="button"
                size="sm"
                variant="outline"
                onClick={() => addSuggestedAuthor(suggestion)}
              >
                {suggestion.full_name}
              </Button>
            ))}
          </div>
        </div>

        <div className="space-y-2">
          {authorsDraft.length === 0 ? (
            <p className="text-xs text-muted-foreground">No authors selected yet.</p>
          ) : null}
          {authorsDraft.map((item, index) => (
            <div key={`${item.collaborator_id || 'external'}-${index}`} className="space-y-2 rounded border border-border p-2">
              <div className="grid gap-2 md:grid-cols-3">
                <Input
                  value={item.full_name}
                  onChange={(event) => updateAuthor(index, { full_name: event.target.value })}
                  placeholder="Full name"
                />
                <Input
                  value={item.institution || ''}
                  onChange={(event) => updateAuthor(index, { institution: event.target.value })}
                  placeholder="Institution"
                />
                <Input
                  value={item.orcid_id || ''}
                  onChange={(event) => updateAuthor(index, { orcid_id: event.target.value })}
                  placeholder="ORCID"
                />
              </div>
              <div className="flex flex-wrap items-center gap-4 text-xs">
                <label className="inline-flex items-center gap-1">
                  <input
                    type="checkbox"
                    checked={item.is_corresponding}
                    onChange={(event) => updateAuthor(index, { is_corresponding: event.target.checked })}
                  />
                  Corresponding author
                </label>
                <label className="inline-flex items-center gap-1">
                  <input
                    type="checkbox"
                    checked={item.equal_contribution}
                    onChange={(event) => updateAuthor(index, { equal_contribution: event.target.checked })}
                  />
                  Equal contribution
                </label>
                <label className="inline-flex items-center gap-1">
                  <input
                    type="checkbox"
                    checked={item.is_external}
                    onChange={(event) => updateAuthor(index, { is_external: event.target.checked })}
                  />
                  External author
                </label>
                <Button type="button" size="sm" variant="ghost" onClick={() => removeAuthor(index)}>
                  Remove
                </Button>
              </div>
            </div>
          ))}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Button type="button" size="sm" onClick={onSaveAuthors} disabled={authorsBusy || !runContext}>
            Save authors
          </Button>
          {authorsBusy ? <p className="text-xs text-muted-foreground">Saving...</p> : null}
        </div>
        {authorsStatus ? <p className="text-xs text-emerald-700">{authorsStatus}</p> : null}
        {authorsError ? <p className="text-xs text-destructive">{authorsError}</p> : null}
        {authorsBlock ? (
          <textarea
            className="min-h-24 w-full rounded-md border border-border bg-background px-3 py-2 text-xs"
            value={authorsBlock}
            readOnly
          />
        ) : null}
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
