import type { Meta, StoryObj } from '@storybook/react'
import type { ReactNode } from 'react'

import { ProfilePublicationsPage } from '@/pages/profile-publications-page'
import type { ProfilePublicationsPageFixture } from '@/pages/profile-publications-page'
import { ACCOUNT_SETTINGS_STORAGE_KEY } from '@/lib/account-preferences'
import { AccountRouteShell } from '@/stories/pages-review/_helpers/page-review-shells'
import {
  pagesReviewProfilePublicationsDefaultFixture,
} from '@/stories/pages-review/_helpers/profile-publications-fixture'
import type { PersonaWork, PublicationMetricTilePayload } from '@/types/impact'

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
          padding: var(--sb-publications-grid-padding);
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

function buildTopMetricTiles(totalPublications: number, totalCitations: number): PublicationMetricTilePayload[] {
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
        years: [2021, 2022, 2023, 2024, 2025, 2026],
        values: [24, 28, 24, 28, 3, 1],
        projected_year: 2026,
        current_year_ytd: 1,
      },
      sparkline: [24, 28, 24, 28, 3, 1],
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
        years: [2021, 2022, 2023, 2024, 2025, 2026],
        values: [1160, 1640, 2085, 2120, 1490, 420],
        projected_year: 2026,
        current_year_ytd: 420,
      },
      sparkline: [1160, 1640, 2085, 2120, 1490, 420],
    },
    {
      ...baseTile,
      id: 'tile-momentum',
      key: 'momentum',
      label: 'Momentum',
      main_value: 87,
      value: 87,
      main_value_display: '+87%',
      value_display: '+87%',
      subtext: 'Citation pace',
      chart_type: 'bars',
      chart_data: {
        monthly_values_12m: [66, 72, 75, 79, 82, 88, 93, 98, 101, 108, 116, 124],
        month_labels_12m: ['Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec', 'Jan', 'Feb'],
      },
      sparkline: [66, 72, 75, 79, 82, 88, 93, 98, 101, 108, 116, 124],
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
      main_value: 26,
      value: 26,
      main_value_display: '26%',
      value_display: '26%',
      subtext: 'Top 3 cited publications account for 26% of total citations',
      chart_type: 'ring',
      chart_data: {
        values: [26, 74],
        top_papers_count: 3,
        total_publications: totalPublications,
      },
      badge: { label: 'Breakthrough-skewed' },
      sparkline: [26, 74],
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
      main_value: 448,
      value: 448,
      main_value_display: '448',
      value_display: '448',
      subtext: 'Unique collaborators',
      chart_type: 'bars',
      chart_data: {
        unique_collaborators: 448,
        repeat_collaborator_rate_pct: 62,
        institutions_count: 136,
        countries_count: 16,
      },
      sparkline: [210, 260, 315, 372, 420, 448],
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

function buildLargePublicationsFixture(paperCount: number): ProfilePublicationsPageFixture {
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
  const generatedWorks: PersonaWork[] = Array.from({ length: paperCount }, (_, index) => {
    const number = index + 1
    const year = 2026 - (index % 8)
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
    const citations = Math.max(4, 18 + (paperCount - 1 - index) * 2 + (index % 7) * 3)
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
  for (const entry of metricsWorks) {
    if (entry.year == null) {
      continue
    }
    citationsByYear.set(entry.year, (citationsByYear.get(entry.year) || 0) + entry.citations)
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
  if (fixture.topMetricsResponse) {
    fixture.topMetricsResponse.tiles = buildTopMetricTiles(generatedWorks.length, totalCitations)
    fixture.topMetricsResponse.status = 'READY'
    fixture.topMetricsResponse.is_updating = false
    fixture.topMetricsResponse.is_stale = false
    fixture.topMetricsResponse.last_error = null
    // Update timestamp to trigger animation replay when paperCount changes
    fixture.topMetricsResponse.data_last_refreshed = new Date(Date.now() + paperCount).toISOString()
  }

  return fixture
}

function PublicationsCompleteLive({ paperCount }: PublicationsLiveArgs) {
  if (typeof window !== 'undefined') {
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
  }
  const fixture = buildLargePublicationsFixture(paperCount)
  return (
    <PublicationsLayoutPreview>
      <AccountRouteShell
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
    paperCount: 150,
  },
  argTypes: {
    paperCount: {
      control: { type: 'range', min: 25, max: 300, step: 25 },
      description: 'Number of synthetic publications generated for the live preview',
    },
  },
  render: ({ paperCount }) => <PublicationsCompleteLive paperCount={paperCount} />,
}
