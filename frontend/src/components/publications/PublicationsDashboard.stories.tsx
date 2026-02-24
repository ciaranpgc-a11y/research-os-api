import type { Meta, StoryObj } from '@storybook/react'

import type { PublicationMetricTilePayload, PublicationsTopMetricsPayload } from '@/types/impact'

import { PublicationsDashboard } from './PublicationsDashboard'

const FIXTURE_TIME = '2026-02-24T09:30:00Z'

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

function buildMetricsFixture(tiles: PublicationMetricTilePayload[]): PublicationsTopMetricsPayload {
  return {
    tiles,
    data_sources: ['OpenAlex', 'Crossref'],
    data_last_refreshed: FIXTURE_TIME,
    metadata: {},
    computed_at: FIXTURE_TIME,
    status: 'READY',
    is_stale: false,
    is_updating: false,
    last_error: null,
  }
}

const populatedTiles: PublicationMetricTilePayload[] = [
  buildTile({
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
  }),
  buildTile({
    id: 'tile-total-publications',
    key: 'this_year_vs_last',
    label: 'Total publications',
    value: 5,
    valueDisplay: '5 papers',
    deltaValue: 1,
    deltaDisplay: '+1 vs prior year',
    deltaDirection: 'up',
    deltaTone: 'positive',
    deltaColorCode: 'hsl(var(--tone-positive-700))',
    subtext: 'Current library year profile',
    chartType: 'bar_year_5',
    chartData: {
      years: [2021, 2022, 2023, 2024, 2025],
      values: [1, 1, 1, 1, 1],
      mean_value: 1,
      projected_year: 2026,
      current_year_ytd: 0,
    },
    sparkline: [1, 1, 1, 1, 1],
  }),
  buildTile({
    id: 'tile-citation-momentum',
    key: 'momentum',
    label: 'Momentum',
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
  }),
  buildTile({
    id: 'tile-h-index',
    key: 'h_index_projection',
    label: 'h-index',
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
  }),
  buildTile({
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
    badgeLabel: 'Diversified',
    badgeSeverity: 'neutral',
    chartType: 'donut',
    chartData: {
      values: [330, 153],
      uncited_publications_count: 1,
      uncited_publications_pct: 20,
      top_3_paper_shares_pct: [42, 17, 9],
    },
    sparkline: [62, 64, 65, 66, 68],
  }),
  buildTile({
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
    badgeLabel: 'Available',
    badgeSeverity: 'positive',
    chartType: 'line',
    chartData: {
      values: [24, 27, 30, 33, 37, 42],
      window_labels: ['Sep', 'Oct', 'Nov', 'Dec', 'Jan', 'Feb'],
    },
    sparkline: [24, 27, 30, 33, 37, 42],
    sparklineOverlay: [22, 24, 26, 28, 31, 34],
  }),
]

const emptyTiles: PublicationMetricTilePayload[] = [
  buildTile({
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
  }),
  buildTile({
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
  }),
  buildTile({
    id: 'tile-momentum-empty',
    key: 'momentum',
    label: 'Momentum',
    value: null,
    valueDisplay: '\u2014',
    deltaValue: null,
    deltaDisplay: null,
    deltaDirection: 'na',
    deltaTone: 'neutral',
    deltaColorCode: 'hsl(var(--tone-neutral-500))',
    subtext: 'Not enough citation history yet',
    chartType: 'gauge',
    chartData: { monthly_values_12m: [] },
    sparkline: [],
    badgeLabel: 'Unavailable',
    badgeSeverity: 'neutral',
  }),
  buildTile({
    id: 'tile-h-index-empty',
    key: 'h_index_projection',
    label: 'h-index',
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
  }),
  buildTile({
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
    chartType: 'donut',
    chartData: { values: [] },
    sparkline: [],
    badgeLabel: 'Unavailable',
    badgeSeverity: 'neutral',
  }),
  buildTile({
    id: 'tile-influential-empty',
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
    chartType: 'line',
    chartData: { values: [] },
    sparkline: [],
  }),
]

const meta: Meta<typeof PublicationsDashboard> = {
  title: 'Publications/PublicationsDashboard',
  component: PublicationsDashboard,
  parameters: {
    layout: 'padded',
  },
}

export default meta

type Story = StoryObj<typeof PublicationsDashboard>

export const Default: Story = {
  args: {
    title: 'Publications',
    metrics: buildMetricsFixture(populatedTiles),
    loading: false,
    token: null,
  },
}

export const Loading: Story = {
  args: {
    title: 'Publications',
    metrics: null,
    loading: true,
    token: null,
  },
}

export const Empty: Story = {
  args: {
    title: 'Publications',
    metrics: buildMetricsFixture(emptyTiles),
    loading: false,
    token: null,
  },
}

export const DefaultDark: Story = {
  args: {
    title: 'Publications',
    metrics: buildMetricsFixture(populatedTiles),
    loading: false,
    token: null,
  },
  globals: {
    theme: 'dark',
  },
}
