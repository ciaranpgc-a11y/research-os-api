import { Loader2, Save } from 'lucide-react'
import { useMemo, useState } from 'react'

import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { bootstrapRunContext } from '@/lib/study-core-api'
import type { JournalOption } from '@/types/study-core'

export type ContextFormValues = {
  projectTitle: string
  studyType: string
  diseaseFocus: string
  population: string
  primaryOutcome: string
  analysisApproach: string
}

type StepContextProps = {
  values: ContextFormValues
  targetJournal: string
  journals: JournalOption[]
  contextSaved: boolean
  contextCard: {
    projectId: string
    manuscriptId: string
  } | null
  onValueChange: (field: keyof ContextFormValues, value: string) => void
  onTargetJournalChange: (value: string) => void
  onContextSaved: (payload: { projectId: string; manuscriptId: string; recommendedSections: string[] }) => void
  onStatus: (message: string) => void
  onError: (message: string) => void
}

export function StepContext({
  values,
  targetJournal,
  journals,
  contextSaved,
  contextCard,
  onValueChange,
  onTargetJournalChange,
  onContextSaved,
  onStatus,
  onError,
}: StepContextProps) {
  const [attemptedSubmit, setAttemptedSubmit] = useState(false)
  const [saving, setSaving] = useState(false)

  const errors = useMemo(() => {
    const nextErrors: Partial<Record<keyof ContextFormValues, string>> = {}
    if (!values.projectTitle.trim()) {
      nextErrors.projectTitle = 'Project name is required.'
    }
    if (!values.studyType.trim()) {
      nextErrors.studyType = 'Study type is required.'
    }
    if (!values.diseaseFocus.trim()) {
      nextErrors.diseaseFocus = 'Disease focus is required.'
    }
    if (!values.population.trim()) {
      nextErrors.population = 'Population is required.'
    }
    if (!values.primaryOutcome.trim()) {
      nextErrors.primaryOutcome = 'Primary outcome is required.'
    }
    if (!values.analysisApproach.trim()) {
      nextErrors.analysisApproach = 'Analysis approach is required.'
    }
    return nextErrors
  }, [values.analysisApproach, values.diseaseFocus, values.population, values.primaryOutcome, values.projectTitle, values.studyType])

  const onSubmit = async () => {
    setAttemptedSubmit(true)
    if (Object.keys(errors).length > 0) {
      return
    }
    setSaving(true)
    onError('')
    try {
      const payload = await bootstrapRunContext({
        title: values.projectTitle,
        targetJournal,
        answers: {
          study_type: values.studyType,
          disease_focus: values.diseaseFocus,
          population: values.population,
          primary_outcome: values.primaryOutcome,
          analysis_summary: values.analysisApproach,
          manuscript_goal: 'generate_full_manuscript',
          data_source: 'manual_entry',
        },
      })
      onContextSaved({
        projectId: payload.project.id,
        manuscriptId: payload.manuscript.id,
        recommendedSections: payload.inference.recommended_sections,
      })
      onStatus(`Context saved (${payload.project.id.slice(0, 8)} / ${payload.manuscript.id.slice(0, 8)}).`)
    } catch (error) {
      onError(error instanceof Error ? error.message : 'Could not save context.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Step 1: Context</CardTitle>
        <CardDescription>Fill in the core study context, then save it to initialize the run.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-sm text-muted-foreground">Provide the minimum study details so the wizard can create a project context and manuscript record.</p>
        <div className="grid gap-3 md:grid-cols-2">
          <div className="space-y-1">
            <Input
              value={values.projectTitle}
              placeholder="Project name"
              onChange={(event) => onValueChange('projectTitle', event.target.value)}
            />
            {attemptedSubmit && errors.projectTitle ? <p className="text-xs text-destructive">{errors.projectTitle}</p> : null}
          </div>
          <div className="space-y-1">
            <Input value={values.studyType} placeholder="Study type" onChange={(event) => onValueChange('studyType', event.target.value)} />
            {attemptedSubmit && errors.studyType ? <p className="text-xs text-destructive">{errors.studyType}</p> : null}
          </div>
          <div className="space-y-1">
            <Input value={values.diseaseFocus} placeholder="Disease focus" onChange={(event) => onValueChange('diseaseFocus', event.target.value)} />
            {attemptedSubmit && errors.diseaseFocus ? <p className="text-xs text-destructive">{errors.diseaseFocus}</p> : null}
          </div>
          <div className="space-y-1">
            <Input value={values.population} placeholder="Population" onChange={(event) => onValueChange('population', event.target.value)} />
            {attemptedSubmit && errors.population ? <p className="text-xs text-destructive">{errors.population}</p> : null}
          </div>
          <div className="space-y-1">
            <Input
              value={values.primaryOutcome}
              placeholder="Primary outcome"
              onChange={(event) => onValueChange('primaryOutcome', event.target.value)}
            />
            {attemptedSubmit && errors.primaryOutcome ? <p className="text-xs text-destructive">{errors.primaryOutcome}</p> : null}
          </div>
          <div className="space-y-1">
            <Input
              value={values.analysisApproach}
              placeholder="Analysis approach"
              onChange={(event) => onValueChange('analysisApproach', event.target.value)}
            />
            {attemptedSubmit && errors.analysisApproach ? <p className="text-xs text-destructive">{errors.analysisApproach}</p> : null}
          </div>
        </div>

        <div className="max-w-md">
          <p className="mb-1 text-xs text-muted-foreground">Target journal</p>
          <select
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

        <Button onClick={onSubmit} disabled={saving}>
          {saving ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <Save className="mr-1 h-4 w-4" />}
          Save Context
        </Button>

        {contextSaved && contextCard ? (
          <div className="rounded-md border border-border bg-muted/50 p-3 text-xs">
            <p className="font-medium">Context Card</p>
            <p>Project ID: {contextCard.projectId}</p>
            <p>Manuscript ID: {contextCard.manuscriptId}</p>
            <p>Study type: {values.studyType}</p>
            <p>Disease focus: {values.diseaseFocus}</p>
            <p>Population: {values.population}</p>
            <p>Primary outcome: {values.primaryOutcome}</p>
            <p>Analysis approach: {values.analysisApproach}</p>
          </div>
        ) : null}
      </CardContent>
    </Card>
  )
}
