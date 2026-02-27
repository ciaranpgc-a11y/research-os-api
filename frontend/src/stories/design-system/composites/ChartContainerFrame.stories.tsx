import type { Meta, StoryObj } from '@storybook/react'
import { StoryFrame } from '../_helpers/StoryFrame'

const meta = { title: 'Design System/Composites/Chart Container Frame', parameters: { layout: 'fullscreen', chromatic: { disableSnapshot: true } } } satisfies Meta
export default meta
type Story = StoryObj

export const WithWithoutToggles: Story = { render: () => <StoryFrame title="Chart container frame"><div className="grid gap-3 sm:grid-cols-2"><div className="house-chart-frame rounded-md p-3"><div className="mb-2 flex justify-end"><div className="house-toggle-track"><button className="house-toggle-button data-[state=active]">1y</button></div></div><div className="h-28 rounded border border-dashed border-border" /></div><div className="house-chart-frame rounded-md p-3"><div className="h-36 rounded border border-dashed border-border" /></div></div></StoryFrame> }
