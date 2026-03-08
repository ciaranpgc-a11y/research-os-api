/**
 * Data library view page
 *
 * Displays files, access controls, and workspace linkage for the data library.
 * Supports browsing, filtering, searching, and managing asset visibility and metadata.
 */

import { useCallback, useEffect, useMemo, useRef, useState, type MouseEvent as ReactMouseEvent } from 'react'
import { createPortal } from 'react-dom'
import { Archive, ArrowRight, Building2, ChevronDown, ChevronUp, Download, HelpCircle, Loader2, Lock, LockOpen, Pencil, Plus, RotateCcw, Save, Search, Send, Share2, User, UserMinus, X, type LucideIcon } from 'lucide-react'
import { useNavigate } from 'react-router-dom'

import {
  Badge,
  Button,
  Input,
  SelectPrimitive,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Sheet,
  SheetContent,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui'
import { AuditLogGroup, AuditLogMessageRow, AuditLogTransitionRow } from '@/components/patterns/AuditLog'
import { DrilldownSheet, PageHeader, Row, SectionHeader, Stack } from '@/components/primitives'
import { SectionMarker } from '@/components/patterns'
import { formatAuditCompactTimestamp, parseLibraryAssetAuditTransition } from '@/lib/audit-log'
import { getSectionMarkerTone } from '@/lib/section-tone'
import { getAuthSessionToken } from '@/lib/auth-session'
import { drilldownTabFlexGrow } from '@/components/publications/house-drilldown-header-utils'
import { houseCollaborators, houseDrilldown, houseForms, houseLayout, houseMotion, houseSurfaces, houseTypography } from '@/lib/house-style'
import { listCollaborators } from '@/lib/impact-api'
import {
  downloadLibraryAsset,
  listLibraryAssets,
  updateLibraryAssetAccess,
  updateLibraryAssetMetadata,
} from '@/lib/study-core-api'
import { cn } from '@/lib/utils'
import { useWorkspaceStore, type WorkspaceCollaboratorRole, type WorkspaceRecord } from '@/store/use-workspace-store'
import type { CollaboratorPayload } from '@/types/impact'
import type {
  LibraryAssetAccessRole,
  LibraryAssetAuditEntry,
  LibraryAssetOwnership,
  LibraryAssetRecord,
  LibraryAssetScope,
  LibraryAssetSortBy,
  LibraryAssetSortDirection,
} from '@/types/study-core'

const HOUSE_FIELD_HELPER_CLASS = houseTypography.fieldHelper
const HOUSE_SECTION_ANCHOR_CLASS = houseLayout.sectionAnchor
const HOUSE_TABLE_HEAD_TEXT_CLASS = houseTypography.tableHead
const HOUSE_TABLE_CELL_TEXT_CLASS = houseTypography.tableCell
const HOUSE_INPUT_CLASS = houseForms.input
const HOUSE_TOGGLE_BUTTON_CLASS = houseMotion.toggleButton
const HOUSE_DRILLDOWN_TOGGLE_MUTED_CLASS = houseDrilldown.toggleButtonMuted
const HOUSE_COLLABORATOR_ACTION_ICON_CLASS = houseCollaborators.actionIcon
const HOUSE_COLLABORATOR_ACTION_ICON_ADD_CLASS = houseCollaborators.actionIconAdd
const HOUSE_COLLABORATOR_ACTION_ICON_EDIT_CLASS = houseCollaborators.actionIconEdit
const HOUSE_COLLABORATOR_ACTION_ICON_CONFIRM_CLASS = houseCollaborators.actionIconConfirm
const HOUSE_COLLABORATOR_ACTION_ICON_DISCARD_CLASS = houseCollaborators.actionIconDiscard
const HOUSE_DRILLDOWN_SHEET_CLASS = houseDrilldown.sheet
const HOUSE_DRILLDOWN_SHEET_BODY_CLASS = houseDrilldown.sheetBody
const HOUSE_DRILLDOWN_COLLAPSIBLE_ENTITY_CLASS = houseDrilldown.collapsibleEntity
const HOUSE_DRILLDOWN_TAB_LIST_CLASS = houseDrilldown.tabList
const HOUSE_DRILLDOWN_TAB_TRIGGER_CLASS = houseDrilldown.tabTrigger
const DATA_LIBRARY_LOCK_INDICATOR_CLASS = 'inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full border border-[hsl(var(--tone-neutral-500))] bg-[hsl(var(--tone-neutral-50))] text-[hsl(var(--tone-neutral-800))]'
const DATA_LIBRARY_SHARED_TARGET_DIRECT_BADGE_CLASS = 'border-[hsl(var(--border))] bg-[hsl(var(--tone-neutral-50))] text-[hsl(var(--tone-neutral-800))]'
const DATA_LIBRARY_SHARED_TARGET_WORKSPACE_BADGE_CLASS = 'border-amber-200 bg-amber-50 text-amber-900'

const DATA_LIBRARY_SCOPE_OPTIONS: Array<{ value: LibraryAssetOwnership; label: string }> = [
  { value: 'all', label: 'All files' },
  { value: 'owned', label: 'My files' },
  { value: 'shared_by_me', label: 'Shared by me' },
  { value: 'shared', label: 'Shared with me' },
]
const DATA_LIBRARY_ARCHIVE_SCOPE_OPTIONS: Array<{ value: LibraryAssetScope; label: string }> = [
  { value: 'all', label: 'All' },
  { value: 'active', label: 'Active' },
  { value: 'archived', label: 'Archived' },
]
const DATA_LIBRARY_ACCESS_ROLE_OPTIONS: Array<{ value: LibraryAssetAccessRole; label: string }> = [
  { value: 'editor', label: 'Editor' },
  { value: 'viewer', label: 'Viewer' },
]
const DATA_LIBRARY_ACCESS_ACTIVITY_FILTER_OPTIONS: Array<{ value: DataLibraryAccessActivityFilter; label: string }> = [
  { value: 'all', label: 'All' },
  { value: 'access_status', label: 'Access' },
  { value: 'role_changes', label: 'Roles' },
  { value: 'invitation_status', label: 'Invites' },
  { value: 'other', label: 'Other' },
]

type WorkspacesDataLibraryViewProps = {
  showPageHeader?: boolean
  workspaceId?: string | null
  workspaceName?: string | null
  onOpenWorkspaceDrilldown?: ((workspaceId: string, initialTab?: 'overview' | 'actions') => void) | null
  drilldownRequest?: DataLibraryDrilldownRequest | null
}

type DataLibraryDrilldownTab = 'overview' | 'access' | 'actions' | 'logs'
type DataLibraryAccessActivityFilter =
  | 'all'
  | 'access_status'
  | 'role_changes'
  | 'invitation_status'
  | 'other'
type DataLibraryDrilldownRequest = {
  requestKey: number
  assetId: string
  tab?: DataLibraryDrilldownTab
  accessFilter?: DataLibraryAccessActivityFilter
  actorName?: string | null
}
type DataLibraryMenuState = {
  assetId: string
  x: number
  y: number
}
type WorkspaceAccessMenuState = {
  workspaceId: string
  x: number
  y: number
}
type WorkspaceAccessMember = {
  key: string
  user_id: string
  name: string
  accessRole: LibraryAssetAccessRole
  isWorkspaceOwner: boolean
}
type DataLibraryTableDensity = 'compact' | 'default' | 'comfortable'
type DataLibraryTableColumnKey = 'filename' | 'workspaces' | 'origin' | 'access' | 'owner' | 'uploaded' | 'format' | 'size'

const DATA_LIBRARY_TABLE_COLUMN_ORDER: DataLibraryTableColumnKey[] = [
  'filename',
  'workspaces',
  'origin',
  'access',
  'owner',
  'uploaded',
  'format',
  'size',
]

const DATA_LIBRARY_TABLE_COLUMN_DEFINITIONS: Record<
  DataLibraryTableColumnKey,
  { label: string; width: string; sortBy?: LibraryAssetSortBy; hideable?: boolean; align?: 'left' | 'center' }
> = {
  filename: { label: 'File name', width: '18%', sortBy: 'filename' },
  workspaces: { label: 'Workspaces', width: '15%', hideable: true },
  origin: { label: 'Permissions', width: '11%', hideable: true },
  access: { label: 'Access via', width: '15%', hideable: true },
  owner: { label: 'Owner', width: '13%', sortBy: 'owner_name', hideable: true },
  uploaded: { label: 'Uploaded', width: '11%', sortBy: 'uploaded_at', hideable: true },
  format: { label: 'Format', width: '7%', sortBy: 'kind', hideable: true },
  size: { label: 'Size', width: '7%', sortBy: 'byte_size', hideable: true },
}

function normalizeName(value: string | null | undefined): string {
  return (value || '').trim().replace(/\s+/g, ' ')
}

function normalizeUserId(value: string | null | undefined): string {
  return String(value || '').trim()
}

function normalizeWorkspaceIds(values: Array<string | null | undefined> | null | undefined): string[] {
  const deduped: string[] = []
  const seen = new Set<string>()
  ;(values || []).forEach((value) => {
    const clean = normalizeUserId(value)
    if (!clean || seen.has(clean)) {
      return
    }
    seen.add(clean)
    deduped.push(clean)
  })
  return deduped
}

function resolveCollaboratorUserId(candidate: CollaboratorPayload): string {
  return normalizeUserId(candidate.owner_user_id || candidate.id)
}

function displayAssetFilename(filename: string): string {
  const clean = String(filename || '').trim()
  if (!clean) {
    return 'Untitled file'
  }
  const stripped = clean.replace(/\.(csv|xls|xlsx)$/i, '')
  return stripped || clean
}

function formatTimestamp(value: string): string {
  const parsed = Date.parse(value)
  if (Number.isNaN(parsed)) {
    return 'Not available'
  }
  return new Date(parsed).toLocaleString('en-GB', {
    year: 'numeric',
    month: 'short',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) {
    return '0 B'
  }
  const units = ['B', 'KB', 'MB', 'GB']
  let size = bytes
  let unit = units[0]
  for (let index = 1; index < units.length && size >= 1024; index += 1) {
    size /= 1024
    unit = units[index]
  }
  const precision = size >= 100 ? 0 : size >= 10 ? 1 : 2
  return `${size.toFixed(precision)} ${unit}`
}

function isAssetAvailable(asset: LibraryAssetRecord): boolean {
  return asset.is_available !== false
}

function isAssetArchivedForCurrentUser(asset: LibraryAssetRecord): boolean {
  return asset.archived_for_current_user === true
}

function isAssetLockedForTeamMembers(asset: LibraryAssetRecord): boolean {
  return asset.locked_for_team_members === true
}

function assetOwnerDisplayName(asset: LibraryAssetRecord): string {
  return normalizeName(asset.owner_name || '') || 'the owner'
}

function assetOwnerCompactReference(asset: LibraryAssetRecord): string {
  return asset.current_user_role === 'owner' ? 'you' : assetOwnerDisplayName(asset)
}

function assetLockedBadgeLabel(asset: LibraryAssetRecord): string {
  return `Locked by ${assetOwnerCompactReference(asset)}`
}

function assetLockActionLabel(asset: LibraryAssetRecord): string {
  return isAssetLockedForTeamMembers(asset) ? 'Unlock for team members' : 'Lock for team members'
}

function assetArchiveActionLabel(asset: LibraryAssetRecord): string {
  return isAssetArchivedForCurrentUser(asset) ? 'Unarchive' : 'Archive'
}

function assetLockStateLabel(asset: LibraryAssetRecord): string {
  return isAssetLockedForTeamMembers(asset) ? assetLockedBadgeLabel(asset) : 'No'
}

function assetArchiveStateLabel(asset: LibraryAssetRecord): string {
  return isAssetArchivedForCurrentUser(asset) ? 'Yes' : 'No'
}

function assetReadOnlyMessage(asset: LibraryAssetRecord): string | null {
  if (!isAssetLockedForTeamMembers(asset)) {
    return null
  }
  if (asset.current_user_role === 'owner') {
    return 'This file is locked by you for team members. You still have full edit access.'
  }
  return `This file is locked by ${assetOwnerDisplayName(asset)} and is view-only.`
}

function assetDownloadUnavailableMessage(asset: LibraryAssetRecord): string {
  if (!isAssetAvailable(asset)) {
    return `'${asset.filename}' is currently unavailable (missing storage).`
  }
  if (isAssetLockedForTeamMembers(asset) && asset.current_user_role !== 'owner') {
    return `This file is locked by ${assetOwnerDisplayName(asset)} for team members.`
  }
  return 'Only file owners and editors can download files.'
}

function humanizeLibraryAssetAccessRole(role: LibraryAssetAccessRole): string {
  return role === 'editor' ? 'Editor' : 'Viewer'
}

function isLibraryAccessStatusAuditEntry(entry: LibraryAssetAuditEntry): boolean {
  return entry.event_type === 'access_granted' || entry.event_type === 'access_revoked'
}

function isLibraryRoleChangeAuditEntry(entry: LibraryAssetAuditEntry): boolean {
  return entry.event_type === 'access_role_changed' || entry.event_type === 'pending_access_role_changed'
}

function isLibraryInvitationStatusAuditEntry(entry: LibraryAssetAuditEntry): boolean {
  return (
    entry.event_type === 'access_invited'
    || entry.event_type === 'access_invitation_cancelled'
    || entry.event_type === 'access_invitation_accepted'
    || entry.event_type === 'access_invitation_declined'
  )
}

function matchesLibraryAccessActivityFilter(
  entry: LibraryAssetAuditEntry,
  filter: DataLibraryAccessActivityFilter,
): boolean {
  if (filter === 'all') {
    return true
  }
  if (filter === 'access_status') {
    return isLibraryAccessStatusAuditEntry(entry)
  }
  if (filter === 'role_changes') {
    return isLibraryRoleChangeAuditEntry(entry)
  }
  if (filter === 'invitation_status') {
    return isLibraryInvitationStatusAuditEntry(entry)
  }
  if (filter === 'other') {
    return (
      !isLibraryAccessStatusAuditEntry(entry)
      && !isLibraryRoleChangeAuditEntry(entry)
      && !isLibraryInvitationStatusAuditEntry(entry)
    )
  }
  return true
}

function libraryAssetWorkspacePlacements(asset: LibraryAssetRecord): Array<{ workspace_id: string; workspace_name: string }> {
  if (Array.isArray(asset.workspace_placements) && asset.workspace_placements.length > 0) {
    return asset.workspace_placements
      .map((placement) => ({
        workspace_id: normalizeUserId(placement.workspace_id),
        workspace_name: normalizeName(placement.workspace_name) || normalizeUserId(placement.workspace_id),
      }))
      .filter((placement) => placement.workspace_id)
  }

  const workspaceIds = normalizeWorkspaceIds(asset.workspace_ids)
  const workspaceNames = Array.isArray(asset.workspace_names)
    ? asset.workspace_names.map((value) => normalizeName(value))
    : []
  if (workspaceIds.length > 0) {
    return workspaceIds.map((workspaceId, index) => ({
      workspace_id: workspaceId,
      workspace_name: workspaceNames[index] || workspaceId,
    }))
  }

  const legacyWorkspaceId = normalizeUserId(asset.workspace_id)
  if (!legacyWorkspaceId) {
    return []
  }
  return [{
    workspace_id: legacyWorkspaceId,
    workspace_name: normalizeName(asset.workspace_name || '') || legacyWorkspaceId,
  }]
}

function libraryAssetWorkspaceSummary(asset: LibraryAssetRecord): string {
  const placements = libraryAssetWorkspacePlacements(asset)
  if (placements.length === 0) {
    return 'None'
  }
  if (placements.length === 1) {
    return placements[0].workspace_name
  }
  return `${placements[0].workspace_name} + ${placements.length - 1}`
}

function libraryAssetPermissionsBadge(asset: LibraryAssetRecord): {
  label: string
  description: string
  variant: 'positive' | 'outline'
  className?: string
} {
  switch (asset.current_user_role) {
    case 'owner':
    case 'editor':
      return {
        label: 'Editor',
        description: asset.current_user_access_source === 'owner'
          ? 'You own this file and have full control.'
          : 'You can download and work with this file.',
        variant: 'positive',
        className: 'font-semibold',
      }
    case 'viewer':
    default:
      return {
        label: 'Read-only',
        description: 'You can view this file, but not edit or download it.',
        variant: 'outline',
        className: 'font-medium',
      }
  }
}

function libraryAssetAccessViaDetail(asset: LibraryAssetRecord): {
  label: string
  description: string
  variant: 'positive' | 'yellow' | 'outline'
  icon: LucideIcon
  className?: string
} {
  const ownerName = assetOwnerDisplayName(asset)
  const workspaceSummary = libraryAssetWorkspaceSummary(asset)
  switch (asset.current_user_access_source) {
    case 'owner':
      return {
        label: 'Owned by you',
        description: 'This file is in your library because you own it.',
        variant: 'positive',
        icon: User,
        className: 'font-semibold',
      }
    case 'direct_share':
      return {
        label: `Direct share by ${ownerName}`,
        description: `Shared with you directly by ${ownerName}.`,
        variant: 'outline',
        icon: Share2,
        className: 'font-medium',
      }
    case 'workspace_member':
    case 'project_collaborator':
      return {
        label: workspaceSummary === 'None' ? 'Workspace access' : `Workspace: ${workspaceSummary}`,
        description: 'Available through workspace access.',
        variant: 'yellow',
        icon: Building2,
        className: 'font-semibold',
      }
    default:
      return {
        label: 'Unknown',
        description: 'Access source unavailable.',
        variant: 'outline',
        icon: HelpCircle,
        className: 'font-medium',
      }
  }
}

function workspaceActiveCollaborators(workspace: WorkspaceRecord | null | undefined): Array<{ user_id: string; name: string }> {
  if (!workspace) {
    return []
  }
  const removedIds = new Set(
    (workspace.removedCollaborators || [])
      .map((participant) => normalizeUserId(participant.userId))
      .filter(Boolean),
  )
  return (workspace.collaborators || [])
    .map((participant) => ({
      user_id: normalizeUserId(participant.userId),
      name: normalizeName(participant.name) || normalizeUserId(participant.userId) || 'Workspace member',
    }))
    .filter((participant) => participant.name && !removedIds.has(participant.user_id))
}

function normalizeWorkspaceCollaboratorRole(value: WorkspaceCollaboratorRole | string | null | undefined): WorkspaceCollaboratorRole {
  const clean = normalizeName(value || '').toLowerCase()
  if (clean === 'reviewer' || clean === 'viewer') {
    return clean
  }
  return 'editor'
}

function workspaceDerivedAssetAccessRole(
  membership: 'owner' | 'collaborator',
  collaboratorRole?: WorkspaceCollaboratorRole | null,
): LibraryAssetAccessRole {
  if (membership === 'owner') {
    return 'editor'
  }
  return normalizeWorkspaceCollaboratorRole(collaboratorRole) === 'editor' ? 'editor' : 'viewer'
}

function workspaceAccessMembers(workspace: WorkspaceRecord | null | undefined): WorkspaceAccessMember[] {
  if (!workspace) {
    return []
  }

  const removedIds = new Set(
    (workspace.removedCollaborators || [])
      .map((participant) => normalizeUserId(participant.userId))
      .filter(Boolean),
  )
  const members: WorkspaceAccessMember[] = []
  const ownerUserId = normalizeUserId(workspace.ownerUserId)
  const ownerName = normalizeName(workspace.ownerName) || ownerUserId || 'Workspace owner'

  if (ownerName && (!ownerUserId || !removedIds.has(ownerUserId))) {
    members.push({
      key: `owner-${ownerUserId || ownerName.toLowerCase()}`,
      user_id: ownerUserId,
      name: ownerName,
      accessRole: workspaceDerivedAssetAccessRole('owner'),
      isWorkspaceOwner: true,
    })
  }

  ;(workspace.collaborators || []).forEach((participant) => {
    const userId = normalizeUserId(participant.userId)
    if (!userId || removedIds.has(userId) || userId === ownerUserId) {
      return
    }

    const collaboratorRole = normalizeWorkspaceCollaboratorRole(workspace.collaboratorRoles?.[userId])
    members.push({
      key: `member-${userId}`,
      user_id: userId,
      name: normalizeName(participant.name) || userId || 'Workspace member',
      accessRole: workspaceDerivedAssetAccessRole('collaborator', collaboratorRole),
      isWorkspaceOwner: false,
    })
  })

  return members.sort((left, right) => {
    if (left.isWorkspaceOwner !== right.isWorkspaceOwner) {
      return left.isWorkspaceOwner ? -1 : 1
    }
    return left.name.localeCompare(right.name)
  })
}

function libraryAssetSharedAudience(
  asset: LibraryAssetRecord,
  workspacePlacements: Array<{ workspace_id: string; workspace_name: string; canOpen: boolean }>,
  workspaceRecordsById: Map<string, WorkspaceRecord>,
): {
  directTargets: Array<{ key: string; label: string }>
  workspaceTargets: Array<{ key: string; label: string }>
  allTargets: Array<{ key: string; label: string; kind: 'direct' | 'workspace' }>
  summary: string
} {
  const ownerUserId = normalizeUserId(asset.owner_user_id)
  const directTargets = libraryAssetAccessMembers(asset)
    .filter((member) => {
      const memberUserId = normalizeUserId(member.user_id)
      return Boolean(memberUserId) && memberUserId !== ownerUserId
    })
    .map((member) => ({
      key: `direct-${normalizeUserId(member.user_id)}`,
      label: normalizeName(member.name) || normalizeUserId(member.user_id) || 'Direct share',
    }))

  const knownWorkspaceTargets = workspacePlacements
    .filter((placement) => {
      const workspaceRecord = workspaceRecordsById.get(placement.workspace_id)
      return Boolean(workspaceRecord) && workspaceActiveCollaborators(workspaceRecord).length > 0
    })
    .map((placement) => ({
      key: `workspace-${placement.workspace_id}`,
      label: placement.workspace_name,
    }))
  const fallbackWorkspaceTargets = workspacePlacements
    .filter((placement) => !workspaceRecordsById.has(placement.workspace_id))
    .map((placement) => ({
      key: `workspace-${placement.workspace_id}`,
      label: placement.workspace_name,
    }))
  const workspaceTargets = knownWorkspaceTargets.length > 0 || directTargets.length > 0
    ? knownWorkspaceTargets
    : fallbackWorkspaceTargets

  const allTargets = [
    ...directTargets.map((target) => ({ ...target, kind: 'direct' as const })),
    ...workspaceTargets.map((target) => ({ ...target, kind: 'workspace' as const })),
  ]

  const summaryParts: string[] = []

  return {
    directTargets,
    workspaceTargets,
    allTargets,
    summary: summaryParts.length > 0 ? summaryParts.join(' · ') : 'No active access',
  }
}

function nextSortDirection(
  activeSortBy: LibraryAssetSortBy,
  activeSortDirection: LibraryAssetSortDirection,
  nextSortBy: LibraryAssetSortBy,
): LibraryAssetSortDirection {
  if (activeSortBy === nextSortBy) {
    return activeSortDirection === 'desc' ? 'asc' : 'desc'
  }
  return nextSortBy === 'uploaded_at' || nextSortBy === 'byte_size' ? 'desc' : 'asc'
}

function libraryAssetAccessMembers(asset: LibraryAssetRecord): Array<{ user_id: string; name: string; role: LibraryAssetAccessRole }> {
  if (Array.isArray(asset.shared_with) && asset.shared_with.length > 0) {
    return asset.shared_with.map((item) => ({
      user_id: String(item.user_id || '').trim(),
      name: normalizeName(String(item.name || '')) || 'Unknown user',
      role: item.role === 'editor' ? 'editor' : 'viewer',
    }))
  }
  if (Array.isArray(asset.shared_with_user_ids) && asset.shared_with_user_ids.length > 0) {
    return asset.shared_with_user_ids.map((userId) => ({
      user_id: String(userId || '').trim(),
      name: String(userId || '').trim() || 'Unknown user',
      role: 'viewer',
    }))
  }
  return []
}

function libraryAssetPendingAccessMembers(asset: LibraryAssetRecord): Array<{ user_id: string; name: string; role: LibraryAssetAccessRole }> {
  if (!Array.isArray(asset.pending_with) || asset.pending_with.length === 0) {
    return []
  }
  return asset.pending_with.map((item) => ({
    user_id: String(item.user_id || '').trim(),
    name: normalizeName(String(item.name || '')) || 'Unknown user',
    role: item.role === 'editor' ? 'editor' : 'viewer',
  }))
}

function libraryAssetManageableAccessMembers(asset: LibraryAssetRecord): Array<{
  user_id: string
  name: string
  role: LibraryAssetAccessRole
  state: 'active' | 'pending'
}> {
  const members = [
    ...libraryAssetAccessMembers(asset).map((member) => ({ ...member, state: 'active' as const })),
    ...libraryAssetPendingAccessMembers(asset).map((member) => ({ ...member, state: 'pending' as const })),
  ]
  const seen = new Set<string>()
  return members.filter((member) => {
    const cleanUserId = normalizeUserId(member.user_id)
    if (!cleanUserId || seen.has(cleanUserId)) {
      return false
    }
    seen.add(cleanUserId)
    return true
  })
}

function selectedCandidateByAssetIdValue(
  map: Record<string, CollaboratorPayload | null>,
  assetId: string,
): CollaboratorPayload | null {
  return map[assetId] || null
}

function canViewDataLibraryDrilldownTab(
  asset: LibraryAssetRecord | null,
  tab: DataLibraryDrilldownTab,
): boolean {
  if (!asset) {
    return true
  }
  if (tab === 'access') {
    return Boolean(asset.can_manage_access)
  }
  return true
}

function dataLibraryDrilldownTabRestrictionMessage(tab: DataLibraryDrilldownTab): string | null {
  if (tab === 'access') {
    return 'Only file owners can edit file access.'
  }
  return null
}

function dataLibraryDrilldownTabLabel(
  tab: DataLibraryDrilldownTab,
  asset: LibraryAssetRecord | null,
): string {
  if (tab === 'logs' && asset && !asset.can_manage_access) {
    return 'History'
  }
  switch (tab) {
    case 'overview':
      return 'Overview'
    case 'access':
      return 'Access'
    case 'actions':
      return 'Files'
    case 'logs':
    default:
      return 'Logs'
  }
}

export function WorkspacesDataLibraryView({
  showPageHeader = true,
  workspaceId = null,
  workspaceName = null,
  onOpenWorkspaceDrilldown = null,
  drilldownRequest = null,
}: WorkspacesDataLibraryViewProps = {}) {
  const navigate = useNavigate()
  const normalizedWorkspaceId = normalizeUserId(workspaceId)
  const normalizedWorkspaceName = normalizeName(workspaceName || '')
  const isWorkspaceScoped = Boolean(normalizedWorkspaceId)
  const workspaceRecords = useWorkspaceStore((state) => state.workspaces)
  const setActiveWorkspaceId = useWorkspaceStore((state) => state.setActiveWorkspaceId)
  const availableWorkspaceOptions = useMemo(
    () => workspaceRecords
      .map((workspace) => ({
        id: normalizeUserId(workspace.id),
        name: normalizeName(workspace.name) || 'Workspace',
      }))
      .filter((workspace) => workspace.id),
    [workspaceRecords],
  )
  const availableWorkspaceOptionsById = useMemo(
    () => new Map(availableWorkspaceOptions.map((workspace) => [workspace.id, workspace])),
    [availableWorkspaceOptions],
  )
  const workspaceRecordsById = useMemo(
    () => new Map(
      workspaceRecords
        .map((workspace) => [normalizeUserId(workspace.id), workspace] as const)
        .filter(([workspaceId]) => workspaceId),
    ),
    [workspaceRecords],
  )
  const [assets, setAssets] = useState<LibraryAssetRecord[]>([])
  const [ownershipFilter, setOwnershipFilter] = useState<LibraryAssetOwnership>('all')
  const [archiveScope, setArchiveScope] = useState<LibraryAssetScope>('all')
  const [sortBy, setSortBy] = useState<LibraryAssetSortBy>('uploaded_at')
  const [sortDirection, setSortDirection] = useState<LibraryAssetSortDirection>('desc')
  const [tableDensity] = useState<DataLibraryTableDensity>('default')
  const [visibleColumns] = useState<Record<DataLibraryTableColumnKey, boolean>>({
    filename: true,
    workspaces: true,
    origin: true,
    access: true,
    owner: true,
    uploaded: true,
    format: true,
    size: true,
  })
  const [page, setPage] = useState(1)
  const [pageSize] = useState(25)
  const [, setTotal] = useState(0)
  const [, setHasMore] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState('')
  const [status, setStatus] = useState('')
  const [busyAssetId, setBusyAssetId] = useState<string | null>(null)
  const [renamingAssetId, setRenamingAssetId] = useState<string | null>(null)
  const [renameDraft, setRenameDraft] = useState('')
  const [refreshTick, setRefreshTick] = useState(0)
  const [selectedAssetId, setSelectedAssetId] = useState<string | null>(null)
  const [drilldownTab, setDrilldownTab] = useState<DataLibraryDrilldownTab>('overview')
  const [accessActivityFilter, setAccessActivityFilter] = useState<DataLibraryAccessActivityFilter>('all')
  const [accessActivityCollapsed, setAccessActivityCollapsed] = useState(true)
  const [assetActivityCollapsed, setAssetActivityCollapsed] = useState(true)
  const [accessActivityActorExpanded, setAccessActivityActorExpanded] = useState<Record<string, boolean>>({})
  const [assetActivityGroupExpanded, setAssetActivityGroupExpanded] = useState<Record<string, boolean>>({})
  const [accessComposerOpen, setAccessComposerOpen] = useState(false)
  const [accessComposerRole, setAccessComposerRole] = useState<LibraryAssetAccessRole>('viewer')
  const [accessEditingUserId, setAccessEditingUserId] = useState<string | null>(null)
  const [accessEditingRole, setAccessEditingRole] = useState<LibraryAssetAccessRole>('viewer')
  const [accessRemovalConfirmUserId, setAccessRemovalConfirmUserId] = useState<string | null>(null)

  const [collaboratorQueryByAssetId, setCollaboratorQueryByAssetId] = useState<Record<string, string>>({})
  const [collaboratorLookupByAssetId, setCollaboratorLookupByAssetId] = useState<Record<string, CollaboratorPayload[]>>({})
  const [selectedCollaboratorByAssetId, setSelectedCollaboratorByAssetId] = useState<Record<string, CollaboratorPayload | null>>({})
  const [lookupErrorByAssetId, setLookupErrorByAssetId] = useState<Record<string, string>>({})
  const [lookupBusyAssetId, setLookupBusyAssetId] = useState<string | null>(null)
  const [menuState, setMenuState] = useState<DataLibraryMenuState | null>(null)
  const [workspaceAccessMenuState, setWorkspaceAccessMenuState] = useState<WorkspaceAccessMenuState | null>(null)
  const [workspaceAccessExpandedById, setWorkspaceAccessExpandedById] = useState<Record<string, boolean>>({})
  const suppressAssetRowClickRef = useRef<string | null>(null)
  const appliedDrilldownRequestKeyRef = useRef<number | null>(null)

  const hasSessionToken = Boolean(getAuthSessionToken())

  useEffect(() => {
    let cancelled = false

    if (!hasSessionToken) {
      setAssets([])
      setTotal(0)
      setHasMore(false)
      setError('')
      setStatus('')
      setIsLoading(false)
      return () => {
        cancelled = true
      }
    }

    const token = getAuthSessionToken()
    if (!token) {
      setAssets([])
      setTotal(0)
      setHasMore(false)
      setError('')
      setStatus('')
      setIsLoading(false)
      return () => {
        cancelled = true
      }
    }

    const load = async () => {
      setIsLoading(true)
      setError('')
      try {
        const payload = await listLibraryAssets({
          token,
          workspaceId: normalizedWorkspaceId || undefined,
          ownership: ownershipFilter,
          scope: archiveScope,
          page,
          pageSize,
          sortBy,
          sortDirection,
        })
        if (cancelled) {
          return
        }

        const totalPages = Math.max(1, Math.ceil(Math.max(0, payload.total) / Math.max(1, payload.page_size)))
        if (payload.total > 0 && page > totalPages) {
          setPage(totalPages)
          return
        }

        setAssets(payload.items || [])
        setTotal(Math.max(0, Number(payload.total || 0)))
        setHasMore(Boolean(payload.has_more))
      } catch (loadError) {
        if (cancelled) {
          return
        }
        setAssets([])
        setTotal(0)
        setHasMore(false)
        setError(loadError instanceof Error ? loadError.message : 'Could not load data library.')
      } finally {
        if (!cancelled) {
          setIsLoading(false)
        }
      }
    }

    void load()

    return () => {
      cancelled = true
    }
  }, [archiveScope, hasSessionToken, normalizedWorkspaceId, ownershipFilter, page, pageSize, refreshTick, sortBy, sortDirection])

  useEffect(() => {
    setPage(1)
  }, [normalizedWorkspaceId])

  useEffect(() => {
    if (renamingAssetId && !assets.some((asset) => asset.id === renamingAssetId)) {
      setRenamingAssetId(null)
      setRenameDraft('')
    }
    if (selectedAssetId && !assets.some((asset) => asset.id === selectedAssetId)) {
      setSelectedAssetId(null)
    }
    if (menuState && !assets.some((asset) => asset.id === menuState.assetId)) {
      setMenuState(null)
    }
  }, [assets, menuState, renamingAssetId, selectedAssetId])

  useEffect(() => {
    setAccessActivityFilter('all')
    setAccessActivityCollapsed(true)
    setAssetActivityCollapsed(true)
    setAccessActivityActorExpanded({})
    setAssetActivityGroupExpanded({})
    setAccessComposerOpen(false)
    setAccessComposerRole('viewer')
    setAccessEditingUserId(null)
    setAccessEditingRole('viewer')
    setAccessRemovalConfirmUserId(null)
    setWorkspaceAccessMenuState(null)
    setWorkspaceAccessExpandedById({})
  }, [selectedAssetId])

  useEffect(() => {
    if (!drilldownRequest?.assetId || appliedDrilldownRequestKeyRef.current === drilldownRequest.requestKey) {
      return
    }
    appliedDrilldownRequestKeyRef.current = drilldownRequest.requestKey
    setSelectedAssetId(drilldownRequest.assetId)
    setDrilldownTab(drilldownRequest.tab || 'logs')
    const timeoutId = window.setTimeout(() => {
      if ((drilldownRequest.tab || 'logs') !== 'logs') {
        return
      }
      setAccessActivityFilter(drilldownRequest.accessFilter || 'all')
      setAccessActivityCollapsed(false)
      setAssetActivityCollapsed(true)
      setAssetActivityGroupExpanded({})
      if (drilldownRequest.actorName) {
        setAccessActivityActorExpanded({
          you: true,
          [normalizeName(drilldownRequest.actorName).toLowerCase()]: true,
        })
        return
      }
      setAccessActivityActorExpanded({})
    }, 0)
    return () => window.clearTimeout(timeoutId)
  }, [drilldownRequest])

  const updateAssetInState = useCallback((nextAsset: LibraryAssetRecord) => {
    setAssets((current) => current.map((item) => (item.id === nextAsset.id ? nextAsset : item)))
  }, [])

  const visibleTableColumns = useMemo(
    () => DATA_LIBRARY_TABLE_COLUMN_ORDER.filter((columnKey) => visibleColumns[columnKey]),
    [visibleColumns],
  )
  const showsSharedByMeAudienceColumn = ownershipFilter === 'shared_by_me'
  const tableColumnDefinitions = useMemo(
    () => ({
      ...DATA_LIBRARY_TABLE_COLUMN_DEFINITIONS,
      owner: showsSharedByMeAudienceColumn
        ? { ...DATA_LIBRARY_TABLE_COLUMN_DEFINITIONS.owner, label: 'Shared with', sortBy: undefined }
        : DATA_LIBRARY_TABLE_COLUMN_DEFINITIONS.owner,
    }),
    [showsSharedByMeAudienceColumn],
  )

  const onRefresh = useCallback(() => {
    setRefreshTick((current) => current + 1)
  }, [])

  useEffect(() => {
    if (!hasSessionToken) {
      return
    }

    const handleFocus = () => onRefresh()
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        onRefresh()
      }
    }

    window.addEventListener('focus', handleFocus)
    document.addEventListener('visibilitychange', handleVisibilityChange)

    return () => {
      window.removeEventListener('focus', handleFocus)
      document.removeEventListener('visibilitychange', handleVisibilityChange)
    }
  }, [hasSessionToken, onRefresh])

  const resetAccessComposerForAsset = useCallback((assetId: string) => {
    setAccessComposerOpen(false)
    setAccessComposerRole('viewer')
    setCollaboratorLookupByAssetId((current) => ({ ...current, [assetId]: [] }))
    setSelectedCollaboratorByAssetId((current) => ({ ...current, [assetId]: null }))
    setCollaboratorQueryByAssetId((current) => ({ ...current, [assetId]: '' }))
    setLookupErrorByAssetId((current) => ({ ...current, [assetId]: '' }))
    setLookupBusyAssetId((current) => (current === assetId ? null : current))
  }, [])

  const onCancelRenameAsset = useCallback(() => {
    setRenamingAssetId(null)
    setRenameDraft('')
  }, [])

  const onStartRenameAsset = useCallback((asset: LibraryAssetRecord) => {
    if (!asset.can_edit_metadata) {
      setError('Only the file owner can rename files.')
      return
    }
    setError('')
    setStatus('')
    setRenamingAssetId(asset.id)
    setRenameDraft(asset.filename)
  }, [])

  const onSaveRenameAsset = useCallback(
    async (asset: LibraryAssetRecord) => {
      const nextFilename = String(renameDraft || '').trim()
      if (!asset.can_edit_metadata) {
        setError('Only the file owner can rename files.')
        return
      }
      if (!nextFilename) {
        setError('File name is required.')
        return
      }
      if (nextFilename === asset.filename) {
        onCancelRenameAsset()
        return
      }
      const token = getAuthSessionToken()
      if (!token) {
        setError('Sign in to manage permissions.')
        return
      }

      setError('')
      setStatus('')
      setBusyAssetId(asset.id)
      try {
        const updated = await updateLibraryAssetMetadata({
          token,
          assetId: asset.id,
          filename: nextFilename,
        })
        updateAssetInState(updated)
        setStatus(`Renamed to ${updated.filename}.`)
        onCancelRenameAsset()
      } catch (renameError) {
        setError(renameError instanceof Error ? renameError.message : 'Could not rename file.')
      } finally {
        setBusyAssetId((current) => (current === asset.id ? null : current))
      }
    },
    [onCancelRenameAsset, renameDraft, updateAssetInState],
  )

  const onDownloadAsset = useCallback(async (asset: LibraryAssetRecord) => {
    if (!isAssetAvailable(asset)) {
      setError(assetDownloadUnavailableMessage(asset))
      return
    }
    if (!asset.can_download) {
      setError(assetDownloadUnavailableMessage(asset))
      return
    }
    const token = getAuthSessionToken()
    if (!token) {
      setError('Sign in to download files.')
      return
    }
    setError('')
    setStatus('')
    setBusyAssetId(asset.id)
    try {
      const payload = await downloadLibraryAsset({
        token,
        assetId: asset.id,
      })
      const objectUrl = window.URL.createObjectURL(payload.blob)
      const anchor = document.createElement('a')
      anchor.href = objectUrl
      anchor.download = payload.fileName || asset.filename
      document.body.appendChild(anchor)
      anchor.click()
      anchor.remove()
      window.URL.revokeObjectURL(objectUrl)
      setStatus(`Downloaded ${payload.fileName || asset.filename}.`)
    } catch (downloadError) {
      setError(downloadError instanceof Error ? downloadError.message : 'Could not download file.')
    } finally {
      setBusyAssetId((current) => (current === asset.id ? null : current))
    }
  }, [])

  const onToggleAssetLock = useCallback(
    async (asset: LibraryAssetRecord) => {
      const token = getAuthSessionToken()
      if (!token) {
        setError('Sign in to manage permissions.')
        return
      }
      if (!asset.can_edit_metadata) {
        setError('Only the file owner can manage lock state.')
        return
      }

      setError('')
      setStatus('')
      setBusyAssetId(asset.id)
      try {
        const updated = await updateLibraryAssetMetadata({
          token,
          assetId: asset.id,
          lockedForTeamMembers: !isAssetLockedForTeamMembers(asset),
        })
        updateAssetInState(updated)
        setStatus(updated.locked_for_team_members ? 'Locked for team members.' : 'Unlocked for team members.')
      } catch (updateError) {
        setError(updateError instanceof Error ? updateError.message : 'Could not update file lock state.')
      } finally {
        setBusyAssetId((current) => (current === asset.id ? null : current))
      }
    },
    [updateAssetInState],
  )

  const onToggleAssetArchive = useCallback(
    async (asset: LibraryAssetRecord) => {
      const token = getAuthSessionToken()
      if (!token) {
        setError('Sign in to manage your library view.')
        return
      }

      setError('')
      setStatus('')
      setBusyAssetId(asset.id)
      try {
        const updated = await updateLibraryAssetMetadata({
          token,
          assetId: asset.id,
          archivedForCurrentUser: !isAssetArchivedForCurrentUser(asset),
        })
        updateAssetInState(updated)
        setStatus(updated.archived_for_current_user ? 'Archived for you.' : 'Returned to active files.')
        onRefresh()
      } catch (updateError) {
        setError(updateError instanceof Error ? updateError.message : 'Could not update archive state.')
      } finally {
        setBusyAssetId((current) => (current === asset.id ? null : current))
      }
    },
    [onRefresh, updateAssetInState],
  )

  const onSearchCollaborators = useCallback(
    async (asset: LibraryAssetRecord) => {
      const token = getAuthSessionToken()
      if (!token) {
        setError('Sign in to search collaborators.')
        return
      }

      const queryValue = normalizeName(collaboratorQueryByAssetId[asset.id] || '')
      if (queryValue.length < 2) {
        setLookupErrorByAssetId((current) => ({
          ...current,
          [asset.id]: 'Type at least 2 characters to search.',
        }))
        return
      }

      setLookupBusyAssetId(asset.id)
      setLookupErrorByAssetId((current) => ({ ...current, [asset.id]: '' }))
      setStatus('')
      setError('')
      try {
        const payload = await listCollaborators(token, {
          query: queryValue,
          page: 1,
          pageSize: 25,
        })
        const existingManageableMembers = libraryAssetManageableAccessMembers(asset)
        const existingAccessUserIds = new Set(
          existingManageableMembers
            .map((member) => normalizeUserId(member.user_id))
            .filter(Boolean),
        )
        const existingAccessNames = new Set(
          existingManageableMembers.map((member) => normalizeName(member.name).toLowerCase()),
        )
        const ownerName = normalizeName(asset.owner_name || '').toLowerCase()
        const ownerUserId = normalizeUserId(asset.owner_user_id)
        const seenKeys = new Set<string>()
        const filtered = (payload.items || []).filter((candidate) => {
          const candidateName = normalizeName(candidate.full_name)
          if (!candidateName) {
            return false
          }
          const candidateUserId = resolveCollaboratorUserId(candidate)
          const nameKey = candidateName.toLowerCase()
          const seenKey = candidateUserId || nameKey
          if (seenKeys.has(seenKey)) {
            return false
          }
          seenKeys.add(seenKey)
          if ((candidateUserId && ownerUserId && candidateUserId === ownerUserId) || (!candidateUserId && nameKey === ownerName)) {
            return false
          }
          if ((candidateUserId && existingAccessUserIds.has(candidateUserId)) || (!candidateUserId && existingAccessNames.has(nameKey))) {
            return false
          }
          return true
        })
        setCollaboratorLookupByAssetId((current) => ({
          ...current,
          [asset.id]: filtered,
        }))
        if (filtered.length === 0) {
          setLookupErrorByAssetId((current) => ({
            ...current,
            [asset.id]: 'No eligible collaborators found.',
          }))
        }
      } catch (lookupError) {
        setCollaboratorLookupByAssetId((current) => ({ ...current, [asset.id]: [] }))
        setLookupErrorByAssetId((current) => ({
          ...current,
          [asset.id]: lookupError instanceof Error ? lookupError.message : 'Directory lookup failed.',
        }))
      } finally {
        setLookupBusyAssetId((current) => (current === asset.id ? null : current))
      }
    },
    [collaboratorQueryByAssetId],
  )

  const buildAccessCollaboratorsPayload = useCallback(
    (
      members: Array<{ user_id: string; name: string; role: LibraryAssetAccessRole }>,
    ) =>
      members.map((member) => ({
        user_id: member.user_id,
        name: normalizeName(member.name) || null,
        role: member.role,
      })),
    [],
  )

  const onAddAccess = useCallback(
    async (asset: LibraryAssetRecord) => {
      const token = getAuthSessionToken()
      if (!token) {
        setError('Sign in to manage permissions.')
        return
      }
      if (!asset.can_manage_access) {
        setError('Only the file owner can manage access.')
        return
      }

      const selected = selectedCandidateByAssetIdValue(selectedCollaboratorByAssetId, asset.id)
      if (!selected) {
        setError('Select a collaborator from directory results first.')
        return
      }

      const selectedName = normalizeName(selected.full_name)
      const selectedUserId = resolveCollaboratorUserId(selected)
      if (!selectedName) {
        setError('Selected collaborator is missing a name.')
        return
      }
      if (!selectedUserId) {
        setError('Selected collaborator is missing a valid account identity.')
        return
      }

      const existingAccessUserIds = new Set(
        libraryAssetManageableAccessMembers(asset)
          .map((member) => normalizeUserId(member.user_id))
          .filter(Boolean),
      )
      const existingAccessNames = new Set(
        libraryAssetManageableAccessMembers(asset).map((member) => normalizeName(member.name).toLowerCase()),
      )
      if (existingAccessUserIds.has(selectedUserId) || existingAccessNames.has(selectedName.toLowerCase())) {
        setError(`${selectedName} already has access or a pending invite.`)
        return
      }
      const nextMembers = [
        ...libraryAssetManageableAccessMembers(asset),
        {
          user_id: selectedUserId,
          name: selectedName,
          role: accessComposerRole,
          state: 'pending' as const,
        },
      ]

      setError('')
      setStatus('')
      setBusyAssetId(asset.id)
      try {
        const updated = await updateLibraryAssetAccess({
          token,
          assetId: asset.id,
          collaborators: buildAccessCollaboratorsPayload(nextMembers),
        })
        updateAssetInState(updated)
        resetAccessComposerForAsset(asset.id)
        setStatus(`${humanizeLibraryAssetAccessRole(accessComposerRole)} invitation sent to ${selectedName}.`)
      } catch (updateError) {
        setError(updateError instanceof Error ? updateError.message : 'Could not update permissions.')
      } finally {
        setBusyAssetId((current) => (current === asset.id ? null : current))
      }
    },
    [accessComposerRole, buildAccessCollaboratorsPayload, resetAccessComposerForAsset, selectedCollaboratorByAssetId, updateAssetInState],
  )

  const onStartEditAccessRole = useCallback((member: { user_id: string; role: LibraryAssetAccessRole }) => {
    const cleanUserId = String(member.user_id || '').trim()
    if (!cleanUserId) {
      return
    }
    setAccessComposerOpen(false)
    setAccessRemovalConfirmUserId(null)
    setAccessEditingUserId(cleanUserId)
    setAccessEditingRole(member.role)
    setError('')
    setStatus('')
  }, [])

  const onStartRemoveAccess = useCallback((collaboratorUserId: string) => {
    const cleanCollaboratorUserId = String(collaboratorUserId || '').trim()
    if (!cleanCollaboratorUserId) {
      return
    }
    setAccessComposerOpen(false)
    setAccessEditingUserId(null)
    setAccessEditingRole('viewer')
    setAccessRemovalConfirmUserId(cleanCollaboratorUserId)
    setError('')
    setStatus('')
  }, [])

  const onCancelAccessRoleEdit = useCallback(() => {
    setAccessEditingUserId(null)
    setAccessEditingRole('viewer')
  }, [])

  const onSaveAccessRole = useCallback(
    async (asset: LibraryAssetRecord, collaboratorUserId: string) => {
      const token = getAuthSessionToken()
      if (!token) {
        setError('Sign in to manage permissions.')
        return
      }
      if (!asset.can_manage_access) {
        setError('Only the file owner can manage access.')
        return
      }
      const cleanCollaboratorUserId = String(collaboratorUserId || '').trim()
      if (!cleanCollaboratorUserId) {
        setError('This collaborator cannot be edited from here.')
        return
      }

      const currentMembers = libraryAssetManageableAccessMembers(asset)
      const currentMember = currentMembers.find((member) => member.user_id === cleanCollaboratorUserId)
      if (!currentMember) {
        setError('This user no longer has direct access or a pending invite.')
        return
      }
      if (currentMember.role === accessEditingRole) {
        onCancelAccessRoleEdit()
        return
      }

      const nextMembers = currentMembers.map((member) =>
        member.user_id === cleanCollaboratorUserId ? { ...member, role: accessEditingRole } : member,
      )

      setError('')
      setStatus('')
      setBusyAssetId(asset.id)
      try {
        const updated = await updateLibraryAssetAccess({
          token,
          assetId: asset.id,
          collaborators: buildAccessCollaboratorsPayload(nextMembers),
        })
        updateAssetInState(updated)
        setAccessEditingUserId(null)
        setAccessEditingRole('viewer')
        setStatus(
          currentMember.state === 'pending'
            ? `${currentMember.name}'s pending invite is now ${humanizeLibraryAssetAccessRole(accessEditingRole)}.`
            : `${currentMember.name} is now ${humanizeLibraryAssetAccessRole(accessEditingRole)}.`,
        )
      } catch (updateError) {
        setError(updateError instanceof Error ? updateError.message : 'Could not update permissions.')
      } finally {
        setBusyAssetId((current) => (current === asset.id ? null : current))
      }
    },
    [accessEditingRole, buildAccessCollaboratorsPayload, onCancelAccessRoleEdit, updateAssetInState],
  )

  const onRemoveAccess = useCallback(
    async (asset: LibraryAssetRecord, collaboratorUserId: string) => {
      const token = getAuthSessionToken()
      if (!token) {
        setError('Sign in to manage permissions.')
        return
      }
      if (!asset.can_manage_access) {
        setError('Only the file owner can manage access.')
        return
      }
      const cleanCollaboratorUserId = String(collaboratorUserId || '').trim()
      if (!cleanCollaboratorUserId) {
        setError('This collaborator cannot be removed from here.')
        return
      }

      setError('')
      setStatus('')
      setBusyAssetId(asset.id)
      try {
        const currentMembers = libraryAssetManageableAccessMembers(asset)
        const removedMember = currentMembers.find(
          (member) => String(member.user_id || '').trim() === cleanCollaboratorUserId,
        )
        const nextMembers = currentMembers.filter(
          (member) => String(member.user_id || '').trim() !== cleanCollaboratorUserId,
        )
        const updated = await updateLibraryAssetAccess({
          token,
          assetId: asset.id,
          collaborators: buildAccessCollaboratorsPayload(nextMembers),
        })
        updateAssetInState(updated)
        setAccessRemovalConfirmUserId(null)
        setAccessEditingUserId(null)
        setAccessEditingRole('viewer')
        setStatus(
          removedMember?.state === 'pending'
            ? 'Pending invitation cancelled.'
            : 'Access updated.',
        )
      } catch (updateError) {
        setError(updateError instanceof Error ? updateError.message : 'Could not update permissions.')
      } finally {
        setBusyAssetId((current) => (current === asset.id ? null : current))
      }
    },
    [buildAccessCollaboratorsPayload, updateAssetInState],
  )

  const onRemoveWorkspacePlacement = useCallback(
    async (asset: LibraryAssetRecord, workspaceId: string, workspaceName: string) => {
      const token = getAuthSessionToken()
      if (!token) {
        setError('Sign in to manage workspaces.')
        return
      }
      if (!asset.can_edit_metadata) {
        setError('Only the file owner can change workspaces.')
        return
      }

      const cleanWorkspaceId = normalizeUserId(workspaceId)
      if (!cleanWorkspaceId) {
        setError('This workspace could not be removed.')
        return
      }

      const currentWorkspaceIds = normalizeWorkspaceIds(
        libraryAssetWorkspacePlacements(asset).map((placement) => placement.workspace_id),
      )
      const nextWorkspaceIds = currentWorkspaceIds.filter((value) => value !== cleanWorkspaceId)
      if (nextWorkspaceIds.length === currentWorkspaceIds.length) {
        setStatus(`${workspaceName} is already removed.`)
        return
      }

      setError('')
      setStatus('')
      setBusyAssetId(asset.id)
      try {
        const updated = await updateLibraryAssetMetadata({
          token,
          assetId: asset.id,
          workspaceIds: nextWorkspaceIds,
        })
        updateAssetInState(updated)
        setStatus(
          libraryAssetWorkspacePlacements(updated).length > 0
            ? `Removed from ${workspaceName}.`
            : 'Removed from all workspaces.',
        )
        onRefresh()
      } catch (updateError) {
        setError(updateError instanceof Error ? updateError.message : 'Could not update workspaces.')
      } finally {
        setBusyAssetId((current) => (current === asset.id ? null : current))
      }
    },
    [onRefresh, updateAssetInState],
  )

  const selectedAsset = useMemo(
    () => assets.find((asset) => asset.id === selectedAssetId) || null,
    [assets, selectedAssetId],
  )
  const onOpenAssetDrilldown = useCallback((assetId: string, nextTab: DataLibraryDrilldownTab = 'overview') => {
    setSelectedAssetId(assetId)
    setDrilldownTab(nextTab)
  }, [])

  const onAssetRowClick = useCallback((assetId: string) => {
    if (suppressAssetRowClickRef.current === assetId) {
      suppressAssetRowClickRef.current = null
      return
    }
    onOpenAssetDrilldown(assetId)
  }, [onOpenAssetDrilldown])

  const onCloseAssetDrilldown = useCallback(() => {
    setSelectedAssetId(null)
    setMenuState(null)
    setWorkspaceAccessMenuState(null)
    setRenamingAssetId(null)
    setRenameDraft('')
    setAccessComposerOpen(false)
    setAccessComposerRole('viewer')
    setAccessEditingUserId(null)
    setAccessEditingRole('viewer')
    setAccessRemovalConfirmUserId(null)
  }, [])

  const selectedAssetAccessMembers = useMemo(
    () => (selectedAsset ? libraryAssetAccessMembers(selectedAsset) : []),
    [selectedAsset],
  )
  const selectedAssetPendingAccessMembers = useMemo(
    () => (selectedAsset ? libraryAssetPendingAccessMembers(selectedAsset) : []),
    [selectedAsset],
  )
  const selectedAssetManageableAccessMembers = useMemo(
    () => (selectedAsset ? libraryAssetManageableAccessMembers(selectedAsset) : []),
    [selectedAsset],
  )
  const selectedAssetOwnerName = selectedAsset
    ? normalizeName(selectedAsset.owner_name || '') || 'Unknown'
    : 'Unknown'
  const selectedAssetWorkspacePlacements = useMemo(
    () => (selectedAsset ? libraryAssetWorkspacePlacements(selectedAsset) : []),
    [selectedAsset],
  )
  const selectedAssetWorkspaceAccessRows = useMemo(
    () =>
      selectedAssetWorkspacePlacements.map((placement) => {
        const workspaceRecord = workspaceRecordsById.get(placement.workspace_id) || null
        const members = workspaceAccessMembers(workspaceRecord)
        return {
          workspaceId: placement.workspace_id,
          workspaceName:
            normalizeName(workspaceRecord?.name || '') || placement.workspace_name || placement.workspace_id,
          canOpen: Boolean(workspaceRecord),
          members,
        }
      }),
    [selectedAssetWorkspacePlacements, workspaceRecordsById],
  )
  const workspaceAccessMenuRow = useMemo(
    () => (
      workspaceAccessMenuState
        ? selectedAssetWorkspaceAccessRows.find((row) => row.workspaceId === workspaceAccessMenuState.workspaceId) || null
        : null
    ),
    [selectedAssetWorkspaceAccessRows, workspaceAccessMenuState],
  )
  const selectedAssetPermissionsBadge = selectedAsset
    ? libraryAssetPermissionsBadge(selectedAsset)
    : { label: 'Permissions unavailable', description: 'Access path unavailable.', variant: 'outline' as const }
  const selectedAssetAccessVia = selectedAsset
    ? libraryAssetAccessViaDetail(selectedAsset)
    : { label: 'Unknown', description: 'Access source unavailable.', variant: 'outline' as const, icon: HelpCircle }
  const selectedAssetSearchQuery = selectedAsset ? collaboratorQueryByAssetId[selectedAsset.id] || '' : ''
  const selectedAssetMatches = selectedAsset ? collaboratorLookupByAssetId[selectedAsset.id] || [] : []
  const selectedAssetLookupError = selectedAsset ? lookupErrorByAssetId[selectedAsset.id] || '' : ''
  const selectedAssetLookupBusy = selectedAsset ? lookupBusyAssetId === selectedAsset.id : false
  const selectedAssetCandidate = selectedAsset
    ? selectedCandidateByAssetIdValue(selectedCollaboratorByAssetId, selectedAsset.id)
    : null
  const selectedAssetBusy = selectedAsset ? busyAssetId === selectedAsset.id : false
  const canManageSelectedAssetAccess = Boolean(selectedAsset?.can_manage_access)
  const canDownloadSelectedAsset = Boolean(selectedAsset?.can_download)
  const selectedAssetLocked = Boolean(selectedAsset && isAssetLockedForTeamMembers(selectedAsset))
  const selectedAssetLockMessage = selectedAsset ? assetReadOnlyMessage(selectedAsset) : null
  const selectedAssetReadOnlyBannerClassName = cn(houseSurfaces.banner, houseSurfaces.bannerInfo)
  const accessInlineStateActive = accessComposerOpen || Boolean(accessEditingUserId) || Boolean(accessRemovalConfirmUserId)
  const menuAsset = menuState ? assets.find((asset) => asset.id === menuState.assetId) || null : null
  const selectedAssetAuditEntries = useMemo(
    () => (Array.isArray(selectedAsset?.audit_log_entries) ? selectedAsset.audit_log_entries : []),
    [selectedAsset],
  )
  const showPersonalAssetLogs = Boolean(selectedAsset && !selectedAsset.can_manage_access)
  const accessActivityEntries = useMemo(
    () =>
      selectedAssetAuditEntries
        .filter((entry) => entry.category === 'access')
        .filter((entry) => matchesLibraryAccessActivityFilter(entry, accessActivityFilter)),
    [accessActivityFilter, selectedAssetAuditEntries],
  )
  const assetActivityEntries = useMemo(
    () => selectedAssetAuditEntries.filter((entry) => entry.category === 'asset'),
    [selectedAssetAuditEntries],
  )
  const accessActivityGroups = useMemo(() => {
    if (showPersonalAssetLogs) {
      return [
        {
          key: 'you',
          title: 'You',
          entries: accessActivityEntries,
        },
      ]
    }

    const groupMap = new Map<string, { key: string; title: string; entries: LibraryAssetAuditEntry[] }>()
    selectedAssetManageableAccessMembers.forEach((member) => {
      const title = normalizeName(member.name) || 'Unknown user'
      const key = title.toLowerCase()
      groupMap.set(key, { key, title, entries: [] })
    })
    accessActivityEntries.forEach((entry) => {
      const title = normalizeName(entry.subject_name || entry.subject_user_id || '') || 'Unknown user'
      const key = title.toLowerCase()
      const existing = groupMap.get(key)
      if (existing) {
        existing.entries.push(entry)
        return
      }
      groupMap.set(key, { key, title, entries: [entry] })
    })
    return Array.from(groupMap.values()).sort((left, right) => left.title.localeCompare(right.title))
  }, [accessActivityEntries, selectedAssetManageableAccessMembers, showPersonalAssetLogs])
  const assetActivityGroups = useMemo(
    () => [
      {
        key: 'uploads',
        title: 'File uploads',
        entries: assetActivityEntries.filter((entry) => entry.event_type === 'asset_uploaded'),
      },
      {
        key: 'name-changes',
        title: 'Name changes',
        entries: assetActivityEntries.filter((entry) => entry.event_type === 'asset_renamed'),
      },
      {
        key: 'downloads',
        title: 'Downloads',
        entries: assetActivityEntries.filter((entry) => entry.event_type === 'asset_downloaded'),
      },
      {
        key: 'other',
        title: 'Other asset activity',
        entries: assetActivityEntries.filter((entry) => (
          entry.event_type !== 'asset_uploaded'
          && entry.event_type !== 'asset_renamed'
          && entry.event_type !== 'asset_downloaded'
        )),
      },
    ].filter((group) => group.entries.length > 0),
    [assetActivityEntries],
  )

  const onToggleAccessActivitySection = useCallback(() => {
    if (accessActivityCollapsed) {
      setAccessActivityCollapsed(false)
      setAssetActivityCollapsed(true)
      return
    }
    setAccessActivityCollapsed(true)
  }, [accessActivityCollapsed])

  useEffect(() => {
    if (!selectedAsset) {
      return
    }
    if (!canViewDataLibraryDrilldownTab(selectedAsset, drilldownTab)) {
      setDrilldownTab('overview')
    }
  }, [drilldownTab, selectedAsset])

  const onToggleAssetActivitySection = useCallback(() => {
    if (assetActivityCollapsed) {
      setAssetActivityCollapsed(false)
      setAccessActivityCollapsed(true)
      return
    }
    setAssetActivityCollapsed(true)
  }, [assetActivityCollapsed])

  const onSort = useCallback((nextSortBy: LibraryAssetSortBy) => {
    const nextDirection = nextSortDirection(sortBy, sortDirection, nextSortBy)
    setSortBy(nextSortBy)
    setSortDirection(nextDirection)
    setPage(1)
  }, [sortBy, sortDirection])

  const openAssetMenuAtPosition = useCallback((assetId: string, x: number, y: number) => {
    const menuWidth = 212
    const menuHeight = 196
    setMenuState({
      assetId,
      x: Math.max(8, Math.min(x, window.innerWidth - menuWidth - 8)),
      y: Math.max(8, Math.min(y, window.innerHeight - menuHeight - 8)),
    })
  }, [])

  const onOpenAssetContextMenu = useCallback((assetId: string, event: ReactMouseEvent<HTMLElement>) => {
    event.preventDefault()
    event.stopPropagation()
    suppressAssetRowClickRef.current = assetId
    openAssetMenuAtPosition(assetId, event.clientX, event.clientY)
  }, [openAssetMenuAtPosition])

  const onStartRenameAssetFromMenu = useCallback((asset: LibraryAssetRecord) => {
    setMenuState(null)
    onOpenAssetDrilldown(asset.id, 'actions')
    onStartRenameAsset(asset)
  }, [onOpenAssetDrilldown, onStartRenameAsset])

  const onDownloadAssetFromMenu = useCallback((asset: LibraryAssetRecord) => {
    setMenuState(null)
    void onDownloadAsset(asset)
  }, [onDownloadAsset])

  const openWorkspaceAccessMenuAtPosition = useCallback((workspaceId: string, x: number, y: number) => {
    const menuWidth = 240
    const menuHeight = 132
    setWorkspaceAccessMenuState({
      workspaceId,
      x: Math.max(8, Math.min(x, window.innerWidth - menuWidth - 8)),
      y: Math.max(8, Math.min(y, window.innerHeight - menuHeight - 8)),
    })
  }, [])

  const onToggleWorkspaceAccessMenu = useCallback((workspaceId: string, event: ReactMouseEvent<HTMLButtonElement>) => {
    event.preventDefault()
    event.stopPropagation()
    const cleanWorkspaceId = normalizeUserId(workspaceId)
    if (!cleanWorkspaceId) {
      return
    }
    if (workspaceAccessMenuState?.workspaceId === cleanWorkspaceId) {
      setWorkspaceAccessMenuState(null)
      return
    }
    const rect = event.currentTarget.getBoundingClientRect()
    const menuHeight = 132
    const gap = 6
    const x = rect.left
    const openUp = window.innerHeight - rect.bottom < menuHeight + gap
    const y = openUp ? rect.top - menuHeight - gap : rect.bottom + gap
    openWorkspaceAccessMenuAtPosition(cleanWorkspaceId, x, y)
  }, [openWorkspaceAccessMenuAtPosition, workspaceAccessMenuState?.workspaceId])

  const onToggleWorkspaceAccessExpanded = useCallback((workspaceId: string) => {
    const cleanWorkspaceId = normalizeUserId(workspaceId)
    if (!cleanWorkspaceId) {
      return
    }
    setWorkspaceAccessExpandedById((current) => ({
      ...current,
      [cleanWorkspaceId]: !current[cleanWorkspaceId],
    }))
  }, [])

  const onGoToWorkspace = useCallback((targetWorkspaceId: string, initialTab: 'overview' | 'actions' = 'overview') => {
    const cleanWorkspaceId = normalizeUserId(targetWorkspaceId)
    if (!cleanWorkspaceId) {
      return
    }
    setActiveWorkspaceId(cleanWorkspaceId)
    if (onOpenWorkspaceDrilldown) {
      onOpenWorkspaceDrilldown(cleanWorkspaceId, initialTab)
      return
    }
    const nextParams = new URLSearchParams()
    nextParams.set('view', 'workspaces')
    nextParams.set('workspace', cleanWorkspaceId)
    nextParams.set('workspaceTab', initialTab)
    navigate(`/workspaces?${nextParams.toString()}`)
  }, [navigate, onOpenWorkspaceDrilldown, setActiveWorkspaceId])

  const shouldKeepAssetDrilldownOpen = useCallback((target: EventTarget | null) => {
    return target instanceof Element
      && Boolean(target.closest('[data-ui="data-library-workspace-access-menu-overlay"]'))
  }, [])

  const overviewContent = selectedAsset ? (
    <>
      <div className={cn(houseSurfaces.sectionPanel, 'house-drilldown-panel-no-pad')}>
        <div className="house-drilldown-heading-block">
          <p className="house-drilldown-heading-block-title">Asset overview</p>
        </div>
        <div
          className="house-drilldown-content-block house-drilldown-summary-stats-grid"
          style={{ gridTemplateColumns: 'repeat(2, minmax(0, 1fr))' }}
        >
          <div className="rounded-md border border-border/60 bg-background/80 p-3">
            <p className={HOUSE_FIELD_HELPER_CLASS}>Owner</p>
            <p className={cn(houseTypography.text, 'mt-1 font-medium')}>{selectedAssetOwnerName}</p>
          </div>
          <div className="rounded-md border border-border/60 bg-background/80 p-3">
            <p className={HOUSE_FIELD_HELPER_CLASS}>File type</p>
            <p className={cn(houseTypography.text, 'mt-1 font-medium')}>{selectedAsset.kind.toUpperCase()}</p>
          </div>
          <div className="rounded-md border border-border/60 bg-background/80 p-3">
            <p className={HOUSE_FIELD_HELPER_CLASS}>Uploaded</p>
            <p className={cn(houseTypography.text, 'mt-1 font-medium')}>{formatTimestamp(selectedAsset.uploaded_at)}</p>
          </div>
          <div className="rounded-md border border-border/60 bg-background/80 p-3">
            <p className={HOUSE_FIELD_HELPER_CLASS}>Size</p>
            <p className={cn(houseTypography.text, 'mt-1 font-medium')}>{formatBytes(selectedAsset.byte_size)}</p>
          </div>
          <div className="rounded-md border border-border/60 bg-background/80 p-3">
            <p className={HOUSE_FIELD_HELPER_CLASS}>Direct shares</p>
            <p className={cn(houseTypography.text, 'mt-1 font-medium')}>
              {selectedAssetAccessMembers.length === 0 ? 'None' : `${selectedAssetAccessMembers.length} person${selectedAssetAccessMembers.length === 1 ? '' : 's'}`}
            </p>
            {selectedAssetPendingAccessMembers.length > 0 ? (
              <p className="mt-1 text-xs text-muted-foreground">
                {selectedAssetPendingAccessMembers.length} pending invite{selectedAssetPendingAccessMembers.length === 1 ? '' : 's'}
              </p>
            ) : null}
          </div>
          <div className="rounded-md border border-border/60 bg-background/80 p-3">
            <p className={HOUSE_FIELD_HELPER_CLASS}>Permissions</p>
            <Badge
              size="sm"
              variant={selectedAssetPermissionsBadge.variant}
              className={cn('mt-1 max-w-full justify-start whitespace-normal text-left leading-snug', selectedAssetPermissionsBadge.className)}
            >
              {selectedAssetPermissionsBadge.label}
            </Badge>
            <p className="mt-1 text-xs text-muted-foreground">{selectedAssetPermissionsBadge.description}</p>
          </div>
          <div className="rounded-md border border-border/60 bg-background/80 p-3">
            <p className={HOUSE_FIELD_HELPER_CLASS}>Access via</p>
            <Badge
              size="sm"
              variant={selectedAssetAccessVia.variant}
              className={cn('mt-1 max-w-full justify-start gap-1.5 whitespace-normal text-left leading-snug', selectedAssetAccessVia.className)}
            >
              <selectedAssetAccessVia.icon className="h-3.5 w-3.5 shrink-0" />
              <span>{selectedAssetAccessVia.label}</span>
            </Badge>
            <p className="mt-1 text-xs text-muted-foreground">{selectedAssetAccessVia.description}</p>
          </div>
          <div className="rounded-md border border-border/60 bg-background/80 p-3">
            <p className={HOUSE_FIELD_HELPER_CLASS}>Lock</p>
            <p className={cn(houseTypography.text, 'mt-1 font-medium')}>{assetLockStateLabel(selectedAsset)}</p>
          </div>
          <div className="rounded-md border border-border/60 bg-background/80 p-3">
            <p className={HOUSE_FIELD_HELPER_CLASS}>Archived</p>
            <p className={cn(houseTypography.text, 'mt-1 font-medium')}>{assetArchiveStateLabel(selectedAsset)}</p>
          </div>
          <div className="rounded-md border border-border/60 bg-background/80 p-3">
            <p className={HOUSE_FIELD_HELPER_CLASS}>Workspaces</p>
            <p className={cn(houseTypography.text, 'mt-1 font-medium')}>
              {selectedAssetWorkspacePlacements.length > 0 ? libraryAssetWorkspaceSummary(selectedAsset) : 'None'}
            </p>
          </div>
          <div className="rounded-md border border-border/60 bg-background/80 p-3">
            <p className={HOUSE_FIELD_HELPER_CLASS}>Availability</p>
            <p className={cn(houseTypography.text, 'mt-1 font-medium')}>
              {isAssetAvailable(selectedAsset) ? 'Available' : 'Storage missing'}
            </p>
          </div>
        </div>
      </div>
    </>
  ) : null

  const accessContent = selectedAsset ? (
    <>
      <div className={cn(houseSurfaces.sectionPanel, 'house-drilldown-panel-no-pad')}>
        <div className="house-drilldown-heading-block">
          <p className="house-drilldown-heading-block-title">File access</p>
        </div>
        {!canManageSelectedAssetAccess ? (
          <div className="house-drilldown-content-block">
            <p className={HOUSE_FIELD_HELPER_CLASS}>Only the file owner can edit file access.</p>
          </div>
        ) : (
          <div className="house-drilldown-content-block space-y-2">
          <div className="w-full house-table-context-profile">
            <Table
              className="w-full table-fixed house-table-resizable"
              data-house-no-column-resize="true"
              data-house-no-column-controls="true"
            >
              <colgroup>
                <col style={{ width: '54%' }} />
                <col style={{ width: '18%' }} />
                <col style={{ width: '28%' }} />
              </colgroup>
              <TableHeader className="house-table-head text-left">
                <TableRow style={{ backgroundColor: 'transparent' }}>
                  <TableHead className={`${HOUSE_TABLE_HEAD_TEXT_CLASS} text-left`}>User</TableHead>
                  <TableHead className={`${HOUSE_TABLE_HEAD_TEXT_CLASS} text-left`}>Role</TableHead>
                  <TableHead className={`${HOUSE_TABLE_HEAD_TEXT_CLASS} text-center`}>Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                <TableRow className="h-14">
                  <TableCell className={cn('h-14 px-3 py-0 align-middle font-medium', HOUSE_TABLE_CELL_TEXT_CLASS)}>
                    <div className="flex h-14 items-center">
                      <Badge variant="positive">{selectedAssetOwnerName} (Owner)</Badge>
                    </div>
                  </TableCell>
                  <TableCell className={cn('h-14 px-3 py-0 align-middle text-muted-foreground', HOUSE_TABLE_CELL_TEXT_CLASS)}>
                    <div className="flex h-14 items-center">Owner</div>
                  </TableCell>
                  <TableCell className={cn('h-14 px-3 py-0 align-middle', HOUSE_TABLE_CELL_TEXT_CLASS)}>
                    <div className="flex h-14 items-center justify-end" />
                  </TableCell>
                </TableRow>
                {selectedAssetManageableAccessMembers.map((member) => {
                  const cleanUserId = String(member.user_id || '').trim()
                  const isPendingInvite = member.state === 'pending'
                  const isEditingRole = accessEditingUserId === cleanUserId && Boolean(cleanUserId)
                  const isRemovalAwaitingConfirm = accessRemovalConfirmUserId === cleanUserId && Boolean(cleanUserId)
                  const hasOpenMemberEditState = accessInlineStateActive
                  const hideMemberActions = accessInlineStateActive && !isEditingRole && !isRemovalAwaitingConfirm
                  const roleChanged = accessEditingRole !== member.role
                  return (
                    <TableRow
                      key={`${selectedAsset.id}-${member.user_id || member.name}`}
                      className={cn(
                        'group h-14',
                        cleanUserId && !hasOpenMemberEditState && 'hover:bg-[hsl(var(--tone-accent-50))]',
                      )}
                    >
                      <TableCell className={cn('h-14 px-3 py-0 align-middle font-medium', HOUSE_TABLE_CELL_TEXT_CLASS)}>
                        <div className="flex h-14 items-center">
                          <Badge
                            variant={isPendingInvite ? 'yellow' : 'positive'}
                            className={cn(
                              cleanUserId &&
                                !hasOpenMemberEditState &&
                                'transition-[transform,box-shadow] duration-[var(--motion-duration-ui)] ease-out group-hover:-translate-y-px group-hover:shadow-[0_2px_8px_hsl(var(--foreground)/0.08)]',
                            )}
                          >
                            {isPendingInvite ? `${member.name} (pending)` : member.name}
                          </Badge>
                        </div>
                      </TableCell>
                      <TableCell className={cn('h-14 px-3 py-0 align-middle text-muted-foreground', HOUSE_TABLE_CELL_TEXT_CLASS)}>
                        <div className="flex h-14 items-center">
                          {isEditingRole ? (
                            <SelectPrimitive
                              value={accessEditingRole}
                              onValueChange={(value) => setAccessEditingRole(value === 'editor' ? 'editor' : 'viewer')}
                              disabled={selectedAssetBusy}
                            >
                              <SelectTrigger className="h-9 w-[10rem] text-sm">
                                <SelectValue aria-label={humanizeLibraryAssetAccessRole(accessEditingRole)}>
                                  {humanizeLibraryAssetAccessRole(accessEditingRole)}
                                </SelectValue>
                              </SelectTrigger>
                              <SelectContent>
                                {DATA_LIBRARY_ACCESS_ROLE_OPTIONS.map((option) => (
                                  <SelectItem key={option.value} value={option.value}>
                                    {option.label}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </SelectPrimitive>
                          ) : (
                            <span className={HOUSE_FIELD_HELPER_CLASS}>{humanizeLibraryAssetAccessRole(member.role)}</span>
                          )}
                        </div>
                      </TableCell>
                      <TableCell className={cn('h-14 px-3 py-0 align-middle', HOUSE_TABLE_CELL_TEXT_CLASS)}>
                        <div className="flex h-14 items-center justify-end">
                          {hideMemberActions || !cleanUserId ? null : isRemovalAwaitingConfirm ? (
                            <div className="flex items-center justify-end gap-1.5">
                              <Button
                                type="button"
                                variant="cta"
                                className="h-8 px-3"
                                onClick={() => void onRemoveAccess(selectedAsset, cleanUserId)}
                                disabled={selectedAssetBusy}
                              >
                                Confirm
                              </Button>
                              <button
                                type="button"
                                className={cn(HOUSE_COLLABORATOR_ACTION_ICON_CLASS, HOUSE_COLLABORATOR_ACTION_ICON_DISCARD_CLASS)}
                                onClick={() => setAccessRemovalConfirmUserId(null)}
                                disabled={selectedAssetBusy}
                                aria-label={isPendingInvite ? `Cancel pending invite cancellation for ${member.name}` : `Cancel remove access for ${member.name}`}
                                title={isPendingInvite ? 'Cancel pending invite cancellation' : 'Cancel remove access'}
                              >
                                <X className="h-4 w-4" />
                              </button>
                            </div>
                          ) : isEditingRole ? (
                            <div className="flex items-center justify-end gap-1.5">
                              {roleChanged ? (
                                <button
                                type="button"
                                className={cn(HOUSE_COLLABORATOR_ACTION_ICON_CLASS, HOUSE_COLLABORATOR_ACTION_ICON_CONFIRM_CLASS)}
                                onClick={() => void onSaveAccessRole(selectedAsset, cleanUserId)}
                                disabled={selectedAssetBusy}
                                aria-label={isPendingInvite ? `Save pending invite role for ${member.name}` : `Save access role for ${member.name}`}
                                title={isPendingInvite ? 'Apply pending invite role change' : 'Apply role change'}
                              >
                                <Save className="h-4 w-4" />
                              </button>
                            ) : (
                              <span className={cn(HOUSE_COLLABORATOR_ACTION_ICON_CLASS, 'opacity-0')} aria-hidden="true" />
                              )}
                              <button
                                type="button"
                                className={cn(HOUSE_COLLABORATOR_ACTION_ICON_CLASS, HOUSE_COLLABORATOR_ACTION_ICON_DISCARD_CLASS)}
                                onClick={onCancelAccessRoleEdit}
                                disabled={selectedAssetBusy}
                                aria-label={isPendingInvite ? `Cancel pending invite role edit for ${member.name}` : `Cancel access role edit for ${member.name}`}
                                title={isPendingInvite ? 'Cancel pending invite role change' : 'Cancel role change'}
                              >
                                <X className="h-4 w-4" />
                              </button>
                            </div>
                          ) : (
                            <div className="flex items-center justify-end gap-1.5">
                              <button
                                type="button"
                                className={cn(HOUSE_COLLABORATOR_ACTION_ICON_CLASS, HOUSE_COLLABORATOR_ACTION_ICON_EDIT_CLASS)}
                                onClick={() => onStartEditAccessRole(member)}
                                disabled={selectedAssetBusy}
                                aria-label={isPendingInvite ? `Edit pending invite for ${member.name}` : `Change role for ${member.name}`}
                                title={isPendingInvite ? 'Edit pending invite' : 'Change role'}
                              >
                                <Pencil className="h-4 w-4" />
                              </button>
                              <button
                                type="button"
                                className={cn(HOUSE_COLLABORATOR_ACTION_ICON_CLASS, HOUSE_COLLABORATOR_ACTION_ICON_DISCARD_CLASS)}
                                onClick={() => onStartRemoveAccess(cleanUserId)}
                                disabled={selectedAssetBusy}
                                aria-label={isPendingInvite ? `Cancel pending invite for ${member.name}` : `Remove ${member.name}`}
                                title={isPendingInvite ? 'Cancel pending invite' : 'Remove access'}
                              >
                                {isPendingInvite ? <X className="h-4 w-4" /> : <UserMinus className="h-4 w-4" />}
                              </button>
                            </div>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  )
                })}
                {!accessInlineStateActive ? (
                  <TableRow className="h-14">
                    <TableCell className={cn('h-14 px-3 py-0 align-middle', HOUSE_TABLE_CELL_TEXT_CLASS)}>
                      <div className="flex h-14 items-center" />
                    </TableCell>
                    <TableCell className={cn('h-14 px-3 py-0 align-middle', HOUSE_TABLE_CELL_TEXT_CLASS)}>
                      <div className="flex h-14 items-center" />
                    </TableCell>
                    <TableCell className={cn('h-14 px-3 py-0 align-middle', HOUSE_TABLE_CELL_TEXT_CLASS)}>
                      <div className="flex h-14 items-center justify-end">
                        <button
                          type="button"
                          className={cn(HOUSE_COLLABORATOR_ACTION_ICON_CLASS, HOUSE_COLLABORATOR_ACTION_ICON_ADD_CLASS)}
                          onClick={() => {
                            setAccessComposerOpen(true)
                            setAccessComposerRole('viewer')
                            setAccessEditingUserId(null)
                            setAccessEditingRole('viewer')
                            setError('')
                            setStatus('')
                          }}
                          disabled={selectedAssetBusy}
                          aria-label={`Invite user to ${displayAssetFilename(selectedAsset.filename)}`}
                          title="Invite user to file"
                        >
                          <Plus className="h-4 w-4" />
                        </button>
                      </div>
                    </TableCell>
                  </TableRow>
                ) : null}
                {accessComposerOpen ? (
                  <TableRow className="h-14">
                    <TableCell className={cn('h-14 px-3 py-0 align-middle', HOUSE_TABLE_CELL_TEXT_CLASS)}>
                      <div className="flex h-14 items-center gap-1.5">
                        <div className="max-w-[28rem] flex-1">
                          <Input
                            value={selectedAssetSearchQuery}
                            onChange={(event) => {
                              const nextValue = event.target.value
                              setCollaboratorQueryByAssetId((current) => ({
                                ...current,
                                [selectedAsset.id]: nextValue,
                              }))
                              setSelectedCollaboratorByAssetId((current) => ({
                                ...current,
                                [selectedAsset.id]: null,
                              }))
                              setLookupErrorByAssetId((current) => ({
                                ...current,
                                [selectedAsset.id]: '',
                              }))
                            }}
                            onKeyDown={(event) => {
                              if (event.key === 'Enter') {
                                event.preventDefault()
                                if (selectedAssetCandidate) {
                                  void onAddAccess(selectedAsset)
                                  return
                                }
                                void onSearchCollaborators(selectedAsset)
                              } else if (event.key === 'Escape') {
                                event.preventDefault()
                                resetAccessComposerForAsset(selectedAsset.id)
                              }
                            }}
                            placeholder="Search by collaborator name"
                            className={HOUSE_INPUT_CLASS}
                            disabled={selectedAssetBusy}
                          />
                        </div>
                        <button
                          type="button"
                          className={cn(HOUSE_COLLABORATOR_ACTION_ICON_CLASS, HOUSE_DRILLDOWN_TOGGLE_MUTED_CLASS)}
                          onClick={() => void onSearchCollaborators(selectedAsset)}
                          disabled={selectedAssetBusy || selectedAssetLookupBusy || normalizeName(selectedAssetSearchQuery).length < 2}
                          aria-label={`Search collaborators for ${displayAssetFilename(selectedAsset.filename)}`}
                        >
                          {selectedAssetLookupBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
                        </button>
                      </div>
                    </TableCell>
                    <TableCell className={cn('h-14 px-3 py-0 align-middle text-muted-foreground', HOUSE_TABLE_CELL_TEXT_CLASS)}>
                      <div className="flex h-14 items-center">
                        <SelectPrimitive
                          value={accessComposerRole}
                          onValueChange={(value) => setAccessComposerRole(value === 'editor' ? 'editor' : 'viewer')}
                          disabled={selectedAssetBusy}
                        >
                          <SelectTrigger className="h-9 w-[10rem] text-sm">
                            <SelectValue aria-label={humanizeLibraryAssetAccessRole(accessComposerRole)}>
                              {humanizeLibraryAssetAccessRole(accessComposerRole)}
                            </SelectValue>
                          </SelectTrigger>
                          <SelectContent>
                            {DATA_LIBRARY_ACCESS_ROLE_OPTIONS.map((option) => (
                              <SelectItem key={option.value} value={option.value}>
                                {option.label}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </SelectPrimitive>
                      </div>
                    </TableCell>
                    <TableCell className={cn('h-14 px-3 py-0 align-middle', HOUSE_TABLE_CELL_TEXT_CLASS)}>
                      <div className="flex h-14 items-center justify-end gap-1.5">
                        {selectedAssetCandidate ? (
                          <button
                            type="button"
                            className={cn(HOUSE_COLLABORATOR_ACTION_ICON_CLASS, HOUSE_COLLABORATOR_ACTION_ICON_CONFIRM_CLASS)}
                            onClick={() => void onAddAccess(selectedAsset)}
                            disabled={selectedAssetBusy}
                            aria-label={`Send file invite to ${selectedAssetCandidate.full_name}`}
                            title="Send file invite"
                          >
                            <Send className="h-4 w-4" />
                          </button>
                        ) : (
                          <span className={cn(HOUSE_COLLABORATOR_ACTION_ICON_CLASS, 'opacity-0')} aria-hidden="true" />
                        )}
                        <button
                          type="button"
                          className={cn(HOUSE_COLLABORATOR_ACTION_ICON_CLASS, HOUSE_COLLABORATOR_ACTION_ICON_DISCARD_CLASS)}
                          onClick={() => resetAccessComposerForAsset(selectedAsset.id)}
                          disabled={selectedAssetBusy}
                          aria-label={`Cancel invite flow for ${displayAssetFilename(selectedAsset.filename)}`}
                          title="Cancel file invite"
                        >
                          <X className="h-4 w-4" />
                        </button>
                      </div>
                    </TableCell>
                  </TableRow>
                ) : null}
              </TableBody>
            </Table>
          </div>
          {selectedAssetLookupError ? <p className="text-xs text-amber-700">{selectedAssetLookupError}</p> : null}
            {selectedAssetMatches.length > 0 ? (
              <div className="space-y-1">
                {selectedAssetMatches.map((candidate) => {
                  const isSelected = selectedAssetCandidate?.id === candidate.id
                  return (
                    <button
                      key={`${selectedAsset.id}-${candidate.id}`}
                      type="button"
                      onClick={() => {
                        setSelectedCollaboratorByAssetId((current) => ({
                          ...current,
                          [selectedAsset.id]: candidate,
                        }))
                      }}
                      className={cn(
                        'flex w-full items-center justify-between gap-3 rounded-md border border-border/60 px-3 py-2 text-left',
                        isSelected
                          ? 'bg-[hsl(var(--tone-accent-50))] ring-1 ring-[hsl(var(--tone-accent-300))]'
                          : 'bg-background/70 hover:bg-accent/30',
                      )}
                    >
                      <div className="min-w-0">
                        <p className={cn(houseTypography.text, 'truncate font-medium')}>{candidate.full_name}</p>
                        <p className={cn(HOUSE_FIELD_HELPER_CLASS, 'truncate')}>
                          {[candidate.email || '', candidate.primary_institution || ''].filter(Boolean).join(' | ') || 'Directory match'}
                        </p>
                      </div>
                      {isSelected ? (
                        <Badge variant="positive" size="sm">Selected</Badge>
                      ) : null}
                    </button>
                  )
                })}
              </div>
            ) : null}
          </div>
        )}
      </div>
      <div className={cn(houseSurfaces.sectionPanel, 'house-drilldown-panel-no-pad')}>
        <div className="house-drilldown-heading-block">
          <p className="house-drilldown-heading-block-title">Workspace access</p>
        </div>
        <div className="house-drilldown-content-block">
          {selectedAssetWorkspaceAccessRows.length === 0 ? (
            <p className={HOUSE_FIELD_HELPER_CLASS}>
              This file is not currently exposed through any workspaces.
            </p>
          ) : (
            <div className="space-y-2">
              {selectedAssetWorkspaceAccessRows.map((workspaceRow) => {
                const isExpanded = workspaceAccessExpandedById[workspaceRow.workspaceId] ?? false
                const detailsId = `${selectedAsset.id}-workspace-access-${workspaceRow.workspaceId}`
                const accessCount = workspaceRow.members.length

                return (
                  <div
                    key={`${selectedAsset.id}-workspace-${workspaceRow.workspaceId}`}
                    className={cn(
                      'rounded-md border border-border/60 bg-background/70',
                      HOUSE_DRILLDOWN_COLLAPSIBLE_ENTITY_CLASS,
                    )}
                    data-state={isExpanded ? 'open' : 'closed'}
                  >
                    <div className="flex items-center justify-between gap-3 px-2 py-1.5">
                      <button
                        type="button"
                        onClick={(event) => onToggleWorkspaceAccessMenu(workspaceRow.workspaceId, event)}
                        className={cn(
                          'group/workspace-access-menu min-w-0 flex-1 rounded-md px-1 py-1 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
                          selectedAssetBusy && 'cursor-wait',
                        )}
                        aria-haspopup="menu"
                        aria-expanded={workspaceAccessMenuState?.workspaceId === workspaceRow.workspaceId}
                        aria-label={`Open workspace actions for ${workspaceRow.workspaceName}`}
                      >
                        <span
                          className={cn(
                            houseTypography.text,
                            'inline-flex max-w-full items-center gap-1.5 font-medium transition-colors',
                            workspaceRow.canOpen ? 'text-foreground' : 'text-muted-foreground',
                          )}
                        >
                          <span className="truncate">{workspaceRow.workspaceName}</span>
                          <ChevronDown
                            className="h-3.5 w-3.5 shrink-0 opacity-45 transition-[opacity,transform] duration-[var(--motion-duration-ui)] ease-out group-hover/workspace-access-menu:translate-y-px group-hover/workspace-access-menu:opacity-80"
                          />
                        </span>
                      </button>
                      <button
                        type="button"
                        onClick={() => onToggleWorkspaceAccessExpanded(workspaceRow.workspaceId)}
                        className="inline-flex shrink-0 items-center gap-1 rounded-md px-1 py-1 text-xs text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                        aria-expanded={isExpanded}
                        aria-controls={detailsId}
                        aria-label={`${isExpanded ? 'Hide' : 'Show'} ${workspaceRow.workspaceName} access members`}
                      >
                        <span className={HOUSE_FIELD_HELPER_CLASS}>{accessCount}</span>
                        {isExpanded ? (
                          <ChevronUp className="h-4 w-4 text-muted-foreground" />
                        ) : (
                          <ChevronDown className="h-4 w-4 text-muted-foreground" />
                        )}
                      </button>
                    </div>
                    {isExpanded ? (
                      <div id={detailsId} role="region" aria-label={`${workspaceRow.workspaceName} access details`} className="border-t border-border/50">
                        {workspaceRow.members.length === 0 ? (
                          <p className={cn(HOUSE_FIELD_HELPER_CLASS, 'px-3 py-2')}>
                            {workspaceRow.canOpen ? 'Owner only.' : 'Membership unavailable.'}
                          </p>
                        ) : (
                          workspaceRow.members.map((member, index) => (
                            <div
                              key={member.key}
                              className={cn(
                                'flex items-center justify-between gap-3 px-3 py-2',
                                index > 0 ? 'border-t border-border/50' : '',
                              )}
                            >
                              <div className="min-w-0">
                                <p className={cn(houseTypography.text, 'truncate font-medium')}>
                                  {member.name}
                                </p>
                              </div>
                              <Badge size="sm" variant={member.accessRole === 'editor' ? 'positive' : 'outline'}>
                                {humanizeLibraryAssetAccessRole(member.accessRole)}
                              </Badge>
                            </div>
                          ))
                        )}
                      </div>
                    ) : null}
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </div>
    </>
  ) : null

  const actionsContent = selectedAsset ? (
    <div className={cn(houseSurfaces.sectionPanel, 'house-drilldown-panel-no-pad')}>
      <div className="house-drilldown-heading-block">
        <p className="house-drilldown-heading-block-title">Files</p>
      </div>
      <div className="house-drilldown-content-block space-y-4">
        {selectedAsset.can_edit_metadata ? (
          <div className="space-y-2">
            <p className={HOUSE_FIELD_HELPER_CLASS}>File name</p>
            {renamingAssetId === selectedAsset.id ? (
              <div className="flex items-center gap-1.5">
                <Input
                  value={renameDraft}
                  onChange={(event) => setRenameDraft(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter') {
                      event.preventDefault()
                      void onSaveRenameAsset(selectedAsset)
                    } else if (event.key === 'Escape') {
                      event.preventDefault()
                      onCancelRenameAsset()
                    }
                  }}
                  className={cn('h-9 w-full', HOUSE_INPUT_CLASS)}
                  disabled={selectedAssetBusy}
                  autoFocus
                />
                <button
                  type="button"
                  className={cn(HOUSE_COLLABORATOR_ACTION_ICON_CLASS, 'house-collaborator-action-icon-save')}
                  onClick={() => void onSaveRenameAsset(selectedAsset)}
                  disabled={selectedAssetBusy || !String(renameDraft || '').trim() || String(renameDraft || '').trim() === selectedAsset.filename.trim()}
                  aria-label={`Save rename for ${selectedAsset.filename}`}
                >
                  <Save className="h-4 w-4" />
                </button>
                <button
                  type="button"
                  className={cn(HOUSE_COLLABORATOR_ACTION_ICON_CLASS, 'house-collaborator-action-icon-discard')}
                  onClick={onCancelRenameAsset}
                  disabled={selectedAssetBusy}
                  aria-label="Cancel rename"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            ) : (
              <div className="flex items-center justify-between gap-2 rounded-md border border-border/60 bg-background/80 p-3">
                <p className={cn(houseTypography.text, 'font-medium')}>{selectedAsset.filename}</p>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => onStartRenameAsset(selectedAsset)}
                  disabled={selectedAssetBusy}
                >
                  Rename
                </Button>
              </div>
            )}
          </div>
        ) : null}
        <div className="space-y-2">
          <p className={HOUSE_FIELD_HELPER_CLASS}>Download</p>
          <Button
            type="button"
            variant="cta"
            size="sm"
            className="inline-flex items-center gap-1.5"
            onClick={() => void onDownloadAsset(selectedAsset)}
            disabled={selectedAssetBusy || !isAssetAvailable(selectedAsset) || !canDownloadSelectedAsset}
          >
            {selectedAssetBusy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5" />}
            {!isAssetAvailable(selectedAsset)
              ? 'Unavailable'
              : canDownloadSelectedAsset
                ? 'Download file'
                : 'Download unavailable'}
          </Button>
          {!canDownloadSelectedAsset ? (
            <p className={HOUSE_FIELD_HELPER_CLASS}>
              {isAssetLockedForTeamMembers(selectedAsset) && selectedAsset.current_user_role !== 'owner'
                ? `Locked by ${assetOwnerDisplayName(selectedAsset)}.`
                : 'Download requires editor or owner access.'}
            </p>
          ) : null}
        </div>
      </div>
    </div>
  ) : null

  const logsContent = selectedAsset ? (
    <>
      <div className={cn(houseSurfaces.sectionPanel, 'house-drilldown-panel-no-pad')}>
        <div className="house-drilldown-heading-block">
          <p className="house-drilldown-heading-block-title">
            {showPersonalAssetLogs ? 'Your data access activity' : 'Team member activity'}
          </p>
          <DrilldownSheet.HeadingToggle
            className="ml-auto"
            expanded={!accessActivityCollapsed}
            expandedLabel={showPersonalAssetLogs ? 'Collapse your data access activity' : 'Collapse team member activity'}
            collapsedLabel={showPersonalAssetLogs ? 'Expand your data access activity' : 'Expand team member activity'}
            onClick={onToggleAccessActivitySection}
          />
        </div>
        {accessActivityCollapsed ? null : (
          <div className="house-drilldown-content-block space-y-2">
            <div
              className={HOUSE_DRILLDOWN_TAB_LIST_CLASS}
              style={{ gridTemplateColumns: 'repeat(5, minmax(0, 1fr))' }}
            >
              {DATA_LIBRARY_ACCESS_ACTIVITY_FILTER_OPTIONS.map((option) => {
                const isActive = accessActivityFilter === option.value
                return (
                  <button
                    key={option.value}
                    type="button"
                    className={HOUSE_DRILLDOWN_TAB_TRIGGER_CLASS}
                    data-state={isActive ? 'active' : 'inactive'}
                    onClick={() => setAccessActivityFilter(option.value)}
                    aria-label={`Filter data access activity by ${option.label}`}
                    title={`Show ${option.label.toLowerCase()} events`}
                  >
                    {option.label}
                  </button>
                )
              })}
            </div>
            {accessActivityGroups.length === 0 ? (
              <p className={HOUSE_FIELD_HELPER_CLASS}>No access events logged yet.</p>
            ) : (
              accessActivityGroups.map((group) => {
                const isExpanded = accessActivityActorExpanded[group.key] ?? false
                return (
                  <AuditLogGroup
                    key={group.key}
                    title={group.title}
                    count={group.entries.length}
                    expanded={isExpanded}
                    onToggle={() => setAccessActivityActorExpanded((current) => ({ ...current, [group.key]: !isExpanded }))}
                    ariaLabel={`Toggle ${group.title} asset access activity`}
                  >
                    {group.entries.length === 0 ? (
                      <p className={cn(HOUSE_FIELD_HELPER_CLASS, 'px-3 py-2')}>No activity logged yet.</p>
                    ) : (
                      group.entries.map((entry, entryIndex) => {
                        const parsedTransition = parseLibraryAssetAuditTransition(entry)
                        return parsedTransition ? (
                          <AuditLogTransitionRow
                            key={entry.id}
                            transition={parsedTransition}
                            timestamp={formatAuditCompactTimestamp(entry.created_at)}
                            className={entryIndex > 0 ? 'border-t border-border/50' : ''}
                          />
                        ) : (
                          <AuditLogMessageRow
                            key={entry.id}
                            message={entry.message}
                            timestamp={formatAuditCompactTimestamp(entry.created_at)}
                            className={entryIndex > 0 ? 'border-t border-border/50' : ''}
                          />
                        )
                      })
                    )}
                  </AuditLogGroup>
                )
              })
            )}
          </div>
        )}
      </div>

      <div className={cn(houseSurfaces.sectionPanel, 'house-drilldown-panel-no-pad')}>
        <div className="house-drilldown-heading-block">
          <p className="house-drilldown-heading-block-title">Asset activity</p>
          <DrilldownSheet.HeadingToggle
            className="ml-auto"
            expanded={!assetActivityCollapsed}
            expandedLabel="Collapse asset activity"
            collapsedLabel="Expand asset activity"
            onClick={onToggleAssetActivitySection}
          />
        </div>
        {assetActivityCollapsed ? null : (
          <div className="house-drilldown-content-block space-y-2">
            {assetActivityGroups.length === 0 ? (
              <p className={HOUSE_FIELD_HELPER_CLASS}>No asset events logged yet.</p>
            ) : (
              assetActivityGroups.map((group) => {
                const isExpanded = assetActivityGroupExpanded[group.key] ?? false
                return (
                  <AuditLogGroup
                    key={group.key}
                    title={group.title}
                    count={group.entries.length}
                    expanded={isExpanded}
                    onToggle={() => setAssetActivityGroupExpanded((current) => ({ ...current, [group.key]: !isExpanded }))}
                    ariaLabel={`Toggle ${group.title.toLowerCase()} asset activity`}
                  >
                    {group.entries.map((entry, entryIndex) => {
                      const parsedTransition = parseLibraryAssetAuditTransition(entry)
                      return parsedTransition ? (
                        <AuditLogTransitionRow
                          key={entry.id}
                          transition={parsedTransition}
                          timestamp={formatAuditCompactTimestamp(entry.created_at)}
                          className={entryIndex > 0 ? 'border-t border-border/50' : ''}
                        />
                      ) : (
                        <AuditLogMessageRow
                          key={entry.id}
                          message={entry.message}
                          timestamp={formatAuditCompactTimestamp(entry.created_at)}
                          className={entryIndex > 0 ? 'border-t border-border/50' : ''}
                        />
                      )
                    })}
                  </AuditLogGroup>
                )
              })
            )}
          </div>
        )}
      </div>
    </>
  ) : null

  const pageHeading = isWorkspaceScoped ? 'Workspace data library' : 'Data library'
  const pageDescription = isWorkspaceScoped
    ? `Files currently in ${normalizedWorkspaceName || 'this workspace'}.`
    : 'Files, workspaces, and access.'
  const sectionHeading = isWorkspaceScoped ? 'Workspace files' : 'Files'
  const signedOutMessage = isWorkspaceScoped
    ? `Sign in to view files in ${normalizedWorkspaceName || 'this workspace'}.`
    : 'Sign in to view your personal data library.'
  const emptyLibraryMessage = isWorkspaceScoped
    ? `No files are currently in ${normalizedWorkspaceName || 'this workspace'}.`
    : ownershipFilter === 'shared_by_me'
      ? 'No files are currently shared by you.'
      : ownershipFilter === 'shared'
        ? 'No files are currently shared with you.'
        : 'No files match the current filters.'

  const drilldownPanel = selectedAsset ? (
    <div className={cn(HOUSE_DRILLDOWN_SHEET_BODY_CLASS, 'house-drilldown-panel-no-pad')}>
      <div className="relative z-10 house-drilldown-flow-shell">
        <div className="absolute right-0 top-0 z-20 p-3">
          <Button
            type="button"
            variant="outline"
            size="icon"
            className="h-9 w-9"
            onClick={onCloseAssetDrilldown}
            aria-label="Close data-library drilldown"
          >
            <X className="h-4 w-4" />
          </Button>
        </div>

        <DrilldownSheet.Header
          title={displayAssetFilename(selectedAsset.filename)}
          variant="workspace"
        >
          <TooltipProvider delayDuration={120}>
            <DrilldownSheet.Tabs
              activeTab={drilldownTab}
              onTabChange={(tabId) => {
                if (!canViewDataLibraryDrilldownTab(selectedAsset, tabId as DataLibraryDrilldownTab)) {
                  return
                }
                setDrilldownTab(tabId as DataLibraryDrilldownTab)
              }}
              panelIdPrefix="data-library-drilldown-panel-"
              tabIdPrefix="data-library-drilldown-tab-"
              tone="workspace"
              flexGrow={drilldownTabFlexGrow}
              aria-label="Data-library drilldown sections"
              className="house-drilldown-tabs"
            >
              {(['overview', 'access', 'actions', 'logs'] as DataLibraryDrilldownTab[]).map((tab) => {
                const tabEnabled = canViewDataLibraryDrilldownTab(selectedAsset, tab)
                const tabRestrictionMessage = dataLibraryDrilldownTabRestrictionMessage(tab)
                const tabLabel = dataLibraryDrilldownTabLabel(tab, selectedAsset)
                return !tabEnabled && tabRestrictionMessage ? (
                  <Tooltip key={tab}>
                    <TooltipTrigger asChild>
                      <span className="inline-flex flex-1 basis-0">
                        <DrilldownSheet.Tab id={tab} disabled aria-disabled="true">
                          {tabLabel}
                        </DrilldownSheet.Tab>
                      </span>
                    </TooltipTrigger>
                    <TooltipContent side="top" className="max-w-[16rem] text-xs leading-relaxed">
                      {tabRestrictionMessage}
                    </TooltipContent>
                  </Tooltip>
                ) : (
                  <DrilldownSheet.Tab key={tab} id={tab}>
                    {tabLabel}
                  </DrilldownSheet.Tab>
                )
              })}
            </DrilldownSheet.Tabs>
          </TooltipProvider>
        </DrilldownSheet.Header>

        <DrilldownSheet.TabPanel
          id={drilldownTab}
          isActive={true}
          panelIdPrefix="data-library-drilldown-panel-"
          tabIdPrefix="data-library-drilldown-tab-"
        >
          <div className="house-drilldown-stack-3">
            {drilldownTab === 'overview' ? overviewContent : null}
            {drilldownTab === 'access' ? accessContent : null}
            {drilldownTab === 'actions' ? actionsContent : null}
            {drilldownTab === 'logs' ? logsContent : null}
            {selectedAssetLockMessage ? (
              <div className="pt-2">
                <div className={selectedAssetReadOnlyBannerClassName}>{selectedAssetLockMessage}</div>
              </div>
            ) : null}
          </div>
        </DrilldownSheet.TabPanel>
      </div>
    </div>
  ) : null

  return (
    <Stack data-house-role="page" space="sm">
      {showPageHeader ? (
        <Row
          align="center"
          gap="md"
          wrap={false}
          className="house-page-title-row"
        >
          <SectionMarker tone={getSectionMarkerTone('workspace')} size="title" className="self-stretch h-auto" />
          <PageHeader
            heading={pageHeading}
            description={pageDescription}
            className="!ml-0 !mt-0"
          />
        </Row>
      ) : null}

      <div className={showPageHeader ? cn(HOUSE_SECTION_ANCHOR_CLASS) : undefined}>
        <SectionHeader
          heading={sectionHeading}
          className="house-publications-toolbar-header house-publications-library-toolbar-header"
          actions={(
            <div className="ml-auto flex w-full flex-wrap items-center justify-end gap-3 overflow-visible self-center md:w-auto">
              <div className="house-approved-toggle-context order-0 inline-flex items-center gap-2">
                <span className="text-[11px] font-medium uppercase tracking-[0.12em] text-muted-foreground">
                  Status
                </span>
                <div
                  className="house-segmented-auto-toggle h-8"
                  data-house-role="horizontal-toggle"
                  data-ui="data-library-archive-scope-toggle"
                >
                  {DATA_LIBRARY_ARCHIVE_SCOPE_OPTIONS.map((option) => {
                    const isActive = archiveScope === option.value
                    return (
                      <button
                        key={option.value}
                        type="button"
                        className={cn(
                          HOUSE_TOGGLE_BUTTON_CLASS,
                          'house-segmented-fill-toggle-button relative z-[1] min-w-0 px-3 text-sm text-center',
                          '!rounded-none',
                          isActive
                            ? option.value === 'active'
                              ? 'bg-[hsl(var(--tone-positive-600))] text-white'
                              : option.value === 'archived'
                                ? 'bg-[hsl(var(--tone-neutral-700))] text-white'
                                : 'bg-foreground text-background'
                            : HOUSE_DRILLDOWN_TOGGLE_MUTED_CLASS,
                        )}
                        aria-pressed={isActive}
                        onClick={() => {
                          setArchiveScope(option.value)
                          setPage(1)
                        }}
                      >
                        {option.label}
                      </button>
                    )
                  })}
                </div>
              </div>
              <div className="house-approved-toggle-context order-0 inline-flex items-center gap-2">
                <span className="text-[11px] font-medium uppercase tracking-[0.12em] text-muted-foreground">
                  Access
                </span>
                <div
                  className="house-segmented-auto-toggle h-8"
                  data-house-role="horizontal-toggle"
                  data-ui="data-library-scope-toggle"
                >
                  {DATA_LIBRARY_SCOPE_OPTIONS.map((option) => {
                    const isActive = ownershipFilter === option.value
                    return (
                      <button
                        key={option.value}
                        type="button"
                        className={cn(
                          HOUSE_TOGGLE_BUTTON_CLASS,
                          'house-segmented-fill-toggle-button relative z-[1] min-w-0 px-3 text-sm text-center',
                          '!rounded-none',
                          isActive
                            ? option.value === 'owned'
                              ? 'bg-[hsl(var(--tone-accent-600))] text-white'
                              : option.value === 'shared_by_me'
                                ? 'bg-[hsl(var(--tone-positive-600))] text-white'
                              : option.value === 'shared'
                                ? 'bg-[hsl(var(--tone-warning-600))] text-white'
                                : 'bg-foreground text-background'
                            : HOUSE_DRILLDOWN_TOGGLE_MUTED_CLASS,
                        )}
                        aria-pressed={isActive}
                        onClick={() => {
                          setOwnershipFilter(option.value)
                          setPage(1)
                        }}
                      >
                        {option.label}
                      </button>
                    )
                  })}
                </div>
              </div>
            </div>
          )}
        />

        {status ? (
          <p className={cn('px-1 pb-3 text-sm text-emerald-700', HOUSE_FIELD_HELPER_CLASS)}>{status}</p>
        ) : null}

        {isWorkspaceScoped ? (
          <div className="mb-3 rounded-md border border-[hsl(var(--tone-accent-300))] bg-[hsl(var(--tone-accent-50))] px-3 py-2 text-sm text-[hsl(var(--tone-accent-900))]">
            Scope: <span className="font-medium">{normalizedWorkspaceName || normalizedWorkspaceId}</span>
          </div>
        ) : null}

        {!hasSessionToken ? (
          <div className={cn('p-6', HOUSE_FIELD_HELPER_CLASS)}>
            {signedOutMessage}
          </div>
        ) : isLoading ? (
          <div className={cn('p-6 text-sm text-muted-foreground', HOUSE_FIELD_HELPER_CLASS)}>
            <span className="inline-flex items-center gap-2">
              <Loader2 className="h-4 w-4 animate-spin" />
              Loading files...
            </span>
          </div>
        ) : error ? (
          <div className="space-y-2 p-6">
            <p className="text-sm text-red-700">{error}</p>
            <Button type="button" variant="outline" size="sm" onClick={onRefresh}>
              Retry
            </Button>
          </div>
        ) : assets.length === 0 ? (
          <div className={cn('p-6', HOUSE_FIELD_HELPER_CLASS)}>
            {emptyLibraryMessage}
          </div>
        ) : (
          <>
            <div className="relative w-full house-table-context-profile">
              <Table
                className={cn(
                  'w-full table-fixed house-table-resizable',
                  tableDensity === 'compact' && 'house-publications-table-density-compact',
                  tableDensity === 'comfortable' && 'house-publications-table-density-comfortable',
                )}
                data-house-no-column-resize="true"
                data-house-no-column-controls="true"
                data-house-table-id="data-library-table"
              >
                <colgroup>
                  {visibleTableColumns.map((columnKey) => (
                    <col key={`data-library-col-${columnKey}`} style={{ width: tableColumnDefinitions[columnKey].width }} />
                  ))}
                </colgroup>
                <TableHeader className="house-table-head text-left">
                  <TableRow style={{ backgroundColor: 'transparent' }}>
                    {visibleTableColumns.map((columnKey, columnIndex) => {
                      const definition = tableColumnDefinitions[columnKey]
                      const isLastColumn = columnIndex >= visibleTableColumns.length - 1
                      const headClassName = cn(
                        'house-table-head-text px-4 py-3',
                        !isLastColumn && 'border-r border-[hsl(var(--border))]/70',
                        definition.align === 'center' && 'text-center',
                      )
                      return (
                        <TableHead key={`data-library-head-${columnKey}`} className={headClassName}>
                          {definition.sortBy ? (
                            <button
                              type="button"
                              className={cn(
                                'inline-flex w-full items-center gap-1 transition-colors hover:text-foreground',
                                definition.align === 'center' ? 'justify-center text-center' : 'justify-start text-left',
                              )}
                              onClick={() => onSort(definition.sortBy!)}
                            >
                              <span>{definition.label}</span>
                              {sortBy === definition.sortBy ? (
                                sortDirection === 'desc' ? (
                                  <ChevronDown className="h-3.5 w-3.5 text-foreground" />
                                ) : (
                                  <ChevronUp className="h-3.5 w-3.5 text-foreground" />
                                )
                              ) : null}
                            </button>
                          ) : (
                            <span className={cn('inline-flex w-full items-center', definition.align === 'center' ? 'justify-center text-center' : 'justify-start text-left')}>
                              {definition.label}
                            </span>
                          )}
                        </TableHead>
                      )
                    })}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {assets.map((asset) => {
                    const available = isAssetAvailable(asset)
                    const ownerName = normalizeName(asset.owner_name || '') || 'Unknown'
                    const workspacePlacements = libraryAssetWorkspacePlacements(asset)
                    const resolvedWorkspacePlacements = workspacePlacements.map((placement) => {
                      const workspaceOption = availableWorkspaceOptionsById.get(placement.workspace_id)
                      return {
                        workspace_id: placement.workspace_id,
                        workspace_name: workspaceOption?.name || placement.workspace_name,
                        canOpen: Boolean(workspaceOption),
                      }
                    })
                    const permissionsBadge = libraryAssetPermissionsBadge(asset)
                    const accessVia = libraryAssetAccessViaDetail(asset)
                    const isSelected = selectedAssetId === asset.id
                    const sharedAudience = libraryAssetSharedAudience(
                      asset,
                      resolvedWorkspacePlacements,
                      workspaceRecordsById,
                    )

                    return (
                      <TableRow
                        key={asset.id}
                        className={cn(
                          'cursor-pointer transition-colors',
                          isAssetLockedForTeamMembers(asset)
                            ? 'bg-[hsl(var(--tone-neutral-200))] hover:bg-[hsl(var(--tone-neutral-200))]'
                            : isAssetArchivedForCurrentUser(asset)
                              ? 'bg-[hsl(var(--tone-neutral-100))] hover:bg-[hsl(var(--tone-neutral-100))]'
                            : 'hover:bg-[hsl(var(--tone-accent-50))]',
                          isSelected && 'bg-[hsl(var(--tone-accent-50))]',
                        )}
                        onClick={() => onAssetRowClick(asset.id)}
                      >
                        {visibleTableColumns.map((columnKey, columnIndex) => {
                          const isLastColumn = columnIndex >= visibleTableColumns.length - 1
                          const cellClassName = cn(
                            !isLastColumn && 'border-r border-[hsl(var(--border))]/70',
                            HOUSE_TABLE_CELL_TEXT_CLASS,
                          )
                          if (columnKey === 'filename') {
                            return (
                              <TableCell
                                key={`${asset.id}-${columnKey}`}
                                className={cn('align-middle', cellClassName)}
                                onContextMenu={(event) => onOpenAssetContextMenu(asset.id, event)}
                              >
                                <div className="min-w-0 space-y-1">
                                  <div className="flex min-w-0 items-center gap-1.5">
                                    <p className="truncate font-medium text-foreground">{displayAssetFilename(asset.filename)}</p>
                                    {isAssetLockedForTeamMembers(asset) ? (
                                      <span
                                        role="img"
                                        aria-label={assetLockedBadgeLabel(asset)}
                                        title={assetLockedBadgeLabel(asset)}
                                        className={DATA_LIBRARY_LOCK_INDICATOR_CLASS}
                                      >
                                        <Lock className="h-3 w-3" aria-hidden="true" />
                                      </span>
                                    ) : null}
                                  </div>
                                  {!available ? <p className="text-xs text-[hsl(var(--tone-warning-900))]">Storage missing</p> : null}
                                </div>
                              </TableCell>
                            )
                          }
                          if (columnKey === 'access') {
                            const AccessViaIcon = accessVia.icon
                            return (
                              <TableCell key={`${asset.id}-${columnKey}`} className={cn('align-middle', cellClassName)}>
                                <div className="min-w-0">
                                  <Badge
                                    size="sm"
                                    variant={accessVia.variant}
                                    className={cn('max-w-full justify-start gap-1.5 overflow-hidden whitespace-nowrap', accessVia.className)}
                                  >
                                    <AccessViaIcon className="h-3 w-3 shrink-0" />
                                    <span className="min-w-0 truncate">{accessVia.label}</span>
                                  </Badge>
                                </div>
                              </TableCell>
                            )
                          }
                          if (columnKey === 'workspaces') {
                            return (
                              <TableCell key={`${asset.id}-${columnKey}`} className={cn('align-middle', cellClassName)}>
                                <div className="flex flex-wrap items-center gap-1.5">
                                  {resolvedWorkspacePlacements.length > 0 ? (
                                    resolvedWorkspacePlacements.map((placement) => (
                                      placement.canOpen ? (
                                        <button
                                          key={`${asset.id}-${placement.workspace_id}`}
                                          type="button"
                                          className="rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                                          onClick={(event) => {
                                            event.stopPropagation()
                                            onGoToWorkspace(placement.workspace_id)
                                          }}
                                          aria-label={`Open ${placement.workspace_name}`}
                                        >
                                          <Badge size="sm" variant="outline" className="cursor-pointer">
                                            {placement.workspace_name}
                                          </Badge>
                                        </button>
                                      ) : (
                                        <Badge
                                          key={`${asset.id}-${placement.workspace_id}`}
                                          size="sm"
                                          variant="outline"
                                          className="border-[hsl(var(--border))] bg-[hsl(var(--tone-neutral-50))] text-muted-foreground"
                                        >
                                          {placement.workspace_name}
                                        </Badge>
                                      )
                                    ))
                                  ) : (
                                    <Badge
                                      size="sm"
                                      variant="outline"
                                      className="border-[hsl(var(--border))] bg-[hsl(var(--tone-neutral-50))] text-muted-foreground"
                                    >
                                      Library only
                                    </Badge>
                                  )}
                                </div>
                              </TableCell>
                            )
                          }
                          if (columnKey === 'origin') {
                            return (
                              <TableCell key={`${asset.id}-${columnKey}`} className={cn('align-middle', cellClassName)}>
                                <Badge
                                  size="sm"
                                  variant={permissionsBadge.variant}
                                  className={cn('max-w-full justify-start whitespace-normal text-left leading-snug', permissionsBadge.className)}
                                >
                                  {permissionsBadge.label}
                                </Badge>
                              </TableCell>
                            )
                          }
                          if (columnKey === 'owner') {
                            if (showsSharedByMeAudienceColumn) {
                              return (
                                <TableCell key={`${asset.id}-${columnKey}`} className={cn('align-middle', cellClassName)}>
                                  <div className="min-w-0">
                                    <div className="flex flex-wrap items-center gap-1.5">
                                      {sharedAudience.allTargets.length > 0 ? (
                                        sharedAudience.allTargets.map((target) => (
                                          <Badge
                                            key={`${asset.id}-${target.key}`}
                                            size="sm"
                                            variant="outline"
                                            className={cn(
                                              'max-w-full justify-start gap-1.5 overflow-hidden whitespace-nowrap',
                                              target.kind === 'workspace'
                                                ? DATA_LIBRARY_SHARED_TARGET_WORKSPACE_BADGE_CLASS
                                                : DATA_LIBRARY_SHARED_TARGET_DIRECT_BADGE_CLASS,
                                            )}
                                          >
                                            {target.kind === 'workspace' ? (
                                              <Building2 className="h-3 w-3 shrink-0" />
                                            ) : (
                                              <User className="h-3 w-3 shrink-0" />
                                            )}
                                            <span className="min-w-0 truncate">{target.label}</span>
                                          </Badge>
                                        ))
                                      ) : (
                                        <span className="text-xs text-muted-foreground">No active access</span>
                                      )}
                                    </div>
                                  </div>
                                </TableCell>
                              )
                            }
                            return (
                              <TableCell key={`${asset.id}-${columnKey}`} className={cn('align-middle', cellClassName)}>
                                <p className="truncate font-medium text-foreground">{ownerName}</p>
                              </TableCell>
                            )
                          }
                          if (columnKey === 'uploaded') {
                            return <TableCell key={`${asset.id}-${columnKey}`} className={cn('align-middle text-muted-foreground', cellClassName)}>{formatTimestamp(asset.uploaded_at)}</TableCell>
                          }
                          if (columnKey === 'format') {
                            return <TableCell key={`${asset.id}-${columnKey}`} className={cn('align-middle text-muted-foreground', cellClassName)}>{asset.kind.toUpperCase()}</TableCell>
                          }
                          if (columnKey === 'size') {
                            return <TableCell key={`${asset.id}-${columnKey}`} className={cn('align-middle text-muted-foreground', cellClassName)}>{formatBytes(asset.byte_size)}</TableCell>
                          }
                          return null
                        })}
                      </TableRow>
                    )
                  })}
                </TableBody>
              </Table>

            </div>

            <Sheet
              open={Boolean(selectedAsset)}
              onOpenChange={(open) => {
                if (!open) {
                  onCloseAssetDrilldown()
                }
              }}
            >
              <SheetContent
                side="right"
                className={cn(
                  HOUSE_DRILLDOWN_SHEET_CLASS,
                  selectedAssetLocked && 'brightness-[0.85]',
                )}
                onInteractOutside={(event) => {
                  if (shouldKeepAssetDrilldownOpen(event.target)) {
                    event.preventDefault()
                  }
                }}
                onPointerDownOutside={(event) => {
                  if (shouldKeepAssetDrilldownOpen(event.target)) {
                    event.preventDefault()
                  }
                }}
              >
                {drilldownPanel}
              </SheetContent>
            </Sheet>

            {workspaceAccessMenuState && workspaceAccessMenuRow && selectedAsset
              ? createPortal(
                  <div
                    className="pointer-events-auto fixed inset-0 z-[70]"
                    data-ui="data-library-workspace-access-menu-overlay"
                    onClick={() => setWorkspaceAccessMenuState(null)}
                  >
                    <div
                      data-ui="data-library-workspace-access-menu-shell"
                      className="pointer-events-auto fixed z-[71] w-60 rounded-md border border-border bg-card p-1 shadow-lg"
                      role="menu"
                      aria-label={`${workspaceAccessMenuRow.workspaceName} workspace actions`}
                      style={{ left: workspaceAccessMenuState.x, top: workspaceAccessMenuState.y }}
                      onClick={(event) => event.stopPropagation()}
                    >
                      <button
                        type="button"
                        role="menuitem"
                        className={cn(
                          'flex w-full items-center gap-2 whitespace-nowrap rounded px-2 py-1.5 text-left text-sm hover:bg-[hsl(var(--tone-accent-100))] hover:text-[hsl(var(--tone-accent-900))]',
                          !workspaceAccessMenuRow.canOpen && 'cursor-not-allowed text-muted-foreground hover:bg-transparent hover:text-muted-foreground',
                        )}
                        onClick={() => {
                          if (!workspaceAccessMenuRow.canOpen) {
                            return
                          }
                          setWorkspaceAccessMenuState(null)
                          onGoToWorkspace(workspaceAccessMenuRow.workspaceId)
                        }}
                        disabled={!workspaceAccessMenuRow.canOpen}
                      >
                        <ArrowRight className="h-4 w-4 shrink-0" />
                        <span>Open workspace</span>
                      </button>
                      <button
                        type="button"
                        role="menuitem"
                        className={cn(
                          'flex w-full items-center gap-2 whitespace-nowrap rounded px-2 py-1.5 text-left text-sm hover:bg-[hsl(var(--tone-accent-100))] hover:text-[hsl(var(--tone-accent-900))]',
                          !workspaceAccessMenuRow.canOpen && 'cursor-not-allowed text-muted-foreground hover:bg-transparent hover:text-muted-foreground',
                        )}
                        onClick={() => {
                          if (!workspaceAccessMenuRow.canOpen) {
                            return
                          }
                          setWorkspaceAccessMenuState(null)
                          onGoToWorkspace(workspaceAccessMenuRow.workspaceId, 'actions')
                        }}
                        disabled={!workspaceAccessMenuRow.canOpen}
                      >
                        <Pencil className="h-4 w-4 shrink-0" />
                        <span>Manage members</span>
                      </button>
                      {selectedAsset.can_edit_metadata ? <div className="my-1 border-t border-border/70" /> : null}
                      {selectedAsset.can_edit_metadata ? (
                        <button
                          type="button"
                          role="menuitem"
                          className={cn(
                            'flex w-full items-center gap-2 whitespace-nowrap rounded px-2 py-1.5 text-left text-sm hover:bg-[hsl(var(--tone-accent-100))] hover:text-[hsl(var(--tone-accent-900))]',
                            selectedAssetBusy && 'cursor-not-allowed text-muted-foreground hover:bg-transparent hover:text-muted-foreground',
                          )}
                          onClick={() => {
                            if (selectedAssetBusy) {
                              return
                            }
                            setWorkspaceAccessMenuState(null)
                            void onRemoveWorkspacePlacement(
                              selectedAsset,
                              workspaceAccessMenuRow.workspaceId,
                              workspaceAccessMenuRow.workspaceName,
                            )
                          }}
                          disabled={selectedAssetBusy}
                        >
                          <X className="h-4 w-4 shrink-0" />
                          <span>Remove from workspace</span>
                        </button>
                      ) : null}
                    </div>
                  </div>,
                  document.body,
                )
              : null}

            {menuState && menuAsset
              ? createPortal(
                  <div className="fixed inset-0 z-50" data-ui="data-library-menu-overlay" onClick={() => setMenuState(null)}>
                    <div
                      data-ui="data-library-menu-shell"
                      className="fixed w-[13.25rem] rounded-md border border-border bg-card p-1 shadow-lg"
                      style={{ left: menuState.x, top: menuState.y }}
                      onClick={(event) => event.stopPropagation()}
                    >
                      <button
                        type="button"
                        className="flex w-full items-center gap-2 whitespace-nowrap rounded px-2 py-1.5 text-left text-sm hover:bg-[hsl(var(--tone-accent-100))] hover:text-[hsl(var(--tone-accent-900))]"
                        onClick={() => {
                          setMenuState(null)
                          onOpenAssetDrilldown(menuAsset.id)
                        }}
                      >
                        <ArrowRight className="h-4 w-4 shrink-0" />
                        <span>Open details</span>
                      </button>
                      <div className="my-1 border-t border-border/70" />
                      {menuAsset.can_edit_metadata ? (
                        <button
                          type="button"
                          className="flex w-full items-center gap-2 whitespace-nowrap rounded px-2 py-1.5 text-left text-sm hover:bg-[hsl(var(--tone-accent-100))] hover:text-[hsl(var(--tone-accent-900))]"
                          onClick={() => onStartRenameAssetFromMenu(menuAsset)}
                        >
                          <Pencil className="h-4 w-4 shrink-0" />
                          <span>Rename file</span>
                        </button>
                      ) : null}
                      <button
                        type="button"
                        className="flex w-full items-center gap-2 whitespace-nowrap rounded px-2 py-1.5 text-left text-sm hover:bg-[hsl(var(--tone-accent-100))] hover:text-[hsl(var(--tone-accent-900))]"
                        onClick={() => {
                          setMenuState(null)
                          void onToggleAssetArchive(menuAsset)
                        }}
                      >
                        {isAssetArchivedForCurrentUser(menuAsset) ? (
                          <RotateCcw className="h-4 w-4 shrink-0" />
                        ) : (
                          <Archive className="h-4 w-4 shrink-0" />
                        )}
                        <span>{assetArchiveActionLabel(menuAsset)}</span>
                      </button>
                      {menuAsset.can_edit_metadata ? (
                        <button
                          type="button"
                          className="flex w-full items-center gap-2 whitespace-nowrap rounded px-2 py-1.5 text-left text-sm hover:bg-[hsl(var(--tone-accent-100))] hover:text-[hsl(var(--tone-accent-900))]"
                          onClick={() => {
                            setMenuState(null)
                            void onToggleAssetLock(menuAsset)
                          }}
                        >
                          {isAssetLockedForTeamMembers(menuAsset) ? (
                            <LockOpen className="h-4 w-4 shrink-0" />
                          ) : (
                            <Lock className="h-4 w-4 shrink-0" />
                          )}
                          <span>{assetLockActionLabel(menuAsset)}</span>
                        </button>
                      ) : null}
                      {(menuAsset.can_edit_metadata || menuAsset.can_download) ? <div className="my-1 border-t border-border/70" /> : null}
                      {menuAsset.can_download ? (
                        <button
                          type="button"
                          className={cn(
                            'flex w-full items-center gap-2 whitespace-nowrap rounded px-2 py-1.5 text-left text-sm hover:bg-[hsl(var(--tone-accent-100))] hover:text-[hsl(var(--tone-accent-900))]',
                            !isAssetAvailable(menuAsset) && 'cursor-not-allowed text-muted-foreground hover:bg-transparent hover:text-muted-foreground',
                          )}
                          onClick={() => {
                            if (!isAssetAvailable(menuAsset)) {
                              return
                            }
                            onDownloadAssetFromMenu(menuAsset)
                          }}
                          disabled={!isAssetAvailable(menuAsset)}
                        >
                          <Download className="h-4 w-4 shrink-0" />
                          <span>Download file</span>
                        </button>
                      ) : null}
                    </div>
                  </div>,
                  document.body,
                )
              : null}
          </>
        )}
      </div>
    </Stack>
  )
}
