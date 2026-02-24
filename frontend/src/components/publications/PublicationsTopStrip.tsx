import { useEffect, useMemo, useState } from 'react'
import { ExternalLink, Info } from 'lucide-react'

import { Card, CardContent } from '@/components/ui/card'
import { Sheet, SheetContent } from '@/components/ui/sheet'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import { fetchPublicationMetricDetail } from '@/lib/impact-api'
import { cn } from '@/lib/utils'
import type {
  PublicationMetricDetailPayload,
  PublicationMetricTilePayload,
  PublicationsTopMetricsPayload,
} from '@/types/impact'

import { dashboardTileBarTabIndex, dashboardTileStyles } from './dashboard-tile-styles'

type PublicationsTopStripProps = {
  metrics: PublicationsTopMetricsPayload | null
  loading?: boolean
  token?: string | null
  fetchMetricDetail?: (token: string, metricId: string) => Promise<PublicationMetricDetailPayload>
}

function formatRefreshedAt(value: string | null | undefined): string {
  if (!value) {
    return 'Not available'
  }
  const parsed = Date.parse(value)
  if (Number.isNaN(parsed)) {
    return 'Not available'
  }
  return new Date(parsed).toLocaleString('en-GB', {
    year: 'numeric',
    month: 'short',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  })
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

function formatSignedInt(value: number): string {
  const safe = Math.round(Number.isFinite(value) ? value : 0)
  return `${safe >= 0 ? '+' : ''}${safe.toLocaleString('en-GB')}`
}

function formatSignedPct(value: number | null): string {
  if (value === null || !Number.isFinite(value)) {
    return 'n/a'
  }
  const safe = Number(value)
  return `${safe >= 0 ? '+' : ''}${safe.toFixed(1)}%`
}

function formatSignedPercentCompact(value: number): string {
  const rounded = Math.round(value * 10) / 10
  const normalized = Math.abs(rounded) < 0.05 ? 0 : rounded
  const hasFraction = Math.abs(normalized % 1) > 0
  const formatted = hasFraction ? normalized.toFixed(1) : normalized.toFixed(0)
  return `${normalized >= 0 ? '+' : ''}${formatted}%`
}

function formatRate(value: number | null): string {
  if (value === null || !Number.isFinite(value)) {
    return 'n/a'
  }
  return `${value.toFixed(1)}/mo`
}

type MomentumBreakdown = {
  bars: Array<{ label: string; value: number }>
  recent3Total: number | null
  baseline9Total: number | null
  rate3m: number | null
  rate9m: number | null
  liftPct: number | null
  insufficientBaseline: boolean
}

function fallbackMonthLabels(count: number): string[] {
  const today = new Date()
  return Array.from({ length: count }, (_, index) => {
    const shift = count - 1 - index
    const monthDate = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth() - shift, 1))
    return monthDate.toLocaleString('en-GB', { month: 'short' })
  })
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
    recent3Total,
    baseline9Total,
    rate3m,
    rate9m,
    liftPct,
    insufficientBaseline,
  }
}

type TotalTrendMode = 'year' | 'month'

function smoothPath(values: number[], width: number, height: number, padding = 4): string {
  if (values.length === 0) {
    return ''
  }
  const max = Math.max(...values)
  const min = Math.min(...values)
  const range = Math.max(1e-6, max - min)
  const step = values.length > 1 ? (width - padding * 2) / (values.length - 1) : 0
  const points = values.map((value, index) => {
    const x = padding + index * step
    const y = height - padding - ((value - min) / range) * (height - padding * 2)
    return { x, y }
  })
  if (points.length === 1) {
    const p = points[0]
    return `M ${p.x} ${p.y}`
  }
  let d = `M ${points[0].x} ${points[0].y}`
  for (let index = 0; index < points.length - 1; index += 1) {
    const current = points[index]
    const next = points[index + 1]
    const cx = (current.x + next.x) / 2
    d += ` Q ${cx} ${current.y}, ${next.x} ${next.y}`
  }
  return d
}

function TotalCitationsMiniTrend({
  tile,
  mode,
  onModeChange,
}: {
  tile: PublicationMetricTilePayload
  mode: TotalTrendMode
  onModeChange: (next: TotalTrendMode) => void
}) {
  const chartData = (tile.chart_data || {}) as Record<string, unknown>
  const yearlyValues = toNumberArray(chartData.values).map((item) => Math.max(0, item))
  const monthlyValues = toNumberArray(chartData.monthly_values_12m).map((item) => Math.max(0, item))
  const monthModeAvailable = monthlyValues.length >= 12
  const effectiveMode: TotalTrendMode = mode === 'month' && !monthModeAvailable ? 'year' : mode
  const values = effectiveMode === 'year' ? yearlyValues : monthlyValues
  useEffect(() => {
    if (mode === 'month' && !monthModeAvailable) {
      onModeChange('year')
    }
  }, [mode, monthModeAvailable, onModeChange])
  if (!values.length) {
    return <div className="h-12 rounded bg-muted/60" />
  }

  const width = 180
  const height = 44
  const path = smoothPath(values, width, height)

  return (
    <div className="space-y-1.5">
      <div className="flex items-center gap-1 text-[10px]">
        <button
          type="button"
          data-stop-tile-open="true"
          onClick={(event) => {
            event.stopPropagation()
            onModeChange('year')
          }}
          onMouseDown={(event) => event.stopPropagation()}
          className={cn(
            'rounded border px-1.5 py-0.5',
            mode === 'year' ? 'border-slate-700 bg-slate-700 text-white' : 'border-slate-300 text-slate-600',
          )}
        >
          5y
        </button>
        <button
          type="button"
          data-stop-tile-open="true"
          disabled={!monthModeAvailable}
          onClick={(event) => {
            event.stopPropagation()
            if (!monthModeAvailable) {
              return
            }
            onModeChange('month')
          }}
          onMouseDown={(event) => event.stopPropagation()}
          className={cn(
            'rounded border px-1.5 py-0.5',
            !monthModeAvailable
              ? 'cursor-not-allowed border-slate-200 text-slate-400'
              : mode === 'month'
                ? 'border-slate-700 bg-slate-700 text-white'
                : 'border-slate-300 text-slate-600',
          )}
          title={!monthModeAvailable ? '12-month curve will appear after metrics refresh completes.' : undefined}
        >
          12m
        </button>
      </div>
      <svg viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none" className="h-12 w-full">
        <path
          d={path}
          fill="none"
          stroke="#0f172a"
          strokeWidth="2.25"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </div>
  )
}

function TotalCitationsGrowthChart({ tile }: { tile: PublicationMetricTilePayload }) {
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null)
  const chartData = (tile.chart_data || {}) as Record<string, unknown>
  const years = toNumberArray(chartData.years).map((item) => Math.round(item))
  const values = toNumberArray(chartData.values).map((item) => Math.max(0, item))
  if (!years.length || !values.length || years.length !== values.length) {
    return <div className="h-20 rounded bg-muted/60" />
  }
  const meanValueRaw = Number(chartData.mean_value)
  const meanValue = Number.isFinite(meanValueRaw) && meanValueRaw > 0
    ? meanValueRaw
    : values.reduce((sum, item) => sum + item, 0) / Math.max(1, values.length)
  const projectedYearRaw = Number(chartData.projected_year)
  const currentYearYtdRaw = Number(chartData.current_year_ytd)
  const projectedYear = Number.isFinite(projectedYearRaw) ? Math.round(projectedYearRaw) : new Date().getUTCFullYear()
  const bars: Array<{
    year: number
    value: number
    current: boolean
    delta: number | null
    pct: number | null
    relative: 'above' | 'near' | 'below'
    detailLines: string[]
  }> = years.map((year, index) => {
    const value = values[index]
    const prev = index > 0 ? values[index - 1] : null
    const delta = prev === null ? null : value - prev
    const pct = prev && prev > 0 ? ((value - prev) / prev) * 100 : null
    const relative = value >= meanValue * 1.1 ? 'above' : value <= meanValue * 0.9 ? 'below' : 'near'
    const detailLines = [
      `Year: ${year}`,
      `Citations: ${formatInt(value)}`,
      `YoY: ${delta === null ? 'n/a' : `${formatSignedInt(delta)} (${formatSignedPct(pct)})`}`,
      `Relative to 5y mean (${formatInt(meanValue)}): ${value >= meanValue ? 'above' : 'below'}`,
    ]
    return {
      year,
      value,
      current: false,
      delta,
      pct,
      relative,
      detailLines,
    }
  })
  const existingCurrentBar = bars.find((item) => item.year === projectedYear)
  const baseWithoutCurrent = bars.filter((item) => item.year !== projectedYear)
  const currentYearValue = Math.max(
    0,
    Number.isFinite(currentYearYtdRaw)
      ? currentYearYtdRaw
      : existingCurrentBar
        ? existingCurrentBar.value
        : 0,
  )
  const previousCompleteValue = baseWithoutCurrent.length
    ? baseWithoutCurrent[baseWithoutCurrent.length - 1].value
    : 0
  const currentDelta = currentYearValue - previousCompleteValue
  const currentPct = previousCompleteValue > 0
    ? ((currentYearValue - previousCompleteValue) / previousCompleteValue) * 100
    : null
  baseWithoutCurrent.push({
    year: projectedYear,
    value: currentYearValue,
    current: true,
    delta: currentDelta,
    pct: currentPct,
    relative: 'near',
    detailLines: [
      `Year: ${projectedYear} (in progress)`,
      `Current citations (YTD): ${formatInt(currentYearValue)}`,
      `vs last complete year: ${formatSignedInt(currentDelta)} (${formatSignedPct(currentPct)})`,
    ].filter(Boolean),
  })
  const maxValue = Math.max(1, ...baseWithoutCurrent.map((item) => item.value))
  return (
    <div className="space-y-1">
      <div className="flex h-20 items-end gap-1">
        {baseWithoutCurrent.map((bar, index) => {
          const baseHeight = Math.max(12, Math.round((bar.value / maxValue) * 72))
          const toneClass = bar.current
            ? 'border border-dashed border-slate-500 bg-slate-200/80'
            : bar.relative === 'above'
              ? 'bg-emerald-600/85'
              : bar.relative === 'below'
                ? 'bg-amber-500/85'
                : 'bg-slate-500/80'
          return (
            <div key={`${bar.year}-${index}`} className="flex w-full flex-col items-center gap-1">
              <button
                type="button"
                data-stop-tile-open="true"
                onMouseEnter={() => setHoveredIndex(index)}
                onMouseLeave={() => setHoveredIndex((current) => (current === index ? null : current))}
                onFocus={() => setHoveredIndex(index)}
                onBlur={() => setHoveredIndex((current) => (current === index ? null : current))}
                onClick={(event) => event.stopPropagation()}
                onMouseDown={(event) => event.stopPropagation()}
                className="relative w-full"
                aria-label={bar.detailLines.join(' | ')}
              >
                {hoveredIndex === index ? (
                  <div className="pointer-events-none absolute -top-7 left-1/2 -translate-x-1/2 whitespace-nowrap rounded border border-slate-300 bg-white px-1.5 py-0.5 text-[10px] font-medium text-slate-900 shadow-sm">
                    {formatInt(bar.value)}
                  </div>
                ) : null}
                <div className={cn('w-full rounded-sm', toneClass)} style={{ height: `${baseHeight}px` }} />
              </button>
              <span className="text-[9px] text-muted-foreground">{String(bar.year).slice(-2)}</span>
            </div>
          )
        })}
      </div>
      <p className="text-[10px] text-muted-foreground">
        Bar colour is relative to 5-year mean ({formatInt(meanValue)}); dashed bar is current year to date.
      </p>
    </div>
  )
}

function HIndexYearChart({ tile }: { tile: PublicationMetricTilePayload }) {
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null)
  const chartData = (tile.chart_data || {}) as Record<string, unknown>
  const years = toNumberArray(chartData.years).map((item) => Math.round(item))
  const values = toNumberArray(chartData.values).map((item) => Math.max(0, item))
  const projectedYearRaw = Number(chartData.projected_year)
  const currentHIndexRaw = Number(chartData.current_h_index)
  const projectedYear = Number.isFinite(projectedYearRaw) ? Math.round(projectedYearRaw) : new Date().getUTCFullYear()

  if (!years.length || !values.length || years.length !== values.length) {
    return <div className="h-20 rounded bg-muted/60" />
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

  const maxValue = Math.max(1, ...bars.map((item) => item.value))

  return (
    <div className="space-y-1">
      <div className="flex h-20 items-end gap-1">
        {bars.map((bar, index) => {
          const baseHeight = Math.max(12, Math.round((bar.value / maxValue) * 72))
          const toneClass = bar.current
            ? 'border border-dashed border-slate-500 bg-slate-200/80'
            : 'bg-slate-500/80'
          return (
            <div key={`${bar.year}-${index}`} className="flex w-full flex-col items-center gap-1">
              <button
                type="button"
                data-stop-tile-open="true"
                onMouseEnter={() => setHoveredIndex(index)}
                onMouseLeave={() => setHoveredIndex((current) => (current === index ? null : current))}
                onFocus={() => setHoveredIndex(index)}
                onBlur={() => setHoveredIndex((current) => (current === index ? null : current))}
                onClick={(event) => event.stopPropagation()}
                onMouseDown={(event) => event.stopPropagation()}
                className="relative w-full"
                aria-label={`${bar.current ? 'Current ' : ''}h-index ${formatInt(bar.value)} in ${bar.year}`}
              >
                {hoveredIndex === index ? (
                  <div className="pointer-events-none absolute -top-7 left-1/2 -translate-x-1/2 whitespace-nowrap rounded border border-slate-300 bg-white px-1.5 py-0.5 text-[10px] font-medium text-slate-900 shadow-sm">
                    h {formatInt(bar.value)}
                  </div>
                ) : null}
                <div className={cn('w-full rounded-sm', toneClass)} style={{ height: `${baseHeight}px` }} />
              </button>
              <span className="text-[9px] text-muted-foreground">{String(bar.year).slice(-2)}</span>
            </div>
          )
        })}
      </div>
      <p className="text-[10px] text-muted-foreground">h-index by year; dashed bar is current year.</p>
    </div>
  )
}

function PublicationsPerYearChart({ tile }: { tile: PublicationMetricTilePayload }) {
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null)
  const chartData = (tile.chart_data || {}) as Record<string, unknown>
  const years = toNumberArray(chartData.years).map((item) => Math.round(item))
  const values = toNumberArray(chartData.values).map((item) => Math.max(0, item))
  if (!years.length || !values.length || years.length !== values.length) {
    return <div className="h-20 rounded bg-muted/60" />
  }
  const meanValueRaw = Number(chartData.mean_value)
  const meanValue = Number.isFinite(meanValueRaw) && meanValueRaw >= 0
    ? meanValueRaw
    : values.reduce((sum, item) => sum + item, 0) / Math.max(1, values.length)
  const projectedYearRaw = Number(chartData.projected_year)
  const currentYearYtdRaw = Number(chartData.current_year_ytd)
  const projectedYear = Number.isFinite(projectedYearRaw) ? Math.round(projectedYearRaw) : new Date().getUTCFullYear()
  const bars: Array<{
    year: number
    value: number
    current: boolean
    relative: 'above' | 'near' | 'below'
  }> = years.map((year, index) => {
    const value = values[index]
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
  historyBars.push({
    year: projectedYear,
    value: currentYearValue,
    current: true,
    relative: 'near',
  })
  const maxValue = Math.max(1, ...historyBars.map((item) => item.value))
  return (
    <div className="space-y-1">
      <div className="flex h-24 items-end gap-1">
        {historyBars.map((bar, index) => {
          const baseHeight = Math.max(14, Math.round((bar.value / maxValue) * 88))
          const toneClass = bar.current
            ? 'border border-dashed border-slate-500 bg-slate-200/80'
            : bar.relative === 'above'
              ? 'bg-emerald-600/85'
              : bar.relative === 'below'
                ? 'bg-amber-500/85'
                : 'bg-slate-500/80'
          return (
            <div key={`${bar.year}-${index}`} className="flex w-full flex-col items-center gap-1">
              <button
                type="button"
                data-stop-tile-open="true"
                onMouseEnter={() => setHoveredIndex(index)}
                onMouseLeave={() => setHoveredIndex((current) => (current === index ? null : current))}
                onFocus={() => setHoveredIndex(index)}
                onBlur={() => setHoveredIndex((current) => (current === index ? null : current))}
                onClick={(event) => event.stopPropagation()}
                onMouseDown={(event) => event.stopPropagation()}
                className="relative w-full"
                aria-label={`${bar.current ? 'Current ' : ''}publications ${formatInt(bar.value)} in ${bar.year}`}
              >
                {hoveredIndex === index ? (
                  <div className="pointer-events-none absolute -top-7 left-1/2 -translate-x-1/2 whitespace-nowrap rounded border border-slate-300 bg-white px-1.5 py-0.5 text-[10px] font-medium text-slate-900 shadow-sm">
                    {formatInt(bar.value)}
                  </div>
                ) : null}
                <div className={cn('w-full rounded-sm', toneClass)} style={{ height: `${baseHeight}px` }} />
              </button>
              <span className="text-[9px] text-muted-foreground">{String(bar.year).slice(-2)}</span>
            </div>
          )
        })}
      </div>
      <p className="text-[10px] text-muted-foreground">
        Dashed bar is current year to date.
      </p>
    </div>
  )
}

function ImpactConcentrationPanel({ tile }: { tile: PublicationMetricTilePayload }) {
  const chartData = (tile.chart_data || {}) as Record<string, unknown>
  const values = toNumberArray(chartData.values).map((item) => Math.max(0, item))
  const top3 = values[0] || 0
  const rest = values[1] || 0
  const total = Math.max(0, top3 + rest)
  const top3Pct = total > 0 ? (top3 / total) * 100 : 0
  const top3PctRounded = Math.max(0, Math.min(100, Math.round(top3Pct)))
  const restPctRounded = Math.max(0, 100 - top3PctRounded)
  const uncitedCountRaw = Number(chartData.uncited_publications_count)
  const uncitedPctRaw = Number(chartData.uncited_publications_pct)
  const uncitedCount = Number.isFinite(uncitedCountRaw) ? Math.max(0, Math.round(uncitedCountRaw)) : 0
  const uncitedPct = Number.isFinite(uncitedPctRaw) ? Math.max(0, Math.round(uncitedPctRaw)) : 0
  const citedPct = Math.max(0, 100 - uncitedPct)
  const meaning = `Top 3 papers account for ${top3PctRounded}% of lifetime citations`
  const uncitedMeaning = `Uncited publications account for ${uncitedPct}% of library (${uncitedCount})`
  const [hoveredCitationSegment, setHoveredCitationSegment] = useState<'top3' | 'rest' | null>(null)
  const [hoveredUncitedSegment, setHoveredUncitedSegment] = useState<'uncited' | 'cited' | null>(null)
  const top3Width = Math.max(0, Math.min(100, top3PctRounded))
  const restWidth = Math.max(0, Math.min(100, restPctRounded))
  const hoverCitationLabel = hoveredCitationSegment === 'top3'
    ? `Top 3 ${top3PctRounded}%`
    : hoveredCitationSegment === 'rest'
      ? `Rest ${restPctRounded}%`
      : ''
  const hoverCitationLeft = hoveredCitationSegment === 'top3'
    ? top3Width / 2
    : hoveredCitationSegment === 'rest'
      ? top3Width + restWidth / 2
      : 50
  const uncitedWidth = Math.max(0, Math.min(100, uncitedPct))
  const citedWidth = Math.max(0, Math.min(100, citedPct))
  const hoverUncitedLabel = hoveredUncitedSegment === 'uncited'
    ? `Uncited ${uncitedPct}%`
    : hoveredUncitedSegment === 'cited'
      ? `Cited ${citedPct}%`
      : ''
  const hoverUncitedLeft = hoveredUncitedSegment === 'uncited'
    ? uncitedWidth / 2
    : hoveredUncitedSegment === 'cited'
      ? uncitedWidth + citedWidth / 2
      : 50

  return (
    <div className="mt-1.5 flex items-start gap-3">
      <div className="min-w-0 flex-1">
        <p className="min-h-[18px] text-xs text-muted-foreground">{meaning}</p>
        <p className="mt-1 min-h-[18px] text-xs text-muted-foreground">{uncitedMeaning}</p>
      </div>
      <div className="w-[52%] min-w-[170px]">
        <div className="space-y-2">
          <div className="relative">
            {hoveredCitationSegment ? (
              <div
                className="pointer-events-none absolute -top-7 -translate-x-1/2 whitespace-nowrap rounded border border-slate-300 bg-white px-1.5 py-0.5 text-[10px] font-medium text-slate-900 shadow-sm"
                style={{ left: `${Math.max(0, Math.min(100, hoverCitationLeft))}%` }}
              >
                {hoverCitationLabel}
              </div>
            ) : null}
            <div className="h-6 overflow-hidden rounded border border-border/70 bg-muted/40">
              <div className="flex h-full">
                {top3Width > 0 ? (
                  <button
                    type="button"
                    data-stop-tile-open="true"
                    onMouseEnter={() => setHoveredCitationSegment('top3')}
                    onMouseLeave={() => setHoveredCitationSegment((current) => (current === 'top3' ? null : current))}
                    onFocus={() => setHoveredCitationSegment('top3')}
                    onBlur={() => setHoveredCitationSegment((current) => (current === 'top3' ? null : current))}
                    onClick={(event) => event.stopPropagation()}
                    onMouseDown={(event) => event.stopPropagation()}
                    className="h-full bg-slate-800/85"
                    style={{ width: `${top3Width}%` }}
                    aria-label={`Top 3 papers ${top3PctRounded}%`}
                    title={`Top 3 papers: ${top3.toLocaleString('en-GB')} citations`}
                  />
                ) : null}
                {restWidth > 0 ? (
                  <button
                    type="button"
                    data-stop-tile-open="true"
                    onMouseEnter={() => setHoveredCitationSegment('rest')}
                    onMouseLeave={() => setHoveredCitationSegment((current) => (current === 'rest' ? null : current))}
                    onFocus={() => setHoveredCitationSegment('rest')}
                    onBlur={() => setHoveredCitationSegment((current) => (current === 'rest' ? null : current))}
                    onClick={(event) => event.stopPropagation()}
                    onMouseDown={(event) => event.stopPropagation()}
                    className="h-full bg-slate-300/80"
                    style={{ width: `${restWidth}%` }}
                    aria-label={`Rest papers ${restPctRounded}%`}
                    title={`Other papers: ${rest.toLocaleString('en-GB')} citations`}
                  />
                ) : null}
              </div>
            </div>
          </div>
          <div className="relative">
            {hoveredUncitedSegment ? (
              <div
                className="pointer-events-none absolute -top-7 -translate-x-1/2 whitespace-nowrap rounded border border-slate-300 bg-white px-1.5 py-0.5 text-[10px] font-medium text-slate-900 shadow-sm"
                style={{ left: `${Math.max(0, Math.min(100, hoverUncitedLeft))}%` }}
              >
                {hoverUncitedLabel}
              </div>
            ) : null}
            <div className="h-6 overflow-hidden rounded border border-border/70 bg-muted/40">
              <div className="flex h-full">
                {uncitedWidth > 0 ? (
                  <button
                    type="button"
                    data-stop-tile-open="true"
                    onMouseEnter={() => setHoveredUncitedSegment('uncited')}
                    onMouseLeave={() => setHoveredUncitedSegment((current) => (current === 'uncited' ? null : current))}
                    onFocus={() => setHoveredUncitedSegment('uncited')}
                    onBlur={() => setHoveredUncitedSegment((current) => (current === 'uncited' ? null : current))}
                    onClick={(event) => event.stopPropagation()}
                    onMouseDown={(event) => event.stopPropagation()}
                    className="h-full bg-slate-700/85"
                    style={{ width: `${uncitedWidth}%` }}
                    aria-label={`Uncited publications ${uncitedPct}%`}
                    title={`Uncited publications: ${uncitedCount.toLocaleString('en-GB')} works`}
                  />
                ) : null}
                {citedWidth > 0 ? (
                  <button
                    type="button"
                    data-stop-tile-open="true"
                    onMouseEnter={() => setHoveredUncitedSegment('cited')}
                    onMouseLeave={() => setHoveredUncitedSegment((current) => (current === 'cited' ? null : current))}
                    onFocus={() => setHoveredUncitedSegment('cited')}
                    onBlur={() => setHoveredUncitedSegment((current) => (current === 'cited' ? null : current))}
                    onClick={(event) => event.stopPropagation()}
                    onMouseDown={(event) => event.stopPropagation()}
                    className="h-full bg-slate-300/80"
                    style={{ width: `${citedWidth}%` }}
                    aria-label={`Cited publications ${citedPct}%`}
                    title="Publications with at least one citation"
                  />
                ) : null}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

function MomentumTilePanel({ tile }: { tile: PublicationMetricTilePayload }) {
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null)
  const breakdown = buildMomentumBreakdown(tile)
  const primaryValue = breakdown.liftPct !== null
    ? formatSignedPercentCompact(breakdown.liftPct)
    : breakdown.insufficientBaseline
      ? 'New'
      : '\u2014'
  const secondary = breakdown.insufficientBaseline ? 'Insufficient baseline' : '3m vs 9m baseline'
  const summaryLift = breakdown.liftPct !== null ? formatSignedPercentCompact(breakdown.liftPct) : 'New'
  const maxValue = breakdown.bars.length ? Math.max(1, ...breakdown.bars.map((item) => item.value)) : 1
  const highlightStart = Math.max(0, breakdown.bars.length - 3)

  return (
    <div className={dashboardTileStyles.container}>
      <div className={dashboardTileStyles.leftColumn}>
        <p className={dashboardTileStyles.leftPrimary} data-testid={`metric-value-${tile.key}`}>
          {primaryValue}
        </p>
        <p className={dashboardTileStyles.leftSecondary}>{secondary}</p>
      </div>
      <div className={dashboardTileStyles.rightChartColumn}>
        {breakdown.bars.length ? (
          <TooltipProvider delayDuration={90}>
            <div className={dashboardTileStyles.rightChartSurface}>
              {breakdown.bars.map((bar, index) => {
                const height = Math.max(14, Math.round((bar.value / maxValue) * 78))
                const highlighted = index >= highlightStart
                const isActive = hoveredIndex === index
                const valueText = formatInt(bar.value)
                const barSummary = `3m total ${breakdown.recent3Total === null ? 'n/a' : formatInt(breakdown.recent3Total)}; 9m total ${breakdown.baseline9Total === null ? 'n/a' : formatInt(breakdown.baseline9Total)}; rate_3m ${formatRate(breakdown.rate3m)}; rate_9m ${formatRate(breakdown.rate9m)}; lift ${summaryLift}`
                return (
                  <div key={`${bar.label}-${index}`} className={dashboardTileStyles.barWrapper}>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <button
                          type="button"
                          data-stop-tile-open="true"
                          tabIndex={dashboardTileBarTabIndex}
                          onMouseEnter={() => setHoveredIndex(index)}
                          onMouseLeave={() => setHoveredIndex((current) => (current === index ? null : current))}
                          onFocus={() => setHoveredIndex(index)}
                          onBlur={() => setHoveredIndex((current) => (current === index ? null : current))}
                          onClick={(event) => event.stopPropagation()}
                          onMouseDown={(event) => event.stopPropagation()}
                          className={cn(
                            dashboardTileStyles.barTrigger,
                            dashboardTileStyles.barFocusRing,
                          )}
                          aria-label={`${bar.label}: ${valueText} citations. ${barSummary}`}
                        >
                          {isActive ? (
                            <div className={dashboardTileStyles.valuePill}>
                              {valueText}
                            </div>
                          ) : null}
                          <div
                            className={cn(
                              'w-full rounded-sm transition-colors',
                              highlighted ? 'bg-slate-900/85' : 'bg-slate-500/70',
                              isActive && 'bg-slate-900',
                            )}
                            style={{ height: `${height}px` }}
                          />
                        </button>
                      </TooltipTrigger>
                      <TooltipContent side="top" className="px-2 py-1 text-[10px]">
                        <p>{bar.label}: {valueText} citations</p>
                      </TooltipContent>
                    </Tooltip>
                    <span className="text-[9px] text-muted-foreground">{bar.label}</span>
                  </div>
                )
              })}
            </div>
          </TooltipProvider>
        ) : (
          <div className={dashboardTileStyles.emptyChart}>
            No monthly citation data
          </div>
        )}
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
    return <div className="h-8 rounded bg-muted/70" />
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
            className={cn('w-full rounded-sm bg-slate-500/70', highlighted && 'bg-slate-900/85')}
            style={{ height: `${height}px` }}
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
    return <div className="h-8 rounded bg-muted/70" />
  }
  const max = Math.max(1, ...safe)
  return (
    <div className="flex h-8 items-end gap-2">
      {safe.map((value, index) => (
        <div key={`${index}-${value}`} className="flex w-full flex-col items-center gap-1">
          <div
            className={cn('w-full rounded-sm', index === 0 ? 'bg-slate-900/85' : 'bg-slate-500/70')}
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
      <circle cx="18" cy="18" r={radius} fill="none" stroke="#e2e8f0" strokeWidth="4" />
      <circle
        cx="18"
        cy="18"
        r={radius}
        fill="none"
        stroke="#0f172a"
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
    return <div className="h-8 w-8 rounded-full bg-muted/70" />
  }
  const pct = safe[0] / total
  const angle = pct * 360
  const gradient = `conic-gradient(#0f172a 0deg ${angle}deg, #94a3b8 ${angle}deg 360deg)`
  return (
    <div className="h-8 w-8 rounded-full" style={{ background: gradient }}>
      <div className="relative left-[7px] top-[7px] h-[18px] w-[18px] rounded-full bg-white" />
    </div>
  )
}

function MiniLine({
  values,
  overlay = [],
  colorCode = '#475569',
}: {
  values: number[]
  overlay?: number[]
  colorCode?: string
}) {
  if (!values.length) {
    return <div className="h-8 rounded bg-muted/70" />
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
          stroke="rgba(71,85,105,0.5)"
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
        colorCode={tile.delta_color_code || '#475569'}
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
      colorCode={tile.delta_color_code || '#475569'}
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
  if (key === 'field_normalized_impact') {
    return `Field-normalized impact: ${Number(publication.field_normalized_impact || 0).toFixed(3)}`
  }
  return ''
}

function deltaTextClass(tile: PublicationMetricTilePayload): string {
  const code = String(tile.delta_color_code || '').toLowerCase()
  if (code.includes('166534')) {
    return 'text-emerald-700'
  }
  if (code.includes('b45309')) {
    return 'text-amber-700'
  }
  if (code.includes('b91c1c')) {
    return 'text-red-700'
  }
  return 'text-slate-600'
}

function badgeClass(tile: PublicationMetricTilePayload): string {
  const severity = String((tile.badge?.severity as string) || tile.delta_tone || 'neutral').toLowerCase()
  if (severity === 'positive') {
    return 'bg-emerald-50 text-emerald-700 border-emerald-200'
  }
  if (severity === 'caution') {
    return 'bg-amber-50 text-amber-700 border-amber-200'
  }
  if (severity === 'negative') {
    return 'bg-red-50 text-red-700 border-red-200'
  }
  return 'bg-slate-100 text-slate-700 border-slate-200'
}

function metricDataSources(tile: PublicationMetricTilePayload): string {
  const details = tile.tooltip_details || {}
  const detailSources = Array.isArray(details.data_sources) ? details.data_sources : []
  const rawSources = detailSources.filter((item) => typeof item === 'string') as string[]
  if (rawSources.length > 0) {
    return rawSources.join(', ')
  }
  return (tile.data_source || []).join(', ') || 'Not available'
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
  const [totalTrendMode, setTotalTrendMode] = useState<TotalTrendMode>('year')

  const tiles = metrics?.tiles || []
  const selectedTile = useMemo(
    () => tiles.find((tile) => tile.key === activeTileKey) || null,
    [activeTileKey, tiles],
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
        <CardContent className="space-y-3 p-4">
          <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
            <div className="flex flex-wrap items-center gap-2">
              <span>Data last refreshed: {formatRefreshedAt(metrics?.data_last_refreshed || metrics?.computed_at)}</span>
              {metrics?.is_updating ? <span className="text-amber-700">Updating...</span> : null}
              {metrics?.status === 'FAILED' ? <span className="text-amber-700">Last update failed</span> : null}
            </div>
            <span>Data sources: {(metrics?.data_sources || []).join(', ') || 'Not available'}</span>
          </div>

          {loading && tiles.length === 0 ? (
            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {Array.from({ length: 6 }).map((_, index) => (
                <div key={index} className="h-28 rounded border border-border bg-muted/40" />
              ))}
            </div>
          ) : (
            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {tiles.map((tile) => {
                const badgeLabel = String((tile.badge?.label as string) || '').trim()
                const subtitle = String(tile.subtext || '').trim()
                const isTotalCitationsTile = tile.key === 'total_citations'
                const isTotalPublicationsTile = tile.key === 'this_year_vs_last'
                const isHIndexTile = tile.key === 'h_index_projection'
                const isImpactConcentrationTile = tile.key === 'impact_concentration'
                const isMomentumTile = tile.key === 'momentum'
                const rawDeltaDisplay = String(tile.delta_display || '').trim()
                const shouldHideLegacyTrendText =
                  isTotalCitationsTile && /(falling|rising|stable over)/i.test(rawDeltaDisplay)
                const effectiveDeltaDisplay = shouldHideLegacyTrendText ? '' : rawDeltaDisplay
                const tileValueSource = tile.main_value ?? tile.value
                const tileValueNumberRaw = typeof tileValueSource === 'number' ? tileValueSource : Number.NaN
                const mainValueDisplay = isImpactConcentrationTile && Number.isFinite(tileValueNumberRaw)
                  ? `${Math.round(tileValueNumberRaw)}%`
                  : tile.value_display
                const hChartData = (tile.chart_data || {}) as Record<string, unknown>
                const hGapText = String(hChartData.gap_text || '').trim()
                const hNextTargetRaw = Number(hChartData.next_h_index)
                const hNextTarget = Number.isFinite(hNextTargetRaw) ? Math.round(hNextTargetRaw) : null
                const hProgressRaw = Number(hChartData.progress_to_next_pct)
                const hProgressPct = Number.isFinite(hProgressRaw) ? Math.max(0, Math.min(100, hProgressRaw)) : 0
                const hCandidateGaps = toNumberArray(hChartData.candidate_gaps)
                  .map((item) => Math.round(item))
                  .filter((item) => item > 0)
                  .slice(0, 3)
                const hSubtitleRaw = String(tile.subtext || '').trim()
                const hSubtitle = /(target|projection)/i.test(hSubtitleRaw) ? '' : hSubtitleRaw
                const hProgressLabel = hNextTarget !== null
                  ? `${Math.round(hProgressPct)}% to h=${hNextTarget}`
                  : `${Math.round(hProgressPct)}% to next h`
                return (
                  <div
                    key={tile.key}
                    role="button"
                    tabIndex={0}
                    data-metric-key={tile.key}
                    onClick={(event) => {
                      if (shouldIgnoreTileOpen(event.target)) {
                        return
                      }
                      void onSelectTile(tile)
                    }}
                    onKeyDown={(event) => {
                      if (shouldIgnoreTileOpen(event.target)) {
                        return
                      }
                      if (event.key === 'Enter' || event.key === ' ') {
                        event.preventDefault()
                        void onSelectTile(tile)
                      }
                    }}
                    className={cn(
                      'cursor-pointer rounded border border-border px-3 py-2 text-left transition-colors hover:bg-muted/30',
                      tile.stability === 'unstable' && 'border-amber-300/70 bg-amber-50/40',
                    )}
                  >
                    <div className="mb-1 flex items-center justify-between gap-2">
                      <p className="text-xs text-muted-foreground" data-testid={`metric-label-${tile.key}`}>{tile.label}</p>
                      <div className="flex items-center gap-1">
                        {!isTotalCitationsTile && !isTotalPublicationsTile && !isHIndexTile && !isImpactConcentrationTile && !isMomentumTile && badgeLabel ? (
                          <span
                            className={cn('rounded border px-1.5 py-0.5 text-[10px]', badgeClass(tile))}
                            data-testid={`metric-badge-${tile.key}`}
                          >
                            {badgeLabel}
                          </span>
                        ) : null}
                        {isImpactConcentrationTile && badgeLabel ? (
                          <span
                            className={cn('rounded border px-1.5 py-0.5 text-[10px]', badgeClass(tile))}
                            data-testid={`metric-badge-${tile.key}`}
                          >
                            {badgeLabel}
                          </span>
                        ) : null}
                        <TooltipProvider delayDuration={120}>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <span className="inline-flex h-4 w-4 items-center justify-center text-muted-foreground">
                                <Info className="h-3.5 w-3.5" />
                              </span>
                            </TooltipTrigger>
                            <TooltipContent side="top" className="max-w-[300px] leading-relaxed">
                              <p>{tile.tooltip}</p>
                              <p className="mt-1 text-[11px] text-muted-foreground">
                                Source: {metricDataSources(tile)}
                              </p>
                              <p className="mt-1 text-[11px] text-muted-foreground">
                                Update: {String((tile.tooltip_details?.update_frequency as string) || 'Daily')}
                              </p>
                            </TooltipContent>
                          </Tooltip>
                        </TooltipProvider>
                      </div>
                    </div>
                    {!isTotalPublicationsTile && !isMomentumTile ? (
                      <p className="text-lg font-semibold leading-tight" data-testid={`metric-value-${tile.key}`}>{mainValueDisplay}</p>
                    ) : null}
                    {isTotalCitationsTile ? (
                      <div className="mt-1.5 flex items-start gap-3">
                        <div className="min-w-0 flex-1">
                          <p className="min-h-[18px] text-xs text-muted-foreground">
                            {subtitle || '\u00A0'}
                          </p>
                          <div className="mt-1.5">
                            <TotalCitationsMiniTrend
                              tile={tile}
                              mode={totalTrendMode}
                              onModeChange={setTotalTrendMode}
                            />
                          </div>
                        </div>
                        <div className="w-[48%] min-w-[160px]">
                          <TotalCitationsGrowthChart tile={tile} />
                        </div>
                      </div>
                    ) : isTotalPublicationsTile ? (
                      <div className="mt-1.5 flex items-start gap-3">
                        <div className="min-w-0 flex-[0.9]">
                          <p className="text-lg font-semibold leading-tight">{tile.value_display}</p>
                          <p className="min-h-[18px] text-xs text-muted-foreground">
                            {subtitle || '\u00A0'}
                          </p>
                        </div>
                        <div className="w-[54%] min-w-[180px]">
                          <PublicationsPerYearChart tile={tile} />
                        </div>
                      </div>
                    ) : isHIndexTile ? (
                      <div className="mt-1.5 flex items-start gap-3">
                        <div className="min-w-0 flex-1">
                          <p className="min-h-[18px] text-xs text-muted-foreground">
                            {hProgressLabel}
                          </p>
                          <div className="mt-1">
                            <div className="h-1.5 overflow-hidden rounded bg-slate-200">
                              <div className="h-full rounded bg-slate-800" style={{ width: `${hProgressPct}%` }} />
                            </div>
                            <p className="mt-0.5 text-[11px] text-muted-foreground">{hSubtitle || '\u00A0'}</p>
                          </div>
                          <div className="mt-1 min-h-[16px] text-[11px] text-muted-foreground">
                            {hCandidateGaps.length > 0 ? (
                              <div className="flex flex-wrap items-center gap-1">
                                <span>Nearest papers need:</span>
                                {hCandidateGaps.map((gap, index) => (
                                  <span key={`${gap}-${index}`} className="rounded border border-slate-300 bg-slate-50 px-1.5 py-0.5 text-[10px] text-slate-700">
                                    +{gap}
                                  </span>
                                ))}
                              </div>
                            ) : (
                              hGapText || '\u00A0'
                            )}
                          </div>
                        </div>
                        <div className="w-[48%] min-w-[160px]">
                          <HIndexYearChart tile={tile} />
                        </div>
                      </div>
                    ) : isMomentumTile ? (
                      <MomentumTilePanel tile={tile} />
                    ) : isImpactConcentrationTile ? (
                      <ImpactConcentrationPanel tile={tile} />
                    ) : (
                      <>
                        <p className="mt-0.5 min-h-[18px] text-xs text-muted-foreground">
                          {subtitle || '\u00A0'}
                        </p>
                        {effectiveDeltaDisplay ? (
                          <p
                            className={cn(
                              'min-h-[16px] text-[11px]',
                              deltaTextClass(tile),
                              tile.stability === 'unstable' && 'font-medium',
                            )}
                          >
                            {effectiveDeltaDisplay}
                          </p>
                        ) : (
                          <p className="min-h-[16px] text-[11px] text-muted-foreground">&nbsp;</p>
                        )}
                        <div className="mt-1.5">
                          <MiniChart tile={tile} />
                        </div>
                      </>
                    )}
                  </div>
                )
              })}
            </div>
          )}
        </CardContent>
      </Card>

      <Sheet open={drawerOpen} onOpenChange={setDrawerOpen}>
        <SheetContent side="right" className="w-full overflow-y-auto p-4 sm:max-w-[560px]">
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
                    <p className="text-[11px] font-medium text-foreground">Intermediate values</p>
                    <pre className="mt-1 overflow-x-auto text-[11px] text-muted-foreground">
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
                        <p className="mt-1 text-[11px] text-muted-foreground">
                          Confidence {Number(publication.confidence_score || 0).toFixed(2)} ({String(publication.confidence_label || 'n/a')}) | {String(publication.match_source || 'unknown')}:{String(publication.match_method || 'unknown')}
                        </p>
                        {String(publication.doi_url || '') ? (
                          <a
                            href={String(publication.doi_url)}
                            target="_blank"
                            rel="noreferrer"
                            className="mt-1 inline-flex items-center gap-1 text-[11px] text-blue-700 hover:underline"
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
