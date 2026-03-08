import { HttpResponse, http } from 'msw'
import type { CollaboratorPayload } from '@/types/impact'

import {
  publicationsMetricsEmptyFixture,
  publicationsMetricsHappyFixture,
} from '@/mocks/fixtures/publications-metrics'
import {
  buildPagesReviewClaimCitationState,
  pagesReviewCitationLibrary,
  pagesReviewCollaborationSummary,
  pagesReviewCollaborators,
  pagesReviewJournalOptions,
  pagesReviewLibraryAssets,
  pagesReviewLibraryAssetsListPayload,
  pagesReviewTimestamp,
  pagesReviewUser,
  pagesReviewWorkspaceAccountSearchResults,
  pagesReviewWorkspaceApiListPayload,
  pagesReviewWorkspaceAuthorRequestsApiPayload,
  pagesReviewWorkspaceInboxMessagesApiPayload,
  pagesReviewWorkspaceInboxReadsApiPayload,
  pagesReviewWorkspaceInvitationsApiPayload,
  pagesReviewWorkspaceRunContext,
  PAGES_REVIEW_COLLAB_MODE_KEY,
  PAGES_REVIEW_LIBRARY_MODE_KEY,
  PAGES_REVIEW_RUN_CONTEXT_MODE_KEY,
  resolvePagesReviewMockMode,
} from '@/mocks/fixtures/pages-review'

const metricsPath = '*/v1/publications/metrics'

type MetricsMockMode = 'happy' | 'empty' | 'error'

function resolveMetricsMode(value: unknown): MetricsMockMode {
  const normalized = String(value || 'happy').trim().toLowerCase()
  if (normalized === 'empty' || normalized === 'error' || normalized === 'happy') {
    return normalized
  }
  return 'happy'
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms)
  })
}

function resolveMockCurrentUserId(): string {
  if (typeof window === 'undefined') {
    return pagesReviewUser.id
  }
  try {
    const raw = window.localStorage.getItem('aawe_integrations_user_cache')
    const parsed = raw ? JSON.parse(raw) as { id?: unknown } : null
    const currentUserId = String(parsed?.id || '').trim()
    return currentUserId || pagesReviewUser.id
  } catch {
    return pagesReviewUser.id
  }
}

function sortByUploadedAt(records: typeof pagesReviewLibraryAssets, direction: 'asc' | 'desc') {
  return [...records].sort((left, right) => {
    const delta = Date.parse(left.uploaded_at) - Date.parse(right.uploaded_at)
    return direction === 'asc' ? delta : -delta
  })
}

function sortByFilename(records: typeof pagesReviewLibraryAssets, direction: 'asc' | 'desc') {
  return [...records].sort((left, right) => {
    const delta = left.filename.localeCompare(right.filename)
    return direction === 'asc' ? delta : -delta
  })
}

function sortBySize(records: typeof pagesReviewLibraryAssets, direction: 'asc' | 'desc') {
  return [...records].sort((left, right) => {
    const delta = left.byte_size - right.byte_size
    return direction === 'asc' ? delta : -delta
  })
}

function sortByOwner(records: typeof pagesReviewLibraryAssets, direction: 'asc' | 'desc') {
  return [...records].sort((left, right) => {
    const leftValue = String(left.owner_name || '').toLowerCase()
    const rightValue = String(right.owner_name || '').toLowerCase()
    const delta = leftValue.localeCompare(rightValue)
    return direction === 'asc' ? delta : -delta
  })
}

function listLibraryAssetsForRequest(request: Request) {
  const url = new URL(request.url)
  const query = String(url.searchParams.get('query') || '').trim().toLowerCase()
  const ownership = String(url.searchParams.get('ownership') || 'all').trim().toLowerCase()
  const scope = String(url.searchParams.get('scope') || 'all').trim().toLowerCase()
  const sortBy = String(url.searchParams.get('sort_by') || 'uploaded_at').trim().toLowerCase()
  const sortDirection = String(url.searchParams.get('sort_direction') || 'desc').trim().toLowerCase() === 'asc' ? 'asc' : 'desc'
  const page = Math.max(1, Number(url.searchParams.get('page') || '1'))
  const pageSize = Math.max(1, Math.min(200, Number(url.searchParams.get('page_size') || '25')))

  const currentUserId = resolveMockCurrentUserId()
  let items = pagesReviewLibraryAssets
    .map((item) => applyMockLibraryAssetCapabilities(item, currentUserId))
    .filter((item) => item.current_user_role)
  if (ownership === 'owned') {
    items = items.filter((item) => item.owner_user_id === currentUserId)
  } else if (ownership === 'shared') {
    items = items.filter((item) => item.owner_user_id !== currentUserId)
  }
  if (scope === 'active') {
    items = items.filter((item) => item.archived_for_current_user !== true)
  } else if (scope === 'archived') {
    items = items.filter((item) => item.archived_for_current_user === true)
  }
  if (query) {
    items = items.filter((item) => {
      const haystack = [
        item.filename,
        item.kind,
        String(item.owner_name || ''),
      ]
        .join(' ')
        .toLowerCase()
      return haystack.includes(query)
    })
  }

  if (sortBy === 'filename') {
    items = sortByFilename(items, sortDirection)
  } else if (sortBy === 'byte_size') {
    items = sortBySize(items, sortDirection)
  } else if (sortBy === 'owner_name') {
    items = sortByOwner(items, sortDirection)
  } else {
    items = sortByUploadedAt(items, sortDirection)
  }

  const total = items.length
  const start = (page - 1) * pageSize
  const paged = items.slice(start, start + pageSize)
  return {
    ...pagesReviewLibraryAssetsListPayload,
    items: paged,
    page,
    page_size: pageSize,
    total,
    has_more: start + pageSize < total,
    sort_by: sortBy === 'filename' || sortBy === 'byte_size' || sortBy === 'owner_name' ? sortBy : 'uploaded_at',
    sort_direction: sortDirection,
    query,
    ownership: ownership === 'owned' || ownership === 'shared' ? ownership : 'all',
    scope: scope === 'active' || scope === 'archived' ? scope : 'all',
  }
}

function listCollaboratorsForRequest(request: Request) {
  const url = new URL(request.url)
  const query = String(url.searchParams.get('query') || '').trim().toLowerCase()
  const sort = String(url.searchParams.get('sort') || 'name').trim().toLowerCase()
  const page = Math.max(1, Number(url.searchParams.get('page') || '1'))
  const pageSize = Math.max(1, Math.min(200, Number(url.searchParams.get('page_size') || '50')))

  let items = [...pagesReviewCollaborators]
  if (query) {
    items = items.filter((item) => {
      const haystack = [
        item.full_name,
        String(item.primary_institution || ''),
        String(item.country || ''),
      ]
        .join(' ')
        .toLowerCase()
      return haystack.includes(query)
    })
  }

  if (sort === 'strength') {
    items.sort((left, right) => right.metrics.collaboration_strength_score - left.metrics.collaboration_strength_score)
  } else if (sort === 'recent') {
    items.sort((left, right) => Date.parse(right.updated_at) - Date.parse(left.updated_at))
  } else {
    items.sort((left, right) => left.full_name.localeCompare(right.full_name))
  }

  const total = items.length
  const start = (page - 1) * pageSize
  const paged = items.slice(start, start + pageSize)
  return {
    items: paged,
    page,
    page_size: pageSize,
    total,
    has_more: start + pageSize < total,
  }
}

function resolveMockLibraryAssetRole(asset: LibraryAssetRecord, currentUserId: string): 'owner' | 'editor' | 'viewer' | null {
  if (asset.owner_user_id === currentUserId) {
    return 'owner'
  }
  const membership = (asset.shared_with || []).find((item) => item.user_id === currentUserId)
  if (!membership) {
    return null
  }
  return membership.role === 'editor' ? 'editor' : 'viewer'
}

function applyMockLibraryAssetCapabilities(asset: LibraryAssetRecord, currentUserId = resolveMockCurrentUserId()): LibraryAssetRecord {
  const currentUserRole = resolveMockLibraryAssetRole(asset, currentUserId)
  const lockedForTeamMembers = asset.locked_for_team_members === true
  const archivedForCurrentUser = Array.isArray(asset.archived_by_user_ids) && asset.archived_by_user_ids.includes(currentUserId)
  return {
    ...asset,
    current_user_role: currentUserRole,
    can_manage_access: currentUserRole === 'owner',
    can_edit_metadata: currentUserRole === 'owner',
    can_download: currentUserRole === 'owner' || (currentUserRole === 'editor' && !lockedForTeamMembers),
    archived_for_current_user: archivedForCurrentUser,
  }
}

const metricsMode = resolveMetricsMode(import.meta.env.VITE_MSW_PUBLICATIONS_METRICS_MODE)

export const publicationsMetricsHandler = http.get(metricsPath, () => {
  if (metricsMode === 'empty') {
    return HttpResponse.json(publicationsMetricsEmptyFixture)
  }

  if (metricsMode === 'error') {
    return HttpResponse.json(
      {
        error: {
          message: 'Mocked metrics failure',
          detail: 'Simulated 500 response from /v1/publications/metrics',
        },
      },
      { status: 500 },
    )
  }

  return HttpResponse.json(publicationsMetricsHappyFixture)
})

const publicationDetailHandler = http.get('*/v1/publications/:publicationId', ({ params }) =>
  HttpResponse.json({
    id: String(params.publicationId || 'W-000'),
    title: 'Fixture publication detail',
    year: 2024,
    journal: 'European Heart Journal',
    publication_type: 'journal-article',
    citations_total: 158,
    doi: '10.1000/story.fixture',
    pmid: '401003',
    openalex_work_id: 'W401003',
    abstract: 'Fixture abstract for publication details.',
    keywords_json: ['cardio-oncology', 'registry'],
    authors_json: [{ full_name: 'Storybook User' }, { full_name: 'A. Patel' }],
    affiliations_json: [{ institution: 'Northbridge Cardiac Institute' }],
    created_at: pagesReviewTimestamp,
    updated_at: pagesReviewTimestamp,
  }),
)

const publicationAuthorsHandler = http.get('*/v1/publications/:publicationId/authors', () =>
  HttpResponse.json({
    status: 'READY',
    authors_json: [{ full_name: 'Storybook User' }, { full_name: 'A. Patel' }],
    affiliations_json: [{ institution_name: 'Northbridge Cardiac Institute' }],
    computed_at: pagesReviewTimestamp,
    is_stale: false,
    is_updating: false,
    last_error: null,
  }),
)

const publicationImpactHandler = http.get('*/v1/publications/:publicationId/impact', () =>
  HttpResponse.json({
    payload: {
      citations_total: 158,
      citations_last_12m: 56,
      citations_prev_12m: 43,
      yoy_pct: 30.2,
      acceleration_citations_per_month: 1.4,
      per_year: [
        { year: 2022, citations: 58, yoy_delta: null, yoy_pct: null },
        { year: 2023, citations: 101, yoy_delta: 43, yoy_pct: 74.1 },
        { year: 2024, citations: 158, yoy_delta: 57, yoy_pct: 56.4 },
      ],
      portfolio_context: {
        paper_share_total_pct: 32.5,
        paper_share_12m_pct: 45.9,
        portfolio_rank_total: 1,
        portfolio_rank_12m: 1,
      },
      top_citing_journals: [{ name: 'European Heart Journal', count: 18 }],
      top_citing_countries: [{ name: 'United Kingdom', count: 22 }],
      key_citing_papers: [
        {
          title: 'Independent validation study',
          year: 2025,
          journal: 'Circulation',
          doi: '10.1000/circ.fixture',
          pmid: null,
          citations_total: 24,
        },
      ],
      metadata: {},
    },
    computed_at: pagesReviewTimestamp,
    status: 'READY',
    is_stale: false,
    is_updating: false,
    last_error: null,
  }),
)

const publicationAiInsightsHandler = http.get('*/v1/publications/:publicationId/ai-insights', () =>
  HttpResponse.json({
    payload: {
      label: 'Fixture insight',
      performance_summary: 'Trajectory remains stable with sustained citation intake.',
      trajectory_classification: 'CONSISTENT',
      extractive_key_points: {
        objective: 'Evaluate registry outcomes.',
        methods: 'Longitudinal observational analysis.',
        main_findings: 'Consistent directional effect with moderate confidence.',
        conclusion: 'Findings support planned manuscript positioning.',
      },
      reuse_suggestions: ['Use in introduction context paragraph.'],
      caution_flags: [],
    },
    computed_at: pagesReviewTimestamp,
    status: 'READY',
    is_stale: false,
    is_updating: false,
    last_error: null,
  }),
)

const publicationFilesHandler = http.get('*/v1/publications/:publicationId/files', () =>
  HttpResponse.json({
    items: [],
  }),
)

const authMeHandler = http.get('*/v1/auth/me', () => HttpResponse.json(pagesReviewUser))

const workspacesListHandler = http.get('*/v1/workspaces', () => HttpResponse.json(pagesReviewWorkspaceApiListPayload))
const workspacesAuthorRequestsHandler = http.get(
  '*/v1/workspaces/author-requests',
  () => HttpResponse.json(pagesReviewWorkspaceAuthorRequestsApiPayload),
)
const workspacesInvitationsHandler = http.get(
  '*/v1/workspaces/invitations/sent',
  () => HttpResponse.json(pagesReviewWorkspaceInvitationsApiPayload),
)
const workspacesAccountSearchHandler = http.get('*/v1/workspaces/accounts/search', ({ request }) => {
  const url = new URL(request.url)
  const query = String(url.searchParams.get('q') || '').trim().toLowerCase()
  if (query.length < 2) {
    return HttpResponse.json({ items: [] })
  }
  const items = pagesReviewWorkspaceAccountSearchResults.filter((item) => {
    const haystack = [item.name, item.email].join(' ').toLowerCase()
    return haystack.includes(query)
  })
  return HttpResponse.json({ items })
})
const workspacesSetActiveHandler = http.put('*/v1/workspaces/active', async ({ request }) => {
  const body = (await request.json()) as { workspace_id?: string | null }
  return HttpResponse.json({
    active_workspace_id: body.workspace_id || null,
  })
})
const workspacesInboxMessagesHandler = http.get('*/v1/workspaces/inbox/messages', ({ request }) => {
  const workspaceId = String(new URL(request.url).searchParams.get('workspace_id') || '').trim()
  if (!workspaceId) {
    return HttpResponse.json(pagesReviewWorkspaceInboxMessagesApiPayload)
  }
  return HttpResponse.json({
    items: pagesReviewWorkspaceInboxMessagesApiPayload.items.filter((item) => item.workspace_id === workspaceId),
  })
})
const workspacesInboxReadsHandler = http.get(
  '*/v1/workspaces/inbox/reads',
  () => HttpResponse.json(pagesReviewWorkspaceInboxReadsApiPayload),
)

const journalsHandler = http.get('*/v1/journals', () => HttpResponse.json(pagesReviewJournalOptions))
const runContextHandler = http.get('*/v1/workspaces/:workspaceId/run-context', async ({ params }) => {
  const mode = resolvePagesReviewMockMode(PAGES_REVIEW_RUN_CONTEXT_MODE_KEY, 'default')
  if (mode === 'loading') {
    await delay(1200)
  }
  if (mode === 'empty') {
    return HttpResponse.json({
      ...pagesReviewWorkspaceRunContext,
      workspace_id: String(params.workspaceId || pagesReviewWorkspaceRunContext.workspace_id),
      project_id: null,
      manuscript_id: null,
    })
  }
  return HttpResponse.json({
    ...pagesReviewWorkspaceRunContext,
    workspace_id: String(params.workspaceId || pagesReviewWorkspaceRunContext.workspace_id),
  })
})

const libraryAssetsHandler = http.get('*/v1/library/assets', async ({ request }) => {
  const mode = resolvePagesReviewMockMode(PAGES_REVIEW_LIBRARY_MODE_KEY, 'default')
  if (mode === 'loading') {
    await delay(1400)
  }
  if (mode === 'empty') {
    const payload = listLibraryAssetsForRequest(request)
    return HttpResponse.json({
      ...payload,
      items: [],
      total: 0,
      has_more: false,
    })
  }
  return HttpResponse.json(listLibraryAssetsForRequest(request))
})

const libraryAssetAccessPatchHandler = http.patch('*/v1/library/assets/:assetId/access', async ({ params, request }) => {
  const body = (await request.json()) as {
    collaborators?: Array<{ user_id?: string | null; name?: string | null; role?: 'editor' | 'viewer' }>
    collaborator_user_ids?: string[]
    collaborator_names?: string[]
  }
  const asset = pagesReviewLibraryAssets.find((item) => item.id === params.assetId)
  if (!asset) {
    return HttpResponse.json({ error: { message: 'Not found', detail: 'Asset not found' } }, { status: 404 })
  }
  const collaboratorPayload = Array.isArray(body.collaborators) ? body.collaborators : []
  const nextSharedWith = collaboratorPayload.length > 0
    ? collaboratorPayload.map((member, index) => {
        const userId = String(member.user_id || body.collaborator_user_ids?.[index] || '').trim()
        const collaborator = pagesReviewCollaborators.find((candidate) => candidate.owner_user_id === userId || candidate.id === userId)
        const resolvedName = String(member.name || collaborator?.full_name || body.collaborator_names?.[index] || userId || `user-${index + 1}`).trim()
        return {
          user_id: userId || `user-${index + 1}`,
          name: resolvedName,
          role: member.role === 'editor' ? 'editor' : 'viewer',
        }
      })
    : (body.collaborator_user_ids || []).map((userId, index) => {
        const cleanUserId = String(userId || '').trim() || `user-${index + 1}`
        const collaborator = pagesReviewCollaborators.find((candidate) => candidate.owner_user_id === cleanUserId || candidate.id === cleanUserId)
        return {
          user_id: cleanUserId,
          name: String(body.collaborator_names?.[index] || collaborator?.full_name || cleanUserId).trim(),
          role: 'viewer' as const,
        }
      })
  const updated = applyMockLibraryAssetCapabilities({
    ...asset,
    shared_with_user_ids: nextSharedWith.map((member) => member.user_id),
    shared_with: nextSharedWith,
  })
  Object.assign(asset, updated)
  return HttpResponse.json(updated)
})

const libraryAssetMetadataPatchHandler = http.patch('*/v1/library/assets/:assetId', async ({ params, request }) => {
  const body = (await request.json()) as { filename?: string; locked_for_team_members?: boolean; archived_for_current_user?: boolean }
  const asset = pagesReviewLibraryAssets.find((item) => item.id === params.assetId)
  if (!asset) {
    return HttpResponse.json({ error: { message: 'Not found', detail: 'Asset not found' } }, { status: 404 })
  }
  const currentUserId = resolveMockCurrentUserId()
  const scopedAsset = applyMockLibraryAssetCapabilities(asset)
  const ownerOnlyChangeRequested =
    (typeof body.filename === 'string' && body.filename.trim().length > 0 && body.filename.trim() !== asset.filename)
    || typeof body.locked_for_team_members === 'boolean'
  if (ownerOnlyChangeRequested && !scopedAsset.can_edit_metadata) {
    return HttpResponse.json({ error: { message: 'Forbidden', detail: 'Only the asset owner can update file details.' } }, { status: 403 })
  }
  const archivedByUserIds = new Set(Array.isArray(asset.archived_by_user_ids) ? asset.archived_by_user_ids : [])
  if (typeof body.archived_for_current_user === 'boolean') {
    if (body.archived_for_current_user) {
      archivedByUserIds.add(currentUserId)
    } else {
      archivedByUserIds.delete(currentUserId)
    }
  }
  const updated = applyMockLibraryAssetCapabilities({
    ...asset,
    filename: typeof body.filename === 'string' && body.filename.trim() ? String(body.filename) : asset.filename,
    locked_for_team_members:
      typeof body.locked_for_team_members === 'boolean'
        ? body.locked_for_team_members
        : asset.locked_for_team_members === true,
    archived_by_user_ids: Array.from(archivedByUserIds),
  })
  Object.assign(asset, updated)
  return HttpResponse.json(updated)
})

const libraryAssetDownloadHandler = http.get('*/v1/library/assets/:assetId/download', ({ params }) => {
  const asset = pagesReviewLibraryAssets.find((item) => item.id === params.assetId)
  if (!asset) {
    return HttpResponse.json({ error: { message: 'Not found', detail: 'Asset not found' } }, { status: 404 })
  }
  const scopedAsset = applyMockLibraryAssetCapabilities(asset)
  if (!scopedAsset.can_download) {
    return HttpResponse.json({ error: { message: 'Forbidden', detail: 'Download unavailable for this asset.' } }, { status: 403 })
  }
  return new HttpResponse('patient_id,group,event_12m\nP-001,Intervention,0\n', {
    headers: {
      'Content-Type': 'text/csv',
      'Content-Disposition': `attachment; filename="${asset.filename}"`,
    },
  })
})

const collaborationSummaryHandler = http.get('*/v1/account/collaboration/metrics/summary', async () => {
  const mode = resolvePagesReviewMockMode(PAGES_REVIEW_COLLAB_MODE_KEY, 'default')
  if (mode === 'loading') {
    await delay(1400)
  }
  if (mode === 'empty') {
    return HttpResponse.json({
      ...pagesReviewCollaborationSummary,
      total_collaborators: 0,
      core_collaborators: 0,
      active_collaborations_12m: 0,
      new_collaborators_12m: 0,
      status: 'READY',
    })
  }
  return HttpResponse.json(pagesReviewCollaborationSummary)
})

const collaborationListHandler = http.get('*/v1/account/collaboration/collaborators', async ({ request }) => {
  const mode = resolvePagesReviewMockMode(PAGES_REVIEW_COLLAB_MODE_KEY, 'default')
  if (mode === 'loading') {
    await delay(1400)
  }
  if (mode === 'empty') {
    const payload = listCollaboratorsForRequest(request)
    return HttpResponse.json({
      ...payload,
      items: [],
      total: 0,
      has_more: false,
    })
  }
  return HttpResponse.json(listCollaboratorsForRequest(request))
})

const collaborationGetHandler = http.get('*/v1/account/collaboration/collaborators/:collaboratorId', ({ params }) => {
  const item = pagesReviewCollaborators.find((candidate) => candidate.id === params.collaboratorId)
  if (!item) {
    return HttpResponse.json({ error: { message: 'Not found', detail: 'Collaborator not found' } }, { status: 404 })
  }
  return HttpResponse.json(item)
})

const collaborationCreateHandler = http.post('*/v1/account/collaboration/collaborators', async ({ request }) => {
  const body = (await request.json()) as Partial<CollaboratorPayload>
  return HttpResponse.json({
    ...pagesReviewCollaborators[0],
    id: 'collab-created',
    full_name: String(body.full_name || 'New Collaborator'),
    preferred_name: body.preferred_name || null,
    email: body.email || null,
    orcid_id: body.orcid_id || null,
    openalex_author_id: body.openalex_author_id || null,
    primary_institution: body.primary_institution || null,
    department: body.department || null,
    country: body.country || null,
    current_position: body.current_position || null,
    research_domains: body.research_domains || [],
    notes: body.notes || null,
    created_at: pagesReviewUser.created_at,
    updated_at: pagesReviewTimestamp,
  })
})

const collaborationPatchHandler = http.patch('*/v1/account/collaboration/collaborators/:collaboratorId', async ({ params, request }) => {
  const item = pagesReviewCollaborators.find((candidate) => candidate.id === params.collaboratorId)
  if (!item) {
    return HttpResponse.json({ error: { message: 'Not found', detail: 'Collaborator not found' } }, { status: 404 })
  }
  const body = (await request.json()) as Partial<CollaboratorPayload>
  return HttpResponse.json({
    ...item,
    ...body,
    updated_at: pagesReviewTimestamp,
  })
})

const collaborationDeleteHandler = http.delete('*/v1/account/collaboration/collaborators/:collaboratorId', () =>
  HttpResponse.json({ deleted: true }),
)
const collaborationImportHandler = http.post('*/v1/account/collaboration/import/openalex', () =>
  HttpResponse.json({
    created_count: 0,
    updated_count: 0,
    skipped_count: 0,
    openalex_author_id: null,
    imported_candidates: 0,
  }),
)
const collaborationEnrichHandler = http.post('*/v1/account/collaboration/enrich/openalex', () =>
  HttpResponse.json({
    targeted_count: 0,
    resolved_author_count: 0,
    updated_count: 0,
    unchanged_count: 0,
    skipped_without_identifier: 0,
    failed_count: 0,
    enqueued_metrics_recompute: false,
    field_updates: {},
  }),
)
const collaborationExportHandler = http.get('*/v1/account/collaboration/collaborators/export', () =>
  new HttpResponse('full_name,institution\nA. Patel,Northbridge Cardiac Institute\n', {
    headers: {
      'Content-Type': 'text/csv',
      'content-disposition': 'attachment; filename="collaborators.csv"',
    },
  }),
)
const collaborationAiInsightsHandler = http.post('*/v1/account/collaboration/ai/insights', () =>
  HttpResponse.json({
    status: 'draft',
    insights: ['Core collaboration remains stable over 12 months.'],
    suggested_actions: ['Expand reviewer pool for methods-heavy studies.'],
    provenance: { source: 'storybook-msw' },
  }),
)
const collaborationAiAuthorSuggestionsHandler = http.post('*/v1/account/collaboration/ai/author-suggestions', () =>
  HttpResponse.json({
    status: 'draft',
    topic_keywords: ['cardio-oncology'],
    methods: ['registry analysis'],
    suggestions: [
      {
        collaborator_id: pagesReviewCollaborators[0].id,
        full_name: pagesReviewCollaborators[0].full_name,
        institution: pagesReviewCollaborators[0].primary_institution,
        orcid_id: pagesReviewCollaborators[0].orcid_id,
        classification: pagesReviewCollaborators[0].metrics.classification,
        score: 0.92,
        explanation: 'Strong historical collaboration signal.',
        matched_keywords: ['cardio-oncology'],
        matched_methods: ['registry analysis'],
      },
    ],
    provenance: { source: 'storybook-msw' },
  }),
)
const collaborationAiContributionHandler = http.post('*/v1/account/collaboration/ai/contribution-statement', async ({ request }) => {
  const body = (await request.json()) as { authors?: Array<{ full_name?: string }> }
  const names = (body.authors || []).map((item) => String(item.full_name || '').trim()).filter(Boolean)
  return HttpResponse.json({
    status: 'draft',
    credit_statements: names.map((name) => ({
      full_name: name,
      roles: ['Conceptualization', 'Writing - review & editing'],
      is_corresponding: false,
      equal_contribution: false,
      is_external: false,
    })),
    draft_text: names.length ? `Contributions drafted for ${names.join(', ')}.` : 'No authors supplied.',
    provenance: { source: 'storybook-msw' },
  })
})
const collaborationAiAffiliationsHandler = http.post('*/v1/account/collaboration/ai/affiliations-normaliser', () =>
  HttpResponse.json({
    status: 'draft',
    normalized_authors: [
      {
        full_name: 'A. Patel',
        institution: 'Northbridge Cardiac Institute',
        orcid_id: '0000-0003-1234-0001',
        superscript_number: 1,
      },
    ],
    affiliations: [{ superscript_number: 1, institution_name: 'Northbridge Cardiac Institute' }],
    affiliations_block: '1 Northbridge Cardiac Institute',
    coi_boilerplate: 'The authors declare no competing interests.',
    provenance: { source: 'storybook-msw' },
  }),
)

const claimCitationsGetHandler = http.get('*/v1/aawe/claims/:claimId/citations', ({ params, request }) => {
  const requiredSlots = Math.max(1, Number(new URL(request.url).searchParams.get('required_slots') || '1'))
  return HttpResponse.json(buildPagesReviewClaimCitationState(String(params.claimId || 'claim-1'), requiredSlots))
})
const claimCitationsPutHandler = http.put('*/v1/aawe/claims/:claimId/citations', async ({ params, request }) => {
  const body = (await request.json()) as { citation_ids?: string[]; required_slots?: number }
  const requiredSlots = Math.max(1, Number(body.required_slots || 1))
  const selectedIds = Array.isArray(body.citation_ids) ? body.citation_ids : []
  const attached = pagesReviewCitationLibrary.filter((item) => selectedIds.includes(item.id))
  return HttpResponse.json({
    claim_id: String(params.claimId || 'claim-1'),
    required_slots: requiredSlots,
    attached_citation_ids: attached.map((item) => item.id),
    attached_citations: attached,
    missing_slots: Math.max(0, requiredSlots - attached.length),
  })
})
const citationLibraryGetHandler = http.get('*/v1/aawe/citations', ({ request }) => {
  const url = new URL(request.url)
  const query = String(url.searchParams.get('q') || '').trim().toLowerCase()
  const limit = Math.max(1, Number(url.searchParams.get('limit') || '50'))
  const filtered = query
    ? pagesReviewCitationLibrary.filter((item) => {
        const haystack = [item.title, item.authors, item.journal, item.citation_text].join(' ').toLowerCase()
        return haystack.includes(query)
      })
    : pagesReviewCitationLibrary
  return HttpResponse.json(filtered.slice(0, limit))
})
const citationExportPostHandler = http.post('*/v1/aawe/citations/export', () =>
  new HttpResponse(
    '1. Patel A et al. Longitudinal Cardio-Oncology Outcomes Registry. Eur Heart J. 2024.\n',
    {
      headers: {
        'Content-Type': 'text/plain;charset=utf-8',
        'content-disposition': 'attachment; filename="aawe-references.txt"',
      },
    },
  ),
)

export const handlers = [
  publicationsMetricsHandler,
  publicationDetailHandler,
  publicationAuthorsHandler,
  publicationImpactHandler,
  publicationAiInsightsHandler,
  publicationFilesHandler,
  authMeHandler,
  workspacesListHandler,
  workspacesAuthorRequestsHandler,
  workspacesInvitationsHandler,
  workspacesAccountSearchHandler,
  workspacesSetActiveHandler,
  workspacesInboxMessagesHandler,
  workspacesInboxReadsHandler,
  journalsHandler,
  runContextHandler,
  libraryAssetsHandler,
  libraryAssetAccessPatchHandler,
  libraryAssetMetadataPatchHandler,
  libraryAssetDownloadHandler,
  collaborationSummaryHandler,
  collaborationListHandler,
  collaborationGetHandler,
  collaborationCreateHandler,
  collaborationPatchHandler,
  collaborationDeleteHandler,
  collaborationImportHandler,
  collaborationEnrichHandler,
  collaborationExportHandler,
  collaborationAiInsightsHandler,
  collaborationAiAuthorSuggestionsHandler,
  collaborationAiContributionHandler,
  collaborationAiAffiliationsHandler,
  claimCitationsGetHandler,
  claimCitationsPutHandler,
  citationLibraryGetHandler,
  citationExportPostHandler,
]
