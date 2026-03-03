import type { Meta, StoryObj } from '@storybook/react-vite'
import { LegacyTextareaPrimitive } from '@/components/legacy/primitives/LegacyTextareaPrimitive'
import { StoryFrame } from '../_helpers/StoryFrame'

const meta = {
  title: 'Design System/Primitives/Textarea Primitive',
  component: LegacyTextareaPrimitive,
  parameters: {
    layout: 'fullscreen',
    docs: {
      description: {
        component:
          'Governed textarea primitive with tokenized spacing, borders, focus/error states, and controlled resize behavior.',
      },
    },
  },
} satisfies Meta<typeof LegacyTextareaPrimitive>

export default meta
type Story = StoryObj<typeof meta>

export const Showcase: Story = {
  render: () => (
    <StoryFrame title="Textarea primitive" subtitle="Token-governed multiline input with accessibility-friendly state cues">
      <div data-ui="textarea-primitive-story" className="max-w-2xl space-y-5">
        <section data-ui="textarea-primitive-sizes" className="space-y-2">
          <p data-ui="textarea-primitive-sizes-label" className="text-label text-muted-foreground">All sizes</p>
          <div data-ui="textarea-primitive-sizes-grid" className="grid gap-2">
            <LegacyTextareaPrimitive data-ui="textarea-primitive-size-sm" size="sm" defaultValue="Small textarea" readOnly />
            <LegacyTextareaPrimitive data-ui="textarea-primitive-size-md" size="md" defaultValue="Medium textarea" readOnly />
            <LegacyTextareaPrimitive data-ui="textarea-primitive-size-lg" size="lg" defaultValue="Large textarea" readOnly />
          </div>
        </section>

        <section data-ui="textarea-primitive-states" className="space-y-2">
          <p data-ui="textarea-primitive-states-label" className="text-label text-muted-foreground">States</p>
          <div data-ui="textarea-primitive-states-grid" className="grid gap-2">
            <LegacyTextareaPrimitive data-ui="textarea-primitive-default" placeholder="Default state with placeholder" />
            <LegacyTextareaPrimitive data-ui="textarea-primitive-focus" autoFocus defaultValue="Focus state preview" />
            <LegacyTextareaPrimitive data-ui="textarea-primitive-error" aria-invalid="true" defaultValue="Error via aria-invalid=true" readOnly />
            <LegacyTextareaPrimitive data-ui="textarea-primitive-disabled" disabled defaultValue="Disabled state" readOnly />
          </div>
        </section>

        <section data-ui="textarea-primitive-placeholder" className="space-y-2">
          <p data-ui="textarea-primitive-placeholder-label" className="text-label text-muted-foreground">With/without placeholder</p>
          <div data-ui="textarea-primitive-placeholder-grid" className="grid gap-2">
            <LegacyTextareaPrimitive data-ui="textarea-primitive-placeholder-only" placeholder="Placeholder only" />
            <LegacyTextareaPrimitive data-ui="textarea-primitive-value-only" defaultValue="Value only content" readOnly />
            <LegacyTextareaPrimitive data-ui="textarea-primitive-empty-no-placeholder" />
          </div>
        </section>

        <section data-ui="textarea-primitive-resize" className="space-y-2">
          <p data-ui="textarea-primitive-resize-label" className="text-label text-muted-foreground">Resize variants</p>
          <div data-ui="textarea-primitive-resize-grid" className="grid gap-2 md:grid-cols-2">
            <div data-ui="textarea-primitive-resize-vertical-wrap" className="rounded-md border border-border bg-card p-3">
              <p data-ui="textarea-primitive-resize-vertical-label" className="mb-2 text-caption text-muted-foreground">Vertical resize (default)</p>
              <LegacyTextareaPrimitive data-ui="textarea-primitive-resize-vertical" resize="vertical" placeholder="Drag bottom edge to resize" />
            </div>
            <div data-ui="textarea-primitive-resize-none-wrap" className="rounded-md border border-border bg-card p-3">
              <p data-ui="textarea-primitive-resize-none-label" className="mb-2 text-caption text-muted-foreground">Fixed size (no resize)</p>
              <LegacyTextareaPrimitive data-ui="textarea-primitive-resize-none" resize="none" placeholder="Resize disabled" />
            </div>
          </div>
        </section>

        <section data-ui="textarea-primitive-a11y" className="space-y-1 rounded-md border border-border bg-card p-3">
          <p data-ui="textarea-primitive-a11y-title" className="text-label font-semibold">Accessibility notes</p>
          <p data-ui="textarea-primitive-a11y-focus" className="text-caption text-muted-foreground">
            Focus visibility uses `--ring-focus`; error state uses `aria-invalid` + `--ring-error`.
          </p>
          <p data-ui="textarea-primitive-a11y-contrast" className="text-caption text-muted-foreground">
            Placeholder text uses muted foreground token for consistent readable contrast.
          </p>
        </section>
      </div>
    </StoryFrame>
  ),
}

