import type { Meta, StoryObj } from '@storybook/react'

import { houseNavigation } from '@/lib/house-style'
import { cn } from '@/lib/utils'

type NavItemPreview = {
  label: string
  toneClass: string
  active?: boolean
  count?: number
}

const NAV_ITEMS: NavItemPreview[] = [
  { label: 'Overview', toneClass: houseNavigation.itemOverview, active: true },
  { label: 'Publications', toneClass: houseNavigation.itemResearch, count: 3 },
  { label: 'Settings', toneClass: houseNavigation.itemAccount },
  { label: 'Data', toneClass: houseNavigation.itemData },
  { label: 'Manuscript', toneClass: houseNavigation.itemManuscript },
  { label: 'Governance', toneClass: houseNavigation.itemGovernance, count: 1 },
]

const meta = {
  title: 'Design System/Primitives/LeftNavStates',
  parameters: {
    layout: 'padded',
  },
} satisfies Meta

export default meta

type Story = StoryObj

export const States: Story = {
  render: () => (
    <div className="w-[20rem] rounded-md border border-border bg-card p-3">
      <p className={houseNavigation.sectionLabel}>Navigation</p>
      <div className={cn('mt-2', houseNavigation.list)}>
        {NAV_ITEMS.map((item) => (
          <button
            key={item.label}
            type="button"
            className={cn(
              houseNavigation.item,
              item.toneClass,
              item.active && houseNavigation.itemActive,
            )}
          >
            <span className={houseNavigation.itemLabel}>{item.label}</span>
            {typeof item.count === 'number' ? (
              <span className={houseNavigation.itemCount}>{item.count}</span>
            ) : null}
          </button>
        ))}
      </div>
    </div>
  ),
}
