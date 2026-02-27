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
      auditLogEntries: [
        {
          id: 'audit-collab-01',
          workspaceId: 'hf-registry',
          category: 'collaborator_changes',
          message: 'M. Evans collaborator status switched from active to removed by Ciaran Clarke (Owner). Role set to reviewer.',
          createdAt: '2026-02-25T16:20:00Z',
        },
        {
          id: 'audit-collab-02',
          workspaceId: 'hf-registry',
          category: 'invitation_decisions',
          message: 'R. Khan collaborator invitation status switched from none to pending by Ciaran Clarke (Owner) as reviewer.',
          createdAt: '2026-02-25T17:20:00Z',
        },
      ],
    },
  ],
  activeWorkspaceId: 'hf-registry',
  authorRequests: [],
  invitationsSent: [
    {
      id: 'invite-collab-01',
      workspaceId: 'hf-registry',
      workspaceName: 'HF Registry Manuscript',
      inviteeName: 'R. Khan',
      role: 'reviewer',
      invitedAt: '2026-02-25T17:20:00Z',
      status: 'pending',
    },
  ],
  inboxMessages: [
    { workspaceId: 'hf-registry', senderName: 'A. Patel', body: 'Can we reopen collaborator M. Evans next week?' },
    { workspaceId: 'hf-registry', senderName: 'L. Santos', body: 'I completed the supplementary table cleanup.' },
  ],
  inboxReads: [
    { workspaceId: 'hf-registry', readerName: 'Ciaran Clarke', readAt: '2026-02-24T18:00:00Z' },
  ],
  libraryAssets: defaultLibraryAssets,
}

const restoreRoleRequiredFixture: WorkspacesPageFixture = {
  workspaces: [
    {
      id: 'restore-role-demo',
      name: 'Restore Role Demo',
      ownerName: 'Ciaran Clarke',
      collaborators: ['A. Patel', 'M. Evans', 'L. Santos'],
      removedCollaborators: ['M. Evans'],
      pendingCollaborators: [],
      collaboratorRoles: {
        'A. Patel': 'editor',
        'M. Evans': 'reviewer',
        'L. Santos': 'viewer',
      },
      pendingCollaboratorRoles: {},
      version: '0.9',
      health: 'amber',
      updatedAt: '2026-02-27T09:15:00Z',
      pinned: true,
      archived: false,
      auditLogEntries: [
        {
          id: 'audit-restore-01',
          workspaceId: 'restore-role-demo',
          category: 'collaborator_changes',
          message: 'M. Evans collaborator status switched from active to removed by Ciaran Clarke (Owner). Role set to reviewer.',
          createdAt: '2026-02-27T08:55:00Z',
        },
      ],
    },
  ],
  activeWorkspaceId: 'restore-role-demo',
  authorRequests: [],
  invitationsSent: [],
  inboxMessages: [
    { workspaceId: 'restore-role-demo', senderName: 'A. Patel', body: 'Role matrix has been updated for final review.' },
  ],
  inboxReads: [
    { workspaceId: 'restore-role-demo', readerName: 'Ciaran Clarke', readAt: '2026-02-27T09:00:00Z' },
  ],
  libraryAssets: defaultLibraryAssets,
}

const auditConversationFixture: WorkspacesPageFixture = {
  workspaces: [
    {
      id: 'audit-demo',
      name: 'Audit Log Demo',
      ownerName: 'Ciaran Clarke',
      collaborators: ['A. Patel'],
      removedCollaborators: [],
      pendingCollaborators: ['R. Khan'],
      collaboratorRoles: {
        'A. Patel': 'editor',
      },
      pendingCollaboratorRoles: {
        'R. Khan': 'reviewer',
      },
      version: '1.0',
      health: 'green',
      updatedAt: '2026-02-27T10:30:00Z',
      pinned: true,
      archived: false,
      auditLogEntries: [
        {
          id: 'audit-demo-01',
          workspaceId: 'audit-demo',
          category: 'invitation_decisions',
          message: 'R. Khan collaborator invitation status switched from none to pending by Ciaran Clarke (Owner) as reviewer.',
          createdAt: '2026-02-27T09:10:00Z',
        },
        {
          id: 'audit-demo-02',
          workspaceId: 'audit-demo',
          category: 'collaborator_changes',
          message: 'Inbox message logged: id msg-20260227-01, sender A. Patel, created_at 2026-02-27T09:12:00Z, ciphertext_length 612, iv_length 24.',
          createdAt: '2026-02-27T09:12:01Z',
        },
        {
          id: 'audit-demo-03',
          workspaceId: 'audit-demo',
          category: 'collaborator_changes',
          message: 'Inbox message logged: id msg-20260227-02, sender Ciaran Clarke, created_at 2026-02-27T09:21:00Z, ciphertext_length 478, iv_length 24.',
          createdAt: '2026-02-27T09:21:01Z',
        },
      ],
    },
  ],
  activeWorkspaceId: 'audit-demo',
  authorRequests: [],
  invitationsSent: [
    {
      id: 'invite-audit-01',
      workspaceId: 'audit-demo',
      workspaceName: 'Audit Log Demo',
      inviteeName: 'R. Khan',
      role: 'reviewer',
      invitedAt: '2026-02-27T09:10:00Z',
      status: 'pending',
    },
  ],
  inboxMessages: [
    { workspaceId: 'audit-demo', senderName: 'A. Patel', body: 'Results table is complete.' },
    { workspaceId: 'audit-demo', senderName: 'Ciaran Clarke', body: 'Great, I will approve this revision.' },
  ],
  inboxReads: [
    { workspaceId: 'audit-demo', readerName: 'Ciaran Clarke', readAt: '2026-02-27T09:30:00Z' },
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

export const CollaboratorAccessAndRoles: Story = {
  args: {
    fixture: collaboratorStateFixture,
  },
}

export const RestoreRequiresRoleSelection: Story = {
  args: {
    fixture: restoreRoleRequiredFixture,
  },
}

export const AuditLogsConversationAndAccess: Story = {
  args: {
    fixture: auditConversationFixture,
  },
}

export const CollaboratorReadOnlyView: Story = {
  args: {
    fixture: collaboratorReadOnlyFixture,
  },
}
