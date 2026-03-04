export type AuthUser = {
  id: string
  account_key?: string | null
  email: string
  name: string
  is_active: boolean
  role: 'user' | 'admin'
  orcid_id: string | null
  impact_last_computed_at: string | null
  email_verified_at: string | null
  last_sign_in_at: string | null
  created_at: string
  updated_at: string
}

export type AuthSessionPayload = {
  user: AuthUser
  session_token: string
  session_expires_at: string
}

export type AdminOverviewPayload = {
  total_users: number
  active_users: number
  active_users_24h: number
  active_users_7d: number
  active_users_30d: number
  retention_7d_pct: number
  retention_30d_pct: number
  inactive_users: number
  admin_users: number
  recent_signins_24h: number
  generated_at: string
}

export type AdminUserSummaryPayload = {
  id: string
  account_key: string | null
  email: string
  name: string
  is_active: boolean
  role: 'user' | 'admin'
  email_verified_at: string | null
  last_sign_in_at: string | null
  created_at: string
  updated_at: string
}

export type AdminUsersListPayload = {
  items: AdminUserSummaryPayload[]
  total: number
  limit: number
  offset: number
}

export type AdminUserLibraryReconcileSummaryPayload = {
  restored_rows: number
  claimed_rows: number
  identity_recovered_rows: number
  canonicalized_owner_rows: number
}

export type AdminUserLibraryReconcilePayload = {
  message: string
  user_id: string
  user_email: string
  user_name: string
  account_key: string | null
  owned_assets_before: number
  owned_assets_after: number
  owned_personal_before: number
  owned_personal_after: number
  owned_project_before: number
  owned_project_after: number
  reconcile_summary: AdminUserLibraryReconcileSummaryPayload
  diagnostics: Record<string, unknown>
  generated_at: string
  audit_event: AdminAuditEventPayload
}

export type AdminUserLibraryStorageRecoverSummaryPayload = {
  scanned_assets: number
  storage_rebound_rows: number
  available_assets_before: number
  available_assets_after: number
  missing_assets_after: number
  missing_asset_ids_sample: string[]
}

export type AdminUserLibraryStorageRecoverPayload = {
  message: string
  user_id: string
  user_email: string
  user_name: string
  account_key: string | null
  recover_summary: AdminUserLibraryStorageRecoverSummaryPayload
  diagnostics: Record<string, unknown>
  generated_at: string
  audit_event: AdminAuditEventPayload
}

export type AdminUserDeletePayload = {
  success: boolean
  message: string
  deleted_user_id: string
  deleted_user_email: string
  deleted_user_name: string
  deleted_at: string
  audit_event: AdminAuditEventPayload
}

export type AdminOrganisationIntegrationPayload = {
  key: string
  status: 'connected' | 'degraded' | 'not_configured'
  connected_members: number
  last_sync_at: string | null
  detail: string
}

export type AdminOrganisationMonthlyUsagePointPayload = {
  month: string
  tokens: number
  tool_calls: number
  cost_usd: number
}

export type AdminOrganisationImpersonationPayload = {
  available: boolean
  audited: boolean
  last_event_at: string | null
  note: string
}

export type AdminOrganisationSummaryPayload = {
  id: string
  name: string
  domain: string
  plan: string
  billing_status: string
  member_count: number
  admin_count: number
  active_members_30d: number
  last_active_at: string | null
  workspace_count: number
  project_count: number
  usage_tokens_current_month: number
  usage_tokens_previous_month: number
  usage_tokens_trend_pct: number
  usage_tool_calls_current_month: number
  storage_bytes_current: number
  cost_usd_current_month: number
  cost_usd_previous_month: number
  cost_trend_pct: number
  gross_margin_pct: number
  feature_flags_enabled: string[]
  rate_limit_rpm: number
  monthly_token_quota: number
  storage_quota_gb: number
  data_retention_days: number
  integrations: AdminOrganisationIntegrationPayload[]
  monthly_usage_trend: AdminOrganisationMonthlyUsagePointPayload[]
  impersonation: AdminOrganisationImpersonationPayload
}

export type AdminOrganisationsListPayload = {
  items: AdminOrganisationSummaryPayload[]
  total: number
  limit: number
  offset: number
  generated_at: string
}

export type AdminWorkspaceMemberPayload = {
  id: string
  name: string
  email: string
  platform_role: 'user' | 'admin'
  workspace_role: 'owner' | 'admin' | 'collaborator'
  last_active_at: string | null
}

export type AdminWorkspaceProjectSummaryPayload = {
  id: string
  title: string
  owner_user_id: string | null
  owner_name: string
  collaborator_count: number
  manuscript_count: number
  data_sources_count: number
  job_runs: number
  last_run_status: string
  last_activity_at: string | null
}

export type AdminWorkspaceJobHealthPayload = {
  total_runs: number
  active_runs: number
  queued_runs: number
  running_runs: number
  completed_runs: number
  failed_runs: number
  cancelled_runs: number
  retry_runs_7d: number
  failed_runs_7d: number
  avg_tokens_per_run: number
  avg_cost_usd_per_run: number
  last_job_at: string | null
}

export type AdminWorkspaceSummaryPayload = {
  id: string
  display_name: string
  owner_user_id: string | null
  owner_name: string
  owner_email: string
  member_count: number
  active_members_30d: number
  project_count: number
  manuscript_count: number
  data_sources_count: number
  storage_bytes: number
  export_history_count: number
  collaboration_density_pct: number
  last_activity_at: string | null
  members: AdminWorkspaceMemberPayload[]
  projects: AdminWorkspaceProjectSummaryPayload[]
  job_health: AdminWorkspaceJobHealthPayload
}

export type AdminWorkspacesListPayload = {
  items: AdminWorkspaceSummaryPayload[]
  total: number
  limit: number
  offset: number
  generated_at: string
}

export type AdminUsageCostsSummaryPayload = {
  tokens_current_month: number
  tool_calls_current_month: number
  cost_usd_current_month: number
  storage_bytes_total: number
  avg_chain_length: number
  cache_hit_rate_pct: number
  rate_limit_events_current_month: number
  quota_breaches_current_month: number
  budget_alerts_current_month: number
  failed_runs_current_month: number
  running_runs_current: number
}

export type AdminUsageCostsModelUsagePayload = {
  model: string
  tokens_current_month: number
  tool_calls_current_month: number
  cost_usd_current_month: number
  avg_cost_usd_per_call: number
}

export type AdminUsageCostsToolUsagePayload = {
  tool_type: string
  calls_current_month: number
  cost_usd_current_month: number
}

export type AdminUsageCostsOrganisationUsagePayload = {
  org_id: string
  org_name: string
  domain: string
  plan: string
  tokens_current_month: number
  tokens_previous_month: number
  tokens_trend_pct: number
  tool_calls_current_month: number
  cost_usd_current_month: number
  cost_usd_previous_month: number
  cost_trend_pct: number
  storage_bytes: number
  token_quota_monthly: number
  quota_used_pct: number
}

export type AdminUsageCostsUserUsagePayload = {
  user_id: string
  name: string
  email: string
  tokens_current_month: number
  tool_calls_current_month: number
  cost_usd_current_month: number
  storage_bytes: number
}

export type AdminUsageCostsMonthlyTrendPointPayload = {
  month: string
  tokens: number
  tool_calls: number
  cost_usd: number
}

export type AdminUsageCostsPayload = {
  generated_at: string
  summary: AdminUsageCostsSummaryPayload
  model_usage: AdminUsageCostsModelUsagePayload[]
  tool_usage: AdminUsageCostsToolUsagePayload[]
  organisation_usage: AdminUsageCostsOrganisationUsagePayload[]
  user_usage: AdminUsageCostsUserUsagePayload[]
  monthly_trend: AdminUsageCostsMonthlyTrendPointPayload[]
}

export type AdminApiMonitorSummaryPayload = {
  calls_current_month: number
  errors_current_month: number
  error_rate_pct_current_month: number
  tokens_current_month: number
  cost_usd_current_month: number
}

export type AdminApiMonitorOperationPayload = {
  operation: string
  calls: number
}

export type AdminApiMonitorErrorPayload = {
  operation: string
  endpoint: string
  status_code: number | null
  error_code: string | null
  created_at: string | null
}

export type AdminApiMonitorProviderPayload = {
  provider: string
  category: string
  configured: boolean
  health: string
  health_reason: string
  calls_current_month: number
  errors_current_month: number
  error_rate_pct_current_month: number
  avg_latency_ms_current_month: number
  tokens_current_month: number
  cost_usd_current_month: number
  last_called_at: string | null
  operations: AdminApiMonitorOperationPayload[]
  recent_errors: AdminApiMonitorErrorPayload[]
}

export type AdminApiMonitorMonthlyTrendPointPayload = {
  provider: string
  month: string
  calls: number
  errors: number
  cost_usd: number
}

export type AdminApiMonitorPayload = {
  generated_at: string
  summary: AdminApiMonitorSummaryPayload
  providers: AdminApiMonitorProviderPayload[]
  monthly_trend: AdminApiMonitorMonthlyTrendPointPayload[]
}

export type AdminJobSummaryPayload = {
  id: string
  status: string
  cancel_requested: boolean
  run_count: number
  retry_count: number
  parent_job_id: string | null
  project_id: string
  project_title: string
  workspace_id: string
  workspace_name: string
  manuscript_id: string
  owner_user_id: string | null
  owner_name: string
  owner_email: string
  pricing_model: string
  estimated_tokens: number
  estimated_cost_usd_high: number
  sections_count: number
  progress_percent: number
  current_section: string | null
  error_detail: string | null
  created_at: string | null
  started_at: string | null
  completed_at: string | null
  updated_at: string | null
  duration_seconds: number | null
}

export type AdminJobsQueueHealthPayload = {
  total_jobs: number
  active_jobs: number
  terminal_jobs: number
  queued_jobs: number
  running_jobs: number
  cancel_requested_jobs: number
  failed_jobs: number
  completed_jobs: number
  cancelled_jobs: number
  retryable_jobs: number
  backlog_jobs: number
}

export type AdminJobsListPayload = {
  items: AdminJobSummaryPayload[]
  total: number
  limit: number
  offset: number
  generated_at: string
  queue_health: AdminJobsQueueHealthPayload
}

export type AdminAuditEventPayload = {
  id: string
  action: string
  target_type: string
  target_id: string
  status: string
  actor_user_id: string | null
  actor_name: string
  actor_email: string
  metadata: Record<string, unknown>
  created_at: string
}

export type AdminJobActionPayload = {
  action: 'cancel' | 'retry'
  message: string
  source_job_id: string
  job: AdminJobSummaryPayload
  audit_event: AdminAuditEventPayload
}

export type AdminOrganisationImpersonationStartPayload = {
  org_id: string
  org_name: string
  domain: string
  target_user_id: string
  target_user_name: string
  target_user_email: string
  impersonation_ticket: string
  started_at: string
  expires_at: string
  audited: boolean
  audit_event: AdminAuditEventPayload
}

export type AdminAuditActionTotalPayload = {
  action: string
  count: number
}

export type AdminAuditEventsSummaryPayload = {
  success_count: number
  failure_count: number
  action_totals: AdminAuditActionTotalPayload[]
}

export type AdminAuditEventsListPayload = {
  items: AdminAuditEventPayload[]
  total: number
  limit: number
  offset: number
  generated_at: string
  summary: AdminAuditEventsSummaryPayload
}

export type AffiliationSuggestionItemPayload = {
  name: string
  label: string
  country_code: string | null
  country_name: string | null
  city: string | null
  region: string | null
  address: string | null
  postal_code: string | null
  source: 'openai' | 'openalex' | 'ror' | 'openstreetmap' | 'clearbit'
}

export type AffiliationSuggestionsPayload = {
  query: string
  limit: number
  items: AffiliationSuggestionItemPayload[]
}

export type AffiliationAddressResolutionPayload = {
  resolved: boolean
  name: string
  line_1: string | null
  city: string | null
  region: string | null
  postal_code: string | null
  country_name: string | null
  country_code: string | null
  formatted: string | null
  source: 'openai' | 'openstreetmap' | null
}

export type AuthLoginChallengePayload = {
  status: 'authenticated' | 'two_factor_required'
  session: AuthSessionPayload | null
  challenge_token: string | null
  challenge_expires_at: string | null
  user_hint: Record<string, string>
}

export type AuthTwoFactorStatePayload = {
  enabled: boolean
  backup_codes_remaining: number
  confirmed_at: string | null
}

export type AuthTwoFactorSetupPayload = {
  secret: string
  otpauth_uri: string
  backup_codes: string[]
}

export type PersonaWork = {
  id: string
  title: string
  year: number | null
  doi: string | null
  work_type: string
  publication_type?: string | null
  venue_name: string
  publisher: string
  abstract: string | null
  keywords: string[]
  url: string
  provenance: string
  cluster_id: string | null
  authors: string[]
  user_author_position?: number | null
  author_count?: number | null
  pmid: string | null
  journal_impact_factor: number | null
  created_at: string
  updated_at: string
}

export type PersonaMetricsSyncPayload = {
  synced_snapshots: number
  provider_attribution: Record<string, number>
  core_collaborators: Array<{
    author_id: string
    name: string
    n_shared_works: number
    first_year: number | null
    last_year: number | null
  }>
}

export type PublicationsAnalyticsSummaryPayload = {
  total_citations: number
  h_index: number
  citation_velocity_12m: number
  citations_last_12_months: number
  citations_previous_12_months: number
  citations_per_month_12m: number
  citations_per_month_previous_12m: number
  acceleration_citations_per_month: number
  yoy_percent: number | null
  yoy_pct: number | null
  citations_ytd: number
  ytd_year: number | null
  cagr_3y: number | null
  slope_3y: number | null
  top5_share_12m_pct: number
  top10_share_12m_pct: number
  computed_at: string
}

export type PublicationsAnalyticsTimeseriesPayload = {
  computed_at: string
  points: Array<{
    year: number
    citations_added: number
    total_citations_end_year: number
  }>
}

export type PublicationsAnalyticsTopDriversPayload = {
  computed_at: string
  window: string
  drivers: Array<{
    work_id: string
    title: string
    year: number | null
    doi: string | null
    citations_last_12_months: number
    current_citations: number
    provider: string
    share_12m_pct: number
    primary_domain_label: string
    momentum_badge: string
  }>
}

export type PublicationsAnalyticsDomainBreakdownPayload = {
  label: string
  citations_last_12_months: number
  share_12m_pct: number
  works_count: number
}

export type PublicationsAnalyticsPayload = {
  schema_version: number
  computed_at: string | null
  summary: PublicationsAnalyticsSummaryPayload
  timeseries: PublicationsAnalyticsTimeseriesPayload
  top_drivers: PublicationsAnalyticsTopDriversPayload
  per_year: Array<Record<string, unknown>>
  domain_breakdown_12m: PublicationsAnalyticsDomainBreakdownPayload[]
  metadata: Record<string, unknown>
}

export type PublicationsAnalyticsResponsePayload = {
  payload: PublicationsAnalyticsPayload
  computed_at: string | null
  status: 'READY' | 'RUNNING' | 'FAILED'
  is_stale: boolean
  is_updating: boolean
  last_update_failed: boolean
}

export type PublicationMetricDrilldownPayload = {
  title: string
  definition: string
  formula: string
  confidence_note: string
  tile_id?: string
  as_of_date?: string | null
  windows?: Array<Record<string, unknown>>
  headline_metrics?: Array<Record<string, unknown>>
  series?: Array<Record<string, unknown>>
  breakdowns?: Array<Record<string, unknown>>
  benchmarks?: Array<Record<string, unknown>>
  methods?: Record<string, unknown>
  qc_flags?: Array<Record<string, unknown>>
  publications: Array<Record<string, unknown>>
  metadata: Record<string, unknown>
}

export type PublicationMetricTilePayload = {
  id: string
  key: string
  label: string
  main_value: number | null
  value: number | null
  main_value_display: string
  value_display: string
  delta_value: number | null
  delta_display: string | null
  delta_direction: 'up' | 'down' | 'flat' | 'na'
  delta_tone: 'positive' | 'neutral' | 'caution' | 'negative'
  delta_color_code: string
  unit: string | null
  subtext: string
  badge: Record<string, unknown>
  chart_type: string
  chart_data: Record<string, unknown>
  sparkline: number[]
  sparkline_overlay: number[]
  tooltip: string
  tooltip_details: Record<string, unknown>
  data_source: string[]
  confidence_score: number
  stability: 'stable' | 'unstable'
  drilldown: PublicationMetricDrilldownPayload
}

export type PublicationsTopMetricsPayload = {
  tiles: PublicationMetricTilePayload[]
  data_sources: string[]
  data_last_refreshed: string | null
  metadata: Record<string, unknown>
  computed_at: string | null
  status: 'READY' | 'RUNNING' | 'FAILED'
  is_stale: boolean
  is_updating: boolean
  last_error: string | null
}

export type PublicationsTopMetricsRefreshPayload = {
  enqueued: boolean
  status: 'READY' | 'RUNNING' | 'FAILED'
  metric_key: string
}

export type PublicationMetricDetailPayload = {
  metric_id: string
  tile: PublicationMetricTilePayload
  data_sources: string[]
  data_last_refreshed: string | null
  computed_at: string | null
  status: 'READY' | 'RUNNING' | 'FAILED'
  is_stale: boolean
  is_updating: boolean
  last_error: string | null
}

export type PublicationDetailPayload = {
  id: string
  title: string
  year: number | null
  journal: string
  publication_type: string
  article_type?: string | null
  citations_total: number
  doi: string | null
  pmid: string | null
  openalex_work_id: string | null
  abstract: string | null
  structured_abstract?: {
    format: string
    sections: Array<{
      key: string
      label: string
      content: string
    }>
    keywords?: string[]
    source_abstract: string | null
    metadata: Record<string, unknown>
  } | null
  structured_abstract_status?: 'READY' | 'RUNNING' | 'FAILED' | 'MISSING'
  structured_abstract_computed_at?: string | null
  structured_abstract_last_error?: string | null
  keywords_json: string[]
  authors_json: Array<Record<string, unknown>>
  affiliations_json: Array<Record<string, unknown>>
  created_at: string
  updated_at: string
}

export type PublicationAuthorsPayload = {
  status: 'READY' | 'RUNNING' | 'FAILED'
  authors_json: Array<Record<string, unknown>>
  affiliations_json: Array<Record<string, unknown>>
  computed_at: string | null
  is_stale: boolean
  is_updating: boolean
  last_error: string | null
}

export type PublicationImpactPayload = {
  citations_total: number
  citations_last_12m: number
  citations_prev_12m: number
  yoy_pct: number | null
  acceleration_citations_per_month: number
  per_year: Array<{
    year: number
    citations: number
    yoy_delta: number | null
    yoy_pct: number | null
  }>
  portfolio_context: {
    paper_share_total_pct: number
    paper_share_12m_pct: number
    portfolio_rank_total: number | null
    portfolio_rank_12m: number | null
  }
  top_citing_journals: Array<{ name: string; count: number }>
  top_citing_countries: Array<{ name: string; count: number }>
  key_citing_papers: Array<{
    title: string
    year: number | null
    journal: string
    doi: string | null
    pmid: string | null
    citations_total: number
  }>
  metadata: Record<string, unknown>
}

export type PublicationImpactResponsePayload = {
  payload: PublicationImpactPayload
  computed_at: string | null
  status: 'READY' | 'RUNNING' | 'FAILED'
  is_stale: boolean
  is_updating: boolean
  last_error: string | null
}

export type PublicationAiInsightsPayload = {
  label: string
  performance_summary: string
  trajectory_classification:
    | 'EARLY_SPIKE'
    | 'SLOW_BURN'
    | 'CONSISTENT'
    | 'DECLINING'
    | 'ACCELERATING'
    | 'UNKNOWN'
  extractive_key_points: {
    objective: string
    methods: string
    main_findings: string
    conclusion: string
  }
  reuse_suggestions: string[]
  caution_flags: string[]
}

export type PublicationAiInsightsResponsePayload = {
  payload: PublicationAiInsightsPayload
  computed_at: string | null
  status: 'READY' | 'RUNNING' | 'FAILED'
  is_stale: boolean
  is_updating: boolean
  last_error: string | null
}

export type PublicationFilePayload = {
  id: string
  file_name: string
  file_type: 'PDF' | 'DOCX' | 'OTHER'
  source: 'OA_LINK' | 'USER_UPLOAD'
  oa_url: string | null
  checksum: string | null
  created_at: string
  download_url: string | null
}

export type PublicationFilesListPayload = {
  items: PublicationFilePayload[]
}

export type PublicationFileLinkPayload = {
  created: boolean
  file: PublicationFilePayload | null
  message: string
}

export type CollaboratorMetricsPayload = {
  coauthored_works_count: number
  shared_citations_total: number
  first_collaboration_year: number | null
  last_collaboration_year: number | null
  citations_last_12m: number
  collaboration_strength_score: number
  classification: 'CORE' | 'ACTIVE' | 'OCCASIONAL' | 'HISTORIC' | 'UNCLASSIFIED'
  relationship_tier?: 'CORE' | 'REGULAR' | 'OCCASIONAL' | 'UNCLASSIFIED'
  activity_status?: 'ACTIVE' | 'RECENT' | 'DORMANT' | 'HISTORIC' | 'UNCLASSIFIED'
  computed_at: string | null
  status: 'READY' | 'RUNNING' | 'FAILED'
}

export type CollaboratorPayload = {
  id: string
  owner_user_id: string
  full_name: string
  preferred_name: string | null
  email: string | null
  orcid_id: string | null
  openalex_author_id: string | null
  primary_institution: string | null
  department: string | null
  country: string | null
  current_position: string | null
  research_domains: string[]
  notes: string | null
  created_at: string
  updated_at: string
  metrics: CollaboratorMetricsPayload
  duplicate_warnings: string[]
}

export type CollaboratorsListPayload = {
  items: CollaboratorPayload[]
  page: number
  page_size: number
  total: number
  has_more: boolean
}

export type CollaborationMetricsSummaryPayload = {
  total_collaborators: number
  core_collaborators: number
  active_collaborations_12m: number
  new_collaborators_12m: number
  last_computed_at: string | null
  status: 'READY' | 'RUNNING' | 'FAILED'
  is_stale: boolean
  is_updating: boolean
  last_update_failed: boolean
}

export type CollaborationImportOpenAlexPayload = {
  created_count: number
  updated_count: number
  skipped_count: number
  openalex_author_id: string | null
  imported_candidates: number
}

export type CollaborationEnrichOpenAlexPayload = {
  targeted_count: number
  resolved_author_count: number
  updated_count: number
  unchanged_count: number
  skipped_without_identifier: number
  failed_count: number
  enqueued_metrics_recompute: boolean
  field_updates: Record<string, number>
}

export type CollaborationAiInsightsPayload = {
  status: 'draft'
  insights: string[]
  suggested_actions: string[]
  provenance: Record<string, unknown>
}

export type CollaborationAiAuthorSuggestionItem = {
  collaborator_id: string
  full_name: string
  institution: string | null
  orcid_id: string | null
  classification: 'CORE' | 'ACTIVE' | 'OCCASIONAL' | 'HISTORIC' | 'UNCLASSIFIED'
  score: number
  explanation: string
  matched_keywords: string[]
  matched_methods: string[]
}

export type CollaborationAiAuthorSuggestionsPayload = {
  status: 'draft'
  topic_keywords: string[]
  methods: string[]
  suggestions: CollaborationAiAuthorSuggestionItem[]
  provenance: Record<string, unknown>
}

export type CollaborationAiContributionRoleItem = {
  full_name: string
  roles: string[]
  is_corresponding: boolean
  equal_contribution: boolean
  is_external: boolean
}

export type CollaborationAiContributionDraftPayload = {
  status: 'draft'
  credit_statements: CollaborationAiContributionRoleItem[]
  draft_text: string
  provenance: Record<string, unknown>
}

export type CollaborationAiAffiliationAuthorItem = {
  full_name: string
  institution: string
  orcid_id: string | null
  superscript_number: number
}

export type CollaborationAiAffiliationItem = {
  superscript_number: number
  institution_name: string
}

export type CollaborationAiAffiliationsNormalisePayload = {
  status: 'draft'
  normalized_authors: CollaborationAiAffiliationAuthorItem[]
  affiliations: CollaborationAiAffiliationItem[]
  affiliations_block: string
  coi_boilerplate: string
  provenance: Record<string, unknown>
}

export type PersonaEmbeddingsGeneratePayload = {
  generated_embeddings: number
  model_name: string
  clusters: Array<{
    cluster_id: string
    label: string
    n_works: number
    citation_mean: number
  }>
}

export type ImpactCollaboratorsPayload = {
  collaborators: Array<{
    author_id: string
    name: string
    n_shared_works: number
    first_year: number | null
    last_year: number | null
  }>
  new_collaborators_by_year: Record<string, number>
}

export type ImpactThemesPayload = {
  clusters: Array<{
    cluster_id: string
    label: string
    n_works: number
    citation_mean: number
  }>
}

export type ImpactRecomputePayload = {
  user_id: string
  total_works: number
  total_citations: number
  h_index: number
  m_index: number
  citation_velocity: number
  dominant_theme: string
  computed_at: string
  most_cited_work: Record<string, unknown> | null
  top_collaborator: Record<string, unknown> | null
  collaboration_density: number
  theme_citation_averages: Array<Record<string, unknown>>
  publication_timeline: Array<Record<string, unknown>>
  provider_attribution: string[]
}

export type ImpactAnalysePayload = {
  scholarly_impact_summary: string
  collaboration_analysis: string
  thematic_evolution: string
  strengths: string[]
  blind_spots: string[]
  strategic_suggestions: string[]
  grant_positioning_notes: string[]
  confidence_markers: string[]
  model_used: string
}

export type ImpactReportPayload = {
  executive_summary: string
  scholarly_metrics: Record<string, unknown>
  collaboration_profile: string
  thematic_profile: string
  strategic_analysis: string
  projected_trajectory: string
}

export type PersonaContextPayload = {
  dominant_themes: string[]
  common_study_types: string[]
  top_venues: string[]
  frequent_collaborators: string[]
  methodological_patterns: string[]
  works_used: Array<{
    work_id: string
    title: string
    year: number | null
    doi: string | null
  }>
}

export type OrcidConnectPayload = {
  url: string
  state: string
}

export type OrcidStatusPayload = {
  configured: boolean
  linked: boolean
  orcid_id: string | null
  redirect_uri: string
  can_import: boolean
  issues: string[]
}

export type AuthOAuthConnectPayload = {
  provider: 'google' | 'microsoft'
  state: string
  url: string
}

export type AuthOAuthProviderStatusItem = {
  provider: 'google' | 'microsoft'
  configured: boolean
  reason: string
}

export type AuthOAuthProviderStatusesPayload = {
  providers: AuthOAuthProviderStatusItem[]
}

export type AuthOAuthCallbackPayload = {
  provider: 'google' | 'microsoft'
  is_new_user: boolean
  user: AuthUser
  session_token: string
  session_expires_at: string
}

export type AuthEmailVerificationRequestPayload = {
  requested: boolean
  already_verified: boolean
  expires_at: string | null
  delivery_hint: string
  code_preview: string | null
}

export type AuthPasswordResetRequestPayload = {
  requested: boolean
  expires_at: string | null
  delivery_hint: string
  code_preview: string | null
}

export type AuthPasswordResetConfirmPayload = {
  success: boolean
}

export type OrcidImportPayload = {
  imported_count: number
  work_ids: string[]
  provenance: string
  last_synced_at: string
  core_collaborators: Array<Record<string, unknown>>
}

export type PersonaSyncJobPayload = {
  id: string
  user_id: string
  job_type: string
  status: 'queued' | 'running' | 'completed' | 'failed'
  overwrite_user_metadata: boolean
  run_metrics_sync: boolean
  refresh_analytics: boolean
  refresh_metrics: boolean
  providers: string[]
  progress_percent: number
  current_stage: string | null
  result_json: Record<string, unknown>
  error_detail: string | null
  started_at: string | null
  completed_at: string | null
  created_at: string
  updated_at: string
}

export type PersonaStatePayload = {
  works: PersonaWork[]
  collaborators: ImpactCollaboratorsPayload
  themes: ImpactThemesPayload
  timeline: Array<{
    year: number
    n_works: number
    citations: number
  }>
  metrics: {
    works: Array<{
      work_id: string
      title: string
      year: number | null
      citations: number
      provider: string
    }>
    histogram: Record<string, number>
    trend?: {
      citations_last_12_months: number
      citations_previous_12_months: number
      yoy_growth_percent: number | null
      yearly_growth: Array<{
        year: number
        citations_added: number
        total_citations_end_year: number
      }>
    }
  }
  context: PersonaContextPayload
  sync_status: {
    works_last_synced_at: string | null
    works_last_updated_at: string | null
    metrics_last_synced_at: string | null
    themes_last_generated_at: string | null
    impact_last_computed_at: string | null
    orcid_last_synced_at: string | null
  }
}
