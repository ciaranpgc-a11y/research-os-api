import { Fragment, useCallback, useState } from 'react'
import { cn } from '@/lib/utils'
import {
  computeMeasuredRel,
  computeMeasuredPos,
  factoryBaseline,
  globalAutoAdjust,
  perMeasurementAutoAdjust,
  constrainRange,
  type RangeParam,
  hasValidRange,
} from '@/lib/cmr-chart-scaling'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type SeverityZone = {
  grade: 'mild' | 'moderate' | 'severe'
  /** The value threshold where this zone starts (for high direction) or ends (for low direction). */
  threshold: number
}

export type ParameterDef = {
  key: string
  label: string
  unit: string
  ll?: number
  mean?: number
  ul?: number
  direction: 'high' | 'low' | 'both'
  decimalPlaces?: number
  indexed?: boolean
  subsection?: string
  /** Custom interpretation labels per severity: [normal, mild, moderate, severe]. Falls back to generic if not provided. */
  interpretations?: [string, string, string, string]
  /** Severity zone thresholds for colour-banded range charts. When provided, the chart shows coloured zones instead of the frosted green band. */
  severityZones?: SeverityZone[]
}

export type ParameterSection = {
  title: string
  params: ParameterDef[]
  /** Optional accent colour CSS value, e.g. 'hsl(var(--tone-positive-600))'. Falls back to extract accent. */
  accentColor?: string
}

/** Demographics pill data for the toolbar */
export type DemographicPill = {
  label: string  // e.g. "Female", "72 years", "75 bpm", "BMI 22"
}

export type ParameterTableProps = {
  sections: ParameterSection[]
  data: Record<string, unknown>
  editable?: boolean
  onValueChange?: (key: string, value: number | null) => void
  /** Optional accent colour override for the Measured column header & values */
  accentColor?: string
  /** Demographics pills shown above the table (e.g. gender, age, HR, BMI) */
  demographics?: DemographicPill[]
  /** Title shown above the table (e.g. "Quantitative metrics"). Defaults to none. */
  title?: string
}

// ---------------------------------------------------------------------------
// Severity computation
// ---------------------------------------------------------------------------

type SeverityGrade = 'normal' | 'mild' | 'moderate' | 'severe'

type SeverityResult = {
  label: string | null
  grade: SeverityGrade | null
}

export function computeSeverity(
  value: number | null,
  ll: number | null | undefined,
  ul: number | null | undefined,
  direction: 'high' | 'low' | 'both',
  interpretations?: [string, string, string, string],
): SeverityResult {
  if (value === null || value === undefined) return { label: null, grade: null }
  if (ll == null && ul == null) return { label: null, grade: null }

  const isAboveUL = ul != null && value > ul
  const isBelowLL = ll != null && value < ll

  let abnormal = false
  let boundary: number | null = null
  let delta = 0

  if (direction === 'high') {
    if (ul != null && value > ul) {
      abnormal = true
      boundary = ul
      delta = value - ul
    }
  } else if (direction === 'low') {
    if (ll != null && value < ll) {
      abnormal = true
      boundary = ll
      delta = ll - value
    }
  } else {
    if (isAboveUL) {
      abnormal = true
      boundary = ul!
      delta = value - ul!
    } else if (isBelowLL) {
      abnormal = true
      boundary = ll!
      delta = ll! - value
    }
  }

  const labels = interpretations ?? ['Normal', 'Mildly abnormal', 'Moderately abnormal', 'Severely abnormal']

  if (!abnormal) return { label: labels[0], grade: 'normal' }

  const base = Math.abs(boundary!) || 1
  const pct = delta / base

  if (pct <= 0.2) return { label: labels[1], grade: 'mild' }
  if (pct <= 0.5) return { label: labels[2], grade: 'moderate' }
  return { label: labels[3], grade: 'severe' }
}

// ---------------------------------------------------------------------------
// Formatting helpers
// ---------------------------------------------------------------------------

function fmtValue(val: number | null | undefined, dp: number): string {
  if (val === null || val === undefined) return '\u2014'
  return val.toFixed(dp)
}

// ---------------------------------------------------------------------------
// Chevron icon (matches CMR)
// ---------------------------------------------------------------------------

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
// BSA pill
// ---------------------------------------------------------------------------

function BsaPill() {
  return (
    <span className="ml-1.5 inline-flex items-center rounded px-1.5 py-0.5 text-[0.65rem] font-medium bg-[hsl(var(--tone-neutral-200))] text-[hsl(var(--tone-neutral-600))]">
      BSA
    </span>
  )
}

// ---------------------------------------------------------------------------
// Severity pills & row backgrounds (EXACT CMR colours)
// ---------------------------------------------------------------------------

const SEVERITY_PILL_CLASSES: Record<SeverityGrade, string> = {
  normal: 'bg-[hsl(162_22%_90%)] text-[hsl(164_30%_28%)] ring-[hsl(163_22%_80%)]',
  mild: 'bg-[hsl(38_40%_90%)] text-[hsl(34_50%_35%)] ring-[hsl(36_36%_80%)]',
  moderate: 'bg-[hsl(16_45%_86%)] text-[hsl(5_48%_32%)] ring-[hsl(10_32%_76%)]',
  severe: 'bg-[hsl(2_52%_25%)] text-white ring-[hsl(2_52%_20%)]',
}

const SEVERITY_ROW_BG: Record<SeverityGrade, string> = {
  normal: 'bg-[hsl(158_30%_94%)] hover:bg-[hsl(158_30%_91%)]',
  mild: 'bg-[hsl(46_60%_91%)] hover:bg-[hsl(46_60%_88%)]',
  moderate: 'bg-[hsl(20_55%_87%)] hover:bg-[hsl(20_55%_84%)]',
  severe: 'bg-[hsl(4_55%_82%)] hover:bg-[hsl(4_55%_79%)]',
}

// ---------------------------------------------------------------------------
// Dot colours for range chart (matches CMR)
// ---------------------------------------------------------------------------

const DOT_COLORS: Record<SeverityGrade, string> = {
  normal: 'hsl(158 35% 45%)',
  mild: 'hsl(46 55% 45%)',
  moderate: 'hsl(20 50% 45%)',
  severe: 'hsl(4 50% 40%)',
}

const SEV_ZONE_COLORS: Record<string, string> = {
  normal: 'hsl(158, 30%, 80%)',
  mild: 'hsl(46, 50%, 75%)',
  moderate: 'hsl(20, 45%, 72%)',
  severe: 'hsl(4, 45%, 68%)',
}

// ---------------------------------------------------------------------------
// Range chart — DIV-BASED (matches CMR exactly)
// ---------------------------------------------------------------------------

// Unused — kept for reference. Actual scaling uses cmr-chart-scaling.ts functions.
// const DEFAULT_RANGE_START = 0.1
// const DEFAULT_RANGE_WIDTH = 0.8

function RangeChart({
  measured,
  ll,
  ul,
  grade,
  rangeParam,
  severityZones,
  direction,
  originalLL,
  originalUL,
}: {
  measured: number
  ll: number    // effective LL (may be expanded to cover severity zones)
  ul: number    // effective UL (may be expanded)
  grade: SeverityGrade
  rangeParam: RangeParam
  severityZones?: SeverityZone[]
  direction?: 'high' | 'low' | 'both'
  originalLL?: number  // the real LL (normal range boundary)
  originalUL?: number  // the real UL (normal range boundary)
}) {
  const measuredRel = computeMeasuredRel(measured, ll, ul)
  const measuredPos = computeMeasuredPos(measuredRel, rangeParam.rangeStart, rangeParam.rangeWidth)

  const rangeStart = rangeParam.rangeStart
  const rangeWidth = rangeParam.rangeWidth

  // Build severity zone bands (matching CMR pattern)
  const zoneBands = severityZones && severityZones.length > 0 ? (() => {
    const bands: Array<{ grade: string; leftPct: string; widthPct: string }> = []
    const isLowDir = direction === 'low'

    // Use original LL/UL as the normal zone boundaries
    const normLL = originalLL ?? ll
    const normUL = originalUL ?? ul

    if (isLowDir) {
      // Low direction: severity zones extend LEFT from the normal LL
      // Layout: [severe][moderate][mild][normal → right edge]
      const grades: string[] = ['severe', 'moderate', 'mild']
      let prevThreshold: number | null = null
      for (const g of grades) {
        const zone = severityZones.find((z) => z.grade === g)
        if (!zone) continue
        const startPos = prevThreshold !== null
          ? computeMeasuredPos(computeMeasuredRel(prevThreshold, ll, ul), rangeStart, rangeWidth)
          : 0
        const endPos = computeMeasuredPos(computeMeasuredRel(zone.threshold, ll, ul), rangeStart, rangeWidth)
        bands.push({ grade: g, leftPct: `${startPos * 100}%`, widthPct: `${Math.max(0, endPos - startPos) * 100}%` })
        prevThreshold = zone.threshold
      }
      // Normal zone: from original LL to right edge
      const normalStartPos = computeMeasuredPos(computeMeasuredRel(normLL, ll, ul), rangeStart, rangeWidth)
      bands.push({ grade: 'normal', leftPct: `${normalStartPos * 100}%`, widthPct: `${(1 - normalStartPos) * 100}%` })
    } else {
      // High direction: severity zones extend RIGHT from the normal UL
      // Normal zone: left edge to original UL
      const normalEndPos = computeMeasuredPos(computeMeasuredRel(normUL, ll, ul), rangeStart, rangeWidth)
      bands.push({ grade: 'normal', leftPct: '0%', widthPct: `${normalEndPos * 100}%` })
      const grades: string[] = ['mild', 'moderate', 'severe']
      let prevThreshold = normUL
      for (let i = 0; i < grades.length; i++) {
        const zone = severityZones.find((z) => z.grade === grades[i])
        if (!zone) continue
        const startPos = computeMeasuredPos(computeMeasuredRel(prevThreshold, ll, ul), rangeStart, rangeWidth)
        const isLast = i === grades.length - 1 || !severityZones.find((z) => z.grade === grades[i + 1])
        if (isLast) {
          bands.push({ grade: grades[i], leftPct: `${startPos * 100}%`, widthPct: `${(1 - startPos) * 100}%` })
        } else {
          const endPos = computeMeasuredPos(computeMeasuredRel(zone.threshold, ll, ul), rangeStart, rangeWidth)
          bands.push({ grade: grades[i], leftPct: `${startPos * 100}%`, widthPct: `${Math.max(0, endPos - startPos) * 100}%` })
          prevThreshold = zone.threshold
        }
      }
    }
    return bands
  })() : null

  const bandLeftPct = `${rangeStart * 100}%`
  const bandWidthPct = `${rangeWidth * 100}%`
  const dotPct = `${measuredPos * 100}%`

  const dotColor = DOT_COLORS[grade]

  return (
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
              style={{ left: b.leftPct, width: b.widthPct, backgroundColor: SEV_ZONE_COLORS[b.grade] ?? SEV_ZONE_COLORS.normal }}
            />
          ))}
          {/* Thin white dividers between zones */}
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
      {/* Measured dot — ring circle */}
      <div
        className="absolute top-1/2 h-[10px] w-[10px] -translate-x-1/2 -translate-y-1/2 rounded-full border-2 bg-white transition-all duration-200 group-hover/chart:shadow-[0_0_0_3px_rgba(0,0,0,0.1),0_0_8px_rgba(0,0,0,0.15)]"
        style={{
          left: dotPct,
          borderColor: dotColor,
          boxShadow: `0 1px 3px ${dotColor}33`,
        }}
      />
    </div>
  )
}

// ---------------------------------------------------------------------------
// Inline editable cell
// ---------------------------------------------------------------------------

function MeasuredCell({
  paramKey,
  value,
  dp,
  editable,
  onValueChange,
  accentColor,
}: {
  paramKey: string
  value: number | null
  dp: number
  editable: boolean
  onValueChange?: (key: string, value: number | null) => void
  accentColor?: string
}) {
  const [editing, setEditing] = useState<string | null>(null)
  const display = value !== null && value !== undefined ? fmtValue(value, dp) : ''
  void accentColor

  const commitEdit = useCallback(
    (raw: string) => {
      setEditing(null)
      if (!onValueChange) return
      const trimmed = raw.trim()
      if (trimmed === '' || trimmed === '-') {
        onValueChange(paramKey, null)
      } else {
        const n = Number(trimmed)
        if (!isNaN(n)) onValueChange(paramKey, n)
      }
    },
    [paramKey, onValueChange],
  )

  if (!editable) {
    return (
      <span
        className={cn('tabular-nums', value != null ? 'font-semibold' : 'text-[hsl(var(--tone-neutral-300))]')}
        
      >
        {value != null ? fmtValue(value, dp) : '\u2014'}
      </span>
    )
  }

  return (
    <input
      type="text"
      inputMode="decimal"
      aria-label={`${paramKey} measured value`}
      value={editing ?? display}
      placeholder="-"
      onFocus={(e) => {
        setEditing(display)
        e.currentTarget.select()
      }}
      onChange={(e) => setEditing(e.target.value)}
      onBlur={(e) => commitEdit(e.target.value)}
      onKeyDown={(e) => {
        if (e.key === 'Enter') {
          e.preventDefault()
          e.currentTarget.blur()
        } else if (e.key === 'Escape') {
          e.preventDefault()
          setEditing(null)
          e.currentTarget.blur()
        }
      }}
      className="h-8 w-full rounded-md border border-transparent bg-transparent px-2 text-center tabular-nums font-semibold text-[hsl(var(--foreground))] outline-none transition placeholder:text-[hsl(var(--tone-neutral-300))] focus:border-[hsl(var(--section-style-extract-accent)/0.4)] focus:bg-white focus:ring-2 focus:ring-[hsl(var(--section-style-extract-accent)/0.12)]"
    />
  )
}

// ---------------------------------------------------------------------------
// Default accent colour
// ---------------------------------------------------------------------------

const DEFAULT_ACCENT = 'hsl(var(--section-style-extract-accent))'

// ---------------------------------------------------------------------------
// ParameterTable component
// ---------------------------------------------------------------------------

export function ParameterTable({ sections, data, editable = false, onValueChange, accentColor, demographics, title }: ParameterTableProps) {
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({})
  const [showRecordedOnly, setShowRecordedOnly] = useState(false)
  const [showAbnormalOnly, setShowAbnormalOnly] = useState(false)
  const [showBsaOnly, setShowBsaOnly] = useState(false)
  const [severityColouring, setSeverityColouring] = useState(false)
  const [chartMode, setChartMode] = useState(true)
  const [chartScaling, setChartScaling] = useState<'global' | 'per-measurement'>('global')

  const toggleCollapse = useCallback((title: string) => {
    setCollapsed((prev) => ({ ...prev, [title]: !prev[title] }))
  }, [])

  const resolvedAccent = accentColor ?? DEFAULT_ACCENT

  // Compute global range param from all measured values (CMR pattern)
  const globalRangeParam: RangeParam = (() => {
    if (chartScaling !== 'global') return factoryBaseline()
    const rels: number[] = []
    for (const section of sections) {
      for (const p of section.params) {
        if (p.ll == null || p.ul == null) continue
        const rawVal = data[p.key]
        const v = rawVal !== undefined && rawVal !== null && rawVal !== '' ? Number(rawVal) : null
        if (v !== null && !isNaN(v)) {
          rels.push(computeMeasuredRel(v, p.ll, p.ul))
        }
      }
    }
    const auto = globalAutoAdjust(rels)
    if (auto) return constrainRange(auto, rels)
    return factoryBaseline()
  })()

  return (
    <div className="flex flex-col gap-6">

      {/* --- Title + Demographics pills --- */}
      {(title || (demographics && demographics.length > 0)) && (
        <div className="flex flex-col gap-3">
          {title && (
            <div className="flex items-center gap-3">
              <div className="w-[3px] self-stretch rounded-full" style={{ background: resolvedAccent }} />
              <h2 className="text-xl font-bold tracking-tight text-[hsl(var(--foreground))]">{title}</h2>
            </div>
          )}
          {demographics && demographics.length > 0 && (
            <div className="flex flex-wrap items-center gap-2">
              {demographics.map((d) => (
                <span
                  key={d.label}
                  className="inline-flex items-center rounded-full border border-[hsl(var(--tone-neutral-300))] bg-white px-3 py-1 text-[0.8rem] font-medium text-[hsl(var(--foreground))]"
                >
                  {d.label}
                </span>
              ))}
            </div>
          )}
        </div>
      )}

      {/* --- Toolbar (matches CMR Quantitative metrics structure exactly) --- */}
      <div className="flex flex-wrap items-end gap-0">

        {/* FILTERS section */}
        <div className="flex flex-col gap-1">
          <div className="flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wider text-[hsl(var(--tone-neutral-400))]">
            <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M1 2h14M3 6h10M5 10h6M7 14h2" /></svg>
            Filters
          </div>
          <div className="flex items-center gap-2">
            {/* Recorded / All toggle */}
            <div className="flex rounded-full bg-[hsl(var(--tone-danger-100)/0.5)] p-0.5 ring-1 ring-[hsl(var(--tone-danger-200)/0.5)]">
              <button
                type="button"
                onClick={() => setShowRecordedOnly(true)}
                className={cn(
                  'flex items-center gap-1 rounded-full px-2.5 py-1.5 text-xs font-medium transition-all',
                  showRecordedOnly
                    ? 'bg-[hsl(var(--section-style-extract-accent))] text-white shadow-sm'
                    : 'text-[hsl(var(--tone-danger-600))] hover:text-[hsl(var(--tone-danger-800))]',
                )}
              >
                123
              </button>
              <button
                type="button"
                onClick={() => setShowRecordedOnly(false)}
                className={cn(
                  'flex items-center gap-1 rounded-full px-2.5 py-1.5 text-xs font-medium transition-all',
                  !showRecordedOnly
                    ? 'bg-[hsl(var(--section-style-extract-accent))] text-white shadow-sm'
                    : 'text-[hsl(var(--tone-danger-600))] hover:text-[hsl(var(--tone-danger-800))]',
                )}
              >
                <svg className="h-3.5 w-3.5" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"><path d="M2 4h12M2 8h12M2 12h12" /></svg>
              </button>
            </div>
            {/* BSA toggle */}
            <div className="flex rounded-full bg-[hsl(var(--tone-danger-100)/0.5)] p-0.5 ring-1 ring-[hsl(var(--tone-danger-200)/0.5)]">
              <button
                type="button"
                onClick={() => setShowBsaOnly(false)}
                className={cn(
                  'flex items-center gap-1 rounded-full px-2.5 py-1.5 text-xs font-medium transition-all',
                  !showBsaOnly
                    ? 'bg-[hsl(var(--section-style-extract-accent))] text-white shadow-sm'
                    : 'text-[hsl(var(--tone-danger-600))] hover:text-[hsl(var(--tone-danger-800))]',
                )}
              >
                <svg className="h-3.5 w-3.5" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5"><rect x="1" y="3" width="14" height="10" rx="1.5" /><path d="M1 6h14" /></svg>
              </button>
              <button
                type="button"
                onClick={() => setShowBsaOnly(true)}
                className={cn(
                  'flex items-center gap-1 rounded-full px-2.5 py-1.5 text-xs font-medium transition-all',
                  showBsaOnly
                    ? 'bg-[hsl(var(--section-style-extract-accent))] text-white shadow-sm'
                    : 'text-[hsl(var(--tone-danger-600))] hover:text-[hsl(var(--tone-danger-800))]',
                )}
              >
                BSA
              </button>
            </div>
            {/* Severity filter */}
            <div className="flex rounded-full bg-[hsl(var(--tone-danger-100)/0.5)] p-0.5 ring-1 ring-[hsl(var(--tone-danger-200)/0.5)]">
              <button
                type="button"
                onClick={() => setShowAbnormalOnly(false)}
                className={cn(
                  'flex items-center gap-1 rounded-full px-2.5 py-1.5 text-xs font-medium transition-all',
                  !showAbnormalOnly
                    ? 'bg-[hsl(var(--section-style-extract-accent))] text-white shadow-sm'
                    : 'text-[hsl(var(--tone-danger-600))] hover:text-[hsl(var(--tone-danger-800))]',
                )}
              >
                <svg className="h-3.5 w-3.5" viewBox="0 0 16 16"><circle cx="5" cy="8" r="3.5" fill="hsl(38 55% 55%)" /><circle cx="11" cy="8" r="3.5" fill="hsl(4 55% 50%)" /></svg>
              </button>
              <button
                type="button"
                onClick={() => setShowAbnormalOnly(true)}
                className={cn(
                  'flex items-center gap-1 rounded-full px-2.5 py-1.5 text-xs font-medium transition-all',
                  showAbnormalOnly
                    ? 'bg-[hsl(var(--section-style-extract-accent))] text-white shadow-sm'
                    : 'text-[hsl(var(--tone-danger-600))] hover:text-[hsl(var(--tone-danger-800))]',
                )}
              >
                <svg className="h-3.5 w-3.5" viewBox="0 0 16 16"><circle cx="8" cy="8" r="5" fill="hsl(4 55% 50%)" /></svg>
              </button>
            </div>
          </div>
        </div>

        {/* Vertical divider */}
        <div className="mx-4 h-10 w-px self-end bg-[hsl(var(--stroke-soft)/0.3)]" />

        {/* VIEWING section */}
        <div className="flex flex-col gap-1">
          <div className="flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wider text-[hsl(var(--tone-neutral-400))]">
            <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><rect x="1" y="3" width="14" height="10" rx="1.5" /><path d="M1 6h14" /></svg>
            Viewing
          </div>
          <div className="flex items-center gap-2">
            {/* Severity colouring toggle */}
            <div className="flex rounded-full bg-[hsl(var(--tone-danger-100)/0.5)] p-0.5 ring-1 ring-[hsl(var(--tone-danger-200)/0.5)]">
              <button
                type="button"
                onClick={() => setSeverityColouring(false)}
                className={cn(
                  'flex items-center gap-1 rounded-full px-2.5 py-1.5 text-xs font-medium transition-all',
                  !severityColouring
                    ? 'bg-[hsl(var(--section-style-extract-accent))] text-white shadow-sm'
                    : 'text-[hsl(var(--tone-danger-600))] hover:text-[hsl(var(--tone-danger-800))]',
                )}
              >
                <svg className="h-3.5 w-3.5" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M3 8c2-4 8-4 10 0M3 8c2 4 8 4 10 0" /><circle cx="8" cy="8" r="2" /></svg>
              </button>
              <button
                type="button"
                onClick={() => setSeverityColouring(true)}
                className={cn(
                  'flex items-center gap-1 rounded-full px-2.5 py-1.5 text-xs font-medium transition-all',
                  severityColouring
                    ? 'bg-[hsl(var(--section-style-extract-accent))] text-white shadow-sm'
                    : 'text-[hsl(var(--tone-danger-600))] hover:text-[hsl(var(--tone-danger-800))]',
                )}
              >
                <svg className="h-3.5 w-3.5" viewBox="0 0 16 16"><circle cx="5" cy="8" r="3.5" fill="hsl(38 55% 55%)" /><circle cx="11" cy="8" r="3.5" fill="hsl(4 55% 50%)" /></svg>
              </button>
            </div>
            {/* Chart mode toggle */}
            <div className="flex rounded-full bg-[hsl(var(--tone-danger-100)/0.5)] p-0.5 ring-1 ring-[hsl(var(--tone-danger-200)/0.5)]">
              <button
                type="button"
                onClick={() => setChartMode(true)}
                className={cn(
                  'flex items-center gap-1 rounded-full px-2.5 py-1.5 text-xs font-medium transition-all',
                  chartMode
                    ? 'bg-[hsl(var(--section-style-extract-accent))] text-white shadow-sm'
                    : 'text-[hsl(var(--tone-danger-600))] hover:text-[hsl(var(--tone-danger-800))]',
                )}
              >
                <svg className="h-3.5 w-3.5" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><rect x="1" y="8" width="3" height="7" rx="0.5" /><rect x="6.5" y="4" width="3" height="11" rx="0.5" /><rect x="12" y="1" width="3" height="14" rx="0.5" /></svg>
              </button>
              <button
                type="button"
                onClick={() => setChartMode(false)}
                className={cn(
                  'flex items-center gap-1 rounded-full px-2.5 py-1.5 text-xs font-medium transition-all',
                  !chartMode
                    ? 'bg-[hsl(var(--section-style-extract-accent))] text-white shadow-sm'
                    : 'text-[hsl(var(--tone-danger-600))] hover:text-[hsl(var(--tone-danger-800))]',
                )}
              >
                <svg className="h-3.5 w-3.5" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"><path d="M2 4h12M2 8h12M2 12h12" /></svg>
              </button>
            </div>
            {/* Global / Per measurement */}
            {chartMode && (
              <div className="flex rounded-full bg-[hsl(var(--tone-danger-100)/0.5)] p-0.5 ring-1 ring-[hsl(var(--tone-danger-200)/0.5)]">
                <button
                  type="button"
                  onClick={() => setChartScaling('global')}
                  className={cn(
                    'flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium transition-all',
                    chartScaling === 'global'
                      ? 'bg-[hsl(var(--section-style-extract-accent))] text-white shadow-sm'
                      : 'text-[hsl(var(--tone-danger-600))] hover:text-[hsl(var(--tone-danger-800))]',
                  )}
                >
                  <span className="inline-block h-2 w-2 rounded-full bg-current" />
                  Global
                </button>
                <button
                  type="button"
                  onClick={() => setChartScaling('per-measurement')}
                  className={cn(
                    'flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium transition-all',
                    chartScaling === 'per-measurement'
                      ? 'bg-[hsl(var(--section-style-extract-accent))] text-white shadow-sm'
                      : 'text-[hsl(var(--tone-danger-600))] hover:text-[hsl(var(--tone-danger-800))]',
                  )}
                >
                  <span className="inline-flex h-2 w-2 items-center justify-center rounded-full border-[1.5px] border-current" />
                  Per measurement
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {sections.map((section) => {
        const isCollapsed = !!collapsed[section.title]
        const sectionAccent = section.accentColor ?? resolvedAccent

        // Determine which params have subsections to render dividers
        const seenSubsections = new Set<string>()

        return (
          <div key={section.title}>
            {/* ---- Collapsible section header (matches CMR exactly) ---- */}
            <button
              type="button"
              onClick={() => toggleCollapse(section.title)}
              className={cn(
                'flex w-full items-stretch overflow-hidden border border-[hsl(var(--stroke-soft)/0.72)] bg-[hsl(var(--tone-neutral-50))] text-left transition-colors hover:bg-[hsl(var(--tone-neutral-100))]',
                isCollapsed ? 'rounded-lg' : 'rounded-t-lg border-b border-b-[hsl(var(--stroke-soft))]',
              )}
            >
              <div className="w-1 shrink-0" style={{ backgroundColor: sectionAccent }} />
              <div className="flex flex-1 items-center gap-2.5 px-3.5 py-3">
                <ChevronIcon open={!isCollapsed} />
                <h2 className="flex-1 text-sm font-semibold tracking-tight text-[hsl(var(--foreground))]">
                  {section.title}
                </h2>
              </div>
            </button>

            {/* ---- Table body (matches CMR exactly) ---- */}
            {!isCollapsed && (
              <div className="overflow-hidden rounded-b-lg border-x border-b border-[hsl(var(--stroke-soft)/0.72)]">
                <table data-house-no-column-resize="true" className="w-full table-fixed border-collapse text-sm">
                  <colgroup>
                    <col style={{ width: chartMode ? '21%' : '28%' }} />
                    <col style={{ width: chartMode ? '8%' : '10%' }} />
                    <col style={{ width: chartMode ? '7%' : '10%' }} />
                    <col style={{ width: chartMode ? '6%' : '8%' }} />
                    <col style={{ width: chartMode ? '6%' : '8%' }} />
                    <col style={{ width: chartMode ? '6%' : '8%' }} />
                    <col style={{ width: chartMode ? '16%' : '28%' }} />
                    {chartMode && <col style={{ width: '30%' }} />}
                  </colgroup>
                  <thead>
                    <tr className="border-b-2 border-[hsl(var(--tone-neutral-300))] bg-[hsl(var(--tone-neutral-50))]">
                      <th className="house-table-head-text px-3 py-2 text-left">Parameter</th>
                      <th className="house-table-head-text px-3 py-2 text-center">Unit</th>
                      <th className="house-table-head-text px-3 py-2 text-center font-bold">Measured</th>
                      <th className="house-table-head-text px-3 py-2 text-center">LL</th>
                      <th className="house-table-head-text px-3 py-2 text-center">Mean</th>
                      <th className="house-table-head-text px-3 py-2 text-center">UL</th>
                      <th className="house-table-head-text px-3 py-2 text-center">Interpretation</th>
                      {chartMode && <th className="house-table-head-text px-3 py-2 text-center">Range</th>}
                    </tr>
                  </thead>
                  <tbody>
                    {section.params.map((p, pi) => {
                      const dp = p.decimalPlaces ?? 1
                      const rawValue = data[p.key]
                      const value = rawValue !== undefined && rawValue !== null && rawValue !== '' ? Number(rawValue) : null
                      const hasMeasured = value !== null && !isNaN(value)
                      const severity = hasMeasured ? computeSeverity(value, p.ll, p.ul, p.direction, p.interpretations) : { label: null, grade: null }
                      const hasRange = hasValidRange(p.ll ?? null, p.ul ?? null)

                      // Filter: show recorded only
                      if (showRecordedOnly && !hasMeasured) return null
                      // Filter: show abnormal only
                      if (showAbnormalOnly && (!hasMeasured || severity.grade === 'normal' || severity.grade === null)) return null
                      // Filter: BSA-indexed only
                      if (showBsaOnly && !p.indexed) return null

                      // Sub-section divider logic
                      let showSubsection = false
                      if (p.subsection && !seenSubsections.has(p.subsection)) {
                        seenSubsections.add(p.subsection)
                        showSubsection = true
                      }

                      return (
                        <Fragment key={p.key}>
                          {/* Sub-section divider row (matches CMR) */}
                          {showSubsection && (
                            <tr className="border-b border-[hsl(var(--stroke-soft)/0.5)]">
                              <td
                                colSpan={chartMode ? 8 : 7}
                                className={cn(
                                  'bg-[hsl(var(--tone-danger-100))] px-3 py-1.5 text-[0.8rem] font-semibold tracking-wide text-[hsl(var(--tone-danger-900)/0.82)]',
                                  pi > 0 && 'border-t border-[hsl(var(--tone-danger-200))]',
                                )}
                              >
                                {p.subsection}
                              </td>
                            </tr>
                          )}

                          {/* Parameter data row (matches CMR severity backgrounds) */}
                          <tr
                            className={cn(
                              'border-b border-[hsl(var(--stroke-soft)/0.4)] transition-colors duration-100',
                              severityColouring && hasMeasured && severity.grade
                                ? SEVERITY_ROW_BG[severity.grade]
                                : 'hover:bg-[hsl(var(--tone-neutral-50)/0.65)]',
                            )}
                          >
                            {/* Parameter name */}
                            <td className="house-table-cell-text whitespace-nowrap px-3 py-2 font-medium text-[hsl(var(--foreground))]">
                              {p.label}
                              {p.indexed && <BsaPill />}
                            </td>
                            {/* Unit */}
                            <td className="house-table-cell-text whitespace-nowrap px-3 py-2 text-center text-[hsl(var(--tone-neutral-500))]">
                              {p.unit}
                            </td>
                            {/* Measured value */}
                            <td className={cn(
                              'house-table-cell-text whitespace-nowrap px-3 py-2 text-center tabular-nums font-semibold',
                              !hasMeasured && 'text-[hsl(var(--tone-neutral-300))]',
                            )}>
                              <MeasuredCell
                                paramKey={p.key}
                                value={hasMeasured ? value : null}
                                dp={dp}
                                editable={editable}
                                onValueChange={onValueChange}
                                accentColor={sectionAccent}
                              />
                            </td>
                            {/* LL */}
                            <td className="house-table-cell-text whitespace-nowrap px-3 py-2 text-center tabular-nums">
                              {fmtValue(p.ll ?? null, dp)}
                            </td>
                            {/* Mean */}
                            <td className="house-table-cell-text whitespace-nowrap px-3 py-2 text-center tabular-nums font-medium">
                              {fmtValue(p.mean ?? null, dp)}
                            </td>
                            {/* UL */}
                            <td className="house-table-cell-text whitespace-nowrap px-3 py-2 text-center tabular-nums">
                              {fmtValue(p.ul ?? null, dp)}
                            </td>
                            {/* Interpretation pill (EXACT CMR colours) */}
                            <td className="house-table-cell-text whitespace-nowrap px-3 py-0 text-center align-middle">
                              {hasMeasured && severity.grade && (
                                <span
                                  className={cn(
                                    'inline-flex items-center rounded-full px-2.5 py-0.5 text-[11px] font-semibold ring-1 ring-inset',
                                    SEVERITY_PILL_CLASSES[severity.grade],
                                  )}
                                >
                                  {severity.label}
                                </span>
                              )}
                            </td>
                            {/* Range chart (DIV-BASED, matches CMR) */}
                            {chartMode && (
                              <td className="bg-white px-2 py-1">
                                {hasMeasured && hasRange ? (
                                  (() => {
                                    // For severity-zoned parameters, expand LL/UL to cover all zones
                                    let effLL = p.ll!
                                    let effUL = p.ul!
                                    if (p.severityZones && p.severityZones.length > 0) {
                                      if (p.direction === 'low') {
                                        const minThreshold = Math.min(...p.severityZones.map(z => z.threshold))
                                        // Add padding below severe zone (10% of range)
                                        const padding = (p.ul! - minThreshold) * 0.1
                                        effLL = Math.min(effLL, minThreshold - padding)
                                      } else {
                                        const maxThreshold = Math.max(...p.severityZones.map(z => z.threshold))
                                        const padding = (maxThreshold - p.ll!) * 0.1
                                        effUL = Math.max(effUL, maxThreshold + padding)
                                      }
                                    }
                                    const rel = computeMeasuredRel(value!, effLL, effUL)
                                    const rp = chartScaling === 'per-measurement'
                                      ? perMeasurementAutoAdjust(rel)
                                      : (p.severityZones ? { rangeStart: 0.05, rangeWidth: 0.9 } : globalRangeParam)
                                    return (
                                      <RangeChart
                                        measured={value!}
                                        ll={effLL}
                                        ul={effUL}
                                        originalLL={p.ll}
                                        originalUL={p.ul}
                                        grade={severity.grade ?? 'normal'}
                                        severityZones={p.severityZones}
                                        direction={p.direction}
                                        rangeParam={rp}
                                      />
                                    )
                                  })()
                                ) : null}
                              </td>
                            )}
                          </tr>
                        </Fragment>
                      )
                    })}
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

export default ParameterTable
