import { useEffect, useState } from 'react'
import type { Meta, StoryObj } from '@storybook/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'

import { WorkspaceInboxPage } from '@/pages/workspace-inbox-page'
import { useWorkspaceInboxStore } from '@/store/use-workspace-inbox-store'
import type {
  WorkspaceAuthorRequest,
  WorkspaceInvitationSent,
  WorkspaceRecord,
} from '@/store/use-workspace-store'
import { useWorkspaceStore } from '@/store/use-workspace-store'

const WORKSPACES_STORAGE_KEY = 'aawe-workspaces'
const ACTIVE_WORKSPACE_STORAGE_KEY = 'aawe-active-workspace-id'
const AUTHOR_REQUESTS_STORAGE_KEY = 'aawe-workspace-author-requests'
const INVITATIONS_SENT_STORAGE_KEY = 'aawe-workspace-invitations-sent'
const INBOX_MESSAGES_STORAGE_KEY = 'aawe-workspace-inbox-messages-v1'
const INBOX_READS_STORAGE_KEY = 'aawe-workspace-inbox-reads-v1'
const INBOX_KEYS_STORAGE_KEY = 'aawe-workspace-inbox-keys-v1'
const INTEGRATIONS_USER_CACHE_KEY = 'aawe_integrations_user_cache'
const PERSONAL_DETAILS_STORAGE_PREFIX = 'aawe_profile_personal_details:'
const STORYBOOK_USER_ID = 'storybook-inbox-user-1'

type InboxFixtureMessage = {
  workspaceId?: string
  senderName: string
  body: string
}

type WorkspaceInboxPageFixture = {
  workspace: WorkspaceRecord
  workspaces: WorkspaceRecord[]
  authorRequests: WorkspaceAuthorRequest[]
  invitationsSent: WorkspaceInvitationSent[]
  currentUserName: string
  messages: InboxFixtureMessage[]
  routeQuery?: string
  readMarker?: {
    readAt: string
  }
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
    removedCollaborators: [],
    pendingCollaborators: [],
    collaboratorRoles: {},
    pendingCollaboratorRoles: {},
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
  workspaces: [
    createWorkspaceFixture(),
    createWorkspaceFixture({
      id: '4d-flow-rhc-paper',
      name: '4D flow RHC paper',
      collaborators: ['J. Meyer', 'S. Wong', 'N. Brooks'],
      updatedAt: '2026-02-25T18:42:00Z',
      pinned: true,
    }),
    createWorkspaceFixture({
      id: 'echo-ai-validation',
      name: 'Echo AI Validation',
      ownerName: 'Ciaran Clarke',
      collaborators: ['P. Green'],
      updatedAt: '2026-02-24T09:10:00Z',
      pinned: false,
    }),
  ],
  authorRequests: [
    {
      id: 'author-req-01',
      workspaceId: 'stroke-ct-outcomes',
      workspaceName: 'Stroke CT Outcomes',
      authorName: 'Aisha Rahman',
      collaboratorRole: 'editor',
      invitedAt: '2026-02-24T10:10:00Z',
    },
  ],
  invitationsSent: [
    {
      id: 'invite-sent-01',
      workspaceId: 'hf-registry',
      workspaceName: 'HF Registry Manuscript',
      inviteeName: 'Devon Li',
      role: 'editor',
      invitedAt: '2026-02-25T11:25:00Z',
      status: 'pending',
    },
  ],
  currentUserName: 'Ciaran Clarke',
  messages: [
    {
      workspaceId: 'hf-registry',
      senderName: 'A. Patel',
      body: 'Can we lock the methods wording before submission?',
    },
    {
      workspaceId: 'hf-registry',
      senderName: 'Ciaran Clarke',
      body: 'Yes. I will finalize methods and update the draft this evening.',
    },
    {
      workspaceId: '4d-flow-rhc-paper',
      senderName: 'S. Wong',
      body: 'Added one more flow sensitivity run in supplementary methods.',
    },
  ],
  routeQuery: 'returnTo=%2Fworkspaces%3Fview%3Dworkspaces%26filter%3Dall%26mode%3Dtable%26sort%3DupdatedAt%26dir%3Ddesc&at=first-unread',
  readMarker: {
    readAt: '2026-02-24T12:00:00Z',
  },
}

const emptyFixture: WorkspaceInboxPageFixture = {
  workspace: createWorkspaceFixture({
    id: 'prospective-trial',
    name: 'Prospective Trial Draft',
    collaborators: [],
  }),
  workspaces: [
    createWorkspaceFixture({
      id: 'prospective-trial',
      name: 'Prospective Trial Draft',
      collaborators: [],
    }),
  ],
  authorRequests: [],
  invitationsSent: [],
  currentUserName: 'Ciaran Clarke',
  messages: [],
}

const populatedFixture: WorkspaceInboxPageFixture = {
  workspace: createWorkspaceFixture({
    id: '4d-flow-rhc-paper',
    name: '4D flow RHC paper',
    collaborators: ['J. Meyer', 'S. Wong', 'N. Brooks', 'I. Ahmed'],
    updatedAt: '2026-02-25T20:01:00Z',
  }),
  workspaces: [
    createWorkspaceFixture(),
    createWorkspaceFixture({
      id: '4d-flow-rhc-paper',
      name: '4D flow RHC paper',
      collaborators: ['J. Meyer', 'S. Wong', 'N. Brooks', 'I. Ahmed'],
      updatedAt: '2026-02-25T20:01:00Z',
      pinned: true,
    }),
    createWorkspaceFixture({
      id: 'af-screening',
      name: 'AF Screening Cohort',
      collaborators: ['S. Roy', 'L. Santos'],
      updatedAt: '2026-02-24T08:00:00Z',
    }),
    createWorkspaceFixture({
      id: 'renal-risk-qc',
      name: 'Renal Risk Model Validation',
      collaborators: ['M. Evans'],
      updatedAt: '2026-02-23T13:40:00Z',
      archived: true,
    }),
  ],
  authorRequests: [
    {
      id: 'author-req-02',
      workspaceId: 'trial-followup',
      workspaceName: 'Trial Follow-Up Meta Analysis',
      authorName: 'Eleanor Hart',
      collaboratorRole: 'editor',
      invitedAt: '2026-02-25T08:31:00Z',
    },
    {
      id: 'author-req-03',
      workspaceId: 'oncology-cardiac-risk',
      workspaceName: 'Oncology Cardiac Risk Registry',
      authorName: 'Tom Price',
      collaboratorRole: 'editor',
      invitedAt: '2026-02-22T16:42:00Z',
    },
  ],
  invitationsSent: [
    {
      id: 'invite-sent-02',
      workspaceId: '4d-flow-rhc-paper',
      workspaceName: '4D flow RHC paper',
      inviteeName: 'Sofia Green',
      role: 'editor',
      invitedAt: '2026-02-25T20:40:00Z',
      status: 'pending',
    },
    {
      id: 'invite-sent-03',
      workspaceId: 'af-screening',
      workspaceName: 'AF Screening Cohort',
      inviteeName: 'Nina Brooks',
      role: 'editor',
      invitedAt: '2026-02-24T13:09:00Z',
      status: 'accepted',
    },
  ],
  currentUserName: 'Ciaran Clarke',
  messages: [
    { workspaceId: '4d-flow-rhc-paper', senderName: 'J. Meyer', body: 'Figure 2 panel labels now match the methods section.' },
    { workspaceId: '4d-flow-rhc-paper', senderName: 'S. Wong', body: 'I added clarifications for invasive pressure calibration.' },
    { workspaceId: '4d-flow-rhc-paper', senderName: 'Ciaran Clarke', body: 'Great. Please also validate the supplementary table legend.' },
    { workspaceId: '4d-flow-rhc-paper', senderName: 'N. Brooks', body: 'Legend updated and cross-checked with flow chart.' },
    { workspaceId: '4d-flow-rhc-paper', senderName: 'I. Ahmed', body: 'Can we lock the cohort exclusion wording now?' },
    { workspaceId: '4d-flow-rhc-paper', senderName: 'Ciaran Clarke', body: 'Yes, locking it now and preparing final checks.' },
    { workspaceId: 'hf-registry', senderName: 'A. Patel', body: 'Registry appendix references are now reconciled.' },
    { workspaceId: 'af-screening', senderName: 'S. Roy', body: 'AF cohort consent language has been revised.' },
    { workspaceId: 'renal-risk-qc', senderName: 'M. Evans', body: 'Validation set now includes the late-stage subgroup.' },
  ],
  routeQuery: 'returnTo=%2Fworkspaces%3Fview%3Dworkspaces%26filter%3Dpinned%26mode%3Dtable%26sort%3DupdatedAt%26dir%3Ddesc&at=first-unread',
  readMarker: {
    readAt: '2026-02-24T07:00:00Z',
  },
}

const longThreadBodies = [
  'Can we lock the baseline demographics table labels before final review?',
  'I aligned the labels with the methods section and pushed the update.',
  'Great. Please double-check the pulmonary vascular resistance units.',
  'Units now read Wood units in both figure and supplementary table.',
  'I also adjusted the legend to mention the calibration sequence.',
  'Perfect. We should add one sentence on right heart catheter timing.',
  'Drafted it: "Catheterization occurred within 24 hours of CMR acquisition."',
  'Looks good. I suggest adding interquartile ranges to the summary row.',
  'Done. Interquartile ranges are now included for all primary metrics.',
  'Could someone verify the exclusion flowchart numbers one more time?',
  'I verified totals: screened 312, excluded 74, analyzed 238.',
  'Thanks. Please check if supplementary figure references are consistent.',
  'Supplementary references fixed in Results and Discussion sections.',
  'Any objections to freezing cohort definitions tonight?',
  'No objections from me. Definitions are stable and reproducible.',
  'Agreed. I will rerun the sensitivity model after lunch.',
  'Sensitivity rerun complete. Effect direction is unchanged.',
  'Did confidence intervals move materially after rerun?',
  'Minor change only; CI width narrowed by about 0.03.',
  'Excellent. I updated the abstract endpoint sentence accordingly.',
  'Please review the final title line before we send to co-authors.',
  'Title now reads: "4D Flow Metrics and Invasive Hemodynamics in RHC Cohort."',
  'I like it. Could we shorten to improve readability?',
  'Revised to: "4D Flow and Invasive Hemodynamics in RHC Cohort."',
  'Approved from my side. Ready for co-author circulation.',
  'Circulating now and tracking feedback in this thread.',
  'Received one comment about abbreviation expansion in first paragraph.',
  'Expanded all abbreviations at first mention and pushed changes.',
  'Thanks everyone. We can submit once references finish syncing.',
  'References synced. Manuscript package is now ready for submission.',
]

const longThreadParticipants = ['Ciaran Clarke', 'J. Meyer', 'S. Wong', 'N. Brooks', 'I. Ahmed']

const longThreadFixture: WorkspaceInboxPageFixture = {
  ...populatedFixture,
  workspace: createWorkspaceFixture({
    id: '4d-flow-rhc-paper',
    name: '4D flow RHC paper',
    collaborators: ['J. Meyer', 'S. Wong', 'N. Brooks', 'I. Ahmed'],
    updatedAt: '2026-02-25T21:30:00Z',
    pinned: true,
  }),
  currentUserName: 'Ciaran Clarke',
  messages: longThreadBodies.map((body, index) => ({
    workspaceId: '4d-flow-rhc-paper',
    senderName: longThreadParticipants[index % longThreadParticipants.length],
    body,
  })),
  readMarker: {
    readAt: '2026-02-25T19:00:00Z',
  },
}

function WorkspaceInboxPreview({ fixture }: WorkspaceInboxPreviewProps) {
  const [ready, setReady] = useState(false)

  useEffect(() => {
    let cancelled = false
    setReady(false)

    const previousWorkspacesRaw = window.localStorage.getItem(WORKSPACES_STORAGE_KEY)
    const previousActiveWorkspaceIdRaw = window.localStorage.getItem(ACTIVE_WORKSPACE_STORAGE_KEY)
    const previousAuthorRequestsRaw = window.localStorage.getItem(AUTHOR_REQUESTS_STORAGE_KEY)
    const previousInvitationsRaw = window.localStorage.getItem(INVITATIONS_SENT_STORAGE_KEY)
    const previousInboxMessagesRaw = window.localStorage.getItem(INBOX_MESSAGES_STORAGE_KEY)
    const previousInboxReadsRaw = window.localStorage.getItem(INBOX_READS_STORAGE_KEY)
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
      if (previousInboxReadsRaw === null) {
        window.localStorage.removeItem(INBOX_READS_STORAGE_KEY)
      } else {
        window.localStorage.setItem(INBOX_READS_STORAGE_KEY, previousInboxReadsRaw)
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
        reads: previousInboxState.reads,
      })
    }

    const bootstrap = async () => {
      window.localStorage.setItem(WORKSPACES_STORAGE_KEY, JSON.stringify(fixture.workspaces))
      window.localStorage.setItem(ACTIVE_WORKSPACE_STORAGE_KEY, fixture.workspace.id)
      window.localStorage.setItem(AUTHOR_REQUESTS_STORAGE_KEY, JSON.stringify(fixture.authorRequests))
      window.localStorage.setItem(INVITATIONS_SENT_STORAGE_KEY, JSON.stringify(fixture.invitationsSent))
      window.localStorage.removeItem(INBOX_MESSAGES_STORAGE_KEY)
      window.localStorage.removeItem(INBOX_READS_STORAGE_KEY)
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
        workspaces: fixture.workspaces,
        activeWorkspaceId: fixture.workspace.id,
        authorRequests: fixture.authorRequests,
        invitationsSent: fixture.invitationsSent,
      })
      useWorkspaceInboxStore.setState({ messages: [], reads: {} })

      for (const message of fixture.messages) {
        await useWorkspaceInboxStore.getState().sendWorkspaceMessage({
          workspaceId: message.workspaceId || fixture.workspace.id,
          senderName: message.senderName,
          body: message.body,
        })
      }
      if (fixture.readMarker) {
        useWorkspaceInboxStore.getState().markWorkspaceRead({
          workspaceId: fixture.workspace.id,
          readerName: fixture.currentUserName,
          readAt: fixture.readMarker.readAt,
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
      <MemoryRouter
        initialEntries={[
          fixture.routeQuery
            ? `/w/${fixture.workspace.id}/inbox?${fixture.routeQuery}`
            : `/w/${fixture.workspace.id}/inbox`,
        ]}
      >
        <Routes>
          <Route
            path="/w/:workspaceId/inbox"
            element={<WorkspaceInboxPage />}
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

export const PopulatedWorkspace: Story = {
  args: {
    fixture: populatedFixture,
  },
}

export const LongConversationThread: Story = {
  args: {
    fixture: longThreadFixture,
  },
}

export const OnlineOnlyFilter: Story = {
  args: {
    fixture: {
      ...populatedFixture,
      routeQuery: `${populatedFixture.routeQuery || ''}&participants=online`,
    },
  },
}

export const AllConversationsView: Story = {
  args: {
    fixture: {
      ...populatedFixture,
      routeQuery: `${populatedFixture.routeQuery || ''}&inboxView=all-conversations`,
    },
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
