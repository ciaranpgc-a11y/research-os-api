import {
  LGE_SEGMENT_META,
  type LgeCode,
  type PatternCode,
  type SegmentMeta,
} from '@/lib/cmr-lge-summary'

export type PerfusionCode = 0 | 1 | 2
export type PerfusionPhase = 'rest' | 'stress'
export type PerfusionImpression =
  | 'normal'
  | 'inducible'
  | 'matched-scar'
  | 'exceeds-lge'
  | 'multivessel'
  | 'rest-only'
  | 'non-diagnostic'
  | 'indeterminate'

type PerfusionSummarySegment = {
  seg: number
  name: string
  extent: PerfusionCode
  territory: string
  wall: string
  level: string
}

export type PerfusionSummaryPhase = {
  abnormalCount: number
  subendocardialCount: number
  transmuralCount: number
  persistenceBeats: number
  territories: string[]
  segmentDescription: string | null
  segments: PerfusionSummarySegment[]
}

export type PerfusionSummary = {
  text: string
  impression: PerfusionImpression
  adequateStress: boolean
  rest: PerfusionSummaryPhase
  stress: PerfusionSummaryPhase
  stressOnlyCount: number
  fixedCount: number
  restOnlyCount: number
  stressOnlySegmentDescription: string | null
  fixedSegmentDescription: string | null
  restOnlySegmentDescription: string | null
  lge: PerfusionLgeContext
}

export type PerfusionSummaryData = {
  deterministicText: string
  impression: PerfusionImpression
  adequateStress: boolean
  rest: PerfusionSummaryPhase
  stress: PerfusionSummaryPhase
  stressOnlyCount: number
  fixedCount: number
  restOnlyCount: number
  stressOnlySegmentDescription: string | null
  fixedSegmentDescription: string | null
  restOnlySegmentDescription: string | null
  lge: PerfusionLgeContext
}

export type PerfusionLgeContext = {
  hasAnyLge: boolean
  hasInfarctPatternLge: boolean
  infarctPatternCount: number
  infarctTerritories: string[]
  hasAnyOverlapLge: boolean
  overlapAnyLgeCount: number
  overlapNonInfarctCount: number
  matchedWithinLgeCount: number
  exceedsBySegmentCount: number
  exceedsByThicknessCount: number
  stressBeyondInfarctCount: number
  lgeElsewhere: boolean
  indeterminateRelation: boolean
  matchedStressSegmentDescription: string | null
  stressBeyondInfarctSegmentDescription: string | null
}

export const PERFUSION_SEGMENT_META: Record<number, SegmentMeta> = LGE_SEGMENT_META

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

const LEVEL_ORDER: Record<string, number> = {
  basal: 0,
  mid: 1,
  apical: 2,
}

const WALL_ORDER: Record<string, number> = {
  anterior: 0,
  anteroseptal: 1,
  septal: 2,
  inferoseptal: 3,
  inferior: 4,
  inferolateral: 5,
  lateral: 6,
  anterolateral: 7,
}

function joinList(items: string[]): string {
  if (items.length === 0) return ''
  if (items.length === 1) return items[0]
  if (items.length === 2) return `${items[0]} and ${items[1]}`
  return `${items.slice(0, -1).join(', ')}, and ${items[items.length - 1]}`
}

function sortLevels(levels: string[]): string[] {
  return [...levels].sort((a, b) => (LEVEL_ORDER[a] ?? 99) - (LEVEL_ORDER[b] ?? 99))
}

function formatLevelSpan(levels: string[]): string {
  const ordered = sortLevels(levels)
  if (ordered.length <= 1) return ordered[0] ?? ''

  const ordinals = ordered.map((level) => LEVEL_ORDER[level] ?? 99)
  const isContiguous = ordinals.every((value, index) => index === 0 || value - ordinals[index - 1] === 1)
  if (isContiguous) {
    return `${ordered[0]}-to-${ordered[ordered.length - 1]}`
  }

  return joinList(ordered)
}

function describeSegments(segmentIds: number[]): string | null {
  if (segmentIds.length === 0) return null

  let hasApex = false
  const byWall: Record<string, string[]> = {}
  const byLevelCount: Record<string, number> = {}

  for (const segmentId of segmentIds) {
    const meta = PERFUSION_SEGMENT_META[segmentId]
    if (!meta) continue
    const level = meta.level.toLowerCase()
    if (level === 'apex') {
      hasApex = true
      continue
    }

    byLevelCount[level] = (byLevelCount[level] || 0) + 1

    const wall = meta.wall.toLowerCase()
    if (!byWall[wall]) byWall[wall] = []
    if (!byWall[wall].includes(level)) byWall[wall].push(level)
  }

  const segmentsPerLevel: Record<string, number> = {
    basal: 6,
    mid: 6,
    apical: 4,
  }

  const parts: string[] = []
  const circumferentialLevels = new Set<string>()
  for (const level of ['basal', 'mid', 'apical'] as const) {
    if ((byLevelCount[level] ?? 0) === segmentsPerLevel[level]) {
      parts.push(`${level} segments circumferentially`)
      circumferentialLevels.add(level)
    }
  }

  const spanGroups: Record<string, { levels: string[]; walls: string[]; complete: boolean }> = {}
  for (const [wall, levels] of Object.entries(byWall)) {
    const remainingLevels = levels.filter((level) => !circumferentialLevels.has(level))
    if (remainingLevels.length === 0) continue
    const ordered = sortLevels(remainingLevels)
    const complete = ordered.length === WALL_MAX_LEVELS[wall]
    const key = complete ? 'COMPLETE' : ordered.join(',')
    if (!spanGroups[key]) {
      spanGroups[key] = { levels: ordered, walls: [], complete }
    }
    spanGroups[key].walls.push(wall)
  }

  for (const group of Object.values(spanGroups)) {
    const wallNames = joinList(group.walls)
    if (group.complete) {
      parts.push(`${wallNames} ${group.walls.length === 1 ? 'wall' : 'walls'}`)
      continue
    }

    const levelPrefix = formatLevelSpan(group.levels)
    parts.push(`${levelPrefix} ${wallNames} ${group.walls.length === 1 ? 'wall' : 'walls'}`)
  }

  if (hasApex) {
    if (parts.length > 0) parts.push('the apex')
    else return 'apex'
  }

  const hasInternalAnd = parts.some((part) => part.includes(' and '))
  if (hasInternalAnd && parts.length > 1) return parts.join('; ')
  return joinList(parts)
}

function buildPhaseSummary(
  segStates: Record<number, PerfusionCode>,
  persistenceBeats: number,
): PerfusionSummaryPhase {
  const segments: PerfusionSummarySegment[] = []
  const segmentIds: number[] = []
  const territories = new Set<string>()
  let subendocardialCount = 0
  let transmuralCount = 0

  for (let segmentId = 1; segmentId <= 17; segmentId += 1) {
    const extent = (segStates[segmentId] ?? 0) as PerfusionCode
    if (extent <= 0) continue

    const meta = PERFUSION_SEGMENT_META[segmentId]
    if (!meta) continue

    segmentIds.push(segmentId)
    segments.push({
      seg: segmentId,
      name: `${meta.level.toLowerCase()} ${meta.wall.toLowerCase()}`,
      extent,
      territory: meta.territory,
      wall: meta.wall.toLowerCase(),
      level: meta.level.toLowerCase(),
    })
    territories.add(meta.territory)

    if (extent === 1) subendocardialCount += 1
    if (extent === 2) transmuralCount += 1
  }

  return {
    abnormalCount: segments.length,
    subendocardialCount,
    transmuralCount,
    persistenceBeats,
    territories: [...territories].sort(),
    segmentDescription: describeSegments(segmentIds),
    segments,
  }
}

function sortWalls(walls: string[]): string[] {
  return [...walls].sort((a, b) => (WALL_ORDER[a] ?? 99) - (WALL_ORDER[b] ?? 99))
}

function describeTerritoryFocus(
  segments: PerfusionSummarySegment[],
  fallback: string | null,
): string | null {
  if (segments.length === 0) return fallback
  const territories = [...new Set(segments.map((segment) => segment.territory))]
  if (territories.length !== 1) return fallback

  const walls = sortWalls([...new Set(segments.map((segment) => segment.wall))])
  const territory = territories[0]

  if (walls.length === 1) {
    return `${walls[0]} wall`
  }

  if (
    territory === 'LCx'
    && walls.every((wall) => ['anterolateral', 'inferolateral', 'lateral'].includes(wall))
  ) {
    return walls.length === 1 && walls[0] === 'inferolateral'
      ? 'inferolateral wall'
      : 'lateral wall'
  }

  return fallback
}

function buildInfarctPatternSegmentIds(
  lgeSegStates: Record<number, LgeCode>,
  lgePatternStates: Record<number, PatternCode>,
): Set<number> {
  const infarctPatternSegments = new Set<number>()
  for (let seg = 1; seg <= 17; seg += 1) {
    const transmurality = (lgeSegStates[seg] ?? 0) as LgeCode
    const pattern = (lgePatternStates[seg] ?? 0) as PatternCode
    if (transmurality > 0 && (pattern === 1 || pattern === 4)) {
      infarctPatternSegments.add(seg)
    }
  }
  return infarctPatternSegments
}

function buildLgeContext(
  stress: PerfusionSummaryPhase,
  lgeSegStates: Record<number, LgeCode>,
  lgePatternStates: Record<number, PatternCode>,
): PerfusionLgeContext {
  const infarctPatternSegments = buildInfarctPatternSegmentIds(lgeSegStates, lgePatternStates)
  const matchedStressSegments: number[] = []
  const stressBeyondInfarctSegments: number[] = []
  let overlapAnyLgeCount = 0
  let overlapNonInfarctCount = 0
  let exceedsBySegmentCount = 0
  let exceedsByThicknessCount = 0

  for (const segment of stress.segments) {
    const lgeTransmurality = (lgeSegStates[segment.seg] ?? 0) as LgeCode
    const lgePattern = (lgePatternStates[segment.seg] ?? 0) as PatternCode
    const hasAnyLge = lgeTransmurality > 0
    const hasInfarctPattern = hasAnyLge && (lgePattern === 1 || lgePattern === 4)
    const exceedsByThickness = hasInfarctPattern && segment.extent === 2 && lgeTransmurality < 4

    if (hasAnyLge) {
      overlapAnyLgeCount += 1
    }

    if (hasAnyLge && !hasInfarctPattern) {
      overlapNonInfarctCount += 1
      continue
    }

    if (!hasInfarctPattern) {
      stressBeyondInfarctSegments.push(segment.seg)
      exceedsBySegmentCount += 1
      continue
    }

    if (exceedsByThickness) {
      stressBeyondInfarctSegments.push(segment.seg)
      exceedsByThicknessCount += 1
      continue
    }

    matchedStressSegments.push(segment.seg)
  }

  const infarctTerritories = [...new Set(
    [...infarctPatternSegments].map((segmentId) => PERFUSION_SEGMENT_META[segmentId]?.territory).filter(Boolean),
  )].sort() as string[]

  return {
    hasAnyLge: Object.values(lgeSegStates).some((value) => Number(value) > 0),
    hasInfarctPatternLge: infarctPatternSegments.size > 0,
    infarctPatternCount: infarctPatternSegments.size,
    infarctTerritories,
    hasAnyOverlapLge: overlapAnyLgeCount > 0,
    overlapAnyLgeCount,
    overlapNonInfarctCount,
    matchedWithinLgeCount: matchedStressSegments.length,
    exceedsBySegmentCount,
    exceedsByThicknessCount,
    stressBeyondInfarctCount: stressBeyondInfarctSegments.length,
    lgeElsewhere: infarctPatternSegments.size > 0 && matchedStressSegments.length === 0,
    indeterminateRelation: overlapNonInfarctCount > 0,
    matchedStressSegmentDescription: describeSegments(matchedStressSegments),
    stressBeyondInfarctSegmentDescription: describeSegments(stressBeyondInfarctSegments),
  }
}

function isMultivesselPattern(stress: PerfusionSummaryPhase, lge: PerfusionLgeContext): boolean {
  if (lge.stressBeyondInfarctCount <= 0) return false
  if ((stress.segmentDescription ?? '').includes('circumferentially')) return true
  if (stress.territories.length === 3) return true
  return stress.territories.length >= 2 && stress.abnormalCount >= 6
}

function describeStressExtent(phase: PerfusionSummaryPhase): string {
  if (phase.subendocardialCount > 0 && phase.transmuralCount > 0) {
    return 'mixed subendocardial and transmural'
  }
  if (phase.transmuralCount > 0 && phase.subendocardialCount === 0) {
    return 'transmural'
  }
  return 'subendocardial'
}

function formatTerritoryList(territories: string[]): string {
  if (territories.length === 0) return 'multiple'
  if (territories.length === 1) return territories[0]
  if (territories.length === 2) return `${territories[0]} and ${territories[1]}`
  return `${territories[0]}, ${territories[1]} and ${territories[2]}`
}

function buildSingleTerritoryIschaemiaSentence(
  phase: PerfusionSummaryPhase,
  suffix: string,
): string {
  const territory = phase.territories[0] ?? ''
  const location = describeTerritoryFocus(phase.segments, phase.segmentDescription) ?? 'affected segments'
  return `Inducible ${describeStressExtent(phase)} perfusion defect involving ${phase.abnormalCount} ${phase.abnormalCount === 1 ? 'segment' : 'segments'} in the ${location} (${territory})${suffix}`
}

function buildMultivesselSentence(phase: PerfusionSummaryPhase): string {
  if ((phase.segmentDescription ?? '').includes('circumferentially')) {
    return 'Circumferential subendocardial perfusion defects involving multiple territories, consistent with multivessel ischaemia.'
  }

  const prefix = phase.abnormalCount >= 6 && phase.territories.length === 2
    ? 'Widespread subendocardial perfusion defects'
    : 'Subendocardial perfusion defects'
  return `${prefix} involving ${phase.abnormalCount} segments across ${formatTerritoryList(phase.territories)} territories, consistent with multivessel ischaemia.`
}

function determineImpression(
  adequateStress: boolean,
  rest: PerfusionSummaryPhase,
  stress: PerfusionSummaryPhase,
  lge: PerfusionLgeContext,
): PerfusionImpression {
  if (!adequateStress) return 'non-diagnostic'
  if (stress.abnormalCount === 0) {
    if (rest.abnormalCount > 0) return 'rest-only'
    return 'normal'
  }
  if (lge.indeterminateRelation) return 'indeterminate'
  if (isMultivesselPattern(stress, lge)) return 'multivessel'
  if (lge.matchedWithinLgeCount > 0 && lge.stressBeyondInfarctCount === 0) return 'matched-scar'
  if ((lge.matchedWithinLgeCount > 0 || lge.exceedsByThicknessCount > 0) && lge.stressBeyondInfarctCount > 0) {
    return 'exceeds-lge'
  }
  return 'inducible'
}

function describePerfusionSummary(
  adequateStress: boolean,
  _rest: PerfusionSummaryPhase,
  stress: PerfusionSummaryPhase,
  impression: PerfusionImpression,
  lge: PerfusionLgeContext,
): string {
  if (!adequateStress) {
    return 'Stress perfusion: Suboptimal vasodilator response; study non-diagnostic for inducible ischaemia.'
  }

  const prefix = 'Stress perfusion: Adequate vasodilator stress.'

  if (impression === 'normal') {
    if (lge.hasInfarctPatternLge) {
      return `${prefix} No inducible perfusion defect; findings consistent with prior infarction on LGE imaging.`
    }
    return `${prefix} No inducible perfusion defect.`
  }

  if (impression === 'matched-scar') {
    const territory = stress.territories[0] ?? formatTerritoryList(stress.territories)
    const location = describeTerritoryFocus(stress.segments, stress.segmentDescription) ?? 'affected segments'
    return `${prefix} Perfusion abnormality involving ${stress.abnormalCount} ${stress.abnormalCount === 1 ? 'segment' : 'segments'} in the ${location} (${territory}) is confined to regions of infarct-pattern LGE, without clear extension beyond scar.`
  }

  if (impression === 'multivessel') {
    return `${prefix} ${buildMultivesselSentence(stress)}`
  }

  if (impression === 'exceeds-lge') {
    if (stress.territories.length === 1) {
      const territory = stress.territories[0]
      const location = describeTerritoryFocus(stress.segments, stress.segmentDescription) ?? 'affected segments'
      return `${prefix} Stress perfusion defect involving ${stress.abnormalCount} ${stress.abnormalCount === 1 ? 'segment' : 'segments'} in the ${location} (${territory}) exceeds the extent of infarct-pattern LGE, consistent with inducible ischaemia in adjacent viable myocardium.`
    }
    return `${prefix} Stress perfusion defect exceeds the extent of infarct-pattern LGE, consistent with inducible ischaemia in adjacent viable myocardium.`
  }

  if (impression === 'inducible') {
    if (stress.territories.length === 1) {
      return `${prefix} ${buildSingleTerritoryIschaemiaSentence(
        stress,
        ', without corresponding infarct-pattern LGE, consistent with ischaemia in viable myocardium.',
      )}`
    }

    return `${prefix} Inducible ${describeStressExtent(stress)} perfusion defects involving ${stress.abnormalCount} segments across ${formatTerritoryList(stress.territories)} territories, without corresponding infarct-pattern LGE, consistent with ischaemia in viable myocardium.`
  }

  if (impression === 'indeterminate') {
    return `${prefix} Stress perfusion abnormality is present, but its relationship to LGE is indeterminate.`
  }

  if (impression === 'rest-only') {
    if (lge.hasInfarctPatternLge) {
      return `${prefix} No inducible perfusion defect; findings consistent with prior infarction on LGE imaging.`
    }
    return `${prefix} No inducible perfusion defect.`
  }

  return `${prefix} No inducible perfusion defect.`
}

export function buildPerfusionSummarySignature(
  restSegStates: Record<number, PerfusionCode>,
  stressSegStates: Record<number, PerfusionCode>,
  restPersistenceBeats: number,
  stressPersistenceBeats: number,
  adequateStress: boolean,
  lgeSegStates: Record<number, LgeCode>,
  lgePatternStates: Record<number, PatternCode>,
): string {
  const rest = Array.from({ length: 17 }, (_, index) => restSegStates[index + 1] ?? 0)
  const stress = Array.from({ length: 17 }, (_, index) => stressSegStates[index + 1] ?? 0)
  const lge = Array.from({ length: 17 }, (_, index) => `${lgeSegStates[index + 1] ?? 0}:${lgePatternStates[index + 1] ?? 0}`)
  return [
    `rest=${rest.join(':')}`,
    `stress=${stress.join(':')}`,
    `restBeats=${restPersistenceBeats}`,
    `stressBeats=${stressPersistenceBeats}`,
    `adequate=${adequateStress ? 1 : 0}`,
    `lge=${lge.join('|')}`,
  ].join('|')
}

export function generatePerfusionSummary({
  restSegStates,
  stressSegStates,
  restPersistenceBeats,
  stressPersistenceBeats,
  adequateStress,
  lgeSegStates,
  lgePatternStates,
}: {
  restSegStates: Record<number, PerfusionCode>
  stressSegStates: Record<number, PerfusionCode>
  restPersistenceBeats: number
  stressPersistenceBeats: number
  adequateStress: boolean
  lgeSegStates: Record<number, LgeCode>
  lgePatternStates: Record<number, PatternCode>
}): PerfusionSummary {
  const rest = buildPhaseSummary(restSegStates, restPersistenceBeats)
  const stress = buildPhaseSummary(stressSegStates, stressPersistenceBeats)
  const lge = buildLgeContext(stress, lgeSegStates, lgePatternStates)

  const stressOnlySegments: number[] = []
  const fixedSegments: number[] = []
  const restOnlySegments: number[] = []

  for (let segmentId = 1; segmentId <= 17; segmentId += 1) {
    const restCode = (restSegStates[segmentId] ?? 0) as PerfusionCode
    const stressCode = (stressSegStates[segmentId] ?? 0) as PerfusionCode

    if (restCode > 0 && stressCode > 0) {
      fixedSegments.push(segmentId)
      continue
    }

    if (stressCode > 0) {
      stressOnlySegments.push(segmentId)
      continue
    }

    if (restCode > 0) {
      restOnlySegments.push(segmentId)
    }
  }

  const impression = determineImpression(adequateStress, rest, stress, lge)

  return {
    text: describePerfusionSummary(adequateStress, rest, stress, impression, lge),
    impression,
    adequateStress,
    rest,
    stress,
    stressOnlyCount: stressOnlySegments.length,
    fixedCount: fixedSegments.length,
    restOnlyCount: restOnlySegments.length,
    stressOnlySegmentDescription: describeSegments(stressOnlySegments),
    fixedSegmentDescription: describeSegments(fixedSegments),
    restOnlySegmentDescription: describeSegments(restOnlySegments),
    lge,
  }
}

export function buildPerfusionSummaryData(input: {
  restSegStates: Record<number, PerfusionCode>
  stressSegStates: Record<number, PerfusionCode>
  restPersistenceBeats: number
  stressPersistenceBeats: number
  adequateStress: boolean
  lgeSegStates: Record<number, LgeCode>
  lgePatternStates: Record<number, PatternCode>
}): PerfusionSummaryData {
  const summary = generatePerfusionSummary(input)
  return {
    deterministicText: summary.text,
    impression: summary.impression,
    adequateStress: summary.adequateStress,
    rest: summary.rest,
    stress: summary.stress,
    stressOnlyCount: summary.stressOnlyCount,
    fixedCount: summary.fixedCount,
    restOnlyCount: summary.restOnlyCount,
    stressOnlySegmentDescription: summary.stressOnlySegmentDescription,
    fixedSegmentDescription: summary.fixedSegmentDescription,
    restOnlySegmentDescription: summary.restOnlySegmentDescription,
    lge: summary.lge,
  }
}
