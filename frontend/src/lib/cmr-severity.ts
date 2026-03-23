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
type AbnormalSeverityGrade = Exclude<SeverityGrade, 'normal'>

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
  let grade: AbnormalSeverityGrade = 'mild' // default

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
): AbnormalSeverityGrade {
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
): AbnormalSeverityGrade {
  if (breachedLimit === null || sd === null || sd <= 0) return 'mild'
  const deviation = Math.abs(measured - breachedLimit) / sd
  if (deviation <= 1) return 'mild'
  if (deviation <= 2) return 'moderate'
  return 'severe'
}

export function inferSeverityLabel(
  parameterKey: string,
  majorSection: string,
  _subSection: string,
): SeverityLabelType {
  const key = parameterKey.toLowerCase()
  const section = majorSection.toLowerCase()

  // EF parameters → impaired
  if (key.endsWith(' ef') || key === 'lv ef' || key === 'rv ef' || key === 'la ef' || key === 'ra ef') return 'impaired'

  // MAPSE / TAPSE → reduced (length excursion, not function)
  if (key === 'mapse' || key === 'tapse' || key.startsWith('mapse ') || key.startsWith('tapse ')) return 'reduced'

  // Backward flow → elevated
  if (key.includes('backward flow')) return 'elevated'

  // Forward flow / effective forward flow → elevated (direction-dependent)
  if (key.includes('forward flow')) return 'elevated'

  // MR/TR volume → elevated (volume alone doesn't determine severity — RF does)
  if (key.includes('volume (per heartbeat)') && (key.startsWith('mr') || key.startsWith('tr'))) return 'elevated'

  // Regurgitant fraction → regurgitation
  if (key.includes('regurgitant fraction')) return 'regurgitation'

  // Velocity → elevated
  if (key.includes('velocity')) return 'elevated'

  // Pressure gradient → elevated
  if (key.includes('pressure gradient')) return 'elevated'

  // Mass → hypertrophied
  if (key.includes('mass') && !key.includes('mass/')) return 'hypertrophied'

  // Wall thickness → thickened
  if (key.includes('wall thickness') || key.includes('peak thickness')) return 'thickened'

  // PCWP → elevated
  if (key === 'pcwp') return 'elevated'

  // Native T1, T2, ECV, T2* → elevated (direction-dependent resolution happens at runtime)
  if (key.startsWith('native t1') || key.startsWith('native t2') || key === 'ecv' || key.includes('t2*')) return 'elevated'

  // Stroke volume → elevated (direction-dependent)
  if (key.match(/\bsv\b/)) return 'elevated'

  // Atrial parameters → enlarged
  if (section.includes('atrium') || section.startsWith('la') || section.startsWith('ra')) {
    if (!key.endsWith(' ef')) return 'enlarged'
  }

  // Ventricular volumes (EDV, ESV) → dilated
  if (key.includes('edv') || key.includes('esv')) return 'dilated'

  // Ventricular diameters → dilated
  if (key.includes('diameter') && (section.includes('ventricle'))) return 'dilated'

  // Aorta / pulmonary artery → dilated (all parameters in these sections)
  if (section.includes('aorta') || section.includes('pulmonary artery')) return 'dilated'

  // Valve annulus diameters → dilated
  if (key.includes('annulus diameter')) return 'dilated'

  // CO / CI → elevated (direction-dependent) — word-boundary match to avoid false positives
  if (key.match(/\bco\b/) || key.match(/\bci\b/)) return 'elevated'

  return 'abnormal'
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
