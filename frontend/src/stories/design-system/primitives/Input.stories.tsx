import type { Meta, StoryObj } from '@storybook/react'
import { expect, userEvent, within } from '@storybook/test'

import { Input } from '@/components/ui/input'

import { StoryFrame } from '../_helpers/StoryFrame'

const meta = {
  title: 'Design System/Primitives/Input',
  component: Input,
  parameters: {
    layout: 'fullscreen',
  },
} satisfies Meta<typeof Input>

export default meta

type Story = StoryObj<typeof meta>

export const States: Story = {
  render: () => (
    <StoryFrame title="Input">
      <div data-ui="input-story" className="max-w-xl space-y-5">
        <section data-ui="input-story-sizes" className="space-y-2">
          <div data-ui="input-story-sizes-label" className="text-label text-muted-foreground">
            Sizes
          </div>
          <div data-ui="input-story-sizes-grid" className="grid gap-2">
            <Input data-ui="input-story-size-sm" size="sm" defaultValue="Small" readOnly />
            <Input data-ui="input-story-size-default" size="default" defaultValue="Default" readOnly />
            <Input data-ui="input-story-size-lg" size="lg" defaultValue="Large" readOnly />
          </div>
        </section>

        <section data-ui="input-story-states" className="space-y-2">
          <div data-ui="input-story-states-label" className="text-label text-muted-foreground">
            States
          </div>
          <div data-ui="input-story-states-grid" className="grid gap-2">
            <Input data-ui="input-story-default" placeholder="Default" />
            <Input data-ui="input-story-invalid" aria-invalid="true" defaultValue="Invalid" readOnly />
            <Input data-ui="input-story-disabled" disabled defaultValue="Disabled" readOnly />
          </div>
        </section>

        <section data-ui="input-story-focus" className="space-y-2">
          <div data-ui="input-story-focus-label" className="text-label text-muted-foreground">
            Focus Visible
          </div>
          <div data-ui="input-story-focus-grid" className="grid gap-2">
            <Input data-ui="input-story-focus-before" aria-label="Input focus before" defaultValue="Before" readOnly />
            <Input
              data-ui="input-story-focus-target"
              aria-label="Input focus target"
              defaultValue="Focus target"
              readOnly
            />
          </div>
        </section>
      </div>
    </StoryFrame>
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    const before = canvas.getByLabelText('Input focus before')
    before.focus()
    await userEvent.tab()
    await expect(canvas.getByLabelText('Input focus target')).toHaveFocus()
  },
}
