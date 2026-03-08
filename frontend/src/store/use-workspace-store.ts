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
  readStorageScopeUserId,
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
export type WorkspaceAuditCategory =
  | 'collaborator_changes'
  | 'invitation_decisions'
  | 'workspace_changes'
  | 'conversation'
export type WorkspaceAuditEventType =
  | 'member_invited'
  | 'invitation_cancelled'
  | 'invitation_accepted'
  | 'invitation_declined'
  | 'member_removed'
  | 'member_reinvited'
  | 'member_role_changed'
  | 'pending_role_changed'
  | 'workspace_locked'
  | 'workspace_unlocked'
  | 'workspace_renamed'
  | 'message_logged'
  | 'other'

export type WorkspaceAuditLogEntry = {
  id: string
  workspaceId: string
  category: WorkspaceAuditCategory
  eventType?: WorkspaceAuditEventType | null
  actorUserId?: string | null
  actorName?: string | null
  subjectUserId?: string | null
  subjectName?: string | null
  fromValue?: string | null
  toValue?: string | null
  role?: WorkspaceCollaboratorRole | null
  metadata?: Record<string, unknown>
  message: string
  createdAt: string
}

export type WorkspaceParticipant = {
  userId: string
  name: string
}

export type WorkspaceRecord = {
  id: string
  name: string
  ownerName: string
  ownerUserId: string | null
  collaborators: WorkspaceParticipant[]
  pendingCollaborators: WorkspaceParticipant[]
  collaboratorRoles: Record<string, WorkspaceCollaboratorRole>
  pendingCollaboratorRoles: Record<string, WorkspaceCollaboratorRole>
  removedCollaborators: WorkspaceParticipant[]
  version: string
  health: WorkspaceHealth
  updatedAt: string
  pinned: boolean
  archived: boolean
  ownerArchived: boolean
  auditLogEntries?: WorkspaceAuditLogEntry[]
}

export type WorkspaceAuthorRequest = {
  id: string
  workspaceId: string
  workspaceName: string
  authorName: string
  authorUserId: string | null
  invitationType?: 'workspace' | 'data'
  collaboratorRole: WorkspaceCollaboratorRole
  invitedAt: string
}

export type WorkspaceInvitationSent = {
  id: string
  workspaceId: string
  workspaceName: string
  inviteeName: string
  inviteeUserId: string | null
  invitationType?: 'workspace' | 'data'
  role: WorkspaceCollaboratorRole
  invitedAt: string
  status: WorkspaceInvitationStatus
}

export type WorkspaceAuthorRequestAcceptResult = {
  success: boolean
  invitationType: 'workspace' | 'data' | null
  workspaceId: string | null
  acceptedAssetId: string | null
}

type WorkspaceInvitee = {
  userId: string
  name: string
}

type WorkspacePatch = Partial<
  Pick<
    WorkspaceRecord,
    | 'name'
    | 'ownerName'
    | 'ownerUserId'
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
    | 'ownerArchived'
    | 'auditLogEntries'
  >
>

type WorkspaceStore = {
  workspaces: WorkspaceRecord[]
  activeWorkspaceId: string | null
  authorRequests: WorkspaceAuthorRequest[]
  invitationsSent: WorkspaceInvitationSent[]
  remoteErrorMessage: string | null
  hydrateFromRemote: () => Promise<void>
  clearRemoteError: () => void
  setActiveWorkspaceId: (workspaceId: string | null) => void
  ensureWorkspace: (workspaceId: string) => void
  createWorkspace: (name?: string) => WorkspaceRecord
  updateWorkspace: (workspaceId: string, patch: WorkspacePatch) => void
  deleteWorkspace: (workspaceId: string) => void
  sendWorkspaceInvitation: (
    workspaceId: string,
    invitee: WorkspaceInvitee,
    role: WorkspaceCollaboratorRole,
  ) => WorkspaceInvitationSent | null
  acceptAuthorRequest: (requestId: string) => Promise<WorkspaceAuthorRequestAcceptResult>
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

function normalizeWorkspaceUserId(value: string | null | undefined): string {
  const clean = trimValue(value)
  return clean === 'anonymous' ? '' : clean
}

function defaultOwnerUserId(): string | null {
  const clean = normalizeWorkspaceUserId(readStorageScopeUserId())
  return clean || null
}

function buildLegacyWorkspaceParticipantId(workspaceId: string, name: string): string {
  const seed = `${trimValue(workspaceId) || 'workspace'}:${normalizeName(name).toLowerCase()}`
  let hash = 0
  for (let index = 0; index < seed.length; index += 1) {
    hash = (hash * 31 + seed.charCodeAt(index)) | 0
  }
  return `legacy:${Math.abs(hash).toString(36)}`
}

function hasRealParticipantUserId(value: string | null | undefined): boolean {
  const clean = normalizeWorkspaceUserId(value)
  return Boolean(clean) && !clean.startsWith('legacy:')
}

function normalizeParticipant(
  value: unknown,
  workspaceId: string,
  fallbackName = 'Unknown collaborator',
): WorkspaceParticipant | null {
  if (typeof value === 'string') {
    const cleanName = normalizeName(value)
    if (!cleanName) {
      return null
    }
    return {
      userId: buildLegacyWorkspaceParticipantId(workspaceId, cleanName),
      name: cleanName,
    }
  }
  if (!value || typeof value !== 'object') {
    return null
  }
  const record = value as {
    userId?: unknown
    user_id?: unknown
    id?: unknown
    name?: unknown
  }
  const cleanName = normalizeName(String(record.name || '')) || fallbackName
  const cleanUserId =
    normalizeWorkspaceUserId(String(record.userId || '')) ||
    normalizeWorkspaceUserId(String(record.user_id || '')) ||
    normalizeWorkspaceUserId(String(record.id || '')) ||
    buildLegacyWorkspaceParticipantId(workspaceId, cleanName)
  if (!cleanName || !cleanUserId) {
    return null
  }
  return {
    userId: cleanUserId,
    name: cleanName,
  }
}

function normalizeParticipants(values: unknown, workspaceId: string): WorkspaceParticipant[] {
  const source = Array.isArray(values) ? values : []
  const output: WorkspaceParticipant[] = []
  const indexByNameKey = new Map<string, number>()
  const seenUserIds = new Set<string>()
  for (const value of source) {
    const participant = normalizeParticipant(value, workspaceId)
    if (!participant) {
      continue
    }
    const nameKey = participant.name.toLowerCase()
    const existingIndex = indexByNameKey.get(nameKey)
    if (existingIndex !== undefined) {
      const existing = output[existingIndex]
      if (
        !hasRealParticipantUserId(existing.userId) &&
        hasRealParticipantUserId(participant.userId)
      ) {
        seenUserIds.delete(existing.userId)
        output[existingIndex] = participant
        seenUserIds.add(participant.userId)
      }
      continue
    }
    if (seenUserIds.has(participant.userId)) {
      continue
    }
    indexByNameKey.set(nameKey, output.length)
    seenUserIds.add(participant.userId)
    output.push(participant)
  }
  return output
}

function normalizeRemovedCollaborators(
  values: unknown,
  collaborators: WorkspaceParticipant[],
  workspaceId: string,
): WorkspaceParticipant[] {
  const allowed = new Set(collaborators.map((value) => value.userId))
  return normalizeParticipants(values, workspaceId).filter((value) => allowed.has(value.userId))
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
  collaborators: WorkspaceParticipant[],
): Record<string, WorkspaceCollaboratorRole> {
  const source =
    values && typeof values === 'object' && !Array.isArray(values)
      ? (values as Record<string, unknown>)
      : {}
  const canonicalIds = new Set<string>()
  const canonicalIdByNameKey = new Map<string, string>()
  for (const collaborator of collaborators) {
    if (!collaborator.userId || !collaborator.name) {
      continue
    }
    canonicalIds.add(collaborator.userId)
    const cleanNameKey = collaborator.name.toLowerCase()
    if (canonicalIdByNameKey.has(cleanNameKey)) {
      canonicalIdByNameKey.delete(cleanNameKey)
      continue
    }
    canonicalIdByNameKey.set(cleanNameKey, collaborator.userId)
  }

  const output: Record<string, WorkspaceCollaboratorRole> = {}
  for (const [key, value] of Object.entries(source)) {
    const cleanKey = normalizeWorkspaceUserId(key)
    const canonicalId =
      (cleanKey && canonicalIds.has(cleanKey) ? cleanKey : '') ||
      canonicalIdByNameKey.get(normalizeName(key).toLowerCase())
    if (!canonicalId) {
      continue
    }
    output[canonicalId] = normalizeCollaboratorRole(value)
  }

  for (const canonicalId of canonicalIds) {
    if (!output[canonicalId]) {
      output[canonicalId] = 'editor'
    }
  }

  return output
}

function normalizePendingCollaborators(
  values: unknown,
  collaborators: WorkspaceParticipant[],
  removedCollaborators: WorkspaceParticipant[],
  workspaceId: string,
): WorkspaceParticipant[] {
  const removedKeys = new Set(removedCollaborators.map((value) => value.userId))
  const activeKeys = new Set(
    collaborators
      .filter((value) => !removedKeys.has(value.userId))
      .map((value) => value.userId),
  )
  return normalizeParticipants(values, workspaceId).filter((value) => !activeKeys.has(value.userId))
}

function upsertParticipant(
  values: WorkspaceParticipant[],
  participant: WorkspaceParticipant,
): WorkspaceParticipant[] {
  const cleanUserId = normalizeWorkspaceUserId(participant.userId)
  if (!cleanUserId) {
    return values
  }
  const nextValues = [...values]
  const existingIndex = nextValues.findIndex((value) => value.userId === cleanUserId)
  if (existingIndex >= 0) {
    nextValues[existingIndex] = participant
    return nextValues
  }
  nextValues.push(participant)
  return nextValues
}

function normalizeWorkspaceAuditCategory(value: unknown): WorkspaceAuditCategory {
  const clean = trimValue(String(value || '')).toLowerCase()
  if (clean === 'invitation_decisions') {
    return 'invitation_decisions'
  }
  if (clean === 'workspace_changes') {
    return 'workspace_changes'
  }
  if (clean === 'conversation') {
    return 'conversation'
  }
  return 'collaborator_changes'
}

function normalizeWorkspaceAuditEventType(value: unknown): WorkspaceAuditEventType | null {
  const clean = trimValue(String(value || '')).toLowerCase()
  switch (clean) {
    case 'member_invited':
    case 'invitation_cancelled':
    case 'invitation_accepted':
    case 'invitation_declined':
    case 'member_removed':
    case 'member_reinvited':
    case 'member_role_changed':
    case 'pending_role_changed':
    case 'workspace_locked':
    case 'workspace_unlocked':
    case 'workspace_renamed':
    case 'message_logged':
    case 'other':
      return clean
    default:
      return null
  }
}

function normalizeWorkspaceAuditMetadata(
  value: unknown,
): Record<string, unknown> | undefined {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return undefined
  }
  const output: Record<string, unknown> = {}
  for (const [rawKey, rawValue] of Object.entries(value as Record<string, unknown>)) {
    const key = trimValue(rawKey)
    if (!key) {
      continue
    }
    output[key] = rawValue
  }
  return Object.keys(output).length > 0 ? output : undefined
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
      eventType: normalizeWorkspaceAuditEventType(
        record.eventType ?? record.event_type,
      ),
      actorUserId:
        normalizeWorkspaceUserId(
          (record.actorUserId ?? record.actor_user_id) as string,
        ) || null,
      actorName:
        normalizeName(String((record.actorName ?? record.actor_name) || '')) || null,
      subjectUserId:
        normalizeWorkspaceUserId(
          (record.subjectUserId ?? record.subject_user_id) as string,
        ) || null,
      subjectName:
        normalizeName(String((record.subjectName ?? record.subject_name) || '')) || null,
      fromValue: trimValue(String((record.fromValue ?? record.from_value) || '')) || null,
      toValue: trimValue(String((record.toValue ?? record.to_value) || '')) || null,
      role: record.role ? normalizeCollaboratorRole(record.role) : null,
      metadata: normalizeWorkspaceAuditMetadata(record.metadata),
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

function currentWorkspaceUserId(): string | null {
  return defaultOwnerUserId()
}

function defaultOwnerName(): string {
  return readWorkspaceOwnerNameFromProfile() || 'Not set'
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
      ownerUserId: defaultOwnerUserId(),
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
      ownerArchived: false,
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
    const collaborators = normalizeParticipants(
      (workspace as { collaborators?: unknown }).collaborators,
      workspaceId,
    )
    const removedCollaborators = normalizeRemovedCollaborators(
      (workspace as { removedCollaborators?: unknown }).removedCollaborators,
      collaborators,
      workspaceId,
    )
    const pendingCollaborators = normalizePendingCollaborators(
      (workspace as { pendingCollaborators?: unknown }).pendingCollaborators,
      collaborators,
      removedCollaborators,
      workspaceId,
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
      ownerUserId: normalizeWorkspaceUserId((workspace as { ownerUserId?: unknown }).ownerUserId as string)
        || normalizeWorkspaceUserId((workspace as { owner_user_id?: unknown }).owner_user_id as string)
        || null,
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
      ownerArchived: Boolean(
        (workspace as { ownerArchived?: unknown }).ownerArchived
          ?? (workspace as { owner_archived?: unknown }).owner_archived,
      ),
      auditLogEntries,
    }
  })
}

function normalizeAuthorRequestRecords(values: Array<Partial<WorkspaceAuthorRequest>>): WorkspaceAuthorRequest[] {
  return values
    .map((request) => {
      const invitationType: WorkspaceAuthorRequest['invitationType'] =
        (request as { invitationType?: unknown }).invitationType === 'data'
          || (request as { invitation_type?: unknown }).invitation_type === 'data'
          ? 'data'
          : 'workspace'
      return {
        id: trimValue(request.id) || buildId('author-request'),
        workspaceId: trimValue(request.workspaceId) || buildId('workspace'),
        workspaceName: normalizeName(request.workspaceName) || 'Untitled workspace',
        authorName: normalizeName(request.authorName) || 'Unknown author',
        authorUserId: normalizeWorkspaceUserId((request as { authorUserId?: unknown }).authorUserId as string)
          || normalizeWorkspaceUserId((request as { author_user_id?: unknown }).author_user_id as string)
          || null,
        invitationType,
        collaboratorRole: normalizeCollaboratorRole(request.collaboratorRole),
        invitedAt: trimValue(request.invitedAt) || nowIso(),
      }
    })
    .filter((request) => request.workspaceId && request.workspaceName)
}

function normalizeInvitationSentRecords(values: Array<Partial<WorkspaceInvitationSent>>): WorkspaceInvitationSent[] {
  return values
    .map((invitation) => {
      const status: WorkspaceInvitationStatus =
        invitation.status === 'accepted' || invitation.status === 'declined'
          ? invitation.status
          : 'pending'
      const invitationType: WorkspaceInvitationSent['invitationType'] =
        (invitation as { invitationType?: unknown }).invitationType === 'data'
          || (invitation as { invitation_type?: unknown }).invitation_type === 'data'
          ? 'data'
          : 'workspace'
      return {
        id: trimValue(invitation.id) || buildId('invite'),
        workspaceId: trimValue(invitation.workspaceId) || buildId('workspace'),
        workspaceName: normalizeName(invitation.workspaceName) || 'Untitled workspace',
        inviteeName: normalizeName(invitation.inviteeName) || 'Unknown collaborator',
        inviteeUserId: normalizeWorkspaceUserId((invitation as { inviteeUserId?: unknown }).inviteeUserId as string)
          || normalizeWorkspaceUserId((invitation as { invitee_user_id?: unknown }).invitee_user_id as string)
          || null,
        invitationType,
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
        useWorkspaceStore.setState((state) => ({
          ...state,
          remoteErrorMessage: null,
        }))
      } catch (error) {
        useWorkspaceStore.setState((state) => ({
          ...state,
          remoteErrorMessage:
            error instanceof Error
              ? error.message
              : 'Workspace changes could not be saved. Local state was refreshed.',
        }))
        try {
          await useWorkspaceStore.getState().hydrateFromRemote()
        } catch {
          // Keep queue alive even if remote rehydration also fails.
        }
      }
    })
    .catch(() => {
      // Keep queue alive even if a previous handler throws unexpectedly.
    })
}

function runRemoteWorkspaceActionWithResult<T>(
  action: (token: string) => Promise<T>,
): Promise<T | null> {
  const token = getAuthSessionToken()
  if (!token) {
    return Promise.resolve(null)
  }

  let result: T | null = null
  remoteWorkspaceActionQueue = remoteWorkspaceActionQueue
    .then(async () => {
      try {
        result = await action(token)
        useWorkspaceStore.setState((state) => ({
          ...state,
          remoteErrorMessage: null,
        }))
      } catch (error) {
        useWorkspaceStore.setState((state) => ({
          ...state,
          remoteErrorMessage:
            error instanceof Error
              ? error.message
              : 'Workspace changes could not be saved. Local state was refreshed.',
        }))
        result = null
        try {
          await useWorkspaceStore.getState().hydrateFromRemote()
        } catch {
          // Keep queue alive even if remote rehydration also fails.
        }
      }
    })
    .catch(() => {
      result = null
    })

  return remoteWorkspaceActionQueue.then(() => result)
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
  remoteErrorMessage: null,
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
      set({
        ...snapshot,
        remoteErrorMessage: null,
      })
    } catch {
      // Keep local state when remote hydration fails.
    }
  },
  clearRemoteError: () => {
    set((state) => ({
      ...state,
      remoteErrorMessage: null,
    }))
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
      ownerUserId: currentWorkspaceUserId(),
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
      ownerArchived: false,
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
      ownerUserId: currentWorkspaceUserId(),
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
      ownerArchived: false,
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
        ? normalizeParticipants(patch.collaborators, cleanWorkspaceId)
        : workspace.collaborators
      const nextRemovedCollaborators = patch.removedCollaborators
        ? normalizeRemovedCollaborators(patch.removedCollaborators, nextCollaborators, cleanWorkspaceId)
        : normalizeRemovedCollaborators(workspace.removedCollaborators, nextCollaborators, cleanWorkspaceId)
      const nextPendingCollaborators = patch.pendingCollaborators
        ? normalizePendingCollaborators(
            patch.pendingCollaborators,
            nextCollaborators,
            nextRemovedCollaborators,
            cleanWorkspaceId,
          )
        : normalizePendingCollaborators(
            workspace.pendingCollaborators,
            nextCollaborators,
            nextRemovedCollaborators,
            cleanWorkspaceId,
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
        ownerUserId:
          patch.ownerUserId !== undefined
            ? normalizeWorkspaceUserId(patch.ownerUserId) || null
            : workspace.ownerUserId,
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
  sendWorkspaceInvitation: (workspaceId, invitee, role) => {
    const cleanWorkspaceId = trimValue(workspaceId)
    const cleanInviteeUserId = normalizeWorkspaceUserId(invitee.userId)
    const cleanInviteeName = normalizeName(invitee.name)
    const cleanRole = normalizeCollaboratorRole(role)
    if (!cleanWorkspaceId || !cleanInviteeUserId || !cleanInviteeName) {
      return null
    }
    const state = get()
    const currentUserId = currentWorkspaceUserId()
    if (!currentUserId) {
      return null
    }
    const workspace = state.workspaces.find((item) => item.id === cleanWorkspaceId)
    if (!workspace) {
      return null
    }
    if (workspace.ownerUserId !== currentUserId) {
      return null
    }
    if (workspace.ownerUserId === cleanInviteeUserId) {
      return null
    }
    const removedSet = new Set(workspace.removedCollaborators.map((item) => item.userId))
    const activeSet = new Set(
      workspace.collaborators
        .filter((item) => !removedSet.has(item.userId))
        .map((item) => item.userId),
    )
    if (activeSet.has(cleanInviteeUserId)) {
      return null
    }
    const pendingSet = new Set((workspace.pendingCollaborators || []).map((item) => item.userId))
    if (pendingSet.has(cleanInviteeUserId)) {
      return null
    }
    const hasPendingDuplicate = state.invitationsSent.some(
      (invitation) =>
        invitation.workspaceId === cleanWorkspaceId &&
        invitation.inviteeUserId === cleanInviteeUserId &&
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
      inviteeUserId: cleanInviteeUserId,
      role: cleanRole,
      invitedAt: nowIso(),
      status: 'pending',
    }
    const nextInvitationsSent = [nextInvitation, ...state.invitationsSent]
    const nextWorkspaces = state.workspaces.map((item) => {
      if (item.id !== cleanWorkspaceId) {
        return item
      }
      const pendingParticipant = {
        userId: cleanInviteeUserId,
        name: cleanInviteeName,
      }
      const nextPendingCollaborators = normalizePendingCollaborators(
        upsertParticipant(item.pendingCollaborators || [], pendingParticipant),
        item.collaborators,
        item.removedCollaborators,
        item.id,
      )
      return {
        ...item,
        pendingCollaborators: nextPendingCollaborators,
        pendingCollaboratorRoles: normalizeCollaboratorRoles(
          {
            ...(item.pendingCollaboratorRoles || {}),
            [cleanInviteeUserId]: cleanRole,
          },
          nextPendingCollaborators,
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
        inviteeUserId: cleanInviteeUserId,
        inviteeName: cleanInviteeName,
        role: cleanRole,
        invitedAt: nextInvitation.invitedAt,
        status: nextInvitation.status,
      }),
    )
    return nextInvitation
  },
  acceptAuthorRequest: async (requestId) => {
    const cleanRequestId = trimValue(requestId)
    if (!cleanRequestId) {
      return {
        success: false,
        invitationType: null,
        workspaceId: null,
        acceptedAssetId: null,
      }
    }
    const currentUserId = currentWorkspaceUserId()
    if (!currentUserId) {
      return {
        success: false,
        invitationType: null,
        workspaceId: null,
        acceptedAssetId: null,
      }
    }
    if (!getAuthSessionToken()) {
      return {
        success: false,
        invitationType: null,
        workspaceId: null,
        acceptedAssetId: null,
      }
    }
    const state = get()
    const request = state.authorRequests.find((item) => item.id === cleanRequestId)
    if (!request) {
      return {
        success: false,
        invitationType: null,
        workspaceId: null,
        acceptedAssetId: null,
      }
    }
    if (request.invitationType === 'data') {
      const nextAuthorRequests = state.authorRequests.filter((item) => item.id !== cleanRequestId)
      persistSnapshotLocal({
        workspaces: state.workspaces,
        activeWorkspaceId: state.activeWorkspaceId,
        authorRequests: nextAuthorRequests,
        invitationsSent: state.invitationsSent,
      })
      set({ authorRequests: nextAuthorRequests })
      const remoteResult = await runRemoteWorkspaceActionWithResult(async (token) => {
        const result = await acceptWorkspaceAuthorRequestApi(token, cleanRequestId)
        await get().hydrateFromRemote()
        return result
      })
      if (!remoteResult) {
        return {
          success: false,
          invitationType: 'data',
          workspaceId: null,
          acceptedAssetId: null,
        }
      }
      return {
        success: true,
        invitationType: 'data',
        workspaceId: null,
        acceptedAssetId: remoteResult.acceptedAssetId || request.workspaceId || null,
      }
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
      existingWorkspace.ownerUserId &&
      existingWorkspace.ownerUserId === request.authorUserId,
    )

    let acceptedWorkspaceId = requestedWorkspaceId
    if (existingWorkspace && !canReuseExistingWorkspace) {
      acceptedWorkspaceId = `${requestedWorkspaceId}-${Date.now().toString(36)}`
    }

    const acceptedAt = nowIso()
    const currentParticipant = {
      userId: currentUserId,
      name: currentCollaboratorName(),
    }
    const nextWorkspace: WorkspaceRecord = {
      id: acceptedWorkspaceId,
      name: request.workspaceName,
      ownerName: request.authorName,
      ownerUserId: request.authorUserId,
      collaborators: [currentParticipant],
      pendingCollaborators: [],
      collaboratorRoles: {
        [currentUserId]: normalizeCollaboratorRole(request.collaboratorRole),
      },
      pendingCollaboratorRoles: {},
      removedCollaborators: [],
      version: '0.1',
      health: 'amber',
      updatedAt: acceptedAt,
      pinned: false,
      archived: false,
      ownerArchived: false,
      auditLogEntries: [
        {
          id: `${acceptedWorkspaceId}-audit-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
          workspaceId: acceptedWorkspaceId,
          category: 'invitation_decisions',
          eventType: 'invitation_accepted',
          actorUserId: currentUserId,
          actorName: currentParticipant.name,
          subjectUserId: currentUserId,
          subjectName: currentParticipant.name,
          fromValue: 'pending',
          toValue: 'accepted',
          role: normalizeCollaboratorRole(request.collaboratorRole),
          message: `${currentParticipant.name} collaborator invitation status switched from pending to accepted by ${currentParticipant.name} as ${normalizeCollaboratorRole(request.collaboratorRole)}.`,
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
    const remoteResult = await runRemoteWorkspaceActionWithResult(async (token) => {
      const result = await acceptWorkspaceAuthorRequestApi(token, cleanRequestId)
      await get().hydrateFromRemote()
      return result
    })
    if (!remoteResult) {
      return {
        success: false,
        invitationType: 'workspace',
        workspaceId: null,
        acceptedAssetId: null,
      }
    }
    return {
      success: true,
      invitationType: 'workspace',
      workspaceId: remoteResult.workspace?.id || nextWorkspace.id,
      acceptedAssetId: null,
    }
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

    const inviteeUserId = normalizeWorkspaceUserId(invitation.inviteeUserId || '')
    if (!inviteeUserId) {
      return null
    }
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
          (participant) => participant.userId !== inviteeUserId,
        ),
        workspace.collaborators,
        workspace.removedCollaborators,
        workspace.id,
      )
      const nextPendingCollaboratorRoles = normalizeCollaboratorRoles(
        Object.fromEntries(
          Object.entries(workspace.pendingCollaboratorRoles || {}).filter(
            ([participantUserId]) => participantUserId !== inviteeUserId,
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
