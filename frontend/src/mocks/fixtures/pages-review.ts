import type { ClaimCitationState, CitationRecord } from '@/types/citation'
import type {
  AuthUser,
  CollaborationMetricsSummaryPayload,
  CollaboratorPayload,
  CollaboratorsListPayload,
} from '@/types/impact'
import type { DataAsset, ManuscriptTable } from '@/types/data-workspace'
import type {
  JournalOption,
  LibraryAssetListPayload,
  LibraryAssetRecord,
  WorkspaceRunContextPayload,
} from '@/types/study-core'
import type {
  WorkspaceAuthorRequest,
  WorkspaceInvitationSent,
  WorkspaceRecord,
} from '@/store/use-workspace-store'
import type { WorkspaceInboxMessageRecord, WorkspaceInboxReadMap } from '@/store/use-workspace-inbox-store'

export type PagesReviewMockMode = 'default' | 'empty' | 'loading'

export const PAGES_REVIEW_COLLAB_MODE_KEY = 'aawe-storybook-collaboration-mode'
export const PAGES_REVIEW_LIBRARY_MODE_KEY = 'aawe-storybook-library-mode'
export const PAGES_REVIEW_RUN_CONTEXT_MODE_KEY = 'aawe-storybook-run-context-mode'

export const pagesReviewToken = 'storybook-pages-review-token'
export const pagesReviewUserId = 'storybook-user-1'
export const pagesReviewTimestamp = '2026-02-27T09:00:00Z'

export const pagesReviewUser: AuthUser = {
  id: pagesReviewUserId,
  account_key: 'acct_storybook',
  email: 'storybook.user@example.org',
  name: 'Storybook User',
  is_active: true,
  role: 'user',
  orcid_id: '0000-0002-1825-0097',
  impact_last_computed_at: pagesReviewTimestamp,
  email_verified_at: pagesReviewTimestamp,
  last_sign_in_at: pagesReviewTimestamp,
  created_at: '2024-10-11T08:00:00Z',
  updated_at: pagesReviewTimestamp,
}

export const pagesReviewWorkspaceRecords: WorkspaceRecord[] = [
  {
    id: 'hf-registry',
    name: 'HF Registry Manuscript',
    ownerName: 'Storybook User',
    collaborators: ['A. Patel', 'M. Evans'],
    pendingCollaborators: ['R. Khan'],
    collaboratorRoles: {
      'A. Patel': 'editor',
      'M. Evans': 'reviewer',
    },
    pendingCollaboratorRoles: {
      'R. Khan': 'viewer',
    },
    removedCollaborators: [],
    version: '0.9',
    health: 'amber',
    updatedAt: '2026-02-27T08:45:00Z',
    pinned: true,
    archived: false,
    auditLogEntries: [
      {
        id: 'audit-1',
        workspaceId: 'hf-registry',
        category: 'collaborator_changes',
        message: 'M. Evans moved to reviewer role.',
        createdAt: '2026-02-27T08:20:00Z',
      },
    ],
  },
  {
    id: 'echo-ai-validation',
    name: 'Echo AI Validation',
    ownerName: 'Storybook User',
    collaborators: ['L. Santos'],
    pendingCollaborators: [],
    collaboratorRoles: {
      'L. Santos': 'editor',
    },
    pendingCollaboratorRoles: {},
    removedCollaborators: [],
    version: '0.7',
    health: 'green',
    updatedAt: '2026-02-26T16:12:00Z',
    pinned: true,
    archived: false,
    auditLogEntries: [],
  },
  {
    id: 'af-screening',
    name: 'AF Screening Cohort',
    ownerName: 'Storybook User',
    collaborators: ['S. Roy'],
    pendingCollaborators: [],
    collaboratorRoles: {
      'S. Roy': 'editor',
    },
    pendingCollaboratorRoles: {},
    removedCollaborators: [],
    version: '0.4',
    health: 'amber',
    updatedAt: '2026-02-24T12:30:00Z',
    pinned: false,
    archived: false,
    auditLogEntries: [],
  },
]

export const pagesReviewWorkspaceAuthorRequests: WorkspaceAuthorRequest[] = [
  {
    id: 'author-request-1',
    workspaceId: 'trial-follow-up',
    workspaceName: 'Trial Follow-Up Meta Analysis',
    authorName: 'Eleanor Hart',
    collaboratorRole: 'editor',
    invitedAt: '2026-02-25T11:00:00Z',
  },
]

export const pagesReviewWorkspaceInvitations: WorkspaceInvitationSent[] = [
  {
    id: 'invite-1',
    workspaceId: 'hf-registry',
    workspaceName: 'HF Registry Manuscript',
    inviteeName: 'Nina Brooks',
    role: 'reviewer',
    invitedAt: '2026-02-26T10:30:00Z',
    status: 'pending',
  },
]

export const pagesReviewWorkspaceInboxMessages: WorkspaceInboxMessageRecord[] = [
  {
    id: 'msg-1',
    workspaceId: 'hf-registry',
    senderName: 'A. Patel',
    encryptedBody: 'c3Rvcnlib29rLW1lc3NhZ2UtMQ==',
    iv: 'storybook-iv-1',
    createdAt: '2026-02-27T07:40:00Z',
  },
]

export const pagesReviewWorkspaceInboxReads: WorkspaceInboxReadMap = {
  'hf-registry': {
    'storybook user': '2026-02-27T07:00:00Z',
  },
}

export const pagesReviewResultsDataAssets: DataAsset[] = [
  {
    id: 'asset-csv-1',
    name: 'hf_registry_outcomes.csv',
    kind: 'csv',
    uploadedAt: '2026-02-26T09:05:00Z',
    sheets: [
      {
        name: 'Sheet1',
        columns: ['patient_id', 'group', 'lfvef_change', 'event_12m'],
        rows: [
          { patient_id: 'P-001', group: 'Intervention', lfvef_change: '4.2', event_12m: '0' },
          { patient_id: 'P-002', group: 'Control', lfvef_change: '-1.1', event_12m: '1' },
          { patient_id: 'P-003', group: 'Intervention', lfvef_change: '2.8', event_12m: '0' },
        ],
      },
    ],
  },
  {
    id: 'asset-xlsx-1',
    name: 'supplementary_tables.xlsx',
    kind: 'xlsx',
    uploadedAt: '2026-02-25T16:50:00Z',
    sheets: [
      {
        name: 'TableA',
        columns: ['metric', 'baseline', 'follow_up'],
        rows: [
          { metric: 'NT-proBNP', baseline: '320', follow_up: '240' },
          { metric: 'Troponin', baseline: '21', follow_up: '17' },
        ],
      },
    ],
  },
]

export const pagesReviewManuscriptTables: ManuscriptTable[] = [
  {
    id: 'manuscript-table-1',
    title: 'Table 1. Baseline characteristics',
    caption: 'Key demographics and baseline measurements.',
    footnote: 'Values shown as mean (SD) unless otherwise stated.',
    columns: ['Variable', 'Intervention', 'Control', 'p-value'],
    rows: [
      ['Age, years', '64.1 (8.2)', '63.8 (7.9)', '0.81'],
      ['Female sex, n (%)', '42 (38)', '40 (37)', '0.92'],
      ['Baseline LVEF, %', '56.2 (5.1)', '55.9 (5.4)', '0.74'],
    ],
  },
]

export const pagesReviewLibraryAssets: LibraryAssetRecord[] = [
  {
    id: 'lib-asset-1',
    owner_user_id: pagesReviewUserId,
    owner_name: 'Storybook User',
    project_id: 'project-hf-registry',
    filename: 'hf_registry_analysis_ready.csv',
    kind: 'csv',
    mime_type: 'text/csv',
    byte_size: 212304,
    uploaded_at: '2026-02-26T10:45:00Z',
    shared_with_user_ids: ['user-a-patel'],
    shared_with: [{ user_id: 'user-a-patel', name: 'A. Patel' }],
    can_manage_access: true,
    is_available: true,
  },
  {
    id: 'lib-asset-2',
    owner_user_id: 'user-maya-singh',
    owner_name: 'Maya Singh',
    project_id: 'project-imaging',
    filename: 'imaging_quality_checks.xlsx',
    kind: 'xlsx',
    mime_type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    byte_size: 845220,
    uploaded_at: '2026-02-24T14:00:00Z',
    shared_with_user_ids: [pagesReviewUserId],
    shared_with: [{ user_id: pagesReviewUserId, name: 'Storybook User' }],
    can_manage_access: false,
    is_available: true,
  },
]

export const pagesReviewCollaborationSummary: CollaborationMetricsSummaryPayload = {
  total_collaborators: 3,
  core_collaborators: 1,
  active_collaborations_12m: 2,
  new_collaborators_12m: 1,
  last_computed_at: '2026-02-27T08:55:00Z',
  status: 'READY',
  is_stale: false,
  is_updating: false,
  last_update_failed: false,
}

export const pagesReviewCollaborators: CollaboratorPayload[] = [
  {
    id: 'collab-1',
    owner_user_id: pagesReviewUserId,
    full_name: 'A. Patel',
    preferred_name: 'Asha Patel',
    email: 'apatel@example.org',
    orcid_id: '0000-0003-1234-0001',
    openalex_author_id: 'A1234567890',
    primary_institution: 'Northbridge Cardiac Institute',
    department: 'Cardiology',
    country: 'United Kingdom',
    current_position: 'Consultant Cardiologist',
    research_domains: ['Cardio-oncology', 'Echocardiography'],
    notes: 'Lead methods reviewer.',
    created_at: '2025-08-14T09:00:00Z',
    updated_at: '2026-02-26T09:00:00Z',
    metrics: {
      coauthored_works_count: 6,
      shared_citations_total: 248,
      first_collaboration_year: 2021,
      last_collaboration_year: 2025,
      citations_last_12m: 44,
      collaboration_strength_score: 0.91,
      classification: 'CORE',
      computed_at: '2026-02-27T08:55:00Z',
      status: 'READY',
    },
    duplicate_warnings: [],
  },
  {
    id: 'collab-2',
    owner_user_id: pagesReviewUserId,
    full_name: 'L. Santos',
    preferred_name: null,
    email: 'lsantos@example.org',
    orcid_id: '0000-0003-1234-0002',
    openalex_author_id: 'A1234567891',
    primary_institution: 'Westlake Imaging Centre',
    department: 'Radiology',
    country: 'United States',
    current_position: 'Research Scientist',
    research_domains: ['CMR', 'Image analysis'],
    notes: null,
    created_at: '2025-10-02T11:15:00Z',
    updated_at: '2026-02-25T10:00:00Z',
    metrics: {
      coauthored_works_count: 3,
      shared_citations_total: 91,
      first_collaboration_year: 2023,
      last_collaboration_year: 2025,
      citations_last_12m: 19,
      collaboration_strength_score: 0.63,
      classification: 'ACTIVE',
      computed_at: '2026-02-27T08:55:00Z',
      status: 'READY',
    },
    duplicate_warnings: [],
  },
  {
    id: 'collab-3',
    owner_user_id: pagesReviewUserId,
    full_name: 'S. Roy',
    preferred_name: null,
    email: null,
    orcid_id: null,
    openalex_author_id: null,
    primary_institution: 'Riverbend Clinical Trials Unit',
    department: 'Epidemiology',
    country: 'Canada',
    current_position: 'Biostatistician',
    research_domains: ['Cohort analysis'],
    notes: 'Occasional contribution on sensitivity analyses.',
    created_at: '2026-01-11T12:00:00Z',
    updated_at: '2026-02-20T12:00:00Z',
    metrics: {
      coauthored_works_count: 1,
      shared_citations_total: 8,
      first_collaboration_year: 2025,
      last_collaboration_year: 2025,
      citations_last_12m: 4,
      collaboration_strength_score: 0.22,
      classification: 'OCCASIONAL',
      computed_at: '2026-02-27T08:55:00Z',
      status: 'READY',
    },
    duplicate_warnings: [],
  },
]

export const pagesReviewCitationLibrary: CitationRecord[] = [
  {
    id: 'cite-1',
    title: 'Longitudinal Cardio-Oncology Outcomes Registry',
    authors: 'Patel A, Santos L, Clarke C',
    journal: 'European Heart Journal',
    year: 2024,
    doi: '10.1000/ehj.2024.001',
    url: 'https://example.org/citations/cite-1',
    citation_text: 'Patel A et al. Longitudinal Cardio-Oncology Outcomes Registry. Eur Heart J. 2024.',
  },
  {
    id: 'cite-2',
    title: 'Imaging Biomarkers and Early Cardiotoxicity',
    authors: 'Roy S, Clarke C',
    journal: 'JACC Imaging',
    year: 2023,
    doi: '10.1000/jimaging.2023.117',
    url: 'https://example.org/citations/cite-2',
    citation_text: 'Roy S, Clarke C. Imaging Biomarkers and Early Cardiotoxicity. JACC Imaging. 2023.',
  },
  {
    id: 'cite-3',
    title: 'Methods for Reproducible Registry Analyses',
    authors: 'Evans M, Patel A',
    journal: 'BMJ Open',
    year: 2022,
    doi: '10.1000/bmjopen.2022.443',
    url: 'https://example.org/citations/cite-3',
    citation_text: 'Evans M, Patel A. Methods for Reproducible Registry Analyses. BMJ Open. 2022.',
  },
]

export const pagesReviewJournalOptions: JournalOption[] = [
  { slug: 'ehj', display_name: 'European Heart Journal', default_voice: 'technical' },
  { slug: 'jacc-imaging', display_name: 'JACC: Cardiovascular Imaging', default_voice: 'technical' },
  { slug: 'bmj-open', display_name: 'BMJ Open', default_voice: 'concise' },
]

export const pagesReviewWorkspaceRunContext: WorkspaceRunContextPayload = {
  workspace_id: 'hf-registry',
  project_id: 'project-hf-registry',
  manuscript_id: 'manuscript-hf-registry',
  owner_user_id: pagesReviewUserId,
  collaborator_user_ids: ['user-a-patel', 'user-l-santos'],
}

export function buildPagesReviewClaimCitationState(claimId: string, requiredSlots: number): ClaimCitationState {
  const attached = pagesReviewCitationLibrary.slice(0, Math.max(1, Math.min(requiredSlots, 2)))
  return {
    claim_id: claimId,
    required_slots: requiredSlots,
    attached_citation_ids: attached.map((item) => item.id),
    attached_citations: attached,
    missing_slots: Math.max(0, requiredSlots - attached.length),
  }
}

export function resolvePagesReviewMockMode(
  key: string,
  fallback: PagesReviewMockMode = 'default',
): PagesReviewMockMode {
  if (typeof window === 'undefined') {
    return fallback
  }
  const value = String(window.localStorage.getItem(key) || '').trim().toLowerCase()
  if (value === 'empty' || value === 'loading' || value === 'default') {
    return value
  }
  return fallback
}

function toWorkspaceApiRecord(workspace: WorkspaceRecord) {
  return {
    id: workspace.id,
    name: workspace.name,
    owner_name: workspace.ownerName,
    collaborators: workspace.collaborators,
    pending_collaborators: workspace.pendingCollaborators,
    collaborator_roles: workspace.collaboratorRoles,
    pending_collaborator_roles: workspace.pendingCollaboratorRoles,
    removed_collaborators: workspace.removedCollaborators,
    version: workspace.version,
    health: workspace.health,
    updated_at: workspace.updatedAt,
    pinned: workspace.pinned,
    archived: workspace.archived,
    audit_log_entries: (workspace.auditLogEntries || []).map((entry) => ({
      id: entry.id,
      workspace_id: entry.workspaceId,
      category: entry.category,
      message: entry.message,
      created_at: entry.createdAt,
    })),
  }
}

export const pagesReviewWorkspaceApiListPayload = {
  items: pagesReviewWorkspaceRecords.map(toWorkspaceApiRecord),
  active_workspace_id: pagesReviewWorkspaceRecords[0]?.id || null,
}

export const pagesReviewWorkspaceAuthorRequestsApiPayload = {
  items: pagesReviewWorkspaceAuthorRequests.map((item) => ({
    id: item.id,
    workspace_id: item.workspaceId,
    workspace_name: item.workspaceName,
    author_name: item.authorName,
    collaborator_role: item.collaboratorRole,
    invited_at: item.invitedAt,
  })),
}

export const pagesReviewWorkspaceInvitationsApiPayload = {
  items: pagesReviewWorkspaceInvitations.map((item) => ({
    id: item.id,
    workspace_id: item.workspaceId,
    workspace_name: item.workspaceName,
    invitee_name: item.inviteeName,
    role: item.role,
    invited_at: item.invitedAt,
    status: item.status,
  })),
}

export const pagesReviewWorkspaceInboxMessagesApiPayload = {
  items: pagesReviewWorkspaceInboxMessages.map((item) => ({
    id: item.id,
    workspace_id: item.workspaceId,
    sender_name: item.senderName,
    encrypted_body: item.encryptedBody,
    iv: item.iv,
    created_at: item.createdAt,
  })),
}

export const pagesReviewWorkspaceInboxReadsApiPayload = {
  reads: pagesReviewWorkspaceInboxReads,
}

export const pagesReviewCollaboratorsListPayload: CollaboratorsListPayload = {
  items: pagesReviewCollaborators,
  page: 1,
  page_size: 50,
  total: pagesReviewCollaborators.length,
  has_more: false,
}

export const pagesReviewLibraryAssetsListPayload: LibraryAssetListPayload = {
  items: pagesReviewLibraryAssets,
  page: 1,
  page_size: 25,
  total: pagesReviewLibraryAssets.length,
  has_more: false,
  sort_by: 'uploaded_at',
  sort_direction: 'desc',
  query: '',
  ownership: 'all',
}
