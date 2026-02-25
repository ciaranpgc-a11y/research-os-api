import { useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { Download, ExternalLink, Eye, EyeOff, FileText, Share2 } from 'lucide-react'

import { Card, CardContent } from '@/components/ui/card'
import { Sheet, SheetContent } from '@/components/ui/sheet'
import { readAccountSettings } from '@/lib/account-preferences'
import { fetchPublicationMetricDetail } from '@/lib/impact-api'
import { cn } from '@/lib/utils'
import type {
  PublicationMetricDetailPayload,
  PublicationMetricTilePayload,
  PublicationsTopMetricsPayload,
} from '@/types/impact'

import { dashboardTileStyles } from './dashboard-tile-styles'

type PublicationsTopStripProps = {
  metrics: PublicationsTopMetricsPayload | null
  loading?: boolean
  token?: string | null
  fetchMetricDetail?: (token: string, metricId: string) => Promise<PublicationMetricDetailPayload>
}

function toNumberArray(value: unknown): number[] {
  if (!Array.isArray(value)) {
    return []
  }
  return value
    .map((item) => {
      const parsed = Number(item)
      return Number.isFinite(parsed) ? parsed : 0
    })
    .filter((item) => Number.isFinite(item))
}

function formatInt(value: number): string {
  return Math.round(Number.isFinite(value) ? value : 0).toLocaleString('en-GB')
}

function formatSignedPercentCompact(value: number): string {
  const rounded = Math.round(Number.isFinite(value) ? value : 0)
  const normalized = Math.abs(rounded) < 1 ? 0 : rounded
  return `${normalized >= 0 ? '+' : ''}${normalized.toFixed(0)}%`
}

type MomentumBreakdown = {
  bars: Array<{ label: string; value: number }>
  baselineWindowLabel: string | null
  recentWindowLabel: string | null
  recent3Total: number | null
  baseline9Total: number | null
  rate3m: number | null
  rate9m: number | null
  liftPct: number | null
  insufficientBaseline: boolean
}

type MomentumYearBreakdown = {
  bars: Array<{ label: string; value: number }>
  priorYearsLabel: string | null
  recentYearLabel: string | null
  recent1Total: number | null
  baseline4Total: number | null
  rate1y: number | null
  rate4y: number | null
  liftPct: number | null
  insufficientBaseline: boolean
}

type MomentumWindowMode = '12m' | '5y'
type HIndexViewMode = 'trajectory' | 'needed'
type FieldPercentileThreshold = 50 | 75 | 90 | 95 | 99

type HIndexProgressMeta = {
  currentH: number
  targetH: number
  progressPct: number
  immediateCount: number
  nearCount: number
  longerCount: number
  hasGapData: boolean
}

function fallbackMonthLabels(count: number): string[] {
  const today = new Date()
  return Array.from({ length: count }, (_, index) => {
    const shift = count - 1 - index
    const monthDate = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth() - shift, 1))
    return monthDate.toLocaleString('en-GB', { month: 'short' })
  })
}

const MONTH_INDEX_BY_NAME: Record<string, number> = {
  jan: 0,
  january: 0,
  feb: 1,
  february: 1,
  mar: 2,
  march: 2,
  apr: 3,
  april: 3,
  may: 4,
  jun: 5,
  june: 5,
  jul: 6,
  july: 6,
  aug: 7,
  august: 7,
  sep: 8,
  sept: 8,
  september: 8,
  oct: 9,
  october: 9,
  nov: 10,
  november: 10,
  dec: 11,
  december: 11,
}

const MONTH_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

function parseMonthIndex(value: string): number | null {
  const token = String(value || '').trim().toLowerCase()
  if (!token) {
    return null
  }
  const direct = MONTH_INDEX_BY_NAME[token]
  if (typeof direct === 'number') {
    return direct
  }
  const firstWord = token.split(/[\s/-]+/)[0]
  const fromFirstWord = MONTH_INDEX_BY_NAME[firstWord]
  return typeof fromFirstWord === 'number' ? fromFirstWord : null
}

function buildRollingWindowLabel(monthLabels: string[], endYear: number): string | null {
  if (!monthLabels.length || !Number.isFinite(endYear)) {
    return null
  }
  const startLabel = monthLabels[0]
  const endLabel = monthLabels[monthLabels.length - 1]
  const startMonthIndex = parseMonthIndex(startLabel)
  const endMonthIndex = parseMonthIndex(endLabel)
  if (startMonthIndex === null || endMonthIndex === null) {
    return null
  }
  const wrapsYearBoundary = startMonthIndex > endMonthIndex
  const startYear = wrapsYearBoundary ? endYear - 1 : endYear
  return `${MONTH_SHORT[startMonthIndex]} ${String(startYear).slice(-2)}-${MONTH_SHORT[endMonthIndex]} ${String(endYear).slice(-2)}`
}

function buildMomentumBreakdown(tile: PublicationMetricTilePayload): MomentumBreakdown {
  const chartData = (tile.chart_data || {}) as Record<string, unknown>
  const monthlySeries = toNumberArray(chartData.monthly_values_12m).map((item) => Math.max(0, item))
  const fallbackSeries = toNumberArray(tile.sparkline || []).map((item) => Math.max(0, item))
  const fullSeries = monthlySeries.length ? monthlySeries : fallbackSeries
  const lastNineValues = fullSeries.length >= 9 ? fullSeries.slice(-9) : fullSeries.slice()
  const sourceLabels = Array.isArray(chartData.month_labels_12m)
    ? chartData.month_labels_12m.filter((item) => typeof item === 'string') as string[]
    : []
  const labels = sourceLabels.length >= lastNineValues.length
    ? sourceLabels.slice(-lastNineValues.length)
    : fallbackMonthLabels(lastNineValues.length)
  const bars = lastNineValues.map((value, index) => ({
    label: labels[index] || `M${index + 1}`,
    value,
  }))
  const fullLabels = sourceLabels.length >= fullSeries.length
    ? sourceLabels.slice(-fullSeries.length)
    : fallbackMonthLabels(fullSeries.length)
  const baselineWindow = fullSeries.length >= 12 ? fullLabels.slice(-12, -3) : []
  const recentWindow = fullSeries.length >= 3 ? fullLabels.slice(-3) : []
  const baselineWindowLabel = baselineWindow.length > 0
    ? baselineWindow[0] === baselineWindow[baselineWindow.length - 1]
      ? baselineWindow[0]
      : `${baselineWindow[0]}-${baselineWindow[baselineWindow.length - 1]}`
    : null
  const recentWindowLabel = recentWindow.length > 0
    ? recentWindow[0] === recentWindow[recentWindow.length - 1]
      ? recentWindow[0]
      : `${recentWindow[0]}-${recentWindow[recentWindow.length - 1]}`
    : null

  const recent3 = fullSeries.length >= 3 ? fullSeries.slice(-3) : []
  const baseline9 = fullSeries.length >= 12 ? fullSeries.slice(-12, -3) : []
  const recent3Total = recent3.length === 3 ? recent3.reduce((sum, item) => sum + item, 0) : null
  const baseline9Total = baseline9.length === 9 ? baseline9.reduce((sum, item) => sum + item, 0) : null
  const rate3m = recent3Total === null ? null : recent3Total / 3
  const rate9m = baseline9Total === null ? null : baseline9Total / 9
  const insufficientBaseline = rate3m === null || rate9m === null || rate9m <= 1e-6
  const liftPct = insufficientBaseline || rate3m === null || rate9m === null ? null : ((rate3m / rate9m) - 1) * 100

  return {
    bars,
    baselineWindowLabel,
    recentWindowLabel,
    recent3Total,
    baseline9Total,
    rate3m,
    rate9m,
    liftPct,
    insufficientBaseline,
  }
}

function buildMomentumYearBreakdown(totalCitationsTile: PublicationMetricTilePayload | null): MomentumYearBreakdown | null {
  if (!totalCitationsTile) {
    return null
  }
  const chartData = (totalCitationsTile.chart_data || {}) as Record<string, unknown>
  const years = toNumberArray(chartData.years).map((item) => Math.round(item))
  const values = toNumberArray(chartData.values).map((item) => Math.max(0, item))
  const pairCount = Math.min(years.length, values.length)
  if (pairCount <= 0) {
    return null
  }
  const lastFivePairs = Array.from({ length: pairCount }, (_, index) => ({
    year: years[index],
    value: values[index],
  })).slice(-5)
  const bars = lastFivePairs.map((item) => ({
    label: String(item.year),
    value: item.value,
  }))
  const priorYears = lastFivePairs.slice(0, -1).map((item) => item.year)
  const priorYearsLabel = priorYears.length > 0
    ? priorYears.length === 1
      ? String(priorYears[0])
      : `${priorYears[0]}-${priorYears[priorYears.length - 1]}`
    : null
  const projectedYearRaw = Number(chartData.projected_year)
  const projectedYear = Number.isFinite(projectedYearRaw) ? Math.round(projectedYearRaw) : new Date().getUTCFullYear()
  const monthlySeries = toNumberArray(chartData.monthly_values_12m).map((item) => Math.max(0, item))
  const recent12Total = monthlySeries.length >= 12 ? monthlySeries.slice(-12).reduce((sum, item) => sum + item, 0) : null
  const monthLabels = Array.isArray(chartData.month_labels_12m)
    ? chartData.month_labels_12m.filter((item) => typeof item === 'string') as string[]
    : []
  const trailingWindowLabels = monthLabels.length >= 12 ? monthLabels.slice(-12) : []
  const rollingWindowLabel = trailingWindowLabels.length ? buildRollingWindowLabel(trailingWindowLabels, projectedYear) : null
  const latestYearValue = lastFivePairs.length > 0 ? lastFivePairs[lastFivePairs.length - 1].value : null
  const recentYearLabel = rollingWindowLabel || (lastFivePairs.length > 0 ? String(lastFivePairs[lastFivePairs.length - 1].year) : null)
  const latest = recent12Total ?? latestYearValue
  const priorFourValues = lastFivePairs.slice(0, -1).map((item) => item.value)
  const baseline4Total = priorFourValues.length >= 4
    ? priorFourValues.slice(-4).reduce((sum, item) => sum + item, 0)
    : null
  const rate1y = latest === null ? null : latest
  const rate4y = baseline4Total === null ? null : baseline4Total / 4
  const insufficientBaseline = rate1y === null || rate4y === null || rate4y <= 1e-6
  const liftPct = insufficientBaseline || rate1y === null || rate4y === null ? null : ((rate1y / rate4y) - 1) * 100
  return {
    bars,
    priorYearsLabel,
    recentYearLabel,
    recent1Total: rate1y,
    baseline4Total,
    rate1y,
    rate4y,
    liftPct,
    insufficientBaseline,
  }
}

function buildHIndexProgressMeta(tile: PublicationMetricTilePayload): HIndexProgressMeta {
  const chartData = (tile.chart_data || {}) as Record<string, unknown>
  const currentCandidates = [
    Number(chartData.current_h_index),
    Number(tile.main_value),
    Number(tile.value),
  ]
  const currentCandidate = currentCandidates.find((item) => Number.isFinite(item) && item >= 0)
  const currentH = Math.max(0, Math.round(currentCandidate ?? 0))
  const nextHRaw = Number(chartData.next_h_index)
  const nextHCandidate = Number.isFinite(nextHRaw) ? Math.round(nextHRaw) : currentH + 1
  const targetH = nextHCandidate > currentH ? nextHCandidate : currentH + 1
  const progressRaw = Number(chartData.progress_to_next_pct)
  const progressPct = Number.isFinite(progressRaw)
    ? Math.max(0, Math.min(100, progressRaw))
    : 0
  const candidateGaps = toNumberArray(chartData.candidate_gaps)
    .map((item) => Math.max(0, Math.round(item)))
  const immediateCount = candidateGaps.filter((gap) => gap <= 1).length
  const nearCount = candidateGaps.filter((gap) => gap >= 2 && gap <= 3).length
  const longerCount = candidateGaps.filter((gap) => gap >= 4).length
  return {
    currentH,
    targetH,
    progressPct,
    immediateCount,
    nearCount,
    longerCount,
    hasGapData: candidateGaps.length > 0,
  }
}

type LinePoint = {
  x: number
  y: number
  value: number
  label: string
}

function toStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return []
  }
  return value
    .map((item) => String(item || '').trim())
    .filter(Boolean)
}

function normalizeSeriesLabels(value: unknown, count: number, prefix: string): string[] {
  const labels = toStringArray(value)
  if (labels.length >= count) {
    return labels.slice(-count)
  }
  return Array.from({ length: count }, (_, index) => `${prefix} ${index + 1}`)
}

function buildLinePoints(
  values: number[],
  width: number,
  height: number,
  labels: string[],
  padding = 6,
): LinePoint[] {
  if (!values.length) {
    return []
  }
  const max = Math.max(...values)
  const min = Math.min(...values)
  const range = Math.max(1e-6, max - min)
  const step = values.length > 1 ? (width - padding * 2) / (values.length - 1) : 0
  return values.map((value, index) => ({
    x: padding + index * step,
    y: height - padding - ((value - min) / range) * (height - padding * 2),
    value,
    label: labels[index] || `${index + 1}`,
  }))
}

function monotonePathFromPoints(points: Array<{ x: number; y: number }>): string {
  if (points.length === 0) {
    return ''
  }
  if (points.length === 1) {
    const p = points[0]
    return `M ${p.x} ${p.y}`
  }
  if (points.length === 2) {
    return `M ${points[0].x} ${points[0].y} L ${points[1].x} ${points[1].y}`
  }

  const n = points.length
  const slopes: number[] = []
  for (let index = 0; index < n - 1; index += 1) {
    const dx = points[index + 1].x - points[index].x
    slopes.push(dx === 0 ? 0 : (points[index + 1].y - points[index].y) / dx)
  }

  const tangents = new Array<number>(n).fill(0)
  tangents[0] = slopes[0]
  tangents[n - 1] = slopes[n - 2]
  for (let index = 1; index < n - 1; index += 1) {
    const left = slopes[index - 1]
    const right = slopes[index]
    tangents[index] = left * right <= 0 ? 0 : (left + right) / 2
  }

  for (let index = 0; index < n - 1; index += 1) {
    const slope = slopes[index]
    if (Math.abs(slope) < 1e-9) {
      tangents[index] = 0
      tangents[index + 1] = 0
      continue
    }
    const a = tangents[index] / slope
    const b = tangents[index + 1] / slope
    const magnitude = (a * a) + (b * b)
    if (magnitude > 9) {
      const scale = 3 / Math.sqrt(magnitude)
      tangents[index] = scale * a * slope
      tangents[index + 1] = scale * b * slope
    }
  }

  let d = `M ${points[0].x} ${points[0].y}`
  for (let index = 0; index < n - 1; index += 1) {
    const current = points[index]
    const next = points[index + 1]
    const dx = next.x - current.x
    const cp1x = current.x + (dx / 3)
    const cp1y = current.y + ((tangents[index] * dx) / 3)
    const cp2x = next.x - (dx / 3)
    const cp2y = next.y - ((tangents[index + 1] * dx) / 3)
    d += ` C ${cp1x} ${cp1y}, ${cp2x} ${cp2y}, ${next.x} ${next.y}`
  }
  return d
}

type TotalCitationsMeanRelation = 'above' | 'below' | 'at'

type TotalCitationsBar = {
  key: string
  axisLabel: string
  axisSubLabel?: string
  value: number
  isYtd: boolean
  relation: TotalCitationsMeanRelation
}

type TotalCitationsChartModel = {
  bars: TotalCitationsBar[]
  meanValue: number | null
}

const TOTAL_CITATIONS_MEAN_TOLERANCE = 0.025

function relationVsMean(value: number, meanValue: number | null): TotalCitationsMeanRelation {
  if (meanValue === null || meanValue <= 0) {
    return 'at'
  }
  const tolerance = meanValue * TOTAL_CITATIONS_MEAN_TOLERANCE
  if (value > meanValue + tolerance) {
    return 'above'
  }
  if (value < meanValue - tolerance) {
    return 'below'
  }
  return 'at'
}

function totalCitationsBarToneClass(bar: TotalCitationsBar): string {
  if (bar.isYtd) {
    return 'border border-dashed border-[hsl(var(--tone-neutral-500))] bg-[hsl(var(--tone-neutral-200))]'
  }
  if (bar.relation === 'above') {
    return 'bg-[hsl(var(--tone-positive-600))]'
  }
  if (bar.relation === 'below') {
    return 'bg-[hsl(var(--tone-warning-500))]'
  }
  return 'bg-[hsl(var(--tone-neutral-400))]'
}

function buildTotalCitationsChartModel(tile: PublicationMetricTilePayload): TotalCitationsChartModel {
  const chartData = (tile.chart_data || {}) as Record<string, unknown>
  const yearsRaw = toNumberArray(chartData.years).map((item) => Math.round(item))
  const valuesRaw = toNumberArray(chartData.values).map((item) => Math.max(0, item))
  const pairCount = Math.min(yearsRaw.length, valuesRaw.length)
  const yearlyPairs = Array.from({ length: pairCount }, (_, index) => ({
    year: yearsRaw[index],
    value: valuesRaw[index],
  }))
  const projectedYearRaw = Number(chartData.projected_year)
  const projectedYear = Number.isFinite(projectedYearRaw) ? Math.round(projectedYearRaw) : new Date().getUTCFullYear()
  const currentYearYtdRaw = Number(chartData.current_year_ytd)
  const historicalYearPairs = yearlyPairs.filter((item) => item.year !== projectedYear)
  const historicalValues = historicalYearPairs.map((item) => item.value)
  const meanValueRaw = Number(chartData.mean_value)
  const meanYearValue = Number.isFinite(meanValueRaw) && meanValueRaw > 0
    ? meanValueRaw
    : historicalValues.length
      ? historicalValues.reduce((sum, item) => sum + item, 0) / historicalValues.length
      : null
  const currentYearFallback = yearlyPairs.find((item) => item.year === projectedYear)?.value ?? 0
  const currentYearYtd = Number.isFinite(currentYearYtdRaw)
    ? Math.max(0, currentYearYtdRaw)
    : currentYearFallback
  if (!historicalYearPairs.length && currentYearYtd <= 0) {
    return { bars: [], meanValue: meanYearValue }
  }
  const bars: TotalCitationsBar[] = [
    ...historicalYearPairs.map((item) => {
      const relation = relationVsMean(item.value, meanYearValue)
      return {
        key: `year-${item.year}`,
        axisLabel: String(item.year).slice(-2),
        value: item.value,
        isYtd: false,
        relation,
      }
    }),
    {
      key: `year-${projectedYear}-ytd`,
      axisLabel: String(projectedYear).slice(-2),
      axisSubLabel: 'YTD',
      value: currentYearYtd,
      isYtd: true,
      relation: relationVsMean(currentYearYtd, meanYearValue),
    },
  ]
  return {
    bars,
    meanValue: meanYearValue,
  }
}

function TotalCitationsModeChart({ tile }: { tile: PublicationMetricTilePayload }) {
  const [chartVisible, setChartVisible] = useState(true)
  const [barsExpanded, setBarsExpanded] = useState(false)
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null)
  const model = useMemo(() => buildTotalCitationsChartModel(tile), [tile])
  const animationKey = useMemo(
    () => `year:${model.bars.map((bar) => `${bar.key}-${bar.value}`).join('|')}:${model.meanValue ?? 'none'}`,
    [model.bars, model.meanValue],
  )
  useEffect(() => {
    setChartVisible(false)
    setBarsExpanded(false)
    let rafOne = 0
    let rafTwo = 0
    rafOne = window.requestAnimationFrame(() => {
      setChartVisible(true)
      rafTwo = window.requestAnimationFrame(() => {
        setBarsExpanded(true)
      })
    })
    return () => {
      window.cancelAnimationFrame(rafOne)
      window.cancelAnimationFrame(rafTwo)
    }
  }, [animationKey])

  if (!model.bars.length) {
    return <div className={dashboardTileStyles.emptyChart}>No citation data</div>
  }

  const maxValue = Math.max(
    1,
    ...model.bars.map((bar) => Math.max(0, bar.value)),
    model.meanValue !== null ? Math.max(0, model.meanValue) : 0,
  )
  const scaledMax = maxValue * 1.18
  const meanLinePercent = model.meanValue !== null
    ? Math.max(0, Math.min(100, (Math.max(0, model.meanValue) / scaledMax) * 100))
    : null

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div
        className={cn(
          'relative flex-1 rounded-md border border-[hsl(var(--tone-neutral-200))] bg-background px-2 pb-7 pt-4 transition-opacity duration-200',
          chartVisible ? 'opacity-100' : 'opacity-0',
        )}
      >
        <div className="absolute inset-x-2 bottom-7 top-4">
          {[25, 50, 75].map((pct) => (
            <div
              key={`grid-${pct}`}
              className="pointer-events-none absolute inset-x-0 border-t border-[hsl(var(--tone-neutral-200))]"
              style={{ bottom: `${pct}%` }}
              aria-hidden="true"
            />
          ))}
          {meanLinePercent !== null ? (
            <div
              className="pointer-events-none absolute inset-x-0 border-t border-dashed border-[hsl(var(--tone-neutral-400))]"
              style={{ bottom: `${meanLinePercent}%` }}
              aria-hidden="true"
            />
          ) : null}
          <div className="absolute inset-0 flex items-end gap-1">
            {model.bars.map((bar, index) => {
              const heightPct = bar.value <= 0 ? 3 : Math.max(6, (Math.max(0, bar.value) / scaledMax) * 100)
              const isActive = hoveredIndex === index
              return (
                <div
                  key={bar.key}
                  className="relative flex h-full min-h-0 flex-1 items-end"
                  onMouseEnter={() => setHoveredIndex(index)}
                  onMouseLeave={() => setHoveredIndex((current) => (current === index ? null : current))}
                >
                  <span
                    className={cn(
                      'pointer-events-none absolute left-1/2 z-[2] -translate-x-1/2 whitespace-nowrap rounded-md border border-[hsl(var(--tone-neutral-300))] bg-[hsl(var(--tone-neutral-50))] px-2 py-0.5 text-[0.6rem] leading-none text-[hsl(var(--tone-neutral-700))] transition-all duration-150 ease-out',
                      isActive ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-1',
                    )}
                    style={{ bottom: `calc(${heightPct}% + 0.35rem)` }}
                    aria-hidden="true"
                  >
                    {formatInt(bar.value)}
                  </span>
                  <span
                    className={cn(
                      'block w-full rounded-[4px] transition-[transform,filter,box-shadow] duration-220 ease-out',
                      totalCitationsBarToneClass(bar),
                      isActive && 'brightness-[1.08] saturate-[1.14] shadow-[0_0_0_1px_hsl(var(--tone-neutral-300))]',
                    )}
                    style={{
                      height: `${heightPct}%`,
                      transform: `translateY(${isActive ? '-1px' : '0px'}) scaleX(${isActive ? 1.035 : 1}) scaleY(${barsExpanded ? 1 : 0})`,
                      transformOrigin: 'bottom',
                      transitionDelay: `${Math.min(220, index * 18)}ms`,
                    }}
                  />
                </div>
              )
            })}
          </div>
        </div>
        <div className="pointer-events-none absolute inset-x-2 bottom-1 grid grid-flow-col auto-cols-fr items-start gap-1">
          {model.bars.map((bar) => (
            <div key={`${bar.key}-axis`} className="text-center leading-none">
              <p className="text-[0.6rem] font-semibold text-[hsl(var(--tone-neutral-600))]">{bar.axisLabel}</p>
              {bar.axisSubLabel ? (
                <p className="mt-[1px] text-[0.54rem] font-semibold uppercase tracking-[0.05em] text-[hsl(var(--tone-neutral-600))]">
                  {bar.axisSubLabel}
                </p>
              ) : null}
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

function TotalCitationsTile({
  tile,
  onOpen,
  shouldIgnoreTileOpen,
}: {
  tile: PublicationMetricTilePayload
  onOpen: () => void
  shouldIgnoreTileOpen: (target: EventTarget | null) => boolean
}) {
  const primaryValue = tile.value_display || '\u2014'

  return (
    <div
      role="button"
      tabIndex={0}
      data-metric-key={tile.key}
      onClick={(event) => {
        if (shouldIgnoreTileOpen(event.target)) {
          return
        }
        onOpen()
      }}
      onKeyDown={(event) => {
        if (shouldIgnoreTileOpen(event.target)) {
          return
        }
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault()
          onOpen()
        }
      }}
      className={cn(
        dashboardTileStyles.tileShell,
        tile.stability === 'unstable' && dashboardTileStyles.tileShellUnstable,
        'min-h-36 bg-card px-3 py-2.5 hover:bg-card hover:border-[hsl(var(--tone-neutral-300))]',
      )}
    >
      <div className="grid h-full min-h-[9.5rem] grid-cols-[minmax(0,0.85fr)_minmax(0,1.32fr)] gap-3">
        <div className="flex min-h-0 flex-col">
          <p
            className="text-[0.64rem] font-semibold uppercase leading-[0.8rem] tracking-[0.08em] text-[hsl(var(--tone-neutral-700))]"
            data-testid={`metric-label-${tile.key}`}
          >
            TOTAL CITATIONS
          </p>
          <p
            className="mt-2.5 text-[2.15rem] font-semibold leading-[1] tracking-tight text-foreground"
            data-testid={`metric-value-${tile.key}`}
          >
            {primaryValue}
          </p>
          <p className="mt-1 text-[0.72rem] font-medium leading-4 text-[hsl(var(--tone-neutral-700))]">Lifetime citations</p>
          <p className="text-[0.62rem] leading-4 text-[hsl(var(--tone-neutral-500))]">Last 5 years shown</p>
        </div>

        <div className="min-h-0">
          <TotalCitationsModeChart tile={tile} />
        </div>
      </div>
    </div>
  )
}

function StructuredMetricTile({
  tile,
  primaryValue,
  badge,
  pinBadgeBottom = true,
  subtitle,
  detail,
  visual,
  onOpen,
  shouldIgnoreTileOpen,
}: {
  tile: PublicationMetricTilePayload
  primaryValue: ReactNode
  badge?: ReactNode
  pinBadgeBottom?: boolean
  subtitle: ReactNode
  detail?: ReactNode
  visual: ReactNode
  onOpen: () => void
  shouldIgnoreTileOpen: (target: EventTarget | null) => boolean
}) {
  return (
    <div
      role="button"
      tabIndex={0}
      data-metric-key={tile.key}
      onClick={(event) => {
        if (shouldIgnoreTileOpen(event.target)) {
          return
        }
        onOpen()
      }}
      onKeyDown={(event) => {
        if (shouldIgnoreTileOpen(event.target)) {
          return
        }
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault()
          onOpen()
        }
      }}
      className={cn(
        dashboardTileStyles.tileShell,
        tile.stability === 'unstable' && dashboardTileStyles.tileShellUnstable,
        'min-h-36 bg-card px-3 py-2.5 hover:bg-card hover:border-[hsl(var(--tone-neutral-300))]',
      )}
    >
      <div className="grid h-full min-h-[9.5rem] grid-cols-[minmax(0,0.85fr)_minmax(0,1.32fr)] gap-3">
        <div className="flex min-h-0 flex-col">
          <p
            className="text-[0.64rem] font-semibold uppercase leading-[0.8rem] tracking-[0.08em] text-[hsl(var(--tone-neutral-700))]"
            data-testid={`metric-label-${tile.key}`}
          >
            {String(tile.label || '').toUpperCase()}
          </p>
          <p
            className="mt-2.5 text-[2.15rem] font-semibold leading-[1] tracking-tight text-foreground"
            data-testid={`metric-value-${tile.key}`}
          >
            {primaryValue}
          </p>
          <p className="mt-1 text-[0.72rem] font-medium leading-4 text-[hsl(var(--tone-neutral-700))]">{subtitle}</p>
          {typeof detail === 'string'
            ? <p className="text-[0.62rem] leading-4 text-[hsl(var(--tone-neutral-500))]">{detail}</p>
            : detail
              ? <div className="pt-0.5">{detail}</div>
              : null}
          {badge ? <div className={cn(pinBadgeBottom ? 'mt-auto pt-1' : 'pt-1')}>{badge}</div> : null}
        </div>
        <div className="flex h-full min-h-0 items-center">
          {visual}
        </div>
      </div>
    </div>
  )
}

function HIndexYearChart({ tile, showCaption = false }: { tile: PublicationMetricTilePayload; showCaption?: boolean }) {
  const [chartVisible, setChartVisible] = useState(true)
  const [barsExpanded, setBarsExpanded] = useState(false)
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null)
  const chartData = (tile.chart_data || {}) as Record<string, unknown>
  const years = toNumberArray(chartData.years).map((item) => Math.round(item))
  const values = toNumberArray(chartData.values).map((item) => Math.max(0, item))
  const projectedYearRaw = Number(chartData.projected_year)
  const currentHIndexRaw = Number(chartData.current_h_index)
  const projectedYear = Number.isFinite(projectedYearRaw) ? Math.round(projectedYearRaw) : new Date().getUTCFullYear()

  if (!years.length || !values.length || years.length !== values.length) {
    return <div className={dashboardTileStyles.emptyChart}>No h-index timeline</div>
  }

  const baseBars: Array<{ year: number; value: number; current: boolean }> = years.map((year, index) => ({
    year,
    value: values[index],
    current: false,
  }))
  const existingCurrentBar = baseBars.find((item) => item.year === projectedYear)
  const bars = baseBars.filter((item) => item.year !== projectedYear)
  const currentValue = Math.max(
    0,
    Number.isFinite(currentHIndexRaw)
      ? currentHIndexRaw
      : existingCurrentBar
        ? existingCurrentBar.value
        : bars.length
          ? bars[bars.length - 1].value
          : 0,
  )
  bars.push({
    year: projectedYear,
    value: currentValue,
    current: true,
  })
  const animationKey = useMemo(
    () => bars.map((bar) => `${bar.year}-${bar.value}-${bar.current ? 1 : 0}`).join('|'),
    [bars],
  )
  useEffect(() => {
    setChartVisible(false)
    setBarsExpanded(false)
    let rafOne = 0
    let rafTwo = 0
    rafOne = window.requestAnimationFrame(() => {
      setChartVisible(true)
      rafTwo = window.requestAnimationFrame(() => {
        setBarsExpanded(true)
      })
    })
    return () => {
      window.cancelAnimationFrame(rafOne)
      window.cancelAnimationFrame(rafTwo)
    }
  }, [animationKey])

  const maxValue = Math.max(1, ...bars.map((bar) => Math.max(0, bar.value)))
  const scaledMax = maxValue * 1.18

  return (
    <div className="flex h-full min-h-0 w-full flex-col">
      <div
        className={cn(
          'relative flex-1 rounded-md border border-[hsl(var(--tone-neutral-200))] bg-background px-2 pb-7 pt-4 transition-[opacity,transform,filter] duration-320 ease-out',
          chartVisible ? 'opacity-100 translate-y-0 scale-100 blur-0' : 'opacity-0 translate-y-1 scale-[0.985] blur-[0.4px]',
        )}
      >
        <div className="absolute inset-x-2 bottom-7 top-4">
          {[25, 50, 75].map((pct) => (
            <div
              key={`h-grid-${pct}`}
              className="pointer-events-none absolute inset-x-0 border-t border-[hsl(var(--tone-neutral-200))]"
              style={{ bottom: `${pct}%` }}
              aria-hidden="true"
            />
          ))}
          <div className="absolute inset-0 flex items-end gap-1">
            {bars.map((bar, index) => {
              const heightPct = bar.value <= 0 ? 3 : Math.max(6, (Math.max(0, bar.value) / scaledMax) * 100)
              const isActive = hoveredIndex === index
              const toneClass = bar.current
                ? 'border border-dashed border-[hsl(var(--tone-neutral-500))] bg-[hsl(var(--tone-neutral-200))]'
                : 'bg-[hsl(var(--tone-accent-500))]'
              return (
                <div
                  key={`${bar.year}-${index}`}
                  className="relative flex h-full min-h-0 flex-1 items-end"
                  onMouseEnter={() => setHoveredIndex(index)}
                  onMouseLeave={() => setHoveredIndex((current) => (current === index ? null : current))}
                >
                  <span
                    className={cn(
                      'pointer-events-none absolute left-1/2 z-[2] -translate-x-1/2 whitespace-nowrap rounded-md border border-[hsl(var(--tone-neutral-300))] bg-[hsl(var(--tone-neutral-50))] px-2 py-0.5 text-[0.6rem] leading-none text-[hsl(var(--tone-neutral-700))] transition-all duration-150 ease-out',
                      isActive ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-1',
                    )}
                    style={{ bottom: `calc(${heightPct}% + 0.35rem)` }}
                    aria-hidden="true"
                  >
                    h {formatInt(bar.value)}
                  </span>
                  <span
                    className={cn(
                      'block w-full rounded-[4px] transition-[transform,filter,box-shadow] duration-220 ease-out',
                      toneClass,
                      isActive && 'brightness-[1.08] saturate-[1.14] shadow-[0_0_0_1px_hsl(var(--tone-neutral-300))]',
                    )}
                    style={{
                      height: `${heightPct}%`,
                      transform: `translateY(${isActive ? '-1px' : '0px'}) scaleX(${isActive ? 1.035 : 1}) scaleY(${barsExpanded ? 1 : 0})`,
                      transformOrigin: 'bottom',
                      transitionDelay: `${Math.min(220, index * 18)}ms`,
                    }}
                  />
                </div>
              )
            })}
          </div>
        </div>
        <div className="pointer-events-none absolute inset-x-2 bottom-1 grid grid-flow-col auto-cols-fr items-start gap-1">
          {bars.map((bar, index) => (
            <div key={`${bar.year}-${index}-axis`} className="text-center leading-none">
              <p className="text-[0.6rem] font-semibold text-[hsl(var(--tone-neutral-600))]">{String(bar.year).slice(-2)}</p>
              {bar.current ? (
                <p className="mt-[1px] text-[0.54rem] font-semibold uppercase tracking-[0.05em] text-[hsl(var(--tone-neutral-600))]">
                  YTD
                </p>
              ) : null}
            </div>
          ))}
        </div>
      </div>
      {showCaption ? <p className={dashboardTileStyles.tileMicroLabel}>h-index by year; dashed bar is current year.</p> : null}
    </div>
  )
}

function PublicationsPerYearChart({ tile, showCaption = false }: { tile: PublicationMetricTilePayload; showCaption?: boolean }) {
  const [chartVisible, setChartVisible] = useState(true)
  const [barsExpanded, setBarsExpanded] = useState(false)
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null)
  const chartData = (tile.chart_data || {}) as Record<string, unknown>
  const years = toNumberArray(chartData.years).map((item) => Math.round(item))
  const values = toNumberArray(chartData.values).map((item) => Math.max(0, item))
  const hasValidSeries = years.length > 0 && values.length > 0 && years.length === values.length
  const validYears = hasValidSeries ? years : []
  const validValues = hasValidSeries ? values : []
  const meanValueRaw = Number(chartData.mean_value)
  const meanValue = Number.isFinite(meanValueRaw) && meanValueRaw >= 0
    ? meanValueRaw
    : validValues.reduce((sum, item) => sum + item, 0) / Math.max(1, validValues.length)
  const projectedYearRaw = Number(chartData.projected_year)
  const currentYearYtdRaw = Number(chartData.current_year_ytd)
  const projectedYear = Number.isFinite(projectedYearRaw) ? Math.round(projectedYearRaw) : new Date().getUTCFullYear()
  const bars: Array<{
    year: number
    value: number
    current: boolean
    relative: 'above' | 'near' | 'below'
  }> = validYears.map((year, index) => {
    const value = validValues[index]
    const relative = value >= meanValue * 1.1 ? 'above' : value <= meanValue * 0.9 ? 'below' : 'near'
    return { year, value, current: false, relative }
  })
  const existingCurrentBar = bars.find((item) => item.year === projectedYear)
  const historyBars = bars.filter((item) => item.year !== projectedYear)
  const currentYearValue = Math.max(
    0,
    Number.isFinite(currentYearYtdRaw)
      ? currentYearYtdRaw
      : existingCurrentBar
        ? existingCurrentBar.value
        : 0,
  )
  if (hasValidSeries) {
    historyBars.push({
      year: projectedYear,
      value: currentYearValue,
      current: true,
      relative: 'near',
    })
  }

  const animationKey = useMemo(
    () => historyBars.map((bar) => `${bar.year}-${bar.value}-${bar.current ? 1 : 0}`).join('|'),
    [historyBars],
  )
  useEffect(() => {
    setChartVisible(false)
    setBarsExpanded(false)
    let rafOne = 0
    let rafTwo = 0
    rafOne = window.requestAnimationFrame(() => {
      setChartVisible(true)
      rafTwo = window.requestAnimationFrame(() => {
        setBarsExpanded(true)
      })
    })
    return () => {
      window.cancelAnimationFrame(rafOne)
      window.cancelAnimationFrame(rafTwo)
    }
  }, [animationKey])

  if (!hasValidSeries || !historyBars.length) {
    return <div className={dashboardTileStyles.emptyChart}>No publication timeline</div>
  }

  const maxValue = Math.max(1, ...historyBars.map((bar) => Math.max(0, bar.value)))
  const scaledMax = maxValue * 1.18

  return (
    <div className="flex h-full min-h-0 w-full flex-col">
      <div
        className={cn(
          'relative flex-1 rounded-md border border-[hsl(var(--tone-neutral-200))] bg-background px-2 pb-7 pt-4 transition-[opacity,transform,filter] duration-320 ease-out',
          chartVisible ? 'opacity-100 translate-y-0 scale-100 blur-0' : 'opacity-0 translate-y-1 scale-[0.985] blur-[0.4px]',
        )}
      >
        <div className="absolute inset-x-2 bottom-7 top-4">
          {[25, 50, 75].map((pct) => (
            <div
              key={`pub-grid-${pct}`}
              className="pointer-events-none absolute inset-x-0 border-t border-[hsl(var(--tone-neutral-200))]"
              style={{ bottom: `${pct}%` }}
              aria-hidden="true"
            />
          ))}
          <div
            className="pointer-events-none absolute inset-x-0 border-t border-dashed border-[hsl(var(--tone-neutral-400))]"
            style={{ bottom: `${Math.max(0, Math.min(100, (Math.max(0, meanValue) / scaledMax) * 100))}%` }}
            aria-hidden="true"
          />
          <div className="absolute inset-0 flex items-end gap-1">
            {historyBars.map((bar, index) => {
              const heightPct = bar.value <= 0 ? 3 : Math.max(6, (Math.max(0, bar.value) / scaledMax) * 100)
              const isActive = hoveredIndex === index
              const toneClass = bar.current
                ? 'border border-dashed border-[hsl(var(--tone-neutral-500))] bg-[hsl(var(--tone-neutral-200))]'
                : bar.relative === 'above'
                  ? 'bg-[hsl(var(--tone-positive-600))]'
                  : bar.relative === 'below'
                    ? 'bg-[hsl(var(--tone-warning-500))]'
                    : 'bg-[hsl(var(--tone-accent-500))]'
              return (
                <div
                  key={`${bar.year}-${index}`}
                  className="relative flex h-full min-h-0 flex-1 items-end"
                  onMouseEnter={() => setHoveredIndex(index)}
                  onMouseLeave={() => setHoveredIndex((current) => (current === index ? null : current))}
                >
                  <span
                    className={cn(
                      'pointer-events-none absolute left-1/2 z-[2] -translate-x-1/2 whitespace-nowrap rounded-md border border-[hsl(var(--tone-neutral-300))] bg-[hsl(var(--tone-neutral-50))] px-2 py-0.5 text-[0.6rem] leading-none text-[hsl(var(--tone-neutral-700))] transition-all duration-150 ease-out',
                      isActive ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-1',
                    )}
                    style={{ bottom: `calc(${heightPct}% + 0.35rem)` }}
                    aria-hidden="true"
                  >
                    {formatInt(bar.value)}
                  </span>
                  <span
                    className={cn(
                      'block w-full rounded-[4px] transition-[transform,filter,box-shadow] duration-220 ease-out',
                      toneClass,
                      isActive && 'brightness-[1.08] saturate-[1.14] shadow-[0_0_0_1px_hsl(var(--tone-neutral-300))]',
                    )}
                    style={{
                      height: `${heightPct}%`,
                      transform: `translateY(${isActive ? '-1px' : '0px'}) scaleX(${isActive ? 1.035 : 1}) scaleY(${barsExpanded ? 1 : 0})`,
                      transformOrigin: 'bottom',
                      transitionDelay: `${Math.min(220, index * 18)}ms`,
                    }}
                  />
                </div>
              )
            })}
          </div>
        </div>
        <div className="pointer-events-none absolute inset-x-2 bottom-1 grid grid-flow-col auto-cols-fr items-start gap-1">
          {historyBars.map((bar, index) => (
            <div key={`${bar.year}-${index}-axis`} className="text-center leading-none">
              <p className="text-[0.6rem] font-semibold text-[hsl(var(--tone-neutral-600))]">{String(bar.year).slice(-2)}</p>
              {bar.current ? (
                <p className="mt-[1px] text-[0.54rem] font-semibold uppercase tracking-[0.05em] text-[hsl(var(--tone-neutral-600))]">
                  YTD
                </p>
              ) : null}
            </div>
          ))}
        </div>
      </div>
      {showCaption ? (
        <p className={cn(dashboardTileStyles.tileMicroLabel, 'mt-1')}>
          Dashed bar is current year to date.
        </p>
      ) : null}
    </div>
  )
}

function ImpactConcentrationPanel({ tile }: { tile: PublicationMetricTilePayload }) {
  const [chartVisible, setChartVisible] = useState(true)
  const [ringExpanded, setRingExpanded] = useState(false)
  const [hoveredSegment, setHoveredSegment] = useState<'top3' | 'rest' | null>(null)
  const chartData = (tile.chart_data || {}) as Record<string, unknown>
  const values = toNumberArray(chartData.values).map((item) => Math.max(0, item))
  const top3 = values[0] || 0
  const rest = values[1] || 0
  const total = Math.max(0, top3 + rest)
  const ringRadius = 38
  const ringCircumference = 2 * Math.PI * ringRadius
  const top3Pct = total > 0 ? (top3 / total) * 100 : 0
  const top3PctRounded = Math.max(0, Math.min(100, Math.round(top3Pct)))
  const restPctRounded = Math.max(0, 100 - top3PctRounded)
  const top3Dash = ((ringExpanded ? top3PctRounded : 0) / 100) * ringCircumference
  const restDash = ((ringExpanded ? restPctRounded : 100) / 100) * ringCircumference
  const restOffset = -top3Dash
  const explicitRemainingRaw = Number(chartData.remaining_papers_count)
  const explicitTotalPublicationsCandidates = [
    Number(chartData.total_publications),
    Number(chartData.total_publications_count),
    Number(chartData.total_papers),
    Number(chartData.paper_count),
  ]
  const explicitTotalPublications = explicitTotalPublicationsCandidates.find(
    (item) => Number.isFinite(item) && item >= 0,
  )
  const uncitedCountRaw = Number(chartData.uncited_publications_count)
  const uncitedPctRaw = Number(chartData.uncited_publications_pct)
  const inferredTotalPublications = Number.isFinite(uncitedCountRaw) && Number.isFinite(uncitedPctRaw) && uncitedPctRaw > 0
    ? Math.max(0, Math.round(uncitedCountRaw / (uncitedPctRaw / 100)))
    : null
  const totalPublications = explicitTotalPublications !== undefined
    ? Math.max(0, Math.round(explicitTotalPublications))
    : inferredTotalPublications
  const topPapersCountRaw = Number(chartData.top_papers_count ?? chartData.top_paper_count ?? 3)
  const topPapersCount = Math.max(0, Math.round(Number.isFinite(topPapersCountRaw) ? topPapersCountRaw : 3))
  const effectiveTopPapersCount = totalPublications === null
    ? topPapersCount
    : Math.max(0, Math.min(topPapersCount, totalPublications))
  const remainingPapersCount = Number.isFinite(explicitRemainingRaw) && explicitRemainingRaw >= 0
    ? Math.max(0, Math.round(explicitRemainingRaw))
    : totalPublications === null
      ? null
      : Math.max(0, totalPublications - effectiveTopPapersCount)
  const ringStrokeWidth = 14
  const ringHitHalfWidth = (ringStrokeWidth / 2) + 3
  const top3ArcSpan = (top3PctRounded / 100) * 360
  const top3ArcStart = 270 - (top3ArcSpan / 2)
  const isAngleInArc = (angle: number, start: number, span: number): boolean => {
    if (span <= 0) {
      return false
    }
    if (span >= 360) {
      return true
    }
    const normalizedAngle = ((angle % 360) + 360) % 360
    const normalizedStart = ((start % 360) + 360) % 360
    const end = (normalizedStart + span) % 360
    if (normalizedStart <= end) {
      return normalizedAngle >= normalizedStart && normalizedAngle <= end
    }
    return normalizedAngle >= normalizedStart || normalizedAngle <= end
  }
  const animationKey = useMemo(
    () => `${top3PctRounded}-${restPctRounded}-${totalPublications ?? 'na'}-${effectiveTopPapersCount}`,
    [effectiveTopPapersCount, restPctRounded, top3PctRounded, totalPublications],
  )
  useEffect(() => {
    setChartVisible(false)
    setRingExpanded(false)
    let rafOne = 0
    let rafTwo = 0
    rafOne = window.requestAnimationFrame(() => {
      setChartVisible(true)
      rafTwo = window.requestAnimationFrame(() => {
        setRingExpanded(true)
      })
    })
    return () => {
      window.cancelAnimationFrame(rafOne)
      window.cancelAnimationFrame(rafTwo)
    }
  }, [animationKey])

  return (
    <div className="flex h-full min-h-0 w-full flex-col">
      <div
        className={cn(
          'relative flex-1 rounded-md border border-[hsl(var(--tone-neutral-200))] bg-background px-2 pb-2 pt-2.5 transition-[opacity,transform,filter] duration-320 ease-out',
          chartVisible ? 'opacity-100 translate-y-0 scale-100 blur-0' : 'opacity-0 translate-y-1 scale-[0.985] blur-[0.4px]',
        )}
      >
        {total > 0 ? (
          <div className="relative flex h-full items-center justify-center">
            {hoveredSegment ? (
              <div
                className={cn(
                  'pointer-events-none absolute left-1/2 z-[2] -translate-x-1/2 whitespace-nowrap rounded-md border border-[hsl(var(--tone-neutral-300))] bg-[hsl(var(--tone-neutral-50))] px-2 py-0.5 text-[0.6rem] leading-none text-[hsl(var(--tone-neutral-700))] transition-all duration-150 ease-out',
                  hoveredSegment === 'top3' ? '-top-0.5' : '-bottom-0.5',
                )}
              >
                {hoveredSegment === 'top3'
                  ? `Top 3 papers: ${top3PctRounded}% (${formatInt(top3)} citations)`
                  : remainingPapersCount === null
                    ? `Remaining papers: ${restPctRounded}% (${formatInt(rest)} citations)`
                    : `Remaining ${formatInt(remainingPapersCount)} papers: ${restPctRounded}% (${formatInt(rest)} citations)`}
              </div>
            ) : null}
            <svg
              viewBox="0 0 100 100"
              className="h-[7rem] w-[7rem]"
              data-stop-tile-open="true"
              onMouseMove={(event) => {
                const bounds = event.currentTarget.getBoundingClientRect()
                const x = ((event.clientX - bounds.left) / Math.max(1, bounds.width)) * 100
                const y = ((event.clientY - bounds.top) / Math.max(1, bounds.height)) * 100
                const dx = x - 50
                const dy = y - 50
                const distance = Math.sqrt((dx * dx) + (dy * dy))
                if (Math.abs(distance - ringRadius) > ringHitHalfWidth) {
                  setHoveredSegment(null)
                  return
                }
                const angleDeg = ((Math.atan2(dy, dx) * 180) / Math.PI + 360) % 360
                if (isAngleInArc(angleDeg, top3ArcStart, top3ArcSpan)) {
                  setHoveredSegment('top3')
                  return
                }
                setHoveredSegment('rest')
              }}
              onMouseLeave={() => setHoveredSegment(null)}
            >
              <circle
                cx="50"
                cy="50"
                r={ringRadius}
                fill="none"
                stroke="hsl(var(--tone-neutral-200))"
                strokeWidth={ringStrokeWidth}
              />
              <circle
                cx="50"
                cy="50"
                r={ringRadius}
                fill="none"
                stroke="hsl(var(--tone-accent-700))"
                strokeWidth={ringStrokeWidth}
                strokeLinecap="round"
                transform={`rotate(${top3ArcStart} 50 50)`}
                style={{
                  strokeDasharray: `${top3Dash} ${ringCircumference}`,
                  strokeDashoffset: 0,
                  transition: 'stroke-dasharray 560ms cubic-bezier(0.2, 0.68, 0.16, 1)',
                }}
              />
              <circle
                cx="50"
                cy="50"
                r={ringRadius}
                fill="none"
                stroke="hsl(var(--tone-accent-300))"
                strokeWidth={ringStrokeWidth}
                strokeLinecap="round"
                transform={`rotate(${top3ArcStart} 50 50)`}
                style={{
                  strokeDasharray: `${restDash} ${ringCircumference}`,
                  strokeDashoffset: restOffset,
                  transition: 'stroke-dasharray 560ms cubic-bezier(0.2, 0.68, 0.16, 1), stroke-dashoffset 560ms cubic-bezier(0.2, 0.68, 0.16, 1)',
                }}
              />
            </svg>
          </div>
        ) : (
          <div className={dashboardTileStyles.emptyChart}>No concentration data</div>
        )}
      </div>
    </div>
  )
}

function MomentumTilePanel({
  tile,
  mode,
  yearBreakdown,
}: {
  tile: PublicationMetricTilePayload
  mode: MomentumWindowMode
  yearBreakdown: MomentumYearBreakdown | null
}) {
  const [chartVisible, setChartVisible] = useState(false)
  const [barsExpanded, setBarsExpanded] = useState(false)
  const [labelsVisible, setLabelsVisible] = useState(true)
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null)
  const monthlyBreakdown = buildMomentumBreakdown(tile)
  const useYearMode = mode === '5y' && Boolean(yearBreakdown?.bars.length)
  const comparisonBars = useMemo(() => {
    if (useYearMode) {
      const baseline = yearBreakdown?.rate4y ?? null
      const recent = yearBreakdown?.rate1y ?? null
      if (baseline === null && recent === null) {
        return []
      }
      return [
        {
          key: 'baseline',
          label: 'Prior 4-year avg',
          subLabel: yearBreakdown?.priorYearsLabel ? `(${yearBreakdown.priorYearsLabel})` : null,
          value: baseline ?? 0,
          recent: false,
        },
        {
          key: 'recent',
          label: 'Last 1-year avg',
          subLabel: yearBreakdown?.recentYearLabel ? `(${yearBreakdown.recentYearLabel})` : null,
          value: recent ?? 0,
          recent: true,
        },
      ]
    }
    const baseline = monthlyBreakdown.rate9m
    const recent = monthlyBreakdown.rate3m
    if (baseline === null && recent === null) {
      return []
    }
    return [
      {
        key: 'baseline',
        label: 'Prior 9-month avg',
        subLabel: monthlyBreakdown.baselineWindowLabel ? `(${monthlyBreakdown.baselineWindowLabel})` : null,
        value: baseline ?? 0,
        recent: false,
      },
      {
        key: 'recent',
        label: 'Last 3-month avg',
        subLabel: monthlyBreakdown.recentWindowLabel ? `(${monthlyBreakdown.recentWindowLabel})` : null,
        value: recent ?? 0,
        recent: true,
      },
    ]
  }, [
    monthlyBreakdown.baselineWindowLabel,
    monthlyBreakdown.rate3m,
    monthlyBreakdown.rate9m,
    monthlyBreakdown.recentWindowLabel,
    useYearMode,
    yearBreakdown?.priorYearsLabel,
    yearBreakdown?.rate1y,
    yearBreakdown?.rate4y,
    yearBreakdown?.recentYearLabel,
  ])
  const emptyLabel = useYearMode ? 'No 5-year citation data' : 'No monthly citation data'
  const barValues = comparisonBars.map((bar) => Math.max(0, bar.value))
  const maxValue = Math.max(1, ...barValues)
  const minValue = barValues.length ? Math.min(...barValues) : 0
  const spreadRatio = (maxValue - minValue) / Math.max(1, maxValue)
  const headroomFactor = spreadRatio <= 0.1 ? 1.03 : spreadRatio <= 0.25 ? 1.06 : 1.1
  const scaledMaxTarget = maxValue * headroomFactor
  const baselineTarget = comparisonBars.find((bar) => bar.key === 'baseline')?.value ?? 0
  const recentTarget = comparisonBars.find((bar) => bar.key === 'recent')?.value ?? 0

  const [animatedState, setAnimatedState] = useState<{
    baseline: number
    recent: number
    max: number
  }>(() => ({
    baseline: baselineTarget,
    recent: recentTarget,
    max: Math.max(1, scaledMaxTarget),
  }))
  const introPlayedRef = useRef(false)
  const labelsTransitionReadyRef = useRef(false)
  const animatedStateRef = useRef(animatedState)
  useEffect(() => {
    animatedStateRef.current = animatedState
  }, [animatedState])
  useEffect(() => {
    if (!comparisonBars.length || introPlayedRef.current) {
      return
    }
    const prefersReducedMotion =
      typeof window !== 'undefined' &&
      typeof window.matchMedia === 'function' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches
    if (prefersReducedMotion) {
      setChartVisible(true)
      setBarsExpanded(true)
      introPlayedRef.current = true
      return
    }
    setChartVisible(false)
    setBarsExpanded(false)
    let rafOne = 0
    let rafTwo = 0
    rafOne = window.requestAnimationFrame(() => {
      setChartVisible(true)
      rafTwo = window.requestAnimationFrame(() => {
        setBarsExpanded(true)
        introPlayedRef.current = true
      })
    })
    return () => {
      window.cancelAnimationFrame(rafOne)
      window.cancelAnimationFrame(rafTwo)
    }
  }, [comparisonBars.length])
  useLayoutEffect(() => {
    if (!labelsTransitionReadyRef.current) {
      labelsTransitionReadyRef.current = true
      return
    }
    const prefersReducedMotion =
      typeof window !== 'undefined' &&
      typeof window.matchMedia === 'function' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches
    if (prefersReducedMotion) {
      setLabelsVisible(true)
      return
    }
    setLabelsVisible(false)
    const timer = window.setTimeout(() => {
      setLabelsVisible(true)
    }, 110)
    return () => {
      window.clearTimeout(timer)
    }
  }, [mode])
  useEffect(() => {
    const target = {
      baseline: baselineTarget,
      recent: recentTarget,
      max: Math.max(1, scaledMaxTarget),
    }
    const current = animatedStateRef.current
    if (
      Math.abs(current.baseline - target.baseline) < 0.001 &&
      Math.abs(current.recent - target.recent) < 0.001 &&
      Math.abs(current.max - target.max) < 0.001
    ) {
      return
    }
    const prefersReducedMotion =
      typeof window !== 'undefined' &&
      typeof window.matchMedia === 'function' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches
    if (prefersReducedMotion) {
      animatedStateRef.current = target
      setAnimatedState(target)
      return
    }
    const from = current
    let raf = 0
    const durationMs = 420
    const startedAt = performance.now()
    const easeOutCubic = (value: number) => 1 - ((1 - value) ** 3)
    const step = (now: number) => {
      const progress = Math.min(1, (now - startedAt) / durationMs)
      const eased = easeOutCubic(progress)
      const next = {
        baseline: from.baseline + (target.baseline - from.baseline) * eased,
        recent: from.recent + (target.recent - from.recent) * eased,
        max: from.max + (target.max - from.max) * eased,
      }
      animatedStateRef.current = next
      setAnimatedState(next)
      if (progress < 1) {
        raf = window.requestAnimationFrame(step)
      }
    }
    raf = window.requestAnimationFrame(step)
    return () => {
      window.cancelAnimationFrame(raf)
    }
  }, [baselineTarget, recentTarget, scaledMaxTarget])

  if (!comparisonBars.length) {
    return <div className={dashboardTileStyles.emptyChart}>{emptyLabel}</div>
  }

  const animatedMax = Math.max(1, animatedState.max)

  return (
    <div className="flex h-full min-h-0 w-full flex-col">
      <div
        className={cn(
          'relative flex-1 rounded-md border border-[hsl(var(--tone-neutral-200))] bg-background px-2 pb-7 pt-4 transition-[opacity,transform,filter] duration-320 ease-out',
          chartVisible ? 'opacity-100 translate-y-0 scale-100 blur-0' : 'opacity-0 translate-y-1 scale-[0.985] blur-[0.4px]',
        )}
      >
        <div className="absolute inset-x-2 bottom-7 top-4">
          {[25, 50, 75].map((pct) => (
            <div
              key={`momentum-grid-${pct}`}
              className="pointer-events-none absolute inset-x-0 border-t border-[hsl(var(--tone-neutral-200))]"
              style={{ bottom: `${pct}%` }}
              aria-hidden="true"
            />
          ))}
          <div className="absolute inset-0 flex items-end gap-1">
            {comparisonBars.map((bar, index) => {
              const animatedValue = bar.key === 'recent' ? animatedState.recent : animatedState.baseline
              const heightPct = animatedValue <= 0 ? 5 : Math.max(10, (Math.max(0, animatedValue) / animatedMax) * 100)
              const isActive = hoveredIndex === index
              const yOffset = isActive ? -1 : 0
              const toneClass = bar.recent ? 'bg-[hsl(var(--tone-positive-600))]' : 'bg-[hsl(var(--tone-accent-500))]'
              return (
                <div
                  key={bar.key}
                  className="relative flex h-full min-h-0 flex-1 items-end"
                  onMouseEnter={() => setHoveredIndex(index)}
                  onMouseLeave={() => setHoveredIndex((current) => (current === index ? null : current))}
                >
                  <span
                    className={cn(
                      'pointer-events-none absolute left-1/2 z-[2] -translate-x-1/2 whitespace-nowrap rounded-md border border-[hsl(var(--tone-neutral-300))] bg-[hsl(var(--tone-neutral-50))] px-2 py-0.5 text-[0.6rem] leading-none text-[hsl(var(--tone-neutral-700))] transition-all duration-150 ease-out',
                      isActive ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-1',
                    )}
                    style={{ bottom: `calc(${heightPct}% + 0.35rem)` }}
                    aria-hidden="true"
                  >
                    {formatInt(animatedValue)}
                  </span>
                  <span
                    className={cn(
                      'block w-full rounded-[4px] transition-[transform,filter,box-shadow] duration-220 ease-out',
                      toneClass,
                      isActive && 'brightness-[1.08] saturate-[1.14] shadow-[0_0_0_1px_hsl(var(--tone-neutral-300))]',
                    )}
                    style={{
                      height: `${heightPct}%`,
                      transform: `translateY(${yOffset}px) scaleX(${isActive ? 1.035 : 1}) scaleY(${barsExpanded ? 1 : 0})`,
                      opacity: 1,
                      transformOrigin: 'bottom',
                      transitionDelay: barsExpanded ? '0ms' : `${Math.min(220, index * 18)}ms`,
                    }}
                  />
                </div>
              )
            })}
          </div>
        </div>
        <div className="pointer-events-none absolute inset-x-2 bottom-1 grid min-h-[1.22rem] grid-flow-col auto-cols-fr items-start gap-1">
          {comparisonBars.map((bar) => (
            <div
              key={`${bar.key}-axis`}
              className={cn(
                'leading-none text-center transition-[opacity,transform] duration-220 ease-out',
                labelsVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-0.5',
              )}
            >
              <p className="whitespace-nowrap text-center text-[0.6rem] font-semibold text-[hsl(var(--tone-neutral-600))]">
                {bar.label}
              </p>
              <p
                className="mt-[1px] text-[0.54rem] font-semibold uppercase tracking-[0.05em] text-transparent"
                aria-hidden="true"
              >
                ytd
              </p>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

function parseNumericKeyedMap(value: unknown): Record<number, number> {
  if (!value || typeof value !== 'object') {
    return {}
  }
  const output: Record<number, number> = {}
  for (const [key, raw] of Object.entries(value as Record<string, unknown>)) {
    const numericKey = Number(key)
    const numericValue = Number(raw)
    if (!Number.isFinite(numericKey) || !Number.isFinite(numericValue)) {
      continue
    }
    output[Math.round(numericKey)] = numericValue
  }
  return output
}

function FieldPercentilePanel({
  tile,
  threshold,
}: {
  tile: PublicationMetricTilePayload
  threshold: FieldPercentileThreshold
}) {
  const [chartVisible, setChartVisible] = useState(true)
  const [barsExpanded, setBarsExpanded] = useState(false)
  const [labelsVisible, setLabelsVisible] = useState(true)
  const [hovered, setHovered] = useState(false)
  const chartData = (tile.chart_data || {}) as Record<string, unknown>
  const shareMap = parseNumericKeyedMap(chartData.share_by_threshold_pct)
  const countMap = parseNumericKeyedMap(chartData.count_by_threshold)
  const evaluatedPapersRaw = Number(chartData.evaluated_papers)
  const evaluatedPapers = Number.isFinite(evaluatedPapersRaw)
    ? Math.max(0, Math.round(evaluatedPapersRaw))
    : 0
  const shareAboveRaw = shareMap[threshold]
  const shareAbove = Number.isFinite(shareAboveRaw)
    ? Math.max(0, Math.min(100, Number(shareAboveRaw)))
    : evaluatedPapers > 0
      ? (Math.max(0, Number(countMap[threshold] || 0)) / evaluatedPapers) * 100
      : 0
  const countAboveRaw = countMap[threshold]
  const countAbove = Number.isFinite(countAboveRaw)
    ? Math.max(0, Math.round(Number(countAboveRaw)))
    : Math.round((shareAbove / 100) * evaluatedPapers)
  const barLabel = `>= ${threshold}th`
  const heightPct = Math.max(0, Math.min(100, shareAbove))
  const animationKey = useMemo(
    () => `${threshold}-${shareAbove.toFixed(2)}-${evaluatedPapers}`,
    [evaluatedPapers, shareAbove, threshold],
  )
  useEffect(() => {
    setChartVisible(false)
    setBarsExpanded(false)
    setLabelsVisible(false)
    let rafOne = 0
    let rafTwo = 0
    let timeoutId: number | undefined
    rafOne = window.requestAnimationFrame(() => {
      setChartVisible(true)
      rafTwo = window.requestAnimationFrame(() => {
        setBarsExpanded(true)
        timeoutId = window.setTimeout(() => {
          setLabelsVisible(true)
        }, 120)
      })
    })
    return () => {
      window.cancelAnimationFrame(rafOne)
      window.cancelAnimationFrame(rafTwo)
      if (timeoutId !== undefined) {
        window.clearTimeout(timeoutId)
      }
    }
  }, [animationKey])

  if (evaluatedPapers <= 0) {
    return <div className={dashboardTileStyles.emptyChart}>No field percentile data</div>
  }

  return (
    <div className="flex h-full min-h-0 w-full flex-col">
      <div
        className={cn(
          'relative flex-1 rounded-md border border-[hsl(var(--tone-neutral-200))] bg-background px-2 pb-7 pt-4 transition-[opacity,transform,filter] duration-320 ease-out',
          chartVisible ? 'opacity-100 translate-y-0 scale-100 blur-0' : 'opacity-0 translate-y-1 scale-[0.985] blur-[0.4px]',
        )}
      >
        <div className="absolute inset-x-2 bottom-7 top-4">
          {[25, 50, 75].map((pct) => (
            <div
              key={`field-percentile-grid-${pct}`}
              className="pointer-events-none absolute inset-x-0 border-t border-[hsl(var(--tone-neutral-200))]"
              style={{ bottom: `${pct}%` }}
              aria-hidden="true"
            />
          ))}
          <div className="absolute inset-0 flex items-end justify-center">
            <div
              className="relative flex h-full min-h-0 w-[44%] items-end"
              onMouseEnter={() => setHovered(true)}
              onMouseLeave={() => setHovered(false)}
            >
              <span
                className={cn(
                  'pointer-events-none absolute left-1/2 z-[2] -translate-x-1/2 whitespace-nowrap rounded-md border border-[hsl(var(--tone-neutral-300))] bg-[hsl(var(--tone-neutral-50))] px-2 py-0.5 text-[0.6rem] leading-none text-[hsl(var(--tone-neutral-700))] transition-all duration-150 ease-out',
                  hovered ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-1',
                )}
                style={{ bottom: `calc(${heightPct}% + 0.35rem)` }}
                aria-hidden="true"
              >
                {Math.round(shareAbove)}% ({formatInt(countAbove)} papers)
              </span>
              <span
                className={cn(
                  'block w-full rounded-[4px] bg-[hsl(var(--tone-positive-600))] transition-[transform,filter,box-shadow] duration-220 ease-out',
                  hovered && 'brightness-[1.08] saturate-[1.14] shadow-[0_0_0_1px_hsl(var(--tone-neutral-300))]',
                )}
                style={{
                  height: `${heightPct}%`,
                  transform: `translateY(${hovered ? '-1px' : '0px'}) scaleX(${hovered ? 1.03 : 1}) scaleY(${barsExpanded ? 1 : 0})`,
                  transformOrigin: 'bottom',
                }}
              />
            </div>
          </div>
        </div>
        <div className="pointer-events-none absolute inset-x-2 bottom-1 min-h-[1.22rem]">
          <div
            className={cn(
              'leading-none text-center transition-[opacity,transform] duration-220 ease-out',
              labelsVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-0.5',
            )}
          >
            <p className="whitespace-nowrap text-center text-[0.6rem] font-semibold text-[hsl(var(--tone-neutral-600))]">
              {barLabel}
            </p>
            <p
              className="mt-[1px] text-[0.54rem] font-semibold uppercase tracking-[0.05em] text-transparent"
              aria-hidden="true"
            >
              ytd
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}

function AuthorshipStructurePanel({ tile }: { tile: PublicationMetricTilePayload }) {
  const [panelVisible, setPanelVisible] = useState(true)
  const [barsExpanded, setBarsExpanded] = useState(false)
  const chartData = (tile.chart_data || {}) as Record<string, unknown>
  const firstAuthorshipRaw = Number(chartData.first_authorship_pct)
  const seniorAuthorshipRaw = Number(chartData.senior_authorship_pct)
  const leadershipIndexRaw = Number(chartData.leadership_index_pct)
  const firstAuthorshipPct = Number.isFinite(firstAuthorshipRaw)
    ? Math.max(0, Math.min(100, firstAuthorshipRaw))
    : 0
  const seniorAuthorshipPct = Number.isFinite(seniorAuthorshipRaw)
    ? Math.max(0, Math.min(100, seniorAuthorshipRaw))
    : 0
  const leadershipIndexPct = Number.isFinite(leadershipIndexRaw)
    ? Math.max(0, Math.min(100, leadershipIndexRaw))
    : 0
  const medianAuthorPositionDisplay = String(chartData.median_author_position_display || '').trim()
  const medianAuthorPositionRaw = Number(chartData.median_author_position)
  const medianAuthorPosition = medianAuthorPositionDisplay
    || (Number.isFinite(medianAuthorPositionRaw) ? String(medianAuthorPositionRaw) : 'Not available')
  const totalPapersRaw = Number(chartData.total_papers)
  const totalPapers = Number.isFinite(totalPapersRaw) ? Math.max(0, Math.round(totalPapersRaw)) : 0
  const animationKey = useMemo(
    () => `${Math.round(firstAuthorshipPct)}-${Math.round(seniorAuthorshipPct)}-${Math.round(leadershipIndexPct)}-${medianAuthorPosition}-${totalPapers}`,
    [firstAuthorshipPct, leadershipIndexPct, medianAuthorPosition, seniorAuthorshipPct, totalPapers],
  )
  useEffect(() => {
    setPanelVisible(false)
    setBarsExpanded(false)
    let rafOne = 0
    let rafTwo = 0
    rafOne = window.requestAnimationFrame(() => {
      setPanelVisible(true)
      rafTwo = window.requestAnimationFrame(() => {
        setBarsExpanded(true)
      })
    })
    return () => {
      window.cancelAnimationFrame(rafOne)
      window.cancelAnimationFrame(rafTwo)
    }
  }, [animationKey])

  if (totalPapers <= 0) {
    return <div className={dashboardTileStyles.emptyChart}>No authorship data</div>
  }

  const rows = [
    { key: 'first', label: 'First authorship', value: Math.round(firstAuthorshipPct), tone: 'bg-[hsl(var(--tone-accent-500))]' },
    { key: 'senior', label: 'Senior authorship', value: Math.round(seniorAuthorshipPct), tone: 'bg-[hsl(var(--tone-warning-500))]' },
    { key: 'leadership', label: 'Leadership index', value: Math.round(leadershipIndexPct), tone: 'bg-[hsl(var(--tone-positive-600))]' },
  ]

  return (
    <div className="flex h-full min-h-0 w-full flex-col">
      <div
        className={cn(
          'flex flex-1 flex-col gap-2 rounded-md border border-[hsl(var(--tone-neutral-200))] bg-background px-2 py-2 transition-[opacity,transform,filter] duration-320 ease-out',
          panelVisible ? 'opacity-100 translate-y-0 scale-100 blur-0' : 'opacity-0 translate-y-1 scale-[0.985] blur-[0.4px]',
        )}
      >
        {rows.map((row, index) => (
          <div key={row.key} className="space-y-1">
            <div className="flex items-center justify-between gap-2 text-[0.61rem] leading-none">
              <span className="font-semibold text-[hsl(var(--tone-neutral-700))]">{row.label}</span>
              <span className="font-semibold text-[hsl(var(--tone-neutral-700))]">{row.value}%</span>
            </div>
            <div className="h-1.5 overflow-hidden rounded-full bg-[hsl(var(--tone-neutral-200))]">
              <div
                className={cn(
                  'h-full rounded-full transition-[width] duration-420 ease-out',
                  row.tone,
                )}
                style={{
                  width: `${barsExpanded ? row.value : 0}%`,
                  transitionDelay: `${Math.min(180, index * 40)}ms`,
                }}
                aria-hidden="true"
              />
            </div>
          </div>
        ))}
        <div className="mt-auto flex items-center justify-between rounded border border-[hsl(var(--tone-neutral-200))] bg-[hsl(var(--tone-neutral-50))] px-2 py-1">
          <span className="text-[0.6rem] font-semibold text-[hsl(var(--tone-neutral-700))]">Median author position</span>
          <span className="text-[0.66rem] font-semibold text-[hsl(var(--tone-neutral-800))]">{medianAuthorPosition}</span>
        </div>
      </div>
    </div>
  )
}

function HIndexNeedsChart({ tile }: { tile: PublicationMetricTilePayload }) {
  const [chartVisible, setChartVisible] = useState(true)
  const [barsExpanded, setBarsExpanded] = useState(false)
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null)
  const chartData = (tile.chart_data || {}) as Record<string, unknown>
  const candidateGaps = toNumberArray(chartData.candidate_gaps)
    .map((item) => Math.max(0, Math.round(item)))
  const bars = [
    {
      key: 'need-1',
      label: '+1',
      needed: 1,
      count: candidateGaps.filter((gap) => gap === 1).length,
    },
    {
      key: 'need-2',
      label: '+2',
      needed: 2,
      count: candidateGaps.filter((gap) => gap === 2).length,
    },
    {
      key: 'need-3',
      label: '+3',
      needed: 3,
      count: candidateGaps.filter((gap) => gap === 3).length,
    },
    {
      key: 'need-4',
      label: '+4',
      needed: 4,
      count: candidateGaps.filter((gap) => gap === 4).length,
    },
    {
      key: 'need-5-plus',
      label: '+5+',
      needed: 5,
      count: candidateGaps.filter((gap) => gap >= 5).length,
    },
  ].filter((bar) => bar.count > 0)
  const animationKey = useMemo(
    () => bars.map((bar) => `${bar.key}-${bar.count}`).join('|'),
    [bars],
  )
  useEffect(() => {
    setChartVisible(false)
    setBarsExpanded(false)
    let rafOne = 0
    let rafTwo = 0
    rafOne = window.requestAnimationFrame(() => {
      setChartVisible(true)
      rafTwo = window.requestAnimationFrame(() => {
        setBarsExpanded(true)
      })
    })
    return () => {
      window.cancelAnimationFrame(rafOne)
      window.cancelAnimationFrame(rafTwo)
    }
  }, [animationKey])

  if (!bars.length) {
    return <div className={dashboardTileStyles.emptyChart}>No citations-needed data</div>
  }

  const maxCount = Math.max(1, ...bars.map((bar) => bar.count))
  const scaledMax = maxCount * 1.18

  return (
    <div className="flex h-full min-h-0 w-full flex-col">
      <div
        className={cn(
          'relative flex-1 rounded-md border border-[hsl(var(--tone-neutral-200))] bg-background px-2 pb-8 pt-4 transition-[opacity,transform,filter] duration-320 ease-out',
          chartVisible ? 'opacity-100 translate-y-0 scale-100 blur-0' : 'opacity-0 translate-y-1 scale-[0.985] blur-[0.4px]',
        )}
      >
        <div className="absolute inset-x-2 bottom-8 top-4">
          {[25, 50, 75].map((pct) => (
            <div
              key={`h-needed-grid-${pct}`}
              className="pointer-events-none absolute inset-x-0 border-t border-[hsl(var(--tone-neutral-200))]"
              style={{ bottom: `${pct}%` }}
              aria-hidden="true"
            />
          ))}
          <div className="absolute inset-0 flex items-end gap-1">
            {bars.map((bar, index) => {
              const heightPct = bar.count <= 0 ? 3 : Math.max(6, (Math.max(0, bar.count) / scaledMax) * 100)
              const isActive = hoveredIndex === index
              const toneClass = bar.needed <= 1
                ? 'bg-[hsl(var(--tone-positive-600))]'
                : bar.needed <= 3
                  ? 'bg-[hsl(var(--tone-accent-500))]'
                  : 'bg-[hsl(var(--tone-warning-500))]'
              return (
                <div
                  key={bar.key}
                  className="relative flex h-full min-h-0 flex-1 items-end"
                  onMouseEnter={() => setHoveredIndex(index)}
                  onMouseLeave={() => setHoveredIndex((current) => (current === index ? null : current))}
                >
                  <span
                    className={cn(
                      'pointer-events-none absolute left-1/2 z-[2] -translate-x-1/2 whitespace-nowrap rounded-md border border-[hsl(var(--tone-neutral-300))] bg-[hsl(var(--tone-neutral-50))] px-2 py-0.5 text-[0.6rem] leading-none text-[hsl(var(--tone-neutral-700))] transition-all duration-150 ease-out',
                      isActive ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-1',
                    )}
                    style={{ bottom: `calc(${heightPct}% + 0.35rem)` }}
                    aria-hidden="true"
                  >
                    {formatInt(bar.count)} {bar.count === 1 ? 'paper' : 'papers'}
                  </span>
                  <span
                    className={cn(
                      'block w-full rounded-[4px] transition-[transform,filter,box-shadow] duration-220 ease-out',
                      toneClass,
                      isActive && 'brightness-[1.08] saturate-[1.14] shadow-[0_0_0_1px_hsl(var(--tone-neutral-300))]',
                    )}
                    style={{
                      height: `${heightPct}%`,
                      transform: `translateY(${isActive ? '-1px' : '0px'}) scaleX(${isActive ? 1.035 : 1}) scaleY(${barsExpanded ? 1 : 0})`,
                      transformOrigin: 'bottom',
                      transitionDelay: `${Math.min(220, index * 18)}ms`,
                    }}
                  />
                </div>
              )
            })}
          </div>
        </div>
        <div className="pointer-events-none absolute inset-x-2 bottom-2 grid grid-flow-col auto-cols-fr items-start gap-1">
          {bars.map((bar, index) => (
            <div key={`${bar.key}-${index}-axis`} className="text-center leading-none">
              <p className="text-[0.6rem] font-semibold text-[hsl(var(--tone-neutral-600))]">{bar.label}</p>
              <p
                className="mt-[1px] text-[0.54rem] font-semibold uppercase tracking-[0.05em] text-transparent"
                aria-hidden="true"
              >
                ytd
              </p>
            </div>
          ))}
        </div>
        <div className="pointer-events-none absolute inset-x-2 bottom-0.5 text-center">
          <p className="text-[0.6rem] font-semibold leading-none text-[hsl(var(--tone-neutral-600))]">
            Citations needed
          </p>
        </div>
      </div>
    </div>
  )
}

function HIndexTrajectoryPanel({
  tile,
  mode,
}: {
  tile: PublicationMetricTilePayload
  mode: HIndexViewMode
}) {
  if (mode === 'needed') {
    return <HIndexNeedsChart tile={tile} />
  }
  return <HIndexYearChart tile={tile} showCaption={false} />
}

function HIndexProgressInline({ tile }: { tile: PublicationMetricTilePayload }) {
  const progressMeta = buildHIndexProgressMeta(tile)
  return (
    <div className="w-full max-w-[11.7rem] space-y-1">
      <div className="flex items-center gap-2">
        <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-[hsl(var(--tone-neutral-200))]">
          <div
            className="h-full rounded-full bg-[hsl(var(--tone-positive-600))] transition-[width] duration-500 ease-out"
            style={{ width: `${progressMeta.progressPct}%` }}
            aria-hidden="true"
          />
        </div>
        <span className="text-[0.56rem] font-medium leading-none text-[hsl(var(--tone-neutral-600))]">
          {Math.round(progressMeta.progressPct)}%
        </span>
      </div>
    </div>
  )
}

function HIndexViewToggle({
  mode,
  onModeChange,
}: {
  mode: HIndexViewMode
  onModeChange: (mode: HIndexViewMode) => void
}) {
  return (
    <div className="flex items-center">
      <div
        className="relative isolate inline-grid grid-cols-2 items-center overflow-hidden rounded-full border border-[hsl(var(--tone-neutral-200))] bg-[hsl(var(--tone-neutral-50))] p-0.5"
        data-stop-tile-open="true"
      >
        <span
          className={cn(
            'pointer-events-none absolute inset-y-0.5 z-0 w-[calc(50%-0.125rem)] rounded-full bg-[hsl(var(--tone-neutral-900))] shadow-[0_1px_2px_hsl(var(--tone-neutral-900)/0.28)] transition-[left] duration-320 ease-out',
          )}
          style={{ left: mode === 'needed' ? 'calc(50% + 1px)' : '2px', willChange: 'left' }}
          aria-hidden="true"
        />
        <button
          type="button"
          data-stop-tile-open="true"
          className={cn(
            'relative z-[1] rounded-full px-2 py-[0.38rem] text-[0.62rem] font-medium leading-none transition-[color,transform] duration-250 ease-out active:scale-[0.98]',
            mode === 'trajectory' ? 'text-white' : 'text-[hsl(var(--tone-neutral-600))] hover:text-[hsl(var(--tone-neutral-800))]',
          )}
          onClick={(event) => {
            event.stopPropagation()
            onModeChange('trajectory')
          }}
          onMouseDown={(event) => event.stopPropagation()}
          aria-pressed={mode === 'trajectory'}
        >
          Trend
        </button>
        <button
          type="button"
          data-stop-tile-open="true"
          className={cn(
            'relative z-[1] rounded-full px-2 py-[0.38rem] text-[0.62rem] font-medium leading-none transition-[color,transform] duration-250 ease-out active:scale-[0.98]',
            mode === 'needed' ? 'text-white' : 'text-[hsl(var(--tone-neutral-600))] hover:text-[hsl(var(--tone-neutral-800))]',
          )}
          onClick={(event) => {
            event.stopPropagation()
            onModeChange('needed')
          }}
          onMouseDown={(event) => event.stopPropagation()}
          aria-pressed={mode === 'needed'}
        >
          Needed
        </button>
      </div>
    </div>
  )
}

function InfluentialTrendPanel({ tile }: { tile: PublicationMetricTilePayload }) {
  const chartData = (tile.chart_data || {}) as Record<string, unknown>
  const primarySeries = toNumberArray(chartData.values).map((item) => Math.max(0, item))
  const fallbackSeries = toNumberArray(tile.sparkline || []).map((item) => Math.max(0, item))
  const sourceValues = primarySeries.length ? primarySeries : fallbackSeries
  const values = useMemo(() => {
    if (!sourceValues.length) {
      return []
    }
    const cumulative: number[] = []
    let running = 0
    sourceValues.forEach((item) => {
      running = Math.max(running, Math.max(0, item))
      cumulative.push(running)
    })
    return cumulative
  }, [sourceValues])
  const labels = normalizeSeriesLabels(
    chartData.window_labels || chartData.labels || chartData.years,
    values.length,
    'W',
  )
  if (!values.length) {
    return <div className={dashboardTileStyles.emptyChart}>No influential citation trend</div>
  }
  const width = 220
  const height = 92
  const points = buildLinePoints(values, width, height, labels, 8)
  const baselineY = height - 8
  const areaOffsetY = 0.7
  const areaPoints = points.map((point) => ({
    x: point.x,
    y: Math.min(baselineY, point.y + areaOffsetY),
  }))
  const path = monotonePathFromPoints(points)
  const areaCurve = monotonePathFromPoints(areaPoints)
  const areaPath = areaPoints.length
    ? `${areaCurve} L ${areaPoints[areaPoints.length - 1].x} ${baselineY} L ${areaPoints[0].x} ${baselineY} Z`
    : ''

  return (
    <div className="flex h-full min-h-0 w-full flex-col">
      <div className="relative flex-1 rounded-md border border-[hsl(var(--tone-neutral-200))] bg-background px-2 pb-2 pt-2.5">
        <div className="relative h-full w-full">
          <svg viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none" className="h-full w-full">
            <path d={areaPath} className="fill-[hsl(var(--tone-accent-100))]" fillOpacity={0.68} />
            <path
              d={path}
              fill="none"
              className="stroke-[hsl(var(--tone-accent-700))]"
              strokeWidth="3.25"
              strokeLinecap="round"
              strokeLinejoin="round"
              shapeRendering="geometricPrecision"
            />
          </svg>
        </div>
      </div>
    </div>
  )
}

function MiniBars({
  values,
  className = '',
  highlightFrom = -1,
}: {
  values: number[]
  className?: string
  highlightFrom?: number
}) {
  if (!values.length) {
    return <div className="h-8 rounded border border-[hsl(var(--tone-accent-200))] bg-[hsl(var(--tone-accent-50))]" />
  }
  const max = Math.max(1, ...values)
  return (
    <div className={cn('flex h-8 items-end gap-1', className)}>
      {values.map((value, index) => {
        const height = Math.max(12, Math.round((Math.max(0, value) / max) * 30))
        const highlighted = highlightFrom >= 0 && index >= highlightFrom
        return (
          <div
            key={`${index}-${value}`}
            className={cn('w-full rounded-sm bg-[hsl(var(--tone-accent-400))]', highlighted && 'bg-[hsl(var(--tone-positive-600))]')}
            style={{ height }}
          />
        )
      })}
    </div>
  )
}

function MiniPairedBars({
  values,
}: {
  values: number[]
}) {
  const safe = values.slice(0, 2)
  if (safe.length < 2) {
    return <div className="h-8 rounded border border-[hsl(var(--tone-accent-200))] bg-[hsl(var(--tone-accent-50))]" />
  }
  const max = Math.max(1, ...safe)
  return (
    <div className="flex h-8 items-end gap-2">
      {safe.map((value, index) => (
        <div key={`${index}-${value}`} className="flex w-full flex-col items-center gap-1">
          <div
            className={cn('w-full rounded-sm', index === 0 ? 'bg-[hsl(var(--tone-accent-700))]' : 'bg-[hsl(var(--tone-accent-400))]')}
            style={{ height: `${Math.max(12, Math.round((Math.max(0, value) / max) * 30))}px` }}
          />
        </div>
      ))}
    </div>
  )
}

function MiniProgressRing({
  progress,
}: {
  progress: number
}) {
  const pct = Math.max(0, Math.min(100, Number.isFinite(progress) ? progress : 0))
  const radius = 12
  const circumference = 2 * Math.PI * radius
  const offset = circumference - (pct / 100) * circumference
  return (
    <svg viewBox="0 0 36 36" className="h-8 w-8">
      <circle cx="18" cy="18" r={radius} fill="none" stroke="hsl(var(--tone-accent-200))" strokeWidth="4" />
      <circle
        cx="18"
        cy="18"
        r={radius}
        fill="none"
        stroke="hsl(var(--tone-accent-700))"
        strokeWidth="4"
        strokeDasharray={circumference}
        strokeDashoffset={offset}
        strokeLinecap="round"
        transform="rotate(-90 18 18)"
      />
    </svg>
  )
}

function MiniDonut({
  values,
}: {
  values: number[]
}) {
  const safe = values.slice(0, 2).map((item) => Math.max(0, item))
  const total = safe.reduce((sum, item) => sum + item, 0)
  if (total <= 0) {
    return <div className="h-8 w-8 rounded-full border border-[hsl(var(--tone-accent-200))] bg-[hsl(var(--tone-accent-50))]" />
  }
  const pct = safe[0] / total
  const angle = pct * 360
  const gradient = `conic-gradient(hsl(var(--tone-accent-700)) 0deg ${angle}deg, hsl(var(--tone-positive-400)) ${angle}deg 360deg)`
  return (
    <div className="h-8 w-8 rounded-full" style={{ background: gradient }}>
      <div className="relative left-sz-7 top-sz-7 h-sz-18 w-sz-18 rounded-full bg-card" />
    </div>
  )
}

function MiniLine({
  values,
  overlay = [],
  colorCode = 'hsl(var(--tone-accent-700))',
}: {
  values: number[]
  overlay?: number[]
  colorCode?: string
}) {
  if (!values.length) {
    return <div className="h-8 rounded border border-[hsl(var(--tone-accent-200))] bg-[hsl(var(--tone-accent-50))]" />
  }
  const max = Math.max(...values, ...(overlay.length ? overlay : [0]))
  const min = Math.min(...values, ...(overlay.length ? overlay : [0]))
  const range = Math.max(1e-6, max - min)
  const points = values
    .map((value, index) => {
      const x = (index / Math.max(1, values.length - 1)) * 100
      const y = 100 - ((value - min) / range) * 100
      return `${x},${y}`
    })
    .join(' ')
  const overlayPoints = overlay.length
    ? overlay
        .map((value, index) => {
          const x = (index / Math.max(1, overlay.length - 1)) * 100
          const y = 100 - ((value - min) / range) * 100
          return `${x},${y}`
        })
        .join(' ')
    : ''
  return (
    <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="h-8 w-full">
      {overlayPoints ? (
        <polyline
          fill="none"
          stroke="hsl(var(--tone-accent-400))"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          points={overlayPoints}
        />
      ) : null}
      <polyline
        fill="none"
        stroke={colorCode}
        strokeWidth="3"
        strokeLinecap="round"
        strokeLinejoin="round"
        points={points}
      />
    </svg>
  )
}

function MiniChart({ tile }: { tile: PublicationMetricTilePayload }) {
  const chartType = String(tile.chart_type || '').trim().toLowerCase()
  const chartData = (tile.chart_data || {}) as Record<string, unknown>
  if (chartType === 'bar_year_5') {
    const values = toNumberArray(chartData.values)
    return <MiniBars values={values} />
  }
  if (chartType === 'paired_bar') {
    const values = toNumberArray(chartData.values)
    return <MiniPairedBars values={values} />
  }
  if (chartType === 'gauge') {
    const monthly = toNumberArray(chartData.monthly_values_12m).map((item) => Math.max(0, item))
    const fallback = toNumberArray(tile.sparkline || []).map((item) => Math.max(0, item))
    const trendValues = monthly.length ? monthly : fallback
    return (
      <MiniLine
        values={trendValues}
        colorCode={tile.delta_color_code || 'hsl(var(--tone-accent-700))'}
      />
    )
  }
  if (chartType === 'progress_ring') {
    const progress = Number(chartData.progress_to_next_pct ?? 0)
    return <MiniProgressRing progress={progress} />
  }
  if (chartType === 'donut') {
    const values = toNumberArray(chartData.values)
    return <MiniDonut values={values} />
  }
  if (chartType === 'bar_month_12') {
    const values = toNumberArray(chartData.values)
    return <MiniBars values={values} />
  }
  return (
    <MiniLine
      values={tile.sparkline || []}
      overlay={tile.sparkline_overlay || []}
      colorCode={tile.delta_color_code || 'hsl(var(--tone-accent-700))'}
    />
  )
}

function metricSummary(tile: PublicationMetricTilePayload, publication: Record<string, unknown>): string {
  const key = tile.key
  if (key === 'total_citations' || key === 'h_index_projection') {
    return `Citations: ${Number(publication.citations_lifetime || 0)}`
  }
  if (key === 'this_year_vs_last') {
    const year = Number(publication.year || 0)
    const yearLabel = Number.isFinite(year) && year > 0 ? String(year) : 'n/a'
    return `Publication year: ${yearLabel}`
  }
  if (key === 'momentum') {
    return `Momentum contribution: ${Number(publication.momentum_contribution || 0).toFixed(2)}`
  }
  if (key === 'impact_concentration') {
    return `Share of total: ${Number(publication.share_of_total_pct || 0).toFixed(2)}%`
  }
  if (key === 'influential_citations') {
    return `Influential citations: ${Number(publication.influential_citations || 0)}`
  }
  if (key === 'field_percentile_share') {
    const rank = Number(publication.field_percentile_rank || 0)
    const fieldName = String(publication.field_name || 'Unknown field')
    return `Percentile rank: ${rank.toFixed(1)}th (${fieldName})`
  }
  if (key === 'authorship_composition') {
    const role = String(publication.user_author_role || 'unknown')
    const positionRaw = Number(publication.user_author_position)
    const authorCountRaw = Number(publication.author_count)
    const positionText = Number.isFinite(positionRaw) && positionRaw > 0
      ? `${Math.round(positionRaw)}`
      : 'n/a'
    const authorCountText = Number.isFinite(authorCountRaw) && authorCountRaw > 0
      ? `${Math.round(authorCountRaw)}`
      : 'n/a'
    return `Role: ${role} | Position: ${positionText}/${authorCountText}`
  }
  if (key === 'field_normalized_impact') {
    return `Field-normalized impact: ${Number(publication.field_normalized_impact || 0).toFixed(3)}`
  }
  return ''
}

export function PublicationsTopStrip({
  metrics,
  loading = false,
  token = null,
  fetchMetricDetail = fetchPublicationMetricDetail,
}: PublicationsTopStripProps) {
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [activeTileKey, setActiveTileKey] = useState<string>('')
  const [activeTileDetail, setActiveTileDetail] = useState<PublicationMetricTilePayload | null>(null)
  const [detailLoading, setDetailLoading] = useState(false)
  const [detailError, setDetailError] = useState('')
  const [momentumWindowMode, setMomentumWindowMode] = useState<MomentumWindowMode>('12m')
  const [hIndexViewMode, setHIndexViewMode] = useState<HIndexViewMode>('trajectory')
  const [fieldPercentileThreshold, setFieldPercentileThreshold] = useState<FieldPercentileThreshold>(75)
  const [insightsVisible, setInsightsVisible] = useState(
    () => readAccountSettings().publicationInsightsDefaultVisibility !== 'hidden',
  )

  const tiles = useMemo(() => {
    const source = metrics?.tiles ?? []
    const pinnedOrder: Record<string, number> = {
      this_year_vs_last: 0,
      total_citations: 1,
    }
    return source
      .map((tile, index) => ({ tile, index }))
      .sort((left, right) => {
        const leftRank = pinnedOrder[left.tile.key]
        const rightRank = pinnedOrder[right.tile.key]
        const leftSort = Number.isFinite(leftRank) ? Number(leftRank) : 10_000 + left.index
        const rightSort = Number.isFinite(rightRank) ? Number(rightRank) : 10_000 + right.index
        return leftSort - rightSort
      })
      .map((item) => item.tile)
  }, [metrics?.tiles])
  const selectedTile = useMemo(
    () => tiles.find((tile) => tile.key === activeTileKey) || null,
    [activeTileKey, tiles],
  )
  const totalCitationsTile = useMemo(
    () => tiles.find((tile) => tile.key === 'total_citations') || null,
    [tiles],
  )
  const momentumYearBreakdown = useMemo(
    () => buildMomentumYearBreakdown(totalCitationsTile),
    [totalCitationsTile],
  )
  const activeTile = activeTileDetail || selectedTile

  const onSelectTile = async (tile: PublicationMetricTilePayload) => {
    setActiveTileKey(tile.key)
    setActiveTileDetail(tile)
    setDetailError('')
    setDrawerOpen(true)
    if (!token) {
      return
    }
    setDetailLoading(true)
    try {
      const detail = await fetchMetricDetail(token, tile.key)
      if (detail?.tile) {
        setActiveTileDetail(detail.tile)
      }
    } catch (error) {
      setDetailError(error instanceof Error ? error.message : 'Could not load metric drilldown.')
    } finally {
      setDetailLoading(false)
    }
  }

  const shouldIgnoreTileOpen = (target: EventTarget | null): boolean => {
    if (!(target instanceof HTMLElement)) {
      return false
    }
    return Boolean(target.closest('[data-stop-tile-open="true"]'))
  }

  return (
    <>
      <Card>
        <CardContent className="space-y-2 p-3">
          <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
            <div className="flex flex-wrap items-center gap-2">
              {metrics?.is_updating ? <span className="text-amber-700">Updating...</span> : null}
              {metrics?.status === 'FAILED' ? <span className="text-amber-700">Last update failed</span> : null}
            </div>
            <button
              type="button"
              data-stop-tile-open="true"
              className={cn(
                'inline-flex items-center gap-1.5 rounded-full border px-2 py-1 text-[0.68rem] font-semibold leading-none transition-colors',
                insightsVisible
                  ? 'border-[hsl(var(--tone-positive-300))] bg-[hsl(var(--tone-positive-100))] text-[hsl(var(--tone-positive-700))]'
                  : 'border-[hsl(var(--tone-warning-300))] bg-[hsl(var(--tone-warning-100))] text-[hsl(var(--tone-warning-700))]',
              )}
              onClick={() => setInsightsVisible((current) => !current)}
              aria-pressed={insightsVisible}
              aria-label={insightsVisible ? 'Set publication insights not visible' : 'Set publication insights visible'}
            >
              {insightsVisible ? <Eye className="h-3.5 w-3.5" /> : <EyeOff className="h-3.5 w-3.5" />}
              <span>{insightsVisible ? 'Visible' : 'Not visible'}</span>
            </button>
          </div>
          <div className="rounded-sm border border-[hsl(var(--tone-neutral-200))] bg-[hsl(var(--tone-neutral-50))] px-2.5 py-1.5">
            <p className="text-[0.76rem] font-semibold uppercase tracking-[0.09em] text-[hsl(var(--tone-neutral-800))]">
              Publication insights
            </p>
          </div>

          {!insightsVisible ? (
            <div className="rounded-md border border-dashed border-[hsl(var(--tone-neutral-300))] bg-[hsl(var(--tone-neutral-50))] px-3 py-2 text-xs text-[hsl(var(--tone-neutral-600))]">
              Publication insights are hidden.
            </div>
          ) : loading && tiles.length === 0 ? (
            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3 lg:gap-3">
              {Array.from({ length: 6 }).map((_, index) => (
                <div key={index} className="h-32 rounded-md border border-[hsl(var(--tone-neutral-200))] bg-[hsl(var(--tone-neutral-50))]" />
              ))}
            </div>
          ) : (
            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3 lg:gap-3">
              {tiles.map((tile) => {
                const subtitle = String(tile.subtext || '').trim()
                const rawDeltaDisplay = String(tile.delta_display || '').trim()
                const shouldHideLegacyTrendText =
                  tile.key === 'total_citations' && /(falling|rising|stable over)/i.test(rawDeltaDisplay)
                const effectiveDeltaDisplay = shouldHideLegacyTrendText ? '' : rawDeltaDisplay
                if (tile.key === 'total_citations') {
                  return (
                    <TotalCitationsTile
                      key={tile.key}
                      tile={tile}
                      onOpen={() => {
                        void onSelectTile(tile)
                      }}
                      shouldIgnoreTileOpen={shouldIgnoreTileOpen}
                    />
                  )
                }
                const tileValueSource = tile.main_value ?? tile.value
                const tileValueNumberRaw = typeof tileValueSource === 'number' ? tileValueSource : Number.NaN
                const mainValueDisplay = tile.key === 'impact_concentration' && Number.isFinite(tileValueNumberRaw)
                  ? `${Math.round(tileValueNumberRaw)}%`
                  : tile.value_display || '\u2014'
                const momentumBreakdown = tile.key === 'momentum' ? buildMomentumBreakdown(tile) : null
                let primaryValue: ReactNode = mainValueDisplay
                let badgeNode: ReactNode | undefined
                const pinBadgeBottom = true
                let secondaryText: ReactNode = subtitle || '\u2014'
                let detailText: ReactNode | undefined = effectiveDeltaDisplay || undefined
                let visual: ReactNode = (
                  <div className="flex h-full min-h-0 items-center rounded-md border border-[hsl(var(--tone-accent-200))] bg-[hsl(var(--tone-accent-50))] p-1.5">
                    <MiniChart tile={tile} />
                  </div>
                )

                if (tile.key === 'this_year_vs_last') {
                  if (Number.isFinite(tileValueNumberRaw)) {
                    primaryValue = formatInt(Math.max(0, Math.round(tileValueNumberRaw)))
                  } else {
                    primaryValue = String(tile.value_display || mainValueDisplay || '\u2014').replace(/\s+papers?$/i, '')
                  }
                  secondaryText = 'Lifetime publications'
                  detailText = 'Last 5 years shown'
                  visual = <PublicationsPerYearChart tile={tile} showCaption={false} />
                } else if (tile.key === 'momentum') {
                  const activeLift = momentumWindowMode === '5y'
                    ? momentumYearBreakdown?.liftPct ?? null
                    : momentumBreakdown?.liftPct ?? null
                  const activeInsufficient = momentumWindowMode === '5y'
                    ? momentumYearBreakdown?.insufficientBaseline ?? true
                    : momentumBreakdown?.insufficientBaseline ?? true
                  const activeHasData = momentumWindowMode === '5y'
                    ? Boolean(momentumYearBreakdown?.bars.length)
                    : Boolean(momentumBreakdown?.bars.length)
                  primaryValue = activeLift !== null
                    ? formatSignedPercentCompact(activeLift)
                    : activeHasData && activeInsufficient
                      ? 'New'
                      : '\u2014'
                  badgeNode = (
                    <div className="flex items-center">
                      <div
                        className="relative isolate inline-grid grid-cols-2 items-center overflow-hidden rounded-full border border-[hsl(var(--tone-neutral-200))] bg-[hsl(var(--tone-neutral-50))] p-0.5"
                        data-stop-tile-open="true"
                      >
                        <span
                          className={cn(
                            'pointer-events-none absolute inset-y-0.5 z-0 w-[calc(50%-0.125rem)] rounded-full bg-[hsl(var(--tone-neutral-900))] shadow-[0_1px_2px_hsl(var(--tone-neutral-900)/0.28)] transition-[left] duration-320 ease-out',
                          )}
                          style={{ left: momentumWindowMode === '5y' ? 'calc(50% + 1px)' : '2px', willChange: 'left' }}
                          aria-hidden="true"
                        />
                        <button
                          type="button"
                          data-stop-tile-open="true"
                          className={cn(
                            'relative z-[1] rounded-full px-2.5 py-1 text-[0.68rem] font-medium leading-none transition-[color,transform] duration-250 ease-out active:scale-[0.98]',
                            momentumWindowMode === '12m'
                              ? 'text-white'
                              : 'text-[hsl(var(--tone-neutral-600))] hover:text-[hsl(var(--tone-neutral-800))]',
                          )}
                          onClick={(event) => {
                            event.stopPropagation()
                            setMomentumWindowMode('12m')
                          }}
                          onMouseDown={(event) => event.stopPropagation()}
                          aria-pressed={momentumWindowMode === '12m'}
                        >
                          12m
                        </button>
                        <button
                          type="button"
                          data-stop-tile-open="true"
                          className={cn(
                            'relative z-[1] rounded-full px-2.5 py-1 text-[0.68rem] font-medium leading-none transition-[color,transform] duration-250 ease-out active:scale-[0.98]',
                            momentumWindowMode === '5y'
                              ? 'text-white'
                              : 'text-[hsl(var(--tone-neutral-600))] hover:text-[hsl(var(--tone-neutral-800))]',
                          )}
                          onClick={(event) => {
                            event.stopPropagation()
                            setMomentumWindowMode('5y')
                          }}
                          onMouseDown={(event) => event.stopPropagation()}
                          aria-pressed={momentumWindowMode === '5y'}
                        >
                          5y
                        </button>
                      </div>
                    </div>
                  )
                  secondaryText = 'Citation pace'
                  detailText = momentumWindowMode === '5y'
                    ? 'Last 5 years (1 year vs prior 4 years)'
                    : 'Last 12 months (3 months vs prior 9 months)'
                  visual = (
                    <MomentumTilePanel
                      tile={tile}
                      mode={momentumWindowMode}
                      yearBreakdown={momentumYearBreakdown}
                    />
                  )
                } else if (tile.key === 'h_index_projection') {
                  const hIndexMeta = buildHIndexProgressMeta(tile)
                  primaryValue = Number.isFinite(hIndexMeta.currentH) ? `h ${formatInt(hIndexMeta.currentH)}` : mainValueDisplay
                  secondaryText = `Progress to h ${formatInt(hIndexMeta.targetH)}`
                  detailText = <HIndexProgressInline tile={tile} />
                  badgeNode = (
                    <HIndexViewToggle
                      mode={hIndexViewMode}
                      onModeChange={setHIndexViewMode}
                    />
                  )
                  visual = <HIndexTrajectoryPanel tile={tile} mode={hIndexViewMode} />
                } else if (tile.key === 'impact_concentration') {
                  const impactChartData = (tile.chart_data || {}) as Record<string, unknown>
                  const impactValues = toNumberArray(impactChartData.values).map((item) => Math.max(0, item))
                  const impactTop3 = impactValues[0] || 0
                  const impactRest = impactValues[1] || 0
                  const impactTotal = Math.max(0, impactTop3 + impactRest)
                  const impactTop3PctRounded = impactTotal > 0
                    ? Math.max(0, Math.min(100, Math.round((impactTop3 / impactTotal) * 100)))
                    : 0
                  const impactBadgeData = (tile.badge || {}) as Record<string, unknown>
                  const impactBadgeLabel = String(
                    impactBadgeData.label ?? impactChartData.gini_profile_label ?? '',
                  ).trim()
                  primaryValue = mainValueDisplay
                  secondaryText = `Top 3 cited papers account for ${impactTop3PctRounded}% of total citations`
                  detailText = undefined
                  if (impactBadgeLabel) {
                    badgeNode = (
                      <span className="inline-flex items-center rounded-full border border-[hsl(var(--tone-neutral-300))] bg-[hsl(var(--tone-neutral-50))] px-2.5 py-[0.2rem] text-[0.66rem] font-medium leading-none text-[hsl(var(--tone-neutral-700))]">
                        {impactBadgeLabel}
                      </span>
                    )
                  }
                  visual = <ImpactConcentrationPanel tile={tile} />
                } else if (tile.key === 'field_percentile_share') {
                  const fieldPercentileData = (tile.chart_data || {}) as Record<string, unknown>
                  const rawThresholds = toNumberArray(fieldPercentileData.thresholds)
                    .map((item) => Math.round(item))
                    .filter((item) => [50, 75, 90, 95, 99].includes(item))
                  const availableThresholds = (rawThresholds.length ? rawThresholds : [50, 75, 90, 95, 99])
                    .map((item) => item as FieldPercentileThreshold)
                  const defaultThresholdRaw = Math.round(Number(fieldPercentileData.default_threshold || 75))
                  const defaultThreshold = availableThresholds.includes(defaultThresholdRaw as FieldPercentileThreshold)
                    ? defaultThresholdRaw as FieldPercentileThreshold
                    : availableThresholds[0]
                  const activeThreshold = availableThresholds.includes(fieldPercentileThreshold)
                    ? fieldPercentileThreshold
                    : defaultThreshold
                  const activeThresholdIndex = Math.max(0, availableThresholds.indexOf(activeThreshold))
                  const shareMap = parseNumericKeyedMap(fieldPercentileData.share_by_threshold_pct)
                  const countMap = parseNumericKeyedMap(fieldPercentileData.count_by_threshold)
                  const evaluatedRaw = Number(fieldPercentileData.evaluated_papers)
                  const evaluated = Number.isFinite(evaluatedRaw) ? Math.max(0, Math.round(evaluatedRaw)) : 0
                  const shareAtThresholdRaw = shareMap[activeThreshold]
                  const shareAtThreshold = Number.isFinite(shareAtThresholdRaw)
                    ? Math.max(0, Math.min(100, Number(shareAtThresholdRaw)))
                    : evaluated > 0
                      ? (Math.max(0, Number(countMap[activeThreshold] || 0)) / evaluated) * 100
                      : 0
                  primaryValue = evaluated > 0
                    ? `${Math.round(shareAtThreshold)}%`
                    : mainValueDisplay
                  secondaryText = `Papers at or above ${activeThreshold}th percentile`
                  detailText = undefined
                  badgeNode = (
                    <div className="flex flex-col items-center gap-0.5">
                      <p className="text-center text-[0.56rem] font-semibold uppercase tracking-[0.05em] text-[hsl(var(--tone-neutral-500))]">
                        Percentile
                      </p>
                      <div
                        className="relative isolate inline-grid items-center overflow-hidden rounded-full border border-[hsl(var(--tone-neutral-200))] bg-[hsl(var(--tone-neutral-50))] p-0.5"
                        style={{ gridTemplateColumns: `repeat(${availableThresholds.length}, minmax(0, 1fr))` }}
                        data-stop-tile-open="true"
                      >
                        <span
                          className="pointer-events-none absolute inset-y-0.5 z-0 rounded-full bg-[hsl(var(--tone-neutral-900))] shadow-[0_1px_2px_hsl(var(--tone-neutral-900)/0.28)] transition-[left,width] duration-320 ease-out"
                          style={{
                            width: `calc(${100 / availableThresholds.length}% - 0.125rem)`,
                            left: `calc(${(100 / availableThresholds.length) * activeThresholdIndex}% + 2px)`,
                            willChange: 'left,width',
                          }}
                          aria-hidden="true"
                        />
                        {availableThresholds.map((threshold) => (
                          <button
                            key={`field-threshold-${threshold}`}
                            type="button"
                            data-stop-tile-open="true"
                            className={cn(
                              'relative z-[1] rounded-full px-2 py-[0.38rem] text-[0.62rem] font-medium leading-none transition-[color,transform] duration-250 ease-out active:scale-[0.98]',
                              activeThreshold === threshold
                                ? 'text-white'
                                : 'text-[hsl(var(--tone-neutral-600))] hover:text-[hsl(var(--tone-neutral-800))]',
                            )}
                            onClick={(event) => {
                              event.stopPropagation()
                              setFieldPercentileThreshold(threshold)
                            }}
                            onMouseDown={(event) => event.stopPropagation()}
                            aria-pressed={activeThreshold === threshold}
                          >
                            {threshold}
                          </button>
                        ))}
                      </div>
                    </div>
                  )
                  visual = <FieldPercentilePanel tile={tile} threshold={activeThreshold} />
                } else if (tile.key === 'authorship_composition') {
                  const authorshipChartData = (tile.chart_data || {}) as Record<string, unknown>
                  const firstAuthorshipRaw = Number(authorshipChartData.first_authorship_pct)
                  const seniorAuthorshipRaw = Number(authorshipChartData.senior_authorship_pct)
                  const leadershipRaw = Number(authorshipChartData.leadership_index_pct)
                  const totalPapersRaw = Number(authorshipChartData.total_papers)
                  const medianAuthorPositionDisplay = String(
                    authorshipChartData.median_author_position_display || authorshipChartData.median_author_position || 'Not available',
                  ).trim() || 'Not available'
                  const firstAuthorshipPct = Number.isFinite(firstAuthorshipRaw)
                    ? Math.max(0, Math.min(100, firstAuthorshipRaw))
                    : 0
                  const seniorAuthorshipPct = Number.isFinite(seniorAuthorshipRaw)
                    ? Math.max(0, Math.min(100, seniorAuthorshipRaw))
                    : 0
                  const leadershipPct = Number.isFinite(leadershipRaw)
                    ? Math.max(0, Math.min(100, leadershipRaw))
                    : Number.isFinite(tileValueNumberRaw)
                      ? Math.max(0, Math.min(100, tileValueNumberRaw))
                      : 0
                  const totalPapers = Number.isFinite(totalPapersRaw) ? Math.max(0, Math.round(totalPapersRaw)) : 0
                  primaryValue = totalPapers > 0 ? `${Math.round(leadershipPct)}%` : mainValueDisplay
                  secondaryText = 'Leadership index'
                  detailText = `First ${Math.round(firstAuthorshipPct)}% | Senior ${Math.round(seniorAuthorshipPct)}% | Median position ${medianAuthorPositionDisplay}`
                  visual = <AuthorshipStructurePanel tile={tile} />
                } else if (tile.key === 'influential_citations') {
                  const influentialChartData = (tile.chart_data || {}) as Record<string, unknown>
                  const influentialRatioRaw = Number(influentialChartData.influential_ratio_pct)
                  const influentialRatioWhole = Number.isFinite(influentialRatioRaw)
                    ? Math.max(0, Math.round(influentialRatioRaw))
                    : null
                  primaryValue = mainValueDisplay
                  secondaryText = 'Influential citations over lifetime publications'
                  detailText = influentialRatioWhole === null ? undefined : `${influentialRatioWhole}% of total citations`
                  visual = <InfluentialTrendPanel tile={tile} />
                }

                return (
                  <StructuredMetricTile
                    key={tile.key}
                    tile={tile}
                    onOpen={() => {
                      void onSelectTile(tile)
                    }}
                    shouldIgnoreTileOpen={shouldIgnoreTileOpen}
                    primaryValue={primaryValue}
                    badge={badgeNode}
                    pinBadgeBottom={pinBadgeBottom}
                    subtitle={secondaryText}
                    detail={detailText}
                    visual={visual}
                  />
                )
              })}
            </div>
          )}
          <div className="rounded-sm border border-[hsl(var(--tone-neutral-200))] bg-[hsl(var(--tone-neutral-50))] px-2 py-2">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <p className="pt-1 text-[0.7rem] font-semibold uppercase tracking-[0.09em] text-[hsl(var(--tone-neutral-700))]">
                Tools
              </p>
              <div className="flex flex-wrap items-center gap-1.5">
                <button
                  type="button"
                  data-stop-tile-open="true"
                  className="inline-flex items-center gap-1.5 rounded-md border border-[hsl(var(--tone-neutral-300))] bg-background px-2 py-1 text-[0.68rem] font-medium text-[hsl(var(--tone-neutral-700))] transition-colors hover:border-[hsl(var(--tone-accent-300))] hover:bg-[hsl(var(--tone-accent-50))] hover:text-[hsl(var(--tone-accent-800))]"
                  aria-label="Generate publication insights report"
                >
                  <FileText className="h-3.5 w-3.5" />
                  <span>Generate publication insights report</span>
                </button>
                <button
                  type="button"
                  data-stop-tile-open="true"
                  className="inline-flex items-center gap-1.5 rounded-md border border-[hsl(var(--tone-neutral-300))] bg-background px-2 py-1 text-[0.68rem] font-medium text-[hsl(var(--tone-neutral-700))] transition-colors hover:border-[hsl(var(--tone-accent-300))] hover:bg-[hsl(var(--tone-accent-50))] hover:text-[hsl(var(--tone-accent-800))]"
                  aria-label="Download"
                >
                  <Download className="h-3.5 w-3.5" />
                  <span>Download</span>
                </button>
                <button
                  type="button"
                  data-stop-tile-open="true"
                  className="inline-flex items-center gap-1.5 rounded-md border border-[hsl(var(--tone-neutral-300))] bg-background px-2 py-1 text-[0.68rem] font-medium text-[hsl(var(--tone-neutral-700))] transition-colors hover:border-[hsl(var(--tone-accent-300))] hover:bg-[hsl(var(--tone-accent-50))] hover:text-[hsl(var(--tone-accent-800))]"
                  aria-label="Share"
                >
                  <Share2 className="h-3.5 w-3.5" />
                  <span>Share</span>
                </button>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      <Sheet open={drawerOpen} onOpenChange={setDrawerOpen}>
        <SheetContent side="right" className="w-full overflow-y-auto p-4 sm:max-w-sz-560">
          {activeTile ? (
            <div className="space-y-4 pr-8">
              <div>
                <h3 className="text-lg font-semibold">{activeTile.drilldown.title}</h3>
                <p className="text-sm text-muted-foreground">{activeTile.drilldown.definition}</p>
              </div>

              <div className="rounded border border-border bg-muted/20 p-3 text-sm">
                <p className="text-xs text-muted-foreground">Formula</p>
                <p className="mt-1 font-mono text-xs">{activeTile.drilldown.formula}</p>
                <p className="mt-2 text-xs text-muted-foreground">{activeTile.drilldown.confidence_note}</p>
                <p className="mt-2 text-xs text-muted-foreground">
                  Confidence score: {(Number(activeTile.confidence_score || 0)).toFixed(2)}
                </p>
                {activeTile.drilldown.metadata?.intermediate_values ? (
                  <div className="mt-2 rounded border border-border/60 bg-background/70 p-2">
                    <p className="text-micro font-medium text-foreground">Intermediate values</p>
                    <pre className="mt-1 overflow-x-auto text-micro text-muted-foreground">
                      {JSON.stringify(activeTile.drilldown.metadata.intermediate_values, null, 2)}
                    </pre>
                  </div>
                ) : null}
              </div>

              <div className="space-y-2">
                <p className="text-sm font-medium">Underlying publications</p>
                {detailLoading ? <p className="text-xs text-muted-foreground">Loading metric detail...</p> : null}
                {detailError ? <p className="text-xs text-amber-700">{detailError}</p> : null}
                {(activeTile.drilldown.publications || []).length === 0 ? (
                  <div className="rounded border border-dashed border-border p-3 text-sm text-muted-foreground">
                    No publications contributed for this metric yet.
                  </div>
                ) : (
                  <div className="space-y-2">
                    {(activeTile.drilldown.publications || []).slice(0, 100).map((publication, index) => (
                      <div key={`${String(publication.work_id || index)}`} className="rounded border border-border px-3 py-2">
                        <p className="text-sm font-medium">{String(publication.title || 'Untitled')}</p>
                        <p className="text-xs text-muted-foreground">
                          {metricSummary(activeTile, publication)}
                        </p>
                        <p className="mt-1 text-micro text-muted-foreground">
                          Confidence {Number(publication.confidence_score || 0).toFixed(2)} ({String(publication.confidence_label || 'n/a')}) | {String(publication.match_source || 'unknown')}:{String(publication.match_method || 'unknown')}
                        </p>
                        {String(publication.doi_url || '') ? (
                          <a
                            href={String(publication.doi_url)}
                            target="_blank"
                            rel="noreferrer"
                            className="mt-1 inline-flex items-center gap-1 text-micro text-blue-700 hover:underline"
                          >
                            Open DOI
                            <ExternalLink className="h-3 w-3" />
                          </a>
                        ) : null}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          ) : (
            <div className="text-sm text-muted-foreground">Select a metric tile to inspect its drilldown.</div>
          )}
        </SheetContent>
      </Sheet>
    </>
  )
}









