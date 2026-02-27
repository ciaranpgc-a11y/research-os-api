import type { Meta, StoryObj } from '@storybook/react'
import { StoryFrame } from '../_helpers/StoryFrame'

const meta = {
  title: 'Design System/Foundations/Shadows Elevation',
  parameters: { layout: 'fullscreen' },
} satisfies Meta

export default meta
type Story = StoryObj

const SHADOWS = [
  { label: 'None', shadow: 'none' },
  { label: 'Soft', shadow: '0 1px 2px hsl(var(--tone-neutral-900)/0.12)' },
  { label: 'Raised', shadow: '0 8px 24px hsl(var(--tone-neutral-900)/0.16)' },
]

export const Elevation: Story = {
  render: () => (
    <StoryFrame title="Shadow and elevation">
      <div className="grid gap-4 sm:grid-cols-3">
        {SHADOWS.map((item) => (
          <div key={item.label} className="rounded-md border border-border bg-card p-4" style={{ boxShadow: item.shadow }}>
            <p className="text-label font-semibold">{item.label}</p>
            <p className="text-caption text-muted-foreground mt-1">{item.shadow}</p>
          </div>
        ))}
      </div>
    </StoryFrame>
  ),
}
