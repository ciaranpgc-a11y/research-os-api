export type SegmentMeta = { level: string; wall: string; territory: 'LAD' | 'RCA' | 'LCx' }

export type RwmaCode = 0 | 1 | 2 | 3
export type WmsiSeverity = 'normal' | 'mild' | 'moderate' | 'severe'

export const RWMA_SEGMENT_META: Record<number, SegmentMeta> = {
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

export type RwmaSummary = {
  text: string
  wmsi: number
  severity: WmsiSeverity
  hasAbnormality: boolean
  territories: string[]
}

export type RwmaSummarySegment = {
  segment: number
  state: RwmaCode
  stateLabel: string
  territory: string
  wall: string
  level: string
}

export type RwmaSummaryData = {
  deterministicText: string
  wmsi: number
  severity: WmsiSeverity
  hasAbnormality: boolean
  territories: string[]
  abnormalCount: number
  stateCounts: {
    hypokinesis: number
    akinesis: number
    dyskinesis: number
  }
  abnormalSegments: RwmaSummarySegment[]
}

export const WMSI_SEVERITY_COLORS: Record<WmsiSeverity, string> = {
  normal: 'hsl(164 40% 45%)',
  mild: 'hsl(45 85% 58%)',
  moderate: 'hsl(30 75% 50%)',
  severe: 'hsl(3 55% 48%)',
}

export const RWMA_STATES = [
  { code: 0, label: 'Normal', color: 'hsl(164 40% 45%)' },
  { code: 1, label: 'Hypokinesis', color: 'hsl(45 85% 58%)' },
  { code: 2, label: 'Akinesis', color: 'hsl(30 75% 50%)' },
  { code: 3, label: 'Dyskinesis', color: 'hsl(3 55% 48%)' },
] as const

function joinList(items: string[]): string {
  if (items.length === 1) return items[0]
  if (items.length === 2) return `${items[0]} and ${items[1]}`
  return `${items.slice(0, -1).join(', ')}, and ${items[items.length - 1]}`
}

/** Number of wall segments per level (excluding apex) */
const SEGS_PER_LEVEL: Record<string, number> = { basal: 6, mid: 6, apical: 4 }

function assessTerritorialPattern(
  abnormal: { seg: number; code: number; meta: SegmentMeta }[],
): { text: string | null; territories: string[] } {
  const byTerritory: Record<string, number[]> = {}
  for (const a of abnormal) {
    const territory = a.meta.territory
    if (!byTerritory[territory]) byTerritory[territory] = []
    byTerritory[territory].push(a.seg)
  }

  const totalPerTerritory: Record<string, number> = {}
  for (const meta of Object.values(RWMA_SEGMENT_META)) {
    totalPerTerritory[meta.territory] = (totalPerTerritory[meta.territory] || 0) + 1
  }

  const significantTerritories: string[] = []
  for (const [territory, segments] of Object.entries(byTerritory)) {
    if (segments.length >= 2) significantTerritories.push(territory)
  }

  if (significantTerritories.length === 0) return { text: null, territories: [] }

  if (significantTerritories.length === 1) {
    const territory = significantTerritories[0]
    const affected = byTerritory[territory].length
    const total = totalPerTerritory[territory]
    if (affected >= total - 1) {
      return { text: `Distribution consistent with ${territory} coronary territory.`, territories: [territory] }
    }
    return { text: `Distribution suggests ${territory} territory involvement.`, territories: [territory] }
  }

  const sorted = significantTerritories.sort()
  return { text: `Distribution involves ${joinList(sorted)} territories.`, territories: sorted }
}

function describeWalls(segs: { seg: number; meta: SegmentMeta }[]): { prefix: string; body: string } {
  const byLevel: Record<string, string[]> = {}
  let hasApex = false
  for (const seg of segs) {
    const level = seg.meta.level.toLowerCase()
    if (level === 'apex') {
      hasApex = true
      continue
    }
    if (!byLevel[level]) byLevel[level] = []
    byLevel[level].push(seg.meta.wall.toLowerCase())
  }

  const circumferentialLevels: string[] = []
  const remainingSegs: { seg: number; meta: SegmentMeta }[] = []
  for (const [level, walls] of Object.entries(byLevel)) {
    if (walls.length === SEGS_PER_LEVEL[level]) {
      circumferentialLevels.push(level)
    } else {
      for (const seg of segs) {
        if (seg.meta.level.toLowerCase() === level) remainingSegs.push(seg)
      }
    }
  }

  const remainingByLevel: Record<string, string[]> = {}
  for (const seg of remainingSegs) {
    const level = seg.meta.level.toLowerCase()
    if (!remainingByLevel[level]) remainingByLevel[level] = []
    remainingByLevel[level].push(seg.meta.wall.toLowerCase())
  }

  const byWall: Record<string, string[]> = {}
  for (const seg of remainingSegs) {
    const wall = seg.meta.wall.toLowerCase()
    if (!byWall[wall]) byWall[wall] = []
    byWall[wall].push(seg.meta.level.toLowerCase())
  }

  const multiLevelWalls = Object.values(byWall).filter((levels) => levels.length > 1).length
  const singleLevelWalls = Object.values(byWall).filter((levels) => levels.length === 1).length

  const wallDescriptions: string[] = []
  if (multiLevelWalls > singleLevelWalls) {
    for (const [wall, levels] of Object.entries(byWall)) {
      wallDescriptions.push(`${joinList(levels)} ${wall} wall`)
    }
  } else {
    for (const [level, walls] of Object.entries(remainingByLevel)) {
      if (walls.length === 1) {
        wallDescriptions.push(`${level} ${walls[0]} wall`)
      } else {
        wallDescriptions.push(`${level} ${joinList(walls)} walls`)
      }
    }
  }

  const parts: string[] = []

  if (circumferentialLevels.length > 0 && wallDescriptions.length === 0 && !hasApex) {
    if (circumferentialLevels.length === 1) {
      return { prefix: 'at the ', body: `${circumferentialLevels[0]} level (circumferential)` }
    }
    return { prefix: 'at the ', body: `${joinList(circumferentialLevels)} levels (circumferential)` }
  }

  for (const level of circumferentialLevels) {
    parts.push(`${level} level circumferentially`)
  }
  parts.push(...wallDescriptions)

  if (hasApex) {
    if (parts.length > 0) parts.push('the apex')
    else return { prefix: 'of the ', body: 'apex' }
  }

  if (parts.length === 0) return { prefix: 'of the ', body: 'apex' }

  const hasInternalAnd = parts.filter((part) => part.includes(' and ')).length > 1
  if (hasInternalAnd) {
    return { prefix: 'of the ', body: parts.join('; ') }
  }
  return { prefix: 'of the ', body: joinList(parts) }
}

export function buildRwmaSummarySignature(segStates: Record<number, RwmaCode>): string {
  const encoded: string[] = []
  for (let seg = 1; seg <= 17; seg += 1) {
    encoded.push(String(segStates[seg] ?? 0))
  }
  return encoded.join('|')
}

export function generateRwmaSummary(segStates: Record<number, RwmaCode>): RwmaSummary {
  const totalScore = Object.values(segStates).reduce<number>((sum, code) => sum + (code + 1), 0)
  const wmsi = totalScore / 17
  const severity: WmsiSeverity = wmsi <= 1.0 ? 'normal' : wmsi < 1.6 ? 'mild' : wmsi < 2.0 ? 'moderate' : 'severe'

  const abnormal = Object.entries(segStates)
    .filter(([, code]) => code > 0)
    .map(([seg, code]) => ({ seg: Number(seg), code, meta: RWMA_SEGMENT_META[Number(seg)] }))

  if (abnormal.length === 0) {
    return {
      text: 'Normal wall motion. No regional wall motion abnormalities identified.',
      wmsi,
      severity,
      hasAbnormality: false,
      territories: [],
    }
  }

  const severityLabel = severity === 'normal' ? '' : ` (${severity})`
  const allSame = abnormal.length === 17 && abnormal.every((item) => item.code === abnormal[0].code)
  if (allSame) {
    return {
      text: `Global ${RWMA_STATES[abnormal[0].code].label.toLowerCase()}. Wall motion score index ${wmsi.toFixed(2)}${severityLabel}.`,
      wmsi,
      severity,
      hasAbnormality: true,
      territories: ['LAD', 'RCA', 'LCx'],
    }
  }

  const byType: Record<number, typeof abnormal> = {}
  for (const item of abnormal) {
    if (!byType[item.code]) byType[item.code] = []
    byType[item.code].push(item)
  }

  const parts: string[] = []
  for (const code of [1, 2, 3] as const) {
    const segments = byType[code]
    if (!segments || segments.length === 0) continue
    const label = RWMA_STATES[code].label.toLowerCase()
    const { prefix, body } = describeWalls(segments)
    parts.push(`${label} ${prefix}${body}`)
  }

  const { text: territoryText, territories } = assessTerritorialPattern(abnormal)

  const sentences = [`Regional wall motion abnormality: ${parts.join('; ')}.`]
  if (territoryText) sentences.push(territoryText)
  sentences.push(`Wall motion score index ${wmsi.toFixed(2)}${severityLabel}.`)

  return {
    text: sentences.join(' '),
    wmsi,
    severity,
    hasAbnormality: true,
    territories,
  }
}

export function buildRwmaSummaryData(segStates: Record<number, RwmaCode>): RwmaSummaryData {
  const summary = generateRwmaSummary(segStates)
  const abnormalSegments: RwmaSummarySegment[] = []
  const stateCounts = {
    hypokinesis: 0,
    akinesis: 0,
    dyskinesis: 0,
  }

  for (let seg = 1; seg <= 17; seg += 1) {
    const state = (segStates[seg] ?? 0) as RwmaCode
    if (state === 0) continue

    const meta = RWMA_SEGMENT_META[seg]
    abnormalSegments.push({
      segment: seg,
      state,
      stateLabel: RWMA_STATES[state].label,
      territory: meta.territory,
      wall: meta.wall.toLowerCase(),
      level: meta.level.toLowerCase(),
    })

    if (state === 1) stateCounts.hypokinesis += 1
    if (state === 2) stateCounts.akinesis += 1
    if (state === 3) stateCounts.dyskinesis += 1
  }

  return {
    deterministicText: summary.text,
    wmsi: summary.wmsi,
    severity: summary.severity,
    hasAbnormality: summary.hasAbnormality,
    territories: summary.territories,
    abnormalCount: abnormalSegments.length,
    stateCounts,
    abnormalSegments,
  }
}
