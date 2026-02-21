import { Loader2, Mic, Square } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'

import { Button } from '@/components/ui/button'
import { getJournalQualityScore, getJournalQualityStars } from '@/lib/research-frame-options'
import { planSections } from '@/lib/study-core-api'
import type { OutlinePlanSection, OutlinePlanState, SectionPlanItem, SectionPlanPayload, Step2ClarificationResponse } from '@/types/study-core'

const DEFAULT_PLAN_SECTIONS = ['introduction', 'methods', 'results', 'discussion', 'conclusion'] as const

type StepPlanProps = {
  targetJournal: string
  answers: Record<string, string>
  planningContext: {
    targetJournal: string
    targetJournalLabel?: string
    researchCategory: string
    studyType: string
    interpretationMode: string
    articleType: string
    wordLength: string
    summary: string
  }
  selectedSections: string[]
  plan: OutlinePlanState | null
  aiPlanSummary: string
  clarificationResponses: Step2ClarificationResponse[]
  onSectionsChange: (sections: string[]) => void
  onPlanChange: (plan: OutlinePlanState | null) => void
  onStatus: (message: string) => void
  onError: (message: string) => void
}

function titleCaseSection(section: string): string {
  return section
    .split('_')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ')
}

function dedupeBullets(bullets: string[]): string[] {
  const seen = new Set<string>()
  const deduped: string[] = []
  for (const bullet of bullets) {
    const trimmed = bullet.trim()
    if (!trimmed) {
      continue
    }
    const key = trimmed.toLowerCase()
    if (seen.has(key)) {
      continue
    }
    seen.add(key)
    deduped.push(trimmed)
  }
  return deduped
}

function bulletsFromPlanItem(item?: SectionPlanItem): string[] {
  if (!item) {
    return []
  }
  return dedupeBullets([item.objective, ...item.must_include])
}

function toOutlinePlan(payload: SectionPlanPayload, sections: string[]): OutlinePlanState {
  const itemBySection = new Map(payload.items.map((item) => [item.section.toLowerCase(), item]))
  return {
    sections: sections.map((section) => {
      const item = itemBySection.get(section.toLowerCase())
      return {
        name: section,
        bullets: bulletsFromPlanItem(item),
        tags: item?.qc_focus?.slice(0, 3),
      }
    }),
  }
}

function hasSectionOrderChanged(current: OutlinePlanState, selectedSections: string[]): boolean {
  if (current.sections.length !== selectedSections.length) {
    return true
  }
  return selectedSections.some((section, index) => current.sections[index]?.name !== section)
}

function getJournalTileClass(score: 2 | 3 | 4 | 5 | null): string {
  const baseClass = 'rounded-md border p-2'
  if (score === null) {
    return `${baseClass} border-border/70 bg-background`
  }
  if (score >= 5) {
    return `${baseClass} border-emerald-300 bg-emerald-50/70`
  }
  if (score >= 4) {
    return `${baseClass} border-emerald-200 bg-emerald-50/40`
  }
  if (score >= 3) {
    return `${baseClass} border-amber-200 bg-amber-50/40`
  }
  return `${baseClass} border-amber-300 bg-amber-50/65`
}

function getWordLengthScaleScore(value: string): 2 | 3 | 4 | 5 | null {
  const numbers = (value.match(/\d[\d,]*/g) ?? [])
    .map((part) => Number.parseInt(part.replace(/,/g, ''), 10))
    .filter((part) => Number.isFinite(part))
  if (numbers.length === 0) {
    return null
  }
  const upperBound = Math.max(...numbers)
  if (upperBound < 1500) {
    return 5
  }
  if (upperBound <= 4000) {
    return 3
  }
  return 2
}

function getWordLengthTileClass(score: 2 | 3 | 4 | 5 | null): string {
  const baseClass = 'rounded-md border p-2'
  if (score === null) {
    return `${baseClass} border-border/70 bg-background`
  }
  if (score >= 5) {
    return `${baseClass} border-emerald-300 bg-emerald-50/70`
  }
  if (score >= 3) {
    return `${baseClass} border-amber-300 bg-amber-50/65`
  }
  return `${baseClass} border-rose-300 bg-rose-50/70`
}

function buildClarificationNotes(responses: Step2ClarificationResponse[]): string {
  const answered = responses.filter((item) => item.answer)
  if (answered.length === 0) {
    return ''
  }
  return answered
    .map((item) => {
      const comment = item.comment.trim()
      return comment ? `${item.prompt} -> ${item.answer.toUpperCase()} (${comment})` : `${item.prompt} -> ${item.answer.toUpperCase()}`
    })
    .join(' | ')
}

function sectionContextBullets(
  section: string,
  context: StepPlanProps['planningContext'],
  clarificationNotes: string,
): string[] {
  const isReview =
    context.articleType.toLowerCase().includes('review') ||
    context.studyType.toLowerCase().includes('synthesis') ||
    context.summary.toLowerCase().includes('literature review')

  if (section === 'introduction') {
    return dedupeBullets([
      context.summary ? `State the research focus directly: ${context.summary}` : '',
      context.researchCategory ? `Frame the manuscript as: ${context.researchCategory}.` : '',
      context.interpretationMode ? `Set interpretation scope as: ${context.interpretationMode}.` : '',
      clarificationNotes ? `Integrate these planning clarifications: ${clarificationNotes}.` : '',
    ])
  }
  if (section === 'methods') {
    if (isReview) {
      return dedupeBullets([
        'Define literature identification approach, sources, and date range.',
        'Define inclusion and exclusion criteria for evidence selection.',
        'Specify evidence extraction and synthesis method.',
      ])
    }
    return dedupeBullets([
      context.studyType ? `Specify study design as: ${context.studyType}.` : 'Specify study design and study period.',
      'Define inclusion and exclusion criteria.',
      'Define primary and secondary endpoints.',
      'Specify modelling strategy, covariate adjustment, and missing-data handling.',
    ])
  }
  if (section === 'results') {
    if (isReview) {
      return dedupeBullets([
        'Summarise included evidence characteristics and thematic findings.',
        'Report consistency, heterogeneity, and uncertainty in the evidence base.',
      ])
    }
    return dedupeBullets([
      'Report primary estimate for the main endpoint.',
      'Report uncertainty for each primary estimate.',
      'Report sensitivity analysis findings.',
    ])
  }
  if (section === 'discussion') {
    return dedupeBullets([
      'Interpret findings within the defined non-causal scope.',
      'State key limitations and alternative explanations.',
      'Define implications for practice and next-step validation work.',
    ])
  }
  if (section === 'conclusion') {
    return dedupeBullets([
      'State the principal conclusion aligned to reported results only.',
      'Avoid causal claims and over-interpretation.',
    ])
  }
  return []
}

function buildContextScaffold(
  sections: string[],
  context: StepPlanProps['planningContext'],
  clarificationNotes: string,
): OutlinePlanState {
  return {
    sections: sections.map((section) => ({
      name: section,
      bullets: sectionContextBullets(section, context, clarificationNotes),
    })),
  }
}

function sectionTextFromBullets(bullets: string[]): string {
  return bullets.join('\n')
}

function bulletsFromSectionText(value: string): string[] {
  return value
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
}

export function StepPlan({
  targetJournal,
  answers,
  planningContext,
  selectedSections,
  plan,
  aiPlanSummary,
  clarificationResponses,
  onSectionsChange,
  onPlanChange,
  onStatus,
  onError,
}: StepPlanProps) {
  const [busy, setBusy] = useState<'plan' | ''>('')
  const [listeningSection, setListeningSection] = useState<string | null>(null)
  const recognitionRef = useRef<any | null>(null)
  const listeningSectionRef = useRef<string | null>(null)
  const orderedSections = useMemo(() => [...DEFAULT_PLAN_SECTIONS], [])
  const clarificationNotes = useMemo(() => buildClarificationNotes(clarificationResponses), [clarificationResponses])
  const journalStars = useMemo(
    () => (planningContext.targetJournal ? getJournalQualityStars(planningContext.targetJournal) : ''),
    [planningContext.targetJournal],
  )
  const journalTileClass = useMemo(
    () => getJournalTileClass(planningContext.targetJournal ? getJournalQualityScore(planningContext.targetJournal) : null),
    [planningContext.targetJournal],
  )
  const wordLengthTileClass = useMemo(
    () => getWordLengthTileClass(getWordLengthScaleScore(planningContext.wordLength)),
    [planningContext.wordLength],
  )
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
  const fallbackPlanSummary = useMemo(() => {
    if (!plan || plan.sections.length === 0) {
      return ''
    }
    const byName = new Map(plan.sections.map((section) => [section.name.toLowerCase(), section]))
    const parts: string[] = []
    for (const sectionName of orderedSections) {
      const section = byName.get(sectionName)
      if (!section) {
        continue
      }
      const firstLine = section.bullets.find((item) => item.trim())
      if (!firstLine) {
        continue
      }
      parts.push(`${titleCaseSection(sectionName)}: ${firstLine.replace(/\.+$/, '')}.`)
    }
    return parts.join(' ')
  }, [orderedSections, plan])

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

  useEffect(() => {
    const current = selectedSections.join('|').toLowerCase()
    const expected = orderedSections.join('|').toLowerCase()
    if (current !== expected) {
      onSectionsChange([...orderedSections])
    }
  }, [onSectionsChange, orderedSections, selectedSections])

  useEffect(() => {
    if (!plan) {
      return
    }
    if (!hasSectionOrderChanged(plan, orderedSections)) {
      return
    }
    const existingByName = new Map(plan.sections.map((section) => [section.name, section]))
    onPlanChange({
      sections: orderedSections.map((section) => existingByName.get(section) ?? { name: section, bullets: [] }),
    })
  }, [onPlanChange, orderedSections, plan])

  const updateSection = (sectionName: string, updater: (section: OutlinePlanSection) => OutlinePlanSection) => {
    if (!plan) {
      return
    }
    onPlanChange({
      sections: plan.sections.map((section) => (section.name === sectionName ? updater(section) : section)),
    })
  }

  const appendSpeechTranscriptToSection = (sectionName: string, transcript: string) => {
    updateSection(sectionName, (current) => {
      const existing = sectionTextFromBullets(current.bullets)
      const nextText = existing.trim() ? `${existing}\n${transcript}` : transcript
      return {
        ...current,
        bullets: bulletsFromSectionText(nextText),
      }
    })
  }

  const onToggleSpeechToText = (sectionName: string) => {
    onError('')
    if (!speechSupported) {
      onError('Speech-to-text is not supported in this browser.')
      return
    }

    if (listeningSection === sectionName) {
      try {
        recognitionRef.current?.stop()
      } catch {
        // no-op
      }
      listeningSectionRef.current = null
      setListeningSection(null)
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
        const targetSection = listeningSectionRef.current
        if (!cleaned || !targetSection) {
          return
        }
        appendSpeechTranscriptToSection(targetSection, cleaned)
      }
      recognition.onerror = () => {
        setListeningSection(null)
        listeningSectionRef.current = null
        onError('Speech-to-text input failed. Try again.')
      }
      recognition.onend = () => {
        setListeningSection(null)
        listeningSectionRef.current = null
      }
      recognitionRef.current = recognition
    }

    try {
      listeningSectionRef.current = sectionName
      recognitionRef.current.start()
      setListeningSection(sectionName)
    } catch {
      listeningSectionRef.current = null
      setListeningSection(null)
      onError('Speech-to-text could not start. Try again.')
    }
  }

  const onGeneratePlan = async () => {
    setBusy('plan')
    onError('')
    try {
      const payload = await planSections({
        targetJournal: targetJournal.trim() || 'generic-original',
        answers: {
          ...answers,
          clarification_notes: clarificationNotes,
        },
        sections: orderedSections,
      })
      onPlanChange(toOutlinePlan(payload, orderedSections))
      onStatus(`Generated plan for ${payload.items.length} section(s).`)
    } catch (error) {
      onError(error instanceof Error ? error.message : 'Could not generate plan.')
    } finally {
      setBusy('')
    }
  }

  const onBuildContextScaffold = () => {
    onPlanChange(buildContextScaffold(orderedSections, planningContext, clarificationNotes))
    onStatus('Context scaffold created from Step 1 framing.')
  }

  return (
    <div className="space-y-4 rounded-lg border border-border bg-card p-4">
      <div className="space-y-1">
        <h2 className="text-base font-semibold">Step 2: Plan Sections</h2>
        <p className="text-sm text-muted-foreground">Generate the outline from Step 1 context and edit one section text box at a time.</p>
      </div>

      <div className="space-y-2 rounded-md border border-border/80 bg-muted/20 p-3">
        <p className="text-xs font-medium text-muted-foreground">
          Introduction, Methods, Results, Discussion, Conclusion overview
        </p>
        <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-3">
          <div className={journalTileClass}>
            <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Target journal</p>
            <p className="text-sm">{planningContext.targetJournalLabel || planningContext.targetJournal || 'Not set'}</p>
            {journalStars ? (
              <p className="text-xs text-muted-foreground">
                Journal standard: <span className="font-medium text-slate-700">{journalStars}</span>
              </p>
            ) : null}
          </div>
          <div className="rounded-md border border-border/70 bg-background p-2">
            <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Research category</p>
            <p className="text-sm">{planningContext.researchCategory || 'Not set'}</p>
          </div>
          <div className="rounded-md border border-border/70 bg-background p-2">
            <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Study type</p>
            <p className="text-sm">{planningContext.studyType || 'Not set'}</p>
          </div>
          <div className="rounded-md border border-border/70 bg-background p-2">
            <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Interpretation mode</p>
            <p className="text-sm">{planningContext.interpretationMode || 'Not set'}</p>
          </div>
          <div className="rounded-md border border-border/70 bg-background p-2">
            <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Article type</p>
            <p className="text-sm">{planningContext.articleType || 'Not set'}</p>
          </div>
          <div className={wordLengthTileClass}>
            <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Target word length</p>
            <p className="text-sm">{planningContext.wordLength || 'Not set'}</p>
          </div>
        </div>
        <div className="rounded-md border border-border/70 bg-background p-2">
          <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Summary of research</p>
          <p className="text-sm">{planningContext.summary || 'Not set'}</p>
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        <Button variant="outline" onClick={onBuildContextScaffold} disabled={busy !== ''}>
          Build contextual scaffold
        </Button>
        <Button onClick={onGeneratePlan} disabled={busy === 'plan'}>
          {busy === 'plan' ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : null}
          Generate Plan
        </Button>
      </div>

      {plan ? (
        <div className="space-y-3 rounded-md border border-border p-3">
          <div className="rounded-md border border-emerald-200 bg-emerald-50/60 p-3">
            <p className="text-[11px] uppercase tracking-wide text-emerald-900">AI manuscript plan summary</p>
            <p className="mt-1 text-sm text-emerald-950">
              {(aiPlanSummary || '').trim() || fallbackPlanSummary || 'Complete clarifying questions and generate plan to produce a summary.'}
            </p>
          </div>

          <div className="space-y-3">
            {orderedSections.map((sectionName) => {
              const section = plan.sections.find((item) => item.name === sectionName)
              const textValue = section ? sectionTextFromBullets(section.bullets) : ''
              const listening = listeningSection === sectionName
              return (
                <div key={sectionName} className="space-y-2 rounded-md border border-border/80 p-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="text-sm font-semibold">{titleCaseSection(sectionName)}</p>
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      className="border-emerald-300 text-emerald-800 hover:bg-emerald-50"
                      onClick={() => onToggleSpeechToText(sectionName)}
                      disabled={!speechSupported}
                    >
                      {listening ? <Square className="mr-1 h-3.5 w-3.5" /> : <Mic className="mr-1 h-3.5 w-3.5" />}
                      {listening ? 'Stop speech input' : 'Speech to text'}
                    </Button>
                  </div>
                  <textarea
                    className="min-h-28 w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
                    value={textValue}
                    onChange={(event) => {
                      const value = event.target.value
                      updateSection(sectionName, (current) => ({
                        ...current,
                        bullets: bulletsFromSectionText(value),
                      }))
                    }}
                  />
                </div>
              )
            })}
          </div>
        </div>
      ) : null}
    </div>
  )
}
