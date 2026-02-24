import { useEffect, type ReactNode } from 'react'
import type { Meta, StoryObj } from '@storybook/react'

import { TopBar } from './top-bar'

const AUTH_TOKEN_STORAGE_KEY = 'aawe-impact-session-token'

function SessionScope({ children }: { children: ReactNode }) {
  useEffect(() => {
    window.localStorage.setItem(AUTH_TOKEN_STORAGE_KEY, 'storybook-session-token')
    window.sessionStorage.setItem(AUTH_TOKEN_STORAGE_KEY, 'storybook-session-token')
    return () => {
      window.localStorage.removeItem(AUTH_TOKEN_STORAGE_KEY)
      window.sessionStorage.removeItem(AUTH_TOKEN_STORAGE_KEY)
    }
  }, [])

  return <div className="min-h-screen bg-background"><div className="mx-auto w-full"><div>{children}</div></div></div>
}

const meta: Meta<typeof TopBar> = {
  title: 'Navigation/TopBar',
  component: TopBar,
  decorators: [
    (Story) => (
      <SessionScope>
        <Story />
      </SessionScope>
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

export const AccountScope: Story = {
  args: {
    scope: 'account',
  },
}

export const WorkspaceScope: Story = {
  args: {
    scope: 'workspace',
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
