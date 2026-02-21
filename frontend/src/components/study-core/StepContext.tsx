import { ExternalLink, Loader2, Mic, Save, Square } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  INTERPRETATION_MODE_OPTIONS,
  getCategoryForStudyType,
  getResearchTypeTaxonomy,
  getJournalSubmissionGuidanceUrl,
  getStudyTypeDefaults,
  getStudyTypesForCategory,
} from '@/lib/research-frame-options'
import { bootstrapRunContext } from '@/lib/study-core-api'
import type { JournalOption } from '@/types/study-core'

export type ContextFormValues = {
  projectTitle: string
  researchCategory: string
  studyArchitecture: string
  interpretationMode: string
  recommendedArticleType: string
  recommendedWordLength: string
  researchObjective: string
}

type StepContextProps = {
  values: ContextFormValues
  targetJournal: string
  journals: JournalOption[]
  journalRecommendationsLocked: boolean
  onValueChange: (field: keyof ContextFormValues, value: string) => void
  onTargetJournalChange: (value: string) => void
  onContextSaved: (payload: { projectId: string; manuscriptId: string; recommendedSections: string[] }) => void
  onStudyTypeDefaultsResolved: (defaults: { interpretationMode: string; enableConservativeGuardrails: boolean }) => void
  onStatus: (message: string) => void
  onError: (message: string) => void
}

const PRIMARY_ACTION_BUTTON_CLASS =
  'bg-emerald-600 text-white hover:bg-emerald-700 focus-visible:ring-emerald-500'
const SECONDARY_ACTION_BUTTON_CLASS =
  'border-emerald-200 text-emerald-700 hover:bg-emerald-50 focus-visible:ring-emerald-500'

function buildAnalysisSummary(values: ContextFormValues): string {
  const parts: string[] = []
  if (!values.interpretationMode.trim()) {
    parts.push('Interpretation mode: Associative')
  } else {
    parts.push(`Interpretation mode: ${values.interpretationMode.trim()}`)
  }
  if (values.recommendedArticleType.trim()) {
    parts.push(`Recommended article type: ${values.recommendedArticleType.trim()}`)
  }
  if (values.recommendedWordLength.trim()) {
    parts.push(`Recommended word length: ${values.recommendedWordLength.trim()}`)
  }
  return parts.join(' | ')
}

export function StepContext({
  values,
  targetJournal,
  journals,
  journalRecommendationsLocked,
  onValueChange,
  onTargetJournalChange,
  onContextSaved,
  onStudyTypeDefaultsResolved,
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
    if (!values.researchObjective.trim()) {
      nextErrors.researchObjective = 'Summary of research is required.'
    }
    return nextErrors
  }, [values.researchObjective])

  const researchCategories = useMemo(() => getResearchTypeTaxonomy(true), [])
  const studyTypeOptions = useMemo(
    () => getStudyTypesForCategory(values.researchCategory, true),
    [values.researchCategory],
  )
  const submissionGuidanceUrl = useMemo(() => getJournalSubmissionGuidanceUrl(targetJournal), [targetJournal])

  useEffect(() => {
    if (!values.studyArchitecture.trim()) {
      return
    }
    if (values.researchCategory.trim()) {
      return
    }
    const category = getCategoryForStudyType(values.studyArchitecture, true)
    if (!category) {
      return
    }
    onValueChange('researchCategory', category)
  }, [onValueChange, values.researchCategory, values.studyArchitecture])

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
        title: values.projectTitle.trim() || 'Untitled research overview',
        targetJournal,
        answers: {
          study_type: values.studyArchitecture,
          research_objective: values.researchObjective,
          recommended_article_type: values.recommendedArticleType,
          recommended_word_length: values.recommendedWordLength,
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
      </div>

      <div className="space-y-1">
        <div className="flex items-center justify-between gap-2">
          <Label htmlFor="context-target-journal">Working target journal</Label>
          {submissionGuidanceUrl ? (
            <a
              href={submissionGuidanceUrl}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1 rounded-md border border-border bg-background px-2 py-1 text-xs text-slate-700 hover:bg-slate-100"
            >
              Submission guide
              <ExternalLink className="h-3 w-3" />
            </a>
          ) : null}
        </div>
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
        <Label htmlFor="context-research-category">Research category</Label>
        <select
          id="context-research-category"
          className="h-9 w-full rounded-md border border-border bg-background px-3 text-sm"
          value={values.researchCategory}
          onChange={(event) => {
            const nextCategory = event.target.value
            onValueChange('researchCategory', nextCategory)
            if (values.studyArchitecture && !getStudyTypesForCategory(nextCategory, true).includes(values.studyArchitecture)) {
              onValueChange('studyArchitecture', '')
              if (values.interpretationMode) {
                onValueChange('interpretationMode', '')
              }
            }
          }}
        >
          <option value="">Select research category</option>
          {researchCategories.map((option) => (
            <option key={option.category} value={option.category}>
              {option.category}
            </option>
          ))}
        </select>
      </div>

      <div className="space-y-1">
        <Label htmlFor="context-study-architecture">Study type</Label>
        <select
          id="context-study-architecture"
          className="h-9 w-full rounded-md border border-border bg-background px-3 text-sm"
          value={values.studyArchitecture}
          onChange={(event) => {
            const nextStudyType = event.target.value
            onValueChange('studyArchitecture', nextStudyType)
            if (!nextStudyType) {
              return
            }
            const defaults = getStudyTypeDefaults(nextStudyType)
            if (!values.interpretationMode.trim()) {
              onValueChange('interpretationMode', defaults.defaultInterpretationMode)
            }
            onStudyTypeDefaultsResolved({
              interpretationMode: defaults.defaultInterpretationMode,
              enableConservativeGuardrails: defaults.enableConservativeGuardrails,
            })
          }}
          disabled={!values.researchCategory.trim()}
        >
          <option value="">{values.researchCategory ? 'Select study type' : 'Select research category first'}</option>
          {studyTypeOptions.map((option) => (
            <option key={option} value={option}>
              {option}
            </option>
          ))}
        </select>
      </div>

      <div className="space-y-1">
        <Label htmlFor="context-recommended-article-type">Recommended article type</Label>
        <Input
          id="context-recommended-article-type"
          value={values.recommendedArticleType}
          placeholder="Auto-populated from journal guidance"
          onChange={(event) => onValueChange('recommendedArticleType', event.target.value)}
          disabled={journalRecommendationsLocked}
        />
        {journalRecommendationsLocked ? (
          <p className="text-xs text-muted-foreground">Locked after applying recommendation. Refresh suggestions to unlock.</p>
        ) : null}
      </div>

      <div className="space-y-1">
        <Label htmlFor="context-recommended-word-length">Recommended word length</Label>
        <Input
          id="context-recommended-word-length"
          value={values.recommendedWordLength}
          placeholder="Auto-populated from journal guidance"
          onChange={(event) => onValueChange('recommendedWordLength', event.target.value)}
          disabled={journalRecommendationsLocked}
        />
        {journalRecommendationsLocked ? (
          <p className="text-xs text-muted-foreground">Locked after applying recommendation. Refresh suggestions to unlock.</p>
        ) : null}
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
        <p className="text-xs text-muted-foreground">
          AI suggestion uses journal, research category, study type, article type, and summary.
        </p>
      </div>

      <Button className={PRIMARY_ACTION_BUTTON_CLASS} onClick={() => void onSaveContext()} disabled={saving}>
        {saving ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <Save className="mr-1 h-4 w-4" />}
        Save research summary
      </Button>
    </div>
  )
}
