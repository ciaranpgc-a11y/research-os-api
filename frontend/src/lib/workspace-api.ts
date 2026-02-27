import { API_BASE_URL } from '@/lib/api'
import type { ApiErrorPayload } from '@/types/insight'

export type WorkspaceStatePayload = {
  workspaces: Array<{
    id: string
    name: string
    ownerName: string
    collaborators: string[]
    pendingCollaborators: string[]
    collaboratorRoles: Record<string, 'editor' | 'reviewer' | 'viewer'>
    pendingCollaboratorRoles: Record<string, 'editor' | 'reviewer' | 'viewer'>
    removedCollaborators: string[]
    version: string
    health: 'green' | 'amber' | 'red'
    updatedAt: string
    pinned: boolean
    archived: boolean
    auditLogEntries?: Array<{
      id: string
      workspaceId: string
      category: 'collaborator_changes' | 'invitation_decisions'
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
    collaboratorRole: 'editor' | 'reviewer' | 'viewer'
    invitedAt: string
  }>
  invitationsSent: Array<{
    id: string
    workspaceId: string
    workspaceName: string
    inviteeName: string
    role: 'editor' | 'reviewer' | 'viewer'
    invitedAt: string
    status: 'pending' | 'accepted' | 'declined'
  }>
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
    collaborators: string[]
    pending_collaborators: string[]
    collaborator_roles: Record<string, 'editor' | 'reviewer' | 'viewer'>
    pending_collaborator_roles: Record<string, 'editor' | 'reviewer' | 'viewer'>
    removed_collaborators: string[]
    version: string
    health: 'green' | 'amber' | 'red'
    updated_at: string
    pinned: boolean
    archived: boolean
    audit_log_entries?: Array<{
      id: string
      workspace_id: string
      category: 'collaborator_changes' | 'invitation_decisions'
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
    collaborator_role: 'editor' | 'reviewer' | 'viewer'
    invited_at: string
  }>
  invitations_sent: Array<{
    id: string
    workspace_id: string
    workspace_name: string
    invitee_name: string
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
  workspace: WorkspaceRecordApiPayload
  removed_request_id: string
}

type WorkspaceAuthorRequestDeclineApiPayload = {
  success: boolean
  removed_request_id: string
}

type WorkspaceInvitationsApiPayload = {
  items: WorkspaceInvitationApiPayload[]
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

function workspaceRecordFromApi(item: WorkspaceRecordApiPayload): WorkspaceStatePayload['workspaces'][number] {
  return {
    id: item.id,
    name: item.name,
    ownerName: item.owner_name,
    collaborators: item.collaborators || [],
    pendingCollaborators: item.pending_collaborators || [],
    collaboratorRoles: item.collaborator_roles || {},
    pendingCollaboratorRoles: item.pending_collaborator_roles || {},
    removedCollaborators: item.removed_collaborators || [],
    version: item.version,
    health: item.health,
    updatedAt: item.updated_at,
    pinned: Boolean(item.pinned),
    archived: Boolean(item.archived),
    auditLogEntries: (item.audit_log_entries || []).map((entry) => ({
      id: entry.id,
      workspaceId: entry.workspace_id || item.id,
      category: entry.category === 'invitation_decisions' ? 'invitation_decisions' : 'collaborator_changes',
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
      collaborators: item.collaborators || [],
      pending_collaborators: item.pendingCollaborators || [],
      collaborator_roles: item.collaboratorRoles || {},
      pending_collaborator_roles: item.pendingCollaboratorRoles || {},
      removed_collaborators: item.removedCollaborators || [],
      version: item.version,
      health: item.health,
      updated_at: item.updatedAt,
      pinned: Boolean(item.pinned),
      archived: Boolean(item.archived),
      audit_log_entries: (item.auditLogEntries || []).map((entry) => ({
        id: entry.id,
        workspace_id: entry.workspaceId || item.id,
        category: entry.category,
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
      collaborator_role: item.collaboratorRole || 'editor',
      invited_at: item.invitedAt,
    })),
    invitations_sent: payload.invitationsSent.map((item) => ({
      id: item.id,
      workspace_id: item.workspaceId,
      workspace_name: item.workspaceName,
      invitee_name: item.inviteeName,
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
        collaborators: payload.collaborators || [],
        pending_collaborators: payload.pendingCollaborators || [],
        collaborator_roles: payload.collaboratorRoles || {},
        pending_collaborator_roles: payload.pendingCollaboratorRoles || {},
        removed_collaborators: payload.removedCollaborators || [],
        version: payload.version,
        health: payload.health,
        updated_at: payload.updatedAt,
        pinned: Boolean(payload.pinned),
        archived: Boolean(payload.archived),
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
        ...(patch.collaborators !== undefined ? { collaborators: patch.collaborators } : {}),
        ...(patch.pendingCollaborators !== undefined
          ? { pending_collaborators: patch.pendingCollaborators }
          : {}),
        ...(patch.collaboratorRoles !== undefined
          ? { collaborator_roles: patch.collaboratorRoles }
          : {}),
        ...(patch.pendingCollaboratorRoles !== undefined
          ? { pending_collaborator_roles: patch.pendingCollaboratorRoles }
          : {}),
        ...(patch.removedCollaborators !== undefined
          ? { removed_collaborators: patch.removedCollaborators }
          : {}),
        ...(patch.version !== undefined ? { version: patch.version } : {}),
        ...(patch.health !== undefined ? { health: patch.health } : {}),
        ...(patch.updatedAt !== undefined ? { updated_at: patch.updatedAt } : {}),
        ...(patch.pinned !== undefined ? { pinned: patch.pinned } : {}),
        ...(patch.archived !== undefined ? { archived: patch.archived } : {}),
        ...(patch.auditLogEntries !== undefined
          ? {
              audit_log_entries: patch.auditLogEntries.map((entry) => ({
                id: entry.id,
                workspace_id: entry.workspaceId || workspaceId,
                category: entry.category,
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
  collaboratorName: string | null,
): Promise<{
  workspace: WorkspaceStatePayload['workspaces'][number]
  removedRequestId: string
}> {
  const payload = await requestJson<WorkspaceAuthorRequestAcceptApiPayload>(
    `${API_BASE_URL}/v1/workspaces/author-requests/${encodeURIComponent(requestId)}/accept`,
    {
      method: 'POST',
      headers: { ...authHeaders(token), 'Content-Type': 'application/json' },
      body: JSON.stringify({
        collaborator_name: collaboratorName || null,
      }),
    },
    'Author request accept failed',
  )
  return {
    workspace: workspaceRecordFromApi(payload.workspace),
    removedRequestId: payload.removed_request_id,
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
