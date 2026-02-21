import { useMemo, useState } from 'react'

import { Button } from '@/components/ui/button'
import { fetchResearchOverviewSuggestions } from '@/lib/study-core-api'
import type { ResearchOverviewSuggestionsPayload } from '@/types/study-core'

type Step1PanelProps = {
  summary: string
  researchType: string
  interpretationMode: string
  targetJournal: string
  currentArticleType: string
  currentWordLength: string
  onReplaceSummary: (value: string) => void
  onApplyResearchType: (value: string) => void
  onApplyArticleType: (value: string) => void
  onApplyWordLength: (value: string) => void
}

const ACTION_BUTTON_CLASS = 'bg-emerald-600 text-white hover:bg-emerald-700 focus-visible:ring-emerald-500'
const OUTLINE_ACTION_BUTTON_CLASS =
  'border-emerald-200 text-emerald-700 hover:bg-emerald-50 focus-visible:ring-emerald-500'
const SUMMARY_CARD_CLASS = 'space-y-2 rounded-md border border-emerald-200 bg-emerald-50/40 p-3'
const RESEARCH_TYPE_CARD_CLASS = 'space-y-2 rounded-md border border-sky-200 bg-sky-50/40 p-3'
const JOURNAL_CARD_CLASS = 'space-y-2 rounded-md border border-amber-200 bg-amber-50/40 p-3'
const GUIDANCE_CARD_CLASS = 'space-y-2 rounded-md border border-slate-200 bg-slate-50/70 p-3'

function applyAutopopulate(
  payload: ResearchOverviewSuggestionsPayload,
  currentArticleType: string,
  currentWordLength: string,
  onApplyArticleType: (value: string) => void,
  onApplyWordLength: (value: string) => void,
): ResearchOverviewSuggestionsPayload {
  let articleRecommendation = payload.article_type_recommendation
  let wordLengthRecommendation = payload.word_length_recommendation

  if (articleRecommendation?.value && !currentArticleType.trim()) {
    onApplyArticleType(articleRecommendation.value)
    articleRecommendation = null
  }
  if (wordLengthRecommendation?.value && !currentWordLength.trim()) {
    onApplyWordLength(wordLengthRecommendation.value)
    wordLengthRecommendation = null
  }

  return {
    ...payload,
    article_type_recommendation: articleRecommendation,
    word_length_recommendation: wordLengthRecommendation,
  }
}

export function Step1Panel({
  summary,
  researchType,
  interpretationMode,
  targetJournal,
  currentArticleType,
  currentWordLength,
  onReplaceSummary,
  onApplyResearchType,
  onApplyArticleType,
  onApplyWordLength,
}: Step1PanelProps) {
  const [refinementsEnabled, setRefinementsEnabled] = useState(false)
  const [loading, setLoading] = useState(false)
  const [requestError, setRequestError] = useState('')
  const [suggestions, setSuggestions] = useState<ResearchOverviewSuggestionsPayload | null>(null)
  const [generatedKey, setGeneratedKey] = useState('')

  const currentKey = useMemo(
    () =>
      `${summary.trim().toLowerCase()}::${researchType.trim().toLowerCase()}::${interpretationMode
        .trim()
        .toLowerCase()}::${targetJournal.trim().toLowerCase()}`,
    [interpretationMode, researchType, summary, targetJournal],
  )
  const hasGenerated = generatedKey.length > 0
  const isStale = hasGenerated && generatedKey !== currentKey
  const summaryOptions = suggestions?.summary_refinements ?? []
  const hasJournalRecommendation = Boolean(suggestions?.article_type_recommendation || suggestions?.word_length_recommendation)

  const generateSuggestions = async () => {
    if (!summary.trim()) {
      return
    }
    setLoading(true)
    setRequestError('')
    try {
      const response = await fetchResearchOverviewSuggestions({
        targetJournal,
        researchType,
        interpretationMode,
        summaryOfResearch: summary,
      })
      const next = applyAutopopulate(
        response,
        currentArticleType,
        currentWordLength,
        onApplyArticleType,
        onApplyWordLength,
      )
      setSuggestions(next)
      setGeneratedKey(currentKey)
    } catch (error) {
      setRequestError(error instanceof Error ? error.message : 'Could not generate suggestions.')
    } finally {
      setLoading(false)
    }
  }

  const onToggleRefinements = async () => {
    if (refinementsEnabled) {
      setRefinementsEnabled(false)
      return
    }
    setRefinementsEnabled(true)
    if (!hasGenerated || isStale) {
      await generateSuggestions()
    }
  }

  const onApplySummary = (option: string) => {
    onReplaceSummary(option)
    setSuggestions((current) => {
      if (!current) {
        return current
      }
      return {
        ...current,
        summary_refinements: current.summary_refinements.filter((candidate) => candidate !== option),
      }
    })
  }

  const onApplyResearchTypeSuggestion = () => {
    const recommendation = suggestions?.research_type_suggestion
    if (!recommendation) {
      return
    }
    onApplyResearchType(recommendation.value)
    setSuggestions((current) => {
      if (!current) {
        return current
      }
      return {
        ...current,
        research_type_suggestion: null,
      }
    })
  }

  const onApplyJournalRecommendation = () => {
    const articleRecommendation = suggestions?.article_type_recommendation
    const wordLengthRecommendation = suggestions?.word_length_recommendation
    if (articleRecommendation?.value) {
      onApplyArticleType(articleRecommendation.value)
    }
    if (wordLengthRecommendation?.value) {
      onApplyWordLength(wordLengthRecommendation.value)
    }
    setSuggestions((current) => {
      if (!current) {
        return current
      }
      return {
        ...current,
        article_type_recommendation: null,
        word_length_recommendation: null,
      }
    })
  }

  return (
    <aside className="space-y-3 rounded-lg border border-border bg-card p-3">
      <h3 className="text-sm font-semibold">Research Overview Suggestions</h3>

      <div className="space-y-2 rounded-md border border-border bg-background p-3">
        <p className="text-sm font-medium">Suggestion controls</p>
        <p className="text-xs text-muted-foreground">Generate AI suggestions on demand.</p>
        <div className="flex flex-wrap items-center gap-2">
          <Button className={ACTION_BUTTON_CLASS} size="sm" onClick={() => void onToggleRefinements()} disabled={!summary.trim() || loading}>
            {refinementsEnabled ? 'Hide suggestions' : 'Show suggestions'}
          </Button>
          {refinementsEnabled ? (
            <Button
              size="sm"
              variant="outline"
              className={OUTLINE_ACTION_BUTTON_CLASS}
              onClick={() => void generateSuggestions()}
              disabled={!summary.trim() || loading}
            >
              {loading ? 'Refreshing...' : 'Refresh'}
            </Button>
          ) : null}
        </div>
        {!summary.trim() ? <p className="text-xs text-muted-foreground">Add a summary of research to enable suggestions.</p> : null}
        {refinementsEnabled && isStale ? <p className="text-xs text-muted-foreground">Summary changed. Refresh suggestions.</p> : null}
        {requestError ? <p className="text-xs text-destructive">{requestError}</p> : null}
      </div>

      {refinementsEnabled && summaryOptions.length > 0 ? (
        <div className={SUMMARY_CARD_CLASS}>
          <p className="text-sm font-medium">Summary of research refinement</p>
          <p className="text-xs text-slate-700">AI rewrite options based on your current research summary.</p>
          <div className="space-y-2">
            {summaryOptions.map((option) => (
              <div key={option} className="rounded border border-emerald-200 bg-white/80 p-2">
                <p className="text-xs text-slate-700">{option}</p>
                <Button size="sm" className={`mt-2 ${ACTION_BUTTON_CLASS}`} onClick={() => onApplySummary(option)}>
                  Replace summary
                </Button>
              </div>
            ))}
          </div>
        </div>
      ) : null}

      {refinementsEnabled && suggestions?.research_type_suggestion ? (
        <div className={RESEARCH_TYPE_CARD_CLASS}>
          <p className="text-sm font-medium">Research type suggestion</p>
          <p className="text-xs text-slate-700">{suggestions.research_type_suggestion.rationale}</p>
          <Button size="sm" className={ACTION_BUTTON_CLASS} onClick={onApplyResearchTypeSuggestion}>
            Apply suggested research type
          </Button>
        </div>
      ) : null}

      {refinementsEnabled && hasJournalRecommendation ? (
        <div className={JOURNAL_CARD_CLASS}>
          <p className="text-sm font-medium">Journal recommendation</p>
          {suggestions?.article_type_recommendation ? (
            <div className="rounded border border-amber-200 bg-white/80 p-2">
              <p className="text-xs font-medium text-slate-800">Article type</p>
              <p className="text-xs text-slate-700">{suggestions.article_type_recommendation.value}</p>
              <p className="mt-1 text-xs text-slate-600">{suggestions.article_type_recommendation.rationale}</p>
            </div>
          ) : null}
          {suggestions?.word_length_recommendation ? (
            <div className="rounded border border-amber-200 bg-white/80 p-2">
              <p className="text-xs font-medium text-slate-800">Recommended word length</p>
              <p className="text-xs text-slate-700">{suggestions.word_length_recommendation.value}</p>
              <p className="mt-1 text-xs text-slate-600">{suggestions.word_length_recommendation.rationale}</p>
            </div>
          ) : null}
          <Button size="sm" className={ACTION_BUTTON_CLASS} onClick={onApplyJournalRecommendation}>
            Apply journal recommendations
          </Button>
        </div>
      ) : null}

      {refinementsEnabled && (suggestions?.guidance_suggestions?.length ?? 0) > 0 ? (
        <div className={GUIDANCE_CARD_CLASS}>
          <p className="text-sm font-medium">Additional guidance</p>
          <div className="space-y-1">
            {suggestions?.guidance_suggestions.map((item) => (
              <p key={item} className="text-xs text-slate-700">
                - {item}
              </p>
            ))}
          </div>
          {suggestions?.source_urls.length ? (
            <p className="text-[11px] text-slate-500">Live journal sources checked: {suggestions.source_urls.length}</p>
          ) : (
            <p className="text-[11px] text-slate-500">Live journal sources were unavailable; fallback guidance applied.</p>
          )}
        </div>
      ) : null}

      {refinementsEnabled &&
      hasGenerated &&
      summaryOptions.length === 0 &&
      !suggestions?.research_type_suggestion &&
      !hasJournalRecommendation &&
      (suggestions?.guidance_suggestions.length ?? 0) === 0 ? (
        <div className="rounded-md border border-border bg-background p-3">
          <p className="text-sm font-medium">No pending suggestions</p>
          <p className="text-xs text-muted-foreground">Applied suggestions are removed automatically. Use Refresh to generate new options.</p>
        </div>
      ) : null}
    </aside>
  )
}

