import type { Meta, StoryObj } from '@storybook/react-vite'

import { ProfilePersonalDetailsPage } from '@/pages/profile-personal-details-page'
import type { ProfilePersonalDetailsPageFixture } from '@/pages/profile-personal-details-page'
import { StandaloneRouteShell } from '@/stories/pages-review/_helpers/page-review-shells'

const meta: Meta<typeof ProfilePersonalDetailsPage> = {
  title: 'Design System/Pages/Personal Details Page',
  component: ProfilePersonalDetailsPage,
  tags: ['autodocs'],
  parameters: {
    layout: 'fullscreen',
    withRouter: false,
  },
}

export default meta

type Story = StoryObj

const DEFAULT_FIXTURE: ProfilePersonalDetailsPageFixture = {
  token: 'storybook-pages-review-token',
  loading: false,
  status: '',
  error: '',
  user: {
    id: 'storybook-user-1',
    account_key: 'acct_storybook',
    email: 'storybook.user@example.org',
    name: 'Dr Storybook User',
    is_active: true,
    role: 'user',
    orcid_id: '0000-0002-1825-0097',
    impact_last_computed_at: '2026-02-27T07:00:00Z',
    email_verified_at: '2026-02-20T10:00:00Z',
    last_sign_in_at: '2026-03-01T08:30:00Z',
    created_at: '2025-01-10T12:00:00Z',
    updated_at: '2026-03-01T08:30:00Z',
  },
  orcidStatus: {
    linked: true,
    orcid_id: '0000-0002-1825-0097',
    configured: true,
    redirect_uri: 'https://example.org/orcid/callback',
    can_import: true,
    issues: [],
  },
  personalDetails: {
    salutation: 'Dr',
    firstName: 'Storybook',
    lastName: 'User',
    jobRole: 'Associate Professor',
    jobRoles: ['Associate Professor', 'Clinical Research Lead'],
    organisation: 'Imperial College London',
    affiliations: ['Imperial College London'],
    affiliationAddress: 'South Kensington Campus',
    affiliationCity: 'London',
    affiliationRegion: 'Greater London',
    affiliationPostalCode: 'SW7 2AZ',
    department: 'Department of Surgery and Cancer',
    country: 'United Kingdom',
    website: 'https://example.org',
    researchGateUrl: 'https://www.researchgate.net/profile/Storybook-User',
    xHandle: '@storybook_user',
    publicationAffiliations: ['Imperial College London'],
  },
}

export const Default: Story = {
  render: () => (
    <StandaloneRouteShell
      initialEntry="/profile/personal-details"
      path="/profile/personal-details"
      element={<ProfilePersonalDetailsPage fixture={DEFAULT_FIXTURE} />}
    />
  ),
}
