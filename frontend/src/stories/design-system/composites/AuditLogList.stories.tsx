import type { Meta, StoryObj } from '@storybook/react'
import { StoryFrame } from '../_helpers/StoryFrame'
import { mockLogs } from '../_helpers/mockData'

const meta = { title: 'Design System/Composites/Audit Log List', parameters: { layout: 'fullscreen', chromatic: { disableSnapshot: true } } } satisfies Meta
export default meta
type Story = StoryObj

export const Pattern: Story = { render: () => <StoryFrame title="Audit log list"><div className="space-y-2">{mockLogs.map((log)=><div key={log.id} className="rounded-md border border-border bg-card p-3"><p className="text-sm">{log.action}</p><p className="text-caption text-muted-foreground mt-1">{log.actor} • {log.at}</p></div>)}</div></StoryFrame> }
