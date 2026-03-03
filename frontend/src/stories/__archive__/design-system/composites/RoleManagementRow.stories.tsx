import type { Meta, StoryObj } from '@storybook/react-vite'

import { Select } from '@/components/ui'
import { StoryFrame } from '../_helpers/StoryFrame'
import { mockUsers } from '../_helpers/mockData'

const meta = {
  title: 'Design System/Composites/Role Management Row',
  parameters: { layout: 'fullscreen', chromatic: { disableSnapshot: true } },
} satisfies Meta

export default meta
type Story = StoryObj

export const Pattern: Story = {
  render: () => (
    <StoryFrame title="Role management row">
      <div className="space-y-2">
        {mockUsers.map((u) => (
          <div key={u.id} className="flex items-center justify-between rounded-md border border-border bg-card p-2">
            <span>{u.name}</span>
            <div className="flex items-center gap-2">
              <Select size="sm" className="h-8 w-auto px-2 text-xs">
                <option>{u.role}</option>
                <option>viewer</option>
              </Select>
              <button className="house-collaborator-action-icon">Edit</button>
            </div>
          </div>
        ))}
      </div>
    </StoryFrame>
  ),
}
