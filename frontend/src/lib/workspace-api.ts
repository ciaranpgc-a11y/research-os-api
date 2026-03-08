import { API_BASE_URL } from '@/lib/api'
import type { ApiErrorPayload } from '@/types/insight'

export type WorkspaceStatePayload = {
  workspaces: Array<{
    id: string
    name: string
    ownerName: string
    ownerUserId: string | null
    collaborators: Array<{
      userId: string
      name: string
    }>
    pendingCollaborators: Array<{
      userId: string
      name: string
    }>
    collaboratorRoles: Record<string, 'editor' | 'reviewer' | 'viewer'>
    pendingCollaboratorRoles: Record<string, 'editor' | 'reviewer' | 'viewer'>
    removedCollaborators: Array<{
      userId: string
      name: string
    }>
    version: string
    health: 'green' | 'amber' | 'red'
    updatedAt: string
    pinned: boolean
    archived: boolean
    ownerArchived: boolean
    auditLogEntries?: Array<{
      id: string
      workspaceId: string
      category: 'collaborator_changes' | 'invitation_decisions' | 'workspace_changes' | 'conversation'
      eventType?: string | null
      actorUserId?: string | null
      actorName?: string | null
      subjectUserId?: string | null
      subjectName?: string | null
      fromValue?: string | null
      toValue?: string | null
      role?: 'editor' | 'reviewer' | 'viewer' | null
      metadata?: Record<string, unknown>
      message: string
      createdAt: string
    }>
  }>
  activeWorkspaceId: string | null
  authorRequests: Array<{
    id: string
    workspaceId: string
    workspaceName: string
    authorName: string
    authorUserId: string | null
    invitationType?: 'workspace' | 'data'
    collaboratorRole: 'editor' | 'reviewer' | 'viewer'
    invitedAt: string
  }>
  invitationsSent: Array<{
    id: string
    workspaceId: string
    workspaceName: string
    inviteeName: string
    inviteeUserId: string | null
    invitationType?: 'workspace' | 'data'
    role: 'editor' | 'reviewer' | 'viewer'
    invitedAt: string
    status: 'pending' | 'accepted' | 'declined'
  }>
}

export type WorkspaceAccountSearchResult = {
  userId: string
  name: string
  email: string
}

export type WorkspaceInboxStatePayload = {
  messages: Array<{
    id: string
    workspaceId: string
    senderName: string
    encryptedBody: string
    iv: string
    createdAt: string
  }>
  reads: Record<string, Record<string, string>>
}

async function parseApiError(response: Response, fallback: string): Promise<string> {
  try {
    const payload = (await response.json()) as ApiErrorPayload
    return payload.error?.detail || payload.error?.message || fallback
  } catch {
    return fallback
  }
}

function authHeaders(token: string): Record<string, string> {
  const clean = token.trim()
  if (!clean) {
    return {}
  }
  return { Authorization: `Bearer ${clean}` }
}

async function requestJson<T>(url: string, init: RequestInit, fallbackError: string): Promise<T> {
  const response = await fetch(url, init)
  if (!response.ok) {
    throw new Error(await parseApiError(response, `${fallbackError} (${response.status})`))
  }
  return (await response.json()) as T
}

type WorkspaceStateApiPayload = {
  workspaces: Array<{
    id: string
    name: string
    owner_name: string
    owner_user_id: string | null
    collaborators: Array<{
      user_id: string
      name: string
    }>
    pending_collaborators: Array<{
      user_id: string
      name: string
    }>
    collaborator_roles: Record<string, 'editor' | 'reviewer' | 'viewer'>
    pending_collaborator_roles: Record<string, 'editor' | 'reviewer' | 'viewer'>
    removed_collaborators: Array<{
      user_id: string
      name: string
    }>
    version: string
    health: 'green' | 'amber' | 'red'
    updated_at: string
    pinned: boolean
    archived: boolean
    owner_archived: boolean
    audit_log_entries?: Array<{
      id: string
      workspace_id: string
      category: 'collaborator_changes' | 'invitation_decisions' | 'workspace_changes' | 'conversation'
      event_type?: string | null
      actor_user_id?: string | null
      actor_name?: string | null
      subject_user_id?: string | null
      subject_name?: string | null
      from_value?: string | null
      to_value?: string | null
      role?: 'editor' | 'reviewer' | 'viewer' | null
      metadata?: Record<string, unknown>
      message: string
      created_at: string
    }>
  }>
  active_workspace_id: string | null
  author_requests: Array<{
    id: string
    workspace_id: string
    workspace_name: string
    author_name: string
    author_user_id: string | null
    invitation_type?: 'workspace' | 'data'
    collaborator_role: 'editor' | 'reviewer' | 'viewer'
    invited_at: string
  }>
  invitations_sent: Array<{
    id: string
    workspace_id: string
    workspace_name: string
    invitee_name: string
    invitee_user_id: string | null
    invitation_type?: 'workspace' | 'data'
    role: 'editor' | 'reviewer' | 'viewer'
    invited_at: string
    status: 'pending' | 'accepted' | 'declined'
  }>
}

type WorkspaceInboxStateApiPayload = {
  messages: Array<{
    id: string
    workspace_id: string
    sender_name: string
    encrypted_body: string
    iv: string
    created_at: string
  }>
  reads: Record<string, Record<string, string>>
}

type WorkspaceRecordApiPayload = WorkspaceStateApiPayload['workspaces'][number]
type WorkspaceAuthorRequestApiPayload = WorkspaceStateApiPayload['author_requests'][number]
type WorkspaceInvitationApiPayload = WorkspaceStateApiPayload['invitations_sent'][number]
type WorkspaceInboxMessageApiPayload = WorkspaceInboxStateApiPayload['messages'][number]

type WorkspaceListApiPayload = {
  items: WorkspaceRecordApiPayload[]
  active_workspace_id: string | null
}

type WorkspaceDeleteApiPayload = {
  success: boolean
  active_workspace_id: string | null
}

type WorkspaceActiveApiPayload = {
  active_workspace_id: string | null
}

type WorkspaceAuthorRequestsApiPayload = {
  items: WorkspaceAuthorRequestApiPayload[]
}

type WorkspaceAuthorRequestAcceptApiPayload = {
  workspace?: WorkspaceRecordApiPayload | null
  removed_request_id: string
  invitation_type?: 'workspace' | 'data'
  accepted_asset_id?: string | null
}

type WorkspaceAuthorRequestDeclineApiPayload = {
  success: boolean
  removed_request_id: string
}

type WorkspaceInvitationsApiPayload = {
  items: WorkspaceInvitationApiPayload[]
}

type WorkspaceAccountSearchApiPayload = {
  items: Array<{
    user_id: string
    name: string
    email: string
  }>
}

type WorkspaceInboxMessagesApiPayload = {
  items: WorkspaceInboxMessageApiPayload[]
}

type WorkspaceInboxReadsApiPayload = {
  reads: Record<string, Record<string, string>>
}

type WorkspaceInboxReadMarkApiPayload = {
  workspace_id: string
  reader_key: string
  read_at: string
}

function workspaceParticipantFromApi(item: {
  user_id: string
  name: string
}): { userId: string; name: string } {
  return {
    userId: String(item.user_id || '').trim(),
    name: String(item.name || '').trim(),
  }
}

function workspaceParticipantToApi(item: {
  userId: string
  name: string
}): {
  user_id: string
  name: string
} {
  return {
    user_id: item.userId,
    name: item.name,
  }
}

function workspaceRecordFromApi(item: WorkspaceRecordApiPayload): WorkspaceStatePayload['workspaces'][number] {
  return {
    id: item.id,
    name: item.name,
    ownerName: item.owner_name,
    ownerUserId: item.owner_user_id || null,
    collaborators: (item.collaborators || []).map(workspaceParticipantFromApi),
    pendingCollaborators: (item.pending_collaborators || []).map(workspaceParticipantFromApi),
    collaboratorRoles: item.collaborator_roles || {},
    pendingCollaboratorRoles: item.pending_collaborator_roles || {},
    removedCollaborators: (item.removed_collaborators || []).map(workspaceParticipantFromApi),
    version: item.version,
    health: item.health,
    updatedAt: item.updated_at,
    pinned: Boolean(item.pinned),
    archived: Boolean(item.archived),
    ownerArchived: Boolean(item.owner_archived),
    auditLogEntries: (item.audit_log_entries || []).map((entry) => ({
      id: entry.id,
      workspaceId: entry.workspace_id || item.id,
      category:
        entry.category === 'invitation_decisions'
          ? 'invitation_decisions'
          : entry.category === 'workspace_changes'
            ? 'workspace_changes'
            : entry.category === 'conversation'
              ? 'conversation'
              : 'collaborator_changes',
      eventType: entry.event_type || null,
      actorUserId: entry.actor_user_id || null,
      actorName: entry.actor_name || null,
      subjectUserId: entry.subject_user_id || null,
      subjectName: entry.subject_name || null,
      fromValue: entry.from_value || null,
      toValue: entry.to_value || null,
      role: entry.role || null,
      metadata: entry.metadata || undefined,
      message: entry.message || '',
      createdAt: entry.created_at,
    })),
  }
}

function workspaceAuthorRequestFromApi(
  item: WorkspaceAuthorRequestApiPayload,
): WorkspaceStatePayload['authorRequests'][number] {
  return {
    id: item.id,
    workspaceId: item.workspace_id,
    workspaceName: item.workspace_name,
    authorName: item.author_name,
    authorUserId: item.author_user_id || null,
    invitationType: item.invitation_type === 'data' ? 'data' : 'workspace',
    collaboratorRole: item.collaborator_role || 'editor',
    invitedAt: item.invited_at,
  }
}

function workspaceInvitationFromApi(
  item: WorkspaceInvitationApiPayload,
): WorkspaceStatePayload['invitationsSent'][number] {
  return {
    id: item.id,
    workspaceId: item.workspace_id,
    workspaceName: item.workspace_name,
    inviteeName: item.invitee_name,
    inviteeUserId: item.invitee_user_id || null,
    invitationType: item.invitation_type === 'data' ? 'data' : 'workspace',
    role: item.role || 'editor',
    invitedAt: item.invited_at,
    status: item.status,
  }
}

function workspaceInboxMessageFromApi(
  item: WorkspaceInboxMessageApiPayload,
): WorkspaceInboxStatePayload['messages'][number] {
  return {
    id: item.id,
    workspaceId: item.workspace_id,
    senderName: item.sender_name,
    encryptedBody: item.encrypted_body,
    iv: item.iv,
    createdAt: item.created_at,
  }
}

function workspaceStateFromApi(payload: WorkspaceStateApiPayload): WorkspaceStatePayload {
  return {
    workspaces: (payload.workspaces || []).map(workspaceRecordFromApi),
    activeWorkspaceId: payload.active_workspace_id || null,
    authorRequests: (payload.author_requests || []).map(workspaceAuthorRequestFromApi),
    invitationsSent: (payload.invitations_sent || []).map(workspaceInvitationFromApi),
  }
}

function workspaceStateToApi(payload: WorkspaceStatePayload): WorkspaceStateApiPayload {
  return {
    workspaces: payload.workspaces.map((item) => ({
      id: item.id,
      name: item.name,
      owner_name: item.ownerName,
      owner_user_id: item.ownerUserId,
      collaborators: (item.collaborators || []).map(workspaceParticipantToApi),
      pending_collaborators: (item.pendingCollaborators || []).map(workspaceParticipantToApi),
      collaborator_roles: item.collaboratorRoles || {},
      pending_collaborator_roles: item.pendingCollaboratorRoles || {},
      removed_collaborators: (item.removedCollaborators || []).map(workspaceParticipantToApi),
      version: item.version,
      health: item.health,
      updated_at: item.updatedAt,
      pinned: Boolean(item.pinned),
      archived: Boolean(item.archived),
      owner_archived: Boolean(item.ownerArchived),
      audit_log_entries: (item.auditLogEntries || []).map((entry) => ({
        id: entry.id,
        workspace_id: entry.workspaceId || item.id,
        category: entry.category,
        event_type: entry.eventType || null,
        actor_user_id: entry.actorUserId || null,
        actor_name: entry.actorName || null,
        subject_user_id: entry.subjectUserId || null,
        subject_name: entry.subjectName || null,
        from_value: entry.fromValue || null,
        to_value: entry.toValue || null,
        role: entry.role || null,
        metadata: entry.metadata || undefined,
        message: entry.message,
        created_at: entry.createdAt,
      })),
    })),
    active_workspace_id: payload.activeWorkspaceId,
    author_requests: payload.authorRequests.map((item) => ({
      id: item.id,
      workspace_id: item.workspaceId,
      workspace_name: item.workspaceName,
      author_name: item.authorName,
      author_user_id: item.authorUserId,
      invitation_type: item.invitationType === 'data' ? 'data' : 'workspace',
      collaborator_role: item.collaboratorRole || 'editor',
      invited_at: item.invitedAt,
    })),
    invitations_sent: payload.invitationsSent.map((item) => ({
      id: item.id,
      workspace_id: item.workspaceId,
      workspace_name: item.workspaceName,
      invitee_name: item.inviteeName,
      invitee_user_id: item.inviteeUserId,
      invitation_type: item.invitationType === 'data' ? 'data' : 'workspace',
      role: item.role || 'editor',
      invited_at: item.invitedAt,
      status: item.status,
    })),
  }
}

function workspaceInboxFromApi(payload: WorkspaceInboxStateApiPayload): WorkspaceInboxStatePayload {
  return {
    messages: (payload.messages || []).map(workspaceInboxMessageFromApi),
    reads: payload.reads || {},
  }
}

function workspaceInboxToApi(payload: WorkspaceInboxStatePayload): WorkspaceInboxStateApiPayload {
  return {
    messages: payload.messages.map((item) => ({
      id: item.id,
      workspace_id: item.workspaceId,
      sender_name: item.senderName,
      encrypted_body: item.encryptedBody,
      iv: item.iv,
      created_at: item.createdAt,
    })),
    reads: payload.reads || {},
  }
}

export async function fetchWorkspaceState(token: string): Promise<WorkspaceStatePayload> {
  const payload = await requestJson<WorkspaceStateApiPayload>(
    `${API_BASE_URL}/v1/workspaces/state`,
    {
      method: 'GET',
      headers: authHeaders(token),
    },
    'Workspace state lookup failed',
  )
  return workspaceStateFromApi(payload)
}

export async function saveWorkspaceState(
  token: string,
  payload: WorkspaceStatePayload,
): Promise<WorkspaceStatePayload> {
  const result = await requestJson<WorkspaceStateApiPayload>(
    `${API_BASE_URL}/v1/workspaces/state`,
    {
      method: 'PUT',
      headers: { ...authHeaders(token), 'Content-Type': 'application/json' },
      body: JSON.stringify(workspaceStateToApi(payload)),
    },
    'Workspace state save failed',
  )
  return workspaceStateFromApi(result)
}

export async function fetchWorkspaceInboxState(token: string): Promise<WorkspaceInboxStatePayload> {
  const payload = await requestJson<WorkspaceInboxStateApiPayload>(
    `${API_BASE_URL}/v1/workspaces/inbox/state`,
    {
      method: 'GET',
      headers: authHeaders(token),
    },
    'Workspace inbox state lookup failed',
  )
  return workspaceInboxFromApi(payload)
}

export async function saveWorkspaceInboxState(
  token: string,
  payload: WorkspaceInboxStatePayload,
): Promise<WorkspaceInboxStatePayload> {
  const result = await requestJson<WorkspaceInboxStateApiPayload>(
    `${API_BASE_URL}/v1/workspaces/inbox/state`,
    {
      method: 'PUT',
      headers: { ...authHeaders(token), 'Content-Type': 'application/json' },
      body: JSON.stringify(workspaceInboxToApi(payload)),
    },
    'Workspace inbox state save failed',
  )
  return workspaceInboxFromApi(result)
}

export async function listWorkspaces(token: string): Promise<{
  items: WorkspaceStatePayload['workspaces']
  activeWorkspaceId: string | null
}> {
  const payload = await requestJson<WorkspaceListApiPayload>(
    `${API_BASE_URL}/v1/workspaces`,
    {
      method: 'GET',
      headers: authHeaders(token),
    },
    'Workspace list lookup failed',
  )
  return {
    items: (payload.items || []).map(workspaceRecordFromApi),
    activeWorkspaceId: payload.active_workspace_id || null,
  }
}

export async function createWorkspaceRecordApi(
  token: string,
  payload: WorkspaceStatePayload['workspaces'][number],
): Promise<WorkspaceStatePayload['workspaces'][number]> {
  const result = await requestJson<WorkspaceRecordApiPayload>(
    `${API_BASE_URL}/v1/workspaces`,
    {
      method: 'POST',
      headers: { ...authHeaders(token), 'Content-Type': 'application/json' },
      body: JSON.stringify({
        id: payload.id,
        name: payload.name,
        owner_name: payload.ownerName,
        owner_user_id: payload.ownerUserId,
        collaborators: (payload.collaborators || []).map(workspaceParticipantToApi),
        pending_collaborators: (payload.pendingCollaborators || []).map(workspaceParticipantToApi),
        collaborator_roles: payload.collaboratorRoles || {},
        pending_collaborator_roles: payload.pendingCollaboratorRoles || {},
        removed_collaborators: (payload.removedCollaborators || []).map(workspaceParticipantToApi),
        version: payload.version,
        health: payload.health,
        updated_at: payload.updatedAt,
        pinned: Boolean(payload.pinned),
        archived: Boolean(payload.archived),
        owner_archived: Boolean(payload.ownerArchived),
        audit_log_entries: (payload.auditLogEntries || []).map((entry) => ({
          id: entry.id,
          workspace_id: entry.workspaceId || payload.id,
          category: entry.category,
          message: entry.message,
          created_at: entry.createdAt,
        })),
      }),
    },
    'Workspace create failed',
  )
  return workspaceRecordFromApi(result)
}

export async function updateWorkspaceRecordApi(
  token: string,
  workspaceId: string,
  patch: Partial<WorkspaceStatePayload['workspaces'][number]>,
): Promise<WorkspaceStatePayload['workspaces'][number]> {
  const result = await requestJson<WorkspaceRecordApiPayload>(
    `${API_BASE_URL}/v1/workspaces/${encodeURIComponent(workspaceId)}`,
    {
      method: 'PATCH',
      headers: { ...authHeaders(token), 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ...(patch.name !== undefined ? { name: patch.name } : {}),
        ...(patch.ownerName !== undefined ? { owner_name: patch.ownerName } : {}),
        ...(patch.ownerUserId !== undefined ? { owner_user_id: patch.ownerUserId } : {}),
        ...(patch.collaborators !== undefined
          ? { collaborators: patch.collaborators.map(workspaceParticipantToApi) }
          : {}),
        ...(patch.pendingCollaborators !== undefined
          ? { pending_collaborators: patch.pendingCollaborators.map(workspaceParticipantToApi) }
          : {}),
        ...(patch.collaboratorRoles !== undefined
          ? { collaborator_roles: patch.collaboratorRoles }
          : {}),
        ...(patch.pendingCollaboratorRoles !== undefined
          ? { pending_collaborator_roles: patch.pendingCollaboratorRoles }
          : {}),
        ...(patch.removedCollaborators !== undefined
          ? { removed_collaborators: patch.removedCollaborators.map(workspaceParticipantToApi) }
          : {}),
        ...(patch.version !== undefined ? { version: patch.version } : {}),
        ...(patch.health !== undefined ? { health: patch.health } : {}),
        ...(patch.updatedAt !== undefined ? { updated_at: patch.updatedAt } : {}),
        ...(patch.pinned !== undefined ? { pinned: patch.pinned } : {}),
        ...(patch.archived !== undefined ? { archived: patch.archived } : {}),
        ...(patch.ownerArchived !== undefined ? { owner_archived: patch.ownerArchived } : {}),
        ...(patch.auditLogEntries !== undefined
          ? {
              audit_log_entries: patch.auditLogEntries.map((entry) => ({
                id: entry.id,
                workspace_id: entry.workspaceId || workspaceId,
                category: entry.category,
                event_type: entry.eventType || null,
                actor_user_id: entry.actorUserId || null,
                actor_name: entry.actorName || null,
                subject_user_id: entry.subjectUserId || null,
                subject_name: entry.subjectName || null,
                from_value: entry.fromValue || null,
                to_value: entry.toValue || null,
                role: entry.role || null,
                metadata: entry.metadata || undefined,
                message: entry.message,
                created_at: entry.createdAt,
              })),
            }
          : {}),
      }),
    },
    'Workspace update failed',
  )
  return workspaceRecordFromApi(result)
}

export async function deleteWorkspaceRecordApi(
  token: string,
  workspaceId: string,
): Promise<{ success: boolean; activeWorkspaceId: string | null }> {
  const result = await requestJson<WorkspaceDeleteApiPayload>(
    `${API_BASE_URL}/v1/workspaces/${encodeURIComponent(workspaceId)}`,
    {
      method: 'DELETE',
      headers: authHeaders(token),
    },
    'Workspace delete failed',
  )
  return {
    success: Boolean(result.success),
    activeWorkspaceId: result.active_workspace_id || null,
  }
}

export async function setActiveWorkspaceApi(
  token: string,
  workspaceId: string | null,
): Promise<{ activeWorkspaceId: string | null }> {
  const result = await requestJson<WorkspaceActiveApiPayload>(
    `${API_BASE_URL}/v1/workspaces/active`,
    {
      method: 'PUT',
      headers: { ...authHeaders(token), 'Content-Type': 'application/json' },
      body: JSON.stringify({ workspace_id: workspaceId }),
    },
    'Set active workspace failed',
  )
  return { activeWorkspaceId: result.active_workspace_id || null }
}

export async function listWorkspaceAuthorRequestsApi(
  token: string,
): Promise<WorkspaceStatePayload['authorRequests']> {
  const payload = await requestJson<WorkspaceAuthorRequestsApiPayload>(
    `${API_BASE_URL}/v1/workspaces/author-requests`,
    {
      method: 'GET',
      headers: authHeaders(token),
    },
    'Author requests lookup failed',
  )
  return (payload.items || []).map(workspaceAuthorRequestFromApi)
}

export async function acceptWorkspaceAuthorRequestApi(
  token: string,
  requestId: string,
): Promise<{
  workspace: WorkspaceStatePayload['workspaces'][number] | null
  removedRequestId: string
  invitationType: 'workspace' | 'data'
  acceptedAssetId: string | null
}> {
  const payload = await requestJson<WorkspaceAuthorRequestAcceptApiPayload>(
    `${API_BASE_URL}/v1/workspaces/author-requests/${encodeURIComponent(requestId)}/accept`,
    {
      method: 'POST',
      headers: { ...authHeaders(token), 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    },
    'Author request accept failed',
  )
  return {
    workspace: payload.workspace ? workspaceRecordFromApi(payload.workspace) : null,
    removedRequestId: payload.removed_request_id,
    invitationType: payload.invitation_type === 'data' ? 'data' : 'workspace',
    acceptedAssetId: payload.accepted_asset_id || null,
  }
}

export async function declineWorkspaceAuthorRequestApi(
  token: string,
  requestId: string,
): Promise<{ success: boolean; removedRequestId: string }> {
  const payload = await requestJson<WorkspaceAuthorRequestDeclineApiPayload>(
    `${API_BASE_URL}/v1/workspaces/author-requests/${encodeURIComponent(requestId)}/decline`,
    {
      method: 'POST',
      headers: authHeaders(token),
    },
    'Author request decline failed',
  )
  return {
    success: Boolean(payload.success),
    removedRequestId: payload.removed_request_id,
  }
}

export async function listWorkspaceInvitationsSentApi(
  token: string,
): Promise<WorkspaceStatePayload['invitationsSent']> {
  const payload = await requestJson<WorkspaceInvitationsApiPayload>(
    `${API_BASE_URL}/v1/workspaces/invitations/sent`,
    {
      method: 'GET',
      headers: authHeaders(token),
    },
    'Invitations lookup failed',
  )
  return (payload.items || []).map(workspaceInvitationFromApi)
}

export async function createWorkspaceInvitationApi(
  token: string,
  input: {
    workspaceId: string
    inviteeUserId: string
    inviteeName: string
    role: 'editor' | 'reviewer' | 'viewer'
    invitedAt?: string
    status?: 'pending' | 'accepted' | 'declined'
  },
): Promise<WorkspaceStatePayload['invitationsSent'][number]> {
  const payload = await requestJson<WorkspaceInvitationApiPayload>(
    `${API_BASE_URL}/v1/workspaces/invitations/sent`,
    {
      method: 'POST',
      headers: { ...authHeaders(token), 'Content-Type': 'application/json' },
      body: JSON.stringify({
        workspace_id: input.workspaceId,
        invitee_user_id: input.inviteeUserId,
        invitee_name: input.inviteeName,
        role: input.role,
        invited_at: input.invitedAt || null,
        status: input.status || 'pending',
      }),
    },
    'Invitation create failed',
  )
  return workspaceInvitationFromApi(payload)
}

export async function searchWorkspaceAccountsApi(
  token: string,
  query: string,
  limit = 8,
): Promise<WorkspaceAccountSearchResult[]> {
  const params = new URLSearchParams()
  params.set('q', query.trim())
  params.set('limit', String(limit))
  const payload = await requestJson<WorkspaceAccountSearchApiPayload>(
    `${API_BASE_URL}/v1/workspaces/accounts/search?${params.toString()}`,
    {
      method: 'GET',
      headers: authHeaders(token),
    },
    'Workspace account search failed',
  )
  return (payload.items || []).map((item) => ({
    userId: String(item.user_id || '').trim(),
    name: String(item.name || '').trim(),
    email: String(item.email || '').trim(),
  }))
}

export async function updateWorkspaceInvitationStatusApi(
  token: string,
  invitationId: string,
  status: 'pending' | 'accepted' | 'declined',
): Promise<WorkspaceStatePayload['invitationsSent'][number]> {
  const payload = await requestJson<WorkspaceInvitationApiPayload>(
    `${API_BASE_URL}/v1/workspaces/invitations/sent/${encodeURIComponent(invitationId)}`,
    {
      method: 'PATCH',
      headers: { ...authHeaders(token), 'Content-Type': 'application/json' },
      body: JSON.stringify({ status }),
    },
    'Invitation status update failed',
  )
  return workspaceInvitationFromApi(payload)
}

export async function listWorkspaceInboxMessagesApi(
  token: string,
  workspaceId?: string,
): Promise<WorkspaceInboxStatePayload['messages']> {
  const params = new URLSearchParams()
  if ((workspaceId || '').trim()) {
    params.set('workspace_id', workspaceId!.trim())
  }
  const query = params.toString()
  const payload = await requestJson<WorkspaceInboxMessagesApiPayload>(
    `${API_BASE_URL}/v1/workspaces/inbox/messages${query ? `?${query}` : ''}`,
    {
      method: 'GET',
      headers: authHeaders(token),
    },
    'Inbox messages lookup failed',
  )
  return (payload.items || []).map(workspaceInboxMessageFromApi)
}

export async function createWorkspaceInboxMessageApi(
  token: string,
  message: WorkspaceInboxStatePayload['messages'][number],
): Promise<WorkspaceInboxStatePayload['messages'][number]> {
  const payload = await requestJson<WorkspaceInboxMessageApiPayload>(
    `${API_BASE_URL}/v1/workspaces/inbox/messages`,
    {
      method: 'POST',
      headers: { ...authHeaders(token), 'Content-Type': 'application/json' },
      body: JSON.stringify({
        id: message.id,
        workspace_id: message.workspaceId,
        sender_name: message.senderName,
        encrypted_body: message.encryptedBody,
        iv: message.iv,
        created_at: message.createdAt,
      }),
    },
    'Inbox message create failed',
  )
  return workspaceInboxMessageFromApi(payload)
}

export async function listWorkspaceInboxReadsApi(
  token: string,
  workspaceId?: string,
): Promise<Record<string, Record<string, string>>> {
  const params = new URLSearchParams()
  if ((workspaceId || '').trim()) {
    params.set('workspace_id', workspaceId!.trim())
  }
  const query = params.toString()
  const payload = await requestJson<WorkspaceInboxReadsApiPayload>(
    `${API_BASE_URL}/v1/workspaces/inbox/reads${query ? `?${query}` : ''}`,
    {
      method: 'GET',
      headers: authHeaders(token),
    },
    'Inbox reads lookup failed',
  )
  return payload.reads || {}
}

export async function markWorkspaceInboxReadApi(
  token: string,
  input: { workspaceId: string; readerName: string; readAt?: string },
): Promise<{ workspaceId: string; readerKey: string; readAt: string }> {
  const payload = await requestJson<WorkspaceInboxReadMarkApiPayload>(
    `${API_BASE_URL}/v1/workspaces/inbox/reads`,
    {
      method: 'PUT',
      headers: { ...authHeaders(token), 'Content-Type': 'application/json' },
      body: JSON.stringify({
        workspace_id: input.workspaceId,
        reader_name: input.readerName,
        read_at: input.readAt || null,
      }),
    },
    'Inbox read mark failed',
  )
  return {
    workspaceId: payload.workspace_id,
    readerKey: payload.reader_key,
    readAt: payload.read_at,
  }
}
