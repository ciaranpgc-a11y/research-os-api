import type { ReactElement } from 'react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'

import { AccountLayout } from '@/components/layout/account-layout'
import { WorkspaceLayout } from '@/components/layout/workspace-layout'

type StandaloneShellProps = {
  initialEntry: string
  path: string
  element: ReactElement
}

type AccountShellProps = {
  initialEntry: string
  path: string
  element: ReactElement
}

type WorkspaceShellProps = {
  initialEntry: string
  nestedPath: string
  element: ReactElement
}

export function StandaloneRouteShell({ initialEntry, path, element }: StandaloneShellProps) {
  return (
    <MemoryRouter initialEntries={[initialEntry]}>
      <Routes>
        <Route path={path} element={element} />
      </Routes>
    </MemoryRouter>
  )
}

export function AccountRouteShell({ initialEntry, path, element }: AccountShellProps) {
  return (
    <MemoryRouter initialEntries={[initialEntry]}>
      <Routes>
        <Route element={<AccountLayout />}>
          <Route path={path} element={element} />
        </Route>
      </Routes>
    </MemoryRouter>
  )
}

export function WorkspaceRouteShell({ initialEntry, nestedPath, element }: WorkspaceShellProps) {
  return (
    <MemoryRouter initialEntries={[initialEntry]}>
      <Routes>
        <Route path="/w/:workspaceId" element={<WorkspaceLayout />}>
          <Route path={nestedPath} element={element} />
        </Route>
      </Routes>
    </MemoryRouter>
  )
}
