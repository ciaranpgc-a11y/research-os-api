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
import type { CollaboratorPayload } from '@/types/impact'
import type { LibraryAssetRecord } from '@/types/study-core'

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
  libraryAssets: LibraryAssetRecord[]
  initialRoute?: string
}

type WorkspacesPagePreviewProps = {
  fixture: WorkspacesPageFixture
}

const defaultLibraryAssets: LibraryAssetRecord[] = [
  {
    id: 'lib-asset-01',
    owner_user_id: STORYBOOK_USER_ID,
    owner_name: 'Ciaran Clarke',
    project_id: 'project-4d-flow',
    filename: '4d_flow_primary_dataset.xlsx',
    kind: 'xlsx',
    mime_type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    byte_size: 845230,
    uploaded_at: '2026-02-25T10:05:00Z',
    shared_with_user_ids: ['user-j-meyer', 'user-n-brooks'],
    shared_with: [
      { user_id: 'user-j-meyer', name: 'J. Meyer' },
      { user_id: 'user-n-brooks', name: 'N. Brooks' },
    ],
    can_manage_access: true,
  },
  {
    id: 'lib-asset-02',
    owner_user_id: 'user-maya-singh',
    owner_name: 'Maya Singh',
    project_id: 'project-device-review',
    filename: 'device_adjudication_extract.csv',
    kind: 'csv',
    mime_type: 'text/csv',
    byte_size: 184302,
    uploaded_at: '2026-02-24T09:30:00Z',
    shared_with_user_ids: [STORYBOOK_USER_ID],
    shared_with: [{ user_id: STORYBOOK_USER_ID, name: 'Ciaran Clarke' }],
    can_manage_access: false,
  },
  {
    id: 'lib-asset-03',
    owner_user_id: STORYBOOK_USER_ID,
    owner_name: 'Ciaran Clarke',
    project_id: 'project-af-screening',
    filename: 'af_screening_data_dictionary.csv',
    kind: 'csv',
    mime_type: 'text/csv',
    byte_size: 52212,
    uploaded_at: '2026-02-23T08:14:00Z',
    shared_with_user_ids: [],
    shared_with: [],
    can_manage_access: true,
  },
]

const defaultFixture: WorkspacesPageFixture = {
  workspaces: [
    {
      id: 'hf-registry',
      name: 'HF Registry Manuscript',
      ownerName: 'Ciaran Clarke',
      collaborators: ['A. Patel'],
      removedCollaborators: [],
      pendingCollaborators: [],
      collaboratorRoles: {},
      pendingCollaboratorRoles: {},
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
  libraryAssets: defaultLibraryAssets,
}

const mixedPortfolioFixture: WorkspacesPageFixture = {
  workspaces: [
    {
      id: 'hf-registry',
      name: 'HF Registry Manuscript',
      ownerName: 'Ciaran Clarke',
      collaborators: ['A. Patel'],
      removedCollaborators: [],
      pendingCollaborators: [],
      collaboratorRoles: {},
      pendingCollaboratorRoles: {},
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
      pendingCollaborators: [],
      collaboratorRoles: {},
      pendingCollaboratorRoles: {},
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
      pendingCollaborators: [],
      collaboratorRoles: {},
      pendingCollaboratorRoles: {},
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
      pendingCollaborators: [],
      collaboratorRoles: {},
      pendingCollaboratorRoles: {},
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
      collaboratorRole: 'editor',
      invitedAt: '2026-02-23T09:05:00Z',
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
      workspaceId: 'af-screening',
      workspaceName: 'AF Screening Cohort',
      inviteeName: 'Nina Brooks',
      role: 'editor',
      invitedAt: '2026-02-25T08:14:00Z',
      status: 'pending',
    },
    {
      id: 'invite-sent-03',
      workspaceId: 'hf-registry',
      workspaceName: 'HF Registry Manuscript',
      inviteeName: 'Devon Li',
      role: 'editor',
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
  libraryAssets: defaultLibraryAssets,
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
      pendingCollaborators: [],
      collaboratorRoles: {},
      pendingCollaboratorRoles: {},
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
      pendingCollaborators: [],
      collaboratorRoles: {},
      pendingCollaboratorRoles: {},
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
      pendingCollaborators: [],
      collaboratorRoles: {},
      pendingCollaboratorRoles: {},
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
      pendingCollaborators: [],
      collaboratorRoles: {},
      pendingCollaboratorRoles: {},
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
      collaboratorRole: 'editor',
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
      role: 'editor',
      invitedAt: '2026-02-25T20:40:00Z',
      status: 'pending',
    },
    {
      id: 'invite-sent-05',
      workspaceId: 'echo-ai-validation',
      workspaceName: 'Echo AI Validation',
      inviteeName: 'Raj Kumar',
      role: 'editor',
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
  libraryAssets: [
    ...defaultLibraryAssets,
    {
      id: 'lib-asset-04',
      owner_user_id: STORYBOOK_USER_ID,
      owner_name: 'Ciaran Clarke',
      project_id: 'project-hf-registry',
      filename: 'hf_registry_outcomes.tsv',
      kind: 'tsv',
      mime_type: 'text/tab-separated-values',
      byte_size: 302112,
      uploaded_at: '2026-02-25T18:01:00Z',
      shared_with_user_ids: ['user-a-patel'],
      shared_with: [{ user_id: 'user-a-patel', name: 'A. Patel' }],
      can_manage_access: true,
    },
    {
      id: 'lib-asset-05',
      owner_user_id: 'user-eleanor-hart',
      owner_name: 'Eleanor Hart',
      project_id: 'project-trial-followup',
      filename: 'trial_followup_cleaned.xlsx',
      kind: 'xlsx',
      mime_type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      byte_size: 910443,
      uploaded_at: '2026-02-22T07:42:00Z',
      shared_with_user_ids: [STORYBOOK_USER_ID, 'user-j-meyer'],
      shared_with: [
        { user_id: STORYBOOK_USER_ID, name: 'Ciaran Clarke' },
        { user_id: 'user-j-meyer', name: 'J. Meyer' },
      ],
      can_manage_access: false,
    },
  ],
}

const emptyFixture: WorkspacesPageFixture = {
  workspaces: [],
  activeWorkspaceId: null,
  authorRequests: [],
  invitationsSent: [],
  inboxMessages: [],
  inboxReads: [],
  libraryAssets: [],
}

const collaboratorStateFixture: WorkspacesPageFixture = {
  workspaces: [
    {
      id: 'hf-registry',
      name: 'HF Registry Manuscript',
      ownerName: 'Ciaran Clarke',
      collaborators: ['A. Patel', 'M. Evans', 'L. Santos'],
      removedCollaborators: ['M. Evans'],
      pendingCollaborators: ['R. Khan'],
      collaboratorRoles: {
        'A. Patel': 'editor',
        'M. Evans': 'reviewer',
        'L. Santos': 'viewer',
      },
      pendingCollaboratorRoles: {
        'R. Khan': 'reviewer',
      },
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
  libraryAssets: defaultLibraryAssets,
}

const collaboratorReadOnlyFixture: WorkspacesPageFixture = {
  workspaces: [
    {
      id: 'external-study',
      name: 'External Study Draft',
      ownerName: 'Maya Singh',
      collaborators: ['Ciaran Clarke', 'A. Patel'],
      removedCollaborators: ['A. Patel'],
      pendingCollaborators: ['J. Harper'],
      collaboratorRoles: {
        'Ciaran Clarke': 'editor',
        'A. Patel': 'viewer',
      },
      pendingCollaboratorRoles: {
        'J. Harper': 'reviewer',
      },
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
  libraryAssets: defaultLibraryAssets,
}

const collaboratorPendingOnlyFixture: WorkspacesPageFixture = {
  workspaces: [
    {
      id: 'pending-demo',
      name: 'Pending Collaborator Demo',
      ownerName: 'Ciaran Clarke',
      collaborators: [],
      removedCollaborators: [],
      pendingCollaborators: ['N. Brooks', 'E. Hart'],
      collaboratorRoles: {},
      pendingCollaboratorRoles: {
        'N. Brooks': 'reviewer',
        'E. Hart': 'viewer',
      },
      version: '0.2',
      health: 'amber',
      updatedAt: '2026-02-25T20:20:00Z',
      pinned: false,
      archived: false,
    },
  ],
  activeWorkspaceId: 'pending-demo',
  authorRequests: [],
  invitationsSent: [],
  inboxMessages: [],
  inboxReads: [],
  libraryAssets: defaultLibraryAssets,
}

const collaboratorMixedStatesFixture: WorkspacesPageFixture = {
  ...mixedPortfolioFixture,
  workspaces: mixedPortfolioFixture.workspaces.map((workspace) => {
    if (workspace.id === 'hf-registry') {
      return {
        ...workspace,
        pendingCollaborators: ['M. Evans'],
        pendingCollaboratorRoles: { 'M. Evans': 'reviewer' },
      }
    }
    if (workspace.id === 'af-screening') {
      return {
        ...workspace,
        pendingCollaborators: ['N. Brooks'],
        pendingCollaboratorRoles: { 'N. Brooks': 'viewer' },
      }
    }
    return workspace
  }),
}

const dataLibraryFixture: WorkspacesPageFixture = {
  ...dataRichFixture,
  initialRoute: '/workspaces?view=data-library',
}

const dataLibraryWithCollaboratorsFixture: WorkspacesPageFixture = {
  ...dataRichFixture,
  initialRoute: '/workspaces?view=data-library',
  libraryAssets: [
    ...dataRichFixture.libraryAssets,
    {
      id: 'lib-asset-06',
      owner_user_id: STORYBOOK_USER_ID,
      owner_name: 'Ciaran Clarke',
      project_id: 'project-4d-flow-rhc-paper',
      filename: 'rhc_quality_flags_v3.csv',
      kind: 'csv',
      mime_type: 'text/csv',
      byte_size: 164338,
      uploaded_at: '2026-02-25T21:42:00Z',
      shared_with_user_ids: ['user-j-meyer', 'user-n-brooks', 'user-a-patel'],
      shared_with: [
        { user_id: 'user-j-meyer', name: 'J. Meyer' },
        { user_id: 'user-n-brooks', name: 'N. Brooks' },
        { user_id: 'user-a-patel', name: 'A. Patel' },
      ],
      can_manage_access: true,
    },
    {
      id: 'lib-asset-07',
      owner_user_id: STORYBOOK_USER_ID,
      owner_name: 'Ciaran Clarke',
      project_id: 'project-echo-ai-validation',
      filename: 'echo_validation_subset.tsv',
      kind: 'tsv',
      mime_type: 'text/tab-separated-values',
      byte_size: 487521,
      uploaded_at: '2026-02-25T20:11:00Z',
      shared_with_user_ids: ['user-s-wong', 'user-p-green', 'user-k-allen', 'user-i-ahmed'],
      shared_with: [
        { user_id: 'user-s-wong', name: 'S. Wong' },
        { user_id: 'user-p-green', name: 'P. Green' },
        { user_id: 'user-k-allen', name: 'K. Allen' },
        { user_id: 'user-i-ahmed', name: 'I. Ahmed' },
      ],
      can_manage_access: true,
    },
  ],
}

function cloneLibraryAsset(asset: LibraryAssetRecord): LibraryAssetRecord {
  return {
    ...asset,
    shared_with_user_ids: [...(asset.shared_with_user_ids || [])],
    shared_with: (asset.shared_with || []).map((member) => ({ ...member })),
  }
}

function nameToMockUserId(name: string): string {
  const slug = name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
  return slug ? `user-${slug}` : 'user-unknown'
}

function guessLibraryAssetKind(filename: string): string {
  const lowered = String(filename || '').trim().toLowerCase()
  if (lowered.endsWith('.pdf')) {
    return 'pdf'
  }
  if (lowered.endsWith('.csv')) {
    return 'csv'
  }
  if (lowered.endsWith('.tsv')) {
    return 'tsv'
  }
  if (lowered.endsWith('.xlsx')) {
    return 'xlsx'
  }
  if (lowered.endsWith('.txt')) {
    return 'txt'
  }
  return 'unknown'
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
    const previousFetch = window.fetch.bind(window)
    let storyLibraryAssets = (fixture.libraryAssets || []).map(cloneLibraryAsset)
    const collaboratorDirectory = (() => {
      const seen = new Set<string>()
      const items: CollaboratorPayload[] = []
      const addName = (name: string) => {
        const clean = String(name || '').trim().replace(/\s+/g, ' ')
        if (!clean) {
          return
        }
        const id = nameToMockUserId(clean)
        if (seen.has(id)) {
          return
        }
        seen.add(id)
        items.push({
          id,
          owner_user_id: STORYBOOK_USER_ID,
          full_name: clean,
          preferred_name: null,
          email: `${id.replace(/^user-/, '')}@example.com`,
          orcid_id: null,
          openalex_author_id: null,
          primary_institution: 'Research Collaboration Network',
          department: null,
          country: 'GB',
          current_position: null,
          research_domains: [],
          notes: null,
          created_at: '2026-02-20T00:00:00Z',
          updated_at: '2026-02-25T00:00:00Z',
          metrics: {
            coauthored_works_count: 0,
            shared_citations_total: 0,
            first_collaboration_year: null,
            last_collaboration_year: null,
            citations_last_12m: 0,
            collaboration_strength_score: 0,
            classification: 'UNCLASSIFIED',
            computed_at: null,
            status: 'READY',
          },
          duplicate_warnings: [],
        })
      }
      fixture.workspaces.forEach((workspace) => {
        addName(workspace.ownerName)
        workspace.collaborators.forEach(addName)
        for (const pendingCollaborator of workspace.pendingCollaborators || []) {
          addName(pendingCollaborator)
        }
      })
      fixture.authorRequests.forEach((request) => addName(request.authorName))
      fixture.invitationsSent.forEach((invitation) => addName(invitation.inviteeName))
      return items
    })()

    window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
      const requestUrl =
        typeof input === 'string'
          ? input
          : input instanceof URL
            ? input.toString()
            : input.url
      const requestMethod = (
        init?.method ||
        (typeof input !== 'string' && !(input instanceof URL) ? input.method : 'GET') ||
        'GET'
      ).toUpperCase()

      let parsedUrl: URL
      try {
        parsedUrl = new URL(requestUrl, window.location.origin)
      } catch {
        return previousFetch(input, init)
      }

      const path = parsedUrl.pathname
      if (path.endsWith('/v1/account/collaboration/collaborators') && requestMethod === 'GET') {
        const queryValue = String(parsedUrl.searchParams.get('query') || '').trim().toLowerCase()
        const pageValue = Math.max(1, Number(parsedUrl.searchParams.get('page') || '1'))
        const pageSizeValue = Math.max(1, Math.min(200, Number(parsedUrl.searchParams.get('page_size') || '50')))
        const filtered = queryValue
          ? collaboratorDirectory.filter((candidate) => candidate.full_name.toLowerCase().includes(queryValue))
          : collaboratorDirectory
        const start = (pageValue - 1) * pageSizeValue
        const end = start + pageSizeValue
        const items = filtered.slice(start, end)
        return new Response(
          JSON.stringify({
            items,
            page: pageValue,
            page_size: pageSizeValue,
            total: filtered.length,
            has_more: end < filtered.length,
          }),
          {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          },
        )
      }

      if (path.endsWith('/v1/library/assets') && requestMethod === 'GET') {
        const queryValue = String(parsedUrl.searchParams.get('query') || '').trim().toLowerCase()
        const ownership = String(parsedUrl.searchParams.get('ownership') || 'all').trim().toLowerCase()
        const sortBy = String(parsedUrl.searchParams.get('sort_by') || 'uploaded_at').trim().toLowerCase()
        const sortDirection = String(parsedUrl.searchParams.get('sort_direction') || 'desc').trim().toLowerCase()
        const pageValue = Math.max(1, Number(parsedUrl.searchParams.get('page') || '1'))
        const pageSizeValue = Math.max(1, Math.min(200, Number(parsedUrl.searchParams.get('page_size') || '50')))

        let filtered = [...storyLibraryAssets]
        if (ownership === 'owned') {
          filtered = filtered.filter((asset) => Boolean(asset.can_manage_access))
        } else if (ownership === 'shared') {
          filtered = filtered.filter((asset) => !asset.can_manage_access)
        }

        if (queryValue) {
          filtered = filtered.filter((asset) => {
            const sharedNames = (asset.shared_with || []).map((entry) => entry.name).join(' ')
            const haystack = `${asset.filename} ${asset.kind} ${asset.mime_type || ''} ${asset.owner_name || ''} ${sharedNames}`.toLowerCase()
            return haystack.includes(queryValue)
          })
        }

        filtered.sort((left, right) => {
          let comparison = 0
          if (sortBy === 'filename') {
            comparison = left.filename.localeCompare(right.filename)
          } else if (sortBy === 'byte_size') {
            comparison = Number(left.byte_size || 0) - Number(right.byte_size || 0)
          } else if (sortBy === 'kind') {
            comparison = String(left.kind || '').localeCompare(String(right.kind || ''))
          } else if (sortBy === 'owner_name') {
            comparison = String(left.owner_name || '').localeCompare(String(right.owner_name || ''))
          } else {
            comparison = Date.parse(String(left.uploaded_at || '')) - Date.parse(String(right.uploaded_at || ''))
          }
          return sortDirection === 'asc' ? comparison : -comparison
        })

        const total = filtered.length
        const start = (pageValue - 1) * pageSizeValue
        const end = start + pageSizeValue
        const items = filtered.slice(start, end)

        return new Response(
          JSON.stringify({
            items,
            page: pageValue,
            page_size: pageSizeValue,
            total,
            has_more: end < total,
            sort_by: sortBy,
            sort_direction: sortDirection === 'asc' ? 'asc' : 'desc',
            query: queryValue,
            ownership: ownership === 'owned' || ownership === 'shared' ? ownership : 'all',
          }),
          {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          },
        )
      }

      const metadataMatch = path.match(/\/v1\/library\/assets\/([^/]+)$/)
      if (metadataMatch && requestMethod === 'PATCH') {
        const assetId = decodeURIComponent(metadataMatch[1])
        const assetIndex = storyLibraryAssets.findIndex((asset) => asset.id === assetId)
        if (assetIndex < 0) {
          return new Response(JSON.stringify({ error: { detail: `Data asset '${assetId}' was not found.` } }), {
            status: 404,
            headers: { 'Content-Type': 'application/json' },
          })
        }

        let payload: { filename?: string } = {}
        if (typeof init?.body === 'string' && init.body.trim()) {
          try {
            payload = JSON.parse(init.body) as { filename?: string }
          } catch {
            payload = {}
          }
        }
        const nextFilename = String(payload.filename || '').trim()
        if (!nextFilename) {
          return new Response(JSON.stringify({ error: { detail: 'filename is required.' } }), {
            status: 400,
            headers: { 'Content-Type': 'application/json' },
          })
        }

        const currentAsset = storyLibraryAssets[assetIndex]
        const updatedAsset: LibraryAssetRecord = {
          ...currentAsset,
          filename: nextFilename,
          kind: guessLibraryAssetKind(nextFilename),
        }
        storyLibraryAssets = storyLibraryAssets.map((asset, index) => (
          index === assetIndex ? updatedAsset : asset
        ))
        return new Response(JSON.stringify(updatedAsset), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        })
      }

      const accessMatch = path.match(/\/v1\/library\/assets\/([^/]+)\/access$/)
      if (accessMatch && requestMethod === 'PATCH') {
        const assetId = decodeURIComponent(accessMatch[1])
        const assetIndex = storyLibraryAssets.findIndex((asset) => asset.id === assetId)
        if (assetIndex < 0) {
          return new Response(JSON.stringify({ error: { detail: `Data asset '${assetId}' was not found.` } }), {
            status: 404,
            headers: { 'Content-Type': 'application/json' },
          })
        }

        let payload: { collaborator_user_ids?: string[]; collaborator_names?: string[] } = {}
        if (typeof init?.body === 'string' && init.body.trim()) {
          try {
            payload = JSON.parse(init.body) as { collaborator_user_ids?: string[]; collaborator_names?: string[] }
          } catch {
            payload = {}
          }
        }

        const currentAsset = storyLibraryAssets[assetIndex]
        const requestedIds = Array.isArray(payload.collaborator_user_ids)
          ? payload.collaborator_user_ids.map((value) => String(value || '').trim()).filter(Boolean)
          : []
        const requestedNames = Array.isArray(payload.collaborator_names)
          ? payload.collaborator_names.map((value) => String(value || '').trim()).filter(Boolean)
          : []
        const memberNameByUserId = new Map<string, string>()
        for (const member of currentAsset.shared_with || []) {
          const userId = String(member.user_id || '').trim()
          const name = String(member.name || '').trim()
          if (userId) {
            memberNameByUserId.set(userId, name || userId)
          }
        }
        for (const userId of currentAsset.shared_with_user_ids || []) {
          const cleanUserId = String(userId || '').trim()
          if (cleanUserId && !memberNameByUserId.has(cleanUserId)) {
            memberNameByUserId.set(cleanUserId, cleanUserId)
          }
        }
        const resolvedNameIds = requestedNames.map((name) => {
          const userId = nameToMockUserId(name)
          memberNameByUserId.set(userId, name)
          return userId
        })
        const nextIds = Array.from(
          new Set([
            ...requestedIds,
            ...resolvedNameIds,
          ]),
        ).filter((userId) => userId !== currentAsset.owner_user_id)
        const updatedAsset: LibraryAssetRecord = {
          ...currentAsset,
          shared_with_user_ids: nextIds,
          shared_with: nextIds.map((userId) => ({
            user_id: userId,
            name: memberNameByUserId.get(userId) || userId,
          })),
        }
        storyLibraryAssets = storyLibraryAssets.map((asset, index) => (
          index === assetIndex ? updatedAsset : asset
        ))
        return new Response(JSON.stringify(updatedAsset), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        })
      }

      const downloadMatch = path.match(/\/v1\/library\/assets\/([^/]+)\/download$/)
      if (downloadMatch && requestMethod === 'GET') {
        const assetId = decodeURIComponent(downloadMatch[1])
        const asset = storyLibraryAssets.find((item) => item.id === assetId)
        if (!asset) {
          return new Response(JSON.stringify({ error: { detail: `Data asset '${assetId}' was not found.` } }), {
            status: 404,
            headers: { 'Content-Type': 'application/json' },
          })
        }
        return new Response(`storybook-download-${asset.id}`, {
          status: 200,
          headers: {
            'Content-Type': asset.mime_type || 'application/octet-stream',
            'Content-Disposition': `attachment; filename="${asset.filename}"`,
          },
        })
      }

      return previousFetch(input, init)
    }

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
      window.fetch = previousFetch
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
      <MemoryRouter initialEntries={[fixture.initialRoute || '/workspaces']}>
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

export const DataLibrary: Story = {
  args: {
    fixture: dataLibraryFixture,
  },
}

export const DataLibraryWithCollaboratorsFullPage: Story = {
  args: {
    fixture: dataLibraryWithCollaboratorsFixture,
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

export const CollaboratorBannersPending: Story = {
  args: {
    fixture: collaboratorPendingOnlyFixture,
  },
}

export const CollaboratorBannersMixedStates: Story = {
  args: {
    fixture: collaboratorMixedStatesFixture,
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
