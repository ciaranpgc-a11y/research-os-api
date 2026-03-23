import { useCallback, useMemo, useState } from 'react'

import { PageHeader, Row, Stack } from '@/components/primitives'
import { SectionMarker } from '@/components/patterns'
import { cn } from '@/lib/utils'
import rwmaPaths from '@/data/rwma-paths.json'

// ---------------------------------------------------------------------------
// AHA 17-segment metadata (standard Cerqueira et al. 2002 territories)
// ---------------------------------------------------------------------------

type SegmentMeta = { level: string; wall: string; territory: 'LAD' | 'RCA' | 'LCx' }

const SEGMENT_META: Record<number, SegmentMeta> = {
  1: { level: 'Basal', wall: 'Anterior', territory: 'LAD' },
  2: { level: 'Basal', wall: 'Anteroseptal', territory: 'LAD' },
  3: { level: 'Basal', wall: 'Inferoseptal', territory: 'RCA' },
  4: { level: 'Basal', wall: 'Inferior', territory: 'RCA' },
  5: { level: 'Basal', wall: 'Inferolateral', territory: 'LCx' },
  6: { level: 'Basal', wall: 'Anterolateral', territory: 'LCx' },
  7: { level: 'Mid', wall: 'Anterior', territory: 'LAD' },
  8: { level: 'Mid', wall: 'Anteroseptal', territory: 'LAD' },
  9: { level: 'Mid', wall: 'Inferoseptal', territory: 'RCA' },
  10: { level: 'Mid', wall: 'Inferior', territory: 'RCA' },
  11: { level: 'Mid', wall: 'Inferolateral', territory: 'LCx' },
  12: { level: 'Mid', wall: 'Anterolateral', territory: 'LCx' },
  13: { level: 'Apical', wall: 'Anterior', territory: 'LAD' },
  14: { level: 'Apical', wall: 'Septal', territory: 'LAD' },
  15: { level: 'Apical', wall: 'Inferior', territory: 'RCA' },
  16: { level: 'Apical', wall: 'Lateral', territory: 'LCx' },
  17: { level: 'Apex', wall: 'Apex', territory: 'LAD' },
}

// ---------------------------------------------------------------------------
// RWMA state definitions
// ---------------------------------------------------------------------------

const RWMA_STATES = [
  { code: 0, label: 'Normal', color: 'hsl(164 40% 45%)' },
  { code: 1, label: 'Hypokinesis', color: 'hsl(45 85% 58%)' },
  { code: 2, label: 'Akinesis', color: 'hsl(30 75% 50%)' },
  { code: 3, label: 'Dyskinesis', color: 'hsl(3 55% 48%)' },
] as const

type RwmaCode = 0 | 1 | 2 | 3

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function segNum(name: string): number {
  const m = name.match(/RWMA_(\d+)/)
  return m ? parseInt(m[1]) : 0
}

function segLabel(seg: number): string {
  const m = SEGMENT_META[seg]
  return m ? `Seg ${seg}: ${m.level} ${m.wall} (${m.territory})` : `Seg ${seg}`
}

// ---------------------------------------------------------------------------
// Typed data from JSON
// ---------------------------------------------------------------------------

type ViewData = {
  viewBox: string
  paths: Record<string, string>
  outline?: string | string[]
}

const bullseye = rwmaPaths.bullseye as { viewBox: string; paths: Record<string, string> }
const views: Record<string, ViewData> = {
  '4CH': rwmaPaths['4CH'] as ViewData,
  '2CH': rwmaPaths['2CH'] as ViewData,
  '3CH': rwmaPaths['3CH'] as ViewData,
}

// 4CH outline nudge
const OUTLINE_NUDGE: Record<string, [number, number]> = {
  '4CH': [-2, 3],
}

// ---------------------------------------------------------------------------
// RWMA summary generator (BSCMR style)
// ---------------------------------------------------------------------------

type WmsiSeverity = 'normal' | 'mild' | 'moderate' | 'severe'

const WMSI_SEVERITY_COLORS: Record<WmsiSeverity, string> = {
  normal: 'hsl(164 40% 45%)',
  mild: 'hsl(45 85% 58%)',
  moderate: 'hsl(30 75% 50%)',
  severe: 'hsl(3 55% 48%)',
}

type RwmaSummary = {
  text: string
  wmsi: number
  severity: WmsiSeverity
  hasAbnormality: boolean
  territories: string[]
}

function generateRwmaSummary(segStates: Record<number, RwmaCode>): RwmaSummary {
  // WMSI: clinical scoring is 1=normal, 2=hypo, 3=akinesis, 4=dyskinesis
  const totalScore = Object.values(segStates).reduce<number>((sum, c) => sum + (c + 1), 0)
  const wmsi = totalScore / 17
  const severity: WmsiSeverity = wmsi <= 1.0 ? 'normal' : wmsi < 1.6 ? 'mild' : wmsi < 2.0 ? 'moderate' : 'severe'

  const abnormal = Object.entries(segStates)
    .filter(([, code]) => code > 0)
    .map(([seg, code]) => ({ seg: Number(seg), code, meta: SEGMENT_META[Number(seg)] }))

  if (abnormal.length === 0) {
    return { text: 'Normal wall motion. No regional wall motion abnormalities identified.', wmsi, severity, hasAbnormality: false, territories: [] }
  }

  const severityLabel = severity === 'normal' ? '' : ` (${severity})`

  // Check global patterns (all 17 segments same state)
  const allSame = abnormal.length === 17 && abnormal.every((a) => a.code === abnormal[0].code)
  if (allSame) {
    return {
      text: `Global ${RWMA_STATES[abnormal[0].code].label.toLowerCase()}. Wall motion score index ${wmsi.toFixed(2)}${severityLabel}.`,
      wmsi, severity, hasAbnormality: true, territories: ['LAD', 'RCA', 'LCx'],
    }
  }

  // Group by motion type for description
  const byType: Record<number, typeof abnormal> = {}
  for (const a of abnormal) {
    if (!byType[a.code]) byType[a.code] = []
    byType[a.code].push(a)
  }

  // Build wall descriptions grouped by type
  const parts: string[] = []
  for (const code of [1, 2, 3] as const) {
    const segs = byType[code]
    if (!segs || segs.length === 0) continue
    const label = RWMA_STATES[code].label.toLowerCase()
    const { prefix, body } = describeWalls(segs)
    parts.push(`${label} ${prefix}${body}`)
  }

  // Assess territorial distribution
  const { text: territoryStr, territories } = assessTerritorialPattern(abnormal)

  const sentences = [`Regional wall motion abnormality: ${parts.join('; ')}.`]
  if (territoryStr) sentences.push(territoryStr)
  sentences.push(`Wall motion score index ${wmsi.toFixed(2)}${severityLabel}.`)

  return { text: sentences.join(' '), wmsi, severity, hasAbnormality: true, territories }
}

type TerritoryResult = { text: string | null; territories: string[] }

/**
 * Assess whether abnormal segments form a recognisable coronary territorial
 * pattern. Only describes territory when ≥2 contiguous segments in the same
 * territory are affected — isolated single-segment abnormalities are described
 * by wall location alone without implying a territorial distribution.
 */
function assessTerritorialPattern(
  abnormal: { seg: number; code: number; meta: SegmentMeta }[],
): TerritoryResult {
  // Group abnormal segments by territory
  const byTerritory: Record<string, number[]> = {}
  for (const a of abnormal) {
    const t = a.meta.territory
    if (!byTerritory[t]) byTerritory[t] = []
    byTerritory[t].push(a.seg)
  }

  // Count how many segments exist per territory in the full 17-segment model
  const totalPerTerritory: Record<string, number> = {}
  for (const m of Object.values(SEGMENT_META)) {
    totalPerTerritory[m.territory] = (totalPerTerritory[m.territory] || 0) + 1
  }

  // Only report territories where ≥2 segments are affected
  const significantTerritories: string[] = []
  for (const [territory, segs] of Object.entries(byTerritory)) {
    if (segs.length >= 2) {
      significantTerritories.push(territory)
    }
  }

  if (significantTerritories.length === 0) return { text: null, territories: [] }

  // Check if the pattern is clearly territorial (most abnormal segs fall in one territory)
  if (significantTerritories.length === 1) {
    const t = significantTerritories[0]
    const affected = byTerritory[t].length
    const total = totalPerTerritory[t]
    if (affected >= total - 1) {
      return { text: `Distribution consistent with ${t} coronary territory.`, territories: [t] }
    }
    return { text: `Distribution suggests ${t} territory involvement.`, territories: [t] }
  }

  // Multiple territories
  const sorted = significantTerritories.sort()
  return { text: `Distribution involves ${joinList(sorted)} territories.`, territories: sorted }
}

/** Number of wall segments per level (excluding apex) */
const SEGS_PER_LEVEL: Record<string, number> = { basal: 6, mid: 6, apical: 4 }

/**
 * Describe a set of abnormal segments concisely.
 * Returns { prefix, body } where prefix is "of the " or "at the " etc.
 * to allow the caller to build natural sentences.
 *
 * Examples:
 *   - "of the basal and mid inferoseptal wall"
 *   - "at the mid level (circumferential)"
 *   - "of the apex"
 *   - "of the basal anterior wall and apex"
 */
function describeWalls(segs: { seg: number; meta: SegmentMeta }[]): { prefix: string; body: string } {
  // Group by level
  const byLevel: Record<string, string[]> = {}
  let hasApex = false
  for (const s of segs) {
    const level = s.meta.level.toLowerCase()
    if (level === 'apex') { hasApex = true; continue }
    if (!byLevel[level]) byLevel[level] = []
    byLevel[level].push(s.meta.wall.toLowerCase())
  }

  // Separate circumferential levels from partial levels
  const circumferentialLevels: string[] = []
  const remainingSegs: { seg: number; meta: SegmentMeta }[] = []
  for (const [level, walls] of Object.entries(byLevel)) {
    if (walls.length === SEGS_PER_LEVEL[level]) {
      circumferentialLevels.push(level)
    } else {
      for (const s of segs) {
        if (s.meta.level.toLowerCase() === level) remainingSegs.push(s)
      }
    }
  }

  // Group remaining segments by level, then list wall names
  const remainingByLevel: Record<string, string[]> = {}
  for (const s of remainingSegs) {
    const level = s.meta.level.toLowerCase()
    if (!remainingByLevel[level]) remainingByLevel[level] = []
    remainingByLevel[level].push(s.meta.wall.toLowerCase())
  }

  // Check if the same wall appears at multiple levels — group by wall instead
  const byWall: Record<string, string[]> = {}
  for (const s of remainingSegs) {
    const wall = s.meta.wall.toLowerCase()
    if (!byWall[wall]) byWall[wall] = []
    byWall[wall].push(s.meta.level.toLowerCase())
  }

  // Decide grouping strategy: if most walls span multiple levels, group by wall; otherwise by level
  const multiLevelWalls = Object.values(byWall).filter((levels) => levels.length > 1).length
  const singleLevelWalls = Object.values(byWall).filter((levels) => levels.length === 1).length

  const wallDescriptions: string[] = []
  if (multiLevelWalls > singleLevelWalls) {
    // Group by wall name: "basal and mid anterior wall"
    for (const [wall, levels] of Object.entries(byWall)) {
      wallDescriptions.push(`${joinList(levels)} ${wall} wall`)
    }
  } else {
    // Group by level: "mid anteroseptal, inferoseptal, and inferior walls"
    for (const [level, walls] of Object.entries(remainingByLevel)) {
      if (walls.length === 1) {
        wallDescriptions.push(`${level} ${walls[0]} wall`)
      } else {
        wallDescriptions.push(`${level} ${joinList(walls)} walls`)
      }
    }
  }

  // Build final description
  const parts: string[] = []

  // Circumferential levels use "at the X level" phrasing
  if (circumferentialLevels.length > 0 && wallDescriptions.length === 0 && !hasApex) {
    if (circumferentialLevels.length === 1) {
      return { prefix: 'at the ', body: `${circumferentialLevels[0]} level (circumferential)` }
    }
    return { prefix: 'at the ', body: `${joinList(circumferentialLevels)} levels (circumferential)` }
  }

  // Mixed: circumferential + specific walls
  for (const level of circumferentialLevels) {
    parts.push(`${level} level circumferentially`)
  }
  parts.push(...wallDescriptions)
  // "the apex" when joining with other parts; plain "apex" when alone (prefix provides "of the")
  if (hasApex) {
    if (parts.length > 0) parts.push('the apex')
    else return { prefix: 'of the ', body: 'apex' }
  }

  if (parts.length === 0) return { prefix: 'of the ', body: 'apex' }

  // When multiple parts each contain internal "and", use semicolons to avoid ambiguity
  const hasInternalAnd = parts.filter((p) => p.includes(' and ')).length > 1
  if (hasInternalAnd) {
    return { prefix: 'of the ', body: parts.join('; ') }
  }
  return { prefix: 'of the ', body: joinList(parts) }
}

/** Join a list with commas and "and" (Oxford comma for 3+) */
function joinList(items: string[]): string {
  if (items.length === 1) return items[0]
  if (items.length === 2) return `${items[0]} and ${items[1]}`
  return items.slice(0, -1).join(', ') + ', and ' + items[items.length - 1]
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function CmrRwmaPage() {
  const [segStates, setSegStates] = useState<Record<number, RwmaCode>>(() => {
    const init: Record<number, RwmaCode> = {}
    for (let i = 1; i <= 17; i++) init[i] = 0
    return init
  })

  const [activeBrush, setActiveBrush] = useState<RwmaCode>(0)
  const [hoveredSeg, setHoveredSeg] = useState<number | null>(null)

  const paintSegment = useCallback(
    (seg: number) => {
      setSegStates((prev) => {
        const next = { ...prev }
        if (prev[seg] === activeBrush) {
          next[seg] = ((activeBrush + 1) % 4) as RwmaCode
          setActiveBrush(next[seg])
        } else {
          next[seg] = activeBrush
        }
        return next
      })
    },
    [activeBrush],
  )

  const resetAll = useCallback(() => {
    const init: Record<number, RwmaCode> = {}
    for (let i = 1; i <= 17; i++) init[i] = 0
    setSegStates(init)
  }, [])

  const segColor = (seg: number) => RWMA_STATES[segStates[seg] ?? 0].color

  const { text: summaryText, severity, hasAbnormality, territories } = useMemo(() => generateRwmaSummary(segStates), [segStates])

  return (
    <Stack data-house-role="page" space="lg">
      <Row align="center" gap="md" wrap={false} className="house-page-title-row">
        <SectionMarker tone="report" size="title" className="self-stretch h-auto" />
        <PageHeader
          heading="Wall motion"
          className="!ml-0 !mt-0"
        />
      </Row>

      {/* ── Controls bar ── */}
      <div className="flex items-center gap-4 flex-wrap">
        {/* Brush selector */}
        <div className="flex items-center gap-2">

          <div className="flex rounded-full bg-muted/50 p-0.5 ring-1 ring-border/50">
            {RWMA_STATES.map((s) => (
              <button
                key={s.code}
                type="button"
                onClick={() => setActiveBrush(s.code as RwmaCode)}
                className={cn(
                  'rounded-full px-3 py-1 text-xs font-medium transition-all',
                  activeBrush === s.code
                    ? s.code === 1 ? 'text-black shadow-sm' : 'text-white shadow-sm'
                    : 'text-muted-foreground hover:text-foreground',
                )}
                style={activeBrush === s.code ? { backgroundColor: s.color } : undefined}
              >
                {s.label}
              </button>
            ))}
          </div>
        </div>

        <div className="h-5 w-px bg-border/40" />

        {/* Colour key (inline) */}
        {RWMA_STATES.map((s) => (
          <span key={s.code} className="flex items-center gap-1.5">
            <span className="inline-block h-3 w-3 rounded-sm" style={{ backgroundColor: s.color }} />
            <span className="text-[11px] text-muted-foreground">{s.label}</span>
          </span>
        ))}

        {/* Reset — far right */}
        <button
          type="button"
          onClick={resetAll}
          className="ml-auto rounded-full px-3 py-1 text-xs font-medium text-red-600 ring-1 ring-red-300 hover:bg-red-50 hover:text-red-700 transition-all"
        >
          Reset All
        </button>
      </div>

      {/* ── Hovered segment info ── */}
      <div className="h-5 text-xs text-muted-foreground">
        {hoveredSeg != null && (
          <span>
            <strong>{segLabel(hoveredSeg)}</strong>
            {' — '}
            {RWMA_STATES[segStates[hoveredSeg] ?? 0].label}
          </span>
        )}
      </div>

      {/* ── SVG views ── */}
      <div className="flex items-start justify-between">
        {/* Bullseye */}
        <div className="text-center">
          <p className="mb-2 text-xs font-semibold tracking-wider text-muted-foreground">BULLSEYE</p>
          <svg viewBox={bullseye.viewBox} width={320} height={330}>
            {Object.entries(bullseye.paths).map(([name, d]) => {
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
            {/* Seg 17 apex */}
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


      {/* ── BSCMR Summary ── */}
      <div className="rounded-lg border border-border bg-muted/30 p-4">
        <div className="flex items-center gap-2 mb-2">
          <span className="text-xs font-semibold tracking-wider text-muted-foreground">REPORT SUMMARY</span>
          {hasAbnormality && (
            <span
              className={cn('rounded-full px-2.5 py-0.5 text-xs font-semibold', severity === 'mild' ? 'text-black' : 'text-white')}
              style={{ backgroundColor: WMSI_SEVERITY_COLORS[severity] }}
            >
              {severity.toUpperCase()}
            </span>
          )}
          {territories.map((t) => (
            <span
              key={t}
              className="rounded-full px-2.5 py-0.5 text-xs font-semibold text-white bg-foreground/70"
            >
              {t}
            </span>
          ))}
        </div>
        <p className="text-sm leading-relaxed">{summaryText}</p>
      </div>
    </Stack>
  )
}
