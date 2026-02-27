import type { Meta, StoryObj } from '@storybook/react'
import { StoryFrame } from '../_helpers/StoryFrame'
import { mockInvitations } from '../_helpers/mockData'

const meta = { title: 'Design System/Composites/Invitation Panel', parameters: { layout: 'fullscreen', chromatic: { disableSnapshot: true } } } satisfies Meta
export default meta
type Story = StoryObj

export const Pattern: Story = { render: () => <StoryFrame title="Invitation panel"><div className="rounded-md border border-border bg-card p-3"><div className="space-y-2">{mockInvitations.map((item)=><div key={item.id} className="flex items-center justify-between"><span>{item.name}</span><span className="text-caption text-muted-foreground">{item.role} • {item.status}</span></div>)}</div></div></StoryFrame> }
