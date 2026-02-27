import type { Meta, StoryObj } from '@storybook/react'
import { StoryFrame } from '../_helpers/StoryFrame'

const meta = {
  title: 'Design System/Foundations/Radius Borders',
  parameters: { layout: 'fullscreen' },
} satisfies Meta

export default meta
type Story = StoryObj

const ITEMS = [
  { label: 'sm', radius: 'var(--radius)' , border: '1px solid hsl(var(--border))'},
  { label: 'pill', radius: '9999px', border: '1px solid hsl(var(--tone-accent-300))'},
  { label: 'strong', radius: '0.75rem', border: '2px solid hsl(var(--tone-neutral-700))'},
]

export const Scale: Story = {
  render: () => (
    <StoryFrame title="Radius and borders">
      <div className="grid gap-3 sm:grid-cols-3">
        {ITEMS.map((item) => (
          <div key={item.label} className="rounded-md bg-card p-3">
            <div style={{ borderRadius: item.radius, border: item.border }} className="h-20 w-full bg-[hsl(var(--tone-neutral-100))]" />
            <p className="mt-2 text-label">{item.label}</p>
          </div>
        ))}
      </div>
    </StoryFrame>
  ),
}
