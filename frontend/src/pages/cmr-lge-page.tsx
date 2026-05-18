import { useCallback, useEffect, useMemo, useState, useSyncExternalStore } from 'react'

import { PageHeader, Row, Stack } from '@/components/primitives'
import { SectionMarker } from '@/components/patterns'
import { cn } from '@/lib/utils'
import rwmaPaths from '@/data/rwma-paths.json'
import {
  buildLgeSummaryData,
  buildLgeSummarySignature,
  generateLgeSummary,
  LGE_SEGMENT_META,
  type LgeCode,
  type PatternCode,
} from '@/lib/cmr-lge-summary'
import { CMR_BULLSEYE_ROTATED_SEGMENT_MAX, CMR_BULLSEYE_ROTATION_TRANSFORM } from '@/lib/cmr-bullseye-geometry'
import { getExtractionResult, subscribeExtractionResult } from '@/lib/cmr-report-store'
import { generateCmrLgeProse } from '@/lib/cmr-summary-api'
import { useCmrCaseStore } from '@/store/use-cmr-case-store'


const SEGMENT_META = LGE_SEGMENT_META

const LGE_STATES = [
  { code: 0, label: 'None', shortLabel: '0%', color: 'hsl(164 40% 45%)' },
  { code: 1, label: '1-25%', shortLabel: '1-25%', color: 'hsl(15 70% 75%)' },
  { code: 2, label: '26-50%', shortLabel: '26-50%', color: 'hsl(5 65% 62%)' },
  { code: 3, label: '51-75%', shortLabel: '51-75%', color: 'hsl(350 60% 48%)' },
  { code: 4, label: '76-100%', shortLabel: '76-100%', color: 'hsl(340 65% 32%)' },
] as const

const LGE_PATTERNS = [
  { code: 0, label: 'None', strokeColor: 'white' },
  { code: 1, label: 'Subendocardial', strokeColor: 'hsl(45 90% 50%)' },
  { code: 2, label: 'Mid-wall', strokeColor: 'hsl(200 85% 55%)' },
  { code: 3, label: 'Subepicardial', strokeColor: 'hsl(275 65% 55%)' },
  { code: 4, label: 'Transmural', strokeColor: 'hsl(0 0% 20%)' },
] as const

function segNum(name: string): number {
  const match = name.match(/RWMA_(\d+)/)
  return match ? parseInt(match[1], 10) : 0
}

function segLabel(seg: number): string {
  const meta = SEGMENT_META[seg]
  return meta ? `Seg ${seg}: ${meta.level} ${meta.wall} (${meta.territory})` : `Seg ${seg}`
}

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

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function CmrLgePage() {
  const activeCase = useCmrCaseStore((state) => state.activeCase)
  const patchActiveCasePayload = useCmrCaseStore((state) => state.patchActiveCasePayload)
  const initialLge = activeCase?.payload.lge
  const [segStates, setSegStates] = useState<Record<number, LgeCode>>(
    () => (initialLge?.segStates as Record<number, LgeCode>) ?? (() => {
      const init: Record<number, LgeCode> = {}
      for (let i = 1; i <= 17; i += 1) init[i] = 0
      return init
    })(),
  )

  const [patternStates, setPatternStates] = useState<Record<number, PatternCode>>(
    () => (initialLge?.patternStates as Record<number, PatternCode>) ?? (() => {
      const init: Record<number, PatternCode> = {}
      for (let i = 1; i <= 17; i += 1) init[i] = 0
      return init
    })(),
  )

  const [activePattern, setActivePattern] = useState<PatternCode>(() => (initialLge?.activePattern as PatternCode | undefined) ?? 1)
  const [rvInsertionPointFibrosis, setRvInsertionPointFibrosis] = useState<boolean>(
    () => Boolean(initialLge?.rvInsertionPointFibrosis),
  )
  const [hoveredSeg, setHoveredSeg] = useState<number | null>(null)
  const [llmProse, setLlmProse] = useState<string | null>(() => initialLge?.llmProse ?? null)
  const [llmProseSourceSignature, setLlmProseSourceSignature] = useState<string | null>(
    () => initialLge?.llmProseSourceSignature ?? null,
  )
  const [isGenerating, setIsGenerating] = useState(false)
  const [llmError, setLlmError] = useState<string | null>(null)

  useEffect(() => {
    const nextLge = activeCase?.payload.lge
    const nextSegStates = (nextLge?.segStates as Record<number, LgeCode> | undefined) ?? (() => {
      const init: Record<number, LgeCode> = {}
      for (let i = 1; i <= 17; i += 1) init[i] = 0
      return init
    })()
    const nextPatternStates = (nextLge?.patternStates as Record<number, PatternCode> | undefined) ?? (() => {
      const init: Record<number, PatternCode> = {}
      for (let i = 1; i <= 17; i += 1) init[i] = 0
      return init
    })()

    setSegStates(nextSegStates)
    setPatternStates(nextPatternStates)
    setActivePattern((nextLge?.activePattern as PatternCode | undefined) ?? 1)
    setRvInsertionPointFibrosis(Boolean(nextLge?.rvInsertionPointFibrosis))
    setLlmProse(nextLge?.llmProse ?? null)
    setLlmProseSourceSignature(nextLge?.llmProseSourceSignature ?? null)
    setHoveredSeg(null)
    setIsGenerating(false)
    setLlmError(null)
  }, [activeCase?.id])

  useEffect(() => {
    patchActiveCasePayload((payload) => ({
      ...payload,
      lge: {
        segStates,
        patternStates,
        activePattern,
        rvInsertionPointFibrosis,
        llmProse,
        llmProseSourceSignature,
      },
    }))
  }, [activePattern, llmProse, llmProseSourceSignature, patchActiveCasePayload, patternStates, rvInsertionPointFibrosis, segStates])

  // Pull quantitative metrics from the shared extraction store
  const extraction = useSyncExternalStore(subscribeExtractionResult, getExtractionResult)
  const contextMetrics = useMemo(() => {
    const mv = new Map<string, number>()
    if (extraction?.measurements) {
      for (const m of extraction.measurements) mv.set(m.parameter, m.value)
    }
    const sex = extraction?.demographics?.sex ?? 'Male'
    const age = extraction?.demographics?.age
    const h = extraction?.demographics?.height_cm
    const w = extraction?.demographics?.weight_kg
    const bsa = (h && w && h > 0) ? Math.sqrt((h * w) / 3600) : undefined

    // Direct measured values
    const nativeT1 = mv.get('Native T1')
    const postT1 = mv.get('Post-contrast T1')
    const ecv = mv.get('ECV')
    const nativeT2 = mv.get('Native T2')
    const t2star = mv.get('Myocardial T2*')
    const lvEf = mv.get('LV EF')
    const lvMassi = mv.get('LV mass (i)')
    const lvEdvi = mv.get('LV EDV (i)')
    const rvEf = mv.get('RV EF')
    const mrRf = mv.get('MR regurgitant fraction')

    // Derived: PCWP = 5.7591 + (0.07505 x LAV) + (0.05289 x LVM) - (1.9927 x sex)
    const lav = mv.get('LA max volume')
    const lvm = mv.get('LV mass')
    const pcwp = (lav !== undefined && lvm !== undefined)
      ? 5.7591 + (0.07505 * lav) + (0.05289 * lvm) - (1.9927 * (sex === 'Male' ? 1 : 0))
      : undefined

    // Derived: mRAP = 6.4547 + (0.05828 x RAESV)
    const raesv = mv.get('RA max volume')
    const mrap = raesv !== undefined ? 6.4547 + (0.05828 * raesv) : undefined

    // Derived: SBP = 83.845 + (0.4225 x Age) + (0.4187 x LVEF)
    const sbp = (age !== undefined && lvEf !== undefined)
      ? 83.845 + (0.4225 * age) + (0.4187 * lvEf) : undefined

    // Derived: DBP = 58.8591 + (-0.1229 x AO fwd) + (8.2279 x BSA) + (0.1738 x LVMi)
    const aoFwd = mv.get('AV forward flow (per heartbeat)')
    const dbp = (aoFwd !== undefined && bsa !== undefined && lvMassi !== undefined)
      ? 58.8591 + (-0.1229 * aoFwd) + (8.2279 * bsa) + (0.1738 * lvMassi) : undefined

    return { nativeT1, postT1, ecv, nativeT2, t2star, lvEf, lvMassi, lvEdvi, rvEf, mrRf, pcwp, mrap, sbp, dbp }
  }, [extraction])

  const paintSegment = useCallback(
    (seg: number, direction: 1 | -1 = 1) => {
      // Cycle transmurality: forward (left click) or backward (right click)
      const newTrans = (((segStates[seg] + direction + 5) % 5)) as LgeCode

      if (newTrans === 0) {
        setSegStates((prev) => ({ ...prev, [seg]: 0 as LgeCode }))
        setPatternStates((prev) => ({ ...prev, [seg]: 0 as PatternCode }))
      } else if (newTrans === 4) {
        setSegStates((prev) => ({ ...prev, [seg]: 4 as LgeCode }))
        setPatternStates((prev) => ({ ...prev, [seg]: 4 as PatternCode }))
      } else {
        setSegStates((prev) => ({ ...prev, [seg]: newTrans }))
        setPatternStates((prev) => ({ ...prev, [seg]: activePattern > 0 ? activePattern : prev[seg] }))
      }
    },
    [activePattern, segStates, patternStates],
  )

  const resetAll = useCallback(() => {
    const initLge: Record<number, LgeCode> = {}
    const initPat: Record<number, PatternCode> = {}
    for (let i = 1; i <= 17; i++) {
      initLge[i] = 0
      initPat[i] = 0
    }
    setSegStates(initLge)
    setPatternStates(initPat)
    setActivePattern(1 as PatternCode)
    setRvInsertionPointFibrosis(false)
    setLlmProse(null)
    setLlmProseSourceSignature(null)
    setLlmError(null)
  }, [])

  const segColor = (seg: number) => LGE_STATES[segStates[seg] ?? 0].color
  const segStroke = (seg: number) => {
    const p = patternStates[seg] ?? 0
    return p > 0 && segStates[seg] > 0 ? LGE_PATTERNS[p].strokeColor : 'white'
  }

  // Derived summary
  const summarySignature = useMemo(
    () => buildLgeSummarySignature(segStates, patternStates, rvInsertionPointFibrosis),
    [patternStates, rvInsertionPointFibrosis, segStates],
  )
  const summary = useMemo(
    () => generateLgeSummary(segStates, patternStates, rvInsertionPointFibrosis),
    [patternStates, rvInsertionPointFibrosis, segStates],
  )
  const isGeneratedSummaryStale = llmProse !== null && llmProseSourceSignature !== summarySignature
  const displayedSummaryText = llmProse !== null
    ? (isGeneratedSummaryStale ? summary.text : llmProse)
    : null

  const handleGenerate = useCallback(async () => {
    setIsGenerating(true)
    setLlmError(null)
    try {
      const data = buildLgeSummaryData(segStates, patternStates, rvInsertionPointFibrosis)
      const prose = await generateCmrLgeProse(data)
      setLlmProse(prose)
      setLlmProseSourceSignature(summarySignature)
    } catch (e) {
      setLlmError(e instanceof Error ? e.message : String(e))
    } finally {
      setIsGenerating(false)
    }
  }, [patternStates, rvInsertionPointFibrosis, segStates, summarySignature])
  const hasAnyPattern = useMemo(() => {
    for (let seg = 1; seg <= 17; seg++) {
      if (segStates[seg] > 0 && patternStates[seg] > 0) return true
    }
    return false
  }, [segStates, patternStates])

  const patternCounts = useMemo(() => {
    const counts: Record<number, number> = {}
    for (const [seg, p] of Object.entries(patternStates)) {
      if (p > 0 && segStates[Number(seg)] > 0) {
        counts[p] = (counts[p] || 0) + 1
      }
    }
    return counts
  }, [patternStates, segStates])
  const canGenerateSummary = summary.enhancedCount === 0 ? rvInsertionPointFibrosis : hasAnyPattern

  return (
    <Stack data-house-role="page" space="lg">
      <Row align="center" gap="md" wrap={false} className="house-page-title-row">
        <SectionMarker tone="report" size="title" className="self-stretch h-auto" />
        <PageHeader
          heading="Tissue characterisation"
          className="!ml-0 !mt-0"
        />
      </Row>

      {/* Context Metrics Tile */}
      {(() => {
        const m = contextMetrics
        const hasAny = m.nativeT1 !== undefined || m.postT1 !== undefined || m.ecv !== undefined ||
          m.nativeT2 !== undefined || m.t2star !== undefined || m.lvEf !== undefined || m.lvMassi !== undefined ||
          m.lvEdvi !== undefined || m.rvEf !== undefined || m.mrRf !== undefined ||
          m.pcwp !== undefined || m.mrap !== undefined || m.sbp !== undefined || m.dbp !== undefined
        if (!hasAny) return null

        type Metric = {
          label: string; value: number | undefined; unit: string; dp: number; derived?: boolean
          ll?: number; ul?: number; dir?: 'high' | 'low' | 'both'
          ref?: string // reference range text e.g. "950-1050"
        }

        // Severity: normal / mildly abnormal / significantly abnormal
        type Severity = 'normal' | 'mild' | 'significant' | 'unknown'
        const severity = (mt: Metric): Severity => {
          const v = mt.value
          if (v === undefined) return 'unknown'
          const lo = mt.ll, hi = mt.ul, d = mt.dir
          const isLow = lo !== undefined && v < lo && (d === 'low' || d === 'both')
          const isHigh = hi !== undefined && v > hi && (d === 'high' || d === 'both')
          if (!isLow && !isHigh) {
            if (lo !== undefined || hi !== undefined) return 'normal'
            return 'unknown'
          }
          // How far out of range (proportion of range width or fixed thresholds)
          if (isLow && lo !== undefined) {
            const deviation = (lo - v) / lo
            return deviation > 0.15 ? 'significant' : 'mild'
          }
          if (isHigh && hi !== undefined) {
            const deviation = (v - hi) / hi
            return deviation > 0.15 ? 'significant' : 'mild'
          }
          return 'mild'
        }

        const severityDot = (s: Severity) => {
          const col = s === 'normal' ? 'bg-emerald-500' : s === 'mild' ? 'bg-amber-500' : s === 'significant' ? 'bg-red-500' : 'bg-gray-300'
          return <span className={cn('inline-block h-2 w-2 rounded-full shrink-0', col)} />
        }

        type MetricWithKey = Metric & { key: string }
        type MetricRow = { label: string; metrics: MetricWithKey[] }
        // Row 1: Tissue characterisation
        const tissueRow: MetricRow = {
          label: 'Tissue',
          metrics: ([
            { key: 'nT1', label: 'Native T1', value: m.nativeT1, unit: 'ms', dp: 0, ll: 950, ul: 1050, dir: 'both' as const, ref: '950-1050' },
            { key: 'pcT1', label: 'Post-contrast T1', value: m.postT1, unit: 'ms', dp: 0, ll: 400, dir: 'low' as const, ref: '> 400' },
            { key: 'ecv', label: 'ECV', value: m.ecv, unit: '%', dp: 0, ul: 30, dir: 'high' as const, ref: '< 30' },
            { key: 'nT2', label: 'Native T2', value: m.nativeT2, unit: 'ms', dp: 0, ul: 55, dir: 'high' as const, ref: '< 55' },
            { key: 't2s', label: 'T2*', value: m.t2star, unit: 'ms', dp: 1, ll: 20, dir: 'low' as const, ref: '> 20' },
          ] as MetricWithKey[]).filter((mt) => mt.value !== undefined),
        }
        // Row 2: Structure & function
        const structRow: MetricRow = {
          label: 'Structure & function',
          metrics: ([
            { key: 'lvef', label: 'LV EF', value: m.lvEf, unit: '%', dp: 1, ll: 55, dir: 'low' as const },
            { key: 'rvef', label: 'RV EF', value: m.rvEf, unit: '%', dp: 1, ll: 45, dir: 'low' as const },
            { key: 'lvmi', label: 'LV mass (i)', value: m.lvMassi, unit: 'g/m^2', dp: 1, ul: 81, dir: 'high' as const },
            { key: 'lvedvi', label: 'LV EDV (i)', value: m.lvEdvi, unit: 'mL/m^2', dp: 1, ul: 98, dir: 'high' as const },
            { key: 'mrrf', label: 'MR RF', value: m.mrRf, unit: '%', dp: 1, ul: 20, dir: 'high' as const },
          ] as MetricWithKey[]).filter((mt) => mt.value !== undefined),
        }
        // Row 3: Derived haemodynamics
        const haemoRow: MetricRow = {
          label: 'Haemodynamics',
          metrics: ([
            { key: 'pcwp', label: 'PCWP', value: m.pcwp, unit: 'mmHg', dp: 1, derived: true, ul: 12, dir: 'high' as const },
            { key: 'mrap', label: 'mRAP', value: m.mrap, unit: 'mmHg', dp: 1, derived: true, ul: 8, dir: 'high' as const },
          ] as MetricWithKey[]).filter((mt) => mt.value !== undefined),
        }
        // Combine all rows for rendering (only tissue is shown currently)
        void structRow; void haemoRow  // reserved for future layout expansion

        const calcIcon = (
          <svg className="h-2.5 w-2.5 text-muted-foreground/40" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <rect x="2" y="1" width="12" height="14" rx="1.5" />
            <line x1="2" y1="5" x2="14" y2="5" />
            <line x1="5" y1="8" x2="11" y2="8" />
            <line x1="8" y1="5" x2="8" y2="11" />
            <line x1="5" y1="13" x2="11" y2="13" />
          </svg>
        )

        const renderCard = (mt: Metric & { key: string }) => {
          const s = severity(mt)
          return (
            <div
              key={mt.key}
              className="flex flex-col items-center rounded-xl border bg-white px-5 py-4 relative"
            >
              {/* Severity dot top-right */}
              <div className="absolute top-3 right-3">{severityDot(s)}</div>
              {/* Label */}
              <span className="text-sm font-medium text-muted-foreground flex items-center gap-1">
                {mt.label}
                {mt.derived && calcIcon}
              </span>
              {/* Value */}
              <span className="text-3xl font-bold tabular-nums text-foreground leading-tight mt-1">
                {mt.value!.toFixed(mt.dp)}
              </span>
              {/* Unit */}
              <span className="text-sm font-medium text-muted-foreground/80 mt-0.5">{mt.unit}</span>
              {/* Reference range */}
              {mt.ref && (
                <span className="text-sm text-muted-foreground/60 mt-1.5">{mt.ref}</span>
              )}
            </div>
          )
        }

        // 2 rows: row1 = Tissue(4) + Structure(2 of 5), row2 = Structure(3 of 5) + Haemodynamics(2+BP)
        // Use inline vertical separators between groups within each row

        return (
          <div className="flex gap-2.5">
            {tissueRow.metrics.map((mt) => (
              <div key={mt.key} className="flex-1 min-w-0">{renderCard(mt)}</div>
            ))}
          </div>
        )
      })()}

      <div className="border-t-2 border-border/30" />

      {/* Controls */}
      <div className="flex flex-col gap-3">
        {/* Pattern selector */}
        <div className="flex items-center gap-4 flex-wrap">
          <div className="flex items-center gap-2">
            <div className="flex rounded-full bg-muted/50 p-0.5 ring-1 ring-border/50">
              {LGE_PATTERNS.slice(1).map((p) => {
                const isActive = activePattern === p.code
                return (
                  <button
                    key={p.code}
                    type="button"
                    onClick={() => {
                      setActivePattern(p.code as PatternCode)
                    }}
                    className={cn(
                      'rounded-full px-3 py-1 text-xs font-medium transition-all',
                      isActive
                        ? 'shadow-sm'
                        : 'text-muted-foreground hover:text-foreground',
                    )}
                    style={isActive
                      ? { backgroundColor: p.strokeColor, color: p.code === 1 ? 'black' : 'white' }
                      : undefined
                    }
                  >
                    {p.label}
                  </button>
                )
              })}
            </div>
          </div>

          <div className="h-5 w-px bg-border/40" />

          {/* Pattern key (inline) */}
          {LGE_PATTERNS.slice(1).map((p) => (
            <span key={p.code} className="flex items-center gap-1.5">
              <span
                className="inline-block h-3 w-3 rounded-sm border-2"
                style={{ borderColor: p.strokeColor, backgroundColor: 'transparent' }}
              />
              <span className="text-[11px] text-muted-foreground">{p.label}</span>
            </span>
          ))}

          <button
            type="button"
            onClick={() => {
              setRvInsertionPointFibrosis((current) => !current)
            }}
            className={cn(
              'rounded-full px-3 py-1 text-xs font-medium transition-all ring-1',
              rvInsertionPointFibrosis
                ? 'bg-foreground text-background ring-foreground/20'
                : 'text-muted-foreground ring-border/50 hover:text-foreground hover:bg-muted/50',
            )}
          >
            RV insertion point fibrosis
          </button>

          {/* Reset: pushed to far right */}
          <button
            type="button"
            onClick={resetAll}
            className="ml-auto rounded-full px-3 py-1 text-xs font-medium text-red-600 ring-1 ring-red-300 hover:bg-red-50 hover:text-red-700 transition-all"
          >
            Reset All
          </button>
        </div>
      </div>

      {/* Hovered segment info */}
      <div className="h-5 text-xs text-muted-foreground">
        {hoveredSeg != null && (
          <span>
            <strong>{segLabel(hoveredSeg)}</strong>
            {' - '}
            {LGE_STATES[segStates[hoveredSeg] ?? 0].label}
            {patternStates[hoveredSeg] > 0 && segStates[hoveredSeg] > 0 && ` | ${LGE_PATTERNS[patternStates[hoveredSeg]].label}`}
          </span>
        )}
      </div>

      {/* SVG views */}
      <div className="flex items-start justify-between">
        {/* Bullseye */}
        <div className="text-center">
          <p className="mb-2 text-xs font-semibold tracking-wider text-muted-foreground">BULLSEYE</p>
          <svg viewBox={bullseye.viewBox} width={320} height={330}>
            <g transform={CMR_BULLSEYE_ROTATION_TRANSFORM}>
              {bullseyePathEntries.filter(([name]) => segNum(name) <= CMR_BULLSEYE_ROTATED_SEGMENT_MAX).map(([name, d]) => {
                const seg = segNum(name)
                const hasPattern = patternStates[seg] > 0 && segStates[seg] > 0
                return (
                  <path
                    key={name}
                    d={d}
                    fill={segColor(seg)}
                    stroke={segStroke(seg)}
                    strokeWidth={hasPattern ? 2.5 : 1.5}
                    className="cursor-pointer"
                    onClick={() => paintSegment(seg)}
                    onContextMenu={(e) => { e.preventDefault(); paintSegment(seg, -1) }}
                    onMouseEnter={() => setHoveredSeg(seg)}
                    onMouseLeave={() => setHoveredSeg(null)}
                  />
                )
              })}
            </g>
            {bullseyePathEntries.filter(([name]) => segNum(name) > CMR_BULLSEYE_ROTATED_SEGMENT_MAX).map(([name, d]) => {
              const seg = segNum(name)
              const hasPattern = patternStates[seg] > 0 && segStates[seg] > 0
              return (
                <path
                  key={name}
                  d={d}
                  fill={segColor(seg)}
                  stroke={segStroke(seg)}
                  strokeWidth={hasPattern ? 2.5 : 1.5}
                  className="cursor-pointer"
                  onClick={() => paintSegment(seg)}
                  onContextMenu={(e) => { e.preventDefault(); paintSegment(seg, -1) }}
                  onMouseEnter={() => setHoveredSeg(seg)}
                  onMouseLeave={() => setHoveredSeg(null)}
                />
              )
            })}
            {/* Seg 17 apex */}
            {(() => {
              const hasPattern17 = patternStates[17] > 0 && segStates[17] > 0
              return (
                <circle
                  cx={86}
                  cy={88}
                  r={8}
                  fill={segColor(17)}
                  stroke={segStroke(17)}
                  strokeWidth={hasPattern17 ? 2.5 : 1.5}
                  className="cursor-pointer"
                  onClick={() => paintSegment(17)}
                  onContextMenu={(e) => { e.preventDefault(); paintSegment(17, -1) }}
                  onMouseEnter={() => setHoveredSeg(17)}
                  onMouseLeave={() => setHoveredSeg(null)}
                />
              )
            })()}
          </svg>
        </div>

        {/* Divider */}
        <div className="self-stretch w-px bg-border" />

        {/* Long-axis views */}
        {(['4CH', '2CH', '3CH'] as const).map((view) => {
          const vd = views[view]
          const [tx, ty] = OUTLINE_NUDGE[view] ?? [0, 0]
          const vbParts = vd.viewBox.split(' ')
          vbParts[3] = String(Number(vbParts[3]) + 5)
          const vb = vbParts.join(' ')

          return (
            <div key={view} className="text-center">
              <p className="mb-2 text-xs font-semibold tracking-wider text-muted-foreground">
                {view === '4CH' ? '4-CHAMBER' : view === '2CH' ? '2-CHAMBER' : '3-CHAMBER'}
              </p>
              <svg viewBox={vb} height={350} style={{ width: 'auto' }} className="mx-auto">
                {/* Outline */}
                {vd.outline &&
                  (Array.isArray(vd.outline) ? vd.outline : [vd.outline]).map((p, i) => (
                    <path
                      key={`outline-${i}`}
                      d={p}
                      fill="#e8e8e8"
                      stroke="#ccc"
                      strokeWidth={0.5}
                      transform={tx || ty ? `translate(${tx},${ty})` : undefined}
                    />
                  ))}
                {/* Segments */}
                {Object.entries(vd.paths).map(([name, d]) => {
                  const seg = segNum(name)
                  const hasPattern = patternStates[seg] > 0 && segStates[seg] > 0
                  return (
                    <path
                      key={name}
                      d={d}
                      fill={segColor(seg)}
                      stroke={segStroke(seg)}
                      strokeWidth={hasPattern ? 1.8 : 0.8}
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


      {/* Segment summary */}
      <div className="rounded-lg border border-border bg-muted/30 p-4">
        <div className="flex items-center gap-2 mb-2 flex-wrap">
          <span className="text-xs font-semibold tracking-wider text-muted-foreground">SEGMENT SUMMARY</span>
          {summary.enhancedCount > 0 && (
            <span className="rounded-full px-2.5 py-0.5 text-xs font-semibold text-white" style={{ backgroundColor: 'hsl(350 60% 48%)' }}>
              {summary.enhancedCount}/17 ENHANCED
            </span>
          )}
          {summary.scoreIndex > 0 && (
            <span className="rounded-full px-2.5 py-0.5 text-xs font-semibold text-white bg-foreground/70">
              INDEX {summary.scoreIndex.toFixed(2)}
            </span>
          )}
          {rvInsertionPointFibrosis && (
            <span className="rounded-full px-2.5 py-0.5 text-xs font-semibold bg-amber-100 text-amber-900">
              RV insertion point fibrosis
            </span>
          )}
          {Object.entries(patternCounts).map(([code, count]) => (
            <span
              key={code}
              className="rounded-full px-2.5 py-0.5 text-xs font-semibold"
              style={{
                backgroundColor: LGE_PATTERNS[Number(code)].strokeColor,
                color: Number(code) === 1 ? 'black' : 'white',
              }}
            >
              {count} {LGE_PATTERNS[Number(code)].label}
            </span>
          ))}
        </div>

        {displayedSummaryText !== null && (
          <p className="mt-3 text-sm leading-relaxed text-foreground/80 whitespace-pre-wrap">
            {displayedSummaryText}
          </p>
        )}

        {llmError && (
          <p className="mt-2 text-xs text-red-500">{llmError}</p>
        )}
        {isGeneratedSummaryStale && (
          <p className="mt-2 text-xs text-muted-foreground italic">
            Showing the updated deterministic summary. Regenerate to refresh the prose.
          </p>
        )}

        <div className="flex items-center gap-3 mt-3">
          <button
            type="button"
            disabled={!canGenerateSummary || isGenerating}
            onClick={handleGenerate}
            className={cn(
              'rounded-full px-4 py-1.5 text-xs font-medium transition-all',
              'bg-foreground text-background hover:bg-foreground/90',
              'disabled:opacity-40 disabled:cursor-not-allowed',
            )}
          >
            {isGenerating
              ? 'Generating\u2026'
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
          {summary.enhancedCount > 0 && !hasAnyPattern && (
            <span className="text-xs text-muted-foreground italic">Assign a pattern to generate summary</span>
          )}
        </div>
      </div>
    </Stack>
  )
}
