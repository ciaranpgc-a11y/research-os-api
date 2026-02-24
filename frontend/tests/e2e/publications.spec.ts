import { expect, test } from '@playwright/test'

const metricsFixture = {
  tiles: [
    {
      id: 'tile-momentum',
      key: 'momentum',
      label: 'Citation momentum',
      main_value: 14.2,
      value: 14.2,
      main_value_display: '+14.2%',
      value_display: '+14.2%',
      delta_value: 2.1,
      delta_display: '+2.1 pts vs prior window',
      delta_direction: 'up',
      delta_tone: 'positive',
      delta_color_code: '#166534',
      unit: '%',
      subtext: '12m velocity versus prior 12m',
      badge: {
        label: 'Rising',
        severity: 'positive',
      },
      chart_type: 'line',
      chart_data: {
        values: [2.8, 4.1, 5.7, 7.6, 9.9, 12.4, 14.2],
      },
      sparkline: [2.8, 4.1, 5.7, 7.6, 9.9, 12.4, 14.2],
      sparkline_overlay: [],
      tooltip: 'Tracks change in citation velocity over rolling windows.',
      tooltip_details: {
        update_frequency: 'Daily',
        data_sources: ['OpenAlex'],
      },
      data_source: ['OpenAlex'],
      confidence_score: 0.91,
      stability: 'stable',
      drilldown: {
        title: 'Citation momentum',
        definition: 'Relative lift in citation velocity in the most recent period.',
        formula: '(citations_last_12m - citations_previous_12m) / max(citations_previous_12m, 1)',
        confidence_note: 'Derived from normalized citation snapshots.',
        publications: [],
        metadata: {},
      },
    },
  ],
  data_sources: ['OpenAlex'],
  data_last_refreshed: '2026-02-24T09:30:00Z',
  metadata: {},
  computed_at: '2026-02-24T09:30:00Z',
  status: 'READY',
  is_stale: false,
  is_updating: false,
  last_error: null,
}

const userFixture = {
  id: 'user-1',
  email: 'user@example.com',
  name: 'Test User',
  is_active: true,
  role: 'user',
  orcid_id: null,
  impact_last_computed_at: null,
  email_verified_at: '2026-02-01T10:00:00Z',
  last_sign_in_at: '2026-02-24T09:00:00Z',
  created_at: '2025-01-01T00:00:00Z',
  updated_at: '2026-02-24T09:00:00Z',
}

const personaStateFixture = {
  works: [
    {
      id: 'work-1',
      title: 'Echocardiographic biomarkers in cardio-oncology',
      year: 2024,
      doi: '10.1016/example.2024.001',
      work_type: 'journal-article',
      venue_name: 'Cardio Imaging Journal',
      publisher: 'Test Publisher',
      abstract: 'This study reports biomarkers associated with outcomes.',
      keywords: ['cardio-oncology'],
      url: 'https://example.org/work-1',
      provenance: 'openalex',
      cluster_id: null,
      authors: ['Test User', 'Alice Collaborator'],
      user_author_position: 1,
      author_count: 2,
      pmid: null,
      journal_impact_factor: null,
      created_at: '2026-01-10T10:00:00Z',
      updated_at: '2026-02-20T10:00:00Z',
    },
  ],
  collaborators: {
    collaborators: [],
    new_collaborators_by_year: {},
  },
  themes: {
    clusters: [],
  },
  timeline: [],
  metrics: {
    works: [
      {
        work_id: 'work-1',
        title: 'Echocardiographic biomarkers in cardio-oncology',
        year: 2024,
        citations: 32,
        provider: 'openalex',
      },
    ],
    histogram: {},
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
    works_last_synced_at: '2026-02-24T09:00:00Z',
    works_last_updated_at: '2026-02-24T09:00:00Z',
    metrics_last_synced_at: '2026-02-24T09:00:00Z',
    themes_last_generated_at: '2026-02-24T09:00:00Z',
    impact_last_computed_at: '2026-02-24T09:00:00Z',
    orcid_last_synced_at: '2026-02-24T09:00:00Z',
  },
}

const analyticsFixture = {
  payload: {
    schema_version: 1,
    computed_at: '2026-02-24T09:30:00Z',
    summary: {
      total_citations: 32,
      h_index: 8,
      citation_velocity_12m: 12,
      citations_last_12_months: 12,
      citations_previous_12_months: 10,
      citations_per_month_12m: 1,
      citations_per_month_previous_12m: 0.83,
      acceleration_citations_per_month: 0.17,
      yoy_percent: 20,
      yoy_pct: 20,
      citations_ytd: 3,
      ytd_year: 2026,
      cagr_3y: 8.4,
      slope_3y: 1.2,
      top5_share_12m_pct: 55,
      top10_share_12m_pct: 72,
      computed_at: '2026-02-24T09:30:00Z',
    },
    timeseries: {
      computed_at: '2026-02-24T09:30:00Z',
      points: [],
    },
    top_drivers: {
      computed_at: '2026-02-24T09:30:00Z',
      window: '12m',
      drivers: [],
    },
    per_year: [],
    domain_breakdown_12m: [],
    metadata: {},
  },
  computed_at: '2026-02-24T09:30:00Z',
  status: 'READY',
  is_stale: false,
  is_updating: false,
  last_update_failed: false,
}

const publicationDetailFixture = {
  id: 'work-1',
  title: 'Echocardiographic biomarkers in cardio-oncology',
  year: 2024,
  journal: 'Cardio Imaging Journal',
  publication_type: 'Journal article',
  citations_total: 32,
  doi: '10.1016/example.2024.001',
  pmid: null,
  openalex_work_id: null,
  abstract: 'This study reports biomarkers associated with outcomes.',
  keywords_json: ['cardio-oncology'],
  authors_json: [{ name: 'Test User' }, { name: 'Alice Collaborator' }],
  affiliations_json: [],
  created_at: '2026-01-10T10:00:00Z',
  updated_at: '2026-02-20T10:00:00Z',
}

const publicationAuthorsFixture = {
  status: 'READY',
  authors_json: [{ name: 'Test User' }, { name: 'Alice Collaborator' }],
  affiliations_json: [],
  computed_at: '2026-02-24T09:30:00Z',
  is_stale: false,
  is_updating: false,
  last_error: null,
}

function jsonResponse(payload: unknown, status = 200) {
  return {
    status,
    headers: {
      'content-type': 'application/json',
      'access-control-allow-origin': '*',
    },
    body: JSON.stringify(payload),
  }
}

test('renders citation momentum tile on Publications page', async ({ page }) => {
  await page.addInitScript(() => {
    const token = 'e2e-session-token'
    window.localStorage.setItem('aawe-impact-session-token', token)
    window.sessionStorage.setItem('aawe-impact-session-token', token)
  })

  await page.route('**/v1/persona/state', async (route) => {
    await route.fulfill(jsonResponse(personaStateFixture))
  })
  await page.route('**/v1/auth/me', async (route) => {
    await route.fulfill(jsonResponse(userFixture))
  })
  await page.route('**/v1/persona/jobs?*', async (route) => {
    await route.fulfill(jsonResponse([]))
  })
  await page.route('**/v1/publications/analytics', async (route) => {
    await route.fulfill(jsonResponse(analyticsFixture))
  })
  await page.route('**/v1/publications/metrics', async (route) => {
    await route.fulfill(jsonResponse(metricsFixture))
  })
  await page.route('**/v1/publications/work-1', async (route) => {
    await route.fulfill(jsonResponse(publicationDetailFixture))
  })
  await page.route('**/v1/publications/work-1/authors', async (route) => {
    await route.fulfill(jsonResponse(publicationAuthorsFixture))
  })

  await page.goto('/profile/publications')

  await expect(page.getByRole('heading', { name: 'Publications' })).toBeVisible()

  const citationMomentumTile = page.locator('[data-metric-key="momentum"]')
  await expect(citationMomentumTile.getByTestId('metric-label-momentum')).toHaveText('Citation momentum')
  await expect(citationMomentumTile.getByTestId('metric-value-momentum')).toHaveText(/\+?\d+(\.\d+)?%/)
  await expect(citationMomentumTile.getByTestId('metric-badge-momentum')).toBeVisible()
})
