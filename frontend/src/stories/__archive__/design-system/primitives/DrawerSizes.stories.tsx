import type { Meta, StoryObj } from '@storybook/react-vite'

import { cn } from '@/lib/utils'

type DrawerSize = {
  name: string
  widthClass: string
  description: string
}

const DRAWER_SIZES: DrawerSize[] = [
  { name: 'Small', widthClass: 'w-[18rem]', description: 'Compact utility panels' },
  { name: 'Medium', widthClass: 'w-[24rem]', description: 'Default detail panels' },
  { name: 'Large', widthClass: 'w-[30rem]', description: 'Dense drilldown panels' },
]

function DrawerPreview({ item }: { item: DrawerSize }) {
  return (
    <div className={cn('rounded-md border border-border bg-card p-4 shadow-sm', item.widthClass)}>
      <div className="text-label font-semibold text-foreground">{item.name}</div>
      <div className="mt-1 text-caption text-muted-foreground">{item.description}</div>
      <div className="mt-3 h-20 rounded-sm border border-dashed border-border bg-[hsl(var(--tone-neutral-100)/0.6)]" />
    </div>
  )
}

const meta = {
  title: 'Design System/Primitives/DrawerSizes',
  parameters: {
    layout: 'padded',
  },
} satisfies Meta

export default meta

type Story = StoryObj

export const SizeScale: Story = {
  render: () => (
    <div className="flex flex-col gap-4">
      {DRAWER_SIZES.map((item) => (
        <DrawerPreview key={item.name} item={item} />
      ))}
    </div>
  ),
}
