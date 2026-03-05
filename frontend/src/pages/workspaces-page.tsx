import { useEffect, useMemo, useState, type MouseEvent as ReactMouseEvent } from 'react'
import { createPortal } from 'react-dom'
import { useNavigate, useSearchParams } from 'react-router-dom'
import {
  ArrowRight,
  Check,
  ChevronDown,
  ChevronUp,
  ChevronsUpDown,
  PanelRightClose,
  PanelRightOpen,
  Pencil,
  Pin,
  RotateCcw,
  Save,
  UserMinus,
  UserPlus,
  X,
} from 'lucide-react'

import { TopBar } from '@/components/layout/top-bar'
import { PageHeader, Row, Toolbar } from '@/components/primitives'
import { SectionMarker } from '@/components/patterns'
import {
  Button,
  Input,
  SelectPrimitive,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Sheet,
  SheetContent,
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
  ScrollArea,
} from '@/components/ui'
import { WorkspacesDataLibraryView } from '@/pages/workspaces-data-library-view'
import {
  WORKSPACE_OWNER_REQUIRED_MESSAGE,
  readWorkspaceOwnerNameFromProfile,
} from '@/lib/workspace-owner'
import { houseActions, houseCollaborators, houseDrilldown, houseForms, houseLayout, houseNavigation, houseSurfaces, houseTables, houseTypography } from '@/lib/house-style'
import { getHouseLeftBorderToneClass, getHouseNavToneClass, getSectionMarkerTone } from '@/lib/section-tone'
import { matchesScopedStorageEventKey } from '@/lib/user-scoped-storage'
import { cn } from '@/lib/utils'
import { useAaweStore } from '@/store/use-aawe-store'
import {
  INBOX_MESSAGES_STORAGE_KEY,
  INBOX_READS_STORAGE_KEY,
  useWorkspaceInboxStore,
} from '@/store/use-workspace-inbox-store'
import {
  useWorkspaceStore,
  type WorkspaceAuditCategory,
  type WorkspaceAuditLogEntry,
  type WorkspaceCollaboratorRole,
  type WorkspaceRecord,
} from '@/store/use-workspace-store'

type ViewMode = 'table' | 'cards'
type CenterView = 'workspaces' | 'invitations' | 'data-library'
type FilterKey = 'all' | 'active' | 'pinned' | 'archived' | 'recent'
type SortColumn = 'name' | 'stage' | 'updatedAt' | 'status'
type SortDirection = 'asc' | 'desc'

type CollaboratorChipState = 'active' | 'removed' | 'pending'

type CollaboratorChipEntry = {
  key: string
  name: string
  state: CollaboratorChipState
  role: WorkspaceCollaboratorRole
}

type WorkspaceAuditEntry = WorkspaceAuditLogEntry

type CollaboratorAccessStatus =
  | 'none'
  | 'pending'
  | 'active'
  | 'removed'
  | 'accepted'
  | 'cancelled'
  | 'declined'

type ToggleCollaboratorRemovedOptions = {
  skipRemoveConfirmation?: boolean
  restoreRole?: WorkspaceCollaboratorRole
}

const COLLABORATOR_ROLE_OPTIONS: Array<{
  value: WorkspaceCollaboratorRole
  label: string
}> = [
  { value: 'editor', label: 'Editor' },
  { value: 'reviewer', label: 'Reviewer' },
  { value: 'viewer', label: 'Viewer' },
]

const FILTER_OPTIONS: Array<{ key: FilterKey; label: string }> = [
  { key: 'all', label: 'All' },
  { key: 'active', label: 'Active' },
  { key: 'pinned', label: 'Pinned' },
  { key: 'recent', label: 'Recent (14 days)' },
  { key: 'archived', label: 'Archived' },
]

const HOUSE_SECTION_TITLE_CLASS = houseTypography.sectionTitle
const HOUSE_PAGE_HEADER_CLASS = houseLayout.pageHeader
const HOUSE_SIDEBAR_FRAME_CLASS = houseLayout.sidebarFrame
const HOUSE_SIDEBAR_CLASS = houseLayout.sidebar
const HOUSE_SIDEBAR_SCROLL_CLASS = houseLayout.sidebarScroll
const HOUSE_SIDEBAR_HEADER_CLASS = houseLayout.sidebarHeader
const HOUSE_SIDEBAR_BODY_CLASS = houseLayout.sidebarBody
const HOUSE_SIDEBAR_SECTION_CLASS = houseLayout.sidebarSection
const HOUSE_FIELD_HELPER_CLASS = houseTypography.fieldHelper
const HOUSE_BUTTON_TEXT_CLASS = houseTypography.buttonText
const HOUSE_LEFT_BORDER_CLASS = cn(houseSurfaces.leftBorder, getHouseLeftBorderToneClass('workspace'))
const HOUSE_DATA_LEFT_BORDER_CLASS = cn(houseSurfaces.leftBorder, getHouseLeftBorderToneClass('data'))
const HOUSE_CARD_CLASS = houseSurfaces.card
const HOUSE_TABLE_SHELL_CLASS = houseSurfaces.tableShell
const HOUSE_TABLE_HEAD_CLASS = houseSurfaces.tableHead
const HOUSE_TABLE_ROW_CLASS = houseSurfaces.tableRow
const HOUSE_TABLE_HEAD_TEXT_CLASS = houseTypography.tableHead
const HOUSE_TABLE_CELL_TEXT_CLASS = houseTypography.tableCell
const HOUSE_TABLE_FILTER_INPUT_CLASS = houseTables.filterInput
const HOUSE_TABLE_FILTER_SELECT_CLASS = houseTables.filterSelect
const HOUSE_TABLE_SORT_TRIGGER_CLASS = houseTables.sortTrigger
const HOUSE_INPUT_CLASS = houseForms.input
const HOUSE_ACTION_BUTTON_CLASS = houseForms.actionButton
const HOUSE_PRIMARY_ACTION_BUTTON_CLASS = houseForms.actionButtonPrimary
const HOUSE_SUCCESS_ACTION_BUTTON_CLASS = houseForms.actionButtonSuccess
const HOUSE_DANGER_ACTION_BUTTON_CLASS = houseForms.actionButtonDanger
const HOUSE_COLLABORATOR_CHIP_CLASS = houseCollaborators.chip
const HOUSE_COLLABORATOR_CHIP_ACTIVE_CLASS = houseCollaborators.chipActive
const HOUSE_COLLABORATOR_CHIP_PENDING_CLASS = houseCollaborators.chipPending
const HOUSE_COLLABORATOR_CHIP_REMOVED_CLASS = houseCollaborators.chipRemoved
const HOUSE_COLLABORATOR_CHIP_MANAGEABLE_CLASS = houseCollaborators.chipManageable
const HOUSE_COLLABORATOR_CHIP_READONLY_CLASS = houseCollaborators.chipReadOnly
const HOUSE_COLLABORATOR_ACTION_ICON_CLASS = houseCollaborators.actionIcon
const HOUSE_COLLABORATOR_ACTION_ICON_ADD_CLASS = houseCollaborators.actionIconAdd
const HOUSE_COLLABORATOR_ACTION_ICON_CONFIRM_CLASS = houseCollaborators.actionIconConfirm
const HOUSE_COLLABORATOR_ACTION_ICON_EDIT_CLASS = houseCollaborators.actionIconEdit
const HOUSE_COLLABORATOR_ACTION_ICON_REMOVE_CLASS = houseCollaborators.actionIconRemove
const HOUSE_COLLABORATOR_ACTION_ICON_RESTORE_CLASS = houseCollaborators.actionIconRestore
const HOUSE_NAV_SECTION_LABEL_CLASS = houseNavigation.sectionLabel
const HOUSE_NAV_LIST_CLASS = houseNavigation.list
const HOUSE_NAV_ITEM_CLASS = houseNavigation.item
const HOUSE_NAV_ITEM_ACTIVE_CLASS = houseNavigation.itemActive
const HOUSE_NAV_ITEM_WORKSPACE_CLASS = getHouseNavToneClass('workspace')
const HOUSE_NAV_ITEM_LABEL_CLASS = houseNavigation.itemLabel
const HOUSE_NAV_ITEM_META_GROUP_CLASS = houseNavigation.itemMetaGroup
const HOUSE_NAV_ITEM_META_CLASS = houseNavigation.itemMeta
const HOUSE_NAV_ITEM_COUNT_CLASS = houseNavigation.itemCount
const HOUSE_DRILLDOWN_SHEET_CLASS = houseDrilldown.sheet
const HOUSE_DRILLDOWN_SHEET_BODY_CLASS = houseDrilldown.sheetBody
const HOUSE_WORKSPACE_TONE_CLASS = getHouseLeftBorderToneClass('workspace')
const HOUSE_DRILLDOWN_ACTION_CLASS = houseDrilldown.action
const HOUSE_DRILLDOWN_SECTION_LABEL_CLASS = houseDrilldown.sectionLabel
const HOUSE_DRILLDOWN_TAB_LIST_CLASS = houseDrilldown.tabList
const HOUSE_DRILLDOWN_TAB_TRIGGER_CLASS = houseDrilldown.tabTrigger
const HOUSE_DRILLDOWN_COLLAPSIBLE_SECTION_CLASS = houseDrilldown.collapsibleSection
const HOUSE_DRILLDOWN_COLLAPSIBLE_ENTITY_CLASS = houseDrilldown.collapsibleEntity
const WORKSPACE_ICON_BUTTON_DIMENSION_CLASS = 'h-8 w-8 p-0'
const HOUSE_SECTION_TOOLS_CLASS = houseActions.sectionTools
const HOUSE_SECTION_TOOLS_WORKSPACE_CLASS = houseActions.sectionToolsWorkspace
const HOUSE_SECTION_TOOLS_DATA_CLASS = houseActions.sectionToolsData
const HOUSE_SECTION_TOOL_BUTTON_CLASS = houseActions.sectionToolButton
const HOUSE_SECTION_TOOL_TOGGLE_CLASS = houseActions.sectionToolToggle
const HOUSE_SECTION_TOOL_TOGGLE_ON_CLASS = houseActions.sectionToolToggleOn
const HOUSE_SECTION_TOOL_TOGGLE_OFF_CLASS = houseActions.sectionToolToggleOff
const HOUSE_ACTIONS_PILL_CLASS = houseActions.actionPill
const HOUSE_ACTIONS_PILL_PRIMARY_CLASS = houseActions.actionPillPrimary
const HOUSE_ACTIONS_PILL_TABLE_BODY_TEXT_CLASS = houseActions.actionPillTableBodyText
const HOUSE_ACTIONS_PILL_ICON_GROUP_CLASS = houseActions.actionPillIconGroup
const HOUSE_ACTIONS_PILL_ICON_CLASS = houseActions.actionPillIcon
const HOUSE_WORKSPACE_TABLE_SHELL_CLASS = 'house-workspaces-table-shell'
const HOUSE_WORKSPACE_FILTER_SELECT_CLASS = cn(
  'h-9 w-auto rounded-md px-2',
  HOUSE_TABLE_FILTER_SELECT_CLASS,
)

type WorkspaceInboxSignal = {
  unreadCount: number
  firstUnreadMessageId: string | null
  lastActivityAt: string
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

function formatAuditCompactTimestamp(value: string): string {
  const parsed = Date.parse(value)
  if (Number.isNaN(parsed)) {
    return 'Not available'
  }
  return new Date(parsed)
    .toLocaleString('en-GB', {
      day: '2-digit',
      month: '2-digit',
      year: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    })
    .replace(',', '')
}

function isRecentWorkspace(value: string): boolean {
  const parsed = Date.parse(value)
  if (Number.isNaN(parsed)) {
    return false
  }
  const fourteenDaysMs = 14 * 24 * 60 * 60 * 1000
  return Date.now() - parsed <= fourteenDaysMs
}

function workspaceStage(workspace: WorkspaceRecord): string {
  if (workspace.archived) {
    return 'Archived'
  }
  if (workspace.health === 'red') {
    return 'QC'
  }
  if (workspace.health === 'amber') {
    return 'Plan'
  }
  return 'Draft'
}

function workspaceStatus(workspace: WorkspaceRecord): 'Active' | 'Archived' {
  return workspace.archived ? 'Archived' : 'Active'
}

function normalizePerson(value: string | null | undefined): string {
  return (value || '').trim().replace(/\s+/g, ' ').toLowerCase()
}

function parseCenterView(value: string | null): CenterView {
  if (value === 'invitations') {
    return 'invitations'
  }
  if (value === 'data-library') {
    return 'data-library'
  }
  return 'workspaces'
}

function parseFilterKey(value: string | null): FilterKey {
  if (value === 'active' || value === 'pinned' || value === 'archived' || value === 'recent') {
    return value
  }
  return 'all'
}

function parseSortColumn(value: string | null): SortColumn {
  if (value === 'name' || value === 'stage' || value === 'status') {
    return value
  }
  return 'updatedAt'
}

function parseSortDirection(value: string | null): SortDirection {
  return value === 'asc' ? 'asc' : 'desc'
}

function parseViewMode(value: string | null): ViewMode {
  return value === 'cards' ? 'cards' : 'table'
}

function normalizeCollaboratorName(value: string | null | undefined): string {
  return (value || '').trim().replace(/\s+/g, ' ')
}

function normalizeCollaboratorRoleValue(value: string | null | undefined): WorkspaceCollaboratorRole | null {
  const clean = (value || '').trim().toLowerCase()
  if (clean === 'editor' || clean === 'reviewer' || clean === 'viewer') {
    return clean
  }
  return null
}

function collaboratorRoleLabel(role: WorkspaceCollaboratorRole): string {
  return role === 'reviewer' ? 'Reviewer' : role === 'viewer' ? 'Viewer' : 'Editor'
}

function collaboratorStatusTransitionAuditMessage(input: {
  collaboratorName: string
  fromStatus: CollaboratorAccessStatus
  toStatus: CollaboratorAccessStatus
  actorName: string
  role?: WorkspaceCollaboratorRole
}): string {
  const collaboratorName = normalizeCollaboratorName(input.collaboratorName) || 'Collaborator'
  const actorName = normalizeCollaboratorName(input.actorName) || 'Unknown user'
  const roleSuffix = input.role ? ` Role set to ${input.role}.` : ''
  return `${collaboratorName} collaborator status switched from ${input.fromStatus} to ${input.toStatus} by ${actorName}.${roleSuffix}`
}

function collaboratorRoleTransitionAuditMessage(input: {
  collaboratorName: string
  fromRole: WorkspaceCollaboratorRole
  toRole: WorkspaceCollaboratorRole
  actorName: string
  pending?: boolean
}): string {
  const collaboratorName = normalizeCollaboratorName(input.collaboratorName) || 'Collaborator'
  const actorName = normalizeCollaboratorName(input.actorName) || 'Unknown user'
  const scope = input.pending ? 'pending collaborator role' : 'collaborator role'
  return `${collaboratorName} ${scope} switched from ${input.fromRole} to ${input.toRole} by ${actorName}.`
}

function isWorkspaceOwner(workspace: WorkspaceRecord, currentUserName: string | null): boolean {
  const cleanCurrentUser = normalizeCollaboratorName(currentUserName).toLowerCase()
  if (!cleanCurrentUser) {
    return false
  }
  return normalizeCollaboratorName(workspace.ownerName).toLowerCase() === cleanCurrentUser
}

function workspaceOwnerLabel(workspace: WorkspaceRecord, _currentUserName: string | null): string {
  void _currentUserName
  const ownerName = normalizeCollaboratorName(workspace.ownerName) || 'Unknown'
  return `${ownerName} (Owner)`
}

function isWorkspaceReadOnlyForCurrentUser(workspace: WorkspaceRecord, currentUserName: string | null): boolean {
  const cleanCurrentUser = normalizeCollaboratorName(currentUserName).toLowerCase()
  if (!cleanCurrentUser) {
    return false
  }
  const removed = collaboratorRemovedSet(workspace)
  return removed.has(cleanCurrentUser)
}

type ParsedAuditTransition = {
  subject: string
  fromRawValue: string
  toRawValue: string
  fromValue: string
  toValue: string
  actorName: string
  sectionLabel: string
  transitionKind: 'access_status' | 'invitation_status' | 'role' | 'pending_role'
  roleDetail: string | null
}

type ParsedConversationAuditEvent = {
  messageId: string
  senderName: string
  createdAtRaw: string
  ciphertextLength: number
  ivLength: number
}

type CollaboratorAuditPresentationEntry = {
  actorName: string
  entry: WorkspaceAuditEntry
  parsedTransition: ParsedAuditTransition | null
  timestampMs: number
}

type CollaboratorAuditActorGroup = {
  actorName: string
  entries: CollaboratorAuditPresentationEntry[]
}

type ConversationAuditPresentationEntry = {
  actorName: string
  entry: WorkspaceAuditEntry
  parsedEvent: ParsedConversationAuditEvent | null
  timestampMs: number
}

type ConversationAuditActorGroup = {
  actorName: string
  entries: ConversationAuditPresentationEntry[]
}

type CollaboratorAuditFilter =
  | 'all'
  | 'access_status'
  | 'role_changes'
  | 'invitation_status'
  | 'other'

const COLLABORATOR_AUDIT_FILTER_OPTIONS: Array<{ value: CollaboratorAuditFilter; label: string }> = [
  { value: 'all', label: 'All' },
  { value: 'access_status', label: 'Access' },
  { value: 'role_changes', label: 'Roles' },
  { value: 'invitation_status', label: 'Invites' },
  { value: 'other', label: 'Other' },
]

function humanizeAuditValue(value: string): string {
  const clean = (value || '').trim().replace(/_/g, ' ')
  if (!clean) {
    return 'Unknown'
  }
  return clean.replace(/\b\w/g, (char) => char.toUpperCase())
}

function auditTimestampMs(value: string): number {
  const parsed = Date.parse(value)
  if (Number.isNaN(parsed)) {
    return 0
  }
  return parsed
}

function compareAuditActorNames(left: string, right: string): number {
  return left.localeCompare(right, undefined, { sensitivity: 'base' })
}

function parseActorNameFromAuditMessage(message: string): string {
  const cleanMessage = normalizeCollaboratorName(message)
  if (!cleanMessage) {
    return 'System'
  }
  const byMatch = cleanMessage.match(/\bby (.*?)\.(?:\s|$)/i)
  if (byMatch) {
    const actorName = normalizeCollaboratorName(byMatch[1])
    if (actorName) {
      return actorName
    }
  }
  return 'System'
}

function parseCollaboratorNameFromAuditMessage(message: string): string | null {
  const cleanMessage = normalizeCollaboratorName(message)
  if (!cleanMessage) {
    return null
  }
  const collaboratorMatch = cleanMessage.match(/^(.*?) collaborator(?:\s|$)/i)
  if (!collaboratorMatch) {
    return null
  }
  const collaboratorName = normalizeCollaboratorName(collaboratorMatch[1])
  return collaboratorName || null
}

function formatAuditActorHeaderName(actorName: string): string {
  const clean = normalizeCollaboratorName(actorName)
  if (!clean) {
    return 'System'
  }
  return clean.replace(/\s+\(owner\)$/i, '')
}

function auditActorKey(actorName: string): string {
  return normalizeCollaboratorName(actorName).toLowerCase() || 'system'
}

function formatAuditTransitionDisplayValue(
  transition: ParsedAuditTransition,
  rawValue: string,
  displayValue: string,
): string {
  void transition
  const raw = rawValue.trim().toLowerCase()
  if (raw === 'accepted') {
    return 'Active'
  }
  if (raw === 'cancelled') {
    return 'Cancelled'
  }
  return displayValue
}

function roleAwareStatusLabel(
  rawValue: string,
  displayValue: string,
  roleDetail: string | null,
): string {
  const raw = rawValue.trim().toLowerCase()
  if (roleDetail && (raw === 'pending' || raw === 'active' || raw === 'accepted')) {
    return roleDetail
  }
  return displayValue
}

type AuditTransitionPillPresentation = {
  fromLabel: string | null
  toLabel: string
  fromRawValue: string | null
  toRawValue: string
  showArrow: boolean
}

function buildAuditTransitionPillPresentation(
  transition: ParsedAuditTransition,
): AuditTransitionPillPresentation {
  if (transition.transitionKind === 'pending_role') {
    return {
      fromLabel: transition.fromValue,
      toLabel: transition.toValue,
      fromRawValue: 'pending',
      toRawValue: 'pending',
      showArrow: true,
    }
  }

  if (transition.transitionKind === 'role') {
    return {
      fromLabel: transition.fromValue,
      toLabel: transition.toValue,
      fromRawValue: 'active',
      toRawValue: 'active',
      showArrow: true,
    }
  }

  if (transition.roleDetail) {
    const fromBaseLabel = formatAuditTransitionDisplayValue(
      transition,
      transition.fromRawValue,
      transition.fromValue,
    )
    const toBaseLabel = formatAuditTransitionDisplayValue(
      transition,
      transition.toRawValue,
      transition.toValue,
    )
    const fromLabel = roleAwareStatusLabel(
      transition.fromRawValue,
      fromBaseLabel,
      transition.roleDetail,
    )
    const toLabel = roleAwareStatusLabel(
      transition.toRawValue,
      toBaseLabel,
      transition.roleDetail,
    )

    if (transition.fromRawValue === 'none' && transition.toRawValue === 'pending') {
      return {
        fromLabel: null,
        toLabel,
        fromRawValue: null,
        toRawValue: transition.toRawValue,
        showArrow: false,
      }
    }

    if (transition.fromRawValue === transition.toRawValue && fromLabel === toLabel) {
      return {
        fromLabel: null,
        toLabel,
        fromRawValue: null,
        toRawValue: transition.toRawValue,
        showArrow: false,
      }
    }

    return {
      fromLabel,
      toLabel,
      fromRawValue: transition.fromRawValue,
      toRawValue: transition.toRawValue,
      showArrow: true,
    }
  }

  const fromLabel = formatAuditTransitionDisplayValue(
    transition,
    transition.fromRawValue,
    transition.fromValue,
  )
  const toLabel = formatAuditTransitionDisplayValue(
    transition,
    transition.toRawValue,
    transition.toValue,
  )
  if (transition.fromRawValue === transition.toRawValue) {
    return {
      fromLabel: null,
      toLabel,
      fromRawValue: null,
      toRawValue: transition.toRawValue,
      showArrow: false,
    }
  }
  return {
    fromLabel,
    toLabel,
    fromRawValue: transition.fromRawValue,
    toRawValue: transition.toRawValue,
    showArrow: true,
  }
}

function auditTransitionStatePillClassName(
  transition: ParsedAuditTransition,
  rawValue: string,
): string {
  const raw = rawValue.trim().toLowerCase()
  if (raw === 'pending') {
    return cn(HOUSE_COLLABORATOR_CHIP_CLASS, HOUSE_COLLABORATOR_CHIP_PENDING_CLASS)
  }
  if (raw === 'active' || raw === 'accepted') {
    return cn(HOUSE_COLLABORATOR_CHIP_CLASS, HOUSE_COLLABORATOR_CHIP_ACTIVE_CLASS)
  }
  if (raw === 'removed' || raw === 'declined' || raw === 'cancelled') {
    return cn(HOUSE_COLLABORATOR_CHIP_CLASS, HOUSE_COLLABORATOR_CHIP_REMOVED_CLASS)
  }
  if (transition.transitionKind === 'invitation_status' && raw === 'accepted') {
    return cn(HOUSE_COLLABORATOR_CHIP_CLASS, HOUSE_COLLABORATOR_CHIP_ACTIVE_CLASS)
  }
  return cn(HOUSE_COLLABORATOR_CHIP_CLASS, 'border-border/70 bg-background/80 text-foreground')
}

function parseAuditTransition(message: string): ParsedAuditTransition | null {
  const cleanMessage = normalizeCollaboratorName(message)
  if (!cleanMessage) {
    return null
  }

  const statusMatch = cleanMessage.match(
    /^(.*?) collaborator(?: invitation)? status switched from ([a-z_]+) to ([a-z_]+) by (.*?)(?: as ([a-z_]+))?\.(?: Role set to ([a-z_]+)\.)?$/i,
  )
  if (statusMatch) {
    const subject = normalizeCollaboratorName(statusMatch[1]) || 'Collaborator'
    const fromRawValue = (statusMatch[2] || '').trim().toLowerCase()
    const toRawValue = (statusMatch[3] || '').trim().toLowerCase()
    const fromValue = humanizeAuditValue(fromRawValue)
    const toValue = humanizeAuditValue(toRawValue)
    const actorName = normalizeCollaboratorName(statusMatch[4]) || 'Unknown user'
    const roleDetailSource = statusMatch[6] || statusMatch[5] || ''
    const roleDetail = roleDetailSource ? humanizeAuditValue(roleDetailSource) : null
    const isInvitationStatus = cleanMessage.toLowerCase().includes('invitation status')
    const sectionLabel = isInvitationStatus ? 'Invitation status' : 'Access status'
    return {
      subject,
      fromRawValue,
      toRawValue,
      fromValue,
      toValue,
      actorName,
      sectionLabel,
      transitionKind: isInvitationStatus ? 'invitation_status' : 'access_status',
      roleDetail,
    }
  }

  const roleMatch = cleanMessage.match(
    /^(.*?) (pending )?collaborator role switched from ([a-z_]+) to ([a-z_]+) by (.*?)\.$/i,
  )
  if (roleMatch) {
    const subject = normalizeCollaboratorName(roleMatch[1]) || 'Collaborator'
    const isPendingRole = Boolean((roleMatch[2] || '').trim())
    const fromRawValue = (roleMatch[3] || '').trim().toLowerCase()
    const toRawValue = (roleMatch[4] || '').trim().toLowerCase()
    const fromValue = humanizeAuditValue(fromRawValue)
    const toValue = humanizeAuditValue(toRawValue)
    const actorName = normalizeCollaboratorName(roleMatch[5]) || 'Unknown user'
    return {
      subject,
      fromRawValue,
      toRawValue,
      fromValue,
      toValue,
      actorName,
      sectionLabel: isPendingRole ? 'Pending role' : 'Role',
      transitionKind: isPendingRole ? 'pending_role' : 'role',
      roleDetail: null,
    }
  }

  return null
}

function isConversationAuditEntry(entry: WorkspaceAuditEntry): boolean {
  const cleanMessage = normalizeCollaboratorName(entry.message).toLowerCase()
  return cleanMessage.startsWith('inbox message logged:')
}

function parseConversationAuditEvent(message: string): ParsedConversationAuditEvent | null {
  const cleanMessage = normalizeCollaboratorName(message)
  if (!cleanMessage) {
    return null
  }
  const match = cleanMessage.match(
    /^Inbox message logged: id (.*?), sender (.*?), created_at (.*?), ciphertext_length (\d+), iv_length (\d+)\.$/i,
  )
  if (!match) {
    return null
  }
  const ciphertextLength = Number.parseInt(match[4] || '0', 10)
  const ivLength = Number.parseInt(match[5] || '0', 10)
  return {
    messageId: normalizeCollaboratorName(match[1]) || 'unknown',
    senderName: normalizeCollaboratorName(match[2]) || 'Unknown sender',
    createdAtRaw: normalizeCollaboratorName(match[3]) || '',
    ciphertextLength: Number.isFinite(ciphertextLength) ? ciphertextLength : 0,
    ivLength: Number.isFinite(ivLength) ? ivLength : 0,
  }
}

function isRoleChangeAuditEntry(entry: WorkspaceAuditEntry): boolean {
  const cleanMessage = normalizeCollaboratorName(entry.message).toLowerCase()
  return cleanMessage.includes('collaborator role switched from')
}

function isInvitationStatusAuditEntry(entry: WorkspaceAuditEntry): boolean {
  const cleanMessage = normalizeCollaboratorName(entry.message).toLowerCase()
  return cleanMessage.includes('collaborator invitation status switched from')
}

function isAccessStatusAuditEntry(entry: WorkspaceAuditEntry): boolean {
  const cleanMessage = normalizeCollaboratorName(entry.message).toLowerCase()
  return (
    cleanMessage.includes('collaborator status switched from') &&
    !cleanMessage.includes('collaborator invitation status switched from')
  )
}

function matchesCollaboratorAuditLogFilter(
  entry: WorkspaceAuditEntry,
  filter: CollaboratorAuditFilter,
): boolean {
  if (filter === 'all') {
    return true
  }
  if (filter === 'access_status') {
    return isAccessStatusAuditEntry(entry)
  }
  if (filter === 'role_changes') {
    return isRoleChangeAuditEntry(entry)
  }
  if (filter === 'invitation_status') {
    return isInvitationStatusAuditEntry(entry)
  }
  if (filter === 'other') {
    return (
      !isAccessStatusAuditEntry(entry) &&
      !isRoleChangeAuditEntry(entry) &&
      !isInvitationStatusAuditEntry(entry)
    )
  }
  return true
}

function collaboratorRemovedSet(workspace: WorkspaceRecord): Set<string> {
  return new Set((workspace.removedCollaborators || []).map((value) => normalizeCollaboratorName(value).toLowerCase()))
}

function collaboratorPendingSet(workspace: WorkspaceRecord): Set<string> {
  return new Set((workspace.pendingCollaborators || []).map((value) => normalizeCollaboratorName(value).toLowerCase()))
}

function collaboratorRoleByKey(
  roles: Record<string, WorkspaceCollaboratorRole> | undefined,
): Map<string, WorkspaceCollaboratorRole> {
  const output = new Map<string, WorkspaceCollaboratorRole>()
  for (const [name, role] of Object.entries(roles || {})) {
    const clean = normalizeCollaboratorName(name)
    if (!clean) {
      continue
    }
    output.set(clean.toLowerCase(), role)
  }
  return output
}

function workspaceCollaboratorChips(workspace: WorkspaceRecord): CollaboratorChipEntry[] {
  const removed = collaboratorRemovedSet(workspace)
  const pending = collaboratorPendingSet(workspace)
  const activeRoleByKey = collaboratorRoleByKey(workspace.collaboratorRoles)
  const pendingRoleByKey = collaboratorRoleByKey(workspace.pendingCollaboratorRoles)
  const seen = new Set<string>()
  const chips: CollaboratorChipEntry[] = []

  for (const collaborator of workspace.collaborators || []) {
    const clean = normalizeCollaboratorName(collaborator)
    if (!clean) {
      continue
    }
    const key = clean.toLowerCase()
    if (seen.has(key)) {
      continue
    }
    seen.add(key)
    const state: CollaboratorChipState = pending.has(key)
      ? 'pending'
      : removed.has(key)
        ? 'removed'
        : 'active'
    chips.push({
      key,
      name: clean,
      state,
      role: pending.has(key)
        ? pendingRoleByKey.get(key) || activeRoleByKey.get(key) || 'editor'
        : activeRoleByKey.get(key) || 'editor',
    })
  }

  for (const collaborator of workspace.pendingCollaborators || []) {
    const clean = normalizeCollaboratorName(collaborator)
    if (!clean) {
      continue
    }
    const key = clean.toLowerCase()
    if (seen.has(key)) {
      continue
    }
    seen.add(key)
    chips.push({
      key,
      name: clean,
      state: 'pending',
      role: pendingRoleByKey.get(key) || 'editor',
    })
  }

  for (const collaborator of workspace.removedCollaborators || []) {
    const clean = normalizeCollaboratorName(collaborator)
    if (!clean) {
      continue
    }
    const key = clean.toLowerCase()
    if (seen.has(key)) {
      continue
    }
    seen.add(key)
    chips.push({
      key,
      name: clean,
      state: 'removed',
      role: activeRoleByKey.get(key) || pendingRoleByKey.get(key) || 'editor',
    })
  }

  return chips
}

function stageRank(stage: string): number {
  if (stage === 'Plan') {
    return 1
  }
  if (stage === 'Draft') {
    return 2
  }
  if (stage === 'QC') {
    return 3
  }
  return 4
}

function statusRank(status: 'Active' | 'Archived'): number {
  return status === 'Active' ? 1 : 2
}

function unreadToneClass(unreadCount: number): string {
  return unreadCount > 0
    ? 'border-amber-300 bg-amber-50 text-amber-800'
    : 'border-emerald-300 bg-emerald-50 text-emerald-800'
}

function sortWorkspaces(
  workspaces: WorkspaceRecord[],
  sortColumn: SortColumn,
  sortDirection: SortDirection,
): WorkspaceRecord[] {
  const next = [...workspaces]
  const direction = sortDirection === 'asc' ? 1 : -1

  next.sort((a, b) => {
    if (sortColumn === 'name') {
      return a.name.localeCompare(b.name) * direction
    }
    if (sortColumn === 'updatedAt') {
      return (Date.parse(a.updatedAt) - Date.parse(b.updatedAt)) * direction
    }
    if (sortColumn === 'stage') {
      return (stageRank(workspaceStage(a)) - stageRank(workspaceStage(b))) * direction
    }
    return (statusRank(workspaceStatus(a)) - statusRank(workspaceStatus(b))) * direction
  })

  return next
}

function WorkspacesDrilldownPanel({
  selectedWorkspaceId,
  selectedWorkspaceName,
  selectedWorkspace,
  selectedWorkspaceReadOnly,
  currentWorkspaceUserName,
  collaboratorChips,
  workspaceAuditEntries,
  canManageSelectedWorkspace,
  collaboratorComposerOpen,
  collaboratorInviteRole,
  collaboratorQuery,
  canConfirmAddCollaborator,
  onOpenCollaboratorComposer,
  onCollaboratorInviteRoleChange,
  onChangeCollaboratorRole,
  onCancelPendingCollaboratorInvitation,
  onToggleCollaboratorRemoved,
  onCollaboratorQueryChange,
  onConfirmAddCollaborator,
  onOpenSelectedWorkspace,
}: {
  selectedWorkspaceId: string | null
  selectedWorkspaceName: string | null
  selectedWorkspace: WorkspaceRecord | null
  selectedWorkspaceReadOnly: boolean
  currentWorkspaceUserName: string | null
  collaboratorChips: CollaboratorChipEntry[]
  workspaceAuditEntries: WorkspaceAuditEntry[]
  canManageSelectedWorkspace: boolean
  collaboratorComposerOpen: boolean
  collaboratorInviteRole: WorkspaceCollaboratorRole
  collaboratorQuery: string
  canConfirmAddCollaborator: boolean
  onOpenCollaboratorComposer: () => void
  onCollaboratorInviteRoleChange: (role: WorkspaceCollaboratorRole) => void
  onChangeCollaboratorRole: (
    name: string,
    state: CollaboratorChipState,
    role: WorkspaceCollaboratorRole,
  ) => void
  onCancelPendingCollaboratorInvitation: (collaboratorName: string) => void
  onToggleCollaboratorRemoved: (
    workspace: WorkspaceRecord,
    collaboratorName: string,
    options?: ToggleCollaboratorRemovedOptions,
  ) => void
  onCollaboratorQueryChange: (value: string) => void
  onConfirmAddCollaborator: () => void
  onOpenSelectedWorkspace: (workspaceId: string) => void
}) {
  const selectedLabel = selectedWorkspaceName?.trim() || ''
  const canOpenSelectedWorkspace = Boolean(
    selectedWorkspaceId && selectedLabel && !selectedWorkspaceReadOnly,
  )
  const canAddCollaborator = Boolean(selectedWorkspace && canManageSelectedWorkspace)
  const ownerDisplayName = selectedWorkspace
    ? workspaceOwnerLabel(selectedWorkspace, currentWorkspaceUserName)
    : 'Unknown owner (Owner)'
  const [roleEditorKey, setRoleEditorKey] = useState<string | null>(null)
  const [roleEditorDraftRole, setRoleEditorDraftRole] = useState<WorkspaceCollaboratorRole | null>(null)
  const [restoreEditorKey, setRestoreEditorKey] = useState<string | null>(null)
  const [restoreEditorRole, setRestoreEditorRole] = useState<WorkspaceCollaboratorRole | null>(null)
  const [collaboratorAuditFilter, setCollaboratorAuditFilter] = useState<CollaboratorAuditFilter>('all')
  const [collaboratorActivityCollapsed, setCollaboratorActivityCollapsed] = useState(true)
  const [conversationActivityCollapsed, setConversationActivityCollapsed] = useState(true)
  const [removalConfirmKey, setRemovalConfirmKey] = useState<string | null>(null)
  const [collaboratorActorExpanded, setCollaboratorActorExpanded] = useState<Record<string, boolean>>({})
  const sortedAuditEntries = [...workspaceAuditEntries]
    .sort((left, right) => Date.parse(left.createdAt) - Date.parse(right.createdAt))
  const collaboratorActivityEntries = sortedAuditEntries
    .filter((entry) => !isConversationAuditEntry(entry))
    .filter((entry) =>
      matchesCollaboratorAuditLogFilter(entry, collaboratorAuditFilter),
    )
  const conversationActivityEntries = sortedAuditEntries.filter(
    (entry) => isConversationAuditEntry(entry),
  )
  const collaboratorActivityGroups = useMemo<CollaboratorAuditActorGroup[]>(() => {
    const groups = new Map<string, CollaboratorAuditActorGroup>()
    collaboratorActivityEntries.forEach((entry) => {
      const parsedTransition = parseAuditTransition(entry.message)
      const collaboratorName =
        parsedTransition?.subject ||
        parseCollaboratorNameFromAuditMessage(entry.message) ||
        'General'
      const actorKey = normalizeCollaboratorName(collaboratorName).toLowerCase() || 'general'
      const item: CollaboratorAuditPresentationEntry = {
        actorName: collaboratorName,
        entry,
        parsedTransition,
        timestampMs: auditTimestampMs(entry.createdAt),
      }
      const current = groups.get(actorKey)
      if (current) {
        current.entries.push(item)
        return
      }
      groups.set(actorKey, {
        actorName: collaboratorName,
        entries: [item],
      })
    })
    return [...groups.values()]
      .map((group) => ({
        ...group,
        entries: [...group.entries].sort(
          (left, right) =>
            left.timestampMs - right.timestampMs || left.entry.id.localeCompare(right.entry.id),
        ),
      }))
      .sort((left, right) => compareAuditActorNames(left.actorName, right.actorName))
  }, [collaboratorActivityEntries])
  const conversationActivityGroups = useMemo<ConversationAuditActorGroup[]>(() => {
    const groups = new Map<string, ConversationAuditActorGroup>()
    conversationActivityEntries.forEach((entry) => {
      const parsedEvent = parseConversationAuditEvent(entry.message)
      const actorName = parsedEvent?.senderName || parseActorNameFromAuditMessage(entry.message)
      const actorKey = normalizeCollaboratorName(actorName).toLowerCase() || 'system'
      const item: ConversationAuditPresentationEntry = {
        actorName,
        entry,
        parsedEvent,
        timestampMs: auditTimestampMs(entry.createdAt),
      }
      const current = groups.get(actorKey)
      if (current) {
        current.entries.push(item)
        return
      }
      groups.set(actorKey, {
        actorName,
        entries: [item],
      })
    })
    return [...groups.values()]
      .map((group) => ({
        ...group,
        entries: [...group.entries].sort(
          (left, right) =>
            right.timestampMs - left.timestampMs || right.entry.id.localeCompare(left.entry.id),
        ),
      }))
      .sort((left, right) => compareAuditActorNames(left.actorName, right.actorName))
  }, [conversationActivityEntries])
  const showConversationActorHeaders = conversationActivityGroups.length > 1
  const clampCollaboratorActivityList = collaboratorActivityEntries.length > 6
  const clampConversationActivityList = conversationActivityEntries.length > 6

  useEffect(() => {
    setRoleEditorKey(null)
    setRoleEditorDraftRole(null)
    setRestoreEditorKey(null)
    setRestoreEditorRole(null)
    setCollaboratorAuditFilter('all')
    setCollaboratorActivityCollapsed(true)
    setConversationActivityCollapsed(true)
    setRemovalConfirmKey(null)
    setCollaboratorActorExpanded({})
  }, [selectedWorkspaceId])

  const onToggleCollaboratorActivitySection = () => {
    if (collaboratorActivityCollapsed) {
      setCollaboratorActivityCollapsed(false)
      setConversationActivityCollapsed(true)
      return
    }
    setCollaboratorActivityCollapsed(true)
  }

  const onToggleConversationActivitySection = () => {
    if (conversationActivityCollapsed) {
      setConversationActivityCollapsed(false)
      setCollaboratorActivityCollapsed(true)
      return
    }
    setConversationActivityCollapsed(true)
  }

  return (
    <div className={cn(HOUSE_DRILLDOWN_SHEET_BODY_CLASS, HOUSE_WORKSPACE_TONE_CLASS)}>
      <div className={HOUSE_LEFT_BORDER_CLASS}>
        <h2 className={HOUSE_SECTION_TITLE_CLASS}>Manage workspace</h2>
      </div>
      <div className="w-full">
        <Button
          type="button"
          variant="primary"
          onClick={() => {
            if (!selectedWorkspaceId || !canOpenSelectedWorkspace) {
              return
            }
            onOpenSelectedWorkspace(selectedWorkspaceId)
          }}
          className={cn(
            'w-full justify-center px-3',
            HOUSE_PRIMARY_ACTION_BUTTON_CLASS,
            HOUSE_BUTTON_TEXT_CLASS,
            HOUSE_ACTIONS_PILL_TABLE_BODY_TEXT_CLASS,
          )}
          disabled={!canOpenSelectedWorkspace}
        >
          <span className="truncate">
            {canOpenSelectedWorkspace
              ? `Open ${selectedLabel} Workspace`
              : selectedWorkspaceReadOnly
                ? 'Workspace is archived (read-only)'
                : 'Select workspace'}
          </span>
        </Button>
      </div>
      {selectedWorkspaceReadOnly ? (
        <p className={HOUSE_FIELD_HELPER_CLASS}>
          Removed access detected. This workspace is archived and read-only.
        </p>
      ) : null}
      <p className={cn(HOUSE_DRILLDOWN_SECTION_LABEL_CLASS, 'pl-3')}>Workspace data</p>

      <div className="space-y-2">
        <div className="flex items-center justify-between gap-2">
          <p className={cn(HOUSE_DRILLDOWN_SECTION_LABEL_CLASS, 'pl-3')}>Collaborators</p>
        </div>
        <div className="min-h-6">
          {selectedWorkspace ? (
            <div className="space-y-1.5">
              <div className="flex items-center justify-between gap-2">
                <span
                  className={cn(
                    HOUSE_COLLABORATOR_CHIP_CLASS,
                    HOUSE_COLLABORATOR_CHIP_ACTIVE_CLASS,
                    HOUSE_COLLABORATOR_CHIP_READONLY_CLASS,
                  )}
                >
                  {ownerDisplayName}
                </span>
                <span className={HOUSE_FIELD_HELPER_CLASS}>Owner</span>
              </div>
              {collaboratorChips.map((chip) => (
                (() => {
                  const isRoleEditorOpen =
                    canManageSelectedWorkspace &&
                    roleEditorKey === chip.key &&
                    chip.state !== 'removed'
                  const isRestoreEditorOpen =
                    canManageSelectedWorkspace &&
                    chip.state === 'removed' &&
                    restoreEditorKey === chip.key
                  const roleEditorCurrentRole = roleEditorDraftRole || chip.role
                  const hasRoleEditorChanges =
                    isRoleEditorOpen && roleEditorCurrentRole !== chip.role
                  const isRemovalAwaitingConfirm =
                    canManageSelectedWorkspace &&
                    chip.state === 'active' &&
                    removalConfirmKey === chip.key
                  return (
                    <div key={chip.key} className="flex items-center justify-between gap-2">
                      <span
                        className={cn(
                          HOUSE_COLLABORATOR_CHIP_CLASS,
                          chip.state === 'pending'
                            ? HOUSE_COLLABORATOR_CHIP_PENDING_CLASS
                            : chip.state === 'removed'
                              ? HOUSE_COLLABORATOR_CHIP_REMOVED_CLASS
                              : HOUSE_COLLABORATOR_CHIP_ACTIVE_CLASS,
                          HOUSE_COLLABORATOR_CHIP_READONLY_CLASS,
                        )}
                      >
                        {chip.state === 'pending' ? `${chip.name} (pending)` : chip.name}
                      </span>
                      <div className="flex items-center gap-1.5">
                        {isRoleEditorOpen ? (
                          <div className="flex items-center gap-1">
                            <SelectPrimitive
                              value={roleEditorCurrentRole}
                              onValueChange={(value) => {
                                const nextRole = normalizeCollaboratorRoleValue(value)
                                if (!nextRole) {
                                  return
                                }
                                setRoleEditorDraftRole(nextRole)
                              }}
                            >
                              <SelectTrigger className="h-8 w-auto min-w-sz-110 px-2 text-xs">
                                <SelectValue placeholder="Select role" />
                              </SelectTrigger>
                              <SelectContent>
                                {COLLABORATOR_ROLE_OPTIONS.map((option) => (
                                  <SelectItem key={option.value} value={option.value}>
                                    {option.label}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </SelectPrimitive>
                            <button
                              type="button"
                              className={cn(
                                HOUSE_COLLABORATOR_ACTION_ICON_CLASS,
                                hasRoleEditorChanges
                                  ? HOUSE_COLLABORATOR_ACTION_ICON_CONFIRM_CLASS
                                  : HOUSE_COLLABORATOR_ACTION_ICON_EDIT_CLASS,
                              )}
                              onClick={() => {
                                if (hasRoleEditorChanges) {
                                  onChangeCollaboratorRole(
                                    chip.name,
                                    chip.state,
                                    roleEditorCurrentRole,
                                  )
                                }
                                setRoleEditorKey(null)
                                setRoleEditorDraftRole(null)
                                setRestoreEditorKey(null)
                                setRestoreEditorRole(null)
                                setRemovalConfirmKey(null)
                              }}
                              aria-label={
                                hasRoleEditorChanges
                                  ? `Apply role change for ${chip.name}`
                                  : `Cancel role change for ${chip.name}`
                              }
                              title={hasRoleEditorChanges ? 'Apply role change' : 'Cancel role change'}
                            >
                              <Check className="h-4 w-4" />
                            </button>
                            <button
                              type="button"
                              className={cn(
                                HOUSE_COLLABORATOR_ACTION_ICON_CLASS,
                                HOUSE_COLLABORATOR_ACTION_ICON_EDIT_CLASS,
                              )}
                              onClick={() => {
                                setRoleEditorKey(null)
                                setRoleEditorDraftRole(null)
                                setRestoreEditorKey(null)
                                setRestoreEditorRole(null)
                                setRemovalConfirmKey(null)
                              }}
                              aria-label={`Cancel role change for ${chip.name}`}
                              title="Cancel role change"
                            >
                              <X className="h-4 w-4" />
                            </button>
                          </div>
                        ) : isRestoreEditorOpen ? (
                          <div className="flex items-center gap-1">
                            <SelectPrimitive
                              value={restoreEditorRole || '__none__'}
                              onValueChange={(value) => {
                                const nextRole = normalizeCollaboratorRoleValue(value)
                                setRestoreEditorRole(nextRole)
                              }}
                            >
                              <SelectTrigger className="h-8 w-auto min-w-sz-110 px-2 text-xs">
                                <SelectValue placeholder="Select role" />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="__none__">Select role</SelectItem>
                                {COLLABORATOR_ROLE_OPTIONS.map((option) => (
                                  <SelectItem key={option.value} value={option.value}>
                                    {option.label}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </SelectPrimitive>
                            <button
                              type="button"
                              className={cn(
                                HOUSE_COLLABORATOR_ACTION_ICON_CLASS,
                                restoreEditorRole
                                  ? HOUSE_COLLABORATOR_ACTION_ICON_CONFIRM_CLASS
                                  : HOUSE_COLLABORATOR_ACTION_ICON_EDIT_CLASS,
                              )}
                              onClick={() => {
                                if (!selectedWorkspace || !restoreEditorRole) {
                                  return
                                }
                                onToggleCollaboratorRemoved(selectedWorkspace, chip.name, {
                                  restoreRole: restoreEditorRole,
                                })
                                setRoleEditorKey(null)
                                setRoleEditorDraftRole(null)
                                setRestoreEditorKey(null)
                                setRestoreEditorRole(null)
                                setRemovalConfirmKey(null)
                              }}
                              disabled={!restoreEditorRole}
                              aria-label={`Restore ${chip.name} with selected role`}
                              title={
                                restoreEditorRole
                                  ? `Restore as ${collaboratorRoleLabel(restoreEditorRole)}`
                                  : 'Select role before restoring'
                              }
                            >
                              <Check className="h-4 w-4" />
                            </button>
                            <button
                              type="button"
                              className={cn(
                                HOUSE_COLLABORATOR_ACTION_ICON_CLASS,
                                HOUSE_COLLABORATOR_ACTION_ICON_EDIT_CLASS,
                              )}
                              onClick={() => {
                                setRoleEditorKey(null)
                                setRoleEditorDraftRole(null)
                                setRestoreEditorKey(null)
                                setRestoreEditorRole(null)
                                setRemovalConfirmKey(null)
                              }}
                              aria-label={`Cancel restore for ${chip.name}`}
                              title="Cancel restore"
                            >
                              <X className="h-4 w-4" />
                            </button>
                          </div>
                        ) : (
                          <span className={HOUSE_FIELD_HELPER_CLASS}>{collaboratorRoleLabel(chip.role)}</span>
                        )}
                        {canManageSelectedWorkspace ? (
                          isRemovalAwaitingConfirm ? (
                            <>
                              <button
                                type="button"
                                className={cn(
                                  HOUSE_COLLABORATOR_ACTION_ICON_CLASS,
                                  HOUSE_COLLABORATOR_ACTION_ICON_CONFIRM_CLASS,
                                )}
                                onClick={() => {
                                  if (!selectedWorkspace) {
                                    return
                                  }
                                  onToggleCollaboratorRemoved(
                                    selectedWorkspace,
                                    chip.name,
                                    { skipRemoveConfirmation: true },
                                  )
                                  setRemovalConfirmKey(null)
                                  setRoleEditorKey(null)
                                  setRoleEditorDraftRole(null)
                                  setRestoreEditorKey(null)
                                  setRestoreEditorRole(null)
                                }}
                                aria-label={`Confirm remove ${chip.name}`}
                                title="Confirm remove collaborator"
                              >
                                <Check className="h-4 w-4" />
                              </button>
                              <button
                                type="button"
                                className={cn(
                                  HOUSE_COLLABORATOR_ACTION_ICON_CLASS,
                                  HOUSE_COLLABORATOR_ACTION_ICON_EDIT_CLASS,
                                )}
                                onClick={() => setRemovalConfirmKey(null)}
                                aria-label={`Cancel remove ${chip.name}`}
                                title="Cancel remove collaborator"
                              >
                                <X className="h-4 w-4" />
                              </button>
                            </>
                          ) : (
                            <>
                              <button
                                type="button"
                                className={cn(
                                  HOUSE_COLLABORATOR_ACTION_ICON_CLASS,
                                  HOUSE_COLLABORATOR_ACTION_ICON_EDIT_CLASS,
                                )}
                                onClick={() => {
                                  if (chip.state === 'removed') {
                                    return
                                  }
                                  if (roleEditorKey === chip.key) {
                                    setRoleEditorKey(null)
                                    setRoleEditorDraftRole(null)
                                    setRestoreEditorKey(null)
                                    setRestoreEditorRole(null)
                                    return
                                  }
                                  setRoleEditorKey(chip.key)
                                  setRoleEditorDraftRole(chip.role)
                                  setRestoreEditorKey(null)
                                  setRestoreEditorRole(null)
                                  setRemovalConfirmKey(null)
                                }}
                                disabled={chip.state === 'removed'}
                                aria-label={`Edit role for ${chip.name}`}
                                title={chip.state === 'removed' ? 'Restore collaborator to edit role.' : 'Edit role'}
                              >
                                <Pencil className="h-4 w-4" />
                              </button>
                              <button
                                type="button"
                                className={cn(
                                  HOUSE_COLLABORATOR_ACTION_ICON_CLASS,
                                  chip.state === 'pending'
                                    ? HOUSE_COLLABORATOR_ACTION_ICON_REMOVE_CLASS
                                    : chip.state === 'removed'
                                    ? HOUSE_COLLABORATOR_ACTION_ICON_RESTORE_CLASS
                                    : HOUSE_COLLABORATOR_ACTION_ICON_REMOVE_CLASS,
                                )}
                                onClick={() => {
                                  if (!selectedWorkspace) {
                                    return
                                  }
                                  if (chip.state === 'pending') {
                                    onCancelPendingCollaboratorInvitation(chip.name)
                                    setRoleEditorKey(null)
                                    setRoleEditorDraftRole(null)
                                    setRestoreEditorKey(null)
                                    setRestoreEditorRole(null)
                                    setRemovalConfirmKey(null)
                                    return
                                  }
                                  if (chip.state === 'active') {
                                    setRemovalConfirmKey(chip.key)
                                    setRoleEditorKey(null)
                                    setRoleEditorDraftRole(null)
                                    setRestoreEditorKey(null)
                                    setRestoreEditorRole(null)
                                    return
                                  }
                                  if (restoreEditorKey === chip.key) {
                                    setRestoreEditorKey(null)
                                    setRestoreEditorRole(null)
                                    return
                                  }
                                  setRestoreEditorKey(chip.key)
                                  setRestoreEditorRole(chip.role)
                                  setRoleEditorKey(null)
                                  setRoleEditorDraftRole(null)
                                  setRemovalConfirmKey(null)
                                }}
                                aria-label={chip.state === 'removed' ? `Restore ${chip.name}` : `Remove ${chip.name}`}
                                title={
                                  chip.state === 'pending'
                                    ? 'Cancel pending invitation'
                                    : chip.state === 'removed'
                                      ? 'Restore collaborator'
                                      : 'Remove collaborator'
                                }
                              >
                                {chip.state === 'pending' ? (
                                  <X className="h-4 w-4" />
                                ) : chip.state === 'removed' ? (
                                  <RotateCcw className="h-4 w-4" />
                                ) : (
                                  <UserMinus className="h-4 w-4" />
                                )}
                              </button>
                            </>
                          )
                        ) : null}
                      </div>
                    </div>
                  )
                })()
              ))}
              <div className="pt-0.5">
                <button
                  type="button"
                  className={cn(
                    HOUSE_COLLABORATOR_ACTION_ICON_CLASS,
                    HOUSE_COLLABORATOR_ACTION_ICON_ADD_CLASS,
                  )}
                  onClick={onOpenCollaboratorComposer}
                  disabled={!canAddCollaborator}
                  aria-label={
                    selectedWorkspace
                      ? collaboratorComposerOpen
                        ? `Cancel add collaborator for ${selectedWorkspace.name}`
                        : `Add collaborator to ${selectedWorkspace.name}`
                      : 'Select a workspace to add collaborators'
                  }
                  title={
                    !selectedWorkspace
                      ? 'Select a workspace to manage collaborators.'
                      : canManageSelectedWorkspace
                        ? collaboratorComposerOpen
                          ? 'Cancel add collaborator'
                          : 'Add collaborator'
                        : 'Only the workspace owner can add collaborators.'
                  }
                >
                  <UserPlus className="h-4 w-4" />
                </button>
              </div>
            </div>
          ) : null}
        </div>
        {!selectedWorkspace ? (
          <p className={HOUSE_FIELD_HELPER_CLASS}>Select a workspace to manage collaborators.</p>
        ) : !canManageSelectedWorkspace ? (
          <p className={HOUSE_FIELD_HELPER_CLASS}>Only the workspace owner can add collaborators.</p>
        ) : (
          <div className="space-y-2">
            {collaboratorComposerOpen ? (
              <>
                <div className="space-y-1">
                  <Input
                    value={collaboratorQuery}
                    onChange={(event) => onCollaboratorQueryChange(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter' && canConfirmAddCollaborator) {
                        event.preventDefault()
                        onConfirmAddCollaborator()
                      }
                    }}
                    placeholder="Search by name"
                    className={HOUSE_INPUT_CLASS}
                  />
                </div>

                <div className="space-y-1">
                  <p className={HOUSE_FIELD_HELPER_CLASS}>Role</p>
                  <SelectPrimitive
                    value={collaboratorInviteRole}
                    onValueChange={(value) => {
                      const nextRole = normalizeCollaboratorRoleValue(value)
                      if (!nextRole) {
                        return
                      }
                      onCollaboratorInviteRoleChange(nextRole)
                    }}
                  >
                    <SelectTrigger className="h-8 w-auto min-w-sz-120 px-2 text-xs">
                      <SelectValue placeholder="Select role" />
                    </SelectTrigger>
                    <SelectContent>
                      {COLLABORATOR_ROLE_OPTIONS.map((option) => (
                        <SelectItem key={option.value} value={option.value}>
                          {option.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </SelectPrimitive>
                </div>

                <div className="flex justify-end">
                  <Button
                    type="button"
                    className={cn(HOUSE_PRIMARY_ACTION_BUTTON_CLASS, HOUSE_BUTTON_TEXT_CLASS)}
                    onClick={onConfirmAddCollaborator}
                    disabled={!canConfirmAddCollaborator}
                  >
                    Send invite
                  </Button>
                </div>
              </>
            ) : null}
          </div>
        )}
      </div>

      <div className="space-y-2">
        <p className={cn(HOUSE_DRILLDOWN_SECTION_LABEL_CLASS, 'pl-3')}>Audit logs</p>
        {!selectedWorkspace ? (
          <p className={HOUSE_FIELD_HELPER_CLASS}>Select a workspace to view audit logs.</p>
        ) : (
          <div className="space-y-2">
            <button
              type="button"
              onClick={onToggleCollaboratorActivitySection}
              className={cn(
                'flex w-full items-center justify-between rounded-md px-2 py-1.5 text-left',
                HOUSE_DRILLDOWN_COLLAPSIBLE_SECTION_CLASS,
              )}
              data-state={collaboratorActivityCollapsed ? 'closed' : 'open'}
              aria-expanded={!collaboratorActivityCollapsed}
              aria-label="Toggle collaborator access and roles audit logs"
              title={
                collaboratorActivityCollapsed
                  ? 'Expand collaborator access and roles'
                  : 'Collapse collaborator access and roles'
              }
            >
              <span className={houseTypography.text}>Collaborator access and roles</span>
              <span className="inline-flex items-center gap-1.5">
                <span className={HOUSE_FIELD_HELPER_CLASS}>{collaboratorActivityEntries.length}</span>
                {collaboratorActivityCollapsed ? (
                  <ChevronDown className="h-4 w-4 text-muted-foreground" />
                ) : (
                  <ChevronUp className="h-4 w-4 text-muted-foreground" />
                )}
              </span>
            </button>
            {!collaboratorActivityCollapsed ? (
              <div className="space-y-2">
                <div
                  className={HOUSE_DRILLDOWN_TAB_LIST_CLASS}
                  style={{ gridTemplateColumns: 'repeat(5, minmax(0, 1fr))' }}
                >
                  {COLLABORATOR_AUDIT_FILTER_OPTIONS.map((option) => {
                    const isActive = collaboratorAuditFilter === option.value
                    return (
                      <button
                        key={option.value}
                        type="button"
                        className={HOUSE_DRILLDOWN_TAB_TRIGGER_CLASS}
                        data-state={isActive ? 'active' : 'inactive'}
                        onClick={() => setCollaboratorAuditFilter(option.value)}
                        aria-label={`Filter collaborator access and roles by ${option.label}`}
                        title={`Show ${option.label.toLowerCase()} events`}
                      >
                        {option.label}
                      </button>
                    )
                  })}
                </div>
                {collaboratorActivityEntries.length === 0 ? (
                  <p className={HOUSE_FIELD_HELPER_CLASS}>
                    No collaborator access or role events logged yet.
                  </p>
                ) : (
                  <div className={cn(clampCollaboratorActivityList ? 'max-h-72 overflow-y-auto pr-1' : '', 'space-y-2')}>
                        {collaboratorActivityGroups.map((group, groupIndex) => {
                          const actorKey = auditActorKey(group.actorName)
                          const isExpanded = collaboratorActorExpanded[actorKey] ?? false
                          return (
                            <div
                              key={`${actorKey}-${groupIndex}`}
                              className={cn(
                                'rounded-md border border-border/60 bg-background/70',
                                HOUSE_DRILLDOWN_COLLAPSIBLE_ENTITY_CLASS,
                              )}
                              data-state={isExpanded ? 'open' : 'closed'}
                            >
                              <button
                                type="button"
                                className="flex w-full items-center justify-between gap-2 px-2 py-1.5 text-left"
                                onClick={() =>
                                  setCollaboratorActorExpanded((current) => ({
                                    ...current,
                                    [actorKey]: !isExpanded,
                                  }))
                                }
                                aria-expanded={isExpanded}
                                aria-label={`Toggle ${formatAuditActorHeaderName(group.actorName)} collaborator log entries`}
                              >
                                <p className={cn(houseTypography.text, 'font-medium')}>
                                  {formatAuditActorHeaderName(group.actorName)}
                                </p>
                                <span className="inline-flex items-center gap-1.5">
                                  <span className={HOUSE_FIELD_HELPER_CLASS}>
                                    {group.entries.length}
                                  </span>
                                  {isExpanded ? (
                                    <ChevronUp className="h-4 w-4 text-muted-foreground" />
                                  ) : (
                                    <ChevronDown className="h-4 w-4 text-muted-foreground" />
                                  )}
                                </span>
                              </button>
                              {isExpanded ? (
                                <div className="border-t border-border/50">
                                  {group.entries.map((item, entryIndex) => {
                                    const { entry, parsedTransition } = item
                                    if (!parsedTransition) {
                                      return (
                                        <div
                                          key={entry.id}
                                          className={cn(
                                            'px-2 py-1.5',
                                            entryIndex > 0 ? 'border-t border-border/50' : '',
                                          )}
                                        >
                                          <div className="flex items-center justify-between gap-2">
                                            <p className={houseTypography.text}>{entry.message}</p>
                                            <span className={HOUSE_FIELD_HELPER_CLASS}>
                                              {formatAuditCompactTimestamp(entry.createdAt)}
                                            </span>
                                          </div>
                                        </div>
                                      )
                                    }
                                    const transitionPills = buildAuditTransitionPillPresentation(parsedTransition)
                                    const fromValueClass =
                                      transitionPills.fromRawValue && transitionPills.fromLabel
                                        ? auditTransitionStatePillClassName(
                                            parsedTransition,
                                            transitionPills.fromRawValue,
                                          )
                                        : ''
                                    const toValueClass = auditTransitionStatePillClassName(
                                      parsedTransition,
                                      transitionPills.toRawValue,
                                    )
                                    return (
                                      <div
                                        key={entry.id}
                                        className={cn(
                                          'px-2 py-1.5',
                                          entryIndex > 0 ? 'border-t border-border/50' : '',
                                        )}
                                      >
                                        <div className="flex items-center justify-between gap-2">
                                          <div className="flex flex-wrap items-center gap-1.5 text-xs">
                                            {transitionPills.fromLabel && transitionPills.fromRawValue ? (
                                              <span className={fromValueClass}>
                                                {transitionPills.fromLabel}
                                              </span>
                                            ) : null}
                                            {transitionPills.showArrow && transitionPills.fromLabel ? (
                                              <ArrowRight className="h-3.5 w-3.5 text-muted-foreground" />
                                            ) : null}
                                            <span className={toValueClass}>
                                              {transitionPills.toLabel}
                                            </span>
                                          </div>
                                          <span className={HOUSE_FIELD_HELPER_CLASS}>
                                            {formatAuditCompactTimestamp(entry.createdAt)}
                                          </span>
                                        </div>
                                      </div>
                                    )
                                  })}
                                </div>
                              ) : null}
                            </div>
                          )
                        })}
                  </div>
                )}
              </div>
            ) : null}

            <button
              type="button"
              onClick={onToggleConversationActivitySection}
              className={cn(
                'flex w-full items-center justify-between rounded-md px-2 py-1.5 text-left',
                HOUSE_DRILLDOWN_COLLAPSIBLE_SECTION_CLASS,
              )}
              data-state={conversationActivityCollapsed ? 'closed' : 'open'}
              aria-expanded={!conversationActivityCollapsed}
              aria-label="Toggle conversation log audit logs"
              title={
                conversationActivityCollapsed
                  ? 'Expand conversation log'
                  : 'Collapse conversation log'
              }
            >
              <span className={houseTypography.text}>Conversation log</span>
              <span className="inline-flex items-center gap-1.5">
                <span className={HOUSE_FIELD_HELPER_CLASS}>{conversationActivityEntries.length}</span>
                {conversationActivityCollapsed ? (
                  <ChevronDown className="h-4 w-4 text-muted-foreground" />
                ) : (
                  <ChevronUp className="h-4 w-4 text-muted-foreground" />
                )}
              </span>
            </button>
            {!conversationActivityCollapsed ? (
              conversationActivityEntries.length === 0 ? (
                <p className={HOUSE_FIELD_HELPER_CLASS}>
                  No conversation events logged yet.
                </p>
              ) : (
                <div className="space-y-2">
                  <div className="rounded-md border border-border bg-background/70">
                    <div className={cn(clampConversationActivityList ? 'max-h-72 overflow-y-auto' : '')}>
                      <div className="space-y-2 p-2">
                        {conversationActivityGroups.map((group, groupIndex) => (
                          <div
                            key={`${normalizeCollaboratorName(group.actorName).toLowerCase()}-${groupIndex}`}
                            className="space-y-1"
                          >
                            {showConversationActorHeaders ? (
                              <p className={cn(HOUSE_FIELD_HELPER_CLASS, 'px-1 pt-0.5 font-medium')}>
                                {formatAuditActorHeaderName(group.actorName)}
                              </p>
                            ) : null}
                            <div className="rounded border border-border/60 bg-background/60">
                              {group.entries.map((item, entryIndex) => {
                                const { entry, parsedEvent } = item
                                if (!parsedEvent) {
                                  return (
                                    <div
                                      key={entry.id}
                                      className={cn(
                                        'px-2 py-1.5',
                                        entryIndex > 0 ? 'border-t border-border/50' : '',
                                      )}
                                    >
                                      <div className="flex items-center justify-between gap-2">
                                        <span className="rounded border border-border bg-background/80 px-1.5 py-0.5 text-tiny text-muted-foreground">
                                          Other
                                        </span>
                                        <span className={HOUSE_FIELD_HELPER_CLASS}>{formatTimestamp(entry.createdAt)}</span>
                                      </div>
                                      <p className={cn(houseTypography.text, 'mt-1')}>{entry.message}</p>
                                    </div>
                                  )
                                }
                                return (
                                  <div
                                    key={entry.id}
                                    className={cn(
                                      'px-2 py-1.5',
                                      entryIndex > 0 ? 'border-t border-border/50' : '',
                                    )}
                                  >
                                    <div className="flex items-center justify-between gap-2">
                                      <span className="rounded border border-border bg-background/80 px-1.5 py-0.5 text-tiny text-muted-foreground">
                                        Message
                                      </span>
                                      <span className={HOUSE_FIELD_HELPER_CLASS}>
                                        Logged {formatTimestamp(entry.createdAt)}
                                      </span>
                                    </div>
                                    <p className={cn(houseTypography.text, 'mt-1 font-medium')}>
                                      Message ID {parsedEvent.messageId}
                                    </p>
                                    <div className="mt-1 flex flex-wrap items-center gap-1.5 text-xs">
                                      <span className="rounded border border-border/70 bg-background/80 px-1.5 py-0.5">
                                        Sent {formatTimestamp(parsedEvent.createdAtRaw)}
                                      </span>
                                      <span className="rounded border border-border/70 bg-background/80 px-1.5 py-0.5">
                                        Cipher {parsedEvent.ciphertextLength}
                                      </span>
                                      <span className="rounded border border-border/70 bg-background/80 px-1.5 py-0.5">
                                        IV {parsedEvent.ivLength}
                                      </span>
                                    </div>
                                  </div>
                                )
                              })}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                    {clampConversationActivityList ? (
                      <p className={cn(HOUSE_FIELD_HELPER_CLASS, 'px-2 pb-2')}>
                        Scroll to view older conversation entries.
                      </p>
                    ) : null}
                  </div>
                </div>
              )
            ) : null}
          </div>
        )}
      </div>
    </div>
  )
}
function DataLibraryDrilldownPanel() {
  return (
    <div className={HOUSE_DRILLDOWN_SHEET_BODY_CLASS}>
      <div className={HOUSE_DATA_LEFT_BORDER_CLASS}>
        <h2 className={HOUSE_SECTION_TITLE_CLASS}>Manage data</h2>
      </div>
      <p className={cn(HOUSE_DRILLDOWN_SECTION_LABEL_CLASS, 'mt-1 pl-3')}>Data library</p>
    </div>
  )
}

function SortableHeader({
  label,
  column,
  activeColumn,
  direction,
  align = 'left',
  onSort,
}: {
  label: string
  column: SortColumn
  activeColumn: SortColumn
  direction: SortDirection
  align?: 'left' | 'center' | 'right'
  onSort: (column: SortColumn) => void
}) {
  const isActive = column === activeColumn
  const alignClass =
    align === 'right'
      ? 'w-full justify-end text-right'
      : align === 'center'
        ? 'w-full justify-center text-center'
        : 'w-full justify-start text-left'
  return (
    <button
      type="button"
      onClick={() => onSort(column)}
      className={cn('inline-flex items-center gap-1 transition-colors hover:text-foreground', HOUSE_TABLE_SORT_TRIGGER_CLASS, alignClass)}
    >
      <span>{label}</span>
      {isActive ? (
        direction === 'desc' ? (
          <ChevronDown className="h-3.5 w-3.5 text-foreground" />
        ) : (
          <ChevronUp className="h-3.5 w-3.5 text-foreground" />
        )
      ) : (
        <ChevronsUpDown className="h-3.5 w-3.5" />
      )}
    </button>
  )
}

function WorkspaceMenuTrigger({
  menuOpen,
  disabled = false,
  onToggleMenu,
}: {
  menuOpen: boolean
  disabled?: boolean
  onToggleMenu: (event: ReactMouseEvent<HTMLButtonElement>) => void
}) {
  return (
    <button
      type="button"
      data-workspace-menu="true"
      onClick={onToggleMenu}
      disabled={disabled}
      className={cn(
        'inline-flex items-center justify-center rounded-md border border-border bg-background text-sm leading-none text-muted-foreground hover:text-foreground',
        WORKSPACE_ICON_BUTTON_DIMENSION_CLASS,
        menuOpen && 'border-emerald-400 text-foreground',
        disabled && 'cursor-not-allowed opacity-60 hover:text-muted-foreground',
      )}
      aria-label="Workspace options"
    >
      ...
    </button>
  )
}

function WorkspacesHomeSidebar({
  centerView,
  onSelectCenterView,
  onOpenInbox,
  incomingInvitationCount,
  outgoingInvitationCount,
  canOpenInbox,
  onNavigate,
}: {
  centerView: CenterView
  onSelectCenterView: (next: CenterView) => void
  onOpenInbox: () => void
  incomingInvitationCount: number
  outgoingInvitationCount: number
  canOpenInbox: boolean
  onNavigate?: () => void
}) {
  const totalInvitationCount = incomingInvitationCount + outgoingInvitationCount
  return (
    <aside className={cn(HOUSE_SIDEBAR_FRAME_CLASS, HOUSE_SIDEBAR_CLASS)} data-house-role="left-nav-shell">
      <div className={HOUSE_SIDEBAR_HEADER_CLASS}>
        <div className={cn(HOUSE_PAGE_HEADER_CLASS, HOUSE_LEFT_BORDER_CLASS)}>
          <h2 data-house-role="section-title" className={HOUSE_SECTION_TITLE_CLASS}>My Workspace</h2>
        </div>
      </div>
      <ScrollArea className={HOUSE_SIDEBAR_SCROLL_CLASS}>
        <div className={HOUSE_SIDEBAR_BODY_CLASS}>
          <section className={HOUSE_SIDEBAR_SECTION_CLASS}>
            <p className={HOUSE_NAV_SECTION_LABEL_CLASS}>
              Views
            </p>
            <div className={HOUSE_NAV_LIST_CLASS}>
              <button
                type="button"
                onClick={() => {
                  onSelectCenterView('workspaces')
                  onNavigate?.()
                }}
                className={cn(
                  HOUSE_NAV_ITEM_CLASS,
                  HOUSE_NAV_ITEM_WORKSPACE_CLASS,
                  centerView === 'workspaces' && HOUSE_NAV_ITEM_ACTIVE_CLASS,
                )}
              >
                <span className={HOUSE_NAV_ITEM_LABEL_CLASS}>My Workspaces</span>
              </button>
              <button
                type="button"
                onClick={() => {
                  onSelectCenterView('invitations')
                  onNavigate?.()
                }}
                className={cn(
                  HOUSE_NAV_ITEM_CLASS,
                  HOUSE_NAV_ITEM_WORKSPACE_CLASS,
                  centerView === 'invitations' && HOUSE_NAV_ITEM_ACTIVE_CLASS,
                )}
              >
                <span className={HOUSE_NAV_ITEM_LABEL_CLASS}>Invitations</span>
                <div className={cn(HOUSE_NAV_ITEM_META_GROUP_CLASS, HOUSE_NAV_ITEM_META_CLASS)}>
                  <span className={cn(HOUSE_NAV_ITEM_COUNT_CLASS, 'gap-1')}>
                    <span className="inline-block h-1.5 w-1.5 rounded-full bg-emerald-500" />
                    {incomingInvitationCount}
                  </span>
                  <span className={cn(HOUSE_NAV_ITEM_COUNT_CLASS, 'gap-1')}>
                    <span className="inline-block h-1.5 w-1.5 rounded-full bg-red-500" />
                    {outgoingInvitationCount}
                  </span>
                  <span className={HOUSE_NAV_ITEM_COUNT_CLASS}>
                    {totalInvitationCount}
                  </span>
                </div>
              </button>
              <button
                type="button"
                onClick={() => {
                  onSelectCenterView('data-library')
                  onNavigate?.()
                }}
                className={cn(
                  HOUSE_NAV_ITEM_CLASS,
                  HOUSE_NAV_ITEM_WORKSPACE_CLASS,
                  centerView === 'data-library' && HOUSE_NAV_ITEM_ACTIVE_CLASS,
                )}
              >
                <span className={HOUSE_NAV_ITEM_LABEL_CLASS}>Data library</span>
              </button>
              <button
                type="button"
                onClick={() => {
                  onOpenInbox()
                  onNavigate?.()
                }}
                className={cn(
                  HOUSE_NAV_ITEM_CLASS,
                  HOUSE_NAV_ITEM_WORKSPACE_CLASS,
                  !canOpenInbox && 'cursor-not-allowed opacity-60',
                )}
                disabled={!canOpenInbox}
              >
                <span className={HOUSE_NAV_ITEM_LABEL_CLASS}>Inbox</span>
              </button>
            </div>
          </section>
        </div>
      </ScrollArea>
    </aside>
  )
}

function CollaboratorBanners({
  workspace,
  canManage,
  onAddCollaborator,
  onToggleRemoved,
}: {
  workspace: WorkspaceRecord
  canManage: boolean
  onAddCollaborator: (workspace: WorkspaceRecord) => void
  onToggleRemoved: (workspace: WorkspaceRecord, collaboratorName: string) => void
}) {
  const chips = workspaceCollaboratorChips(workspace).filter((chip) => chip.state === 'active')
  const ownerNameBase = normalizeCollaboratorName(workspace.ownerName) || 'Workspace owner'
  const ownerName = `${ownerNameBase} (Owner)`
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <TooltipProvider delayDuration={120}>
        {chips.map((chip) => {
          const canToggleRemoved = canManage
          const collaboratorButton = (
            <button
              type="button"
              onClick={(event) => {
                event.stopPropagation()
                if (!canToggleRemoved) {
                  return
                }
                onToggleRemoved(workspace, chip.name)
              }}
              aria-disabled={!canToggleRemoved}
              title={
                canManage
                  ? 'Click to remove collaborator'
                  : undefined
              }
              className={cn(
                HOUSE_COLLABORATOR_CHIP_CLASS,
                HOUSE_COLLABORATOR_CHIP_ACTIVE_CLASS,
                canToggleRemoved ? HOUSE_COLLABORATOR_CHIP_MANAGEABLE_CLASS : HOUSE_COLLABORATOR_CHIP_READONLY_CLASS,
              )}
            >
              {chip.name}
            </button>
          )

          if (canManage) {
            return (
              <span key={chip.key} className="contents">
                {collaboratorButton}
              </span>
            )
          }

          const tooltipMessage = `${ownerName} manages collaborators. ${chip.name} is ${collaboratorRoleLabel(chip.role)} and only the owner can edit this list.`

          return (
            <Tooltip key={chip.key}>
              <TooltipTrigger asChild>
                <span className="inline-flex">{collaboratorButton}</span>
              </TooltipTrigger>
              <TooltipContent side="top" className="max-w-[18rem] text-xs leading-relaxed">
                {tooltipMessage}
              </TooltipContent>
            </Tooltip>
          )
        })}
      </TooltipProvider>
      <button
        type="button"
        aria-label={`Add collaborator to ${workspace.name}`}
        onClick={(event) => {
          event.stopPropagation()
          onAddCollaborator(workspace)
        }}
        disabled={!canManage}
        title={canManage ? 'Add collaborator' : 'Only the workspace owner can add collaborators'}
        className={cn(
          'inline-flex h-5 w-5 items-center justify-center rounded border text-xs leading-none',
          canManage
            ? 'border-border bg-background text-foreground hover:bg-accent/50'
            : 'cursor-not-allowed border-border bg-background text-muted-foreground opacity-70',
        )}
      >
        +
      </button>
    </div>
  )
}

export function WorkspacesPage() {
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()
  const workspaces = useWorkspaceStore((state) => state.workspaces)
  const activeWorkspaceId = useWorkspaceStore((state) => state.activeWorkspaceId)
  const authorRequests = useWorkspaceStore((state) => state.authorRequests)
  const invitationsSent = useWorkspaceStore((state) => state.invitationsSent)
  const hydrateWorkspaceStoreFromRemote = useWorkspaceStore((state) => state.hydrateFromRemote)
  const setActiveWorkspaceId = useWorkspaceStore((state) => state.setActiveWorkspaceId)
  const createWorkspace = useWorkspaceStore((state) => state.createWorkspace)
  const updateWorkspace = useWorkspaceStore((state) => state.updateWorkspace)
  const deleteWorkspace = useWorkspaceStore((state) => state.deleteWorkspace)
  const sendWorkspaceInvitation = useWorkspaceStore((state) => state.sendWorkspaceInvitation)
  const acceptAuthorRequest = useWorkspaceStore((state) => state.acceptAuthorRequest)
  const declineAuthorRequest = useWorkspaceStore((state) => state.declineAuthorRequest)
  const cancelWorkspaceInvitation = useWorkspaceStore((state) => state.cancelWorkspaceInvitation)
  const leftPanelOpen = useAaweStore((state) => state.leftPanelOpen)
  const setLeftPanelOpen = useAaweStore((state) => state.setLeftPanelOpen)
  const inboxMessages = useWorkspaceInboxStore((state) => state.messages)
  const inboxReads = useWorkspaceInboxStore((state) => state.reads)
  const hydrateWorkspaceInboxFromRemote = useWorkspaceInboxStore((state) => state.hydrateFromRemote)
  const refreshInboxMessagesFromStorage = useWorkspaceInboxStore((state) => state.refreshMessagesFromStorage)
  const refreshInboxReadsFromStorage = useWorkspaceInboxStore((state) => state.refreshReadsFromStorage)

  const [centerView, setCenterView] = useState<CenterView>(() => parseCenterView(searchParams.get('view')))
  const [query, setQuery] = useState(() => (searchParams.get('q') || '').trim())
  const [viewMode, setViewMode] = useState<ViewMode>(() => parseViewMode(searchParams.get('mode')))
  const [filterKey, setFilterKey] = useState<FilterKey>(() => parseFilterKey(searchParams.get('filter')))
  const [sortColumn, setSortColumn] = useState<SortColumn>(() => parseSortColumn(searchParams.get('sort')))
  const [sortDirection, setSortDirection] = useState<SortDirection>(() => parseSortDirection(searchParams.get('dir')))
  const [workspaceDrilldownDesktopOpen, setWorkspaceDrilldownDesktopOpen] = useState(false)
  const [workspaceDrilldownMobileOpen, setWorkspaceDrilldownMobileOpen] = useState(false)
  const [dataLibraryDrilldownDesktopOpen, setDataLibraryDrilldownDesktopOpen] = useState(false)
  const [dataLibraryDrilldownMobileOpen, setDataLibraryDrilldownMobileOpen] = useState(false)
  const [workspaceDrilldownSelectionId, setWorkspaceDrilldownSelectionId] = useState<string | null>(null)
  const [newWorkspaceName, setNewWorkspaceName] = useState('')
  const [createError, setCreateError] = useState('')
  const [invitationStatus, setInvitationStatus] = useState('')
  const [menuState, setMenuState] = useState<{
    workspaceId: string
    x: number
    y: number
  } | null>(null)
  const [collaboratorQuery, setCollaboratorQuery] = useState('')
  const [collaboratorComposerOpen, setCollaboratorComposerOpen] = useState(false)
  const [collaboratorInviteRole, setCollaboratorInviteRole] = useState<WorkspaceCollaboratorRole>('editor')
  const [renamingWorkspaceId, setRenamingWorkspaceId] = useState<string | null>(null)
  const [renameDraft, setRenameDraft] = useState('')
  const [workspaceOwnerName, setWorkspaceOwnerName] = useState<string | null>(() =>
    readWorkspaceOwnerNameFromProfile(),
  )
  const currentReaderName = useMemo(
    () => (readWorkspaceOwnerNameFromProfile() || workspaceOwnerName || 'You').trim() || 'You',
    [workspaceOwnerName],
  )
  const currentAuditActorName = useMemo(
    () => {
      const cleanOwner = normalizeCollaboratorName(workspaceOwnerName)
      if (!cleanOwner) {
        return 'Unknown user'
      }
      return `${cleanOwner} (Owner)`
    },
    [workspaceOwnerName],
  )

  const appendWorkspaceAuditLog = (
    workspaceId: string,
    message: string,
    category: WorkspaceAuditCategory = 'collaborator_changes',
  ) => {
    const cleanWorkspaceId = normalizeCollaboratorName(workspaceId)
    const cleanMessage = normalizeCollaboratorName(message)
    if (!cleanWorkspaceId || !cleanMessage) {
      return
    }
    const workspace = useWorkspaceStore
      .getState()
      .workspaces.find((item) => item.id === cleanWorkspaceId)
    if (!workspace) {
      return
    }
    const createdAt = new Date().toISOString()
    const nextEntry: WorkspaceAuditEntry = {
      id: `${cleanWorkspaceId}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
      workspaceId: cleanWorkspaceId,
      category,
      message: cleanMessage,
      createdAt,
    }
    const nextAuditLogEntries = [nextEntry, ...(workspace.auditLogEntries || [])]
      .sort((left, right) => Date.parse(right.createdAt) - Date.parse(left.createdAt))
    updateWorkspace(cleanWorkspaceId, {
      auditLogEntries: nextAuditLogEntries,
      updatedAt: createdAt,
    })
  }

  const filteredWorkspaces = useMemo(() => {
    const cleanQuery = query.trim().toLowerCase()
    const next = workspaces.filter((workspace) => {
      if (filterKey === 'active' && workspace.archived) {
        return false
      }
      if (filterKey === 'archived' && !workspace.archived) {
        return false
      }
      if (filterKey === 'pinned' && !workspace.pinned) {
        return false
      }
      if (filterKey === 'recent' && !isRecentWorkspace(workspace.updatedAt)) {
        return false
      }
      if (!cleanQuery) {
        return true
      }
      return (
        workspace.name.toLowerCase().includes(cleanQuery) ||
        workspace.id.toLowerCase().includes(cleanQuery)
      )
    })
    return sortWorkspaces(next, sortColumn, sortDirection)
  }, [filterKey, query, sortColumn, sortDirection, workspaces])
  const workspaceDrilldownSelectionName = useMemo(() => {
    if (!workspaceDrilldownSelectionId) {
      return null
    }
    return workspaces.find((workspace) => workspace.id === workspaceDrilldownSelectionId)?.name || null
  }, [workspaceDrilldownSelectionId, workspaces])
  const workspaceInboxSignals = useMemo<Record<string, WorkspaceInboxSignal>>(() => {
    const readerKey = normalizePerson(currentReaderName)
    const signalByWorkspaceId: Record<string, WorkspaceInboxSignal> = {}
    for (const workspace of workspaces) {
      const messages = inboxMessages
        .filter((message) => message.workspaceId === workspace.id)
        .sort((left, right) => Date.parse(left.createdAt) - Date.parse(right.createdAt))
      const lastReadAt = inboxReads[workspace.id]?.[readerKey] || null
      const lastReadMs = lastReadAt ? Date.parse(lastReadAt) : Number.NEGATIVE_INFINITY
      const unreadMessages = messages.filter(
        (message) =>
          normalizePerson(message.senderName) !== readerKey &&
          Date.parse(message.createdAt) > lastReadMs,
      )
      const latestMessage = messages[messages.length - 1] || null
      const lastActivitySource = latestMessage
        ? Math.max(Date.parse(workspace.updatedAt), Date.parse(latestMessage.createdAt))
        : Date.parse(workspace.updatedAt)
      const lastActivityAt = Number.isNaN(lastActivitySource)
        ? workspace.updatedAt
        : new Date(lastActivitySource).toISOString()
      signalByWorkspaceId[workspace.id] = {
        unreadCount: unreadMessages.length,
        firstUnreadMessageId: unreadMessages[0]?.id || null,
        lastActivityAt,
      }
    }
    return signalByWorkspaceId
  }, [currentReaderName, inboxMessages, inboxReads, workspaces])
  const incomingInvitationCount = authorRequests.length
  const outgoingInvitationCount = invitationsSent.length
  const invitationRows = useMemo(
    () =>
      [
        ...authorRequests.map((request) => ({
          id: request.id,
          direction: 'incoming' as const,
          workspaceName: request.workspaceName,
          personName: request.authorName,
          role: request.collaboratorRole,
          invitedAt: request.invitedAt,
          status: 'pending',
        })),
        ...invitationsSent.map((invitation) => ({
          id: invitation.id,
          direction: 'outgoing' as const,
          workspaceName: invitation.workspaceName,
          personName: invitation.inviteeName,
          role: invitation.role,
          invitedAt: invitation.invitedAt,
          status: invitation.status,
        })),
      ].sort((left, right) => Date.parse(right.invitedAt) - Date.parse(left.invitedAt)),
    [authorRequests, invitationsSent],
  )
  const inboxWorkspace = useMemo(
    () => {
      const activeWorkspace = activeWorkspaceId
        ? workspaces.find((workspace) => workspace.id === activeWorkspaceId) || null
        : null
      if (
        activeWorkspace &&
        !isWorkspaceReadOnlyForCurrentUser(activeWorkspace, workspaceOwnerName)
      ) {
        return activeWorkspace
      }
      return (
        workspaces.find(
          (workspace) =>
            !isWorkspaceReadOnlyForCurrentUser(workspace, workspaceOwnerName),
        ) || null
      )
    },
    [activeWorkspaceId, workspaces, workspaceOwnerName],
  )
  const canOpenInbox = Boolean(inboxWorkspace)
  const workspaceDrilldownSelection = useMemo(
    () =>
      workspaceDrilldownSelectionId
        ? workspaces.find((workspace) => workspace.id === workspaceDrilldownSelectionId) || null
        : null,
    [workspaceDrilldownSelectionId, workspaces],
  )
  const selectedWorkspaceCollaboratorChips = useMemo(
    () => (workspaceDrilldownSelection ? workspaceCollaboratorChips(workspaceDrilldownSelection) : []),
    [workspaceDrilldownSelection],
  )
  const selectedWorkspaceAuditEntries = useMemo(
    () =>
      workspaceDrilldownSelection
        ? [...(workspaceDrilldownSelection.auditLogEntries || [])].sort(
            (left, right) => Date.parse(right.createdAt) - Date.parse(left.createdAt),
          )
        : [],
    [workspaceDrilldownSelection],
  )
  const selectedWorkspaceReadOnly = useMemo(
    () =>
      workspaceDrilldownSelection
        ? isWorkspaceReadOnlyForCurrentUser(workspaceDrilldownSelection, workspaceOwnerName)
        : false,
    [workspaceDrilldownSelection, workspaceOwnerName],
  )
  const collaboratorTargetName = normalizeCollaboratorName(collaboratorQuery)
  const canManageSelectedWorkspace = Boolean(
    workspaceDrilldownSelection && isWorkspaceOwner(workspaceDrilldownSelection, workspaceOwnerName),
  )
  const canConfirmAddCollaborator = Boolean(
    canManageSelectedWorkspace && collaboratorComposerOpen && collaboratorTargetName,
  )

  useEffect(() => {
    void hydrateWorkspaceStoreFromRemote()
    void hydrateWorkspaceInboxFromRemote()
  }, [hydrateWorkspaceInboxFromRemote, hydrateWorkspaceStoreFromRemote])

  useEffect(() => {
    if (!menuState) {
      return
    }
    const closeMenu = () => setMenuState(null)
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        closeMenu()
      }
    }
    window.addEventListener('keydown', onKeyDown)
    window.addEventListener('resize', closeMenu)
    window.addEventListener('scroll', closeMenu, true)
    return () => {
      window.removeEventListener('keydown', onKeyDown)
      window.removeEventListener('resize', closeMenu)
      window.removeEventListener('scroll', closeMenu, true)
    }
  }, [menuState])

  useEffect(() => {
    if (!menuState) {
      return
    }
    const exists = workspaces.some((workspace) => workspace.id === menuState.workspaceId)
    if (!exists) {
      setMenuState(null)
    }
  }, [menuState, workspaces])

  useEffect(() => {
    if (!workspaceDrilldownSelectionId) {
      return
    }
    const exists = workspaces.some((workspace) => workspace.id === workspaceDrilldownSelectionId)
    if (!exists) {
      setWorkspaceDrilldownSelectionId(null)
      setCollaboratorQuery('')
      setCollaboratorComposerOpen(false)
    }
  }, [workspaceDrilldownSelectionId, workspaces])

  useEffect(() => {
    const refreshOwner = () => {
      setWorkspaceOwnerName(readWorkspaceOwnerNameFromProfile())
    }
    window.addEventListener('storage', refreshOwner)
    window.addEventListener('focus', refreshOwner)
    return () => {
      window.removeEventListener('storage', refreshOwner)
      window.removeEventListener('focus', refreshOwner)
    }
  }, [])

  useEffect(() => {
    const nextParams = new URLSearchParams()
    nextParams.set('view', centerView)
    nextParams.set('filter', filterKey)
    nextParams.set('mode', viewMode)
    nextParams.set('sort', sortColumn)
    nextParams.set('dir', sortDirection)
    if (query.trim()) {
      nextParams.set('q', query.trim())
    }
    const current = searchParams.toString()
    const next = nextParams.toString()
    if (current !== next) {
      setSearchParams(nextParams, { replace: true })
    }
  }, [centerView, filterKey, viewMode, sortColumn, sortDirection, query, searchParams, setSearchParams])

  useEffect(() => {
    if (centerView !== 'workspaces') {
      setWorkspaceDrilldownMobileOpen(false)
    }
  }, [centerView])

  useEffect(() => {
    if (centerView !== 'data-library') {
      setDataLibraryDrilldownMobileOpen(false)
    }
  }, [centerView])

  useEffect(() => {
    const onStorage = (event: StorageEvent) => {
      if (matchesScopedStorageEventKey(event.key, INBOX_MESSAGES_STORAGE_KEY)) {
        refreshInboxMessagesFromStorage()
      }
      if (matchesScopedStorageEventKey(event.key, INBOX_READS_STORAGE_KEY)) {
        refreshInboxReadsFromStorage()
      }
    }
    window.addEventListener('storage', onStorage)
    return () => {
      window.removeEventListener('storage', onStorage)
    }
  }, [refreshInboxMessagesFromStorage, refreshInboxReadsFromStorage])

  const canCreateWorkspace = Boolean(workspaceOwnerName)

  const resetCollaboratorComposer = () => {
    setCollaboratorQuery('')
    setCollaboratorComposerOpen(false)
    setCollaboratorInviteRole('editor')
  }

  const toggleCollaboratorComposer = () => {
    if (!workspaceDrilldownSelection || !canManageSelectedWorkspace) {
      return
    }
    if (collaboratorComposerOpen) {
      resetCollaboratorComposer()
      return
    }
    setCollaboratorComposerOpen(true)
  }

  const onCreateWorkspace = () => {
    if (!workspaceOwnerName) {
      setCreateError(WORKSPACE_OWNER_REQUIRED_MESSAGE)
      return
    }
    try {
      const created = createWorkspace(newWorkspaceName.trim() || 'New Workspace')
      setCreateError('')
      setNewWorkspaceName('')
      setActiveWorkspaceId(created.id)
    } catch (createWorkspaceError) {
      setCreateError(
        createWorkspaceError instanceof Error
          ? createWorkspaceError.message
          : WORKSPACE_OWNER_REQUIRED_MESSAGE,
      )
    }
  }

  const onInviteCollaborator = (workspace: WorkspaceRecord) => {
    const currentOwner = (workspaceOwnerName || '').trim()
    if (!currentOwner || workspace.ownerName.toLowerCase() !== currentOwner.toLowerCase()) {
      setInvitationStatus('Only the workspace author can invite collaborators.')
      setMenuState(null)
      return
    }
    const invitationTarget = window.prompt(`Invite collaborator to "${workspace.name}"`)
    if (invitationTarget === null) {
      setMenuState(null)
      return
    }
    const roleInput = window.prompt(
      'Assign role before sending invite (editor, reviewer, viewer)',
      'editor',
    )
    if (roleInput === null) {
      setMenuState(null)
      return
    }
    const inviteRole = normalizeCollaboratorRoleValue(roleInput)
    if (!inviteRole) {
      setInvitationStatus('Role must be editor, reviewer, or viewer.')
      setMenuState(null)
      return
    }
    const sent = sendWorkspaceInvitation(workspace.id, invitationTarget, inviteRole)
    if (!sent) {
      setInvitationStatus('Invitation was not sent. Check owner access or duplicate pending invitation.')
      setMenuState(null)
      return
    }
    setInvitationStatus(`Invitation sent to ${sent.inviteeName} as ${collaboratorRoleLabel(sent.role)}.`)
    appendWorkspaceAuditLog(
      workspace.id,
      collaboratorStatusTransitionAuditMessage({
        collaboratorName: sent.inviteeName,
        fromStatus: 'none',
        toStatus: 'pending',
        actorName: currentAuditActorName,
        role: sent.role,
      }),
    )
    setMenuState(null)
  }

  const onAddCollaborator = (workspace: WorkspaceRecord) => {
    if (!isWorkspaceOwner(workspace, workspaceOwnerName)) {
      setInvitationStatus('Only the workspace author can add collaborators.')
      return
    }
    setWorkspaceDrilldownSelectionId(workspace.id)
    resetCollaboratorComposer()
    setCollaboratorComposerOpen(true)
    if (window.matchMedia('(min-width: 1280px)').matches) {
      setWorkspaceDrilldownDesktopOpen(true)
      return
    }
    setWorkspaceDrilldownMobileOpen(true)
  }

  const onConfirmAddCollaborator = () => {
    if (!workspaceDrilldownSelection) {
      setInvitationStatus('Select a workspace first.')
      return
    }
    if (!isWorkspaceOwner(workspaceDrilldownSelection, workspaceOwnerName)) {
      setInvitationStatus('Only the workspace author can add collaborators.')
      resetCollaboratorComposer()
      return
    }
    const clean = collaboratorTargetName
    if (!clean) {
      setInvitationStatus('Collaborator name is required.')
      return
    }
    if (normalizeCollaboratorName(workspaceDrilldownSelection.ownerName).toLowerCase() === clean.toLowerCase()) {
      setInvitationStatus('The workspace author is already included.')
      return
    }
    const cleanKey = clean.toLowerCase()
    const removed = collaboratorRemovedSet(workspaceDrilldownSelection)
    const pending = collaboratorPendingSet(workspaceDrilldownSelection)
    if (pending.has(cleanKey)) {
      const matchedPendingName =
        workspaceDrilldownSelection.pendingCollaborators.find(
          (value) => normalizeCollaboratorName(value).toLowerCase() === cleanKey,
        ) || clean
      const currentRole =
        workspaceDrilldownSelection.pendingCollaboratorRoles?.[matchedPendingName] || 'editor'
      if (currentRole !== collaboratorInviteRole) {
        updateWorkspace(workspaceDrilldownSelection.id, {
          pendingCollaboratorRoles: {
            ...(workspaceDrilldownSelection.pendingCollaboratorRoles || {}),
            [matchedPendingName]: collaboratorInviteRole,
          },
          updatedAt: new Date().toISOString(),
        })
        setInvitationStatus(
          `${matchedPendingName} remains pending. Role updated to ${collaboratorRoleLabel(collaboratorInviteRole)}. Awaiting acceptance.`,
        )
        appendWorkspaceAuditLog(
          workspaceDrilldownSelection.id,
          collaboratorRoleTransitionAuditMessage({
            collaboratorName: matchedPendingName,
            fromRole: currentRole,
            toRole: collaboratorInviteRole,
            actorName: currentAuditActorName,
            pending: true,
          }),
        )
        resetCollaboratorComposer()
        return
      }
      setInvitationStatus(`${clean} is already pending.`)
      return
    }
    const activeMatch = workspaceDrilldownSelection.collaborators.find((collaborator) => {
      const key = normalizeCollaboratorName(collaborator).toLowerCase()
      return key === cleanKey && !removed.has(key)
    })
    if (activeMatch) {
      setInvitationStatus(`${activeMatch} is already a collaborator.`)
      return
    }
    const sent = sendWorkspaceInvitation(
      workspaceDrilldownSelection.id,
      clean,
      collaboratorInviteRole,
    )
    if (!sent) {
      setInvitationStatus('Invitation was not sent. Check owner access or duplicate pending invitation.')
      return
    }
    setInvitationStatus(
      `${sent.inviteeName} added as pending ${collaboratorRoleLabel(sent.role)} collaborator.`,
    )
    appendWorkspaceAuditLog(
      workspaceDrilldownSelection.id,
      collaboratorStatusTransitionAuditMessage({
        collaboratorName: sent.inviteeName,
        fromStatus: 'none',
        toStatus: 'pending',
        actorName: currentAuditActorName,
        role: sent.role,
      }),
    )
    resetCollaboratorComposer()
  }

  const onCancelPendingInvitation = (invitationId: string) => {
    const invitation = invitationsSent.find((item) => item.id === invitationId) || null
    if (!invitation || invitation.status !== 'pending') {
      setInvitationStatus('Pending invitation could not be found.')
      return
    }
    const cancelled = cancelWorkspaceInvitation(invitation.id)
    if (!cancelled) {
      setInvitationStatus('Pending invitation could not be cancelled.')
      return
    }
    setInvitationStatus(`Pending invitation for ${cancelled.inviteeName} cancelled.`)
    appendWorkspaceAuditLog(
      cancelled.workspaceId,
      collaboratorStatusTransitionAuditMessage({
        collaboratorName: cancelled.inviteeName,
        fromStatus: 'pending',
        toStatus: 'cancelled',
        actorName: currentAuditActorName,
        role: cancelled.role,
      }),
    )
  }

  const onCancelPendingCollaboratorInvitation = (collaboratorName: string) => {
    if (!workspaceDrilldownSelection) {
      setInvitationStatus('Select a workspace first.')
      return
    }
    if (!isWorkspaceOwner(workspaceDrilldownSelection, workspaceOwnerName)) {
      setInvitationStatus('Only the workspace author can manage collaborators.')
      return
    }
    const collaboratorKey = normalizeCollaboratorName(collaboratorName).toLowerCase()
    if (!collaboratorKey) {
      return
    }
    const invitation = invitationsSent.find(
      (item) =>
        item.workspaceId === workspaceDrilldownSelection.id &&
        item.status === 'pending' &&
        normalizeCollaboratorName(item.inviteeName).toLowerCase() === collaboratorKey,
    )
    if (!invitation) {
      setInvitationStatus(`No pending invitation found for ${collaboratorName}.`)
      return
    }
    onCancelPendingInvitation(invitation.id)
  }

  const onChangeCollaboratorRole = (
    collaboratorName: string,
    state: CollaboratorChipState,
    role: WorkspaceCollaboratorRole,
  ) => {
    if (!workspaceDrilldownSelection) {
      setInvitationStatus('Select a workspace first.')
      return
    }
    if (!isWorkspaceOwner(workspaceDrilldownSelection, workspaceOwnerName)) {
      setInvitationStatus('Only the workspace author can assign collaborator roles.')
      return
    }
    const collaboratorKey = normalizeCollaboratorName(collaboratorName).toLowerCase()
    if (!collaboratorKey) {
      return
    }

    if (state === 'pending') {
      const matchedPendingName =
        workspaceDrilldownSelection.pendingCollaborators.find(
          (value) => normalizeCollaboratorName(value).toLowerCase() === collaboratorKey,
        ) || collaboratorName
      const currentRole =
        workspaceDrilldownSelection.pendingCollaboratorRoles?.[matchedPendingName] || 'editor'
      if (currentRole === role) {
        setInvitationStatus(
          `${matchedPendingName} pending role unchanged (${collaboratorRoleLabel(role)}). Awaiting acceptance.`,
        )
        return
      }
      updateWorkspace(workspaceDrilldownSelection.id, {
        pendingCollaboratorRoles: {
          ...(workspaceDrilldownSelection.pendingCollaboratorRoles || {}),
          [matchedPendingName]: role,
        },
        updatedAt: new Date().toISOString(),
      })
      setInvitationStatus(
        `${matchedPendingName} pending role set to ${collaboratorRoleLabel(role)}. Awaiting acceptance.`,
      )
      appendWorkspaceAuditLog(
        workspaceDrilldownSelection.id,
        collaboratorRoleTransitionAuditMessage({
          collaboratorName: matchedPendingName,
          fromRole: currentRole,
          toRole: role,
          actorName: currentAuditActorName,
          pending: true,
        }),
      )
      return
    }

    const matchedActiveName =
      workspaceDrilldownSelection.collaborators.find(
        (value) => normalizeCollaboratorName(value).toLowerCase() === collaboratorKey,
      ) || collaboratorName
    const currentRole = workspaceDrilldownSelection.collaboratorRoles?.[matchedActiveName] || 'editor'
    if (currentRole === role) {
      setInvitationStatus(`${matchedActiveName} role unchanged (${collaboratorRoleLabel(role)}).`)
      return
    }
    updateWorkspace(workspaceDrilldownSelection.id, {
      collaboratorRoles: {
        ...(workspaceDrilldownSelection.collaboratorRoles || {}),
        [matchedActiveName]: role,
      },
      updatedAt: new Date().toISOString(),
    })
    setInvitationStatus(`${matchedActiveName} role set to ${collaboratorRoleLabel(role)}.`)
    appendWorkspaceAuditLog(
      workspaceDrilldownSelection.id,
      collaboratorRoleTransitionAuditMessage({
        collaboratorName: matchedActiveName,
        fromRole: currentRole,
        toRole: role,
        actorName: currentAuditActorName,
      }),
    )
  }

  const onToggleCollaboratorRemoved = (
    workspace: WorkspaceRecord,
    collaboratorName: string,
    options?: ToggleCollaboratorRemovedOptions,
  ) => {
    if (!isWorkspaceOwner(workspace, workspaceOwnerName)) {
      setInvitationStatus('Only the workspace author can manage collaborators.')
      return
    }
    const collaboratorKey = normalizeCollaboratorName(collaboratorName).toLowerCase()
    if (!collaboratorKey) {
      return
    }
    const removed = collaboratorRemovedSet(workspace)
    const isRemoved = removed.has(collaboratorKey)

    if (isRemoved) {
      const pending = collaboratorPendingSet(workspace)
      const matchedName =
        workspace.collaborators.find(
          (value) => normalizeCollaboratorName(value).toLowerCase() === collaboratorKey,
        ) || collaboratorName
      if (pending.has(collaboratorKey)) {
        setInvitationStatus(`${matchedName} already has a pending invitation.`)
        return
      }
      const nextRole = options?.restoreRole || null
      if (!nextRole) {
        setInvitationStatus('Select role before restoring collaborator access.')
        return
      }
      const sent = sendWorkspaceInvitation(workspace.id, matchedName, nextRole)
      if (!sent) {
        setInvitationStatus('Restore invitation was not sent. Check owner access or duplicate pending invitation.')
        return
      }
      setInvitationStatus(
        `${sent.inviteeName} moved to pending as ${collaboratorRoleLabel(sent.role)}. Awaiting acceptance.`,
      )
      appendWorkspaceAuditLog(
        workspace.id,
        collaboratorStatusTransitionAuditMessage({
          collaboratorName: sent.inviteeName,
          fromStatus: 'removed',
          toStatus: 'pending',
          actorName: currentAuditActorName,
          role: sent.role,
        }),
      )
      return
    }

    if (!options?.skipRemoveConfirmation) {
      const removeConfirmed = window.confirm(
        `Remove collaborator "${collaboratorName}" from "${workspace.name}"?`,
      )
      if (!removeConfirmed) {
        return
      }
    }
    const matchedActiveName =
      workspace.collaborators.find(
        (value) => normalizeCollaboratorName(value).toLowerCase() === collaboratorKey,
      ) || collaboratorName
    const matchedActiveRole =
      workspace.collaboratorRoles?.[matchedActiveName] || 'editor'
    updateWorkspace(workspace.id, {
      removedCollaborators: [...(workspace.removedCollaborators || []), collaboratorName],
      updatedAt: new Date().toISOString(),
    })
    setInvitationStatus(`${collaboratorName} removed. Name retained in red banner.`)
    appendWorkspaceAuditLog(
      workspace.id,
      collaboratorStatusTransitionAuditMessage({
        collaboratorName,
        fromStatus: 'active',
        toStatus: 'removed',
        actorName: currentAuditActorName,
        role: matchedActiveRole,
      }),
    )
  }

  const onAcceptAuthorRequest = (requestId: string) => {
    const acceptedWorkspace = acceptAuthorRequest(requestId)
    if (!acceptedWorkspace) {
      setInvitationStatus('Author request could not be accepted.')
      return
    }
    setInvitationStatus(`Joined ${acceptedWorkspace.name}.`)
  }

  const onDeclineAuthorRequest = (requestId: string) => {
    declineAuthorRequest(requestId)
    setInvitationStatus('Author request declined.')
  }

  const onOpenWorkspace = (workspaceId: string) => {
    const workspace = workspaces.find((item) => item.id === workspaceId)
    if (workspace && isWorkspaceReadOnlyForCurrentUser(workspace, workspaceOwnerName)) {
      setInvitationStatus('This workspace is archived in read-only mode for your account.')
      return
    }
    setActiveWorkspaceId(workspaceId)
    navigate(`/w/${workspaceId}/overview`)
  }

  const onSelectWorkspace = (workspaceId: string) => {
    setWorkspaceDrilldownSelectionId(workspaceId)
    resetCollaboratorComposer()
    setActiveWorkspaceId(workspaceId)
    if (window.matchMedia('(min-width: 1280px)').matches) {
      setWorkspaceDrilldownDesktopOpen(true)
      return
    }
    navigate(`/w/${workspaceId}/overview`)
  }

  const buildWorkspacesReturnPath = () => {
    const params = new URLSearchParams()
    params.set('view', centerView)
    params.set('filter', filterKey)
    params.set('mode', viewMode)
    params.set('sort', sortColumn)
    params.set('dir', sortDirection)
    if (query.trim()) {
      params.set('q', query.trim())
    }
    const encoded = params.toString()
    return encoded ? `/workspaces?${encoded}` : '/workspaces'
  }

  const onOpenWorkspaceInboxForWorkspace = (workspaceId: string, focusUnread = false) => {
    const workspace = workspaces.find((item) => item.id === workspaceId)
    if (workspace && isWorkspaceReadOnlyForCurrentUser(workspace, workspaceOwnerName)) {
      setInvitationStatus('Read-only archived workspaces do not allow inbox actions.')
      return
    }
    const returnTo = buildWorkspacesReturnPath()
    const params = new URLSearchParams()
    params.set('returnTo', returnTo)
    const signal = workspaceInboxSignals[workspaceId]
    if (focusUnread && signal?.firstUnreadMessageId) {
      params.set('at', 'first-unread')
    }
    const encoded = params.toString()
    setActiveWorkspaceId(workspaceId)
    navigate(encoded ? `/w/${workspaceId}/inbox?${encoded}` : `/w/${workspaceId}/inbox`)
  }

  const onOpenWorkspaceInbox = () => {
    if (!inboxWorkspace) {
      return
    }
    const signal = workspaceInboxSignals[inboxWorkspace.id]
    onOpenWorkspaceInboxForWorkspace(inboxWorkspace.id, Boolean(signal?.unreadCount))
  }

  const onStartRenameWorkspace = (workspace: WorkspaceRecord) => {
    setRenamingWorkspaceId(workspace.id)
    setRenameDraft(workspace.name)
    setMenuState(null)
  }

  const onCancelRenameWorkspace = () => {
    setRenamingWorkspaceId(null)
    setRenameDraft('')
  }

  const onSaveRenameWorkspace = (workspace: WorkspaceRecord) => {
    const clean = renameDraft.trim()
    if (!clean || clean === workspace.name) {
      onCancelRenameWorkspace()
      return
    }
    updateWorkspace(workspace.id, {
      name: clean,
      updatedAt: new Date().toISOString(),
    })
    onCancelRenameWorkspace()
  }

  const onArchiveToggle = (workspace: WorkspaceRecord) => {
    updateWorkspace(workspace.id, {
      archived: !workspace.archived,
      updatedAt: new Date().toISOString(),
    })
    setMenuState(null)
  }

  const onDeleteWorkspace = (workspace: WorkspaceRecord) => {
    const confirmed = window.confirm(`Delete workspace "${workspace.name}"?`)
    if (!confirmed) {
      setMenuState(null)
      return
    }
    deleteWorkspace(workspace.id)
    setMenuState(null)
  }

  const onTogglePinned = (workspace: WorkspaceRecord) => {
    updateWorkspace(workspace.id, {
      pinned: !workspace.pinned,
      updatedAt: new Date().toISOString(),
    })
  }

  const onSort = (column: SortColumn) => {
    if (sortColumn === column) {
      setSortDirection((current) => (current === 'desc' ? 'asc' : 'desc'))
      return
    }
    setSortColumn(column)
    setSortDirection(column === 'updatedAt' ? 'desc' : 'asc')
  }

  const onToggleWorkspaceMenu = (workspaceId: string, event: ReactMouseEvent<HTMLButtonElement>) => {
    event.stopPropagation()
    const workspace = workspaces.find((item) => item.id === workspaceId)
    if (workspace && isWorkspaceReadOnlyForCurrentUser(workspace, workspaceOwnerName)) {
      return
    }
    const rect = event.currentTarget.getBoundingClientRect()
    const menuWidth = 160
    const menuHeight = 204
    const gap = 6
    const rightAlignedX = rect.right - menuWidth
    const x = Math.max(8, Math.min(rightAlignedX, window.innerWidth - menuWidth - 8))
    const openUp = window.innerHeight - rect.bottom < menuHeight + gap
    const y = openUp
      ? Math.max(8, rect.top - menuHeight - gap)
      : Math.min(rect.bottom + gap, window.innerHeight - menuHeight - 8)
    setMenuState((current) => (current?.workspaceId === workspaceId ? null : { workspaceId, x, y }))
  }

  const menuWorkspace =
    menuState ? workspaces.find((workspace) => workspace.id === menuState.workspaceId) || null : null
  const menuWorkspaceReadOnly = Boolean(
    menuWorkspace && isWorkspaceReadOnlyForCurrentUser(menuWorkspace, workspaceOwnerName),
  )
  const canInviteFromMenu = Boolean(
    menuWorkspace &&
    !menuWorkspaceReadOnly &&
    workspaceOwnerName &&
    menuWorkspace.ownerName.toLowerCase() === workspaceOwnerName.toLowerCase(),
  )

  return (
    <div className="flex h-screen flex-col bg-background text-foreground">
      <TopBar scope="workspace" onOpenLeftNav={() => setLeftPanelOpen(true)} />

      <div
        className={cn(
          'grid min-h-0 flex-1 grid-cols-1 nav:grid-cols-[var(--layout-left-nav-width)_minmax(0,1fr)]',
          centerView === 'workspaces' &&
            (workspaceDrilldownDesktopOpen
              ? 'xl:grid-cols-[var(--layout-left-nav-width)_minmax(0,1fr)_22rem]'
              : 'xl:grid-cols-[var(--layout-left-nav-width)_minmax(0,1fr)_3rem]'),
          centerView === 'data-library' &&
            (dataLibraryDrilldownDesktopOpen
              ? 'xl:grid-cols-[var(--layout-left-nav-width)_minmax(0,1fr)_22rem]'
              : 'xl:grid-cols-[var(--layout-left-nav-width)_minmax(0,1fr)_3rem]'),
        )}
      >
        <aside className="hidden border-r border-border nav:block">
          <WorkspacesHomeSidebar
            centerView={centerView}
            onSelectCenterView={setCenterView}
            onOpenInbox={onOpenWorkspaceInbox}
            incomingInvitationCount={incomingInvitationCount}
            outgoingInvitationCount={outgoingInvitationCount}
            canOpenInbox={canOpenInbox}
          />
        </aside>

        <main className="min-w-0 flex-1 overflow-hidden bg-background">
          <ScrollArea className="h-full">
            <div data-house-role="content-container" className="house-content-container house-content-container-wide space-y-4">
              <Row
                align="center"
                gap="md"
                wrap={false}
                className="house-page-title-row"
              >
                <SectionMarker tone={getSectionMarkerTone('workspace')} size="title" className="self-stretch h-auto" />
                <PageHeader
                  heading="My Workspaces"
                  description="Create and collaborate on research manuscripts with your team."
                  className="!ml-0 !mt-0"
                />
              </Row>

              <section className={cn('rounded-lg border border-border p-4', HOUSE_CARD_CLASS)}>
                <Toolbar>
                  <Input
                    value={newWorkspaceName}
                    onChange={(event) => setNewWorkspaceName(event.target.value)}
                    placeholder="New workspace name"
                    className={cn('w-sz-220', HOUSE_INPUT_CLASS)}
                  />
                  <Button
                    type="button"
                    variant="primary"
                    onClick={onCreateWorkspace}
                    disabled={!canCreateWorkspace}
                  >
                    Create workspace
                  </Button>
                </Toolbar>
                {!canCreateWorkspace ? (
                  <p className={cn('mt-3', HOUSE_FIELD_HELPER_CLASS)}>{WORKSPACE_OWNER_REQUIRED_MESSAGE}</p>
                ) : null}
                {createError ? (
                  <p className="mt-3 text-sm text-red-700">{createError}</p>
                ) : null}
                {invitationStatus ? (
                  <p className={cn('mt-3', HOUSE_FIELD_HELPER_CLASS)}>{invitationStatus}</p>
                ) : null}
              </section>

              <section className={cn('rounded-lg border border-border', HOUSE_CARD_CLASS)}>
                {centerView === 'workspaces' ? (
                  <>
                <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-4 py-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <Input
                      value={query}
                      onChange={(event) => setQuery(event.target.value)}
                      placeholder="Filter workspaces"
                      className={cn('w-sz-260', HOUSE_INPUT_CLASS, HOUSE_TABLE_FILTER_INPUT_CLASS)}
                    />
                    <SelectPrimitive value={filterKey} onValueChange={(value) => setFilterKey(value as FilterKey)}>
                      <SelectTrigger className={HOUSE_WORKSPACE_FILTER_SELECT_CLASS}>
                        <SelectValue placeholder="Filter" />
                      </SelectTrigger>
                      <SelectContent>
                        {FILTER_OPTIONS.map((option) => (
                          <SelectItem key={option.key} value={option.key}>
                            {option.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </SelectPrimitive>
                    {viewMode === 'cards' ? (
                      <SelectPrimitive value={sortColumn} onValueChange={(value) => onSort(value as SortColumn)}>
                        <SelectTrigger className={HOUSE_WORKSPACE_FILTER_SELECT_CLASS}>
                          <SelectValue placeholder="Sort" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="updatedAt">Sort: Updated</SelectItem>
                          <SelectItem value="name">Sort: Name</SelectItem>
                          <SelectItem value="stage">Sort: Stage</SelectItem>
                          <SelectItem value="status">Sort: Status</SelectItem>
                        </SelectContent>
                      </SelectPrimitive>
                    ) : null}
                    {viewMode === 'cards' ? (
                      <Button
                        type="button"
                        size="sm"
                        className={cn(HOUSE_ACTION_BUTTON_CLASS, HOUSE_BUTTON_TEXT_CLASS)}
                        onClick={() => setSortDirection((current) => (current === 'desc' ? 'asc' : 'desc'))}
                      >
                        {sortDirection === 'desc' ? 'Descending' : 'Ascending'}
                      </Button>
                    ) : null}
                  </div>
                  <div className={cn(HOUSE_SECTION_TOOLS_CLASS, HOUSE_SECTION_TOOLS_WORKSPACE_CLASS, HOUSE_ACTIONS_PILL_CLASS)}>
                    <Button
                      type="button"
                      size="sm"
                      className={cn(
                        HOUSE_ACTIONS_PILL_PRIMARY_CLASS,
                        HOUSE_BUTTON_TEXT_CLASS,
                        HOUSE_SECTION_TOOL_BUTTON_CLASS,
                        'h-8 gap-1.5 px-3',
                        'xl:hidden',
                      )}
                      onClick={() => {
                        setWorkspaceDrilldownSelectionId(null)
                        resetCollaboratorComposer()
                        setWorkspaceDrilldownMobileOpen(true)
                      }}
                    >
                      <PanelRightOpen className="mr-1 h-3.5 w-3.5" />
                      Drilldown
                    </Button>
                    <div className={HOUSE_ACTIONS_PILL_ICON_GROUP_CLASS}>
                      <button
                        type="button"
                        onClick={() => setViewMode('table')}
                        className={cn(
                          'h-8 px-3 text-sm',
                          HOUSE_ACTIONS_PILL_ICON_CLASS,
                          HOUSE_BUTTON_TEXT_CLASS,
                          HOUSE_SECTION_TOOL_BUTTON_CLASS,
                          HOUSE_SECTION_TOOL_TOGGLE_CLASS,
                          viewMode === 'table' ? HOUSE_SECTION_TOOL_TOGGLE_ON_CLASS : HOUSE_SECTION_TOOL_TOGGLE_OFF_CLASS,
                        )}
                      >
                        Table
                      </button>
                      <button
                        type="button"
                        onClick={() => setViewMode('cards')}
                        className={cn(
                          'h-8 px-3 text-sm',
                          HOUSE_ACTIONS_PILL_ICON_CLASS,
                          HOUSE_BUTTON_TEXT_CLASS,
                          HOUSE_SECTION_TOOL_BUTTON_CLASS,
                          HOUSE_SECTION_TOOL_TOGGLE_CLASS,
                          viewMode === 'cards' ? HOUSE_SECTION_TOOL_TOGGLE_ON_CLASS : HOUSE_SECTION_TOOL_TOGGLE_OFF_CLASS,
                        )}
                      >
                        Cards
                      </button>
                    </div>
                  </div>
                </div>

                {filteredWorkspaces.length === 0 ? (
                  <div className="p-6 text-sm text-muted-foreground">No workspaces match the current filter.</div>
                ) : viewMode === 'table' ? (
                  <div className={cn(HOUSE_TABLE_SHELL_CLASS, HOUSE_WORKSPACE_TABLE_SHELL_CLASS)}>
                    <table className="w-full min-w-sz-980 text-sm">
                      <thead className={HOUSE_TABLE_HEAD_CLASS}>
                        <tr>
                          <th className={cn('px-3 py-2', HOUSE_TABLE_HEAD_TEXT_CLASS)}>
                            <SortableHeader
                              label="Workspace"
                              column="name"
                              activeColumn={sortColumn}
                              direction={sortDirection}
                              onSort={onSort}
                            />
                          </th>
                          <th className={cn('px-3 py-2 text-center', HOUSE_TABLE_HEAD_TEXT_CLASS)}>Owner</th>
                          <th className={cn('px-3 py-2 text-center', HOUSE_TABLE_HEAD_TEXT_CLASS)}>Collaborators</th>
                          <th className={cn('px-3 py-2 text-center', HOUSE_TABLE_HEAD_TEXT_CLASS)}>
                            <SortableHeader
                              label="Stage"
                              column="stage"
                              activeColumn={sortColumn}
                              direction={sortDirection}
                              align="center"
                              onSort={onSort}
                            />
                          </th>
                          <th className={cn('px-3 py-2 text-center', HOUSE_TABLE_HEAD_TEXT_CLASS)}>
                            <SortableHeader
                              label="Status"
                              column="status"
                              activeColumn={sortColumn}
                              direction={sortDirection}
                              align="center"
                              onSort={onSort}
                            />
                          </th>
                          <th className={cn('px-3 py-2 text-center', HOUSE_TABLE_HEAD_TEXT_CLASS)}>Unread</th>
                        </tr>
                      </thead>
                      <tbody>
                        {filteredWorkspaces.map((workspace) => {
                          const signal = workspaceInboxSignals[workspace.id] || {
                            unreadCount: 0,
                            firstUnreadMessageId: null,
                            lastActivityAt: workspace.updatedAt,
                          }
                          const ownerLabel = workspaceOwnerLabel(workspace, workspaceOwnerName)
                          const workspaceReadOnly = isWorkspaceReadOnlyForCurrentUser(
                            workspace,
                            workspaceOwnerName,
                          )
                          return (
                            <tr
                              key={workspace.id}
                              className={cn(
                                HOUSE_TABLE_ROW_CLASS,
                                workspaceReadOnly ? 'cursor-default opacity-90' : 'cursor-pointer',
                              )}
                              onClick={() => onSelectWorkspace(workspace.id)}
                              onDoubleClick={() => {
                                if (workspaceReadOnly) {
                                  return
                                }
                                onOpenWorkspace(workspace.id)
                              }}
                            >
                              <td className={cn('px-3 py-2 align-middle font-medium', HOUSE_TABLE_CELL_TEXT_CLASS)}>
                                <div className="flex items-center justify-between gap-2">
                                  <div className="min-w-0 flex-1">
                                    {renamingWorkspaceId === workspace.id ? (
                                      <div className="flex items-center gap-1.5" onClick={(event) => event.stopPropagation()}>
                                        <Input
                                          value={renameDraft}
                                          onChange={(event) => setRenameDraft(event.target.value)}
                                          onKeyDown={(event) => {
                                            if (event.key === 'Enter') {
                                              event.preventDefault()
                                              onSaveRenameWorkspace(workspace)
                                            } else if (event.key === 'Escape') {
                                              event.preventDefault()
                                              onCancelRenameWorkspace()
                                            }
                                          }}
                                          className={cn('h-8 w-full', HOUSE_INPUT_CLASS)}
                                          autoFocus
                                        />
                                        <Button
                                          type="button"
                                          size="sm"
                                          className={cn(HOUSE_SUCCESS_ACTION_BUTTON_CLASS, WORKSPACE_ICON_BUTTON_DIMENSION_CLASS)}
                                          onClick={() => onSaveRenameWorkspace(workspace)}
                                          disabled={!renameDraft.trim() || renameDraft.trim() === workspace.name.trim()}
                                          aria-label={`Save rename for ${workspace.name}`}
                                          title="Save rename"
                                        >
                                          <Save className="h-4 w-4" />
                                        </Button>
                                        <Button
                                          type="button"
                                          size="sm"
                                          className={cn(HOUSE_DANGER_ACTION_BUTTON_CLASS, WORKSPACE_ICON_BUTTON_DIMENSION_CLASS)}
                                          onClick={onCancelRenameWorkspace}
                                          aria-label="Cancel rename"
                                          title="Cancel rename"
                                        >
                                          <X className="h-4 w-4" />
                                        </Button>
                                      </div>
                                    ) : (
                                      <>
                                        <p className="flex min-w-0 items-center gap-1.5">
                                          {workspace.pinned ? <Pin size={13} className="shrink-0 text-emerald-600" aria-label="Pinned workspace" /> : null}
                                          <span className="truncate">{workspace.name}</span>
                                        </p>
                                      </>
                                    )}
                                  </div>

                                  <WorkspaceMenuTrigger
                                    menuOpen={menuState?.workspaceId === workspace.id}
                                    disabled={workspaceReadOnly}
                                    onToggleMenu={(event) => onToggleWorkspaceMenu(workspace.id, event)}
                                  />
                                </div>
                              </td>
                              <td className={cn('px-3 py-2 align-middle text-center text-muted-foreground', HOUSE_TABLE_CELL_TEXT_CLASS)}>{ownerLabel}</td>
                              <td className={cn('px-3 py-2 align-middle text-center text-muted-foreground', HOUSE_TABLE_CELL_TEXT_CLASS)}>
                                <div className="flex justify-center">
                                  <CollaboratorBanners
                                    workspace={workspace}
                                    canManage={isWorkspaceOwner(workspace, workspaceOwnerName)}
                                    onAddCollaborator={onAddCollaborator}
                                    onToggleRemoved={onToggleCollaboratorRemoved}
                                  />
                                </div>
                              </td>
                              <td className={cn('px-3 py-2 align-middle text-center', HOUSE_TABLE_CELL_TEXT_CLASS)}>{workspaceStage(workspace)}</td>
                              <td className={cn('px-3 py-2 align-middle text-center', HOUSE_TABLE_CELL_TEXT_CLASS)}>
                                <div className="flex items-center justify-center gap-2">
                                  <span
                                    className={cn(
                                      'inline-block h-2.5 w-2.5 rounded-full',
                                      workspace.archived ? 'bg-amber-500' : 'bg-emerald-500',
                                    )}
                                  />
                                  <span>{workspaceStatus(workspace)}</span>
                                </div>
                              </td>
                              <td className={cn('px-3 py-2 align-middle text-center', HOUSE_TABLE_CELL_TEXT_CLASS)}>
                                <button
                                  type="button"
                                  className={cn(
                                    'inline-flex min-w-8 items-center justify-center rounded border px-2 py-0.5 text-xs font-medium',
                                    unreadToneClass(signal.unreadCount),
                                  )}
                                  onClick={(event) => {
                                    event.stopPropagation()
                                    if (workspaceReadOnly) {
                                      return
                                    }
                                    onOpenWorkspaceInboxForWorkspace(workspace.id, signal.unreadCount > 0)
                                  }}
                                  aria-label={`Open inbox for ${workspace.name}. ${signal.unreadCount} unread message${signal.unreadCount === 1 ? '' : 's'}.`}
                                  disabled={workspaceReadOnly}
                                >
                                  {signal.unreadCount}
                                </button>
                              </td>
                            </tr>
                          )
                        })}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <div className="grid gap-3 p-4 md:grid-cols-2 xl:grid-cols-3">
                    {filteredWorkspaces.map((workspace) => {
                      const signal = workspaceInboxSignals[workspace.id] || {
                        unreadCount: 0,
                        firstUnreadMessageId: null,
                        lastActivityAt: workspace.updatedAt,
                      }
                      const ownerLabel = workspaceOwnerLabel(workspace, workspaceOwnerName)
                      const workspaceReadOnly = isWorkspaceReadOnlyForCurrentUser(
                        workspace,
                        workspaceOwnerName,
                      )
                      return (
                        <button
                          key={workspace.id}
                          type="button"
                          onClick={() => onSelectWorkspace(workspace.id)}
                          onDoubleClick={() => {
                            if (workspaceReadOnly) {
                              return
                            }
                            onOpenWorkspace(workspace.id)
                          }}
                          className={cn(
                            'rounded-lg border border-border bg-background p-3 text-left',
                            workspaceReadOnly ? 'opacity-90' : 'hover:bg-accent/30',
                          )}
                        >
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0 flex-1">
                            {renamingWorkspaceId === workspace.id ? (
                              <div className="flex items-center gap-1.5" onClick={(event) => event.stopPropagation()}>
                                <Input
                                  value={renameDraft}
                                  onChange={(event) => setRenameDraft(event.target.value)}
                                  onKeyDown={(event) => {
                                    if (event.key === 'Enter') {
                                      event.preventDefault()
                                      onSaveRenameWorkspace(workspace)
                                    } else if (event.key === 'Escape') {
                                      event.preventDefault()
                                      onCancelRenameWorkspace()
                                    }
                                  }}
                                  className={cn('h-8 w-full', HOUSE_INPUT_CLASS)}
                                  autoFocus
                                />
                                <Button
                                  type="button"
                                  size="sm"
                                  className={cn(HOUSE_SUCCESS_ACTION_BUTTON_CLASS, WORKSPACE_ICON_BUTTON_DIMENSION_CLASS)}
                                  onClick={() => onSaveRenameWorkspace(workspace)}
                                  disabled={!renameDraft.trim() || renameDraft.trim() === workspace.name.trim()}
                                  aria-label={`Save rename for ${workspace.name}`}
                                  title="Save rename"
                                >
                                  <Save className="h-4 w-4" />
                                </Button>
                                <Button
                                  type="button"
                                  size="sm"
                                  className={cn(HOUSE_DANGER_ACTION_BUTTON_CLASS, WORKSPACE_ICON_BUTTON_DIMENSION_CLASS)}
                                  onClick={onCancelRenameWorkspace}
                                  aria-label="Cancel rename"
                                  title="Cancel rename"
                                >
                                  <X className="h-4 w-4" />
                                </Button>
                              </div>
                            ) : (
                              <>
                                <p className="flex min-w-0 items-center gap-1.5 font-medium">
                                  {workspace.pinned ? <Pin size={13} className="shrink-0 text-emerald-600" aria-label="Pinned workspace" /> : null}
                                  <span className="truncate">{workspace.name}</span>
                                </p>
                                <p className="mt-1 text-xs text-muted-foreground">{ownerLabel}</p>
                                <div className="mt-2 space-y-1" onClick={(event) => event.stopPropagation()}>
                                  <p className="text-xs text-muted-foreground">Collaborators</p>
                                  <CollaboratorBanners
                                    workspace={workspace}
                                    canManage={isWorkspaceOwner(workspace, workspaceOwnerName)}
                                    onAddCollaborator={onAddCollaborator}
                                    onToggleRemoved={onToggleCollaboratorRemoved}
                                  />
                                </div>
                                <p className="mt-1 text-xs text-muted-foreground">
                                  Last activity {formatTimestamp(signal.lastActivityAt)}
                                </p>
                              </>
                            )}
                          </div>
                          <WorkspaceMenuTrigger
                            menuOpen={menuState?.workspaceId === workspace.id}
                            disabled={workspaceReadOnly}
                            onToggleMenu={(event) => onToggleWorkspaceMenu(workspace.id, event)}
                          />
                        </div>
                        <div className="mt-3 flex flex-wrap items-center gap-2 text-xs">
                          <button
                            type="button"
                            className={cn(
                              'rounded border px-1.5 py-0.5 font-medium',
                              unreadToneClass(signal.unreadCount),
                            )}
                            onClick={(event) => {
                              event.stopPropagation()
                              if (workspaceReadOnly) {
                                return
                              }
                              onOpenWorkspaceInboxForWorkspace(workspace.id, signal.unreadCount > 0)
                            }}
                            disabled={workspaceReadOnly}
                          >
                            {signal.unreadCount}
                          </button>
                          <span className="rounded border border-border bg-muted/40 px-1.5 py-0.5">
                            {workspaceStage(workspace)}
                          </span>
                          <span className="rounded border border-border bg-muted/40 px-1.5 py-0.5">
                            {workspaceStatus(workspace)}
                          </span>
                          <button
                            type="button"
                            className="rounded border border-border bg-background px-1.5 py-0.5 text-muted-foreground hover:text-foreground"
                            onClick={(event) => {
                              event.stopPropagation()
                              if (workspaceReadOnly) {
                                return
                              }
                              onOpenWorkspaceInboxForWorkspace(workspace.id, signal.unreadCount > 0)
                            }}
                            disabled={workspaceReadOnly}
                          >
                            Open inbox
                          </button>
                        </div>
                        </button>
                      )
                    })}
                  </div>
                )}
                  </>
                ) : centerView === 'invitations' ? (
                  <>
                    <Row
                      align="center"
                      gap="md"
                      wrap={false}
                      className="house-page-title-row"
                    >
                      <SectionMarker tone={getSectionMarkerTone('workspace')} size="title" className="self-stretch h-auto" />
                      <PageHeader
                        heading="Invitations"
                        description="Manage invitations to collaborate on research manuscripts and datasets."
                        className="!ml-0 !mt-0"
                      />
                    </Row>

                    <div className="flex flex-wrap items-center gap-2 border-b border-border px-4 py-3">
                      <span className="inline-flex items-center gap-1 rounded border border-border bg-background px-2 py-1 text-xs text-muted-foreground">
                        <span className="inline-block h-2 w-2 rounded-full bg-emerald-500" />
                        Incoming {incomingInvitationCount}
                      </span>
                      <span className="inline-flex items-center gap-1 rounded border border-border bg-background px-2 py-1 text-xs text-muted-foreground">
                        <span className="inline-block h-2 w-2 rounded-full bg-red-500" />
                        Outgoing {outgoingInvitationCount}
                      </span>
                    </div>

                    {invitationRows.length === 0 ? (
                      <div className={cn('p-6', HOUSE_FIELD_HELPER_CLASS)}>
                        No invitations at the moment.
                      </div>
                    ) : (
                      <div className={HOUSE_TABLE_SHELL_CLASS}>
                        <table className="w-full min-w-sz-760 text-sm">
                          <thead className={cn('text-left', HOUSE_TABLE_HEAD_CLASS)}>
                            <tr>
                              <th className={cn('px-3 py-2', HOUSE_TABLE_HEAD_TEXT_CLASS)}>Direction</th>
                              <th className={cn('px-3 py-2', HOUSE_TABLE_HEAD_TEXT_CLASS)}>Workspace</th>
                              <th className={cn('px-3 py-2', HOUSE_TABLE_HEAD_TEXT_CLASS)}>Person</th>
                              <th className={cn('px-3 py-2', HOUSE_TABLE_HEAD_TEXT_CLASS)}>Role</th>
                              <th className={cn('px-3 py-2', HOUSE_TABLE_HEAD_TEXT_CLASS)}>Invited</th>
                              <th className={cn('px-3 py-2', HOUSE_TABLE_HEAD_TEXT_CLASS)}>Status</th>
                              <th className={cn('px-3 py-2', HOUSE_TABLE_HEAD_TEXT_CLASS)}>Actions</th>
                            </tr>
                          </thead>
                          <tbody>
                            {invitationRows.map((invitation) => (
                              <tr key={`${invitation.direction}-${invitation.id}`} className={HOUSE_TABLE_ROW_CLASS}>
                                <td className={cn('px-3 py-2', HOUSE_TABLE_CELL_TEXT_CLASS)}>
                                  <span className="inline-flex items-center gap-1.5 text-muted-foreground">
                                    <span
                                      className={cn(
                                        'inline-block h-2 w-2 rounded-full',
                                        invitation.direction === 'incoming' ? 'bg-emerald-500' : 'bg-red-500',
                                      )}
                                    />
                                    {invitation.direction === 'incoming' ? 'Incoming' : 'Outgoing'}
                                  </span>
                                </td>
                                <td className={cn('px-3 py-2 font-medium', HOUSE_TABLE_CELL_TEXT_CLASS)}>{invitation.workspaceName}</td>
                                <td className={cn('px-3 py-2 text-muted-foreground', HOUSE_TABLE_CELL_TEXT_CLASS)}>{invitation.personName}</td>
                                <td className={cn('px-3 py-2 text-muted-foreground', HOUSE_TABLE_CELL_TEXT_CLASS)}>
                                  {collaboratorRoleLabel(invitation.role)}
                                </td>
                                <td className={cn('px-3 py-2 text-muted-foreground', HOUSE_TABLE_CELL_TEXT_CLASS)}>{formatTimestamp(invitation.invitedAt)}</td>
                                <td className={cn('px-3 py-2', HOUSE_TABLE_CELL_TEXT_CLASS)}>
                                  <span className="text-muted-foreground">
                                    {invitation.status.charAt(0).toUpperCase() + invitation.status.slice(1)}
                                  </span>
                                </td>
                                <td className={cn('px-3 py-2', HOUSE_TABLE_CELL_TEXT_CLASS)}>
                                  {invitation.direction === 'incoming' ? (
                                    <div className="flex items-center gap-2">
                                      <Button
                                        type="button"
                                        size="sm"
                                        className={cn(HOUSE_PRIMARY_ACTION_BUTTON_CLASS, HOUSE_BUTTON_TEXT_CLASS)}
                                        onClick={() => onAcceptAuthorRequest(invitation.id)}
                                      >
                                        Accept
                                      </Button>
                                      <Button
                                        type="button"
                                        size="sm"
                                        className={cn(HOUSE_ACTION_BUTTON_CLASS, HOUSE_BUTTON_TEXT_CLASS)}
                                        onClick={() => onDeclineAuthorRequest(invitation.id)}
                                      >
                                        Decline
                                      </Button>
                                    </div>
                                  ) : (
                                    invitation.status === 'pending' ? (
                                      <Button
                                        type="button"
                                        size="sm"
                                        className={cn(HOUSE_ACTION_BUTTON_CLASS, HOUSE_BUTTON_TEXT_CLASS)}
                                        onClick={() => onCancelPendingInvitation(invitation.id)}
                                      >
                                        Cancel
                                      </Button>
                                    ) : (
                                      <span className="text-xs text-muted-foreground">No actions</span>
                                    )
                                  )}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </>
                ) : (
                  <WorkspacesDataLibraryView onOpenDrilldownMobile={() => setDataLibraryDrilldownMobileOpen(true)} />
                )}
              </section>
            </div>
          </ScrollArea>
        </main>

        {centerView === 'workspaces' ? (
          <aside className="hidden border-l border-border xl:block">
            {workspaceDrilldownDesktopOpen ? (
              <ScrollArea className="h-full">
                <div className="space-y-3 p-3">
                  <div className="flex justify-end">
                    <button
                      type="button"
                      onClick={() => setWorkspaceDrilldownDesktopOpen(false)}
                      className={cn(HOUSE_DRILLDOWN_ACTION_CLASS, 'inline-flex h-8 w-8 items-center justify-center p-0')}
                      aria-label="Collapse workspace drilldown panel"
                      title="Collapse workspace drilldown panel"
                    >
                      <PanelRightClose className="h-4 w-4" />
                    </button>
                  </div>
                  <WorkspacesDrilldownPanel
                    selectedWorkspaceId={workspaceDrilldownSelectionId}
                    selectedWorkspaceName={workspaceDrilldownSelectionName}
                    selectedWorkspace={workspaceDrilldownSelection}
                    selectedWorkspaceReadOnly={selectedWorkspaceReadOnly}
                    currentWorkspaceUserName={workspaceOwnerName}
                    collaboratorChips={selectedWorkspaceCollaboratorChips}
                    workspaceAuditEntries={selectedWorkspaceAuditEntries}
                    canManageSelectedWorkspace={canManageSelectedWorkspace}
                    collaboratorComposerOpen={collaboratorComposerOpen}
                    collaboratorInviteRole={collaboratorInviteRole}
                    collaboratorQuery={collaboratorQuery}
                    canConfirmAddCollaborator={canConfirmAddCollaborator}
                    onOpenCollaboratorComposer={toggleCollaboratorComposer}
                    onCollaboratorInviteRoleChange={(role) => {
                      setCollaboratorInviteRole(role)
                    }}
                    onChangeCollaboratorRole={onChangeCollaboratorRole}
                    onCancelPendingCollaboratorInvitation={onCancelPendingCollaboratorInvitation}
                    onToggleCollaboratorRemoved={onToggleCollaboratorRemoved}
                    onCollaboratorQueryChange={(value) => {
                      setCollaboratorQuery(value)
                    }}
                    onConfirmAddCollaborator={onConfirmAddCollaborator}
                    onOpenSelectedWorkspace={onOpenWorkspace}
                  />
                </div>
              </ScrollArea>
            ) : (
              <div className="flex h-full items-start justify-center pt-3">
                <div className={cn(HOUSE_SECTION_TOOLS_CLASS, HOUSE_SECTION_TOOLS_WORKSPACE_CLASS, HOUSE_ACTIONS_PILL_CLASS)}>
                  <button
                    type="button"
                    onClick={() => {
                      setWorkspaceDrilldownSelectionId(null)
                      resetCollaboratorComposer()
                      setWorkspaceDrilldownDesktopOpen(true)
                    }}
                    className={cn(
                      HOUSE_ACTIONS_PILL_ICON_CLASS,
                      HOUSE_SECTION_TOOL_BUTTON_CLASS,
                      'inline-flex h-8 w-8 items-center justify-center p-0',
                    )}
                    aria-label="Expand workspace drilldown panel"
                    title="Expand workspace drilldown panel"
                  >
                    <PanelRightOpen className="h-4 w-4" />
                  </button>
                </div>
              </div>
            )}
          </aside>
        ) : centerView === 'data-library' ? (
          <aside className="hidden border-l border-border xl:block">
            {dataLibraryDrilldownDesktopOpen ? (
              <ScrollArea className="h-full">
                <div className="space-y-3 p-3">
                  <div className="flex justify-end">
                    <button
                      type="button"
                      onClick={() => setDataLibraryDrilldownDesktopOpen(false)}
                      className={cn(HOUSE_DRILLDOWN_ACTION_CLASS, 'inline-flex h-8 w-8 items-center justify-center p-0')}
                      aria-label="Collapse data library drilldown panel"
                      title="Collapse data library drilldown panel"
                    >
                      <PanelRightClose className="h-4 w-4" />
                    </button>
                  </div>
                  <DataLibraryDrilldownPanel />
                </div>
              </ScrollArea>
            ) : (
              <div className="flex h-full items-start justify-center pt-3">
                <div className={cn(HOUSE_SECTION_TOOLS_CLASS, HOUSE_SECTION_TOOLS_DATA_CLASS, HOUSE_ACTIONS_PILL_CLASS)}>
                  <button
                    type="button"
                    onClick={() => setDataLibraryDrilldownDesktopOpen(true)}
                    className={cn(
                      HOUSE_ACTIONS_PILL_ICON_CLASS,
                      HOUSE_SECTION_TOOL_BUTTON_CLASS,
                      'inline-flex h-8 w-8 items-center justify-center p-0',
                    )}
                    aria-label="Expand data library drilldown panel"
                    title="Expand data library drilldown panel"
                  >
                    <PanelRightOpen className="h-4 w-4" />
                  </button>
                </div>
              </div>
            )}
          </aside>
        ) : null}
      </div>

      <Sheet open={workspaceDrilldownMobileOpen} onOpenChange={setWorkspaceDrilldownMobileOpen}>
        <SheetContent side="right" className={HOUSE_DRILLDOWN_SHEET_CLASS}>
          <WorkspacesDrilldownPanel
            selectedWorkspaceId={workspaceDrilldownSelectionId}
            selectedWorkspaceName={workspaceDrilldownSelectionName}
            selectedWorkspace={workspaceDrilldownSelection}
            selectedWorkspaceReadOnly={selectedWorkspaceReadOnly}
            currentWorkspaceUserName={workspaceOwnerName}
            collaboratorChips={selectedWorkspaceCollaboratorChips}
            workspaceAuditEntries={selectedWorkspaceAuditEntries}
            canManageSelectedWorkspace={canManageSelectedWorkspace}
            collaboratorComposerOpen={collaboratorComposerOpen}
            collaboratorInviteRole={collaboratorInviteRole}
            collaboratorQuery={collaboratorQuery}
            canConfirmAddCollaborator={canConfirmAddCollaborator}
            onOpenCollaboratorComposer={toggleCollaboratorComposer}
            onCollaboratorInviteRoleChange={(role) => {
              setCollaboratorInviteRole(role)
            }}
            onChangeCollaboratorRole={onChangeCollaboratorRole}
            onCancelPendingCollaboratorInvitation={onCancelPendingCollaboratorInvitation}
            onToggleCollaboratorRemoved={onToggleCollaboratorRemoved}
            onCollaboratorQueryChange={(value) => {
              setCollaboratorQuery(value)
            }}
            onConfirmAddCollaborator={onConfirmAddCollaborator}
            onOpenSelectedWorkspace={onOpenWorkspace}
          />
        </SheetContent>
      </Sheet>

      <Sheet open={dataLibraryDrilldownMobileOpen} onOpenChange={setDataLibraryDrilldownMobileOpen}>
        <SheetContent side="right" className={HOUSE_DRILLDOWN_SHEET_CLASS}>
          <DataLibraryDrilldownPanel />
        </SheetContent>
      </Sheet>

      <Sheet open={leftPanelOpen} onOpenChange={setLeftPanelOpen}>
        <SheetContent side="left" className="w-[var(--layout-left-nav-width-mobile)] p-0 nav:hidden">
          <WorkspacesHomeSidebar
            centerView={centerView}
            onSelectCenterView={setCenterView}
            onOpenInbox={onOpenWorkspaceInbox}
            incomingInvitationCount={incomingInvitationCount}
            outgoingInvitationCount={outgoingInvitationCount}
            canOpenInbox={canOpenInbox}
            onNavigate={() => setLeftPanelOpen(false)}
          />
        </SheetContent>
      </Sheet>

      {menuState && menuWorkspace
        ? createPortal(
            <div className="fixed inset-0 z-50" data-ui="workspace-menu-overlay" onClick={() => setMenuState(null)}>
              <div
                data-workspace-menu="true"
                data-ui="workspace-menu-shell"
                className="fixed w-40 rounded-md border border-border bg-card p-1 shadow-lg"
                style={{ left: menuState.x, top: menuState.y }}
                onClick={(event) => event.stopPropagation()}
              >
                <button
                  type="button"
                  data-house-role="workspace-menu-item-open"
                  className={cn(
                    'block w-full rounded px-2 py-1.5 text-left text-sm hover:bg-accent/50',
                    menuWorkspaceReadOnly && 'cursor-not-allowed text-muted-foreground hover:bg-transparent',
                  )}
                  onClick={() => {
                    if (menuWorkspaceReadOnly) {
                      return
                    }
                    onOpenWorkspace(menuWorkspace.id)
                    setMenuState(null)
                  }}
                  disabled={menuWorkspaceReadOnly}
                >
                  Open workspace
                </button>
                <button
                  type="button"
                  data-house-role="workspace-menu-item-invite"
                  className={cn(
                    'block w-full rounded px-2 py-1.5 text-left text-sm hover:bg-accent/50',
                    !canInviteFromMenu && 'cursor-not-allowed text-muted-foreground hover:bg-transparent',
                  )}
                  onClick={() => onInviteCollaborator(menuWorkspace)}
                  disabled={!canInviteFromMenu}
                >
                  Invite collaborator
                </button>
                <button
                  type="button"
                  data-house-role="workspace-menu-item-rename"
                  className={cn(
                    'block w-full rounded px-2 py-1.5 text-left text-sm hover:bg-accent/50',
                    menuWorkspaceReadOnly && 'cursor-not-allowed text-muted-foreground hover:bg-transparent',
                  )}
                  onClick={() => {
                    if (menuWorkspaceReadOnly) {
                      return
                    }
                    onStartRenameWorkspace(menuWorkspace)
                  }}
                  disabled={menuWorkspaceReadOnly}
                >
                  Rename
                </button>
                <button
                  type="button"
                  data-house-role="workspace-menu-item-pin"
                  className={cn(
                    'block w-full rounded px-2 py-1.5 text-left text-sm hover:bg-accent/50',
                    menuWorkspaceReadOnly && 'cursor-not-allowed text-muted-foreground hover:bg-transparent',
                  )}
                  onClick={() => {
                    if (menuWorkspaceReadOnly) {
                      return
                    }
                    onTogglePinned(menuWorkspace)
                    setMenuState(null)
                  }}
                  disabled={menuWorkspaceReadOnly}
                >
                  {menuWorkspace.pinned ? 'Unpin' : 'Pin'}
                </button>
                <button
                  type="button"
                  data-house-role="workspace-menu-item-archive"
                  className={cn(
                    'block w-full rounded px-2 py-1.5 text-left text-sm hover:bg-accent/50',
                    menuWorkspaceReadOnly && 'cursor-not-allowed text-muted-foreground hover:bg-transparent',
                  )}
                  onClick={() => {
                    if (menuWorkspaceReadOnly) {
                      return
                    }
                    onArchiveToggle(menuWorkspace)
                  }}
                  disabled={menuWorkspaceReadOnly}
                >
                  {menuWorkspace.archived ? 'Restore' : 'Archive'}
                </button>
                <button
                  type="button"
                  data-house-role="workspace-menu-item-delete"
                  className={cn(
                    'block w-full rounded px-2 py-1.5 text-left text-sm text-red-700 hover:bg-red-50',
                    menuWorkspaceReadOnly && 'cursor-not-allowed text-muted-foreground hover:bg-transparent',
                  )}
                  onClick={() => {
                    if (menuWorkspaceReadOnly) {
                      return
                    }
                    onDeleteWorkspace(menuWorkspace)
                  }}
                  disabled={menuWorkspaceReadOnly}
                >
                  Delete
                </button>
              </div>
            </div>,
            document.body,
          )
        : null}
    </div>
  )
}

