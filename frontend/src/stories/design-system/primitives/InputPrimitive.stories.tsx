import type { Meta, StoryObj } from '@storybook/react'
import { InputPrimitive } from '@/components/primitives/InputPrimitive'
import { StoryFrame } from '../_helpers/StoryFrame'

const meta = {
  title: 'Design System/Primitives/Input Primitive',
  component: InputPrimitive,
  parameters: {
    layout: 'fullscreen',
    docs: {
      description: {
        component:
          'Governed input primitive with token-only styling, visible keyboard focus indicator, and `aria-invalid` error treatment.',
      },
    },
  },
} satisfies Meta<typeof InputPrimitive>

export default meta
type Story = StoryObj<typeof meta>

export const Showcase: Story = {
  parameters: {
    docs: {
      description: {
        story:
          'Size, state, placeholder/value coverage. Focus sample auto-focuses to surface focus visibility behavior.',
      },
    },
  },
  render: () => (
    <StoryFrame title="Input primitive" subtitle="Token-governed form input with accessibility-first state behavior">
      <div data-ui="input-primitive-story" className="max-w-xl space-y-5">
        <section data-ui="input-primitive-sizes" className="space-y-2">
          <p data-ui="input-primitive-sizes-label" className="text-label text-muted-foreground">Sizes</p>
          <div data-ui="input-primitive-sizes-grid" className="grid gap-2">
            <InputPrimitive data-ui="input-primitive-size-sm" size="sm" defaultValue="Small (h-10, min 44px)" readOnly />
            <InputPrimitive data-ui="input-primitive-size-md" size="md" defaultValue="Medium (h-11)" readOnly />
            <InputPrimitive data-ui="input-primitive-size-lg" size="lg" defaultValue="Large (h-14)" readOnly />
          </div>
        </section>

        <section data-ui="input-primitive-states" className="space-y-2">
          <p data-ui="input-primitive-states-label" className="text-label text-muted-foreground">States</p>
          <div data-ui="input-primitive-states-grid" className="grid gap-2">
            <InputPrimitive data-ui="input-primitive-default" placeholder="Default state with placeholder" />
            <InputPrimitive data-ui="input-primitive-focus" aria-label="Input focus target" defaultValue="Focus state preview" autoFocus />
            <InputPrimitive data-ui="input-primitive-error" aria-invalid="true" defaultValue="Error state via aria-invalid=true" readOnly />
            <InputPrimitive data-ui="input-primitive-disabled" disabled defaultValue="Disabled state" readOnly />
          </div>
        </section>

        <section data-ui="input-primitive-content-cases" className="space-y-2">
          <p data-ui="input-primitive-content-cases-label" className="text-label text-muted-foreground">Value / Placeholder coverage</p>
          <div data-ui="input-primitive-content-cases-grid" className="grid gap-2">
            <InputPrimitive data-ui="input-primitive-placeholder-only" placeholder="Placeholder only" />
            <InputPrimitive data-ui="input-primitive-value-only" defaultValue="Value only" readOnly />
            <InputPrimitive data-ui="input-primitive-empty-no-placeholder" />
          </div>
        </section>

        <section data-ui="input-primitive-a11y-notes" className="space-y-1 rounded-md border border-border bg-card p-3">
          <p data-ui="input-primitive-a11y-title" className="text-label font-semibold">Accessibility notes</p>
          <p data-ui="input-primitive-a11y-focus" className="text-caption text-muted-foreground">Focus indicator uses `--ring-focus` for keyboard visibility.</p>
          <p data-ui="input-primitive-a11y-error" className="text-caption text-muted-foreground">Error styling is triggered by `aria-invalid=\"true\"` and uses `--ring-error`.</p>
          <p data-ui="input-primitive-a11y-touch" className="text-caption text-muted-foreground">Minimum touch target baseline is enforced via `min-h-11` (44px).</p>
        </section>
      </div>
    </StoryFrame>
  ),
}
