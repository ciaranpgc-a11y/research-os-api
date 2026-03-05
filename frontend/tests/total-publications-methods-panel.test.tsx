import { fireEvent, render, screen, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { PublicationsTopStrip } from '@/components/publications/PublicationsTopStrip'
import type { PublicationMetricTilePayload, PublicationsTopMetricsPayload } from '@/types/impact'

function buildTotalPublicationsTile(): PublicationMetricTilePayload {
  return {
    id: 'tile-total-publications',
    key: 'this_year_vs_last',
    label: 'Total publications',
    main_value: 24,
    value: 24,
    main_value_display: '24',
    value_display: '24',
    delta_value: null,
    delta_display: null,
    delta_direction: 'na',
    delta_tone: 'neutral',
    delta_color_code: '#475569',
    unit: 'publications',
    subtext: 'Lifetime publications',
    badge: {},
    chart_type: 'bar_year_5',
    chart_data: {
      years: [2021, 2022, 2023, 2024, 2025],
      values: [2, 4, 5, 6, 7],
      projected_year: 2025,
      current_year_ytd: 7,
    },
    sparkline: [2, 4, 5, 6, 7],
    sparkline_overlay: [],
    tooltip: 'Total publications',
    tooltip_details: {
      update_frequency: 'Daily',
    },
    data_source: ['ORCID', 'OpenAlex'],
    confidence_score: 0.92,
    stability: 'stable',
    drilldown: {
      title: 'Total publications',
      definition: 'Counts authored publications and groups them by publication year.',
      formula: 'count(publications) by year',
      confidence_note: 'Confidence based on provider match quality.',
      as_of_date: '2026-03-05',
      windows: [
        { window_id: '1y', label: '1y', start_date: '2025-03-05', end_date: '2026-03-05', is_default: false },
        { window_id: '3y', label: '3y', start_date: '2023-03-05', end_date: '2026-03-05', is_default: false },
        { window_id: '5y', label: '5y', start_date: '2021-03-05', end_date: '2026-03-05', is_default: true },
        { window_id: 'all', label: 'All', start_date: '2021-01-01', end_date: '2026-03-05', is_default: false },
      ],
      breakdowns: [
        {
          breakdown_id: 'by_publication_type',
          label: 'By publication type',
          items: [{ key: 'article', label: 'Article', value: 18 }],
        },
        {
          breakdown_id: 'by_venue_full',
          label: 'By venue (all)',
          items: [
            { key: 'j1', label: 'Journal A', value: 10, share_pct: 41.7, avg_citations: 12.4 },
            { key: 'j2', label: 'Journal B', value: 8, share_pct: 33.3, avg_citations: 9.1 },
          ],
        },
        {
          breakdown_id: 'by_topic',
          label: 'By research topic',
          items: [
            { key: 't1', label: 'Cardiology', value: 7, share_pct: 29.2, avg_citations: 11.2 },
            { key: 't2', label: 'Oncology', value: 6, share_pct: 25.0, avg_citations: 8.4 },
          ],
        },
        {
          breakdown_id: 'by_oa_status',
          label: 'By open access status',
          items: [
            { key: 'open_access', label: 'Open access', value: 15, share_pct: 62.5, avg_citations: 10.3 },
            { key: 'closed', label: 'Closed', value: 9, share_pct: 37.5, avg_citations: 7.6 },
          ],
        },
      ],
      benchmarks: [],
      methods: {
        definition: 'Counts authored publications.',
        formula: 'count(publications)',
        data_sources: ['ORCID', 'OpenAlex'],
        refresh_cadence: 'Daily',
        last_updated: '2026-03-05T09:30:00Z',
        caveats: ['Benchmark context is not yet available for this metric.'],
        dedupe_rules: [
          'DOI/PMID identity match takes precedence.',
          'Fallback duplicate checks use title + publication year.',
        ],
      },
      qc_flags: [],
      publications: [
        { work_id: 'w1', year: 2021, title: 'Paper 1', journal: 'Journal A' },
        { work_id: 'w2', year: 2022, title: 'Paper 2', journal: 'Journal B' },
        { work_id: 'w3', year: 2025, title: 'Paper 3', journal: 'Journal A' },
      ],
      metadata: {},
    },
  }
}

function buildMetricsPayload(tile: PublicationMetricTilePayload): PublicationsTopMetricsPayload {
  return {
    tiles: [tile],
    data_sources: ['ORCID', 'OpenAlex'],
    data_last_refreshed: '2026-03-05T09:30:00Z',
    metadata: {},
    computed_at: '2026-03-05T09:30:00Z',
    status: 'READY',
    is_stale: false,
    is_updating: false,
    last_error: null,
  }
}

describe('PublicationsTopStrip methods drilldown', () => {
  it('renders canonical methods headings for total publication insights', () => {
    const tile = buildTotalPublicationsTile()
    const { container } = render(
      <PublicationsTopStrip
        metrics={buildMetricsPayload(tile)}
        loading={false}
        forceInsightsVisible
      />,
    )

    const metricTile = container.querySelector('[data-metric-key="this_year_vs_last"]')
    expect(metricTile).not.toBeNull()
    fireEvent.click(metricTile as HTMLElement)

    fireEvent.click(screen.getByRole('tab', { name: 'Methods' }))

    const tabPanel = screen.getByRole('tabpanel')
    expect(within(tabPanel).getByText('Summary')).toBeInTheDocument()
    expect(within(tabPanel).getByText('Breakdown')).toBeInTheDocument()
    expect(within(tabPanel).getByText('Trajectory')).toBeInTheDocument()
    expect(within(tabPanel).getByText('Context')).toBeInTheDocument()
    expect(within(tabPanel).getByText(/How the headline cards and lifetime totals are calculated/i)).toBeInTheDocument()
  })
})
