import type { Meta, StoryObj } from '@storybook/react'

import type { PublicationMetricTilePayload, PublicationsTopMetricsPayload } from '@/types/impact'

import { PublicationsTopStrip } from './PublicationsTopStrip'

const FIXTURE_TIME = '2026-02-24T09:30:00Z'

function buildMetricsFixture(tiles: PublicationMetricTilePayload[]): PublicationsTopMetricsPayload {
  return {
    tiles,
    data_sources: ['OpenAlex'],
    data_last_refreshed: FIXTURE_TIME,
    metadata: {},
    computed_at: FIXTURE_TIME,
    status: 'READY',
    is_stale: false,
    is_updating: false,
    last_error: null,
  }
}

function buildTile(input: {
  id: string
  key: string
  label: string
  value: number | null
  valueDisplay: string
  deltaValue: number | null
  deltaDisplay: string | null
  deltaDirection: 'up' | 'down' | 'flat' | 'na'
  deltaTone: 'positive' | 'neutral' | 'caution' | 'negative'
  deltaColorCode: string
  chartType: string
  chartData: Record<string, unknown>
  sparkline: number[]
  sparklineOverlay?: number[]
  subtext?: string
  badgeLabel?: string
  badgeSeverity?: 'positive' | 'neutral' | 'caution' | 'negative'
}): PublicationMetricTilePayload {
  return {
    id: input.id,
    key: input.key,
    label: input.label,
    main_value: input.value,
    value: input.value,
    main_value_display: input.valueDisplay,
    value_display: input.valueDisplay,
    delta_value: input.deltaValue,
    delta_display: input.deltaDisplay,
    delta_direction: input.deltaDirection,
    delta_tone: input.deltaTone,
    delta_color_code: input.deltaColorCode,
    unit: null,
    subtext: input.subtext || '',
    badge: {
      label: input.badgeLabel || '',
      severity: input.badgeSeverity || 'neutral',
    },
    chart_type: input.chartType,
    chart_data: input.chartData,
    sparkline: input.sparkline,
    sparkline_overlay: input.sparklineOverlay || [],
    tooltip: `${input.label} fixture`,
    tooltip_details: {
      update_frequency: 'Daily',
      data_sources: ['OpenAlex'],
    },
    data_source: ['OpenAlex'],
    confidence_score: 0.9,
    stability: 'stable',
    drilldown: {
      title: input.label,
      definition: 'Fixture drilldown for Storybook rendering.',
      formula: 'Fixture only',
      confidence_note: 'No backend request required.',
      publications: [],
      metadata: {},
    },
  }
}

const totalCitationsTile = buildTile({
  id: 'tile-total-citations',
  key: 'total_citations',
  label: 'Total citations',
  value: 483,
  valueDisplay: '483',
  deltaValue: 29.8,
  deltaDisplay: '+29.8% vs prior window',
  deltaDirection: 'up',
  deltaTone: 'positive',
  deltaColorCode: 'hsl(var(--tone-positive-700))',
  subtext: '5-year citation trajectory',
  chartType: 'bar_year_5',
  chartData: {
    years: [2021, 2022, 2023, 2024, 2025],
    values: [64, 78, 121, 108, 112],
    monthly_values_12m: [8, 9, 10, 10, 9, 9, 10, 11, 12, 13, 11, 10],
    month_labels_12m: ['Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec', 'Jan', 'Feb'],
    mean_value: 96.6,
    projected_year: 2026,
    current_year_ytd: 58,
  },
  sparkline: [64, 78, 121, 108, 112],
})

const totalPublicationsTile = buildTile({
  id: 'tile-total-publications',
  key: 'this_year_vs_last',
  label: 'Total publications',
  value: 24,
  valueDisplay: '24',
  deltaValue: 1,
  deltaDisplay: null,
  deltaDirection: 'up',
  deltaTone: 'positive',
  deltaColorCode: 'hsl(var(--tone-positive-700))',
  subtext: 'Lifetime publications',
  chartType: 'bar_year_5',
  chartData: {
    years: [2021, 2022, 2023, 2024, 2025],
    values: [2, 6, 3, 8, 5],
    mean_value: 4.8,
    projected_year: 2026,
    current_year_ytd: 6,
  },
  sparkline: [2, 6, 3, 8, 5],
})

const totalPublicationsLowVolumeTile = buildTile({
  id: 'tile-total-publications-low-volume',
  key: 'this_year_vs_last',
  label: 'Total publications',
  value: 4,
  valueDisplay: '4',
  deltaValue: 0,
  deltaDisplay: 'Flat vs prior year',
  deltaDirection: 'flat',
  deltaTone: 'neutral',
  deltaColorCode: 'hsl(var(--tone-neutral-600))',
  subtext: 'Low-output profile with intermittent years',
  chartType: 'bar_year_5',
  chartData: {
    years: [2021, 2022, 2023, 2024, 2025],
    values: [0, 1, 0, 2, 1],
    mean_value: 0.8,
    projected_year: 2026,
    current_year_ytd: 1,
  },
  sparkline: [0, 1, 0, 2, 1],
})

const totalPublicationsHighVarianceTile = buildTile({
  id: 'tile-total-publications-high-variance',
  key: 'this_year_vs_last',
  label: 'Total publications',
  value: 131,
  valueDisplay: '131',
  deltaValue: -12,
  deltaDisplay: '-12 vs prior year',
  deltaDirection: 'down',
  deltaTone: 'caution',
  deltaColorCode: 'hsl(var(--tone-warning-700))',
  subtext: 'High-volume output with strong year-to-year swings',
  chartType: 'bar_year_5',
  chartData: {
    years: [2021, 2022, 2023, 2024, 2025],
    values: [12, 28, 16, 44, 31],
    mean_value: 26.2,
    projected_year: 2026,
    current_year_ytd: 19,
  },
  sparkline: [12, 28, 16, 44, 31],
})

const citationMomentumTile = buildTile({
  id: 'tile-citation-momentum',
  key: 'momentum',
  label: 'Citation momentum',
  value: 176,
  valueDisplay: 'Momentum 176',
  deltaValue: 76,
  deltaDisplay: '+76% vs prior window',
  deltaDirection: 'up',
  deltaTone: 'positive',
  deltaColorCode: 'hsl(var(--tone-positive-700))',
  subtext: '12m velocity versus prior 12m',
  badgeLabel: 'Accelerating',
  badgeSeverity: 'positive',
  chartType: 'gauge',
  chartData: {
    min: 0,
    max: 150,
    value: 176,
    monthly_values_12m: [90, 95, 98, 100, 102, 104, 106, 103, 102, 170, 176, 182],
    month_labels_12m: ['Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec', 'Jan', 'Feb'],
    highlight_last_n: 3,
  },
  sparkline: [90, 95, 98, 100, 102, 104, 106, 103, 102, 170, 176, 182],
})

const hIndexTile = buildTile({
  id: 'tile-h-index',
  key: 'h_index_projection',
  label: 'h-index trajectory',
  value: 19,
  valueDisplay: 'h 19',
  deltaValue: 1,
  deltaDisplay: '+1 vs prior year',
  deltaDirection: 'up',
  deltaTone: 'positive',
  deltaColorCode: 'hsl(var(--tone-positive-700))',
  subtext: 'Progress to next h-index threshold',
  chartType: 'progress_ring',
  chartData: {
    years: [2021, 2022, 2023, 2024, 2025],
    values: [13, 15, 17, 18, 19],
    projected_year: 2026,
    current_h_index: 19,
    next_h_index: 20,
    progress_to_next_pct: 74,
    candidate_gaps: [1, 2, 2],
  },
  sparkline: [13, 15, 17, 18, 19],
})

const impactConcentrationTile = buildTile({
  id: 'tile-impact-concentration',
  key: 'impact_concentration',
  label: 'Impact concentration',
  value: 68,
  valueDisplay: '68%',
  deltaValue: 0,
  deltaDisplay: 'Stable',
  deltaDirection: 'flat',
  deltaTone: 'neutral',
  deltaColorCode: 'hsl(var(--tone-neutral-600))',
  subtext: 'Share of citations in top papers',
  badgeLabel: 'Balanced',
  badgeSeverity: 'neutral',
  chartType: 'donut',
  chartData: {
    values: [330, 153],
    gini_coefficient: 0.51,
    gini_profile_label: 'Balanced',
    total_publications: 24,
    top_papers_count: 3,
    remaining_papers_count: 21,
    top_3_paper_shares_pct: [42, 17, 9],
  },
  sparkline: [62, 64, 65, 66, 68],
})

const influentialCitationsTile = buildTile({
  id: 'tile-influential-citations',
  key: 'influential_citations',
  label: 'Influential citations',
  value: 42,
  valueDisplay: '42',
  deltaValue: 8,
  deltaDisplay: '+8 vs prior window',
  deltaDirection: 'up',
  deltaTone: 'positive',
  deltaColorCode: 'hsl(var(--tone-positive-700))',
  subtext: 'Highly weighted citations trend',
  badgeLabel: 'Rising',
  badgeSeverity: 'positive',
  chartType: 'line',
  chartData: {
    values: [24, 27, 30, 33, 37, 42],
    window_labels: ['Sep', 'Oct', 'Nov', 'Dec', 'Jan', 'Feb'],
    influential_ratio_pct: 9,
  },
  sparkline: [24, 27, 30, 33, 37, 42],
  sparklineOverlay: [22, 24, 26, 28, 31, 34],
})

const fieldPercentileShareTile = buildTile({
  id: 'tile-field-percentile-share',
  key: 'field_percentile_share',
  label: 'Field percentile share',
  value: 42,
  valueDisplay: '42%',
  deltaValue: null,
  deltaDisplay: null,
  deltaDirection: 'na',
  deltaTone: 'neutral',
  deltaColorCode: 'hsl(var(--tone-neutral-600))',
  subtext: 'Papers benchmarked against field-year cohorts',
  badgeLabel: '',
  badgeSeverity: 'neutral',
  chartType: 'percentile_toggle',
  chartData: {
    thresholds: [50, 75, 90, 95, 99],
    default_threshold: 75,
    share_by_threshold_pct: {
      '50': 62.5,
      '75': 42.0,
      '90': 21.0,
      '95': 12.5,
      '99': 4.2,
    },
    count_by_threshold: {
      '50': 15,
      '75': 10,
      '90': 5,
      '95': 3,
      '99': 1,
    },
    evaluated_papers: 24,
    total_papers: 27,
    coverage_pct: 88.9,
    median_percentile_rank: 73.4,
  },
  sparkline: [62.5, 42, 21, 12.5, 4.2],
})

const authorshipCompositionTile = buildTile({
  id: 'tile-authorship-composition',
  key: 'authorship_composition',
  label: 'Authorship composition',
  value: 62,
  valueDisplay: '62%',
  deltaValue: null,
  deltaDisplay: null,
  deltaDirection: 'na',
  deltaTone: 'neutral',
  deltaColorCode: 'hsl(var(--tone-neutral-600))',
  subtext: 'Leadership index',
  badgeLabel: '',
  badgeSeverity: 'neutral',
  chartType: 'authorship_structure',
  chartData: {
    first_authorship_pct: 34,
    senior_authorship_pct: 28,
    leadership_index_pct: 62,
    median_author_position: 2,
    median_author_position_display: '2',
    first_authorship_count: 8,
    senior_authorship_count: 7,
    leadership_count: 15,
    known_role_count: 22,
    unknown_role_count: 2,
    known_position_count: 22,
    total_papers: 24,
  },
  sparkline: [34, 28, 62],
})

const totalCitationsEmptyTile = buildTile({
  id: 'tile-total-citations-empty',
  key: 'total_citations',
  label: 'Total citations',
  value: null,
  valueDisplay: '\u2014',
  deltaValue: null,
  deltaDisplay: null,
  deltaDirection: 'na',
  deltaTone: 'neutral',
  deltaColorCode: 'hsl(var(--tone-neutral-500))',
  subtext: 'No citation history yet',
  chartType: 'bar_year_5',
  chartData: { years: [], values: [], monthly_values_12m: [] },
  sparkline: [],
})

const totalPublicationsEmptyTile = buildTile({
  id: 'tile-total-publications-empty',
  key: 'this_year_vs_last',
  label: 'Total publications',
  value: null,
  valueDisplay: '\u2014',
  deltaValue: null,
  deltaDisplay: null,
  deltaDirection: 'na',
  deltaTone: 'neutral',
  deltaColorCode: 'hsl(var(--tone-neutral-500))',
  subtext: 'No publication timeline yet',
  chartType: 'bar_year_5',
  chartData: { years: [], values: [] },
  sparkline: [],
})

const citationMomentumEmptyTile = buildTile({
  id: 'tile-citation-momentum-empty',
  key: 'momentum',
  label: 'Citation momentum',
  value: null,
  valueDisplay: 'No data',
  deltaValue: null,
  deltaDisplay: null,
  deltaDirection: 'na',
  deltaTone: 'neutral',
  deltaColorCode: 'hsl(var(--tone-neutral-500))',
  subtext: 'Not enough citation history yet',
  badgeLabel: 'No data',
  badgeSeverity: 'neutral',
  chartType: 'gauge',
  chartData: { monthly_values_12m: [] },
  sparkline: [],
})

const hIndexEmptyTile = buildTile({
  id: 'tile-h-index-empty',
  key: 'h_index_projection',
  label: 'h-index trajectory',
  value: null,
  valueDisplay: '\u2014',
  deltaValue: null,
  deltaDisplay: null,
  deltaDirection: 'na',
  deltaTone: 'neutral',
  deltaColorCode: 'hsl(var(--tone-neutral-500))',
  subtext: 'No h-index projection yet',
  chartType: 'progress_ring',
  chartData: { years: [], values: [], progress_to_next_pct: 0 },
  sparkline: [],
})

const impactConcentrationEmptyTile = buildTile({
  id: 'tile-impact-concentration-empty',
  key: 'impact_concentration',
  label: 'Impact concentration',
  value: null,
  valueDisplay: '\u2014',
  deltaValue: null,
  deltaDisplay: null,
  deltaDirection: 'na',
  deltaTone: 'neutral',
  deltaColorCode: 'hsl(var(--tone-neutral-500))',
  subtext: 'No distribution data yet',
  badgeLabel: '',
  badgeSeverity: 'neutral',
  chartType: 'donut',
  chartData: { values: [] },
  sparkline: [],
})

const influentialCitationsEmptyTile = buildTile({
  id: 'tile-influential-citations-empty',
  key: 'influential_citations',
  label: 'Influential citations',
  value: null,
  valueDisplay: '\u2014',
  deltaValue: null,
  deltaDisplay: null,
  deltaDirection: 'na',
  deltaTone: 'neutral',
  deltaColorCode: 'hsl(var(--tone-neutral-500))',
  subtext: 'No influential trend yet',
  badgeLabel: 'Rising',
  badgeSeverity: 'positive',
  chartType: 'line',
  chartData: { values: [] },
  sparkline: [],
})

const fieldPercentileShareEmptyTile = buildTile({
  id: 'tile-field-percentile-share-empty',
  key: 'field_percentile_share',
  label: 'Field percentile share',
  value: null,
  valueDisplay: '\u2014',
  deltaValue: null,
  deltaDisplay: null,
  deltaDirection: 'na',
  deltaTone: 'neutral',
  deltaColorCode: 'hsl(var(--tone-neutral-500))',
  subtext: 'No field percentile benchmark data yet',
  badgeLabel: '',
  badgeSeverity: 'neutral',
  chartType: 'percentile_toggle',
  chartData: {
    thresholds: [50, 75, 90, 95, 99],
    default_threshold: 75,
    share_by_threshold_pct: {},
    count_by_threshold: {},
    evaluated_papers: 0,
    total_papers: 0,
    coverage_pct: 0,
  },
  sparkline: [],
})

const authorshipCompositionEmptyTile = buildTile({
  id: 'tile-authorship-composition-empty',
  key: 'authorship_composition',
  label: 'Authorship composition',
  value: null,
  valueDisplay: '\u2014',
  deltaValue: null,
  deltaDisplay: null,
  deltaDirection: 'na',
  deltaTone: 'neutral',
  deltaColorCode: 'hsl(var(--tone-neutral-500))',
  subtext: 'Leadership index',
  badgeLabel: '',
  badgeSeverity: 'neutral',
  chartType: 'authorship_structure',
  chartData: {
    first_authorship_pct: 0,
    senior_authorship_pct: 0,
    leadership_index_pct: 0,
    median_author_position_display: 'Not available',
    total_papers: 0,
  },
  sparkline: [],
})

const meta: Meta<typeof PublicationsTopStrip> = {
  title: 'Publications/Tiles',
  component: PublicationsTopStrip,
}

export default meta

type Story = StoryObj<typeof PublicationsTopStrip>

function singleTileArgs(tile: PublicationMetricTilePayload) {
  return {
    metrics: buildMetricsFixture([tile]),
    loading: false,
    token: null,
  }
}

const loadingArgs = {
  metrics: null,
  loading: true,
  token: null,
}

const overviewTiles = [
  totalCitationsTile,
  totalPublicationsTile,
  citationMomentumTile,
  hIndexTile,
  impactConcentrationTile,
  influentialCitationsTile,
  fieldPercentileShareTile,
  authorshipCompositionTile,
]

export const TilesOverview: Story = {
  args: {
    metrics: buildMetricsFixture(overviewTiles),
    loading: false,
    token: null,
  },
}

export const TilesOverviewDark: Story = {
  args: {
    metrics: buildMetricsFixture(overviewTiles),
    loading: false,
    token: null,
  },
  globals: {
    theme: 'dark',
  },
}

export const TotalCitationsDefault: Story = { args: singleTileArgs(totalCitationsTile) }
export const TotalCitationsNoData: Story = { args: singleTileArgs(totalCitationsEmptyTile) }
export const TotalCitationsLoading: Story = { args: loadingArgs }

export const TotalPublicationsDefault: Story = { args: singleTileArgs(totalPublicationsTile) }
export const TotalPublicationsLowVolume: Story = { args: singleTileArgs(totalPublicationsLowVolumeTile) }
export const TotalPublicationsHighVariance: Story = { args: singleTileArgs(totalPublicationsHighVarianceTile) }
export const TotalPublicationsNoData: Story = { args: singleTileArgs(totalPublicationsEmptyTile) }
export const TotalPublicationsLoading: Story = { args: loadingArgs }

export const CitationMomentumDefault: Story = { args: singleTileArgs(citationMomentumTile) }
export const CitationMomentumNoData: Story = { args: singleTileArgs(citationMomentumEmptyTile) }
export const CitationMomentumLoading: Story = { args: loadingArgs }

export const HIndexTrajectoryDefault: Story = { args: singleTileArgs(hIndexTile) }
export const HIndexTrajectoryNoData: Story = { args: singleTileArgs(hIndexEmptyTile) }
export const HIndexTrajectoryLoading: Story = { args: loadingArgs }

export const ImpactConcentrationDefault: Story = { args: singleTileArgs(impactConcentrationTile) }
export const ImpactConcentrationNoData: Story = { args: singleTileArgs(impactConcentrationEmptyTile) }
export const ImpactConcentrationLoading: Story = { args: loadingArgs }

export const InfluentialCitationsDefault: Story = { args: singleTileArgs(influentialCitationsTile) }
export const InfluentialCitationsNoData: Story = { args: singleTileArgs(influentialCitationsEmptyTile) }
export const InfluentialCitationsLoading: Story = { args: loadingArgs }

export const FieldPercentileShareDefault: Story = { args: singleTileArgs(fieldPercentileShareTile) }
export const FieldPercentileShareNoData: Story = { args: singleTileArgs(fieldPercentileShareEmptyTile) }
export const FieldPercentileShareLoading: Story = { args: loadingArgs }

export const AuthorshipCompositionDefault: Story = { args: singleTileArgs(authorshipCompositionTile) }
export const AuthorshipCompositionNoData: Story = { args: singleTileArgs(authorshipCompositionEmptyTile) }
export const AuthorshipCompositionLoading: Story = { args: loadingArgs }
