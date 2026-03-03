import type { Meta, StoryObj } from '@storybook/react-vite'

import { ApprovalsContent } from './ApprovalsContent'

const meta = {
  title: 'Design System / Approvals',
  parameters: {
    layout: 'fullscreen',
  },
  render: () => <ApprovalsContent />,
} satisfies Meta

export default meta

type Story = StoryObj<typeof meta>

export const Canonical: Story = {}
