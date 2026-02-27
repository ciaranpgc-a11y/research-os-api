import type { Meta, StoryObj } from '@storybook/react'
import { StoryFrame } from '../_helpers/StoryFrame'

const meta = { title: 'Design System/Composites/Tile Shell', parameters: { layout: 'fullscreen', chromatic: { disableSnapshot: true } } } satisfies Meta
export default meta
type Story = StoryObj

export const MetricChartContainer: Story = { render: () => <StoryFrame title="Tile shell"><div className="grid gap-3 sm:grid-cols-3">{['Total citations','H-index trajectory','Citation momentum'].map((label)=><div key={label} className="house-panel-card rounded-md p-3"><p className="house-h2">{label}</p><p className="text-2xl font-semibold mt-1">124</p><div className="mt-3 h-24 rounded border border-dashed border-border bg-[hsl(var(--tone-neutral-100))]" /></div>)}</div></StoryFrame> }
