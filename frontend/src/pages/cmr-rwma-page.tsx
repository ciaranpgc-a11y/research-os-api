import { useCallback, useEffect, useMemo, useState } from 'react'

import rwmaPaths from '@/data/rwma-paths.json'
import {
  buildRwmaSummaryData,
  buildRwmaSummarySignature,
  generateRwmaSummary,
  RWMA_SEGMENT_META,
  RWMA_STATES,
  WMSI_SEVERITY_COLORS,
  type RwmaCode,
} from '@/lib/cmr-rwma-summary'
import { CMR_BULLSEYE_ROTATED_SEGMENT_MAX, CMR_BULLSEYE_ROTATION_TRANSFORM } from '@/lib/cmr-bullseye-geometry'
import { generateCmrRwmaProse } from '@/lib/cmr-summary-api'
import { cn } from '@/lib/utils'
import { SectionMarker } from '@/components/patterns'
import { PageHeader, Row, Stack } from '@/components/primitives'
import { useCmrCaseStore } from '@/store/use-cmr-case-store'

type ViewData = {
  viewBox: string
  paths: Record<string, string>
  outline?: string | string[]
}

const bullseye = rwmaPaths.bullseye as { viewBox: string; paths: Record<string, string> }
const bullseyePathEntries = Object.entries(bullseye.paths)
const views: Record<string, ViewData> = {
  '4CH': rwmaPaths['4CH'] as ViewData,
  '2CH': rwmaPaths['2CH'] as ViewData,
  '3CH': rwmaPaths['3CH'] as ViewData,
}

const OUTLINE_NUDGE: Record<string, [number, number]> = {
  '4CH': [-2, 3],
}

function createSegState(): Record<number, RwmaCode> {
  const next: Record<number, RwmaCode> = {}
  for (let i = 1; i <= 17; i += 1) next[i] = 0
  return next
}

function segNum(name: string): number {
  const match = name.match(/RWMA_(\d+)/)
  return match ? parseInt(match[1], 10) : 0
}

function segLabel(seg: number): string {
  const meta = RWMA_SEGMENT_META[seg]
  return meta ? `Seg ${seg}: ${meta.level} ${meta.wall} (${meta.territory})` : `Seg ${seg}`
}

export function CmrRwmaPage() {
  const activeCase = useCmrCaseStore((state) => state.activeCase)
  const patchActiveCasePayload = useCmrCaseStore((state) => state.patchActiveCasePayload)
  const initialRwma = activeCase?.payload.rwma

  const [segStates, setSegStates] = useState<Record<number, RwmaCode>>(
    () => (initialRwma?.segStates as Record<number, RwmaCode>) ?? createSegState(),
  )
  const [activeBrush, setActiveBrush] = useState<RwmaCode>(
    () => (initialRwma?.activeBrush as RwmaCode | undefined) ?? 0,
  )
  const [hoveredSeg, setHoveredSeg] = useState<number | null>(null)
  const [llmProse, setLlmProse] = useState<string | null>(() => initialRwma?.llmProse ?? null)
  const [llmProseSourceSignature, setLlmProseSourceSignature] = useState<string | null>(
    () => initialRwma?.llmProseSourceSignature ?? null,
  )
  const [isGenerating, setIsGenerating] = useState(false)
  const [llmError, setLlmError] = useState<string | null>(null)

  useEffect(() => {
    const nextRwma = activeCase?.payload.rwma
    setSegStates((nextRwma?.segStates as Record<number, RwmaCode> | undefined) ?? createSegState())
    setActiveBrush((nextRwma?.activeBrush as RwmaCode | undefined) ?? 0)
    setLlmProse(nextRwma?.llmProse ?? null)
    setLlmProseSourceSignature(nextRwma?.llmProseSourceSignature ?? null)
    setHoveredSeg(null)
    setIsGenerating(false)
    setLlmError(null)
  }, [activeCase?.id])

  useEffect(() => {
    patchActiveCasePayload((payload) => ({
      ...payload,
      rwma: {
        segStates,
        activeBrush,
        llmProse,
        llmProseSourceSignature,
      },
    }))
  }, [activeBrush, llmProse, llmProseSourceSignature, patchActiveCasePayload, segStates])

  const paintSegment = useCallback((seg: number) => {
    setSegStates((prev) => {
      const next = { ...prev }
      if (prev[seg] === activeBrush) {
        next[seg] = ((activeBrush + 1) % RWMA_STATES.length) as RwmaCode
        setActiveBrush(next[seg])
      } else {
        next[seg] = activeBrush
      }
      return next
    })
  }, [activeBrush])

  const resetAll = useCallback(() => {
    setSegStates(createSegState())
    setLlmProse(null)
    setLlmProseSourceSignature(null)
    setLlmError(null)
  }, [])

  const summarySignature = useMemo(() => buildRwmaSummarySignature(segStates), [segStates])
  const summary = useMemo(() => generateRwmaSummary(segStates), [segStates])
  const isGeneratedSummaryStale = llmProse !== null && llmProseSourceSignature !== summarySignature

  const handleGenerate = useCallback(async () => {
    setIsGenerating(true)
    setLlmError(null)
    try {
      const prose = await generateCmrRwmaProse(buildRwmaSummaryData(segStates))
      setLlmProse(prose)
      setLlmProseSourceSignature(summarySignature)
    } catch (error) {
      setLlmError(error instanceof Error ? error.message : String(error))
    } finally {
      setIsGenerating(false)
    }
  }, [segStates, summarySignature])

  const segColor = useCallback((seg: number) => RWMA_STATES[segStates[seg] ?? 0].color, [segStates])

  return (
    <Stack data-house-role="page" space="lg">
      <Row align="center" gap="md" wrap={false} className="house-page-title-row">
        <SectionMarker tone="report" size="title" className="self-stretch h-auto" />
        <PageHeader heading="Wall motion" className="!ml-0 !mt-0" />
      </Row>

      <div className="flex items-center gap-4 flex-wrap">
        <div className="flex items-center gap-2">
          <div className="flex rounded-full bg-muted/50 p-0.5 ring-1 ring-border/50">
            {RWMA_STATES.map((state) => (
              <button
                key={state.code}
                type="button"
                onClick={() => setActiveBrush(state.code as RwmaCode)}
                className={cn(
                  'rounded-full px-3 py-1 text-xs font-medium transition-all',
                  activeBrush === state.code
                    ? state.code === 1
                      ? 'text-black shadow-sm'
                      : 'text-white shadow-sm'
                    : 'text-muted-foreground hover:text-foreground',
                )}
                style={activeBrush === state.code ? { backgroundColor: state.color } : undefined}
              >
                {state.label}
              </button>
            ))}
          </div>
        </div>

        <div className="h-5 w-px bg-border/40" />

        {RWMA_STATES.map((state) => (
          <span key={state.code} className="flex items-center gap-1.5">
            <span className="inline-block h-3 w-3 rounded-sm" style={{ backgroundColor: state.color }} />
            <span className="text-[11px] text-muted-foreground">{state.label}</span>
          </span>
        ))}

        <button
          type="button"
          onClick={resetAll}
          className="ml-auto rounded-full px-3 py-1 text-xs font-medium text-red-600 ring-1 ring-red-300 hover:bg-red-50 hover:text-red-700 transition-all"
        >
          Reset All
        </button>
      </div>

      <div className="h-5 text-xs text-muted-foreground">
        {hoveredSeg != null && (
          <span>
            <strong>{segLabel(hoveredSeg)}</strong>
            {' - '}
            {RWMA_STATES[segStates[hoveredSeg] ?? 0].label}
          </span>
        )}
      </div>

      <div className="flex items-start justify-between">
        <div className="text-center">
          <p className="mb-2 text-xs font-semibold tracking-wider text-muted-foreground">BULLSEYE</p>
          <svg viewBox={bullseye.viewBox} width={320} height={330}>
            <g transform={CMR_BULLSEYE_ROTATION_TRANSFORM}>
              {bullseyePathEntries.filter(([name]) => segNum(name) <= CMR_BULLSEYE_ROTATED_SEGMENT_MAX).map(([name, d]) => {
                const seg = segNum(name)
                return (
                  <path
                    key={name}
                    d={d}
                    fill={segColor(seg)}
                    stroke="white"
                    strokeWidth={1.5}
                    className="cursor-pointer"
                    onClick={() => paintSegment(seg)}
                    onMouseEnter={() => setHoveredSeg(seg)}
                    onMouseLeave={() => setHoveredSeg(null)}
                  />
                )
              })}
            </g>
            {bullseyePathEntries.filter(([name]) => segNum(name) > CMR_BULLSEYE_ROTATED_SEGMENT_MAX).map(([name, d]) => {
              const seg = segNum(name)
              return (
                <path
                  key={name}
                  d={d}
                  fill={segColor(seg)}
                  stroke="white"
                  strokeWidth={1.5}
                  className="cursor-pointer"
                  onClick={() => paintSegment(seg)}
                  onMouseEnter={() => setHoveredSeg(seg)}
                  onMouseLeave={() => setHoveredSeg(null)}
                />
              )
            })}
            <circle
              cx={86}
              cy={88}
              r={8}
              fill={segColor(17)}
              stroke="white"
              strokeWidth={1.5}
              className="cursor-pointer"
              onClick={() => paintSegment(17)}
              onMouseEnter={() => setHoveredSeg(17)}
              onMouseLeave={() => setHoveredSeg(null)}
            />
          </svg>
        </div>

        <div className="self-stretch w-px bg-border" />

        {(['4CH', '2CH', '3CH'] as const).map((view) => {
          const viewData = views[view]
          const [tx, ty] = OUTLINE_NUDGE[view] ?? [0, 0]
          const viewBoxParts = viewData.viewBox.split(' ')
          viewBoxParts[3] = String(Number(viewBoxParts[3]) + 5)
          const adjustedViewBox = viewBoxParts.join(' ')

          return (
            <div key={view} className="text-center">
              <p className="mb-2 text-xs font-semibold tracking-wider text-muted-foreground">
                {view === '4CH' ? '4-CHAMBER' : view === '2CH' ? '2-CHAMBER' : '3-CHAMBER'}
              </p>
              <svg viewBox={adjustedViewBox} height={350} style={{ width: 'auto' }} className="mx-auto">
                {viewData.outline &&
                  (Array.isArray(viewData.outline) ? viewData.outline : [viewData.outline]).map((path, index) => (
                    <path
                      key={`outline-${index}`}
                      d={path}
                      fill="#e8e8e8"
                      stroke="#ccc"
                      strokeWidth={0.5}
                      transform={tx || ty ? `translate(${tx},${ty})` : undefined}
                    />
                  ))}
                {Object.entries(viewData.paths).map(([name, d]) => {
                  const seg = segNum(name)
                  return (
                    <path
                      key={name}
                      d={d}
                      fill={segColor(seg)}
                      stroke="white"
                      strokeWidth={0.8}
                      className="cursor-pointer"
                      onClick={() => paintSegment(seg)}
                      onMouseEnter={() => setHoveredSeg(seg)}
                      onMouseLeave={() => setHoveredSeg(null)}
                    />
                  )
                })}
              </svg>
            </div>
          )
        })}
      </div>

      <div className="rounded-lg border border-border bg-muted/30 p-4">
        <div className="mb-2 flex items-center gap-2 flex-wrap">
          <span className="text-xs font-semibold tracking-wider text-muted-foreground">SEGMENT SUMMARY</span>
          {summary.hasAbnormality && (
            <span
              className={cn(
                'rounded-full px-2.5 py-0.5 text-xs font-semibold',
                summary.severity === 'mild' ? 'text-black' : 'text-white',
              )}
              style={{ backgroundColor: WMSI_SEVERITY_COLORS[summary.severity] }}
            >
              {summary.severity.toUpperCase()}
            </span>
          )}
          {summary.territories.map((territory) => (
            <span
              key={territory}
              className="rounded-full px-2.5 py-0.5 text-xs font-semibold text-white bg-foreground/70"
            >
              {territory}
            </span>
          ))}
          <span className="rounded-full px-2.5 py-0.5 text-xs font-semibold text-white bg-foreground/70">
            WMSI {summary.wmsi.toFixed(2)}
          </span>
        </div>

        {llmProse !== null && (
          <p className="text-sm leading-relaxed text-foreground/80 whitespace-pre-wrap">
            {llmProse}
          </p>
        )}

        {llmError && (
          <p className="mt-2 text-xs text-red-500">{llmError}</p>
        )}

        <div className="mt-3 flex items-center gap-3">
          <button
            type="button"
            disabled={isGenerating}
            onClick={handleGenerate}
            className={cn(
              'rounded-full px-4 py-1.5 text-xs font-medium transition-all',
              'bg-foreground text-background hover:bg-foreground/90',
              'disabled:opacity-40 disabled:cursor-not-allowed',
            )}
          >
            {isGenerating
              ? 'Generating...'
              : llmProse !== null
                ? isGeneratedSummaryStale
                  ? 'Regenerate Summary (Stale)'
                  : 'Regenerate Summary'
                : 'Generate Summary'}
          </button>
          {llmProse !== null && (
            <button
              type="button"
              onClick={() => {
                setLlmProse(null)
                setLlmProseSourceSignature(null)
                setLlmError(null)
              }}
              className="rounded-full px-3 py-1 text-xs font-medium text-red-600 ring-1 ring-red-300 hover:bg-red-50 hover:text-red-700 transition-all"
            >
              Clear
            </button>
          )}
        </div>
      </div>
    </Stack>
  )
}
