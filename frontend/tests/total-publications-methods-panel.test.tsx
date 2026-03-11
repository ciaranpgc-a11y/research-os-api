import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { PublicationsTopStrip } from '@/components/publications/PublicationsTopStrip'
import type { PersonaJournal, PublicationMetricTilePayload, PublicationsTopMetricsPayload } from '@/types/impact'

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
            { key: 'open_access', label: 'open access', value: 15, share_pct: 62.5, avg_citations: 10.3 },
            { key: 'closed', label: 'closed', value: 9, share_pct: 37.5, avg_citations: 7.6 },
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
    mockPingApiHealth.mockResolvedValue({ status: 'ok', publication_insights_available: true })
    mockFetchPublicationInsightsAgent.mockImplementation((_token: string, options?: { sectionKey?: string }) => Promise.resolve(
      options?.sectionKey === 'publication_year_over_year_trajectory'
        ? {
          overall_summary: 'The later run now sits below the stronger years that came before it.',
          sections: [
            {
              key: 'publication_year_over_year_trajectory',
              title: 'Year-over-year trajectory',
              headline: 'Stronger run, then a pullback',
              body: 'Across complete years from 2016-2025, output peaked at 19 in 2021 and 2024 before falling to 4 in 2025. The last 12 months to Feb 2026 contain 2 publications, below the trailing 3-year pace of 11.3/year.',
              blocks: [
                {
                  kind: 'callout',
                  label: 'Confidence note',
                  text: 'The main read is anchored to complete years, with the rolling live window used only as recent context.',
                },
              ],
              evidence: {
                trajectory: 'contracting',
                trajectory_phase_label: 'contracting',
                rolling_cutoff_label: 'Feb 2026',
              },
            },
          ],
          provenance: {
            generated_at: '2026-03-08T10:00:00Z',
          },
        }
        : options?.sectionKey === 'publication_volume_over_time'
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
              blocks: [
                {
                  kind: 'callout',
                  label: 'Recent build',
                  text: 'The recent complete years carry more output than an even spread across the publication span would imply.',
                },
              ],
              evidence: {
                phase: 'accelerating',
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
              blocks: [
                {
                  kind: 'callout',
                  label: 'Confidence',
                  text: 'Because the latest 1-year view is both partial and small, it is better read as an early tilt than a fixed replacement of the full-record mix.',
                },
              ],
              evidence: {
                span_years_label: '2021-2026',
                mix_pattern: 'leader_shift',
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
              blocks: [
                {
                  kind: 'callout',
                  label: 'Confidence',
                  text: 'Because the latest 1-year view is both partial and small, it is better read as an early tilt than a fixed replacement of the full-record mix.',
                },
              ],
              evidence: {
                span_years_label: '2021-2026',
                mix_pattern: 'leader_shift',
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
              blocks: [
                {
                  kind: 'callout',
                  label: 'How to use it',
                  text: 'Open trajectory if you want to see exactly where the quieter and stronger years occur.',
                },
              ],
              evidence: {
                pattern: 'continuous growth',
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
    expect(within(tabPanel).getAllByText('Placeholder').length).toBeGreaterThan(0)
    const summarySection = within(tabPanel).getByText('Summary').closest('.house-publications-drilldown-bounded-section') as HTMLElement | null
    expect(summarySection).not.toBeNull()
    const summaryContent = summarySection?.querySelector('.house-drilldown-content-block.house-drilldown-heading-content-block') as HTMLElement | null
    expect(summaryContent).not.toBeNull()
    expect(summaryContent).toHaveClass('space-y-3', 'px-3', 'py-3')
    expect(within(summarySection as HTMLElement).getByRole('button', { name: 'Toggle summary methods placeholder' })).toBeInTheDocument()
    expect(summaryContent?.firstElementChild).toHaveTextContent('Placeholder')
  })

  it('uses persona journal library metrics in the journal breakdown table', () => {
    const tile = buildTotalPublicationsTile()
    const personaJournals: PersonaJournal[] = [
      {
        journal_key: 'journal-a',
        display_name: 'Journal A',
        publisher: 'Publisher A',
        publication_count: 3,
        share_pct: 50,
        avg_citations: 12.4,
        median_citations: 10,
        total_citations: 37,
        publisher_reported_impact_factor: 7.12,
        journal_citation_indicator: 2.34,
      },
      {
        journal_key: 'journal-b',
        display_name: 'Journal B',
        publisher: 'Publisher B',
        publication_count: 2,
        share_pct: 33.3,
        avg_citations: 9.1,
        median_citations: 8,
        total_citations: 18,
        publisher_reported_impact_factor: 5.43,
        journal_citation_indicator: 1.21,
      },
    ]

    const { container } = render(
      <PublicationsTopStrip
        metrics={buildMetricsPayload(tile)}
        personaJournals={personaJournals}
        loading={false}
        forceInsightsVisible
      />,
    )

    const metricTile = container.querySelector('[data-metric-key="this_year_vs_last"]')
    expect(metricTile).not.toBeNull()
    fireEvent.click(metricTile as HTMLElement)
    fireEvent.click(screen.getByRole('tab', { name: 'Breakdown' }))

    const journalsHeading = screen.getByText('Which journals have I published in?')
    const journalsSection = journalsHeading.closest('.house-drilldown-heading-block')?.nextElementSibling as HTMLElement | null
    expect(journalsSection).not.toBeNull()
    expect(within(journalsSection as HTMLElement).queryByText('Share')).toBeNull()
    expect(within(journalsSection as HTMLElement).queryByText('Median cites')).toBeNull()
    expect(within(journalsSection as HTMLElement).getByText('JIF')).toBeInTheDocument()
    expect(within(journalsSection as HTMLElement).getByText('JCI')).toBeInTheDocument()

    const rows = within(journalsSection as HTMLElement).getAllByRole('row')
    const journalARowCells = within(rows[1]).getAllByRole('cell')
    expect(journalARowCells).toHaveLength(5)
    expect(journalARowCells[0]).toHaveTextContent('Journal A')
    expect(journalARowCells[1]).toHaveTextContent('3')
    expect(journalARowCells[2]).toHaveTextContent('12.4')
    expect(journalARowCells[3]).toHaveTextContent('7.1')
    expect(journalARowCells[4]).toHaveTextContent('2.34')
    expect(journalARowCells[1]).toHaveClass('text-center')
    expect(journalARowCells[2]).toHaveClass('text-center')
    expect(journalARowCells[3]).toHaveClass('text-center')
    expect(journalARowCells[4]).toHaveClass('text-center')
  })

  it('title-cases OA status labels in the breakdown table', () => {
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
    fireEvent.click(screen.getByRole('tab', { name: 'Breakdown' }))

    const oaHeading = screen.getByText('What open access statuses have I published in?')
    const oaSection = oaHeading.closest('.house-drilldown-heading-block')?.nextElementSibling as HTMLElement | null
    expect(oaSection).not.toBeNull()
    expect(within(oaSection as HTMLElement).getByText('Open Access')).toBeInTheDocument()
    expect(within(oaSection as HTMLElement).getByText('Closed')).toBeInTheDocument()
    expect(within(oaSection as HTMLElement).queryByText('open access')).toBeNull()
    expect(within(oaSection as HTMLElement).queryByText('closed')).toBeNull()
  })

  it('renders the publication production pattern module and updates when the year scope changes', () => {
    const baseTile = buildTotalPublicationsTile()
    const lifetimeMonthLabels = Array.from({ length: 60 }, (_value, index) => {
      const month = new Date(Date.UTC(2021, 2 + index, 1))
      return month.toISOString().slice(0, 10)
    })
    const monthlyValuesLifetime = Array.from({ length: 60 }, () => 0)
    ;[
      '2021-04-01',
      '2021-10-01',
      '2022-03-01',
      '2022-06-01',
      '2022-09-01',
      '2022-12-01',
      '2023-03-01',
      '2023-05-01',
      '2023-07-01',
      '2023-09-01',
      '2023-11-01',
      '2024-01-01',
      '2024-03-01',
      '2024-05-01',
      '2024-07-01',
      '2024-09-01',
      '2024-11-01',
      '2025-03-01',
      '2025-04-01',
      '2025-06-01',
      '2025-08-01',
      '2025-10-01',
      '2025-11-01',
      '2025-12-01',
      '2026-01-01',
    ].forEach((monthLabel) => {
      const monthIndex = lifetimeMonthLabels.indexOf(monthLabel)
      if (monthIndex >= 0) {
        monthlyValuesLifetime[monthIndex] += 1
      }
    })

    const tile = buildTotalPublicationsTile({
      main_value: 9,
      value: 9,
      main_value_display: '9',
      value_display: '9',
      chart_data: {
        ...baseTile.chart_data,
        years: [2021, 2022, 2023, 2024, 2025, 2026],
        values: [1, 2, 0, 3, 1, 2],
        monthly_values_lifetime: monthlyValuesLifetime,
        month_labels_lifetime: lifetimeMonthLabels,
        lifetime_month_start: '2021-03-01',
        projected_year: 2026,
        current_year_ytd: 1,
      },
      sparkline: [1, 2, 0, 3, 1, 2],
      drilldown: {
        ...baseTile.drilldown,
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
    expect(within(phaseTile as HTMLElement).getByText('Publication pace')).toBeInTheDocument()
    expect(within(phaseTile as HTMLElement).queryByText('Through Feb 2026')).toBeNull()
    expect(within(phaseTile as HTMLElement).queryByText('Lifetime trend slope')).toBeNull()
    expect(within(phaseTile as HTMLElement).getByText('2')).toBeInTheDocument()
    expect(within(phaseTile as HTMLElement).getByText('Last 12 months')).toBeInTheDocument()
    expect(within(phaseTile as HTMLElement).getByText('6.3/year')).toBeInTheDocument()
    expect(within(phaseTile as HTMLElement).getByText('Last 3 years')).toBeInTheDocument()
    expect(within(phaseTile as HTMLElement).getByText('1.5/year')).toBeInTheDocument()
    expect(within(phaseTile as HTMLElement).getByText('Prior 2 years')).toBeInTheDocument()
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
      expect(screen.getAllByText(/Median annual output is 10 publications per year \(IQR 5-16\)\./i).length).toBeGreaterThan(0)
    })
    expect(screen.getAllByText(/The record opens quietly, builds into repeated peaks, and then drops back to 4 in 2025\./i).length).toBeGreaterThan(0)
    expect(screen.getAllByText(/Peak years run at about .*typical year in the record\./i).length).toBeGreaterThan(0)
    expect(screen.getAllByText(/There are no gap years/i).length).toBeGreaterThan(0)
    expect(screen.getAllByText(/the story is about changing pace rather than breaks in activity\./i).length).toBeGreaterThan(0)
    expect(
      screen.getAllByText((_content, element) => {
        const text = element?.textContent ?? ''
        return text.includes('2018') && text.includes('2021') && text.includes('2024') && text.includes('stronger run')
      }).length,
    ).toBeGreaterThan(0)
    expect(
      screen.getAllByText((_content, element) => {
        const text = element?.textContent ?? ''
        const describesPeakTiming =
          text.includes('high points')
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
      expect(mockFetchPublicationInsightsAgent).toHaveBeenCalledWith('test-session-token', expect.objectContaining({
        windowId: 'all',
        scope: 'section',
        sectionKey: 'publication_output_pattern',
        uiContext: expect.stringMatching(/\S/),
      }))
    })

    await waitFor(() => {
      expect(screen.getByText('Output pattern')).toBeInTheDocument()
    })
    expect(screen.getByText('Your quieter years sit early in the publication span, while later years carry the strongest output.')).toBeInTheDocument()
    expect(screen.getByText('How to use it')).toBeInTheDocument()
    expect(screen.getByText('Open trajectory if you want to see exactly where the quieter and stronger years occur.')).toBeInTheDocument()
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
      expect(mockFetchPublicationInsightsAgent).toHaveBeenCalledWith('test-session-token', expect.objectContaining({
        windowId: 'all',
        scope: 'section',
        sectionKey: 'publication_production_phase',
        uiContext: expect.stringMatching(/\S/),
      }))
    })

    await waitFor(() => {
      expect(screen.getByText('Build from early base')).toBeInTheDocument()
    })
    expect(screen.getByText('The fitted slope is still upward and the quietest years sit at the start of the span rather than the end.')).toBeInTheDocument()
    expect(screen.getByText('With no gap years and a heavier recent share of output, this reads as cumulative build-up rather than a stable mature pattern.')).toBeInTheDocument()
    expect(screen.getByText('Recent build')).toBeInTheDocument()
    expect(screen.getByText('The recent complete years carry more output than an even spread across the publication span would imply.')).toBeInTheDocument()
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
      expect(screen.getAllByText(/Your higher publication output is no longer being sustained\./i).length).toBeGreaterThan(0)
    })
    expect(screen.getAllByText(/Across the full publication span, output peaked in 2021 and 2024 at 19 publications, then fell to 4 in 2025\./i).length).toBeGreaterThan(0)
    expect(document.body).toHaveTextContent(/last 12 months \(2 publications\)/i)
    expect(document.body).toHaveTextContent(/trailing 3-year pace \(1\.3\/year\)/i)
    expect(document.body).toHaveTextContent(/prior 7 years \(9\.1\/year\)/i)
    expect(document.body).not.toHaveTextContent(/The stage call is anchored to complete years across 2016-2025/i)
    expect(screen.getAllByText(/Using rolling data to the end of Feb 2026\./i).length).toBeGreaterThan(0)
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
      expect(mockFetchPublicationInsightsAgent).toHaveBeenCalledWith('test-session-token', expect.objectContaining({
        windowId: 'all',
        scope: 'section',
        sectionKey: 'publication_volume_over_time',
        uiContext: expect.stringMatching(/\S/),
      }))
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
    expect(screen.getAllByText(/Original research leads the full span with 4 of 7 publications \(57%\), ahead of Review article at 43%\./i).length).toBeGreaterThan(0)
    expect(screen.getAllByText('The 5-year window still keeps original research at the top, but review article now runs alongside it much more closely than across the full span.').length).toBeGreaterThan(0)
    expect(screen.getAllByText(/Using rolling data to the end of Feb 2026\./i).length).toBeGreaterThan(0)
  })

  it('renders adaptive publication-type guidance from the full span and recent windows', async () => {
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
      expect(screen.getAllByText(/Journal article leads the full span with 4 of 7 publications \(57%\), ahead of published abstract at 43%\./i).length).toBeGreaterThan(0)
    })
    expect(screen.getAllByText(/Journal article stays central, but published abstract now runs much closer in the recent windows\./i).length).toBeGreaterThan(0)
    expect(screen.getAllByText('The 5-year window still keeps journal article at the top, but published abstract now runs alongside it much more closely than across the full span.').length).toBeGreaterThan(0)
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
      expect(mockFetchPublicationInsightsAgent).toHaveBeenCalledWith('test-session-token', expect.objectContaining({
        windowId: 'all',
        scope: 'section',
        sectionKey: 'publication_article_type_over_time',
        uiContext: expect.stringMatching(/\S/),
      }))
    })
    expect(mockFetchPublicationInsightsAgent).toHaveBeenCalledTimes(1)

    await waitFor(() => {
      expect(screen.getByText('Recent mix shift')).toBeInTheDocument()
    })
    expect(screen.getByText(/original articles still lead the long-run mix/i)).toBeInTheDocument()
    expect(screen.getByText('Confidence')).toBeInTheDocument()
    expect(screen.getByText(/better read as an early tilt/i)).toBeInTheDocument()
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
      expect(mockFetchPublicationInsightsAgent).toHaveBeenCalledWith('test-session-token', expect.objectContaining({
        windowId: 'all',
        scope: 'section',
        sectionKey: 'publication_type_over_time',
        uiContext: expect.stringMatching(/\S/),
      }))
    })
    expect(mockFetchPublicationInsightsAgent).toHaveBeenCalledTimes(1)

    await waitFor(() => {
      expect(screen.getByText('Recent mix shift')).toBeInTheDocument()
    })
    expect(screen.getByText(/journal articles still lead the long-run mix/i)).toBeInTheDocument()
    expect(screen.getByText('Confidence')).toBeInTheDocument()
    expect(screen.getByText(/better read as an early tilt/i)).toBeInTheDocument()
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

  it('keeps the trajectory slider selection track aligned and shows a dashed current-year tail', async () => {
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
        work_id: `traj-tail-${year}-${index + 1}`,
        year,
        title: `Trajectory tail paper ${year}-${index + 1}`,
        journal: `Journal ${year}`,
        work_type: 'journal-article',
        article_type: 'original-article',
      }))
    ))
    const tile = buildTotalPublicationsTile({
      chart_data: {
        ...buildTotalPublicationsTile().chart_data,
        years: yearlyCounts.map(([year]) => year),
        values: yearlyCounts.map(([_year, count]) => count),
        projected_year: 2026,
        current_year_ytd: 1,
      },
      sparkline: yearlyCounts.map(([_year, count]) => count),
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

    fireEvent.click(screen.getByRole('button', { name: 'Raw' }))
    const liveSlice = await screen.findByLabelText('Trajectory through Feb 2026: 1 publications')
    expect(liveSlice).toHaveAttribute('aria-label', 'Trajectory through Feb 2026: 1 publications')
    const selectionTrack = document.querySelector('[data-ui="publication-range-selection-track"]') as HTMLElement | null
    expect(selectionTrack).not.toBeNull()
    expect(selectionTrack?.style.left).toContain('calc(')
    expect(selectionTrack?.style.left).toContain('0.5rem')
    await waitFor(() => {
      expect(document.querySelector('[data-ui="publication-trajectory-current-year-segment"]')).not.toBeNull()
    }, { timeout: 2000 })
    const liveTailClip = document.querySelector('[data-ui="publication-trajectory-current-year-clip"]')
    expect(liveTailClip?.getAttribute('x')).toBe('87.5')
  })

  it('renders rolling pace values from monthly publication history', async () => {
    const yearlyCounts = [
      [2022, 11],
      [2023, 14],
      [2024, 19],
      [2025, 4],
      [2026, 1],
    ] as const
    const lifetimeMonthLabels = Array.from({ length: 50 }, (_value, index) => {
      const month = new Date(Date.UTC(2022, index, 1))
      return month.toISOString().slice(0, 10)
    })
    const monthlyValuesLifetime = Array.from({ length: 50 }, () => 0)
    for (let index = 0; index <= 10; index += 1) {
      monthlyValuesLifetime[index] = 1
    }
    monthlyValuesLifetime[12] = 2
    monthlyValuesLifetime[13] = 2
    for (let index = 14; index <= 23; index += 1) {
      monthlyValuesLifetime[index] = 1
    }
    for (let index = 24; index <= 30; index += 1) {
      monthlyValuesLifetime[index] = 2
    }
    for (let index = 31; index <= 35; index += 1) {
      monthlyValuesLifetime[index] = 1
    }
    monthlyValuesLifetime[36] = 2
    monthlyValuesLifetime[37] = 1
    monthlyValuesLifetime[43] = 1
    monthlyValuesLifetime[49] = 1
    const publications = yearlyCounts.flatMap(([year, count]) => (
      Array.from({ length: count }, (_, index) => ({
        work_id: `traj-rolling-${year}-${index + 1}`,
        year,
        title: `Trajectory rolling paper ${year}-${index + 1}`,
        journal: `Journal ${year}`,
        work_type: 'journal-article',
        article_type: 'original-article',
      }))
    ))
    const tile = buildTotalPublicationsTile({
      chart_data: {
        ...buildTotalPublicationsTile().chart_data,
        years: yearlyCounts.map(([year]) => year),
        values: yearlyCounts.map(([_year, count]) => count),
        monthly_values_lifetime: monthlyValuesLifetime,
        month_labels_lifetime: lifetimeMonthLabels,
        lifetime_month_start: '2022-01-01',
        projected_year: 2026,
        current_year_ytd: 1,
      },
      sparkline: yearlyCounts.map(([_year, count]) => count),
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

    expect(screen.getByText('Latest complete year')).toBeInTheDocument()
    expect(screen.getByText('Range across complete years')).toBeInTheDocument()
    expect(document.querySelector('[data-ui="publication-trajectory-summary-panel-read"]')).toHaveTextContent('Trajectory')
    expect(screen.getByText('Publications in 2025')).toBeInTheDocument()
    expect(screen.getByText('2022-2025')).toBeInTheDocument()
    expect(screen.getByText('4 to 19')).toBeInTheDocument()
    expect(document.querySelector('[data-ui="publication-trajectory-summary-panel-metrics"]')).toBeInTheDocument()
    expect(document.querySelector('[data-ui="publication-trajectory-summary-panel-read"]')).toBeInTheDocument()
    expect(document.querySelector('[data-ui="publication-trajectory-summary-read-phase"]')).toHaveTextContent('Contracting')

    fireEvent.click(screen.getByRole('button', { name: 'Rolling pace' }))

    expect(await screen.findByLabelText('Rolling 12-month pace ending Dec 2022: 11/year')).toBeInTheDocument()
    expect(screen.getByLabelText('Rolling 36-month pace ending Dec 2025: 12.3/year')).toBeInTheDocument()
    const latestRollingSlice = screen.getByLabelText('Rolling 36-month pace ending Feb 2026: 11.3/year')
    expect(latestRollingSlice).toBeInTheDocument()
    fireEvent.mouseEnter(latestRollingSlice)
    fireEvent.focus(latestRollingSlice)
    await waitFor(() => {
      expect(screen.getAllByText('Rolling 36-month pace').length).toBeGreaterThan(0)
    })
    expect(screen.getAllByText('Ending Feb 2026: 11.3/year').length).toBeGreaterThan(0)
    expect(screen.getByText('Current rolling pace')).toBeInTheDocument()
    expect(screen.getByText('Trailing 36 months to Feb 2026')).toBeInTheDocument()
    expect(screen.getByText('Last 12 months')).toBeInTheDocument()
    expect(screen.getByText('To Feb 2026, below 11.3/year')).toBeInTheDocument()
    expect(screen.queryByText('A stronger run has pulled back.')).not.toBeInTheDocument()
    expect(screen.getByText('Publications/year')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Cumulative' }))
    await waitFor(() => {
      expect(document.querySelector('[data-ui="publication-trajectory-summary-panel-metrics"]')).toHaveTextContent('Cumulative total')
    })
    expect(screen.getByText('Added in last 12 months')).toBeInTheDocument()
    expect(screen.getByText('49')).toBeInTheDocument()
    expect(screen.getByText('Through Feb 2026')).toBeInTheDocument()
    expect(screen.getByText('To Feb 2026')).toBeInTheDocument()
  })

  it('opens the year-over-year trajectory insight and requests the dedicated trajectory section read', async () => {
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
    const lifetimeMonthLabels = Array.from({ length: 38 }, (_value, index) => {
      const month = new Date(Date.UTC(2023, index, 1))
      return month.toISOString().slice(0, 10)
    })
    const monthlyValuesLifetime = Array.from({ length: 38 }, () => 0)
    for (let index = 2; index <= 11; index += 1) {
      monthlyValuesLifetime[index] = 1
    }
    for (let index = 12; index <= 17; index += 1) {
      monthlyValuesLifetime[index] = 2
    }
    for (let index = 18; index <= 22; index += 1) {
      monthlyValuesLifetime[index] = 1
    }
    monthlyValuesLifetime[23] = 2
    monthlyValuesLifetime[24] = 2
    monthlyValuesLifetime[25] = 1
    monthlyValuesLifetime[31] = 1
    monthlyValuesLifetime[37] = 1
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
      chart_data: {
        ...buildTotalPublicationsTile().chart_data,
        years: yearlyCounts.map(([year]) => year),
        values: yearlyCounts.map(([_year, count]) => count),
        monthly_values_lifetime: monthlyValuesLifetime,
        month_labels_lifetime: lifetimeMonthLabels,
        lifetime_month_start: '2023-01-01',
        projected_year: 2026,
        current_year_ytd: 1,
      },
      sparkline: yearlyCounts.map(([_year, count]) => count),
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
        token="test-session-token"
        forceInsightsVisible
      />,
    )

    const metricTile = container.querySelector('[data-metric-key="this_year_vs_last"]')
    expect(metricTile).not.toBeNull()
    fireEvent.click(metricTile as HTMLElement)
    fireEvent.click(screen.getByRole('tab', { name: 'Trajectory' }))

    const module = document.querySelector('[data-ui="publication-year-over-year-trajectory"]')
    expect(module).not.toBeNull()
    const trajectoryHeading = screen.getByText('Year-over-year trajectory').closest('.house-drilldown-heading-block') as HTMLElement | null
    expect(trajectoryHeading).not.toBeNull()
    expect((trajectoryHeading as HTMLElement).firstElementChild).toHaveClass('grid', 'w-full', 'grid-cols-[minmax(0,1fr)_auto]')
    expect(within(module as HTMLElement).queryByRole('button', { name: 'Explain year-over-year trajectory' })).not.toBeInTheDocument()

    await waitFor(() => {
      expect(within(module as HTMLElement).getByRole('button', { name: 'Open year-over-year trajectory insight' })).toBeInTheDocument()
    })
    fireEvent.click(within(module as HTMLElement).getByRole('button', { name: 'Open year-over-year trajectory insight' }))

    await waitFor(() => {
      expect(mockFetchPublicationInsightsAgent).toHaveBeenCalledWith('test-session-token', expect.objectContaining({
        windowId: 'all',
        scope: 'section',
        sectionKey: 'publication_year_over_year_trajectory',
        uiContext: expect.stringMatching(/\S/),
      }))
    })
    await waitFor(() => {
      expect(screen.getByText('Stronger run, then a pullback')).toBeInTheDocument()
    })
    expect(screen.getByText(/Across complete years from 2016-2025, output peaked at 19 in 2021 and 2024 before falling to 4 in 2025\./i)).toBeInTheDocument()
    expect(screen.getByText('Open summary')).toBeInTheDocument()
  })

  it('renders the total-publications context panels', () => {
    const lifetimeMonthLabels = Array.from({ length: 60 }, (_value, index) => {
      const month = new Date(Date.UTC(2021, 2 + index, 1))
      return month.toISOString().slice(0, 10)
    })
    const monthlyValuesLifetime = Array.from({ length: 60 }, () => 0)
    ;[
      0, 4, 8,
      12, 16, 20,
      24, 27, 30, 33, 35,
      36, 37, 40, 41, 44, 45, 47, 49, 51,
      52, 55, 58, 59,
    ].forEach((index) => {
      monthlyValuesLifetime[index] = 1
    })
    const tile = buildTotalPublicationsTile({
      chart_data: {
        years: [2021, 2022, 2023, 2024, 2025, 2026],
        values: [3, 3, 5, 9, 4, 0],
        monthly_values_lifetime: monthlyValuesLifetime,
        month_labels_lifetime: lifetimeMonthLabels,
        lifetime_month_start: '2021-03-01',
        projected_year: 2026,
        current_year_ytd: 0,
      },
      drilldown: {
        ...buildTotalPublicationsTile().drilldown,
        as_of_date: '2026-03-05',
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

    const recentModule = document.querySelector('[data-ui="publication-context-recent-summary-panel-primary"]')?.closest('.house-publications-drilldown-bounded-section') as HTMLElement | null
    expect(recentModule).not.toBeNull()

    expect(screen.queryByText('Portfolio maturity')).not.toBeInTheDocument()
    expect(screen.getByText('Recent vs earlier output')).toBeInTheDocument()
    expect(screen.getByText('Composition shift')).toBeInTheDocument()
    expect(screen.getByText('Dimension')).toBeInTheDocument()
    expect(screen.getByText('Publication type')).toBeInTheDocument()
    expect(screen.queryByText('Recent output is running above the earlier baseline.')).not.toBeInTheDocument()
    expect(within(recentModule as HTMLElement).getByText('Output share')).toBeInTheDocument()
    expect(within(recentModule as HTMLElement).queryByText('Recent share')).not.toBeInTheDocument()
    expect(within(recentModule as HTMLElement).queryByText('Even-spread benchmark')).not.toBeInTheDocument()
    expect(within(recentModule as HTMLElement).getByText('Last 2 years')).toBeInTheDocument()
    expect(within(recentModule as HTMLElement).getByText('Even annual spread')).toBeInTheDocument()
    expect(within(recentModule as HTMLElement).getByText('54%')).toBeInTheDocument()
    expect(within(recentModule as HTMLElement).getByText('40%')).toBeInTheDocument()
    expect(within(recentModule as HTMLElement).getByText('+14.2 pts')).toBeInTheDocument()
    expect(screen.getByText('Difference')).toBeInTheDocument()
    expect(screen.getByText('Recent vs even spread')).toBeInTheDocument()
    expect(document.querySelector('[data-ui="publication-context-recent-summary-panel-primary"]')).toBeInTheDocument()
    expect(document.querySelector('[data-ui="publication-context-recent-summary-panel-difference"]')).toBeInTheDocument()
    expect(document.querySelector('[data-ui="publication-context-recent-view-toggle"]')).toBeInTheDocument()
    expect(within(recentModule as HTMLElement).queryByText('Matched comparison window')).not.toBeInTheDocument()
    expect(within(recentModule as HTMLElement).queryByText('Ending Feb 2026')).not.toBeInTheDocument()
    expect((recentModule as HTMLElement).querySelector('[data-ui="publication-context-comparison-selector"]')).not.toBeNull()
    expect(within(recentModule as HTMLElement).queryByText('Last 2 years vs Prior 2 years')).not.toBeInTheDocument()
    expect(within(recentModule as HTMLElement).getByRole('button', { name: '2y' })).toHaveAttribute('aria-pressed', 'true')
    expect(within(recentModule as HTMLElement).getByRole('button', { name: '1y' })).toHaveAttribute('aria-pressed', 'false')
    expect(within(recentModule as HTMLElement).getByText('54%')).toBeInTheDocument()
    expect(within(recentModule as HTMLElement).getByText('40%')).toBeInTheDocument()
    expect(within(recentModule as HTMLElement).getByText('+14.2 pts')).toBeInTheDocument()
    const recentContentShell = (recentModule as HTMLElement).querySelector('.house-drilldown-heading-content-block') as HTMLElement | null
    expect(recentContentShell).not.toBeNull()
    expect(recentContentShell).toHaveClass('px-3', 'py-3', 'space-y-3')
    fireEvent.click(within(recentModule as HTMLElement).getByRole('button', { name: '1y' }))
    expect(within(recentModule as HTMLElement).getByRole('button', { name: '1y' })).toHaveAttribute('aria-pressed', 'true')
    expect(within(recentModule as HTMLElement).getByText('25%')).toBeInTheDocument()
    expect(within(recentModule as HTMLElement).getByText('20%')).toBeInTheDocument()
    expect(within(recentModule as HTMLElement).getByText('+5 pts')).toBeInTheDocument()
    fireEvent.click(within(recentModule as HTMLElement).getByRole('button', { name: 'Pace' }))
    expect(within(recentModule as HTMLElement).getByText('Publication pace')).toBeInTheDocument()
    expect(within(recentModule as HTMLElement).getByText('Last 12 months vs Prior 12 months')).toBeInTheDocument()
    expect(within(recentModule as HTMLElement).getByText('Recent pace')).toBeInTheDocument()
    expect(within(recentModule as HTMLElement).getByText('Earlier pace')).toBeInTheDocument()
    expect(within(recentModule as HTMLElement).getByText('6.0/year')).toBeInTheDocument()
    expect(within(recentModule as HTMLElement).getByText('7.0/year')).toBeInTheDocument()
    expect(within(recentModule as HTMLElement).getByText('-1.0/year')).toBeInTheDocument()
    expect(within(recentModule as HTMLElement).getByText('Recent vs earlier')).toBeInTheDocument()
    const recentHeading = screen.getByText('Recent vs earlier output').closest('.house-drilldown-heading-block') as HTMLElement | null
    expect(recentHeading).not.toBeNull()
    expect(within(recentHeading as HTMLElement).getByRole('button', { name: 'Explain recent versus earlier output context' })).toBeInTheDocument()
    expect((recentHeading as HTMLElement).firstElementChild).toHaveClass('grid', 'w-full', 'grid-cols-[minmax(0,1fr)_auto]')
  })

  it('renders the recent-versus-earlier context tooltip in the compact format', async () => {
    const tile = buildTotalPublicationsTile({
      chart_data: {
        years: [2021, 2022, 2023, 2024, 2025],
        values: [1, 1, 1, 1, 1],
        projected_year: 2025,
        current_year_ytd: 1,
      },
      sparkline: [1, 1, 1, 1, 1],
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

    const helpButton = screen.getByRole('button', { name: 'Explain recent versus earlier output context' })
    fireEvent.mouseEnter(helpButton)
    fireEvent.focus(helpButton)

    await waitFor(() => {
      expect(screen.getAllByText(/How has recent output shifted\?/i).length).toBeGreaterThan(0)
    })
    expect(screen.getByRole('button', { name: '2y' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getAllByText(/Recent comparison/i).length).toBeGreaterThan(0)
    expect(screen.getAllByText(/This compares last 2 years with prior 2 years and an even-spread benchmark\./i).length).toBeGreaterThan(0)
    expect(screen.getAllByText(/Last 2 years are running at 1\/year versus 1\/year in prior 2 years\./i).length).toBeGreaterThan(0)
    expect(screen.getAllByText(/Based on complete years to end of 2025\./i).length).toBeGreaterThan(0)
    expect(document.body).not.toHaveTextContent(/Comparisons exclude the current partial year/i)
    const tooltipSurface = document.body.querySelector('.house-approved-tooltip') as HTMLElement | null
    expect(tooltipSurface).not.toBeNull()
    expect(tooltipSurface?.className).toContain('sm:w-[25rem]')
    expect(tooltipSurface?.className).toContain('lg:w-[27rem]')
    expect(helpButton.className).toContain('border-[hsl(var(--tone-accent-200))]')
    const helpIcon = helpButton.querySelector('span')
    expect(helpIcon?.className).toContain('text-[hsl(var(--tone-accent-800))]')
  })
})
