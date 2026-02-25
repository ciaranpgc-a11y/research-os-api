import { useEffect, useState } from 'react'
import type { Meta, StoryObj } from '@storybook/react'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom'

import { useWorkspaceInboxStore } from '@/store/use-workspace-inbox-store'
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
const INBOX_MESSAGES_STORAGE_KEY = 'aawe-workspace-inbox-messages-v1'
const INBOX_READS_STORAGE_KEY = 'aawe-workspace-inbox-reads-v1'
const INTEGRATIONS_USER_CACHE_KEY = 'aawe_integrations_user_cache'
const PERSONAL_DETAILS_STORAGE_PREFIX = 'aawe_profile_personal_details:'
const STORYBOOK_USER_ID = 'storybook-user-1'

type WorkspacesInboxFixtureMessage = {
  workspaceId: string
  senderName: string
  body: string
}

type WorkspacesInboxFixtureRead = {
  workspaceId: string
  readerName: string
  readAt: string
}

type WorkspacesPageFixture = {
  workspaces: WorkspaceRecord[]
  activeWorkspaceId: string | null
  authorRequests: WorkspaceAuthorRequest[]
  invitationsSent: WorkspaceInvitationSent[]
  inboxMessages: WorkspacesInboxFixtureMessage[]
  inboxReads: WorkspacesInboxFixtureRead[]
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
      removedCollaborators: [],
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
  inboxMessages: [
    {
      workspaceId: 'hf-registry',
      senderName: 'A. Patel',
      body: 'Methods section is updated and ready for final checks.',
    },
    {
      workspaceId: 'hf-registry',
      senderName: 'Ciaran Clarke',
      body: 'Great. I will run through references tonight.',
    },
  ],
  inboxReads: [
    {
      workspaceId: 'hf-registry',
      readerName: 'Ciaran Clarke',
      readAt: '2026-02-25T11:00:00Z',
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
  inboxMessages: [
    { workspaceId: 'hf-registry', senderName: 'A. Patel', body: 'Updated outcomes table uploaded.' },
    { workspaceId: 'hf-registry', senderName: 'Devon Li', body: 'I can cover statistical appendix edits.' },
    { workspaceId: 'hf-registry', senderName: 'Ciaran Clarke', body: 'Please proceed with appendix updates.' },
    { workspaceId: 'af-screening', senderName: 'S. Roy', body: 'Enrollment criteria finalized.' },
    { workspaceId: 'af-screening', senderName: 'L. Santos', body: 'Need owner sign-off for subgroup analysis.' },
    { workspaceId: 'renal-risk-qc', senderName: 'M. Evans', body: 'Validation set flagged for missing creatinine rows.' },
    { workspaceId: 'renal-risk-qc', senderName: 'Ciaran Clarke', body: 'Please open a QC issue and assign me.' },
    { workspaceId: 'legacy-trial-archive', senderName: 'M. Evans', body: 'Archive index completed.' },
  ],
  inboxReads: [
    { workspaceId: 'hf-registry', readerName: 'Ciaran Clarke', readAt: '2026-02-24T11:00:00Z' },
    { workspaceId: 'af-screening', readerName: 'Ciaran Clarke', readAt: '2026-02-25T23:59:59Z' },
    { workspaceId: 'renal-risk-qc', readerName: 'Ciaran Clarke', readAt: '2026-02-20T08:00:00Z' },
  ],
}

const dataRichFixture: WorkspacesPageFixture = {
  workspaces: [
    ...mixedPortfolioFixture.workspaces,
    {
      id: '4d-flow-rhc-paper',
      name: '4D flow RHC paper',
      ownerName: 'Ciaran Clarke',
      collaborators: ['J. Meyer', 'S. Wong', 'N. Brooks'],
      removedCollaborators: ['S. Wong'],
      version: '0.7',
      health: 'amber',
      updatedAt: '2026-02-25T19:10:00Z',
      pinned: true,
      archived: false,
    },
    {
      id: 'echo-ai-validation',
      name: 'Echo AI Validation',
      ownerName: 'Ciaran Clarke',
      collaborators: ['P. Green', 'K. Allen'],
      removedCollaborators: [],
      version: '1.0',
      health: 'green',
      updatedAt: '2026-02-25T09:34:00Z',
      pinned: false,
      archived: false,
    },
    {
      id: 'device-adjudication',
      name: 'Device Adjudication Review',
      ownerName: 'Maya Singh',
      collaborators: ['Ciaran Clarke', 'R. Kim'],
      removedCollaborators: [],
      version: '0.3',
      health: 'amber',
      updatedAt: '2026-02-23T15:11:00Z',
      pinned: false,
      archived: false,
    },
    {
      id: 'registry-cleanup',
      name: 'Registry Data Cleanup',
      ownerName: 'Ciaran Clarke',
      collaborators: ['I. Ahmed', 'D. Wu', 'O. Tan'],
      removedCollaborators: ['O. Tan'],
      version: '1.8',
      health: 'red',
      updatedAt: '2026-02-21T07:27:00Z',
      pinned: false,
      archived: false,
    },
  ],
  activeWorkspaceId: '4d-flow-rhc-paper',
  authorRequests: [
    ...mixedPortfolioFixture.authorRequests,
    {
      id: 'author-req-04',
      workspaceId: 'trial-followup',
      workspaceName: 'Trial Follow-Up Meta Analysis',
      authorName: 'Eleanor Hart',
      invitedAt: '2026-02-25T08:31:00Z',
    },
  ],
  invitationsSent: [
    ...mixedPortfolioFixture.invitationsSent,
    {
      id: 'invite-sent-04',
      workspaceId: '4d-flow-rhc-paper',
      workspaceName: '4D flow RHC paper',
      inviteeName: 'Sofia Green',
      invitedAt: '2026-02-25T20:40:00Z',
      status: 'pending',
    },
    {
      id: 'invite-sent-05',
      workspaceId: 'echo-ai-validation',
      workspaceName: 'Echo AI Validation',
      inviteeName: 'Raj Kumar',
      invitedAt: '2026-02-24T13:09:00Z',
      status: 'accepted',
    },
  ],
  inboxMessages: [
    ...mixedPortfolioFixture.inboxMessages,
    { workspaceId: '4d-flow-rhc-paper', senderName: 'J. Meyer', body: 'Figure 3 labels updated for consistency.' },
    { workspaceId: '4d-flow-rhc-paper', senderName: 'N. Brooks', body: 'Need one more pass on RHC cohort exclusions.' },
    { workspaceId: 'echo-ai-validation', senderName: 'P. Green', body: 'Model drift check complete for v1.0.' },
    { workspaceId: 'device-adjudication', senderName: 'Maya Singh', body: 'Please review adjudication edge cases in section B.' },
    { workspaceId: 'registry-cleanup', senderName: 'I. Ahmed', body: 'A batch of invalid dates has been fixed.' },
    { workspaceId: 'registry-cleanup', senderName: 'D. Wu', body: 'There are still duplicate patient IDs in ward 3.' },
  ],
  inboxReads: [
    ...mixedPortfolioFixture.inboxReads,
    { workspaceId: '4d-flow-rhc-paper', readerName: 'Ciaran Clarke', readAt: '2026-02-25T18:55:00Z' },
    { workspaceId: 'echo-ai-validation', readerName: 'Ciaran Clarke', readAt: '2026-02-25T23:59:59Z' },
    { workspaceId: 'device-adjudication', readerName: 'Ciaran Clarke', readAt: '2026-02-22T10:00:00Z' },
    { workspaceId: 'registry-cleanup', readerName: 'Ciaran Clarke', readAt: '2026-02-19T06:00:00Z' },
  ],
}

const emptyFixture: WorkspacesPageFixture = {
  workspaces: [],
  activeWorkspaceId: null,
  authorRequests: [],
  invitationsSent: [],
  inboxMessages: [],
  inboxReads: [],
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
  inboxMessages: [
    { workspaceId: 'hf-registry', senderName: 'A. Patel', body: 'Can we reopen collaborator M. Evans next week?' },
    { workspaceId: 'hf-registry', senderName: 'L. Santos', body: 'I completed the supplementary table cleanup.' },
  ],
  inboxReads: [
    { workspaceId: 'hf-registry', readerName: 'Ciaran Clarke', readAt: '2026-02-24T18:00:00Z' },
  ],
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
  inboxMessages: [
    { workspaceId: 'external-study', senderName: 'Maya Singh', body: 'Please review section 2 assumptions.' },
  ],
  inboxReads: [
    { workspaceId: 'external-study', readerName: 'Ciaran Clarke', readAt: '2026-02-01T08:00:00Z' },
  ],
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
    const previousState = useWorkspaceStore.getState()
    const previousInboxState = useWorkspaceInboxStore.getState()

    const bootstrap = async () => {
      window.sessionStorage.setItem(AUTH_TOKEN_STORAGE_KEY, 'storybook-session-token')
      window.localStorage.setItem(AUTH_TOKEN_STORAGE_KEY, 'storybook-session-token')
      window.localStorage.setItem(WORKSPACES_STORAGE_KEY, JSON.stringify(fixture.workspaces))
      window.localStorage.setItem(AUTHOR_REQUESTS_STORAGE_KEY, JSON.stringify(fixture.authorRequests))
      window.localStorage.setItem(INVITATIONS_SENT_STORAGE_KEY, JSON.stringify(fixture.invitationsSent))
      window.localStorage.removeItem(INBOX_MESSAGES_STORAGE_KEY)
      window.localStorage.removeItem(INBOX_READS_STORAGE_KEY)
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
        workspaces: previousState.workspaces,
        activeWorkspaceId: previousState.activeWorkspaceId,
        authorRequests: previousState.authorRequests,
        invitationsSent: previousState.invitationsSent,
      })
      useWorkspaceInboxStore.setState({
        messages: previousInboxState.messages,
        reads: previousInboxState.reads,
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
          <Route path="/w/:workspaceId/inbox" element={<RouteEcho />} />
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

export const DataRichPortfolio: Story = {
  args: {
    fixture: dataRichFixture,
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
