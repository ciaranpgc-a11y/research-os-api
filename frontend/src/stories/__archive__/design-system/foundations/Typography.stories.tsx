import type { Meta, StoryObj } from '@storybook/react-vite'

import { houseTypography } from '@/lib/house-style'

type TypeSample = {
  label: string
  className: string
  token: string
  sample: string
}

const TYPE_SAMPLES: TypeSample[] = [
  {
    label: 'Display',
    className: 'text-display',
    token: '--text-display-size / --text-display-line',
    sample: 'Research OS Dashboard',
  },
  {
    label: 'Body',
    className: 'text-body',
    token: '--text-body-size / --text-body-line',
    sample: 'Narrative copy for key page content and descriptions.',
  },
  {
    label: 'Label',
    className: 'text-label',
    token: '--text-label-size / --text-label-line',
    sample: 'Section label',
  },
  {
    label: 'Caption',
    className: 'text-caption',
    token: '--text-caption-size / --text-caption-line',
    sample: 'Caption and helper text',
  },
  {
    label: 'House H1',
    className: houseTypography.h1,
    token: 'house-h1',
    sample: 'PUBLICATION OVERVIEW',
  },
  {
    label: 'House H2',
    className: houseTypography.h2,
    token: 'house-h2',
    sample: 'Tile heading',
  },
  {
    label: 'House Text',
    className: houseTypography.text,
    token: 'house-text',
    sample: 'House text style for core paragraphs.',
  },
]

const meta = {
  title: 'Design System/Foundations/Typography',
  parameters: {
    layout: 'padded',
  },
} satisfies Meta

export default meta

type Story = StoryObj

export const Scale: Story = {
  render: () => (
    <div className="space-y-3">
      {TYPE_SAMPLES.map((item) => (
        <div key={item.label} className="rounded-md border border-border bg-card p-4">
          <div className="mb-1 text-caption font-semibold uppercase tracking-[0.08em] text-muted-foreground">
            {item.label}
          </div>
          <div className={item.className}>{item.sample}</div>
          <div className="mt-2 text-caption text-muted-foreground">{item.token}</div>
        </div>
      ))}
    </div>
  ),
}
