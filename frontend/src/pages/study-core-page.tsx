import { useCallback, useEffect, useMemo, useState } from 'react'

import { Step1Panel } from '@/components/study-core/Step1Panel'
import { Step2Panel } from '@/components/study-core/Step2Panel'
import { StepContext, type ContextFormValues } from '@/components/study-core/StepContext'
import { StepDraftReview } from '@/components/study-core/StepDraftReview'
import { StepLinkQcExport } from '@/components/study-core/StepLinkQcExport'
import { StepPlan } from '@/components/study-core/StepPlan'
import { StepRun } from '@/components/study-core/StepRun'
import { StudyCoreStepper, type WizardStepItem } from '@/components/study-core/StudyCoreStepper'
import { Input } from '@/components/ui/input'
import { analyzePlan } from '@/lib/analyze-plan'
import {
  CURATED_CARDIOLOGY_IMAGING_JOURNALS,
  getCategoryForStudyType,
  getResearchTypeTaxonomy,
  getStudyTypesForCategory,
  getStudyTypeDefaults,
  mergeJournalOptions,
} from '@/lib/research-frame-options'
import { fetchJournalOptions } from '@/lib/study-core-api'
import { useStudyCoreWizardStore, type WizardStep } from '@/store/use-study-core-wizard-store'
import type {
  ClaimLinkSuggestion,
  GenerationEstimate,
  GenerationJobPayload,
  JournalOption,
  OutlinePlanState,
  Step2ClarificationResponse,
} from '@/types/study-core'

type RunContext = { projectId: string; manuscriptId: string }
type RunRecommendations = {
  conservativeWithLimitations: boolean
  uncertaintyInResults: boolean
  mechanisticAsHypothesis: boolean
}

const CONTEXT_KEY = 'aawe-run-context'
const RESEARCH_FRAME_SIGNATURE_KEY = 'aawe-research-frame-signature'
const CORE_SECTIONS = ['introduction', 'methods', 'results', 'discussion', 'conclusion']
const RESEARCH_TAXONOMY = getResearchTypeTaxonomy(true)
const KNOWN_STUDY_TYPES = RESEARCH_TAXONOMY.flatMap((item) => [...item.studyTypes])
const KNOWN_RESEARCH_CATEGORIES = RESEARCH_TAXONOMY.map((item) => item.category)

function normalizeSelectionLabel(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
}

function resolveSuggestedStudyType(rawSuggestion: string): { studyType: string; category: string | null } {
  const suggestion = normalizeSelectionLabel(rawSuggestion)
  if (!suggestion) {
    return { studyType: '', category: null }
  }
  const exact = KNOWN_STUDY_TYPES.find((candidate) => normalizeSelectionLabel(candidate) === suggestion)
  if (exact) {
    return { studyType: exact, category: getCategoryForStudyType(exact, true) }
  }

  const contained = KNOWN_STUDY_TYPES.find((candidate) => {
    const normalizedCandidate = normalizeSelectionLabel(candidate)
    return normalizedCandidate.includes(suggestion) || suggestion.includes(normalizedCandidate)
  })
  if (contained) {
    return { studyType: contained, category: getCategoryForStudyType(contained, true) }
  }

  const keywordFallbacks: Array<{ trigger: string[]; studyType: string }> = [
    { trigger: ['literature', 'review'], studyType: 'Narrative literature synthesis study' },
    { trigger: ['narrative', 'synthesis'], studyType: 'Narrative literature synthesis study' },
    { trigger: ['scoping', 'review'], studyType: 'Scoping evidence synthesis study' },
    { trigger: ['diagnostic', 'accuracy'], studyType: 'Diagnostic accuracy imaging study' },
    { trigger: ['retrospective', 'single'], studyType: 'Retrospective single-centre cohort' },
    { trigger: ['retrospective', 'multi'], studyType: 'Retrospective multi-centre cohort' },
    { trigger: ['prospective', 'cohort'], studyType: 'Prospective observational cohort' },
    { trigger: ['case', 'series'], studyType: 'Case series' },
    { trigger: ['haemodynamic', 'integration'], studyType: 'Imaging-haemodynamic integration study' },
    { trigger: ['hemodynamic', 'integration'], studyType: 'Imaging-haemodynamic integration study' },
  ]
  for (const fallback of keywordFallbacks) {
    if (!fallback.trigger.every((token) => suggestion.includes(token))) {
      continue
    }
    if (!KNOWN_STUDY_TYPES.includes(fallback.studyType)) {
      continue
    }
    return { studyType: fallback.studyType, category: getCategoryForStudyType(fallback.studyType, true) }
  }

  const matchingCategory = KNOWN_RESEARCH_CATEGORIES.find((category) => {
    const normalisedCategory = normalizeSelectionLabel(category)
    return suggestion.includes(normalisedCategory) || normalisedCategory.includes(suggestion)
  })
  if (matchingCategory) {
    const firstStudyType = getStudyTypesForCategory(matchingCategory, true)[0] ?? ''
    return { studyType: firstStudyType, category: matchingCategory }
  }

  const targetTokens = new Set(suggestion.split(' ').filter(Boolean))
  let bestCandidate = ''
  let bestScore = 0
  for (const candidate of KNOWN_STUDY_TYPES) {
    const candidateTokens = new Set(normalizeSelectionLabel(candidate).split(' ').filter(Boolean))
    if (candidateTokens.size === 0) {
      continue
    }
    let overlap = 0
    for (const token of targetTokens) {
      if (candidateTokens.has(token)) {
        overlap += 1
      }
    }
    const recall = overlap / Math.max(1, targetTokens.size)
    const precision = overlap / Math.max(1, candidateTokens.size)
    const score = (recall + precision) / 2
    if (score > bestScore) {
      bestScore = score
      bestCandidate = candidate
    }
  }
  if (bestCandidate && bestScore >= 0.5) {
    return { studyType: bestCandidate, category: getCategoryForStudyType(bestCandidate, true) }
  }
  return { studyType: '', category: null }
}

function buildGenerationBrief(values: ContextFormValues, sections: string[], guardrailsEnabled: boolean): string {
  const lines = [
    values.researchObjective.trim() ? `Objective: ${values.researchObjective.trim()}` : '',
    values.researchCategory.trim() ? `Research category: ${values.researchCategory.trim()}` : '',
    values.studyArchitecture.trim() ? `Research type: ${values.studyArchitecture.trim()}` : '',
    values.interpretationMode.trim() ? `Interpretation mode: ${values.interpretationMode.trim()}` : '',
    values.recommendedArticleType.trim() ? `Recommended article type: ${values.recommendedArticleType.trim()}` : '',
    values.recommendedWordLength.trim() ? `Recommended word length: ${values.recommendedWordLength.trim()}` : '',
    sections.length > 0
      ? `Priority sections: ${sections
          .map((section) => section.charAt(0).toUpperCase() + section.slice(1))
          .join(', ')}`
      : '',
    guardrailsEnabled ? 'Use associative inference only and include explicit limitations.' : '',
  ]
  return lines.filter(Boolean).join('\n')
}

function readStoredRunContext(): RunContext | null {
  const raw = window.localStorage.getItem(CONTEXT_KEY)
  if (!raw) {
    return null
  }
  try {
    return JSON.parse(raw) as RunContext
  } catch {
    return null
  }
}

function isResearchFrameComplete(values: ContextFormValues): boolean {
  return Boolean(values.researchObjective.trim())
}

function buildResearchFrameSignature(values: ContextFormValues): string {
  return JSON.stringify({
    researchObjective: values.researchObjective.trim(),
  })
}

const STEP_ITEMS: WizardStepItem[] = [
  { id: 1, title: 'Research Overview', helper: 'Define study framing.' },
  { id: 2, title: 'Plan Sections', helper: 'Generate and edit outline.' },
  { id: 3, title: 'Run Generation', helper: 'Select sections and run.' },
  { id: 4, title: 'Draft Review', helper: 'Accept, regenerate, and edit.' },
  { id: 5, title: 'QC + Export', helper: 'Run QC and export.' },
]

export function StudyCorePage() {
  const currentStep = useStudyCoreWizardStore((state) => state.currentStep)
  const planStatus = useStudyCoreWizardStore((state) => state.planStatus)
  const jobStatus = useStudyCoreWizardStore((state) => state.jobStatus)
  const acceptedSections = useStudyCoreWizardStore((state) => state.acceptedSections)
  const qcStatus = useStudyCoreWizardStore((state) => state.qcStatus)
  const devOverride = useStudyCoreWizardStore((state) => state.devOverride)
  const setCurrentStep = useStudyCoreWizardStore((state) => state.setCurrentStep)
  const setContextStatus = useStudyCoreWizardStore((state) => state.setContextStatus)
  const setPlanStatus = useStudyCoreWizardStore((state) => state.setPlanStatus)
  const setJobStatus = useStudyCoreWizardStore((state) => state.setJobStatus)
  const setAcceptedSections = useStudyCoreWizardStore((state) => state.setAcceptedSections)
  const setQcStatus = useStudyCoreWizardStore((state) => state.setQcStatus)
  const setContextFields = useStudyCoreWizardStore((state) => state.setContextFields)
  const setWizardSections = useStudyCoreWizardStore((state) => state.setSelectedSections)
  const setOutlinePlan = useStudyCoreWizardStore((state) => state.setOutlinePlan)
  const setQcSeverityCounts = useStudyCoreWizardStore((state) => state.setQcSeverityCounts)
  const setRunConfiguration = useStudyCoreWizardStore((state) => state.setRunConfiguration)
  const canNavigateToStep = useStudyCoreWizardStore((state) => state.canNavigateToStep)

  const [journals, setJournals] = useState<JournalOption[]>(CURATED_CARDIOLOGY_IMAGING_JOURNALS)
  const [targetJournal, setTargetJournal] = useState('')
  const [runContext, setRunContext] = useState<RunContext | null>(() => readStoredRunContext())
  const [contextValues, setContextValues] = useState<ContextFormValues>({
    projectTitle: '',
    researchCategory: '',
    researchObjective: '',
    studyArchitecture: '',
    interpretationMode: '',
    recommendedArticleType: '',
    recommendedWordLength: '',
  })

  const [guardrailsEnabled, setGuardrailsEnabled] = useState(true)
  const [runRecommendations, setRunRecommendations] = useState<RunRecommendations>({
    conservativeWithLimitations: true,
    uncertaintyInResults: false,
    mechanisticAsHypothesis: false,
  })

  const [selectedSections, setSelectedSections] = useState<string[]>(CORE_SECTIONS)
  const [generationBrief, setGenerationBrief] = useState(buildGenerationBrief(contextValues, CORE_SECTIONS, guardrailsEnabled))
  const [generationBriefTouched, setGenerationBriefTouched] = useState(false)
  const [temperature, setTemperature] = useState(0.3)
  const [reasoningEffort, setReasoningEffort] = useState<'low' | 'medium' | 'high'>('medium')
  const [maxCostUsd, setMaxCostUsd] = useState('0.08')
  const [dailyBudgetUsd, setDailyBudgetUsd] = useState('0.25')
  const [styleProfile, setStyleProfile] = useState<'technical' | 'concise' | 'narrative_review'>('technical')

  const [plan, setPlan] = useState<OutlinePlanState | null>(null)
  const [clarificationResponses, setClarificationResponses] = useState<Step2ClarificationResponse[]>([])
  const [estimatePreview, setEstimatePreview] = useState<GenerationEstimate | null>(null)
  const [activeJob, setActiveJob] = useState<GenerationJobPayload | null>(null)
  const [links, setLinks] = useState<ClaimLinkSuggestion[]>([])
  const [draftsBySection, setDraftsBySection] = useState<Record<string, string>>({})
  const [acceptedSectionKeys, setAcceptedSectionKeys] = useState<string[]>([])
  const [savedResearchFrameSignature, setSavedResearchFrameSignature] = useState<string | null>(() =>
    window.localStorage.getItem(RESEARCH_FRAME_SIGNATURE_KEY),
  )
  const [contextSaveRequestId, setContextSaveRequestId] = useState(0)

  const [status, setStatus] = useState('')
  const [error, setError] = useState('')
  const targetJournalLabel = useMemo(
    () => journals.find((journal) => journal.slug === targetJournal)?.display_name ?? targetJournal,
    [journals, targetJournal],
  )

  const applySectionPatch = useCallback((sectionName: string, bulletsToInsert: string[]) => {
    const cleanedBullets = bulletsToInsert.map((bullet) => bullet.trim()).filter(Boolean)
    if (cleanedBullets.length === 0) {
      return
    }
    setPlan((current) => {
      if (!current) {
        return current
      }
      const sectionKey = sectionName.toLowerCase()
      const sectionIndex = current.sections.findIndex((section) => section.name.toLowerCase() === sectionKey)
      if (sectionIndex === -1) {
        return {
          ...current,
          sections: [...current.sections, { name: sectionKey, bullets: cleanedBullets }],
        }
      }
      const existingSection = current.sections[sectionIndex]
      const deduped = [...existingSection.bullets]
      for (const bullet of cleanedBullets) {
        if (!deduped.some((item) => item.trim().toLowerCase() === bullet.toLowerCase())) {
          deduped.push(bullet)
        }
      }
      return {
        ...current,
        sections: current.sections.map((section, index) =>
          index === sectionIndex ? { ...section, bullets: deduped } : section,
        ),
      }
    })
    setStatus(`${sectionName.charAt(0).toUpperCase()}${sectionName.slice(1)} plan updated from recommendations.`)
  }, [])

  const answers = useMemo(
    () => ({
      study_type: contextValues.studyArchitecture,
      study_category: contextValues.researchCategory,
      research_objective: contextValues.researchObjective,
      recommended_article_type: contextValues.recommendedArticleType,
      recommended_word_length: contextValues.recommendedWordLength,
      primary_data_source: 'manual_input',
      primary_analytical_claim: contextValues.interpretationMode || 'Associative',
      analysis_summary: contextValues.interpretationMode ? `Interpretation mode: ${contextValues.interpretationMode}` : 'Interpretation mode: Associative',
      disease_focus: '',
      population: '',
      primary_outcome: '',
      manuscript_goal: 'generate_full_manuscript',
      data_source: 'manual_entry',
    }),
    [
      contextValues.interpretationMode,
      contextValues.researchCategory,
      contextValues.recommendedArticleType,
      contextValues.recommendedWordLength,
      contextValues.researchObjective,
      contextValues.studyArchitecture,
    ],
  )

  const suggestedBrief = useMemo(
    () => buildGenerationBrief(contextValues, selectedSections, guardrailsEnabled),
    [contextValues, guardrailsEnabled, selectedSections],
  )
  const planRecommendations = useMemo(
    () =>
      analyzePlan({
        objective: contextValues.researchObjective,
        researchCategory: contextValues.researchCategory,
        studyType: contextValues.studyArchitecture,
        articleType: contextValues.recommendedArticleType,
        interpretationMode: contextValues.interpretationMode,
        plan,
        applySectionPatch,
      }),
    [
      applySectionPatch,
      contextValues.interpretationMode,
      contextValues.recommendedArticleType,
      contextValues.researchCategory,
      contextValues.researchObjective,
      contextValues.studyArchitecture,
      plan,
    ],
  )
  const step1StudyTypeOptions = useMemo(() => [...KNOWN_STUDY_TYPES], [])
  const currentResearchFrameSignature = useMemo(
    () => buildResearchFrameSignature(contextValues),
    [contextValues],
  )
  const researchFrameComplete = useMemo(() => isResearchFrameComplete(contextValues), [contextValues])
  const researchFrameSaved = useMemo(
    () => Boolean(runContext) && researchFrameComplete && savedResearchFrameSignature === currentResearchFrameSignature,
    [currentResearchFrameSignature, researchFrameComplete, runContext, savedResearchFrameSignature],
  )
  const researchFrameInProgress = useMemo(
    () =>
      !researchFrameComplete &&
      Boolean(
        contextValues.projectTitle.trim() ||
          targetJournal.trim() ||
          contextValues.researchCategory.trim() ||
          contextValues.studyArchitecture.trim() ||
          contextValues.interpretationMode.trim() ||
          contextValues.recommendedArticleType.trim() ||
          contextValues.recommendedWordLength.trim(),
      ),
    [
      contextValues.interpretationMode,
      contextValues.projectTitle,
      contextValues.recommendedArticleType,
      contextValues.recommendedWordLength,
      contextValues.researchCategory,
      contextValues.studyArchitecture,
      researchFrameComplete,
      targetJournal,
    ],
  )
  const completedSteps = useMemo(() => {
    const completed: WizardStep[] = []
    if (researchFrameComplete) {
      completed.push(1)
    }
    if (planStatus === 'built') {
      completed.push(2)
    }
    if (jobStatus === 'succeeded') {
      completed.push(3)
    }
    if (acceptedSections > 0) {
      completed.push(4)
    }
    if (qcStatus !== 'idle') {
      completed.push(5)
    }
    return completed
  }, [acceptedSections, jobStatus, planStatus, qcStatus, researchFrameComplete])
  const inProgressSteps = useMemo(() => (researchFrameInProgress ? ([1] as WizardStep[]) : []), [researchFrameInProgress])

  useEffect(() => {
    void fetchJournalOptions()
      .then((payload) => {
        const merged = mergeJournalOptions(payload)
        setJournals(merged)
        if (targetJournal && !merged.some((journal) => journal.slug === targetJournal)) {
          setTargetJournal('')
        }
      })
      .catch((loadError) => {
        setJournals(CURATED_CARDIOLOGY_IMAGING_JOURNALS)
        if (targetJournal && !CURATED_CARDIOLOGY_IMAGING_JOURNALS.some((journal) => journal.slug === targetJournal)) {
          setTargetJournal('')
        }
        setError(loadError instanceof Error ? `${loadError.message} Using curated cardiology and imaging journals.` : 'Using curated cardiology and imaging journals.')
      })
  }, [targetJournal])

  useEffect(() => {
    if (!runContext) {
      window.localStorage.removeItem(CONTEXT_KEY)
      window.localStorage.removeItem(RESEARCH_FRAME_SIGNATURE_KEY)
      setSavedResearchFrameSignature(null)
      return
    }
    window.localStorage.setItem(CONTEXT_KEY, JSON.stringify(runContext))
  }, [runContext])

  useEffect(() => {
    setContextStatus(researchFrameSaved ? 'saved' : 'empty')
  }, [researchFrameSaved, setContextStatus])

  useEffect(() => {
    if (generationBriefTouched) {
      return
    }
    setGenerationBrief(suggestedBrief)
  }, [generationBriefTouched, suggestedBrief])

  useEffect(() => {
    setAcceptedSections(acceptedSectionKeys.length)
  }, [acceptedSectionKeys, setAcceptedSections])

  useEffect(() => {
      setContextFields({
        projectTitle: contextValues.projectTitle,
      researchObjective: contextValues.researchObjective,
      researchCategory: contextValues.researchCategory,
      studyArchitecture: contextValues.studyArchitecture,
      interpretationMode: contextValues.interpretationMode,
      studyType: contextValues.studyArchitecture,
        primaryAnalyticalClaim: contextValues.interpretationMode,
      })
  }, [contextValues, setContextFields])

  useEffect(() => {
    setWizardSections(selectedSections)
  }, [selectedSections, setWizardSections])

  useEffect(() => {
    setOutlinePlan(plan)
  }, [plan, setOutlinePlan])

  useEffect(() => {
    setRunConfiguration({
      generationBrief,
      temperature,
      reasoningEffort,
      maxCostUsd,
      dailyBudgetUsd,
      hasEstimate: Boolean(estimatePreview),
    })
  }, [
    dailyBudgetUsd,
    estimatePreview,
    generationBrief,
    maxCostUsd,
    reasoningEffort,
    setRunConfiguration,
    temperature,
  ])

  useEffect(() => {
    setRunRecommendations((current) => ({
      ...current,
      conservativeWithLimitations: guardrailsEnabled,
    }))
  }, [guardrailsEnabled])

  const applyContextPayload = (payload: { projectId: string; manuscriptId: string; recommendedSections: string[] }) => {
    setRunContext({ projectId: payload.projectId, manuscriptId: payload.manuscriptId })
    const nextSections = [...CORE_SECTIONS]
    setSelectedSections(nextSections)
    setGenerationBrief(buildGenerationBrief(contextValues, nextSections, guardrailsEnabled))
    setGenerationBriefTouched(false)
    setSavedResearchFrameSignature(currentResearchFrameSignature)
    window.localStorage.setItem(RESEARCH_FRAME_SIGNATURE_KEY, currentResearchFrameSignature)
    setCurrentStep(2)
  }

  const onPlanChange = (nextPlan: OutlinePlanState | null) => {
    setPlan(nextPlan)
    if (nextPlan) {
      setPlanStatus('built')
      return
    }
    setPlanStatus('empty')
  }

  const onJobStatusChange = (nextStatus: 'idle' | 'running' | 'succeeded' | 'failed') => {
    setJobStatus(nextStatus)
  }

  const onDraftChange = (section: string, draft: string) => {
    setDraftsBySection((current) => ({ ...current, [section]: draft }))
  }

  const onSectionAccepted = (section: string) => {
    setAcceptedSectionKeys((current) => {
      if (current.includes(section)) {
        return current
      }
      return [...current, section]
    })
  }

  const renderActiveStep = () => {
    if (currentStep === 1) {
      return (
        <StepContext
          values={contextValues}
          targetJournal={targetJournal}
          journals={journals}
          saveRequestId={contextSaveRequestId}
          onValueChange={(field, value) =>
            setContextValues((current) => ({
              ...current,
      [field]: value,
            }))
          }
          onTargetJournalChange={setTargetJournal}
          onContextSaved={applyContextPayload}
          onStudyTypeDefaultsResolved={({ interpretationMode, enableConservativeGuardrails }) => {
            setContextValues((current) => ({
              ...current,
              interpretationMode: current.interpretationMode.trim() || interpretationMode,
            }))
            setGuardrailsEnabled(enableConservativeGuardrails)
          }}
          onStatus={setStatus}
          onError={setError}
        />
      )
    }

    if (currentStep === 2) {
      return (
        <StepPlan
          targetJournal={targetJournal}
          answers={answers}
          planningContext={{
            targetJournal,
            targetJournalLabel,
            researchCategory: contextValues.researchCategory,
            studyType: contextValues.studyArchitecture,
            interpretationMode: contextValues.interpretationMode,
            articleType: contextValues.recommendedArticleType,
            wordLength: contextValues.recommendedWordLength,
            summary: contextValues.researchObjective,
          }}
          selectedSections={selectedSections}
          generationBrief={generationBrief}
          plan={plan}
          clarificationResponses={clarificationResponses}
          mechanisticRelevant={contextValues.interpretationMode.toLowerCase().includes('mechanistic')}
          onSectionsChange={setSelectedSections}
          onPlanChange={onPlanChange}
          onStatus={setStatus}
          onError={setError}
        />
      )
    }

    if (currentStep === 3) {
      return (
        <StepRun
          runContext={runContext}
          selectedSections={selectedSections}
          generationBrief={generationBrief}
          suggestedBrief={suggestedBrief}
          temperature={temperature}
          reasoningEffort={reasoningEffort}
          maxCostUsd={maxCostUsd}
          dailyBudgetUsd={dailyBudgetUsd}
          estimate={estimatePreview}
          activeJob={activeJob}
          recommendations={runRecommendations}
          onSectionsChange={setSelectedSections}
          onGenerationBriefChange={(value) => {
            setGenerationBriefTouched(true)
            setGenerationBrief(value)
          }}
          onTemperatureChange={setTemperature}
          onReasoningEffortChange={setReasoningEffort}
          onMaxCostChange={setMaxCostUsd}
          onDailyBudgetChange={setDailyBudgetUsd}
          onEstimateChange={setEstimatePreview}
          onActiveJobChange={setActiveJob}
          onJobStatusChange={onJobStatusChange}
          onStatus={setStatus}
          onError={setError}
        />
      )
    }

    if (currentStep === 4) {
      return (
        <StepDraftReview
          runContext={runContext}
          selectedSections={selectedSections}
          generationBrief={generationBrief}
          styleProfile={styleProfile}
          draftsBySection={draftsBySection}
          acceptedSectionKeys={acceptedSectionKeys}
          links={links}
          onStyleProfileChange={setStyleProfile}
          onDraftChange={onDraftChange}
          onSectionAccepted={onSectionAccepted}
          onStatus={setStatus}
          onError={setError}
        />
      )
    }

    return (
      <StepLinkQcExport
        runContext={runContext}
        selectedSections={selectedSections}
        links={links}
        onLinksChange={setLinks}
        onQcStatusChange={setQcStatus}
        onQcSeverityCountsChange={setQcSeverityCounts}
        onStatus={setStatus}
        onError={setError}
      />
    )
  }

  const renderRightPanel = () => {
    if (currentStep === 1) {
      return (
        <Step1Panel
          summary={contextValues.researchObjective}
          researchCategory={contextValues.researchCategory}
          researchType={contextValues.studyArchitecture}
          studyTypeOptions={step1StudyTypeOptions}
          interpretationMode={contextValues.interpretationMode}
          targetJournal={targetJournal}
          currentArticleType={contextValues.recommendedArticleType}
          currentWordLength={contextValues.recommendedWordLength}
          onReplaceSummary={(value) =>
            setContextValues((current) => ({
              ...current,
              researchObjective: value,
            }))
          }
          onApplyResearchCategory={(value) =>
            setContextValues((current) => {
              const nextStudyTypes = getStudyTypesForCategory(value, true)
              const canKeepCurrentStudyType = nextStudyTypes.includes(current.studyArchitecture)
              return {
                ...current,
                researchCategory: value,
                studyArchitecture: canKeepCurrentStudyType ? current.studyArchitecture : '',
              }
            })
          }
          onApplyResearchType={(value) =>
            {
              if (!value.trim()) {
                setContextValues((current) => ({
                  ...current,
                  studyArchitecture: '',
                }))
                return
              }
              const resolvedSelection = resolveSuggestedStudyType(value)
              if (!resolvedSelection.studyType) {
                setError('Suggested research type could not be mapped to a selectable study type. Refresh suggestions.')
                return
              }
              const defaults = getStudyTypeDefaults(resolvedSelection.studyType)
              setContextValues((current) => ({
                ...current,
                researchCategory:
                  resolvedSelection.category ??
                  getCategoryForStudyType(resolvedSelection.studyType, true) ??
                  current.researchCategory,
                studyArchitecture: resolvedSelection.studyType,
                interpretationMode: defaults.defaultInterpretationMode,
              }))
              setGuardrailsEnabled(defaults.enableConservativeGuardrails)
            }
          }
          onApplyInterpretationMode={(value) =>
            setContextValues((current) => ({
              ...current,
              interpretationMode: value,
            }))
          }
          onApplyArticleType={(value) =>
            setContextValues((current) => ({
              ...current,
              recommendedArticleType: value,
            }))
          }
          onApplyWordLength={(value) =>
            setContextValues((current) => ({
              ...current,
              recommendedWordLength: value,
            }))
          }
        />
      )
    }
    if (currentStep === 2) {
      return (
        <Step2Panel
          hasPlan={Boolean(plan)}
          recommendations={planRecommendations}
          planningContext={{
            targetJournal,
            targetJournalLabel,
            researchCategory: contextValues.researchCategory,
            studyType: contextValues.studyArchitecture,
            interpretationMode: contextValues.interpretationMode,
            articleType: contextValues.recommendedArticleType,
            wordLength: contextValues.recommendedWordLength,
            summary: contextValues.researchObjective,
          }}
          clarificationResponses={clarificationResponses}
          onClarificationResponsesChange={setClarificationResponses}
        />
      )
    }
    return null
  }

  const showRightPanel =
    (currentStep === 1 && contextValues.researchObjective.trim().length > 0) || currentStep === 2

  return (
    <section className="space-y-4">
      <header className="rounded-lg border border-border/80 bg-muted/20 p-3">
        <div className="min-w-[260px] space-y-1">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Study Core - Run Wizard</p>
          <Input
            value={contextValues.projectTitle}
            placeholder="Manuscript title"
            onChange={(event) =>
              setContextValues((current) => ({
                ...current,
                projectTitle: event.target.value,
              }))
            }
          />
        </div>
      </header>

      <div
        className={
          showRightPanel
            ? 'grid items-start gap-4 xl:grid-cols-[280px_minmax(0,1.2fr)_360px]'
            : 'grid items-start gap-4 xl:grid-cols-[280px_minmax(0,1fr)]'
        }
      >
        <div className="rounded-lg border border-border/80 bg-card p-2">
          <StudyCoreStepper
            steps={STEP_ITEMS}
            currentStep={currentStep}
            completedSteps={completedSteps}
            inProgressSteps={inProgressSteps}
            canNavigateToStep={(step) => {
              if (step === 2 && currentStep === 1) {
                return true
              }
              return canNavigateToStep(step)
            }}
            onStepSelect={(step) => {
              if (step === 2 && currentStep === 1 && !researchFrameSaved) {
                setContextSaveRequestId((current) => current + 1)
                return
              }
              if (canNavigateToStep(step)) {
                setCurrentStep(step)
              }
            }}
            devOverride={devOverride}
          />
        </div>

        <div className="rounded-lg border border-border/80 bg-background p-2">
          <div key={currentStep} className="wizard-step-transition space-y-3">
            {renderActiveStep()}
          </div>
        </div>

        {showRightPanel ? (
          <div className="rounded-lg border border-border/80 bg-card p-2">
            <div key={`panel-${currentStep}`} className="wizard-step-transition">
              {renderRightPanel()}
            </div>
          </div>
        ) : null}
      </div>

      {status ? <p className="text-sm text-emerald-600">{status}</p> : null}
      {error ? <p className="text-sm text-destructive">{error}</p> : null}
    </section>
  )
}
