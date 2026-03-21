import {
  resolveAliases as localAliases,
  resolveParameterRanges as localParamRanges,
  resolveReferenceParameters as localRefParams,
  resolveSections as localSections,
  resolveConfig as localConfig,
  reloadData,
} from '@/lib/cmr-local-data'

// ---- Reference Data Types ----

export type CmrSourceCitation = {
  short_ref: string
  title: string
  authors: string
  journal: string
  doi: string
  url: string
}

export type CmrCanonicalParam = {
  parameter_key: string
  unit: string
  indexing: string
  abnormal_direction: string
  major_section: string
  sub_section: string
  sort_order: number
  ll: number | null
  mean: number | null
  ul: number | null
  sd: number | null
  age_band: string | null
  pap_differs: boolean
  sources: CmrSourceCitation[]
  // Severity grading (optional — undefined triggers auto-inference/SD fallback)
  severity_label?: string
  severity_thresholds?: { mild: number | null; moderate: number | null; severe: number | null }
  severity_label_override?: { mild: string | null; moderate: string | null; severe: string | null }
}

export type CmrCanonicalTableResponse = {
  sex: string
  age: number | null
  age_band_applied: string | null
  parameters: CmrCanonicalParam[]
}

export async function fetchReferenceParameters(
  sex: string = 'Male',
  age?: number,
): Promise<CmrCanonicalTableResponse> {
  return localRefParams(sex, age)
}

// ---- Parameter ranges (for editing) ----

export type CmrReferenceRangeRow = {
  sex: string
  age_band: string
  ll: number | null
  mean: number | null
  ul: number | null
  sd: number | null
  ll_mass: number | null
  mean_mass: number | null
  ul_mass: number | null
  sd_mass: number | null
}

export type CmrParameterRangesResponse = {
  parameter_key: string
  unit: string
  indexing: string
  abnormal_direction: string
  major_section: string
  sub_section: string
  pap_differs: boolean
  ranges: CmrReferenceRangeRow[]
  sources: CmrSourceCitation[]
  // Severity grading
  severity_label?: string
  severity_thresholds?: { mild: number | null; moderate: number | null; severe: number | null }
  severity_label_override?: { mild: string | null; moderate: string | null; severe: string | null }
}

export async function fetchParameterRanges(parameterKey: string): Promise<CmrParameterRangesResponse> {
  return localParamRanges(parameterKey)
}

export type CmrReferenceRangeUpdate = {
  parameter: string
  sex: string
  age_band: string
  ll?: number | null
  mean?: number | null
  ul?: number | null
  sd?: number | null
  ll_mass?: number | null
  mean_mass?: number | null
  ul_mass?: number | null
  sd_mass?: number | null
}

export async function updateReferenceRanges(
  updates: CmrReferenceRangeUpdate[],
): Promise<{ updated: number }> {
  const res = await fetch('/api/cmr-data/ranges', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ updates }),
  })
  if (!res.ok) throw new Error('Failed to update reference ranges')
  const result = await res.json()
  // Reload in-memory data so tables reflect changes
  await reloadData()
  return result
}

export type CmrParamMetaUpdate = {
  parameter_key: string
  unit?: string
  indexing?: string
  abnormal_direction?: string
  major_section?: string
  sub_section?: string
  pap_affected?: boolean
  sources?: CmrSourceCitation[]
  severity_label?: string | null
  severity_thresholds?: { mild: number | null; moderate: number | null; severe: number | null } | null
  severity_label_override?: { mild: string | null; moderate: string | null; severe: string | null } | null
}

export async function updateParameterMeta(update: CmrParamMetaUpdate): Promise<void> {
  const res = await fetch('/api/cmr-data/param-meta', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(update),
  })
  if (!res.ok) throw new Error('Failed to update parameter metadata')
  await reloadData()
}

// ---- Aliases ----

export type CmrAliasEntry = { extracted_name: string; canonical_name: string }

export async function fetchAliases(): Promise<CmrAliasEntry[]> {
  return localAliases()
}

export async function createAlias(extracted_name: string, canonical_name: string): Promise<void> {
  // Read current data, add alias, write back
  const res = await fetch('/api/cmr-data')
  if (!res.ok) throw new Error('Failed to read data')
  const data = await res.json()
  data.aliases[extracted_name] = canonical_name
  const putRes = await fetch('/api/cmr-data', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  })
  if (!putRes.ok) throw new Error('Failed to create alias')
  await reloadData()
}

export async function deleteAlias(extracted_name: string): Promise<void> {
  const res = await fetch('/api/cmr-data')
  if (!res.ok) throw new Error('Failed to read data')
  const data = await res.json()
  delete data.aliases[extracted_name]
  const putRes = await fetch('/api/cmr-data', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  })
  if (!putRes.ok) throw new Error('Failed to delete alias')
  await reloadData()
}

// ---- Sections config ----

export type CmrSectionsConfig = Record<string, string[]>

export async function fetchSections(): Promise<CmrSectionsConfig> {
  return localSections()
}

export async function updateSections(sections: CmrSectionsConfig): Promise<void> {
  const res = await fetch('/api/cmr-data/sections', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(sections),
  })
  if (!res.ok) throw new Error('Failed to update sections')
  await reloadData()
}

// ---- Config ----

export type PapillaryMode = 'blood_pool' | 'mass'

export type CmrConfig = {
  papillary_mode: PapillaryMode
}

export async function fetchConfig(): Promise<CmrConfig> {
  return localConfig()
}

export async function updateConfig(updates: Partial<CmrConfig>): Promise<void> {
  const res = await fetch('/api/cmr-data/config', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(updates),
  })
  if (!res.ok) throw new Error('Failed to update config')
  await reloadData()
}

// ---- Edit mode (bulk save) ----

export type CmrEditModeSave = {
  sections?: Record<string, string[]>
  section_renames?: Array<{ old_name: string; new_name: string }>
  sub_section_renames?: Array<{ section: string; old_name: string; new_name: string }>
  param_order?: string[]
}

export async function saveEditMode(payload: CmrEditModeSave): Promise<void> {
  const res = await fetch('/api/cmr-data/edit-mode', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })
  if (!res.ok) throw new Error('Failed to save edit mode changes')
  await reloadData()
}

// ---- Report extraction ----

export type CmrExtractedDemographics = {
  sex?: string
  age?: number
  height_cm?: number
  weight_kg?: number
  bsa?: number
  heart_rate?: number
}

export type CmrExtractedMeasurement = {
  parameter: string
  value: number
}

export type CmrExtractionResult = {
  demographics: CmrExtractedDemographics
  measurements: CmrExtractedMeasurement[]
}

export async function extractFromReport(reportText: string): Promise<CmrExtractionResult> {
  const res = await fetch('/api/cmr-extract', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ report_text: reportText }),
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: 'Unknown error' }))
    throw new Error(err.error || 'Extraction failed')
  }
  return res.json()
}
