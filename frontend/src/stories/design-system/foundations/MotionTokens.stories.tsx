import type { Meta, StoryObj } from '@storybook/react'
import { StoryFrame } from '../_helpers/StoryFrame'

const meta = {
  title: 'Design System/Foundations/Motion Tokens',
  parameters: { layout: 'fullscreen' },
} satisfies Meta

export default meta
type Story = StoryObj

const TOKENS = [
  ['--motion-duration-fast', '150ms'],
  ['--motion-duration-ui', '180ms'],
  ['--motion-duration-base', '220ms'],
  ['--motion-duration-chart-toggle', '540ms'],
  ['--motion-duration-chart-refresh', '1200ms'],
  ['--motion-ease-chart-series', 'cubic-bezier(0.2, 0.68, 0.16, 1)'],
] as const

export const Tokens: Story = {
  render: () => (
    <StoryFrame title="Motion tokens">
      <div className="space-y-2">
        {TOKENS.map(([token, value]) => (
          <div key={token} className="flex items-center justify-between rounded-md border border-border bg-card px-3 py-2 text-caption">
            <span>{token}</span><span className="text-muted-foreground">{value}</span>
          </div>
        ))}
      </div>
    </StoryFrame>
  ),
}

export const MotionDemos: Story = {
  render: () => (
    <StoryFrame title="Motion demos" subtitle="Replay by refreshing the story">
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="rounded-md border border-border bg-card p-3">
          <p className="text-label">Page load / Tile load</p>
          <div className="mt-2 grid gap-2">
            <div className="animate-[wizard-fade-slide_var(--motion-duration-base)_ease-out] rounded border border-border p-2 text-caption">Page load</div>
            <div className="animate-[wizard-fade-slide_var(--motion-duration-chart-refresh)_ease-out] rounded border border-border p-2 text-caption">Tile load</div>
          </div>
        </div>
        <div className="rounded-md border border-border bg-card p-3">
          <p className="text-label">Bar/Ring/Line</p>
          <div className="mt-2 space-y-2">
            <div className="overflow-hidden rounded border border-border p-2"><div className="h-3 w-3/4 origin-left animate-[wizard-fade-slide_var(--motion-duration-chart-toggle)_ease-out] bg-[hsl(var(--tone-positive-500))]" /></div>
            <div className="overflow-hidden rounded border border-border p-2"><div className="h-3 w-1/2 origin-left animate-[wizard-fade-slide_var(--motion-duration-chart-refresh)_ease-out] bg-[hsl(var(--tone-warning-500))]" /></div>
            <div className="flex items-center gap-2"><div className="h-10 w-10 rounded-full border-4 border-[hsl(var(--tone-accent-300))] border-t-[hsl(var(--tone-accent-700))] animate-spin" /><div className="text-caption">Ring refresh/toggle</div></div>
            <div className="h-8 rounded border border-border bg-[linear-gradient(90deg,hsl(var(--tone-accent-500))_0%,hsl(var(--tone-accent-500))_55%,transparent_55%)]" />
          </div>
        </div>
      </div>
    </StoryFrame>
  ),
}
