import { useState } from 'react'
import type { Meta, StoryObj } from '@storybook/react-vite'
import {
  LegacySelectPrimitive,
  LegacySelectTrigger,
  LegacySelectContent,
  LegacySelectItem,
  LegacySelectValue,
} from '@/components/legacy/primitives/LegacySelectPrimitive'
import { StoryFrame } from '../_helpers/StoryFrame'

const meta = {
  title: 'Design System/Primitives/Select Primitive',
  parameters: {
    layout: 'fullscreen',
    docs: {
      description: {
        component:
          'Radix-based governed select primitive with tokenized trigger states, animated content panel, and keyboard/screen-reader support.',
      },
    },
  },
} satisfies Meta

export default meta
type Story = StoryObj

function DemoSelect({
  value,
  onValueChange,
  size = 'md',
  placeholder = 'Select an option',
  disabled = false,
  invalid = false,
  options,
}: {
  value: string
  onValueChange: (v: string) => void
  size?: 'sm' | 'md' | 'lg'
  placeholder?: string
  disabled?: boolean
  invalid?: boolean
  options: Array<{ value: string; label: string }>
}) {
  return (
    <LegacySelectPrimitive value={value} onValueChange={onValueChange} disabled={disabled}>
      <LegacySelectTrigger data-ui="select-primitive-demo-trigger" size={size} aria-invalid={invalid || undefined}>
        <LegacySelectValue placeholder={placeholder} />
      </LegacySelectTrigger>
      <LegacySelectContent data-ui="select-primitive-demo-content">
        {options.map((option) => (
          <LegacySelectItem key={option.value} value={option.value}>
            {option.label}
          </LegacySelectItem>
        ))}
      </LegacySelectContent>
    </LegacySelectPrimitive>
  )
}

const BASIC_OPTIONS = [
  { value: 'alpha', label: 'Alpha' },
  { value: 'beta', label: 'Beta' },
  { value: 'gamma', label: 'Gamma' },
  { value: 'delta', label: 'Delta' },
]

const LONG_OPTIONS = Array.from({ length: 20 }).map((_, i) => ({
  value: `item-${i + 1}`,
  label: `Option ${i + 1}`,
}))

export const Showcase: Story = {
  render: () => {
    const [basic, setBasic] = useState('')
    const [small, setSmall] = useState('')
    const [large, setLarge] = useState('')
    const [errorValue, setErrorValue] = useState('')
    const [longValue, setLongValue] = useState('')

    return (
      <StoryFrame title="Select primitive" subtitle="Token-governed select with state, size, and accessibility coverage">
        <div data-ui="select-primitive-story" className="max-w-2xl space-y-5">
          <section data-ui="select-primitive-basic" className="space-y-2">
            <p data-ui="select-primitive-basic-label" className="text-label text-muted-foreground">Basic select</p>
            <DemoSelect value={basic} onValueChange={setBasic} options={BASIC_OPTIONS} />
          </section>

          <section data-ui="select-primitive-sizes" className="space-y-2">
            <p data-ui="select-primitive-sizes-label" className="text-label text-muted-foreground">All sizes</p>
            <div data-ui="select-primitive-sizes-grid" className="grid gap-2">
              <DemoSelect value={small} onValueChange={setSmall} size="sm" placeholder="Small select" options={BASIC_OPTIONS} />
              <DemoSelect value={basic} onValueChange={setBasic} size="md" placeholder="Medium select" options={BASIC_OPTIONS} />
              <DemoSelect value={large} onValueChange={setLarge} size="lg" placeholder="Large select" options={BASIC_OPTIONS} />
            </div>
          </section>

          <section data-ui="select-primitive-states" className="space-y-2">
            <p data-ui="select-primitive-states-label" className="text-label text-muted-foreground">States</p>
            <div data-ui="select-primitive-states-grid" className="grid gap-2">
              <DemoSelect value={basic} onValueChange={setBasic} placeholder="Default" options={BASIC_OPTIONS} />
              <DemoSelect value={errorValue} onValueChange={setErrorValue} invalid placeholder="Error state" options={BASIC_OPTIONS} />
              <DemoSelect value="" onValueChange={() => {}} disabled placeholder="Disabled" options={BASIC_OPTIONS} />
            </div>
          </section>

          <section data-ui="select-primitive-long" className="space-y-2">
            <p data-ui="select-primitive-long-label" className="text-label text-muted-foreground">Long option list (scrollable)</p>
            <DemoSelect value={longValue} onValueChange={setLongValue} placeholder="Open to scroll options" options={LONG_OPTIONS} />
          </section>

          <section data-ui="select-primitive-placeholder" className="space-y-2">
            <p data-ui="select-primitive-placeholder-label" className="text-label text-muted-foreground">With placeholder</p>
            <DemoSelect value="" onValueChange={() => {}} placeholder="Choose one..." options={BASIC_OPTIONS} />
          </section>

          <section data-ui="select-primitive-a11y" className="space-y-1 rounded-md border border-border bg-card p-3">
            <p data-ui="select-primitive-a11y-title" className="text-label font-semibold">Accessibility notes</p>
            <p data-ui="select-primitive-a11y-keyboard" className="text-caption text-muted-foreground">
              Keyboard navigation is supported by Radix (arrow keys, enter, escape).
            </p>
            <p data-ui="select-primitive-a11y-screenreader" className="text-caption text-muted-foreground">
              Trigger and listbox semantics are provided for screen readers.
            </p>
            <p data-ui="select-primitive-a11y-focus" className="text-caption text-muted-foreground">
              Trigger focus visibility is tokenized with `--ring-focus`.
            </p>
          </section>
        </div>
      </StoryFrame>
    )
  },
}

