import type { Meta, StoryObj } from '@storybook/react-vite'
import { expect, userEvent, within } from 'storybook/test'

import { Select } from '@/components/ui'
import { StoryFrame } from '../_helpers/StoryFrame'

const meta = {
  title: 'Design System/Primitives/Select Dropdown',
  component: Select,
  parameters: {
    layout: 'fullscreen',
  },
} satisfies Meta<typeof Select>

export default meta

type Story = StoryObj<typeof meta>

export const States: Story = {
  render: () => (
    <StoryFrame title="Select / dropdown">
      <div data-ui="select-story" className="max-w-sm space-y-5">
        <section data-ui="select-story-sizes" className="space-y-2">
          <div data-ui="select-story-sizes-label" className="text-label text-muted-foreground">
            Sizes
          </div>
          <div data-ui="select-story-sizes-grid" className="grid gap-2">
            <Select data-ui="select-story-size-sm" size="sm" defaultValue="one">
              <option data-ui="select-story-size-sm-option-one" value="one">
                Small
              </option>
              <option data-ui="select-story-size-sm-option-two" value="two">
                Option two
              </option>
            </Select>
            <Select data-ui="select-story-size-default" size="default" defaultValue="one">
              <option data-ui="select-story-size-default-option-one" value="one">
                Default
              </option>
              <option data-ui="select-story-size-default-option-two" value="two">
                Option two
              </option>
            </Select>
            <Select data-ui="select-story-size-lg" size="lg" defaultValue="one">
              <option data-ui="select-story-size-lg-option-one" value="one">
                Large
              </option>
              <option data-ui="select-story-size-lg-option-two" value="two">
                Option two
              </option>
            </Select>
          </div>
        </section>

        <section data-ui="select-story-states" className="space-y-2">
          <div data-ui="select-story-states-label" className="text-label text-muted-foreground">
            States
          </div>
          <div data-ui="select-story-states-grid" className="grid gap-2">
            <Select data-ui="select-story-default" defaultValue="default">
              <option data-ui="select-story-default-option-default" value="default">
                Default
              </option>
              <option data-ui="select-story-default-option-two" value="two">
                Option two
              </option>
            </Select>
            <Select data-ui="select-story-invalid" aria-invalid="true" defaultValue="invalid">
              <option data-ui="select-story-invalid-option" value="invalid">
                Invalid
              </option>
            </Select>
            <Select data-ui="select-story-disabled" disabled defaultValue="disabled">
              <option data-ui="select-story-disabled-option" value="disabled">
                Disabled
              </option>
            </Select>
          </div>
        </section>

        <section data-ui="select-story-focus" className="space-y-2">
          <div data-ui="select-story-focus-label" className="text-label text-muted-foreground">
            Focus Visible
          </div>
          <div data-ui="select-story-focus-grid" className="grid gap-2">
            <Select data-ui="select-story-focus-before" aria-label="Select focus before" defaultValue="before">
              <option data-ui="select-story-focus-before-option" value="before">
                Before
              </option>
              <option data-ui="select-story-focus-before-option-two" value="other">
                Other
              </option>
            </Select>
            <Select data-ui="select-story-focus-target" aria-label="Select focus target" defaultValue="target">
              <option data-ui="select-story-focus-target-option" value="target">
                Focus target
              </option>
              <option data-ui="select-story-focus-target-option-two" value="other">
                Other
              </option>
            </Select>
          </div>
        </section>
      </div>
    </StoryFrame>
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    const before = canvas.getByLabelText('Select focus before')
    before.focus()
    await userEvent.tab()
    await expect(canvas.getByLabelText('Select focus target')).toHaveFocus()
  },
}
