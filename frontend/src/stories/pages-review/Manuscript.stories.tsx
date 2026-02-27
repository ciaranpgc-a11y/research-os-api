import type { Meta, StoryObj } from '@storybook/react'

import { ManuscriptPage } from '@/pages/manuscript-page'
import { useAaweStore } from '@/store/use-aawe-store'
import { seedPagesReviewState } from './_helpers/pages-review-fixtures'
import { WorkspaceRouteShell } from './_helpers/page-review-shells'

const meta = {
  title: 'Pages Review/Manuscript',
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
      <WorkspaceRouteShell
        initialEntry="/w/hf-registry/manuscript/introduction"
        nestedPath="manuscript/:section"
        element={<ManuscriptPage />}
      />
    )
  },
}

export const Empty: Story = {
  render: () => {
    seedPagesReviewState()
    useAaweStore.setState({ searchQuery: 'no-matching-claims' })
    return (
      <WorkspaceRouteShell
        initialEntry="/w/hf-registry/manuscript/introduction"
        nestedPath="manuscript/:section"
        element={<ManuscriptPage />}
      />
    )
  },
}
