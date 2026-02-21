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
const IGNORE_BUTTON_CLASS = 'border-slate-300 text-slate-700 hover:bg-slate-100 focus-visible:ring-slate-400'
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
type SuggestionProvenance = {
  label: 'Live journal guidance' | 'Fallback estimate'
  className: string
}
type UndoEntry = {
  key: AppliedKey
  label: string
  undo: () => void
}

type RevertSnapshot = {
  summary?: string
  researchCategory?: string
  researchType?: string
  interpretationMode?: string
  articleType?: string
  wordLength?: string
}

const IGNORED_SUGGESTIONS_SESSION_KEY = 'aawe-step1-ignored-suggestions'
const SUGGESTION_KEYS: AppliedKey[] = ['summary', 'researchCategory', 'researchType', 'interpretationMode', 'journal']

function buildEmptySuggestionState(): Record<AppliedKey, boolean> {
  return {
    summary: false,
    researchCategory: false,
    researchType: false,
    interpretationMode: false,
    journal: false,
  }
}

function buildSuggestionContextKey(input: {
  summary: string
  researchCategory: string
  researchType: string
  interpretationMode: string
  targetJournal: string
  articleType: string
  wordLength: string
}): string {
  return `${input.summary.trim().toLowerCase()}::${input.researchCategory.trim().toLowerCase()}::${input.researchType
    .trim()
    .toLowerCase()}::${input.interpretationMode.trim().toLowerCase()}::${input.targetJournal
    .trim()
    .toLowerCase()}::${input.articleType.trim().toLowerCase()}::${input.wordLength.trim().toLowerCase()}`
}

function serialiseIgnoredState(state: Record<AppliedKey, boolean>): AppliedKey[] {
  return SUGGESTION_KEYS.filter((key) => state[key])
}

function deserialiseIgnoredState(keys: unknown): Record<AppliedKey, boolean> {
  const state = buildEmptySuggestionState()
  if (!Array.isArray(keys)) {
    return state
  }
  for (const key of keys) {
    if (typeof key === 'string' && SUGGESTION_KEYS.includes(key as AppliedKey)) {
      state[key as AppliedKey] = true
    }
  }
  return state
}

function readIgnoredStateForKey(storageKey: string): Record<AppliedKey, boolean> {
  if (typeof window === 'undefined') {
    return buildEmptySuggestionState()
  }
  try {
    const raw = window.sessionStorage.getItem(IGNORED_SUGGESTIONS_SESSION_KEY)
    if (!raw) {
      return buildEmptySuggestionState()
    }
    const parsed = JSON.parse(raw) as Record<string, unknown>
    return deserialiseIgnoredState(parsed[storageKey])
  } catch {
    return buildEmptySuggestionState()
  }
}

function persistIgnoredStateForKey(storageKey: string, state: Record<AppliedKey, boolean>) {
  if (typeof window === 'undefined') {
    return
  }
  try {
    const raw = window.sessionStorage.getItem(IGNORED_SUGGESTIONS_SESSION_KEY)
    const parsed: Record<string, unknown> = raw ? (JSON.parse(raw) as Record<string, unknown>) : {}
    const serialised = serialiseIgnoredState(state)
    if (serialised.length === 0) {
      delete parsed[storageKey]
    } else {
      parsed[storageKey] = serialised
    }
    window.sessionStorage.setItem(IGNORED_SUGGESTIONS_SESSION_KEY, JSON.stringify(parsed))
  } catch {
    // no-op
  }
}

function diffHighlightTokens(currentText: string, suggestedText: string): Array<{ value: string; changed: boolean }> {
  const normalise = (value: string) => value.toLowerCase().replace(/[^a-z0-9]+/g, '')
  const currentSet = new Set(
    currentText
      .split(/\s+/)
      .map((token) => normalise(token))
      .filter(Boolean),
  )
  return suggestedText.split(/(\s+)/).map((token) => {
    if (/^\s+$/.test(token)) {
      return { value: token, changed: false }
    }
    const clean = normalise(token)
    if (!clean) {
      return { value: token, changed: false }
    }
    return { value: token, changed: !currentSet.has(clean) }
  })
}

function inferOfflineArticleType(summary: string, currentValue: string): string {
  const current = currentValue.trim()
  if (current) {
    return current
  }
  const lowerSummary = summary.toLowerCase()
  if (
    lowerSummary.includes('literature review') ||
    lowerSummary.includes('narrative review') ||
    lowerSummary.includes('scoping review') ||
    lowerSummary.includes('review article')
  ) {
    return 'Review Article'
  }
  if (lowerSummary.includes('case series')) {
    return 'Case Series'
  }
  if (lowerSummary.includes('letter')) {
    return 'Letter'
  }
  return 'Original Research Article'
}

function inferOfflineWordLength(articleType: string, currentValue: string): string {
  const current = currentValue.trim()
  if (current) {
    return current
  }
  const lowered = articleType.toLowerCase()
  if (lowered.includes('letter')) {
    return '600-1,000 words'
  }
  if (lowered.includes('brief') || lowered.includes('short') || lowered.includes('rapid')) {
    return '1,500-2,500 words'
  }
  if (lowered.includes('case series') || lowered.includes('case report')) {
    return '1,500-3,000 words'
  }
  if (lowered.includes('review')) {
    return '4,500-6,500 words'
  }
  return '3,000-4,500 words'
}

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
  const offlineArticleType = inferOfflineArticleType(normalizedSummary, input.articleType)
  const offlineWordLength = inferOfflineWordLength(offlineArticleType, input.wordLength)

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
      rationale: 'Offline best-fit recommendation; verify at submission.',
    },
    word_length_recommendation: {
      value: offlineWordLength,
      rationale: 'Offline best-fit range; verify at submission.',
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
  const [appliedState, setAppliedState] = useState<Record<AppliedKey, boolean>>(buildEmptySuggestionState)
  const [ignoredState, setIgnoredState] = useState<Record<AppliedKey, boolean>>(buildEmptySuggestionState)
  const [showSummaryDiff, setShowSummaryDiff] = useState(false)
  const [undoStack, setUndoStack] = useState<UndoEntry[]>([])
  const [revertSnapshots, setRevertSnapshots] = useState<Partial<Record<AppliedKey, RevertSnapshot>>>({})
  const [appliedSectionOpen, setAppliedSectionOpen] = useState(false)
  const [ignoredSectionOpen, setIgnoredSectionOpen] = useState(false)
  const applyTimersRef = useRef<number[]>([])
  const lastAutoRefreshJournalRef = useRef('')

  useEffect(() => {
    return () => {
      applyTimersRef.current.forEach((timerId) => window.clearTimeout(timerId))
      applyTimersRef.current = []
    }
  }, [])

  const currentKey = useMemo(
    () =>
      buildSuggestionContextKey({
        summary,
        researchCategory,
        researchType,
        interpretationMode,
        targetJournal,
        articleType: currentArticleType,
        wordLength: currentWordLength,
      }),
    [currentArticleType, currentWordLength, interpretationMode, researchCategory, researchType, summary, targetJournal],
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
  const journalProvenance: SuggestionProvenance | null = useMemo(() => {
    if (!suggestions && !requestError) {
      return null
    }
    const isLive = Boolean(suggestions?.source_urls?.length) && !(suggestions?.model_used || '').includes('offline')
    if (isLive) {
      return {
        label: 'Live journal guidance',
        className: 'border-emerald-300 bg-emerald-100 text-emerald-900',
      }
    }
    return {
      label: 'Fallback estimate',
      className: 'border-amber-300 bg-amber-100 text-amber-900',
    }
  }, [requestError, suggestions])

  const pendingKeys = useMemo(() => {
    if (isStale) {
      return []
    }
    const keys: SuggestionKey[] = []
    if (summarySuggestion && !isSummaryApplied && !ignoredState.summary) {
      keys.push('summary')
    }
    if (researchCategorySuggestion && !isResearchCategoryApplied && !ignoredState.researchCategory) {
      keys.push('researchCategory')
    }
    if (researchTypeSuggestion && !isResearchTypeApplied && !ignoredState.researchType) {
      keys.push('researchType')
    }
    if (interpretationSuggestion && !isInterpretationModeApplied && !ignoredState.interpretationMode) {
      keys.push('interpretationMode')
    }
    if (shouldShowJournalApplyButton && !ignoredState.journal) {
      keys.push('journal')
    }
    return keys
  }, [
    ignoredState.interpretationMode,
    ignoredState.journal,
    ignoredState.researchCategory,
    ignoredState.researchType,
    ignoredState.summary,
    interpretationSuggestion,
    isInterpretationModeApplied,
    isResearchCategoryApplied,
    isResearchTypeApplied,
    researchCategorySuggestion,
    researchTypeSuggestion,
    shouldShowJournalApplyButton,
    summarySuggestion,
    isSummaryApplied,
    isStale,
  ])

  const ignoredKeys = useMemo(() => {
    const keys: SuggestionKey[] = []
    if (ignoredState.summary && summarySuggestion && !isSummaryApplied) {
      keys.push('summary')
    }
    if (ignoredState.researchCategory && researchCategorySuggestion && !isResearchCategoryApplied) {
      keys.push('researchCategory')
    }
    if (ignoredState.researchType && researchTypeSuggestion && !isResearchTypeApplied) {
      keys.push('researchType')
    }
    if (ignoredState.interpretationMode && interpretationSuggestion && !isInterpretationModeApplied) {
      keys.push('interpretationMode')
    }
    if (ignoredState.journal && shouldShowJournalApplyButton) {
      keys.push('journal')
    }
    return keys
  }, [
    ignoredState.interpretationMode,
    ignoredState.journal,
    ignoredState.researchCategory,
    ignoredState.researchType,
    ignoredState.summary,
    interpretationSuggestion,
    isInterpretationModeApplied,
    isResearchCategoryApplied,
    isResearchTypeApplied,
    isSummaryApplied,
    researchCategorySuggestion,
    researchTypeSuggestion,
    shouldShowJournalApplyButton,
    summarySuggestion,
  ])
  const ignoredCount = ignoredKeys.length

  useEffect(() => {
    setIgnoredState(readIgnoredStateForKey(currentKey))
    setAppliedState(buildEmptySuggestionState())
    setShowSummaryDiff(false)
  }, [currentKey])

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

  const latestUndoByKey = useMemo(() => {
    const map: Partial<Record<AppliedKey, UndoEntry>> = {}
    for (let index = undoStack.length - 1; index >= 0; index -= 1) {
      const entry = undoStack[index]
      if (!map[entry.key]) {
        map[entry.key] = entry
      }
      if (Object.keys(map).length === SUGGESTION_KEYS.length) {
        break
      }
    }
    return map
  }, [undoStack])

  useEffect(() => {
    setAppliedSectionOpen(false)
  }, [appliedKeys.length])

  useEffect(() => {
    setIgnoredSectionOpen(false)
  }, [ignoredKeys.length])

  const applyJournalRecommendationValues = (
    articleValue?: string | null,
    wordLengthValue?: string | null,
    options?: { recordUndo?: boolean },
  ): boolean => {
    const nextArticleValue = articleValue?.trim() ?? ''
    const nextWordLengthValue = wordLengthValue?.trim() ?? ''
    const previousArticleType = currentArticleType
    const previousWordLength = currentWordLength
    const articleChanged = Boolean(nextArticleValue && normalize(nextArticleValue) !== normalize(previousArticleType))
    const wordLengthChanged = Boolean(nextWordLengthValue && normalize(nextWordLengthValue) !== normalize(previousWordLength))
    if (!articleChanged && !wordLengthChanged) {
      return false
    }
    if (nextArticleValue) {
      onApplyArticleType(nextArticleValue)
    }
    if (nextWordLengthValue) {
      onApplyWordLength(nextWordLengthValue)
    }
    setRevertSnapshots((current) => ({
      ...current,
      journal: { articleType: previousArticleType, wordLength: previousWordLength },
    }))
    if (options?.recordUndo ?? true) {
      pushUndoEntry({
        key: 'journal',
        label: 'Journal recommendation apply',
        undo: () => {
          onApplyArticleType(previousArticleType)
          onApplyWordLength(previousWordLength)
        },
      })
    }
    markApplied('journal')
    return true
  }

  const generateSuggestions = async (options?: { resetHistory?: boolean; autoApplyJournal?: boolean }) => {
    const resetHistory = options?.resetHistory ?? true
    const autoApplyJournal = options?.autoApplyJournal ?? false
    if (!summary.trim()) {
      return
    }
    const trimmedJournal = targetJournal.trim()
    if (trimmedJournal) {
      // Prevent journal auto-refresh from re-firing after manual/apply-driven updates.
      lastAutoRefreshJournalRef.current = trimmedJournal
    }
    if (resetHistory) {
      setUndoStack([])
      setRevertSnapshots({})
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
      let nextGeneratedKey = currentKey
      if (autoApplyJournal) {
        const nextArticleType = response.article_type_recommendation?.value?.trim() || currentArticleType
        const nextWordLength = response.word_length_recommendation?.value?.trim() || currentWordLength
        applyJournalRecommendationValues(response.article_type_recommendation?.value, response.word_length_recommendation?.value, {
          recordUndo: false,
        })
        nextGeneratedKey = buildSuggestionContextKey({
          summary,
          researchCategory,
          researchType,
          interpretationMode,
          targetJournal,
          articleType: nextArticleType,
          wordLength: nextWordLength,
        })
      }
      setGeneratedKey(nextGeneratedKey)
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
      let nextGeneratedKey = currentKey
      if (autoApplyJournal) {
        const nextArticleType = fallback.article_type_recommendation?.value?.trim() || currentArticleType
        const nextWordLength = fallback.word_length_recommendation?.value?.trim() || currentWordLength
        applyJournalRecommendationValues(fallback.article_type_recommendation?.value, fallback.word_length_recommendation?.value, {
          recordUndo: false,
        })
        nextGeneratedKey = buildSuggestionContextKey({
          summary,
          researchCategory,
          researchType,
          interpretationMode,
          targetJournal,
          articleType: nextArticleType,
          wordLength: nextWordLength,
        })
      }
      setGeneratedKey(nextGeneratedKey)
      const message = error instanceof Error ? error.message : 'Could not generate suggestions.'
      setRequestError(`${message} Showing provisional offline suggestions. Endpoint: ${API_BASE_URL}`)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    const trimmedJournal = targetJournal.trim()
    if (!trimmedJournal) {
      lastAutoRefreshJournalRef.current = ''
      return
    }
    if (!summary.trim() || loading) {
      return
    }
    if (lastAutoRefreshJournalRef.current === trimmedJournal) {
      return
    }
    lastAutoRefreshJournalRef.current = trimmedJournal
    void generateSuggestions({ resetHistory: false, autoApplyJournal: true })
  }, [loading, summary, targetJournal])

  const refreshSuggestions = async () => {
    setRefinementsEnabled(true)
    setAppliedState(buildEmptySuggestionState())
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
    setIgnoredState((current) => {
      const next = { ...current, [key]: false }
      persistIgnoredStateForKey(currentKey, next)
      return next
    })
    setAppliedState((current) => ({ ...current, [key]: true }))
    const timerId = window.setTimeout(() => {
      setAppliedState((current) => ({ ...current, [key]: false }))
    }, 850)
    applyTimersRef.current.push(timerId)
  }

  const pushUndoEntry = (entry: UndoEntry) => {
    setUndoStack((current) => [...current, entry].slice(-20))
  }

  const onRevertApplied = (key: AppliedKey) => {
    if (loading) {
      return
    }
    const snapshot = revertSnapshots[key]
    if (snapshot) {
      if (snapshot.summary !== undefined) {
        onReplaceSummary(snapshot.summary)
      }
      if (snapshot.researchCategory !== undefined) {
        onApplyResearchCategory(snapshot.researchCategory)
      }
      if (snapshot.researchType !== undefined) {
        onApplyResearchType(snapshot.researchType)
      }
      if (snapshot.interpretationMode !== undefined) {
        onApplyInterpretationMode(snapshot.interpretationMode)
      }
      if (snapshot.articleType !== undefined) {
        onApplyArticleType(snapshot.articleType)
      }
      if (snapshot.wordLength !== undefined) {
        onApplyWordLength(snapshot.wordLength)
      }
      setRevertSnapshots((current) => {
        const next = { ...current }
        delete next[key]
        return next
      })
      setUndoStack((current) => {
        for (let index = current.length - 1; index >= 0; index -= 1) {
          if (current[index].key === key) {
            return [...current.slice(0, index), ...current.slice(index + 1)]
          }
        }
        return current
      })
      return
    }
    const selected = latestUndoByKey[key]
    if (!selected) {
      return
    }
    setUndoStack((current) => {
      for (let index = current.length - 1; index >= 0; index -= 1) {
        if (current[index] === selected) {
          return [...current.slice(0, index), ...current.slice(index + 1)]
        }
      }
      return current
    })
    selected.undo()
  }

  const onApplySummary = (option: string) => {
    const previousSummary = summary
    if (normalize(previousSummary) === normalize(option)) {
      return
    }
    setGeneratedKey(
      buildSuggestionContextKey({
        summary: option,
        researchCategory,
        researchType,
        interpretationMode,
        targetJournal,
        articleType: currentArticleType,
        wordLength: currentWordLength,
      }),
    )
    setRevertSnapshots((current) => ({ ...current, summary: { summary: previousSummary } }))
    pushUndoEntry({
      key: 'summary',
      label: 'Summary rewrite',
      undo: () => onReplaceSummary(previousSummary),
    })
    onReplaceSummary(option)
    markApplied('summary')
  }

  const onApplyResearchTypeSuggestion = () => {
    const recommendation = suggestions?.research_type_suggestion
    if (!recommendation) {
      return
    }
    const previousResearchType = researchType
    const previousResearchCategory = researchCategory
    const previousInterpretationMode = interpretationMode
    if (normalize(previousResearchType) === normalize(recommendation.value)) {
      return
    }
    setRevertSnapshots((current) => ({
      ...current,
      researchType: {
        researchCategory: previousResearchCategory,
        researchType: previousResearchType,
        interpretationMode: previousInterpretationMode,
      },
    }))
    pushUndoEntry({
      key: 'researchType',
      label: 'Research type update',
      undo: () => {
        onApplyResearchCategory(previousResearchCategory)
        onApplyResearchType(previousResearchType)
        onApplyInterpretationMode(previousInterpretationMode)
      },
    })
    onApplyResearchType(recommendation.value)
    markApplied('researchType')
  }

  const onApplyResearchCategorySuggestion = () => {
    const recommendation = suggestions?.research_category_suggestion
    if (!recommendation) {
      return
    }
    const previousResearchCategory = researchCategory
    const previousResearchType = researchType
    const previousInterpretationMode = interpretationMode
    if (normalize(previousResearchCategory) === normalize(recommendation.value)) {
      return
    }
    setRevertSnapshots((current) => ({
      ...current,
      researchCategory: {
        researchCategory: previousResearchCategory,
        researchType: previousResearchType,
        interpretationMode: previousInterpretationMode,
      },
    }))
    pushUndoEntry({
      key: 'researchCategory',
      label: 'Research category update',
      undo: () => {
        onApplyResearchCategory(previousResearchCategory)
        onApplyResearchType(previousResearchType)
        onApplyInterpretationMode(previousInterpretationMode)
      },
    })
    onApplyResearchCategory(recommendation.value)
    markApplied('researchCategory')
  }

  const onApplyInterpretationModeSuggestion = () => {
    const recommendation = suggestions?.interpretation_mode_recommendation
    if (!recommendation) {
      return
    }
    const previousInterpretationMode = interpretationMode
    if (normalize(previousInterpretationMode) === normalize(recommendation.value)) {
      return
    }
    setRevertSnapshots((current) => ({
      ...current,
      interpretationMode: { interpretationMode: previousInterpretationMode },
    }))
    pushUndoEntry({
      key: 'interpretationMode',
      label: 'Interpretation mode update',
      undo: () => onApplyInterpretationMode(previousInterpretationMode),
    })
    onApplyInterpretationMode(recommendation.value)
    markApplied('interpretationMode')
  }

  const onApplyJournalRecommendation = () => {
    applyJournalRecommendationValues(articleSuggestion?.value, wordLengthSuggestion?.value, { recordUndo: true })
  }

  const onIgnoreSuggestion = (key: AppliedKey) => {
    setIgnoredState((current) => {
      const next = { ...current, [key]: true }
      persistIgnoredStateForKey(currentKey, next)
      return next
    })
  }

  const onRestoreIgnoredSuggestion = (key: AppliedKey) => {
    setIgnoredState((current) => {
      const next = { ...current, [key]: false }
      persistIgnoredStateForKey(currentKey, next)
      return next
    })
  }

  const onRestoreIgnoredSuggestions = () => {
    const next = buildEmptySuggestionState()
    setIgnoredState(next)
    persistIgnoredStateForKey(currentKey, next)
  }

  const onApplyAllPending = () => {
    if (loading || pendingKeys.length === 0) {
      return
    }
    if (pendingKeys.includes('summary') && summarySuggestion) {
      onApplySummary(summarySuggestion)
    }
    if (pendingKeys.includes('researchType')) {
      onApplyResearchTypeSuggestion()
    } else if (pendingKeys.includes('researchCategory')) {
      onApplyResearchCategorySuggestion()
    }
    if (pendingKeys.includes('interpretationMode')) {
      onApplyInterpretationModeSuggestion()
    }
    if (pendingKeys.includes('journal')) {
      onApplyJournalRecommendation()
    }
  }

  const applyDisabled = loading
  const pendingToRender = pendingKeys.slice(0, 3)
  const hiddenPendingCount = Math.max(0, pendingKeys.length - pendingToRender.length)
  const primaryAction = useMemo(() => {
    if (!summary.trim()) {
      return null
    }
    if (!refinementsEnabled) {
      return {
        label: 'Show suggestions',
        onClick: () => void onToggleRefinements(),
        disabled: loading,
      }
    }
    if (pendingKeys.length > 0) {
      return {
        label: 'Apply all',
        onClick: onApplyAllPending,
        disabled: loading,
      }
    }
    return null
  }, [
    loading,
    onApplyAllPending,
    pendingKeys.length,
    refinementsEnabled,
    summary,
  ])

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
          <div className="space-y-2">
            <p className="text-xs text-emerald-900">{isStale ? 'Inputs changed. Refresh before applying.' : 'Direct rewrite only; no new claims added.'}</p>
            <div className="flex flex-wrap items-center gap-2 sm:justify-end">
              <Button
                size="sm"
                variant="outline"
                className={IGNORE_BUTTON_CLASS}
                onClick={() => setShowSummaryDiff((current) => !current)}
                disabled={loading}
              >
                {showSummaryDiff ? 'Hide preview' : 'Preview changes'}
              </Button>
              <Button
                size="sm"
                variant="outline"
                className={IGNORE_BUTTON_CLASS}
                onClick={() => onIgnoreSuggestion('summary')}
                disabled={loading}
              >
                Ignore
              </Button>
              <Button
                size="sm"
                variant="outline"
                className={OUTLINE_ACTION_BUTTON_CLASS}
                onClick={() => onApplySummary(summarySuggestion)}
                disabled={applyDisabled}
              >
                Replace summary
              </Button>
            </div>
          </div>
          {showSummaryDiff ? (
            <div className="space-y-2 rounded border border-emerald-300 bg-white p-2">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-wide text-emerald-900">Current</p>
                <p className="text-xs text-emerald-950">{summary}</p>
              </div>
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-wide text-emerald-900">Suggested</p>
                <p className="text-xs text-emerald-950">
                  {diffHighlightTokens(summary, summarySuggestion).map((token, index) => (
                    <span
                      key={`summary-diff-${index}`}
                      className={token.changed ? 'rounded bg-emerald-200 px-0.5' : ''}
                    >
                      {token.value}
                    </span>
                  ))}
                </p>
              </div>
            </div>
          ) : null}
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
          <div className="flex flex-wrap items-center gap-2 sm:justify-end">
            <Button
              size="sm"
              variant="outline"
              className={IGNORE_BUTTON_CLASS}
              onClick={() => onIgnoreSuggestion('researchCategory')}
              disabled={loading}
            >
              Ignore
            </Button>
            <Button
              size="sm"
              variant="outline"
              className={OUTLINE_ACTION_BUTTON_CLASS}
              onClick={onApplyResearchCategorySuggestion}
              disabled={applyDisabled}
            >
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
          <div className="flex flex-wrap items-center gap-2 sm:justify-end">
            <Button
              size="sm"
              variant="outline"
              className={IGNORE_BUTTON_CLASS}
              onClick={() => onIgnoreSuggestion('researchType')}
              disabled={loading}
            >
              Ignore
            </Button>
            <Button
              size="sm"
              variant="outline"
              className={OUTLINE_ACTION_BUTTON_CLASS}
              onClick={onApplyResearchTypeSuggestion}
              disabled={applyDisabled}
            >
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
          <div className="flex flex-wrap items-center gap-2 sm:justify-end">
            <Button
              size="sm"
              variant="outline"
              className={IGNORE_BUTTON_CLASS}
              onClick={() => onIgnoreSuggestion('interpretationMode')}
              disabled={loading}
            >
              Ignore
            </Button>
            <Button
              size="sm"
              variant="outline"
              className={OUTLINE_ACTION_BUTTON_CLASS}
              onClick={onApplyInterpretationModeSuggestion}
              disabled={applyDisabled}
            >
              Apply interpretation mode
            </Button>
          </div>
        </div>
      )
    }

    if (key === 'journal') {
      return (
        <div key="pending-journal" className={suggestionCardPulseClass('journal', JOURNAL_CARD_CLASS)}>
          <div className="flex items-center justify-between gap-2">
            <p className="text-sm font-semibold text-amber-900">Journal recommendation</p>
            {journalProvenance ? (
              <span className={`rounded border px-1.5 py-0.5 text-[11px] font-medium ${journalProvenance.className}`}>
                {journalProvenance.label}
              </span>
            ) : null}
          </div>
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
          <div className="flex flex-wrap items-center gap-2 sm:justify-end">
            <Button
              size="sm"
              variant="outline"
              className={IGNORE_BUTTON_CLASS}
              onClick={() => onIgnoreSuggestion('journal')}
              disabled={loading}
            >
              Ignore
            </Button>
            <Button
              size="sm"
              variant="outline"
              className={OUTLINE_ACTION_BUTTON_CLASS}
              onClick={onApplyJournalRecommendation}
              disabled={applyDisabled}
            >
              Apply journal recommendation
            </Button>
          </div>
        </div>
      )
    }

    return null
  }

  const renderAppliedCard = (key: SuggestionKey) => {
    const hasRevert = Boolean(revertSnapshots[key] || latestUndoByKey[key])
    const revertControl = hasRevert ? (
      <Button
        size="sm"
        variant="outline"
        className={IGNORE_BUTTON_CLASS}
        onClick={() => onRevertApplied(key)}
        disabled={loading}
      >
        Revert
      </Button>
    ) : null

    if (key === 'summary') {
      return (
        <div key="applied-summary" className={APPLIED_SUMMARY_CARD_CLASS}>
          <p className="text-sm font-medium text-slate-900">Summary refinement</p>
          <p className="text-xs text-slate-700">Current summary matches the suggested rewrite.</p>
          {revertControl}
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
          {revertControl}
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
          {revertControl}
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
          {revertControl}
        </div>
      )
    }
    if (key === 'journal') {
      return (
        <div key="applied-journal" className={APPLIED_JOURNAL_CARD_CLASS}>
          <div className="flex items-center justify-between gap-2">
            <p className="text-sm font-medium text-slate-900">Journal recommendation</p>
            {journalProvenance ? (
              <span className={`rounded border px-1.5 py-0.5 text-[11px] font-medium ${journalProvenance.className}`}>
                {journalProvenance.label}
              </span>
            ) : null}
          </div>
          {articleSuggestion ? <p className="text-xs text-slate-700">Article type set: {articleSuggestion.value}</p> : null}
          {wordLengthSuggestion ? <p className="text-xs text-slate-700">Word length set: {wordLengthSuggestion.value}</p> : null}
          <p className="text-xs text-slate-700">Values are aligned with current recommendations.</p>
          {revertControl}
        </div>
      )
    }
    return null
  }

  const renderIgnoredCard = (key: SuggestionKey) => {
    const restoreControl = (
      <Button
        size="sm"
        variant="outline"
        className={IGNORE_BUTTON_CLASS}
        onClick={() => onRestoreIgnoredSuggestion(key)}
        disabled={loading}
      >
        Restore
      </Button>
    )

    if (key === 'summary' && summarySuggestion) {
      return (
        <div key="ignored-summary" className={SUMMARY_CARD_CLASS}>
          <p className="text-sm font-semibold text-emerald-900">Summary of research refinement</p>
          <p className="text-xs text-emerald-900">Ignored for now.</p>
          <div className="rounded border border-emerald-300 bg-white p-2">
            <p className="text-xs text-emerald-950">{summarySuggestion}</p>
          </div>
          <div className="flex justify-end">{restoreControl}</div>
        </div>
      )
    }

    if (key === 'researchCategory' && researchCategorySuggestion) {
      return (
        <div key="ignored-category" className={RESEARCH_CATEGORY_CARD_CLASS}>
          <p className="text-sm font-semibold text-violet-900">Research category suggestion</p>
          <p className="text-xs text-violet-900">
            Recommended category: <span className="font-semibold">{researchCategorySuggestion.value}</span>
          </p>
          <p className="text-xs text-violet-900">{researchCategorySuggestion.rationale}</p>
          <div className="flex justify-end">{restoreControl}</div>
        </div>
      )
    }

    if (key === 'researchType' && researchTypeSuggestion) {
      return (
        <div key="ignored-type" className={RESEARCH_TYPE_CARD_CLASS}>
          <p className="text-sm font-semibold text-sky-900">Research type suggestion</p>
          <p className="text-xs text-sky-900">
            Recommended type: <span className="font-semibold">{researchTypeSuggestion.value}</span>
          </p>
          <p className="text-xs text-sky-900">{researchTypeSuggestion.rationale}</p>
          <div className="flex justify-end">{restoreControl}</div>
        </div>
      )
    }

    if (key === 'interpretationMode' && interpretationSuggestion) {
      return (
        <div key="ignored-interpretation" className={INTERPRETATION_CARD_CLASS}>
          <p className="text-sm font-semibold text-cyan-900">Interpretation mode suggestion</p>
          <p className="text-xs text-cyan-900">
            Recommended mode: <span className="font-semibold">{interpretationSuggestion.value}</span>
          </p>
          <p className="text-xs text-cyan-900">{interpretationSuggestion.rationale}</p>
          <div className="flex justify-end">{restoreControl}</div>
        </div>
      )
    }

    if (key === 'journal') {
      return (
        <div key="ignored-journal" className={JOURNAL_CARD_CLASS}>
          <div className="flex items-center justify-between gap-2">
            <p className="text-sm font-semibold text-amber-900">Journal recommendation</p>
            {journalProvenance ? (
              <span className={`rounded border px-1.5 py-0.5 text-[11px] font-medium ${journalProvenance.className}`}>
                {journalProvenance.label}
              </span>
            ) : null}
          </div>
          {articleSuggestion ? (
            <p className="text-xs text-amber-900">
              Article type: <span className="font-semibold">{articleSuggestion.value}</span>
            </p>
          ) : null}
          {wordLengthSuggestion ? (
            <p className="text-xs text-amber-900">
              Recommended word length: <span className="font-semibold">{wordLengthSuggestion.value}</span>
            </p>
          ) : null}
          <div className="flex justify-end">{restoreControl}</div>
        </div>
      )
    }

    return null
  }

  return (
    <aside className="space-y-3 rounded-lg border border-border bg-card p-3">
      <h3 className="text-sm font-semibold">Research overview suggestions</h3>

      <div className="space-y-2 rounded-md border border-slate-300 bg-slate-100 p-3">
        <p className="text-sm font-medium">Suggestion controls</p>
        <div className="flex flex-wrap items-center gap-2">
          {primaryAction ? (
            <Button className={ACTION_BUTTON_CLASS} size="sm" onClick={primaryAction.onClick} disabled={primaryAction.disabled}>
              {primaryAction.label}
            </Button>
          ) : null}
          {refinementsEnabled ? (
            <Button
              size="sm"
              variant="outline"
              className={OUTLINE_ACTION_BUTTON_CLASS}
              onClick={() => void onToggleRefinements()}
              disabled={loading}
            >
              Hide suggestions
            </Button>
          ) : null}
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
          {hasGenerated && pendingToRender.length === 0 && !loading && !isStale ? (
            <p className="rounded-md border border-emerald-200 bg-emerald-50 px-2 py-2 text-xs text-emerald-900">
              No pending actions. Current selections align with suggestions.
            </p>
          ) : null}
          {hasGenerated && isStale && !loading ? (
            <p className="rounded-md border border-amber-200 bg-amber-50 px-2 py-2 text-xs text-amber-900">
              Suggestions are out of date after recent edits. Refresh suggestions to continue.
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
        <details
          className="rounded-md border border-border/80 bg-muted/15 p-3"
          open={ignoredSectionOpen && ignoredCount > 0}
          onToggle={(event) => setIgnoredSectionOpen((event.currentTarget as HTMLDetailsElement).open)}
        >
          <summary className="cursor-pointer text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Ignored suggestions ({ignoredCount})
          </summary>
          <div className="mt-3 space-y-2">
            {ignoredCount === 0 ? <p className="text-xs text-muted-foreground">No ignored suggestions.</p> : null}
            {ignoredKeys.map((key) => renderIgnoredCard(key))}
            {ignoredCount > 1 ? (
              <div className="flex justify-end pt-1">
                <Button
                  size="sm"
                  variant="outline"
                  className={IGNORE_BUTTON_CLASS}
                  onClick={onRestoreIgnoredSuggestions}
                  disabled={loading}
                >
                  Restore all ignored
                </Button>
              </div>
            ) : null}
          </div>
        </details>
      ) : null}

      {refinementsEnabled ? (
        <details
          className="rounded-md border border-border/80 bg-muted/15 p-3"
          open={appliedSectionOpen && appliedKeys.length > 0}
          onToggle={(event) => setAppliedSectionOpen((event.currentTarget as HTMLDetailsElement).open)}
        >
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
