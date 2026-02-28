import type { Meta, StoryObj } from '@storybook/react'

import { TopBar } from '@/components/layout/top-bar'

const meta = {
  title: 'Design System/Composites/Header TopBar',
  component: TopBar,
  parameters: {
    layout: 'fullscreen',
    chromatic: { disableSnapshot: true },
  },
} satisfies Meta<typeof TopBar>

export default meta
type Story = StoryObj<typeof meta>

export const Workspace: Story = {
  args: {
    scope: 'workspace',
    onOpenLeftNav: () => undefined,
    showLeftNavButton: true,
  },
}

export const Account: Story = {
  args: {
    scope: 'account',
    onOpenLeftNav: () => undefined,
    showLeftNavButton: true,
  },
}

export const DesktopNoMenuButton: Story = {
  args: {
    scope: 'workspace',
    onOpenLeftNav: () => undefined,
    showLeftNavButton: false,
  },
}
