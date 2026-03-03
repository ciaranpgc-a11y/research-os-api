import type { Meta, StoryObj } from '@storybook/react-vite'
import { StoryFrame } from '../_helpers/StoryFrame'
import { houseNavigation } from '@/lib/house-style'
import { cn } from '@/lib/utils'

const meta = { title: 'Design System/Composites/LeftNav', parameters: { layout: 'fullscreen', chromatic: { disableSnapshot: true } } } satisfies Meta
export default meta
type Story = StoryObj

function Nav({ title, tone }: { title: string; tone: string }) {
  return <div className="w-[18rem] rounded-md border border-border bg-card p-3"><p className={houseNavigation.sectionLabel}>{title}</p><div className={cn('mt-2', houseNavigation.list)}><button className={cn(houseNavigation.item,tone,houseNavigation.itemActive)}><span className={houseNavigation.itemLabel}>Overview</span><span className={houseNavigation.itemCount}>2</span></button><button className={cn(houseNavigation.item,tone)}><span className={houseNavigation.itemLabel}>Details</span></button><button className={cn(houseNavigation.item,tone)}><span className={houseNavigation.itemLabel}>Logs</span><span className="h-2 w-2 rounded-full bg-[hsl(var(--tone-positive-500))]" /></button></div></div>
}

export const Variants: Story = { render: () => <StoryFrame title="Left navigation variants"><div className="flex flex-wrap gap-3"><Nav title="Profile" tone={houseNavigation.itemOverview} /><Nav title="Workspaces home" tone={houseNavigation.itemWorkspace} /><Nav title="Workspaces detail" tone={houseNavigation.itemData} /></div></StoryFrame> }
