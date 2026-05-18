import type { CmrCanonicalParam } from '@/lib/cmr-api'
import { buildAorticValveSummaryData, buildAorticValveSummarySignature } from '@/lib/cmr-aortic-valve-summary'
import { generateLgeSummary, type LgeCode, type LgeSummaryData, type PatternCode } from '@/lib/cmr-lge-summary'
import { buildMitralValveSummaryData, buildMitralValveSummarySignature } from '@/lib/cmr-mitral-valve-summary'
import { generateRwmaSummary, type RwmaCode, type RwmaSummaryData } from '@/lib/cmr-rwma-summary'
import type { PerfusionSummaryData } from '@/lib/cmr-perfusion-summary'
import type { ThrombusSummaryData } from '@/lib/cmr-thrombus-summary'
import { buildTricuspidValveSummaryData, buildTricuspidValveSummarySignature } from '@/lib/cmr-tricuspid-valve-summary'
import { computeSeverity, inferSeverityLabel, type SeverityGrade, type SeverityLabelType } from '@/lib/cmr-severity'

type MeasurementMap = Map<string, number>
type ParamMap = Map<string, CmrCanonicalParam>

type ClassifiedMeasurement = {
  key: string | null
  value: number | null
  param: CmrCanonicalParam | null
  grade: SeverityGrade | 'unknown'
  label: string | null
}

export type ReportAdditionalConsideration = {
  section: string
  consideration: string
  comment: string
}

type ValveSeverity = 'none' | 'trivial' | 'mild' | 'moderate' | 'severe'
type AorticStenosisSeverity = 'moderate' | 'severe'
type ReportType = 'standard' | 'stress'
type MinorValveFinding = {
  severity: 'trivial' | 'mild'
  valve: 'mitral' | 'aortic' | 'tricuspid' | 'pulmonary'
}
type SimpleValveRegurgitationFinding = {
  severity: 'trivial' | 'mild' | 'moderate' | 'severe'
  valve: 'mitral' | 'aortic' | 'tricuspid' | 'pulmonary'
  metrics: string | null
}
const PH_INDEPENDENT_RIGHT_HEART_SIGNAL_PATTERN = /\b(rv dilatation|rv dysfunction|rv systolic function|right-heart|right heart|pressure-overload|uncoupling|septal|vortex|vortical|helicity|helical flow|pulmonary artery|distensibility|pericardial effusion|vena cava|right atrial)\b/i
const LGE_SCORE_INDEX_PATTERN = /\s*LGE score index\s+\d+(?:\.\d+)?\s*\((?:\d+\s*\/\s*17\s+segments(?:\s+enhanced)?|\d+\s+of\s+17\s+segments(?:\s+enhanced)?)\)\.?\s*/gi

function normalizeSpaces(text: string): string {
  return text.replace(/\s+/g, ' ').trim()
}

function stripLgeScoreIndex(text: string): string {
  return normalizeSpaces(text.replace(LGE_SCORE_INDEX_PATTERN, ' '))
}

export function normalizeReportConclusionLine(text: string | null | undefined): string {
  const source = normalizeSpaces(String(text ?? ''))
  if (!source) return ''
  return stripLgeScoreIndex(
    source.replace(/^\d+\.\s*/, '').replace(/^[-*]\s*/, '').trim(),
  )
}

export function normalizeReportConclusionLines(lines: readonly (string | null | undefined)[] | null | undefined): string[] {
  if (!Array.isArray(lines)) return []
  return lines
    .map((line) => normalizeReportConclusionLine(line ?? ''))
    .filter(Boolean)
}

export function buildReportConclusionSourceSignature(lines: readonly (string | null | undefined)[] | null | undefined): string {
  return JSON.stringify(normalizeReportConclusionLines(lines))
}

export function normalizeLgeReportText(text: string | null | undefined): string | null {
  const source = normalizeSpaces(String(text ?? ''))
  if (!source) return null

  const withoutScore = stripLgeScoreIndex(source)

  const deRedundantTransmurality = normalizeSpaces(
    withoutScore.replace(
      /\btransmural enhancement\b(?=[^.]*\bwith (?:51-75%|76-100%) transmurality\b)/gi,
      'enhancement',
    ),
  )

  return deRedundantTransmurality || null
}

export function normalizePerfusionReportText(text: string | null | undefined): string | null {
  const source = normalizeSpaces(String(text ?? ''))
  if (!source) return null

  const normalized = source.replace(/^Stress perfusion:\s*/i, '')
  return normalized || null
}

export function normalizePhReportText(text: string | null | undefined): string | null {
  const source = normalizeSpaces(String(text ?? ''))
  if (!source) return null

  const normalized = source
    .replace(/^PH summary:\s*/i, '')
    .replace(/^Pulmonary hypertension summary:\s*/i, '')
    .replace(/^Pulmonary hypertension assessment:\s*/i, '')
    .replace(/\s+\/\s+/g, ' or ')

  return normalized || null
}

export function normalizeThrombusReportText(text: string | null | undefined): string | null {
  const source = normalizeSpaces(String(text ?? ''))
  if (!source) return null
  const normalized = source.replace(/^Thrombus:\s*/i, '')
  return normalized || null
}

export function normalizeMitralValveReportText(text: string | null | undefined): string | null {
  const source = normalizeSpaces(String(text ?? ''))
  if (!source) return null

  const normalized = source.replace(/^Mitral valve:\s*/i, '')
  return normalized || null
}

export function normalizeAorticValveReportText(text: string | null | undefined): string | null {
  const source = normalizeSpaces(String(text ?? ''))
  if (!source) return null

  const normalized = source.replace(/^Aortic valve:\s*/i, '')
  return normalized || null
}

export function normalizeTricuspidValveReportText(text: string | null | undefined): string | null {
  const source = normalizeSpaces(String(text ?? ''))
  if (!source) return null

  const normalized = source.replace(/^Tricuspid valve:\s*/i, '')
  return normalized || null
}

export function normalizePulmonaryValveReportText(text: string | null | undefined): string | null {
  const source = normalizeSpaces(String(text ?? ''))
  if (!source) return null

  const normalized = source.replace(/^Pulmonary valve:\s*/i, '')
  return normalized || null
}

function suppressNormalValveSummary(text: string | null, normalSentence: string): string | null {
  if (!text || text === normalSentence) {
    return null
  }
  return text
}

function parseSimpleMinorValveFinding(text: string): MinorValveFinding | null {
  const normalized = stripFinalPeriod(normalizeSpaces(text))
  const match = /^(trivial|mild)\s+(mitral|aortic|tricuspid|pulmonary)\s+regurgitation(?:\s*\([^)]*\))?$/i.exec(normalized)
  if (!match) return null
  return {
    severity: match[1].toLowerCase() as MinorValveFinding['severity'],
    valve: match[2].toLowerCase() as MinorValveFinding['valve'],
  }
}

function parseSimpleValveRegurgitationFinding(text: string): SimpleValveRegurgitationFinding | null {
  const normalized = stripFinalPeriod(normalizeSpaces(text))
  const match = /^(trivial|mild|moderate|severe)\s+(mitral|aortic|tricuspid|pulmonary)\s+regurgitation(?:\s*\(([^)]*)\))?$/i.exec(normalized)
  if (!match) return null
  return {
    severity: match[1].toLowerCase() as SimpleValveRegurgitationFinding['severity'],
    valve: match[2].toLowerCase() as SimpleValveRegurgitationFinding['valve'],
    metrics: match[3] ? match[3].trim() : null,
  }
}

function compactValveClauses(clauses: string[]): string[] {
  const retained: string[] = []
  const minorFindings: MinorValveFinding[] = []

  for (const clause of clauses) {
    const minorFinding = parseSimpleMinorValveFinding(clause)
    if (minorFinding) {
      minorFindings.push(minorFinding)
      continue
    }
    retained.push(clause)
  }

  if (minorFindings.length >= 2) {
    const severities = Array.from(new Set(minorFindings.map((finding) => finding.severity)))
    if (severities.length === 1) {
      retained.push(
        `${upperFirst(severities[0])} ${joinList(minorFindings.map((finding) => finding.valve))} regurgitation`,
      )
    } else {
      retained.push(
        upperFirst(
          joinList(minorFindings.map((finding) => `${finding.severity} ${finding.valve} regurgitation`)),
        ),
      )
    }
    return retained
  }

  if (minorFindings.length === 1) {
    retained.push(`${upperFirst(minorFindings[0].severity)} ${minorFindings[0].valve} regurgitation`)
  }

  return retained
}

function combineSignificantValveRegurgitationFindings(
  findings: SimpleValveRegurgitationFinding[],
): string | null {
  if (findings.length < 2) return null

  const severities = Array.from(new Set(findings.map((finding) => finding.severity)))
  if (severities.length === 1) {
    const [severity] = severities
    const clauses = findings.map((finding, index) => {
      const lead = index === 0
        ? `${severity} ${finding.valve} regurgitation`
        : `${finding.valve} regurgitation`
      return finding.metrics ? `${lead} (${finding.metrics})` : lead
    })
    return `${upperFirst(joinList(clauses))}.`
  }

  return `${upperFirst(joinList(
    findings.map((finding) => {
      const lead = `${finding.severity} ${finding.valve} regurgitation`
      return finding.metrics ? `${lead} (${finding.metrics})` : lead
    }),
  ))}.`
}

function classifyMeasurement(
  measurementMap: MeasurementMap,
  paramMap: ParamMap,
  candidateKeys: string[],
): ClassifiedMeasurement {
  for (const key of candidateKeys) {
    const rawValue = measurementMap.get(key)
    if (rawValue == null || Number.isNaN(rawValue)) {
      continue
    }

    const param = paramMap.get(key) ?? null
    if (!param) {
      return {
        key,
        value: rawValue,
        param: null,
        grade: 'unknown',
        label: null,
      }
    }

    const resolvedLabel = (param.severity_label as SeverityLabelType | undefined)
      ?? inferSeverityLabel(param.parameter_key, param.major_section, param.sub_section)
    const severity = computeSeverity(
      rawValue,
      param.ll,
      param.ul,
      param.sd,
      param.abnormal_direction,
      resolvedLabel,
      param.severity_thresholds ?? null,
      param.severity_label_override ?? null,
    )

    return {
      key,
      value: rawValue,
      param,
      grade: severity.grade,
      label: severity.label,
    }
  }

  return {
    key: null,
    value: null,
    param: null,
    grade: 'unknown',
    label: null,
  }
}

function classifyClinicalLvefFromValue(
  value: number | null,
  param: CmrCanonicalParam | null,
): ClassifiedMeasurement {
  if (value == null || Number.isNaN(value)) {
    return {
      key: 'LV EF',
      value: null,
      param,
      grade: 'unknown',
      label: null,
    }
  }

  const grade: SeverityGrade = value >= 55
    ? 'normal'
    : value >= 45
      ? 'mild'
      : value >= 35
        ? 'moderate'
        : 'severe'

  const label = grade === 'normal'
    ? 'Preserved'
    : grade === 'mild'
      ? 'Mildly impaired'
      : grade === 'moderate'
        ? 'Moderately impaired'
        : 'Severely impaired'

  return {
    key: 'LV EF',
    value,
    param,
    grade,
    label,
  }
}

function classifyClinicalLvefMeasurement(
  measurementMap: MeasurementMap,
  paramMap: ParamMap,
): ClassifiedMeasurement {
  return classifyClinicalLvefFromValue(getMeasuredValue(measurementMap, 'LV EF'), paramMap.get('LV EF') ?? null)
}

function classifyClinicalMapseFromValue(
  value: number | null,
  param: CmrCanonicalParam | null,
): ClassifiedMeasurement {
  if (value == null || Number.isNaN(value)) {
    return {
      key: 'MAPSE',
      value: null,
      param,
      grade: 'unknown',
      label: null,
    }
  }

  const grade: SeverityGrade = value >= 10
    ? 'normal'
    : value >= 8
      ? 'mild'
      : value > 6
        ? 'moderate'
        : 'severe'

  const label = grade === 'normal'
    ? 'Preserved'
    : grade === 'mild'
      ? 'Mildly reduced'
      : grade === 'moderate'
        ? 'Moderately reduced'
        : 'Severely reduced'

  return {
    key: 'MAPSE',
    value,
    param,
    grade,
    label,
  }
}

function formatNumber(value: number, decimals: number = 0): string {
  return value.toFixed(decimals)
}

function formatCompactNumber(value: number, decimals: number = 1): string {
  const fixed = value.toFixed(decimals)
  return fixed.replace(/\.0+$/, '').replace(/(\.\d*?)0+$/, '$1')
}

function formatUnit(unit: string): string {
  return unit
    .replaceAll('²', '2')
    .replaceAll('Â²', '2')
    .replaceAll('Ã‚Â²', '2')
    .replaceAll('Ãƒâ€šÃ‚Â²', '2')
    .replaceAll('³', '3')
    .replaceAll('Â³', '3')
    .replaceAll('Ã‚Â³', '3')
    .replaceAll('Ãƒâ€šÃ‚Â³', '3')
    .replaceAll('µ', 'u')
    .replaceAll('Âµ', 'u')
    .replaceAll('Ã‚Âµ', 'u')
    .replaceAll('Ãƒâ€šÃ‚Âµ', 'u')
}

function lowerFirst(text: string): string {
  return text ? `${text.charAt(0).toLowerCase()}${text.slice(1)}` : text
}

function upperFirst(text: string): string {
  return text ? `${text.charAt(0).toUpperCase()}${text.slice(1)}` : text
}

function joinList(items: string[]): string {
  if (items.length === 0) return ''
  if (items.length === 1) return items[0]
  if (items.length === 2) return `${items[0]} and ${items[1]}`
  return `${items.slice(0, -1).join(', ')}, and ${items[items.length - 1]}`
}

function splitSentences(text: string): string[] {
  return normalizeSpaces(text)
    .split(/(?<=[.?!])\s+/)
    .map((sentence) => normalizeSpaces(sentence))
    .filter(Boolean)
}

function stripFinalPeriod(text: string): string {
  return text.replace(/\.\s*$/, '')
}

function getMeasuredValue(measurementMap: MeasurementMap, key: string): number | null {
  const value = measurementMap.get(key)
  return value == null || Number.isNaN(value) ? null : value
}

function rfToValveSeverity(rf: number): ValveSeverity {
  if (rf < 5) return 'none'
  if (rf < 10) return 'trivial'
  if (rf < 20) return 'mild'
  if (rf < 40) return 'moderate'
  return 'severe'
}

function resolveValveSeverity(
  measurementMap: MeasurementMap,
  rfKey: string,
): ValveSeverity | null {
  const rf = getMeasuredValue(measurementMap, rfKey)
  if (rf != null) {
    return rfToValveSeverity(rf)
  }

  return null
}

function buildValveSeverityClause(severity: ValveSeverity | null, abbreviation: 'AR' | 'MR' | 'TR' | 'PR'): string | null {
  if (severity == null) return null
  if (severity !== 'moderate' && severity !== 'severe') return null
  return `${severity.charAt(0).toUpperCase()}${severity.slice(1)} ${abbreviation}`
}

function resolveAorticStenosisSeverity(
  measurementMap: MeasurementMap,
): {
  severity: AorticStenosisSeverity | null
  peakGradient: number | null
  meanGradient: number | null
  peakVelocity: number | null
} {
  const peakGradient = getMeasuredValue(measurementMap, 'AV maximum pressure gradient')
  const meanGradient = getMeasuredValue(measurementMap, 'AV mean pressure gradient')
  const peakVelocity = getMeasuredValue(measurementMap, 'AV maximum velocity')

  const severe =
    (meanGradient != null && meanGradient >= 40)
    || (peakGradient != null && peakGradient >= 64)
    || (peakVelocity != null && peakVelocity >= 4)

  if (severe) {
    return { severity: 'severe', peakGradient, meanGradient, peakVelocity }
  }

  const moderate =
    (meanGradient != null && meanGradient >= 20)
    || (peakGradient != null && peakGradient >= 36)
    || (peakVelocity != null && peakVelocity >= 3)

  if (moderate) {
    return { severity: 'moderate', peakGradient, meanGradient, peakVelocity }
  }

  return { severity: null, peakGradient, meanGradient, peakVelocity }
}

function buildRemainingValveClauses(
  measurementMap: MeasurementMap,
  options?: {
    includeAortic?: boolean
    includeTricuspid?: boolean
    includePulmonary?: boolean
  },
): string[] {
  const includeAortic = options?.includeAortic ?? true
  const includeTricuspid = options?.includeTricuspid ?? true
  const includePulmonary = options?.includePulmonary ?? true
  const arSeverity = includeAortic
    ? resolveValveSeverity(
      measurementMap,
      'AV regurgitant fraction',
    )
    : null
  const trSeverity = includeTricuspid
    ? resolveValveSeverity(
      measurementMap,
      'TR regurgitant fraction',
    )
    : null
  const prSeverity = includePulmonary
    ? resolveValveSeverity(
      measurementMap,
      'PV regurgitant fraction',
    )
    : null

  const clauses = [
    buildValveSeverityClause(arSeverity, 'AR'),
    buildValveSeverityClause(trSeverity, 'TR'),
    buildValveSeverityClause(prSeverity, 'PR'),
  ].filter((value): value is string => Boolean(value))

  const { severity: aorticStenosisSeverity, peakGradient, meanGradient } = includeAortic
    ? resolveAorticStenosisSeverity(measurementMap)
    : { severity: null, peakGradient: null, meanGradient: null }

  if (aorticStenosisSeverity) {
    const descriptor = `${aorticStenosisSeverity} aortic stenosis`
    if (peakGradient != null && meanGradient != null) {
      clauses.push(
        `Aortic valve gradients: peak ${formatCompactNumber(peakGradient, 1)} mmHg and mean ${formatCompactNumber(meanGradient, 1)} mmHg, suggestive of ${descriptor}`,
      )
    } else if (meanGradient != null) {
      clauses.push(`Aortic valve mean gradient ${formatCompactNumber(meanGradient, 1)} mmHg, suggestive of ${descriptor}`)
    } else if (peakGradient != null) {
      clauses.push(`Aortic valve peak gradient ${formatCompactNumber(peakGradient, 1)} mmHg, suggestive of ${descriptor}`)
    }
  }

  return clauses
}

export function buildMitralValveReportText(
  measurementMap: MeasurementMap,
  morphology: { findings: Record<string, { leaflets: Iterable<string> | null | undefined; detailValues: Record<string, string>; notes: string }> },
  summaryDraft?: { llmProse: string | null; llmProseSourceSignature: string | null } | null,
): string | null {
  const summaryData = buildMitralValveSummaryData(measurementMap, morphology)
  const currentSignature = buildMitralValveSummarySignature(summaryData)
  const sourceText = summaryDraft?.llmProse && summaryDraft.llmProseSourceSignature === currentSignature
    ? summaryDraft.llmProse
    : summaryData.deterministicText

  const normalized = normalizeMitralValveReportText(sourceText)
  if (!normalized || normalized === 'No significant mitral valve abnormality.') {
    return null
  }

  return normalized
}

export function buildAorticValveReportText(
  measurementMap: MeasurementMap,
  morphology: { findings: Record<string, { leaflets: Iterable<string> | null | undefined; detailValues: Record<string, string>; notes: string }> },
  summaryDraft?: { llmProse: string | null; llmProseSourceSignature: string | null } | null,
): string | null {
  const summaryData = buildAorticValveSummaryData(measurementMap, morphology)
  const currentSignature = buildAorticValveSummarySignature(summaryData)
  const sourceText = summaryDraft?.llmProse && summaryDraft.llmProseSourceSignature === currentSignature
    ? summaryDraft.llmProse
    : summaryData.deterministicText

  const normalized = normalizeAorticValveReportText(sourceText)
  if (!normalized || normalized === 'No significant aortic valve abnormality.') {
    return null
  }

  return normalized
}

export function buildTricuspidValveReportText(
  measurementMap: MeasurementMap,
  morphology: { findings: Record<string, { leaflets: Iterable<string> | null | undefined; detailValues: Record<string, string>; notes: string }> },
  summaryDraft?: { llmProse: string | null; llmProseSourceSignature: string | null } | null,
): string | null {
  const summaryData = buildTricuspidValveSummaryData(measurementMap, morphology)
  const currentSignature = buildTricuspidValveSummarySignature(summaryData)
  const sourceText = summaryDraft?.llmProse && summaryDraft.llmProseSourceSignature === currentSignature
    ? summaryDraft.llmProse
    : summaryData.deterministicText

  const normalized = normalizeTricuspidValveReportText(sourceText)
  if (!normalized || normalized === 'No significant tricuspid valve abnormality.') {
    return null
  }

  return normalized
}

export function buildPulmonaryValveReportText(measurementMap: MeasurementMap): string | null {
  const severity = resolveValveSeverity(measurementMap, 'PV regurgitant fraction')
  if (severity == null || severity === 'none') {
    return null
  }

  const rf = getMeasuredValue(measurementMap, 'PV regurgitant fraction')
  const regurgitantVolume = getMeasuredValue(measurementMap, 'PV backward flow (per heartbeat)')
  const metrics = [
    rf != null ? `RF ${formatCompactNumber(rf, 1)}%` : null,
    regurgitantVolume != null ? `regurgitant volume ${formatCompactNumber(regurgitantVolume, 0)} mL` : null,
  ].filter((value): value is string => Boolean(value))

  return `${upperFirst(severity)} pulmonary regurgitation${metrics.length > 0 ? ` (${metrics.join('; ')})` : ''}.`
}

export function buildValveSummarySentence(
  measurementMap: MeasurementMap,
  options?: {
    mitralSummaryText?: string | null
    aorticSummaryText?: string | null
    tricuspidSummaryText?: string | null
    pulmonarySummaryText?: string | null
    includeMitral?: boolean
    includeAortic?: boolean
    includeTricuspid?: boolean
    includePulmonary?: boolean
  },
): string | null {
  const clauses: string[] = []
  const includeMitral = options?.includeMitral ?? true
  const includeAortic = options?.includeAortic ?? true
  const includeTricuspid = options?.includeTricuspid ?? true
  const includePulmonary = options?.includePulmonary ?? true
  const mitralSummaryText = suppressNormalValveSummary(
    normalizeMitralValveReportText(options?.mitralSummaryText ?? null),
    'No significant mitral valve abnormality.',
  )
  if (includeMitral && mitralSummaryText) {
    clauses.push(mitralSummaryText)
  }

  const aorticSummaryText = suppressNormalValveSummary(
    normalizeAorticValveReportText(options?.aorticSummaryText ?? null),
    'No significant aortic valve abnormality.',
  )
  if (includeAortic && aorticSummaryText) {
    clauses.push(aorticSummaryText)
  }

  const tricuspidSummaryText = suppressNormalValveSummary(
    normalizeTricuspidValveReportText(options?.tricuspidSummaryText ?? null),
    'No significant tricuspid valve abnormality.',
  )
  if (includeTricuspid && tricuspidSummaryText) {
    clauses.push(tricuspidSummaryText)
  }

  const pulmonarySummaryText = suppressNormalValveSummary(
    normalizePulmonaryValveReportText(options?.pulmonarySummaryText ?? null),
    'No significant pulmonary valve abnormality.',
  )
  if (includePulmonary && pulmonarySummaryText) {
    clauses.push(pulmonarySummaryText)
  }

  clauses.push(
    ...buildRemainingValveClauses(measurementMap, {
      includeAortic: includeAortic && !aorticSummaryText,
      includeTricuspid: includeTricuspid && !tricuspidSummaryText,
      includePulmonary: includePulmonary && !pulmonarySummaryText,
    }),
  )

  if (clauses.length === 0) {
    if (!includeMitral && !includeAortic && !includeTricuspid && !includePulmonary) {
      return null
    }
    return 'No moderate or severe valvular abnormality.'
  }

  return compactValveClauses(clauses)
    .map((clause) => (clause.endsWith('.') ? clause : `${clause}.`))
    .join(' ')
}

export function shouldIncludeValveAssessment(valveText: string | null | undefined): boolean {
  const normalized = normalizeSpaces(String(valveText ?? ''))
  return Boolean(
    normalized
    && normalized !== 'No moderate or severe valvular abnormality.',
  )
}

function buildValveConclusionText(valveText: string | null | undefined): string | null {
  const normalized = normalizeSpaces(String(valveText ?? ''))
  if (!normalized || normalized === 'No moderate or severe valvular abnormality.') {
    return null
  }

  const sentences = normalized
    .split(/(?<=\.)\s+/)
    .map((sentence) => normalizeSpaces(sentence))
    .filter(Boolean)
    .filter((sentence) => /\b(moderate|severe)\b/i.test(sentence))

  if (sentences.length === 0) {
    return null
  }

  const retained: string[] = []
  const simpleRegurgitationFindings: SimpleValveRegurgitationFinding[] = []

  for (const sentence of sentences) {
    const finding = parseSimpleValveRegurgitationFinding(sentence)
    if (finding) {
      simpleRegurgitationFindings.push(finding)
      continue
    }
    retained.push(sentence.endsWith('.') ? sentence : `${sentence}.`)
  }

  const combinedRegurgitationSentence = combineSignificantValveRegurgitationFindings(simpleRegurgitationFindings)
  if (combinedRegurgitationSentence) {
    retained.unshift(combinedRegurgitationSentence)
  } else if (simpleRegurgitationFindings.length === 1) {
    const [finding] = simpleRegurgitationFindings
    retained.unshift(
      `${upperFirst(finding.severity)} ${finding.valve} regurgitation${finding.metrics ? ` (${finding.metrics})` : ''}.`,
    )
  }

  return retained.join(' ')
}

function normalizePhHeadlineForConclusion(headline: string): string {
  const normalized = stripFinalPeriod(normalizeSpaces(headline))
    .replace(
      /\bwith features raising the possibility of post-capillary or mixed physiology\b/i,
      'with possible post-capillary or mixed physiology',
    )
    .replace(/\bfindings are in keeping with\s+/i, '')
    .replace(/,\s*in the context of\b.*$/i, '')
    .replace(/,\s*(?:supported by|driven by)\b.*$/i, '')
    .replace(/\bSupporting right-heart features include\b.*$/i, '')
  return normalized
}

function buildPhConclusionText(
  phText: string | null | undefined,
  measurementMap: MeasurementMap,
  paramMap: ParamMap,
): string | null {
  const normalized = normalizePhReportText(phText)
  if (!normalized) {
    return null
  }

  const rvSize = classifyMeasurement(measurementMap, paramMap, ['RV EDV (i)', 'RV EDV'])
  const rvef = classifyMeasurement(measurementMap, paramMap, ['RV EF'])
  const tapse = classifyMeasurement(measurementMap, paramMap, ['TAPSE'])

  const hasIndependentRightHeartSignal = (
    (rvSize.grade !== 'normal' && rvSize.grade !== 'unknown')
    || (rvef.grade !== 'normal' && rvef.grade !== 'unknown')
    || (tapse.grade !== 'normal' && tapse.grade !== 'unknown')
    || PH_INDEPENDENT_RIGHT_HEART_SIGNAL_PATTERN.test(normalized)
  )

  if (/\bpost-capillary\b|\bmixed physiology\b/i.test(normalized) && !hasIndependentRightHeartSignal) {
    return null
  }

  const sentences = splitSentences(normalized)
  if (sentences.length === 0) {
    return null
  }

  const headlineSentence = sentences[0]
  const headline = normalizePhHeadlineForConclusion(headlineSentence)
  return headline.endsWith('.') ? headline : `${headline}.`
}

function formatMetricValue(classified: ClassifiedMeasurement, label: string, fallbackUnit: string): string | null {
  if (classified.value == null) return null
  const decimals = classified.param?.decimal_places ?? 0
  const unit = formatUnit(classified.param?.unit ?? fallbackUnit)
  const formattedValue = formatNumber(classified.value, decimals)
  if (unit === '%') {
    return `${label} ${formattedValue}%`
  }
  return `${label} ${formattedValue} ${unit}`
}

function buildMapseMeasurement(
  measurementMap: MeasurementMap,
  paramMap: ParamMap,
): ClassifiedMeasurement {
  const param = paramMap.get('MAPSE') ?? null
  const directValue = getMeasuredValue(measurementMap, 'MAPSE')
  if (directValue != null) {
    return classifyClinicalMapseFromValue(directValue, param)
  }

  const septal = measurementMap.get('MAPSE septal')
  const lateral = measurementMap.get('MAPSE lateral')
  if (septal == null || lateral == null || Number.isNaN(septal) || Number.isNaN(lateral)) {
    return classifyClinicalMapseFromValue(null, param)
  }

  const derivedValue = (septal + lateral) / 2
  return classifyClinicalMapseFromValue(derivedValue, param)
}

function buildSizePhrase(classified: ClassifiedMeasurement): string | null {
  switch (classified.grade) {
    case 'normal':
      return 'normal in size'
    case 'mild':
      return 'mildly dilated'
    case 'moderate':
      return 'moderately dilated'
    case 'severe': {
      const unit = classified.param ? formatUnit(classified.param.unit) : (classified.key === 'LV EDV (i)' ? 'mL/m2' : 'mL')
      const label = classified.key === 'LV EDV (i)' ? 'LV EDVi' : 'LV EDV'
      return `severely dilated (${label} ${formatNumber(classified.value ?? 0, classified.param?.decimal_places ?? 0)} ${unit})`
    }
    default:
      return null
  }
}

function buildThicknessPhrase(
  thickness: ClassifiedMeasurement,
  mass: ClassifiedMeasurement,
  size: ClassifiedMeasurement,
): string | null {
  const sizeIsDilated = size.grade !== 'normal' && size.grade !== 'unknown'
  const massIsHigh = mass.grade !== 'normal' && mass.grade !== 'unknown'
  const thicknessIsHigh = thickness.grade !== 'normal' && thickness.grade !== 'unknown'

  if (massIsHigh) {
    const suffix = thickness.grade === 'severe' && thickness.value != null
      ? ` (maximal wall thickness ${formatNumber(thickness.value, thickness.param?.decimal_places ?? 0)} ${formatUnit(thickness.param?.unit ?? 'mm')})`
      : ''
    const hypertrophyPrefix = thickness.grade === 'severe' ? 'marked ' : ''
    if (thicknessIsHigh) {
      return sizeIsDilated
        ? `${hypertrophyPrefix}eccentric hypertrophy${suffix}`
        : `${hypertrophyPrefix}concentric hypertrophy${suffix}`
    }
    if (sizeIsDilated) {
      return 'eccentric remodelling'
    }

    switch (mass.grade) {
      case 'mild':
        return 'mildly increased LV mass'
      case 'moderate':
        return 'moderately increased LV mass'
      case 'severe':
        return 'markedly increased LV mass'
      default:
        return 'increased LV mass'
    }
  }

  switch (thickness.grade) {
    case 'normal':
      return 'normal wall thickness'
    case 'mild':
      return 'mildly increased wall thickness'
    case 'moderate':
      return 'moderately increased wall thickness'
    case 'severe':
      return `severely increased wall thickness (maximal wall thickness ${formatNumber(thickness.value ?? 0, thickness.param?.decimal_places ?? 0)} ${formatUnit(thickness.param?.unit ?? 'mm')})`
    default:
      return null
  }
}

export function buildLvSizeThicknessSentence(
  measurementMap: MeasurementMap,
  paramMap: ParamMap,
): string | null {
  const size = classifyMeasurement(measurementMap, paramMap, ['LV EDV (i)', 'LV EDV'])
  const thickness = classifyMeasurement(measurementMap, paramMap, ['LV peak wall thickness'])
  const mass = classifyMeasurement(measurementMap, paramMap, ['LV mass (i)', 'LV mass'])

  const sizePhrase = buildSizePhrase(size)
  const thicknessPhrase = buildThicknessPhrase(thickness, mass, size)

  if (sizePhrase && thicknessPhrase) {
    return `The LV is ${sizePhrase} with ${thicknessPhrase}.`
  }
  if (sizePhrase) {
    return `The LV is ${sizePhrase}.`
  }
  if (thicknessPhrase) {
    return `The LV has ${thicknessPhrase}.`
  }
  return null
}

export function buildLvFunctionSentence(
  measurementMap: MeasurementMap,
  paramMap: ParamMap,
): string | null {
  const lvef = classifyClinicalLvefMeasurement(measurementMap, paramMap)
  const mapse = buildMapseMeasurement(measurementMap, paramMap)

  const lvefValue = formatMetricValue(lvef, 'LVEF', '%')
  const mapseValue = formatMetricValue(mapse, 'MAPSE', 'mm')

  const lvefPhrase = lvef.grade === 'normal'
    ? 'preserved'
    : lvef.label
      ? lowerFirst(lvef.label)
      : 'reported'
  const mapsePhrase = mapse.grade === 'normal'
    ? 'preserved'
    : mapse.label
      ? lowerFirst(mapse.label)
      : 'reported'
  const isolatedMapsePhrase = mapse.grade === 'severe' ? 'markedly reduced' : mapsePhrase

  if (lvefValue && mapseValue) {
    if (lvef.grade === 'normal' && mapse.grade === 'normal') {
      return `Global and longitudinal LV systolic function are preserved (${lvefValue}, ${mapseValue}).`
    }
    if (lvef.grade === 'normal') {
      return `Global LV systolic function is preserved (${lvefValue}) with ${isolatedMapsePhrase} longitudinal function (${mapseValue}).`
    }
    if (mapse.grade === 'normal') {
      return `Global LV systolic function is ${lvefPhrase} (${lvefValue}) with preserved longitudinal function (${mapseValue}).`
    }
    return `Global LV systolic function is ${lvefPhrase} (${lvefValue}) with ${mapsePhrase} longitudinal function (${mapseValue}).`
  }

  if (lvefValue) {
    return `Global LV systolic function is ${lvefPhrase} (${lvefValue}).`
  }

  if (mapseValue) {
    return `Longitudinal LV systolic function is ${mapsePhrase} (${mapseValue}).`
  }

  return null
}

export function buildLvSentence(
  measurementMap: MeasurementMap,
  paramMap: ParamMap,
): string | null {
  const size = classifyMeasurement(measurementMap, paramMap, ['LV EDV (i)', 'LV EDV'])
  const thickness = classifyMeasurement(measurementMap, paramMap, ['LV peak wall thickness'])
  const mass = classifyMeasurement(measurementMap, paramMap, ['LV mass (i)', 'LV mass'])
  const lvef = classifyClinicalLvefMeasurement(measurementMap, paramMap)
  const mapse = buildMapseMeasurement(measurementMap, paramMap)

  const sizePhrase = buildSizePhrase(size)
  const thicknessPhrase = buildThicknessPhrase(thickness, mass, size)
  const lvefValue = formatMetricValue(lvef, 'LVEF', '%')
  const mapseValue = formatMetricValue(mapse, 'MAPSE', 'mm')
  const hasSevereMorphology = size.grade === 'severe' || thickness.grade === 'severe' || mass.grade === 'severe'

  if (hasSevereMorphology && lvef.grade === 'severe' && mapse.grade === 'severe' && lvefValue && mapseValue) {
    if (sizePhrase && thicknessPhrase) {
      return `The LV is ${sizePhrase} with ${thicknessPhrase} and severely impaired global and longitudinal systolic function (${lvefValue}, ${mapseValue}).`
    }
    if (sizePhrase) {
      return `The LV is ${sizePhrase} with severely impaired global and longitudinal systolic function (${lvefValue}, ${mapseValue}).`
    }
    if (thicknessPhrase) {
      return `The LV has ${thicknessPhrase} and severely impaired global and longitudinal systolic function (${lvefValue}, ${mapseValue}).`
    }
  }

  const parts = [
    buildLvSizeThicknessSentence(measurementMap, paramMap),
    buildLvFunctionSentence(measurementMap, paramMap),
  ].filter(Boolean)

  return parts.length > 0 ? parts.join(' ') : null
}

function buildLvConclusionSizePhrase(classified: ClassifiedMeasurement): string | null {
  switch (classified.grade) {
    case 'normal':
      return 'a non-dilated LV'
    case 'mild':
      return 'a mildly dilated LV'
    case 'moderate':
      return 'a moderately dilated LV'
    case 'severe': {
      const unit = classified.param ? formatUnit(classified.param.unit) : (classified.key === 'LV EDV (i)' ? 'mL/m2' : 'mL')
      const label = classified.key === 'LV EDV (i)' ? 'LV EDVi' : 'LV EDV'
      return `a severely dilated LV (${label} ${formatNumber(classified.value ?? 0, classified.param?.decimal_places ?? 0)} ${unit})`
    }
    default:
      return null
  }
}

function buildLvConclusionSizeModifier(classified: ClassifiedMeasurement): string | null {
  switch (classified.grade) {
    case 'normal':
      return 'normal size'
    case 'mild':
      return 'mild dilatation'
    case 'moderate':
      return 'moderate dilatation'
    case 'severe': {
      const unit = classified.param ? formatUnit(classified.param.unit) : (classified.key === 'LV EDV (i)' ? 'mL/m2' : 'mL')
      const label = classified.key === 'LV EDV (i)' ? 'LV EDVi' : 'LV EDV'
      return `severe dilatation (${label} ${formatNumber(classified.value ?? 0, classified.param?.decimal_places ?? 0)} ${unit})`
    }
    default:
      return null
  }
}

function buildLvConclusionThicknessModifier(
  thickness: ClassifiedMeasurement,
  mass: ClassifiedMeasurement,
  size: ClassifiedMeasurement,
): string | null {
  const sizeIsDilated = size.grade !== 'normal' && size.grade !== 'unknown'
  const massIsHigh = mass.grade !== 'normal' && mass.grade !== 'unknown'
  const thicknessIsHigh = thickness.grade !== 'normal' && thickness.grade !== 'unknown'

  if (massIsHigh) {
    const suffix = thickness.grade === 'severe' && thickness.value != null
      ? ` (maximal wall thickness ${formatNumber(thickness.value, thickness.param?.decimal_places ?? 0)} ${formatUnit(thickness.param?.unit ?? 'mm')})`
      : ''
    const hypertrophyPrefix = thickness.grade === 'severe' ? 'marked ' : ''
    if (thicknessIsHigh) {
      return sizeIsDilated
        ? `${hypertrophyPrefix}eccentric hypertrophy${suffix}`
        : `${hypertrophyPrefix}concentric hypertrophy${suffix}`
    }
    if (sizeIsDilated) {
      return 'eccentric remodelling'
    }

    switch (mass.grade) {
      case 'mild':
        return 'mildly increased LV mass'
      case 'moderate':
        return 'moderately increased LV mass'
      case 'severe':
        return 'markedly increased LV mass'
      default:
        return 'increased LV mass'
    }
  }

  switch (thickness.grade) {
    case 'normal':
      return 'normal wall thickness'
    case 'mild':
      return 'mildly increased wall thickness'
    case 'moderate':
      return 'moderately increased wall thickness'
    case 'severe':
      return `severely increased wall thickness (maximal wall thickness ${formatNumber(thickness.value ?? 0, thickness.param?.decimal_places ?? 0)} ${formatUnit(thickness.param?.unit ?? 'mm')})`
    default:
      return null
  }
}

function buildLvConclusionMorphologyPhrase(
  size: ClassifiedMeasurement,
  thickness: ClassifiedMeasurement,
  mass: ClassifiedMeasurement,
): string | null {
  const sizeModifier = buildLvConclusionSizeModifier(size)
  const thicknessModifier = buildLvConclusionThicknessModifier(thickness, mass, size)
  const thicknessShouldLead = Boolean(
    sizeModifier === 'normal size'
    && thicknessModifier
    && /\b(hypertrophy|wall thickness)\b/i.test(thicknessModifier)
    && thicknessModifier !== 'normal wall thickness'
  )

  if (sizeModifier && thicknessModifier) {
    return thicknessShouldLead
      ? `${thicknessModifier} and ${sizeModifier}`
      : `${sizeModifier} and ${thicknessModifier}`
  }
  return sizeModifier ?? thicknessModifier
}

function buildLvConclusionRemodelingPhrase(
  size: ClassifiedMeasurement,
  thickness: ClassifiedMeasurement,
  mass: ClassifiedMeasurement,
): string | null {
  const sizePhrase = buildLvConclusionSizePhrase(size)
  const thicknessPhrase = buildThicknessPhrase(thickness, mass, size)

  if (sizePhrase && thicknessPhrase) {
    return `${sizePhrase} and ${thicknessPhrase}`
  }
  return sizePhrase ?? thicknessPhrase
}

export function buildLvConclusionSentence(
  measurementMap: MeasurementMap,
  paramMap: ParamMap,
  options?: {
    rwmaData?: RwmaSummaryData | null
    thrombusText?: string | null
  },
): string | null {
  const size = classifyMeasurement(measurementMap, paramMap, ['LV EDV (i)', 'LV EDV'])
  const thickness = classifyMeasurement(measurementMap, paramMap, ['LV peak wall thickness'])
  const mass = classifyMeasurement(measurementMap, paramMap, ['LV mass (i)', 'LV mass'])
  const lvef = classifyClinicalLvefMeasurement(measurementMap, paramMap)
  const mapse = buildMapseMeasurement(measurementMap, paramMap)

  const remodelingPhrase = buildLvConclusionRemodelingPhrase(size, thickness, mass)
  const morphologyPhrase = buildLvConclusionMorphologyPhrase(size, thickness, mass)
  const lvefValue = formatMetricValue(lvef, 'LVEF', '%')
  const mapseValue = formatMetricValue(mapse, 'MAPSE', 'mm')
  const lvefPhrase = lvef.grade === 'normal'
    ? 'Preserved LV systolic function'
    : lvef.grade === 'mild'
      ? 'Mild LV systolic impairment'
      : lvef.grade === 'moderate'
        ? 'Moderate LV systolic impairment'
        : lvef.grade === 'severe'
          ? 'Severe LV systolic impairment'
          : 'Reported LV systolic function'
  const mapsePhrase = mapse.grade === 'normal'
    ? 'Preserved longitudinal LV function'
    : mapse.grade === 'mild'
      ? 'Mild longitudinal LV dysfunction'
      : mapse.grade === 'moderate'
        ? 'Moderate longitudinal LV dysfunction'
        : mapse.grade === 'severe'
          ? 'Severe longitudinal LV dysfunction'
          : 'Reported longitudinal LV function'

  let base: string | null = null
  if (lvefValue && morphologyPhrase) {
    base = `${lvefPhrase} (${lvefValue}) with ${morphologyPhrase}.`
  } else if (lvefValue) {
    base = `${lvefPhrase} (${lvefValue}).`
  } else if (mapseValue && morphologyPhrase) {
    base = `${mapsePhrase} (${mapseValue}) with ${morphologyPhrase}.`
  } else if (mapseValue) {
    base = `${mapsePhrase} (${mapseValue}).`
  } else if (remodelingPhrase) {
    base = `${upperFirst(remodelingPhrase)}.`
  }

  const rwmaClause = buildRwmaConclusionClause(options?.rwmaData)

  const normalizedThrombus = normalizeThrombusReportText(options?.thrombusText)
  if (base && rwmaClause) {
    const baseWithoutPeriod = stripFinalPeriod(base)
    const withIndex = baseWithoutPeriod.indexOf(' with ')
    if (withIndex >= 0) {
      const prefix = baseWithoutPeriod.slice(0, withIndex + 6)
      const tail = baseWithoutPeriod.slice(withIndex + 6)
      const normalizedTail = tail.includes(' and ')
        ? `${tail.slice(0, tail.lastIndexOf(' and '))}, ${tail.slice(tail.lastIndexOf(' and ') + 5)}`
        : tail
      base = `${prefix}${normalizedTail}, and ${rwmaClause}.`
    } else {
      base = `${baseWithoutPeriod}, with ${rwmaClause}.`
    }
  }
  if (base && normalizedThrombus && /\bleft ventricular\b/i.test(normalizedThrombus)) {
    return `${base} ${normalizedThrombus}`
  }

  return base ?? (normalizedThrombus && /\bleft ventricular\b/i.test(normalizedThrombus) ? normalizedThrombus : null)
}

function buildRvSizePhrase(classified: ClassifiedMeasurement): string | null {
  switch (classified.grade) {
    case 'normal':
      return 'not dilated'
    case 'mild':
      return 'mildly dilated'
    case 'moderate':
      return 'moderately dilated'
    case 'severe': {
      const unit = classified.param ? formatUnit(classified.param.unit) : (classified.key === 'RV EDV (i)' ? 'mL/m2' : 'mL')
      const label = classified.key === 'RV EDV (i)' ? 'RV EDVi' : 'RV EDV'
      return `severely dilated (${label} ${formatNumber(classified.value ?? 0, classified.param?.decimal_places ?? 0)} ${unit})`
    }
    default:
      return null
  }
}

export function buildRvSentence(
  measurementMap: MeasurementMap,
  paramMap: ParamMap,
): string | null {
  const size = classifyMeasurement(measurementMap, paramMap, ['RV EDV (i)', 'RV EDV'])
  const rvef = classifyMeasurement(measurementMap, paramMap, ['RV EF'])
  const tapse = classifyMeasurement(measurementMap, paramMap, ['TAPSE'])

  const sizePhrase = buildRvSizePhrase(size)
  const rvefValue = formatMetricValue(rvef, 'RVEF', '%')
  const tapseValue = formatMetricValue(tapse, 'TAPSE', 'mm')

  const rvefPhrase = rvef.grade === 'normal'
    ? 'preserved'
    : rvef.label
      ? lowerFirst(rvef.label)
      : 'reported'
  const tapsePhrase = tapse.grade === 'normal'
    ? 'preserved'
    : tapse.label
      ? lowerFirst(tapse.label)
      : 'reported'
  const isolatedTapsePhrase = tapse.grade === 'severe' ? 'markedly reduced' : tapsePhrase

  if (sizePhrase && rvef.grade === 'severe' && tapse.grade === 'severe' && rvefValue && tapseValue) {
    return `The RV is ${sizePhrase}, with severely impaired global and longitudinal systolic function (${rvefValue}, ${tapseValue}).`
  }

  let functionBody: string | null = null
  if (rvefValue && tapseValue) {
    if (rvef.grade === 'normal' && tapse.grade === 'normal') {
      functionBody = `preserved global and longitudinal systolic function (${rvefValue}, ${tapseValue})`
    } else if (rvef.grade === 'normal') {
      functionBody = `preserved global systolic function (${rvefValue}) and ${isolatedTapsePhrase} longitudinal function (${tapseValue})`
    } else if (tapse.grade === 'normal') {
      functionBody = `${rvefPhrase} global systolic function (${rvefValue}) and preserved longitudinal function (${tapseValue})`
    } else {
      functionBody = `${rvefPhrase} global systolic function (${rvefValue}) and ${tapsePhrase} longitudinal function (${tapseValue})`
    }
  } else if (rvefValue) {
    functionBody = `${rvefPhrase} global systolic function (${rvefValue})`
  } else if (tapseValue) {
    functionBody = `${tapsePhrase} longitudinal systolic function (${tapseValue})`
  }

  if (sizePhrase && functionBody) {
    return `The RV is ${sizePhrase}, with ${functionBody}.`
  }
  if (sizePhrase) {
    return `The RV is ${sizePhrase}.`
  }
  if (!functionBody) {
    return null
  }

  if (rvefValue && tapseValue) {
    if (rvef.grade === 'normal' && tapse.grade === 'normal') {
      return `Global and longitudinal RV systolic function are preserved (${rvefValue}, ${tapseValue}).`
    }
    if (rvef.grade === 'normal') {
      return `Global RV systolic function is preserved (${rvefValue}) and ${isolatedTapsePhrase} longitudinal function is present (${tapseValue}).`
    }
    if (tapse.grade === 'normal') {
      return `Global RV systolic function is ${rvefPhrase} (${rvefValue}) and longitudinal function is preserved (${tapseValue}).`
    }
    return `Global RV systolic function is ${rvefPhrase} (${rvefValue}) and longitudinal function is ${tapsePhrase} (${tapseValue}).`
  }

  if (rvefValue) {
    return `Global RV systolic function is ${rvefPhrase} (${rvefValue}).`
  }

  return `Longitudinal RV systolic function is ${tapsePhrase} (${tapseValue}).`
}

function buildRvConclusionSizePhrase(classified: ClassifiedMeasurement): string | null {
  switch (classified.grade) {
    case 'normal':
      return 'a non-dilated RV'
    case 'mild':
      return 'a mildly dilated RV'
    case 'moderate':
      return 'a moderately dilated RV'
    case 'severe': {
      const unit = classified.param ? formatUnit(classified.param.unit) : (classified.key === 'RV EDV (i)' ? 'mL/m2' : 'mL')
      const label = classified.key === 'RV EDV (i)' ? 'RV EDVi' : 'RV EDV'
      return `a severely dilated RV (${label} ${formatNumber(classified.value ?? 0, classified.param?.decimal_places ?? 0)} ${unit})`
    }
    default:
      return null
  }
}

export function buildRvConclusionSentence(
  measurementMap: MeasurementMap,
  paramMap: ParamMap,
): string | null {
  const size = classifyMeasurement(measurementMap, paramMap, ['RV EDV (i)', 'RV EDV'])
  const rvef = classifyMeasurement(measurementMap, paramMap, ['RV EF'])
  const tapse = classifyMeasurement(measurementMap, paramMap, ['TAPSE'])

  const sizePhrase = buildRvConclusionSizePhrase(size)
  const rvefValue = formatMetricValue(rvef, 'RVEF', '%')
  const tapseValue = formatMetricValue(tapse, 'TAPSE', 'mm')
  const rvefPhrase = rvef.grade === 'normal'
    ? 'preserved'
    : rvef.label
      ? lowerFirst(rvef.label)
      : 'reported'
  const tapsePhrase = tapse.grade === 'normal'
    ? 'preserved'
    : tapse.label
      ? lowerFirst(tapse.label)
      : 'reported'

  if (rvefValue && sizePhrase) {
    return `${upperFirst(rvefPhrase)} RV systolic function (${rvefValue}) with ${sizePhrase}.`
  }
  if (rvefValue) {
    return `${upperFirst(rvefPhrase)} RV systolic function (${rvefValue}).`
  }
  if (tapseValue && sizePhrase) {
    return `${upperFirst(tapsePhrase)} longitudinal RV systolic function (${tapseValue}) with ${sizePhrase}.`
  }
  if (tapseValue) {
    return `${upperFirst(tapsePhrase)} longitudinal RV systolic function (${tapseValue}).`
  }
  if (sizePhrase) {
    return `${upperFirst(sizePhrase)}.`
  }

  return null
}

function buildRwmaConclusionClause(rwmaData: RwmaSummaryData | null | undefined): string | null {
  if (!rwmaData?.hasAbnormality) return null

  const territoryText = rwmaData.territories.length > 0
    ? `in the ${formatTerritoryList(rwmaData.territories)}`
    : null
  const hasHypokinesis = rwmaData.stateCounts.hypokinesis > 0
  const hasAkinesis = rwmaData.stateCounts.akinesis > 0
  const hasDyskinesis = rwmaData.stateCounts.dyskinesis > 0

  if (hasDyskinesis && hasAkinesis && !hasHypokinesis) {
    return territoryText
      ? `regional akinetic-dyskinetic change ${territoryText}`
      : 'regional akinetic-dyskinetic change'
  }

  if (hasDyskinesis && !hasAkinesis && !hasHypokinesis) {
    return territoryText
      ? `regional dyskinetic change ${territoryText}`
      : 'regional dyskinetic change'
  }

  if (hasAkinesis && hasHypokinesis && !hasDyskinesis) {
    return territoryText
      ? `regional hypokinetic-akinetic change ${territoryText}`
      : 'regional hypokinetic-akinetic change'
  }

  if (hasAkinesis && !hasHypokinesis && !hasDyskinesis) {
    return territoryText
      ? `regional akinetic change ${territoryText}`
      : 'regional akinetic change'
  }

  if (hasHypokinesis && !hasAkinesis && !hasDyskinesis) {
    return territoryText
      ? `regional hypokinetic change ${territoryText}`
      : 'regional hypokinetic change'
  }

  return territoryText
    ? `regional dysfunction ${territoryText}`
    : 'regional dysfunction'
}

function formatTerritoryList(territories: string[]): string {
  if (territories.length === 0) return ''
  const joined = joinList(territories)
  return `${joined} ${territories.length === 1 ? 'territory' : 'territories'}`
}

function isIsolatedRvInsertionPointFibrosis(text: string): boolean {
  const lowered = normalizeSpaces(text).toLowerCase()
  if (!lowered.includes('rv insertion point')) {
    return false
  }

  const residual = normalizeSpaces(
    lowered
      .replace(/there is\s+/g, ' ')
      .replace(/focal (?:late gadolinium )?enhancement at the rv insertion points, typical of insertion point fibrosis\.?/g, ' ')
      .replace(/focal (?:late gadolinium )?enhancement at the rv insertion points, in keeping with rv insertion point fibrosis\.?/g, ' ')
      .replace(/focal rv insertion point fibrosis\.?/g, ' ')
      .replace(/no other myocardial scar or fibrosis\.?/g, ' ')
      .replace(/no ischaemic scar\.?/g, ' ')
      .replace(/no ischaemic scar or other myocardial fibrosis\.?/g, ' '),
  )

  return residual.length === 0
}

function buildTissueConclusionFromTissueStatement(tissueStatement: string | null | undefined): string | null {
  const normalized = normalizeLgeReportText(tissueStatement)
  if (!normalized) return null

  if (isIsolatedRvInsertionPointFibrosis(normalized)) {
    return 'Focal RV insertion point late gadolinium enhancement. No other myocardial scar or fibrosis.'
  }

  const lowered = normalized.toLowerCase()
  if (lowered.includes('rv insertion point') && lowered.includes('non-ischaemic')) {
    let body = stripFinalPeriod(normalized)
      .replace(/^There (?:is|are)\s+/i, '')
      .replace(/\s+with (?:1-25%|26-50%|51-75%|76-100%|<=50%|>50%) transmurality\b/gi, '')
      .replace(/\s*\((?:1-25%|26-50%|51-75%|76-100%|<=50%|>50%) transmurality\)/gi, '')
      .replace(/\blate gadolinium enhancement in a non-ischaemic pattern:\s*/i, 'non-ischaemic late gadolinium enhancement with ')
      .replace(/\.\s*in addition, there is focal late gadolinium enhancement at the rv insertion points, typical of insertion point fibrosis\b/gi, ', with separate RV insertion point late gadolinium enhancement')
      .replace(/\.\s*in addition, there is focal late gadolinium enhancement at the rv insertion points, in keeping with rv insertion point fibrosis\b/gi, ', with separate RV insertion point late gadolinium enhancement')
      .replace(/\.\s*separate focal late gadolinium enhancement at the rv insertion points is typical of insertion point fibrosis\b/gi, ', with separate RV insertion point late gadolinium enhancement')
      .replace(/\.\s*separate focal enhancement at the rv insertion points is typical of insertion point fibrosis\b/gi, ', with separate RV insertion point late gadolinium enhancement')
      .replace(/\bin addition, there is focal late gadolinium enhancement at the rv insertion points, typical of insertion point fibrosis\b/gi, 'with separate RV insertion point late gadolinium enhancement')
      .replace(/\bin addition, there is focal late gadolinium enhancement at the rv insertion points, in keeping with rv insertion point fibrosis\b/gi, 'with separate RV insertion point late gadolinium enhancement')
      .replace(/\bseparate focal late gadolinium enhancement at the rv insertion points is typical of insertion point fibrosis\b/gi, 'with separate RV insertion point late gadolinium enhancement')
      .replace(/\bseparate focal enhancement at the rv insertion points is typical of insertion point fibrosis\b/gi, 'with separate RV insertion point late gadolinium enhancement')
      .replace(/,\s*in a non-ischaemic pattern\b/gi, '')
      .replace(/\bconsistent with a non-ischaemic pattern\b/gi, '')
      .replace(/,\s*$/g, '')
      .trim()

    if (!/\bnon-ischaemic\b/i.test(body)) {
      body = body.replace(
        /\b(mid-wall|subepicardial|patchy|late gadolinium enhancement|enhancement)\b/i,
        'non-ischaemic $1',
      )
    }

    body = normalizeSpaces(body)
      .replace(/\s+,/g, ',')
      .replace(/\s+;/g, ';')
      .replace(/\s+:/g, ':')
      .trim()

    if (body) {
      return `${upperFirst(body)}.`
    }
  }

  if (
    lowered.includes('no late gadolinium enhancement')
    || lowered.includes('no myocardial scar')
    || lowered.includes('no scar or fibrosis')
  ) {
    return 'No myocardial scar or fibrosis.'
  }

  if (lowered.includes('non-ischaemic pattern')) {
    let body = stripFinalPeriod(normalized)
      .replace(/^There (?:is|are)\s+/i, '')
      .replace(/\s+with (?:1-25%|26-50%|51-75%|76-100%|<=50%|>50%) transmurality\b/gi, '')
      .replace(/\s*\((?:1-25%|26-50%|51-75%|76-100%|<=50%|>50%) transmurality\)/gi, '')
      .replace(/\blate gadolinium enhancement in a non-ischaemic pattern:\s*/i, 'non-ischaemic late gadolinium enhancement with ')
      .replace(/\.\s*in addition, there is focal late gadolinium enhancement at the rv insertion points, typical of insertion point fibrosis\b/gi, ', with separate RV insertion point late gadolinium enhancement')
      .replace(/\.\s*in addition, there is focal late gadolinium enhancement at the rv insertion points, in keeping with rv insertion point fibrosis\b/gi, ', with separate RV insertion point late gadolinium enhancement')
      .replace(/\bin addition, there is focal late gadolinium enhancement at the rv insertion points, typical of insertion point fibrosis\b/gi, 'with separate RV insertion point late gadolinium enhancement')
      .replace(/\bin addition, there is focal late gadolinium enhancement at the rv insertion points, in keeping with rv insertion point fibrosis\b/gi, 'with separate RV insertion point late gadolinium enhancement')
      .replace(/,\s*in a non-ischaemic pattern\b/gi, '')
      .replace(/\bconsistent with a non-ischaemic pattern\b/gi, '')
      .replace(/,\s*$/g, '')
      .trim()

    if (!/\bnon-ischaemic\b/i.test(body)) {
      body = body.replace(
        /\b(mid-wall|subepicardial|patchy|late gadolinium enhancement|enhancement)\b/i,
        'non-ischaemic $1',
      )
    }

    body = normalizeSpaces(body)
      .replace(/\s+,/g, ',')
      .replace(/\s+;/g, ';')
      .replace(/\s+:/g, ':')
      .trim()

    if (body) {
      return `${upperFirst(body)}.`
    }
  }

  return normalized
}

function buildInfarctScarConclusion(
  lgeData: LgeSummaryData | null | undefined,
): string | null {
  if (!lgeData || lgeData.ischaemicCount === 0) return null

  const territoryOrder = ['LAD', 'RCA', 'LCx'] as const
  const byTerritory = new Map<string, {
    territory: string
    minTransmurality: number
    maxTransmurality: number
    viableCount: number
    nonViableCount: number
  }>()

  for (const segment of lgeData.segments) {
    if (segment.pattern !== 1 && segment.pattern !== 4) continue

    const current = byTerritory.get(segment.territory) ?? {
      territory: segment.territory,
      minTransmurality: segment.transmurality,
      maxTransmurality: segment.transmurality,
      viableCount: 0,
      nonViableCount: 0,
    }

    current.minTransmurality = Math.min(current.minTransmurality, segment.transmurality)
    current.maxTransmurality = Math.max(current.maxTransmurality, segment.transmurality)
    if (segment.transmurality <= 2) current.viableCount += 1
    if (segment.transmurality >= 3) current.nonViableCount += 1
    byTerritory.set(segment.territory, current)
  }

  const territorySummaries = territoryOrder
    .map((territory) => byTerritory.get(territory))
    .filter(Boolean) as {
      territory: string
      minTransmurality: number
      maxTransmurality: number
      viableCount: number
      nonViableCount: number
    }[]

  if (territorySummaries.length === 0) {
    return 'Prior infarction in affected territories.'
  }

  const describeScarBand = (summary: {
    minTransmurality: number
    maxTransmurality: number
    viableCount: number
    nonViableCount: number
  }): string => {
    if (summary.viableCount > 0 && summary.nonViableCount === 0) {
      if (summary.minTransmurality === summary.maxTransmurality) {
        switch (summary.maxTransmurality) {
          case 1:
            return '1-25% transmural scar and preserved viability'
          case 2:
            return '26-50% transmural scar and preserved viability'
          default:
            break
        }
      }
      return '<=50% transmural scar and preserved viability'
    }

    if (summary.nonViableCount > 0 && summary.viableCount === 0) {
      if (summary.minTransmurality === summary.maxTransmurality) {
        switch (summary.maxTransmurality) {
          case 3:
            return '51-75% transmural scar and limited viability'
          case 4:
            return '76-100% transmural scar and no meaningful viability'
          default:
            break
        }
      }
      return '>50% transmural scar and limited viability'
    }

    return 'both <=50% and >50% transmural scar, with viability preserved only in segments with <=50% scar'
  }

  const grouped = new Map<string, string[]>()
  for (const summary of territorySummaries) {
    const descriptor = describeScarBand(summary)
    const territories = grouped.get(descriptor) ?? []
    territories.push(summary.territory)
    grouped.set(descriptor, territories)
  }

  const fragments = Array.from(grouped.entries()).map(([descriptor, territories]) => {
    const territoryText = joinList(territories)
    return `${territoryText} infarction with ${descriptor}`
  })

  if (fragments.length === 1) {
    return `Prior ${fragments[0]}.`
  }

  if (fragments.length === 2) {
    return `Prior ${fragments[0]}, and ${fragments[1]}.`
  }

  return `Prior ${fragments.slice(0, -1).join('; ')}; and ${fragments[fragments.length - 1]}.`
}

export function buildIntegratedIschaemiaConclusion(
  reportType: ReportType,
  perfusionData: PerfusionSummaryData | null | undefined,
  lgeData: LgeSummaryData | null | undefined,
  tissueStatement?: string | null,
): string | null {
  const scarConclusion = buildInfarctScarConclusion(lgeData)
  const normalizedTissue = buildTissueConclusionFromTissueStatement(tissueStatement)

  if (reportType !== 'stress') {
    return scarConclusion ?? normalizedTissue
  }

  if (!perfusionData) {
    return scarConclusion ?? normalizedTissue
  }

  switch (perfusionData.impression) {
    case 'non-diagnostic':
      return scarConclusion
        ? `Non-diagnostic for inducible ischaemia because of suboptimal vasodilator response. ${scarConclusion}`
        : normalizedTissue && normalizedTissue !== 'No myocardial scar or fibrosis.'
          ? `Non-diagnostic for inducible ischaemia because of suboptimal vasodilator response. ${normalizedTissue}`
          : 'Non-diagnostic for inducible ischaemia because of suboptimal vasodilator response.'
    case 'normal':
    case 'rest-only':
      return scarConclusion
        ? `No inducible ischaemia. ${scarConclusion}`
        : normalizedTissue === 'No myocardial scar or fibrosis.'
          ? 'No inducible ischaemia or myocardial scar/fibrosis.'
          : normalizedTissue
            ? `No inducible ischaemia. ${normalizedTissue}`
            : 'No inducible ischaemia.'
    case 'matched-scar':
      return scarConclusion
        ? `No inducible ischaemia beyond scar. ${scarConclusion}`
        : 'No inducible ischaemia beyond established scar.'
    case 'exceeds-lge':
      return scarConclusion
        ? `Perfusion defects extend beyond infarct-pattern scar, consistent with peri-infarct ischaemia in adjacent viable myocardium. ${scarConclusion}`
        : 'Perfusion defects extend beyond infarct-pattern scar, consistent with peri-infarct ischaemia in adjacent viable myocardium.'
    case 'inducible': {
      if (perfusionData.stress.territories.length === 1) {
        return `Inducible ${perfusionData.stress.territories[0]} territory ischaemia in viable myocardium, without infarct-pattern scar.`
      }

      if (perfusionData.stress.territories.length > 1) {
        return `Inducible ischaemia in viable myocardium across the ${formatTerritoryList(perfusionData.stress.territories)}, without infarct-pattern scar.`
      }

      return 'Inducible ischaemia in viable myocardium, without infarct-pattern scar.'
    }
    case 'multivessel': {
      const territoryText = perfusionData.stress.territories.length > 0
        ? formatTerritoryList(perfusionData.stress.territories)
        : 'multiple territories'
      return scarConclusion
        ? `Widespread subendocardial inducible ischaemia across the ${territoryText}, consistent with multivessel disease. ${scarConclusion}`
        : `Widespread subendocardial inducible ischaemia across the ${territoryText}, consistent with multivessel disease.`
    }
    case 'indeterminate':
      return scarConclusion
        ? `Stress perfusion abnormality is present, but its relationship to infarct-pattern scar is indeterminate. ${scarConclusion}`
        : 'Stress perfusion abnormality is present, but its relationship to infarct-pattern scar is indeterminate.'
    default:
      return scarConclusion ?? normalizedTissue
  }
}

export function buildReportConclusions(input: {
  measurementMap: MeasurementMap
  paramMap: ParamMap
  reportType: ReportType
  rwmaData?: RwmaSummaryData | null
  tissueStatement?: string | null
  perfusionData?: PerfusionSummaryData | null
  lgeData?: LgeSummaryData | null
  valveText?: string | null
  includeValveAssessment?: boolean
  phText?: string | null
  includePhAssessment?: boolean
  thrombusData?: ThrombusSummaryData | null
  thrombusText?: string | null
}): string[] {
  const conclusions: string[] = []
  let valveConclusion: string | null = null
  const normalizedThrombus = normalizeThrombusReportText(input.thrombusText)
  const mergeLvThrombus = Boolean(
    normalizedThrombus
    && input.thrombusData?.thrombusCount === 1
    && /\bleft ventricular\b/i.test(normalizedThrombus),
  )
  const integratedConclusion = buildIntegratedIschaemiaConclusion(
    input.reportType,
    input.perfusionData,
    input.lgeData,
    input.tissueStatement,
  )
  const shouldLeadWithStressConclusion = Boolean(
    integratedConclusion
    && input.reportType === 'stress'
    && (
      input.perfusionData?.impression === 'inducible'
      || input.perfusionData?.impression === 'exceeds-lge'
      || input.perfusionData?.impression === 'multivessel'
    )
  )

  if (shouldLeadWithStressConclusion && integratedConclusion) {
    conclusions.push(integratedConclusion)
  }

  const lvConclusion = buildLvConclusionSentence(input.measurementMap, input.paramMap, {
    rwmaData: input.rwmaData,
    thrombusText: mergeLvThrombus ? normalizedThrombus : null,
  })
  if (lvConclusion) conclusions.push(lvConclusion)

  const rvConclusion = buildRvConclusionSentence(input.measurementMap, input.paramMap)
  if (rvConclusion) conclusions.push(rvConclusion)

  if (!shouldLeadWithStressConclusion && integratedConclusion) conclusions.push(integratedConclusion)

  if (input.includeValveAssessment) {
    valveConclusion = buildValveConclusionText(input.valveText)
    if (valveConclusion) {
      conclusions.push(valveConclusion)
    }
  }

  if (input.includePhAssessment) {
    const phConclusion = buildPhConclusionText(
      input.phText,
      input.measurementMap,
      input.paramMap,
    )
    if (phConclusion) {
      conclusions.push(phConclusion)
    }
  }

  if (!mergeLvThrombus && normalizedThrombus && normalizedThrombus !== 'No thrombus.') {
    conclusions.push(normalizedThrombus)
  }

  return conclusions
}

function buildAtrialSizePhrase(
  chamber: 'LA' | 'RA',
  classified: ClassifiedMeasurement,
): string | null {
  switch (classified.grade) {
    case 'normal':
      return 'normal in size'
    case 'mild':
      return 'mildly enlarged'
    case 'moderate':
      return 'moderately enlarged'
    case 'severe': {
      const label = chamber === 'LA' ? 'LAVi' : 'RAVi'
      const unit = classified.param ? formatUnit(classified.param.unit) : 'mL/m2'
      return `severely enlarged (${label} ${formatNumber(classified.value ?? 0, classified.param?.decimal_places ?? 0)} ${unit})`
    }
    default:
      return null
  }
}

export function buildAtriaSentence(
  measurementMap: MeasurementMap,
  paramMap: ParamMap,
): string | null {
  const la = classifyMeasurement(measurementMap, paramMap, ['LA max volume (i)', 'LA max volume', 'LA volume (i)', 'LA volume'])
  const ra = classifyMeasurement(measurementMap, paramMap, ['RA max volume (i)', 'RA max volume', 'RA volume (i)', 'RA volume'])

  const laPhrase = buildAtrialSizePhrase('LA', la)
  const raPhrase = buildAtrialSizePhrase('RA', ra)

  if (laPhrase && raPhrase && la.grade === 'normal' && ra.grade === 'normal') {
    return 'The left and right atria are normal in size.'
  }

  if (laPhrase && raPhrase && la.grade === ra.grade && la.grade !== 'normal' && la.grade !== 'unknown') {
    if (la.grade === 'severe') {
      return `The left and right atria are severely enlarged (LAVi ${formatNumber(la.value ?? 0, la.param?.decimal_places ?? 0)} ${formatUnit(la.param?.unit ?? 'mL/m2')}; RAVi ${formatNumber(ra.value ?? 0, ra.param?.decimal_places ?? 0)} ${formatUnit(ra.param?.unit ?? 'mL/m2')}).`
    }
    return `The left and right atria are ${laPhrase.replace(' enlarged', '')} enlarged.`
  }

  const parts: string[] = []
  if (laPhrase) {
    parts.push(`The left atrium is ${laPhrase}.`)
  }
  if (raPhrase) {
    parts.push(`The right atrium is ${raPhrase}.`)
  }

  return parts.length > 0 ? parts.join(' ') : null
}

export function buildReportAdditionalConsiderations(
  measurementMap: MeasurementMap,
  paramMap: ParamMap,
): ReportAdditionalConsideration[] {
  const considerations: ReportAdditionalConsideration[] = []

  const lvef = classifyClinicalLvefMeasurement(measurementMap, paramMap)
  const mapse = buildMapseMeasurement(measurementMap, paramMap)
  const septalMapse = measurementMap.get('MAPSE septal')
  const lateralMapse = measurementMap.get('MAPSE lateral')

  if (lvef.grade === 'normal' && mapse.grade !== 'normal' && mapse.grade !== 'unknown') {
    considerations.push({
      section: 'Left ventricle',
      consideration: 'Preserved LVEF with reduced MAPSE',
      comment: 'Preserved LVEF with reduced longitudinal shortening suggests early or regional dysfunction, dyssynchrony, or tethering; correlate with RWMA, LGE, and ECG if clinically relevant.',
    })
  }

  if (lvef.grade !== 'normal' && lvef.grade !== 'unknown' && mapse.grade === 'normal') {
    considerations.push({
      section: 'Left ventricle',
      consideration: 'Reduced LVEF with preserved MAPSE',
      comment: 'Reduced LVEF with preserved longitudinal function can reflect discordant radial and longitudinal impairment, loading effects, or contouring discordance; review volumes, rhythm, and contouring if needed.',
    })
  }

  if (septalMapse != null && lateralMapse != null && Number.isFinite(septalMapse) && Number.isFinite(lateralMapse)) {
    const disparity = Math.abs(septalMapse - lateralMapse)
    if (disparity >= 6) {
      considerations.push({
        section: 'Left ventricle',
        consideration: 'Marked septal-lateral MAPSE disparity',
        comment: `Marked septal-lateral longitudinal disparity is present (septal ${formatNumber(septalMapse, 0)} mm; lateral ${formatNumber(lateralMapse, 0)} mm). Correlate with dyssynchrony, regional scar, or tethering if genuine.`,
      })
    }
  }

  const rvef = classifyMeasurement(measurementMap, paramMap, ['RV EF'])
  const tapse = classifyMeasurement(measurementMap, paramMap, ['TAPSE'])

  if (rvef.grade === 'normal' && tapse.grade !== 'normal' && tapse.grade !== 'unknown') {
    considerations.push({
      section: 'Right ventricle',
      consideration: 'Preserved RVEF with reduced TAPSE',
      comment: 'Preserved RVEF with reduced longitudinal shortening suggests discordant radial and longitudinal RV mechanics, loading effects, or contouring discordance; correlate with RV size, septal motion, and clinical context if relevant.',
    })
  }

  if (rvef.grade !== 'normal' && rvef.grade !== 'unknown' && tapse.grade === 'normal') {
    considerations.push({
      section: 'Right ventricle',
      consideration: 'Reduced RVEF with preserved TAPSE',
      comment: 'Reduced RVEF with preserved longitudinal shortening can reflect discordant RV contraction pattern, contouring discordance, or load-related change; review RV contours, rhythm, and septal interaction if needed.',
    })
  }

  return considerations
}

export function normalizeRwmaReportText(text: string | null | undefined): string | null {
  const source = normalizeSpaces(String(text ?? ''))
  if (!source) return null

  const withoutWmsi = normalizeSpaces(
    source
      .replace(/\s*Wall motion score index\s+\d+(?:\.\d+)?(?:\s*\((?:normal|mild|moderate|severe)\))?\.\s*/gi, ' ')
      .replace(/\s*WMSI\s+\d+(?:\.\d+)?(?:\s*\((?:normal|mild|moderate|severe)\))?\.\s*/gi, ' '),
  )

  if (!withoutWmsi) return null

  const lowered = withoutWmsi.toLowerCase()
  if (
    lowered === 'normal wall motion. no regional wall motion abnormalities identified.'
    || lowered === 'no regional wall motion abnormalities identified.'
    || lowered === 'normal wall motion.'
    || lowered === 'no regional wall motion abnormality.'
  ) {
    return 'No regional wall motion abnormality.'
  }

  const replaced = withoutWmsi
    .replace(/^Regional wall motion abnormality:\s*/i, 'Regional wall motion abnormality involving ')
    .replace(/^Regional wall motion abnormalities:\s*/i, 'Regional wall motion abnormalities involving ')

  let body = replaced.trim()
  while (true) {
    const updatedBody = body
      .replace(/^Regional wall motion abnormalit(?:y|ies)\s+present,?\s*(?:with|involving)\s*/i, '')
      .replace(/^Regional wall motion abnormalit(?:y|ies)\s+involving\s*/i, '')
      .replace(/^There (?:is|are)\s+regional wall motion abnormalit(?:y|ies)\s*(?:present,?\s*)?(?:with|involving)?\s*/i, '')
      .trim()
    if (updatedBody === body) {
      break
    }
    body = updatedBody
  }

  if (!body) return null

  const hasMultipleClauses = body.includes('; ')
  const hasMixedStates = [' hypokinesis', ' akinesis', ' dyskinesis']
    .filter((token) => body.includes(token))
    .length > 1

  const label = hasMultipleClauses || hasMixedStates
    ? 'Regional wall motion abnormalities involving '
    : 'Regional wall motion abnormality involving '

  return `${label}${body}`
}

export function buildRwmaAdditionalConsiderations(
  segStates: Record<number, RwmaCode>,
): ReportAdditionalConsideration[] {
  const summary = generateRwmaSummary(segStates)
  if (!summary.hasAbnormality) {
    return []
  }

  return [
    {
      section: 'Left ventricle',
      consideration: 'Wall motion score index',
      comment: `WMSI ${summary.wmsi.toFixed(2)} (${summary.severity}).`,
    },
  ]
}

export function buildLgeAdditionalConsiderations(
  segStates: Record<number, LgeCode>,
  patternStates: Record<number, PatternCode>,
): ReportAdditionalConsideration[] {
  const summary = generateLgeSummary(segStates, patternStates)
  if (summary.enhancedCount <= 0) {
    return []
  }

  return [
    {
      section: 'Tissue characterisation',
      consideration: 'LGE score index',
      comment: `${summary.scoreIndex.toFixed(2)} (${summary.enhancedCount}/17 segments).`,
    },
  ]
}
