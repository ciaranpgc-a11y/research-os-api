import { useEffect, useMemo, useState } from 'react'

import { RunSummaryBar } from '@/components/study-core/RunSummaryBar'
import { StepContext, type ContextFormValues } from '@/components/study-core/StepContext'
import { StepDraftReview } from '@/components/study-core/StepDraftReview'
import { StepLinkQcExport } from '@/components/study-core/StepLinkQcExport'
import { StepPlan } from '@/components/study-core/StepPlan'
import { StepRun } from '@/components/study-core/StepRun'
import { StudyCoreStepper, type WizardStepItem } from '@/components/study-core/StudyCoreStepper'
import { computeReadinessScore } from '@/lib/readiness-score'
import { fetchJournalOptions } from '@/lib/study-core-api'
import { useStudyCoreWizardStore, type WizardStep } from '@/store/use-study-core-wizard-store'
import type {
  ClaimLinkSuggestion,
  GenerationEstimate,
  GenerationJobPayload,
  JournalOption,
  SectionPlanPayload,
} from '@/types/study-core'

type RunContext = { projectId: string; manuscriptId: string }

const CONTEXT_KEY = 'aawe-run-context'
const CORE_SECTIONS = ['introduction', 'methods', 'results', 'discussion']

function buildNotesContext(values: ContextFormValues): string {
  return [
    `study_type: ${values.studyType}`,
    `disease_focus: ${values.diseaseFocus}`,
    `population: ${values.population}`,
    `primary_outcome: ${values.primaryOutcome}`,
    `analysis_approach: ${values.analysisApproach}`,
  ].join('\n')
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
  { id: 1, title: 'Context', helper: 'Save project and study metadata.' },
  { id: 2, title: 'Plan Sections', helper: 'Choose sections and build a plan.' },
  { id: 3, title: 'Run Generation', helper: 'Estimate and run draft generation.' },
  { id: 4, title: 'Draft Review', helper: 'Accept or regenerate sections.' },
  { id: 5, title: 'Link + QC + Export', helper: 'Link evidence, run QC, then export.' },
]

export function StudyCorePage() {
  const currentStep = useStudyCoreWizardStore((state) => state.currentStep)
  const contextStatus = useStudyCoreWizardStore((state) => state.contextStatus)
  const planStatus = useStudyCoreWizardStore((state) => state.planStatus)
  const jobStatus = useStudyCoreWizardStore((state) => state.jobStatus)
  const acceptedSections = useStudyCoreWizardStore((state) => state.acceptedSections)
  const qcStatus = useStudyCoreWizardStore((state) => state.qcStatus)
  const contextFields = useStudyCoreWizardStore((state) => state.contextFields)
  const readinessSections = useStudyCoreWizardStore((state) => state.selectedSections)
  const qcSeverityCounts = useStudyCoreWizardStore((state) => state.qcSeverityCounts)
  const devOverride = useStudyCoreWizardStore((state) => state.devOverride)
  const setCurrentStep = useStudyCoreWizardStore((state) => state.setCurrentStep)
  const setContextStatus = useStudyCoreWizardStore((state) => state.setContextStatus)
  const setPlanStatus = useStudyCoreWizardStore((state) => state.setPlanStatus)
  const setJobStatus = useStudyCoreWizardStore((state) => state.setJobStatus)
  const setAcceptedSections = useStudyCoreWizardStore((state) => state.setAcceptedSections)
  const setQcStatus = useStudyCoreWizardStore((state) => state.setQcStatus)
  const setContextFields = useStudyCoreWizardStore((state) => state.setContextFields)
  const setWizardSections = useStudyCoreWizardStore((state) => state.setSelectedSections)
  const setQcSeverityCounts = useStudyCoreWizardStore((state) => state.setQcSeverityCounts)
  const canNavigateToStep = useStudyCoreWizardStore((state) => state.canNavigateToStep)

  const [journals, setJournals] = useState<JournalOption[]>([])
  const [targetJournal, setTargetJournal] = useState('generic-original')
  const [runContext, setRunContext] = useState<RunContext | null>(() => readStoredRunContext())
  const [contextValues, setContextValues] = useState<ContextFormValues>({
    projectTitle: 'AAWE Manuscript Workspace',
    studyType: 'observational cohort',
    diseaseFocus: 'Heart failure',
    population: 'Adults admitted with decompensated heart failure',
    primaryOutcome: '90-day all-cause readmission',
    analysisApproach: 'Adjusted Cox model with bootstrap validation',
  })

  const [selectedSections, setSelectedSections] = useState<string[]>(CORE_SECTIONS)
  const [notesContext, setNotesContext] = useState(buildNotesContext(contextValues))
  const [temperature, setTemperature] = useState(0.3)
  const [reasoningEffort, setReasoningEffort] = useState<'low' | 'medium' | 'high'>('medium')
  const [maxCostUsd, setMaxCostUsd] = useState('0.08')
  const [dailyBudgetUsd, setDailyBudgetUsd] = useState('0.25')
  const [styleProfile, setStyleProfile] = useState<'technical' | 'concise' | 'narrative_review'>('technical')

  const [plan, setPlan] = useState<SectionPlanPayload | null>(null)
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
      study_type: contextValues.studyType,
      disease_focus: contextValues.diseaseFocus,
      population: contextValues.population,
      primary_outcome: contextValues.primaryOutcome,
      analysis_summary: contextValues.analysisApproach,
      manuscript_goal: 'generate_full_manuscript',
      data_source: 'manual_entry',
    }),
    [contextValues.analysisApproach, contextValues.diseaseFocus, contextValues.population, contextValues.primaryOutcome, contextValues.studyType],
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
    setAcceptedSections(acceptedSectionKeys.length)
  }, [acceptedSectionKeys, setAcceptedSections])

  useEffect(() => {
    setContextFields(contextValues)
  }, [contextValues, setContextFields])

  useEffect(() => {
    setWizardSections(selectedSections)
  }, [selectedSections, setWizardSections])

  const readinessScore = useMemo(
    () =>
      computeReadinessScore({
        contextFields,
        planStatus,
        selectedSections: readinessSections,
        acceptedSections,
        qcStatus,
        qcSeverityCounts,
      }),
    [acceptedSections, contextFields, planStatus, qcSeverityCounts, qcStatus, readinessSections],
  )

  const onContextSaved = (payload: {
    projectId: string
    manuscriptId: string
    recommendedSections: string[]
  }) => {
    setRunContext({ projectId: payload.projectId, manuscriptId: payload.manuscriptId })
    if (payload.recommendedSections.length > 0) {
      setSelectedSections(payload.recommendedSections)
    }
    setNotesContext(buildNotesContext(contextValues))
    setContextStatus('saved')
    setCurrentStep(2)
  }

  const onPlanChange = (nextPlan: SectionPlanPayload | null) => {
    setPlan(nextPlan)
    if (nextPlan) {
      setPlanStatus('built')
      if (currentStep < 3) {
        setCurrentStep(3)
      }
      return
    }
    setPlanStatus('empty')
  }

  const onJobStatusChange = (nextStatus: 'idle' | 'running' | 'succeeded' | 'failed') => {
    setJobStatus(nextStatus)
    if (nextStatus === 'succeeded' && currentStep < 4) {
      setCurrentStep(4)
    }
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
    if (currentStep < 5) {
      setCurrentStep(5)
    }
  }

  const summaryState = useMemo(() => {
    if (contextStatus === 'empty') {
      return {
        label: 'Set context',
        nextActionText: 'Complete Step 1 to initialize a project and manuscript run context.',
        onAction: () => setCurrentStep(1),
      }
    }
    if (planStatus === 'empty') {
      return {
        label: 'Build plan',
        nextActionText: 'Complete Step 2 to define which sections the run should generate.',
        onAction: () => setCurrentStep(2),
      }
    }
    if (jobStatus === 'idle' || jobStatus === 'failed') {
      return {
        label: 'Run generation',
        nextActionText: 'Use Step 3 to estimate cost and run generation.',
        onAction: () => setCurrentStep(3),
      }
    }
    if (jobStatus === 'running') {
      return {
        label: 'Run generation',
        nextActionText: 'Generation is running. Open Step 3 to monitor live status.',
        onAction: () => setCurrentStep(3),
      }
    }
    if (acceptedSections === 0) {
      return {
        label: 'Review drafts',
        nextActionText: 'Open Step 4 to accept at least one section into the manuscript.',
        onAction: () => setCurrentStep(4),
      }
    }
    if (qcStatus === 'idle') {
      return {
        label: 'Run QC',
        nextActionText: 'Open Step 5, run QC, and resolve high-severity findings.',
        onAction: () => setCurrentStep(5),
      }
    }
    if (qcStatus === 'pass') {
      return {
        label: 'Export',
        nextActionText: 'QC passed. Export the manuscript and reference pack.',
        onAction: () => {
          if (primaryExportAction) {
            primaryExportAction()
            return
          }
          setCurrentStep(5)
        },
      }
    }
    return {
      label: 'Run QC',
      nextActionText: 'QC has warnings or failures. Open Step 5 to review checklist cards and choose export mode.',
      onAction: () => setCurrentStep(5),
    }
  }, [acceptedSections, contextStatus, jobStatus, planStatus, primaryExportAction, qcStatus, setCurrentStep])

  const renderActiveStep = () => {
    if (currentStep === 1) {
      return (
        <StepContext
          values={contextValues}
          targetJournal={targetJournal}
          journals={journals}
          contextSaved={contextStatus === 'saved'}
          contextCard={runContext ? { projectId: runContext.projectId, manuscriptId: runContext.manuscriptId } : null}
          onValueChange={(field, value) =>
            setContextValues((current) => ({
              ...current,
              [field]: value,
            }))
          }
          onTargetJournalChange={setTargetJournal}
          onContextSaved={onContextSaved}
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
          notesContext={notesContext}
          plan={plan}
          estimatePreview={estimatePreview}
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
          notesContext={notesContext}
          temperature={temperature}
          reasoningEffort={reasoningEffort}
          maxCostUsd={maxCostUsd}
          dailyBudgetUsd={dailyBudgetUsd}
          estimate={estimatePreview}
          activeJob={activeJob}
          onNotesContextChange={setNotesContext}
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
          notesContext={notesContext}
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

  return (
    <section className="space-y-4">
      <header className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">Study Core - Run Wizard</h1>
        <p className="text-sm text-muted-foreground">Follow a guided 5-step workflow to move from setup through export with progressive disclosure.</p>
      </header>

      <RunSummaryBar
        contextStatus={contextStatus}
        planStatus={planStatus}
        jobStatus={jobStatus}
        acceptedSections={acceptedSections}
        qcStatus={qcStatus}
        readinessScore={readinessScore}
        primaryActionLabel={summaryState.label}
        nextActionText={summaryState.nextActionText}
        onPrimaryAction={summaryState.onAction}
      />

      <div className="grid gap-4 md:grid-cols-[280px_minmax(0,1fr)]">
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
      </div>

      {status ? <p className="text-sm text-emerald-600">{status}</p> : null}
      {error ? <p className="text-sm text-destructive">{error}</p> : null}
    </section>
  )
}
