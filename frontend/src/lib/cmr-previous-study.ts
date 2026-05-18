/**
 * Previous-study helpers backed by the active persisted case.
 */

import { createDefaultCmrCasePayload } from '@/lib/cmr-case-defaults'
import { useCmrCaseStore } from '@/store/use-cmr-case-store'

export type PreviousStudySource = 'cmr' | 'echo'

export type PreviousStudy = {
  id: string
  source: PreviousStudySource
  label: string
  date?: string
  values: Record<string, number>
}

export const ECHO_TO_CMR_MAP: Record<string, string> = {
  lvef_percent: 'LV EF',
  lvedv_ml: 'LV EDV',
  lvedv_index_ml_m2: 'LV EDV (i)',
  lvesv_ml: 'LV ESV',
  lvesv_index_ml_m2: 'LV ESV (i)',
  lv_sv_ml: 'LV SV',
  lv_sv_index_ml_m2: 'LV SV (i)',
  lv_co_l_min: 'LV CO',
  lv_ci_l_min_m2: 'LV CI',
  lv_mass_g: 'LV mass',
  lv_mass_index_g_m2: 'LV mass (i)',
  mapse_mm: 'MAPSE',
  mapse_septal_mm: 'MAPSE septal',
  mapse_lateral_mm: 'MAPSE lateral',
  mapse_anterior_mm: 'MAPSE anterior',
  mapse_inferior_mm: 'MAPSE inferior',
  lvidd_mm: 'LV ED diameter (sax)',
  lvids_mm: 'LV ES diameter (sax)',
  lv_wall_thickness_mm: 'LV peak wall thickness',
  rvef_percent: 'RV EF',
  rvedv_ml: 'RV EDV',
  rvedv_index_ml_m2: 'RV EDV (i)',
  rvesv_ml: 'RV ESV',
  rvesv_index_ml_m2: 'RV ESV (i)',
  rv_sv_ml: 'RV SV',
  rv_sv_index_ml_m2: 'RV SV (i)',
  tapse_mm: 'TAPSE',
  fac_percent: 'RV EF',
  rv_basal_diameter_mm: 'RV basal diameter',
  rvot_diameter_mm: 'RVOT diameter',
  la_volume_ml: 'LA max volume',
  la_volume_index_ml_m2: 'LA max volume (i)',
  la_min_volume_ml: 'LA min volume',
  la_min_volume_index_ml_m2: 'LA min volume (i)',
  la_ef_percent: 'LA EF',
  la_diameter_mm: 'LA max AP diameter (3ch)',
  la_area_cm2: 'LA max area (4ch)',
  ra_volume_ml: 'RA max volume',
  ra_volume_index_ml_m2: 'RA max volume (i)',
  ra_area_cm2: 'RA max area (4ch)',
  ra_ef_percent: 'RA EF',
  ao_annulus_mm: 'Aortic annulus diameter',
  ao_sinus_mm: 'Aortic sinus diameter',
  sov_diameter_mm: 'SOV diameter',
  sino_tubular_junction_mm: 'STJ diameter',
  proximal_ascending_aorta_mm: 'Asc aorta diameter',
  aortic_arch_mm: 'Aortic arch diameter',
  desc_aorta_mm: 'Prox desc aorta diameter',
  main_pulmonary_artery_diameter_mm: 'MPA systolic diameter',
  aortic_vmax_m_s: 'AV maximum velocity',
  aortic_peak_gradient_mmhg: 'AV maximum pressure gradient',
  aortic_mean_gradient_mmhg: 'AV mean pressure gradient',
  aortic_valve_area_cm2: 'AV valve area',
  aortic_dvi: 'AV DVI',
  aortic_regurgitant_fraction_percent: 'AV regurgitant fraction',
  pulmonary_valve_vmax_m_s: 'PV maximum velocity',
  pulmonary_peak_gradient_mmhg: 'PV maximum pressure gradient',
  pulmonary_mean_gradient_mmhg: 'PV mean pressure gradient',
  pulmonary_regurgitant_fraction_percent: 'PV regurgitant fraction',
  mr_regurgitant_fraction_percent: 'MR regurgitant fraction',
  mr_volume_ml: 'MR volume (per heartbeat)',
  mv_annulus_diameter_mm: 'MV annulus diameter ED (4ch)',
  tr_regurgitant_fraction_percent: 'TR regurgitant fraction',
  tr_volume_ml: 'TR volume (per heartbeat)',
  tr_vmax_m_s: 'TR peak velocity',
  tv_annulus_diameter_mm: 'TV annulus diameter ED (4ch)',
  native_t1_ms: 'Native T1',
  native_t2_ms: 'Native T2',
  pcwp_mmhg: 'PCWP',
}

type Listener = () => void

function getPayload() {
  return useCmrCaseStore.getState().activeCase?.payload ?? createDefaultCmrCasePayload()
}

export function getPreviousStudies(): PreviousStudy[] {
  return getPayload().previousStudies
}

export function isPreviousVisible(): boolean {
  return getPayload().previousStudiesVisible
}

export function addPreviousStudy(study: PreviousStudy): void {
  useCmrCaseStore.getState().patchActiveCasePayload((payload) => ({
    ...payload,
    previousStudies: [...payload.previousStudies, study],
  }))
}

export function removePreviousStudy(id: string): void {
  useCmrCaseStore.getState().patchActiveCasePayload((payload) => ({
    ...payload,
    previousStudies: payload.previousStudies.filter((study) => study.id !== id),
  }))
}

export function clearPreviousStudies(): void {
  useCmrCaseStore.getState().patchActiveCasePayload((payload) => ({
    ...payload,
    previousStudies: [],
  }))
}

export function togglePreviousVisible(on?: boolean): void {
  useCmrCaseStore.getState().patchActiveCasePayload((payload) => ({
    ...payload,
    previousStudiesVisible: on ?? !payload.previousStudiesVisible,
  }))
}

export function subscribePreviousStudies(fn: Listener): () => void {
  let previousStudies = getPreviousStudies()
  let previousVisible = isPreviousVisible()
  return useCmrCaseStore.subscribe((state) => {
    const nextStudies = state.activeCase?.payload.previousStudies ?? []
    const nextVisible = state.activeCase?.payload.previousStudiesVisible ?? true
    if (nextStudies === previousStudies && nextVisible === previousVisible) {
      return
    }
    previousStudies = nextStudies
    previousVisible = nextVisible
    fn()
  })
}

export function getStudiesSnapshot(): PreviousStudy[] {
  return getPreviousStudies()
}

export function getVisibleSnapshot(): boolean {
  return isPreviousVisible()
}

export function nextStudyId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return `prev-${crypto.randomUUID()}`
  }
  return `prev-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
}

export function mapEchoToCmr(echo: Record<string, unknown>): Record<string, number> {
  const out: Record<string, number> = {}
  for (const [echoKey, cmrKey] of Object.entries(ECHO_TO_CMR_MAP)) {
    const value = echo[echoKey]
    if (typeof value === 'number' && Number.isFinite(value)) {
      out[cmrKey] = value
    }
  }
  return out
}

export function mapCmrToCmr(
  measurements: Array<{ parameter: string; value: number }>,
): Record<string, number> {
  const out: Record<string, number> = {}
  for (const measurement of measurements) {
    if (typeof measurement.value === 'number' && Number.isFinite(measurement.value)) {
      out[measurement.parameter] = measurement.value
    }
  }
  return out
}
