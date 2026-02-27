import type { Meta, StoryObj } from '@storybook/react'
import { StoryFrame } from '../_helpers/StoryFrame'
import { mockUsers } from '../_helpers/mockData'

const meta = { title: 'Design System/Composites/Role Management Row', parameters: { layout: 'fullscreen', chromatic: { disableSnapshot: true } } } satisfies Meta
export default meta
type Story = StoryObj

export const Pattern: Story = { render: () => <StoryFrame title="Role management row"><div className="space-y-2">{mockUsers.map((u)=><div key={u.id} className="flex items-center justify-between rounded-md border border-border bg-card p-2"><span>{u.name}</span><div className="flex items-center gap-2"><select className="house-dropdown h-8 px-2"><option>{u.role}</option><option>viewer</option></select><button className="house-collaborator-action-icon">Edit</button></div></div>)}</div></StoryFrame> }
