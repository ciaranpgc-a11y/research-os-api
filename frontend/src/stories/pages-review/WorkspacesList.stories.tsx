import type { Meta, StoryObj } from '@storybook/react'

import { WorkspacesPage } from '@/pages/workspaces-page'
import { seedPagesReviewState } from './_helpers/pages-review-fixtures'
import { StandaloneRouteShell } from './_helpers/page-review-shells'

const meta = {
  title: 'Pages Review/Workspaces List',
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
      <StandaloneRouteShell
        initialEntry="/workspaces?view=workspaces&filter=all&mode=table&sort=updatedAt&dir=desc"
        path="/workspaces"
        element={<WorkspacesPage />}
      />
    )
  },
}

export const Empty: Story = {
  render: () => {
    seedPagesReviewState({
      workspaces: [],
      activeWorkspaceId: null,
      authorRequests: [],
      invitationsSent: [],
      inboxMessages: [],
      inboxReads: {},
    })
    return (
      <StandaloneRouteShell
        initialEntry="/workspaces?view=workspaces&filter=all&mode=table&sort=updatedAt&dir=desc"
        path="/workspaces"
        element={<WorkspacesPage />}
      />
    )
  },
}
