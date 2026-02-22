export type AuthUser = {
  id: string
  email: string
  name: string
  is_active: boolean
  role: 'user' | 'admin'
  orcid_id: string | null
  impact_last_computed_at: string | null
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

export type AuthOAuthConnectPayload = {
  provider: 'orcid' | 'google' | 'microsoft'
  state: string
  url: string
}

export type AuthOAuthCallbackPayload = {
  provider: 'orcid' | 'google' | 'microsoft'
  is_new_user: boolean
  user: AuthUser
  session_token: string
  session_expires_at: string
}

export type OrcidImportPayload = {
  imported_count: number
  work_ids: string[]
  provenance: string
  last_synced_at: string
  core_collaborators: Array<Record<string, unknown>>
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
  }
  context: PersonaContextPayload
}
