import { NavLink, useNavigate } from 'react-router-dom'

import { Button } from '@/components/ui/button'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Separator } from '@/components/ui/separator'
import { cn } from '@/lib/utils'
import { useWorkspaceStore, type WorkspaceHealth } from '@/store/use-workspace-store'

type WorkspaceNavigatorProps = {
  workspaceId: string
  onNavigate?: () => void
}

type WorkspaceNavGroup = {
  title: string
  items: Array<{ label: string; slug: string }>
}

const WORKSPACE_NAV_GROUPS: WorkspaceNavGroup[] = [
  {
    title: 'Workspace',
    items: [
      { label: 'Overview', slug: 'overview' },
      { label: 'Data', slug: 'data' },
      { label: 'Results', slug: 'results' },
      { label: 'Run Wizard', slug: 'run-wizard' },
      { label: 'Exports', slug: 'exports' },
    ],
  },
  {
    title: 'Manuscript',
    items: [
      { label: 'Introduction', slug: 'manuscript/introduction' },
      { label: 'Methods', slug: 'manuscript/methods' },
      { label: 'Results', slug: 'manuscript/results' },
      { label: 'Discussion', slug: 'manuscript/discussion' },
      { label: 'Conclusion', slug: 'manuscript/conclusion' },
      { label: 'Figures', slug: 'manuscript/figures' },
      { label: 'Tables', slug: 'manuscript/tables' },
    ],
  },
  {
    title: 'Governance',
    items: [
      { label: 'Quality Check', slug: 'qc' },
      { label: 'Claim Map', slug: 'claim-map' },
      { label: 'Version History', slug: 'versions' },
      { label: 'Audit Log', slug: 'audit' },
    ],
  },
]

function workspaceHealthClass(health: WorkspaceHealth): string {
  if (health === 'red') {
    return 'bg-red-500'
  }
  if (health === 'amber') {
    return 'bg-amber-500'
  }
  return 'bg-emerald-500'
}

export function WorkspaceNavigator({ workspaceId, onNavigate }: WorkspaceNavigatorProps) {
  const navigate = useNavigate()
  const workspaces = useWorkspaceStore((state) => state.workspaces)
  const activeWorkspaceId = useWorkspaceStore((state) => state.activeWorkspaceId)
  const setActiveWorkspaceId = useWorkspaceStore((state) => state.setActiveWorkspaceId)
  const createWorkspace = useWorkspaceStore((state) => state.createWorkspace)

  const activeWorkspace =
    workspaces.find((workspace) => workspace.id === workspaceId) ??
    workspaces.find((workspace) => workspace.id === activeWorkspaceId) ??
    null

  const onWorkspaceChange = (nextWorkspaceId: string) => {
    if (!nextWorkspaceId) {
      return
    }
    setActiveWorkspaceId(nextWorkspaceId)
    navigate(`/w/${nextWorkspaceId}/overview`)
    onNavigate?.()
  }

  const onCreateWorkspace = () => {
    const workspace = createWorkspace('New Workspace')
    navigate(`/w/${workspace.id}/overview`)
    onNavigate?.()
  }

  return (
    <aside className="flex h-full flex-col bg-card">
      <div className="space-y-3 border-b border-border p-4">
        <div className="flex items-center gap-2">
          <h1 className="text-sm font-semibold leading-tight">
            {activeWorkspace?.name ?? 'Workspace'}
          </h1>
          {activeWorkspace ? (
            <span
              className={cn('h-2.5 w-2.5 rounded-full', workspaceHealthClass(activeWorkspace.health))}
              title={`Workspace health: ${activeWorkspace.health}`}
            />
          ) : null}
        </div>
        <p className="text-xs text-muted-foreground">Version {activeWorkspace?.version ?? '0.1'}</p>
        <div className="space-y-2">
          <label className="text-micro uppercase tracking-wide text-muted-foreground">Workspace</label>
          <select
            value={workspaceId}
            onChange={(event) => onWorkspaceChange(event.target.value)}
            className="h-9 w-full rounded-md border border-input bg-background px-2 text-sm"
          >
            {workspaces.map((workspace) => (
              <option key={workspace.id} value={workspace.id}>
                {workspace.name}
              </option>
            ))}
          </select>
          <Button type="button" size="sm" variant="outline" className="w-full" onClick={onCreateWorkspace}>
            Create new workspace
          </Button>
        </div>
      </div>
      <ScrollArea className="flex-1">
        <div className="space-y-4 p-3">
          {WORKSPACE_NAV_GROUPS.map((group, index) => (
            <section key={group.title} className="space-y-2.5">
              <p className="px-2 text-xs font-medium uppercase tracking-wider text-muted-foreground">
                {group.title}
              </p>
              <nav className="space-y-1">
                {group.items.map((item) => {
                  const path = `/w/${workspaceId}/${item.slug}`
                  return (
                    <NavLink
                      key={path}
                      to={path}
                      onClick={onNavigate}
                      className={({ isActive }) =>
                        cn(
                          'block rounded-md border border-transparent px-2.5 py-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground',
                          isActive && 'border-border bg-accent/50 text-foreground font-medium',
                        )
                      }
                    >
                      {item.label}
                    </NavLink>
                  )
                })}
              </nav>
              {index < WORKSPACE_NAV_GROUPS.length - 1 ? <Separator /> : null}
            </section>
          ))}
        </div>
      </ScrollArea>
    </aside>
  )
}
