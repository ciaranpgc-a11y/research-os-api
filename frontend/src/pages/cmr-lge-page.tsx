import { useCallback, useMemo, useState } from 'react'

import { PageHeader, Row, Stack } from '@/components/primitives'
import { SectionMarker } from '@/components/patterns'
import { cn } from '@/lib/utils'
import rwmaPaths from '@/data/rwma-paths.json'
import { buildLgeSummaryData } from '@/lib/lge-summary-data'

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
// LGE transmurality states (SCMR 5-point scale)
// ---------------------------------------------------------------------------

const LGE_STATES = [
  { code: 0, label: 'None', shortLabel: '0%', color: 'hsl(164 40% 45%)' },
  { code: 1, label: '1–25%', shortLabel: '1–25%', color: 'hsl(15 70% 75%)' },
  { code: 2, label: '26–50%', shortLabel: '26–50%', color: 'hsl(5 65% 62%)' },
  { code: 3, label: '51–75%', shortLabel: '51–75%', color: 'hsl(350 60% 48%)' },
  { code: 4, label: '76–100%', shortLabel: '76–100%', color: 'hsl(340 65% 32%)' },
] as const

type LgeCode = 0 | 1 | 2 | 3 | 4

// ---------------------------------------------------------------------------
// Enhancement pattern (intramural distribution per SCMR)
// ---------------------------------------------------------------------------

const LGE_PATTERNS = [
  { code: 0, label: 'None', strokeColor: 'white' },
  { code: 1, label: 'Subendocardial', strokeColor: 'hsl(45 90% 50%)' },
  { code: 2, label: 'Mid-wall', strokeColor: 'hsl(200 85% 55%)' },
  { code: 3, label: 'Subepicardial', strokeColor: 'hsl(275 65% 55%)' },
  { code: 4, label: 'Transmural', strokeColor: 'hsl(0 0% 20%)' },
] as const

type PatternCode = 0 | 1 | 2 | 3 | 4

// ---------------------------------------------------------------------------
// Validation rules: transmurality ↔ pattern constraints
// ---------------------------------------------------------------------------

// Transmural pattern requires 76–100% transmurality.
// Sub-total patterns (subendo, mid-wall, subepi) require <76% transmurality.
// Setting transmurality to 76–100% auto-sets pattern to transmural.
// Setting transmurality below 76% on a transmural-patterned segment clears the pattern.
// Setting a non-transmural pattern on a 76–100% segment drops transmurality to 51–75%.

function reconcileAfterTransmurality(
  newTrans: LgeCode,
  currentPattern: PatternCode,
): { trans: LgeCode; pattern: PatternCode } {
  if (newTrans === 0) return { trans: 0, pattern: 0 }
  if (newTrans === 4) return { trans: 4, pattern: 4 } // 76–100% → auto transmural
  // Sub-total transmurality: if pattern was transmural, clear it (user can set manually)
  if (currentPattern === 4) return { trans: newTrans, pattern: 0 }
  // Otherwise keep whatever pattern was set (or 0 if none)
  return { trans: newTrans, pattern: currentPattern }
}

function reconcileAfterPattern(
  newPattern: PatternCode,
  currentTrans: LgeCode,
): { trans: LgeCode; pattern: PatternCode } {
  if (newPattern === 0) return { trans: currentTrans, pattern: 0 }
  if (newPattern === 4) return { trans: 4, pattern: 4 } // transmural pattern → force 76–100%
  // Non-transmural pattern on 76–100% segment → drop to 51–75%
  if (currentTrans === 4) return { trans: 3, pattern: newPattern }
  // Non-transmural on no-enhancement → set to 1–25% minimum
  if (currentTrans === 0) return { trans: 1, pattern: newPattern }
  return { trans: currentTrans, pattern: newPattern }
}

// ---------------------------------------------------------------------------
// Additional findings (not segment-based)
// ---------------------------------------------------------------------------


// ---------------------------------------------------------------------------
// Brush modes
// ---------------------------------------------------------------------------


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

/** Join a list with commas and "and" (Oxford comma for 3+) */
function joinList(items: string[]): string {
  if (items.length === 0) return ''
  if (items.length === 1) return items[0]
  if (items.length === 2) return `${items[0]} and ${items[1]}`
  return items.slice(0, -1).join(', ') + ', and ' + items[items.length - 1]
}

/** Is a segment description grammatically plural? */
function isDescPlural(desc: string): boolean {
  if (desc.includes(';')) return true
  if (desc.endsWith('walls')) return true
  // Multiple wall references = plural ("X wall and Y wall")
  if ((desc.match(/\bwall\b/g) || []).length > 1) return true
  // "X wall and the apex" = two subjects → plural
  if (desc.includes('the apex') && desc.length > 8) return true
  return false
}

// ---------------------------------------------------------------------------
// LGE summary generator
// ---------------------------------------------------------------------------

const TRANSMURALITY_LABELS: Record<number, string> = {
  1: '1–25%',
  2: '26–50%',
  3: '51–75%',
  4: '76–100%',
}

const PATTERN_ADJECTIVES: Record<number, string> = {
  1: 'subendocardial',
  2: 'mid-wall',
  3: 'subepicardial',
  4: 'transmural',
}

type EnhancedSeg = {
  seg: number
  trans: LgeCode
  pattern: PatternCode
  meta: SegmentMeta
}

type LgeSummary = {
  text: string
  scoreIndex: number
  enhancedCount: number
}

/**
 * How many levels each wall spans in the AHA 17-segment model.
 * Anterior and inferior span 3 levels (basal, mid, apical).
 * Anteroseptal, inferoseptal, inferolateral, anterolateral span 2 (basal, mid).
 * Septal and lateral appear only at apical level.
 */
const WALL_MAX_LEVELS: Record<string, number> = {
  anterior: 3, anteroseptal: 2, inferoseptal: 2, inferior: 3,
  inferolateral: 2, anterolateral: 2, septal: 1, lateral: 1,
}

/**
 * Describe a set of segments naturally using wall-based grouping.
 *
 * Strategy:
 * 1. Build a map of wall → levels present.
 * 2. Group walls that share the same level-set together (e.g. anterior + anteroseptal
 *    both at [basal, mid] → "basal and mid anterior and anteroseptal walls").
 * 3. When all levels of a wall are present, omit the level prefix
 *    (e.g. "anterior wall" rather than "basal, mid, and apical anterior wall").
 * 4. Use "walls" plural when multiple wall names are combined.
 */
function describeSegments(segs: EnhancedSeg[]): string {
  let hasApex = false

  // Build wall → levels map
  const byWall: Record<string, string[]> = {}
  for (const s of segs) {
    const level = s.meta.level.toLowerCase()
    if (level === 'apex') { hasApex = true; continue }
    const wall = s.meta.wall.toLowerCase()
    if (!byWall[wall]) byWall[wall] = []
    if (!byWall[wall].includes(level)) byWall[wall].push(level)
  }

  // Group walls that share the same level-set
  const levelSetGroups: Record<string, string[]> = {}
  for (const [wall, levels] of Object.entries(byWall)) {
    const isComplete = levels.length === WALL_MAX_LEVELS[wall]
    // Key: either "COMPLETE" or sorted level list
    const key = isComplete ? 'COMPLETE' : levels.sort().join(',')
    if (!levelSetGroups[key]) levelSetGroups[key] = []
    levelSetGroups[key].push(wall)
  }

  const SEGS_PER_LEVEL: Record<string, number> = { basal: 6, mid: 6, apical: 4 }

  const parts: string[] = []
  for (const [key, walls] of Object.entries(levelSetGroups)) {
    if (key === 'COMPLETE') {
      // All levels present — omit level prefix
      const wallNames = joinList(walls)
      parts.push(`${wallNames} ${walls.length === 1 ? 'wall' : 'walls'}`)
    } else {
      const levels = key.split(',')
      // Check if this covers all walls at these levels (circumferential)
      const isCircumferential = levels.length === 1 && walls.length === SEGS_PER_LEVEL[levels[0]]
      if (isCircumferential) {
        parts.push(`${levels[0]} segments circumferentially`)
      } else {
        const levelPrefix = joinList(levels)
        const wallNames = joinList(walls)
        parts.push(`${levelPrefix} ${wallNames} ${walls.length === 1 ? 'wall' : 'walls'}`)
      }
    }
  }

  if (hasApex) {
    if (parts.length > 0) parts.push('the apex')
    else return 'apex'
  }

  // Use semicolons when ANY part contains internal "and" to avoid double "and" ambiguity
  const hasInternalAnd = parts.some((p) => p.includes(' and '))
  if (hasInternalAnd && parts.length > 1) return parts.join('; ')
  return joinList(parts)
}

/**
 * Generate a clinical LGE summary following SCMR reporting conventions.
 *
 * Structure:
 * 1. Presence/absence statement
 * 2. Ischaemic LGE description (subendocardial/transmural in coronary territory)
 * 3. Non-ischaemic LGE description (mid-wall, subepicardial)
 * 4. Viability assessment (for ischaemic segments)
 * 5. Quantification (LGE Score Index, extent)
 * 6. Additional findings
 */
function generateLgeSummary(
  segStates: Record<number, LgeCode>,
  patternStates: Record<number, PatternCode>,
): LgeSummary {
  // Compute LGE Score Index
  const scoreIndex = Object.values(segStates).reduce((sum, c) => sum + c, 0) / 17

  // Gather enhanced segments
  const enhanced: EnhancedSeg[] = []
  for (let seg = 1; seg <= 17; seg++) {
    if (segStates[seg] > 0) {
      enhanced.push({
        seg,
        trans: segStates[seg],
        pattern: patternStates[seg],
        meta: SEGMENT_META[seg],
      })
    }
  }

  // No enhancement
  if (enhanced.length === 0) {
    return {
      text: 'No late gadolinium enhancement to suggest myocardial scar or fibrosis.',
      scoreIndex: 0,
      enhancedCount: 0,
    }
  }

  const sentences: string[] = []

  // --- Classify segments as ischaemic vs non-ischaemic ---
  // Ischaemic: subendocardial (pattern 1) or transmural (pattern 4) — these follow coronary territories
  // Non-ischaemic: mid-wall (pattern 2) or subepicardial (pattern 3)
  // Unspecified pattern (0) with enhancement: report by transmurality only
  const ischaemic = enhanced.filter((s) => s.pattern === 1 || s.pattern === 4)
  const nonIschaemic = enhanced.filter((s) => s.pattern === 2 || s.pattern === 3)
  const unspecified = enhanced.filter((s) => s.pattern === 0)

  // --- Extent terminology ---
  const extentWord = enhanced.length <= 2 ? 'focal' : enhanced.length <= 5 ? 'regional' : 'extensive'

  // --- Ischaemic LGE ---
  if (ischaemic.length > 0) {
    // Group by territory
    const byTerritory: Record<string, EnhancedSeg[]> = {}
    for (const s of ischaemic) {
      const t = s.meta.territory
      if (!byTerritory[t]) byTerritory[t] = []
      byTerritory[t].push(s)
    }

    // Detect diffuse pattern (e.g. amyloidosis) — all ischaemic-pattern segments
    // spanning all 3 territories with ≥12 segments
    const multiTerritory = Object.keys(byTerritory).length > 1
    const allThreeTerritories = Object.keys(byTerritory).length === 3
    const isDiffuse = allThreeTerritories && ischaemic.length >= 12

    const territoryDescriptions: string[] = []
    for (const [territory, segs] of Object.entries(byTerritory)) {
      // Group by pattern within territory (reduces repetition vs per-band grouping)
      const byPat: Record<number, EnhancedSeg[]> = {}
      for (const s of segs) {
        if (!byPat[s.pattern]) byPat[s.pattern] = []
        byPat[s.pattern].push(s)
      }

      const patGroups: string[] = []
      for (const patCode of [4, 1] as const) {
        const group = byPat[patCode]
        if (!group) continue
        const segDesc = describeSegments(group)
        const transValues = [...new Set(group.map((s) => s.trans))].sort()
        const transRange = transValues.length === 1
          ? TRANSMURALITY_LABELS[transValues[0]]
          : `${TRANSMURALITY_LABELS[transValues[0]]} to ${TRANSMURALITY_LABELS[transValues[transValues.length - 1]]}`
        patGroups.push(`${PATTERN_ADJECTIVES[patCode]} enhancement of the ${segDesc} (${transRange} transmurality)`)
      }

      const fullName = territory === 'LAD' ? 'left anterior descending' : territory === 'RCA' ? 'right coronary artery' : 'left circumflex'

      if (patGroups.length === 1) {
        territoryDescriptions.push(`${patGroups[0]}, in the territory of the ${fullName}`)
      } else {
        const joined = patGroups.join(', with ')
        territoryDescriptions.push(`${joined}, in the territory of the ${fullName}`)
      }
    }

    if (multiTerritory) {
      const allSubendo = ischaemic.every((s) => s.pattern === 1)
      const patternLabel = isDiffuse
        ? (allSubendo ? 'diffuse subendocardial' : 'diffuse enhancement')
        : 'multi-vessel ischaemic'
      sentences.push(`There is ${extentWord} late gadolinium enhancement in a ${patternLabel} pattern: ${territoryDescriptions.join('; ')}.`)
    } else {
      sentences.push(`There is ${extentWord} ${territoryDescriptions[0]}.`)
    }

    // Viability assessment — suppress for diffuse patterns (e.g. amyloidosis)
    if (!isDiffuse) {
      const viable = ischaemic.filter((s) => s.trans <= 2)
      const nonViable = ischaemic.filter((s) => s.trans >= 3)
      if (viable.length > 0 && nonViable.length > 0) {
        const nvDesc = describeSegments(nonViable)
        const vDesc = describeSegments(viable)
        sentences.push(
          `The ${nvDesc} ${isDescPlural(nvDesc) ? 'demonstrate' : 'demonstrates'} >50% transmurality, suggesting non-viable myocardium. The ${vDesc} ${isDescPlural(vDesc) ? 'show' : 'shows'} <50% transmurality, suggesting viable myocardium amenable to revascularisation.`,
        )
      } else if (nonViable.length > 0 && viable.length === 0) {
        if (nonViable.length === ischaemic.length && nonViable.length > 1) {
          sentences.push('All enhanced segments demonstrate >50% transmurality, suggesting non-viable myocardium.')
        } else {
          const nvDesc = describeSegments(nonViable)
          sentences.push(`The ${nvDesc} ${isDescPlural(nvDesc) ? 'demonstrate' : 'demonstrates'} >50% transmurality, suggesting non-viable myocardium.`)
        }
      } else if (viable.length > 0 && nonViable.length === 0 && ischaemic.length >= 2) {
        sentences.push('All enhanced segments demonstrate <50% transmurality, suggesting viable myocardium amenable to revascularisation.')
      }
    }
  }

  // --- Non-ischaemic LGE ---
  if (nonIschaemic.length > 0) {
    // Group by pattern type
    const byPattern: Record<number, EnhancedSeg[]> = {}
    for (const s of nonIschaemic) {
      if (!byPattern[s.pattern]) byPattern[s.pattern] = []
      byPattern[s.pattern].push(s)
    }

    const patternDescriptions: string[] = []
    for (const patternCode of [2, 3] as const) {
      const group = byPattern[patternCode]
      if (!group) continue
      const segDesc = describeSegments(group)
      const patternName = PATTERN_ADJECTIVES[patternCode]

      // Group by transmurality for description
      const transValues = [...new Set(group.map((s) => s.trans))].sort()
      let transDesc: string
      if (transValues.length === 1) {
        transDesc = TRANSMURALITY_LABELS[transValues[0]]
      } else {
        transDesc = `${TRANSMURALITY_LABELS[transValues[0]]} to ${TRANSMURALITY_LABELS[transValues[transValues.length - 1]]}`
      }

      patternDescriptions.push(`${patternName} enhancement of the ${segDesc} (${transDesc} transmurality)`)
    }

    const prefix = ischaemic.length > 0 ? 'In addition, there is ' : 'There is '
    const nonIschExtent = nonIschaemic.length <= 2 ? 'focal' : nonIschaemic.length <= 5 ? 'regional' : 'extensive'

    if (patternDescriptions.length === 1) {
      sentences.push(`${prefix}${nonIschExtent} ${patternDescriptions[0]}, in a non-ischaemic pattern.`)
    } else {
      sentences.push(`${prefix}${nonIschExtent} late gadolinium enhancement in a non-ischaemic pattern: ${patternDescriptions.join('; ')}.`)
    }
  }

  // --- Unspecified pattern segments ---
  if (unspecified.length > 0 && ischaemic.length === 0 && nonIschaemic.length === 0) {
    // All segments have transmurality but no pattern assigned
    const segDesc = describeSegments(unspecified)
    const transValues = [...new Set(unspecified.map((s) => s.trans))].sort()
    let transDesc: string
    if (transValues.length === 1) {
      transDesc = TRANSMURALITY_LABELS[transValues[0]]
    } else {
      transDesc = `${TRANSMURALITY_LABELS[transValues[0]]} to ${TRANSMURALITY_LABELS[transValues[transValues.length - 1]]}`
    }
    sentences.push(`There is ${extentWord} late gadolinium enhancement of the ${segDesc} (${transDesc} transmurality).`)
  } else if (unspecified.length > 0) {
    // Mixed: some have patterns, some don't — mention unspecified separately
    const segDesc = describeSegments(unspecified)
    sentences.push(`There is additional enhancement of the ${segDesc} (pattern not specified).`)
  }

  // --- LGE Score Index ---
  sentences.push(`LGE score index ${scoreIndex.toFixed(2)} (${enhanced.length} of 17 segments enhanced).`)

  return {
    text: sentences.join(' '),
    scoreIndex,
    enhancedCount: enhanced.length,
  }
}

// ---------------------------------------------------------------------------
// Typed data from JSON (reusing RWMA paths — same AHA 17-segment geometry)
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

const OUTLINE_NUDGE: Record<string, [number, number]> = {
  '4CH': [-2, 3],
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function CmrLgePage() {
  const [segStates, setSegStates] = useState<Record<number, LgeCode>>(() => {
    const init: Record<number, LgeCode> = {}
    for (let i = 1; i <= 17; i++) init[i] = 0
    return init
  })

  const [patternStates, setPatternStates] = useState<Record<number, PatternCode>>(() => {
    const init: Record<number, PatternCode> = {}
    for (let i = 1; i <= 17; i++) init[i] = 0
    return init
  })

  const [activePattern, setActivePattern] = useState<PatternCode>(1)
  const [hoveredSeg, setHoveredSeg] = useState<number | null>(null)
  const [llmProse, setLlmProse] = useState<string | null>(null)
  const [isGenerating, setIsGenerating] = useState(false)
  const [llmError, setLlmError] = useState<string | null>(null)

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
    setLlmProse(null)
    setLlmError(null)
  }, [])

  const segColor = (seg: number) => LGE_STATES[segStates[seg] ?? 0].color
  const segStroke = (seg: number) => {
    const p = patternStates[seg] ?? 0
    return p > 0 && segStates[seg] > 0 ? LGE_PATTERNS[p].strokeColor : 'white'
  }

  // Derived summary
  const summary = useMemo(() => generateLgeSummary(segStates, patternStates), [segStates, patternStates])

  const handleGenerate = useCallback(async () => {
    setIsGenerating(true)
    setLlmError(null)
    try {
      const data = buildLgeSummaryData(segStates, patternStates, summary.text)
      const res = await fetch('/api/cmr-lge-prose', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: 'Request failed' }))
        throw new Error(err.error || `HTTP ${res.status}`)
      }
      const { prose } = await res.json()
      setLlmProse(prose)
    } catch (e) {
      setLlmError(e instanceof Error ? e.message : String(e))
    } finally {
      setIsGenerating(false)
    }
  }, [segStates, patternStates, summary.text])
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

  return (
    <Stack data-house-role="page" space="lg">
      <Row align="center" gap="md" wrap={false} className="house-page-title-row">
        <SectionMarker tone="report" size="title" className="self-stretch h-auto" />
        <PageHeader
          heading="LGE Analysis"
          className="!ml-0 !mt-0"
        />
      </Row>

      {/* ── Controls ── */}
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

          {/* Reset */}
          <button
            type="button"
            onClick={resetAll}
            className="rounded-full px-3 py-1 text-xs font-medium text-red-600 ring-1 ring-red-300 hover:bg-red-50 hover:text-red-700 transition-all"
          >
            Reset All
          </button>
        </div>
      </div>

      {/* ── Hovered segment info ── */}
      <div className="h-5 text-xs text-muted-foreground">
        {hoveredSeg != null && (
          <span>
            <strong>{segLabel(hoveredSeg)}</strong>
            {' — '}
            {LGE_STATES[segStates[hoveredSeg] ?? 0].label}
            {patternStates[hoveredSeg] > 0 && segStates[hoveredSeg] > 0 && ` · ${LGE_PATTERNS[patternStates[hoveredSeg]].label}`}
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

      {/* ── Colour key ── */}
      <div className="flex flex-col gap-2 pt-2">
        <div className="flex items-center gap-5 flex-wrap">
          <span className="text-xs font-semibold text-muted-foreground">TRANSMURALITY:</span>
          {LGE_STATES.map((s) => (
            <span key={s.code} className="flex items-center gap-1.5">
              <span className="inline-block h-3.5 w-3.5 rounded-sm" style={{ backgroundColor: s.color }} />
              <span className="text-xs">{s.label}</span>
            </span>
          ))}
        </div>
        <div className="flex items-center gap-5 flex-wrap">
          <span className="text-xs font-semibold text-muted-foreground">PATTERN:</span>
          {LGE_PATTERNS.slice(1).map((p) => (
            <span key={p.code} className="flex items-center gap-1.5">
              <span
                className="inline-block h-3.5 w-3.5 rounded-sm border-2"
                style={{ borderColor: p.strokeColor, backgroundColor: 'transparent' }}
              />
              <span className="text-xs">{p.label}</span>
            </span>
          ))}
        </div>
      </div>

      {/* ── Segment summary ── */}
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

        {llmProse !== null && (
          <p className="text-sm leading-relaxed text-foreground/80 whitespace-pre-wrap">
            {llmProse}
          </p>
        )}

        {llmError && (
          <p className="mt-2 text-xs text-red-500">{llmError}</p>
        )}

        <div className="flex items-center gap-3 mt-3">
          <button
            type="button"
            disabled={summary.enhancedCount === 0 || !hasAnyPattern || isGenerating}
            onClick={handleGenerate}
            className={cn(
              'rounded-full px-4 py-1.5 text-xs font-medium transition-all',
              'bg-foreground text-background hover:bg-foreground/90',
              'disabled:opacity-40 disabled:cursor-not-allowed',
            )}
          >
            {isGenerating ? 'Generating\u2026' : llmProse !== null ? 'Regenerate' : 'Generate Summary'}
          </button>
          {llmProse !== null && (
            <button
              type="button"
              onClick={() => { setLlmProse(null); setLlmError(null) }}
              className="text-xs text-muted-foreground underline hover:text-foreground transition-colors"
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
