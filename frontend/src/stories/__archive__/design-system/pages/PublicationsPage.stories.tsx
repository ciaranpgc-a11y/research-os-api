import type { Meta, StoryObj } from '@storybook/react-vite'
import { useMemo, useState, type ReactNode } from 'react'

import { ProfilePublicationsPage } from '@/pages/profile-publications-page'
import type { ProfilePublicationsPageFixture } from '@/pages/profile-publications-page'
import { ACCOUNT_SETTINGS_STORAGE_KEY } from '@/lib/account-preferences'
import { publicationsMetricsHappyFixture } from '@/mocks/fixtures/publications-metrics'
import { StandaloneRouteShell } from '@/stories/pages-review/_helpers/page-review-shells'
import {
  pagesReviewProfilePublicationsDefaultFixture,
} from '@/stories/pages-review/_helpers/profile-publications-fixture'
import type { PersonaWork, PublicationMetricTilePayload, PublicationsTopMetricsPayload } from '@/types/impact'

const meta: Meta<typeof ProfilePublicationsPage> = {
  title: 'Design System/Pages/Publications Page',
  component: ProfilePublicationsPage,
  tags: ['autodocs'],
  parameters: {
    layout: 'fullscreen',
    withRouter: false,
  },
}

export default meta

type PublicationsLiveArgs = {
  paperCount: number
  dataProfile: LiveDataProfile
}

type PublicationsStressScenario = {
  id: string
  label: string
  paperCount: number
  dataProfile: LiveDataProfile
  tileKey: string
}

type LiveDataProfile = 'balanced' | 'volatility' | 'outlier-heavy'

const LIVE_DATASET_DEFAULT_PAPER_COUNT = 48
const LIVE_DATASET_MIN_PAPER_COUNT = 24
const LIVE_DATASET_MAX_PAPER_COUNT = 72
const LIVE_DATASET_STEP = 8
const LIVE_DATASET_DEFAULT_PROFILE: LiveDataProfile = 'volatility'
const STRESS_DATASET_DEFAULT_PAPER_COUNT = 120
const STRESS_DATASET_MIN_PAPER_COUNT = 6
const STRESS_DATASET_MAX_PAPER_COUNT = 480
const LIVE_SERIES_YEARS = [2021, 2022, 2023, 2024, 2025, 2026] as const
const LIVE_MONTH_LABELS = ['Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec', 'Jan', 'Feb']
const STRESS_TILE_OPTIONS: Array<{ key: string; label: string }> = [
  { key: 'this_year_vs_last', label: 'Total publications' },
  { key: 'total_citations', label: 'Citations' },
  { key: 'momentum', label: 'Momentum' },
  { key: 'h_index_projection', label: 'H-index' },
  { key: 'impact_concentration', label: 'Impact concentration' },
  { key: 'field_percentile_share', label: 'Field percentile share' },
  { key: 'authorship_composition', label: 'Authorship composition' },
  { key: 'collaboration_structure', label: 'Collaboration structure' },
  { key: 'influential_citations', label: 'Influential citations' },
]
const STRESS_SCENARIOS: PublicationsStressScenario[] = [
  {
    id: 'balanced-baseline',
    label: 'Balanced baseline',
    paperCount: 120,
    dataProfile: 'balanced',
    tileKey: 'this_year_vs_last',
  },
  {
    id: 'volatility-spike',
    label: 'Volatility spike',
    paperCount: 240,
    dataProfile: 'volatility',
    tileKey: 'momentum',
  },
  {
    id: 'outlier-tail',
    label: 'Outlier-heavy tail',
    paperCount: 240,
    dataProfile: 'outlier-heavy',
    tileKey: 'impact_concentration',
  },
]
const STRESS_RANGE_SCENARIOS: PublicationsStressScenario[] = [
  {
    id: 'balanced-low',
    label: 'Balanced • 6',
    paperCount: 6,
    dataProfile: 'balanced',
    tileKey: 'this_year_vs_last',
  },
  {
    id: 'balanced-high',
    label: 'Balanced • 360',
    paperCount: 360,
    dataProfile: 'balanced',
    tileKey: 'this_year_vs_last',
  },
  {
    id: 'volatility-low',
    label: 'Volatility • 6',
    paperCount: 6,
    dataProfile: 'volatility',
    tileKey: 'momentum',
  },
  {
    id: 'volatility-high',
    label: 'Volatility • 360',
    paperCount: 360,
    dataProfile: 'volatility',
    tileKey: 'momentum',
  },
  {
    id: 'outlier-low',
    label: 'Outlier • 6',
    paperCount: 6,
    dataProfile: 'outlier-heavy',
    tileKey: 'impact_concentration',
  },
  {
    id: 'outlier-high',
    label: 'Outlier • 360',
    paperCount: 360,
    dataProfile: 'outlier-heavy',
    tileKey: 'impact_concentration',
  },
]

function clampNonNegative(value: number): number {
  if (!Number.isFinite(value)) {
    return 0
  }
  return Math.max(0, Math.round(value))
}

function allocateByWeights(total: number, weights: number[]): number[] {
  const safeTotal = Math.max(0, Math.round(total))
  const safeWeights = weights.map((item) => Math.max(0, item))
  const weightSum = safeWeights.reduce((sum, item) => sum + item, 0)
  if (safeTotal === 0) {
    return safeWeights.map(() => 0)
  }
  if (weightSum <= 0) {
    const base = Math.floor(safeTotal / Math.max(1, safeWeights.length))
    const remainder = safeTotal - (base * safeWeights.length)
    return safeWeights.map((_, index) => base + (index < remainder ? 1 : 0))
  }
  const raw = safeWeights.map((weight) => (weight / weightSum) * safeTotal)
  const floors = raw.map((value) => Math.floor(value))
  let remainder = safeTotal - floors.reduce((sum, value) => sum + value, 0)
  if (remainder > 0) {
    const ranking = raw
      .map((value, index) => ({ index, frac: value - Math.floor(value) }))
      .sort((a, b) => b.frac - a.frac)
    for (let cursor = 0; cursor < ranking.length && remainder > 0; cursor += 1) {
      floors[ranking[cursor].index] += 1
      remainder -= 1
    }
  }
  return floors
}

function yearWeightsForProfile(profile: LiveDataProfile): number[] {
  if (profile === 'volatility') {
    return [0.08, 0.34, 0.06, 0.27, 0.07, 0.18]
  }
  if (profile === 'outlier-heavy') {
    return [0.24, 0.18, 0.2, 0.16, 0.13, 0.09]
  }
  return [0.13, 0.15, 0.17, 0.19, 0.2, 0.16]
}

function buildYearPool(paperCount: number, profile: LiveDataProfile): number[] {
  const allocations = allocateByWeights(paperCount, yearWeightsForProfile(profile))
  const years: number[] = []
  for (let index = 0; index < LIVE_SERIES_YEARS.length; index += 1) {
    const year = LIVE_SERIES_YEARS[index]
    const count = allocations[index] || 0
    for (let cursor = 0; cursor < count; cursor += 1) {
      years.push(year)
    }
  }
  if (years.length < paperCount) {
    while (years.length < paperCount) {
      years.push(LIVE_SERIES_YEARS[years.length % LIVE_SERIES_YEARS.length])
    }
  }
  if (years.length > paperCount) {
    years.length = paperCount
  }
  return years
}

function buildMomentumSeries(profile: LiveDataProfile): number[] {
  if (profile === 'volatility') {
    return [8, 130, 12, 190, 16, 240, 14, 280, 20, 330, 24, 390]
  }
  if (profile === 'outlier-heavy') {
    return [5, 6, 8, 10, 12, 14, 18, 24, 38, 64, 182, 420]
  }
  return [66, 72, 75, 79, 82, 88, 93, 98, 101, 108, 116, 124]
}

function buildCitationsForWork(profile: LiveDataProfile, index: number, paperCount: number, year: number): number {
  if (profile === 'volatility') {
    const phase = index % 12
    const recencyPenalty = year >= 2025 ? 0.62 : 1
    if (phase <= 6) {
      return clampNonNegative((2 + ((index * 5) % 14)) * recencyPenalty)
    }
    if (phase <= 9) {
      return clampNonNegative((70 + ((index * 23) % 180)) * recencyPenalty)
    }
    return clampNonNegative((1200 + ((paperCount - index) * 41) % 3600) * recencyPenalty)
  }
  if (profile === 'outlier-heavy') {
    const eliteCutoff = Math.max(1, Math.round(paperCount * 0.05))
    const strongCutoff = Math.max(eliteCutoff + 1, Math.round(paperCount * 0.2))
    if (index < eliteCutoff) {
      return clampNonNegative(2600 + ((paperCount - index) * 59) % 5200)
    }
    if (index < strongCutoff) {
      return clampNonNegative(220 + ((index * 29) % 620))
    }
    return clampNonNegative(1 + ((index * 3) % 22))
  }
  return clampNonNegative(18 + (paperCount - 1 - index) * 2 + (index % 7) * 3)
}

function profileLabel(profile: LiveDataProfile): string {
  if (profile === 'volatility') {
    return 'Volatility stress'
  }
  if (profile === 'outlier-heavy') {
    return 'Outlier-heavy skew'
  }
  return 'Balanced baseline'
}

function PublicationsLayoutPreview({ children }: { children: ReactNode }) {
  return (
    <div
      className="sb-publications-layout-preview"
      style={{
        ['--sb-publications-content-max' as string]: '94rem',
        ['--sb-publications-gutter' as string]: '1.25rem',
        ['--sb-publications-grid-gap' as string]: '0.95rem',
        ['--sb-publications-grid-padding' as string]: '0.75rem',
        ['--sb-publications-tile-min' as string]: '24rem',
      }}
    >
      <style>{`
        .sb-publications-layout-preview [data-house-role="content-container"].house-content-container-wide {
          margin-inline: auto;
          max-width: var(--sb-publications-content-max);
          padding-inline: var(--sb-publications-gutter);
        }
        .sb-publications-layout-preview .publications-insights-grid {
          gap: var(--sb-publications-grid-gap);
          padding-top: 0;
          padding-bottom: var(--sb-publications-grid-padding);
          padding-inline: 0;
        }
        @media (min-width: 1024px) {
          .sb-publications-layout-preview .publications-insights-grid {
            grid-template-columns: repeat(auto-fit, minmax(var(--sb-publications-tile-min), 1fr));
          }
        }
      `}</style>
      {children}
    </div>
  )
}

function cloneFixture<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T
}

function createTopMetricsPayload(
  totalPublications: number,
  totalCitations: number,
  paperCount: number,
  dataProfile: LiveDataProfile,
  publicationSeries: { years: number[]; values: number[]; currentYearYtd: number },
  citationSeries: { years: number[]; values: number[]; currentYearYtd: number },
  momentumSeries: number[],
): PublicationsTopMetricsPayload {
  const payload = cloneFixture(publicationsMetricsHappyFixture)
  payload.tiles = buildTopMetricTiles(
    totalPublications,
    totalCitations,
    dataProfile,
    publicationSeries,
    citationSeries,
    momentumSeries,
  )
  payload.status = 'READY'
  payload.is_updating = false
  payload.is_stale = false
  payload.last_error = null
  // Update timestamp to trigger animation replay when paperCount changes
  payload.data_last_refreshed = new Date(Date.now() + paperCount).toISOString()
  return payload
}

function buildTopMetricTiles(
  totalPublications: number,
  totalCitations: number,
  dataProfile: LiveDataProfile,
  publicationSeries: { years: number[]; values: number[]; currentYearYtd: number },
  citationSeries: { years: number[]; values: number[]; currentYearYtd: number },
  momentumSeries: number[],
): PublicationMetricTilePayload[] {
  const momentumStart = Math.max(1, momentumSeries[0] || 1)
  const momentumEnd = Math.max(1, momentumSeries[momentumSeries.length - 1] || momentumStart)
  const momentumPct = Math.round(((momentumEnd - momentumStart) / momentumStart) * 100)
  const impactSharePct = dataProfile === 'outlier-heavy' ? 82 : dataProfile === 'volatility' ? 63 : 26
  const uniqueCollaborators = dataProfile === 'outlier-heavy'
    ? Math.max(240, Math.round(totalPublications * 7.5))
    : dataProfile === 'volatility'
      ? Math.max(180, Math.round(totalPublications * 5.6))
      : Math.max(120, Math.round(totalPublications * 4.2))
  const baseDrilldown = {
    title: 'Metric detail',
    definition: 'Fixture drilldown for Storybook live preview.',
    formula: 'Derived from synthetic story data',
    confidence_note: 'Synthetic data for visual QA only.',
    publications: [],
    metadata: {},
  }
  const baseTile: Omit<PublicationMetricTilePayload, 'id' | 'key' | 'label' | 'main_value' | 'value' | 'main_value_display' | 'value_display' | 'subtext' | 'chart_data' | 'chart_type'> = {
    delta_value: null,
    delta_display: null,
    delta_direction: 'flat',
    delta_tone: 'neutral',
    delta_color_code: 'hsl(var(--tone-neutral-600))',
    unit: null,
    badge: {},
    sparkline: [],
    sparkline_overlay: [],
    tooltip: 'Synthetic fixture metric',
    tooltip_details: {},
    data_source: ['OpenAlex'],
    confidence_score: 0.9,
    stability: 'stable',
    drilldown: baseDrilldown,
  }

  return [
    {
      ...baseTile,
      id: 'tile-total-publications',
      key: 'this_year_vs_last',
      label: 'Total publications',
      main_value: totalPublications,
      value: totalPublications,
      main_value_display: `${totalPublications}`,
      value_display: `${totalPublications}`,
      subtext: 'Lifetime publications',
      chart_type: 'bars',
      chart_data: {
        years: publicationSeries.years,
        values: publicationSeries.values,
        projected_year: publicationSeries.years[publicationSeries.years.length - 1] || 2026,
        current_year_ytd: publicationSeries.currentYearYtd,
      },
      sparkline: publicationSeries.values,
    },
    {
      ...baseTile,
      id: 'tile-total-citations',
      key: 'total_citations',
      label: 'Citations',
      main_value: totalCitations,
      value: totalCitations,
      main_value_display: totalCitations.toLocaleString(),
      value_display: totalCitations.toLocaleString(),
      subtext: 'Lifetime citations',
      chart_type: 'bars',
      chart_data: {
        years: citationSeries.years,
        values: citationSeries.values,
        projected_year: citationSeries.years[citationSeries.years.length - 1] || 2026,
        current_year_ytd: citationSeries.currentYearYtd,
      },
      sparkline: citationSeries.values,
    },
    {
      ...baseTile,
      id: 'tile-momentum',
      key: 'momentum',
      label: 'Momentum',
      main_value: momentumPct,
      value: momentumPct,
      main_value_display: `${momentumPct >= 0 ? '+' : ''}${momentumPct}%`,
      value_display: `${momentumPct >= 0 ? '+' : ''}${momentumPct}%`,
      subtext: 'Citation pace',
      chart_type: 'bars',
      chart_data: {
        monthly_values_12m: momentumSeries,
        month_labels_12m: LIVE_MONTH_LABELS,
      },
      sparkline: momentumSeries,
    },
    {
      ...baseTile,
      id: 'tile-h-index',
      key: 'h_index_projection',
      label: 'H-index',
      main_value: 18,
      value: 18,
      main_value_display: 'h 18',
      value_display: 'h 18',
      subtext: 'Progress to h 19',
      chart_type: 'line',
      chart_data: {
        current_h_index: 18,
        next_h_index: 19,
        progress_to_next_pct: 90,
        candidate_gaps: [0, 1, 1, 2, 3, 4],
        years: [2021, 2022, 2023, 2024, 2025, 2026],
        values: [11, 14, 15, 16, 18, 18],
      },
      sparkline: [11, 14, 15, 16, 18, 18],
    },
    {
      ...baseTile,
      id: 'tile-impact-concentration',
      key: 'impact_concentration',
      label: 'Impact concentration',
      main_value: impactSharePct,
      value: impactSharePct,
      main_value_display: `${impactSharePct}%`,
      value_display: `${impactSharePct}%`,
      subtext: `Top 3 cited publications account for ${impactSharePct}% of total citations`,
      chart_type: 'ring',
      chart_data: {
        values: [impactSharePct, 100 - impactSharePct],
        top_papers_count: 3,
        total_publications: totalPublications,
      },
      badge: { label: dataProfile === 'outlier-heavy' ? 'Extreme concentration' : 'Breakthrough-skewed' },
      sparkline: [impactSharePct, 100 - impactSharePct],
    },
    {
      ...baseTile,
      id: 'tile-field-percentile',
      key: 'field_percentile_share',
      label: 'Field percentile share',
      main_value: 58,
      value: 58,
      main_value_display: '58%',
      value_display: '58%',
      subtext: 'Papers at or above 75% percentile',
      chart_type: 'ring',
      chart_data: {
        thresholds: [50, 75, 90, 95, 99],
        default_threshold: 75,
        evaluated_papers: 67,
        share_by_threshold_pct: {
          '50': 76,
          '75': 58,
          '90': 32,
          '95': 19,
          '99': 8,
        },
        count_by_threshold: {
          '50': 51,
          '75': 39,
          '90': 21,
          '95': 13,
          '99': 5,
        },
      },
      sparkline: [76, 58, 32, 19, 8],
    },
    {
      ...baseTile,
      id: 'tile-authorship',
      key: 'authorship_composition',
      label: 'Authorship composition',
      main_value: 16,
      value: 16,
      main_value_display: '16%',
      value_display: '16%',
      subtext: 'Leadership index',
      chart_type: 'bars',
      chart_data: {
        first_authorship_pct: 16,
        second_authorship_pct: 15,
        senior_authorship_pct: 0,
        leadership_index_pct: 16,
        total_papers: totalPublications,
        median_author_position: 2,
        median_author_position_display: '2',
      },
      sparkline: [16, 15, 0, 16],
    },
    {
      ...baseTile,
      id: 'tile-collaboration',
      key: 'collaboration_structure',
      label: 'Collaboration structure',
      main_value: uniqueCollaborators,
      value: uniqueCollaborators,
      main_value_display: `${uniqueCollaborators}`,
      value_display: `${uniqueCollaborators}`,
      subtext: 'Unique collaborators',
      chart_type: 'bars',
      chart_data: {
        unique_collaborators: uniqueCollaborators,
        repeat_collaborator_rate_pct: dataProfile === 'outlier-heavy' ? 28 : dataProfile === 'volatility' ? 41 : 62,
        institutions_count: dataProfile === 'outlier-heavy' ? 312 : dataProfile === 'volatility' ? 244 : 136,
        countries_count: dataProfile === 'outlier-heavy' ? 41 : dataProfile === 'volatility' ? 29 : 16,
      },
      sparkline: dataProfile === 'outlier-heavy'
        ? [82, 108, 144, 188, 251, uniqueCollaborators]
        : dataProfile === 'volatility'
          ? [94, 156, 122, 214, 176, uniqueCollaborators]
          : [210, 260, 315, 372, 420, uniqueCollaborators],
    },
    {
      ...baseTile,
      id: 'tile-influential',
      key: 'influential_citations',
      label: 'Influential citations',
      main_value: 46,
      value: 46,
      main_value_display: '46',
      value_display: '46',
      subtext: 'Influential citations',
      chart_type: 'line',
      chart_data: {
        influential_ratio_pct: 4,
        values: [2, 2, 3, 6, 8, 9, 13, 26, 31, 36, 46, 46],
      },
      sparkline: [2, 2, 3, 6, 8, 9, 13, 26, 31, 36, 46, 46],
    },
  ]
}

function buildLargePublicationsFixture(paperCount: number, dataProfile: LiveDataProfile): ProfilePublicationsPageFixture {
  const fixture = cloneFixture(pagesReviewProfilePublicationsDefaultFixture)
  if (!fixture.personaState || !fixture.analyticsResponse) {
    throw new Error('Publications fixture missing personaState or analyticsResponse')
  }
  const personaState = fixture.personaState
  const analyticsResponse = fixture.analyticsResponse
  const publicationTypes = ['journal-article', 'review-article', 'conference-paper', 'preprint', 'book-chapter']
  const venues = [
    'European Heart Journal',
    'JACC Imaging',
    'Circulation',
    'Nature Medicine',
    'BMJ',
    'The Lancet Digital Health',
    'PLOS ONE',
    'NEJM',
    'Heart',
    'Journal of Clinical Oncology',
  ]
  const keywords = [
    ['cardio-oncology', 'cohort', 'echo'],
    ['registry', 'outcomes', 'risk'],
    ['machine learning', 'imaging', 'validation'],
    ['guideline', 'implementation', 'workflow'],
    ['meta-analysis', 'survival', 'quality'],
  ]
  const authorPools = [
    ['Storybook User', 'A. Patel', 'D. Kim'],
    ['Storybook User', 'L. Santos', 'T. Price'],
    ['Storybook User', 'N. Green', 'M. Iqbal'],
    ['Storybook User', 'R. Singh', 'S. Roy'],
    ['Storybook User', 'K. Turner', 'J. Wong'],
  ]
  const yearPool = buildYearPool(paperCount, dataProfile)
  const generatedWorks: PersonaWork[] = Array.from({ length: paperCount }, (_, index) => {
    const number = index + 1
    const year = yearPool[index] || LIVE_SERIES_YEARS[index % LIVE_SERIES_YEARS.length]
    const type = publicationTypes[index % publicationTypes.length]
    const venue = venues[index % venues.length]
    const authorSet = authorPools[index % authorPools.length]
    return {
      id: `W-LARGE-${number.toString().padStart(3, '0')}`,
      title: `Cardio-Oncology Evidence Series ${number}: Prospective Validation of Structured Signal Pathways`,
      year,
      doi: `10.1000/axiomos.${year}.${number.toString().padStart(3, '0')}`,
      work_type: type,
      publication_type: type,
      venue_name: venue,
      publisher: 'Axiomos Press',
      abstract:
        `Study ${number} evaluates longitudinal markers, comparative outcomes, and intervention timing across harmonized cohorts. ` +
        'Methods include prospective modeling, registry linkage, and sensitivity analyses with reproducible pipelines.',
      keywords: keywords[index % keywords.length],
      url: `https://example.org/works/${number}`,
      provenance: 'openalex',
      cluster_id: `c${(index % 5) + 1}`,
      authors: authorSet,
      user_author_position: 1,
      author_count: authorSet.length,
      pmid: `${510000 + number}`,
      journal_impact_factor: Number((3.2 + (index % 10) * 0.9).toFixed(1)),
      created_at: '2025-01-10T09:00:00Z',
      updated_at: '2026-03-01T09:00:00Z',
    }
  })

  const metricsWorks = generatedWorks.map((work, index) => {
    const citations = buildCitationsForWork(dataProfile, index, paperCount, work.year ?? 2026)
    return {
      work_id: work.id,
      title: work.title,
      year: work.year,
      citations,
      provider: 'openalex',
    }
  })

  const totalCitations = metricsWorks.reduce((sum, item) => sum + item.citations, 0)
  const citationsLast12 = Math.round(totalCitations * 0.19)
  const citationsPrev12 = Math.round(totalCitations * 0.14)
  const citationsYoy = citationsPrev12 > 0
    ? Number((((citationsLast12 - citationsPrev12) / citationsPrev12) * 100).toFixed(1))
    : null

  const citationsByYear = new Map<number, number>()
  const publicationsByYear = new Map<number, number>()
  for (const entry of metricsWorks) {
    if (entry.year == null) {
      continue
    }
    citationsByYear.set(entry.year, (citationsByYear.get(entry.year) || 0) + entry.citations)
    publicationsByYear.set(entry.year, (publicationsByYear.get(entry.year) || 0) + 1)
  }
  const timeline = Array.from(citationsByYear.entries())
    .sort((a, b) => a[0] - b[0])
    .map(([year, citations]) => ({
      year,
      n_works: generatedWorks.filter((work) => work.year === year).length,
      citations,
    }))

  personaState.works = generatedWorks
  personaState.metrics.works = metricsWorks
  personaState.timeline = timeline
  personaState.metrics.histogram = {
    '0-10': metricsWorks.filter((work) => work.citations <= 10).length,
    '11-50': metricsWorks.filter((work) => work.citations > 10 && work.citations <= 50).length,
    '51-100': metricsWorks.filter((work) => work.citations > 50 && work.citations <= 100).length,
    '101+': metricsWorks.filter((work) => work.citations > 100).length,
  }
  personaState.metrics.trend = {
    citations_last_12_months: citationsLast12,
    citations_previous_12_months: citationsPrev12,
    yoy_growth_percent: citationsYoy,
    yearly_growth: timeline.map((point, idx) => ({
      year: point.year,
      citations_added: point.citations,
      total_citations_end_year:
        timeline.slice(0, idx + 1).reduce((sum, current) => sum + current.citations, 0),
    })),
  }
  personaState.context = {
    dominant_themes: ['Cardio-oncology outcomes', 'Imaging and diagnostics', 'Registry intelligence'],
    common_study_types: ['Prospective cohort', 'Registry analysis', 'Comparative effectiveness'],
    top_venues: venues.slice(0, 5),
    frequent_collaborators: ['A. Patel', 'L. Santos', 'D. Kim', 'S. Roy'],
    methodological_patterns: ['Structured extraction', 'Longitudinal follow-up', 'Cross-cohort validation'],
    works_used: generatedWorks.slice(0, 10).map((work) => ({
      work_id: work.id,
      title: work.title,
      year: work.year,
      doi: work.doi,
    })),
  }

  analyticsResponse.payload.summary.total_citations = totalCitations
  analyticsResponse.payload.summary.h_index = 42
  analyticsResponse.payload.summary.citations_last_12_months = citationsLast12
  analyticsResponse.payload.summary.citations_previous_12_months = citationsPrev12
  analyticsResponse.payload.summary.yoy_percent = citationsYoy
  analyticsResponse.payload.summary.yoy_pct = citationsYoy
  analyticsResponse.payload.summary.citations_per_month_12m = Number((citationsLast12 / 12).toFixed(1))
  analyticsResponse.payload.summary.citations_per_month_previous_12m = Number((citationsPrev12 / 12).toFixed(1))
  analyticsResponse.payload.summary.acceleration_citations_per_month = Number(
    ((citationsLast12 - citationsPrev12) / 12).toFixed(1),
  )
  analyticsResponse.payload.summary.top5_share_12m_pct = 67.4
  analyticsResponse.payload.summary.top10_share_12m_pct = 82.1
  analyticsResponse.payload.timeseries.points = timeline.map((point, idx) => ({
    year: point.year,
    citations_added: point.citations,
    total_citations_end_year:
      timeline.slice(0, idx + 1).reduce((sum, current) => sum + current.citations, 0),
  }))
  const publicationSeries = {
    years: [...LIVE_SERIES_YEARS],
    values: LIVE_SERIES_YEARS.map((year) => publicationsByYear.get(year) || 0),
    currentYearYtd: publicationsByYear.get(2026) || 0,
  }
  const citationSeries = {
    years: [...LIVE_SERIES_YEARS],
    values: LIVE_SERIES_YEARS.map((year) => citationsByYear.get(year) || 0),
    currentYearYtd: citationsByYear.get(2026) || 0,
  }
  const momentumSeries = buildMomentumSeries(dataProfile)
  fixture.topMetricsResponse = createTopMetricsPayload(
    generatedWorks.length,
    totalCitations,
    paperCount,
    dataProfile,
    publicationSeries,
    citationSeries,
    momentumSeries,
  )
  fixture.topMetricsResponse.metadata = {
    ...(fixture.topMetricsResponse.metadata || {}),
    storyProfile: dataProfile,
    storyProfileLabel: profileLabel(dataProfile),
  }
  fixture.forceInsightsVisible = true

  return fixture
}

function ensurePublicationInsightsVisibleDefault(): void {
  if (typeof window === 'undefined') {
    return
  }
  try {
    const raw = window.localStorage.getItem(ACCOUNT_SETTINGS_STORAGE_KEY)
    let parsed: Record<string, unknown> = {}
    if (raw) {
      try {
        const candidate = JSON.parse(raw) as unknown
        parsed = candidate && typeof candidate === 'object' && !Array.isArray(candidate)
          ? candidate as Record<string, unknown>
          : {}
      } catch {
        parsed = {}
      }
    }
    if (parsed.publicationInsightsDefaultVisibility !== 'visible') {
      window.localStorage.setItem(
        ACCOUNT_SETTINGS_STORAGE_KEY,
        JSON.stringify({
          ...parsed,
          publicationInsightsDefaultVisibility: 'visible',
        }),
      )
    }
  } catch {
    // Ignore storage errors in restricted iframe/browser contexts.
  }
}

function PublicationsCompleteLive({ paperCount, dataProfile }: PublicationsLiveArgs) {
  ensurePublicationInsightsVisibleDefault()
  const normalizedPaperCount = Math.max(
    LIVE_DATASET_MIN_PAPER_COUNT,
    Math.min(LIVE_DATASET_MAX_PAPER_COUNT, Math.round(Number(paperCount) || LIVE_DATASET_DEFAULT_PAPER_COUNT)),
  )
  const fixture = useMemo(() => {
    const next = buildLargePublicationsFixture(normalizedPaperCount, dataProfile)
    // In Storybook, always disable auth-dependent network fetches.
    next.token = ''
    return next
  }, [dataProfile, normalizedPaperCount])
  return (
    <PublicationsLayoutPreview>
      <StandaloneRouteShell
        initialEntry="/profile/publications"
        path="/profile/publications"
        element={<ProfilePublicationsPage fixture={fixture} />}
      />
    </PublicationsLayoutPreview>
  )
}

function PublicationsStressHarness() {
  ensurePublicationInsightsVisibleDefault()
  const [paperCount, setPaperCount] = useState<number>(STRESS_DATASET_DEFAULT_PAPER_COUNT)
  const [dataProfile, setDataProfile] = useState<LiveDataProfile>('volatility')
  const [drilldownTileKey, setDrilldownTileKey] = useState<string>('momentum')
  const normalizedPaperCount = Math.max(
    STRESS_DATASET_MIN_PAPER_COUNT,
    Math.min(STRESS_DATASET_MAX_PAPER_COUNT, Math.round(Number(paperCount) || STRESS_DATASET_DEFAULT_PAPER_COUNT)),
  )

  const fixture = useMemo(() => {
    const next = buildLargePublicationsFixture(normalizedPaperCount, dataProfile)
    next.token = ''
    return next
  }, [dataProfile, normalizedPaperCount])

  const openSelectedTileDrilldown = () => {
    const selector = `.publications-insights-grid [data-metric-key="${drilldownTileKey}"]`
    const target = document.querySelector(selector)
    if (target instanceof HTMLElement) {
      target.click()
    }
  }

  return (
    <PublicationsLayoutPreview>
      <div className="mx-auto w-full max-w-[94rem] px-5 pt-4">
        <div className="rounded-md border border-border bg-card p-3">
          <div className="flex flex-wrap items-center gap-2">
            {STRESS_SCENARIOS.map((scenario) => (
              <button
                key={scenario.id}
                type="button"
                className="rounded-md border border-border bg-background px-3 py-1 text-xs font-semibold text-foreground hover:bg-accent"
                onClick={() => {
                  setPaperCount(scenario.paperCount)
                  setDataProfile(scenario.dataProfile)
                  setDrilldownTileKey(scenario.tileKey)
                }}
              >
                {scenario.label}
              </button>
            ))}
          </div>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            {STRESS_RANGE_SCENARIOS.map((scenario) => (
              <button
                key={scenario.id}
                type="button"
                className="rounded-md border border-border bg-background px-3 py-1 text-xs font-semibold text-foreground hover:bg-accent"
                onClick={() => {
                  setPaperCount(scenario.paperCount)
                  setDataProfile(scenario.dataProfile)
                  setDrilldownTileKey(scenario.tileKey)
                }}
              >
                {scenario.label}
              </button>
            ))}
            <label className="ml-auto flex items-center gap-2 text-xs font-semibold text-muted-foreground">
              Drilldown tile
              <select
                className="h-8 rounded-md border border-border bg-background px-2 text-xs text-foreground"
                value={drilldownTileKey}
                onChange={(event) => setDrilldownTileKey(event.target.value)}
              >
                {STRESS_TILE_OPTIONS.map((option) => (
                  <option key={option.key} value={option.key}>{option.label}</option>
                ))}
              </select>
              <button
                type="button"
                className="rounded-md border border-border bg-background px-3 py-1 text-xs font-semibold text-foreground hover:bg-accent"
                onClick={openSelectedTileDrilldown}
              >
                Open drilldown
              </button>
            </label>
          </div>
          <p className="mt-2 text-xs text-muted-foreground">
            Active profile: {profileLabel(dataProfile)} • papers: {normalizedPaperCount}
          </p>
        </div>
      </div>
      <StandaloneRouteShell
        initialEntry="/profile/publications"
        path="/profile/publications"
        element={<ProfilePublicationsPage fixture={fixture} />}
      />
    </PublicationsLayoutPreview>
  )
}

export const Live: StoryObj<PublicationsLiveArgs> = {
  name: 'Live Dataset',
  args: {
    paperCount: LIVE_DATASET_DEFAULT_PAPER_COUNT,
    dataProfile: LIVE_DATASET_DEFAULT_PROFILE,
  },
  argTypes: {
    paperCount: {
      control: { type: 'range', min: LIVE_DATASET_MIN_PAPER_COUNT, max: LIVE_DATASET_MAX_PAPER_COUNT, step: LIVE_DATASET_STEP },
      description: 'Number of synthetic publications generated for the live preview',
    },
    dataProfile: {
      control: { type: 'radio' },
      options: ['balanced', 'volatility', 'outlier-heavy'],
      description: 'Synthetic data profile used to stress different chart and distribution extremes',
    },
  },
  render: ({ paperCount, dataProfile }) => <PublicationsCompleteLive paperCount={paperCount} dataProfile={dataProfile} />,
}

export const StressHarness: StoryObj = {
  name: 'Stress Test Harness',
  render: () => <PublicationsStressHarness />,
}
