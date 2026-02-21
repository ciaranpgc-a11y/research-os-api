import { API_BASE_URL } from '@/lib/api'
import type { ApiErrorPayload } from '@/types/insight'
import type { QCRunResponse } from '@/types/qc-run'
import type {
  CitationAutofillPayload,
  ClaimLinkerPayload,
  ConsistencyCheckPayload,
  GenerationEstimate,
  ParagraphConstraint,
  ParagraphRegenerationPayload,
  SubmissionPackPayload,
  GroundedDraftEvidenceLinkInput,
  GroundedDraftPayload,
  GenerationJobPayload,
  JournalOption,
  PlanClarificationHistoryItem,
  PlanClarificationNextQuestionPayload,
  PlanClarificationQuestionsPayload,
  PlanSectionEditPayload,
  ManuscriptRecord,
  ProjectRecord,
  ResearchOverviewSuggestionsPayload,
  SectionPlanPayload,
  TitleAbstractPayload,
  WizardBootstrapPayload,
} from '@/types/study-core'

async function parseApiError(response: Response, fallback: string): Promise<string> {
  try {
    const payload = (await response.json()) as ApiErrorPayload
    return payload.error?.detail || payload.error?.message || fallback
  } catch {
    return fallback
  }
}

export async function fetchJournalOptions(): Promise<JournalOption[]> {
  const response = await fetch(`${API_BASE_URL}/v1/journals`)
  if (!response.ok) {
    throw new Error(await parseApiError(response, `Journal lookup failed (${response.status})`))
  }
  return (await response.json()) as JournalOption[]
}

export async function bootstrapRunContext(input: {
  title: string
  targetJournal: string
  answers: Record<string, string>
}): Promise<WizardBootstrapPayload> {
  const response = await fetch(`${API_BASE_URL}/v1/wizard/bootstrap`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      title: input.title,
      target_journal: input.targetJournal,
      answers: input.answers,
      branch_name: 'main',
      language: 'en-GB',
    }),
  })
  if (!response.ok) {
    throw new Error(await parseApiError(response, `Bootstrap failed (${response.status})`))
  }
  return (await response.json()) as WizardBootstrapPayload
}

export async function estimateGeneration(input: {
  sections: string[]
  notesContext: string
}): Promise<GenerationEstimate> {
  const response = await fetch(`${API_BASE_URL}/v1/aawe/generation/estimate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      sections: input.sections,
      notes_context: input.notesContext,
    }),
  })
  if (!response.ok) {
    throw new Error(await parseApiError(response, `Cost estimate failed (${response.status})`))
  }
  return (await response.json()) as GenerationEstimate
}

export async function planSections(input: {
  targetJournal: string
  answers: Record<string, string>
  sections: string[]
}): Promise<SectionPlanPayload> {
  const response = await fetch(`${API_BASE_URL}/v1/aawe/plan/sections`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      target_journal: input.targetJournal,
      answers: input.answers,
      sections: input.sections,
    }),
  })
  if (!response.ok) {
    throw new Error(await parseApiError(response, `Section planning failed (${response.status})`))
  }
  return (await response.json()) as SectionPlanPayload
}

export async function fetchPlanClarificationQuestions(input: {
  projectTitle: string
  targetJournal: string
  targetJournalLabel: string
  researchCategory: string
  studyType: string
  interpretationMode: string
  articleType: string
  wordLength: string
  summaryOfResearch: string
}): Promise<PlanClarificationQuestionsPayload> {
  const response = await fetch(`${API_BASE_URL}/v1/aawe/plan/clarification-questions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      project_title: input.projectTitle,
      target_journal: input.targetJournal,
      target_journal_label: input.targetJournalLabel,
      research_category: input.researchCategory,
      study_type: input.studyType,
      interpretation_mode: input.interpretationMode,
      article_type: input.articleType,
      word_length: input.wordLength,
      summary_of_research: input.summaryOfResearch,
    }),
  })
  if (!response.ok) {
    throw new Error(await parseApiError(response, `Clarification questions failed (${response.status})`))
  }
  return (await response.json()) as PlanClarificationQuestionsPayload
}

export async function fetchNextPlanClarificationQuestion(input: {
  projectTitle: string
  targetJournal: string
  targetJournalLabel: string
  researchCategory: string
  studyType: string
  interpretationMode: string
  articleType: string
  wordLength: string
  summaryOfResearch: string
  studyTypeOptions?: string[]
  history: PlanClarificationHistoryItem[]
  maxQuestions?: number
  forceNextQuestion?: boolean
}): Promise<PlanClarificationNextQuestionPayload> {
  const response = await fetch(`${API_BASE_URL}/v1/aawe/plan/clarification-question/next`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      project_title: input.projectTitle,
      target_journal: input.targetJournal,
      target_journal_label: input.targetJournalLabel,
      research_category: input.researchCategory,
      study_type: input.studyType,
      interpretation_mode: input.interpretationMode,
      article_type: input.articleType,
      word_length: input.wordLength,
      summary_of_research: input.summaryOfResearch,
      study_type_options: input.studyTypeOptions ?? [],
      history: input.history,
      max_questions: input.maxQuestions ?? 10,
      force_next_question: input.forceNextQuestion ?? false,
    }),
  })
  if (!response.ok) {
    throw new Error(await parseApiError(response, `Next clarification question failed (${response.status})`))
  }
  return (await response.json()) as PlanClarificationNextQuestionPayload
}

export async function editPlanManuscriptSection(input: {
  section: 'introduction' | 'methods' | 'results' | 'discussion'
  sectionText: string
  editInstruction: string
  selectedText: string
  projectTitle: string
  targetJournalLabel: string
  researchCategory: string
  studyType: string
  interpretationMode: string
  articleType: string
  wordLength: string
  summaryOfResearch: string
}): Promise<PlanSectionEditPayload> {
  const response = await fetch(`${API_BASE_URL}/v1/aawe/plan/manuscript-section/edit`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      section: input.section,
      section_text: input.sectionText,
      edit_instruction: input.editInstruction,
      selected_text: input.selectedText,
      project_title: input.projectTitle,
      target_journal_label: input.targetJournalLabel,
      research_category: input.researchCategory,
      study_type: input.studyType,
      interpretation_mode: input.interpretationMode,
      article_type: input.articleType,
      word_length: input.wordLength,
      summary_of_research: input.summaryOfResearch,
    }),
  })
  if (!response.ok) {
    throw new Error(await parseApiError(response, `Plan section edit failed (${response.status})`))
  }
  return (await response.json()) as PlanSectionEditPayload
}

export async function fetchResearchOverviewSuggestions(input: {
  targetJournal: string
  researchCategory: string
  researchType: string
  studyTypeOptions: string[]
  articleType: string
  interpretationMode: string
  summaryOfResearch: string
}): Promise<ResearchOverviewSuggestionsPayload> {
  let response: Response
  try {
    response = await fetch(`${API_BASE_URL}/v1/aawe/research-overview/suggestions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        target_journal: input.targetJournal,
        research_category: input.researchCategory,
        research_type: input.researchType,
        study_type_options: input.studyTypeOptions,
        article_type: input.articleType,
        interpretation_mode: input.interpretationMode,
        summary_of_research: input.summaryOfResearch,
      }),
    })
  } catch {
    const currentOrigin = typeof window !== 'undefined' ? window.location.origin : 'unknown-origin'
    throw new Error(
      `Could not reach API at ${API_BASE_URL}. Current UI origin: ${currentOrigin}. Start backend service or allow this origin in CORS.`,
    )
  }
  if (!response.ok) {
    throw new Error(await parseApiError(response, `Research overview suggestions failed (${response.status})`))
  }
  return (await response.json()) as ResearchOverviewSuggestionsPayload
}

export async function runClaimLinker(input: {
  claimIds: string[]
  minConfidence: 'high' | 'medium' | 'low'
}): Promise<ClaimLinkerPayload> {
  const response = await fetch(`${API_BASE_URL}/v1/aawe/linker/claims`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      claim_ids: input.claimIds,
      min_confidence: input.minConfidence,
    }),
  })
  if (!response.ok) {
    throw new Error(await parseApiError(response, `Claim linker failed (${response.status})`))
  }
  return (await response.json()) as ClaimLinkerPayload
}

export async function generateGroundedDraft(input: {
  section: string
  notesContext: string
  styleProfile: 'technical' | 'concise' | 'narrative_review'
  generationMode: 'full' | 'targeted'
  planObjective: string | null
  mustInclude: string[]
  evidenceLinks: GroundedDraftEvidenceLinkInput[]
  targetInstruction: string | null
  lockedText: string | null
  persistToManuscript: boolean
  projectId: string | null
  manuscriptId: string | null
}): Promise<GroundedDraftPayload> {
  const response = await fetch(`${API_BASE_URL}/v1/aawe/draft/grounded`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      section: input.section,
      notes_context: input.notesContext,
      style_profile: input.styleProfile,
      generation_mode: input.generationMode,
      plan_objective: input.planObjective,
      must_include: input.mustInclude,
      evidence_links: input.evidenceLinks,
      target_instruction: input.targetInstruction,
      locked_text: input.lockedText,
      persist_to_manuscript: input.persistToManuscript,
      project_id: input.projectId,
      manuscript_id: input.manuscriptId,
    }),
  })
  if (!response.ok) {
    throw new Error(await parseApiError(response, `Grounded draft generation failed (${response.status})`))
  }
  return (await response.json()) as GroundedDraftPayload
}

export async function synthesizeTitleAbstract(input: {
  projectId: string
  manuscriptId: string
  styleProfile: 'technical' | 'concise' | 'narrative_review'
  maxAbstractWords: number
  persistToManuscript: boolean
}): Promise<TitleAbstractPayload> {
  const response = await fetch(
    `${API_BASE_URL}/v1/aawe/projects/${encodeURIComponent(input.projectId)}/manuscripts/${encodeURIComponent(input.manuscriptId)}/synthesize/title-abstract`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        style_profile: input.styleProfile,
        max_abstract_words: input.maxAbstractWords,
        persist_to_manuscript: input.persistToManuscript,
      }),
    },
  )
  if (!response.ok) {
    throw new Error(await parseApiError(response, `Title/abstract synthesis failed (${response.status})`))
  }
  return (await response.json()) as TitleAbstractPayload
}

export async function generateSubmissionPack(input: {
  projectId: string
  manuscriptId: string
  styleProfile: 'technical' | 'concise' | 'narrative_review'
  includePlainLanguageSummary: boolean
}): Promise<SubmissionPackPayload> {
  const response = await fetch(
    `${API_BASE_URL}/v1/aawe/projects/${encodeURIComponent(input.projectId)}/manuscripts/${encodeURIComponent(input.manuscriptId)}/submission-pack`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        style_profile: input.styleProfile,
        include_plain_language_summary: input.includePlainLanguageSummary,
      }),
    },
  )
  if (!response.ok) {
    throw new Error(await parseApiError(response, `Submission pack generation failed (${response.status})`))
  }
  return (await response.json()) as SubmissionPackPayload
}

export async function runConsistencyCheck(input: {
  projectId: string
  manuscriptId: string
  includeLowSeverity: boolean
}): Promise<ConsistencyCheckPayload> {
  const response = await fetch(
    `${API_BASE_URL}/v1/aawe/projects/${encodeURIComponent(input.projectId)}/manuscripts/${encodeURIComponent(input.manuscriptId)}/consistency/check`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        include_low_severity: input.includeLowSeverity,
      }),
    },
  )
  if (!response.ok) {
    throw new Error(await parseApiError(response, `Consistency check failed (${response.status})`))
  }
  return (await response.json()) as ConsistencyCheckPayload
}

export async function regenerateParagraph(input: {
  projectId: string
  manuscriptId: string
  section: string
  paragraphIndex: number
  notesContext: string
  constraints: ParagraphConstraint[]
  freeformInstruction: string | null
  evidenceLinks: GroundedDraftEvidenceLinkInput[]
  citationIds: string[]
  persistToManuscript: boolean
}): Promise<ParagraphRegenerationPayload> {
  const response = await fetch(
    `${API_BASE_URL}/v1/aawe/projects/${encodeURIComponent(input.projectId)}/manuscripts/${encodeURIComponent(input.manuscriptId)}/sections/${encodeURIComponent(input.section)}/paragraphs/regenerate`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        paragraph_index: input.paragraphIndex,
        notes_context: input.notesContext,
        constraints: input.constraints,
        freeform_instruction: input.freeformInstruction,
        evidence_links: input.evidenceLinks,
        citation_ids: input.citationIds,
        persist_to_manuscript: input.persistToManuscript,
      }),
    },
  )
  if (!response.ok) {
    throw new Error(await parseApiError(response, `Paragraph regeneration failed (${response.status})`))
  }
  return (await response.json()) as ParagraphRegenerationPayload
}

export async function autofillCitations(input: {
  claimIds: string[] | null
  requiredSlots: number
  overwriteExisting: boolean
}): Promise<CitationAutofillPayload> {
  const response = await fetch(`${API_BASE_URL}/v1/aawe/citations/autofill`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      claim_ids: input.claimIds,
      required_slots: input.requiredSlots,
      overwrite_existing: input.overwriteExisting,
    }),
  })
  if (!response.ok) {
    throw new Error(await parseApiError(response, `Citation autofill failed (${response.status})`))
  }
  return (await response.json()) as CitationAutofillPayload
}

export async function updateManuscriptSections(input: {
  projectId: string
  manuscriptId: string
  sections: Record<string, string>
}): Promise<ManuscriptRecord> {
  const response = await fetch(
    `${API_BASE_URL}/v1/projects/${encodeURIComponent(input.projectId)}/manuscripts/${encodeURIComponent(input.manuscriptId)}`,
    {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sections: input.sections }),
    },
  )
  if (!response.ok) {
    throw new Error(await parseApiError(response, `Manuscript save failed (${response.status})`))
  }
  return (await response.json()) as ManuscriptRecord
}

export async function enqueueGeneration(input: {
  projectId: string
  manuscriptId: string
  sections: string[]
  notesContext: string
  maxEstimatedCostUsd: number | null
  projectDailyBudgetUsd: number | null
}): Promise<GenerationJobPayload> {
  const response = await fetch(
    `${API_BASE_URL}/v1/projects/${encodeURIComponent(input.projectId)}/manuscripts/${encodeURIComponent(input.manuscriptId)}/generate`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        sections: input.sections,
        notes_context: input.notesContext,
        max_estimated_cost_usd: input.maxEstimatedCostUsd,
        project_daily_budget_usd: input.projectDailyBudgetUsd,
      }),
    },
  )
  if (!response.ok) {
    throw new Error(await parseApiError(response, `Generation enqueue failed (${response.status})`))
  }
  return (await response.json()) as GenerationJobPayload
}

export async function fetchGenerationJob(jobId: string): Promise<GenerationJobPayload> {
  const response = await fetch(`${API_BASE_URL}/v1/generation-jobs/${encodeURIComponent(jobId)}`)
  if (!response.ok) {
    throw new Error(await parseApiError(response, `Generation job lookup failed (${response.status})`))
  }
  return (await response.json()) as GenerationJobPayload
}

export async function listGenerationJobs(projectId: string, manuscriptId: string): Promise<GenerationJobPayload[]> {
  const response = await fetch(
    `${API_BASE_URL}/v1/projects/${encodeURIComponent(projectId)}/manuscripts/${encodeURIComponent(manuscriptId)}/generation-jobs?limit=8`,
  )
  if (!response.ok) {
    throw new Error(await parseApiError(response, `Generation history failed (${response.status})`))
  }
  return (await response.json()) as GenerationJobPayload[]
}

export async function cancelGeneration(jobId: string): Promise<GenerationJobPayload> {
  const response = await fetch(`${API_BASE_URL}/v1/generation-jobs/${encodeURIComponent(jobId)}/cancel`, {
    method: 'POST',
  })
  if (!response.ok) {
    throw new Error(await parseApiError(response, `Cancel failed (${response.status})`))
  }
  return (await response.json()) as GenerationJobPayload
}

export async function retryGeneration(jobId: string): Promise<GenerationJobPayload> {
  const response = await fetch(`${API_BASE_URL}/v1/generation-jobs/${encodeURIComponent(jobId)}/retry`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({}),
  })
  if (!response.ok) {
    throw new Error(await parseApiError(response, `Retry failed (${response.status})`))
  }
  return (await response.json()) as GenerationJobPayload
}

function inferFilename(contentDisposition: string | null, fallback: string): string {
  if (!contentDisposition) {
    return fallback
  }
  const match = /filename=\"?([^\";]+)\"?/i.exec(contentDisposition)
  return match?.[1] || fallback
}

export async function exportQcGatedMarkdown(
  projectId: string,
  manuscriptId: string,
): Promise<{ filename: string; content: string }> {
  const response = await fetch(
    `${API_BASE_URL}/v1/aawe/projects/${encodeURIComponent(projectId)}/manuscripts/${encodeURIComponent(manuscriptId)}/export/markdown`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ include_empty: false }),
    },
  )
  if (!response.ok) {
    throw new Error(await parseApiError(response, `QC-gated export failed (${response.status})`))
  }
  const content = await response.text()
  const filename = inferFilename(response.headers.get('content-disposition'), 'aawe-manuscript.md')
  return { filename, content }
}

export async function exportManuscriptMarkdownWithWarnings(
  projectId: string,
  manuscriptId: string,
): Promise<{ filename: string; content: string }> {
  const response = await fetch(
    `${API_BASE_URL}/v1/projects/${encodeURIComponent(projectId)}/manuscripts/${encodeURIComponent(manuscriptId)}/export/markdown?include_empty=false`,
  )
  if (!response.ok) {
    throw new Error(await parseApiError(response, `Export with warnings failed (${response.status})`))
  }
  const content = await response.text()
  const filename = inferFilename(response.headers.get('content-disposition'), 'aawe-manuscript.md')
  return { filename, content }
}

export async function runQcChecks(): Promise<QCRunResponse> {
  const response = await fetch(`${API_BASE_URL}/v1/aawe/qc/run`, { method: 'POST' })
  if (!response.ok) {
    throw new Error(await parseApiError(response, `QC run failed (${response.status})`))
  }
  return (await response.json()) as QCRunResponse
}

export async function exportReferencePack(input: {
  style: 'vancouver' | 'ama'
  claimIds: string[]
}): Promise<{ filename: string; content: string }> {
  const response = await fetch(`${API_BASE_URL}/v1/aawe/references/pack`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      style: input.style,
      claim_ids: input.claimIds,
      include_urls: true,
    }),
  })
  if (!response.ok) {
    throw new Error(await parseApiError(response, `Reference pack export failed (${response.status})`))
  }
  const content = await response.text()
  const filename = inferFilename(response.headers.get('content-disposition'), 'aawe-reference-pack.txt')
  return { filename, content }
}

export async function fetchManuscript(projectId: string, manuscriptId: string): Promise<ManuscriptRecord> {
  const response = await fetch(
    `${API_BASE_URL}/v1/projects/${encodeURIComponent(projectId)}/manuscripts/${encodeURIComponent(manuscriptId)}`,
  )
  if (!response.ok) {
    throw new Error(await parseApiError(response, `Manuscript lookup failed (${response.status})`))
  }
  return (await response.json()) as ManuscriptRecord
}

export async function fetchProject(projectId: string): Promise<ProjectRecord | null> {
  const response = await fetch(`${API_BASE_URL}/v1/projects`)
  if (!response.ok) {
    throw new Error(await parseApiError(response, `Project lookup failed (${response.status})`))
  }
  const projects = (await response.json()) as ProjectRecord[]
  return projects.find((project) => project.id === projectId) ?? null
}
