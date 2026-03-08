import type { PublicationMetricTilePayload } from '@/types/impact'

export type HIndexDrilldownCandidate = {
  workId: string
  title: string
  citations: number
  citationsToNextH: number
  projectedCitations12m: number
  projectionOutlookLabel: string
}

export type HIndexDrilldownStats = {
  currentH: number
  targetH: number
  projectedYear: number
  projectedH: number
  fullHistoryYears: number[]
  fullHistoryValues: number[]
  trajectoryPoints: Array<{ x: number; label: string; value: number }>
  progressPct: number
  papersInHCore: number
  citationsNeededForNextH: number
  hCoreSharePct: number
  yearsSinceFirstCitedPaper: number | null
  mIndexRaw: number | null
  mIndexValue: string
  gIndexRaw: number
  gIndexValue: string
  i10IndexRaw: number
  i10IndexValue: string
  totalPublications: number
  totalCitations: number
  hCorePublicationCount: number
  hCorePublicationSharePct: number
  nonHCorePublicationCount: number
  hCoreCitations: number
  nonHCoreCitations: number
  hCoreCitationDensityRaw: number | null
  hCoreCitationDensityValue: string
  hCoreShareValue: string
  authorshipMix: Array<{ label: string; value: string; raw: number }>
  publicationTypeMix: Array<{ label: string; value: string; raw: number }>
  milestones: Array<{ milestone: number; label: string; value: string; year: number; yearsFromPrevious: number | null }>
  candidatePapers: HIndexDrilldownCandidate[]
  summaryThresholdSteps: Array<{
    targetH: number
    currentMeetingTarget: number
    papersNeeded: number
    citationsNeeded: number
    progressPct: number
    nearestGapValues: number[]
  }>
  summaryThresholdCandidates: Array<{
    targetH: number
    candidates: HIndexDrilldownCandidate[]
  }>
}

type HIndexDrilldownMilestone = HIndexDrilldownStats['milestones'][number]

type ParsedPublication = {
  workId: string
  title: string
  year: number | null
  citations: number
  citationsLast12m: number
  role: string
  publicationType: string
  yearlyCounts: Record<number, number>
  monthlyAdded24: number[]
  publicationMonthStart: string | null
  fallbackYear: number | null
}

function parseMetricNumber(value: unknown): number | null {
  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : null
  }
  if (typeof value !== 'string') {
    return null
  }
  const normalized = value.replace(/,/g, '').trim()
  if (!normalized) {
    return null
  }
  const parsed = Number(normalized)
  return Number.isFinite(parsed) ? parsed : null
}

function formatInt(value: number): string {
  const finiteValue = Number.isFinite(value) ? value : 0
  return Math.round(Math.max(0, finiteValue)).toLocaleString('en-GB')
}

function formatDecimal(value: number, decimals = 1): string {
  if (!Number.isFinite(value)) {
    return '\u2014'
  }
  const rounded = Math.round(Math.max(0, value) * (10 ** decimals)) / (10 ** decimals)
  return rounded.toFixed(decimals)
}

function toMetricNumberArray(value: unknown): number[] {
  if (!Array.isArray(value)) {
    return []
  }
  return value
    .map((item) => parseMetricNumber(item))
    .filter((item): item is number => item !== null)
}

function daysInUtcMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate()
}

function monthIndexToParts(monthIndex: number): { year: number; month: number } {
  const year = Math.floor(monthIndex / 12)
  const month = (monthIndex % 12) + 1
  return { year, month }
}

function monthIndexFromParts(year: number, month: number): number {
  return (year * 12) + (month - 1)
}

function shiftMonthIndex(monthIndex: number, delta: number): number {
  return monthIndex + delta
}

function parseMonthStartIndex(value: unknown): number | null {
  if (typeof value !== 'string') {
    return null
  }
  const match = /^(\d{4})-(\d{2})/.exec(value.trim())
  if (!match) {
    return null
  }
  const year = Number(match[1])
  const month = Number(match[2])
  if (!Number.isFinite(year) || !Number.isFinite(month) || month < 1 || month > 12) {
    return null
  }
  return monthIndexFromParts(year, month)
}

function estimateWindowCitations(
  yearlyCounts: Record<number, number>,
  options: {
    startMonthIndex: number
    nowMonthIndex: number
    nowDayOfMonth: number
  },
): number {
  const { startMonthIndex, nowMonthIndex, nowDayOfMonth } = options
  if (!Object.keys(yearlyCounts).length) {
    return 0
  }
  let estimated = 0
  for (const [yearText, countRaw] of Object.entries(yearlyCounts)) {
    const year = Number(yearText)
    const count = Math.max(0, Math.round(countRaw || 0))
    if (!Number.isFinite(year) || count <= 0) {
      continue
    }
    const segmentStartMonthIndex = monthIndexFromParts(year, 1)
    const segmentEndMonthIndex = monthIndexFromParts(year + 1, 1)
    const effectiveEndMonthIndex = year === monthIndexToParts(nowMonthIndex).year ? Math.min(segmentEndMonthIndex, nowMonthIndex + 1) : segmentEndMonthIndex
    const overlapStart = Math.max(startMonthIndex, segmentStartMonthIndex)
    const overlapEnd = Math.min(shiftMonthIndex(startMonthIndex, 1), effectiveEndMonthIndex)
    if (overlapEnd <= overlapStart) {
      continue
    }
    const segmentDays = year === monthIndexToParts(nowMonthIndex).year
      ? Math.max(1, (() => {
        let days = 0
        for (let month = 1; month <= monthIndexToParts(nowMonthIndex).month; month += 1) {
          days += month === monthIndexToParts(nowMonthIndex).month ? nowDayOfMonth : daysInUtcMonth(year, month)
        }
        return days
      })())
      : (Date.UTC(year + 1, 0, 1) - Date.UTC(year, 0, 1)) / 86400000
    let overlapDays = 0
    for (let monthIndex = overlapStart; monthIndex < overlapEnd; monthIndex += 1) {
      const parts = monthIndexToParts(monthIndex)
      overlapDays += monthIndex === nowMonthIndex
        ? nowDayOfMonth
        : daysInUtcMonth(parts.year, parts.month)
    }
    estimated += count * Math.max(0, Math.min(1, overlapDays / segmentDays))
  }
  return Math.max(0, Math.round(estimated))
}

function normalizeMonthlyToTotal(monthlyAdded: number[], targetTotal: number): number[] {
  const clean = monthlyAdded.map((value) => Math.max(0, Math.round(value || 0)))
  const total = clean.reduce((sum, value) => sum + value, 0)
  const target = Math.max(0, Math.round(targetTotal || 0))
  if (total <= 0) {
    return clean.map(() => 0)
  }
  if (total <= target) {
    return clean
  }
  const scaled = clean.map((value) => Math.round((value / total) * target))
  let diff = target - scaled.reduce((sum, value) => sum + value, 0)
  if (diff > 0) {
    for (let index = scaled.length - 1; index >= 0 && diff > 0; index -= 1) {
      scaled[index] += 1
      diff -= 1
    }
  } else if (diff < 0) {
    for (let index = scaled.length - 1; index >= 0 && diff < 0; index -= 1) {
      const removable = Math.min(scaled[index], Math.abs(diff))
      scaled[index] -= removable
      diff += removable
    }
  }
  return scaled
}

function reconcileMonthlySeriesToTotal(
  monthlyAdded: number[],
  targetTotal: number,
  eligibleIndexes: number[],
): number[] {
  const clean = monthlyAdded.map((value) => Math.max(0, Math.round(value || 0)))
  const target = Math.max(0, Math.round(targetTotal || 0))
  if (target <= 0) {
    return clean.map(() => 0)
  }
  const total = clean.reduce((sum, value) => sum + value, 0)
  if (total > target) {
    return normalizeMonthlyToTotal(clean, target)
  }
  if (total === target) {
    return clean
  }
  const resolved = eligibleIndexes.filter((index) => index >= 0 && index < clean.length)
  if (!resolved.length) {
    return clean
  }
  let remainder = target - total
  const base = Math.floor(remainder / resolved.length)
  const extra = remainder % resolved.length
  resolved.forEach((targetIndex, offset) => {
    clean[targetIndex] += base + (offset < extra ? 1 : 0)
  })
  return clean
}

function computeHIndex(citations: number[]): number {
  const sorted = [...citations].map((value) => Math.max(0, Math.round(value))).sort((left, right) => right - left)
  let hValue = 0
  for (let index = 0; index < sorted.length; index += 1) {
    if (sorted[index] >= index + 1) {
      hValue = index + 1
    } else {
      break
    }
  }
  return hValue
}

function toTitleCaseLabel(value: string): string {
  const normalized = value.replace(/[_-]+/g, ' ').replace(/\s+/g, ' ').trim()
  if (!normalized) {
    return 'Other'
  }
  return normalized
    .split(' ')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ')
}

function normalizeRoleLabel(value: string): string {
  switch (String(value || '').trim().toLowerCase()) {
    case 'first':
    case 'first author':
      return 'First author'
    case 'second':
    case 'second author':
      return 'Second author'
    case 'last':
    case 'last author':
    case 'senior':
    case 'senior author':
      return 'Senior author'
    case 'other':
    case 'other authorship':
      return 'Other'
    default:
      return 'Other'
  }
}

function computeGIndex(citations: number[]): number {
  const sorted = [...citations].map((value) => Math.max(0, Math.round(value))).sort((left, right) => right - left)
  let cumulative = 0
  let gValue = 0
  for (let index = 0; index < sorted.length; index += 1) {
    cumulative += sorted[index]
    const rank = index + 1
    if (cumulative >= rank * rank) {
      gValue = rank
    } else {
      break
    }
  }
  return gValue
}

function computeCitationsNeededForTarget(
  publications: ParsedPublication[],
  targetH: number,
): number {
  if (targetH <= 0 || !publications.length) {
    return 0
  }
  const currentMeetingTarget = publications.filter((row) => row.citations >= targetH).length
  const papersNeeded = Math.max(0, targetH - currentMeetingTarget)
  if (papersNeeded <= 0) {
    return 0
  }
  const candidateGaps = publications
    .filter((row) => row.citations < targetH)
    .map((row) => Math.max(0, targetH - row.citations))
    .sort((left, right) => left - right)
  return candidateGaps
    .slice(0, papersNeeded)
    .reduce((sum, gap) => sum + gap, 0)
}

function computeProgressToTarget(
  publications: ParsedPublication[],
  targetH: number,
): number {
  if (targetH <= 0 || !publications.length) {
    return 0
  }
  const currentMeetingTarget = publications.filter((row) => row.citations >= targetH).length
  if (currentMeetingTarget >= targetH) {
    return 100
  }
  return Math.max(0, Math.min(99, (currentMeetingTarget / targetH) * 100))
}

function computeThresholdStep(
  publications: ParsedPublication[],
  targetH: number,
): HIndexDrilldownStats['summaryThresholdSteps'][number] {
  if (targetH <= 0 || !publications.length) {
    return {
      targetH,
      currentMeetingTarget: 0,
      papersNeeded: 0,
      citationsNeeded: 0,
      progressPct: 0,
      nearestGapValues: [],
    }
  }
  const currentMeetingTarget = publications.filter((row) => row.citations >= targetH).length
  const papersNeeded = Math.max(0, targetH - currentMeetingTarget)
  const nearestGapValues = publications
    .filter((row) => row.citations < targetH)
    .map((row) => Math.max(0, targetH - row.citations))
    .sort((left, right) => left - right)
    .slice(0, papersNeeded)

  return {
    targetH,
    currentMeetingTarget,
    papersNeeded,
    citationsNeeded: nearestGapValues.reduce((sum, gap) => sum + gap, 0),
    progressPct: computeProgressToTarget(publications, targetH),
    nearestGapValues,
  }
}

function buildProjectionOutlookLabel({
  citations,
  targetH,
  projectedCitations12m,
}: {
  citations: number
  targetH: number
  projectedCitations12m: number
}): string {
  const gap = Math.max(0, targetH - citations)
  if (gap <= 0) {
    return 'At line'
  }
  const projectedGain = Math.max(0, projectedCitations12m - citations)
  const remainingGap = Math.max(0, gap - projectedGain)
  if (remainingGap <= 0) {
    return projectedGain >= gap + 2 ? 'Strong' : 'On pace'
  }
  if (remainingGap === 1) {
    return 'Live'
  }
  if (projectedGain >= Math.max(2, Math.ceil(gap * 0.6))) {
    return 'Stretch'
  }
  if (projectedGain > 0) {
    return 'Off pace'
  }
  return 'No recent pace'
}

function buildCandidatesForTarget(
  publications: ParsedPublication[],
  targetH: number,
): HIndexDrilldownCandidate[] {
  if (targetH <= 0 || !publications.length) {
    return []
  }
  return publications
    .filter((row) => row.citations < targetH)
    .map((row) => {
      const citationsToTarget = Math.max(0, targetH - row.citations)
      const projectedCitations12m = Math.max(row.citations, row.citations + row.citationsLast12m)
      return {
        workId: row.workId,
        title: row.title,
        citations: row.citations,
        citationsToNextH: citationsToTarget,
        projectedCitations12m,
        projectionOutlookLabel: buildProjectionOutlookLabel({
          citations: row.citations,
          targetH,
          projectedCitations12m,
        }),
      }
    })
    .sort((left, right) => {
      if (left.citationsToNextH !== right.citationsToNextH) {
        return left.citationsToNextH - right.citationsToNextH
      }
      return right.citations - left.citations
    })
}

function buildHIndexTrajectoryPoints(
  years: number[],
  values: number[],
): Array<{ x: number; label: string; value: number }> {
  if (years.length === 0 || years.length !== values.length) {
    return []
  }
  const history = years
    .map((year, index) => ({
      year,
      value: Math.max(0, Math.round(values[index] ?? 0)),
    }))
    .sort((left, right) => left.year - right.year)
  if (!history.length) {
    return []
  }
  const points: Array<{ x: number; label: string; value: number }> = [
    { x: history[0].year, label: String(history[0].year), value: history[0].value },
  ]
  const maxValue = Math.max(...history.map((point) => point.value))
  for (let target = Math.max(1, history[0].value + 1); target <= maxValue; target += 1) {
    const milestone = history.find((point) => point.value >= target)
    if (milestone) {
      points.push({
        x: milestone.year,
        label: String(milestone.year),
        value: target,
      })
    }
  }
  const lastHistoryPoint = history[history.length - 1]
  const lastPoint = points[points.length - 1]
  if (!lastPoint || lastPoint.x !== lastHistoryPoint.year || lastPoint.value !== lastHistoryPoint.value) {
    points.push({
      x: lastHistoryPoint.year,
      label: String(lastHistoryPoint.year),
      value: lastHistoryPoint.value,
    })
  }
  return points
}

function buildMonthlyHIndexTimeline(
  publications: ParsedPublication[],
  referenceNow: Date,
): Array<{ x: number; label: string; value: number }> {
  if (!publications.length) {
    return []
  }
  const nowYear = referenceNow.getUTCFullYear()
  const nowMonth = referenceNow.getUTCMonth() + 1
  const nowDay = Math.max(1, referenceNow.getUTCDate())
  const currentMonthIndex = monthIndexFromParts(nowYear, nowMonth)
  const candidateStartIndexes = publications
    .map((publication) => (
      parseMonthStartIndex(publication.publicationMonthStart)
      ?? (publication.fallbackYear !== null ? monthIndexFromParts(publication.fallbackYear, 1) : null)
      ?? (publication.year !== null ? monthIndexFromParts(publication.year, 1) : null)
    ))
    .filter((value): value is number => value !== null)
  const firstMonthIndex = candidateStartIndexes.length
    ? Math.min(...candidateStartIndexes)
    : currentMonthIndex
  const monthIndexes = Array.from(
    { length: Math.max(1, currentMonthIndex - firstMonthIndex + 1) },
    (_, index) => firstMonthIndex + index,
  )

  const cumulativeByPublication = publications.map((publication) => {
    const publicationStartIndex = parseMonthStartIndex(publication.publicationMonthStart)
      ?? (publication.fallbackYear !== null ? monthIndexFromParts(publication.fallbackYear, 1) : null)
      ?? (publication.year !== null ? monthIndexFromParts(publication.year, 1) : firstMonthIndex)
    const eligibleIndexes = monthIndexes
      .map((monthIndex, index) => (monthIndex >= publicationStartIndex ? index : -1))
      .filter((index) => index >= 0)
    let monthlyAdded = monthIndexes.map((monthIndex) => estimateWindowCitations(
      publication.yearlyCounts,
      {
        startMonthIndex: monthIndex,
        nowMonthIndex: currentMonthIndex,
        nowDayOfMonth: nowDay,
      },
    ))
    if (Object.keys(publication.yearlyCounts).length > 0) {
      monthlyAdded = reconcileMonthlySeriesToTotal(monthlyAdded, publication.citations, eligibleIndexes)
    } else {
      const placed = monthIndexes.map(() => 0)
      const recentAdded = publication.monthlyAdded24.slice(-24)
      const recentMonthStart = Math.max(firstMonthIndex, currentMonthIndex - recentAdded.length + 1)
      recentAdded.forEach((value, offset) => {
        const monthIndex = recentMonthStart + offset
        const targetIndex = monthIndex - firstMonthIndex
        if (targetIndex >= 0 && targetIndex < placed.length) {
          placed[targetIndex] += Math.max(0, Math.round(value || 0))
        }
      })
      const olderEligible = eligibleIndexes.filter((index) => monthIndexes[index] < currentMonthIndex - recentAdded.length + 1)
      monthlyAdded = reconcileMonthlySeriesToTotal(placed, publication.citations, olderEligible.length ? olderEligible : eligibleIndexes)
    }
    let runningTotal = 0
    return monthlyAdded.map((value) => {
      runningTotal += Math.max(0, value)
      return runningTotal
    })
  })

  return monthIndexes.map((monthIndex, index) => {
    const { year, month } = monthIndexToParts(monthIndex)
    return {
      x: year + ((month - 1) / 12),
      label: `${year}-${String(month).padStart(2, '0')}`,
      value: computeHIndex(cumulativeByPublication.map((row) => row[index] ?? 0)),
    }
  })
}

function buildSummaryCandidatesForTarget(
  publications: ParsedPublication[],
  currentH: number,
  targetH: number,
  previousStepWorkIds: Set<string> = new Set<string>(),
): HIndexDrilldownCandidate[] {
  const sortedCandidates = buildCandidatesForTarget(publications, targetH)
  if (!sortedCandidates.length) {
    return []
  }
  const currentMeetingTarget = publications.filter((row) => row.citations >= targetH).length
  const papersNeeded = Math.max(0, targetH - currentMeetingTarget)
  const stepOffset = Math.max(0, targetH - (currentH + 1))
  let limit = Math.min(
    sortedCandidates.length,
    Math.max(5, Math.min(8, papersNeeded + 2 + (stepOffset * 2))),
  )
  const maxExpandedLimit = Math.min(sortedCandidates.length, 10)
  while (
    previousStepWorkIds.size > 0
    && limit < maxExpandedLimit
    && sortedCandidates.slice(0, limit).every((candidate) => previousStepWorkIds.has(candidate.workId))
  ) {
    limit += 1
  }
  return sortedCandidates.slice(0, limit)
}

function buildTopBreakdown(
  values: ParsedPublication[],
  resolveLabel: (row: ParsedPublication) => string,
  limit: number,
): Array<{ label: string; value: string; raw: number }> {
  const counts = new Map<string, number>()
  for (const row of values) {
    const label = resolveLabel(row)
    counts.set(label, (counts.get(label) || 0) + 1)
  }
  const total = values.length
  return Array.from(counts.entries())
    .sort((left, right) => right[1] - left[1])
    .slice(0, limit)
    .map(([label, count]) => ({
      label,
      value: `${formatInt(count)} (${total > 0 ? Math.round((count / total) * 100) : 0}%)`,
      raw: count,
    }))
}

function buildAuthorshipBreakdown(values: ParsedPublication[]): Array<{ label: string; value: string; raw: number }> {
  const orderedLabels = ['First author', 'Second author', 'Other', 'Senior author']
  const counts = new Map<string, number>(orderedLabels.map((label) => [label, 0]))
  for (const row of values) {
    const label = normalizeRoleLabel(row.role)
    counts.set(label, (counts.get(label) || 0) + 1)
  }
  const total = values.length
  return orderedLabels.map((label) => {
    const count = counts.get(label) || 0
    return {
      label,
      value: `${formatInt(count)} (${total > 0 ? Math.round((count / total) * 100) : 0}%)`,
      raw: count,
    }
  })
}

function buildCandidatePapers(tile: PublicationMetricTilePayload, targetH: number): HIndexDrilldownCandidate[] {
  const drilldown = (tile.drilldown || {}) as Record<string, unknown>
  const metadata = (drilldown.metadata || {}) as Record<string, unknown>
  const intermediate = (metadata.intermediate_values || {}) as Record<string, unknown>
  const candidates = Array.isArray(intermediate.candidate_papers) ? intermediate.candidate_papers : []
  return candidates
    .map((item, index) => {
      if (!item || typeof item !== 'object') {
        return null
      }
      const row = item as Record<string, unknown>
      const citations = Math.max(
        0,
        Math.round(parseMetricNumber(row.citations_lifetime ?? row.citations ?? row.cited_by_count) || 0),
      )
      const citationsToNextH = Math.max(
        0,
        Math.round(parseMetricNumber(row.citations_to_next_h) ?? Math.max(0, targetH - citations)),
      )
      const projectedCitations12m = Math.max(
        citations,
        Math.round(parseMetricNumber(row.projected_citations_12m) || citations),
      )
      return {
        workId: String(row.work_id || row.id || `candidate-${index}`),
        title: String(row.title || '').trim() || 'Untitled paper',
        citations,
        citationsToNextH,
        projectedCitations12m,
        projectionOutlookLabel: buildProjectionOutlookLabel({
          citations,
          targetH,
          projectedCitations12m,
        }),
      }
    })
    .filter((item): item is HIndexDrilldownCandidate => item !== null)
    .sort((left, right) => {
      if (left.citationsToNextH !== right.citationsToNextH) {
        return left.citationsToNextH - right.citationsToNextH
      }
      return right.citations - left.citations
    })
    .slice(0, 5)
}

export function buildHIndexDrilldownStats(tile: PublicationMetricTilePayload): HIndexDrilldownStats {
  const chartData = (tile.chart_data || {}) as Record<string, unknown>
  const drilldown = (tile.drilldown || {}) as Record<string, unknown>
  const metadata = (drilldown.metadata || {}) as Record<string, unknown>
  const intermediate = (metadata.intermediate_values || {}) as Record<string, unknown>

  const currentH = Math.max(
    0,
    Math.round(
      parseMetricNumber(chartData.current_h_index)
      ?? parseMetricNumber(tile.value)
      ?? parseMetricNumber(tile.main_value)
      ?? 0,
    ),
  )
  const projectedYear = Math.max(
    2000,
    Math.round(parseMetricNumber(chartData.projected_year) ?? new Date().getUTCFullYear()),
  )
  const projectedH = Math.max(
    currentH,
    Math.round(parseMetricNumber(chartData.projected_value) ?? parseMetricNumber(intermediate.projected_h_index) ?? currentH),
  )
  const targetH = Math.max(
    currentH + 1,
    Math.round(parseMetricNumber(chartData.next_h_index) ?? parseMetricNumber(intermediate.next_h_target) ?? (currentH + 1)),
  )
  const publicationsRaw = Array.isArray(drilldown.publications) ? drilldown.publications : []
  const fullHistoryYearsRaw = Array.isArray(intermediate.h_yearly_years_full) ? intermediate.h_yearly_years_full : []
  const fullHistoryValuesRaw = Array.isArray(intermediate.h_yearly_values_full) ? intermediate.h_yearly_values_full : []
  const fullHistoryYears = fullHistoryYearsRaw
    .map((item) => Math.round(parseMetricNumber(item) ?? Number.NaN))
    .filter((item) => Number.isFinite(item))
  const fullHistoryValues = fullHistoryValuesRaw
    .map((item) => Math.max(0, Math.round(parseMetricNumber(item) ?? Number.NaN)))
    .filter((item) => Number.isFinite(item))
  const normalizedFullHistory = fullHistoryYears.length === fullHistoryValues.length && fullHistoryYears.length > 0
    ? fullHistoryYears.map((year, index) => ({
      year,
      value: fullHistoryValues[index],
    }))
    : []
  const fallbackYears = toMetricNumberArray(chartData.years).map((item) => Math.round(item))
  const fallbackValues = toMetricNumberArray(chartData.values).map((item) => Math.max(0, Math.round(item)))
  const chartHistoryYears = normalizedFullHistory.length
    ? normalizedFullHistory.map((point) => point.year)
    : fallbackYears
  const chartHistoryValues = normalizedFullHistory.length
    ? normalizedFullHistory.map((point) => point.value)
    : fallbackValues
  const publications = publicationsRaw
    .map((item, index) => {
      if (!item || typeof item !== 'object') {
        return null
      }
      const row = item as Record<string, unknown>
      const year = Number(row.year)
      return {
        workId: String(row.work_id || row.id || `publication-${index}`),
        title: String(row.title || '').trim() || 'Untitled paper',
        year: Number.isInteger(year) ? year : null,
        citations: Math.max(
          0,
          Math.round(parseMetricNumber(row.citations_lifetime ?? row.citations ?? row.cited_by_count) || 0),
        ),
        citationsLast12m: Math.max(
          0,
          Math.round(parseMetricNumber(row.citations_last_12m ?? row.citations_1y_rolling ?? row.citations_last_12_months) || 0),
        ),
        role: String(row.role || row.user_author_role || '').trim(),
        publicationType: String(row.work_type || row.publication_type || row.publicationType || '').trim(),
        yearlyCounts: Object.fromEntries(
          Object.entries((typeof row.yearly_counts === 'object' && row.yearly_counts) ? row.yearly_counts as Record<string, unknown> : {})
            .map(([yearKey, value]) => [
              Math.round(parseMetricNumber(yearKey) ?? Number.NaN),
              Math.max(0, Math.round(parseMetricNumber(value) ?? 0)),
            ])
            .filter(([yearKey]) => Number.isFinite(yearKey)),
        ),
        monthlyAdded24: toMetricNumberArray(row.monthly_added_24).map((value) => Math.max(0, Math.round(value))),
        publicationMonthStart: typeof row.publication_month_start === 'string' ? row.publication_month_start : null,
        fallbackYear: parseMetricNumber(row.fallback_year) === null ? null : Math.round(parseMetricNumber(row.fallback_year) as number),
      }
    })
    .filter((row): row is ParsedPublication => row !== null)
  const trajectoryPoints = publications.length
    ? buildMonthlyHIndexTimeline(publications, new Date())
    : buildHIndexTrajectoryPoints(chartHistoryYears, chartHistoryValues)

  const derivedProgressPct = computeProgressToTarget(publications, targetH)
  const progressPct = Math.max(
    0,
    Math.min(
      100,
      publications.length
        ? derivedProgressPct
        : (parseMetricNumber(chartData.progress_to_next_pct) ?? parseMetricNumber(intermediate.progress_to_next_h_pct) ?? 0),
    ),
  )

  const totalPublications = publications.length
  const totalCitations = publications.reduce((sum, row) => sum + row.citations, 0)
  const hCoreRows = currentH > 0 ? publications.filter((row) => row.citations >= currentH) : []
  const hCorePublicationCount = Math.max(
    0,
    Math.round(publications.length ? hCoreRows.length : (parseMetricNumber(intermediate.h_core_publication_count) ?? hCoreRows.length)),
  )
  const hCoreCitations = Math.max(
    0,
    Math.round(publications.length ? hCoreRows.reduce((sum, row) => sum + row.citations, 0) : (parseMetricNumber(intermediate.h_core_citations) ?? hCoreRows.reduce((sum, row) => sum + row.citations, 0))),
  )
  const hCoreSharePct = Math.max(
    0,
    Math.min(
      100,
      parseMetricNumber(intermediate.h_core_share_total_citations_pct)
      ?? (totalCitations > 0 ? (hCoreCitations / totalCitations) * 100 : 0),
    ),
  )
  const nonHCorePublicationCount = Math.max(0, totalPublications - hCorePublicationCount)
  const nonHCoreCitations = Math.max(0, totalCitations - hCoreCitations)
  const hCorePublicationSharePct = totalPublications > 0
    ? (hCorePublicationCount / totalPublications) * 100
    : 0

  const citedRows = publications.filter((row) => row.citations > 0)
  const firstCitedYear = citedRows
    .map((row) => row.year)
    .filter((year): year is number => year !== null)
    .sort((left, right) => left - right)[0] ?? null
  const yearsSinceFirstCitedPaper = firstCitedYear !== null
    ? Math.max(1, projectedYear - firstCitedYear + 1)
    : null

  const mIndexRaw = parseMetricNumber(intermediate.m_index)
    ?? (yearsSinceFirstCitedPaper ? currentH / yearsSinceFirstCitedPaper : null)
  const gIndexRaw = Math.max(
    currentH,
    Math.round(parseMetricNumber(intermediate.g_index) ?? computeGIndex(publications.map((row) => row.citations))),
  )
  const i10IndexRaw = Math.max(
    0,
    Math.round(parseMetricNumber(intermediate.i10_index) ?? publications.filter((row) => row.citations >= 10).length),
  )

  const derivedCitationsNeededForNextH = computeCitationsNeededForTarget(publications, targetH)
  const citationsNeededForNextH = Math.max(
    0,
    Math.round(
      publications.length
        ? derivedCitationsNeededForNextH
        : (parseMetricNumber(intermediate.citations_needed_for_next_h_total) ?? 0),
    ),
  )
  const hCoreCitationDensityRaw = parseMetricNumber(intermediate.h_core_citation_density)
    ?? (hCorePublicationCount > 0 ? hCoreCitations / hCorePublicationCount : null)

  const authorshipMix = buildAuthorshipBreakdown(hCoreRows)
  const publicationTypeMix = buildTopBreakdown(
    hCoreRows,
    (row) => toTitleCaseLabel(row.publicationType),
    4,
  )
  const summaryThresholdSteps = publications.length
    ? [targetH, targetH + 1].map((stepTarget) => computeThresholdStep(publications, stepTarget))
    : []
  const summaryThresholdCandidates = publications.length
    ? (() => {
      const firstStepCandidates = buildSummaryCandidatesForTarget(publications, currentH, targetH)
      const firstStepWorkIds = new Set(firstStepCandidates.map((candidate) => candidate.workId))
      const secondStepCandidates = buildSummaryCandidatesForTarget(publications, currentH, targetH + 1, firstStepWorkIds)
      return [
        { targetH, candidates: firstStepCandidates },
        { targetH: targetH + 1, candidates: secondStepCandidates },
      ]
    })()
    : []

  const milestoneYearsRaw = intermediate.h_milestone_years
  const milestones: HIndexDrilldownMilestone[] = typeof milestoneYearsRaw === 'object' && milestoneYearsRaw
    ? Object.entries(milestoneYearsRaw as Record<string, unknown>)
      .map<HIndexDrilldownMilestone | null>(([target, year]) => {
        const parsedTarget = Math.round(parseMetricNumber(target) ?? 0)
        const parsedYear = Math.round(parseMetricNumber(year) ?? 0)
        if (parsedTarget <= 0 || parsedYear <= 0) {
          return null
        }
        return {
          milestone: parsedTarget,
          label: `Reached h${parsedTarget}`,
          value: String(parsedYear),
          year: parsedYear,
          yearsFromPrevious: null,
        }
      })
      .filter((item): item is HIndexDrilldownMilestone => item !== null)
      .sort((left, right) => left.milestone - right.milestone)
      .map((item, index, array) => {
        const previousItem = index > 0 ? array[index - 1] : null
        return {
          ...item,
          yearsFromPrevious: previousItem ? Math.max(0, item.year - previousItem.year) : null,
        }
      })
    : []

  return {
    currentH,
    targetH,
    projectedYear,
    projectedH,
    fullHistoryYears: chartHistoryYears,
    fullHistoryValues: chartHistoryValues,
    trajectoryPoints,
    progressPct,
    papersInHCore: hCorePublicationCount,
    citationsNeededForNextH,
    hCoreSharePct,
    yearsSinceFirstCitedPaper,
    mIndexRaw,
    mIndexValue: mIndexRaw === null ? '\u2014' : formatDecimal(mIndexRaw, 2),
    gIndexRaw,
    gIndexValue: formatInt(gIndexRaw),
    i10IndexRaw,
    i10IndexValue: formatInt(i10IndexRaw),
    totalPublications,
    totalCitations,
    hCorePublicationCount,
    hCorePublicationSharePct,
    nonHCorePublicationCount,
    hCoreCitations,
    nonHCoreCitations,
    hCoreCitationDensityRaw,
    hCoreCitationDensityValue: hCoreCitationDensityRaw === null ? '\u2014' : formatDecimal(hCoreCitationDensityRaw, 1),
    hCoreShareValue: `${Math.round(hCoreSharePct)}%`,
    authorshipMix,
    publicationTypeMix,
    milestones,
    candidatePapers: buildCandidatePapers(tile, targetH),
    summaryThresholdSteps,
    summaryThresholdCandidates,
  }
}

export function buildHIndexHeadlineMetricTiles(tile: PublicationMetricTilePayload): Array<{ label: string; value: string }> {
  const stats = buildHIndexDrilldownStats(tile)
  return [
    { label: 'Current h-index', value: formatInt(stats.currentH) },
    { label: `Projected ${stats.projectedYear}`, value: formatInt(stats.projectedH) },
    { label: `Progress to h${stats.targetH}`, value: `${Math.round(stats.progressPct)}%` },
    { label: `Papers with ${formatInt(stats.currentH)}+ cites`, value: formatInt(stats.papersInHCore) },
    { label: `Citations needed for h${stats.targetH}`, value: formatInt(stats.citationsNeededForNextH) },
    { label: 'h-core share of citations', value: stats.hCoreShareValue },
    {
      label: 'Years since first cited paper',
      value: stats.yearsSinceFirstCitedPaper === null ? '\u2014' : formatInt(stats.yearsSinceFirstCitedPaper),
    },
    { label: 'm-index', value: stats.mIndexValue },
  ]
}
