import { HttpResponse, http } from 'msw'
import type { CollaboratorPayload } from '@/types/impact'
import type { LibraryAssetRecord } from '@/types/study-core'

import {
  publicationsMetricsEmptyFixture,
  publicationsMetricsHappyFixture,
} from '@/mocks/fixtures/publications-metrics'
import {
  buildPagesReviewWorkspaceApiListPayload,
  buildPagesReviewClaimCitationState,
  buildPagesReviewWorkspaceAuthorRequestsApiPayload,
  buildPagesReviewWorkspaceInboxMessagesApiPayload,
  buildPagesReviewWorkspaceInboxReadsApiPayload,
  buildPagesReviewWorkspaceInboxStateApiPayload,
  buildPagesReviewWorkspaceInvitationsApiPayload,
  buildPagesReviewWorkspaceStateApiPayload,
  pagesReviewCitationLibrary,
  pagesReviewCollaborationSummary,
  pagesReviewCollaborators,
  pagesReviewJournalOptions,
  pagesReviewLibraryAssets,
  pagesReviewLibraryAssetsListPayload,
  pagesReviewTimestamp,
  pagesReviewUser,
  pagesReviewWorkspaceAccountSearchResults,
  pagesReviewWorkspaceAuthorRequests,
  pagesReviewWorkspaceInboxMessages,
  pagesReviewWorkspaceInboxReads,
  pagesReviewWorkspaceInvitations,
  pagesReviewWorkspaceRecords,
  pagesReviewWorkspaceRunContext,
  PAGES_REVIEW_COLLAB_MODE_KEY,
  PAGES_REVIEW_LIBRARY_MODE_KEY,
  PAGES_REVIEW_RUN_CONTEXT_MODE_KEY,
  resolvePagesReviewMockMode,
} from '@/mocks/fixtures/pages-review'

const metricsPath = '*/v1/publications/metrics'

type MetricsMockMode = 'happy' | 'empty' | 'error'

function resolveMetricsMode(value: unknown): MetricsMockMode {
  const normalized = String(value || 'happy').trim().toLowerCase()
  if (normalized === 'empty' || normalized === 'error' || normalized === 'happy') {
    return normalized
  }
  return 'happy'
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms)
  })
}

function resolveMockCurrentUserId(): string {
  if (typeof window === 'undefined') {
    return pagesReviewUser.id
  }
  try {
    const raw = window.localStorage.getItem('aawe_integrations_user_cache')
    const parsed = raw ? JSON.parse(raw) as { id?: unknown } : null
    const currentUserId = String(parsed?.id || '').trim()
    return currentUserId || pagesReviewUser.id
  } catch {
    return pagesReviewUser.id
  }
}

const STORYBOOK_LIBRARY_NAMES: Record<string, string> = {
  'storybook-owner-user': 'Morgan Hale',
  'storybook-editor-user': 'Avery Cole',
  'storybook-reviewer-user': 'Jordan Pike',
  'storybook-viewer-user': 'Riley Hart',
  'storybook-removed-user': 'Casey Moore',
  'user-a-patel': 'A. Patel',
  'user-l-santos': 'L. Santos',
  'nina-brooks': 'Nina Brooks',
  'r-khan': 'R. Khan',
  'leah-morgan': 'Leah Morgan',
  'marta-solis': 'Marta Solis',
  'jonas-weber': 'Jonas Weber',
  'priya-nair': 'Priya Nair',
}

const MOCK_LIBRARY_WORKSPACE_BY_PROJECT_ID: Record<string, { id: string; name: string }> = {
  'project-hf-registry': { id: 'hf-registry-owner', name: 'HF Registry Manuscript' },
  'project-data-dictionary': { id: 'hf-registry-owner', name: 'HF Registry Manuscript' },
  'project-biomarkers': { id: 'hf-registry-owner', name: 'HF Registry Manuscript' },
  'project-figures': { id: 'hf-registry-owner', name: 'HF Registry Manuscript' },
  'project-echo-qc': { id: 'echo-editor', name: 'Echo AI Validation' },
  'project-imaging': { id: 'amyloid-reviewer', name: 'Amyloid Imaging Review' },
  'project-adjudication': { id: 'amyloid-reviewer', name: 'Amyloid Imaging Review' },
  'project-ct-windowing': { id: 'amyloid-reviewer', name: 'Amyloid Imaging Review' },
  'project-recruitment': { id: 'device-viewer', name: 'Device Substudy Draft' },
  'project-follow-up': { id: 'device-viewer', name: 'Device Substudy Draft' },
}

function resolveMockLibraryDisplayName(userId: string | null | undefined, fallback: string | null | undefined): string {
  const cleanUserId = String(userId || '').trim()
  if (cleanUserId && STORYBOOK_LIBRARY_NAMES[cleanUserId]) {
    return STORYBOOK_LIBRARY_NAMES[cleanUserId]
  }
  return String(fallback || '').trim()
}

function resolveMockCurrentUserName(): string {
  return resolveMockLibraryDisplayName(resolveMockCurrentUserId(), pagesReviewUser.name) || pagesReviewUser.name
}

function resolveMockAuthUser() {
  const currentUserId = resolveMockCurrentUserId()
  const currentUserName = resolveMockCurrentUserName()
  const emailLocalPart = currentUserId.replace(/[^a-z0-9]+/gi, '.').replace(/^\.+|\.+$/g, '').toLowerCase() || 'storybook.user'
  return {
    ...pagesReviewUser,
    id: currentUserId,
    name: currentUserName,
    email: `${emailLocalPart}@example.org`,
    updated_at: new Date().toISOString(),
  }
}

function nowIso(): string {
  return new Date().toISOString()
}

function buildId(prefix: string): string {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
}

function findMockWorkspaceRecord(workspaceId: string) {
  return pagesReviewWorkspaceRecords.find((workspace) => workspace.id === workspaceId) || null
}

function workspaceHasOtherActiveMembers(workspaceId: string, currentUserId: string): boolean {
  const workspace = findMockWorkspaceRecord(workspaceId)
  if (!workspace) {
    return false
  }
  const removedIds = new Set((workspace.removedCollaborators || []).map((participant) => String(participant.userId || '').trim()).filter(Boolean))
  return (workspace.collaborators || []).some((participant) => {
    const participantUserId = String(participant.userId || '').trim()
    return Boolean(participantUserId) && participantUserId !== currentUserId && !removedIds.has(participantUserId)
  })
}

function resolveMockWorkspaceContexts(asset: LibraryAssetRecord): Array<{ workspaceId: string; workspaceName: string }> {
  if (Array.isArray(asset.workspace_placements) && asset.workspace_placements.length > 0) {
    return asset.workspace_placements.map((placement) => ({
      workspaceId: String(placement.workspace_id || '').trim(),
      workspaceName: String(placement.workspace_name || '').trim() || String(placement.workspace_id || '').trim(),
    })).filter((placement) => placement.workspaceId)
  }
  const explicitWorkspaceIds = Array.isArray(asset.workspace_ids)
    ? asset.workspace_ids.map((value, index) => ({
      workspaceId: String(value || '').trim(),
      workspaceName: String(asset.workspace_names?.[index] || '').trim() || String(value || '').trim(),
    })).filter((placement) => placement.workspaceId)
    : []
  if (explicitWorkspaceIds.length > 0) {
    return explicitWorkspaceIds
  }
  const explicitWorkspaceId = String(asset.workspace_id || '').trim()
  const explicitWorkspaceName = String(asset.workspace_name || '').trim()
  if (explicitWorkspaceId) {
    const knownWorkspace = Object.values(MOCK_LIBRARY_WORKSPACE_BY_PROJECT_ID).find(
      (workspace) => workspace.id === explicitWorkspaceId,
    )
    return [{
      workspaceId: explicitWorkspaceId,
      workspaceName: explicitWorkspaceName || knownWorkspace?.name || explicitWorkspaceId,
    }]
  }
  const projectId = String(asset.project_id || '').trim()
  if (!projectId) {
    return []
  }
  const workspace = MOCK_LIBRARY_WORKSPACE_BY_PROJECT_ID[projectId]
  return workspace
    ? [{
      workspaceId: workspace.id,
      workspaceName: workspace.name,
    }]
    : []
}

function resolveMockWorkspaceRole(
  asset: LibraryAssetRecord,
  currentUserId: string,
): 'owner' | 'editor' | 'reviewer' | 'viewer' | null {
  for (const workspaceContext of resolveMockWorkspaceContexts(asset)) {
    const workspace = findMockWorkspaceRecord(workspaceContext.workspaceId)
    if (!workspace) {
      continue
    }
    if (String(workspace.ownerUserId || '').trim() === currentUserId) {
      return 'owner'
    }
    const removedIds = new Set((workspace.removedCollaborators || []).map((participant) => String(participant.userId || '').trim()).filter(Boolean))
    if (removedIds.has(currentUserId)) {
      continue
    }
    const role = workspace.collaboratorRoles?.[currentUserId] || null
    if (role) {
      return role
    }
  }
  return null
}

function sortByUploadedAt(records: typeof pagesReviewLibraryAssets, direction: 'asc' | 'desc') {
  return [...records].sort((left, right) => {
    const delta = Date.parse(left.uploaded_at) - Date.parse(right.uploaded_at)
    return direction === 'asc' ? delta : -delta
  })
}

function sortByFilename(records: typeof pagesReviewLibraryAssets, direction: 'asc' | 'desc') {
  return [...records].sort((left, right) => {
    const delta = left.filename.localeCompare(right.filename)
    return direction === 'asc' ? delta : -delta
  })
}

function sortBySize(records: typeof pagesReviewLibraryAssets, direction: 'asc' | 'desc') {
  return [...records].sort((left, right) => {
    const delta = left.byte_size - right.byte_size
    return direction === 'asc' ? delta : -delta
  })
}

function sortByOwner(records: typeof pagesReviewLibraryAssets, direction: 'asc' | 'desc') {
  return [...records].sort((left, right) => {
    const leftValue = String(left.owner_name || '').toLowerCase()
    const rightValue = String(right.owner_name || '').toLowerCase()
    const delta = leftValue.localeCompare(rightValue)
    return direction === 'asc' ? delta : -delta
  })
}

function mockAssetIsSharedByCurrentUser(asset: LibraryAssetRecord, currentUserId: string): boolean {
  if (asset.owner_user_id !== currentUserId) {
    return false
  }
  if ((asset.shared_with || []).some((member) => member.user_id !== currentUserId)) {
    return true
  }
  if ((asset.pending_with || []).some((member) => member.user_id !== currentUserId)) {
    return true
  }
  return resolveMockWorkspaceContexts(asset).some((workspace) =>
    workspaceHasOtherActiveMembers(workspace.workspaceId, currentUserId),
  )
}

function listLibraryAssetsForRequest(request: Request) {
  const url = new URL(request.url)
  const workspaceId = String(url.searchParams.get('workspace_id') || '').trim()
  const query = String(url.searchParams.get('query') || '').trim().toLowerCase()
  const ownership = String(url.searchParams.get('ownership') || 'all').trim().toLowerCase()
  const scope = String(url.searchParams.get('scope') || 'all').trim().toLowerCase()
  const sortBy = String(url.searchParams.get('sort_by') || 'uploaded_at').trim().toLowerCase()
  const sortDirection = String(url.searchParams.get('sort_direction') || 'desc').trim().toLowerCase() === 'asc' ? 'asc' : 'desc'
  const page = Math.max(1, Number(url.searchParams.get('page') || '1'))
  const pageSize = Math.max(1, Math.min(200, Number(url.searchParams.get('page_size') || '25')))

  const currentUserId = resolveMockCurrentUserId()
  let items = pagesReviewLibraryAssets
    .map((item) => applyMockLibraryAssetCapabilities(item, currentUserId))
    .filter((item) => item.current_user_role)
  if (workspaceId) {
    items = items.filter((item) => (item.workspace_ids || []).includes(workspaceId) || String(item.workspace_id || '').trim() === workspaceId)
  }
  if (ownership === 'owned') {
    items = items.filter((item) => item.owner_user_id === currentUserId)
  } else if (ownership === 'shared_by_me') {
    items = items.filter((item) => mockAssetIsSharedByCurrentUser(item, currentUserId))
  } else if (ownership === 'shared') {
    items = items.filter((item) => item.owner_user_id !== currentUserId)
  }
  if (scope === 'active') {
    items = items.filter((item) => item.archived_for_current_user !== true)
  } else if (scope === 'archived') {
    items = items.filter((item) => item.archived_for_current_user === true)
  }
  if (query) {
    items = items.filter((item) => {
      const haystack = [
        item.filename,
        item.kind,
        String(item.owner_name || ''),
        String(item.workspace_name || ''),
        ...(item.workspace_names || []),
        String(item.origin_workspace_name || ''),
        String(item.origin || ''),
        String(item.current_user_access_source || ''),
        ...(item.shared_with || []).map((member) => String(member.name || '')),
        ...(item.pending_with || []).map((member) => String(member.name || '')),
      ]
        .join(' ')
        .toLowerCase()
      return haystack.includes(query)
    })
  }

  if (sortBy === 'filename') {
    items = sortByFilename(items, sortDirection)
  } else if (sortBy === 'byte_size') {
    items = sortBySize(items, sortDirection)
  } else if (sortBy === 'owner_name') {
    items = sortByOwner(items, sortDirection)
  } else {
    items = sortByUploadedAt(items, sortDirection)
  }

  const total = items.length
  const start = (page - 1) * pageSize
  const paged = items.slice(start, start + pageSize)
  return {
    ...pagesReviewLibraryAssetsListPayload,
    items: paged,
    page,
    page_size: pageSize,
    total,
    has_more: start + pageSize < total,
    sort_by: sortBy === 'filename' || sortBy === 'byte_size' || sortBy === 'owner_name' ? sortBy : 'uploaded_at',
    sort_direction: sortDirection,
    query,
    ownership: ownership === 'owned' || ownership === 'shared_by_me' || ownership === 'shared' ? ownership : 'all',
    scope: scope === 'active' || scope === 'archived' ? scope : 'all',
  }
}

function listCollaboratorsForRequest(request: Request) {
  const url = new URL(request.url)
  const query = String(url.searchParams.get('query') || '').trim().toLowerCase()
  const sort = String(url.searchParams.get('sort') || 'name').trim().toLowerCase()
  const page = Math.max(1, Number(url.searchParams.get('page') || '1'))
  const pageSize = Math.max(1, Math.min(200, Number(url.searchParams.get('page_size') || '50')))

  let items = [...pagesReviewCollaborators]
  if (query) {
    items = items.filter((item) => {
      const haystack = [
        item.full_name,
        String(item.primary_institution || ''),
        String(item.country || ''),
      ]
        .join(' ')
        .toLowerCase()
      return haystack.includes(query)
    })
  }

  if (sort === 'strength') {
    items.sort((left, right) => right.metrics.collaboration_strength_score - left.metrics.collaboration_strength_score)
  } else if (sort === 'recent') {
    items.sort((left, right) => Date.parse(right.updated_at) - Date.parse(left.updated_at))
  } else {
    items.sort((left, right) => left.full_name.localeCompare(right.full_name))
  }

  const total = items.length
  const start = (page - 1) * pageSize
  const paged = items.slice(start, start + pageSize)
  return {
    items: paged,
    page,
    page_size: pageSize,
    total,
    has_more: start + pageSize < total,
  }
}

function resolveMockLibraryAssetRole(asset: LibraryAssetRecord, currentUserId: string): 'owner' | 'editor' | 'viewer' | null {
  if (asset.owner_user_id === currentUserId) {
    return 'owner'
  }
  const membership = (asset.shared_with || []).find((item) => item.user_id === currentUserId)
  if (membership) {
    return membership.role === 'editor' ? 'editor' : 'viewer'
  }
  const workspaceRole = resolveMockWorkspaceRole(asset, currentUserId)
  if (workspaceRole === 'owner' || workspaceRole === 'editor') {
    return 'editor'
  }
  if (workspaceRole === 'reviewer' || workspaceRole === 'viewer') {
    return 'viewer'
  }
  return null
}

function applyMockLibraryAssetCapabilities(asset: LibraryAssetRecord, currentUserId = resolveMockCurrentUserId()): LibraryAssetRecord {
  const currentUserRole = resolveMockLibraryAssetRole(asset, currentUserId)
  const lockedForTeamMembers = asset.locked_for_team_members === true
  const archivedForCurrentUser = Array.isArray(asset.archived_by_user_ids) && asset.archived_by_user_ids.includes(currentUserId)
  const workspaceContexts = resolveMockWorkspaceContexts(asset)
  const workspaceContext = workspaceContexts[0] || null
  const workspaceRole = resolveMockWorkspaceRole(asset, currentUserId)
  const origin = asset.origin || (workspaceContext ? 'workspace' : 'library')
  const originWorkspaceId = origin === 'workspace'
    ? asset.origin_workspace_id || workspaceContext?.workspaceId || null
    : asset.origin_workspace_id || null
  const originWorkspaceName = origin === 'workspace'
    ? asset.origin_workspace_name || workspaceContext?.workspaceName || null
    : asset.origin_workspace_name || null
  const currentUserAccessSource = asset.owner_user_id === currentUserId
    ? 'owner'
    : (asset.shared_with || []).some((member) => member.user_id === currentUserId)
      ? 'direct_share'
      : workspaceRole
        ? 'workspace_member'
        : currentUserRole
          ? 'project_collaborator'
          : null
  return {
    ...asset,
    owner_name: resolveMockLibraryDisplayName(asset.owner_user_id, asset.owner_name),
    shared_with: Array.isArray(asset.shared_with)
      ? asset.shared_with.map((member) => ({
        ...member,
        name: resolveMockLibraryDisplayName(member.user_id, member.name) || member.name,
      }))
      : asset.shared_with,
    pending_with: Array.isArray(asset.pending_with)
      ? asset.pending_with.map((member) => ({
        ...member,
        name: resolveMockLibraryDisplayName(member.user_id, member.name) || member.name,
      }))
      : asset.pending_with,
    workspace_ids: workspaceContexts.map((workspace) => workspace.workspaceId),
    workspace_names: workspaceContexts.map((workspace) => workspace.workspaceName),
    workspace_placements: workspaceContexts.map((workspace) => ({
      workspace_id: workspace.workspaceId,
      workspace_name: workspace.workspaceName,
    })),
    workspace_id: workspaceContext?.workspaceId || asset.workspace_id,
    workspace_name: workspaceContext?.workspaceName || asset.workspace_name,
    ownership_scope: (workspaceContext ? 'workspace_linked' : 'personal'),
    origin,
    origin_workspace_id: originWorkspaceId,
    origin_workspace_name: originWorkspaceName,
    current_user_role: currentUserRole,
    current_user_access_source: currentUserAccessSource,
    current_user_access_sources: currentUserAccessSource ? [currentUserAccessSource] : [],
    workspace_role: workspaceRole,
    can_manage_access: currentUserRole === 'owner',
    can_edit_metadata: currentUserRole === 'owner',
    can_download: currentUserRole === 'owner' || (currentUserRole === 'editor' && !lockedForTeamMembers),
    archived_for_current_user: archivedForCurrentUser,
  }
}

function appendMockLibraryAssetAuditEntry(
  asset: LibraryAssetRecord,
  entry: {
    category: 'access' | 'asset'
    event_type:
      | 'asset_uploaded'
      | 'asset_renamed'
      | 'asset_downloaded'
      | 'asset_locked'
      | 'asset_unlocked'
      | 'asset_workspace_linked'
      | 'asset_workspace_unlinked'
      | 'access_invited'
      | 'pending_access_role_changed'
      | 'access_invitation_cancelled'
      | 'access_invitation_accepted'
      | 'access_invitation_declined'
      | 'access_granted'
      | 'access_role_changed'
      | 'access_revoked'
    message: string
    subject_user_id?: string | null
    subject_name?: string | null
    from_value?: string | null
    to_value?: string | null
    role?: 'editor' | 'viewer' | null
  },
): LibraryAssetRecord['audit_log_entries'] {
  const created_at = nowIso()
  const nextEntry = {
    id: buildId(`asset-audit-${asset.id}`),
    category: entry.category,
    event_type: entry.event_type,
    actor_user_id: resolveMockCurrentUserId(),
    actor_name: resolveMockCurrentUserName(),
    subject_user_id: entry.subject_user_id || null,
    subject_name: entry.subject_name || null,
    from_value: entry.from_value || null,
    to_value: entry.to_value || null,
    role: entry.role || null,
    message: entry.message,
    created_at,
  }
  return [nextEntry, ...(asset.audit_log_entries || [])]
}

function upsertMockWorkspacePendingCollaborator(
  workspaceId: string,
  userId: string,
  name: string,
  role: 'editor' | 'reviewer' | 'viewer',
) {
  const workspace = findMockWorkspaceRecord(workspaceId)
  if (!workspace) {
    return
  }
  const existingPending = new Map((workspace.pendingCollaborators || []).map((participant) => [String(participant.userId || '').trim(), participant]))
  existingPending.set(userId, { userId, name })
  workspace.pendingCollaborators = Array.from(existingPending.values())
  workspace.pendingCollaboratorRoles = {
    ...(workspace.pendingCollaboratorRoles || {}),
    [userId]: role,
  }
  workspace.updatedAt = nowIso()
}

function removeMockWorkspacePendingCollaborator(workspaceId: string, userId: string) {
  const workspace = findMockWorkspaceRecord(workspaceId)
  if (!workspace) {
    return
  }
  workspace.pendingCollaborators = (workspace.pendingCollaborators || []).filter(
    (participant) => String(participant.userId || '').trim() !== userId,
  )
  workspace.pendingCollaboratorRoles = Object.fromEntries(
    Object.entries(workspace.pendingCollaboratorRoles || {}).filter(([participantUserId]) => participantUserId !== userId),
  )
  workspace.updatedAt = nowIso()
}

function ensureMockWorkspaceCollaborator(
  workspaceId: string,
  userId: string,
  name: string,
  role: 'editor' | 'reviewer' | 'viewer',
) {
  const workspace = findMockWorkspaceRecord(workspaceId)
  if (!workspace) {
    return
  }
  removeMockWorkspacePendingCollaborator(workspaceId, userId)
  const removedIds = new Set((workspace.removedCollaborators || []).map((participant) => String(participant.userId || '').trim()))
  workspace.removedCollaborators = (workspace.removedCollaborators || []).filter(
    (participant) => String(participant.userId || '').trim() !== userId,
  )
  const nextCollaborators = new Map((workspace.collaborators || []).map((participant) => [String(participant.userId || '').trim(), participant]))
  nextCollaborators.set(userId, { userId, name })
  workspace.collaborators = Array.from(nextCollaborators.values())
  workspace.collaboratorRoles = {
    ...(workspace.collaboratorRoles || {}),
    [userId]: role,
  }
  if (removedIds.has(userId)) {
    delete workspace.collaboratorRoles[userId]
    workspace.collaboratorRoles[userId] = role
  }
  workspace.updatedAt = nowIso()
}

function findMockInvitedAssetForRequest(requestId: string) {
  if (requestId === 'request-data-biobank') {
    return pagesReviewLibraryAssets.find((asset) => asset.id === 'lib-asset-16') || null
  }
  if (requestId === 'request-data-corelab') {
    return pagesReviewLibraryAssets.find((asset) => asset.id === 'lib-asset-17') || null
  }
  return null
}

function acceptMockDataInvitation(requestId: string) {
  const request = pagesReviewWorkspaceAuthorRequests.find((item) => item.id === requestId)
  if (!request) {
    return null
  }
  const asset = findMockInvitedAssetForRequest(requestId)
  if (!asset) {
    return null
  }
  const currentUserId = resolveMockCurrentUserId()
  const currentUserName = resolveMockCurrentUserName()
  const currentPending = Array.isArray(asset.pending_with) ? asset.pending_with : []
  const currentShared = Array.isArray(asset.shared_with) ? asset.shared_with : []
  const acceptedRole = request.collaboratorRole === 'editor' ? 'editor' : 'viewer'
  asset.pending_with = currentPending.filter((member) => String(member.user_id || '').trim() !== currentUserId)
  asset.shared_with = [
    ...currentShared.filter((member) => String(member.user_id || '').trim() !== currentUserId),
    {
      user_id: currentUserId,
      name: currentUserName,
      role: acceptedRole,
    },
  ]
  asset.shared_with_user_ids = asset.shared_with.map((member) => member.user_id)
  asset.audit_log_entries = appendMockLibraryAssetAuditEntry(asset, {
    category: 'access',
    event_type: 'access_invitation_accepted',
    subject_user_id: currentUserId,
    subject_name: currentUserName,
    from_value: 'pending',
    to_value: 'accepted',
    role: acceptedRole,
    message: `${resolveMockCurrentUserName()} file invitation status switched from pending to accepted by ${resolveMockCurrentUserName()} as ${acceptedRole}.`,
  })
  return asset
}

function normalizeMockWorkspaceRecordFromApi(body: {
  id?: string
  name?: string
  owner_name?: string
  owner_user_id?: string | null
  collaborators?: Array<{ user_id?: string; name?: string }>
  pending_collaborators?: Array<{ user_id?: string; name?: string }>
  collaborator_roles?: Record<string, 'editor' | 'reviewer' | 'viewer'>
  pending_collaborator_roles?: Record<string, 'editor' | 'reviewer' | 'viewer'>
  removed_collaborators?: Array<{ user_id?: string; name?: string }>
  version?: string
  health?: 'green' | 'amber' | 'red'
  updated_at?: string
  pinned?: boolean
  archived?: boolean
  owner_archived?: boolean
  audit_log_entries?: Array<{
    id?: string
    workspace_id?: string
    category?: 'collaborator_changes' | 'invitation_decisions' | 'workspace_changes' | 'conversation'
    event_type?: string | null
    actor_user_id?: string | null
    actor_name?: string | null
    subject_user_id?: string | null
    subject_name?: string | null
    from_value?: string | null
    to_value?: string | null
    role?: 'editor' | 'reviewer' | 'viewer' | null
    metadata?: Record<string, unknown>
    message?: string
    created_at?: string
  }>
}) {
  const workspaceId = String(body.id || '').trim() || buildId('workspace')
  return {
    id: workspaceId,
    name: String(body.name || 'Workspace').trim() || 'Workspace',
    ownerName: String(body.owner_name || resolveMockCurrentUserName()).trim() || resolveMockCurrentUserName(),
    ownerUserId: String(body.owner_user_id || '').trim() || null,
    collaborators: (body.collaborators || []).map((participant) => ({
      userId: String(participant.user_id || '').trim(),
      name: String(participant.name || '').trim() || String(participant.user_id || '').trim(),
    })).filter((participant) => participant.userId),
    pendingCollaborators: (body.pending_collaborators || []).map((participant) => ({
      userId: String(participant.user_id || '').trim(),
      name: String(participant.name || '').trim() || String(participant.user_id || '').trim(),
    })).filter((participant) => participant.userId),
    collaboratorRoles: body.collaborator_roles || {},
    pendingCollaboratorRoles: body.pending_collaborator_roles || {},
    removedCollaborators: (body.removed_collaborators || []).map((participant) => ({
      userId: String(participant.user_id || '').trim(),
      name: String(participant.name || '').trim() || String(participant.user_id || '').trim(),
    })).filter((participant) => participant.userId),
    version: String(body.version || '0.1').trim() || '0.1',
    health: body.health || 'amber',
    updatedAt: String(body.updated_at || nowIso()).trim() || nowIso(),
    pinned: Boolean(body.pinned),
    archived: Boolean(body.archived),
    ownerArchived: Boolean(body.owner_archived),
    auditLogEntries: (body.audit_log_entries || []).map((entry) => ({
      id: String(entry.id || buildId(`${workspaceId}-audit`)).trim(),
      workspaceId: String(entry.workspace_id || workspaceId).trim() || workspaceId,
      category: entry.category || 'collaborator_changes',
      eventType: entry.event_type || null,
      actorUserId: String(entry.actor_user_id || '').trim() || null,
      actorName: String(entry.actor_name || '').trim() || null,
      subjectUserId: String(entry.subject_user_id || '').trim() || null,
      subjectName: String(entry.subject_name || '').trim() || null,
      fromValue: String(entry.from_value || '').trim() || null,
      toValue: String(entry.to_value || '').trim() || null,
      role: entry.role || null,
      metadata: entry.metadata || undefined,
      message: String(entry.message || '').trim() || 'Workspace activity recorded.',
      createdAt: String(entry.created_at || nowIso()).trim() || nowIso(),
    })),
  }
}

function normalizeMockWorkspaceAuthorRequestFromApi(body: {
  id?: string
  workspace_id?: string
  workspace_name?: string
  author_name?: string
  author_user_id?: string | null
  invitation_type?: 'workspace' | 'data'
  collaborator_role?: 'editor' | 'reviewer' | 'viewer'
  invited_at?: string
}) {
  return {
    id: String(body.id || buildId('author-request')).trim(),
    workspaceId: String(body.workspace_id || buildId('workspace')).trim(),
    workspaceName: String(body.workspace_name || 'Untitled workspace').trim(),
    authorName: String(body.author_name || 'Unknown author').trim(),
    authorUserId: String(body.author_user_id || '').trim() || null,
    invitationType: body.invitation_type === 'data' ? 'data' : 'workspace',
    collaboratorRole: body.collaborator_role || 'viewer',
    invitedAt: String(body.invited_at || nowIso()).trim() || nowIso(),
  }
}

function normalizeMockWorkspaceInvitationFromApi(body: {
  id?: string
  workspace_id?: string
  workspace_name?: string
  invitee_name?: string
  invitee_user_id?: string | null
  invitation_type?: 'workspace' | 'data'
  role?: 'editor' | 'reviewer' | 'viewer'
  invited_at?: string
  status?: 'pending' | 'accepted' | 'declined'
}) {
  return {
    id: String(body.id || buildId('invite')).trim(),
    workspaceId: String(body.workspace_id || buildId('workspace')).trim(),
    workspaceName: String(body.workspace_name || 'Untitled workspace').trim(),
    inviteeName: String(body.invitee_name || 'Unknown collaborator').trim(),
    inviteeUserId: String(body.invitee_user_id || '').trim() || null,
    invitationType: body.invitation_type === 'data' ? 'data' : 'workspace',
    role: body.role || 'viewer',
    invitedAt: String(body.invited_at || nowIso()).trim() || nowIso(),
    status: body.status === 'accepted' || body.status === 'declined' ? body.status : 'pending',
  }
}

function normalizeMockInboxMessageFromApi(body: {
  id?: string
  workspace_id?: string
  sender_name?: string
  encrypted_body?: string
  iv?: string
  created_at?: string
}) {
  return {
    id: String(body.id || buildId('inbox-message')).trim(),
    workspaceId: String(body.workspace_id || '').trim(),
    senderName: String(body.sender_name || resolveMockCurrentUserName()).trim() || resolveMockCurrentUserName(),
    encryptedBody: String(body.encrypted_body || '').trim(),
    iv: String(body.iv || '').trim(),
    createdAt: String(body.created_at || nowIso()).trim() || nowIso(),
  }
}

const metricsMode = resolveMetricsMode(import.meta.env.VITE_MSW_PUBLICATIONS_METRICS_MODE)

export const publicationsMetricsHandler = http.get(metricsPath, () => {
  if (metricsMode === 'empty') {
    return HttpResponse.json(publicationsMetricsEmptyFixture)
  }

  if (metricsMode === 'error') {
    return HttpResponse.json(
      {
        error: {
          message: 'Mocked metrics failure',
          detail: 'Simulated 500 response from /v1/publications/metrics',
        },
      },
      { status: 500 },
    )
  }

  return HttpResponse.json(publicationsMetricsHappyFixture)
})

const publicationDetailHandler = http.get('*/v1/publications/:publicationId', ({ params }) =>
  HttpResponse.json({
    id: String(params.publicationId || 'W-000'),
    title: 'Fixture publication detail',
    year: 2024,
    journal: 'European Heart Journal',
    publication_type: 'journal-article',
    citations_total: 158,
    doi: '10.1000/story.fixture',
    pmid: '401003',
    openalex_work_id: 'W401003',
    abstract: 'Fixture abstract for publication details.',
    keywords_json: ['cardio-oncology', 'registry'],
    authors_json: [{ full_name: 'Storybook User' }, { full_name: 'A. Patel' }],
    affiliations_json: [{ institution: 'Northbridge Cardiac Institute' }],
    created_at: pagesReviewTimestamp,
    updated_at: pagesReviewTimestamp,
  }),
)

const publicationAuthorsHandler = http.get('*/v1/publications/:publicationId/authors', () =>
  HttpResponse.json({
    status: 'READY',
    authors_json: [{ full_name: 'Storybook User' }, { full_name: 'A. Patel' }],
    affiliations_json: [{ institution_name: 'Northbridge Cardiac Institute' }],
    computed_at: pagesReviewTimestamp,
    is_stale: false,
    is_updating: false,
    last_error: null,
  }),
)

const publicationImpactHandler = http.get('*/v1/publications/:publicationId/impact', () =>
  HttpResponse.json({
    payload: {
      citations_total: 158,
      citations_last_12m: 56,
      citations_prev_12m: 43,
      yoy_pct: 30.2,
      acceleration_citations_per_month: 1.4,
      per_year: [
        { year: 2022, citations: 58, yoy_delta: null, yoy_pct: null },
        { year: 2023, citations: 101, yoy_delta: 43, yoy_pct: 74.1 },
        { year: 2024, citations: 158, yoy_delta: 57, yoy_pct: 56.4 },
      ],
      portfolio_context: {
        paper_share_total_pct: 32.5,
        paper_share_12m_pct: 45.9,
        portfolio_rank_total: 1,
        portfolio_rank_12m: 1,
      },
      top_citing_journals: [{ name: 'European Heart Journal', count: 18 }],
      top_citing_countries: [{ name: 'United Kingdom', count: 22 }],
      key_citing_papers: [
        {
          title: 'Independent validation study',
          year: 2025,
          journal: 'Circulation',
          doi: '10.1000/circ.fixture',
          pmid: null,
          citations_total: 24,
        },
      ],
      metadata: {},
    },
    computed_at: pagesReviewTimestamp,
    status: 'READY',
    is_stale: false,
    is_updating: false,
    last_error: null,
  }),
)

const publicationAiInsightsHandler = http.get('*/v1/publications/:publicationId/ai-insights', () =>
  HttpResponse.json({
    payload: {
      label: 'Fixture insight',
      performance_summary: 'Trajectory remains stable with sustained citation intake.',
      trajectory_classification: 'CONSISTENT',
      extractive_key_points: {
        objective: 'Evaluate registry outcomes.',
        methods: 'Longitudinal observational analysis.',
        main_findings: 'Consistent directional effect with moderate confidence.',
        conclusion: 'Findings support planned manuscript positioning.',
      },
      reuse_suggestions: ['Use in introduction context paragraph.'],
      caution_flags: [],
    },
    computed_at: pagesReviewTimestamp,
    status: 'READY',
    is_stale: false,
    is_updating: false,
    last_error: null,
  }),
)

const publicationFilesHandler = http.get('*/v1/publications/:publicationId/files', () =>
  HttpResponse.json({
    items: [],
  }),
)

const authMeHandler = http.get('*/v1/auth/me', () => HttpResponse.json(resolveMockAuthUser()))

const workspacesStateHandler = http.get(
  '*/v1/workspaces/state',
  () => HttpResponse.json(buildPagesReviewWorkspaceStateApiPayload()),
)
const workspacesStatePutHandler = http.put('*/v1/workspaces/state', async ({ request }) => {
  const body = (await request.json()) as {
    workspaces?: Array<Parameters<typeof normalizeMockWorkspaceRecordFromApi>[0]>
    active_workspace_id?: string | null
    author_requests?: Array<Parameters<typeof normalizeMockWorkspaceAuthorRequestFromApi>[0]>
    invitations_sent?: Array<Parameters<typeof normalizeMockWorkspaceInvitationFromApi>[0]>
  }
  pagesReviewWorkspaceRecords.splice(
    0,
    pagesReviewWorkspaceRecords.length,
    ...((body.workspaces || []).map((item) => normalizeMockWorkspaceRecordFromApi(item))),
  )
  pagesReviewWorkspaceAuthorRequests.splice(
    0,
    pagesReviewWorkspaceAuthorRequests.length,
    ...((body.author_requests || []).map((item) => normalizeMockWorkspaceAuthorRequestFromApi(item))),
  )
  pagesReviewWorkspaceInvitations.splice(
    0,
    pagesReviewWorkspaceInvitations.length,
    ...((body.invitations_sent || []).map((item) => normalizeMockWorkspaceInvitationFromApi(item))),
  )
  const requestedActiveWorkspaceId = String(body.active_workspace_id || '').trim()
  if (requestedActiveWorkspaceId) {
    const activeIndex = pagesReviewWorkspaceRecords.findIndex((workspace) => workspace.id === requestedActiveWorkspaceId)
    if (activeIndex > 0) {
      const [activeWorkspace] = pagesReviewWorkspaceRecords.splice(activeIndex, 1)
      pagesReviewWorkspaceRecords.unshift(activeWorkspace)
    }
  }
  return HttpResponse.json(buildPagesReviewWorkspaceStateApiPayload())
})
const workspacesListHandler = http.get('*/v1/workspaces', () => HttpResponse.json(buildPagesReviewWorkspaceApiListPayload()))
const workspacesCreateHandler = http.post('*/v1/workspaces', async ({ request }) => {
  const body = (await request.json()) as Parameters<typeof normalizeMockWorkspaceRecordFromApi>[0]
  const workspace = normalizeMockWorkspaceRecordFromApi(body)
  const existingIndex = pagesReviewWorkspaceRecords.findIndex((item) => item.id === workspace.id)
  if (existingIndex >= 0) {
    pagesReviewWorkspaceRecords.splice(existingIndex, 1, workspace)
  } else {
    pagesReviewWorkspaceRecords.unshift(workspace)
  }
  return HttpResponse.json(buildPagesReviewWorkspaceApiListPayload().items.find((item) => item.id === workspace.id) || null)
})
const workspacesPatchHandler = http.patch('*/v1/workspaces/:workspaceId', async ({ params, request }) => {
  const workspaceId = String(params.workspaceId || '').trim()
  const workspace = findMockWorkspaceRecord(workspaceId)
  if (!workspace) {
    return HttpResponse.json({ error: { message: 'Not found', detail: 'Workspace not found' } }, { status: 404 })
  }
  const body = (await request.json()) as Partial<Parameters<typeof normalizeMockWorkspaceRecordFromApi>[0]>
  const updatedWorkspace = normalizeMockWorkspaceRecordFromApi({
    id: workspace.id,
    name: body.name ?? workspace.name,
    owner_name: body.owner_name ?? workspace.ownerName,
    owner_user_id: body.owner_user_id ?? workspace.ownerUserId,
    collaborators: body.collaborators ?? workspace.collaborators.map((participant) => ({
      user_id: participant.userId,
      name: participant.name,
    })),
    pending_collaborators: body.pending_collaborators ?? workspace.pendingCollaborators.map((participant) => ({
      user_id: participant.userId,
      name: participant.name,
    })),
    collaborator_roles: body.collaborator_roles ?? workspace.collaboratorRoles,
    pending_collaborator_roles: body.pending_collaborator_roles ?? workspace.pendingCollaboratorRoles,
    removed_collaborators: body.removed_collaborators ?? workspace.removedCollaborators.map((participant) => ({
      user_id: participant.userId,
      name: participant.name,
    })),
    version: body.version ?? workspace.version,
    health: body.health ?? workspace.health,
    updated_at: body.updated_at ?? nowIso(),
    pinned: body.pinned ?? workspace.pinned,
    archived: body.archived ?? workspace.archived,
    owner_archived: body.owner_archived ?? workspace.ownerArchived,
    audit_log_entries: body.audit_log_entries ?? (workspace.auditLogEntries || []).map((entry) => ({
      id: entry.id,
      workspace_id: entry.workspaceId,
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
  })
  Object.assign(workspace, updatedWorkspace)
  return HttpResponse.json(buildPagesReviewWorkspaceApiListPayload().items.find((item) => item.id === workspaceId) || null)
})
const workspacesDeleteHandler = http.delete('*/v1/workspaces/:workspaceId', ({ params }) => {
  const workspaceId = String(params.workspaceId || '').trim()
  const existingIndex = pagesReviewWorkspaceRecords.findIndex((workspace) => workspace.id === workspaceId)
  if (existingIndex >= 0) {
    pagesReviewWorkspaceRecords.splice(existingIndex, 1)
  }
  return HttpResponse.json({
    success: true,
    active_workspace_id: pagesReviewWorkspaceRecords[0]?.id || null,
  })
})
const workspacesAuthorRequestsHandler = http.get(
  '*/v1/workspaces/author-requests',
  () => HttpResponse.json(buildPagesReviewWorkspaceAuthorRequestsApiPayload()),
)
const workspacesAuthorRequestAcceptHandler = http.post(
  '*/v1/workspaces/author-requests/:requestId/accept',
  ({ params }) => {
    const requestId = String(params.requestId || '').trim()
    const request = pagesReviewWorkspaceAuthorRequests.find((item) => item.id === requestId)
    if (!request) {
      return HttpResponse.json({ error: { message: 'Not found', detail: 'Author request not found' } }, { status: 404 })
    }
    if (request.invitationType === 'data') {
      const acceptedAsset = acceptMockDataInvitation(requestId)
      pagesReviewWorkspaceAuthorRequests.splice(
        0,
        pagesReviewWorkspaceAuthorRequests.length,
        ...pagesReviewWorkspaceAuthorRequests.filter((item) => item.id !== requestId),
      )
      return HttpResponse.json({
        workspace: null,
        removed_request_id: requestId,
        invitation_type: 'data',
        accepted_asset_id: acceptedAsset?.id || null,
      })
    }
    const currentUserId = resolveMockCurrentUserId()
    const currentUserName = resolveMockCurrentUserName()
    let workspace = findMockWorkspaceRecord(request.workspaceId)
    if (!workspace) {
      workspace = {
        id: request.workspaceId,
        name: request.workspaceName,
        ownerName: request.authorName,
        ownerUserId: request.authorUserId,
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
      pagesReviewWorkspaceRecords.unshift(workspace)
    }
    ensureMockWorkspaceCollaborator(
      workspace.id,
      currentUserId,
      currentUserName,
      request.collaboratorRole,
    )
    pagesReviewWorkspaceAuthorRequests.splice(
      0,
      pagesReviewWorkspaceAuthorRequests.length,
      ...pagesReviewWorkspaceAuthorRequests.filter((item) => item.id !== requestId),
    )
    return HttpResponse.json({
      workspace: buildPagesReviewWorkspaceApiListPayload().items.find((item) => item.id === workspace?.id) || null,
      removed_request_id: requestId,
      invitation_type: 'workspace',
      accepted_asset_id: null,
    })
  },
)
const workspacesAuthorRequestDeclineHandler = http.post(
  '*/v1/workspaces/author-requests/:requestId/decline',
  ({ params }) => {
    const requestId = String(params.requestId || '').trim()
    const request = pagesReviewWorkspaceAuthorRequests.find((item) => item.id === requestId) || null
    pagesReviewWorkspaceAuthorRequests.splice(
      0,
      pagesReviewWorkspaceAuthorRequests.length,
      ...pagesReviewWorkspaceAuthorRequests.filter((item) => item.id !== requestId),
    )
    if (request?.invitationType === 'data') {
      const asset = findMockInvitedAssetForRequest(requestId)
      const currentUserId = resolveMockCurrentUserId()
      const currentUserName = resolveMockCurrentUserName()
      if (asset) {
        asset.pending_with = (asset.pending_with || []).filter(
          (member) => String(member.user_id || '').trim() !== currentUserId,
        )
        asset.audit_log_entries = appendMockLibraryAssetAuditEntry(asset, {
          category: 'access',
          event_type: 'access_invitation_declined',
          subject_user_id: currentUserId,
          subject_name: currentUserName,
          from_value: 'pending',
          to_value: 'declined',
          role: request.collaboratorRole === 'editor' ? 'editor' : 'viewer',
          message: `${currentUserName} file invitation status switched from pending to declined by ${currentUserName} as ${request.collaboratorRole}.`,
        })
      }
    }
    return HttpResponse.json({
      success: true,
      removed_request_id: requestId,
    })
  },
)
const workspacesInvitationsHandler = http.get(
  '*/v1/workspaces/invitations/sent',
  () => HttpResponse.json(buildPagesReviewWorkspaceInvitationsApiPayload()),
)
const workspacesInvitationsCreateHandler = http.post('*/v1/workspaces/invitations/sent', async ({ request }) => {
  const body = (await request.json()) as Parameters<typeof normalizeMockWorkspaceInvitationFromApi>[0]
  const workspace = findMockWorkspaceRecord(String(body.workspace_id || '').trim())
  const invitation = normalizeMockWorkspaceInvitationFromApi({
    ...body,
    workspace_name: body.workspace_name || workspace?.name || 'Untitled workspace',
  })
  const existingIndex = pagesReviewWorkspaceInvitations.findIndex((item) => item.id === invitation.id)
  if (existingIndex >= 0) {
    pagesReviewWorkspaceInvitations.splice(existingIndex, 1, invitation)
  } else {
    pagesReviewWorkspaceInvitations.unshift(invitation)
  }
  if (invitation.inviteeUserId) {
    upsertMockWorkspacePendingCollaborator(
      invitation.workspaceId,
      invitation.inviteeUserId,
      invitation.inviteeName,
      invitation.role,
    )
  }
  return HttpResponse.json(buildPagesReviewWorkspaceInvitationsApiPayload().items.find((item) => item.id === invitation.id) || null)
})
const workspacesInvitationsPatchHandler = http.patch('*/v1/workspaces/invitations/sent/:invitationId', async ({ params, request }) => {
  const invitationId = String(params.invitationId || '').trim()
  const invitation = pagesReviewWorkspaceInvitations.find((item) => item.id === invitationId)
  if (!invitation) {
    return HttpResponse.json({ error: { message: 'Not found', detail: 'Invitation not found' } }, { status: 404 })
  }
  const body = (await request.json()) as { status?: 'pending' | 'accepted' | 'declined' }
  invitation.status = body.status === 'accepted' || body.status === 'declined' ? body.status : 'pending'
  if (invitation.inviteeUserId) {
    if (invitation.status === 'pending') {
      upsertMockWorkspacePendingCollaborator(invitation.workspaceId, invitation.inviteeUserId, invitation.inviteeName, invitation.role)
    } else if (invitation.status === 'accepted') {
      ensureMockWorkspaceCollaborator(invitation.workspaceId, invitation.inviteeUserId, invitation.inviteeName, invitation.role)
    } else {
      removeMockWorkspacePendingCollaborator(invitation.workspaceId, invitation.inviteeUserId)
    }
  }
  return HttpResponse.json(buildPagesReviewWorkspaceInvitationsApiPayload().items.find((item) => item.id === invitationId) || null)
})
const workspacesAccountSearchHandler = http.get('*/v1/workspaces/accounts/search', ({ request }) => {
  const url = new URL(request.url)
  const query = String(url.searchParams.get('q') || '').trim().toLowerCase()
  if (query.length < 2) {
    return HttpResponse.json({ items: [] })
  }
  const items = pagesReviewWorkspaceAccountSearchResults.filter((item) => {
    const haystack = [item.name, item.email].join(' ').toLowerCase()
    return haystack.includes(query)
  })
  return HttpResponse.json({ items })
})
const workspacesSetActiveHandler = http.put('*/v1/workspaces/active', async ({ request }) => {
  const body = (await request.json()) as { workspace_id?: string | null }
  const requestedActiveWorkspaceId = String(body.workspace_id || '').trim()
  if (requestedActiveWorkspaceId) {
    const activeIndex = pagesReviewWorkspaceRecords.findIndex((workspace) => workspace.id === requestedActiveWorkspaceId)
    if (activeIndex > 0) {
      const [activeWorkspace] = pagesReviewWorkspaceRecords.splice(activeIndex, 1)
      pagesReviewWorkspaceRecords.unshift(activeWorkspace)
    }
  }
  return HttpResponse.json({
    active_workspace_id: requestedActiveWorkspaceId || null,
  })
})
const workspacesInboxStateHandler = http.get(
  '*/v1/workspaces/inbox/state',
  () => HttpResponse.json(buildPagesReviewWorkspaceInboxStateApiPayload()),
)
const workspacesInboxStatePutHandler = http.put('*/v1/workspaces/inbox/state', async ({ request }) => {
  const body = (await request.json()) as {
    messages?: Array<Parameters<typeof normalizeMockInboxMessageFromApi>[0]>
    reads?: Record<string, Record<string, string>>
  }
  pagesReviewWorkspaceInboxMessages.splice(
    0,
    pagesReviewWorkspaceInboxMessages.length,
    ...((body.messages || []).map((item) => normalizeMockInboxMessageFromApi(item))),
  )
  Object.keys(pagesReviewWorkspaceInboxReads).forEach((key) => {
    delete pagesReviewWorkspaceInboxReads[key]
  })
  Object.assign(pagesReviewWorkspaceInboxReads, body.reads || {})
  return HttpResponse.json(buildPagesReviewWorkspaceInboxStateApiPayload())
})
const workspacesInboxMessagesHandler = http.get('*/v1/workspaces/inbox/messages', ({ request }) => {
  const workspaceId = String(new URL(request.url).searchParams.get('workspace_id') || '').trim()
  const payload = buildPagesReviewWorkspaceInboxMessagesApiPayload()
  if (!workspaceId) {
    return HttpResponse.json(payload)
  }
  return HttpResponse.json({
    items: payload.items.filter((item) => item.workspace_id === workspaceId),
  })
})
const workspacesInboxMessagesCreateHandler = http.post('*/v1/workspaces/inbox/messages', async ({ request }) => {
  const body = (await request.json()) as Parameters<typeof normalizeMockInboxMessageFromApi>[0]
  const message = normalizeMockInboxMessageFromApi(body)
  pagesReviewWorkspaceInboxMessages.unshift(message)
  return HttpResponse.json(buildPagesReviewWorkspaceInboxMessagesApiPayload().items.find((item) => item.id === message.id) || null)
})
const workspacesInboxReadsHandler = http.get(
  '*/v1/workspaces/inbox/reads',
  () => HttpResponse.json(buildPagesReviewWorkspaceInboxReadsApiPayload()),
)
const workspacesInboxReadsCreateHandler = http.post('*/v1/workspaces/inbox/reads', async ({ request }) => {
  const body = (await request.json()) as {
    workspace_id?: string
    reader_key?: string
    read_at?: string
  }
  const workspaceId = String(body.workspace_id || '').trim()
  const readerKey = String(body.reader_key || '').trim()
  if (!workspaceId || !readerKey) {
    return HttpResponse.json({ error: { message: 'Bad request', detail: 'Workspace and reader are required.' } }, { status: 400 })
  }
  if (!pagesReviewWorkspaceInboxReads[workspaceId]) {
    pagesReviewWorkspaceInboxReads[workspaceId] = {}
  }
  pagesReviewWorkspaceInboxReads[workspaceId][readerKey] = String(body.read_at || nowIso()).trim() || nowIso()
  return HttpResponse.json({
    workspace_id: workspaceId,
    reader_key: readerKey,
    read_at: pagesReviewWorkspaceInboxReads[workspaceId][readerKey],
  })
})

const journalsHandler = http.get('*/v1/journals', () => HttpResponse.json(pagesReviewJournalOptions))
const runContextHandler = http.get('*/v1/workspaces/:workspaceId/run-context', async ({ params }) => {
  const mode = resolvePagesReviewMockMode(PAGES_REVIEW_RUN_CONTEXT_MODE_KEY, 'default')
  if (mode === 'loading') {
    await delay(1200)
  }
  if (mode === 'empty') {
    return HttpResponse.json({
      ...pagesReviewWorkspaceRunContext,
      workspace_id: String(params.workspaceId || pagesReviewWorkspaceRunContext.workspace_id),
      project_id: null,
      manuscript_id: null,
    })
  }
  return HttpResponse.json({
    ...pagesReviewWorkspaceRunContext,
    workspace_id: String(params.workspaceId || pagesReviewWorkspaceRunContext.workspace_id),
  })
})

const libraryAssetsHandler = http.get('*/v1/library/assets', async ({ request }) => {
  const mode = resolvePagesReviewMockMode(PAGES_REVIEW_LIBRARY_MODE_KEY, 'default')
  if (mode === 'loading') {
    await delay(1400)
  }
  if (mode === 'empty') {
    const payload = listLibraryAssetsForRequest(request)
    return HttpResponse.json({
      ...payload,
      items: [],
      total: 0,
      has_more: false,
    })
  }
  return HttpResponse.json(listLibraryAssetsForRequest(request))
})

const libraryAssetAccessPatchHandler = http.patch('*/v1/library/assets/:assetId/access', async ({ params, request }) => {
  const body = (await request.json()) as {
    collaborators?: Array<{ user_id?: string | null; name?: string | null; role?: 'editor' | 'viewer' }>
    collaborator_user_ids?: string[]
    collaborator_names?: string[]
  }
  const asset = pagesReviewLibraryAssets.find((item) => item.id === params.assetId)
  if (!asset) {
    return HttpResponse.json({ error: { message: 'Not found', detail: 'Asset not found' } }, { status: 404 })
  }
  const collaboratorPayload = Array.isArray(body.collaborators) ? body.collaborators : []
  const desiredMembers: Array<{ user_id: string; name: string; role: 'editor' | 'viewer' }> = collaboratorPayload.length > 0
    ? collaboratorPayload.map((member, index) => {
        const userId = String(member.user_id || body.collaborator_user_ids?.[index] || '').trim()
        const collaborator = pagesReviewCollaborators.find((candidate) => candidate.owner_user_id === userId || candidate.id === userId)
        const resolvedName = String(member.name || collaborator?.full_name || body.collaborator_names?.[index] || userId || `user-${index + 1}`).trim()
        return {
          user_id: userId || `user-${index + 1}`,
          name: resolvedName,
          role: member.role === 'editor' ? 'editor' : 'viewer',
        }
      })
    : (body.collaborator_user_ids || []).map((userId, index) => {
        const cleanUserId = String(userId || '').trim() || `user-${index + 1}`
        const collaborator = pagesReviewCollaborators.find((candidate) => candidate.owner_user_id === cleanUserId || candidate.id === cleanUserId)
        return {
          user_id: cleanUserId,
          name: String(body.collaborator_names?.[index] || collaborator?.full_name || cleanUserId).trim(),
          role: 'viewer' as const,
        }
      })
  const currentSharedWith = Array.isArray(asset.shared_with) ? asset.shared_with : []
  const currentPendingWith = Array.isArray(asset.pending_with) ? asset.pending_with : []
  const currentSharedUserIds = new Set(currentSharedWith.map((member) => String(member.user_id || '').trim()).filter(Boolean))
  const currentPendingUserIds = new Set(currentPendingWith.map((member) => String(member.user_id || '').trim()).filter(Boolean))
  const previousMembers = new Map(
    [...currentSharedWith, ...currentPendingWith]
      .map((member) => [String(member.user_id || '').trim(), member] as const)
      .filter(([userId]) => Boolean(userId)),
  )
  const nextSharedWith: NonNullable<LibraryAssetRecord['shared_with']> = desiredMembers.filter(
    (member) => currentSharedUserIds.has(member.user_id),
  )
  const nextPendingWith = desiredMembers.filter((member) => !currentSharedUserIds.has(member.user_id))
  let nextAsset: LibraryAssetRecord = {
    ...asset,
    shared_with_user_ids: nextSharedWith.map((member) => member.user_id),
    shared_with: nextSharedWith,
    pending_with: nextPendingWith,
  }
  const nextPendingUserIds = new Set(nextPendingWith.map((member) => String(member.user_id || '').trim()).filter(Boolean))
  const nextMembers = new Map(
    [...nextSharedWith, ...nextPendingWith]
      .map((member) => [String(member.user_id || '').trim(), member] as const)
      .filter(([userId]) => Boolean(userId)),
  )
  previousMembers.forEach((member, userId) => {
    if (!nextMembers.has(userId)) {
      const wasPending = currentPendingUserIds.has(userId)
      nextAsset = {
        ...nextAsset,
        audit_log_entries: appendMockLibraryAssetAuditEntry(nextAsset, {
          category: 'access',
          event_type: wasPending ? 'access_invitation_cancelled' : 'access_revoked',
          subject_user_id: userId,
          subject_name: member.name,
          from_value: wasPending ? 'pending' : 'active',
          to_value: wasPending ? 'cancelled' : 'revoked',
          role: member.role,
          message: wasPending
            ? `${member.name} file invitation status switched from pending to cancelled by ${resolveMockCurrentUserName()} as ${member.role}.`
            : `${resolveMockCurrentUserName()} removed ${member.name} from direct file access.`,
        }),
      }
    }
  })
  nextMembers.forEach((member, userId) => {
    const previous = previousMembers.get(userId)
    const isPending = nextPendingUserIds.has(userId)
    if (!previous) {
      nextAsset = {
        ...nextAsset,
        audit_log_entries: appendMockLibraryAssetAuditEntry(nextAsset, {
          category: 'access',
          event_type: isPending ? 'access_invited' : 'access_granted',
          subject_user_id: userId,
          subject_name: member.name,
          from_value: isPending ? 'none' : null,
          to_value: isPending ? 'pending' : member.role,
          role: member.role,
          message: isPending
            ? `${member.name} file invitation status switched from none to pending by ${resolveMockCurrentUserName()} as ${member.role}.`
            : `${resolveMockCurrentUserName()} granted ${member.role} access to ${member.name}.`,
        }),
      }
      return
    }
    if (previous.role !== member.role) {
      const wasPending = currentPendingUserIds.has(userId)
      nextAsset = {
        ...nextAsset,
        audit_log_entries: appendMockLibraryAssetAuditEntry(nextAsset, {
          category: 'access',
          event_type: isPending || wasPending ? 'pending_access_role_changed' : 'access_role_changed',
          subject_user_id: userId,
          subject_name: member.name,
          from_value: previous.role,
          to_value: member.role,
          role: member.role,
          message: isPending || wasPending
            ? `${member.name} pending file role switched from ${previous.role} to ${member.role} by ${resolveMockCurrentUserName()}.`
            : `${resolveMockCurrentUserName()} changed ${member.name} from ${previous.role} to ${member.role}.`,
        }),
      }
    }
  })
  const updated = applyMockLibraryAssetCapabilities(nextAsset)
  Object.assign(asset, updated)
  return HttpResponse.json(updated)
})

const libraryAssetMetadataPatchHandler = http.patch('*/v1/library/assets/:assetId', async ({ params, request }) => {
  const body = (await request.json()) as {
    filename?: string
    locked_for_team_members?: boolean
    archived_for_current_user?: boolean
    workspace_id?: string | null
    workspace_ids?: string[] | null
  }
  const asset = pagesReviewLibraryAssets.find((item) => item.id === params.assetId)
  if (!asset) {
    return HttpResponse.json({ error: { message: 'Not found', detail: 'Asset not found' } }, { status: 404 })
  }
  const currentUserId = resolveMockCurrentUserId()
  const scopedAsset = applyMockLibraryAssetCapabilities(asset)
  const ownerOnlyChangeRequested =
    (typeof body.filename === 'string' && body.filename.trim().length > 0 && body.filename.trim() !== asset.filename)
    || typeof body.locked_for_team_members === 'boolean'
    || Object.prototype.hasOwnProperty.call(body, 'workspace_id')
    || Object.prototype.hasOwnProperty.call(body, 'workspace_ids')
  if (ownerOnlyChangeRequested && !scopedAsset.can_edit_metadata) {
    return HttpResponse.json({ error: { message: 'Forbidden', detail: 'Only the asset owner can update file details.' } }, { status: 403 })
  }
  const archivedByUserIds = new Set(Array.isArray(asset.archived_by_user_ids) ? asset.archived_by_user_ids : [])
  if (typeof body.archived_for_current_user === 'boolean') {
    if (body.archived_for_current_user) {
      archivedByUserIds.add(currentUserId)
    } else {
      archivedByUserIds.delete(currentUserId)
    }
  }
  const previousWorkspaceIds = resolveMockWorkspaceContexts(asset).map((workspace) => workspace.workspaceId)
  let nextAsset: LibraryAssetRecord = {
    ...asset,
    filename: typeof body.filename === 'string' && body.filename.trim() ? String(body.filename) : asset.filename,
    workspace_id: Object.prototype.hasOwnProperty.call(body, 'workspace_ids')
      ? String(body.workspace_ids?.[0] || '').trim() || null
      : Object.prototype.hasOwnProperty.call(body, 'workspace_id')
        ? String(body.workspace_id || '').trim() || null
        : asset.workspace_id,
    workspace_ids: Object.prototype.hasOwnProperty.call(body, 'workspace_ids')
      ? (body.workspace_ids || []).map((value) => String(value || '').trim()).filter(Boolean)
      : asset.workspace_ids,
    locked_for_team_members:
      typeof body.locked_for_team_members === 'boolean'
        ? body.locked_for_team_members
        : asset.locked_for_team_members === true,
    archived_by_user_ids: Array.from(archivedByUserIds),
  }
  if (Object.prototype.hasOwnProperty.call(body, 'workspace_id') || Object.prototype.hasOwnProperty.call(body, 'workspace_ids')) {
    const nextWorkspaceIds = Array.isArray(nextAsset.workspace_ids) && nextAsset.workspace_ids.length > 0
      ? nextAsset.workspace_ids
      : (nextAsset.workspace_id ? [nextAsset.workspace_id] : [])
    const nextWorkspacePlacements = nextWorkspaceIds
      .map((workspaceId) => String(workspaceId || '').trim())
      .filter(Boolean)
      .map((workspaceId) => ({
        workspace_id: workspaceId,
        workspace_name: findMockWorkspaceRecord(workspaceId)?.name || workspaceId,
      }))
    nextAsset = {
      ...nextAsset,
      workspace_names: nextWorkspacePlacements.map((workspace) => workspace.workspace_name),
      workspace_placements: nextWorkspacePlacements,
      workspace_name: nextWorkspacePlacements[0]?.workspace_name || null,
    }
  }
  if (typeof body.filename === 'string' && body.filename.trim() && body.filename.trim() !== asset.filename) {
    nextAsset = {
      ...nextAsset,
      audit_log_entries: appendMockLibraryAssetAuditEntry(nextAsset, {
        category: 'asset',
        event_type: 'asset_renamed',
        from_value: asset.filename,
        to_value: body.filename.trim(),
        message: `${resolveMockCurrentUserName()} renamed ${asset.filename} to ${body.filename.trim()}.`,
      }),
    }
  }
  if (typeof body.locked_for_team_members === 'boolean' && body.locked_for_team_members !== (asset.locked_for_team_members === true)) {
    nextAsset = {
      ...nextAsset,
      audit_log_entries: appendMockLibraryAssetAuditEntry(nextAsset, {
        category: 'asset',
        event_type: body.locked_for_team_members ? 'asset_locked' : 'asset_unlocked',
        to_value: body.locked_for_team_members ? 'locked' : 'unlocked',
        message: body.locked_for_team_members
          ? `${resolveMockCurrentUserName()} locked ${asset.filename} for team members.`
          : `${resolveMockCurrentUserName()} unlocked ${asset.filename} for team members.`,
      }),
    }
  }
  const nextWorkspaceIds = resolveMockWorkspaceContexts(nextAsset).map((workspace) => workspace.workspaceId)
  previousWorkspaceIds
    .filter((workspaceId) => !nextWorkspaceIds.includes(workspaceId))
    .forEach((workspaceId) => {
      const workspaceName = findMockWorkspaceRecord(workspaceId)?.name || workspaceId
      nextAsset = {
        ...nextAsset,
        audit_log_entries: appendMockLibraryAssetAuditEntry(nextAsset, {
          category: 'asset',
          event_type: 'asset_workspace_unlinked',
          from_value: workspaceName,
          message: `${resolveMockCurrentUserName()} removed ${asset.filename} from ${workspaceName}.`,
        }),
      }
    })
  nextWorkspaceIds
    .filter((workspaceId) => !previousWorkspaceIds.includes(workspaceId))
    .forEach((workspaceId) => {
      const workspaceName = findMockWorkspaceRecord(workspaceId)?.name || workspaceId
      nextAsset = {
        ...nextAsset,
        audit_log_entries: appendMockLibraryAssetAuditEntry(nextAsset, {
          category: 'asset',
          event_type: 'asset_workspace_linked',
          to_value: workspaceName,
          message: `${resolveMockCurrentUserName()} linked ${asset.filename} to ${workspaceName}.`,
        }),
      }
    })
  const updated = applyMockLibraryAssetCapabilities(nextAsset)
  Object.assign(asset, updated)
  return HttpResponse.json(updated)
})

const libraryAssetDownloadHandler = http.get('*/v1/library/assets/:assetId/download', ({ params }) => {
  const asset = pagesReviewLibraryAssets.find((item) => item.id === params.assetId)
  if (!asset) {
    return HttpResponse.json({ error: { message: 'Not found', detail: 'Asset not found' } }, { status: 404 })
  }
  const scopedAsset = applyMockLibraryAssetCapabilities(asset)
  if (!scopedAsset.can_download) {
    return HttpResponse.json({ error: { message: 'Forbidden', detail: 'Download unavailable for this asset.' } }, { status: 403 })
  }
  asset.audit_log_entries = appendMockLibraryAssetAuditEntry(asset, {
    category: 'asset',
    event_type: 'asset_downloaded',
    message: `${resolveMockCurrentUserName()} downloaded ${asset.filename}.`,
  })
  return new HttpResponse('patient_id,group,event_12m\nP-001,Intervention,0\n', {
    headers: {
      'Content-Type': 'text/csv',
      'Content-Disposition': `attachment; filename="${asset.filename}"`,
    },
  })
})

const collaborationSummaryHandler = http.get('*/v1/account/collaboration/metrics/summary', async () => {
  const mode = resolvePagesReviewMockMode(PAGES_REVIEW_COLLAB_MODE_KEY, 'default')
  if (mode === 'loading') {
    await delay(1400)
  }
  if (mode === 'empty') {
    return HttpResponse.json({
      ...pagesReviewCollaborationSummary,
      total_collaborators: 0,
      core_collaborators: 0,
      active_collaborations_12m: 0,
      new_collaborators_12m: 0,
      status: 'READY',
    })
  }
  return HttpResponse.json(pagesReviewCollaborationSummary)
})

const collaborationListHandler = http.get('*/v1/account/collaboration/collaborators', async ({ request }) => {
  const mode = resolvePagesReviewMockMode(PAGES_REVIEW_COLLAB_MODE_KEY, 'default')
  if (mode === 'loading') {
    await delay(1400)
  }
  if (mode === 'empty') {
    const payload = listCollaboratorsForRequest(request)
    return HttpResponse.json({
      ...payload,
      items: [],
      total: 0,
      has_more: false,
    })
  }
  return HttpResponse.json(listCollaboratorsForRequest(request))
})

const collaborationGetHandler = http.get('*/v1/account/collaboration/collaborators/:collaboratorId', ({ params }) => {
  const item = pagesReviewCollaborators.find((candidate) => candidate.id === params.collaboratorId)
  if (!item) {
    return HttpResponse.json({ error: { message: 'Not found', detail: 'Collaborator not found' } }, { status: 404 })
  }
  return HttpResponse.json(item)
})

const collaborationCreateHandler = http.post('*/v1/account/collaboration/collaborators', async ({ request }) => {
  const body = (await request.json()) as Partial<CollaboratorPayload>
  return HttpResponse.json({
    ...pagesReviewCollaborators[0],
    id: 'collab-created',
    full_name: String(body.full_name || 'New Collaborator'),
    preferred_name: body.preferred_name || null,
    email: body.email || null,
    orcid_id: body.orcid_id || null,
    openalex_author_id: body.openalex_author_id || null,
    primary_institution: body.primary_institution || null,
    department: body.department || null,
    country: body.country || null,
    current_position: body.current_position || null,
    research_domains: body.research_domains || [],
    notes: body.notes || null,
    created_at: pagesReviewUser.created_at,
    updated_at: pagesReviewTimestamp,
  })
})

const collaborationPatchHandler = http.patch('*/v1/account/collaboration/collaborators/:collaboratorId', async ({ params, request }) => {
  const item = pagesReviewCollaborators.find((candidate) => candidate.id === params.collaboratorId)
  if (!item) {
    return HttpResponse.json({ error: { message: 'Not found', detail: 'Collaborator not found' } }, { status: 404 })
  }
  const body = (await request.json()) as Partial<CollaboratorPayload>
  return HttpResponse.json({
    ...item,
    ...body,
    updated_at: pagesReviewTimestamp,
  })
})

const collaborationDeleteHandler = http.delete('*/v1/account/collaboration/collaborators/:collaboratorId', () =>
  HttpResponse.json({ deleted: true }),
)
const collaborationImportHandler = http.post('*/v1/account/collaboration/import/openalex', () =>
  HttpResponse.json({
    created_count: 0,
    updated_count: 0,
    skipped_count: 0,
    openalex_author_id: null,
    imported_candidates: 0,
  }),
)
const collaborationEnrichHandler = http.post('*/v1/account/collaboration/enrich/openalex', () =>
  HttpResponse.json({
    targeted_count: 0,
    resolved_author_count: 0,
    updated_count: 0,
    unchanged_count: 0,
    skipped_without_identifier: 0,
    failed_count: 0,
    enqueued_metrics_recompute: false,
    field_updates: {},
  }),
)
const collaborationExportHandler = http.get('*/v1/account/collaboration/collaborators/export', () =>
  new HttpResponse('full_name,institution\nA. Patel,Northbridge Cardiac Institute\n', {
    headers: {
      'Content-Type': 'text/csv',
      'content-disposition': 'attachment; filename="collaborators.csv"',
    },
  }),
)
const collaborationAiInsightsHandler = http.post('*/v1/account/collaboration/ai/insights', () =>
  HttpResponse.json({
    status: 'draft',
    insights: ['Core collaboration remains stable over 12 months.'],
    suggested_actions: ['Expand reviewer pool for methods-heavy studies.'],
    provenance: { source: 'storybook-msw' },
  }),
)
const collaborationAiAuthorSuggestionsHandler = http.post('*/v1/account/collaboration/ai/author-suggestions', () =>
  HttpResponse.json({
    status: 'draft',
    topic_keywords: ['cardio-oncology'],
    methods: ['registry analysis'],
    suggestions: [
      {
        collaborator_id: pagesReviewCollaborators[0].id,
        full_name: pagesReviewCollaborators[0].full_name,
        institution: pagesReviewCollaborators[0].primary_institution,
        orcid_id: pagesReviewCollaborators[0].orcid_id,
        classification: pagesReviewCollaborators[0].metrics.classification,
        score: 0.92,
        explanation: 'Strong historical collaboration signal.',
        matched_keywords: ['cardio-oncology'],
        matched_methods: ['registry analysis'],
      },
    ],
    provenance: { source: 'storybook-msw' },
  }),
)
const collaborationAiContributionHandler = http.post('*/v1/account/collaboration/ai/contribution-statement', async ({ request }) => {
  const body = (await request.json()) as { authors?: Array<{ full_name?: string }> }
  const names = (body.authors || []).map((item) => String(item.full_name || '').trim()).filter(Boolean)
  return HttpResponse.json({
    status: 'draft',
    credit_statements: names.map((name) => ({
      full_name: name,
      roles: ['Conceptualization', 'Writing - review & editing'],
      is_corresponding: false,
      equal_contribution: false,
      is_external: false,
    })),
    draft_text: names.length ? `Contributions drafted for ${names.join(', ')}.` : 'No authors supplied.',
    provenance: { source: 'storybook-msw' },
  })
})
const collaborationAiAffiliationsHandler = http.post('*/v1/account/collaboration/ai/affiliations-normaliser', () =>
  HttpResponse.json({
    status: 'draft',
    normalized_authors: [
      {
        full_name: 'A. Patel',
        institution: 'Northbridge Cardiac Institute',
        orcid_id: '0000-0003-1234-0001',
        superscript_number: 1,
      },
    ],
    affiliations: [{ superscript_number: 1, institution_name: 'Northbridge Cardiac Institute' }],
    affiliations_block: '1 Northbridge Cardiac Institute',
    coi_boilerplate: 'The authors declare no competing interests.',
    provenance: { source: 'storybook-msw' },
  }),
)

const claimCitationsGetHandler = http.get('*/v1/aawe/claims/:claimId/citations', ({ params, request }) => {
  const requiredSlots = Math.max(1, Number(new URL(request.url).searchParams.get('required_slots') || '1'))
  return HttpResponse.json(buildPagesReviewClaimCitationState(String(params.claimId || 'claim-1'), requiredSlots))
})
const claimCitationsPutHandler = http.put('*/v1/aawe/claims/:claimId/citations', async ({ params, request }) => {
  const body = (await request.json()) as { citation_ids?: string[]; required_slots?: number }
  const requiredSlots = Math.max(1, Number(body.required_slots || 1))
  const selectedIds = Array.isArray(body.citation_ids) ? body.citation_ids : []
  const attached = pagesReviewCitationLibrary.filter((item) => selectedIds.includes(item.id))
  return HttpResponse.json({
    claim_id: String(params.claimId || 'claim-1'),
    required_slots: requiredSlots,
    attached_citation_ids: attached.map((item) => item.id),
    attached_citations: attached,
    missing_slots: Math.max(0, requiredSlots - attached.length),
  })
})
const citationLibraryGetHandler = http.get('*/v1/aawe/citations', ({ request }) => {
  const url = new URL(request.url)
  const query = String(url.searchParams.get('q') || '').trim().toLowerCase()
  const limit = Math.max(1, Number(url.searchParams.get('limit') || '50'))
  const filtered = query
    ? pagesReviewCitationLibrary.filter((item) => {
        const haystack = [item.title, item.authors, item.journal, item.citation_text].join(' ').toLowerCase()
        return haystack.includes(query)
      })
    : pagesReviewCitationLibrary
  return HttpResponse.json(filtered.slice(0, limit))
})
const citationExportPostHandler = http.post('*/v1/aawe/citations/export', () =>
  new HttpResponse(
    '1. Patel A et al. Longitudinal Cardio-Oncology Outcomes Registry. Eur Heart J. 2024.\n',
    {
      headers: {
        'Content-Type': 'text/plain;charset=utf-8',
        'content-disposition': 'attachment; filename="aawe-references.txt"',
      },
    },
  ),
)

export const handlers = [
  publicationsMetricsHandler,
  publicationDetailHandler,
  publicationAuthorsHandler,
  publicationImpactHandler,
  publicationAiInsightsHandler,
  publicationFilesHandler,
  authMeHandler,
  workspacesStateHandler,
  workspacesStatePutHandler,
  workspacesListHandler,
  workspacesCreateHandler,
  workspacesPatchHandler,
  workspacesDeleteHandler,
  workspacesAuthorRequestsHandler,
  workspacesAuthorRequestAcceptHandler,
  workspacesAuthorRequestDeclineHandler,
  workspacesInvitationsHandler,
  workspacesInvitationsCreateHandler,
  workspacesInvitationsPatchHandler,
  workspacesAccountSearchHandler,
  workspacesSetActiveHandler,
  workspacesInboxStateHandler,
  workspacesInboxStatePutHandler,
  workspacesInboxMessagesHandler,
  workspacesInboxMessagesCreateHandler,
  workspacesInboxReadsHandler,
  workspacesInboxReadsCreateHandler,
  journalsHandler,
  runContextHandler,
  libraryAssetsHandler,
  libraryAssetAccessPatchHandler,
  libraryAssetMetadataPatchHandler,
  libraryAssetDownloadHandler,
  collaborationSummaryHandler,
  collaborationListHandler,
  collaborationGetHandler,
  collaborationCreateHandler,
  collaborationPatchHandler,
  collaborationDeleteHandler,
  collaborationImportHandler,
  collaborationEnrichHandler,
  collaborationExportHandler,
  collaborationAiInsightsHandler,
  collaborationAiAuthorSuggestionsHandler,
  collaborationAiContributionHandler,
  collaborationAiAffiliationsHandler,
  claimCitationsGetHandler,
  claimCitationsPutHandler,
  citationLibraryGetHandler,
  citationExportPostHandler,
]
