import { Loader2, Mic, MicOff, Save } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'

import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { bootstrapRunContext } from '@/lib/study-core-api'
import type { JournalOption } from '@/types/study-core'

type DictationTarget = 'researchObjective'

const STUDY_TYPE_OPTIONS = [
  'Observational',
  'Randomized / interventional',
  'Diagnostic / prognostic',
  'Methods / statistical',
  'Service evaluation',
  'Qualitative',
  'Other',
] as const

type BrowserWindow = Window & {
  SpeechRecognition?: new () => SpeechRecognitionInstance
  webkitSpeechRecognition?: new () => SpeechRecognitionInstance
}

type SpeechRecognitionResultItem = {
  isFinal: boolean
  0: { transcript: string }
}

type SpeechRecognitionEventLike = {
  resultIndex: number
  results: ArrayLike<SpeechRecognitionResultItem>
}

type SpeechRecognitionInstance = {
  continuous: boolean
  interimResults: boolean
  lang: string
  onresult: ((event: SpeechRecognitionEventLike) => void) | null
  onerror: (() => void) | null
  onend: (() => void) | null
  start: () => void
  stop: () => void
}

export type ContextFormValues = {
  projectTitle: string
  researchObjective: string
  primaryDataSource: string
  studyType: string
  primaryAnalyticalClaim: string
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
  const [activeDictationTarget, setActiveDictationTarget] = useState<DictationTarget | null>(null)
  const recognitionRef = useRef<SpeechRecognitionInstance | null>(null)

  const speechCtor = useMemo(() => {
    if (typeof window === 'undefined') {
      return null
    }
    const speechWindow = window as BrowserWindow
    return speechWindow.SpeechRecognition ?? speechWindow.webkitSpeechRecognition ?? null
  }, [])

  const speechSupported = speechCtor !== null

  const errors = useMemo(() => {
    const nextErrors: Record<string, string> = {}
    if (!values.projectTitle.trim()) {
      nextErrors.projectTitle = 'Project title is required.'
    }
    if (!values.researchObjective.trim()) {
      nextErrors.researchObjective = 'Core research question or objective is required.'
    }
    if (!values.studyType.trim()) {
      nextErrors.studyType = 'Study type is required.'
    }
    return nextErrors
  }, [values.projectTitle, values.researchObjective, values.studyType])

  const stopDictation = () => {
    if (!recognitionRef.current) {
      setActiveDictationTarget(null)
      return
    }
    recognitionRef.current.stop()
    recognitionRef.current = null
    setActiveDictationTarget(null)
  }

  useEffect(() => {
    return () => {
      stopDictation()
    }
  }, [])

  const toggleDictation = (existingValue: string, onUpdate: (value: string) => void) => {
    if (!speechCtor) {
      return
    }
    if (activeDictationTarget === 'researchObjective') {
      stopDictation()
      return
    }

    stopDictation()

    const recognition = new speechCtor()
    recognition.continuous = true
    recognition.interimResults = true
    recognition.lang = 'en-GB'

    recognition.onresult = (event) => {
      let nextChunk = ''
      for (let index = event.resultIndex; index < event.results.length; index += 1) {
        const result = event.results[index]
        const transcript = result[0]?.transcript?.trim()
        if (!transcript || !result.isFinal) {
          continue
        }
        nextChunk = `${nextChunk} ${transcript}`.trim()
      }
      if (!nextChunk) {
        return
      }
      onUpdate(`${existingValue.trim()} ${nextChunk}`.trim())
    }
    recognition.onerror = () => {
      setActiveDictationTarget(null)
    }
    recognition.onend = () => {
      if (recognitionRef.current === recognition) {
        recognitionRef.current = null
      }
      setActiveDictationTarget((current) => (current === 'researchObjective' ? null : current))
    }

    recognitionRef.current = recognition
    setActiveDictationTarget('researchObjective')
    recognition.start()
  }

  const onSaveContext = async () => {
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
          research_objective: values.researchObjective,
          primary_data_source: values.primaryDataSource || 'manual_input',
          primary_analytical_claim: values.primaryAnalyticalClaim,
          analysis_summary: values.primaryAnalyticalClaim,
          disease_focus: '',
          population: '',
          primary_outcome: '',
          manuscript_goal: 'generate_full_manuscript',
          data_source: values.primaryDataSource || 'manual_entry',
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
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Step 1: Research Frame</CardTitle>
        <CardDescription>Define the core frame so planning and generation stay focused.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-sm text-muted-foreground">Complete the minimum frame for a new manuscript run.</p>

        <div className="grid gap-3 md:grid-cols-2">
          <div className="space-y-1">
            <Label htmlFor="context-project-title">Project title</Label>
            <Input
              id="context-project-title"
              value={values.projectTitle}
              placeholder="e.g., Community Falls Prevention Evaluation"
              onChange={(event) => onValueChange('projectTitle', event.target.value)}
            />
            {attemptedSubmit && errors.projectTitle ? <p className="text-xs text-destructive">{errors.projectTitle}</p> : null}
          </div>

          <div className="space-y-1">
            <Label htmlFor="context-study-type">Study type</Label>
            <select
              id="context-study-type"
              className="h-9 w-full rounded-md border border-border bg-background px-3 text-sm"
              value={values.studyType}
              onChange={(event) => onValueChange('studyType', event.target.value)}
            >
              {STUDY_TYPE_OPTIONS.map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </select>
            {attemptedSubmit && errors.studyType ? <p className="text-xs text-destructive">{errors.studyType}</p> : null}
          </div>
        </div>

        <div className="space-y-1">
          <div className="flex items-center justify-between gap-2">
            <Label htmlFor="context-research-objective">Core research question / objective</Label>
            <Button
              size="sm"
              variant="outline"
              onClick={() => toggleDictation(values.researchObjective, (next) => onValueChange('researchObjective', next))}
              disabled={!speechSupported}
            >
              {activeDictationTarget === 'researchObjective' ? <MicOff className="mr-1 h-3.5 w-3.5" /> : <Mic className="mr-1 h-3.5 w-3.5" />}
              {activeDictationTarget === 'researchObjective' ? 'Stop dictation' : 'Dictate'}
            </Button>
          </div>
          <textarea
            id="context-research-objective"
            className="min-h-28 w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
            placeholder="e.g., Evaluate whether enhanced outreach reduced 30-day emergency admissions."
            value={values.researchObjective}
            onChange={(event) => onValueChange('researchObjective', event.target.value)}
          />
          {attemptedSubmit && errors.researchObjective ? <p className="text-xs text-destructive">{errors.researchObjective}</p> : null}
        </div>

        <div className="grid gap-3 md:grid-cols-2">
          <div className="space-y-1">
            <Label htmlFor="context-primary-data-source">Primary data source or dataset (optional)</Label>
            <Input
              id="context-primary-data-source"
              value={values.primaryDataSource}
              placeholder="e.g., Trust admissions dataset 2021-2025"
              onChange={(event) => onValueChange('primaryDataSource', event.target.value)}
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="context-primary-analytical-claim">Primary analytical claim (optional)</Label>
            <Input
              id="context-primary-analytical-claim"
              value={values.primaryAnalyticalClaim}
              placeholder="e.g., Difference-in-differences indicates a sustained reduction."
              onChange={(event) => onValueChange('primaryAnalyticalClaim', event.target.value)}
            />
          </div>
        </div>

        <div className="max-w-md space-y-1">
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

        <Button onClick={() => void onSaveContext()} disabled={saving}>
          {saving ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <Save className="mr-1 h-4 w-4" />}
          Save Research Frame
        </Button>

        {contextSaved && contextCard ? (
          <div className="max-w-md rounded-md border border-border bg-muted/40 p-3 text-xs">
            <p className="font-medium">Research Frame Card</p>
            <p>Project ID: {contextCard.projectId}</p>
            <p>Manuscript ID: {contextCard.manuscriptId}</p>
            <p>Study type: {values.studyType || 'Not set'}</p>
          </div>
        ) : null}
      </CardContent>
    </Card>
  )
}
