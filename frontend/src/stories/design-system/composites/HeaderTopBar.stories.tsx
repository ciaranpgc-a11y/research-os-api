import type { Meta, StoryObj } from '@storybook/react'
import { Search } from 'lucide-react'
import { StoryFrame } from '../_helpers/StoryFrame'

const meta = { title: 'Design System/Composites/Header TopBar', parameters: { layout: 'fullscreen', chromatic: { disableSnapshot: true } } } satisfies Meta
export default meta
type Story = StoryObj

export const Pattern: Story = { render: () => <StoryFrame title="Header / top bar"><div className="rounded-md border border-border bg-card p-3"><div className="flex items-center justify-between gap-3"><div className="flex gap-1"><button className="house-top-nav-item house-top-nav-item-active house-top-nav-item-workspace">Workspaces</button><button className="house-top-nav-item house-top-nav-item-profile">Profile</button></div><div className="relative w-[24rem]"><Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" /><input className="house-input h-9 w-full pl-8" defaultValue="Search sections" /></div></div></div></StoryFrame> }
