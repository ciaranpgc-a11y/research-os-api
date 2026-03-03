import type { Meta, StoryObj } from '@storybook/react-vite'
import { StoryFrame } from '../_helpers/StoryFrame'

const meta = { title: 'Design System/Composites/Data Library Drilldown Panel', parameters: { layout: 'fullscreen', chromatic: { disableSnapshot: true } } } satisfies Meta
export default meta
type Story = StoryObj

export const Pattern: Story = { render: () => <StoryFrame title="Data library drilldown panel"><div className="rounded-md border border-border bg-card p-3"><p className="house-section-title">4d_flow_primary_dataset.xlsx</p><div className="mt-3 space-y-2 text-sm"><div className="flex justify-between"><span>Owner</span><span>Ciaran Clarke</span></div><div className="flex justify-between"><span>Access</span><span>Full-access</span></div><div className="flex justify-between"><span>Linked workspace</span><span>HF Registry Manuscript</span></div></div></div></StoryFrame> }
