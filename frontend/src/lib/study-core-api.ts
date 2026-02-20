import { API_BASE_URL } from '@/lib/api'
import type { ApiErrorPayload } from '@/types/insight'
import type {
  ClaimLinkerPayload,
  GenerationEstimate,
  GenerationJobPayload,
  JournalOption,
  ManuscriptRecord,
  ProjectRecord,
  SectionPlanPayload,
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

