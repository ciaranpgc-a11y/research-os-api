import type { Meta, StoryObj } from '@storybook/react-vite'
import { ArrowRight, Plus } from 'lucide-react'
import { LegacyButtonPrimitive } from '@/components/legacy/primitives/LegacyButtonPrimitive'
import { StoryFrame } from '../_helpers/StoryFrame'

const meta = {
  title: 'Design System/Primitives/Button Primitive',
  component: LegacyButtonPrimitive,
  parameters: {
    layout: 'fullscreen',
    docs: {
      description: {
        component:
          'Governed button primitive. Accessibility: minimum 44px touch target, visible keyboard focus ring, and disabled non-interactive behavior.',
      },
    },
  },
} satisfies Meta<typeof LegacyButtonPrimitive>

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
            <LegacyButtonPrimitive variant="primary">Primary</LegacyButtonPrimitive>
            <LegacyButtonPrimitive variant="secondary">Secondary</LegacyButtonPrimitive>
            <LegacyButtonPrimitive variant="ghost">Ghost</LegacyButtonPrimitive>
          </div>
        </section>

        <section data-ui="button-primitive-sizes" className="space-y-2">
          <p data-ui="button-primitive-sizes-label" className="text-label text-muted-foreground">Sizes</p>
          <div data-ui="button-primitive-sizes-row" className="flex flex-wrap items-center gap-2">
            <LegacyButtonPrimitive size="sm" variant="primary">Small (44px)</LegacyButtonPrimitive>
            <LegacyButtonPrimitive size="md" variant="primary">Medium (44px)</LegacyButtonPrimitive>
            <LegacyButtonPrimitive size="lg" variant="primary">Large (56px)</LegacyButtonPrimitive>
          </div>
        </section>

        <section data-ui="button-primitive-states" className="space-y-2">
          <p data-ui="button-primitive-states-label" className="text-label text-muted-foreground">States</p>
          <div data-ui="button-primitive-states-row" className="flex flex-wrap items-center gap-2">
            <LegacyButtonPrimitive variant="secondary">Default</LegacyButtonPrimitive>
            <LegacyButtonPrimitive
              variant="secondary"
              className="shadow-[var(--button-elevation-hover)] -translate-y-px"
            >
              Hover Preview
            </LegacyButtonPrimitive>
            <LegacyButtonPrimitive variant="ghost" autoFocus>Focus Target</LegacyButtonPrimitive>
            <LegacyButtonPrimitive variant="primary" disabled>Disabled</LegacyButtonPrimitive>
          </div>
        </section>

        <section data-ui="button-primitive-icons" className="space-y-2">
          <p data-ui="button-primitive-icons-label" className="text-label text-muted-foreground">Icon compositions</p>
          <div data-ui="button-primitive-icons-row" className="flex flex-wrap items-center gap-2">
            <LegacyButtonPrimitive variant="primary">
              <Plus className="mr-2 h-4 w-4" />
              Create
            </LegacyButtonPrimitive>
            <LegacyButtonPrimitive variant="ghost">
              Continue
              <ArrowRight className="ml-2 h-4 w-4" />
            </LegacyButtonPrimitive>
          </div>
        </section>
      </div>
    </StoryFrame>
  ),
}

