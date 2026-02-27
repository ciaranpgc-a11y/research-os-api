import { create } from 'zustand'

import { getAuthSessionToken } from '@/lib/auth-session'
import {
  acceptWorkspaceAuthorRequestApi,
  createWorkspaceInvitationApi,
  createWorkspaceRecordApi,
  declineWorkspaceAuthorRequestApi,
  deleteWorkspaceRecordApi,
  listWorkspaces,
  listWorkspaceAuthorRequestsApi,
  listWorkspaceInvitationsSentApi,
  setActiveWorkspaceApi,
  updateWorkspaceInvitationStatusApi,
  updateWorkspaceRecordApi,
} from '@/lib/workspace-api'
import {
  readScopedStorageItem,
  removeScopedStorageItem,
  writeScopedStorageItem,
} from '@/lib/user-scoped-storage'
import {
  WORKSPACE_OWNER_REQUIRED_MESSAGE,
  readWorkspaceOwnerNameFromProfile,
} from '@/lib/workspace-owner'

export type WorkspaceHealth = 'green' | 'amber' | 'red'
export type WorkspaceInvitationStatus = 'pending' | 'accepted' | 'declined'
export type WorkspaceCollaboratorRole = 'editor' | 'reviewer' | 'viewer'
export type WorkspaceAuditCategory = 'collaborator_changes' | 'invitation_decisions'

export type WorkspaceAuditLogEntry = {
  id: string
  workspaceId: string
  category: WorkspaceAuditCategory
  message: string
  createdAt: string
}

export type WorkspaceRecord = {
  id: string
  name: string
  ownerName: string
  collaborators: string[]
  pendingCollaborators: string[]
  collaboratorRoles: Record<string, WorkspaceCollaboratorRole>
  pendingCollaboratorRoles: Record<string, WorkspaceCollaboratorRole>
  removedCollaborators: string[]
  version: string
  health: WorkspaceHealth
  updatedAt: string
  pinned: boolean
  archived: boolean
  auditLogEntries?: WorkspaceAuditLogEntry[]
}

export type WorkspaceAuthorRequest = {
  id: string
  workspaceId: string
  workspaceName: string
  authorName: string
  collaboratorRole: WorkspaceCollaboratorRole
  invitedAt: string
}

export type WorkspaceInvitationSent = {
  id: string
  workspaceId: string
  workspaceName: string
  inviteeName: string
  role: WorkspaceCollaboratorRole
  invitedAt: string
  status: WorkspaceInvitationStatus
}

type WorkspacePatch = Partial<
  Pick<
    WorkspaceRecord,
    | 'name'
    | 'ownerName'
    | 'collaborators'
    | 'pendingCollaborators'
    | 'collaboratorRoles'
    | 'pendingCollaboratorRoles'
    | 'removedCollaborators'
    | 'health'
    | 'version'
    | 'updatedAt'
    | 'pinned'
    | 'archived'
    | 'auditLogEntries'
  >
>

type WorkspaceStore = {
  workspaces: WorkspaceRecord[]
  activeWorkspaceId: string | null
  authorRequests: WorkspaceAuthorRequest[]
  invitationsSent: WorkspaceInvitationSent[]
  hydrateFromRemote: () => Promise<void>
  setActiveWorkspaceId: (workspaceId: string | null) => void
  ensureWorkspace: (workspaceId: string) => void
  createWorkspace: (name?: string) => WorkspaceRecord
  updateWorkspace: (workspaceId: string, patch: WorkspacePatch) => void
  deleteWorkspace: (workspaceId: string) => void
  sendWorkspaceInvitation: (
    workspaceId: string,
    inviteeName: string,
    role: WorkspaceCollaboratorRole,
  ) => WorkspaceInvitationSent | null
  acceptAuthorRequest: (requestId: string) => WorkspaceRecord | null
  declineAuthorRequest: (requestId: string) => void
  cancelWorkspaceInvitation: (invitationId: string) => WorkspaceInvitationSent | null
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

function normalizeRemovedCollaborators(values: unknown, collaborators: string[]): string[] {
  const allowed = new Set(collaborators.map((value) => value.toLowerCase()))
  return normalizeCollaborators(values).filter((value) => allowed.has(value.toLowerCase()))
}

function normalizeCollaboratorRole(value: unknown): WorkspaceCollaboratorRole {
  const clean = trimValue(String(value || '')).toLowerCase()
  if (clean === 'reviewer' || clean === 'viewer') {
    return clean
  }
  return 'editor'
}

function normalizeCollaboratorRoles(
  values: unknown,
  collaborators: string[],
): Record<string, WorkspaceCollaboratorRole> {
  const source =
    values && typeof values === 'object' && !Array.isArray(values)
      ? (values as Record<string, unknown>)
      : {}
  const canonicalNameByKey = new Map<string, string>()
  for (const collaborator of collaborators) {
    const clean = normalizeName(collaborator)
    if (!clean) {
      continue
    }
    canonicalNameByKey.set(clean.toLowerCase(), clean)
  }

  const output: Record<string, WorkspaceCollaboratorRole> = {}
  for (const [name, value] of Object.entries(source)) {
    const clean = normalizeName(name)
    if (!clean) {
      continue
    }
    const canonical = canonicalNameByKey.get(clean.toLowerCase())
    if (!canonical) {
      continue
    }
    output[canonical] = normalizeCollaboratorRole(value)
  }

  for (const canonical of canonicalNameByKey.values()) {
    if (!output[canonical]) {
      output[canonical] = 'editor'
    }
  }

  return output
}

function normalizePendingCollaborators(
  values: unknown,
  collaborators: string[],
  removedCollaborators: string[],
): string[] {
  const removedKeys = new Set(removedCollaborators.map((value) => value.toLowerCase()))
  const activeKeys = new Set(
    collaborators
      .filter((value) => !removedKeys.has(value.toLowerCase()))
      .map((value) => value.toLowerCase()),
  )
  return normalizeCollaborators(values).filter((value) => !activeKeys.has(value.toLowerCase()))
}

function normalizeWorkspaceAuditCategory(value: unknown): WorkspaceAuditCategory {
  const clean = trimValue(String(value || '')).toLowerCase()
  if (clean === 'invitation_decisions') {
    return 'invitation_decisions'
  }
  return 'collaborator_changes'
}

function normalizeWorkspaceAuditEntries(
  values: unknown,
  workspaceId: string,
): WorkspaceAuditLogEntry[] {
  const source = Array.isArray(values) ? values : []
  const cleanWorkspaceId = trimValue(workspaceId)
  const output: WorkspaceAuditLogEntry[] = []
  for (let index = 0; index < source.length; index += 1) {
    const row = source[index]
    if (!row || typeof row !== 'object') {
      continue
    }
    const record = row as Record<string, unknown>
    const message = normalizeName(String(record.message || ''))
    if (!message) {
      continue
    }
    const createdAtRaw = trimValue(String(record.createdAt || ''))
    const createdAtParsed = Date.parse(createdAtRaw)
    const createdAt = Number.isNaN(createdAtParsed) ? nowIso() : new Date(createdAtParsed).toISOString()
    const entryWorkspaceId = trimValue(String(record.workspaceId || cleanWorkspaceId)) || cleanWorkspaceId
    if (!entryWorkspaceId) {
      continue
    }
    const entryId = trimValue(String(record.id || '')) || `${entryWorkspaceId}-${createdAt}-${index}`
    output.push({
      id: entryId,
      workspaceId: entryWorkspaceId,
      category: normalizeWorkspaceAuditCategory(record.category),
      message,
      createdAt,
    })
  }
  output.sort((left, right) => Date.parse(right.createdAt) - Date.parse(left.createdAt))
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
      pendingCollaborators: [],
      collaboratorRoles: {},
      pendingCollaboratorRoles: {},
      removedCollaborators: [],
      version: '0.1',
      health: 'amber',
      updatedAt: nowIso(),
      pinned: true,
      archived: false,
      auditLogEntries: [],
    },
  ]
}

function defaultAuthorRequests(): WorkspaceAuthorRequest[] {
  return []
}

function defaultInvitationsSent(): WorkspaceInvitationSent[] {
  return []
}

function normalizeWorkspaceRecords(
  values: Array<Partial<WorkspaceRecord>>,
  fallbackOwnerName: string,
): WorkspaceRecord[] {
  return values.map((workspace) => {
    const workspaceId = trimValue(workspace.id) || `workspace-${Date.now().toString(36)}`
    const collaborators = normalizeCollaborators((workspace as { collaborators?: unknown }).collaborators)
    const removedCollaborators = normalizeRemovedCollaborators(
      (workspace as { removedCollaborators?: unknown }).removedCollaborators,
      collaborators,
    )
    const pendingCollaborators = normalizePendingCollaborators(
      (workspace as { pendingCollaborators?: unknown }).pendingCollaborators,
      collaborators,
      removedCollaborators,
    )
    const collaboratorRoles = normalizeCollaboratorRoles(
      (workspace as { collaboratorRoles?: unknown }).collaboratorRoles,
      collaborators,
    )
    const pendingCollaboratorRoles = normalizeCollaboratorRoles(
      (workspace as { pendingCollaboratorRoles?: unknown }).pendingCollaboratorRoles,
      pendingCollaborators,
    )
    const auditLogEntries = normalizeWorkspaceAuditEntries(
      (workspace as { auditLogEntries?: unknown }).auditLogEntries,
      workspaceId,
    )
    return {
      id: workspaceId,
      name: normalizeName(workspace.name) || 'Workspace',
      ownerName: normalizeName(workspace.ownerName) || fallbackOwnerName,
      collaborators,
      pendingCollaborators,
      collaboratorRoles,
      pendingCollaboratorRoles,
      removedCollaborators,
      version: trimValue(workspace.version) || '0.1',
      health:
        workspace.health === 'green' || workspace.health === 'amber' || workspace.health === 'red'
          ? workspace.health
          : 'amber',
      updatedAt: trimValue(workspace.updatedAt) || nowIso(),
      pinned: Boolean(workspace.pinned),
      archived: Boolean(workspace.archived),
      auditLogEntries,
    }
  })
}

function normalizeAuthorRequestRecords(values: Array<Partial<WorkspaceAuthorRequest>>): WorkspaceAuthorRequest[] {
  return values
    .map((request) => ({
      id: trimValue(request.id) || buildId('author-request'),
      workspaceId: trimValue(request.workspaceId) || buildId('workspace'),
      workspaceName: normalizeName(request.workspaceName) || 'Untitled workspace',
      authorName: normalizeName(request.authorName) || 'Unknown author',
      collaboratorRole: normalizeCollaboratorRole(request.collaboratorRole),
      invitedAt: trimValue(request.invitedAt) || nowIso(),
    }))
    .filter((request) => request.workspaceId && request.workspaceName)
}

function normalizeInvitationSentRecords(values: Array<Partial<WorkspaceInvitationSent>>): WorkspaceInvitationSent[] {
  return values
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
        role: normalizeCollaboratorRole(invitation.role),
        invitedAt: trimValue(invitation.invitedAt) || nowIso(),
        status,
      }
    })
    .filter((invitation) => invitation.workspaceId && invitation.inviteeName)
}

function readStoredWorkspaces(): WorkspaceRecord[] {
  if (typeof window === 'undefined') {
    return defaultWorkspaces()
  }
  const fallbackOwnerName = defaultOwnerName()
  const raw = readScopedStorageItem(WORKSPACES_STORAGE_KEY)
  if (!raw) {
    return defaultWorkspaces()
  }
  try {
    const parsed = JSON.parse(raw) as Array<Partial<WorkspaceRecord>>
    if (!Array.isArray(parsed) || parsed.length === 0) {
      return defaultWorkspaces()
    }
    return normalizeWorkspaceRecords(parsed, fallbackOwnerName)
  } catch {
    return defaultWorkspaces()
  }
}

function persistWorkspaces(workspaces: WorkspaceRecord[]): void {
  if (typeof window === 'undefined') {
    return
  }
  writeScopedStorageItem(WORKSPACES_STORAGE_KEY, JSON.stringify(workspaces))
}

function readStoredAuthorRequests(): WorkspaceAuthorRequest[] {
  if (typeof window === 'undefined') {
    return defaultAuthorRequests()
  }
  const raw = readScopedStorageItem(AUTHOR_REQUESTS_STORAGE_KEY)
  if (!raw) {
    return defaultAuthorRequests()
  }
  try {
    const parsed = JSON.parse(raw) as Array<Partial<WorkspaceAuthorRequest>>
    if (!Array.isArray(parsed)) {
      return defaultAuthorRequests()
    }
    return normalizeAuthorRequestRecords(parsed)
  } catch {
    return defaultAuthorRequests()
  }
}

function persistAuthorRequests(authorRequests: WorkspaceAuthorRequest[]): void {
  if (typeof window === 'undefined') {
    return
  }
  writeScopedStorageItem(AUTHOR_REQUESTS_STORAGE_KEY, JSON.stringify(authorRequests))
}

function readStoredInvitationsSent(): WorkspaceInvitationSent[] {
  if (typeof window === 'undefined') {
    return defaultInvitationsSent()
  }
  const raw = readScopedStorageItem(INVITATIONS_SENT_STORAGE_KEY)
  if (!raw) {
    return defaultInvitationsSent()
  }
  try {
    const parsed = JSON.parse(raw) as Array<Partial<WorkspaceInvitationSent>>
    if (!Array.isArray(parsed)) {
      return defaultInvitationsSent()
    }
    return normalizeInvitationSentRecords(parsed)
  } catch {
    return defaultInvitationsSent()
  }
}

function persistInvitationsSent(invitationsSent: WorkspaceInvitationSent[]): void {
  if (typeof window === 'undefined') {
    return
  }
  writeScopedStorageItem(INVITATIONS_SENT_STORAGE_KEY, JSON.stringify(invitationsSent))
}

function readStoredActiveWorkspaceId(workspaces: WorkspaceRecord[]): string | null {
  if (typeof window === 'undefined') {
    return workspaces[0]?.id ?? null
  }
  const raw = readScopedStorageItem(ACTIVE_WORKSPACE_STORAGE_KEY)
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
    removeScopedStorageItem(ACTIVE_WORKSPACE_STORAGE_KEY)
    return
  }
  writeScopedStorageItem(ACTIVE_WORKSPACE_STORAGE_KEY, workspaceId)
}

type WorkspaceStateSnapshot = {
  workspaces: WorkspaceRecord[]
  activeWorkspaceId: string | null
  authorRequests: WorkspaceAuthorRequest[]
  invitationsSent: WorkspaceInvitationSent[]
}

function persistSnapshotLocal(snapshot: WorkspaceStateSnapshot): void {
  persistWorkspaces(snapshot.workspaces)
  persistActiveWorkspaceId(snapshot.activeWorkspaceId)
  persistAuthorRequests(snapshot.authorRequests)
  persistInvitationsSent(snapshot.invitationsSent)
}

let remoteWorkspaceActionQueue: Promise<void> = Promise.resolve()

function runRemoteWorkspaceAction(
  action: (token: string) => Promise<unknown>,
): void {
  const token = getAuthSessionToken()
  if (!token) {
    return
  }
  remoteWorkspaceActionQueue = remoteWorkspaceActionQueue
    .then(async () => {
      try {
        await action(token)
      } catch {
        // Keep local state when remote mutation fails.
      }
    })
    .catch(() => {
      // Keep queue alive even if a previous handler throws unexpectedly.
    })
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
  hydrateFromRemote: async () => {
    const token = getAuthSessionToken()
    if (!token) {
      return
    }
    try {
      const [workspaceListing, authorRequests, invitationsSent] = await Promise.all([
        listWorkspaces(token),
        listWorkspaceAuthorRequestsApi(token),
        listWorkspaceInvitationsSentApi(token),
      ])
      const remote = {
        workspaces: workspaceListing.items,
        activeWorkspaceId: workspaceListing.activeWorkspaceId,
        authorRequests,
        invitationsSent,
      }
      const fallbackOwnerName = defaultOwnerName()
      const remoteWorkspaces = normalizeWorkspaceRecords(
        (remote.workspaces || []) as Array<Partial<WorkspaceRecord>>,
        fallbackOwnerName,
      )
      const remoteAuthorRequests = normalizeAuthorRequestRecords(
        (remote.authorRequests || []) as Array<Partial<WorkspaceAuthorRequest>>,
      )
      const remoteInvitationsSent = normalizeInvitationSentRecords(
        (remote.invitationsSent || []) as Array<Partial<WorkspaceInvitationSent>>,
      )

      const requestedActiveWorkspaceId = trimValue(remote.activeWorkspaceId)
      const resolvedActiveWorkspaceId =
        requestedActiveWorkspaceId &&
        remoteWorkspaces.some((workspace) => workspace.id === requestedActiveWorkspaceId)
          ? requestedActiveWorkspaceId
          : remoteWorkspaces[0]?.id || null

      const snapshot: WorkspaceStateSnapshot = {
        workspaces: remoteWorkspaces,
        activeWorkspaceId: resolvedActiveWorkspaceId,
        authorRequests: remoteAuthorRequests,
        invitationsSent: remoteInvitationsSent,
      }
      persistSnapshotLocal(snapshot)
      set(snapshot)
    } catch {
      // Keep local state when remote hydration fails.
    }
  },
  setActiveWorkspaceId: (workspaceId) => {
    persistActiveWorkspaceId(workspaceId)
    set({ activeWorkspaceId: workspaceId })
    runRemoteWorkspaceAction((token) => setActiveWorkspaceApi(token, workspaceId))
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
        runRemoteWorkspaceAction((token) => setActiveWorkspaceApi(token, cleanWorkspaceId))
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
      pendingCollaborators: [],
      collaboratorRoles: {},
      pendingCollaboratorRoles: {},
      removedCollaborators: [],
      version: '0.1',
      health: 'amber',
      updatedAt: nowIso(),
      pinned: false,
      archived: false,
      auditLogEntries: [],
    }
    const nextWorkspaces = [nextWorkspace, ...state.workspaces]
    const snapshot: WorkspaceStateSnapshot = {
      workspaces: nextWorkspaces,
      activeWorkspaceId: cleanWorkspaceId,
      authorRequests: state.authorRequests,
      invitationsSent: state.invitationsSent,
    }
    persistSnapshotLocal(snapshot)
    set(snapshot)
    runRemoteWorkspaceAction((token) => createWorkspaceRecordApi(token, nextWorkspace))
    runRemoteWorkspaceAction((token) => setActiveWorkspaceApi(token, cleanWorkspaceId))
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
      pendingCollaborators: [],
      collaboratorRoles: {},
      pendingCollaboratorRoles: {},
      removedCollaborators: [],
      version: '0.1',
      health: 'amber',
      updatedAt: nowIso(),
      pinned: false,
      archived: false,
      auditLogEntries: [],
    }
    const nextWorkspaces = [nextWorkspace, ...state.workspaces]
    const snapshot: WorkspaceStateSnapshot = {
      workspaces: nextWorkspaces,
      activeWorkspaceId: nextWorkspace.id,
      authorRequests: state.authorRequests,
      invitationsSent: state.invitationsSent,
    }
    persistSnapshotLocal(snapshot)
    set(snapshot)
    runRemoteWorkspaceAction((token) => createWorkspaceRecordApi(token, nextWorkspace))
    runRemoteWorkspaceAction((token) => setActiveWorkspaceApi(token, nextWorkspace.id))
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
      const nextCollaborators = patch.collaborators
        ? normalizeCollaborators(patch.collaborators)
        : workspace.collaborators
      const nextRemovedCollaborators = patch.removedCollaborators
        ? normalizeRemovedCollaborators(patch.removedCollaborators, nextCollaborators)
        : normalizeRemovedCollaborators(workspace.removedCollaborators, nextCollaborators)
      const nextPendingCollaborators = patch.pendingCollaborators
        ? normalizePendingCollaborators(patch.pendingCollaborators, nextCollaborators, nextRemovedCollaborators)
        : normalizePendingCollaborators(
            workspace.pendingCollaborators,
            nextCollaborators,
            nextRemovedCollaborators,
          )
      const nextCollaboratorRoles = patch.collaboratorRoles
        ? normalizeCollaboratorRoles(patch.collaboratorRoles, nextCollaborators)
        : normalizeCollaboratorRoles(workspace.collaboratorRoles, nextCollaborators)
      const nextPendingCollaboratorRoles = patch.pendingCollaboratorRoles
        ? normalizeCollaboratorRoles(patch.pendingCollaboratorRoles, nextPendingCollaborators)
        : normalizeCollaboratorRoles(
            workspace.pendingCollaboratorRoles,
            nextPendingCollaborators,
          )
      const existingAuditLogEntries = normalizeWorkspaceAuditEntries(
        workspace.auditLogEntries,
        workspace.id,
      )
      const nextAuditLogEntries = (() => {
        if (!patch.auditLogEntries) {
          return existingAuditLogEntries
        }
        const requestedAuditLogEntries = normalizeWorkspaceAuditEntries(
          patch.auditLogEntries,
          cleanWorkspaceId,
        )
        const existingAuditEntryIds = new Set(
          existingAuditLogEntries.map((entry) => trimValue(entry.id)),
        )
        const newAuditEntries = requestedAuditLogEntries.filter(
          (entry) => !existingAuditEntryIds.has(trimValue(entry.id)),
        )
        return [...newAuditEntries, ...existingAuditLogEntries]
      })()
      return {
        ...workspace,
        ...patch,
        ownerName: patch.ownerName ? normalizeName(patch.ownerName) : workspace.ownerName,
        collaborators: nextCollaborators,
        pendingCollaborators: nextPendingCollaborators,
        collaboratorRoles: nextCollaboratorRoles,
        pendingCollaboratorRoles: nextPendingCollaboratorRoles,
        removedCollaborators: nextRemovedCollaborators,
        auditLogEntries: nextAuditLogEntries,
      }
    })
    persistSnapshotLocal({
      workspaces: nextWorkspaces,
      activeWorkspaceId: state.activeWorkspaceId,
      authorRequests: state.authorRequests,
      invitationsSent: state.invitationsSent,
    })
    set({ workspaces: nextWorkspaces })
    runRemoteWorkspaceAction((token) => updateWorkspaceRecordApi(token, cleanWorkspaceId, patch))
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
    persistSnapshotLocal({
      workspaces: nextWorkspaces,
      activeWorkspaceId: nextActiveWorkspaceId,
      authorRequests: state.authorRequests,
      invitationsSent: state.invitationsSent,
    })
    set({
      workspaces: nextWorkspaces,
      activeWorkspaceId: nextActiveWorkspaceId,
    })
    runRemoteWorkspaceAction((token) => deleteWorkspaceRecordApi(token, cleanWorkspaceId))
  },
  sendWorkspaceInvitation: (workspaceId, inviteeName, role) => {
    const cleanWorkspaceId = trimValue(workspaceId)
    const cleanInviteeName = normalizeName(inviteeName)
    const cleanRole = normalizeCollaboratorRole(role)
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
    const removedSet = new Set(workspace.removedCollaborators.map((name) => name.toLowerCase()))
    const activeSet = new Set(
      workspace.collaborators
        .filter((name) => !removedSet.has(name.toLowerCase()))
        .map((name) => name.toLowerCase()),
    )
    if (activeSet.has(cleanInviteeName.toLowerCase())) {
      return null
    }
    const pendingSet = new Set((workspace.pendingCollaborators || []).map((name) => name.toLowerCase()))
    if (pendingSet.has(cleanInviteeName.toLowerCase())) {
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
      role: cleanRole,
      invitedAt: nowIso(),
      status: 'pending',
    }
    const nextInvitationsSent = [nextInvitation, ...state.invitationsSent]
    const nextWorkspaces = state.workspaces.map((item) => {
      if (item.id !== cleanWorkspaceId) {
        return item
      }
      return {
        ...item,
        pendingCollaborators: normalizePendingCollaborators(
          [...(item.pendingCollaborators || []), cleanInviteeName],
          item.collaborators,
          item.removedCollaborators,
        ),
        pendingCollaboratorRoles: normalizeCollaboratorRoles(
          {
            ...(item.pendingCollaboratorRoles || {}),
            [cleanInviteeName]: cleanRole,
          },
          normalizePendingCollaborators(
            [...(item.pendingCollaborators || []), cleanInviteeName],
            item.collaborators,
            item.removedCollaborators,
          ),
        ),
        updatedAt: nextInvitation.invitedAt,
      }
    })
    persistSnapshotLocal({
      workspaces: nextWorkspaces,
      activeWorkspaceId: state.activeWorkspaceId,
      authorRequests: state.authorRequests,
      invitationsSent: nextInvitationsSent,
    })
    set({
      workspaces: nextWorkspaces,
      invitationsSent: nextInvitationsSent,
    })
    runRemoteWorkspaceAction((token) =>
      createWorkspaceInvitationApi(token, {
        workspaceId: cleanWorkspaceId,
        inviteeName: cleanInviteeName,
        role: cleanRole,
        invitedAt: nextInvitation.invitedAt,
        status: nextInvitation.status,
      }),
    )
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

    const requestedWorkspaceId = request.workspaceId
    const existingWorkspaceIndex = state.workspaces.findIndex(
      (workspace) => workspace.id === requestedWorkspaceId,
    )
    const existingWorkspace = existingWorkspaceIndex >= 0
      ? state.workspaces[existingWorkspaceIndex]
      : null
    const canReuseExistingWorkspace = Boolean(
      existingWorkspace &&
      normalizeName(existingWorkspace.ownerName).toLowerCase() ===
        normalizeName(request.authorName).toLowerCase(),
    )

    let acceptedWorkspaceId = requestedWorkspaceId
    if (existingWorkspace && !canReuseExistingWorkspace) {
      acceptedWorkspaceId = `${requestedWorkspaceId}-${Date.now().toString(36)}`
    }

    const acceptedAt = nowIso()
    const nextWorkspace: WorkspaceRecord = {
      id: acceptedWorkspaceId,
      name: request.workspaceName,
      ownerName: request.authorName,
      collaborators: [currentCollaboratorName()],
      pendingCollaborators: [],
      collaboratorRoles: {
        [currentCollaboratorName()]: normalizeCollaboratorRole(request.collaboratorRole),
      },
      pendingCollaboratorRoles: {},
      removedCollaborators: [],
      version: '0.1',
      health: 'amber',
      updatedAt: acceptedAt,
      pinned: false,
      archived: false,
      auditLogEntries: [
        {
          id: `${acceptedWorkspaceId}-audit-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
          workspaceId: acceptedWorkspaceId,
          category: 'invitation_decisions',
          message: `${currentCollaboratorName()} collaborator invitation status switched from pending to accepted by ${currentCollaboratorName()} as ${normalizeCollaboratorRole(request.collaboratorRole)}.`,
          createdAt: acceptedAt,
        },
      ],
    }
    let nextWorkspaces = [...state.workspaces]
    if (canReuseExistingWorkspace && existingWorkspaceIndex >= 0) {
      nextWorkspaces[existingWorkspaceIndex] = nextWorkspace
    } else {
      nextWorkspaces = [nextWorkspace, ...nextWorkspaces]
    }
    const nextAuthorRequests = state.authorRequests.filter((item) => item.id !== cleanRequestId)
    persistSnapshotLocal({
      workspaces: nextWorkspaces,
      activeWorkspaceId: nextWorkspace.id,
      authorRequests: nextAuthorRequests,
      invitationsSent: state.invitationsSent,
    })
    set({
      workspaces: nextWorkspaces,
      activeWorkspaceId: nextWorkspace.id,
      authorRequests: nextAuthorRequests,
    })
    runRemoteWorkspaceAction((token) =>
      acceptWorkspaceAuthorRequestApi(token, cleanRequestId, currentCollaboratorName()),
    )
    return nextWorkspace
  },
  declineAuthorRequest: (requestId) => {
    const cleanRequestId = trimValue(requestId)
    if (!cleanRequestId) {
      return
    }
    const state = get()
    const nextAuthorRequests = state.authorRequests.filter((item) => item.id !== cleanRequestId)
    persistSnapshotLocal({
      workspaces: state.workspaces,
      activeWorkspaceId: state.activeWorkspaceId,
      authorRequests: nextAuthorRequests,
      invitationsSent: state.invitationsSent,
    })
    set({ authorRequests: nextAuthorRequests })
    runRemoteWorkspaceAction((token) => declineWorkspaceAuthorRequestApi(token, cleanRequestId))
  },
  cancelWorkspaceInvitation: (invitationId) => {
    const cleanInvitationId = trimValue(invitationId)
    if (!cleanInvitationId) {
      return null
    }
    const state = get()
    const invitation = state.invitationsSent.find((item) => item.id === cleanInvitationId)
    if (!invitation || invitation.status !== 'pending') {
      return null
    }

    const inviteeKey = normalizeName(invitation.inviteeName).toLowerCase()
    const nextInvitationsSent = state.invitationsSent.map((item) =>
      item.id === cleanInvitationId
        ? { ...item, status: 'declined' as const }
        : item,
    )
    const nextWorkspaces = state.workspaces.map((workspace) => {
      if (workspace.id !== invitation.workspaceId) {
        return workspace
      }
      const nextPendingCollaborators = normalizePendingCollaborators(
        (workspace.pendingCollaborators || []).filter(
          (name) => normalizeName(name).toLowerCase() !== inviteeKey,
        ),
        workspace.collaborators,
        workspace.removedCollaborators,
      )
      const nextPendingCollaboratorRoles = normalizeCollaboratorRoles(
        Object.fromEntries(
          Object.entries(workspace.pendingCollaboratorRoles || {}).filter(
            ([name]) => normalizeName(name).toLowerCase() !== inviteeKey,
          ),
        ),
        nextPendingCollaborators,
      )
      return {
        ...workspace,
        pendingCollaborators: nextPendingCollaborators,
        pendingCollaboratorRoles: nextPendingCollaboratorRoles,
        updatedAt: nowIso(),
      }
    })
    persistSnapshotLocal({
      workspaces: nextWorkspaces,
      activeWorkspaceId: state.activeWorkspaceId,
      authorRequests: state.authorRequests,
      invitationsSent: nextInvitationsSent,
    })
    set({
      workspaces: nextWorkspaces,
      invitationsSent: nextInvitationsSent,
    })
    runRemoteWorkspaceAction((token) =>
      updateWorkspaceInvitationStatusApi(token, cleanInvitationId, 'declined'),
    )
    return nextInvitationsSent.find((item) => item.id === cleanInvitationId) || null
  },
}))
