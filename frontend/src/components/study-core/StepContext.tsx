import { Loader2, Mic, Save, Square } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'

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

const PRIMARY_ACTION_BUTTON_CLASS =
  'bg-emerald-600 text-white hover:bg-emerald-700 focus-visible:ring-emerald-500'
const SECONDARY_ACTION_BUTTON_CLASS =
  'border-emerald-200 text-emerald-700 hover:bg-emerald-50 focus-visible:ring-emerald-500'

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
  const [isListening, setIsListening] = useState(false)
  const recognitionRef = useRef<any | null>(null)
  const summaryValueRef = useRef(values.researchObjective)

  const speechSupported = useMemo(() => {
    if (typeof window === 'undefined') {
      return false
    }
    const speechWindow = window as Window & {
      SpeechRecognition?: new () => any
      webkitSpeechRecognition?: new () => any
    }
    return Boolean(speechWindow.SpeechRecognition || speechWindow.webkitSpeechRecognition)
  }, [])

  useEffect(() => {
    summaryValueRef.current = values.researchObjective
  }, [values.researchObjective])

  useEffect(() => {
    return () => {
      if (!recognitionRef.current) {
        return
      }
      try {
        recognitionRef.current.stop()
      } catch {
        // no-op
      }
    }
  }, [])

  const errors = useMemo(() => {
    const nextErrors: Record<string, string> = {}
    if (!values.projectTitle.trim()) {
      nextErrors.projectTitle = 'Proposed project title is required.'
    }
    if (!values.studyArchitecture.trim()) {
      nextErrors.studyArchitecture = 'Research type is required.'
    }
    if (!values.researchObjective.trim()) {
      nextErrors.researchObjective = 'Summary of research is required.'
    }
    return nextErrors
  }, [values.projectTitle, values.researchObjective, values.studyArchitecture])

  const onToggleSpeechToText = () => {
    onError('')
    if (!speechSupported) {
      onError('Speech-to-text is not supported in this browser.')
      return
    }

    if (isListening) {
      try {
        recognitionRef.current?.stop()
      } catch {
        // no-op
      }
      setIsListening(false)
      return
    }

    const speechWindow = window as Window & {
      SpeechRecognition?: new () => any
      webkitSpeechRecognition?: new () => any
    }

    if (!recognitionRef.current) {
      const SpeechRecognitionCtor = speechWindow.SpeechRecognition || speechWindow.webkitSpeechRecognition
      if (!SpeechRecognitionCtor) {
        onError('Speech-to-text is not supported in this browser.')
        return
      }
      const recognition = new SpeechRecognitionCtor()
      recognition.continuous = true
      recognition.interimResults = false
      recognition.lang = 'en-US'
      recognition.onresult = (event: any) => {
        let transcript = ''
        for (let index = event.resultIndex; index < event.results.length; index += 1) {
          const result = event.results[index]
          if (result?.isFinal && result[0]?.transcript) {
            transcript += `${result[0].transcript} `
          }
        }
        const cleaned = transcript.trim()
        if (!cleaned) {
          return
        }
        const existing = summaryValueRef.current.trim()
        const nextValue = existing ? `${existing} ${cleaned}` : cleaned
        onValueChange('researchObjective', nextValue)
      }
      recognition.onerror = () => {
        setIsListening(false)
        onError('Speech-to-text input failed. Try again.')
      }
      recognition.onend = () => {
        setIsListening(false)
      }
      recognitionRef.current = recognition
    }

    try {
      recognitionRef.current.start()
      setIsListening(true)
    } catch {
      onError('Speech-to-text could not start. Try again.')
      setIsListening(false)
    }
  }

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
      onStatus(`Research summary saved (${payload.project.id.slice(0, 8)} / ${payload.manuscript.id.slice(0, 8)}).`)
    } catch (error) {
      onError(error instanceof Error ? error.message : 'Could not save research summary.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="space-y-5 rounded-lg border border-border bg-card p-6">
      <div className="space-y-1">
        <h2 className="text-base font-semibold">Step 1: Research overview</h2>
        <p className="text-sm text-muted-foreground">Capture the study overview before section planning.</p>
      </div>

      <div className="space-y-1">
        <Label htmlFor="context-project-title">Proposed project title</Label>
        <Input
          id="context-project-title"
          value={values.projectTitle}
          placeholder="e.g., Pulmonary Hypertension Cohort"
          onChange={(event) => onValueChange('projectTitle', event.target.value)}
        />
        {attemptedSubmit && errors.projectTitle ? <p className="text-xs text-destructive">{errors.projectTitle}</p> : null}
      </div>

      <div className="space-y-1">
        <Label htmlFor="context-target-journal">Working target journal</Label>
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

      <div className="space-y-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <Label htmlFor="context-research-objective">Summary of research</Label>
          <Button
            type="button"
            size="sm"
            variant="outline"
            className={SECONDARY_ACTION_BUTTON_CLASS}
            onClick={onToggleSpeechToText}
            disabled={!speechSupported}
          >
            {isListening ? <Square className="mr-1 h-3.5 w-3.5" /> : <Mic className="mr-1 h-3.5 w-3.5" />}
            {isListening ? 'Stop speech input' : 'Speech to text'}
          </Button>
        </div>
        <textarea
          id="context-research-objective"
          className="min-h-56 w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
          placeholder="Summarise the research in 2-4 sentences. Provide information on the clinical problem, methods used, and the key results from the data (if available)."
          value={values.researchObjective}
          onChange={(event) => onValueChange('researchObjective', event.target.value)}
        />
        {!speechSupported ? <p className="text-xs text-muted-foreground">Speech to text is not available in this browser.</p> : null}
        {attemptedSubmit && errors.researchObjective ? <p className="text-xs text-destructive">{errors.researchObjective}</p> : null}
      </div>

      <Button className={PRIMARY_ACTION_BUTTON_CLASS} onClick={() => void onSaveContext()} disabled={saving}>
        {saving ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <Save className="mr-1 h-4 w-4" />}
        Save research summary
      </Button>
    </div>
  )
}
