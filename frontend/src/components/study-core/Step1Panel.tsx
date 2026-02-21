import { useEffect, useMemo, useRef, useState } from 'react'

import { Button } from '@/components/ui/button'
import { API_BASE_URL } from '@/lib/api'
import { fetchResearchOverviewSuggestions } from '@/lib/study-core-api'
import type { ResearchOverviewSuggestionsPayload } from '@/types/study-core'

type Step1PanelProps = {
  summary: string
  researchCategory: string
  researchType: string
  studyTypeOptions: string[]
  interpretationMode: string
  targetJournal: string
  currentArticleType: string
  currentWordLength: string
  onReplaceSummary: (value: string) => void
  onApplyResearchCategory: (value: string) => void
  onApplyResearchType: (value: string) => void
  onApplyInterpretationMode: (value: string) => void
  onApplyArticleType: (value: string) => void
  onApplyWordLength: (value: string) => void
}

const ACTION_BUTTON_CLASS = 'bg-emerald-600 text-white hover:bg-emerald-700 focus-visible:ring-emerald-500'
const OUTLINE_ACTION_BUTTON_CLASS =
  'border-emerald-300 text-emerald-800 hover:bg-emerald-100 focus-visible:ring-emerald-500'
const SUMMARY_CARD_CLASS = 'space-y-2 rounded-md border border-emerald-400 bg-emerald-50 p-3 shadow-sm'
const RESEARCH_CATEGORY_CARD_CLASS = 'space-y-2 rounded-md border border-violet-400 bg-violet-50 p-3 shadow-sm'
const RESEARCH_TYPE_CARD_CLASS = 'space-y-2 rounded-md border border-sky-400 bg-sky-50 p-3 shadow-sm'
const INTERPRETATION_CARD_CLASS = 'space-y-2 rounded-md border border-cyan-400 bg-cyan-50 p-3 shadow-sm'
const JOURNAL_CARD_CLASS = 'space-y-2 rounded-md border border-amber-400 bg-amber-50 p-3 shadow-sm'
const APPLIED_SUMMARY_CARD_CLASS = 'space-y-1 rounded-md border border-emerald-300 bg-emerald-50 p-3'
const APPLIED_CATEGORY_CARD_CLASS = 'space-y-1 rounded-md border border-violet-300 bg-violet-50 p-3'
const APPLIED_TYPE_CARD_CLASS = 'space-y-1 rounded-md border border-sky-300 bg-sky-50 p-3'
const APPLIED_INTERPRETATION_CARD_CLASS = 'space-y-1 rounded-md border border-cyan-300 bg-cyan-50 p-3'
const APPLIED_JOURNAL_CARD_CLASS = 'space-y-1 rounded-md border border-amber-300 bg-amber-50 p-3'
const CARD_TRANSITION_CLASS = 'transition-all duration-300 ease-out'

type AppliedKey = 'summary' | 'researchCategory' | 'researchType' | 'interpretationMode' | 'journal'
type SuggestionKey = AppliedKey

function inferOfflineResearchCategory(summary: string, currentValue: string): string {
  const normalizedCurrent = currentValue.trim()
  if (normalizedCurrent) {
    return normalizedCurrent
  }
  const lowerSummary = summary.toLowerCase()
  if (
    lowerSummary.includes('literature review') ||
    lowerSummary.includes('narrative review') ||
    lowerSummary.includes('scoping review') ||
    lowerSummary.includes('review article')
  ) {
    return 'Methodological / Analytical'
  }
  if (lowerSummary.includes('diagnostic') || lowerSummary.includes('accuracy')) {
    return 'Diagnostic Study'
  }
  if (lowerSummary.includes('prognostic') || lowerSummary.includes('risk model')) {
    return 'Prognostic / Risk Modelling'
  }
  if (
    lowerSummary.includes('reproducibility') ||
    lowerSummary.includes('repeatability') ||
    lowerSummary.includes('inter-reader')
  ) {
    return 'Reproducibility / Technical Validation'
  }
  if (
    lowerSummary.includes('haemodynamic integration') ||
    lowerSummary.includes('hemodynamic integration') ||
    lowerSummary.includes('multimodality')
  ) {
    return 'Multimodality Integration'
  }
  if (lowerSummary.includes('ai') || lowerSummary.includes('radiomics')) {
    return 'AI / Radiomics'
  }
  if (
    lowerSummary.includes('cross-sectional') ||
    lowerSummary.includes('longitudinal imaging') ||
    lowerSummary.includes('biomarker')
  ) {
    return 'Imaging Biomarker Study'
  }
  return 'Observational Clinical Cohort'
}

function inferOfflineStudyType(studyTypeOptions: string[], summary: string, currentValue: string): string {
  const lowerSummary = summary.toLowerCase()
  const candidates = [...studyTypeOptions]
  if (currentValue.trim()) {
    candidates.unshift(currentValue.trim())
  }
  const uniqueCandidates = Array.from(new Set(candidates))

  const matchByKeyword = (keywords: string[]) =>
    uniqueCandidates.find((option) => keywords.every((keyword) => option.toLowerCase().includes(keyword)))

  if (lowerSummary.includes('haemodynamic') || lowerSummary.includes('hemodynamic')) {
    const integrated = matchByKeyword(['haemodynamic', 'integration']) || matchByKeyword(['hemodynamic', 'integration'])
    if (integrated) {
      return integrated
    }
  }
  if (
    lowerSummary.includes('literature review') ||
    lowerSummary.includes('narrative review') ||
    lowerSummary.includes('scoping review') ||
    lowerSummary.includes('review article')
  ) {
    const reviewStudy =
      matchByKeyword(['narrative', 'literature', 'synthesis']) || matchByKeyword(['scoping', 'evidence', 'synthesis'])
    if (reviewStudy) {
      return reviewStudy
    }
  }
  if (lowerSummary.includes('diagnostic') || lowerSummary.includes('accuracy')) {
    const diagnostic = uniqueCandidates.find((option) => option.toLowerCase().includes('diagnostic'))
    if (diagnostic) {
      return diagnostic
    }
  }
  if (lowerSummary.includes('prognostic') || lowerSummary.includes('risk')) {
    const prognostic = uniqueCandidates.find((option) => option.toLowerCase().includes('prognostic'))
    if (prognostic) {
      return prognostic
    }
  }
  if (lowerSummary.includes('retrospective')) {
    const retrospective = uniqueCandidates.find((option) => option.toLowerCase().includes('retrospective'))
    if (retrospective) {
      return retrospective
    }
  }
  if (lowerSummary.includes('prospective')) {
    const prospective = uniqueCandidates.find((option) => option.toLowerCase().includes('prospective'))
    if (prospective) {
      return prospective
    }
  }
  if (lowerSummary.includes('case series')) {
    const caseSeries = uniqueCandidates.find((option) => option.toLowerCase().includes('case series'))
    if (caseSeries) {
      return caseSeries
    }
  }
  return uniqueCandidates[0] ?? ''
}

function inferOfflineInterpretationMode(summary: string): string {
  const lowerSummary = summary.toLowerCase()
  if (lowerSummary.includes('diagnostic') || lowerSummary.includes('accuracy')) {
    return 'Diagnostic performance interpretation'
  }
  if (lowerSummary.includes('prognostic') || lowerSummary.includes('survival') || lowerSummary.includes('time-to-event')) {
    return 'Time-to-event prognostic interpretation'
  }
  if (lowerSummary.includes('mechanistic') || lowerSummary.includes('pathophysiolog')) {
    return 'Hypothesis-generating mechanistic interpretation'
  }
  return 'Associative risk or prognostic inference'
}

function buildOfflineSuggestions(input: {
  summary: string
  researchCategory: string
  researchType: string
  studyTypeOptions: string[]
  interpretationMode: string
  articleType: string
  wordLength: string
}): ResearchOverviewSuggestionsPayload {
  const normalizedSummary = input.summary.trim()
  const offlineResearchCategory = inferOfflineResearchCategory(normalizedSummary, input.researchCategory)
  const offlineStudyType = inferOfflineStudyType(input.studyTypeOptions, normalizedSummary, input.researchType)
  const offlineInterpretationMode = input.interpretationMode.trim() || inferOfflineInterpretationMode(normalizedSummary)
  const offlineArticleType = input.articleType.trim() || 'Original Research Article'
  const offlineWordLength = input.wordLength.trim() || '3,000-4,500 words (provisional; verify at submission)'

  return {
    summary_refinements: normalizedSummary ? [normalizedSummary] : [],
    research_category_suggestion: offlineResearchCategory
      ? {
          value: offlineResearchCategory,
          rationale: 'Provisional offline recommendation based on summary framing.',
        }
      : null,
    research_type_suggestion: offlineStudyType
      ? {
          value: offlineStudyType,
          rationale: 'Provisional offline recommendation based on summary terms and available study-type options.',
        }
      : null,
    interpretation_mode_recommendation: offlineInterpretationMode
      ? {
          value: offlineInterpretationMode,
          rationale: 'Provisional offline recommendation from summary wording.',
        }
      : null,
    article_type_recommendation: {
      value: offlineArticleType,
      rationale: 'Provisional offline recommendation used because the live API is unavailable.',
    },
    word_length_recommendation: {
      value: offlineWordLength,
      rationale: 'Provisional offline recommendation used because the live API is unavailable.',
    },
    guidance_suggestions: [],
    source_urls: [],
    model_used: 'offline-fallback',
  }
}

export function Step1Panel({
  summary,
  researchCategory,
  researchType,
  studyTypeOptions,
  interpretationMode,
  targetJournal,
  currentArticleType,
  currentWordLength,
  onReplaceSummary,
  onApplyResearchCategory,
  onApplyResearchType,
  onApplyInterpretationMode,
  onApplyArticleType,
  onApplyWordLength,
}: Step1PanelProps) {
  const [refinementsEnabled, setRefinementsEnabled] = useState(false)
  const [loading, setLoading] = useState(false)
  const [requestError, setRequestError] = useState('')
  const [suggestions, setSuggestions] = useState<ResearchOverviewSuggestionsPayload | null>(null)
  const [generatedKey, setGeneratedKey] = useState('')
  const [appliedState, setAppliedState] = useState<Record<AppliedKey, boolean>>({
    summary: false,
    researchCategory: false,
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
  const researchCategorySuggestion = suggestions?.research_category_suggestion
  const researchTypeSuggestion = suggestions?.research_type_suggestion
  const interpretationSuggestion = suggestions?.interpretation_mode_recommendation
  const articleSuggestion = suggestions?.article_type_recommendation
  const wordLengthSuggestion = suggestions?.word_length_recommendation
  const isSummaryApplied = Boolean(summarySuggestion && normalize(summarySuggestion) === normalize(summary))
  const isResearchCategoryApplied = Boolean(
    researchCategorySuggestion &&
      normalize(researchCategorySuggestion.value) &&
      normalize(researchCategorySuggestion.value) === normalize(researchCategory),
  )
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
  const hasAnyJournalRecommendation = Boolean(articleSuggestion || wordLengthSuggestion)
  const isJournalApplied = hasAnyJournalRecommendation && !shouldShowJournalApplyButton

  const pendingKeys = useMemo(() => {
    const keys: SuggestionKey[] = []
    if (summarySuggestion && !isSummaryApplied) {
      keys.push('summary')
    }
    if (researchCategorySuggestion && !isResearchCategoryApplied) {
      keys.push('researchCategory')
    }
    if (researchTypeSuggestion && !isResearchTypeApplied) {
      keys.push('researchType')
    }
    if (interpretationSuggestion && !isInterpretationModeApplied) {
      keys.push('interpretationMode')
    }
    if (shouldShowJournalApplyButton) {
      keys.push('journal')
    }
    return keys
  }, [
    interpretationSuggestion,
    isInterpretationModeApplied,
    isResearchCategoryApplied,
    isResearchTypeApplied,
    researchCategorySuggestion,
    researchTypeSuggestion,
    shouldShowJournalApplyButton,
    summarySuggestion,
    isSummaryApplied,
  ])

  const appliedKeys = useMemo(() => {
    const keys: SuggestionKey[] = []
    if (summarySuggestion && isSummaryApplied) {
      keys.push('summary')
    }
    if (researchCategorySuggestion && isResearchCategoryApplied) {
      keys.push('researchCategory')
    }
    if (researchTypeSuggestion && isResearchTypeApplied) {
      keys.push('researchType')
    }
    if (interpretationSuggestion && isInterpretationModeApplied) {
      keys.push('interpretationMode')
    }
    if (isJournalApplied) {
      keys.push('journal')
    }
    return keys
  }, [
    interpretationSuggestion,
    isInterpretationModeApplied,
    isJournalApplied,
    isResearchCategoryApplied,
    isResearchTypeApplied,
    researchCategorySuggestion,
    researchTypeSuggestion,
    summarySuggestion,
    isSummaryApplied,
  ])

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
        studyTypeOptions,
        articleType: currentArticleType,
        interpretationMode,
        summaryOfResearch: summary,
      })
      setSuggestions(response)
      setGeneratedKey(currentKey)
    } catch (error) {
      const fallback = buildOfflineSuggestions({
        summary,
        researchCategory,
        researchType,
        studyTypeOptions,
        interpretationMode,
        articleType: currentArticleType,
        wordLength: currentWordLength,
      })
      setSuggestions(fallback)
      setGeneratedKey(currentKey)
      const message = error instanceof Error ? error.message : 'Could not generate suggestions.'
      setRequestError(`${message} Showing provisional offline suggestions. Endpoint: ${API_BASE_URL}`)
    } finally {
      setLoading(false)
    }
  }

  const refreshSuggestions = async () => {
    setRefinementsEnabled(true)
    setAppliedState({
      summary: false,
      researchCategory: false,
      researchType: false,
      interpretationMode: false,
      journal: false,
    })
    await generateSuggestions()
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

  const onApplyResearchCategorySuggestion = () => {
    const recommendation = suggestions?.research_category_suggestion
    if (!recommendation) {
      return
    }
    onApplyResearchCategory(recommendation.value)
    markApplied('researchCategory')
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
    markApplied('journal')
  }

  const applyDisabled = loading
  const pendingToRender = pendingKeys.slice(0, 3)
  const hiddenPendingCount = Math.max(0, pendingKeys.length - pendingToRender.length)

  const suggestionCardPulseClass = (key: AppliedKey, colourClass: string) =>
    `${colourClass} ${CARD_TRANSITION_CLASS} ${
      appliedState[key] ? 'ring-2 ring-offset-1 shadow-md -translate-y-0.5' : ''
    }`

  const renderPendingCard = (key: SuggestionKey) => {
    if (key === 'summary') {
      return (
        <div key="pending-summary" className={suggestionCardPulseClass('summary', SUMMARY_CARD_CLASS)}>
          <p className="text-sm font-semibold text-emerald-900">Summary of research refinement</p>
          <div className="rounded border border-emerald-300 bg-white p-2">
            <p className="text-xs text-emerald-950">{summarySuggestion}</p>
          </div>
          <div className="flex items-center justify-between gap-2">
            <p className="text-xs text-emerald-900">{isStale ? 'Inputs changed. Refresh before applying.' : 'Direct rewrite only; no new claims added.'}</p>
            <Button size="sm" className={ACTION_BUTTON_CLASS} onClick={() => onApplySummary(summarySuggestion)} disabled={applyDisabled}>
              Replace summary
            </Button>
          </div>
        </div>
      )
    }

    if (key === 'researchCategory' && researchCategorySuggestion) {
      return (
        <div key="pending-category" className={suggestionCardPulseClass('researchCategory', RESEARCH_CATEGORY_CARD_CLASS)}>
          <p className="text-sm font-semibold text-violet-900">Research category suggestion</p>
          <p className="text-xs text-violet-900">
            Recommended category: <span className="font-semibold">{researchCategorySuggestion.value}</span>
          </p>
          <p className="text-xs text-violet-900">{researchCategorySuggestion.rationale}</p>
          <div className="flex items-center justify-end">
            <Button size="sm" className={ACTION_BUTTON_CLASS} onClick={onApplyResearchCategorySuggestion} disabled={applyDisabled}>
              Apply research category
            </Button>
          </div>
        </div>
      )
    }

    if (key === 'researchType' && researchTypeSuggestion) {
      return (
        <div key="pending-type" className={suggestionCardPulseClass('researchType', RESEARCH_TYPE_CARD_CLASS)}>
          <p className="text-sm font-semibold text-sky-900">Research type suggestion</p>
          <p className="text-xs text-sky-900">
            Recommended type: <span className="font-semibold">{researchTypeSuggestion.value}</span>
          </p>
          <p className="text-xs text-sky-900">{researchTypeSuggestion.rationale}</p>
          <div className="flex items-center justify-end">
            <Button size="sm" className={ACTION_BUTTON_CLASS} onClick={onApplyResearchTypeSuggestion} disabled={applyDisabled}>
              Apply suggested type
            </Button>
          </div>
        </div>
      )
    }

    if (key === 'interpretationMode' && interpretationSuggestion) {
      return (
        <div key="pending-interpretation" className={suggestionCardPulseClass('interpretationMode', INTERPRETATION_CARD_CLASS)}>
          <p className="text-sm font-semibold text-cyan-900">Interpretation mode suggestion</p>
          <p className="text-xs text-cyan-900">
            Recommended mode: <span className="font-semibold">{interpretationSuggestion.value}</span>
          </p>
          <p className="text-xs text-cyan-900">{interpretationSuggestion.rationale}</p>
          <div className="flex items-center justify-end">
            <Button size="sm" className={ACTION_BUTTON_CLASS} onClick={onApplyInterpretationModeSuggestion} disabled={applyDisabled}>
              Apply interpretation mode
            </Button>
          </div>
        </div>
      )
    }

    if (key === 'journal') {
      return (
        <div key="pending-journal" className={suggestionCardPulseClass('journal', JOURNAL_CARD_CLASS)}>
          <p className="text-sm font-semibold text-amber-900">Journal recommendation</p>
          {articleSuggestion ? (
            <div className="rounded border border-amber-300 bg-white p-2">
              <p className="text-xs font-medium text-amber-950">Article type</p>
              <p className="text-xs text-amber-900">{articleSuggestion.value}</p>
            </div>
          ) : null}
          {wordLengthSuggestion ? (
            <div className="rounded border border-amber-300 bg-white p-2">
              <p className="text-xs font-medium text-amber-950">Recommended word length</p>
              <p className="text-xs text-amber-900">{wordLengthSuggestion.value}</p>
            </div>
          ) : null}
          <div className="flex items-center justify-end">
            <Button size="sm" className={ACTION_BUTTON_CLASS} onClick={onApplyJournalRecommendation} disabled={applyDisabled}>
              Apply journal recommendation
            </Button>
          </div>
        </div>
      )
    }

    return null
  }

  const renderAppliedCard = (key: SuggestionKey) => {
    if (key === 'summary') {
      return (
        <div key="applied-summary" className={APPLIED_SUMMARY_CARD_CLASS}>
          <p className="text-sm font-medium text-slate-900">Summary refinement</p>
          <p className="text-xs text-slate-700">Current summary matches the suggested rewrite.</p>
        </div>
      )
    }
    if (key === 'researchCategory' && researchCategorySuggestion) {
      return (
        <div key="applied-category" className={APPLIED_CATEGORY_CARD_CLASS}>
          <p className="text-sm font-medium text-slate-900">Research category</p>
          <p className="text-xs text-slate-700">
            Correct category selected: <span className="font-semibold">{researchCategorySuggestion.value}</span>
          </p>
          <p className="text-xs text-slate-700">{researchCategorySuggestion.rationale}</p>
        </div>
      )
    }
    if (key === 'researchType' && researchTypeSuggestion) {
      return (
        <div key="applied-type" className={APPLIED_TYPE_CARD_CLASS}>
          <p className="text-sm font-medium text-slate-900">Research type</p>
          <p className="text-xs text-slate-700">
            Correct type selected: <span className="font-semibold">{researchTypeSuggestion.value}</span>
          </p>
          <p className="text-xs text-slate-700">{researchTypeSuggestion.rationale}</p>
        </div>
      )
    }
    if (key === 'interpretationMode' && interpretationSuggestion) {
      return (
        <div key="applied-interpretation" className={APPLIED_INTERPRETATION_CARD_CLASS}>
          <p className="text-sm font-medium text-slate-900">Interpretation mode</p>
          <p className="text-xs text-slate-700">
            Correct mode selected: <span className="font-semibold">{interpretationSuggestion.value}</span>
          </p>
          <p className="text-xs text-slate-700">{interpretationSuggestion.rationale}</p>
        </div>
      )
    }
    if (key === 'journal') {
      return (
        <div key="applied-journal" className={APPLIED_JOURNAL_CARD_CLASS}>
          <p className="text-sm font-medium text-slate-900">Journal recommendation</p>
          {articleSuggestion ? <p className="text-xs text-slate-700">Article type set: {articleSuggestion.value}</p> : null}
          {wordLengthSuggestion ? <p className="text-xs text-slate-700">Word length set: {wordLengthSuggestion.value}</p> : null}
          <p className="text-xs text-slate-700">Values are aligned with current recommendations.</p>
        </div>
      )
    }
    return null
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
          <Button
            size="sm"
            variant="outline"
            className={OUTLINE_ACTION_BUTTON_CLASS}
            onClick={() => void refreshSuggestions()}
            disabled={!summary.trim() || loading}
          >
            {loading ? 'Refreshing...' : 'Refresh suggestions'}
          </Button>
        </div>
        {!summary.trim() ? <p className="text-xs text-muted-foreground">Add a summary of research to enable suggestions.</p> : null}
        {summary.trim() && !targetJournal.trim() ? (
          <p className="text-xs text-muted-foreground">
            Select a working target journal for journal-specific article type and word length recommendations.
          </p>
        ) : null}
        {refinementsEnabled && isStale ? <p className="text-xs text-muted-foreground">Inputs changed. Refresh suggestions.</p> : null}
        {requestError ? <p className="text-xs text-destructive">{requestError}</p> : null}
      </div>

      {refinementsEnabled ? (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Pending actions</p>
            {loading ? <p className="text-xs text-muted-foreground">Generating...</p> : null}
          </div>
          {!hasGenerated && !loading ? (
            <p className="rounded-md border border-border/70 bg-muted/20 px-2 py-2 text-xs text-muted-foreground">
              Click Refresh suggestions to generate recommendations.
            </p>
          ) : null}
          {hasGenerated && pendingToRender.length === 0 && !loading ? (
            <p className="rounded-md border border-emerald-200 bg-emerald-50 px-2 py-2 text-xs text-emerald-900">
              No pending actions. Current selections align with suggestions.
            </p>
          ) : null}
          {pendingToRender.map((key) => renderPendingCard(key))}
          {hiddenPendingCount > 0 ? (
            <p className="text-xs text-muted-foreground">
              {hiddenPendingCount} additional action{hiddenPendingCount > 1 ? 's' : ''} hidden. Apply or refresh to reprioritise.
            </p>
          ) : null}
        </div>
      ) : null}

      {refinementsEnabled ? (
        <details className="rounded-md border border-border/80 bg-muted/15 p-3">
          <summary className="cursor-pointer text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Applied suggestions ({appliedKeys.length})
          </summary>
          <div className="mt-3 space-y-2">
            {appliedKeys.length === 0 ? <p className="text-xs text-muted-foreground">No suggestions applied yet.</p> : null}
            {appliedKeys.map((key) => renderAppliedCard(key))}
          </div>
        </details>
      ) : null}
    </aside>
  )
}
