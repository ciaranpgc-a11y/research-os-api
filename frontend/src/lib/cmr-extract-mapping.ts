/**
 * Maps between the flat extract_cmr database columns and the canonical
 * parameter keys used in cmr_reference_data.json / CmrCanonicalParam.
 */

// ---------------------------------------------------------------------------
// DB column → canonical parameter key
// ---------------------------------------------------------------------------

export const DB_TO_CANONICAL: Record<string, string> = {
  // LV Volumes & Function
  lvef: 'LV EF',
  lvedv: 'LV EDV',
  lvedvi: 'LV EDV (i)',
  lvesv: 'LV ESV',
  lvesvi: 'LV ESV (i)',
  lvsv: 'LV SV',
  lvsvi: 'LV SV (i)',
  lv_mass: 'LV mass',
  lvmi: 'LV mass (i)',
  max_lv_wall: 'LV peak wall thickness',
  mapse: 'MAPSE',

  // RV Volumes & Function
  rvef: 'RV EF',
  rvedv: 'RV EDV',
  rvedvi: 'RV EDV (i)',
  rvesv: 'RV ESV',
  rvesvi: 'RV ESV (i)',
  rvsv: 'RV SV',
  rvsvi: 'RV SV (i)',
  tapse: 'TAPSE',

  // Atria
  la_volume: 'LA max volume',

  // Tissue Characterisation
  native_t1: 'Native T1',
  t2: 'Native T2',
  t2_star: 'Myocardial T2*',
  ecv: 'ECV',

  // Aortic Valve & Aorta
  asc_aorta: 'Asc aorta diameter',
  ao_forward_volume: 'AV forward flow (per heartbeat)',
  ao_backward_volume: 'AV backward flow (per heartbeat)',
  ar_rf: 'AV regurgitant fraction',
  ao_vmax: 'AV maximum velocity',
  ao_mean_grad: 'AV mean pressure gradient',

  // Mitral Valve
  mr_volume: 'MR volume (per heartbeat)',
  mr_rf: 'MR regurgitant fraction',

  // Tricuspid Valve
  tr_volume: 'TR volume (per heartbeat)',
  tr_rf: 'TR regurgitant fraction',

  // Pulmonary Valve
  pulmonary_forward_volume: 'PV forward flow (per heartbeat)',
  pulmonary_backward_volume: 'PV backward flow (per heartbeat)',
  pr_rf: 'PV regurgitant fraction',
  qp_qs: 'Qp:Qs',

  // PA sizes
  mpa_size: 'MPA systolic diameter',
  lpa_size: 'LPA systolic diameter',
  rpa_size: 'RPA systolic diameter',

  // Haemodynamics
  rap: 'mRAP',
  pcwp: 'PCWP',
}

// Reverse map: canonical → DB column
export const CANONICAL_TO_DB: Record<string, string> = Object.fromEntries(
  Object.entries(DB_TO_CANONICAL).map(([db, canon]) => [canon, db]),
)

// ---------------------------------------------------------------------------
// Conversion helpers
// ---------------------------------------------------------------------------

/**
 * Convert a flat CmrRecord (from the API) into a Map keyed by canonical
 * parameter name. Reads `measurements_json` first, falls back to legacy columns.
 */
export function mapExtractRecordToMeasurements(
  record: Record<string, unknown>,
): Map<string, number> {
  const result = new Map<string, number>()

  // 1. Legacy columns
  for (const [dbCol, canonKey] of Object.entries(DB_TO_CANONICAL)) {
    const raw = record[dbCol]
    if (raw == null || raw === '') continue
    const num = Number(raw)
    if (!isNaN(num)) result.set(canonKey, num)
  }

  // 2. measurements_json overrides
  const mjRaw = record.measurements_json
  if (mjRaw && typeof mjRaw === 'string') {
    try {
      const parsed = JSON.parse(mjRaw) as Record<string, unknown>
      for (const [key, val] of Object.entries(parsed)) {
        if (val != null && typeof val === 'number') {
          result.set(key, val)
        }
      }
    } catch {
      // malformed JSON — skip
    }
  }

  return result
}

/**
 * Convert a Map of canonical measurements back to fields for the API PATCH.
 * Produces `measurements_json` plus legacy column values.
 */
export function mapMeasurementsToExtractRecord(
  measurements: Map<string, number>,
): Record<string, unknown> {
  const result: Record<string, unknown> = {}

  // Build measurements_json from ALL entries
  const jsonObj: Record<string, number> = {}
  for (const [key, val] of measurements) {
    jsonObj[key] = val
    // Also write to legacy column if mapping exists
    const dbCol = CANONICAL_TO_DB[key]
    if (dbCol) result[dbCol] = String(val)
  }
  result.measurements_json = JSON.stringify(jsonObj)

  return result
}

// ---------------------------------------------------------------------------
// Auto-indexed volume pairs
// ---------------------------------------------------------------------------

/** Pairs of (absolute param, indexed param) for auto-calculation from BSA. */
export const INDEXABLE_PAIRS: [string, string][] = [
  ['LV EDV', 'LV EDV (i)'],
  ['LV ESV', 'LV ESV (i)'],
  ['LV SV', 'LV SV (i)'],
  ['LV mass', 'LV mass (i)'],
  ['RV EDV', 'RV EDV (i)'],
  ['RV ESV', 'RV ESV (i)'],
  ['RV SV', 'RV SV (i)'],
  ['LA max volume', 'LA max volume (i)'],
  ['LA min volume', 'LA min volume (i)'],
  ['RA max volume', 'RA max volume (i)'],
  ['RA min volume', 'RA min volume (i)'],
  ['RV mass', 'RV mass (i)'],
]

/**
 * Auto-compute indexed values from absolute + BSA where the indexed value
 * is missing. Returns the augmented map (mutates in-place for convenience).
 */
export function autoComputeIndexed(
  measurements: Map<string, number>,
  bsa: number | null | undefined,
): Map<string, number> {
  if (!bsa || bsa <= 0) return measurements
  for (const [absKey, idxKey] of INDEXABLE_PAIRS) {
    if (measurements.has(absKey) && !measurements.has(idxKey)) {
      measurements.set(idxKey, measurements.get(absKey)! / bsa)
    }
  }
  return measurements
}

/**
 * Auto-compute regurgitant volumes and fractions from stroke volumes and
 * forward flows where not already present.
 *
 * TR volume = RV SV - PV forward flow (per heartbeat)
 * TR RF     = TR volume / RV SV * 100
 * MR volume = LV SV - AV forward flow (per heartbeat)
 * MR RF     = MR volume / LV SV * 100
 */
export function autoComputeRegurgitation(
  measurements: Map<string, number>,
): Map<string, number> {
  // TR
  const rvsv = measurements.get('RV SV')
  const pvFwd = measurements.get('PV forward flow (per heartbeat)')
  if (rvsv && pvFwd && rvsv > pvFwd) {
    const trVol = rvsv - pvFwd
    if (!measurements.has('TR volume (per heartbeat)')) {
      measurements.set('TR volume (per heartbeat)', trVol)
    }
    if (!measurements.has('TR regurgitant fraction') && rvsv > 0) {
      measurements.set('TR regurgitant fraction', (trVol / rvsv) * 100)
    }
  }
  // MR
  const lvsv = measurements.get('LV SV')
  const avFwd = measurements.get('AV forward flow (per heartbeat)')
  if (lvsv && avFwd && lvsv > avFwd) {
    const mrVol = lvsv - avFwd
    if (!measurements.has('MR volume (per heartbeat)')) {
      measurements.set('MR volume (per heartbeat)', mrVol)
    }
    if (!measurements.has('MR regurgitant fraction') && lvsv > 0) {
      measurements.set('MR regurgitant fraction', (mrVol / lvsv) * 100)
    }
  }
  return measurements
}
