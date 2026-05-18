/**
 * CmrParameterTable — Quantitative metrics table for the CMR extractor.
 *
 * Ported from cmr-new-report-page.tsx to be a reusable component.
 * Uses the same age/sex-specific reference ranges, severity grading,
 * chart scaling, PAP toggle, and visual design.
 */
import { Fragment, useMemo, useState } from 'react'

import { TooltipProvider } from '@/components/ui/tooltip'
import type { CmrCanonicalParam, PapillaryMode } from '@/lib/cmr-api'
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
// Types
// ---------------------------------------------------------------------------

export type DemographicPill = {
  label: string
  tone?: 'danger' | 'positive' | 'warning' | 'accent' | 'neutral'
  className?: string
}

type GroupedSection = { major: string; sub: string; params: CmrCanonicalParam[] }

type SevGrade = 'normal' | 'mild' | 'moderate' | 'severe'

type SeverityZone = { grade: SevGrade; threshold: number | null }

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

export type CmrParameterTableProps = {
  canonicalParams: CmrCanonicalParam[]
  measurements: Map<string, number>
  editable?: boolean
  onValueChange?: (paramKey: string, value: number | null) => void
  demographics?: DemographicPill[]
  papMode: PapillaryMode
  onPapChange: (mode: PapillaryMode) => void
  initialShowFilter?: 'all' | 'recorded'
}

// ---------------------------------------------------------------------------
// Helpers (from cmr-new-report-page.tsx)
// ---------------------------------------------------------------------------

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
  if (!isNested) name = name.replace(/\s*\(per heartbeat\)\s*$/, '')
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

function fmtRow(values: (number | null)[], dp: number = 0): string[] {
  return values.map((v) => {
    if (v === null) return '\u2014'
    return v.toFixed(dp)
  })
}

const ABS_VALUE_PARAMS = new Set([
  'AV backward flow (per heartbeat)',
  'AV backward flow (per minute)',
  'PV backward flow (per heartbeat)',
  'PV backward flow (per minute)',
])

function sentenceCase(s: string): string {
  const lower = s.toLowerCase()
  return lower.charAt(0).toUpperCase() + lower.slice(1)
}

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

function buildNestedChildrenSet(nestedMap: Record<string, string[]>): Set<string> {
  return new Set(Object.values(nestedMap).flat())
}

function effectiveUL(param: CmrCanonicalParam): number {
  const t = param.severity_thresholds
  if (!t || param.ul == null) return param.ul ?? 0
  const highest = t.severe ?? t.moderate ?? t.mild ?? param.ul
  if (highest == null) return param.ul
  return highest * 1.15
}

function hasSevZones(param: CmrCanonicalParam): boolean {
  return !!param.severity_thresholds
}

function hasSevTicks(param: CmrCanonicalParam, measured?: number): boolean {
  if (param.severity_thresholds) return false
  if (!param.sd || param.sd <= 0 || param.ll == null || param.ul == null) return false
  const dir = param.abnormal_direction
  if (dir === 'high' || dir === 'low') return true
  if (dir === 'both' && measured != null) {
    return measured > param.ul || measured < param.ll
  }
  return false
}

function buildSeverityTicks(param: CmrCanonicalParam, grade?: string, measured?: number): number[] | undefined {
  if (!hasSevTicks(param, measured)) return undefined
  let dir = param.abnormal_direction
  if (dir === 'both' && measured != null && param.ll != null && param.ul != null) {
    if (measured > param.ul) dir = 'high'
    else if (measured < param.ll) dir = 'low'
    else return undefined
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
  if (grade === 'mild') return [modSevBoundary]
  if (grade === 'moderate') return [mildModBoundary, modSevBoundary]
  if (grade === 'severe') return [mildModBoundary, modSevBoundary]
  return undefined
}

function buildSeverityZones(param: CmrCanonicalParam): SeverityZone[] | undefined {
  const t = param.severity_thresholds
  if (!t) return undefined
  return [
    { grade: 'mild', threshold: t.mild },
    { grade: 'moderate', threshold: t.moderate },
    { grade: 'severe', threshold: t.severe },
  ]
}

const SEV_ZONE_SCALING = { rangeStart: 0.05, rangeWidth: 0.9 } as const

function sdTickRels(param: CmrCanonicalParam, measured?: number): number[] | undefined {
  const ticks = buildSeverityTicks(param, 'moderate', measured)
  if (!ticks || param.ll == null || param.ul == null) return undefined
  const eul = hasSevZones(param) ? effectiveUL(param) : param.ul
  return ticks.map(t => computeMeasuredRel(t, param.ll!, eul))
}

// ---------------------------------------------------------------------------
// Severity styles
// ---------------------------------------------------------------------------

const SEV_ZONE_COLORS: Record<SevGrade, string> = {
  normal: 'hsl(158 35% 82%)',
  mild: 'hsl(46 55% 80%)',
  moderate: 'hsl(20 50% 76%)',
  severe: 'hsl(4 50% 68%)',
}

// ---------------------------------------------------------------------------
// Icon components
// ---------------------------------------------------------------------------

function ChevronIcon({ open }: { open: boolean }) {
  return (
    <svg
      className={cn('h-3.5 w-3.5 shrink-0 text-[hsl(var(--muted-foreground))] transition-transform duration-150', open && 'rotate-90')}
      viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
    >
      <path d="M6 4l4 4-4 4" />
    </svg>
  )
}

function BsaPill() {
  return (
    <span className="ml-1.5 inline-flex items-center rounded-full bg-[hsl(var(--tone-neutral-200))] px-[7px] py-[1px] text-[10px] font-semibold tracking-wide text-[hsl(var(--tone-neutral-600))]">
      BSA
    </span>
  )
}

function RecordedIcon() { return <span className="text-[10px] font-bold tabular-nums tracking-tight">123</span> }
function BsaFilterIcon() { return <span className="text-[10px] font-semibold tracking-wide">BSA</span> }
function BsaOffIcon() { return <span className="relative text-[10px] font-semibold tracking-wide opacity-60">BSA<span className="absolute inset-0 flex items-center"><span className="block w-full h-[1.5px] bg-current rotate-[-20deg]" /></span></span> }
function AllRowsIcon() {
  return (
    <svg className="h-3.5 w-3.5" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
      <line x1="1" y1="4" x2="15" y2="4" /><line x1="1" y1="8" x2="15" y2="8" /><line x1="1" y1="12" x2="15" y2="12" />
    </svg>
  )
}
function SeverityIcon() {
  return (
    <svg className="h-3.5 w-3.5" viewBox="0 0 16 16" fill="currentColor">
      <circle cx="3.5" cy="3.5" r="3" fill="hsl(158 30% 50%)" />
      <circle cx="12.5" cy="3.5" r="3" fill="hsl(38 60% 55%)" />
      <circle cx="8" cy="12" r="3" fill="hsl(4 55% 50%)" />
    </svg>
  )
}
function SeverityOffIcon() {
  return (
    <svg className="h-3.5 w-3.5" viewBox="0 0 16 16" fill="currentColor" stroke="currentColor">
      <circle cx="3.5" cy="3.5" r="3" fill="hsl(158 30% 50%)" opacity="0.35" />
      <circle cx="12.5" cy="3.5" r="3" fill="hsl(38 60% 55%)" opacity="0.35" />
      <circle cx="8" cy="12" r="3" fill="hsl(4 55% 50%)" opacity="0.35" />
      <line x1="1" y1="1" x2="15" y2="15" strokeWidth="2" strokeLinecap="round" />
    </svg>
  )
}
function ChartIcon() {
  return (
    <svg className="h-3.5 w-3.5" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <rect x="1" y="8" width="3" height="7" rx="0.5" /><rect x="6.5" y="4" width="3" height="11" rx="0.5" /><rect x="12" y="1" width="3" height="14" rx="0.5" />
    </svg>
  )
}
function ChartOffIcon() {
  return (
    <svg className="h-3.5 w-3.5" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <rect x="1" y="8" width="3" height="7" rx="0.5" opacity="0.4" /><rect x="6.5" y="4" width="3" height="11" rx="0.5" opacity="0.4" /><rect x="12" y="1" width="3" height="14" rx="0.5" opacity="0.4" />
      <line x1="2" y1="2" x2="14" y2="14" strokeWidth="2" />
    </svg>
  )
}

function ChartChipIcon({ variant }: { variant: 'global' | 'per-meas' }) {
  return (
    <svg width="16" height="12" viewBox="0 0 16 12" fill="none" className="shrink-0">
      <line x1="0" y1="6" x2="16" y2="6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeOpacity="0.4" />
      <circle cx={variant === 'global' ? 10 : 5} cy="6" r="3" fill="currentColor" />
    </svg>
  )
}

// ---------------------------------------------------------------------------
// PillToggle
// ---------------------------------------------------------------------------

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
        if (o.tooltip) {
          return (
            <span key={o.key} className="group/tip relative inline-flex">
              {btn}
              <span className="pointer-events-none absolute left-1/2 -translate-x-1/2 bottom-full mb-2 z-50 whitespace-nowrap rounded-md bg-[hsl(var(--foreground))] px-2.5 py-1.5 text-[11px] font-medium text-white opacity-0 shadow-lg transition-opacity duration-150 group-hover/tip:opacity-100">
                {o.tooltip}
                <span className="absolute left-1/2 -translate-x-1/2 -bottom-1 h-2 w-2 rotate-45 bg-[hsl(var(--foreground))]" />
              </span>
            </span>
          )
        }
        return btn
      })}
    </div>
  )
}

// ---------------------------------------------------------------------------
// RangeChart
// ---------------------------------------------------------------------------

function RangeChart({
  measured, ll, ul, originalUL, direction, rangeStart, rangeWidth,
  severityZones, severityTicks, severityGrade,
}: {
  measured: number; ll: number; ul: number; originalUL?: number; direction: string
  rangeStart: number; rangeWidth: number
  severityZones?: SeverityZone[]; severityTicks?: number[]; severityGrade?: SevGrade
}) {
  const measuredRel = computeMeasuredRel(measured, ll, ul)
  const measuredPos = computeMeasuredPos(measuredRel, rangeStart, rangeWidth)
  const abnormal = isAbnormalValue(measured, ll, ul, direction)
  const bandLeftPct = `${rangeStart * 100}%`
  const bandWidthPct = `${rangeWidth * 100}%`
  const dotPct = `${measuredPos * 100}%`

  const zoneBands = severityZones ? (() => {
    const bands: Array<{ grade: SevGrade; leftPct: string; widthPct: string }> = []
    const isLowDir = direction === 'low'
    if (isLowDir) {
      const grades: SevGrade[] = ['severe', 'moderate', 'mild']
      let prevThreshold: number | null = null
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
      const refLL = originalUL ?? ll
      const normalStartRel = computeMeasuredRel(refLL, ll, ul)
      const normalStartPos = computeMeasuredPos(normalStartRel, rangeStart, rangeWidth)
      bands.push({ grade: 'normal', leftPct: `${normalStartPos * 100}%`, widthPct: `${(1 - normalStartPos) * 100}%` })
    } else {
      const refUL = originalUL ?? ul
      const normalEndRel = computeMeasuredRel(refUL, ll, ul)
      const normalEndPos = computeMeasuredPos(normalEndRel, rangeStart, rangeWidth)
      bands.push({ grade: 'normal', leftPct: '0%', widthPct: `${normalEndPos * 100}%` })
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

  const DOT_STYLES: Record<SevGrade, { border: string }> = {
    normal: { border: 'hsl(158 35% 45%)' },
    mild: { border: 'hsl(46 55% 45%)' },
    moderate: { border: 'hsl(20 50% 45%)' },
    severe: { border: 'hsl(4 50% 40%)' },
  }
  const grade = severityGrade ?? (abnormal ? 'severe' : 'normal')
  const ds = DOT_STYLES[grade]

  return (
    <TooltipProvider delayDuration={0}>
      <div className="group/chart relative mx-[5px] h-[22px] w-[calc(100%-10px)]">
        <div className="absolute inset-x-0 top-1/2 h-[2px] -translate-y-1/2 rounded-sm bg-[hsl(var(--tone-neutral-300))]" />
        {zoneBands ? (
          <>
            {zoneBands.map((b) => (
              <div
                key={b.grade}
                className="absolute top-1/2 h-4 -translate-y-1/2 transition-all duration-200"
                style={{ left: b.leftPct, width: b.widthPct, backgroundColor: SEV_ZONE_COLORS[b.grade] }}
              />
            ))}
            {zoneBands.slice(1).map((b) => (
              <div
                key={`div-${b.grade}`}
                className="absolute top-1/2 h-4 w-px -translate-y-1/2 bg-white/70"
                style={{ left: b.leftPct }}
              />
            ))}
          </>
        ) : (
          <div
            className="absolute top-1/2 h-4 -translate-y-1/2 rounded border border-[hsl(var(--tone-positive-300)/0.18)] bg-[hsl(var(--tone-positive-300)/0.14)] transition-all duration-200 group-hover/chart:border-[hsl(var(--tone-positive-500)/0.25)] group-hover/chart:bg-[hsl(var(--tone-positive-300)/0.28)]"
            style={{ left: bandLeftPct, width: bandWidthPct }}
          />
        )}
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
        <div
          className="absolute top-1/2 h-[10px] w-[10px] -translate-x-1/2 -translate-y-1/2 rounded-full border-2 bg-white transition-all duration-200"
          style={{ left: dotPct, borderColor: ds.border, boxShadow: `0 1px 3px ${ds.border}33` }}
        />
      </div>
    </TooltipProvider>
  )
}

// ---------------------------------------------------------------------------
// ChartControlStrip
// ---------------------------------------------------------------------------

function ChartControlStrip({
  onGlobalAuto, onPerMeasAuto, scalingMode,
}: {
  onGlobalAuto: () => void; onPerMeasAuto: () => void
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

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export function CmrParameterTable({
  canonicalParams,
  measurements,
  editable = false,
  onValueChange,
  demographics,
  papMode,
  onPapChange,
  initialShowFilter = 'recorded',
}: CmrParameterTableProps) {
  // State
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set())
  const [expandedNested, setExpandedNested] = useState<Set<string>>(new Set())
  const [showFilter, setShowFilter] = useState<'all' | 'recorded'>(initialShowFilter)
  const [indexFilter, setIndexFilter] = useState<'all' | 'indexed'>('all')
  const [abnormalFilter, setAbnormalFilter] = useState<'all' | 'abnormal'>('all')
  const [severityMode, setSeverityMode] = useState<'off' | 'abnormal'>('off')
  const [chartMode, setChartMode] = useState<'off' | 'on'>('on')
  const [scalingMode, setScalingMode] = useState<'factory' | 'global' | 'per-meas'>('factory')
  const [rangeParams, setRangeParams] = useState<Map<string, RangeParam>>(new Map())
  const [editingValues, setEditingValues] = useState<Record<string, string>>({})

  const toggleCollapse = (section: string) => {
    setCollapsed((prev) => {
      const next = new Set(prev)
      if (next.has(section)) next.delete(section)
      else next.add(section)
      return next
    })
  }

  // Build nested param structures
  const nestedParamMap = useMemo(() => buildNestedParamMap(canonicalParams), [canonicalParams])
  const nestedChildrenSet = useMemo(() => buildNestedChildrenSet(nestedParamMap), [nestedParamMap])
  const nestedChildParams = useMemo(() => {
    const map = new Map<string, CmrCanonicalParam[]>()
    for (const [parentKey, childKeys] of Object.entries(nestedParamMap)) {
      map.set(parentKey, childKeys.map((ck) => canonicalParams.find((p) => p.parameter_key === ck)!).filter(Boolean))
    }
    return map
  }, [canonicalParams, nestedParamMap])

  // Filter params: remove nested children from main rows
  const topLevelParams = useMemo(
    () => canonicalParams.filter((p) => !nestedChildrenSet.has(p.parameter_key)),
    [canonicalParams, nestedChildrenSet],
  )

  // Apply filters
  const filteredParams = useMemo(() => {
    let params = topLevelParams
    if (showFilter === 'recorded') {
      params = params.filter((p) => {
        if (measurements.has(p.parameter_key)) return true
        // Keep parent if any child has data
        const children = nestedParamMap[p.parameter_key]
        return children?.some((ck) => measurements.has(ck))
      })
    }
    if (indexFilter === 'indexed') {
      params = params.filter((p) => p.indexing === 'BSA' || !p.parameter_key.endsWith('(i)'))
    }
    if (abnormalFilter === 'abnormal') {
      params = params.filter((p) => {
        const mv = measurements.get(p.parameter_key)
        if (mv === undefined) return false
        return isAbnormalValue(mv, p.ll, p.ul, p.abnormal_direction)
      })
    }
    return params
  }, [topLevelParams, measurements, showFilter, indexFilter, abnormalFilter, nestedParamMap])

  const groups = useMemo(() => groupBySections(filteredParams), [filteredParams])

  // Collect measured rels for global auto-adjust
  const collectMeasuredRels = () => {
    const rels: number[] = []
    for (const p of filteredParams) {
      const m = measurements.get(p.parameter_key)
      if (m !== undefined && hasValidRange(p.ll, p.ul)) {
        const eul = hasSevZones(p) ? effectiveUL(p) : p.ul!
        rels.push(computeMeasuredRel(m, p.ll!, eul))
      }
    }
    return rels
  }

  // Editing helpers
  const startEdit = (key: string, display: string) => setEditingValues((prev) => ({ ...prev, [key]: display }))
  const updateEdit = (key: string, val: string) => setEditingValues((prev) => ({ ...prev, [key]: val }))
  const clearEdit = (key: string) => setEditingValues((prev) => { const n = { ...prev }; delete n[key]; return n })
  const commitEdit = (key: string, val: string) => {
    clearEdit(key)
    if (!onValueChange) return
    const trimmed = val.trim()
    if (trimmed === '' || trimmed === '-' || trimmed === '\u2014') {
      onValueChange(key, null)
    } else {
      const num = Number(trimmed)
      if (!isNaN(num)) onValueChange(key, num)
    }
  }

  // Group by major section for rendering
  const majorSections = useMemo(() => {
    const majors: { major: string; subGroups: GroupedSection[] }[] = []
    let currentMajor: string | null = null
    let currentSubGroups: GroupedSection[] = []
    for (const g of groups) {
      if (g.major !== currentMajor) {
        if (currentMajor !== null) majors.push({ major: currentMajor, subGroups: currentSubGroups })
        currentMajor = g.major
        currentSubGroups = []
      }
      currentSubGroups.push(g)
    }
    if (currentMajor !== null) majors.push({ major: currentMajor, subGroups: currentSubGroups })
    return majors
  }, [groups])

  return (
    <div className="space-y-4">
      {/* Demographics pills */}
      {demographics && demographics.length > 0 && (
        <div className="flex flex-wrap items-center gap-2">
          {demographics.map((pill, i) => (
            <span
              key={i}
              className={cn(
                'inline-flex items-center rounded-full px-3 py-1 text-xs font-medium ring-1 ring-inset',
                pill.className ?? (
                  pill.tone === 'danger' ? 'bg-[hsl(var(--tone-danger-100))] text-[hsl(var(--tone-danger-700))] ring-[hsl(var(--tone-danger-200))]'
                    : pill.tone === 'positive' ? 'bg-[hsl(var(--tone-positive-100))] text-[hsl(var(--tone-positive-700))] ring-[hsl(var(--tone-positive-200))]'
                    : 'bg-[hsl(var(--tone-neutral-100))] text-[hsl(var(--tone-neutral-700))] ring-[hsl(var(--tone-neutral-200))]'
                ),
              )}
            >
              {pill.label}
            </span>
          ))}
        </div>
      )}

      {/* Toolbar */}
      <div className="flex flex-wrap items-start gap-5">
        {/* PAP preference */}
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
            onChange={(v) => onPapChange(v as PapillaryMode)}
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
              compact value={showFilter}
              onChange={(v) => setShowFilter(v as 'all' | 'recorded')}
            />
            <PillToggle
              options={[
                { key: 'all', label: <BsaOffIcon />, tooltip: 'Absolute + indexed' },
                { key: 'indexed', label: <BsaFilterIcon />, tooltip: 'BSA-indexed only' },
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
                  if (scalingMode === 'global') { setScalingMode('factory'); setRangeParams(new Map()); return }
                  const rels = collectMeasuredRels()
                  const result = globalAutoAdjust(rels)
                  if (result) { setScalingMode('global'); setRangeParams(new Map([['__global__', constrainRange(result, rels)]])) }
                }}
                onPerMeasAuto={() => {
                  if (scalingMode === 'per-meas') { setScalingMode('factory'); setRangeParams(new Map()); return }
                  const newMap: Map<string, RangeParam> = new Map()
                  for (const p of filteredParams) {
                    const m = measurements.get(p.parameter_key)
                    if (m !== undefined && hasValidRange(p.ll, p.ul)) {
                      const eul = hasSevZones(p) ? effectiveUL(p) : p.ul!
                      const rel = computeMeasuredRel(m, p.ll!, eul)
                      newMap.set(p.parameter_key, perMeasurementAutoAdjust(rel, sdTickRels(p, m)))
                    }
                  }
                  setScalingMode('per-meas'); setRangeParams(newMap)
                }}
              />
            )}
          </div>
        </div>
      </div>

      {/* Parameter table sections */}
      {majorSections.map(({ major, subGroups }) => {
        const isCollapsed = collapsed.has(major)
        return (
          <div key={major}>
            {/* Section heading */}
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
                      {chartMode === 'on' && <th className="house-table-head-text px-3 py-2 text-center">Range</th>}
                    </tr>
                  </thead>
                  <tbody>
                    {subGroups.map((g, gi) => (
                      <Fragment key={`grp-${g.major}|${g.sub}`}>
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
                        {g.params.map((p) => {
                          const isBsa = p.indexing === 'BSA'
                          const [fLL, fMean, fUL] = fmtRow([p.ll, p.mean, p.ul], p.decimal_places)
                          const rawVal = measurements.get(p.parameter_key)
                          const measured = rawVal !== undefined && ABS_VALUE_PARAMS.has(p.parameter_key)
                            ? Math.abs(rawVal) : rawVal
                          const hasMeasuredVal = measured !== undefined
                          const measuredDisplay = hasMeasuredVal ? fmtRow([measured], p.decimal_places)[0] : ''

                          let severity: SeverityResult = { grade: 'normal', label: 'Normal' }
                          if (hasMeasuredVal) {
                            severity = computeSeverity(
                              measured!,
                              p.ll, p.ul, p.sd,
                              p.abnormal_direction,
                              (p.severity_label as SeverityLabelType) ?? inferSeverityLabel(p.parameter_key, p.major_section, p.sub_section),
                              p.severity_thresholds ?? null,
                              p.severity_label_override ?? null,
                            )
                          }

                          return (
                            <Fragment key={p.parameter_key}>
                              <tr
                                className={cn(
                                  'transition-colors duration-100',
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
                                  {p.derived && (
                                    <span className="ml-1.5 inline-flex items-center text-[hsl(var(--tone-neutral-400))]" title={p.derived_tooltip ?? 'Calculated'}>
                                      <svg className="h-3.5 w-3.5" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                                        <rect x="2" y="1" width="12" height="14" rx="1.5" /><line x1="2" y1="5" x2="14" y2="5" />
                                        <line x1="5" y1="8" x2="11" y2="8" /><line x1="8" y1="5" x2="8" y2="11" /><line x1="5" y1="13" x2="11" y2="13" />
                                      </svg>
                                    </span>
                                  )}
                                  {nestedParamMap[p.parameter_key] && (
                                    <button
                                      type="button"
                                      onClick={() => setExpandedNested((prev) => {
                                        const next = new Set(prev)
                                        if (next.has(p.parameter_key)) next.delete(p.parameter_key)
                                        else next.add(p.parameter_key)
                                        return next
                                      })}
                                      className="ml-1.5 inline-flex items-center text-[hsl(var(--tone-neutral-400))] hover:text-[hsl(var(--foreground))] transition-colors"
                                    >
                                      <ChevronIcon open={expandedNested.has(p.parameter_key)} />
                                    </button>
                                  )}
                                </td>
                                <td className="house-table-cell-text whitespace-nowrap px-3 py-2 text-center text-[hsl(var(--tone-neutral-500))]">{p.unit}</td>
                                <td className={cn('house-table-cell-text whitespace-nowrap px-3 py-2 text-center tabular-nums font-semibold', !hasMeasuredVal && 'text-[hsl(var(--tone-neutral-300))]')}>
                                  {editable ? (
                                    <input
                                      type="text" inputMode="decimal"
                                      aria-label={`${displayName(p.parameter_key)} measured value`}
                                      value={editingValues[p.parameter_key] ?? measuredDisplay}
                                      placeholder="-"
                                      onClick={(e) => e.stopPropagation()}
                                      onFocus={(e) => { e.stopPropagation(); startEdit(p.parameter_key, measuredDisplay); e.currentTarget.select() }}
                                      onChange={(e) => updateEdit(p.parameter_key, e.target.value)}
                                      onBlur={(e) => commitEdit(p.parameter_key, e.target.value)}
                                      onKeyDown={(e) => {
                                        if (e.key === 'Enter') { e.preventDefault(); e.currentTarget.blur() }
                                        else if (e.key === 'Escape') { e.preventDefault(); clearEdit(p.parameter_key); e.currentTarget.blur() }
                                      }}
                                      className="h-8 w-full rounded-md border border-transparent bg-transparent px-2 text-center tabular-nums text-[hsl(var(--foreground))] outline-none transition placeholder:text-[hsl(var(--tone-neutral-300))] focus:border-[hsl(var(--section-style-report-accent)/0.4)] focus:bg-white focus:ring-2 focus:ring-[hsl(var(--section-style-report-accent)/0.12)]"
                                    />
                                  ) : hasMeasuredVal ? measuredDisplay : '\u2014'}
                                </td>
                                <td className="house-table-cell-text whitespace-nowrap px-3 py-2 text-center tabular-nums">{fLL}</td>
                                <td className="house-table-cell-text whitespace-nowrap px-3 py-2 text-center tabular-nums font-medium">{fMean}</td>
                                <td className="house-table-cell-text whitespace-nowrap px-3 py-2 text-center tabular-nums">{fUL}</td>
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
                                    {hasMeasuredVal && hasValidRange(p.ll, p.ul) ? (() => {
                                      const eul = hasSevZones(p) ? effectiveUL(p) : p.ul!
                                      const hasExplicit = rangeParams.has(p.parameter_key) || rangeParams.has('__global__')
                                      const base = rangeParams.get(p.parameter_key) ?? rangeParams.get('__global__') ?? (hasSevZones(p) ? SEV_ZONE_SCALING : factoryBaseline())
                                      let rs = base.rangeStart, rw = base.rangeWidth
                                      if (!hasExplicit && !hasSevZones(p)) {
                                        const rel = computeMeasuredRel(measured!, p.ll!, eul)
                                        const isAbn = isAbnormalValue(measured!, p.ll, p.ul, p.abnormal_direction)
                                        if (isAbn) {
                                          const auto = perMeasurementAutoAdjust(rel, sdTickRels(p, measured!))
                                          rs = auto.rangeStart; rw = auto.rangeWidth
                                        }
                                      }
                                      return (
                                        <RangeChart
                                          measured={measured!} ll={p.ll!} ul={eul}
                                          originalUL={hasSevZones(p) ? p.ul! : undefined}
                                          direction={p.abnormal_direction}
                                          rangeStart={rs} rangeWidth={rw}
                                          severityZones={buildSeverityZones(p)}
                                          severityTicks={buildSeverityTicks(p, severity.grade, measured!)}
                                          severityGrade={severity.grade as SevGrade}
                                        />
                                      )
                                    })() : null}
                                  </td>
                                )}
                              </tr>
                              {/* Nested child rows */}
                              {expandedNested.has(p.parameter_key) && nestedChildParams.get(p.parameter_key)?.map((cp) => {
                                const cpBsa = cp.indexing === 'BSA'
                                const [cpLL, cpMean, cpUL] = fmtRow([cp.ll, cp.mean, cp.ul], cp.decimal_places)
                                const cpRaw = measurements.get(cp.parameter_key)
                                const cpMeasured = cpRaw !== undefined && ABS_VALUE_PARAMS.has(cp.parameter_key) ? Math.abs(cpRaw) : cpRaw
                                const cpHas = cpMeasured !== undefined
                                const cpDisplay = cpHas ? fmtRow([cpMeasured], cp.decimal_places)[0] : ''
                                let cpSev: SeverityResult = { grade: 'normal', label: 'Normal' }
                                if (cpHas) {
                                  cpSev = computeSeverity(cpMeasured!, cp.ll, cp.ul, cp.sd, cp.abnormal_direction,
                                    (cp.severity_label as SeverityLabelType) ?? inferSeverityLabel(cp.parameter_key, cp.major_section, cp.sub_section),
                                    cp.severity_thresholds ?? null, cp.severity_label_override ?? null)
                                }
                                return (
                                  <tr key={cp.parameter_key} className="border-b border-[hsl(var(--stroke-soft)/0.4)] bg-[hsl(var(--tone-neutral-50)/0.4)]">
                                    <td className="house-table-cell-text whitespace-nowrap pl-8 pr-3 py-1.5 text-[hsl(var(--tone-neutral-600))]">
                                      {displayName(cp.parameter_key, true)}
                                      {cpBsa && <BsaPill />}
                                    </td>
                                    <td className="house-table-cell-text whitespace-nowrap px-3 py-1.5 text-center text-[hsl(var(--tone-neutral-500))]">{cp.unit}</td>
                                    <td className="house-table-cell-text whitespace-nowrap px-3 py-1.5 text-center tabular-nums font-semibold">
                                      {cpHas ? cpDisplay : '\u2014'}
                                    </td>
                                    <td className="house-table-cell-text whitespace-nowrap px-3 py-1.5 text-center tabular-nums">{cpLL}</td>
                                    <td className="house-table-cell-text whitespace-nowrap px-3 py-1.5 text-center tabular-nums font-medium">{cpMean}</td>
                                    <td className="house-table-cell-text whitespace-nowrap px-3 py-1.5 text-center tabular-nums">{cpUL}</td>
                                    <td className="house-table-cell-text whitespace-nowrap px-3 py-0 text-center align-middle">
                                      {cpHas && (
                                        <span className={cn(
                                          'inline-flex items-center rounded-full px-2.5 py-0.5 text-[11px] font-semibold ring-1 ring-inset',
                                          cpSev.grade === 'normal' && 'bg-[hsl(162_22%_90%)] text-[hsl(164_30%_28%)] ring-[hsl(163_22%_80%)]',
                                          cpSev.grade === 'mild' && 'bg-[hsl(38_40%_90%)] text-[hsl(34_50%_35%)] ring-[hsl(36_36%_80%)]',
                                          cpSev.grade === 'moderate' && 'bg-[hsl(16_45%_86%)] text-[hsl(5_48%_32%)] ring-[hsl(10_32%_76%)]',
                                          cpSev.grade === 'severe' && 'bg-[hsl(2_52%_25%)] text-white ring-[hsl(2_52%_20%)]',
                                        )}>
                                          {cpSev.label}
                                        </span>
                                      )}
                                    </td>
                                    {chartMode === 'on' && (
                                      <td className="bg-white px-2 py-1">
                                        {cpHas && hasValidRange(cp.ll, cp.ul) ? (() => {
                                          const eul = hasSevZones(cp) ? effectiveUL(cp) : cp.ul!
                                          const base = rangeParams.get(cp.parameter_key) ?? rangeParams.get('__global__') ?? (hasSevZones(cp) ? SEV_ZONE_SCALING : factoryBaseline())
                                          return (
                                            <RangeChart
                                              measured={cpMeasured!} ll={cp.ll!} ul={eul}
                                              originalUL={hasSevZones(cp) ? cp.ul! : undefined}
                                              direction={cp.abnormal_direction}
                                              rangeStart={base.rangeStart} rangeWidth={base.rangeWidth}
                                              severityZones={buildSeverityZones(cp)}
                                              severityTicks={buildSeverityTicks(cp, cpSev.grade, cpMeasured!)}
                                              severityGrade={cpSev.grade as SevGrade}
                                            />
                                          )
                                        })() : null}
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
  )
}
