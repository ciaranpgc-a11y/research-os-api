import { useEffect, useState } from 'react'
import type { Meta, StoryObj } from '@storybook/react'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom'

import { useWorkspaceStore, type WorkspaceRecord } from '@/store/use-workspace-store'

import { WorkspacesPage } from './workspaces-page'

const AUTH_TOKEN_STORAGE_KEY = 'aawe-impact-session-token'
const WORKSPACES_STORAGE_KEY = 'aawe-workspaces'
const ACTIVE_WORKSPACE_STORAGE_KEY = 'aawe-active-workspace-id'

type WorkspacesPageFixture = {
  workspaces: WorkspaceRecord[]
  activeWorkspaceId: string | null
}

type WorkspacesPagePreviewProps = {
  fixture: WorkspacesPageFixture
}

const defaultFixture: WorkspacesPageFixture = {
  workspaces: [
    {
      id: 'hf-registry',
      name: 'HF Registry Manuscript',
      version: '0.4',
      health: 'amber',
      updatedAt: '2026-02-25T15:57:00Z',
      pinned: true,
      archived: false,
    },
  ],
  activeWorkspaceId: 'hf-registry',
}

const mixedPortfolioFixture: WorkspacesPageFixture = {
  workspaces: [
    {
      id: 'hf-registry',
      name: 'HF Registry Manuscript',
      version: '0.4',
      health: 'amber',
      updatedAt: '2026-02-25T15:57:00Z',
      pinned: true,
      archived: false,
    },
    {
      id: 'af-screening',
      name: 'AF Screening Cohort',
      version: '0.9',
      health: 'green',
      updatedAt: '2026-02-24T09:18:00Z',
      pinned: false,
      archived: false,
    },
    {
      id: 'renal-risk-qc',
      name: 'Renal Risk Model Validation',
      version: '1.2',
      health: 'red',
      updatedAt: '2026-02-22T13:41:00Z',
      pinned: true,
      archived: false,
    },
    {
      id: 'legacy-trial-archive',
      name: 'Legacy Trial Data Archive',
      version: '2.7',
      health: 'green',
      updatedAt: '2026-01-06T08:12:00Z',
      pinned: false,
      archived: true,
    },
  ],
  activeWorkspaceId: 'hf-registry',
}

const emptyFixture: WorkspacesPageFixture = {
  workspaces: [],
  activeWorkspaceId: null,
}

function RouteEcho() {
  const location = useLocation()

  return (
    <div className="border-t border-border px-4 py-2 text-xs text-muted-foreground">
      Current route: {location.pathname}
    </div>
  )
}

function WorkspacesPagePreview({ fixture }: WorkspacesPagePreviewProps) {
  const [ready, setReady] = useState(false)

  useEffect(() => {
    const previousSessionToken = window.sessionStorage.getItem(AUTH_TOKEN_STORAGE_KEY)
    const previousLocalToken = window.localStorage.getItem(AUTH_TOKEN_STORAGE_KEY)
    const previousWorkspaces = window.localStorage.getItem(WORKSPACES_STORAGE_KEY)
    const previousActiveWorkspaceId = window.localStorage.getItem(ACTIVE_WORKSPACE_STORAGE_KEY)
    const previousState = useWorkspaceStore.getState()

    window.sessionStorage.setItem(AUTH_TOKEN_STORAGE_KEY, 'storybook-session-token')
    window.localStorage.setItem(AUTH_TOKEN_STORAGE_KEY, 'storybook-session-token')
    window.localStorage.setItem(WORKSPACES_STORAGE_KEY, JSON.stringify(fixture.workspaces))
    if (fixture.activeWorkspaceId) {
      window.localStorage.setItem(ACTIVE_WORKSPACE_STORAGE_KEY, fixture.activeWorkspaceId)
    } else {
      window.localStorage.removeItem(ACTIVE_WORKSPACE_STORAGE_KEY)
    }

    useWorkspaceStore.setState({
      workspaces: fixture.workspaces,
      activeWorkspaceId: fixture.activeWorkspaceId,
    })
    setReady(true)

    return () => {
      if (previousSessionToken === null) {
        window.sessionStorage.removeItem(AUTH_TOKEN_STORAGE_KEY)
      } else {
        window.sessionStorage.setItem(AUTH_TOKEN_STORAGE_KEY, previousSessionToken)
      }

      if (previousLocalToken === null) {
        window.localStorage.removeItem(AUTH_TOKEN_STORAGE_KEY)
      } else {
        window.localStorage.setItem(AUTH_TOKEN_STORAGE_KEY, previousLocalToken)
      }

      if (previousWorkspaces === null) {
        window.localStorage.removeItem(WORKSPACES_STORAGE_KEY)
      } else {
        window.localStorage.setItem(WORKSPACES_STORAGE_KEY, previousWorkspaces)
      }

      if (previousActiveWorkspaceId === null) {
        window.localStorage.removeItem(ACTIVE_WORKSPACE_STORAGE_KEY)
      } else {
        window.localStorage.setItem(ACTIVE_WORKSPACE_STORAGE_KEY, previousActiveWorkspaceId)
      }

      useWorkspaceStore.setState({
        workspaces: previousState.workspaces,
        activeWorkspaceId: previousState.activeWorkspaceId,
      })
    }
  }, [fixture])

  if (!ready) {
    return <div className="min-h-screen bg-background" />
  }

  return (
    <div className="min-h-screen min-w-[1200px] bg-background">
      <MemoryRouter initialEntries={['/workspaces']}>
        <Routes>
          <Route path="/workspaces" element={<WorkspacesPage />} />
          <Route path="/w/:workspaceId/overview" element={<RouteEcho />} />
        </Routes>
      </MemoryRouter>
    </div>
  )
}

const meta: Meta<typeof WorkspacesPagePreview> = {
  title: 'Pages/WorkspacesPage',
  component: WorkspacesPagePreview,
  parameters: {
    layout: 'fullscreen',
    withRouter: false,
    viewport: {
      defaultViewport: 'desktop',
    },
  },
  args: {
    fixture: defaultFixture,
  },
}

export default meta

type Story = StoryObj<typeof WorkspacesPagePreview>

export const Default: Story = {}

export const MixedPortfolio: Story = {
  args: {
    fixture: mixedPortfolioFixture,
  },
}

export const EmptyState: Story = {
  args: {
    fixture: emptyFixture,
  },
}

export const DarkMode: Story = {
  args: {
    fixture: mixedPortfolioFixture,
  },
  globals: {
    theme: 'dark',
  },
}
