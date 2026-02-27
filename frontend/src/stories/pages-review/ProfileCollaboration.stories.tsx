import type { Meta, StoryObj } from '@storybook/react'

import { ProfileCollaborationPage } from '@/pages/profile-collaboration-page'
import { seedPagesReviewState } from './_helpers/pages-review-fixtures'
import { AccountRouteShell } from './_helpers/page-review-shells'

const meta = {
  title: 'Pages Review/Profile Collaboration',
  parameters: {
    withRouter: false,
    layout: 'fullscreen',
  },
} satisfies Meta

export default meta
type Story = StoryObj

export const Default: Story = {
  render: () => {
    seedPagesReviewState({ collaborationMode: 'default' })
    return (
      <AccountRouteShell
        initialEntry="/account/collaboration"
        path="/account/collaboration"
        element={<ProfileCollaborationPage />}
      />
    )
  },
}

export const Loading: Story = {
  render: () => {
    seedPagesReviewState({ collaborationMode: 'loading' })
    return (
      <AccountRouteShell
        initialEntry="/account/collaboration"
        path="/account/collaboration"
        element={<ProfileCollaborationPage />}
      />
    )
  },
}

export const Empty: Story = {
  render: () => {
    seedPagesReviewState({ collaborationMode: 'empty' })
    return (
      <AccountRouteShell
        initialEntry="/account/collaboration"
        path="/account/collaboration"
        element={<ProfileCollaborationPage />}
      />
    )
  },
}
