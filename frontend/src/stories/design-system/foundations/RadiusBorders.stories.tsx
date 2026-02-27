import type { Meta, StoryObj } from '@storybook/react'
import { StoryFrame } from '../_helpers/StoryFrame'

const meta = {
  title: 'Design System/Foundations/Radius Borders',
  parameters: { layout: 'fullscreen' },
} satisfies Meta

export default meta
type Story = StoryObj

const ITEMS = [
  { label: 'xs', token: '--radius-xs', radius: 'var(--radius-xs)', border: '1px solid hsl(var(--border))' },
  { label: 'sm', token: '--radius-sm', radius: 'var(--radius-sm)', border: '1px solid hsl(var(--border))' },
  { label: 'md', token: '--radius-md', radius: 'var(--radius-md)', border: '1px solid hsl(var(--border))' },
  { label: 'lg', token: '--radius-lg', radius: 'var(--radius-lg)', border: '1px solid hsl(var(--tone-neutral-700))' },
  { label: 'full', token: '--radius-full', radius: 'var(--radius-full)', border: '1px solid hsl(var(--tone-accent-300))' },
]

export const Scale: Story = {
  render: () => (
    <StoryFrame title="Radius and borders">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {ITEMS.map((item) => (
          <div key={item.label} className="rounded-md bg-card p-3">
            <div style={{ borderRadius: item.radius, border: item.border }} className="h-20 w-full bg-[hsl(var(--tone-neutral-100))]" />
            <p className="mt-2 text-label">{item.label}</p>
            <p data-ui="radius-token" className="text-caption text-muted-foreground">{item.token}</p>
          </div>
        ))}
      </div>
    </StoryFrame>
  ),
}
