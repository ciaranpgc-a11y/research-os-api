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
  created_at: '2025-02-25T09:00:00Z',
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
    jobRoles: ['Professor of Medical Education', 'British Heart Foundation Fellow'],
    organisation: 'Axiomos Labs',
    affiliations: ['Axiomos Labs', "King's College London"],
    affiliationAddress: 'Department of Research Operations, Strand Campus',
    affiliationCity: 'London',
    affiliationRegion: 'England',
    affiliationPostalCode: 'WC2R 2LS',
    department: 'Research Operations',
    country: 'United Kingdom',
    website: 'https://app.axiomos.studio',
    researchGateUrl: 'https://www.researchgate.net/profile/Ciaran-Clarke',
    xHandle: '@axiomos_lab',
    profilePhotoDataUrl: '',
    profilePhotoPositionX: 50,
    profilePhotoPositionY: 50,
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
    jobRoles: [],
    organisation: '',
    affiliations: [],
    affiliationAddress: '',
    affiliationCity: '',
    affiliationRegion: '',
    affiliationPostalCode: '',
    department: '',
    country: '',
    website: '',
    researchGateUrl: '',
    xHandle: '',
    profilePhotoDataUrl: '',
    profilePhotoPositionX: 50,
    profilePhotoPositionY: 50,
    publicationAffiliations: [],
  },
}

const savedFixture: ProfilePersonalDetailsPageFixture = {
  ...connectedFixture,
  status: 'Personal details saved.',
}

const noRolesFixture: ProfilePersonalDetailsPageFixture = {
  ...connectedFixture,
  personalDetails: {
    ...connectedFixture.personalDetails,
    jobRole: '',
    jobRoles: [],
  },
}

const noAffiliationFixture: ProfilePersonalDetailsPageFixture = {
  ...connectedFixture,
  personalDetails: {
    ...connectedFixture.personalDetails,
    organisation: '',
    affiliations: [],
    affiliationAddress: '',
    affiliationCity: '',
    affiliationRegion: '',
    affiliationPostalCode: '',
    country: '',
  },
}

const noPublicationAffiliationsFixture: ProfilePersonalDetailsPageFixture = {
  ...connectedFixture,
  personalDetails: {
    ...connectedFixture.personalDetails,
    publicationAffiliations: [],
  },
}

const loadingFixture: ProfilePersonalDetailsPageFixture = {
  ...connectedFixture,
  loading: true,
  status: '',
  error: '',
}

const errorFixture: ProfilePersonalDetailsPageFixture = {
  ...connectedFixture,
  loading: false,
  error: 'Could not load personal details.',
}

const singleRoleFixture: ProfilePersonalDetailsPageFixture = {
  ...connectedFixture,
  personalDetails: {
    ...connectedFixture.personalDetails,
    jobRole: 'British Heart Foundation Fellow',
    jobRoles: ['British Heart Foundation Fellow'],
    organisation: 'University of East Anglia',
    affiliations: ['University of East Anglia'],
    affiliationAddress: '',
    affiliationCity: 'Norwich',
    affiliationRegion: 'England',
    affiliationPostalCode: '',
    country: 'United Kingdom',
    publicationAffiliations: ['University of East Anglia (GB)'],
  },
}

const reviewOneFixture: ProfilePersonalDetailsPageFixture = {
  token: 'storybook-session-token',
  user: {
    ...fixtureUser,
    email: 'orcid-0000000285370806@orcid.local',
    name: 'ORCID 0000-0002-8537-0806',
  },
  orcidStatus: linkedOrcidStatus,
  personalDetails: {
    salutation: 'Associate Professor',
    firstName: '',
    lastName: '',
    jobRole: 'British Heart Foundation Fellow',
    jobRoles: ['British Heart Foundation Fellow', 'Cardiology Research Fellow'],
    organisation: 'University of East Anglia',
    affiliations: ['University of East Anglia', 'Norfolk and Norwich University Hospital'],
    affiliationAddress: '',
    affiliationCity: 'Norwich',
    affiliationRegion: 'England',
    affiliationPostalCode: '',
    department: 'Cardiovascular Research Unit',
    country: 'United Kingdom',
    website: '',
    researchGateUrl: '',
    xHandle: '',
    profilePhotoDataUrl: '',
    profilePhotoPositionX: 50,
    profilePhotoPositionY: 50,
    publicationAffiliations: ['University of East Anglia (GB)'],
  },
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

export const NoRoles: Story = {
  args: {
    fixture: noRolesFixture,
  },
}

export const NoAffiliation: Story = {
  args: {
    fixture: noAffiliationFixture,
  },
}

export const NoPublicationAffiliations: Story = {
  args: {
    fixture: noPublicationAffiliationsFixture,
  },
}

export const SingleRoleSingleAffiliation: Story = {
  args: {
    fixture: singleRoleFixture,
  },
}

export const LoadingState: Story = {
  args: {
    fixture: loadingFixture,
  },
}

export const ErrorState: Story = {
  args: {
    fixture: errorFixture,
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

export const ReviewOne: Story = {
  args: {
    fixture: reviewOneFixture,
  },
}
