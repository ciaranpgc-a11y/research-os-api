import type { Meta, StoryObj } from '@storybook/react-vite'
import { ChevronDown, ChevronRight } from 'lucide-react'

import { StoryFrame } from '../_helpers/StoryFrame'

const meta = {
  title: 'Design System/Foundations/Icons Rules',
  parameters: { layout: 'fullscreen' },
} satisfies Meta

export default meta
type Story = StoryObj

function IconRow({ size }: { size: number }) {
  return (
    <div className="flex items-center gap-4 rounded-md border border-border bg-card p-3">
      <ChevronRight size={size} className="text-foreground" />
      <ChevronDown size={size} className="text-foreground" />
      <span className="text-caption text-muted-foreground">{size}px: chevron-right for forward, chevron-down for expand</span>
    </div>
  )
}

export const Rules: Story = {
  render: () => (
    <StoryFrame title="Icon usage" subtitle="Approved icon sizes and direction rules">
      <div className="space-y-3">
        <IconRow size={16} />
        <IconRow size={20} />
        <IconRow size={24} />
      </div>
    </StoryFrame>
  ),
}
