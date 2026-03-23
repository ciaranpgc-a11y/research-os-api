/**
 * Previous-study import layer for the quantitative metrics page.
 *
 * Handles:
 *  - Echo → CMR canonical parameter mapping
 *  - In-memory store for imported previous studies
 *  - External subscribe/snapshot API (useSyncExternalStore-compatible)
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type PreviousStudySource = 'cmr' | 'echo'

export type PreviousStudy = {
  id: string
  source: PreviousStudySource
  label: string               // e.g. "Echo · 14 Mar 2024"
  date?: string               // ISO date string when available
  /** Canonical CMR parameter key → numeric value */
  values: Record<string, number>
}

// ---------------------------------------------------------------------------
// Echo field → CMR canonical parameter key mapping
// ---------------------------------------------------------------------------

/**
 * Maps EchoRecord numeric fields to their clinically equivalent CMR canonical
 * parameter key.  Only genuinely equivalent measurements are included.
 *
 * Fields marked "approximate" differ in modality technique, imaging plane, or
 * measurement convention — systematic bias is expected.
 */
export const ECHO_TO_CMR_MAP: Record<string, string> = {
  // LV function & volumes
  lvef_percent:               'LV EF',
  lvedv_index_ml_m2:          'LV EDV (i)',
  lvesv_index_ml_m2:          'LV ESV (i)',
  lv_mass_index_g_m2:         'LV mass (i)',          // approximate

  // LV longitudinal function
  mapse_mm:                   'MAPSE',

  // LV linear dimensions
  lvidd_mm:                   'LV ED diameter (sax)', // approximate
  lvids_mm:                   'LV ES diameter (sax)', // approximate

  // RV function
  tapse_mm:                   'TAPSE',
  fac_percent:                'RV EF',                // approximate: FAC is echo surrogate

  // Left atrium
  la_volume_ml:               'LA max volume',
  la_volume_index_ml_m2:      'LA max volume (i)',
  la_diameter_mm:             'LA max AP diameter (3ch)', // approximate

  // Right atrium
  ra_area_cm2:                'RA max area (4ch)',     // approximate

  // Aortic root / great vessels
  ao_annulus_mm:              'Aortic annulus diameter',
  ao_sinus_mm:                'Aortic sinus diameter',
  sino_tubular_junction_mm:   'STJ diameter',
  proximal_ascending_aorta_mm: 'Asc aorta diameter',  // approximate
  main_pulmonary_artery_diameter_mm: 'MPA systolic diameter', // approximate

  // Aortic valve flow / gradients
  aortic_vmax_m_s:            'AV maximum velocity',
  aortic_peak_gradient_mmhg:  'AV maximum pressure gradient',
  aortic_mean_gradient_mmhg:  'AV mean pressure gradient',

  // Pulmonary valve
  pulmonary_valve_vmax_m_s:   'PV maximum velocity',
}

// ---------------------------------------------------------------------------
// Store — previous studies
// ---------------------------------------------------------------------------

type Listener = () => void

let _studies: PreviousStudy[] = []
let _visible = true
const _listeners = new Set<Listener>()

function notify() { _listeners.forEach((fn) => fn()) }

export function getPreviousStudies(): PreviousStudy[] { return _studies }
export function isPreviousVisible(): boolean { return _visible }

export function addPreviousStudy(study: PreviousStudy): void {
  _studies = [..._studies, study]
  notify()
}

export function removePreviousStudy(id: string): void {
  _studies = _studies.filter((s) => s.id !== id)
  notify()
}

export function clearPreviousStudies(): void {
  _studies = []
  notify()
}

export function togglePreviousVisible(on?: boolean): void {
  _visible = on ?? !_visible
  notify()
}

export function subscribePreviousStudies(fn: Listener): () => void {
  _listeners.add(fn)
  return () => _listeners.delete(fn)
}

// Snapshot helpers for useSyncExternalStore
export function getStudiesSnapshot(): PreviousStudy[] { return _studies }
export function getVisibleSnapshot(): boolean { return _visible }

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

let _nextId = 1
export function nextStudyId(): string { return `prev-${_nextId++}` }

/**
 * Convert an Echo extraction result into canonical CMR parameter values.
 * Only numeric fields with a mapping entry are included.
 */
export function mapEchoToCmr(echo: Record<string, unknown>): Record<string, number> {
  const out: Record<string, number> = {}
  for (const [echoKey, cmrKey] of Object.entries(ECHO_TO_CMR_MAP)) {
    const v = echo[echoKey]
    if (typeof v === 'number' && Number.isFinite(v)) {
      out[cmrKey] = v
    }
  }
  return out
}

/**
 * Convert a CMR extraction result (same shape as the current extraction)
 * into canonical CMR parameter values.
 */
export function mapCmrToCmr(
  measurements: Array<{ parameter: string; value: number }>,
): Record<string, number> {
  const out: Record<string, number> = {}
  for (const m of measurements) {
    if (typeof m.value === 'number' && Number.isFinite(m.value)) {
      out[m.parameter] = m.value
    }
  }
  return out
}
