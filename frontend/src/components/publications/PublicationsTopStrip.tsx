import { useMemo, useState } from 'react'
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

function Sparkline({
  values,
  overlay = [],
  colorCode = '#475569',
}: {
  values: number[]
  overlay?: number[]
  colorCode?: string
}) {
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
    <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="h-7 w-full">
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
                            Source: {metricDataSources(tile)}
                          </p>
                          <p className="mt-1 text-[11px] text-muted-foreground">
                            Update: {String((tile.tooltip_details?.update_frequency as string) || 'Daily')}
                          </p>
                        </TooltipContent>
                      </Tooltip>
                    </TooltipProvider>
                  </div>
                  <p className="text-lg font-semibold leading-tight">{tile.value_display}</p>
                  {tile.delta_display ? (
                    <p
                      className={cn(
                        'mt-0.5 text-xs',
                        deltaTextClass(tile),
                        tile.stability === 'unstable' && 'font-medium',
                      )}
                    >
                      {tile.delta_display}
                    </p>
                  ) : (
                    <p className="mt-0.5 text-xs text-muted-foreground">&nbsp;</p>
                  )}
                  <div className="mt-1.5">
                    <Sparkline
                      values={tile.sparkline || []}
                      overlay={tile.sparkline_overlay || []}
                      colorCode={tile.delta_color_code || '#475569'}
                    />
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
