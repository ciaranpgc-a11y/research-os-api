import type { Meta, StoryObj } from '@storybook/react'
import { StoryFrame } from '../_helpers/StoryFrame'

const meta = { title: 'Design System/Composites/Filters Bar Pattern', parameters: { layout: 'fullscreen', chromatic: { disableSnapshot: true } } } satisfies Meta
export default meta
type Story = StoryObj

export const Pattern: Story = { render: () => <StoryFrame title="Filters bar pattern"><div className="rounded-md border border-border bg-card p-3"><div className="flex flex-wrap items-center gap-2"><input className="house-table-filter-input h-9 w-56" defaultValue="Search" /><select className="house-table-filter-select h-9 px-2"><option>All status</option></select><select className="house-table-filter-select h-9 px-2"><option>Owner</option></select><button className="house-table-sort-trigger">Sort newest</button></div></div></StoryFrame> }
