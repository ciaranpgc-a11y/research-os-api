import { Fragment, useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react'
import { ExternalLink, Hospital } from 'lucide-react'

import { PageHeader, Row, Stack, DrilldownSheet } from '@/components/primitives'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import { SectionMarker } from '@/components/patterns'
import type { CmrCanonicalParam, CmrCanonicalTableResponse, PapillaryMode } from '@/lib/cmr-api'
import { fetchConfig, fetchReferenceParameters, updateConfig } from '@/lib/cmr-api'
import { getExtractionResult, setExtractionDemographics, setExtractionMeasurement, subscribeExtractionResult } from '@/lib/cmr-report-store'
import {
  addPreviousStudy,
  getPreviousStudies,
  isPreviousVisible,
  subscribePreviousStudies,
  togglePreviousVisible,
  mapEchoToCmr,
  mapCmrToCmr,
  nextStudyId,
} from '@/lib/cmr-previous-study'
import { cn } from '@/lib/utils'
import { computeSeverity, inferSeverityLabel, type SeverityLabelType, type SeverityResult } from '@/lib/cmr-severity'
import {
  type RangeParam,
  factoryBaseline,
  hasValidRange,
  computeMeasuredRel,
  computeMeasuredPos,
  isAbnormal as isAbnormalValue,
  globalAutoAdjust,
  perMeasurementAutoAdjust,
  constrainRange,
} from '@/lib/cmr-chart-scaling'
import { getValveFlowCalculation, populateIndexedMeasurements } from '@/lib/cmr-flow-measurements'
import { rangeParamMapToRecord, rangeParamRecordToMap } from '@/lib/cmr-case-defaults'
import { useCmrCaseStore } from '@/store/use-cmr-case-store'
import {
  applyCmrReferencePreset,
  isCmrReferencePresetAppliedToParameter,
  normalizeCmrReferencePreset,
  type CmrReferencePreset,
} from '@/lib/cmr-reference-presets'

// ---------------------------------------------------------------------------
// Helpers (shared with reference table)
// ---------------------------------------------------------------------------

type GroupedSection = { major: string; sub: string; params: CmrCanonicalParam[] }

function groupBySections(params: CmrCanonicalParam[]): GroupedSection[] {
  const groups: GroupedSection[] = []
  let current: GroupedSection | null = null
  for (const p of params) {
    const key = `${p.major_section}||${p.sub_section}`
    if (!current || `${current.major}||${current.sub}` !== key) {
      current = { major: p.major_section, sub: p.sub_section, params: [] }
      groups.push(current)
    }
    current.params.push(p)
  }
  return groups
}

function displayName(key: string, isNested?: boolean): string {
  let name = key.replace(/\s*\(i\)\s*$/, '')
  // Strip "(per heartbeat)" from parent rows — nested children keep their qualifier
  if (!isNested) name = name.replace(/\s*\(per heartbeat\)\s*$/, '')
  // Expand valve abbreviations to full names
  name = name
    .replace(/^AV /, 'Aortic ')
    .replace(/^PV /, 'Pulmonary ')
    .replace(/^MV /, 'Mitral ')
    .replace(/^MR regurgitant /, 'Mitral regurgitant ')
    .replace(/^MR volume/, 'Mitral regurgitant volume')
    .replace(/^TR regurgitant /, 'Tricuspid regurgitant ')
    .replace(/^TR volume/, 'Tricuspid regurgitant volume')
  return name
}

/** Format a row of numeric values to a fixed number of decimal places. */
function fmtRow(values: (number | null)[], dp: number = 0): string[] {
  return values.map((v) => {
    if (v === null) return '\u2014'
    return v.toFixed(dp)
  })
}

/** Parameters whose measured value should be shown as absolute (magnitude only). */
const ABS_VALUE_PARAMS = new Set([
  'AV backward flow',
  'AV backward flow (per heartbeat)',
  'AV backward flow (per minute)',
  'PV backward flow',
  'PV backward flow (per heartbeat)',
  'PV backward flow (per minute)',
])

const AUTO_SYNCED_FLOW_PARAMS = [
  'AV effective forward flow (per heartbeat)',
  'AV regurgitant fraction',
  'PV effective forward flow (per heartbeat)',
  'PV regurgitant fraction',
  'MR volume (per heartbeat)',
  'MR regurgitant fraction',
  'TR volume (per heartbeat)',
  'TR regurgitant fraction',
] as const

const ALWAYS_RECALCULATED_FLOW_PARAMS = new Set<string>([
  'AV effective forward flow (per heartbeat)',
  'AV regurgitant fraction',
  'PV effective forward flow (per heartbeat)',
  'PV regurgitant fraction',
])

function sentenceCase(s: string): string {
  const lower = s.toLowerCase()
  return lower.charAt(0).toUpperCase() + lower.slice(1)
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
  bsa?: number
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
  heartRate?: number
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
  bsa?: number
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
  efKeys,
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
  efKeys?: readonly string[]
  indexedEdvKeys?: readonly string[]
  indexedEsvKeys?: readonly string[]
  coKeys?: readonly string[]
  bsa?: number
  heartRate?: number
}): number | undefined {
  const directValue = getMeasurementWithIndexedFallback({ measurements, directKeys, indexedKeys, bsa })
  if (directValue !== undefined) return directValue

  const edv = edvKeys ? getFirstMeasurement(measurements, edvKeys) : undefined
  const esv = esvKeys ? getFirstMeasurement(measurements, esvKeys) : undefined
  if (edv !== undefined && esv !== undefined) return edv - esv

  const ef = efKeys ? getFirstMeasurement(measurements, efKeys) : undefined
  if (ef !== undefined && ef > 0 && ef < 100) {
    if (edv !== undefined) return (edv * ef) / 100
    if (esv !== undefined) return (esv * ef) / (100 - ef)
  }

  if (bsa != null && Number.isFinite(bsa) && bsa > 0 && indexedEdvKeys?.length && indexedEsvKeys?.length) {
    const indexedEdv = getFirstMeasurement(measurements, indexedEdvKeys)
    const indexedEsv = getFirstMeasurement(measurements, indexedEsvKeys)
    if (indexedEdv !== undefined && indexedEsv !== undefined) return (indexedEdv - indexedEsv) * bsa
    if (ef !== undefined && ef > 0 && ef < 100) {
      if (indexedEdv !== undefined) return ((indexedEdv * ef) / 100) * bsa
      if (indexedEsv !== undefined) return ((indexedEsv * ef) / (100 - ef)) * bsa
    }
  }

  return coKeys?.length
    ? getMeasurementWithRateFallback({ measurements, perBeatKeys: directKeys, perMinuteKeys: coKeys, heartRate })
    : undefined
}

// ---------------------------------------------------------------------------
// Nested parameter helpers — derived from `nested_under` in reference data
// ---------------------------------------------------------------------------

/** Build a parent→children[] map from the data's nested_under field. */
function buildNestedParamMap(params: CmrCanonicalParam[]): Record<string, string[]> {
  const map: Record<string, string[]> = {}
  for (const p of params) {
    if (p.nested_under) {
      if (!map[p.nested_under]) map[p.nested_under] = []
      map[p.nested_under].push(p.parameter_key)
    }
  }
  return map
}

/** Build a set of all child keys from the nested map. */
function buildNestedChildrenSet(nestedMap: Record<string, string[]>): Set<string> {
  return new Set(Object.values(nestedMap).flat())
}

// ---------------------------------------------------------------------------
// Reusable pill toggle
// ---------------------------------------------------------------------------

function CmrTooltip({ text, children }: { text: string; children: React.ReactNode }) {
  return (
    <span className="group/tip relative inline-flex">
      {children}
      <span className="pointer-events-none absolute left-1/2 -translate-x-1/2 bottom-full mb-2 z-50 whitespace-nowrap rounded-md bg-[hsl(var(--foreground))] px-2.5 py-1.5 text-[11px] font-medium text-white opacity-0 shadow-lg transition-opacity duration-150 group-hover/tip:opacity-100">
        {text}
        <span className="absolute left-1/2 -translate-x-1/2 -bottom-1 h-2 w-2 rotate-45 bg-[hsl(var(--foreground))]" />
      </span>
    </span>
  )
}

function PillToggle({ options, value, onChange, compact }: {
  options: { key: string; label: React.ReactNode; tooltip?: string }[]
  value: string
  onChange: (key: string) => void
  compact?: boolean
}) {
  return (
    <div className="flex rounded-full bg-[hsl(var(--tone-danger-100)/0.5)] p-0.5 ring-1 ring-[hsl(var(--tone-danger-200)/0.5)]">
      {options.map((o) => {
        const btn = (
          <button
            key={o.key}
            type="button"
            onClick={() => onChange(o.key)}
            className={cn(
              'rounded-full py-1.5 text-xs font-medium transition-all flex items-center gap-1',
              compact ? 'px-2.5' : 'px-4',
              value === o.key
                ? 'bg-[hsl(var(--section-style-report-accent))] text-white shadow-sm'
                : 'text-[hsl(var(--tone-danger-600))] hover:text-[hsl(var(--tone-danger-800))]',
            )}
          >
            {o.label}
          </button>
        )
        return o.tooltip ? <CmrTooltip key={o.key} text={o.tooltip}>{btn}</CmrTooltip> : btn
      })}
    </div>
  )
}

/** Bar-chart icon */
function ChartIcon({ className }: { className?: string }) {
  return (
    <svg className={cn('h-3.5 w-3.5', className)} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <rect x="1" y="8" width="3" height="7" rx="0.5" />
      <rect x="6.5" y="4" width="3" height="11" rx="0.5" />
      <rect x="12" y="1" width="3" height="14" rx="0.5" />
    </svg>
  )
}

/** "123" label — represents rows with recorded numeric values */
function RecordedIcon() {
  return <span className="text-[10px] font-bold tabular-nums tracking-tight">123</span>
}

/** "BSA" label — represents indexed-only view */
function BsaIcon() {
  return <span className="text-[10px] font-semibold tracking-wide">BSA</span>
}

/** "BSA" with strikethrough — represents all (absolute + indexed) view */
function BsaOffIcon() {
  return <span className="relative text-[10px] font-semibold tracking-wide opacity-60">BSA<span className="absolute inset-0 flex items-center"><span className="block w-full h-[1.5px] bg-current rotate-[-20deg]" /></span></span>
}

/** Three equal-length horizontal lines — represents all rows */
function AllRowsIcon({ className }: { className?: string }) {
  return (
    <svg className={cn('h-3.5 w-3.5', className)} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
      <line x1="1" y1="4" x2="15" y2="4" />
      <line x1="1" y1="8" x2="15" y2="8" />
      <line x1="1" y1="12" x2="15" y2="12" />
    </svg>
  )
}

/** Traffic-light severity icon — three coloured dots (green/amber/red) */
function SeverityIcon({ className }: { className?: string }) {
  return (
    <svg className={cn('h-3.5 w-3.5', className)} viewBox="0 0 16 16" fill="currentColor">
      <circle cx="3.5" cy="3.5" r="3" fill="hsl(158 30% 50%)" />
      <circle cx="12.5" cy="3.5" r="3" fill="hsl(38 60% 55%)" />
      <circle cx="8" cy="12" r="3" fill="hsl(4 55% 50%)" />
    </svg>
  )
}

/** Traffic-light severity icon with a diagonal strike-through */
function SeverityOffIcon({ className }: { className?: string }) {
  return (
    <svg className={cn('h-3.5 w-3.5', className)} viewBox="0 0 16 16" fill="currentColor" stroke="currentColor">
      <circle cx="3.5" cy="3.5" r="3" fill="hsl(158 30% 50%)" opacity="0.35" />
      <circle cx="12.5" cy="3.5" r="3" fill="hsl(38 60% 55%)" opacity="0.35" />
      <circle cx="8" cy="12" r="3" fill="hsl(4 55% 50%)" opacity="0.35" />
      <line x1="1" y1="1" x2="15" y2="15" strokeWidth="2" strokeLinecap="round" />
    </svg>
  )
}

/** Bar-chart icon with a diagonal strike-through */
function ChartOffIcon({ className }: { className?: string }) {
  return (
    <svg className={cn('h-3.5 w-3.5', className)} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <rect x="1" y="8" width="3" height="7" rx="0.5" opacity="0.4" />
      <rect x="6.5" y="4" width="3" height="11" rx="0.5" opacity="0.4" />
      <rect x="12" y="1" width="3" height="14" rx="0.5" opacity="0.4" />
      <line x1="2" y1="2" x2="14" y2="14" strokeWidth="2" />
    </svg>
  )
}

// ---------------------------------------------------------------------------
// Small components
// ---------------------------------------------------------------------------

function BsaPill() {
  return (
    <span className="ml-1.5 inline-flex items-center rounded-full bg-[hsl(var(--tone-neutral-200))] px-[7px] py-[1px] text-[10px] font-semibold tracking-wide text-[hsl(var(--tone-neutral-600))]">
      BSA
    </span>
  )
}

function NnuhPresetMarker() {
  return (
    <span
      aria-label="NNUH preset reference range"
      className="ml-1.5 inline-flex h-4 w-4 items-center justify-center rounded-full bg-[hsl(var(--tone-danger-100))] text-[hsl(var(--tone-danger-700))]"
      title="Reference range from NNUH preset"
    >
      <Hospital className="h-3 w-3" strokeWidth={2} />
    </span>
  )
}

function DirectionIndicator({ dir }: { dir: string }) {
  if (dir === 'high')
    return <span className="text-[hsl(var(--tone-danger-500))]" title="Abnormal if high">&#9650;</span>
  if (dir === 'low')
    return <span className="text-[hsl(var(--tone-accent-500))]" title="Abnormal if low">&#9660;</span>
  if (dir === 'both')
    return <span className="text-[hsl(var(--tone-warning-500))]" title="Abnormal if high or low">&#9670;</span>
  return null
}

function ChevronIcon({ open }: { open: boolean }) {
  return (
    <svg
      className={cn('h-3.5 w-3.5 shrink-0 text-[hsl(var(--muted-foreground))] transition-transform duration-150', open && 'rotate-90')}
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M6 4l4 4-4 4" />
    </svg>
  )
}

// ---------------------------------------------------------------------------
// Chart components
// ---------------------------------------------------------------------------

function ChartChipIcon({ variant }: { variant: 'global' | 'per-meas' }) {
  return (
    <svg width="16" height="12" viewBox="0 0 16 12" fill="none" className="shrink-0">
      <line x1="0" y1="6" x2="16" y2="6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeOpacity="0.4" />
      <circle cx={variant === 'global' ? 10 : 5} cy="6" r="3" fill="currentColor" />
    </svg>
  )
}

function ChartControlStrip({
  onGlobalAuto,
  onPerMeasAuto,
  scalingMode,
}: {
  onGlobalAuto: () => void
  onPerMeasAuto: () => void
  scalingMode: 'factory' | 'global' | 'per-meas'
}) {
  const chipClass = (active: boolean) =>
    cn(
      'inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1.5 text-[11px] font-medium transition-colors cursor-pointer',
      active
        ? 'border-[hsl(var(--section-style-report-accent))] bg-[hsl(var(--section-style-report-accent))] text-white'
        : 'border-[hsl(var(--stroke-soft)/0.5)] bg-white text-[hsl(var(--tone-neutral-600))] hover:bg-[hsl(var(--tone-neutral-100))]',
    )
  return (
    <div className="flex items-center gap-1">
      <button type="button" onClick={onGlobalAuto} className={chipClass(scalingMode === 'global')}>
        <ChartChipIcon variant="global" /> Global
      </button>
      <button type="button" onClick={onPerMeasAuto} className={chipClass(scalingMode === 'per-meas')}>
        <ChartChipIcon variant="per-meas" /> Per measurement
      </button>
    </div>
  )
}

type SevGrade = 'normal' | 'mild' | 'moderate' | 'severe'

const SEV_PILL_STYLES: Record<SevGrade, string> = {
  normal:   'bg-[hsl(162_22%_90%)] text-[hsl(164_30%_28%)] ring-1 ring-[hsl(163_22%_80%)]',
  mild:     'bg-[hsl(38_40%_90%)] text-[hsl(34_50%_35%)] ring-1 ring-[hsl(36_36%_80%)]',
  moderate: 'bg-[hsl(16_45%_86%)] text-[hsl(5_48%_32%)] ring-1 ring-[hsl(10_32%_76%)]',
  severe:   'bg-[hsl(2_52%_25%)] text-white ring-1 ring-[hsl(2_52%_20%)]',
}

/** HSL band colours for severity zones on range charts.
 *  Same hues as the table row severity colours, slightly more saturated
 *  for visual clarity at small sizes. */
const SEV_ZONE_COLORS: Record<SevGrade, string> = {
  normal:   'hsl(158 35% 82%)',
  mild:     'hsl(46 55% 80%)',
  moderate: 'hsl(20 50% 76%)',
  severe:   'hsl(4 50% 68%)',
}

type SeverityZone = { grade: SevGrade; threshold: number | null }


type PrevMarker = {
  value: number
  sourceType: string       // "CMR" or "Echo"
  date: string | null      // e.g. "17 Dec 2025"
  interval: string | null  // e.g. "3 months ago"
  prevLabel: string
  prevGrade: SevGrade
  currLabel: string | null
  currGrade: SevGrade | null
  prevVal: string
  currVal: string | null
  pctChange: number | null
  improved: boolean | null
}

/** Compute a human-readable interval between two date strings. */
function formatInterval(fromStr: string, toStr: string): string | null {
  const from = new Date(fromStr)
  const to = new Date(toStr)
  if (isNaN(from.getTime()) || isNaN(to.getTime())) return null
  const diffMs = to.getTime() - from.getTime()
  if (diffMs < 0) return null
  const days = Math.round(diffMs / 86400000)
  if (days === 0) return 'Same day'
  if (days === 1) return '1 day'
  if (days < 30) return `${days} days`
  const months = Math.round(days / 30.44)
  if (months === 1) return '1 month'
  if (months < 12) return `${months} months`
  const years = Math.round(days / 365.25)
  if (years === 1) return '1 year'
  return `${years} years`
}

/** For params with explicit severity thresholds, compute an effective UL that spans
 *  the full severity scale so the chart shows all zones. */
function effectiveUL(param: CmrCanonicalParam): number {
  const t = param.severity_thresholds
  if (!t || param.ul == null) return param.ul ?? 0
  const highest = t.severe ?? t.moderate ?? t.mild ?? param.ul
  if (highest == null) return param.ul
  return highest * 1.15
}

/** Check if a param has coloured severity zones (explicit thresholds only — valve params). */
function hasSevZones(param: CmrCanonicalParam): boolean {
  return !!param.severity_thresholds
}

/** Check if a param has SD-based severity tick marks (non-valve abnormal params). */
function hasSevTicks(param: CmrCanonicalParam, measured?: number): boolean {
  if (param.severity_thresholds) return false // valve params use coloured zones instead
  if (!param.sd || param.sd <= 0 || param.ll == null || param.ul == null) return false
  const dir = param.abnormal_direction
  if (dir === 'high' || dir === 'low') return true
  // For 'both': only show ticks if we know the breach direction from the measured value
  if (dir === 'both' && measured != null) {
    return measured > param.ul || measured < param.ll
  }
  return false
}

/** Compute SD-based severity tick positions (absolute values). */
function buildSeverityTicks(param: CmrCanonicalParam, grade?: string, measured?: number): number[] | undefined {
  if (!hasSevTicks(param, measured)) return undefined
  // Resolve effective direction: for 'both', determine from measured value
  let dir = param.abnormal_direction
  if (dir === 'both' && measured != null && param.ll != null && param.ul != null) {
    if (measured > param.ul) dir = 'high'
    else if (measured < param.ll) dir = 'low'
    else return undefined // within range, no ticks
  }
  let mildModBoundary: number | undefined
  let modSevBoundary: number | undefined
  if (dir === 'high' && param.ul != null && param.sd) {
    mildModBoundary = param.ul + param.sd
    modSevBoundary = param.ul + 2 * param.sd
  } else if (dir === 'low' && param.ll != null && param.sd) {
    mildModBoundary = param.ll - param.sd
    modSevBoundary = param.ll - 2 * param.sd
  } else {
    return undefined
  }
  // Filter based on severity grade:
  // Mild: show moderate boundary only (next threshold ahead)
  // Moderate: show both boundaries (either side)
  // Severe: show both boundaries behind (mild + moderate) for context
  if (grade === 'mild') return [modSevBoundary]
  if (grade === 'moderate') return [mildModBoundary, modSevBoundary]
  if (grade === 'severe') return [mildModBoundary, modSevBoundary]
  return undefined
}

/** Scaling for severity-zone charts: use 90% of bar width so zones are
 *  clearly visible and not squeezed into a small strip. */
const SEV_ZONE_SCALING = { rangeStart: 0.05, rangeWidth: 0.9 } as const

/** Compute SD tick positions as measuredRel values (for scaling).
 *  Always returns both boundaries (used for scaling, not display). */
function sdTickRels(param: CmrCanonicalParam, measured?: number): number[] | undefined {
  const ticks = buildSeverityTicks(param, 'moderate', measured)
  if (!ticks || param.ll == null || param.ul == null) return undefined
  const eul = hasSevZones(param) ? effectiveUL(param) : param.ul
  return ticks.map(t => computeMeasuredRel(t, param.ll!, eul))
}

/** Build severity zones from explicit thresholds only (valve params). */
function buildSeverityZones(param: CmrCanonicalParam): SeverityZone[] | undefined {
  const t = param.severity_thresholds
  if (!t) return undefined
  return [
    { grade: 'mild', threshold: t.mild },
    { grade: 'moderate', threshold: t.moderate },
    { grade: 'severe', threshold: t.severe },
  ]
}

function RangeChart({
  measured,
  ll,
  ul,
  originalUL,
  direction,
  rangeStart,
  rangeWidth,
  previousMarkers,
  severityZones,
  severityTicks,
  severityGrade,
}: {
  measured: number
  ll: number
  ul: number         // effective UL (may be expanded to cover severity thresholds)
  originalUL?: number // actual reference UL (normal zone boundary)
  direction: string
  rangeStart: number
  rangeWidth: number
  previousMarkers?: PrevMarker[]
  severityZones?: SeverityZone[]
  severityTicks?: number[]
  severityGrade?: SevGrade
}) {
  const measuredRel = computeMeasuredRel(measured, ll, ul)
  const measuredPos = computeMeasuredPos(measuredRel, rangeStart, rangeWidth)
  const abnormal = isAbnormalValue(measured, ll, ul, direction)

  const bandLeftPct = `${rangeStart * 100}%`
  const bandWidthPct = `${rangeWidth * 100}%`
  const dotPct = `${measuredPos * 100}%`

  // Build severity zone bands
  const zoneBands = severityZones ? (() => {
    const bands: Array<{ grade: SevGrade; leftPct: string; widthPct: string }> = []
    const isLowDir = direction === 'low'

    if (isLowDir) {
      // Low direction: severity zones extend LEFT from LL
      // Layout: [severe][moderate][mild][normal → 100%]
      const grades: SevGrade[] = ['severe', 'moderate', 'mild']
      let prevThreshold: number | null = null // start from left edge
      for (let i = 0; i < grades.length; i++) {
        const zone = severityZones.find((z) => z.grade === grades[i])
        if (!zone) continue
        const startPos = prevThreshold !== null
          ? computeMeasuredPos(computeMeasuredRel(prevThreshold, ll, ul), rangeStart, rangeWidth)
          : 0
        const endVal = zone.threshold ?? ll
        const endPos = computeMeasuredPos(computeMeasuredRel(endVal, ll, ul), rangeStart, rangeWidth)
        bands.push({ grade: grades[i], leftPct: `${startPos * 100}%`, widthPct: `${Math.max(0, endPos - startPos) * 100}%` })
        prevThreshold = endVal
      }
      // Normal zone: from LL position to 100%
      const refLL = originalUL ?? ll // originalUL stores the original LL for low-direction
      const normalStartRel = computeMeasuredRel(refLL, ll, ul)
      const normalStartPos = computeMeasuredPos(normalStartRel, rangeStart, rangeWidth)
      bands.push({ grade: 'normal', leftPct: `${normalStartPos * 100}%`, widthPct: `${(1 - normalStartPos) * 100}%` })
    } else {
      // High direction: severity zones extend RIGHT from UL
      const refUL = originalUL ?? ul
      // Normal zone: from 0% to UL
      const normalEndRel = computeMeasuredRel(refUL, ll, ul)
      const normalEndPos = computeMeasuredPos(normalEndRel, rangeStart, rangeWidth)
      bands.push({ grade: 'normal', leftPct: '0%', widthPct: `${normalEndPos * 100}%` })
      // Severity zones
      const grades: SevGrade[] = ['mild', 'moderate', 'severe']
      let prevThreshold = refUL
      for (let i = 0; i < grades.length; i++) {
        const zone = severityZones.find((z) => z.grade === grades[i])
        if (!zone) continue
        const startRel = computeMeasuredRel(prevThreshold, ll, ul)
        const startPos = computeMeasuredPos(startRel, rangeStart, rangeWidth)
        const isLastZone = i === grades.length - 1 || !severityZones.find((z) => z.grade === grades[i + 1])
        if (isLastZone) {
          bands.push({ grade: grades[i], leftPct: `${startPos * 100}%`, widthPct: `${(1 - startPos) * 100}%` })
        } else {
          const endVal = zone.threshold ?? ul
          const endRel = computeMeasuredRel(endVal, ll, ul)
          const endPos = computeMeasuredPos(endRel, rangeStart, rangeWidth)
          bands.push({ grade: grades[i], leftPct: `${startPos * 100}%`, widthPct: `${Math.max(0, endPos - startPos) * 100}%` })
          prevThreshold = endVal
        }
      }
    }
    return bands
  })() : null

  return (
    <TooltipProvider delayDuration={0}>
      <div className="group/chart relative mx-[5px] h-[22px] w-[calc(100%-10px)]">
        {/* Background track */}
        <div className="absolute inset-x-0 top-1/2 h-[2px] -translate-y-1/2 rounded-sm bg-[hsl(var(--tone-neutral-300))]" />
        {zoneBands ? (
          /* Severity zone bands */
          <>
            {zoneBands.map((b) => (
              <div
                key={b.grade}
                className="absolute top-1/2 h-4 -translate-y-1/2 transition-all duration-200"
                style={{ left: b.leftPct, width: b.widthPct, backgroundColor: SEV_ZONE_COLORS[b.grade] }}
              />
            ))}
            {/* Thin dividers between zones */}
            {zoneBands.slice(1).map((b) => (
              <div
                key={`div-${b.grade}`}
                className="absolute top-1/2 h-4 w-px -translate-y-1/2 bg-white/70"
                style={{ left: b.leftPct }}
              />
            ))}
          </>
        ) : (
          /* Standard frosted band */
          <div
            className="absolute top-1/2 h-4 -translate-y-1/2 rounded border border-[hsl(var(--tone-positive-300)/0.18)] bg-[hsl(var(--tone-positive-300)/0.14)] transition-all duration-200 group-hover/chart:border-[hsl(var(--tone-positive-500)/0.25)] group-hover/chart:bg-[hsl(var(--tone-positive-300)/0.28)] group-hover/chart:shadow-[0_0_12px_hsl(var(--tone-positive-300)/0.15)]"
            style={{ left: bandLeftPct, width: bandWidthPct }}
          />
        )}
        {/* SD severity tick marks — only shown when value is abnormal */}
        {abnormal && severityTicks?.map((tickVal, i) => {
          const tickRel = computeMeasuredRel(tickVal, ll, ul)
          const tickPos = computeMeasuredPos(tickRel, rangeStart, rangeWidth)
          if (tickPos <= 0.01 || tickPos >= 0.995) return null
          return (
            <div
              key={`tick-${i}`}
              className="absolute top-1/2 h-5 w-px -translate-x-1/2 -translate-y-1/2 bg-[hsl(var(--foreground)/0.4)]"
              style={{ left: `${tickPos * 100}%` }}
            />
          )
        })}
        {/* Previous study markers (diamonds) */}
        {previousMarkers?.map((pm, i) => {
          const prevRel = computeMeasuredRel(pm.value, ll, ul)
          const prevPos = computeMeasuredPos(prevRel, rangeStart, rangeWidth)
          const prevPct = `${prevPos * 100}%`
          const changeColor = pm.improved === true
            ? 'text-[hsl(var(--tone-positive-600))]'
            : pm.improved === false
              ? 'text-[hsl(var(--tone-danger-500))]'
              : 'text-muted-foreground'
          return (
            <div
              key={i}
              className="absolute top-0 h-full flex items-center pointer-events-none"
              style={{ left: prevPct, transform: 'translateX(-50%)' }}
            >
              <Tooltip>
                <TooltipTrigger asChild>
                  <div className="pointer-events-auto cursor-default">
                    <div className="h-[8px] w-[8px] rotate-45 border-[1.5px] border-[hsl(var(--tone-neutral-500))] bg-[hsl(var(--tone-neutral-200))] transition-all duration-200 hover:border-[hsl(var(--foreground))] hover:bg-[hsl(var(--tone-neutral-400))] hover:scale-150" />
                  </div>
                </TooltipTrigger>
                <TooltipContent side="top" className="p-0 overflow-hidden max-w-[300px]">
                  {/* Header */}
                  <div className="px-4 py-2 bg-muted/60 border-b border-border/40">
                    <div className="flex items-center justify-between gap-4">
                      <div className="flex items-center gap-2">
                        <svg className="h-2.5 w-2.5 rotate-45 text-muted-foreground shrink-0" viewBox="0 0 8 8"><rect width="8" height="8" fill="currentColor" /></svg>
                        <span className="text-xs font-semibold text-foreground/70">{pm.sourceType}</span>
                        {pm.date && <span className="text-xs text-muted-foreground">{pm.date}</span>}
                      </div>
                      {pm.interval && (
                        <span className="text-[11px] font-medium text-muted-foreground/70 tabular-nums">{pm.interval} prior</span>
                      )}
                    </div>
                  </div>
                  {/* Body */}
                  <div className="px-4 py-3 space-y-3">
                    {/* Severity transition pills */}
                    {pm.currGrade && (
                      <div className="flex items-center justify-center gap-2">
                        <span className={cn('rounded-full px-2.5 py-1 text-xs font-semibold', SEV_PILL_STYLES[pm.prevGrade])}>
                          {pm.prevLabel}
                        </span>
                        <svg className="h-3.5 w-3.5 text-muted-foreground shrink-0" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 8h10M9 4l4 4-4 4" /></svg>
                        <span className={cn('rounded-full px-2.5 py-1 text-xs font-semibold', SEV_PILL_STYLES[pm.currGrade])}>
                          {pm.currLabel}
                        </span>
                      </div>
                    )}
                    {/* Numeric comparison */}
                    <div className="flex items-center justify-center gap-4">
                      <div className="text-center">
                        <div className="text-[10px] uppercase tracking-wide text-muted-foreground">Previous</div>
                        <div className="text-base font-bold tabular-nums">{pm.prevVal}</div>
                      </div>
                      <div className="flex flex-col items-center gap-0.5">
                        <svg className="h-4 w-4 text-muted-foreground/60" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 8h10M9 4l4 4-4 4" /></svg>
                        {pm.pctChange !== null && (
                          <span className={cn('text-xs font-bold tabular-nums', changeColor)}>
                            {pm.pctChange >= 0 ? '+' : ''}{pm.pctChange.toFixed(0)}%
                          </span>
                        )}
                      </div>
                      {pm.currVal && (
                        <div className="text-center">
                          <div className="text-[10px] uppercase tracking-wide text-muted-foreground">Current</div>
                          <div className="text-base font-bold tabular-nums">{pm.currVal}</div>
                        </div>
                      )}
                    </div>
                  </div>
                </TooltipContent>
              </Tooltip>
            </div>
          )
        })}
        {/* Ring dot marker (current) — colour matches severity grade */}
        {(() => {
          const DOT_STYLES: Record<SevGrade, { border: string; hover: string }> = {
            normal:   { border: 'hsl(158 35% 45%)', hover: 'hsl(158 35% 45%)' },
            mild:     { border: 'hsl(46 55% 45%)', hover: 'hsl(46 55% 45%)' },
            moderate: { border: 'hsl(20 50% 45%)', hover: 'hsl(20 50% 45%)' },
            severe:   { border: 'hsl(4 50% 40%)', hover: 'hsl(4 50% 40%)' },
          }
          const grade = severityGrade ?? (abnormal ? 'severe' : 'normal')
          const ds = DOT_STYLES[grade]
          return (
            <div
              className="absolute top-1/2 h-[10px] w-[10px] -translate-x-1/2 -translate-y-1/2 rounded-full border-2 bg-white transition-all duration-200 group-hover/chart:shadow-[0_0_0_3px_rgba(0,0,0,0.1),0_0_8px_rgba(0,0,0,0.15)]"
              style={{
                left: dotPct,
                borderColor: ds.border,
                boxShadow: `0 1px 3px ${ds.border}33`,
              }}
              onMouseEnter={(e) => { (e.target as HTMLElement).style.backgroundColor = ds.hover }}
              onMouseLeave={(e) => { (e.target as HTMLElement).style.backgroundColor = 'white' }}
            />
          )
        })()}
      </div>
    </TooltipProvider>
  )
}

// ---------------------------------------------------------------------------
// Parameter drilldown (with measured value)
// ---------------------------------------------------------------------------

function ParameterDrilldown({
  param,
  sex,
  measuredValue,
  onClose,
}: {
  param: CmrCanonicalParam
  sex: string
  measuredValue?: number
  onClose: () => void
}) {
  const [fLL, fMean, fUL, fSD] = fmtRow([param.ll, param.mean, param.ul, param.sd], param.decimal_places)

  let status: 'normal' | 'abnormal' | undefined
  if (measuredValue !== undefined) {
    const dir = param.abnormal_direction
    if (dir === 'high' && param.ul !== null && measuredValue > param.ul) status = 'abnormal'
    else if (dir === 'low' && param.ll !== null && measuredValue < param.ll) status = 'abnormal'
    else if (dir === 'both' && ((param.ul !== null && measuredValue > param.ul) || (param.ll !== null && measuredValue < param.ll))) status = 'abnormal'
    else status = 'normal'
  }

  return (
    <DrilldownSheet open onOpenChange={(open) => { if (!open) onClose() }}>
      <DrilldownSheet.Header title={displayName(param.parameter_key)} variant="workspace">
        {param.sub_section && (
          <p className="mt-0.5 text-xs text-[hsl(var(--muted-foreground))]">
            {sentenceCase(param.major_section)} &rsaquo; {param.sub_section}
          </p>
        )}
        {!param.sub_section && (
          <p className="mt-0.5 text-xs text-[hsl(var(--muted-foreground))]">
            {sentenceCase(param.major_section)}
          </p>
        )}
      </DrilldownSheet.Header>

      <DrilldownSheet.Content>
        {/* Measured value highlight */}
        {measuredValue !== undefined && (
          <div className="space-y-2">
            <DrilldownSheet.Heading>Measured Value</DrilldownSheet.Heading>
            <div className={cn(
              'rounded-lg border-2 p-4 text-center',
              status === 'abnormal'
                ? 'border-[hsl(var(--tone-danger-300))] bg-[hsl(var(--tone-danger-50))]'
                : 'border-[hsl(var(--tone-positive-300))] bg-[hsl(var(--tone-positive-50))]',
            )}>
              <p className={cn(
                'text-3xl font-bold tabular-nums',
                status === 'abnormal' ? 'text-[hsl(var(--tone-danger-600))]' : 'text-[hsl(var(--tone-positive-600))]',
              )}>
                {measuredValue}
              </p>
              <p className="mt-1 text-sm text-[hsl(var(--muted-foreground))]">
                {param.unit} &middot; {status === 'abnormal' ? 'Outside reference range' : 'Within reference range'}
              </p>
            </div>
          </div>
        )}

        {/* Reference values */}
        <div className="space-y-4">
          <DrilldownSheet.Heading>Reference Values ({sex})</DrilldownSheet.Heading>
          <div className="grid grid-cols-2 gap-3">
            <DrilldownSheet.StatCard title="Lower Limit" value={fLL} />
            <DrilldownSheet.StatCard title="Mean" value={fMean} tone="positive" />
            <DrilldownSheet.StatCard title="Upper Limit" value={fUL} />
            <DrilldownSheet.StatCard title="SD" value={fSD} />
          </div>
          <div className="flex flex-wrap gap-x-6 gap-y-2 text-sm">
            <div>
              <span className="text-[hsl(var(--muted-foreground))]">Unit</span>
              <span className="ml-2 font-medium">{param.unit}</span>
            </div>
            <div>
              <span className="text-[hsl(var(--muted-foreground))]">Band</span>
              <span className="ml-2 font-medium">{param.age_band || 'Adult'}</span>
            </div>
            {param.abnormal_direction && (
              <div>
                <span className="text-[hsl(var(--muted-foreground))]">Direction</span>
                <span className="ml-2 font-medium">
                  <DirectionIndicator dir={param.abnormal_direction} />
                  <span className="ml-1 capitalize">{param.abnormal_direction}</span>
                </span>
              </div>
            )}
          </div>
        </div>

        {/* Sources */}
        <div className="mt-6 space-y-3">
          <DrilldownSheet.Heading>Sources</DrilldownSheet.Heading>
          {param.sources.length > 0 ? (
            <div className="space-y-3">
              {param.sources.map((src) => (
                <a
                  key={src.doi}
                  href={src.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="block rounded-lg border border-[hsl(var(--stroke-soft)/0.72)] p-3 transition-colors hover:border-[hsl(var(--tone-positive-300))] hover:bg-[hsl(var(--tone-positive-50)/0.5)]"
                >
                  <div className="flex items-start gap-2">
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium leading-snug text-[hsl(var(--foreground))]">{src.short_ref}</p>
                      <p className="mt-1 text-xs leading-relaxed text-[hsl(var(--muted-foreground))]">{src.title}</p>
                      <p className="mt-1 text-xs text-[hsl(var(--tone-neutral-400))]">{src.journal}</p>
                    </div>
                    <ExternalLink className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[hsl(var(--muted-foreground))]" />
                  </div>
                </a>
              ))}
            </div>
          ) : (
            <p className="text-sm italic text-[hsl(var(--muted-foreground))]">
              No sources linked yet.
            </p>
          )}
        </div>
      </DrilldownSheet.Content>
    </DrilldownSheet>
  )
}

// ---------------------------------------------------------------------------
// Main page
// ---------------------------------------------------------------------------

export function CmrNewReportPage() {
  const activeCase = useCmrCaseStore((state) => state.activeCase)
  const patchActiveCasePayload = useCmrCaseStore((state) => state.patchActiveCasePayload)
  const quantitativeUi = activeCase?.payload.quantitativeUi
  const [data, setData] = useState<CmrCanonicalTableResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({})
  const [selectedParam, setSelectedParam] = useState<CmrCanonicalParam | null>(null)
  const [papMode, setPapMode] = useState<PapillaryMode>('mass')
  const [referencePreset, setReferencePreset] = useState<CmrReferencePreset>('standard')
  const [showFilter, setShowFilter] = useState<'all' | 'recorded'>(() => quantitativeUi?.showFilter ?? 'recorded')
  const [indexFilter, setIndexFilter] = useState<'all' | 'indexed'>(() => quantitativeUi?.indexFilter ?? 'all')
  const [chartMode, setChartMode] = useState<'off' | 'on'>(() => quantitativeUi?.chartMode ?? 'on')
  const [abnormalFilter, setAbnormalFilter] = useState<'all' | 'abnormal'>(() => quantitativeUi?.abnormalFilter ?? 'all')
  const [severityMode, setSeverityMode] = useState<'off' | 'abnormal'>(() => quantitativeUi?.severityMode ?? 'off')
  const [rangeParams, setRangeParams] = useState<Map<string, RangeParam>>(() => rangeParamRecordToMap(quantitativeUi?.rangeParams))
  const [scalingMode, setScalingMode] = useState<'factory' | 'global' | 'per-meas'>(() => quantitativeUi?.scalingMode ?? 'global')
  const [expandedNested, setExpandedNested] = useState<Set<string>>(new Set())
  const [importOpen, setImportOpen] = useState(false)
  const [importText, setImportText] = useState('')
  const [importFile, setImportFile] = useState<{ name: string; dataUrl: string } | null>(null)
  const [importing, setImporting] = useState(false)
  const [importError, setImportError] = useState<string | null>(null)
  const [editingMeasuredValues, setEditingMeasuredValues] = useState<Record<string, string>>({})
  const [ageDraft, setAgeDraft] = useState('')
  const importFileRef = useRef<HTMLInputElement>(null)
  const hasLoadedReferenceDataRef = useRef(false)
  const papModeHasLocalOverrideRef = useRef(false)
  const referencePresetHasLocalOverrideRef = useRef(false)
  const autoSyncedRegurgitantValuesRef = useRef<Map<string, number>>(new Map())
  // Pull demographics and measurements from the shared extraction store
  const extraction = useSyncExternalStore(subscribeExtractionResult, getExtractionResult)
  // Previous studies
  const prevStudies = useSyncExternalStore(subscribePreviousStudies, getPreviousStudies)
  const prevVisible = useSyncExternalStore(subscribePreviousStudies, isPreviousVisible)
  const measuredValues = useMemo(() => {
    const map: Map<string, number> = new Map()
    if (extraction?.measurements) {
      for (const m of extraction.measurements) map.set(m.parameter, m.value)
    }
    setCanonicalMeasurementAlias(map, 'LV mass', ['LV EDESM'])
    setCanonicalMeasurementAlias(map, 'LV mass (i)', ['LV EDESM (i)'])
    setCanonicalMeasurementAlias(map, 'LV SV', ['LV stroke volume', 'LV stroke volume (per beat)'])
    setCanonicalMeasurementAlias(map, 'LV SV (i)', ['LV SVi', 'LV stroke volume (i)', 'LV stroke volume index'])
    setCanonicalMeasurementAlias(map, 'RV SV', ['RV stroke volume', 'RV stroke volume (per beat)'])
    setCanonicalMeasurementAlias(map, 'RV SV (i)', ['RV SVi', 'RV stroke volume (i)', 'RV stroke volume index'])
    setCanonicalMeasurementAlias(map, 'LV EDV', ['LV end-diastolic volume'])
    setCanonicalMeasurementAlias(map, 'LV EDV (i)', ['LV EDVi', 'LV end-diastolic volume (i)', 'LV end-diastolic volume index'])
    setCanonicalMeasurementAlias(map, 'LV ESV', ['LV end-systolic volume'])
    setCanonicalMeasurementAlias(map, 'LV ESV (i)', ['LV ESVi', 'LV end-systolic volume (i)', 'LV end-systolic volume index'])
    setCanonicalMeasurementAlias(map, 'RV EDV', ['RV end-diastolic volume'])
    setCanonicalMeasurementAlias(map, 'RV EDV (i)', ['RV EDVi', 'RV end-diastolic volume (i)', 'RV end-diastolic volume index'])
    setCanonicalMeasurementAlias(map, 'RV ESV', ['RV end-systolic volume'])
    setCanonicalMeasurementAlias(map, 'RV ESV (i)', ['RV ESVi', 'RV end-systolic volume (i)', 'RV end-systolic volume index'])
    setCanonicalMeasurementAlias(map, 'AV forward flow (per heartbeat)', ['AV forward flow', 'Estimated AV forward flow', 'Aortic forward flow', 'Estimated Aortic forward flow', 'AV forward flow/beat'])
    setCanonicalMeasurementAlias(map, 'AV forward flow (per minute)', ['Aortic forward flow (per minute)', 'Estimated Aortic forward flow (per minute)', 'AV forward flow/min', 'Estimated AV forward flow/min', 'Aortic forward flow/min'])
    setCanonicalMeasurementAlias(map, 'AV effective forward flow (per heartbeat)', ['AV effective forward flow', 'Estimated AV effective forward flow', 'Aortic effective forward flow', 'Estimated Aortic effective forward flow', 'AV effective forward flow/beat'])
    setCanonicalMeasurementAlias(map, 'AV effective forward flow (per minute)', ['Aortic effective forward flow (per minute)', 'Estimated Aortic effective forward flow (per minute)', 'AV effective forward flow/min', 'Estimated AV effective forward flow/min', 'Aortic effective forward flow/min'])
    setCanonicalMeasurementAlias(map, 'AV backward flow (per heartbeat)', ['AV backward flow', 'Estimated AV backward flow', 'Aortic backward flow', 'Estimated Aortic backward flow', 'AV backward flow/beat'])
    setCanonicalMeasurementAlias(map, 'AV backward flow (per minute)', ['Aortic backward flow (per minute)', 'Estimated Aortic backward flow (per minute)', 'AV backward flow/min', 'Estimated AV backward flow/min', 'Aortic backward flow/min'])
    setCanonicalMeasurementAlias(map, 'PV forward flow (per heartbeat)', ['PV forward flow', 'Estimated PV forward flow', 'Pulmonary forward flow', 'Estimated Pulmonary forward flow', 'PV forward flow/beat'])
    setCanonicalMeasurementAlias(map, 'PV forward flow (per minute)', ['Pulmonary forward flow (per minute)', 'Estimated Pulmonary forward flow (per minute)', 'PV forward flow/min', 'Estimated PV forward flow/min', 'Pulmonary forward flow/min'])
    setCanonicalMeasurementAlias(map, 'PV effective forward flow (per heartbeat)', ['PV effective forward flow', 'Estimated PV effective forward flow', 'Pulmonary effective forward flow', 'Estimated Pulmonary effective forward flow', 'PV effective forward flow/beat'])
    setCanonicalMeasurementAlias(map, 'PV effective forward flow (per minute)', ['Pulmonary effective forward flow (per minute)', 'Estimated Pulmonary effective forward flow (per minute)', 'PV effective forward flow/min', 'Estimated PV effective forward flow/min', 'Pulmonary effective forward flow/min'])
    setCanonicalMeasurementAlias(map, 'PV backward flow (per heartbeat)', ['PV backward flow', 'Estimated PV backward flow', 'Pulmonary backward flow', 'Estimated Pulmonary backward flow', 'PV backward flow/beat'])
    setCanonicalMeasurementAlias(map, 'PV backward flow (per minute)', ['Pulmonary backward flow (per minute)', 'Estimated Pulmonary backward flow (per minute)', 'PV backward flow/min', 'Estimated PV backward flow/min', 'Pulmonary backward flow/min'])
    return map
  }, [extraction])

  const sex = extraction?.demographics?.sex ?? 'Male'
  const age = extraction?.demographics?.age ?? undefined
  useEffect(() => {
    setAgeDraft('')
  }, [activeCase?.id])
  useEffect(() => {
    if (age != null) setAgeDraft('')
  }, [age])
  const commitAgeDraft = useCallback(() => {
    const trimmed = ageDraft.trim()
    if (!trimmed) return
    const parsed = Number(trimmed)
    if (!Number.isFinite(parsed) || parsed <= 0) return
    setExtractionDemographics({ age: Math.round(parsed) })
    setAgeDraft('')
  }, [ageDraft])

  useEffect(() => {
    const nextQuantitativeUi = activeCase?.payload.quantitativeUi
    setShowFilter(nextQuantitativeUi?.showFilter ?? 'recorded')
    setIndexFilter(nextQuantitativeUi?.indexFilter ?? 'all')
    setChartMode(nextQuantitativeUi?.chartMode ?? 'on')
    setAbnormalFilter(nextQuantitativeUi?.abnormalFilter ?? 'all')
    setSeverityMode(nextQuantitativeUi?.severityMode ?? 'off')
    setScalingMode(nextQuantitativeUi?.scalingMode ?? 'global')
    setRangeParams(rangeParamRecordToMap(nextQuantitativeUi?.rangeParams))
    setSelectedParam(null)
    setEditingMeasuredValues({})
  }, [activeCase?.id])

  useEffect(() => {
    patchActiveCasePayload((payload) => ({
      ...payload,
      quantitativeUi: {
        showFilter,
        indexFilter,
        chartMode,
        abnormalFilter,
        severityMode,
        scalingMode,
        rangeParams: rangeParamMapToRecord(rangeParams),
      },
    }))
  }, [
    abnormalFilter,
    chartMode,
    indexFilter,
    patchActiveCasePayload,
    rangeParams,
    scalingMode,
    severityMode,
    showFilter,
  ])
  const heartRate = extraction?.demographics?.heart_rate ?? undefined
  const bsa = (() => {
    const extractedBsa = extraction?.demographics?.bsa
    if (extractedBsa != null && Number.isFinite(extractedBsa) && extractedBsa > 0) return extractedBsa
    const h = extraction?.demographics?.height_cm
    const w = extraction?.demographics?.weight_kg
    if (h && w && h > 0) return Math.sqrt((h * w) / 3600) // Mosteller
    return undefined
  })()
  const bmi = (() => {
    const h = extraction?.demographics?.height_cm
    const w = extraction?.demographics?.weight_kg
    if (h && w && h > 0) return w / ((h / 100) ** 2)
    return undefined
  })()

  // Derived (calculated) values — indirect volumetric method + haemodynamic equations
  const derivedValues = useMemo(() => {
    const derived = new Map<string, number>()
    const workingMeasurements = new Map(measuredValues)
    const lvsv = getStrokeVolume({
      measurements: workingMeasurements,
      directKeys: ['LV SV'],
      indexedKeys: ['LV SV (i)'],
      edvKeys: ['LV EDV'],
      esvKeys: ['LV ESV'],
      efKeys: ['LV EF'],
      indexedEdvKeys: ['LV EDV (i)'],
      indexedEsvKeys: ['LV ESV (i)'],
      coKeys: ['LV CO'],
      bsa,
      heartRate,
    })
    if (!workingMeasurements.has('LV SV') && lvsv !== undefined) {
      const roundedLvsv = round(lvsv, 1)
      workingMeasurements.set('LV SV', roundedLvsv)
      derived.set('LV SV', roundedLvsv)
    }
    const rvsv = getStrokeVolume({
      measurements: workingMeasurements,
      directKeys: ['RV SV'],
      indexedKeys: ['RV SV (i)'],
      edvKeys: ['RV EDV'],
      esvKeys: ['RV ESV'],
      efKeys: ['RV EF'],
      indexedEdvKeys: ['RV EDV (i)'],
      indexedEsvKeys: ['RV ESV (i)'],
      coKeys: ['RV CO'],
      bsa,
      heartRate,
    })
    if (!workingMeasurements.has('RV SV') && rvsv !== undefined) {
      const roundedRvsv = round(rvsv, 1)
      workingMeasurements.set('RV SV', roundedRvsv)
      derived.set('RV SV', roundedRvsv)
    }
    const avFlow = getValveFlowCalculation({
      measurements: workingMeasurements,
      effectiveBeatKeys: ['AV effective forward flow (per heartbeat)'],
      effectiveMinuteKeys: ['AV effective forward flow (per minute)'],
      fractionKeys: ['AV regurgitant fraction'],
      forwardBeatKeys: ['AV forward flow (per heartbeat)'],
      forwardMinuteKeys: ['AV forward flow (per minute)'],
      backwardBeatKeys: ['AV backward flow (per heartbeat)'],
      backwardMinuteKeys: ['AV backward flow (per minute)'],
      heartRate,
    })
    const avEff = avFlow.effectiveForwardFlow
    if (avEff !== undefined) {
      const roundedAvEff = round(avEff, 1)
      workingMeasurements.set('AV effective forward flow (per heartbeat)', roundedAvEff)
      derived.set('AV effective forward flow (per heartbeat)', roundedAvEff)
    }
    if (avFlow.regurgitantFraction !== undefined) {
      const roundedAvRf = round(avFlow.regurgitantFraction, 1)
      workingMeasurements.set('AV regurgitant fraction', roundedAvRf)
      derived.set('AV regurgitant fraction', roundedAvRf)
    }
    const pvFlow = getValveFlowCalculation({
      measurements: workingMeasurements,
      effectiveBeatKeys: ['PV effective forward flow (per heartbeat)'],
      effectiveMinuteKeys: ['PV effective forward flow (per minute)'],
      fractionKeys: ['PV regurgitant fraction'],
      forwardBeatKeys: ['PV forward flow (per heartbeat)'],
      forwardMinuteKeys: ['PV forward flow (per minute)'],
      backwardBeatKeys: ['PV backward flow (per heartbeat)'],
      backwardMinuteKeys: ['PV backward flow (per minute)'],
      heartRate,
    })
    const pvEff = pvFlow.effectiveForwardFlow
    if (pvEff !== undefined) {
      const roundedPvEff = round(pvEff, 1)
      workingMeasurements.set('PV effective forward flow (per heartbeat)', roundedPvEff)
      derived.set('PV effective forward flow (per heartbeat)', roundedPvEff)
    }
    if (pvFlow.regurgitantFraction !== undefined) {
      const roundedPvRf = round(pvFlow.regurgitantFraction, 1)
      workingMeasurements.set('PV regurgitant fraction', roundedPvRf)
      derived.set('PV regurgitant fraction', roundedPvRf)
    }

    const effectiveLvsv = workingMeasurements.get('LV SV') ?? lvsv
    const effectiveAvEff = workingMeasurements.get('AV effective forward flow (per heartbeat)') ?? avEff
    const measuredMrVolume = workingMeasurements.get('MR volume (per heartbeat)')
    const derivedMrVolume = effectiveLvsv !== undefined && effectiveAvEff !== undefined ? effectiveLvsv - effectiveAvEff : undefined
    const mrVolume = measuredMrVolume ?? (
      derivedMrVolume !== undefined ? round(Math.max(0, derivedMrVolume), 1) : undefined
    )
    if (mrVolume !== undefined && measuredMrVolume === undefined) {
      derived.set('MR volume (per heartbeat)', mrVolume)
    }
    if (
      !workingMeasurements.has('MR regurgitant fraction')
      && effectiveLvsv !== undefined
      && effectiveLvsv > 0
      && mrVolume !== undefined
      && mrVolume >= 0
    ) {
      derived.set('MR regurgitant fraction', round((mrVolume / effectiveLvsv) * 100, 1))
    }

    const effectiveRvsv = workingMeasurements.get('RV SV') ?? rvsv
    const effectivePvEff = workingMeasurements.get('PV effective forward flow (per heartbeat)') ?? pvEff
    const measuredTrVolume = workingMeasurements.get('TR volume (per heartbeat)')
    const derivedTrVolume = effectiveRvsv !== undefined && effectivePvEff !== undefined ? effectiveRvsv - effectivePvEff : undefined
    const trVolume = measuredTrVolume ?? (
      derivedTrVolume !== undefined ? round(Math.max(0, derivedTrVolume), 1) : undefined
    )
    if (trVolume !== undefined && measuredTrVolume === undefined) {
      derived.set('TR volume (per heartbeat)', trVolume)
    }
    if (
      !workingMeasurements.has('TR regurgitant fraction')
      && effectiveRvsv !== undefined
      && effectiveRvsv > 0
      && trVolume !== undefined
      && trVolume >= 0
    ) {
      derived.set('TR regurgitant fraction', round((trVolume / effectiveRvsv) * 100, 1))
    }

    // --- Derived haemodynamic parameters (Garg et al.) ---

    // PCWP = 5.7591 + (0.07505 × LAV) + (0.05289 × LVM) − (1.9927 × Sex)
    // Sex: 0 = female, 1 = male
    const lav = measuredValues.get('LA max volume')
    const lvm = measuredValues.get('LV mass')
    if (lav !== undefined && lvm !== undefined) {
      const sexVal = sex === 'Male' ? 1 : 0
      derived.set('PCWP', 5.7591 + (0.07505 * lav) + (0.05289 * lvm) - (1.9927 * sexVal))
    }

    // mRAP = 6.4547 + (0.05828 × RAESV)
    const raesv = measuredValues.get('RA max volume')
    if (raesv !== undefined) {
      derived.set('mRAP', 6.4547 + (0.05828 * raesv))
    }

    // CMR SBP = 83.845 + (0.4225 × Age) + (0.4187 × LVEF)
    const lvef = measuredValues.get('LV EF')
    if (age !== undefined && lvef !== undefined) {
      derived.set('CMR SBP', 83.845 + (0.4225 * age) + (0.4187 * lvef))
    }

    // CMR DBP = 58.8591 + (−0.1229 × AO_fwd_flow) + (8.2279 × BSA) + (0.1738 × LVMi)
    const aoFwd = getMeasurementWithRateFallback({
      measurements: measuredValues,
      perBeatKeys: ['AV forward flow (per heartbeat)'],
      perMinuteKeys: ['AV forward flow (per minute)'],
      heartRate,
    })
    const lvmi = measuredValues.get('LV mass (i)')
      ?? (
        bsa !== undefined && bsa > 0 && measuredValues.get('LV mass') !== undefined
          ? measuredValues.get('LV mass')! / bsa
          : undefined
      )
    if (aoFwd !== undefined && bsa !== undefined && lvmi !== undefined) {
      derived.set('CMR DBP', 58.8591 + (-0.1229 * aoFwd) + (8.2279 * bsa) + (0.1738 * lvmi))
    }

    const lvMassToEdvRatio = getMeasurementRatio({
      measurements: workingMeasurements,
      numeratorDirectKeys: ['LV mass'],
      denominatorDirectKeys: ['LV EDV'],
      numeratorIndexedKeys: ['LV mass (i)'],
      denominatorIndexedKeys: ['LV EDV (i)'],
      bsa,
    })
    if (lvMassToEdvRatio !== undefined) {
      derived.set('LV mass / LV EDV', round(lvMassToEdvRatio, 1))
    }

    // iSvO₂ = 95 × (RV blood pool T2 / LV blood pool T2)
    // These aren't standard extracted params yet, but support them if present
    const rvT2 = measuredValues.get('RV blood pool T2')
    const lvT2 = measuredValues.get('LV blood pool T2')
    if (rvT2 !== undefined && lvT2 !== undefined && lvT2 > 0) {
      derived.set('iSvO₂', 95 * (rvT2 / lvT2))
    }

    return derived
  }, [measuredValues, sex, age, bsa, heartRate])
  const autoSyncedRegurgitantValues = useMemo(() => {
    const sourceMeasurements = new Map(measuredValues)
    const previousAutoValues = autoSyncedRegurgitantValuesRef.current
    for (const key of AUTO_SYNCED_FLOW_PARAMS) {
      const previousAutoValue = previousAutoValues.get(key)
      if (previousAutoValue !== undefined && sourceMeasurements.get(key) === previousAutoValue) {
        sourceMeasurements.delete(key)
      }
    }

    const lvsv = getStrokeVolume({
      measurements: sourceMeasurements,
      directKeys: ['LV SV'],
      indexedKeys: ['LV SV (i)'],
      edvKeys: ['LV EDV'],
      esvKeys: ['LV ESV'],
      efKeys: ['LV EF'],
      indexedEdvKeys: ['LV EDV (i)'],
      indexedEsvKeys: ['LV ESV (i)'],
      coKeys: ['LV CO'],
      bsa,
      heartRate,
    })
    const rvsv = getStrokeVolume({
      measurements: sourceMeasurements,
      directKeys: ['RV SV'],
      indexedKeys: ['RV SV (i)'],
      edvKeys: ['RV EDV'],
      esvKeys: ['RV ESV'],
      efKeys: ['RV EF'],
      indexedEdvKeys: ['RV EDV (i)'],
      indexedEsvKeys: ['RV ESV (i)'],
      coKeys: ['RV CO'],
      bsa,
      heartRate,
    })
    const avFlow = getValveFlowCalculation({
      measurements: sourceMeasurements,
      effectiveBeatKeys: ['AV effective forward flow (per heartbeat)'],
      effectiveMinuteKeys: ['AV effective forward flow (per minute)'],
      fractionKeys: ['AV regurgitant fraction'],
      forwardBeatKeys: ['AV forward flow (per heartbeat)'],
      forwardMinuteKeys: ['AV forward flow (per minute)'],
      backwardBeatKeys: ['AV backward flow (per heartbeat)'],
      backwardMinuteKeys: ['AV backward flow (per minute)'],
      heartRate,
    })
    const pvFlow = getValveFlowCalculation({
      measurements: sourceMeasurements,
      effectiveBeatKeys: ['PV effective forward flow (per heartbeat)'],
      effectiveMinuteKeys: ['PV effective forward flow (per minute)'],
      fractionKeys: ['PV regurgitant fraction'],
      forwardBeatKeys: ['PV forward flow (per heartbeat)'],
      forwardMinuteKeys: ['PV forward flow (per minute)'],
      backwardBeatKeys: ['PV backward flow (per heartbeat)'],
      backwardMinuteKeys: ['PV backward flow (per minute)'],
      heartRate,
    })

    const next = new Map<string, number>()
    if (avFlow.effectiveForwardFlow !== undefined) {
      next.set('AV effective forward flow (per heartbeat)', round(avFlow.effectiveForwardFlow, 1))
    }
    if (avFlow.regurgitantFraction !== undefined) {
      next.set('AV regurgitant fraction', round(avFlow.regurgitantFraction, 1))
    }
    const avEff = avFlow.effectiveForwardFlow
    if (pvFlow.effectiveForwardFlow !== undefined) {
      next.set('PV effective forward flow (per heartbeat)', round(pvFlow.effectiveForwardFlow, 1))
    }
    if (pvFlow.regurgitantFraction !== undefined) {
      next.set('PV regurgitant fraction', round(pvFlow.regurgitantFraction, 1))
    }
    const pvEff = pvFlow.effectiveForwardFlow
    if (lvsv !== undefined && avEff !== undefined) {
      const mrVolume = round(Math.max(0, lvsv - avEff), 1)
      next.set('MR volume (per heartbeat)', mrVolume)
      if (lvsv > 0) {
        next.set('MR regurgitant fraction', round((mrVolume / lvsv) * 100, 1))
      }
    }
    if (rvsv !== undefined && pvEff !== undefined) {
      const trVolume = round(Math.max(0, rvsv - pvEff), 1)
      next.set('TR volume (per heartbeat)', trVolume)
      if (rvsv > 0) {
        next.set('TR regurgitant fraction', round((trVolume / rvsv) * 100, 1))
      }
    }
    return next
  }, [measuredValues, bsa, heartRate])
  const displayValues = useMemo(() => {
    const next = new Map(measuredValues)
    for (const [key, value] of derivedValues) {
      if (!next.has(key) || ALWAYS_RECALCULATED_FLOW_PARAMS.has(key)) next.set(key, value)
    }
    populateIndexedMeasurements(next, data?.parameters ?? [], bsa)
    return next
  }, [bsa, data?.parameters, derivedValues, measuredValues])
  const sectionRefs = useRef<Record<string, HTMLDivElement | null>>({})

  useEffect(() => {
    const previousAutoValues = autoSyncedRegurgitantValuesRef.current
    for (const key of AUTO_SYNCED_FLOW_PARAMS) {
      const currentValue = measuredValues.get(key)
      const previousAutoValue = previousAutoValues.get(key)
      const nextAutoValue = autoSyncedRegurgitantValues.get(key)
      const currentWasAutoSynced = previousAutoValue !== undefined && currentValue === previousAutoValue
      const shouldRecalculate = ALWAYS_RECALCULATED_FLOW_PARAMS.has(key)

      if (nextAutoValue === undefined) {
        if (currentWasAutoSynced) {
          setExtractionMeasurement(key, null)
        }
        continue
      }

      if ((currentValue === undefined || currentWasAutoSynced || shouldRecalculate) && currentValue !== nextAutoValue) {
        setExtractionMeasurement(key, nextAutoValue)
      }
    }
    autoSyncedRegurgitantValuesRef.current = new Map(autoSyncedRegurgitantValues)
  }, [autoSyncedRegurgitantValues, measuredValues])

  const toggleCollapse = (key: string) => {
    setCollapsed((prev) => ({ ...prev, [key]: !prev[key] }))
  }

  const startMeasuredEdit = useCallback((parameterKey: string, displayValue: string) => {
    setEditingMeasuredValues((prev) => {
      if (prev[parameterKey] !== undefined) return prev
      return { ...prev, [parameterKey]: displayValue }
    })
  }, [])

  const updateMeasuredEdit = useCallback((parameterKey: string, nextValue: string) => {
    setEditingMeasuredValues((prev) => ({ ...prev, [parameterKey]: nextValue }))
  }, [])

  const clearMeasuredEdit = useCallback((parameterKey: string) => {
    setEditingMeasuredValues((prev) => {
      if (prev[parameterKey] === undefined) return prev
      const next = { ...prev }
      delete next[parameterKey]
      return next
    })
  }, [])

  const commitMeasuredEdit = useCallback((parameterKey: string, nextValue: string) => {
    clearMeasuredEdit(parameterKey)
    const trimmed = nextValue.trim()
    if (!trimmed) {
      setExtractionMeasurement(parameterKey, null)
      return
    }
    const parsed = Number(trimmed)
    if (!Number.isFinite(parsed)) return
    const storedValue = ABS_VALUE_PARAMS.has(parameterKey) ? -Math.abs(parsed) : parsed
    setExtractionMeasurement(parameterKey, storedValue)
  }, [clearMeasuredEdit])

  const load = useCallback(async () => {
    if (!hasLoadedReferenceDataRef.current) setLoading(true)
    try {
      const result = await fetchReferenceParameters(sex, age, papMode)
      setData({
        ...result,
        parameters: applyCmrReferencePreset(result.parameters, sex, referencePreset),
      })
    } catch {
      // ignore
    } finally {
      hasLoadedReferenceDataRef.current = true
      setLoading(false)
    }
  }, [age, papMode, referencePreset, sex])

  const handlePapModeChange = useCallback(async (nextMode: PapillaryMode) => {
    if (nextMode === papMode) return
    papModeHasLocalOverrideRef.current = true
    setPapMode(nextMode)
    try {
      await updateConfig({ papillary_mode: nextMode })
    } catch {
      // Keep the local toggle responsive even if persistence fails.
    }
  }, [papMode])

  const handleReferencePresetChange = useCallback(async (nextPreset: CmrReferencePreset) => {
    if (nextPreset === referencePreset) return
    referencePresetHasLocalOverrideRef.current = true
    setReferencePreset(nextPreset)
    try {
      await updateConfig({ reference_preset: nextPreset })
    } catch {
      // Keep the local toggle responsive even if persistence fails.
    }
  }, [referencePreset])

  useEffect(() => {
    void load()
  }, [load])

  useEffect(() => {
    let cancelled = false
    void fetchConfig().then((c) => {
      if (cancelled) return
      if (!papModeHasLocalOverrideRef.current) {
        setPapMode(c.papillary_mode)
      }
      if (!referencePresetHasLocalOverrideRef.current) {
        setReferencePreset(normalizeCmrReferencePreset(c.reference_preset))
      }
    }).catch(() => {})
    return () => {
      cancelled = true
    }
  }, [])

  const allGroups = data ? groupBySections(data.parameters) : []

  // Derive nesting relationships from the data's nested_under field
  const nestedParamMap = useMemo(() => data ? buildNestedParamMap(data.parameters) : {}, [data])
  const nestedChildrenSet = useMemo(() => buildNestedChildrenSet(nestedParamMap), [nestedParamMap])

  // Build a lookup of nested child params from the full dataset
  const nestedChildParams = useMemo(() => {
    const map = new Map<string, CmrCanonicalParam[]>()
    if (!data) return map
    for (const [parent, childKeys] of Object.entries(nestedParamMap)) {
      const children = childKeys
        .map((k) => data.parameters.find((p) => p.parameter_key === k))
        .filter((p): p is CmrCanonicalParam => p !== undefined)
      if (children.length > 0) map.set(parent, children)
    }
    return map
  }, [data, nestedParamMap])

  const groups = allGroups
    .map((g) => {
      // Filter out nested children from their original section — they'll be rendered under the parent
      let params = g.params.filter((p) => !nestedChildrenSet.has(p.parameter_key))
      if (showFilter === 'recorded') params = params.filter((p) => displayValues.has(p.parameter_key))
      if (indexFilter === 'indexed') {
        // Build set from the full (unfiltered) group so we know which absolutes have an indexed counterpart
        const indexedKeys = new Set(g.params.filter((p) => p.indexing === 'BSA').map((p) => p.parameter_key.replace(/\s*\(i\)\s*$/, '')))
        // Hide absolute params whose indexed variant exists; keep everything else
        params = params.filter((p) => p.indexing === 'BSA' || !indexedKeys.has(p.parameter_key))
      }
      if (abnormalFilter === 'abnormal') {
        params = params.filter((p) => {
          const m = displayValues.get(p.parameter_key)
          if (m === undefined) return false
          return isAbnormalValue(m, p.ll, p.ul, p.abnormal_direction)
        })
      }
      return { ...g, params }
    })
    .filter((g) => g.params.length > 0)
  const majorSections = groups.reduce<string[]>((acc, g) => {
    if (!acc.includes(g.major)) acc.push(g.major)
    return acc
  }, [])

  /** Build previous markers for a given canonical parameter key.
   *  Uses the severity system for clinical interpretation labels. */
  const getPrevMarkers = useCallback((
    param: CmrCanonicalParam,
    currentVal: number | undefined,
  ): PrevMarker[] | undefined => {
    if (!prevVisible || prevStudies.length === 0) return undefined
    const markers: PrevMarker[] = []
    const sevLabel = param.severity_label as SeverityLabelType | undefined
    const resolvedLabel = sevLabel ?? inferSeverityLabel(param.parameter_key, param.major_section, param.sub_section)
    const SEVERITY_RANK: Record<string, number> = { normal: 0, mild: 1, moderate: 2, severe: 3 }
    for (const s of prevStudies) {
      const v = s.values[param.parameter_key]
      if (v === undefined) continue
      const dp = param.unit === '%' || param.unit === 'bpm' ? 0 : param.unit === 'm/s' ? 1 : 0
      const prevSev = computeSeverity(v, param.ll, param.ul, param.sd, param.abnormal_direction, resolvedLabel, param.severity_thresholds ?? null, param.severity_label_override ?? null)
      const currSev = currentVal !== undefined
        ? computeSeverity(currentVal, param.ll, param.ul, param.sd, param.abnormal_direction, resolvedLabel, param.severity_thresholds ?? null, param.severity_label_override ?? null)
        : null
      // Determine if improved/worsened based on severity grade
      let improved: boolean | null = null
      if (currSev) {
        const prevRank = SEVERITY_RANK[prevSev.grade] ?? 0
        const currRank = SEVERITY_RANK[currSev.grade] ?? 0
        if (currRank < prevRank) improved = true
        else if (currRank > prevRank) improved = false
      }
      let pctChange: number | null = null
      if (currentVal !== undefined && v !== 0) {
        pctChange = ((currentVal - v) / Math.abs(v)) * 100
      }
      // Compute interval between previous and current study dates
      const currentDate = extraction?.demographics?.study_date ?? undefined
      const interval = (s.date && currentDate) ? formatInterval(s.date, currentDate) : null
      markers.push({
        value: v,
        sourceType: s.source === 'echo' ? 'Echo' : 'CMR',
        date: s.date ?? null,
        interval,
        prevLabel: prevSev.label,
        prevGrade: prevSev.grade as SevGrade,
        currLabel: currSev?.label ?? null,
        currGrade: (currSev?.grade as SevGrade) ?? null,
        prevVal: `${v.toFixed(dp)} ${param.unit}`,
        currVal: currentVal !== undefined ? `${currentVal.toFixed(dp)} ${param.unit}` : null,
        pctChange,
        improved,
      })
    }
    return markers.length > 0 ? markers : undefined
  }, [prevStudies, prevVisible])

  /** Collect all measuredRel values for visible rows with valid ranges,
   *  optionally including previous study values when overlay is active. */
  const collectMeasuredRels = useCallback(() => {
    const rels: number[] = []
    for (const g of groups) {
      for (const p of g.params) {
        const m = displayValues.get(p.parameter_key)
        if (m !== undefined && hasValidRange(p.ll, p.ul)) {
          const eul = hasSevZones(p) ? effectiveUL(p) : p.ul!
          rels.push(computeMeasuredRel(m, p.ll!, eul))
        }
        // Include previous study values in scaling when visible
        if (prevVisible && hasValidRange(p.ll, p.ul)) {
          const eulPrev = hasSevZones(p) ? effectiveUL(p) : p.ul!
          for (const s of prevStudies) {
            const pv = s.values[p.parameter_key]
            if (pv !== undefined) {
              rels.push(computeMeasuredRel(pv, p.ll!, eulPrev))
            }
          }
        }
      }
    }
    return rels
  }, [displayValues, groups, prevStudies, prevVisible])

  const handleImportFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = (ev) => {
      const dataUrl = ev.target?.result
      if (typeof dataUrl === 'string') setImportFile({ name: file.name, dataUrl })
    }
    reader.readAsDataURL(file)
    e.target.value = ''
  }

  /** Handle importing a previous study from pasted text or uploaded file. */
  const handleImportPrevious = async () => {
    const hasText = importText.trim().length > 0
    const hasFile = importFile !== null
    if (!hasText && !hasFile) return
    setImporting(true)
    setImportError(null)
    try {
      const body: Record<string, string> = {}
      if (hasText) body.report_text = importText
      if (hasFile) {
        body.file_data_url = importFile!.dataUrl
        body.file_name = importFile!.name
      }
      const res = await fetch('/api/cmr-import-previous', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: 'Import failed' }))
        throw new Error(err.error || 'Import failed')
      }
      const result = await res.json()
      const source = result.source as 'cmr' | 'echo'
      const dateStr = result.demographics?.study_date ?? result.demographics?.date ?? undefined
      const label = source === 'echo' ? 'Echo' : 'CMR'
      const values = source === 'echo'
        ? mapEchoToCmr(result.echo_values ?? {})
        : mapCmrToCmr(result.measurements ?? [])
      addPreviousStudy({ id: nextStudyId(), source, label, date: dateStr, values })
      if (!isPreviousVisible()) togglePreviousVisible(true)
      setImportText('')
      setImportFile(null)
      setImportOpen(false)
    } catch (e) {
      setImportError(e instanceof Error ? e.message : 'Import failed')
    } finally {
      setImporting(false)
    }
  }

  // Apply global auto-adjust on initial load when data becomes available
  const hasAppliedInitialGlobal = useRef(false)
  useEffect(() => {
    if (hasAppliedInitialGlobal.current || scalingMode !== 'global') return
    const rels = collectMeasuredRels()
    if (rels.length === 0) return
    const result = globalAutoAdjust(rels)
    if (result) {
      setRangeParams(new Map([['__global__', constrainRange(result, rels)]]))
      hasAppliedInitialGlobal.current = true
    }
  }, [collectMeasuredRels, scalingMode])

  return (
    <Stack data-house-role="page" space="lg">
      <Row align="center" gap="md" wrap={false} className="house-page-title-row">
        <SectionMarker tone="report" size="title" className="self-stretch h-auto" />
        <PageHeader
          heading="Quantitative metrics"
          className="!ml-0 !mt-0"
        />
      </Row>

      {/* Patient demographics */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="rounded-md border border-[hsl(var(--stroke-soft)/0.72)] bg-[hsl(var(--tone-neutral-50))] px-4 py-2">
          <span className="text-sm font-semibold text-[hsl(var(--foreground))]">{sex}</span>
        </div>
        <div className="rounded-md border border-[hsl(var(--stroke-soft)/0.72)] bg-[hsl(var(--tone-neutral-50))] px-4 py-2">
          {age != null ? (
            <span className="text-sm font-semibold text-[hsl(var(--foreground))]">{`${age} years`}</span>
          ) : (
            <input
              aria-label="Patient age in years"
              inputMode="numeric"
              min={1}
              max={130}
              placeholder="Age"
              type="number"
              value={ageDraft}
              onBlur={commitAgeDraft}
              onChange={(event) => setAgeDraft(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') {
                  event.currentTarget.blur()
                }
              }}
              className="w-12 bg-transparent text-center text-sm font-semibold tabular-nums text-[hsl(var(--foreground))] outline-none placeholder:text-[hsl(var(--foreground)/0.65)]"
            />
          )}
        </div>
        {heartRate != null && (
          <div className="rounded-md border border-[hsl(var(--stroke-soft)/0.72)] bg-[hsl(var(--tone-neutral-50))] px-4 py-2">
            <span className="text-sm font-semibold text-[hsl(var(--foreground))]">{Math.round(heartRate)} bpm</span>
          </div>
        )}
        {bmi != null && (
          <div className="rounded-md border border-[hsl(var(--stroke-soft)/0.72)] bg-[hsl(var(--tone-neutral-50))] px-4 py-2">
            <span className="text-sm font-semibold text-[hsl(var(--foreground))]">BMI {Math.round(bmi)}</span>
          </div>
        )}
      </div>

      {/* Controls bar */}
      <div className="flex flex-wrap items-start gap-x-4 gap-y-3">
        {/* Preference */}
        <div className="flex flex-col gap-1">
          <div className="flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wider text-[hsl(var(--tone-neutral-400))]">
            <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M12.5 2.5a2 2 0 0 1 0 3l-9.5 9L1 15l.5-2 9.5-9a2 2 0 0 1 3 0z" /></svg>
            Preference
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <PillToggle
              options={[
                { key: 'mass', label: 'Pap in LV Mass' },
                { key: 'blood_pool', label: 'Pap in Blood Pool' },
              ]}
              value={papMode}
              onChange={(v) => { void handlePapModeChange(v as PapillaryMode) }}
            />
            <PillToggle
              options={[
                { key: 'standard', label: 'Std', tooltip: 'Use the standard age and sex reference ranges' },
                { key: 'nnuh', label: 'NNUH', tooltip: 'Use the NNUH local preset for LV, RV, LA and tissue mapping quantitative ranges' },
              ]}
              compact
              value={referencePreset}
              onChange={(v) => { void handleReferencePresetChange(v as CmrReferencePreset) }}
            />
          </div>
        </div>

        <div className="h-10 w-px self-end bg-[hsl(var(--stroke-soft)/0.3)]" />

        {/* Filters */}
        <div className="flex flex-col gap-1">
          <div className="flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wider text-[hsl(var(--tone-neutral-400))]">
            <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M1 2h14M3 6h10M5 10h6M7 14h2" /></svg>
            Filters
          </div>
          <div className="flex items-center gap-2">
            <PillToggle
              options={[
                { key: 'recorded', label: <RecordedIcon />, tooltip: 'Recorded values only' },
                { key: 'all', label: <AllRowsIcon />, tooltip: 'All parameters' },
              ]}
              compact
              value={showFilter}
              onChange={(v) => setShowFilter(v as 'all' | 'recorded')}
            />
            <PillToggle
              options={[
                { key: 'all', label: <BsaOffIcon />, tooltip: 'Absolute + indexed' },
                { key: 'indexed', label: <BsaIcon />, tooltip: 'BSA-indexed only' },
              ]}
              value={indexFilter}
              onChange={(v) => setIndexFilter(v as 'all' | 'indexed')}
            />
            <PillToggle
              options={[
                { key: 'all', label: <SeverityIcon />, tooltip: 'All severities' },
                { key: 'abnormal', label: <svg className="h-3.5 w-3.5" viewBox="0 0 16 16"><circle cx="8" cy="8" r="5" fill="hsl(4 55% 50%)" /></svg>, tooltip: 'Abnormal only' },
              ]}
              value={abnormalFilter}
              onChange={(v) => setAbnormalFilter(v as 'all' | 'abnormal')}
            />
          </div>
        </div>

        <div className="h-10 w-px self-end bg-[hsl(var(--stroke-soft)/0.3)]" />

        {/* Viewing */}
        <div className="flex flex-col gap-1">
          <div className="flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wider text-[hsl(var(--tone-neutral-400))]">
            <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><rect x="1" y="3" width="14" height="10" rx="1.5" /><path d="M1 6h14" /></svg>
            Viewing
          </div>
          <div className="flex items-center gap-2">
            <PillToggle
              options={[
                { key: 'off', label: <SeverityOffIcon />, tooltip: 'Severity colouring off' },
                { key: 'abnormal', label: <SeverityIcon />, tooltip: 'Colour rows by severity' },
              ]}
              value={severityMode}
              onChange={(v) => setSeverityMode(v as 'off' | 'abnormal')}
            />
            <PillToggle
              options={[
                { key: 'on', label: <ChartIcon />, tooltip: 'Show range charts' },
                { key: 'off', label: <ChartOffIcon />, tooltip: 'Table only' },
              ]}
              value={chartMode}
              onChange={(v) => setChartMode(v as 'off' | 'on')}
            />
            {chartMode === 'on' && (
              <ChartControlStrip
                scalingMode={scalingMode}
                onGlobalAuto={() => {
                  if (scalingMode === 'global') {
                    setScalingMode('factory')
                    setRangeParams(new Map())
                    return
                  }
                  const rels = collectMeasuredRels()
                  const result = globalAutoAdjust(rels)
                  if (result) {
                    setScalingMode('global')
                    setRangeParams(new Map([['__global__', constrainRange(result, rels)]]))
                  }
                }}
                onPerMeasAuto={() => {
                  if (scalingMode === 'per-meas') {
                    setScalingMode('factory')
                    setRangeParams(new Map())
                    return
                  }
                  const newMap: Map<string, RangeParam> = new Map()
                  for (const g of groups) {
                    for (const p of g.params) {
                      const m = displayValues.get(p.parameter_key)
                      if (m !== undefined && hasValidRange(p.ll, p.ul)) {
                        const eul = hasSevZones(p) ? effectiveUL(p) : p.ul!
                        const rel = computeMeasuredRel(m, p.ll!, eul)
                        newMap.set(p.parameter_key, perMeasurementAutoAdjust(rel, sdTickRels(p, m)))
                      }
                    }
                  }
                  setScalingMode('per-meas')
                  setRangeParams(newMap)
                }}
              />
            )}
          </div>
        </div>

        <div className="h-10 w-px self-end bg-[hsl(var(--stroke-soft)/0.3)]" />

        {/* Import previous */}
        <div className="flex flex-col gap-1">
          <div className="flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wider text-[hsl(var(--tone-neutral-400))]">
            <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M8 1v10M4 7l4 4 4-4" /><path d="M1 13h14" /></svg>
            Previous
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setImportOpen(true)}
              className="rounded-full border border-[hsl(var(--border))] px-3 py-1.5 text-xs font-medium text-[hsl(var(--foreground))] transition-colors hover:bg-[hsl(var(--tone-neutral-100))]"
            >
              Import
            </button>
            {prevStudies.map((s) => (
              <button
                key={s.id}
                type="button"
                onClick={() => togglePreviousVisible()}
                className={cn(
                  'flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-xs font-medium transition-colors',
                  prevVisible
                    ? 'border-[hsl(var(--tone-neutral-500))] bg-[hsl(var(--tone-neutral-500))] text-white'
                    : 'border-[hsl(var(--border))] text-[hsl(var(--muted-foreground))] hover:bg-[hsl(var(--tone-neutral-100))]',
                )}
              >
                <svg className="h-2 w-2 rotate-45" viewBox="0 0 8 8"><rect width="8" height="8" fill="currentColor" /></svg>
                {s.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Import modal */}
      {importOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30" onClick={() => setImportOpen(false)}>
          <div className="w-full max-w-xl rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--background))] p-6 shadow-xl" onClick={(e) => e.stopPropagation()}>
            <h2 className="mb-4 text-base font-semibold text-[hsl(var(--foreground))]">Import previous study</h2>
            <textarea
              value={importText}
              onChange={(e) => setImportText(e.target.value)}
              placeholder="Paste report text..."
              rows={10}
              className="w-full rounded-md border border-[hsl(var(--border))] bg-[hsl(var(--background))] px-3 py-2 text-sm font-mono placeholder:text-[hsl(var(--muted-foreground)/0.5)] focus:outline-none focus:ring-2 focus:ring-[hsl(var(--section-style-report-accent))]"
            />
            <div className="mt-3 flex items-center gap-3">
              <button
                type="button"
                onClick={handleImportPrevious}
                disabled={(!importText.trim() && !importFile) || importing}
                className={cn(
                  'rounded-md px-5 py-2 text-sm font-semibold shadow-sm transition-colors',
                  (importText.trim() || importFile) && !importing
                    ? 'bg-[hsl(var(--section-style-report-accent))] text-white hover:opacity-90'
                    : 'bg-[hsl(var(--tone-neutral-200))] text-[hsl(var(--muted-foreground))] cursor-not-allowed',
                )}
              >
                {importing ? 'Extracting...' : 'Import'}
              </button>

              <input
                ref={importFileRef}
                type="file"
                accept=".pdf,.doc,.docx,.txt,.csv,.png,.jpg,.jpeg,.webp,.heic"
                onChange={handleImportFileChange}
                className="hidden"
              />
              <button
                type="button"
                onClick={() => importFileRef.current?.click()}
                className="rounded-md border border-[hsl(var(--border))] px-4 py-2 text-sm font-medium text-[hsl(var(--foreground))] transition-colors hover:bg-[hsl(var(--tone-neutral-100))]"
              >
                Upload file
              </button>
              {importFile && (
                <span className="flex items-center gap-1.5 text-xs text-[hsl(var(--foreground))]">
                  <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M14 10v3a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1v-3" /><path d="M8 2v8M4 6l4-4 4 4" /></svg>
                  {importFile.name}
                  <button type="button" onClick={() => setImportFile(null)} className="ml-1 text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--foreground))]">&times;</button>
                </span>
              )}

              <button
                type="button"
                onClick={() => setImportOpen(false)}
                className="rounded-md border border-[hsl(var(--border))] px-4 py-2 text-sm font-medium text-[hsl(var(--foreground))] transition-colors hover:bg-[hsl(var(--tone-neutral-100))]"
              >
                Cancel
              </button>
              {importError && (
                <span className="text-xs text-[hsl(var(--tone-danger-500))]">{importError}</span>
              )}
            </div>
          </div>
        </div>
      )}

      {loading ? (
        <p className="py-8 text-center text-sm text-[hsl(var(--muted-foreground))]">Loading reference data...</p>
      ) : (
        <div data-section-key="Numerical" className="flex flex-col gap-6 scroll-mt-20">
          {majorSections.map((major) => {
            const subGroups = groups.filter((g) => g.major === major)
            const isCollapsed = !!collapsed[major]

            return (
              <div
                key={major}
                ref={(el) => { sectionRefs.current[major] = el }}
                data-section-key={sentenceCase(major)}
                className="scroll-mt-20"
              >
                {/* Section heading — left accent bar, flush with table */}
                <button
                  type="button"
                  onClick={() => toggleCollapse(major)}
                  className={cn(
                    'flex w-full items-stretch overflow-hidden border border-[hsl(var(--stroke-soft)/0.72)] bg-[hsl(var(--tone-neutral-50))] text-left transition-colors hover:bg-[hsl(var(--tone-neutral-100))]',
                    isCollapsed ? 'rounded-lg' : 'rounded-t-lg border-b border-b-[hsl(var(--stroke-soft))]',
                  )}
                >
                  <div className="w-1 shrink-0 bg-[hsl(var(--section-style-report-accent))]" />
                  <div className="flex flex-1 items-center gap-2.5 px-3.5 py-3">
                    <ChevronIcon open={!isCollapsed} />
                    <h2 className="flex-1 text-sm font-semibold tracking-tight text-[hsl(var(--foreground))]">
                      {sentenceCase(major)}
                    </h2>
                  </div>
                </button>

                {!isCollapsed && (
                  <div className="overflow-hidden rounded-b-lg border-x border-b border-[hsl(var(--stroke-soft)/0.72)]">
                    <table data-house-no-column-resize="true" className="w-full table-fixed border-collapse text-sm">
                      <colgroup>
                        <col style={{ width: chartMode === 'on' ? '21%' : '28%' }} />
                        <col style={{ width: chartMode === 'on' ? '8%' : '10%' }} />
                        <col style={{ width: chartMode === 'on' ? '7%' : '10%' }} />
                        <col style={{ width: chartMode === 'on' ? '6%' : '8%' }} />
                        <col style={{ width: chartMode === 'on' ? '6%' : '8%' }} />
                        <col style={{ width: chartMode === 'on' ? '6%' : '8%' }} />
                        <col style={{ width: chartMode === 'on' ? '16%' : '28%' }} />
                        {chartMode === 'on' && <col style={{ width: '30%' }} />}
                      </colgroup>
                      <thead>
                        <tr className="border-b-2 border-[hsl(var(--tone-neutral-300))] bg-[hsl(var(--tone-neutral-50))]">
                          <th className="house-table-head-text px-3 py-2 text-left">Parameter</th>
                          <th className="house-table-head-text px-3 py-2 text-center">Unit</th>
                          <th className="house-table-head-text px-3 py-2 text-center font-bold text-[hsl(var(--section-style-report-accent))]">Measured</th>
                          <th className="house-table-head-text px-3 py-2 text-center">LL</th>
                          <th className="house-table-head-text px-3 py-2 text-center">Mean</th>
                          <th className="house-table-head-text px-3 py-2 text-center">UL</th>
                          <th className="house-table-head-text px-3 py-2 text-center">Interpretation</th>
                          {chartMode === 'on' && (
                            <th className="house-table-head-text px-3 py-2 text-center">Range</th>
                          )}
                        </tr>
                      </thead>
                      <tbody>
                        {subGroups.map((g, gi) => (
                          <Fragment key={`grp-${g.major}|${g.sub}`}>
                            {/* Sub-section divider */}
                            {g.sub && (
                              <tr className="border-b border-[hsl(var(--stroke-soft)/0.5)]">
                                <td
                                  colSpan={7 + (chartMode === 'on' ? 1 : 0)}
                                  className={cn(
                                    'bg-[hsl(var(--tone-danger-100))] px-3 py-1.5 text-[0.8rem] font-semibold tracking-wide text-[hsl(var(--tone-danger-900)/0.82)]',
                                    gi > 0 && 'border-t border-[hsl(var(--tone-danger-200))]',
                                  )}
                                >
                                  {g.sub}
                                </td>
                              </tr>
                            )}
                            {/* Data rows */}
                            {g.params.map((p) => {
                              const isBsa = p.indexing === 'BSA'
                              const usesNnuhPreset = isCmrReferencePresetAppliedToParameter(p.parameter_key, sex, referencePreset)
                              const [fLL, fMean, fUL, _fSD] = fmtRow([p.ll, p.mean, p.ul, p.sd], p.decimal_places)
                              const rawMeasured = measuredValues.get(p.parameter_key)
                              const rawVal = displayValues.get(p.parameter_key)
                              const isDerived = rawMeasured === undefined && rawVal !== undefined
                              // Backward flow: strip sign — the label already implies direction
                              const measured = rawVal !== undefined && ABS_VALUE_PARAMS.has(p.parameter_key)
                                ? Math.abs(rawVal)
                                : rawVal
                              const hasMeasuredVal = measured !== undefined
                              const measuredDisplay = hasMeasuredVal ? fmtRow([measured], p.decimal_places)[0] : ''
                              const isMeasuredEditable = rawMeasured !== undefined || (!isDerived && !p.derived)

                              let severity: SeverityResult = { grade: 'normal', label: 'Normal' }
                              if (hasMeasuredVal) {
                                severity = computeSeverity(
                                  measured!,
                                  p.ll,
                                  p.ul,
                                  p.sd,
                                  p.abnormal_direction,
                                  (p.severity_label as SeverityLabelType) ?? inferSeverityLabel(p.parameter_key, p.major_section, p.sub_section),
                                  p.severity_thresholds ?? null,
                                  p.severity_label_override ?? null,
                                )
                              }
                              return (
                                <Fragment key={p.parameter_key}>
                                <tr
                                  onClick={() => setSelectedParam(p)}
                                  className={cn(
                                    'cursor-pointer transition-colors duration-100',
                                    p.separator_before
                                      ? 'border-t-[3px] border-b border-t-[hsl(var(--stroke-soft)/0.6)] border-b-[hsl(var(--stroke-soft)/0.4)]'
                                      : 'border-b border-[hsl(var(--stroke-soft)/0.4)]',
                                    !(severityMode === 'abnormal' && hasMeasuredVal) && 'hover:bg-[hsl(var(--tone-neutral-50)/0.65)]',
                                    severityMode === 'abnormal' && hasMeasuredVal && severity.grade === 'normal' && 'bg-[hsl(158_30%_94%)] hover:bg-[hsl(158_30%_91%)]',
                                    severityMode === 'abnormal' && hasMeasuredVal && severity.grade === 'mild' && 'bg-[hsl(46_60%_91%)] hover:bg-[hsl(46_60%_88%)]',
                                    severityMode === 'abnormal' && hasMeasuredVal && severity.grade === 'moderate' && 'bg-[hsl(20_55%_87%)] hover:bg-[hsl(20_55%_84%)]',
                                    severityMode === 'abnormal' && hasMeasuredVal && severity.grade === 'severe' && 'bg-[hsl(4_55%_82%)] hover:bg-[hsl(4_55%_79%)]',
                                  )}
                                >
                                  <td className="house-table-cell-text whitespace-nowrap px-3 py-2 font-medium text-[hsl(var(--foreground))]">
                                    {displayName(p.parameter_key)}
                                    {isBsa && <BsaPill />}
                                    {usesNnuhPreset && <NnuhPresetMarker />}
                                    {(isDerived || p.derived) && (
                                      <span className="ml-1.5 inline-flex items-center text-[hsl(var(--tone-neutral-400))]" title={p.derived_tooltip ?? 'Calculated from LV/RV stroke volume and forward flow'}>
                                        <svg className="h-3.5 w-3.5" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                                          <rect x="2" y="1" width="12" height="14" rx="1.5" />
                                          <line x1="2" y1="5" x2="14" y2="5" />
                                          <line x1="5" y1="8" x2="11" y2="8" />
                                          <line x1="8" y1="5" x2="8" y2="11" />
                                          <line x1="5" y1="13" x2="11" y2="13" />
                                        </svg>
                                      </span>
                                    )}
                                    {nestedParamMap[p.parameter_key] && nestedChildParams.has(p.parameter_key) && (
                                      <button
                                        type="button"
                                        onClick={(e) => {
                                          e.stopPropagation()
                                          setExpandedNested((prev) => {
                                            const next = new Set(prev)
                                            if (next.has(p.parameter_key)) next.delete(p.parameter_key)
                                            else next.add(p.parameter_key)
                                            return next
                                          })
                                        }}
                                        className="ml-1.5 inline-flex items-center text-[hsl(var(--tone-neutral-400))] hover:text-[hsl(var(--foreground))] transition-colors"
                                      >
                                        <ChevronIcon open={expandedNested.has(p.parameter_key)} />
                                      </button>
                                    )}
                                  </td>
                                  <td className="house-table-cell-text whitespace-nowrap px-3 py-2 text-center text-[hsl(var(--tone-neutral-500))]">
                                    {p.unit}
                                  </td>
                                  <td className={cn(
                                    'house-table-cell-text whitespace-nowrap px-3 py-2 text-center tabular-nums font-semibold',
                                    !hasMeasuredVal && 'text-[hsl(var(--tone-neutral-300))]',
                                  )}>
                                    {isMeasuredEditable ? (
                                      <input
                                        type="text"
                                        inputMode="decimal"
                                        aria-label={`${displayName(p.parameter_key)} measured value`}
                                        value={editingMeasuredValues[p.parameter_key] ?? measuredDisplay}
                                        placeholder="-"
                                        onClick={(event) => event.stopPropagation()}
                                        onFocus={(event) => {
                                          event.stopPropagation()
                                          startMeasuredEdit(p.parameter_key, measuredDisplay)
                                          event.currentTarget.select()
                                        }}
                                        onChange={(event) => updateMeasuredEdit(p.parameter_key, event.target.value)}
                                        onBlur={(event) => commitMeasuredEdit(p.parameter_key, event.target.value)}
                                        onKeyDown={(event) => {
                                          if (event.key === 'Enter') {
                                            event.preventDefault()
                                            event.currentTarget.blur()
                                          } else if (event.key === 'Escape') {
                                            event.preventDefault()
                                            clearMeasuredEdit(p.parameter_key)
                                            event.currentTarget.blur()
                                          }
                                        }}
                                        className="h-8 w-full rounded-md border border-transparent bg-transparent px-2 text-center tabular-nums text-[hsl(var(--foreground))] outline-none transition placeholder:text-[hsl(var(--tone-neutral-300))] focus:border-[hsl(var(--section-style-report-accent)/0.4)] focus:bg-white focus:ring-2 focus:ring-[hsl(var(--section-style-report-accent)/0.12)]"
                                      />
                                    ) : hasMeasuredVal ? measuredDisplay : '\u2014'}
                                  </td>
                                  <td className="house-table-cell-text whitespace-nowrap px-3 py-2 text-center tabular-nums">
                                    {fLL}
                                  </td>
                                  <td className="house-table-cell-text whitespace-nowrap px-3 py-2 text-center tabular-nums font-medium">
                                    {fMean}
                                  </td>
                                  <td className="house-table-cell-text whitespace-nowrap px-3 py-2 text-center tabular-nums">
                                    {fUL}
                                  </td>
                                  <td className="house-table-cell-text whitespace-nowrap px-3 py-0 text-center align-middle">
                                    {hasMeasuredVal && (
                                      <span className={cn(
                                        'inline-flex items-center rounded-full px-2.5 py-0.5 text-[11px] font-semibold ring-1 ring-inset',
                                        severity.grade === 'normal' && 'bg-[hsl(162_22%_90%)] text-[hsl(164_30%_28%)] ring-[hsl(163_22%_80%)]',
                                        severity.grade === 'mild' && 'bg-[hsl(38_40%_90%)] text-[hsl(34_50%_35%)] ring-[hsl(36_36%_80%)]',
                                        severity.grade === 'moderate' && 'bg-[hsl(16_45%_86%)] text-[hsl(5_48%_32%)] ring-[hsl(10_32%_76%)]',
                                        severity.grade === 'severe' && 'bg-[hsl(2_52%_25%)] text-white ring-[hsl(2_52%_20%)]',
                                      )}>
                                        {severity.label}
                                      </span>
                                    )}
                                  </td>
                                  {chartMode === 'on' && (
                                    <td className="bg-white px-2 py-1">
                                      {hasMeasuredVal && hasValidRange(p.ll, p.ul) ? (
                                        <RangeChart
                                          measured={measured!}
                                          ll={p.ll!}
                                          ul={hasSevZones(p) ? effectiveUL(p) : p.ul!}
                                          originalUL={hasSevZones(p) ? p.ul! : undefined}
                                          direction={p.abnormal_direction}
                                          rangeStart={
                                            (() => {
                                              const eul = hasSevZones(p) ? effectiveUL(p) : p.ul!
                                              const hasExplicit = rangeParams.has(p.parameter_key) || rangeParams.has('__global__')
                                              const base = rangeParams.get(p.parameter_key) ?? rangeParams.get('__global__') ?? (hasSevZones(p) ? SEV_ZONE_SCALING : factoryBaseline())
                                              // In factory/default mode: auto-zoom abnormal rows for better context
                                              if (!hasExplicit && !hasSevZones(p)) {
                                                const rel = computeMeasuredRel(measured!, p.ll!, eul)
                                                const isAbn = isAbnormalValue(measured!, p.ll, p.ul, p.abnormal_direction)
                                                if (isAbn) return perMeasurementAutoAdjust(rel, sdTickRels(p, measured!)).rangeStart
                                              }
                                              return base.rangeStart
                                            })()
                                          }
                                          rangeWidth={
                                            (() => {
                                              const eul = hasSevZones(p) ? effectiveUL(p) : p.ul!
                                              const hasExplicit = rangeParams.has(p.parameter_key) || rangeParams.has('__global__')
                                              const base = rangeParams.get(p.parameter_key) ?? rangeParams.get('__global__') ?? (hasSevZones(p) ? SEV_ZONE_SCALING : factoryBaseline())
                                              if (!hasExplicit && !hasSevZones(p)) {
                                                const rel = computeMeasuredRel(measured!, p.ll!, eul)
                                                const isAbn = isAbnormalValue(measured!, p.ll, p.ul, p.abnormal_direction)
                                                if (isAbn) return perMeasurementAutoAdjust(rel, sdTickRels(p, measured!)).rangeWidth
                                              }
                                              return base.rangeWidth
                                            })()
                                          }
                                          previousMarkers={getPrevMarkers(p, measured)}
                                          severityZones={buildSeverityZones(p)}
                                          severityTicks={buildSeverityTicks(p, severity.grade, measured!)}
                                          severityGrade={severity.grade as SevGrade}
                                        />
                                      ) : null}
                                    </td>
                                  )}
                                </tr>
                                {/* Nested child rows (driven by nested_under in reference data) */}
                                {expandedNested.has(p.parameter_key) && nestedChildParams.get(p.parameter_key)?.filter((cp) => {
                                  // Apply same filters as parent rows
                                  if (showFilter === 'recorded' && !displayValues.has(cp.parameter_key)) return false
                                  if (abnormalFilter === 'abnormal') {
                                    const mv = displayValues.get(cp.parameter_key)
                                    if (mv === undefined || !isAbnormalValue(mv, cp.ll, cp.ul, cp.abnormal_direction)) return false
                                  }
                                  return true
                                }).map((cp) => {
                                  const cpBsa = cp.indexing === 'BSA'
                                  const cpUsesNnuhPreset = isCmrReferencePresetAppliedToParameter(cp.parameter_key, sex, referencePreset)
                                  const [cpLL, cpMean, cpUL] = fmtRow([cp.ll, cp.mean, cp.ul], cp.decimal_places)
                                  const cpRawMeasured = measuredValues.get(cp.parameter_key)
                                  const cpRawVal = displayValues.get(cp.parameter_key)
                                  const cpIsDerived = cpRawMeasured === undefined && cpRawVal !== undefined
                                  const cpMeasured = cpRawVal !== undefined && ABS_VALUE_PARAMS.has(cp.parameter_key) ? Math.abs(cpRawVal) : cpRawVal
                                  const cpHasMeasured = cpMeasured !== undefined
                                  const cpMeasuredDisplay = cpHasMeasured ? fmtRow([cpMeasured], cp.decimal_places)[0] : ''
                                  const cpIsMeasuredEditable = cpRawMeasured !== undefined || (!cpIsDerived && !cp.derived)

                                  let cpSeverity: SeverityResult = { grade: 'normal', label: 'Normal' }
                                  if (cpHasMeasured) {
                                    cpSeverity = computeSeverity(
                                      cpMeasured!,
                                      cp.ll, cp.ul, cp.sd,
                                      cp.abnormal_direction,
                                      (cp.severity_label as SeverityLabelType) ?? inferSeverityLabel(cp.parameter_key, cp.major_section, cp.sub_section),
                                      cp.severity_thresholds ?? null,
                                      cp.severity_label_override ?? null,
                                    )
                                  }

                                  return (
                                    <tr
                                      key={cp.parameter_key}
                                      onClick={() => setSelectedParam(cp)}
                                      className={cn(
                                        'cursor-pointer border-b border-[hsl(var(--stroke-soft)/0.4)] transition-colors duration-100',
                                        !(severityMode === 'abnormal' && cpHasMeasured) && 'bg-[hsl(var(--tone-neutral-50)/0.35)] hover:bg-[hsl(var(--tone-neutral-50)/0.65)]',
                                        severityMode === 'abnormal' && cpHasMeasured && cpSeverity.grade === 'normal' && 'bg-[hsl(158_30%_94%)] hover:bg-[hsl(158_30%_91%)]',
                                        severityMode === 'abnormal' && cpHasMeasured && cpSeverity.grade === 'mild' && 'bg-[hsl(46_60%_91%)] hover:bg-[hsl(46_60%_88%)]',
                                        severityMode === 'abnormal' && cpHasMeasured && cpSeverity.grade === 'moderate' && 'bg-[hsl(20_55%_87%)] hover:bg-[hsl(20_55%_84%)]',
                                        severityMode === 'abnormal' && cpHasMeasured && cpSeverity.grade === 'severe' && 'bg-[hsl(4_55%_82%)] hover:bg-[hsl(4_55%_79%)]',
                                      )}
                                    >
                                      <td className="house-table-cell-text whitespace-nowrap px-3 py-2 pl-8 font-medium text-[hsl(var(--foreground))]">
                                        {displayName(cp.parameter_key, true)}
                                        {cpBsa && <BsaPill />}
                                        {cpUsesNnuhPreset && <NnuhPresetMarker />}
                                        {(cpIsDerived || cp.derived) && (
                                          <span className="ml-1.5 inline-flex items-center text-[hsl(var(--tone-neutral-400))]" title={cp.derived_tooltip ?? 'Calculated from LV/RV stroke volume and forward flow'}>
                                            <svg className="h-3.5 w-3.5" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                                              <rect x="2" y="1" width="12" height="14" rx="1.5" />
                                              <line x1="2" y1="5" x2="14" y2="5" />
                                              <line x1="5" y1="8" x2="11" y2="8" />
                                              <line x1="8" y1="5" x2="8" y2="11" />
                                              <line x1="5" y1="13" x2="11" y2="13" />
                                            </svg>
                                          </span>
                                        )}
                                      </td>
                                      <td className="house-table-cell-text whitespace-nowrap px-3 py-2 text-center text-[hsl(var(--tone-neutral-500))]">{cp.unit}</td>
                                      <td className={cn(
                                        'house-table-cell-text whitespace-nowrap px-3 py-2 text-center tabular-nums font-semibold',
                                        !cpHasMeasured && 'text-[hsl(var(--tone-neutral-300))]',
                                      )}>
                                        {cpIsMeasuredEditable ? (
                                          <input
                                            type="text"
                                            inputMode="decimal"
                                            aria-label={`${displayName(cp.parameter_key, true)} measured value`}
                                            value={editingMeasuredValues[cp.parameter_key] ?? cpMeasuredDisplay}
                                            placeholder="-"
                                            onClick={(event) => event.stopPropagation()}
                                            onFocus={(event) => {
                                              event.stopPropagation()
                                              startMeasuredEdit(cp.parameter_key, cpMeasuredDisplay)
                                              event.currentTarget.select()
                                            }}
                                            onChange={(event) => updateMeasuredEdit(cp.parameter_key, event.target.value)}
                                            onBlur={(event) => commitMeasuredEdit(cp.parameter_key, event.target.value)}
                                            onKeyDown={(event) => {
                                              if (event.key === 'Enter') {
                                                event.preventDefault()
                                                event.currentTarget.blur()
                                              } else if (event.key === 'Escape') {
                                                event.preventDefault()
                                                clearMeasuredEdit(cp.parameter_key)
                                                event.currentTarget.blur()
                                              }
                                            }}
                                            className="h-8 w-full rounded-md border border-transparent bg-transparent px-2 text-center tabular-nums text-[hsl(var(--foreground))] outline-none transition placeholder:text-[hsl(var(--tone-neutral-300))] focus:border-[hsl(var(--section-style-report-accent)/0.4)] focus:bg-white focus:ring-2 focus:ring-[hsl(var(--section-style-report-accent)/0.12)]"
                                          />
                                        ) : cpHasMeasured ? cpMeasuredDisplay : '\u2014'}
                                      </td>
                                      <td className="house-table-cell-text whitespace-nowrap px-3 py-2 text-center tabular-nums">{cpLL}</td>
                                      <td className="house-table-cell-text whitespace-nowrap px-3 py-2 text-center tabular-nums font-medium">{cpMean}</td>
                                      <td className="house-table-cell-text whitespace-nowrap px-3 py-2 text-center tabular-nums">{cpUL}</td>
                                      <td className="house-table-cell-text whitespace-nowrap px-3 py-0 text-center align-middle">
                                        {cpHasMeasured && (
                                          <span className={cn(
                                            'inline-flex items-center rounded-full px-2.5 py-0.5 text-[11px] font-semibold ring-1 ring-inset',
                                            cpSeverity.grade === 'normal' && 'bg-[hsl(162_22%_90%)] text-[hsl(164_30%_28%)] ring-[hsl(163_22%_80%)]',
                                            cpSeverity.grade === 'mild' && 'bg-[hsl(38_40%_90%)] text-[hsl(34_50%_35%)] ring-[hsl(36_36%_80%)]',
                                            cpSeverity.grade === 'moderate' && 'bg-[hsl(16_45%_86%)] text-[hsl(5_48%_32%)] ring-[hsl(10_32%_76%)]',
                                            cpSeverity.grade === 'severe' && 'bg-[hsl(2_52%_25%)] text-white ring-[hsl(2_52%_20%)]',
                                          )}>
                                            {cpSeverity.label}
                                          </span>
                                        )}
                                      </td>
                                      {chartMode === 'on' && (
                                        <td className="bg-white px-2 py-1">
                                          {cpHasMeasured && hasValidRange(cp.ll, cp.ul) ? (
                                            <RangeChart
                                              measured={cpMeasured!}
                                              ll={cp.ll!}
                                              ul={hasSevZones(cp) ? effectiveUL(cp) : cp.ul!}
                                              originalUL={hasSevZones(cp) ? cp.ul! : undefined}
                                              direction={cp.abnormal_direction}
                                              rangeStart={(() => {
                                                const eul = hasSevZones(cp) ? effectiveUL(cp) : cp.ul!
                                                const hasExplicit = rangeParams.has(cp.parameter_key) || rangeParams.has('__global__')
                                                const base = rangeParams.get(cp.parameter_key) ?? rangeParams.get('__global__') ?? (hasSevZones(cp) ? SEV_ZONE_SCALING : factoryBaseline())
                                                if (!hasExplicit) { const rel = computeMeasuredRel(cpMeasured!, cp.ll!, eul); const pos = computeMeasuredPos(rel, base.rangeStart, base.rangeWidth); if (pos >= 0.98 || pos <= 0.02) return perMeasurementAutoAdjust(rel, sdTickRels(cp, cpMeasured!)).rangeStart; }
                                                return base.rangeStart
                                              })()}
                                              rangeWidth={(() => {
                                                const eul = hasSevZones(cp) ? effectiveUL(cp) : cp.ul!
                                                const hasExplicit = rangeParams.has(cp.parameter_key) || rangeParams.has('__global__')
                                                const base = rangeParams.get(cp.parameter_key) ?? rangeParams.get('__global__') ?? (hasSevZones(cp) ? SEV_ZONE_SCALING : factoryBaseline())
                                                if (!hasExplicit) { const rel = computeMeasuredRel(cpMeasured!, cp.ll!, eul); const pos = computeMeasuredPos(rel, base.rangeStart, base.rangeWidth); if (pos >= 0.98 || pos <= 0.02) return perMeasurementAutoAdjust(rel, sdTickRels(cp, cpMeasured!)).rangeWidth; }
                                                return base.rangeWidth
                                              })()}
                                              previousMarkers={getPrevMarkers(cp, cpMeasured)}
                                              severityZones={buildSeverityZones(cp)}
                                              severityTicks={buildSeverityTicks(cp, cpSeverity.grade, cpMeasured!)}
                                              severityGrade={cpSeverity.grade as SevGrade}
                                            />
                                          ) : null}
                                        </td>
                                      )}
                                    </tr>
                                  )
                                })}
                                </Fragment>
                              )
                            })}
                          </Fragment>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}

      {/* Parameter drilldown */}
      {selectedParam && (
        <ParameterDrilldown
          param={selectedParam}
          sex={sex}
          measuredValue={displayValues.get(selectedParam.parameter_key)}
          onClose={() => setSelectedParam(null)}
        />
      )}
    </Stack>
  )
}
