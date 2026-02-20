import { Loader2, Mic, MicOff, Save, Upload } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'

import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { bootstrapRunContext, updateManuscriptSections } from '@/lib/study-core-api'
import { cn } from '@/lib/utils'
import type { JournalOption } from '@/types/study-core'

type ResearchFrameMode = 'new' | 'continue' | 'refine'
type DictationTarget = 'researchObjective' | 'continueDraft' | 'refineDraft'

const STUDY_TYPE_OPTIONS = [
  'Observational',
  'Randomized / interventional',
  'Diagnostic / prognostic',
  'Methods / statistical',
  'Service evaluation',
  'Qualitative',
  'Other',
] as const

const SECTION_OPTIONS = [
  'title',
  'abstract',
  'introduction',
  'methods',
  'results',
  'discussion',
  'limitations',
  'conclusion',
] as const

type BrowserWindow = Window & {
  SpeechRecognition?: new () => SpeechRecognitionInstance
  webkitSpeechRecognition?: new () => SpeechRecognitionInstance
}

type SpeechRecognitionInstance = {
  continuous: boolean
  interimResults: boolean
  lang: string
  onresult: ((event: { resultIndex: number; results: ArrayLike<{ isFinal: boolean; [index: number]: { transcript: string } }> }) => void) | null
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
  onContextSaved: (
    payload: { projectId: string; manuscriptId: string; recommendedSections: string[] },
    options?: { advanceToPlan?: boolean },
  ) => void
  onDraftImported: (payload: { sections: string[]; draftsBySection: Record<string, string> }) => void
  onRefineLoaded: (payload: { section: string; text: string }) => void
  onStatus: (message: string) => void
  onError: (message: string) => void
}

function titleForSection(section: string): string {
  return section.charAt(0).toUpperCase() + section.slice(1)
}

function buildDraftImportPayload(text: string, sections: string[]): Record<string, string> {
  const trimmed = text.trim()
  return sections.reduce<Record<string, string>>((accumulator, section) => {
    accumulator[section] = trimmed
    return accumulator
  }, {})
}

function modeButtonClass(active: boolean): string {
  if (active) {
    return 'bg-background text-foreground shadow-sm'
  }
  return 'text-muted-foreground hover:text-foreground'
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
  onDraftImported,
  onRefineLoaded,
  onStatus,
  onError,
}: StepContextProps) {
  const [mode, setMode] = useState<ResearchFrameMode>('new')
  const [continueDraft, setContinueDraft] = useState('')
  const [continueSections, setContinueSections] = useState<string[]>(['introduction', 'methods', 'results', 'discussion'])
  const [refineSection, setRefineSection] = useState<string>('introduction')
  const [refineDraft, setRefineDraft] = useState('')
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
    if (mode === 'new') {
      if (!values.projectTitle.trim()) {
        nextErrors.projectTitle = 'Project title is required.'
      }
      if (!values.researchObjective.trim()) {
        nextErrors.researchObjective = 'Core research question or objective is required.'
      }
      if (!values.studyType.trim()) {
        nextErrors.studyType = 'Study type is required.'
      }
    }
    if (mode === 'continue') {
      if (!continueDraft.trim()) {
        nextErrors.continueDraft = 'Paste draft text before importing.'
      }
      if (continueSections.length === 0) {
        nextErrors.continueSections = 'Select at least one section.'
      }
    }
    if (mode === 'refine') {
      if (!refineSection.trim()) {
        nextErrors.refineSection = 'Select a section.'
      }
      if (!refineDraft.trim()) {
        nextErrors.refineDraft = 'Paste section text before loading.'
      }
    }
    return nextErrors
  }, [continueDraft, continueSections.length, mode, refineDraft, refineSection, values.projectTitle, values.researchObjective, values.studyType])

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

  const toggleDictation = (target: DictationTarget, existingValue: string, onUpdate: (value: string) => void) => {
    if (!speechCtor) {
      return
    }
    if (activeDictationTarget === target) {
      stopDictation()
      return
    }

    stopDictation()

    const recognition = new speechCtor()
    recognition.continuous = true
    recognition.interimResults = true
    recognition.lang = 'en-GB'
    let finalText = ''

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
      finalText = `${finalText} ${nextChunk}`.trim()
      onUpdate(`${existingValue.trim()} ${finalText}`.trim())
    }
    recognition.onerror = () => {
      setActiveDictationTarget(null)
    }
    recognition.onend = () => {
      if (recognitionRef.current === recognition) {
        recognitionRef.current = null
      }
      setActiveDictationTarget((current) => (current === target ? null : current))
    }

    recognitionRef.current = recognition
    setActiveDictationTarget(target)
    recognition.start()
  }

  const ensureRunContext = async (nextMode: ResearchFrameMode, sections: string[]) => {
    if (contextCard) {
      return contextCard
    }
    const fallbackTitle =
      values.projectTitle.trim() ||
      (nextMode === 'continue' ? 'Imported Draft Workspace' : 'Section Refinement Workspace')
    const payload = await bootstrapRunContext({
      title: fallbackTitle,
      targetJournal,
      answers: {
        study_type: values.studyType || 'Other',
        research_objective:
          values.researchObjective ||
          (nextMode === 'continue' ? 'Integrate an existing manuscript draft into the workspace.' : 'Refine an existing section draft.'),
        primary_data_source: values.primaryDataSource || 'manual_input',
        primary_analytical_claim: values.primaryAnalyticalClaim,
        analysis_summary: values.primaryAnalyticalClaim,
        disease_focus: '',
        population: '',
        primary_outcome: '',
        manuscript_goal: nextMode === 'continue' ? 'continue_existing_draft' : 'refine_single_section',
        data_source: values.primaryDataSource || 'manual_entry',
      },
    })
    onContextSaved(
      {
        projectId: payload.project.id,
        manuscriptId: payload.manuscript.id,
        recommendedSections: sections.length > 0 ? sections : payload.inference.recommended_sections,
      },
      { advanceToPlan: false },
    )
    return {
      projectId: payload.project.id,
      manuscriptId: payload.manuscript.id,
    }
  }

  const onSaveNewManuscript = async () => {
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
      onContextSaved(
        {
          projectId: payload.project.id,
          manuscriptId: payload.manuscript.id,
          recommendedSections: payload.inference.recommended_sections,
        },
        { advanceToPlan: true },
      )
      onStatus(`Research frame saved (${payload.project.id.slice(0, 8)} / ${payload.manuscript.id.slice(0, 8)}).`)
    } catch (error) {
      onError(error instanceof Error ? error.message : 'Could not save research frame.')
    } finally {
      setSaving(false)
    }
  }

  const onImportDraft = async () => {
    setAttemptedSubmit(true)
    if (Object.keys(errors).length > 0) {
      return
    }
    setSaving(true)
    onError('')
    try {
      const context = await ensureRunContext('continue', continueSections)
      const importedSections = buildDraftImportPayload(continueDraft, continueSections)
      await updateManuscriptSections({
        projectId: context.projectId,
        manuscriptId: context.manuscriptId,
        sections: importedSections,
      })
      onDraftImported({ sections: continueSections, draftsBySection: importedSections })
      onStatus(`Imported draft into ${continueSections.length} section(s).`)
    } catch (error) {
      onError(error instanceof Error ? error.message : 'Could not import draft.')
    } finally {
      setSaving(false)
    }
  }

  const onLoadRefineSection = async () => {
    setAttemptedSubmit(true)
    if (Object.keys(errors).length > 0) {
      return
    }
    setSaving(true)
    onError('')
    try {
      await ensureRunContext('refine', [refineSection])
      onRefineLoaded({ section: refineSection, text: refineDraft.trim() })
      onStatus(`Loaded ${titleForSection(refineSection)} into Draft Review.`)
    } catch (error) {
      onError(error instanceof Error ? error.message : 'Could not load section draft.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Step 1: Research Frame</CardTitle>
        <CardDescription>Set a research frame or load existing draft text.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="inline-flex rounded-md border border-border bg-muted/30 p-1">
          <button
            type="button"
            onClick={() => setMode('new')}
            className={cn('rounded px-3 py-1.5 text-xs font-medium transition-colors', modeButtonClass(mode === 'new'))}
          >
            New manuscript
          </button>
          <button
            type="button"
            onClick={() => setMode('continue')}
            className={cn('rounded px-3 py-1.5 text-xs font-medium transition-colors', modeButtonClass(mode === 'continue'))}
          >
            Continue draft
          </button>
          <button
            type="button"
            onClick={() => setMode('refine')}
            className={cn('rounded px-3 py-1.5 text-xs font-medium transition-colors', modeButtonClass(mode === 'refine'))}
          >
            Refine section
          </button>
        </div>

        {mode === 'new' ? (
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">Define the minimum research frame to initialise this manuscript.</p>
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
                  onClick={() => toggleDictation('researchObjective', values.researchObjective, (next) => onValueChange('researchObjective', next))}
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

            <Button onClick={() => void onSaveNewManuscript()} disabled={saving}>
              {saving ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <Save className="mr-1 h-4 w-4" />}
              Save Research Frame
            </Button>
          </div>
        ) : null}

        {mode === 'continue' ? (
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">Paste an existing draft and map it to manuscript sections.</p>
            <div className="space-y-1">
              <div className="flex items-center justify-between gap-2">
                <Label htmlFor="context-continue-draft">Paste draft</Label>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => toggleDictation('continueDraft', continueDraft, setContinueDraft)}
                  disabled={!speechSupported}
                >
                  {activeDictationTarget === 'continueDraft' ? <MicOff className="mr-1 h-3.5 w-3.5" /> : <Mic className="mr-1 h-3.5 w-3.5" />}
                  {activeDictationTarget === 'continueDraft' ? 'Stop dictation' : 'Dictate'}
                </Button>
              </div>
              <textarea
                id="context-continue-draft"
                className="min-h-40 w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
                placeholder="Paste manuscript draft text here."
                value={continueDraft}
                onChange={(event) => setContinueDraft(event.target.value)}
              />
              {attemptedSubmit && errors.continueDraft ? <p className="text-xs text-destructive">{errors.continueDraft}</p> : null}
            </div>

            <div className="space-y-2">
              <Label>Sections</Label>
              <div className="grid gap-2 sm:grid-cols-2">
                {SECTION_OPTIONS.map((section) => {
                  const selected = continueSections.includes(section)
                  return (
                    <label key={section} className="flex items-center gap-2 text-sm">
                      <input
                        type="checkbox"
                        checked={selected}
                        onChange={() =>
                          setContinueSections((current) => {
                            if (selected) {
                              return current.filter((item) => item !== section)
                            }
                            return [...current, section]
                          })
                        }
                      />
                      {titleForSection(section)}
                    </label>
                  )
                })}
              </div>
              {attemptedSubmit && errors.continueSections ? <p className="text-xs text-destructive">{errors.continueSections}</p> : null}
            </div>

            <Button onClick={() => void onImportDraft()} disabled={saving}>
              {saving ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <Upload className="mr-1 h-4 w-4" />}
              Import into manuscript
            </Button>
          </div>
        ) : null}

        {mode === 'refine' ? (
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">Load one section draft directly into Draft Review.</p>

            <div className="space-y-1 max-w-sm">
              <Label htmlFor="context-refine-section">Section</Label>
              <select
                id="context-refine-section"
                className="h-9 w-full rounded-md border border-border bg-background px-3 text-sm"
                value={refineSection}
                onChange={(event) => setRefineSection(event.target.value)}
              >
                {SECTION_OPTIONS.map((section) => (
                  <option key={section} value={section}>
                    {titleForSection(section)}
                  </option>
                ))}
              </select>
              {attemptedSubmit && errors.refineSection ? <p className="text-xs text-destructive">{errors.refineSection}</p> : null}
            </div>

            <div className="space-y-1">
              <div className="flex items-center justify-between gap-2">
                <Label htmlFor="context-refine-text">Section text</Label>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => toggleDictation('refineDraft', refineDraft, setRefineDraft)}
                  disabled={!speechSupported}
                >
                  {activeDictationTarget === 'refineDraft' ? <MicOff className="mr-1 h-3.5 w-3.5" /> : <Mic className="mr-1 h-3.5 w-3.5" />}
                  {activeDictationTarget === 'refineDraft' ? 'Stop dictation' : 'Dictate'}
                </Button>
              </div>
              <textarea
                id="context-refine-text"
                className="min-h-32 w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
                placeholder="Paste section text to refine."
                value={refineDraft}
                onChange={(event) => setRefineDraft(event.target.value)}
              />
              {attemptedSubmit && errors.refineDraft ? <p className="text-xs text-destructive">{errors.refineDraft}</p> : null}
            </div>

            <Button onClick={() => void onLoadRefineSection()} disabled={saving}>
              {saving ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : null}
              Load into Draft Review
            </Button>
          </div>
        ) : null}

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

        {contextSaved && contextCard ? (
          <div className="rounded-md border border-border bg-muted/40 p-3 text-xs">
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

