import type { CmrCanonicalParam, CmrExtractionResult } from '@/lib/cmr-api'
import {
  buildAorticValveSummaryData,
  buildAorticValveSummarySignature,
} from '@/lib/cmr-aortic-valve-summary'
import {
  createDefaultCmrCasePayload,
  createEmptyThrombusEntry,
  type CmrCasePayload,
  type CmrThrombusEntryDraft,
  type CmrValveFindingDraft,
} from '@/lib/cmr-case-defaults'
import {
  buildLgeSummaryData,
  generateLgeSummary,
  buildLgeSummarySignature,
  type LgeCode,
  type LgeSummaryData,
  type PatternCode,
} from '@/lib/cmr-lge-summary'
import {
  buildMitralValveSummaryData,
  buildMitralValveSummarySignature,
} from '@/lib/cmr-mitral-valve-summary'
import {
  buildPerfusionSummaryData,
  generatePerfusionSummary,
  buildPerfusionSummarySignature,
  type PerfusionCode,
  type PerfusionSummaryData,
} from '@/lib/cmr-perfusion-summary'
import {
  buildPhSummaryData,
  buildPhSummarySignature,
  normalizePhRegurgitationChoice,
  type PhSummaryChoices,
  type PhSummaryData,
  type PhSummaryMeasurements,
} from '@/lib/cmr-ph-summary'
import {
  buildReportConclusionSourceSignature,
  buildReportConclusions,
  buildValveSummarySentence,
  shouldIncludeValveAssessment,
} from '@/lib/cmr-report-output'
import {
  buildRwmaSummaryData,
  generateRwmaSummary,
  buildRwmaSummarySignature,
  type RwmaCode,
} from '@/lib/cmr-rwma-summary'
import {
  generateCmrAorticValveProse,
  generateCmrLgeProse,
  generateCmrMitralValveProse,
  generateCmrPerfusionProse,
  generateCmrPhProse,
  generateCmrReportConclusions,
  generateCmrRwmaProse,
  generateCmrThrombusProse,
  generateCmrTricuspidValveProse,
} from '@/lib/cmr-summary-api'
import {
  applySyntheticConsistency,
  formatSyntheticReportText,
  generateSyntheticDatasetAuto,
  type Demographics,
  type OutputParam,
  type PathologyProfile,
  type RefRange,
} from '@/lib/cmr-synthetic-report'
import {
  buildThrombusSummaryData,
  buildThrombusSummarySignature,
  type ThrombusSummaryData,
  type ThrombusSummaryEntryInput,
} from '@/lib/cmr-thrombus-summary'
import {
  buildTricuspidValveSummaryData,
  buildTricuspidValveSummarySignature,
} from '@/lib/cmr-tricuspid-valve-summary'
import refData from '@/data/cmr_reference_data.json'

type ReportType = 'standard' | 'stress'
type CaseGroup = 'Stress perfusion' | 'Scar / tissue' | 'Valves' | 'PH' | 'Thrombus'
type VariantIndex = 0 | 1 | 2 | 3

type SyntheticCaseDefinition = {
  id: string
  group: CaseGroup
  label: string
  baseLabel: string
  variantLabel: string
  profile: PathologyProfile
  reportType: ReportType
  fourDFlow: boolean
  nonContrast: boolean
}

type SyntheticCaseSpec = {
  key: string
  group: CaseGroup
  label: string
  profile: PathologyProfile
  reportType?: ReportType
  fourDFlow?: boolean
  nonContrast?: boolean
  variantLabels: readonly [string, string, string, string]
  apply: (context: SyntheticCaseContext, variantIndex: VariantIndex) => void
}

type SyntheticCaseContext = {
  definition: SyntheticCaseDefinition
  payload: CmrCasePayload
  demographics: Demographics
  values: Record<string, number>
  studyDate: string
}

export type SyntheticCmrCase = {
  definition: SyntheticCaseDefinition
  payload: CmrCasePayload
  title: string
  patientLabel: string
  studyDate: string
}

export type SyntheticCmrCaseGenerationResult = {
  syntheticCase: SyntheticCmrCase
  warnings: string[]
}

const OUTPUT_PARAMS = refData.output_params as unknown as Record<string, OutputParam>
const OUTPUT_PARAM_ENTRIES = Object.entries(OUTPUT_PARAMS)
const OUTPUT_PARAM_KEYS = OUTPUT_PARAM_ENTRIES.map(([key]) => key)
const REF_RANGES = Object.values(refData.ref_ranges) as unknown as RefRange[]
const EPSILON = 0.0001
const RANDOM_CASE_ID = '__random__'

const SEGMENTS_BY_TERRITORY = {
  LAD: {
    small: [7, 13] as number[],
    medium: [7, 8, 13] as number[],
    large: [1, 2, 7, 8, 13] as number[],
    extensive: [1, 2, 7, 8, 13, 14, 17] as number[],
  },
  RCA: {
    small: [4, 10] as number[],
    medium: [4, 10, 15] as number[],
    large: [3, 4, 9, 10, 15] as number[],
    extensive: [3, 4, 9, 10, 15] as number[],
  },
  LCx: {
    small: [5, 11] as number[],
    medium: [5, 11, 16] as number[],
    large: [5, 6, 11, 12, 16] as number[],
    extensive: [5, 6, 11, 12, 16] as number[],
  },
} as const

const MULTIVESSEL_SEGMENTS = {
  dualTerritory: [7, 8, 11, 12, 13, 16],
  tripleTerritory: [7, 8, 10, 11, 13, 15, 16],
  circumferential: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12],
  advanced: [2, 3, 4, 5, 7, 8, 9, 10, 11, 13, 15, 16],
} as const

const DCM_LGE_SEGMENTS = {
  mild: [2, 8],
  moderate: [2, 3, 8, 9],
  severe: [2, 3, 8, 9, 11],
  biv: [2, 3, 8, 9, 11, 12],
} as const

const MYOCARDITIS_SEGMENTS = {
  inferolateral: [5, 11],
  multifocal: [5, 11, 12, 16],
  septolateral: [3, 5, 9, 11],
  extensive: [4, 5, 10, 11, 12, 16],
} as const

const HCM_SEGMENTS = {
  septal: [2, 8],
  septalApical: [2, 8, 14, 17],
  apical: [13, 14, 17],
  extensive: [1, 2, 7, 8, 13, 14, 17],
} as const

const SARCOID_SEGMENTS = {
  septal: [2, 3, 8],
  multifocal: [2, 5, 8, 11, 12],
  rvInsertionLike: [2, 3, 8, 9],
  extensive: [2, 3, 5, 8, 9, 11, 12, 16],
} as const

const PRIMARY_PH_CHOICES: PhSummaryChoices = {
  septalFlattening: 'none',
  septalMotion: 'normal',
  interatrialSeptalBowing: 'none',
  pericardialEffusion: 'none',
  venaCava: 'normal',
  trSeverity: 'none',
  mrSeverity: 'none',
  vortexFormation: 'not-assessed',
  vortexSeverity: null,
  vortexLocation: 'not-specified',
  helicity: 'not-assessed',
  helicitySeverity: null,
  helicityLocation: 'not-specified',
}

function roundTo(value: number, decimals: number): number {
  const factor = 10 ** decimals
  return Math.round(value * factor) / factor
}

function randomItem<T>(items: readonly T[]): T {
  return items[Math.floor(Math.random() * items.length)]
}

function isMeaningfulValue(value: number | undefined): value is number {
  return value != null && Number.isFinite(value) && Math.abs(value) > EPSILON
}

function setValues(values: Record<string, number>, overrides: Record<string, number | null | undefined>): void {
  for (const [key, value] of Object.entries(overrides)) {
    if (value == null || !Number.isFinite(value)) continue
    values[key] = value
  }
}

function setSegmentState(record: Record<number, number>, segments: Iterable<number>, state: number): void {
  for (const segment of segments) {
    record[segment] = state
  }
}

function setRwma(payload: CmrCasePayload, segments: Iterable<number>, state: RwmaCode): void {
  setSegmentState(payload.rwma.segStates, segments, state)
}

function setLge(
  payload: CmrCasePayload,
  segments: Iterable<number>,
  transmurality: LgeCode,
  pattern: PatternCode,
): void {
  for (const segment of segments) {
    payload.lge.segStates[segment] = transmurality
    payload.lge.patternStates[segment] = pattern
  }
}

function setPerfusion(
  payload: CmrCasePayload,
  phase: 'rest' | 'stress',
  segments: Iterable<number>,
  extent: PerfusionCode,
): void {
  const target = phase === 'stress' ? payload.perfusion.stressSegStates : payload.perfusion.restSegStates
  setSegmentState(target, segments, extent)
}

function setMixedIschaemicScar(
  payload: CmrCasePayload,
  viableSegments: Iterable<number>,
  nonViableSegments: Iterable<number>,
): void {
  setLge(payload, viableSegments, 2, 1)
  setLge(payload, nonViableSegments, 4, 4)
}

function setFinding(
  payload: CmrCasePayload,
  valve: keyof CmrCasePayload['valves']['morphologies'],
  key: string,
  finding: Partial<CmrValveFindingDraft>,
): void {
  payload.valves.morphologies[valve].findings[key] = {
    leaflets: [...(finding.leaflets ?? [])],
    detailValues: { ...(finding.detailValues ?? {}) },
    notes: finding.notes ?? '',
  }
}

function setPhNumeric(payload: CmrCasePayload, key: string, value: number | null | undefined): void {
  if (value == null || !Number.isFinite(value)) return
  payload.ph.manualNumeric[key] = String(value)
}

function setPhChoice(
  payload: CmrCasePayload,
  key: keyof PhSummaryChoices | 'trSeverity' | 'mrSeverity' | 'prSeverity',
  value: string | null,
): void {
  payload.ph.choices[key] = value
}

function setSingleThrombus(payload: CmrCasePayload, update: Partial<CmrThrombusEntryDraft>): void {
  const entry = {
    ...createEmptyThrombusEntry(),
    ...update,
    morphology: {
      ...createEmptyThrombusEntry().morphology,
      ...(update.morphology ?? {}),
    },
  }
  payload.thrombus.entries = [entry]
  payload.thrombus.activeEntryId = entry.id
}

function buildStudyDate(caseNumber: number): string {
  const month = Math.min(12, Math.floor(caseNumber / 28) + 1)
  const day = (caseNumber % 28) + 1
  return `2026-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
}

function buildExtractionResult(
  demographics: Demographics,
  studyDate: string,
  values: Record<string, number>,
): CmrExtractionResult {
  const measurements = OUTPUT_PARAM_KEYS
    .map((parameter) => {
      const value = values[parameter]
      return isMeaningfulValue(value) ? { parameter, value } : null
    })
    .filter((measurement): measurement is NonNullable<typeof measurement> => measurement != null)

  return {
    demographics: {
      sex: demographics.sex,
      age: demographics.age,
      height_cm: demographics.height,
      weight_kg: demographics.weight,
      bsa: demographics.bsa,
      heart_rate: demographics.hr,
      study_date: studyDate,
    },
    measurements,
  }
}

function findRefRange(parameter: string, sex: string, age: number): RefRange | null {
  const exact = REF_RANGES.find(
    (range) =>
      range.parameter === parameter
      && range.sex === sex
      && age >= range.age_min
      && age <= range.age_max,
  )
  if (exact) return exact
  return REF_RANGES.find((range) => range.parameter === parameter && range.sex === sex) ?? null
}

function buildCanonicalLookup(demographics: Demographics): Map<string, CmrCanonicalParam> {
  const lookup = new Map<string, CmrCanonicalParam>()

  for (const [parameterKey, meta] of OUTPUT_PARAM_ENTRIES) {
    const range = findRefRange(parameterKey, demographics.sex, demographics.age)
    lookup.set(parameterKey, {
      parameter_key: parameterKey,
      unit: meta.unit ?? '',
      indexing: meta.indexing ?? 'absolute',
      abnormal_direction: String(meta.abnormal_direction ?? 'both'),
      major_section: String(meta.major_section ?? ''),
      sub_section: String(meta.sub_section ?? ''),
      sort_order: Number(meta.sort_order ?? 0),
      ll: range?.ll ?? null,
      mean: range?.mean ?? null,
      ul: range?.ul ?? null,
      sd: range?.sd ?? null,
      age_band: range?.age_band ?? null,
      pap_differs: Boolean(meta.pap_differs ?? false),
      sources: [],
      severity_label: (meta.severity_label as string | undefined) ?? undefined,
      severity_thresholds: (meta.severity_thresholds as CmrCanonicalParam['severity_thresholds'] | undefined) ?? undefined,
      severity_label_override: (meta.severity_label_override as CmrCanonicalParam['severity_label_override'] | undefined) ?? undefined,
      nested_under: (meta.nested_under as string | undefined) ?? undefined,
      decimal_places: (meta.decimal_places as number | undefined) ?? undefined,
      separator_before: (meta.separator_before as boolean | undefined) ?? undefined,
      derived: (meta.derived as boolean | undefined) ?? undefined,
      derived_tooltip: (meta.derived_tooltip as string | undefined) ?? undefined,
    })
  }

  return lookup
}

function buildPhMeasurements(
  payload: CmrCasePayload,
  values: Record<string, number>,
): PhSummaryMeasurements {
  const rvEdvi = values['RV EDV (i)'] ?? null
  const lvEdvi = values['LV EDV (i)'] ?? null
  const rpaNetFlow = Number(payload.ph.manualNumeric.rpaNetFlow ?? '')
  const lpaNetFlow = Number(payload.ph.manualNumeric.lpaNetFlow ?? '')
  const branchTotal = Number.isFinite(rpaNetFlow) && Number.isFinite(lpaNetFlow) ? rpaNetFlow + lpaNetFlow : null

  const rpaPercent = branchTotal && branchTotal !== 0
    ? roundTo((rpaNetFlow / branchTotal) * 100, 1)
    : null
  const lpaPercent = branchTotal && branchTotal !== 0
    ? roundTo((lpaNetFlow / branchTotal) * 100, 1)
    : null

  return {
    rvEdvi,
    rvEf: values['RV EF'] ?? null,
    tapse: values.TAPSE ?? null,
    rvMassIndex: values['RV mass (i)'] ?? null,
    rvSvi: values['RV SV (i)'] ?? null,
    rvCi: values['RV CI'] ?? null,
    rvLvVolumeRatio: rvEdvi != null && lvEdvi != null && lvEdvi > 0 ? roundTo(rvEdvi / lvEdvi, 2) : null,
    raMaxVolumeIndex: values['RA max volume (i)'] ?? null,
    laMaxVolumeIndex: values['LA max volume (i)'] ?? null,
    lvEf: values['LV EF'] ?? null,
    mainPaDiameter: values['MPA systolic diameter'] ?? null,
    paDistensibility: values['MPA distension'] ?? null,
    pcwp: values.PCWP ?? null,
    mrap: values.mRAP ?? null,
    trRegurgitantFraction: values['TR regurgitant fraction'] ?? null,
    mrRegurgitantFraction: values['MR regurgitant fraction'] ?? null,
    pericardialEffusionSize: null,
    vortexDurationPercent: Number(payload.ph.manualNumeric.vortexDurationPercent ?? '') || null,
    rpaPercent,
    lpaPercent,
  }
}

function maybeSetModuleSummaries(
  payload: CmrCasePayload,
  values: Record<string, number>,
  demographics: Demographics,
): void {
  const measurementMap = new Map(Object.entries(values))

  if (Object.values(payload.rwma.segStates).some((value) => value > 0)) {
    const rwmaSummary = generateRwmaSummary(payload.rwma.segStates as Record<number, RwmaCode>)
    payload.rwma.llmProse = rwmaSummary.text
    payload.rwma.llmProseSourceSignature = buildRwmaSummarySignature(payload.rwma.segStates as Record<number, RwmaCode>)
  }

  if (Object.values(payload.lge.segStates).some((value) => value > 0)) {
    const lgeSummary = generateLgeSummary(
      payload.lge.segStates as Record<number, LgeCode>,
      payload.lge.patternStates as Record<number, PatternCode>,
    )
    payload.lge.llmProse = lgeSummary.text
    payload.lge.llmProseSourceSignature = buildLgeSummarySignature(
      payload.lge.segStates as Record<number, LgeCode>,
      payload.lge.patternStates as Record<number, PatternCode>,
    )
  }

  const hasPerfusionContent =
    Object.values(payload.perfusion.stressSegStates).some((value) => value > 0)
    || Object.values(payload.perfusion.restSegStates).some((value) => value > 0)
    || !payload.perfusion.adequateStress

  if (hasPerfusionContent) {
    const perfusionSummary = generatePerfusionSummary({
      restSegStates: payload.perfusion.restSegStates as Record<number, PerfusionCode>,
      stressSegStates: payload.perfusion.stressSegStates as Record<number, PerfusionCode>,
      restPersistenceBeats: payload.perfusion.restPersistenceBeats,
      stressPersistenceBeats: payload.perfusion.stressPersistenceBeats,
      adequateStress: payload.perfusion.adequateStress,
      lgeSegStates: payload.lge.segStates as Record<number, LgeCode>,
      lgePatternStates: payload.lge.patternStates as Record<number, PatternCode>,
    })
    payload.perfusion.llmProse = perfusionSummary.text
    payload.perfusion.llmProseSourceSignature = buildPerfusionSummarySignature(
      payload.perfusion.restSegStates as Record<number, PerfusionCode>,
      payload.perfusion.stressSegStates as Record<number, PerfusionCode>,
      payload.perfusion.restPersistenceBeats,
      payload.perfusion.stressPersistenceBeats,
      payload.perfusion.adequateStress,
      payload.lge.segStates as Record<number, LgeCode>,
      payload.lge.patternStates as Record<number, PatternCode>,
    )
  }

  const mitralSummary = buildMitralValveSummaryData(measurementMap, payload.valves.morphologies.mitral)
  if (mitralSummary.deterministicText !== 'No significant mitral valve abnormality.') {
    payload.valves.summaries.mitral = {
      llmProse: mitralSummary.deterministicText,
      llmProseSourceSignature: buildMitralValveSummarySignature(mitralSummary),
    }
  }

  const aorticSummary = buildAorticValveSummaryData(measurementMap, payload.valves.morphologies.aortic)
  if (aorticSummary.deterministicText !== 'No significant aortic valve abnormality.') {
    payload.valves.summaries.aortic = {
      llmProse: aorticSummary.deterministicText,
      llmProseSourceSignature: buildAorticValveSummarySignature(aorticSummary),
    }
  }

  const tricuspidSummary = buildTricuspidValveSummaryData(measurementMap, payload.valves.morphologies.tricuspid)
  if (tricuspidSummary.deterministicText !== 'No significant tricuspid valve abnormality.') {
    payload.valves.summaries.tricuspid = {
      llmProse: tricuspidSummary.deterministicText,
      llmProseSourceSignature: buildTricuspidValveSummarySignature(tricuspidSummary),
    }
  }

  const thrombusSummary = buildThrombusSummaryData(payload.thrombus.entries as ThrombusSummaryEntryInput[])
  if (thrombusSummary.hasThrombus) {
    payload.thrombus.llmProse = thrombusSummary.deterministicText
    payload.thrombus.llmProseSourceSignature = buildThrombusSummarySignature(thrombusSummary)
  }

  const hasPhContent =
    Object.values(payload.ph.manualNumeric).some((value) => value.trim().length > 0)
    || Object.values(payload.ph.choices).some((value) => value != null && value !== '' && value !== 'none' && value !== 'normal' && value !== 'not-assessed')
  if (hasPhContent) {
    const phSummary = buildPhSummaryData(
      buildPhMeasurements(payload, values),
      buildCanonicalLookup(demographics),
      {
        ...PRIMARY_PH_CHOICES,
        septalFlattening: (payload.ph.choices.septalFlattening as PhSummaryChoices['septalFlattening']) ?? PRIMARY_PH_CHOICES.septalFlattening,
        septalMotion: (payload.ph.choices.septalMotion as PhSummaryChoices['septalMotion']) ?? PRIMARY_PH_CHOICES.septalMotion,
        interatrialSeptalBowing: (payload.ph.choices.interatrialSeptalBowing as PhSummaryChoices['interatrialSeptalBowing']) ?? PRIMARY_PH_CHOICES.interatrialSeptalBowing,
        pericardialEffusion: (payload.ph.choices.pericardialEffusion as PhSummaryChoices['pericardialEffusion']) ?? PRIMARY_PH_CHOICES.pericardialEffusion,
        venaCava: (payload.ph.choices.venaCava as PhSummaryChoices['venaCava']) ?? PRIMARY_PH_CHOICES.venaCava,
        trSeverity: normalizePhRegurgitationChoice(payload.ph.choices.trSeverity as PhSummaryChoices['trSeverity'] | undefined) ?? PRIMARY_PH_CHOICES.trSeverity,
        mrSeverity: normalizePhRegurgitationChoice(payload.ph.choices.mrSeverity as PhSummaryChoices['mrSeverity'] | undefined) ?? PRIMARY_PH_CHOICES.mrSeverity,
        vortexFormation: (payload.ph.choices.vortexFormation as PhSummaryChoices['vortexFormation']) ?? PRIMARY_PH_CHOICES.vortexFormation,
        vortexSeverity: (payload.ph.choices.vortexSeverity as PhSummaryChoices['vortexSeverity']) ?? PRIMARY_PH_CHOICES.vortexSeverity,
        vortexLocation: (payload.ph.choices.vortexLocation as PhSummaryChoices['vortexLocation']) ?? PRIMARY_PH_CHOICES.vortexLocation,
        helicity: (payload.ph.choices.helicity as PhSummaryChoices['helicity']) ?? PRIMARY_PH_CHOICES.helicity,
        helicitySeverity: (payload.ph.choices.helicitySeverity as PhSummaryChoices['helicitySeverity']) ?? PRIMARY_PH_CHOICES.helicitySeverity,
        helicityLocation: (payload.ph.choices.helicityLocation as PhSummaryChoices['helicityLocation']) ?? PRIMARY_PH_CHOICES.helicityLocation,
      },
    )
    payload.ph.llmProse = phSummary.deterministicText
    payload.ph.llmProseSourceSignature = buildPhSummarySignature(phSummary)
  }
}

function applySingleTerritoryStressNoScar(
  context: SyntheticCaseContext,
  territory: keyof typeof SEGMENTS_BY_TERRITORY,
  variantIndex: VariantIndex,
): void {
  const variants = ['small', 'medium', 'large', 'extensive'] as const
  const segments = SEGMENTS_BY_TERRITORY[territory][variants[variantIndex]]
  const lvEf = [60, 56, 50, 44][variantIndex]
  const lvEdvi = [78, 84, 92, 102][variantIndex]

  setValues(context.values, {
    'LV EF': lvEf,
    'LV EDV (i)': lvEdvi,
    'LV EDV': roundTo(lvEdvi * context.demographics.bsa, 0),
    MAPSE: [14, 13, 12, 10][variantIndex],
    'LA max volume (i)': [34, 38, 42, 48][variantIndex],
  })
  context.payload.perfusion.adequateStress = true
  context.payload.perfusion.stressPersistenceBeats = [3, 4, 5, 6][variantIndex]
  setPerfusion(context.payload, 'stress', segments, 1)
}

function applySingleTerritoryStressWithScar(
  context: SyntheticCaseContext,
  territory: keyof typeof SEGMENTS_BY_TERRITORY,
  variantIndex: VariantIndex,
): void {
  const mediumSegments = SEGMENTS_BY_TERRITORY[territory].medium
  const largeSegments = SEGMENTS_BY_TERRITORY[territory].large
  const extensiveSegments = SEGMENTS_BY_TERRITORY[territory].extensive

  context.payload.perfusion.adequateStress = true

  if (variantIndex === 0) {
    setLge(context.payload, mediumSegments, 4, 4)
    setPerfusion(context.payload, 'stress', mediumSegments, 1)
    setRwma(context.payload, mediumSegments, 2)
    setValues(context.values, {
      'LV EF': 42,
      'LV EDV (i)': 96,
      MAPSE: 10,
    })
    return
  }

  if (variantIndex === 1) {
    setLge(context.payload, mediumSegments, 2, 1)
    setPerfusion(context.payload, 'stress', largeSegments, 1)
    setRwma(context.payload, mediumSegments, 1)
    setValues(context.values, {
      'LV EF': 38,
      'LV EDV (i)': 108,
      MAPSE: 9,
    })
    return
  }

  if (variantIndex === 2) {
    setMixedIschaemicScar(context.payload, mediumSegments.slice(0, 2), mediumSegments.slice(2).concat(largeSegments.slice(0, 2)))
    setPerfusion(context.payload, 'stress', largeSegments, 1)
    setRwma(context.payload, largeSegments, 1)
    setValues(context.values, {
      'LV EF': 32,
      'LV EDV (i)': 118,
      MAPSE: 8,
      'MR regurgitant fraction': 18,
    })
    return
  }

  setMixedIschaemicScar(context.payload, mediumSegments.slice(0, 1), extensiveSegments)
  setPerfusion(context.payload, 'stress', extensiveSegments, 1)
  setRwma(context.payload, extensiveSegments.slice(0, 3), 2)
  setRwma(context.payload, extensiveSegments.slice(3), 3)
  setValues(context.values, {
    'LV EF': 24,
    'LV EDV (i)': 132,
    MAPSE: 7,
    'LA max volume (i)': 56,
    'MR regurgitant fraction': 24,
  })
}

function applyPriorInfarctionCase(
  context: SyntheticCaseContext,
  territory: keyof typeof SEGMENTS_BY_TERRITORY,
  variantIndex: VariantIndex,
): void {
  const ladder = ['small', 'medium', 'large', 'extensive'] as const
  const segments = SEGMENTS_BY_TERRITORY[territory][ladder[variantIndex]]

  if (variantIndex === 0) {
    setLge(context.payload, segments, 2, 1)
    setRwma(context.payload, segments, 1)
    setValues(context.values, { 'LV EF': 48, MAPSE: 11, 'LV EDV (i)': 88 })
    return
  }

  if (variantIndex === 1) {
    setMixedIschaemicScar(context.payload, segments.slice(0, 2), segments.slice(2))
    setRwma(context.payload, segments, 1)
    setValues(context.values, { 'LV EF': 40, MAPSE: 10, 'LV EDV (i)': 98 })
    return
  }

  if (variantIndex === 2) {
    setLge(context.payload, segments, 4, 4)
    setRwma(context.payload, segments, 2)
    setValues(context.values, { 'LV EF': 30, MAPSE: 8, 'LV EDV (i)': 112 })
    return
  }

  setLge(context.payload, segments, 4, 4)
  setRwma(context.payload, segments.slice(0, Math.max(2, segments.length - 1)), 2)
  setRwma(context.payload, segments.slice(-2), 3)
  setValues(context.values, { 'LV EF': 22, MAPSE: 7, 'LV EDV (i)': 126, 'MR regurgitant fraction': 22 })
}

const CASE_SPECS: SyntheticCaseSpec[] = [
  {
    key: 'stress-lad-noscar',
    group: 'Stress perfusion',
    label: 'Stress LAD ischaemia without scar',
    profile: 'normal',
    reportType: 'stress',
    variantLabels: ['Small defect', 'Moderate defect', 'Large defect', 'Extensive defect'],
    apply: (context, variantIndex) => applySingleTerritoryStressNoScar(context, 'LAD', variantIndex),
  },
  {
    key: 'stress-rca-noscar',
    group: 'Stress perfusion',
    label: 'Stress RCA ischaemia without scar',
    profile: 'normal',
    reportType: 'stress',
    variantLabels: ['Small defect', 'Moderate defect', 'Large defect', 'Extensive defect'],
    apply: (context, variantIndex) => applySingleTerritoryStressNoScar(context, 'RCA', variantIndex),
  },
  {
    key: 'stress-lcx-noscar',
    group: 'Stress perfusion',
    label: 'Stress LCx ischaemia without scar',
    profile: 'normal',
    reportType: 'stress',
    variantLabels: ['Small defect', 'Moderate defect', 'Large defect', 'Extensive defect'],
    apply: (context, variantIndex) => applySingleTerritoryStressNoScar(context, 'LCx', variantIndex),
  },
  {
    key: 'stress-lad-scar',
    group: 'Stress perfusion',
    label: 'Stress LAD ischaemia with prior LAD infarction',
    profile: 'ischaemic_cardiomyopathy',
    reportType: 'stress',
    variantLabels: ['Matched scar', 'Peri-infarct ischaemia', 'Mixed viability', 'Advanced ischaemic CMP'],
    apply: (context, variantIndex) => applySingleTerritoryStressWithScar(context, 'LAD', variantIndex),
  },
  {
    key: 'stress-rca-scar',
    group: 'Stress perfusion',
    label: 'Stress RCA ischaemia with prior RCA infarction',
    profile: 'ischaemic_cardiomyopathy',
    reportType: 'stress',
    variantLabels: ['Matched scar', 'Peri-infarct ischaemia', 'Mixed viability', 'Advanced ischaemic CMP'],
    apply: (context, variantIndex) => applySingleTerritoryStressWithScar(context, 'RCA', variantIndex),
  },
  {
    key: 'stress-lcx-scar',
    group: 'Stress perfusion',
    label: 'Stress LCx ischaemia with prior LCx infarction',
    profile: 'ischaemic_cardiomyopathy',
    reportType: 'stress',
    variantLabels: ['Matched scar', 'Peri-infarct ischaemia', 'Mixed viability', 'Advanced ischaemic CMP'],
    apply: (context, variantIndex) => applySingleTerritoryStressWithScar(context, 'LCx', variantIndex),
  },
  {
    key: 'stress-multivessel',
    group: 'Stress perfusion',
    label: 'Stress multivessel ischaemia',
    profile: 'ischaemic_cardiomyopathy',
    reportType: 'stress',
    variantLabels: ['Dual territory', 'Triple territory', 'Circumferential', 'Advanced multivessel'],
    apply: (context, variantIndex) => {
      context.payload.perfusion.adequateStress = true
      context.payload.perfusion.stressPersistenceBeats = 6

      if (variantIndex === 0) {
        setPerfusion(context.payload, 'stress', MULTIVESSEL_SEGMENTS.dualTerritory, 1)
        setValues(context.values, { 'LV EF': 46, 'LV EDV (i)': 98, MAPSE: 10 })
        return
      }

      if (variantIndex === 1) {
        setPerfusion(context.payload, 'stress', MULTIVESSEL_SEGMENTS.tripleTerritory, 1)
        setLge(context.payload, [4, 10, 15], 3, 1)
        setRwma(context.payload, [4, 10, 15], 2)
        setValues(context.values, { 'LV EF': 38, 'LV EDV (i)': 108, MAPSE: 9 })
        return
      }

      if (variantIndex === 2) {
        setPerfusion(context.payload, 'stress', MULTIVESSEL_SEGMENTS.circumferential, 1)
        setValues(context.values, { 'LV EF': 32, 'LV EDV (i)': 118, MAPSE: 8 })
        return
      }

      setPerfusion(context.payload, 'stress', MULTIVESSEL_SEGMENTS.advanced, 1)
      setMixedIschaemicScar(context.payload, [4, 10, 15], [5, 11, 16, 4, 10, 15])
      setRwma(context.payload, [4, 5, 10, 11, 15, 16], 2)
      setValues(context.values, { 'LV EF': 22, 'LV EDV (i)': 132, MAPSE: 6, 'MR regurgitant fraction': 28 })
    },
  },
  {
    key: 'scar-lad',
    group: 'Scar / tissue',
    label: 'Prior LAD infarction / viability study',
    profile: 'ischaemic_cardiomyopathy',
    variantLabels: ['Predominantly viable', 'Mixed viability', 'Predominantly non-viable', 'Aneurysmal remodelling'],
    apply: (context, variantIndex) => applyPriorInfarctionCase(context, 'LAD', variantIndex),
  },
  {
    key: 'scar-rca',
    group: 'Scar / tissue',
    label: 'Prior RCA infarction / viability study',
    profile: 'ischaemic_cardiomyopathy',
    variantLabels: ['Predominantly viable', 'Mixed viability', 'Predominantly non-viable', 'Aneurysmal remodelling'],
    apply: (context, variantIndex) => applyPriorInfarctionCase(context, 'RCA', variantIndex),
  },
  {
    key: 'tissue-dcm',
    group: 'Scar / tissue',
    label: 'Dilated cardiomyopathy with mid-wall fibrosis',
    profile: 'dilated_cardiomyopathy',
    variantLabels: ['Mild remodelling', 'Established DCM', 'Advanced DCM', 'Biventricular remodelling'],
    apply: (context, variantIndex) => {
      const segmentKey = (['mild', 'moderate', 'severe', 'biv'] as const)[variantIndex]
      setLge(context.payload, DCM_LGE_SEGMENTS[segmentKey], 2, 2)
      if (variantIndex < 2) {
        setRwma(context.payload, [2, 3, 8, 9], 1)
      } else {
        setRwma(context.payload, Object.keys(context.payload.rwma.segStates).map(Number), 1)
      }
      setValues(context.values, {
        'LV EF': [40, 32, 22, 28][variantIndex],
        'LV EDV (i)': [100, 118, 146, 132][variantIndex],
        'RV EF': [48, 44, 36, 34][variantIndex],
        'RV EDV (i)': [86, 96, 122, 128][variantIndex],
        MAPSE: [10, 8, 6, 7][variantIndex],
        ECV: [31, 34, 38, 36][variantIndex],
      })
    },
  },
  {
    key: 'tissue-myocarditis',
    group: 'Scar / tissue',
    label: 'Myocarditis phenotype',
    profile: 'myocarditis',
    variantLabels: ['Focal inferolateral', 'Multifocal', 'Myopericarditis', 'Reduced LV function'],
    apply: (context, variantIndex) => {
      const segmentSets = [
        MYOCARDITIS_SEGMENTS.inferolateral,
        MYOCARDITIS_SEGMENTS.multifocal,
        MYOCARDITIS_SEGMENTS.septolateral,
        MYOCARDITIS_SEGMENTS.extensive,
      ] as const
      setLge(context.payload, segmentSets[variantIndex], 2, 3)
      if (variantIndex >= 1) {
        setLge(context.payload, segmentSets[variantIndex].slice(0, 2), 2, 2)
      }
      if (variantIndex === 3) {
        setRwma(context.payload, [5, 11, 12, 16], 1)
      }
      setValues(context.values, {
        'LV EF': [56, 52, 48, 40][variantIndex],
        'Native T1': [1085, 1110, 1130, 1150][variantIndex],
        ECV: [31, 34, 36, 38][variantIndex],
        'Native T2': [55, 58, 60, 63][variantIndex],
      })
      if (variantIndex === 2) {
        context.payload.ph.choices.pericardialEffusion = 'small'
      }
    },
  },
  {
    key: 'tissue-hcm',
    group: 'Scar / tissue',
    label: 'Hypertrophic cardiomyopathy phenotype',
    profile: 'hypertrophic_cardiomyopathy',
    variantLabels: ['Asymmetric septal', 'Obstructive septal', 'Apical HCM', 'Extensive fibrosis'],
    apply: (context, variantIndex) => {
      const segmentSets = [
        HCM_SEGMENTS.septal,
        HCM_SEGMENTS.septalApical,
        HCM_SEGMENTS.apical,
        HCM_SEGMENTS.extensive,
      ] as const
      setLge(context.payload, segmentSets[variantIndex], 2, 2)
      setValues(context.values, {
        'LV peak wall thickness': [17, 21, 15, 24][variantIndex],
        'LV mass (i)': [62, 72, 58, 78][variantIndex],
        'LA max volume (i)': [40, 48, 36, 52][variantIndex],
        'AV maximum velocity': [2.0, 3.0, 1.8, 2.8][variantIndex],
        'AV mean pressure gradient': [9, 18, 6, 14][variantIndex],
      })
      if (variantIndex === 2) {
        setRwma(context.payload, [13, 14, 17], 1)
      }
    },
  },
  {
    key: 'tissue-sarcoid',
    group: 'Scar / tissue',
    label: 'Cardiac sarcoid phenotype',
    profile: 'myocarditis',
    variantLabels: ['Basal septal', 'Multifocal', 'Septal dyskinesis', 'Biventricular involvement'],
    apply: (context, variantIndex) => {
      const segmentSets = [
        SARCOID_SEGMENTS.septal,
        SARCOID_SEGMENTS.multifocal,
        SARCOID_SEGMENTS.rvInsertionLike,
        SARCOID_SEGMENTS.extensive,
      ] as const
      setLge(context.payload, segmentSets[variantIndex], 2, 2)
      setLge(context.payload, segmentSets[variantIndex].slice(0, 2), 2, 3)
      if (variantIndex >= 2) {
        setRwma(context.payload, [2, 8], variantIndex === 2 ? 3 : 2)
      }
      setValues(context.values, {
        'LV EF': [54, 48, 40, 34][variantIndex],
        'RV EF': [52, 46, 42, 38][variantIndex],
        'Native T1': [1065, 1090, 1105, 1120][variantIndex],
        'Native T2': [50, 53, 54, 56][variantIndex],
      })
    },
  },
  {
    key: 'valve-severe-as',
    group: 'Valves',
    label: 'Calcific aortic stenosis',
    profile: 'severe_aortic_stenosis',
    nonContrast: true,
    variantLabels: ['Classic severe AS', 'Severe AS with LV dysfunction', 'Severe AS with mild AR', 'Advanced calcific AS'],
    apply: (context, variantIndex) => {
      context.payload.valves.selectedValve = 'aortic'
      setFinding(context.payload, 'aortic', 'calcified', {
        leaflets: ['Right coronary cusp', 'Left coronary cusp', 'Non-coronary cusp'],
        detailValues: {
          Extent: variantIndex >= 2 ? 'Diffuse' : 'Focal',
          Severity: variantIndex >= 1 ? 'Severe' : 'Moderate',
        },
      })
      setFinding(context.payload, 'aortic', 'restricted', {
        leaflets: ['Right coronary cusp', 'Left coronary cusp', 'Non-coronary cusp'],
      })
      setValues(context.values, {
        'AV maximum velocity': [4.1, 4.3, 4.4, 4.7][variantIndex],
        'AV mean pressure gradient': [42, 48, 52, 60][variantIndex],
        'AV maximum pressure gradient': [67, 74, 78, 88][variantIndex],
        'LV EF': [55, 40, 50, 36][variantIndex],
        'LV peak wall thickness': [13, 14, 14, 16][variantIndex],
        'LV mass (i)': [58, 66, 68, 74][variantIndex],
        'LA max volume (i)': [40, 48, 42, 56][variantIndex],
      })
      if (variantIndex >= 2) {
        setValues(context.values, {
          'AV regurgitant fraction': variantIndex === 2 ? 12 : 18,
          'AV backward flow (per heartbeat)': variantIndex === 2 ? 8 : 14,
        })
      }
    },
  },
  {
    key: 'valve-bicuspid-as-ar',
    group: 'Valves',
    label: 'Bicuspid aortic valve with mixed disease',
    profile: 'severe_aortic_stenosis',
    nonContrast: true,
    variantLabels: ['Moderate mixed disease', 'Severe AS + moderate AR', 'Moderate AS + severe AR', 'Advanced bicuspid disease'],
    apply: (context, variantIndex) => {
      context.payload.valves.selectedValve = 'aortic'
      setFinding(context.payload, 'aortic', 'bicuspid', {
        detailValues: {
          Fusion: variantIndex >= 2 ? 'R-N' : 'R-L',
          Raphe: variantIndex >= 1 ? 'High' : 'Low',
        },
      })
      setFinding(context.payload, 'aortic', 'calcified', {
        leaflets: ['Right coronary cusp', 'Left coronary cusp'],
        detailValues: {
          Extent: 'Diffuse',
          Severity: variantIndex >= 1 ? 'Moderate' : 'Mild',
        },
      })
      setValues(context.values, {
        'Asc aorta diameter': [39, 42, 44, 47][variantIndex],
        'AV maximum velocity': [3.2, 4.1, 3.4, 4.3][variantIndex],
        'AV mean pressure gradient': [24, 42, 28, 48][variantIndex],
        'AV regurgitant fraction': [18, 28, 42, 34][variantIndex],
        'AV backward flow (per heartbeat)': [12, 20, 34, 28][variantIndex],
      })
    },
  },
  {
    key: 'valve-degenerative-mr',
    group: 'Valves',
    label: 'Degenerative mitral regurgitation',
    profile: 'normal',
    variantLabels: ['Posterior prolapse', 'Flail posterior leaflet', 'Bileaflet myxomatous', 'Calcific degenerative MR'],
    apply: (context, variantIndex) => {
      context.payload.valves.selectedValve = 'mitral'
      if (variantIndex === 0) {
        setFinding(context.payload, 'mitral', 'prolapse', {
          leaflets: ['Posterior'],
          detailValues: { Type: 'prolapse' },
        })
        setValues(context.values, {
          'MR regurgitant fraction': 24,
          'MR volume (per heartbeat)': 24,
          'LA max volume (i)': 44,
        })
        return
      }

      if (variantIndex === 1) {
        setFinding(context.payload, 'mitral', 'prolapse', {
          leaflets: ['Posterior'],
          detailValues: { Type: 'flail' },
        })
        setFinding(context.payload, 'mitral', 'chordalRupture', {})
        setValues(context.values, {
          'MR regurgitant fraction': 48,
          'MR volume (per heartbeat)': 62,
          'LA max volume (i)': 58,
          'LV EDV (i)': 102,
          'LV EF': 58,
        })
        return
      }

      if (variantIndex === 2) {
        setFinding(context.payload, 'mitral', 'prolapse', {
          leaflets: ['Anterior', 'Posterior'],
          detailValues: { Type: 'prolapse' },
        })
        setFinding(context.payload, 'mitral', 'myxomatous', {
          detailValues: { Type: 'barlow' },
        })
        setFinding(context.payload, 'mitral', 'annularDisjunction', {
          detailValues: { Distance: '8' },
        })
        setValues(context.values, {
          'MR regurgitant fraction': 28,
          'MR volume (per heartbeat)': 32,
          'LA max volume (i)': 46,
        })
        return
      }

      setFinding(context.payload, 'mitral', 'calcified', {
        leaflets: ['Posterior'],
        detailValues: { Extent: 'Focal', Severity: 'Moderate' },
      })
      setFinding(context.payload, 'mitral', 'annularDilatation', {
        detailValues: { Diameter: '42' },
      })
      setValues(context.values, {
        'MR regurgitant fraction': 34,
        'MR volume (per heartbeat)': 38,
        'LA max volume (i)': 54,
        'LV EDV (i)': 96,
      })
    },
  },
  {
    key: 'valve-functional-tr',
    group: 'Valves',
    label: 'Functional / secondary tricuspid regurgitation',
    profile: 'pulmonary_hypertension',
    variantLabels: ['Annular dilatation', 'Tethering', 'Pacemaker lead', 'Severe secondary TR'],
    apply: (context, variantIndex) => {
      context.payload.valves.selectedValve = 'tricuspid'
      if (variantIndex === 0) {
        setFinding(context.payload, 'tricuspid', 'annularDilatation', {
          detailValues: { Diameter: '42' },
        })
        setValues(context.values, {
          'TR regurgitant fraction': 18,
          'TR volume (per heartbeat)': 18,
          'RA max volume (i)': 42,
          'RV EDV (i)': 98,
        })
        return
      }

      if (variantIndex === 1) {
        setFinding(context.payload, 'tricuspid', 'tethering', {
          detailValues: { 'Tenting height': '11', 'Tenting area': '1.8', Carpentier: 'IIIb' },
        })
        setFinding(context.payload, 'tricuspid', 'annularDilatation', {
          detailValues: { Diameter: '46' },
        })
        setValues(context.values, {
          'TR regurgitant fraction': 28,
          'TR volume (per heartbeat)': 30,
          'RA max volume (i)': 48,
          'RV EDV (i)': 118,
          'RV EF': 40,
        })
        return
      }

      if (variantIndex === 2) {
        setFinding(context.payload, 'tricuspid', 'pacemakerLead', {
          detailValues: { Mechanism: 'interfering with leaflet coaptation' },
        })
        setValues(context.values, {
          'TR regurgitant fraction': 34,
          'TR volume (per heartbeat)': 34,
          'RA max volume (i)': 52,
          'RV EDV (i)': 110,
        })
        return
      }

      setFinding(context.payload, 'tricuspid', 'annularDilatation', {
        detailValues: { Diameter: '52' },
      })
      setFinding(context.payload, 'tricuspid', 'tethering', {
        detailValues: { 'Tenting height': '13', 'Tenting area': '2.2', Carpentier: 'IIIb' },
      })
      setValues(context.values, {
        'TR regurgitant fraction': 46,
        'TR volume (per heartbeat)': 48,
        'RA max volume (i)': 60,
        'RV EDV (i)': 142,
        'RV EF': 32,
        mRAP: 18,
      })
    },
  },
  {
    key: 'ph-low',
    group: 'PH',
    label: 'Low-probability PH physiology',
    profile: 'normal',
    reportType: 'standard',
    fourDFlow: true,
    nonContrast: true,
    variantLabels: ['No convincing PH', 'Borderline PA calibre', 'Mild vortex only', 'Borderline RV size'],
    apply: (context, variantIndex) => {
      context.payload.ph.selectedSection = 'summary'
      setPhNumeric(context.payload, 'mainPaNetFlow', 74)
      setPhNumeric(context.payload, 'rpaNetFlow', 38)
      setPhNumeric(context.payload, 'lpaNetFlow', 36)

      if (variantIndex === 0) {
        return
      }
      if (variantIndex === 1) {
        setValues(context.values, { 'MPA systolic diameter': 29, 'MPA distension': 22 })
        return
      }
      if (variantIndex === 2) {
        setPhChoice(context.payload, 'vortexFormation', 'present')
        setPhChoice(context.payload, 'vortexSeverity', 'mild')
        setValues(context.values, { 'MPA systolic diameter': 30, 'MPA distension': 20 })
        return
      }
      setValues(context.values, { 'RV EDV (i)': 106, 'RV EF': 49, 'RA max volume (i)': 36 })
    },
  },
  {
    key: 'ph-precapillary',
    group: 'PH',
    label: 'Pre-capillary PH phenotype',
    profile: 'pulmonary_hypertension',
    reportType: 'standard',
    fourDFlow: true,
    nonContrast: true,
    variantLabels: ['Early pressure overload', 'Established precapillary PH', 'RV-PA uncoupling', 'Advanced precapillary PH'],
    apply: (context, variantIndex) => {
      context.payload.ph.selectedSection = 'summary'
      setPhNumeric(context.payload, 'mainPaNetFlow', [70, 68, 64, 58][variantIndex])
      setPhNumeric(context.payload, 'rpaNetFlow', [34, 36, 30, 24][variantIndex])
      setPhNumeric(context.payload, 'lpaNetFlow', [36, 32, 34, 34][variantIndex])
      setPhChoice(context.payload, 'vortexFormation', 'present')
      setPhChoice(context.payload, 'vortexSeverity', (['mild', 'moderate', 'marked', 'marked'] as const)[variantIndex])
      if (variantIndex >= 1) {
        setPhChoice(context.payload, 'septalFlattening', variantIndex >= 2 ? 'both' : 'systolic')
        setPhChoice(context.payload, 'septalMotion', variantIndex >= 2 ? 'dyskinetic' : 'paradoxical')
        setPhChoice(context.payload, 'helicity', 'present')
        setPhChoice(context.payload, 'helicitySeverity', variantIndex >= 2 ? 'marked' : 'moderate')
      }
      if (variantIndex === 3) {
        setPhChoice(context.payload, 'pericardialEffusion', 'small')
        setPhChoice(context.payload, 'venaCava', 'dilated')
      }
      setValues(context.values, {
        PCWP: [9, 10, 10, 11][variantIndex],
        mRAP: [8, 10, 14, 18][variantIndex],
        'RV EF': [46, 40, 32, 24][variantIndex],
        'RV EDV (i)': [102, 120, 142, 168][variantIndex],
        'RV mass (i)': [24, 28, 34, 40][variantIndex],
        'RA max volume (i)': [34, 44, 56, 68][variantIndex],
        'TR regurgitant fraction': [12, 24, 34, 44][variantIndex],
        'TR volume (per heartbeat)': [10, 22, 34, 46][variantIndex],
        'MPA systolic diameter': [31, 34, 37, 40][variantIndex],
        'MPA distension': [18, 14, 10, 6][variantIndex],
        'LV EF': [60, 58, 56, 54][variantIndex],
      })
    },
  },
  {
    key: 'ph-postcapillary',
    group: 'PH',
    label: 'Post-capillary / mixed PH phenotype',
    profile: 'dilated_cardiomyopathy',
    reportType: 'standard',
    fourDFlow: true,
    variantLabels: ['Intermediate mixed physiology', 'High mixed physiology', 'Advanced left-heart loading', 'Advanced mixed PH'],
    apply: (context, variantIndex) => {
      context.payload.ph.selectedSection = 'summary'
      setPhChoice(context.payload, 'vortexFormation', variantIndex >= 2 ? 'present' : 'absent')
      if (variantIndex >= 2) {
        setPhChoice(context.payload, 'vortexSeverity', variantIndex === 2 ? 'moderate' : 'marked')
      }
      setPhChoice(context.payload, 'septalFlattening', variantIndex >= 1 ? 'systolic' : 'none')
      setPhChoice(context.payload, 'septalMotion', variantIndex >= 1 ? 'dyskinetic' : 'normal')
      setPhChoice(context.payload, 'interatrialSeptalBowing', variantIndex >= 1 ? 'toward-la' : 'none')
      if (variantIndex === 3) {
        setPhChoice(context.payload, 'venaCava', 'dilated')
      }
      setPhNumeric(context.payload, 'mainPaNetFlow', [66, 62, 58, 52][variantIndex])
      setPhNumeric(context.payload, 'rpaNetFlow', [32, 29, 25, 22][variantIndex])
      setPhNumeric(context.payload, 'lpaNetFlow', [34, 33, 33, 30][variantIndex])
      setValues(context.values, {
        PCWP: [16, 22, 24, 26][variantIndex],
        'LV EF': [36, 24, 20, 18][variantIndex],
        'LA max volume (i)': [46, 58, 62, 68][variantIndex],
        'MR regurgitant fraction': [22, 32, 38, 44][variantIndex],
        'MR volume (per heartbeat)': [24, 34, 42, 50][variantIndex],
        'RV EDV (i)': [96, 108, 118, 138][variantIndex],
        'RV EF': [48, 44, 38, 30][variantIndex],
        'TR regurgitant fraction': [10, 18, 28, 36][variantIndex],
        'MPA systolic diameter': [30, 32, 34, 36][variantIndex],
        'MPA distension': [18, 16, 12, 8][variantIndex],
      })
    },
  },
  {
    key: 'ph-advanced',
    group: 'PH',
    label: 'Advanced pulmonary hypertension / right-heart failure',
    profile: 'pulmonary_hypertension',
    reportType: 'standard',
    fourDFlow: true,
    nonContrast: true,
    variantLabels: ['Marked RV dilatation', 'RV failure + effusion', 'Branch flow asymmetry', 'Very advanced RV failure'],
    apply: (context, variantIndex) => {
      context.payload.ph.selectedSection = 'summary'
      setPhChoice(context.payload, 'septalFlattening', 'both')
      setPhChoice(context.payload, 'septalMotion', 'dyskinetic')
      setPhChoice(context.payload, 'interatrialSeptalBowing', 'toward-la')
      setPhChoice(context.payload, 'vortexFormation', 'present')
      setPhChoice(context.payload, 'vortexSeverity', 'marked')
      setPhChoice(context.payload, 'helicity', 'present')
      setPhChoice(context.payload, 'helicitySeverity', 'marked')
      setPhChoice(context.payload, 'venaCava', 'dilated')
      if (variantIndex >= 1) {
        setPhChoice(context.payload, 'pericardialEffusion', variantIndex === 3 ? 'moderate' : 'small')
      }
      setPhNumeric(context.payload, 'mainPaNetFlow', [58, 54, 52, 46][variantIndex])
      setPhNumeric(context.payload, 'rpaNetFlow', [28, 22, 18, 14][variantIndex])
      setPhNumeric(context.payload, 'lpaNetFlow', [30, 32, 34, 32][variantIndex])
      setValues(context.values, {
        PCWP: [10, 11, 10, 12][variantIndex],
        mRAP: [14, 18, 20, 24][variantIndex],
        'RV EF': [28, 24, 22, 18][variantIndex],
        'RV EDV (i)': [154, 166, 174, 188][variantIndex],
        'RV mass (i)': [36, 40, 42, 48][variantIndex],
        'RV SV (i)': [28, 24, 22, 18][variantIndex],
        'RV CI': [2.0, 1.8, 1.6, 1.3][variantIndex],
        'RA max volume (i)': [62, 72, 74, 82][variantIndex],
        'TR regurgitant fraction': [38, 44, 48, 56][variantIndex],
        'TR volume (per heartbeat)': [36, 44, 48, 56][variantIndex],
        'MPA systolic diameter': [38, 40, 42, 44][variantIndex],
        'MPA distension': [8, 6, 5, 4][variantIndex],
      })
    },
  },
  {
    key: 'thrombus-lv-apical',
    group: 'Thrombus',
    label: 'LV apical thrombus',
    profile: 'ischaemic_cardiomyopathy',
    variantLabels: ['Definite mural', 'Definite protruding', 'Probable scar-related', 'Large dyskinetic apex'],
    apply: (context, variantIndex) => {
      applyPriorInfarctionCase(context, 'LAD', 3)
      setSingleThrombus(context.payload, {
        primary: 'LV',
        sublocation: ['Apex', 'Apical anterior', 'Attached to scar region', 'Apex'][variantIndex],
        confidence: (['definite', 'definite', 'probable', 'definite'] as const)[variantIndex],
        postContrast: (['non-enhancing-supportive', 'non-enhancing-supportive', 'indeterminate', 'non-enhancing-supportive'] as const)[variantIndex],
        morphology: {
          maxDiameter: [10, 16, 12, 22][variantIndex],
          shape: (['mural', 'protruding', 'mural', 'pedunculated'] as const)[variantIndex],
          mobility: (['fixed', 'mildly-mobile', 'fixed', 'highly-mobile'] as const)[variantIndex],
          attachment: (['broad-based', 'narrow-stalk', 'broad-based', 'narrow-stalk'] as const)[variantIndex],
          surface: (['smooth', 'smooth', 'irregular', 'irregular'] as const)[variantIndex],
        },
      })
      setValues(context.values, {
        'LV EF': [26, 24, 28, 20][variantIndex],
        'LV EDV (i)': [124, 132, 118, 140][variantIndex],
      })
    },
  },
  {
    key: 'thrombus-laa',
    group: 'Thrombus',
    label: 'Left atrial appendage thrombus',
    profile: 'normal',
    variantLabels: ['Definite LAA tip', 'Probable LAA body', 'Indeterminate LAA', 'Large definite LAA'],
    apply: (context, variantIndex) => {
      setValues(context.values, {
        'LA max volume (i)': [46, 52, 48, 60][variantIndex],
        'LA min volume (i)': [24, 30, 28, 38][variantIndex],
        PCWP: [14, 16, 15, 18][variantIndex],
      })
      setSingleThrombus(context.payload, {
        primary: 'LAA',
        sublocation: (['Tip', 'Body', 'Tip', 'Body'] as const)[variantIndex],
        confidence: (['definite', 'probable', 'indeterminate', 'definite'] as const)[variantIndex],
        postContrast: (['non-enhancing-supportive', 'indeterminate', 'no-supportive-abnormality', 'non-enhancing-supportive'] as const)[variantIndex],
        morphology: {
          maxDiameter: [12, 10, 9, 18][variantIndex],
          shape: (['protruding', 'protruding', 'mural', 'protruding'] as const)[variantIndex],
          mobility: (['fixed', 'mildly-mobile', 'fixed', 'mildly-mobile'] as const)[variantIndex],
          attachment: (['broad-based', 'narrow-stalk', 'broad-based', 'broad-based'] as const)[variantIndex],
          surface: (['smooth', 'smooth', 'irregular', 'smooth'] as const)[variantIndex],
        },
      })
    },
  },
  {
    key: 'thrombus-ra-device',
    group: 'Thrombus',
    label: 'Device-related right atrial thrombus',
    profile: 'pulmonary_hypertension',
    variantLabels: ['Probable lead-associated', 'Definite lead-associated', 'Probable prosthetic-associated', 'Large definite device thrombus'],
    apply: (context, variantIndex) => {
      setValues(context.values, {
        'RA max volume (i)': [44, 50, 48, 58][variantIndex],
        'TR regurgitant fraction': [18, 22, 16, 30][variantIndex],
        'RV EDV (i)': [96, 108, 102, 118][variantIndex],
      })
      setSingleThrombus(context.payload, {
        primary: 'Device',
        sublocation: (['Lead-associated', 'Lead-associated', 'Prosthetic valve', 'Lead-associated'] as const)[variantIndex],
        confidence: (['probable', 'definite', 'probable', 'definite'] as const)[variantIndex],
        postContrast: (['indeterminate', 'non-enhancing-supportive', 'indeterminate', 'non-enhancing-supportive'] as const)[variantIndex],
        morphology: {
          maxDiameter: [8, 14, 10, 20][variantIndex],
          shape: (['mural', 'protruding', 'mural', 'pedunculated'] as const)[variantIndex],
          mobility: (['fixed', 'mildly-mobile', 'fixed', 'mildly-mobile'] as const)[variantIndex],
          attachment: (['broad-based', 'narrow-stalk', 'broad-based', 'narrow-stalk'] as const)[variantIndex],
          surface: (['smooth', 'smooth', 'irregular', 'irregular'] as const)[variantIndex],
        },
      })
    },
  },
  {
    key: 'thrombus-rv',
    group: 'Thrombus',
    label: 'Right ventricular thrombus',
    profile: 'pulmonary_hypertension',
    variantLabels: ['RV apical', 'RV free wall', 'RV septal', 'Large mobile RV thrombus'],
    apply: (context, variantIndex) => {
      setValues(context.values, {
        'RV EF': [34, 30, 28, 24][variantIndex],
        'RV EDV (i)': [128, 138, 146, 158][variantIndex],
        'RA max volume (i)': [48, 52, 56, 62][variantIndex],
      })
      setSingleThrombus(context.payload, {
        primary: 'RV',
        sublocation: (['Apex', 'Free wall', 'Septal', 'Apex'] as const)[variantIndex],
        confidence: (['definite', 'probable', 'definite', 'definite'] as const)[variantIndex],
        postContrast: (['non-enhancing-supportive', 'indeterminate', 'non-enhancing-supportive', 'non-enhancing-supportive'] as const)[variantIndex],
        morphology: {
          maxDiameter: [10, 12, 14, 24][variantIndex],
          shape: (['mural', 'protruding', 'mural', 'pedunculated'] as const)[variantIndex],
          mobility: (['fixed', 'mildly-mobile', 'fixed', 'highly-mobile'] as const)[variantIndex],
          attachment: (['broad-based', 'narrow-stalk', 'broad-based', 'narrow-stalk'] as const)[variantIndex],
          surface: (['smooth', 'smooth', 'irregular', 'irregular'] as const)[variantIndex],
        },
      })
    },
  },
]

export const CMR_SYNTHETIC_CASE_LIBRARY: SyntheticCaseDefinition[] = CASE_SPECS.flatMap((spec) =>
  spec.variantLabels.map((variantLabel, variantIndex) => ({
    id: `${spec.key}-${variantIndex + 1}`,
    group: spec.group,
    label: `${spec.label} — ${variantLabel}`,
    baseLabel: spec.label,
    variantLabel,
    profile: spec.profile,
    reportType: spec.reportType ?? 'standard',
    fourDFlow: spec.fourDFlow ?? false,
    nonContrast: spec.nonContrast ?? false,
  })),
)

function finalizeSyntheticCase(
  definition: SyntheticCaseDefinition,
  payload: CmrCasePayload,
  demographics: Demographics,
  values: Record<string, number>,
  studyDate: string,
): SyntheticCmrCase {
  applySyntheticConsistency(values, OUTPUT_PARAMS, demographics)

  payload.reportInput = {
    reportText: formatSyntheticReportText(values, OUTPUT_PARAMS, demographics, definition.label),
    reportType: definition.reportType,
    fourDFlow: definition.fourDFlow,
    nonContrast: definition.nonContrast,
    fileName: null,
  }
  payload.extractionResult = buildExtractionResult(demographics, studyDate, values)

  maybeSetModuleSummaries(payload, values, demographics)

  const caseNumber = CMR_SYNTHETIC_CASE_LIBRARY.findIndex((item) => item.id === definition.id) + 1

  return {
    definition,
    payload,
    title: `Synthetic CMR ${String(caseNumber).padStart(3, '0')} — ${definition.baseLabel}`,
    patientLabel: `Synthetic case ${String(caseNumber).padStart(3, '0')}`,
    studyDate,
  }
}

function buildMeasurementMap(extractionResult: CmrExtractionResult | null): Map<string, number> {
  const measurementMap = new Map<string, number>()
  for (const measurement of extractionResult?.measurements ?? []) {
    measurementMap.set(measurement.parameter, measurement.value)
  }
  return measurementMap
}

function toSyntheticDemographics(extractionResult: CmrExtractionResult): Demographics {
  const heightCm = extractionResult.demographics.height_cm ?? 175
  const weightKg = extractionResult.demographics.weight_kg ?? 75
  const heightM = heightCm / 100
  return {
    sex: extractionResult.demographics.sex === 'Female' ? 'Female' : 'Male',
    age: extractionResult.demographics.age ?? 55,
    height: heightCm,
    weight: weightKg,
    bsa: extractionResult.demographics.bsa ?? (heightM > 0 ? roundTo(Math.sqrt((heightCm * weightKg) / 3600), 2) : 1.9),
    hr: extractionResult.demographics.heart_rate ?? 70,
  }
}

function buildValueRecord(measurementMap: Map<string, number>): Record<string, number> {
  return Object.fromEntries(measurementMap.entries())
}

function buildPhChoices(payload: CmrCasePayload): PhSummaryChoices {
  return {
    ...PRIMARY_PH_CHOICES,
    septalFlattening: (payload.ph.choices.septalFlattening as PhSummaryChoices['septalFlattening']) ?? PRIMARY_PH_CHOICES.septalFlattening,
    septalMotion: (payload.ph.choices.septalMotion as PhSummaryChoices['septalMotion']) ?? PRIMARY_PH_CHOICES.septalMotion,
    interatrialSeptalBowing: (payload.ph.choices.interatrialSeptalBowing as PhSummaryChoices['interatrialSeptalBowing']) ?? PRIMARY_PH_CHOICES.interatrialSeptalBowing,
    pericardialEffusion: (payload.ph.choices.pericardialEffusion as PhSummaryChoices['pericardialEffusion']) ?? PRIMARY_PH_CHOICES.pericardialEffusion,
    venaCava: (payload.ph.choices.venaCava as PhSummaryChoices['venaCava']) ?? PRIMARY_PH_CHOICES.venaCava,
    trSeverity: normalizePhRegurgitationChoice(payload.ph.choices.trSeverity as PhSummaryChoices['trSeverity'] | undefined) ?? PRIMARY_PH_CHOICES.trSeverity,
    mrSeverity: normalizePhRegurgitationChoice(payload.ph.choices.mrSeverity as PhSummaryChoices['mrSeverity'] | undefined) ?? PRIMARY_PH_CHOICES.mrSeverity,
    vortexFormation: (payload.ph.choices.vortexFormation as PhSummaryChoices['vortexFormation']) ?? PRIMARY_PH_CHOICES.vortexFormation,
    vortexSeverity: (payload.ph.choices.vortexSeverity as PhSummaryChoices['vortexSeverity']) ?? PRIMARY_PH_CHOICES.vortexSeverity,
    vortexLocation: (payload.ph.choices.vortexLocation as PhSummaryChoices['vortexLocation']) ?? PRIMARY_PH_CHOICES.vortexLocation,
    helicity: (payload.ph.choices.helicity as PhSummaryChoices['helicity']) ?? PRIMARY_PH_CHOICES.helicity,
    helicitySeverity: (payload.ph.choices.helicitySeverity as PhSummaryChoices['helicitySeverity']) ?? PRIMARY_PH_CHOICES.helicitySeverity,
    helicityLocation: (payload.ph.choices.helicityLocation as PhSummaryChoices['helicityLocation']) ?? PRIMARY_PH_CHOICES.helicityLocation,
  }
}

function buildThrombusSummaryEntries(entries: CmrThrombusEntryDraft[]): ThrombusSummaryEntryInput[] {
  return entries.map((entry) => ({
    id: entry.id,
    primary: (entry.primary as ThrombusSummaryEntryInput['primary']) ?? null,
    sublocation: entry.sublocation,
    otherLocation: entry.otherLocation,
    morphology: {
      maxDiameter: entry.morphology.maxDiameter,
      shape: (entry.morphology.shape as ThrombusSummaryEntryInput['morphology']['shape']) ?? null,
      mobility: (entry.morphology.mobility as ThrombusSummaryEntryInput['morphology']['mobility']) ?? null,
      attachment: (entry.morphology.attachment as ThrombusSummaryEntryInput['morphology']['attachment']) ?? null,
      surface: (entry.morphology.surface as ThrombusSummaryEntryInput['morphology']['surface']) ?? null,
    },
    confidence: (entry.confidence as ThrombusSummaryEntryInput['confidence']) ?? null,
    postContrast: (entry.postContrast as ThrombusSummaryEntryInput['postContrast']) ?? null,
  }))
}

async function generateProseWithFallback<TSummary extends { deterministicText: string }>(
  label: string,
  generator: (summaryData: TSummary) => Promise<string>,
  summaryData: TSummary,
  warnings: string[],
): Promise<string> {
  try {
    return await generator(summaryData)
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    warnings.push(`${label}: ${message}`)
    return summaryData.deterministicText
  }
}

async function generateConclusionsWithFallback(
  reportType: ReportType,
  deterministicLines: string[],
  warnings: string[],
): Promise<string[]> {
  if (deterministicLines.length === 0) return []
  try {
    return await generateCmrReportConclusions({ reportType, deterministicLines })
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    warnings.push(`Report output: ${message}`)
    return deterministicLines
  }
}

function shouldIncludePhAssessment(phSummaryData: PhSummaryData): boolean {
  if (phSummaryData.probability === 'low' || phSummaryData.phenotype === 'no-definite-ph') {
    return false
  }

  if (phSummaryData.phenotype !== 'post-capillary-or-mixed') {
    return true
  }

  const independentPhSignals = [
    ...phSummaryData.rvRemodellingFindings,
    ...phSummaryData.rvMaladaptationFindings,
    ...phSummaryData.pressureOverloadFindings,
    ...phSummaryData.pulmonaryVascularFindings,
  ].filter(Boolean)

  return independentPhSignals.length > 0
}

export async function enrichSyntheticCmrCaseWithLlm(
  syntheticCase: SyntheticCmrCase,
): Promise<SyntheticCmrCaseGenerationResult> {
  const warnings: string[] = []
  const extractionResult = syntheticCase.payload.extractionResult
  if (!extractionResult) {
    return { syntheticCase, warnings: ['Synthetic case has no extraction result.'] }
  }

  const measurementMap = buildMeasurementMap(extractionResult)
  const values = buildValueRecord(measurementMap)
  const reportType: ReportType = syntheticCase.payload.reportInput.reportType === 'stress' ? 'stress' : 'standard'
  const paramMap = buildCanonicalLookup(toSyntheticDemographics(extractionResult))

  const rwmaSegStates = syntheticCase.payload.rwma.segStates as Record<number, RwmaCode>
  const lgeSegStates = syntheticCase.payload.lge.segStates as Record<number, LgeCode>
  const lgePatternStates = syntheticCase.payload.lge.patternStates as Record<number, PatternCode>
  const perfusionPayload = syntheticCase.payload.perfusion

  const rwmaSummaryData = buildRwmaSummaryData(rwmaSegStates)
  const lgeSummaryData: LgeSummaryData = buildLgeSummaryData(lgeSegStates, lgePatternStates)
  const perfusionSummaryData: PerfusionSummaryData = buildPerfusionSummaryData({
    restSegStates: perfusionPayload.restSegStates as Record<number, PerfusionCode>,
    stressSegStates: perfusionPayload.stressSegStates as Record<number, PerfusionCode>,
    restPersistenceBeats: perfusionPayload.restPersistenceBeats,
    stressPersistenceBeats: perfusionPayload.stressPersistenceBeats,
    adequateStress: perfusionPayload.adequateStress,
    lgeSegStates,
    lgePatternStates,
  })
  const mitralSummaryData = buildMitralValveSummaryData(measurementMap, syntheticCase.payload.valves.morphologies.mitral)
  const aorticSummaryData = buildAorticValveSummaryData(measurementMap, syntheticCase.payload.valves.morphologies.aortic)
  const tricuspidSummaryData = buildTricuspidValveSummaryData(measurementMap, syntheticCase.payload.valves.morphologies.tricuspid)
  const thrombusSummaryData: ThrombusSummaryData = buildThrombusSummaryData(
    buildThrombusSummaryEntries(syntheticCase.payload.thrombus.entries),
  )
  const phSummaryData = buildPhSummaryData(
    buildPhMeasurements(syntheticCase.payload, values),
    paramMap,
    buildPhChoices(syntheticCase.payload),
  )

  const [
    rwmaProse,
    lgeProse,
    perfusionProse,
    mitralProse,
    aorticProse,
    tricuspidProse,
    thrombusProse,
    phProse,
  ] = await Promise.all([
    generateProseWithFallback('RWMA summary', generateCmrRwmaProse, rwmaSummaryData, warnings),
    generateProseWithFallback('LGE summary', generateCmrLgeProse, lgeSummaryData, warnings),
    generateProseWithFallback('Perfusion summary', generateCmrPerfusionProse, perfusionSummaryData, warnings),
    generateProseWithFallback('Mitral valve summary', generateCmrMitralValveProse, mitralSummaryData, warnings),
    generateProseWithFallback('Aortic valve summary', generateCmrAorticValveProse, aorticSummaryData, warnings),
    generateProseWithFallback('Tricuspid valve summary', generateCmrTricuspidValveProse, tricuspidSummaryData, warnings),
    generateProseWithFallback('Thrombus summary', generateCmrThrombusProse, thrombusSummaryData, warnings),
    generateProseWithFallback('PH summary', generateCmrPhProse, phSummaryData, warnings),
  ])

  const valveText = buildValveSummarySentence(measurementMap, {
    mitralSummaryText: mitralProse,
    aorticSummaryText: aorticProse,
    tricuspidSummaryText: tricuspidProse,
  })
  const includeValveAssessment = shouldIncludeValveAssessment(valveText)
  const includePhAssessment = shouldIncludePhAssessment(phSummaryData)

  const plannedConclusionLines = buildReportConclusions({
    measurementMap,
    paramMap,
    reportType,
    rwmaData: rwmaSummaryData,
    tissueStatement: lgeProse,
    perfusionData: perfusionSummaryData,
    lgeData: lgeSummaryData,
    valveText,
    includeValveAssessment,
    phText: phProse,
    includePhAssessment,
    thrombusData: thrombusSummaryData,
    thrombusText: thrombusProse,
  })

  const generatedConclusionLines = await generateConclusionsWithFallback(reportType, plannedConclusionLines, warnings)

  const nextPayload: CmrCasePayload = {
    ...syntheticCase.payload,
    rwma: {
      ...syntheticCase.payload.rwma,
      llmProse: rwmaProse,
      llmProseSourceSignature: buildRwmaSummarySignature(rwmaSegStates),
    },
    lge: {
      ...syntheticCase.payload.lge,
      llmProse: lgeProse,
      llmProseSourceSignature: buildLgeSummarySignature(lgeSegStates, lgePatternStates),
    },
    perfusion: {
      ...syntheticCase.payload.perfusion,
      llmProse: perfusionProse,
      llmProseSourceSignature: buildPerfusionSummarySignature(
        perfusionPayload.restSegStates as Record<number, PerfusionCode>,
        perfusionPayload.stressSegStates as Record<number, PerfusionCode>,
        perfusionPayload.restPersistenceBeats,
        perfusionPayload.stressPersistenceBeats,
        perfusionPayload.adequateStress,
        lgeSegStates,
        lgePatternStates,
      ),
    },
    ph: {
      ...syntheticCase.payload.ph,
      llmProse: phProse,
      llmProseSourceSignature: buildPhSummarySignature(phSummaryData),
    },
    valves: {
      ...syntheticCase.payload.valves,
      summaries: {
        ...syntheticCase.payload.valves.summaries,
        mitral: {
          llmProse: mitralProse,
          llmProseSourceSignature: buildMitralValveSummarySignature(mitralSummaryData),
        },
        aortic: {
          llmProse: aorticProse,
          llmProseSourceSignature: buildAorticValveSummarySignature(aorticSummaryData),
        },
        tricuspid: {
          llmProse: tricuspidProse,
          llmProseSourceSignature: buildTricuspidValveSummarySignature(tricuspidSummaryData),
        },
      },
    },
    thrombus: {
      ...syntheticCase.payload.thrombus,
      llmProse: thrombusProse,
      llmProseSourceSignature: buildThrombusSummarySignature(thrombusSummaryData),
    },
    output: {
      ...syntheticCase.payload.output,
      reportGenerated: true,
      conclusionLines: generatedConclusionLines,
      conclusionSourceSignature: buildReportConclusionSourceSignature(plannedConclusionLines),
      includeValveAssessment,
      includePhAssessment,
    },
  }

  return {
    syntheticCase: {
      ...syntheticCase,
      payload: nextPayload,
    },
    warnings,
  }
}

export function buildSyntheticCmrCase(caseId: string): SyntheticCmrCase {
  const definition = CMR_SYNTHETIC_CASE_LIBRARY.find((item) => item.id === caseId)
  if (!definition) {
    throw new Error(`Unknown synthetic CMR case: ${caseId}`)
  }

  const variantIndex = (Number(caseId.split('-').pop()) - 1) as VariantIndex
  const spec = CASE_SPECS.find((item) => item.key === caseId.replace(/-\d+$/, ''))
  if (!spec) {
    throw new Error(`Missing synthetic CMR spec for ${caseId}`)
  }

  const base = generateSyntheticDatasetAuto(definition.profile)
  const payload = createDefaultCmrCasePayload()
  const values = { ...base.values }
  const studyDate = buildStudyDate(CMR_SYNTHETIC_CASE_LIBRARY.findIndex((item) => item.id === caseId))

  payload.reportInput.reportType = definition.reportType
  payload.reportInput.fourDFlow = definition.fourDFlow
  payload.reportInput.nonContrast = definition.nonContrast

  const context: SyntheticCaseContext = {
    definition,
    payload,
    demographics: base.demographics,
    values,
    studyDate,
  }

  spec.apply(context, variantIndex)

  return finalizeSyntheticCase(definition, payload, base.demographics, values, studyDate)
}

export async function buildSyntheticCmrCaseWithLlm(caseId: string): Promise<SyntheticCmrCaseGenerationResult> {
  return enrichSyntheticCmrCaseWithLlm(buildSyntheticCmrCase(caseId))
}

export function buildRandomSyntheticCmrCase(): SyntheticCmrCase {
  const definition = randomItem(CMR_SYNTHETIC_CASE_LIBRARY)
  return buildSyntheticCmrCase(definition.id)
}

export async function buildRandomSyntheticCmrCaseWithLlm(): Promise<SyntheticCmrCaseGenerationResult> {
  return enrichSyntheticCmrCaseWithLlm(buildRandomSyntheticCmrCase())
}

export { RANDOM_CASE_ID }
