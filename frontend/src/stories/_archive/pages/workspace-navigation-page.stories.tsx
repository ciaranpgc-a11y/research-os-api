import { useEffect, useState } from 'react'
import type { Meta, StoryObj } from '@storybook/react'
import { MemoryRouter, useLocation } from 'react-router-dom'

import { AppRouter } from '@/AppRouter'
import { useWorkspaceInboxStore } from '@/store/use-workspace-inbox-store'
import type {
  WorkspaceAuthorRequest,
  WorkspaceInvitationSent,
  WorkspaceRecord,
} from '@/store/use-workspace-store'
import { useWorkspaceStore } from '@/store/use-workspace-store'

const AUTH_TOKEN_STORAGE_KEY = 'aawe-impact-session-token'
const WORKSPACES_STORAGE_KEY = 'aawe-workspaces'
const ACTIVE_WORKSPACE_STORAGE_KEY = 'aawe-active-workspace-id'
const AUTHOR_REQUESTS_STORAGE_KEY = 'aawe-workspace-author-requests'
const INVITATIONS_SENT_STORAGE_KEY = 'aawe-workspace-invitations-sent'
const INBOX_MESSAGES_STORAGE_KEY = 'aawe-workspace-inbox-messages-v1'
const INBOX_READS_STORAGE_KEY = 'aawe-workspace-inbox-reads-v1'
const INTEGRATIONS_USER_CACHE_KEY = 'aawe_integrations_user_cache'
const PERSONAL_DETAILS_STORAGE_PREFIX = 'aawe_profile_personal_details:'
const STORYBOOK_USER_ID = 'storybook-workspace-nav-user-1'

type WorkspaceInboxFixtureMessage = {
  workspaceId: string
  senderName: string
  body: string
}

type WorkspaceInboxFixtureRead = {
  workspaceId: string
  readerName: string
  readAt: string
}

type WorkspaceNavigationFixture = {
  workspaces: WorkspaceRecord[]
  activeWorkspaceId: string
  authorRequests: WorkspaceAuthorRequest[]
  invitationsSent: WorkspaceInvitationSent[]
  inboxMessages: WorkspaceInboxFixtureMessage[]
  inboxReads: WorkspaceInboxFixtureRead[]
  initialPath: string
}

type WorkspaceNavigationPreviewProps = {
  fixture: WorkspaceNavigationFixture
}

const populatedWorkspaceFixture: WorkspaceNavigationFixture = {
  workspaces: [
    {
      id: '4d-flow-rhc-paper',
      name: '4D flow RHC paper',
      ownerName: 'Ciaran Clarke',
      collaborators: ['J. Meyer', 'N. Brooks', 'I. Ahmed'],
      removedCollaborators: ['S. Wong'],
      pendingCollaborators: [],
      collaboratorRoles: {},
      pendingCollaboratorRoles: {},
      version: '1.1',
      health: 'amber',
      updatedAt: '2026-02-25T21:10:00Z',
      pinned: true,
      archived: false,
    },
    {
      id: 'af-screening-cohort',
      name: 'AF Screening Cohort',
      ownerName: 'Ciaran Clarke',
      collaborators: ['S. Roy', 'L. Santos'],
      removedCollaborators: [],
      pendingCollaborators: [],
      collaboratorRoles: {},
      pendingCollaboratorRoles: {},
      version: '0.8',
      health: 'green',
      updatedAt: '2026-02-24T10:22:00Z',
      pinned: false,
      archived: false,
    },
    {
      id: 'renal-risk-validation',
      name: 'Renal Risk Validation',
      ownerName: 'Maya Singh',
      collaborators: ['Ciaran Clarke', 'P. Green'],
      removedCollaborators: [],
      pendingCollaborators: [],
      collaboratorRoles: {},
      pendingCollaboratorRoles: {},
      version: '0.5',
      health: 'red',
      updatedAt: '2026-02-23T08:50:00Z',
      pinned: false,
      archived: false,
    },
  ],
  activeWorkspaceId: '4d-flow-rhc-paper',
  authorRequests: [
    {
      id: 'author-req-nav-01',
      workspaceId: 'stroke-ct-registry',
      workspaceName: 'Stroke CT Registry',
      authorName: 'Aisha Rahman',
      collaboratorRole: 'editor',
      invitedAt: '2026-02-24T14:10:00Z',
    },
  ],
  invitationsSent: [
    {
      id: 'invite-sent-nav-01',
      workspaceId: '4d-flow-rhc-paper',
      workspaceName: '4D flow RHC paper',
      inviteeName: 'Devon Li',
      role: 'editor',
      invitedAt: '2026-02-25T11:25:00Z',
      status: 'pending',
    },
  ],
  inboxMessages: [
    {
      workspaceId: '4d-flow-rhc-paper',
      senderName: 'J. Meyer',
      body: 'Figure 3 legend now matches the revised methods language.',
    },
    {
      workspaceId: '4d-flow-rhc-paper',
      senderName: 'Ciaran Clarke',
      body: 'Great. I will finalize the endpoint wording and open the submission checklist.',
    },
    {
      workspaceId: 'af-screening-cohort',
      senderName: 'S. Roy',
      body: 'Enrollment criteria are complete. Ready for owner review.',
    },
  ],
  inboxReads: [
    {
      workspaceId: '4d-flow-rhc-paper',
      readerName: 'Ciaran Clarke',
      readAt: '2026-02-25T18:00:00Z',
    },
  ],
  initialPath: '/w/4d-flow-rhc-paper/overview',
}

function RouteEcho() {
  const location = useLocation()

  return (
    <div data-house-role="route-echo" className="fixed bottom-0 left-0 right-0 z-50 border-t border-border bg-card/95 px-3 py-1 text-xs text-muted-foreground">
      Current route: {location.pathname}
    </div>
  )
}

function WorkspaceNavigationPreview({ fixture }: WorkspaceNavigationPreviewProps) {
  const [ready, setReady] = useState(false)

  useEffect(() => {
    let cancelled = false
    setReady(false)

    const previousSessionToken = window.sessionStorage.getItem(AUTH_TOKEN_STORAGE_KEY)
    const previousLocalToken = window.localStorage.getItem(AUTH_TOKEN_STORAGE_KEY)
    const previousWorkspaces = window.localStorage.getItem(WORKSPACES_STORAGE_KEY)
    const previousActiveWorkspaceId = window.localStorage.getItem(ACTIVE_WORKSPACE_STORAGE_KEY)
    const previousAuthorRequests = window.localStorage.getItem(AUTHOR_REQUESTS_STORAGE_KEY)
    const previousInvitationsSent = window.localStorage.getItem(INVITATIONS_SENT_STORAGE_KEY)
    const previousInboxMessages = window.localStorage.getItem(INBOX_MESSAGES_STORAGE_KEY)
    const previousInboxReads = window.localStorage.getItem(INBOX_READS_STORAGE_KEY)
    const previousCachedUser = window.localStorage.getItem(INTEGRATIONS_USER_CACHE_KEY)
    const personalDetailsStorageKey = `${PERSONAL_DETAILS_STORAGE_PREFIX}${STORYBOOK_USER_ID}`
    const previousPersonalDetails = window.localStorage.getItem(personalDetailsStorageKey)

    const previousWorkspaceState = useWorkspaceStore.getState()
    const previousInboxState = useWorkspaceInboxStore.getState()

    const bootstrap = async () => {
      window.sessionStorage.setItem(AUTH_TOKEN_STORAGE_KEY, 'storybook-session-token')
      window.localStorage.setItem(AUTH_TOKEN_STORAGE_KEY, 'storybook-session-token')
      window.localStorage.setItem(WORKSPACES_STORAGE_KEY, JSON.stringify(fixture.workspaces))
      window.localStorage.setItem(ACTIVE_WORKSPACE_STORAGE_KEY, fixture.activeWorkspaceId)
      window.localStorage.setItem(AUTHOR_REQUESTS_STORAGE_KEY, JSON.stringify(fixture.authorRequests))
      window.localStorage.setItem(INVITATIONS_SENT_STORAGE_KEY, JSON.stringify(fixture.invitationsSent))
      window.localStorage.removeItem(INBOX_MESSAGES_STORAGE_KEY)
      window.localStorage.removeItem(INBOX_READS_STORAGE_KEY)
      window.localStorage.setItem(INTEGRATIONS_USER_CACHE_KEY, JSON.stringify({ id: STORYBOOK_USER_ID }))
      window.localStorage.setItem(
        personalDetailsStorageKey,
        JSON.stringify({ firstName: 'Ciaran', lastName: 'Clarke' }),
      )

      useWorkspaceStore.setState({
        workspaces: fixture.workspaces,
        activeWorkspaceId: fixture.activeWorkspaceId,
        authorRequests: fixture.authorRequests,
        invitationsSent: fixture.invitationsSent,
      })

      useWorkspaceInboxStore.setState({ messages: [], reads: {} })
      for (const message of fixture.inboxMessages) {
        await useWorkspaceInboxStore.getState().sendWorkspaceMessage({
          workspaceId: message.workspaceId,
          senderName: message.senderName,
          body: message.body,
        })
      }
      for (const read of fixture.inboxReads) {
        useWorkspaceInboxStore.getState().markWorkspaceRead({
          workspaceId: read.workspaceId,
          readerName: read.readerName,
          readAt: read.readAt,
        })
      }

      if (!cancelled) {
        setReady(true)
      }
    }

    void bootstrap()

    return () => {
      cancelled = true

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

      if (previousInboxMessages === null) {
        window.localStorage.removeItem(INBOX_MESSAGES_STORAGE_KEY)
      } else {
        window.localStorage.setItem(INBOX_MESSAGES_STORAGE_KEY, previousInboxMessages)
      }

      if (previousInboxReads === null) {
        window.localStorage.removeItem(INBOX_READS_STORAGE_KEY)
      } else {
        window.localStorage.setItem(INBOX_READS_STORAGE_KEY, previousInboxReads)
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
        workspaces: previousWorkspaceState.workspaces,
        activeWorkspaceId: previousWorkspaceState.activeWorkspaceId,
        authorRequests: previousWorkspaceState.authorRequests,
        invitationsSent: previousWorkspaceState.invitationsSent,
      })
      useWorkspaceInboxStore.setState({
        messages: previousInboxState.messages,
        reads: previousInboxState.reads,
      })
    }
  }, [fixture])

  if (!ready) {
    return <div data-house-role="workspace-navigation-loading" className="min-h-screen bg-background" />
  }

  return (
    <div data-house-role="workspace-navigation-preview-shell" className="min-h-screen bg-background">
      <MemoryRouter initialEntries={[fixture.initialPath]}>
        <AppRouter />
        <RouteEcho />
      </MemoryRouter>
    </div>
  )
}

const meta: Meta<typeof WorkspaceNavigationPreview> = {
  title: 'Pages/WorkspaceNavigation',
  component: WorkspaceNavigationPreview,
  parameters: {
    layout: 'fullscreen',
    withRouter: false,
    viewport: {
      defaultViewport: 'desktop',
    },
  },
  args: {
    fixture: populatedWorkspaceFixture,
  },
}

export default meta

type Story = StoryObj<typeof WorkspaceNavigationPreview>

export const PopulatedWorkspace: Story = {}

export const StartInResults: Story = {
  args: {
    fixture: {
      ...populatedWorkspaceFixture,
      initialPath: '/w/4d-flow-rhc-paper/results',
    },
  },
}

export const StartInInbox: Story = {
  args: {
    fixture: {
      ...populatedWorkspaceFixture,
      initialPath: '/w/4d-flow-rhc-paper/inbox?returnTo=%2Fworkspaces',
    },
  },
}

export const DarkMode: Story = {
  args: {
    fixture: populatedWorkspaceFixture,
  },
  globals: {
    theme: 'dark',
  },
}
