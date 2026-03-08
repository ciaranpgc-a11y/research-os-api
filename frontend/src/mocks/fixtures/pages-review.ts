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

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T
}

function replaceArray<T>(target: T[], next: T[]): void {
  target.splice(0, target.length, ...clone(next))
}

function replaceRecord<T extends Record<string, unknown>>(target: T, next: T): void {
  for (const key of Object.keys(target)) {
    delete target[key]
  }
  Object.assign(target, clone(next))
}

const pagesReviewEmptyCollaboratorContactFields = {
  secondary_email: null,
  contact_salutation: null,
  contact_first_name: null,
  contact_middle_initial: null,
  contact_surname: null,
  contact_email: null,
  contact_secondary_email: null,
  contact_primary_institution: null,
  contact_secondary_institution: null,
  contact_primary_institution_openalex_id: null,
  contact_secondary_institution_openalex_id: null,
  contact_primary_affiliation_department: null,
  contact_primary_affiliation_address_line_1: null,
  contact_primary_affiliation_city: null,
  contact_primary_affiliation_region: null,
  contact_primary_affiliation_postal_code: null,
  contact_primary_affiliation_country: null,
  contact_secondary_affiliation_department: null,
  contact_secondary_affiliation_address_line_1: null,
  contact_secondary_affiliation_city: null,
  contact_secondary_affiliation_region: null,
  contact_secondary_affiliation_postal_code: null,
  contact_secondary_affiliation_country: null,
  contact_country: null,
} satisfies Partial<CollaboratorPayload>

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

export const pagesReviewWorkspaceAccountSearchResults = [
  {
    user_id: 'user-a-patel',
    name: 'A. Patel',
    email: 'apatel@example.org',
  },
  {
    user_id: 'user-l-santos',
    name: 'L. Santos',
    email: 'lsantos@example.org',
  },
  {
    user_id: 'nina-brooks',
    name: 'Nina Brooks',
    email: 'nina.brooks@example.org',
  },
  {
    user_id: 'omar-chen',
    name: 'Omar Chen',
    email: 'omar.chen@example.org',
  },
  {
    user_id: 'priya-shah',
    name: 'Priya Shah',
    email: 'priya.shah@example.org',
  },
  {
    user_id: 'r-khan',
    name: 'R. Khan',
    email: 'r.khan@example.org',
  },
  {
    user_id: 'leah-morgan',
    name: 'Leah Morgan',
    email: 'leah.morgan@example.org',
  },
  {
    user_id: 'marta-solis',
    name: 'Marta Solis',
    email: 'marta.solis@example.org',
  },
  {
    user_id: 'jonas-weber',
    name: 'Jonas Weber',
    email: 'jonas.weber@example.org',
  },
  {
    user_id: 'priya-nair',
    name: 'Priya Nair',
    email: 'priya.nair@example.org',
  },
] as const

export const pagesReviewWorkspaceRecords: WorkspaceRecord[] = [
  {
    id: 'hf-registry',
    name: 'HF Registry Manuscript',
    ownerName: 'Storybook User',
    ownerUserId: pagesReviewUserId,
    collaborators: [
      { userId: 'a-patel', name: 'A. Patel' },
      { userId: 'm-evans', name: 'M. Evans' },
    ],
    pendingCollaborators: [{ userId: 'r-khan', name: 'R. Khan' }],
    collaboratorRoles: {
      'a-patel': 'editor',
      'm-evans': 'reviewer',
    },
    pendingCollaboratorRoles: {
      'r-khan': 'viewer',
    },
    removedCollaborators: [],
    version: '0.9',
    health: 'amber',
    updatedAt: '2026-02-27T08:45:00Z',
    pinned: true,
    archived: false,
    ownerArchived: false,
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
    ownerUserId: pagesReviewUserId,
    collaborators: [{ userId: 'l-santos', name: 'L. Santos' }],
    pendingCollaborators: [],
    collaboratorRoles: {
      'l-santos': 'editor',
    },
    pendingCollaboratorRoles: {},
    removedCollaborators: [],
    version: '0.7',
    health: 'green',
    updatedAt: '2026-02-26T16:12:00Z',
    pinned: true,
    archived: false,
    ownerArchived: false,
    auditLogEntries: [],
  },
  {
    id: 'af-screening',
    name: 'AF Screening Cohort',
    ownerName: 'Storybook User',
    ownerUserId: pagesReviewUserId,
    collaborators: [{ userId: 's-roy', name: 'S. Roy' }],
    pendingCollaborators: [],
    collaboratorRoles: {
      's-roy': 'editor',
    },
    pendingCollaboratorRoles: {},
    removedCollaborators: [],
    version: '0.4',
    health: 'amber',
    updatedAt: '2026-02-24T12:30:00Z',
    pinned: false,
    archived: false,
    ownerArchived: false,
    auditLogEntries: [],
  },
]

export const pagesReviewWorkspaceAuthorRequests: WorkspaceAuthorRequest[] = [
  {
    id: 'author-request-1',
    workspaceId: 'trial-follow-up',
    workspaceName: 'Trial Follow-Up Meta Analysis',
    authorName: 'Eleanor Hart',
    authorUserId: 'eleanor-hart',
    collaboratorRole: 'editor',
    invitedAt: '2026-02-25T11:00:00Z',
  },
]

export const pagesReviewWorkspaceInvitations: WorkspaceInvitationSent[] = [
  {
    id: 'invite-1',
    workspaceId: 'hf-registry',
    workspaceName: 'HF Registry Manuscript',
    inviteeName: 'R. Khan',
    inviteeUserId: 'r-khan',
    role: 'viewer',
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
    owner_user_id: 'storybook-owner-user',
    owner_name: 'Storybook User',
    project_id: 'project-hf-registry',
    filename: 'hf_registry_analysis_ready.csv',
    kind: 'csv',
    mime_type: 'text/csv',
    byte_size: 212304,
    uploaded_at: '2026-02-26T10:45:00Z',
    shared_with_user_ids: ['storybook-editor-user', 'user-a-patel', 'user-l-santos'],
    shared_with: [
      { user_id: 'storybook-editor-user', name: 'Storybook User', role: 'editor' },
      { user_id: 'user-a-patel', name: 'A. Patel', role: 'editor' },
      { user_id: 'user-l-santos', name: 'L. Santos', role: 'viewer' },
    ],
    pending_with: [
      { user_id: 'nina-brooks', name: 'Nina Brooks', role: 'viewer' },
    ],
    workspace_placements: [
      { workspace_id: 'hf-registry-owner', workspace_name: 'HF Registry Manuscript' },
      { workspace_id: 'echo-editor', workspace_name: 'Echo AI Validation' },
    ],
    origin: 'workspace',
    origin_workspace_id: 'hf-registry-owner',
    origin_workspace_name: 'HF Registry Manuscript',
    audit_log_entries: [
      {
        id: 'lib-asset-1-uploaded',
        category: 'asset',
        event_type: 'asset_uploaded',
        actor_user_id: 'storybook-owner-user',
        actor_name: 'Morgan Hale',
        message: 'Morgan Hale uploaded hf_registry_analysis_ready.csv.',
        created_at: '2026-02-26T10:45:00Z',
      },
      {
        id: 'lib-asset-1-linked-hf',
        category: 'asset',
        event_type: 'asset_workspace_linked',
        actor_user_id: 'storybook-owner-user',
        actor_name: 'Morgan Hale',
        to_value: 'HF Registry Manuscript',
        message: 'Morgan Hale linked hf_registry_analysis_ready.csv to HF Registry Manuscript.',
        created_at: '2026-02-26T10:50:00Z',
      },
      {
        id: 'lib-asset-1-linked-echo',
        category: 'asset',
        event_type: 'asset_workspace_linked',
        actor_user_id: 'storybook-owner-user',
        actor_name: 'Morgan Hale',
        to_value: 'Echo AI Validation',
        message: 'Morgan Hale linked hf_registry_analysis_ready.csv to Echo AI Validation.',
        created_at: '2026-02-26T10:55:00Z',
      },
      {
        id: 'lib-asset-1-access-apatel',
        category: 'access',
        event_type: 'access_granted',
        actor_user_id: 'storybook-owner-user',
        actor_name: 'Morgan Hale',
        subject_user_id: 'user-a-patel',
        subject_name: 'A. Patel',
        to_value: 'editor',
        message: 'Morgan Hale granted editor access to A. Patel.',
        created_at: '2026-02-26T11:02:00Z',
      },
      {
        id: 'lib-asset-1-access-lsantos',
        category: 'access',
        event_type: 'access_granted',
        actor_user_id: 'storybook-owner-user',
        actor_name: 'Morgan Hale',
        subject_user_id: 'user-l-santos',
        subject_name: 'L. Santos',
        to_value: 'viewer',
        message: 'Morgan Hale granted viewer access to L. Santos.',
        created_at: '2026-02-26T11:08:00Z',
      },
      {
        id: 'lib-asset-1-access-nina',
        category: 'access',
        event_type: 'access_invited',
        actor_user_id: 'storybook-owner-user',
        actor_name: 'Morgan Hale',
        subject_user_id: 'nina-brooks',
        subject_name: 'Nina Brooks',
        from_value: 'none',
        to_value: 'pending',
        role: 'viewer',
        message: 'Nina Brooks file invitation status switched from none to pending by Morgan Hale as viewer.',
        created_at: '2026-02-26T11:12:00Z',
      },
    ],
    current_user_role: 'owner',
    can_manage_access: true,
    can_edit_metadata: true,
    can_download: true,
    archived_by_user_ids: ['storybook-owner-user'],
    is_available: true,
  },
  {
    id: 'lib-asset-2',
    owner_user_id: 'storybook-owner-user',
    owner_name: 'Storybook User',
    project_id: 'project-data-dictionary',
    filename: 'registry_data_dictionary.xlsx',
    kind: 'xlsx',
    mime_type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    byte_size: 118240,
    uploaded_at: '2026-02-25T09:12:00Z',
    shared_with_user_ids: [],
    shared_with: [],
    workspace_placements: [
      { workspace_id: 'hf-registry-owner', workspace_name: 'HF Registry Manuscript' },
    ],
    origin: 'workspace',
    origin_workspace_id: 'hf-registry-owner',
    origin_workspace_name: 'HF Registry Manuscript',
    current_user_role: 'owner',
    can_manage_access: true,
    can_edit_metadata: true,
    can_download: true,
    is_available: true,
  },
  {
    id: 'lib-asset-3',
    owner_user_id: 'user-maya-singh',
    owner_name: 'Maya Singh',
    project_id: 'project-imaging',
    filename: 'imaging_quality_checks.xlsx',
    kind: 'xlsx',
    mime_type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    byte_size: 845220,
    uploaded_at: '2026-02-24T14:00:00Z',
    shared_with_user_ids: ['storybook-owner-user', 'storybook-editor-user'],
    shared_with: [
      { user_id: 'storybook-owner-user', name: 'Storybook User', role: 'viewer' },
      { user_id: 'storybook-editor-user', name: 'Storybook User', role: 'editor' },
    ],
    current_user_role: 'viewer',
    can_manage_access: false,
    can_edit_metadata: false,
    can_download: false,
    archived_by_user_ids: ['storybook-owner-user'],
    is_available: true,
  },
  {
    id: 'lib-asset-4',
    owner_user_id: 'user-liam-ortega',
    owner_name: 'Liam Ortega',
    project_id: 'project-adjudication',
    filename: 'adverse_event_listing.csv',
    kind: 'csv',
    mime_type: 'text/csv',
    byte_size: 532019,
    uploaded_at: '2026-02-23T16:18:00Z',
    shared_with_user_ids: ['storybook-owner-user', 'storybook-reviewer-user'],
    shared_with: [
      { user_id: 'storybook-owner-user', name: 'Storybook User', role: 'editor' },
      { user_id: 'storybook-reviewer-user', name: 'Storybook User', role: 'viewer' },
    ],
    current_user_role: 'editor',
    can_manage_access: false,
    can_edit_metadata: false,
    can_download: true,
    locked_for_team_members: true,
    is_available: true,
  },
  {
    id: 'lib-asset-5',
    owner_user_id: 'storybook-editor-user',
    owner_name: 'Storybook User',
    project_id: 'project-echo-qc',
    filename: 'echo_reader_qc_log.xls',
    kind: 'xls',
    mime_type: 'application/vnd.ms-excel',
    byte_size: 164992,
    uploaded_at: '2026-02-22T11:30:00Z',
    shared_with_user_ids: ['storybook-owner-user', 'storybook-viewer-user'],
    shared_with: [
      { user_id: 'storybook-owner-user', name: 'Storybook User', role: 'viewer' },
      { user_id: 'storybook-viewer-user', name: 'Storybook User', role: 'viewer' },
    ],
    current_user_role: 'owner',
    can_manage_access: true,
    can_edit_metadata: true,
    can_download: true,
    is_available: true,
  },
  {
    id: 'lib-asset-6',
    owner_user_id: 'storybook-owner-user',
    owner_name: 'Storybook User',
    project_id: 'project-biomarkers',
    filename: 'biomarkers_freeze_v3.csv',
    kind: 'csv',
    mime_type: 'text/csv',
    byte_size: 2381190,
    uploaded_at: '2026-02-21T08:40:00Z',
    shared_with_user_ids: ['storybook-editor-user', 'storybook-reviewer-user', 'storybook-viewer-user', 'user-a-patel'],
    shared_with: [
      { user_id: 'storybook-editor-user', name: 'Storybook User', role: 'editor' },
      { user_id: 'storybook-reviewer-user', name: 'Storybook User', role: 'viewer' },
      { user_id: 'storybook-viewer-user', name: 'Storybook User', role: 'viewer' },
      { user_id: 'user-a-patel', name: 'A. Patel', role: 'editor' },
    ],
    pending_with: [
      { user_id: 'r-khan', name: 'R. Khan', role: 'viewer' },
    ],
    workspace_placements: [
      { workspace_id: 'hf-registry-owner', workspace_name: 'HF Registry Manuscript' },
    ],
    current_user_role: 'owner',
    can_manage_access: true,
    can_edit_metadata: true,
    can_download: true,
    locked_for_team_members: true,
    is_available: false,
  },
  {
    id: 'lib-asset-7',
    owner_user_id: 'storybook-reviewer-user',
    owner_name: 'Storybook User',
    project_id: 'project-ct-windowing',
    filename: 'cta_scan_windowing_notes.xlsx',
    kind: 'xlsx',
    mime_type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    byte_size: 92740,
    uploaded_at: '2026-02-19T15:05:00Z',
    shared_with_user_ids: ['storybook-owner-user'],
    shared_with: [{ user_id: 'storybook-owner-user', name: 'Storybook User', role: 'viewer' }],
    current_user_role: 'owner',
    can_manage_access: true,
    can_edit_metadata: true,
    can_download: true,
    is_available: true,
  },
  {
    id: 'lib-asset-8',
    owner_user_id: 'user-priya-shah',
    owner_name: 'Priya Shah',
    project_id: 'project-recruitment',
    filename: 'site_recruitment_extract.csv',
    kind: 'csv',
    mime_type: 'text/csv',
    byte_size: 681455,
    uploaded_at: '2026-02-18T13:22:00Z',
    shared_with_user_ids: ['storybook-viewer-user', 'storybook-removed-user'],
    shared_with: [
      { user_id: 'storybook-viewer-user', name: 'Storybook User', role: 'viewer' },
      { user_id: 'storybook-removed-user', name: 'Storybook User', role: 'viewer' },
    ],
    current_user_role: 'viewer',
    can_manage_access: false,
    can_edit_metadata: false,
    can_download: false,
    is_available: true,
  },
  {
    id: 'lib-asset-9',
    owner_user_id: 'storybook-owner-user',
    owner_name: 'Storybook User',
    project_id: 'project-figures',
    filename: 'manuscript_figure_source_data.xlsx',
    kind: 'xlsx',
    mime_type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    byte_size: 456812,
    uploaded_at: '2026-02-17T17:48:00Z',
    shared_with_user_ids: ['storybook-editor-user', 'storybook-reviewer-user', 'storybook-viewer-user', 'user-a-patel', 'user-l-santos'],
    shared_with: [
      { user_id: 'storybook-editor-user', name: 'Storybook User', role: 'editor' },
      { user_id: 'storybook-reviewer-user', name: 'Storybook User', role: 'viewer' },
      { user_id: 'storybook-viewer-user', name: 'Storybook User', role: 'viewer' },
      { user_id: 'user-a-patel', name: 'A. Patel', role: 'editor' },
      { user_id: 'user-l-santos', name: 'L. Santos', role: 'viewer' },
    ],
    workspace_placements: [
      { workspace_id: 'hf-registry-owner', workspace_name: 'HF Registry Manuscript' },
      { workspace_id: 'device-viewer', workspace_name: 'Device Substudy Draft' },
    ],
    current_user_role: 'owner',
    can_manage_access: true,
    can_edit_metadata: true,
    can_download: true,
    is_available: true,
  },
  {
    id: 'lib-asset-10',
    owner_user_id: 'storybook-viewer-user',
    owner_name: 'Storybook User',
    project_id: 'project-follow-up',
    filename: 'longitudinal_followup_derived.csv',
    kind: 'csv',
    mime_type: 'text/csv',
    byte_size: 1035212,
    uploaded_at: '2026-02-15T07:55:00Z',
    shared_with_user_ids: ['storybook-owner-user'],
    shared_with: [{ user_id: 'storybook-owner-user', name: 'Storybook User', role: 'viewer' }],
    current_user_role: 'owner',
    can_manage_access: true,
    can_edit_metadata: true,
    can_download: true,
    is_available: true,
  },
  {
    id: 'lib-asset-11',
    owner_user_id: 'user-jules-martin',
    owner_name: 'Jules Martin',
    project_id: 'project-hf-registry',
    filename: 'hf_registry_site_manifest.csv',
    kind: 'csv',
    mime_type: 'text/csv',
    byte_size: 287144,
    uploaded_at: '2026-02-24T19:45:00Z',
    shared_with_user_ids: [],
    shared_with: [],
    is_available: true,
  },
  {
    id: 'lib-asset-12',
    owner_user_id: 'eleanor-hart',
    owner_name: 'Eleanor Hart',
    project_id: 'project-echo-qc',
    filename: 'echo_core_lab_queries.xlsx',
    kind: 'xlsx',
    mime_type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    byte_size: 154882,
    uploaded_at: '2026-02-22T12:24:00Z',
    shared_with_user_ids: [],
    shared_with: [],
    is_available: true,
  },
  {
    id: 'lib-asset-13',
    owner_user_id: 'noah-bennett',
    owner_name: 'Noah Bennett',
    project_id: 'project-imaging',
    filename: 'amyloid_reader_tracking.csv',
    kind: 'csv',
    mime_type: 'text/csv',
    byte_size: 401233,
    uploaded_at: '2026-02-21T09:05:00Z',
    shared_with_user_ids: [],
    shared_with: [],
    is_available: true,
  },
  {
    id: 'lib-asset-14',
    owner_user_id: 'priya-shah',
    owner_name: 'Priya Shah',
    project_id: 'project-recruitment',
    filename: 'device_substudy_enrollment.csv',
    kind: 'csv',
    mime_type: 'text/csv',
    byte_size: 562944,
    uploaded_at: '2026-02-20T10:55:00Z',
    shared_with_user_ids: [],
    shared_with: [],
    is_available: true,
  },
  {
    id: 'lib-asset-15',
    owner_user_id: 'storybook-removed-user',
    owner_name: 'Casey Moore',
    project_id: null,
    filename: 'legacy_registry_personal_notes.xlsx',
    kind: 'xlsx',
    mime_type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    byte_size: 88712,
    uploaded_at: '2026-02-19T08:15:00Z',
    shared_with_user_ids: [],
    shared_with: [],
    is_available: true,
  },
  {
    id: 'lib-asset-16',
    owner_user_id: 'marta-solis',
    owner_name: 'Marta Solis',
    project_id: null,
    filename: 'uk_biobank_ecg_dataset.csv',
    kind: 'csv',
    mime_type: 'text/csv',
    byte_size: 932144,
    uploaded_at: '2026-03-01T09:30:00Z',
    shared_with_user_ids: [],
    shared_with: [],
    pending_with: [
      { user_id: 'storybook-owner-user', name: 'Morgan Hale', role: 'reviewer' },
      { user_id: 'storybook-editor-user', name: 'Avery Cole', role: 'reviewer' },
      { user_id: 'storybook-reviewer-user', name: 'Jordan Pike', role: 'reviewer' },
      { user_id: 'storybook-viewer-user', name: 'Riley Hart', role: 'reviewer' },
      { user_id: 'storybook-removed-user', name: 'Casey Moore', role: 'reviewer' },
    ],
    is_available: true,
  },
  {
    id: 'lib-asset-17',
    owner_user_id: 'leah-morgan',
    owner_name: 'Leah Morgan',
    project_id: null,
    filename: 'core_lab_echo_adjudication_pack.xlsx',
    kind: 'xlsx',
    mime_type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    byte_size: 281104,
    uploaded_at: '2026-03-02T07:20:00Z',
    shared_with_user_ids: [],
    shared_with: [],
    pending_with: [
      { user_id: 'storybook-owner-user', name: 'Morgan Hale', role: 'editor' },
      { user_id: 'storybook-editor-user', name: 'Avery Cole', role: 'editor' },
      { user_id: 'storybook-reviewer-user', name: 'Jordan Pike', role: 'editor' },
      { user_id: 'storybook-viewer-user', name: 'Riley Hart', role: 'editor' },
      { user_id: 'storybook-removed-user', name: 'Casey Moore', role: 'editor' },
    ],
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
    id: 'user-a-patel',
    owner_user_id: 'user-a-patel',
    full_name: 'A. Patel',
    ...pagesReviewEmptyCollaboratorContactFields,
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
    id: 'user-l-santos',
    owner_user_id: 'user-l-santos',
    full_name: 'L. Santos',
    ...pagesReviewEmptyCollaboratorContactFields,
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
    id: 's-roy',
    owner_user_id: 's-roy',
    full_name: 'S. Roy',
    ...pagesReviewEmptyCollaboratorContactFields,
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
  {
    id: 'nina-brooks',
    owner_user_id: 'nina-brooks',
    full_name: 'Nina Brooks',
    ...pagesReviewEmptyCollaboratorContactFields,
    preferred_name: 'Nina',
    email: 'nina.brooks@example.org',
    orcid_id: null,
    openalex_author_id: null,
    primary_institution: 'Northbridge Cardiac Institute',
    department: 'Clinical Operations',
    country: 'United Kingdom',
    current_position: 'Trial Manager',
    research_domains: ['Registry operations'],
    notes: 'Frequently needs viewer access to exports.',
    created_at: '2026-01-19T09:00:00Z',
    updated_at: '2026-02-27T09:20:00Z',
    metrics: {
      coauthored_works_count: 0,
      shared_citations_total: 0,
      first_collaboration_year: null,
      last_collaboration_year: null,
      citations_last_12m: 0,
      collaboration_strength_score: 0.11,
      classification: 'OCCASIONAL',
      computed_at: '2026-02-27T08:55:00Z',
      status: 'READY',
    },
    duplicate_warnings: [],
  },
  {
    id: 'r-khan',
    owner_user_id: 'r-khan',
    full_name: 'R. Khan',
    ...pagesReviewEmptyCollaboratorContactFields,
    preferred_name: 'Razan Khan',
    email: 'r.khan@example.org',
    orcid_id: null,
    openalex_author_id: null,
    primary_institution: 'Riverbend Clinical Trials Unit',
    department: 'Outcomes Research',
    country: 'United Kingdom',
    current_position: 'Clinical Fellow',
    research_domains: ['Registry follow-up'],
    notes: 'Common pending invite target for data review.',
    created_at: '2026-01-28T08:30:00Z',
    updated_at: '2026-02-27T08:58:00Z',
    metrics: {
      coauthored_works_count: 0,
      shared_citations_total: 0,
      first_collaboration_year: null,
      last_collaboration_year: null,
      citations_last_12m: 0,
      collaboration_strength_score: 0.09,
      classification: 'OCCASIONAL',
      computed_at: '2026-02-27T08:55:00Z',
      status: 'READY',
    },
    duplicate_warnings: [],
  },
  {
    id: 'leah-morgan',
    owner_user_id: 'leah-morgan',
    full_name: 'Leah Morgan',
    ...pagesReviewEmptyCollaboratorContactFields,
    preferred_name: null,
    email: 'leah.morgan@example.org',
    orcid_id: null,
    openalex_author_id: null,
    primary_institution: 'Echo Core Lab',
    department: 'Adjudication',
    country: 'United Kingdom',
    current_position: 'Core Lab Lead',
    research_domains: ['Echo adjudication'],
    notes: 'Owner of incoming data invitation fixture.',
    created_at: '2025-11-12T10:45:00Z',
    updated_at: '2026-02-27T09:05:00Z',
    metrics: {
      coauthored_works_count: 1,
      shared_citations_total: 12,
      first_collaboration_year: 2025,
      last_collaboration_year: 2025,
      citations_last_12m: 5,
      collaboration_strength_score: 0.28,
      classification: 'ACTIVE',
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
    owner_user_id: workspace.ownerUserId,
    collaborators: workspace.collaborators.map((participant) => ({
      user_id: participant.userId,
      name: participant.name,
    })),
    pending_collaborators: workspace.pendingCollaborators.map((participant) => ({
      user_id: participant.userId,
      name: participant.name,
    })),
    collaborator_roles: workspace.collaboratorRoles,
    pending_collaborator_roles: workspace.pendingCollaboratorRoles,
    removed_collaborators: workspace.removedCollaborators.map((participant) => ({
      user_id: participant.userId,
      name: participant.name,
    })),
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

const initialPagesReviewWorkspaceRecords = clone(pagesReviewWorkspaceRecords)
const initialPagesReviewWorkspaceAuthorRequests = clone(pagesReviewWorkspaceAuthorRequests)
const initialPagesReviewWorkspaceInvitations = clone(pagesReviewWorkspaceInvitations)
const initialPagesReviewWorkspaceInboxMessages = clone(pagesReviewWorkspaceInboxMessages)
const initialPagesReviewWorkspaceInboxReads = clone(pagesReviewWorkspaceInboxReads)
const initialPagesReviewLibraryAssets = clone(pagesReviewLibraryAssets)

type PagesReviewMockCollections = {
  workspaceRecords?: WorkspaceRecord[]
  workspaceAuthorRequests?: WorkspaceAuthorRequest[]
  workspaceInvitations?: WorkspaceInvitationSent[]
  workspaceInboxMessages?: WorkspaceInboxMessageRecord[]
  workspaceInboxReads?: WorkspaceInboxReadMap
  libraryAssets?: LibraryAssetRecord[]
}

export function resetPagesReviewMockCollections(overrides: PagesReviewMockCollections = {}) {
  replaceArray(
    pagesReviewWorkspaceRecords,
    overrides.workspaceRecords ?? initialPagesReviewWorkspaceRecords,
  )
  replaceArray(
    pagesReviewWorkspaceAuthorRequests,
    overrides.workspaceAuthorRequests ?? initialPagesReviewWorkspaceAuthorRequests,
  )
  replaceArray(
    pagesReviewWorkspaceInvitations,
    overrides.workspaceInvitations ?? initialPagesReviewWorkspaceInvitations,
  )
  replaceArray(
    pagesReviewWorkspaceInboxMessages,
    overrides.workspaceInboxMessages ?? initialPagesReviewWorkspaceInboxMessages,
  )
  replaceRecord(
    pagesReviewWorkspaceInboxReads,
    overrides.workspaceInboxReads ?? initialPagesReviewWorkspaceInboxReads,
  )
  replaceArray(
    pagesReviewLibraryAssets,
    overrides.libraryAssets ?? initialPagesReviewLibraryAssets,
  )
}

export function buildPagesReviewWorkspaceApiListPayload() {
  return {
    items: pagesReviewWorkspaceRecords.map(toWorkspaceApiRecord),
    active_workspace_id: pagesReviewWorkspaceRecords[0]?.id || null,
  }
}

export function buildPagesReviewWorkspaceAuthorRequestsApiPayload() {
  return {
    items: pagesReviewWorkspaceAuthorRequests.map((item) => ({
      id: item.id,
      workspace_id: item.workspaceId,
      workspace_name: item.workspaceName,
      author_name: item.authorName,
      author_user_id: item.authorUserId,
      invitation_type: item.invitationType === 'data' ? 'data' : 'workspace',
      collaborator_role: item.collaboratorRole,
      invited_at: item.invitedAt,
    })),
  }
}

export function buildPagesReviewWorkspaceInvitationsApiPayload() {
  return {
    items: pagesReviewWorkspaceInvitations.map((item) => ({
      id: item.id,
      workspace_id: item.workspaceId,
      workspace_name: item.workspaceName,
      invitee_name: item.inviteeName,
      invitee_user_id: item.inviteeUserId,
      invitation_type: item.invitationType === 'data' ? 'data' : 'workspace',
      role: item.role,
      invited_at: item.invitedAt,
      status: item.status,
    })),
  }
}

export function buildPagesReviewWorkspaceInboxMessagesApiPayload() {
  return {
    items: pagesReviewWorkspaceInboxMessages.map((item) => ({
      id: item.id,
      workspace_id: item.workspaceId,
      sender_name: item.senderName,
      encrypted_body: item.encryptedBody,
      iv: item.iv,
      created_at: item.createdAt,
    })),
  }
}

export function buildPagesReviewWorkspaceInboxReadsApiPayload() {
  return {
    reads: clone(pagesReviewWorkspaceInboxReads),
  }
}

export function buildPagesReviewWorkspaceStateApiPayload() {
  return {
    workspaces: buildPagesReviewWorkspaceApiListPayload().items,
    active_workspace_id: pagesReviewWorkspaceRecords[0]?.id || null,
    author_requests: buildPagesReviewWorkspaceAuthorRequestsApiPayload().items,
    invitations_sent: buildPagesReviewWorkspaceInvitationsApiPayload().items,
  }
}

export function buildPagesReviewWorkspaceInboxStateApiPayload() {
  return {
    messages: buildPagesReviewWorkspaceInboxMessagesApiPayload().items,
    reads: buildPagesReviewWorkspaceInboxReadsApiPayload().reads,
  }
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
  scope: 'all',
}
