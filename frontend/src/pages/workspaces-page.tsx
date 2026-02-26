import { useEffect, useMemo, useState, type MouseEvent as ReactMouseEvent } from 'react'
import { createPortal } from 'react-dom'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { PanelRightClose, PanelRightOpen, Pin } from 'lucide-react'

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
import { houseDrilldown, houseForms, houseLayout, houseNavigation, houseSurfaces, houseTypography } from '@/lib/house-style'
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
const HOUSE_SIDEBAR_CLASS = houseLayout.sidebar
const HOUSE_SIDEBAR_HEADER_CLASS = houseLayout.sidebarHeader
const HOUSE_SIDEBAR_SECTION_CLASS = houseLayout.sidebarSection
const HOUSE_FIELD_HELPER_CLASS = houseTypography.fieldHelper
const HOUSE_BUTTON_TEXT_CLASS = houseTypography.buttonText
const HOUSE_LEFT_BORDER_CLASS = cn(houseSurfaces.leftBorder, getHouseLeftBorderToneClass('workspace'))
const HOUSE_CARD_CLASS = houseSurfaces.card
const HOUSE_TABLE_SHELL_CLASS = houseSurfaces.tableShell
const HOUSE_TABLE_HEAD_CLASS = houseSurfaces.tableHead
const HOUSE_TABLE_ROW_CLASS = houseSurfaces.tableRow
const HOUSE_TABLE_HEAD_TEXT_CLASS = houseTypography.tableHead
const HOUSE_TABLE_CELL_TEXT_CLASS = houseTypography.tableCell
const HOUSE_INPUT_CLASS = houseForms.input
const HOUSE_SELECT_CLASS = houseForms.select
const HOUSE_ACTION_BUTTON_CLASS = houseForms.actionButton
const HOUSE_PRIMARY_ACTION_BUTTON_CLASS = houseForms.actionButtonPrimary
const HOUSE_NAV_SECTION_LABEL_CLASS = houseNavigation.sectionLabel
const HOUSE_NAV_ITEM_CLASS = houseNavigation.item
const HOUSE_NAV_ITEM_ACTIVE_CLASS = houseNavigation.itemActive
const HOUSE_NAV_ITEM_WORKSPACE_CLASS = getHouseNavToneClass('workspace')
const HOUSE_NAV_ITEM_GOVERNANCE_CLASS = getHouseNavToneClass('governance')
const HOUSE_NAV_ITEM_META_CLASS = houseNavigation.itemMeta
const HOUSE_NAV_ITEM_COUNT_CLASS = houseNavigation.itemCount
const HOUSE_DRILLDOWN_SHEET_CLASS = houseDrilldown.sheet
const HOUSE_DRILLDOWN_ACTION_CLASS = houseDrilldown.action
const HOUSE_DRILLDOWN_ROW_CLASS = houseDrilldown.row
const HOUSE_DRILLDOWN_PROGRESS_TRACK_CLASS = houseDrilldown.progressTrack
const HOUSE_DRILLDOWN_PROGRESS_FILL_CLASS = houseDrilldown.progressFill
const HOUSE_DRILLDOWN_STAT_CARD_CLASS = houseDrilldown.statCard
const HOUSE_DRILLDOWN_STAT_TITLE_CLASS = houseDrilldown.statTitle
const HOUSE_DRILLDOWN_STAT_VALUE_CLASS = houseDrilldown.statValue
const HOUSE_DRILLDOWN_HINT_CLASS = houseDrilldown.hint
const HOUSE_DRILLDOWN_MICRO_VALUE_CLASS = houseDrilldown.microValue
const HOUSE_DRILLDOWN_BADGE_CLASS = houseDrilldown.badge
const HOUSE_DRILLDOWN_BADGE_NEUTRAL_CLASS = houseDrilldown.badgeNeutral
const HOUSE_DRILLDOWN_NOTE_SOFT_CLASS = houseDrilldown.noteSoft
const HOUSE_DRILLDOWN_TABLE_ROW_CLASS = houseDrilldown.tableRow

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

function isWorkspaceOwner(workspace: WorkspaceRecord, currentUserName: string | null): boolean {
  const cleanCurrentUser = normalizeCollaboratorName(currentUserName).toLowerCase()
  if (!cleanCurrentUser) {
    return false
  }
  return normalizeCollaboratorName(workspace.ownerName).toLowerCase() === cleanCurrentUser
}

function collaboratorRemovedSet(workspace: WorkspaceRecord): Set<string> {
  return new Set((workspace.removedCollaborators || []).map((value) => normalizeCollaboratorName(value).toLowerCase()))
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
  filteredWorkspaces,
  filterCounts,
  filterKey,
  workspaceInboxSignals,
}: {
  filteredWorkspaces: WorkspaceRecord[]
  filterCounts: Record<FilterKey, number>
  filterKey: FilterKey
  workspaceInboxSignals: Record<string, WorkspaceInboxSignal>
}) {
  const stageBuckets: Array<{ label: string; count: number }> = [
    { label: 'Plan', count: 0 },
    { label: 'Draft', count: 0 },
    { label: 'QC', count: 0 },
    { label: 'Archived', count: 0 },
  ]
  let unreadVisibleCount = 0
  for (const workspace of filteredWorkspaces) {
    const stage = workspaceStage(workspace)
    const bucket = stageBuckets.find((item) => item.label === stage)
    if (bucket) {
      bucket.count += 1
    }
    unreadVisibleCount += workspaceInboxSignals[workspace.id]?.unreadCount || 0
  }
  const stageMax = Math.max(1, ...stageBuckets.map((item) => item.count))
  const activeFilterLabel = FILTER_OPTIONS.find((option) => option.key === filterKey)?.label || 'All'
  const recentWorkspaces = [...filteredWorkspaces]
    .sort((left, right) => {
      const leftValue = Date.parse(workspaceInboxSignals[left.id]?.lastActivityAt || left.updatedAt)
      const rightValue = Date.parse(workspaceInboxSignals[right.id]?.lastActivityAt || right.updatedAt)
      return rightValue - leftValue
    })
    .slice(0, 6)

  return (
    <div className="space-y-3">
      <div className={cn(HOUSE_PAGE_HEADER_CLASS, HOUSE_LEFT_BORDER_CLASS)}>
        <h2 className={HOUSE_SECTION_TITLE_CLASS}>Workspace drilldown</h2>
        <p className={HOUSE_SECTION_SUBTITLE_CLASS}>Filter snapshot and stage distribution.</p>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <div className={HOUSE_DRILLDOWN_STAT_CARD_CLASS}>
          <p className={HOUSE_DRILLDOWN_STAT_TITLE_CLASS}>Visible</p>
          <p className={HOUSE_DRILLDOWN_STAT_VALUE_CLASS}>{filteredWorkspaces.length}</p>
        </div>
        <div className={HOUSE_DRILLDOWN_STAT_CARD_CLASS}>
          <p className={HOUSE_DRILLDOWN_STAT_TITLE_CLASS}>Unread</p>
          <p className={HOUSE_DRILLDOWN_STAT_VALUE_CLASS}>{unreadVisibleCount}</p>
        </div>
        <div className={HOUSE_DRILLDOWN_STAT_CARD_CLASS}>
          <p className={HOUSE_DRILLDOWN_STAT_TITLE_CLASS}>Active</p>
          <p className={HOUSE_DRILLDOWN_STAT_VALUE_CLASS}>{filterCounts.active}</p>
        </div>
        <div className={HOUSE_DRILLDOWN_STAT_CARD_CLASS}>
          <p className={HOUSE_DRILLDOWN_STAT_TITLE_CLASS}>Archived</p>
          <p className={HOUSE_DRILLDOWN_STAT_VALUE_CLASS}>{filterCounts.archived}</p>
        </div>
      </div>

      <div className="space-y-2 rounded-md border border-border/70 bg-background/80 p-3">
        <div className="flex items-center justify-between gap-2">
          <p className="text-micro uppercase text-muted-foreground">Stage mix</p>
          <span className={cn(HOUSE_DRILLDOWN_BADGE_CLASS, HOUSE_DRILLDOWN_BADGE_NEUTRAL_CLASS)}>
            {activeFilterLabel}
          </span>
        </div>
        {stageBuckets.map((bucket) => (
          <div key={bucket.label} className={HOUSE_DRILLDOWN_ROW_CLASS}>
            <div className="mb-1 flex items-center justify-between gap-2">
              <p className={HOUSE_DRILLDOWN_HINT_CLASS}>{bucket.label}</p>
              <p className={HOUSE_DRILLDOWN_MICRO_VALUE_CLASS}>{bucket.count}</p>
            </div>
            <div className={HOUSE_DRILLDOWN_PROGRESS_TRACK_CLASS}>
              <span
                className={HOUSE_DRILLDOWN_PROGRESS_FILL_CLASS}
                style={{ width: `${Math.max(6, (bucket.count / stageMax) * 100)}%` }}
              />
            </div>
          </div>
        ))}
      </div>

      <div className="space-y-2 rounded-md border border-border/70 bg-background/80 p-3">
        <p className="text-micro uppercase text-muted-foreground">Recent activity</p>
        {recentWorkspaces.length === 0 ? (
          <p className={HOUSE_DRILLDOWN_NOTE_SOFT_CLASS}>No workspaces in this filter.</p>
        ) : (
          recentWorkspaces.map((workspace) => {
            const signal = workspaceInboxSignals[workspace.id]
            return (
              <div key={workspace.id} className={cn('space-y-1 rounded-md border border-border/60 px-2 py-1.5', HOUSE_DRILLDOWN_TABLE_ROW_CLASS)}>
                <div className="flex items-center justify-between gap-2">
                  <p className="truncate text-sm font-medium">{workspace.name}</p>
                  <span className={HOUSE_DRILLDOWN_HINT_CLASS}>{signal?.unreadCount || 0} unread</span>
                </div>
                <p className={HOUSE_DRILLDOWN_NOTE_SOFT_CLASS}>
                  Last activity {formatTimestamp(signal?.lastActivityAt || workspace.updatedAt)}
                </p>
              </div>
            )
          })
        )}
      </div>
    </div>
  )
}

function SortableHeader({
  label,
  column,
  activeColumn,
  direction,
  onSort,
}: {
  label: string
  column: SortColumn
  activeColumn: SortColumn
  direction: SortDirection
  onSort: (column: SortColumn) => void
}) {
  const isActive = column === activeColumn
  const icon = isActive ? (direction === 'desc' ? '▼' : '▲') : '▽'
  return (
    <button
      type="button"
      onClick={() => onSort(column)}
      className="inline-flex items-center gap-1 font-medium text-muted-foreground transition-colors hover:text-foreground"
    >
      <span>{label}</span>
      <span className={cn('text-caption', isActive ? 'text-foreground' : 'text-muted-foreground')}>{icon}</span>
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
        'rounded-md border border-border bg-background px-2 py-1 text-sm text-muted-foreground hover:text-foreground',
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
  filterKey,
  counts,
  onFilterChange,
  onOpenInbox,
  incomingInvitationCount,
  outgoingInvitationCount,
  canOpenInbox,
  onNavigate,
}: {
  centerView: CenterView
  onSelectCenterView: (next: CenterView) => void
  filterKey: FilterKey
  counts: Record<FilterKey, number>
  onFilterChange: (next: FilterKey) => void
  onOpenInbox: () => void
  incomingInvitationCount: number
  outgoingInvitationCount: number
  canOpenInbox: boolean
  onNavigate?: () => void
}) {
  const totalInvitationCount = incomingInvitationCount + outgoingInvitationCount
  return (
    <aside className={cn('flex h-full flex-col', HOUSE_SIDEBAR_CLASS)} data-house-role="left-nav-shell">
      <div className={HOUSE_SIDEBAR_HEADER_CLASS}>
        <div className={cn(HOUSE_PAGE_HEADER_CLASS, HOUSE_LEFT_BORDER_CLASS)}>
          <h1 data-house-role="section-title" className={HOUSE_SECTION_TITLE_CLASS}>Workspaces home</h1>
        </div>
      </div>
      <ScrollArea className="flex-1">
        <div className="space-y-4 p-3">
          <section className={HOUSE_SIDEBAR_SECTION_CLASS}>
            <p className={HOUSE_NAV_SECTION_LABEL_CLASS}>
              Views
            </p>
            <div className="space-y-1">
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
                <span className="truncate pl-2">Workspaces</span>
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
                <span className="truncate pl-2">Invitations</span>
                <div className={cn('ml-2 flex items-center gap-1.5', HOUSE_NAV_ITEM_META_CLASS)}>
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
                <span className="truncate pl-2 text-left">Data library</span>
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
                <span className="truncate pl-2 text-left">Inbox</span>
              </button>
            </div>
          </section>

          {centerView === 'workspaces' ? (
            <section className={HOUSE_SIDEBAR_SECTION_CLASS}>
              <p className={HOUSE_NAV_SECTION_LABEL_CLASS}>
                States
              </p>
              <div className="space-y-1">
                {FILTER_OPTIONS.map((option) => (
                  <button
                    key={option.key}
                    type="button"
                    onClick={() => {
                      onFilterChange(option.key)
                      onNavigate?.()
                    }}
                    className={cn(
                      HOUSE_NAV_ITEM_CLASS,
                      HOUSE_NAV_ITEM_GOVERNANCE_CLASS,
                      filterKey === option.key && HOUSE_NAV_ITEM_ACTIVE_CLASS,
                    )}
                  >
                    <span className="truncate pl-2 text-left">{option.label}</span>
                    <span className={cn(HOUSE_NAV_ITEM_COUNT_CLASS, 'ml-2')}>
                      {counts[option.key]}
                    </span>
                  </button>
                ))}
              </div>
            </section>
          ) : null}
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
  const removed = collaboratorRemovedSet(workspace)
  const ownerName = normalizeCollaboratorName(workspace.ownerName) || 'The workspace owner'
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <TooltipProvider delayDuration={120}>
        {workspace.collaborators.map((collaborator) => {
          const isRemoved = removed.has(normalizeCollaboratorName(collaborator).toLowerCase())
          const collaboratorButton = (
            <button
              type="button"
              onClick={(event) => {
                event.stopPropagation()
                if (!canManage) {
                  return
                }
                onToggleRemoved(workspace, collaborator)
              }}
              aria-disabled={!canManage}
              title={
                canManage
                  ? isRemoved
                    ? 'Click to restore collaborator'
                    : 'Click to remove collaborator'
                  : undefined
              }
              className={cn(
                'rounded border px-1.5 py-0.5 text-micro',
                isRemoved
                  ? 'border-red-300 bg-red-50 text-red-700'
                  : 'border-emerald-300 bg-emerald-50 text-emerald-700',
                canManage ? 'cursor-pointer' : 'cursor-not-allowed opacity-70',
              )}
            >
              {collaborator}
            </button>
          )

          if (canManage) {
            return (
              <span key={collaborator} className="contents">
                {collaboratorButton}
              </span>
            )
          }

          const tooltipMessage = isRemoved
            ? `${ownerName} manages collaborators. ${collaborator} is marked removed and only the owner can restore access.`
            : `${ownerName} manages collaborators. You can view participants but only the owner can edit this list.`

          return (
            <Tooltip key={collaborator}>
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
  const [workspaceDrilldownDesktopOpen, setWorkspaceDrilldownDesktopOpen] = useState(true)
  const [workspaceDrilldownMobileOpen, setWorkspaceDrilldownMobileOpen] = useState(false)
  const [newWorkspaceName, setNewWorkspaceName] = useState('')
  const [createError, setCreateError] = useState('')
  const [invitationStatus, setInvitationStatus] = useState('')
  const [menuState, setMenuState] = useState<{
    workspaceId: string
    x: number
    y: number
  } | null>(null)
  const [addCollaboratorSheetOpen, setAddCollaboratorSheetOpen] = useState(false)
  const [addCollaboratorWorkspaceId, setAddCollaboratorWorkspaceId] = useState<string | null>(null)
  const [collaboratorQuery, setCollaboratorQuery] = useState('')
  const [selectedCollaboratorName, setSelectedCollaboratorName] = useState('')
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
  const filterCounts = useMemo<Record<FilterKey, number>>(
    () => ({
      all: workspaces.length,
      active: workspaces.filter((workspace) => !workspace.archived).length,
      pinned: workspaces.filter((workspace) => workspace.pinned).length,
      archived: workspaces.filter((workspace) => workspace.archived).length,
      recent: workspaces.filter((workspace) => isRecentWorkspace(workspace.updatedAt)).length,
    }),
    [workspaces],
  )
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
          invitedAt: request.invitedAt,
          status: 'pending',
        })),
        ...invitationsSent.map((invitation) => ({
          id: invitation.id,
          direction: 'outgoing' as const,
          workspaceName: invitation.workspaceName,
          personName: invitation.inviteeName,
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
  const addCollaboratorWorkspace = useMemo(
    () =>
      addCollaboratorWorkspaceId
        ? workspaces.find((workspace) => workspace.id === addCollaboratorWorkspaceId) || null
        : null,
    [addCollaboratorWorkspaceId, workspaces],
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
  const canManageAddCollaboratorWorkspace = Boolean(
    addCollaboratorWorkspace && isWorkspaceOwner(addCollaboratorWorkspace, workspaceOwnerName),
  )
  const canConfirmAddCollaborator = Boolean(canManageAddCollaboratorWorkspace && collaboratorTargetName)

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
    if (!addCollaboratorWorkspaceId) {
      return
    }
    const exists = workspaces.some((workspace) => workspace.id === addCollaboratorWorkspaceId)
    if (!exists) {
      setAddCollaboratorSheetOpen(false)
      setAddCollaboratorWorkspaceId(null)
      setCollaboratorQuery('')
      setSelectedCollaboratorName('')
      setDirectoryCollaborators([])
      setCollaboratorLookupLoading(false)
      setCollaboratorLookupError('')
    }
  }, [addCollaboratorWorkspaceId, workspaces])

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
    if (!addCollaboratorSheetOpen) {
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
  }, [addCollaboratorSheetOpen, collaboratorQuery])

  const canCreateWorkspace = Boolean(workspaceOwnerName)

  const resetAddCollaboratorSheet = () => {
    setAddCollaboratorSheetOpen(false)
    setAddCollaboratorWorkspaceId(null)
    setCollaboratorQuery('')
    setSelectedCollaboratorName('')
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
    const sent = sendWorkspaceInvitation(workspace.id, invitationTarget)
    if (!sent) {
      setInvitationStatus('Invitation was not sent. Check owner access or duplicate pending invitation.')
      setMenuState(null)
      return
    }
    setInvitationStatus(`Invitation sent to ${sent.inviteeName}.`)
    setMenuState(null)
  }

  const onAddCollaborator = (workspace: WorkspaceRecord) => {
    if (!isWorkspaceOwner(workspace, workspaceOwnerName)) {
      setInvitationStatus('Only the workspace author can add collaborators.')
      return
    }
    setAddCollaboratorWorkspaceId(workspace.id)
    setCollaboratorQuery('')
    setSelectedCollaboratorName('')
    setDirectoryCollaborators([])
    setCollaboratorLookupError('')
    setAddCollaboratorSheetOpen(true)
  }

  const onConfirmAddCollaborator = () => {
    if (!addCollaboratorWorkspace) {
      return
    }
    if (!isWorkspaceOwner(addCollaboratorWorkspace, workspaceOwnerName)) {
      setInvitationStatus('Only the workspace author can add collaborators.')
      resetAddCollaboratorSheet()
      return
    }
    const clean = collaboratorTargetName
    if (!clean) {
      setInvitationStatus('Collaborator name is required.')
      return
    }
    if (normalizeCollaboratorName(addCollaboratorWorkspace.ownerName).toLowerCase() === clean.toLowerCase()) {
      setInvitationStatus('The workspace author is already included.')
      return
    }

    const existing = addCollaboratorWorkspace.collaborators.find(
      (collaborator) => normalizeCollaboratorName(collaborator).toLowerCase() === clean.toLowerCase(),
    )
    if (existing) {
      const removed = collaboratorRemovedSet(addCollaboratorWorkspace)
      if (removed.has(normalizeCollaboratorName(existing).toLowerCase())) {
        updateWorkspace(addCollaboratorWorkspace.id, {
          removedCollaborators: (addCollaboratorWorkspace.removedCollaborators || []).filter(
            (value) => normalizeCollaboratorName(value).toLowerCase() !== normalizeCollaboratorName(existing).toLowerCase(),
          ),
          updatedAt: new Date().toISOString(),
        })
        setInvitationStatus(`${existing} restored as collaborator.`)
        resetAddCollaboratorSheet()
        return
      }
      setInvitationStatus(`${existing} is already a collaborator.`)
      return
    }

    updateWorkspace(addCollaboratorWorkspace.id, {
      collaborators: [...addCollaboratorWorkspace.collaborators, clean],
      removedCollaborators: addCollaboratorWorkspace.removedCollaborators || [],
      updatedAt: new Date().toISOString(),
    })
    setInvitationStatus(`${clean} added as collaborator.`)
    resetAddCollaboratorSheet()
  }

  const onAddCollaboratorSheetOpenChange = (open: boolean) => {
    if (open) {
      setAddCollaboratorSheetOpen(true)
      return
    }
    resetAddCollaboratorSheet()
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
    const menuHeight = 168
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
        )}
      >
        <aside className="hidden border-r border-border nav:block">
          <WorkspacesHomeSidebar
            centerView={centerView}
            onSelectCenterView={setCenterView}
            filterKey={filterKey}
            counts={filterCounts}
            onFilterChange={setFilterKey}
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
                      className={cn('w-sz-260', HOUSE_INPUT_CLASS)}
                    />
                    <select
                      value={filterKey}
                      onChange={(event) => setFilterKey(event.target.value as FilterKey)}
                      className={cn('h-9 rounded-md bg-background px-2 text-sm', HOUSE_SELECT_CLASS)}
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
                        className={cn('h-9 rounded-md bg-background px-2 text-sm', HOUSE_SELECT_CLASS)}
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
                  <div className="flex items-center gap-2">
                    <Button
                      type="button"
                      size="sm"
                      className={cn(HOUSE_ACTION_BUTTON_CLASS, HOUSE_BUTTON_TEXT_CLASS, 'xl:hidden')}
                      onClick={() => setWorkspaceDrilldownMobileOpen(true)}
                    >
                      <PanelRightOpen className="mr-1 h-3.5 w-3.5" />
                      Drilldown
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      className={cn(HOUSE_ACTION_BUTTON_CLASS, HOUSE_BUTTON_TEXT_CLASS, 'hidden xl:inline-flex')}
                      onClick={() => setWorkspaceDrilldownDesktopOpen((current) => !current)}
                    >
                      {workspaceDrilldownDesktopOpen ? (
                        <PanelRightClose className="mr-1 h-3.5 w-3.5" />
                      ) : (
                        <PanelRightOpen className="mr-1 h-3.5 w-3.5" />
                      )}
                      {workspaceDrilldownDesktopOpen ? 'Collapse chart' : 'Expand chart'}
                    </Button>
                    <button
                      type="button"
                      onClick={() => setViewMode('table')}
                      className={cn(
                        'rounded-md border px-2 py-1.5 text-sm',
                        HOUSE_BUTTON_TEXT_CLASS,
                        viewMode === 'table'
                          ? 'border-[hsl(var(--tone-accent-300))] bg-[hsl(var(--tone-accent-50))] text-[hsl(var(--tone-accent-800))]'
                          : 'border-border bg-background text-muted-foreground',
                      )}
                    >
                      Table
                    </button>
                    <button
                      type="button"
                      onClick={() => setViewMode('cards')}
                      className={cn(
                        'rounded-md border px-2 py-1.5 text-sm',
                        HOUSE_BUTTON_TEXT_CLASS,
                        viewMode === 'cards'
                          ? 'border-[hsl(var(--tone-accent-300))] bg-[hsl(var(--tone-accent-50))] text-[hsl(var(--tone-accent-800))]'
                          : 'border-border bg-background text-muted-foreground',
                      )}
                    >
                      Cards
                    </button>
                  </div>
                </div>

                {filteredWorkspaces.length === 0 ? (
                  <div className="p-6 text-sm text-muted-foreground">No workspaces match the current filter.</div>
                ) : viewMode === 'table' ? (
                  <div className={HOUSE_TABLE_SHELL_CLASS}>
                    <table className="w-full min-w-sz-980 text-sm">
                      <thead className={cn('text-left', HOUSE_TABLE_HEAD_CLASS)}>
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
                          <th className={cn('px-3 py-2', HOUSE_TABLE_HEAD_TEXT_CLASS)}>Owner</th>
                          <th className={cn('px-3 py-2', HOUSE_TABLE_HEAD_TEXT_CLASS)}>Collaborators</th>
                          <th className={cn('px-3 py-2', HOUSE_TABLE_HEAD_TEXT_CLASS)}>
                            <SortableHeader
                              label="Stage"
                              column="stage"
                              activeColumn={sortColumn}
                              direction={sortDirection}
                              onSort={onSort}
                            />
                          </th>
                          <th className={cn('px-3 py-2', HOUSE_TABLE_HEAD_TEXT_CLASS)}>Last activity</th>
                          <th className={cn('px-3 py-2', HOUSE_TABLE_HEAD_TEXT_CLASS)}>
                            <SortableHeader
                              label="Status"
                              column="status"
                              activeColumn={sortColumn}
                              direction={sortDirection}
                              onSort={onSort}
                            />
                          </th>
                          <th className={cn('px-3 py-2', HOUSE_TABLE_HEAD_TEXT_CLASS)}>Unread</th>
                        </tr>
                      </thead>
                      <tbody>
                        {filteredWorkspaces.map((workspace) => {
                          const signal = workspaceInboxSignals[workspace.id] || {
                            unreadCount: 0,
                            firstUnreadMessageId: null,
                            lastActivityAt: workspace.updatedAt,
                          }
                          return (
                            <tr
                              key={workspace.id}
                              className={cn('cursor-pointer', HOUSE_TABLE_ROW_CLASS)}
                              onClick={() => onOpenWorkspace(workspace.id)}
                            >
                              <td className={cn('px-3 py-2 align-middle font-medium', HOUSE_TABLE_CELL_TEXT_CLASS)}>
                                <div className="flex items-center justify-between gap-2">
                                  <div className="min-w-0 flex-1">
                                    {renamingWorkspaceId === workspace.id ? (
                                      <div className="space-y-2" onClick={(event) => event.stopPropagation()}>
                                        <Input
                                          value={renameDraft}
                                          onChange={(event) => setRenameDraft(event.target.value)}
                                          className="h-8"
                                          autoFocus
                                        />
                                        <div className="flex items-center gap-2">
                                          <Button type="button" size="sm" onClick={() => onSaveRenameWorkspace(workspace)}>
                                            Save
                                          </Button>
                                          <Button type="button" size="sm" variant="outline" onClick={onCancelRenameWorkspace}>
                                            Cancel
                                          </Button>
                                        </div>
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
                              <td className={cn('px-3 py-2 align-middle text-muted-foreground', HOUSE_TABLE_CELL_TEXT_CLASS)}>{workspace.ownerName}</td>
                              <td className={cn('px-3 py-2 align-middle text-muted-foreground', HOUSE_TABLE_CELL_TEXT_CLASS)}>
                                <CollaboratorBanners
                                  workspace={workspace}
                                  canManage={isWorkspaceOwner(workspace, workspaceOwnerName)}
                                  onAddCollaborator={onAddCollaborator}
                                  onToggleRemoved={onToggleCollaboratorRemoved}
                                />
                              </td>
                              <td className={cn('px-3 py-2 align-middle', HOUSE_TABLE_CELL_TEXT_CLASS)}>{workspaceStage(workspace)}</td>
                              <td className={cn('px-3 py-2 align-middle text-muted-foreground', HOUSE_TABLE_CELL_TEXT_CLASS)}>
                                {formatTimestamp(signal.lastActivityAt)}
                              </td>
                              <td className={cn('px-3 py-2 align-middle', HOUSE_TABLE_CELL_TEXT_CLASS)}>
                                <div className="flex items-center gap-2">
                                  <span
                                    className={cn(
                                      'inline-block h-2.5 w-2.5 rounded-full',
                                      workspace.archived ? 'bg-amber-500' : 'bg-emerald-500',
                                    )}
                                  />
                                  <span>{workspaceStatus(workspace)}</span>
                                </div>
                              </td>
                              <td className={cn('px-3 py-2 align-middle', HOUSE_TABLE_CELL_TEXT_CLASS)}>
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
                      return (
                        <button
                          key={workspace.id}
                          type="button"
                          onClick={() => onOpenWorkspace(workspace.id)}
                          className="rounded-lg border border-border bg-background p-3 text-left hover:bg-accent/30"
                        >
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0 flex-1">
                            {renamingWorkspaceId === workspace.id ? (
                              <div className="space-y-2" onClick={(event) => event.stopPropagation()}>
                                <Input
                                  value={renameDraft}
                                  onChange={(event) => setRenameDraft(event.target.value)}
                                  className="h-8"
                                  autoFocus
                                />
                                <div className="flex items-center gap-2">
                                  <Button type="button" size="sm" onClick={() => onSaveRenameWorkspace(workspace)}>
                                    Save
                                  </Button>
                                  <Button type="button" size="sm" variant="outline" onClick={onCancelRenameWorkspace}>
                                    Cancel
                                  </Button>
                                </div>
                              </div>
                            ) : (
                              <>
                                <p className="flex min-w-0 items-center gap-1.5 font-medium">
                                  {workspace.pinned ? <Pin size={13} className="shrink-0 text-emerald-600" aria-label="Pinned workspace" /> : null}
                                  <span className="truncate">{workspace.name}</span>
                                </p>
                                <p className="mt-1 text-xs text-muted-foreground">Owner {workspace.ownerName}</p>
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
                  <WorkspacesDataLibraryView />
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
                  <WorkspacesDrilldownPanel
                    filteredWorkspaces={filteredWorkspaces}
                    filterCounts={filterCounts}
                    filterKey={filterKey}
                    workspaceInboxSignals={workspaceInboxSignals}
                  />
                </div>
              </ScrollArea>
            ) : (
              <div className="flex h-full items-start justify-center pt-3">
                <button
                  type="button"
                  onClick={() => setWorkspaceDrilldownDesktopOpen(true)}
                  className={cn(HOUSE_DRILLDOWN_ACTION_CLASS, 'inline-flex h-8 w-8 items-center justify-center p-0')}
                  aria-label="Expand workspace drilldown panel"
                  title="Expand workspace drilldown panel"
                >
                  <PanelRightOpen className="h-4 w-4" />
                </button>
              </div>
            )}
          </aside>
        ) : null}
      </div>

      <Sheet open={workspaceDrilldownMobileOpen} onOpenChange={setWorkspaceDrilldownMobileOpen}>
        <SheetContent side="right" className={HOUSE_DRILLDOWN_SHEET_CLASS}>
          <WorkspacesDrilldownPanel
            filteredWorkspaces={filteredWorkspaces}
            filterCounts={filterCounts}
            filterKey={filterKey}
            workspaceInboxSignals={workspaceInboxSignals}
          />
        </SheetContent>
      </Sheet>

      <Sheet open={addCollaboratorSheetOpen} onOpenChange={onAddCollaboratorSheetOpenChange}>
        <SheetContent side="right" className="w-full max-w-sz-480 p-0 sm:w-sz-480">
          <div className="flex h-full flex-col">
            <div className="border-b border-border p-4">
              <div className={cn(HOUSE_PAGE_HEADER_CLASS, HOUSE_LEFT_BORDER_CLASS)}>
                <h2 className={HOUSE_SECTION_TITLE_CLASS}>Add collaborator</h2>
                <p className={HOUSE_SECTION_SUBTITLE_CLASS}>
                  {addCollaboratorWorkspace
                    ? `Select a collaborator for ${addCollaboratorWorkspace.name}.`
                    : 'Select a workspace first.'}
                </p>
              </div>
            </div>

            <div className="flex-1 space-y-3 overflow-y-auto p-4">
              <div className="space-y-1">
                <label htmlFor="workspace-collaborator-search" className={houseTypography.fieldLabel}>
                  Find person
                </label>
                <Input
                  id="workspace-collaborator-search"
                  value={collaboratorQuery}
                  onChange={(event) => {
                    setCollaboratorQuery(event.target.value)
                    setSelectedCollaboratorName('')
                    setCollaboratorLookupError('')
                  }}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter' && canConfirmAddCollaborator) {
                      event.preventDefault()
                      onConfirmAddCollaborator()
                    }
                  }}
                  placeholder="Search by name or email"
                  className={HOUSE_INPUT_CLASS}
                />
                <p className={HOUSE_FIELD_HELPER_CLASS}>
                  Type at least 2 characters. Only top matches are loaded for speed at scale.
                </p>
              </div>

              {collaboratorLookupLoading ? (
                <p className={HOUSE_FIELD_HELPER_CLASS}>Searching collaborator directory...</p>
              ) : null}
              {collaboratorLookupError ? (
                <p className="text-sm text-amber-700">{collaboratorLookupError}</p>
              ) : null}

              <div className={cn('rounded-md border border-border', HOUSE_TABLE_SHELL_CLASS)}>
                <ScrollArea className="h-64">
                  <div className="space-y-1 p-2">
                    {collaboratorCandidates.length === 0 ? (
                      <p className={cn('px-2 py-1', HOUSE_FIELD_HELPER_CLASS)}>No matches yet.</p>
                    ) : (
                      collaboratorCandidates.map((candidate) => {
                        const isSelected =
                          normalizeCollaboratorName(candidate.name).toLowerCase() ===
                          normalizeCollaboratorName(selectedCollaboratorName || collaboratorQuery).toLowerCase()
                        return (
                          <button
                            key={candidate.key}
                            type="button"
                            onClick={() => {
                              setSelectedCollaboratorName(candidate.name)
                              setCollaboratorQuery(candidate.name)
                            }}
                            className={cn(
                              'w-full rounded border px-2 py-1.5 text-left',
                              isSelected
                                ? 'border-[hsl(var(--tone-accent-300))] bg-[hsl(var(--tone-accent-50))]'
                                : 'border-transparent bg-background hover:border-border hover:bg-accent/30',
                            )}
                          >
                            <p className={houseTypography.text}>{candidate.name}</p>
                            <div className="mt-0.5 flex items-center justify-between gap-2" data-ui="collaborator-candidate-meta">
                              <p className={houseTypography.fieldHelper} data-ui="collaborator-candidate-subtitle">{candidate.subtitle}</p>
                              <span className="text-micro text-muted-foreground" data-ui="collaborator-candidate-source">
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

              {collaboratorTargetName ? <p className={HOUSE_FIELD_HELPER_CLASS} data-ui="collaborator-candidate-selected">Selected: {collaboratorTargetName}</p> : null}
            </div>

            <div className="flex items-center justify-end gap-2 border-t border-border p-3" data-ui="collaborator-sheet-actions">
              <Button
                type="button"
                className={cn(HOUSE_ACTION_BUTTON_CLASS, HOUSE_BUTTON_TEXT_CLASS)}
                onClick={resetAddCollaboratorSheet}
              >
                Cancel
              </Button>
              <Button
                type="button"
                className={cn(HOUSE_PRIMARY_ACTION_BUTTON_CLASS, HOUSE_BUTTON_TEXT_CLASS)}
                onClick={onConfirmAddCollaborator}
                disabled={!canConfirmAddCollaborator}
              >
                Add collaborator
              </Button>
            </div>
          </div>
        </SheetContent>
      </Sheet>

      <Sheet open={leftPanelOpen} onOpenChange={setLeftPanelOpen}>
        <SheetContent side="left" className="w-sz-290 p-0 nav:hidden">
          <WorkspacesHomeSidebar
            centerView={centerView}
            onSelectCenterView={setCenterView}
            filterKey={filterKey}
            counts={filterCounts}
            onFilterChange={setFilterKey}
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
