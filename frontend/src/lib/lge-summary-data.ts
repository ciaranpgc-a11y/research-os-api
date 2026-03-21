// frontend/src/lib/lge-summary-data.ts

// Re-declare the types needed (these are local to cmr-lge-page.tsx)
type LgeCode = 0 | 1 | 2 | 3 | 4
type PatternCode = 0 | 1 | 2 | 3 | 4
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

export type LgeSummaryData = {
  deterministicText: string
  segments: {
    name: string
    pattern: number  // 0=unspecified, 1=subendo, 2=mid-wall, 3=subepi, 4=transmural
    transmurality: number // 0-4
    territory: string
    wall: string
    level: string
  }[]

  territories: Record<string, {
    segments: string[]
    patterns: number[]
    transRange: [number, number]
  }>

  territoryCount: number
  isDiffuse: boolean
  nonIschaemicSegments: { segments: string[], pattern: number }[]
  unspecifiedSegments: string[]
  viability: { viable: string[], nonViable: string[] } | null
  ischaemicCount: number
  scoreIndex: number
  enhancedCount: number
}

export function buildLgeSummaryData(
  segStates: Record<number, LgeCode>,
  patternStates: Record<number, PatternCode>,
  deterministicText: string,
): LgeSummaryData {
  const segments: LgeSummaryData['segments'] = []
  for (let seg = 1; seg <= 17; seg++) {
    if (segStates[seg] > 0) {
      const meta = SEGMENT_META[seg]
      segments.push({
        name: `${meta.level.toLowerCase()} ${meta.wall.toLowerCase()}`,
        pattern: patternStates[seg],
        transmurality: segStates[seg],
        territory: meta.territory,
        wall: meta.wall.toLowerCase(),
        level: meta.level.toLowerCase(),
      })
    }
  }

  // Build territory groupings from ischaemic segments (pattern 1 or 4)
  const ischaemic = segments.filter(s => s.pattern === 1 || s.pattern === 4)
  const territories: LgeSummaryData['territories'] = {}
  for (const s of ischaemic) {
    if (!territories[s.territory]) {
      territories[s.territory] = { segments: [], patterns: [], transRange: [5, 0] as [number, number] }
    }
    const t = territories[s.territory]
    t.segments.push(s.name)
    if (!t.patterns.includes(s.pattern)) t.patterns.push(s.pattern)
    if (s.transmurality < t.transRange[0]) t.transRange[0] = s.transmurality
    if (s.transmurality > t.transRange[1]) t.transRange[1] = s.transmurality
  }

  // Diffuse detection
  const territoryCount = Object.keys(territories).length
  const isDiffuse = territoryCount === 3 && ischaemic.length >= 12

  // Non-ischaemic grouping (patterns 2 and 3)
  const nonIschaemicSegments: LgeSummaryData['nonIschaemicSegments'] = []
  for (const patCode of [2, 3]) {
    const group = segments.filter(s => s.pattern === patCode)
    if (group.length > 0) {
      nonIschaemicSegments.push({ segments: group.map(s => s.name), pattern: patCode })
    }
  }

  // Unspecified pattern segments (pattern 0 — transmurality set but no pattern chosen)
  const unspecifiedSegments = segments.filter(s => s.pattern === 0).map(s => s.name)

  // Viability — only for 2+ ischaemic segments, suppressed for diffuse
  let viability: LgeSummaryData['viability'] = null
  if (ischaemic.length > 1 && !isDiffuse) {
    const viable = ischaemic.filter(s => s.transmurality <= 2).map(s => s.name)
    const nonViable = ischaemic.filter(s => s.transmurality >= 3).map(s => s.name)
    if (viable.length > 0 || nonViable.length > 0) {
      viability = { viable, nonViable }
    }
  }

  const scoreIndex = parseFloat((segments.reduce((sum, s) => sum + s.transmurality, 0) / 17).toFixed(2))

  return {
    deterministicText,
    segments,
    territories,
    territoryCount,
    isDiffuse,
    nonIschaemicSegments,
    unspecifiedSegments,
    viability,
    ischaemicCount: ischaemic.length,
    scoreIndex,
    enhancedCount: segments.length,
  }
}
