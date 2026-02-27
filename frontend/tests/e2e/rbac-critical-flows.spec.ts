import { expect, test, type Page, type Route } from '@playwright/test'

type WorkspaceRecord = {
  id: string
  name: string
  owner_name: string
  collaborators: string[]
  pending_collaborators: string[]
  collaborator_roles: Record<string, 'editor' | 'reviewer' | 'viewer'>
  pending_collaborator_roles: Record<string, 'editor' | 'reviewer' | 'viewer'>
  removed_collaborators: string[]
  version: string
  health: 'green' | 'amber' | 'red'
  updated_at: string
  pinned: boolean
  archived: boolean
  audit_log_entries: Array<{
    id: string
    workspace_id: string
    category: 'collaborator_changes' | 'invitation_decisions'
    message: string
    created_at: string
    actor?: string | null
    action?: string | null
    target_type?: string | null
    target_id?: string | null
    outcome?: 'allowed' | 'denied' | null
  }>
}

type AuthorRequest = {
  id: string
  workspace_id: string
  workspace_name: string
  author_name: string
  collaborator_role: 'editor' | 'reviewer' | 'viewer'
  invited_at: string
  source_inviter_user_id?: string
  source_invitation_id?: string
}

type InvitationSent = {
  id: string
  token: string
  workspace_id: string
  workspace_name: string
  invitee_name: string
  role: 'editor' | 'reviewer' | 'viewer'
  invited_at: string
  status: 'pending' | 'accepted' | 'declined'
}

type LibraryAsset = {
  id: string
  owner_user_id: string
  owner_name: string
  project_id: string
  filename: string
  kind: string
  mime_type: string
  byte_size: number
  uploaded_at: string
  shared_with_user_ids: string[]
  shared_with: Array<{ user_id: string; name: string }>
  can_manage_access: boolean
  is_available: boolean
}

type MockState = {
  sessionToken: string
  me: Record<string, unknown>
  workspaces: WorkspaceRecord[]
  activeWorkspaceId: string | null
  authorRequests: AuthorRequest[]
  invitationsSent: InvitationSent[]
  inboxState: { messages: Array<Record<string, unknown>>; reads: Record<string, Record<string, string>> }
  libraryAssets: LibraryAsset[]
  assetAuditLogs: Record<string, Array<Record<string, unknown>>>
}

function nowIso() {
  return new Date().toISOString()
}

function withSession(page: Page, token: string) {
  return page.addInitScript((value) => {
    window.localStorage.setItem('aawe-impact-session-token', value)
    window.sessionStorage.setItem('aawe-impact-session-token', value)
  }, token)
}

function okJson(route: Route, payload: unknown) {
  return route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify(payload),
  })
}

async function installMockApi(page: Page, state: MockState) {
  await page.route('**/v1/**', async (route) => {
    const request = route.request()
    const method = request.method().toUpperCase()
    const url = new URL(request.url())
    const path = url.pathname

    if (path === '/v1/auth/login' && method === 'POST') {
      return okJson(route, { session_token: state.sessionToken, user: state.me })
    }
    if (path === '/v1/auth/login/challenge' && method === 'POST') {
      return okJson(route, {
        status: 'authenticated',
        session: {
          session_token: state.sessionToken,
          user: state.me,
        },
      })
    }
    if (path === '/v1/auth/me' && method === 'GET') {
      return okJson(route, state.me)
    }

    if (path === '/v1/workspaces' && method === 'GET') {
      return okJson(route, { items: state.workspaces, active_workspace_id: state.activeWorkspaceId })
    }
    if (path === '/v1/workspaces/active' && method === 'PUT') {
      const payload = JSON.parse(request.postData() || '{}') as { workspace_id?: string | null }
      state.activeWorkspaceId = String(payload.workspace_id || '').trim() || null
      return okJson(route, { active_workspace_id: state.activeWorkspaceId })
    }

    if (path.startsWith('/v1/workspaces/') && path.split('/').length === 4 && method === 'PATCH') {
      const workspaceId = decodeURIComponent(path.split('/')[3] || '')
      const patch = JSON.parse(request.postData() || '{}') as Partial<WorkspaceRecord>
      const index = state.workspaces.findIndex((item) => item.id === workspaceId)
      if (index < 0) {
        return route.fulfill({
          status: 404,
          contentType: 'application/json',
          body: JSON.stringify({ error: { detail: `Workspace '${workspaceId}' was not found.` } }),
        })
      }
      state.workspaces[index] = {
        ...state.workspaces[index],
        ...patch,
        updated_at: nowIso(),
      }
      return okJson(route, state.workspaces[index])
    }

    if (path === '/v1/workspaces/author-requests' && method === 'GET') {
      return okJson(route, { items: state.authorRequests })
    }
    if (path.startsWith('/v1/workspaces/author-requests/') && path.endsWith('/accept') && method === 'POST') {
      const requestId = decodeURIComponent(path.split('/')[4] || '')
      const index = state.authorRequests.findIndex((item) => item.id === requestId)
      if (index < 0) {
        return route.fulfill({ status: 404, contentType: 'application/json', body: JSON.stringify({ error: { detail: 'Request not found.' } }) })
      }
      const item = state.authorRequests[index]
      state.authorRequests.splice(index, 1)
      const workspace: WorkspaceRecord = {
        id: item.workspace_id,
        name: item.workspace_name,
        owner_name: item.author_name,
        collaborators: ['Pending A'],
        pending_collaborators: [],
        collaborator_roles: { 'Pending A': item.collaborator_role },
        pending_collaborator_roles: {},
        removed_collaborators: [],
        version: '0.1',
        health: 'amber',
        updated_at: nowIso(),
        pinned: false,
        archived: false,
        audit_log_entries: [],
      }
      if (!state.workspaces.find((entry) => entry.id === workspace.id)) {
        state.workspaces.unshift(workspace)
      }
      state.activeWorkspaceId = workspace.id
      return okJson(route, { workspace, removed_request_id: requestId })
    }
    if (path.startsWith('/v1/workspaces/author-requests/') && path.endsWith('/decline') && method === 'POST') {
      const requestId = decodeURIComponent(path.split('/')[4] || '')
      state.authorRequests = state.authorRequests.filter((item) => item.id !== requestId)
      return okJson(route, { success: true, removed_request_id: requestId })
    }

    if (path === '/v1/workspaces/invitations/sent' && method === 'GET') {
      return okJson(route, { items: state.invitationsSent })
    }
    if (path === '/v1/workspaces/invitations/sent' && method === 'POST') {
      const payload = JSON.parse(request.postData() || '{}') as {
        workspace_id: string
        invitee_name: string
        role: 'editor' | 'reviewer' | 'viewer'
      }
      const invitation: InvitationSent = {
        id: `invite-${Date.now()}`,
        token: `invite-${Date.now()}`,
        workspace_id: payload.workspace_id,
        workspace_name: state.workspaces.find((item) => item.id === payload.workspace_id)?.name || payload.workspace_id,
        invitee_name: payload.invitee_name,
        role: payload.role,
        invited_at: nowIso(),
        status: 'pending',
      }
      state.invitationsSent.unshift(invitation)
      return okJson(route, invitation)
    }
    if (path.startsWith('/v1/workspaces/invitations/sent/') && method === 'PATCH') {
      const invitationId = decodeURIComponent(path.split('/')[5] || '')
      const payload = JSON.parse(request.postData() || '{}') as { status: 'pending' | 'accepted' | 'declined' }
      const target = state.invitationsSent.find((item) => item.id === invitationId)
      if (!target) {
        return route.fulfill({ status: 404, contentType: 'application/json', body: JSON.stringify({ error: { detail: 'Invitation not found.' } }) })
      }
      target.status = payload.status
      return okJson(route, target)
    }

    if (path === '/v1/workspaces/inbox/state' && method === 'GET') {
      return okJson(route, state.inboxState)
    }
    if (path === '/v1/workspaces/inbox/state' && method === 'PUT') {
      const payload = JSON.parse(request.postData() || '{}') as MockState['inboxState']
      state.inboxState = payload
      return okJson(route, state.inboxState)
    }
    if (path === '/v1/workspaces/inbox/messages' && method === 'GET') {
      return okJson(route, { items: [] })
    }
    if (path === '/v1/workspaces/inbox/messages' && method === 'POST') {
      const payload = JSON.parse(request.postData() || '{}') as Record<string, unknown>
      return okJson(route, {
        id: payload.id || `msg-${Date.now()}`,
        workspace_id: payload.workspace_id,
        sender_name: payload.sender_name,
        encrypted_body: payload.encrypted_body,
        iv: payload.iv,
        created_at: payload.created_at || nowIso(),
      })
    }
    if (path === '/v1/workspaces/inbox/reads' && method === 'GET') {
      return okJson(route, { reads: state.inboxState.reads })
    }
    if (path === '/v1/workspaces/inbox/reads' && method === 'PUT') {
      const payload = JSON.parse(request.postData() || '{}') as { workspace_id: string; reader_name: string; read_at?: string }
      const key = payload.workspace_id
      const reader = String(payload.reader_name || '').trim().toLowerCase()
      if (!state.inboxState.reads[key]) {
        state.inboxState.reads[key] = {}
      }
      state.inboxState.reads[key][reader] = payload.read_at || nowIso()
      return okJson(route, { workspace_id: key, reader_key: reader, read_at: state.inboxState.reads[key][reader] })
    }

    if (path === '/v1/library/assets' && method === 'GET') {
      const projectId = String(url.searchParams.get('project_id') || '').trim()
      const filtered = projectId ? state.libraryAssets.filter((item) => item.project_id === projectId) : state.libraryAssets
      return okJson(route, {
        items: filtered,
        page: 1,
        page_size: 50,
        total: filtered.length,
        has_more: false,
        sort_by: 'uploaded_at',
        sort_direction: 'desc',
        query: '',
        ownership: 'all',
      })
    }

    if (path.startsWith('/v1/library/assets/') && path.endsWith('/audit-logs') && method === 'GET') {
      const assetId = decodeURIComponent(path.split('/')[4] || '')
      return okJson(route, { items: state.assetAuditLogs[assetId] || [] })
    }
    if (path.startsWith('/v1/library/assets/') && path.endsWith('/audit-logs') && method === 'POST') {
      const assetId = decodeURIComponent(path.split('/')[4] || '')
      const payload = JSON.parse(request.postData() || '{}') as Record<string, unknown>
      const entry = {
        id: `log-${Date.now()}`,
        asset_id: assetId,
        collaborator_name: payload.collaborator_name || 'Unknown',
        collaborator_key: String(payload.collaborator_name || 'unknown').toLowerCase(),
        collaborator_user_id: payload.collaborator_user_id || null,
        actor_name: state.me.name || 'Unknown',
        actor_user_id: state.me.id || null,
        category: payload.category || 'other',
        from_label: payload.from_label || null,
        to_label: payload.to_label || 'Updated',
        created_at: nowIso(),
      }
      if (!state.assetAuditLogs[assetId]) {
        state.assetAuditLogs[assetId] = []
      }
      state.assetAuditLogs[assetId].unshift(entry)
      return okJson(route, entry)
    }

    if (path.startsWith('/v1/library/assets/') && path.endsWith('/access') && method === 'PATCH') {
      const assetId = decodeURIComponent(path.split('/')[4] || '')
      const payload = JSON.parse(request.postData() || '{}') as {
        collaborator_user_ids?: string[]
      }
      const target = state.libraryAssets.find((item) => item.id === assetId)
      if (!target) {
        return route.fulfill({ status: 404, contentType: 'application/json', body: JSON.stringify({ error: { detail: 'Asset not found.' } }) })
      }
      target.shared_with_user_ids = payload.collaborator_user_ids || []
      return okJson(route, target)
    }

    if (path.startsWith('/v1/library/assets/') && path.split('/').length === 5 && method === 'PATCH') {
      const assetId = decodeURIComponent(path.split('/')[4] || '')
      const payload = JSON.parse(request.postData() || '{}') as { filename?: string }
      const target = state.libraryAssets.find((item) => item.id === assetId)
      if (!target) {
        return route.fulfill({ status: 404, contentType: 'application/json', body: JSON.stringify({ error: { detail: 'Asset not found.' } }) })
      }
      target.filename = String(payload.filename || target.filename)
      return okJson(route, target)
    }

    if (path.startsWith('/v1/library/assets/') && path.endsWith('/download') && method === 'GET') {
      return route.fulfill({
        status: 200,
        contentType: 'text/csv',
        body: 'id,value\n1,1\n',
      })
    }

    return okJson(route, {})
  })
}

function workspace(
  id: string,
  name: string,
  owner: string,
  collaborators: Array<{ name: string; role: 'editor' | 'reviewer' | 'viewer' }> = [],
): WorkspaceRecord {
  return {
    id,
    name,
    owner_name: owner,
    collaborators: collaborators.map((item) => item.name),
    pending_collaborators: [],
    collaborator_roles: Object.fromEntries(collaborators.map((item) => [item.name, item.role])),
    pending_collaborator_roles: {},
    removed_collaborators: [],
    version: '0.1',
    health: 'amber',
    updated_at: nowIso(),
    pinned: id === 'workspace-a',
    archived: false,
    audit_log_entries: [],
  }
}

test('login flow authenticates and redirects into account area', async ({ page }) => {
  const state: MockState = {
    sessionToken: 'rbac-login-token',
    me: {
      id: 'owner-a-id',
      email: 'owner-a@example.com',
      name: 'Owner A',
      role: 'user',
      is_active: true,
      email_verified_at: nowIso(),
    },
    workspaces: [],
    activeWorkspaceId: null,
    authorRequests: [],
    invitationsSent: [],
    inboxState: { messages: [], reads: {} },
    libraryAssets: [],
    assetAuditLogs: {},
  }
  await installMockApi(page, state)

  await page.goto('/auth')
  await page.getByPlaceholder('email@address.com').fill('owner-a@example.com')
  await page.getByPlaceholder('Enter your password').fill('StrongPassword123')
  await page.getByRole('button', { name: /^sign in$/i }).click()

  await expect(page).toHaveURL(/\/profile/)
})

test('owner flow supports workspace switch, data library view, and allowed role edits', async ({ page }) => {
  const state: MockState = {
    sessionToken: 'rbac-owner-token',
    me: {
      id: 'owner-a-id',
      email: 'owner-a@example.com',
      name: 'Owner A',
      role: 'user',
      is_active: true,
      email_verified_at: nowIso(),
    },
    workspaces: [
      workspace('workspace-a', 'Workspace A', 'Owner A', [
        { name: 'Editor A', role: 'reviewer' },
        { name: 'Viewer A', role: 'viewer' },
      ]),
      workspace('workspace-b', 'Workspace B', 'Owner A', [
        { name: 'Editor B', role: 'reviewer' },
      ]),
    ],
    activeWorkspaceId: 'workspace-a',
    authorRequests: [],
    invitationsSent: [],
    inboxState: { messages: [], reads: {} },
    libraryAssets: [
      {
        id: 'asset-a',
        owner_user_id: 'owner-a-id',
        owner_name: 'Owner A',
        project_id: 'project-a',
        filename: 'workspace-a-dataset.csv',
        kind: 'csv',
        mime_type: 'text/csv',
        byte_size: 128,
        uploaded_at: nowIso(),
        shared_with_user_ids: ['editor-a-id', 'viewer-a-id'],
        shared_with: [
          { user_id: 'editor-a-id', name: 'Editor A' },
          { user_id: 'viewer-a-id', name: 'Viewer A' },
        ],
        can_manage_access: true,
        is_available: true,
      },
    ],
    assetAuditLogs: { 'asset-a': [] },
  }

  await installMockApi(page, state)
  await withSession(page, state.sessionToken)
  await page.goto('/workspaces')

  await expect(page.getByRole('heading', { name: 'Workspaces', exact: true })).toBeVisible()
  await page.getByText('Workspace B', { exact: false }).first().click()
  await page.getByRole('button', { name: /Open Workspace B Workspace/i }).click()
  await expect(page).toHaveURL(/\/w\/workspace-b\/overview/)

  await page.goto('/workspaces')
  await page.getByText('Workspace A', { exact: false }).first().click()
  await page.getByRole('button', { name: /Open Workspace A Workspace/i }).click()
  await page.goto('/workspaces')
  await page.getByText('Workspace A', { exact: false }).first().click()
  await page.getByLabel('Show users tab').click()

  await page.getByRole('button', { name: /Data library/i }).click()
  await expect(page.getByRole('heading', { name: 'Data library' }).first()).toBeVisible()
  await expect(page.getByText('workspace-a-dataset', { exact: false }).first()).toBeVisible()
})

test('invitation accept flow works and viewer role hides management controls', async ({ page }) => {
  const state: MockState = {
    sessionToken: 'rbac-invitee-token',
    me: {
      id: 'pending-a-id',
      email: 'pending-a@example.com',
      name: 'Pending A',
      role: 'user',
      is_active: true,
      email_verified_at: nowIso(),
    },
    workspaces: [
      workspace('workspace-v', 'Workspace Viewer', 'Owner V', [
        { name: 'Pending A', role: 'viewer' },
      ]),
    ],
    activeWorkspaceId: 'workspace-v',
    authorRequests: [
      {
        id: 'request-1',
        workspace_id: 'workspace-a',
        workspace_name: 'Workspace A',
        author_name: 'Owner A',
        collaborator_role: 'reviewer',
        invited_at: nowIso(),
        source_inviter_user_id: 'owner-a-id',
        source_invitation_id: 'invite-1',
      },
    ],
    invitationsSent: [],
    inboxState: { messages: [], reads: {} },
    libraryAssets: [
      {
        id: 'asset-v',
        owner_user_id: 'owner-v-id',
        owner_name: 'Owner V',
        project_id: 'project-v',
        filename: 'viewer-only.csv',
        kind: 'csv',
        mime_type: 'text/csv',
        byte_size: 96,
        uploaded_at: nowIso(),
        shared_with_user_ids: ['pending-a-id'],
        shared_with: [{ user_id: 'pending-a-id', name: 'Pending A' }],
        can_manage_access: false,
        is_available: true,
      },
    ],
    assetAuditLogs: { 'asset-v': [] },
  }

  await installMockApi(page, state)
  await withSession(page, state.sessionToken)
  await page.goto('/workspaces')

  await page.getByRole('button', { name: /Invitations/i }).click()
  await page.getByRole('button', { name: 'Accept' }).click()
  await expect(page.getByText('Workspace A')).toBeVisible()

  await page.goto('/workspaces')
  await page.getByText('Workspace A', { exact: false }).first().click()
  await page.getByRole('button', { name: /Open Workspace A Workspace/i }).click()
  await page.goto('/workspaces')
  await page.getByText('Workspace A', { exact: false }).first().click()
  await expect(page.getByLabel(/^Edit role for /)).toHaveCount(0)

  await page.getByRole('button', { name: /Data library/i }).click()
  await expect(page.getByText('viewer-only', { exact: false }).first()).toBeVisible()
  await expect(page.getByLabel('Toggle add collaborator')).toHaveCount(0)
})
