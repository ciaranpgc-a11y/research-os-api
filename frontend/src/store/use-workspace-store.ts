import { create } from 'zustand'

import {
  WORKSPACE_OWNER_REQUIRED_MESSAGE,
  readWorkspaceOwnerNameFromProfile,
} from '@/lib/workspace-owner'

export type WorkspaceHealth = 'green' | 'amber' | 'red'
export type WorkspaceInvitationStatus = 'pending' | 'accepted' | 'declined'

export type WorkspaceRecord = {
  id: string
  name: string
  ownerName: string
  collaborators: string[]
  version: string
  health: WorkspaceHealth
  updatedAt: string
  pinned: boolean
  archived: boolean
}

export type WorkspaceAuthorRequest = {
  id: string
  workspaceId: string
  workspaceName: string
  authorName: string
  invitedAt: string
}

export type WorkspaceInvitationSent = {
  id: string
  workspaceId: string
  workspaceName: string
  inviteeName: string
  invitedAt: string
  status: WorkspaceInvitationStatus
}

type WorkspacePatch = Partial<
  Pick<
    WorkspaceRecord,
    'name' | 'ownerName' | 'collaborators' | 'health' | 'version' | 'updatedAt' | 'pinned' | 'archived'
  >
>

type WorkspaceStore = {
  workspaces: WorkspaceRecord[]
  activeWorkspaceId: string | null
  authorRequests: WorkspaceAuthorRequest[]
  invitationsSent: WorkspaceInvitationSent[]
  setActiveWorkspaceId: (workspaceId: string | null) => void
  ensureWorkspace: (workspaceId: string) => void
  createWorkspace: (name?: string) => WorkspaceRecord
  updateWorkspace: (workspaceId: string, patch: WorkspacePatch) => void
  deleteWorkspace: (workspaceId: string) => void
  sendWorkspaceInvitation: (workspaceId: string, inviteeName: string) => WorkspaceInvitationSent | null
  acceptAuthorRequest: (requestId: string) => WorkspaceRecord | null
  declineAuthorRequest: (requestId: string) => void
}

const WORKSPACES_STORAGE_KEY = 'aawe-workspaces'
const ACTIVE_WORKSPACE_STORAGE_KEY = 'aawe-active-workspace-id'
const AUTHOR_REQUESTS_STORAGE_KEY = 'aawe-workspace-author-requests'
const INVITATIONS_SENT_STORAGE_KEY = 'aawe-workspace-invitations-sent'

function trimValue(value: string | null | undefined): string {
  return (value || '').trim()
}

function normalizeName(value: string | null | undefined): string {
  return trimValue(value).replace(/\s+/g, ' ')
}

function normalizeCollaborators(values: unknown): string[] {
  const source = Array.isArray(values) ? values : []
  const seen = new Set<string>()
  const output: string[] = []
  for (const value of source) {
    const clean = normalizeName(String(value || ''))
    if (!clean) {
      continue
    }
    const key = clean.toLowerCase()
    if (seen.has(key)) {
      continue
    }
    seen.add(key)
    output.push(clean)
  }
  return output
}

function nowIso(): string {
  return new Date().toISOString()
}

function buildId(prefix: string): string {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
}

function defaultOwnerName(): string {
  return readWorkspaceOwnerNameFromProfile() || 'Not set'
}

function currentProfileName(): string {
  return readWorkspaceOwnerNameFromProfile() || ''
}

function currentCollaboratorName(): string {
  return readWorkspaceOwnerNameFromProfile() || 'You'
}

function defaultWorkspaces(): WorkspaceRecord[] {
  return [
    {
      id: 'hf-registry',
      name: 'HF Registry Manuscript',
      ownerName: defaultOwnerName(),
      collaborators: [],
      version: '0.1',
      health: 'amber',
      updatedAt: nowIso(),
      pinned: true,
      archived: false,
    },
  ]
}

function defaultAuthorRequests(): WorkspaceAuthorRequest[] {
  return []
}

function defaultInvitationsSent(): WorkspaceInvitationSent[] {
  return []
}

function readStoredWorkspaces(): WorkspaceRecord[] {
  if (typeof window === 'undefined') {
    return defaultWorkspaces()
  }
  const fallbackOwnerName = defaultOwnerName()
  const raw = window.localStorage.getItem(WORKSPACES_STORAGE_KEY)
  if (!raw) {
    return defaultWorkspaces()
  }
  try {
    const parsed = JSON.parse(raw) as Array<Partial<WorkspaceRecord>>
    if (!Array.isArray(parsed) || parsed.length === 0) {
      return defaultWorkspaces()
    }
    return parsed.map((workspace) => ({
      id: trimValue(workspace.id) || `workspace-${Date.now().toString(36)}`,
      name: normalizeName(workspace.name) || 'Workspace',
      ownerName: normalizeName(workspace.ownerName) || fallbackOwnerName,
      collaborators: normalizeCollaborators((workspace as { collaborators?: unknown }).collaborators),
      version: trimValue(workspace.version) || '0.1',
      health:
        workspace.health === 'green' || workspace.health === 'amber' || workspace.health === 'red'
          ? workspace.health
          : 'amber',
      updatedAt: trimValue(workspace.updatedAt) || nowIso(),
      pinned: Boolean(workspace.pinned),
      archived: Boolean(workspace.archived),
    }))
  } catch {
    return defaultWorkspaces()
  }
}

function persistWorkspaces(workspaces: WorkspaceRecord[]): void {
  if (typeof window === 'undefined') {
    return
  }
  window.localStorage.setItem(WORKSPACES_STORAGE_KEY, JSON.stringify(workspaces))
}

function readStoredAuthorRequests(): WorkspaceAuthorRequest[] {
  if (typeof window === 'undefined') {
    return defaultAuthorRequests()
  }
  const raw = window.localStorage.getItem(AUTHOR_REQUESTS_STORAGE_KEY)
  if (!raw) {
    return defaultAuthorRequests()
  }
  try {
    const parsed = JSON.parse(raw) as Array<Partial<WorkspaceAuthorRequest>>
    if (!Array.isArray(parsed)) {
      return defaultAuthorRequests()
    }
    return parsed
      .map((request) => ({
        id: trimValue(request.id) || buildId('author-request'),
        workspaceId: trimValue(request.workspaceId) || buildId('workspace'),
        workspaceName: normalizeName(request.workspaceName) || 'Untitled workspace',
        authorName: normalizeName(request.authorName) || 'Unknown author',
        invitedAt: trimValue(request.invitedAt) || nowIso(),
      }))
      .filter((request) => request.workspaceId && request.workspaceName)
  } catch {
    return defaultAuthorRequests()
  }
}

function persistAuthorRequests(authorRequests: WorkspaceAuthorRequest[]): void {
  if (typeof window === 'undefined') {
    return
  }
  window.localStorage.setItem(AUTHOR_REQUESTS_STORAGE_KEY, JSON.stringify(authorRequests))
}

function readStoredInvitationsSent(): WorkspaceInvitationSent[] {
  if (typeof window === 'undefined') {
    return defaultInvitationsSent()
  }
  const raw = window.localStorage.getItem(INVITATIONS_SENT_STORAGE_KEY)
  if (!raw) {
    return defaultInvitationsSent()
  }
  try {
    const parsed = JSON.parse(raw) as Array<Partial<WorkspaceInvitationSent>>
    if (!Array.isArray(parsed)) {
      return defaultInvitationsSent()
    }
    return parsed
      .map((invitation) => {
        const status: WorkspaceInvitationStatus =
          invitation.status === 'accepted' || invitation.status === 'declined'
            ? invitation.status
            : 'pending'
        return {
          id: trimValue(invitation.id) || buildId('invite'),
          workspaceId: trimValue(invitation.workspaceId) || buildId('workspace'),
          workspaceName: normalizeName(invitation.workspaceName) || 'Untitled workspace',
          inviteeName: normalizeName(invitation.inviteeName) || 'Unknown collaborator',
          invitedAt: trimValue(invitation.invitedAt) || nowIso(),
          status,
        }
      })
      .filter((invitation) => invitation.workspaceId && invitation.inviteeName)
  } catch {
    return defaultInvitationsSent()
  }
}

function persistInvitationsSent(invitationsSent: WorkspaceInvitationSent[]): void {
  if (typeof window === 'undefined') {
    return
  }
  window.localStorage.setItem(INVITATIONS_SENT_STORAGE_KEY, JSON.stringify(invitationsSent))
}

function readStoredActiveWorkspaceId(workspaces: WorkspaceRecord[]): string | null {
  if (typeof window === 'undefined') {
    return workspaces[0]?.id ?? null
  }
  const raw = window.localStorage.getItem(ACTIVE_WORKSPACE_STORAGE_KEY)
  if (!raw) {
    return workspaces[0]?.id ?? null
  }
  if (workspaces.some((workspace) => workspace.id === raw)) {
    return raw
  }
  return workspaces[0]?.id ?? null
}

function persistActiveWorkspaceId(workspaceId: string | null): void {
  if (typeof window === 'undefined') {
    return
  }
  if (!workspaceId) {
    window.localStorage.removeItem(ACTIVE_WORKSPACE_STORAGE_KEY)
    return
  }
  window.localStorage.setItem(ACTIVE_WORKSPACE_STORAGE_KEY, workspaceId)
}

function slugifyWorkspaceName(value: string): string {
  const cleaned = value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
  return cleaned || `workspace-${Date.now()}`
}

const initialWorkspaces = readStoredWorkspaces()
const initialActiveWorkspaceId = readStoredActiveWorkspaceId(initialWorkspaces)
const initialAuthorRequests = readStoredAuthorRequests()
const initialInvitationsSent = readStoredInvitationsSent()

export const useWorkspaceStore = create<WorkspaceStore>((set, get) => ({
  workspaces: initialWorkspaces,
  activeWorkspaceId: initialActiveWorkspaceId,
  authorRequests: initialAuthorRequests,
  invitationsSent: initialInvitationsSent,
  setActiveWorkspaceId: (workspaceId) => {
    persistActiveWorkspaceId(workspaceId)
    set({ activeWorkspaceId: workspaceId })
  },
  ensureWorkspace: (workspaceId) => {
    const cleanWorkspaceId = trimValue(workspaceId)
    if (!cleanWorkspaceId) {
      return
    }
    const state = get()
    if (state.workspaces.some((workspace) => workspace.id === cleanWorkspaceId)) {
      if (state.activeWorkspaceId !== cleanWorkspaceId) {
        persistActiveWorkspaceId(cleanWorkspaceId)
        set({ activeWorkspaceId: cleanWorkspaceId })
      }
      return
    }
    const nextWorkspace: WorkspaceRecord = {
      id: cleanWorkspaceId,
      name: cleanWorkspaceId
        .split('-')
        .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
        .join(' '),
      ownerName: defaultOwnerName(),
      collaborators: [],
      version: '0.1',
      health: 'amber',
      updatedAt: nowIso(),
      pinned: false,
      archived: false,
    }
    const nextWorkspaces = [nextWorkspace, ...state.workspaces]
    persistWorkspaces(nextWorkspaces)
    persistActiveWorkspaceId(cleanWorkspaceId)
    set({
      workspaces: nextWorkspaces,
      activeWorkspaceId: cleanWorkspaceId,
    })
  },
  createWorkspace: (name) => {
    const ownerName = readWorkspaceOwnerNameFromProfile()
    if (!ownerName) {
      throw new Error(WORKSPACE_OWNER_REQUIRED_MESSAGE)
    }
    const cleanName = normalizeName(name) || 'New Workspace'
    const state = get()
    let baseId = slugifyWorkspaceName(cleanName)
    if (state.workspaces.some((workspace) => workspace.id === baseId)) {
      baseId = `${baseId}-${Date.now().toString(36)}`
    }
    const nextWorkspace: WorkspaceRecord = {
      id: baseId,
      name: cleanName,
      ownerName,
      collaborators: [],
      version: '0.1',
      health: 'amber',
      updatedAt: nowIso(),
      pinned: false,
      archived: false,
    }
    const nextWorkspaces = [nextWorkspace, ...state.workspaces]
    persistWorkspaces(nextWorkspaces)
    persistActiveWorkspaceId(nextWorkspace.id)
    set({
      workspaces: nextWorkspaces,
      activeWorkspaceId: nextWorkspace.id,
    })
    return nextWorkspace
  },
  updateWorkspace: (workspaceId, patch) => {
    const cleanWorkspaceId = trimValue(workspaceId)
    if (!cleanWorkspaceId) {
      return
    }
    const state = get()
    const nextWorkspaces = state.workspaces.map((workspace) => {
      if (workspace.id !== cleanWorkspaceId) {
        return workspace
      }
      return {
        ...workspace,
        ...patch,
        ownerName: patch.ownerName ? normalizeName(patch.ownerName) : workspace.ownerName,
        collaborators: patch.collaborators ? normalizeCollaborators(patch.collaborators) : workspace.collaborators,
      }
    })
    persistWorkspaces(nextWorkspaces)
    set({ workspaces: nextWorkspaces })
  },
  deleteWorkspace: (workspaceId) => {
    const cleanWorkspaceId = trimValue(workspaceId)
    if (!cleanWorkspaceId) {
      return
    }
    const state = get()
    const nextWorkspaces = state.workspaces.filter((workspace) => workspace.id !== cleanWorkspaceId)
    const nextActiveWorkspaceId =
      state.activeWorkspaceId === cleanWorkspaceId
        ? nextWorkspaces.find((workspace) => !workspace.archived)?.id || nextWorkspaces[0]?.id || null
        : state.activeWorkspaceId
    persistWorkspaces(nextWorkspaces)
    persistActiveWorkspaceId(nextActiveWorkspaceId)
    set({
      workspaces: nextWorkspaces,
      activeWorkspaceId: nextActiveWorkspaceId,
    })
  },
  sendWorkspaceInvitation: (workspaceId, inviteeName) => {
    const cleanWorkspaceId = trimValue(workspaceId)
    const cleanInviteeName = normalizeName(inviteeName)
    if (!cleanWorkspaceId || !cleanInviteeName) {
      return null
    }
    const state = get()
    const currentUserName = currentProfileName()
    if (!currentUserName) {
      return null
    }
    const workspace = state.workspaces.find((item) => item.id === cleanWorkspaceId)
    if (!workspace) {
      return null
    }
    if (workspace.ownerName.toLowerCase() !== currentUserName.toLowerCase()) {
      return null
    }
    if (workspace.ownerName.toLowerCase() === cleanInviteeName.toLowerCase()) {
      return null
    }
    const hasPendingDuplicate = state.invitationsSent.some(
      (invitation) =>
        invitation.workspaceId === cleanWorkspaceId &&
        invitation.inviteeName.toLowerCase() === cleanInviteeName.toLowerCase() &&
        invitation.status === 'pending',
    )
    if (hasPendingDuplicate) {
      return null
    }

    const nextInvitation: WorkspaceInvitationSent = {
      id: buildId('invite'),
      workspaceId: workspace.id,
      workspaceName: workspace.name,
      inviteeName: cleanInviteeName,
      invitedAt: nowIso(),
      status: 'pending',
    }
    const nextInvitationsSent = [nextInvitation, ...state.invitationsSent]
    persistInvitationsSent(nextInvitationsSent)
    set({ invitationsSent: nextInvitationsSent })
    return nextInvitation
  },
  acceptAuthorRequest: (requestId) => {
    const cleanRequestId = trimValue(requestId)
    if (!cleanRequestId) {
      return null
    }
    const state = get()
    const request = state.authorRequests.find((item) => item.id === cleanRequestId)
    if (!request) {
      return null
    }

    let acceptedWorkspaceId = request.workspaceId
    if (state.workspaces.some((workspace) => workspace.id === acceptedWorkspaceId)) {
      acceptedWorkspaceId = `${acceptedWorkspaceId}-${Date.now().toString(36)}`
    }

    const nextWorkspace: WorkspaceRecord = {
      id: acceptedWorkspaceId,
      name: request.workspaceName,
      ownerName: request.authorName,
      collaborators: [currentCollaboratorName()],
      version: '0.1',
      health: 'amber',
      updatedAt: nowIso(),
      pinned: false,
      archived: false,
    }
    const nextWorkspaces = [nextWorkspace, ...state.workspaces]
    const nextAuthorRequests = state.authorRequests.filter((item) => item.id !== cleanRequestId)
    persistWorkspaces(nextWorkspaces)
    persistAuthorRequests(nextAuthorRequests)
    persistActiveWorkspaceId(nextWorkspace.id)
    set({
      workspaces: nextWorkspaces,
      activeWorkspaceId: nextWorkspace.id,
      authorRequests: nextAuthorRequests,
    })
    return nextWorkspace
  },
  declineAuthorRequest: (requestId) => {
    const cleanRequestId = trimValue(requestId)
    if (!cleanRequestId) {
      return
    }
    const state = get()
    const nextAuthorRequests = state.authorRequests.filter((item) => item.id !== cleanRequestId)
    persistAuthorRequests(nextAuthorRequests)
    set({ authorRequests: nextAuthorRequests })
  },
}))
