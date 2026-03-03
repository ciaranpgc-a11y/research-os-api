import type { Meta, StoryObj } from '@storybook/react-vite'

type ColorToken = {
  name: string
  cssVar: string
}

type ColorGroup = {
  label: string
  tokens: ColorToken[]
}

const COLOR_GROUPS: ColorGroup[] = [
  {
    label: 'Core',
    tokens: [
      { name: 'background', cssVar: '--background' },
      { name: 'foreground', cssVar: '--foreground' },
      { name: 'card', cssVar: '--card' },
      { name: 'border', cssVar: '--border' },
      { name: 'primary', cssVar: '--primary' },
      { name: 'accent', cssVar: '--accent' },
      { name: 'destructive', cssVar: '--destructive' },
    ],
  },
  {
    label: 'Neutral Scale',
    tokens: [
      { name: 'neutral-50', cssVar: '--tone-neutral-50' },
      { name: 'neutral-100', cssVar: '--tone-neutral-100' },
      { name: 'neutral-200', cssVar: '--tone-neutral-200' },
      { name: 'neutral-300', cssVar: '--tone-neutral-300' },
      { name: 'neutral-500', cssVar: '--tone-neutral-500' },
      { name: 'neutral-700', cssVar: '--tone-neutral-700' },
      { name: 'neutral-900', cssVar: '--tone-neutral-900' },
    ],
  },
  {
    label: 'Status Tones',
    tokens: [
      { name: 'positive-500', cssVar: '--tone-positive-500' },
      { name: 'warning-500', cssVar: '--tone-warning-500' },
      { name: 'danger-500', cssVar: '--tone-danger-500' },
      { name: 'accent-500', cssVar: '--tone-accent-500' },
      { name: 'status-ok', cssVar: '--status-ok' },
      { name: 'status-warn', cssVar: '--status-warn' },
      { name: 'status-danger', cssVar: '--status-danger' },
    ],
  },
]

function ColorSwatch({ token }: { token: ColorToken }) {
  return (
    <div className="rounded-md border border-border bg-card p-3">
      <div
        className="h-12 w-full rounded-sm border border-border"
        style={{ backgroundColor: `hsl(var(${token.cssVar}))` }}
      />
      <div className="mt-2 text-label font-semibold text-foreground">{token.name}</div>
      <div className="text-caption text-muted-foreground">{token.cssVar}</div>
    </div>
  )
}

const meta = {
  title: 'Design System/Foundations/Colors',
  parameters: {
    layout: 'padded',
  },
} satisfies Meta

export default meta

type Story = StoryObj

export const Palette: Story = {
  render: () => (
    <div className="space-y-6">
      {COLOR_GROUPS.map((group) => (
        <section key={group.label} className="space-y-3">
          <h2 className="text-body font-semibold text-foreground">{group.label}</h2>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {group.tokens.map((token) => (
              <ColorSwatch key={token.cssVar} token={token} />
            ))}
          </div>
        </section>
      ))}
    </div>
  ),
}
