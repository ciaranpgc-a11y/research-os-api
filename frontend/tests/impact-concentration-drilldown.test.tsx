import { fireEvent, render, screen, within } from '@testing-library/react'
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

function buildImpactConcentrationTile(overrides: Partial<PublicationMetricTilePayload> = {}): PublicationMetricTilePayload {
  return {
    id: 'tile-impact-concentration',
    key: 'impact_concentration',
    label: 'Impact concentration',
    main_value: 41.24,
    value: 41.24,
    main_value_display: '41%',
    value_display: '41%',
    delta_value: null,
    delta_display: null,
    delta_direction: 'na',
    delta_tone: 'neutral',
    delta_color_code: '#475569',
    unit: '%',
    subtext: 'Breakthrough-skewed',
    badge: {},
    chart_type: 'donut',
    chart_data: {
      values: [600, 858],
      gini_coefficient: 0.78,
      top_papers_count: 3,
      remaining_papers_count: 94,
      uncited_publications_count: 28,
      uncited_publications_pct: 29,
    },
    sparkline: [41],
    sparkline_overlay: [],
    tooltip: 'Share of citations from the top cited papers',
    tooltip_details: {},
    data_source: ['OpenAlex'],
    confidence_score: 0.92,
    stability: 'stable',
    drilldown: {
      title: 'Impact concentration',
      definition: 'Share of total lifetime citations attributable to the top cited publications.',
      formula: 'top cited publication citations / total citations',
      confidence_note: 'Provider-synced',
      metadata: {
        intermediate_values: {
          concentration_pct: 41.24,
          classification: 'Breakthrough-skewed',
          gini_coefficient: 0.78,
          top3_citations: 600,
          rest_citations: 858,
          total_citations: 1458,
          top_papers_count: 3,
          remaining_papers_count: 94,
          total_publications: 97,
          uncited_publications_count: 28,
          uncited_publications_pct: 29,
        },
      },
      publications: [
        { work_id: 'w-1', title: 'Leading citation paper', year: 2020, citations_lifetime: 300, publication_type: 'journal article' },
        { work_id: 'w-2', title: 'Second citation paper', year: 2021, citations_lifetime: 200, publication_type: 'journal article' },
        { work_id: 'w-3', title: 'Third citation paper', year: 2022, citations_lifetime: 100, publication_type: 'journal article' },
        { work_id: 'w-4', title: 'Long tail paper A', year: 2023, citations_lifetime: 30, publication_type: 'journal article' },
        { work_id: 'w-5', title: 'Long tail paper B', year: 2024, citations_lifetime: 20, publication_type: 'journal article' },
        { work_id: 'w-6', title: 'Uncited paper', year: 2025, citations_lifetime: 0, publication_type: 'journal article' },
      ],
    },
    ...overrides,
  }
}

function buildMetricsPayload(tile: PublicationMetricTilePayload): PublicationsTopMetricsPayload {
  return {
    tiles: [tile],
    data_sources: ['OpenAlex'],
    data_last_refreshed: '2026-05-31T10:00:00Z',
    metadata: {},
    computed_at: '2026-05-31T10:00:00Z',
    status: 'READY',
    is_stale: false,
    is_updating: false,
    last_error: null,
  }
}

function renderImpactConcentrationDrilldown() {
  const result = render(
    <PublicationsTopStrip
      metrics={buildMetricsPayload(buildImpactConcentrationTile())}
      token="test-token"
    />,
  )
  const metricTile = result.container.querySelector('[data-metric-key="impact_concentration"]')
  expect(metricTile).not.toBeNull()
  fireEvent.click(metricTile as HTMLElement)
  return result
}

describe('Impact concentration drilldown', () => {
  beforeEach(() => {
    mockFetchPublicationInsightsAgent.mockReset()
    mockPingApiHealth.mockReset()
    mockPingApiHealth.mockResolvedValue({ status: 'ok', publication_insights_available: true })
  })

  it('uses metric-specific tabs aligned to the completed publication drilldowns', () => {
    renderImpactConcentrationDrilldown()

    expect(screen.getByRole('tab', { name: 'Summary' })).toBeInTheDocument()
    expect(screen.getByRole('tab', { name: 'Drivers' })).toBeInTheDocument()
    expect(screen.getByRole('tab', { name: 'Distribution' })).toBeInTheDocument()
    expect(screen.getByRole('tab', { name: 'Profile' })).toBeInTheDocument()
    expect(screen.getByRole('tab', { name: 'Methods' })).toBeInTheDocument()
    expect(screen.queryByRole('tab', { name: 'Breakdown' })).not.toBeInTheDocument()
    expect(screen.queryByRole('tab', { name: 'Trajectory' })).not.toBeInTheDocument()
    expect(screen.queryByRole('tab', { name: 'Context' })).not.toBeInTheDocument()
  })

  it('keeps the dashboard tile as the existing donut visual', () => {
    const result = render(
      <PublicationsTopStrip
        metrics={buildMetricsPayload(buildImpactConcentrationTile())}
        token="test-token"
      />,
    )

    const metricTile = result.container.querySelector('[data-metric-key="impact_concentration"]')
    expect(metricTile).not.toBeNull()
    expect(metricTile?.querySelector('svg[data-stop-tile-open="true"]')).not.toBeNull()
    expect(within(metricTile as HTMLElement).queryByText('Top cited set')).not.toBeInTheDocument()
  })

  it('uses compact summary tiles and leaves paper rows to the drivers tab', () => {
    renderImpactConcentrationDrilldown()

    const dialog = screen.getByRole('dialog')
    expect(within(dialog).getByText('Impact concentration overview')).toBeInTheDocument()
    expect(within(dialog).getByText('Top 3 share')).toBeInTheDocument()
    expect(within(dialog).getByText('Long-tail share')).toBeInTheDocument()
    expect(within(dialog).getByText('Gini coefficient')).toBeInTheDocument()
    expect(within(dialog).getByText('Uncited papers')).toBeInTheDocument()
    expect(within(dialog).getByText('Top 3 vs long tail')).toBeInTheDocument()
    expect(within(dialog).queryByText('Concentration readout')).not.toBeInTheDocument()
    expect(within(dialog).queryByText('Top concentration drivers')).not.toBeInTheDocument()
    expect(within(dialog).queryByText('Leading citation paper')).not.toBeInTheDocument()
    expect(within(dialog).queryByText(/portfolio-shape view/i)).not.toBeInTheDocument()
    expect(within(dialog).queryByText('Approved story')).not.toBeInTheDocument()
    expect(within(dialog).queryByText('Concentration curve')).not.toBeInTheDocument()
  })

  it('keeps the drivers tab compact and unclipped', () => {
    renderImpactConcentrationDrilldown()

    fireEvent.click(screen.getByRole('tab', { name: 'Drivers' }))

    const dialog = screen.getByRole('dialog')
    expect(within(dialog).getByText('Top concentration drivers')).toBeInTheDocument()
    expect(within(dialog).getByText('Top paper share')).toBeInTheDocument()
    expect(within(dialog).getByText('Top 3 share')).toBeInTheDocument()
    expect(within(dialog).getByText('Driver papers')).toBeInTheDocument()
    expect(within(dialog).getByText('Leading citation paper')).toBeInTheDocument()
    expect(within(dialog).queryByText('Concentration ladder')).not.toBeInTheDocument()
    expect(within(dialog).queryByText('Type')).not.toBeInTheDocument()
    expect(within(dialog).queryByText(/portfolio concentration is driven/i)).not.toBeInTheDocument()
    expect(within(dialog).queryByText(/table identifies the papers/i)).not.toBeInTheDocument()
  })
})
