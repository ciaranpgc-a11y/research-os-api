import type { Meta, StoryObj } from '@storybook/react'
import { StoryFrame } from '../_helpers/StoryFrame'

const meta = { title: 'Design System/Composites/Drilldown Header Strip', parameters: { layout: 'fullscreen', chromatic: { disableSnapshot: true } } } satisfies Meta
export default meta
type Story = StoryObj

export const Pattern: Story = { render: () => <StoryFrame title="Drilldown header strip"><div className="house-left-border house-left-border-publications rounded-md border border-border bg-card p-3"><p className="house-section-title">Publication drilldown</p><p className="house-field-helper">Detailed metrics and linked evidence</p></div></StoryFrame> }
