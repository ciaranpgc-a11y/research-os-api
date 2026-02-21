import { useMemo, useState } from 'react'

import { Button } from '@/components/ui/button'
import { fetchResearchOverviewSuggestions } from '@/lib/study-core-api'
import type { ResearchOverviewSuggestionsPayload } from '@/types/study-core'

type Step1PanelProps = {
  summary: string
  researchCategory: string
  researchType: string
  interpretationMode: string
  targetJournal: string
  currentArticleType: string
  onReplaceSummary: (value: string) => void
  onApplyResearchType: (value: string) => void
  onApplyInterpretationMode: (value: string) => void
  onApplyArticleType: (value: string) => void
  onApplyWordLength: (value: string) => void
  onJournalRecommendationsLockedChange: (locked: boolean) => void
}

const ACTION_BUTTON_CLASS = 'bg-emerald-600 text-white hover:bg-emerald-700 focus-visible:ring-emerald-500'
const OUTLINE_ACTION_BUTTON_CLASS =
  'border-emerald-300 text-emerald-800 hover:bg-emerald-100 focus-visible:ring-emerald-500'
const SUMMARY_CARD_CLASS = 'space-y-2 rounded-md border border-emerald-400 bg-emerald-100 p-3'
const RESEARCH_TYPE_CARD_CLASS = 'space-y-2 rounded-md border border-sky-400 bg-sky-100 p-3'
const INTERPRETATION_CARD_CLASS = 'space-y-2 rounded-md border border-cyan-400 bg-cyan-100 p-3'
const JOURNAL_CARD_CLASS = 'space-y-2 rounded-md border border-amber-400 bg-amber-100 p-3'

export function Step1Panel({
  summary,
  researchCategory,
  researchType,
  interpretationMode,
  targetJournal,
  currentArticleType,
  onReplaceSummary,
  onApplyResearchType,
  onApplyInterpretationMode,
  onApplyArticleType,
  onApplyWordLength,
  onJournalRecommendationsLockedChange,
}: Step1PanelProps) {
  const [refinementsEnabled, setRefinementsEnabled] = useState(false)
  const [loading, setLoading] = useState(false)
  const [requestError, setRequestError] = useState('')
  const [suggestions, setSuggestions] = useState<ResearchOverviewSuggestionsPayload | null>(null)
  const [generatedKey, setGeneratedKey] = useState('')

  const currentKey = useMemo(
    () =>
      `${summary.trim().toLowerCase()}::${researchCategory.trim().toLowerCase()}::${researchType
        .trim()
        .toLowerCase()}::${currentArticleType.trim().toLowerCase()}::${interpretationMode
        .trim()
        .toLowerCase()}::${targetJournal.trim().toLowerCase()}`,
    [currentArticleType, interpretationMode, researchCategory, researchType, summary, targetJournal],
  )
  const hasGenerated = generatedKey.length > 0
  const isStale = hasGenerated && generatedKey !== currentKey
  const summaryOptions = suggestions?.summary_refinements.slice(0, 1) ?? []
  const hasInterpretationRecommendation = Boolean(suggestions?.interpretation_mode_recommendation)
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
        researchCategory,
        researchType,
        articleType: currentArticleType,
        interpretationMode,
        summaryOfResearch: summary,
      })
      setSuggestions(response)
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
        summary_refinements: [],
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

  const onApplyInterpretationModeSuggestion = () => {
    const recommendation = suggestions?.interpretation_mode_recommendation
    if (!recommendation) {
      return
    }
    onApplyInterpretationMode(recommendation.value)
    setSuggestions((current) => {
      if (!current) {
        return current
      }
      return {
        ...current,
        interpretation_mode_recommendation: null,
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
    onJournalRecommendationsLockedChange(true)
  }

  return (
    <aside className="space-y-3 rounded-lg border border-border bg-card p-3">
      <h3 className="text-sm font-semibold">Research Overview Suggestions</h3>

      <div className="space-y-2 rounded-md border border-slate-300 bg-slate-100 p-3">
        <p className="text-sm font-medium">Suggestion controls</p>
        <p className="text-xs text-slate-600">Generate AI suggestions on demand.</p>
        <div className="flex flex-wrap items-center gap-2">
          <Button className={ACTION_BUTTON_CLASS} size="sm" onClick={() => void onToggleRefinements()} disabled={!summary.trim() || loading}>
            {refinementsEnabled ? 'Hide suggestions' : 'Show suggestions'}
          </Button>
          {refinementsEnabled ? (
            <Button
              size="sm"
              variant="outline"
              className={OUTLINE_ACTION_BUTTON_CLASS}
              onClick={() => {
                onJournalRecommendationsLockedChange(false)
                void generateSuggestions()
              }}
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
          <p className="text-sm font-medium text-emerald-900">Summary of research refinement</p>
          <p className="text-xs text-emerald-900">AI rewrite option based on your current research summary.</p>
          <div className="space-y-2">
            {summaryOptions.map((option) => (
              <div key={option} className="rounded border border-emerald-300 bg-white p-2">
                <p className="text-xs text-emerald-950">{option}</p>
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
          <p className="text-sm font-medium text-sky-900">Research type suggestion</p>
          <p className="text-xs text-sky-900">
            Recommended research type: <span className="font-semibold">{suggestions.research_type_suggestion.value}</span>
          </p>
          <p className="text-xs text-sky-900">{suggestions.research_type_suggestion.rationale}</p>
          <Button size="sm" className={ACTION_BUTTON_CLASS} onClick={onApplyResearchTypeSuggestion}>
            Apply suggested research type
          </Button>
        </div>
      ) : null}

      {refinementsEnabled && hasInterpretationRecommendation ? (
        <div className={INTERPRETATION_CARD_CLASS}>
          <p className="text-sm font-medium text-cyan-900">Interpretation mode suggestion</p>
          <p className="text-xs text-cyan-900">
            Recommended interpretation mode:{' '}
            <span className="font-semibold">{suggestions?.interpretation_mode_recommendation?.value}</span>
          </p>
          {suggestions?.interpretation_mode_recommendation?.rationale ? (
            <p className="text-xs text-cyan-900">{suggestions.interpretation_mode_recommendation.rationale}</p>
          ) : null}
          <Button size="sm" className={ACTION_BUTTON_CLASS} onClick={onApplyInterpretationModeSuggestion}>
            Apply interpretation mode
          </Button>
        </div>
      ) : null}

      {refinementsEnabled && hasJournalRecommendation ? (
        <div className={JOURNAL_CARD_CLASS}>
          <p className="text-sm font-medium text-amber-900">Journal recommendation</p>
          {suggestions?.article_type_recommendation ? (
            <div className="rounded border border-amber-300 bg-white p-2">
              <p className="text-xs font-medium text-amber-950">Article type</p>
              <p className="text-xs text-amber-900">{suggestions.article_type_recommendation.value}</p>
              <p className="mt-1 text-xs text-amber-900">{suggestions.article_type_recommendation.rationale}</p>
            </div>
          ) : null}
          {suggestions?.word_length_recommendation ? (
            <div className="rounded border border-amber-300 bg-white p-2">
              <p className="text-xs font-medium text-amber-950">Recommended word length</p>
              <p className="text-xs text-amber-900">{suggestions.word_length_recommendation.value}</p>
              <p className="mt-1 text-xs text-amber-900">{suggestions.word_length_recommendation.rationale}</p>
            </div>
          ) : null}
          <Button size="sm" className={ACTION_BUTTON_CLASS} onClick={onApplyJournalRecommendation}>
            Apply journal recommendations
          </Button>
        </div>
      ) : null}

      {refinementsEnabled &&
      hasGenerated &&
      summaryOptions.length === 0 &&
      !suggestions?.research_type_suggestion &&
      !hasInterpretationRecommendation &&
      !hasJournalRecommendation ? (
        <div className="rounded-md border border-border bg-background p-3">
          <p className="text-sm font-medium">No pending suggestions</p>
          <p className="text-xs text-muted-foreground">Applied suggestions are removed automatically. Use Refresh to generate new options.</p>
        </div>
      ) : null}
    </aside>
  )
}
