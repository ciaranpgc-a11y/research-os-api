import type {
  PublicationMetricDetailPayload,
  PublicationMetricTilePayload,
  PublicationsTopMetricsPayload,
} from '@/types/impact'

const citationMomentumTile: PublicationMetricTilePayload = {
  id: 'tile-momentum',
  key: 'momentum',
  label: 'Citation momentum',
  main_value: 14.2,
  value: 14.2,
  main_value_display: '+14.2%',
  value_display: '+14.2%',
  delta_value: 2.1,
  delta_display: '+2.1 pts vs prior window',
  delta_direction: 'up',
  delta_tone: 'positive',
  delta_color_code: 'hsl(var(--tone-positive-700))',
  unit: '%',
  subtext: '12m velocity versus prior 12m',
  badge: {
    label: 'Rising',
    severity: 'positive',
  },
  chart_type: 'line',
  chart_data: {
    values: [2.8, 4.1, 5.7, 7.6, 9.9, 12.4, 14.2],
  },
  sparkline: [2.8, 4.1, 5.7, 7.6, 9.9, 12.4, 14.2],
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
    confidence_note: 'Derived from normalized citation snapshots.',
    tile_id: 't3_momentum',
    as_of_date: '2026-02-24',
    windows: [
      {
        window_id: 'last_12m',
        label: 'Last 12m',
        start_date: '2025-03-01',
        end_date: '2026-02-24',
        is_default: true,
      },
    ],
    headline_metrics: [
      {
        metric_id: 'primary',
        label: 'Momentum',
        value: 14.2,
        value_display: '+14.2%',
        window_id: 'last_12m',
      },
    ],
    series: [
      {
        series_id: 'monthly',
        label: 'Monthly trend',
        window_id: 'last_12m',
        points: [
          {
            label: 'Feb 2026',
            period_start: '2026-02-01',
            period_end: '2026-02-28',
            value: 14.2,
          },
        ],
      },
    ],
    breakdowns: [],
    benchmarks: [],
    methods: {
      definition: 'Relative lift in citation velocity in the most recent period.',
      formula: '(recent - prior) / prior',
      data_sources: ['OpenAlex'],
      refresh_cadence: 'Daily',
      last_updated: '2026-02-24T09:30:00Z',
    },
    qc_flags: [
      {
        code: 'benchmark_unavailable',
        severity: 'info',
        message: 'Benchmark data unavailable for this metric.',
      },
    ],
    publications: [
      {
        work_id: 'W1001',
        title: 'Echocardiographic biomarkers in cardio-oncology',
        year: 2024,
        momentum_contribution: 0.24,
        confidence_score: 0.89,
        confidence_label: 'high',
        match_source: 'openalex',
        match_method: 'doi',
      },
    ],
    metadata: {},
  },
}

export const publicationsMetricsHappyFixture: PublicationsTopMetricsPayload = {
  tiles: [citationMomentumTile],
  data_sources: ['OpenAlex'],
  data_last_refreshed: '2026-02-24T09:30:00Z',
  metadata: {},
  computed_at: '2026-02-24T09:30:00Z',
  status: 'READY',
  is_stale: false,
  is_updating: false,
  last_error: null,
}

export const publicationsMetricsEmptyFixture: PublicationsTopMetricsPayload = {
  tiles: [],
  data_sources: ['OpenAlex'],
  data_last_refreshed: '2026-02-24T09:30:00Z',
  metadata: {},
  computed_at: '2026-02-24T09:30:00Z',
  status: 'READY',
  is_stale: false,
  is_updating: false,
  last_error: null,
}

export const publicationsMetricsErrorFixture: PublicationsTopMetricsPayload = {
  tiles: [],
  data_sources: ['OpenAlex'],
  data_last_refreshed: '2026-02-24T09:30:00Z',
  metadata: {},
  computed_at: '2026-02-24T09:30:00Z',
  status: 'FAILED',
  is_stale: true,
  is_updating: false,
  last_error: 'Mocked metrics failure',
}

export function buildPublicationMetricDetailFixture(metricId: string): PublicationMetricDetailPayload {
  const tile = (publicationsMetricsHappyFixture.tiles.find((item) => item.key === metricId)
    || publicationsMetricsHappyFixture.tiles[0])
  return {
    metric_id: metricId,
    tile,
    data_sources: publicationsMetricsHappyFixture.data_sources,
    data_last_refreshed: publicationsMetricsHappyFixture.data_last_refreshed,
    computed_at: publicationsMetricsHappyFixture.computed_at,
    status: publicationsMetricsHappyFixture.status,
    is_stale: publicationsMetricsHappyFixture.is_stale,
    is_updating: publicationsMetricsHappyFixture.is_updating,
    last_error: publicationsMetricsHappyFixture.last_error,
  }
}
