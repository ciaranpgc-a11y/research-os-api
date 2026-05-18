export type LgeCode = 0 | 1 | 2 | 3 | 4
export type PatternCode = 0 | 1 | 2 | 3 | 4
export type SegmentMeta = { level: string; wall: string; territory: 'LAD' | 'RCA' | 'LCx' }

export const LGE_SEGMENT_META: Record<number, SegmentMeta> = {
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

const TRANSMURALITY_LABELS: Record<number, string> = {
  1: '1-25%',
  2: '26-50%',
  3: '51-75%',
  4: '76-100%',
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

export type LgeSummary = {
  text: string
  scoreIndex: number
  enhancedCount: number
}

export type LgeSummaryData = {
  deterministicText: string
  rvInsertionPointFibrosis: boolean
  segments: {
    name: string
    pattern: number
    transmurality: number
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
  nonIschaemicSegments: { segments: string[]; pattern: number }[]
  unspecifiedSegments: string[]
  viability: { viable: string[]; nonViable: string[] } | null
  ischaemicCount: number
  scoreIndex: number
  enhancedCount: number
}

const WALL_MAX_LEVELS: Record<string, number> = {
  anterior: 3,
  anteroseptal: 2,
  inferoseptal: 2,
  inferior: 3,
  inferolateral: 2,
  anterolateral: 2,
  septal: 1,
  lateral: 1,
}

function joinList(items: string[]): string {
  if (items.length === 0) return ''
  if (items.length === 1) return items[0]
  if (items.length === 2) return `${items[0]} and ${items[1]}`
  return `${items.slice(0, -1).join(', ')}, and ${items[items.length - 1]}`
}

function isDescPlural(desc: string): boolean {
  if (desc.includes(';')) return true
  if (desc.endsWith('walls')) return true
  if ((desc.match(/\bwall\b/g) || []).length > 1) return true
  if (desc.includes('the apex') && desc.length > 8) return true
  return false
}

function describeSegments(segs: EnhancedSeg[]): string {
  let hasApex = false
  const byWall: Record<string, string[]> = {}

  for (const seg of segs) {
    const level = seg.meta.level.toLowerCase()
    if (level === 'apex') {
      hasApex = true
      continue
    }
    const wall = seg.meta.wall.toLowerCase()
    if (!byWall[wall]) byWall[wall] = []
    if (!byWall[wall].includes(level)) byWall[wall].push(level)
  }

  const levelSetGroups: Record<string, string[]> = {}
  for (const [wall, levels] of Object.entries(byWall)) {
    const isComplete = levels.length === WALL_MAX_LEVELS[wall]
    const key = isComplete ? 'COMPLETE' : levels.sort().join(',')
    if (!levelSetGroups[key]) levelSetGroups[key] = []
    levelSetGroups[key].push(wall)
  }

  const segsPerLevel: Record<string, number> = {
    basal: 6,
    mid: 6,
    apical: 4,
  }

  const parts: string[] = []
  for (const [key, walls] of Object.entries(levelSetGroups)) {
    if (key === 'COMPLETE') {
      const wallNames = joinList(walls)
      parts.push(`${wallNames} ${walls.length === 1 ? 'wall' : 'walls'}`)
      continue
    }

    const levels = key.split(',')
    const isCircumferential = levels.length === 1 && walls.length === segsPerLevel[levels[0]]
    if (isCircumferential) {
      parts.push(`${levels[0]} segments circumferentially`)
      continue
    }

    const levelPrefix = joinList(levels)
    const wallNames = joinList(walls)
    parts.push(`${levelPrefix} ${wallNames} ${walls.length === 1 ? 'wall' : 'walls'}`)
  }

  if (hasApex) {
    if (parts.length > 0) parts.push('the apex')
    else return 'apex'
  }

  const hasInternalAnd = parts.some((part) => part.includes(' and '))
  if (hasInternalAnd && parts.length > 1) return parts.join('; ')
  return joinList(parts)
}

export function buildLgeSummarySignature(
  segStates: Record<number, LgeCode>,
  patternStates: Record<number, PatternCode>,
  rvInsertionPointFibrosis: boolean = false,
): string {
  const encoded: string[] = []
  for (let seg = 1; seg <= 17; seg += 1) {
    encoded.push(`${segStates[seg] ?? 0}:${patternStates[seg] ?? 0}`)
  }
  encoded.push('rules:v2')
  encoded.push(rvInsertionPointFibrosis ? 'rvip:v4' : 'rvip:0')
  return encoded.join('|')
}

export function generateLgeSummary(
  segStates: Record<number, LgeCode>,
  patternStates: Record<number, PatternCode>,
  rvInsertionPointFibrosis: boolean = false,
): LgeSummary {
  const scoreIndex = Object.values(segStates).reduce<number>((sum, code) => sum + code, 0) / 17

  const enhanced: EnhancedSeg[] = []
  for (let seg = 1; seg <= 17; seg += 1) {
    if ((segStates[seg] ?? 0) > 0) {
      enhanced.push({
        seg,
        trans: segStates[seg],
        pattern: patternStates[seg],
        meta: LGE_SEGMENT_META[seg],
      })
    }
  }

  if (enhanced.length === 0) {
    return {
      text: rvInsertionPointFibrosis
        ? 'Focal late gadolinium enhancement at the RV insertion points, typical of insertion point fibrosis. No other myocardial scar or fibrosis.'
        : 'No late gadolinium enhancement to suggest myocardial scar or fibrosis.',
      scoreIndex: 0,
      enhancedCount: 0,
    }
  }

  const sentences: string[] = []
  const ischaemic = enhanced.filter((seg) => seg.pattern === 1 || seg.pattern === 4)
  const nonIschaemic = enhanced.filter((seg) => seg.pattern === 2 || seg.pattern === 3)
  const unspecified = enhanced.filter((seg) => seg.pattern === 0)
  const extentWord = enhanced.length <= 2 ? 'focal' : enhanced.length <= 5 ? 'regional' : 'extensive'

  if (ischaemic.length > 0) {
    const byTerritory: Record<string, EnhancedSeg[]> = {}
    for (const seg of ischaemic) {
      const territory = seg.meta.territory
      if (!byTerritory[territory]) byTerritory[territory] = []
      byTerritory[territory].push(seg)
    }

    const territoryEntries = Object.entries(byTerritory)
    const multiTerritory = territoryEntries.length > 1
    const allThreeTerritories = territoryEntries.length === 3
    const isDiffuse = allThreeTerritories && ischaemic.length >= 12
    const sparseCrossTerritoryPattern = multiTerritory
      && territoryEntries.every(([, segs]) => segs.length === 1)
      && ischaemic.length <= 3

    const territoryDescriptions: string[] = []
    for (const [territory, segs] of territoryEntries) {
      const byPattern: Record<number, EnhancedSeg[]> = {}
      for (const seg of segs) {
        if (!byPattern[seg.pattern]) byPattern[seg.pattern] = []
        byPattern[seg.pattern].push(seg)
      }

      const patGroups: string[] = []
      for (const patternCode of [4, 1] as const) {
        const group = byPattern[patternCode]
        if (!group) continue
        const segDesc = describeSegments(group)
        const transValues = [...new Set(group.map((seg) => seg.trans))].sort()
        const transRange = transValues.length === 1
          ? TRANSMURALITY_LABELS[transValues[0]]
          : `${TRANSMURALITY_LABELS[transValues[0]]} to ${TRANSMURALITY_LABELS[transValues[transValues.length - 1]]}`
        patGroups.push(`${PATTERN_ADJECTIVES[patternCode]} enhancement of the ${segDesc} (${transRange} transmurality)`)
      }

      const fullName = territory === 'LAD'
        ? 'left anterior descending'
        : territory === 'RCA'
          ? 'right coronary artery'
          : 'left circumflex'

      if (patGroups.length === 1) {
        territoryDescriptions.push(`${patGroups[0]}, in the territory of the ${fullName}`)
      } else {
        territoryDescriptions.push(`${patGroups.join(', with ')}, in the territory of the ${fullName}`)
      }
    }

    if (multiTerritory) {
      if (sparseCrossTerritoryPattern) {
        sentences.push(`There are separate focal foci of late gadolinium enhancement: ${territoryDescriptions.join('; ')}.`)
      } else {
      const allSubendo = ischaemic.every((seg) => seg.pattern === 1)
      const patternLabel = isDiffuse
        ? (allSubendo ? 'diffuse subendocardial' : 'diffuse enhancement')
        : 'multi-vessel ischaemic'
      sentences.push(`There is ${extentWord} late gadolinium enhancement in a ${patternLabel} pattern: ${territoryDescriptions.join('; ')}.`)
      }
    } else {
      sentences.push(`There is ${extentWord} ${territoryDescriptions[0]}.`)
    }

    if (!isDiffuse && !sparseCrossTerritoryPattern) {
      const viable = ischaemic.filter((seg) => seg.trans <= 2)
      const nonViable = ischaemic.filter((seg) => seg.trans >= 3)
      if (viable.length > 0 && nonViable.length > 0) {
        const nonViableDesc = describeSegments(nonViable)
        const viableDesc = describeSegments(viable)
        sentences.push(
          `The ${nonViableDesc} ${isDescPlural(nonViableDesc) ? 'demonstrate' : 'demonstrates'} >50% transmurality, suggesting non-viable myocardium. The ${viableDesc} ${isDescPlural(viableDesc) ? 'show' : 'shows'} <50% transmurality, suggesting viable myocardium amenable to revascularisation.`,
        )
      } else if (nonViable.length > 0 && viable.length === 0) {
        if (nonViable.length === ischaemic.length && nonViable.length > 1) {
          sentences.push('All enhanced segments demonstrate >50% transmurality, suggesting non-viable myocardium.')
        } else {
          const nonViableDesc = describeSegments(nonViable)
          sentences.push(`The ${nonViableDesc} ${isDescPlural(nonViableDesc) ? 'demonstrate' : 'demonstrates'} >50% transmurality, suggesting non-viable myocardium.`)
        }
      } else if (viable.length > 0 && nonViable.length === 0 && ischaemic.length >= 2) {
        sentences.push('All enhanced segments demonstrate <50% transmurality, suggesting viable myocardium amenable to revascularisation.')
      }
    }
  }

  if (nonIschaemic.length > 0) {
    const byPattern: Record<number, EnhancedSeg[]> = {}
    for (const seg of nonIschaemic) {
      if (!byPattern[seg.pattern]) byPattern[seg.pattern] = []
      byPattern[seg.pattern].push(seg)
    }

    const patternDescriptions: string[] = []
    for (const patternCode of [2, 3] as const) {
      const group = byPattern[patternCode]
      if (!group) continue
      const segDesc = describeSegments(group)
      const patternName = PATTERN_ADJECTIVES[patternCode]
      const transValues = [...new Set(group.map((seg) => seg.trans))].sort()
      const transDesc = transValues.length === 1
        ? TRANSMURALITY_LABELS[transValues[0]]
        : `${TRANSMURALITY_LABELS[transValues[0]]} to ${TRANSMURALITY_LABELS[transValues[transValues.length - 1]]}`
      patternDescriptions.push(`${patternName} enhancement of the ${segDesc} (${transDesc} transmurality)`)
    }

    const prefix = ischaemic.length > 0 ? 'In addition, there is ' : 'There is '
    const nonIschaemicExtent = nonIschaemic.length <= 2 ? 'focal' : nonIschaemic.length <= 5 ? 'regional' : 'extensive'
    if (patternDescriptions.length === 1) {
      sentences.push(`${prefix}${nonIschaemicExtent} ${patternDescriptions[0]}, in a non-ischaemic pattern.`)
    } else {
      sentences.push(`${prefix}${nonIschaemicExtent} late gadolinium enhancement in a non-ischaemic pattern: ${patternDescriptions.join('; ')}.`)
    }
  }

  if (unspecified.length > 0 && ischaemic.length === 0 && nonIschaemic.length === 0) {
    const segDesc = describeSegments(unspecified)
    const transValues = [...new Set(unspecified.map((seg) => seg.trans))].sort()
    const transDesc = transValues.length === 1
      ? TRANSMURALITY_LABELS[transValues[0]]
      : `${TRANSMURALITY_LABELS[transValues[0]]} to ${TRANSMURALITY_LABELS[transValues[transValues.length - 1]]}`
    sentences.push(`There is ${extentWord} late gadolinium enhancement of the ${segDesc} (${transDesc} transmurality).`)
  } else if (unspecified.length > 0) {
    const segDesc = describeSegments(unspecified)
    sentences.push(`There is additional enhancement of the ${segDesc} (pattern not specified).`)
  }

  if (rvInsertionPointFibrosis) {
    const prefix = sentences.length > 0 ? 'In addition, there is ' : 'There is '
    sentences.push(`${prefix}focal late gadolinium enhancement at the RV insertion points, typical of insertion point fibrosis.`)
  }

  sentences.push(`LGE score index ${scoreIndex.toFixed(2)} (${enhanced.length} of 17 segments enhanced).`)

  return {
    text: sentences.join(' '),
    scoreIndex,
    enhancedCount: enhanced.length,
  }
}

export function buildLgeSummaryData(
  segStates: Record<number, LgeCode>,
  patternStates: Record<number, PatternCode>,
  rvInsertionPointFibrosis: boolean = false,
): LgeSummaryData {
  const summary = generateLgeSummary(segStates, patternStates, rvInsertionPointFibrosis)
  const segments: LgeSummaryData['segments'] = []

  for (let seg = 1; seg <= 17; seg += 1) {
    if ((segStates[seg] ?? 0) > 0) {
      const meta = LGE_SEGMENT_META[seg]
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

  const ischaemic = segments.filter((seg) => seg.pattern === 1 || seg.pattern === 4)
  const territories: LgeSummaryData['territories'] = {}

  for (const seg of ischaemic) {
    if (!territories[seg.territory]) {
      territories[seg.territory] = {
        segments: [],
        patterns: [],
        transRange: [5, 0] as [number, number],
      }
    }
    const territory = territories[seg.territory]
    territory.segments.push(seg.name)
    if (!territory.patterns.includes(seg.pattern)) territory.patterns.push(seg.pattern)
    if (seg.transmurality < territory.transRange[0]) territory.transRange[0] = seg.transmurality
    if (seg.transmurality > territory.transRange[1]) territory.transRange[1] = seg.transmurality
  }

  const territoryCount = Object.keys(territories).length
  const isDiffuse = territoryCount === 3 && ischaemic.length >= 12

  const nonIschaemicSegments: LgeSummaryData['nonIschaemicSegments'] = []
  for (const patternCode of [2, 3]) {
    const group = segments.filter((seg) => seg.pattern === patternCode)
    if (group.length > 0) {
      nonIschaemicSegments.push({
        segments: group.map((seg) => seg.name),
        pattern: patternCode,
      })
    }
  }

  const unspecifiedSegments = segments
    .filter((seg) => seg.pattern === 0)
    .map((seg) => seg.name)

  let viability: LgeSummaryData['viability'] = null
  if (ischaemic.length > 1 && !isDiffuse) {
    const viable = ischaemic
      .filter((seg) => seg.transmurality <= 2)
      .map((seg) => seg.name)
    const nonViable = ischaemic
      .filter((seg) => seg.transmurality >= 3)
      .map((seg) => seg.name)
    if (viable.length > 0 || nonViable.length > 0) {
      viability = { viable, nonViable }
    }
  }

  return {
    deterministicText: summary.text,
    rvInsertionPointFibrosis,
    segments,
    territories,
    territoryCount,
    isDiffuse,
    nonIschaemicSegments,
    unspecifiedSegments,
    viability,
    ischaemicCount: ischaemic.length,
    scoreIndex: Number(summary.scoreIndex.toFixed(2)),
    enhancedCount: summary.enhancedCount,
  }
}
