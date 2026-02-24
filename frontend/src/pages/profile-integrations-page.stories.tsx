import type { Meta, StoryObj } from '@storybook/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'

import { AccountLayout } from '@/components/layout/account-layout'

import type {
  AuthUser,
  OrcidStatusPayload,
  PersonaStatePayload,
  PersonaSyncJobPayload,
} from '@/types/impact'

import {
  ProfileIntegrationsPage,
  type ProfileIntegrationsPageFixture,
} from './profile-integrations-page'

const FIXTURE_TIME = '2026-02-24T17:13:00Z'

const fixtureUser: AuthUser = {
  id: 'integrations-user-1',
  email: 'researcher@axiomos.studio',
  name: 'Axiomos Researcher',
  is_active: true,
  role: 'user',
  orcid_id: '0000-0002-8537-0806',
  impact_last_computed_at: FIXTURE_TIME,
  email_verified_at: FIXTURE_TIME,
  last_sign_in_at: FIXTURE_TIME,
  created_at: FIXTURE_TIME,
  updated_at: FIXTURE_TIME,
}

const linkedOrcidStatus: OrcidStatusPayload = {
  configured: true,
  linked: true,
  orcid_id: '0000-0002-8537-0806',
  redirect_uri: 'https://api.axiomos.studio/v1/orcid/callback',
  can_import: true,
  issues: [],
}

const unlinkedOrcidStatus: OrcidStatusPayload = {
  configured: true,
  linked: false,
  orcid_id: null,
  redirect_uri: 'https://api.axiomos.studio/v1/orcid/callback',
  can_import: false,
  issues: [],
}
const fixturePersonaState: PersonaStatePayload = {
  works: [
    {
      id: 'work-001',
      title: 'Cardio-Oncology Outcome Modelling in Multicentre Registries',
      year: 2024,
      doi: '10.1000/axiomos.001',
      work_type: 'journal-article',
      venue_name: 'European Heart Journal',
      publisher: 'Oxford University Press',
      abstract: null,
      keywords: ['cardio-oncology', 'registry'],
      url: 'https://example.org/work-001',
      provenance: 'openalex',
      cluster_id: 'cluster-1',
      authors: ['Axiomos Researcher', 'A. Patel'],
      user_author_position: 1,
      author_count: 2,
      pmid: null,
      journal_impact_factor: 8.1,
      created_at: FIXTURE_TIME,
      updated_at: FIXTURE_TIME,
    },
    {
      id: 'work-002',
      title: 'Clinical Signal Detection for Early Cardiotoxicity',
      year: 2025,
      doi: '10.1000/axiomos.002',
      work_type: 'journal-article',
      venue_name: 'JACC',
      publisher: 'Elsevier',
      abstract: null,
      keywords: ['toxicity', 'monitoring'],
      url: 'https://example.org/work-002',
      provenance: 'openalex',
      cluster_id: 'cluster-1',
      authors: ['Axiomos Researcher', 'L. Evans'],
      user_author_position: 1,
      author_count: 2,
      pmid: null,
      journal_impact_factor: 7.4,
      created_at: FIXTURE_TIME,
      updated_at: FIXTURE_TIME,
    },
  ],
  collaborators: {
    collaborators: [],
    new_collaborators_by_year: {},
  },
  themes: {
    clusters: [],
  },
  timeline: [
    { year: 2024, n_works: 32, citations: 540 },
    { year: 2025, n_works: 44, citations: 591 },
  ],
  metrics: {
    works: [
      {
        work_id: 'work-001',
        title: 'Cardio-Oncology Outcome Modelling in Multicentre Registries',
        year: 2024,
        citations: 620,
        provider: 'openalex',
      },
      {
        work_id: 'work-002',
        title: 'Clinical Signal Detection for Early Cardiotoxicity',
        year: 2025,
        citations: 511,
        provider: 'openalex',
      },
    ],
    histogram: {
      '0-9': 11,
      '10-24': 28,
      '25-49': 19,
      '50+': 18,
    },
  },
  context: {
    dominant_themes: ['Cardio-oncology'],
    common_study_types: ['Prospective cohort'],
    top_venues: ['European Heart Journal'],
    frequent_collaborators: ['A. Patel'],
    methodological_patterns: ['Registry analytics'],
    works_used: [
      {
        work_id: 'work-001',
        title: 'Cardio-Oncology Outcome Modelling in Multicentre Registries',
        year: 2024,
        doi: '10.1000/axiomos.001',
      },
      {
        work_id: 'work-002',
        title: 'Clinical Signal Detection for Early Cardiotoxicity',
        year: 2025,
        doi: '10.1000/axiomos.002',
      },
    ],
  },
  sync_status: {
    works_last_synced_at: '2026-02-24T17:03:00Z',
    works_last_updated_at: '2026-02-24T17:13:00Z',
    metrics_last_synced_at: '2026-02-23T18:03:00Z',
    themes_last_generated_at: '2026-02-24T15:40:00Z',
    impact_last_computed_at: '2026-02-24T16:40:00Z',
    orcid_last_synced_at: '2026-02-24T15:39:00Z',
  },
}

const runningSyncJob: PersonaSyncJobPayload = {
  id: 'job-storybook-001',
  user_id: 'integrations-user-1',
  job_type: 'orcid_import',
  status: 'running',
  overwrite_user_metadata: false,
  run_metrics_sync: false,
  refresh_analytics: true,
  refresh_metrics: false,
  providers: ['openalex'],
  progress_percent: 48,
  current_stage: 'syncing_orcid_records',
  result_json: {},
  error_detail: null,
  started_at: '2026-02-24T16:58:00Z',
  completed_at: null,
  created_at: '2026-02-24T16:57:00Z',
  updated_at: '2026-02-24T17:02:00Z',
}
const connectedFixture: ProfileIntegrationsPageFixture = {
  token: 'storybook-session-token',
  user: fixtureUser,
  orcidStatus: linkedOrcidStatus,
  personaState: fixturePersonaState,
  lastImportedCount: 0,
  lastReferencesSyncedCount: 0,
  lastSyncSinceLabel: '24 Feb, 15:39',
  lastSyncOutcome: 'No new records',
}

const unlinkedFixture: ProfileIntegrationsPageFixture = {
  token: 'storybook-session-token',
  user: {
    ...fixtureUser,
    orcid_id: null,
  },
  orcidStatus: unlinkedOrcidStatus,
  personaState: {
    ...fixturePersonaState,
    metrics: {
      ...fixturePersonaState.metrics,
      works: [],
    },
  },
  status: 'Connect ORCID to start importing works.',
}

const runningFixture: ProfileIntegrationsPageFixture = {
  ...connectedFixture,
  activeSyncJob: runningSyncJob,
}

function ProfileIntegrationsStoryShell({
  fixture,
}: {
  fixture: ProfileIntegrationsPageFixture
}) {
  return (
    <MemoryRouter initialEntries={['/profile/integrations']}>
      <Routes>
        <Route path="/" element={<AccountLayout />}>
          <Route
            path="profile/integrations"
            element={<ProfileIntegrationsPage fixture={fixture} />}
          />
        </Route>
      </Routes>
    </MemoryRouter>
  )
}

const meta: Meta<typeof ProfileIntegrationsPage> = {
  title: 'Pages/ProfileIntegrationsPage',
  component: ProfileIntegrationsPage,
  parameters: {
    layout: 'fullscreen',
    withRouter: false,
  },
  args: {
    fixture: connectedFixture,
  },
  render: (args) => <ProfileIntegrationsStoryShell fixture={args?.fixture ?? connectedFixture} />,
}

export default meta

type Story = StoryObj<typeof ProfileIntegrationsPage>

export const Connected: Story = {}

export const Unlinked: Story = {
  args: {
    fixture: unlinkedFixture,
  },
}

export const SyncRunning: Story = {
  args: {
    fixture: runningFixture,
  },
}





