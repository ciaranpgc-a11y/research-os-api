import { Loader2, Save } from 'lucide-react'
import { useMemo, useState } from 'react'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { INTERPRETATION_MODE_OPTIONS, RESEARCH_TYPE_OPTIONS } from '@/lib/research-frame-options'
import { bootstrapRunContext } from '@/lib/study-core-api'
import type { JournalOption } from '@/types/study-core'

export type ContextFormValues = {
  projectTitle: string
  studyArchitecture: string
  interpretationMode: string
  researchObjective: string
}

type StepContextProps = {
  values: ContextFormValues
  targetJournal: string
  journals: JournalOption[]
  onValueChange: (field: keyof ContextFormValues, value: string) => void
  onTargetJournalChange: (value: string) => void
  onContextSaved: (payload: { projectId: string; manuscriptId: string; recommendedSections: string[] }) => void
  onStatus: (message: string) => void
  onError: (message: string) => void
}

function buildAnalysisSummary(values: ContextFormValues): string {
  if (!values.interpretationMode.trim()) {
    return 'Interpretation mode: Associative'
  }
  return `Interpretation mode: ${values.interpretationMode.trim()}`
}

export function StepContext({
  values,
  targetJournal,
  journals,
  onValueChange,
  onTargetJournalChange,
  onContextSaved,
  onStatus,
  onError,
}: StepContextProps) {
  const [attemptedSubmit, setAttemptedSubmit] = useState(false)
  const [saving, setSaving] = useState(false)

  const errors = useMemo(() => {
    const nextErrors: Record<string, string> = {}
    if (!values.projectTitle.trim()) {
      nextErrors.projectTitle = 'Project title is required.'
    }
    if (!values.studyArchitecture.trim()) {
      nextErrors.studyArchitecture = 'Research type is required.'
    }
    if (!values.researchObjective.trim()) {
      nextErrors.researchObjective = 'Core objective summary is required.'
    }
    return nextErrors
  }, [values.projectTitle, values.researchObjective, values.studyArchitecture])

  const onSaveContext = async () => {
    setAttemptedSubmit(true)
    if (Object.keys(errors).length > 0) {
      return
    }

    setSaving(true)
    onError('')
    try {
      const analysisSummary = buildAnalysisSummary(values)
      const payload = await bootstrapRunContext({
        title: values.projectTitle,
        targetJournal,
        answers: {
          study_type: values.studyArchitecture,
          research_objective: values.researchObjective,
          primary_data_source: 'manual_input',
          primary_analytical_claim: values.interpretationMode || 'Associative',
          analysis_summary: analysisSummary,
          disease_focus: '',
          population: '',
          primary_outcome: '',
          manuscript_goal: 'generate_full_manuscript',
          data_source: 'manual_entry',
        },
      })
      onContextSaved({
        projectId: payload.project.id,
        manuscriptId: payload.manuscript.id,
        recommendedSections: payload.inference.recommended_sections,
      })
      onStatus(`Research frame saved (${payload.project.id.slice(0, 8)} / ${payload.manuscript.id.slice(0, 8)}).`)
    } catch (error) {
      onError(error instanceof Error ? error.message : 'Could not save research frame.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="space-y-5 rounded-lg border border-border bg-card p-5">
      <div className="space-y-1">
        <h2 className="text-base font-semibold">Step 1: Research Frame</h2>
        <p className="text-sm text-muted-foreground">Define the inferential contract before section planning.</p>
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        <div className="space-y-1">
          <Label htmlFor="context-project-title">Project title</Label>
          <Input
            id="context-project-title"
            value={values.projectTitle}
            placeholder="e.g., Pulmonary Hypertension Cohort"
            onChange={(event) => onValueChange('projectTitle', event.target.value)}
          />
          {attemptedSubmit && errors.projectTitle ? <p className="text-xs text-destructive">{errors.projectTitle}</p> : null}
        </div>

        <div className="space-y-1">
          <Label htmlFor="context-target-journal">Target journal</Label>
          <select
            id="context-target-journal"
            className="h-9 w-full rounded-md border border-border bg-background px-3 text-sm"
            value={targetJournal}
            onChange={(event) => onTargetJournalChange(event.target.value)}
          >
            {journals.map((journal) => (
              <option key={journal.slug} value={journal.slug}>
                {journal.display_name}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        <div className="space-y-1">
          <Label htmlFor="context-study-architecture">Research type</Label>
          <select
            id="context-study-architecture"
            className="h-9 w-full rounded-md border border-border bg-background px-3 text-sm"
            value={values.studyArchitecture}
            onChange={(event) => onValueChange('studyArchitecture', event.target.value)}
          >
            <option value="">Select research type</option>
            {RESEARCH_TYPE_OPTIONS.map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </select>
          {attemptedSubmit && errors.studyArchitecture ? <p className="text-xs text-destructive">{errors.studyArchitecture}</p> : null}
        </div>

        <div className="space-y-1">
          <Label htmlFor="context-interpretation-mode">Interpretation mode (optional)</Label>
          <select
            id="context-interpretation-mode"
            className="h-9 w-full rounded-md border border-border bg-background px-3 text-sm"
            value={values.interpretationMode}
            onChange={(event) => onValueChange('interpretationMode', event.target.value)}
          >
            <option value="">Select interpretation mode</option>
            {INTERPRETATION_MODE_OPTIONS.map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="space-y-1">
        <Label htmlFor="context-research-objective">Core objective summary</Label>
        <textarea
          id="context-research-objective"
          className="min-h-44 w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
          placeholder="Summarize the research in 2-4 sentences: population, imaging modality, endpoint, and interpretation scope."
          value={values.researchObjective}
          onChange={(event) => onValueChange('researchObjective', event.target.value)}
        />
        {attemptedSubmit && errors.researchObjective ? <p className="text-xs text-destructive">{errors.researchObjective}</p> : null}
      </div>

      <Button onClick={() => void onSaveContext()} disabled={saving}>
        {saving ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <Save className="mr-1 h-4 w-4" />}
        Save Research Frame
      </Button>
    </div>
  )
}
