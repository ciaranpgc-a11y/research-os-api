import { useEffect, useMemo, useRef, useState } from 'react'

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
  currentWordLength: string
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
const SUMMARY_CARD_CLASS = 'space-y-2 rounded-md border border-emerald-300 bg-gradient-to-br from-emerald-50 to-emerald-100 p-3 shadow-sm'
const RESEARCH_TYPE_CARD_CLASS = 'space-y-2 rounded-md border border-sky-300 bg-gradient-to-br from-sky-50 to-sky-100 p-3 shadow-sm'
const INTERPRETATION_CARD_CLASS = 'space-y-2 rounded-md border border-cyan-300 bg-gradient-to-br from-cyan-50 to-cyan-100 p-3 shadow-sm'
const JOURNAL_CARD_CLASS = 'space-y-2 rounded-md border border-amber-300 bg-gradient-to-br from-amber-50 to-amber-100 p-3 shadow-sm'
const CARD_TRANSITION_CLASS = 'transition-all duration-500 ease-out'

type AppliedKey = 'summary' | 'researchType' | 'interpretationMode' | 'journal'

export function Step1Panel({
  summary,
  researchCategory,
  researchType,
  interpretationMode,
  targetJournal,
  currentArticleType,
  currentWordLength,
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
  const [appliedState, setAppliedState] = useState<Record<AppliedKey, boolean>>({
    summary: false,
    researchType: false,
    interpretationMode: false,
    journal: false,
  })
  const applyTimersRef = useRef<number[]>([])

  useEffect(() => {
    return () => {
      applyTimersRef.current.forEach((timerId) => window.clearTimeout(timerId))
      applyTimersRef.current = []
    }
  }, [])

  const currentKey = useMemo(
    () =>
      `${summary.trim().toLowerCase()}::${researchCategory.trim().toLowerCase()}::${researchType
        .trim()
        .toLowerCase()}::${targetJournal.trim().toLowerCase()}`,
    [researchCategory, researchType, summary, targetJournal],
  )
  const hasGenerated = generatedKey.length > 0
  const isStale = hasGenerated && generatedKey !== currentKey
  const summarySuggestion = suggestions?.summary_refinements[0] ?? ''

  const normalize = (value: string) => value.trim().toLowerCase()
  const researchTypeSuggestion = suggestions?.research_type_suggestion
  const interpretationSuggestion = suggestions?.interpretation_mode_recommendation
  const articleSuggestion = suggestions?.article_type_recommendation
  const wordLengthSuggestion = suggestions?.word_length_recommendation
  const isSummaryApplied = Boolean(summarySuggestion && normalize(summarySuggestion) === normalize(summary))
  const isResearchTypeApplied = Boolean(
    researchTypeSuggestion &&
      normalize(researchTypeSuggestion.value) &&
      normalize(researchTypeSuggestion.value) === normalize(researchType),
  )
  const isInterpretationModeApplied = Boolean(
    interpretationSuggestion &&
      normalize(interpretationSuggestion.value) &&
      normalize(interpretationSuggestion.value) === normalize(interpretationMode),
  )
  const isArticleTypeApplied = Boolean(
    articleSuggestion &&
      normalize(articleSuggestion.value) &&
      normalize(articleSuggestion.value) === normalize(currentArticleType),
  )
  const isWordLengthApplied = Boolean(
    wordLengthSuggestion &&
      normalize(wordLengthSuggestion.value) &&
      normalize(wordLengthSuggestion.value) === normalize(currentWordLength),
  )
  const shouldShowJournalApplyButton = Boolean(
    (articleSuggestion && !isArticleTypeApplied) || (wordLengthSuggestion && !isWordLengthApplied),
  )

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

  const markApplied = (key: AppliedKey) => {
    setAppliedState((current) => ({ ...current, [key]: true }))
    const timerId = window.setTimeout(() => {
      setAppliedState((current) => ({ ...current, [key]: false }))
    }, 850)
    applyTimersRef.current.push(timerId)
  }

  const onApplySummary = (option: string) => {
    onReplaceSummary(option)
    markApplied('summary')
  }

  const onApplyResearchTypeSuggestion = () => {
    const recommendation = suggestions?.research_type_suggestion
    if (!recommendation) {
      return
    }
    onApplyResearchType(recommendation.value)
    markApplied('researchType')
  }

  const onApplyInterpretationModeSuggestion = () => {
    const recommendation = suggestions?.interpretation_mode_recommendation
    if (!recommendation) {
      return
    }
    onApplyInterpretationMode(recommendation.value)
    markApplied('interpretationMode')
  }

  const onApplyJournalRecommendation = () => {
    const articleRecommendation = articleSuggestion
    const wordLengthRecommendation = wordLengthSuggestion
    if (articleRecommendation?.value) {
      onApplyArticleType(articleRecommendation.value)
    }
    if (wordLengthRecommendation?.value) {
      onApplyWordLength(wordLengthRecommendation.value)
    }
    onJournalRecommendationsLockedChange(true)
    markApplied('journal')
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
        {refinementsEnabled && isStale ? <p className="text-xs text-muted-foreground">Inputs changed. Refresh suggestions.</p> : null}
        {requestError ? <p className="text-xs text-destructive">{requestError}</p> : null}
      </div>

      {refinementsEnabled ? (
        <div
          className={`${SUMMARY_CARD_CLASS} ${CARD_TRANSITION_CLASS} ${
            appliedState.summary ? 'ring-2 ring-emerald-300 shadow-md' : ''
          }`}
        >
          <p className="text-sm font-medium text-emerald-900">Summary of research refinement</p>
          {loading && !hasGenerated ? <p className="text-xs text-emerald-900">Generating rewrite...</p> : null}
          {!loading && !summarySuggestion ? <p className="text-xs text-emerald-900">No summary rewrite returned. Use Refresh.</p> : null}
          {summarySuggestion ? (
            <div className="rounded border border-emerald-300 bg-white p-2">
              <p className="text-xs text-emerald-950">{summarySuggestion}</p>
              {isSummaryApplied ? (
                <p className="mt-2 text-xs text-emerald-900">Current summary already matches the suggested refinement.</p>
              ) : (
                <Button size="sm" className={`mt-2 ${ACTION_BUTTON_CLASS}`} onClick={() => onApplySummary(summarySuggestion)}>
                  Replace summary
                </Button>
              )}
            </div>
          ) : null}
        </div>
      ) : null}

      {refinementsEnabled ? (
        <div
          className={`${RESEARCH_TYPE_CARD_CLASS} ${CARD_TRANSITION_CLASS} ${
            appliedState.researchType ? 'ring-2 ring-sky-300 shadow-md' : ''
          }`}
        >
          <p className="text-sm font-medium text-sky-900">Research type suggestion</p>
          {loading && !hasGenerated ? <p className="text-xs text-sky-900">Generating research type suggestion...</p> : null}
          {!loading && !researchTypeSuggestion ? (
            <p className="text-xs text-sky-900">No research type suggestion returned. Use Refresh.</p>
          ) : null}
          {researchTypeSuggestion && isResearchTypeApplied ? (
            <>
              <p className="text-xs text-sky-900">
                Correct research type selected: <span className="font-semibold">{researchTypeSuggestion.value}</span>
              </p>
              <p className="text-xs text-sky-900">Appropriate because: {researchTypeSuggestion.rationale}</p>
            </>
          ) : null}
          {researchTypeSuggestion && !isResearchTypeApplied ? (
            <>
              <p className="text-xs text-sky-900">
                Recommended research type: <span className="font-semibold">{researchTypeSuggestion.value}</span>
              </p>
              <p className="text-xs text-sky-900">{researchTypeSuggestion.rationale}</p>
              <Button size="sm" className={ACTION_BUTTON_CLASS} onClick={onApplyResearchTypeSuggestion}>
                Apply suggested research type
              </Button>
            </>
          ) : null}
        </div>
      ) : null}

      {refinementsEnabled ? (
        <div
          className={`${INTERPRETATION_CARD_CLASS} ${CARD_TRANSITION_CLASS} ${
            appliedState.interpretationMode ? 'ring-2 ring-cyan-300 shadow-md' : ''
          }`}
        >
          <p className="text-sm font-medium text-cyan-900">Interpretation mode suggestion</p>
          {loading && !hasGenerated ? <p className="text-xs text-cyan-900">Generating interpretation mode suggestion...</p> : null}
          {!loading && !interpretationSuggestion ? (
            <p className="text-xs text-cyan-900">No interpretation mode suggestion returned. Use Refresh.</p>
          ) : null}
          {interpretationSuggestion && isInterpretationModeApplied ? (
            <>
              <p className="text-xs text-cyan-900">
                Correct interpretation mode selected:{' '}
                <span className="font-semibold">{suggestions?.interpretation_mode_recommendation?.value}</span>
              </p>
              {suggestions?.interpretation_mode_recommendation?.rationale ? (
                <p className="text-xs text-cyan-900">Appropriate because: {suggestions.interpretation_mode_recommendation.rationale}</p>
              ) : null}
            </>
          ) : null}
          {interpretationSuggestion && !isInterpretationModeApplied ? (
            <>
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
            </>
          ) : null}
        </div>
      ) : null}

      {refinementsEnabled ? (
        <div
          className={`${JOURNAL_CARD_CLASS} ${CARD_TRANSITION_CLASS} ${
            appliedState.journal ? 'ring-2 ring-amber-300 shadow-md' : ''
          }`}
        >
          <p className="text-sm font-medium text-amber-900">Journal recommendation</p>
          {loading && !hasGenerated ? <p className="text-xs text-amber-900">Generating journal recommendations...</p> : null}
          {articleSuggestion ? (
            <div className="rounded border border-amber-300 bg-white p-2">
              <p className="text-xs font-medium text-amber-950">Article type</p>
              <p className="text-xs text-amber-900">{articleSuggestion.value}</p>
              <p className="mt-1 text-xs text-amber-900">{articleSuggestion.rationale}</p>
              <p className="mt-1 text-xs text-amber-900">
                {isArticleTypeApplied ? 'Correct article type selected.' : 'Update required to match recommendation.'}
              </p>
            </div>
          ) : (
            !loading && <p className="text-xs text-amber-900">No article type recommendation returned.</p>
          )}
          {wordLengthSuggestion ? (
            <div className="rounded border border-amber-300 bg-white p-2">
              <p className="text-xs font-medium text-amber-950">Recommended word length</p>
              <p className="text-xs text-amber-900">{wordLengthSuggestion.value}</p>
              <p className="mt-1 text-xs text-amber-900">{wordLengthSuggestion.rationale}</p>
              <p className="mt-1 text-xs text-amber-900">
                {isWordLengthApplied ? 'Correct word length selected.' : 'Update required to match recommendation.'}
              </p>
            </div>
          ) : (
            !loading && <p className="text-xs text-amber-900">No word length recommendation returned.</p>
          )}
          {shouldShowJournalApplyButton ? (
            <Button size="sm" className={ACTION_BUTTON_CLASS} onClick={onApplyJournalRecommendation}>
              Apply journal recommendations
            </Button>
          ) : articleSuggestion || wordLengthSuggestion ? (
            <p className="text-xs text-amber-900">Journal recommendations are already applied.</p>
          ) : (
            !loading && <p className="text-xs text-amber-900">No journal recommendations returned. Use Refresh.</p>
          )}
        </div>
      ) : null}
    </aside>
  )
}
