import { useCallback, useEffect, useMemo, useState } from 'react'

import { Step1Panel } from '@/components/study-core/Step1Panel'
import { Step2Panel } from '@/components/study-core/Step2Panel'
import { Step3Panel } from '@/components/study-core/Step3Panel'
import { Step4Panel, type DraftCorrection } from '@/components/study-core/Step4Panel'
import { Step5Panel, type QcFix } from '@/components/study-core/Step5Panel'
import { StepContext, type ContextFormValues } from '@/components/study-core/StepContext'
import { StepDraftReview } from '@/components/study-core/StepDraftReview'
import { StepLinkQcExport } from '@/components/study-core/StepLinkQcExport'
import { StepPlan } from '@/components/study-core/StepPlan'
import { StepRun } from '@/components/study-core/StepRun'
import { StudyCoreStepper, type WizardStepItem } from '@/components/study-core/StudyCoreStepper'
import { Input } from '@/components/ui/input'
import { analyzePlan } from '@/lib/analyze-plan'
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
type RegisteredRunActions = { runWithRecommended: () => void; runAnyway: () => void }
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

function mergeBullets(existing: string[], additions: string[]): string[] {
  const seen = new Set(existing.map((bullet) => bullet.trim().toLowerCase()).filter(Boolean))
  const next = [...existing]
  for (const bullet of additions) {
    const trimmed = bullet.trim()
    if (!trimmed) {
      continue
    }
    const key = trimmed.toLowerCase()
    if (seen.has(key)) {
      continue
    }
    seen.add(key)
    next.push(trimmed)
  }
  return next
}

function applyCausalReplacements(text: string): { nextText: string; changed: boolean } {
  const nextText = text
    .replace(/\bcauses?\b/gi, 'is associated with')
    .replace(/\bcausal\b/gi, 'associative')
    .replace(/\bled to\b/gi, 'was associated with')
    .replace(/\bresulted in\b/gi, 'was associated with')
  return {
    nextText,
    changed: nextText !== text,
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
  const [runActions, setRunActions] = useState<RegisteredRunActions | null>(null)

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

  const applyPlanSectionPatch = useCallback(
    (section: string, bulletsToInsert: string[]) => {
      setPlan((current) => {
        if (!current) {
          return {
            sections: [{ name: section, bullets: mergeBullets([], bulletsToInsert) }],
          }
        }
        const existing = current.sections.find((item) => item.name === section)
        if (!existing) {
          return {
            sections: [...current.sections, { name: section, bullets: mergeBullets([], bulletsToInsert) }],
          }
        }
        return {
          sections: current.sections.map((item) =>
            item.name === section ? { ...item, bullets: mergeBullets(item.bullets, bulletsToInsert) } : item,
          ),
        }
      })
      setPlanStatus('built')
      setStatus(`${section.charAt(0).toUpperCase()}${section.slice(1)} updated with recommended bullets.`)
    },
    [setPlanStatus],
  )

  const planRecommendations = useMemo(
    () =>
      analyzePlan({
        objective: contextValues.researchObjective,
        plan,
        applySectionPatch: applyPlanSectionPatch,
      }),
    [applyPlanSectionPatch, contextValues.researchObjective, plan],
  )

  const draftCorrections = useMemo<DraftCorrection[]>(() => {
    const corrections: DraftCorrection[] = []
    const causalSectionName = ['discussion', 'results', 'introduction'].find((section) => {
      const sectionText = draftsBySection[section]
      if (!sectionText) {
        return false
      }
      return /\bcausal\b|\bcauses?\b|\bled to\b|\bresulted in\b/i.test(sectionText)
    })

    if (causalSectionName) {
      const original = draftsBySection[causalSectionName] ?? ''
      const replacement = applyCausalReplacements(original)
      if (replacement.changed) {
        corrections.push({
          title: 'Replace causal phrasing with associative phrasing.',
          rationale: 'Retrospective observational writing should avoid causal claims.',
          optionalPreview: `- ${original.slice(0, 180)}\n+ ${replacement.nextText.slice(0, 180)}`,
          applyPatch: () => {
            setDraftsBySection((current) => ({ ...current, [causalSectionName]: replacement.nextText }))
            setStatus(`Applied associative phrasing in ${causalSectionName}.`)
          },
        })
      }
    }

    const discussionText = draftsBySection.discussion ?? ''
    const resultsText = draftsBySection.results ?? ''
    const discussionNeedsAlignment =
      /\bsignificant\b|\bstrong effect\b|\bproved\b/i.test(discussionText) &&
      !/\bconfidence interval\b|\b95% ci\b|\bp-value\b|\bestimate\b/i.test(resultsText)
    if (discussionNeedsAlignment) {
      const alignmentSentence =
        'Interpretation should be restricted to associations supported by reported estimates and uncertainty.'
      corrections.push({
        title: 'Align Discussion claims with Results.',
        rationale: 'Discussion claims should reference the estimate and uncertainty reported in Results.',
        optionalPreview: `+ Discussion: ${alignmentSentence}`,
        applyPatch: () => {
          setDraftsBySection((current) => ({
            ...current,
            discussion: `${current.discussion ?? ''}\n\n${alignmentSentence}`.trim(),
          }))
          setStatus('Aligned Discussion claims to Results language.')
        },
      })
    }

    const missingLimitations = discussionText.trim() && !/\blimitation\b|\blimitations\b/i.test(discussionText)
    if (missingLimitations) {
      const limitationsParagraph =
        'Limitations: This retrospective observational design is susceptible to residual confounding, selection bias, and measurement error.'
      corrections.push({
        title: 'Insert missing limitations paragraph.',
        rationale: 'Discussion should explicitly state study limitations and their effect on interpretation.',
        optionalPreview: `+ Discussion: ${limitationsParagraph}`,
        applyPatch: () => {
          setDraftsBySection((current) => ({
            ...current,
            discussion: `${current.discussion ?? ''}\n\n${limitationsParagraph}`.trim(),
          }))
          setStatus('Inserted limitations paragraph in Discussion.')
        },
      })
    }

    return corrections.slice(0, 3)
  }, [draftsBySection])

  const qcFixes = useMemo<QcFix[]>(
    () => [
      {
        title: 'Standardize terminology',
        rationale: 'Use one consistent disease and design label throughout the manuscript.',
        optionalPreview: '+ Replace variant terms with standardized terminology.',
        applyPatch: () => {
          setDraftsBySection((current) => {
            const next: Record<string, string> = {}
            for (const [section, text] of Object.entries(current)) {
              let updated = text
              updated = updated.replace(/\bpulm\.?\s*hypertension\b/gi, 'pulmonary hypertension')
              if (/\bPH\b/.test(updated) && !/pulmonary hypertension \(PH\)/i.test(updated) && /pulmonary hypertension/i.test(updated)) {
                updated = updated.replace(/pulmonary hypertension/i, 'pulmonary hypertension (PH)')
              }
              next[section] = updated
            }
            return next
          })
          setStatus('Standardized terminology across draft sections.')
        },
      },
      {
        title: 'Fix missing abbreviations',
        rationale: 'Define abbreviations the first time they appear.',
        optionalPreview: '+ Add abbreviation definitions where needed.',
        applyPatch: () => {
          setDraftsBySection((current) => {
            const next: Record<string, string> = {}
            for (const [section, text] of Object.entries(current)) {
              const defs: string[] = []
              if (/\bCI\b/.test(text) && !/confidence interval \(CI\)/i.test(text)) {
                defs.push('confidence interval (CI)')
              }
              if (/\bOR\b/.test(text) && !/odds ratio \(OR\)/i.test(text)) {
                defs.push('odds ratio (OR)')
              }
              if (defs.length === 0 || /Abbreviations:/i.test(text)) {
                next[section] = text
                continue
              }
              next[section] = `${text}\n\nAbbreviations: ${defs.join('; ')}.`
            }
            return next
          })
          setStatus('Inserted missing abbreviation definitions.')
        },
      },
      {
        title: 'Adjust to journal style',
        rationale: 'Shift first-person phrasing to neutral scientific voice.',
        optionalPreview: '- We observed...\n+ This study observed...',
        applyPatch: () => {
          setDraftsBySection((current) => {
            const next: Record<string, string> = {}
            for (const [section, text] of Object.entries(current)) {
              let updated = text
              updated = updated.replace(/\bWe\b/g, 'This study')
              updated = updated.replace(/\bour\b/gi, 'the')
              updated = updated.replace(/!/g, '.')
              next[section] = updated
            }
            return next
          })
          setStatus('Adjusted draft language toward journal style.')
        },
      },
    ],
    [],
  )

  const onRunWithRecommended = () => {
    setRunRecommendations({
      conservativeWithLimitations: true,
      uncertaintyInResults: true,
      mechanisticAsHypothesis: true,
    })
    if (!runActions) {
      setError('Run controls are not ready yet.')
      return
    }
    runActions.runWithRecommended()
  }

  const onRunAnyway = () => {
    if (!runActions) {
      setError('Run controls are not ready yet.')
      return
    }
    runActions.runAnyway()
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
          onRegisterRunActions={setRunActions}
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
    if (currentStep === 2) {
      return <Step2Panel recommendations={planRecommendations} />
    }
    if (currentStep === 3) {
      return (
        <Step3Panel
          recommendations={runRecommendations}
          busy={jobStatus === 'running'}
          onApplyConservative={() =>
            setRunRecommendations((current) => ({
              ...current,
              conservativeWithLimitations: true,
            }))
          }
          onApplyUncertainty={() =>
            setRunRecommendations((current) => ({
              ...current,
              uncertaintyInResults: true,
            }))
          }
          onApplyMechanisticLabel={() =>
            setRunRecommendations((current) => ({
              ...current,
              mechanisticAsHypothesis: true,
            }))
          }
          onRunWithRecommended={onRunWithRecommended}
          onRunAnyway={onRunAnyway}
        />
      )
    }
    if (currentStep === 4) {
      return <Step4Panel corrections={draftCorrections} />
    }
    return <Step5Panel fixes={qcFixes} />
  }

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
            <p className="text-xs text-muted-foreground">
              Context {contextStatus === 'saved' ? '✓' : '✗'} | Plan {planStatus === 'built' ? '✓' : '✗'} | Draft{' '}
              {acceptedSections > 0 ? '✓' : '✗'} | QC {qcStatus === 'pass' ? '✓' : '✗'}
            </p>
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

      <div className="grid gap-4 xl:grid-cols-[280px_minmax(0,1fr)_320px]">
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

        <div key={`panel-${currentStep}`} className="wizard-step-transition">
          {renderRightPanel()}
        </div>
      </div>

      {status ? <p className="text-sm text-emerald-600">{status}</p> : null}
      {error ? <p className="text-sm text-destructive">{error}</p> : null}
    </section>
  )
}
