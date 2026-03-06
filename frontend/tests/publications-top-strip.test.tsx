import { describe, expect, it } from 'vitest'

import { buildLineTicksFromRange } from '@/components/publications/PublicationsTopStrip'
import {
  buildTotalCitationsHeadlineMetricTiles,
  buildTotalCitationsHeadlineStats,
} from '@/components/publications/total-citations-headline-metrics'
import type { PublicationMetricTilePayload } from '@/types/impact'

function buildTotalCitationsTile(overrides: Partial<PublicationMetricTilePayload> = {}): PublicationMetricTilePayload {
  return {
    id: 'tile-total-citations',
    key: 'total_citations',
    label: 'Total citations',
    main_value: 1234,
    value: 1234,
    main_value_display: '1,234',
    value_display: '1,234',
    delta_value: null,
    delta_display: 'Projected +5%',
    delta_direction: 'na',
    delta_tone: 'neutral',
    delta_color_code: '#475569',
    unit: 'citations',
    subtext: '+55 in last 12 months',
    badge: {},
    chart_type: 'bar_year_5',
    chart_data: {
      years: [2021, 2022, 2023, 2024, 2025],
      values: [10, 20, 30, 40, 50],
      projected_year: 2026,
      projected_value: 65,
      current_year_ytd: 5,
      month_labels_12m: [],
    },
    sparkline: [10, 20, 30, 40, 50],
    sparkline_overlay: [],
    tooltip: 'Lifetime citations',
    tooltip_details: {},
    data_source: ['OpenAlex'],
    confidence_score: 0.92,
    stability: 'stable',
      drilldown: {
        title: 'Total citations',
        definition: 'Lifetime citations across all publications.',
        formula: 'sum(latest citations per publication)',
        confidence_note: 'Provider-synced',
        publications: [
          { work_id: 'w-1', year: 2018, citations_lifetime: 100, citations_1y_rolling: 20 },
          { work_id: 'w-2', year: 2021, citations_lifetime: 5, citations_1y_rolling: 0 },
          { work_id: 'w-3', year: 2023, citations_lifetime: 10, citations_1y_rolling: 15 },
          { work_id: 'w-4', year: 2024, citations_lifetime: 40, citations_1y_rolling: 40 },
          { work_id: 'w-5', year: 2025, citations_lifetime: 0, citations_1y_rolling: 5 },
        ],
        metadata: {},
      },
    ...overrides,
  }
}

describe('buildTotalCitationsHeadlineMetricTiles', () => {
  it('uses the numeric tile value when display strings are comma-formatted', () => {
    const metrics = buildTotalCitationsHeadlineMetricTiles(buildTotalCitationsTile())
    const labels = metrics.map((metric) => metric.label)

    expect(metrics.find((metric) => metric.label === 'Total citations')?.value).toBe('1,234')
    expect(metrics.find((metric) => metric.label === 'Citations per paper')?.value).toBe('246.8')
    expect(metrics.find((metric) => metric.label === 'Best year (2025)')?.value).toBe('50')
    expect(metrics.find((metric) => metric.label === 'Recent concentration')?.value).toBe('94%')
    expect(metrics.find((metric) => metric.label === 'Top cited paper')?.value).toBe('100')
    expect(metrics.find((metric) => metric.label === 'Projected 2026')?.value).toBe('65')
    expect(labels).toEqual([
      'Total citations',
      'Projected 2026',
      'Last 1 year (rolling)',
      'Year-to-date',
      'Citations per paper',
      'Recent concentration',
      'Top cited paper',
      'Best year (2025)',
    ])
    expect(metrics.some((metric) => metric.label === 'Active years')).toBe(false)
    expect(metrics.some((metric) => metric.label === 'Mean yearly citations')).toBe(false)
    expect(metrics.some((metric) => metric.label === 'Median citations')).toBe(false)
    expect(metrics.some((metric) => metric.label === 'Uncited papers')).toBe(false)
    expect(metrics.some((metric) => metric.label === 'Newly cited papers (12m)')).toBe(false)
    expect(metrics.some((metric) => metric.label === 'Citation half-life proxy')).toBe(false)
    expect(metrics.some((metric) => metric.label === 'Last 3 years (rolling)')).toBe(false)
    expect(metrics.some((metric) => metric.label === 'Last 5 years (rolling)')).toBe(false)
  })

  it('falls back to the chart-derived total when the numeric tile value is unavailable', () => {
    const metrics = buildTotalCitationsHeadlineMetricTiles(
      buildTotalCitationsTile({
        main_value: null,
        value: null,
        main_value_display: '',
        value_display: '',
      }),
    )

    expect(metrics.find((metric) => metric.label === 'Total citations')?.value).toBe('155')
  })

  it('uses publication history to derive the yearly mean when full-career years are available', () => {
    const stats = buildTotalCitationsHeadlineStats(
      buildTotalCitationsTile({
        drilldown: {
          title: 'Total citations',
          definition: 'Lifetime citations across all publications.',
          formula: 'sum(latest citations per publication)',
          confidence_note: 'Provider-synced',
          publications: [
            { work_id: 'w-1', year: 2018 },
            { work_id: 'w-2', year: 2024 },
          ],
          metadata: {},
        },
      }),
    )

    expect(stats.meanCitations).toBe('137')
  })
})

describe('buildLineTicksFromRange', () => {
  it('omits a lifetime start-year tick when the actual year boundary is outside the plotted range', () => {
    const ticks = buildLineTicksFromRange(
      Date.UTC(2016, 2, 1),
      Date.UTC(2026, 1, 1),
      'all',
    )

    expect(ticks.map((tick) => tick.label)).toEqual(['2019', '2022', '2025'])
  })

  it('keeps an in-range terminal year tick even when the visible range ends mid-year', () => {
    const ticks = buildLineTicksFromRange(
      Date.UTC(2021, 3, 1),
      Date.UTC(2024, 7, 1),
      'all',
    )

    expect(ticks.map((tick) => tick.label)).toEqual(['2022', '2023', '2024'])
  })
})
