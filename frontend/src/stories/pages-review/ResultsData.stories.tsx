import type { Meta, StoryObj } from '@storybook/react'

import { ResultsPage } from '@/pages/results-page'
import { seedPagesReviewState } from './_helpers/pages-review-fixtures'
import { WorkspaceRouteShell } from './_helpers/page-review-shells'

const meta = {
  title: 'Pages Review/Results Data',
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
      <WorkspaceRouteShell
        initialEntry="/w/hf-registry/results"
        nestedPath="results"
        element={<ResultsPage />}
      />
    )
  },
}

export const Loading: Story = {
  render: () => {
    seedPagesReviewState({ libraryMode: 'loading' })
    return (
      <WorkspaceRouteShell
        initialEntry="/w/hf-registry/results"
        nestedPath="results"
        element={<ResultsPage />}
      />
    )
  },
}

export const Empty: Story = {
  render: () => {
    seedPagesReviewState({ dataAssets: [], libraryMode: 'empty' })
    return (
      <WorkspaceRouteShell
        initialEntry="/w/hf-registry/results"
        nestedPath="results"
        element={<ResultsPage />}
      />
    )
  },
}
