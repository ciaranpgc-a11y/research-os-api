import { Loader2 } from 'lucide-react'
import { useEffect, useState } from 'react'

import { RecommendationCard } from '@/components/study-core/RecommendationCard'
import { Button } from '@/components/ui/button'
import type { PlanRecommendation } from '@/lib/analyze-plan'
import { fetchPlanClarificationQuestions } from '@/lib/study-core-api'
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

function sanitiseQuestions(rawQuestions: PlanClarificationQuestion[]): PlanClarificationQuestion[] {
  const cleaned: PlanClarificationQuestion[] = []
  const seenPrompts = new Set<string>()
  for (const item of rawQuestions) {
    const prompt = item.prompt.trim().replace(/\s+/g, ' ')
    if (!prompt) {
      continue
    }
    const normalizedPrompt = prompt.endsWith('?') ? prompt : `${prompt}?`
    const startsWithYesNo = /^(should|is|are|do|does|can)\b/i.test(normalizedPrompt)
    if (!startsWithYesNo) {
      continue
    }
    const key = normalizedPrompt.toLowerCase()
    if (seenPrompts.has(key)) {
      continue
    }
    seenPrompts.add(key)
    cleaned.push({
      id: item.id.trim() || `q${cleaned.length + 1}`,
      prompt: normalizedPrompt,
      rationale: item.rationale.trim() || 'Clarifies planning intent before section generation.',
    })
    if (cleaned.length >= 10) {
      break
    }
  }
  return cleaned
}

function mapResponsesToQuestions(
  questions: PlanClarificationQuestion[],
  currentResponses: Step2ClarificationResponse[],
): Step2ClarificationResponse[] {
  const byId = new Map(currentResponses.map((item) => [item.id, item]))
  const byPrompt = new Map(currentResponses.map((item) => [item.prompt.trim().toLowerCase(), item]))
  return questions.map((question) => {
    const existing = byId.get(question.id) ?? byPrompt.get(question.prompt.trim().toLowerCase())
    return {
      id: question.id,
      prompt: question.prompt,
      answer: existing?.answer ?? '',
      comment: existing?.comment ?? '',
    }
  })
}

export function Step2Panel({
  hasPlan,
  recommendations,
  planningContext,
  clarificationResponses,
  onClarificationResponsesChange,
}: Step2PanelProps) {
  const [questions, setQuestions] = useState<PlanClarificationQuestion[]>([])
  const [loadingQuestions, setLoadingQuestions] = useState(false)
  const [questionsError, setQuestionsError] = useState('')
  const [modelUsed, setModelUsed] = useState('')
  const [refreshNonce, setRefreshNonce] = useState(0)

  useEffect(() => {
    let cancelled = false
    const loadQuestions = async () => {
      setLoadingQuestions(true)
      setQuestionsError('')
      try {
        const payload = await fetchPlanClarificationQuestions({
          projectTitle: planningContext.projectTitle,
          targetJournal: planningContext.targetJournal,
          targetJournalLabel: planningContext.targetJournalLabel,
          researchCategory: planningContext.researchCategory,
          studyType: planningContext.studyType,
          interpretationMode: planningContext.interpretationMode,
          articleType: planningContext.articleType,
          wordLength: planningContext.wordLength,
          summaryOfResearch: planningContext.summary,
        })
        if (cancelled) {
          return
        }
        const nextQuestions = sanitiseQuestions(payload.questions)
        if (nextQuestions.length === 0) {
          throw new Error('AI did not return usable clarification questions.')
        }
        setQuestions(nextQuestions)
        setModelUsed(payload.model_used)
      } catch (error) {
        if (cancelled) {
          return
        }
        setModelUsed('')
        setQuestionsError(
          error instanceof Error
            ? `${error.message} Please refresh questions.`
            : 'Could not generate AI clarification questions. Please refresh questions.',
        )
      } finally {
        if (!cancelled) {
          setLoadingQuestions(false)
        }
      }
    }

    void loadQuestions()
    return () => {
      cancelled = true
    }
  }, [
    planningContext.articleType,
    planningContext.interpretationMode,
    planningContext.projectTitle,
    planningContext.researchCategory,
    planningContext.studyType,
    planningContext.summary,
    planningContext.targetJournal,
    planningContext.targetJournalLabel,
    planningContext.wordLength,
    refreshNonce,
  ])

  useEffect(() => {
    if (questions.length === 0) {
      return
    }
    const next = mapResponsesToQuestions(questions, clarificationResponses)
    const hasChanged =
      next.length !== clarificationResponses.length ||
      next.some((item, index) => {
        const current = clarificationResponses[index]
        return !current || current.id !== item.id || current.prompt !== item.prompt || current.answer !== item.answer || current.comment !== item.comment
      })
    if (hasChanged) {
      onClarificationResponsesChange(next)
    }
  }, [clarificationResponses, onClarificationResponsesChange, questions])

  const updateResponse = (id: string, patch: Partial<Step2ClarificationResponse>) => {
    const next = clarificationResponses.map((item) => (item.id === id ? { ...item, ...patch } : item))
    onClarificationResponsesChange(next)
  }

  return (
    <aside className="space-y-3 rounded-lg border border-border bg-card p-3">
      <h3 className="text-sm font-semibold">Plan setup questions</h3>
      <div className="space-y-2 rounded-md border border-border/80 bg-muted/20 p-3">
        <div className="flex flex-wrap gap-2">
          <Button
            size="sm"
            variant="outline"
            className="border-emerald-300 text-emerald-800 hover:bg-emerald-50"
            onClick={() => setRefreshNonce((value) => value + 1)}
            disabled={loadingQuestions}
          >
            {loadingQuestions ? <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" /> : null}
            {questions.length > 0 ? 'Refresh questions' : 'Generate AI questions'}
          </Button>
        </div>
        {modelUsed ? <p className="text-[11px] text-muted-foreground">Model: {modelUsed}</p> : null}
        {questionsError ? <p className="text-xs text-amber-700">{questionsError}</p> : null}
        {!hasPlan ? <p className="text-xs text-emerald-700">Complete these first to improve first-pass plan quality.</p> : null}
      </div>

      {questions.length === 0 ? (
        <p className="rounded-md border border-border bg-background p-3 text-sm text-muted-foreground">
          No AI questions loaded yet.
        </p>
      ) : (
        <div className="max-h-[460px] space-y-2 overflow-y-auto pr-1">
          {questions.map((question, index) => {
            const response = clarificationResponses.find((item) => item.id === question.id)
            const answer = response?.answer ?? ''
            const comment = response?.comment ?? ''
            return (
              <div key={question.id} className="rounded-md border border-border/80 bg-background p-2">
                <p className="text-xs font-semibold text-slate-900">
                  {index + 1}. {question.prompt}
                </p>
                <p className="mt-1 text-[11px] text-muted-foreground">{question.rationale}</p>
                <div className="mt-2 flex gap-2">
                  <Button
                    size="sm"
                    variant={answer === 'yes' ? 'default' : 'outline'}
                    className={answer === 'yes' ? 'bg-emerald-600 hover:bg-emerald-700' : ''}
                    onClick={() => updateResponse(question.id, { answer: 'yes', prompt: question.prompt })}
                  >
                    Yes
                  </Button>
                  <Button
                    size="sm"
                    variant={answer === 'no' ? 'default' : 'outline'}
                    className={answer === 'no' ? 'bg-slate-700 hover:bg-slate-800' : ''}
                    onClick={() => updateResponse(question.id, { answer: 'no', prompt: question.prompt })}
                  >
                    No
                  </Button>
                </div>
                <textarea
                  className="mt-2 min-h-14 w-full rounded-md border border-border bg-background px-2 py-1.5 text-xs"
                  placeholder="Optional comment"
                  value={comment}
                  onChange={(event) => updateResponse(question.id, { comment: event.target.value, prompt: question.prompt })}
                />
              </div>
            )
          })}
        </div>
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
