import type { Meta, StoryObj } from '@storybook/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'

import { AccountLayout } from '@/components/layout/account-layout'
import type { AuthUser, OrcidStatusPayload } from '@/types/impact'

import {
  ProfilePersonalDetailsPage,
  type ProfilePersonalDetailsPageFixture,
} from './profile-personal-details-page'

const FIXTURE_TIME = '2026-02-24T17:13:00Z'

const fixtureUser: AuthUser = {
  id: 'personal-user-1',
  email: 'researcher@axiomos.studio',
  name: 'Ciaran Clarke',
  is_active: true,
  role: 'user',
  orcid_id: '0000-0002-8537-0806',
  impact_last_computed_at: FIXTURE_TIME,
  email_verified_at: FIXTURE_TIME,
  last_sign_in_at: FIXTURE_TIME,
  created_at: '2025-03-01T09:00:00Z',
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

const connectedFixture: ProfilePersonalDetailsPageFixture = {
  token: 'storybook-session-token',
  user: fixtureUser,
  orcidStatus: linkedOrcidStatus,
  personalDetails: {
    salutation: 'Dr',
    firstName: 'Ciaran',
    lastName: 'Clarke',
    jobRole: 'Professor of Medical Education',
    organisation: 'Axiomos Labs',
    affiliationAddress: 'Department of Research Operations, Strand Campus',
    affiliationCity: 'London',
    affiliationRegion: 'England',
    affiliationPostalCode: 'WC2R 2LS',
    department: 'Research Operations',
    country: 'United Kingdom',
    website: 'https://app.axiomos.studio',
    researchGateUrl: 'https://www.researchgate.net/profile/Ciaran-Clarke',
    xHandle: '@axiomos_lab',
    publicationAffiliations: ['Axiomos Labs, London (GB)', "King's College London (GB)"],
  },
}

const unlinkedFixture: ProfilePersonalDetailsPageFixture = {
  token: 'storybook-session-token',
  user: {
    ...fixtureUser,
    name: 'New Researcher',
    orcid_id: null,
    created_at: '2026-02-01T10:30:00Z',
  },
  orcidStatus: unlinkedOrcidStatus,
  personalDetails: {
    salutation: '',
    firstName: 'New',
    lastName: 'Researcher',
    jobRole: '',
    organisation: '',
    affiliationAddress: '',
    affiliationCity: '',
    affiliationRegion: '',
    affiliationPostalCode: '',
    department: '',
    country: '',
    website: '',
    researchGateUrl: '',
    xHandle: '',
    publicationAffiliations: [],
  },
}

const savedFixture: ProfilePersonalDetailsPageFixture = {
  ...connectedFixture,
  status: 'Personal details saved.',
}

function ProfilePersonalDetailsStoryShell({
  fixture,
}: {
  fixture: ProfilePersonalDetailsPageFixture
}) {
  return (
    <MemoryRouter initialEntries={['/profile/personal-details']}>
      <Routes>
        <Route path="/" element={<AccountLayout />}>
          <Route
            path="profile/personal-details"
            element={<ProfilePersonalDetailsPage fixture={fixture} />}
          />
        </Route>
      </Routes>
    </MemoryRouter>
  )
}

const meta: Meta<typeof ProfilePersonalDetailsPage> = {
  title: 'Pages/ProfilePersonalDetailsPage',
  component: ProfilePersonalDetailsPage,
  parameters: {
    layout: 'fullscreen',
    withRouter: false,
  },
  args: {
    fixture: connectedFixture,
  },
  render: (args) => (
    <ProfilePersonalDetailsStoryShell fixture={args?.fixture ?? connectedFixture} />
  ),
}

export default meta

type Story = StoryObj<typeof ProfilePersonalDetailsPage>

export const Default: Story = {}

export const Unlinked: Story = {
  args: {
    fixture: unlinkedFixture,
  },
}

export const SavedState: Story = {
  args: {
    fixture: savedFixture,
  },
}

export const DarkMode: Story = {
  args: {
    fixture: connectedFixture,
  },
  globals: {
    theme: 'dark',
  },
}
