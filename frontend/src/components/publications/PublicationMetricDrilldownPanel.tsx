import { useEffect, useMemo, useState } from 'react'

import { Button } from '@/components/ui'
import { cn } from '@/lib/utils'
import type { PublicationMetricTilePayload } from '@/types/impact'

type DrilldownTab = 'summary' | 'breakdown' | 'trajectory' | 'context' | 'methods'

type WindowRow = {
  windowId: string
  label: string
  startDate: string
  endDate: string
  isDefault: boolean
}

type HeadlineMetricRow = {
  metricId: string
  label: string
  valueDisplay: string
  windowId: string
}

type SeriesPointRow = {
  label: string
  periodStart: string
  periodEnd: string
  value: number
}

type SeriesRow = {
  seriesId: string
  label: string
  windowId: string
  points: SeriesPointRow[]
}

type BreakdownRow = {
  breakdownId: string
  label: string
  items: Array<{ key: string; label: string; value: number; sharePct: string }>
}

type BenchmarkRow = {
  benchmarkId: string
  label: string
  valueDisplay: string
  context: string
}

type QcFlagRow = {
  code: string
  message: string
  severity: 'info' | 'warning' | 'error'
}

function toSafeString(value: unknown, fallback = ''): string {
  const clean = String(value || '').trim()
  return clean || fallback
}

function toSafeNumber(value: unknown): number {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : 0
}

function parseWindows(tile: PublicationMetricTilePayload): WindowRow[] {
  const raw = Array.isArray(tile.drilldown?.windows) ? tile.drilldown.windows : []
  const rows = raw
    .map((item) => {
      const row = (item || {}) as Record<string, unknown>
      const windowId = toSafeString(row.window_id || row.windowId)
      const label = toSafeString(row.label, windowId || 'Window')
      const startDate = toSafeString(row.start_date || row.startDate)
      const endDate = toSafeString(row.end_date || row.endDate)
      if (!windowId || !startDate || !endDate) {
        return null
      }
      return {
        windowId,
        label,
        startDate,
        endDate,
        isDefault: Boolean(row.is_default ?? row.isDefault),
      }
    })
    .filter((item): item is WindowRow => Boolean(item))
  if (rows.length) {
    return rows
  }
  return [
    {
      windowId: 'lifetime',
      label: 'Lifetime',
      startDate: '',
      endDate: toSafeString(tile.drilldown?.as_of_date || ''),
      isDefault: true,
    },
  ]
}

function parseHeadlineMetrics(tile: PublicationMetricTilePayload, fallbackWindowId: string): HeadlineMetricRow[] {
  const raw = Array.isArray(tile.drilldown?.headline_metrics) ? tile.drilldown.headline_metrics : []
  const rows = raw
    .map((item, index) => {
      const row = (item || {}) as Record<string, unknown>
      const label = toSafeString(row.label)
      if (!label) {
        return null
      }
      const valueDisplay = toSafeString(row.value_display || row.valueDisplay || row.value, 'Not available')
      return {
        metricId: toSafeString(row.metric_id || row.metricId || `metric-${index}`),
        label,
        valueDisplay,
        windowId: toSafeString(row.window_id || row.windowId || fallbackWindowId, fallbackWindowId),
      }
    })
    .filter((item): item is HeadlineMetricRow => Boolean(item))
  if (rows.length) {
    return rows.slice(0, 6)
  }
  return [
    {
      metricId: 'primary',
      label: tile.label,
      valueDisplay: toSafeString(tile.main_value_display || tile.value_display, 'Not available'),
      windowId: fallbackWindowId,
    },
  ]
}

function parseSeries(tile: PublicationMetricTilePayload): SeriesRow[] {
  const raw = Array.isArray(tile.drilldown?.series) ? tile.drilldown.series : []
  return raw
    .map((item, seriesIndex) => {
      const row = (item || {}) as Record<string, unknown>
      const rawPoints = Array.isArray(row.points) ? row.points : []
      const points = rawPoints
        .map((point) => {
          const pointRow = (point || {}) as Record<string, unknown>
          const periodStart = toSafeString(pointRow.period_start || pointRow.periodStart)
          const periodEnd = toSafeString(pointRow.period_end || pointRow.periodEnd || periodStart)
          return {
            label: toSafeString(pointRow.label, 'Point'),
            periodStart,
            periodEnd,
            value: toSafeNumber(pointRow.value),
          }
        })
        .filter((point) => point.label)
      if (!points.length) {
        return null
      }
      return {
        seriesId: toSafeString(row.series_id || row.seriesId || `series-${seriesIndex}`),
        label: toSafeString(row.label || `Series ${seriesIndex + 1}`),
        windowId: toSafeString(row.window_id || row.windowId || ''),
        points,
      }
    })
    .filter((row): row is SeriesRow => Boolean(row))
}

function parseBreakdowns(tile: PublicationMetricTilePayload): BreakdownRow[] {
  const raw = Array.isArray(tile.drilldown?.breakdowns) ? tile.drilldown.breakdowns : []
  return raw
    .map((item, index) => {
      const row = (item || {}) as Record<string, unknown>
      const rawItems = Array.isArray(row.items) ? row.items : []
      const items = rawItems
        .map((entry, entryIndex) => {
          const itemRow = (entry || {}) as Record<string, unknown>
          const value = toSafeNumber(itemRow.value)
          const sharePctRaw = itemRow.share_pct ?? itemRow.sharePct
          const sharePct = Number.isFinite(Number(sharePctRaw)) ? `${Number(sharePctRaw).toFixed(1)}%` : ''
          return {
            key: toSafeString(itemRow.key || itemRow.label || `item-${entryIndex}`),
            label: toSafeString(itemRow.label || itemRow.key || `Item ${entryIndex + 1}`),
            value,
            sharePct,
          }
        })
        .sort((left, right) => right.value - left.value)
      if (!items.length) {
        return null
      }
      return {
        breakdownId: toSafeString(row.breakdown_id || row.breakdownId || `breakdown-${index}`),
        label: toSafeString(row.label || `Breakdown ${index + 1}`),
        items: items.slice(0, 12),
      }
    })
    .filter((row): row is BreakdownRow => Boolean(row))
}

function parseBenchmarks(tile: PublicationMetricTilePayload): BenchmarkRow[] {
  const raw = Array.isArray(tile.drilldown?.benchmarks) ? tile.drilldown.benchmarks : []
  return raw
    .map((item, index) => {
      const row = (item || {}) as Record<string, unknown>
      const label = toSafeString(row.label || `Benchmark ${index + 1}`)
      return {
        benchmarkId: toSafeString(row.benchmark_id || row.benchmarkId || `benchmark-${index}`),
        label,
        valueDisplay: toSafeString(row.value_display || row.valueDisplay || row.value, 'Not available'),
        context: toSafeString(row.context || ''),
      }
    })
}

function parseQcFlags(tile: PublicationMetricTilePayload): QcFlagRow[] {
  const raw = Array.isArray(tile.drilldown?.qc_flags) ? tile.drilldown.qc_flags : []
  return raw
    .map((item) => {
      const row = (item || {}) as Record<string, unknown>
      return {
        code: toSafeString(row.code, 'quality_flag'),
        message: toSafeString(row.message, 'Data quality note'),
        severity: (toSafeString(row.severity, 'info').toLowerCase() as 'info' | 'warning' | 'error'),
      }
    })
}

function windowLabel(windowMap: Map<string, WindowRow>, windowId: string): string {
  const row = windowMap.get(windowId)
  if (!row) {
    return ''
  }
  return row.startDate && row.endDate ? `${row.label} (${row.startDate} to ${row.endDate})` : row.label
}

export function PublicationMetricDrilldownPanel({
  tile,
  activeTab,
  onOpenPublication,
}: {
  tile: PublicationMetricTilePayload
  activeTab: DrilldownTab
  onOpenPublication?: (workId: string) => void
}) {
  const windows = useMemo(() => parseWindows(tile), [tile])
  const defaultWindow = useMemo(() => windows.find((row) => row.isDefault) || windows[0], [windows])
  const [selectedWindowId, setSelectedWindowId] = useState(defaultWindow?.windowId || '')

  useEffect(() => {
    setSelectedWindowId(defaultWindow?.windowId || '')
  }, [defaultWindow?.windowId, tile.key])

  const windowMap = useMemo(() => new Map(windows.map((row) => [row.windowId, row])), [windows])
  const headlineMetrics = useMemo(() => parseHeadlineMetrics(tile, selectedWindowId || defaultWindow.windowId), [tile, defaultWindow.windowId, selectedWindowId])
  const series = useMemo(() => parseSeries(tile), [tile])
  const breakdowns = useMemo(() => parseBreakdowns(tile), [tile])
  const benchmarks = useMemo(() => parseBenchmarks(tile), [tile])
  const qcFlags = useMemo(() => parseQcFlags(tile), [tile])
  const activeSeries = useMemo(() => {
    const scoped = series.filter((row) => !row.windowId || row.windowId === selectedWindowId)
    if (scoped.length) {
      return scoped[0]
    }
    return series[0] || null
  }, [selectedWindowId, series])

  const maxPointValue = useMemo(
    () => Math.max(1, ...(activeSeries?.points || []).map((point) => point.value)),
    [activeSeries?.points],
  )

  if (activeTab === 'summary') {
    return (
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <div className="inline-flex items-center gap-1 rounded-full border border-[hsl(var(--tone-neutral-300))] bg-[hsl(var(--tone-neutral-100))] px-2 py-1 text-caption font-semibold uppercase tracking-[0.06em] text-[hsl(var(--tone-neutral-700))]">
            Data quality
            <span className="rounded-full bg-[hsl(var(--tone-neutral-200))] px-1.5 py-0.5">{qcFlags.length}</span>
          </div>
          <Button type="button" variant="secondary" size="sm" disabled>
            Generate report
          </Button>
        </div>
        <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
          {headlineMetrics.map((metric) => (
            <div key={metric.metricId} className="rounded-md border border-[hsl(var(--tone-neutral-300))] bg-[hsl(var(--tone-neutral-50))] px-3 py-2">
              <p className="text-caption font-semibold uppercase tracking-[0.05em] text-[hsl(var(--tone-neutral-600))]">{metric.label}</p>
              <p className="mt-1 text-lg font-semibold text-[hsl(var(--tone-neutral-900))]">{metric.valueDisplay}</p>
              <p className="text-caption text-[hsl(var(--tone-neutral-600))]">{windowLabel(windowMap, metric.windowId)}</p>
            </div>
          ))}
        </div>
        <div className="rounded-md border border-[hsl(var(--tone-neutral-300))] bg-[hsl(var(--tone-neutral-50))] px-3 py-2 text-sm text-[hsl(var(--tone-neutral-700))]">
          <p><span className="font-semibold">Interpretation:</span> {toSafeString(tile.subtext, 'Trend interpretation unavailable.')}</p>
          <p className="mt-1"><span className="font-semibold">Change vs last period:</span> {toSafeString(tile.delta_display, 'No comparative delta reported.')}</p>
        </div>
      </div>
    )
  }

  if (activeTab === 'breakdown') {
    if (!breakdowns.length) {
      return <div className="rounded-md border border-dashed border-[hsl(var(--tone-neutral-300))] px-3 py-4 text-sm text-muted-foreground">No breakdown data available.</div>
    }
    return (
      <div className="space-y-3">
        {breakdowns.map((breakdown) => (
          <div key={breakdown.breakdownId} className="rounded-md border border-[hsl(var(--tone-neutral-300))]">
            <div className="border-b border-[hsl(var(--tone-neutral-300))] bg-[hsl(var(--tone-neutral-100))] px-3 py-2 text-sm font-semibold text-[hsl(var(--tone-neutral-800))]">{breakdown.label}</div>
            <div className="max-h-56 overflow-auto px-3 py-2">
              {breakdown.items.map((item) => (
                <div key={item.key} className="grid grid-cols-[minmax(0,1fr)_auto_auto] items-center gap-2 border-b border-[hsl(var(--tone-neutral-200))] py-1.5 last:border-b-0">
                  <button
                    type="button"
                    className={cn(
                      'truncate text-left text-sm text-[hsl(var(--tone-neutral-800))]',
                      onOpenPublication && breakdown.breakdownId === 'top_publications'
                        ? 'underline-offset-2 hover:underline'
                        : '',
                    )}
                    onClick={() => {
                      if (!onOpenPublication || breakdown.breakdownId !== 'top_publications') {
                        return
                      }
                      const workId = String(item.key || '').trim()
                      if (!workId) {
                        return
                      }
                      onOpenPublication(workId)
                    }}
                    disabled={!onOpenPublication || breakdown.breakdownId !== 'top_publications'}
                  >
                    {item.label}
                  </button>
                  <span className="text-sm font-semibold text-[hsl(var(--tone-neutral-900))]">{item.value.toLocaleString('en-GB')}</span>
                  <span className="text-caption text-[hsl(var(--tone-neutral-600))]">{item.sharePct || '-'}</span>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    )
  }

  if (activeTab === 'trajectory') {
    return (
      <div className="space-y-3">
        <div className="flex flex-wrap items-center gap-1.5">
          {windows.map((window) => (
            <button
              key={window.windowId}
              type="button"
              className={cn(
                'rounded-md border px-2 py-1 text-caption font-semibold uppercase tracking-[0.04em]',
                selectedWindowId === window.windowId
                  ? 'border-[hsl(var(--tone-accent-500))] bg-[hsl(var(--tone-accent-100))] text-[hsl(var(--tone-accent-800))]'
                  : 'border-[hsl(var(--tone-neutral-300))] bg-[hsl(var(--tone-neutral-100))] text-[hsl(var(--tone-neutral-700))]',
              )}
              onClick={() => setSelectedWindowId(window.windowId)}
            >
              {window.label}
            </button>
          ))}
        </div>
        {activeSeries ? (
          <div className="rounded-md border border-[hsl(var(--tone-neutral-300))] bg-[hsl(var(--tone-neutral-50))] px-3 py-2">
            <p className="text-sm font-semibold text-[hsl(var(--tone-neutral-800))]">{activeSeries.label}</p>
            <div className="mt-2 flex h-40 items-end gap-1">
              {activeSeries.points.map((point) => {
                const height = point.value <= 0 ? 4 : Math.max(8, (point.value / maxPointValue) * 100)
                return (
                  <div key={`${activeSeries.seriesId}-${point.label}`} className="flex min-w-0 flex-1 flex-col items-center gap-1">
                    <div
                      className="w-full rounded bg-[hsl(var(--tone-accent-500))]"
                      style={{ height: `${height}%` }}
                      title={`${point.label}: ${point.value.toLocaleString('en-GB')} (${point.periodStart || 'n/a'} to ${point.periodEnd || 'n/a'})`}
                    />
                    <p className="w-full truncate text-center text-caption text-[hsl(var(--tone-neutral-600))]">{point.label}</p>
                  </div>
                )
              })}
            </div>
          </div>
        ) : (
          <div className="rounded-md border border-dashed border-[hsl(var(--tone-neutral-300))] px-3 py-4 text-sm text-muted-foreground">No trajectory data available.</div>
        )}
      </div>
    )
  }

  if (activeTab === 'context') {
    if (!benchmarks.length) {
      return <div className="rounded-md border border-dashed border-[hsl(var(--tone-neutral-300))] px-3 py-4 text-sm text-muted-foreground">Context not available for this metric.</div>
    }
    return (
      <div className="space-y-2">
        {benchmarks.map((benchmark) => (
          <div key={benchmark.benchmarkId} className="rounded-md border border-[hsl(var(--tone-neutral-300))] bg-[hsl(var(--tone-neutral-50))] px-3 py-2">
            <p className="text-sm font-semibold text-[hsl(var(--tone-neutral-800))]">{benchmark.label}</p>
            <p className="text-lg font-semibold text-[hsl(var(--tone-neutral-900))]">{benchmark.valueDisplay}</p>
            {benchmark.context ? <p className="text-caption text-[hsl(var(--tone-neutral-600))]">{benchmark.context}</p> : null}
          </div>
        ))}
      </div>
    )
  }

  const methods = (tile.drilldown?.methods || {}) as Record<string, unknown>
  const methodSources = Array.isArray(methods.data_sources) ? methods.data_sources.map((item) => String(item || '').trim()).filter(Boolean) : []
  const methodCaveats = Array.isArray(methods.caveats) ? methods.caveats.map((item) => String(item || '').trim()).filter(Boolean) : []
  return (
    <div className="space-y-3">
      <div className="rounded-md border border-[hsl(var(--tone-neutral-300))] bg-[hsl(var(--tone-neutral-50))] px-3 py-2 text-sm text-[hsl(var(--tone-neutral-700))]">
        <p><span className="font-semibold">Definition:</span> {toSafeString(methods.definition || tile.drilldown?.definition, 'Not available')}</p>
        <p className="mt-1"><span className="font-semibold">Formula:</span> {toSafeString(methods.formula || tile.drilldown?.formula, 'Not available')}</p>
        <p className="mt-1"><span className="font-semibold">Sources:</span> {methodSources.length ? methodSources.join(', ') : 'Not available'}</p>
        <p className="mt-1"><span className="font-semibold">Refresh cadence:</span> {toSafeString(methods.refresh_cadence, 'Not available')}</p>
        <p className="mt-1"><span className="font-semibold">Last updated:</span> {toSafeString(methods.last_updated || tile.drilldown?.as_of_date, 'Not available')}</p>
      </div>
      {qcFlags.length ? (
        <div className="rounded-md border border-[hsl(var(--tone-warning-300))] bg-[hsl(var(--tone-warning-100))] px-3 py-2">
          <p className="text-sm font-semibold text-[hsl(var(--tone-warning-900))]">Data quality</p>
          <ul className="mt-1 space-y-1 text-sm text-[hsl(var(--tone-warning-900))]">
            {qcFlags.map((flag) => (
              <li key={flag.code}>{`${flag.code}: ${flag.message}`}</li>
            ))}
          </ul>
        </div>
      ) : null}
      {methodCaveats.length ? (
        <div className="rounded-md border border-[hsl(var(--tone-neutral-300))] bg-[hsl(var(--tone-neutral-100))] px-3 py-2 text-sm text-[hsl(var(--tone-neutral-700))]">
          <p className="font-semibold text-[hsl(var(--tone-neutral-800))]">Caveats</p>
          {methodCaveats.map((caveat) => (
            <p key={caveat} className="mt-1">{caveat}</p>
          ))}
        </div>
      ) : null}
    </div>
  )
}
