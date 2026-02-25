import { useEffect, useState } from 'react'
import type { Meta, StoryObj } from '@storybook/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'

import { WorkspaceInboxPage } from '@/pages/workspace-inbox-page'
import { useWorkspaceInboxStore } from '@/store/use-workspace-inbox-store'
import type { WorkspaceRecord } from '@/store/use-workspace-store'
import { useWorkspaceStore } from '@/store/use-workspace-store'

const WORKSPACES_STORAGE_KEY = 'aawe-workspaces'
const ACTIVE_WORKSPACE_STORAGE_KEY = 'aawe-active-workspace-id'
const AUTHOR_REQUESTS_STORAGE_KEY = 'aawe-workspace-author-requests'
const INVITATIONS_SENT_STORAGE_KEY = 'aawe-workspace-invitations-sent'
const INBOX_MESSAGES_STORAGE_KEY = 'aawe-workspace-inbox-messages-v1'
const INBOX_KEYS_STORAGE_KEY = 'aawe-workspace-inbox-keys-v1'
const INTEGRATIONS_USER_CACHE_KEY = 'aawe_integrations_user_cache'
const PERSONAL_DETAILS_STORAGE_PREFIX = 'aawe_profile_personal_details:'
const STORYBOOK_USER_ID = 'storybook-inbox-user-1'

type InboxFixtureMessage = {
  senderName: string
  body: string
}

type WorkspaceInboxPageFixture = {
  workspace: WorkspaceRecord
  currentUserName: string
  messages: InboxFixtureMessage[]
}

type WorkspaceInboxPreviewProps = {
  fixture: WorkspaceInboxPageFixture
}

function createWorkspaceFixture(overrides?: Partial<WorkspaceRecord>): WorkspaceRecord {
  return {
    id: 'hf-registry',
    name: 'HF Registry Manuscript',
    ownerName: 'Ciaran Clarke',
    collaborators: ['A. Patel', 'M. Evans'],
    version: '0.5',
    health: 'amber',
    updatedAt: '2026-02-25T16:10:00Z',
    pinned: true,
    archived: false,
    ...overrides,
  }
}

const defaultFixture: WorkspaceInboxPageFixture = {
  workspace: createWorkspaceFixture(),
  currentUserName: 'Ciaran Clarke',
  messages: [
    {
      senderName: 'A. Patel',
      body: 'Can we lock the methods wording before submission?',
    },
    {
      senderName: 'Ciaran Clarke',
      body: 'Yes. I will finalize methods and update the draft this evening.',
    },
  ],
}

const emptyFixture: WorkspaceInboxPageFixture = {
  workspace: createWorkspaceFixture({
    id: 'prospective-trial',
    name: 'Prospective Trial Draft',
    collaborators: [],
  }),
  currentUserName: 'Ciaran Clarke',
  messages: [],
}

function WorkspaceInboxPreview({ fixture }: WorkspaceInboxPreviewProps) {
  const [ready, setReady] = useState(false)

  useEffect(() => {
    let cancelled = false

    const previousWorkspacesRaw = window.localStorage.getItem(WORKSPACES_STORAGE_KEY)
    const previousActiveWorkspaceIdRaw = window.localStorage.getItem(ACTIVE_WORKSPACE_STORAGE_KEY)
    const previousAuthorRequestsRaw = window.localStorage.getItem(AUTHOR_REQUESTS_STORAGE_KEY)
    const previousInvitationsRaw = window.localStorage.getItem(INVITATIONS_SENT_STORAGE_KEY)
    const previousInboxMessagesRaw = window.localStorage.getItem(INBOX_MESSAGES_STORAGE_KEY)
    const previousInboxKeysRaw = window.localStorage.getItem(INBOX_KEYS_STORAGE_KEY)
    const previousCachedUserRaw = window.localStorage.getItem(INTEGRATIONS_USER_CACHE_KEY)
    const personalDetailsStorageKey = `${PERSONAL_DETAILS_STORAGE_PREFIX}${STORYBOOK_USER_ID}`
    const previousPersonalDetailsRaw = window.localStorage.getItem(personalDetailsStorageKey)

    const previousWorkspaceState = useWorkspaceStore.getState()
    const previousInboxState = useWorkspaceInboxStore.getState()

    const restore = () => {
      if (previousWorkspacesRaw === null) {
        window.localStorage.removeItem(WORKSPACES_STORAGE_KEY)
      } else {
        window.localStorage.setItem(WORKSPACES_STORAGE_KEY, previousWorkspacesRaw)
      }
      if (previousActiveWorkspaceIdRaw === null) {
        window.localStorage.removeItem(ACTIVE_WORKSPACE_STORAGE_KEY)
      } else {
        window.localStorage.setItem(ACTIVE_WORKSPACE_STORAGE_KEY, previousActiveWorkspaceIdRaw)
      }
      if (previousAuthorRequestsRaw === null) {
        window.localStorage.removeItem(AUTHOR_REQUESTS_STORAGE_KEY)
      } else {
        window.localStorage.setItem(AUTHOR_REQUESTS_STORAGE_KEY, previousAuthorRequestsRaw)
      }
      if (previousInvitationsRaw === null) {
        window.localStorage.removeItem(INVITATIONS_SENT_STORAGE_KEY)
      } else {
        window.localStorage.setItem(INVITATIONS_SENT_STORAGE_KEY, previousInvitationsRaw)
      }
      if (previousInboxMessagesRaw === null) {
        window.localStorage.removeItem(INBOX_MESSAGES_STORAGE_KEY)
      } else {
        window.localStorage.setItem(INBOX_MESSAGES_STORAGE_KEY, previousInboxMessagesRaw)
      }
      if (previousInboxKeysRaw === null) {
        window.localStorage.removeItem(INBOX_KEYS_STORAGE_KEY)
      } else {
        window.localStorage.setItem(INBOX_KEYS_STORAGE_KEY, previousInboxKeysRaw)
      }
      if (previousCachedUserRaw === null) {
        window.localStorage.removeItem(INTEGRATIONS_USER_CACHE_KEY)
      } else {
        window.localStorage.setItem(INTEGRATIONS_USER_CACHE_KEY, previousCachedUserRaw)
      }
      if (previousPersonalDetailsRaw === null) {
        window.localStorage.removeItem(personalDetailsStorageKey)
      } else {
        window.localStorage.setItem(personalDetailsStorageKey, previousPersonalDetailsRaw)
      }

      useWorkspaceStore.setState({
        workspaces: previousWorkspaceState.workspaces,
        activeWorkspaceId: previousWorkspaceState.activeWorkspaceId,
        authorRequests: previousWorkspaceState.authorRequests,
        invitationsSent: previousWorkspaceState.invitationsSent,
      })
      useWorkspaceInboxStore.setState({
        messages: previousInboxState.messages,
      })
    }

    const bootstrap = async () => {
      window.localStorage.setItem(WORKSPACES_STORAGE_KEY, JSON.stringify([fixture.workspace]))
      window.localStorage.setItem(ACTIVE_WORKSPACE_STORAGE_KEY, fixture.workspace.id)
      window.localStorage.setItem(AUTHOR_REQUESTS_STORAGE_KEY, JSON.stringify([]))
      window.localStorage.setItem(INVITATIONS_SENT_STORAGE_KEY, JSON.stringify([]))
      window.localStorage.removeItem(INBOX_MESSAGES_STORAGE_KEY)
      window.localStorage.removeItem(INBOX_KEYS_STORAGE_KEY)
      window.localStorage.setItem(INTEGRATIONS_USER_CACHE_KEY, JSON.stringify({ id: STORYBOOK_USER_ID }))
      const [firstName, ...rest] = fixture.currentUserName.split(' ')
      window.localStorage.setItem(
        personalDetailsStorageKey,
        JSON.stringify({
          firstName: firstName || fixture.currentUserName,
          lastName: rest.join(' '),
        }),
      )

      useWorkspaceStore.setState({
        workspaces: [fixture.workspace],
        activeWorkspaceId: fixture.workspace.id,
        authorRequests: [],
        invitationsSent: [],
      })
      useWorkspaceInboxStore.setState({ messages: [] })

      for (const message of fixture.messages) {
        await useWorkspaceInboxStore.getState().sendWorkspaceMessage({
          workspaceId: fixture.workspace.id,
          senderName: message.senderName,
          body: message.body,
        })
      }

      if (!cancelled) {
        setReady(true)
      }
    }

    void bootstrap()

    return () => {
      cancelled = true
      restore()
    }
  }, [fixture])

  if (!ready) {
    return <div className="min-h-screen bg-background" />
  }

  return (
    <div className="min-h-screen bg-background">
      <MemoryRouter initialEntries={[`/w/${fixture.workspace.id}/inbox`]}>
        <Routes>
          <Route
            path="/w/:workspaceId/inbox"
            element={(
              <main className="mx-auto w-full max-w-6xl px-4 py-4 md:px-6">
                <WorkspaceInboxPage />
              </main>
            )}
          />
        </Routes>
      </MemoryRouter>
    </div>
  )
}

const meta: Meta<typeof WorkspaceInboxPreview> = {
  title: 'Pages/WorkspaceInboxPage',
  component: WorkspaceInboxPreview,
  parameters: {
    layout: 'fullscreen',
    withRouter: false,
  },
  args: {
    fixture: defaultFixture,
  },
}

export default meta

type Story = StoryObj<typeof WorkspaceInboxPreview>

export const Default: Story = {}

export const EmptyConversation: Story = {
  args: {
    fixture: emptyFixture,
  },
}

export const DarkMode: Story = {
  args: {
    fixture: defaultFixture,
  },
  globals: {
    theme: 'dark',
  },
}
