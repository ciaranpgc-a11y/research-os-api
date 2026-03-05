import { describe, expect, it } from 'vitest'

import { buildTotalCitationsHeadlineMetricTiles } from '@/components/publications/total-citations-headline-metrics'
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
        { work_id: 'w-1', year: 2021, citations_lifetime: 5 },
        { work_id: 'w-2', year: 2023, citations_lifetime: 10 },
        { work_id: 'w-3', year: 2025, citations_lifetime: 40 },
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
    expect(metrics.find((metric) => metric.label === 'Mean yearly citations')?.value).toBe('205.7')
    expect(metrics.find((metric) => metric.label === 'Best year (2025)')?.value).toBe('50')
    expect(metrics.find((metric) => metric.label === 'Median citations')?.value).toBe('10')
    expect(metrics.find((metric) => metric.label === 'Top cited paper')?.value).toBe('40')
    expect(metrics.find((metric) => metric.label === 'Projected 2026')?.value).toBe('65')
    expect(labels).toEqual([
      'Total citations',
      'Projected 2026',
      'Last 1 year (rolling)',
      'Year-to-date',
      'Mean yearly citations',
      'Median citations',
      'Top cited paper',
      'Best year (2025)',
    ])
    expect(metrics.some((metric) => metric.label === 'Active years')).toBe(false)
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
    const metrics = buildTotalCitationsHeadlineMetricTiles(
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

    expect(metrics.find((metric) => metric.label === 'Mean yearly citations')?.value).toBe('137.1')
  })
})
