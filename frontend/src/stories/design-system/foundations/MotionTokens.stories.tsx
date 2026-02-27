import type { Meta, StoryObj } from '@storybook/react'

type MotionDurationToken = {
  token: string
  ms: number
}

const DURATION_TOKENS: MotionDurationToken[] = [
  { token: '--motion-duration-fast', ms: 150 },
  { token: '--motion-duration-ui', ms: 180 },
  { token: '--motion-duration-base', ms: 220 },
  { token: '--motion-duration-slow', ms: 320 },
  { token: '--motion-duration-emphasis', ms: 500 },
  { token: '--motion-duration-chart-toggle', ms: 540 },
  { token: '--motion-duration-chart-refresh', ms: 1200 },
]

const EASING_TOKENS = [
  { token: 'ease-out', curve: 'cubic-bezier(0, 0, 0.2, 1)' },
  { token: '--motion-ease-chart-series', curve: 'cubic-bezier(0.2, 0.68, 0.16, 1)' },
]

const meta = {
  title: 'Design System/Foundations/MotionTokens',
  parameters: {
    layout: 'padded',
  },
} satisfies Meta

export default meta

type Story = StoryObj

export const Tokens: Story = {
  render: () => (
    <div className="space-y-6">
      <section className="space-y-3">
        <h2 className="text-body font-semibold text-foreground">Durations</h2>
        <div className="space-y-2">
          {DURATION_TOKENS.map((item) => (
            <div key={item.token} className="rounded-md border border-border bg-card p-3">
              <div className="mb-2 flex items-center justify-between text-caption text-muted-foreground">
                <span>{item.token}</span>
                <span>{item.ms}ms</span>
              </div>
              <div
                className="h-2 rounded-full bg-[hsl(var(--tone-positive-500)/0.75)]"
                style={{ width: `${Math.max(72, Math.round(item.ms * 0.18))}px` }}
              />
            </div>
          ))}
        </div>
      </section>
      <section className="space-y-3">
        <h2 className="text-body font-semibold text-foreground">Easing</h2>
        <div className="grid gap-3 sm:grid-cols-2">
          {EASING_TOKENS.map((item) => (
            <div key={item.token} className="rounded-md border border-border bg-card p-3">
              <div className="text-label font-semibold text-foreground">{item.token}</div>
              <div className="mt-1 text-caption text-muted-foreground">{item.curve}</div>
            </div>
          ))}
        </div>
      </section>
    </div>
  ),
}
