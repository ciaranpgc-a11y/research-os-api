import { describe, expect, it } from 'vitest'

import {
  buildHIndexDrilldownStats,
  buildHIndexHeadlineMetricTiles,
} from '@/components/publications/h-index-drilldown-metrics'
import { buildHIndexMethodsSections } from '@/components/publications/h-index-methods'
import type { PublicationMetricTilePayload } from '@/types/impact'

function buildHIndexTile(): PublicationMetricTilePayload {
  return {
    id: 'tile-h-index',
    key: 'h_index_projection',
    label: 'h-index',
    main_value: 4,
    value: 4,
    main_value_display: '4',
    value_display: '4',
    delta_value: null,
    delta_display: 'Projection: h5 (Medium confidence)',
    delta_direction: 'na',
    delta_tone: 'neutral',
    delta_color_code: '#475569',
    unit: 'index',
    subtext: 'Target h=5',
    badge: {},
    chart_type: 'bar_year_5_h',
    chart_data: {
      years: [2021, 2022, 2023, 2024, 2025],
      values: [1, 2, 3, 4, 4],
      projected_year: 2026,
      projected_value: 5,
      progress_to_next_pct: 80,
      current_h_index: 4,
      next_h_index: 5,
      candidate_gaps: [1, 2],
    },
    sparkline: [1, 2, 3, 4, 4],
    sparkline_overlay: [],
    tooltip: 'Current h-index',
    tooltip_details: {},
    data_source: ['OpenAlex'],
    confidence_score: 0.92,
    stability: 'stable',
    drilldown: {
      title: 'h-index projection',
      definition: 'Current h-index and a 12-month projection using near-threshold papers.',
      formula: 'Use papers in [h-2,h+2] and last-12m velocity to estimate crossing probability.',
      confidence_note: 'Provider-synced',
      publications: [
        { work_id: 'w-1', title: 'Paper 1', year: 2018, citations_lifetime: 12, user_author_role: 'first', work_type: 'journal-article' },
        { work_id: 'w-2', title: 'Paper 2', year: 2019, citations_lifetime: 11, user_author_role: 'last', work_type: 'journal-article' },
        { work_id: 'w-3', title: 'Paper 3', year: 2020, citations_lifetime: 8, user_author_role: 'other', work_type: 'preprint' },
        { work_id: 'w-4', title: 'Paper 4', year: 2024, citations_lifetime: 4, user_author_role: 'second', work_type: 'dataset' },
        { work_id: 'w-5', title: 'Paper 5', year: 2025, citations_lifetime: 3, user_author_role: 'other', work_type: 'journal-article' },
        { work_id: 'w-6', title: 'Paper 6', year: 2026, citations_lifetime: 0, user_author_role: 'other', work_type: 'abstract' },
      ],
      metadata: {
        intermediate_values: {
          next_h_target: 5,
          m_index: 0.444,
          g_index: 5,
          i10_index: 2,
          citations_needed_for_next_h_total: 3,
          h_core_publication_count: 4,
          h_core_citations: 35,
          h_core_share_total_citations_pct: 92.1,
          h_core_citation_density: 8.75,
          h_milestone_years: {
            4: 2024,
            5: 2026,
          },
          candidate_papers: [
            {
              work_id: 'w-4',
              title: 'Paper 4',
              citations_lifetime: 4,
              citations_to_next_h: 1,
              projected_citations_12m: 6,
              projection_probability: 0.8,
            },
            {
              work_id: 'w-5',
              title: 'Paper 5',
              citations_lifetime: 3,
              citations_to_next_h: 2,
              projected_citations_12m: 5,
              projection_probability: 0.5,
            },
          ],
        },
      },
    },
  }
}

describe('buildHIndexHeadlineMetricTiles', () => {
  it('builds the reduced summary tile set for h-index drilldown', () => {
    const metrics = buildHIndexHeadlineMetricTiles(buildHIndexTile())

    expect(metrics).toEqual([
      { label: 'Current h-index', value: '4' },
      { label: 'Projected 2026', value: '5' },
      { label: 'Progress to h5', value: '80%' },
      { label: 'Papers in h-core', value: '4' },
      { label: 'Citations needed for h5', value: '3' },
      { label: 'h-core share of citations', value: '92%' },
      { label: 'Years since first cited paper', value: '9' },
      { label: 'm-index', value: '0.44' },
    ])
  })
})

describe('buildHIndexDrilldownStats', () => {
  it('derives complementary indices and runway context from the drilldown payload', () => {
    const stats = buildHIndexDrilldownStats(buildHIndexTile())

    expect(stats.gIndexValue).toBe('5')
    expect(stats.i10IndexValue).toBe('2')
    expect(stats.hCoreCitationDensityValue).toBe('8.8')
    expect(stats.candidatePapers.map((item) => item.title)).toEqual(['Paper 4', 'Paper 5'])
    expect(stats.authorshipMix.map((item) => item.label)).toContain('First author')
    expect(stats.publicationTypeMix[0]?.label).toBe('Journal Article')
    expect(stats.milestones).toEqual([
      { milestone: 4, label: 'Reached h4', value: '2024', year: 2024, yearsFromPrevious: null },
      { milestone: 5, label: 'Reached h5', value: '2026', year: 2026, yearsFromPrevious: 2 },
    ])
  })
})

describe('buildHIndexMethodsSections', () => {
  it('builds h-index specific methods sections in canonical format', () => {
    const sections = buildHIndexMethodsSections(buildHIndexTile())

    expect(sections.map((section) => section.key)).toEqual(['summary', 'breakdown', 'trajectory', 'context'])
    expect(sections[0]?.facts.some((fact) => fact.label === 'Current h-index' && fact.value === '4')).toBe(true)
    expect(sections[2]?.facts.some((fact) => fact.label === 'Candidate papers shown' && fact.value === '2')).toBe(true)
    expect(sections[3]?.facts.some((fact) => fact.label === 'g-index' && fact.value === '5')).toBe(true)
  })
})
