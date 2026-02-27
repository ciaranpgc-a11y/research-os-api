import type { Meta, StoryObj } from '@storybook/react'

import { ManuscriptTablesPage } from '@/pages/manuscript-tables-page'
import { seedPagesReviewState } from './_helpers/pages-review-fixtures'
import { WorkspaceRouteShell } from './_helpers/page-review-shells'

const meta = {
  title: 'Pages Review/Manuscript Tables',
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
        initialEntry="/w/hf-registry/manuscript/tables"
        nestedPath="manuscript/tables"
        element={<ManuscriptTablesPage />}
      />
    )
  },
}

export const Empty: Story = {
  render: () => {
    seedPagesReviewState({ manuscriptTables: [] })
    return (
      <WorkspaceRouteShell
        initialEntry="/w/hf-registry/manuscript/tables"
        nestedPath="manuscript/tables"
        element={<ManuscriptTablesPage />}
      />
    )
  },
}
