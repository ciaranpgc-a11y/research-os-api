import type { Meta, StoryObj } from '@storybook/react'
import { StoryFrame } from '../_helpers/StoryFrame'

type TypeScaleItem = {
  name: string
  sizeToken: string
  lineToken: string
  sample: string
}

const TYPE_SCALE: TypeScaleItem[] = [
  { name: 'Caption', sizeToken: '--text-caption-size', lineToken: '--text-caption-line', sample: 'Caption and helper text' },
  { name: 'Micro', sizeToken: '--text-micro-size', lineToken: '--text-micro-line', sample: 'Compact metadata and status copy' },
  { name: 'Label', sizeToken: '--text-label-size', lineToken: '--text-label-line', sample: 'Form and section labels' },
  { name: 'Body Secondary', sizeToken: '--text-body-secondary-size', lineToken: '--text-body-secondary-line', sample: 'Secondary narrative content' },
  { name: 'Body', sizeToken: '--text-body-size', lineToken: '--text-body-line', sample: 'Primary narrative text for content blocks' },
  { name: 'Body Strong', sizeToken: '--text-body-strong-size', lineToken: '--text-body-strong-line', sample: 'Emphasized body copy for highlights' },
  { name: 'Heading', sizeToken: '--text-heading-size', lineToken: '--text-heading-line', sample: 'Section heading example' },
  { name: 'Display', sizeToken: '--text-display-size', lineToken: '--text-display-line', sample: 'Publication Intelligence' },
  { name: 'Display XL', sizeToken: '--text-display-xl-size', lineToken: '--text-display-xl-line', sample: 'Research OS' },
]

const meta = {
  title: 'Design System/Foundations/Typography Scale',
  parameters: { layout: 'fullscreen' },
} satisfies Meta

export default meta
type Story = StoryObj

export const Scale: Story = {
  render: () => (
    <StoryFrame title="Typography scale" subtitle="Tokenized size and line-height samples with accessibility notes">
      <div data-ui="typography-scale-list" className="space-y-3">
        {TYPE_SCALE.map((item) => (
          <article data-ui="typography-scale-item" key={item.name} className="rounded-md border border-border bg-card p-4">
            <div data-ui="typography-scale-grid" className="grid gap-2 lg:grid-cols-[220px_1fr]">
              <div data-ui="typography-scale-meta">
                <p data-ui="type-name" className="text-label font-semibold">{item.name}</p>
                <p data-ui="type-token" className="text-caption text-muted-foreground">{item.sizeToken} / {item.lineToken}</p>
                <p data-ui="type-a11y" className="mt-2 text-caption text-muted-foreground">
                  WCAG note: verify 4.5:1 for normal text, 3:1 for large text.
                </p>
              </div>
              <div data-ui="typography-scale-preview" className="rounded-sm border border-border bg-background p-3">
                <p
                  data-ui="type-sample"
                  style={{
                    fontSize: `var(${item.sizeToken})`,
                    lineHeight: `var(${item.lineToken})`,
                    color: 'hsl(var(--foreground))',
                  }}
                >
                  {item.sample}
                </p>
                <div
                  aria-hidden
                  data-ui="type-line-visual-box"
                  className="mt-2 rounded-sm border border-dashed border-border"
                  style={{
                    height: `var(${item.lineToken})`,
                    background: 'hsl(var(--tone-neutral-100))',
                  }}
                />
                <p data-ui="line-height-visual" className="mt-1 text-caption text-muted-foreground">
                  Line-height visual: one baseline unit preview.
                </p>
              </div>
            </div>
          </article>
        ))}
      </div>
    </StoryFrame>
  ),
}
