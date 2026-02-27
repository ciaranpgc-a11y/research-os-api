/* design-governance:allow-tone */
import type { Meta, StoryObj } from '@storybook/react'

type ColorToken = {
  name: string
  cssVar: string
}

type ColorGroup = {
  label: string
  tokens: ColorToken[]
}

type ContrastCase = {
  label: string
  containerClassName: string
  textClassName: string
}

const SEMANTIC_GROUPS: ColorGroup[] = [
  {
    label: 'Surfaces',
    tokens: [
      { name: 'background', cssVar: '--background' },
      { name: 'foreground', cssVar: '--foreground' },
      { name: 'card', cssVar: '--card' },
      { name: 'card-foreground', cssVar: '--card-foreground' },
      { name: 'muted', cssVar: '--muted' },
      { name: 'muted-foreground', cssVar: '--muted-foreground' },
      { name: 'border', cssVar: '--border' },
    ],
  },
  {
    label: 'Actions',
    tokens: [
      { name: 'primary', cssVar: '--primary' },
      { name: 'primary-foreground', cssVar: '--primary-foreground' },
      { name: 'secondary', cssVar: '--secondary' },
      { name: 'secondary-foreground', cssVar: '--secondary-foreground' },
      { name: 'accent', cssVar: '--accent' },
      { name: 'accent-foreground', cssVar: '--accent-foreground' },
      { name: 'destructive', cssVar: '--destructive' },
      { name: 'destructive-foreground', cssVar: '--destructive-foreground' },
      { name: 'ring', cssVar: '--ring' },
      { name: 'focus', cssVar: '--focus' },
    ],
  },
  {
    label: 'Status',
    tokens: [
      { name: 'status-ok', cssVar: '--status-ok' },
      { name: 'status-warn', cssVar: '--status-warn' },
      { name: 'status-danger', cssVar: '--status-danger' },
    ],
  },
]

const TONE_GROUPS: ColorGroup[] = [
  {
    label: 'Neutral Tones',
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
    ],
  },
]

const CONTRAST_CASES: ContrastCase[] = [
  {
    label: 'foreground / background',
    containerClassName: 'bg-background',
    textClassName: 'text-foreground',
  },
  {
    label: 'card-foreground / card',
    containerClassName: 'bg-card',
    textClassName: 'text-card-foreground',
  },
  {
    label: 'muted-foreground / muted',
    containerClassName: 'bg-muted',
    textClassName: 'text-muted-foreground',
  },
  {
    label: 'primary-foreground / primary',
    containerClassName: 'bg-primary',
    textClassName: 'text-primary-foreground',
  },
  {
    label: 'secondary-foreground / secondary',
    containerClassName: 'bg-secondary',
    textClassName: 'text-secondary-foreground',
  },
  {
    label: 'accent-foreground / accent',
    containerClassName: 'bg-accent',
    textClassName: 'text-accent-foreground',
  },
  {
    label: 'destructive-foreground / destructive',
    containerClassName: 'bg-destructive',
    textClassName: 'text-destructive-foreground',
  },
]

function ColorSwatch({ token }: { token: ColorToken }) {
  return (
    <div data-ui="colors-swatch" className="rounded-md border border-border bg-card p-3">
      <div
        data-ui="colors-swatch-fill"
        className="h-12 w-full rounded-sm border border-border"
        style={{ backgroundColor: `hsl(var(${token.cssVar}))` }}
      />
      <div data-ui="colors-swatch-name" className="mt-2 text-label font-semibold text-foreground">
        {token.name}
      </div>
      <div data-ui="colors-swatch-var" className="text-caption text-muted-foreground">
        {token.cssVar}
      </div>
    </div>
  )
}

function TokenSection({ groups }: { groups: ColorGroup[] }) {
  return (
    <div data-ui="colors-token-section" className="space-y-6">
      {groups.map((group) => (
        <section data-ui="colors-token-group" key={group.label} className="space-y-3">
          <h2 data-ui="colors-token-group-title" className="text-body font-semibold text-foreground">
            {group.label}
          </h2>
          <div data-ui="colors-token-grid" className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {group.tokens.map((token) => (
              <ColorSwatch key={token.cssVar} token={token} />
            ))}
          </div>
        </section>
      ))}
    </div>
  )
}

function SurfaceLayeringSection() {
  return (
    <section data-ui="colors-surface-section" className="space-y-3">
      <h2 data-ui="colors-surface-title" className="text-body font-semibold text-foreground">
        Surface Layering
      </h2>
      <div data-ui="colors-surface-canvas" className="rounded-lg border border-border bg-background p-4">
        <div data-ui="colors-surface-grid" className="grid gap-4 lg:grid-cols-2">
          <div
            data-ui="colors-surface-card"
            className="space-y-3 rounded-md border border-border bg-card p-4 text-card-foreground"
          >
            <div data-ui="colors-surface-card-label" className="text-label font-semibold">
              card
            </div>
            <div
              data-ui="colors-surface-muted"
              className="rounded-md border border-border bg-muted p-3 text-muted-foreground"
            >
              muted
            </div>
          </div>
          <div
            data-ui="colors-surface-background"
            className="rounded-md border border-border bg-background p-4 text-foreground"
          >
            <div data-ui="colors-surface-background-label" className="text-label font-semibold">
              background
            </div>
            <div data-ui="colors-surface-background-card" className="mt-3 h-10 rounded-md border border-border bg-card" />
          </div>
        </div>
      </div>
    </section>
  )
}

function ContrastSection() {
  return (
    <section data-ui="colors-contrast-section" className="space-y-3">
      <h2 data-ui="colors-contrast-title" className="text-body font-semibold text-foreground">
        Contrast
      </h2>
      <div data-ui="colors-contrast-grid" className="grid gap-3 lg:grid-cols-2">
        {CONTRAST_CASES.map((item) => (
          <div data-ui="colors-contrast-item" key={item.label} className="rounded-md border border-border bg-card p-3">
            <div data-ui="colors-contrast-label" className="text-caption text-muted-foreground">
              {item.label}
            </div>
            <div
              data-ui="colors-contrast-sample"
              className={`${item.containerClassName} mt-2 rounded-md border border-border px-3 py-2 ${item.textClassName}`}
            >
              Aa 16px 500
            </div>
          </div>
        ))}
        <div data-ui="colors-focus-item" className="rounded-md border border-border bg-card p-3">
          <div data-ui="colors-focus-label" className="text-caption text-muted-foreground">
            focus ring
          </div>
          <button
            data-ui="colors-focus-button"
            type="button"
            className="mt-2 rounded-md border border-border bg-background px-3 py-2 text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
          >
            focus-visible
          </button>
        </div>
      </div>
    </section>
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

export const Foundations: Story = {
  render: () => (
    <div data-ui="colors-foundations-story" className="space-y-8">
      <section data-ui="colors-foundations-semantic" className="space-y-3">
        <h1 data-ui="colors-foundations-title" className="text-display font-semibold text-foreground">
          Colors
        </h1>
        <TokenSection groups={SEMANTIC_GROUPS} />
      </section>
      <SurfaceLayeringSection />
      <ContrastSection />
      <section data-ui="colors-foundations-tones" className="space-y-3">
        <h2 data-ui="colors-foundations-tones-title" className="text-body font-semibold text-foreground">
          Tone Scales
        </h2>
        <TokenSection groups={TONE_GROUPS} />
      </section>
    </div>
  ),
}
