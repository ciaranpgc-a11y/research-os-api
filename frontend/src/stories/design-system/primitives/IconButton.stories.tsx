import type { Meta, StoryObj } from '@storybook/react'
import { Bell, Plus, Search, Settings } from 'lucide-react'

import { Button } from '@/components/ui/button'

import { StoryFrame } from '../_helpers/StoryFrame'

const meta = {
  title: 'Design System/Primitives/IconButton',
  component: Button,
  parameters: {
    layout: 'fullscreen',
  },
} satisfies Meta<typeof Button>

export default meta

type Story = StoryObj<typeof meta>

export const IconOnly: Story = {
  render: () => (
    <StoryFrame title="Icon button">
      <div data-ui="icon-button-story" className="flex flex-wrap gap-2">
        <Button size="icon" variant="tertiary" aria-label="Add">
          <Plus className="h-4 w-4" />
        </Button>
        <Button size="icon" variant="primary" aria-label="Search">
          <Search className="h-4 w-4" />
        </Button>
        <Button size="icon" variant="secondary" aria-label="Notifications">
          <Bell className="h-4 w-4" />
        </Button>
        <Button size="icon" variant="tertiary" aria-label="Settings">
          <Settings className="h-4 w-4" />
        </Button>
        <Button size="icon" variant="tertiary" disabled aria-label="Disabled">
          <Search className="h-4 w-4" />
        </Button>
      </div>
    </StoryFrame>
  ),
}
