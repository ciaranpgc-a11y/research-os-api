import type { Meta, StoryObj } from '@storybook/react-vite'
import { StoryFrame } from '../_helpers/StoryFrame'

const meta = { title: 'Design System/Primitives/Progress Bar', parameters: { layout: 'fullscreen' } } satisfies Meta
export default meta
type Story = StoryObj

export const States: Story = { render: () => <StoryFrame title="Progress bar"><div className="max-w-xl space-y-3"><div className="h-2 overflow-hidden rounded-full bg-[hsl(var(--tone-neutral-200))]"><div className="h-full w-[35%] bg-[hsl(var(--tone-accent-600))]" /></div><div className="h-2 overflow-hidden rounded-full bg-[hsl(var(--tone-neutral-200))]"><div className="h-full w-[74%] bg-[hsl(var(--tone-positive-600))]" /></div></div></StoryFrame> }
