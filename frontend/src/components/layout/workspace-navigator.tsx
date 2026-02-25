import { useEffect, useState } from 'react'
import { NavLink, useNavigate } from 'react-router-dom'

import { Button } from '@/components/ui/button'
import {
  WORKSPACE_OWNER_REQUIRED_MESSAGE,
  readWorkspaceOwnerNameFromProfile,
} from '@/lib/workspace-owner'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Separator } from '@/components/ui/separator'
import { houseForms, houseLayout, houseNavigation, houseSurfaces, houseTypography } from '@/lib/house-style'
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
      { label: 'Inbox', slug: 'inbox' },
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
  const [workspaceOwnerName, setWorkspaceOwnerName] = useState<string | null>(() =>
    readWorkspaceOwnerNameFromProfile(),
  )
  const [createError, setCreateError] = useState('')

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
    if (!workspaceOwnerName) {
      setCreateError(WORKSPACE_OWNER_REQUIRED_MESSAGE)
      return
    }
    try {
      const workspace = createWorkspace('New Workspace')
      setCreateError('')
      navigate(`/w/${workspace.id}/overview`)
      onNavigate?.()
    } catch (createWorkspaceError) {
      setCreateError(
        createWorkspaceError instanceof Error
          ? createWorkspaceError.message
          : WORKSPACE_OWNER_REQUIRED_MESSAGE,
      )
    }
  }

  return (
    <aside className={cn('flex h-full flex-col', houseLayout.sidebar)}>
      <div className={houseLayout.sidebarHeader}>
        <div className={cn(houseLayout.pageHeader, houseSurfaces.leftBorder)}>
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
          <select
            value={workspaceId}
            onChange={(event) => onWorkspaceChange(event.target.value)}
            className={cn('h-9 w-full rounded-md px-2 text-sm', houseForms.select)}
          >
            {workspaces.map((workspace) => (
              <option key={workspace.id} value={workspace.id}>
                {workspace.name}
              </option>
            ))}
          </select>
          <Button
            type="button"
            size="sm"
            className={cn('w-full', houseForms.actionButton, houseTypography.buttonText)}
            onClick={onCreateWorkspace}
            disabled={!workspaceOwnerName}
          >
            Create new workspace
          </Button>
          {!workspaceOwnerName ? (
            <p className="text-xs text-muted-foreground">{WORKSPACE_OWNER_REQUIRED_MESSAGE}</p>
          ) : null}
          {createError ? (
            <p className="text-xs text-red-700">{createError}</p>
          ) : null}
        </div>
      </div>
      <ScrollArea className="flex-1">
        <div className="space-y-4 p-3">
          {WORKSPACE_NAV_GROUPS.map((group, index) => (
            <section key={group.title} className="space-y-2.5">
              <p className={houseNavigation.sectionLabel}>
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
                          houseNavigation.item,
                          isActive && houseNavigation.itemActive,
                        )
                      }
                    >
                      <span className="truncate pl-2">{item.label}</span>
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
