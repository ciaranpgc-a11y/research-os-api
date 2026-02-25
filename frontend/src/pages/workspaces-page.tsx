import { useEffect, useMemo, useState, type MouseEvent as ReactMouseEvent } from 'react'
import { createPortal } from 'react-dom'
import { useNavigate } from 'react-router-dom'

import { TopBar } from '@/components/layout/top-bar'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Sheet, SheetContent } from '@/components/ui/sheet'
import {
  WORKSPACE_OWNER_REQUIRED_MESSAGE,
  readWorkspaceOwnerNameFromProfile,
} from '@/lib/workspace-owner'
import { houseForms, houseSurfaces, houseTypography } from '@/lib/house-style'
import { cn } from '@/lib/utils'
import { useAaweStore } from '@/store/use-aawe-store'
import {
  useWorkspaceStore,
  type WorkspaceRecord,
} from '@/store/use-workspace-store'

type ViewMode = 'table' | 'cards'
type CenterView = 'workspaces' | 'invitations'
type FilterKey = 'all' | 'active' | 'pinned' | 'archived' | 'recent'
type SortColumn = 'name' | 'stage' | 'updatedAt' | 'status'
type SortDirection = 'asc' | 'desc'

const FILTER_OPTIONS: Array<{ key: FilterKey; label: string }> = [
  { key: 'all', label: 'All' },
  { key: 'active', label: 'Active' },
  { key: 'pinned', label: 'Pinned' },
  { key: 'recent', label: 'Recent (14 days)' },
  { key: 'archived', label: 'Archived' },
]

const HOUSE_PAGE_TITLE_CLASS = houseTypography.title
const HOUSE_PAGE_SUBTITLE_CLASS = houseTypography.subtitle
const HOUSE_SECTION_TITLE_CLASS = houseTypography.sectionTitle
const HOUSE_SECTION_SUBTITLE_CLASS = houseTypography.sectionSubtitle
const HOUSE_FIELD_LABEL_CLASS = houseTypography.fieldLabel
const HOUSE_FIELD_HELPER_CLASS = houseTypography.fieldHelper
const HOUSE_BUTTON_TEXT_CLASS = houseTypography.buttonText
const HOUSE_LEFT_BORDER_CLASS = houseSurfaces.leftBorder
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

function workspaceCollaborators(workspace: WorkspaceRecord): string {
  if (workspace.collaborators.length === 0) {
    return '-'
  }
  return workspace.collaborators.join(', ')
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
  onCreateWorkspace,
  onClearSearch,
  incomingInvitationCount,
  outgoingInvitationCount,
  canClearSearch,
  canCreateWorkspace,
  createBlockedMessage,
  onNavigate,
}: {
  centerView: CenterView
  onSelectCenterView: (next: CenterView) => void
  filterKey: FilterKey
  counts: Record<FilterKey, number>
  onFilterChange: (next: FilterKey) => void
  onCreateWorkspace: () => void
  onClearSearch: () => void
  incomingInvitationCount: number
  outgoingInvitationCount: number
  canClearSearch: boolean
  canCreateWorkspace: boolean
  createBlockedMessage: string
  onNavigate?: () => void
}) {
  const totalInvitationCount = incomingInvitationCount + outgoingInvitationCount
  return (
    <aside className="flex h-full flex-col bg-card">
      <div className="space-y-1 border-b border-border px-4 py-3.5">
        <h1 className={HOUSE_SECTION_TITLE_CLASS}>Workspaces home</h1>
        <p className={HOUSE_FIELD_HELPER_CLASS}>
          Library-level filters and actions for all workspaces.
        </p>
      </div>
      <ScrollArea className="flex-1">
        <div className="space-y-4 p-3">
          <section className="space-y-1.5">
            <p className={cn('px-2', HOUSE_FIELD_LABEL_CLASS)}>
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
                  'flex w-full items-center justify-between rounded-md border px-2.5 py-1.5 text-sm transition-colors',
                  centerView === 'workspaces'
                    ? 'border-emerald-400 bg-emerald-50 text-emerald-900'
                    : 'border-border bg-background text-muted-foreground hover:text-foreground',
                )}
              >
                <span>Workspaces</span>
              </button>
              <button
                type="button"
                onClick={() => {
                  onSelectCenterView('invitations')
                  onNavigate?.()
                }}
                className={cn(
                  'flex w-full items-center justify-between rounded-md border px-2.5 py-1.5 text-sm transition-colors',
                  centerView === 'invitations'
                    ? 'border-emerald-400 bg-emerald-50 text-emerald-900'
                    : 'border-border bg-background text-muted-foreground hover:text-foreground',
                )}
              >
                <span>Invitations</span>
                <div className="ml-2 flex items-center gap-1.5">
                  <span className="inline-flex items-center gap-1 rounded border border-border bg-background px-1.5 py-0.5 text-micro text-muted-foreground">
                    <span className="inline-block h-1.5 w-1.5 rounded-full bg-emerald-500" />
                    {incomingInvitationCount}
                  </span>
                  <span className="inline-flex items-center gap-1 rounded border border-border bg-background px-1.5 py-0.5 text-micro text-muted-foreground">
                    <span className="inline-block h-1.5 w-1.5 rounded-full bg-red-500" />
                    {outgoingInvitationCount}
                  </span>
                  <span className="rounded border border-border bg-muted/50 px-1.5 py-0.5 text-micro text-muted-foreground">
                    {totalInvitationCount}
                  </span>
                </div>
              </button>
            </div>
          </section>

          <section className="space-y-1.5">
            <p className={cn('px-2', HOUSE_FIELD_LABEL_CLASS)}>
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
                    'flex w-full items-center justify-between rounded-md border px-2.5 py-1.5 text-sm transition-colors',
                    filterKey === option.key
                      ? 'border-emerald-400 bg-emerald-50 text-emerald-900'
                      : 'border-border bg-background text-muted-foreground hover:text-foreground',
                  )}
                >
                  <span className="truncate text-left">{option.label}</span>
                  <span
                    className={cn(
                      'ml-2 rounded border px-1.5 py-0.5 text-micro',
                      filterKey === option.key
                        ? 'border-emerald-300 bg-emerald-100 text-emerald-800'
                        : 'border-border bg-muted/50 text-muted-foreground',
                    )}
                  >
                    {counts[option.key]}
                  </span>
                </button>
              ))}
            </div>
          </section>

          <section className="space-y-2">
            <p className={cn('px-2', HOUSE_FIELD_LABEL_CLASS)}>
              Actions
            </p>
            <Button
              type="button"
              className={cn('w-full justify-start', HOUSE_PRIMARY_ACTION_BUTTON_CLASS, HOUSE_BUTTON_TEXT_CLASS)}
              onClick={() => {
                onCreateWorkspace()
                onNavigate?.()
              }}
              disabled={!canCreateWorkspace}
            >
              Create workspace
            </Button>
            {!canCreateWorkspace ? (
              <p className={cn('px-1', HOUSE_FIELD_HELPER_CLASS)}>{createBlockedMessage}</p>
            ) : null}
            <Button
              type="button"
              className={cn('w-full justify-start', HOUSE_ACTION_BUTTON_CLASS, HOUSE_BUTTON_TEXT_CLASS)}
              onClick={() => {
                onClearSearch()
                onNavigate?.()
              }}
              disabled={!canClearSearch}
            >
              Clear search
            </Button>
          </section>

        </div>
      </ScrollArea>
    </aside>
  )
}

export function WorkspacesPage() {
  const navigate = useNavigate()
  const workspaces = useWorkspaceStore((state) => state.workspaces)
  const authorRequests = useWorkspaceStore((state) => state.authorRequests)
  const invitationsSent = useWorkspaceStore((state) => state.invitationsSent)
  const setActiveWorkspaceId = useWorkspaceStore((state) => state.setActiveWorkspaceId)
  const createWorkspace = useWorkspaceStore((state) => state.createWorkspace)
  const updateWorkspace = useWorkspaceStore((state) => state.updateWorkspace)
  const deleteWorkspace = useWorkspaceStore((state) => state.deleteWorkspace)
  const sendWorkspaceInvitation = useWorkspaceStore((state) => state.sendWorkspaceInvitation)
  const acceptAuthorRequest = useWorkspaceStore((state) => state.acceptAuthorRequest)
  const declineAuthorRequest = useWorkspaceStore((state) => state.declineAuthorRequest)
  const leftPanelOpen = useAaweStore((state) => state.leftPanelOpen)
  const setLeftPanelOpen = useAaweStore((state) => state.setLeftPanelOpen)

  const [centerView, setCenterView] = useState<CenterView>('workspaces')
  const [query, setQuery] = useState('')
  const [viewMode, setViewMode] = useState<ViewMode>('table')
  const [filterKey, setFilterKey] = useState<FilterKey>('all')
  const [sortColumn, setSortColumn] = useState<SortColumn>('updatedAt')
  const [sortDirection, setSortDirection] = useState<SortDirection>('desc')
  const [newWorkspaceName, setNewWorkspaceName] = useState('')
  const [createError, setCreateError] = useState('')
  const [invitationStatus, setInvitationStatus] = useState('')
  const [menuState, setMenuState] = useState<{
    workspaceId: string
    x: number
    y: number
  } | null>(null)
  const [renamingWorkspaceId, setRenamingWorkspaceId] = useState<string | null>(null)
  const [renameDraft, setRenameDraft] = useState('')
  const [workspaceOwnerName, setWorkspaceOwnerName] = useState<string | null>(() =>
    readWorkspaceOwnerNameFromProfile(),
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
  const hasSearchQuery = query.trim().length > 0
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

  const canCreateWorkspace = Boolean(workspaceOwnerName)

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
    const menuHeight = 132
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

      <div className="grid min-h-0 flex-1 grid-cols-1 nav:grid-cols-[280px_minmax(0,1fr)]">
        <aside className="hidden border-r border-border nav:block">
          <WorkspacesHomeSidebar
            centerView={centerView}
            onSelectCenterView={setCenterView}
            filterKey={filterKey}
            counts={filterCounts}
            onFilterChange={setFilterKey}
            onCreateWorkspace={onCreateWorkspace}
            onClearSearch={() => setQuery('')}
            incomingInvitationCount={incomingInvitationCount}
            outgoingInvitationCount={outgoingInvitationCount}
            canClearSearch={hasSearchQuery}
            canCreateWorkspace={canCreateWorkspace}
            createBlockedMessage={WORKSPACE_OWNER_REQUIRED_MESSAGE}
          />
        </aside>

        <main className="min-w-0 flex-1 overflow-hidden bg-background">
          <ScrollArea className="h-full">
            <div className="mx-auto w-full max-w-sz-1380 space-y-4 px-4 py-4 md:px-6">
              <section className={cn('rounded-lg border border-border p-4', HOUSE_CARD_CLASS)}>
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className={HOUSE_LEFT_BORDER_CLASS}>
                    <h1 className={HOUSE_PAGE_TITLE_CLASS}>Workspaces</h1>
                    <p className={HOUSE_PAGE_SUBTITLE_CLASS}>Manage, filter, and open your workspace list.</p>
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

                <div className="border-b border-border px-4 py-2">
                  <p className={HOUSE_FIELD_HELPER_CLASS}>
                    {filteredWorkspaces.length} workspace{filteredWorkspaces.length === 1 ? '' : 's'} shown. Click a workspace to open it.
                  </p>
                </div>

                {filteredWorkspaces.length === 0 ? (
                  <div className="p-6 text-sm text-muted-foreground">No workspaces match the current filter.</div>
                ) : viewMode === 'table' ? (
                  <div className={HOUSE_TABLE_SHELL_CLASS}>
                    <table className="w-full min-w-sz-760 text-sm">
                      <thead className={cn('text-left text-xs uppercase tracking-wide', HOUSE_TABLE_HEAD_CLASS)}>
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
                          <th className={cn('px-3 py-2', HOUSE_TABLE_HEAD_TEXT_CLASS)}>
                            <SortableHeader
                              label="Updated"
                              column="updatedAt"
                              activeColumn={sortColumn}
                              direction={sortDirection}
                              onSort={onSort}
                            />
                          </th>
                          <th className={cn('px-3 py-2', HOUSE_TABLE_HEAD_TEXT_CLASS)}>
                            <SortableHeader
                              label="Status"
                              column="status"
                              activeColumn={sortColumn}
                              direction={sortDirection}
                              onSort={onSort}
                            />
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        {filteredWorkspaces.map((workspace) => (
                          <tr
                            key={workspace.id}
                            className={cn('cursor-pointer', HOUSE_TABLE_ROW_CLASS)}
                            onClick={() => onOpenWorkspace(workspace.id)}
                          >
                            <td className={cn('px-3 py-2 font-medium', HOUSE_TABLE_CELL_TEXT_CLASS)}>
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
                                      <p className="truncate">{workspace.name}</p>
                                      <div className="mt-1 flex flex-wrap gap-1">
                                        {workspace.pinned ? (
                                          <span className="rounded border border-emerald-300 bg-emerald-50 px-1.5 py-0.5 text-micro text-emerald-700">
                                            Pinned
                                          </span>
                                        ) : null}
                                      </div>
                                    </>
                                  )}
                                </div>

                                <WorkspaceMenuTrigger
                                  menuOpen={menuState?.workspaceId === workspace.id}
                                  onToggleMenu={(event) => onToggleWorkspaceMenu(workspace.id, event)}
                                />
                              </div>
                            </td>
                            <td className={cn('px-3 py-2 text-muted-foreground', HOUSE_TABLE_CELL_TEXT_CLASS)}>{workspace.ownerName}</td>
                            <td className={cn('px-3 py-2 text-muted-foreground', HOUSE_TABLE_CELL_TEXT_CLASS)}>{workspaceCollaborators(workspace)}</td>
                            <td className={cn('px-3 py-2', HOUSE_TABLE_CELL_TEXT_CLASS)}>{workspaceStage(workspace)}</td>
                            <td className={cn('px-3 py-2', HOUSE_TABLE_CELL_TEXT_CLASS)}>{formatTimestamp(workspace.updatedAt)}</td>
                            <td className={cn('px-3 py-2', HOUSE_TABLE_CELL_TEXT_CLASS)}>
                              <div className="flex items-center gap-2">
                                <span
                                  className={cn(
                                    'inline-block h-2.5 w-2.5 rounded-full',
                                    workspace.archived ? 'bg-amber-500' : 'bg-emerald-500',
                                  )}
                                />
                                <span>{workspaceStatus(workspace)}</span>
                                <button
                                  type="button"
                                  className="ml-auto rounded border border-border bg-background px-2 py-0.5 text-micro text-muted-foreground hover:text-foreground"
                                  onClick={(event) => {
                                    event.stopPropagation()
                                    onTogglePinned(workspace)
                                  }}
                                >
                                  {workspace.pinned ? 'Unpin' : 'Pin'}
                                </button>
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <div className="grid gap-3 p-4 md:grid-cols-2 xl:grid-cols-3">
                    {filteredWorkspaces.map((workspace) => (
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
                                <p className="font-medium">{workspace.name}</p>
                                <p className="mt-1 text-xs text-muted-foreground">Owner {workspace.ownerName}</p>
                                <p className="mt-1 text-xs text-muted-foreground">
                                  Collaborators {workspaceCollaborators(workspace)}
                                </p>
                                <p className="mt-1 text-xs text-muted-foreground">
                                  Updated {formatTimestamp(workspace.updatedAt)}
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
                              onTogglePinned(workspace)
                            }}
                          >
                            {workspace.pinned ? 'Unpin' : 'Pin'}
                          </button>
                        </div>
                      </button>
                    ))}
                  </div>
                )}
                  </>
                ) : (
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
                          <thead className={cn('text-left text-xs uppercase tracking-wide', HOUSE_TABLE_HEAD_CLASS)}>
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
                )}
              </section>
            </div>
          </ScrollArea>
        </main>
      </div>

      <Sheet open={leftPanelOpen} onOpenChange={setLeftPanelOpen}>
        <SheetContent side="left" className="w-sz-290 p-0 nav:hidden">
          <WorkspacesHomeSidebar
            centerView={centerView}
            onSelectCenterView={setCenterView}
            filterKey={filterKey}
            counts={filterCounts}
            onFilterChange={setFilterKey}
            onCreateWorkspace={onCreateWorkspace}
            onClearSearch={() => setQuery('')}
            incomingInvitationCount={incomingInvitationCount}
            outgoingInvitationCount={outgoingInvitationCount}
            canClearSearch={hasSearchQuery}
            canCreateWorkspace={canCreateWorkspace}
            createBlockedMessage={WORKSPACE_OWNER_REQUIRED_MESSAGE}
            onNavigate={() => setLeftPanelOpen(false)}
          />
        </SheetContent>
      </Sheet>

      {menuState && menuWorkspace
        ? createPortal(
            <div className="fixed inset-0 z-50" onClick={() => setMenuState(null)}>
              <div
                data-workspace-menu="true"
                className="fixed w-40 rounded-md border border-border bg-card p-1 shadow-lg"
                style={{ left: menuState.x, top: menuState.y }}
                onClick={(event) => event.stopPropagation()}
              >
                <button
                  type="button"
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
                  className="block w-full rounded px-2 py-1.5 text-left text-sm hover:bg-accent/50"
                  onClick={() => onStartRenameWorkspace(menuWorkspace)}
                >
                  Rename
                </button>
                <button
                  type="button"
                  className="block w-full rounded px-2 py-1.5 text-left text-sm hover:bg-accent/50"
                  onClick={() => onArchiveToggle(menuWorkspace)}
                >
                  {menuWorkspace.archived ? 'Restore' : 'Archive'}
                </button>
                <button
                  type="button"
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
