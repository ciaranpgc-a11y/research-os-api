import type { Meta, StoryObj } from '@storybook/react'

import { Button } from '@/components/ui/button'

const meta = {
  title: 'Design System/Primitives/ButtonTiers',
  component: Button,
  parameters: {
    layout: 'padded',
  },
} satisfies Meta<typeof Button>

export default meta

type Story = StoryObj<typeof meta>

export const Tiers: Story = {
  render: () => (
    <div className="flex flex-wrap gap-3">
      <Button variant="housePrimary">Primary</Button>
      <Button variant="house">Secondary</Button>
      <Button variant="outline">Outline</Button>
      <Button variant="ghost">Ghost</Button>
      <Button variant="destructive">Destructive</Button>
      <Button variant="housePrimary" disabled>
        Disabled
      </Button>
    </div>
  ),
}
