import { Fragment, useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react'
import { ExternalLink } from 'lucide-react'

import { PageHeader, Row, Stack, DrilldownSheet } from '@/components/primitives'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import { SectionMarker } from '@/components/patterns'
import type { CmrCanonicalParam, CmrCanonicalTableResponse, PapillaryMode } from '@/lib/cmr-api'
import { fetchConfig, fetchReferenceParameters, updateConfig } from '@/lib/cmr-api'
import { getExtractionResult, subscribeExtractionResult } from '@/lib/cmr-report-store'
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
const ABS_VALUE_PARAMS = new Set(['AV backward flow', 'PV backward flow'])

function sentenceCase(s: string): string {
  const lower = s.toLowerCase()
  return lower.charAt(0).toUpperCase() + lower.slice(1)
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

/** For params with severity thresholds, compute an effective UL that spans
 *  the full severity scale so the chart isn't compressed into the normal zone. */
function effectiveUL(param: CmrCanonicalParam): number {
  const t = param.severity_thresholds
  if (!t || param.ul == null) return param.ul ?? 0
  // Use the highest defined threshold + 15% headroom
  const highest = t.severe ?? t.moderate ?? t.mild ?? param.ul
  if (highest == null) return param.ul
  return highest * 1.15
}

/** Scaling for severity-zone charts: use 90% of bar width so zones are
 *  clearly visible and not squeezed into a small strip. */
const SEV_ZONE_SCALING = { rangeStart: 0.05, rangeWidth: 0.9 } as const

/** Build severity zones from a param's threshold data (if present). */
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
  severityGrade?: SevGrade
}) {
  const measuredRel = computeMeasuredRel(measured, ll, ul)
  const measuredPos = computeMeasuredPos(measuredRel, rangeStart, rangeWidth)
  const abnormal = isAbnormalValue(measured, ll, ul, direction)

  const bandLeftPct = `${rangeStart * 100}%`
  const bandWidthPct = `${rangeWidth * 100}%`
  const dotPct = `${measuredPos * 100}%`

  // Build severity zone bands (only for params with thresholds)
  const zoneBands = severityZones ? (() => {
    const bands: Array<{ grade: SevGrade; leftPct: string; widthPct: string }> = []
    const refUL = originalUL ?? ul
    // Normal zone: from 0% to original UL position
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
      const isLast = i === grades.length - 1 || !severityZones.find((z) => z.grade === grades[i + 1])
      if (isLast) {
        // Last zone extends to 100% of the bar
        bands.push({ grade: grades[i], leftPct: `${startPos * 100}%`, widthPct: `${(1 - startPos) * 100}%` })
      } else {
        const endVal = zone.threshold ?? ul
        const endRel = computeMeasuredRel(endVal, ll, ul)
        const endPos = computeMeasuredPos(endRel, rangeStart, rangeWidth)
        bands.push({ grade: grades[i], leftPct: `${startPos * 100}%`, widthPct: `${Math.max(0, endPos - startPos) * 100}%` })
        prevThreshold = endVal
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
  const [data, setData] = useState<CmrCanonicalTableResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({})
  const [selectedParam, setSelectedParam] = useState<CmrCanonicalParam | null>(null)
  const [papMode, setPapMode] = useState<PapillaryMode>('mass')
  const [showFilter, setShowFilter] = useState<'all' | 'recorded'>('recorded')
  const [indexFilter, setIndexFilter] = useState<'all' | 'indexed'>('all')
  const [chartMode, setChartMode] = useState<'off' | 'on'>('on')
  const [abnormalFilter, setAbnormalFilter] = useState<'all' | 'abnormal'>('all')
  const [severityMode, setSeverityMode] = useState<'off' | 'abnormal'>('off')
  const [rangeParams, setRangeParams] = useState<Map<string, RangeParam>>(new Map())
  const [scalingMode, setScalingMode] = useState<'factory' | 'global' | 'per-meas'>('global')
  const [expandedNested, setExpandedNested] = useState<Set<string>>(new Set())
  const [importOpen, setImportOpen] = useState(false)
  const [importText, setImportText] = useState('')
  const [importFile, setImportFile] = useState<{ name: string; dataUrl: string } | null>(null)
  const [importing, setImporting] = useState(false)
  const [importError, setImportError] = useState<string | null>(null)
  const importFileRef = useRef<HTMLInputElement>(null)
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
    return map
  }, [extraction])

  // Derived (calculated) values — indirect volumetric method
  const derivedValues = useMemo(() => {
    const derived = new Map<string, number>()
    const lvsv = measuredValues.get('LV SV')
    const rvsv = measuredValues.get('RV SV')
    const avEff = measuredValues.get('AV effective forward flow (per heartbeat)')
    const pvEff = measuredValues.get('PV effective forward flow (per heartbeat)')

    // MR volume = LV SV − AV effective forward flow
    if (lvsv !== undefined && avEff !== undefined && !measuredValues.has('MR volume (per heartbeat)')) {
      const mrVol = lvsv - avEff
      if (mrVol >= 0) {
        derived.set('MR volume (per heartbeat)', Math.round(mrVol * 10) / 10)
        if (lvsv > 0) derived.set('MR regurgitant fraction', Math.round((mrVol / lvsv) * 1000) / 10)
      }
    }

    // TR volume = RV SV − PV effective forward flow
    if (rvsv !== undefined && pvEff !== undefined && !measuredValues.has('TR volume (per heartbeat)')) {
      const trVol = rvsv - pvEff
      if (trVol >= 0) {
        derived.set('TR volume (per heartbeat)', Math.round(trVol * 10) / 10)
        if (rvsv > 0) derived.set('TR regurgitant fraction', Math.round((trVol / rvsv) * 1000) / 10)
      }
    }

    return derived
  }, [measuredValues])
  const sex = extraction?.demographics?.sex ?? 'Male'
  const age = extraction?.demographics?.age ?? undefined
  const heartRate = extraction?.demographics?.heart_rate ?? undefined
  const sectionRefs = useRef<Record<string, HTMLDivElement | null>>({})

  useEffect(() => {
    fetchConfig().then((c) => setPapMode(c.papillary_mode)).catch(() => {})
  }, [])

  const toggleCollapse = (key: string) => {
    setCollapsed((prev) => ({ ...prev, [key]: !prev[key] }))
  }

  const load = useCallback(async () => {
    if (!data) setLoading(true)
    try {
      const result = await fetchReferenceParameters(sex, age)
      setData(result)
    } catch {
      // ignore
    } finally {
      setLoading(false)
    }
  }, [sex, age]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    void load()
  }, [load])

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
      if (showFilter === 'recorded') params = params.filter((p) => measuredValues.has(p.parameter_key) || derivedValues.has(p.parameter_key))
      if (indexFilter === 'indexed') {
        // Build set from the full (unfiltered) group so we know which absolutes have an indexed counterpart
        const indexedKeys = new Set(g.params.filter((p) => p.indexing === 'BSA').map((p) => p.parameter_key.replace(/\s*\(i\)\s*$/, '')))
        // Hide absolute params whose indexed variant exists; keep everything else
        params = params.filter((p) => p.indexing === 'BSA' || !indexedKeys.has(p.parameter_key))
      }
      if (abnormalFilter === 'abnormal') {
        params = params.filter((p) => {
          const m = measuredValues.get(p.parameter_key)
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
        // Skip severity-threshold params — they use their own fixed scaling
        if (p.severity_thresholds) continue
        const m = measuredValues.get(p.parameter_key)
        if (m !== undefined && hasValidRange(p.ll, p.ul)) {
          rels.push(computeMeasuredRel(m, p.ll!, p.ul!))
        }
        // Include previous study values in scaling when visible
        if (prevVisible && hasValidRange(p.ll, p.ul)) {
          for (const s of prevStudies) {
            const pv = s.values[p.parameter_key]
            if (pv !== undefined) {
              rels.push(computeMeasuredRel(pv, p.ll!, p.ul!))
            }
          }
        }
      }
    }
    return rels
  }, [groups, measuredValues, prevStudies, prevVisible])

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
          <span className="text-sm font-semibold text-[hsl(var(--foreground))]">{age != null ? `${age} years` : '—'}</span>
        </div>
        {heartRate != null && (
          <div className="rounded-md border border-[hsl(var(--stroke-soft)/0.72)] bg-[hsl(var(--tone-neutral-50))] px-4 py-2">
            <span className="text-sm font-semibold text-[hsl(var(--foreground))]">{Math.round(heartRate)} bpm</span>
          </div>
        )}
      </div>

      {/* Controls bar */}
      <div className="flex flex-wrap items-start gap-5">
        {/* Preference */}
        <div className="flex flex-col gap-1">
          <div className="flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wider text-[hsl(var(--tone-neutral-400))]">
            <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M12.5 2.5a2 2 0 0 1 0 3l-9.5 9L1 15l.5-2 9.5-9a2 2 0 0 1 3 0z" /></svg>
            Preference
          </div>
          <PillToggle
            options={[
              { key: 'mass', label: 'Pap in LV Mass' },
              { key: 'blood_pool', label: 'Pap in Blood Pool' },
            ]}
            value={papMode}
            onChange={(v) => { setPapMode(v as PapillaryMode); void updateConfig({ papillary_mode: v as PapillaryMode }) }}
          />
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
                      const m = measuredValues.get(p.parameter_key)
                      if (m !== undefined && hasValidRange(p.ll, p.ul)) {
                        const rel = computeMeasuredRel(m, p.ll!, p.ul!)
                        newMap.set(p.parameter_key, perMeasurementAutoAdjust(rel))
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
              className="rounded-md border border-[hsl(var(--border))] px-3 py-1.5 text-xs font-medium text-[hsl(var(--foreground))] transition-colors hover:bg-[hsl(var(--tone-neutral-100))]"
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
                  <div className="overflow-x-auto rounded-b-lg border-x border-b border-[hsl(var(--stroke-soft)/0.72)]">
                    <table data-house-no-column-resize="true" className="w-full table-fixed border-collapse text-sm">
                      <colgroup>
                        <col style={{ width: chartMode === 'on' ? '28%' : '28%' }} />
                        <col style={{ width: chartMode === 'on' ? '5%' : '8%' }} />
                        <col style={{ width: chartMode === 'on' ? '6%' : '11%' }} />
                        <col style={{ width: chartMode === 'on' ? '5%' : '9%' }} />
                        <col style={{ width: chartMode === 'on' ? '5%' : '9%' }} />
                        <col style={{ width: chartMode === 'on' ? '5%' : '9%' }} />
                        <col style={{ width: chartMode === 'on' ? '14%' : '26%' }} />
                        {chartMode === 'on' && <col style={{ width: '32%' }} />}
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
                              const [fLL, fMean, fUL, _fSD] = fmtRow([p.ll, p.mean, p.ul, p.sd], p.decimal_places)
                              const rawMeasured = measuredValues.get(p.parameter_key)
                              const isDerived = rawMeasured === undefined && derivedValues.has(p.parameter_key)
                              const rawVal = rawMeasured ?? derivedValues.get(p.parameter_key)
                              // Backward flow: strip sign — the label already implies direction
                              const measured = rawVal !== undefined && ABS_VALUE_PARAMS.has(p.parameter_key)
                                ? Math.abs(rawVal)
                                : rawVal
                              const hasMeasuredVal = measured !== undefined

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
                                    'cursor-pointer border-b border-[hsl(var(--stroke-soft)/0.4)] transition-colors duration-100',
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
                                    {isDerived && (
                                      <span className="ml-1.5 inline-flex items-center text-[hsl(var(--tone-neutral-400))]" title="Calculated from LV/RV stroke volume and forward flow">
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
                                    {hasMeasuredVal ? fmtRow([measured], p.decimal_places)[0] : '\u2014'}
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
                                          ul={p.severity_thresholds ? effectiveUL(p) : p.ul!}
                                          originalUL={p.severity_thresholds ? p.ul! : undefined}
                                          direction={p.abnormal_direction}
                                          rangeStart={
                                            p.severity_thresholds
                                              ? SEV_ZONE_SCALING.rangeStart
                                              : (() => {
                                                  const base = rangeParams.get(p.parameter_key) ?? rangeParams.get('__global__') ?? factoryBaseline()
                                                  // Fall back to per-measurement if dot would clip
                                                  const rel = computeMeasuredRel(measured!, p.ll!, p.ul!)
                                                  const pos = computeMeasuredPos(rel, base.rangeStart, base.rangeWidth)
                                                  if (pos >= 0.98 || pos <= 0.02) return perMeasurementAutoAdjust(rel).rangeStart
                                                  return base.rangeStart
                                                })()
                                          }
                                          rangeWidth={
                                            p.severity_thresholds
                                              ? SEV_ZONE_SCALING.rangeWidth
                                              : (() => {
                                                  const base = rangeParams.get(p.parameter_key) ?? rangeParams.get('__global__') ?? factoryBaseline()
                                                  const rel = computeMeasuredRel(measured!, p.ll!, p.ul!)
                                                  const pos = computeMeasuredPos(rel, base.rangeStart, base.rangeWidth)
                                                  if (pos >= 0.98 || pos <= 0.02) return perMeasurementAutoAdjust(rel).rangeWidth
                                                  return base.rangeWidth
                                                })()
                                          }
                                          previousMarkers={getPrevMarkers(p, measured)}
                                          severityZones={buildSeverityZones(p)}
                                          severityGrade={severity.grade as SevGrade}
                                        />
                                      ) : null}
                                    </td>
                                  )}
                                </tr>
                                {/* Nested child rows (driven by nested_under in reference data) */}
                                {expandedNested.has(p.parameter_key) && nestedChildParams.get(p.parameter_key)?.filter((cp) => {
                                  // Apply same filters as parent rows
                                  if (showFilter === 'recorded' && !measuredValues.has(cp.parameter_key) && !derivedValues.has(cp.parameter_key)) return false
                                  if (abnormalFilter === 'abnormal') {
                                    const mv = measuredValues.get(cp.parameter_key)
                                    if (mv === undefined || !isAbnormalValue(mv, cp.ll, cp.ul, cp.abnormal_direction)) return false
                                  }
                                  return true
                                }).map((cp) => {
                                  const cpBsa = cp.indexing === 'BSA'
                                  const [cpLL, cpMean, cpUL] = fmtRow([cp.ll, cp.mean, cp.ul], cp.decimal_places)
                                  const cpRawMeasured = measuredValues.get(cp.parameter_key)
                                  const cpIsDerived = cpRawMeasured === undefined && derivedValues.has(cp.parameter_key)
                                  const cpRawVal = cpRawMeasured ?? derivedValues.get(cp.parameter_key)
                                  const cpMeasured = cpRawVal !== undefined && ABS_VALUE_PARAMS.has(cp.parameter_key) ? Math.abs(cpRawVal) : cpRawVal
                                  const cpHasMeasured = cpMeasured !== undefined

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
                                        {cpIsDerived && (
                                          <span className="ml-1.5 inline-flex items-center text-[hsl(var(--tone-neutral-400))]" title="Calculated from LV/RV stroke volume and forward flow">
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
                                        {cpHasMeasured ? fmtRow([cpMeasured], cp.decimal_places)[0] : '\u2014'}
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
                                              ul={cp.severity_thresholds ? effectiveUL(cp) : cp.ul!}
                                              originalUL={cp.severity_thresholds ? cp.ul! : undefined}
                                              direction={cp.abnormal_direction}
                                              rangeStart={cp.severity_thresholds ? SEV_ZONE_SCALING.rangeStart : (() => {
                                                const base = rangeParams.get(cp.parameter_key) ?? rangeParams.get('__global__') ?? factoryBaseline()
                                                const rel = computeMeasuredRel(cpMeasured!, cp.ll!, cp.ul!)
                                                const pos = computeMeasuredPos(rel, base.rangeStart, base.rangeWidth)
                                                return (pos >= 0.98 || pos <= 0.02) ? perMeasurementAutoAdjust(rel).rangeStart : base.rangeStart
                                              })()}
                                              rangeWidth={cp.severity_thresholds ? SEV_ZONE_SCALING.rangeWidth : (() => {
                                                const base = rangeParams.get(cp.parameter_key) ?? rangeParams.get('__global__') ?? factoryBaseline()
                                                const rel = computeMeasuredRel(cpMeasured!, cp.ll!, cp.ul!)
                                                const pos = computeMeasuredPos(rel, base.rangeStart, base.rangeWidth)
                                                return (pos >= 0.98 || pos <= 0.02) ? perMeasurementAutoAdjust(rel).rangeWidth : base.rangeWidth
                                              })()}
                                              previousMarkers={getPrevMarkers(cp, cpMeasured)}
                                              severityZones={buildSeverityZones(cp)}
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
          measuredValue={measuredValues.get(selectedParam.parameter_key)}
          onClose={() => setSelectedParam(null)}
        />
      )}
    </Stack>
  )
}
