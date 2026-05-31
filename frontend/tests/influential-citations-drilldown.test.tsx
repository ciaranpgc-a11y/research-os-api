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

function buildInfluentialCitationsTile(overrides: Partial<PublicationMetricTilePayload> = {}): PublicationMetricTilePayload {
  return {
    id: 'tile-influential-citations',
    key: 'influential_citations',
    label: 'Influential citations',
    main_value: 184,
    value: 184,
    main_value_display: '184',
    value_display: '184',
    delta_value: 12,
    delta_display: '+12',
    delta_direction: 'up',
    delta_tone: 'positive',
    delta_color_code: '#047857',
    unit: 'citations',
    subtext: '12% of citation profile',
    badge: {},
    chart_type: 'line',
    chart_data: {
      values: [18, 31, 54, 91, 128, 184],
      labels: ['2021', '2022', '2023', '2024', '2025', '2026'],
      influential_ratio_pct: 12.4,
    },
    sparkline: [18, 31, 54, 91, 128, 184],
    sparkline_overlay: [],
    tooltip: 'Provider-tagged influential citations',
    tooltip_details: {},
    data_source: ['OpenAlex'],
    confidence_score: 0.9,
    stability: 'stable',
    drilldown: {
      title: 'Influential citations',
      definition: 'Provider-tagged citations that indicate substantive influence.',
      formula: 'influential citations / total citations',
      confidence_note: 'Provider-synced',
      metadata: {
        intermediate_values: {
          influence_total: 184,
          influential_ratio_pct: 12.4,
          influence_last_12m: 42,
          influence_prev_12m: 30,
          influence_delta: 12,
          unknown_year_influential_citations: 5,
        },
      },
      publications: [
        {
          work_id: 'w-1',
          title: 'Primary influential paper',
          venue: 'BMJ Open',
          year: 2022,
          citations_lifetime: 374,
          influential_citations: 74,
          influential_last_12m: 16,
        },
        {
          work_id: 'w-2',
          title: 'Second influential paper',
          venue: 'Medical Education',
          year: 2021,
          citations_lifetime: 129,
          influential_citations: 38,
          influential_last_12m: 11,
        },
        {
          work_id: 'w-3',
          title: 'Third influential paper',
          venue: 'JRSM',
          year: 2020,
          citations_lifetime: 80,
          influential_citations: 12,
          influential_last_12m: 2,
        },
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

function renderInfluentialCitationsTile({
  onOpenPublication,
}: {
  onOpenPublication?: (workId: string) => void
} = {}) {
  const result = render(
    <PublicationsTopStrip
      metrics={buildMetricsPayload(buildInfluentialCitationsTile())}
      token="test-token"
      onOpenPublication={onOpenPublication}
    />,
  )
  const metricTile = result.container.querySelector('[data-metric-key="influential_citations"]')
  expect(metricTile).not.toBeNull()
  return { result, metricTile: metricTile as HTMLElement }
}

function renderInfluentialCitationsDrilldown() {
  const { result, metricTile } = renderInfluentialCitationsTile()
  fireEvent.click(metricTile as HTMLElement)
  return result
}

describe('Influential citations drilldown', () => {
  beforeEach(() => {
    mockFetchPublicationInsightsAgent.mockReset()
    mockPingApiHealth.mockReset()
    mockPingApiHealth.mockResolvedValue({ status: 'ok', publication_insights_available: true })
  })

  it('keeps the metric tile on the compact line visual', () => {
    const { metricTile } = renderInfluentialCitationsTile()

    expect(metricTile.querySelector('.house-toggle-chart-line')).not.toBeNull()
    expect(metricTile.querySelector('[data-ui="influential-citations-trend-bar"]')).toBeNull()
    expect(within(metricTile).queryByText('Mean:')).not.toBeInTheDocument()
    expect(within(metricTile).queryByText('Year')).not.toBeInTheDocument()
  })

  it('uses metric-specific tabs', () => {
    renderInfluentialCitationsDrilldown()

    expect(screen.getByRole('tab', { name: 'Summary' })).toBeInTheDocument()
    expect(screen.getByRole('tab', { name: 'Drivers' })).toBeInTheDocument()
    expect(screen.getByRole('tab', { name: 'Activity' })).toBeInTheDocument()
    expect(screen.getByRole('tab', { name: 'Profile' })).toBeInTheDocument()
    expect(screen.getByRole('tab', { name: 'Methods' })).toBeInTheDocument()
    expect(screen.queryByRole('tab', { name: 'Breakdown' })).not.toBeInTheDocument()
    expect(screen.queryByRole('tab', { name: 'Trajectory' })).not.toBeInTheDocument()
    expect(screen.queryByRole('tab', { name: 'Context' })).not.toBeInTheDocument()
  })

  it('keeps summary tiles and trend chart in separate sections', () => {
    renderInfluentialCitationsDrilldown()

    const dialog = screen.getByRole('dialog')
    const summary = dialog.querySelector('[data-ui="influential-citations-summary"]')
    const trendSection = dialog.querySelector('[data-ui="influential-citations-trend-section"]')
    expect(summary).not.toBeNull()
    expect(trendSection).not.toBeNull()
    expect(summary?.querySelector('[data-ui="influential-citations-trend-chart"]')).toBeNull()
    expect(within(dialog).getByText('Influential citation overview')).toBeInTheDocument()
    expect(within(dialog).getByText('Total influential')).toBeInTheDocument()
    expect(within(dialog).getByText('Influential ratio')).toBeInTheDocument()
    expect(within(dialog).getByText('Last 12 months')).toBeInTheDocument()
    expect(within(dialog).getByText('12m change')).toBeInTheDocument()
    expect(within(trendSection as HTMLElement).getByText('Influential citations over time')).toBeInTheDocument()
    expect(within(dialog).queryByText('Approved story')).not.toBeInTheDocument()
    expect(within(dialog).queryByText('Influential citation readout')).not.toBeInTheDocument()
    expect(within(dialog).queryByText(/quality-of-impact rather than raw volume/i)).not.toBeInTheDocument()
  })

  it('renders the summary trend as a proper axis-based bar chart', () => {
    renderInfluentialCitationsDrilldown()

    const dialog = screen.getByRole('dialog')
    const chart = dialog.querySelector('[data-ui="publications-per-year-chart"]')
    expect(chart).not.toBeNull()
    expect(dialog.querySelector('[data-ui="publications-window-toggle"]')).not.toBeNull()
    expect(dialog.querySelector('[data-ui="publications-trends-visual-toggle"]')).not.toBeNull()
    expect(chart?.querySelectorAll('[data-ui="influential-citations-trend-bar"]').length).toBe(0)
    expect(within(chart as HTMLElement).getByText(/Mean:/)).toBeInTheDocument()
    expect(within(chart as HTMLElement).getByText(/Influential citations/i)).toBeInTheDocument()
    expect(within(chart as HTMLElement).getByText('Year')).toBeInTheDocument()
    expect(chart?.querySelector('.house-line-chart-surface')).toBeNull()
  })

  it('uses the shared chart visual toggle for bars and cumulative line view', async () => {
    renderInfluentialCitationsDrilldown()

    const dialog = screen.getByRole('dialog')
    const trendSection = dialog.querySelector('[data-ui="influential-citations-trend-section"]') as HTMLElement
    expect(trendSection).not.toBeNull()

    const toggle = trendSection.querySelector('[data-ui="publications-trends-visual-toggle"]')
    expect(toggle).not.toBeNull()
    expect(within(trendSection).getByRole('button', { name: 'Bar chart' })).toHaveAttribute('aria-pressed', 'true')
    expect(within(trendSection).getByRole('button', { name: 'Line chart' })).toHaveAttribute('aria-pressed', 'false')
    expect(within(trendSection).queryByRole('button', { name: 'Table view' })).not.toBeInTheDocument()

    fireEvent.click(within(trendSection).getByRole('button', { name: 'Line chart' }))

    expect(within(trendSection).getByRole('button', { name: 'Bar chart' })).toHaveAttribute('aria-pressed', 'false')
    expect(within(trendSection).getByRole('button', { name: 'Line chart' })).toHaveAttribute('aria-pressed', 'true')
    await waitFor(() => expect(trendSection.querySelector('.house-toggle-chart-line')).not.toBeNull())
    expect(trendSection.querySelector('[data-ui="influential-citations-cumulative-line"]')).toBeNull()
    expect(trendSection.querySelector('[data-ui="influential-citations-cumulative-point"]')).toBeNull()
    expect(trendSection.querySelector('[data-ui="influential-citations-trend-bar"]')).toBeNull()
  })

  it('keeps drivers focused on paper-level evidence', () => {
    renderInfluentialCitationsDrilldown()

    fireEvent.click(screen.getByRole('tab', { name: 'Drivers' }))

    const dialog = screen.getByRole('dialog')
    expect(dialog.querySelector('[data-ui="influential-citations-drivers"]')).not.toBeNull()
    expect(within(dialog).getByText('Paper-level influential contributors')).toBeInTheDocument()
    expect(within(dialog).getByText('Top influential papers')).toBeInTheDocument()
    expect(within(dialog).getByText('Primary influential paper')).toBeInTheDocument()
    expect(within(dialog).getByText('Influential')).toBeInTheDocument()
    expect(within(dialog).getByText('Last 12m')).toBeInTheDocument()
    expect(within(dialog).getByText('Lifetime')).toBeInTheDocument()
    expect(within(dialog).queryByText('Venue')).not.toBeInTheDocument()
    expect(within(dialog).queryByText('Approved story')).not.toBeInTheDocument()
    expect(within(dialog).queryByText(/defined paper set/i)).not.toBeInTheDocument()
    expect(within(dialog).queryByText(/Provider-tagged influential citation leaders/i)).not.toBeInTheDocument()
  })

  it('opens the matching publication from the drivers table title link', () => {
    const onOpenPublication = vi.fn()
    renderInfluentialCitationsTile({ onOpenPublication })

    fireEvent.click(screen.getByRole('button', { name: /Influential citations/i }))
    fireEvent.click(screen.getByRole('tab', { name: 'Drivers' }))
    fireEvent.click(screen.getByRole('button', { name: 'Primary influential paper' }))

    expect(onOpenPublication).toHaveBeenCalledWith('w-1')
  })
})
