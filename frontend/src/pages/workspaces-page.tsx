import { useEffect, useMemo, useState, type MouseEvent as ReactMouseEvent } from 'react'
import { createPortal } from 'react-dom'
import { useNavigate } from 'react-router-dom'

import { TopBar } from '@/components/layout/top-bar'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { ScrollArea } from '@/components/ui/scroll-area'
import { cn } from '@/lib/utils'
import { useWorkspaceStore, type WorkspaceRecord } from '@/store/use-workspace-store'

type ViewMode = 'table' | 'cards'
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

export function WorkspacesPage() {
  const navigate = useNavigate()
  const workspaces = useWorkspaceStore((state) => state.workspaces)
  const setActiveWorkspaceId = useWorkspaceStore((state) => state.setActiveWorkspaceId)
  const createWorkspace = useWorkspaceStore((state) => state.createWorkspace)
  const updateWorkspace = useWorkspaceStore((state) => state.updateWorkspace)
  const deleteWorkspace = useWorkspaceStore((state) => state.deleteWorkspace)

  const [query, setQuery] = useState('')
  const [viewMode, setViewMode] = useState<ViewMode>('table')
  const [filterKey, setFilterKey] = useState<FilterKey>('all')
  const [sortColumn, setSortColumn] = useState<SortColumn>('updatedAt')
  const [sortDirection, setSortDirection] = useState<SortDirection>('desc')
  const [newWorkspaceName, setNewWorkspaceName] = useState('')
  const [menuState, setMenuState] = useState<{
    workspaceId: string
    x: number
    y: number
  } | null>(null)
  const [renamingWorkspaceId, setRenamingWorkspaceId] = useState<string | null>(null)
  const [renameDraft, setRenameDraft] = useState('')

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

  const onCreateWorkspace = () => {
    const created = createWorkspace(newWorkspaceName.trim() || 'New Workspace')
    setNewWorkspaceName('')
    setActiveWorkspaceId(created.id)
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

  return (
    <div className="flex h-screen flex-col bg-background text-foreground">
      <TopBar scope="workspace" onOpenLeftNav={() => undefined} showLeftNavButton={false} />

      <main className="min-w-0 flex-1 overflow-hidden bg-background">
        <ScrollArea className="h-full">
          <div className="mx-auto w-full max-w-sz-1380 space-y-4 px-4 py-4 md:px-6">
            <section className="rounded-lg border border-border bg-card p-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h1 className="text-xl font-semibold tracking-tight">Workspaces</h1>
                  <p className="text-sm text-muted-foreground">Manage, filter, and open your workspace list.</p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <Input
                    value={newWorkspaceName}
                    onChange={(event) => setNewWorkspaceName(event.target.value)}
                    placeholder="New workspace name"
                    className="w-sz-220"
                  />
                  <Button type="button" onClick={onCreateWorkspace}>
                    Create workspace
                  </Button>
                </div>
              </div>
            </section>

            <section className="rounded-lg border border-border bg-card">
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-4 py-3">
                <div className="flex flex-wrap items-center gap-2">
                  <Input
                    value={query}
                    onChange={(event) => setQuery(event.target.value)}
                    placeholder="Filter workspaces"
                    className="w-sz-260"
                  />
                  <select
                    value={filterKey}
                    onChange={(event) => setFilterKey(event.target.value as FilterKey)}
                    className="h-9 rounded-md border border-input bg-background px-2 text-sm"
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
                      className="h-9 rounded-md border border-input bg-background px-2 text-sm"
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
                      variant="outline"
                      size="sm"
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
                      viewMode === 'table'
                        ? 'border-emerald-500 bg-emerald-50 text-emerald-800'
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
                      viewMode === 'cards'
                        ? 'border-emerald-500 bg-emerald-50 text-emerald-800'
                        : 'border-border bg-background text-muted-foreground',
                    )}
                  >
                    Cards
                  </button>
                </div>
              </div>

              <div className="border-b border-border px-4 py-2">
                <p className="text-xs text-muted-foreground">
                  {filteredWorkspaces.length} workspace{filteredWorkspaces.length === 1 ? '' : 's'} shown. Click a workspace to open it.
                </p>
              </div>

              {filteredWorkspaces.length === 0 ? (
                <div className="p-6 text-sm text-muted-foreground">No workspaces match the current filter.</div>
              ) : viewMode === 'table' ? (
                <div className="overflow-x-auto">
                  <table className="w-full min-w-sz-760 text-sm">
                    <thead className="bg-muted/35 text-left text-xs uppercase tracking-wide">
                      <tr>
                        <th className="px-3 py-2">
                          <SortableHeader
                            label="Workspace"
                            column="name"
                            activeColumn={sortColumn}
                            direction={sortDirection}
                            onSort={onSort}
                          />
                        </th>
                        <th className="px-3 py-2">
                          <SortableHeader
                            label="Stage"
                            column="stage"
                            activeColumn={sortColumn}
                            direction={sortDirection}
                            onSort={onSort}
                          />
                        </th>
                        <th className="px-3 py-2">
                          <SortableHeader
                            label="Updated"
                            column="updatedAt"
                            activeColumn={sortColumn}
                            direction={sortDirection}
                            onSort={onSort}
                          />
                        </th>
                        <th className="px-3 py-2">
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
                          className="cursor-pointer border-t border-border hover:bg-accent/30"
                          onClick={() => onOpenWorkspace(workspace.id)}
                        >
                          <td className="px-3 py-2 font-medium">
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
                          <td className="px-3 py-2">{workspaceStage(workspace)}</td>
                          <td className="px-3 py-2">{formatTimestamp(workspace.updatedAt)}</td>
                          <td className="px-3 py-2">
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
            </section>
          </div>
        </ScrollArea>
      </main>

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
