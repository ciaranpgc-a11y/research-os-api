import { useCallback, useEffect, useMemo, useState } from 'react'

import { PageHeader, Row, Stack } from '@/components/primitives'
import { SectionMarker } from '@/components/patterns'
import rwmaPaths from '@/data/rwma-paths.json'
import {
  buildPerfusionSummaryData,
  buildPerfusionSummarySignature,
  generatePerfusionSummary,
  PERFUSION_SEGMENT_META,
  type PerfusionCode,
  type PerfusionPhase,
} from '@/lib/cmr-perfusion-summary'
import { CMR_BULLSEYE_ROTATED_SEGMENT_MAX, CMR_BULLSEYE_ROTATION_TRANSFORM } from '@/lib/cmr-bullseye-geometry'
import { generateCmrPerfusionProse } from '@/lib/cmr-summary-api'
import { cn } from '@/lib/utils'
import { useCmrCaseStore } from '@/store/use-cmr-case-store'

type LgeCode = 0 | 1 | 2 | 3 | 4
type LgePatternCode = 0 | 1 | 2 | 3 | 4

const PERFUSION_STATES = [
  { code: 0, label: 'Normal', color: 'hsl(164 40% 45%)' },
  { code: 1, label: 'Subendocardial', color: 'hsl(45 85% 58%)' },
  { code: 2, label: 'Transmural', color: 'hsl(3 55% 48%)' },
] as const

const LGE_STATES = [
  { code: 0, label: 'None', color: 'transparent' },
  { code: 1, label: '1-25%', color: 'hsl(15 70% 75%)' },
  { code: 2, label: '26-50%', color: 'hsl(5 65% 62%)' },
  { code: 3, label: '51-75%', color: 'hsl(350 60% 48%)' },
  { code: 4, label: '76-100%', color: 'hsl(340 65% 32%)' },
] as const

const LGE_PATTERNS = [
  { code: 0, label: 'None', strokeColor: 'white' },
  { code: 1, label: 'Subendocardial', strokeColor: 'hsl(45 90% 50%)' },
  { code: 2, label: 'Mid-wall', strokeColor: 'hsl(200 85% 55%)' },
  { code: 3, label: 'Subepicardial', strokeColor: 'hsl(275 65% 55%)' },
  { code: 4, label: 'Transmural', strokeColor: 'hsl(0 0% 20%)' },
] as const

const IMPRESSION_LABELS: Record<string, string> = {
  normal: 'Normal',
  inducible: 'Inducible',
  'matched-scar': 'Matched scar',
  'exceeds-lge': 'Exceeds LGE',
  multivessel: 'Multivessel',
  'rest-only': 'Rest only',
  'non-diagnostic': 'Non-diagnostic',
  indeterminate: 'Indeterminate',
}

const bullseye = rwmaPaths.bullseye as { viewBox: string; paths: Record<string, string> }
const bullseyePathEntries = Object.entries(bullseye.paths)

function createSegState(): Record<number, PerfusionCode> {
  const next: Record<number, PerfusionCode> = {}
  for (let i = 1; i <= 17; i += 1) next[i] = 0
  return next
}

function segNum(name: string): number {
  const match = name.match(/RWMA_(\d+)/)
  return match ? parseInt(match[1], 10) : 0
}

function segLabel(seg: number): string {
  const meta = PERFUSION_SEGMENT_META[seg]
  return meta ? `Seg ${seg}: ${meta.level} ${meta.wall} (${meta.territory})` : `Seg ${seg}`
}

function buildLgeOverlayLabel(
  seg: number,
  lgeSegStates: Record<number, LgeCode>,
  lgePatternStates: Record<number, LgePatternCode>,
): string | null {
  const segState = lgeSegStates[seg] ?? 0
  if (segState <= 0) return null
  const patternState = lgePatternStates[seg] ?? 0
  const transmurality = LGE_STATES[segState].label
  if (patternState > 0) {
    return `LGE ${transmurality} / ${LGE_PATTERNS[patternState].label}`
  }
  return `LGE ${transmurality}`
}

type PerfusionSectionProps = {
  title: string
  phase: PerfusionPhase
  persistenceBeats: number
  segStates: Record<number, PerfusionCode>
  lgeSegStates: Record<number, LgeCode>
  lgePatternStates: Record<number, LgePatternCode>
  showLgeOverlay: boolean
  hoveredSeg: number | null
  onHoverSeg: (seg: number | null) => void
  onPersistenceBeatsChange: (beats: number) => void
  onPaintSegment: (seg: number) => void
  onReset: () => void
}

function PerfusionSection({
  title,
  phase,
  persistenceBeats,
  segStates,
  lgeSegStates,
  lgePatternStates,
  showLgeOverlay,
  hoveredSeg,
  onHoverSeg,
  onPersistenceBeatsChange,
  onPaintSegment,
  onReset,
}: PerfusionSectionProps) {
  const segColor = useCallback((seg: number) => PERFUSION_STATES[segStates[seg] ?? 0].color, [segStates])
  const lgeOverlayText = hoveredSeg == null
    ? null
    : buildLgeOverlayLabel(hoveredSeg, lgeSegStates, lgePatternStates)

  return (
    <Stack space="md" className="rounded-3xl border border-border/50 bg-card/60 p-5">
      <div className="flex items-center gap-3">
        <p className="text-xs font-semibold tracking-wider text-muted-foreground">{title}</p>
        <button
          type="button"
          onClick={onReset}
          className="ml-auto rounded-full px-3 py-1 text-xs font-medium text-[hsl(var(--tone-neutral-600))] ring-1 ring-border/60 hover:bg-muted/50 hover:text-foreground transition-all"
        >
          Reset {phase}
        </button>
      </div>

      <div className="h-5 text-xs text-muted-foreground">
        {hoveredSeg != null && (
          <span>
            <strong>{segLabel(hoveredSeg)}</strong>
            {' - '}
            {title}
            {' / '}
            {PERFUSION_STATES[segStates[hoveredSeg] ?? 0].label}
            {showLgeOverlay && lgeOverlayText && (
              <>
                {' / '}
                {lgeOverlayText}
              </>
            )}
          </span>
        )}
      </div>

      <div className="mx-auto w-full max-w-[320px] text-center">
        <svg viewBox={bullseye.viewBox} width={320} height={330}>
          <g transform={CMR_BULLSEYE_ROTATION_TRANSFORM}>
            {bullseyePathEntries.filter(([name]) => segNum(name) <= CMR_BULLSEYE_ROTATED_SEGMENT_MAX).map(([name, d]) => {
              const seg = segNum(name)
              const hasLgeOverlay = showLgeOverlay && (lgeSegStates[seg] ?? 0) > 0
              const lgeSegState = (lgeSegStates[seg] ?? 0) as LgeCode
              const lgePatternState = (lgePatternStates[seg] ?? 0) as LgePatternCode
              return (
                <g key={name}>
                  <path
                    d={d}
                    fill={segColor(seg)}
                    stroke="white"
                    strokeWidth={1.5}
                    className="cursor-pointer"
                    onClick={() => onPaintSegment(seg)}
                    onMouseEnter={() => onHoverSeg(seg)}
                    onMouseLeave={() => onHoverSeg(null)}
                  />
                  {hasLgeOverlay && (
                    <path
                      d={d}
                      fill={LGE_STATES[lgeSegState].color}
                      fillOpacity={1}
                      stroke={LGE_PATTERNS[lgePatternState].strokeColor}
                      strokeWidth={2.4}
                      pointerEvents="none"
                    />
                  )}
                </g>
              )
            })}
          </g>
          {bullseyePathEntries.filter(([name]) => segNum(name) > CMR_BULLSEYE_ROTATED_SEGMENT_MAX).map(([name, d]) => {
            const seg = segNum(name)
            const hasLgeOverlay = showLgeOverlay && (lgeSegStates[seg] ?? 0) > 0
            const lgeSegState = (lgeSegStates[seg] ?? 0) as LgeCode
            const lgePatternState = (lgePatternStates[seg] ?? 0) as LgePatternCode
            return (
              <g key={name}>
                <path
                  d={d}
                  fill={segColor(seg)}
                  stroke="white"
                  strokeWidth={1.5}
                  className="cursor-pointer"
                  onClick={() => onPaintSegment(seg)}
                  onMouseEnter={() => onHoverSeg(seg)}
                  onMouseLeave={() => onHoverSeg(null)}
                />
                {hasLgeOverlay && (
                  <path
                    d={d}
                    fill={LGE_STATES[lgeSegState].color}
                    fillOpacity={1}
                    stroke={LGE_PATTERNS[lgePatternState].strokeColor}
                    strokeWidth={2.4}
                    pointerEvents="none"
                  />
                )}
              </g>
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
            onClick={() => onPaintSegment(17)}
            onMouseEnter={() => onHoverSeg(17)}
            onMouseLeave={() => onHoverSeg(null)}
          />
          {showLgeOverlay && (lgeSegStates[17] ?? 0) > 0 && (
            <circle
              cx={86}
              cy={88}
              r={8}
              fill={LGE_STATES[(lgeSegStates[17] ?? 0) as LgeCode].color}
              fillOpacity={1}
              stroke={LGE_PATTERNS[(lgePatternStates[17] ?? 0) as LgePatternCode].strokeColor}
              strokeWidth={2.4}
              pointerEvents="none"
            />
          )}
        </svg>

        <div className="mt-4 rounded-2xl border border-border/50 bg-muted/20 px-4 py-3 text-left">
          <div className="mb-2 flex items-center justify-between gap-3">
            <span className="text-xs font-medium uppercase tracking-[0.12em] text-muted-foreground">
              Persistence
            </span>
            <span className="text-sm font-semibold tabular-nums text-foreground">
              {persistenceBeats} beats
            </span>
          </div>
          <input
            type="range"
            min={0}
            max={15}
            step={1}
            value={persistenceBeats}
            onChange={(event) => onPersistenceBeatsChange(Number(event.target.value))}
            className="h-2 w-full cursor-pointer accent-[hsl(var(--section-style-report-accent))]"
          />
        </div>
      </div>
    </Stack>
  )
}

export function CmrPerfusionPage() {
  const activeCase = useCmrCaseStore((state) => state.activeCase)
  const patchActiveCasePayload = useCmrCaseStore((state) => state.patchActiveCasePayload)
  const initialPerfusion = activeCase?.payload.perfusion
  const lgeSegStates = ((activeCase?.payload.lge.segStates ?? {}) as Record<number, LgeCode>)
  const lgePatternStates = ((activeCase?.payload.lge.patternStates ?? {}) as Record<number, LgePatternCode>)

  const [stressSegStates, setStressSegStates] = useState<Record<number, PerfusionCode>>(
    () => (initialPerfusion?.stressSegStates as Record<number, PerfusionCode>) ?? createSegState(),
  )
  const [restSegStates, setRestSegStates] = useState<Record<number, PerfusionCode>>(
    () => (initialPerfusion?.restSegStates as Record<number, PerfusionCode>) ?? createSegState(),
  )
  const [stressPersistenceBeats, setStressPersistenceBeats] = useState<number>(
    () => initialPerfusion?.stressPersistenceBeats ?? 0,
  )
  const [restPersistenceBeats, setRestPersistenceBeats] = useState<number>(
    () => initialPerfusion?.restPersistenceBeats ?? 0,
  )
  const [adequateStress, setAdequateStress] = useState<boolean>(
    () => initialPerfusion?.adequateStress ?? true,
  )
  const [activeBrush, setActiveBrush] = useState<PerfusionCode>(
    () => (initialPerfusion?.activeBrush as PerfusionCode | undefined) ?? 0,
  )
  const [llmProse, setLlmProse] = useState<string | null>(() => initialPerfusion?.llmProse ?? null)
  const [llmProseSourceSignature, setLlmProseSourceSignature] = useState<string | null>(
    () => initialPerfusion?.llmProseSourceSignature ?? null,
  )
  const [showLgeOverlay, setShowLgeOverlay] = useState<boolean>(
    () => initialPerfusion?.showLgeOverlay ?? false,
  )
  const [hoveredSegment, setHoveredSegment] = useState<{ phase: PerfusionPhase; seg: number } | null>(null)
  const [isGenerating, setIsGenerating] = useState(false)
  const [llmError, setLlmError] = useState<string | null>(null)

  useEffect(() => {
    const nextPerfusion = activeCase?.payload.perfusion
    setStressSegStates((nextPerfusion?.stressSegStates as Record<number, PerfusionCode> | undefined) ?? createSegState())
    setRestSegStates((nextPerfusion?.restSegStates as Record<number, PerfusionCode> | undefined) ?? createSegState())
    setStressPersistenceBeats(nextPerfusion?.stressPersistenceBeats ?? 0)
    setRestPersistenceBeats(nextPerfusion?.restPersistenceBeats ?? 0)
    setAdequateStress(nextPerfusion?.adequateStress ?? true)
    setActiveBrush((nextPerfusion?.activeBrush as PerfusionCode | undefined) ?? 0)
    setLlmProse(nextPerfusion?.llmProse ?? null)
    setLlmProseSourceSignature(nextPerfusion?.llmProseSourceSignature ?? null)
    setShowLgeOverlay(nextPerfusion?.showLgeOverlay ?? false)
    setHoveredSegment(null)
    setIsGenerating(false)
    setLlmError(null)
  }, [activeCase?.id])

  useEffect(() => {
    patchActiveCasePayload((payload) => ({
      ...payload,
      perfusion: {
        stressSegStates,
        restSegStates,
        stressPersistenceBeats,
        restPersistenceBeats,
        adequateStress,
        showLgeOverlay,
        llmProse,
        llmProseSourceSignature,
        activeBrush,
      },
    }))
  }, [
    activeBrush,
    adequateStress,
    llmProse,
    llmProseSourceSignature,
    patchActiveCasePayload,
    restPersistenceBeats,
    restSegStates,
    showLgeOverlay,
    stressPersistenceBeats,
    stressSegStates,
  ])

  const paintSegment = useCallback((phase: PerfusionPhase, seg: number) => {
    const setSegStates = phase === 'stress' ? setStressSegStates : setRestSegStates
    setSegStates((prev) => {
      const next = { ...prev }
      if (prev[seg] === activeBrush) {
        next[seg] = ((activeBrush + 1) % PERFUSION_STATES.length) as PerfusionCode
        setActiveBrush(next[seg])
      } else {
        next[seg] = activeBrush
      }
      return next
    })
  }, [activeBrush])

  const resetPhase = useCallback((phase: PerfusionPhase) => {
    setLlmError(null)
    if (phase === 'stress') {
      setStressSegStates(createSegState())
      setStressPersistenceBeats(0)
      return
    }
    setRestSegStates(createSegState())
    setRestPersistenceBeats(0)
  }, [])

  const resetAll = useCallback(() => {
    setStressSegStates(createSegState())
    setRestSegStates(createSegState())
    setStressPersistenceBeats(0)
    setRestPersistenceBeats(0)
    setAdequateStress(true)
    setLlmProse(null)
    setLlmProseSourceSignature(null)
    setLlmError(null)
    setActiveBrush(0)
  }, [])

  const hasAnyLge = useMemo(
    () => Object.values(lgeSegStates).some((value) => Number(value) > 0),
    [lgeSegStates],
  )

  const summarySignature = useMemo(
    () => buildPerfusionSummarySignature(
      restSegStates,
      stressSegStates,
      restPersistenceBeats,
      stressPersistenceBeats,
      adequateStress,
      lgeSegStates,
      lgePatternStates,
    ),
    [
      adequateStress,
      lgePatternStates,
      lgeSegStates,
      restPersistenceBeats,
      restSegStates,
      stressPersistenceBeats,
      stressSegStates,
    ],
  )
  const summary = useMemo(
    () => generatePerfusionSummary({
      restSegStates,
      stressSegStates,
      restPersistenceBeats,
      stressPersistenceBeats,
      adequateStress,
      lgeSegStates,
      lgePatternStates,
    }),
    [
      adequateStress,
      lgePatternStates,
      lgeSegStates,
      restPersistenceBeats,
      restSegStates,
      stressPersistenceBeats,
      stressSegStates,
    ],
  )
  const isGeneratedSummaryStale = llmProse !== null && llmProseSourceSignature !== summarySignature

  const handleGenerate = useCallback(async () => {
    setIsGenerating(true)
    setLlmError(null)
    try {
      const prose = await generateCmrPerfusionProse(buildPerfusionSummaryData({
        restSegStates,
        stressSegStates,
        restPersistenceBeats,
        stressPersistenceBeats,
        adequateStress,
        lgeSegStates,
        lgePatternStates,
      }))
      setLlmProse(prose)
      setLlmProseSourceSignature(summarySignature)
    } catch (error) {
      setLlmError(error instanceof Error ? error.message : String(error))
    } finally {
      setIsGenerating(false)
    }
  }, [
    adequateStress,
    lgePatternStates,
    lgeSegStates,
    restPersistenceBeats,
    restSegStates,
    stressPersistenceBeats,
    stressSegStates,
    summarySignature,
  ])

  return (
    <Stack data-house-role="page" space="lg">
      <Row align="center" gap="md" wrap={false} className="house-page-title-row">
        <SectionMarker tone="report" size="title" className="self-stretch h-auto" />
        <PageHeader heading="Perfusion" className="!ml-0 !mt-0" />
      </Row>

      <div className="flex items-center gap-4 flex-wrap">
        <div className="flex rounded-full bg-muted/50 p-0.5 ring-1 ring-border/50">
          {PERFUSION_STATES.map((state) => (
            <button
              key={state.code}
              type="button"
              onClick={() => setActiveBrush(state.code as PerfusionCode)}
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

        <div className="h-5 w-px bg-border/40" />

        {PERFUSION_STATES.map((state) => (
          <span key={state.code} className="flex items-center gap-1.5">
            <span className="inline-block h-3 w-3 rounded-sm" style={{ backgroundColor: state.color }} />
            <span className="text-[11px] text-muted-foreground">{state.label}</span>
          </span>
        ))}

        <div className="h-5 w-px bg-border/40" />

        <label className="flex items-center gap-2 rounded-full px-3 py-1 text-xs font-medium text-muted-foreground ring-1 ring-border/60">
          <input
            type="checkbox"
            checked={adequateStress}
            onChange={(event) => setAdequateStress(event.target.checked)}
            className="h-3.5 w-3.5 rounded border-border accent-[hsl(var(--section-style-report-accent))]"
          />
          Adequate vasodilator stress
        </label>

        <div className="h-5 w-px bg-border/40" />

        <button
          type="button"
          disabled={!hasAnyLge}
          onClick={() => setShowLgeOverlay((value) => !value)}
          className={cn(
            'rounded-full px-3 py-1 text-xs font-medium transition-all ring-1',
            showLgeOverlay
              ? 'bg-[hsl(var(--section-style-report-accent))] text-white ring-[hsl(var(--section-style-report-accent))]'
              : 'bg-transparent text-muted-foreground ring-border/60 hover:bg-muted/50 hover:text-foreground',
            !hasAnyLge && 'cursor-not-allowed opacity-40',
          )}
        >
          {showLgeOverlay ? 'Hide LGE overlay' : 'Show LGE overlay'}
        </button>

        <button
          type="button"
          onClick={resetAll}
          className="ml-auto rounded-full px-3 py-1 text-xs font-medium text-red-600 ring-1 ring-red-300 hover:bg-red-50 hover:text-red-700 transition-all"
        >
          Reset all
        </button>
      </div>

      <div className="grid gap-6 xl:grid-cols-2">
        <PerfusionSection
          title="REST"
          phase="rest"
          persistenceBeats={restPersistenceBeats}
          segStates={restSegStates}
          lgeSegStates={lgeSegStates}
          lgePatternStates={lgePatternStates}
          showLgeOverlay={showLgeOverlay}
          hoveredSeg={hoveredSegment?.phase === 'rest' ? hoveredSegment.seg : null}
          onHoverSeg={(seg) => setHoveredSegment(seg == null ? null : { phase: 'rest', seg })}
          onPersistenceBeatsChange={setRestPersistenceBeats}
          onPaintSegment={(seg) => paintSegment('rest', seg)}
          onReset={() => resetPhase('rest')}
        />

        <PerfusionSection
          title="STRESS"
          phase="stress"
          persistenceBeats={stressPersistenceBeats}
          segStates={stressSegStates}
          lgeSegStates={lgeSegStates}
          lgePatternStates={lgePatternStates}
          showLgeOverlay={showLgeOverlay}
          hoveredSeg={hoveredSegment?.phase === 'stress' ? hoveredSegment.seg : null}
          onHoverSeg={(seg) => setHoveredSegment(seg == null ? null : { phase: 'stress', seg })}
          onPersistenceBeatsChange={setStressPersistenceBeats}
          onPaintSegment={(seg) => paintSegment('stress', seg)}
          onReset={() => resetPhase('stress')}
        />
      </div>

      <div className="rounded-lg border border-border bg-muted/30 p-4">
        <div className="mb-2 flex items-center gap-2 flex-wrap">
          <span className="text-xs font-semibold tracking-wider text-muted-foreground">PERFUSION SUMMARY</span>
          <span className="rounded-full px-2.5 py-0.5 text-xs font-semibold text-white bg-foreground/70">
            {IMPRESSION_LABELS[summary.impression] ?? summary.impression}
          </span>
          <span
            className={cn(
              'rounded-full px-2.5 py-0.5 text-xs font-semibold',
              adequateStress
                ? 'text-[hsl(var(--tone-green-900))] bg-[hsl(var(--tone-green-100))]'
                : 'text-[hsl(var(--tone-amber-900))] bg-[hsl(var(--tone-amber-100))]',
            )}
          >
            {adequateStress ? 'Adequate stress' : 'Suboptimal stress'}
          </span>
          {summary.rest.abnormalCount > 0 && (
            <span className="rounded-full px-2.5 py-0.5 text-xs font-semibold text-white bg-foreground/70">
              REST {summary.rest.abnormalCount}/17
            </span>
          )}
          {summary.stress.abnormalCount > 0 && (
            <span className="rounded-full px-2.5 py-0.5 text-xs font-semibold text-white" style={{ backgroundColor: 'hsl(3 55% 48%)' }}>
              STRESS {summary.stress.abnormalCount}/17
            </span>
          )}
          {(restPersistenceBeats > 0 || stressPersistenceBeats > 0) && (
            <span className="rounded-full px-2.5 py-0.5 text-xs font-semibold text-[hsl(var(--tone-neutral-700))] bg-[hsl(var(--tone-neutral-100))]">
              {restPersistenceBeats}/{stressPersistenceBeats} beats
            </span>
          )}
        </div>

        {llmProse !== null && (
          <p className="mt-3 text-sm leading-relaxed text-foreground/80 whitespace-pre-wrap">
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
              ? 'Generating…'
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
