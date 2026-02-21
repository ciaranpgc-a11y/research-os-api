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

export type OutlinePlanSection = {
  name: string
  bullets: string[]
  tags?: string[]
}

export type OutlinePlanState = {
  sections: OutlinePlanSection[]
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

export type GroundedDraftEvidenceLinkInput = {
  claim_id: string
  claim_heading: string
  result_id: string
  confidence: 'high' | 'medium' | 'low'
  rationale: string
  suggested_anchor_label: string
}

export type GroundedDraftPass = {
  name: string
  content: string
}

export type GroundedDraftPayload = {
  section: string
  style_profile: 'technical' | 'concise' | 'narrative_review'
  generation_mode: 'full' | 'targeted'
  draft: string
  passes: GroundedDraftPass[]
  evidence_anchor_labels: string[]
  citation_ids: string[]
  unsupported_sentences: string[]
  persisted: boolean
  manuscript: ManuscriptRecord | null
}

export type TitleAbstractPayload = {
  title: string
  abstract: string
  style_profile: 'technical' | 'concise' | 'narrative_review'
  persisted: boolean
  manuscript: ManuscriptRecord | null
}

export type ConsistencyIssuePayload = {
  id: string
  severity: 'high' | 'medium' | 'low'
  type: string
  summary: string
  suggested_fix: string
  sections: string[]
}

export type ConsistencyCheckPayload = {
  run_id: string
  generated_at: string
  total_issues: number
  high_severity_count: number
  medium_severity_count: number
  low_severity_count: number
  issues: ConsistencyIssuePayload[]
}

export type ParagraphConstraint = 'shorter' | 'more_cautious' | 'journal_tone' | 'keep_stats_unchanged'

export type ParagraphRegenerationPayload = {
  section: string
  paragraph_index: number
  constraints: ParagraphConstraint[]
  original_paragraph: string
  regenerated_paragraph: string
  updated_section_text: string
  unsupported_sentences: string[]
  persisted: boolean
  manuscript: ManuscriptRecord | null
}

export type CitationAutofillSuggestion = {
  citation_id: string
  confidence: 'high' | 'medium' | 'low'
  reason: string
}

export type ClaimCitationAutofillState = {
  claim_id: string
  required_slots: number
  attached_citation_ids: string[]
  missing_slots: number
  suggestions: CitationAutofillSuggestion[]
  autofill_applied: boolean
}

export type CitationAutofillPayload = {
  run_id: string
  generated_at: string
  updated_claims: ClaimCitationAutofillState[]
}

export type SubmissionPackPayload = {
  run_id: string
  generated_at: string
  target_journal: string
  style_profile: 'technical' | 'concise' | 'narrative_review'
  cover_letter: string
  key_points: string[]
  highlights: string[]
  plain_language_summary: string
}

export type TextRecommendation = {
  value: string
  rationale: string
}

export type ResearchOverviewSuggestionsPayload = {
  summary_refinements: string[]
  research_category_suggestion: TextRecommendation | null
  research_type_suggestion: TextRecommendation | null
  interpretation_mode_recommendation: TextRecommendation | null
  article_type_recommendation: TextRecommendation | null
  word_length_recommendation: TextRecommendation | null
  guidance_suggestions: string[]
  source_urls: string[]
  model_used: string
}

export type Step2ClarificationResponse = {
  id: string
  prompt: string
  answer: 'yes' | 'no' | ''
  comment: string
}

export type PlanClarificationQuestion = {
  id: string
  prompt: string
  rationale: string
}

export type PlanClarificationQuestionsPayload = {
  questions: PlanClarificationQuestion[]
  model_used: string
}

export type PlanClarificationHistoryItem = {
  prompt: string
  answer: 'yes' | 'no'
  comment: string
}

export type PlanClarificationNextQuestionPayload = {
  question: PlanClarificationQuestion | null
  completed: boolean
  ready_for_plan: boolean
  confidence_percent: number
  additional_questions_for_full_confidence: number
  advice: string
  asked_count: number
  max_questions: number
  model_used: string
}
