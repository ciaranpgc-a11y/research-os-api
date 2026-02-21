import { useEffect, useMemo, useState } from 'react'

import { Step1Panel } from '@/components/study-core/Step1Panel'
import { StepContext, type ContextFormValues } from '@/components/study-core/StepContext'
import { StepDraftReview } from '@/components/study-core/StepDraftReview'
import { StepLinkQcExport } from '@/components/study-core/StepLinkQcExport'
import { StepPlan } from '@/components/study-core/StepPlan'
import { StepRun } from '@/components/study-core/StepRun'
import { StudyCoreStepper, type WizardStepItem } from '@/components/study-core/StudyCoreStepper'
import { Input } from '@/components/ui/input'
import {
  CURATED_CARDIOLOGY_IMAGING_JOURNALS,
  getCategoryForStudyType,
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
} from '@/types/study-core'

type RunContext = { projectId: string; manuscriptId: string }
type RunRecommendations = {
  conservativeWithLimitations: boolean
  uncertaintyInResults: boolean
  mechanisticAsHypothesis: boolean
}

const CONTEXT_KEY = 'aawe-run-context'
const RESEARCH_FRAME_SIGNATURE_KEY = 'aawe-research-frame-signature'
const CORE_SECTIONS = ['introduction', 'methods', 'results', 'discussion']

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
  return Boolean(values.projectTitle.trim() && values.studyArchitecture.trim() && values.researchObjective.trim())
}

function buildResearchFrameSignature(values: ContextFormValues, targetJournal: string): string {
  return JSON.stringify({
    projectTitle: values.projectTitle.trim(),
    researchObjective: values.researchObjective.trim(),
    researchCategory: values.researchCategory.trim(),
    studyArchitecture: values.studyArchitecture.trim(),
    interpretationMode: values.interpretationMode.trim(),
    recommendedArticleType: values.recommendedArticleType.trim(),
    recommendedWordLength: values.recommendedWordLength.trim(),
    targetJournal: targetJournal.trim(),
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
  const [targetJournal, setTargetJournal] = useState('jacc-cardiovascular-imaging')
  const [runContext, setRunContext] = useState<RunContext | null>(() => readStoredRunContext())
  const [contextValues, setContextValues] = useState<ContextFormValues>({
    projectTitle: 'AAWE Research Workspace',
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
  const [estimatePreview, setEstimatePreview] = useState<GenerationEstimate | null>(null)
  const [activeJob, setActiveJob] = useState<GenerationJobPayload | null>(null)
  const [links, setLinks] = useState<ClaimLinkSuggestion[]>([])
  const [draftsBySection, setDraftsBySection] = useState<Record<string, string>>({})
  const [acceptedSectionKeys, setAcceptedSectionKeys] = useState<string[]>([])
  const [savedResearchFrameSignature, setSavedResearchFrameSignature] = useState<string | null>(() =>
    window.localStorage.getItem(RESEARCH_FRAME_SIGNATURE_KEY),
  )

  const [status, setStatus] = useState('')
  const [error, setError] = useState('')

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
  const currentResearchFrameSignature = useMemo(
    () => buildResearchFrameSignature(contextValues, targetJournal),
    [contextValues, targetJournal],
  )
  const researchFrameComplete = useMemo(() => isResearchFrameComplete(contextValues), [contextValues])
  const researchFrameSaved = useMemo(
    () => Boolean(runContext) && researchFrameComplete && savedResearchFrameSignature === currentResearchFrameSignature,
    [currentResearchFrameSignature, researchFrameComplete, runContext, savedResearchFrameSignature],
  )
  const completedSteps = useMemo(() => {
    const completed: WizardStep[] = []
    if (researchFrameSaved) {
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
  }, [acceptedSections, jobStatus, planStatus, qcStatus, researchFrameSaved])

  useEffect(() => {
    void fetchJournalOptions()
      .then((payload) => {
        const merged = mergeJournalOptions(payload)
        setJournals(merged)
        if (!merged.some((journal) => journal.slug === targetJournal)) {
          setTargetJournal(merged[0]?.slug ?? 'jacc-cardiovascular-imaging')
        }
      })
      .catch((loadError) => {
        setJournals(CURATED_CARDIOLOGY_IMAGING_JOURNALS)
        if (!CURATED_CARDIOLOGY_IMAGING_JOURNALS.some((journal) => journal.slug === targetJournal)) {
          setTargetJournal(CURATED_CARDIOLOGY_IMAGING_JOURNALS[0]?.slug ?? 'jacc-cardiovascular-imaging')
        }
        setError(loadError instanceof Error ? `${loadError.message} Using curated cardiology and imaging journals.` : 'Using curated cardiology and imaging journals.')
      })
  }, [])

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
    const nextSections = payload.recommendedSections.length > 0 ? payload.recommendedSections : selectedSections
    if (payload.recommendedSections.length > 0) {
      setSelectedSections(payload.recommendedSections)
    }
    setGenerationBrief(buildGenerationBrief(contextValues, nextSections, guardrailsEnabled))
    setGenerationBriefTouched(false)
    setSavedResearchFrameSignature(currentResearchFrameSignature)
    window.localStorage.setItem(RESEARCH_FRAME_SIGNATURE_KEY, currentResearchFrameSignature)
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
              interpretationMode,
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
          selectedSections={selectedSections}
          generationBrief={generationBrief}
          plan={plan}
          estimatePreview={estimatePreview}
          mechanisticRelevant={contextValues.interpretationMode.toLowerCase().includes('mechanistic')}
          onSectionsChange={setSelectedSections}
          onPlanChange={onPlanChange}
          onEstimateChange={setEstimatePreview}
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
          researchType={contextValues.studyArchitecture}
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
          onApplyResearchType={(value) =>
            {
              const defaults = getStudyTypeDefaults(value)
              setContextValues((current) => ({
                ...current,
                researchCategory: getCategoryForStudyType(value, true) ?? current.researchCategory,
                studyArchitecture: value,
                interpretationMode: defaults.defaultInterpretationMode,
              }))
              setGuardrailsEnabled(defaults.enableConservativeGuardrails)
            }
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
    return null
  }

  const showRightPanel = currentStep === 1 && contextValues.researchObjective.trim().length > 0

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

      <div className={showRightPanel ? 'grid items-start gap-4 xl:grid-cols-[250px_minmax(0,1fr)_340px]' : 'grid items-start gap-4 xl:grid-cols-[250px_minmax(0,1fr)]'}>
        <div className="rounded-lg border border-border/80 bg-card p-2">
          <StudyCoreStepper
            steps={STEP_ITEMS}
            currentStep={currentStep}
            completedSteps={completedSteps}
            canNavigateToStep={canNavigateToStep}
            onStepSelect={(step) => {
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
