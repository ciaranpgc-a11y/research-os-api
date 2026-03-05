import type { PublicationMetricTilePayload } from '@/types/impact'

export type TotalPublicationsMethodsSection = {
  key: 'summary' | 'breakdown' | 'trajectory' | 'context'
  title: 'Summary' | 'Breakdown' | 'Trajectory' | 'Context'
  description: string
  facts: Array<{ label: string; value: string }>
  bullets: string[]
  note?: string
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
  const boundedValue = Math.max(-Number.MAX_SAFE_INTEGER, Math.min(Number.MAX_SAFE_INTEGER, finiteValue))
  return Math.round(boundedValue).toLocaleString('en-GB')
}

function toMetricText(value: unknown, fallback = 'Not available'): string {
  const text = String(value || '').trim()
  return text || fallback
}

function countBreakdownItems(breakdowns: unknown, breakdownId: string): number {
  if (!Array.isArray(breakdowns)) {
    return 0
  }
  const match = breakdowns.find((item) => (
    item
    && typeof item === 'object'
    && String((item as Record<string, unknown>).breakdown_id || '').trim() === breakdownId
  ))
  if (!match || typeof match !== 'object') {
    return 0
  }
  const items = (match as Record<string, unknown>).items
  return Array.isArray(items) ? items.length : 0
}

function collectPublicationYears(tile: PublicationMetricTilePayload): number[] {
  const drilldown = (tile.drilldown || {}) as Record<string, unknown>
  const chartData = (tile.chart_data || {}) as Record<string, unknown>
  const publicationYears = Array.isArray(drilldown.publications)
    ? drilldown.publications
      .map((item) => {
        if (!item || typeof item !== 'object') {
          return null
        }
        const parsed = Number((item as Record<string, unknown>).year)
        return Number.isInteger(parsed) ? parsed : null
      })
      .filter((year): year is number => year !== null)
    : []
  const chartYears = Array.isArray(chartData.years)
    ? chartData.years
      .map((value) => Number(value))
      .filter((value) => Number.isInteger(value))
    : []
  return [...new Set([...publicationYears, ...chartYears])]
    .filter((year) => year >= 1900 && year <= 3000)
    .sort((left, right) => left - right)
}

function buildWindowLabelSummary(tile: PublicationMetricTilePayload): string {
  const drilldown = (tile.drilldown || {}) as Record<string, unknown>
  const labels = Array.isArray(drilldown.windows)
    ? drilldown.windows
      .map((item) => {
        if (!item || typeof item !== 'object') {
          return ''
        }
        return String((item as Record<string, unknown>).label || '').trim()
      })
      .filter(Boolean)
    : []
  return labels.length ? labels.join(', ') : '1y, 3y, 5y, All'
}

export function buildTotalPublicationsMethodsSections(tile: PublicationMetricTilePayload): TotalPublicationsMethodsSection[] {
  const drilldown = (tile.drilldown || {}) as Record<string, unknown>
  const methods = (drilldown.methods || {}) as Record<string, unknown>
  const breakdowns = Array.isArray(drilldown.breakdowns) ? drilldown.breakdowns : []
  const benchmarks = Array.isArray(drilldown.benchmarks) ? drilldown.benchmarks : []
  const publicationCount = Array.isArray(drilldown.publications)
    ? drilldown.publications.filter((item) => item && typeof item === 'object').length
    : 0
  const sources = toStringArray(methods.data_sources).length
    ? toStringArray(methods.data_sources)
    : toStringArray(tile.data_source)
  const caveats = toStringArray(methods.caveats)
  const dedupeRules = toStringArray(methods.dedupe_rules)
  const publicationYears = collectPublicationYears(tile)
  const firstYear = publicationYears[0] || null
  const lastYear = publicationYears[publicationYears.length - 1] || null
  const trajectorySpan = firstYear !== null && lastYear !== null
    ? Math.max(1, (lastYear - firstYear) + 1)
    : 0
  const trajectorySliderMin = Math.min(6, Math.max(1, trajectorySpan || 1))
  const trajectorySliderMax = Math.max(1, trajectorySpan || 1)
  const windowSummary = buildWindowLabelSummary(tile)
  const publicationTypeCount = countBreakdownItems(breakdowns, 'by_publication_type')
  const venueCount = countBreakdownItems(breakdowns, 'by_venue_full')
  const topicCount = countBreakdownItems(breakdowns, 'by_topic')
  const oaStatusCount = countBreakdownItems(breakdowns, 'by_oa_status')
  const refreshCadence = toMetricText(methods.refresh_cadence, 'Not available')
  const lastUpdated = toMetricText(methods.last_updated || drilldown.as_of_date, 'Not available')
  const sourceLabel = sources.length ? sources.join(', ') : 'Not available'
  const dedupeLabel = dedupeRules.length
    ? dedupeRules.join(' ')
    : 'DOI/PMID identity match takes precedence, then title plus publication year fallback checks.'

  return [
    {
      key: 'summary',
      title: 'Summary',
      description: 'How the headline cards and lifetime totals are calculated.',
      facts: [
        { label: 'Definition', value: toMetricText(methods.definition || drilldown.definition) },
        { label: 'Formula', value: toMetricText(methods.formula || drilldown.formula) },
        { label: 'Windows', value: windowSummary },
        { label: 'Sources', value: sourceLabel },
        { label: 'Refresh cadence', value: refreshCadence },
        { label: 'Last updated', value: lastUpdated },
      ],
      bullets: [
        `The tile counts authored publications from ${publicationCount > 0 ? `${formatInt(publicationCount)} synced records` : 'the synced publication record set'} and groups them by calendar year.`,
        `Headline cards combine lifetime output with active years, current year-to-date volume, rolling windows (${windowSummary}), and peak-year markers.`,
        `Duplicate handling follows ${dedupeLabel}`,
      ],
      note: caveats[0] ? `Confidence note: ${caveats[0]}` : undefined,
    },
    {
      key: 'breakdown',
      title: 'Breakdown',
      description: 'How categorical slices are built from the same publication set.',
      facts: [
        { label: 'Publication groups', value: publicationTypeCount > 0 ? formatInt(publicationTypeCount) : 'Not available' },
        { label: 'Journals tracked', value: venueCount > 0 ? formatInt(venueCount) : 'Not available' },
        { label: 'Topics tracked', value: topicCount > 0 ? formatInt(topicCount) : 'Provider dependent' },
        { label: 'OA statuses', value: oaStatusCount > 0 ? formatInt(oaStatusCount) : 'Provider dependent' },
      ],
      bullets: [
        'Publication type, journal, article classification, topic, and open-access breakdowns all start from the same authored record set.',
        'Topic counts use up to the top 3 provider topics per publication when enrichment is present.',
        'Share percentages divide each bucket by the full publication count. Average citations are descriptive only and do not weight bucket ranking.',
      ],
    },
    {
      key: 'trajectory',
      title: 'Trajectory',
      description: 'How the trend chart and derived trajectory metrics are computed.',
      facts: [
        { label: 'Series coverage', value: firstYear !== null && lastYear !== null ? `${firstYear} to ${lastYear}` : 'Not available' },
        { label: 'Observed span', value: trajectorySpan > 0 ? `${formatInt(trajectorySpan)} years` : 'Not available' },
        { label: 'Mode options', value: 'Raw, moving avg, cumulative' },
        { label: 'Slider range', value: `${formatInt(trajectorySliderMin)} to ${formatInt(trajectorySliderMax)} years` },
      ],
      bullets: [
        'Raw mode plots annual publication counts and inserts zero-valued years so the time series stays continuous.',
        'Moving average uses a trailing 3-year mean. Cumulative mode converts the yearly series into a running lifetime total.',
        'Volatility index is yearly standard deviation divided by mean output. Growth slope is a simple linear-regression slope. Phase is Expanding above 0.2, Contracting below -0.2, otherwise Stable.',
      ],
    },
    {
      key: 'context',
      title: 'Context',
      description: 'How comparative context is sourced for this metric.',
      facts: [
        { label: 'Benchmark rows', value: benchmarks.length ? formatInt(benchmarks.length) : '0' },
        { label: 'Context status', value: benchmarks.length ? 'Benchmark comparisons available' : 'No benchmark cohort yet' },
        { label: 'Sources', value: sourceLabel },
        { label: 'Refresh cadence', value: refreshCadence },
      ],
      bullets: benchmarks.length
        ? [
          'Context cards render benchmark rows returned in the canonical drilldown payload for this metric.',
          'Benchmark values are displayed as comparison-only context and do not change the publication totals shown in Summary or Trajectory.',
          'Venue, topic, and open-access patterns still live in Breakdown because they describe composition rather than external benchmarking.',
        ]
        : [
          'Total publication insights currently has no external benchmark cohort in the canonical drilldown payload, so the Context tab remains empty until benchmark rows are available.',
          'Venue, topic, and open-access patterns still provide descriptive context in Breakdown even when benchmark cards are unavailable.',
          'Refresh cadence and timestamps follow the synced publication-metrics refresh cycle.',
        ],
    },
  ]
}
