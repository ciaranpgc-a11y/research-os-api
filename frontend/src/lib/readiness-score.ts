import type {
  ContextReadinessFields,
  PlanStatus,
  QcSeverityCounts,
  QcStatus,
} from '@/store/use-study-core-wizard-store'

const CORE_SECTIONS = ['introduction', 'methods', 'results', 'discussion']
const REQUIRED_CONTEXT_FIELDS: Array<keyof ContextReadinessFields> = [
  'projectTitle',
  'researchObjective',
  'studyArchitecture',
  'interpretationMode',
]

const SCORE_MAX = {
  context: 15,
  plan: 15,
  draft: 10,
  qc: 25,
  statistical: 15,
  anchoring: 10,
} as const

const QC_PENALTIES = {
  high: 8,
  medium: 3,
  low: 1,
} as const

const ANALYSIS_SIGNAL_KEYWORDS = {
  model: ['regression', 'cox', 'logistic', 'linear', 'mixed', 'anova', 'survival', 'bayesian', 'propensity', 'poisson', 'hazard'],
  adjustment: ['adjusted', 'adjustment', 'multivariable', 'multivariate', 'covariate', 'stratified', 'confound'],
  validation: ['bootstrap', 'cross-validation', 'cross validation', 'validation', 'sensitivity', 'robustness', 'holdout'],
  estimates: ['hazard ratio', 'odds ratio', 'risk ratio', 'confidence interval', 'ci', 'p-value', 'p value'],
} as const

export type ReadinessScoreState = {
  contextFields: ContextReadinessFields
  planStatus: PlanStatus
  selectedSections: string[]
  acceptedSections: number
  qcStatus: QcStatus
  qcSeverityCounts: QcSeverityCounts
}

export type ReadinessScore = {
  total: number
  breakdown: {
    context: number
    plan: number
    qc: number
    draft: number
    statistical: number
    anchoring: number
  }
  status: 'Ready' | 'Moderate' | 'Fragile' | 'Not Ready'
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

function containsAny(value: string, keywords: readonly string[]): boolean {
  return keywords.some((keyword) => value.includes(keyword))
}

function computeContextScore(fields: ContextReadinessFields): number {
  const missingFields = REQUIRED_CONTEXT_FIELDS.reduce((count, key) => {
    return fields[key].trim() ? count : count + 1
  }, 0)
  return clamp(SCORE_MAX.context - missingFields * 3, 0, SCORE_MAX.context)
}

function computePlanScore(planStatus: PlanStatus, selectedSections: string[]): number {
  if (planStatus !== 'built') {
    return 0
  }
  const sectionSet = new Set(selectedSections.map((section) => section.toLowerCase()))
  const coreCount = CORE_SECTIONS.filter((section) => sectionSet.has(section)).length
  return clamp(Math.round((coreCount / CORE_SECTIONS.length) * SCORE_MAX.plan), 0, SCORE_MAX.plan)
}

function computeDraftScore(acceptedSections: number): number {
  if (acceptedSections <= 0) {
    return 0
  }
  const clampedAccepted = clamp(acceptedSections, 0, CORE_SECTIONS.length)
  return clamp(Math.round((clampedAccepted / CORE_SECTIONS.length) * SCORE_MAX.draft), 0, SCORE_MAX.draft)
}

function computeQcScore(qcStatus: QcStatus, qcSeverityCounts: QcSeverityCounts): number {
  if (qcStatus === 'idle') {
    return 0
  }
  const deduction =
    qcSeverityCounts.high * QC_PENALTIES.high +
    qcSeverityCounts.medium * QC_PENALTIES.medium +
    qcSeverityCounts.low * QC_PENALTIES.low
  return clamp(SCORE_MAX.qc - deduction, 0, SCORE_MAX.qc)
}

function computeStatisticalScore(interpretationMode: string): number {
  const normalised = interpretationMode.trim().toLowerCase()
  if (!normalised) {
    return 0
  }

  let score = 0
  if (containsAny(normalised, ANALYSIS_SIGNAL_KEYWORDS.model)) {
    score += 6
  }
  if (containsAny(normalised, ANALYSIS_SIGNAL_KEYWORDS.adjustment)) {
    score += 4
  }
  if (containsAny(normalised, ANALYSIS_SIGNAL_KEYWORDS.validation)) {
    score += 3
  }
  if (containsAny(normalised, ANALYSIS_SIGNAL_KEYWORDS.estimates)) {
    score += 2
  }

  return clamp(score, 0, SCORE_MAX.statistical)
}

export function computeReadinessScore(state: ReadinessScoreState): ReadinessScore {
  const breakdown = {
    context: computeContextScore(state.contextFields),
    plan: computePlanScore(state.planStatus, state.selectedSections),
    qc: computeQcScore(state.qcStatus, state.qcSeverityCounts),
    draft: computeDraftScore(state.acceptedSections),
    statistical: computeStatisticalScore(state.contextFields.interpretationMode),
    anchoring: SCORE_MAX.anchoring,
  }

  const total = breakdown.context + breakdown.plan + breakdown.qc + breakdown.draft + breakdown.statistical + breakdown.anchoring

  let status: ReadinessScore['status'] = 'Not Ready'
  if (total >= 72) {
    status = 'Ready'
  } else if (total >= 54) {
    status = 'Moderate'
  } else if (total >= 36) {
    status = 'Fragile'
  }

  return {
    total,
    breakdown,
    status,
  }
}
