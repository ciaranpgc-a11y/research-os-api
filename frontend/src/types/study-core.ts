export type JournalOption = {
  slug: string
  display_name: string
  default_voice: string
}

export type ProjectRecord = {
  id: string
  title: string
  target_journal: string
  journal_voice: string | null
  language: string
  study_type: string | null
  study_brief: string | null
  created_at: string
  updated_at: string
}

export type ManuscriptRecord = {
  id: string
  project_id: string
  branch_name: string
  status: string
  sections: Record<string, string>
  created_at: string
  updated_at: string
}

export type WizardQuestion = {
  id: string
  label: string
  kind: string
  required: boolean
  options?: string[] | null
}

export type WizardInferState = {
  target_journal: string
  journal_voice: string
  inferred_study_type: string
  inferred_primary_endpoint_type: string
  recommended_sections: string[]
  answered_fields: string[]
  next_questions: WizardQuestion[]
}

export type WizardBootstrapPayload = {
  project: ProjectRecord
  manuscript: ManuscriptRecord
  inference: WizardInferState
}

export type GenerationEstimate = {
  pricing_model: string
  estimated_input_tokens: number
  estimated_output_tokens_low: number
  estimated_output_tokens_high: number
  estimated_cost_usd_low: number
  estimated_cost_usd_high: number
}

export type SectionPlanItem = {
  section: string
  objective: string
  must_include: string[]
  evidence_expectations: string[]
  qc_focus: string[]
  target_words_low: number
  target_words_high: number
  estimated_cost_usd_low: number
  estimated_cost_usd_high: number
}

export type SectionPlanPayload = {
  inferred_study_type: string
  inferred_primary_endpoint_type: string
  recommended_sections: string[]
  items: SectionPlanItem[]
  total_estimated_cost_usd_low: number
  total_estimated_cost_usd_high: number
}

export type ClaimLinkSuggestion = {
  claim_id: string
  claim_heading: string
  result_id: string
  result_type: string
  confidence: 'high' | 'medium' | 'low'
  rationale: string
  suggested_anchor_label: string
}

export type ClaimLinkerPayload = {
  run_id: string
  generated_at: string
  suggestions: ClaimLinkSuggestion[]
}

export type GenerationJobPayload = {
  id: string
  project_id: string
  manuscript_id: string
  status: 'queued' | 'running' | 'cancel_requested' | 'completed' | 'failed' | 'cancelled'
  cancel_requested: boolean
  run_count: number
  parent_job_id: string | null
  sections: string[]
  notes_context: string
  progress_percent: number
  current_section: string | null
  error_detail: string | null
  started_at: string | null
  completed_at: string | null
  created_at: string
  updated_at: string
  pricing_model: string
  estimated_input_tokens: number
  estimated_output_tokens_low: number
  estimated_output_tokens_high: number
  estimated_cost_usd_low: number
  estimated_cost_usd_high: number
}

