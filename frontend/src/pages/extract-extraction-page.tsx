import { useCallback, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Upload,
  FileText,
  Camera,
  Loader2,
  ArrowLeft,
  Download,
  Save,
  CheckCircle2,
  AlertCircle,
  X,
} from 'lucide-react'

import { runExtraction, runExtractionFile, saveExtraction } from '@/lib/extract-api'
import { cn } from '@/lib/utils'

// ---------------------------------------------------------------------------
// Constants – Section definitions per modality
// ---------------------------------------------------------------------------

type FieldDef = { key: string; label: string; type: 'text' | 'number' | 'textarea' }
type SectionDef = { title: string; fields: FieldDef[] }

function f(key: string, label: string, type: 'text' | 'number' | 'textarea' = 'text'): FieldDef {
  return { key, label, type }
}
function n(key: string, label: string): FieldDef {
  return { key, label, type: 'number' }
}
function ta(key: string, label: string): FieldDef {
  return { key, label, type: 'textarea' }
}

const RHC_SECTIONS: SectionDef[] = [
  {
    title: 'Procedure Info',
    fields: [f('date_rhc', 'Date'), n('height', 'Height (cm)'), n('weight', 'Weight (kg)')],
  },
  {
    title: 'Right Atrial Pressures',
    fields: [n('ra_mean', 'RA Mean (mmHg)'), n('ra_a', 'RA a (mmHg)'), n('ra_v', 'RA v (mmHg)'), n('ra_o2_sat', 'RA O2 Sat (%)')],
  },
  {
    title: 'Right Ventricular Pressures',
    fields: [n('rv_systolic', 'RV Systolic (mmHg)'), n('rv_diastolic', 'RV Diastolic (mmHg)'), n('rv_mean', 'RV Mean (mmHg)'), n('rv_o2_sat', 'RV O2 Sat (%)')],
  },
  {
    title: 'Pulmonary Artery Pressures',
    fields: [n('pa_systolic', 'PA Systolic (mmHg)'), n('pa_diastolic', 'PA Diastolic (mmHg)'), n('pa_mean', 'PA Mean (mmHg)'), n('pa_o2_sat', 'PA O2 Sat (%)')],
  },
  {
    title: 'Pulmonary Capillary Wedge',
    fields: [n('pcwp_mean', 'PCWP Mean (mmHg)'), n('pcwp_a', 'PCWP a (mmHg)'), n('pcwp_v', 'PCWP v (mmHg)'), n('pcwp_o2_sat', 'PCWP O2 Sat (%)')],
  },
  {
    title: 'Aorta',
    fields: [n('aorta_systolic', 'Aorta Systolic (mmHg)'), n('aorta_diastolic', 'Aorta Diastolic (mmHg)'), n('aorta_mean', 'Aorta Mean (mmHg)'), n('aorta_o2_sat', 'Aorta O2 Sat (%)')],
  },
  {
    title: 'Left Ventricle',
    fields: [n('lv_systolic', 'LV Systolic (mmHg)'), n('lv_diastolic', 'LV Diastolic (mmHg)'), n('lv_mean', 'LV Mean (mmHg)'), n('lv_o2_sat', 'LV O2 Sat (%)')],
  },
  {
    title: 'Cardiac Function',
    fields: [n('cardiac_output', 'Cardiac Output (L/min)'), n('cardiac_index', 'Cardiac Index (L/min/m2)'), n('pvr_wu', 'PVR (WU)'), n('pvr_dyn', 'PVR (dyn)'), n('tpg', 'TPG (mmHg)')],
  },
  {
    title: 'Comments',
    fields: [ta('rhc_comments', 'RHC Comments'), ta('raw_text', 'Raw Text')],
  },
]

const ECHO_SECTIONS: SectionDef[] = [
  {
    title: 'Study Info',
    fields: [f('study_date', 'Study Date'), f('report_date', 'Report Date'), f('consultant', 'Consultant'), f('ward_op', 'Ward/OP'), f('study_reason', 'Study Reason'), f('reported_by', 'Reported By'), f('image_quality', 'Image Quality')],
  },
  {
    title: 'Vitals & Anthropometrics',
    fields: [f('rhythm', 'Rhythm'), n('hr', 'HR (bpm)'), f('bp_text', 'BP'), n('height', 'Height (cm)'), n('weight', 'Weight (kg)'), n('bsa', 'BSA (m2)')],
  },
  {
    title: 'LV Size & Function',
    fields: [f('lv_size', 'LV Size'), f('lv_wall', 'LV Wall'), n('lvh', 'LVH'), n('rwma', 'RWMA'), f('lv_fn', 'LV Function'), n('lvef', 'LVEF (%)'), n('gls', 'GLS (%)'), n('mapse', 'MAPSE (mm)'), n('med_s', 'Med S\''), n('lat_s', 'Lat S\'')],
  },
  {
    title: 'Diastolic Function',
    fields: [n('sept_e', 'Sept e\''), n('lat_e', 'Lat e\''), n('avg_e_ep', 'Avg E/e\''), n('sept_e_ep', 'Sept E/e\''), n('mv_e', 'MV E'), n('mv_a', 'MV A'), n('e_a', 'E/A'), n('dt_ms', 'DT (ms)'), f('diast_fn', 'Diastolic Function'), f('fill_press', 'Filling Pressure')],
  },
  {
    title: 'RV Size & Function',
    fields: [f('rv_size', 'RV Size'), f('rv_fn', 'RV Function'), n('tapse', 'TAPSE (mm)'), n('rv_s', 'RV S\''), n('fac', 'FAC (%)'), n('tr_vmax', 'TR Vmax (m/s)'), n('rvsp', 'RVSP (mmHg)'), n('rap', 'RAP (mmHg)')],
  },
  {
    title: 'IVC & PH',
    fields: [f('ivc_size', 'IVC Size'), f('ivc_coll', 'IVC Collapse'), f('ph_prob', 'PH Probability'), n('sept_flat', 'Septal Flattening'), n('sept_bounce', 'Septal Bounce'), n('d_shaped_lv', 'D-shaped LV'), n('pa_dilated', 'PA Dilated'), n('peric_eff', 'Pericardial Effusion')],
  },
  {
    title: 'Atria & Septum',
    fields: [f('la_size', 'LA Size'), f('ra_size', 'RA Size'), n('ias_intact', 'IAS Intact'), n('shunt', 'Shunt')],
  },
  {
    title: 'Aortic Valve',
    fields: [f('av_desc', 'AV Description'), n('av_vmax', 'AV Vmax (m/s)'), n('av_pk_grad', 'AV Peak Grad (mmHg)'), n('av_mn_grad', 'AV Mean Grad (mmHg)'), n('ava', 'AVA (cm2)'), f('as_grade', 'AS Grade'), f('ar_grade', 'AR Grade'), n('ar_pht', 'AR PHT (ms)')],
  },
  {
    title: 'Mitral Valve',
    fields: [f('mv_desc', 'MV Description'), f('ms_grade', 'MS Grade'), f('mr_grade', 'MR Grade')],
  },
  {
    title: 'Tricuspid Valve',
    fields: [f('tv_desc', 'TV Description'), f('ts_grade', 'TS Grade'), f('tr_grade', 'TR Grade')],
  },
  {
    title: 'Pulmonary Valve',
    fields: [f('pv_desc', 'PV Description'), f('ps_grade', 'PS Grade'), f('pr_grade', 'PR Grade'), n('pat', 'PAT (ms)'), n('pv_vmax', 'PV Vmax (m/s)')],
  },
  {
    title: 'Aorta',
    fields: [f('ao_root_desc', 'Aortic Root'), f('asc_ao_desc', 'Ascending Aorta')],
  },
  {
    title: 'LV Dimensions',
    fields: [n('lvidd', 'LVIDd (mm)'), n('lvids', 'LVIDs (mm)'), n('ivsd', 'IVSd (mm)'), n('lvpwd', 'LVPWd (mm)'), n('lvedvi', 'LVEDVi'), n('lvesvi', 'LVESVi'), n('rwt', 'RWT'), n('lvmi', 'LVMi (g/m2)')],
  },
  {
    title: 'LA/RA Dimensions',
    fields: [n('la_diam', 'LA Diam (mm)'), n('la_vol', 'LA Volume (ml)'), n('la_voli', 'LA Volume Index'), n('ra_area', 'RA Area (cm2)'), n('ra_areai', 'RA Area Index')],
  },
  {
    title: 'RV Dimensions',
    fields: [n('rvd1', 'RVD1 (mm)'), n('rvd2', 'RVD2 (mm)'), n('rvd3', 'RVD3 (mm)'), n('rvot2', 'RVOT (mm)')],
  },
  {
    title: 'Aortic Dimensions',
    fields: [n('ao_ann', 'Ao Annulus (mm)'), n('ao_sinus', 'Sinus of Valsalva (mm)'), n('stj_mm', 'STJ (mm)'), n('asc_ao_prox', 'Asc Ao Proximal (mm)'), n('asc_ao_mid', 'Asc Ao Mid (mm)'), n('ao_arch', 'Ao Arch (mm)'), n('main_pa_mm', 'Main PA (mm)')],
  },
  {
    title: 'LVOT & Flow',
    fields: [n('lvot_diam', 'LVOT Diam (mm)'), n('lvot_vel', 'LVOT Vel (m/s)'), n('lvot_vti', 'LVOT VTI (cm)'), n('dvi', 'DVI'), n('av_vti', 'AV VTI (cm)')],
  },
  {
    title: 'Classification',
    fields: [f('case_type', 'Case Type'), f('primary_dx', 'Primary Dx'), f('secondary_path', 'Secondary Pathology')],
  },
  {
    title: 'Conclusions',
    fields: [ta('conclusion', 'Conclusion'), ta('conc_items', 'Conclusion Items'), ta('narrative', 'Narrative'), ta('uncertain', 'Uncertain'), ta('ai_warnings', 'AI Warnings'), f('ai_conf', 'AI Confidence'), ta('ai_raw_text', 'Raw Text')],
  },
]

const CMR_SECTIONS: SectionDef[] = [
  {
    title: 'Study Setup',
    fields: [f('date_cmr', 'Date'), f('height', 'Height'), f('weight', 'Weight'), f('heart_rate', 'Heart Rate'), f('indication', 'Indication'), f('contrast', 'Contrast'), f('stress', 'Stress'), f('flow', 'Flow')],
  },
  {
    title: 'LV Volumes & Function',
    fields: [f('lv_size', 'LV Size'), f('lv_function', 'LV Function'), f('lvef', 'LVEF'), f('lvedv', 'LVEDV'), f('lvesv', 'LVESV'), f('lvsv', 'LVSV'), f('lvedvi', 'LVEDVi'), f('lvesvi', 'LVESVi'), f('lvsvi', 'LVSVi'), f('lv_mass', 'LV Mass'), f('lvmi', 'LVMi'), f('max_lv_wall', 'Max LV Wall'), f('lvh', 'LVH'), f('rwma', 'RWMA'), f('mapse', 'MAPSE')],
  },
  {
    title: 'RV Volumes & Function',
    fields: [f('rv_size', 'RV Size'), f('rv_function', 'RV Function'), f('rvef', 'RVEF'), f('rvedv', 'RVEDV'), f('rvesv', 'RVESV'), f('rvsv', 'RVSV'), f('rvedvi', 'RVEDVi'), f('rvesvi', 'RVESVi'), f('rvsvi', 'RVSVi'), f('tapse', 'TAPSE'), f('rv_lv_ratio', 'RV/LV Ratio')],
  },
  {
    title: 'Atria',
    fields: [f('la_size', 'LA Size'), f('la_volume', 'LA Volume'), f('ra_size', 'RA Size')],
  },
  {
    title: 'Septal & RH Physiology',
    fields: [f('d_shaped_lv', 'D-shaped LV'), f('d_shape_phase', 'D-shape Phase'), f('septal_flattening', 'Septal Flattening'), f('flattening_phase', 'Flattening Phase'), f('septal_bounce', 'Septal Bounce'), f('ias_bowing', 'IAS Bowing'), f('ias_direction', 'IAS Direction'), f('rap', 'RAP'), f('pcwp', 'PCWP')],
  },
  {
    title: 'PA & PH',
    fields: [f('mpa_size', 'MPA Size'), f('lpa_size', 'LPA Size'), f('rpa_size', 'RPA Size'), f('mpa_vortex', 'MPA Vortex'), f('mpa_flow', 'MPA Flow'), f('ph', 'PH'), f('constrictive_physiology', 'Constrictive Physiology')],
  },
  {
    title: 'Tissue Characterisation',
    fields: [f('native_t1', 'Native T1'), f('t2', 'T2'), f('t2_star', 'T2*'), f('ecv', 'ECV')],
  },
  {
    title: 'LGE / Scar',
    fields: [f('lge', 'LGE'), f('fibrosis', 'Fibrosis'), f('rv_insertion_point_lge', 'RV Insertion Point LGE'), f('lge_pattern', 'LGE Pattern'), f('lge_location', 'LGE Location'), f('lge_transmurality', 'LGE Transmurality')],
  },
  {
    title: 'Perfusion',
    fields: [f('perfusion_defect', 'Perfusion Defect'), f('inducible_ischaemia', 'Inducible Ischaemia'), f('fixed_defect', 'Fixed Defect'), f('reversible_defect', 'Reversible Defect'), f('perfusion_territory', 'Territory'), f('perfusion_coronary_territory', 'Coronary Territory')],
  },
  {
    title: 'Aortic Valve & Aorta',
    fields: [f('asc_aorta', 'Ascending Aorta'), f('ao_forward_volume', 'Ao Forward Volume'), f('ao_backward_volume', 'Ao Backward Volume'), f('ar_rf', 'AR RF'), f('ar_volume', 'AR Volume'), f('ar_severity', 'AR Severity'), f('as_severity', 'AS Severity'), f('ao_vmax', 'Ao Vmax'), f('ao_mean_grad', 'Ao Mean Grad'), f('holo_diastolic_reversal', 'Holo-diastolic Reversal')],
  },
  {
    title: 'Mitral Valve',
    fields: [f('mr_rf', 'MR RF'), f('mr_volume', 'MR Volume'), f('mr_severity', 'MR Severity')],
  },
  {
    title: 'Tricuspid Valve',
    fields: [f('tr_rf', 'TR RF'), f('tr_volume', 'TR Volume'), f('tr_severity', 'TR Severity')],
  },
  {
    title: 'Pulmonary Valve',
    fields: [f('pulmonary_forward_volume', 'Pulmonary Forward Volume'), f('pulmonary_backward_volume', 'Pulmonary Backward Volume'), f('pr_rf', 'PR RF'), f('pr_volume', 'PR Volume'), f('pr_severity', 'PR Severity'), f('qp_qs', 'Qp/Qs')],
  },
  {
    title: 'Pericardium',
    fields: [f('pericardial_effusion', 'Pericardial Effusion'), f('pericardial_thickening', 'Pericardial Thickening'), f('pericardial_inflammation', 'Pericardial Inflammation')],
  },
  {
    title: 'Thrombus & Mass',
    fields: [f('thrombus', 'Thrombus'), f('thrombus_location', 'Thrombus Location'), f('mass', 'Mass'), f('mass_location', 'Mass Location')],
  },
  {
    title: 'Congenital',
    fields: [f('congenital', 'Congenital'), f('congenital_detail', 'Congenital Detail')],
  },
  {
    title: 'Surgery & Device',
    fields: [f('cardiac_surgery', 'Cardiac Surgery'), f('surgery_detail', 'Surgery Detail'), f('device_prosthesis', 'Device/Prosthesis')],
  },
  {
    title: 'Classification & Conclusions',
    fields: [f('cmr_class', 'CMR Class'), f('primary_dx', 'Primary Dx'), f('secondary_dx', 'Secondary Dx'), ta('conclusions', 'Conclusions'), ta('classification_note', 'Classification Note'), ta('extracardiac_findings', 'Extracardiac Findings'), ta('other_extractable_text', 'Other Extractable Text'), ta('qc_notes', 'QC Notes')],
  },
]

function getSections(modality: string): SectionDef[] {
  switch (modality) {
    case 'rhc':
      return RHC_SECTIONS
    case 'echo':
      return ECHO_SECTIONS
    case 'cmr':
      return CMR_SECTIONS
    default:
      return []
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const MODALITIES = ['rhc', 'echo', 'cmr', 'generic'] as const
type Modality = (typeof MODALITIES)[number]
type InputTab = 'upload' | 'paste' | 'screenshot'
type SourceFileUpload = {
  id: string
  filename: string
  byte_size: number
  modality: string
}

const MAX_FILE_SIZE = 20 * 1024 * 1024 // 20 MB
const ACCEPTED_FILE_TYPES = '.pdf,.doc,.docx,.png,.jpg,.jpeg'
const ACCEPTED_IMAGE_TYPES = '.png,.jpg,.jpeg'
const NON_COUNTED_EXTRACTION_KEYS = new Set([
  'source_file',
  'raw_text',
  'ai_raw_text',
  'other_extractable_text',
  'hospital_number',
  'patient_name',
  'date_of_birth',
  'sex',
  'gender',
  'conclusion_items',
  'uncertain_fields',
  'extraction_warnings',
])

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

function humanLabel(key: string): string {
  return key
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase())
}

function normalizeDateLike(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const text = value.trim()
  if (!text) return null

  let candidate = text
  if (candidate.includes('T')) candidate = candidate.split('T', 1)[0]
  if (/^\d{4}-\d{1,2}-\d{1,2}\b/.test(candidate) && candidate.includes(' ')) {
    candidate = candidate.split(' ', 1)[0]
  }

  const isoMatch = candidate.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/)
  if (isoMatch) {
    return `${isoMatch[3].padStart(2, '0')}/${isoMatch[2].padStart(2, '0')}/${isoMatch[1]}`
  }

  const slashMatch = candidate.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})$/)
  if (slashMatch) {
    const year = slashMatch[3].length === 2 ? `20${slashMatch[3]}` : slashMatch[3]
    return `${slashMatch[1].padStart(2, '0')}/${slashMatch[2].padStart(2, '0')}/${year}`
  }

  return null
}

function hasMeaningfulValue(value: unknown): boolean {
  if (value == null) return false
  if (typeof value === 'string') return value.trim() !== ''
  if (Array.isArray(value)) return value.some((item) => hasMeaningfulValue(item))
  if (typeof value === 'object') return Object.values(value as Record<string, unknown>).some((item) => hasMeaningfulValue(item))
  return true
}

function aliasToken(key: string): string {
  return key.trim().toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '')
}

function applyAliases(payload: Record<string, unknown>, aliases: Record<string, string>) {
  for (const [sourceKey, sourceValue] of Object.entries(payload)) {
    const targetKey = aliases[sourceKey] ?? aliases[aliasToken(sourceKey)]
    if (targetKey && hasMeaningfulValue(sourceValue) && !hasMeaningfulValue(payload[targetKey])) {
      payload[targetKey] = sourceValue
    }
  }
}

function coerceNumberLike(key: string, value: unknown): number | null {
  if (value == null || value === '') return null
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) return null
    return key === 'height' && value > 0 && value < 3 ? value * 100 : value
  }
  const match = String(value).replace(/,/g, '').match(/-?\d+(?:\.\d+)?/)
  if (!match) return null
  const number = Number(match[0])
  if (!Number.isFinite(number)) return null
  return key === 'height' && number > 0 && number < 3 ? number * 100 : number
}

const RHC_NUMERIC_FIELDS = [
  'height', 'weight',
  'ra_mean', 'ra_a', 'ra_v', 'ra_o2_sat',
  'rv_systolic', 'rv_diastolic', 'rv_mean', 'rv_o2_sat',
  'pa_systolic', 'pa_diastolic', 'pa_mean', 'pa_o2_sat',
  'pcwp_mean', 'pcwp_a', 'pcwp_v', 'pcwp_o2_sat',
  'aorta_systolic', 'aorta_diastolic', 'aorta_mean', 'aorta_o2_sat',
  'lv_systolic', 'lv_diastolic', 'lv_mean', 'lv_o2_sat',
  'cardiac_output', 'cardiac_index', 'pvr_wu', 'pvr_dyn', 'tpg',
] as const

const RHC_ALIASES: Record<string, string> = {
  date: 'date_rhc',
  rhc_date: 'date_rhc',
  procedure_date: 'date_rhc',
  study_date: 'date_rhc',
  date_of_rhc: 'date_rhc',
  height: 'height',
  height_cm: 'height',
  height_m: 'height',
  height_metres: 'height',
  height_meters: 'height',
  patient_height: 'height',
  weight: 'weight',
  weight_kg: 'weight',
  patient_weight: 'weight',
  pvr: 'pvr_wu',
  pvr_wu: 'pvr_wu',
  raw_extracted_text: 'raw_text',
  source_text: 'raw_text',
  rhc_comment: 'rhc_comments',
  rhc_comments: 'rhc_comments',
  comments: 'rhc_comments',
}

const ECHO_ALIASES: Record<string, string> = {
  date: 'study_date',
  echo_date: 'study_date',
  heart_rate: 'hr',
  heart_rate_bpm: 'hr',
  height_cm: 'height',
  weight_kg: 'weight',
  bsa_m2: 'bsa',
  ward_or_op: 'ward_op',
  lv_size_description: 'lv_size',
  lv_wall_thickness_description: 'lv_wall',
  lv_systolic_function_description: 'lv_fn',
  lvef_percent: 'lvef',
  gls_percent: 'gls',
  rv_size_description: 'rv_size',
  rv_function_description: 'rv_fn',
  rv_s_prime_cm_s: 'rv_s',
  rvsp_mmhg: 'rvsp',
  rap_mmhg: 'rap',
  ivc_size_description: 'ivc_size',
  ivc_collapse_description: 'ivc_coll',
  pulmonary_hypertension_probability: 'ph_prob',
  septal_flattening_present: 'sept_flat',
  septal_bounce_present: 'sept_bounce',
  d_shaped_lv_present: 'd_shaped_lv',
  pulmonary_artery_dilated_present: 'pa_dilated',
  pericardial_effusion_present: 'peric_eff',
  interatrial_septum_intact: 'ias_intact',
  left_atrium_size_description: 'la_size',
  right_atrium_size_description: 'ra_size',
  mitral_valve_description: 'mv_desc',
  tricuspid_valve_description: 'tv_desc',
  aortic_valve_description: 'av_desc',
  pulmonary_valve_description: 'pv_desc',
  aortic_root_description: 'ao_root_desc',
  ascending_aorta_description: 'asc_ao_desc',
  main_pulmonary_artery_diameter_mm: 'main_pa_mm',
  primary_diagnosis: 'primary_dx',
  secondary_diagnosis: 'secondary_path',
  secondary_pathology: 'secondary_path',
  conclusion_text_exact: 'conclusion',
  conclusion_items: 'conc_items',
  narrative_text: 'narrative',
  measurement_table: 'meas_table',
  uncertain_fields: 'uncertain',
  extraction_warnings: 'ai_warnings',
  raw_extracted_text: 'ai_raw_text',
  ai_confidence: 'ai_conf',
}

function normalizeReviewTextValue(value: unknown): string | null {
  if (value == null) return null
  if (Array.isArray(value)) {
    const parts = value.map((item) => String(item).trim()).filter(Boolean)
    return parts.length > 0 ? parts.join('\n') : null
  }
  if (typeof value === 'object') return JSON.stringify(value)
  const text = String(value).trim()
  return text || null
}

function normaliseExtractedPayload(modality: Modality, data: Record<string, unknown>): Record<string, unknown> {
  const normalized: Record<string, unknown> = { ...data }

  for (const dateKey of ['date_rhc', 'study_date', 'report_date', 'date_cmr', 'date_cpex', 'date_of_birth']) {
    const normalizedDate = normalizeDateLike(normalized[dateKey])
    if (normalizedDate) normalized[dateKey] = normalizedDate
  }

  if (modality === 'rhc') {
    applyAliases(normalized, RHC_ALIASES)
    const normalizedDate = normalizeDateLike(normalized.date_rhc)
    if (normalizedDate) normalized.date_rhc = normalizedDate

    for (const key of RHC_NUMERIC_FIELDS) {
      const numeric = coerceNumberLike(key, normalized[key])
      if (numeric != null) normalized[key] = numeric
    }
  } else if (modality === 'echo') {
    applyAliases(normalized, ECHO_ALIASES)
    for (const key of ['conclusion', 'conc_items', 'narrative', 'uncertain', 'ai_warnings', 'ai_raw_text']) {
      const textValue = normalizeReviewTextValue(normalized[key])
      if (textValue != null) normalized[key] = textValue
    }
  } else if (modality === 'cmr') {
    const aliases: Record<string, string> = {
      study_date: 'date_cmr',
      date: 'date_cmr',
      patient_class: 'cmr_class',
      case_type: 'cmr_class',
      primary_diagnosis: 'primary_dx',
      secondary_diagnosis: 'secondary_dx',
      conclusion_text_exact: 'conclusions',
      heart_rate_bpm: 'heart_rate',
      lv_function_description: 'lv_function',
      rv_function_description: 'rv_function',
      pulmonary_hypertension_probability: 'ph',
    }

    applyAliases(normalized, aliases)

    if (!hasMeaningfulValue(normalized.conclusions) && Array.isArray(normalized.conclusion_items)) {
      const text = (normalized.conclusion_items as unknown[])
        .map((item) => String(item).trim())
        .filter(Boolean)
        .join('\n')
      if (text) normalized.conclusions = text
    }

    if (!hasMeaningfulValue(normalized.qc_notes)) {
      const qcParts: string[] = []
      const warnings = normalized.extraction_warnings
      const uncertain = normalized.uncertain_fields
      if (Array.isArray(warnings)) qcParts.push(...warnings.map((item) => String(item).trim()).filter(Boolean))
      else if (typeof warnings === 'string' && warnings.trim()) qcParts.push(warnings.trim())
      if (Array.isArray(uncertain) && uncertain.length > 0) qcParts.push(`Uncertain fields: ${uncertain.map((item) => String(item).trim()).filter(Boolean).join(', ')}`)
      else if (typeof uncertain === 'string' && uncertain.trim()) qcParts.push(`Uncertain fields: ${uncertain.trim()}`)
      if (qcParts.length > 0) normalized.qc_notes = qcParts.join('\n')
    }
  }

  return normalized
}

// ---------------------------------------------------------------------------
// Step 1: Input
// ---------------------------------------------------------------------------

function StepInput({
  onExtract,
}: {
  onExtract: (payload: { file?: File; text?: string; imageBase64?: string; modality: Modality; sourceType?: string }) => void
}) {
  const [tab, setTab] = useState<InputTab>('upload')
  const [file, setFile] = useState<File | null>(null)
  const [pasteText, setPasteText] = useState('')
  const [screenshotFile, setScreenshotFile] = useState<File | null>(null)
  const [modality, setModality] = useState<Modality | null>(null)
  const [sourceType, setSourceType] = useState<'email' | 'report'>('report')
  const [dragOver, setDragOver] = useState(false)
  const [fileError, setFileError] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const screenshotInputRef = useRef<HTMLInputElement>(null)

  const hasInput =
    (tab === 'upload' && file !== null) ||
    (tab === 'paste' && pasteText.trim().length > 0) ||
    (tab === 'screenshot' && screenshotFile !== null)

  const canExtract = hasInput && modality !== null

  const handleFilePick = (picked: File | null) => {
    setFileError(null)
    if (!picked) return
    if (picked.size > MAX_FILE_SIZE) {
      setFileError(`File is too large (${formatFileSize(picked.size)}). Maximum is 20 MB.`)
      return
    }
    setFile(picked)
  }

  const handleScreenshotPick = (picked: File | null) => {
    setFileError(null)
    if (!picked) return
    if (picked.size > MAX_FILE_SIZE) {
      setFileError(`File is too large (${formatFileSize(picked.size)}). Maximum is 20 MB.`)
      return
    }
    setScreenshotFile(picked)
  }

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    setDragOver(false)
    const dropped = e.dataTransfer.files[0]
    if (dropped) handleFilePick(dropped)
  }

  const handleExtract = () => {
    if (!modality) return

    if (tab === 'upload' && file) {
      onExtract({ file, modality, sourceType: modality === 'rhc' ? sourceType : undefined })
    } else if (tab === 'paste' && pasteText.trim()) {
      onExtract({ text: pasteText.trim(), modality, sourceType: modality === 'rhc' ? sourceType : undefined })
    } else if (tab === 'screenshot' && screenshotFile) {
      // Send as file upload — more reliable than base64 for large images
      onExtract({ file: screenshotFile, modality, sourceType: modality === 'rhc' ? sourceType : undefined })
    }
  }

  const tabs: { id: InputTab; label: string; icon: React.ReactNode }[] = [
    { id: 'upload', label: 'Upload File', icon: <Upload className="h-4 w-4" /> },
    { id: 'paste', label: 'Paste Text', icon: <FileText className="h-4 w-4" /> },
    { id: 'screenshot', label: 'Screenshot', icon: <Camera className="h-4 w-4" /> },
  ]

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      {/* Input method tabs */}
      <div className="flex gap-1 rounded-lg bg-[hsl(var(--tone-neutral-100))] p-1">
        {tabs.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setTab(t.id)}
            className={cn(
              'flex flex-1 items-center justify-center gap-2 rounded-md px-4 py-2.5 text-sm font-medium transition-colors',
              tab === t.id
                ? 'bg-[hsl(var(--background))] text-[hsl(var(--foreground))] shadow-sm'
                : 'text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--foreground))]',
            )}
          >
            {t.icon}
            {t.label}
          </button>
        ))}
      </div>

      {/* Upload tab */}
      {tab === 'upload' && (
        <div>
          <div
            onDragOver={(e) => { e.preventDefault(); setDragOver(true) }}
            onDragLeave={() => setDragOver(false)}
            onDrop={handleDrop}
            onClick={() => fileInputRef.current?.click()}
            className={cn(
              'flex cursor-pointer flex-col items-center justify-center rounded-lg border-2 border-dashed px-6 py-12 transition-colors',
              dragOver
                ? 'border-[hsl(var(--tone-accent-400))] bg-[hsl(var(--tone-accent-50)/0.3)]'
                : file
                  ? 'border-[hsl(var(--tone-positive-300))] bg-[hsl(var(--tone-positive-50)/0.2)]'
                  : 'border-[hsl(var(--stroke-soft)/0.72)] bg-[hsl(var(--tone-neutral-50)/0.3)] hover:border-[hsl(var(--tone-accent-300))]',
            )}
          >
            {file ? (
              <div className="flex items-center gap-3">
                <CheckCircle2 className="h-6 w-6 text-[hsl(var(--tone-positive-500))]" />
                <div>
                  <p className="text-sm font-medium text-[hsl(var(--foreground))]">{file.name}</p>
                  <p className="text-xs text-[hsl(var(--muted-foreground))]">{formatFileSize(file.size)}</p>
                </div>
                <button
                  type="button"
                  onClick={(e) => { e.stopPropagation(); setFile(null) }}
                  className="ml-2 rounded p-1 hover:bg-[hsl(var(--tone-neutral-100))]"
                >
                  <X className="h-4 w-4 text-[hsl(var(--muted-foreground))]" />
                </button>
              </div>
            ) : (
              <>
                <Upload className="mb-3 h-8 w-8 text-[hsl(var(--muted-foreground))]" />
                <p className="text-sm font-medium text-[hsl(var(--foreground))]">
                  Drop a file here, or click to browse
                </p>
                <p className="mt-1 text-xs text-[hsl(var(--muted-foreground))]">
                  PDF, DOC, DOCX, PNG, JPG &mdash; up to 20 MB
                </p>
              </>
            )}
          </div>
          <input
            ref={fileInputRef}
            type="file"
            accept={ACCEPTED_FILE_TYPES}
            className="hidden"
            onChange={(e) => handleFilePick(e.target.files?.[0] ?? null)}
          />
        </div>
      )}

      {/* Paste text tab */}
      {tab === 'paste' && (
        <textarea
          value={pasteText}
          onChange={(e) => setPasteText(e.target.value)}
          placeholder="Paste the clinical report text here..."
          rows={12}
          className="house-input rounded-lg w-full resize-y text-xs py-1.5 px-2.5"
        />
      )}

      {/* Screenshot tab */}
      {tab === 'screenshot' && (
        <div>
          <div
            tabIndex={0}
            onClick={() => { if (!screenshotFile) screenshotInputRef.current?.click() }}
            onPaste={(e) => {
              const items = e.clipboardData?.items
              if (!items) return
              for (const item of items) {
                if (item.type.startsWith('image/')) {
                  e.preventDefault()
                  const blob = item.getAsFile()
                  if (blob) {
                    const file = new File([blob], `clipboard_${Date.now()}.png`, { type: blob.type })
                    handleScreenshotPick(file)
                  }
                  return
                }
              }
            }}
            className={cn(
              'flex flex-col items-center justify-center rounded-lg border-2 border-dashed px-6 py-12 transition-colors outline-none focus:border-[hsl(var(--tone-accent-400))]',
              screenshotFile
                ? 'border-[hsl(var(--tone-positive-300))] bg-[hsl(var(--tone-positive-50)/0.2)]'
                : 'border-[hsl(var(--stroke-soft)/0.72)] bg-[hsl(var(--tone-neutral-50)/0.3)] hover:border-[hsl(var(--tone-accent-300))] cursor-pointer',
            )}
          >
            {screenshotFile ? (
              <div className="flex items-center gap-3">
                <CheckCircle2 className="h-6 w-6 text-[hsl(var(--tone-positive-500))]" />
                <div>
                  <p className="text-sm font-medium text-[hsl(var(--foreground))]">{screenshotFile.name}</p>
                  <p className="text-xs text-[hsl(var(--muted-foreground))]">{formatFileSize(screenshotFile.size)}</p>
                </div>
                <button
                  type="button"
                  onClick={(e) => { e.stopPropagation(); setScreenshotFile(null) }}
                  className="ml-2 rounded p-1 hover:bg-[hsl(var(--tone-neutral-100))]"
                >
                  <X className="h-4 w-4 text-[hsl(var(--muted-foreground))]" />
                </button>
              </div>
            ) : (
              <>
                <Camera className="mb-3 h-8 w-8 text-[hsl(var(--muted-foreground))]" />
                <p className="text-sm font-medium text-[hsl(var(--foreground))]">
                  Paste a screenshot (Ctrl+V)
                </p>
                <p className="mt-1 text-xs text-[hsl(var(--muted-foreground))]">
                  or click to select &mdash; PNG, JPG up to 20 MB
                </p>
              </>
            )}
          </div>
          <input
            ref={screenshotInputRef}
            type="file"
            accept={ACCEPTED_IMAGE_TYPES}
            className="hidden"
            onChange={(e) => handleScreenshotPick(e.target.files?.[0] ?? null)}
          />
        </div>
      )}

      {fileError && (
        <div className="flex items-center gap-2 rounded-md border border-[hsl(var(--tone-danger-200))] bg-[hsl(var(--tone-danger-50))] px-4 py-2.5 text-sm text-[hsl(var(--tone-danger-700))]">
          <AlertCircle className="h-4 w-4 flex-shrink-0" />
          {fileError}
        </div>
      )}

      {/* Modality selector */}
      <div>
        <label className="mb-2 block text-xs font-semibold uppercase tracking-[0.05em] text-[hsl(var(--muted-foreground))]">
          Modality
        </label>
        <div className="flex gap-2">
          {MODALITIES.map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => setModality(m)}
              className={cn(
                'rounded-md px-4 py-2 text-sm font-medium transition-colors',
                modality === m
                  ? 'bg-[hsl(var(--tone-accent-600))] text-white shadow-sm'
                  : 'bg-[hsl(var(--tone-neutral-100))] text-[hsl(var(--foreground))] hover:bg-[hsl(var(--tone-neutral-200))]',
              )}
            >
              {m.toUpperCase()}
            </button>
          ))}
        </div>
      </div>

      {/* Source type (RHC only) */}
      {modality === 'rhc' && (
        <div>
          <label className="mb-2 block text-xs font-semibold uppercase tracking-[0.05em] text-[hsl(var(--muted-foreground))]">
            Source Type
          </label>
          <div className="flex gap-2">
            {[
              { value: 'report' as const, label: 'Formal Report' },
              { value: 'email' as const, label: 'Email' },
            ].map((opt) => (
              <button
                key={opt.value}
                type="button"
                onClick={() => setSourceType(opt.value)}
                className={cn(
                  'rounded-md px-4 py-2 text-sm font-medium transition-colors',
                  sourceType === opt.value
                    ? 'bg-[hsl(var(--tone-accent-600))] text-white shadow-sm'
                    : 'bg-[hsl(var(--tone-neutral-100))] text-[hsl(var(--foreground))] hover:bg-[hsl(var(--tone-neutral-200))]',
                )}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Extract button */}
      <button
        type="button"
        onClick={handleExtract}
        disabled={!canExtract}
        className="inline-flex w-full items-center justify-center gap-2 rounded-md bg-[hsl(var(--tone-accent-600))] px-6 py-3 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-[hsl(var(--tone-accent-700))] disabled:opacity-50 disabled:cursor-not-allowed"
      >
        <FileText className="h-4 w-4" />
        Extract Data
      </button>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Step 2: Processing
// ---------------------------------------------------------------------------

function StepProcessing({ onCancel }: { onCancel: () => void }) {
  return (
    <div className="mx-auto flex max-w-md flex-col items-center justify-center py-20 text-center">
      <Loader2 className="mb-4 h-10 w-10 animate-spin text-[hsl(var(--tone-accent-500))]" />
      <p className="text-lg font-semibold text-[hsl(var(--foreground))]">
        Extracting data from your document...
      </p>
      <p className="mt-2 text-sm text-[hsl(var(--muted-foreground))]">
        This may take a minute depending on the document size.
      </p>
      <button
        type="button"
        onClick={onCancel}
        className="mt-6 inline-flex items-center gap-1.5 rounded-md border border-[hsl(var(--border))] bg-[hsl(var(--background))] px-4 py-2 text-sm font-medium text-[hsl(var(--foreground))] shadow-sm transition-colors hover:bg-[hsl(var(--tone-neutral-50))]"
      >
        Cancel
      </button>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Step 3: Review & Save
// ---------------------------------------------------------------------------

function StepReview({
  modality,
  extractedData,
  sourceFileUpload,
  onBack,
}: {
  modality: Modality
  extractedData: Record<string, unknown>
  sourceFileUpload: SourceFileUpload | null
  onBack: () => void
}) {
  const navigate = useNavigate()
  const [form, setForm] = useState<Record<string, unknown>>({ ...extractedData })
  const [hospitalNumber, setHospitalNumber] = useState('')
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [saveSuccess, setSaveSuccess] = useState(false)

  const setField = useCallback((key: string, value: unknown) => {
    setForm((prev) => ({ ...prev, [key]: value }))
  }, [])

  const sections = getSections(modality)

  // For "generic" modality or unknown, show all keys as flat fields
  const isGeneric = modality === 'generic' || sections.length === 0
  const visibleFieldKeys = isGeneric
    ? Object.keys(form)
    : Array.from(new Set(sections.flatMap((section) => section.fields.map((field) => field.key))))
  const countableFieldKeys = visibleFieldKeys.filter((key) => !NON_COUNTED_EXTRACTION_KEYS.has(key))

  const handleSaveToCohort = async () => {
    if (!hospitalNumber.trim()) return
    setSaving(true)
    setSaveError(null)
    try {
      // Extract patient-level fields from form for patient creation
      const patientData: Record<string, string> = {}
      if (form.patient_name) patientData.name = String(form.patient_name)
      if (form.date_of_birth) patientData.dob = String(form.date_of_birth)
      if (form.sex) patientData.gender = String(form.sex)
      if (form.gender) patientData.gender = String(form.gender)

      await saveExtraction({
        modality,
        hospital_number: hospitalNumber.trim(),
        create_patient_if_missing: true,
        patient_data: patientData,
        record_data: form,
        source_file_upload_id: sourceFileUpload?.id ?? null,
      })
      setSaveSuccess(true)
      setTimeout(() => {
        navigate(`/extract-patient/${encodeURIComponent(hospitalNumber.trim())}`)
      }, 600)
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : 'Failed to save extraction')
    } finally {
      setSaving(false)
    }
  }

  const handleDownloadJson = () => {
    const blob = new Blob([JSON.stringify(form, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `extraction-${modality}-${new Date().toISOString().slice(0, 10)}.json`
    a.click()
    URL.revokeObjectURL(url)
  }

  const renderField = (fieldDef: FieldDef) => {
    const val = form[fieldDef.key]
    if (fieldDef.type === 'textarea') {
      return (
        <div key={fieldDef.key} className="sm:col-span-2 lg:col-span-4">
          <label className="mb-1.5 block text-xs font-medium text-[hsl(var(--muted-foreground))]">
            {fieldDef.label}
          </label>
          <textarea
            value={val != null ? String(val) : ''}
            onChange={(e) => setField(fieldDef.key, e.target.value)}
            rows={3}
            className="house-input rounded-lg w-full resize-y text-xs py-1.5 px-2.5"
          />
        </div>
      )
    }
    if (fieldDef.type === 'number') {
      return (
        <div key={fieldDef.key}>
          <label className="mb-1.5 block text-xs font-medium text-[hsl(var(--muted-foreground))]">
            {fieldDef.label}
          </label>
          <input
            type="number"
            step="any"
            value={val != null && val !== '' ? String(val) : ''}
            onChange={(e) => {
              const raw = e.target.value
              setField(fieldDef.key, raw === '' ? null : Number(raw))
            }}
            className="house-input rounded-lg w-full text-xs py-1.5 px-2.5"
          />
        </div>
      )
    }
    return (
      <div key={fieldDef.key}>
        <label className="mb-1.5 block text-xs font-medium text-[hsl(var(--muted-foreground))]">
          {fieldDef.label}
        </label>
        <input
          type="text"
          value={val != null ? String(val) : ''}
          onChange={(e) => setField(fieldDef.key, e.target.value)}
          className="house-input rounded-lg w-full text-xs py-1.5 px-2.5"
        />
      </div>
    )
  }

  const filledCount = countableFieldKeys.filter((key) => hasMeaningfulValue(form[key])).length
  const totalCount = countableFieldKeys.length

  return (
    <div className="space-y-6">
      {/* Header bar */}
      <div className="flex items-center justify-between">
        <button
          type="button"
          onClick={onBack}
          className="inline-flex items-center gap-1.5 rounded-md border border-[hsl(var(--border))] bg-[hsl(var(--background))] px-3 py-2 text-sm font-medium text-[hsl(var(--foreground))] shadow-sm transition-colors hover:bg-[hsl(var(--tone-neutral-50))]"
        >
          <ArrowLeft className="h-4 w-4" />
          Back
        </button>
        <div className="text-sm text-[hsl(var(--muted-foreground))]">
          <span className="font-semibold text-[hsl(var(--foreground))]">{filledCount}</span> / {totalCount} fields extracted
        </div>
      </div>

      {/* Extracted data form */}
      {isGeneric ? (
        <div className="rounded-lg border border-[hsl(var(--stroke-soft)/0.72)] bg-[hsl(var(--card))] px-5 py-4 shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
          <h3 className="mb-4 text-sm font-semibold uppercase tracking-[0.05em] text-[hsl(var(--muted-foreground))]">
            Extracted Fields
          </h3>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {Object.keys(form).map((key) => {
              const val = form[key]
              const isLong = typeof val === 'string' && val.length > 80
              return (
                <div key={key} className={isLong ? 'sm:col-span-2 lg:col-span-4' : ''}>
                  <label className="mb-1.5 block text-xs font-medium text-[hsl(var(--muted-foreground))]">
                    {humanLabel(key)}
                  </label>
                  {isLong ? (
                    <textarea
                      value={String(val ?? '')}
                      onChange={(e) => setField(key, e.target.value)}
                      rows={3}
                      className="house-input rounded-lg w-full resize-y text-xs py-1.5 px-2.5"
                    />
                  ) : (
                    <input
                      type="text"
                      value={val != null ? String(val) : ''}
                      onChange={(e) => setField(key, e.target.value)}
                      className="house-input rounded-lg w-full text-xs py-1.5 px-2.5"
                    />
                  )}
                </div>
              )
            })}
          </div>
        </div>
      ) : (
        <div className="space-y-4">
          {sections.map((section) => (
            <div
              key={section.title}
              className="rounded-lg border border-[hsl(var(--stroke-soft)/0.72)] bg-[hsl(var(--card))] shadow-[0_1px_3px_rgba(0,0,0,0.04)]"
            >
              <div className="border-b border-[hsl(var(--stroke-soft)/0.4)] px-5 py-3">
                <h3 className="text-sm font-semibold uppercase tracking-[0.05em] text-[hsl(var(--muted-foreground))]">
                  {section.title}
                </h3>
              </div>
              <div className="px-5 py-4">
                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                  {section.fields.map(renderField)}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Save actions */}
      <div className="rounded-lg border border-[hsl(var(--stroke-soft)/0.72)] bg-[hsl(var(--card))] px-5 py-5 shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:gap-6">
          {/* Add to PH Cohort */}
          <div className="flex-1 space-y-2">
            <label className="block text-xs font-semibold uppercase tracking-[0.05em] text-[hsl(var(--muted-foreground))]">
              Add to PH Cohort
            </label>
            {sourceFileUpload && (
              <p className="text-xs text-[hsl(var(--muted-foreground))]">
                Source file will be stored with this {modality.toUpperCase()} record:{' '}
                <span className="font-medium text-[hsl(var(--foreground))]">{sourceFileUpload.filename}</span>
              </p>
            )}
            <div className="flex gap-2">
              <input
                type="text"
                placeholder="Hospital Number (HN)"
                value={hospitalNumber}
                onChange={(e) => setHospitalNumber(e.target.value)}
                className="house-input rounded-lg flex-1 text-xs py-1.5 px-2.5"
              />
              <button
                type="button"
                onClick={() => void handleSaveToCohort()}
                disabled={saving || !hospitalNumber.trim() || saveSuccess}
                className={cn(
                  'inline-flex items-center gap-1.5 rounded-md px-4 py-2 text-sm font-semibold text-white shadow-sm transition-colors disabled:opacity-50 disabled:cursor-not-allowed',
                  saveSuccess
                    ? 'bg-[hsl(var(--tone-positive-500))]'
                    : 'bg-[hsl(var(--tone-positive-600))] hover:bg-[hsl(var(--tone-positive-700))]',
                )}
              >
                {saving ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : saveSuccess ? (
                  <CheckCircle2 className="h-4 w-4" />
                ) : (
                  <Save className="h-4 w-4" />
                )}
                {saveSuccess ? 'Saved' : 'Save'}
              </button>
            </div>
            {saveError && (
              <p className="text-xs text-[hsl(var(--tone-danger-600))]">{saveError}</p>
            )}
          </div>

          {/* Divider */}
          <div className="hidden sm:block h-12 w-px bg-[hsl(var(--stroke-soft)/0.72)]" />

          {/* Download JSON */}
          <div>
            <button
              type="button"
              onClick={handleDownloadJson}
              className="inline-flex items-center gap-1.5 rounded-md border border-[hsl(var(--border))] bg-[hsl(var(--background))] px-4 py-2 text-sm font-medium text-[hsl(var(--foreground))] shadow-sm transition-colors hover:bg-[hsl(var(--tone-neutral-50))]"
            >
              <Download className="h-4 w-4" />
              Download JSON
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Main page component
// ---------------------------------------------------------------------------

type Step = 'input' | 'processing' | 'review'

export function ExtractExtractionPage() {
  const [step, setStep] = useState<Step>('input')
  const [modality, setModality] = useState<Modality>('rhc')
  const [extractedData, setExtractedData] = useState<Record<string, unknown>>({})
  const [sourceFileUpload, setSourceFileUpload] = useState<SourceFileUpload | null>(null)
  const [error, setError] = useState<string | null>(null)
  const abortRef = useRef<AbortController | null>(null)

  const handleExtract = async (payload: {
    file?: File
    text?: string
    imageBase64?: string
    modality: Modality
    sourceType?: string
  }) => {
    setModality(payload.modality)
    setStep('processing')
    setError(null)
    setSourceFileUpload(null)

    abortRef.current = new AbortController()

    try {
      let result: unknown

      if (payload.file) {
        result = await runExtractionFile(payload.file, payload.modality, payload.sourceType)
      } else if (payload.text) {
        result = await runExtraction({
          text: payload.text,
          modality: payload.modality,
          source_type: payload.sourceType,
        })
      } else if (payload.imageBase64) {
        result = await runExtraction({
          image_base64: payload.imageBase64,
          modality: payload.modality,
          source_type: payload.sourceType,
        })
      } else {
        throw new Error('No input provided')
      }

      // The API returns { extracted_data: { ... } } or similar
      const data =
        result && typeof result === 'object'
          ? (result as Record<string, unknown>).extracted_data ??
            (result as Record<string, unknown>).data ??
            result
          : {}
      const sourceFile =
        result && typeof result === 'object'
          ? (result as Record<string, unknown>).source_file_upload
          : null

      // Inject the original input text into the raw text field
      const extracted = normaliseExtractedPayload(payload.modality, data as Record<string, unknown>)
      if (payload.text) {
        if (payload.modality === 'rhc') extracted.raw_text = payload.text
        else if (payload.modality === 'echo') extracted.ai_raw_text = payload.text
        else if (payload.modality === 'cmr') extracted.other_extractable_text = payload.text
      }

      if (sourceFile && typeof sourceFile === 'object') {
        const upload = sourceFile as Record<string, unknown>
        if (typeof upload.id === 'string' && typeof upload.filename === 'string') {
          setSourceFileUpload({
            id: upload.id,
            filename: upload.filename,
            byte_size: typeof upload.byte_size === 'number' ? upload.byte_size : 0,
            modality: typeof upload.modality === 'string' ? upload.modality : payload.modality,
          })
        }
      }

      setExtractedData(extracted)
      setStep('review')
    } catch (err) {
      if ((err as Error).name === 'AbortError') return
      setError(err instanceof Error ? err.message : 'Extraction failed')
      setStep('input')
    }
  }

  const handleCancel = () => {
    abortRef.current?.abort()
    setStep('input')
  }

  const handleBack = () => {
    setStep('input')
    setExtractedData({})
    setSourceFileUpload(null)
    setError(null)
  }

  return (
    <div className="min-h-screen bg-[hsl(var(--background))]">
      {/* Top bar */}
      <div className="border-b border-[hsl(var(--stroke-soft)/0.72)] bg-[hsl(var(--card))]">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-6 py-4">
          <h1 className="text-lg font-semibold text-[hsl(var(--foreground))]">
            Extract Clinical Data
          </h1>
          {/* Step indicator */}
          <div className="flex items-center gap-2 text-xs font-medium">
            {(['input', 'processing', 'review'] as Step[]).map((s, i) => (
              <div key={s} className="flex items-center gap-2">
                {i > 0 && <div className="h-px w-6 bg-[hsl(var(--stroke-soft)/0.72)]" />}
                <div
                  className={cn(
                    'flex h-6 w-6 items-center justify-center rounded-full text-xs font-bold',
                    step === s
                      ? 'bg-[hsl(var(--tone-accent-600))] text-white'
                      : step === 'review' && s === 'input'
                        ? 'bg-[hsl(var(--tone-positive-100))] text-[hsl(var(--tone-positive-700))]'
                        : step === 'review' && s === 'processing'
                          ? 'bg-[hsl(var(--tone-positive-100))] text-[hsl(var(--tone-positive-700))]'
                          : 'bg-[hsl(var(--tone-neutral-100))] text-[hsl(var(--muted-foreground))]',
                  )}
                >
                  {i + 1}
                </div>
                <span
                  className={cn(
                    'hidden sm:inline capitalize',
                    step === s
                      ? 'text-[hsl(var(--foreground))]'
                      : 'text-[hsl(var(--muted-foreground))]',
                  )}
                >
                  {s}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="mx-auto max-w-5xl px-6 py-8">
        {error && (
          <div className="mb-6 flex items-center gap-2 rounded-md border border-[hsl(var(--tone-danger-200))] bg-[hsl(var(--tone-danger-50))] px-4 py-3 text-sm text-[hsl(var(--tone-danger-700))]">
            <AlertCircle className="h-4 w-4 flex-shrink-0" />
            {error}
          </div>
        )}

        {step === 'input' && <StepInput onExtract={(p) => void handleExtract(p)} />}
        {step === 'processing' && <StepProcessing onCancel={handleCancel} />}
        {step === 'review' && (
          <StepReview
            modality={modality}
            extractedData={extractedData}
            sourceFileUpload={sourceFileUpload}
            onBack={handleBack}
          />
        )}
      </div>
    </div>
  )
}
