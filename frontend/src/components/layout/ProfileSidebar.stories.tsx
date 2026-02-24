import { useEffect, type ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import type { Meta, StoryObj } from '@storybook/react'

import { AccountNavigator } from './account-navigator'

function RouteSetter({ path, children }: { path: string; children: ReactNode }) {
  const navigate = useNavigate()

  useEffect(() => {
    navigate(path, { replace: true })
  }, [navigate, path])

  return <>{children}</>
}

function withPath(path: string, widthClass = 'w-sz-280') {
  return (Story: () => JSX.Element) => (
    <RouteSetter path={path}>
      <div className={`h-sz-520 ${widthClass} overflow-hidden rounded-md border border-border bg-card`}>
        <Story />
      </div>
    </RouteSetter>
  )
}

const longLabelLinks = [
  { label: 'Profile home and account overview', path: '/profile', end: true },
  { label: 'Integrations and external connectors', path: '/profile/integrations' },
  { label: 'Publications and citation analytics dashboard', path: '/profile/publications' },
  { label: 'Collaboration graph and contributor network', path: '/account/collaboration' },
  { label: 'Impact and longitudinal outcomes', path: '/impact' },
  { label: 'Settings and preferences for profile', path: '/settings' },
]

const meta: Meta<typeof AccountNavigator> = {
  title: 'Navigation/ProfileSidebar',
  component: AccountNavigator,
  parameters: {
    layout: 'centered',
  },
}

export default meta

type Story = StoryObj<typeof AccountNavigator>

export const Default: Story = {
  decorators: [withPath('/profile')],
  args: {},
}

export const PublicationsActive: Story = {
  decorators: [withPath('/profile/publications')],
  args: {},
}

export const LongLabels: Story = {
  decorators: [withPath('/profile/publications')],
  args: {
    links: longLabelLinks,
  },
}

export const NarrowViewport: Story = {
  decorators: [withPath('/profile/publications', 'w-sz-220')],
  args: {},
}
