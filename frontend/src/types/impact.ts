export type AuthUser = {
  id: string
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
  venue_name: string
  publisher: string
  abstract: string | null
  keywords: string[]
  url: string
  provenance: string
  cluster_id: string | null
  authors: string[]
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

export type CollaboratorMetricsPayload = {
  coauthored_works_count: number
  shared_citations_total: number
  first_collaboration_year: number | null
  last_collaboration_year: number | null
  citations_last_12m: number
  collaboration_strength_score: number
  classification: 'CORE' | 'ACTIVE' | 'OCCASIONAL' | 'HISTORIC' | 'UNCLASSIFIED'
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
  provider: 'orcid' | 'google' | 'microsoft'
  state: string
  url: string
}

export type AuthOAuthProviderStatusItem = {
  provider: 'orcid' | 'google' | 'microsoft'
  configured: boolean
  reason: string
}

export type AuthOAuthProviderStatusesPayload = {
  providers: AuthOAuthProviderStatusItem[]
}

export type AuthOAuthCallbackPayload = {
  provider: 'orcid' | 'google' | 'microsoft'
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
