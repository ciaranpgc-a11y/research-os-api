import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { PublicationsTopStrip } from '@/components/publications/PublicationsTopStrip'
import type { PublicationMetricTilePayload, PublicationsTopMetricsPayload } from '@/types/impact'

const mockFetchPublicationInsightsAgent = vi.fn()
const mockPingApiHealth = vi.fn()

vi.mock('@/lib/impact-api', async () => {
  const actual = await vi.importActual<Record<string, unknown>>('@/lib/impact-api')
  return {
    ...actual,
    fetchPublicationInsightsAgent: (...args: unknown[]) => mockFetchPublicationInsightsAgent(...args),
    pingApiHealth: (...args: unknown[]) => mockPingApiHealth(...args),
  }
})

function buildTotalPublicationsTile(overrides: Partial<PublicationMetricTilePayload> = {}): PublicationMetricTilePayload {
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
        { work_id: 'w1', year: 2021, title: 'Paper 1', journal: 'Journal A', work_type: 'journal-article', article_type: 'original-article' },
        { work_id: 'w2', year: 2022, title: 'Paper 2', journal: 'Journal B', work_type: 'review-article', article_type: 'review-article' },
        { work_id: 'w3', year: 2025, title: 'Paper 3', journal: 'Journal A', work_type: 'journal-article', article_type: 'original-article' },
      ],
      metadata: {},
    },
    ...overrides,
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
  beforeEach(() => {
    mockFetchPublicationInsightsAgent.mockReset()
    mockPingApiHealth.mockReset()
    mockPingApiHealth.mockResolvedValue({ status: 'ok' })
    mockFetchPublicationInsightsAgent.mockImplementation((_token: string, options?: { sectionKey?: string }) => Promise.resolve(
      options?.sectionKey === 'publication_volume_over_time'
        ? {
          overall_summary: 'Volume rises across the full span, while the most recent 12-month window is quieter and easier to inspect in the table.',
          sections: [
            {
              key: 'publication_volume_over_time',
              headline: 'Long-run rise, quieter recent window',
              body: 'Across the full span, publication volume steps up from the early years into later stronger output. The recent 12-month window through the end of February 2026 is lighter than the strongest rolling multi-year blocks, and the table shows that recent activity is carried by a small set of dated publications rather than a broad month-by-month spread.',
              consideration_label: 'Table detail',
              consideration: 'The table is the quickest way to see whether a quieter recent window reflects just a few recent publications or a broader change in cadence.',
              evidence: {
                span_years_label: '2021-2025',
                recent_monthly_period_label: 'Mar 2025-Feb 2026',
              },
            },
          ],
          provenance: {
            generated_at: '2026-03-08T10:00:00Z',
          },
        }
        : options?.sectionKey === 'publication_production_phase'
        ? {
          overall_summary: 'The record still builds from a quiet early base rather than settling into a fixed annual range.',
          sections: [
            {
              key: 'publication_production_phase',
              title: 'Production phase',
              headline: 'Build from early base',
              body: 'The fitted slope is still upward and the quietest years sit at the start of the span rather than the end. With no gap years and a heavier recent share of output, this reads as cumulative build-up rather than a stable mature pattern.',
              consideration_label: 'Recent build',
              consideration: 'The recent complete years carry more output than an even spread across the publication span would imply.',
              evidence: {
                phase_label: 'Scaling',
                slope: 1,
              },
            },
          ],
          provenance: {
            generated_at: '2026-03-08T10:00:00Z',
          },
        }
        : options?.sectionKey === 'publication_article_type_over_time'
        ? {
          overall_summary: 'Original articles still anchor the full record, but the latest windows tilt more toward reviews and do so from a narrow current-year set.',
          sections: [
            {
              key: 'publication_article_type_over_time',
              headline: 'Recent mix shift',
              body: 'Across the full publication span, original articles still lead the long-run mix, but the latest 3-year and 1-year windows tilt more toward review articles than the wider record does. The newest view is also narrower than the full span and still sits on a small partial-year set, so treat that recent ordering as directional rather than settled.',
              consideration_label: 'Recent window',
              consideration: 'Because the latest 1-year view is both partial and small, it is better read as an early tilt than a fixed replacement of the full-record mix.',
              evidence: {
                span_years_label: '2021-2026',
                recent_window_change_state: 'leader_shift',
              },
            },
          ],
          provenance: {
            generated_at: '2026-03-08T10:00:00Z',
          },
        }
        : options?.sectionKey === 'publication_type_over_time'
        ? {
          overall_summary: 'Journal articles still anchor the full record, but the latest windows tilt more toward review articles and do so from a narrow current-year set.',
          sections: [
            {
              key: 'publication_type_over_time',
              headline: 'Recent mix shift',
              body: 'Across the full publication span, journal articles still lead the long-run mix, but the latest 3-year and 1-year windows tilt more toward review articles than the wider record does. The newest view is also narrower than the full span and still sits on a small partial-year set, so treat that recent ordering as directional rather than settled.',
              consideration_label: 'Recent window',
              consideration: 'Because the latest 1-year view is both partial and small, it is better read as an early tilt than a fixed replacement of the full-record mix.',
              evidence: {
                span_years_label: '2021-2026',
                recent_window_change_state: 'leader_shift',
              },
            },
          ],
          provenance: {
            generated_at: '2026-03-08T10:00:00Z',
          },
        }
        : {
          overall_summary: 'Output is uneven because quieter early years sit before later stronger peaks.',
          sections: [
            {
              key: 'publication_output_pattern',
              headline: 'Output pattern',
              body: 'Your quieter years sit early in the publication span, while later years carry the strongest output.',
              consideration_label: 'How to use it',
              consideration: 'Open trajectory if you want to see exactly where the quieter and stronger years occur.',
              evidence: {
                active_span: 6,
                years_with_output: 5,
              },
            },
          ],
          provenance: {
            generated_at: '2026-03-08T10:00:00Z',
          },
        },
    ))
  })

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

  it('renders the publication production pattern module and updates when the year scope changes', () => {
    const tile = buildTotalPublicationsTile({
      main_value: 9,
      value: 9,
      main_value_display: '9',
      value_display: '9',
      chart_data: {
        years: [2021, 2022, 2023, 2024, 2025, 2026],
        values: [1, 2, 0, 3, 1, 2],
        projected_year: 2026,
        current_year_ytd: 2,
      },
      sparkline: [1, 2, 0, 3, 1, 2],
      drilldown: {
        ...buildTotalPublicationsTile().drilldown,
        as_of_date: '2026-03-05',
        publications: [
          { work_id: 'w1', year: 2021, title: 'Paper 1', journal: 'Journal A' },
          { work_id: 'w2', year: 2022, title: 'Paper 2', journal: 'Journal B' },
          { work_id: 'w3', year: 2024, title: 'Paper 3', journal: 'Journal A' },
          { work_id: 'w4', year: 2024, title: 'Paper 4', journal: 'Journal A' },
          { work_id: 'w5', year: 2025, title: 'Paper 5', journal: 'Journal A' },
          { work_id: 'w6', year: 2026, title: 'Paper 6', journal: 'Journal B' },
          { work_id: 'w7', year: 2026, title: 'Paper 7', journal: 'Journal B' },
        ],
      },
    })
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

    const phaseTile = document.querySelector('[data-ui="publication-production-phase"]')
    expect(phaseTile).not.toBeNull()
    expect(within(phaseTile as HTMLElement).getByText('What stage is my publication output in?')).toBeInTheDocument()
    expect(within(phaseTile as HTMLElement).getByText('Trend slope')).toBeInTheDocument()
    expect(within(phaseTile as HTMLElement).getByText('Peak Year')).toBeInTheDocument()

    const module = document.querySelector('[data-ui="publication-production-pattern"]')
    expect(module).not.toBeNull()
    expect(within(module as HTMLElement).getByText('How steady is my publication output?')).toBeInTheDocument()
    expect(within(module as HTMLElement).getByRole('button', { name: 'Explain publication output steadiness' })).toBeInTheDocument()
    expect(within(module as HTMLElement).queryByRole('button', { name: 'Explain Consistency Index' })).toBeNull()
    expect(within(module as HTMLElement).queryByRole('button', { name: 'Explain Burstiness Score' })).toBeNull()
    expect(within(module as HTMLElement).queryByRole('button', { name: 'Explain Peak-year Share' })).toBeNull()
    expect(within(module as HTMLElement).queryByRole('button', { name: 'Explain Years with Output' })).toBeNull()
    expect(within(module as HTMLElement).getByText('Years with output')).toBeInTheDocument()
    expect(within(module as HTMLElement).getByText('4 / 5')).toBeInTheDocument()
    expect(within(module as HTMLElement).queryByRole('button', { name: 'Full years' })).toBeNull()
    expect(within(module as HTMLElement).queryByRole('button', { name: 'YTD' })).toBeNull()
    expect(within(module as HTMLElement).queryByText('Includes 2026 year-to-date publications as a partial year.')).toBeNull()
    expect(within(module as HTMLElement).queryByText('83% continuity')).toBeNull()
  })

  it('renders tied peak years in the production phase summary tile', async () => {
    const tile = buildTotalPublicationsTile({
      main_value: 8,
      value: 8,
      main_value_display: '8',
      value_display: '8',
      chart_data: {
        years: [2021, 2022, 2023, 2024, 2025],
        values: [2, 1, 1, 2, 1],
        projected_year: 2026,
        current_year_ytd: 1,
      },
      sparkline: [2, 1, 1, 2, 1],
      drilldown: {
        ...buildTotalPublicationsTile().drilldown,
        as_of_date: '2026-03-05',
        publications: [
          { work_id: 'w1', year: 2021, title: 'Paper 1', journal: 'Journal A' },
          { work_id: 'w2', year: 2021, title: 'Paper 2', journal: 'Journal A' },
          { work_id: 'w3', year: 2022, title: 'Paper 3', journal: 'Journal B' },
          { work_id: 'w4', year: 2023, title: 'Paper 4', journal: 'Journal B' },
          { work_id: 'w5', year: 2024, title: 'Paper 5', journal: 'Journal A' },
          { work_id: 'w6', year: 2024, title: 'Paper 6', journal: 'Journal A' },
          { work_id: 'w7', year: 2025, title: 'Paper 7', journal: 'Journal A' },
          { work_id: 'w8', year: 2026, title: 'Paper 8', journal: 'Journal B' },
        ],
      },
    })
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

    const phaseTile = document.querySelector('[data-ui="publication-production-phase"]')
    expect(phaseTile).not.toBeNull()
    expect(within(phaseTile as HTMLElement).getByText('Peak Years')).toBeInTheDocument()
    expect(within(phaseTile as HTMLElement).getByText('2 (2021, 2024)')).toBeInTheDocument()
  })

  it('renders adaptive publication-output-pattern guidance from the series shape', async () => {
    const tile = buildTotalPublicationsTile({
      chart_data: {
        years: [2016, 2017, 2018, 2019, 2020, 2021, 2022, 2023, 2024, 2025, 2026],
        values: [1, 1, 16, 8, 8, 19, 11, 14, 19, 4, 1],
        projected_year: 2026,
        current_year_ytd: 1,
      },
      sparkline: [1, 1, 16, 8, 8, 19, 11, 14, 19, 4, 1],
      drilldown: {
        ...buildTotalPublicationsTile().drilldown,
        as_of_date: '2026-03-08',
      },
    })

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

    const module = document.querySelector('[data-ui="publication-production-pattern"]')
    expect(module).not.toBeNull()

    const helpButton = within(module as HTMLElement).getByRole('button', { name: 'Explain publication output steadiness' })
    fireEvent.mouseEnter(helpButton)
    fireEvent.focus(helpButton)

    await waitFor(() => {
      expect(screen.getAllByText(/Your lifetime consistency index is 0\.36 \(scale 0 to 1\)\./i).length).toBeGreaterThan(0)
    })
    expect(screen.getAllByText(/Median year: 10 publications \(IQR 5-16\)\./i).length).toBeGreaterThan(0)
    expect(screen.getAllByText(/Burstiness stays moderate because the record rises into repeated peaks rather than one isolated spike, but then drops to 4 in 2025\./i).length).toBeGreaterThan(0)
    expect(
      screen.getAllByText((_content, element) => {
        const text = element?.textContent ?? ''
        return text.includes('2018') && text.includes('2021') && text.includes('2024') && text.includes('other years')
      }).length,
    ).toBeGreaterThan(0)
    expect(
      screen.getAllByText((_content, element) => {
        const text = element?.textContent ?? ''
        const describesPeakTiming =
          text.includes('rhythm')
          || text.includes('years apart')
          || text.includes('irregular')
          || text.includes('return roughly every')
          || text.includes('returned')
        return describesPeakTiming && text.includes('lower year')
      }).length,
    ).toBeGreaterThan(0)
  })

  it('opens the publication production pattern insight and requests the publication output pattern section', async () => {
    const tile = buildTotalPublicationsTile({
      main_value: 9,
      value: 9,
      main_value_display: '9',
      value_display: '9',
      chart_data: {
        years: [2021, 2022, 2023, 2024, 2025, 2026],
        values: [1, 2, 0, 3, 1, 2],
        projected_year: 2026,
        current_year_ytd: 2,
      },
      sparkline: [1, 2, 0, 3, 1, 2],
      drilldown: {
        ...buildTotalPublicationsTile().drilldown,
        as_of_date: '2026-03-05',
        publications: [
          { work_id: 'w1', year: 2021, title: 'Paper 1', journal: 'Journal A' },
          { work_id: 'w2', year: 2022, title: 'Paper 2', journal: 'Journal B' },
          { work_id: 'w3', year: 2024, title: 'Paper 3', journal: 'Journal A' },
          { work_id: 'w4', year: 2025, title: 'Paper 4', journal: 'Journal A' },
          { work_id: 'w5', year: 2026, title: 'Paper 5', journal: 'Journal B' },
          { work_id: 'w6', year: 2026, title: 'Paper 6', journal: 'Journal B' },
        ],
      },
    })
    const { container } = render(
      <PublicationsTopStrip
        metrics={buildMetricsPayload(tile)}
        loading={false}
        token="test-session-token"
        forceInsightsVisible
      />,
    )

    const metricTile = container.querySelector('[data-metric-key="this_year_vs_last"]')
    expect(metricTile).not.toBeNull()
    fireEvent.click(metricTile as HTMLElement)

    const module = document.querySelector('[data-ui="publication-production-pattern"]')
    expect(module).not.toBeNull()

    await waitFor(() => {
      expect(within(module as HTMLElement).getByRole('button', { name: 'Open publication output pattern insight' })).toBeInTheDocument()
    })
    fireEvent.click(within(module as HTMLElement).getByRole('button', { name: 'Open publication output pattern insight' }))

    await waitFor(() => {
      expect(mockFetchPublicationInsightsAgent).toHaveBeenCalledWith('test-session-token', {
        windowId: 'all',
        scope: 'section',
        sectionKey: 'publication_output_pattern',
      })
    })

    await waitFor(() => {
      expect(screen.getByText('Output pattern')).toBeInTheDocument()
    })
    expect(screen.getByText('Your quieter years sit early in the publication span, while later years carry the strongest output.')).toBeInTheDocument()
    expect(screen.getByText('Open trajectory')).toBeInTheDocument()
  })

  it('opens the production phase insight and requests the publication production phase section', async () => {
    const tile = buildTotalPublicationsTile({
      main_value: 9,
      value: 9,
      main_value_display: '9',
      value_display: '9',
      chart_data: {
        years: [2021, 2022, 2023, 2024, 2025, 2026],
        values: [1, 2, 0, 3, 1, 2],
        projected_year: 2026,
        current_year_ytd: 2,
      },
      sparkline: [1, 2, 0, 3, 1, 2],
      drilldown: {
        ...buildTotalPublicationsTile().drilldown,
        as_of_date: '2026-03-05',
        publications: [
          { work_id: 'w1', year: 2021, title: 'Paper 1', journal: 'Journal A' },
          { work_id: 'w2', year: 2022, title: 'Paper 2', journal: 'Journal B' },
          { work_id: 'w3', year: 2024, title: 'Paper 3', journal: 'Journal A' },
          { work_id: 'w4', year: 2025, title: 'Paper 4', journal: 'Journal A' },
          { work_id: 'w5', year: 2026, title: 'Paper 5', journal: 'Journal B' },
          { work_id: 'w6', year: 2026, title: 'Paper 6', journal: 'Journal B' },
        ],
      },
    })
    const { container } = render(
      <PublicationsTopStrip
        metrics={buildMetricsPayload(tile)}
        loading={false}
        token="test-session-token"
        forceInsightsVisible
      />,
    )

    const metricTile = container.querySelector('[data-metric-key="this_year_vs_last"]')
    expect(metricTile).not.toBeNull()
    fireEvent.click(metricTile as HTMLElement)

    const module = document.querySelector('[data-ui="publication-production-phase"]')
    expect(module).not.toBeNull()

    await waitFor(() => {
      expect(within(module as HTMLElement).getByRole('button', { name: 'Open production phase insight' })).toBeInTheDocument()
    })
    fireEvent.click(within(module as HTMLElement).getByRole('button', { name: 'Open production phase insight' }))

    await waitFor(() => {
      expect(mockFetchPublicationInsightsAgent).toHaveBeenCalledWith('test-session-token', {
        windowId: 'all',
        scope: 'section',
        sectionKey: 'publication_production_phase',
      })
    })

    await waitFor(() => {
      expect(screen.getByText('Build from early base')).toBeInTheDocument()
    })
    expect(screen.getByText('The fitted slope is still upward and the quietest years sit at the start of the span rather than the end.')).toBeInTheDocument()
    expect(screen.getByText('With no gap years and a heavier recent share of output, this reads as cumulative build-up rather than a stable mature pattern.')).toBeInTheDocument()
    expect(screen.getByText('Open context')).toBeInTheDocument()
  })

  it('keeps live publication insight buttons hidden when the insights API is unavailable', async () => {
    mockPingApiHealth.mockRejectedValueOnce(new Error('API health check failed'))

    const tile = buildTotalPublicationsTile()
    const { container } = render(
      <PublicationsTopStrip
        metrics={buildMetricsPayload(tile)}
        loading={false}
        token="test-session-token"
        forceInsightsVisible
      />,
    )

    const metricTile = container.querySelector('[data-metric-key="this_year_vs_last"]')
    expect(metricTile).not.toBeNull()
    fireEvent.click(metricTile as HTMLElement)

    const phaseTile = document.querySelector('[data-ui="publication-production-phase"]')
    const volumeTile = document.querySelector('[data-ui="publication-volume-over-time"]')
    expect(phaseTile).not.toBeNull()
    expect(volumeTile).not.toBeNull()

    await waitFor(() => {
      expect(mockPingApiHealth).toHaveBeenCalledTimes(1)
    })
  expect(within(phaseTile as HTMLElement).queryByRole('button', { name: 'Open production phase insight' })).toBeNull()
  expect(within(volumeTile as HTMLElement).queryByRole('button', { name: 'Open publication volume over time insight' })).toBeNull()
  })

  it('shows a loading bar while a live publication insight is being generated', async () => {
    mockFetchPublicationInsightsAgent.mockReturnValueOnce(new Promise(() => {}))

    const tile = buildTotalPublicationsTile({
      main_value: 9,
      value: 9,
      main_value_display: '9',
      value_display: '9',
    })
    const { container } = render(
      <PublicationsTopStrip
        metrics={buildMetricsPayload(tile)}
        loading={false}
        token="test-session-token"
        forceInsightsVisible
      />,
    )

    const metricTile = container.querySelector('[data-metric-key="this_year_vs_last"]')
    expect(metricTile).not.toBeNull()
    fireEvent.click(metricTile as HTMLElement)

    const module = document.querySelector('[data-ui="publication-production-phase"]')
    expect(module).not.toBeNull()

    await waitFor(() => {
      expect(within(module as HTMLElement).getByRole('button', { name: 'Open production phase insight' })).toBeInTheDocument()
    })
    const insightButton = within(module as HTMLElement).getByRole('button', { name: 'Open production phase insight' })
    expect(insightButton.querySelector('[data-ui="insights-glyph"][data-animated="true"]')).not.toBeNull()
    fireEvent.click(insightButton)

    await waitFor(() => {
      expect(document.querySelector('[data-ui="publication-insight-loading-bar"]')).not.toBeNull()
    })
    expect(screen.getByText('Delving deeper into your publication history. Please wait.')).toBeInTheDocument()
  })

  it('renders plateauing context when the recent complete years cool after a peak', async () => {
    const lifetimeMonthLabels = Array.from({ length: 38 }, (_value, index) => {
      const month = new Date(Date.UTC(2023, index, 1))
      return month.toISOString().slice(0, 10)
    })
    const monthlyValuesLifetime = Array.from({ length: 38 }, () => 0)
    monthlyValuesLifetime[1] = 1
    monthlyValuesLifetime[12] = 1
    monthlyValuesLifetime[25] = 1
    monthlyValuesLifetime[36] = 1
    monthlyValuesLifetime[37] = 1

    const tile = buildTotalPublicationsTile({
      chart_data: {
        years: [2016, 2017, 2018, 2019, 2020, 2021, 2022, 2023, 2024, 2025, 2026],
        values: [1, 1, 16, 8, 8, 19, 11, 14, 19, 4, 1],
        monthly_values_lifetime: monthlyValuesLifetime,
        month_labels_lifetime: lifetimeMonthLabels,
        lifetime_month_start: '2023-01-01',
        projected_year: 2026,
        current_year_ytd: 1,
      },
      sparkline: [1, 1, 16, 8, 8, 19, 11, 14, 19, 4, 1],
      drilldown: {
        ...buildTotalPublicationsTile().drilldown,
        as_of_date: '2026-03-08',
      },
    })
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

    const phaseTile = document.querySelector('[data-ui="publication-production-phase"]')
    expect(phaseTile).not.toBeNull()
    expect(within(phaseTile as HTMLElement).getByText('2026')).toBeInTheDocument()

    const helpButton = within(phaseTile as HTMLElement).getByRole('button', { name: 'Explain Production Phase' })
    fireEvent.mouseEnter(helpButton)
    fireEvent.focus(helpButton)

    await waitFor(() => {
      expect(screen.getAllByText(/Growth has cooled after recent peak years\./i).length).toBeGreaterThan(0)
    })
    expect(screen.getAllByText(/Output peaked in 2021 and 2024 \(19 each\), then fell to 4 in 2025\./i).length).toBeGreaterThan(0)
    expect(screen.getAllByText(/The fitted slope points upward at \+1 paper per year from 2016 to 2025/i).length).toBeGreaterThan(0)
    expect(screen.getAllByText(/cooling after growth rather than a full decline/i).length).toBeGreaterThan(0)
    expect(screen.getAllByText(/Across 2023-2025, output averaged 12 publications per year versus 9 earlier/i).length).toBeGreaterThan(0)
    expect(screen.getAllByText(/37% of the record, but it cooled at the end/i).length).toBeGreaterThan(0)
    expect(screen.getAllByText(/Based on complete years to end of 2025\./i).length).toBeGreaterThan(0)
    const latestCompleteYearSlice = within(phaseTile as HTMLElement).getByRole('button', {
      name: /Production phase in 2025: 4 publications/i,
    })
    fireEvent.focus(latestCompleteYearSlice)
    await waitFor(() => {
      expect(screen.getAllByText('2025').length).toBeGreaterThan(0)
    })
    expect(screen.getAllByText('Publications: 4').length).toBeGreaterThan(0)
  })

  it('renders adaptive publication-volume guidance from the series shape', async () => {
    const lifetimeMonthLabels = Array.from({ length: 60 }, (_value, index) => {
      const month = new Date(Date.UTC(2021, 2 + index, 1))
      return month.toISOString().slice(0, 10)
    })
    const monthlyValuesLifetime = Array.from({ length: 60 }, () => 0)
    monthlyValuesLifetime[0] = 19
    monthlyValuesLifetime[12] = 11
    monthlyValuesLifetime[24] = 14
    monthlyValuesLifetime[36] = 19
    monthlyValuesLifetime[48] = 1
    monthlyValuesLifetime[51] = 1
    monthlyValuesLifetime[57] = 1
    monthlyValuesLifetime[59] = 1

    const tile = buildTotalPublicationsTile({
      chart_data: {
        years: [2016, 2017, 2018, 2019, 2020, 2021, 2022, 2023, 2024, 2025, 2026],
        values: [1, 1, 16, 8, 8, 19, 11, 14, 19, 4, 1],
        monthly_values_12m: [1, 0, 0, 1, 0, 0, 0, 0, 0, 1, 0, 1],
        month_labels_12m: ['Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec', 'Jan', 'Feb'],
        monthly_values_lifetime: monthlyValuesLifetime,
        month_labels_lifetime: lifetimeMonthLabels,
        lifetime_month_start: '2021-03-01',
        projected_year: 2026,
        current_year_ytd: 1,
      },
      sparkline: [1, 1, 16, 8, 8, 19, 11, 14, 19, 4, 1],
      drilldown: {
        ...buildTotalPublicationsTile().drilldown,
        as_of_date: '2026-03-08',
        publications: [
          { work_id: 'w1', year: 2025, publication_date: '2025-03-12', title: 'Paper 1', journal: 'Journal A', article_type: 'original-article' },
          { work_id: 'w2', year: 2025, publication_date: '2025-06-08', title: 'Paper 2', journal: 'Journal B', article_type: 'review-article' },
          { work_id: 'w3', year: 2025, publication_date: '2025-12-18', title: 'Paper 3', journal: 'Journal A', article_type: 'original-article' },
          { work_id: 'w4', year: 2026, publication_date: '2026-02-15', title: 'Paper 4', journal: 'Journal A', article_type: 'original-article' },
        ],
      },
    })

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

    const module = document.querySelector('[data-ui="publication-volume-over-time"]')
    expect(module).not.toBeNull()

    const helpButton = within(module as HTMLElement).getByRole('button', { name: 'Explain Publication Volume Over Time' })
    expect(helpButton.className).toContain('--tone-warning-200')
    fireEvent.mouseEnter(helpButton)
    fireEvent.focus(helpButton)

    await waitFor(() => {
      expect(screen.getAllByText(/How has my publication volume changed over time\?/i).length).toBeGreaterThan(0)
    })
    expect(screen.getAllByText(/Volume built into stronger later years, but the latest windows have softened\./i).length).toBeGreaterThan(0)
    expect(screen.getAllByText(/The stronger run sat in 2021 and 2024, when annual output reached 19 in both years; the latest window has not sustained that level\./i).length).toBeGreaterThan(0)
    expect(screen.getAllByText(/Recent volume has slipped below its rolling backdrop\./i).length).toBeGreaterThan(0)
    expect(screen.getAllByText(/The latest 5- and 3-year views sit at roughly 13 and 12 per year, while the latest 12 months contribute 4\./i).length).toBeGreaterThan(0)
    expect(screen.getAllByText(/Recent activity is thinner than the earlier run, but it is not just one isolated gap/i).length).toBeGreaterThan(0)
    expect(screen.getAllByText(/the latest window still spans 4 active months and 4 recorded publications/i).length).toBeGreaterThan(0)
    expect(screen.getAllByText(/Using rolling data to the end of/i).length).toBeGreaterThan(0)
  })

  it('opens the publication volume over time insight and requests the whole section read', async () => {
    const tile = buildTotalPublicationsTile({
      chart_data: {
        years: [2021, 2022, 2023, 2024, 2025],
        values: [2, 4, 5, 6, 7],
        monthly_values_12m: [0, 1, 0, 0, 1, 0, 0, 0, 0, 1, 0, 1],
        month_labels_12m: ['Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec', 'Jan', 'Feb'],
        monthly_values_lifetime: [
          0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 0,
          0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 0,
          0, 1, 0, 1, 0, 0, 1, 0, 1, 0, 0, 0,
          1, 0, 1, 0, 1, 0, 1, 0, 0, 1, 0, 0,
          0, 1, 0, 0, 1, 0, 0, 0, 0, 1, 0, 1,
        ],
        month_labels_lifetime: Array.from({ length: 60 }, (_value, index) => {
          const month = new Date(Date.UTC(2021, 2 + index, 1))
          return month.toISOString().slice(0, 10)
        }),
        projected_year: 2026,
        current_year_ytd: 1,
      },
      drilldown: {
        ...buildTotalPublicationsTile().drilldown,
        as_of_date: '2026-03-08',
        publications: [
          { work_id: 'w1', year: 2025, publication_date: '2025-04-12', title: 'Paper 1', journal: 'Journal A', article_type: 'original-article' },
          { work_id: 'w2', year: 2025, publication_date: '2025-07-05', title: 'Paper 2', journal: 'Journal B', article_type: 'review-article' },
          { work_id: 'w3', year: 2025, publication_date: '2025-12-01', title: 'Paper 3', journal: 'Journal A', article_type: 'original-article' },
          { work_id: 'w4', year: 2026, publication_date: '2026-02-15', title: 'Paper 4', journal: 'Journal A', article_type: 'original-article' },
        ],
      },
    })
    const { container } = render(
      <PublicationsTopStrip
        metrics={buildMetricsPayload(tile)}
        loading={false}
        token="test-session-token"
        forceInsightsVisible
      />,
    )

    const metricTile = container.querySelector('[data-metric-key="this_year_vs_last"]')
    expect(metricTile).not.toBeNull()
    fireEvent.click(metricTile as HTMLElement)

    const module = document.querySelector('[data-ui="publication-volume-over-time"]')
    expect(module).not.toBeNull()

    await waitFor(() => {
      expect(within(module as HTMLElement).getByRole('button', { name: 'Open publication volume over time insight' })).toBeInTheDocument()
    })
    fireEvent.click(within(module as HTMLElement).getByRole('button', { name: 'Open publication volume over time insight' }))

    await waitFor(() => {
      expect(mockFetchPublicationInsightsAgent).toHaveBeenCalledWith('test-session-token', {
        windowId: 'all',
        scope: 'section',
        sectionKey: 'publication_volume_over_time',
      })
    })

    await waitFor(() => {
      expect(screen.getByText('Long-run rise, quieter recent window')).toBeInTheDocument()
    })
    expect(screen.getByText(/The recent 12-month window through the end of February 2026 is lighter/i)).toBeInTheDocument()
    expect(screen.getByText('Open trajectory')).toBeInTheDocument()
  })

  it('renders adaptive article-type guidance from the full record and recent windows', async () => {
    const tile = buildTotalPublicationsTile({
      drilldown: {
        ...buildTotalPublicationsTile().drilldown,
        as_of_date: '2026-03-08',
        publications: [
          { work_id: 'w1', year: 2021, title: 'Paper 1', journal: 'Journal A', work_type: 'journal-article', article_type: 'original-article' },
          { work_id: 'w2', year: 2022, title: 'Paper 2', journal: 'Journal B', work_type: 'journal-article', article_type: 'original-article' },
          { work_id: 'w3', year: 2023, title: 'Paper 3', journal: 'Journal A', work_type: 'journal-article', article_type: 'original-article' },
          { work_id: 'w4', year: 2024, title: 'Paper 4', journal: 'Journal C', work_type: 'journal-article', article_type: 'original-article' },
          { work_id: 'w5', year: 2024, title: 'Paper 5', journal: 'Journal C', work_type: 'review-article', article_type: 'review-article' },
          { work_id: 'w6', year: 2025, title: 'Paper 6', journal: 'Journal C', work_type: 'review-article', article_type: 'review-article' },
          { work_id: 'w7', year: 2026, title: 'Paper 7', journal: 'Journal C', work_type: 'review-article', article_type: 'review-article' },
        ],
      },
    })
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

    const module = document.querySelector('[data-ui="publication-article-type-over-time"]')
    expect(module).not.toBeNull()

    const helpButton = within(module as HTMLElement).getByRole('button', { name: 'Explain Type of Articles Published Over Time' })
    expect(helpButton.className).toContain('--tone-positive-200')
    fireEvent.mouseEnter(helpButton)
    fireEvent.focus(helpButton)

    await waitFor(() => {
      expect(screen.getAllByText(/How has my mix of article types changed over time\?/i).length).toBeGreaterThan(0)
    })
    expect(screen.getAllByText(/Original research stays central, but review article now runs much closer in the recent windows\./i).length).toBeGreaterThan(0)
    expect(screen.getAllByText(/Original research leads the full record with 4 of 7 publications \(57%\), ahead of Review article at 43%\./i).length).toBeGreaterThan(0)
    expect(screen.getAllByText('The 5-year window still keeps original research at the top, but review article now runs alongside it much more closely than across the full record.').length).toBeGreaterThan(0)
    expect(screen.getAllByText(/Using rolling data to the end of Feb 2026\./i).length).toBeGreaterThan(0)
  })

  it('renders adaptive publication-type guidance from the full record and recent windows', async () => {
    const tile = buildTotalPublicationsTile({
      drilldown: {
        ...buildTotalPublicationsTile().drilldown,
        as_of_date: '2026-03-08',
        publications: [
          { work_id: 'w1', year: 2021, title: 'Paper 1', journal: 'Journal A', work_type: 'journal-article', article_type: 'original-article' },
          { work_id: 'w2', year: 2022, title: 'Paper 2', journal: 'Journal B', work_type: 'journal-article', article_type: 'original-article' },
          { work_id: 'w3', year: 2023, title: 'Paper 3', journal: 'Journal A', work_type: 'journal-article', article_type: 'original-article' },
          { work_id: 'w4', year: 2024, title: 'Paper 4', journal: 'Journal C', work_type: 'journal-article', article_type: 'original-article' },
          { work_id: 'w5', year: 2024, title: 'Paper 5', journal: 'Proceedings A', work_type: 'conference-paper', article_type: 'review-article' },
          { work_id: 'w6', year: 2025, title: 'Paper 6', journal: 'Proceedings B', work_type: 'conference-paper', article_type: 'review-article' },
          { work_id: 'w7', year: 2026, title: 'Paper 7', journal: 'Proceedings C', work_type: 'conference-paper', article_type: 'review-article' },
        ],
      },
    })
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

    const module = document.querySelector('[data-ui="publication-type-over-time"]')
    expect(module).not.toBeNull()

    const helpButton = within(module as HTMLElement).getByRole('button', { name: 'Explain Type of Publications Published Over Time' })
    expect(helpButton.className).toContain('--tone-positive-200')
    fireEvent.mouseEnter(helpButton)
    fireEvent.focus(helpButton)

    await waitFor(() => {
      expect(screen.getAllByText(/How has my mix of publication types changed over time\?/i).length).toBeGreaterThan(0)
      expect(screen.getAllByText(/Journal article leads the full record with 4 of 7 publications \(57%\), ahead of abstract at 43%\./i).length).toBeGreaterThan(0)
    })
    expect(screen.getAllByText(/Journal article stays central, but abstract now runs much closer in the recent windows\./i).length).toBeGreaterThan(0)
    expect(screen.getAllByText('The 5-year window still keeps journal article at the top, but abstract now runs alongside it much more closely than across the full record.').length).toBeGreaterThan(0)
    expect(screen.getAllByText(/Using rolling data to the end of Feb 2026\./i).length).toBeGreaterThan(0)
  })

  it('opens the article-type-over-time insight and requests the whole section read', async () => {
    const tile = buildTotalPublicationsTile({
      drilldown: {
        ...buildTotalPublicationsTile().drilldown,
        as_of_date: '2026-03-08',
        publications: [
          { work_id: 'w1', year: 2021, title: 'Paper 1', journal: 'Journal A', work_type: 'journal-article', article_type: 'original-article' },
          { work_id: 'w2', year: 2022, title: 'Paper 2', journal: 'Journal B', work_type: 'journal-article', article_type: 'original-article' },
          { work_id: 'w3', year: 2023, title: 'Paper 3', journal: 'Journal A', work_type: 'journal-article', article_type: 'original-article' },
          { work_id: 'w4', year: 2024, title: 'Paper 4', journal: 'Journal C', work_type: 'review-article', article_type: 'review-article' },
          { work_id: 'w5', year: 2025, title: 'Paper 5', journal: 'Journal C', work_type: 'review-article', article_type: 'review-article' },
          { work_id: 'w6', year: 2026, title: 'Paper 6', journal: 'Journal C', work_type: 'review-article', article_type: 'review-article' },
        ],
      },
    })
    const { container } = render(
      <PublicationsTopStrip
        metrics={buildMetricsPayload(tile)}
        loading={false}
        token="test-session-token"
        forceInsightsVisible
      />,
    )

    const metricTile = container.querySelector('[data-metric-key="this_year_vs_last"]')
    expect(metricTile).not.toBeNull()
    fireEvent.click(metricTile as HTMLElement)

    const module = document.querySelector('[data-ui="publication-article-type-over-time"]')
    expect(module).not.toBeNull()

    await waitFor(() => {
      expect(within(module as HTMLElement).getByRole('button', { name: 'Open publication article type over time insight' })).toBeInTheDocument()
    })
    fireEvent.click(within(module as HTMLElement).getByRole('button', { name: 'Open publication article type over time insight' }))

    await waitFor(() => {
      expect(mockFetchPublicationInsightsAgent).toHaveBeenCalledWith('test-session-token', {
        windowId: 'all',
        scope: 'section',
        sectionKey: 'publication_article_type_over_time',
      })
    })
    expect(mockFetchPublicationInsightsAgent).toHaveBeenCalledTimes(1)

    await waitFor(() => {
      expect(screen.getByText('Recent mix shift')).toBeInTheDocument()
    })
    expect(screen.getByText(/original articles still lead the long-run mix/i)).toBeInTheDocument()
    expect(screen.getByText('Open context')).toBeInTheDocument()
  })

  it('opens the publication-type-over-time insight and requests the whole section read', async () => {
    const tile = buildTotalPublicationsTile({
      drilldown: {
        ...buildTotalPublicationsTile().drilldown,
        as_of_date: '2026-03-08',
        publications: [
          { work_id: 'w1', year: 2021, title: 'Paper 1', journal: 'Journal A', work_type: 'journal-article', article_type: 'original-article' },
          { work_id: 'w2', year: 2022, title: 'Paper 2', journal: 'Journal B', work_type: 'journal-article', article_type: 'original-article' },
          { work_id: 'w3', year: 2023, title: 'Paper 3', journal: 'Journal A', work_type: 'journal-article', article_type: 'original-article' },
          { work_id: 'w4', year: 2024, title: 'Paper 4', journal: 'Journal C', work_type: 'review-article', article_type: 'review-article' },
          { work_id: 'w5', year: 2025, title: 'Paper 5', journal: 'Journal C', work_type: 'review-article', article_type: 'review-article' },
          { work_id: 'w6', year: 2026, title: 'Paper 6', journal: 'Journal C', work_type: 'review-article', article_type: 'review-article' },
        ],
      },
    })
    const { container } = render(
      <PublicationsTopStrip
        metrics={buildMetricsPayload(tile)}
        loading={false}
        token="test-session-token"
        forceInsightsVisible
      />,
    )

    const metricTile = container.querySelector('[data-metric-key="this_year_vs_last"]')
    expect(metricTile).not.toBeNull()
    fireEvent.click(metricTile as HTMLElement)

    const module = document.querySelector('[data-ui="publication-type-over-time"]')
    expect(module).not.toBeNull()

    await waitFor(() => {
      expect(within(module as HTMLElement).getByRole('button', { name: 'Open publication type over time insight' })).toBeInTheDocument()
    })
    fireEvent.click(within(module as HTMLElement).getByRole('button', { name: 'Open publication type over time insight' }))

    await waitFor(() => {
      expect(mockFetchPublicationInsightsAgent).toHaveBeenCalledWith('test-session-token', {
        windowId: 'all',
        scope: 'section',
        sectionKey: 'publication_type_over_time',
      })
    })
    expect(mockFetchPublicationInsightsAgent).toHaveBeenCalledTimes(1)

    await waitFor(() => {
      expect(screen.getByText('Recent mix shift')).toBeInTheDocument()
    })
    expect(screen.getByText(/journal articles still lead the long-run mix/i)).toBeInTheDocument()
    expect(screen.getByText('Open context')).toBeInTheDocument()
  })

  it('renders x-axis gridlines on the year-over-year trajectory chart', async () => {
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

    fireEvent.click(screen.getByRole('tab', { name: 'Trajectory' }))

    expect(screen.getByText('Year-over-year trajectory')).toBeInTheDocument()
    await waitFor(() => {
      expect(document.querySelectorAll('[data-ui="publication-trajectory-grid-x"]')).toHaveLength(3)
    })
  })

  it('renders compact trajectory guidance from the current slider range', async () => {
    const yearlyCounts = [
      [2016, 1],
      [2017, 1],
      [2018, 16],
      [2019, 8],
      [2020, 8],
      [2021, 19],
      [2022, 11],
      [2023, 14],
      [2024, 19],
      [2025, 4],
      [2026, 1],
    ] as const
    const publications = yearlyCounts.flatMap(([year, count]) => (
      Array.from({ length: count }, (_, index) => ({
        work_id: `traj-${year}-${index + 1}`,
        year,
        title: `Trajectory paper ${year}-${index + 1}`,
        journal: `Journal ${year}`,
        work_type: 'journal-article',
        article_type: 'original-article',
      }))
    ))
    const tile = buildTotalPublicationsTile({
      drilldown: {
        ...buildTotalPublicationsTile().drilldown,
        as_of_date: '2026-03-08',
        publications,
      },
    })
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
    fireEvent.click(screen.getByRole('tab', { name: 'Trajectory' }))

    const module = document.querySelector('[data-ui="publication-year-over-year-trajectory"]')
    expect(module).not.toBeNull()

    const helpButton = within(module as HTMLElement).getByRole('button', { name: 'Explain year-over-year trajectory' })
    expect(helpButton.className).toContain('--tone-danger-200')
    fireEvent.mouseEnter(helpButton)
    fireEvent.focus(helpButton)

    await waitFor(() => {
      expect(screen.getAllByText(/How should I read my year-over-year trajectory\?/i).length).toBeGreaterThan(0)
    })
    expect(screen.getAllByText(/Contracting over 2022 - 2026/i).length).toBeGreaterThan(0)
    expect(screen.getAllByText(/Volatility is moderate/i).length).toBeGreaterThan(0)
    expect(screen.getAllByText(/Slope is falling/i).length).toBeGreaterThan(0)
    expect(screen.getAllByText(/Counts ranged from 1 to 19 across 2022 - 2026/i).length).toBeGreaterThan(0)
    expect(document.body).toHaveTextContent(/2024\s*-\s*2026 averaged 8 publications per year versus 13 in 2022\s*-\s*2023/i)
    expect(screen.getAllByText(/Using 2022 - 2026 from the slider\. Raw, moving average, and cumulative all update together\./i).length).toBeGreaterThan(0)
  })

  it('renders the total-publications context panels', () => {
    const tile = buildTotalPublicationsTile({
      drilldown: {
        ...buildTotalPublicationsTile().drilldown,
        publications: [
          { work_id: 'w1', year: 2021, title: 'Paper 1', journal: 'Journal A', work_type: 'journal-article', article_type: 'original-article' },
          { work_id: 'w2', year: 2022, title: 'Paper 2', journal: 'Journal B', work_type: 'review-article', article_type: 'review-article' },
          { work_id: 'w3', year: 2023, title: 'Paper 3', journal: 'Journal A', work_type: 'journal-article', article_type: 'original-article' },
          { work_id: 'w4', year: 2024, title: 'Paper 4', journal: 'Journal C', work_type: 'journal-article', article_type: 'original-article' },
          { work_id: 'w5', year: 2025, title: 'Paper 5', journal: 'Journal C', work_type: 'journal-article', article_type: 'original-article' },
        ],
      },
    })
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

    fireEvent.click(screen.getByRole('tab', { name: 'Context' }))

    expect(screen.getByText('Portfolio maturity')).toBeInTheDocument()
    expect(screen.getByText('Recent vs earlier output')).toBeInTheDocument()
    expect(screen.getByText('Composition shift')).toBeInTheDocument()
    expect(screen.getByText('Dimension')).toBeInTheDocument()
    expect(screen.getByText('Publication type')).toBeInTheDocument()
  })
})
