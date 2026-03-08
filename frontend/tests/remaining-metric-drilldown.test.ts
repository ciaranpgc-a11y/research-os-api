import { describe, expect, it } from 'vitest'

import {
  buildFieldPercentileShareDrilldownStats,
  buildMomentumDrilldownStats,
  buildRemainingMetricMethodsSections,
} from '@/components/publications/remaining-metric-drilldown'
import type { PublicationMetricTilePayload } from '@/types/impact'

function buildMomentumTile(): PublicationMetricTilePayload {
  return {
    id: 'tile-momentum',
    key: 'momentum',
    label: 'Momentum',
    main_value: 118,
    value: 118,
    main_value_display: 'Momentum 118',
    value_display: 'Momentum 118',
    delta_value: 12.4,
    delta_display: '+12.4 vs previous window',
    delta_direction: 'up',
    delta_tone: 'positive',
    delta_color_code: '#22c55e',
    unit: 'index',
    subtext: 'Accelerating',
    badge: { label: 'Accelerating' },
    chart_type: 'gauge',
    chart_data: {
      monthly_values_12m: [2, 3, 3, 4, 4, 5, 5, 7, 7, 8, 9, 10],
    },
    sparkline: [2, 3, 3, 4, 4, 5, 5, 7, 7, 8, 9, 10],
    sparkline_overlay: [],
    tooltip: 'Momentum',
    tooltip_details: {},
    data_source: ['OpenAlex', 'Semantic Scholar'],
    confidence_score: 0.91,
    stability: 'stable',
    drilldown: {
      title: 'Momentum',
      definition: 'Momentum index compares the latest 3-month citation pace vs prior 9 months.',
      formula: 'MomentumIndex = (avg/month last 3m)/(avg/month prior 9m)*100',
      confidence_note: 'Provider synced',
      publications: [
        {
          work_id: 'w-1',
          title: 'Paper 1',
          journal: 'Journal A',
          yearly_counts: { '2021': 2, '2022': 3, '2023': 4, '2024': 5 },
          citations_last_12m: 15,
          citations_prev_12m: 12,
          momentum_recent_3m_citations: 6,
          momentum_prior_9m_citations: 9,
          momentum_recent_1y_citations: 15,
          momentum_prior_4y_citations: 14,
          momentum_recent_3m_avg: 2,
          momentum_prior_9m_avg: 1,
          momentum_shift_delta: 1,
          monthly_added_24: [1, 1, 1, 1, 1, 1, 1, 1, 1, 2, 2, 2],
          momentum_contribution: 3.6,
          confidence_label: 'High',
        },
        {
          work_id: 'w-2',
          title: 'Paper 2',
          journal: 'Journal B',
          yearly_counts: { '2021': 1, '2022': 1, '2023': 1, '2024': 1 },
          citations_last_12m: 12,
          citations_prev_12m: 12,
          momentum_recent_3m_citations: 3,
          momentum_prior_9m_citations: 9,
          momentum_recent_1y_citations: 12,
          momentum_prior_4y_citations: 4,
          momentum_recent_3m_avg: 1,
          momentum_prior_9m_avg: 1,
          momentum_shift_delta: 0,
          monthly_added_24: [1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1],
          momentum_contribution: 2.4,
          confidence_label: 'Medium',
        },
      ],
      metadata: {
        intermediate_values: {
          momentum_index: 118,
          momentum_score_last_12m: 24.3,
          momentum_score_prev_12m: 11.9,
        },
        weighted_monthly_values_12m: [1, 2, 2, 3, 3, 4, 4, 6, 6, 7, 8, 9],
      },
    },
  }
}

function buildFieldPercentileTile(): PublicationMetricTilePayload {
  return {
    id: 'tile-field',
    key: 'field_percentile_share',
    label: 'Field percentile share',
    main_value: 42,
    value: 42,
    main_value_display: '42%',
    value_display: '42%',
    delta_value: null,
    delta_display: null,
    delta_direction: 'na',
    delta_tone: 'neutral',
    delta_color_code: '#64748b',
    unit: 'percent',
    subtext: '10 papers benchmarked',
    badge: {},
    chart_type: 'percentile_toggle',
    chart_data: {
      thresholds: [50, 75, 90, 95, 99],
      default_threshold: 75,
      share_by_threshold_pct: { '50': 60, '75': 42, '90': 20, '95': 10, '99': 0 },
      count_by_threshold: { '50': 6, '75': 4, '90': 2, '95': 1, '99': 0 },
      evaluated_papers: 10,
      total_papers: 12,
      coverage_pct: 83.3,
      median_percentile_rank: 74,
      cohort_count: 10,
      cohort_median_sample_size: 180,
    },
    sparkline: [60, 42, 20, 10, 0],
    sparkline_overlay: [],
    tooltip: 'Field percentile share',
    tooltip_details: {},
    data_source: ['OpenAlex'],
    confidence_score: 0.88,
    stability: 'stable',
    drilldown: {
      title: 'Field percentile share',
      definition: 'Share of papers meeting citation percentile thresholds.',
      formula: 'count(benchmark hits)/count(evaluated papers)',
      confidence_note: 'OpenAlex benchmarked',
      publications: [
        { work_id: 'p-1', title: 'Field Paper 1', field_name: 'Oncology', field_percentile_rank: 96, cohort_year: 2022, cohort_sample_size: 200 },
        { work_id: 'p-2', title: 'Field Paper 2', field_name: 'Oncology', field_percentile_rank: 82, cohort_year: 2021, cohort_sample_size: 180 },
        { work_id: 'p-3', title: 'Field Paper 3', field_name: 'Surgery', field_percentile_rank: 68, cohort_year: 2020, cohort_sample_size: 140 },
      ],
      metadata: {
        intermediate_values: {
          thresholds: [50, 75, 90, 95, 99],
          default_threshold: 75,
          share_by_threshold_pct: { '50': 60, '75': 42, '90': 20, '95': 10, '99': 0 },
          count_by_threshold: { '50': 6, '75': 4, '90': 2, '95': 1, '99': 0 },
          evaluated_papers: 10,
          total_papers: 12,
          coverage_pct: 83.3,
          median_percentile_rank: 74,
          cohort_count: 10,
          cohort_median_sample_size: 180,
        },
      },
    },
  }
}

describe('remaining metric drilldown builders', () => {
  it('builds momentum contributor and score context', () => {
    const stats = buildMomentumDrilldownStats(buildMomentumTile())

    expect(stats.momentumIndex).toBe(118)
    expect(stats.state).toBe('Accelerating')
    expect(stats.topContributors[0]?.title).toBe('Paper 1')
    expect(stats.topContributors[0]?.recent3mCitations).toBe(6)
    expect(stats.topContributors[0]?.prior9mCitations).toBe(9)
    expect(stats.topContributors[0]?.recent1yCitations).toBe(15)
    expect(stats.topContributors[0]?.prior4yCitations).toBe(14)
    expect(stats.topContributors[0]?.prior9mAvg).toBeCloseTo(1, 4)
    expect(stats.topContributors[0]?.recent3mAvg).toBeCloseTo(2, 4)
    expect(stats.topContributors[0]?.shiftDelta).toBeCloseTo(1, 4)
    expect(stats.confidenceBuckets[0]?.label).toBe('High')
  })

  it('builds field percentile threshold ladders and top papers', () => {
    const stats = buildFieldPercentileShareDrilldownStats(buildFieldPercentileTile())

    expect(stats.defaultThreshold).toBe(75)
    expect(stats.thresholdRows.find((row) => row.threshold === 90)?.paperCount).toBe(2)
    expect(stats.topPublications[0]?.fieldPercentileRank).toBe(96)
    expect(stats.topFields[0]?.fieldName).toBe('Oncology')
  })

  it('builds metric-specific methods sections for enhanced drilldowns', () => {
    const sections = buildRemainingMetricMethodsSections(buildFieldPercentileTile())

    expect(sections.map((section) => section.key)).toEqual(['summary', 'breakdown', 'trajectory', 'context'])
    expect(sections[0]?.facts.some((fact) => fact.label === 'Default threshold' && fact.value === '75%')).toBe(true)
  })
})
