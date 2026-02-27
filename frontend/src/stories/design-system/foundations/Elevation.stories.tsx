import { useState } from 'react'
import type { Meta, StoryObj } from '@storybook/react'
import { StoryFrame } from '../_helpers/StoryFrame'

const ELEVATIONS = [
  { name: 'Elevation 0', token: '--elevation-none' },
  { name: 'Elevation 1', token: '--elevation-xs' },
  { name: 'Elevation 2', token: '--elevation-sm' },
  { name: 'Elevation 3', token: '--elevation-md' },
  { name: 'Elevation 4', token: '--elevation-lg' },
]

function ElevationCards() {
  const [hovered, setHovered] = useState(null as number | null)

  return (
    <div data-ui="elevation-grid" className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
      {ELEVATIONS.map((level, idx) => {
        const next = Math.min(idx + 1, ELEVATIONS.length - 1)
        const activeIndex = hovered === idx ? next : idx
        return (
          <div
            data-ui="elevation-card"
            key={level.name}
            onMouseEnter={() => setHovered(idx)}
            onMouseLeave={() => setHovered(null)}
            className="rounded-md border border-border bg-card p-4 transition-shadow duration-220 ease-out"
            style={{ boxShadow: `var(${ELEVATIONS[activeIndex].token})` }}
          >
            <p data-ui="elevation-name" className="text-label font-semibold">{level.name}</p>
            <p data-ui="elevation-token" className="text-caption text-muted-foreground">{level.token}</p>
            <p data-ui="elevation-hover" className="mt-2 text-caption text-muted-foreground">
              Hover state: {ELEVATIONS[next].token}
            </p>
          </div>
        )
      })}
    </div>
  )
}

const meta = {
  title: 'Design System/Foundations/Elevation',
  parameters: { layout: 'fullscreen' },
} satisfies Meta

export default meta
type Story = StoryObj

export const Scale: Story = {
  render: () => (
    <StoryFrame title="Elevation scale" subtitle="Hover any card to preview the next elevation level">
      <ElevationCards />
    </StoryFrame>
  ),
}
