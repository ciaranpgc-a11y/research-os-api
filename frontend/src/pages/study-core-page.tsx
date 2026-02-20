import { useEffect, useMemo, useState } from 'react'

import { Step1Panel } from '@/components/study-core/Step1Panel'
import { StepContext, type ContextFormValues } from '@/components/study-core/StepContext'
import { StepDraftReview } from '@/components/study-core/StepDraftReview'
import { StepLinkQcExport } from '@/components/study-core/StepLinkQcExport'
import { StepPlan } from '@/components/study-core/StepPlan'
import { StepRun } from '@/components/study-core/StepRun'
import { StudyCoreStepper, type WizardStepItem } from '@/components/study-core/StudyCoreStepper'
import { Input } from '@/components/ui/input'
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
const SNAPSHOT_KEY = 'aawe-run-wizard-snapshot'
const CORE_SECTIONS = ['introduction', 'methods', 'results', 'discussion']

function buildGenerationBrief(values: ContextFormValues, sections: string[], guardrailsEnabled: boolean): string {
  const lines = [
    values.researchObjective.trim() ? `Objective: ${values.researchObjective.trim()}` : '',
    values.studyArchitecture.trim() ? `Architecture: ${values.studyArchitecture.trim()}` : '',
    values.interpretationMode.trim() ? `Interpretation mode: ${values.interpretationMode.trim()}` : '',
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

const STEP_ITEMS: WizardStepItem[] = [
  { id: 1, title: 'Research Frame', helper: 'Define inferential contract.' },
  { id: 2, title: 'Plan Sections', helper: 'Generate and edit outline.' },
  { id: 3, title: 'Run Generation', helper: 'Select sections and run.' },
  { id: 4, title: 'Draft Review', helper: 'Accept, regenerate, and edit.' },
  { id: 5, title: 'QC + Export', helper: 'Run QC and export.' },
]

export function StudyCorePage() {
  const currentStep = useStudyCoreWizardStore((state) => state.currentStep)
  const contextStatus = useStudyCoreWizardStore((state) => state.contextStatus)
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

  const [journals, setJournals] = useState<JournalOption[]>([])
  const [targetJournal, setTargetJournal] = useState('generic-original')
  const [runContext, setRunContext] = useState<RunContext | null>(() => readStoredRunContext())
  const [contextValues, setContextValues] = useState<ContextFormValues>({
    projectTitle: 'AAWE Research Workspace',
    researchObjective: '',
    studyArchitecture: '',
    interpretationMode: '',
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
  const [primaryExportAction, setPrimaryExportAction] = useState<(() => void) | null>(null)

  const [status, setStatus] = useState('')
  const [error, setError] = useState('')

  const answers = useMemo(
    () => ({
      study_type: contextValues.studyArchitecture,
      research_objective: contextValues.researchObjective,
      primary_data_source: 'manual_input',
      primary_analytical_claim: contextValues.interpretationMode || 'Associative',
      analysis_summary: contextValues.interpretationMode ? `Interpretation mode: ${contextValues.interpretationMode}` : 'Interpretation mode: Associative',
      disease_focus: '',
      population: '',
      primary_outcome: '',
      manuscript_goal: 'generate_full_manuscript',
      data_source: 'manual_entry',
    }),
    [contextValues.interpretationMode, contextValues.researchObjective, contextValues.studyArchitecture],
  )

  const completedSteps = useMemo(() => {
    const completed: WizardStep[] = []
    if (contextStatus === 'saved') {
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
  }, [acceptedSections, contextStatus, jobStatus, planStatus, qcStatus])

  const suggestedBrief = useMemo(
    () => buildGenerationBrief(contextValues, selectedSections, guardrailsEnabled),
    [contextValues, guardrailsEnabled, selectedSections],
  )

  useEffect(() => {
    void fetchJournalOptions()
      .then((payload) => {
        setJournals(payload)
        if (!payload.some((journal) => journal.slug === targetJournal)) {
          setTargetJournal(payload[0]?.slug ?? 'generic-original')
        }
      })
      .catch((loadError) => {
        setError(loadError instanceof Error ? loadError.message : 'Could not load journals.')
      })
  }, [targetJournal])

  useEffect(() => {
    if (!runContext) {
      window.localStorage.removeItem(CONTEXT_KEY)
      setContextStatus('empty')
      return
    }
    window.localStorage.setItem(CONTEXT_KEY, JSON.stringify(runContext))
    setContextStatus('saved')
  }, [runContext, setContextStatus])

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
    setContextStatus('saved')
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

  const onContinue = () => {
    setError('')
    if (currentStep === 5) {
      if (qcStatus === 'pass' && primaryExportAction) {
        primaryExportAction()
        return
      }
      setStatus('QC and export are available in Step 5.')
      return
    }
    const nextStep = (currentStep + 1) as WizardStep
    if (canNavigateToStep(nextStep)) {
      setCurrentStep(nextStep)
      return
    }
    if (currentStep === 1) {
      setError('Save Research Frame to unlock Step 2.')
      return
    }
    if (currentStep === 2) {
      setError('Generate and edit the plan to unlock Step 3.')
      return
    }
    if (currentStep === 3) {
      setError('Run generation successfully to unlock Step 4.')
      return
    }
    if (currentStep === 4) {
      setError('Accept at least one section to unlock Step 5.')
      return
    }
  }

  const onSaveWorkspace = () => {
    const snapshot = {
      savedAt: new Date().toISOString(),
      runContext,
      targetJournal,
      contextValues,
      selectedSections,
      plan,
      draftsBySection,
      acceptedSectionKeys,
      runRecommendations,
      guardrailsEnabled,
    }
    window.localStorage.setItem(SNAPSHOT_KEY, JSON.stringify(snapshot))
    setStatus('Workspace saved locally.')
  }

  const onEntryNew = () => {
    setCurrentStep(1)
  }

  const onEntryContinue = () => {
    if (acceptedSections > 0 || Object.keys(draftsBySection).length > 0) {
      setCurrentStep(4)
      return
    }
    if (planStatus === 'built') {
      setCurrentStep(3)
      return
    }
    if (contextStatus === 'saved') {
      setCurrentStep(2)
      return
    }
    setCurrentStep(1)
  }

  const onEntryRefine = () => {
    setCurrentStep(4)
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
        onRegisterPrimaryExportAction={setPrimaryExportAction}
      />
    )
  }

  const renderRightPanel = () => {
    if (currentStep === 1) {
      return (
        <Step1Panel
          objective={contextValues.researchObjective}
          studyArchitecture={contextValues.studyArchitecture}
          guardrailsEnabled={guardrailsEnabled}
          onReplaceObjective={(value) =>
            setContextValues((current) => ({
              ...current,
              researchObjective: value,
            }))
          }
          onApplyArchitecture={(value) =>
            setContextValues((current) => ({
              ...current,
              studyArchitecture: value,
            }))
          }
          onGuardrailsChange={setGuardrailsEnabled}
        />
      )
    }
    return null
  }

  const showRightPanel = currentStep === 1

  return (
    <section className="space-y-4">
      <header className="sticky top-0 z-20 rounded-lg border border-border bg-background/95 p-3 shadow-sm backdrop-blur">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div className="min-w-[260px] flex-1 space-y-1">
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
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onContinue}
              className="h-9 rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground hover:bg-primary/90"
            >
              Continue
            </button>
            <button
              type="button"
              onClick={onSaveWorkspace}
              className="h-9 rounded-md border border-border bg-background px-4 text-sm font-medium text-foreground hover:bg-muted/50"
            >
              Save
            </button>
          </div>
        </div>
      </header>

      <div className="inline-flex rounded-md border border-border bg-background p-1">
        <button type="button" onClick={onEntryNew} className="rounded-md px-3 py-1.5 text-xs font-medium text-muted-foreground hover:bg-muted/60 hover:text-foreground">
          New
        </button>
        <button
          type="button"
          onClick={onEntryContinue}
          className="rounded-md px-3 py-1.5 text-xs font-medium text-muted-foreground hover:bg-muted/60 hover:text-foreground"
        >
          Continue
        </button>
        <button
          type="button"
          onClick={onEntryRefine}
          className="rounded-md px-3 py-1.5 text-xs font-medium text-muted-foreground hover:bg-muted/60 hover:text-foreground"
        >
          Refine
        </button>
      </div>

      <div className={showRightPanel ? 'grid gap-4 xl:grid-cols-[280px_minmax(0,1fr)_320px]' : 'grid gap-4 xl:grid-cols-[280px_minmax(0,1fr)]'}>
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

        <div key={currentStep} className="wizard-step-transition space-y-3">
          {renderActiveStep()}
        </div>

        {showRightPanel ? <div key={`panel-${currentStep}`} className="wizard-step-transition">{renderRightPanel()}</div> : null}
      </div>

      {status ? <p className="text-sm text-emerald-600">{status}</p> : null}
      {error ? <p className="text-sm text-destructive">{error}</p> : null}
    </section>
  )
}
