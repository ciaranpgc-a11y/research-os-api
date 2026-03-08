import {
  type ComponentPropsWithoutRef,
  type ReactNode,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type MouseEvent as ReactMouseEvent,
  type PointerEvent as ReactPointerEvent,
} from 'react'
import { createPortal } from 'react-dom'
import { useNavigate, useSearchParams } from 'react-router-dom'
import {
  Archive,
  ArrowRight,
  Check,
  ChevronDown,
  ChevronUp,
  ChevronsUpDown,
  Download,
  Lock,
  LockOpen,
  Filter,
  GripVertical,
  Hammer,
  Pencil,
  Pin,
  Plus,
  RotateCcw,
  Search,
  Save,
  Send,
  Settings,
  Share2,
  UserMinus,
  X,
} from 'lucide-react'

import { TopBar } from '@/components/layout/top-bar'
import { DrilldownSheet, PageHeader, Row, Section, SectionHeader, Stack, Toolbar } from '@/components/primitives'
import { SectionMarker, SectionToolIconButton, SectionTools } from '@/components/patterns'
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
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
  ScrollArea,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui'
import { WorkspacesDataLibraryView } from '@/pages/workspaces-data-library-view'
import {
  WORKSPACE_OWNER_REQUIRED_MESSAGE,
  readWorkspaceOwnerNameFromProfile,
} from '@/lib/workspace-owner'
import { drilldownTabFlexGrow } from '@/components/publications/house-drilldown-header-utils'
import { houseActions, houseCollaborators, houseDrilldown, houseForms, houseLayout, houseMotion, houseNavigation, houseSurfaces, houseTables, houseTypography } from '@/lib/house-style'
import { getHouseLeftBorderToneClass, getHouseNavToneClass, getSectionMarkerTone } from '@/lib/section-tone'
import { matchesScopedStorageEventKey, readStorageScopeUserId } from '@/lib/user-scoped-storage'
import { cn } from '@/lib/utils'
import { getAuthSessionToken } from '@/lib/auth-session'
import { searchWorkspaceAccountsApi, type WorkspaceAccountSearchResult } from '@/lib/workspace-api'
import { useAaweStore } from '@/store/use-aawe-store'
import {
  INBOX_MESSAGES_STORAGE_KEY,
  INBOX_READS_STORAGE_KEY,
  type WorkspaceInboxMessageRecord,
  useWorkspaceInboxStore,
} from '@/store/use-workspace-inbox-store'
import {
  useWorkspaceStore,
  type WorkspaceAuditCategory,
  type WorkspaceAuditEventType,
  type WorkspaceAuditLogEntry,
  type WorkspaceCollaboratorRole,
  type WorkspaceParticipant,
  type WorkspaceRecord,
} from '@/store/use-workspace-store'

type ViewMode = 'table' | 'cards'
type CenterView = 'workspaces' | 'invitations' | 'data-library'
type WorkspaceScope = 'all' | 'active' | 'archived'
type InvitationTypeFilter = 'all' | 'workspace' | 'data'
type FilterKey = 'all' | 'pinned' | 'recent'
type SortColumn = 'name' | 'stage' | 'updatedAt' | 'status'
type SortDirection = 'asc' | 'desc'
type WorkspaceTableDensity = 'compact' | 'default' | 'comfortable'
type WorkspaceDrilldownTab = 'overview' | 'data' | 'actions' | 'logs'
type WorkspaceTableColumnKey = 'workspace' | 'collaborators' | 'stage' | 'unread' | 'open'
type WorkspaceTableColumnPreference = {
  visible: boolean
  width: number
}

type CollaboratorChipState = 'active' | 'removed' | 'pending'

type CollaboratorChipEntry = {
  key: string
  userId: string
  name: string
  state: CollaboratorChipState
  role: WorkspaceCollaboratorRole
}

type WorkspaceMemberActionIntent =
  | { workspaceId: string; chipKey: string; action: 'change-role' | 'reinstate-member' }
  | { workspaceId: string; action: 'edit-pending' }

type WorkspaceAuditEntry = WorkspaceAuditLogEntry
type WorkspaceAuditEntryDraft = {
  category?: WorkspaceAuditCategory
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
}

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
  { key: 'pinned', label: 'Pinned' },
  { key: 'recent', label: 'Recent (14 days)' },
]

const WORKSPACE_SCOPE_OPTIONS: Array<{ value: WorkspaceScope; label: string }> = [
  { value: 'all', label: 'All' },
  { value: 'active', label: 'Active' },
  { value: 'archived', label: 'Archived' },
]

const INVITATION_TYPE_FILTER_OPTIONS: Array<{ value: InvitationTypeFilter; label: string }> = [
  { value: 'all', label: 'All' },
  { value: 'workspace', label: 'Workspace' },
  { value: 'data', label: 'Data' },
]

const WORKSPACE_DRILLDOWN_TABS: Array<{ id: WorkspaceDrilldownTab; label: string }> = [
  { id: 'overview', label: 'Overview' },
  { id: 'data', label: 'Data' },
  { id: 'actions', label: 'Members' },
  { id: 'logs', label: 'Logs' },
]

const HOUSE_SECTION_TITLE_CLASS = houseTypography.sectionTitle
const HOUSE_PAGE_HEADER_CLASS = houseLayout.pageHeader
const HOUSE_SECTION_ANCHOR_CLASS = houseLayout.sectionAnchor
const HOUSE_SIDEBAR_FRAME_CLASS = houseLayout.sidebarFrame
const HOUSE_SIDEBAR_CLASS = houseLayout.sidebar
const HOUSE_SIDEBAR_SCROLL_CLASS = houseLayout.sidebarScroll
const HOUSE_SIDEBAR_HEADER_CLASS = houseLayout.sidebarHeader
const HOUSE_SIDEBAR_BODY_CLASS = houseLayout.sidebarBody
const HOUSE_SIDEBAR_SECTION_CLASS = houseLayout.sidebarSection
const HOUSE_FIELD_HELPER_CLASS = houseTypography.fieldHelper
const HOUSE_BUTTON_TEXT_CLASS = houseTypography.buttonText
const HOUSE_LEFT_BORDER_CLASS = cn(houseSurfaces.leftBorder, getHouseLeftBorderToneClass('workspace'))
const HOUSE_CARD_CLASS = houseSurfaces.card
const HOUSE_TABLE_HEAD_TEXT_CLASS = houseTypography.tableHead
const HOUSE_TABLE_CELL_TEXT_CLASS = houseTypography.tableCell
const HOUSE_TABLE_SORT_TRIGGER_CLASS = houseTables.sortTrigger
const HOUSE_INPUT_CLASS = houseForms.input
const HOUSE_PRIMARY_ACTION_BUTTON_CLASS = houseForms.actionButtonPrimary
const HOUSE_SUCCESS_ACTION_BUTTON_CLASS = houseForms.actionButtonSuccess
const HOUSE_DANGER_ACTION_BUTTON_CLASS = houseForms.actionButtonDanger
const HOUSE_COLLABORATOR_CHIP_CLASS = houseCollaborators.chip
const HOUSE_COLLABORATOR_CHIP_ACTIVE_CLASS = houseCollaborators.chipActive
const HOUSE_COLLABORATOR_CHIP_PENDING_CLASS = houseCollaborators.chipPending
const HOUSE_COLLABORATOR_CHIP_REMOVED_CLASS = houseCollaborators.chipRemoved
const HOUSE_COLLABORATOR_ACTION_ICON_CLASS = houseCollaborators.actionIcon
const HOUSE_COLLABORATOR_ACTION_ICON_ADD_CLASS = houseCollaborators.actionIconAdd
const HOUSE_COLLABORATOR_ACTION_ICON_EDIT_CLASS = houseCollaborators.actionIconEdit
const HOUSE_COLLABORATOR_ACTION_ICON_CONFIRM_CLASS = houseCollaborators.actionIconConfirm
const HOUSE_COLLABORATOR_ACTION_ICON_DISCARD_CLASS = houseCollaborators.actionIconDiscard
const WORKSPACE_SELECT_TONE_CLASS = 'house-select-tone-workspace'
const HOUSE_NAV_SECTION_LABEL_CLASS = houseNavigation.sectionLabel
const HOUSE_NAV_LIST_CLASS = houseNavigation.list
const HOUSE_NAV_ITEM_CLASS = houseNavigation.item
const HOUSE_NAV_ITEM_ACTIVE_CLASS = houseNavigation.itemActive
const HOUSE_NAV_ITEM_WORKSPACE_CLASS = getHouseNavToneClass('workspace')
const HOUSE_NAV_ITEM_LABEL_CLASS = houseNavigation.itemLabel
const HOUSE_DRILLDOWN_SHEET_CLASS = houseDrilldown.sheet
const HOUSE_DRILLDOWN_SHEET_BODY_CLASS = houseDrilldown.sheetBody
const HOUSE_WORKSPACE_TONE_CLASS = getHouseLeftBorderToneClass('workspace')
const HOUSE_DRILLDOWN_SECTION_LABEL_CLASS = houseDrilldown.sectionLabel
const HOUSE_DRILLDOWN_TAB_LIST_CLASS = houseDrilldown.tabList
const HOUSE_DRILLDOWN_TAB_TRIGGER_CLASS = houseDrilldown.tabTrigger
const HOUSE_DRILLDOWN_TOGGLE_MUTED_CLASS = houseDrilldown.toggleButtonMuted
const HOUSE_DRILLDOWN_COLLAPSIBLE_SECTION_CLASS = houseDrilldown.collapsibleSection
const HOUSE_DRILLDOWN_COLLAPSIBLE_ENTITY_CLASS = houseDrilldown.collapsibleEntity
const HOUSE_TOGGLE_BUTTON_CLASS = houseMotion.toggleButton
const WORKSPACE_ICON_BUTTON_DIMENSION_CLASS = 'h-8 w-8 p-0'
const HOUSE_ACTIONS_PILL_TABLE_BODY_TEXT_CLASS = houseActions.actionPillTableBodyText
const WORKSPACE_TABLE_COLUMN_ORDER: WorkspaceTableColumnKey[] = [
  'workspace',
  'collaborators',
  'stage',
  'unread',
  'open',
]
const WORKSPACE_TABLE_COLUMN_DEFINITIONS: Record<
  WorkspaceTableColumnKey,
  { label: string; headerClassName?: string; cellClassName?: string }
> = {
  workspace: {
    label: 'Workspace name',
    headerClassName: 'text-left',
    cellClassName: 'align-top font-medium whitespace-normal break-words leading-tight',
  },
  collaborators: {
    label: 'Team members',
    headerClassName: 'text-center',
    cellClassName: 'align-top text-left whitespace-nowrap text-muted-foreground',
  },
  stage: {
    label: 'Stage',
    headerClassName: 'text-center',
    cellClassName: 'align-top text-center whitespace-nowrap',
  },
  unread: {
    label: 'Unread',
    headerClassName: 'text-center',
    cellClassName: 'align-top text-center whitespace-nowrap',
  },
  open: {
    label: 'Open',
    headerClassName: 'text-center',
    cellClassName: 'align-top text-center whitespace-nowrap',
  },
}
const WORKSPACE_TABLE_COLUMN_SORT_COLUMN: Partial<Record<WorkspaceTableColumnKey, SortColumn>> = {
  workspace: 'name',
  stage: 'stage',
}
const WORKSPACE_TABLE_COLUMN_DEFAULTS: Record<WorkspaceTableColumnKey, WorkspaceTableColumnPreference> = {
  workspace: { visible: true, width: 280 },
  collaborators: { visible: true, width: 220 },
  stage: { visible: true, width: 120 },
  unread: { visible: true, width: 110 },
  open: { visible: true, width: 92 },
}
const WORKSPACE_TABLE_COLUMN_MIN_WIDTH: Record<WorkspaceTableColumnKey, number> = {
  workspace: 220,
  collaborators: 180,
  stage: 96,
  unread: 96,
  open: 84,
}
const WORKSPACE_TABLE_COLUMN_MAX_WIDTH: Record<WorkspaceTableColumnKey, number> = {
  workspace: 520,
  collaborators: 340,
  stage: 180,
  unread: 160,
  open: 104,
}
const WORKSPACE_TABLE_COLUMN_HARD_MIN = 56
const WORKSPACE_TABLE_LAYOUT_FALLBACK_WIDTH = 1080

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

function workspaceStageBase(workspace: WorkspaceRecord): string {
  if (workspace.health === 'red') {
    return 'QC'
  }
  if (workspace.health === 'amber') {
    return 'Plan'
  }
  return 'Draft'
}

function workspaceStage(workspace: WorkspaceRecord): string {
  return workspaceStageBase(workspace)
}

function workspaceStatus(workspace: WorkspaceRecord): 'Active' | 'Archived' | 'Locked' {
  if (workspace.ownerArchived) {
    return 'Locked'
  }
  return workspace.archived ? 'Archived' : 'Active'
}

function workspaceOwnerDisplayName(workspace: WorkspaceRecord): string {
  return normalizeCollaboratorName(workspace.ownerName) || 'the owner'
}

function workspaceOwnerCompactReference(workspace: WorkspaceRecord, currentUserId: string | null): string {
  return isWorkspaceOwner(workspace, currentUserId) ? 'you' : workspaceOwnerDisplayName(workspace)
}

function workspaceOwnerSentenceReference(workspace: WorkspaceRecord): string {
  return workspaceOwnerDisplayName(workspace)
}

function workspaceOwnerActionSentenceReference(workspace: WorkspaceRecord, currentUserId: string | null): string {
  return isWorkspaceOwner(workspace, currentUserId) ? 'you' : workspaceOwnerSentenceReference(workspace)
}

function workspaceLockedBadgeLabel(
  workspace: WorkspaceRecord,
  currentUserId: string | null,
): string {
  return `Locked by ${workspaceOwnerCompactReference(workspace, currentUserId)}`
}

function clampWorkspaceTableColumnWidth(
  column: WorkspaceTableColumnKey,
  value: number,
): number {
  const min = WORKSPACE_TABLE_COLUMN_HARD_MIN
  const max = WORKSPACE_TABLE_COLUMN_MAX_WIDTH[column]
  return Math.max(min, Math.min(max, Math.round(Number(value) || WORKSPACE_TABLE_COLUMN_DEFAULTS[column].width)))
}

function workspaceTableColumnsEqual(
  left: Record<WorkspaceTableColumnKey, WorkspaceTableColumnPreference>,
  right: Record<WorkspaceTableColumnKey, WorkspaceTableColumnPreference>,
): boolean {
  return WORKSPACE_TABLE_COLUMN_ORDER.every((column) => (
    left[column].visible === right[column].visible &&
    left[column].width === right[column].width
  ))
}

function clampWorkspaceTableColumnsToAvailableWidth(input: {
  columns: Record<WorkspaceTableColumnKey, WorkspaceTableColumnPreference>
  columnOrder: WorkspaceTableColumnKey[]
  availableWidth: number
}): Record<WorkspaceTableColumnKey, WorkspaceTableColumnPreference> {
  const next: Record<WorkspaceTableColumnKey, WorkspaceTableColumnPreference> = {
    workspace: { ...input.columns.workspace },
    collaborators: { ...input.columns.collaborators },
    stage: { ...input.columns.stage },
    unread: { ...input.columns.unread },
    open: { ...input.columns.open },
  }
  const visibleColumns = input.columnOrder.filter((column) => next[column].visible)
  if (visibleColumns.length === 0) {
    return next
  }

  const containerBudget = Math.max(
    visibleColumns.length * WORKSPACE_TABLE_COLUMN_HARD_MIN,
    Math.round(Number(input.availableWidth) || 0),
  )
  const preferredWidths = visibleColumns.reduce<Record<WorkspaceTableColumnKey, number>>((accumulator, column) => {
    accumulator[column] = clampWorkspaceTableColumnWidth(
      column,
      Number(next[column].width || WORKSPACE_TABLE_COLUMN_DEFAULTS[column].width),
    )
    return accumulator
  }, {
    workspace: WORKSPACE_TABLE_COLUMN_DEFAULTS.workspace.width,
    collaborators: WORKSPACE_TABLE_COLUMN_DEFAULTS.collaborators.width,
    stage: WORKSPACE_TABLE_COLUMN_DEFAULTS.stage.width,
    unread: WORKSPACE_TABLE_COLUMN_DEFAULTS.unread.width,
    open: WORKSPACE_TABLE_COLUMN_DEFAULTS.open.width,
  })

  let totalWidth = visibleColumns.reduce((sum, column) => sum + preferredWidths[column], 0)
  if (totalWidth > containerBudget) {
    let overflow = totalWidth - containerBudget
    const shrinkOrder: WorkspaceTableColumnKey[] = [
      'collaborators',
      'workspace',
      'stage',
      'unread',
      'open',
    ]

    for (const column of shrinkOrder) {
      if (overflow <= 0) {
        break
      }
      const reducible = Math.max(0, preferredWidths[column] - WORKSPACE_TABLE_COLUMN_MIN_WIDTH[column])
      if (reducible <= 0) {
        continue
      }
      const deduction = Math.min(reducible, overflow)
      preferredWidths[column] -= deduction
      overflow -= deduction
    }

    if (overflow > 0) {
      for (const column of shrinkOrder) {
        if (overflow <= 0) {
          break
        }
        const reducible = Math.max(0, preferredWidths[column] - WORKSPACE_TABLE_COLUMN_HARD_MIN)
        if (reducible <= 0) {
          continue
        }
        const deduction = Math.min(reducible, overflow)
        preferredWidths[column] -= deduction
        overflow -= deduction
      }
    }
    totalWidth = visibleColumns.reduce((sum, column) => sum + preferredWidths[column], 0)
  }

  if (totalWidth < containerBudget) {
    let remaining = containerBudget - totalWidth
    const growOrder: WorkspaceTableColumnKey[] = ([
      'workspace',
      'collaborators',
      'stage',
      'unread',
      'open',
    ] as WorkspaceTableColumnKey[]).filter((column) => visibleColumns.includes(column))

    while (remaining > 0) {
      const growColumns = growOrder.filter(
        (column) => preferredWidths[column] < WORKSPACE_TABLE_COLUMN_MAX_WIDTH[column],
      )
      if (growColumns.length === 0) {
        break
      }
      const perColumn = Math.max(1, Math.floor(remaining / growColumns.length))
      let grew = 0
      for (const column of growColumns) {
        if (remaining <= 0) {
          break
        }
        const growable = Math.max(0, WORKSPACE_TABLE_COLUMN_MAX_WIDTH[column] - preferredWidths[column])
        if (growable <= 0) {
          continue
        }
        const step = Math.min(growable, perColumn, remaining)
        if (step <= 0) {
          continue
        }
        preferredWidths[column] += step
        remaining -= step
        grew += step
      }
      if (grew <= 0) {
        break
      }
    }
  }

  for (const column of visibleColumns) {
    next[column] = {
      ...next[column],
      width: Math.round(preferredWidths[column]),
    }
  }
  return next
}

function createDefaultWorkspaceTableColumns(
  availableWidth: number,
): Record<WorkspaceTableColumnKey, WorkspaceTableColumnPreference> {
  return clampWorkspaceTableColumnsToAvailableWidth({
    columns: {
      workspace: { ...WORKSPACE_TABLE_COLUMN_DEFAULTS.workspace },
      collaborators: { ...WORKSPACE_TABLE_COLUMN_DEFAULTS.collaborators },
      stage: { ...WORKSPACE_TABLE_COLUMN_DEFAULTS.stage },
      unread: { ...WORKSPACE_TABLE_COLUMN_DEFAULTS.unread },
      open: { ...WORKSPACE_TABLE_COLUMN_DEFAULTS.open },
    },
    columnOrder: WORKSPACE_TABLE_COLUMN_ORDER,
    availableWidth,
  })
}

function clampWorkspaceTableDistributedResize(input: {
  column: WorkspaceTableColumnKey
  visibleColumns: WorkspaceTableColumnKey[]
  startWidths: Partial<Record<WorkspaceTableColumnKey, number>>
  deltaPx: number
}): Partial<Record<WorkspaceTableColumnKey, number>> {
  const primaryIndex = input.visibleColumns.indexOf(input.column)
  if (primaryIndex < 0 || input.visibleColumns.length <= 1) {
    return input.startWidths
  }

  const normalizedWidths: Partial<Record<WorkspaceTableColumnKey, number>> = {}
  for (const key of input.visibleColumns) {
    normalizedWidths[key] = clampWorkspaceTableColumnWidth(
      key,
      Number(input.startWidths[key] ?? WORKSPACE_TABLE_COLUMN_DEFAULTS[key].width),
    )
  }

  const requestedDelta = Math.round(input.deltaPx)
  if (!requestedDelta) {
    return normalizedWidths
  }

  const primaryStart = Number(
    normalizedWidths[input.column] ?? WORKSPACE_TABLE_COLUMN_DEFAULTS[input.column].width,
  )
  const rightColumns = input.visibleColumns.slice(primaryIndex + 1)
  const leftColumns = input.visibleColumns.slice(0, primaryIndex).reverse()
  const compensationOrder = [...rightColumns, ...leftColumns]
  if (compensationOrder.length === 0) {
    return normalizedWidths
  }

  let allowedGrow = WORKSPACE_TABLE_COLUMN_MAX_WIDTH[input.column] - primaryStart
  if (requestedDelta > 0) {
    const availableCompensation = compensationOrder.reduce((sum, key) => (
      sum + Math.max(
        0,
        Number(normalizedWidths[key] ?? WORKSPACE_TABLE_COLUMN_DEFAULTS[key].width) - WORKSPACE_TABLE_COLUMN_MIN_WIDTH[key],
      )
    ), 0)
    allowedGrow = Math.max(0, Math.min(allowedGrow, availableCompensation))
  }
  let allowedShrink = primaryStart - WORKSPACE_TABLE_COLUMN_MIN_WIDTH[input.column]
  if (requestedDelta < 0) {
    const availableCompensation = compensationOrder.reduce((sum, key) => (
      sum + Math.max(
        0,
        WORKSPACE_TABLE_COLUMN_MAX_WIDTH[key] - Number(normalizedWidths[key] ?? WORKSPACE_TABLE_COLUMN_DEFAULTS[key].width),
      )
    ), 0)
    allowedShrink = Math.max(0, Math.min(allowedShrink, availableCompensation))
  }

  const appliedDelta = requestedDelta > 0
    ? Math.min(requestedDelta, allowedGrow)
    : Math.max(requestedDelta, -allowedShrink)
  if (!appliedDelta) {
    return normalizedWidths
  }

  normalizedWidths[input.column] = primaryStart + appliedDelta

  let remainingCompensation = Math.abs(appliedDelta)
  for (const key of compensationOrder) {
    if (remainingCompensation <= 0) {
      break
    }
    const currentWidth = Number(normalizedWidths[key] ?? WORKSPACE_TABLE_COLUMN_DEFAULTS[key].width)
    const capacity = appliedDelta > 0
      ? Math.max(0, currentWidth - WORKSPACE_TABLE_COLUMN_MIN_WIDTH[key])
      : Math.max(0, WORKSPACE_TABLE_COLUMN_MAX_WIDTH[key] - currentWidth)
    if (capacity <= 0) {
      continue
    }
    const step = Math.min(capacity, remainingCompensation)
    normalizedWidths[key] = currentWidth + (appliedDelta > 0 ? -step : step)
    remainingCompensation -= step
  }

  return normalizedWidths
}

function resolveInitialWorkspaceTableLayoutWidth(): number {
  if (typeof window === 'undefined') {
    return WORKSPACE_TABLE_LAYOUT_FALLBACK_WIDTH
  }
  return Math.max(320, Math.round(window.innerWidth || WORKSPACE_TABLE_LAYOUT_FALLBACK_WIDTH))
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

function parseWorkspaceScope(
  scopeValue: string | null,
  legacyFilterValue: string | null,
): WorkspaceScope {
  if (scopeValue === 'all') {
    return 'all'
  }
  if (scopeValue === 'archived') {
    return 'archived'
  }
  if (legacyFilterValue === 'archived') {
    return 'archived'
  }
  if (scopeValue === 'active') {
    return 'active'
  }
  return 'active'
}

function parseFilterKey(value: string | null): FilterKey {
  if (value === 'pinned' || value === 'recent') {
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

function normalizeWorkspaceUserId(value: string | null | undefined): string {
  const clean = (value || '').trim()
  return clean === 'anonymous' ? '' : clean
}

function findWorkspaceParticipantByUserId(
  participants: WorkspaceParticipant[] | undefined,
  userId: string | null | undefined,
): WorkspaceParticipant | null {
  const cleanUserId = normalizeWorkspaceUserId(userId)
  if (!cleanUserId) {
    return null
  }
  return (participants || []).find((participant) => participant.userId === cleanUserId) || null
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

function collaboratorBadgeVariant(state: CollaboratorChipState): 'positive' | 'yellow' | 'negative' {
  if (state === 'pending') {
    return 'yellow'
  }
  if (state === 'removed') {
    return 'negative'
  }
  return 'positive'
}

type WorkspaceTooltipIconButtonProps = ComponentPropsWithoutRef<'button'> & {
  tooltip: string
  children: ReactNode
}

function WorkspaceTooltipIconButton({
  children,
  className,
  type = 'button',
  ...props
}: WorkspaceTooltipIconButtonProps) {
  return (
    <button type={type} className={className} {...props}>
      {children}
    </button>
  )
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
  return `${collaboratorName} collaborator status switched from ${input.fromStatus} to ${input.toStatus} by ${actorName}.`
}

function collaboratorRoleTransitionAuditMessage(input: {
  collaboratorName: string
  actorName: string
  fromRole: WorkspaceCollaboratorRole
  toRole: WorkspaceCollaboratorRole
  pending?: boolean
}): string {
  const collaboratorName = normalizeCollaboratorName(input.collaboratorName) || 'Collaborator'
  const actorName = normalizeCollaboratorName(input.actorName) || 'Unknown user'
  return `${collaboratorName} ${input.pending ? 'pending ' : ''}collaborator role switched from ${input.fromRole} to ${input.toRole} by ${actorName}.`
}

function workspaceLockAuditMessage(input: {
  workspaceName: string
  actorName: string
  locked: boolean
}): string {
  const workspaceName = normalizeCollaboratorName(input.workspaceName) || 'Workspace'
  const actorName = normalizeCollaboratorName(input.actorName) || 'Unknown user'
  return input.locked
    ? `${workspaceName} workspace lock switched from unlocked to locked by ${actorName}.`
    : `${workspaceName} workspace lock switched from locked to unlocked by ${actorName}.`
}

function workspaceRenameAuditMessage(input: {
  actorName: string
  fromName: string
  toName: string
}): string {
  const actorName = normalizeCollaboratorName(input.actorName) || 'Unknown user'
  const fromName = normalizeCollaboratorName(input.fromName) || 'Workspace'
  const toName = normalizeCollaboratorName(input.toName) || 'Workspace'
  return `Workspace renamed from ${fromName} to ${toName} by ${actorName}.`
}

function buildCollaboratorStatusAuditEntry(input: {
  collaboratorName: string
  collaboratorUserId?: string | null
  fromStatus: CollaboratorAccessStatus
  toStatus: CollaboratorAccessStatus
  actorName: string
  actorUserId?: string | null
  role?: WorkspaceCollaboratorRole
}): WorkspaceAuditEntryDraft {
  const eventType: WorkspaceAuditEventType =
    input.fromStatus === 'none' && input.toStatus === 'pending'
      ? 'member_invited'
      : input.fromStatus === 'removed' && input.toStatus === 'pending'
        ? 'member_reinvited'
        : input.fromStatus === 'pending' && input.toStatus === 'cancelled'
          ? 'invitation_cancelled'
          : input.toStatus === 'removed'
            ? 'member_removed'
            : input.toStatus === 'accepted'
              ? 'invitation_accepted'
              : input.toStatus === 'declined'
                ? 'invitation_declined'
                : 'other'
  return {
    category:
      eventType === 'member_invited'
      || eventType === 'invitation_cancelled'
      || eventType === 'invitation_accepted'
      || eventType === 'invitation_declined'
      ? 'invitation_decisions'
      : 'collaborator_changes',
    eventType,
    actorUserId: normalizeWorkspaceUserId(input.actorUserId) || null,
    actorName: normalizeCollaboratorName(input.actorName) || null,
    subjectUserId: normalizeWorkspaceUserId(input.collaboratorUserId) || null,
    subjectName: normalizeCollaboratorName(input.collaboratorName) || null,
    fromValue: input.fromStatus,
    toValue: input.toStatus,
    role: input.role || null,
    message: collaboratorStatusTransitionAuditMessage(input),
  }
}

function buildCollaboratorRoleAuditEntry(input: {
  collaboratorName: string
  collaboratorUserId?: string | null
  actorName: string
  actorUserId?: string | null
  fromRole: WorkspaceCollaboratorRole
  toRole: WorkspaceCollaboratorRole
  pending?: boolean
}): WorkspaceAuditEntryDraft {
  return {
    category: 'collaborator_changes',
    eventType: input.pending ? 'pending_role_changed' : 'member_role_changed',
    actorUserId: normalizeWorkspaceUserId(input.actorUserId) || null,
    actorName: normalizeCollaboratorName(input.actorName) || null,
    subjectUserId: normalizeWorkspaceUserId(input.collaboratorUserId) || null,
    subjectName: normalizeCollaboratorName(input.collaboratorName) || null,
    fromValue: input.fromRole,
    toValue: input.toRole,
    role: input.toRole,
    message: collaboratorRoleTransitionAuditMessage(input),
  }
}

function buildWorkspaceLockAuditEntry(input: {
  workspaceName: string
  actorName: string
  actorUserId?: string | null
  locked: boolean
}): WorkspaceAuditEntryDraft {
  return {
    category: 'workspace_changes',
    eventType: input.locked ? 'workspace_locked' : 'workspace_unlocked',
    actorUserId: normalizeWorkspaceUserId(input.actorUserId) || null,
    actorName: normalizeCollaboratorName(input.actorName) || null,
    subjectName: 'Workspace',
    fromValue: input.locked ? 'unlocked' : 'locked',
    toValue: input.locked ? 'locked' : 'unlocked',
    message: workspaceLockAuditMessage(input),
  }
}

function buildWorkspaceRenameAuditEntry(input: {
  actorName: string
  actorUserId?: string | null
  fromName: string
  toName: string
}): WorkspaceAuditEntryDraft {
  return {
    category: 'workspace_changes',
    eventType: 'workspace_renamed',
    actorUserId: normalizeWorkspaceUserId(input.actorUserId) || null,
    actorName: normalizeCollaboratorName(input.actorName) || null,
    subjectName: 'Workspace',
    fromValue: normalizeCollaboratorName(input.fromName) || null,
    toValue: normalizeCollaboratorName(input.toName) || null,
    message: workspaceRenameAuditMessage(input),
  }
}

function isWorkspaceOwner(workspace: WorkspaceRecord, currentUserId: string | null): boolean {
  const cleanCurrentUserId = normalizeWorkspaceUserId(currentUserId)
  if (!cleanCurrentUserId) {
    return false
  }
  return normalizeWorkspaceUserId(workspace.ownerUserId) === cleanCurrentUserId
}

function canManageWorkspaceMembers(workspace: WorkspaceRecord, currentUserId: string | null): boolean {
  return isWorkspaceOwner(workspace, currentUserId)
}

function canRenameWorkspace(workspace: WorkspaceRecord, currentUserId: string | null): boolean {
  return isWorkspaceOwner(workspace, currentUserId)
}

function isWorkspaceRemovedForCurrentUser(workspace: WorkspaceRecord, currentUserId: string | null): boolean {
  const cleanCurrentUserId = normalizeWorkspaceUserId(currentUserId)
  if (!cleanCurrentUserId) {
    return false
  }
  const removed = collaboratorRemovedSet(workspace)
  return removed.has(cleanCurrentUserId)
}

function isWorkspaceLockedForCurrentUser(workspace: WorkspaceRecord, currentUserId: string | null): boolean {
  return Boolean(workspace.ownerArchived) && !isWorkspaceOwner(workspace, currentUserId)
}

function canPinWorkspace(workspace: WorkspaceRecord, currentUserId: string | null): boolean {
  return !isWorkspaceRemovedForCurrentUser(workspace, currentUserId)
}

function canArchiveWorkspace(workspace: WorkspaceRecord, currentUserId: string | null): boolean {
  return !isWorkspaceRemovedForCurrentUser(workspace, currentUserId)
}

function canLockWorkspace(workspace: WorkspaceRecord, currentUserId: string | null): boolean {
  return isWorkspaceOwner(workspace, currentUserId)
}

function canViewWorkspaceLogs(workspace: WorkspaceRecord, currentUserId: string | null): boolean {
  return !isWorkspaceRemovedForCurrentUser(workspace, currentUserId)
}

function canViewWorkspaceFullLogs(workspace: WorkspaceRecord, currentUserId: string | null): boolean {
  return isWorkspaceOwner(workspace, currentUserId)
}

function canViewWorkspaceDrilldownTab(
  workspace: WorkspaceRecord,
  currentUserId: string | null,
  tab: WorkspaceDrilldownTab,
): boolean {
  switch (tab) {
    case 'actions':
      return canManageWorkspaceMembers(workspace, currentUserId)
    case 'logs':
      return canViewWorkspaceLogs(workspace, currentUserId)
    case 'overview':
    case 'data':
    default:
      return true
  }
}

function workspaceDrilldownTabRestrictionMessage(tab: WorkspaceDrilldownTab): string | null {
  switch (tab) {
    case 'actions':
      return 'Only owners can edit workspace team members.'
    case 'logs':
      return 'Removed team members no longer have access to workspace logs.'
    case 'overview':
    case 'data':
    default:
      return null
  }
}

function workspaceDrilldownTabLabel(
  tab: WorkspaceDrilldownTab,
  workspace: WorkspaceRecord | null,
  currentUserId: string | null,
): string {
  if (tab === 'logs' && workspace && !canViewWorkspaceFullLogs(workspace, currentUserId)) {
    return 'History'
  }
  return WORKSPACE_DRILLDOWN_TABS.find((item) => item.id === tab)?.label || tab
}

function workspaceArchiveActionLabel(workspace: WorkspaceRecord, currentUserId: string | null): string {
  void currentUserId
  return workspace.archived ? 'Unarchive' : 'Archive'
}

function workspaceLockActionLabel(workspace: WorkspaceRecord, currentUserId: string | null): string {
  if (!isWorkspaceOwner(workspace, currentUserId)) {
    return 'Lock for team members'
  }
  return workspace.ownerArchived ? 'Unlock for team members' : 'Lock for team members'
}

function workspaceLockStateLabel(workspace: WorkspaceRecord, currentUserId: string | null): string {
  if (!workspace.ownerArchived) {
    return 'No'
  }
  return workspaceLockedBadgeLabel(workspace, currentUserId)
}

function workspaceReadOnlyMessage(workspace: WorkspaceRecord, currentUserId: string | null): string | null {
  if (isWorkspaceRemovedForCurrentUser(workspace, currentUserId)) {
    return 'Removed access detected. This workspace is no longer available for editing.'
  }
  const ownerName = workspaceOwnerSentenceReference(workspace)
  if (isWorkspaceLockedForCurrentUser(workspace, currentUserId)) {
    return `This workspace is locked by ${ownerName} and is view-only.`
  }
  if (workspace.ownerArchived && isWorkspaceOwner(workspace, currentUserId)) {
    return `This workspace is locked by ${workspaceOwnerActionSentenceReference(workspace, currentUserId)} for team members. You still have full edit access.`
  }
  return null
}

function workspaceOwnerLabel(workspace: WorkspaceRecord): string {
  const ownerName = normalizeCollaboratorName(workspace.ownerName) || 'Unknown'
  return `${ownerName} (Owner)`
}

function workspaceOwnerBadgeLabel(workspace: WorkspaceRecord, currentUserId: string | null): string {
  const ownerName = normalizeCollaboratorName(workspace.ownerName) || 'Unknown'
  return isWorkspaceOwner(workspace, currentUserId) ? `${ownerName} (you)` : ownerName
}

function isWorkspaceReadOnlyForCurrentUser(workspace: WorkspaceRecord, currentUserId: string | null): boolean {
  return (
    isWorkspaceRemovedForCurrentUser(workspace, currentUserId)
    || isWorkspaceLockedForCurrentUser(workspace, currentUserId)
  )
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
  entry: WorkspaceInboxMessageRecord
  parsedEvent: ParsedConversationAuditEvent
  timestampMs: number
}

type ConversationAuditActorGroup = {
  actorName: string
  entries: ConversationAuditPresentationEntry[]
}

type WorkspaceActivityGroup = {
  key: 'name_changes' | 'lock_state' | 'other'
  title: string
  entries: WorkspaceAuditEntry[]
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

function normalizeAuditActorDisplayName(actorName: string): string {
  return normalizeCollaboratorName(actorName).replace(/\s+\(owner\)$/i, '')
}

function formatAuditActorHeaderName(actorName: string, currentViewerName?: string | null): string {
  const clean = normalizeAuditActorDisplayName(actorName)
  if (!clean) {
    return 'System'
  }
  if (normalizePerson(clean) && normalizePerson(clean) === normalizePerson(currentViewerName || null)) {
    return 'You'
  }
  return clean
}

function auditActorKey(actorName: string): string {
  return normalizeCollaboratorName(actorName).toLowerCase() || 'system'
}

function formatAuditMessageForViewer(message: string, currentViewerName?: string | null): string {
  const cleanMessage = normalizeCollaboratorName(message)
  if (!cleanMessage) {
    return message
  }
  const byMatch = cleanMessage.match(/\bby (.*?)\.(\s|$)/i)
  if (!byMatch) {
    return cleanMessage
  }
  const actorName = normalizeAuditActorDisplayName(byMatch[1] || '')
  if (!actorName || normalizePerson(actorName) !== normalizePerson(currentViewerName || null)) {
    return cleanMessage
  }
  return cleanMessage.replace(/\bby (.*?)\.(\s|$)/i, (_match, _actor, suffix) => `by you.${suffix || ''}`)
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
  if (raw === 'unlocked') {
    return cn(HOUSE_COLLABORATOR_CHIP_CLASS, HOUSE_COLLABORATOR_CHIP_ACTIVE_CLASS)
  }
  if (raw === 'removed' || raw === 'declined' || raw === 'cancelled') {
    return cn(HOUSE_COLLABORATOR_CHIP_CLASS, HOUSE_COLLABORATOR_CHIP_REMOVED_CLASS)
  }
  if (raw === 'locked') {
    return cn(HOUSE_COLLABORATOR_CHIP_CLASS, HOUSE_COLLABORATOR_CHIP_REMOVED_CLASS)
  }
  if (transition.transitionKind === 'invitation_status' && raw === 'accepted') {
    return cn(HOUSE_COLLABORATOR_CHIP_CLASS, HOUSE_COLLABORATOR_CHIP_ACTIVE_CLASS)
  }
  return cn(HOUSE_COLLABORATOR_CHIP_CLASS, 'border-border/70 bg-background/80 text-foreground')
}

function parseAuditTransition(entry: WorkspaceAuditEntry | string): ParsedAuditTransition | null {
  if (typeof entry !== 'string' && entry.eventType) {
    const subject = normalizeCollaboratorName(entry.subjectName) || 'Workspace'
    const actorName = normalizeCollaboratorName(entry.actorName) || 'Unknown user'
    const fromRawValue = (entry.fromValue || '').trim().toLowerCase()
    const toRawValue = (entry.toValue || '').trim().toLowerCase()
    const fromValue = humanizeAuditValue(entry.fromValue || '')
    const toValue = humanizeAuditValue(entry.toValue || '')

    switch (entry.eventType) {
      case 'member_invited':
      case 'member_reinvited':
      case 'member_removed':
      case 'invitation_accepted':
      case 'invitation_declined':
      case 'invitation_cancelled':
        return {
          subject,
          fromRawValue,
          toRawValue,
          fromValue,
          toValue,
          actorName,
          sectionLabel:
            entry.eventType === 'member_invited'
            || entry.eventType === 'member_reinvited'
            || entry.eventType === 'invitation_cancelled'
            || entry.eventType === 'invitation_accepted'
            || entry.eventType === 'invitation_declined'
              ? 'Invitation status'
              : 'Access status',
          transitionKind:
            entry.eventType === 'member_invited'
            || entry.eventType === 'member_reinvited'
            || entry.eventType === 'invitation_cancelled'
            || entry.eventType === 'invitation_accepted'
            || entry.eventType === 'invitation_declined'
              ? 'invitation_status'
              : 'access_status',
          roleDetail: entry.role ? collaboratorRoleLabel(entry.role) : null,
        }
      case 'member_role_changed':
      case 'pending_role_changed':
        return {
          subject,
          fromRawValue,
          toRawValue,
          fromValue,
          toValue,
          actorName,
          sectionLabel: entry.eventType === 'pending_role_changed' ? 'Pending role' : 'Role',
          transitionKind: entry.eventType === 'pending_role_changed' ? 'pending_role' : 'role',
          roleDetail: null,
        }
      case 'workspace_locked':
      case 'workspace_unlocked':
      case 'workspace_renamed':
        return {
          subject,
          fromRawValue,
          toRawValue,
          fromValue,
          toValue,
          actorName,
          sectionLabel: 'Workspace',
          transitionKind: 'access_status',
          roleDetail: null,
        }
      default:
        break
    }
  }

  const cleanMessage = normalizeCollaboratorName(typeof entry === 'string' ? entry : entry.message)
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
  if (entry.eventType === 'message_logged' || entry.category === 'conversation') {
    return true
  }
  const cleanMessage = normalizeCollaboratorName(entry.message).toLowerCase()
  return cleanMessage.startsWith('inbox message logged:')
}

function conversationAuditEventFromInboxMessage(
  entry: WorkspaceInboxMessageRecord,
): ParsedConversationAuditEvent {
  return {
    messageId: normalizeCollaboratorName(entry.id) || 'unknown',
    senderName: normalizeCollaboratorName(entry.senderName) || 'Unknown sender',
    createdAtRaw: entry.createdAt,
    ciphertextLength: (entry.encryptedBody || '').length,
    ivLength: (entry.iv || '').length,
  }
}

function isRoleChangeAuditEntry(entry: WorkspaceAuditEntry): boolean {
  if (entry.eventType === 'member_role_changed' || entry.eventType === 'pending_role_changed') {
    return true
  }
  const cleanMessage = normalizeCollaboratorName(entry.message).toLowerCase()
  return cleanMessage.includes('collaborator role switched from')
}

function isInvitationStatusAuditEntry(entry: WorkspaceAuditEntry): boolean {
  if (
    entry.eventType === 'member_invited'
    || entry.eventType === 'member_reinvited'
    || entry.eventType === 'invitation_cancelled'
    || entry.eventType === 'invitation_accepted'
    || entry.eventType === 'invitation_declined'
  ) {
    return true
  }
  const cleanMessage = normalizeCollaboratorName(entry.message).toLowerCase()
  return cleanMessage.includes('collaborator invitation status switched from')
}

function isWorkspaceActivityAuditEntry(entry: WorkspaceAuditEntry): boolean {
  if (
    entry.eventType === 'workspace_locked'
    || entry.eventType === 'workspace_unlocked'
    || entry.eventType === 'workspace_renamed'
    || entry.category === 'workspace_changes'
  ) {
    return true
  }
  const cleanMessage = normalizeCollaboratorName(entry.message).toLowerCase()
  return (
    cleanMessage.includes('workspace lock switched from')
    || cleanMessage.startsWith('workspace renamed from')
  )
}

function isWorkspaceRenameAuditEntry(entry: WorkspaceAuditEntry): boolean {
  if (entry.eventType === 'workspace_renamed') {
    return true
  }
  const cleanMessage = normalizeCollaboratorName(entry.message).toLowerCase()
  return cleanMessage.startsWith('workspace renamed from')
}

function isWorkspaceLockAuditEntry(entry: WorkspaceAuditEntry): boolean {
  if (entry.eventType === 'workspace_locked' || entry.eventType === 'workspace_unlocked') {
    return true
  }
  const cleanMessage = normalizeCollaboratorName(entry.message).toLowerCase()
  return cleanMessage.includes('workspace lock switched from')
}

function isAccessStatusAuditEntry(entry: WorkspaceAuditEntry): boolean {
  if (entry.eventType === 'member_removed') {
    return true
  }
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
  return new Set((workspace.removedCollaborators || []).map((value) => normalizeWorkspaceUserId(value.userId)).filter(Boolean))
}

function collaboratorPendingSet(workspace: WorkspaceRecord): Set<string> {
  return new Set((workspace.pendingCollaborators || []).map((value) => normalizeWorkspaceUserId(value.userId)).filter(Boolean))
}

function collaboratorRoleByKey(
  roles: Record<string, WorkspaceCollaboratorRole> | undefined,
): Map<string, WorkspaceCollaboratorRole> {
  const output = new Map<string, WorkspaceCollaboratorRole>()
  for (const [userId, role] of Object.entries(roles || {})) {
    const cleanUserId = normalizeWorkspaceUserId(userId)
    if (!cleanUserId) {
      continue
    }
    output.set(cleanUserId, role)
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
    const cleanUserId = normalizeWorkspaceUserId(collaborator.userId)
    const cleanName = normalizeCollaboratorName(collaborator.name)
    if (!cleanUserId || !cleanName) {
      continue
    }
    if (seen.has(cleanUserId)) {
      continue
    }
    const state: CollaboratorChipState = pending.has(cleanUserId)
      ? 'pending'
      : removed.has(cleanUserId)
        ? 'removed'
        : 'active'
    if (state === 'pending') {
      continue
    }
    seen.add(cleanUserId)
    chips.push({
      key: cleanUserId,
      userId: cleanUserId,
      name: cleanName,
      state,
      role: pending.has(cleanUserId)
        ? pendingRoleByKey.get(cleanUserId) || activeRoleByKey.get(cleanUserId) || 'editor'
        : activeRoleByKey.get(cleanUserId) || 'editor',
    })
  }

  for (const collaborator of workspace.pendingCollaborators || []) {
    const cleanUserId = normalizeWorkspaceUserId(collaborator.userId)
    const cleanName = normalizeCollaboratorName(collaborator.name)
    if (!cleanUserId || !cleanName) {
      continue
    }
    if (seen.has(cleanUserId)) {
      continue
    }
    seen.add(cleanUserId)
    chips.push({
      key: cleanUserId,
      userId: cleanUserId,
      name: cleanName,
      state: 'pending',
      role: pendingRoleByKey.get(cleanUserId) || 'editor',
    })
  }

  for (const collaborator of workspace.removedCollaborators || []) {
    const cleanUserId = normalizeWorkspaceUserId(collaborator.userId)
    const cleanName = normalizeCollaboratorName(collaborator.name)
    if (!cleanUserId || !cleanName) {
      continue
    }
    if (seen.has(cleanUserId)) {
      continue
    }
    seen.add(cleanUserId)
    chips.push({
      key: cleanUserId,
      userId: cleanUserId,
      name: cleanName,
      state: 'removed',
      role: activeRoleByKey.get(cleanUserId) || pendingRoleByKey.get(cleanUserId) || 'editor',
    })
  }

  const stateOrder: Record<CollaboratorChipState, number> = {
    active: 0,
    pending: 1,
    removed: 2,
  }
  const roleOrder = {
    editor: 0,
    reviewer: 1,
    viewer: 2,
  } as const

  return chips.sort((left, right) => {
    const stateRank = stateOrder[left.state] - stateOrder[right.state]
    if (stateRank !== 0) {
      return stateRank
    }

    const roleRank = roleOrder[left.role] - roleOrder[right.role]
    if (roleRank !== 0) {
      return roleRank
    }

    return left.name.localeCompare(right.name, undefined, { sensitivity: 'base' })
  })
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

function statusRank(status: 'Active' | 'Archived' | 'Locked'): number {
  if (status === 'Active') {
    return 1
  }
  if (status === 'Locked') {
    return 2
  }
  return 3
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
    if (a.pinned !== b.pinned) {
      return a.pinned ? -1 : 1
    }

    if (sortColumn === 'name') {
      const result = a.name.localeCompare(b.name) * direction
      return result !== 0 ? result : a.updatedAt.localeCompare(b.updatedAt) * -1
    }
    if (sortColumn === 'updatedAt') {
      const result = (Date.parse(a.updatedAt) - Date.parse(b.updatedAt)) * direction
      return result !== 0 ? result : a.name.localeCompare(b.name, undefined, { sensitivity: 'base' })
    }
    if (sortColumn === 'stage') {
      const result = (stageRank(workspaceStageBase(a)) - stageRank(workspaceStageBase(b))) * direction
      return result !== 0 ? result : a.name.localeCompare(b.name, undefined, { sensitivity: 'base' })
    }
    const result = (statusRank(workspaceStatus(a)) - statusRank(workspaceStatus(b))) * direction
    return result !== 0 ? result : a.name.localeCompare(b.name, undefined, { sensitivity: 'base' })
  })

  return next
}

function WorkspacesDrilldownPanel({
  selectedWorkspaceId,
  selectedWorkspaceName,
  selectedWorkspace,
  initialTab,
  selectedWorkspaceReadOnly,
  selectedWorkspaceReadOnlyMessage,
  currentWorkspaceUserId,
  currentReaderName,
  memberActionIntent,
  onMemberActionIntentHandled,
  collaboratorChips,
  workspaceAuditEntries,
  workspaceConversationMessages,
  canManageSelectedWorkspace,
  collaboratorComposerOpen,
  collaboratorSearchResults,
  collaboratorSearchLoading,
  selectedInviteAccount,
  collaboratorInviteRole,
  collaboratorQuery,
  canConfirmAddCollaborator,
  onOpenCollaboratorComposer,
  onSelectInviteAccount,
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
  initialTab?: WorkspaceDrilldownTab
  selectedWorkspaceReadOnly: boolean
  selectedWorkspaceReadOnlyMessage: string | null
  currentWorkspaceUserId: string | null
  currentReaderName: string
  memberActionIntent: WorkspaceMemberActionIntent | null
  onMemberActionIntentHandled: () => void
  collaboratorChips: CollaboratorChipEntry[]
  workspaceAuditEntries: WorkspaceAuditEntry[]
  workspaceConversationMessages: WorkspaceInboxMessageRecord[]
  canManageSelectedWorkspace: boolean
  collaboratorComposerOpen: boolean
  collaboratorSearchResults: WorkspaceAccountSearchResult[]
  collaboratorSearchLoading: boolean
  selectedInviteAccount: WorkspaceAccountSearchResult | null
  collaboratorInviteRole: WorkspaceCollaboratorRole
  collaboratorQuery: string
  canConfirmAddCollaborator: boolean
  onOpenCollaboratorComposer: () => void
  onSelectInviteAccount: (account: WorkspaceAccountSearchResult) => void
  onCollaboratorInviteRoleChange: (role: WorkspaceCollaboratorRole) => void
  onChangeCollaboratorRole: (
    collaborator: CollaboratorChipEntry,
    role: WorkspaceCollaboratorRole,
  ) => void
  onCancelPendingCollaboratorInvitation: (collaborator: CollaboratorChipEntry) => void
  onToggleCollaboratorRemoved: (
    workspace: WorkspaceRecord,
    collaborator: CollaboratorChipEntry,
    options?: ToggleCollaboratorRemovedOptions,
  ) => void
  onCollaboratorQueryChange: (value: string) => void
  onConfirmAddCollaborator: () => void
  onOpenSelectedWorkspace: (workspaceId: string) => void
}) {
  const selectedLabel = selectedWorkspaceName?.trim() || ''
  const selectedWorkspaceRemoved = Boolean(
    selectedWorkspace && isWorkspaceRemovedForCurrentUser(selectedWorkspace, currentWorkspaceUserId),
  )
  const selectedWorkspaceLocked = Boolean(
    selectedWorkspace && isWorkspaceLockedForCurrentUser(selectedWorkspace, currentWorkspaceUserId),
  )
  const canOpenSelectedWorkspace = Boolean(
    selectedWorkspaceId && selectedLabel && !selectedWorkspaceRemoved,
  )
  const canAddCollaborator = Boolean(selectedWorkspace && canManageSelectedWorkspace)
  const collaboratorWorkspaceName = selectedWorkspace?.name ?? 'workspace'
  const ownerOverviewName = selectedWorkspace
    ? normalizeCollaboratorName(selectedWorkspace.ownerName) || 'Unknown owner'
    : 'Unknown owner'
  const ownerDisplayName = selectedWorkspace
    ? workspaceOwnerLabel(selectedWorkspace)
    : 'Unknown owner (Owner)'
  const ownerBadgeLabel = selectedWorkspace
    ? workspaceOwnerBadgeLabel(selectedWorkspace, currentWorkspaceUserId)
    : 'Unknown owner'
  const ownerBadgeVariant =
    selectedWorkspace && isWorkspaceOwner(selectedWorkspace, currentWorkspaceUserId)
      ? 'positive'
      : 'outline'
  const [activeTab, setActiveTab] = useState<WorkspaceDrilldownTab>(initialTab || 'overview')
  const [roleEditorKey, setRoleEditorKey] = useState<string | null>(null)
  const [roleEditorDraftRole, setRoleEditorDraftRole] = useState<WorkspaceCollaboratorRole | null>(null)
  const [restoreEditorKey, setRestoreEditorKey] = useState<string | null>(null)
  const [restoreEditorRole, setRestoreEditorRole] = useState<WorkspaceCollaboratorRole | null>(null)
  const [collaboratorAuditFilter, setCollaboratorAuditFilter] = useState<CollaboratorAuditFilter>('all')
  const [collaboratorActivityCollapsed, setCollaboratorActivityCollapsed] = useState(true)
  const [workspaceActivityCollapsed, setWorkspaceActivityCollapsed] = useState(true)
  const [conversationActivityCollapsed, setConversationActivityCollapsed] = useState(true)
  const [removalConfirmKey, setRemovalConfirmKey] = useState<string | null>(null)
  const [collaboratorActorExpanded, setCollaboratorActorExpanded] = useState<Record<string, boolean>>({})
  const [workspaceActivityGroupExpanded, setWorkspaceActivityGroupExpanded] = useState<
    Record<WorkspaceActivityGroup['key'], boolean>
  >({
    name_changes: false,
    lock_state: false,
    other: false,
  })
  const [conversationActorExpanded, setConversationActorExpanded] = useState<Record<string, boolean>>({})
  const sortedAuditEntries = [...workspaceAuditEntries]
    .sort((left, right) => Date.parse(left.createdAt) - Date.parse(right.createdAt))
  const collaboratorActivityEntries = sortedAuditEntries
    .filter((entry) => !isConversationAuditEntry(entry))
    .filter((entry) => !isWorkspaceActivityAuditEntry(entry))
    .filter((entry) =>
      matchesCollaboratorAuditLogFilter(entry, collaboratorAuditFilter),
    )
  const workspaceActivityEntries = sortedAuditEntries
    .filter((entry) => !isConversationAuditEntry(entry))
    .filter((entry) => isWorkspaceActivityAuditEntry(entry))
  const workspaceActivityGroups = useMemo<WorkspaceActivityGroup[]>(() => {
    const nameChanges = workspaceActivityEntries.filter((entry) => isWorkspaceRenameAuditEntry(entry))
    const lockState = workspaceActivityEntries.filter((entry) => isWorkspaceLockAuditEntry(entry))
    const otherEntries = workspaceActivityEntries.filter(
      (entry) => !isWorkspaceRenameAuditEntry(entry) && !isWorkspaceLockAuditEntry(entry),
    )

    const groups: WorkspaceActivityGroup[] = [
      { key: 'name_changes', title: 'Name changes', entries: nameChanges },
      { key: 'lock_state', title: 'Lock / unlock', entries: lockState },
      { key: 'other', title: 'Other workspace activity', entries: otherEntries },
    ]

    return groups.filter((group) => group.entries.length > 0)
  }, [workspaceActivityEntries])
  const conversationActivityEntries = [...workspaceConversationMessages]
    .sort((left, right) => Date.parse(right.createdAt) - Date.parse(left.createdAt))
  const collaboratorActivityGroups = useMemo<CollaboratorAuditActorGroup[]>(() => {
    const groups = new Map<string, CollaboratorAuditActorGroup>()
    const ownerActorKey = auditActorKey(selectedWorkspace?.ownerName || '')
    const viewerHasFullWorkspaceLogs = selectedWorkspace
      ? canViewWorkspaceFullLogs(selectedWorkspace, currentWorkspaceUserId)
      : false
    collaboratorActivityEntries.forEach((entry) => {
      const parsedTransition = parseAuditTransition(entry)
      const collaboratorName =
        parsedTransition?.subject ||
        parseCollaboratorNameFromAuditMessage(entry.message) ||
        'General'
      const actorKey = normalizeCollaboratorName(collaboratorName).toLowerCase() || 'general'
      if (ownerActorKey && actorKey === ownerActorKey) {
        return
      }
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

    const rosterOrder: string[] = []
    const rosterKeys = new Set<string>()
    const addRosterMember = (name?: string | null) => {
      const cleanName = normalizeCollaboratorName(name)
      const actorKey = auditActorKey(cleanName)
      if (!cleanName || rosterKeys.has(actorKey)) {
        return
      }
      rosterKeys.add(actorKey)
      rosterOrder.push(cleanName)
    }

    collaboratorChips.forEach((chip) => addRosterMember(chip.name))

    const sortGroupEntries = (entries: CollaboratorAuditPresentationEntry[]) =>
      [...entries].sort(
        (left, right) =>
          left.timestampMs - right.timestampMs || left.entry.id.localeCompare(right.entry.id),
      )

    if (!viewerHasFullWorkspaceLogs) {
      const currentMemberName = normalizeCollaboratorName(
        collaboratorChips.find((chip) => chip.userId === currentWorkspaceUserId)?.name,
      )
      const actorKey = auditActorKey(currentMemberName || '')
      return currentMemberName
        ? [
            {
              actorName: currentMemberName,
              entries: sortGroupEntries(groups.get(actorKey)?.entries || []),
            },
          ]
        : []
    }

    const rosterGroups = rosterOrder.map((name) => {
      const actorKey = auditActorKey(name)
      const current = groups.get(actorKey)
      return {
        actorName: name,
        entries: sortGroupEntries(current?.entries || []),
      }
    })

    const extraGroups = [...groups.entries()]
      .filter(([actorKey]) => !rosterKeys.has(actorKey) && (!ownerActorKey || actorKey !== ownerActorKey))
      .map(([, group]) => ({
        ...group,
        entries: sortGroupEntries(group.entries),
      }))
      .sort((left, right) => compareAuditActorNames(left.actorName, right.actorName))

    return [...rosterGroups, ...extraGroups]
  }, [collaboratorActivityEntries, collaboratorChips, currentWorkspaceUserId, selectedWorkspace])
  const conversationActivityGroups = useMemo<ConversationAuditActorGroup[]>(() => {
    const groups = new Map<string, ConversationAuditActorGroup>()
    conversationActivityEntries.forEach((entry) => {
      const parsedEvent = conversationAuditEventFromInboxMessage(entry)
      const actorName = parsedEvent.senderName
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
  const activeCollaboratorCount = collaboratorChips.filter((chip) => chip.state === 'active').length
  const pendingCollaboratorCount = collaboratorChips.filter((chip) => chip.state === 'pending').length
  const removedCollaboratorCount = collaboratorChips.filter((chip) => chip.state === 'removed').length
  const teamMemberCount = 1 + collaboratorChips.length
  const canAccessWorkspaceLogs = selectedWorkspace
    ? canViewWorkspaceLogs(selectedWorkspace, currentWorkspaceUserId)
    : false
  const canViewFullWorkspaceLogs = selectedWorkspace
    ? canViewWorkspaceFullLogs(selectedWorkspace, currentWorkspaceUserId)
    : false
  const showPersonalWorkspaceLogs = Boolean(selectedWorkspace && !canViewFullWorkspaceLogs)
  const currentWorkspaceMemberRole = currentWorkspaceUserId
    ? collaboratorChips.find((chip) => chip.userId === currentWorkspaceUserId)?.role || null
    : null
  const myRoleLabel = currentWorkspaceMemberRole ? collaboratorRoleLabel(currentWorkspaceMemberRole) : null
  const drilldownReadOnlyBannerClassName = selectedWorkspaceRemoved
    ? cn(houseSurfaces.banner, houseSurfaces.bannerDanger)
    : selectedWorkspaceLocked
      ? cn(houseSurfaces.banner, houseSurfaces.bannerInfo)
      : cn(houseSurfaces.banner, houseSurfaces.bannerInfo)

  const resetCollaboratorEditors = () => {
    setRoleEditorKey(null)
    setRoleEditorDraftRole(null)
    setRestoreEditorKey(null)
    setRestoreEditorRole(null)
    setRemovalConfirmKey(null)
  }

  const openRoleEditorForChip = (chip: CollaboratorChipEntry) => {
    setRoleEditorKey(chip.key)
    setRoleEditorDraftRole(chip.role)
    setRestoreEditorKey(null)
    setRestoreEditorRole(null)
    setRemovalConfirmKey(null)
  }

  const openRestoreEditorForChip = (chip: CollaboratorChipEntry) => {
    setRestoreEditorKey(chip.key)
    setRestoreEditorRole(chip.role)
    setRoleEditorKey(null)
    setRoleEditorDraftRole(null)
    setRemovalConfirmKey(null)
  }
  const hasOpenMemberEditState = Boolean(roleEditorKey || restoreEditorKey || removalConfirmKey || collaboratorComposerOpen)

  const renderCollaboratorRoleReadout = (chip: CollaboratorChipEntry) => {
    return <span className={HOUSE_FIELD_HELPER_CLASS}>{collaboratorRoleLabel(chip.role)}</span>
  }

  const renderCollaboratorRow = (chip: CollaboratorChipEntry) => {
    const isRoleEditorOpen =
      canManageSelectedWorkspace &&
      roleEditorKey === chip.key &&
      chip.state !== 'removed'
    const isRestoreEditorOpen =
      canManageSelectedWorkspace &&
      chip.state === 'removed' &&
      restoreEditorKey === chip.key
    const roleEditorCurrentRole = roleEditorDraftRole || chip.role
    const hasRoleEditorChanges = isRoleEditorOpen && roleEditorCurrentRole !== chip.role
    const isRemovalAwaitingConfirm =
      canManageSelectedWorkspace &&
      (chip.state === 'active' || chip.state === 'pending') &&
      removalConfirmKey === chip.key
    const hasCollaboratorRowActionFocus = Boolean(roleEditorKey || restoreEditorKey || removalConfirmKey)
    const hideRowActionsForInviteComposer =
      collaboratorComposerOpen &&
      !isRoleEditorOpen &&
      !isRestoreEditorOpen &&
      !isRemovalAwaitingConfirm
    const hideRowActionsForFocusedEditor =
      hasCollaboratorRowActionFocus &&
      !isRoleEditorOpen &&
      !isRestoreEditorOpen &&
      !isRemovalAwaitingConfirm

    const roleNode = isRoleEditorOpen ? (
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
        <SelectTrigger className="h-9 w-auto min-w-sz-110 px-3 text-sm">
          <SelectValue placeholder="Select role" />
        </SelectTrigger>
        <SelectContent className={WORKSPACE_SELECT_TONE_CLASS}>
          {COLLABORATOR_ROLE_OPTIONS.map((option) => (
            <SelectItem key={option.value} value={option.value}>
              {option.label}
            </SelectItem>
          ))}
        </SelectContent>
      </SelectPrimitive>
    ) : isRestoreEditorOpen ? (
      <SelectPrimitive
        value={restoreEditorRole || chip.role}
        onValueChange={(value) => {
          const nextRole = normalizeCollaboratorRoleValue(value)
          setRestoreEditorRole(nextRole)
        }}
      >
        <SelectTrigger className="h-9 w-auto min-w-sz-110 px-3 text-sm">
          <SelectValue placeholder="Select role" />
        </SelectTrigger>
        <SelectContent className={WORKSPACE_SELECT_TONE_CLASS}>
          {COLLABORATOR_ROLE_OPTIONS.map((option) => (
            <SelectItem key={option.value} value={option.value}>
              {option.label}
            </SelectItem>
          ))}
        </SelectContent>
      </SelectPrimitive>
    ) : (
      renderCollaboratorRoleReadout(chip)
    )

    const actionNode =
      hideRowActionsForInviteComposer || hideRowActionsForFocusedEditor ? null :
      canManageSelectedWorkspace && !isRoleEditorOpen && !isRestoreEditorOpen ? (
        isRemovalAwaitingConfirm ? (
          <div className="flex items-center justify-end gap-1.5">
            <Button
              type="button"
              variant="cta"
              className="h-8 px-3"
              onClick={() => {
                if (chip.state === 'pending') {
                  onCancelPendingCollaboratorInvitation(chip)
                  resetCollaboratorEditors()
                  return
                }
                if (!selectedWorkspace) return
                onToggleCollaboratorRemoved(selectedWorkspace, chip, { skipRemoveConfirmation: true })
                resetCollaboratorEditors()
              }}
              aria-label={chip.state === 'pending' ? `Confirm cancel invitation for ${chip.name}` : `Confirm remove ${chip.name}`}
            >
              Confirm
            </Button>
            <WorkspaceTooltipIconButton
              className={cn(HOUSE_COLLABORATOR_ACTION_ICON_CLASS, HOUSE_COLLABORATOR_ACTION_ICON_DISCARD_CLASS)}
              onClick={() => setRemovalConfirmKey(null)}
              aria-label={chip.state === 'pending' ? `Cancel invitation cancellation for ${chip.name}` : `Cancel remove ${chip.name}`}
              tooltip={chip.state === 'pending' ? 'Cancel invitation cancellation' : 'Cancel remove collaborator'}
            >
              <X className="h-4 w-4" />
            </WorkspaceTooltipIconButton>
          </div>
        ) : chip.state === 'removed' ? (
          <div className="flex items-center justify-end gap-1.5">
            <WorkspaceTooltipIconButton
              className={cn(
                HOUSE_COLLABORATOR_ACTION_ICON_CLASS,
                HOUSE_COLLABORATOR_ACTION_ICON_CONFIRM_CLASS,
              )}
              onClick={() => openRestoreEditorForChip(chip)}
              aria-label={`Reinstate ${chip.name}`}
              tooltip="Reinstate team member"
            >
              <RotateCcw className="h-4 w-4" />
            </WorkspaceTooltipIconButton>
          </div>
        ) : (
          <div className="flex items-center justify-end gap-1.5">
            <WorkspaceTooltipIconButton
              className={cn(
                HOUSE_COLLABORATOR_ACTION_ICON_CLASS,
                HOUSE_COLLABORATOR_ACTION_ICON_EDIT_CLASS,
              )}
              onClick={() => openRoleEditorForChip(chip)}
              aria-label={
                chip.state === 'pending'
                  ? `Edit pending invite for ${chip.name}`
                  : `Change role for ${chip.name}`
              }
              tooltip={chip.state === 'pending' ? 'Edit pending invite' : 'Change role'}
            >
              <Pencil className="h-4 w-4" />
            </WorkspaceTooltipIconButton>
            <WorkspaceTooltipIconButton
              className={cn(HOUSE_COLLABORATOR_ACTION_ICON_CLASS, HOUSE_COLLABORATOR_ACTION_ICON_DISCARD_CLASS)}
              onClick={() => setRemovalConfirmKey(chip.key)}
              aria-label={
                chip.state === 'pending'
                  ? `Cancel pending invite for ${chip.name}`
                  : `Remove ${chip.name}`
              }
              tooltip={chip.state === 'pending' ? 'Cancel pending invite' : 'Remove team member'}
            >
              {chip.state === 'pending' ? (
                <X className="h-4 w-4" />
              ) : (
                <UserMinus className="h-4 w-4" />
              )}
            </WorkspaceTooltipIconButton>
          </div>
        )
      ) : isRoleEditorOpen ? (
        <div className="flex items-center justify-end gap-1.5">
          {hasRoleEditorChanges ? (
            <WorkspaceTooltipIconButton
              className={cn(
                HOUSE_COLLABORATOR_ACTION_ICON_CLASS,
                HOUSE_COLLABORATOR_ACTION_ICON_CONFIRM_CLASS,
              )}
              onClick={() => {
                onChangeCollaboratorRole(chip, roleEditorCurrentRole)
                resetCollaboratorEditors()
              }}
              aria-label={`Apply role change for ${chip.name}`}
              tooltip="Apply role change"
            >
              <Save className="h-4 w-4" />
            </WorkspaceTooltipIconButton>
          ) : (
            <span className={cn(HOUSE_COLLABORATOR_ACTION_ICON_CLASS, 'opacity-0')} aria-hidden="true" />
          )}
          <WorkspaceTooltipIconButton
            className={cn(HOUSE_COLLABORATOR_ACTION_ICON_CLASS, HOUSE_COLLABORATOR_ACTION_ICON_DISCARD_CLASS)}
            onClick={resetCollaboratorEditors}
            aria-label={`Cancel role change for ${chip.name}`}
            tooltip="Cancel role change"
          >
            <X className="h-4 w-4" />
          </WorkspaceTooltipIconButton>
        </div>
      ) : isRestoreEditorOpen ? (
        <div className="flex items-center justify-end gap-1.5">
          {restoreEditorRole ? (
            <WorkspaceTooltipIconButton
              className={cn(
                HOUSE_COLLABORATOR_ACTION_ICON_CLASS,
                HOUSE_COLLABORATOR_ACTION_ICON_CONFIRM_CLASS,
              )}
              onClick={() => {
                if (!selectedWorkspace) return
                onToggleCollaboratorRemoved(selectedWorkspace, chip, { restoreRole: restoreEditorRole })
                resetCollaboratorEditors()
              }}
              aria-label={`Send reinstate invitation for ${chip.name}`}
              tooltip={`Send reinstate invitation as ${collaboratorRoleLabel(restoreEditorRole)}`}
            >
              <Send className="h-4 w-4" />
            </WorkspaceTooltipIconButton>
          ) : (
            <span className={cn(HOUSE_COLLABORATOR_ACTION_ICON_CLASS, 'opacity-0')} aria-hidden="true" />
          )}
          <WorkspaceTooltipIconButton
            className={cn(HOUSE_COLLABORATOR_ACTION_ICON_CLASS, HOUSE_COLLABORATOR_ACTION_ICON_DISCARD_CLASS)}
            onClick={resetCollaboratorEditors}
            aria-label={`Cancel reinstate for ${chip.name}`}
            tooltip="Cancel reinstate"
          >
            <X className="h-4 w-4" />
          </WorkspaceTooltipIconButton>
        </div>
      ) : null

    return (
      <TableRow
        key={chip.key}
        className={cn(
          'group h-14',
          canManageSelectedWorkspace && !hasOpenMemberEditState && 'hover:bg-[hsl(var(--tone-accent-50))]',
        )}
      >
        <TableCell className={cn('h-14 px-3 py-0 align-middle font-medium', HOUSE_TABLE_CELL_TEXT_CLASS)}>
          <div className="flex h-14 items-center">
            <Badge
              variant={collaboratorBadgeVariant(chip.state)}
              className={cn(
                canManageSelectedWorkspace &&
                  !hasOpenMemberEditState &&
                  'transition-[transform,box-shadow] duration-[var(--motion-duration-ui)] ease-out group-hover:-translate-y-px group-hover:shadow-[0_2px_8px_hsl(var(--foreground)/0.08)]',
              )}
            >
              {chip.state === 'pending'
                ? `${chip.name} (pending)`
                : chip.state === 'removed' && restoreEditorKey !== chip.key
                  ? `${chip.name} (removed)`
                  : chip.name}
            </Badge>
          </div>
        </TableCell>
        <TableCell className={cn('h-14 px-3 py-0 align-middle text-muted-foreground', HOUSE_TABLE_CELL_TEXT_CLASS)}>
          <div className="flex h-14 items-center">
            {roleNode}
          </div>
        </TableCell>
        <TableCell className={cn('h-14 px-3 py-0 align-middle', HOUSE_TABLE_CELL_TEXT_CLASS)}>
          <div className="flex h-14 items-center justify-end">
            {actionNode}
          </div>
        </TableCell>
      </TableRow>
    )
  }

  useEffect(() => {
    setRoleEditorKey(null)
    setRoleEditorDraftRole(null)
    setRestoreEditorKey(null)
    setRestoreEditorRole(null)
    setCollaboratorAuditFilter('all')
    setCollaboratorActivityCollapsed(true)
    setWorkspaceActivityCollapsed(true)
    setConversationActivityCollapsed(true)
    setRemovalConfirmKey(null)
    setCollaboratorActorExpanded({})
    setWorkspaceActivityGroupExpanded({
      name_changes: false,
      lock_state: false,
      other: false,
    })
    setConversationActorExpanded({})
    setActiveTab(initialTab || 'overview')
  }, [initialTab, selectedWorkspaceId])

  useEffect(() => {
    if (selectedWorkspace && !canViewWorkspaceDrilldownTab(selectedWorkspace, currentWorkspaceUserId, activeTab)) {
      setActiveTab('overview')
    }
  }, [activeTab, currentWorkspaceUserId, selectedWorkspace])

  useEffect(() => {
    if (!memberActionIntent || memberActionIntent.workspaceId !== selectedWorkspaceId) {
      return
    }
    setActiveTab('actions')
    if (memberActionIntent.action === 'edit-pending') {
      resetCollaboratorEditors()
      onMemberActionIntentHandled()
      return
    }
    const matchingChip = collaboratorChips.find((chip) => chip.key === memberActionIntent.chipKey)
    if (!matchingChip) {
      onMemberActionIntentHandled()
      return
    }
    if (memberActionIntent.action === 'change-role' && matchingChip.state !== 'removed') {
      setRoleEditorKey(matchingChip.key)
      setRoleEditorDraftRole(matchingChip.role)
      setRestoreEditorKey(null)
      setRestoreEditorRole(null)
      setRemovalConfirmKey(null)
    } else if (memberActionIntent.action === 'reinstate-member' && matchingChip.state === 'removed') {
      setRestoreEditorKey(matchingChip.key)
      setRestoreEditorRole(matchingChip.role)
      setRoleEditorKey(null)
      setRoleEditorDraftRole(null)
      setRemovalConfirmKey(null)
    }
    onMemberActionIntentHandled()
  }, [collaboratorChips, memberActionIntent, onMemberActionIntentHandled, selectedWorkspaceId])

  const onToggleCollaboratorActivitySection = () => {
    if (collaboratorActivityCollapsed) {
      setCollaboratorActivityCollapsed(false)
      setWorkspaceActivityCollapsed(true)
      setConversationActivityCollapsed(true)
      return
    }
    setCollaboratorActivityCollapsed(true)
  }

  const onToggleWorkspaceActivitySection = () => {
    if (workspaceActivityCollapsed) {
      setWorkspaceActivityCollapsed(false)
      setCollaboratorActivityCollapsed(true)
      setConversationActivityCollapsed(true)
      return
    }
    setWorkspaceActivityCollapsed(true)
  }

  const onToggleConversationActivitySection = () => {
    if (conversationActivityCollapsed) {
      setConversationActivityCollapsed(false)
      setCollaboratorActivityCollapsed(true)
      setWorkspaceActivityCollapsed(true)
      return
    }
    setConversationActivityCollapsed(true)
  }

  const renderConversationActivityGroup = (
    group: ConversationAuditActorGroup,
    groupIndex: number,
  ) => {
    const actorKey = auditActorKey(group.actorName)
    const isExpanded = conversationActorExpanded[actorKey] ?? false
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
            setConversationActorExpanded((current) => ({
              ...current,
              [actorKey]: !isExpanded,
            }))
          }
          aria-expanded={isExpanded}
          aria-label={`Toggle ${formatAuditActorHeaderName(group.actorName, currentReaderName)} conversation log`}
        >
          <p className={cn(houseTypography.text, 'font-medium')}>
            {formatAuditActorHeaderName(group.actorName, currentReaderName)}
          </p>
          <span className="inline-flex items-center gap-1.5">
            <span className={HOUSE_FIELD_HELPER_CLASS}>{group.entries.length}</span>
            {isExpanded ? (
              <ChevronUp className="h-4 w-4 text-muted-foreground" />
            ) : (
              <ChevronDown className="h-4 w-4 text-muted-foreground" />
            )}
          </span>
        </button>
        {isExpanded ? (
          <div className="border-t border-border/50">
            {group.entries.length === 0 ? (
              <p className={cn(HOUSE_FIELD_HELPER_CLASS, 'px-3 py-2')}>
                No conversation events logged yet.
              </p>
            ) : (
              group.entries.map((item, entryIndex) => {
                const { entry, parsedEvent } = item
                return (
                  <div
                    key={entry.id}
                    className={cn('px-3 py-2', entryIndex > 0 ? 'border-t border-border/50' : '')}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="rounded border border-border bg-background/80 px-1.5 py-0.5 text-tiny text-muted-foreground">
                        Message
                      </span>
                      <span className={HOUSE_FIELD_HELPER_CLASS}>
                        Sent {formatTimestamp(entry.createdAt)}
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
              })
            )}
          </div>
        ) : null}
      </div>
    )
  }

  const overviewContent = (
    <>
      <div className={cn(houseSurfaces.sectionPanel, 'house-drilldown-panel-no-pad')}>
        <div className="house-drilldown-heading-block">
          <p className="house-drilldown-heading-block-title">Workspace overview</p>
        </div>
        {!selectedWorkspace ? (
          <div className="house-drilldown-content-block">
            <p className={HOUSE_FIELD_HELPER_CLASS}>Select a workspace to view its overview.</p>
          </div>
        ) : (
          <div
            className="house-drilldown-content-block house-drilldown-summary-stats-grid"
            style={{ gridTemplateColumns: 'repeat(2, minmax(0, 1fr))' }}
          >
            <div
              className="rounded-md border border-border/60 bg-background/80 p-3"
              style={{ gridColumn: '1', gridRow: '1' }}
            >
              <p className={HOUSE_FIELD_HELPER_CLASS}>Owner</p>
              <p className={cn(houseTypography.text, 'mt-1 font-medium')}>{ownerOverviewName}</p>
            </div>
            {!canManageSelectedWorkspace ? (
              <div
                className="rounded-md border border-border/60 bg-background/80 p-3"
                style={{ gridColumn: '2', gridRow: '1' }}
              >
                <p className={HOUSE_FIELD_HELPER_CLASS}>My role</p>
                <p className={cn(houseTypography.text, 'mt-1 font-medium')}>
                  {myRoleLabel || 'Unknown'}
                </p>
              </div>
            ) : null}
            <div
              className="rounded-md border border-border/60 bg-background/80 p-3"
              style={{ gridColumn: '1', gridRow: '2' }}
            >
              <p className={HOUSE_FIELD_HELPER_CLASS}>Stage</p>
              <p className={cn(houseTypography.text, 'mt-1 font-medium')}>
                {workspaceStage(selectedWorkspace)}
              </p>
            </div>
            <div
              className="rounded-md border border-border/60 bg-background/80 p-3"
              style={{ gridColumn: '2', gridRow: '2' }}
            >
              <p className={HOUSE_FIELD_HELPER_CLASS}>Last updated</p>
              <p className={cn(houseTypography.text, 'mt-1 font-medium')}>
                {formatTimestamp(selectedWorkspace.updatedAt)}
              </p>
            </div>
            <div
              className="rounded-md border border-border/60 bg-background/80 p-3"
              style={{ gridColumn: '1', gridRow: '3' }}
            >
              <p className={HOUSE_FIELD_HELPER_CLASS}>Number of team members</p>
              <p className={cn(houseTypography.text, 'mt-1 font-medium')}>
                {teamMemberCount}
              </p>
            </div>
            <div
              className="rounded-md border border-border/60 bg-background/80 p-3"
              style={{ gridColumn: '2', gridRow: '3' }}
            >
              <p className={HOUSE_FIELD_HELPER_CLASS}>Audit entries</p>
              <p className={cn(houseTypography.text, 'mt-1 font-medium')}>
                {canAccessWorkspaceLogs ? workspaceAuditEntries.length : 'No access'}
              </p>
            </div>
          </div>
        )}
      </div>

    </>
  )

  const dataContent = (
    <>
      <div className={cn(houseSurfaces.sectionPanel, 'house-drilldown-panel-no-pad')}>
        <div className="house-drilldown-heading-block">
          <p className="house-drilldown-heading-block-title">Workspace data</p>
        </div>
        {!selectedWorkspace ? (
          <div className="house-drilldown-content-block">
            <p className={HOUSE_FIELD_HELPER_CLASS}>Select a workspace to inspect its data.</p>
          </div>
        ) : (
          <div className="house-drilldown-content-block">
            {[
              ['Workspace ID', selectedWorkspace.id],
              ['Version', selectedWorkspace.version],
              ['Owner', ownerDisplayName],
              ['Pinned', selectedWorkspace.pinned ? 'Yes' : 'No'],
              ['Archived for me', selectedWorkspace.archived ? 'Yes' : 'No'],
              ['Locked', workspaceLockStateLabel(selectedWorkspace, currentWorkspaceUserId)],
              ['Updated', formatTimestamp(selectedWorkspace.updatedAt)],
            ].map(([label, value], index) => (
              <div
                key={label}
                className={cn(
                  'flex items-center justify-between gap-3 px-1 py-2',
                  index > 0 ? 'border-t border-border/50' : '',
                )}
              >
                <p className={HOUSE_FIELD_HELPER_CLASS}>{label}</p>
                <p className={cn(houseTypography.text, 'text-right font-medium')}>{value}</p>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className={cn(houseSurfaces.sectionPanel, 'house-drilldown-panel-no-pad')}>
        <div className="house-drilldown-heading-block">
          <p className="house-drilldown-heading-block-title">Membership</p>
        </div>
        {!selectedWorkspace ? (
          <div className="house-drilldown-content-block">
            <p className={HOUSE_FIELD_HELPER_CLASS}>
              Select a workspace to inspect membership counts.
            </p>
          </div>
        ) : (
          <div
            className="house-drilldown-content-block house-drilldown-summary-stats-grid"
            style={{ gridTemplateColumns: 'repeat(3, minmax(0, 1fr))' }}
          >
            <div className="rounded-md border border-border/60 bg-background/80 p-3">
              <p className={HOUSE_FIELD_HELPER_CLASS}>Active</p>
              <p className={cn(houseTypography.text, 'mt-1 font-medium')}>
                {activeCollaboratorCount}
              </p>
            </div>
            <div className="rounded-md border border-border/60 bg-background/80 p-3">
              <p className={HOUSE_FIELD_HELPER_CLASS}>Pending</p>
              <p className={cn(houseTypography.text, 'mt-1 font-medium')}>
                {pendingCollaboratorCount}
              </p>
            </div>
            <div className="rounded-md border border-border/60 bg-background/80 p-3">
              <p className={HOUSE_FIELD_HELPER_CLASS}>Removed</p>
              <p className={cn(houseTypography.text, 'mt-1 font-medium')}>
                {removedCollaboratorCount}
              </p>
            </div>
          </div>
        )}
      </div>
    </>
  )

  const actionsContent = (
    <TooltipProvider delayDuration={120}>
    <>
      <div className={cn(houseSurfaces.sectionPanel, 'house-drilldown-panel-no-pad')}>
        <div className="house-drilldown-heading-block">
          <p className="house-drilldown-heading-block-title">Workspace team</p>
        </div>
        {!selectedWorkspace ? (
          <div className="house-drilldown-content-block">
            <p className={HOUSE_FIELD_HELPER_CLASS}>Select a workspace to manage collaborators.</p>
          </div>
        ) : (
          <div className="house-drilldown-content-block space-y-2">
            <div className="w-full house-table-context-profile">
              <Table className="w-full table-fixed house-table-resizable" data-house-no-column-resize="true" data-house-no-column-controls="true">
                <colgroup>
                  <col style={{ width: '54%' }} />
                  <col style={{ width: '18%' }} />
                  <col style={{ width: '28%' }} />
                </colgroup>
                <TableHeader className="house-table-head text-left">
                  <TableRow style={{ backgroundColor: 'transparent' }}>
                    <TableHead className={`${HOUSE_TABLE_HEAD_TEXT_CLASS} text-left`}>Team member</TableHead>
                    <TableHead className={`${HOUSE_TABLE_HEAD_TEXT_CLASS} text-left`}>Role</TableHead>
                    <TableHead className={`${HOUSE_TABLE_HEAD_TEXT_CLASS} text-center`}>Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  <TableRow className="h-14">
                    <TableCell className={cn('h-14 px-3 py-0 align-middle font-medium', HOUSE_TABLE_CELL_TEXT_CLASS)}>
                      <div className="flex h-14 items-center">
                        <Badge variant={ownerBadgeVariant}>{ownerBadgeLabel}</Badge>
                      </div>
                    </TableCell>
                    <TableCell className={cn('h-14 px-3 py-0 align-middle text-muted-foreground', HOUSE_TABLE_CELL_TEXT_CLASS)}>
                      <div className="flex h-14 items-center">Owner</div>
                    </TableCell>
                    <TableCell className={cn('h-14 px-3 py-0 align-middle', HOUSE_TABLE_CELL_TEXT_CLASS)}>
                      <div className="flex h-14 items-center justify-end" />
                    </TableCell>
                  </TableRow>
                  {collaboratorChips.map(renderCollaboratorRow)}
                  {canManageSelectedWorkspace && !collaboratorComposerOpen && !roleEditorKey && !restoreEditorKey && !removalConfirmKey ? (
                    <TableRow className="h-14">
                      <TableCell className={cn('h-14 px-3 py-0 align-middle', HOUSE_TABLE_CELL_TEXT_CLASS)}>
                        <div className="flex h-14 items-center" />
                      </TableCell>
                      <TableCell className={cn('h-14 px-3 py-0 align-middle', HOUSE_TABLE_CELL_TEXT_CLASS)}>
                        <div className="flex h-14 items-center" />
                      </TableCell>
                      <TableCell className={cn('h-14 px-3 py-0 align-middle', HOUSE_TABLE_CELL_TEXT_CLASS)}>
                        <div className="flex h-14 items-center justify-end">
                          <WorkspaceTooltipIconButton
                            className={cn(
                              HOUSE_COLLABORATOR_ACTION_ICON_CLASS,
                              HOUSE_COLLABORATOR_ACTION_ICON_ADD_CLASS,
                            )}
                            onClick={onOpenCollaboratorComposer}
                            disabled={!canAddCollaborator}
                            aria-label={`Invite collaborator to ${collaboratorWorkspaceName}`}
                            tooltip="Invite collaborator"
                          >
                            <Plus className="h-4 w-4" />
                          </WorkspaceTooltipIconButton>
                        </div>
                      </TableCell>
                    </TableRow>
                  ) : null}
                  {collaboratorComposerOpen ? (
                    <TableRow className="h-14">
                      <TableCell className={cn('h-14 px-3 py-0 align-middle', HOUSE_TABLE_CELL_TEXT_CLASS)}>
                        <div className="flex h-14 items-center">
                          <div className="max-w-[28rem]">
                          <Input
                            value={collaboratorQuery}
                            onChange={(event) => onCollaboratorQueryChange(event.target.value)}
                            onKeyDown={(event) => {
                              if (event.key === 'Enter' && canConfirmAddCollaborator) {
                                event.preventDefault()
                                onConfirmAddCollaborator()
                              }
                            }}
                            placeholder="Search by collaborator name"
                            className={HOUSE_INPUT_CLASS}
                          />
                          </div>
                        </div>
                      </TableCell>
                      <TableCell className={cn('h-14 px-3 py-0 align-middle', HOUSE_TABLE_CELL_TEXT_CLASS)}>
                        <div className="flex h-14 items-center">
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
                            <SelectTrigger className="h-9 w-auto min-w-sz-120 px-3 text-sm">
                              <SelectValue placeholder="Select role" />
                            </SelectTrigger>
                            <SelectContent className={WORKSPACE_SELECT_TONE_CLASS}>
                              {COLLABORATOR_ROLE_OPTIONS.map((option) => (
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
                          {canConfirmAddCollaborator ? (
                            <WorkspaceTooltipIconButton
                              className={cn(
                                HOUSE_COLLABORATOR_ACTION_ICON_CLASS,
                                HOUSE_COLLABORATOR_ACTION_ICON_CONFIRM_CLASS,
                              )}
                              onClick={onConfirmAddCollaborator}
                              aria-label={`Invite collaborator to ${collaboratorWorkspaceName}`}
                              tooltip="Invite collaborator"
                            >
                              <Send className="h-4 w-4" />
                            </WorkspaceTooltipIconButton>
                          ) : (
                            <span className={cn(HOUSE_COLLABORATOR_ACTION_ICON_CLASS, 'opacity-0')} aria-hidden="true" />
                          )}
                          <WorkspaceTooltipIconButton
                            className={cn(
                              HOUSE_COLLABORATOR_ACTION_ICON_CLASS,
                              HOUSE_COLLABORATOR_ACTION_ICON_DISCARD_CLASS,
                            )}
                            onClick={onOpenCollaboratorComposer}
                            aria-label={`Cancel invite collaborator for ${collaboratorWorkspaceName}`}
                            tooltip="Cancel invite collaborator"
                          >
                            <X className="h-4 w-4" />
                          </WorkspaceTooltipIconButton>
                        </div>
                      </TableCell>
                    </TableRow>
                  ) : null}
                </TableBody>
              </Table>
            </div>
            {collaboratorSearchLoading ? <p className={HOUSE_FIELD_HELPER_CLASS}>Searching accounts...</p> : null}
            {collaboratorSearchResults.length > 0 ? (
              <div className="space-y-1">
                {collaboratorSearchResults.map((account) => {
                  const isSelected = selectedInviteAccount?.userId === account.userId
                  return (
                    <button
                      key={account.userId}
                      type="button"
                      className={cn(
                        'flex w-full items-center justify-between gap-3 rounded-md border border-border/60 px-3 py-2 text-left',
                        isSelected
                          ? 'bg-[hsl(var(--tone-accent-50))] ring-1 ring-[hsl(var(--tone-accent-300))]'
                          : 'bg-background/70 hover:bg-accent/30',
                      )}
                      onClick={() => onSelectInviteAccount(account)}
                    >
                      <div className="min-w-0">
                        <p className={cn(houseTypography.text, 'truncate font-medium')}>{account.name}</p>
                        <p className={cn(HOUSE_FIELD_HELPER_CLASS, 'truncate')}>
                          {account.email || 'No email on account'}
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
            {!canManageSelectedWorkspace ? (
              <p className={HOUSE_FIELD_HELPER_CLASS}>
                Only the workspace owner can invite collaborators.
              </p>
            ) : null}
          </div>
        )}
      </div>
    </>
    </TooltipProvider>
  )

  const logsContent = (
    <>
      <div className={cn(houseSurfaces.sectionPanel, 'house-drilldown-panel-no-pad')}>
        <div className="house-drilldown-heading-block">
          <p className="house-drilldown-heading-block-title">
            {showPersonalWorkspaceLogs ? 'Your workspace access activity' : 'Team member activity'}
          </p>
          {selectedWorkspace && canAccessWorkspaceLogs ? (
            <DrilldownSheet.HeadingToggle
              className="ml-auto"
              expanded={!collaboratorActivityCollapsed}
              expandedLabel={
                showPersonalWorkspaceLogs
                  ? 'Collapse your workspace access activity'
                  : 'Collapse team member activity'
              }
              collapsedLabel={
                showPersonalWorkspaceLogs
                  ? 'Expand your workspace access activity'
                  : 'Expand team member activity'
              }
              onClick={onToggleCollaboratorActivitySection}
            />
          ) : null}
        </div>
        {!selectedWorkspace ? (
          <div className="house-drilldown-content-block">
            <p className={HOUSE_FIELD_HELPER_CLASS}>
              {showPersonalWorkspaceLogs
                ? 'Select a workspace to view your workspace access activity.'
                : 'Select a workspace to view team member activity.'}
            </p>
          </div>
        ) : !canAccessWorkspaceLogs ? (
          <div className="house-drilldown-content-block">
            <p className={HOUSE_FIELD_HELPER_CLASS}>
              You no longer have access to workspace logs.
            </p>
          </div>
        ) : collaboratorActivityCollapsed ? null : (
          <div className="house-drilldown-content-block space-y-2">
            <div className="space-y-2">
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
                      aria-label={`Toggle ${formatAuditActorHeaderName(group.actorName, currentReaderName)} ${showPersonalWorkspaceLogs ? 'activity' : 'team member activity'}`}
                    >
                      <p className={cn(houseTypography.text, 'font-medium')}>
                        {formatAuditActorHeaderName(group.actorName, currentReaderName)}
                      </p>
                      <span className="inline-flex items-center gap-1.5">
                        <span className={HOUSE_FIELD_HELPER_CLASS}>{group.entries.length}</span>
                        {isExpanded ? (
                          <ChevronUp className="h-4 w-4 text-muted-foreground" />
                        ) : (
                          <ChevronDown className="h-4 w-4 text-muted-foreground" />
                        )}
                      </span>
                    </button>
                    {isExpanded ? (
                      <div className="border-t border-border/50">
                        {group.entries.length === 0 ? (
                          <p className={cn(HOUSE_FIELD_HELPER_CLASS, 'px-3 py-2')}>
                            No activity logged yet.
                          </p>
                        ) : (
                          group.entries.map((item, entryIndex) => {
                            const { entry, parsedTransition } = item
                            if (!parsedTransition) {
                              return (
                                <div
                                  key={entry.id}
                                  className={cn(
                                    'px-3 py-2',
                                    entryIndex > 0 ? 'border-t border-border/50' : '',
                                  )}
                                >
                                  <div className="flex items-center justify-between gap-2">
                                    <p className={houseTypography.text}>
                                      {formatAuditMessageForViewer(entry.message, currentReaderName)}
                                    </p>
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
                                  'px-3 py-2',
                                  entryIndex > 0 ? 'border-t border-border/50' : '',
                                )}
                              >
                                <div className="flex items-center justify-between gap-2">
                                  <div className="flex flex-wrap items-center gap-1.5 text-xs">
                                    {transitionPills.fromLabel && transitionPills.fromRawValue ? (
                                      <span className={fromValueClass}>{transitionPills.fromLabel}</span>
                                    ) : null}
                                    {transitionPills.showArrow && transitionPills.fromLabel ? (
                                      <ArrowRight className="h-3.5 w-3.5 text-muted-foreground" />
                                    ) : null}
                                    <span className={toValueClass}>{transitionPills.toLabel}</span>
                                  </div>
                                  <span className={HOUSE_FIELD_HELPER_CLASS}>
                                    {formatAuditCompactTimestamp(entry.createdAt)}
                                  </span>
                                </div>
                              </div>
                            )
                          })
                        )}
                      </div>
                    ) : null}
                  </div>
                )
              })}
            </div>
          </div>
        )}
      </div>

      <div className={cn(houseSurfaces.sectionPanel, 'house-drilldown-panel-no-pad')}>
        <div className="house-drilldown-heading-block">
          <p className="house-drilldown-heading-block-title">Workspace activity</p>
          {selectedWorkspace && canAccessWorkspaceLogs ? (
            <DrilldownSheet.HeadingToggle
              className="ml-auto"
              expanded={!workspaceActivityCollapsed}
              expandedLabel="Collapse workspace activity"
              collapsedLabel="Expand workspace activity"
              onClick={onToggleWorkspaceActivitySection}
            />
          ) : null}
        </div>
        {!selectedWorkspace ? (
          <div className="house-drilldown-content-block">
            <p className={HOUSE_FIELD_HELPER_CLASS}>
              Select a workspace to view workspace activity.
            </p>
          </div>
        ) : !canAccessWorkspaceLogs ? (
          <div className="house-drilldown-content-block">
            <p className={HOUSE_FIELD_HELPER_CLASS}>
              You no longer have access to workspace logs.
            </p>
          </div>
        ) : workspaceActivityEntries.length === 0 ? (
          <div className="house-drilldown-content-block">
            <p className={HOUSE_FIELD_HELPER_CLASS}>No workspace events logged yet.</p>
          </div>
        ) : workspaceActivityCollapsed ? null : (
          <div className="house-drilldown-content-block space-y-2">
            {workspaceActivityGroups.map((group) => (
              <div
                key={group.key}
                className={cn(
                  'rounded-md border border-border/60 bg-background/70',
                  HOUSE_DRILLDOWN_COLLAPSIBLE_ENTITY_CLASS,
                )}
                data-state={workspaceActivityGroupExpanded[group.key] ? 'open' : 'closed'}
              >
                <button
                  type="button"
                  className="flex w-full items-center justify-between gap-2 px-2 py-1.5 text-left"
                  onClick={() =>
                    setWorkspaceActivityGroupExpanded((current) => ({
                      ...current,
                      [group.key]: !current[group.key],
                    }))
                  }
                  aria-expanded={workspaceActivityGroupExpanded[group.key]}
                  aria-label={`Toggle ${group.title.toLowerCase()} workspace activity`}
                >
                  <p className={cn(houseTypography.text, 'font-medium')}>{group.title}</p>
                  <span className="inline-flex items-center gap-1.5">
                    <span className={HOUSE_FIELD_HELPER_CLASS}>{group.entries.length}</span>
                    {workspaceActivityGroupExpanded[group.key] ? (
                      <ChevronUp className="h-4 w-4 text-muted-foreground" />
                    ) : (
                      <ChevronDown className="h-4 w-4 text-muted-foreground" />
                    )}
                  </span>
                </button>
                {workspaceActivityGroupExpanded[group.key] ? (
                  <div className="border-t border-border/50">
                    {group.entries.length === 0 ? (
                      <p className={cn(HOUSE_FIELD_HELPER_CLASS, 'px-3 py-2')}>
                        No workspace events logged yet.
                      </p>
                    ) : (
                      group.entries.map((entry, entryIndex) => {
                        const parsedTransition = parseAuditTransition(entry)
                        if (!parsedTransition) {
                          return (
                            <div
                              key={entry.id}
                              className={cn(
                                'px-3 py-2',
                                entryIndex > 0 ? 'border-t border-border/50' : '',
                              )}
                            >
                              <div className="flex items-center justify-between gap-2">
                                <p className={houseTypography.text}>
                                  {formatAuditMessageForViewer(entry.message, currentReaderName)}
                                </p>
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
                              'px-3 py-2',
                              entryIndex > 0 ? 'border-t border-border/50' : '',
                            )}
                          >
                            <div className="flex items-center justify-between gap-2">
                              <div className="flex flex-wrap items-center gap-1.5 text-xs">
                                {transitionPills.fromLabel && transitionPills.fromRawValue ? (
                                  <span className={fromValueClass}>{transitionPills.fromLabel}</span>
                                ) : null}
                                {transitionPills.showArrow && transitionPills.fromLabel ? (
                                  <ArrowRight className="h-3.5 w-3.5 text-muted-foreground" />
                                ) : null}
                                <span className={toValueClass}>{transitionPills.toLabel}</span>
                              </div>
                              <span className={HOUSE_FIELD_HELPER_CLASS}>
                                {formatAuditCompactTimestamp(entry.createdAt)}
                              </span>
                            </div>
                          </div>
                        )
                      })
                    )}
                  </div>
                ) : null}
              </div>
            ))}
          </div>
        )}
      </div>

      <div className={cn(houseSurfaces.sectionPanel, 'house-drilldown-panel-no-pad')}>
        <div className="house-drilldown-heading-block">
          <p className="house-drilldown-heading-block-title">Conversation log</p>
          {selectedWorkspace && canAccessWorkspaceLogs ? (
            <DrilldownSheet.HeadingToggle
              className="ml-auto"
              expanded={!conversationActivityCollapsed}
              expandedLabel="Collapse conversation log"
              collapsedLabel="Expand conversation log"
              onClick={onToggleConversationActivitySection}
            />
          ) : null}
        </div>
        {!selectedWorkspace ? (
          <div className="house-drilldown-content-block">
            <p className={HOUSE_FIELD_HELPER_CLASS}>
              Select a workspace to view conversation logs.
            </p>
          </div>
        ) : !canAccessWorkspaceLogs ? (
          <div className="house-drilldown-content-block">
            <p className={HOUSE_FIELD_HELPER_CLASS}>
              You no longer have access to workspace logs.
            </p>
          </div>
        ) : conversationActivityEntries.length === 0 ? (
          <div className="house-drilldown-content-block">
            <p className={HOUSE_FIELD_HELPER_CLASS}>No conversation events logged yet.</p>
          </div>
        ) : conversationActivityCollapsed ? null : (
          <div className="house-drilldown-content-block space-y-2">
            {conversationActivityGroups.map((group, groupIndex) =>
              renderConversationActivityGroup(group, groupIndex),
            )}
          </div>
        )}
      </div>
    </>
  )

  return (
    <>
    <div className={cn(HOUSE_DRILLDOWN_SHEET_BODY_CLASS, 'house-drilldown-panel-no-pad')}>
      <div className="relative z-10 house-drilldown-flow-shell">
        <DrilldownSheet.Header
          title={selectedLabel || 'Workspace'}
          variant="workspace"
        >
          <TooltipProvider delayDuration={120}>
            <DrilldownSheet.Tabs
              activeTab={activeTab}
              onTabChange={(tabId) => {
                if (
                  selectedWorkspace &&
                  !canViewWorkspaceDrilldownTab(
                    selectedWorkspace,
                    currentWorkspaceUserId,
                    tabId as WorkspaceDrilldownTab,
                  )
                ) {
                  return
                }
                setActiveTab(tabId as WorkspaceDrilldownTab)
              }}
              panelIdPrefix="workspace-drilldown-panel-"
              tabIdPrefix="workspace-drilldown-tab-"
              tone="workspace"
              flexGrow={drilldownTabFlexGrow}
              aria-label="Workspace drilldown sections"
              className="house-drilldown-tabs"
            >
              {WORKSPACE_DRILLDOWN_TABS.map((tab) => {
                const tabEnabled = selectedWorkspace
                  ? canViewWorkspaceDrilldownTab(selectedWorkspace, currentWorkspaceUserId, tab.id)
                  : true
                const tabRestrictionMessage = workspaceDrilldownTabRestrictionMessage(tab.id)
                const tabLabel = workspaceDrilldownTabLabel(
                  tab.id,
                  selectedWorkspace || null,
                  currentWorkspaceUserId,
                )
                return !tabEnabled && tabRestrictionMessage ? (
                  <Tooltip key={tab.id}>
                    <TooltipTrigger asChild>
                      <span className="inline-flex flex-1 basis-0">
                        <DrilldownSheet.Tab id={tab.id} disabled aria-disabled="true">
                          {tabLabel}
                        </DrilldownSheet.Tab>
                      </span>
                    </TooltipTrigger>
                    <TooltipContent side="top" className="max-w-[16rem] text-xs leading-relaxed">
                      {tabRestrictionMessage}
                    </TooltipContent>
                  </Tooltip>
                ) : (
                  <DrilldownSheet.Tab key={tab.id} id={tab.id}>
                    {tabLabel}
                  </DrilldownSheet.Tab>
                )
              })}
            </DrilldownSheet.Tabs>
          </TooltipProvider>
        </DrilldownSheet.Header>

        <DrilldownSheet.TabPanel
          id={activeTab}
          isActive={true}
          panelIdPrefix="workspace-drilldown-panel-"
          tabIdPrefix="workspace-drilldown-tab-"
        >
          <div className="house-drilldown-stack-3" data-metric-key="workspace-library-drilldown">
            {activeTab === 'overview' ? overviewContent : null}
            {activeTab === 'data' ? dataContent : null}
            {activeTab === 'actions' ? actionsContent : null}
        {activeTab === 'logs' ? logsContent : null}
        {selectedWorkspaceReadOnlyMessage ? (
          <div className="pt-2">
            <div className={drilldownReadOnlyBannerClassName}>
              {selectedWorkspaceReadOnlyMessage}
                </div>
              </div>
            ) : null}
          </div>
        </DrilldownSheet.TabPanel>
      </div>
    </div>
    </>
  )

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
                ? selectedWorkspaceReadOnlyMessage || 'Workspace is read-only'
                : 'Select workspace'}
          </span>
        </Button>
      </div>
      {selectedWorkspaceReadOnly ? (
        <p className={HOUSE_FIELD_HELPER_CLASS}>
          {selectedWorkspaceReadOnlyMessage}
        </p>
      ) : null}
      <p className={cn(HOUSE_DRILLDOWN_SECTION_LABEL_CLASS, 'pl-3')}>Workspace data</p>

      <div className="space-y-2">
        <div className="flex items-center justify-between gap-2">
          <p className={cn(HOUSE_DRILLDOWN_SECTION_LABEL_CLASS, 'pl-3')}>Workspace team</p>
        </div>
        <p className={HOUSE_FIELD_HELPER_CLASS}>Manage workspace team members from the Actions tab.</p>
      </div>

      <div className="space-y-2">
        <p className={cn(HOUSE_DRILLDOWN_SECTION_LABEL_CLASS, 'pl-3')}>Audit logs</p>
        {!selectedWorkspace ? (
          <p className={HOUSE_FIELD_HELPER_CLASS}>Select a workspace to view audit logs.</p>
        ) : !canAccessWorkspaceLogs ? (
          <p className={HOUSE_FIELD_HELPER_CLASS}>You no longer have access to workspace logs.</p>
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
                  ? canViewFullWorkspaceLogs
                    ? 'Expand team member access and roles'
                    : 'Expand your workspace access activity'
                  : canViewFullWorkspaceLogs
                    ? 'Collapse team member access and roles'
                    : 'Collapse your workspace access activity'
              }
            >
              <span className={houseTypography.text}>
                {canViewFullWorkspaceLogs
                  ? 'Team member access and roles'
                  : 'Your workspace access activity'}
              </span>
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
                        aria-label={`Filter team member access and roles by ${option.label}`}
                        title={`Show ${option.label.toLowerCase()} events`}
                      >
                        {option.label}
                      </button>
                    )
                  })}
                </div>
                {collaboratorActivityEntries.length === 0 ? (
                  <p className={HOUSE_FIELD_HELPER_CLASS}>
                    No team member events logged yet.
                  </p>
                ) : (
                  <div className="space-y-2">
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
                                aria-label={`Toggle ${formatAuditActorHeaderName(group.actorName, currentReaderName)} collaborator log entries`}
                              >
                                <p className={cn(houseTypography.text, 'font-medium')}>
                                  {formatAuditActorHeaderName(group.actorName, currentReaderName)}
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
                                            <p className={houseTypography.text}>
                                              {formatAuditMessageForViewer(entry.message, currentReaderName)}
                                            </p>
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
                  {conversationActivityGroups.map((group, groupIndex) =>
                    renderConversationActivityGroup(group, groupIndex),
                  )}
                </div>
              )
            ) : null}
          </div>
        )}
      </div>
    </div>
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
  canOpenInbox,
  onNavigate,
}: {
  centerView: CenterView
  onSelectCenterView: (next: CenterView) => void
  onOpenInbox: () => void
  canOpenInbox: boolean
  onNavigate?: () => void
}) {
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
              Workspace hub
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
  currentUserId,
  onOpenActions,
  onOpenMemberMenu,
}: {
  workspace: WorkspaceRecord
  currentUserId: string | null
  onOpenActions: (workspaceId: string) => void
  onOpenMemberMenu: (
    workspaceId: string,
    itemKey: string,
    itemKind: 'member' | 'pending-summary',
    event: ReactMouseEvent<HTMLElement>,
  ) => void
}) {
  const chips = workspaceCollaboratorChips(workspace)
  const ownerName = normalizeCollaboratorName(workspace.ownerName) || 'Unknown owner'
  const activeChips = chips.filter((chip) => chip.state === 'active')
  const removedChips = chips.filter((chip) => chip.state === 'removed')
  const pendingCount = chips.filter((chip) => chip.state === 'pending').length
  const canManageWorkspaceMembers = isWorkspaceOwner(workspace, currentUserId)
  const visibleChips: Array<{
    key: string
    itemKey: string
    itemKind: 'owner' | 'member' | 'pending-summary'
    label: string
    variant: 'positive' | 'yellow' | 'negative'
    className?: string
  }> = [
    {
      key: `${workspace.id}-owner`,
      itemKey: `${workspace.id}-owner`,
      itemKind: 'owner',
      label: `${ownerName} (Owner)`,
      variant: 'positive',
      className: 'font-semibold',
    },
    ...activeChips.map((chip) => ({
      key: chip.key,
      itemKey: chip.key,
      itemKind: 'member' as const,
      label: chip.name,
      variant: collaboratorBadgeVariant(chip.state),
    })),
    ...(pendingCount > 0
      ? [{
          key: `${workspace.id}-pending-summary`,
          itemKey: `${workspace.id}-pending-summary`,
          itemKind: 'pending-summary' as const,
          label: `+${pendingCount} pending`,
          variant: collaboratorBadgeVariant('pending'),
        }]
      : []),
    ...removedChips.map((chip) => ({
      key: chip.key,
      itemKey: chip.key,
      itemKind: 'member' as const,
      label: chip.name,
      variant: collaboratorBadgeVariant(chip.state),
    })),
  ]

  return (
    <div
      className="flex w-full flex-wrap items-center gap-1.5"
      onClick={(event) => {
        event.stopPropagation()
        onOpenActions(workspace.id)
      }}
    >
      {visibleChips.map((chip) => (
        <button
          key={chip.key}
          type="button"
          onClick={(event) => {
            event.stopPropagation()
            if (canManageWorkspaceMembers && chip.itemKind !== 'owner') {
              onOpenMemberMenu(workspace.id, chip.itemKey, chip.itemKind, event)
              return
            }
            onOpenActions(workspace.id)
          }}
          className={cn(
            'inline-flex rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
            canManageWorkspaceMembers && chip.itemKind !== 'owner' && 'group/member-badge',
          )}
        >
          <Badge
            size="sm"
            variant={chip.variant}
            className={cn(
              chip.className,
              canManageWorkspaceMembers &&
                chip.itemKind !== 'owner' &&
                'transition-[transform,box-shadow] duration-[var(--motion-duration-ui)] ease-out hover:-translate-y-px hover:shadow-[0_2px_8px_hsl(var(--foreground)/0.08)]',
            )}
          >
            <span>{chip.label}</span>
            {canManageWorkspaceMembers && chip.itemKind !== 'owner' ? (
              <ChevronDown
                className={cn(
                  'ml-1 h-3 w-3 transition-[opacity,transform] duration-[var(--motion-duration-ui)] ease-out group-hover/member-badge:translate-y-px',
                  chip.itemKind === 'pending-summary'
                    ? 'opacity-65 group-hover/member-badge:opacity-100'
                    : 'opacity-45 group-hover/member-badge:opacity-80',
                )}
              />
            ) : null}
          </Badge>
        </button>
      ))}
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
  const [workspaceScope, setWorkspaceScope] = useState<WorkspaceScope>(() =>
    parseWorkspaceScope(searchParams.get('scope'), searchParams.get('filter')),
  )
  const [invitationTypeFilter, setInvitationTypeFilter] = useState<InvitationTypeFilter>('all')
  const [filterKey, setFilterKey] = useState<FilterKey>(() => parseFilterKey(searchParams.get('filter')))
  const [sortColumn, setSortColumn] = useState<SortColumn>(() => parseSortColumn(searchParams.get('sort')))
  const [sortDirection, setSortDirection] = useState<SortDirection>(() => parseSortDirection(searchParams.get('dir')))
  const [workspaceTableVisible] = useState(true)
  const [workspaceSearchVisible, setWorkspaceSearchVisible] = useState(false)
  const [workspaceFilterVisible, setWorkspaceFilterVisible] = useState(false)
  const [workspaceToolsOpen, setWorkspaceToolsOpen] = useState(false)
  const [workspaceSettingsVisible, setWorkspaceSettingsVisible] = useState(false)
  const [workspaceTableDensity, setWorkspaceTableDensity] = useState<WorkspaceTableDensity>('default')
  const [workspaceSearchPopoverPosition, setWorkspaceSearchPopoverPosition] = useState({ top: 0, right: 0 })
  const [workspaceFilterPopoverPosition, setWorkspaceFilterPopoverPosition] = useState({ top: 0, right: 0 })
  const [workspaceSettingsPopoverPosition, setWorkspaceSettingsPopoverPosition] = useState({ top: 0, right: 0 })
  const initialWorkspaceTableLayoutWidth = useMemo(() => resolveInitialWorkspaceTableLayoutWidth(), [])
  const [workspaceTableLayoutWidth] = useState(initialWorkspaceTableLayoutWidth)
  const [workspaceTableColumnOrder, setWorkspaceTableColumnOrder] = useState<WorkspaceTableColumnKey[]>(
    () => [...WORKSPACE_TABLE_COLUMN_ORDER],
  )
  const [workspaceTableColumns, setWorkspaceTableColumns] = useState<Record<WorkspaceTableColumnKey, WorkspaceTableColumnPreference>>(
    () => createDefaultWorkspaceTableColumns(initialWorkspaceTableLayoutWidth),
  )
  const [workspaceTableResizingColumn, setWorkspaceTableResizingColumn] = useState<WorkspaceTableColumnKey | null>(null)
  const [workspaceTableDraggingColumn, setWorkspaceTableDraggingColumn] = useState<WorkspaceTableColumnKey | null>(null)
  const [workspaceDrilldownSelectionId, setWorkspaceDrilldownSelectionId] = useState<string | null>(null)
  const [workspaceDrilldownInitialTab, setWorkspaceDrilldownInitialTab] = useState<WorkspaceDrilldownTab>('overview')
  const [createWorkspaceRowOpen, setCreateWorkspaceRowOpen] = useState(false)
  const [newWorkspaceName, setNewWorkspaceName] = useState('')
  const [createError, setCreateError] = useState('')
  const [invitationStatus, setInvitationStatus] = useState('')
  const [menuState, setMenuState] = useState<{
    workspaceId: string
    x: number
    y: number
  } | null>(null)
  const [workspaceMemberMenuState, setWorkspaceMemberMenuState] = useState<{
    workspaceId: string
    itemKey: string
    itemKind: 'member' | 'pending-summary'
    x: number
    y: number
  } | null>(null)
  const [workspaceMemberActionIntent, setWorkspaceMemberActionIntent] = useState<WorkspaceMemberActionIntent | null>(null)
  const [collaboratorQuery, setCollaboratorQuery] = useState('')
  const [collaboratorComposerOpen, setCollaboratorComposerOpen] = useState(false)
  const [collaboratorSearchResults, setCollaboratorSearchResults] = useState<WorkspaceAccountSearchResult[]>([])
  const [collaboratorSearchLoading, setCollaboratorSearchLoading] = useState(false)
  const [selectedInviteAccount, setSelectedInviteAccount] = useState<WorkspaceAccountSearchResult | null>(null)
  const [collaboratorInviteRole, setCollaboratorInviteRole] = useState<WorkspaceCollaboratorRole>('editor')
  const [renamingWorkspaceId, setRenamingWorkspaceId] = useState<string | null>(null)
  const [renameDraft, setRenameDraft] = useState('')
  const [workspaceOwnerName, setWorkspaceOwnerName] = useState<string | null>(() =>
    readWorkspaceOwnerNameFromProfile(),
  )
  const [workspaceCurrentUserId, setWorkspaceCurrentUserId] = useState<string | null>(() =>
    normalizeWorkspaceUserId(readStorageScopeUserId()) || null,
  )
  const workspaceTableLayoutRef = useRef<HTMLDivElement | null>(null)
  const workspaceSearchWrapperRef = useRef<HTMLDivElement | null>(null)
  const workspaceSearchPopoverRef = useRef<HTMLDivElement | null>(null)
  const workspaceFilterWrapperRef = useRef<HTMLDivElement | null>(null)
  const workspaceFilterPopoverRef = useRef<HTMLDivElement | null>(null)
  const workspaceSettingsWrapperRef = useRef<HTMLDivElement | null>(null)
  const workspaceSettingsPopoverRef = useRef<HTMLDivElement | null>(null)
  const workspaceTableResizeRef = useRef<{
    column: WorkspaceTableColumnKey
    visibleColumns: WorkspaceTableColumnKey[]
    startX: number
    startWidths: Partial<Record<WorkspaceTableColumnKey, number>>
  } | null>(null)
  const resolveWorkspaceTableAvailableWidth = useCallback(() => {
    const measuredClient = workspaceTableLayoutRef.current?.clientWidth
    if (Number.isFinite(measuredClient) && Number(measuredClient) > 0) {
      return Math.max(320, Math.round(Number(measuredClient)))
    }
    const measuredRect = workspaceTableLayoutRef.current?.getBoundingClientRect().width
    if (Number.isFinite(measuredRect) && Number(measuredRect) > 0) {
      return Math.max(320, Math.round(Number(measuredRect)))
    }
    return Math.max(320, Math.round(Number(workspaceTableLayoutWidth) || 320))
  }, [workspaceTableLayoutWidth])
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
  const currentAuditActorUserId = useMemo(
    () => normalizeWorkspaceUserId(workspaceCurrentUserId) || null,
    [workspaceCurrentUserId],
  )

  const appendWorkspaceAuditLog = (
    workspaceId: string,
    entryInput: string | WorkspaceAuditEntryDraft,
    category: WorkspaceAuditCategory = 'collaborator_changes',
  ) => {
    const cleanWorkspaceId = normalizeCollaboratorName(workspaceId)
    const nextInput =
      typeof entryInput === 'string'
        ? ({ message: entryInput, category } satisfies WorkspaceAuditEntryDraft)
        : entryInput
    const cleanMessage = normalizeCollaboratorName(nextInput.message)
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
      category: nextInput.category || category,
      eventType: nextInput.eventType || null,
      actorUserId: normalizeWorkspaceUserId(nextInput.actorUserId) || null,
      actorName: normalizeCollaboratorName(nextInput.actorName) || null,
      subjectUserId: normalizeWorkspaceUserId(nextInput.subjectUserId) || null,
      subjectName: normalizeCollaboratorName(nextInput.subjectName) || null,
      fromValue: (nextInput.fromValue || '').trim() || null,
      toValue: (nextInput.toValue || '').trim() || null,
      role: nextInput.role || null,
      metadata: nextInput.metadata || undefined,
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
      if (isWorkspaceRemovedForCurrentUser(workspace, workspaceCurrentUserId)) {
        return false
      }
      if (workspaceScope === 'active' && workspace.archived) {
        return false
      }
      if (workspaceScope === 'archived' && !workspace.archived) {
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
  }, [filterKey, query, sortColumn, sortDirection, workspaceCurrentUserId, workspaceScope, workspaces])
  const visibleWorkspaceTableColumns = useMemo(
    () => workspaceTableColumnOrder.filter((column) => workspaceTableColumns[column].visible),
    [workspaceTableColumnOrder, workspaceTableColumns],
  )
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
  const invitationRows = useMemo(
    () =>
      authorRequests
        .map((request) => ({
          id: request.id,
          invitationType: request.invitationType === 'data' ? 'data' as const : 'workspace' as const,
          invitationLabel: request.workspaceName,
          personName: request.authorName,
          role: request.collaboratorRole,
          invitedAt: request.invitedAt,
          status: 'pending' as const,
        }))
        .sort((left, right) => Date.parse(right.invitedAt) - Date.parse(left.invitedAt)),
    [authorRequests],
  )
  const filteredInvitationRows = useMemo(
    () =>
      invitationTypeFilter === 'all'
        ? invitationRows
        : invitationRows.filter((invitation) => invitation.invitationType === invitationTypeFilter),
    [invitationRows, invitationTypeFilter],
  )
  const inboxWorkspace = useMemo(
    () => {
      const activeWorkspace = activeWorkspaceId
        ? workspaces.find((workspace) => workspace.id === activeWorkspaceId) || null
        : null
      if (
        activeWorkspace &&
        !isWorkspaceReadOnlyForCurrentUser(activeWorkspace, workspaceCurrentUserId)
      ) {
        return activeWorkspace
      }
      return (
        workspaces.find(
          (workspace) =>
            !isWorkspaceReadOnlyForCurrentUser(workspace, workspaceCurrentUserId),
        ) || null
      )
    },
    [activeWorkspaceId, workspaceCurrentUserId, workspaces],
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
    () => {
      if (!workspaceDrilldownSelection) {
        return []
      }
      const invitationStatusByUserId = new Map<string, 'pending' | 'accepted' | 'declined'>()
      for (const invitation of invitationsSent) {
        if (invitation.workspaceId !== workspaceDrilldownSelection.id) {
          continue
        }
        const userId = normalizeWorkspaceUserId(invitation.inviteeUserId || '')
        if (!userId) {
          continue
        }
        invitationStatusByUserId.set(userId, invitation.status)
      }
      return workspaceCollaboratorChips(workspaceDrilldownSelection).filter(
        (chip) => {
          if (chip.state !== 'pending') {
            return true
          }
          const invitationStatus = invitationStatusByUserId.get(chip.userId)
          return invitationStatus === undefined || invitationStatus === 'pending'
        },
      )
    },
    [invitationsSent, workspaceDrilldownSelection],
  )
  const selectedWorkspaceAuditEntries = useMemo(
    () =>
      workspaceDrilldownSelection && canViewWorkspaceLogs(workspaceDrilldownSelection, workspaceCurrentUserId)
        ? [...(workspaceDrilldownSelection.auditLogEntries || [])].sort(
            (left, right) => Date.parse(right.createdAt) - Date.parse(left.createdAt),
          )
        : [],
    [workspaceCurrentUserId, workspaceDrilldownSelection],
  )
  const selectedWorkspaceConversationMessages = useMemo(
    () =>
      workspaceDrilldownSelection
        ? inboxMessages
            .filter((entry) => entry.workspaceId === workspaceDrilldownSelection.id)
            .sort((left, right) => Date.parse(right.createdAt) - Date.parse(left.createdAt))
        : [],
    [inboxMessages, workspaceDrilldownSelection],
  )
  const selectedWorkspaceReadOnly = useMemo(
    () =>
      workspaceDrilldownSelection
        ? isWorkspaceReadOnlyForCurrentUser(workspaceDrilldownSelection, workspaceCurrentUserId)
        : false,
    [workspaceCurrentUserId, workspaceDrilldownSelection],
  )
  const selectedWorkspaceLocked = useMemo(
    () =>
      workspaceDrilldownSelection
        ? isWorkspaceLockedForCurrentUser(workspaceDrilldownSelection, workspaceCurrentUserId)
        : false,
    [workspaceCurrentUserId, workspaceDrilldownSelection],
  )
  const selectedWorkspaceReadOnlyMessage = useMemo(
    () =>
      workspaceDrilldownSelection
        ? workspaceReadOnlyMessage(workspaceDrilldownSelection, workspaceCurrentUserId)
        : null,
    [workspaceCurrentUserId, workspaceDrilldownSelection],
  )
  const canManageSelectedWorkspace = Boolean(
    workspaceDrilldownSelection &&
    canManageWorkspaceMembers(workspaceDrilldownSelection, workspaceCurrentUserId),
  )
  const canConfirmAddCollaborator = Boolean(
    canManageSelectedWorkspace && collaboratorComposerOpen && selectedInviteAccount,
  )
  const onResetWorkspaceTableFilters = useCallback(() => {
    setWorkspaceScope('all')
    setFilterKey('all')
    setViewMode('table')
    setSortColumn('updatedAt')
    setSortDirection('desc')
  }, [])
  const onToggleWorkspaceTableColumnVisibility = useCallback((column: WorkspaceTableColumnKey) => {
    setWorkspaceTableColumns((current) => {
      const visibleCount = WORKSPACE_TABLE_COLUMN_ORDER.filter((key) => current[key].visible).length
      if (current[column].visible && visibleCount <= 1) {
        return current
      }
      const next = {
        ...current,
        [column]: {
          ...current[column],
          visible: !current[column].visible,
        },
      }
      return clampWorkspaceTableColumnsToAvailableWidth({
        columns: next,
        columnOrder: workspaceTableColumnOrder,
        availableWidth: resolveWorkspaceTableAvailableWidth(),
      })
    })
  }, [resolveWorkspaceTableAvailableWidth, workspaceTableColumnOrder])
  const onReorderWorkspaceTableColumn = useCallback((from: WorkspaceTableColumnKey, to: WorkspaceTableColumnKey) => {
    if (from === to) {
      return
    }
    setWorkspaceTableColumnOrder((current) => {
      const visibleOrder = current.filter((column) => workspaceTableColumns[column].visible)
      const fromIndex = visibleOrder.indexOf(from)
      const toIndex = visibleOrder.indexOf(to)
      if (fromIndex < 0 || toIndex < 0) {
        return current
      }
      const queue = [...visibleOrder]
      const [moved] = queue.splice(fromIndex, 1)
      queue.splice(toIndex, 0, moved)
      return current.map((columnKey) => (
        workspaceTableColumns[columnKey].visible ? (queue.shift() || columnKey) : columnKey
      ))
    })
  }, [workspaceTableColumns])
  const onResetWorkspaceTableSettings = useCallback(() => {
    const availableWidth = resolveWorkspaceTableAvailableWidth()
    setWorkspaceTableColumns(createDefaultWorkspaceTableColumns(availableWidth))
    setWorkspaceTableColumnOrder([...WORKSPACE_TABLE_COLUMN_ORDER])
    setWorkspaceTableDensity('default')
  }, [resolveWorkspaceTableAvailableWidth])
  const onAutoAdjustWorkspaceTableWidths = useCallback(() => {
    const availableWidth = resolveWorkspaceTableAvailableWidth()
    const visibleColumns = workspaceTableColumnOrder.filter((column) => workspaceTableColumns[column].visible)
    if (visibleColumns.length === 0) {
      return
    }
    const perColumnWidth = Math.max(120, Math.floor(availableWidth / visibleColumns.length))
    setWorkspaceTableColumns((current) => {
      const next = { ...current }
      for (const column of visibleColumns) {
        next[column] = {
          ...current[column],
          width: clampWorkspaceTableColumnWidth(column, perColumnWidth),
        }
      }
      return clampWorkspaceTableColumnsToAvailableWidth({
        columns: next,
        columnOrder: workspaceTableColumnOrder,
        availableWidth,
      })
    })
  }, [resolveWorkspaceTableAvailableWidth, workspaceTableColumnOrder, workspaceTableColumns])
  const onStartWorkspaceHeadingResize = useCallback((
    event: ReactPointerEvent<HTMLButtonElement>,
    column: WorkspaceTableColumnKey,
  ) => {
    if (event.button !== 0) {
      return
    }
    event.preventDefault()
    event.stopPropagation()
    const visibleColumns = workspaceTableColumnOrder.filter((key) => workspaceTableColumns[key].visible)
    if (visibleColumns.length <= 1 || !visibleColumns.includes(column)) {
      return
    }
    const startWidths = visibleColumns.reduce<Partial<Record<WorkspaceTableColumnKey, number>>>((accumulator, key) => {
      accumulator[key] = Number(workspaceTableColumns[key].width || WORKSPACE_TABLE_COLUMN_DEFAULTS[key].width)
      return accumulator
    }, {})
    workspaceTableResizeRef.current = {
      column,
      visibleColumns,
      startX: event.clientX,
      startWidths,
    }
    setWorkspaceTableResizingColumn(column)
  }, [workspaceTableColumnOrder, workspaceTableColumns])
  const onWorkspaceHeadingResizeHandleKeyDown = useCallback((
    event: ReactKeyboardEvent<HTMLButtonElement>,
    column: WorkspaceTableColumnKey,
  ) => {
    if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') {
      return
    }
    event.preventDefault()
    event.stopPropagation()
    const deltaPx = event.key === 'ArrowLeft' ? -16 : 16
    const availableWidth = resolveWorkspaceTableAvailableWidth()
    setWorkspaceTableColumns((current) => {
      const visibleColumns = workspaceTableColumnOrder.filter((key) => current[key].visible)
      if (visibleColumns.length <= 1 || !visibleColumns.includes(column)) {
        return current
      }
      const startWidths = visibleColumns.reduce<Partial<Record<WorkspaceTableColumnKey, number>>>((accumulator, key) => {
        accumulator[key] = Number(current[key].width || WORKSPACE_TABLE_COLUMN_DEFAULTS[key].width)
        return accumulator
      }, {})
      const resized = clampWorkspaceTableDistributedResize({
        column,
        visibleColumns,
        startWidths,
        deltaPx,
      })
      let changed = false
      const next = { ...current }
      for (const key of visibleColumns) {
        const nextWidth = Number(resized[key] ?? current[key].width)
        if (nextWidth === current[key].width) {
          continue
        }
        changed = true
        next[key] = {
          ...current[key],
          width: nextWidth,
        }
      }
      if (!changed) {
        return current
      }
      return clampWorkspaceTableColumnsToAvailableWidth({
        columns: next,
        columnOrder: workspaceTableColumnOrder,
        availableWidth,
      })
    })
  }, [resolveWorkspaceTableAvailableWidth, workspaceTableColumnOrder])
  useEffect(() => {
    void hydrateWorkspaceStoreFromRemote()
    void hydrateWorkspaceInboxFromRemote()
  }, [hydrateWorkspaceInboxFromRemote, hydrateWorkspaceStoreFromRemote])

  useEffect(() => {
    if (!workspaceTableResizingColumn) {
      return
    }
    const onPointerMove = (event: PointerEvent) => {
      const resizeState = workspaceTableResizeRef.current
      if (!resizeState) {
        return
      }
      const availableWidth = resolveWorkspaceTableAvailableWidth()
      const resized = clampWorkspaceTableDistributedResize({
        column: resizeState.column,
        visibleColumns: resizeState.visibleColumns,
        startWidths: resizeState.startWidths,
        deltaPx: event.clientX - resizeState.startX,
      })
      setWorkspaceTableColumns((current) => {
        let changed = false
        const next = { ...current }
        for (const key of resizeState.visibleColumns) {
          const nextWidth = Number(resized[key] ?? current[key].width)
          if (nextWidth === current[key].width) {
            continue
          }
          changed = true
          next[key] = {
            ...current[key],
            width: nextWidth,
          }
        }
        if (!changed) {
          return current
        }
        return clampWorkspaceTableColumnsToAvailableWidth({
          columns: next,
          columnOrder: workspaceTableColumnOrder,
          availableWidth,
        })
      })
    }
    const stopResize = () => {
      workspaceTableResizeRef.current = null
      setWorkspaceTableResizingColumn(null)
    }
    window.addEventListener('pointermove', onPointerMove)
    window.addEventListener('pointerup', stopResize)
    window.addEventListener('pointercancel', stopResize)
    return () => {
      window.removeEventListener('pointermove', onPointerMove)
      window.removeEventListener('pointerup', stopResize)
      window.removeEventListener('pointercancel', stopResize)
    }
  }, [resolveWorkspaceTableAvailableWidth, workspaceTableColumnOrder, workspaceTableResizingColumn])

  useEffect(() => {
    if (centerView !== 'workspaces' || viewMode !== 'table' || !workspaceTableVisible) {
      return
    }
    const syncWorkspaceTableWidths = () => {
      const availableWidth = resolveWorkspaceTableAvailableWidth()
      setWorkspaceTableColumns((current) => {
        const next = clampWorkspaceTableColumnsToAvailableWidth({
          columns: current,
          columnOrder: workspaceTableColumnOrder,
          availableWidth,
        })
        return workspaceTableColumnsEqual(current, next) ? current : next
      })
    }
    syncWorkspaceTableWidths()
    window.addEventListener('resize', syncWorkspaceTableWidths)
    return () => {
      window.removeEventListener('resize', syncWorkspaceTableWidths)
    }
  }, [
    centerView,
    resolveWorkspaceTableAvailableWidth,
    viewMode,
    workspaceTableColumnOrder,
    workspaceTableVisible,
  ])

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
    if (!workspaceMemberMenuState) {
      return
    }
    const closeMenu = () => setWorkspaceMemberMenuState(null)
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        closeMenu()
      }
    }
    window.addEventListener('keydown', onKeyDown)
    window.addEventListener('scroll', closeMenu, true)
    return () => {
      window.removeEventListener('keydown', onKeyDown)
      window.removeEventListener('scroll', closeMenu, true)
    }
  }, [workspaceMemberMenuState])

  useEffect(() => {
    if (!workspaceMemberMenuState) {
      return
    }
    const exists = workspaces.some((workspace) => workspace.id === workspaceMemberMenuState.workspaceId)
    if (!exists) {
      setWorkspaceMemberMenuState(null)
    }
  }, [workspaceMemberMenuState, workspaces])

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
    if (!workspaceDrilldownSelection) {
      return
    }
    if (!isWorkspaceRemovedForCurrentUser(workspaceDrilldownSelection, workspaceCurrentUserId)) {
      return
    }
    setWorkspaceDrilldownSelectionId(null)
    setCollaboratorQuery('')
    setCollaboratorComposerOpen(false)
    setCollaboratorSearchResults([])
    setCollaboratorSearchLoading(false)
    setSelectedInviteAccount(null)
  }, [workspaceCurrentUserId, workspaceDrilldownSelection])

  useEffect(() => {
    const refreshOwner = () => {
      setWorkspaceOwnerName(readWorkspaceOwnerNameFromProfile())
      setWorkspaceCurrentUserId(normalizeWorkspaceUserId(readStorageScopeUserId()) || null)
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
    nextParams.set('scope', workspaceScope)
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
  }, [centerView, filterKey, viewMode, sortColumn, sortDirection, query, searchParams, setSearchParams, workspaceScope])

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

  useEffect(() => {
    if (!workspaceSearchVisible || !workspaceSearchWrapperRef.current) {
      return
    }
    const rect = workspaceSearchWrapperRef.current.getBoundingClientRect()
    setWorkspaceSearchPopoverPosition({
      top: rect.top,
      right: window.innerWidth - rect.left + 8,
    })
  }, [workspaceSearchVisible])

  useEffect(() => {
    if (!workspaceFilterVisible || !workspaceFilterWrapperRef.current) {
      return
    }
    const rect = workspaceFilterWrapperRef.current.getBoundingClientRect()
    setWorkspaceFilterPopoverPosition({
      top: rect.top,
      right: window.innerWidth - rect.left + 8,
    })
  }, [workspaceFilterVisible])

  useEffect(() => {
    if (!workspaceSettingsVisible || !workspaceSettingsWrapperRef.current) {
      return
    }
    const rect = workspaceSettingsWrapperRef.current.getBoundingClientRect()
    setWorkspaceSettingsPopoverPosition({
      top: rect.top,
      right: window.innerWidth - rect.left + 8,
    })
  }, [workspaceSettingsVisible])

  useEffect(() => {
    if (!workspaceSearchVisible && !workspaceFilterVisible && !workspaceSettingsVisible) {
      return
    }
    const onPointerDown = (event: MouseEvent) => {
      const target = event.target as Node | null
      if (!target) {
        return
      }
      if (
        (workspaceSearchWrapperRef.current && workspaceSearchWrapperRef.current.contains(target)) ||
        (workspaceSearchPopoverRef.current && workspaceSearchPopoverRef.current.contains(target)) ||
        (workspaceFilterWrapperRef.current && workspaceFilterWrapperRef.current.contains(target)) ||
        (workspaceFilterPopoverRef.current && workspaceFilterPopoverRef.current.contains(target)) ||
        (workspaceSettingsWrapperRef.current && workspaceSettingsWrapperRef.current.contains(target)) ||
        (workspaceSettingsPopoverRef.current && workspaceSettingsPopoverRef.current.contains(target))
      ) {
        return
      }
      setWorkspaceSearchVisible(false)
      setWorkspaceFilterVisible(false)
      setWorkspaceSettingsVisible(false)
    }
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') {
        return
      }
      setWorkspaceSearchVisible(false)
      setWorkspaceFilterVisible(false)
      setWorkspaceSettingsVisible(false)
      setWorkspaceToolsOpen(false)
    }
    window.addEventListener('mousedown', onPointerDown)
    window.addEventListener('keydown', onKeyDown)
    return () => {
      window.removeEventListener('mousedown', onPointerDown)
      window.removeEventListener('keydown', onKeyDown)
    }
  }, [workspaceFilterVisible, workspaceSearchVisible, workspaceSettingsVisible])

  useEffect(() => {
    if (centerView !== 'workspaces') {
      setWorkspaceSearchVisible(false)
      setWorkspaceFilterVisible(false)
      setWorkspaceSettingsVisible(false)
      setWorkspaceToolsOpen(false)
    }
  }, [centerView])

  const canCreateWorkspace = Boolean(workspaceOwnerName)

  const resetCollaboratorComposer = useCallback(() => {
    setCollaboratorQuery('')
    setCollaboratorComposerOpen(false)
    setCollaboratorSearchResults([])
    setCollaboratorSearchLoading(false)
    setSelectedInviteAccount(null)
    setCollaboratorInviteRole('editor')
  }, [])

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

  useEffect(() => {
    if (!collaboratorComposerOpen || !canManageSelectedWorkspace || !workspaceDrilldownSelection) {
      setCollaboratorSearchLoading(false)
      if (!collaboratorComposerOpen) {
        setCollaboratorSearchResults([])
        setSelectedInviteAccount(null)
      }
      return
    }
    const cleanQuery = normalizeCollaboratorName(collaboratorQuery)
    if (!cleanQuery) {
      setCollaboratorSearchResults([])
      setCollaboratorSearchLoading(false)
      return
    }
    if (cleanQuery.length < 2) {
      setCollaboratorSearchResults([])
      setCollaboratorSearchLoading(false)
      return
    }
    const token = getAuthSessionToken()
    if (!token) {
      setCollaboratorSearchResults([])
      setCollaboratorSearchLoading(false)
      return
    }

    let cancelled = false
    setCollaboratorSearchLoading(true)

    searchWorkspaceAccountsApi(token, cleanQuery, 8)
      .then((items) => {
        if (cancelled) {
          return
        }
        const ownerUserId = normalizeWorkspaceUserId(workspaceDrilldownSelection.ownerUserId)
        const activeIds = new Set(
          (workspaceDrilldownSelection.collaborators || []).map((participant) => normalizeWorkspaceUserId(participant.userId)),
        )
        const pendingIds = new Set(
          (workspaceDrilldownSelection.pendingCollaborators || []).map((participant) => normalizeWorkspaceUserId(participant.userId)),
        )
        const removedIds = new Set(
          (workspaceDrilldownSelection.removedCollaborators || []).map((participant) => normalizeWorkspaceUserId(participant.userId)),
        )
        const filteredItems = items.filter((item) => {
          const userId = normalizeWorkspaceUserId(item.userId)
          if (!userId) {
            return false
          }
          if (userId === ownerUserId) {
            return false
          }
          if (activeIds.has(userId) || pendingIds.has(userId) || removedIds.has(userId)) {
            return false
          }
          return true
        })
        setCollaboratorSearchResults(filteredItems)
        if (
          selectedInviteAccount &&
          !filteredItems.some((item) => item.userId === selectedInviteAccount.userId)
        ) {
          setSelectedInviteAccount(null)
        }
      })
      .catch((error) => {
        if (cancelled) {
          return
        }
        console.error('Workspace collaborator search failed', error)
        setCollaboratorSearchResults([])
      })
      .finally(() => {
        if (!cancelled) {
          setCollaboratorSearchLoading(false)
        }
      })

    return () => {
      cancelled = true
    }
  }, [
    canManageSelectedWorkspace,
    collaboratorComposerOpen,
    collaboratorQuery,
    selectedInviteAccount,
    workspaceDrilldownSelection,
  ])

  const onCreateWorkspace = () => {
    if (!workspaceOwnerName) {
      setCreateError(WORKSPACE_OWNER_REQUIRED_MESSAGE)
      return
    }
    try {
      const created = createWorkspace(newWorkspaceName.trim() || 'New Workspace')
      setCreateError('')
      setNewWorkspaceName('')
      setCreateWorkspaceRowOpen(false)
      setActiveWorkspaceId(created.id)
    } catch (createWorkspaceError) {
      setCreateError(
        createWorkspaceError instanceof Error
          ? createWorkspaceError.message
          : WORKSPACE_OWNER_REQUIRED_MESSAGE,
      )
    }
  }

  const onOpenCreateWorkspaceRow = () => {
    if (!canCreateWorkspace) {
      setCreateError(WORKSPACE_OWNER_REQUIRED_MESSAGE)
      return
    }
    setCreateError('')
    setCreateWorkspaceRowOpen(true)
  }

  const onCancelCreateWorkspaceRow = () => {
    setCreateWorkspaceRowOpen(false)
    setNewWorkspaceName('')
    setCreateError('')
  }

  const openWorkspaceActionsTab = (workspaceId: string) => {
    setWorkspaceDrilldownInitialTab('actions')
    setWorkspaceDrilldownSelectionId(workspaceId)
    setActiveWorkspaceId(workspaceId)
    setWorkspaceMemberActionIntent(null)
    resetCollaboratorComposer()
  }

  const openWorkspaceActionsTabWithIntent = (intent: WorkspaceMemberActionIntent) => {
    setWorkspaceDrilldownInitialTab('actions')
    setWorkspaceDrilldownSelectionId(intent.workspaceId)
    setActiveWorkspaceId(intent.workspaceId)
    setWorkspaceMemberActionIntent(intent)
    resetCollaboratorComposer()
  }

  const openWorkspaceMemberMenuAtPosition = (
    workspaceId: string,
    itemKey: string,
    itemKind: 'member' | 'pending-summary',
    x: number,
    y: number,
  ) => {
    const menuWidth = 232
    const menuHeight = itemKind === 'pending-summary' ? 88 : 88
    const clampedX = Math.max(8, Math.min(x, window.innerWidth - menuWidth - 8))
    const clampedY = Math.max(8, Math.min(y, window.innerHeight - menuHeight - 8))
    setWorkspaceMemberMenuState((current) =>
      current?.workspaceId === workspaceId &&
      current.itemKey === itemKey &&
      current.itemKind === itemKind &&
      current.x === clampedX &&
      current.y === clampedY
        ? null
        : { workspaceId, itemKey, itemKind, x: clampedX, y: clampedY },
    )
  }

  const onOpenWorkspaceMemberMenu = (
    workspaceId: string,
    itemKey: string,
    itemKind: 'member' | 'pending-summary',
    event: ReactMouseEvent<HTMLElement>,
  ) => {
    event.preventDefault()
    event.stopPropagation()
    const rect = event.currentTarget.getBoundingClientRect()
    openWorkspaceMemberMenuAtPosition(workspaceId, itemKey, itemKind, rect.left, rect.bottom + 6)
  }

  const onConfirmAddCollaborator = () => {
    if (!workspaceDrilldownSelection) {
      setInvitationStatus('Select a workspace first.')
      return
    }
    if (!isWorkspaceOwner(workspaceDrilldownSelection, workspaceCurrentUserId)) {
      setInvitationStatus('Only the workspace author can invite collaborators.')
      resetCollaboratorComposer()
      return
    }
    if (!selectedInviteAccount) {
      setInvitationStatus('Select an account to invite.')
      return
    }
    const sent = sendWorkspaceInvitation(
      workspaceDrilldownSelection.id,
      {
        userId: selectedInviteAccount.userId,
        name: selectedInviteAccount.name,
      },
      collaboratorInviteRole,
    )
    if (!sent) {
      setInvitationStatus('Invitation was not sent. Check owner access or duplicate pending invitation.')
      return
    }
    setInvitationStatus('')
    appendWorkspaceAuditLog(
      workspaceDrilldownSelection.id,
      buildCollaboratorStatusAuditEntry({
        collaboratorName: sent.inviteeName,
        collaboratorUserId: sent.inviteeUserId,
        fromStatus: 'none',
        toStatus: 'pending',
        actorName: currentAuditActorName,
        actorUserId: currentAuditActorUserId,
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
    setInvitationStatus('')
    appendWorkspaceAuditLog(
      cancelled.workspaceId,
      buildCollaboratorStatusAuditEntry({
        collaboratorName: cancelled.inviteeName,
        collaboratorUserId: cancelled.inviteeUserId,
        fromStatus: 'pending',
        toStatus: 'cancelled',
        actorName: currentAuditActorName,
        actorUserId: currentAuditActorUserId,
        role: cancelled.role,
      }),
    )
  }

  const onCancelPendingCollaboratorInvitation = (collaborator: CollaboratorChipEntry) => {
    if (!workspaceDrilldownSelection) {
      setInvitationStatus('Select a workspace first.')
      return
    }
    if (!isWorkspaceOwner(workspaceDrilldownSelection, workspaceCurrentUserId)) {
      setInvitationStatus('Only the workspace author can manage collaborators.')
      return
    }
    if (!collaborator.userId) {
      return
    }
    const invitation = invitationsSent.find(
      (item) =>
        item.workspaceId === workspaceDrilldownSelection.id &&
        item.status === 'pending' &&
        normalizeWorkspaceUserId(item.inviteeUserId) === collaborator.userId,
    )
    if (!invitation) {
      setInvitationStatus(`No pending invitation found for ${collaborator.name}.`)
      return
    }
    onCancelPendingInvitation(invitation.id)
  }

  const onCancelAllPendingInvitationsForWorkspace = (workspace: WorkspaceRecord) => {
    if (!isWorkspaceOwner(workspace, workspaceCurrentUserId)) {
      setInvitationStatus('Only the workspace author can manage collaborators.')
      return
    }
    const pendingInvitations = invitationsSent.filter(
      (item) => item.workspaceId === workspace.id && item.status === 'pending',
    )
    if (pendingInvitations.length === 0) {
      setInvitationStatus('No pending invitations found.')
      return
    }
    pendingInvitations.forEach((invitation) => {
      onCancelPendingInvitation(invitation.id)
    })
  }

  const onChangeCollaboratorRole = (
    collaborator: CollaboratorChipEntry,
    role: WorkspaceCollaboratorRole,
  ) => {
    if (!workspaceDrilldownSelection) {
      setInvitationStatus('Select a workspace first.')
      return
    }
    if (!isWorkspaceOwner(workspaceDrilldownSelection, workspaceCurrentUserId)) {
      setInvitationStatus('Only the workspace author can assign collaborator roles.')
      return
    }
    if (!collaborator.userId) {
      return
    }

    if (collaborator.state === 'pending') {
      const currentRole =
        workspaceDrilldownSelection.pendingCollaboratorRoles?.[collaborator.userId] || 'editor'
      if (currentRole === role) {
        return
      }
      const updatedAt = new Date().toISOString()
      updateWorkspace(workspaceDrilldownSelection.id, {
        pendingCollaboratorRoles: {
          ...(workspaceDrilldownSelection.pendingCollaboratorRoles || {}),
          [collaborator.userId]: role,
        },
        updatedAt,
      })
      appendWorkspaceAuditLog(
        workspaceDrilldownSelection.id,
        buildCollaboratorRoleAuditEntry({
          collaboratorName: collaborator.name,
          collaboratorUserId: collaborator.userId,
          actorName: currentAuditActorName,
          actorUserId: currentAuditActorUserId,
          fromRole: currentRole,
          toRole: role,
          pending: true,
        }),
      )
      return
    }

    const currentRole = workspaceDrilldownSelection.collaboratorRoles?.[collaborator.userId] || 'editor'
    if (currentRole === role) {
      return
    }
    const updatedAt = new Date().toISOString()
    updateWorkspace(workspaceDrilldownSelection.id, {
      collaboratorRoles: {
        ...(workspaceDrilldownSelection.collaboratorRoles || {}),
        [collaborator.userId]: role,
      },
      updatedAt,
    })
    appendWorkspaceAuditLog(
      workspaceDrilldownSelection.id,
      buildCollaboratorRoleAuditEntry({
        collaboratorName: collaborator.name,
        collaboratorUserId: collaborator.userId,
        actorName: currentAuditActorName,
        actorUserId: currentAuditActorUserId,
        fromRole: currentRole,
        toRole: role,
      }),
    )
  }

  const onToggleCollaboratorRemoved = (
    workspace: WorkspaceRecord,
    collaborator: CollaboratorChipEntry,
    options?: ToggleCollaboratorRemovedOptions,
  ) => {
    if (!isWorkspaceOwner(workspace, workspaceCurrentUserId)) {
      setInvitationStatus('Only the workspace author can manage collaborators.')
      return
    }
    if (!collaborator.userId) {
      return
    }
    const removed = collaboratorRemovedSet(workspace)
    const isRemoved = removed.has(collaborator.userId)

    if (isRemoved) {
      const pending = collaboratorPendingSet(workspace)
      const matchedParticipant =
        findWorkspaceParticipantByUserId(workspace.collaborators, collaborator.userId) || {
          userId: collaborator.userId,
          name: collaborator.name,
        }
      if (pending.has(collaborator.userId)) {
        setInvitationStatus(`${matchedParticipant.name} already has a pending invitation.`)
        return
      }
      const nextRole = options?.restoreRole || null
      if (!nextRole) {
        setInvitationStatus('Select role before restoring collaborator access.')
        return
      }
      const sent = sendWorkspaceInvitation(
        workspace.id,
        {
          userId: matchedParticipant.userId,
          name: matchedParticipant.name,
        },
        nextRole,
      )
      if (!sent) {
        setInvitationStatus('Restore invitation was not sent. Check owner access or duplicate pending invitation.')
        return
      }
      setInvitationStatus('')
      appendWorkspaceAuditLog(
        workspace.id,
        buildCollaboratorStatusAuditEntry({
          collaboratorName: sent.inviteeName,
          collaboratorUserId: sent.inviteeUserId,
          fromStatus: 'removed',
          toStatus: 'pending',
          actorName: currentAuditActorName,
          actorUserId: currentAuditActorUserId,
          role: sent.role,
        }),
      )
      return
    }

    if (!options?.skipRemoveConfirmation) {
      const removeConfirmed = window.confirm(
        `Remove collaborator "${collaborator.name}" from "${workspace.name}"?`,
      )
      if (!removeConfirmed) {
        return
      }
    }
    const matchedActiveParticipant =
      findWorkspaceParticipantByUserId(workspace.collaborators, collaborator.userId) || {
        userId: collaborator.userId,
        name: collaborator.name,
      }
    const matchedActiveRole =
      workspace.collaboratorRoles?.[matchedActiveParticipant.userId] || 'editor'
    updateWorkspace(workspace.id, {
      removedCollaborators: [...(workspace.removedCollaborators || []), matchedActiveParticipant],
      updatedAt: new Date().toISOString(),
    })
    setInvitationStatus('')
    appendWorkspaceAuditLog(
      workspace.id,
      buildCollaboratorStatusAuditEntry({
        collaboratorName: matchedActiveParticipant.name,
        collaboratorUserId: matchedActiveParticipant.userId,
        fromStatus: 'active',
        toStatus: 'removed',
        actorName: currentAuditActorName,
        actorUserId: currentAuditActorUserId,
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
    setInvitationStatus('')
  }

  const onDeclineAuthorRequest = (requestId: string) => {
    declineAuthorRequest(requestId)
    setInvitationStatus('Author request declined.')
  }

  const onOpenWorkspace = (workspaceId: string) => {
    const workspace = workspaces.find((item) => item.id === workspaceId)
    if (workspace && isWorkspaceRemovedForCurrentUser(workspace, workspaceCurrentUserId)) {
      setInvitationStatus('This workspace is no longer available for your account.')
      return
    }
    setActiveWorkspaceId(workspaceId)
    navigate(`/w/${workspaceId}/overview`)
  }

  const onSelectWorkspace = (workspaceId: string) => {
    setWorkspaceDrilldownInitialTab('overview')
    setWorkspaceDrilldownSelectionId(workspaceId)
    resetCollaboratorComposer()
    setActiveWorkspaceId(workspaceId)
  }

  const buildWorkspacesReturnPath = () => {
    const params = new URLSearchParams()
    params.set('view', centerView)
    params.set('scope', workspaceScope)
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
    if (workspace && isWorkspaceReadOnlyForCurrentUser(workspace, workspaceCurrentUserId)) {
      setInvitationStatus('Read-only workspaces do not allow inbox actions.')
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
    if (!canRenameWorkspace(workspace, workspaceCurrentUserId)) {
      return
    }
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
    const updatedAt = new Date().toISOString()
    updateWorkspace(workspace.id, {
      name: clean,
      updatedAt,
    })
    appendWorkspaceAuditLog(
      workspace.id,
      buildWorkspaceRenameAuditEntry({
        actorName: currentAuditActorName,
        actorUserId: currentAuditActorUserId,
        fromName: workspace.name,
        toName: clean,
      }),
    )
    onCancelRenameWorkspace()
  }

  const onArchiveToggle = (workspace: WorkspaceRecord) => {
    if (!canArchiveWorkspace(workspace, workspaceCurrentUserId)) {
      return
    }
    updateWorkspace(workspace.id, {
      archived: !workspace.archived,
      updatedAt: new Date().toISOString(),
    })
    setMenuState(null)
  }

  const onLockToggle = (workspace: WorkspaceRecord) => {
    if (!canLockWorkspace(workspace, workspaceCurrentUserId)) {
      return
    }
    const nextLocked = !workspace.ownerArchived
    const updatedAt = new Date().toISOString()
    updateWorkspace(workspace.id, {
      ownerArchived: nextLocked,
      updatedAt,
    })
    appendWorkspaceAuditLog(
      workspace.id,
      buildWorkspaceLockAuditEntry({
        workspaceName: workspace.name,
        actorName: currentAuditActorName,
        actorUserId: currentAuditActorUserId,
        locked: nextLocked,
      }),
    )
    setMenuState(null)
  }

  const onTogglePinned = (workspace: WorkspaceRecord) => {
    if (!canPinWorkspace(workspace, workspaceCurrentUserId)) {
      return
    }
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

  const openWorkspaceMenuAtPosition = (workspaceId: string, x: number, y: number) => {
    const menuWidth = 160
    const menuHeight = 244
    const clampedX = Math.max(8, Math.min(x, window.innerWidth - menuWidth - 8))
    const clampedY = Math.max(8, Math.min(y, window.innerHeight - menuHeight - 8))
    setMenuState((current) => (
      current?.workspaceId === workspaceId && current.x === clampedX && current.y === clampedY
        ? null
        : { workspaceId, x: clampedX, y: clampedY }
    ))
  }

  const onToggleWorkspaceMenu = (workspaceId: string, event: ReactMouseEvent<HTMLButtonElement>) => {
    event.stopPropagation()
    const workspace = workspaces.find((item) => item.id === workspaceId)
    if (
      workspace &&
      !canRenameWorkspace(workspace, workspaceCurrentUserId) &&
      !canPinWorkspace(workspace, workspaceCurrentUserId) &&
      !canArchiveWorkspace(workspace, workspaceCurrentUserId) &&
      !canLockWorkspace(workspace, workspaceCurrentUserId)
    ) {
      return
    }
    const rect = event.currentTarget.getBoundingClientRect()
    const menuWidth = 160
    const menuHeight = 244
    const gap = 6
    const rightAlignedX = rect.right - menuWidth
    const x = Math.max(8, Math.min(rightAlignedX, window.innerWidth - menuWidth - 8))
    const openUp = window.innerHeight - rect.bottom < menuHeight + gap
    const y = openUp
      ? Math.max(8, rect.top - menuHeight - gap)
      : Math.min(rect.bottom + gap, window.innerHeight - menuHeight - 8)
    openWorkspaceMenuAtPosition(workspaceId, x, y)
  }

  const onOpenWorkspaceContextMenu = (workspaceId: string, event: ReactMouseEvent<HTMLElement>) => {
    if (event.shiftKey) {
      return
    }
    event.preventDefault()
    event.stopPropagation()
    const workspace = workspaces.find((item) => item.id === workspaceId)
    if (
      workspace &&
      !canRenameWorkspace(workspace, workspaceCurrentUserId) &&
      !canPinWorkspace(workspace, workspaceCurrentUserId) &&
      !canArchiveWorkspace(workspace, workspaceCurrentUserId) &&
      !canLockWorkspace(workspace, workspaceCurrentUserId)
    ) {
      return
    }
    openWorkspaceMenuAtPosition(workspaceId, event.clientX, event.clientY)
  }

  const menuWorkspace =
    menuState ? workspaces.find((workspace) => workspace.id === menuState.workspaceId) || null : null
  const workspaceMemberMenuWorkspace =
    workspaceMemberMenuState
      ? workspaces.find((workspace) => workspace.id === workspaceMemberMenuState.workspaceId) || null
      : null
  const workspaceMemberMenuChip =
    workspaceMemberMenuWorkspace && workspaceMemberMenuState?.itemKind === 'member'
      ? workspaceCollaboratorChips(workspaceMemberMenuWorkspace).find(
          (chip) => chip.key === workspaceMemberMenuState.itemKey,
        ) || null
      : null
  const workspaceMemberMenuPendingCount = workspaceMemberMenuWorkspace
    ? workspaceCollaboratorChips(workspaceMemberMenuWorkspace).filter((chip) => chip.state === 'pending').length
    : 0
  const menuWorkspaceCanOpen = Boolean(
    menuWorkspace && !isWorkspaceRemovedForCurrentUser(menuWorkspace, workspaceCurrentUserId),
  )
  const menuWorkspaceCanRename = Boolean(
    menuWorkspace && canRenameWorkspace(menuWorkspace, workspaceCurrentUserId),
  )
  const menuWorkspaceCanPin = Boolean(menuWorkspace && canPinWorkspace(menuWorkspace, workspaceCurrentUserId))
  const menuWorkspaceCanArchive = Boolean(
    menuWorkspace && canArchiveWorkspace(menuWorkspace, workspaceCurrentUserId),
  )
  const menuWorkspaceCanLock = Boolean(
    menuWorkspace && canLockWorkspace(menuWorkspace, workspaceCurrentUserId),
  )
  return (
    <div className="flex h-screen flex-col bg-background text-foreground">
      <TopBar scope="workspace" onOpenLeftNav={() => setLeftPanelOpen(true)} />

      <div
        className={cn(
          'grid min-h-0 flex-1 grid-cols-1 nav:grid-cols-[var(--layout-left-nav-width)_minmax(0,1fr)]',
        )}
      >
        <aside className="hidden border-r border-border nav:block">
          <WorkspacesHomeSidebar
            centerView={centerView}
            onSelectCenterView={setCenterView}
            onOpenInbox={onOpenWorkspaceInbox}
            canOpenInbox={canOpenInbox}
          />
        </aside>

        <main className="min-w-0 flex-1 overflow-hidden bg-background">
          <ScrollArea className="h-full">
            <div data-house-role="content-container" className="house-content-container house-content-container-wide">
            <Stack
              data-house-role="page"
              space="sm"
            >
              <Row
                align="center"
                gap="md"
                wrap={false}
                className="house-page-title-row"
              >
                <SectionMarker tone={getSectionMarkerTone('workspace')} size="title" className="self-stretch h-auto" />
                <PageHeader
                  heading={
                    centerView === 'invitations'
                      ? 'Invitations'
                      : centerView === 'data-library'
                        ? 'Data library'
                        : 'My Workspaces'
                  }
                  description={
                    centerView === 'invitations'
                      ? 'Review invitations to collaborate on research manuscripts and datasets.'
                      : centerView === 'data-library'
                        ? 'Display files, access, and permissions in your personal data library.'
                        : 'Create and collaborate on research manuscripts with your team.'
                  }
                  className="!ml-0 !mt-0"
                />
              </Row>

              <Section
                className={cn(
                  HOUSE_SECTION_ANCHOR_CLASS,
                  centerView === 'workspaces' ? null : cn('rounded-lg border border-border', HOUSE_CARD_CLASS),
                )}
                surface="transparent"
                inset="none"
                spaceY="none"
              >
                {centerView === 'workspaces' ? (
                  <>
                <SectionHeader
                  heading="Workspace library"
                  className="house-publications-toolbar-header house-publications-library-toolbar-header"
                  actions={(
                    <div className="ml-auto flex h-8 w-full items-center justify-end gap-1 overflow-visible self-center md:w-auto">
                    <div className="house-approved-toggle-context order-0 inline-flex items-center">
                      <div
                        className="house-segmented-auto-toggle h-8"
                        data-house-role="horizontal-toggle"
                        data-ui="workspace-scope-toggle"
                      >
                        {WORKSPACE_SCOPE_OPTIONS.map((option) => {
                          const isActive = workspaceScope === option.value
                          return (
                            <button
                              key={option.value}
                              type="button"
                              className={cn(
                                HOUSE_TOGGLE_BUTTON_CLASS,
                                'house-segmented-fill-toggle-button relative z-[1] min-w-0 px-3 text-sm text-center',
                                '!rounded-none',
                                !isActive && HOUSE_DRILLDOWN_TOGGLE_MUTED_CLASS,
                                isActive && option.value === 'all' && 'bg-[hsl(var(--tone-accent-600))] text-white',
                                isActive && option.value === 'active' && 'bg-[hsl(var(--tone-positive-600))] text-white',
                                isActive && option.value === 'archived' && 'bg-[hsl(var(--tone-neutral-700))] text-white',
                              )}
                              aria-pressed={isActive}
                              onClick={() => setWorkspaceScope(option.value)}
                            >
                              {option.label}
                            </button>
                          )
                        })}
                      </div>
                    </div>
                    <SectionTools tone="workspace" framed={false} className="order-1">
                      {workspaceTableVisible ? (
                        <div ref={workspaceSearchWrapperRef} className="relative">
                          <SectionToolIconButton
                            icon={<Search className="h-4 w-4" strokeWidth={2.1} />}
                            aria-label={workspaceSearchVisible ? 'Hide workspace search' : 'Show workspace search'}
                            tooltip="Search"
                            active={workspaceSearchVisible}
                            onClick={() => {
                              setWorkspaceSearchVisible((current) => {
                                const nextVisible = !current
                                if (nextVisible) {
                                  setWorkspaceFilterVisible(false)
                                  setWorkspaceSettingsVisible(false)
                                }
                                return nextVisible
                              })
                            }}
                          />
                          {workspaceSearchVisible ? (
                            createPortal(
                            <div
                              ref={workspaceSearchPopoverRef}
                              className="house-publications-search-popover house-workspace-search-popover fixed z-50 w-[22.5rem]"
                              style={{
                                top: `${workspaceSearchPopoverPosition.top}px`,
                                right: `${workspaceSearchPopoverPosition.right}px`,
                              }}
                            >
                              <label className="house-publications-search-label" htmlFor="workspace-library-search-input">
                                Search workspaces
                              </label>
                              <input
                                id="workspace-library-search-input"
                                type="text"
                                autoFocus
                                value={query}
                                onChange={(event) => setQuery(event.target.value)}
                                placeholder="Search by workspace name or ID..."
                                className="house-publications-search-input"
                              />
                            </div>,
                            document.body
                            )
                          ) : null}
                        </div>
                      ) : null}
                      {workspaceTableVisible ? (
                        <div ref={workspaceFilterWrapperRef} className="relative">
                          <SectionToolIconButton
                            icon={<Filter className="h-4 w-4" strokeWidth={2.1} />}
                            aria-label={workspaceFilterVisible ? 'Hide workspace filters' : 'Show workspace filters'}
                            tooltip="Filters"
                            active={workspaceFilterVisible}
                            onClick={() => {
                              setWorkspaceFilterVisible((current) => {
                                const nextVisible = !current
                                if (nextVisible) {
                                  setWorkspaceSearchVisible(false)
                                  setWorkspaceSettingsVisible(false)
                                }
                                return nextVisible
                              })
                            }}
                          />
                          {workspaceFilterVisible ? (
                            createPortal(
                            <div
                              ref={workspaceFilterPopoverRef}
                              className="house-publications-filter-popover house-workspace-filter-popover fixed z-50 w-[18.75rem]"
                              style={{
                                top: `${workspaceFilterPopoverPosition.top}px`,
                                right: `${workspaceFilterPopoverPosition.right}px`,
                              }}
                            >
                              <div className="house-publications-filter-header">
                                <p className="house-publications-filter-title">Filter table</p>
                                <button
                                  type="button"
                                  className="house-publications-filter-clear"
                                  onClick={() => {
                                    onResetWorkspaceTableFilters()
                                    setWorkspaceFilterVisible(false)
                                  }}
                                >
                                  Clear
                                </button>
                              </div>
                              <details className="house-publications-filter-group" open>
                                <summary className="house-publications-filter-summary">
                                  <span>View</span>
                                  <span className="house-publications-filter-count">{viewMode === 'table' ? 'Table' : 'Cards'}</span>
                                </summary>
                                <div className="house-publications-filter-options">
                                  {(['table', 'cards'] as ViewMode[]).map((mode) => (
                                    <label key={`workspace-view-${mode}`} className="house-publications-filter-option">
                                      <input
                                        type="radio"
                                        name="workspace-view-mode"
                                        className="house-publications-filter-checkbox"
                                        checked={viewMode === mode}
                                        onChange={() => setViewMode(mode)}
                                      />
                                      <span className="house-publications-filter-option-label">{mode === 'table' ? 'Table' : 'Cards'}</span>
                                    </label>
                                  ))}
                                </div>
                              </details>
                              <details className="house-publications-filter-group" open>
                                <summary className="house-publications-filter-summary">
                                  <span>List filter</span>
                                  <span className="house-publications-filter-count">
                                    {FILTER_OPTIONS.find((option) => option.key === filterKey)?.label || 'All'}
                                  </span>
                                </summary>
                                <div className="house-publications-filter-options">
                                  {FILTER_OPTIONS.map((option) => (
                                    <label key={`workspace-filter-${option.key}`} className="house-publications-filter-option">
                                      <input
                                        type="radio"
                                        name="workspace-filter-key"
                                        className="house-publications-filter-checkbox"
                                        checked={filterKey === option.key}
                                        onChange={() => setFilterKey(option.key)}
                                      />
                                      <span className="house-publications-filter-option-label">{option.label}</span>
                                    </label>
                                  ))}
                                </div>
                              </details>
                            </div>,
                            document.body
                            )
                          ) : null}
                        </div>
                      ) : null}
                    </SectionTools>
                    <div
                      className={cn(
                        'relative order-2 overflow-visible transition-[max-width,opacity,transform] duration-[var(--motion-duration-ui)] ease-out',
                        workspaceTableVisible && workspaceToolsOpen
                          ? 'z-30 max-w-[20rem] translate-x-0 opacity-100'
                          : 'pointer-events-none z-0 max-w-0 translate-x-1 opacity-0',
                      )}
                      aria-hidden={!workspaceTableVisible || !workspaceToolsOpen}
                    >
                      <SectionTools tone="workspace" framed={false}>
                        <SectionToolIconButton
                          icon={(viewMode === 'table'
                            ? <Share2 className="h-4 w-4" strokeWidth={2.1} />
                            : <Download className="h-4 w-4" strokeWidth={2.1} />)}
                          aria-label={viewMode === 'table' ? 'Switch to cards view' : 'Switch to table view'}
                          tooltip={viewMode === 'table' ? 'Cards' : 'Table'}
                          onClick={() => setViewMode((current) => (current === 'table' ? 'cards' : 'table'))}
                        />
                      </SectionTools>
                    </div>
                    <SectionTools tone="workspace" framed={false} className="order-3">
                      {workspaceTableVisible ? (
                        <SectionToolIconButton
                          icon={<Hammer className="h-[1.09rem] w-[1.09rem]" strokeWidth={2.1} />}
                          aria-label={workspaceToolsOpen ? 'Hide workspace tools' : 'Show workspace tools'}
                          tooltip="Tools"
                          active={workspaceToolsOpen}
                          onClick={() => setWorkspaceToolsOpen((current) => !current)}
                        />
                      ) : null}
                      {workspaceTableVisible && viewMode === 'table' ? (
                        <div ref={workspaceSettingsWrapperRef} className="relative">
                          <SectionToolIconButton
                            icon={<Settings className="h-[1.09rem] w-[1.09rem]" strokeWidth={2.1} />}
                            aria-label={workspaceSettingsVisible ? 'Hide workspace table settings' : 'Show workspace table settings'}
                            tooltip="Settings"
                            active={workspaceSettingsVisible}
                            onClick={() => {
                              setWorkspaceSettingsVisible((current) => {
                                const nextVisible = !current
                                if (nextVisible) {
                                  setWorkspaceSearchVisible(false)
                                  setWorkspaceFilterVisible(false)
                                }
                                return nextVisible
                              })
                            }}
                          />
                          {workspaceSettingsVisible ? (
                            createPortal(
                            <div
                              ref={workspaceSettingsPopoverRef}
                              className="house-publications-filter-popover house-workspace-filter-popover fixed z-50 w-[18.75rem]"
                              style={{
                                top: `${workspaceSettingsPopoverPosition.top}px`,
                                right: `${workspaceSettingsPopoverPosition.right}px`,
                              }}
                            >
                              <div className="house-publications-filter-header">
                                <p className="house-publications-filter-title">Table settings</p>
                                <div className="inline-flex items-center gap-2">
                                  <button type="button" className="house-publications-filter-clear" onClick={onAutoAdjustWorkspaceTableWidths}>
                                    Auto fit
                                  </button>
                                  <button type="button" className="house-publications-filter-clear" onClick={onResetWorkspaceTableSettings}>
                                    Reset
                                  </button>
                                </div>
                              </div>
                              <details className="house-publications-filter-group" open>
                                <summary className="house-publications-filter-summary">
                                  <span>Columns</span>
                                  <span className="house-publications-filter-count">
                                    {visibleWorkspaceTableColumns.length}/{WORKSPACE_TABLE_COLUMN_ORDER.length}
                                  </span>
                                </summary>
                                <div className="house-publications-filter-options">
                                  {workspaceTableColumnOrder.map((columnKey) => {
                                    const checked = workspaceTableColumns[columnKey].visible
                                    const disableToggle = checked && visibleWorkspaceTableColumns.length <= 1
                                    return (
                                      <label
                                        key={`workspace-column-${columnKey}`}
                                        className={cn('house-publications-filter-option', disableToggle && 'opacity-60')}
                                      >
                                        <input
                                          type="checkbox"
                                          className="house-publications-filter-checkbox"
                                          checked={checked}
                                          disabled={disableToggle}
                                          onChange={() => onToggleWorkspaceTableColumnVisibility(columnKey)}
                                        />
                                        <span className="house-publications-filter-option-label">
                                          {WORKSPACE_TABLE_COLUMN_DEFINITIONS[columnKey].label}
                                        </span>
                                      </label>
                                    )
                                  })}
                                </div>
                              </details>
                              <details className="house-publications-filter-group" open>
                                <summary className="house-publications-filter-summary">
                                  <span>Density</span>
                                  <span className="house-publications-filter-count">
                                    {workspaceTableDensity === 'default'
                                      ? 'Default'
                                      : workspaceTableDensity === 'compact'
                                        ? 'Compact'
                                        : 'Comfortable'}
                                  </span>
                                </summary>
                                <div className="house-publications-filter-options">
                                  {(['compact', 'default', 'comfortable'] as WorkspaceTableDensity[]).map((densityOption) => (
                                    <label key={`workspace-density-${densityOption}`} className="house-publications-filter-option">
                                      <input
                                        type="radio"
                                        name="workspace-table-density"
                                        className="house-publications-filter-checkbox"
                                        checked={workspaceTableDensity === densityOption}
                                        onChange={() => setWorkspaceTableDensity(densityOption)}
                                      />
                                      <span className="house-publications-filter-option-label">
                                        {densityOption === 'default'
                                          ? 'Default'
                                          : densityOption === 'compact'
                                            ? 'Compact'
                                            : 'Comfortable'}
                                      </span>
                                    </label>
                                  ))}
                                </div>
                              </details>
                            </div>,
                            document.body
                            )
                          ) : null}
                        </div>
                      ) : null}
                    </SectionTools>
                  </div>
                )}
                />

                {filteredWorkspaces.length === 0 ? (
                  <div className="p-6 text-sm text-muted-foreground">No workspaces match the current filter.</div>
                ) : !workspaceTableVisible ? (
                  <div className="rounded border border-[hsl(var(--border))] bg-[hsl(var(--muted))] p-[var(--space-3)] text-body text-[hsl(var(--muted-foreground))]">
                    Workspace table hidden by user.
                  </div>
                ) : viewMode === 'table' ? (
                  <div ref={workspaceTableLayoutRef} className="relative w-full house-table-context-profile">
                      <Table
                        className={cn(
                          'w-full table-fixed house-table-resizable',
                          workspaceTableDensity === 'compact' && 'house-publications-table-density-compact',
                          workspaceTableDensity === 'comfortable' && 'house-publications-table-density-comfortable',
                        )}
                        data-house-no-column-resize="true"
                        data-house-no-column-controls="true"
                        data-house-table-id="workspaces-table"
                      >
                        <colgroup>
                          {visibleWorkspaceTableColumns.map((columnKey) => {
                            const width = clampWorkspaceTableColumnWidth(columnKey, workspaceTableColumns[columnKey].width)
                            return (
                              <col
                                key={`workspace-col-${columnKey}`}
                                style={{
                                  width: `${width}px`,
                                  minWidth: `${width}px`,
                                }}
                              />
                            )
                          })}
                        </colgroup>
                        <TableHeader className="house-table-head text-left">
                          <TableRow style={{ backgroundColor: 'transparent' }}>
                            {visibleWorkspaceTableColumns.map((columnKey, columnIndex) => {
                              const definition = WORKSPACE_TABLE_COLUMN_DEFINITIONS[columnKey]
                              const sortField = WORKSPACE_TABLE_COLUMN_SORT_COLUMN[columnKey] || null
                              const headerClassName = definition.headerClassName || 'text-left'
                              const alignClass = headerClassName.includes('text-center')
                                ? 'justify-center text-center'
                                : 'justify-start text-left'
                              const isLastVisibleColumn = columnIndex >= visibleWorkspaceTableColumns.length - 1
                              const workspaceTableColumnDividerClass = !isLastVisibleColumn
                                ? 'border-r border-[hsl(var(--border))]/70'
                                : ''
                              return (
                                <TableHead
                                  key={`workspace-head-${columnKey}`}
                                  className={cn('house-table-head-text group relative', headerClassName, workspaceTableColumnDividerClass)}
                                  onDragOver={(event) => {
                                    if (!workspaceTableDraggingColumn || workspaceTableDraggingColumn === columnKey) {
                                      return
                                    }
                                    event.preventDefault()
                                  }}
                                  onDrop={(event) => {
                                    event.preventDefault()
                                    if (!workspaceTableDraggingColumn || workspaceTableDraggingColumn === columnKey) {
                                      return
                                    }
                                    onReorderWorkspaceTableColumn(workspaceTableDraggingColumn, columnKey)
                                    setWorkspaceTableDraggingColumn(null)
                                  }}
                                >
                                  {sortField ? (
                                    <button
                                      type="button"
                                      className={cn(
                                        'inline-flex w-full items-center gap-1 transition-colors hover:text-foreground',
                                        HOUSE_TABLE_SORT_TRIGGER_CLASS,
                                        alignClass,
                                      )}
                                      onClick={() => onSort(sortField)}
                                    >
                                      <span>{definition.label}</span>
                                      {sortColumn === sortField ? (
                                        sortDirection === 'desc' ? (
                                          <ChevronDown className="h-3.5 w-3.5 text-foreground" />
                                        ) : (
                                          <ChevronUp className="h-3.5 w-3.5 text-foreground" />
                                        )
                                      ) : (
                                        <ChevronsUpDown className="h-3.5 w-3.5" />
                                      )}
                                    </button>
                                  ) : columnKey === 'open' ? (
                                    <span className={cn('inline-flex w-full items-center', alignClass)} aria-label={definition.label}>
                                      <span className="sr-only">{definition.label}</span>
                                    </span>
                                  ) : (
                                    <span className={cn('inline-flex w-full items-center', alignClass)}>{definition.label}</span>
                                  )}
                                  <button
                                    type="button"
                                    draggable
                                    className="house-table-reorder-handle"
                                    data-house-dragging={workspaceTableDraggingColumn === columnKey ? 'true' : undefined}
                                    onDragStart={(event) => {
                                      event.dataTransfer.effectAllowed = 'move'
                                      event.dataTransfer.setData('text/plain', columnKey)
                                      setWorkspaceTableDraggingColumn(columnKey)
                                    }}
                                    onDragEnd={() => setWorkspaceTableDraggingColumn(null)}
                                    onClick={(event) => {
                                      event.preventDefault()
                                      event.stopPropagation()
                                    }}
                                    aria-label={`Reorder ${definition.label} column`}
                                    title={`Drag to reorder ${definition.label} column`}
                                  >
                                    <GripVertical className="h-3 w-3" />
                                  </button>
                                  {!isLastVisibleColumn ? (
                                    <button
                                      type="button"
                                      className="house-table-resize-handle"
                                      data-house-dragging={workspaceTableResizingColumn === columnKey ? 'true' : undefined}
                                      onPointerDown={(event) => onStartWorkspaceHeadingResize(event, columnKey)}
                                      onKeyDown={(event) => onWorkspaceHeadingResizeHandleKeyDown(event, columnKey)}
                                      onClick={(event) => {
                                        event.preventDefault()
                                        event.stopPropagation()
                                      }}
                                      aria-label={`Resize ${definition.label} column`}
                                      title={`Resize ${definition.label} column`}
                                    />
                                  ) : null}
                                </TableHead>
                              )
                            })}
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {filteredWorkspaces.map((workspace) => {
                            const signal = workspaceInboxSignals[workspace.id] || {
                              unreadCount: 0,
                              firstUnreadMessageId: null,
                              lastActivityAt: workspace.updatedAt,
                            }
                            const workspaceRemoved = isWorkspaceRemovedForCurrentUser(
                              workspace,
                              workspaceCurrentUserId,
                            )
                            const workspaceReadOnly = isWorkspaceReadOnlyForCurrentUser(workspace, workspaceCurrentUserId)
                            return (
                              <TableRow
                                key={workspace.id}
                                className={cn(
                                  workspaceRemoved ? 'cursor-default opacity-90' : 'cursor-pointer',
                                  workspace.ownerArchived && 'bg-[hsl(var(--tone-neutral-200))] hover:bg-[hsl(var(--tone-neutral-200))]',
                                )}
                                onClick={() => onSelectWorkspace(workspace.id)}
                                onDoubleClick={() => {
                                  if (!workspaceRemoved) {
                                    onOpenWorkspace(workspace.id)
                                  }
                                }}
                              >
                                {visibleWorkspaceTableColumns.map((columnKey, columnIndex) => {
                                  const isLastColumn = columnIndex >= visibleWorkspaceTableColumns.length - 1
                                  const workspaceTableColumnDividerClass = !isLastColumn
                                    ? 'border-r border-[hsl(var(--border))]/70'
                                    : ''
                                  if (columnKey === 'workspace') {
                                    return (
                                      <TableCell
                                        key={`${workspace.id}-${columnKey}`}
                                        className={cn('align-top font-medium', HOUSE_TABLE_CELL_TEXT_CLASS, workspaceTableColumnDividerClass)}
                                        onContextMenu={(event) => onOpenWorkspaceContextMenu(workspace.id, event)}
                                      >
                                        <div className="flex items-center gap-2">
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
                                              <p className="flex min-w-0 items-center gap-1.5">
                                                {workspace.pinned ? <Pin size={13} className="shrink-0 text-emerald-600" aria-label="Pinned workspace" /> : null}
                                                <span className="truncate">{workspace.name}</span>
                                                {workspace.ownerArchived ? (
                                                  <Badge
                                                    size="sm"
                                                    variant="outline"
                                                    className="shrink-0 border-[hsl(var(--tone-neutral-500))] bg-[hsl(var(--tone-neutral-50))] text-[hsl(var(--tone-neutral-800))]"
                                                  >
                                                    {workspaceLockedBadgeLabel(workspace, workspaceCurrentUserId)}
                                                  </Badge>
                                                ) : null}
                                              </p>
                                            )}
                                          </div>
                                        </div>
                                      </TableCell>
                                    )
                                  }
                                  if (columnKey === 'collaborators') {
                                    return (
                                      <TableCell key={`${workspace.id}-${columnKey}`} className={cn(WORKSPACE_TABLE_COLUMN_DEFINITIONS.collaborators.cellClassName, HOUSE_TABLE_CELL_TEXT_CLASS, workspaceTableColumnDividerClass)}>
                                        <div className="flex w-full justify-start">
                                          <CollaboratorBanners
                                            workspace={workspace}
                                            currentUserId={workspaceCurrentUserId}
                                            onOpenActions={openWorkspaceActionsTab}
                                            onOpenMemberMenu={onOpenWorkspaceMemberMenu}
                                          />
                                        </div>
                                      </TableCell>
                                    )
                                  }
                                  if (columnKey === 'stage') {
                                    return (
                                      <TableCell key={`${workspace.id}-${columnKey}`} className={cn(WORKSPACE_TABLE_COLUMN_DEFINITIONS.stage.cellClassName, HOUSE_TABLE_CELL_TEXT_CLASS, workspaceTableColumnDividerClass)}>
                                        {workspaceStage(workspace)}
                                      </TableCell>
                                    )
                                  }
                                  if (columnKey === 'open') {
                                    return (
                                      <TableCell key={`${workspace.id}-${columnKey}`} className={cn(WORKSPACE_TABLE_COLUMN_DEFINITIONS.open.cellClassName, HOUSE_TABLE_CELL_TEXT_CLASS, workspaceTableColumnDividerClass)}>
                                        <div className="flex justify-center">
                                          <Button
                                            type="button"
                                            variant="cta"
                                            size="sm"
                                            className="group h-8 w-8 p-0"
                                            onClick={(event) => {
                                              event.stopPropagation()
                                              onOpenWorkspace(workspace.id)
                                            }}
                                            disabled={workspaceRemoved}
                                            aria-label={`Open ${workspace.name}`}
                                          >
                                            <ArrowRight className="h-3.5 w-3.5 transition-transform duration-[var(--motion-duration-ui)] ease-out group-hover:translate-x-0.5 group-focus-visible:translate-x-0.5" />
                                          </Button>
                                        </div>
                                      </TableCell>
                                    )
                                  }
                                  return (
                                    <TableCell key={`${workspace.id}-${columnKey}`} className={cn(WORKSPACE_TABLE_COLUMN_DEFINITIONS.unread.cellClassName, HOUSE_TABLE_CELL_TEXT_CLASS, workspaceTableColumnDividerClass)}>
                                      <button
                                        type="button"
                                        className={cn(
                                          'inline-flex min-w-8 items-center justify-center rounded border px-2 py-0.5 text-xs font-medium',
                                          unreadToneClass(signal.unreadCount),
                                        )}
                                        onClick={(event) => {
                                          event.stopPropagation()
                                          if (!workspaceReadOnly) {
                                            onOpenWorkspaceInboxForWorkspace(workspace.id, signal.unreadCount > 0)
                                          }
                                        }}
                                        aria-label={`Open inbox for ${workspace.name}. ${signal.unreadCount} unread message${signal.unreadCount === 1 ? '' : 's'}.`}
                                        disabled={workspaceReadOnly}
                                      >
                                        {signal.unreadCount}
                                      </button>
                                    </TableCell>
                                  )
                                })}
                              </TableRow>
                            )
                          })}
                          <TableRow>
                            {visibleWorkspaceTableColumns.map((columnKey, columnIndex) => {
                              const isLastColumn = columnIndex >= visibleWorkspaceTableColumns.length - 1
                              const workspaceTableColumnDividerClass = !isLastColumn
                                ? 'border-r border-[hsl(var(--border))]/70'
                                : ''
                              if (columnKey === 'workspace') {
                                return (
                                  <TableCell key={`workspace-create-${columnKey}`} className={cn('align-top font-medium', HOUSE_TABLE_CELL_TEXT_CLASS, workspaceTableColumnDividerClass)}>
                                    {createWorkspaceRowOpen ? (
                                      <div className="flex items-center gap-2">
                                        <Input
                                          value={newWorkspaceName}
                                          onChange={(event) => setNewWorkspaceName(event.target.value)}
                                          onKeyDown={(event) => {
                                            if (event.key === 'Enter') {
                                              event.preventDefault()
                                              onCreateWorkspace()
                                            } else if (event.key === 'Escape') {
                                              event.preventDefault()
                                              onCancelCreateWorkspaceRow()
                                            }
                                          }}
                                          placeholder="New workspace name"
                                          className={cn('h-8 w-full', HOUSE_INPUT_CLASS)}
                                          autoFocus
                                        />
                                      </div>
                                    ) : (
                                      <div className="flex min-h-8 items-center" />
                                    )}
                                  </TableCell>
                                )
                              }
                              if (columnKey === 'collaborators' || columnKey === 'stage' || columnKey === 'unread') {
                                return (
                                  <TableCell
                                    key={`workspace-create-${columnKey}`}
                                    className={cn(
                                      WORKSPACE_TABLE_COLUMN_DEFINITIONS[columnKey].cellClassName,
                                      HOUSE_TABLE_CELL_TEXT_CLASS,
                                      workspaceTableColumnDividerClass,
                                    )}
                                  >
                                    <div className="flex min-h-8 items-center" />
                                  </TableCell>
                                )
                              }
                              return (
                                <TableCell key={`workspace-create-${columnKey}`} className={cn(WORKSPACE_TABLE_COLUMN_DEFINITIONS.open.cellClassName, HOUSE_TABLE_CELL_TEXT_CLASS, workspaceTableColumnDividerClass)}>
                                  <div className="flex justify-center gap-1.5">
                                    {createWorkspaceRowOpen ? (
                                      <>
                                        <button
                                          type="button"
                                          className={cn(HOUSE_COLLABORATOR_ACTION_ICON_CLASS, HOUSE_COLLABORATOR_ACTION_ICON_CONFIRM_CLASS)}
                                          onClick={(event) => {
                                            event.stopPropagation()
                                            onCreateWorkspace()
                                          }}
                                          aria-label="Save workspace"
                                          disabled={!canCreateWorkspace}
                                        >
                                          <Save className="h-4 w-4" strokeWidth={2.1} />
                                        </button>
                                        <button
                                          type="button"
                                          className={cn(HOUSE_COLLABORATOR_ACTION_ICON_CLASS, HOUSE_COLLABORATOR_ACTION_ICON_DISCARD_CLASS)}
                                          onClick={(event) => {
                                            event.stopPropagation()
                                            onCancelCreateWorkspaceRow()
                                          }}
                                          aria-label="Cancel create workspace"
                                        >
                                          <X className="h-4 w-4" strokeWidth={2.1} />
                                        </button>
                                      </>
                                    ) : (
                                      <button
                                        type="button"
                                        className={cn(HOUSE_COLLABORATOR_ACTION_ICON_CLASS, HOUSE_COLLABORATOR_ACTION_ICON_ADD_CLASS, 'shrink-0')}
                                        onClick={(event) => {
                                          event.stopPropagation()
                                          onOpenCreateWorkspaceRow()
                                        }}
                                        disabled={!canCreateWorkspace}
                                        aria-label="Create workspace"
                                      >
                                        <Plus className="h-4 w-4" strokeWidth={2.2} />
                                      </button>
                                    )}
                                  </div>
                                </TableCell>
                              )
                            })}
                          </TableRow>
                        </TableBody>
                      </Table>
                  </div>
                ) : (
                  <div className="grid gap-3 p-4 md:grid-cols-2 xl:grid-cols-3">
                    {filteredWorkspaces.map((workspace) => {
                      const signal = workspaceInboxSignals[workspace.id] || {
                        unreadCount: 0,
                        firstUnreadMessageId: null,
                        lastActivityAt: workspace.updatedAt,
                      }
                      const ownerLabel = workspaceOwnerLabel(workspace)
                      const workspaceRemoved = isWorkspaceRemovedForCurrentUser(
                        workspace,
                        workspaceCurrentUserId,
                      )
                      const workspaceReadOnly = isWorkspaceReadOnlyForCurrentUser(
                        workspace,
                        workspaceCurrentUserId,
                      )
                      return (
                        <button
                          key={workspace.id}
                          type="button"
                          onClick={() => onSelectWorkspace(workspace.id)}
                          onDoubleClick={() => {
                            if (workspaceRemoved) {
                              return
                            }
                            onOpenWorkspace(workspace.id)
                          }}
                          className={cn(
                            'rounded-lg border border-border bg-background p-3 text-left',
                            workspace.ownerArchived && 'bg-[hsl(var(--tone-neutral-200))] hover:bg-[hsl(var(--tone-neutral-200))]',
                            workspaceRemoved ? 'opacity-90' : !workspace.ownerArchived && 'hover:bg-accent/30',
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
                                  {workspace.ownerArchived ? (
                                    <Badge
                                      size="sm"
                                      variant="outline"
                                      className="shrink-0 border-[hsl(var(--tone-neutral-500))] bg-[hsl(var(--tone-neutral-50))] text-[hsl(var(--tone-neutral-800))]"
                                    >
                                      {workspaceLockedBadgeLabel(workspace, workspaceCurrentUserId)}
                                    </Badge>
                                  ) : null}
                                </p>
                                <p className="mt-1 text-xs text-muted-foreground">{ownerLabel}</p>
                                <div className="mt-2 space-y-1" onClick={(event) => event.stopPropagation()}>
                                  <p className="text-xs text-muted-foreground">Team members</p>
                                  <CollaboratorBanners
                                    workspace={workspace}
                                    currentUserId={workspaceCurrentUserId}
                                    onOpenActions={openWorkspaceActionsTab}
                                    onOpenMemberMenu={onOpenWorkspaceMemberMenu}
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
                            disabled={workspaceRemoved}
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
                    <SectionHeader
                      heading="Received invitations"
                      className="house-publications-toolbar-header house-publications-library-toolbar-header"
                      actions={(
                        <div className="ml-auto flex h-8 w-full items-center justify-end gap-1 overflow-visible self-center md:w-auto">
                          <div className="house-approved-toggle-context order-0 inline-flex items-center">
                            <div
                              className="house-segmented-auto-toggle h-8"
                              data-house-role="horizontal-toggle"
                              data-ui="invitation-type-toggle"
                            >
                              {INVITATION_TYPE_FILTER_OPTIONS.map((option) => {
                                const isActive = invitationTypeFilter === option.value
                                return (
                                  <button
                                    key={option.value}
                                    type="button"
                                    className={cn(
                                      HOUSE_TOGGLE_BUTTON_CLASS,
                                      'house-segmented-fill-toggle-button relative z-[1] min-w-0 px-3 text-sm text-center',
                                      '!rounded-none',
                                      isActive ? 'bg-foreground text-background' : HOUSE_DRILLDOWN_TOGGLE_MUTED_CLASS,
                                    )}
                                    aria-pressed={isActive}
                                    onClick={() => setInvitationTypeFilter(option.value)}
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
                    {filteredInvitationRows.length === 0 ? (
                      <div className={cn('p-6', HOUSE_FIELD_HELPER_CLASS)}>
                        {invitationTypeFilter === 'all'
                          ? 'No invitations at the moment.'
                          : invitationTypeFilter === 'workspace'
                          ? 'No workspace invitations at the moment.'
                          : 'No data invitations at the moment.'}
                      </div>
                    ) : (
                      <div className="w-full house-table-context-profile">
                        <Table
                          className="w-full table-fixed house-table-resizable"
                          data-house-no-column-resize="true"
                          data-house-no-column-controls="true"
                        >
                          <colgroup>
                            <col style={{ width: '14%' }} />
                            <col style={{ width: '38%' }} />
                            <col style={{ width: '12%' }} />
                            <col style={{ width: '16%' }} />
                            <col style={{ width: '20%' }} />
                          </colgroup>
                          <TableHeader className="house-table-head text-left">
                            <TableRow style={{ backgroundColor: 'transparent' }}>
                              <TableHead className={HOUSE_TABLE_HEAD_TEXT_CLASS}>Invitation type</TableHead>
                              <TableHead className={HOUSE_TABLE_HEAD_TEXT_CLASS}>Invitation</TableHead>
                              <TableHead className={HOUSE_TABLE_HEAD_TEXT_CLASS}>Requested access</TableHead>
                              <TableHead className={HOUSE_TABLE_HEAD_TEXT_CLASS}>Invitation received</TableHead>
                              <TableHead className={cn(HOUSE_TABLE_HEAD_TEXT_CLASS, 'text-center')}>Actions</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {filteredInvitationRows.map((invitation) => (
                              <TableRow key={invitation.id} className="h-14">
                                <TableCell className={cn('h-14 px-3 py-0 align-middle', HOUSE_TABLE_CELL_TEXT_CLASS)}>
                                  <div className="flex h-14 items-center">
                                    <span className="inline-flex items-center gap-1.5 text-muted-foreground">
                                      <span
                                        className={cn(
                                          'inline-block h-2 w-2 rounded-full',
                                          invitation.invitationType === 'data' ? 'bg-amber-500' : 'bg-emerald-500',
                                        )}
                                      />
                                      {invitation.invitationType === 'data' ? 'Data' : 'Workspace'}
                                    </span>
                                  </div>
                                </TableCell>
                                <TableCell className={cn('h-14 px-3 py-0 align-middle font-medium', HOUSE_TABLE_CELL_TEXT_CLASS)}>
                                  <div className="flex min-h-14 flex-col justify-center py-2">
                                    <span className="truncate">{invitation.invitationLabel}</span>
                                    <span className="mt-0.5 text-xs font-normal text-muted-foreground">
                                      From {invitation.personName}
                                    </span>
                                  </div>
                                </TableCell>
                                <TableCell className={cn('h-14 px-3 py-0 align-middle text-muted-foreground', HOUSE_TABLE_CELL_TEXT_CLASS)}>
                                  <div className="flex h-14 items-center">{collaboratorRoleLabel(invitation.role)}</div>
                                </TableCell>
                                <TableCell className={cn('h-14 px-3 py-0 align-middle text-muted-foreground', HOUSE_TABLE_CELL_TEXT_CLASS)}>
                                  <div className="flex h-14 items-center">{formatTimestamp(invitation.invitedAt)}</div>
                                </TableCell>
                                <TableCell className={cn('h-14 px-3 py-0 align-middle', HOUSE_TABLE_CELL_TEXT_CLASS)}>
                                  <div className="flex h-14 items-center justify-center gap-2">
                                    <Button
                                      type="button"
                                      variant="cta"
                                      size="sm"
                                      className="inline-flex items-center gap-1.5"
                                      onClick={() => onAcceptAuthorRequest(invitation.id)}
                                    >
                                      <Check className="h-3.5 w-3.5" strokeWidth={2.2} />
                                      Accept
                                    </Button>
                                    <Button
                                      type="button"
                                      variant="destructive"
                                      size="sm"
                                      className="inline-flex items-center gap-1.5"
                                      onClick={() => onDeclineAuthorRequest(invitation.id)}
                                    >
                                      <X className="h-3.5 w-3.5" strokeWidth={2.2} />
                                      Decline
                                    </Button>
                                  </div>
                                </TableCell>
                              </TableRow>
                            ))}
                          </TableBody>
                        </Table>
                      </div>
                    )}
                  </>
                ) : (
                  <WorkspacesDataLibraryView
                    showPageHeader={false}
                  />
                )}
              </Section>

              {centerView === 'workspaces' && viewMode === 'table' && workspaceTableVisible && filteredWorkspaces.length > 0 ? (
                <>
                  {!canCreateWorkspace ? (
                    <p className={HOUSE_FIELD_HELPER_CLASS}>{WORKSPACE_OWNER_REQUIRED_MESSAGE}</p>
                  ) : null}
                  {createError ? (
                    <p className="text-sm text-red-700">{createError}</p>
                  ) : null}
                  {invitationStatus ? (
                    <p className={HOUSE_FIELD_HELPER_CLASS}>{invitationStatus}</p>
                  ) : null}
                </>
              ) : null}

              {centerView === 'workspaces' && (viewMode !== 'table' || !workspaceTableVisible || filteredWorkspaces.length === 0) ? (
                <Section
                  className={cn(HOUSE_SECTION_ANCHOR_CLASS, 'rounded-lg border border-border p-4', HOUSE_CARD_CLASS)}
                  surface="transparent"
                  inset="none"
                  spaceY="none"
                >
                  <Toolbar>
                    <Input
                      value={newWorkspaceName}
                      onChange={(event) => setNewWorkspaceName(event.target.value)}
                      placeholder="New workspace name"
                      className={cn('w-sz-220', HOUSE_INPUT_CLASS)}
                    />
                    <div className="flex h-9 items-center justify-start self-end">
                      <button
                        type="button"
                        className={cn(
                          HOUSE_COLLABORATOR_ACTION_ICON_CLASS,
                          HOUSE_COLLABORATOR_ACTION_ICON_ADD_CLASS,
                          'shrink-0',
                        )}
                        onClick={onCreateWorkspace}
                        disabled={!canCreateWorkspace}
                        aria-label="Create workspace"
                        title={canCreateWorkspace ? 'Create workspace' : WORKSPACE_OWNER_REQUIRED_MESSAGE}
                      >
                        <Plus className="h-4 w-4" strokeWidth={2.2} />
                      </button>
                    </div>
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
                </Section>
              ) : null}
            </Stack>
            </div>
          </ScrollArea>
        </main>

      </div>

      <Sheet
        open={centerView === 'workspaces' && Boolean(workspaceDrilldownSelectionId)}
        onOpenChange={(open) => {
          if (!open) {
            setWorkspaceDrilldownSelectionId(null)
            resetCollaboratorComposer()
          }
        }}
      >
        <SheetContent
          side="right"
          className={cn(
            HOUSE_DRILLDOWN_SHEET_CLASS,
            selectedWorkspaceLocked && 'brightness-[0.85]',
          )}
        >
          <WorkspacesDrilldownPanel
            selectedWorkspaceId={workspaceDrilldownSelectionId}
            selectedWorkspaceName={workspaceDrilldownSelectionName}
            selectedWorkspace={workspaceDrilldownSelection}
            initialTab={workspaceDrilldownInitialTab}
            selectedWorkspaceReadOnly={selectedWorkspaceReadOnly}
            selectedWorkspaceReadOnlyMessage={selectedWorkspaceReadOnlyMessage}
            currentWorkspaceUserId={workspaceCurrentUserId}
            currentReaderName={currentReaderName}
            memberActionIntent={workspaceMemberActionIntent}
            onMemberActionIntentHandled={() => setWorkspaceMemberActionIntent(null)}
            collaboratorChips={selectedWorkspaceCollaboratorChips}
            workspaceAuditEntries={selectedWorkspaceAuditEntries}
            workspaceConversationMessages={selectedWorkspaceConversationMessages}
            canManageSelectedWorkspace={canManageSelectedWorkspace}
        collaboratorComposerOpen={collaboratorComposerOpen}
        collaboratorSearchResults={collaboratorSearchResults}
        collaboratorSearchLoading={collaboratorSearchLoading}
        selectedInviteAccount={selectedInviteAccount}
            collaboratorInviteRole={collaboratorInviteRole}
            collaboratorQuery={collaboratorQuery}
            canConfirmAddCollaborator={canConfirmAddCollaborator}
            onOpenCollaboratorComposer={toggleCollaboratorComposer}
            onSelectInviteAccount={(account) => {
              setSelectedInviteAccount(account)
            }}
            onCollaboratorInviteRoleChange={(role) => {
              setCollaboratorInviteRole(role)
            }}
            onChangeCollaboratorRole={onChangeCollaboratorRole}
              onCancelPendingCollaboratorInvitation={onCancelPendingCollaboratorInvitation}
              onToggleCollaboratorRemoved={onToggleCollaboratorRemoved}
              onCollaboratorQueryChange={(value) => {
                setCollaboratorQuery(value)
                setSelectedInviteAccount(null)
              }}
            onConfirmAddCollaborator={onConfirmAddCollaborator}
            onOpenSelectedWorkspace={onOpenWorkspace}
          />
        </SheetContent>
      </Sheet>

      <Sheet open={leftPanelOpen} onOpenChange={setLeftPanelOpen}>
        <SheetContent side="left" className="w-[var(--layout-left-nav-width-mobile)] p-0 nav:hidden">
          <WorkspacesHomeSidebar
            centerView={centerView}
            onSelectCenterView={setCenterView}
            onOpenInbox={onOpenWorkspaceInbox}
            canOpenInbox={canOpenInbox}
            onNavigate={() => setLeftPanelOpen(false)}
          />
        </SheetContent>
      </Sheet>

      {workspaceMemberMenuState && workspaceMemberMenuWorkspace
        ? createPortal(
            <div
              className="fixed inset-0 z-50"
              data-ui="workspace-member-menu-overlay"
              onClick={() => setWorkspaceMemberMenuState(null)}
            >
              <div
                data-ui="workspace-member-menu-shell"
                className="fixed w-60 rounded-md border border-border bg-card p-1 shadow-lg"
                style={{ left: workspaceMemberMenuState.x, top: workspaceMemberMenuState.y }}
                onClick={(event) => event.stopPropagation()}
              >
                {workspaceMemberMenuState.itemKind === 'pending-summary' ? (
                  <>
                    <button
                      type="button"
                      className="flex w-full items-center gap-2 whitespace-nowrap rounded px-2 py-1.5 text-left text-sm hover:bg-[hsl(var(--tone-accent-100))] hover:text-[hsl(var(--tone-accent-900))]"
                      onClick={() => {
                        openWorkspaceActionsTabWithIntent({
                          workspaceId: workspaceMemberMenuWorkspace.id,
                          action: 'edit-pending',
                        })
                        setWorkspaceMemberMenuState(null)
                      }}
                    >
                      <Pencil className="h-4 w-4 shrink-0" />
                      <span>Edit pending invites</span>
                    </button>
                    <div className="my-1 border-t border-border/70" />
                    <button
                      type="button"
                      className="flex w-full items-center gap-2 whitespace-nowrap rounded px-2 py-1.5 text-left text-sm hover:bg-[hsl(var(--tone-accent-100))] hover:text-[hsl(var(--tone-accent-900))]"
                      onClick={() => {
                        onCancelAllPendingInvitationsForWorkspace(workspaceMemberMenuWorkspace)
                        setWorkspaceMemberMenuState(null)
                      }}
                    >
                      <X className="h-4 w-4 shrink-0" />
                      <span>
                        {workspaceMemberMenuPendingCount > 1 ? 'Cancel all pending invites' : 'Cancel pending invite'}
                      </span>
                    </button>
                  </>
                ) : workspaceMemberMenuChip ? (
                  workspaceMemberMenuChip.state === 'removed' ? (
                    <button
                      type="button"
                      className="flex w-full items-center gap-2 whitespace-nowrap rounded px-2 py-1.5 text-left text-sm hover:bg-[hsl(var(--tone-accent-100))] hover:text-[hsl(var(--tone-accent-900))]"
                      onClick={() => {
                        openWorkspaceActionsTabWithIntent({
                          workspaceId: workspaceMemberMenuWorkspace.id,
                          chipKey: workspaceMemberMenuChip.key,
                          action: 'reinstate-member',
                        })
                        setWorkspaceMemberMenuState(null)
                      }}
                    >
                      <RotateCcw className="h-4 w-4 shrink-0" />
                      <span>Reinstate team member</span>
                    </button>
                  ) : (
                    <>
                      <button
                        type="button"
                        className="flex w-full items-center gap-2 whitespace-nowrap rounded px-2 py-1.5 text-left text-sm hover:bg-[hsl(var(--tone-accent-100))] hover:text-[hsl(var(--tone-accent-900))]"
                        onClick={() => {
                          openWorkspaceActionsTabWithIntent({
                            workspaceId: workspaceMemberMenuWorkspace.id,
                            chipKey: workspaceMemberMenuChip.key,
                            action: 'change-role',
                          })
                          setWorkspaceMemberMenuState(null)
                        }}
                      >
                        <Pencil className="h-4 w-4 shrink-0" />
                        <span>Change role</span>
                      </button>
                      <div className="my-1 border-t border-border/70" />
                      <button
                        type="button"
                        className="flex w-full items-center gap-2 whitespace-nowrap rounded px-2 py-1.5 text-left text-sm hover:bg-[hsl(var(--tone-accent-100))] hover:text-[hsl(var(--tone-accent-900))]"
                        onClick={() => {
                          onToggleCollaboratorRemoved(workspaceMemberMenuWorkspace, workspaceMemberMenuChip, {
                            skipRemoveConfirmation: true,
                          })
                          setWorkspaceMemberMenuState(null)
                        }}
                      >
                        <UserMinus className="h-4 w-4 shrink-0" />
                        <span>Remove team member</span>
                      </button>
                    </>
                  )
                ) : null}
              </div>
            </div>,
            document.body,
          )
        : null}

      {menuState && menuWorkspace
        ? createPortal(
            <div className="fixed inset-0 z-50" data-ui="workspace-menu-overlay" onClick={() => setMenuState(null)}>
              <div
                data-workspace-menu="true"
                data-ui="workspace-menu-shell"
                className="fixed w-60 rounded-md border border-border bg-card p-1 shadow-lg"
                style={{ left: menuState.x, top: menuState.y }}
                onClick={(event) => event.stopPropagation()}
              >
                <button
                  type="button"
                  data-house-role="workspace-menu-item-open"
                  className={cn(
                    'flex w-full items-center gap-2 whitespace-nowrap rounded px-2 py-1.5 text-left text-sm hover:bg-[hsl(var(--tone-accent-100))] hover:text-[hsl(var(--tone-accent-900))]',
                    !menuWorkspaceCanOpen && 'cursor-not-allowed text-muted-foreground hover:bg-transparent',
                  )}
                  onClick={() => {
                    if (!menuWorkspaceCanOpen) {
                      return
                    }
                    onOpenWorkspace(menuWorkspace.id)
                    setMenuState(null)
                  }}
                  disabled={!menuWorkspaceCanOpen}
                >
                  <ArrowRight className="h-4 w-4 shrink-0" />
                  <span>Open workspace</span>
                </button>
                {(menuWorkspaceCanRename || menuWorkspaceCanPin || menuWorkspaceCanArchive || menuWorkspaceCanLock) ? (
                  <div className="my-1 border-t border-border/70" />
                ) : null}
                {menuWorkspaceCanRename ? (
                  <button
                    type="button"
                    data-house-role="workspace-menu-item-rename"
                    className="flex w-full items-center gap-2 whitespace-nowrap rounded px-2 py-1.5 text-left text-sm hover:bg-[hsl(var(--tone-accent-100))] hover:text-[hsl(var(--tone-accent-900))]"
                    onClick={() => {
                      onStartRenameWorkspace(menuWorkspace)
                    }}
                  >
                    <Pencil className="h-4 w-4 shrink-0" />
                    <span>Rename</span>
                  </button>
                ) : null}
                {menuWorkspaceCanPin ? (
                  <button
                    type="button"
                    data-house-role="workspace-menu-item-pin"
                    className="flex w-full items-center gap-2 whitespace-nowrap rounded px-2 py-1.5 text-left text-sm hover:bg-[hsl(var(--tone-accent-100))] hover:text-[hsl(var(--tone-accent-900))]"
                    onClick={() => {
                      onTogglePinned(menuWorkspace)
                      setMenuState(null)
                    }}
                  >
                    <Pin className="h-4 w-4 shrink-0" />
                    <span>{menuWorkspace.pinned ? 'Unpin' : 'Pin'}</span>
                  </button>
                ) : null}
                {menuWorkspaceCanArchive ? (
                  <button
                    type="button"
                    data-house-role="workspace-menu-item-archive"
                    className="flex w-full items-center gap-2 whitespace-nowrap rounded px-2 py-1.5 text-left text-sm hover:bg-[hsl(var(--tone-accent-100))] hover:text-[hsl(var(--tone-accent-900))]"
                    onClick={() => {
                      onArchiveToggle(menuWorkspace)
                    }}
                  >
                    {menuWorkspace.archived ? (
                      <RotateCcw className="h-4 w-4 shrink-0" />
                    ) : (
                      <Archive className="h-4 w-4 shrink-0" />
                    )}
                    <span>{workspaceArchiveActionLabel(menuWorkspace, workspaceCurrentUserId)}</span>
                  </button>
                ) : null}
                {menuWorkspaceCanLock ? (
                  <button
                    type="button"
                    data-house-role="workspace-menu-item-lock"
                    className="flex w-full items-center gap-2 whitespace-nowrap rounded px-2 py-1.5 text-left text-sm hover:bg-[hsl(var(--tone-accent-100))] hover:text-[hsl(var(--tone-accent-900))]"
                    onClick={() => {
                      onLockToggle(menuWorkspace)
                    }}
                  >
                    {menuWorkspace.ownerArchived ? (
                      <LockOpen className="h-4 w-4 shrink-0" />
                    ) : (
                      <Lock className="h-4 w-4 shrink-0" />
                    )}
                    <span>{workspaceLockActionLabel(menuWorkspace, workspaceCurrentUserId)}</span>
                  </button>
                ) : null}
              </div>
            </div>,
            document.body,
          )
        : null}
    </div>
  )
}

