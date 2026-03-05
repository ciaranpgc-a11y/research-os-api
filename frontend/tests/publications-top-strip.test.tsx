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
      publications: [],
      metadata: {},
    },
    ...overrides,
  }
}

describe('buildTotalCitationsHeadlineMetricTiles', () => {
  it('uses the numeric tile value when display strings are comma-formatted', () => {
    const metrics = buildTotalCitationsHeadlineMetricTiles(buildTotalCitationsTile())

    expect(metrics.find((metric) => metric.label === 'Total citations')?.value).toBe('1,234')
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
})
