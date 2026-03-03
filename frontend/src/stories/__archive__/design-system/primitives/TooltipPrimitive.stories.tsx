import type { Meta, StoryObj } from '@storybook/react-vite'
import { LegacyButtonPrimitive } from '@/components/legacy/primitives/LegacyButtonPrimitive'
import {
  LegacyTooltipProvider,
  LegacyTooltipPrimitive,
  LegacyTooltipTrigger,
  LegacyTooltipContent,
} from '@/components/legacy/primitives/LegacyTooltipPrimitive'
import { StoryFrame } from '../_helpers/StoryFrame'

const meta = {
  title: 'Design System/Primitives/Tooltip Primitive',
  parameters: {
    layout: 'fullscreen',
    docs: {
      description: {
        component:
          'Token-governed tooltip primitive using Radix semantics. Supports keyboard focus, screen readers, reduced motion, and side positioning.',
      },
    },
  },
} satisfies Meta

export default meta
type Story = StoryObj

export const Showcase: Story = {
  render: () => (
    <StoryFrame title="Tooltip primitive" subtitle="Hover or focus triggers to reveal tooltip content">
      <LegacyTooltipProvider delayDuration={120}>
        <div data-ui="tooltip-primitive-story" className="space-y-5">
          <section data-ui="tooltip-basic-section" className="space-y-2">
            <p data-ui="tooltip-basic-label" className="text-label text-muted-foreground">Basic tooltip</p>
            <LegacyTooltipPrimitive>
              <LegacyTooltipTrigger asChild>
                <button data-ui="tooltip-basic-trigger" className="rounded-sm border border-border px-3 py-2 text-body">
                  Hover me
                </button>
              </LegacyTooltipTrigger>
              <LegacyTooltipContent data-ui="tooltip-basic-content">Basic helpful context</LegacyTooltipContent>
            </LegacyTooltipPrimitive>
          </section>

          <section data-ui="tooltip-positions-section" className="space-y-2">
            <p data-ui="tooltip-positions-label" className="text-label text-muted-foreground">All positions</p>
            <div data-ui="tooltip-positions-row" className="flex flex-wrap items-center gap-3">
              {(['top', 'right', 'bottom', 'left'] as const).map((side) => (
                <LegacyTooltipPrimitive key={side}>
                  <LegacyTooltipTrigger asChild>
                    <button data-ui="tooltip-side-trigger" className="rounded-sm border border-border px-3 py-2 text-body">
                      {side}
                    </button>
                  </LegacyTooltipTrigger>
                  <LegacyTooltipContent data-ui="tooltip-side-content" side={side}>
                    Positioned {side}
                  </LegacyTooltipContent>
                </LegacyTooltipPrimitive>
              ))}
            </div>
          </section>

          <section data-ui="tooltip-arrow-section" className="space-y-2">
            <p data-ui="tooltip-arrow-label" className="text-label text-muted-foreground">With arrow</p>
            <LegacyTooltipPrimitive>
              <LegacyTooltipTrigger asChild>
                <button data-ui="tooltip-arrow-trigger" className="rounded-sm border border-border px-3 py-2 text-body">
                  Arrow enabled
                </button>
              </LegacyTooltipTrigger>
              <LegacyTooltipContent data-ui="tooltip-arrow-content" withArrow>
                Tooltip with pointer arrow
              </LegacyTooltipContent>
            </LegacyTooltipPrimitive>
          </section>

          <section data-ui="tooltip-long-section" className="space-y-2">
            <p data-ui="tooltip-long-label" className="text-label text-muted-foreground">Long multiline content</p>
            <LegacyTooltipPrimitive>
              <LegacyTooltipTrigger asChild>
                <button data-ui="tooltip-long-trigger" className="rounded-sm border border-border px-3 py-2 text-body">
                  Long copy
                </button>
              </LegacyTooltipTrigger>
              <LegacyTooltipContent data-ui="tooltip-long-content" className="max-w-[20rem] whitespace-normal">
                This tooltip demonstrates longer content with multiline wrapping for explanatory text and guidance.
              </LegacyTooltipContent>
            </LegacyTooltipPrimitive>
          </section>

          <section data-ui="tooltip-button-section" className="space-y-2">
            <p data-ui="tooltip-button-label" className="text-label text-muted-foreground">Composition with ButtonPrimitive</p>
            <LegacyTooltipPrimitive>
              <LegacyTooltipTrigger asChild>
                <div data-ui="tooltip-button-trigger-wrap" className="inline-flex">
                  <LegacyButtonPrimitive data-ui="tooltip-button-trigger" size="sm" variant="secondary">
                    Save Draft
                  </LegacyButtonPrimitive>
                </div>
              </LegacyTooltipTrigger>
              <LegacyTooltipContent data-ui="tooltip-button-content">
                Saves progress without publishing
              </LegacyTooltipContent>
            </LegacyTooltipPrimitive>
          </section>

          <section data-ui="tooltip-a11y-section" className="space-y-1 rounded-md border border-border bg-card p-3">
            <p data-ui="tooltip-a11y-title" className="text-label font-semibold">Accessibility notes</p>
            <p data-ui="tooltip-a11y-keyboard" className="text-caption text-muted-foreground">
              Keyboard users can focus triggers to reveal tooltips.
            </p>
            <p data-ui="tooltip-a11y-screenreader" className="text-caption text-muted-foreground">
              Radix applies tooltip semantics for assistive technology.
            </p>
            <p data-ui="tooltip-a11y-motion" className="text-caption text-muted-foreground">
              Animation is disabled for reduced motion preferences.
            </p>
          </section>
        </div>
      </LegacyTooltipProvider>
    </StoryFrame>
  ),
}

