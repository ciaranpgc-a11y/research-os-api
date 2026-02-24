import { useEffect, useMemo, useState } from 'react'
import { ExternalLink, Info } from 'lucide-react'

import { Card, CardContent } from '@/components/ui/card'
import { Sheet, SheetContent } from '@/components/ui/sheet'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import { fetchPublicationMetricDetail } from '@/lib/impact-api'
import { cn } from '@/lib/utils'
import type { PublicationMetricTilePayload, PublicationsTopMetricsPayload } from '@/types/impact'

type PublicationsTopStripProps = {
  metrics: PublicationsTopMetricsPayload | null
  loading?: boolean
  token?: string | null
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
  const years = toNumberArray(chartData.years).map((item) => Math.round(item))
  const yearlyValues = toNumberArray(chartData.values).map((item) => Math.max(0, item))
  const monthlyValues = toNumberArray(chartData.monthly_values_12m).map((item) => Math.max(0, item))
  const monthModeAvailable = monthlyValues.length >= 12
  const effectiveMode: TotalTrendMode = mode === 'month' && !monthModeAvailable ? 'year' : mode
  const projectedYear = Math.round(Number(chartData.projected_year || 0))
  const projectedValue = Math.max(0, Number(chartData.projected_value || 0))
  const showYearProjection =
    effectiveMode === 'year' &&
    years.length > 0 &&
    Number.isFinite(projectedYear) &&
    projectedYear > 0 &&
    Number.isFinite(projectedValue) &&
    projectedValue > 0

  const baseValues = effectiveMode === 'year' ? yearlyValues : monthlyValues
  const values = showYearProjection ? [...baseValues, projectedValue] : baseValues
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
  const max = Math.max(...values)
  const min = Math.min(...values)
  const range = Math.max(1e-6, max - min)
  const step = values.length > 1 ? (width - 8) / (values.length - 1) : 0
  const lastIndex = values.length - 1
  const lastX = 4 + lastIndex * step
  const lastY = height - 4 - ((values[lastIndex] - min) / range) * (height - 8)

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
        {showYearProjection ? <span className="text-muted-foreground">includes projected {String(projectedYear).slice(-2)}</span> : null}
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
        {showYearProjection ? (
          <circle
            cx={lastX}
            cy={lastY}
            r="2.6"
            fill="#ffffff"
            stroke="#0f172a"
            strokeDasharray="2 2"
            strokeWidth="1.5"
          />
        ) : null}
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
  const projectedValueRaw = Number(chartData.projected_value)
  const projectedConfidence = String(chartData.projected_confidence || 'low')
  const hasProjection = Number.isFinite(projectedYearRaw) && Number.isFinite(projectedValueRaw) && projectedValueRaw > 0
  const currentYear = new Date().getUTCFullYear()
  const projectionComponents = (chartData.projection_components || {}) as Record<string, unknown>
  const ytdProjection = Number(projectionComponents.ytd_run_rate_projection ?? NaN)
  const trendProjection = Number(projectionComponents.trend_projection ?? NaN)
  const bars: Array<{
    year: number
    value: number
    projected: boolean
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
    return { year, value, projected: false, delta, pct, relative, detailLines }
  })
  if (hasProjection) {
    const projectedYear = Math.round(projectedYearRaw)
    const projectedValue = Math.max(0, projectedValueRaw)
    const prev = values[values.length - 1] || 0
    const delta = projectedValue - prev
    const pct = prev > 0 ? ((projectedValue - prev) / prev) * 100 : null
    const detailLines = [
      `Year: ${projectedYear} (projection)`,
      `Projected citations: ${formatInt(projectedValue)}`,
      `vs last complete year: ${formatSignedInt(delta)} (${formatSignedPct(pct)})`,
      `Method: blended forecast`,
      `Confidence: ${projectedConfidence}`,
      Number.isFinite(ytdProjection) ? `YTD run-rate component: ${formatInt(ytdProjection)}` : '',
      Number.isFinite(trendProjection) ? `Trend component: ${formatInt(trendProjection)}` : '',
    ].filter(Boolean)
    bars.push({
      year: projectedYear,
      value: projectedValue,
      projected: true,
      delta,
      pct,
      relative: 'near',
      detailLines,
    })
  } else if (bars.length >= 1 && bars[bars.length - 1]?.year === currentYear) {
    // Backward compatibility with cached payloads that include current year in the base bars.
    bars[bars.length - 1].projected = true
    bars[bars.length - 1].detailLines.push('Note: current year is partial (YTD).')
  }
  const maxValue = Math.max(1, ...bars.map((item) => item.value))
  return (
    <div className="space-y-1">
      <div className="flex h-20 items-end gap-1">
        {bars.map((bar, index) => {
          const height = Math.max(12, Math.round((bar.value / maxValue) * 72))
          const toneClass = bar.projected
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
                <div className={cn('w-full rounded-sm', toneClass)} style={{ height: `${height}px` }} />
              </button>
              <span className="text-[9px] text-muted-foreground">{String(bar.year).slice(-2)}</span>
            </div>
          )
        })}
      </div>
      <p className="text-[10px] text-muted-foreground">
        Bar colour is relative to 5-year mean ({formatInt(meanValue)}).
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
  const projectedValueRaw = Number(chartData.projected_value)
  const hasProjection =
    Number.isFinite(projectedYearRaw) && Number.isFinite(projectedValueRaw) && projectedValueRaw >= 0

  if (!years.length || !values.length || years.length !== values.length) {
    return <div className="h-20 rounded bg-muted/60" />
  }

  const bars: Array<{ year: number; value: number; projected: boolean }> = years.map((year, index) => ({
    year,
    value: values[index],
    projected: false,
  }))
  if (hasProjection) {
    bars.push({
      year: Math.round(projectedYearRaw),
      value: Math.max(0, projectedValueRaw),
      projected: true,
    })
  }

  const maxValue = Math.max(1, ...bars.map((item) => item.value))

  return (
    <div className="space-y-1">
      <div className="flex h-20 items-end gap-1">
        {bars.map((bar, index) => {
          const height = Math.max(12, Math.round((bar.value / maxValue) * 72))
          const toneClass = bar.projected
            ? 'border border-dashed border-emerald-700/60 bg-emerald-500/75'
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
                aria-label={`${bar.projected ? 'Projected ' : ''}h-index ${formatInt(bar.value)} in ${bar.year}`}
              >
                {hoveredIndex === index ? (
                  <div className="pointer-events-none absolute -top-7 left-1/2 -translate-x-1/2 whitespace-nowrap rounded border border-slate-300 bg-white px-1.5 py-0.5 text-[10px] font-medium text-slate-900 shadow-sm">
                    h {formatInt(bar.value)}
                  </div>
                ) : null}
                <div className={cn('w-full rounded-sm', toneClass)} style={{ height: `${height}px` }} />
              </button>
              <span className="text-[9px] text-muted-foreground">{String(bar.year).slice(-2)}</span>
            </div>
          )
        })}
      </div>
      <p className="text-[10px] text-muted-foreground">h-index by year (complete years + projected current year).</p>
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
  const projectedValueRaw = Number(chartData.projected_value)
  const hasProjection = Number.isFinite(projectedYearRaw) && Number.isFinite(projectedValueRaw) && projectedValueRaw >= 0
  const bars: Array<{ year: number; value: number; projected: boolean; relative: 'above' | 'near' | 'below' }> = years.map((year, index) => {
    const value = values[index]
    const relative = value >= meanValue * 1.1 ? 'above' : value <= meanValue * 0.9 ? 'below' : 'near'
    return { year, value, projected: false, relative }
  })
  if (hasProjection) {
    bars.push({
      year: Math.round(projectedYearRaw),
      value: Math.max(0, projectedValueRaw),
      projected: true,
      relative: 'near',
    })
  }
  const maxValue = Math.max(1, ...bars.map((item) => item.value))
  return (
    <div className="space-y-1">
      <div className="flex h-20 items-end gap-1">
        {bars.map((bar, index) => {
          const height = Math.max(12, Math.round((bar.value / maxValue) * 72))
          const toneClass = bar.projected
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
                aria-label={`${bar.projected ? 'Projected ' : ''}publications ${formatInt(bar.value)} in ${bar.year}`}
              >
                {hoveredIndex === index ? (
                  <div className="pointer-events-none absolute -top-7 left-1/2 -translate-x-1/2 whitespace-nowrap rounded border border-slate-300 bg-white px-1.5 py-0.5 text-[10px] font-medium text-slate-900 shadow-sm">
                    {formatInt(bar.value)}
                  </div>
                ) : null}
                <div className={cn('w-full rounded-sm', toneClass)} style={{ height: `${height}px` }} />
              </button>
              <span className="text-[9px] text-muted-foreground">{String(bar.year).slice(-2)}</span>
            </div>
          )
        })}
      </div>
      <p className="text-[10px] text-muted-foreground">
        Bar colour is relative to 5-year mean ({formatInt(meanValue)}).
      </p>
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

function MiniGauge({
  value,
  min,
  max,
}: {
  value: number
  min: number
  max: number
}) {
  const lo = Number.isFinite(min) ? min : 0
  const hi = Number.isFinite(max) && max > lo ? max : 150
  const clamped = Math.max(lo, Math.min(hi, Number.isFinite(value) ? value : lo))
  const pct = ((clamped - lo) / (hi - lo)) * 100
  return (
    <div className="space-y-1">
      <div className="relative h-2 overflow-hidden rounded-full bg-slate-200">
        <div className="absolute inset-y-0 left-0 w-[63%] bg-slate-400/70" />
        <div className="absolute inset-y-0 left-[63%] w-[7%] bg-slate-600/70" />
        <div className="absolute inset-y-0 right-0 w-[30%] bg-slate-900/70" />
        <div className="absolute inset-y-0 left-0 bg-transparent" style={{ width: `${pct}%`, borderRight: '2px solid #0f172a' }} />
      </div>
      <div className="text-[10px] text-muted-foreground">0-150 index</div>
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
    const min = Number(chartData.min ?? 0)
    const max = Number(chartData.max ?? 150)
    const value = Number(chartData.value ?? 0)
    const monthly = toNumberArray(chartData.monthly_values_12m)
    const highlightLast = Math.max(0, monthly.length - Number(chartData.highlight_last_n ?? 3))
    return (
      <div className="space-y-1">
        <MiniGauge value={value} min={min} max={max} />
        {monthly.length ? <MiniBars values={monthly} highlightFrom={highlightLast} /> : null}
      </div>
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

export function PublicationsTopStrip({ metrics, loading = false, token = null }: PublicationsTopStripProps) {
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
      const detail = await fetchPublicationMetricDetail(token, tile.key)
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
                const rawDeltaDisplay = String(tile.delta_display || '').trim()
                const shouldHideLegacyTrendText =
                  isTotalCitationsTile && /(falling|rising|stable over)/i.test(rawDeltaDisplay)
                const effectiveDeltaDisplay = shouldHideLegacyTrendText ? '' : rawDeltaDisplay
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
                      <p className="text-xs text-muted-foreground">{tile.label}</p>
                      <div className="flex items-center gap-1">
                        {!isTotalCitationsTile && !isTotalPublicationsTile && !isHIndexTile && badgeLabel ? (
                          <span className={cn('rounded border px-1.5 py-0.5 text-[10px]', badgeClass(tile))}>
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
                    <p className="text-lg font-semibold leading-tight">{tile.value_display}</p>
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
                        <div className="min-w-0 flex-1">
                          <p className="min-h-[18px] text-xs text-muted-foreground">
                            {subtitle || '\u00A0'}
                          </p>
                          <p className="mt-1 min-h-[16px] text-[11px] text-muted-foreground">&nbsp;</p>
                        </div>
                        <div className="w-[48%] min-w-[160px]">
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
