import type { PublicationMetricTilePayload } from '@/types/impact'

import { buildHIndexDrilldownStats } from './h-index-drilldown-metrics'

export type HIndexMethodsSection = {
  key: 'summary' | 'breakdown' | 'trajectory' | 'context'
  title: 'Summary' | 'Breakdown' | 'Trajectory' | 'Context'
  description: string
  facts: Array<{ label: string; value: string }>
  bullets: string[]
  note?: string
}

function toMetricText(value: unknown, fallback = 'Not available'): string {
  const text = String(value || '').trim()
  return text || fallback
}

function toStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return []
  }
  return value
    .map((item) => String(item || '').trim())
    .filter(Boolean)
}

function formatInt(value: number): string {
  const finiteValue = Number.isFinite(value) ? value : 0
  return Math.round(Math.max(0, finiteValue)).toLocaleString('en-GB')
}

export function buildHIndexMethodsSections(tile: PublicationMetricTilePayload): HIndexMethodsSection[] {
  const drilldown = (tile.drilldown || {}) as Record<string, unknown>
  const methods = (drilldown.methods || {}) as Record<string, unknown>
  const stats = buildHIndexDrilldownStats(tile)
  const sources = toStringArray(methods.data_sources).length
    ? toStringArray(methods.data_sources)
    : toStringArray(tile.data_source)
  const candidateWindow = toMetricText(
    methods.candidate_window || methods.selection_window,
    'Near-threshold papers around the current and next h boundary',
  )
  const refreshCadence = toMetricText(methods.refresh_cadence, 'Publication metrics refresh cycle')
  const lastUpdated = toMetricText(methods.last_updated || drilldown.as_of_date, 'Not available')
  const confidenceNote = toMetricText(drilldown.confidence_note || methods.confidence_note, '')
  const chartData = (tile.chart_data || {}) as Record<string, unknown>
  const years = Array.isArray(chartData.years)
    ? chartData.years.map((value) => Number(value)).filter((value) => Number.isInteger(value))
    : []
  const firstYear = years[0] || null
  const lastYear = years[years.length - 1] || null
  const trajectoryCoverage = firstYear !== null && lastYear !== null
    ? `${firstYear} to ${lastYear}`
    : 'Not available'
  const sourceLabel = sources.length ? sources.join(', ') : 'Not available'

  return [
    {
      key: 'summary',
      title: 'Summary',
      description: 'How the h-index headline, projection, and runway figures are constructed.',
      facts: [
        { label: 'Definition', value: toMetricText(methods.definition || drilldown.definition, 'Largest h where h papers have at least h citations.') },
        { label: 'Formula', value: toMetricText(methods.formula || drilldown.formula, 'Sort publications by citations and find the highest self-consistent threshold.') },
        { label: 'Current h-index', value: formatInt(stats.currentH) },
        { label: 'Next target', value: `h${formatInt(stats.targetH)}` },
        { label: 'Projection year', value: String(stats.projectedYear) },
        { label: 'Sources', value: sourceLabel },
      ],
      bullets: [
        `The current h-index is evaluated from ${formatInt(stats.totalPublications)} synced publications using lifetime citation counts.`,
        `Projected h-index uses near-threshold candidate papers plus the 12-month citation outlook to estimate whether the next threshold is reachable by ${stats.projectedYear}.`,
        `Headline runway cards report the total citations still needed across candidate papers to lock in h${formatInt(stats.targetH)}.`,
      ],
      note: confidenceNote || undefined,
    },
    {
      key: 'breakdown',
      title: 'Breakdown',
      description: 'How h-core composition and mix views are derived from the same publication set.',
      facts: [
        { label: 'h-core rule', value: `Papers with at least ${formatInt(stats.currentH)} citations` },
        { label: 'h-core papers', value: formatInt(stats.hCorePublicationCount) },
        { label: 'Outside h-core', value: formatInt(stats.nonHCorePublicationCount) },
        { label: 'Authorship buckets', value: formatInt(stats.authorshipMix.length) },
        { label: 'Publication types shown', value: formatInt(stats.publicationTypeMix.length) },
      ],
      bullets: [
        'Breakdown panels split the publication set into h-core and non-h-core segments using the current h threshold.',
        'Authorship and publication-type mixes are descriptive counts of papers inside the h-core, not weighted citation averages.',
        'When multiple publication types exist, the drilldown shows the most represented h-core formats first.',
      ],
    },
    {
      key: 'trajectory',
      title: 'Trajectory',
      description: 'How the h-index trend and next-threshold runway are assembled.',
      facts: [
        { label: 'Timeline coverage', value: trajectoryCoverage },
        { label: 'Projected h-index', value: formatInt(stats.projectedH) },
        { label: 'Candidate papers shown', value: formatInt(stats.candidatePapers.length) },
        { label: 'Candidate window', value: candidateWindow },
        { label: 'Refresh cadence', value: refreshCadence },
      ],
      bullets: [
        'Trajectory charts show historical h-index by year and a separate view of citation gaps among the nearest candidate papers.',
        'Milestone tables use the first year each integer h threshold was reached and calculate elapsed years between milestones.',
        'Candidate rows show current citations, the remaining gap to h+1, projected 12-month citations, and crossing likelihood.',
      ],
    },
    {
      key: 'context',
      title: 'Context',
      description: 'How companion indices and h-core context measures should be interpreted.',
      facts: [
        { label: 'm-index', value: stats.mIndexValue },
        { label: 'g-index', value: stats.gIndexValue },
        { label: 'i10-index', value: stats.i10IndexValue },
        { label: 'h-core share', value: stats.hCoreShareValue },
        { label: 'Last updated', value: lastUpdated },
      ],
      bullets: [
        'm-index normalises h-index by career span, so it is most useful for comparing pace rather than scale.',
        'g-index increases when highly cited papers add excess depth beyond the h-core threshold; i10-index simply counts papers with at least ten citations.',
        'h-core density and h-core share describe how concentrated the citation portfolio is inside the current h-defining set.',
      ],
    },
  ]
}
