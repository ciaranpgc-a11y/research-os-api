import { useEffect, useState } from 'react'
import type { Meta, StoryObj } from '@storybook/react'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom'

import {
  useWorkspaceStore,
  type WorkspaceAuthorRequest,
  type WorkspaceInvitationSent,
  type WorkspaceRecord,
} from '@/store/use-workspace-store'

import { WorkspacesPage } from './workspaces-page'

const AUTH_TOKEN_STORAGE_KEY = 'aawe-impact-session-token'
const WORKSPACES_STORAGE_KEY = 'aawe-workspaces'
const ACTIVE_WORKSPACE_STORAGE_KEY = 'aawe-active-workspace-id'
const AUTHOR_REQUESTS_STORAGE_KEY = 'aawe-workspace-author-requests'
const INVITATIONS_SENT_STORAGE_KEY = 'aawe-workspace-invitations-sent'
const INTEGRATIONS_USER_CACHE_KEY = 'aawe_integrations_user_cache'
const PERSONAL_DETAILS_STORAGE_PREFIX = 'aawe_profile_personal_details:'
const STORYBOOK_USER_ID = 'storybook-user-1'

type WorkspacesPageFixture = {
  workspaces: WorkspaceRecord[]
  activeWorkspaceId: string | null
  authorRequests: WorkspaceAuthorRequest[]
  invitationsSent: WorkspaceInvitationSent[]
}

type WorkspacesPagePreviewProps = {
  fixture: WorkspacesPageFixture
}

const defaultFixture: WorkspacesPageFixture = {
  workspaces: [
    {
      id: 'hf-registry',
      name: 'HF Registry Manuscript',
      ownerName: 'Ciaran Clarke',
      collaborators: ['A. Patel'],
      version: '0.4',
      health: 'amber',
      updatedAt: '2026-02-25T15:57:00Z',
      pinned: true,
      archived: false,
    },
  ],
  activeWorkspaceId: 'hf-registry',
  authorRequests: [
    {
      id: 'author-req-01',
      workspaceId: 'peds-echo-study',
      workspaceName: 'Pediatric Echo Outcomes',
      authorName: 'Maya Singh',
      invitedAt: '2026-02-24T10:10:00Z',
    },
  ],
  invitationsSent: [
    {
      id: 'invite-sent-01',
      workspaceId: 'hf-registry',
      workspaceName: 'HF Registry Manuscript',
      inviteeName: 'Devon Li',
      invitedAt: '2026-02-25T11:25:00Z',
      status: 'pending',
    },
  ],
}

const mixedPortfolioFixture: WorkspacesPageFixture = {
  workspaces: [
    {
      id: 'hf-registry',
      name: 'HF Registry Manuscript',
      ownerName: 'Ciaran Clarke',
      collaborators: ['A. Patel'],
      removedCollaborators: [],
      version: '0.4',
      health: 'amber',
      updatedAt: '2026-02-25T15:57:00Z',
      pinned: true,
      archived: false,
    },
    {
      id: 'af-screening',
      name: 'AF Screening Cohort',
      ownerName: 'Ciaran Clarke',
      collaborators: ['S. Roy', 'L. Santos'],
      removedCollaborators: ['L. Santos'],
      version: '0.9',
      health: 'green',
      updatedAt: '2026-02-24T09:18:00Z',
      pinned: false,
      archived: false,
    },
    {
      id: 'renal-risk-qc',
      name: 'Renal Risk Model Validation',
      ownerName: 'Ciaran Clarke',
      collaborators: [],
      removedCollaborators: [],
      version: '1.2',
      health: 'red',
      updatedAt: '2026-02-22T13:41:00Z',
      pinned: true,
      archived: false,
    },
    {
      id: 'legacy-trial-archive',
      name: 'Legacy Trial Data Archive',
      ownerName: 'Ciaran Clarke',
      collaborators: ['M. Evans'],
      removedCollaborators: [],
      version: '2.7',
      health: 'green',
      updatedAt: '2026-01-06T08:12:00Z',
      pinned: false,
      archived: true,
    },
  ],
  activeWorkspaceId: 'hf-registry',
  authorRequests: [
    {
      id: 'author-req-02',
      workspaceId: 'stroke-ct-outcomes',
      workspaceName: 'Stroke CT Outcomes',
      authorName: 'Aisha Rahman',
      invitedAt: '2026-02-23T09:05:00Z',
    },
    {
      id: 'author-req-03',
      workspaceId: 'oncology-cardiac-risk',
      workspaceName: 'Oncology Cardiac Risk Registry',
      authorName: 'Tom Price',
      invitedAt: '2026-02-22T16:42:00Z',
    },
  ],
  invitationsSent: [
    {
      id: 'invite-sent-02',
      workspaceId: 'af-screening',
      workspaceName: 'AF Screening Cohort',
      inviteeName: 'Nina Brooks',
      invitedAt: '2026-02-25T08:14:00Z',
      status: 'pending',
    },
    {
      id: 'invite-sent-03',
      workspaceId: 'hf-registry',
      workspaceName: 'HF Registry Manuscript',
      inviteeName: 'Devon Li',
      invitedAt: '2026-02-24T14:40:00Z',
      status: 'accepted',
    },
  ],
}

const emptyFixture: WorkspacesPageFixture = {
  workspaces: [],
  activeWorkspaceId: null,
  authorRequests: [],
  invitationsSent: [],
}

const collaboratorStateFixture: WorkspacesPageFixture = {
  workspaces: [
    {
      id: 'hf-registry',
      name: 'HF Registry Manuscript',
      ownerName: 'Ciaran Clarke',
      collaborators: ['A. Patel', 'M. Evans', 'L. Santos'],
      removedCollaborators: ['M. Evans'],
      version: '0.8',
      health: 'amber',
      updatedAt: '2026-02-25T18:20:00Z',
      pinned: true,
      archived: false,
    },
  ],
  activeWorkspaceId: 'hf-registry',
  authorRequests: [],
  invitationsSent: [],
}

const collaboratorReadOnlyFixture: WorkspacesPageFixture = {
  workspaces: [
    {
      id: 'external-study',
      name: 'External Study Draft',
      ownerName: 'Maya Singh',
      collaborators: ['Ciaran Clarke', 'A. Patel'],
      removedCollaborators: ['A. Patel'],
      version: '0.6',
      health: 'amber',
      updatedAt: '2026-02-25T12:05:00Z',
      pinned: false,
      archived: false,
    },
  ],
  activeWorkspaceId: 'external-study',
  authorRequests: [],
  invitationsSent: [],
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
    const previousAuthorRequests = window.localStorage.getItem(AUTHOR_REQUESTS_STORAGE_KEY)
    const previousInvitationsSent = window.localStorage.getItem(INVITATIONS_SENT_STORAGE_KEY)
    const previousCachedUser = window.localStorage.getItem(INTEGRATIONS_USER_CACHE_KEY)
    const personalDetailsStorageKey = `${PERSONAL_DETAILS_STORAGE_PREFIX}${STORYBOOK_USER_ID}`
    const previousPersonalDetails = window.localStorage.getItem(personalDetailsStorageKey)
    const previousState = useWorkspaceStore.getState()

    window.sessionStorage.setItem(AUTH_TOKEN_STORAGE_KEY, 'storybook-session-token')
    window.localStorage.setItem(AUTH_TOKEN_STORAGE_KEY, 'storybook-session-token')
    window.localStorage.setItem(WORKSPACES_STORAGE_KEY, JSON.stringify(fixture.workspaces))
    window.localStorage.setItem(AUTHOR_REQUESTS_STORAGE_KEY, JSON.stringify(fixture.authorRequests))
    window.localStorage.setItem(INVITATIONS_SENT_STORAGE_KEY, JSON.stringify(fixture.invitationsSent))
    window.localStorage.setItem(INTEGRATIONS_USER_CACHE_KEY, JSON.stringify({ id: STORYBOOK_USER_ID }))
    window.localStorage.setItem(
      personalDetailsStorageKey,
      JSON.stringify({ firstName: 'Ciaran', lastName: 'Clarke' }),
    )
    if (fixture.activeWorkspaceId) {
      window.localStorage.setItem(ACTIVE_WORKSPACE_STORAGE_KEY, fixture.activeWorkspaceId)
    } else {
      window.localStorage.removeItem(ACTIVE_WORKSPACE_STORAGE_KEY)
    }

    useWorkspaceStore.setState({
      workspaces: fixture.workspaces,
      activeWorkspaceId: fixture.activeWorkspaceId,
      authorRequests: fixture.authorRequests,
      invitationsSent: fixture.invitationsSent,
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
      if (previousAuthorRequests === null) {
        window.localStorage.removeItem(AUTHOR_REQUESTS_STORAGE_KEY)
      } else {
        window.localStorage.setItem(AUTHOR_REQUESTS_STORAGE_KEY, previousAuthorRequests)
      }
      if (previousInvitationsSent === null) {
        window.localStorage.removeItem(INVITATIONS_SENT_STORAGE_KEY)
      } else {
        window.localStorage.setItem(INVITATIONS_SENT_STORAGE_KEY, previousInvitationsSent)
      }
      if (previousCachedUser === null) {
        window.localStorage.removeItem(INTEGRATIONS_USER_CACHE_KEY)
      } else {
        window.localStorage.setItem(INTEGRATIONS_USER_CACHE_KEY, previousCachedUser)
      }
      if (previousPersonalDetails === null) {
        window.localStorage.removeItem(personalDetailsStorageKey)
      } else {
        window.localStorage.setItem(personalDetailsStorageKey, previousPersonalDetails)
      }

      useWorkspaceStore.setState({
        workspaces: previousState.workspaces,
        activeWorkspaceId: previousState.activeWorkspaceId,
        authorRequests: previousState.authorRequests,
        invitationsSent: previousState.invitationsSent,
      })
    }
  }, [fixture])

  if (!ready) {
    return <div className="min-h-screen bg-background" />
  }

  return (
    <div className="min-h-screen min-w-sz-760 bg-background">
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

export const CollaboratorBanners: Story = {
  args: {
    fixture: collaboratorStateFixture,
  },
}

export const CollaboratorBannersReadOnly: Story = {
  args: {
    fixture: collaboratorReadOnlyFixture,
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
