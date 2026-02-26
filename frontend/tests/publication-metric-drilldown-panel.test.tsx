import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { PublicationMetricDrilldownPanel } from '@/components/publications/PublicationMetricDrilldownPanel'
import type { PublicationMetricTilePayload } from '@/types/impact'

const tile: PublicationMetricTilePayload = {
  id: 'tile-total-publications',
  key: 'this_year_vs_last',
  label: 'Total publications',
  main_value: 24,
  value: 24,
  main_value_display: '24',
  value_display: '24',
  delta_value: null,
  delta_display: '+2 vs prior period',
  delta_direction: 'na',
  delta_tone: 'neutral',
  delta_color_code: '#475569',
  unit: 'publications',
  subtext: 'Output trend over the selected period.',
  badge: {},
  chart_type: 'bar_year_5',
  chart_data: {
    years: [2021, 2022, 2023, 2024, 2025],
    values: [2, 4, 5, 6, 7],
    current_year_ytd: 3,
  },
  sparkline: [2, 4, 5, 6, 7],
  sparkline_overlay: [],
  tooltip: 'Total publications',
  tooltip_details: { update_frequency: 'Daily' },
  data_source: ['OpenAlex'],
  confidence_score: 0.9,
  stability: 'stable',
  drilldown: {
    title: 'Total publications',
    definition: 'Counts authored publications grouped by publication year.',
    formula: 'count(publications)',
    confidence_note: 'Confidence based on provider match quality.',
    tile_id: 't1_total_publications',
    as_of_date: '2026-02-26',
    windows: [
      { window_id: '1y', label: '1y', start_date: '2025-02-26', end_date: '2026-02-26', is_default: false },
      { window_id: '5y', label: '5y', start_date: '2021-02-26', end_date: '2026-02-26', is_default: true },
      { window_id: 'all', label: 'All', start_date: '2018-01-01', end_date: '2026-02-26', is_default: false },
    ],
    headline_metrics: [
      { metric_id: 'primary', label: 'Total publications', value: 24, value_display: '24', window_id: 'all' },
      { metric_id: 'active_years', label: 'Active years', value: 5, value_display: '5', window_id: 'all' },
      { metric_id: 'current_ytd', label: 'Current YTD', value: 3, value_display: '3', window_id: '1y' },
    ],
    series: [
      {
        series_id: 'yearly',
        label: 'Yearly trend',
        window_id: '5y',
        points: [
          { label: '2021', period_start: '2021-01-01', period_end: '2021-12-31', value: 2 },
          { label: '2022', period_start: '2022-01-01', period_end: '2022-12-31', value: 4 },
          { label: '2023', period_start: '2023-01-01', period_end: '2023-12-31', value: 5 },
        ],
      },
    ],
    breakdowns: [
      {
        breakdown_id: 'by_publication_type',
        label: 'By publication type',
        items: [
          { key: 'article', label: 'Article', value: 18, share_pct: 75.0 },
          { key: 'review', label: 'Review', value: 6, share_pct: 25.0 },
        ],
      },
    ],
    benchmarks: [],
    methods: {
      definition: 'Counts authored publications.',
      formula: 'count(publications)',
      data_sources: ['OpenAlex'],
      refresh_cadence: 'Daily',
      last_updated: '2026-02-26T10:00:00Z',
      caveats: ['No synthetic imputation for missing years.'],
    },
    qc_flags: [
      { code: 'partial_window', message: 'Current-year window is partial.', severity: 'info' },
      { code: 'benchmark_unavailable', message: 'Benchmark data unavailable.', severity: 'info' },
    ],
    publications: [],
    metadata: {},
  },
}

describe('PublicationMetricDrilldownPanel', () => {
  it('renders each drilldown domain from canonical contract fields', () => {
    const { rerender } = render(
      <PublicationMetricDrilldownPanel tile={tile} activeTab="summary" />,
    )

    expect(screen.getByText('Data quality')).toBeInTheDocument()
    expect(screen.getByText('Active years')).toBeInTheDocument()

    rerender(<PublicationMetricDrilldownPanel tile={tile} activeTab="breakdown" />)
    expect(screen.getByText('By publication type')).toBeInTheDocument()

    rerender(<PublicationMetricDrilldownPanel tile={tile} activeTab="trajectory" />)
    expect(screen.getByText('Yearly trend')).toBeInTheDocument()

    rerender(<PublicationMetricDrilldownPanel tile={tile} activeTab="context" />)
    expect(screen.getByText('Context not available for this metric.')).toBeInTheDocument()

    rerender(<PublicationMetricDrilldownPanel tile={tile} activeTab="methods" />)
    expect(screen.getByText(/Counts authored publications/)).toBeInTheDocument()
  })
})
