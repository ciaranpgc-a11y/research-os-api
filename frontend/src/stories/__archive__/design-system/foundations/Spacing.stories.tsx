import type { Meta, StoryObj } from '@storybook/react-vite'

type SpacingToken = {
  token: string
  rem: string
}

const SPACING_TOKENS: SpacingToken[] = [
  { token: 'sz-7', rem: '0.4375rem' },
  { token: 'sz-18', rem: '1.125rem' },
  { token: 'sz-22', rem: '1.375rem' },
  { token: 'sz-84', rem: '5.25rem' },
  { token: 'sz-170', rem: '10.625rem' },
  { token: 'sz-320', rem: '20rem' },
]

const meta = {
  title: 'Design System/Foundations/Spacing',
  parameters: {
    layout: 'padded',
  },
} satisfies Meta

export default meta

type Story = StoryObj

export const Scale: Story = {
  render: () => (
    <div className="space-y-3">
      {SPACING_TOKENS.map((item) => (
        <div key={item.token} className="rounded-md border border-border bg-card p-4">
          <div className="mb-2 flex items-center justify-between text-caption text-muted-foreground">
            <span>{item.token}</span>
            <span>{item.rem}</span>
          </div>
          <div className="h-3 rounded-full bg-[hsl(var(--tone-accent-500)/0.7)]" style={{ width: item.rem }} />
        </div>
      ))}
    </div>
  ),
}
