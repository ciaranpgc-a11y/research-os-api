import { isAbnormal } from './cmr-chart-scaling'

export type SeverityLabelType =
  | 'impaired' | 'dilated' | 'enlarged' | 'hypertrophied' | 'thickened'
  | 'stenosis' | 'regurgitation' | 'elevated' | 'reduced' | 'abnormal'

export type SeverityThresholds = {
  mild: number | null
  moderate: number | null
  severe: number | null
}

export type SeverityLabelOverride = {
  mild: string | null
  moderate: string | null
  severe: string | null
}

export type SeverityGrade = 'normal' | 'mild' | 'moderate' | 'severe'

export type SeverityResult = {
  grade: SeverityGrade
  label: string
}

// Grammar: some labels use adverb form ("Mildly impaired"), others use adjective form ("Mild stenosis")
const LABEL_GRAMMAR: Record<SeverityLabelType, { mild: string; moderate: string; severe: string }> = {
  impaired:      { mild: 'Mildly impaired',      moderate: 'Moderately impaired',      severe: 'Severely impaired' },
  dilated:       { mild: 'Mildly dilated',        moderate: 'Moderately dilated',       severe: 'Severely dilated' },
  enlarged:      { mild: 'Mildly enlarged',       moderate: 'Moderately enlarged',      severe: 'Severely enlarged' },
  hypertrophied: { mild: 'Mildly hypertrophied',  moderate: 'Moderately hypertrophied', severe: 'Severely hypertrophied' },
  thickened:     { mild: 'Mildly thickened',      moderate: 'Moderately thickened',     severe: 'Severely thickened' },
  stenosis:      { mild: 'Mild stenosis',         moderate: 'Moderate stenosis',        severe: 'Severe stenosis' },
  regurgitation: { mild: 'Mild regurgitation',    moderate: 'Moderate regurgitation',   severe: 'Severe regurgitation' },
  elevated:      { mild: 'Mildly elevated',       moderate: 'Moderately elevated',      severe: 'Severely elevated' },
  reduced:       { mild: 'Mildly reduced',        moderate: 'Moderately reduced',       severe: 'Severely reduced' },
  abnormal:      { mild: 'Mildly abnormal',       moderate: 'Moderately abnormal',      severe: 'Severely abnormal' },
}

export function computeSeverity(
  measured: number,
  ll: number | null,
  ul: number | null,
  sd: number | null,
  abnormalDirection: string,
  severityLabel: SeverityLabelType | undefined | null,
  severityThresholds: SeverityThresholds | undefined | null,
  severityLabelOverride: SeverityLabelOverride | undefined | null,
): SeverityResult {
  const NORMAL: SeverityResult = { grade: 'normal', label: 'Normal' }

  // Gate: must be abnormal by LL/UL rules first
  if (!isAbnormal(measured, ll, ul, abnormalDirection)) return NORMAL

  // Determine breach direction
  let breachHigh = false
  if (abnormalDirection === 'high') breachHigh = true
  else if (abnormalDirection === 'low') breachHigh = false
  else if (abnormalDirection === 'both') {
    breachHigh = ul !== null && measured > ul
  }

  const resolvedLabel: SeverityLabelType = severityLabel ?? 'abnormal'
  const thresholds = severityThresholds ?? { mild: null, moderate: null, severe: null }
  const overrides = severityLabelOverride ?? { mild: null, moderate: null, severe: null }

  // Compute grade
  let grade: SeverityGrade = 'mild' // default

  if (thresholds.mild !== null) {
    // Absolute thresholds path
    grade = gradeFromThresholds(measured, thresholds, breachHigh, sd, ll, ul)
  } else {
    // Pure SD fallback
    grade = gradeFromSD(measured, breachHigh ? ul : ll, sd)
  }

  // Build label
  const labelType = resolveDirectionalLabel(resolvedLabel, breachHigh, abnormalDirection)
  const grammar = LABEL_GRAMMAR[labelType]
  const label = overrides[grade] ?? grammar[grade]

  return { grade, label }
}

function gradeFromThresholds(
  measured: number,
  thresholds: SeverityThresholds,
  breachHigh: boolean,
  sd: number | null,
  ll: number | null,
  ul: number | null,
): SeverityGrade {
  const { mild, moderate, severe } = thresholds

  if (breachHigh) {
    // High direction: mild < moderate < severe (ascending)
    if (mild !== null && measured <= mild) return 'mild'
    if (moderate !== null && measured <= moderate) return 'moderate'
    if (moderate !== null) return 'severe' // past moderate threshold
    if (severe !== null && measured > severe) return 'severe'
    // Only mild threshold set, value is past it → SD fallback for deeper grades
    return gradeFromSD(measured, ul, sd)
  } else {
    // Low direction: mild > moderate > severe (descending)
    if (mild !== null && measured >= mild) return 'mild'
    if (moderate !== null && measured >= moderate) return 'moderate'
    if (moderate !== null) return 'severe' // past moderate threshold
    if (severe !== null && measured < severe) return 'severe'
    // Only mild threshold set, value is past it → SD fallback for deeper grades
    return gradeFromSD(measured, ll, sd)
  }
}

function gradeFromSD(
  measured: number,
  breachedLimit: number | null,
  sd: number | null,
): SeverityGrade {
  if (breachedLimit === null || sd === null || sd <= 0) return 'mild'
  const deviation = Math.abs(measured - breachedLimit) / sd
  if (deviation <= 1) return 'mild'
  if (deviation <= 2) return 'moderate'
  return 'severe'
}

function resolveDirectionalLabel(
  label: SeverityLabelType,
  breachHigh: boolean,
  abnormalDirection: string,
): SeverityLabelType {
  // For "both" direction parameters, pick direction-specific label
  if (abnormalDirection === 'both') {
    if (label === 'elevated' || label === 'reduced') {
      return breachHigh ? 'elevated' : 'reduced'
    }
  }
  return label
}
