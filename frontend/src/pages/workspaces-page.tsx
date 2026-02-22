import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'

import { TopBar } from '@/components/layout/top-bar'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Sheet, SheetContent } from '@/components/ui/sheet'
import { cn } from '@/lib/utils'
import { useAaweStore } from '@/store/use-aawe-store'
import { useWorkspaceStore, type WorkspaceRecord } from '@/store/use-workspace-store'

type ViewMode = 'table' | 'cards'
type FilterKey = 'all' | 'active' | 'pinned' | 'archived' | 'recent'
type SortKey = 'most_recent' | 'oldest' | 'name_az' | 'name_za'

const FILTER_OPTIONS: Array<{ key: FilterKey; label: string }> = [
  { key: 'all', label: 'All workspaces' },
  { key: 'active', label: 'Active' },
  { key: 'pinned', label: 'Pinned' },
  { key: 'recent', label: 'Recent (14 days)' },
  { key: 'archived', label: 'Archived' },
]

const SORT_OPTIONS: Array<{ key: SortKey; label: string }> = [
  { key: 'most_recent', label: 'Most recent' },
  { key: 'oldest', label: 'Oldest first' },
  { key: 'name_az', label: 'Name (A-Z)' },
  { key: 'name_za', label: 'Name (Z-A)' },
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

function sortWorkspaces(workspaces: WorkspaceRecord[], sortKey: SortKey): WorkspaceRecord[] {
  const next = [...workspaces]
  if (sortKey === 'name_az') {
    return next.sort((a, b) => a.name.localeCompare(b.name))
  }
  if (sortKey === 'name_za') {
    return next.sort((a, b) => b.name.localeCompare(a.name))
  }
  if (sortKey === 'oldest') {
    return next.sort((a, b) => Date.parse(a.updatedAt) - Date.parse(b.updatedAt))
  }
  return next.sort((a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt))
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

function WorkspaceFiltersPanel({
  query,
  onQueryChange,
  viewMode,
  onViewModeChange,
  filterKey,
  onFilterKeyChange,
  sortKey,
  onSortKeyChange,
}: {
  query: string
  onQueryChange: (value: string) => void
  viewMode: ViewMode
  onViewModeChange: (value: ViewMode) => void
  filterKey: FilterKey
  onFilterKeyChange: (value: FilterKey) => void
  sortKey: SortKey
  onSortKeyChange: (value: SortKey) => void
}) {
  return (
    <aside className="flex h-full flex-col bg-card">
      <div className="border-b border-border p-4">
        <h2 className="text-sm font-semibold">Workspace filters</h2>
      </div>
      <ScrollArea className="flex-1">
        <div className="space-y-4 p-4">
          <div className="space-y-2">
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Search</p>
            <Input
              value={query}
              onChange={(event) => onQueryChange(event.target.value)}
              placeholder="Search workspaces"
            />
          </div>

          <div className="space-y-2">
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">View</p>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => onViewModeChange('table')}
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
                onClick={() => onViewModeChange('cards')}
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

          <div className="space-y-2">
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Filter</p>
            <div className="space-y-1">
              {FILTER_OPTIONS.map((option) => (
                <button
                  key={option.key}
                  type="button"
                  onClick={() => onFilterKeyChange(option.key)}
                  className={cn(
                    'w-full rounded-md border px-2 py-1.5 text-left text-sm',
                    filterKey === option.key
                      ? 'border-emerald-500 bg-emerald-50 text-emerald-800'
                      : 'border-border bg-background text-muted-foreground',
                  )}
                >
                  {option.label}
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-2">
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Sort</p>
            <select
              value={sortKey}
              onChange={(event) => onSortKeyChange(event.target.value as SortKey)}
              className="h-9 w-full rounded-md border border-input bg-background px-2 text-sm"
            >
              {SORT_OPTIONS.map((option) => (
                <option key={option.key} value={option.key}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>
        </div>
      </ScrollArea>
    </aside>
  )
}

export function WorkspacesPage() {
  const navigate = useNavigate()
  const leftPanelOpen = useAaweStore((state) => state.leftPanelOpen)
  const setLeftPanelOpen = useAaweStore((state) => state.setLeftPanelOpen)
  const workspaces = useWorkspaceStore((state) => state.workspaces)
  const activeWorkspaceId = useWorkspaceStore((state) => state.activeWorkspaceId)
  const setActiveWorkspaceId = useWorkspaceStore((state) => state.setActiveWorkspaceId)
  const createWorkspace = useWorkspaceStore((state) => state.createWorkspace)
  const updateWorkspace = useWorkspaceStore((state) => state.updateWorkspace)

  const [query, setQuery] = useState('')
  const [viewMode, setViewMode] = useState<ViewMode>('table')
  const [filterKey, setFilterKey] = useState<FilterKey>('all')
  const [sortKey, setSortKey] = useState<SortKey>('most_recent')
  const [selectedWorkspaceId, setSelectedWorkspaceId] = useState<string | null>(
    activeWorkspaceId || workspaces[0]?.id || null,
  )
  const [newWorkspaceName, setNewWorkspaceName] = useState('')
  const [renameInput, setRenameInput] = useState('')

  useEffect(() => {
    if (workspaces.length === 0) {
      setSelectedWorkspaceId(null)
      return
    }
    if (!selectedWorkspaceId || !workspaces.some((workspace) => workspace.id === selectedWorkspaceId)) {
      const fallbackId = activeWorkspaceId || workspaces[0]?.id || null
      setSelectedWorkspaceId(fallbackId)
    }
  }, [activeWorkspaceId, selectedWorkspaceId, workspaces])

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
    return sortWorkspaces(next, sortKey)
  }, [filterKey, query, sortKey, workspaces])

  const selectedWorkspace =
    workspaces.find((workspace) => workspace.id === selectedWorkspaceId) || null

  useEffect(() => {
    setRenameInput(selectedWorkspace?.name || '')
  }, [selectedWorkspace?.id, selectedWorkspace?.name])

  const onCreateWorkspace = () => {
    const created = createWorkspace(newWorkspaceName.trim() || 'New Workspace')
    setNewWorkspaceName('')
    setSelectedWorkspaceId(created.id)
    setActiveWorkspaceId(created.id)
  }

  const onOpenWorkspace = (workspaceId: string, section: 'overview' | 'run-wizard' | 'manuscript/introduction' | 'data') => {
    setActiveWorkspaceId(workspaceId)
    navigate(`/w/${workspaceId}/${section}`)
  }

  const onSaveRename = () => {
    if (!selectedWorkspace) {
      return
    }
    const cleanName = renameInput.trim()
    if (!cleanName || cleanName === selectedWorkspace.name) {
      return
    }
    updateWorkspace(selectedWorkspace.id, {
      name: cleanName,
      updatedAt: new Date().toISOString(),
    })
  }

  const togglePinned = () => {
    if (!selectedWorkspace) {
      return
    }
    updateWorkspace(selectedWorkspace.id, {
      pinned: !selectedWorkspace.pinned,
      updatedAt: new Date().toISOString(),
    })
  }

  const toggleArchived = () => {
    if (!selectedWorkspace) {
      return
    }
    updateWorkspace(selectedWorkspace.id, {
      archived: !selectedWorkspace.archived,
      updatedAt: new Date().toISOString(),
    })
  }

  return (
    <div className="flex h-screen flex-col bg-background text-foreground">
      <TopBar scope="workspace" onOpenLeftNav={() => setLeftPanelOpen(true)} />

      <div className="grid min-h-0 flex-1 grid-cols-1 nav:grid-cols-[270px_minmax(0,1fr)] insight:grid-cols-[270px_minmax(0,1fr)_340px]">
        <aside className="hidden border-r border-border nav:block">
          <WorkspaceFiltersPanel
            query={query}
            onQueryChange={setQuery}
            viewMode={viewMode}
            onViewModeChange={setViewMode}
            filterKey={filterKey}
            onFilterKeyChange={setFilterKey}
            sortKey={sortKey}
            onSortKeyChange={setSortKey}
          />
        </aside>

        <main className="min-w-0 overflow-hidden bg-background">
          <ScrollArea className="h-full">
            <div className="mx-auto w-full max-w-6xl space-y-4 px-4 py-4 md:px-6">
              <section className="rounded-lg border border-border bg-card p-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <h1 className="text-xl font-semibold tracking-tight">Workspaces</h1>
                    <p className="text-sm text-muted-foreground">
                      Select a workspace to open manuscript tools.
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <Input
                      value={newWorkspaceName}
                      onChange={(event) => setNewWorkspaceName(event.target.value)}
                      placeholder="New workspace name"
                      className="w-[220px]"
                    />
                    <Button type="button" onClick={onCreateWorkspace}>
                      Create workspace
                    </Button>
                  </div>
                </div>
              </section>

              <section className="rounded-lg border border-border bg-card">
                <div className="border-b border-border px-4 py-3">
                  <p className="text-sm text-muted-foreground">
                    {filteredWorkspaces.length} workspace{filteredWorkspaces.length === 1 ? '' : 's'} shown
                  </p>
                </div>

                {viewMode === 'table' ? (
                  <div className="overflow-x-auto">
                    <table className="w-full min-w-[760px] text-sm">
                      <thead className="bg-muted/35 text-left text-xs uppercase tracking-wide text-muted-foreground">
                        <tr>
                          <th className="px-3 py-2">Workspace</th>
                          <th className="px-3 py-2">Stage</th>
                          <th className="px-3 py-2">Version</th>
                          <th className="px-3 py-2">Updated</th>
                          <th className="px-3 py-2">Status</th>
                          <th className="px-3 py-2">Action</th>
                        </tr>
                      </thead>
                      <tbody>
                        {filteredWorkspaces.map((workspace) => {
                          const isSelected = selectedWorkspaceId === workspace.id
                          return (
                            <tr
                              key={workspace.id}
                              className={cn(
                                'cursor-pointer border-t border-border',
                                isSelected && 'bg-emerald-50/55',
                              )}
                              onClick={() => {
                                setSelectedWorkspaceId(workspace.id)
                                setActiveWorkspaceId(workspace.id)
                              }}
                            >
                              <td className="px-3 py-2 font-medium">
                                {workspace.name}
                                {workspace.pinned ? (
                                  <span className="ml-2 rounded border border-emerald-300 bg-emerald-50 px-1.5 py-0.5 text-[11px] text-emerald-700">
                                    Pinned
                                  </span>
                                ) : null}
                              </td>
                              <td className="px-3 py-2">{workspaceStage(workspace)}</td>
                              <td className="px-3 py-2">{workspace.version}</td>
                              <td className="px-3 py-2">{formatTimestamp(workspace.updatedAt)}</td>
                              <td className="px-3 py-2">
                                {workspace.archived ? (
                                  <span className="rounded border border-amber-300 bg-amber-50 px-1.5 py-0.5 text-[11px] text-amber-700">
                                    Archived
                                  </span>
                                ) : (
                                  <span className="rounded border border-emerald-300 bg-emerald-50 px-1.5 py-0.5 text-[11px] text-emerald-700">
                                    Active
                                  </span>
                                )}
                              </td>
                              <td className="px-3 py-2">
                                <Button
                                  type="button"
                                  size="sm"
                                  variant="outline"
                                  onClick={(event) => {
                                    event.stopPropagation()
                                    onOpenWorkspace(workspace.id, 'overview')
                                  }}
                                >
                                  Open
                                </Button>
                              </td>
                            </tr>
                          )
                        })}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <div className="grid gap-3 p-4 md:grid-cols-2">
                    {filteredWorkspaces.map((workspace) => {
                      const isSelected = selectedWorkspaceId === workspace.id
                      return (
                        <button
                          key={workspace.id}
                          type="button"
                          onClick={() => {
                            setSelectedWorkspaceId(workspace.id)
                            setActiveWorkspaceId(workspace.id)
                          }}
                          className={cn(
                            'rounded-lg border p-3 text-left',
                            isSelected
                              ? 'border-emerald-400 bg-emerald-50/60'
                              : 'border-border bg-background hover:bg-accent/30',
                          )}
                        >
                          <div className="flex items-start justify-between gap-2">
                            <p className="font-medium">{workspace.name}</p>
                            {workspace.archived ? (
                              <span className="rounded border border-amber-300 bg-amber-50 px-1.5 py-0.5 text-[11px] text-amber-700">
                                Archived
                              </span>
                            ) : null}
                          </div>
                          <p className="mt-1 text-xs text-muted-foreground">Stage: {workspaceStage(workspace)}</p>
                          <p className="text-xs text-muted-foreground">
                            Updated: {formatTimestamp(workspace.updatedAt)}
                          </p>
                          <div className="mt-3">
                            <Button
                              type="button"
                              size="sm"
                              variant="outline"
                              onClick={(event) => {
                                event.stopPropagation()
                                onOpenWorkspace(workspace.id, 'overview')
                              }}
                            >
                              Open
                            </Button>
                          </div>
                        </button>
                      )
                    })}
                  </div>
                )}
              </section>

              <section className="space-y-3 rounded-lg border border-border bg-card p-4 insight:hidden">
                <h2 className="text-sm font-semibold">Workspace actions</h2>
                {selectedWorkspace ? (
                  <>
                    <div className="space-y-1">
                      <p className="text-xs text-muted-foreground">Selected</p>
                      <p className="font-medium">{selectedWorkspace.name}</p>
                    </div>
                    <div className="grid gap-2 sm:grid-cols-2">
                      <Button type="button" variant="outline" onClick={() => onOpenWorkspace(selectedWorkspace.id, 'overview')}>
                        Open overview
                      </Button>
                      <Button type="button" variant="outline" onClick={() => onOpenWorkspace(selectedWorkspace.id, 'run-wizard')}>
                        Open Run Wizard
                      </Button>
                      <Button type="button" variant="outline" onClick={() => onOpenWorkspace(selectedWorkspace.id, 'manuscript/introduction')}>
                        Open manuscript
                      </Button>
                      <Button type="button" variant="outline" onClick={() => onOpenWorkspace(selectedWorkspace.id, 'data')}>
                        Open data
                      </Button>
                    </div>
                  </>
                ) : (
                  <p className="text-sm text-muted-foreground">Select a workspace to view actions.</p>
                )}
              </section>
            </div>
          </ScrollArea>
        </main>

        <aside className="hidden border-l border-border insight:block">
          <div className="flex h-full flex-col bg-card">
            <div className="border-b border-border p-4">
              <h2 className="text-sm font-semibold">Workspace actions</h2>
            </div>
            <ScrollArea className="flex-1">
              <div className="space-y-4 p-4 text-sm">
                {selectedWorkspace ? (
                  <>
                    <div className="space-y-1 rounded border border-border p-3">
                      <p className="text-xs uppercase tracking-wide text-muted-foreground">Selected workspace</p>
                      <p className="font-semibold">{selectedWorkspace.name}</p>
                      <p className="text-xs text-muted-foreground">Version {selectedWorkspace.version}</p>
                      <p className="text-xs text-muted-foreground">
                        Updated {formatTimestamp(selectedWorkspace.updatedAt)}
                      </p>
                    </div>

                    <div className="space-y-2 rounded border border-border p-3">
                      <p className="text-xs uppercase tracking-wide text-muted-foreground">Open</p>
                      <Button type="button" variant="outline" className="w-full justify-start" onClick={() => onOpenWorkspace(selectedWorkspace.id, 'overview')}>
                        Overview
                      </Button>
                      <Button type="button" variant="outline" className="w-full justify-start" onClick={() => onOpenWorkspace(selectedWorkspace.id, 'run-wizard')}>
                        Run Wizard
                      </Button>
                      <Button type="button" variant="outline" className="w-full justify-start" onClick={() => onOpenWorkspace(selectedWorkspace.id, 'manuscript/introduction')}>
                        Manuscript
                      </Button>
                      <Button type="button" variant="outline" className="w-full justify-start" onClick={() => onOpenWorkspace(selectedWorkspace.id, 'data')}>
                        Data
                      </Button>
                    </div>

                    <div className="space-y-2 rounded border border-border p-3">
                      <p className="text-xs uppercase tracking-wide text-muted-foreground">Manage</p>
                      <Input
                        value={renameInput}
                        onChange={(event) => setRenameInput(event.target.value)}
                        placeholder="Workspace name"
                      />
                      <Button type="button" variant="outline" className="w-full justify-start" onClick={onSaveRename}>
                        Save name
                      </Button>
                      <Button type="button" variant="outline" className="w-full justify-start" onClick={togglePinned}>
                        {selectedWorkspace.pinned ? 'Unpin workspace' : 'Pin workspace'}
                      </Button>
                      <Button type="button" variant="outline" className="w-full justify-start" onClick={toggleArchived}>
                        {selectedWorkspace.archived ? 'Restore from archive' : 'Archive workspace'}
                      </Button>
                    </div>
                  </>
                ) : (
                  <p className="text-sm text-muted-foreground">Select a workspace to view actions.</p>
                )}
              </div>
            </ScrollArea>
          </div>
        </aside>
      </div>

      <Sheet open={leftPanelOpen} onOpenChange={setLeftPanelOpen}>
        <SheetContent side="left" className="w-[290px] p-0 nav:hidden">
          <WorkspaceFiltersPanel
            query={query}
            onQueryChange={setQuery}
            viewMode={viewMode}
            onViewModeChange={setViewMode}
            filterKey={filterKey}
            onFilterKeyChange={setFilterKey}
            sortKey={sortKey}
            onSortKeyChange={setSortKey}
          />
        </SheetContent>
      </Sheet>
    </div>
  )
}

