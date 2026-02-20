import { create } from 'zustand'
import type { OutlinePlanState } from '@/types/study-core'

export type WizardStep = 1 | 2 | 3 | 4 | 5
export type ContextStatus = 'empty' | 'saved'
export type PlanStatus = 'empty' | 'built'
export type JobStatus = 'idle' | 'running' | 'succeeded' | 'failed'
export type QcStatus = 'idle' | 'pass' | 'warn' | 'fail'
export type ContextReadinessFields = {
  projectTitle: string
  researchObjective: string
  primaryDataSource: string
  studyType: string
  primaryAnalyticalClaim: string
}
export type QcSeverityCounts = {
  high: number
  medium: number
  low: number
}

const DEFAULT_CONTEXT_READINESS_FIELDS: ContextReadinessFields = {
  projectTitle: '',
  researchObjective: '',
  primaryDataSource: '',
  studyType: '',
  primaryAnalyticalClaim: '',
}

const DEFAULT_QC_SEVERITY_COUNTS: QcSeverityCounts = {
  high: 0,
  medium: 0,
  low: 0,
}

type WizardStore = {
  currentStep: WizardStep
  contextStatus: ContextStatus
  planStatus: PlanStatus
  jobStatus: JobStatus
  acceptedSections: number
  qcStatus: QcStatus
  contextFields: ContextReadinessFields
  selectedSections: string[]
  outlinePlan: OutlinePlanState | null
  qcSeverityCounts: QcSeverityCounts
  devOverride: boolean
  setCurrentStep: (step: WizardStep) => void
  setContextStatus: (status: ContextStatus) => void
  setPlanStatus: (status: PlanStatus) => void
  setJobStatus: (status: JobStatus) => void
  setAcceptedSections: (count: number) => void
  setQcStatus: (status: QcStatus) => void
  setContextFields: (fields: ContextReadinessFields) => void
  setSelectedSections: (sections: string[]) => void
  setOutlinePlan: (plan: OutlinePlanState | null) => void
  setQcSeverityCounts: (counts: QcSeverityCounts) => void
  canNavigateToStep: (targetStep: WizardStep) => boolean
  resetWizard: () => void
}

function clampStep(step: number): WizardStep {
  if (step <= 1) {
    return 1
  }
  if (step >= 5) {
    return 5
  }
  return step as WizardStep
}

export const useStudyCoreWizardStore = create<WizardStore>((set, get) => ({
  currentStep: 1,
  contextStatus: 'empty',
  planStatus: 'empty',
  jobStatus: 'idle',
  acceptedSections: 0,
  qcStatus: 'idle',
  contextFields: DEFAULT_CONTEXT_READINESS_FIELDS,
  selectedSections: ['introduction', 'methods', 'results', 'discussion'],
  outlinePlan: null,
  qcSeverityCounts: DEFAULT_QC_SEVERITY_COUNTS,
  devOverride: import.meta.env.DEV,
  setCurrentStep: (step) => set({ currentStep: clampStep(step) }),
  setContextStatus: (status) => set({ contextStatus: status }),
  setPlanStatus: (status) => set({ planStatus: status }),
  setJobStatus: (status) => set({ jobStatus: status }),
  setAcceptedSections: (count) => set({ acceptedSections: Math.max(0, count) }),
  setQcStatus: (status) => set({ qcStatus: status }),
  setContextFields: (fields) => set({ contextFields: { ...fields } }),
  setSelectedSections: (sections) => set({ selectedSections: [...sections] }),
  setOutlinePlan: (plan) => set({ outlinePlan: plan }),
  setQcSeverityCounts: (counts) =>
    set({
      qcSeverityCounts: {
        high: Math.max(0, counts.high),
        medium: Math.max(0, counts.medium),
        low: Math.max(0, counts.low),
      },
    }),
  canNavigateToStep: (targetStep) => {
    const state = get()
    if (state.devOverride) {
      return true
    }
    if (targetStep <= state.currentStep) {
      return true
    }
    if (targetStep === 2) {
      return state.contextStatus === 'saved'
    }
    if (targetStep === 3) {
      return state.contextStatus === 'saved' && state.planStatus === 'built'
    }
    if (targetStep === 4) {
      return (
        state.contextStatus === 'saved' &&
        state.planStatus === 'built' &&
        state.jobStatus === 'succeeded'
      )
    }
    if (targetStep === 5) {
      return (
        state.contextStatus === 'saved' &&
        state.planStatus === 'built' &&
        state.jobStatus === 'succeeded' &&
        state.acceptedSections > 0
      )
    }
    return false
  },
  resetWizard: () =>
    set({
      currentStep: 1,
      contextStatus: 'empty',
      planStatus: 'empty',
      jobStatus: 'idle',
      acceptedSections: 0,
      qcStatus: 'idle',
      contextFields: DEFAULT_CONTEXT_READINESS_FIELDS,
      selectedSections: ['introduction', 'methods', 'results', 'discussion'],
      outlinePlan: null,
      qcSeverityCounts: DEFAULT_QC_SEVERITY_COUNTS,
    }),
}))
