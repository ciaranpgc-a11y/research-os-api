import { useMemo, useState } from 'react'
import { Info } from 'lucide-react'

import { Card, CardContent } from '@/components/ui/card'
import { Sheet, SheetContent } from '@/components/ui/sheet'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import { cn } from '@/lib/utils'
import type { PublicationMetricTilePayload, PublicationsTopMetricsPayload } from '@/types/impact'

type PublicationsTopStripProps = {
  metrics: PublicationsTopMetricsPayload | null
  loading?: boolean
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

function Sparkline({ values }: { values: number[] }) {
  if (!values.length) {
    return <div className="h-7 rounded bg-muted/70" />
  }
  const max = Math.max(...values)
  const min = Math.min(...values)
  const range = Math.max(1e-6, max - min)
  const points = values
    .map((value, index) => {
      const x = (index / Math.max(1, values.length - 1)) * 100
      const y = 100 - ((value - min) / range) * 100
      return `${x},${y}`
    })
    .join(' ')
  return (
    <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="h-7 w-full">
      <polyline
        fill="none"
        stroke="currentColor"
        strokeWidth="3"
        strokeLinecap="round"
        strokeLinejoin="round"
        points={points}
        className="text-slate-600"
      />
    </svg>
  )
}

function metricSummary(tile: PublicationMetricTilePayload, publication: Record<string, unknown>): string {
  const key = tile.key
  if (key === 'total_citations_lifetime' || key === 'h_index_m_index') {
    return `Citations: ${Number(publication.citations_lifetime || 0)}`
  }
  if (key === 'citations_last_12m' || key === 'yoy_change') {
    const value = Number(publication.citations_last_12m || 0)
    const prev = Number(publication.citations_prev_12m || 0)
    const delta = value - prev
    return `Last 12m: ${value} (${delta >= 0 ? '+' : ''}${delta})`
  }
  if (key === 'citation_momentum') {
    return `Momentum: ${Number(publication.momentum_contribution || 0).toFixed(2)}`
  }
  if (key === 'citation_concentration_risk') {
    return `Share: ${Number(publication.share_of_total_pct || 0).toFixed(2)}%`
  }
  if (key === 'influence_weighted_citations') {
    return `Influential citations: ${Number(publication.influential_citations || 0)}`
  }
  if (key === 'field_normalized_impact') {
    return `Field-normalized impact: ${Number(publication.field_normalized_impact || 0).toFixed(3)}`
  }
  return ''
}

export function PublicationsTopStrip({ metrics, loading = false }: PublicationsTopStripProps) {
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [activeTileKey, setActiveTileKey] = useState<string>('')

  const tiles = metrics?.tiles || []
  const activeTile = useMemo(
    () => tiles.find((tile) => tile.key === activeTileKey) || null,
    [activeTileKey, tiles],
  )

  const onSelectTile = (tile: PublicationMetricTilePayload) => {
    setActiveTileKey(tile.key)
    setDrawerOpen(true)
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
            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
              {Array.from({ length: 6 }).map((_, index) => (
                <div key={index} className="h-24 rounded border border-border bg-muted/40" />
              ))}
            </div>
          ) : (
            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
              {tiles.map((tile) => (
                <button
                  key={tile.key}
                  type="button"
                  onClick={() => onSelectTile(tile)}
                  className={cn(
                    'rounded border border-border px-3 py-2 text-left transition-colors hover:bg-muted/30',
                    tile.stability === 'unstable' && 'border-amber-300/70 bg-amber-50/40',
                  )}
                >
                  <div className="mb-1 flex items-center justify-between gap-2">
                    <p className="text-xs text-muted-foreground">{tile.label}</p>
                    <TooltipProvider delayDuration={120}>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <span className="inline-flex h-4 w-4 items-center justify-center text-muted-foreground">
                            <Info className="h-3.5 w-3.5" />
                          </span>
                        </TooltipTrigger>
                        <TooltipContent side="top" className="max-w-[280px] leading-relaxed">
                          <p>{tile.tooltip}</p>
                          <p className="mt-1 text-[11px] text-muted-foreground">
                            Source: {(tile.data_source || []).join(', ') || 'Not available'}
                          </p>
                        </TooltipContent>
                      </Tooltip>
                    </TooltipProvider>
                  </div>
                  <p className="text-lg font-semibold leading-tight">{tile.value_display}</p>
                  {tile.delta_display ? (
                    <p className={cn('mt-0.5 text-xs text-muted-foreground', tile.stability === 'unstable' && 'text-amber-700')}>
                      {tile.delta_display}
                    </p>
                  ) : (
                    <p className="mt-0.5 text-xs text-muted-foreground">&nbsp;</p>
                  )}
                  <div className="mt-1.5">
                    <Sparkline values={tile.sparkline || []} />
                  </div>
                </button>
              ))}
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
              </div>

              <div className="space-y-2">
                <p className="text-sm font-medium">Underlying publications</p>
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
