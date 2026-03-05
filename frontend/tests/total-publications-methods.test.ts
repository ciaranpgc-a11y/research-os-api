import { describe, expect, it } from 'vitest'

import { buildTotalPublicationsMethodsSections } from '@/components/publications/total-publications-methods'
import type { PublicationMetricTilePayload } from '@/types/impact'

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
        { window_id: '1y', label: '1y' },
        { window_id: '3y', label: '3y' },
        { window_id: '5y', label: '5y' },
        { window_id: 'all', label: 'All' },
      ],
      breakdowns: [
        {
          breakdown_id: 'by_publication_type',
          items: [{ key: 'article', label: 'Article', value: 18 }],
        },
        {
          breakdown_id: 'by_venue_full',
          items: [
            { key: 'j1', label: 'Journal A', value: 10 },
            { key: 'j2', label: 'Journal B', value: 8 },
          ],
        },
        {
          breakdown_id: 'by_topic',
          items: [
            { key: 't1', label: 'Cardiology', value: 7 },
            { key: 't2', label: 'Oncology', value: 6 },
            { key: 't3', label: 'Imaging', value: 4 },
          ],
        },
        {
          breakdown_id: 'by_oa_status',
          items: [
            { key: 'open_access', label: 'Open access', value: 15 },
            { key: 'closed', label: 'Closed', value: 9 },
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
        { work_id: 'w1', year: 2021, title: 'Paper 1' },
        { work_id: 'w2', year: 2022, title: 'Paper 2' },
        { work_id: 'w3', year: 2025, title: 'Paper 3' },
      ],
      metadata: {},
    },
    ...overrides,
  }
}

describe('buildTotalPublicationsMethodsSections', () => {
  it('returns the canonical methods sections for total publication insights', () => {
    const sections = buildTotalPublicationsMethodsSections(buildTotalPublicationsTile())

    expect(sections.map((section) => section.title)).toEqual([
      'Summary',
      'Breakdown',
      'Trajectory',
      'Context',
    ])
  })

  it('describes the total-publications specific logic and benchmark gap', () => {
    const sections = buildTotalPublicationsMethodsSections(buildTotalPublicationsTile())
    const summary = sections.find((section) => section.key === 'summary')
    const breakdown = sections.find((section) => section.key === 'breakdown')
    const trajectory = sections.find((section) => section.key === 'trajectory')
    const context = sections.find((section) => section.key === 'context')

    expect(summary?.facts.find((fact) => fact.label === 'Sources')?.value).toBe('ORCID, OpenAlex')
    expect(summary?.bullets.join(' ')).toContain('synced records')
    expect(breakdown?.bullets.join(' ')).toContain('top 3 provider topics')
    expect(trajectory?.bullets.join(' ')).toContain('trailing 3-year mean')
    expect(context?.bullets.join(' ')).toContain('no external benchmark cohort')
  })
})
