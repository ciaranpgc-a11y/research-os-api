import type { Meta, StoryObj } from '@storybook/react'

import { WorkspacesPage } from '@/pages/workspaces-page'
import { seedPagesReviewState } from './_helpers/pages-review-fixtures'
import { StandaloneRouteShell } from './_helpers/page-review-shells'

const meta = {
  title: 'Pages Review/Workspaces Data Library',
  parameters: {
    withRouter: false,
    layout: 'fullscreen',
  },
} satisfies Meta

export default meta
type Story = StoryObj

export const Default: Story = {
  render: () => {
    seedPagesReviewState({ libraryMode: 'default' })
    return (
      <StandaloneRouteShell
        initialEntry="/workspaces?view=data-library&filter=all&mode=table&sort=updatedAt&dir=desc"
        path="/workspaces"
        element={<WorkspacesPage />}
      />
    )
  },
}

export const Loading: Story = {
  render: () => {
    seedPagesReviewState({ libraryMode: 'loading' })
    return (
      <StandaloneRouteShell
        initialEntry="/workspaces?view=data-library&filter=all&mode=table&sort=updatedAt&dir=desc"
        path="/workspaces"
        element={<WorkspacesPage />}
      />
    )
  },
}

export const Empty: Story = {
  render: () => {
    seedPagesReviewState({ libraryMode: 'empty' })
    return (
      <StandaloneRouteShell
        initialEntry="/workspaces?view=data-library&filter=all&mode=table&sort=updatedAt&dir=desc"
        path="/workspaces"
        element={<WorkspacesPage />}
      />
    )
  },
}
