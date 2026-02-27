import type { Meta, StoryObj } from '@storybook/react'
import { expect, userEvent, within } from 'storybook/test'

import { Textarea } from '@/components/ui/textarea'

import { StoryFrame } from '../_helpers/StoryFrame'

const meta = {
  title: 'Design System/Primitives/Textarea',
  component: Textarea,
  parameters: {
    layout: 'fullscreen',
  },
} satisfies Meta<typeof Textarea>

export default meta

type Story = StoryObj<typeof meta>

export const States: Story = {
  render: () => (
    <StoryFrame title="Textarea">
      <div data-ui="textarea-story" className="max-w-xl space-y-5">
        <section data-ui="textarea-story-sizes" className="space-y-2">
          <div data-ui="textarea-story-sizes-label" className="text-label text-muted-foreground">
            Sizes
          </div>
          <div data-ui="textarea-story-sizes-grid" className="grid gap-2">
            <Textarea data-ui="textarea-story-size-sm" size="sm" defaultValue="Small" readOnly />
            <Textarea data-ui="textarea-story-size-default" size="default" defaultValue="Default" readOnly />
            <Textarea data-ui="textarea-story-size-lg" size="lg" defaultValue="Large" readOnly />
          </div>
        </section>

        <section data-ui="textarea-story-states" className="space-y-2">
          <div data-ui="textarea-story-states-label" className="text-label text-muted-foreground">
            States
          </div>
          <div data-ui="textarea-story-states-grid" className="grid gap-2">
            <Textarea data-ui="textarea-story-default" placeholder="Default" />
            <Textarea data-ui="textarea-story-invalid" aria-invalid="true" defaultValue="Invalid" readOnly />
            <Textarea data-ui="textarea-story-disabled" disabled defaultValue="Disabled" readOnly />
          </div>
        </section>

        <section data-ui="textarea-story-focus" className="space-y-2">
          <div data-ui="textarea-story-focus-label" className="text-label text-muted-foreground">
            Focus Visible
          </div>
          <div data-ui="textarea-story-focus-grid" className="grid gap-2">
            <Textarea
              data-ui="textarea-story-focus-before"
              aria-label="Textarea focus before"
              defaultValue="Before"
              readOnly
            />
            <Textarea
              data-ui="textarea-story-focus-target"
              aria-label="Textarea focus target"
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
    const before = canvas.getByLabelText('Textarea focus before')
    before.focus()
    await userEvent.tab()
    await expect(canvas.getByLabelText('Textarea focus target')).toHaveFocus()
  },
}
