/**
 * API client for Cardiology Data Extractor non-auth endpoints.
 * Uses the same base URL and header pattern as extract-auth.ts.
 */

import { getExtractApiBase, getExtractSessionToken, buildExtractHeaders } from './extract-auth'

function apiBase(): string {
  return getExtractApiBase()
}

function headers(token?: string | null): Record<string, string> {
  const t = token ?? getExtractSessionToken()
  return buildExtractHeaders(t)
}

// ---------------------------------------------------------------------------
// Patients
// ---------------------------------------------------------------------------

export async function fetchPatients(params?: {
  search?: string
  status?: string
  source?: string
  limit?: number
  offset?: number
}): Promise<unknown> {
  const qs = new URLSearchParams()
  if (params?.search) qs.set('search', params.search)
  if (params?.status) qs.set('status', params.status)
  if (params?.source) qs.set('source', params.source)
  if (params?.limit != null) qs.set('limit', String(params.limit))
  if (params?.offset != null) qs.set('offset', String(params.offset))
  const q = qs.toString()
  const resp = await fetch(`${apiBase()}/v1/extract/patients${q ? `?${q}` : ''}`, {
    headers: headers(),
  })
  if (!resp.ok) throw new Error('Failed to fetch patients')
  return resp.json()
}

export async function fetchPatient(hn: string): Promise<unknown> {
  const resp = await fetch(`${apiBase()}/v1/extract/patients/${encodeURIComponent(hn)}`, {
    headers: headers(),
  })
  if (!resp.ok) throw new Error('Failed to fetch patient')
  return resp.json()
}

export async function createPatient(data: {
  hn: string
  name?: string
  dob?: string
  gender?: string
  anonymisation_code?: string
  images_uploaded?: boolean
  rip_tag?: boolean
  action_flag?: boolean
  tracking_details?: string
  study_id?: string
}): Promise<unknown> {
  const resp = await fetch(`${apiBase()}/v1/extract/patients`, {
    method: 'POST',
    headers: headers(),
    body: JSON.stringify(data),
  })
  if (!resp.ok) throw new Error('Failed to create patient')
  return resp.json()
}

export async function updatePatient(
  hn: string,
  data: Partial<{ name: string; dob: string; gender: string; anonymisation_code: string; images_uploaded: boolean; rip_tag: boolean; action_flag: boolean; tracking_details: string; study_id: string }>,
): Promise<unknown> {
  const resp = await fetch(`${apiBase()}/v1/extract/patients/${encodeURIComponent(hn)}`, {
    method: 'PATCH',
    headers: headers(),
    body: JSON.stringify(data),
  })
  if (!resp.ok) throw new Error('Failed to update patient')
  return resp.json()
}

export async function deletePatient(hn: string): Promise<void> {
  const resp = await fetch(
    `${apiBase()}/v1/extract/patients/${encodeURIComponent(hn)}`,
    { method: 'DELETE', headers: headers() },
  )
  if (!resp.ok) {
    const body = await resp.json().catch(() => null)
    throw new Error(body?.detail ?? `Failed to delete patient (${resp.status})`)
  }
}

export async function fetchStats(): Promise<unknown> {
  const resp = await fetch(`${apiBase()}/v1/extract/patients/stats`, {
    headers: headers(),
  })
  if (!resp.ok) throw new Error('Failed to fetch stats')
  return resp.json()
}

// ---------------------------------------------------------------------------
// Standalone tracking list
// ---------------------------------------------------------------------------

export type ExtractTrackingEntry = {
  id: string
  name: string | null
  hn: string | null
  details: string | null
  created_at: string | null
  updated_at: string | null
}

export async function fetchTrackingEntries(): Promise<{ items: ExtractTrackingEntry[] }> {
  const resp = await fetch(`${apiBase()}/v1/extract/tracking`, {
    headers: headers(),
  })
  if (!resp.ok) throw new Error('Failed to fetch tracking entries')
  return resp.json()
}

export async function createTrackingEntry(data: {
  name?: string
  hn?: string
  details?: string
}): Promise<ExtractTrackingEntry> {
  const resp = await fetch(`${apiBase()}/v1/extract/tracking`, {
    method: 'POST',
    headers: headers(),
    body: JSON.stringify(data),
  })
  if (!resp.ok) {
    const body = await resp.json().catch(() => null)
    throw new Error(body?.detail ?? `Failed to create tracking entry (${resp.status})`)
  }
  return resp.json()
}

export async function updateTrackingEntry(
  id: string,
  data: Partial<{ name: string; hn: string; details: string }>,
): Promise<ExtractTrackingEntry> {
  const resp = await fetch(`${apiBase()}/v1/extract/tracking/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    headers: headers(),
    body: JSON.stringify(data),
  })
  if (!resp.ok) {
    const body = await resp.json().catch(() => null)
    throw new Error(body?.detail ?? `Failed to update tracking entry (${resp.status})`)
  }
  return resp.json()
}

export async function deleteTrackingEntry(id: string): Promise<void> {
  const resp = await fetch(`${apiBase()}/v1/extract/tracking/${encodeURIComponent(id)}`, {
    method: 'DELETE',
    headers: headers(),
  })
  if (!resp.ok) {
    const body = await resp.json().catch(() => null)
    throw new Error(body?.detail ?? `Failed to delete tracking entry (${resp.status})`)
  }
}

export type ExtractBookingInvestigation = 'RHC' | 'CMR' | 'CPEX' | 'Echo'

export type ExtractBookingEntry = {
  id: string
  name: string | null
  hn: string | null
  investigation: ExtractBookingInvestigation
  booking_date: string
  booking_time: string | null
  details: string | null
  created_at: string | null
  updated_at: string | null
}

export async function fetchBookingEntries(): Promise<{ items: ExtractBookingEntry[] }> {
  const resp = await fetch(`${apiBase()}/v1/extract/bookings`, {
    headers: headers(),
  })
  if (!resp.ok) throw new Error('Failed to fetch bookings')
  return resp.json()
}

export async function createBookingEntry(data: {
  name?: string
  hn?: string
  investigation: ExtractBookingInvestigation
  booking_date: string
  booking_time?: string
  details?: string
}): Promise<ExtractBookingEntry> {
  const resp = await fetch(`${apiBase()}/v1/extract/bookings`, {
    method: 'POST',
    headers: headers(),
    body: JSON.stringify(data),
  })
  if (!resp.ok) {
    const body = await resp.json().catch(() => null)
    throw new Error(body?.detail ?? `Failed to create booking (${resp.status})`)
  }
  return resp.json()
}

export async function updateBookingEntry(
  id: string,
  data: Partial<{
    name: string
    hn: string
    investigation: ExtractBookingInvestigation
    booking_date: string
    booking_time: string
    details: string
  }>,
): Promise<ExtractBookingEntry> {
  const resp = await fetch(`${apiBase()}/v1/extract/bookings/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    headers: headers(),
    body: JSON.stringify(data),
  })
  if (!resp.ok) {
    const body = await resp.json().catch(() => null)
    throw new Error(body?.detail ?? `Failed to update booking (${resp.status})`)
  }
  return resp.json()
}

export async function deleteBookingEntry(id: string): Promise<void> {
  const resp = await fetch(`${apiBase()}/v1/extract/bookings/${encodeURIComponent(id)}`, {
    method: 'DELETE',
    headers: headers(),
  })
  if (!resp.ok) {
    const body = await resp.json().catch(() => null)
    throw new Error(body?.detail ?? `Failed to delete booking (${resp.status})`)
  }
}

// ---------------------------------------------------------------------------
// Records (parameterised by modality)
// ---------------------------------------------------------------------------

export async function fetchRecords(
  modality: string,
  params?: { hn?: string; limit?: number; offset?: number },
): Promise<unknown> {
  const qs = new URLSearchParams()
  if (params?.hn) qs.set('hn', params.hn)
  if (params?.limit != null) qs.set('limit', String(params.limit))
  if (params?.offset != null) qs.set('offset', String(params.offset))
  const q = qs.toString()
  const resp = await fetch(
    `${apiBase()}/v1/extract/records/${encodeURIComponent(modality)}${q ? `?${q}` : ''}`,
    { headers: headers() },
  )
  if (!resp.ok) throw new Error('Failed to fetch records')
  return resp.json()
}

export async function fetchRecord(modality: string, id: string): Promise<unknown> {
  const resp = await fetch(
    `${apiBase()}/v1/extract/records/${encodeURIComponent(modality)}/${encodeURIComponent(id)}`,
    { headers: headers() },
  )
  if (!resp.ok) throw new Error('Failed to fetch record')
  return resp.json()
}

export async function createRecord(
  modality: string,
  data: Record<string, unknown>,
): Promise<unknown> {
  const resp = await fetch(
    `${apiBase()}/v1/extract/records/${encodeURIComponent(modality)}`,
    {
      method: 'POST',
      headers: headers(),
      body: JSON.stringify(data),
    },
  )
  if (!resp.ok) throw new Error('Failed to create record')
  return resp.json()
}

export async function updateRecord(
  modality: string,
  id: string,
  data: Record<string, unknown>,
): Promise<unknown> {
  const resp = await fetch(
    `${apiBase()}/v1/extract/records/${encodeURIComponent(modality)}/${encodeURIComponent(id)}`,
    {
      method: 'PATCH',
      headers: headers(),
      body: JSON.stringify(data),
    },
  )
  if (!resp.ok) throw new Error('Failed to update record')
  return resp.json()
}

export async function deleteRecord(modality: string, id: string): Promise<void> {
  const resp = await fetch(
    `${apiBase()}/v1/extract/records/${encodeURIComponent(modality)}/${encodeURIComponent(id)}`,
    {
      method: 'DELETE',
      headers: headers(),
    },
  )
  if (!resp.ok) throw new Error('Failed to delete record')
}

// ---------------------------------------------------------------------------
// Uploaded source files
// ---------------------------------------------------------------------------

export type ExtractSourceFile = {
  id: string
  modality: string
  hn?: string | null
  record_id?: string | null
  filename: string
  content_type?: string | null
  byte_size: number
  sha256?: string | null
  source_type?: string | null
  created_at?: string | null
  linked_at?: string | null
}

export async function listSourceFilesForRecord(
  modality: string,
  recordId: string,
): Promise<ExtractSourceFile[]> {
  const resp = await fetch(
    `${apiBase()}/v1/extract/source-files/${encodeURIComponent(modality)}/${encodeURIComponent(recordId)}`,
    { headers: headers() },
  )
  if (!resp.ok) throw new Error('Failed to fetch source files')
  const body = await resp.json()
  return Array.isArray(body) ? body : body.items ?? []
}

export async function fetchSourceFileBlob(fileId: string, options?: { format?: 'pdf' }): Promise<Blob> {
  const qs = options?.format ? `?format=${encodeURIComponent(options.format)}` : ''
  const resp = await fetch(
    `${apiBase()}/v1/extract/source-files/${encodeURIComponent(fileId)}/content${qs}`,
    { headers: headers() },
  )
  if (!resp.ok) throw new Error('Failed to fetch source file')
  return resp.blob()
}

export async function deleteSourceFile(fileId: string): Promise<void> {
  const resp = await fetch(
    `${apiBase()}/v1/extract/source-files/${encodeURIComponent(fileId)}`,
    { method: 'DELETE', headers: headers() },
  )
  if (!resp.ok) throw new Error('Failed to delete source file')
}

// ---------------------------------------------------------------------------
// Recruitment
// ---------------------------------------------------------------------------

export async function fetchRecruitmentList(params?: {
  cohort?: string
  status?: string
}): Promise<unknown> {
  const qs = new URLSearchParams()
  if (params?.cohort) qs.set('cohort', params.cohort)
  if (params?.status) qs.set('status', params.status)
  const q = qs.toString()
  const resp = await fetch(`${apiBase()}/v1/extract/recruitment${q ? `?${q}` : ''}`, {
    headers: headers(),
  })
  if (!resp.ok) throw new Error('Failed to fetch recruitment list')
  return resp.json()
}

export async function fetchRecruitment(hn: string): Promise<unknown> {
  const resp = await fetch(
    `${apiBase()}/v1/extract/recruitment/${encodeURIComponent(hn)}`,
    { headers: headers() },
  )
  if (!resp.ok) throw new Error('Failed to fetch recruitment')
  return resp.json()
}

export async function createRecruitment(
  hn: string,
  data: Record<string, unknown>,
): Promise<unknown> {
  const resp = await fetch(
    `${apiBase()}/v1/extract/recruitment`,
    {
      method: 'POST',
      headers: headers(),
      body: JSON.stringify({ hn, ...data }),
    },
  )
  if (!resp.ok) throw new Error('Failed to create recruitment')
  return resp.json()
}

export async function updateRecruitment(
  hn: string,
  data: Record<string, unknown>,
): Promise<unknown> {
  const resp = await fetch(
    `${apiBase()}/v1/extract/recruitment/${encodeURIComponent(hn)}`,
    {
      method: 'PATCH',
      headers: headers(),
      body: JSON.stringify(data),
    },
  )
  if (!resp.ok) throw new Error('Failed to update recruitment')
  return resp.json()
}

export async function bulkUpdateRecruitmentStatus(
  hns: string[],
  status: string,
): Promise<unknown> {
  const resp = await fetch(`${apiBase()}/v1/extract/recruitment/bulk-status`, {
    method: 'POST',
    headers: headers(),
    body: JSON.stringify({ hns, status }),
  })
  if (!resp.ok) throw new Error('Failed to bulk update recruitment status')
  return resp.json()
}

export type RecruitmentNote = {
  id: string
  hn: string
  author_name?: string | null
  author_access_code_id?: string | null
  note_date?: string | null
  body: string
  created_at?: string | null
  updated_at?: string | null
}

export async function fetchRecruitmentNotes(hn: string): Promise<RecruitmentNote[]> {
  const resp = await fetch(
    `${apiBase()}/v1/extract/recruitment/${encodeURIComponent(hn)}/notes`,
    { headers: headers() },
  )
  if (!resp.ok) throw new Error('Failed to fetch recruitment notes')
  const body = await resp.json()
  return Array.isArray(body) ? body : body.items ?? []
}

export async function createRecruitmentNote(
  hn: string,
  data: Pick<RecruitmentNote, 'body'>,
): Promise<RecruitmentNote> {
  const resp = await fetch(
    `${apiBase()}/v1/extract/recruitment/${encodeURIComponent(hn)}/notes`,
    {
      method: 'POST',
      headers: headers(),
      body: JSON.stringify(data),
    },
  )
  if (!resp.ok) throw new Error('Failed to create recruitment note')
  return resp.json()
}

export async function updateRecruitmentNote(
  hn: string,
  noteId: string,
  data: Partial<Pick<RecruitmentNote, 'body'>>,
): Promise<RecruitmentNote> {
  const resp = await fetch(
    `${apiBase()}/v1/extract/recruitment/${encodeURIComponent(hn)}/notes/${encodeURIComponent(noteId)}`,
    {
      method: 'PATCH',
      headers: headers(),
      body: JSON.stringify(data),
    },
  )
  if (!resp.ok) throw new Error('Failed to update recruitment note')
  return resp.json()
}

export async function deleteRecruitmentNote(hn: string, noteId: string): Promise<void> {
  const resp = await fetch(
    `${apiBase()}/v1/extract/recruitment/${encodeURIComponent(hn)}/notes/${encodeURIComponent(noteId)}`,
    { method: 'DELETE', headers: headers() },
  )
  if (!resp.ok) throw new Error('Failed to delete recruitment note')
}

// ---------------------------------------------------------------------------
// Study entry questionnaire
// ---------------------------------------------------------------------------

export async function fetchQuestionnaire(hn: string): Promise<unknown> {
  const resp = await fetch(
    `${apiBase()}/v1/extract/questionnaire/${encodeURIComponent(hn)}`,
    { headers: headers() },
  )
  if (!resp.ok) throw new Error('Failed to fetch questionnaire')
  return resp.json()
}

export async function saveQuestionnaire(
  hn: string,
  data: Record<string, unknown>,
): Promise<unknown> {
  const resp = await fetch(
    `${apiBase()}/v1/extract/questionnaire/${encodeURIComponent(hn)}`,
    {
      method: 'PUT',
      headers: headers(),
      body: JSON.stringify({ data }),
    },
  )
  if (!resp.ok) throw new Error('Failed to save questionnaire')
  return resp.json()
}

// ---------------------------------------------------------------------------
// Clinical data
// ---------------------------------------------------------------------------

export async function fetchClinicalData(hn: string): Promise<unknown> {
  const resp = await fetch(
    `${apiBase()}/v1/extract/clinical-data/${encodeURIComponent(hn)}`,
    { headers: headers() },
  )
  if (!resp.ok) throw new Error('Failed to fetch clinical data')
  return resp.json()
}

export async function saveClinicalData(
  hn: string,
  data: Record<string, unknown>,
): Promise<unknown> {
  const resp = await fetch(
    `${apiBase()}/v1/extract/clinical-data/${encodeURIComponent(hn)}`,
    {
      method: 'PUT',
      headers: headers(),
      body: JSON.stringify({ data }),
    },
  )
  if (!resp.ok) throw new Error('Failed to save clinical data')
  return resp.json()
}

// ---------------------------------------------------------------------------
// Extraction
// ---------------------------------------------------------------------------

export async function runExtraction(data: {
  text?: string
  image_base64?: string
  modality: string
  source_type?: string
}): Promise<unknown> {
  const resp = await fetch(`${apiBase()}/v1/extract/extraction/extract`, {
    method: 'POST',
    headers: headers(),
    body: JSON.stringify(data),
  })
  if (!resp.ok) {
    const body = await resp.json().catch(() => null)
    throw new Error(body?.detail ?? `Extraction failed (${resp.status})`)
  }
  return resp.json()
}

export async function runExtractionFile(
  file: File,
  modality: string,
  sourceType?: string,
): Promise<unknown> {
  const token = getExtractSessionToken()
  const formData = new FormData()
  formData.append('file', file)
  formData.append('modality', modality)
  if (sourceType) formData.append('source_type', sourceType)

  const h: Record<string, string> = {}
  if (token) h.Authorization = `Bearer ${token}`

  const resp = await fetch(`${apiBase()}/v1/extract/extraction/extract-file`, {
    method: 'POST',
    headers: h,
    body: formData,
  })
  if (!resp.ok) {
    const body = await resp.json().catch(() => null)
    throw new Error(body?.detail ?? `File extraction failed (${resp.status})`)
  }
  return resp.json()
}

export async function saveExtraction(data: {
  modality: string
  hospital_number: string
  create_patient_if_missing: boolean
  patient_data: Record<string, unknown>
  record_data: Record<string, unknown>
  source_file_upload_id?: string | null
}): Promise<unknown> {
  const resp = await fetch(`${apiBase()}/v1/extract/extraction/save`, {
    method: 'POST',
    headers: headers(),
    body: JSON.stringify(data),
  })
  if (!resp.ok) {
    const body = await resp.json().catch(() => null)
    throw new Error(body?.detail ?? `Save failed (${resp.status})`)
  }
  return resp.json()
}

// ---------------------------------------------------------------------------
// Bulk / Export
// ---------------------------------------------------------------------------

export async function exportCohort(format: 'csv' | 'xlsx'): Promise<Blob> {
  const token = getExtractSessionToken()
  const h: Record<string, string> = {}
  if (token) h.Authorization = `Bearer ${token}`

  const resp = await fetch(`${apiBase()}/v1/extract/export?format=${format}`, {
    headers: h,
  })
  if (!resp.ok) throw new Error('Failed to export cohort')
  return resp.blob()
}
