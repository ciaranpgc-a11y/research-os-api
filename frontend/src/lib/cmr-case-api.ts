import { buildCmrHeaders, getCmrApiBase, getCmrSessionToken } from '@/lib/cmr-auth'
import type { CmrCaseContentSection } from '@/lib/cmr-case-content'
import { normalizeCmrCasePayload, type CmrCasePayload } from '@/lib/cmr-case-defaults'

export type CmrCaseSummary = {
  id: string
  title: string
  patient_label: string | null
  report_tag: string | null
  study_date: string | null
  status: string
  last_completed_step: string | null
  created_at: string | null
  updated_at: string | null
  content_sections?: CmrCaseContentSection[]
}

export type CmrCaseRecord = CmrCaseSummary & {
  payload: CmrCasePayload
}

type RawCmrCaseRecord = CmrCaseSummary & {
  payload: Record<string, unknown> | null
}

function getRequiredToken(): string {
  const token = getCmrSessionToken()
  if (!token) {
    throw new Error('CMR session not found')
  }
  return token
}

function normalizeCaseRecord(record: RawCmrCaseRecord): CmrCaseRecord {
  return {
    ...record,
    payload: normalizeCmrCasePayload(record.payload ?? {}),
  }
}

export async function listCmrCases(): Promise<CmrCaseSummary[]> {
  const token = getRequiredToken()
  const response = await fetch(`${getCmrApiBase()}/v1/cmr/cases`, {
    headers: buildCmrHeaders(token),
  })
  if (!response.ok) throw new Error('Failed to load reports')
  const data = await response.json()
  return Array.isArray(data.items) ? data.items : []
}

export async function createCmrCase(title?: string): Promise<CmrCaseRecord> {
  const token = getRequiredToken()
  const response = await fetch(`${getCmrApiBase()}/v1/cmr/cases`, {
    method: 'POST',
    headers: buildCmrHeaders(token),
    body: JSON.stringify({ title: title ?? null }),
  })
  if (!response.ok) throw new Error('Failed to create report')
  const data = await response.json()
  return normalizeCaseRecord(data as RawCmrCaseRecord)
}

export async function getCmrCase(caseId: string): Promise<CmrCaseRecord> {
  const token = getRequiredToken()
  const response = await fetch(`${getCmrApiBase()}/v1/cmr/cases/${caseId}`, {
    headers: buildCmrHeaders(token),
  })
  if (!response.ok) throw new Error(response.status === 404 ? 'Report not found' : 'Failed to load report')
  const data = await response.json()
  return normalizeCaseRecord(data as RawCmrCaseRecord)
}

export async function updateCmrCase(
  caseId: string,
  patch: Partial<Pick<CmrCaseRecord, 'title' | 'patient_label' | 'report_tag' | 'study_date' | 'status' | 'last_completed_step'>> & {
    payload?: CmrCasePayload
  },
): Promise<CmrCaseRecord> {
  const token = getRequiredToken()
  const response = await fetch(`${getCmrApiBase()}/v1/cmr/cases/${caseId}`, {
    method: 'PATCH',
    headers: buildCmrHeaders(token),
    body: JSON.stringify(patch),
  })
  if (!response.ok) throw new Error(response.status === 404 ? 'Report not found' : 'Failed to save report')
  const data = await response.json()
  return normalizeCaseRecord(data as RawCmrCaseRecord)
}

export async function deleteCmrCase(caseId: string): Promise<void> {
  const token = getRequiredToken()
  const response = await fetch(`${getCmrApiBase()}/v1/cmr/cases/${caseId}`, {
    method: 'DELETE',
    headers: buildCmrHeaders(token),
  })
  if (!response.ok) throw new Error(response.status === 404 ? 'Report not found' : 'Failed to delete report')
}
