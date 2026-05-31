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

function renderInfluentialCitationsDrilldown() {
  const result = render(
    <PublicationsTopStrip
      metrics={buildMetricsPayload(buildInfluentialCitationsTile())}
      token="test-token"
    />,
  )
  const metricTile = result.container.querySelector('[data-metric-key="influential_citations"]')
  expect(metricTile).not.toBeNull()
  fireEvent.click(metricTile as HTMLElement)
  return result
}

describe('Influential citations drilldown', () => {
  beforeEach(() => {
    mockFetchPublicationInsightsAgent.mockReset()
    mockPingApiHealth.mockReset()
    mockPingApiHealth.mockResolvedValue({ status: 'ok', publication_insights_available: true })
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

  it('keeps summary compact with headline tiles and trend only', () => {
    renderInfluentialCitationsDrilldown()

    const dialog = screen.getByRole('dialog')
    expect(dialog.querySelector('[data-ui="influential-citations-summary"]')).not.toBeNull()
    expect(within(dialog).getByText('Influential citation overview')).toBeInTheDocument()
    expect(within(dialog).getByText('Total influential')).toBeInTheDocument()
    expect(within(dialog).getByText('Influential ratio')).toBeInTheDocument()
    expect(within(dialog).getByText('Last 12 months')).toBeInTheDocument()
    expect(within(dialog).getByText('12m change')).toBeInTheDocument()
    expect(within(dialog).getByText('Influential citations over time')).toBeInTheDocument()
    expect(within(dialog).queryByText('Approved story')).not.toBeInTheDocument()
    expect(within(dialog).queryByText('Influential citation readout')).not.toBeInTheDocument()
    expect(within(dialog).queryByText(/quality-of-impact rather than raw volume/i)).not.toBeInTheDocument()
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
})
