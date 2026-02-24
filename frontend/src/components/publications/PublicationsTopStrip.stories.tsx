import type { Meta, StoryObj } from '@storybook/react'

import {
  publicationsMetricsEmptyFixture,
  publicationsMetricsErrorFixture,
  publicationsMetricsHappyFixture,
} from '@/mocks/fixtures/publications-metrics'

import { PublicationsTopStrip } from './PublicationsTopStrip'

const meta: Meta<typeof PublicationsTopStrip> = {
  title: 'Publications/PublicationsTopStrip',
  component: PublicationsTopStrip,
}

export default meta

type Story = StoryObj<typeof PublicationsTopStrip>

export const CitationMomentumTile: Story = {
  args: {
    metrics: publicationsMetricsHappyFixture,
    loading: false,
    token: null,
  },
}

export const CitationMomentumEmpty: Story = {
  args: {
    metrics: publicationsMetricsEmptyFixture,
    loading: false,
    token: null,
  },
}

export const CitationMomentumError: Story = {
  args: {
    metrics: publicationsMetricsErrorFixture,
    loading: false,
    token: null,
  },
}
