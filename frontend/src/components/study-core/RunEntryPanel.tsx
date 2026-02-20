import { Loader2, Mic, MicOff, Upload } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'

import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Label } from '@/components/ui/label'
import { bootstrapRunContext, updateManuscriptSections } from '@/lib/study-core-api'
import { cn } from '@/lib/utils'

type EntryMode = 'new' | 'continue' | 'refine'
type DictationTarget = 'continueDraft' | 'refineDraft'

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

type BrowserWindow = Window & {
  SpeechRecognition?: new () => SpeechRecognitionInstance
  webkitSpeechRecognition?: new () => SpeechRecognitionInstance
}

type ContextSeedValues = {
  projectTitle: string
  researchObjective: string
  primaryDataSource: string
  studyType: string
  primaryAnalyticalClaim: string
}

type RunEntryPanelProps = {
  runContext: { projectId: string; manuscriptId: string } | null
  targetJournal: string
  contextValues: ContextSeedValues
  onOpenStepOne: () => void
  onContextEstablished: (payload: { projectId: string; manuscriptId: string; recommendedSections: string[] }) => void
  onDraftImported: (payload: { sections: string[]; draftsBySection: Record<string, string> }) => void
  onRefineLoaded: (payload: { section: string; text: string }) => void
  onStatus: (message: string) => void
  onError: (message: string) => void
}

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

function modeButtonClass(active: boolean): string {
  if (active) {
    return 'border-border bg-muted text-foreground'
  }
  return 'border-transparent bg-transparent text-muted-foreground hover:bg-muted/60 hover:text-foreground'
}

function titleForSection(section: string): string {
  return section
    .split('_')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ')
}

function buildDraftImportPayload(text: string, sections: string[]): Record<string, string> {
  const trimmed = text.trim()
  return sections.reduce<Record<string, string>>((accumulator, section) => {
    accumulator[section] = trimmed
    return accumulator
  }, {})
}

export function RunEntryPanel({
  runContext,
  targetJournal,
  contextValues,
  onOpenStepOne,
  onContextEstablished,
  onDraftImported,
  onRefineLoaded,
  onStatus,
  onError,
}: RunEntryPanelProps) {
  const [mode, setMode] = useState<EntryMode>('new')
  const [continueDraft, setContinueDraft] = useState('')
  const [continueSections, setContinueSections] = useState<string[]>(['introduction', 'methods', 'results', 'discussion'])
  const [refineSection, setRefineSection] = useState<string>('introduction')
  const [refineDraft, setRefineDraft] = useState('')
  const [attemptedSubmit, setAttemptedSubmit] = useState(false)
  const [busy, setBusy] = useState<'continue' | 'refine' | ''>('')
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
  }, [continueDraft, continueSections.length, mode, refineDraft, refineSection])

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
      setActiveDictationTarget((current) => (current === target ? null : current))
    }

    recognitionRef.current = recognition
    setActiveDictationTarget(target)
    recognition.start()
  }

  const ensureRunContext = async (nextMode: 'continue' | 'refine', sections: string[]) => {
    if (runContext) {
      return runContext
    }
    const fallbackTitle =
      contextValues.projectTitle.trim() ||
      (nextMode === 'continue' ? 'Imported Draft Workspace' : 'Section Refinement Workspace')
    const payload = await bootstrapRunContext({
      title: fallbackTitle,
      targetJournal,
      answers: {
        study_type: contextValues.studyType || 'Other',
        research_objective:
          contextValues.researchObjective ||
          (nextMode === 'continue' ? 'Integrate an existing manuscript draft into the workspace.' : 'Refine an existing section draft.'),
        primary_data_source: contextValues.primaryDataSource || 'manual_input',
        primary_analytical_claim: contextValues.primaryAnalyticalClaim,
        analysis_summary: contextValues.primaryAnalyticalClaim,
        disease_focus: '',
        population: '',
        primary_outcome: '',
        manuscript_goal: nextMode === 'continue' ? 'continue_existing_draft' : 'refine_single_section',
        data_source: contextValues.primaryDataSource || 'manual_entry',
      },
    })
    onContextEstablished({
      projectId: payload.project.id,
      manuscriptId: payload.manuscript.id,
      recommendedSections: sections.length > 0 ? sections : payload.inference.recommended_sections,
    })
    return {
      projectId: payload.project.id,
      manuscriptId: payload.manuscript.id,
    }
  }

  const onImportDraft = async () => {
    setAttemptedSubmit(true)
    if (Object.keys(errors).length > 0) {
      return
    }
    setBusy('continue')
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
      setBusy('')
    }
  }

  const onLoadRefineSection = async () => {
    setAttemptedSubmit(true)
    if (Object.keys(errors).length > 0) {
      return
    }
    setBusy('refine')
    onError('')
    try {
      await ensureRunContext('refine', [refineSection])
      onRefineLoaded({ section: refineSection, text: refineDraft.trim() })
      onStatus(`Loaded ${titleForSection(refineSection)} into Draft Review.`)
    } catch (error) {
      onError(error instanceof Error ? error.message : 'Could not load section draft.')
    } finally {
      setBusy('')
    }
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base">Workflow Entry</CardTitle>
        <CardDescription>Select how you want to start this run before entering the wizard steps.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="inline-flex rounded-md border border-border bg-background p-1">
          <button
            type="button"
            onClick={() => setMode('new')}
            className={cn('rounded-md border px-3 py-1.5 text-xs font-medium transition-colors', modeButtonClass(mode === 'new'))}
          >
            New manuscript
          </button>
          <button
            type="button"
            onClick={() => setMode('continue')}
            className={cn('rounded-md border px-3 py-1.5 text-xs font-medium transition-colors', modeButtonClass(mode === 'continue'))}
          >
            Continue draft
          </button>
          <button
            type="button"
            onClick={() => setMode('refine')}
            className={cn('rounded-md border px-3 py-1.5 text-xs font-medium transition-colors', modeButtonClass(mode === 'refine'))}
          >
            Refine section
          </button>
        </div>

        {mode === 'new' ? (
          <div className="space-y-2 rounded-md border border-border/70 bg-muted/20 p-3">
            <p className="text-sm text-muted-foreground">Start from Step 1 to define a fresh research frame and save context.</p>
            <Button onClick={onOpenStepOne}>Open Step 1</Button>
          </div>
        ) : null}

        {mode === 'continue' ? (
          <div className="space-y-3 rounded-md border border-border/70 bg-muted/20 p-3">
            <p className="text-sm text-muted-foreground">Paste your existing draft, map sections, then jump directly to Draft Review.</p>
            <div className="space-y-1">
              <div className="flex items-center justify-between gap-2">
                <Label htmlFor="entry-continue-draft">Paste draft</Label>
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
                id="entry-continue-draft"
                className="min-h-40 w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
                placeholder="Paste manuscript draft text."
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

            <Button onClick={() => void onImportDraft()} disabled={busy === 'continue'}>
              {busy === 'continue' ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <Upload className="mr-1 h-4 w-4" />}
              Import into manuscript
            </Button>
          </div>
        ) : null}

        {mode === 'refine' ? (
          <div className="space-y-3 rounded-md border border-border/70 bg-muted/20 p-3">
            <p className="text-sm text-muted-foreground">Load one section draft and jump straight to Draft Review for refinement.</p>

            <div className="max-w-sm space-y-1">
              <Label htmlFor="entry-refine-section">Section</Label>
              <select
                id="entry-refine-section"
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
                <Label htmlFor="entry-refine-text">Section text</Label>
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
                id="entry-refine-text"
                className="min-h-32 w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
                placeholder="Paste the section text to refine."
                value={refineDraft}
                onChange={(event) => setRefineDraft(event.target.value)}
              />
              {attemptedSubmit && errors.refineDraft ? <p className="text-xs text-destructive">{errors.refineDraft}</p> : null}
            </div>

            <Button onClick={() => void onLoadRefineSection()} disabled={busy === 'refine'}>
              {busy === 'refine' ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : null}
              Load into Draft Review
            </Button>
          </div>
        ) : null}
      </CardContent>
    </Card>
  )
}
