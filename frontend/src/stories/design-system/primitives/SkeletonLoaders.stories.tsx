import type { Meta, StoryObj } from '@storybook/react'
import { StoryFrame } from '../_helpers/StoryFrame'

const meta = { title: 'Design System/Primitives/Skeleton Loaders', parameters: { layout: 'fullscreen' } } satisfies Meta
export default meta
type Story = StoryObj

export const States: Story = { render: () => <StoryFrame title="Skeleton loaders"><div className="space-y-2"><div className="h-4 w-1/3 animate-pulse rounded bg-[hsl(var(--tone-neutral-200))]" /><div className="h-20 animate-pulse rounded bg-[hsl(var(--tone-neutral-200))]" /><div className="h-4 w-2/3 animate-pulse rounded bg-[hsl(var(--tone-neutral-200))]" /></div></StoryFrame> }
