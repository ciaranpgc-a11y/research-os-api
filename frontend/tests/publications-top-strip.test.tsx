import { describe, expect, it } from 'vitest'

import {
  buildPublicationProductionPhaseStats,
  buildPublicationProductionPatternStats,
  buildCitationConcentrationLadder,
  buildCitationHistogramBuckets,
  buildCitationMomentumLists,
  buildLineTicksFromRange,
  calculatePublicationBurstinessScore,
  calculatePublicationLongestStreak,
  calculatePublicationConsistencyIndex,
  calculatePublicationOutputContinuity,
  calculatePublicationPeakYearShare,
  getPublicationBurstinessInterpretation,
  getPublicationConsistencyInterpretation,
  getPublicationOutputContinuityInterpretation,
  getPublicationPeakYearShareCaution,
  getPublicationPeakYearShareInterpretation,
  shouldShowPublicationPeakYearShareInterpretation,
} from '@/components/publications/PublicationsTopStrip'
import { buildTrajectoryYearTicks, getTrajectoryYearTickAnchor } from '@/components/publications/publication-trajectory-axis'
import {
  buildPublicationTrajectoryMovingAverageSeries,
  formatTrajectoryMovingAveragePeriodLabel,
  mergePublicationTrajectoryYears,
  resolvePublicationTrajectoryYear,
} from '@/components/publications/publication-trajectory-series'
import { buildTrajectoryTooltipSlices } from '@/components/publications/publication-trajectory-tooltip'
import {
  buildTotalCitationsHeadlineMetricTiles,
  buildTotalCitationsHeadlineStats,
} from '@/components/publications/total-citations-headline-metrics'
import {
  buildHIndexDrilldownStats,
  buildHIndexHeadlineMetricTiles,
} from '@/components/publications/h-index-drilldown-metrics'
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

function buildHIndexTile(overrides: Partial<PublicationMetricTilePayload> = {}): PublicationMetricTilePayload {
  return {
    id: 'tile-h-index',
    key: 'h_index_projection',
    label: 'h-index',
    main_value: 11,
    value: 11,
    main_value_display: '11',
    value_display: '11',
    delta_value: null,
    delta_display: 'Projected 12',
    delta_direction: 'na',
    delta_tone: 'neutral',
    delta_color_code: '#475569',
    unit: 'index',
    subtext: 'One-year outlook',
    badge: {},
    chart_type: 'bar_year_5_h',
    chart_data: {
      years: [2021, 2022, 2023, 2024, 2025],
      values: [8, 9, 10, 11, 11],
      projected_year: 2026,
      projected_value: 12,
      progress_to_next_pct: 83.3,
      current_h_index: 11,
      next_h_index: 12,
    },
    sparkline: [8, 9, 10, 11, 11],
    sparkline_overlay: [],
    tooltip: 'h-index projection',
    tooltip_details: {},
    data_source: ['OpenAlex'],
    confidence_score: 0.92,
    stability: 'stable',
    drilldown: {
      title: 'h-index projection',
      definition: 'Current h-index and one-year projection.',
      formula: 'Largest h where h papers have at least h citations.',
      confidence_note: 'Provider-synced',
      publications: [
        { work_id: 'w-1', title: 'P1', year: 2014, citations_lifetime: 30 },
        { work_id: 'w-2', title: 'P2', year: 2014, citations_lifetime: 25 },
        { work_id: 'w-3', title: 'P3', year: 2015, citations_lifetime: 22 },
        { work_id: 'w-4', title: 'P4', year: 2015, citations_lifetime: 20 },
        { work_id: 'w-5', title: 'P5', year: 2016, citations_lifetime: 19 },
        { work_id: 'w-6', title: 'P6', year: 2016, citations_lifetime: 17 },
        { work_id: 'w-7', title: 'P7', year: 2017, citations_lifetime: 16 },
        { work_id: 'w-8', title: 'P8', year: 2018, citations_lifetime: 15 },
        { work_id: 'w-9', title: 'P9', year: 2019, citations_lifetime: 14 },
        { work_id: 'w-10', title: 'P10', year: 2020, citations_lifetime: 13 },
        { work_id: 'w-11', title: 'P11', year: 2021, citations_lifetime: 11 },
        { work_id: 'w-12', title: 'P12', year: 2022, citations_lifetime: 10 },
      ],
      metadata: {
        intermediate_values: {
          projected_h_index: 12,
          next_h_target: 12,
          citations_needed_for_next_h_total: 9,
          candidate_papers: [
            { work_id: 'w-11', title: 'P11', citations_lifetime: 11, citations_to_next_h: 1, projected_citations_12m: 12, projection_probability: 0.8 },
            { work_id: 'w-12', title: 'P12', citations_lifetime: 10, citations_to_next_h: 2, projected_citations_12m: 12, projection_probability: 0.7 },
          ],
        },
      },
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

describe('calculatePublicationConsistencyIndex', () => {
  it('returns 1 for perfectly steady yearly output', () => {
    expect(calculatePublicationConsistencyIndex([5, 5, 5, 5])).toBe(1)
  })

  it('clips very irregular output at zero', () => {
    expect(calculatePublicationConsistencyIndex([0, 10, 0, 10])).toBe(0)
  })
})

describe('calculatePublicationBurstinessScore', () => {
  it('returns 0 for perfectly steady yearly output', () => {
    expect(calculatePublicationBurstinessScore([5, 5, 5, 5])).toBe(0)
  })

  it('converts coefficient of variation into a bounded burstiness scale', () => {
    expect(calculatePublicationBurstinessScore([0, 10, 0, 10])).toBe(0.5)
  })
})

describe('calculatePublicationPeakYearShare', () => {
  it('returns the share contributed by the highest-output year', () => {
    expect(calculatePublicationPeakYearShare([1, 4, 2, 3])).toBe(0.4)
  })
})

describe('calculatePublicationOutputContinuity', () => {
  it('measures the share of active-span years with at least one publication', () => {
    expect(calculatePublicationOutputContinuity([2, 0, 1, 4])).toBe(0.75)
  })
})

describe('calculatePublicationLongestStreak', () => {
  it('returns the longest consecutive run of years with output', () => {
    expect(calculatePublicationLongestStreak([1, 2, 0, 3, 1, 1, 0])).toBe(3)
  })
})

describe('getPublicationConsistencyInterpretation', () => {
  it('maps representative values into the expected qualitative bands', () => {
    expect(getPublicationConsistencyInterpretation(0.8)).toBe('Very consistent')
    expect(getPublicationConsistencyInterpretation(0.6)).toBe('Consistent')
    expect(getPublicationConsistencyInterpretation(0.4)).toBe('Moderately variable')
    expect(getPublicationConsistencyInterpretation(0.25)).toBe('Bursty')
    expect(getPublicationConsistencyInterpretation(0.1)).toBe('Highly bursty')
  })
})

describe('getPublicationBurstinessInterpretation', () => {
  it('maps representative values into the expected qualitative bands', () => {
    expect(getPublicationBurstinessInterpretation(0.1)).toBe('Very steady')
    expect(getPublicationBurstinessInterpretation(0.3)).toBe('Moderately steady')
    expect(getPublicationBurstinessInterpretation(0.5)).toBe('Moderately bursty')
    expect(getPublicationBurstinessInterpretation(0.7)).toBe('Bursty')
    expect(getPublicationBurstinessInterpretation(0.9)).toBe('Highly bursty')
  })
})

describe('getPublicationPeakYearShareInterpretation', () => {
  it('maps representative values into the expected qualitative bands', () => {
    expect(getPublicationPeakYearShareInterpretation(0.1)).toBe('Very distributed')
    expect(getPublicationPeakYearShareInterpretation(0.15)).toBe('Distributed')
    expect(getPublicationPeakYearShareInterpretation(0.25)).toBe('Moderately concentrated')
    expect(getPublicationPeakYearShareInterpretation(0.35)).toBe('Concentrated')
    expect(getPublicationPeakYearShareInterpretation(0.45)).toBe('Highly concentrated')
  })
})

describe('getPublicationOutputContinuityInterpretation', () => {
  it('maps representative values into the expected continuity bands', () => {
    expect(getPublicationOutputContinuityInterpretation(0.9)).toBe('Continuous output')
    expect(getPublicationOutputContinuityInterpretation(0.78)).toBe('Highly active')
    expect(getPublicationOutputContinuityInterpretation(0.6)).toBe('Intermittent')
    expect(getPublicationOutputContinuityInterpretation(0.4)).toBe('Episodic')
    expect(getPublicationOutputContinuityInterpretation(0.2)).toBe('Sporadic')
  })
})

describe('getPublicationPeakYearShareCaution', () => {
  it('flags small publication portfolios for cautious interpretation', () => {
    expect(getPublicationPeakYearShareCaution(14)).toBe('Interpret with caution: small portfolio')
    expect(getPublicationPeakYearShareCaution(15)).toBeNull()
  })
})

describe('shouldShowPublicationPeakYearShareInterpretation', () => {
  it('suppresses the semantic category for very small portfolios', () => {
    expect(shouldShowPublicationPeakYearShareInterpretation(9)).toBe(false)
    expect(shouldShowPublicationPeakYearShareInterpretation(10)).toBe(true)
  })
})

describe('buildPublicationProductionPatternStats', () => {
  it('excludes the partial current year from active-span calculations in complete-year mode', () => {
    const stats = buildPublicationProductionPatternStats({
      id: 'tile-total-publications',
      key: 'this_year_vs_last',
      label: 'Total publications',
      main_value: 9,
      value: 9,
      main_value_display: '9',
      value_display: '9',
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
        years: [2021, 2022, 2023, 2024, 2025, 2026],
        values: [1, 2, 0, 3, 1, 2],
        projected_year: 2026,
        current_year_ytd: 2,
      },
      sparkline: [1, 2, 0, 3, 1, 2],
      sparkline_overlay: [],
      tooltip: 'Total publications',
      tooltip_details: {},
      data_source: ['ORCID', 'OpenAlex'],
      confidence_score: 0.92,
      stability: 'stable',
      drilldown: {
        title: 'Total publications',
        definition: 'Counts authored publications and groups them by publication year.',
        formula: 'count(publications) by year',
        confidence_note: 'Confidence based on provider match quality.',
        as_of_date: '2026-03-05',
        publications: [
          { work_id: 'w1', year: 2021, title: 'Paper 1' },
          { work_id: 'w2', year: 2022, title: 'Paper 2' },
          { work_id: 'w3', year: 2024, title: 'Paper 3' },
          { work_id: 'w4', year: 2025, title: 'Paper 4' },
          { work_id: 'w5', year: 2026, title: 'Paper 5' },
          { work_id: 'w6', year: 2026, title: 'Paper 6' },
        ],
        metadata: {},
      },
    })

    expect(stats.activeSpan).toBe(5)
    expect(stats.yearsWithOutput).toBe(4)
    expect(stats.outputContinuity).toBe(0.8)
    expect(stats.includesPartialYear).toBe(false)
    expect(stats.lastPublicationYear).toBe(2025)
  })

  it('includes the partial current year when explicitly requested', () => {
    const stats = buildPublicationProductionPatternStats({
      id: 'tile-total-publications',
      key: 'this_year_vs_last',
      label: 'Total publications',
      main_value: 9,
      value: 9,
      main_value_display: '9',
      value_display: '9',
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
        years: [2021, 2022, 2023, 2024, 2025, 2026],
        values: [1, 2, 0, 3, 1, 2],
        projected_year: 2026,
        current_year_ytd: 2,
      },
      sparkline: [1, 2, 0, 3, 1, 2],
      sparkline_overlay: [],
      tooltip: 'Total publications',
      tooltip_details: {},
      data_source: ['ORCID', 'OpenAlex'],
      confidence_score: 0.92,
      stability: 'stable',
      drilldown: {
        title: 'Total publications',
        definition: 'Counts authored publications and groups them by publication year.',
        formula: 'count(publications) by year',
        confidence_note: 'Confidence based on provider match quality.',
        as_of_date: '2026-03-05',
        publications: [
          { work_id: 'w1', year: 2021, title: 'Paper 1' },
          { work_id: 'w2', year: 2022, title: 'Paper 2' },
          { work_id: 'w3', year: 2024, title: 'Paper 3' },
          { work_id: 'w4', year: 2025, title: 'Paper 4' },
          { work_id: 'w5', year: 2026, title: 'Paper 5' },
          { work_id: 'w6', year: 2026, title: 'Paper 6' },
        ],
        metadata: {},
      },
    }, 'include_current')

    expect(stats.activeSpan).toBe(6)
    expect(stats.yearsWithOutput).toBe(5)
    expect(stats.outputContinuity).toBeCloseTo(5 / 6, 5)
    expect(stats.includesPartialYear).toBe(true)
    expect(stats.partialYear).toBe(2026)
    expect(stats.lastPublicationYear).toBe(2026)
  })
})

describe('buildPublicationProductionPhaseStats', () => {
  it('classifies a growing mature publication history as Scaling', () => {
    const stats = buildPublicationProductionPhaseStats({
      id: 'tile-total-publications',
      key: 'this_year_vs_last',
      label: 'Total publications',
      main_value: 18,
      value: 18,
      main_value_display: '18',
      value_display: '18',
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
        years: [2021, 2022, 2023, 2024, 2025, 2026, 2027],
        values: [1, 1, 2, 3, 4, 6, 1],
        projected_year: 2027,
        current_year_ytd: 1,
      },
      sparkline: [1, 1, 2, 3, 4, 6, 1],
      sparkline_overlay: [],
      tooltip: 'Total publications',
      tooltip_details: {},
      data_source: ['ORCID', 'OpenAlex'],
      confidence_score: 0.92,
      stability: 'stable',
      drilldown: {
        title: 'Total publications',
        definition: 'Counts authored publications and groups them by publication year.',
        formula: 'count(publications) by year',
        confidence_note: 'Confidence based on provider match quality.',
        as_of_date: '2027-03-05',
        publications: [],
        metadata: {},
      },
    })

    expect(stats.phase).toBe('Scaling')
    expect(stats.phaseLabel).toBe('Scaling')
    expect(stats.interpretation).toBe('Publication output is increasing steadily.')
    expect(stats.confidenceLow).toBe(false)
    expect(stats.recentShare).toBeCloseTo(13 / 17, 5)
    expect(stats.peakYear).toBe(2026)
  })

  it('classifies renewed output after gap years as Rebuilding and marks limited histories lower confidence', () => {
    const stats = buildPublicationProductionPhaseStats({
      id: 'tile-total-publications',
      key: 'this_year_vs_last',
      label: 'Total publications',
      main_value: 10,
      value: 10,
      main_value_display: '10',
      value_display: '10',
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
        years: [2021, 2022, 2023, 2024, 2025, 2026],
        values: [2, 0, 0, 1, 3, 4],
        projected_year: 2026,
        current_year_ytd: 4,
      },
      sparkline: [2, 0, 0, 1, 3, 4],
      sparkline_overlay: [],
      tooltip: 'Total publications',
      tooltip_details: {},
      data_source: ['ORCID', 'OpenAlex'],
      confidence_score: 0.92,
      stability: 'stable',
      drilldown: {
        title: 'Total publications',
        definition: 'Counts authored publications and groups them by publication year.',
        formula: 'count(publications) by year',
        confidence_note: 'Confidence based on provider match quality.',
        as_of_date: '2026-12-31',
        publications: [],
        metadata: {},
      },
    })

    expect(stats.phase).toBe('Rebuilding')
    expect(stats.historicalGapYearsPresent).toBe(true)
    expect(stats.confidenceLow).toBe(false)
  })

  it('uses the earliest highest-output year when multiple years tie for the peak', () => {
    const stats = buildPublicationProductionPhaseStats({
      id: 'tile-total-publications',
      key: 'this_year_vs_last',
      label: 'Total publications',
      main_value: 13,
      value: 13,
      main_value_display: '13',
      value_display: '13',
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
        years: [2020, 2021, 2022, 2023],
        values: [2, 5, 5, 1],
        projected_year: 2023,
        current_year_ytd: 1,
      },
      sparkline: [2, 5, 5, 1],
      sparkline_overlay: [],
      tooltip: 'Total publications',
      tooltip_details: {},
      data_source: ['ORCID', 'OpenAlex'],
      confidence_score: 0.92,
      stability: 'stable',
      drilldown: {
        title: 'Total publications',
        definition: 'Counts authored publications and groups them by publication year.',
        formula: 'count(publications) by year',
        confidence_note: 'Confidence based on provider match quality.',
        as_of_date: '2023-12-31',
        publications: [],
        metadata: {},
      },
    })

    expect(stats.peakYear).toBe(2021)
  })

  it('suppresses the phase classification when only one complete active year exists', () => {
    const stats = buildPublicationProductionPhaseStats({
      id: 'tile-total-publications',
      key: 'this_year_vs_last',
      label: 'Total publications',
      main_value: 3,
      value: 3,
      main_value_display: '3',
      value_display: '3',
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
        years: [2026],
        values: [3],
        projected_year: 2026,
        current_year_ytd: 3,
      },
      sparkline: [3],
      sparkline_overlay: [],
      tooltip: 'Total publications',
      tooltip_details: {},
      data_source: ['ORCID', 'OpenAlex'],
      confidence_score: 0.92,
      stability: 'stable',
      drilldown: {
        title: 'Total publications',
        definition: 'Counts authored publications and groups them by publication year.',
        formula: 'count(publications) by year',
        confidence_note: 'Confidence based on provider match quality.',
        as_of_date: '2026-12-31',
        publications: [],
        metadata: {},
      },
    })

    expect(stats.phase).toBeNull()
    expect(stats.phaseLabel).toBe('Insufficient history')
    expect(stats.insufficientHistory).toBe(true)
  })
})

describe('buildTrajectoryYearTicks', () => {
  it('shows every year when the visible range is short', () => {
    const ticks = buildTrajectoryYearTicks([2021, 2022, 2023, 2024, 2025])

    expect(ticks.map((tick) => tick.label)).toEqual(['2021', '2022', '2023', '2024', '2025'])
    expect(ticks.map((tick) => Math.round(tick.leftPct))).toEqual([0, 25, 50, 75, 100])
  })

  it('reduces year labels for medium spans while keeping the end year', () => {
    const ticks = buildTrajectoryYearTicks([2018, 2019, 2020, 2021, 2022, 2023, 2024, 2025, 2026])

    expect(ticks.map((tick) => tick.label)).toEqual(['2018', '2020', '2022', '2024', '2026'])
  })

  it('drops a crowded terminal label when it would overlap the prior medium-span tick', () => {
    const ticks = buildTrajectoryYearTicks([2016, 2017, 2018, 2019, 2020, 2021, 2022, 2023])

    expect(ticks.map((tick) => tick.label)).toEqual(['2016', '2018', '2020', '2022'])
  })

  it('avoids appending a terminal year that does not have enough room beside the previous tick', () => {
    const ticks = buildTrajectoryYearTicks([2016, 2017, 2018, 2019, 2020, 2021, 2022, 2023, 2024, 2025])

    expect(ticks.map((tick) => tick.label)).toEqual(['2016', '2018', '2020', '2022', '2024'])
  })

  it('caps long spans to five evenly distributed year labels', () => {
    const ticks = buildTrajectoryYearTicks([2012, 2013, 2014, 2015, 2016, 2017, 2018, 2019, 2020, 2021, 2022, 2023, 2024, 2025])

    expect(ticks.map((tick) => tick.label)).toEqual(['2012', '2015', '2019', '2022', '2025'])
    expect(ticks[0]?.leftPct).toBe(0)
    expect(ticks.at(-1)?.leftPct).toBe(100)
  })

  it('keeps interior terminal labels centered when the end year is omitted', () => {
    const ticks = buildTrajectoryYearTicks([2019, 2020, 2021, 2022, 2023, 2024, 2025, 2026])

    expect(ticks.map((tick) => tick.label)).toEqual(['2019', '2021', '2023', '2025'])
    expect(getTrajectoryYearTickAnchor(ticks.at(-1)?.leftPct ?? 0)).toBe('center')
  })
})

describe('buildTrajectoryTooltipSlices', () => {
  it('uses midpoint hover bands and preserves prior-year deltas from the full raw series', () => {
    const slices = buildTrajectoryTooltipSlices({
      years: [2023, 2024],
      rawValues: [5, 7],
      movingAvgValues: [4, 5.3],
      cumulativeValues: [17, 24],
      activeValues: [5, 7],
      activePoints: [
        { x: 0, y: 62, value: 5, label: '2023' },
        { x: 100, y: 38, value: 7, label: '2024' },
      ],
      movingPoints: [
        { x: 0, y: 68, value: 4, label: '2023' },
        { x: 100, y: 46, value: 5.3, label: '2024' },
      ],
      fullRawValues: [3, 5, 7],
      visibleStartIndex: 1,
    })

    expect(slices).toHaveLength(2)
    expect(slices[0]).toMatchObject({
      year: 2023,
      leftPct: 0,
      widthPct: 50,
      previousRawValue: 3,
      rawDelta: 2,
      movingAvgYPct: 68,
    })
    expect(slices[0]?.rawDeltaPct).toBeCloseTo(66.6667, 3)
    expect(slices[1]).toMatchObject({
      year: 2024,
      leftPct: 50,
      widthPct: 50,
      previousRawValue: 5,
      rawDelta: 2,
      movingAvgYPct: 46,
    })
    expect(slices[1]?.rawDeltaPct).toBe(40)
  })
})

describe('publication trajectory series helpers', () => {
  it('derives the trajectory year from publication dates when the explicit year is missing', () => {
    expect(resolvePublicationTrajectoryYear({
      year: null,
      publicationDate: '2016-04-18',
      publicationMonthStart: null,
    })).toBe(2016)
    expect(resolvePublicationTrajectoryYear({
      year: null,
      publicationDate: null,
      publicationMonthStart: '2017-02',
    })).toBe(2017)
  })

  it('keeps earlier fallback chart years when drilldown records start later', () => {
    expect(mergePublicationTrajectoryYears([2018, 2019, 2020], [2016, 2017, 2018, 2019, 2020, 2021]))
      .toEqual([2016, 2017, 2018, 2019, 2020, 2021])
  })

  it('uses last completed month counts for the current-year moving average point', () => {
    const movingAverage = buildPublicationTrajectoryMovingAverageSeries({
      years: [2024, 2025, 2026],
      rawValues: [3, 3, 3],
      records: [
        { year: 2024, publicationDate: '2024-01-14', publicationMonthStart: null },
        { year: 2024, publicationDate: '2024-02-10', publicationMonthStart: null },
        { year: 2024, publicationDate: '2024-05-02', publicationMonthStart: null },
        { year: 2025, publicationDate: '2025-01-08', publicationMonthStart: null },
        { year: 2025, publicationDate: '2025-02-22', publicationMonthStart: null },
        { year: 2025, publicationDate: '2025-07-11', publicationMonthStart: null },
        { year: 2026, publicationDate: '2026-01-05', publicationMonthStart: null },
        { year: 2026, publicationDate: '2026-02-12', publicationMonthStart: null },
        { year: 2026, publicationDate: '2026-09-01', publicationMonthStart: null },
      ],
      asOfDate: new Date(Date.UTC(2026, 2, 7)),
    })

    expect(movingAverage).toEqual([3, 3, 2])
    expect(formatTrajectoryMovingAveragePeriodLabel(2026, new Date(Date.UTC(2026, 2, 7)))).toBe('Feb 2026')
    expect(formatTrajectoryMovingAveragePeriodLabel(2025, new Date(Date.UTC(2026, 2, 7)))).toBe('2025')
  })
})

describe('buildCitationHistogramBuckets', () => {
  it('opens the top bucket based on the portfolio maximum for mid-range citation counts', () => {
    const buckets = buildCitationHistogramBuckets([0, 0, 1, 4, 7, 15, 40])

    expect(buckets.map((bucket) => bucket.label)).toEqual(['0', '1', '2-4', '5-9', '10-24', '25+'])
    expect(buckets.map((bucket) => bucket.count)).toEqual([2, 1, 1, 1, 1, 1])
  })

  it('extends higher-range buckets when the portfolio includes very highly cited papers', () => {
    const buckets = buildCitationHistogramBuckets([0, 12, 37, 65, 145, 320, 1200])

    expect(buckets.map((bucket) => bucket.label)).toEqual([
      '0',
      '1',
      '2-4',
      '5-9',
      '10-24',
      '25-49',
      '50-99',
      '100-199',
      '200-499',
      '500-999',
      '1000+',
    ])
    expect(buckets.map((bucket) => bucket.count)).toEqual([1, 0, 0, 0, 1, 1, 1, 1, 1, 0, 1])
  })
})

describe('buildCitationConcentrationLadder', () => {
  it('builds cumulative lifetime citation shares for the standard fixed ladder counts', () => {
    const steps = buildCitationConcentrationLadder([100, 50, 25, 10, 5, 5, 0, 0, 0, 0, 0, 0])

    expect(steps.map((step) => step.label)).toEqual(['Top 1 paper', 'Top 3 papers', 'Top 5 papers', 'Top 10 papers'])
    expect(steps.map((step) => step.paperCount)).toEqual([1, 3, 5, 10])
    expect(steps.map((step) => step.citationCount)).toEqual([100, 175, 190, 195])
    expect(steps[0]?.citationSharePct).toBeCloseTo(51.28, 1)
    expect(steps[1]?.citationSharePct).toBeCloseTo(89.74, 1)
  })

  it('adds a top-25-percent rung when it is distinct from the fixed ladder counts', () => {
    const steps = buildCitationConcentrationLadder(Array.from({ length: 30 }, (_, index) => 30 - index))

    expect(steps.map((step) => step.label)).toEqual(['Top 1 paper', 'Top 3 papers', 'Top 5 papers', 'Top 25%', 'Top 10 papers'])
    expect(steps.map((step) => step.paperCount)).toEqual([1, 3, 5, 8, 10])
    expect(steps.find((step) => step.label === 'Top 25%')?.citationCount).toBe(212)
  })
})

describe('buildCitationMomentumLists', () => {
  it('surfaces older sleeping papers and older fresh-pickup papers from rolling citation counts', () => {
    const { sleeping, freshPickup } = buildCitationMomentumLists([
      { workId: 'sleep-a', year: 2016, title: 'Sleep A', citations: 120, citations1yRolling: 0, citations3yRolling: 12 },
      { workId: 'sleep-b', year: 2018, title: 'Sleep B', citations: 35, citations1yRolling: 1, citations3yRolling: 7 },
      { workId: 'quiet-young', year: 2025, title: 'Quiet Young', citations: 50, citations1yRolling: 0, citations3yRolling: 0 },
      { workId: 'fresh-a', year: 2017, title: 'Fresh A', citations: 28, citations1yRolling: 8, citations3yRolling: 10 },
      { workId: 'fresh-b', year: 2015, title: 'Fresh B', citations: 70, citations1yRolling: 12, citations3yRolling: 15 },
      { workId: 'steady', year: 2014, title: 'Steady', citations: 200, citations1yRolling: 10, citations3yRolling: 30 },
      { workId: 'new-burst', year: 2024, title: 'New Burst', citations: 9, citations1yRolling: 6, citations3yRolling: 6 },
    ], { referenceYear: 2026 })

    expect(sleeping.map((record) => record.workId)).toEqual(['sleep-a', 'sleep-b'])
    expect(freshPickup.map((record) => record.workId)).toEqual(['fresh-b', 'fresh-a'])
    expect(sleeping.some((record) => record.workId === 'quiet-young')).toBe(false)
    expect(freshPickup.some((record) => record.workId === 'new-burst')).toBe(false)
  })
})

describe('buildHIndexHeadlineMetricTiles', () => {
  it('derives h-index runway stats from the publication list when backend summary fields are inconsistent', () => {
    const tile = buildHIndexTile({
      chart_data: {
        years: [2021, 2022, 2023, 2024, 2025],
        values: [8, 9, 10, 11, 11],
        projected_year: 2026,
        projected_value: 12,
        progress_to_next_pct: 95,
        current_h_index: 11,
        next_h_index: 12,
      },
      drilldown: {
        title: 'h-index projection',
        definition: 'Current h-index and one-year projection.',
        formula: 'Largest h where h papers have at least h citations.',
        confidence_note: 'Provider-synced',
        publications: [
          { work_id: 'w-1', title: 'P1', year: 2014, citations_lifetime: 30 },
          { work_id: 'w-2', title: 'P2', year: 2014, citations_lifetime: 25 },
          { work_id: 'w-3', title: 'P3', year: 2015, citations_lifetime: 22 },
          { work_id: 'w-4', title: 'P4', year: 2015, citations_lifetime: 20 },
          { work_id: 'w-5', title: 'P5', year: 2016, citations_lifetime: 19 },
          { work_id: 'w-6', title: 'P6', year: 2016, citations_lifetime: 17 },
          { work_id: 'w-7', title: 'P7', year: 2017, citations_lifetime: 16 },
          { work_id: 'w-8', title: 'P8', year: 2018, citations_lifetime: 15 },
          { work_id: 'w-9', title: 'P9', year: 2019, citations_lifetime: 14 },
          { work_id: 'w-10', title: 'P10', year: 2020, citations_lifetime: 13 },
          { work_id: 'w-11', title: 'P11', year: 2021, citations_lifetime: 11, citations_last_12m: 1 },
          { work_id: 'w-12', title: 'P12', year: 2022, citations_lifetime: 10, citations_last_12m: 0 },
        ],
        metadata: {
          intermediate_values: {
            projected_h_index: 12,
            next_h_target: 12,
            h_core_publication_count: 12,
            citations_needed_for_next_h_total: 9,
            candidate_papers: [
              { work_id: 'w-11', title: 'P11', citations_lifetime: 11, citations_to_next_h: 1, projected_citations_12m: 12, projection_probability: 0.8 },
              { work_id: 'w-12', title: 'P12', citations_lifetime: 10, citations_to_next_h: 2, projected_citations_12m: 12, projection_probability: 0.7 },
            ],
          },
        },
      },
    })
    const stats = buildHIndexDrilldownStats(tile)
    const metrics = buildHIndexHeadlineMetricTiles(tile)

    expect(stats.targetH).toBe(12)
    expect(stats.fullHistoryYears).toEqual([2021, 2022, 2023, 2024, 2025])
    expect(stats.fullHistoryValues).toEqual([8, 9, 10, 11, 11])
    expect(stats.trajectoryPoints.length).toBeGreaterThan(stats.fullHistoryYears.length)
    expect(stats.trajectoryPoints[0]).toMatchObject({ label: '2014-01', value: 1 })
    expect(stats.trajectoryPoints.at(-1)).toMatchObject({ label: '2026-03', value: 11 })
    expect(stats.progressPct).toBeCloseTo(83.3, 1)
    expect(stats.hCorePublicationCount).toBe(11)
    expect(stats.citationsNeededForNextH).toBe(3)
    expect(stats.summaryThresholdSteps.map((step) => ({
      targetH: step.targetH,
      currentMeetingTarget: step.currentMeetingTarget,
      papersNeeded: step.papersNeeded,
      citationsNeeded: step.citationsNeeded,
      nearestGapValues: step.nearestGapValues,
    }))).toEqual([
      {
        targetH: 12,
        currentMeetingTarget: 10,
        papersNeeded: 2,
        citationsNeeded: 3,
        nearestGapValues: [1, 2],
      },
      {
        targetH: 13,
        currentMeetingTarget: 10,
        papersNeeded: 3,
        citationsNeeded: 5,
        nearestGapValues: [2, 3],
      },
    ])
    expect(stats.summaryThresholdCandidates.map((group) => ({
      targetH: group.targetH,
      workIds: group.candidates.map((candidate) => candidate.workId),
      gaps: group.candidates.map((candidate) => candidate.citationsToNextH),
      outlooks: group.candidates.map((candidate) => candidate.projectionOutlookLabel),
    }))).toEqual([
      {
        targetH: 12,
        workIds: ['w-11', 'w-12'],
        gaps: [1, 2],
        outlooks: ['On pace', 'No recent pace'],
      },
      {
        targetH: 13,
        workIds: ['w-11', 'w-12'],
        gaps: [2, 3],
        outlooks: ['Live', 'No recent pace'],
      },
    ])
    expect(metrics.find((metric) => metric.label === 'Citations needed for h12')?.value).toBe('3')
    expect(metrics.find((metric) => metric.label === 'Progress to h12')?.value).toBe('83%')
    expect(metrics.find((metric) => metric.label === 'Papers with 11+ cites')?.value).toBe('11')
  })

  it('shows a broader second-step candidate set when the next-step shortlist would otherwise be almost identical', () => {
    const tile = buildHIndexTile({
      value: 5,
      main_value: 5,
      main_value_display: '5',
      value_display: '5',
      chart_data: {
        years: [2021, 2022, 2023, 2024, 2025],
        values: [3, 4, 5, 5, 5],
        projected_year: 2026,
        projected_value: 6,
        progress_to_next_pct: 83.3,
        current_h_index: 5,
        next_h_index: 6,
      },
      drilldown: {
        title: 'h-index projection',
        definition: 'Current h-index and one-year projection.',
        formula: 'Largest h where h papers have at least h citations.',
        confidence_note: 'Provider-synced',
        publications: [
          { work_id: 'w-1', title: 'P1', year: 2014, citations_lifetime: 20 },
          { work_id: 'w-2', title: 'P2', year: 2014, citations_lifetime: 19 },
          { work_id: 'w-3', title: 'P3', year: 2015, citations_lifetime: 18 },
          { work_id: 'w-4', title: 'P4', year: 2015, citations_lifetime: 17 },
          { work_id: 'w-5', title: 'P5', year: 2016, citations_lifetime: 16 },
          { work_id: 'w-6', title: 'P6', year: 2017, citations_lifetime: 5, citations_last_12m: 1 },
          { work_id: 'w-7', title: 'P7', year: 2018, citations_lifetime: 4, citations_last_12m: 1 },
          { work_id: 'w-8', title: 'P8', year: 2019, citations_lifetime: 4, citations_last_12m: 0 },
          { work_id: 'w-9', title: 'P9', year: 2020, citations_lifetime: 4, citations_last_12m: 0 },
          { work_id: 'w-10', title: 'P10', year: 2021, citations_lifetime: 4, citations_last_12m: 0 },
          { work_id: 'w-11', title: 'P11', year: 2022, citations_lifetime: 4, citations_last_12m: 0 },
          { work_id: 'w-12', title: 'P12', year: 2023, citations_lifetime: 3, citations_last_12m: 0 },
        ],
        metadata: {
          intermediate_values: {
            projected_h_index: 6,
            next_h_target: 6,
          },
        },
      },
    })

    const stats = buildHIndexDrilldownStats(tile)
    const nextStepCandidates = stats.summaryThresholdCandidates[0]?.candidates ?? []
    const followingStepCandidates = stats.summaryThresholdCandidates[1]?.candidates ?? []

    expect(nextStepCandidates.map((candidate) => candidate.workId)).toEqual(['w-6', 'w-7', 'w-8', 'w-9', 'w-10'])
    expect(followingStepCandidates.map((candidate) => candidate.workId)).toEqual(['w-6', 'w-7', 'w-8', 'w-9', 'w-10', 'w-11'])
    expect(followingStepCandidates.length).toBeGreaterThan(nextStepCandidates.length)
  })

  it('prefers the full h-index history from drilldown metadata over the shortened tile chart series', () => {
    const tile = buildHIndexTile({
      chart_data: {
        years: [2021, 2022, 2023, 2024, 2025],
        values: [8, 11, 13, 16, 18],
        current_h_index: 18,
        next_h_index: 19,
      },
      drilldown: {
        title: 'h-index projection',
        definition: 'Current h-index and one-year projection.',
        formula: 'Largest h where h papers have at least h citations.',
        confidence_note: 'Provider-synced',
        publications: [],
        metadata: {
          intermediate_values: {
            h_yearly_years_full: [2016, 2017, 2018, 2019, 2020, 2021, 2022, 2023, 2024, 2025, 2026],
            h_yearly_values_full: [0, 0, 1, 3, 6, 8, 11, 13, 16, 18, 18],
          },
        },
      },
    })

    const stats = buildHIndexDrilldownStats(tile)

    expect(stats.fullHistoryYears).toEqual([2016, 2017, 2018, 2019, 2020, 2021, 2022, 2023, 2024, 2025, 2026])
    expect(stats.fullHistoryValues).toEqual([0, 0, 1, 3, 6, 8, 11, 13, 16, 18, 18])
    expect(stats.trajectoryPoints).toEqual([
      { x: 2016, label: '2016', value: 0 },
      { x: 2018, label: '2018', value: 1 },
      { x: 2019, label: '2019', value: 2 },
      { x: 2019, label: '2019', value: 3 },
      { x: 2020, label: '2020', value: 4 },
      { x: 2020, label: '2020', value: 5 },
      { x: 2020, label: '2020', value: 6 },
      { x: 2021, label: '2021', value: 7 },
      { x: 2021, label: '2021', value: 8 },
      { x: 2022, label: '2022', value: 9 },
      { x: 2022, label: '2022', value: 10 },
      { x: 2022, label: '2022', value: 11 },
      { x: 2023, label: '2023', value: 12 },
      { x: 2023, label: '2023', value: 13 },
      { x: 2024, label: '2024', value: 14 },
      { x: 2024, label: '2024', value: 15 },
      { x: 2024, label: '2024', value: 16 },
      { x: 2025, label: '2025', value: 17 },
      { x: 2025, label: '2025', value: 18 },
      { x: 2026, label: '2026', value: 18 },
    ])
  })

  it('maps senior-role variants into the Senior author h-core bucket', () => {
    const tile = buildHIndexTile({
      drilldown: {
        title: 'h-index projection',
        definition: 'Current h-index and one-year projection.',
        formula: 'Largest h where h papers have at least h citations.',
        confidence_note: 'Provider-synced',
        publications: [
          { work_id: 'w-1', title: 'P1', year: 2014, citations_lifetime: 30, role: 'first' },
          { work_id: 'w-2', title: 'P2', year: 2014, citations_lifetime: 25, role: 'senior' },
          { work_id: 'w-3', title: 'P3', year: 2015, citations_lifetime: 22, role: 'senior author' },
          { work_id: 'w-4', title: 'P4', year: 2015, citations_lifetime: 20, role: 'last author' },
          { work_id: 'w-5', title: 'P5', year: 2016, citations_lifetime: 19, role: 'other' },
          { work_id: 'w-6', title: 'P6', year: 2016, citations_lifetime: 17, role: 'second' },
        ],
        metadata: {
          intermediate_values: {
            projected_h_index: 7,
            next_h_target: 7,
          },
        },
      },
    })

    const stats = buildHIndexDrilldownStats(tile)
    const seniorBucket = stats.authorshipMix.find((bucket) => bucket.label === 'Senior author')

    expect(stats.authorshipMix.map((bucket) => bucket.label)).toEqual([
      'First author',
      'Second author',
      'Other',
      'Senior author',
    ])
    expect(stats.authorshipMix.map((bucket) => bucket.raw)).toEqual([1, 1, 1, 3])
    expect(seniorBucket?.raw).toBe(3)
  })
})
