import { Loader2 } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'

import { RecommendationCard } from '@/components/study-core/RecommendationCard'
import { Button } from '@/components/ui/button'
import type { PlanRecommendation } from '@/lib/analyze-plan'
import { fetchPlanClarificationQuestions } from '@/lib/study-core-api'
import type { PlanClarificationQuestion, Step2ClarificationResponse } from '@/types/study-core'

type PlanningContext = {
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

function buildFallbackQuestions(context: PlanningContext): PlanClarificationQuestion[] {
  const journal = context.targetJournalLabel || 'the target journal'
  const category = context.researchCategory || 'the selected research category'
  const studyType = context.studyType || 'the selected study type'
  const interpretationMode = context.interpretationMode || 'the selected interpretation mode'
  const articleType = context.articleType || 'the selected article type'
  const wordLength = context.wordLength || 'the selected target word length'

  return [
    {
      id: 'q1_objective_scope',
      prompt: `Should the Introduction state one explicit objective aligned with ${studyType}?`,
      rationale: 'Keeps the manuscript objective fixed from the start.',
    },
    {
      id: 'q2_design_justification',
      prompt: `Should Methods justify why ${studyType} is appropriate for ${category}?`,
      rationale: 'Prevents design mismatch in later sections.',
    },
    {
      id: 'q3_methods_essentials',
      prompt: 'Should Methods include eligibility criteria, endpoint definitions, and analysis sequence?',
      rationale: 'Ensures core methodological structure is complete.',
    },
    {
      id: 'q4_missing_data',
      prompt: 'Should Methods state missing-data handling and sensitivity analyses explicitly?',
      rationale: 'Addresses reviewer expectations for robustness.',
    },
    {
      id: 'q5_results_uncertainty',
      prompt: 'Should Results require uncertainty wording for each primary estimate?',
      rationale: 'Improves rigour and consistency of reporting.',
    },
    {
      id: 'q6_discussion_limits',
      prompt: 'Should Discussion include a dedicated limitations subsection?',
      rationale: 'Prevents over-claiming and improves interpretability.',
    },
    {
      id: 'q7_interpretation_contract',
      prompt: `Should all sections stay within ${interpretationMode}?`,
      rationale: 'Aligns claims with the declared inferential contract.',
    },
    {
      id: 'q8_journal_fit',
      prompt: `Should the outline structure and language be tuned to ${journal}?`,
      rationale: 'Improves journal fit before drafting.',
    },
    {
      id: 'q9_article_type_fit',
      prompt: `Should section emphasis explicitly reflect ${articleType} conventions?`,
      rationale: 'Reduces mismatch between outline and manuscript type.',
    },
    {
      id: 'q10_word_budget',
      prompt: `Should section depth be constrained to fit ${wordLength}?`,
      rationale: 'Controls scope and avoids over-length drafts.',
    },
  ]
}

function sanitiseQuestions(rawQuestions: PlanClarificationQuestion[], fallback: PlanClarificationQuestion[]): PlanClarificationQuestion[] {
  const cleaned: PlanClarificationQuestion[] = []
  const seenPrompts = new Set<string>()
  for (const item of rawQuestions) {
    const prompt = item.prompt.trim().replace(/\s+/g, ' ')
    if (!prompt) {
      continue
    }
    const key = prompt.toLowerCase()
    if (seenPrompts.has(key)) {
      continue
    }
    seenPrompts.add(key)
    cleaned.push({
      id: item.id.trim() || `q${cleaned.length + 1}`,
      prompt: prompt.endsWith('?') ? prompt : `${prompt}?`,
      rationale: item.rationale.trim() || 'Clarifies planning intent before section generation.',
    })
    if (cleaned.length >= 10) {
      return cleaned
    }
  }
  for (const fallbackItem of fallback) {
    const key = fallbackItem.prompt.toLowerCase()
    if (seenPrompts.has(key)) {
      continue
    }
    seenPrompts.add(key)
    cleaned.push(fallbackItem)
    if (cleaned.length >= 10) {
      return cleaned
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
  const [questions, setQuestions] = useState<PlanClarificationQuestion[]>(() => buildFallbackQuestions(planningContext))
  const [loadingQuestions, setLoadingQuestions] = useState(false)
  const [questionsError, setQuestionsError] = useState('')
  const [modelUsed, setModelUsed] = useState('')
  const [refreshNonce, setRefreshNonce] = useState(0)
  const fallbackQuestions = useMemo(() => buildFallbackQuestions(planningContext), [planningContext])

  useEffect(() => {
    let cancelled = false
    const loadQuestions = async () => {
      setLoadingQuestions(true)
      setQuestionsError('')
      try {
        const payload = await fetchPlanClarificationQuestions({
          targetJournal: planningContext.targetJournal,
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
        setQuestions(sanitiseQuestions(payload.questions, fallbackQuestions))
        setModelUsed(payload.model_used)
      } catch (error) {
        if (cancelled) {
          return
        }
        setQuestions(fallbackQuestions)
        setModelUsed('')
        setQuestionsError(error instanceof Error ? `${error.message} Using provisional questions.` : 'Using provisional questions.')
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
  }, [fallbackQuestions, planningContext.articleType, planningContext.interpretationMode, planningContext.researchCategory, planningContext.studyType, planningContext.summary, planningContext.targetJournal, planningContext.wordLength, refreshNonce])

  useEffect(() => {
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
        <p className="text-xs text-muted-foreground">Answer these before scaffold or plan generation. Add comments where needed.</p>
        <div className="flex flex-wrap gap-2">
          <Button
            size="sm"
            variant="outline"
            className="border-emerald-300 text-emerald-800 hover:bg-emerald-50"
            onClick={() => setRefreshNonce((value) => value + 1)}
            disabled={loadingQuestions}
          >
            {loadingQuestions ? <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" /> : null}
            Refresh questions
          </Button>
        </div>
        {modelUsed ? <p className="text-[11px] text-muted-foreground">Model: {modelUsed}</p> : null}
        {questionsError ? <p className="text-xs text-amber-700">{questionsError}</p> : null}
        {!hasPlan ? <p className="text-xs text-emerald-700">No plan yet. Completing these now improves first-pass plan quality.</p> : null}
      </div>

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
