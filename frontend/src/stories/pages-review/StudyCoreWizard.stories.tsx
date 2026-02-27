import type { Meta, StoryObj } from '@storybook/react'

import { StudyCorePage } from '@/pages/study-core-page'
import { seedPagesReviewState } from './_helpers/pages-review-fixtures'
import { WorkspaceRouteShell } from './_helpers/page-review-shells'

const meta = {
  title: 'Pages Review/Study Core Wizard',
  parameters: {
    withRouter: false,
    layout: 'fullscreen',
  },
} satisfies Meta

export default meta
type Story = StoryObj

export const Default: Story = {
  render: () => {
    seedPagesReviewState({ runContextMode: 'default' })
    return (
      <WorkspaceRouteShell
        initialEntry="/w/hf-registry/run-wizard"
        nestedPath="run-wizard"
        element={<StudyCorePage />}
      />
    )
  },
}

export const Loading: Story = {
  render: () => {
    seedPagesReviewState({ runContextMode: 'loading' })
    return (
      <WorkspaceRouteShell
        initialEntry="/w/hf-registry/run-wizard"
        nestedPath="run-wizard"
        element={<StudyCorePage />}
      />
    )
  },
}

export const Empty: Story = {
  render: () => {
    seedPagesReviewState({ runContextMode: 'empty' })
    return (
      <WorkspaceRouteShell
        initialEntry="/w/hf-registry/run-wizard"
        nestedPath="run-wizard"
        element={<StudyCorePage />}
      />
    )
  },
}
