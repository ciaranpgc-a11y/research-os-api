import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { ExternalLink } from 'lucide-react'

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
import { MetricTile } from './MetricTile'

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

type LinePoint = {
  x: number
  y: number
  value: number
  label: string
}

type MetricBarDatum = {
  key: string
  label: string
  value: number
  tooltip: ReactNode
  ariaLabel: string
  toneClass?: string
  dashed?: boolean
  valueText?: string
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

function smoothPathFromPoints(points: Array<{ x: number; y: number }>): string {
  if (points.length === 0) {
    return ''
  }
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

function areaPathFromPoints(points: Array<{ x: number; y: number }>, height: number, padding = 6): string {
  if (!points.length) {
    return ''
  }
  const topPath = smoothPathFromPoints(points)
  const first = points[0]
  const last = points[points.length - 1]
  const baselineY = height - padding
  return `${topPath} L ${last.x} ${baselineY} L ${first.x} ${baselineY} Z`
}

function MetricBarsChart({
  items,
  emptyLabel,
  minBarHeight = 14,
  maxBarHeight = 80,
  surfaceClassName,
  barTriggerClassName,
  hideLabels = false,
  showDashedCurrent = true,
  showTooltip = true,
  showAxisLabels = false,
  axisLabelClassName,
  meanLineValue,
  useRelativeHeights = false,
}: {
  items: MetricBarDatum[]
  emptyLabel: string
  minBarHeight?: number
  maxBarHeight?: number
  surfaceClassName?: string
  barTriggerClassName?: string
  hideLabels?: boolean
  showDashedCurrent?: boolean
  showTooltip?: boolean
  showAxisLabels?: boolean
  axisLabelClassName?: string
  meanLineValue?: number
  useRelativeHeights?: boolean
}) {
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null)
  if (!items.length) {
    return <div className={dashboardTileStyles.emptyChart}>{emptyLabel}</div>
  }
  const maxValue = Math.max(1, ...items.map((item) => Math.max(0, item.value)))
  const meanLinePercent = Number.isFinite(meanLineValue)
    ? Math.max(0, Math.min(100, (Math.max(0, Number(meanLineValue)) / maxValue) * 100))
    : null
  return (
    <TooltipProvider delayDuration={90}>
      <div className={cn(dashboardTileStyles.rightChartSurface, surfaceClassName)}>
        {items.map((item, index) => {
          const safeValue = Math.max(0, item.value)
          const relativeHeight = safeValue <= 0 ? 10 : Math.max(34, Math.round((safeValue / maxValue) * 100))
          const height = useRelativeHeights
            ? `${relativeHeight}%`
            : `${Math.max(minBarHeight, Math.round((safeValue / maxValue) * maxBarHeight))}px`
          const isActive = hoveredIndex === index
          const toneClass = item.dashed && showDashedCurrent
            ? 'border border-dashed border-foreground/55 bg-foreground/10'
            : item.toneClass || 'bg-foreground/55'
          return (
            <div key={item.key} className={hideLabels ? 'relative z-[1] flex h-full min-h-0 w-full items-end' : cn(dashboardTileStyles.barWrapper, 'relative z-[1]')}>
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
                      barTriggerClassName,
                      dashboardTileStyles.barFocusRing,
                    )}
                    aria-label={item.ariaLabel}
                  >
                    <div
                      className={cn(
                        dashboardTileStyles.barShape,
                        'relative',
                        toneClass,
                        isActive && !item.dashed && 'bg-[hsl(var(--tone-positive-700))]',
                      )}
                      style={{ height }}
                    >
                      {isActive ? (
                        <div className={cn(dashboardTileStyles.valuePill, 'top-auto bottom-[calc(100%+0.35rem)]')}>
                          {item.valueText || formatInt(safeValue)}
                        </div>
                      ) : null}
                    </div>
                  </button>
                </TooltipTrigger>
                {showTooltip ? (
                  <TooltipContent side="top" className="px-2 py-1 text-caption leading-snug">
                    {item.tooltip}
                  </TooltipContent>
                ) : null}
              </Tooltip>
              {hideLabels ? null : <span className="text-caption text-muted-foreground">{item.label}</span>}
            </div>
          )
        })}
        {meanLinePercent !== null ? (
          <div
            className="pointer-events-none absolute inset-x-0 z-0 border-t border-dashed border-[hsl(var(--tone-neutral-300))]/70"
            style={{ top: `${100 - meanLinePercent}%` }}
            aria-hidden="true"
          />
        ) : null}
        {showAxisLabels ? (
          <div className="pointer-events-none absolute inset-x-0 bottom-[-0.2rem] z-[2] grid grid-flow-col auto-cols-fr items-end px-[1px]">
            {items.map((item) => (
              <span
                key={`${item.key}-axis`}
                className={cn(
                  'text-center text-[0.56rem] font-semibold leading-none text-[hsl(var(--tone-neutral-500))]',
                  axisLabelClassName,
                )}
              >
                {item.label}
              </span>
            ))}
          </div>
        ) : null}
      </div>
    </TooltipProvider>
  )
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
        axisLabel: String(item.year),
        value: item.value,
        isYtd: false,
        relation,
      }
    }),
    {
      key: `year-${projectedYear}-ytd`,
      axisLabel: String(projectedYear),
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
              <p className="text-[0.56rem] font-semibold text-[hsl(var(--tone-neutral-600))]">{bar.axisLabel}</p>
              {bar.axisSubLabel ? (
                <p className="mt-[1px] text-[0.5rem] font-semibold uppercase tracking-[0.05em] text-[hsl(var(--tone-neutral-600))]">
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
            className="mt-2 text-[2.15rem] font-semibold leading-[0.96] tracking-tight text-foreground"
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

function HIndexYearChart({ tile }: { tile: PublicationMetricTilePayload }) {
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
  const chartItems: MetricBarDatum[] = bars.map((bar, index) => ({
    key: `${bar.year}-${index}`,
    label: String(bar.year).slice(-2),
    value: bar.value,
    dashed: bar.current,
    toneClass: bar.current ? undefined : 'bg-foreground/55',
    valueText: `h ${formatInt(bar.value)}`,
    ariaLabel: `${bar.current ? 'Current ' : ''}h-index ${formatInt(bar.value)} in ${bar.year}`,
    tooltip: (
      <div className="space-y-0.5">
        <p>{bar.current ? 'Current year' : 'Year'}: {bar.year}</p>
        <p>h-index: {formatInt(bar.value)}</p>
      </div>
    ),
  }))

  return (
    <div className="space-y-1">
      <MetricBarsChart items={chartItems} emptyLabel="No h-index timeline" />
      <p className={dashboardTileStyles.tileMicroLabel}>h-index by year; dashed bar is current year.</p>
    </div>
  )
}

function PublicationsPerYearChart({ tile }: { tile: PublicationMetricTilePayload }) {
  const chartData = (tile.chart_data || {}) as Record<string, unknown>
  const years = toNumberArray(chartData.years).map((item) => Math.round(item))
  const values = toNumberArray(chartData.values).map((item) => Math.max(0, item))
  if (!years.length || !values.length || years.length !== values.length) {
    return <div className={dashboardTileStyles.emptyChart}>No publication timeline</div>
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
  const chartItems: MetricBarDatum[] = historyBars.map((bar, index) => ({
    key: `${bar.year}-${index}`,
    label: String(bar.year).slice(-2),
    value: bar.value,
    dashed: bar.current,
    toneClass: bar.current
      ? undefined
      : bar.relative === 'above'
        ? 'bg-[hsl(var(--tone-positive-600))]'
        : bar.relative === 'below'
          ? 'bg-[hsl(var(--tone-warning-500))]'
          : 'bg-[hsl(var(--tone-accent-500))]',
    valueText: formatInt(bar.value),
    ariaLabel: `${bar.current ? 'Current ' : ''}publications ${formatInt(bar.value)} in ${bar.year}`,
    tooltip: (
      <div className="space-y-0.5">
        <p>{bar.current ? 'Current year (YTD)' : 'Year'}: {bar.year}</p>
        <p>Publications: {formatInt(bar.value)}</p>
      </div>
    ),
  }))
  return (
    <div className="space-y-1">
      <MetricBarsChart items={chartItems} emptyLabel="No publication timeline" />
      <p className={dashboardTileStyles.tileMicroLabel}>
        Dashed bar is current year to date.
      </p>
    </div>
  )
}

type ImpactStackedSegment = {
  key: string
  widthPct: number
  label: string
  valueText: string
  toneClass: string
  tooltip: ReactNode
}

function ImpactStackedRow({
  rowLabel,
  segments,
}: {
  rowLabel: string
  segments: ImpactStackedSegment[]
}) {
  const [hoveredSegment, setHoveredSegment] = useState<string | null>(null)
  const hasSegments = segments.some((segment) => segment.widthPct > 0)
  if (!hasSegments) {
    return (
      <div className="space-y-1">
        <p className={dashboardTileStyles.tileMicroLabel}>{rowLabel}</p>
        <div className="h-8 rounded-md border border-dashed border-border/70 bg-muted/25" />
      </div>
    )
  }
  return (
    <div className="space-y-1">
      <p className={dashboardTileStyles.tileMicroLabel}>{rowLabel}</p>
      <div className="flex h-8 overflow-hidden rounded-md border border-border/70 bg-muted/25">
        {segments
          .filter((segment) => segment.widthPct > 0)
          .map((segment) => {
            const isActive = hoveredSegment === segment.key
            return (
              <Tooltip key={segment.key}>
                <TooltipTrigger asChild>
                  <button
                    type="button"
                    data-stop-tile-open="true"
                    tabIndex={dashboardTileBarTabIndex}
                    onMouseEnter={() => setHoveredSegment(segment.key)}
                    onMouseLeave={() => setHoveredSegment((current) => (current === segment.key ? null : current))}
                    onFocus={() => setHoveredSegment(segment.key)}
                    onBlur={() => setHoveredSegment((current) => (current === segment.key ? null : current))}
                    onClick={(event) => event.stopPropagation()}
                    onMouseDown={(event) => event.stopPropagation()}
                    style={{ width: `${segment.widthPct}%` }}
                    className={cn(
                      'relative h-full min-w-5',
                      dashboardTileStyles.barFocusRing,
                    )}
                    aria-label={`${segment.label} ${segment.valueText}`}
                  >
                    {isActive ? (
                      <div className={dashboardTileStyles.valuePill}>{segment.valueText}</div>
                    ) : null}
                    <span
                      className={cn(
                        'block h-full w-full origin-bottom transition-transform duration-150 group-hover/tile:scale-[1.03]',
                        segment.toneClass,
                      )}
                    />
                  </button>
                </TooltipTrigger>
                <TooltipContent side="top" className="px-2 py-1 text-caption leading-snug">
                  {segment.tooltip}
                </TooltipContent>
              </Tooltip>
            )
          })}
      </div>
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
  const uncitedPct = Number.isFinite(uncitedPctRaw) ? Math.max(0, Math.min(100, Math.round(uncitedPctRaw))) : 0
  const citedPct = Math.max(0, 100 - uncitedPct)
  const rawTopShares = toNumberArray(
    chartData.top_3_paper_shares_pct || chartData.top3_paper_shares_pct || chartData.top_3_paper_shares,
  )
  const topShares = rawTopShares
    .slice(0, 3)
    .map((item) => (item <= 1 ? item * 100 : item))
    .map((item) => `${Math.max(0, item).toFixed(1)}%`)

  return (
    <TooltipProvider delayDuration={90}>
      <div className="space-y-2">
        <p className={dashboardTileStyles.tileMicroLabel}>Lifetime citation distribution</p>
        <ImpactStackedRow
          rowLabel="Top 3 papers vs rest"
          segments={[
            {
              key: 'top3',
              widthPct: top3PctRounded,
              label: 'Top 3 papers',
              valueText: `${top3PctRounded}%`,
              toneClass: 'bg-[hsl(var(--tone-accent-700))]',
              tooltip: (
                <div className="space-y-0.5">
                  <p>Top 3 papers: {top3PctRounded}% ({formatInt(top3)} citations)</p>
                  <p>
                    {topShares.length
                      ? `Top paper shares: ${topShares.join(', ')}`
                      : 'Top-paper share details not available'}
                  </p>
                </div>
              ),
            },
            {
              key: 'rest',
              widthPct: restPctRounded,
              label: 'Rest of portfolio',
              valueText: `${restPctRounded}%`,
              toneClass: 'bg-[hsl(var(--tone-accent-300))]',
              tooltip: (
                <div className="space-y-0.5">
                  <p>Rest of portfolio: {restPctRounded}% ({formatInt(rest)} citations)</p>
                  <p>Total lifetime citations: {formatInt(total)}</p>
                </div>
              ),
            },
          ]}
        />
        <ImpactStackedRow
          rowLabel="Cited vs uncited papers"
          segments={[
            {
              key: 'uncited',
              widthPct: uncitedPct,
              label: 'Uncited publications',
              valueText: `${uncitedPct}%`,
              toneClass: 'bg-[hsl(var(--tone-warning-400))]',
              tooltip: (
                <div className="space-y-0.5">
                  <p>Uncited: {uncitedPct}% ({formatInt(uncitedCount)} works)</p>
                </div>
              ),
            },
            {
              key: 'cited',
              widthPct: citedPct,
              label: 'Cited publications',
              valueText: `${citedPct}%`,
              toneClass: 'bg-[hsl(var(--tone-positive-500))]',
              tooltip: (
                <div className="space-y-0.5">
                  <p>Cited: {citedPct}% of portfolio</p>
                </div>
              ),
            },
          ]}
        />
      </div>
    </TooltipProvider>
  )
}

function MomentumTilePanel({ tile }: { tile: PublicationMetricTilePayload }) {
  const breakdown = buildMomentumBreakdown(tile)
  const summaryLift = breakdown.liftPct !== null ? formatSignedPercentCompact(breakdown.liftPct) : 'New'
  const monthlyBaseline = breakdown.rate9m !== null && breakdown.rate9m > 1e-6 ? breakdown.rate9m : null
  const highlightStart = Math.max(0, breakdown.bars.length - 3)
  const chartItems: MetricBarDatum[] = breakdown.bars.map((bar, index) => {
    const baselineDelta = monthlyBaseline === null ? null : ((bar.value - monthlyBaseline) / monthlyBaseline) * 100
    const baselineText = baselineDelta === null ? 'n/a' : formatSignedPercentCompact(baselineDelta)
    return {
      key: `${bar.label}-${index}`,
      label: bar.label,
      value: bar.value,
      toneClass: index >= highlightStart ? 'bg-[hsl(var(--tone-positive-600))]' : 'bg-[hsl(var(--tone-accent-400))]',
      valueText: formatInt(bar.value),
      ariaLabel: `${bar.label}: ${formatInt(bar.value)} citations, ${baselineText} vs baseline`,
      tooltip: (
        <div className="space-y-0.5">
          <p>{bar.label}: {formatInt(bar.value)} citations</p>
          <p>% vs baseline: {baselineText}</p>
          <p>
            3m total {breakdown.recent3Total === null ? 'n/a' : formatInt(breakdown.recent3Total)} | 9m total {breakdown.baseline9Total === null ? 'n/a' : formatInt(breakdown.baseline9Total)}
          </p>
          <p>rate_3m {formatRate(breakdown.rate3m)} | rate_9m {formatRate(breakdown.rate9m)} | lift {summaryLift}</p>
        </div>
      ),
    }
  })
  return (
    <div className={dashboardTileStyles.chartSplit}>
      <div className={dashboardTileStyles.chartColumn}>
        <p className={dashboardTileStyles.tileMicroLabel}>Calculated vs trailing 9-month baseline</p>
        <p className={cn(dashboardTileStyles.tileMicroLabel, 'mt-1')}>
          {breakdown.insufficientBaseline
            ? 'Insufficient baseline'
            : `3m total ${breakdown.recent3Total === null ? 'n/a' : formatInt(breakdown.recent3Total)}, 9m total ${breakdown.baseline9Total === null ? 'n/a' : formatInt(breakdown.baseline9Total)}`}
        </p>
      </div>
      <div className={dashboardTileStyles.chartPanel}>
        <MetricBarsChart items={chartItems} emptyLabel="No monthly citation data" />
      </div>
    </div>
  )
}

function HIndexTrajectoryPanel({ tile }: { tile: PublicationMetricTilePayload }) {
  const chartData = (tile.chart_data || {}) as Record<string, unknown>
  const hGapText = String(chartData.gap_text || '').trim()
  const hNextTargetRaw = Number(chartData.next_h_index)
  const hNextTarget = Number.isFinite(hNextTargetRaw) ? Math.round(hNextTargetRaw) : null
  const hProgressRaw = Number(chartData.progress_to_next_pct)
  const hProgressPct = Number.isFinite(hProgressRaw) ? Math.max(0, Math.min(100, hProgressRaw)) : 0
  const hCandidateGaps = toNumberArray(chartData.candidate_gaps)
    .map((item) => Math.round(item))
    .filter((item) => item > 0)
    .slice(0, 3)
  return (
    <div className={dashboardTileStyles.chartSplit}>
      <div className={dashboardTileStyles.chartColumn}>
        <p className={dashboardTileStyles.tileMicroLabel}>
          {hNextTarget !== null ? `${Math.round(hProgressPct)}% to h=${hNextTarget}` : `${Math.round(hProgressPct)}% to next h`}
        </p>
        <div className="relative mt-1">
          <div className="h-1.5 overflow-hidden rounded-full bg-[hsl(var(--tone-neutral-200))]">
            <div className="h-full rounded-full bg-[hsl(var(--tone-positive-600))]" style={{ width: `${hProgressPct}%` }} />
          </div>
          <div className="pointer-events-none absolute right-0 top-1/2 h-4 -translate-y-1/2 border-l border-dashed border-[hsl(var(--tone-neutral-400))]" />
        </div>
        <p className={cn(dashboardTileStyles.tileMicroLabel, 'mt-1')}>
          Next threshold {hNextTarget !== null ? `h=${hNextTarget}` : 'not available'}
        </p>
        <div className="mt-2 min-h-sz-22">
          {hCandidateGaps.length > 0 ? (
            <div className="flex flex-wrap items-center gap-1">
              <span className={dashboardTileStyles.tileMicroLabel}>Nearest papers need:</span>
              {hCandidateGaps.map((gap, index) => (
                <span
                  key={`${gap}-${index}`}
                  className={cn(
                    dashboardTileStyles.tagPill,
                    dashboardTileStyles.tagNeutral,
                    'h-5 px-2',
                  )}
                >
                  +{gap}
                </span>
              ))}
            </div>
          ) : (
            <p className={dashboardTileStyles.tileMicroLabel}>{hGapText || '\u2014'}</p>
          )}
        </div>
      </div>
      <div className={dashboardTileStyles.chartPanel}>
        <HIndexYearChart tile={tile} />
      </div>
    </div>
  )
}

function InfluentialTrendPanel({ tile }: { tile: PublicationMetricTilePayload }) {
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null)
  const chartData = (tile.chart_data || {}) as Record<string, unknown>
  const primarySeries = toNumberArray(chartData.values).map((item) => Math.max(0, item))
  const fallbackSeries = toNumberArray(tile.sparkline || []).map((item) => Math.max(0, item))
  const values = primarySeries.length ? primarySeries : fallbackSeries
  const overlaySeries = toNumberArray(tile.sparkline_overlay || []).map((item) => Math.max(0, item))
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
  const overlayPoints = overlaySeries.length
    ? buildLinePoints(overlaySeries, width, height, normalizeSeriesLabels([], overlaySeries.length, 'W'), 8)
    : []
  const path = smoothPathFromPoints(points)
  const areaPath = areaPathFromPoints(points, height, 8)
  const overlayPath = overlayPoints.length ? smoothPathFromPoints(overlayPoints) : ''

  return (
    <div className="relative h-24 rounded-md border border-[hsl(var(--tone-accent-200))] bg-background p-2">
      <svg viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none" className="h-full w-full">
        <path d={areaPath} className="fill-[hsl(var(--tone-accent-100))]" />
        {overlayPath ? (
          <path
            d={overlayPath}
            fill="none"
            className="stroke-[hsl(var(--tone-accent-400))]"
            strokeWidth="2.25"
            strokeDasharray="4 3"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        ) : null}
        <path
          d={path}
          fill="none"
          className="stroke-[hsl(var(--tone-accent-700))]"
          strokeWidth="3.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
      <TooltipProvider delayDuration={90}>
        {points.map((point, index) => {
          const previous = index > 0 ? values[index - 1] : null
          const delta = previous === null ? null : point.value - previous
          return (
            <Tooltip key={`${point.label}-${index}`}>
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
                    'absolute h-6 w-6 -translate-x-1/2 -translate-y-1/2 rounded-full',
                    dashboardTileStyles.barFocusRing,
                  )}
                  style={{
                    left: `${(point.x / width) * 100}%`,
                    top: `${(point.y / height) * 100}%`,
                  }}
                  aria-label={`${point.label}: ${formatInt(point.value)} influential citations`}
                >
                  {hoveredIndex === index ? (
                    <span className={dashboardTileStyles.valuePill}>{formatInt(point.value)}</span>
                  ) : null}
                  <span className="pointer-events-none absolute left-1/2 top-1/2 h-2.5 w-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full border border-background bg-[hsl(var(--tone-accent-700))]" />
                </button>
              </TooltipTrigger>
              <TooltipContent side="top" className="px-2 py-1 text-caption leading-snug">
                <p>{point.label}: {formatInt(point.value)} influential citations</p>
                <p>Delta vs prior window: {delta === null ? 'n/a' : formatSignedInt(delta)}</p>
              </TooltipContent>
            </Tooltip>
          )
        })}
      </TooltipProvider>
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

function badgeTone(tile: PublicationMetricTilePayload): 'positive' | 'neutral' | 'caution' | 'negative' {
  const severity = String((tile.badge?.severity as string) || tile.delta_tone || 'neutral').toLowerCase()
  if (severity === 'positive') {
    return 'positive'
  }
  if (severity === 'caution') {
    return 'caution'
  }
  if (severity === 'negative') {
    return 'negative'
  }
  return 'neutral'
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

  const tiles = useMemo(() => metrics?.tiles ?? [], [metrics?.tiles])
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
        <CardContent className="space-y-2 p-3">
          <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
            <div className="flex flex-wrap items-center gap-2">
              <span>Data last refreshed: {formatRefreshedAt(metrics?.data_last_refreshed || metrics?.computed_at)}</span>
              {metrics?.is_updating ? <span className="text-amber-700">Updating...</span> : null}
              {metrics?.status === 'FAILED' ? <span className="text-amber-700">Last update failed</span> : null}
            </div>
            <span>Data sources: {(metrics?.data_sources || []).join(', ') || 'Not available'}</span>
          </div>

          {loading && tiles.length === 0 ? (
            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3 lg:gap-3">
              {Array.from({ length: 6 }).map((_, index) => (
                <div key={index} className="h-32 rounded-md border border-[hsl(var(--tone-neutral-200))] bg-[hsl(var(--tone-neutral-50))]" />
              ))}
            </div>
          ) : (
            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3 lg:gap-3">
              {tiles.map((tile) => {
                const badgeLabel = String((tile.badge?.label as string) || '').trim()
                const subtitle = String(tile.subtext || '').trim()
                const rawDeltaDisplay = String(tile.delta_display || '').trim()
                const shouldHideLegacyTrendText =
                  tile.key === 'total_citations' && /(falling|rising|stable over)/i.test(rawDeltaDisplay)
                const effectiveDeltaDisplay = shouldHideLegacyTrendText ? '' : rawDeltaDisplay
                const sourceText = metricDataSources(tile)
                const updateText = String((tile.tooltip_details?.update_frequency as string) || 'Daily')
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
                const resolvedTagTone = badgeTone(tile)
                const tileValueSource = tile.main_value ?? tile.value
                const tileValueNumberRaw = typeof tileValueSource === 'number' ? tileValueSource : Number.NaN
                const mainValueDisplay = tile.key === 'impact_concentration' && Number.isFinite(tileValueNumberRaw)
                  ? `${Math.round(tileValueNumberRaw)}%`
                  : tile.value_display || '\u2014'
                const momentumBreakdown = tile.key === 'momentum' ? buildMomentumBreakdown(tile) : null
                const momentumPrimary = momentumBreakdown
                  ? momentumBreakdown.liftPct !== null
                    ? formatSignedPercentCompact(momentumBreakdown.liftPct)
                    : momentumBreakdown.insufficientBaseline
                      ? 'New'
                      : '\u2014'
                  : '\u2014'
                const momentumSecondary = momentumBreakdown?.insufficientBaseline
                  ? 'Insufficient baseline'
                  : 'Calculated vs trailing 9-month baseline'
                const footerDelta = effectiveDeltaDisplay || '\u2014'
                const footerNode = (
                  <p
                    className={cn(
                      dashboardTileStyles.tileFooterText,
                      effectiveDeltaDisplay && deltaTextClass(tile),
                      tile.stability === 'unstable' && effectiveDeltaDisplay && 'font-medium',
                    )}
                  >
                    {footerDelta}
                  </p>
                )

                let primaryValue: ReactNode = mainValueDisplay
                let secondaryText: ReactNode = subtitle || '\u2014'
                const showSecondary = true
                let visual: ReactNode = (
                  <div className={dashboardTileStyles.tileVisualWrap}>
                    <MiniChart tile={tile} />
                  </div>
                )
                let footerText: ReactNode | undefined = footerNode
                let tagLabel: string | undefined = badgeLabel || undefined
                let titleClassName: string | undefined
                let tileClassName: string | undefined
                const showFooter = true
                const tileTagTone: 'positive' | 'neutral' | 'caution' | 'negative' | undefined = resolvedTagTone

                if (tile.key === 'this_year_vs_last') {
                  primaryValue = tile.value_display || mainValueDisplay
                  secondaryText = subtitle || 'Publications per year'
                  visual = (
                    <div className={dashboardTileStyles.tileVisualWrap}>
                      <PublicationsPerYearChart tile={tile} />
                    </div>
                  )
                  tagLabel = undefined
                } else if (tile.key === 'momentum') {
                  primaryValue = momentumPrimary
                  secondaryText = momentumSecondary
                  visual = (
                    <div className={dashboardTileStyles.tileVisualWrap}>
                      <MomentumTilePanel tile={tile} />
                    </div>
                  )
                  footerText = undefined
                } else if (tile.key === 'h_index_projection') {
                  primaryValue = mainValueDisplay
                  secondaryText = subtitle || 'h-index trajectory'
                  visual = (
                    <div className={dashboardTileStyles.tileVisualWrap}>
                      <HIndexTrajectoryPanel tile={tile} />
                    </div>
                  )
                  tagLabel = undefined
                } else if (tile.key === 'impact_concentration') {
                  primaryValue = mainValueDisplay
                  secondaryText = subtitle || 'Lifetime citation distribution'
                  visual = (
                    <div className={dashboardTileStyles.tileVisualWrap}>
                      <ImpactConcentrationPanel tile={tile} />
                    </div>
                  )
                } else if (tile.key === 'influential_citations') {
                  primaryValue = mainValueDisplay
                  secondaryText = subtitle || 'Influential citation trend'
                  visual = (
                    <div className={dashboardTileStyles.tileVisualWrap}>
                      <InfluentialTrendPanel tile={tile} />
                    </div>
                  )
                }

                return (
                  <MetricTile
                    key={tile.key}
                    tile={tile}
                    titleClassName={titleClassName}
                    tileClassName={tileClassName}
                    showSecondary={showSecondary}
                    showFooter={showFooter}
                    onOpen={() => {
                      void onSelectTile(tile)
                    }}
                    shouldIgnoreTileOpen={shouldIgnoreTileOpen}
                    sourceText={sourceText}
                    updateText={updateText}
                    primaryValue={primaryValue}
                    secondaryText={secondaryText}
                    visual={visual}
                    footerText={footerText}
                    tagLabel={tagLabel}
                    tagTone={tileTagTone}
                  />
                )
              })}
            </div>
          )}
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









