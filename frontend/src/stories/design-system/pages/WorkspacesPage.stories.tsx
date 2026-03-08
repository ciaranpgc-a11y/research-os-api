import { useEffect, useMemo, useState } from 'react'
import type { Meta, StoryObj } from '@storybook/react-vite'

import { pagesReviewToken } from '@/mocks/fixtures/pages-review'
import { WorkspacesPage } from '@/pages/workspaces-page'
import {
  type WorkspaceInboxMessageRecord,
  type WorkspaceInboxReadMap,
  useWorkspaceInboxStore,
} from '@/store/use-workspace-inbox-store'
import type {
  WorkspaceAuditLogEntry,
  WorkspaceAuthorRequest,
  WorkspaceInvitationSent,
  WorkspaceParticipant,
  WorkspaceRecord,
} from '@/store/use-workspace-store'
import { useWorkspaceStore } from '@/store/use-workspace-store'
import { StandaloneRouteShell } from '@/stories/pages-review/_helpers/page-review-shells'
import { seedPagesReviewState } from '@/stories/pages-review/_helpers/pages-review-fixtures'

const meta = {
  title: 'Design System / Pages / Workspaces',
  component: WorkspacesPage,
  parameters: {
    layout: 'fullscreen',
    withRouter: false,
  },
} satisfies Meta<typeof WorkspacesPage>

export default meta

type Story = StoryObj<typeof meta>
type StoryPerspective = 'owner' | 'editor' | 'reviewer' | 'viewer' | 'removed'
type StorySurface = 'library' | 'overview' | 'data' | 'members' | 'logs'

const STORY_USERS = {
  owner: {
    id: 'storybook-owner-user',
    name: 'Storybook User',
    firstName: 'Storybook',
    lastName: 'User',
  },
  editor: {
    id: 'storybook-editor-user',
    name: 'Storybook User',
    firstName: 'Storybook',
    lastName: 'User',
  },
  reviewer: {
    id: 'storybook-reviewer-user',
    name: 'Storybook User',
    firstName: 'Storybook',
    lastName: 'User',
  },
  viewer: {
    id: 'storybook-viewer-user',
    name: 'Storybook User',
    firstName: 'Storybook',
    lastName: 'User',
  },
  removed: {
    id: 'storybook-removed-user',
    name: 'Storybook User',
    firstName: 'Storybook',
    lastName: 'User',
  },
} as const

function participant(userId: string, name: string): WorkspaceParticipant {
  return { userId, name }
}

function storyAuditEntry(
  input: Partial<WorkspaceAuditLogEntry> & {
    id: string
    workspaceId: string
    message: string
    createdAt: string
  },
): WorkspaceAuditLogEntry {
  return {
    id: input.id,
    workspaceId: input.workspaceId,
    category: input.category || 'collaborator_changes',
    eventType: input.eventType || null,
    actorUserId: input.actorUserId || null,
    actorName: input.actorName || null,
    subjectUserId: input.subjectUserId || null,
    subjectName: input.subjectName || null,
    fromValue: input.fromValue || null,
    toValue: input.toValue || null,
    role: input.role || null,
    metadata: input.metadata || undefined,
    message: input.message,
    createdAt: input.createdAt,
  }
}

function storyInboxMessage(
  input: WorkspaceInboxMessageRecord,
): WorkspaceInboxMessageRecord {
  return { ...input }
}

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T
}

function seedStoryAuthUser(user: (typeof STORY_USERS)[StoryPerspective]) {
  window.sessionStorage.setItem('aawe-impact-session-token', pagesReviewToken)
  window.localStorage.setItem('aawe-impact-session-token', pagesReviewToken)
  window.sessionStorage.setItem('aawe-impact-session-role', 'user')
  window.localStorage.setItem('aawe-impact-session-role', 'user')
  const nextScopedUser = JSON.stringify({ id: user.id })
  window.localStorage.setItem('aawe_integrations_user_cache', nextScopedUser)
  window.localStorage.setItem(
    `aawe_profile_personal_details:${user.id}`,
    JSON.stringify({
      firstName: user.firstName,
      lastName: user.lastName,
      updatedAt: '2026-03-06T09:00:00Z',
    }),
  )
  window.dispatchEvent(new StorageEvent('storage', {
    key: 'aawe_integrations_user_cache',
    newValue: nextScopedUser,
  }))
  window.dispatchEvent(new Event('focus'))
}

function disableStoryRemoteHydration() {
  useWorkspaceStore.setState((state) => ({
    ...state,
    hydrateFromRemote: async () => {},
  }))
  useWorkspaceInboxStore.setState((state) => ({
    ...state,
    hydrateFromRemote: async () => {},
  }))
}

const perspectiveWorkspaceIds: Record<StoryPerspective, string> = {
  owner: 'hf-registry-owner',
  editor: 'echo-editor',
  reviewer: 'amyloid-reviewer',
  viewer: 'device-viewer',
  removed: 'legacy-removed',
}

const surfaceTabLabels: Record<Exclude<StorySurface, 'library'>, string> = {
  overview: 'Overview',
  data: 'Data',
  members: 'Members',
  logs: 'Logs',
}

function storySurfaceLabel(
  perspective: StoryPerspective,
  surface: Exclude<StorySurface, 'library'>,
): string {
  if (surface === 'logs' && perspective !== 'owner') {
    return 'History'
  }
  return surfaceTabLabels[surface]
}

const STORY_INITIAL_ENTRY =
  '/workspaces?view=workspaces&scope=all&filter=all&mode=table&sort=updatedAt&dir=desc'

function canViewStorySurface(perspective: StoryPerspective, surface: StorySurface): boolean {
  if (surface === 'library') {
    return true
  }
  if (surface === 'members') {
    return perspective === 'owner'
  }
  if (surface === 'logs') {
    return perspective !== 'removed'
  }
  return true
}

function storySurfaceRestrictionMessage(
  perspective: StoryPerspective,
  surface: StorySurface,
): string | null {
  if (surface === 'members' && perspective !== 'owner') {
    return 'Only owners can edit workspace team members.'
  }
  if (surface === 'logs' && perspective === 'removed') {
    return 'Removed team members no longer have access to workspace logs.'
  }
  return null
}

function storyRoleLabel(workspace: WorkspaceRecord | null): string {
  if (!workspace) {
    return 'Unknown'
  }
  const currentUserId = window.localStorage.getItem('aawe_integrations_user_cache')
  const parsedUserId = currentUserId ? JSON.parse(currentUserId)?.id : null
  if (workspace.ownerUserId === parsedUserId) {
    return 'Owner'
  }
  if (workspace.removedCollaborators?.some((participant) => participant.userId === parsedUserId)) {
    return 'Removed'
  }
  const role = parsedUserId ? workspace.collaboratorRoles?.[parsedUserId] : null
  if (role === 'editor') {
    return 'Editor'
  }
  if (role === 'reviewer') {
    return 'Reviewer'
  }
  if (role === 'viewer') {
    return 'Viewer'
  }
  return 'Unknown'
}

function storyAccessSummary(workspace: WorkspaceRecord | null): string {
  if (!workspace) {
    return 'Unknown context'
  }
  const segments = [storyRoleLabel(workspace)]
  if (workspace.ownerArchived) {
    segments.push('Locked')
  }
  if (workspace.archived) {
    segments.push('Archived for me')
  }
  const currentUserId = window.localStorage.getItem('aawe_integrations_user_cache')
  const parsedUserId = currentUserId ? JSON.parse(currentUserId)?.id : null
  const removed = workspace.removedCollaborators?.some((participant) => participant.userId === parsedUserId)
  const owner = workspace.ownerUserId === parsedUserId
  segments.push(removed || (workspace.ownerArchived && !owner) ? 'Read-only' : 'Editable')
  return segments.join(' · ')
}

function buildWorkspacesAccessMatrix(): WorkspaceRecord[] {
  return [
    {
      id: 'hf-registry-owner',
      name: 'HF Registry Manuscript',
      ownerName: STORY_USERS.owner.name,
      ownerUserId: STORY_USERS.owner.id,
      collaborators: [
        participant('a-patel', 'A. Patel'),
        participant('m-evans', 'M. Evans'),
        participant('d-clarke', 'D. Clarke'),
        participant('j-owens', 'J. Owens'),
      ],
      pendingCollaborators: [
        participant('r-khan', 'R. Khan'),
        participant('n-brooks', 'N. Brooks'),
      ],
      collaboratorRoles: {
        'a-patel': 'editor',
        'm-evans': 'reviewer',
        'd-clarke': 'viewer',
        'j-owens': 'viewer',
        't-price': 'viewer',
        'u-cole': 'reviewer',
      },
      pendingCollaboratorRoles: {
        'r-khan': 'viewer',
        'n-brooks': 'reviewer',
      },
      removedCollaborators: [
        participant('t-price', 'T. Price'),
        participant('u-cole', 'U. Cole'),
      ],
      version: '1.2',
      health: 'green',
      updatedAt: '2026-03-05T10:30:00Z',
      pinned: true,
      archived: false,
      ownerArchived: false,
      auditLogEntries: [
        storyAuditEntry({
          id: 'owner-audit-rename',
          workspaceId: 'hf-registry-owner',
          category: 'workspace_changes',
          eventType: 'workspace_renamed',
          actorUserId: STORY_USERS.owner.id,
          actorName: STORY_USERS.owner.name,
          subjectName: 'Workspace',
          fromValue: 'HF Registry Draft',
          toValue: 'HF Registry Manuscript',
          message: 'Workspace renamed from HF Registry Draft to HF Registry Manuscript by Storybook User (Owner).',
          createdAt: '2026-03-01T08:00:00Z',
        }),
        storyAuditEntry({
          id: 'owner-audit-a-patel-accepted',
          workspaceId: 'hf-registry-owner',
          category: 'invitation_decisions',
          eventType: 'invitation_accepted',
          actorUserId: 'a-patel',
          actorName: 'A. Patel',
          subjectUserId: 'a-patel',
          subjectName: 'A. Patel',
          fromValue: 'pending',
          toValue: 'accepted',
          role: 'editor',
          message: 'A. Patel collaborator invitation status switched from pending to accepted by A. Patel as editor.',
          createdAt: '2026-03-01T09:15:00Z',
        }),
        storyAuditEntry({
          id: 'owner-audit-m-evans-role',
          workspaceId: 'hf-registry-owner',
          category: 'collaborator_changes',
          eventType: 'member_role_changed',
          actorUserId: STORY_USERS.owner.id,
          actorName: STORY_USERS.owner.name,
          subjectUserId: 'm-evans',
          subjectName: 'M. Evans',
          fromValue: 'editor',
          toValue: 'reviewer',
          role: 'reviewer',
          message: 'M. Evans collaborator role switched from editor to reviewer by Storybook User (Owner).',
          createdAt: '2026-03-02T10:05:00Z',
        }),
        storyAuditEntry({
          id: 'owner-audit-lock',
          workspaceId: 'hf-registry-owner',
          category: 'workspace_changes',
          eventType: 'workspace_locked',
          actorUserId: STORY_USERS.owner.id,
          actorName: STORY_USERS.owner.name,
          subjectName: 'Workspace',
          fromValue: 'unlocked',
          toValue: 'locked',
          message: 'HF Registry Manuscript workspace lock switched from unlocked to locked by Storybook User (Owner).',
          createdAt: '2026-03-03T08:40:00Z',
        }),
        storyAuditEntry({
          id: 'owner-audit-unlock',
          workspaceId: 'hf-registry-owner',
          category: 'workspace_changes',
          eventType: 'workspace_unlocked',
          actorUserId: STORY_USERS.owner.id,
          actorName: STORY_USERS.owner.name,
          subjectName: 'Workspace',
          fromValue: 'locked',
          toValue: 'unlocked',
          message: 'HF Registry Manuscript workspace lock switched from locked to unlocked by Storybook User (Owner).',
          createdAt: '2026-03-03T09:25:00Z',
        }),
        storyAuditEntry({
          id: 'owner-audit-remove',
          workspaceId: 'hf-registry-owner',
          category: 'collaborator_changes',
          eventType: 'member_removed',
          actorUserId: STORY_USERS.owner.id,
          actorName: STORY_USERS.owner.name,
          subjectUserId: 't-price',
          subjectName: 'T. Price',
          fromValue: 'active',
          toValue: 'removed',
          role: 'viewer',
          message: 'T. Price collaborator status switched from active to removed by Storybook User (Owner).',
          createdAt: '2026-03-04T16:40:00Z',
        }),
        storyAuditEntry({
          id: 'owner-audit-r-khan-invite',
          workspaceId: 'hf-registry-owner',
          category: 'invitation_decisions',
          eventType: 'member_invited',
          actorUserId: STORY_USERS.owner.id,
          actorName: STORY_USERS.owner.name,
          subjectUserId: 'r-khan',
          subjectName: 'R. Khan',
          fromValue: 'none',
          toValue: 'pending',
          role: 'viewer',
          message: 'R. Khan collaborator status switched from none to pending by Storybook User (Owner).',
          createdAt: '2026-03-04T11:20:00Z',
        }),
        storyAuditEntry({
          id: 'owner-audit-n-brooks-invite',
          workspaceId: 'hf-registry-owner',
          category: 'invitation_decisions',
          eventType: 'member_invited',
          actorUserId: STORY_USERS.owner.id,
          actorName: STORY_USERS.owner.name,
          subjectUserId: 'n-brooks',
          subjectName: 'N. Brooks',
          fromValue: 'none',
          toValue: 'pending',
          role: 'viewer',
          message: 'N. Brooks collaborator status switched from none to pending by Storybook User (Owner).',
          createdAt: '2026-03-05T08:10:00Z',
        }),
        storyAuditEntry({
          id: 'owner-audit-n-brooks-role',
          workspaceId: 'hf-registry-owner',
          category: 'collaborator_changes',
          eventType: 'pending_role_changed',
          actorUserId: STORY_USERS.owner.id,
          actorName: STORY_USERS.owner.name,
          subjectUserId: 'n-brooks',
          subjectName: 'N. Brooks',
          fromValue: 'viewer',
          toValue: 'reviewer',
          role: 'reviewer',
          message: 'N. Brooks pending collaborator role switched from viewer to reviewer by Storybook User (Owner).',
          createdAt: '2026-03-05T08:12:00Z',
        }),
      ],
    },
    {
      id: 'echo-editor',
      name: 'Echo AI Validation',
      ownerName: 'Eleanor Hart',
      ownerUserId: 'eleanor-hart',
      collaborators: [participant(STORY_USERS.editor.id, STORY_USERS.editor.name)],
      pendingCollaborators: [],
      collaboratorRoles: {
        [STORY_USERS.editor.id]: 'editor',
      },
      pendingCollaboratorRoles: {},
      removedCollaborators: [],
      version: '0.8',
      health: 'green',
      updatedAt: '2026-03-04T16:20:00Z',
      pinned: true,
      archived: false,
      ownerArchived: false,
      auditLogEntries: [
        storyAuditEntry({
          id: 'editor-audit-accepted',
          workspaceId: 'echo-editor',
          category: 'invitation_decisions',
          eventType: 'invitation_accepted',
          actorUserId: STORY_USERS.editor.id,
          actorName: STORY_USERS.editor.name,
          subjectUserId: STORY_USERS.editor.id,
          subjectName: STORY_USERS.editor.name,
          fromValue: 'pending',
          toValue: 'accepted',
          role: 'editor',
          message: 'Storybook User collaborator invitation status switched from pending to accepted by Storybook User as editor.',
          createdAt: '2026-03-04T10:00:00Z',
        }),
        storyAuditEntry({
          id: 'editor-audit-rename',
          workspaceId: 'echo-editor',
          category: 'workspace_changes',
          eventType: 'workspace_renamed',
          actorUserId: 'eleanor-hart',
          actorName: 'Eleanor Hart',
          subjectName: 'Workspace',
          fromValue: 'Echo Validation',
          toValue: 'Echo AI Validation',
          message: 'Workspace renamed from Echo Validation to Echo AI Validation by Eleanor Hart.',
          createdAt: '2026-03-04T12:35:00Z',
        }),
        storyAuditEntry({
          id: 'editor-audit-role',
          workspaceId: 'echo-editor',
          category: 'collaborator_changes',
          eventType: 'member_role_changed',
          actorUserId: 'eleanor-hart',
          actorName: 'Eleanor Hart',
          subjectUserId: STORY_USERS.editor.id,
          subjectName: STORY_USERS.editor.name,
          fromValue: 'reviewer',
          toValue: 'editor',
          role: 'editor',
          message: 'Storybook User collaborator role switched from reviewer to editor by Eleanor Hart.',
          createdAt: '2026-03-04T14:10:00Z',
        }),
      ],
    },
    {
      id: 'amyloid-reviewer',
      name: 'Amyloid Imaging Review',
      ownerName: 'Noah Bennett',
      ownerUserId: 'noah-bennett',
      collaborators: [participant(STORY_USERS.reviewer.id, STORY_USERS.reviewer.name)],
      pendingCollaborators: [],
      collaboratorRoles: {
        [STORY_USERS.reviewer.id]: 'reviewer',
      },
      pendingCollaboratorRoles: {},
      removedCollaborators: [],
      version: '1.0',
      health: 'amber',
      updatedAt: '2026-03-03T14:15:00Z',
      pinned: false,
      archived: true,
      ownerArchived: true,
      auditLogEntries: [
        storyAuditEntry({
          id: 'reviewer-audit-accepted',
          workspaceId: 'amyloid-reviewer',
          category: 'invitation_decisions',
          eventType: 'invitation_accepted',
          actorUserId: STORY_USERS.reviewer.id,
          actorName: STORY_USERS.reviewer.name,
          subjectUserId: STORY_USERS.reviewer.id,
          subjectName: STORY_USERS.reviewer.name,
          fromValue: 'pending',
          toValue: 'accepted',
          role: 'reviewer',
          message: 'Storybook User collaborator invitation status switched from pending to accepted by Storybook User as reviewer.',
          createdAt: '2026-03-03T09:25:00Z',
        }),
        storyAuditEntry({
          id: 'reviewer-audit-lock',
          workspaceId: 'amyloid-reviewer',
          category: 'workspace_changes',
          eventType: 'workspace_locked',
          actorUserId: 'noah-bennett',
          actorName: 'Noah Bennett',
          subjectName: 'Workspace',
          fromValue: 'unlocked',
          toValue: 'locked',
          message: 'Amyloid Imaging Review workspace lock switched from unlocked to locked by Noah Bennett.',
          createdAt: '2026-03-03T11:10:00Z',
        }),
        storyAuditEntry({
          id: 'reviewer-audit-pending',
          workspaceId: 'amyloid-reviewer',
          category: 'invitation_decisions',
          eventType: 'member_invited',
          actorUserId: 'noah-bennett',
          actorName: 'Noah Bennett',
          subjectUserId: 's-roy',
          subjectName: 'S. Roy',
          fromValue: 'none',
          toValue: 'pending',
          role: 'viewer',
          message: 'S. Roy collaborator status switched from none to pending by Noah Bennett.',
          createdAt: '2026-03-03T12:45:00Z',
        }),
      ],
    },
    {
      id: 'device-viewer',
      name: 'Device Substudy Draft',
      ownerName: 'Priya Shah',
      ownerUserId: 'priya-shah',
      collaborators: [participant(STORY_USERS.viewer.id, STORY_USERS.viewer.name)],
      pendingCollaborators: [],
      collaboratorRoles: {
        [STORY_USERS.viewer.id]: 'viewer',
      },
      pendingCollaboratorRoles: {},
      removedCollaborators: [],
      version: '0.5',
      health: 'amber',
      updatedAt: '2026-03-02T11:40:00Z',
      pinned: false,
      archived: true,
      ownerArchived: false,
      auditLogEntries: [
        storyAuditEntry({
          id: 'viewer-audit-accepted',
          workspaceId: 'device-viewer',
          category: 'invitation_decisions',
          eventType: 'invitation_accepted',
          actorUserId: STORY_USERS.viewer.id,
          actorName: STORY_USERS.viewer.name,
          subjectUserId: STORY_USERS.viewer.id,
          subjectName: STORY_USERS.viewer.name,
          fromValue: 'pending',
          toValue: 'accepted',
          role: 'viewer',
          message: 'Storybook User collaborator invitation status switched from pending to accepted by Storybook User as viewer.',
          createdAt: '2026-03-02T08:50:00Z',
        }),
        storyAuditEntry({
          id: 'viewer-audit-rename',
          workspaceId: 'device-viewer',
          category: 'workspace_changes',
          eventType: 'workspace_renamed',
          actorUserId: 'priya-shah',
          actorName: 'Priya Shah',
          subjectName: 'Workspace',
          fromValue: 'Device Feasibility Draft',
          toValue: 'Device Substudy Draft',
          message: 'Workspace renamed from Device Feasibility Draft to Device Substudy Draft by Priya Shah.',
          createdAt: '2026-03-02T09:30:00Z',
        }),
      ],
    },
    {
      id: 'legacy-removed',
      name: 'Legacy Cardio Registry',
      ownerName: 'Omar Chen',
      ownerUserId: 'omar-chen',
      collaborators: [participant(STORY_USERS.removed.id, STORY_USERS.removed.name)],
      pendingCollaborators: [],
      collaboratorRoles: {
        [STORY_USERS.removed.id]: 'viewer',
      },
      pendingCollaboratorRoles: {},
      removedCollaborators: [participant(STORY_USERS.removed.id, STORY_USERS.removed.name)],
      version: '0.6',
      health: 'amber',
      updatedAt: '2026-03-01T17:20:00Z',
      pinned: false,
      archived: true,
      ownerArchived: false,
      auditLogEntries: [
        storyAuditEntry({
          id: 'removed-audit-accepted',
          workspaceId: 'legacy-removed',
          category: 'invitation_decisions',
          eventType: 'invitation_accepted',
          actorUserId: STORY_USERS.removed.id,
          actorName: STORY_USERS.removed.name,
          subjectUserId: STORY_USERS.removed.id,
          subjectName: STORY_USERS.removed.name,
          fromValue: 'pending',
          toValue: 'accepted',
          role: 'viewer',
          message: 'Storybook User collaborator invitation status switched from pending to accepted by Storybook User as viewer.',
          createdAt: '2026-03-01T09:10:00Z',
        }),
        storyAuditEntry({
          id: 'removed-audit-remove',
          workspaceId: 'legacy-removed',
          category: 'collaborator_changes',
          eventType: 'member_removed',
          actorUserId: 'omar-chen',
          actorName: 'Omar Chen',
          subjectUserId: STORY_USERS.removed.id,
          subjectName: STORY_USERS.removed.name,
          fromValue: 'active',
          toValue: 'removed',
          role: 'viewer',
          message: 'Storybook User collaborator status switched from active to removed by Omar Chen.',
          createdAt: '2026-03-01T12:10:00Z',
        }),
      ],
    },
  ]
}

const workspaceInvitationsSent: WorkspaceInvitationSent[] = [
  {
    id: 'invite-r-khan',
    workspaceId: 'hf-registry-owner',
    workspaceName: 'HF Registry Manuscript',
    inviteeName: 'R. Khan',
    inviteeUserId: 'r-khan',
    role: 'viewer',
    invitedAt: '2026-03-04T11:20:00Z',
    status: 'pending',
  },
  {
    id: 'invite-n-brooks',
    workspaceId: 'hf-registry-owner',
    workspaceName: 'HF Registry Manuscript',
    inviteeName: 'N. Brooks',
    inviteeUserId: 'n-brooks',
    role: 'reviewer',
    invitedAt: '2026-03-05T08:10:00Z',
    status: 'pending',
  },
]

const workspaceAuthorRequests: WorkspaceAuthorRequest[] = [
  {
    id: 'request-workspace-stroke',
    workspaceId: 'incoming-workspace-stroke',
    workspaceName: 'Stroke Outcomes Draft',
    authorName: 'Priya Nair',
    authorUserId: 'priya-nair',
    invitationType: 'workspace',
    collaboratorRole: 'editor',
    invitedAt: '2026-03-05T14:10:00Z',
  },
  {
    id: 'request-data-biobank',
    workspaceId: 'incoming-data-biobank',
    workspaceName: 'UK Biobank ECG dataset',
    authorName: 'Marta Solis',
    authorUserId: 'marta-solis',
    invitationType: 'data',
    collaboratorRole: 'reviewer',
    invitedAt: '2026-03-05T11:35:00Z',
  },
  {
    id: 'request-workspace-imaging',
    workspaceId: 'incoming-workspace-imaging',
    workspaceName: 'PET Imaging Response Manuscript',
    authorName: 'Jonas Weber',
    authorUserId: 'jonas-weber',
    invitationType: 'workspace',
    collaboratorRole: 'viewer',
    invitedAt: '2026-03-04T16:20:00Z',
  },
  {
    id: 'request-data-corelab',
    workspaceId: 'incoming-data-corelab',
    workspaceName: 'Core lab echo adjudication pack',
    authorName: 'Leah Morgan',
    authorUserId: 'leah-morgan',
    invitationType: 'data',
    collaboratorRole: 'editor',
    invitedAt: '2026-03-03T09:05:00Z',
  },
]

function buildStoryInboxMessages(): WorkspaceInboxMessageRecord[] {
  return [
    storyInboxMessage({
      id: 'msg-owner-1',
      workspaceId: 'hf-registry-owner',
      senderName: 'A. Patel',
      encryptedBody: 'x'.repeat(152),
      iv: 'iv'.repeat(12),
      createdAt: '2026-03-05T09:40:00Z',
    }),
    storyInboxMessage({
      id: 'msg-owner-2',
      workspaceId: 'hf-registry-owner',
      senderName: 'Storybook User',
      encryptedBody: 'x'.repeat(188),
      iv: 'iv'.repeat(12),
      createdAt: '2026-03-05T09:52:00Z',
    }),
    storyInboxMessage({
      id: 'msg-owner-3',
      workspaceId: 'hf-registry-owner',
      senderName: 'M. Evans',
      encryptedBody: 'x'.repeat(210),
      iv: 'iv'.repeat(12),
      createdAt: '2026-03-05T10:18:00Z',
    }),
    storyInboxMessage({
      id: 'msg-owner-4',
      workspaceId: 'hf-registry-owner',
      senderName: 'Storybook User',
      encryptedBody: 'x'.repeat(132),
      iv: 'iv'.repeat(12),
      createdAt: '2026-03-05T10:26:00Z',
    }),
    storyInboxMessage({
      id: 'msg-editor-1',
      workspaceId: 'echo-editor',
      senderName: 'Eleanor Hart',
      encryptedBody: 'x'.repeat(118),
      iv: 'iv'.repeat(12),
      createdAt: '2026-03-04T12:20:00Z',
    }),
    storyInboxMessage({
      id: 'msg-editor-2',
      workspaceId: 'echo-editor',
      senderName: 'Storybook User',
      encryptedBody: 'x'.repeat(164),
      iv: 'iv'.repeat(12),
      createdAt: '2026-03-04T13:05:00Z',
    }),
    storyInboxMessage({
      id: 'msg-reviewer-1',
      workspaceId: 'amyloid-reviewer',
      senderName: 'Noah Bennett',
      encryptedBody: 'x'.repeat(144),
      iv: 'iv'.repeat(12),
      createdAt: '2026-03-03T12:05:00Z',
    }),
    storyInboxMessage({
      id: 'msg-reviewer-2',
      workspaceId: 'amyloid-reviewer',
      senderName: 'Storybook User',
      encryptedBody: 'x'.repeat(96),
      iv: 'iv'.repeat(12),
      createdAt: '2026-03-03T12:16:00Z',
    }),
    storyInboxMessage({
      id: 'msg-viewer-1',
      workspaceId: 'device-viewer',
      senderName: 'Priya Shah',
      encryptedBody: 'x'.repeat(128),
      iv: 'iv'.repeat(12),
      createdAt: '2026-03-02T09:45:00Z',
    }),
  ]
}

function buildStoryInboxReads(): WorkspaceInboxReadMap {
  return {
    'hf-registry-owner': {
      'storybook user': '2026-03-05T09:45:00Z',
    },
    'echo-editor': {
      'storybook user': '2026-03-04T12:25:00Z',
    },
    'amyloid-reviewer': {
      'storybook user': '2026-03-03T12:00:00Z',
    },
    'device-viewer': {
      'storybook user': '2026-03-02T09:30:00Z',
    },
  }
}

function WorkspaceAccessModelCanvas() {
  const [perspective, setPerspective] = useState<StoryPerspective>('owner')
  const [surface, setSurface] = useState<StorySurface>('library')
  const [resetVersion, setResetVersion] = useState(0)
  const currentStoryUser = STORY_USERS[perspective]
  const selectedWorkspaceId = perspectiveWorkspaceIds[perspective]
  const canViewSelectedSurface = canViewStorySurface(perspective, surface)
  const surfaceRestrictionMessage = storySurfaceRestrictionMessage(perspective, surface)
  const selectedWorkspaceName = useMemo(
    () => buildWorkspacesAccessMatrix().find((workspace) => workspace.id === selectedWorkspaceId)?.name || '',
    [selectedWorkspaceId],
  )
  const selectedWorkspace = useWorkspaceStore(
    (state) => state.workspaces.find((workspace) => workspace.id === selectedWorkspaceId) || null,
  )
  const accessSummary = useMemo(
    () => storyAccessSummary(selectedWorkspace),
    [selectedWorkspace],
  )
  const shellKey = `${resetVersion}-${perspective}`

  useEffect(() => {
    seedPagesReviewState({
      workspaces: clone(buildWorkspacesAccessMatrix()),
      activeWorkspaceId: perspectiveWorkspaceIds.owner,
      authorRequests: clone(workspaceAuthorRequests),
      invitationsSent: clone(workspaceInvitationsSent),
    })
    useWorkspaceInboxStore.setState((state) => ({
      ...state,
      messages: clone(buildStoryInboxMessages()),
      reads: clone(buildStoryInboxReads()),
    }))
    seedStoryAuthUser(STORY_USERS.owner)
    disableStoryRemoteHydration()
  }, [resetVersion])

  useEffect(() => {
    seedStoryAuthUser(currentStoryUser)
  }, [currentStoryUser])

  useEffect(() => {
    useWorkspaceStore.getState().setActiveWorkspaceId(selectedWorkspaceId)
  }, [selectedWorkspaceId])

  useEffect(() => {
    if (!canViewStorySurface(perspective, surface)) {
      setSurface('overview')
    }
  }, [perspective, surface])

  useEffect(() => {
    if (surface === 'library' || !canViewSelectedSurface) {
      return
    }

    const openTimer = window.setTimeout(() => {
      const workspaceRow = Array.from(
        document.querySelectorAll<HTMLElement>('[data-house-table-id="workspaces-table"] tbody tr'),
      ).find((row) => row.textContent?.includes(selectedWorkspaceName))

      workspaceRow?.click()

      if (surface === 'overview') {
        return
      }

      const tabTimer = window.setTimeout(() => {
        const tabLabel = storySurfaceLabel(perspective, surface)
        const tabButton = Array.from(document.querySelectorAll<HTMLButtonElement>('button')).find(
          (button) => button.textContent?.trim() === tabLabel,
        )
        if (tabButton && !tabButton.disabled) {
          tabButton.click()
        }
      }, 60)

      return () => window.clearTimeout(tabTimer)
    }, 80)

    return () => window.clearTimeout(openTimer)
  }, [canViewSelectedSurface, selectedWorkspaceName, surface, shellKey])

  return (
    <div className="relative min-h-screen bg-background">
      <StandaloneRouteShell
        key={shellKey}
        initialEntry={STORY_INITIAL_ENTRY}
        path="/workspaces"
        element={<WorkspacesPage />}
      />
      <div className="pointer-events-none fixed inset-x-0 bottom-4 z-50 flex justify-center px-4">
        <div className="pointer-events-auto flex flex-wrap items-center gap-3 rounded-2xl border border-[hsl(var(--border))] bg-[hsl(var(--background))]/95 px-4 py-3 shadow-[0_18px_40px_rgba(15,23,42,0.16)] backdrop-blur">
          <div className="flex items-center gap-2">
            <span className="text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">
              Perspective
            </span>
            <div className="inline-flex items-center gap-1 rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--muted))]/60 p-1">
              {([
                ['owner', 'Owner'],
                ['editor', 'Editor'],
                ['reviewer', 'Reviewer'],
                ['viewer', 'Viewer'],
                ['removed', 'Removed'],
              ] as const).map(([value, label]) => (
                <button
                  key={value}
                  type="button"
                  className={[
                    'rounded-lg px-3 py-1.5 text-sm font-medium transition',
                    perspective === value
                      ? 'bg-[hsl(var(--tone-accent-600))] text-white shadow-sm'
                      : 'text-[hsl(var(--muted-foreground))] hover:bg-[hsl(var(--background))]',
                  ].join(' ')}
                  onClick={() => setPerspective(value)}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">
              Surface
            </span>
            <div className="inline-flex items-center gap-1 rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--muted))]/60 p-1">
              {([
                ['library', 'Library'],
                ['overview', 'Overview'],
                ['data', 'Data'],
                ['members', 'Members'],
                ['logs', storySurfaceLabel(perspective, 'logs')],
              ] as const).map(([value, label]) => {
                  const enabled = canViewStorySurface(perspective, value)
                  const restrictionMessage = storySurfaceRestrictionMessage(perspective, value)
                  return (
                    <button
                      key={value}
                      type="button"
                      className={[
                        'rounded-lg px-3 py-1.5 text-sm font-medium transition',
                        surface === value
                          ? 'bg-[hsl(var(--tone-positive-600))] text-white shadow-sm'
                          : enabled
                            ? 'text-[hsl(var(--muted-foreground))] hover:bg-[hsl(var(--background))]'
                            : 'cursor-not-allowed text-[hsl(var(--muted-foreground))]/45',
                      ].join(' ')}
                      onClick={() => {
                        if (enabled) {
                          setSurface(value)
                        }
                      }}
                      aria-disabled={!enabled}
                      title={restrictionMessage || undefined}
                    >
                      {label}
                    </button>
                  )
                })}
            </div>
          </div>
          <button
            type="button"
            className="rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--background))] px-3 py-1.5 text-sm font-medium text-[hsl(var(--foreground))] transition hover:bg-[hsl(var(--muted))]"
            onClick={() => setResetVersion((current) => current + 1)}
          >
            Reset scenario
          </button>
          <span className="rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--muted))]/60 px-3 py-1.5 text-sm font-medium text-[hsl(var(--foreground))]">
            {accessSummary}
          </span>
          {surfaceRestrictionMessage ? (
            <p className="text-xs text-[hsl(var(--muted-foreground))]">{surfaceRestrictionMessage}</p>
          ) : null}
        </div>
      </div>
    </div>
  )
}

export const WorkspaceAccessModel: Story = {
  parameters: {
    docs: {
      description: {
        story:
          'Five populated workspaces for the same signed-in user, plus an in-canvas switcher to inspect library and drilldown states from owner, editor, reviewer, viewer, and removed perspectives.',
      },
    },
  },
  render: () => <WorkspaceAccessModelCanvas />,
}
