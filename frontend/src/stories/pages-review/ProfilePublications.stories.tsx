import type { Meta, StoryObj } from '@storybook/react'

import { ProfilePublicationsPage } from '@/pages/profile-publications-page'
import {
  pagesReviewProfilePublicationsDefaultFixture,
  pagesReviewProfilePublicationsEmptyFixture,
  pagesReviewProfilePublicationsLoadingFixture,
} from './_helpers/profile-publications-fixture'
import { seedPagesReviewState } from './_helpers/pages-review-fixtures'
import { AccountRouteShell } from './_helpers/page-review-shells'

const meta = {
  title: 'Pages Review/Profile Publications',
  parameters: {
    withRouter: false,
    layout: 'fullscreen',
  },
} satisfies Meta

export default meta
type Story = StoryObj

export const Default: Story = {
  render: () => {
    seedPagesReviewState()
    return (
      <AccountRouteShell
        initialEntry="/profile/publications"
        path="/profile/publications"
        element={<ProfilePublicationsPage fixture={pagesReviewProfilePublicationsDefaultFixture} />}
      />
    )
  },
}

export const Loading: Story = {
  render: () => {
    seedPagesReviewState()
    return (
      <AccountRouteShell
        initialEntry="/profile/publications"
        path="/profile/publications"
        element={<ProfilePublicationsPage fixture={pagesReviewProfilePublicationsLoadingFixture} />}
      />
    )
  },
}

export const Empty: Story = {
  render: () => {
    seedPagesReviewState()
    return (
      <AccountRouteShell
        initialEntry="/profile/publications"
        path="/profile/publications"
        element={<ProfilePublicationsPage fixture={pagesReviewProfilePublicationsEmptyFixture} />}
      />
    )
  },
}
