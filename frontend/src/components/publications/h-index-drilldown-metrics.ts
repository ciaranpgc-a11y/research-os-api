import type { PublicationMetricTilePayload } from '@/types/impact'

export type HIndexDrilldownCandidate = {
  workId: string
  title: string
  citations: number
  citationsToNextH: number
  projectedCitations12m: number
  projectionProbabilityPct: number
}

export type HIndexDrilldownStats = {
  currentH: number
  targetH: number
  projectedYear: number
  projectedH: number
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
}

type ParsedPublication = {
  workId: string
  title: string
  year: number | null
  citations: number
  role: string
  publicationType: string
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
      return 'First author'
    case 'second':
      return 'Second author'
    case 'last':
      return 'Senior author'
    case 'other':
      return 'Other authorship'
    default:
      return 'Other authorship'
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
      return {
        workId: String(row.work_id || row.id || `candidate-${index}`),
        title: String(row.title || '').trim() || 'Untitled paper',
        citations,
        citationsToNextH,
        projectedCitations12m: Math.max(
          citations,
          Math.round(parseMetricNumber(row.projected_citations_12m) || citations),
        ),
        projectionProbabilityPct: Math.round(Math.max(
          0,
          Math.min(100, (parseMetricNumber(row.projection_probability) || 0) * 100),
        )),
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
  const progressPct = Math.max(
    0,
    Math.min(100, parseMetricNumber(chartData.progress_to_next_pct) ?? parseMetricNumber(intermediate.progress_to_next_h_pct) ?? 0),
  )

  const publicationsRaw = Array.isArray(drilldown.publications) ? drilldown.publications : []
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
        role: String(row.role || row.user_author_role || '').trim(),
        publicationType: String(row.work_type || row.publication_type || row.publicationType || '').trim(),
      }
    })
    .filter((row): row is ParsedPublication => row !== null)

  const totalPublications = publications.length
  const totalCitations = publications.reduce((sum, row) => sum + row.citations, 0)
  const hCoreRows = currentH > 0 ? publications.filter((row) => row.citations >= currentH) : []
  const hCorePublicationCount = Math.max(
    0,
    Math.round(parseMetricNumber(intermediate.h_core_publication_count) ?? hCoreRows.length),
  )
  const hCoreCitations = Math.max(
    0,
    Math.round(parseMetricNumber(intermediate.h_core_citations) ?? hCoreRows.reduce((sum, row) => sum + row.citations, 0)),
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

  const citationsNeededForNextH = Math.max(
    0,
    Math.round(parseMetricNumber(intermediate.citations_needed_for_next_h_total) ?? 0),
  )
  const hCoreCitationDensityRaw = parseMetricNumber(intermediate.h_core_citation_density)
    ?? (hCorePublicationCount > 0 ? hCoreCitations / hCorePublicationCount : null)

  const authorshipMix = buildTopBreakdown(
    hCoreRows,
    (row) => normalizeRoleLabel(row.role),
    4,
  )
  const publicationTypeMix = buildTopBreakdown(
    hCoreRows,
    (row) => toTitleCaseLabel(row.publicationType),
    4,
  )

  const milestoneYearsRaw = intermediate.h_milestone_years
  const milestones = typeof milestoneYearsRaw === 'object' && milestoneYearsRaw
    ? Object.entries(milestoneYearsRaw as Record<string, unknown>)
      .map(([target, year]) => {
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
      .filter((item): item is { milestone: number; label: string; value: string; year: number; yearsFromPrevious: number | null } => item !== null)
      .sort((left, right) => left.milestone - right.milestone)
      .map((item, index, array) => ({
        ...item,
        yearsFromPrevious: index === 0 ? null : Math.max(0, item.year - array[index - 1].year),
      }))
    : []

  return {
    currentH,
    targetH,
    projectedYear,
    projectedH,
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
  }
}

export function buildHIndexHeadlineMetricTiles(tile: PublicationMetricTilePayload): Array<{ label: string; value: string }> {
  const stats = buildHIndexDrilldownStats(tile)
  return [
    { label: 'Current h-index', value: formatInt(stats.currentH) },
    { label: `Projected ${stats.projectedYear}`, value: formatInt(stats.projectedH) },
    { label: `Progress to h${stats.targetH}`, value: `${Math.round(stats.progressPct)}%` },
    { label: 'Papers in h-core', value: formatInt(stats.papersInHCore) },
    { label: `Citations needed for h${stats.targetH}`, value: formatInt(stats.citationsNeededForNextH) },
    { label: 'h-core share of citations', value: stats.hCoreShareValue },
    {
      label: 'Years since first cited paper',
      value: stats.yearsSinceFirstCitedPaper === null ? '\u2014' : formatInt(stats.yearsSinceFirstCitedPaper),
    },
    { label: 'm-index', value: stats.mIndexValue },
  ]
}
