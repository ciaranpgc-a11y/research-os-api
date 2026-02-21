import { ExternalLink, Loader2, Mic, RotateCcw, Save, Square } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  INTERPRETATION_MODE_OPTIONS,
  getCategoryForStudyType,
  getJournalQualityScore,
  getJournalQualityStars,
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
  saveRequestId?: number
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
const SUMMARY_HELPER_CHIPS: Array<{ id: string; label: string; text: string }> = [
  {
    id: 'clinical-problem',
    label: 'Clinical problem',
    text: 'Clinical problem: [state the clinical context and unmet need].',
  },
  {
    id: 'design-methods',
    label: 'Design/methods',
    text: 'Design and methods: [state study design, modality, cohort, and analytical approach].',
  },
  {
    id: 'key-findings',
    label: 'Key findings',
    text: 'Key findings: [state the main result(s) and uncertainty, if available].',
  },
  {
    id: 'interpretation-scope',
    label: 'Interpretation scope',
    text: 'Interpretation scope: [state associative interpretation and key limitations].',
  },
]

function normalizeHelperText(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, ' ')
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

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

type WordLengthBand = 'short' | 'standard' | 'long' | 'unknown'

function getWordLengthBand(value: string): WordLengthBand {
  const matches = value.match(/\d[\d,]*/g)
  if (!matches || matches.length === 0) {
    return 'unknown'
  }
  const numbers = matches
    .map((part) => Number.parseInt(part.replace(/,/g, ''), 10))
    .filter((part) => Number.isFinite(part))
  if (numbers.length === 0) {
    return 'unknown'
  }
  const upperBound = Math.max(...numbers)
  if (upperBound <= 2500) {
    return 'short'
  }
  if (upperBound >= 5000) {
    return 'long'
  }
  return 'standard'
}

function getWordLengthBoxClass(value: string): string {
  const baseClass = 'rounded-md border p-2'
  const band = getWordLengthBand(value)
  if (band === 'short') {
    return `${baseClass} border-sky-200 bg-sky-50/70`
  }
  if (band === 'long') {
    return `${baseClass} border-violet-200 bg-violet-50/70`
  }
  if (band === 'standard') {
    return `${baseClass} border-slate-300 bg-slate-50/70`
  }
  return `${baseClass} border-border/70 bg-background`
}

export function StepContext({
  values,
  targetJournal,
  journals,
  saveRequestId,
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
  const lastExternalSaveRequestRef = useRef<number>(saveRequestId ?? 0)

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
    if (!targetJournal.trim()) {
      nextErrors.targetJournal = 'Working target journal is required.'
    }
    if (!values.researchObjective.trim()) {
      nextErrors.researchObjective = 'Summary of research is required.'
    }
    return nextErrors
  }, [targetJournal, values.researchObjective])

  const researchCategories = useMemo(() => getResearchTypeTaxonomy(true), [])
  const studyTypeOptions = useMemo(
    () => getStudyTypesForCategory(values.researchCategory, true),
    [values.researchCategory],
  )
  const submissionGuidanceUrl = useMemo(() => getJournalSubmissionGuidanceUrl(targetJournal), [targetJournal])
  const wordLengthBoxClass = useMemo(() => getWordLengthBoxClass(values.recommendedWordLength), [values.recommendedWordLength])
  const journalQualityScore = useMemo(() => getJournalQualityScore(targetJournal), [targetJournal])
  const journalQualityStars = useMemo(() => getJournalQualityStars(targetJournal), [targetJournal])
  const selectedJournalLabel = useMemo(
    () => journals.find((journal) => journal.slug === targetJournal)?.display_name ?? '',
    [journals, targetJournal],
  )
  const targetJournalBoxClass = useMemo(() => {
    const base = 'rounded-md border border-border/70 bg-background p-2'
    if (!selectedJournalLabel) {
      return base
    }
    if (journalQualityScore >= 5) {
      return `${base} shadow-md shadow-slate-300/70`
    }
    if (journalQualityScore >= 4) {
      return `${base} shadow-sm shadow-slate-300/60`
    }
    return `${base} shadow-sm shadow-slate-200/60`
  }, [journalQualityScore, selectedJournalLabel])
  const studyTypeDefaults = useMemo(
    () => (values.studyArchitecture.trim() ? getStudyTypeDefaults(values.studyArchitecture) : null),
    [values.studyArchitecture],
  )
  const interpretationRealignValue = studyTypeDefaults?.defaultInterpretationMode ?? ''
  const needsInterpretationRealign = Boolean(
    studyTypeDefaults && values.interpretationMode.trim() !== interpretationRealignValue,
  )
  const activeSummaryHelperIds = useMemo(() => {
    const summaryLower = values.researchObjective.toLowerCase()
    const ids = new Set<string>()
    for (const helper of SUMMARY_HELPER_CHIPS) {
      if (summaryLower.includes(helper.text.toLowerCase())) {
        ids.add(helper.id)
      }
    }
    return ids
  }, [values.researchObjective])

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
      recognition.lang = 'en-GB'
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
    if (saving) {
      return
    }
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
    } catch (error) {
      onError(error instanceof Error ? error.message : 'Could not save research summary.')
    } finally {
      setSaving(false)
    }
  }

  useEffect(() => {
    if (saveRequestId === undefined) {
      return
    }
    if (saveRequestId <= lastExternalSaveRequestRef.current) {
      return
    }
    lastExternalSaveRequestRef.current = saveRequestId
    void onSaveContext()
  }, [saveRequestId])

  const onToggleSummaryHelper = (helperText: string) => {
    const current = values.researchObjective
    const normalizedHelper = normalizeHelperText(helperText)
    const currentLower = current.toLowerCase()
    const helperLower = helperText.toLowerCase()

    if (currentLower.includes(helperLower)) {
      const lines = current.split(/\r?\n/)
      const filteredLines = lines.filter((line) => normalizeHelperText(line) !== normalizedHelper)
      let next = filteredLines.join('\n')
      if (next === current) {
        const inlinePattern = new RegExp(escapeRegExp(helperText), 'gi')
        next = next.replace(inlinePattern, '')
      }
      next = next.replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim()
      onValueChange('researchObjective', next)
      return
    }

    const trimmedCurrent = current.trim()
    const next = trimmedCurrent ? `${trimmedCurrent}\n${helperText}` : helperText
    onValueChange('researchObjective', next)
  }

  const onRealignInterpretationMode = () => {
    if (!studyTypeDefaults) {
      return
    }
    onValueChange('interpretationMode', studyTypeDefaults.defaultInterpretationMode)
    onStudyTypeDefaultsResolved({
      interpretationMode: studyTypeDefaults.defaultInterpretationMode,
      enableConservativeGuardrails: studyTypeDefaults.enableConservativeGuardrails,
    })
    onStatus(`Interpretation mode realigned to ${studyTypeDefaults.defaultInterpretationMode}.`)
  }

  const onResetResearchOverview = () => {
    onValueChange('projectTitle', '')
    onTargetJournalChange('')
    onValueChange('researchCategory', '')
    onValueChange('studyArchitecture', '')
    onValueChange('interpretationMode', '')
    onValueChange('recommendedArticleType', '')
    onValueChange('recommendedWordLength', '')
    onValueChange('researchObjective', '')
    onStudyTypeDefaultsResolved({
      interpretationMode: '',
      enableConservativeGuardrails: true,
    })
    setAttemptedSubmit(false)
    onStatus('Research overview reset.')
  }

  return (
    <div className="space-y-6 rounded-lg border border-border bg-card p-6">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-base font-semibold">Step 1: Research overview</h2>
        <Button
          type="button"
          size="sm"
          variant="outline"
          className="border-slate-300 text-slate-700 hover:bg-slate-100"
          onClick={onResetResearchOverview}
          disabled={saving}
        >
          <RotateCcw className="mr-1 h-3.5 w-3.5" />
          Reset
        </Button>
      </div>

      <section className="space-y-2 rounded-md border border-border/80 bg-muted/20 p-3">
        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Research frame snapshot</p>
        <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
          <div className={targetJournalBoxClass}>
            <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Target journal</p>
            <p className="text-sm">{selectedJournalLabel || 'Not set'}</p>
            {selectedJournalLabel ? (
              <p className="text-xs text-muted-foreground">
                Journal standard: <span className="font-medium text-slate-700">{journalQualityStars}</span>
              </p>
            ) : null}
          </div>
          <div className="rounded-md border border-border/70 bg-background p-2">
            <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Research category</p>
            <p className="text-sm">{values.researchCategory || 'Not set'}</p>
          </div>
          <div className="rounded-md border border-border/70 bg-background p-2">
            <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Study type</p>
            <p className="text-sm">{values.studyArchitecture || 'Not set'}</p>
          </div>
          <div className="rounded-md border border-border/70 bg-background p-2">
            <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Interpretation mode</p>
            <p className="text-sm">{values.interpretationMode || 'Not set'}</p>
          </div>
          <div className="rounded-md border border-border/70 bg-background p-2">
            <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Recommended article type</p>
            <p className="text-sm">{values.recommendedArticleType || 'Not set'}</p>
          </div>
          <div className={wordLengthBoxClass}>
            <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Recommended word length</p>
            <p className="text-sm">{values.recommendedWordLength || 'Not set'}</p>
          </div>
        </div>
      </section>

      <section className="space-y-4 rounded-md border border-border/80 p-4">
        <div className="space-y-1">
          <h3 className="text-sm font-semibold">Study setup</h3>
        </div>

        <div className="grid gap-4 xl:grid-cols-2">
          <div className="space-y-1 xl:col-span-2">
            <Label htmlFor="context-project-title">Proposed project title</Label>
            <Input
              id="context-project-title"
              value={values.projectTitle}
              onChange={(event) => onValueChange('projectTitle', event.target.value)}
            />
          </div>

          <div className="space-y-1 xl:col-span-2">
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
              <option value="">Select working target journal</option>
              {journals.map((journal) => (
                <option key={journal.slug} value={journal.slug}>
                  {journal.display_name}
                </option>
              ))}
            </select>
            {attemptedSubmit && errors.targetJournal ? <p className="text-xs text-destructive">{errors.targetJournal}</p> : null}
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
        </div>
      </section>

      <section className="space-y-4 rounded-md border border-border/80 p-4">
        <div className="space-y-2">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <Label htmlFor="context-research-objective">Summary of research</Label>
          </div>
          <div className="flex flex-wrap gap-2">
            {SUMMARY_HELPER_CHIPS.map((helper) => (
              <Button
                key={helper.id}
                type="button"
                size="sm"
                variant="outline"
                className={
                  activeSummaryHelperIds.has(helper.id)
                    ? 'border-emerald-400 bg-emerald-100 text-emerald-900 hover:bg-emerald-200'
                    : 'border-slate-300 text-slate-700 hover:bg-slate-100'
                }
                onClick={() => onToggleSummaryHelper(helper.text)}
              >
                {helper.label}
              </Button>
            ))}
          </div>
          <textarea
            id="context-research-objective"
            className="min-h-48 w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
            placeholder="Summarise the research in 2-4 sentences. Provide information on the clinical problem, methods used, and the key results from the data (if available)."
            value={values.researchObjective}
            onChange={(event) => onValueChange('researchObjective', event.target.value)}
          />
          <div className="flex justify-end">
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
          {!speechSupported ? <p className="text-xs text-muted-foreground">Speech to text is not available in this browser.</p> : null}
          {attemptedSubmit && errors.researchObjective ? <p className="text-xs text-destructive">{errors.researchObjective}</p> : null}
        </div>

        <div className="space-y-1">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <Label htmlFor="context-interpretation-mode">Interpretation mode (optional)</Label>
            {needsInterpretationRealign ? (
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="border-cyan-300 text-cyan-800 hover:bg-cyan-50"
                onClick={onRealignInterpretationMode}
              >
                Realign interpretation mode
              </Button>
            ) : null}
          </div>
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
      </section>

      <Button className={PRIMARY_ACTION_BUTTON_CLASS} onClick={() => void onSaveContext()} disabled={saving}>
        {saving ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <Save className="mr-1 h-4 w-4" />}
        Save research summary
      </Button>
    </div>
  )
}
