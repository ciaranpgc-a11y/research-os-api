import { create } from 'zustand'

export type WorkspaceHealth = 'green' | 'amber' | 'red'

export type WorkspaceRecord = {
  id: string
  name: string
  version: string
  health: WorkspaceHealth
  updatedAt: string
  pinned: boolean
  archived: boolean
}

type WorkspaceStore = {
  workspaces: WorkspaceRecord[]
  activeWorkspaceId: string | null
  setActiveWorkspaceId: (workspaceId: string | null) => void
  ensureWorkspace: (workspaceId: string) => void
  createWorkspace: (name?: string) => WorkspaceRecord
  updateWorkspace: (
    workspaceId: string,
    patch: Partial<Pick<WorkspaceRecord, 'name' | 'health' | 'version' | 'updatedAt' | 'pinned' | 'archived'>>,
  ) => void
  deleteWorkspace: (workspaceId: string) => void
}

const WORKSPACES_STORAGE_KEY = 'aawe-workspaces'
const ACTIVE_WORKSPACE_STORAGE_KEY = 'aawe-active-workspace-id'

function nowIso(): string {
  return new Date().toISOString()
}

function defaultWorkspaces(): WorkspaceRecord[] {
  return [
    {
      id: 'hf-registry',
      name: 'HF Registry Manuscript',
      version: '0.1',
      health: 'amber',
      updatedAt: nowIso(),
      pinned: true,
      archived: false,
    },
  ]
}

function readStoredWorkspaces(): WorkspaceRecord[] {
  if (typeof window === 'undefined') {
    return defaultWorkspaces()
  }
  const raw = window.localStorage.getItem(WORKSPACES_STORAGE_KEY)
  if (!raw) {
    return defaultWorkspaces()
  }
  try {
    const parsed = JSON.parse(raw) as Array<Partial<WorkspaceRecord>>
    if (!Array.isArray(parsed) || parsed.length === 0) {
      return defaultWorkspaces()
    }
    return parsed.map((workspace) => ({
      id: (workspace.id || '').trim() || `workspace-${Date.now().toString(36)}`,
      name: (workspace.name || '').trim() || 'Workspace',
      version: (workspace.version || '').trim() || '0.1',
      health:
        workspace.health === 'green' || workspace.health === 'amber' || workspace.health === 'red'
          ? workspace.health
          : 'amber',
      updatedAt: (workspace.updatedAt || '').trim() || nowIso(),
      pinned: Boolean(workspace.pinned),
      archived: Boolean(workspace.archived),
    }))
  } catch {
    return defaultWorkspaces()
  }
}

function persistWorkspaces(workspaces: WorkspaceRecord[]): void {
  if (typeof window === 'undefined') {
    return
  }
  window.localStorage.setItem(WORKSPACES_STORAGE_KEY, JSON.stringify(workspaces))
}

function readStoredActiveWorkspaceId(workspaces: WorkspaceRecord[]): string | null {
  if (typeof window === 'undefined') {
    return workspaces[0]?.id ?? null
  }
  const raw = window.localStorage.getItem(ACTIVE_WORKSPACE_STORAGE_KEY)
  if (!raw) {
    return workspaces[0]?.id ?? null
  }
  if (workspaces.some((workspace) => workspace.id === raw)) {
    return raw
  }
  return workspaces[0]?.id ?? null
}

function persistActiveWorkspaceId(workspaceId: string | null): void {
  if (typeof window === 'undefined') {
    return
  }
  if (!workspaceId) {
    window.localStorage.removeItem(ACTIVE_WORKSPACE_STORAGE_KEY)
    return
  }
  window.localStorage.setItem(ACTIVE_WORKSPACE_STORAGE_KEY, workspaceId)
}

function slugifyWorkspaceName(value: string): string {
  const cleaned = value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
  return cleaned || `workspace-${Date.now()}`
}

const initialWorkspaces = readStoredWorkspaces()
const initialActiveWorkspaceId = readStoredActiveWorkspaceId(initialWorkspaces)

export const useWorkspaceStore = create<WorkspaceStore>((set, get) => ({
  workspaces: initialWorkspaces,
  activeWorkspaceId: initialActiveWorkspaceId,
  setActiveWorkspaceId: (workspaceId) => {
    persistActiveWorkspaceId(workspaceId)
    set({ activeWorkspaceId: workspaceId })
  },
  ensureWorkspace: (workspaceId) => {
    const cleanWorkspaceId = (workspaceId || '').trim()
    if (!cleanWorkspaceId) {
      return
    }
    const state = get()
    if (state.workspaces.some((workspace) => workspace.id === cleanWorkspaceId)) {
      if (state.activeWorkspaceId !== cleanWorkspaceId) {
        persistActiveWorkspaceId(cleanWorkspaceId)
        set({ activeWorkspaceId: cleanWorkspaceId })
      }
      return
    }
    const nextWorkspace: WorkspaceRecord = {
      id: cleanWorkspaceId,
      name: cleanWorkspaceId
        .split('-')
        .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
        .join(' '),
      version: '0.1',
      health: 'amber',
      updatedAt: nowIso(),
      pinned: false,
      archived: false,
    }
    const nextWorkspaces = [nextWorkspace, ...state.workspaces]
    persistWorkspaces(nextWorkspaces)
    persistActiveWorkspaceId(cleanWorkspaceId)
    set({
      workspaces: nextWorkspaces,
      activeWorkspaceId: cleanWorkspaceId,
    })
  },
  createWorkspace: (name) => {
    const cleanName = (name || '').trim() || 'New Workspace'
    const state = get()
    let baseId = slugifyWorkspaceName(cleanName)
    if (state.workspaces.some((workspace) => workspace.id === baseId)) {
      baseId = `${baseId}-${Date.now().toString(36)}`
    }
    const nextWorkspace: WorkspaceRecord = {
      id: baseId,
      name: cleanName,
      version: '0.1',
      health: 'amber',
      updatedAt: nowIso(),
      pinned: false,
      archived: false,
    }
    const nextWorkspaces = [nextWorkspace, ...state.workspaces]
    persistWorkspaces(nextWorkspaces)
    persistActiveWorkspaceId(nextWorkspace.id)
    set({
      workspaces: nextWorkspaces,
      activeWorkspaceId: nextWorkspace.id,
    })
    return nextWorkspace
  },
  updateWorkspace: (workspaceId, patch) => {
    const cleanWorkspaceId = (workspaceId || '').trim()
    if (!cleanWorkspaceId) {
      return
    }
    const state = get()
    const nextWorkspaces = state.workspaces.map((workspace) => {
      if (workspace.id !== cleanWorkspaceId) {
        return workspace
      }
      return {
        ...workspace,
        ...patch,
      }
    })
    persistWorkspaces(nextWorkspaces)
    set({ workspaces: nextWorkspaces })
  },
  deleteWorkspace: (workspaceId) => {
    const cleanWorkspaceId = (workspaceId || '').trim()
    if (!cleanWorkspaceId) {
      return
    }
    const state = get()
    const nextWorkspaces = state.workspaces.filter((workspace) => workspace.id !== cleanWorkspaceId)
    const nextActiveWorkspaceId =
      state.activeWorkspaceId === cleanWorkspaceId
        ? nextWorkspaces.find((workspace) => !workspace.archived)?.id || nextWorkspaces[0]?.id || null
        : state.activeWorkspaceId
    persistWorkspaces(nextWorkspaces)
    persistActiveWorkspaceId(nextActiveWorkspaceId)
    set({
      workspaces: nextWorkspaces,
      activeWorkspaceId: nextActiveWorkspaceId,
    })
  },
}))
