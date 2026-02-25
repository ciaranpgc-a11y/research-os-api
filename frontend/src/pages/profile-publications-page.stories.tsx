import type { Meta, StoryObj } from '@storybook/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'

import type {
  AuthUser,
  PersonaStatePayload,
  PublicationMetricTilePayload,
  PublicationsAnalyticsResponsePayload,
  PublicationsTopMetricsPayload,
} from '@/types/impact'

import { AccountLayout } from '@/components/layout/account-layout'

import {
  ProfilePublicationsPage,
  type ProfilePublicationsPageFixture,
} from './profile-publications-page'

const FIXTURE_TIME = '2026-02-24T09:30:00Z'

function buildTile(input: {
  id: string
  key: string
  label: string
  value: number | null
  valueDisplay: string
  deltaValue: number | null
  deltaDisplay: string | null
  deltaDirection: 'up' | 'down' | 'flat' | 'na'
  deltaTone: 'positive' | 'neutral' | 'caution' | 'negative'
  deltaColorCode: string
  chartType: string
  chartData: Record<string, unknown>
  sparkline: number[]
  sparklineOverlay?: number[]
  subtext?: string
  badgeLabel?: string
  badgeSeverity?: 'positive' | 'neutral' | 'caution' | 'negative'
}): PublicationMetricTilePayload {
  return {
    id: input.id,
    key: input.key,
    label: input.label,
    main_value: input.value,
    value: input.value,
    main_value_display: input.valueDisplay,
    value_display: input.valueDisplay,
    delta_value: input.deltaValue,
    delta_display: input.deltaDisplay,
    delta_direction: input.deltaDirection,
    delta_tone: input.deltaTone,
    delta_color_code: input.deltaColorCode,
    unit: null,
    subtext: input.subtext || '',
    badge: {
      label: input.badgeLabel || '',
      severity: input.badgeSeverity || 'neutral',
    },
    chart_type: input.chartType,
    chart_data: input.chartData,
    sparkline: input.sparkline,
    sparkline_overlay: input.sparklineOverlay || [],
    tooltip: `${input.label} fixture`,
    tooltip_details: {
      update_frequency: 'Daily',
      data_sources: ['OpenAlex'],
    },
    data_source: ['OpenAlex'],
    confidence_score: 0.9,
    stability: 'stable',
    drilldown: {
      title: input.label,
      definition: 'Fixture drilldown for page-level Storybook rendering.',
      formula: 'Fixture only',
      confidence_note: 'No backend request required.',
      publications: [],
      metadata: {},
    },
  }
}

const fixtureUser: AuthUser = {
  id: 'user-storybook',
  email: 'storybook@example.com',
  name: 'Storybook User',
  is_active: true,
  role: 'user',
  orcid_id: '0000-0002-1825-0097',
  impact_last_computed_at: FIXTURE_TIME,
  email_verified_at: FIXTURE_TIME,
  last_sign_in_at: FIXTURE_TIME,
  created_at: FIXTURE_TIME,
  updated_at: FIXTURE_TIME,
}

const fixturePersonaState: PersonaStatePayload = {
  works: [
    {
      id: 'W-101',
      title: 'Longitudinal Echocardiography Markers in Cardio-Oncology',
      year: 2021,
      doi: '10.1000/story.101',
      work_type: 'journal-article',
      venue_name: 'European Heart Journal',
      publisher: 'OUP',
      abstract: 'Prospective cohort study evaluating strain metrics and adverse outcomes.',
      keywords: ['cardio-oncology', 'echocardiography', 'strain'],
      url: 'https://example.org/works/W-101',
      provenance: 'openalex',
      cluster_id: 'c1',
      authors: ['Storybook User', 'A. Patel', 'M. Evans'],
      user_author_position: 1,
      author_count: 3,
      pmid: '401001',
      journal_impact_factor: 8.2,
      created_at: FIXTURE_TIME,
      updated_at: FIXTURE_TIME,
    },
    {
      id: 'W-102',
      title: 'Automated MRI Tissue Tracking for Early Cardiotoxicity Signals',
      year: 2022,
      doi: '10.1000/story.102',
      work_type: 'journal-article',
      venue_name: 'JACC Imaging',
      publisher: 'Elsevier',
      abstract: 'Model-based MRI analysis for treatment-related myocardial change.',
      keywords: ['MRI', 'cardiotoxicity', 'AI'],
      url: 'https://example.org/works/W-102',
      provenance: 'openalex',
      cluster_id: 'c1',
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
      year: 2023,
      doi: '10.1000/story.103',
      work_type: 'journal-article',
      venue_name: 'Circulation',
      publisher: 'AHA',
      abstract: 'Registry analysis of outcomes under multidisciplinary surveillance.',
      keywords: ['registry', 'risk', 'outcomes'],
      url: 'https://example.org/works/W-103',
      provenance: 'openalex',
      cluster_id: 'c2',
      authors: ['Storybook User', 'D. Kim', 'S. Roy', 'R. Shah'],
      user_author_position: 1,
      author_count: 4,
      pmid: '401003',
      journal_impact_factor: 11.1,
      created_at: FIXTURE_TIME,
      updated_at: FIXTURE_TIME,
    },
    {
      id: 'W-104',
      title: 'Conference Update: Practical Pathways for Cardio-Oncology Triage',
      year: 2024,
      doi: null,
      work_type: 'conference-paper',
      venue_name: 'ESC Congress Proceedings',
      publisher: 'ESC',
      abstract: 'Implementation guidance for triage and referral thresholds.',
      keywords: ['triage', 'conference', 'workflow'],
      url: 'https://example.org/works/W-104',
      provenance: 'openalex',
      cluster_id: 'c2',
      authors: ['E. Mendez', 'Storybook User'],
      user_author_position: 2,
      author_count: 2,
      pmid: null,
      journal_impact_factor: null,
      created_at: FIXTURE_TIME,
      updated_at: FIXTURE_TIME,
    },
    {
      id: 'W-105',
      title: 'Open Dataset for Cardiac MRI Derived Biomarkers',
      year: 2025,
      doi: '10.1000/story.105',
      work_type: 'data-set',
      venue_name: 'Zenodo',
      publisher: 'CERN',
      abstract: 'Public dataset with longitudinal imaging-derived biomarker labels.',
      keywords: ['dataset', 'open science', 'MRI'],
      url: 'https://example.org/works/W-105',
      provenance: 'openalex',
      cluster_id: 'c3',
      authors: ['Storybook User', 'P. Walker', 'J. Liu'],
      user_author_position: 1,
      author_count: 3,
      pmid: null,
      journal_impact_factor: null,
      created_at: FIXTURE_TIME,
      updated_at: FIXTURE_TIME,
    },
  ],
  collaborators: {
    collaborators: [
      { author_id: 'A-1', name: 'A. Patel', n_shared_works: 2, first_year: 2021, last_year: 2023 },
      { author_id: 'A-2', name: 'D. Kim', n_shared_works: 1, first_year: 2023, last_year: 2023 },
    ],
    new_collaborators_by_year: { '2023': 1, '2025': 1 },
  },
  themes: {
    clusters: [
      { cluster_id: 'c1', label: 'Cardiac imaging', n_works: 2, citation_mean: 62.5 },
      { cluster_id: 'c2', label: 'Care pathways', n_works: 2, citation_mean: 28.0 },
      { cluster_id: 'c3', label: 'Open data', n_works: 1, citation_mean: 9.0 },
    ],
  },
  timeline: [
    { year: 2021, n_works: 1, citations: 64 },
    { year: 2022, n_works: 1, citations: 78 },
    { year: 2023, n_works: 1, citations: 121 },
    { year: 2024, n_works: 1, citations: 39 },
    { year: 2025, n_works: 1, citations: 12 },
  ],
  metrics: {
    works: [
      { work_id: 'W-101', title: 'Longitudinal Echocardiography Markers in Cardio-Oncology', year: 2021, citations: 134, provider: 'openalex' },
      { work_id: 'W-102', title: 'Automated MRI Tissue Tracking for Early Cardiotoxicity Signals', year: 2022, citations: 109, provider: 'openalex' },
      { work_id: 'W-103', title: 'Risk-Adjusted Outcomes in High-Risk Cardio-Oncology Clinics', year: 2023, citations: 158, provider: 'openalex' },
      { work_id: 'W-104', title: 'Conference Update: Practical Pathways for Cardio-Oncology Triage', year: 2024, citations: 45, provider: 'openalex' },
      { work_id: 'W-105', title: 'Open Dataset for Cardiac MRI Derived Biomarkers', year: 2025, citations: 12, provider: 'openalex' },
    ],
    histogram: {
      '0-10': 1,
      '11-50': 1,
      '51-100': 0,
      '101+': 3,
    },
    trend: {
      citations_last_12_months: 122,
      citations_previous_12_months: 94,
      yoy_growth_percent: 29.8,
      yearly_growth: [
        { year: 2021, citations_added: 64, total_citations_end_year: 64 },
        { year: 2022, citations_added: 78, total_citations_end_year: 142 },
        { year: 2023, citations_added: 121, total_citations_end_year: 263 },
        { year: 2024, citations_added: 108, total_citations_end_year: 371 },
        { year: 2025, citations_added: 112, total_citations_end_year: 483 },
      ],
    },
  },
  context: {
    dominant_themes: ['Cardiac imaging', 'Cardio-oncology outcomes'],
    common_study_types: ['Prospective cohort', 'Registry'],
    top_venues: ['European Heart Journal', 'Circulation'],
    frequent_collaborators: ['A. Patel', 'D. Kim'],
    methodological_patterns: ['Longitudinal imaging', 'Risk stratification'],
    works_used: [
      { work_id: 'W-101', title: 'Longitudinal Echocardiography Markers in Cardio-Oncology', year: 2021, doi: '10.1000/story.101' },
      { work_id: 'W-103', title: 'Risk-Adjusted Outcomes in High-Risk Cardio-Oncology Clinics', year: 2023, doi: '10.1000/story.103' },
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
      total_citations: 483,
      h_index: 19,
      citation_velocity_12m: 10.2,
      citations_last_12_months: 122,
      citations_previous_12_months: 94,
      citations_per_month_12m: 10.2,
      citations_per_month_previous_12m: 7.8,
      acceleration_citations_per_month: 2.4,
      yoy_percent: 29.8,
      yoy_pct: 29.8,
      citations_ytd: 58,
      ytd_year: 2026,
      cagr_3y: 18.4,
      slope_3y: 12.7,
      top5_share_12m_pct: 71.2,
      top10_share_12m_pct: 90.3,
      computed_at: FIXTURE_TIME,
    },
    timeseries: {
      computed_at: FIXTURE_TIME,
      points: [
        { year: 2021, citations_added: 64, total_citations_end_year: 64 },
        { year: 2022, citations_added: 78, total_citations_end_year: 142 },
        { year: 2023, citations_added: 121, total_citations_end_year: 263 },
        { year: 2024, citations_added: 108, total_citations_end_year: 371 },
        { year: 2025, citations_added: 112, total_citations_end_year: 483 },
      ],
    },
    top_drivers: {
      computed_at: FIXTURE_TIME,
      window: '12m',
      drivers: [
        {
          work_id: 'W-103',
          title: 'Risk-Adjusted Outcomes in High-Risk Cardio-Oncology Clinics',
          year: 2023,
          doi: '10.1000/story.103',
          citations_last_12_months: 34,
          current_citations: 158,
          provider: 'openalex',
          share_12m_pct: 27.9,
          primary_domain_label: 'Cardio-oncology outcomes',
          momentum_badge: 'Accelerating',
        },
        {
          work_id: 'W-101',
          title: 'Longitudinal Echocardiography Markers in Cardio-Oncology',
          year: 2021,
          doi: '10.1000/story.101',
          citations_last_12_months: 29,
          current_citations: 134,
          provider: 'openalex',
          share_12m_pct: 23.8,
          primary_domain_label: 'Cardiac imaging',
          momentum_badge: 'Stable',
        },
      ],
    },
    per_year: [
      { year: 2021, citations: 64 },
      { year: 2022, citations: 78 },
      { year: 2023, citations: 121 },
      { year: 2024, citations: 108 },
      { year: 2025, citations: 112 },
    ],
    domain_breakdown_12m: [
      { label: 'Cardiac imaging', citations_last_12_months: 74, share_12m_pct: 60.7, works_count: 3 },
      { label: 'Outcomes', citations_last_12_months: 48, share_12m_pct: 39.3, works_count: 2 },
    ],
    metadata: {},
  },
  computed_at: FIXTURE_TIME,
  status: 'READY',
  is_stale: false,
  is_updating: false,
  last_update_failed: false,
}

const fixtureTopMetrics: PublicationsTopMetricsPayload = {
  tiles: [
    buildTile({
      id: 'tile-total-citations',
      key: 'total_citations',
      label: 'Total citations',
      value: 483,
      valueDisplay: '483',
      deltaValue: 29.8,
      deltaDisplay: '+29.8% YoY',
      deltaDirection: 'up',
      deltaTone: 'positive',
      deltaColorCode: 'hsl(var(--tone-positive-700))',
      subtext: '5-year citation trajectory',
      badgeLabel: '',
      chartType: 'bar_year_5',
      chartData: {
        years: [2021, 2022, 2023, 2024, 2025],
        values: [64, 78, 121, 108, 112],
        monthly_values_12m: [8, 9, 10, 10, 9, 9, 10, 11, 12, 13, 11, 10],
        mean_value: 96.6,
        projected_year: 2026,
        current_year_ytd: 58,
      },
      sparkline: [64, 78, 121, 108, 112],
    }),
    buildTile({
      id: 'tile-this-year-vs-last',
      key: 'this_year_vs_last',
      label: 'Total publications',
      value: 24,
      valueDisplay: '24',
      deltaValue: 1,
      deltaDisplay: null,
      deltaDirection: 'up',
      deltaTone: 'positive',
      deltaColorCode: 'hsl(var(--tone-positive-700))',
      subtext: 'Lifetime publications',
      badgeLabel: '',
      chartType: 'bar_year_5',
      chartData: {
        years: [2021, 2022, 2023, 2024, 2025],
        values: [2, 6, 3, 8, 5],
        mean_value: 4.8,
        projected_year: 2026,
        current_year_ytd: 6,
      },
      sparkline: [2, 6, 3, 8, 5],
    }),
    buildTile({
      id: 'tile-momentum',
      key: 'momentum',
      label: 'Citation momentum',
      value: 176,
      valueDisplay: 'Momentum 176',
      deltaValue: 76,
      deltaDisplay: '+76% vs prior window',
      deltaDirection: 'up',
      deltaTone: 'positive',
      deltaColorCode: 'hsl(var(--tone-positive-700))',
      subtext: '12m velocity versus prior 12m',
      badgeLabel: 'Accelerating',
      badgeSeverity: 'positive',
      chartType: 'gauge',
      chartData: {
        min: 0,
        max: 150,
        value: 176,
        monthly_values_12m: [90, 95, 98, 100, 102, 104, 106, 103, 102, 170, 176, 182],
        month_labels_12m: ['Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec', 'Jan', 'Feb'],
        highlight_last_n: 3,
      },
      sparkline: [90, 95, 98, 100, 102, 104, 106, 103, 102, 170, 176, 182],
    }),
    buildTile({
      id: 'tile-h-index',
      key: 'h_index_projection',
      label: 'h-index trajectory',
      value: 19,
      valueDisplay: 'h 19',
      deltaValue: 1,
      deltaDisplay: '+1 vs prior year',
      deltaDirection: 'up',
      deltaTone: 'positive',
      deltaColorCode: 'hsl(var(--tone-positive-700))',
      subtext: 'Progress to next h-index threshold',
      badgeLabel: '',
      chartType: 'progress_ring',
      chartData: {
        years: [2021, 2022, 2023, 2024, 2025],
        values: [13, 15, 17, 18, 19],
        projected_year: 2026,
        current_h_index: 19,
        next_h_index: 20,
        progress_to_next_pct: 74,
        candidate_gaps: [1, 2, 2],
      },
      sparkline: [13, 15, 17, 18, 19],
    }),
    buildTile({
      id: 'tile-impact-concentration',
      key: 'impact_concentration',
      label: 'Impact concentration',
      value: 68,
      valueDisplay: '68%',
      deltaValue: 0,
      deltaDisplay: 'Stable',
      deltaDirection: 'flat',
      deltaTone: 'neutral',
      deltaColorCode: 'hsl(var(--tone-neutral-600))',
      subtext: 'Share of citations in top papers',
      badgeLabel: 'Balanced',
      badgeSeverity: 'neutral',
      chartType: 'donut',
      chartData: {
        values: [330, 153],
        gini_coefficient: 0.51,
        gini_profile_label: 'Balanced',
        total_publications: 24,
        top_papers_count: 3,
        remaining_papers_count: 21,
      },
      sparkline: [62, 64, 65, 66, 68],
    }),
    buildTile({
      id: 'tile-influential',
      key: 'influential_citations',
      label: 'Influential citations',
      value: 42,
      valueDisplay: '42',
      deltaValue: 8,
      deltaDisplay: '+8 vs prior window',
      deltaDirection: 'up',
      deltaTone: 'positive',
      deltaColorCode: 'hsl(var(--tone-positive-700))',
      subtext: 'Highly weighted citations trend',
      badgeLabel: 'Rising',
      badgeSeverity: 'positive',
      chartType: 'line',
      chartData: {
        values: [24, 27, 30, 33, 37, 42],
        influential_ratio_pct: 9,
      },
      sparkline: [24, 27, 30, 33, 37, 42],
      sparklineOverlay: [22, 24, 26, 28, 31, 34],
    }),
    buildTile({
      id: 'tile-field-percentile-share',
      key: 'field_percentile_share',
      label: 'Field percentile share',
      value: 42,
      valueDisplay: '42%',
      deltaValue: null,
      deltaDisplay: null,
      deltaDirection: 'na',
      deltaTone: 'neutral',
      deltaColorCode: 'hsl(var(--tone-neutral-600))',
      subtext: 'Papers benchmarked against field-year cohorts',
      badgeLabel: '',
      chartType: 'percentile_toggle',
      chartData: {
        thresholds: [50, 75, 90, 95, 99],
        default_threshold: 75,
        share_by_threshold_pct: {
          '50': 62.5,
          '75': 42.0,
          '90': 21.0,
          '95': 12.5,
          '99': 4.2,
        },
        count_by_threshold: {
          '50': 15,
          '75': 10,
          '90': 5,
          '95': 3,
          '99': 1,
        },
        evaluated_papers: 24,
        total_papers: 27,
        coverage_pct: 88.9,
        median_percentile_rank: 73.4,
      },
      sparkline: [62.5, 42, 21, 12.5, 4.2],
    }),
    buildTile({
      id: 'tile-authorship-composition',
      key: 'authorship_composition',
      label: 'Authorship composition',
      value: 62,
      valueDisplay: '62%',
      deltaValue: null,
      deltaDisplay: null,
      deltaDirection: 'na',
      deltaTone: 'neutral',
      deltaColorCode: 'hsl(var(--tone-neutral-600))',
      subtext: 'Leadership index',
      badgeLabel: '',
      chartType: 'authorship_structure',
      chartData: {
        first_authorship_pct: 34,
        second_authorship_pct: 18,
        senior_authorship_pct: 28,
        leadership_index_pct: 62,
        median_author_position: 2,
        median_author_position_display: '2',
        first_authorship_count: 8,
        second_authorship_count: 4,
        senior_authorship_count: 7,
        leadership_count: 15,
        known_role_count: 22,
        unknown_role_count: 2,
        known_position_count: 22,
        total_papers: 24,
      },
      sparkline: [34, 18, 28, 62],
    }),
    buildTile({
      id: 'tile-collaboration-structure',
      key: 'collaboration_structure',
      label: 'Collaboration structure',
      value: 48,
      valueDisplay: '48',
      deltaValue: null,
      deltaDisplay: null,
      deltaDirection: 'na',
      deltaTone: 'neutral',
      deltaColorCode: 'hsl(var(--tone-neutral-600))',
      subtext: 'Unique collaborators',
      badgeLabel: '',
      chartType: 'collaboration_structure',
      chartData: {
        unique_collaborators: 48,
        repeat_collaborator_rate_pct: 62,
        repeat_collaborators: 30,
        institutions: 14,
        countries: 5,
        collaborative_works: 31,
      },
      sparkline: [48, 62, 14, 5],
    }),
  ],
  data_sources: ['OpenAlex'],
  data_last_refreshed: FIXTURE_TIME,
  metadata: {},
  computed_at: FIXTURE_TIME,
  status: 'READY',
  is_stale: false,
  is_updating: false,
  last_error: null,
}

const fullPageFixture: ProfilePublicationsPageFixture = {
  token: '',
  user: fixtureUser,
  personaState: fixturePersonaState,
  analyticsResponse: fixtureAnalyticsResponse,
  topMetricsResponse: fixtureTopMetrics,
}

const loadingFixture: ProfilePublicationsPageFixture = {
  ...fullPageFixture,
  analyticsResponse: {
    ...fixtureAnalyticsResponse,
    status: 'RUNNING',
    is_stale: true,
    is_updating: true,
  },
  topMetricsResponse: {
    ...fixtureTopMetrics,
    status: 'RUNNING',
    is_stale: true,
    is_updating: true,
  },
}

const emptyFixture: ProfilePublicationsPageFixture = {
  ...fullPageFixture,
  personaState: {
    ...fixturePersonaState,
    works: [],
    collaborators: {
      collaborators: [],
      new_collaborators_by_year: {},
    },
    themes: {
      clusters: [],
    },
    timeline: [],
    metrics: {
      works: [],
      histogram: {},
      trend: {
        citations_last_12_months: 0,
        citations_previous_12_months: 0,
        yoy_growth_percent: 0,
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
    sync_status: {
      works_last_synced_at: null,
      works_last_updated_at: null,
      metrics_last_synced_at: null,
      themes_last_generated_at: null,
      impact_last_computed_at: null,
      orcid_last_synced_at: null,
    },
  },
  analyticsResponse: {
    ...fixtureAnalyticsResponse,
    payload: {
      ...fixtureAnalyticsResponse.payload,
      summary: {
        ...fixtureAnalyticsResponse.payload.summary,
        total_citations: 0,
        h_index: 0,
        citation_velocity_12m: 0,
        citations_last_12_months: 0,
        citations_previous_12_months: 0,
        citations_per_month_12m: 0,
        citations_per_month_previous_12m: 0,
        acceleration_citations_per_month: 0,
        yoy_percent: 0,
        yoy_pct: 0,
        citations_ytd: 0,
        cagr_3y: 0,
        slope_3y: 0,
        top5_share_12m_pct: 0,
        top10_share_12m_pct: 0,
      },
      timeseries: {
        ...fixtureAnalyticsResponse.payload.timeseries,
        points: [],
      },
      top_drivers: {
        ...fixtureAnalyticsResponse.payload.top_drivers,
        drivers: [],
      },
      per_year: [],
      domain_breakdown_12m: [],
    },
  },
  topMetricsResponse: {
    ...fixtureTopMetrics,
    tiles: [],
    data_last_refreshed: null,
    computed_at: FIXTURE_TIME,
    status: 'READY',
    is_stale: false,
    is_updating: false,
    last_error: null,
  },
}

function ProfilePublicationsStoryShell({
  fixture,
}: {
  fixture: ProfilePublicationsPageFixture
}) {
  return (
    <MemoryRouter initialEntries={['/profile/publications']}>
      <Routes>
        <Route path="/" element={<AccountLayout />}>
          <Route
            path="profile/publications"
            element={<ProfilePublicationsPage fixture={fixture} />}
          />
        </Route>
      </Routes>
    </MemoryRouter>
  )
}

const meta: Meta<typeof ProfilePublicationsPage> = {
  title: 'Pages/ProfilePublicationsPage',
  component: ProfilePublicationsPage,
  parameters: {
    layout: 'fullscreen',
    withRouter: false,
  },
  args: {
    fixture: fullPageFixture,
  },
  render: (args) => (
    <ProfilePublicationsStoryShell fixture={args?.fixture ?? fullPageFixture} />
  ),
}

export default meta

type Story = StoryObj<typeof ProfilePublicationsPage>

export const FullLayout: Story = {}

export const LoadingState: Story = {
  args: {
    fixture: loadingFixture,
  },
}

export const EmptyLibrary: Story = {
  args: {
    fixture: emptyFixture,
  },
}

export const FullLayoutDarkMode: Story = {
  args: {
    fixture: fullPageFixture,
  },
  globals: {
    theme: 'dark',
  },
}
