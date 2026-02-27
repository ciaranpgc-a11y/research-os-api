import type { Meta, StoryObj } from '@storybook/react'
import { ArrowRight, Plus } from 'lucide-react'
import { ButtonPrimitive } from '@/components/primitives/ButtonPrimitive'
import { StoryFrame } from '../_helpers/StoryFrame'

const meta = {
  title: 'Design System/Primitives/Button Primitive',
  component: ButtonPrimitive,
  parameters: {
    layout: 'fullscreen',
    docs: {
      description: {
        component:
          'Governed button primitive. Accessibility: minimum 44px touch target, visible keyboard focus ring, and disabled non-interactive behavior.',
      },
    },
  },
} satisfies Meta<typeof ButtonPrimitive>

export default meta
type Story = StoryObj<typeof meta>

export const Showcase: Story = {
  parameters: {
    docs: {
      description: {
        story:
          'Variants, sizes, and state previews for token-driven button behavior. Focus example is auto-focused for keyboard ring verification.',
      },
    },
  },
  render: () => (
    <StoryFrame title="Button primitive" subtitle="Token-governed primitive with WCAG-friendly touch target and focus treatment">
      <div data-ui="button-primitive-story" className="space-y-5">
        <section data-ui="button-primitive-variants" className="space-y-2">
          <p data-ui="button-primitive-variants-label" className="text-label text-muted-foreground">Variants</p>
          <div data-ui="button-primitive-variants-row" className="flex flex-wrap items-center gap-2">
            <ButtonPrimitive variant="primary">Primary</ButtonPrimitive>
            <ButtonPrimitive variant="secondary">Secondary</ButtonPrimitive>
            <ButtonPrimitive variant="ghost">Ghost</ButtonPrimitive>
          </div>
        </section>

        <section data-ui="button-primitive-sizes" className="space-y-2">
          <p data-ui="button-primitive-sizes-label" className="text-label text-muted-foreground">Sizes</p>
          <div data-ui="button-primitive-sizes-row" className="flex flex-wrap items-center gap-2">
            <ButtonPrimitive size="sm" variant="primary">Small (44px)</ButtonPrimitive>
            <ButtonPrimitive size="md" variant="primary">Medium (44px)</ButtonPrimitive>
            <ButtonPrimitive size="lg" variant="primary">Large (56px)</ButtonPrimitive>
          </div>
        </section>

        <section data-ui="button-primitive-states" className="space-y-2">
          <p data-ui="button-primitive-states-label" className="text-label text-muted-foreground">States</p>
          <div data-ui="button-primitive-states-row" className="flex flex-wrap items-center gap-2">
            <ButtonPrimitive variant="secondary">Default</ButtonPrimitive>
            <ButtonPrimitive
              variant="secondary"
              className="shadow-[var(--button-elevation-hover)] -translate-y-px"
            >
              Hover Preview
            </ButtonPrimitive>
            <ButtonPrimitive variant="ghost" autoFocus>Focus Target</ButtonPrimitive>
            <ButtonPrimitive variant="primary" disabled>Disabled</ButtonPrimitive>
          </div>
        </section>

        <section data-ui="button-primitive-icons" className="space-y-2">
          <p data-ui="button-primitive-icons-label" className="text-label text-muted-foreground">Icon compositions</p>
          <div data-ui="button-primitive-icons-row" className="flex flex-wrap items-center gap-2">
            <ButtonPrimitive variant="primary">
              <Plus className="mr-2 h-4 w-4" />
              Create
            </ButtonPrimitive>
            <ButtonPrimitive variant="ghost">
              Continue
              <ArrowRight className="ml-2 h-4 w-4" />
            </ButtonPrimitive>
          </div>
        </section>
      </div>
    </StoryFrame>
  ),
}
