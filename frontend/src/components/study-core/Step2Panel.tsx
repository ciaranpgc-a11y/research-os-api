import { Loader2 } from 'lucide-react'
import { useCallback, useEffect, useMemo, useState } from 'react'

import { Button } from '@/components/ui/button'
import { applyRecommendedSectionFix, assessPlanSection, type PlanSectionKey } from '@/lib/plan-section-readiness'
import { editPlanManuscriptSection, fetchNextPlanClarificationQuestion } from '@/lib/study-core-api'
import type { PlanClarificationQuestion, Step2ClarificationResponse } from '@/types/study-core'

type PlanningContext = {
  projectTitle: string
  targetJournal: string
  targetJournalLabel: string
  researchCategory: string
  studyTypeOptions: string[]
  studyType: string
  interpretationMode: string
  articleType: string
  wordLength: string
  summary: string
}

type Step2PanelProps = {
  planningContext: PlanningContext
  clarificationResponses: Step2ClarificationResponse[]
  planVisible: boolean
  aiPlanSections: Record<PlanSectionKey, string>
  activePlanSection: PlanSectionKey | null
  selectedTextBySection: Record<PlanSectionKey, { start: number; end: number; text: string }>
  canRevertBySection: Record<PlanSectionKey, boolean>
  onPlanVisibilityChange: (visible: boolean) => void
  onActivePlanSectionChange: (section: PlanSectionKey) => void
  onApplyAiPlanSectionText: (section: PlanSectionKey, nextText: string, source: 'ai' | 'fix') => void
  onRevertAiPlanSection: (section: PlanSectionKey) => void
  onClarificationResponsesChange: (responses: Step2ClarificationResponse[]) => void
  onApplyAdaptiveUpdates: (updates: {
    summaryOfResearch: string
    researchCategory: string
    studyType: string
    interpretationMode: string
    articleType: string
    wordLength: string
    manuscriptPlanSummary: string
    manuscriptPlanSections: {
      introduction: string
      methods: string
      results: string
      discussion: string
    }
  }) => void
}

const MAX_QUESTIONS = 10
const MIN_ANSWERS_FOR_PLAN = 3
const PLAN_SECTIONS: PlanSectionKey[] = ['introduction', 'methods', 'results', 'discussion']

function toHistory(responses: Step2ClarificationResponse[]) {
  return responses
    .filter((item): item is Step2ClarificationResponse & { answer: 'yes' | 'no' } => item.answer === 'yes' || item.answer === 'no')
    .map((item) => ({
      prompt: item.prompt.trim(),
      answer: item.answer,
      comment: item.comment.trim(),
    }))
}

function upsertResponse(
  responses: Step2ClarificationResponse[],
  question: PlanClarificationQuestion,
  answer: 'yes' | 'no',
  comment: string,
): Step2ClarificationResponse[] {
  const next = [...responses]
  const index = next.findIndex(
    (item) => item.id === question.id || item.prompt.trim().toLowerCase() === question.prompt.trim().toLowerCase(),
  )
  const record: Step2ClarificationResponse = {
    id: question.id,
    prompt: question.prompt,
    answer,
    comment: comment.trim(),
  }
  if (index >= 0) {
    next[index] = record
  } else {
    next.push(record)
  }
  return next
}

function titleCase(value: string): string {
  return value
    .split('_')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ')
}

export function Step2Panel({
  planningContext,
  clarificationResponses,
  planVisible,
  aiPlanSections,
  activePlanSection,
  selectedTextBySection,
  canRevertBySection,
  onPlanVisibilityChange,
  onActivePlanSectionChange,
  onApplyAiPlanSectionText,
  onRevertAiPlanSection,
  onClarificationResponsesChange,
  onApplyAdaptiveUpdates,
}: Step2PanelProps) {
  const [currentQuestion, setCurrentQuestion] = useState<PlanClarificationQuestion | null>(null)
  const [draftAnswer, setDraftAnswer] = useState<'yes' | 'no' | ''>('')
  const [draftComment, setDraftComment] = useState('')
  const [loadingQuestion, setLoadingQuestion] = useState(false)
  const [questionError, setQuestionError] = useState('')
  const [modelUsed, setModelUsed] = useState('')
  const [completed, setCompleted] = useState(false)
  const [readyForPlan, setReadyForPlan] = useState(false)
  const [confidencePercent, setConfidencePercent] = useState(0)
  const [readinessAdvice, setReadinessAdvice] = useState('')
  const [questionLimit, setQuestionLimit] = useState(MAX_QUESTIONS)
  const [editInstruction, setEditInstruction] = useState('')
  const [editBusy, setEditBusy] = useState(false)
  const [editError, setEditError] = useState('')
  const [editModelUsed, setEditModelUsed] = useState('')

  const answeredHistory = useMemo(() => toHistory(clarificationResponses), [clarificationResponses])
  const answeredCount = answeredHistory.length
  const canOpenPlan = useMemo(
    () => answeredCount >= MIN_ANSWERS_FOR_PLAN || readyForPlan || completed,
    [answeredCount, completed, readyForPlan],
  )
  const nextAnswersNeeded = Math.max(0, MIN_ANSWERS_FOR_PLAN - answeredCount)
  const activeSection: PlanSectionKey = activePlanSection ?? 'introduction'
  const activeSectionText = aiPlanSections[activeSection] || ''
  const activeSelection = selectedTextBySection[activeSection]?.text?.trim() || ''
  const activeAssessment = useMemo(
    () => assessPlanSection(activeSection, activeSectionText, planningContext.summary),
    [activeSection, activeSectionText, planningContext.summary],
  )

  const loadNextQuestion = useCallback(
    async (sourceResponses: Step2ClarificationResponse[], options?: { forceNextQuestion?: boolean }) => {
      const history = toHistory(sourceResponses)

      setLoadingQuestion(true)
      setQuestionError('')
      try {
        const payload = await fetchNextPlanClarificationQuestion({
          projectTitle: planningContext.projectTitle,
          targetJournal: planningContext.targetJournal,
          targetJournalLabel: planningContext.targetJournalLabel,
          researchCategory: planningContext.researchCategory,
          studyType: planningContext.studyType,
          interpretationMode: planningContext.interpretationMode,
          articleType: planningContext.articleType,
          wordLength: planningContext.wordLength,
          summaryOfResearch: planningContext.summary,
          studyTypeOptions: planningContext.studyTypeOptions,
          history,
          maxQuestions: MAX_QUESTIONS,
          forceNextQuestion: options?.forceNextQuestion ?? false,
        })

        setModelUsed(payload.model_used)
        const dynamicLimit = Math.max(
          payload.max_questions || MAX_QUESTIONS,
          (payload.asked_count || 0) + Math.max(payload.additional_questions_for_full_confidence || 0, 0),
        )
        setQuestionLimit(dynamicLimit)
        setCompleted(payload.completed)
        setReadyForPlan(payload.ready_for_plan)
        setConfidencePercent(Math.max(0, Math.min(100, payload.confidence_percent || 0)))
        setReadinessAdvice(payload.advice || '')
        if (payload.updated_fields || payload.manuscript_plan_summary || payload.manuscript_plan_sections) {
          onApplyAdaptiveUpdates({
            summaryOfResearch: payload.updated_fields?.summary_of_research ?? '',
            researchCategory: payload.updated_fields?.research_category ?? '',
            studyType: payload.updated_fields?.study_type ?? '',
            interpretationMode: payload.updated_fields?.interpretation_mode ?? '',
            articleType: payload.updated_fields?.article_type ?? '',
            wordLength: payload.updated_fields?.word_length ?? '',
            manuscriptPlanSummary: payload.manuscript_plan_summary ?? '',
            manuscriptPlanSections: payload.manuscript_plan_sections ?? {
              introduction: '',
              methods: '',
              results: '',
              discussion: '',
            },
          })
        }

        if (!payload.question) {
          setCurrentQuestion(null)
          setDraftAnswer('')
          setDraftComment('')
          return
        }

        const nextQuestion = payload.question
        setCurrentQuestion(nextQuestion)

        const existing = sourceResponses.find(
          (item) => item.id === nextQuestion.id || item.prompt.trim().toLowerCase() === nextQuestion.prompt.trim().toLowerCase(),
        )
        setDraftAnswer(existing?.answer ?? '')
        setDraftComment(existing?.comment ?? '')
      } catch (error) {
        setCurrentQuestion(null)
        setCompleted(false)
        setReadyForPlan(false)
        setConfidencePercent(0)
        setReadinessAdvice('')
        setModelUsed('')
        setQuestionError(
          error instanceof Error
            ? `${error.message} Click Refresh question to retry.`
            : 'Could not generate the next AI question. Click Refresh question to retry.',
        )
      } finally {
        setLoadingQuestion(false)
      }
    },
    [
      onApplyAdaptiveUpdates,
      planningContext.articleType,
      planningContext.interpretationMode,
      planningContext.projectTitle,
      planningContext.researchCategory,
      planningContext.studyType,
      planningContext.studyTypeOptions,
      planningContext.summary,
      planningContext.targetJournal,
      planningContext.targetJournalLabel,
      planningContext.wordLength,
    ],
  )

  useEffect(() => {
    void loadNextQuestion(clarificationResponses)
  }, [])

  useEffect(() => {
    setEditInstruction('')
    setEditError('')
  }, [activeSection])

  const onAnswerAndContinue = async () => {
    if (!currentQuestion || (draftAnswer !== 'yes' && draftAnswer !== 'no')) {
      return
    }
    const nextResponses = upsertResponse(clarificationResponses, currentQuestion, draftAnswer, draftComment)
    onClarificationResponsesChange(nextResponses)
    await loadNextQuestion(nextResponses)
  }

  const onApplyAiEdit = async (mode: 'selection' | 'section') => {
    const instruction = editInstruction.trim()
    if (!instruction) {
      setEditError('Add an edit instruction first.')
      return
    }
    if (mode === 'selection' && !activeSelection) {
      setEditError('Highlight text in the selected section before applying targeted edits.')
      return
    }

    setEditBusy(true)
    setEditError('')
    try {
      const payload = await editPlanManuscriptSection({
        section: activeSection,
        sectionText: activeSectionText,
        editInstruction: instruction,
        selectedText: mode === 'selection' ? activeSelection : '',
        projectTitle: planningContext.projectTitle || 'Untitled project',
        targetJournalLabel: planningContext.targetJournalLabel || planningContext.targetJournal || '',
        researchCategory: planningContext.researchCategory,
        studyType: planningContext.studyType,
        interpretationMode: planningContext.interpretationMode,
        articleType: planningContext.articleType,
        wordLength: planningContext.wordLength,
        summaryOfResearch: planningContext.summary,
      })
      setEditModelUsed(payload.model_used || '')
      if (payload.updated_section_text.trim()) {
        onApplyAiPlanSectionText(activeSection, payload.updated_section_text.trim(), 'ai')
      }
      setEditInstruction('')
    } catch (error) {
      setEditError(error instanceof Error ? error.message : 'AI plan edit failed.')
    } finally {
      setEditBusy(false)
    }
  }

  const onApplyRecommendedFix = () => {
    const fixed = applyRecommendedSectionFix(activeSection, activeSectionText, planningContext.summary)
    if (!fixed.trim() || fixed.trim() === activeSectionText.trim()) {
      return
    }
    onApplyAiPlanSectionText(activeSection, fixed, 'fix')
  }

  return (
    <aside className="space-y-3 rounded-lg border border-border bg-card p-3">
      <h3 className="text-sm font-semibold">Plan setup questions</h3>
      <div className="space-y-2 rounded-md border border-border/80 bg-muted/20 p-3">
        <div className="flex flex-wrap items-center gap-2">
          <Button
            size="sm"
            variant="outline"
            className="border-emerald-300 text-emerald-800 hover:bg-emerald-50"
            onClick={() => void loadNextQuestion(clarificationResponses)}
            disabled={loadingQuestion}
          >
            {loadingQuestion ? <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" /> : null}
            Refresh question
          </Button>
          <span className="text-xs text-muted-foreground">
            Completed: {answeredCount}/{questionLimit}
          </span>
        </div>
        <div className="space-y-1">
          <div className="flex items-center justify-between">
            <span className="text-xs text-muted-foreground">AI confidence to generate a robust manuscript plan</span>
            <span className="text-xs font-medium text-slate-700">{confidencePercent}%</span>
          </div>
          <div className="h-2 w-full overflow-hidden rounded bg-slate-200">
            <div
              className={`h-full transition-all ${
                confidencePercent >= 85 ? 'bg-emerald-500' : confidencePercent >= 60 ? 'bg-amber-500' : 'bg-rose-500'
              }`}
              style={{ width: `${confidencePercent}%` }}
            />
          </div>
          {readinessAdvice ? <p className="text-xs text-muted-foreground">{readinessAdvice}</p> : null}
          {!canOpenPlan ? (
            <p className="text-xs text-muted-foreground">
              Answer {nextAnswersNeeded} more question{nextAnswersNeeded === 1 ? '' : 's'} to unlock plan display.
            </p>
          ) : null}
        </div>
        {modelUsed ? <p className="text-[11px] text-muted-foreground">Model: {modelUsed}</p> : null}
        {questionError ? <p className="text-xs text-amber-700">{questionError}</p> : null}
      </div>

      {completed ? (
        <div className="space-y-2 rounded-md border border-emerald-300 bg-emerald-50 p-3">
          <p className="text-sm text-emerald-900">
            {readyForPlan
              ? 'AI considers the context ready for plan generation.'
              : 'Clarification sequence paused. You can continue with more targeted questions.'}
          </p>
          <div className="flex flex-wrap gap-2">
            <Button
              size="sm"
              variant="outline"
              className="border-emerald-300 text-emerald-800 hover:bg-emerald-100"
              onClick={() => void loadNextQuestion(clarificationResponses, { forceNextQuestion: true })}
              disabled={loadingQuestion}
            >
              Continue with more questions
            </Button>
            <Button
              size="sm"
              className="bg-emerald-600 text-white hover:bg-emerald-700"
              onClick={() => onPlanVisibilityChange(true)}
              disabled={!canOpenPlan}
            >
              Build manuscript plan
            </Button>
          </div>
        </div>
      ) : currentQuestion ? (
        <div className="space-y-2 rounded-md border border-border/80 bg-background p-3">
          <p className="text-xs font-semibold text-slate-900">
            Question {Math.min(answeredCount + 1, Math.max(questionLimit, answeredCount + 1))} of{' '}
            {Math.max(questionLimit, answeredCount + 1)}
          </p>
          <p className="text-sm font-medium text-slate-900">{currentQuestion.prompt}</p>
          <p className="text-xs text-muted-foreground">{currentQuestion.rationale}</p>

          <div className="flex gap-2">
            <Button
              size="sm"
              variant={draftAnswer === 'yes' ? 'default' : 'outline'}
              className={draftAnswer === 'yes' ? 'bg-emerald-600 hover:bg-emerald-700' : ''}
              onClick={() => setDraftAnswer('yes')}
            >
              Yes
            </Button>
            <Button
              size="sm"
              variant={draftAnswer === 'no' ? 'default' : 'outline'}
              className={draftAnswer === 'no' ? 'bg-slate-700 hover:bg-slate-800' : ''}
              onClick={() => setDraftAnswer('no')}
            >
              No
            </Button>
          </div>

          <textarea
            className="min-h-16 w-full rounded-md border border-border bg-background px-2 py-1.5 text-xs"
            placeholder="Optional comment"
            value={draftComment}
            onChange={(event) => setDraftComment(event.target.value)}
          />

          <div className="flex flex-wrap gap-2">
            <Button
              size="sm"
              className="bg-emerald-600 text-white hover:bg-emerald-700"
              onClick={() => void onAnswerAndContinue()}
              disabled={loadingQuestion || (draftAnswer !== 'yes' && draftAnswer !== 'no')}
            >
              Save answer and next question
            </Button>
            <Button
              size="sm"
              variant="outline"
              className="border-emerald-300 text-emerald-800 hover:bg-emerald-50"
              onClick={() => onPlanVisibilityChange(true)}
              disabled={!canOpenPlan}
            >
              Build manuscript plan
            </Button>
          </div>
        </div>
      ) : (
        <div className="space-y-2 rounded-md border border-border bg-background p-3">
          <p className="text-sm text-muted-foreground">No active question.</p>
          <div className="flex flex-wrap gap-2">
            <Button
              size="sm"
              variant="outline"
              className="border-emerald-300 text-emerald-800 hover:bg-emerald-100"
              onClick={() => void loadNextQuestion(clarificationResponses, { forceNextQuestion: true })}
              disabled={loadingQuestion}
            >
              Continue with more questions
            </Button>
            <Button
              size="sm"
              className="bg-emerald-600 text-white hover:bg-emerald-700"
              onClick={() => onPlanVisibilityChange(true)}
              disabled={!canOpenPlan}
            >
              Build manuscript plan
            </Button>
          </div>
        </div>
      )}

      {planVisible ? (
        <div className="space-y-2 rounded-md border border-emerald-300 bg-emerald-50/50 p-3">
          <h4 className="text-sm font-semibold text-emerald-900">AI plan edits</h4>
          <div className="flex flex-wrap gap-2">
            {PLAN_SECTIONS.map((section) => (
              <Button
                key={section}
                size="sm"
                variant={activeSection === section ? 'default' : 'outline'}
                className={activeSection === section ? 'bg-emerald-600 hover:bg-emerald-700' : 'border-emerald-300 text-emerald-800 hover:bg-emerald-100'}
                onClick={() => onActivePlanSectionChange(section)}
              >
                {titleCase(section)}
              </Button>
            ))}
          </div>

          <div className={`rounded-md border p-2 text-xs ${activeAssessment.ready ? 'border-emerald-300 bg-emerald-100/70 text-emerald-950' : 'border-amber-300 bg-amber-100/70 text-amber-950'}`}>
            <p className="font-semibold">{activeAssessment.ready ? 'Ready' : 'Needs fix'}</p>
            <p>{activeAssessment.issue}</p>
            <p>{activeAssessment.rationale}</p>
          </div>

          {!activeAssessment.ready ? (
            <Button
              size="sm"
              variant="outline"
              className="border-amber-400 text-amber-900 hover:bg-amber-100"
              onClick={onApplyRecommendedFix}
            >
              {activeAssessment.fixLabel}
            </Button>
          ) : null}

          <textarea
            className="min-h-16 w-full rounded-md border border-emerald-200 bg-background px-2 py-1.5 text-xs"
            placeholder={`Edit instruction for ${titleCase(activeSection)}...`}
            value={editInstruction}
            onChange={(event) => setEditInstruction(event.target.value)}
          />
          <div className="flex flex-wrap gap-2">
            <Button
              size="sm"
              variant="outline"
              className="border-emerald-300 text-emerald-800 hover:bg-emerald-100"
              onClick={() => void onApplyAiEdit('selection')}
              disabled={editBusy || !activeSelection}
            >
              {editBusy ? <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" /> : null}
              Apply to highlighted text
            </Button>
            <Button
              size="sm"
              className="bg-emerald-600 text-white hover:bg-emerald-700"
              onClick={() => void onApplyAiEdit('section')}
              disabled={editBusy}
            >
              {editBusy ? <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" /> : null}
              Apply to full section
            </Button>
            <Button
              size="sm"
              variant="outline"
              className="border-slate-300 text-slate-700 hover:bg-slate-100"
              onClick={() => onRevertAiPlanSection(activeSection)}
              disabled={!canRevertBySection[activeSection]}
            >
              Revert last edit
            </Button>
          </div>
          {activeSelection ? <p className="text-xs text-muted-foreground">Highlighted text ready for targeted edit.</p> : null}
          {editModelUsed ? <p className="text-[11px] text-muted-foreground">Edit model: {editModelUsed}</p> : null}
          {editError ? <p className="text-xs text-rose-700">{editError}</p> : null}
        </div>
      ) : (
        <div className="rounded-md border border-border/80 bg-muted/20 p-3">
          <p className="text-xs text-muted-foreground">AI edit controls appear after you build the manuscript plan.</p>
        </div>
      )}
    </aside>
  )
}
