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
  lvedv_ml:                   'LV EDV',
  lvedv_index_ml_m2:          'LV EDV (i)',
  lvesv_ml:                   'LV ESV',
  lvesv_index_ml_m2:          'LV ESV (i)',
  lv_sv_ml:                   'LV SV',
  lv_sv_index_ml_m2:          'LV SV (i)',
  lv_co_l_min:                'LV CO',
  lv_ci_l_min_m2:             'LV CI',
  lv_mass_g:                  'LV mass',
  lv_mass_index_g_m2:         'LV mass (i)',

  // LV longitudinal function
  mapse_mm:                   'MAPSE',
  mapse_septal_mm:            'MAPSE septal',
  mapse_lateral_mm:           'MAPSE lateral',
  mapse_anterior_mm:          'MAPSE anterior',
  mapse_inferior_mm:          'MAPSE inferior',

  // LV linear dimensions
  lvidd_mm:                   'LV ED diameter (sax)',  // approximate
  lvids_mm:                   'LV ES diameter (sax)',  // approximate
  lv_wall_thickness_mm:       'LV peak wall thickness',

  // RV function & volumes
  rvef_percent:               'RV EF',
  rvedv_ml:                   'RV EDV',
  rvedv_index_ml_m2:          'RV EDV (i)',
  rvesv_ml:                   'RV ESV',
  rvesv_index_ml_m2:          'RV ESV (i)',
  rv_sv_ml:                   'RV SV',
  rv_sv_index_ml_m2:          'RV SV (i)',
  tapse_mm:                   'TAPSE',
  fac_percent:                'RV EF',                 // approximate: FAC is echo surrogate
  rv_basal_diameter_mm:       'RV basal diameter',
  rvot_diameter_mm:           'RVOT diameter',

  // Left atrium
  la_volume_ml:               'LA max volume',
  la_volume_index_ml_m2:      'LA max volume (i)',
  la_min_volume_ml:           'LA min volume',
  la_min_volume_index_ml_m2:  'LA min volume (i)',
  la_ef_percent:              'LA EF',
  la_diameter_mm:             'LA max AP diameter (3ch)',
  la_area_cm2:                'LA max area (4ch)',

  // Right atrium
  ra_volume_ml:               'RA max volume',
  ra_volume_index_ml_m2:      'RA max volume (i)',
  ra_area_cm2:                'RA max area (4ch)',
  ra_ef_percent:              'RA EF',

  // Aortic root / great vessels
  ao_annulus_mm:              'Aortic annulus diameter',
  ao_sinus_mm:                'Aortic sinus diameter',
  sov_diameter_mm:            'SOV diameter',
  sino_tubular_junction_mm:   'STJ diameter',
  proximal_ascending_aorta_mm: 'Asc aorta diameter',
  aortic_arch_mm:             'Aortic arch diameter',
  desc_aorta_mm:              'Prox desc aorta diameter',
  main_pulmonary_artery_diameter_mm: 'MPA systolic diameter',

  // Aortic valve flow / gradients / stenosis
  aortic_vmax_m_s:            'AV maximum velocity',
  aortic_peak_gradient_mmhg:  'AV maximum pressure gradient',
  aortic_mean_gradient_mmhg:  'AV mean pressure gradient',
  aortic_valve_area_cm2:      'AV valve area',          // AVA — for future use
  aortic_dvi:                 'AV DVI',                  // Doppler velocity index — for future use
  aortic_regurgitant_fraction_percent: 'AV regurgitant fraction',

  // Pulmonary valve
  pulmonary_valve_vmax_m_s:   'PV maximum velocity',
  pulmonary_peak_gradient_mmhg: 'PV maximum pressure gradient',
  pulmonary_mean_gradient_mmhg: 'PV mean pressure gradient',
  pulmonary_regurgitant_fraction_percent: 'PV regurgitant fraction',

  // Mitral valve
  mr_regurgitant_fraction_percent: 'MR regurgitant fraction',
  mr_volume_ml:               'MR volume (per heartbeat)',
  mv_annulus_diameter_mm:     'MV annulus diameter ED (4ch)',

  // Tricuspid valve
  tr_regurgitant_fraction_percent: 'TR regurgitant fraction',
  tr_volume_ml:               'TR volume (per heartbeat)',
  tr_vmax_m_s:                'TR peak velocity',        // for PASP estimation — for future use
  tv_annulus_diameter_mm:     'TV annulus diameter ED (4ch)',

  // Tissue characterisation (if available from echo — rare but possible)
  native_t1_ms:               'Native T1',
  native_t2_ms:               'Native T2',

  // Haemodynamics
  pcwp_mmhg:                  'PCWP',
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
