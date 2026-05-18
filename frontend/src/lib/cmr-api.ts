import {
  resolveAliases as localAliases,
  resolveParameterRanges as localParamRanges,
  resolveReferenceParameters as localRefParams,
  resolveSections as localSections,
  resolveConfig as localConfig,
  reloadData,
} from '@/lib/cmr-local-data'
import { buildCmrHeaders, getCmrApiBase, getCmrSessionToken } from '@/lib/cmr-auth'
import type { CmrReferencePreset } from '@/lib/cmr-reference-presets'

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
  // Nesting: when set, this param is a child of the named parent param
  nested_under?: string
  // Display formatting: number of decimal places for table values
  decimal_places?: number
  // Visual separator: when true, render a thicker border above this row
  separator_before?: boolean
  // Derived (calculated) parameter — show calculator icon with tooltip
  derived?: boolean
  derived_tooltip?: string
}

export type CmrCanonicalTableResponse = {
  sex: string
  age: number | null
  age_band_applied: string | null
  parameters: CmrCanonicalParam[]
}

export type PapillaryMode = 'blood_pool' | 'mass'

async function readReferenceDataError(response: Response, fallback: string): Promise<string> {
  try {
    const data = await response.json() as { detail?: string; error?: string }
    const message = String(data.detail ?? data.error ?? '').trim()
    if (message) return message
  } catch {
    // Fall through to text/status handling.
  }

  try {
    const text = (await response.text()).trim()
    if (text && !text.startsWith('<')) return text
  } catch {
    // Ignore text parsing failures.
  }

  return response.status ? `${fallback} (${response.status})` : fallback
}

export async function fetchReferenceParameters(
  sex: string = 'Male',
  age?: number,
  papillaryMode?: PapillaryMode,
): Promise<CmrCanonicalTableResponse> {
  await reloadData()
  return localRefParams(sex, age, papillaryMode)
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
  pap_affected: boolean
  pap_differs: boolean
  ranges: CmrReferenceRangeRow[]
  sources: CmrSourceCitation[]
  // Severity grading
  severity_label?: string
  severity_thresholds?: { mild: number | null; moderate: number | null; severe: number | null }
  severity_label_override?: { mild: string | null; moderate: string | null; severe: string | null }
  // Nesting
  nested_under?: string
  // Display formatting
  decimal_places?: number
  // Separator
  separator_before?: boolean
}

export async function fetchParameterRanges(parameterKey: string): Promise<CmrParameterRangesResponse> {
  await reloadData()
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
  const res = await fetch(`${getCmrApiBase()}/v1/cmr/reference-data/ranges`, {
    method: 'PUT',
    headers: buildCmrHeaders(getCmrSessionToken()),
    body: JSON.stringify({ updates }),
  })
  if (!res.ok) throw new Error(await readReferenceDataError(res, 'Failed to update reference ranges'))
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
  nested_under?: string | null
  decimal_places?: number | null
}

export async function updateParameterMeta(update: CmrParamMetaUpdate): Promise<void> {
  const res = await fetch(`${getCmrApiBase()}/v1/cmr/reference-data/param-meta`, {
    method: 'PUT',
    headers: buildCmrHeaders(getCmrSessionToken()),
    body: JSON.stringify(update),
  })
  if (!res.ok) throw new Error(await readReferenceDataError(res, 'Failed to update parameter metadata'))
  await reloadData()
}

// ---- Aliases ----

export type CmrAliasEntry = { extracted_name: string; canonical_name: string }

export async function fetchAliases(): Promise<CmrAliasEntry[]> {
  await reloadData()
  return localAliases()
}

export async function createAlias(extracted_name: string, canonical_name: string): Promise<void> {
  // Read current data, add alias, write back
  const headers = buildCmrHeaders(getCmrSessionToken())
  const res = await fetch(`${getCmrApiBase()}/v1/cmr/reference-data`, {
    headers,
  })
  if (!res.ok) throw new Error(await readReferenceDataError(res, 'Failed to read data'))
  const data = await res.json()
  data.aliases[extracted_name] = canonical_name
  const putRes = await fetch(`${getCmrApiBase()}/v1/cmr/reference-data`, {
    method: 'PUT',
    headers,
    body: JSON.stringify(data),
  })
  if (!putRes.ok) throw new Error(await readReferenceDataError(putRes, 'Failed to create alias'))
  await reloadData()
}

export async function deleteAlias(extracted_name: string): Promise<void> {
  const headers = buildCmrHeaders(getCmrSessionToken())
  const res = await fetch(`${getCmrApiBase()}/v1/cmr/reference-data`, {
    headers,
  })
  if (!res.ok) throw new Error(await readReferenceDataError(res, 'Failed to read data'))
  const data = await res.json()
  delete data.aliases[extracted_name]
  const putRes = await fetch(`${getCmrApiBase()}/v1/cmr/reference-data`, {
    method: 'PUT',
    headers,
    body: JSON.stringify(data),
  })
  if (!putRes.ok) throw new Error(await readReferenceDataError(putRes, 'Failed to delete alias'))
  await reloadData()
}

// ---- Sections config ----

export type CmrSectionsConfig = Record<string, string[]>

export async function fetchSections(): Promise<CmrSectionsConfig> {
  await reloadData()
  return localSections()
}

export async function updateSections(sections: CmrSectionsConfig): Promise<void> {
  const res = await fetch(`${getCmrApiBase()}/v1/cmr/reference-data/sections`, {
    method: 'PUT',
    headers: buildCmrHeaders(getCmrSessionToken()),
    body: JSON.stringify(sections),
  })
  if (!res.ok) throw new Error(await readReferenceDataError(res, 'Failed to update sections'))
  await reloadData()
}

// ---- Config ----

export type CmrConfig = {
  papillary_mode: PapillaryMode
  reference_preset: CmrReferencePreset
}

export async function fetchConfig(): Promise<CmrConfig> {
  await reloadData()
  return localConfig()
}

export async function updateConfig(updates: Partial<CmrConfig>): Promise<void> {
  const res = await fetch(`${getCmrApiBase()}/v1/cmr/reference-data/config`, {
    method: 'PUT',
    headers: buildCmrHeaders(getCmrSessionToken()),
    body: JSON.stringify(updates),
  })
  if (!res.ok) throw new Error(await readReferenceDataError(res, 'Failed to update config'))
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
  const res = await fetch(`${getCmrApiBase()}/v1/cmr/reference-data/edit-mode`, {
    method: 'PUT',
    headers: buildCmrHeaders(getCmrSessionToken()),
    body: JSON.stringify(payload),
  })
  if (!res.ok) throw new Error(await readReferenceDataError(res, 'Failed to save edit mode changes'))
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
  study_date?: string
}

export type CmrExtractedMeasurement = {
  parameter: string
  value: number
}

export type CmrExtractionResult = {
  demographics: CmrExtractedDemographics
  measurements: CmrExtractedMeasurement[]
}

async function readExtractionError(response: Response, fallback: string): Promise<string> {
  try {
    const data = await response.json() as { detail?: string; error?: string }
    const message = String(data.detail ?? data.error ?? '').trim()
    if (message) return message
  } catch {
    // Fall through to text/status handling.
  }

  try {
    const text = (await response.text()).trim()
    if (text && !text.startsWith('<')) return text
  } catch {
    // Ignore text parsing failures.
  }

  return response.status ? `${fallback} (${response.status})` : fallback
}

export async function extractFromReport(reportText: string): Promise<CmrExtractionResult> {
  const token = getCmrSessionToken()
  if (!token) {
    throw new Error('CMR session not found')
  }

  const res = await fetch(`${getCmrApiBase()}/v1/cmr/report-extraction`, {
    method: 'POST',
    headers: buildCmrHeaders(token),
    body: JSON.stringify({ reportText }),
  })
  if (!res.ok) {
    throw new Error(await readExtractionError(res, 'Extraction failed'))
  }
  return res.json()
}
