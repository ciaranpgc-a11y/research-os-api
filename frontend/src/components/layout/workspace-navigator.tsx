import { NavLink, useNavigate } from 'react-router-dom'

import { ScrollArea } from '@/components/ui/scroll-area'
import { Select } from '@/components/ui/select'
import { Separator } from '@/components/ui/separator'
import { houseLayout, houseNavigation, houseSurfaces, houseTypography } from '@/lib/house-style'
import { getHouseLeftBorderToneClass, getHouseNavToneClass, type HouseSectionTone } from '@/lib/section-tone'
import { cn } from '@/lib/utils'
import { useWorkspaceStore, type WorkspaceHealth } from '@/store/use-workspace-store'

type WorkspaceNavigatorProps = {
  workspaceId: string
  onNavigate?: () => void
}

type WorkspaceNavGroup = {
  title: string
  tone: HouseSectionTone
  items: Array<{ label: string; slug: string }>
}

const WORKSPACE_NAV_GROUPS: WorkspaceNavGroup[] = [
  {
    title: 'Workspace',
    tone: 'workspace',
    items: [
      { label: 'Overview', slug: 'overview' },
      { label: 'Inbox', slug: 'inbox' },
      { label: 'Data', slug: 'data' },
      { label: 'Results', slug: 'results' },
      { label: 'Run Wizard', slug: 'run-wizard' },
      { label: 'Exports', slug: 'exports' },
    ],
  },
  {
    title: 'Manuscript',
    tone: 'manuscript',
    items: [
      { label: 'Title', slug: 'manuscript/title' },
      { label: 'Abstract', slug: 'manuscript/abstract' },
      { label: 'Introduction', slug: 'manuscript/introduction' },
      { label: 'Methods', slug: 'manuscript/methods' },
      { label: 'Results', slug: 'manuscript/results' },
      { label: 'Discussion', slug: 'manuscript/discussion' },
      { label: 'Conclusion', slug: 'manuscript/conclusion' },
      { label: 'Figures', slug: 'manuscript/figures' },
      { label: 'Tables', slug: 'manuscript/tables' },
      { label: 'References', slug: 'manuscript/references' },
      { label: 'Supplementary Materials', slug: 'manuscript/supplementary-materials' },
      { label: 'Declarations', slug: 'manuscript/declarations' },
    ],
  },
  {
    title: 'Governance',
    tone: 'governance',
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

  return (
    <aside className={cn(houseLayout.sidebarFrame, houseLayout.sidebar)}>
      <div className={houseLayout.sidebarHeader}>
        <div className={cn(houseLayout.pageHeader, houseSurfaces.leftBorder, getHouseLeftBorderToneClass('workspace'))}>
          <div className="flex items-center gap-2">
            <h1 className={houseTypography.sectionTitle}>
              {activeWorkspace?.name ?? 'Workspace'}
            </h1>
            {activeWorkspace ? (
              <span
                className={cn('h-2.5 w-2.5 rounded-full', workspaceHealthClass(activeWorkspace.health))}
                title={`Workspace health: ${activeWorkspace.health}`}
              />
            ) : null}
          </div>
          <p className={houseTypography.fieldHelper}>Version {activeWorkspace?.version ?? '0.1'}</p>
        </div>
        <div className={houseLayout.sidebarSection}>
          <label className={houseNavigation.sectionLabel}>Workspace</label>
          <Select
            size="sm"
            value={workspaceId}
            onChange={(event) => onWorkspaceChange(event.target.value)}
          >
            {workspaces.map((workspace) => (
              <option key={workspace.id} value={workspace.id}>
                {workspace.name}
              </option>
            ))}
          </Select>
        </div>
      </div>
      <ScrollArea className={houseLayout.sidebarScroll}>
        <div className="space-y-4 p-3">
          {WORKSPACE_NAV_GROUPS.map((group, index) => (
            <section key={group.title} className="space-y-2.5">
              <p className={houseNavigation.sectionLabel}>
                {group.title}
              </p>
              <nav className={houseNavigation.list}>
                {group.items.map((item) => {
                  const path = `/w/${workspaceId}/${item.slug}`
                  return (
                    <NavLink
                      key={path}
                      to={path}
                      onClick={onNavigate}
                      className={({ isActive }) =>
                        cn(
                          houseNavigation.item,
                          getHouseNavToneClass(group.tone),
                          isActive && houseNavigation.itemActive,
                        )
                      }
                    >
                      <span className={houseNavigation.itemLabel}>{item.label}</span>
                    </NavLink>
                  )
                })}
              </nav>
              {index < WORKSPACE_NAV_GROUPS.length - 1 ? <Separator className="house-nav-section-separator" /> : null}
            </section>
          ))}
        </div>
      </ScrollArea>
    </aside>
  )
}
