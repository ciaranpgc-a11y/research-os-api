import { useEffect, useMemo, useState } from 'react'

import { RunSummaryBar } from '@/components/study-core/RunSummaryBar'
import { RunEntryPanel } from '@/components/study-core/RunEntryPanel'
import { StepContext, type ContextFormValues } from '@/components/study-core/StepContext'
import { StepDraftReview } from '@/components/study-core/StepDraftReview'
import { StepLinkQcExport } from '@/components/study-core/StepLinkQcExport'
import { StepPlan } from '@/components/study-core/StepPlan'
import { StepRun } from '@/components/study-core/StepRun'
import { StudyCoreStepper, type WizardStepItem } from '@/components/study-core/StudyCoreStepper'
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

const CONTEXT_KEY = 'aawe-run-context'
const CORE_SECTIONS = ['introduction', 'methods', 'results', 'discussion']

function buildGenerationBrief(values: ContextFormValues, sections: string[]): string {
  const lines = [
    values.researchObjective.trim() ? `Objective: ${values.researchObjective.trim()}` : '',
    values.studyType.trim() ? `Study type: ${values.studyType.trim()}` : '',
    values.primaryDataSource.trim() ? `Primary data source: ${values.primaryDataSource.trim()}` : '',
    values.primaryAnalyticalClaim.trim() ? `Primary analytical claim: ${values.primaryAnalyticalClaim.trim()}` : '',
    sections.length > 0
      ? `Priority sections: ${sections
          .map((section) => section.charAt(0).toUpperCase() + section.slice(1))
          .join(', ')}`
      : '',
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
  { id: 1, title: 'Research Frame', helper: 'Define the core frame for a new manuscript run.' },
  { id: 2, title: 'Plan Sections', helper: 'Choose sections and refine an outline.' },
  { id: 3, title: 'Run Generation', helper: 'Estimate cost and run generation.' },
  { id: 4, title: 'Draft Review', helper: 'Accept or regenerate section drafts.' },
  { id: 5, title: 'Link + QC + Export', helper: 'Link evidence, run QC, then export.' },
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
    primaryDataSource: '',
    studyType: 'Observational',
    primaryAnalyticalClaim: '',
  })

  const [selectedSections, setSelectedSections] = useState<string[]>(CORE_SECTIONS)
  const [generationBrief, setGenerationBrief] = useState(buildGenerationBrief(contextValues, CORE_SECTIONS))
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
      study_type: contextValues.studyType,
      research_objective: contextValues.researchObjective,
      primary_data_source: contextValues.primaryDataSource,
      primary_analytical_claim: contextValues.primaryAnalyticalClaim,
      analysis_summary: contextValues.primaryAnalyticalClaim,
      disease_focus: '',
      population: '',
      primary_outcome: '',
      manuscript_goal: 'generate_full_manuscript',
      data_source: contextValues.primaryDataSource || 'manual_entry',
    }),
    [
      contextValues.primaryAnalyticalClaim,
      contextValues.primaryDataSource,
      contextValues.researchObjective,
      contextValues.studyType,
    ],
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
    () => buildGenerationBrief(contextValues, selectedSections),
    [contextValues, selectedSections],
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
    setContextFields(contextValues)
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

  const applyContextPayload = (
    payload: {
      projectId: string
      manuscriptId: string
      recommendedSections: string[]
    },
    options?: {
      advanceToPlan?: boolean
    },
  ) => {
    const shouldAdvanceToPlan = options?.advanceToPlan ?? true
    setRunContext({ projectId: payload.projectId, manuscriptId: payload.manuscriptId })
    const nextSections = payload.recommendedSections.length > 0 ? payload.recommendedSections : selectedSections
    if (payload.recommendedSections.length > 0) {
      setSelectedSections(payload.recommendedSections)
    }
    setGenerationBrief(buildGenerationBrief(contextValues, nextSections))
    setGenerationBriefTouched(false)
    setContextStatus('saved')
    if (shouldAdvanceToPlan) {
      setCurrentStep(2)
    }
  }

  const markDraftSeededFlowReady = (sections: string[]) => {
    setSelectedSections(sections)
    setPlan((current) => current ?? { sections: sections.map((section) => ({ name: section, bullets: [] })) })
    setPlanStatus('built')
    setJobStatus('succeeded')
  }

  const onPlanChange = (nextPlan: OutlinePlanState | null) => {
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
        nextActionText: 'Complete Step 1 to initialise a project and manuscript run context.',
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
      nextActionText: 'QC has warnings or failures. Open Step 5 to review checks and choose export mode.',
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
          onContextSaved={(payload) => applyContextPayload(payload, { advanceToPlan: true })}
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

  return (
    <section className="space-y-4">
      <header className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">Study Core - Run Wizard</h1>
        <p className="text-sm text-muted-foreground">Follow a guided 5-step workflow to move from setup through export with progressive disclosure.</p>
      </header>

      <RunEntryPanel
        runContext={runContext}
        targetJournal={targetJournal}
        contextValues={contextValues}
        onOpenStepOne={() => setCurrentStep(1)}
        onContextEstablished={(payload) => {
          applyContextPayload(payload, { advanceToPlan: false })
        }}
        onDraftImported={({ sections, draftsBySection: importedDrafts }) => {
          setDraftsBySection((current) => ({ ...current, ...importedDrafts }))
          markDraftSeededFlowReady(sections)
          setCurrentStep(4)
        }}
        onRefineLoaded={({ section, text }) => {
          setDraftsBySection((current) => ({ ...current, [section]: text }))
          markDraftSeededFlowReady([section])
          setCurrentStep(4)
        }}
        onStatus={setStatus}
        onError={setError}
      />

      <RunSummaryBar
        contextStatus={contextStatus}
        planStatus={planStatus}
        jobStatus={jobStatus}
        acceptedSections={acceptedSections}
        qcStatus={qcStatus}
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
