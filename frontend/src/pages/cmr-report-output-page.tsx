import { Fragment, useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from 'react'
import { ChevronDown } from 'lucide-react'
import { useNavigate } from 'react-router-dom'

import { SectionMarker } from '@/components/patterns'
import { PageHeader, Row, Stack } from '@/components/primitives'
import { Button, Input, Modal, ModalBody, ModalClose, ModalContent, ModalDescription, ModalHeader, ModalTitle, Textarea } from '@/components/ui'
import { fetchConfig, fetchReferenceParameters, type CmrCanonicalParam } from '@/lib/cmr-api'
import {
  applyCmrReferencePreset,
  normalizeCmrReferencePreset,
} from '@/lib/cmr-reference-presets'
import {
  buildCmrCaseLessonsData,
  buildCmrCaseLessonsSignature,
  normalizeCmrCaseLessonsProse,
  type CmrCaseLessonsInput,
  type CmrCaseLessonsMode,
} from '@/lib/cmr-case-lessons'
import type { CmrOutputDraft, CmrOutputUndoRegenerateSnapshot, CmrOutputValveKey } from '@/lib/cmr-case-defaults'
import {
  buildPhSummaryData,
  buildPhSummarySignature,
  normalizePhRegurgitationChoice,
  type PhSummaryChoices,
} from '@/lib/cmr-ph-summary'
import {
  buildAtriaSentence,
  buildAorticValveReportText,
  buildPulmonaryValveReportText,
  buildReportConclusionSourceSignature,
  buildLvSentence,
  buildMitralValveReportText,
  buildTricuspidValveReportText,
  buildReportConclusions,
  buildRvSentence,
  buildValveSummarySentence,
  normalizeLgeReportText,
  normalizePhReportText,
  normalizePerfusionReportText,
  normalizeReportConclusionLines,
  normalizeRwmaReportText,
} from '@/lib/cmr-report-output'
import { setCmrReportOutputDraft } from '@/lib/cmr-report-output-draft-store'
import {
  REPORT_OUTPUT_ACTION_BUTTON_CLASSNAME,
  REPORT_OUTPUT_ACTIONS_CLASSNAME,
  REPORT_OUTPUT_INDICATOR_ROW_CLASSNAME,
  REPORT_OUTPUT_PROTOCOL_INDICATOR_CLASSNAME,
  REPORT_OUTPUT_REFINE_BUTTON_LABEL,
  REPORT_OUTPUT_UPDATE_VALUES_BUTTON_LABEL,
  REPORT_OUTPUT_UNDO_REGENERATE_BUTTON_LABEL,
  getReportOutputTissueIndicatorClassName,
} from '@/lib/cmr-report-output-layout'
import {
  getReportOutputSection,
  refreshReportOutputValues,
  replaceReportOutputSection,
  replaceReportQuantitativeSection,
  type ReportOutputSectionKey,
} from '@/lib/cmr-report-output-value-refresh'
import { buildReportFlowLines } from '@/lib/cmr-report-flow-lines'
import { buildAorticValveSummaryData, buildAorticValveSummarySignature } from '@/lib/cmr-aortic-valve-summary'
import { buildMitralValveSummaryData, buildMitralValveSummarySignature } from '@/lib/cmr-mitral-valve-summary'
import { buildPerfusionSummaryData, buildPerfusionSummarySignature, generatePerfusionSummary, type PerfusionCode } from '@/lib/cmr-perfusion-summary'
import { buildLgeSummaryData, buildLgeSummarySignature, generateLgeSummary, type LgeCode, type PatternCode } from '@/lib/cmr-lge-summary'
import { buildRwmaSummaryData, buildRwmaSummarySignature, generateRwmaSummary, type RwmaCode } from '@/lib/cmr-rwma-summary'
import {
  generateCmrCaseLessonsProse,
  generateCmrCaseQuestionAnswer,
  generateCmrReportConclusions,
  generateCmrReportSelectionRefinement,
} from '@/lib/cmr-summary-api'
import { buildThrombusSummaryData, type ThrombusSummaryEntryInput } from '@/lib/cmr-thrombus-summary'
import { buildTricuspidValveSummaryData, buildTricuspidValveSummarySignature } from '@/lib/cmr-tricuspid-valve-summary'
import { CMR_VASCULAR_ARRANGEMENT_OPTIONS, getCmrVascularArrangementOption } from '@/lib/cmr-vascular-arrangements'
import { populateIndexedMeasurements } from '@/lib/cmr-flow-measurements'
import { useCmrCaseStore } from '@/store/use-cmr-case-store'

type QuantRow = {
  key: string
  label?: string
  aliases?: string[]
}

const CORE_QUANT_ROWS: readonly QuantRow[] = [
  { key: 'LV EDV (i)' },
  { key: 'LV ESV (i)' },
  { key: 'LV mass (i)' },
  { key: 'LV peak wall thickness' },
  { key: 'LV SV (i)' },
  { key: 'LV EF' },
  { key: 'MAPSE' },
  { key: 'RV EDV (i)' },
  { key: 'RV ESV (i)' },
  { key: 'RV SV (i)' },
  { key: 'RV EF' },
  { key: 'TAPSE' },
  { key: 'LA max volume (i)' },
  { key: 'RA max volume (i)' },
  { key: 'PCWP', label: 'Estimated PCWP', aliases: ['Estimated PCWP'] },
  { key: 'mRAP', label: 'Estimated RAP', aliases: ['Estimated RAP', 'RAP'] },
] as const

const TISSUE_QUANT_ROWS: readonly QuantRow[] = [
  { key: 'Native T1', aliases: ['Native myocardial T1'] },
  { key: 'Post-contrast T1', aliases: ['Post contrast T1', 'Post-gadolinium T1'] },
  { key: 'ECV' },
  { key: 'Native T2', aliases: ['Native myocardial T2'] },
  { key: 'Myocardial T2*' },
] as const

const FLOW_QUANT_KEYS = [
  'AV forward flow (per heartbeat)',
  'AV backward flow (per heartbeat)',
  'AV regurgitant fraction',
  'PV forward flow (per heartbeat)',
  'PV backward flow (per heartbeat)',
  'PV regurgitant fraction',
] as const

const LABEL_WIDTH = 34
const VALUE_WIDTH = 8
const RANGE_WIDTH = 22
type LessonsTabKey = 'case-discussion' | 'ask-the-case'
type CaseQaConversationTurn = CmrOutputDraft['caseQaConversation'][number]
type ReportRefinementConversationTurn = {
  role: 'user' | 'assistant'
  content: string
  replacementText?: string | null
}
type ReportSelectionDraft = {
  text: string
  start: number
  end: number
  contextBefore: string
  contextAfter: string
}
type ValveSummaryItem = {
  key: CmrOutputValveKey
  label: string
  text: string | null
  displayText: string
  isStale: boolean
}
type LessonsContentBlock =
  | { kind: 'heading'; text: string }
  | { kind: 'paragraph'; text: string }
  | { kind: 'unordered-list'; items: string[] }
  | { kind: 'ordered-list'; items: string[] }
type CaseLessonsGenerationResult = {
  mode: CmrCaseLessonsMode
  ok: boolean
  error: string | null
}
type ReportRegenerateOptionKey = 'full' | ReportOutputSectionKey
type ReportRegenerateOption = {
  key: ReportRegenerateOptionKey
  label: string
}

const LESSONS_TAB_OPTIONS: Array<{
  key: LessonsTabKey
  label: string
}> = [
  {
    key: 'case-discussion',
    label: 'Case discussion',
  },
  {
    key: 'ask-the-case',
    label: 'Ask the case',
  },
]

const REPORT_VALVE_OPTIONS: Array<{ key: CmrOutputValveKey; label: string }> = [
  { key: 'mitral', label: 'Mitral valve' },
  { key: 'aortic', label: 'Aortic valve' },
  { key: 'tricuspid', label: 'Tricuspid valve' },
  { key: 'pulmonary', label: 'Pulmonary valve' },
]

const REPORT_REGENERATE_OPTIONS: readonly ReportRegenerateOption[] = [
  { key: 'full', label: 'Full report' },
  { key: 'intro', label: 'Header / context' },
  { key: 'left-ventricle', label: 'Left ventricle' },
  { key: 'right-ventricle', label: 'Right ventricle' },
  { key: 'atria', label: 'Atria' },
  { key: 'quantitative', label: 'CMR quantitative' },
  { key: 'tissue', label: 'Tissue characterisation' },
  { key: 'stress-perfusion', label: 'Stress perfusion' },
  { key: 'flow', label: 'Flow' },
  { key: 'valves', label: 'Valves' },
  { key: 'ph', label: 'PH assessment' },
  { key: 'conclusions', label: 'Conclusions' },
]

function normalizeSelectedValveKeys(keys: readonly string[] | null | undefined): CmrOutputValveKey[] {
  const allowed = new Set<CmrOutputValveKey>(REPORT_VALVE_OPTIONS.map((item) => item.key))
  if (!Array.isArray(keys)) {
    return REPORT_VALVE_OPTIONS.map((item) => item.key)
  }

  return keys
    .map((key) => String(key))
    .filter((key): key is CmrOutputValveKey => allowed.has(key as CmrOutputValveKey))
    .filter((key, index, source) => source.indexOf(key) === index)
}

function padRight(text: string, width: number): string {
  if (text.length >= width) return text
  return `${text}${' '.repeat(width - text.length)}`
}

function extractLessonsHeading(line: string): string | null {
  const trimmed = line.trim()
  const emphasizedHeading = trimmed.match(/^\*\*([^*]+)\*\*:?\s*$/)
  if (emphasizedHeading) {
    return emphasizedHeading[1]?.trim() ?? null
  }

  const colonHeading = trimmed.match(/^([A-Z][A-Za-z0-9/&()\-,' ]{1,40}):$/)
  if (colonHeading) {
    return colonHeading[1]?.trim() ?? null
  }

  return null
}

function buildLessonsContentBlocks(text: string): LessonsContentBlock[] {
  return text
    .split(/\n\s*\n/)
    .map((block) => block.trim())
    .filter(Boolean)
    .reduce<LessonsContentBlock[]>((blocks, block) => {
      const lines = block
        .split('\n')
        .map((line) => line.trim())
        .filter(Boolean)

      if (lines.length === 0) {
        return blocks
      }

      if (lines.length === 1) {
        const heading = extractLessonsHeading(lines[0] ?? '')
        if (heading) {
          blocks.push({ kind: 'heading', text: heading })
          return blocks
        }
      }

      if (lines.every((line) => /^[-*]\s+/.test(line))) {
        blocks.push({
          kind: 'unordered-list',
          items: lines.map((line) => line.replace(/^[-*]\s+/, '').trim()).filter(Boolean),
        })
        return blocks
      }

      if (lines.every((line) => /^\d+\.\s+/.test(line))) {
        blocks.push({
          kind: 'ordered-list',
          items: lines.map((line) => line.replace(/^\d+\.\s+/, '').trim()).filter(Boolean),
        })
        return blocks
      }

      blocks.push({
        kind: 'paragraph',
        text: lines.join(' '),
      })
      return blocks
    }, [])
}

function renderLessonsInlineText(text: string): ReactNode[] {
  const parts: ReactNode[] = []
  const pattern = /(\[([^\]]+)\]\((https?:\/\/[^\s)]+)\))|(\*\*([^*]+)\*\*)|(https?:\/\/[^\s<>()]+[^\s<>().,;:!?])/g
  let lastIndex = 0
  let key = 0

  for (const match of text.matchAll(pattern)) {
    const matchText = match[0]
    const start = match.index ?? 0
    if (start > lastIndex) {
      parts.push(<Fragment key={`text-${key++}`}>{text.slice(lastIndex, start)}</Fragment>)
    }

    const markdownLabel = match[2]
    const markdownHref = match[3]
    const boldText = match[5]
    const plainHref = match[6]

    if (markdownLabel && markdownHref) {
      parts.push(
        <a
          key={`link-${key++}`}
          href={markdownHref}
          target="_blank"
          rel="noreferrer"
          className="font-medium text-[hsl(var(--section-style-report-accent))] underline decoration-[hsl(var(--section-style-report-accent))/0.45] underline-offset-4"
        >
          {markdownLabel}
        </a>,
      )
    } else if (boldText) {
      parts.push(
        <strong key={`strong-${key++}`} className="font-semibold text-[hsl(var(--foreground))]">
          {boldText}
        </strong>,
      )
    } else if (plainHref) {
      parts.push(
        <a
          key={`url-${key++}`}
          href={plainHref}
          target="_blank"
          rel="noreferrer"
          className="font-medium text-[hsl(var(--section-style-report-accent))] underline decoration-[hsl(var(--section-style-report-accent))/0.45] underline-offset-4"
        >
          {plainHref}
        </a>,
      )
    } else if (matchText) {
      parts.push(<Fragment key={`raw-${key++}`}>{matchText}</Fragment>)
    }

    lastIndex = start + matchText.length
  }

  if (lastIndex < text.length) {
    parts.push(<Fragment key={`text-${key++}`}>{text.slice(lastIndex)}</Fragment>)
  }

  return parts
}

function formatDecimal(value: number, dp: number): string {
  return value.toFixed(dp)
}

function formatNumeric(value: number | null | undefined, dp: number = 0): string {
  return value == null || Number.isNaN(value) ? '--' : formatDecimal(value, dp)
}

function formatInteger(value: number | null | undefined): string {
  return value == null || Number.isNaN(value) ? '--' : `${Math.round(value)}`
}

function asciiUnit(unit: string): string {
  return unit.replaceAll('²', '2').replaceAll('³', '3').replaceAll('µ', 'u')
}

function formatNormalRange(param: CmrCanonicalParam | undefined): string {
  if (!param) return '--'
  const dp = param.decimal_places ?? (param.unit === 'm/s' ? 1 : 0)
  const mean = param.mean == null ? null : formatDecimal(param.mean, dp)
  const ll = param.ll == null ? null : formatDecimal(param.ll, dp)
  const ul = param.ul == null ? null : formatDecimal(param.ul, dp)

  if (mean && ll && ul) return `${mean} (${ll}-${ul})`
  if (ll && ul) return `(${ll}-${ul})`
  if (mean) return mean
  return '--'
}

function buildQuantLine(label: string, value: string, normalRange: string): string {
  return `${padRight(label, LABEL_WIDTH)}${padRight(value, VALUE_WIDTH)}  ${padRight(normalRange, RANGE_WIDTH)}`
}

function formatReportConclusionLines(conclusionLines: readonly string[]): string[] {
  if (conclusionLines.length === 0) {
    return [
      '1. [LV conclusion scaffold.]',
      '2. [RV conclusion scaffold.]',
    ]
  }

  return conclusionLines.map((line, index) => `${index + 1}. ${line}`)
}

function replaceReportConclusionsSection(
  reportText: string,
  conclusionLines: readonly string[],
): string {
  const lines = reportText.split(/\r?\n/)
  const conclusionsIndex = lines.findIndex((line) => line.trim() === 'Conclusions:')
  if (conclusionsIndex === -1) {
    return reportText
  }

  return [
    ...lines.slice(0, conclusionsIndex),
    'Conclusions:',
    ...formatReportConclusionLines(conclusionLines),
  ].join('\n')
}

function extractReportConclusionsSection(reportText: string): string[] | null {
  const lines = reportText.split(/\r?\n/)
  const conclusionsIndex = lines.findIndex((line) => line.trim() === 'Conclusions:')
  if (conclusionsIndex === -1) {
    return null
  }
  return lines.slice(conclusionsIndex + 1)
}

function extractReportPhSection(reportText: string): string | null {
  const lines = reportText.split(/\r?\n/)
  const phIndex = lines.findIndex((line) => line.trim() === 'Pulmonary hypertension assessment:')
  if (phIndex === -1) {
    return null
  }

  const conclusionsIndex = lines.findIndex(
    (line, index) => index > phIndex && line.trim() === 'Conclusions:',
  )
  const sectionLines = lines
    .slice(phIndex + 1, conclusionsIndex === -1 ? undefined : conclusionsIndex)
    .filter((line) => line.trim() !== '')

  return sectionLines.length > 0 ? sectionLines.join('\n') : null
}

function replaceReportValveSection(
  reportText: string,
  valveText: string | null,
  includeValveAssessment: boolean,
): string {
  let lines = reportText.split(/\r?\n/)
  const existingValveIndex = lines.findIndex((line) => line.trim() === 'Valves:')

  if (existingValveIndex !== -1) {
    const nextSectionIndex = lines.findIndex(
      (line, index) =>
        index > existingValveIndex
        && (
          line.trim() === 'Pulmonary hypertension assessment:'
          || line.trim() === 'Conclusions:'
        ),
    )
    const removeStart = existingValveIndex > 0 && lines[existingValveIndex - 1]?.trim() === ''
      ? existingValveIndex - 1
      : existingValveIndex
    const removeEnd = nextSectionIndex === -1 ? lines.length : nextSectionIndex
    lines = [
      ...lines.slice(0, removeStart),
      ...lines.slice(removeEnd),
    ]
  }

  if (!includeValveAssessment || !valveText) {
    return lines.join('\n')
  }

  const phIndex = lines.findIndex((line) => line.trim() === 'Pulmonary hypertension assessment:')
  const conclusionsIndex = lines.findIndex((line) => line.trim() === 'Conclusions:')
  const insertIndex = phIndex !== -1
    ? phIndex
    : conclusionsIndex !== -1
      ? conclusionsIndex
      : lines.length
  const valveSectionLines = [
    '',
    'Valves:',
    ...valveText.split(/\r?\n/).filter(Boolean),
    '',
  ]

  return [
    ...lines.slice(0, insertIndex),
    ...valveSectionLines,
    ...lines.slice(insertIndex),
  ].join('\n')
}

function replaceReportPhSection(
  reportText: string,
  phText: string | null,
  includePhAssessment: boolean,
): string {
  let lines = reportText.split(/\r?\n/)
  const existingPhIndex = lines.findIndex((line) => line.trim() === 'Pulmonary hypertension assessment:')

  if (existingPhIndex !== -1) {
    const conclusionsIndex = lines.findIndex(
      (line, index) => index > existingPhIndex && line.trim() === 'Conclusions:',
    )
    const removeStart = existingPhIndex > 0 && lines[existingPhIndex - 1]?.trim() === ''
      ? existingPhIndex - 1
      : existingPhIndex
    const removeEnd = conclusionsIndex === -1 ? lines.length : conclusionsIndex
    lines = [
      ...lines.slice(0, removeStart),
      ...lines.slice(removeEnd),
    ]
  }

  if (!includePhAssessment || !phText) {
    return lines.join('\n')
  }

  const conclusionsIndex = lines.findIndex((line) => line.trim() === 'Conclusions:')
  const phSectionLines = [
    '',
    'Pulmonary hypertension assessment:',
    ...phText.split(/\r?\n/).filter(Boolean),
    '',
  ]

  if (conclusionsIndex === -1) {
    return [...lines, ...phSectionLines].join('\n')
  }

  return [
    ...lines.slice(0, conclusionsIndex),
    ...phSectionLines,
    ...lines.slice(conclusionsIndex),
  ].join('\n')
}

function buildReportSelectionDraft(
  reportText: string,
  start: number,
  end: number,
  radius: number = 220,
): ReportSelectionDraft | null {
  const boundedStart = Math.max(0, Math.min(start, reportText.length))
  const boundedEnd = Math.max(boundedStart, Math.min(end, reportText.length))
  const text = reportText.slice(boundedStart, boundedEnd)
  if (!text.trim()) {
    return null
  }

  return {
    text,
    start: boundedStart,
    end: boundedEnd,
    contextBefore: reportText.slice(Math.max(0, boundedStart - radius), boundedStart).trim(),
    contextAfter: reportText.slice(boundedEnd, Math.min(reportText.length, boundedEnd + radius)).trim(),
  }
}

function findUniqueOccurrenceIndex(sourceText: string, targetText: string): number | null {
  if (!targetText) {
    return null
  }
  const firstIndex = sourceText.indexOf(targetText)
  if (firstIndex === -1) {
    return null
  }
  return sourceText.indexOf(targetText, firstIndex + targetText.length) === -1
    ? firstIndex
    : null
}

function applyReportSelectionReplacement(
  reportText: string,
  selection: ReportSelectionDraft,
  replacementText: string,
): { nextText: string; nextSelection: ReportSelectionDraft } | null {
  let replaceStart = selection.start
  let replaceEnd = selection.end

  if (reportText.slice(replaceStart, replaceEnd) !== selection.text) {
    const uniqueIndex = findUniqueOccurrenceIndex(reportText, selection.text)
    if (uniqueIndex == null) {
      return null
    }
    replaceStart = uniqueIndex
    replaceEnd = uniqueIndex + selection.text.length
  }

  const nextText = `${reportText.slice(0, replaceStart)}${replacementText}${reportText.slice(replaceEnd)}`
  const nextSelection = buildReportSelectionDraft(
    nextText,
    replaceStart,
    replaceStart + replacementText.length,
  )
  if (!nextSelection) {
    return null
  }

  return { nextText, nextSelection }
}

function resolveQuantKeys(row: QuantRow): string[] {
  return [row.key, ...(row.aliases ?? [])]
}

function parseNumber(value: string | number | null | undefined): number | null {
  if (value === null || value === undefined || value === '') return null
  const parsed = typeof value === 'number' ? value : Number(value)
  return Number.isFinite(parsed) ? parsed : null
}

function round(value: number, decimals: number): number {
  const factor = 10 ** decimals
  return Math.round(value * factor) / factor
}

function getFirstMeasurement(measurements: Map<string, number>, keys: readonly string[]): number | undefined {
  for (const key of keys) {
    const value = measurements.get(key)
    if (value !== undefined) return value
  }
  return undefined
}

function setCanonicalMeasurementAlias(
  measurements: Map<string, number>,
  canonicalKey: string,
  aliases: readonly string[],
): void {
  if (measurements.has(canonicalKey)) return
  const value = getFirstMeasurement(measurements, aliases)
  if (value !== undefined) {
    measurements.set(canonicalKey, value)
  }
}

function getMeasurementWithIndexedFallback({
  measurements,
  directKeys,
  indexedKeys,
  bsa,
}: {
  measurements: Map<string, number>
  directKeys: readonly string[]
  indexedKeys?: readonly string[]
  bsa?: number | null
}): number | undefined {
  const directValue = getFirstMeasurement(measurements, directKeys)
  if (directValue !== undefined) return directValue
  if (bsa == null || !Number.isFinite(bsa) || bsa <= 0 || !indexedKeys?.length) return undefined
  const indexedValue = getFirstMeasurement(measurements, indexedKeys)
  return indexedValue !== undefined ? indexedValue * bsa : undefined
}

function getMeasurementWithRateFallback({
  measurements,
  perBeatKeys,
  perMinuteKeys,
  heartRate,
}: {
  measurements: Map<string, number>
  perBeatKeys: readonly string[]
  perMinuteKeys?: readonly string[]
  heartRate?: number | null
}): number | undefined {
  const perBeatValue = getFirstMeasurement(measurements, perBeatKeys)
  if (perBeatValue !== undefined) return perBeatValue
  if (heartRate == null || !Number.isFinite(heartRate) || heartRate <= 0 || !perMinuteKeys?.length) return undefined
  const perMinuteValue = getFirstMeasurement(measurements, perMinuteKeys)
  return perMinuteValue !== undefined ? (perMinuteValue * 1000) / heartRate : undefined
}

function getMeasurementRatio({
  measurements,
  numeratorDirectKeys,
  denominatorDirectKeys,
  numeratorIndexedKeys,
  denominatorIndexedKeys,
  bsa,
}: {
  measurements: Map<string, number>
  numeratorDirectKeys: readonly string[]
  denominatorDirectKeys: readonly string[]
  numeratorIndexedKeys?: readonly string[]
  denominatorIndexedKeys?: readonly string[]
  bsa?: number | null
}): number | undefined {
  const directNumerator = getFirstMeasurement(measurements, numeratorDirectKeys)
  const directDenominator = getFirstMeasurement(measurements, denominatorDirectKeys)
  if (directNumerator !== undefined && directDenominator !== undefined && directDenominator > 0) {
    return directNumerator / directDenominator
  }

  const indexedNumerator = numeratorIndexedKeys?.length
    ? getFirstMeasurement(measurements, numeratorIndexedKeys)
    : undefined
  const indexedDenominator = denominatorIndexedKeys?.length
    ? getFirstMeasurement(measurements, denominatorIndexedKeys)
    : undefined
  if (indexedNumerator !== undefined && indexedDenominator !== undefined && indexedDenominator > 0) {
    return indexedNumerator / indexedDenominator
  }

  const resolvedNumerator = getMeasurementWithIndexedFallback({
    measurements,
    directKeys: numeratorDirectKeys,
    indexedKeys: numeratorIndexedKeys,
    bsa,
  })
  const resolvedDenominator = getMeasurementWithIndexedFallback({
    measurements,
    directKeys: denominatorDirectKeys,
    indexedKeys: denominatorIndexedKeys,
    bsa,
  })
  if (resolvedNumerator !== undefined && resolvedDenominator !== undefined && resolvedDenominator > 0) {
    return resolvedNumerator / resolvedDenominator
  }

  return undefined
}

function getStrokeVolume({
  measurements,
  directKeys,
  indexedKeys,
  edvKeys,
  esvKeys,
  indexedEdvKeys,
  indexedEsvKeys,
  coKeys,
  bsa,
  heartRate,
}: {
  measurements: Map<string, number>
  directKeys: readonly string[]
  indexedKeys?: readonly string[]
  edvKeys?: readonly string[]
  esvKeys?: readonly string[]
  indexedEdvKeys?: readonly string[]
  indexedEsvKeys?: readonly string[]
  coKeys?: readonly string[]
  bsa?: number | null
  heartRate?: number | null
}): number | undefined {
  const directValue = getMeasurementWithIndexedFallback({ measurements, directKeys, indexedKeys, bsa })
  if (directValue !== undefined) return directValue

  const edv = edvKeys ? getFirstMeasurement(measurements, edvKeys) : undefined
  const esv = esvKeys ? getFirstMeasurement(measurements, esvKeys) : undefined
  if (edv !== undefined && esv !== undefined) return edv - esv

  if (bsa != null && Number.isFinite(bsa) && bsa > 0 && indexedEdvKeys?.length && indexedEsvKeys?.length) {
    const indexedEdv = getFirstMeasurement(measurements, indexedEdvKeys)
    const indexedEsv = getFirstMeasurement(measurements, indexedEsvKeys)
    if (indexedEdv !== undefined && indexedEsv !== undefined) return (indexedEdv - indexedEsv) * bsa
  }

  return coKeys?.length
    ? getMeasurementWithRateFallback({ measurements, perBeatKeys: directKeys, perMinuteKeys: coKeys, heartRate })
    : undefined
}

function getEffectiveForwardFlow({
  measurements,
  effectiveBeatKeys,
  effectiveMinuteKeys,
  forwardBeatKeys,
  forwardMinuteKeys,
  backwardBeatKeys,
  backwardMinuteKeys,
  heartRate,
}: {
  measurements: Map<string, number>
  effectiveBeatKeys: readonly string[]
  effectiveMinuteKeys?: readonly string[]
  forwardBeatKeys: readonly string[]
  forwardMinuteKeys?: readonly string[]
  backwardBeatKeys?: readonly string[]
  backwardMinuteKeys?: readonly string[]
  heartRate?: number | null
}): number | undefined {
  const effectiveValue = getMeasurementWithRateFallback({
    measurements,
    perBeatKeys: effectiveBeatKeys,
    perMinuteKeys: effectiveMinuteKeys,
    heartRate,
  })
  if (effectiveValue !== undefined) return effectiveValue

  const forwardValue = getMeasurementWithRateFallback({
    measurements,
    perBeatKeys: forwardBeatKeys,
    perMinuteKeys: forwardMinuteKeys,
    heartRate,
  })
  if (forwardValue === undefined) return undefined

  const backwardValue = backwardBeatKeys
    ? getMeasurementWithRateFallback({
      measurements,
      perBeatKeys: backwardBeatKeys,
      perMinuteKeys: backwardMinuteKeys,
      heartRate,
    })
    : undefined
  return backwardValue === undefined ? forwardValue : forwardValue - Math.abs(backwardValue)
}

function computeBranchFlowPercentages({
  mainPaNetFlow,
  rpaNetFlow,
  lpaNetFlow,
}: {
  mainPaNetFlow: number | null
  rpaNetFlow: number | null
  lpaNetFlow: number | null
}): { rpaPercent: number | null; lpaPercent: number | null } {
  if (rpaNetFlow !== null && lpaNetFlow !== null) {
    const branchTotal = rpaNetFlow + lpaNetFlow
    if (branchTotal !== 0) {
      return {
        rpaPercent: round((rpaNetFlow / branchTotal) * 100, 1),
        lpaPercent: round((lpaNetFlow / branchTotal) * 100, 1),
      }
    }
  }

  if (mainPaNetFlow !== null && mainPaNetFlow !== 0) {
    return {
      rpaPercent: rpaNetFlow !== null ? round((rpaNetFlow / mainPaNetFlow) * 100, 1) : null,
      lpaPercent: lpaNetFlow !== null ? round((lpaNetFlow / mainPaNetFlow) * 100, 1) : null,
    }
  }

  return { rpaPercent: null, lpaPercent: null }
}

export function CmrReportOutputPage() {
  const navigate = useNavigate()
  const activeCase = useCmrCaseStore((state) => state.activeCase)
  const patchActiveCasePayload = useCmrCaseStore((state) => state.patchActiveCasePayload)
  const patchActiveCaseMeta = useCmrCaseStore((state) => state.patchActiveCaseMeta)
  const flushActiveCase = useCmrCaseStore((state) => state.flushActiveCase)
  const saveStatus = useCmrCaseStore((state) => state.saveStatus)
  const saveError = useCmrCaseStore((state) => state.saveError)
  const [referenceParams, setReferenceParams] = useState<CmrCanonicalParam[]>([])
  const [copied, setCopied] = useState(false)
  const [vascularModalOpen, setVascularModalOpen] = useState(false)
  const [additionalValuesModalOpen, setAdditionalValuesModalOpen] = useState(false)
  const [additionalValuesSearch, setAdditionalValuesSearch] = useState('')
  const [valveModalOpen, setValveModalOpen] = useState(false)
  const [phModalOpen, setPhModalOpen] = useState(false)
  const [lessonsModalOpen, setLessonsModalOpen] = useState(false)
  const [selectedLessonsTab, setSelectedLessonsTab] = useState<LessonsTabKey>('case-discussion')
  const [isGeneratingOutput, setIsGeneratingOutput] = useState(false)
  const [outputGenerationError, setOutputGenerationError] = useState<string | null>(null)
  const [regenerateUndoFeedback, setRegenerateUndoFeedback] = useState<string | null>(null)
  const [regenerateMenuOpen, setRegenerateMenuOpen] = useState(false)
  const [isGeneratingLessons, setIsGeneratingLessons] = useState(false)
  const [lessonsGenerationError, setLessonsGenerationError] = useState<string | null>(null)
  const [caseQuestionInput, setCaseQuestionInput] = useState('')
  const [isAnsweringCaseQuestion, setIsAnsweringCaseQuestion] = useState(false)
  const [caseQuestionError, setCaseQuestionError] = useState<string | null>(null)
  const [caseQaShouldAutoScroll, setCaseQaShouldAutoScroll] = useState(true)
  const [reportRefinementModalOpen, setReportRefinementModalOpen] = useState(false)
  const [reportRefinementSelection, setReportRefinementSelection] = useState<ReportSelectionDraft | null>(null)
  const [reportRefinementConversation, setReportRefinementConversation] = useState<ReportRefinementConversationTurn[]>([])
  const [reportRefinementInput, setReportRefinementInput] = useState('')
  const [isRefiningReportSelection, setIsRefiningReportSelection] = useState(false)
  const [reportRefinementError, setReportRefinementError] = useState<string | null>(null)
  const [reportRefinementFeedback, setReportRefinementFeedback] = useState<string | null>(null)
  const [reportRefinementShouldAutoScroll, setReportRefinementShouldAutoScroll] = useState(true)
  const [reportTitle, setReportTitle] = useState(activeCase?.title ?? '')
  const [reportSaveFeedback, setReportSaveFeedback] = useState<'saved' | null>(null)
  const caseQaScrollRef = useRef<HTMLDivElement | null>(null)
  const reportRefinementScrollRef = useRef<HTMLDivElement | null>(null)
  const reportTextareaRef = useRef<HTMLTextAreaElement | null>(null)
  const regenerateMenuRef = useRef<HTMLDivElement | null>(null)

  const extraction = activeCase?.payload.extractionResult
  const demographics = extraction?.demographics
  const reportInput = activeCase?.payload.reportInput
  const output = activeCase?.payload.output
  const regenerateUndoSnapshot = output?.undoRegenerateSnapshot ?? null
  const selectedValveKeys = useMemo(
    () => normalizeSelectedValveKeys(output?.selectedValveKeys),
    [output?.selectedValveKeys],
  )
  const isStressStudy = reportInput?.reportType === 'stress'
  const lgeSegStates = ((activeCase?.payload.lge.segStates ?? {}) as Record<number, LgeCode>)
  const lgePatternStates = ((activeCase?.payload.lge.patternStates ?? {}) as Record<number, PatternCode>)

  const sex = demographics?.sex === 'Female' ? 'Female' : 'Male'
  const age = demographics?.age ?? undefined
  const bsa = demographics?.bsa ?? null
  const heartRate = demographics?.heart_rate ?? null

  useEffect(() => {
    let cancelled = false
    void Promise.all([
      fetchConfig().catch(() => ({ papillary_mode: 'blood_pool' as const, reference_preset: 'standard' as const })),
      fetchReferenceParameters(sex, age),
    ]).then(([config, result]) => {
      if (!cancelled) {
        setReferenceParams(applyCmrReferencePreset(
          result.parameters,
          sex,
          normalizeCmrReferencePreset(config.reference_preset),
        ))
      }
    }).catch(() => {
      if (!cancelled) {
        setReferenceParams([])
      }
    })
    return () => {
      cancelled = true
    }
  }, [age, sex])

  useEffect(() => {
    setReportTitle(activeCase?.title ?? '')
    setReportSaveFeedback(null)
  }, [activeCase?.id])

  useEffect(() => {
    if (!copied) return undefined
    const timer = window.setTimeout(() => setCopied(false), 1400)
    return () => window.clearTimeout(timer)
  }, [copied])

  useEffect(() => {
    setIsGeneratingOutput(false)
    setOutputGenerationError(null)
    setRegenerateUndoFeedback(null)
    setRegenerateMenuOpen(false)
    setIsGeneratingLessons(false)
    setLessonsGenerationError(null)
    setSelectedLessonsTab('case-discussion')
    setCaseQuestionInput('')
    setIsAnsweringCaseQuestion(false)
    setCaseQuestionError(null)
    setCaseQaShouldAutoScroll(true)
    setReportRefinementModalOpen(false)
    setReportRefinementSelection(null)
    setReportRefinementConversation([])
    setReportRefinementInput('')
    setIsRefiningReportSelection(false)
    setReportRefinementError(null)
    setReportRefinementFeedback(null)
    setReportRefinementShouldAutoScroll(true)
  }, [activeCase?.id])

  useEffect(() => {
    if (!regenerateMenuOpen) return undefined

    const handlePointerDown = (event: PointerEvent) => {
      const menuNode = regenerateMenuRef.current
      if (!menuNode || !(event.target instanceof Node) || menuNode.contains(event.target)) {
        return
      }
      setRegenerateMenuOpen(false)
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setRegenerateMenuOpen(false)
      }
    }

    window.addEventListener('pointerdown', handlePointerDown)
    window.addEventListener('keydown', handleKeyDown)
    return () => {
      window.removeEventListener('pointerdown', handlePointerDown)
      window.removeEventListener('keydown', handleKeyDown)
    }
  }, [regenerateMenuOpen])

  const measurementMap = useMemo(() => {
    const next = new Map<string, number>()
    for (const measurement of extraction?.measurements ?? []) {
      next.set(measurement.parameter, measurement.value)
    }
    return next
  }, [extraction?.measurements])

  const quantitativeMeasurementMap = useMemo(() => {
    const next = new Map(measurementMap)

    setCanonicalMeasurementAlias(next, 'PCWP', ['Estimated PCWP'])
    setCanonicalMeasurementAlias(next, 'mRAP', ['Estimated RAP', 'RAP'])
    setCanonicalMeasurementAlias(next, 'LV mass', ['LV EDESM'])
    setCanonicalMeasurementAlias(next, 'LV mass (i)', ['LV EDESM (i)'])
    setCanonicalMeasurementAlias(next, 'LV SV', ['LV stroke volume', 'LV stroke volume (per beat)'])
    setCanonicalMeasurementAlias(next, 'RV SV', ['RV stroke volume', 'RV stroke volume (per beat)'])
    setCanonicalMeasurementAlias(next, 'AV forward flow (per heartbeat)', ['AV forward flow', 'Estimated AV forward flow', 'Aortic forward flow', 'Estimated Aortic forward flow', 'AV forward flow/beat'])
    setCanonicalMeasurementAlias(next, 'AV forward flow (per minute)', ['Aortic forward flow (per minute)', 'Estimated Aortic forward flow (per minute)', 'AV forward flow/min', 'Estimated AV forward flow/min', 'Aortic forward flow/min'])
    setCanonicalMeasurementAlias(next, 'AV effective forward flow (per heartbeat)', ['AV effective forward flow', 'Estimated AV effective forward flow', 'Aortic effective forward flow', 'Estimated Aortic effective forward flow', 'AV effective forward flow/beat'])
    setCanonicalMeasurementAlias(next, 'AV effective forward flow (per minute)', ['Aortic effective forward flow (per minute)', 'Estimated Aortic effective forward flow (per minute)', 'AV effective forward flow/min', 'Estimated AV effective forward flow/min', 'Aortic effective forward flow/min'])
    setCanonicalMeasurementAlias(next, 'AV backward flow (per heartbeat)', ['AV backward flow', 'Estimated AV backward flow', 'Aortic backward flow', 'Estimated Aortic backward flow', 'AV backward flow/beat'])
    setCanonicalMeasurementAlias(next, 'AV backward flow (per minute)', ['Aortic backward flow (per minute)', 'Estimated Aortic backward flow (per minute)', 'AV backward flow/min', 'Estimated AV backward flow/min', 'Aortic backward flow/min'])
    setCanonicalMeasurementAlias(next, 'PV forward flow (per heartbeat)', ['PV forward flow', 'Pulmonary forward flow', 'PV forward flow/beat'])
    setCanonicalMeasurementAlias(next, 'PV forward flow (per minute)', ['Pulmonary forward flow (per minute)', 'PV forward flow/min', 'Pulmonary forward flow/min'])
    setCanonicalMeasurementAlias(next, 'PV effective forward flow (per heartbeat)', ['PV effective forward flow', 'Pulmonary effective forward flow', 'PV effective forward flow/beat'])
    setCanonicalMeasurementAlias(next, 'PV effective forward flow (per minute)', ['Pulmonary effective forward flow (per minute)', 'PV effective forward flow/min', 'Pulmonary effective forward flow/min'])
    setCanonicalMeasurementAlias(next, 'PV backward flow (per heartbeat)', ['PV backward flow', 'Pulmonary backward flow', 'PV backward flow/beat'])
    setCanonicalMeasurementAlias(next, 'PV backward flow (per minute)', ['Pulmonary backward flow (per minute)', 'PV backward flow/min', 'Pulmonary backward flow/min'])

    const laMaxVolume = getMeasurementWithIndexedFallback({
      measurements: next,
      directKeys: ['LA max volume'],
      indexedKeys: ['LA max volume (i)'],
      bsa,
    })
    if (!next.has('LA max volume') && laMaxVolume !== undefined) {
      next.set('LA max volume', laMaxVolume)
    }

    const lvMass = getMeasurementWithIndexedFallback({
      measurements: next,
      directKeys: ['LV mass'],
      indexedKeys: ['LV mass (i)'],
      bsa,
    })
    if (!next.has('LV mass') && lvMass !== undefined) {
      next.set('LV mass', lvMass)
    }

    if (!next.has('PCWP') && laMaxVolume !== undefined && lvMass !== undefined) {
      const sexValue = sex === 'Male' ? 1 : 0
      next.set('PCWP', round(5.7591 + (0.07505 * laMaxVolume) + (0.05289 * lvMass) - (1.9927 * sexValue), 1))
    }

    const raMinVolume = getMeasurementWithIndexedFallback({
      measurements: next,
      directKeys: ['RA min volume', 'RA end-systolic volume', 'RA ESV'],
      indexedKeys: ['RA min volume (i)', 'RA end-systolic volume (i)', 'RA ESVi'],
      bsa,
    })
    if (!next.has('RA min volume') && raMinVolume !== undefined) {
      next.set('RA min volume', raMinVolume)
    }

    if (!next.has('mRAP') && raMinVolume !== undefined) {
      next.set('mRAP', round(6.4547 + (0.05828 * raMinVolume), 1))
    }

    populateIndexedMeasurements(next, referenceParams, bsa)

    const lvEf = next.get('LV EF')
    if (!next.has('CMR SBP') && age !== undefined && lvEf !== undefined) {
      next.set('CMR SBP', round(83.845 + (0.4225 * age) + (0.4187 * lvEf), 1))
    }

    const aoForwardFlow = getMeasurementWithRateFallback({
      measurements: next,
      perBeatKeys: ['AV forward flow (per heartbeat)'],
      perMinuteKeys: ['AV forward flow (per minute)'],
      heartRate,
    })
    const lvMassIndex = next.get('LV mass (i)')
    if (!next.has('CMR DBP') && aoForwardFlow !== undefined && bsa !== null && lvMassIndex !== undefined) {
      next.set('CMR DBP', round(58.8591 + (-0.1229 * aoForwardFlow) + (8.2279 * bsa) + (0.1738 * lvMassIndex), 1))
    }

    const lvMassToEdvRatio = getMeasurementRatio({
      measurements: next,
      numeratorDirectKeys: ['LV mass'],
      denominatorDirectKeys: ['LV EDV'],
      numeratorIndexedKeys: ['LV mass (i)'],
      denominatorIndexedKeys: ['LV EDV (i)'],
      bsa,
    })
    if (!next.has('LV mass / LV EDV') && lvMassToEdvRatio !== undefined) {
      next.set('LV mass / LV EDV', round(lvMassToEdvRatio, 1))
    }

    const lvsv = getStrokeVolume({
      measurements: next,
      directKeys: ['LV SV'],
      indexedKeys: ['LV SV (i)'],
      edvKeys: ['LV EDV'],
      esvKeys: ['LV ESV'],
      indexedEdvKeys: ['LV EDV (i)'],
      indexedEsvKeys: ['LV ESV (i)'],
      coKeys: ['LV CO'],
      bsa,
      heartRate,
    })
    const rvsv = getStrokeVolume({
      measurements: next,
      directKeys: ['RV SV'],
      indexedKeys: ['RV SV (i)'],
      edvKeys: ['RV EDV'],
      esvKeys: ['RV ESV'],
      indexedEdvKeys: ['RV EDV (i)'],
      indexedEsvKeys: ['RV ESV (i)'],
      coKeys: ['RV CO'],
      bsa,
      heartRate,
    })
    const avEffectiveForwardFlow = getEffectiveForwardFlow({
      measurements: next,
      effectiveBeatKeys: ['AV effective forward flow (per heartbeat)'],
      effectiveMinuteKeys: ['AV effective forward flow (per minute)'],
      forwardBeatKeys: ['AV forward flow (per heartbeat)'],
      forwardMinuteKeys: ['AV forward flow (per minute)'],
      backwardBeatKeys: ['AV backward flow (per heartbeat)'],
      backwardMinuteKeys: ['AV backward flow (per minute)'],
      heartRate,
    })
    const pvEffectiveForwardFlow = getEffectiveForwardFlow({
      measurements: next,
      effectiveBeatKeys: ['PV effective forward flow (per heartbeat)'],
      effectiveMinuteKeys: ['PV effective forward flow (per minute)'],
      forwardBeatKeys: ['PV forward flow (per heartbeat)'],
      forwardMinuteKeys: ['PV forward flow (per minute)'],
      backwardBeatKeys: ['PV backward flow (per heartbeat)'],
      backwardMinuteKeys: ['PV backward flow (per minute)'],
      heartRate,
    })

    const mrVolume = next.get('MR volume (per heartbeat)')
    const derivedMrVolume = lvsv !== undefined && avEffectiveForwardFlow !== undefined
      ? lvsv - avEffectiveForwardFlow
      : undefined
    const resolvedMrVolume = mrVolume ?? (
      derivedMrVolume !== undefined && derivedMrVolume >= 0 ? round(derivedMrVolume, 1) : undefined
    )
    if (!next.has('MR volume (per heartbeat)') && resolvedMrVolume !== undefined) {
      next.set('MR volume (per heartbeat)', resolvedMrVolume)
    }
    if (
      !next.has('MR regurgitant fraction')
      && lvsv !== undefined
      && lvsv > 0
      && resolvedMrVolume !== undefined
      && resolvedMrVolume >= 0
    ) {
      next.set('MR regurgitant fraction', round((resolvedMrVolume / lvsv) * 100, 1))
    }

    const trVolume = next.get('TR volume (per heartbeat)')
    const derivedTrVolume = rvsv !== undefined && pvEffectiveForwardFlow !== undefined
      ? rvsv - pvEffectiveForwardFlow
      : undefined
    const resolvedTrVolume = trVolume ?? (
      derivedTrVolume !== undefined && derivedTrVolume >= 0 ? round(derivedTrVolume, 1) : undefined
    )
    if (!next.has('TR volume (per heartbeat)') && resolvedTrVolume !== undefined) {
      next.set('TR volume (per heartbeat)', resolvedTrVolume)
    }
    if (
      !next.has('TR regurgitant fraction')
      && rvsv !== undefined
      && rvsv > 0
      && resolvedTrVolume !== undefined
      && resolvedTrVolume >= 0
    ) {
      next.set('TR regurgitant fraction', round((resolvedTrVolume / rvsv) * 100, 1))
    }

    populateIndexedMeasurements(next, referenceParams, bsa)

    return next
  }, [age, bsa, heartRate, measurementMap, referenceParams, sex])

  const valveMeasurementMap = useMemo(() => {
    const next = new Map(quantitativeMeasurementMap)

    const lvsv = getStrokeVolume({
      measurements: next,
      directKeys: ['LV SV'],
      indexedKeys: ['LV SV (i)'],
      edvKeys: ['LV EDV'],
      esvKeys: ['LV ESV'],
      indexedEdvKeys: ['LV EDV (i)'],
      indexedEsvKeys: ['LV ESV (i)'],
      coKeys: ['LV CO'],
      bsa,
      heartRate,
    })
    const rvsv = getStrokeVolume({
      measurements: next,
      directKeys: ['RV SV'],
      indexedKeys: ['RV SV (i)'],
      edvKeys: ['RV EDV'],
      esvKeys: ['RV ESV'],
      indexedEdvKeys: ['RV EDV (i)'],
      indexedEsvKeys: ['RV ESV (i)'],
      coKeys: ['RV CO'],
      bsa,
      heartRate,
    })
    const avEffectiveForwardFlow = getEffectiveForwardFlow({
      measurements: next,
      effectiveBeatKeys: ['AV effective forward flow (per heartbeat)'],
      effectiveMinuteKeys: ['AV effective forward flow (per minute)'],
      forwardBeatKeys: ['AV forward flow (per heartbeat)'],
      forwardMinuteKeys: ['AV forward flow (per minute)'],
      backwardBeatKeys: ['AV backward flow (per heartbeat)'],
      backwardMinuteKeys: ['AV backward flow (per minute)'],
      heartRate,
    })
    const pvEffectiveForwardFlow = getEffectiveForwardFlow({
      measurements: next,
      effectiveBeatKeys: ['PV effective forward flow (per heartbeat)'],
      effectiveMinuteKeys: ['PV effective forward flow (per minute)'],
      forwardBeatKeys: ['PV forward flow (per heartbeat)'],
      forwardMinuteKeys: ['PV forward flow (per minute)'],
      backwardBeatKeys: ['PV backward flow (per heartbeat)'],
      backwardMinuteKeys: ['PV backward flow (per minute)'],
      heartRate,
    })

    const mrVolume = next.get('MR volume (per heartbeat)')
    const derivedMrVolume = lvsv !== undefined && avEffectiveForwardFlow !== undefined
      ? lvsv - avEffectiveForwardFlow
      : undefined
    const resolvedMrVolume = mrVolume ?? (
      derivedMrVolume !== undefined && derivedMrVolume >= 0 ? round(derivedMrVolume, 1) : undefined
    )
    if (!next.has('MR volume (per heartbeat)') && resolvedMrVolume !== undefined) {
      next.set('MR volume (per heartbeat)', resolvedMrVolume)
    }
    if (
      !next.has('MR regurgitant fraction')
      && lvsv !== undefined
      && lvsv > 0
      && resolvedMrVolume !== undefined
      && resolvedMrVolume >= 0
    ) {
      next.set('MR regurgitant fraction', round((resolvedMrVolume / lvsv) * 100, 1))
    }

    const trVolume = next.get('TR volume (per heartbeat)')
    const derivedTrVolume = rvsv !== undefined && pvEffectiveForwardFlow !== undefined
      ? rvsv - pvEffectiveForwardFlow
      : undefined
    const resolvedTrVolume = trVolume ?? (
      derivedTrVolume !== undefined && derivedTrVolume >= 0 ? round(derivedTrVolume, 1) : undefined
    )
    if (!next.has('TR volume (per heartbeat)') && resolvedTrVolume !== undefined) {
      next.set('TR volume (per heartbeat)', resolvedTrVolume)
    }
    if (
      !next.has('TR regurgitant fraction')
      && rvsv !== undefined
      && rvsv > 0
      && resolvedTrVolume !== undefined
      && resolvedTrVolume >= 0
    ) {
      next.set('TR regurgitant fraction', round((resolvedTrVolume / rvsv) * 100, 1))
    }

    return next
  }, [bsa, heartRate, quantitativeMeasurementMap])

  const paramMap = useMemo(() => {
    const next = new Map<string, CmrCanonicalParam>()
    for (const param of referenceParams) {
      next.set(param.parameter_key, param)
    }
    return next
  }, [referenceParams])

  const bmi = useMemo(() => {
    const height = demographics?.height_cm
    const weight = demographics?.weight_kg
    if (!height || !weight) return null
    const heightM = height / 100
    if (!heightM) return null
    return weight / (heightM * heightM)
  }, [demographics?.height_cm, demographics?.weight_kg])

  const excludedAdditionalQuantKeys = useMemo(() => {
    const keys = new Set<string>()
    for (const row of CORE_QUANT_ROWS) {
      for (const key of resolveQuantKeys(row)) keys.add(key)
    }
    for (const row of TISSUE_QUANT_ROWS) {
      for (const key of resolveQuantKeys(row)) keys.add(key)
    }
    for (const key of FLOW_QUANT_KEYS) keys.add(key)
    return keys
  }, [])

  const availableAdditionalQuantParams = useMemo(() => {
    return referenceParams
      .filter((param) => quantitativeMeasurementMap.has(param.parameter_key) && !excludedAdditionalQuantKeys.has(param.parameter_key))
      .sort((a, b) => {
        if (a.sort_order !== b.sort_order) return a.sort_order - b.sort_order
        if (a.major_section !== b.major_section) return a.major_section.localeCompare(b.major_section)
        if (a.sub_section !== b.sub_section) return a.sub_section.localeCompare(b.sub_section)
        return a.parameter_key.localeCompare(b.parameter_key)
      })
  }, [excludedAdditionalQuantKeys, quantitativeMeasurementMap, referenceParams])

  const availableAdditionalQuantParamMap = useMemo(
    () => new Map(availableAdditionalQuantParams.map((param) => [param.parameter_key, param])),
    [availableAdditionalQuantParams],
  )

  const filteredAdditionalQuantParams = useMemo(() => {
    const query = additionalValuesSearch.trim().toLowerCase()
    if (!query) return availableAdditionalQuantParams
    return availableAdditionalQuantParams.filter((param) => {
      const haystack = [
        param.parameter_key,
        param.major_section,
        param.sub_section,
        param.unit,
      ].join(' ').toLowerCase()
      return haystack.includes(query)
    })
  }, [additionalValuesSearch, availableAdditionalQuantParams])

  const tissueQuantLines = useMemo(() => {
    return TISSUE_QUANT_ROWS.map((row) => {
      const { key, label: displayLabel } = row
      const candidates = resolveQuantKeys(row)
      const paramKey = candidates.find((candidate) => paramMap.has(candidate)) ?? key
      const valueKey = candidates.find((candidate) => quantitativeMeasurementMap.has(candidate))
      if (!valueKey) {
        return null
      }
      const param = paramMap.get(paramKey)
      const unit = param ? asciiUnit(param.unit) : ''
      const rowLabel = displayLabel ?? key
      const label = unit ? `${rowLabel} (${unit})` : rowLabel
      const dp = param?.decimal_places ?? (param?.unit === 'm/s' ? 1 : 0)
      const value = formatNumeric(quantitativeMeasurementMap.get(valueKey), dp)
      const normalRange = formatNormalRange(param)
      return buildQuantLine(label, value, normalRange)
    }).filter((line): line is string => Boolean(line))
  }, [paramMap, quantitativeMeasurementMap])

  const flowLines = useMemo(() => {
    return buildReportFlowLines({
      fourDFlow: reportInput?.fourDFlow,
      aorticForward: measurementMap.get('AV forward flow (per heartbeat)'),
      aorticBackward: measurementMap.get('AV backward flow (per heartbeat)'),
      aorticRegurgitantFraction: measurementMap.get('AV regurgitant fraction'),
      pulmonaryForward: measurementMap.get('PV forward flow (per heartbeat)'),
      pulmonaryBackward: measurementMap.get('PV backward flow (per heartbeat)'),
      pulmonaryRegurgitantFraction: measurementMap.get('PV regurgitant fraction'),
    })
  }, [measurementMap, reportInput?.fourDFlow])

  const lvText = useMemo(() => {
    if (!output?.reportGenerated) return null
    return buildLvSentence(measurementMap, paramMap)
  }, [measurementMap, output?.reportGenerated, paramMap])

  const rvText = useMemo(() => {
    if (!output?.reportGenerated) return null
    return buildRvSentence(measurementMap, paramMap)
  }, [measurementMap, output?.reportGenerated, paramMap])

  const quantitativeLines = useMemo(() => {
    const selectedAdditionalKeys = (output?.additionalQuantKeys ?? [])
      .filter((key, index, source) => source.indexOf(key) === index)
      .filter((key) => availableAdditionalQuantParamMap.has(key))

    const mapseMentionedAbove = Boolean(output?.reportGenerated && /\bMAPSE\b/i.test(lvText ?? ''))
    const tapseMentionedAbove = Boolean(output?.reportGenerated && /\bTAPSE\b/i.test(rvText ?? ''))

    const rows = CORE_QUANT_ROWS
      .filter((row) => {
        if (row.key === 'MAPSE') return !mapseMentionedAbove
        if (row.key === 'TAPSE') return !tapseMentionedAbove
        return true
      })
      .map((row, index) => {
        const { key, label: displayLabel } = row
        const candidates = resolveQuantKeys(row)
        const paramKey = candidates.find((candidate) => paramMap.has(candidate)) ?? key
        const valueKey = candidates.find((candidate) => quantitativeMeasurementMap.has(candidate)) ?? key
        const param = paramMap.get(paramKey)
        const unit = param ? asciiUnit(param.unit) : ''
        const rowLabel = displayLabel ?? key
        const label = unit ? `${rowLabel} (${unit})` : rowLabel
        const dp = param?.decimal_places ?? (param?.unit === 'm/s' ? 1 : 0)
        const value = quantitativeMeasurementMap.has(valueKey) ? formatNumeric(quantitativeMeasurementMap.get(valueKey), dp) : '--'
        const normalRange = formatNormalRange(param)
        return {
          id: `core-${key}`,
          line: buildQuantLine(label, value, normalRange),
          sortOrder: param?.sort_order ?? (10000 + index),
          sourceIndex: index,
        }
      })

    const additionalRows = selectedAdditionalKeys.map((key, index) => {
      const param = availableAdditionalQuantParamMap.get(key)
      const unit = param ? asciiUnit(param.unit) : ''
      const label = unit ? `${key} (${unit})` : key
      const dp = param?.decimal_places ?? (param?.unit === 'm/s' ? 1 : 0)
      const value = formatNumeric(quantitativeMeasurementMap.get(key), dp)
      const normalRange = formatNormalRange(param)
      return {
        id: `additional-${key}`,
        line: buildQuantLine(label, value, normalRange),
        sortOrder: param?.sort_order ?? (20000 + index),
        sourceIndex: CORE_QUANT_ROWS.length + index,
      }
    })

    return [...rows, ...additionalRows]
      .sort((a, b) => {
        if (a.sortOrder !== b.sortOrder) return a.sortOrder - b.sortOrder
        return a.sourceIndex - b.sourceIndex
      })
      .map((row) => row.line)
  }, [
    availableAdditionalQuantParamMap,
    lvText,
    output?.additionalQuantKeys,
    output?.reportGenerated,
    paramMap,
    quantitativeMeasurementMap,
    rvText,
  ])

  const atriaText = useMemo(() => {
    if (!output?.reportGenerated) return null
    return buildAtriaSentence(measurementMap, paramMap)
  }, [measurementMap, output?.reportGenerated, paramMap])

  const valveSummaryState = useMemo(() => {
    const mitralMorphology = activeCase?.payload.valves.morphologies.mitral ?? { findings: {} }
    const mitralSummaryDraft = activeCase?.payload.valves.summaries.mitral ?? null
    const mitralSummaryData = buildMitralValveSummaryData(valveMeasurementMap, mitralMorphology)
    const mitralSummarySignature = buildMitralValveSummarySignature(mitralSummaryData)
    const mitralIsCurrent = Boolean(mitralSummaryDraft?.llmProse && mitralSummaryDraft.llmProseSourceSignature === mitralSummarySignature)
    const mitralSummaryText = mitralIsCurrent
      ? mitralSummaryDraft?.llmProse ?? null
      : buildMitralValveReportText(valveMeasurementMap, mitralMorphology, mitralSummaryDraft)

    const aorticMorphology = activeCase?.payload.valves.morphologies.aortic ?? { findings: {} }
    const aorticSummaryDraft = activeCase?.payload.valves.summaries.aortic ?? null
    const aorticSummaryData = buildAorticValveSummaryData(valveMeasurementMap, aorticMorphology)
    const aorticSummarySignature = buildAorticValveSummarySignature(aorticSummaryData)
    const aorticIsCurrent = Boolean(aorticSummaryDraft?.llmProse && aorticSummaryDraft.llmProseSourceSignature === aorticSummarySignature)
    const aorticSummaryText = aorticIsCurrent
      ? aorticSummaryDraft?.llmProse ?? null
      : buildAorticValveReportText(valveMeasurementMap, aorticMorphology, aorticSummaryDraft)

    const tricuspidMorphology = activeCase?.payload.valves.morphologies.tricuspid ?? { findings: {} }
    const tricuspidSummaryDraft = activeCase?.payload.valves.summaries.tricuspid ?? null
    const tricuspidSummaryData = buildTricuspidValveSummaryData(valveMeasurementMap, tricuspidMorphology)
    const tricuspidSummarySignature = buildTricuspidValveSummarySignature(tricuspidSummaryData)
    const tricuspidIsCurrent = Boolean(tricuspidSummaryDraft?.llmProse && tricuspidSummaryDraft.llmProseSourceSignature === tricuspidSummarySignature)
    const tricuspidSummaryText = tricuspidIsCurrent
      ? tricuspidSummaryDraft?.llmProse ?? null
      : buildTricuspidValveReportText(valveMeasurementMap, tricuspidMorphology, tricuspidSummaryDraft)

    const pulmonarySummaryText = buildPulmonaryValveReportText(valveMeasurementMap)
    const selectedValveKeySet = new Set<CmrOutputValveKey>(selectedValveKeys)
    const items: ValveSummaryItem[] = [
      {
        key: 'mitral',
        label: 'Mitral valve',
        text: mitralSummaryText,
        displayText: mitralSummaryText ?? 'No significant mitral valve abnormality.',
        isStale: Boolean(mitralSummaryDraft?.llmProse) && !mitralIsCurrent,
      },
      {
        key: 'aortic',
        label: 'Aortic valve',
        text: aorticSummaryText,
        displayText: aorticSummaryText ?? 'No significant aortic valve abnormality.',
        isStale: Boolean(aorticSummaryDraft?.llmProse) && !aorticIsCurrent,
      },
      {
        key: 'tricuspid',
        label: 'Tricuspid valve',
        text: tricuspidSummaryText,
        displayText: tricuspidSummaryText ?? 'No significant tricuspid valve abnormality.',
        isStale: Boolean(tricuspidSummaryDraft?.llmProse) && !tricuspidIsCurrent,
      },
      {
        key: 'pulmonary',
        label: 'Pulmonary valve',
        text: pulmonarySummaryText,
        displayText: pulmonarySummaryText ?? 'No significant pulmonary valve abnormality.',
        isStale: false,
      },
    ]

    return {
      items,
      previewText: buildValveSummarySentence(valveMeasurementMap, {
        mitralSummaryText,
        aorticSummaryText,
        tricuspidSummaryText,
        pulmonarySummaryText,
        includeMitral: selectedValveKeySet.has('mitral'),
        includeAortic: selectedValveKeySet.has('aortic'),
        includeTricuspid: selectedValveKeySet.has('tricuspid'),
        includePulmonary: selectedValveKeySet.has('pulmonary'),
      }),
      isStale: items.some((item) => selectedValveKeySet.has(item.key) && item.isStale),
    }
  }, [
    activeCase?.payload.valves.morphologies.aortic,
    activeCase?.payload.valves.morphologies.mitral,
    activeCase?.payload.valves.morphologies.tricuspid,
    activeCase?.payload.valves.summaries.aortic,
    activeCase?.payload.valves.summaries.mitral,
    activeCase?.payload.valves.summaries.tricuspid,
    selectedValveKeys,
    valveMeasurementMap,
  ])

  const valveText = useMemo(() => {
    return valveSummaryState.previewText
  }, [valveSummaryState.previewText])

  const rwmaReportText = useMemo(() => {
    if (!output?.reportGenerated) return null

    const rwma = activeCase?.payload.rwma
    const segStates = (rwma?.segStates as Record<number, RwmaCode> | undefined) ?? {}
    const currentSignature = buildRwmaSummarySignature(segStates)

    if (rwma?.llmProse && rwma.llmProseSourceSignature === currentSignature) {
      return normalizeRwmaReportText(rwma.llmProse)
    }

    return normalizeRwmaReportText(generateRwmaSummary(segStates).text)
  }, [activeCase?.payload.rwma, output?.reportGenerated])

  const rwmaSummaryData = useMemo(() => {
    const rwma = activeCase?.payload.rwma
    const segStates = (rwma?.segStates as Record<number, RwmaCode> | undefined) ?? {}
    return buildRwmaSummaryData(segStates)
  }, [activeCase?.payload.rwma])

  const tissueStatement = useMemo(() => {
    const lge = activeCase?.payload.lge
    const segStates = (lge?.segStates as Record<number, LgeCode> | undefined) ?? {}
    const patternStates = (lge?.patternStates as Record<number, PatternCode> | undefined) ?? {}
    const rvInsertionPointFibrosis = Boolean(lge?.rvInsertionPointFibrosis)
    const currentSignature = buildLgeSummarySignature(segStates, patternStates, rvInsertionPointFibrosis)

    if (lge?.llmProse && lge.llmProseSourceSignature === currentSignature) {
      return normalizeLgeReportText(lge.llmProse)
    }

    return normalizeLgeReportText(generateLgeSummary(segStates, patternStates, rvInsertionPointFibrosis).text)
  }, [activeCase?.payload.lge])

  const lgeSummaryData = useMemo(() => {
    const lge = activeCase?.payload.lge
    const segStates = (lge?.segStates as Record<number, LgeCode> | undefined) ?? {}
    const patternStates = (lge?.patternStates as Record<number, PatternCode> | undefined) ?? {}
    return buildLgeSummaryData(segStates, patternStates, Boolean(lge?.rvInsertionPointFibrosis))
  }, [activeCase?.payload.lge])

  const perfusionStatement = useMemo(() => {
    if (!isStressStudy) return null
    const perfusion = activeCase?.payload.perfusion
    const restSegStates = (perfusion?.restSegStates as Record<number, PerfusionCode> | undefined) ?? {}
    const stressSegStates = (perfusion?.stressSegStates as Record<number, PerfusionCode> | undefined) ?? {}
    const restPersistenceBeats = perfusion?.restPersistenceBeats ?? 0
    const stressPersistenceBeats = perfusion?.stressPersistenceBeats ?? 0
    const adequateStress = perfusion?.adequateStress ?? true
    const currentSignature = buildPerfusionSummarySignature(
      restSegStates,
      stressSegStates,
      restPersistenceBeats,
      stressPersistenceBeats,
      adequateStress,
      lgeSegStates,
      lgePatternStates,
    )

    if (perfusion?.llmProse && perfusion.llmProseSourceSignature === currentSignature) {
      return normalizePerfusionReportText(perfusion.llmProse)
    }

    return normalizePerfusionReportText(generatePerfusionSummary({
      restSegStates,
      stressSegStates,
      restPersistenceBeats,
      stressPersistenceBeats,
      adequateStress,
      lgeSegStates,
      lgePatternStates,
    }).text)
  }, [activeCase?.payload.perfusion, isStressStudy, lgePatternStates, lgeSegStates])

  const perfusionSummaryData = useMemo(() => {
    if (!isStressStudy) return null
    const perfusion = activeCase?.payload.perfusion
    return buildPerfusionSummaryData({
      restSegStates: (perfusion?.restSegStates as Record<number, PerfusionCode> | undefined) ?? {},
      stressSegStates: (perfusion?.stressSegStates as Record<number, PerfusionCode> | undefined) ?? {},
      restPersistenceBeats: perfusion?.restPersistenceBeats ?? 0,
      stressPersistenceBeats: perfusion?.stressPersistenceBeats ?? 0,
      adequateStress: perfusion?.adequateStress ?? true,
      lgeSegStates,
      lgePatternStates,
    })
  }, [activeCase?.payload.perfusion, isStressStudy, lgePatternStates, lgeSegStates])

  const thrombusSummaryData = useMemo(() => {
    const entries: ThrombusSummaryEntryInput[] = (activeCase?.payload.thrombus.entries ?? []).map((entry) => ({
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
    return buildThrombusSummaryData(entries)
  }, [activeCase?.payload.thrombus.entries])

  const thrombusConclusionText = useMemo(() => {
    return activeCase?.payload.thrombus.llmProse ?? thrombusSummaryData?.deterministicText ?? null
  }, [activeCase?.payload.thrombus.llmProse, thrombusSummaryData?.deterministicText])

  const selectedVascularArrangement = useMemo(
    () => getCmrVascularArrangementOption(output?.vascularArrangementKey),
    [output?.vascularArrangementKey],
  )
  const hasCustomVascularArrangement = (output?.vascularArrangementKey ?? 'normal') !== 'normal'
  const hasAdditionalQuantRows = (output?.additionalQuantKeys?.length ?? 0) > 0
  const hasValveAssessmentIncluded = Boolean(output?.includeValveAssessment)
  const hasPhAssessmentIncluded = Boolean(output?.includePhAssessment)
  const hasCaseLessonsGenerated = Boolean(
    output?.caseDiscussionProse
    || (output?.caseQaConversation?.length ?? 0) > 0,
  )
  const selectedValveCount = selectedValveKeys.length
  const selectedValveLabel = selectedValveCount === 1 ? '1 valve selected' : `${selectedValveCount} valves selected`
  const getReportControlButtonClass = (active: boolean) =>
    active
      ? 'w-full justify-center rounded-full border-[hsl(var(--section-style-report-accent))] bg-[hsl(var(--section-style-report-accent)/0.06)] px-4 text-[hsl(var(--section-style-report-accent))] shadow-[0_0_0_1px_hsl(var(--section-style-report-accent)/0.12)] hover:bg-[hsl(var(--section-style-report-accent)/0.1)]'
      : 'w-full justify-center rounded-full px-4'

  const phSummaryState = useMemo(() => {
    const phPayload = activeCase?.payload.ph
    if (!phPayload) {
      return { previewText: null, isStale: false, hasGeneratedText: false }
    }

    const manualNumeric = phPayload.manualNumeric ?? {}
    const readExtractionMeasurement = (...parameterKeys: string[]): number | null => {
      for (const parameterKey of parameterKeys) {
        const value = measurementMap.get(parameterKey)
        if (value !== undefined) return value
      }
      return null
    }

    const getBasePhNumeric = (key: string, extractedParam?: string): number | null => {
      const manual = manualNumeric[key]
      if (manual !== undefined) return parseNumber(manual)
      return extractedParam ? readExtractionMeasurement(extractedParam) : null
    }

    const rvEdv = getBasePhNumeric('rvEdv', 'RV EDV')
    const rvEsv = getBasePhNumeric('rvEsv', 'RV ESV')
    const rvSv = getBasePhNumeric('rvSv', 'RV SV') ?? (rvEdv !== null && rvEsv !== null ? rvEdv - rvEsv : null)
    const rvCo = getBasePhNumeric('rvCo', 'RV CO') ?? (rvSv !== null && heartRate !== null ? (rvSv * heartRate) / 1000 : null)
    const rvEdvi = getBasePhNumeric('rvEdvi', 'RV EDV (i)') ?? (rvEdv !== null && bsa ? round(rvEdv / bsa, 1) : null)
    const rvSvi = getBasePhNumeric('rvSvi', 'RV SV (i)') ?? (rvSv !== null && bsa ? round(rvSv / bsa, 1) : null)
    const rvMass = getBasePhNumeric('rvMass', 'RV mass')
    const rvMassIndex = getBasePhNumeric('rvMassIndex', 'RV mass (i)') ?? (rvMass !== null && bsa ? round(rvMass / bsa, 1) : null)
    const rvCi = getBasePhNumeric('rvCi', 'RV CI') ?? (rvCo !== null && bsa ? round(rvCo / bsa, 1) : null)
    const raMaxVolume = getBasePhNumeric('raMaxVolume', 'RA max volume')
    const raMaxVolumeIndex = getBasePhNumeric('raMaxVolumeIndex', 'RA max volume (i)') ?? (raMaxVolume !== null && bsa ? round(raMaxVolume / bsa, 1) : null)
    const lvEdvi = getBasePhNumeric('lvEdvi', 'LV EDV (i)')
    const rvLvVolumeRatio = getBasePhNumeric('rvLvVolumeRatio') ?? (rvEdvi !== null && lvEdvi ? round(rvEdvi / lvEdvi, 2) : null)

    const mainPaSystolicArea = getBasePhNumeric('mainPaSystolicArea', 'MPA systolic area')
    const mainPaDiastolicArea = getBasePhNumeric('mainPaDiastolicArea', 'MPA diastolic area')
    const derivedPaRelativeAreaChange = mainPaSystolicArea !== null && mainPaDiastolicArea
      ? round(((mainPaSystolicArea - mainPaDiastolicArea) / mainPaDiastolicArea) * 100, 1)
      : null

    const laMaxVolume = readExtractionMeasurement('LA max volume')
    const laMaxVolumeIndex = readExtractionMeasurement('LA max volume (i)')
      ?? (laMaxVolume !== null && bsa ? round(laMaxVolume / bsa, 1) : null)
    const lvMass = readExtractionMeasurement('LV mass')
    const pcwp = readExtractionMeasurement('PCWP')
      ?? (laMaxVolume !== null && lvMass !== null
        ? round(5.7591 + (0.07505 * laMaxVolume) + (0.05289 * lvMass) - (1.9927 * (sex === 'Male' ? 1 : 0)), 1)
        : null)
    const raMinVolume = readExtractionMeasurement('RA min volume')
    const mrap = readExtractionMeasurement('mRAP')
      ?? (raMinVolume !== null ? round(6.4547 + (0.05828 * raMinVolume), 1) : null)

    const branchFlowPercentages = computeBranchFlowPercentages({
      mainPaNetFlow: getBasePhNumeric('mainPaNetFlow'),
      rpaNetFlow: getBasePhNumeric('rpaNetFlow'),
      lpaNetFlow: getBasePhNumeric('lpaNetFlow'),
    })

    const choices = phPayload.choices ?? {}
    const phSummaryData = buildPhSummaryData(
      {
        rvEdvi,
        rvEf: getBasePhNumeric('rvEf', 'RV EF'),
        tapse: getBasePhNumeric('tapse', 'TAPSE'),
        rvMassIndex,
        rvSvi,
        rvCi,
        rvLvVolumeRatio,
        raMaxVolumeIndex,
        laMaxVolumeIndex,
        lvEf: readExtractionMeasurement('LV EF'),
        mainPaDiameter: getBasePhNumeric('mainPaDiameter', 'MPA systolic diameter'),
        paDistensibility: getBasePhNumeric('paDistensibility', 'MPA distension') ?? derivedPaRelativeAreaChange,
        pcwp,
        mrap,
        trRegurgitantFraction: getBasePhNumeric('trRegurgitantFraction', 'TR regurgitant fraction'),
        mrRegurgitantFraction: getBasePhNumeric('mrRegurgitantFraction', 'MR regurgitant fraction'),
        pericardialEffusionSize: getBasePhNumeric('pericardialEffusionSize'),
        vortexDurationPercent: getBasePhNumeric('vortexDurationPercent'),
        rpaPercent: branchFlowPercentages.rpaPercent,
        lpaPercent: branchFlowPercentages.lpaPercent,
      },
      paramMap,
      {
        septalFlattening: (choices.septalFlattening as PhSummaryChoices['septalFlattening'] | undefined) ?? 'none',
        septalMotion: (choices.septalMotion as PhSummaryChoices['septalMotion'] | undefined) ?? 'normal',
        interatrialSeptalBowing: (choices.interatrialSeptalBowing as PhSummaryChoices['interatrialSeptalBowing'] | undefined) ?? 'none',
        pericardialEffusion: (choices.pericardialEffusion as PhSummaryChoices['pericardialEffusion'] | undefined) ?? 'none',
        venaCava: (choices.venaCava as PhSummaryChoices['venaCava'] | undefined) ?? 'normal',
        trSeverity: normalizePhRegurgitationChoice(choices.trSeverity as PhSummaryChoices['trSeverity'] | undefined) ?? 'none',
        mrSeverity: normalizePhRegurgitationChoice(choices.mrSeverity as PhSummaryChoices['mrSeverity'] | undefined) ?? 'none',
        vortexFormation: (choices.vortexFormation as PhSummaryChoices['vortexFormation'] | undefined) ?? 'not-assessed',
        vortexSeverity: (choices.vortexSeverity as PhSummaryChoices['vortexSeverity'] | undefined) ?? null,
        vortexLocation: (choices.vortexLocation as PhSummaryChoices['vortexLocation'] | undefined) ?? 'not-specified',
        helicity: (choices.helicity as PhSummaryChoices['helicity'] | undefined) ?? 'not-assessed',
        helicitySeverity: (choices.helicitySeverity as PhSummaryChoices['helicitySeverity'] | undefined) ?? null,
        helicityLocation: (choices.helicityLocation as PhSummaryChoices['helicityLocation'] | undefined) ?? 'not-specified',
      },
    )

    const generatedText = normalizePhReportText(phPayload.llmProse)
    const previewText = generatedText ?? normalizePhReportText(phSummaryData.deterministicText)
    const currentSignature = buildPhSummarySignature(phSummaryData)
    const hasGeneratedText = generatedText !== null
    const isStale = hasGeneratedText && phPayload.llmProseSourceSignature !== currentSignature

    return { previewText, isStale, hasGeneratedText }
  }, [
    activeCase?.payload.ph,
    bsa,
    heartRate,
    measurementMap,
    paramMap,
    sex,
  ])

  const plannedConclusionLines = useMemo(() => {
    return buildReportConclusions({
      measurementMap,
      paramMap,
      reportType: isStressStudy ? 'stress' : 'standard',
      rwmaData: rwmaSummaryData,
      tissueStatement,
      perfusionData: isStressStudy ? perfusionSummaryData : null,
      lgeData: lgeSummaryData,
      valveText,
      includeValveAssessment: output?.includeValveAssessment,
      phText: phSummaryState.previewText,
      includePhAssessment: output?.includePhAssessment,
      thrombusData: thrombusSummaryData,
      thrombusText: thrombusConclusionText,
    })
  }, [
    lgeSummaryData,
    measurementMap,
    output?.includePhAssessment,
    output?.includeValveAssessment,
    paramMap,
    isStressStudy,
    perfusionSummaryData,
    phSummaryState.previewText,
    rwmaSummaryData,
    tissueStatement,
    thrombusConclusionText,
    thrombusSummaryData,
    valveText,
  ])

  const conclusionSourceSignature = useMemo(
    () => buildReportConclusionSourceSignature(plannedConclusionLines),
    [plannedConclusionLines],
  )

  const storedConclusionLines = useMemo(
    () => normalizeReportConclusionLines(output?.conclusionLines ?? []),
    [output?.conclusionLines],
  )
  const formattedStoredConclusionLines = useMemo(
    () => formatReportConclusionLines(storedConclusionLines),
    [storedConclusionLines],
  )

  const hasCurrentGeneratedConclusions = Boolean(
    storedConclusionLines.length > 0
    && output?.conclusionSourceSignature
    && output.conclusionSourceSignature === conclusionSourceSignature,
  )

  const conclusionLines = useMemo(() => {
    if (!output?.reportGenerated) return null
    return hasCurrentGeneratedConclusions ? storedConclusionLines : plannedConclusionLines
  }, [
    hasCurrentGeneratedConclusions,
    output?.reportGenerated,
    plannedConclusionLines,
    storedConclusionLines,
  ])

  const lessonsLvText = useMemo(() => {
    const parts = [
      buildLvSentence(measurementMap, paramMap),
      rwmaReportText,
    ].filter(Boolean)
    return parts.length > 0 ? parts.join(' ') : null
  }, [measurementMap, paramMap, rwmaReportText])

  const lessonsRvText = useMemo(() => {
    return buildRvSentence(measurementMap, paramMap)
  }, [measurementMap, paramMap])

  const tissueParameterLabels = useMemo(() => {
    return TISSUE_QUANT_ROWS
      .filter((row) => resolveQuantKeys(row).some((candidate) => measurementMap.has(candidate)))
      .map((row) => row.label ?? row.key)
  }, [measurementMap])

  const notableMeasurements = useMemo(() => {
    const rows: Array<{ key: string; label: string }> = [
      { key: 'LV EF', label: 'LVEF' },
      { key: 'MAPSE', label: 'MAPSE' },
      { key: 'RV EF', label: 'RVEF' },
      { key: 'TAPSE', label: 'TAPSE' },
      { key: 'PCWP', label: 'PCWP' },
      { key: 'mRAP', label: 'RAP' },
      { key: 'Native T1', label: 'Native T1' },
      { key: 'ECV', label: 'ECV' },
      { key: 'Native T2', label: 'Native T2' },
      { key: 'Myocardial T2*', label: 'Myocardial T2*' },
      { key: 'MR regurgitant fraction', label: 'MR RF' },
      { key: 'TR regurgitant fraction', label: 'TR RF' },
      { key: 'AV maximum velocity', label: 'AV peak velocity' },
      { key: 'AV mean pressure gradient', label: 'AV mean gradient' },
    ]

    return rows
      .map(({ key, label }) => {
        if (!quantitativeMeasurementMap.has(key)) return null
        const value = quantitativeMeasurementMap.get(key)
        const param = paramMap.get(key)
        const dp = param?.decimal_places ?? (param?.unit === 'm/s' ? 1 : 0)
        const unit = param ? asciiUnit(param.unit) : ''
        const formattedValue = formatNumeric(value, dp)
        return `${label} ${formattedValue}${unit ? ` ${unit}` : ''}`
      })
      .filter((item): item is string => Boolean(item))
  }, [paramMap, quantitativeMeasurementMap])

  const caseLessonsInput = useMemo<CmrCaseLessonsInput>(() => {
    return {
      reportType: reportInput?.reportType === 'stress' ? 'stress' : 'standard',
      nonContrast: Boolean(reportInput?.nonContrast),
      fourDFlow: Boolean(reportInput?.fourDFlow),
      tissueParametersPresent: tissueParameterLabels,
      adequateStress: isStressStudy ? perfusionSummaryData?.adequateStress ?? null : null,
      sectionSummaries: {
        lv: lessonsLvText,
        rv: lessonsRvText,
        tissue: tissueStatement,
        perfusion: isStressStudy ? perfusionStatement : null,
        valves: valveText,
        ph: phSummaryState.previewText,
        thrombus: thrombusConclusionText,
      },
      conclusionLines: plannedConclusionLines,
      notableMeasurements,
    }
  }, [
    lessonsLvText,
    lessonsRvText,
    notableMeasurements,
    isStressStudy,
    perfusionStatement,
    perfusionSummaryData?.adequateStress,
    phSummaryState.previewText,
    plannedConclusionLines,
    reportInput?.fourDFlow,
    reportInput?.nonContrast,
    reportInput?.reportType,
    thrombusConclusionText,
    tissueParameterLabels,
    tissueStatement,
    valveText,
  ])

  const caseDiscussionData = useMemo(
    () => buildCmrCaseLessonsData(caseLessonsInput, 'case-discussion'),
    [caseLessonsInput],
  )

  const caseDiscussionSignature = useMemo(
    () => buildCmrCaseLessonsSignature(caseDiscussionData),
    [caseDiscussionData],
  )

  const caseDiscussionState = useMemo(() => {
    const storedProse = normalizeCmrCaseLessonsProse(output?.caseDiscussionProse)
    const isCurrent = Boolean(
      storedProse
      && output?.caseDiscussionSourceSignature
      && output.caseDiscussionSourceSignature === caseDiscussionSignature,
    )

    return {
      previewText: storedProse || null,
      isCurrent,
      isStale: Boolean(storedProse) && !isCurrent,
    }
  }, [
    caseDiscussionSignature,
    output?.caseDiscussionProse,
    output?.caseDiscussionSourceSignature,
  ])

  const caseQaConversation = useMemo<CaseQaConversationTurn[]>(
    () => output?.caseQaConversation ?? [],
    [output?.caseQaConversation],
  )

  const selectedCaseLessonsState = caseDiscussionState
  const selectedCaseLessonsDisplayText = selectedCaseLessonsState.previewText ?? ''
  const selectedCaseLessonsBlocks = useMemo(
    () => buildLessonsContentBlocks(selectedCaseLessonsDisplayText),
    [selectedCaseLessonsDisplayText],
  )

  const vascularArrangementGroups = useMemo(() => {
    return [
      {
        title: 'Normal',
        options: CMR_VASCULAR_ARRANGEMENT_OPTIONS.filter((option) => option.group === 'Normal'),
      },
      {
        title: 'Aortic Arch',
        options: CMR_VASCULAR_ARRANGEMENT_OPTIONS.filter((option) => option.group === 'Aortic Arch'),
      },
      {
        title: 'Systemic Venous',
        options: CMR_VASCULAR_ARRANGEMENT_OPTIONS.filter((option) => option.group === 'Systemic Venous'),
      },
    ]
  }, [])

  const generatedPreviewText = useMemo(() => {
    const lines: string[] = []

    lines.push(
      `${selectedVascularArrangement.reportText} Height ${formatInteger(demographics?.height_cm)} cm and weight ${formatInteger(demographics?.weight_kg)} kg (BMI ${formatInteger(bmi)}). The heart rate throughout the scan averaged ${formatInteger(demographics?.heart_rate)} bpm.`,
    )
    lines.push('')
      lines.push('Left ventricle:')
      if (output?.reportGenerated) {
        const lvParagraphParts = [
          lvText,
          rwmaReportText ?? '[Regional wall motion scaffold.]',
        ].filter(Boolean)
        if (lvParagraphParts.length > 0) {
          lines.push(lvParagraphParts.join(' '))
      }
    } else {
      lines.push('[LV chamber, wall thickness, systolic function, and regional wall motion scaffold.]')
    }
    lines.push('')
    lines.push('Right ventricle:')
    lines.push(output?.reportGenerated ? (rvText ?? '[RV size and systolic function scaffold.]') : '[RV size and systolic function scaffold.]')
    lines.push('')
    lines.push('Atria:')
    lines.push(output?.reportGenerated ? (atriaText ?? '[Biatrial size scaffold.]') : '[Biatrial size scaffold.]')
    lines.push('')
    lines.push(buildQuantLine('CMR quantitative', 'Value', 'Normal range'))
    lines.push(...quantitativeLines)
    lines.push('')
    lines.push('Tissue characterisation:')
    if (tissueStatement) {
      lines.push(tissueStatement)
    }
    if (tissueQuantLines.length > 0) {
      lines.push(...tissueQuantLines)
    }
    if (isStressStudy) {
      lines.push('')
      lines.push('Stress perfusion:')
      if (perfusionStatement) {
        lines.push(perfusionStatement)
      } else {
        lines.push('[Stress perfusion scaffold.]')
      }
      lines.push('')
    } else {
      lines.push('')
    }
    if (flowLines.length > 0) {
      lines.push(...flowLines)
    } else {
      lines.push('Flow:')
      lines.push(reportInput?.fourDFlow
        ? '[4D flow scaffold.]'
        : '[Flow scaffold.]')
    }
    if (output?.includeValveAssessment) {
      lines.push('')
      lines.push('Valves:')
      lines.push(output?.reportGenerated ? (valveText ?? '[Valve scaffold.]') : '[Valve scaffold.]')
    }
    if (output?.includePhAssessment && phSummaryState.previewText) {
      lines.push('')
      lines.push('Pulmonary hypertension assessment:')
      lines.push(phSummaryState.previewText)
    }
    lines.push('')
    lines.push('Conclusions:')
    if (output?.reportGenerated) {
      if ((conclusionLines?.length ?? 0) > 0) {
        conclusionLines?.forEach((line, index) => {
          lines.push(`${index + 1}. ${line}`)
        })
      } else {
        lines.push('1. [LV conclusion scaffold.]')
        lines.push('2. [RV conclusion scaffold.]')
      }
    } else {
      lines.push('1. [LV conclusion scaffold.]')
      lines.push('2. [RV conclusion scaffold.]')
      lines.push('3. [Conclusion scaffold.]')
    }

    return lines.join('\n')
  }, [
    bmi,
    demographics?.heart_rate,
    demographics?.height_cm,
    demographics?.weight_kg,
    quantitativeLines,
    tissueQuantLines,
    tissueStatement,
    isStressStudy,
    perfusionStatement,
    flowLines,
    reportInput?.fourDFlow,
    reportInput?.reportType,
    conclusionLines,
    output?.reportGenerated,
    output?.includeValveAssessment,
    selectedVascularArrangement.reportText,
    lvText,
    rwmaReportText,
    rvText,
    atriaText,
    valveText,
    output?.includePhAssessment,
    phSummaryState.previewText,
  ])

  const persistedPreviewText = output?.editedReportText ?? generatedPreviewText
  const [reportTextDraft, setReportTextDraft] = useState(persistedPreviewText)
  const reportTextHydrationCaseIdRef = useRef<string | null>(activeCase?.id ?? null)
  const hydratedReportTextRef = useRef(persistedPreviewText)
  const latestReportTextDraftRef = useRef(reportTextDraft)
  const latestGeneratedPreviewTextRef = useRef(generatedPreviewText)
  const latestReportTitleRef = useRef(reportTitle)
  const supportsNativeReportTextareaAutosize =
    typeof CSS !== 'undefined' &&
    typeof CSS.supports === 'function' &&
    CSS.supports('field-sizing', 'content')
  const reportTextareaClassName = `min-h-[960px] border-0 bg-transparent px-0 py-0 font-mono text-[15px] leading-[1.2] text-[hsl(var(--foreground))] shadow-none focus-visible:ring-0 ${
    supportsNativeReportTextareaAutosize ? 'resize-none overflow-hidden' : 'resize-y overflow-y-auto'
  }`
  const reportTextareaStyle = {
    fontFamily: '"Courier New", Courier, monospace',
    ...(supportsNativeReportTextareaAutosize ? { fieldSizing: 'content' } : {}),
  } as CSSProperties
  const quantitativeHeaderLine = useMemo(
    () => buildQuantLine('CMR quantitative', 'Value', 'Normal range'),
    [],
  )
  const reportTissueValueLines = useMemo(
    () => [
      'Tissue characterisation:',
      ...(tissueStatement ? [tissueStatement] : []),
      ...tissueQuantLines,
      '',
    ],
    [tissueQuantLines, tissueStatement],
  )
  const reportFlowValueLines = useMemo(
    () => flowLines.length > 0
      ? [...flowLines, '']
      : [
          'Flow:',
          reportInput?.fourDFlow ? '[4D flow scaffold.]' : '[Flow scaffold.]',
          '',
        ],
    [flowLines, reportInput?.fourDFlow],
  )
  const availableRegenerateOptions = useMemo(
    () => REPORT_REGENERATE_OPTIONS.filter((option) => {
      if (option.key === 'full') return true
      if (!output?.reportGenerated) return false
      return getReportOutputSection(generatedPreviewText, option.key) !== null
    }),
    [generatedPreviewText, output?.reportGenerated],
  )
  const additionalQuantKeysSignature = useMemo(
    () => JSON.stringify(output?.additionalQuantKeys ?? []),
    [output?.additionalQuantKeys],
  )
  const additionalQuantSyncRef = useRef<{
    caseId: string | null
    signature: string
  }>({
    caseId: activeCase?.id ?? null,
    signature: additionalQuantKeysSignature,
  })
  const conclusionSyncSignature = useMemo(
    () => JSON.stringify(conclusionLines ?? plannedConclusionLines),
    [conclusionLines, plannedConclusionLines],
  )
  const conclusionSyncRef = useRef<{
    caseId: string | null
    signature: string
    formattedLines: string[]
  }>({
    caseId: activeCase?.id ?? null,
    signature: conclusionSyncSignature,
    formattedLines: formattedStoredConclusionLines,
  })
  const phSectionSyncSignature = useMemo(
    () => JSON.stringify({
      includePhAssessment: Boolean(output?.includePhAssessment),
      previewText: phSummaryState.previewText ?? null,
      conclusionLines: conclusionLines ?? plannedConclusionLines,
    }),
    [
      conclusionLines,
      output?.includePhAssessment,
      phSummaryState.previewText,
      plannedConclusionLines,
    ],
  )
  const phSectionSyncRef = useRef<{
    caseId: string | null
    signature: string
    includePhAssessment: boolean
    previewText: string | null
  }>({
    caseId: activeCase?.id ?? null,
    signature: phSectionSyncSignature,
    includePhAssessment: Boolean(output?.includePhAssessment),
    previewText: phSummaryState.previewText ?? null,
  })
  const valveSectionSyncSignature = useMemo(
    () => JSON.stringify({
      includeValveAssessment: Boolean(output?.includeValveAssessment),
      valveText: valveText ?? null,
    }),
    [output?.includeValveAssessment, valveText],
  )
  const valveSectionSyncRef = useRef<{
    caseId: string | null
    signature: string
  }>({
    caseId: activeCase?.id ?? null,
    signature: valveSectionSyncSignature,
  })

  useEffect(() => {
    const currentCaseId = activeCase?.id ?? null
    const previousCaseId = reportTextHydrationCaseIdRef.current
    const previousHydratedText = hydratedReportTextRef.current
    const caseChanged = currentCaseId !== previousCaseId

    if (caseChanged || reportTextDraft === previousHydratedText) {
      setReportTextDraft(persistedPreviewText)
    }

    reportTextHydrationCaseIdRef.current = currentCaseId
    hydratedReportTextRef.current = persistedPreviewText
  }, [activeCase?.id, persistedPreviewText, reportTextDraft])

  useEffect(() => {
    latestReportTextDraftRef.current = reportTextDraft
  }, [reportTextDraft])

  useEffect(() => {
    setCmrReportOutputDraft(activeCase?.id, reportTextDraft)
  }, [activeCase?.id, reportTextDraft])

  useEffect(() => {
    latestGeneratedPreviewTextRef.current = generatedPreviewText
  }, [generatedPreviewText])

  useEffect(() => {
    latestReportTitleRef.current = reportTitle
  }, [reportTitle])

  useEffect(() => {
    const caseId = activeCase?.id ?? null
    return () => {
      if (!caseId) return

      const store = useCmrCaseStore.getState()
      const currentActiveCase = store.activeCase
      if (!currentActiveCase || currentActiveCase.id !== caseId) return

      const normalizedTitle = latestReportTitleRef.current.trim() || 'Untitled report'
      const normalizedEditedReportText = latestReportTextDraftRef.current === latestGeneratedPreviewTextRef.current
        ? null
        : latestReportTextDraftRef.current

      if ((currentActiveCase.payload.output.editedReportText ?? null) !== normalizedEditedReportText) {
        store.patchActiveCasePayload((payload) => ({
          ...payload,
          output: {
            ...payload.output,
            editedReportText: normalizedEditedReportText,
          },
        }))
      }

      if ((currentActiveCase.title ?? '') !== normalizedTitle) {
        store.patchActiveCaseMeta({ title: normalizedTitle })
      }
    }
  }, [activeCase?.id])

  useEffect(() => {
    const currentCaseId = activeCase?.id ?? null
    const previousSync = additionalQuantSyncRef.current
    const caseChanged = currentCaseId !== previousSync.caseId
    const selectionChanged = additionalQuantKeysSignature !== previousSync.signature

    additionalQuantSyncRef.current = {
      caseId: currentCaseId,
      signature: additionalQuantKeysSignature,
    }

    if (caseChanged || !selectionChanged) {
      return
    }

    setReportTextDraft((currentDraft) =>
      replaceReportQuantitativeSection(currentDraft, quantitativeHeaderLine, quantitativeLines),
    )
    setReportSaveFeedback(null)
  }, [activeCase?.id, additionalQuantKeysSignature, quantitativeHeaderLine, quantitativeLines])

  useEffect(() => {
    const currentCaseId = activeCase?.id ?? null
    const previousSync = valveSectionSyncRef.current
    const caseChanged = currentCaseId !== previousSync.caseId
    const valveConfigChanged = valveSectionSyncSignature !== previousSync.signature

    valveSectionSyncRef.current = {
      caseId: currentCaseId,
      signature: valveSectionSyncSignature,
    }

    if (caseChanged || !valveConfigChanged || !output?.reportGenerated) {
      return
    }

    const currentDraft = latestReportTextDraftRef.current
    const nextDraft = replaceReportValveSection(
      currentDraft,
      valveText,
      Boolean(output?.includeValveAssessment),
    )
    if (nextDraft === currentDraft) {
      return
    }

    latestReportTextDraftRef.current = nextDraft
    setReportTextDraft(nextDraft)
    setReportSaveFeedback(null)

    const normalizedEditedReportText = nextDraft === generatedPreviewText ? null : nextDraft
    if ((output?.editedReportText ?? null) !== normalizedEditedReportText) {
      patchActiveCasePayload((payload) => ({
        ...payload,
        output: {
          ...payload.output,
          editedReportText: normalizedEditedReportText,
        },
      }))
    }
  }, [
    activeCase?.id,
    generatedPreviewText,
    output?.editedReportText,
    output?.includeValveAssessment,
    output?.reportGenerated,
    patchActiveCasePayload,
    valveSectionSyncSignature,
    valveText,
  ])

  useEffect(() => {
    const currentCaseId = activeCase?.id ?? null
    const previousSync = conclusionSyncRef.current
    const caseChanged = currentCaseId !== previousSync.caseId
    const conclusionChanged = conclusionSyncSignature !== previousSync.signature

    conclusionSyncRef.current = {
      caseId: currentCaseId,
      signature: conclusionSyncSignature,
      formattedLines: formattedStoredConclusionLines,
    }

    if (caseChanged || !conclusionChanged || !output?.reportGenerated) {
      return
    }

    const currentDraft = latestReportTextDraftRef.current
    const currentConclusionLines = extractReportConclusionsSection(currentDraft)
    const canRefreshGeneratedConclusions = currentConclusionLines === null
      || JSON.stringify(currentConclusionLines) === JSON.stringify(previousSync.formattedLines)
    if (!canRefreshGeneratedConclusions) {
      return
    }

    const nextDraft = replaceReportConclusionsSection(
      currentDraft,
      conclusionLines ?? plannedConclusionLines,
    )
    if (nextDraft === currentDraft) {
      return
    }

    latestReportTextDraftRef.current = nextDraft
    setReportTextDraft(nextDraft)
    setReportSaveFeedback(null)

    const normalizedEditedReportText = nextDraft === generatedPreviewText ? null : nextDraft
    if ((output?.editedReportText ?? null) !== normalizedEditedReportText) {
      patchActiveCasePayload((payload) => ({
        ...payload,
        output: {
          ...payload.output,
          editedReportText: normalizedEditedReportText,
        },
      }))
    }
  }, [
    activeCase?.id,
    conclusionLines,
    conclusionSyncSignature,
    formattedStoredConclusionLines,
    generatedPreviewText,
    output?.editedReportText,
    output?.reportGenerated,
    patchActiveCasePayload,
    plannedConclusionLines,
  ])

  useEffect(() => {
    const currentCaseId = activeCase?.id ?? null
    const previousSync = phSectionSyncRef.current
    const caseChanged = currentCaseId !== previousSync.caseId
    const phConfigChanged = phSectionSyncSignature !== previousSync.signature

    phSectionSyncRef.current = {
      caseId: currentCaseId,
      signature: phSectionSyncSignature,
      includePhAssessment: Boolean(output?.includePhAssessment),
      previewText: phSummaryState.previewText ?? null,
    }

    if (caseChanged || !phConfigChanged || !output?.reportGenerated) {
      return
    }

    const currentDraft = latestReportTextDraftRef.current
    const currentPhSection = extractReportPhSection(currentDraft)
    const normalizedCurrentPhSection = currentPhSection?.trim() ?? null
    const normalizedPreviousPhSection = previousSync.previewText?.trim() ?? null
    const canRefreshGeneratedPhSection = normalizedCurrentPhSection === null
      || normalizedCurrentPhSection === normalizedPreviousPhSection
    if (!canRefreshGeneratedPhSection) {
      return
    }

    const nextDraft = replaceReportPhSection(
      currentDraft,
      phSummaryState.previewText,
      Boolean(output?.includePhAssessment),
    )
    if (nextDraft === currentDraft) {
      return
    }

    latestReportTextDraftRef.current = nextDraft
    setReportTextDraft(nextDraft)
    setReportSaveFeedback(null)

    const normalizedEditedReportText = nextDraft === generatedPreviewText ? null : nextDraft
    if ((output?.editedReportText ?? null) !== normalizedEditedReportText) {
      patchActiveCasePayload((payload) => ({
        ...payload,
        output: {
          ...payload.output,
          editedReportText: normalizedEditedReportText,
        },
      }))
    }
  }, [
    activeCase?.id,
    generatedPreviewText,
    output?.editedReportText,
    output?.includePhAssessment,
    output?.reportGenerated,
    patchActiveCasePayload,
    phSectionSyncSignature,
    phSummaryState.previewText,
  ])

  const previewText = reportTextDraft

  const caseQuestionRequestContext = useMemo(() => ({
    reportType: reportInput?.reportType === 'stress' ? 'stress' as const : 'standard' as const,
    reportOutputText: previewText.trim().length > 0 ? previewText : null,
    sectionSummaries: caseLessonsInput.sectionSummaries,
    conclusionLines: conclusionLines ?? plannedConclusionLines,
    notableMeasurements,
  }), [
    caseLessonsInput.sectionSummaries,
    conclusionLines,
    notableMeasurements,
    output?.reportGenerated,
    plannedConclusionLines,
    previewText,
    reportInput?.reportType,
  ])
  const reportRefinementRequestContext = useMemo(() => ({
    reportType: reportInput?.reportType === 'stress' ? 'stress' as const : 'standard' as const,
    reportOutputText: output?.reportGenerated ? previewText : reportTextDraft,
    sectionSummaries: caseLessonsInput.sectionSummaries,
    conclusionLines: conclusionLines ?? plannedConclusionLines,
    notableMeasurements,
  }), [
    caseLessonsInput.sectionSummaries,
    conclusionLines,
    notableMeasurements,
    output?.reportGenerated,
    plannedConclusionLines,
    previewText,
    reportInput?.reportType,
    reportTextDraft,
  ])

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(previewText)
      setCopied(true)
    } catch {
      setCopied(false)
    }
  }

  const buildRegenerateUndoSnapshot = (sectionLabel: string): CmrOutputUndoRegenerateSnapshot => ({
    draftText: latestReportTextDraftRef.current,
    generatedPreviewText: latestGeneratedPreviewTextRef.current,
    reportGenerated: Boolean(output?.reportGenerated),
    conclusionLines: [...(output?.conclusionLines ?? [])],
    conclusionSourceSignature: output?.conclusionSourceSignature ?? null,
    sectionLabel,
    createdAt: new Date().toISOString(),
  })

  const clearRegenerateUndoSnapshot = () => {
    if (!regenerateUndoSnapshot) {
      return
    }

    patchActiveCasePayload((payload) => ({
      ...payload,
      output: {
        ...payload.output,
        undoRegenerateSnapshot: null,
      },
    }))
  }

  const handleGenerateOutput = async () => {
    const undoRegenerateSnapshot = buildRegenerateUndoSnapshot('Full report')
    const initialPreviewText = generatedPreviewText

    setIsGeneratingOutput(true)
    setOutputGenerationError(null)
    setRegenerateUndoFeedback(null)
    setRegenerateMenuOpen(false)
    patchActiveCasePayload((payload) => ({
      ...payload,
      output: {
        ...payload.output,
        undoRegenerateSnapshot,
      },
    }))
    setReportTextDraft(initialPreviewText)
    latestReportTextDraftRef.current = initialPreviewText

    try {
      const generatedConclusionLines = plannedConclusionLines.length > 0
        ? await generateCmrReportConclusions({
            reportType: reportInput?.reportType === 'stress' ? 'stress' : 'standard',
            deterministicLines: plannedConclusionLines,
          })
        : []
      const nextDraft = output?.reportGenerated
        ? replaceReportConclusionsSection(initialPreviewText, generatedConclusionLines)
        : initialPreviewText
      if (nextDraft !== initialPreviewText) {
        setReportTextDraft(nextDraft)
        latestReportTextDraftRef.current = nextDraft
      }

      patchActiveCasePayload((payload) => ({
        ...payload,
        output: {
          ...payload.output,
          reportGenerated: true,
          editedReportText: null,
          conclusionLines: generatedConclusionLines,
          conclusionSourceSignature: buildReportConclusionSourceSignature(plannedConclusionLines),
        },
      }))
    } catch (error) {
      setOutputGenerationError(error instanceof Error ? error.message : String(error))
      patchActiveCasePayload((payload) => ({
        ...payload,
        output: {
          ...payload.output,
          reportGenerated: true,
          editedReportText: null,
        },
      }))
    } finally {
      setIsGeneratingOutput(false)
    }
  }

  const handleRegenerateConclusions = async (sectionLabel: string) => {
    const undoRegenerateSnapshot = buildRegenerateUndoSnapshot(sectionLabel)
    const currentDraft = latestReportTextDraftRef.current

    setIsGeneratingOutput(true)
    setOutputGenerationError(null)
    setRegenerateUndoFeedback(null)

    try {
      const generatedConclusionLines = plannedConclusionLines.length > 0
        ? await generateCmrReportConclusions({
            reportType: reportInput?.reportType === 'stress' ? 'stress' : 'standard',
            deterministicLines: plannedConclusionLines,
          })
        : []
      const nextDraft = replaceReportConclusionsSection(currentDraft, generatedConclusionLines)
      const generatedPreviewWithConclusions = replaceReportConclusionsSection(generatedPreviewText, generatedConclusionLines)
      const normalizedEditedReportText = nextDraft === generatedPreviewWithConclusions ? null : nextDraft

      setReportTextDraft(nextDraft)
      latestReportTextDraftRef.current = nextDraft
      setReportSaveFeedback(null)

      patchActiveCasePayload((payload) => ({
        ...payload,
        output: {
          ...payload.output,
          reportGenerated: true,
          editedReportText: normalizedEditedReportText,
          conclusionLines: generatedConclusionLines,
          conclusionSourceSignature: buildReportConclusionSourceSignature(plannedConclusionLines),
          undoRegenerateSnapshot,
        },
      }))
    } catch (error) {
      setOutputGenerationError(error instanceof Error ? error.message : String(error))
    } finally {
      setIsGeneratingOutput(false)
    }
  }

  const handleRegenerateReportSection = (sectionKey: ReportOutputSectionKey, sectionLabel: string) => {
    const replacementText = getReportOutputSection(generatedPreviewText, sectionKey)
    if (replacementText === null) {
      setOutputGenerationError(`Could not find the ${sectionLabel} section in the generated report.`)
      return
    }

    const currentDraft = latestReportTextDraftRef.current
    const nextDraft = replaceReportOutputSection({
      reportText: currentDraft,
      sectionKey,
      replacementText,
    })

    if (nextDraft === currentDraft) {
      setRegenerateUndoFeedback(`${sectionLabel} already matches the generated report.`)
      return
    }

    const undoRegenerateSnapshot = buildRegenerateUndoSnapshot(sectionLabel)
    const normalizedEditedReportText = nextDraft === generatedPreviewText ? null : nextDraft

    setReportTextDraft(nextDraft)
    latestReportTextDraftRef.current = nextDraft
    setOutputGenerationError(null)
    setReportSaveFeedback(null)
    setReportRefinementFeedback(null)
    setRegenerateUndoFeedback(null)

    patchActiveCasePayload((payload) => ({
      ...payload,
      output: {
        ...payload.output,
        reportGenerated: true,
        editedReportText: normalizedEditedReportText,
        undoRegenerateSnapshot,
      },
    }))
  }

  const handleRegenerateOption = async (option: ReportRegenerateOption) => {
    setRegenerateMenuOpen(false)
    if (option.key === 'full') {
      await handleGenerateOutput()
      return
    }
    if (option.key === 'conclusions') {
      await handleRegenerateConclusions(option.label)
      return
    }
    handleRegenerateReportSection(option.key, option.label)
  }

  const handleReportTextChange = (nextValue: string) => {
    setReportTextDraft(nextValue)
    setReportSaveFeedback(null)
    setReportRefinementFeedback(null)
    setRegenerateUndoFeedback(null)
    clearRegenerateUndoSnapshot()
  }

  const handleUpdateReportValues = () => {
    const currentDraft = latestReportTextDraftRef.current
    const nextDraft = refreshReportOutputValues({
      reportText: currentDraft,
      quantitativeHeaderLine,
      quantitativeLines,
      tissueLines: reportTissueValueLines,
      flowLines: reportFlowValueLines,
    })
    if (nextDraft === currentDraft) {
      return
    }

    latestReportTextDraftRef.current = nextDraft
    setReportTextDraft(nextDraft)
    setReportSaveFeedback(null)
    setReportRefinementFeedback(null)
    setRegenerateUndoFeedback(null)

    const normalizedEditedReportText = nextDraft === generatedPreviewText ? null : nextDraft
    if ((output?.editedReportText ?? null) !== normalizedEditedReportText || regenerateUndoSnapshot) {
      patchActiveCasePayload((payload) => ({
        ...payload,
        output: {
          ...payload.output,
          editedReportText: normalizedEditedReportText,
          undoRegenerateSnapshot: null,
        },
      }))
    }
  }

  const handleUndoRegenerate = () => {
    if (!regenerateUndoSnapshot) {
      return
    }

    const restoredEditedReportText = regenerateUndoSnapshot.draftText === regenerateUndoSnapshot.generatedPreviewText
      ? null
      : regenerateUndoSnapshot.draftText

    setReportTextDraft(regenerateUndoSnapshot.draftText)
    latestReportTextDraftRef.current = regenerateUndoSnapshot.draftText
    setOutputGenerationError(null)
    setReportSaveFeedback(null)
    setReportRefinementFeedback(null)
    setRegenerateMenuOpen(false)
    setRegenerateUndoFeedback(`Restored the draft from before regenerating ${regenerateUndoSnapshot.sectionLabel ?? 'the report'}.`)

    patchActiveCasePayload((payload) => ({
      ...payload,
      output: {
        ...payload.output,
        reportGenerated: regenerateUndoSnapshot.reportGenerated,
        editedReportText: restoredEditedReportText,
        conclusionLines: [...regenerateUndoSnapshot.conclusionLines],
        conclusionSourceSignature: regenerateUndoSnapshot.conclusionSourceSignature,
        undoRegenerateSnapshot: null,
      },
    }))
  }

  const captureCurrentReportSelection = (): ReportSelectionDraft | null => {
    const textarea = reportTextareaRef.current
    if (!textarea) {
      return null
    }
    return buildReportSelectionDraft(
      reportTextDraft,
      textarea.selectionStart ?? 0,
      textarea.selectionEnd ?? 0,
    )
  }

  const handleOpenReportRefinement = () => {
    const selection = captureCurrentReportSelection()
    if (!selection) {
      setReportRefinementError('Highlight the report text you want to refine, then try again.')
      setReportRefinementFeedback(null)
      return
    }

    setReportRefinementSelection(selection)
    setReportRefinementConversation([])
    setReportRefinementInput('')
    setReportRefinementError(null)
    setReportRefinementFeedback(null)
    setReportRefinementShouldAutoScroll(true)
    setReportRefinementModalOpen(true)
  }

  const handleAskReportRefinement = async () => {
    const selection = reportRefinementSelection
    const trimmedInstruction = reportRefinementInput.trim()
    if (!selection || !trimmedInstruction) {
      return
    }

    setIsRefiningReportSelection(true)
    setReportRefinementError(null)
    setReportRefinementFeedback(null)
    setReportRefinementShouldAutoScroll(true)

    try {
      const result = await generateCmrReportSelectionRefinement({
        ...reportRefinementRequestContext,
        instruction: trimmedInstruction,
        selectedText: selection.text,
        selectionContextBefore: selection.contextBefore,
        selectionContextAfter: selection.contextAfter,
        conversation: reportRefinementConversation,
      })

      setReportRefinementConversation((current) => [
        ...current,
        { role: 'user', content: trimmedInstruction },
        {
          role: 'assistant',
          content: normalizeCmrCaseLessonsProse(result.answer),
          replacementText: normalizeCmrCaseLessonsProse(result.replacementText),
        },
      ])
      setReportRefinementInput('')
    } catch (error) {
      setReportRefinementError(error instanceof Error ? error.message : String(error))
    } finally {
      setIsRefiningReportSelection(false)
    }
  }

  const handleReplaceRefinedText = (replacementText: string) => {
    if (!reportRefinementSelection || !replacementText.trim()) {
      return
    }

    const result = applyReportSelectionReplacement(
      reportTextDraft,
      reportRefinementSelection,
      replacementText,
    )
    if (!result) {
      setReportRefinementError('The selected text no longer matches the report. Reselect the passage and try again.')
      return
    }

    setReportTextDraft(result.nextText)
    setReportRefinementSelection(result.nextSelection)
    setReportRefinementFeedback('Replacement inserted into the report.')
    setReportSaveFeedback(null)
    setReportRefinementError(null)
    setRegenerateUndoFeedback(null)
    latestReportTextDraftRef.current = result.nextText
    clearRegenerateUndoSnapshot()
  }

  const handleClearReportRefinementThread = () => {
    setReportRefinementConversation([])
    setReportRefinementInput('')
    setReportRefinementError(null)
    setReportRefinementFeedback(null)
    setReportRefinementShouldAutoScroll(true)
  }

  const handleReportRefinementScroll = () => {
    const container = reportRefinementScrollRef.current
    if (!container) return
    const distanceFromBottom = container.scrollHeight - container.scrollTop - container.clientHeight
    setReportRefinementShouldAutoScroll(distanceFromBottom <= 48)
  }

  const protocolIndicators = [
    { label: 'Study', value: reportInput?.reportType === 'stress' ? 'Stress' : 'Standard' },
    { label: 'Flow', value: reportInput?.fourDFlow ? '2D-PC + 4D-flow' : '2D-PC' },
    { label: 'Contrast', value: reportInput?.nonContrast ? 'No' : 'Yes' },
  ]

  const tissueIndicators = [
    {
      label: 'T1 / ECV',
      present: measurementMap.has('Native T1') || measurementMap.has('Native myocardial T1') || measurementMap.has('ECV'),
    },
    { label: 'T2', present: measurementMap.has('Native T2') || measurementMap.has('Native myocardial T2') },
  ]

  const handleSelectVascularArrangement = (key: string) => {
    patchActiveCasePayload((payload) => ({
      ...payload,
      output: {
        ...payload.output,
        vascularArrangementKey: key,
      },
    }))
    setVascularModalOpen(false)
  }

  const handleToggleAdditionalQuantKey = (parameterKey: string) => {
    patchActiveCasePayload((payload) => {
      const currentKeys = payload.output.additionalQuantKeys ?? []
      const nextKeys = currentKeys.includes(parameterKey)
        ? currentKeys.filter((key) => key !== parameterKey)
        : [...currentKeys, parameterKey]
      return {
        ...payload,
        output: {
          ...payload.output,
          additionalQuantKeys: nextKeys,
        },
      }
    })
  }

  const handleSetSelectedValveKeys = (nextKeys: CmrOutputValveKey[]) => {
    patchActiveCasePayload((payload) => ({
      ...payload,
      output: {
        ...payload.output,
        selectedValveKeys: nextKeys,
        includeValveAssessment: nextKeys.length > 0 ? payload.output.includeValveAssessment : false,
      },
    }))
  }

  const handleToggleValveSelection = (valveKey: CmrOutputValveKey) => {
    const nextKeys = selectedValveKeys.includes(valveKey)
      ? selectedValveKeys.filter((key) => key !== valveKey)
      : [...selectedValveKeys, valveKey]
    handleSetSelectedValveKeys(nextKeys)
  }

  const handleSelectAllValves = () => {
    handleSetSelectedValveKeys(REPORT_VALVE_OPTIONS.map((item) => item.key))
  }

  const handleClearValveSelection = () => {
    handleSetSelectedValveKeys([])
  }

  const handleSetIncludeValveAssessment = (includeValveAssessment: boolean) => {
    if (includeValveAssessment && selectedValveKeys.length === 0) {
      return
    }
    patchActiveCasePayload((payload) => ({
      ...payload,
      output: {
        ...payload.output,
        includeValveAssessment,
      },
    }))
    setValveModalOpen(false)
  }

  const handleOpenValvesModule = () => {
    if (!activeCase?.id) return
    setValveModalOpen(false)
    navigate(`/cmr/cases/${activeCase.id}/valves`)
  }

  const handleSetIncludePhAssessment = (includePhAssessment: boolean) => {
    patchActiveCasePayload((payload) => ({
      ...payload,
      output: {
        ...payload.output,
        includePhAssessment,
      },
    }))
    setPhModalOpen(false)
  }

  const handleOpenPhModule = () => {
    if (!activeCase?.id) return
    setPhModalOpen(false)
    navigate(`/cmr/cases/${activeCase.id}/ph`)
  }

  const handleGenerateCaseLessonsForModeInternal = async (
    mode: CmrCaseLessonsMode,
  ): Promise<CaseLessonsGenerationResult> => {
    try {
      const lessonData = caseDiscussionData
      const lessonSignature = caseDiscussionSignature
      const prose = await generateCmrCaseLessonsProse(lessonData)
      patchActiveCasePayload((payload) => ({
        ...payload,
        output: {
          ...payload.output,
          caseDiscussionProse: normalizeCmrCaseLessonsProse(prose),
          caseDiscussionSourceSignature: lessonSignature,
        },
      }))
      return { mode, ok: true, error: null }
    } catch (error) {
      return {
        mode,
        ok: false,
        error: error instanceof Error ? error.message : String(error),
      }
    }
  }

  const handleGenerateCaseLessonsForMode = async (mode: CmrCaseLessonsMode): Promise<boolean> => {
    setIsGeneratingLessons(true)
    setLessonsGenerationError(null)

    try {
      const result = await handleGenerateCaseLessonsForModeInternal(mode)
      if (!result.ok) {
        setLessonsGenerationError(result.error)
      }
      return result.ok
    } finally {
      setIsGeneratingLessons(false)
    }
  }

  const handleGenerateCaseLessons = async () => {
    await handleGenerateCaseLessonsForMode('case-discussion')
  }

  const handleOpenLessonsModal = async () => {
    setSelectedLessonsTab('case-discussion')
    setLessonsGenerationError(null)
    setCaseQuestionError(null)

    if (caseDiscussionState.isCurrent) {
      setLessonsModalOpen(true)
      return
    }

    setIsGeneratingLessons(true)
    try {
      const result = await handleGenerateCaseLessonsForModeInternal('case-discussion')
      if (!result.ok) {
        setLessonsGenerationError(result.error)
        setLessonsModalOpen(true)
        return
      }
      setLessonsModalOpen(true)
    } finally {
      setIsGeneratingLessons(false)
    }
  }

  const handleAskTheCase = async () => {
    const trimmedQuestion = caseQuestionInput.trim()
    if (!trimmedQuestion) return

    setIsAnsweringCaseQuestion(true)
    setCaseQuestionError(null)
    setCaseQaShouldAutoScroll(true)

    try {
      const answer = await generateCmrCaseQuestionAnswer({
        ...caseQuestionRequestContext,
        question: trimmedQuestion,
        conversation: caseQaConversation,
      })

      patchActiveCasePayload((payload) => ({
        ...payload,
        output: {
          ...payload.output,
          caseQaConversation: [
            ...(payload.output.caseQaConversation ?? []),
            { role: 'user', content: trimmedQuestion },
            { role: 'assistant', content: normalizeCmrCaseLessonsProse(answer) },
          ],
        },
      }))
      setCaseQuestionInput('')
    } catch (error) {
      setCaseQuestionError(error instanceof Error ? error.message : String(error))
    } finally {
      setIsAnsweringCaseQuestion(false)
    }
  }

  const handleClearCaseQaConversation = () => {
    patchActiveCasePayload((payload) => ({
      ...payload,
      output: {
        ...payload.output,
        caseQaConversation: [],
      },
    }))
    setCaseQuestionError(null)
    setCaseQaShouldAutoScroll(true)
  }

  const handleCaseQaScroll = () => {
    const container = caseQaScrollRef.current
    if (!container) return
    const distanceFromBottom = container.scrollHeight - container.scrollTop - container.clientHeight
    setCaseQaShouldAutoScroll(distanceFromBottom <= 48)
  }

  const handleSaveReport = async () => {
    if (!activeCase) return
    const normalizedTitle = reportTitle.trim() || 'Untitled report'
    const normalizedEditedReportText = reportTextDraft === generatedPreviewText ? null : reportTextDraft
    setReportTitle(normalizedTitle)
    setReportSaveFeedback(null)
    patchActiveCasePayload((payload) => ({
      ...payload,
      output: {
        ...payload.output,
        editedReportText: normalizedEditedReportText,
      },
    }))
    patchActiveCaseMeta({ title: normalizedTitle })
    const saved = await flushActiveCase()
    setReportSaveFeedback(saved ? 'saved' : null)
  }

  useEffect(() => {
    if (!lessonsModalOpen || selectedLessonsTab !== 'ask-the-case' || !caseQaShouldAutoScroll) {
      return
    }
    const container = caseQaScrollRef.current
    if (!container) return

    const frame = window.requestAnimationFrame(() => {
      container.scrollTop = container.scrollHeight
    })
    return () => window.cancelAnimationFrame(frame)
  }, [caseQaConversation.length, caseQaShouldAutoScroll, lessonsModalOpen, selectedLessonsTab])

  useEffect(() => {
    if (!reportRefinementModalOpen || !reportRefinementShouldAutoScroll) {
      return
    }
    const container = reportRefinementScrollRef.current
    if (!container) return

    const frame = window.requestAnimationFrame(() => {
      container.scrollTop = container.scrollHeight
    })
    return () => window.cancelAnimationFrame(frame)
  }, [
    reportRefinementConversation.length,
    reportRefinementModalOpen,
    reportRefinementShouldAutoScroll,
  ])

  return (
    <Stack space="lg" className="pb-8">
      <Row align="center" gap="md" wrap={false} className="house-page-title-row">
        <SectionMarker tone="report" size="title" className="self-stretch h-auto" />
        <PageHeader
          heading="Report output"
          className="!ml-0 !mt-0"
          actions={(
            <Button
              type="button"
              variant={copied ? 'cta' : 'tertiary'}
              className="rounded-full px-5"
              onClick={() => { void handleCopy() }}
            >
              {copied ? 'Copied' : 'Copy output'}
            </Button>
          )}
        />
      </Row>

      <div className="flex w-full max-w-[1500px] flex-col gap-6 xl:flex-row xl:items-start">
        <div className="flex w-full min-w-0 flex-1 flex-col gap-5">
          <div className="rounded-[28px] border border-border/60 bg-white px-6 py-6 shadow-[0_20px_45px_-28px_rgba(15,23,42,0.35)]">
            <div className={REPORT_OUTPUT_INDICATOR_ROW_CLASSNAME}>
              {protocolIndicators.map((item) => (
                <div
                  key={item.label}
                  className={REPORT_OUTPUT_PROTOCOL_INDICATOR_CLASSNAME}
                >
                  <span className="text-[10px] font-medium uppercase tracking-[0.12em] text-[hsl(var(--muted-foreground))]">
                    {item.label}
                  </span>
                  <span className="mt-1 text-sm font-semibold leading-none text-[hsl(var(--foreground))]">
                    {item.value}
                  </span>
                </div>
              ))}
              {tissueIndicators.map((item) => (
                <div
                  key={item.label}
                  className={getReportOutputTissueIndicatorClassName(item.present)}
                >
                  <span className="font-semibold uppercase tracking-[0.08em]">{item.label}</span>
                </div>
              ))}
              <div className={REPORT_OUTPUT_ACTIONS_CLASSNAME}>
                <div className="flex items-center justify-end gap-1.5">
                  <Button
                    type="button"
                    variant="tertiary"
                    className={REPORT_OUTPUT_ACTION_BUTTON_CLASSNAME}
                    onClick={handleOpenReportRefinement}
                    disabled={reportTextDraft.trim().length === 0}
                    title="Refine selected text"
                  >
                    {REPORT_OUTPUT_REFINE_BUTTON_LABEL}
                  </Button>
                  <Button
                    type="button"
                    variant="tertiary"
                    className={REPORT_OUTPUT_ACTION_BUTTON_CLASSNAME}
                    onClick={handleUpdateReportValues}
                    title="Update report values from quantitative measurements"
                  >
                    {REPORT_OUTPUT_UPDATE_VALUES_BUTTON_LABEL}
                  </Button>
                  <div ref={regenerateMenuRef} className="relative shrink-0">
                    <Button
                      type="button"
                      variant="tertiary"
                      className={`${REPORT_OUTPUT_ACTION_BUTTON_CLASSNAME} gap-1.5 border-[hsl(var(--section-style-report-accent)/0.35)] text-[hsl(var(--section-style-report-accent))] hover:bg-[hsl(var(--section-style-report-accent)/0.08)]`}
                      disabled={isGeneratingOutput}
                      onClick={() => {
                        if (!output?.reportGenerated) {
                          void handleGenerateOutput()
                          return
                        }
                        setRegenerateMenuOpen((current) => !current)
                      }}
                      aria-haspopup={output?.reportGenerated ? 'menu' : undefined}
                      aria-expanded={output?.reportGenerated ? regenerateMenuOpen : undefined}
                    >
                      <span>{isGeneratingOutput ? 'Generating' : output?.reportGenerated ? 'Regenerate' : 'Generate'}</span>
                      {output?.reportGenerated ? <ChevronDown className="h-3.5 w-3.5" aria-hidden="true" /> : null}
                    </Button>
                    {regenerateMenuOpen && output?.reportGenerated ? (
                      <div
                        role="menu"
                        className="absolute right-0 top-[calc(100%+0.45rem)] z-40 w-56 rounded-[18px] border border-border/70 bg-white p-1.5 text-sm shadow-[0_22px_60px_-28px_rgba(15,23,42,0.45)]"
                      >
                        {availableRegenerateOptions.map((option) => (
                          <button
                            key={option.key}
                            type="button"
                            role="menuitem"
                            className="flex w-full items-center rounded-[12px] px-3 py-2 text-left font-medium text-[hsl(var(--foreground))] hover:bg-[hsl(var(--section-style-report-accent)/0.08)] focus:bg-[hsl(var(--section-style-report-accent)/0.08)] focus:outline-none"
                            onClick={() => { void handleRegenerateOption(option) }}
                          >
                            {option.label}
                          </button>
                        ))}
                      </div>
                    ) : null}
                  </div>
                  {regenerateUndoSnapshot ? (
                    <Button
                      type="button"
                      variant="tertiary"
                      className={`${REPORT_OUTPUT_ACTION_BUTTON_CLASSNAME} border-[hsl(var(--tone-positive-300))] text-[hsl(var(--tone-positive-700))] hover:bg-[hsl(var(--tone-positive-50))]`}
                      disabled={isGeneratingOutput}
                      onClick={handleUndoRegenerate}
                      title="Undo regenerate"
                    >
                      {REPORT_OUTPUT_UNDO_REGENERATE_BUTTON_LABEL}
                    </Button>
                  ) : null}
                </div>
              </div>
            </div>
            {outputGenerationError ? (
              <p className="mb-4 text-sm text-red-600">
                {outputGenerationError}
              </p>
            ) : null}
            {regenerateUndoFeedback ? (
              <p className="mb-4 text-sm text-[hsl(var(--tone-positive-700))]">
                {regenerateUndoFeedback}
              </p>
            ) : null}
            <Textarea
              ref={reportTextareaRef}
              aria-label="Editable report output"
              value={reportTextDraft}
              onChange={(event) => handleReportTextChange(event.target.value)}
              className={reportTextareaClassName}
              style={reportTextareaStyle}
            />
          </div>

        </div>

        <div className="w-full max-w-[240px] shrink-0 xl:sticky xl:top-6">
          <div className="rounded-[24px] border border-border/60 bg-white px-4 py-4 shadow-[0_18px_40px_-30px_rgba(15,23,42,0.3)]">
            <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[hsl(var(--muted-foreground))]">
              Report Controls
            </p>
            <div className="mt-3 space-y-3">
              <Button
                type="button"
                variant="tertiary"
                className={getReportControlButtonClass(hasAdditionalQuantRows)}
                onClick={() => setAdditionalValuesModalOpen(true)}
              >
                Add additional values
              </Button>
              <Button
                type="button"
                variant="tertiary"
                className={getReportControlButtonClass(hasCustomVascularArrangement)}
                onClick={() => setVascularModalOpen(true)}
              >
                Vascular arrangement
              </Button>
              <Button
                type="button"
                variant="tertiary"
                className={getReportControlButtonClass(hasValveAssessmentIncluded)}
                onClick={() => setValveModalOpen(true)}
              >
                Valves
              </Button>
              <Button
                type="button"
                variant="tertiary"
                className={getReportControlButtonClass(hasPhAssessmentIncluded)}
                onClick={() => setPhModalOpen(true)}
              >
                PH module
              </Button>
            </div>
          </div>
          <div className="mt-4 rounded-[24px] border border-border/60 bg-white px-4 py-4 shadow-[0_18px_40px_-30px_rgba(15,23,42,0.3)]">
            <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[hsl(var(--muted-foreground))]">
              Insights and learning
            </p>
            <div className="mt-3 space-y-3">
              <Button
                type="button"
                variant="tertiary"
                className={getReportControlButtonClass(hasCaseLessonsGenerated)}
                onClick={() => { void handleOpenLessonsModal() }}
                disabled={isGeneratingLessons}
              >
                {isGeneratingLessons ? 'Loading lessons...' : 'Lessons from the case'}
              </Button>
            </div>
          </div>
          <div className="mt-4 rounded-[24px] border border-border/60 bg-white px-4 py-4 shadow-[0_18px_40px_-30px_rgba(15,23,42,0.3)]">
            <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[hsl(var(--muted-foreground))]">
              Save report
            </p>
            <div className="mt-3 space-y-3">
              <Input
                id="report-title"
                aria-label="Report name"
                value={reportTitle}
                onChange={(event) => {
                  setReportTitle(event.target.value)
                  setReportSaveFeedback(null)
                }}
                placeholder="Report name"
                className="h-11 rounded-[16px] border-border/70 px-4 text-[14px]"
              />
              <Button
                type="button"
                variant="cta"
                className="w-full rounded-full px-4"
                disabled={!activeCase || saveStatus === 'saving'}
                onClick={() => { void handleSaveReport() }}
              >
                {saveStatus === 'saving' ? 'Saving...' : 'Save report'}
              </Button>
              {saveError || reportSaveFeedback === 'saved' ? (
                <p className="text-sm text-[hsl(var(--muted-foreground))]">
                  {saveError ?? 'Report saved.'}
                </p>
              ) : null}
            </div>
          </div>
        </div>
      </div>

      {reportRefinementModalOpen ? (
        <div className="pointer-events-none fixed bottom-5 right-5 z-50 flex max-w-[calc(100vw-1.5rem)] flex-col items-end gap-3">
          <div className="pointer-events-auto flex h-[min(680px,calc(100vh-7rem))] w-[min(440px,calc(100vw-1.5rem))] flex-col overflow-hidden rounded-[28px] border border-border/70 bg-white shadow-[0_28px_80px_-38px_rgba(15,23,42,0.55)]">
            <div className="flex items-start justify-between gap-4 border-b border-border/60 px-5 py-4">
              <div className="min-w-0">
                <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[hsl(var(--section-style-report-accent))]">
                  Refine selected text
                </p>
              </div>
              <div className="flex items-center gap-2">
                {reportRefinementConversation.length > 0 ? (
                  <Button
                    type="button"
                    variant="tertiary"
                    className="rounded-full px-4"
                    onClick={handleClearReportRefinementThread}
                    disabled={isRefiningReportSelection}
                  >
                    Clear
                  </Button>
                ) : null}
                <Button
                  type="button"
                  variant="tertiary"
                  className="rounded-full px-4"
                  onClick={() => setReportRefinementModalOpen(false)}
                >
                  Close
                </Button>
              </div>
            </div>

            <div className="border-b border-border/60 bg-[hsl(var(--tone-neutral-50))] px-5 py-4">
              <p className="whitespace-pre-wrap font-mono text-[14px] leading-6 text-[hsl(var(--foreground))]">
                {reportRefinementSelection?.text ?? 'No report text is currently selected.'}
              </p>
            </div>

            <div
              ref={reportRefinementScrollRef}
              onScroll={handleReportRefinementScroll}
              className="min-h-0 flex-1 overflow-y-auto bg-[hsl(var(--tone-neutral-50))] px-5 py-5"
            >
              {reportRefinementConversation.length > 0 ? (
                <div className="space-y-3">
                  {reportRefinementConversation.map((message, index) => (
                    <div
                      key={`${message.role}-${index}`}
                      className={message.role === 'user' ? 'flex justify-end' : 'flex justify-start'}
                    >
                      <div
                        className={
                          message.role === 'user'
                            ? 'max-w-[84%] rounded-[22px] bg-[hsl(var(--section-style-report-accent))] px-4 py-3 text-sm leading-6 text-white shadow-sm'
                            : 'max-w-[84%] rounded-[22px] border border-border/60 bg-white px-4 py-3 text-sm leading-6 text-[hsl(var(--foreground))] shadow-sm'
                        }
                      >
                        <p className="whitespace-pre-wrap break-words">{message.content}</p>
                        {message.role === 'assistant' && message.replacementText ? (
                          <div className="mt-3 space-y-3">
                            <p className="whitespace-pre-wrap break-words font-mono text-[13px] leading-6 text-[hsl(var(--foreground))]">
                              {message.replacementText}
                            </p>
                            <Button
                              type="button"
                              variant="tertiary"
                              className="rounded-full px-4"
                              onClick={() => handleReplaceRefinedText(message.replacementText ?? '')}
                              disabled={isRefiningReportSelection}
                            >
                              Replace in report
                            </Button>
                          </div>
                        ) : null}
                      </div>
                    </div>
                  ))}
                  {isRefiningReportSelection ? (
                    <div className="flex justify-start">
                      <div className="rounded-[22px] border border-border/60 bg-white px-4 py-3 text-sm text-[hsl(var(--muted-foreground))] shadow-sm">
                        Thinking...
                      </div>
                    </div>
                  ) : null}
                </div>
              ) : null}
            </div>

            <div className="border-t border-border/60 bg-white px-5 py-4">
              {reportRefinementError ? (
                <p className="mb-3 text-sm text-[hsl(var(--tone-danger-700))]">{reportRefinementError}</p>
              ) : null}
              {reportRefinementFeedback ? (
                <p className="mb-3 text-sm text-[hsl(var(--tone-positive-700))]">{reportRefinementFeedback}</p>
              ) : null}
              <div className="space-y-3">
                <Textarea
                  value={reportRefinementInput}
                  onChange={(event) => setReportRefinementInput(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter' && !event.shiftKey) {
                      event.preventDefault()
                      void handleAskReportRefinement()
                    }
                  }}
                  className="min-h-[92px] resize-none rounded-[22px] border-border/70 bg-[hsl(var(--tone-neutral-50))] px-4 py-3 text-sm leading-6"
                />
                <div className="flex items-center justify-end">
                  <Button
                    type="button"
                    variant="tertiary"
                    className="rounded-full px-4"
                    onClick={() => { void handleAskReportRefinement() }}
                    disabled={isRefiningReportSelection || !reportRefinementSelection || reportRefinementInput.trim().length === 0}
                  >
                    {isRefiningReportSelection ? 'Thinking...' : 'Refine'}
                  </Button>
                </div>
              </div>
            </div>
          </div>
        </div>
      ) : null}

      <Modal open={vascularModalOpen} onOpenChange={setVascularModalOpen}>
        <ModalContent
          size="lg"
          scrollable
          className="overflow-hidden border border-border bg-card"
        >
          <ModalHeader className="relative border-b border-border bg-card pr-14">
            <Row align="center" gap="md" wrap={false} className="house-page-title-row">
              <SectionMarker tone="report" size="title" className="self-stretch h-auto" />
              <div className="min-w-0">
                <ModalTitle className="text-[hsl(var(--foreground))]">Vascular arrangement</ModalTitle>
                <ModalDescription className="mt-1 text-[hsl(var(--muted-foreground))]">
                  Select the closest gross vascular arrangement preset for the report opening sentence.
                </ModalDescription>
              </div>
            </Row>
            <ModalClose />
          </ModalHeader>
          <ModalBody scrollable className="space-y-6">
            {vascularArrangementGroups.map((group) => (
              <section key={group.title} className="space-y-3">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                    {group.title}
                  </p>
                </div>
                <div className="space-y-2">
                  {group.options.map((option) => {
                    const selected = option.key === selectedVascularArrangement.key
                    return (
                      <button
                        key={option.key}
                        type="button"
                        onClick={() => handleSelectVascularArrangement(option.key)}
                        className={
                          selected
                            ? 'w-full rounded-2xl border border-[hsl(var(--section-style-report-accent)/0.45)] bg-card px-4 py-3 text-left ring-1 ring-[hsl(var(--section-style-report-accent)/0.18)] transition-all'
                            : 'w-full rounded-2xl border border-border/50 bg-card px-4 py-3 text-left transition-all hover:border-[hsl(var(--section-style-report-accent)/0.45)] hover:shadow-sm'
                        }
                      >
                        <div className="flex items-start justify-between gap-4">
                          <div className="min-w-0">
                            <p className="text-sm font-semibold text-[hsl(var(--foreground))]">
                              {option.label}
                            </p>
                            <p className="mt-1 text-sm leading-6 text-[hsl(var(--muted-foreground))]">
                              {option.detail}
                            </p>
                            <p className="mt-2 text-sm leading-6 text-[hsl(var(--foreground))]">
                              {option.reportText}
                            </p>
                          </div>
                          {selected && (
                            <span className="shrink-0 rounded-full bg-[hsl(var(--section-style-report-accent))] px-2.5 py-0.5 text-[11px] font-semibold text-white">
                              Selected
                            </span>
                          )}
                        </div>
                      </button>
                    )
                  })}
                </div>
              </section>
            ))}
          </ModalBody>
        </ModalContent>
      </Modal>

      <Modal open={additionalValuesModalOpen} onOpenChange={setAdditionalValuesModalOpen}>
        <ModalContent
          size="lg"
          scrollable
          className="overflow-hidden border border-border bg-card"
        >
          <ModalHeader className="relative border-b border-border bg-card pr-14">
            <Row align="center" gap="md" wrap={false} className="house-page-title-row">
              <SectionMarker tone="report" size="title" className="self-stretch h-auto" />
              <div className="min-w-0">
                <ModalTitle className="text-[hsl(var(--foreground))]">Additional values</ModalTitle>
                <ModalDescription className="mt-1 text-[hsl(var(--muted-foreground))]">
                  Add measured quantitative values into the main CMR quantitative block.
                </ModalDescription>
              </div>
            </Row>
            <ModalClose />
          </ModalHeader>
          <ModalBody scrollable className="space-y-6">
            {availableAdditionalQuantParams.length > 0 ? (
              <div className="space-y-4">
                <input
                  type="search"
                  value={additionalValuesSearch}
                  onChange={(event) => setAdditionalValuesSearch(event.target.value)}
                  placeholder="Search values..."
                  className="house-input h-9 w-full rounded-xl px-3 text-sm"
                />
                {filteredAdditionalQuantParams.length > 0 ? (
                  <div className="overflow-hidden rounded-2xl border border-border/50 bg-card">
                    <div className="max-h-[28rem] overflow-y-auto">
                      {filteredAdditionalQuantParams.map((param, index) => {
                        const selected = output?.additionalQuantKeys?.includes(param.parameter_key) ?? false
                        const value = quantitativeMeasurementMap.get(param.parameter_key)
                        const dp = param.decimal_places ?? (param.unit === 'm/s' ? 1 : 0)
                        const formattedValue = formatNumeric(value, dp)
                        const unit = asciiUnit(param.unit)
                        return (
                          <label
                            key={param.parameter_key}
                            className={`flex cursor-pointer items-start gap-3 px-4 py-3 ${
                              index > 0 ? 'border-t border-border/40' : ''
                            } ${selected ? 'bg-[hsl(var(--section-style-report-accent)/0.06)]' : 'bg-card'}`}
                          >
                            <input
                              type="checkbox"
                              checked={selected}
                              onChange={() => handleToggleAdditionalQuantKey(param.parameter_key)}
                              className="mt-0.5 h-4 w-4 rounded border-border/70 text-[hsl(var(--section-style-report-accent))]"
                            />
                            <div className="min-w-0 flex-1">
                              <div className="flex items-start justify-between gap-4">
                                <div className="min-w-0">
                                  <p className="text-sm font-semibold text-[hsl(var(--foreground))]">
                                    {param.parameter_key}
                                  </p>
                                  <p className="mt-1 text-xs uppercase tracking-[0.14em] text-[hsl(var(--muted-foreground))]">
                                    {param.major_section} / {param.sub_section}
                                  </p>
                                </div>
                                <p className="shrink-0 text-sm font-medium text-[hsl(var(--foreground))]">
                                  {formattedValue}{unit ? ` ${unit}` : ''}
                                </p>
                              </div>
                            </div>
                          </label>
                        )
                      })}
                    </div>
                  </div>
                ) : (
                  <p className="text-sm leading-6 text-[hsl(var(--muted-foreground))]">
                    No measured values match that search.
                  </p>
                )}
              </div>
            ) : (
              <p className="text-sm leading-6 text-[hsl(var(--muted-foreground))]">
                No additional measured values are currently available outside the default report set.
              </p>
            )}
          </ModalBody>
        </ModalContent>
      </Modal>

      <Modal open={valveModalOpen} onOpenChange={setValveModalOpen}>
        <ModalContent
          size="lg"
          scrollable
          className="overflow-hidden border border-border bg-card"
        >
          <ModalHeader className="relative border-b border-border bg-card pr-14">
            <Row align="center" gap="md" wrap={false} className="house-page-title-row">
              <SectionMarker tone="report" size="title" className="self-stretch h-auto" />
              <div className="min-w-0">
                <ModalTitle className="text-[hsl(var(--foreground))]">Valves</ModalTitle>
              </div>
            </Row>
            <ModalClose />
          </ModalHeader>
          <ModalBody scrollable className="space-y-6">
            <div className="space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <p className="text-sm leading-6 text-[hsl(var(--muted-foreground))]">
                  Choose which valve sections to roll into the report output.
                </p>
                <div className="flex flex-wrap gap-2">
                  <Button
                    type="button"
                    variant="tertiary"
                    className="rounded-full px-4"
                    onClick={handleSelectAllValves}
                  >
                    Select all
                  </Button>
                  <Button
                    type="button"
                    variant="tertiary"
                    className="rounded-full px-4"
                    onClick={handleClearValveSelection}
                  >
                    Clear
                  </Button>
                </div>
              </div>

              <div className="overflow-hidden rounded-2xl border border-border/50 bg-card">
                {valveSummaryState.items.map((item, index) => {
                  const selected = selectedValveKeys.includes(item.key)
                  return (
                    <label
                      key={item.key}
                      className={`flex cursor-pointer items-start gap-3 px-4 py-4 ${
                        index > 0 ? 'border-t border-border/40' : ''
                      } ${selected ? 'bg-[hsl(var(--section-style-report-accent)/0.06)]' : 'bg-card'}`}
                    >
                      <input
                        type="checkbox"
                        checked={selected}
                        onChange={() => handleToggleValveSelection(item.key)}
                        className="mt-0.5 h-4 w-4 rounded border-border/70 text-[hsl(var(--section-style-report-accent))]"
                      />
                      <div className="min-w-0 flex-1">
                        <div className="flex items-start justify-between gap-4">
                          <div className="min-w-0">
                            <p className="text-sm font-semibold text-[hsl(var(--foreground))]">
                              {item.label}
                            </p>
                            <p className="mt-2 text-sm leading-6 text-[hsl(var(--foreground))]">
                              {item.displayText}
                            </p>
                          </div>
                          <div className="flex shrink-0 flex-col items-end gap-2">
                            <span
                              className={
                                selected
                                  ? 'rounded-full bg-[hsl(var(--section-style-report-accent))] px-2.5 py-0.5 text-[11px] font-semibold text-white'
                                  : 'rounded-full border border-border/60 px-2.5 py-0.5 text-[11px] font-semibold text-[hsl(var(--muted-foreground))]'
                              }
                            >
                              {selected ? 'Selected' : 'Not selected'}
                            </span>
                            {item.isStale && (
                              <span className="rounded-full border border-[hsl(var(--tone-warning-300))] bg-[hsl(var(--tone-warning-50))] px-2.5 py-0.5 text-[11px] font-semibold text-[hsl(var(--tone-warning-700))]">
                                Stale
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                    </label>
                  )
                })}
              </div>

              <div className="rounded-2xl border border-border/50 bg-card px-4 py-4">
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0">
                    <p className="text-xs uppercase tracking-[0.14em] text-[hsl(var(--muted-foreground))]">
                      Overall valves section
                    </p>
                    <p className="mt-2 text-sm leading-6 text-[hsl(var(--foreground))]">
                      {selectedValveKeys.length > 0
                        ? (valveSummaryState.previewText ?? 'No significant valve abnormality from the selected valves.')
                        : 'Select one or more valves to build the combined valves section.'}
                    </p>
                    <p className="mt-3 text-xs leading-5 text-[hsl(var(--muted-foreground))]">
                      AI prose still comes from the valves module per valve. This preview combines the selected valve outputs for the report.
                    </p>
                  </div>
                  <div className="flex shrink-0 flex-col items-end gap-2">
                    <span className="rounded-full border border-border/60 px-2.5 py-0.5 text-[11px] font-semibold text-[hsl(var(--muted-foreground))]">
                      {selectedValveLabel}
                    </span>
                    {selectedValveKeys.length > 0 && (
                      <span
                        className={
                          valveSummaryState.isStale
                            ? 'rounded-full border border-[hsl(var(--tone-warning-300))] bg-[hsl(var(--tone-warning-50))] px-2.5 py-0.5 text-[11px] font-semibold text-[hsl(var(--tone-warning-700))]'
                            : 'rounded-full border border-[hsl(var(--tone-positive-300))] bg-[hsl(var(--tone-positive-50))] px-2.5 py-0.5 text-[11px] font-semibold text-[hsl(var(--tone-positive-700))]'
                        }
                      >
                        {valveSummaryState.isStale ? 'Stale' : 'Current'}
                      </span>
                    )}
                    <span
                      className={
                        output?.includeValveAssessment
                          ? 'rounded-full bg-[hsl(var(--section-style-report-accent))] px-2.5 py-0.5 text-[11px] font-semibold text-white'
                          : 'rounded-full border border-border/60 px-2.5 py-0.5 text-[11px] font-semibold text-[hsl(var(--muted-foreground))]'
                      }
                    >
                      {output?.includeValveAssessment ? 'Added' : 'Not added'}
                    </span>
                  </div>
                </div>
              </div>

              <div className="flex flex-wrap gap-2">
                <Button
                  type="button"
                  variant="tertiary"
                  className="rounded-full px-4"
                  onClick={() => handleSetIncludeValveAssessment(true)}
                  disabled={selectedValveKeys.length === 0}
                >
                  Add selected to report
                </Button>
                <Button
                  type="button"
                  variant="tertiary"
                  className="rounded-full px-4"
                  onClick={handleOpenValvesModule}
                >
                  Open valves module
                </Button>
                {output?.includeValveAssessment && (
                  <Button
                    type="button"
                    variant="tertiary"
                    className="rounded-full border-[hsl(var(--tone-danger-300))] px-4 text-[hsl(var(--tone-danger-700))] hover:bg-[hsl(var(--tone-danger-50))]"
                    onClick={() => handleSetIncludeValveAssessment(false)}
                  >
                    Remove
                  </Button>
                )}
              </div>
            </div>
          </ModalBody>
        </ModalContent>
      </Modal>

      <Modal open={phModalOpen} onOpenChange={setPhModalOpen}>
        <ModalContent
          size="lg"
          scrollable
          className="overflow-hidden border border-border bg-card"
        >
          <ModalHeader className="relative border-b border-border bg-card pr-14">
            <Row align="center" gap="md" wrap={false} className="house-page-title-row">
              <SectionMarker tone="report" size="title" className="self-stretch h-auto" />
              <div className="min-w-0">
                <ModalTitle className="text-[hsl(var(--foreground))]">PH module</ModalTitle>
              </div>
            </Row>
            <ModalClose />
          </ModalHeader>
          <ModalBody scrollable className="space-y-6">
            <div className="rounded-2xl border border-border/50 bg-card px-4 py-4">
              {phSummaryState.previewText ? (
                <div className="space-y-4">
                  <div className="flex items-start justify-between gap-4">
                    <p className="text-sm leading-6 text-[hsl(var(--foreground))]">
                      {phSummaryState.previewText}
                    </p>
                    <div className="flex shrink-0 flex-col items-end gap-2">
                      <span
                        className={
                          !phSummaryState.hasGeneratedText
                            ? 'rounded-full border border-border/60 bg-[hsl(var(--tone-neutral-50))] px-2.5 py-0.5 text-[11px] font-semibold text-[hsl(var(--muted-foreground))]'
                            : phSummaryState.isStale
                            ? 'rounded-full border border-[hsl(var(--tone-warning-300))] bg-[hsl(var(--tone-warning-50))] px-2.5 py-0.5 text-[11px] font-semibold text-[hsl(var(--tone-warning-700))]'
                            : 'rounded-full border border-[hsl(var(--tone-positive-300))] bg-[hsl(var(--tone-positive-50))] px-2.5 py-0.5 text-[11px] font-semibold text-[hsl(var(--tone-positive-700))]'
                        }
                      >
                        {!phSummaryState.hasGeneratedText ? 'Deterministic' : phSummaryState.isStale ? 'Stale' : 'Current'}
                      </span>
                      <span
                        className={
                          output?.includePhAssessment
                            ? 'rounded-full bg-[hsl(var(--section-style-report-accent))] px-2.5 py-0.5 text-[11px] font-semibold text-white'
                            : 'rounded-full border border-border/60 px-2.5 py-0.5 text-[11px] font-semibold text-[hsl(var(--muted-foreground))]'
                        }
                      >
                        {output?.includePhAssessment ? 'Added' : 'Not added'}
                      </span>
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Button
                      type="button"
                      variant="tertiary"
                      className="rounded-full px-4"
                      onClick={() => handleSetIncludePhAssessment(true)}
                    >
                      Add to report
                    </Button>
                    <Button
                      type="button"
                      variant="tertiary"
                      className="rounded-full px-4"
                      onClick={handleOpenPhModule}
                    >
                      Open PH module
                    </Button>
                    {output?.includePhAssessment && (
                      <Button
                        type="button"
                        variant="tertiary"
                        className="rounded-full border-[hsl(var(--tone-danger-300))] px-4 text-[hsl(var(--tone-danger-700))] hover:bg-[hsl(var(--tone-danger-50))]"
                        onClick={() => handleSetIncludePhAssessment(false)}
                      >
                        Remove
                      </Button>
                    )}
                  </div>
                </div>
              ) : (
                <div className="space-y-3">
                  <p className="text-sm leading-6 text-[hsl(var(--muted-foreground))]">
                    No PH summary has been generated yet. Generate it in the PH module first if you want to include it in the report.
                  </p>
                  <div className="flex flex-wrap gap-2">
                    <Button
                      type="button"
                      variant="tertiary"
                      className="rounded-full px-4"
                      onClick={handleOpenPhModule}
                    >
                      Open PH module
                    </Button>
                    {output?.includePhAssessment && (
                      <Button
                        type="button"
                        variant="tertiary"
                        className="rounded-full border-[hsl(var(--tone-danger-300))] px-4 text-[hsl(var(--tone-danger-700))] hover:bg-[hsl(var(--tone-danger-50))]"
                        onClick={() => handleSetIncludePhAssessment(false)}
                      >
                        Remove from report
                      </Button>
                    )}
                  </div>
                </div>
              )}
            </div>
          </ModalBody>
        </ModalContent>
      </Modal>

      <Modal open={lessonsModalOpen} onOpenChange={setLessonsModalOpen}>
        <ModalContent
          size="lg"
          className="flex h-[min(88vh,940px)] max-w-[min(1120px,calc(100vw-2rem))] flex-col overflow-hidden border border-border bg-card"
        >
          <ModalHeader className="relative border-b border-border bg-card pr-14">
            <Row align="center" gap="md" wrap={false} className="house-page-title-row">
              <SectionMarker tone="report" size="title" className="self-stretch h-auto" />
              <div className="min-w-0">
                <ModalTitle className="text-[hsl(var(--foreground))]">Lessons from the case</ModalTitle>
              </div>
            </Row>
            <ModalClose />
          </ModalHeader>
          <ModalBody className="flex min-h-0 flex-1 flex-col" style={{ padding: 0 }}>
            <div className="flex flex-wrap gap-2 border-b border-border/60 px-6 py-5">
              {LESSONS_TAB_OPTIONS.map((option) => {
                const selected = option.key === selectedLessonsTab
                return (
                  <Button
                    key={option.key}
                    type="button"
                    variant="tertiary"
                    className={
                      selected
                        ? 'rounded-full border-[hsl(var(--section-style-report-accent))] bg-[hsl(var(--section-style-report-accent)/0.08)] px-4 text-[hsl(var(--section-style-report-accent))]'
                        : 'rounded-full px-4'
                    }
                    onClick={() => {
                      setSelectedLessonsTab(option.key)
                      setLessonsGenerationError(null)
                      setCaseQuestionError(null)
                    }}
                  >
                    {option.label}
                  </Button>
                )
              })}
            </div>
            {selectedLessonsTab === 'ask-the-case' ? (
              <div className="flex min-h-0 flex-1 flex-col">
                <div
                  ref={caseQaScrollRef}
                  onScroll={handleCaseQaScroll}
                  className="min-h-0 flex-1 overflow-y-auto bg-[hsl(var(--tone-neutral-50))] px-6 py-6"
                >
                  {caseQaConversation.length > 0 ? (
                    <div className="space-y-3">
                      {caseQaConversation.map((message, index) => (
                        <div
                          key={`${message.role}-${index}`}
                          className={message.role === 'user' ? 'flex justify-end' : 'flex justify-start'}
                        >
                          <div
                            className={
                              message.role === 'user'
                                ? 'max-w-[78%] rounded-[20px] bg-[hsl(var(--section-style-report-accent))] px-4 py-3 text-sm leading-6 text-white'
                                : 'max-w-[78%] rounded-[20px] border border-border/60 bg-white px-4 py-3 text-sm leading-6 text-[hsl(var(--foreground))]'
                            }
                          >
                            <p className="whitespace-pre-wrap">{message.content}</p>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-sm leading-6 text-[hsl(var(--muted-foreground))]">
                      Ask a case-specific question to start a teaching thread.
                    </p>
                  )}
                </div>
                <div className="shrink-0 border-t border-border/60 bg-white px-6 py-5">
                  {caseQuestionError ? (
                    <p className="mb-3 text-sm leading-6 text-[hsl(var(--tone-danger-700))]">
                      {caseQuestionError}
                    </p>
                  ) : null}
                  <div className="space-y-3">
                    <Textarea
                      value={caseQuestionInput}
                      onChange={(event) => setCaseQuestionInput(event.target.value)}
                      onKeyDown={(event) => {
                        if (event.key === 'Enter' && !event.shiftKey) {
                          event.preventDefault()
                          void handleAskTheCase()
                        }
                      }}
                      placeholder="Ask about the pattern, the synthesis, or why the findings fit together the way they do."
                      className="min-h-[110px] rounded-[22px] border-border/60 bg-white"
                    />
                    <div className="flex flex-wrap gap-2">
                      <Button
                        type="button"
                        variant="tertiary"
                        className="rounded-full px-4"
                        onClick={() => { void handleAskTheCase() }}
                        disabled={isAnsweringCaseQuestion || caseQuestionInput.trim().length === 0}
                      >
                        {isAnsweringCaseQuestion ? 'Thinking...' : 'Ask'}
                      </Button>
                      {caseQaConversation.length > 0 ? (
                        <Button
                          type="button"
                          variant="tertiary"
                          className="rounded-full border-[hsl(var(--tone-danger-300))] px-4 text-[hsl(var(--tone-danger-700))] hover:bg-[hsl(var(--tone-danger-50))]"
                          onClick={handleClearCaseQaConversation}
                          disabled={isAnsweringCaseQuestion}
                        >
                          Clear thread
                        </Button>
                      ) : null}
                    </div>
                  </div>
                </div>
              </div>
            ) : (
              <div className="flex min-h-0 flex-1 flex-col bg-[hsl(var(--tone-neutral-50))]">
                <div className="min-h-0 flex-1 overflow-y-auto px-6 py-6">
                  <div className="rounded-[24px] border border-border/60 bg-white px-5 py-5">
                    {selectedCaseLessonsState.previewText ? (
                      <div className="space-y-5 text-[15px] leading-7 text-[hsl(var(--foreground))]">
                        {selectedCaseLessonsBlocks.map((block, index) => {
                          if (block.kind === 'heading') {
                            return (
                              <p
                                key={index}
                                className="text-[12px] font-semibold uppercase tracking-[0.16em] text-[hsl(var(--muted-foreground))]"
                              >
                                {block.text}
                              </p>
                            )
                          }

                          if (block.kind === 'unordered-list') {
                            return (
                              <ul key={index} className="space-y-2 pl-5">
                                {block.items.map((item, itemIndex) => (
                                  <li key={itemIndex} className="list-disc">
                                    {renderLessonsInlineText(item)}
                                  </li>
                                ))}
                              </ul>
                            )
                          }

                          if (block.kind === 'ordered-list') {
                            return (
                              <ol key={index} className="space-y-2 pl-5">
                                {block.items.map((item, itemIndex) => (
                                  <li key={itemIndex} className="list-decimal">
                                    {renderLessonsInlineText(item)}
                                  </li>
                                ))}
                              </ol>
                            )
                          }

                          return (
                            <p key={index} className="whitespace-pre-wrap">
                              {renderLessonsInlineText(block.text)}
                            </p>
                          )
                        })}
                      </div>
                    ) : (
                      <p className="text-sm leading-6 text-[hsl(var(--muted-foreground))]">
                        No teaching note available.
                      </p>
                    )}
                  </div>
                </div>
                <div className="shrink-0 border-t border-border/60 bg-white px-6 py-5">
                  {lessonsGenerationError ? (
                    <p className="mb-3 text-sm leading-6 text-[hsl(var(--tone-danger-700))]">
                      {lessonsGenerationError}
                    </p>
                  ) : null}
                  <div className="flex flex-wrap gap-2">
                    <Button
                      type="button"
                      variant="tertiary"
                      className="rounded-full px-4"
                      onClick={() => { void handleGenerateCaseLessons() }}
                      disabled={isGeneratingLessons}
                    >
                      {isGeneratingLessons ? 'Generating...' : selectedCaseLessonsState.previewText ? 'Regenerate' : 'Generate'}
                    </Button>
                  </div>
                </div>
              </div>
            )}
          </ModalBody>
        </ModalContent>
      </Modal>
    </Stack>
  )
}
