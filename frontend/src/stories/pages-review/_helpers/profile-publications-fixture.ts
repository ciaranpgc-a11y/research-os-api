import type {
  AuthUser,
  PersonaStatePayload,
  PublicationsAnalyticsResponsePayload,
  PublicationsTopMetricsPayload,
} from '@/types/impact'
import { publicationsMetricsHappyFixture } from '@/mocks/fixtures/publications-metrics'
import type { ProfilePublicationsPageFixture } from '@/pages/profile-publications-page'

const FIXTURE_TIME = '2026-02-27T09:00:00Z'

const fixtureUser: AuthUser = {
  id: 'storybook-user-1',
  account_key: 'acct_storybook',
  email: 'storybook.user@example.org',
  name: 'Storybook User',
  is_active: true,
  role: 'user',
  orcid_id: '0000-0002-1825-0097',
  impact_last_computed_at: FIXTURE_TIME,
  email_verified_at: FIXTURE_TIME,
  last_sign_in_at: FIXTURE_TIME,
  created_at: '2024-10-11T08:00:00Z',
  updated_at: FIXTURE_TIME,
}

const fixturePersonaState: PersonaStatePayload = {
  works: [
    {
      id: 'W-101',
      title: 'Longitudinal Echocardiography Markers in Cardio-Oncology',
      year: 2022,
      doi: '10.1000/story.101',
      work_type: 'journal-article',
      publication_type: 'journal-article',
      venue_name: 'European Heart Journal',
      publisher: 'OUP',
      abstract: 'Prospective cohort study evaluating strain metrics and outcomes.',
      keywords: ['cardio-oncology', 'echocardiography'],
      url: 'https://example.org/works/W-101',
      provenance: 'openalex',
      cluster_id: 'c1',
      authors: ['Storybook User', 'A. Patel'],
      user_author_position: 1,
      author_count: 2,
      pmid: '401001',
      journal_impact_factor: 8.2,
      created_at: FIXTURE_TIME,
      updated_at: FIXTURE_TIME,
    },
    {
      id: 'W-102',
      title: 'Automated MRI Tissue Tracking for Early Cardiotoxicity Signals',
      year: 2023,
      doi: '10.1000/story.102',
      work_type: 'journal-article',
      publication_type: 'journal-article',
      venue_name: 'JACC Imaging',
      publisher: 'Elsevier',
      abstract: 'Model-based MRI analysis for treatment-related myocardial change.',
      keywords: ['MRI', 'cardiotoxicity'],
      url: 'https://example.org/works/W-102',
      provenance: 'openalex',
      cluster_id: 'c2',
      authors: ['L. Santos', 'Storybook User', 'T. Price'],
      user_author_position: 2,
      author_count: 3,
      pmid: '401002',
      journal_impact_factor: 6.3,
      created_at: FIXTURE_TIME,
      updated_at: FIXTURE_TIME,
    },
    {
      id: 'W-103',
      title: 'Risk-Adjusted Outcomes in High-Risk Cardio-Oncology Clinics',
      year: 2024,
      doi: '10.1000/story.103',
      work_type: 'journal-article',
      publication_type: 'journal-article',
      venue_name: 'Circulation',
      publisher: 'AHA',
      abstract: 'Registry analysis of outcomes under multidisciplinary surveillance.',
      keywords: ['registry', 'risk'],
      url: 'https://example.org/works/W-103',
      provenance: 'openalex',
      cluster_id: 'c2',
      authors: ['Storybook User', 'D. Kim', 'S. Roy'],
      user_author_position: 1,
      author_count: 3,
      pmid: '401003',
      journal_impact_factor: 11.1,
      created_at: FIXTURE_TIME,
      updated_at: FIXTURE_TIME,
    },
  ],
  collaborators: {
    collaborators: [
      { author_id: 'A-1', name: 'A. Patel', n_shared_works: 2, first_year: 2022, last_year: 2024 },
      { author_id: 'A-2', name: 'L. Santos', n_shared_works: 1, first_year: 2023, last_year: 2023 },
    ],
    new_collaborators_by_year: { '2023': 1 },
  },
  themes: {
    clusters: [
      { cluster_id: 'c1', label: 'Cardiac imaging', n_works: 1, citation_mean: 62.5 },
      { cluster_id: 'c2', label: 'Clinical outcomes', n_works: 2, citation_mean: 48.3 },
    ],
  },
  timeline: [
    { year: 2022, n_works: 1, citations: 58 },
    { year: 2023, n_works: 1, citations: 86 },
    { year: 2024, n_works: 1, citations: 121 },
  ],
  metrics: {
    works: [
      { work_id: 'W-101', title: 'Longitudinal Echocardiography Markers in Cardio-Oncology', year: 2022, citations: 134, provider: 'openalex' },
      { work_id: 'W-102', title: 'Automated MRI Tissue Tracking for Early Cardiotoxicity Signals', year: 2023, citations: 109, provider: 'openalex' },
      { work_id: 'W-103', title: 'Risk-Adjusted Outcomes in High-Risk Cardio-Oncology Clinics', year: 2024, citations: 158, provider: 'openalex' },
    ],
    histogram: { '0-10': 0, '11-50': 0, '51-100': 1, '101+': 2 },
    trend: {
      citations_last_12_months: 122,
      citations_previous_12_months: 94,
      yoy_growth_percent: 29.8,
      yearly_growth: [
        { year: 2022, citations_added: 58, total_citations_end_year: 58 },
        { year: 2023, citations_added: 86, total_citations_end_year: 144 },
        { year: 2024, citations_added: 121, total_citations_end_year: 265 },
      ],
    },
  },
  context: {
    dominant_themes: ['Cardiac imaging', 'Cardio-oncology outcomes'],
    common_study_types: ['Prospective cohort', 'Registry'],
    top_venues: ['European Heart Journal', 'Circulation'],
    frequent_collaborators: ['A. Patel', 'L. Santos'],
    methodological_patterns: ['Longitudinal imaging', 'Risk stratification'],
    works_used: [
      { work_id: 'W-101', title: 'Longitudinal Echocardiography Markers in Cardio-Oncology', year: 2022, doi: '10.1000/story.101' },
      { work_id: 'W-103', title: 'Risk-Adjusted Outcomes in High-Risk Cardio-Oncology Clinics', year: 2024, doi: '10.1000/story.103' },
    ],
  },
  sync_status: {
    works_last_synced_at: FIXTURE_TIME,
    works_last_updated_at: FIXTURE_TIME,
    metrics_last_synced_at: FIXTURE_TIME,
    themes_last_generated_at: FIXTURE_TIME,
    impact_last_computed_at: FIXTURE_TIME,
    orcid_last_synced_at: FIXTURE_TIME,
  },
}

const fixtureAnalyticsResponse: PublicationsAnalyticsResponsePayload = {
  payload: {
    schema_version: 1,
    computed_at: FIXTURE_TIME,
    summary: {
      total_citations: 401,
      h_index: 18,
      citation_velocity_12m: 10.1,
      citations_last_12_months: 122,
      citations_previous_12_months: 94,
      citations_per_month_12m: 10.2,
      citations_per_month_previous_12m: 7.8,
      acceleration_citations_per_month: 2.4,
      yoy_percent: 29.8,
      yoy_pct: 29.8,
      citations_ytd: 41,
      ytd_year: 2026,
      cagr_3y: 18.6,
      slope_3y: 27.2,
      top5_share_12m_pct: 81.3,
      top10_share_12m_pct: 100,
      computed_at: FIXTURE_TIME,
    },
    timeseries: {
      computed_at: FIXTURE_TIME,
      points: [
        { year: 2022, citations_added: 58, total_citations_end_year: 58 },
        { year: 2023, citations_added: 86, total_citations_end_year: 144 },
        { year: 2024, citations_added: 121, total_citations_end_year: 265 },
      ],
    },
    top_drivers: {
      computed_at: FIXTURE_TIME,
      window: 'last_12_months',
      drivers: [
        {
          work_id: 'W-103',
          title: 'Risk-Adjusted Outcomes in High-Risk Cardio-Oncology Clinics',
          year: 2024,
          doi: '10.1000/story.103',
          citations_last_12_months: 56,
          current_citations: 158,
          provider: 'openalex',
          share_12m_pct: 45.9,
          primary_domain_label: 'Clinical outcomes',
          momentum_badge: 'Rising',
        },
      ],
    },
    per_year: [],
    domain_breakdown_12m: [
      { label: 'Cardiac imaging', citations_last_12_months: 44, share_12m_pct: 36.1, works_count: 1 },
      { label: 'Clinical outcomes', citations_last_12_months: 78, share_12m_pct: 63.9, works_count: 2 },
    ],
    metadata: {},
  },
  computed_at: FIXTURE_TIME,
  status: 'READY',
  is_stale: false,
  is_updating: false,
  last_update_failed: false,
}

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T
}

function toTopMetrics(status: PublicationsTopMetricsPayload['status']): PublicationsTopMetricsPayload {
  return {
    ...clone(publicationsMetricsHappyFixture),
    status,
    is_updating: status === 'RUNNING',
    is_stale: status === 'FAILED',
    last_error: status === 'FAILED' ? 'Mocked fixture error' : null,
  }
}

export const pagesReviewProfilePublicationsDefaultFixture: ProfilePublicationsPageFixture = {
  token: 'storybook-pages-review-token',
  user: clone(fixtureUser),
  personaState: clone(fixturePersonaState),
  analyticsResponse: clone(fixtureAnalyticsResponse),
  topMetricsResponse: toTopMetrics('READY'),
}

export const pagesReviewProfilePublicationsLoadingFixture: ProfilePublicationsPageFixture = {
  token: 'storybook-pages-review-token',
  user: clone(fixtureUser),
  personaState: clone(fixturePersonaState),
  analyticsResponse: {
    ...clone(fixtureAnalyticsResponse),
    status: 'RUNNING',
    is_updating: true,
  },
  topMetricsResponse: toTopMetrics('RUNNING'),
}

export const pagesReviewProfilePublicationsEmptyFixture: ProfilePublicationsPageFixture = {
  token: 'storybook-pages-review-token',
  user: clone(fixtureUser),
  personaState: {
    ...clone(fixturePersonaState),
    works: [],
    collaborators: { collaborators: [], new_collaborators_by_year: {} },
    themes: { clusters: [] },
    timeline: [],
    metrics: {
      works: [],
      histogram: {},
      trend: {
        citations_last_12_months: 0,
        citations_previous_12_months: 0,
        yoy_growth_percent: null,
        yearly_growth: [],
      },
    },
    context: {
      dominant_themes: [],
      common_study_types: [],
      top_venues: [],
      frequent_collaborators: [],
      methodological_patterns: [],
      works_used: [],
    },
  },
  analyticsResponse: {
    ...clone(fixtureAnalyticsResponse),
    payload: {
      ...clone(fixtureAnalyticsResponse.payload),
      summary: {
        ...clone(fixtureAnalyticsResponse.payload.summary),
        total_citations: 0,
        h_index: 0,
        citation_velocity_12m: 0,
        citations_last_12_months: 0,
        citations_previous_12_months: 0,
        citations_per_month_12m: 0,
        citations_per_month_previous_12m: 0,
        acceleration_citations_per_month: 0,
        yoy_percent: null,
        yoy_pct: null,
        citations_ytd: 0,
        top5_share_12m_pct: 0,
        top10_share_12m_pct: 0,
      },
      timeseries: {
        ...clone(fixtureAnalyticsResponse.payload.timeseries),
        points: [],
      },
      top_drivers: {
        ...clone(fixtureAnalyticsResponse.payload.top_drivers),
        drivers: [],
      },
      domain_breakdown_12m: [],
    },
  },
  topMetricsResponse: {
    ...toTopMetrics('READY'),
    tiles: [],
  },
}
