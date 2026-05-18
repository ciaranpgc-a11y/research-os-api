import type { CmrCanonicalParam } from '@/lib/cmr-api'
import { computeSeverity, inferSeverityLabel, type SeverityGrade } from '@/lib/cmr-severity'
import {
  type RegurgitationSeverity,
  REGURGITATION_SEVERITY_LABELS,
  rfToRegurgitationSeverity,
} from '@/lib/cmr-valve-severity'

export type PhSummaryMeasurementKey =
  | 'rvEdvi'
  | 'rvEsvi'
  | 'rvEf'
  | 'tapse'
  | 'rvMassIndex'
  | 'rvSvi'
  | 'rvCi'
  | 'rvLvVolumeRatio'
  | 'raMaxVolumeIndex'
  | 'laMaxVolumeIndex'
  | 'lvEf'
  | 'mainPaDiameter'
  | 'paDistensibility'
  | 'pcwp'
  | 'mrap'
  | 'trRegurgitantFraction'
  | 'mrRegurgitantFraction'
  | 'pericardialEffusionSize'
  | 'vortexDurationPercent'
  | 'rpaPercent'
  | 'lpaPercent'

export type PhSummaryMeasurements = Partial<Record<PhSummaryMeasurementKey, number | null>>

export type PhSeptalFlattening = 'none' | 'systolic' | 'diastolic' | 'both'
export type PhSeptalMotion = 'normal' | 'paradoxical' | 'dyskinetic' | 'not-assessed'
export type PhInteratrialBowing = 'none' | 'toward-la' | 'toward-ra' | 'bidirectional' | 'not-assessed'
export type PhPericardialEffusion = 'none' | 'small' | 'moderate' | 'large'
export type PhVenaCavaState = 'normal' | 'dilated' | 'not-assessed'
export type PhPresenceState = 'not-assessed' | 'absent' | 'present'
export type PhAdvancedSeverity = 'mild' | 'moderate' | 'marked'
export type PhVortexLocation = 'not-specified' | 'main-pa' | 'main-pa-rpa' | 'main-pa-lpa' | 'branch-only' | 'diffuse-proximal-pa'
export type PhHelicalFlowLocation = 'not-specified' | 'rvot-mpa' | 'central-mpa' | 'rpa' | 'lpa' | 'diffuse-proximal-pa'
export type PhRegurgitationChoice = RegurgitationSeverity | 'trace'

export type PhSummaryChoices = {
  septalFlattening: PhSeptalFlattening
  septalMotion: PhSeptalMotion
  interatrialSeptalBowing: PhInteratrialBowing
  pericardialEffusion: PhPericardialEffusion
  venaCava: PhVenaCavaState
  trSeverity: PhRegurgitationChoice
  mrSeverity: PhRegurgitationChoice
  vortexFormation: PhPresenceState
  vortexSeverity: PhAdvancedSeverity | null
  vortexLocation: PhVortexLocation
  helicity: PhPresenceState
  helicitySeverity: PhAdvancedSeverity | null
  helicityLocation: PhHelicalFlowLocation
}

export type PhSummaryProbability = 'low' | 'intermediate' | 'high'
export type PhSummarySeverity = 'mild' | 'moderate' | 'severe'
export type PhSummaryAdaptation = 'compensated' | 'stressed' | 'maladaptive' | 'severe-uncoupling'

export type PhSummaryPhenotype =
  | 'no-definite-ph'
  | 'early-pressure-overload'
  | 'pressure-overload-pulmonary-vascular'
  | 'rv-pa-uncoupling'
  | 'post-capillary-or-mixed'

type FindingGrade = SeverityGrade | 'unknown'

type ClassifiedMeasurement = {
  value: number | null
  grade: FindingGrade
  points: number
}

export type PhSummaryData = {
  deterministicText: string
  probability: PhSummaryProbability
  probabilityLabel: string
  adaptation: PhSummaryAdaptation | null
  adaptationLabel: string | null
  severity: PhSummarySeverity | null
  severityLabel: string | null
  phenotype: PhSummaryPhenotype
  phenotypeLabel: string
  domainScores: {
    rvRemodelling: number
    rvMaladaptation: number
    pressureOverload: number
    pulmonaryVascular: number
    leftHeart: number
  }
  keyFindings: string[]
  leftHeartFindings: string[]
  contextualFindings: string[]
  dominantLeftHeartContextFindings: string[]
  dominantRightHeartSupportFindings: string[]
  rvRemodellingFindings: string[]
  rvMaladaptationFindings: string[]
  pressureOverloadFindings: string[]
  pulmonaryVascularFindings: string[]
  rvSize: string | null
  rvEndSystolicVolumeIndex: string | null
  rvFunction: string | null
  tapse: string | null
  rvMassIndex: string | null
  rvStrokeVolumeIndex: string | null
  rvCardiacIndex: string | null
  rvLvRatio: string | null
  raSize: string | null
  laSize: string | null
  lvFunction: string | null
  mainPa: string | null
  paDistensibility: string | null
  estimatedPcwp: string | null
  estimatedRap: string | null
  septalFlattening: PhSeptalFlattening
  septalMotion: PhSeptalMotion
  interatrialSeptalBowing: PhInteratrialBowing
  pericardialEffusion: PhPericardialEffusion
  pericardialEffusionSize: number | null
  venaCava: PhVenaCavaState
  trSeverity: RegurgitationSeverity | null
  trSeverityLabel: string | null
  mrSeverity: RegurgitationSeverity | null
  mrSeverityLabel: string | null
  vortexFormation: PhPresenceState
  vortexSeverity: PhAdvancedSeverity | null
  vortexLocation: PhVortexLocation
  vortexDurationPercent: number | null
  helicity: PhPresenceState
  helicitySeverity: PhAdvancedSeverity | null
  helicityLocation: PhHelicalFlowLocation
  rpaPercent: number | null
  lpaPercent: number | null
}

const CANONICAL_PARAM_KEYS: Partial<Record<PhSummaryMeasurementKey, string>> = {
  rvEdvi: 'RV EDV (i)',
  rvEsvi: 'RV ESV (i)',
  rvEf: 'RV EF',
  tapse: 'TAPSE',
  rvMassIndex: 'RV mass (i)',
  rvSvi: 'RV SV (i)',
  rvCi: 'RV CI',
  raMaxVolumeIndex: 'RA max volume (i)',
  laMaxVolumeIndex: 'LA max volume (i)',
  lvEf: 'LV EF',
  mainPaDiameter: 'MPA systolic diameter',
  paDistensibility: 'MPA distension',
  pcwp: 'PCWP',
  mrap: 'mRAP',
  trRegurgitantFraction: 'TR regurgitant fraction',
  mrRegurgitantFraction: 'MR regurgitant fraction',
}

const GRADE_RANK: Record<FindingGrade, number> = {
  unknown: 0,
  normal: 0,
  mild: 1,
  moderate: 2,
  severe: 3,
}

function formatNumber(value: number, decimals: number = 0): string {
  return new Intl.NumberFormat('en-GB', {
    minimumFractionDigits: 0,
    maximumFractionDigits: decimals,
  }).format(value)
}

function joinList(items: string[]): string {
  if (items.length === 0) return ''
  if (items.length === 1) return items[0]
  if (items.length === 2) return `${items[0]} and ${items[1]}`
  return `${items.slice(0, -1).join(', ')}, and ${items[items.length - 1]}`
}

function upperFirst(text: string): string {
  return text ? `${text.charAt(0).toUpperCase()}${text.slice(1)}` : text
}

function takePriorityFindings(groups: string[][], limit: number): string[] {
  const selected: string[] = []
  for (const group of groups) {
    for (const item of group) {
      if (!item || selected.includes(item)) continue
      selected.push(item)
      if (selected.length >= limit) return selected
    }
  }
  return selected
}

function buildSupportingSentence(items: string[], label: string): string {
  if (items.length === 0) return ''
  if (items.length === 1) return `${label} ${items[0]}.`
  return `${label} ${joinList(items)}.`
}

function dedupeFindings(items: string[]): string[] {
  return items.filter((item, index) => item && items.indexOf(item) === index)
}

function summarizeContextualFindings(contextualFindings: string[]): string[] {
  return contextualFindings.filter((item) => !item.startsWith('branch pulmonary flow split'))
}

function atLeast(grade: FindingGrade, minimum: Exclude<FindingGrade, 'unknown' | 'normal'>): boolean {
  return GRADE_RANK[grade] >= GRADE_RANK[minimum]
}

function gradeAdverb(grade: FindingGrade): string {
  switch (grade) {
    case 'mild':
      return 'mildly'
    case 'moderate':
      return 'moderately'
    case 'severe':
      return 'severely'
    default:
      return ''
  }
}

function buildValueSuffix(
  value: number | null | undefined,
  metricLabel: string,
  unit: string,
  grade: FindingGrade,
  decimals: number = 0,
  includeFrom: Exclude<FindingGrade, 'unknown' | 'normal'> = 'moderate',
): string {
  if (value == null || !atLeast(grade, includeFrom)) return ''
  return ` (${metricLabel} ${formatNumber(value, decimals)} ${unit})`
}

function classifyCanonicalMeasurement(
  value: number | null | undefined,
  parameterKey: keyof typeof CANONICAL_PARAM_KEYS,
  canonicalLookup: Map<string, CmrCanonicalParam>,
): ClassifiedMeasurement {
  if (value == null) {
    return { value: null, grade: 'unknown', points: 0 }
  }
  const canonicalKey = CANONICAL_PARAM_KEYS[parameterKey]
  const canonical = canonicalKey ? canonicalLookup.get(canonicalKey) ?? null : null
  if (!canonical) {
    return { value, grade: 'unknown', points: 0 }
  }
  const severity = computeSeverity(
    value,
    canonical.ll,
    canonical.ul,
    canonical.sd,
    canonical.abnormal_direction,
    inferSeverityLabel(canonical.parameter_key, canonical.major_section, canonical.sub_section),
    canonical.severity_thresholds ?? null,
    canonical.severity_label_override ?? null,
  )
  return {
    value,
    grade: severity.grade,
    points: GRADE_RANK[severity.grade],
  }
}

function classifyRvLvRatio(value: number | null | undefined): ClassifiedMeasurement {
  if (value == null) return { value: null, grade: 'unknown', points: 0 }
  if (value <= 1.0) return { value, grade: 'normal', points: 0 }
  if (value <= 1.2) return { value, grade: 'mild', points: 1 }
  if (value <= 1.5) return { value, grade: 'moderate', points: 2 }
  return { value, grade: 'severe', points: 3 }
}

function classifyEstimatedPcwp(value: number | null | undefined): ClassifiedMeasurement {
  if (value == null) return { value: null, grade: 'unknown', points: 0 }
  if (value <= 12) return { value, grade: 'normal', points: 0 }
  if (value <= 15) return { value, grade: 'mild', points: 1 }
  if (value <= 20) return { value, grade: 'moderate', points: 2 }
  return { value, grade: 'severe', points: 3 }
}

function classifyEstimatedRap(value: number | null | undefined): ClassifiedMeasurement {
  if (value == null) return { value: null, grade: 'unknown', points: 0 }
  if (value <= 8) return { value, grade: 'normal', points: 0 }
  if (value <= 12) return { value, grade: 'mild', points: 1 }
  if (value <= 15) return { value, grade: 'moderate', points: 2 }
  return { value, grade: 'severe', points: 3 }
}

function classifyClinicalLvef(value: number | null | undefined): ClassifiedMeasurement {
  if (value == null) return { value: null, grade: 'unknown', points: 0 }
  if (value >= 55) return { value, grade: 'normal', points: 0 }
  if (value >= 45) return { value, grade: 'mild', points: 1 }
  if (value >= 35) return { value, grade: 'moderate', points: 2 }
  return { value, grade: 'severe', points: 3 }
}

type PhEscRiskBand = 'low' | 'intermediate' | 'high' | 'unknown'

type PhEscRisk = {
  band: PhEscRiskBand
  points: number
}

function classifyEscLowThreshold(
  value: number | null | undefined,
  lowRiskFloor: number,
  highRiskFloor: number,
): PhEscRisk {
  if (value == null) return { band: 'unknown', points: 0 }
  if (value >= lowRiskFloor) return { band: 'low', points: 0 }
  if (value >= highRiskFloor) return { band: 'intermediate', points: 1 }
  return { band: 'high', points: 2 }
}

function classifyEscHighThreshold(
  value: number | null | undefined,
  lowRiskCeiling: number,
  highRiskCeiling: number,
): PhEscRisk {
  if (value == null) return { band: 'unknown', points: 0 }
  if (value < lowRiskCeiling) return { band: 'low', points: 0 }
  if (value <= highRiskCeiling) return { band: 'intermediate', points: 1 }
  return { band: 'high', points: 2 }
}

function classifyPhRvefRisk(value: number | null | undefined): PhEscRisk {
  return classifyEscLowThreshold(value, 55, 37)
}

function classifyPhRvSviRisk(value: number | null | undefined): PhEscRisk {
  return classifyEscLowThreshold(value, 40, 26)
}

function classifyPhRvEsviRisk(value: number | null | undefined): PhEscRisk {
  return classifyEscHighThreshold(value, 42, 54)
}

function countTrue(items: boolean[]): number {
  return items.filter(Boolean).length
}

function mapAdaptationToLegacySeverity(adaptation: PhSummaryAdaptation | null): PhSummarySeverity | null {
  switch (adaptation) {
    case 'compensated':
    case 'stressed':
      return 'mild'
    case 'maladaptive':
      return 'moderate'
    case 'severe-uncoupling':
      return 'severe'
    default:
      return null
  }
}

function buildAdaptationLabel(adaptation: PhSummaryAdaptation | null): string | null {
  switch (adaptation) {
    case 'compensated':
      return 'Compensated RV response'
    case 'stressed':
      return 'Stressed RV response'
    case 'maladaptive':
      return 'Maladaptive RV response'
    case 'severe-uncoupling':
      return 'Severe RV-PA uncoupling'
    default:
      return null
  }
}

function buildDilatedPhrase(
  classified: ClassifiedMeasurement,
  anatomy: string,
  metricLabel: string,
  unit: string,
  decimals: number = 0,
): string | null {
  if (!atLeast(classified.grade, 'mild')) return null
  return `${gradeAdverb(classified.grade)} dilated ${anatomy}${buildValueSuffix(classified.value, metricLabel, unit, classified.grade, decimals)}`
}

function buildEnlargedPhrase(
  classified: ClassifiedMeasurement,
  anatomy: string,
  metricLabel: string,
  unit: string,
  decimals: number = 0,
): string | null {
  if (!atLeast(classified.grade, 'mild')) return null
  return `${gradeAdverb(classified.grade)} enlarged ${anatomy}${buildValueSuffix(classified.value, metricLabel, unit, classified.grade, decimals)}`
}

function buildImpairedFunctionPhrase(
  classified: ClassifiedMeasurement,
  anatomy: string,
  metricLabel: string,
  unit: string,
  decimals: number = 0,
): string | null {
  if (!atLeast(classified.grade, 'mild')) return null
  return `${gradeAdverb(classified.grade)} impaired ${anatomy} systolic function${buildValueSuffix(classified.value, metricLabel, unit, classified.grade, decimals)}`
}

function buildReducedPhrase(
  classified: ClassifiedMeasurement,
  label: string,
  metricLabel: string,
  unit: string,
  decimals: number = 0,
): string | null {
  if (!atLeast(classified.grade, 'mild')) return null
  const qualifier = classified.grade === 'severe' ? 'markedly' : gradeAdverb(classified.grade)
  return `${qualifier} reduced ${label}${buildValueSuffix(classified.value, metricLabel, unit, classified.grade, decimals)}`
}

function buildIncreasedPhrase(
  classified: ClassifiedMeasurement,
  label: string,
  metricLabel: string,
  unit: string,
  decimals: number = 0,
): string | null {
  if (!atLeast(classified.grade, 'mild')) return null
  return `${gradeAdverb(classified.grade)} increased ${label}${buildValueSuffix(classified.value, metricLabel, unit, classified.grade, decimals)}`
}

function buildPcwpPhrase(classified: ClassifiedMeasurement): string | null {
  if (!atLeast(classified.grade, 'moderate')) return null
  return 'elevated estimated left-sided filling pressure'
}

function buildRapPhrase(classified: ClassifiedMeasurement): string | null {
  if (!atLeast(classified.grade, 'mild')) return null
  const qualifier = classified.grade === 'moderate' ? 'moderately' : gradeAdverb(classified.grade)
  return `${qualifier} elevated estimated right atrial pressure${buildValueSuffix(classified.value, 'RAP', 'mmHg', classified.grade, 0, 'mild')}`
}

function buildLaContextPhrase(classified: ClassifiedMeasurement): string | null {
  if (!atLeast(classified.grade, 'mild')) return null
  switch (classified.grade) {
    case 'mild':
      return 'mild left atrial enlargement'
    case 'moderate':
      return 'moderate left atrial enlargement'
    case 'severe':
      return 'severe left atrial enlargement'
    default:
      return null
  }
}

function buildLvDysfunctionContextPhrase(classified: ClassifiedMeasurement): string | null {
  if (!atLeast(classified.grade, 'mild')) return null
  switch (classified.grade) {
    case 'mild':
      return 'mild LV systolic dysfunction'
    case 'moderate':
      return 'moderate LV systolic dysfunction'
    case 'severe':
      return 'severe LV systolic dysfunction'
    default:
      return null
  }
}

function buildPressureLoadingSentence(items: string[]): string {
  if (items.length === 0) return ''
  if (items.length === 1) {
    return `${upperFirst(items[0])} indicates right-sided pressure loading.`
  }
  return `${upperFirst(joinList(items))} indicate right-sided pressure loading.`
}

function buildAssociatedRightHeartSentence(items: string[]): string {
  if (items.length === 0) return ''
  return buildSupportingSentence(items, 'Associated right-sided features include')
}

function hasPressureLoadingDescriptor(item: string): boolean {
  return /\bseptal flattening\b|\bseptal motion\b|\binteratrial septal bowing\b|\bdilated vena cava\b/i.test(item)
}

function resolvePostCapillaryMechanismLabel(
  pulmonaryVascularPositive: boolean,
  rvRemodellingPositive: boolean,
  rvMaladaptationPositive: boolean,
  pressureOverloadPositive: boolean,
): string {
  return pulmonaryVascularPositive || rvRemodellingPositive || rvMaladaptationPositive || pressureOverloadPositive
    ? 'post-capillary / mixed pulmonary hypertension physiology'
    : 'post-capillary pulmonary hypertension physiology'
}

function buildIsolatedFlowMarkerSentence(items: string[]): string {
  const flowLabel = buildDistinctFlowLabel(items)
  if (!flowLabel) return ''
  const verb = items.length === 1 ? 'is' : 'are'
  return `${upperFirst(flowLabel)} ${verb} present, representing disorganised flow, but these remain isolated flow markers and do not establish a convincing PH phenotype.`
}

function buildPressureLoadingWithFlowSentence(
  pressureLoadingFindings: string[],
  significantFlowFindings: string[],
): string {
  const pressureLoadingSentence = buildPressureLoadingSentence(pressureLoadingFindings)
  const flowLabel = buildDistinctFlowLabel(significantFlowFindings)
  if (!pressureLoadingSentence || !flowLabel) {
    return pressureLoadingSentence
  }
  return pressureLoadingSentence.replace(/\.$/, `, with ${flowLabel} also present, representing disorganised flow.`)
}

function hasSignificantVortex(
  state: PhPresenceState,
  severity: PhAdvancedSeverity | null,
  durationPercent: number | null | undefined,
): boolean {
  return state === 'present' && (
    (durationPercent != null && durationPercent >= 15)
    || severity === 'moderate'
    || severity === 'marked'
  )
}

function hasSignificantHelicalFlow(
  state: PhPresenceState,
  severity: PhAdvancedSeverity | null,
): boolean {
  return state === 'present' && (severity === 'moderate' || severity === 'marked')
}

function buildSignificantFlowFindings(
  choices: Pick<PhSummaryChoices, 'vortexFormation' | 'vortexSeverity' | 'helicity' | 'helicitySeverity'>,
  measurements: Pick<PhSummaryMeasurements, 'vortexDurationPercent'>,
  vortexPhrase: string | null,
  helicityPhrase: string | null,
): string[] {
  return [
    hasSignificantVortex(choices.vortexFormation, choices.vortexSeverity, measurements.vortexDurationPercent) ? vortexPhrase : null,
    hasSignificantHelicalFlow(choices.helicity, choices.helicitySeverity) ? helicityPhrase : null,
  ].filter((value): value is string => Boolean(value))
}

function buildDistinctFlowLabel(items: string[]): string | null {
  if (items.length === 0) return null
  return joinList(items)
}

function buildDisorganisedFlowFinding(items: string[]): string | null {
  const flowLabel = buildDistinctFlowLabel(items)
  if (!flowLabel) return null
  return `${flowLabel}, representing disorganised flow`
}

function classifyPhSummaryAdaptation(
  phenotype: PhSummaryPhenotype,
  rightHeartSupportCount: number,
  rvRemodellingScore: number,
  rvMaladaptationScore: number,
  pressureOverloadScore: number,
  escIntermediateRiskCount: number,
  escHighRiskCount: number,
  rvHighRiskByGuideline: boolean,
  hasObjectiveRvFailureAnchor: boolean,
): PhSummaryAdaptation | null {
  if (phenotype === 'no-definite-ph' || rightHeartSupportCount === 0) return null

  if (
    escHighRiskCount >= 2
    || (rvHighRiskByGuideline && (pressureOverloadScore >= 2 || rvMaladaptationScore >= 4))
    || (hasObjectiveRvFailureAnchor && rvMaladaptationScore >= 5 && pressureOverloadScore >= 2)
  ) {
    return 'severe-uncoupling'
  }

  if (
    rvHighRiskByGuideline
    || escIntermediateRiskCount >= 2
    || (hasObjectiveRvFailureAnchor && rvMaladaptationScore >= 4)
    || (hasObjectiveRvFailureAnchor && rvMaladaptationScore >= 3 && pressureOverloadScore >= 2)
  ) {
    return 'maladaptive'
  }

  if (
    rightHeartSupportCount >= 2
    || pressureOverloadScore >= 2
    || rvRemodellingScore >= 3
    || rvMaladaptationScore >= 2
  ) {
    return 'stressed'
  }

  return 'compensated'
}

function buildPhHeadline(
  probability: PhSummaryProbability,
  phenotype: PhSummaryPhenotype,
  pulmonaryVascularPositive: boolean,
  rvRemodellingPositive: boolean,
  rvMaladaptationPositive: boolean,
  pressureOverloadPositive: boolean,
): string {
  const supportLabel = probability === 'high'
    ? 'High probability'
    : probability === 'intermediate'
      ? 'Intermediate probability'
      : 'Low probability'

  if (phenotype === 'no-definite-ph') {
    return `${supportLabel} of pulmonary hypertension physiology`
  }

  if (phenotype === 'post-capillary-or-mixed') {
    return `${supportLabel} of ${resolvePostCapillaryMechanismLabel(
      pulmonaryVascularPositive,
      rvRemodellingPositive,
      rvMaladaptationPositive,
      pressureOverloadPositive,
    )}`
  }

  if (phenotype === 'rv-pa-uncoupling') {
    return `${supportLabel} of pulmonary hypertension physiology with RV-pulmonary arterial uncoupling`
  }

  if (phenotype === 'pressure-overload-pulmonary-vascular') {
    return `${supportLabel} of pulmonary hypertension physiology with an RV pressure-overload / pulmonary vascular phenotype`
  }

  return `${supportLabel} of pulmonary hypertension physiology with early right-sided pressure loading`
}

function buildRvLvRatioPhrase(classified: ClassifiedMeasurement): string | null {
  if (!atLeast(classified.grade, 'mild') || classified.value == null) return null
  return `${gradeAdverb(classified.grade)} increased RV/LV volume ratio (RV/LV ${formatNumber(classified.value, 2)})`
}

function buildSeptalFlatteningPhrase(value: PhSeptalFlattening): string | null {
  switch (value) {
    case 'systolic':
      return 'systolic septal flattening'
    case 'diastolic':
      return 'diastolic septal flattening'
    case 'both':
      return 'systolic and diastolic septal flattening'
    default:
      return null
  }
}

function buildCombinedSeptalPhenotypePhrase(
  flatteningPhrase: string | null,
  motionPhrase: string | null,
): string | null {
  if (flatteningPhrase && motionPhrase) {
    return `${flatteningPhrase} with ${motionPhrase}`
  }
  return flatteningPhrase ?? motionPhrase
}

function buildSeptalMotionPhrase(value: PhSeptalMotion): string | null {
  switch (value) {
    case 'paradoxical':
      return 'paradoxical septal motion'
    case 'dyskinetic':
      return 'dyskinetic septal motion'
    default:
      return null
  }
}

function buildInteratrialBowingPhrase(value: PhInteratrialBowing): string | null {
  switch (value) {
    case 'toward-la':
      return 'interatrial septal bowing toward the left atrium'
    case 'toward-ra':
      return 'interatrial septal bowing toward the right atrium'
    case 'bidirectional':
      return 'bidirectional interatrial septal bowing'
    default:
      return null
  }
}

function buildEffusionPhrase(
  severity: PhPericardialEffusion,
  sizeMm: number | null | undefined,
): string | null {
  if (severity === 'none') return null
  if (sizeMm == null) return `${severity} pericardial effusion`
  return `${severity} pericardial effusion (${formatNumber(sizeMm)} mm)`
}

function describeVortexLocation(location: PhVortexLocation): string | null {
  switch (location) {
    case 'main-pa':
      return 'the main pulmonary artery'
    case 'main-pa-rpa':
      return 'the main pulmonary artery extending into the right pulmonary artery'
    case 'main-pa-lpa':
      return 'the main pulmonary artery extending into the left pulmonary artery'
    case 'branch-only':
      return 'the branch pulmonary arteries'
    case 'diffuse-proximal-pa':
      return 'the proximal pulmonary arteries'
    default:
      return null
  }
}

function describeHelicalFlowLocation(location: PhHelicalFlowLocation): string | null {
  switch (location) {
    case 'rvot-mpa':
      return 'across the RVOT-main pulmonary artery axis'
    case 'central-mpa':
      return 'within the main pulmonary artery'
    case 'rpa':
      return 'within the right pulmonary artery'
    case 'lpa':
      return 'within the left pulmonary artery'
    case 'diffuse-proximal-pa':
      return 'through the proximal pulmonary arteries'
    default:
      return null
  }
}

function buildVortexPhrase(
  state: PhPresenceState,
  severity: PhAdvancedSeverity | null,
  location: PhVortexLocation,
  durationPercent: number | null | undefined,
): string | null {
  if (state !== 'present') return null
  const locationPhrase = describeVortexLocation(location)
  if (durationPercent != null) {
    const persistenceLabel = durationPercent >= 30 ? 'persistent ' : ''
    return locationPhrase
      ? `${persistenceLabel}vortical flow in ${locationPhrase} occupying ${formatNumber(durationPercent)}% of the cardiac cycle`
      : `${persistenceLabel}vortical flow occupying ${formatNumber(durationPercent)}% of the cardiac cycle`
  }
  const qualifier = severity ? `${severity} ` : ''
  return locationPhrase
    ? `${qualifier}vortical flow in ${locationPhrase}`
    : `${qualifier}vortical flow`
}

function buildHelicalFlowPhrase(
  state: PhPresenceState,
  severity: PhAdvancedSeverity | null,
  location: PhHelicalFlowLocation,
): string | null {
  if (state !== 'present') return null
  const locationPhrase = describeHelicalFlowLocation(location)
  const qualifier = severity ? `${severity} ` : ''
  return locationPhrase
    ? `${qualifier}helical secondary flow ${locationPhrase}`
    : `${qualifier}helical secondary flow`
}

function buildFlowSplitPhrase(rpaPercent: number | null, lpaPercent: number | null): string | null {
  if (rpaPercent == null || lpaPercent == null) return null
  const asymmetry = Math.abs(rpaPercent - lpaPercent)
  if (asymmetry < 15) return null
  return `branch pulmonary flow split of RPA ${formatNumber(rpaPercent)}% and LPA ${formatNumber(lpaPercent)}%`
}

function buildRegurgitationContext(
  valveName: 'tricuspid regurgitation' | 'mitral regurgitation',
  severity: RegurgitationSeverity | null,
): string | null {
  if (severity == null || severity === 'none' || severity === 'trivial' || severity === 'mild') return null
  return `${REGURGITATION_SEVERITY_LABELS[severity].toLowerCase()} ${valveName}`
}

export function normalizePhRegurgitationChoice(
  value: PhRegurgitationChoice | null | undefined,
): RegurgitationSeverity | null {
  if (value === 'trace') return 'trivial'
  if (
    value === 'none'
    || value === 'trivial'
    || value === 'mild'
    || value === 'moderate'
    || value === 'severe'
  ) {
    return value
  }
  return null
}

function resolvePhRegurgitationSeverity(
  regurgitantFraction: number | null | undefined,
  choice: PhRegurgitationChoice | null | undefined,
): RegurgitationSeverity | null {
  if (regurgitantFraction != null) {
    return rfToRegurgitationSeverity(regurgitantFraction)
  }
  return normalizePhRegurgitationChoice(choice)
}

function buildDeterministicText(
  probability: PhSummaryProbability,
  phenotype: PhSummaryPhenotype,
  pulmonaryVascularPositive: boolean,
  rvRemodellingPositive: boolean,
  rvMaladaptationPositive: boolean,
  pressureOverloadPositive: boolean,
  dominantRightHeartFindings: string[],
  significantFlowFindings: string[],
  dominantLeftHeartFindings: string[],
  contextualFindings: string[],
): string {
  const conciseContext = summarizeContextualFindings(contextualFindings)
  const flowSupportPhrase = buildDisorganisedFlowFinding(significantFlowFindings)
  const headline = buildPhHeadline(
    probability,
    phenotype,
    pulmonaryVascularPositive,
    rvRemodellingPositive,
    rvMaladaptationPositive,
    pressureOverloadPositive,
  )
  if (phenotype === 'no-definite-ph') {
    const body = dominantLeftHeartFindings.length > 0
      ? buildSupportingSentence(dominantLeftHeartFindings, 'Left-heart loading markers include')
      : 'No convincing RV pressure-overload, pulmonary vascular, or maladaptive right-heart features are identified.'
    const flowMarkers = buildIsolatedFlowMarkerSentence(significantFlowFindings)
    const context = conciseContext.length > 0
      ? buildSupportingSentence(takePriorityFindings([conciseContext], 1), 'Additional context includes')
      : ''
    return [`${headline}.`, body, flowMarkers, context].filter(Boolean).join(' ')
  }

  if (phenotype === 'post-capillary-or-mixed') {
    const intro = dominantLeftHeartFindings.length > 0
      ? `${headline}, in the context of ${joinList(dominantLeftHeartFindings)}.`
      : `${headline}.`
    const pressureLoadingFindings = dominantRightHeartFindings.filter((item) => hasPressureLoadingDescriptor(item))
    const otherRightHeartFindings = dominantRightHeartFindings.filter(
      (item) => !hasPressureLoadingDescriptor(item) && !significantFlowFindings.includes(item) && item !== flowSupportPhrase,
    )
    const rightHeart = pressureLoadingFindings.length > 0
      ? buildPressureLoadingWithFlowSentence(pressureLoadingFindings, significantFlowFindings)
      : buildAssociatedRightHeartSentence(
          dedupeFindings([
            ...otherRightHeartFindings,
            ...(flowSupportPhrase ? [flowSupportPhrase] : significantFlowFindings),
          ]),
        )
    const context = conciseContext.length > 0
      ? buildSupportingSentence(takePriorityFindings([conciseContext], 1), 'Additional context includes')
      : ''
    return [intro, rightHeart, context].filter(Boolean).join(' ')
  }

  const intro = `${headline}.`
  const body = buildSupportingSentence(dominantRightHeartFindings, 'Supported by')
  const context = conciseContext.length > 0
    ? buildSupportingSentence(takePriorityFindings([conciseContext], 1), 'Additional context includes')
    : ''
  return [intro, body, context].filter(Boolean).join(' ')
}

export function buildPhSummaryData(
  measurements: PhSummaryMeasurements,
  canonicalLookup: Map<string, CmrCanonicalParam>,
  choices: PhSummaryChoices,
): PhSummaryData {
  const rvEdvi = classifyCanonicalMeasurement(measurements.rvEdvi ?? null, 'rvEdvi', canonicalLookup)
  const rvEsvi = classifyCanonicalMeasurement(measurements.rvEsvi ?? null, 'rvEsvi', canonicalLookup)
  const rvEf = classifyCanonicalMeasurement(measurements.rvEf ?? null, 'rvEf', canonicalLookup)
  const tapse = classifyCanonicalMeasurement(measurements.tapse ?? null, 'tapse', canonicalLookup)
  const rvMassIndex = classifyCanonicalMeasurement(measurements.rvMassIndex ?? null, 'rvMassIndex', canonicalLookup)
  const rvSvi = classifyCanonicalMeasurement(measurements.rvSvi ?? null, 'rvSvi', canonicalLookup)
  const rvCi = classifyCanonicalMeasurement(measurements.rvCi ?? null, 'rvCi', canonicalLookup)
  const rvLvRatio = classifyRvLvRatio(measurements.rvLvVolumeRatio ?? null)
  const raSize = classifyCanonicalMeasurement(measurements.raMaxVolumeIndex ?? null, 'raMaxVolumeIndex', canonicalLookup)
  const laSize = classifyCanonicalMeasurement(measurements.laMaxVolumeIndex ?? null, 'laMaxVolumeIndex', canonicalLookup)
  const lvEf = classifyClinicalLvef(measurements.lvEf ?? null)
  const mainPa = classifyCanonicalMeasurement(measurements.mainPaDiameter ?? null, 'mainPaDiameter', canonicalLookup)
  const paDistensibility = classifyCanonicalMeasurement(measurements.paDistensibility ?? null, 'paDistensibility', canonicalLookup)
  const pcwp = classifyEstimatedPcwp(measurements.pcwp ?? null)
  const mrap = classifyEstimatedRap(measurements.mrap ?? null)

  const rvSizePhrase = buildDilatedPhrase(rvEdvi, 'right ventricle', 'RV EDVi', 'mL/m2')
  const rvEsviPhrase = buildIncreasedPhrase(rvEsvi, 'RV end-systolic volume index', 'RV ESVi', 'mL/m2')
  const rvFunctionPhrase = buildImpairedFunctionPhrase(rvEf, 'RV', 'RVEF', '%')
  const tapsePhrase = buildReducedPhrase(tapse, 'TAPSE', 'TAPSE', 'mm')
  const rvMassPhrase = buildIncreasedPhrase(rvMassIndex, 'RV mass index', 'RV mass index', 'g/m2')
  const rvSviPhrase = buildReducedPhrase(rvSvi, 'RV stroke volume index', 'RV SVi', 'mL/m2', 0)
  const rvCiPhrase = buildReducedPhrase(rvCi, 'RV cardiac index', 'RV CI', 'L/min/m2', 1)
  const rvLvRatioPhrase = buildRvLvRatioPhrase(rvLvRatio)
  const raSizePhrase = buildEnlargedPhrase(raSize, 'right atrium', 'RAVi', 'mL/m2')
  const laSizePhrase = buildLaContextPhrase(laSize)
  const lvFunctionPhrase = buildLvDysfunctionContextPhrase(lvEf)
  const mainPaPhrase = buildDilatedPhrase(mainPa, 'main pulmonary artery', 'MPA', 'mm')
  const paDistensibilityPhrase = buildReducedPhrase(
    paDistensibility,
    'pulmonary artery distensibility',
    'PA distensibility',
    '%',
  )
  const pcwpPhrase = buildPcwpPhrase(pcwp)
  const rapPhrase = buildRapPhrase(mrap)

  const septalFlatteningPhrase = buildSeptalFlatteningPhrase(choices.septalFlattening)
  const septalMotionPhrase = buildSeptalMotionPhrase(choices.septalMotion)
  const combinedSeptalPhenotypePhrase = buildCombinedSeptalPhenotypePhrase(septalFlatteningPhrase, septalMotionPhrase)
  const interatrialBowingPhrase = buildInteratrialBowingPhrase(choices.interatrialSeptalBowing)
  const effusionPhrase = buildEffusionPhrase(choices.pericardialEffusion, measurements.pericardialEffusionSize ?? null)
  const venaCavaPhrase = choices.venaCava === 'dilated' ? 'dilated vena cava' : null
  const vortexPhrase = buildVortexPhrase(
    choices.vortexFormation,
    choices.vortexSeverity,
    choices.vortexLocation,
    measurements.vortexDurationPercent ?? null,
  )
  const helicityPhrase = buildHelicalFlowPhrase(
    choices.helicity,
    choices.helicitySeverity,
    choices.helicityLocation,
  )
  const flowSplitPhrase = buildFlowSplitPhrase(measurements.rpaPercent ?? null, measurements.lpaPercent ?? null)
  const significantFlowFindings = buildSignificantFlowFindings(
    choices,
    { vortexDurationPercent: measurements.vortexDurationPercent ?? null },
    vortexPhrase,
    helicityPhrase,
  )

  const trSeverity = resolvePhRegurgitationSeverity(measurements.trRegurgitantFraction, choices.trSeverity)
  const mrSeverity = resolvePhRegurgitationSeverity(measurements.mrRegurgitantFraction, choices.mrSeverity)
  const trPhrase = buildRegurgitationContext('tricuspid regurgitation', trSeverity)
  const mrPhrase = buildRegurgitationContext('mitral regurgitation', mrSeverity)

  const rvRemodellingFindings = [
    rvSizePhrase,
    rvLvRatioPhrase,
    rvMassPhrase,
    raSizePhrase,
  ].filter((value): value is string => Boolean(value))

  const rvMaladaptationFindings = [
    rvEsviPhrase,
    rvFunctionPhrase,
    tapsePhrase,
    rvSviPhrase,
    rvCiPhrase,
    effusionPhrase,
    trPhrase,
  ].filter((value): value is string => Boolean(value))

  const pressureOverloadFindings = [
    combinedSeptalPhenotypePhrase,
    interatrialBowingPhrase,
    venaCavaPhrase,
  ].filter((value): value is string => Boolean(value))

  const pulmonaryVascularFindings = [
    paDistensibilityPhrase,
    mainPaPhrase,
    ...significantFlowFindings,
  ].filter((value): value is string => Boolean(value))

  const leftHeartFindings = [
    pcwpPhrase,
    lvFunctionPhrase,
    mrPhrase,
    laSizePhrase,
  ].filter((value): value is string => Boolean(value))

  const contextualFindings = [
    rapPhrase,
    flowSplitPhrase,
  ].filter((value): value is string => Boolean(value))

  const rvRemodellingScore = rvEdvi.points + rvMassIndex.points + rvLvRatio.points + Math.min(raSize.points, 2)
  const rvMaladaptationScore = rvEsvi.points + rvEf.points + tapse.points + rvSvi.points + rvCi.points + (choices.pericardialEffusion === 'large' ? 2 : choices.pericardialEffusion === 'moderate' ? 1 : 0) + (trSeverity === 'severe' ? 2 : trSeverity === 'moderate' ? 1 : 0)
  const pressureOverloadScore
    = (choices.septalFlattening === 'both' ? 2 : choices.septalFlattening !== 'none' ? 1 : 0)
    + (choices.septalMotion === 'dyskinetic' ? 2 : choices.septalMotion === 'paradoxical' ? 1 : 0)
    + (choices.interatrialSeptalBowing === 'bidirectional' || choices.interatrialSeptalBowing === 'toward-la' ? 1 : 0)
    + (choices.venaCava === 'dilated' ? 1 : 0)
  const pulmonaryVascularEstablishedScore = mainPa.points + paDistensibility.points
  const pulmonaryVascularFlowScore
    = (hasSignificantVortex(choices.vortexFormation, choices.vortexSeverity, measurements.vortexDurationPercent) ? 1 : 0)
    + (hasSignificantHelicalFlow(choices.helicity, choices.helicitySeverity) ? 1 : 0)
  const pulmonaryVascularScore = pulmonaryVascularEstablishedScore + pulmonaryVascularFlowScore
  const leftHeartScore = Math.min(laSize.points, 2) + pcwp.points
    + (mrSeverity === 'severe' ? 2 : mrSeverity === 'moderate' ? 1 : 0)
    + Math.min(lvEf.points, 2)
  const hasElevatedEstimatedPcwp = atLeast(pcwp.grade, 'moderate')
  const leftHeartContextCount = countTrue([
    atLeast(laSize.grade, 'mild'),
    hasElevatedEstimatedPcwp,
    mrSeverity === 'moderate' || mrSeverity === 'severe',
    atLeast(lvEf.grade, 'mild'),
  ])
  const rvefRisk = classifyPhRvefRisk(measurements.rvEf ?? null)
  const rvSviRisk = classifyPhRvSviRisk(measurements.rvSvi ?? null)
  const rvEsviRisk = classifyPhRvEsviRisk(measurements.rvEsvi ?? null)
  const escIntermediateRiskCount = countTrue([
    rvefRisk.points >= 1,
    rvSviRisk.points >= 1,
    rvEsviRisk.points >= 1,
  ])
  const escHighRiskCount = countTrue([
    rvefRisk.points === 2,
    rvSviRisk.points === 2,
    rvEsviRisk.points === 2,
  ])
  const rvHighRiskByGuideline = escHighRiskCount >= 1
  const hasObjectiveRvFailureAnchor = countTrue([
    atLeast(rvEf.grade, 'mild'),
    atLeast(rvEsvi.grade, 'mild'),
    atLeast(rvSvi.grade, 'mild'),
    atLeast(rvCi.grade, 'mild'),
  ]) >= 1

  const rvRemodellingPositive = rvRemodellingScore >= 2
  const rvMaladaptationPositive = rvMaladaptationScore >= 2
  const pressureOverloadPositive = pressureOverloadScore >= 2
  const pulmonaryVascularPositive = pulmonaryVascularEstablishedScore >= 2
    || (pulmonaryVascularEstablishedScore >= 1 && pulmonaryVascularFlowScore >= 1)
  const strongLeftHeart = leftHeartContextCount >= 3 || (hasElevatedEstimatedPcwp && leftHeartContextCount >= 2)
  const rightHeartSupportCount = countTrue([rvRemodellingPositive, pressureOverloadPositive, pulmonaryVascularPositive])
  const advancedMaladaptation = rvHighRiskByGuideline
    || escIntermediateRiskCount >= 2
    || (rvMaladaptationScore >= 4 && hasObjectiveRvFailureAnchor)

  let probability: PhSummaryProbability
  let phenotype: PhSummaryPhenotype

  if (rightHeartSupportCount >= 2) {
    probability = 'high'
    phenotype = strongLeftHeart
      ? 'post-capillary-or-mixed'
      : advancedMaladaptation
        ? 'rv-pa-uncoupling'
        : 'pressure-overload-pulmonary-vascular'
  } else if (rightHeartSupportCount === 1) {
    probability = advancedMaladaptation ? 'high' : 'intermediate'
    phenotype = strongLeftHeart
      ? 'post-capillary-or-mixed'
      : probability === 'high'
        ? 'rv-pa-uncoupling'
        : 'early-pressure-overload'
  } else if (strongLeftHeart) {
    probability = 'intermediate'
    phenotype = 'post-capillary-or-mixed'
  } else {
    probability = 'low'
    phenotype = 'no-definite-ph'
  }

  const probabilityLabel = probability === 'high'
    ? 'High probability'
    : probability === 'intermediate'
      ? 'Intermediate probability'
      : 'Low probability'

  const adaptation = classifyPhSummaryAdaptation(
    phenotype,
    rightHeartSupportCount,
    rvRemodellingScore,
    rvMaladaptationScore,
    pressureOverloadScore,
    escIntermediateRiskCount,
    escHighRiskCount,
    rvHighRiskByGuideline,
    hasObjectiveRvFailureAnchor,
  )
  const adaptationLabel = buildAdaptationLabel(adaptation)
  const severity = mapAdaptationToLegacySeverity(adaptation)
  const severityLabel = severity == null ? null : upperFirst(severity)

  const phenotypeLabel = phenotype === 'rv-pa-uncoupling'
    ? 'RV-PA uncoupling physiology'
    : phenotype === 'pressure-overload-pulmonary-vascular'
      ? 'RV pressure-overload / pulmonary vascular phenotype'
      : phenotype === 'early-pressure-overload'
        ? 'Early pressure-overload phenotype'
        : phenotype === 'post-capillary-or-mixed'
          ? 'Post-capillary / mixed physiology'
          : 'No convincing PH phenotype'

  const orderedKeyFindings = [
    ...rvRemodellingFindings,
    ...rvMaladaptationFindings,
    ...pressureOverloadFindings,
    ...pulmonaryVascularFindings,
  ]
  const flowSupportPhrase = buildDisorganisedFlowFinding(significantFlowFindings)

  const dominantLeftHeartContextFindings = takePriorityFindings([leftHeartFindings], 3)
  const baseDominantRightHeartSupportFindings = phenotype === 'post-capillary-or-mixed'
    ? dedupeFindings(
        takePriorityFindings(
          [
            [combinedSeptalPhenotypePhrase, rvFunctionPhrase, rvEsviPhrase, rvMassPhrase, rvSizePhrase],
            [rvSviPhrase, paDistensibilityPhrase, mainPaPhrase, tapsePhrase, effusionPhrase, raSizePhrase, interatrialBowingPhrase, rvLvRatioPhrase],
            [trPhrase, ...significantFlowFindings, venaCavaPhrase],
          ].map((group) => group.filter((value): value is string => Boolean(value))),
          1,
        ),
      )
    : dedupeFindings(
        takePriorityFindings(
          [
            [rvFunctionPhrase, rvEsviPhrase, combinedSeptalPhenotypePhrase, rvSviPhrase, rvMassPhrase, rvSizePhrase],
            [paDistensibilityPhrase, mainPaPhrase, tapsePhrase, effusionPhrase, raSizePhrase, interatrialBowingPhrase, rvLvRatioPhrase],
            [trPhrase, ...significantFlowFindings, venaCavaPhrase],
          ].map((group) => group.filter((value): value is string => Boolean(value))),
          phenotype === 'rv-pa-uncoupling' ? 3 : 2,
        ),
      )
  const dominantRightHeartSupportFindings = dedupeFindings([
    ...baseDominantRightHeartSupportFindings,
    ...(flowSupportPhrase ? [flowSupportPhrase] : significantFlowFindings),
  ])

  return {
    deterministicText: buildDeterministicText(
      probability,
      phenotype,
      pulmonaryVascularPositive,
      rvRemodellingPositive,
      rvMaladaptationPositive,
      pressureOverloadPositive,
      dominantRightHeartSupportFindings,
      significantFlowFindings,
      dominantLeftHeartContextFindings,
      contextualFindings,
    ),
    probability,
    probabilityLabel,
    adaptation,
    adaptationLabel,
    severity,
    severityLabel,
    phenotype,
    phenotypeLabel,
    domainScores: {
      rvRemodelling: rvRemodellingScore,
      rvMaladaptation: rvMaladaptationScore,
      pressureOverload: pressureOverloadScore,
      pulmonaryVascular: pulmonaryVascularScore,
      leftHeart: leftHeartScore,
    },
    keyFindings: orderedKeyFindings,
    leftHeartFindings,
    contextualFindings,
    dominantLeftHeartContextFindings,
    dominantRightHeartSupportFindings,
    rvRemodellingFindings,
    rvMaladaptationFindings,
    pressureOverloadFindings,
    pulmonaryVascularFindings,
    rvSize: rvSizePhrase,
    rvEndSystolicVolumeIndex: rvEsviPhrase,
    rvFunction: rvFunctionPhrase,
    tapse: tapsePhrase,
    rvMassIndex: rvMassPhrase,
    rvStrokeVolumeIndex: rvSviPhrase,
    rvCardiacIndex: rvCiPhrase,
    rvLvRatio: rvLvRatioPhrase,
    raSize: raSizePhrase,
    laSize: laSizePhrase,
    lvFunction: lvFunctionPhrase,
    mainPa: mainPaPhrase,
    paDistensibility: paDistensibilityPhrase,
    estimatedPcwp: pcwpPhrase,
    estimatedRap: rapPhrase,
    septalFlattening: choices.septalFlattening,
    septalMotion: choices.septalMotion,
    interatrialSeptalBowing: choices.interatrialSeptalBowing,
    pericardialEffusion: choices.pericardialEffusion,
    pericardialEffusionSize: measurements.pericardialEffusionSize ?? null,
    venaCava: choices.venaCava,
    trSeverity,
    trSeverityLabel: trSeverity == null ? null : REGURGITATION_SEVERITY_LABELS[trSeverity],
    mrSeverity,
    mrSeverityLabel: mrSeverity == null ? null : REGURGITATION_SEVERITY_LABELS[mrSeverity],
    vortexFormation: choices.vortexFormation,
    vortexSeverity: choices.vortexSeverity,
    vortexLocation: choices.vortexLocation,
    vortexDurationPercent: measurements.vortexDurationPercent ?? null,
    helicity: choices.helicity,
    helicitySeverity: choices.helicitySeverity,
    helicityLocation: choices.helicityLocation,
    rpaPercent: measurements.rpaPercent ?? null,
    lpaPercent: measurements.lpaPercent ?? null,
  }
}

export function buildPhSummarySignature(data: PhSummaryData): string {
  return JSON.stringify({
    probability: data.probability,
    probabilityLabel: data.probabilityLabel,
    adaptation: data.adaptation,
    adaptationLabel: data.adaptationLabel,
    severity: data.severity,
    phenotype: data.phenotype,
    domainScores: data.domainScores,
    keyFindings: data.keyFindings,
    leftHeartFindings: data.leftHeartFindings,
    contextualFindings: data.contextualFindings,
    dominantLeftHeartContextFindings: data.dominantLeftHeartContextFindings,
    dominantRightHeartSupportFindings: data.dominantRightHeartSupportFindings,
    rvRemodellingFindings: data.rvRemodellingFindings,
    rvMaladaptationFindings: data.rvMaladaptationFindings,
    pressureOverloadFindings: data.pressureOverloadFindings,
    pulmonaryVascularFindings: data.pulmonaryVascularFindings,
    rvSize: data.rvSize,
    rvEndSystolicVolumeIndex: data.rvEndSystolicVolumeIndex,
    rvFunction: data.rvFunction,
    tapse: data.tapse,
    rvMassIndex: data.rvMassIndex,
    rvStrokeVolumeIndex: data.rvStrokeVolumeIndex,
    rvCardiacIndex: data.rvCardiacIndex,
    rvLvRatio: data.rvLvRatio,
    raSize: data.raSize,
    laSize: data.laSize,
    lvFunction: data.lvFunction,
    mainPa: data.mainPa,
    paDistensibility: data.paDistensibility,
    estimatedPcwp: data.estimatedPcwp,
    estimatedRap: data.estimatedRap,
    septalFlattening: data.septalFlattening,
    septalMotion: data.septalMotion,
    interatrialSeptalBowing: data.interatrialSeptalBowing,
    pericardialEffusion: data.pericardialEffusion,
    pericardialEffusionSize: data.pericardialEffusionSize,
    venaCava: data.venaCava,
    trSeverity: data.trSeverity,
    mrSeverity: data.mrSeverity,
    vortexFormation: data.vortexFormation,
    vortexSeverity: data.vortexSeverity,
    vortexLocation: data.vortexLocation,
    vortexDurationPercent: data.vortexDurationPercent,
    helicity: data.helicity,
    helicitySeverity: data.helicitySeverity,
    helicityLocation: data.helicityLocation,
    rpaPercent: data.rpaPercent,
    lpaPercent: data.lpaPercent,
  })
}
