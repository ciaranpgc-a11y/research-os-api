import { Loader2 } from 'lucide-react'
import { useCallback, useEffect, useMemo, useState } from 'react'

import { RecommendationCard } from '@/components/study-core/RecommendationCard'
import { Button } from '@/components/ui/button'
import type { PlanRecommendation } from '@/lib/analyze-plan'
import { fetchNextPlanClarificationQuestion } from '@/lib/study-core-api'
import type { PlanClarificationQuestion, Step2ClarificationResponse } from '@/types/study-core'

type PlanningContext = {
  projectTitle: string
  targetJournal: string
  targetJournalLabel: string
  researchCategory: string
  studyType: string
  interpretationMode: string
  articleType: string
  wordLength: string
  summary: string
}

type Step2PanelProps = {
  hasPlan: boolean
  recommendations: PlanRecommendation[]
  planningContext: PlanningContext
  clarificationResponses: Step2ClarificationResponse[]
  onClarificationResponsesChange: (responses: Step2ClarificationResponse[]) => void
}

const MAX_QUESTIONS = 10

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

export function Step2Panel({
  hasPlan,
  recommendations,
  planningContext,
  clarificationResponses,
  onClarificationResponsesChange,
}: Step2PanelProps) {
  const [currentQuestion, setCurrentQuestion] = useState<PlanClarificationQuestion | null>(null)
  const [draftAnswer, setDraftAnswer] = useState<'yes' | 'no' | ''>('')
  const [draftComment, setDraftComment] = useState('')
  const [loadingQuestion, setLoadingQuestion] = useState(false)
  const [questionError, setQuestionError] = useState('')
  const [modelUsed, setModelUsed] = useState('')
  const [completed, setCompleted] = useState(false)
  const [questionLimit, setQuestionLimit] = useState(MAX_QUESTIONS)

  const answeredHistory = useMemo(() => toHistory(clarificationResponses), [clarificationResponses])
  const answeredCount = answeredHistory.length

  const loadNextQuestion = useCallback(
    async (sourceResponses: Step2ClarificationResponse[]) => {
      const history = toHistory(sourceResponses)
      if (history.length >= MAX_QUESTIONS) {
        setCompleted(true)
        setCurrentQuestion(null)
        setDraftAnswer('')
        setDraftComment('')
        return
      }

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
          history,
          maxQuestions: MAX_QUESTIONS,
        })

        setModelUsed(payload.model_used)
        setQuestionLimit(payload.max_questions || MAX_QUESTIONS)
        setCompleted(payload.completed)

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
    [planningContext.articleType, planningContext.interpretationMode, planningContext.projectTitle, planningContext.researchCategory, planningContext.studyType, planningContext.summary, planningContext.targetJournal, planningContext.targetJournalLabel, planningContext.wordLength],
  )

  useEffect(() => {
    void loadNextQuestion(clarificationResponses)
  }, [loadNextQuestion])

  const onAnswerAndContinue = async () => {
    if (!currentQuestion || (draftAnswer !== 'yes' && draftAnswer !== 'no')) {
      return
    }
    const nextResponses = upsertResponse(clarificationResponses, currentQuestion, draftAnswer, draftComment)
    onClarificationResponsesChange(nextResponses)
    await loadNextQuestion(nextResponses)
  }

  return (
    <aside className="space-y-3 rounded-lg border border-border bg-card p-3">
      <h3 className="text-sm font-semibold">Plan setup questions</h3>
      <div className="space-y-2 rounded-md border border-border/80 bg-muted/20 p-3">
        <p className="text-xs text-muted-foreground">
          AI asks one question at a time and adapts to each answer to improve the final plan.
        </p>
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
        {modelUsed ? <p className="text-[11px] text-muted-foreground">Model: {modelUsed}</p> : null}
        {questionError ? <p className="text-xs text-amber-700">{questionError}</p> : null}
      </div>

      {completed ? (
        <p className="rounded-md border border-emerald-300 bg-emerald-50 p-3 text-sm text-emerald-900">
          Clarification sequence completed. Proceed to scaffold or Generate Plan.
        </p>
      ) : currentQuestion ? (
        <div className="space-y-2 rounded-md border border-border/80 bg-background p-3">
          <p className="text-xs font-semibold text-slate-900">
            Question {Math.min(answeredCount + 1, questionLimit)} of {questionLimit}
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

          <Button
            size="sm"
            className="bg-emerald-600 text-white hover:bg-emerald-700"
            onClick={() => void onAnswerAndContinue()}
            disabled={loadingQuestion || (draftAnswer !== 'yes' && draftAnswer !== 'no')}
          >
            Save answer and next question
          </Button>
        </div>
      ) : (
        <p className="rounded-md border border-border bg-background p-3 text-sm text-muted-foreground">
          No active question. Refresh question to continue.
        </p>
      )}

      <h3 className="text-sm font-semibold">Plan fixes</h3>
      {!hasPlan ? (
        <p className="rounded-md border border-border bg-background p-3 text-sm text-muted-foreground">
          Generate or scaffold a plan, then apply targeted fixes here.
        </p>
      ) : recommendations.length === 0 ? (
        <p className="rounded-md border border-border bg-background p-3 text-sm text-muted-foreground">
          Plan looks coherent. Proceed to draft generation.
        </p>
      ) : (
        recommendations.slice(0, 3).map((recommendation) => (
          <RecommendationCard
            key={recommendation.title}
            title={recommendation.title}
            rationale={recommendation.rationale}
            actionLabel="Insert recommended bullets"
            onApply={recommendation.applyPatch}
            optionalPreview={recommendation.optionalPreview}
          />
        ))
      )}
    </aside>
  )
}
