import { API_BASE_URL } from '@/lib/api'
import type { ClaimCitationState, CitationRecord } from '@/types/citation'
import type { ApiErrorPayload } from '@/types/insight'

async function readApiError(response: Response, fallback: string): Promise<string> {
  try {
    const payload = (await response.json()) as ApiErrorPayload
    return payload.error?.detail || payload.error?.message || fallback
  } catch {
    return fallback
  }
}

export async function fetchCitationLibrary(query: string, limit: number = 50): Promise<CitationRecord[]> {
  const params = new URLSearchParams()
  if (query.trim()) {
    params.set('q', query.trim())
  }
  params.set('limit', String(limit))
  const response = await fetch(`${API_BASE_URL}/v1/aawe/citations?${params.toString()}`)
  if (!response.ok) {
    throw new Error(await readApiError(response, `Citation lookup failed (${response.status})`))
  }
  return (await response.json()) as CitationRecord[]
}

export async function fetchClaimCitations(claimId: string, requiredSlots: number): Promise<ClaimCitationState> {
  const params = new URLSearchParams({ required_slots: String(requiredSlots) })
  const response = await fetch(`${API_BASE_URL}/v1/aawe/claims/${encodeURIComponent(claimId)}/citations?${params.toString()}`)
  if (!response.ok) {
    throw new Error(await readApiError(response, `Claim citation lookup failed (${response.status})`))
  }
  return (await response.json()) as ClaimCitationState
}

export async function updateClaimCitations(
  claimId: string,
  citationIds: string[],
  requiredSlots: number,
): Promise<ClaimCitationState> {
  const response = await fetch(`${API_BASE_URL}/v1/aawe/claims/${encodeURIComponent(claimId)}/citations`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ citation_ids: citationIds, required_slots: requiredSlots }),
  })
  if (!response.ok) {
    throw new Error(await readApiError(response, `Claim citation update failed (${response.status})`))
  }
  return (await response.json()) as ClaimCitationState
}

function inferFilename(contentDisposition: string | null): string {
  if (!contentDisposition) {
    return 'aawe-references.txt'
  }
  const match = /filename=\"?([^\";]+)\"?/i.exec(contentDisposition)
  return match?.[1] || 'aawe-references.txt'
}

export async function exportClaimCitations(claimId: string): Promise<{ filename: string; content: string }> {
  const response = await fetch(`${API_BASE_URL}/v1/aawe/citations/export`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ claim_id: claimId }),
  })
  if (!response.ok) {
    throw new Error(await readApiError(response, `Citation export failed (${response.status})`))
  }
  const content = await response.text()
  const filename = inferFilename(response.headers.get('content-disposition'))
  return { filename, content }
}

