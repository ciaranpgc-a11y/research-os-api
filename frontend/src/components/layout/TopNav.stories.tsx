import { useEffect, type ReactNode } from 'react'
import type { Meta, StoryObj } from '@storybook/react'

import { TopBar } from './top-bar'

const AUTH_TOKEN_STORAGE_KEY = 'aawe-impact-session-token'

function SessionTokenDecorator({ children }: { children: ReactNode }) {
  useEffect(() => {
    window.localStorage.setItem(AUTH_TOKEN_STORAGE_KEY, 'storybook-session-token')
    window.sessionStorage.setItem(AUTH_TOKEN_STORAGE_KEY, 'storybook-session-token')
    return () => {
      window.localStorage.removeItem(AUTH_TOKEN_STORAGE_KEY)
      window.sessionStorage.removeItem(AUTH_TOKEN_STORAGE_KEY)
    }
  }, [])

  return (
    <div className="min-h-screen bg-background p-3 md:p-4">
      {children}
    </div>
  )
}

const meta: Meta<typeof TopBar> = {
  title: 'Navigation/TopNav',
  component: TopBar,
  decorators: [
    (Story) => (
      <SessionTokenDecorator>
        <Story />
      </SessionTokenDecorator>
    ),
  ],
  args: {
    onOpenLeftNav: () => undefined,
    showLeftNavButton: true,
  },
  parameters: {
    layout: 'fullscreen',
  },
}

export default meta

type Story = StoryObj<typeof TopBar>

export const Default: Story = {
  args: {
    scope: 'account',
  },
}

export const WorkspaceActive: Story = {
  args: {
    scope: 'workspace',
  },
}

export const LongLabels: Story = {
  args: {
    scope: 'account',
    workspaceLabel: 'Workspace registry',
    profileLabel: 'Profile and settings center',
    brandTagline: 'Autonomous Academic Writing Engine and Research Operations',
  },
}

export const NarrowViewport: Story = {
  args: {
    scope: 'account',
  },
  parameters: {
    viewport: {
      defaultViewport: 'mobile1',
    },
  },
}
