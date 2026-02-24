import type { Meta, StoryObj } from '@storybook/react'

import type { PublicationMetricTilePayload, PublicationsTopMetricsPayload } from '@/types/impact'

import { PublicationsTopStrip } from './PublicationsTopStrip'

const FIXTURE_TIME = '2026-02-24T09:30:00Z'

function buildMetricsFixture(tile: PublicationMetricTilePayload): PublicationsTopMetricsPayload {
  return {
    tiles: [tile],
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

function momentumTileFixture(input: {
  id: string
  value: number | null
  valueDisplay: string
  deltaValue: number | null
  deltaDisplay: string | null
  deltaDirection: 'up' | 'down' | 'flat' | 'na'
  deltaTone: 'positive' | 'neutral' | 'caution' | 'negative'
  deltaColorCode: string
  badgeLabel: string
  badgeSeverity: 'positive' | 'neutral' | 'caution' | 'negative'
  monthlyValues: number[]
  gaugeValue: number
  subtext?: string
}): PublicationMetricTilePayload {
  return {
    id: input.id,
    key: 'momentum',
    label: 'Citation momentum',
    main_value: input.value,
    value: input.value,
    main_value_display: input.valueDisplay,
    value_display: input.valueDisplay,
    delta_value: input.deltaValue,
    delta_display: input.deltaDisplay,
    delta_direction: input.deltaDirection,
    delta_tone: input.deltaTone,
    delta_color_code: input.deltaColorCode,
    unit: '%',
    subtext: input.subtext || '12m velocity versus prior 12m',
    badge: {
      label: input.badgeLabel,
      severity: input.badgeSeverity,
    },
    chart_type: 'gauge',
    chart_data: {
      min: 0,
      max: 150,
      value: input.gaugeValue,
      monthly_values_12m: input.monthlyValues,
      highlight_last_n: 3,
    },
    sparkline: input.monthlyValues,
    sparkline_overlay: [],
    tooltip: 'Tracks change in citation velocity over rolling windows.',
    tooltip_details: {
      update_frequency: 'Daily',
      data_sources: ['OpenAlex'],
    },
    data_source: ['OpenAlex'],
    confidence_score: 0.91,
    stability: 'stable',
    drilldown: {
      title: 'Citation momentum',
      definition: 'Relative lift in citation velocity in the most recent period.',
      formula: '(citations_last_12m - citations_previous_12m) / max(citations_previous_12m, 1)',
      confidence_note: 'Fixture data for UI-only story rendering.',
      publications: [],
      metadata: {},
    },
  }
}

const acceleratingFixture = buildMetricsFixture(
  momentumTileFixture({
    id: 'tile-momentum-accelerating',
    value: 176,
    valueDisplay: 'Momentum 176',
    deltaValue: 76,
    deltaDisplay: '+76% vs prior window',
    deltaDirection: 'up',
    deltaTone: 'positive',
    deltaColorCode: '#166534',
    badgeLabel: 'Accelerating',
    badgeSeverity: 'positive',
    monthlyValues: [90, 95, 98, 100, 102, 104, 106, 103, 102, 170, 176, 182],
    gaugeValue: 176,
  }),
)

const deceleratingFixture = buildMetricsFixture(
  momentumTileFixture({
    id: 'tile-momentum-decelerating',
    value: 92,
    valueDisplay: 'Momentum 92',
    deltaValue: -22,
    deltaDisplay: '-22% vs prior window',
    deltaDirection: 'down',
    deltaTone: 'caution',
    deltaColorCode: '#b45309',
    badgeLabel: 'Decelerating',
    badgeSeverity: 'caution',
    monthlyValues: [130, 126, 124, 121, 120, 118, 117, 114, 111, 95, 93, 93],
    gaugeValue: 92,
  }),
)

const flatFixture = buildMetricsFixture(
  momentumTileFixture({
    id: 'tile-momentum-flat',
    value: 101,
    valueDisplay: 'Momentum 101',
    deltaValue: 2,
    deltaDisplay: '+2% vs prior window',
    deltaDirection: 'flat',
    deltaTone: 'neutral',
    deltaColorCode: '#475569',
    badgeLabel: 'Flat',
    badgeSeverity: 'neutral',
    monthlyValues: [98, 99, 100, 100, 101, 100, 99, 101, 102, 101, 102, 103],
    gaugeValue: 101,
  }),
)

const noDataFixture = buildMetricsFixture(
  momentumTileFixture({
    id: 'tile-momentum-no-data',
    value: null,
    valueDisplay: 'No data',
    deltaValue: null,
    deltaDisplay: null,
    deltaDirection: 'na',
    deltaTone: 'neutral',
    deltaColorCode: '#64748b',
    badgeLabel: 'No data',
    badgeSeverity: 'neutral',
    monthlyValues: [],
    gaugeValue: 0,
    subtext: 'Not enough citation history yet',
  }),
)

const meta: Meta<typeof PublicationsTopStrip> = {
  title: 'Publications/PublicationsTopStrip',
  component: PublicationsTopStrip,
}

export default meta

type Story = StoryObj<typeof PublicationsTopStrip>

export const CitationMomentumTile: Story = {
  args: {
    metrics: acceleratingFixture,
    loading: false,
    token: null,
  },
}

export const CitationMomentumDecelerating: Story = {
  args: {
    metrics: deceleratingFixture,
    loading: false,
    token: null,
  },
}

export const CitationMomentumFlat: Story = {
  args: {
    metrics: flatFixture,
    loading: false,
    token: null,
  },
}

export const CitationMomentumNoData: Story = {
  args: {
    metrics: noDataFixture,
    loading: false,
    token: null,
  },
}
