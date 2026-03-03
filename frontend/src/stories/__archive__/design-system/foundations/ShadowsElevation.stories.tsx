import type { Meta, StoryObj } from '@storybook/react-vite'
import { StoryFrame } from '../_helpers/StoryFrame'

const meta = {
  title: 'Design System/Foundations/Shadows Elevation',
  parameters: { layout: 'fullscreen' },
} satisfies Meta

export default meta
type Story = StoryObj

const SHADOWS = [
  { label: 'None', token: '--elevation-none', shadow: 'var(--elevation-none)' },
  { label: 'XS', token: '--elevation-xs', shadow: 'var(--elevation-xs)' },
  { label: 'SM', token: '--elevation-sm', shadow: 'var(--elevation-sm)' },
  { label: 'MD', token: '--elevation-md', shadow: 'var(--elevation-md)' },
  { label: 'LG', token: '--elevation-lg', shadow: 'var(--elevation-lg)' },
]

export const Elevation: Story = {
  render: () => (
    <StoryFrame title="Shadow and elevation">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {SHADOWS.map((item) => (
          <div key={item.label} className="rounded-md border border-border bg-card p-4" style={{ boxShadow: item.shadow }}>
            <p className="text-label font-semibold">{item.label}</p>
            <p className="mt-1 text-caption text-muted-foreground">{item.token}</p>
            <p data-ui="shadow-value" className="text-caption text-muted-foreground">{item.shadow}</p>
          </div>
        ))}
      </div>
    </StoryFrame>
  ),
}
