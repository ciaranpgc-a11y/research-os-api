import { API_BASE_URL } from '@/lib/api'
import { getAuthAccountKeyHint } from '@/lib/auth-session'
import type { ApiErrorPayload } from '@/types/insight'
import type { QCRunResponse } from '@/types/qc-run'
import type {
  CitationAutofillPayload,
  DataProfilePayload,
  AnalysisScaffoldPayload,
  TablesScaffoldPayload,
  FiguresScaffoldPayload,
  LibraryAssetRecord,
  LibraryAssetListPayload,
  LibraryAssetOwnership,
  LibraryAssetSortBy,
  LibraryAssetSortDirection,
  LibraryAssetUploadPayload,
  ManuscriptAttachAssetsPayload,
  PlannerConfirmedFields,
  ManuscriptPlanJson,
  ManuscriptPlanUpdatePayload,
  PlanSectionImprovePayload,
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
  ManuscriptAuthorSuggestion,
  ManuscriptAuthorsPayload,
  PlanClarificationHistoryItem,
  PlanClarificationNextQuestionPayload,
  PlanClarificationQuestionsPayload,
  PlanSectionEditPayload,
  ManuscriptRecord,
  ProjectRecord,
  ResearchOverviewSuggestionsPayload,
  SectionPlanPayload,
  TitleAbstractPayload,
  WorkspaceRunContextPayload,
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

function authHeaders(token: string): Record<string, string> {
  const clean = token.trim()
  const accountKeyHint = getAuthAccountKeyHint()
  const headers: Record<string, string> = {}
  if (accountKeyHint) {
    headers['X-AAWE-Account-Key'] = accountKeyHint
  }
  if (!clean) {
    return headers
  }
  headers.Authorization = `Bearer ${clean}`
  return headers
}

function normalizeOptionalId(value: string | null | undefined): string | null {
  const clean = String(value || '').trim()
  if (!clean) {
    return null
  }
  const lowered = clean.toLowerCase()
  if (lowered === 'none' || lowered === 'null' || lowered === 'undefined') {
    return null
  }
  return clean
}

export async function fetchJournalOptions(): Promise<JournalOption[]> {
  const response = await fetch(`${API_BASE_URL}/v1/journals`)
  if (!response.ok) {
    throw new Error(await parseApiError(response, `Journal lookup failed (${response.status})`))
  }
  return (await response.json()) as JournalOption[]
}

export async function uploadLibraryAssets(input: {
  token?: string
  files: File[]
  projectId?: string
}): Promise<LibraryAssetUploadPayload> {
  const projectId = normalizeOptionalId(input.projectId)

  const toBase64 = async (file: File): Promise<string> => {
    const buffer = await file.arrayBuffer()
    const bytes = new Uint8Array(buffer)
    let binary = ''
    for (let index = 0; index < bytes.byteLength; index += 1) {
      binary += String.fromCharCode(bytes[index])
    }
    return btoa(binary)
  }

  const formData = new FormData()
  for (const file of input.files) {
    formData.append('files', file)
  }
  if (projectId) {
    formData.append('project_id', projectId)
  }
  const response = await fetch(`${API_BASE_URL}/v1/library/assets/upload`, {
    method: 'POST',
    headers: authHeaders(input.token || ''),
    body: formData,
  })
  if (response.ok) {
    return (await response.json()) as LibraryAssetUploadPayload
  }

  const multipartError = await parseApiError(response, `Asset upload failed (${response.status})`)
  if (!multipartError.toLowerCase().includes('multipart parsing is unavailable')) {
    throw new Error(multipartError)
  }

  const jsonFiles = await Promise.all(
    input.files.map(async (file) => ({
      filename: file.name || 'asset.bin',
      mime_type: file.type || null,
      content_base64: await toBase64(file),
    })),
  )
  const fallbackResponse = await fetch(`${API_BASE_URL}/v1/library/assets/upload`, {
    method: 'POST',
    headers: { ...authHeaders(input.token || ''), 'Content-Type': 'application/json' },
    body: JSON.stringify({
      project_id: projectId || null,
      files: jsonFiles,
    }),
  })
  if (!fallbackResponse.ok) {
    throw new Error(await parseApiError(fallbackResponse, `Asset upload fallback failed (${fallbackResponse.status})`))
  }
  return (await fallbackResponse.json()) as LibraryAssetUploadPayload
}

export async function listLibraryAssets(input: {
  token?: string
  projectId?: string
  query?: string
  ownership?: LibraryAssetOwnership
  page?: number
  pageSize?: number
  sortBy?: LibraryAssetSortBy
  sortDirection?: LibraryAssetSortDirection
}): Promise<LibraryAssetListPayload> {
  const projectId = normalizeOptionalId(input.projectId)
  const search = new URLSearchParams()
  if (projectId) {
    search.set('project_id', projectId)
  }
  if ((input.query || '').trim()) {
    search.set('query', input.query!.trim())
  }
  if ((input.ownership || '').trim()) {
    search.set('ownership', input.ownership!)
  }
  if (Number.isFinite(input.page)) {
    search.set('page', String(Math.max(1, Number(input.page || 1))))
  }
  if (Number.isFinite(input.pageSize)) {
    search.set('page_size', String(Math.max(1, Math.min(200, Number(input.pageSize || 50)))))
  }
  if ((input.sortBy || '').trim()) {
    search.set('sort_by', input.sortBy!)
  }
  if ((input.sortDirection || '').trim()) {
    search.set('sort_direction', input.sortDirection!)
  }
  const suffix = search.toString() ? `?${search.toString()}` : ''
  const response = await fetch(`${API_BASE_URL}/v1/library/assets${suffix}`, {
    headers: authHeaders(input.token || ''),
  })
  if (!response.ok) {
    throw new Error(await parseApiError(response, `Asset list failed (${response.status})`))
  }
  const payload = (await response.json()) as LibraryAssetListPayload
  return {
    items: Array.isArray(payload.items) ? (payload.items as LibraryAssetRecord[]) : [],
    page: Number(payload.page || 1),
    page_size: Number(payload.page_size || 50),
    total: Number(payload.total || 0),
    has_more: Boolean(payload.has_more),
    sort_by: (payload.sort_by || 'uploaded_at') as LibraryAssetSortBy,
    sort_direction: (payload.sort_direction || 'desc') as LibraryAssetSortDirection,
    query: String(payload.query || ''),
    ownership: (payload.ownership || 'all') as LibraryAssetOwnership,
  }
}

export async function updateLibraryAssetAccess(input: {
  token?: string
  assetId: string
  collaboratorUserIds?: string[]
  collaboratorNames?: string[]
}): Promise<LibraryAssetRecord> {
  const response = await fetch(`${API_BASE_URL}/v1/library/assets/${encodeURIComponent(input.assetId)}/access`, {
    method: 'PATCH',
    headers: { ...authHeaders(input.token || ''), 'Content-Type': 'application/json' },
    body: JSON.stringify({
      collaborator_user_ids: input.collaboratorUserIds || [],
      collaborator_names: input.collaboratorNames || [],
    }),
  })
  if (!response.ok) {
    throw new Error(await parseApiError(response, `Asset access update failed (${response.status})`))
  }
  return (await response.json()) as LibraryAssetRecord
}

export async function downloadLibraryAsset(input: {
  token?: string
  assetId: string
}): Promise<{ blob: Blob; fileName: string; contentType: string }> {
  const response = await fetch(`${API_BASE_URL}/v1/library/assets/${encodeURIComponent(input.assetId)}/download`, {
    headers: authHeaders(input.token || ''),
  })
  if (!response.ok) {
    throw new Error(await parseApiError(response, `Asset download failed (${response.status})`))
  }
  const blob = await response.blob()
  const contentDisposition = response.headers.get('Content-Disposition') || ''
  const fileNameMatch = contentDisposition.match(/filename="?([^";]+)"?/i)
  const fileName = fileNameMatch?.[1]?.trim() || 'asset.bin'
  const contentType = response.headers.get('Content-Type') || blob.type || 'application/octet-stream'
  return { blob, fileName, contentType }
}

export async function attachAssetsToManuscript(input: {
  token?: string
  manuscriptId: string
  assetIds: string[]
  sectionContext: 'RESULTS' | 'TABLES' | 'FIGURES' | 'PLANNER'
}): Promise<ManuscriptAttachAssetsPayload> {
  const response = await fetch(`${API_BASE_URL}/v1/manuscripts/${encodeURIComponent(input.manuscriptId)}/attach-assets`, {
    method: 'POST',
    headers: { ...authHeaders(input.token || ''), 'Content-Type': 'application/json' },
    body: JSON.stringify({
      asset_ids: input.assetIds,
      section_context: input.sectionContext,
    }),
  })
  if (!response.ok) {
    throw new Error(await parseApiError(response, `Attach assets failed (${response.status})`))
  }
  return (await response.json()) as ManuscriptAttachAssetsPayload
}

export async function createDataProfile(input: {
  token?: string
  assetIds: string[]
  maxRows?: number
  maxChars?: number
}): Promise<DataProfilePayload> {
  const response = await fetch(`${API_BASE_URL}/v1/data/profile`, {
    method: 'POST',
    headers: { ...authHeaders(input.token || ''), 'Content-Type': 'application/json' },
    body: JSON.stringify({
      asset_ids: input.assetIds,
      sampling: {
        max_rows: input.maxRows ?? 200,
        max_chars: input.maxChars ?? 20000,
      },
    }),
  })
  if (!response.ok) {
    throw new Error(await parseApiError(response, `Data profiling failed (${response.status})`))
  }
  return (await response.json()) as DataProfilePayload
}

export async function createAnalysisScaffold(input: {
  token?: string
  manuscriptId: string
  profileId?: string | null
  confirmedFields: PlannerConfirmedFields
}): Promise<AnalysisScaffoldPayload> {
  const response = await fetch(`${API_BASE_URL}/v1/scaffold/analysis-plan`, {
    method: 'POST',
    headers: { ...authHeaders(input.token || ''), 'Content-Type': 'application/json' },
    body: JSON.stringify({
      manuscript_id: input.manuscriptId,
      profile_id: input.profileId ?? null,
      confirmed_fields: input.confirmedFields,
    }),
  })
  if (!response.ok) {
    throw new Error(await parseApiError(response, `Analysis scaffold failed (${response.status})`))
  }
  return (await response.json()) as AnalysisScaffoldPayload
}

export async function createTablesScaffold(input: {
  token?: string
  manuscriptId: string
  profileId?: string | null
  confirmedFields: PlannerConfirmedFields
}): Promise<TablesScaffoldPayload> {
  const response = await fetch(`${API_BASE_URL}/v1/scaffold/tables`, {
    method: 'POST',
    headers: { ...authHeaders(input.token || ''), 'Content-Type': 'application/json' },
    body: JSON.stringify({
      manuscript_id: input.manuscriptId,
      profile_id: input.profileId ?? null,
      confirmed_fields: input.confirmedFields,
    }),
  })
  if (!response.ok) {
    throw new Error(await parseApiError(response, `Tables scaffold failed (${response.status})`))
  }
  return (await response.json()) as TablesScaffoldPayload
}

export async function createFiguresScaffold(input: {
  token?: string
  manuscriptId: string
  profileId?: string | null
  confirmedFields: PlannerConfirmedFields
}): Promise<FiguresScaffoldPayload> {
  const response = await fetch(`${API_BASE_URL}/v1/scaffold/figures`, {
    method: 'POST',
    headers: { ...authHeaders(input.token || ''), 'Content-Type': 'application/json' },
    body: JSON.stringify({
      manuscript_id: input.manuscriptId,
      profile_id: input.profileId ?? null,
      confirmed_fields: input.confirmedFields,
    }),
  })
  if (!response.ok) {
    throw new Error(await parseApiError(response, `Figures scaffold failed (${response.status})`))
  }
  return (await response.json()) as FiguresScaffoldPayload
}

export async function saveManuscriptPlan(input: {
  token?: string
  manuscriptId: string
  planJson: ManuscriptPlanJson
}): Promise<ManuscriptPlanUpdatePayload> {
  const response = await fetch(`${API_BASE_URL}/v1/manuscripts/${encodeURIComponent(input.manuscriptId)}/plan`, {
    method: 'PUT',
    headers: { ...authHeaders(input.token || ''), 'Content-Type': 'application/json' },
    body: JSON.stringify({
      plan_json: input.planJson,
    }),
  })
  if (!response.ok) {
    throw new Error(await parseApiError(response, `Plan save failed (${response.status})`))
  }
  return (await response.json()) as ManuscriptPlanUpdatePayload
}

export async function improveManuscriptPlanSection(input: {
  token?: string
  manuscriptId: string
  sectionKey: string
  currentText: string
  context: {
    profileId?: string | null
    confirmedFields: PlannerConfirmedFields
  }
  tool: 'improve' | 'critique' | 'alternatives' | 'subheadings' | 'link_to_data' | 'checklist'
}): Promise<PlanSectionImprovePayload> {
  const response = await fetch(`${API_BASE_URL}/v1/manuscripts/${encodeURIComponent(input.manuscriptId)}/plan/section-improve`, {
    method: 'POST',
    headers: { ...authHeaders(input.token || ''), 'Content-Type': 'application/json' },
    body: JSON.stringify({
      section_key: input.sectionKey,
      current_text: input.currentText,
      context: {
        profile_id: input.context.profileId ?? null,
        confirmed_fields: input.context.confirmedFields,
      },
      tool: input.tool,
    }),
  })
  if (!response.ok) {
    throw new Error(await parseApiError(response, `Section tool failed (${response.status})`))
  }
  return (await response.json()) as PlanSectionImprovePayload
}

export async function bootstrapRunContext(input: {
  token?: string
  title: string
  targetJournal: string
  answers: Record<string, string>
  workspaceId?: string | null
  collaboratorNames?: string[]
}): Promise<WizardBootstrapPayload> {
  const response = await fetch(`${API_BASE_URL}/v1/wizard/bootstrap`, {
    method: 'POST',
    headers: { ...authHeaders(input.token || ''), 'Content-Type': 'application/json' },
    body: JSON.stringify({
      title: input.title,
      target_journal: input.targetJournal,
      answers: input.answers,
      branch_name: 'main',
      language: 'en-GB',
      workspace_id: input.workspaceId || null,
      collaborator_names: input.collaboratorNames || [],
    }),
  })
  if (!response.ok) {
    throw new Error(await parseApiError(response, `Bootstrap failed (${response.status})`))
  }
  return (await response.json()) as WizardBootstrapPayload
}

export async function fetchWorkspaceRunContext(input: {
  token: string
  workspaceId: string
}): Promise<WorkspaceRunContextPayload> {
  const response = await fetch(
    `${API_BASE_URL}/v1/workspaces/${encodeURIComponent(input.workspaceId)}/run-context`,
    {
      method: 'GET',
      headers: authHeaders(input.token),
    },
  )
  if (!response.ok) {
    throw new Error(await parseApiError(response, `Workspace run context lookup failed (${response.status})`))
  }
  const payload = (await response.json()) as WorkspaceRunContextPayload
  return {
    workspace_id: String(payload.workspace_id || '').trim(),
    project_id: normalizeOptionalId(payload.project_id),
    manuscript_id: normalizeOptionalId(payload.manuscript_id),
    owner_user_id: normalizeOptionalId(payload.owner_user_id),
    collaborator_user_ids: Array.isArray(payload.collaborator_user_ids)
      ? payload.collaborator_user_ids.map((value) => String(value || '').trim()).filter((value) => value.length > 0)
      : [],
  }
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
  dataProfileJson?: Record<string, unknown> | null
  profileUnresolvedQuestions?: string[]
  useProfileTailoring?: boolean
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
      data_profile_json: input.dataProfileJson ?? null,
      profile_unresolved_questions: input.profileUnresolvedQuestions ?? [],
      use_profile_tailoring: input.useProfileTailoring ?? false,
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
  token?: string
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
    headers: { ...authHeaders(input.token || ''), 'Content-Type': 'application/json' },
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
  token?: string
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
      headers: { ...authHeaders(input.token || ''), 'Content-Type': 'application/json' },
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
  token?: string
  projectId: string
  manuscriptId: string
  styleProfile: 'technical' | 'concise' | 'narrative_review'
  includePlainLanguageSummary: boolean
}): Promise<SubmissionPackPayload> {
  const response = await fetch(
    `${API_BASE_URL}/v1/aawe/projects/${encodeURIComponent(input.projectId)}/manuscripts/${encodeURIComponent(input.manuscriptId)}/submission-pack`,
    {
      method: 'POST',
      headers: { ...authHeaders(input.token || ''), 'Content-Type': 'application/json' },
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
  token?: string
  projectId: string
  manuscriptId: string
  includeLowSeverity: boolean
}): Promise<ConsistencyCheckPayload> {
  const response = await fetch(
    `${API_BASE_URL}/v1/aawe/projects/${encodeURIComponent(input.projectId)}/manuscripts/${encodeURIComponent(input.manuscriptId)}/consistency/check`,
    {
      method: 'POST',
      headers: { ...authHeaders(input.token || ''), 'Content-Type': 'application/json' },
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
  token?: string
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
      headers: { ...authHeaders(input.token || ''), 'Content-Type': 'application/json' },
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
  token?: string
  projectId: string
  manuscriptId: string
  sections: Record<string, string>
}): Promise<ManuscriptRecord> {
  const response = await fetch(
    `${API_BASE_URL}/v1/projects/${encodeURIComponent(input.projectId)}/manuscripts/${encodeURIComponent(input.manuscriptId)}`,
    {
      method: 'PATCH',
      headers: { ...authHeaders(input.token || ''), 'Content-Type': 'application/json' },
      body: JSON.stringify({ sections: input.sections }),
    },
  )
  if (!response.ok) {
    throw new Error(await parseApiError(response, `Manuscript save failed (${response.status})`))
  }
  return (await response.json()) as ManuscriptRecord
}

export async function enqueueGeneration(input: {
  token?: string
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
      headers: { ...authHeaders(input.token || ''), 'Content-Type': 'application/json' },
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

export async function fetchGenerationJob(input: {
  token?: string
  jobId: string
}): Promise<GenerationJobPayload> {
  const response = await fetch(`${API_BASE_URL}/v1/generation-jobs/${encodeURIComponent(input.jobId)}`, {
    headers: authHeaders(input.token || ''),
  })
  if (!response.ok) {
    throw new Error(await parseApiError(response, `Generation job lookup failed (${response.status})`))
  }
  return (await response.json()) as GenerationJobPayload
}

export async function listGenerationJobs(input: {
  token?: string
  projectId: string
  manuscriptId: string
}): Promise<GenerationJobPayload[]> {
  const response = await fetch(
    `${API_BASE_URL}/v1/projects/${encodeURIComponent(input.projectId)}/manuscripts/${encodeURIComponent(input.manuscriptId)}/generation-jobs?limit=8`,
    {
      headers: authHeaders(input.token || ''),
    },
  )
  if (!response.ok) {
    throw new Error(await parseApiError(response, `Generation history failed (${response.status})`))
  }
  return (await response.json()) as GenerationJobPayload[]
}

export async function cancelGeneration(input: {
  token?: string
  jobId: string
}): Promise<GenerationJobPayload> {
  const response = await fetch(`${API_BASE_URL}/v1/generation-jobs/${encodeURIComponent(input.jobId)}/cancel`, {
    method: 'POST',
    headers: authHeaders(input.token || ''),
  })
  if (!response.ok) {
    throw new Error(await parseApiError(response, `Cancel failed (${response.status})`))
  }
  return (await response.json()) as GenerationJobPayload
}

export async function retryGeneration(input: {
  token?: string
  jobId: string
}): Promise<GenerationJobPayload> {
  const response = await fetch(`${API_BASE_URL}/v1/generation-jobs/${encodeURIComponent(input.jobId)}/retry`, {
    method: 'POST',
    headers: { ...authHeaders(input.token || ''), 'Content-Type': 'application/json' },
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
  const match = /filename="?([^";]+)"?/i.exec(contentDisposition)
  return match?.[1] || fallback
}

export async function exportQcGatedMarkdown(
  input: { token?: string; projectId: string; manuscriptId: string },
): Promise<{ filename: string; content: string }> {
  const response = await fetch(
    `${API_BASE_URL}/v1/aawe/projects/${encodeURIComponent(input.projectId)}/manuscripts/${encodeURIComponent(input.manuscriptId)}/export/markdown`,
    {
      method: 'POST',
      headers: { ...authHeaders(input.token || ''), 'Content-Type': 'application/json' },
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
  input: { token?: string; projectId: string; manuscriptId: string },
): Promise<{ filename: string; content: string }> {
  const response = await fetch(
    `${API_BASE_URL}/v1/projects/${encodeURIComponent(input.projectId)}/manuscripts/${encodeURIComponent(input.manuscriptId)}/export/markdown?include_empty=false`,
    {
      headers: authHeaders(input.token || ''),
    },
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

export async function fetchManuscript(input: {
  token?: string
  projectId: string
  manuscriptId: string
}): Promise<ManuscriptRecord> {
  const response = await fetch(
    `${API_BASE_URL}/v1/projects/${encodeURIComponent(input.projectId)}/manuscripts/${encodeURIComponent(input.manuscriptId)}`,
    {
      headers: authHeaders(input.token || ''),
    },
  )
  if (!response.ok) {
    throw new Error(await parseApiError(response, `Manuscript lookup failed (${response.status})`))
  }
  return (await response.json()) as ManuscriptRecord
}

export async function fetchManuscriptAuthorSuggestions(input: {
  token: string
  query?: string
  limit?: number
}): Promise<ManuscriptAuthorSuggestion[]> {
  const params = new URLSearchParams()
  if ((input.query || '').trim()) {
    params.set('query', (input.query || '').trim())
  }
  params.set('limit', String(Math.max(1, Math.min(200, Number(input.limit || 50)))))
  const response = await fetch(
    `${API_BASE_URL}/v1/manuscript/authors/suggestions?${params.toString()}`,
    {
      method: 'GET',
      headers: authHeaders(input.token),
    },
  )
  if (!response.ok) {
    throw new Error(await parseApiError(response, `Author suggestions failed (${response.status})`))
  }
  const payload = (await response.json()) as { items: ManuscriptAuthorSuggestion[] }
  return payload.items || []
}

export async function fetchManuscriptAuthors(input: {
  token: string
  workspaceId: string
}): Promise<ManuscriptAuthorsPayload> {
  const response = await fetch(
    `${API_BASE_URL}/v1/manuscript/${encodeURIComponent(input.workspaceId)}/authors`,
    {
      method: 'GET',
      headers: authHeaders(input.token),
    },
  )
  if (!response.ok) {
    throw new Error(await parseApiError(response, `Manuscript authors lookup failed (${response.status})`))
  }
  return (await response.json()) as ManuscriptAuthorsPayload
}

export async function saveManuscriptAuthors(input: {
  token: string
  workspaceId: string
  authors: Array<{
    collaborator_id?: string | null
    full_name: string
    orcid_id?: string | null
    institution?: string | null
    is_corresponding?: boolean
    equal_contribution?: boolean
    is_external?: boolean
  }>
  affiliations?: Array<{
    institution_name: string
    department?: string | null
    city?: string | null
    country?: string | null
    superscript_number?: number | null
  }>
}): Promise<ManuscriptAuthorsPayload> {
  const response = await fetch(
    `${API_BASE_URL}/v1/manuscript/${encodeURIComponent(input.workspaceId)}/authors`,
    {
      method: 'POST',
      headers: { ...authHeaders(input.token), 'Content-Type': 'application/json' },
      body: JSON.stringify({
        authors: input.authors,
        affiliations: input.affiliations || [],
      }),
    },
  )
  if (!response.ok) {
    throw new Error(await parseApiError(response, `Manuscript authors save failed (${response.status})`))
  }
  return (await response.json()) as ManuscriptAuthorsPayload
}

export async function fetchProject(input: {
  token?: string
  projectId: string
}): Promise<ProjectRecord | null> {
  const response = await fetch(`${API_BASE_URL}/v1/projects`, {
    headers: authHeaders(input.token || ''),
  })
  if (!response.ok) {
    throw new Error(await parseApiError(response, `Project lookup failed (${response.status})`))
  }
  const projects = (await response.json()) as ProjectRecord[]
  return projects.find((project) => project.id === input.projectId) ?? null
}
