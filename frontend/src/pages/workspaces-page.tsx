import { useEffect, useMemo, useState, type MouseEvent as ReactMouseEvent } from 'react'
import { createPortal } from 'react-dom'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { ChevronDown, ChevronUp, ChevronsUpDown, PanelRightClose, PanelRightOpen, Pin, Save, X } from 'lucide-react'

import { TopBar } from '@/components/layout/top-bar'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Sheet, SheetContent } from '@/components/ui/sheet'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import { getAuthSessionToken } from '@/lib/auth-session'
import { listCollaborators } from '@/lib/impact-api'
import { WorkspacesDataLibraryView } from '@/pages/workspaces-data-library-view'
import {
  WORKSPACE_OWNER_REQUIRED_MESSAGE,
  readWorkspaceOwnerNameFromProfile,
} from '@/lib/workspace-owner'
import { houseActions, houseCollaborators, houseDrilldown, houseForms, houseLayout, houseNavigation, houseSurfaces, houseTables, houseTypography } from '@/lib/house-style'
import { getHouseLeftBorderToneClass, getHouseNavToneClass } from '@/lib/section-tone'
import { matchesScopedStorageEventKey } from '@/lib/user-scoped-storage'
import { cn } from '@/lib/utils'
import { useAaweStore } from '@/store/use-aawe-store'
import {
  INBOX_MESSAGES_STORAGE_KEY,
  INBOX_READS_STORAGE_KEY,
  useWorkspaceInboxStore,
} from '@/store/use-workspace-inbox-store'
import type { CollaboratorPayload } from '@/types/impact'
import {
  useWorkspaceStore,
  type WorkspaceCollaboratorRole,
  type WorkspaceRecord,
} from '@/store/use-workspace-store'

type ViewMode = 'table' | 'cards'
type CenterView = 'workspaces' | 'invitations' | 'data-library'
type FilterKey = 'all' | 'active' | 'pinned' | 'archived' | 'recent'
type SortColumn = 'name' | 'stage' | 'updatedAt' | 'status'
type SortDirection = 'asc' | 'desc'

type CollaboratorCandidate = {
  key: string
  name: string
  subtitle: string
  source: 'directory' | 'local'
}

type CollaboratorChipState = 'active' | 'removed' | 'pending'

type CollaboratorChipEntry = {
  key: string
  name: string
  state: CollaboratorChipState
  role: WorkspaceCollaboratorRole
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

const HOUSE_PAGE_TITLE_CLASS = houseTypography.title
const HOUSE_SECTION_TITLE_CLASS = houseTypography.sectionTitle
const HOUSE_SECTION_SUBTITLE_CLASS = houseTypography.sectionSubtitle
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
const HOUSE_SELECT_CLASS = houseForms.select
const HOUSE_ACTION_BUTTON_CLASS = houseForms.actionButton
const HOUSE_PRIMARY_ACTION_BUTTON_CLASS = houseForms.actionButtonPrimary
const HOUSE_SUCCESS_ACTION_BUTTON_CLASS = houseForms.actionButtonSuccess
const HOUSE_DANGER_ACTION_BUTTON_CLASS = houseForms.actionButtonDanger
const HOUSE_COLLABORATOR_LIST_SHELL_CLASS = houseCollaborators.listShell
const HOUSE_COLLABORATOR_LIST_VIEWPORT_CLASS = houseCollaborators.listViewport
const HOUSE_COLLABORATOR_LIST_BODY_CLASS = houseCollaborators.listBody
const HOUSE_COLLABORATOR_CANDIDATE_CLASS = houseCollaborators.candidate
const HOUSE_COLLABORATOR_CANDIDATE_SELECTED_CLASS = houseCollaborators.candidateSelected
const HOUSE_COLLABORATOR_CANDIDATE_IDLE_CLASS = houseCollaborators.candidateIdle
const HOUSE_COLLABORATOR_CANDIDATE_META_CLASS = houseCollaborators.candidateMeta
const HOUSE_COLLABORATOR_CANDIDATE_SOURCE_CLASS = houseCollaborators.candidateSource
const HOUSE_COLLABORATOR_CHIP_CLASS = houseCollaborators.chip
const HOUSE_COLLABORATOR_CHIP_ACTIVE_CLASS = houseCollaborators.chipActive
const HOUSE_COLLABORATOR_CHIP_PENDING_CLASS = houseCollaborators.chipPending
const HOUSE_COLLABORATOR_CHIP_REMOVED_CLASS = houseCollaborators.chipRemoved
const HOUSE_COLLABORATOR_CHIP_MANAGEABLE_CLASS = houseCollaborators.chipManageable
const HOUSE_COLLABORATOR_CHIP_READONLY_CLASS = houseCollaborators.chipReadOnly
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
const HOUSE_DRILLDOWN_ACTION_CLASS = houseDrilldown.action
const HOUSE_DRILLDOWN_SECTION_LABEL_CLASS = houseDrilldown.sectionLabel
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
  'h-9 rounded-md px-2',
  HOUSE_SELECT_CLASS,
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

function isWorkspaceOwner(workspace: WorkspaceRecord, currentUserName: string | null): boolean {
  const cleanCurrentUser = normalizeCollaboratorName(currentUserName).toLowerCase()
  if (!cleanCurrentUser) {
    return false
  }
  return normalizeCollaboratorName(workspace.ownerName).toLowerCase() === cleanCurrentUser
}

function workspaceOwnerLabel(workspace: WorkspaceRecord, currentUserName: string | null): string {
  if (isWorkspaceOwner(workspace, currentUserName)) {
    return 'You'
  }
  return normalizeCollaboratorName(workspace.ownerName) || 'Unknown'
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

  return chips
}

function buildCollaboratorCandidates(input: {
  query: string
  localNames: string[]
  directoryItems: CollaboratorPayload[]
}): CollaboratorCandidate[] {
  const query = normalizeCollaboratorName(input.query).toLowerCase()
  const output: CollaboratorCandidate[] = []
  const seen = new Set<string>()

  for (const item of input.directoryItems) {
    const name = normalizeCollaboratorName(item.full_name)
    if (!name) {
      continue
    }
    const key = name.toLowerCase()
    if (seen.has(key)) {
      continue
    }
    seen.add(key)
    const subtitleParts = [item.email || '', item.primary_institution || ''].filter(Boolean)
    output.push({
      key: `directory-${item.id}`,
      name,
      subtitle: subtitleParts.join(' | ') || 'Directory match',
      source: 'directory',
    })
  }

  for (const rawName of input.localNames) {
    const name = normalizeCollaboratorName(rawName)
    if (!name) {
      continue
    }
    const key = name.toLowerCase()
    if (seen.has(key)) {
      continue
    }
    if (query && !key.includes(query)) {
      continue
    }
    seen.add(key)
    output.push({
      key: `local-${key}`,
      name,
      subtitle: 'Known in your workspace network',
      source: 'local',
    })
  }

  return output.slice(0, 40)
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
  collaboratorChips,
  canManageSelectedWorkspace,
  collaboratorComposerOpen,
  collaboratorInviteRole,
  collaboratorQuery,
  collaboratorLookupLoading,
  collaboratorLookupError,
  collaboratorCandidates,
  collaboratorTargetName,
  canConfirmAddCollaborator,
  onOpenCollaboratorComposer,
  onCollaboratorInviteRoleChange,
  onChangeCollaboratorRole,
  onCollaboratorQueryChange,
  onSelectCollaboratorCandidate,
  onConfirmAddCollaborator,
  onOpenSelectedWorkspace,
}: {
  selectedWorkspaceId: string | null
  selectedWorkspaceName: string | null
  selectedWorkspace: WorkspaceRecord | null
  collaboratorChips: CollaboratorChipEntry[]
  canManageSelectedWorkspace: boolean
  collaboratorComposerOpen: boolean
  collaboratorInviteRole: WorkspaceCollaboratorRole
  collaboratorQuery: string
  collaboratorLookupLoading: boolean
  collaboratorLookupError: string
  collaboratorCandidates: CollaboratorCandidate[]
  collaboratorTargetName: string
  canConfirmAddCollaborator: boolean
  onOpenCollaboratorComposer: () => void
  onCollaboratorInviteRoleChange: (role: WorkspaceCollaboratorRole) => void
  onChangeCollaboratorRole: (
    name: string,
    state: CollaboratorChipState,
    role: WorkspaceCollaboratorRole,
  ) => void
  onCollaboratorQueryChange: (value: string) => void
  onSelectCollaboratorCandidate: (name: string) => void
  onConfirmAddCollaborator: () => void
  onOpenSelectedWorkspace: (workspaceId: string) => void
}) {
  const selectedLabel = selectedWorkspaceName?.trim() || ''
  const canOpenSelectedWorkspace = Boolean(selectedWorkspaceId && selectedLabel)
  return (
    <div className={HOUSE_DRILLDOWN_SHEET_BODY_CLASS}>
      <div className={HOUSE_LEFT_BORDER_CLASS}>
        <h2 className={HOUSE_SECTION_TITLE_CLASS}>Manage workspace</h2>
      </div>
      <p className={cn(HOUSE_DRILLDOWN_SECTION_LABEL_CLASS, 'mt-1 pl-3')}>Workspace data</p>
      <div className="w-full">
        <Button
          type="button"
          variant="housePrimary"
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
            {canOpenSelectedWorkspace ? `Open ${selectedLabel} Workspace` : 'Select workspace'}
          </span>
        </Button>
      </div>

      <div className="space-y-2">
        <p className={cn(HOUSE_DRILLDOWN_SECTION_LABEL_CLASS, 'pl-3')}>Collaborator</p>
        <div className="min-h-6">
          {selectedWorkspace ? (
            <div className="space-y-1.5">
              {collaboratorChips.map((chip) => (
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
                    {chip.name}
                  </span>
                  {canManageSelectedWorkspace ? (
                    <select
                      value={chip.role}
                      onChange={(event) => {
                        const nextRole = normalizeCollaboratorRoleValue(event.target.value)
                        if (!nextRole) {
                          return
                        }
                        onChangeCollaboratorRole(chip.name, chip.state, nextRole)
                      }}
                      className={cn('h-8 min-w-sz-110 rounded-md px-2 text-xs', HOUSE_SELECT_CLASS)}
                    >
                      {COLLABORATOR_ROLE_OPTIONS.map((option) => (
                        <option key={option.value} value={option.value}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                  ) : (
                    <span className={HOUSE_FIELD_HELPER_CLASS}>{collaboratorRoleLabel(chip.role)}</span>
                  )}
                </div>
              ))}
            </div>
          ) : null}
        </div>
        {!selectedWorkspace ? (
          <p className={HOUSE_FIELD_HELPER_CLASS}>Select a workspace to manage collaborators.</p>
        ) : !canManageSelectedWorkspace ? (
          <p className={HOUSE_FIELD_HELPER_CLASS}>Only the workspace owner can add collaborators.</p>
        ) : (
          <div className="space-y-2">
            <div className="flex justify-end">
              <Button
                type="button"
                className={cn(HOUSE_ACTION_BUTTON_CLASS, HOUSE_BUTTON_TEXT_CLASS)}
                onClick={onOpenCollaboratorComposer}
              >
                Add collaborator
              </Button>
            </div>

            {collaboratorComposerOpen ? (
              <>
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <p className={HOUSE_FIELD_HELPER_CLASS}>Role</p>
                    <select
                      value={collaboratorInviteRole}
                      onChange={(event) => {
                        const nextRole = normalizeCollaboratorRoleValue(event.target.value)
                        if (!nextRole) {
                          return
                        }
                        onCollaboratorInviteRoleChange(nextRole)
                      }}
                      className={cn('h-8 min-w-sz-120 rounded-md px-2 text-xs', HOUSE_SELECT_CLASS)}
                    >
                      {COLLABORATOR_ROLE_OPTIONS.map((option) => (
                        <option key={option.value} value={option.value}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                  </div>
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
                  <p className={HOUSE_FIELD_HELPER_CLASS}>Type at least 2 characters to search by name.</p>
                </div>

                {collaboratorLookupLoading ? (
                  <p className={HOUSE_FIELD_HELPER_CLASS}>Searching collaborator directory...</p>
                ) : null}
                {collaboratorLookupError ? (
                  <p className="text-sm text-amber-700">{collaboratorLookupError}</p>
                ) : null}

                <div className={HOUSE_COLLABORATOR_LIST_SHELL_CLASS}>
                  <ScrollArea className={HOUSE_COLLABORATOR_LIST_VIEWPORT_CLASS}>
                    <div className={HOUSE_COLLABORATOR_LIST_BODY_CLASS}>
                      {collaboratorCandidates.length === 0 ? (
                        <p className={cn('px-2 py-1', HOUSE_FIELD_HELPER_CLASS)}>No matches yet.</p>
                      ) : (
                        collaboratorCandidates.map((candidate) => {
                          const isSelected =
                            normalizeCollaboratorName(candidate.name).toLowerCase() ===
                            normalizeCollaboratorName(collaboratorTargetName).toLowerCase()
                          return (
                            <button
                              key={candidate.key}
                              type="button"
                              onClick={() => onSelectCollaboratorCandidate(candidate.name)}
                              className={cn(
                                HOUSE_COLLABORATOR_CANDIDATE_CLASS,
                                isSelected
                                  ? HOUSE_COLLABORATOR_CANDIDATE_SELECTED_CLASS
                                  : HOUSE_COLLABORATOR_CANDIDATE_IDLE_CLASS,
                              )}
                            >
                              <p className={houseTypography.text}>{candidate.name}</p>
                              <div className={HOUSE_COLLABORATOR_CANDIDATE_META_CLASS}>
                                <p className={houseTypography.fieldHelper}>{candidate.subtitle}</p>
                                <span className={HOUSE_COLLABORATOR_CANDIDATE_SOURCE_CLASS}>
                                  {candidate.source === 'directory' ? 'Directory' : 'Workspace network'}
                                </span>
                              </div>
                            </button>
                          )
                        })
                      )}
                    </div>
                  </ScrollArea>
                </div>

                {collaboratorTargetName ? (
                  <p className={HOUSE_FIELD_HELPER_CLASS}>Selected: {collaboratorTargetName}</p>
                ) : null}

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
  onToggleMenu,
}: {
  menuOpen: boolean
  onToggleMenu: (event: ReactMouseEvent<HTMLButtonElement>) => void
}) {
  return (
    <button
      type="button"
      data-workspace-menu="true"
      onClick={onToggleMenu}
      className={cn(
        'inline-flex items-center justify-center rounded-md border border-border bg-background text-sm leading-none text-muted-foreground hover:text-foreground',
        WORKSPACE_ICON_BUTTON_DIMENSION_CLASS,
        menuOpen && 'border-emerald-400 text-foreground',
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
          <h1 data-house-role="section-title" className={HOUSE_SECTION_TITLE_CLASS}>Workspaces home</h1>
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
                <span className={HOUSE_NAV_ITEM_LABEL_CLASS}>Workspaces</span>
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
  const chips = workspaceCollaboratorChips(workspace)
  const ownerName = normalizeCollaboratorName(workspace.ownerName) || 'The workspace owner'
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <TooltipProvider delayDuration={120}>
        {chips.map((chip) => {
          const isRemoved = chip.state === 'removed'
          const isPending = chip.state === 'pending'
          const canToggleRemoved = canManage && !isPending
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
                  ? isPending
                    ? `Invitation pending (${collaboratorRoleLabel(chip.role)})`
                    : isRemoved
                    ? 'Click to restore collaborator'
                    : 'Click to remove collaborator'
                  : undefined
              }
              className={cn(
                HOUSE_COLLABORATOR_CHIP_CLASS,
                isPending
                  ? HOUSE_COLLABORATOR_CHIP_PENDING_CLASS
                  : isRemoved
                    ? HOUSE_COLLABORATOR_CHIP_REMOVED_CLASS
                    : HOUSE_COLLABORATOR_CHIP_ACTIVE_CLASS,
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

          const tooltipMessage = isPending
            ? `${ownerName} manages collaborators. ${chip.name} is pending ${collaboratorRoleLabel(chip.role)} access.`
            : isRemoved
              ? `${ownerName} manages collaborators. ${chip.name} is marked removed (${collaboratorRoleLabel(chip.role)}), and only the owner can restore access.`
              : `${ownerName} manages collaborators. ${chip.name} is ${collaboratorRoleLabel(chip.role)} and only the owner can edit this list.`

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
  const [selectedCollaboratorName, setSelectedCollaboratorName] = useState('')
  const [collaboratorComposerOpen, setCollaboratorComposerOpen] = useState(false)
  const [collaboratorInviteRole, setCollaboratorInviteRole] = useState<WorkspaceCollaboratorRole>('editor')
  const [directoryCollaborators, setDirectoryCollaborators] = useState<CollaboratorPayload[]>([])
  const [collaboratorLookupLoading, setCollaboratorLookupLoading] = useState(false)
  const [collaboratorLookupError, setCollaboratorLookupError] = useState('')
  const [renamingWorkspaceId, setRenamingWorkspaceId] = useState<string | null>(null)
  const [renameDraft, setRenameDraft] = useState('')
  const [workspaceOwnerName, setWorkspaceOwnerName] = useState<string | null>(() =>
    readWorkspaceOwnerNameFromProfile(),
  )
  const currentReaderName = useMemo(
    () => (readWorkspaceOwnerNameFromProfile() || workspaceOwnerName || 'You').trim() || 'You',
    [workspaceOwnerName],
  )

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
    () =>
      (activeWorkspaceId ? workspaces.find((workspace) => workspace.id === activeWorkspaceId) : null) ||
      workspaces[0] ||
      null,
    [activeWorkspaceId, workspaces],
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
  const localCandidateNames = useMemo(() => {
    const seen = new Set<string>()
    const output: string[] = []
    const pushName = (value: string) => {
      const clean = normalizeCollaboratorName(value)
      if (!clean) {
        return
      }
      const key = clean.toLowerCase()
      if (seen.has(key)) {
        return
      }
      seen.add(key)
      output.push(clean)
    }
    for (const workspace of workspaces) {
      pushName(workspace.ownerName)
      workspace.collaborators.forEach(pushName)
      for (const pendingCollaborator of workspace.pendingCollaborators || []) {
        pushName(pendingCollaborator)
      }
    }
    authorRequests.forEach((request) => pushName(request.authorName))
    invitationsSent.forEach((invitation) => pushName(invitation.inviteeName))
    return output.sort((left, right) => left.localeCompare(right))
  }, [authorRequests, invitationsSent, workspaces])
  const collaboratorCandidates = useMemo(
    () =>
      buildCollaboratorCandidates({
        query: collaboratorQuery,
        localNames: localCandidateNames,
        directoryItems: directoryCollaborators,
      }),
    [collaboratorQuery, directoryCollaborators, localCandidateNames],
  )
  const collaboratorTargetName = normalizeCollaboratorName(selectedCollaboratorName || collaboratorQuery)
  const canManageSelectedWorkspace = Boolean(
    workspaceDrilldownSelection && isWorkspaceOwner(workspaceDrilldownSelection, workspaceOwnerName),
  )
  const canConfirmAddCollaborator = Boolean(
    canManageSelectedWorkspace && collaboratorComposerOpen && collaboratorTargetName,
  )
  const collaboratorLookupEnabled = Boolean(
    centerView === 'workspaces' &&
    workspaceDrilldownSelection &&
    canManageSelectedWorkspace &&
    collaboratorComposerOpen &&
    (workspaceDrilldownDesktopOpen || workspaceDrilldownMobileOpen),
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
      setSelectedCollaboratorName('')
      setCollaboratorComposerOpen(false)
      setDirectoryCollaborators([])
      setCollaboratorLookupLoading(false)
      setCollaboratorLookupError('')
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

  useEffect(() => {
    if (!collaboratorLookupEnabled) {
      setDirectoryCollaborators([])
      setCollaboratorLookupLoading(false)
      setCollaboratorLookupError('')
      return
    }

    const cleanQuery = normalizeCollaboratorName(collaboratorQuery)
    if (cleanQuery.length < 2) {
      setDirectoryCollaborators([])
      setCollaboratorLookupLoading(false)
      setCollaboratorLookupError('')
      return
    }

    const token = getAuthSessionToken()
    if (!token) {
      setDirectoryCollaborators([])
      setCollaboratorLookupLoading(false)
      setCollaboratorLookupError('Sign in to search the full collaborator directory. Showing workspace-network matches only.')
      return
    }

    let cancelled = false
    setCollaboratorLookupLoading(true)
    const timer = window.setTimeout(() => {
      void listCollaborators(token, {
        query: cleanQuery,
        page: 1,
        pageSize: 30,
      })
        .then((payload) => {
          if (cancelled) {
            return
          }
          setDirectoryCollaborators(payload.items)
          setCollaboratorLookupError('')
        })
        .catch(() => {
          if (cancelled) {
            return
          }
          setDirectoryCollaborators([])
          setCollaboratorLookupError('Directory lookup unavailable. Showing workspace-network suggestions only.')
        })
        .finally(() => {
          if (!cancelled) {
            setCollaboratorLookupLoading(false)
          }
        })
    }, 250)

    return () => {
      cancelled = true
      window.clearTimeout(timer)
    }
  }, [collaboratorLookupEnabled, collaboratorQuery])

  const canCreateWorkspace = Boolean(workspaceOwnerName)

  const resetCollaboratorComposer = () => {
    setCollaboratorQuery('')
    setSelectedCollaboratorName('')
    setCollaboratorComposerOpen(false)
    setCollaboratorInviteRole('editor')
    setDirectoryCollaborators([])
    setCollaboratorLookupLoading(false)
    setCollaboratorLookupError('')
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
          `${matchedPendingName} remains pending. Role updated to ${collaboratorRoleLabel(collaboratorInviteRole)}.`,
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
    resetCollaboratorComposer()
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
      updateWorkspace(workspaceDrilldownSelection.id, {
        pendingCollaboratorRoles: {
          ...(workspaceDrilldownSelection.pendingCollaboratorRoles || {}),
          [matchedPendingName]: role,
        },
        updatedAt: new Date().toISOString(),
      })
      setInvitationStatus(`${matchedPendingName} role set to ${collaboratorRoleLabel(role)}.`)
      return
    }

    const matchedActiveName =
      workspaceDrilldownSelection.collaborators.find(
        (value) => normalizeCollaboratorName(value).toLowerCase() === collaboratorKey,
      ) || collaboratorName
    updateWorkspace(workspaceDrilldownSelection.id, {
      collaboratorRoles: {
        ...(workspaceDrilldownSelection.collaboratorRoles || {}),
        [matchedActiveName]: role,
      },
      updatedAt: new Date().toISOString(),
    })
    setInvitationStatus(`${matchedActiveName} role set to ${collaboratorRoleLabel(role)}.`)
  }

  const onToggleCollaboratorRemoved = (workspace: WorkspaceRecord, collaboratorName: string) => {
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
      const restoreConfirmed = window.confirm(
        `Restore collaborator "${collaboratorName}" in "${workspace.name}"?`,
      )
      if (!restoreConfirmed) {
        return
      }
      updateWorkspace(workspace.id, {
        removedCollaborators: (workspace.removedCollaborators || []).filter(
          (value) => normalizeCollaboratorName(value).toLowerCase() !== collaboratorKey,
        ),
        updatedAt: new Date().toISOString(),
      })
      setInvitationStatus(`${collaboratorName} restored.`)
      return
    }

    const removeConfirmed = window.confirm(
      `Remove collaborator "${collaboratorName}" from "${workspace.name}"?`,
    )
    if (!removeConfirmed) {
      return
    }
    updateWorkspace(workspace.id, {
      removedCollaborators: [...(workspace.removedCollaborators || []), collaboratorName],
      updatedAt: new Date().toISOString(),
    })
    setInvitationStatus(`${collaboratorName} removed. Name retained in red banner.`)
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
  const canInviteFromMenu = Boolean(
    menuWorkspace &&
    workspaceOwnerName &&
    menuWorkspace.ownerName.toLowerCase() === workspaceOwnerName.toLowerCase(),
  )

  return (
    <div className="flex h-screen flex-col bg-background text-foreground">
      <TopBar scope="workspace" onOpenLeftNav={() => setLeftPanelOpen(true)} />

      <div
        className={cn(
          'grid min-h-0 flex-1 grid-cols-1 nav:grid-cols-[280px_minmax(0,1fr)]',
          centerView === 'workspaces' &&
            (workspaceDrilldownDesktopOpen
              ? 'xl:grid-cols-[280px_minmax(0,1fr)_22rem]'
              : 'xl:grid-cols-[280px_minmax(0,1fr)_3rem]'),
          centerView === 'data-library' &&
            (dataLibraryDrilldownDesktopOpen
              ? 'xl:grid-cols-[280px_minmax(0,1fr)_22rem]'
              : 'xl:grid-cols-[280px_minmax(0,1fr)_3rem]'),
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
            <div className="mx-auto w-full max-w-sz-1380 space-y-4 px-4 py-4 md:px-6">
              <section className={cn('rounded-lg border border-border p-4', HOUSE_CARD_CLASS)}>
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className={cn(HOUSE_PAGE_HEADER_CLASS, HOUSE_LEFT_BORDER_CLASS)}>
                    <h1 data-house-role="page-title" className={HOUSE_PAGE_TITLE_CLASS}>Workspaces</h1>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <Input
                      value={newWorkspaceName}
                      onChange={(event) => setNewWorkspaceName(event.target.value)}
                      placeholder="New workspace name"
                      className={cn('w-sz-220', HOUSE_INPUT_CLASS)}
                    />
                    <Button
                      type="button"
                      onClick={onCreateWorkspace}
                      disabled={!canCreateWorkspace}
                      className={cn(HOUSE_PRIMARY_ACTION_BUTTON_CLASS, HOUSE_BUTTON_TEXT_CLASS)}
                    >
                      Create workspace
                    </Button>
                  </div>
                </div>
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
                    <select
                      value={filterKey}
                      onChange={(event) => setFilterKey(event.target.value as FilterKey)}
                      className={HOUSE_WORKSPACE_FILTER_SELECT_CLASS}
                    >
                      {FILTER_OPTIONS.map((option) => (
                        <option key={option.key} value={option.key}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                    {viewMode === 'cards' ? (
                      <select
                        value={sortColumn}
                        onChange={(event) => onSort(event.target.value as SortColumn)}
                        className={HOUSE_WORKSPACE_FILTER_SELECT_CLASS}
                      >
                        <option value="updatedAt">Sort: Updated</option>
                        <option value="name">Sort: Name</option>
                        <option value="stage">Sort: Stage</option>
                        <option value="status">Sort: Status</option>
                      </select>
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
                          return (
                            <tr
                              key={workspace.id}
                              className={cn('cursor-pointer', HOUSE_TABLE_ROW_CLASS)}
                              onClick={() => onSelectWorkspace(workspace.id)}
                              onDoubleClick={() => onOpenWorkspace(workspace.id)}
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
                                    onOpenWorkspaceInboxForWorkspace(workspace.id, signal.unreadCount > 0)
                                  }}
                                  aria-label={`Open inbox for ${workspace.name}. ${signal.unreadCount} unread message${signal.unreadCount === 1 ? '' : 's'}.`}
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
                      return (
                        <button
                          key={workspace.id}
                          type="button"
                          onClick={() => onSelectWorkspace(workspace.id)}
                          onDoubleClick={() => onOpenWorkspace(workspace.id)}
                          className="rounded-lg border border-border bg-background p-3 text-left hover:bg-accent/30"
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
                                <p className="mt-1 text-xs text-muted-foreground">{ownerLabel === 'You' ? 'You' : `Owner ${ownerLabel}`}</p>
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
                              onOpenWorkspaceInboxForWorkspace(workspace.id, signal.unreadCount > 0)
                            }}
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
                              onOpenWorkspaceInboxForWorkspace(workspace.id, signal.unreadCount > 0)
                            }}
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
                    <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-4 py-3">
                      <div>
                        <h2 className={HOUSE_SECTION_TITLE_CLASS}>Invitations</h2>
                        <p className={HOUSE_SECTION_SUBTITLE_CLASS}>
                          Review incoming collaboration requests and outgoing invitations.
                        </p>
                      </div>
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="inline-flex items-center gap-1 rounded border border-border bg-background px-2 py-1 text-xs text-muted-foreground">
                          <span className="inline-block h-2 w-2 rounded-full bg-emerald-500" />
                          Incoming {incomingInvitationCount}
                        </span>
                        <span className="inline-flex items-center gap-1 rounded border border-border bg-background px-2 py-1 text-xs text-muted-foreground">
                          <span className="inline-block h-2 w-2 rounded-full bg-red-500" />
                          Outgoing {outgoingInvitationCount}
                        </span>
                      </div>
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
                                    <span className="text-xs text-muted-foreground">Sent</span>
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
                    collaboratorChips={selectedWorkspaceCollaboratorChips}
                    canManageSelectedWorkspace={canManageSelectedWorkspace}
                    collaboratorComposerOpen={collaboratorComposerOpen}
                    collaboratorInviteRole={collaboratorInviteRole}
                    collaboratorQuery={collaboratorQuery}
                    collaboratorLookupLoading={collaboratorLookupLoading}
                    collaboratorLookupError={collaboratorLookupError}
                    collaboratorCandidates={collaboratorCandidates}
                    collaboratorTargetName={collaboratorTargetName}
                    canConfirmAddCollaborator={canConfirmAddCollaborator}
                    onOpenCollaboratorComposer={() => {
                      setCollaboratorComposerOpen(true)
                      setCollaboratorLookupError('')
                    }}
                    onCollaboratorInviteRoleChange={(role) => {
                      setCollaboratorInviteRole(role)
                    }}
                    onChangeCollaboratorRole={onChangeCollaboratorRole}
                    onCollaboratorQueryChange={(value) => {
                      setCollaboratorQuery(value)
                      setSelectedCollaboratorName('')
                      setCollaboratorLookupError('')
                    }}
                    onSelectCollaboratorCandidate={(name) => {
                      setSelectedCollaboratorName(name)
                      setCollaboratorQuery(name)
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
            collaboratorChips={selectedWorkspaceCollaboratorChips}
            canManageSelectedWorkspace={canManageSelectedWorkspace}
            collaboratorComposerOpen={collaboratorComposerOpen}
            collaboratorInviteRole={collaboratorInviteRole}
            collaboratorQuery={collaboratorQuery}
            collaboratorLookupLoading={collaboratorLookupLoading}
            collaboratorLookupError={collaboratorLookupError}
            collaboratorCandidates={collaboratorCandidates}
            collaboratorTargetName={collaboratorTargetName}
            canConfirmAddCollaborator={canConfirmAddCollaborator}
            onOpenCollaboratorComposer={() => {
              setCollaboratorComposerOpen(true)
              setCollaboratorLookupError('')
            }}
            onCollaboratorInviteRoleChange={(role) => {
              setCollaboratorInviteRole(role)
            }}
            onChangeCollaboratorRole={onChangeCollaboratorRole}
            onCollaboratorQueryChange={(value) => {
              setCollaboratorQuery(value)
              setSelectedCollaboratorName('')
              setCollaboratorLookupError('')
            }}
            onSelectCollaboratorCandidate={(name) => {
              setSelectedCollaboratorName(name)
              setCollaboratorQuery(name)
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
        <SheetContent side="left" className="w-sz-290 p-0 nav:hidden">
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
                  className="block w-full rounded px-2 py-1.5 text-left text-sm hover:bg-accent/50"
                  onClick={() => {
                    onOpenWorkspace(menuWorkspace.id)
                    setMenuState(null)
                  }}
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
                  className="block w-full rounded px-2 py-1.5 text-left text-sm hover:bg-accent/50"
                  onClick={() => onStartRenameWorkspace(menuWorkspace)}
                >
                  Rename
                </button>
                <button
                  type="button"
                  data-house-role="workspace-menu-item-pin"
                  className="block w-full rounded px-2 py-1.5 text-left text-sm hover:bg-accent/50"
                  onClick={() => {
                    onTogglePinned(menuWorkspace)
                    setMenuState(null)
                  }}
                >
                  {menuWorkspace.pinned ? 'Unpin' : 'Pin'}
                </button>
                <button
                  type="button"
                  data-house-role="workspace-menu-item-archive"
                  className="block w-full rounded px-2 py-1.5 text-left text-sm hover:bg-accent/50"
                  onClick={() => onArchiveToggle(menuWorkspace)}
                >
                  {menuWorkspace.archived ? 'Restore' : 'Archive'}
                </button>
                <button
                  type="button"
                  data-house-role="workspace-menu-item-delete"
                  className="block w-full rounded px-2 py-1.5 text-left text-sm text-red-700 hover:bg-red-50"
                  onClick={() => onDeleteWorkspace(menuWorkspace)}
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
