import type { Meta, StoryObj } from '@storybook/react-vite'
import type { ComponentProps } from 'react'
import { LegacyBadgePrimitive } from '@/components/legacy/primitives/LegacyBadgePrimitive'
import { StoryFrame } from '../_helpers/StoryFrame'

const meta = {
  title: 'Design System/Primitives/Badge Primitive',
  component: LegacyBadgePrimitive,
  parameters: {
    layout: 'fullscreen',
    docs: {
      description: {
        component:
          'Semantic badge primitive for status, count, and label metadata. Non-interactive by default; interaction should be handled by parent controls.',
      },
    },
  },
} satisfies Meta<typeof LegacyBadgePrimitive>

export default meta
type Story = StoryObj<typeof meta>

const VARIANTS: Array<NonNullable<ComponentProps<typeof LegacyBadgePrimitive>['variant']>> = [
  'default',
  'primary',
  'secondary',
  'success',
  'warning',
  'danger',
  'outline',
]

export const Showcase: Story = {
  render: () => (
    <StoryFrame title="Badge primitive" subtitle="Semantic tones and compact metadata chips">
      <div data-ui="badge-primitive-story" className="space-y-5">
        <section data-ui="badge-primitive-variants-section" className="space-y-2">
          <p data-ui="badge-primitive-variants-label" className="text-label text-muted-foreground">All variants</p>
          <div data-ui="badge-primitive-variants-grid" className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
            {VARIANTS.map((variant) => (
              <div data-ui="badge-primitive-variant-item" key={variant} className="rounded-md border border-border bg-card p-3">
                <p data-ui="badge-primitive-variant-name" className="mb-2 text-caption text-muted-foreground">{variant}</p>
                <LegacyBadgePrimitive data-ui="badge-primitive-variant-demo" variant={variant}>
                  {variant}
                </LegacyBadgePrimitive>
              </div>
            ))}
          </div>
        </section>

        <section data-ui="badge-primitive-sizes-section" className="space-y-2">
          <p data-ui="badge-primitive-sizes-label" className="text-label text-muted-foreground">Sizes</p>
          <div data-ui="badge-primitive-sizes-row" className="flex flex-wrap items-center gap-2">
            <LegacyBadgePrimitive data-ui="badge-primitive-size-sm" size="sm" variant="primary">SM / micro</LegacyBadgePrimitive>
            <LegacyBadgePrimitive data-ui="badge-primitive-size-md" size="md" variant="primary">MD / caption</LegacyBadgePrimitive>
          </div>
        </section>

        <section data-ui="badge-primitive-use-cases-section" className="space-y-2">
          <p data-ui="badge-primitive-use-cases-label" className="text-label text-muted-foreground">Use cases</p>
          <div data-ui="badge-primitive-use-cases-grid" className="grid gap-3 md:grid-cols-3">
            <div data-ui="badge-primitive-use-case-status" className="rounded-md border border-border bg-card p-3">
              <p data-ui="badge-primitive-use-case-status-label" className="mb-2 text-caption text-muted-foreground">Status indicator</p>
              <LegacyBadgePrimitive data-ui="badge-primitive-status-badge" variant="success">Active</LegacyBadgePrimitive>
            </div>
            <div data-ui="badge-primitive-use-case-count" className="rounded-md border border-border bg-card p-3">
              <p data-ui="badge-primitive-use-case-count-label" className="mb-2 text-caption text-muted-foreground">Count indicator</p>
              <LegacyBadgePrimitive data-ui="badge-primitive-count-badge" variant="danger">12</LegacyBadgePrimitive>
            </div>
            <div data-ui="badge-primitive-use-case-label" className="rounded-md border border-border bg-card p-3">
              <p data-ui="badge-primitive-use-case-label-title" className="mb-2 text-caption text-muted-foreground">Category label</p>
              <LegacyBadgePrimitive data-ui="badge-primitive-label-badge" variant="outline">Methods</LegacyBadgePrimitive>
            </div>
          </div>
        </section>

        <section data-ui="badge-primitive-a11y-section" className="space-y-1 rounded-md border border-border bg-card p-3">
          <p data-ui="badge-primitive-a11y-title" className="text-label font-semibold">Accessibility notes</p>
          <p data-ui="badge-primitive-a11y-contrast" className="text-caption text-muted-foreground">
            Variant contrast targets: default/primary/success/warning/danger aim for 4.5:1+ text contrast.
          </p>
          <p data-ui="badge-primitive-a11y-warning" className="text-caption text-muted-foreground">
            Warning uses `tone-warning-900` text for stronger readability.
          </p>
          <p data-ui="badge-primitive-a11y-interaction" className="text-caption text-muted-foreground">
            Badge is non-interactive by default (`span`); wrap in a control if interaction is needed.
          </p>
        </section>
      </div>
    </StoryFrame>
  ),
}

