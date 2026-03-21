import type { PublicationMetricTilePayload } from '@/types/impact'

export const ENHANCED_GENERIC_METRIC_KEYS = [
  'momentum',
  'impact_concentration',
  'influential_citations',
  'field_percentile_share',
  'authorship_composition',
  'collaboration_structure',
] as const

export type EnhancedGenericMetricKey = (typeof ENHANCED_GENERIC_METRIC_KEYS)[number]

export type RemainingMetricMethodsSection = {
  key: 'summary' | 'breakdown' | 'trajectory' | 'context'
  title: 'Summary' | 'Breakdown' | 'Trajectory' | 'Context'
  description: string
  facts: Array<{ label: string; value: string }>
  bullets: string[]
  note?: string
}

export type MomentumDrilldownStats = {
  momentumIndex: number
  state: string
  recentScore12m: number | null
  previousScore12m: number | null
  delta: number | null
  monthlyValues12m: number[]
  weightedMonthlyValues12m: number[]
  trackedPapers: number
  publications: Array<{
    workId: string
    title: string
    venue: string
    year: number | null
    publicationMonthStart: string | null
    recent3mCitations: number
    prior9mCitations: number
    recent1yCitations: number
    prior4yCitations: number | null
    citationsLast12m: number
    citationsPrev12m: number
    momentumContribution: number
    recent3mAvg: number | null
    prior9mAvg: number | null
    shiftDelta: number | null
    confidenceLabel: string
  }>
  topContributors: Array<{
    workId: string
    title: string
    venue: string
    year: number | null
    publicationMonthStart: string | null
    recent3mCitations: number
    prior9mCitations: number
    recent1yCitations: number
    prior4yCitations: number | null
    citationsLast12m: number
    citationsPrev12m: number
    momentumContribution: number
    recent3mAvg: number | null
    prior9mAvg: number | null
    shiftDelta: number | null
    confidenceLabel: string
  }>
  confidenceBuckets: Array<{ label: string; count: number }>
  contextModules: MomentumContextModules
}

export type MomentumContextModuleStatus = 'available' | 'partial' | 'unavailable'

export type MomentumFieldRelativeMomentumWindow = {
  status: MomentumContextModuleStatus
  reasonUnavailable: string | null
  actualPaceChangePct: number | null
  actualIsNewSignal: boolean
  fieldBaselineChangePct: number | null
  fieldBaselineIsNewSignal: boolean
  fieldRelativeDeltaPts: number | null
  percentileRank: number | null
  percentileVisible: boolean
  coveragePct: number
  benchmarkedPublications: number
  uniqueCohorts: number
  medianCohortSize: number | null
  actualRecentRate: number | null
  actualPriorRate: number | null
  fieldRecentRate: number | null
  fieldPriorRate: number | null
}

export type MomentumFieldRelativeMomentumContextModule = {
  status: MomentumContextModuleStatus
  reasonUnavailable: string | null
  benchmarkSource: string
  normalizationBasis: string
  windows: Record<'12m' | '5y', MomentumFieldRelativeMomentumWindow>
}

export type MomentumPlaceholderContextModule = {
  status: MomentumContextModuleStatus
  reasonUnavailable: string | null
}

export type MomentumContextModules = {
  fieldRelativeMomentum: MomentumFieldRelativeMomentumContextModule
  signalNoise: MomentumPlaceholderContextModule
  contributionBalance: MomentumPlaceholderContextModule
  publicationTypeContext: MomentumPlaceholderContextModule
  ageAdjustedPerformance: MomentumPlaceholderContextModule
  topicMomentumAlignment: MomentumPlaceholderContextModule
  eventDrivers: MomentumPlaceholderContextModule
  collaborationContext: MomentumPlaceholderContextModule
}

export type ImpactConcentrationDrilldownStats = {
  concentrationPct: number
  classification: string
  giniCoefficient: number | null
  top3Citations: number
  restCitations: number
  totalCitations: number
  topPapersCount: number
  remainingPapersCount: number
  totalPublications: number
  uncitedPublicationsCount: number
  uncitedPublicationsPct: number
  topPapers: Array<{
    workId: string
    title: string
    year: number | null
    citations: number
    shareOfTotalPct: number
    publicationType: string
  }>
}

export type InfluentialCitationsDrilldownStats = {
  totalInfluentialCitations: number
  influentialRatioPct: number
  influenceLast12m: number
  influencePrev12m: number
  influenceDelta: number
  unknownYearInfluentialCitations: number
  yearlySeries: Array<{ label: string; value: number }>
  topPublications: Array<{
    workId: string
    title: string
    venue: string
    lifetimeCitations: number
    influentialCitations: number
    influentialLast12m: number
  }>
}

export type FieldPercentileThreshold = 50 | 75 | 90 | 95 | 99

export type FieldPercentileShareDrilldownStats = {
  thresholds: FieldPercentileThreshold[]
  defaultThreshold: FieldPercentileThreshold
  thresholdRows: Array<{ threshold: FieldPercentileThreshold; paperCount: number; sharePct: number }>
  evaluatedPapers: number
  totalPapers: number
  coveragePct: number
  medianPercentileRank: number | null
  cohortCount: number | null
  cohortMedianSampleSize: number | null
  topPublications: Array<{
    workId: string
    title: string
    fieldName: string
    fieldPercentileRank: number | null
    cohortYear: number | null
    cohortSampleSize: number | null
  }>
  topFields: Array<{
    fieldName: string
    paperCount: number
    medianPercentileRank: number | null
  }>
}

export type AuthorshipCompositionDrilldownStats = {
  firstAuthorshipPct: number
  secondAuthorshipPct: number
  seniorAuthorshipPct: number
  leadershipIndexPct: number
  medianAuthorPositionDisplay: string
  firstAuthorshipCount: number
  secondAuthorshipCount: number
  seniorAuthorshipCount: number
  leadershipCount: number
  knownRoleCount: number
  unknownRoleCount: number
  knownPositionCount: number
  totalPapers: number
  roleRows: Array<{ key: string; label: string; count: number; sharePct: number }>
  topLeadershipPapers: Array<{
    workId: string
    title: string
    year: number | null
    role: string
    citations: number
    publicationType: string
  }>
}

export type CollaborationStructureDrilldownStats = {
  uniqueCollaborators: number
  repeatCollaboratorRatePct: number
  repeatCollaborators: number
  institutions: number
  countries: number
  continents: number
  collaborativeWorks: number
  institutionsFromWorks: number
  countriesFromWorks: number
  institutionsFromCollaborators: number
  countriesFromCollaborators: number
  topCollaborativeWorks: Array<{
    workId: string
    title: string
    year: number | null
    collaboratorsInWork: number
    repeatCollaboratorsInWork: number
    institutionsInWork: number
    countriesInWork: number
    citations: number
  }>
}

type ParsedPublication = {
  workId: string
  title: string
  year: number | null
  publicationMonthStart: string | null
  venue: string
  publicationType: string
  role: string
  citations: number
  recent3mCitations: number
  prior9mCitations: number
  recent1yCitations: number
  prior4yCitations: number | null
  citationsLast12m: number
  citationsPrev12m: number
  momentumContribution: number
  monthlyAdded24: number[]
  yearlyCounts: Record<number, number>
  recent3mAvg: number | null
  prior9mAvg: number | null
  shiftDelta: number | null
  confidenceLabel: string
  influentialCitations: number
  influentialLast12m: number
  shareOfTotalPct: number
  fieldPercentileRank: number | null
  fieldName: string
  cohortYear: number | null
  cohortSampleSize: number | null
  userAuthorPosition: number | null
  collaboratorsInWork: number
  repeatCollaboratorsInWork: number
  institutionsInWork: number
  countriesInWork: number
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

function toNumberArray(value: unknown): number[] {
  if (!Array.isArray(value)) {
    return []
  }
  return value
    .map((item) => {
      const parsed = Number(item)
      return Number.isFinite(parsed) ? parsed : 0
    })
    .filter((item) => Number.isFinite(item))
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

function formatSignedPercentCompact(value: number): string {
  const rounded = Math.round(Number.isFinite(value) ? value : 0)
  const normalized = Math.abs(rounded) < 1 ? 0 : rounded
  return `${normalized >= 0 ? '+' : ''}${normalized.toFixed(0)}%`
}

function formatMomentumRelativePaceLabel(stats: MomentumDrilldownStats): string {
  const recentPace = stats.monthlyValues12m.length >= 3
    ? stats.monthlyValues12m.slice(-3).reduce((sum, value) => sum + Math.max(0, value), 0) / 3
    : 0
  const priorPace = stats.monthlyValues12m.length >= 12
    ? stats.monthlyValues12m.slice(-12, -3).reduce((sum, value) => sum + Math.max(0, value), 0) / 9
    : 0
  if (priorPace > 0) {
    return formatSignedPercentCompact(((recentPace / priorPace) - 1) * 100)
  }
  return recentPace > 0 ? 'New' : '+0%'
}

function average(values: number[]): number | null {
  if (!values.length) {
    return null
  }
  return values.reduce((sum, value) => sum + Math.max(0, value), 0) / values.length
}

function toMetricText(value: unknown, fallback = 'Not available'): string {
  const text = String(value || '').trim()
  return text || fallback
}

function toTitleCaseLabel(value: unknown, fallback = 'Unspecified'): string {
  const normalized = String(value || '')
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
  if (!normalized) {
    return fallback
  }
  return normalized
    .split(' ')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ')
}

function normalizeRoleLabel(value: unknown): string {
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
      return toTitleCaseLabel(value, 'Other authorship')
  }
}

function parseNumericKeyedMap(value: unknown): Record<number, number> {
  if (!value || typeof value !== 'object') {
    return {}
  }
  const output: Record<number, number> = {}
  for (const [key, raw] of Object.entries(value as Record<string, unknown>)) {
    const numericKey = Number(key)
    const numericValue = parseMetricNumber(raw)
    if (!Number.isFinite(numericKey) || numericValue === null) {
      continue
    }
    output[Math.round(numericKey)] = numericValue
  }
  return output
}

function parsePublications(tile: PublicationMetricTilePayload): ParsedPublication[] {
  const drilldown = (tile.drilldown || {}) as Record<string, unknown>
  const publications = Array.isArray(drilldown.publications) ? drilldown.publications : []
  return publications
    .map((item, index) => {
      if (!item || typeof item !== 'object') {
        return null
      }
      const row = item as Record<string, unknown>
      const year = Number(row.year)
      const cohortYear = Number(row.cohort_year)
      const cohortSampleSize = parseMetricNumber(row.cohort_sample_size)
      const authorPosition = parseMetricNumber(row.user_author_position ?? row.author_position)
      const citationsLast12m = Math.max(0, Math.round(parseMetricNumber(row.citations_last_12m) || 0))
      const citationsPrev12m = Math.max(0, Math.round(parseMetricNumber(row.citations_prev_12m) || 0))
      const monthlyAdded24 = toNumberArray(row.monthly_added_24).map((value) => Math.max(0, value))
      const yearlyCounts = parseNumericKeyedMap(row.yearly_counts)
      const recent3mCitations = Math.max(
        0,
        Math.round(
          parseMetricNumber(row.momentum_recent_3m_citations)
          ?? monthlyAdded24.slice(-3).reduce((sum, value) => sum + Math.max(0, value), 0),
        ),
      )
      const prior9mCitations = Math.max(
        0,
        Math.round(
          parseMetricNumber(row.momentum_prior_9m_citations)
          ?? (monthlyAdded24.length >= 12
            ? monthlyAdded24.slice(-12, -3).reduce((sum, value) => sum + Math.max(0, value), 0)
            : 0),
        ),
      )
      const recent1yCitations = Math.max(
        0,
        Math.round(
          parseMetricNumber(row.momentum_recent_1y_citations)
          ?? (monthlyAdded24.length >= 12
            ? monthlyAdded24.slice(-12).reduce((sum, value) => sum + Math.max(0, value), 0)
            : citationsLast12m),
        ),
      )
      const fallbackPrior4yCitations = Object.entries(yearlyCounts)
        .filter(([year]) => {
          const numericYear = Number(year)
          return Number.isFinite(numericYear) && numericYear >= new Date().getUTCFullYear() - 5 && numericYear <= new Date().getUTCFullYear() - 2
        })
        .reduce((sum, [, value]) => sum + Math.max(0, value), 0)
      const prior4yCitationsRaw = parseMetricNumber(row.momentum_prior_4y_citations)
      const recent3mAvg = parseMetricNumber(row.momentum_recent_3m_avg)
        ?? (monthlyAdded24.length >= 3 ? average(monthlyAdded24.slice(-3)) : null)
      const prior9mAvg = parseMetricNumber(row.momentum_prior_9m_avg)
        ?? (monthlyAdded24.length >= 12 ? average(monthlyAdded24.slice(-12, -3)) : null)
      const shiftDelta = parseMetricNumber(row.momentum_shift_delta)
        ?? (recent3mAvg !== null && prior9mAvg !== null ? recent3mAvg - prior9mAvg : null)
      return {
        workId: String(row.work_id || row.id || `publication-${index}`),
        title: String(row.title || '').trim() || 'Untitled paper',
        year: Number.isInteger(year) ? year : null,
        publicationMonthStart: typeof row.publication_month_start === 'string' && row.publication_month_start.trim()
          ? row.publication_month_start.trim()
          : null,
        venue: String(row.venue || row.journal || '').trim(),
        publicationType: toTitleCaseLabel(
          row.work_type || row.workType || row.publication_type || row.publicationType,
          'Unspecified type',
        ),
        role: normalizeRoleLabel(row.role || row.user_author_role),
        citations: Math.max(
          0,
          Math.round(parseMetricNumber(row.citations_lifetime ?? row.citations ?? row.cited_by_count) || 0),
        ),
        recent3mCitations,
        prior9mCitations,
        recent1yCitations,
        prior4yCitations: prior4yCitationsRaw === null
          ? (fallbackPrior4yCitations > 0 ? fallbackPrior4yCitations : null)
          : Math.max(0, Math.round(prior4yCitationsRaw)),
        citationsLast12m,
        citationsPrev12m,
        momentumContribution: parseMetricNumber(row.momentum_contribution) || 0,
        monthlyAdded24,
        yearlyCounts,
        recent3mAvg,
        prior9mAvg,
        shiftDelta,
        confidenceLabel: toMetricText(row.confidence_label, 'Not labelled'),
        influentialCitations: Math.max(0, Math.round(parseMetricNumber(row.influential_citations) || 0)),
        influentialLast12m: Math.max(0, Math.round(parseMetricNumber(row.influential_last_12m) || 0)),
        shareOfTotalPct: Math.max(0, parseMetricNumber(row.share_of_total_pct) || 0),
        fieldPercentileRank: parseMetricNumber(row.field_percentile_rank),
        fieldName: toMetricText(row.field_name, 'Unassigned field'),
        cohortYear: Number.isInteger(cohortYear) ? cohortYear : null,
        cohortSampleSize: cohortSampleSize === null ? null : Math.max(0, Math.round(cohortSampleSize)),
        userAuthorPosition: authorPosition === null ? null : Math.max(1, Math.round(authorPosition)),
        collaboratorsInWork: Math.max(0, Math.round(parseMetricNumber(row.collaborators_in_work) || 0)),
        repeatCollaboratorsInWork: Math.max(
          0,
          Math.round(parseMetricNumber(row.repeat_collaborators_in_work) || 0),
        ),
        institutionsInWork: Math.max(0, Math.round(parseMetricNumber(row.institutions_in_work) || 0)),
        countriesInWork: Math.max(0, Math.round(parseMetricNumber(row.countries_in_work) || 0)),
      }
    })
    .filter((row): row is ParsedPublication => row !== null)
}

function collectCommonMethodsMeta(tile: PublicationMetricTilePayload) {
  const drilldown = (tile.drilldown || {}) as Record<string, unknown>
  const methods = (drilldown.methods || {}) as Record<string, unknown>
  const sources = toStringArray(methods.data_sources).length
    ? toStringArray(methods.data_sources)
    : toStringArray(tile.data_source)
  return {
    drilldown,
    methods,
    sourcesLabel: sources.length ? sources.join(', ') : 'Not available',
    lastUpdated: toMetricText(methods.last_updated || drilldown.as_of_date, 'Not available'),
    refreshCadence: toMetricText(methods.refresh_cadence, 'Publication metrics refresh cycle'),
    confidenceNote: toMetricText(drilldown.confidence_note || methods.confidence_note, ''),
  }
}

const EMPTY_MOMENTUM_FIELD_RELATIVE_WINDOW: MomentumFieldRelativeMomentumWindow = {
  status: 'unavailable',
  reasonUnavailable: 'Benchmark unavailable.',
  actualPaceChangePct: null,
  actualIsNewSignal: false,
  fieldBaselineChangePct: null,
  fieldBaselineIsNewSignal: false,
  fieldRelativeDeltaPts: null,
  percentileRank: null,
  percentileVisible: false,
  coveragePct: 0,
  benchmarkedPublications: 0,
  uniqueCohorts: 0,
  medianCohortSize: null,
  actualRecentRate: null,
  actualPriorRate: null,
  fieldRecentRate: null,
  fieldPriorRate: null,
}

const EMPTY_MOMENTUM_CONTEXT_MODULE: MomentumPlaceholderContextModule = {
  status: 'unavailable',
  reasonUnavailable: 'Module not available.',
}

function parseMomentumContextModuleStatus(value: unknown): MomentumContextModuleStatus {
  const normalized = String(value || '').trim().toLowerCase()
  if (normalized === 'available' || normalized === 'partial' || normalized === 'unavailable') {
    return normalized
  }
  return 'unavailable'
}

function parseMomentumFieldRelativeWindow(value: unknown): MomentumFieldRelativeMomentumWindow {
  if (!value || typeof value !== 'object') {
    return { ...EMPTY_MOMENTUM_FIELD_RELATIVE_WINDOW }
  }
  const row = value as Record<string, unknown>
  return {
    status: parseMomentumContextModuleStatus(row.status),
    reasonUnavailable: toMetricText(row.reason_unavailable, ''),
    actualPaceChangePct: parseMetricNumber(row.actual_pace_change_pct),
    actualIsNewSignal: Boolean(row.actual_is_new_signal),
    fieldBaselineChangePct: parseMetricNumber(row.field_baseline_change_pct),
    fieldBaselineIsNewSignal: Boolean(row.field_baseline_is_new_signal),
    fieldRelativeDeltaPts: parseMetricNumber(row.field_relative_delta_pts),
    percentileRank: parseMetricNumber(row.percentile_rank),
    percentileVisible: Boolean(row.percentile_visible),
    coveragePct: Math.max(0, parseMetricNumber(row.coverage_pct) ?? 0),
    benchmarkedPublications: Math.max(0, Math.round(parseMetricNumber(row.benchmarked_publications) ?? 0)),
    uniqueCohorts: Math.max(0, Math.round(parseMetricNumber(row.unique_cohorts) ?? 0)),
    medianCohortSize: parseMetricNumber(row.median_cohort_size),
    actualRecentRate: parseMetricNumber(row.actual_recent_rate),
    actualPriorRate: parseMetricNumber(row.actual_prior_rate),
    fieldRecentRate: parseMetricNumber(row.field_recent_rate),
    fieldPriorRate: parseMetricNumber(row.field_prior_rate),
  }
}

function parseMomentumPlaceholderContextModule(value: unknown): MomentumPlaceholderContextModule {
  if (!value || typeof value !== 'object') {
    return { ...EMPTY_MOMENTUM_CONTEXT_MODULE }
  }
  const row = value as Record<string, unknown>
  return {
    status: parseMomentumContextModuleStatus(row.status),
    reasonUnavailable: toMetricText(row.reason_unavailable, ''),
  }
}

function parseMomentumContextModules(tile: PublicationMetricTilePayload): MomentumContextModules {
  const drilldown = (tile.drilldown || {}) as Record<string, unknown>
  const contextModules = (drilldown.context_modules || {}) as Record<string, unknown>
  const fieldRelativeRaw = (contextModules.field_relative_momentum || {}) as Record<string, unknown>
  const windowsRaw = (fieldRelativeRaw.windows || {}) as Record<string, unknown>
  return {
    fieldRelativeMomentum: {
      status: parseMomentumContextModuleStatus(fieldRelativeRaw.status),
      reasonUnavailable: toMetricText(fieldRelativeRaw.reason_unavailable, ''),
      benchmarkSource: toMetricText(fieldRelativeRaw.benchmark_source, 'OpenAlex'),
      normalizationBasis: toMetricText(fieldRelativeRaw.normalization_basis, 'Primary field + publication year'),
      windows: {
        '12m': parseMomentumFieldRelativeWindow(windowsRaw['12m']),
        '5y': parseMomentumFieldRelativeWindow(windowsRaw['5y']),
      },
    },
    signalNoise: parseMomentumPlaceholderContextModule(contextModules.signal_noise),
    contributionBalance: parseMomentumPlaceholderContextModule(contextModules.contribution_balance),
    publicationTypeContext: parseMomentumPlaceholderContextModule(contextModules.publication_type_context),
    ageAdjustedPerformance: parseMomentumPlaceholderContextModule(contextModules.age_adjusted_performance),
    topicMomentumAlignment: parseMomentumPlaceholderContextModule(contextModules.topic_momentum_alignment),
    eventDrivers: parseMomentumPlaceholderContextModule(contextModules.event_drivers),
    collaborationContext: parseMomentumPlaceholderContextModule(contextModules.collaboration_context),
  }
}

export function isEnhancedGenericMetricKey(key: string): key is EnhancedGenericMetricKey {
  return ENHANCED_GENERIC_METRIC_KEYS.includes(key as EnhancedGenericMetricKey)
}

export function buildMomentumDrilldownStats(tile: PublicationMetricTilePayload): MomentumDrilldownStats {
  const chartData = (tile.chart_data || {}) as Record<string, unknown>
  const drilldown = (tile.drilldown || {}) as Record<string, unknown>
  const metadata = (drilldown.metadata || {}) as Record<string, unknown>
  const intermediate = (metadata.intermediate_values || {}) as Record<string, unknown>
  const publications = parsePublications(tile)
  const confidenceCounts = new Map<string, number>()
  for (const publication of publications) {
    const key = publication.confidenceLabel || 'Not labelled'
    confidenceCounts.set(key, (confidenceCounts.get(key) || 0) + 1)
  }
  return {
    momentumIndex: parseMetricNumber(intermediate.momentum_index) ?? parseMetricNumber(tile.value) ?? 0,
    state: String(tile.subtext || (tile.badge as Record<string, unknown> | undefined)?.label || '').trim() || 'Stable',
    recentScore12m: parseMetricNumber(intermediate.momentum_score_last_12m),
    previousScore12m: parseMetricNumber(intermediate.momentum_score_prev_12m),
    delta: parseMetricNumber(tile.delta_value),
    monthlyValues12m: toNumberArray(chartData.monthly_values_12m).map((value) => Math.max(0, value)),
    weightedMonthlyValues12m: toNumberArray(metadata.weighted_monthly_values_12m).map((value) => Math.max(0, value)),
    trackedPapers: publications.length,
    publications: publications.map((publication) => ({
      workId: publication.workId,
      title: publication.title,
      venue: publication.venue,
      year: publication.year,
      publicationMonthStart: publication.publicationMonthStart,
      recent3mCitations: publication.recent3mCitations,
      prior9mCitations: publication.prior9mCitations,
      recent1yCitations: publication.recent1yCitations,
      prior4yCitations: publication.prior4yCitations,
      citationsLast12m: publication.citationsLast12m,
      citationsPrev12m: publication.citationsPrev12m,
      momentumContribution: publication.momentumContribution,
      recent3mAvg: publication.recent3mAvg,
      prior9mAvg: publication.prior9mAvg,
      shiftDelta: publication.shiftDelta,
      confidenceLabel: publication.confidenceLabel,
    })),
    topContributors: publications
      .filter((publication) =>
        publication.momentumContribution > 0
        || publication.citationsLast12m > 0
        || publication.recent1yCitations > 0
        || publication.prior4yCitations !== null
        || publication.prior9mCitations > 0
        || Math.abs(publication.shiftDelta ?? 0) > 1e-6,
      )
      .sort((left, right) => {
        const shiftDifference = Math.abs(right.shiftDelta ?? 0) - Math.abs(left.shiftDelta ?? 0)
        if (Math.abs(shiftDifference) > 1e-6) {
          return shiftDifference
        }
        if (right.momentumContribution !== left.momentumContribution) {
          return right.momentumContribution - left.momentumContribution
        }
        return right.citationsLast12m - left.citationsLast12m
      })
      .map((publication) => ({
        workId: publication.workId,
        title: publication.title,
        venue: publication.venue,
        year: publication.year,
        publicationMonthStart: publication.publicationMonthStart,
        recent3mCitations: publication.recent3mCitations,
        prior9mCitations: publication.prior9mCitations,
        recent1yCitations: publication.recent1yCitations,
        prior4yCitations: publication.prior4yCitations,
        citationsLast12m: publication.citationsLast12m,
        citationsPrev12m: publication.citationsPrev12m,
        momentumContribution: publication.momentumContribution,
        recent3mAvg: publication.recent3mAvg,
        prior9mAvg: publication.prior9mAvg,
        shiftDelta: publication.shiftDelta,
        confidenceLabel: publication.confidenceLabel,
      })),
    confidenceBuckets: Array.from(confidenceCounts.entries())
      .sort((left, right) => right[1] - left[1])
      .map(([label, count]) => ({ label, count })),
    contextModules: parseMomentumContextModules(tile),
  }
}

export function buildImpactConcentrationDrilldownStats(tile: PublicationMetricTilePayload): ImpactConcentrationDrilldownStats {
  const chartData = (tile.chart_data || {}) as Record<string, unknown>
  const drilldown = (tile.drilldown || {}) as Record<string, unknown>
  const metadata = (drilldown.metadata || {}) as Record<string, unknown>
  const intermediate = (metadata.intermediate_values || {}) as Record<string, unknown>
  const publications = parsePublications(tile)
  const values = toNumberArray(chartData.values).map((value) => Math.max(0, value))
  const top3Citations = Math.max(0, Math.round(parseMetricNumber(intermediate.top3_citations) ?? values[0] ?? 0))
  const totalCitations = Math.max(
    0,
    Math.round(parseMetricNumber(intermediate.total_citations) ?? top3Citations + (values[1] || 0)),
  )
  const restCitations = Math.max(0, totalCitations - top3Citations)
  const totalPublications = Math.max(0, Math.round(parseMetricNumber(intermediate.total_publications) ?? publications.length))
  const topPapers = publications
    .slice()
    .sort((left, right) => right.citations - left.citations)
    .slice(0, 10)
    .map((publication) => ({
      workId: publication.workId,
      title: publication.title,
      year: publication.year,
      citations: publication.citations,
      shareOfTotalPct: publication.shareOfTotalPct || (totalCitations > 0 ? (publication.citations / totalCitations) * 100 : 0),
      publicationType: publication.publicationType,
    }))
  return {
    concentrationPct: Math.max(0, parseMetricNumber(intermediate.concentration_pct) ?? parseMetricNumber(tile.value) ?? 0),
    classification: toMetricText(intermediate.classification || tile.subtext, 'Unclassified'),
    giniCoefficient: parseMetricNumber(intermediate.gini_coefficient ?? chartData.gini_coefficient),
    top3Citations,
    restCitations,
    totalCitations,
    topPapersCount: Math.max(0, Math.round(parseMetricNumber(intermediate.top_papers_count ?? chartData.top_papers_count) ?? 3)),
    remainingPapersCount: Math.max(
      0,
      Math.round(parseMetricNumber(intermediate.remaining_papers_count ?? chartData.remaining_papers_count) ?? Math.max(0, totalPublications - 3)),
    ),
    totalPublications,
    uncitedPublicationsCount: Math.max(
      0,
      Math.round(parseMetricNumber(intermediate.uncited_publications_count ?? chartData.uncited_publications_count) ?? 0),
    ),
    uncitedPublicationsPct: Math.max(
      0,
      parseMetricNumber(intermediate.uncited_publications_pct ?? chartData.uncited_publications_pct) ?? 0,
    ),
    topPapers,
  }
}

export function buildInfluentialCitationsDrilldownStats(tile: PublicationMetricTilePayload): InfluentialCitationsDrilldownStats {
  const chartData = (tile.chart_data || {}) as Record<string, unknown>
  const drilldown = (tile.drilldown || {}) as Record<string, unknown>
  const metadata = (drilldown.metadata || {}) as Record<string, unknown>
  const intermediate = (metadata.intermediate_values || {}) as Record<string, unknown>
  const yearlyValues = (metadata.influential_yearly_values || {}) as Record<string, unknown>
  const labels = Array.isArray(chartData.labels)
    ? chartData.labels.map((item) => String(item || '').trim()).filter(Boolean)
    : []
  const years = toNumberArray(chartData.years).map((value) => Math.round(value))
  const values = toNumberArray(chartData.values).map((value) => Math.max(0, value))
  const fallbackYears = Array.isArray(yearlyValues.years)
    ? yearlyValues.years.map((item) => Math.round(Number(item))).filter((item) => Number.isInteger(item))
    : []
  const fallbackValues = toNumberArray(yearlyValues.values).map((value) => Math.max(0, value))
  const pairCount = Math.min(years.length || fallbackYears.length, values.length || fallbackValues.length)
  const publications = parsePublications(tile)
  return {
    totalInfluentialCitations: Math.max(0, Math.round(parseMetricNumber(intermediate.influence_total) ?? parseMetricNumber(tile.value) ?? 0)),
    influentialRatioPct: Math.max(0, parseMetricNumber(intermediate.influential_ratio_pct ?? chartData.influential_ratio_pct) ?? 0),
    influenceLast12m: Math.max(0, Math.round(parseMetricNumber(intermediate.influence_last_12m) ?? 0)),
    influencePrev12m: Math.max(0, Math.round(parseMetricNumber(intermediate.influence_prev_12m) ?? 0)),
    influenceDelta: parseMetricNumber(intermediate.influence_delta) ?? 0,
    unknownYearInfluentialCitations: Math.max(0, Math.round(parseMetricNumber(intermediate.unknown_year_influential_citations) ?? 0)),
    yearlySeries: Array.from({ length: pairCount }, (_, index) => ({
      label: labels[index] || String(years[index] || fallbackYears[index] || `Point ${index + 1}`),
      value: Math.max(0, Math.round(values[index] ?? fallbackValues[index] ?? 0)),
    })),
    topPublications: publications
      .filter((publication) => publication.influentialCitations > 0 || publication.influentialLast12m > 0)
      .sort((left, right) => {
        if (right.influentialCitations !== left.influentialCitations) {
          return right.influentialCitations - left.influentialCitations
        }
        return right.influentialLast12m - left.influentialLast12m
      })
      .slice(0, 8)
      .map((publication) => ({
        workId: publication.workId,
        title: publication.title,
        venue: publication.venue,
        lifetimeCitations: publication.citations,
        influentialCitations: publication.influentialCitations,
        influentialLast12m: publication.influentialLast12m,
      })),
  }
}

export function buildFieldPercentileShareDrilldownStats(tile: PublicationMetricTilePayload): FieldPercentileShareDrilldownStats {
  const chartData = (tile.chart_data || {}) as Record<string, unknown>
  const drilldown = (tile.drilldown || {}) as Record<string, unknown>
  const metadata = (drilldown.metadata || {}) as Record<string, unknown>
  const intermediate = (metadata.intermediate_values || {}) as Record<string, unknown>
  const thresholdsRaw = toNumberArray(intermediate.thresholds ?? chartData.thresholds)
    .map((value) => Math.round(value))
    .filter((value) => [50, 75, 90, 95, 99].includes(value))
  const thresholds = (thresholdsRaw.length ? thresholdsRaw : [50, 75, 90, 95, 99]) as FieldPercentileThreshold[]
  const defaultThresholdRaw = Math.round(
    parseMetricNumber(intermediate.default_threshold ?? chartData.default_threshold) ?? thresholds[0],
  )
  const defaultThreshold = thresholds.includes(defaultThresholdRaw as FieldPercentileThreshold)
    ? defaultThresholdRaw as FieldPercentileThreshold
    : thresholds[0]
  const shareMap = parseNumericKeyedMap(intermediate.share_by_threshold_pct ?? chartData.share_by_threshold_pct)
  const countMap = parseNumericKeyedMap(intermediate.count_by_threshold ?? chartData.count_by_threshold)
  const publications = parsePublications(tile)
  const fieldStats = new Map<string, { count: number; ranks: number[] }>()
  for (const publication of publications) {
    const entry = fieldStats.get(publication.fieldName) || { count: 0, ranks: [] }
    entry.count += 1
    if (publication.fieldPercentileRank !== null) {
      entry.ranks.push(publication.fieldPercentileRank)
    }
    fieldStats.set(publication.fieldName, entry)
  }
  return {
    thresholds,
    defaultThreshold,
    thresholdRows: thresholds.map((threshold) => ({
      threshold,
      paperCount: Math.max(0, Math.round(countMap[threshold] || 0)),
      sharePct: Math.max(0, shareMap[threshold] || 0),
    })),
    evaluatedPapers: Math.max(0, Math.round(parseMetricNumber(intermediate.evaluated_papers ?? chartData.evaluated_papers) ?? 0)),
    totalPapers: Math.max(0, Math.round(parseMetricNumber(intermediate.total_papers ?? chartData.total_papers) ?? publications.length)),
    coveragePct: Math.max(0, parseMetricNumber(intermediate.coverage_pct ?? chartData.coverage_pct) ?? 0),
    medianPercentileRank: parseMetricNumber(intermediate.median_percentile_rank ?? chartData.median_percentile_rank),
    cohortCount: parseMetricNumber(intermediate.cohort_count ?? chartData.cohort_count),
    cohortMedianSampleSize: parseMetricNumber(intermediate.cohort_median_sample_size ?? chartData.cohort_median_sample_size),
    topPublications: publications
      .filter((publication) => publication.fieldPercentileRank !== null)
      .sort((left, right) => (right.fieldPercentileRank || 0) - (left.fieldPercentileRank || 0))
      .slice(0, 8)
      .map((publication) => ({
        workId: publication.workId,
        title: publication.title,
        fieldName: publication.fieldName,
        fieldPercentileRank: publication.fieldPercentileRank,
        cohortYear: publication.cohortYear,
        cohortSampleSize: publication.cohortSampleSize,
      })),
    topFields: Array.from(fieldStats.entries())
      .sort((left, right) => right[1].count - left[1].count)
      .slice(0, 6)
      .map(([fieldName, stats]) => ({
        fieldName,
        paperCount: stats.count,
        medianPercentileRank: stats.ranks.length
          ? [...stats.ranks].sort((left, right) => left - right)[Math.floor(stats.ranks.length / 2)]
          : null,
      })),
  }
}

export function buildAuthorshipCompositionDrilldownStats(tile: PublicationMetricTilePayload): AuthorshipCompositionDrilldownStats {
  const chartData = (tile.chart_data || {}) as Record<string, unknown>
  const publications = parsePublications(tile)
  const firstAuthorshipCount = Math.max(0, Math.round(parseMetricNumber(chartData.first_authorship_count) ?? 0))
  const secondAuthorshipCount = Math.max(0, Math.round(parseMetricNumber(chartData.second_authorship_count) ?? 0))
  const seniorAuthorshipCount = Math.max(0, Math.round(parseMetricNumber(chartData.senior_authorship_count) ?? 0))
  const leadershipCount = Math.max(0, Math.round(parseMetricNumber(chartData.leadership_count) ?? (firstAuthorshipCount + seniorAuthorshipCount)))
  const totalPapers = Math.max(0, Math.round(parseMetricNumber(chartData.total_papers) ?? publications.length))
  return {
    firstAuthorshipPct: Math.max(0, parseMetricNumber(chartData.first_authorship_pct) ?? 0),
    secondAuthorshipPct: Math.max(0, parseMetricNumber(chartData.second_authorship_pct) ?? 0),
    seniorAuthorshipPct: Math.max(0, parseMetricNumber(chartData.senior_authorship_pct) ?? 0),
    leadershipIndexPct: Math.max(0, parseMetricNumber(chartData.leadership_index_pct) ?? 0),
    medianAuthorPositionDisplay: toMetricText(chartData.median_author_position_display || chartData.median_author_position),
    firstAuthorshipCount,
    secondAuthorshipCount,
    seniorAuthorshipCount,
    leadershipCount,
    knownRoleCount: Math.max(0, Math.round(parseMetricNumber(chartData.known_role_count) ?? totalPapers)),
    unknownRoleCount: Math.max(0, Math.round(parseMetricNumber(chartData.unknown_role_count) ?? 0)),
    knownPositionCount: Math.max(0, Math.round(parseMetricNumber(chartData.known_position_count) ?? 0)),
    totalPapers,
    roleRows: [
      {
        key: 'first',
        label: 'First authorship',
        count: firstAuthorshipCount,
        sharePct: totalPapers > 0 ? (firstAuthorshipCount / totalPapers) * 100 : 0,
      },
      {
        key: 'second',
        label: 'Second authorship',
        count: secondAuthorshipCount,
        sharePct: totalPapers > 0 ? (secondAuthorshipCount / totalPapers) * 100 : 0,
      },
      {
        key: 'senior',
        label: 'Senior authorship',
        count: seniorAuthorshipCount,
        sharePct: totalPapers > 0 ? (seniorAuthorshipCount / totalPapers) * 100 : 0,
      },
      {
        key: 'leadership',
        label: 'Leadership share',
        count: leadershipCount,
        sharePct: totalPapers > 0 ? (leadershipCount / totalPapers) * 100 : 0,
      },
    ],
    topLeadershipPapers: publications
      .filter((publication) => publication.role === 'First author' || publication.role === 'Senior author')
      .sort((left, right) => right.citations - left.citations)
      .slice(0, 8)
      .map((publication) => ({
        workId: publication.workId,
        title: publication.title,
        year: publication.year,
        role: publication.role,
        citations: publication.citations,
        publicationType: publication.publicationType,
      })),
  }
}

export function buildCollaborationStructureDrilldownStats(tile: PublicationMetricTilePayload): CollaborationStructureDrilldownStats {
  const chartData = (tile.chart_data || {}) as Record<string, unknown>
  const publications = parsePublications(tile)
  return {
    uniqueCollaborators: Math.max(0, Math.round(parseMetricNumber(chartData.unique_collaborators) ?? 0)),
    repeatCollaboratorRatePct: Math.max(0, parseMetricNumber(chartData.repeat_collaborator_rate_pct) ?? 0),
    repeatCollaborators: Math.max(0, Math.round(parseMetricNumber(chartData.repeat_collaborators) ?? 0)),
    institutions: Math.max(0, Math.round(parseMetricNumber(chartData.institutions) ?? 0)),
    countries: Math.max(0, Math.round(parseMetricNumber(chartData.countries) ?? 0)),
    continents: Math.max(0, Math.round(parseMetricNumber(chartData.continents) ?? 0)),
    collaborativeWorks: Math.max(0, Math.round(parseMetricNumber(chartData.collaborative_works) ?? publications.length)),
    institutionsFromWorks: Math.max(0, Math.round(parseMetricNumber(chartData.institutions_from_works) ?? 0)),
    countriesFromWorks: Math.max(0, Math.round(parseMetricNumber(chartData.countries_from_works) ?? 0)),
    institutionsFromCollaborators: Math.max(0, Math.round(parseMetricNumber(chartData.institutions_from_collaborators) ?? 0)),
    countriesFromCollaborators: Math.max(0, Math.round(parseMetricNumber(chartData.countries_from_collaborators) ?? 0)),
    topCollaborativeWorks: publications
      .filter((publication) => publication.collaboratorsInWork > 0)
      .sort((left, right) => {
        if (right.collaboratorsInWork !== left.collaboratorsInWork) {
          return right.collaboratorsInWork - left.collaboratorsInWork
        }
        return right.repeatCollaboratorsInWork - left.repeatCollaboratorsInWork
      })
      .slice(0, 8)
      .map((publication) => ({
        workId: publication.workId,
        title: publication.title,
        year: publication.year,
        collaboratorsInWork: publication.collaboratorsInWork,
        repeatCollaboratorsInWork: publication.repeatCollaboratorsInWork,
        institutionsInWork: publication.institutionsInWork,
        countriesInWork: publication.countriesInWork,
        citations: publication.citations,
      })),
  }
}

export function buildRemainingMetricMethodsSections(tile: PublicationMetricTilePayload): RemainingMetricMethodsSection[] {
  const common = collectCommonMethodsMeta(tile)
  switch (tile.key) {
    case 'momentum': {
      const stats = buildMomentumDrilldownStats(tile)
      const relativePaceLabel = formatMomentumRelativePaceLabel(stats)
      const fieldRelativeContext = stats.contextModules.fieldRelativeMomentum
      const defaultContextWindow = fieldRelativeContext.windows['12m']
      return [
        {
          key: 'summary',
          title: 'Summary',
          description: 'How the recent-vs-prior citation pace headline and current state are calculated.',
          facts: [
            { label: 'Definition', value: toMetricText(common.methods.definition || common.drilldown.definition) },
            { label: 'Formula', value: toMetricText(common.methods.formula || common.drilldown.formula) },
            { label: 'Current pace change', value: relativePaceLabel },
            { label: 'State', value: stats.state },
            { label: 'Sources', value: common.sourcesLabel },
          ],
          bullets: [
            'Momentum compares recent citation pace against the immediately preceding baseline rather than lifetime totals.',
            'The tile treats the latest 3 months as the active signal and the prior 9 months as the baseline reference window.',
            `The current drilldown is built from ${formatInt(stats.trackedPapers)} publications with matched citation history.`,
          ],
          note: common.confidenceNote || undefined,
        },
        {
          key: 'breakdown',
          title: 'Breakdown',
          description: 'How paper-level momentum contributors are ranked.',
          facts: [
            { label: 'Tracked papers', value: formatInt(stats.trackedPapers) },
            { label: 'Top contributors shown', value: formatInt(stats.topContributors.length) },
            { label: 'Confidence buckets', value: formatInt(stats.confidenceBuckets.length) },
            { label: 'Refresh cadence', value: common.refreshCadence },
          ],
          bullets: [
            'Contributor tables rank papers first by momentum contribution and then by the last-12-month citation count.',
            'Confidence labels come directly from the synced match/enrichment layer when available.',
            'A paper can contribute to momentum even when its lifetime citation total is modest, if the recent pace is strong.',
          ],
        },
        {
          key: 'trajectory',
          title: 'Trajectory',
          description: 'How the recent-vs-baseline momentum comparison is assembled.',
          facts: [
            { label: 'Monthly points', value: formatInt(stats.monthlyValues12m.length) },
            { label: 'Weighted points', value: formatInt(stats.weightedMonthlyValues12m.length) },
            { label: 'Current score', value: stats.recentScore12m === null ? 'Not available' : stats.recentScore12m.toFixed(1) },
            { label: 'Prior score', value: stats.previousScore12m === null ? 'Not available' : stats.previousScore12m.toFixed(1) },
          ],
          bullets: [
            'Trajectory compares the active 12-month signal against the preceding baseline score rather than plotting a lifetime curve.',
            'Weighted monthly values retain timing emphasis for recent citation activity when that series is available.',
            'Positive delta implies acceleration; negative delta implies relative cooling versus the prior window.',
          ],
        },
        {
          key: 'context',
          title: 'Context',
          description: 'How the field-relative benchmark context is assembled.',
          facts: [
            { label: 'Benchmark source', value: fieldRelativeContext.benchmarkSource },
            { label: 'Normalization', value: fieldRelativeContext.normalizationBasis },
            { label: '12m coverage', value: `${Math.round(defaultContextWindow.coveragePct)}%` },
            { label: 'Sources', value: common.sourcesLabel },
          ],
          bullets: [
            'Field-relative momentum compares your pace change with OpenAlex cohorts matched by primary field and publication year.',
            'Coverage and cohort count determine how representative the weighted field baseline is for mixed portfolios.',
            'Percentile only appears when benchmark coverage and cohort size pass the stricter quality gate.',
          ],
        },
      ]
    }
    case 'impact_concentration': {
      const stats = buildImpactConcentrationDrilldownStats(tile)
      return [
        {
          key: 'summary',
          title: 'Summary',
          description: 'How the top-3 concentration headline is calculated.',
          facts: [
            { label: 'Definition', value: toMetricText(common.methods.definition || common.drilldown.definition) },
            { label: 'Formula', value: toMetricText(common.methods.formula || common.drilldown.formula) },
            { label: 'Top 3 share', value: `${Math.round(stats.concentrationPct)}%` },
            { label: 'Classification', value: stats.classification },
            { label: 'Sources', value: common.sourcesLabel },
          ],
          bullets: [
            'The metric asks how much of the total citation portfolio is concentrated in the three most cited papers.',
            'A higher value means a smaller subset of papers carries more of the lifetime citation load.',
            'The drilldown pairs concentration with uncited-paper share and Gini-style dispersion context.',
          ],
          note: common.confidenceNote || undefined,
        },
        {
          key: 'breakdown',
          title: 'Breakdown',
          description: 'How the top cited papers and the long tail are separated.',
          facts: [
            { label: 'Top papers tracked', value: formatInt(stats.topPapersCount) },
            { label: 'Remaining papers', value: formatInt(stats.remainingPapersCount) },
            { label: 'Top papers shown', value: formatInt(stats.topPapers.length) },
            { label: 'Uncited papers', value: formatInt(stats.uncitedPublicationsCount) },
          ],
          bullets: [
            'Top-paper tables are ordered by lifetime citation total and show each paper’s share of the total citation portfolio.',
            'The long tail is everything outside the top 3 and is reported as an aggregate rather than a full ranked list.',
            'Uncited papers remain important context because they increase dispersion without contributing to the numerator.',
          ],
        },
        {
          key: 'trajectory',
          title: 'Trajectory',
          description: 'Why concentration is a structural snapshot rather than a rolling time series.',
          facts: [
            { label: 'Time-series support', value: 'Snapshot only' },
            { label: 'Total citations', value: formatInt(stats.totalCitations) },
            { label: 'Top 3 citations', value: formatInt(stats.top3Citations) },
            { label: 'Rest citations', value: formatInt(stats.restCitations) },
          ],
          bullets: [
            'The canonical payload currently ships concentration as a structural snapshot, not as a year-by-year historical series.',
            'Trajectory interpretation therefore focuses on how much of the current portfolio is carried by the top set versus the long tail.',
            'If historical concentration series are added later, they should live here without changing the summary definition.',
          ],
        },
        {
          key: 'context',
          title: 'Context',
          description: 'How dispersion and uncited-share context should be read alongside the headline concentration value.',
          facts: [
            { label: 'Gini coefficient', value: stats.giniCoefficient === null ? 'Not available' : stats.giniCoefficient.toFixed(2) },
            { label: 'Uncited share', value: `${Math.round(stats.uncitedPublicationsPct)}%` },
            { label: 'Last updated', value: common.lastUpdated },
            { label: 'Sources', value: common.sourcesLabel },
          ],
          bullets: [
            'The concentration percentage is intuitive, while the Gini coefficient gives a second dispersion lens on the same portfolio.',
            'Uncited share is complementary context because it captures the inactive tail of the publication set.',
            'Classification labels are descriptive, not externally benchmarked risk grades.',
          ],
        },
      ]
    }
    case 'influential_citations': {
      const stats = buildInfluentialCitationsDrilldownStats(tile)
      return [
        {
          key: 'summary',
          title: 'Summary',
          description: 'How influential citations are counted and summarised.',
          facts: [
            { label: 'Definition', value: toMetricText(common.methods.definition || common.drilldown.definition) },
            { label: 'Formula', value: toMetricText(common.methods.formula || common.drilldown.formula) },
            { label: 'Influential citations', value: formatInt(stats.totalInfluentialCitations) },
            { label: 'Influential ratio', value: `${Math.round(stats.influentialRatioPct)}%` },
            { label: 'Sources', value: common.sourcesLabel },
          ],
          bullets: [
            'Influential citations come from provider-defined enrichment rather than raw OpenAlex citation counts alone.',
            'The ratio contextualises influential citations against the broader citation footprint.',
            'The summary keeps lifetime influential volume separate from recent-window changes shown in Trajectory.',
          ],
          note: common.confidenceNote || undefined,
        },
        {
          key: 'breakdown',
          title: 'Breakdown',
          description: 'How paper-level influential citation contributions are ranked.',
          facts: [
            { label: 'Papers with influential cites', value: formatInt(stats.topPublications.length) },
            { label: 'Recent influential cites', value: formatInt(stats.influenceLast12m) },
            { label: 'Previous influential cites', value: formatInt(stats.influencePrev12m) },
            { label: 'Unknown-year influential cites', value: formatInt(stats.unknownYearInfluentialCitations) },
          ],
          bullets: [
            'Contributor tables rank papers by lifetime influential citations and then by recent influential activity.',
            'Recent influential citations help distinguish currently active papers from historically important ones.',
            'Unknown-year influential citations are included in totals but flagged separately because they cannot be placed cleanly on the time axis.',
          ],
        },
        {
          key: 'trajectory',
          title: 'Trajectory',
          description: 'How the influential-citation time series is assembled.',
          facts: [
            { label: 'Series points', value: formatInt(stats.yearlySeries.length) },
            { label: 'Last 12 months', value: formatInt(stats.influenceLast12m) },
            { label: 'Previous 12 months', value: formatInt(stats.influencePrev12m) },
            { label: 'Delta', value: `${stats.influenceDelta >= 0 ? '+' : ''}${Math.round(stats.influenceDelta)}` },
          ],
          bullets: [
            'Trajectory uses the provider-supplied yearly and recent-window influential-citation series.',
            'The 12-month delta is operationally more useful than the lifetime total when assessing whether influence is accelerating.',
            'Where year assignment is incomplete, the unknown-year total is carried as context rather than forced into the plotted history.',
          ],
        },
        {
          key: 'context',
          title: 'Context',
          description: 'How to interpret influential-citation coverage and availability.',
          facts: [
            { label: 'Availability', value: stats.totalInfluentialCitations > 0 || stats.topPublications.length > 0 ? 'Available' : 'Limited' },
            { label: 'Tile stability', value: toTitleCaseLabel(tile.stability, 'Stable') },
            { label: 'Last updated', value: common.lastUpdated },
            { label: 'Sources', value: common.sourcesLabel },
          ],
          bullets: [
            'Influential-citation availability depends on enrichment coverage rather than the presence of raw citations alone.',
            'A modest influential ratio can still reflect strong paper-level influence if only a subset of publications has provider coverage.',
            'Read this metric as a quality-of-impact lens, not as a replacement for total citations.',
          ],
        },
      ]
    }
    case 'field_percentile_share': {
      const stats = buildFieldPercentileShareDrilldownStats(tile)
      return [
        {
          key: 'summary',
          title: 'Summary',
          description: 'How field-percentile share is benchmarked at the default threshold.',
          facts: [
            { label: 'Definition', value: toMetricText(common.methods.definition || common.drilldown.definition) },
            { label: 'Formula', value: toMetricText(common.methods.formula || common.drilldown.formula) },
            { label: 'Default threshold', value: `${stats.defaultThreshold}%` },
            { label: 'Evaluated papers', value: formatInt(stats.evaluatedPapers) },
            { label: 'Sources', value: common.sourcesLabel },
          ],
          bullets: [
            'This metric benchmarks papers only where a field-and-year cohort match exists.',
            'Threshold shares describe the fraction of benchmarked papers at or above each citation percentile cut-off.',
            'Coverage matters: low coverage means the benchmarked subset may not fully represent the whole portfolio.',
          ],
          note: common.confidenceNote || undefined,
        },
        {
          key: 'breakdown',
          title: 'Breakdown',
          description: 'How benchmarked fields and papers are represented in the drilldown.',
          facts: [
            { label: 'Thresholds shown', value: formatInt(stats.thresholds.length) },
            { label: 'Fields shown', value: formatInt(stats.topFields.length) },
            { label: 'Top papers shown', value: formatInt(stats.topPublications.length) },
            { label: 'Median percentile rank', value: stats.medianPercentileRank === null ? 'Not available' : `${Math.round(stats.medianPercentileRank)}` },
          ],
          bullets: [
            'Field-level tables group papers by their matched primary field to show where benchmarking coverage is concentrated.',
            'Top-paper tables surface the strongest benchmarked papers by percentile rank rather than by raw citation total.',
            'Different thresholds answer different questions, from broad upper-half presence to rare top-1% performance.',
          ],
        },
        {
          key: 'trajectory',
          title: 'Trajectory',
          description: 'Why threshold ladders are used here instead of a time trend.',
          facts: [
            { label: 'Time-series support', value: 'Threshold ladder' },
            { label: 'Coverage', value: `${Math.round(stats.coveragePct)}%` },
            { label: 'Cohort count', value: stats.cohortCount === null ? 'Not available' : formatInt(stats.cohortCount) },
            { label: 'Median cohort size', value: stats.cohortMedianSampleSize === null ? 'Not available' : formatInt(stats.cohortMedianSampleSize) },
          ],
          bullets: [
            'The canonical payload provides percentile thresholds as a ladder rather than a year-by-year benchmark history.',
            'Moving from 50% to 99% thresholds shows how performance behaves as the benchmark becomes more selective.',
            'If benchmark history by year is added later, this tab is the right place for that trajectory view.',
          ],
        },
        {
          key: 'context',
          title: 'Context',
          description: 'How benchmark coverage and cohort size affect interpretation.',
          facts: [
            { label: 'Total papers', value: formatInt(stats.totalPapers) },
            { label: 'Coverage', value: `${Math.round(stats.coveragePct)}%` },
            { label: 'Last updated', value: common.lastUpdated },
            { label: 'Sources', value: common.sourcesLabel },
          ],
          bullets: [
            'Coverage tells you how much of the portfolio can actually be benchmarked against field-year cohorts.',
            'Median percentile rank is a compact way to summarise the central position of benchmarked papers.',
            'Cohort sample size matters because percentile ranks are more stable in larger comparison groups.',
          ],
        },
      ]
    }
    case 'authorship_composition': {
      const stats = buildAuthorshipCompositionDrilldownStats(tile)
      return [
        {
          key: 'summary',
          title: 'Summary',
          description: 'How leadership share and authorship-position metrics are computed.',
          facts: [
            { label: 'Definition', value: toMetricText(common.methods.definition || common.drilldown.definition) },
            { label: 'Formula', value: toMetricText(common.methods.formula || common.drilldown.formula) },
            { label: 'Leadership index', value: `${Math.round(stats.leadershipIndexPct)}%` },
            { label: 'Median author position', value: stats.medianAuthorPositionDisplay },
            { label: 'Sources', value: common.sourcesLabel },
          ],
          bullets: [
            'Leadership index is a role-based share, typically driven by first and senior authored papers.',
            'Median author position summarises central placement across papers with known author-order metadata.',
            'The metric is descriptive of contribution position and should be read alongside total output and citation context.',
          ],
          note: common.confidenceNote || undefined,
        },
        {
          key: 'breakdown',
          title: 'Breakdown',
          description: 'How authorship roles and leading papers are represented.',
          facts: [
            { label: 'Total papers', value: formatInt(stats.totalPapers) },
            { label: 'Known roles', value: formatInt(stats.knownRoleCount) },
            { label: 'Leadership papers', value: formatInt(stats.leadershipCount) },
            { label: 'Leadership papers shown', value: formatInt(stats.topLeadershipPapers.length) },
          ],
          bullets: [
            'Role counts show the mix of first, second, and senior authorship across the portfolio.',
            'Leadership-paper tables focus on first and senior authored papers, then rank them by citation depth.',
            'Unknown roles are excluded from the role-specific shares but retained in the total-paper denominator context.',
          ],
        },
        {
          key: 'trajectory',
          title: 'Trajectory',
          description: 'Why authorship composition is presented as a structural snapshot.',
          facts: [
            { label: 'Time-series support', value: 'Snapshot only' },
            { label: 'First authorship', value: `${Math.round(stats.firstAuthorshipPct)}%` },
            { label: 'Senior authorship', value: `${Math.round(stats.seniorAuthorshipPct)}%` },
            { label: 'Second authorship', value: `${Math.round(stats.secondAuthorshipPct)}%` },
          ],
          bullets: [
            'The canonical payload captures the current role mix, not a year-by-year authorship trend.',
            'Trajectory interpretation therefore centres on whether the current portfolio leans toward leadership or supporting roles.',
            'If role-by-year history is added later, it belongs here without changing the headline definition.',
          ],
        },
        {
          key: 'context',
          title: 'Context',
          description: 'How metadata coverage affects interpretation of authorship mix.',
          facts: [
            { label: 'Unknown roles', value: formatInt(stats.unknownRoleCount) },
            { label: 'Known positions', value: formatInt(stats.knownPositionCount) },
            { label: 'Last updated', value: common.lastUpdated },
            { label: 'Sources', value: common.sourcesLabel },
          ],
          bullets: [
            'Authorship mix is only as complete as the available role and author-order metadata.',
            'Median position is most trustworthy when known-position coverage is high.',
            'Leadership share is useful for role context, but not a substitute for quality or influence measures.',
          ],
        },
      ]
    }
    case 'collaboration_structure': {
      const stats = buildCollaborationStructureDrilldownStats(tile)
      return [
        {
          key: 'summary',
          title: 'Summary',
          description: 'How network breadth and recurrence are calculated.',
          facts: [
            { label: 'Definition', value: toMetricText(common.methods.definition || common.drilldown.definition) },
            { label: 'Formula', value: toMetricText(common.methods.formula || common.drilldown.formula) },
            { label: 'Unique collaborators', value: formatInt(stats.uniqueCollaborators) },
            { label: 'Repeat collaborator rate', value: `${Math.round(stats.repeatCollaboratorRatePct)}%` },
            { label: 'Sources', value: common.sourcesLabel },
          ],
          bullets: [
            'This metric focuses on network breadth, repeat collaboration, and affiliation diversity across collaborative works.',
            'Repeat collaborator rate captures how much of the network represents recurring working relationships.',
            'Institution and country totals combine available work-level and collaborator-level affiliation coverage.',
          ],
          note: common.confidenceNote || undefined,
        },
        {
          key: 'breakdown',
          title: 'Breakdown',
          description: 'How collaborative works and network breadth signals are represented.',
          facts: [
            { label: 'Collaborative works', value: formatInt(stats.collaborativeWorks) },
            { label: 'Repeat collaborators', value: formatInt(stats.repeatCollaborators) },
            { label: 'Institutions', value: formatInt(stats.institutions) },
            { label: 'Countries', value: formatInt(stats.countries) },
          ],
          bullets: [
            'Work-level tables rank publications by collaborator count and then by repeat-collaborator depth.',
            'A broad network can coexist with a high repeat rate if both new and recurring collaborations are strong.',
            'Institution and country breadth are descriptive of reach rather than a direct quality signal.',
          ],
        },
        {
          key: 'trajectory',
          title: 'Trajectory',
          description: 'Why collaboration structure is currently a portfolio snapshot.',
          facts: [
            { label: 'Time-series support', value: 'Snapshot only' },
            { label: 'Institutions from works', value: formatInt(stats.institutionsFromWorks) },
            { label: 'Countries from works', value: formatInt(stats.countriesFromWorks) },
            { label: 'Top works shown', value: formatInt(stats.topCollaborativeWorks.length) },
          ],
          bullets: [
            'The canonical payload currently reports collaboration structure as a snapshot rather than a longitudinal series.',
            'Trajectory interpretation therefore focuses on depth and recurrence inside the current collaborative portfolio.',
            'If collaborator-network history is added later, this tab is where it should be rendered.',
          ],
        },
        {
          key: 'context',
          title: 'Context',
          description: 'How work-derived and collaborator-derived affiliation coverage should be interpreted.',
          facts: [
            { label: 'Institutions from collaborators', value: formatInt(stats.institutionsFromCollaborators) },
            { label: 'Countries from collaborators', value: formatInt(stats.countriesFromCollaborators) },
            { label: 'Continents', value: formatInt(stats.continents) },
            { label: 'Last updated', value: common.lastUpdated },
          ],
          bullets: [
            'Work-derived affiliation breadth and collaborator-derived breadth can diverge if affiliation metadata is sparse on one side.',
            'Country and continent counts are descriptive coverage signals rather than benchmarking measures.',
            'Repeat collaborator rate is often more informative when read alongside unique collaborator breadth and collaborative-work count.',
          ],
        },
      ]
    }
    default:
      return []
  }
}
