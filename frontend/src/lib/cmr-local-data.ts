/**
 * Client-side CMR reference data resolution.
 *
 * Loads the embedded cmr_reference_data.json and resolves parameters
 * in the same shape as the backend API, so pages work without the API.
 *
 * Supports live reloading via reloadData() so edits are reflected immediately.
 */
import rawData from '@/data/cmr_reference_data.json'
import type {
  CmrAliasEntry,
  CmrCanonicalParam,
  CmrCanonicalTableResponse,
  CmrParameterRangesResponse,
  CmrReferenceRangeRow,
} from './cmr-api'

// ---------------------------------------------------------------------------
// Raw JSON types
// ---------------------------------------------------------------------------

type RawSourceCitation = {
  short_ref: string
  title: string
  authors: string
  journal: string
  doi: string
  url: string
}

type RawOutputParam = {
  parameter: string
  unit: string
  indexing: string
  major_section: string
  sub_section: string
  pap_affected?: boolean
  sources?: RawSourceCitation[]
  severity_label?: string
  severity_thresholds?: { mild: number | null; moderate: number | null; severe: number | null }
  severity_label_override?: { mild: string | null; moderate: string | null; severe: string | null }
  nested_under?: string
  decimal_places?: number
}

type RawRefRange = {
  parameter: string
  sex: string
  unit: string
  indexing: string
  age_band: string
  age_min: number | null
  age_max: number | null
  ll: number | null
  mean: number | null
  ul: number | null
  sd: number | null
  ll_mass: number | null
  mean_mass: number | null
  ul_mass: number | null
  sd_mass: number | null
  abnormal_direction: string
}

type RawConfig = {
  papillary_mode: 'blood_pool' | 'mass'
}

type RawData = {
  output_params: Record<string, RawOutputParam>
  ref_ranges: RawRefRange[]
  aliases: Record<string, string>
  sections?: Record<string, string[]>
  config?: RawConfig
}

// ---------------------------------------------------------------------------
// Mutable data state (rebuilt on reload)
// ---------------------------------------------------------------------------

let data: RawData = rawData as unknown as RawData

let outputParamMap = new Map<string, RawOutputParam>()
let orderedParamNames: string[] = []
let rangesByParam = new Map<string, RawRefRange[]>()
let extraParams: string[] = []

function buildLookups() {
  if (!data?.output_params || !data?.ref_ranges) return

  outputParamMap = new Map<string, RawOutputParam>()
  for (const op of Object.values(data.output_params)) {
    outputParamMap.set(op.parameter, op)
  }

  orderedParamNames = Object.values(data.output_params).map((p) => p.parameter)

  rangesByParam = new Map<string, RawRefRange[]>()
  for (const r of data.ref_ranges) {
    let arr = rangesByParam.get(r.parameter)
    if (!arr) {
      arr = []
      rangesByParam.set(r.parameter, arr)
    }
    arr.push(r)
  }

  extraParams = []
  for (const key of rangesByParam.keys()) {
    if (!outputParamMap.has(key)) extraParams.push(key)
  }
}

// Initial build
buildLookups()

/**
 * Reload data from the dev API (reads the latest JSON from disk).
 * Call after any mutation to keep in-memory data fresh.
 */
export async function reloadData(): Promise<void> {
  try {
    const res = await fetch('/api/cmr-data')
    if (!res.ok) return
    data = await res.json()
    buildLookups()
  } catch {
    // Dev API not available — keep existing data
  }
}

// ---------------------------------------------------------------------------
// Age band resolution
// ---------------------------------------------------------------------------

function pickValues(r: RawRefRange): { ll: number | null; mean: number | null; ul: number | null; sd: number | null } {
  const mode = data.config?.papillary_mode
  if (mode === 'mass' && r.ll_mass !== null) {
    return { ll: r.ll_mass, mean: r.mean_mass, ul: r.ul_mass, sd: r.sd_mass }
  }
  return { ll: r.ll, mean: r.mean, ul: r.ul, sd: r.sd }
}

/** Check whether blood_pool and mass values differ for a given ref_range row. */
function papDiffers(r: RawRefRange): boolean {
  // Null mass values mean "same as blood pool" — only differ when mass is present and different
  const hasMass = r.ll_mass !== null || r.mean_mass !== null || r.ul_mass !== null || r.sd_mass !== null
  if (!hasMass) return false
  return r.ll !== r.ll_mass || r.mean !== r.mean_mass || r.ul !== r.ul_mass || r.sd !== r.sd_mass
}

function resolveRange(
  parameter: string,
  sex: string,
  age?: number,
): { ll: number | null; mean: number | null; ul: number | null; sd: number | null; age_band: string | null; pap_differs: boolean } {
  const rows = rangesByParam.get(parameter)
  if (!rows) return { ll: null, mean: null, ul: null, sd: null, age_band: null, pap_differs: false }

  const sexRows = rows.filter((r) => r.sex === sex)
  if (sexRows.length === 0) return { ll: null, mean: null, ul: null, sd: null, age_band: null, pap_differs: false }

  // Try age-specific band
  if (age !== undefined) {
    const matching = sexRows.filter(
      (r) => r.age_min !== null && r.age_max !== null && age >= r.age_min && age <= r.age_max,
    )
    if (matching.length > 0) {
      matching.sort((a, b) => (a.age_max! - a.age_min!) - (b.age_max! - b.age_min!))
      const best = matching[0]
      return { ...pickValues(best), age_band: best.age_band, pap_differs: papDiffers(best) }
    }
  }

  // Fall back to Adult band
  const adult = sexRows.find((r) => r.age_band === 'Adult')
  if (adult) {
    return { ...pickValues(adult), age_band: 'Adult', pap_differs: papDiffers(adult) }
  }

  // No match at all — return first available
  const first = sexRows[0]
  return { ...pickValues(first), age_band: first.age_band, pap_differs: papDiffers(first) }
}

// ---------------------------------------------------------------------------
// Public API (mirrors cmr-api.ts signatures)
// ---------------------------------------------------------------------------

export function resolveReferenceParameters(sex: string = 'Male', age?: number): CmrCanonicalTableResponse {
  const parameters: CmrCanonicalParam[] = []
  let ageBandApplied: string | null = null

  for (let i = 0; i < orderedParamNames.length; i++) {
    const name = orderedParamNames[i]
    const op = outputParamMap.get(name)!
    const resolved = resolveRange(name, sex, age)

    if (resolved.age_band && !ageBandApplied && resolved.age_band !== 'Adult') {
      ageBandApplied = resolved.age_band
    }

    const sampleRow = rangesByParam.get(name)?.find((r) => r.sex === sex)

    parameters.push({
      parameter_key: name,
      unit: op.unit,
      indexing: op.indexing,
      abnormal_direction: sampleRow?.abnormal_direction || '',
      major_section: op.major_section,
      sub_section: op.sub_section || '',
      sort_order: i,
      ll: resolved.ll,
      mean: resolved.mean,
      ul: resolved.ul,
      sd: resolved.sd,
      pap_differs: resolved.pap_differs,
      sources: op.sources || [],
      age_band: resolved.age_band,
      severity_label: op.severity_label,
      severity_thresholds: op.severity_thresholds,
      severity_label_override: op.severity_label_override,
      nested_under: op.nested_under,
      decimal_places: op.decimal_places,
    })
  }

  // Add extra params (in ref_ranges but not output_params)
  for (const name of extraParams) {
    const resolved = resolveRange(name, sex, age)
    const sampleRow = rangesByParam.get(name)?.find((r) => r.sex === sex)
    if (!sampleRow) continue

    parameters.push({
      parameter_key: name,
      unit: sampleRow.unit,
      indexing: sampleRow.indexing,
      abnormal_direction: sampleRow.abnormal_direction || '',
      major_section: 'ADDITIONAL GRANULAR DETAILS',
      sub_section: '',
      sort_order: parameters.length,
      ll: resolved.ll,
      mean: resolved.mean,
      ul: resolved.ul,
      sd: resolved.sd,
      age_band: resolved.age_band,
      pap_differs: resolved.pap_differs,
      sources: [],
    })
  }

  return {
    sex,
    age: age ?? null,
    age_band_applied: ageBandApplied,
    parameters,
  }
}

export function resolveParameterRanges(parameterKey: string): CmrParameterRangesResponse {
  const op = outputParamMap.get(parameterKey)
  const rows = rangesByParam.get(parameterKey) || []

  const ranges: CmrReferenceRangeRow[] = rows.map((r) => ({
    sex: r.sex,
    age_band: r.age_band,
    ll: r.ll,
    mean: r.mean,
    ul: r.ul,
    sd: r.sd,
    ll_mass: r.ll_mass,
    mean_mass: r.mean_mass,
    ul_mass: r.ul_mass,
    sd_mass: r.sd_mass,
  }))

  const sampleRow = rows[0]

  return {
    parameter_key: parameterKey,
    unit: op?.unit || sampleRow?.unit || '',
    indexing: op?.indexing || sampleRow?.indexing || '',
    abnormal_direction: sampleRow?.abnormal_direction || '',
    major_section: op?.major_section || 'ADDITIONAL GRANULAR DETAILS',
    sub_section: op?.sub_section || '',
    pap_affected: !!op?.pap_affected,
    pap_differs: !!op?.pap_affected,
    ranges,
    sources: op?.sources || [],
    severity_label: op?.severity_label,
    severity_thresholds: op?.severity_thresholds,
    severity_label_override: op?.severity_label_override,
    nested_under: op?.nested_under,
    decimal_places: op?.decimal_places,
  }
}

export function resolveAliases(): CmrAliasEntry[] {
  return Object.entries(data.aliases).map(([extracted_name, canonical_name]) => ({
    extracted_name,
    canonical_name,
  }))
}

export function getAllParameterKeys(): string[] {
  return [...orderedParamNames, ...extraParams]
}

/** Returns the sections config: major section -> sub-sections[] */
export function resolveSections(): Record<string, string[]> {
  return data.sections || {}
}

/** Returns the config object */
export function resolveConfig(): RawConfig {
  return data.config || { papillary_mode: 'blood_pool' }
}
