import { Fragment, useCallback, useEffect, useRef, useState } from 'react'
import { Plus, Save, Loader2, X } from 'lucide-react'

import { fetchRecords, fetchRecord, createRecord, updateRecord, deleteRecord } from '@/lib/extract-api'
import { cn, toDateInputValue } from '@/lib/utils'
import { usePatientContext } from './extract-patient-detail-page'
import { ParameterTable, type ParameterSection, type DemographicPill } from '@/components/extract/parameter-table'
import { useRecordContextMenu, DeleteMenuItem } from '@/components/extract/record-context-menu'
import { EditablePill, pillStyle, type PillOption } from '@/components/extract/editable-pill'
import { SourceFileCell, SourceFileHeaderCell } from '@/components/extract/source-file-cell'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type EchoRecord = {
  id: string
  hn: string
  // Section 1: Study Info
  study_date: string
  report_date: string
  consultant: string
  ward_op: string
  study_reason: string
  reported_by: string
  image_quality: string
  // Section 2: Vitals & Anthropometrics
  rhythm: string
  hr: number | null
  bp_text: string
  height: number | null
  weight: number | null
  bsa: number | null
  // Section 3: LV Size & Function
  lv_size: string
  lv_wall: string
  lvh: number | null
  rwma: number | null
  lv_fn: string
  lvef: number | null
  gls: number | null
  mapse: number | null
  med_s: number | null
  lat_s: number | null
  // Section 4: Diastolic Function
  sept_e: number | null
  lat_e: number | null
  avg_e_ep: number | null
  sept_e_ep: number | null
  mv_e: number | null
  mv_a: number | null
  e_a: number | null
  dt_ms: number | null
  diast_fn: string
  fill_press: string
  // Section 5: RV Size & Function
  rv_size: string
  rv_fn: string
  tapse: number | null
  rv_s: number | null
  fac: number | null
  tr_vmax: number | null
  rvsp: number | null
  rap: number | null
  // Section 6: IVC & PH
  ivc_size: string
  ivc_coll: string
  ph_prob: string
  sept_flat: number | null
  sept_bounce: number | null
  d_shaped_lv: number | null
  pa_dilated: number | null
  peric_eff: number | null
  // Section 7: Atria & Septum
  la_size: string
  ra_size: string
  ias_intact: number | null
  shunt: number | null
  // Section 8: Aortic Valve
  av_desc: string
  av_vmax: number | null
  av_pk_grad: number | null
  av_mn_grad: number | null
  ava: number | null
  as_grade: string
  ar_grade: string
  ar_pht: number | null
  // Section 9: Mitral Valve
  mv_desc: string
  ms_grade: string
  mr_grade: string
  // Section 10: Tricuspid Valve
  tv_desc: string
  ts_grade: string
  tr_grade: string
  // Section 11: Pulmonary Valve
  pv_desc: string
  ps_grade: string
  pr_grade: string
  pat: number | null
  pv_vmax: number | null
  // Section 12: Aorta
  ao_root_desc: string
  asc_ao_desc: string
  // Section 13: LV Dimensions
  lvidd: number | null
  lvids: number | null
  ivsd: number | null
  lvpwd: number | null
  lvedvi: number | null
  lvesvi: number | null
  rwt: number | null
  lvmi: number | null
  // Section 14: LA/RA Dimensions
  la_diam: number | null
  la_vol: number | null
  la_voli: number | null
  ra_area: number | null
  ra_areai: number | null
  // Section 15: RV Dimensions
  rvd1: number | null
  rvd2: number | null
  rvd3: number | null
  rvot2: number | null
  // Section 16: Aortic Dimensions
  ao_ann: number | null
  ao_sinus: number | null
  stj_mm: number | null
  asc_ao_prox: number | null
  asc_ao_mid: number | null
  ao_arch: number | null
  main_pa_mm: number | null
  // Section 17: LVOT & Flow
  lvot_diam: number | null
  lvot_vel: number | null
  lvot_vti: number | null
  dvi: number | null
  av_vti: number | null
  // Section 18: Classification
  case_type: string
  primary_dx: string
  secondary_path: string
  // Section 19: Conclusions
  conclusion: string
  conc_items: string
  narrative: string
  meas_table: string
  uncertain: string
  ai_warnings: string
  ai_conf: string
  ai_raw_text: string
  // Section 20: Source
  source_file: string
  // Meta
  status: string
  status_date: string
  created_at: string
}

const EMPTY_ECHO: Omit<EchoRecord, 'id' | 'created_at'> = {
  hn: '',
  study_date: '', report_date: '', consultant: '', ward_op: '', study_reason: '', reported_by: '', image_quality: '',
  rhythm: '', hr: null, bp_text: '', height: null, weight: null, bsa: null,
  lv_size: '', lv_wall: '', lvh: null, rwma: null, lv_fn: '', lvef: null, gls: null, mapse: null, med_s: null, lat_s: null,
  sept_e: null, lat_e: null, avg_e_ep: null, sept_e_ep: null, mv_e: null, mv_a: null, e_a: null, dt_ms: null, diast_fn: '', fill_press: '',
  rv_size: '', rv_fn: '', tapse: null, rv_s: null, fac: null, tr_vmax: null, rvsp: null, rap: null,
  ivc_size: '', ivc_coll: '', ph_prob: '', sept_flat: null, sept_bounce: null, d_shaped_lv: null, pa_dilated: null, peric_eff: null,
  la_size: '', ra_size: '', ias_intact: null, shunt: null,
  av_desc: '', av_vmax: null, av_pk_grad: null, av_mn_grad: null, ava: null, as_grade: '', ar_grade: '', ar_pht: null,
  mv_desc: '', ms_grade: '', mr_grade: '',
  tv_desc: '', ts_grade: '', tr_grade: '',
  pv_desc: '', ps_grade: '', pr_grade: '', pat: null, pv_vmax: null,
  ao_root_desc: '', asc_ao_desc: '',
  lvidd: null, lvids: null, ivsd: null, lvpwd: null, lvedvi: null, lvesvi: null, rwt: null, lvmi: null,
  la_diam: null, la_vol: null, la_voli: null, ra_area: null, ra_areai: null,
  rvd1: null, rvd2: null, rvd3: null, rvot2: null,
  ao_ann: null, ao_sinus: null, stj_mm: null, asc_ao_prox: null, asc_ao_mid: null, ao_arch: null, main_pa_mm: null,
  lvot_diam: null, lvot_vel: null, lvot_vti: null, dvi: null, av_vti: null,
  case_type: '', primary_dx: '', secondary_path: '',
  conclusion: '', conc_items: '', narrative: '', meas_table: '', uncertain: '', ai_warnings: '', ai_conf: '', ai_raw_text: '',
  source_file: '',
  status: 'Pending', status_date: '',
}

// ---------------------------------------------------------------------------
// Echo reference range sections (ASE/EACVI Guidelines)
// ---------------------------------------------------------------------------

const ECHO_SECTIONS: ParameterSection[] = [
  {
    title: 'Right heart and pulmonary hypertension',
    params: [
      { key: 'tapse', label: 'TAPSE', unit: 'mm', ll: 17, mean: 22, ul: 27, direction: 'low', decimalPlaces: 0, interpretations: ['Normal RV function', 'Mildly reduced RV function', 'Reduced RV longitudinal function', 'Severely reduced RV function'], subsection: 'RV function' },
      { key: 'rv_s', label: 'RV S\u2032 (TDI)', unit: 'cm/s', ll: 9.5, mean: 13, ul: 16, direction: 'low', decimalPlaces: 1, interpretations: ['Normal', 'Mildly reduced', 'Reduced RV longitudinal velocity', 'Severely reduced'] },
      { key: 'fac', label: 'Fractional area change', unit: '%', ll: 35, mean: 45, ul: 55, direction: 'low', decimalPlaces: 0, interpretations: ['Normal RV contractility', 'Mildly reduced FAC', 'Reduced RV contractility', 'Severely reduced'] },
      { key: 'tr_vmax', label: 'TR peak velocity', unit: 'm/s', ll: 1.8, mean: 2.3, ul: 2.8, direction: 'high', decimalPlaces: 1, interpretations: ['Low PH probability', 'Borderline elevated', 'Intermediate PH probability', 'High PH probability'], subsection: 'Pulmonary pressures' },
      { key: 'rvsp', label: 'RV systolic pressure', unit: 'mmHg', ll: 15, mean: 25, ul: 35, direction: 'high', decimalPlaces: 0, interpretations: ['Normal', 'Mildly elevated RVSP', 'Elevated RVSP', 'Severely elevated RVSP'] },
      { key: 'rap', label: 'RA pressure (estimated)', unit: 'mmHg', ll: 0, mean: 3, ul: 5, direction: 'high', decimalPlaces: 0, interpretations: ['Normal RAP', 'Mildly elevated RAP', 'Elevated RAP', 'Markedly elevated RAP'] },
      { key: 'pat', label: 'Pulmonary acceleration time', unit: 'ms', ll: 100, mean: 130, ul: 160, direction: 'low', decimalPlaces: 0, subsection: 'Pulmonary valve and PA' },
      { key: 'pv_vmax', label: 'PV peak velocity', unit: 'm/s', ll: 0.5, mean: 0.75, ul: 1.0, direction: 'high', decimalPlaces: 1 },
      { key: 'main_pa_mm', label: 'Main pulmonary artery diameter', unit: 'mm', ll: 15, mean: 21, ul: 25, direction: 'high', decimalPlaces: 0 },
    ],
  },
  {
    title: 'LV systolic function',
    params: [
      { key: 'lvef', label: 'LV ejection fraction', unit: '%', ll: 52, mean: 62, ul: 72, direction: 'low', decimalPlaces: 0, interpretations: ['Normal LV function', 'Mildly impaired LV function', 'Moderately impaired LV function', 'Severely impaired LV function'], subsection: 'Global function' , severityZones: [{ grade: 'mild', threshold: 52 }, { grade: 'moderate', threshold: 41 }, { grade: 'severe', threshold: 30 }]},
      { key: 'gls', label: 'Global longitudinal strain', unit: '%', ll: -22, mean: -20, ul: -18, direction: 'high', decimalPlaces: 1 },
      { key: 'mapse', label: 'MAPSE', unit: 'mm', ll: 10, mean: 14, ul: 18, direction: 'low', decimalPlaces: 0, subsection: 'Tissue Doppler' },
      { key: 'med_s', label: 'Medial S\u2032', unit: 'cm/s', ll: 7, mean: 8.5, ul: 10, direction: 'low', decimalPlaces: 1 },
      { key: 'lat_s', label: 'Lateral S\u2032', unit: 'cm/s', ll: 10, mean: 12, ul: 14, direction: 'low', decimalPlaces: 1 },
    ],
  },
  {
    title: 'Diastolic function',
    params: [
      { key: 'mv_e', label: 'Mitral E velocity', unit: 'cm/s', ll: 50, mean: 72, ul: 100, direction: 'both', decimalPlaces: 0, subsection: 'Mitral inflow' },
      { key: 'mv_a', label: 'Mitral A velocity', unit: 'cm/s', ll: 35, mean: 55, ul: 80, direction: 'both', decimalPlaces: 0 },
      { key: 'e_a', label: 'E/A ratio', unit: '', ll: 0.8, mean: 1.2, ul: 2.0, direction: 'both', decimalPlaces: 1 },
      { key: 'dt_ms', label: 'Deceleration time', unit: 'ms', ll: 150, mean: 185, ul: 220, direction: 'both', decimalPlaces: 0 },
      { key: 'sept_e', label: 'Septal e\u2032', unit: 'cm/s', ll: 7, mean: 9, ul: 12, direction: 'low', decimalPlaces: 1, subsection: 'Tissue Doppler' },
      { key: 'lat_e', label: 'Lateral e\u2032', unit: 'cm/s', ll: 10, mean: 13, ul: 17, direction: 'low', decimalPlaces: 1 },
      { key: 'avg_e_ep', label: 'Average E/e\u2032', unit: '', ll: 5, mean: 9, ul: 14, direction: 'high', decimalPlaces: 1, interpretations: ['Normal filling pressures', 'Borderline elevated', 'Elevated filling pressure', 'Markedly elevated'], subsection: 'Filling pressures' },
      { key: 'sept_e_ep', label: 'Septal E/e\u2032', unit: '', ll: 5, mean: 10, ul: 15, direction: 'high', decimalPlaces: 1 },
    ],
  },
  {
    title: 'Aortic valve',
    params: [
      { key: 'av_vmax', label: 'Peak velocity', unit: 'm/s', ll: 0.8, mean: 1.4, ul: 2.0, direction: 'high', decimalPlaces: 1, subsection: 'Stenosis' , severityZones: [{ grade: 'mild', threshold: 3.0 }, { grade: 'moderate', threshold: 4.0 }, { grade: 'severe', threshold: 5.0 }]},
      { key: 'av_pk_grad', label: 'Peak gradient', unit: 'mmHg', ll: 3, mean: 10, ul: 20, direction: 'high', decimalPlaces: 0 , severityZones: [{ grade: 'mild', threshold: 40 }, { grade: 'moderate', threshold: 60 }, { grade: 'severe', threshold: 80 }]},
      { key: 'av_mn_grad', label: 'Mean gradient', unit: 'mmHg', ll: 2, mean: 5, ul: 10, direction: 'high', decimalPlaces: 0 , severityZones: [{ grade: 'mild', threshold: 20 }, { grade: 'moderate', threshold: 40 }, { grade: 'severe', threshold: 60 }]},
      { key: 'ava', label: 'Aortic valve area', unit: 'cm\u00B2', ll: 2.0, mean: 3.0, ul: 4.0, direction: 'low', decimalPlaces: 1 , severityZones: [{ grade: 'mild', threshold: 2.0 }, { grade: 'moderate', threshold: 1.5 }, { grade: 'severe', threshold: 1.0 }]},
      { key: 'ar_pht', label: 'AR pressure half-time', unit: 'ms', ll: 500, mean: 650, ul: 800, direction: 'low', decimalPlaces: 0, subsection: 'Regurgitation' , severityZones: [{ grade: 'mild', threshold: 500 }, { grade: 'moderate', threshold: 350 }, { grade: 'severe', threshold: 200 }]},
    ],
  },
  {
    title: 'LV dimensions',
    params: [
      { key: 'lvidd', label: 'LV internal diameter (diastole)', unit: 'mm', ll: 39, mean: 47, ul: 55, direction: 'both', decimalPlaces: 0, subsection: 'M-mode / 2D' },
      { key: 'lvids', label: 'LV internal diameter (systole)', unit: 'mm', ll: 22, mean: 30, ul: 38, direction: 'both', decimalPlaces: 0 },
      { key: 'ivsd', label: 'Interventricular septum (diastole)', unit: 'mm', ll: 6, mean: 9, ul: 12, direction: 'both', decimalPlaces: 0 },
      { key: 'lvpwd', label: 'LV posterior wall (diastole)', unit: 'mm', ll: 6, mean: 9, ul: 12, direction: 'both', decimalPlaces: 0 },
      { key: 'rwt', label: 'Relative wall thickness', unit: '', ll: 0.22, mean: 0.35, ul: 0.42, direction: 'both', decimalPlaces: 2 },
      { key: 'lvedvi', label: 'LV end-diastolic volume index', unit: 'mL/m\u00B2', ll: 34, mean: 54, ul: 74, direction: 'high', decimalPlaces: 0, indexed: true, subsection: 'Volumetric' },
      { key: 'lvesvi', label: 'LV end-systolic volume index', unit: 'mL/m\u00B2', ll: 11, mean: 21, ul: 31, direction: 'high', decimalPlaces: 0, indexed: true },
      { key: 'lvmi', label: 'LV mass index', unit: 'g/m\u00B2', ll: 43, mean: 69, ul: 95, direction: 'high', decimalPlaces: 0, indexed: true },
    ],
  },
  {
    title: 'RV dimensions',
    params: [
      { key: 'rvd1', label: 'RV basal diameter', unit: 'mm', ll: 25, mean: 33, ul: 42, direction: 'high', decimalPlaces: 0 },
      { key: 'rvd2', label: 'RV mid diameter', unit: 'mm', ll: 19, mean: 27, ul: 35, direction: 'high', decimalPlaces: 0 },
      { key: 'rvd3', label: 'RV longitudinal diameter', unit: 'mm', ll: 59, mean: 72, ul: 86, direction: 'high', decimalPlaces: 0 },
      { key: 'rvot2', label: 'RVOT proximal diameter', unit: 'mm', ll: 20, mean: 27, ul: 33, direction: 'high', decimalPlaces: 0 },
    ],
  },
  {
    title: 'Atrial dimensions',
    params: [
      { key: 'la_diam', label: 'LA diameter', unit: 'mm', ll: 27, mean: 34, ul: 40, direction: 'high', decimalPlaces: 0, subsection: 'Left atrium' },
      { key: 'la_vol', label: 'LA volume', unit: 'mL', ll: 22, mean: 42, ul: 62, direction: 'high', decimalPlaces: 0 },
      { key: 'la_voli', label: 'LA volume index', unit: 'mL/m\u00B2', ll: 16, mean: 25, ul: 34, direction: 'high', decimalPlaces: 0, indexed: true },
      { key: 'ra_area', label: 'RA area', unit: 'cm\u00B2', ll: 10, mean: 14, ul: 18, direction: 'high', decimalPlaces: 0, subsection: 'Right atrium' },
      { key: 'ra_areai', label: 'RA area index', unit: 'cm\u00B2/m\u00B2', ll: 5, mean: 8, ul: 10, direction: 'high', decimalPlaces: 1, indexed: true },
    ],
  },
  {
    title: 'Aortic dimensions',
    params: [
      { key: 'ao_ann', label: 'Aortic annulus', unit: 'mm', ll: 18, mean: 23, ul: 26, direction: 'high', decimalPlaces: 0 },
      { key: 'ao_sinus', label: 'Sinus of Valsalva', unit: 'mm', ll: 29, mean: 34, ul: 40, direction: 'high', decimalPlaces: 0 },
      { key: 'stj_mm', label: 'Sinotubular junction', unit: 'mm', ll: 22, mean: 27, ul: 32, direction: 'high', decimalPlaces: 0 },
      { key: 'asc_ao_prox', label: 'Ascending aorta (proximal)', unit: 'mm', ll: 22, mean: 30, ul: 37, direction: 'high', decimalPlaces: 0 },
      { key: 'asc_ao_mid', label: 'Ascending aorta (mid)', unit: 'mm', ll: 22, mean: 30, ul: 37, direction: 'high', decimalPlaces: 0 },
      { key: 'ao_arch', label: 'Aortic arch', unit: 'mm', ll: 20, mean: 26, ul: 33, direction: 'high', decimalPlaces: 0 },
    ],
  },
  {
    title: 'LVOT and flow',
    params: [
      { key: 'lvot_diam', label: 'LVOT diameter', unit: 'mm', ll: 18, mean: 20, ul: 22, direction: 'both', decimalPlaces: 0 },
      { key: 'lvot_vel', label: 'LVOT velocity', unit: 'm/s', ll: 0.7, mean: 0.9, ul: 1.1, direction: 'both', decimalPlaces: 1 },
      { key: 'lvot_vti', label: 'LVOT velocity-time integral', unit: 'cm', ll: 18, mean: 22, ul: 26, direction: 'both', decimalPlaces: 0 },
      { key: 'dvi', label: 'Dimensionless velocity index', unit: '', ll: 0.35, mean: 0.50, ul: 0.60, direction: 'both', decimalPlaces: 2 },
      { key: 'av_vti', label: 'AV velocity-time integral', unit: 'cm', ll: 18, mean: 22, ul: 30, direction: 'both', decimalPlaces: 0 },
    ],
  },
]

// ---------------------------------------------------------------------------
// Text field group definitions for info cards
// ---------------------------------------------------------------------------

type TextFieldDef = { key: string; label: string; type: 'text' | 'textarea' | 'checkbox' | 'date' }

type TextFieldGroup = { title: string; fields: TextFieldDef[] }

const TEXT_FIELD_GROUPS: TextFieldGroup[] = [
  {
    title: 'Study context',
    fields: [
      { key: 'study_date', label: 'Study date', type: 'date' },
      { key: 'report_date', label: 'Report date', type: 'date' },
      { key: 'consultant', label: 'Consultant', type: 'text' },
      { key: 'ward_op', label: 'Ward / outpatient', type: 'text' },
      { key: 'study_reason', label: 'Indication', type: 'text' },
      { key: 'rhythm', label: 'Rhythm', type: 'text' },
      { key: 'hr', label: 'Heart rate (bpm)', type: 'text' },
      { key: 'bp_text', label: 'Blood pressure', type: 'text' },
      { key: 'image_quality', label: 'Image quality', type: 'text' },
      { key: 'height', label: 'Height (cm)', type: 'text' },
      { key: 'weight', label: 'Weight (kg)', type: 'text' },
      { key: 'bsa', label: 'BSA (m\u00B2)', type: 'text' },
      { key: 'reported_by', label: 'Reported by', type: 'text' },
    ],
  },
  {
    title: 'Chamber size and function',
    fields: [
      { key: 'lv_size', label: 'LV size', type: 'text' },
      { key: 'lv_wall', label: 'LV wall thickness', type: 'text' },
      { key: 'lv_fn', label: 'LV systolic function', type: 'text' },
      { key: 'diast_fn', label: 'Diastolic function', type: 'text' },
      { key: 'fill_press', label: 'Filling pressure', type: 'text' },
      { key: 'rv_size', label: 'RV size', type: 'text' },
      { key: 'rv_fn', label: 'RV systolic function', type: 'text' },
      { key: 'la_size', label: 'LA size', type: 'text' },
      { key: 'ra_size', label: 'RA size', type: 'text' },
    ],
  },
  {
    title: 'IVC and right atrial pressure',
    fields: [
      { key: 'ivc_size', label: 'IVC diameter', type: 'text' },
      { key: 'ivc_coll', label: 'IVC collapsibility', type: 'text' },
      { key: 'ph_prob', label: 'PH probability', type: 'text' },
    ],
  },
  {
    title: 'Structural findings',
    fields: [
      { key: 'lvh', label: 'LV hypertrophy', type: 'checkbox' },
      { key: 'rwma', label: 'Regional wall motion abnormality', type: 'checkbox' },
      { key: 'sept_flat', label: 'Septal flattening', type: 'checkbox' },
      { key: 'sept_bounce', label: 'Septal bounce', type: 'checkbox' },
      { key: 'd_shaped_lv', label: 'D-shaped LV', type: 'checkbox' },
      { key: 'pa_dilated', label: 'Pulmonary artery dilated', type: 'checkbox' },
      { key: 'peric_eff', label: 'Pericardial effusion', type: 'checkbox' },
      { key: 'ias_intact', label: 'Interatrial septum intact', type: 'checkbox' },
      { key: 'shunt', label: 'Intracardiac shunt', type: 'checkbox' },
    ],
  },
  {
    title: 'Valve assessment',
    fields: [
      { key: 'av_desc', label: 'Aortic valve morphology', type: 'text' },
      { key: 'as_grade', label: 'Aortic stenosis', type: 'text' },
      { key: 'ar_grade', label: 'Aortic regurgitation', type: 'text' },
      { key: 'mv_desc', label: 'Mitral valve morphology', type: 'text' },
      { key: 'ms_grade', label: 'Mitral stenosis', type: 'text' },
      { key: 'mr_grade', label: 'Mitral regurgitation', type: 'text' },
      { key: 'tv_desc', label: 'Tricuspid valve morphology', type: 'text' },
      { key: 'ts_grade', label: 'Tricuspid stenosis', type: 'text' },
      { key: 'tr_grade', label: 'Tricuspid regurgitation', type: 'text' },
      { key: 'pv_desc', label: 'Pulmonary valve morphology', type: 'text' },
      { key: 'ps_grade', label: 'Pulmonary stenosis', type: 'text' },
      { key: 'pr_grade', label: 'Pulmonary regurgitation', type: 'text' },
    ],
  },
  {
    title: 'Aorta',
    fields: [
      { key: 'ao_root_desc', label: 'Aortic root', type: 'text' },
      { key: 'asc_ao_desc', label: 'Ascending aorta', type: 'text' },
    ],
  },
  {
    title: 'Classification',
    fields: [
      { key: 'case_type', label: 'Case type', type: 'text' },
      { key: 'primary_dx', label: 'Primary diagnosis', type: 'text' },
      { key: 'secondary_path', label: 'Secondary pathology', type: 'text' },
    ],
  },
]

// Read-only text field groups — clinically organized, sentence case
// Options for right-click pill selection
const SEVERITY_OPTIONS: PillOption[] = [
  { value: 'None' }, { value: 'Trivial' }, { value: 'Trace' }, { value: 'Mild' },
  { value: 'Mild to moderate' }, { value: 'Moderate' }, { value: 'Moderate to severe' }, { value: 'Severe' },
]
const CHAMBER_SIZE_OPTIONS: PillOption[] = [
  { value: 'Normal' }, { value: 'Small' }, { value: 'Mildly dilated' }, { value: 'Moderately dilated' }, { value: 'Severely dilated' },
]
const FUNCTION_OPTIONS: PillOption[] = [
  { value: 'Normal' }, { value: 'Preserved' }, { value: 'Borderline low normal' },
  { value: 'Mildly impaired' }, { value: 'Moderately impaired' }, { value: 'Severely impaired' },
]
const MORPH_OPTIONS: PillOption[] = [
  { value: 'Normal' }, { value: 'Mildly thickened' }, { value: 'Thickened' }, { value: 'Calcified' },
  { value: 'Prolapse' }, { value: 'Restricted' }, { value: 'Prosthetic' },
]
const PH_PROB_OPTIONS: PillOption[] = [
  { value: 'Low' }, { value: 'Intermediate' }, { value: 'High' },
]
// Closed set — prompt line 33: "must use one of these broad families only"
const CASE_TYPE_OPTIONS: PillOption[] = [
  { value: 'Normal' },
  { value: 'Valve' },
  { value: 'Heart failure / cardiomyopathy' },
  { value: 'Ischaemic' },
  { value: 'Arrhythmia / EP' },
  { value: 'Pulmonary hypertension / right heart' },
  { value: 'Pericardial' },
  { value: 'Aortic' },
  { value: 'Congenital' },
  { value: 'Mass / thrombus / infective' },
  { value: 'Post-operative / prosthetic / device' },
  { value: 'Other' },
]
const FILL_PRESS_OPTIONS: PillOption[] = [
  { value: 'Normal' }, { value: 'Elevated' }, { value: 'Indeterminate' },
]
const DIAST_FN_OPTIONS: PillOption[] = [
  { value: 'Normal' }, { value: 'Grade I' }, { value: 'Grade II' }, { value: 'Grade III' }, { value: 'Indeterminate' },
]
const WALL_OPTIONS: PillOption[] = [
  { value: 'Normal' }, { value: 'Concentric remodelling' }, { value: 'Mild concentric hypertrophy' },
  { value: 'Moderate concentric hypertrophy' }, { value: 'Severe concentric hypertrophy' },
  { value: 'Asymmetric hypertrophy' },
]

const IVC_SIZE_OPTIONS: PillOption[] = [
  { value: 'Normal' }, { value: 'Small' }, { value: 'Dilated' }, { value: '<2.1 cm' }, { value: '>2.1 cm' },
]
const IVC_COLL_OPTIONS: PillOption[] = [
  { value: '>50%' }, { value: '<50%' }, { value: 'Normal' }, { value: 'Plethoric' },
]
const AORTA_DESC_OPTIONS: PillOption[] = [
  { value: 'Normal' }, { value: 'Mildly dilated' }, { value: 'Moderately dilated' }, { value: 'Severely dilated' }, { value: 'Aneurysmal' },
]
// Prompt line 34: "Prefer labels such as..." — these exact examples + free text
const PRIMARY_DX_OPTIONS: PillOption[] = [
  { value: 'Normal echo' },
  { value: 'Severe AS' },
  { value: 'Moderate MR' },
  { value: 'HFrEF' },
  { value: 'LV diastolic dysfunction' },
  { value: 'Prior MI with RWMA' },
  { value: 'Pulmonary hypertension' },
  { value: 'Pericardial effusion' },
  { value: 'Ascending aortic dilatation' },
  { value: 'ASD' },
  { value: 'Prosthetic valve assessment' },
]
// Prompt lines 35-36: "at most one additional major co-label" — same pool + free text
const SECONDARY_PATH_OPTIONS: PillOption[] = [
  { value: 'Severe AS' },
  { value: 'Moderate MR' },
  { value: 'Moderate TR' },
  { value: 'HFrEF' },
  { value: 'LV diastolic dysfunction' },
  { value: 'Prior MI with RWMA' },
  { value: 'Pulmonary hypertension' },
  { value: 'Pericardial effusion' },
  { value: 'Ascending aortic dilatation' },
  { value: 'ASD' },
  { value: 'Prosthetic valve assessment' },
]

const FIELD_OPTIONS: Record<string, PillOption[]> = {
  lv_size: CHAMBER_SIZE_OPTIONS,
  lv_wall: WALL_OPTIONS,
  lv_fn: FUNCTION_OPTIONS,
  diast_fn: DIAST_FN_OPTIONS,
  fill_press: FILL_PRESS_OPTIONS,
  rv_size: CHAMBER_SIZE_OPTIONS,
  rv_fn: FUNCTION_OPTIONS,
  la_size: CHAMBER_SIZE_OPTIONS,
  ra_size: CHAMBER_SIZE_OPTIONS,
  ph_prob: PH_PROB_OPTIONS,
  ivc_size: IVC_SIZE_OPTIONS,
  ivc_coll: IVC_COLL_OPTIONS,
  av_desc: MORPH_OPTIONS,
  as_grade: SEVERITY_OPTIONS,
  ar_grade: SEVERITY_OPTIONS,
  mv_desc: MORPH_OPTIONS,
  ms_grade: SEVERITY_OPTIONS,
  mr_grade: SEVERITY_OPTIONS,
  tv_desc: MORPH_OPTIONS,
  ts_grade: SEVERITY_OPTIONS,
  tr_grade: SEVERITY_OPTIONS,
  pv_desc: MORPH_OPTIONS,
  ps_grade: SEVERITY_OPTIONS,
  pr_grade: SEVERITY_OPTIONS,
  ao_root_desc: AORTA_DESC_OPTIONS,
  asc_ao_desc: AORTA_DESC_OPTIONS,
  case_type: CASE_TYPE_OPTIONS,
  primary_dx: PRIMARY_DX_OPTIONS,
  secondary_path: SECONDARY_PATH_OPTIONS,
}

// Fields that allow free-text input in addition to predefined options
const FREE_TEXT_FIELDS = new Set(['primary_dx', 'secondary_path', 'ao_root_desc', 'asc_ao_desc', 'ivc_size', 'ivc_coll'])

const TEXT_FIELD_GROUPS_READONLY: TextFieldGroup[] = [
  {
    title: 'Chamber size and function',
    fields: [
      { key: 'lv_size', label: 'LV size', type: 'text' },
      { key: 'lv_wall', label: 'LV wall thickness', type: 'text' },
      { key: 'lv_fn', label: 'LV systolic function', type: 'text' },
      { key: 'diast_fn', label: 'Diastolic function', type: 'text' },
      { key: 'fill_press', label: 'Filling pressure', type: 'text' },
      { key: 'rv_size', label: 'RV size', type: 'text' },
      { key: 'rv_fn', label: 'RV systolic function', type: 'text' },
      { key: 'la_size', label: 'LA size', type: 'text' },
      { key: 'ra_size', label: 'RA size', type: 'text' },
    ],
  },
  {
    title: 'IVC and right atrial pressure',
    fields: [
      { key: 'ivc_size', label: 'IVC diameter', type: 'text' },
      { key: 'ivc_coll', label: 'IVC collapsibility', type: 'text' },
      { key: 'ph_prob', label: 'PH probability', type: 'text' },
    ],
  },
  {
    title: 'Structural findings',
    fields: [
      { key: 'lvh', label: 'LV hypertrophy', type: 'checkbox' },
      { key: 'rwma', label: 'Regional wall motion abnormality', type: 'checkbox' },
      { key: 'sept_flat', label: 'Septal flattening', type: 'checkbox' },
      { key: 'sept_bounce', label: 'Septal bounce', type: 'checkbox' },
      { key: 'd_shaped_lv', label: 'D-shaped LV', type: 'checkbox' },
      { key: 'pa_dilated', label: 'Pulmonary artery dilated', type: 'checkbox' },
      { key: 'peric_eff', label: 'Pericardial effusion', type: 'checkbox' },
      { key: 'ias_intact', label: 'Interatrial septum intact', type: 'checkbox' },
      { key: 'shunt', label: 'Intracardiac shunt', type: 'checkbox' },
    ],
  },
  {
    title: 'Valve assessment',
    fields: [
      { key: 'av_desc', label: 'Aortic valve morphology', type: 'text' },
      { key: 'as_grade', label: 'Aortic stenosis', type: 'text' },
      { key: 'ar_grade', label: 'Aortic regurgitation', type: 'text' },
      { key: 'mv_desc', label: 'Mitral valve morphology', type: 'text' },
      { key: 'ms_grade', label: 'Mitral stenosis', type: 'text' },
      { key: 'mr_grade', label: 'Mitral regurgitation', type: 'text' },
      { key: 'tv_desc', label: 'Tricuspid valve morphology', type: 'text' },
      { key: 'ts_grade', label: 'Tricuspid stenosis', type: 'text' },
      { key: 'tr_grade', label: 'Tricuspid regurgitation', type: 'text' },
      { key: 'pv_desc', label: 'Pulmonary valve morphology', type: 'text' },
      { key: 'ps_grade', label: 'Pulmonary stenosis', type: 'text' },
      { key: 'pr_grade', label: 'Pulmonary regurgitation', type: 'text' },
    ],
  },
  {
    title: 'Aorta',
    fields: [
      { key: 'ao_root_desc', label: 'Aortic root', type: 'text' },
      { key: 'asc_ao_desc', label: 'Ascending aorta', type: 'text' },
    ],
  },
  {
    title: 'Classification',
    fields: [
      { key: 'case_type', label: 'Case type', type: 'text' },
      { key: 'primary_dx', label: 'Primary diagnosis', type: 'text' },
      { key: 'secondary_path', label: 'Secondary pathology', type: 'text' },
    ],
  },
]

// ---------------------------------------------------------------------------
// Info card components (read-only and editable)
// ---------------------------------------------------------------------------

const CASE_TYPE_SHORT: Record<string, string> = {
  'Pulmonary hypertension / right heart': 'PH / right heart',
  'Heart failure / cardiomyopathy': 'HF / CMP',
  'Post-operative / prosthetic / device': 'Post-op / device',
  'Mass / thrombus / infective': 'Mass / thrombus',
  'Arrhythmia / EP': 'Arrhythmia',
}

function shortCaseType(raw: string): string {
  return CASE_TYPE_SHORT[raw] ?? raw
}

function InfoCardInline({
  title,
  fields,
  data,
  onFieldChange,
}: {
  title: string
  fields: TextFieldDef[]
  data: Record<string, unknown>
  onFieldChange: (key: string, value: unknown) => void
}) {
  // Show all fields (not just populated ones) so user can set values
  const allFields = fields

  return (
    <div className="rounded-lg border border-[hsl(var(--stroke-soft)/0.72)] bg-[hsl(var(--card))]">
      <div className="border-b border-[hsl(var(--stroke-soft)/0.5)] bg-[hsl(var(--tone-neutral-50))] px-4 py-2">
        <h4 className="text-sm font-semibold tracking-tight text-[hsl(var(--foreground))]">{title}</h4>
      </div>
      <div className="px-4 py-3">
        {fields.some((f) => f.type === 'textarea') ? (
          <div className="space-y-3">
            {allFields.map((f) => (
              <div key={f.key}>
                <span className="text-xs font-medium text-[hsl(var(--muted-foreground))]">{f.label}</span>
                <div className="mt-1 whitespace-pre-wrap text-sm text-[hsl(var(--foreground))]">
                  {String(data[f.key] ?? '')}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="flex flex-wrap gap-2">
            {allFields.map((f) => {
              const val = data[f.key]
              if (f.type === 'checkbox') {
                const checked = val === 1 || val === true
                return (
                  <button
                    key={f.key}
                    type="button"
                    onClick={() => onFieldChange(f.key, checked ? 0 : 1)}
                    className={cn(
                      'inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-semibold ring-1 ring-inset cursor-pointer transition-all',
                      checked
                        ? 'bg-[hsl(162_22%_90%)] text-[hsl(164_30%_28%)] ring-[hsl(163_22%_80%)]'
                        : 'bg-white text-[hsl(var(--tone-neutral-400))] ring-[hsl(var(--tone-neutral-200))] opacity-50 hover:opacity-80',
                    )}
                  >
                    {checked && <svg className="h-2.5 w-2.5" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M2 5l2.5 2.5L8 3" /></svg>}
                    {f.label}
                  </button>
                )
              }
              const strVal = String(val ?? '')
              const options = FIELD_OPTIONS[f.key]
              if (options) {
                return (
                  <EditablePill
                    key={f.key}
                    label={f.label}
                    value={strVal}
                    options={options}
                    onChange={(v) => onFieldChange(f.key, v)}
                    allowFreeText={FREE_TEXT_FIELDS.has(f.key)}
                  />
                )
              }
              // Fallback: static pill for any unmapped fields
              const pStyle = pillStyle(strVal)
              return (
                <span key={f.key} className="inline-flex items-center gap-1.5 rounded-full ring-1 ring-inset pl-2.5 pr-3 py-1 text-[11px]">
                  <span className="font-medium text-[hsl(var(--muted-foreground))]">{f.label}</span>
                  <span className={cn('rounded-full px-2 py-0.5 font-semibold ring-1 ring-inset', pStyle)}>
                    {strVal || 'N/A'}
                  </span>
                </span>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}

function InfoCardEditable({
  title,
  fields,
  data,
  onFieldChange,
}: {
  title: string
  fields: TextFieldDef[]
  data: Record<string, unknown>
  onFieldChange: (key: string, value: unknown) => void
}) {
  return (
    <div className="rounded-lg border border-[hsl(var(--stroke-soft)/0.72)] bg-[hsl(var(--card))]">
      <div className="border-b border-[hsl(var(--stroke-soft)/0.5)] bg-[hsl(var(--tone-neutral-50))] px-4 py-2">
        <h4 className="text-sm font-semibold tracking-tight text-[hsl(var(--muted-foreground))]">{title}</h4>
      </div>
      <div className="px-4 py-3">
        {fields.some((f) => f.type === 'textarea') ? (
          <div className="space-y-3">
            {fields.map((f) => (
              <div key={f.key}>
                <label className="block text-xs font-medium text-[hsl(var(--muted-foreground))] mb-1.5">{f.label}</label>
                <textarea
                  value={String(data[f.key] ?? '')}
                  onChange={(e) => onFieldChange(f.key, e.target.value)}
                  rows={3}
                  className="house-input w-full text-sm resize-y"
                />
              </div>
            ))}
          </div>
        ) : fields.some((f) => f.type === 'checkbox') ? (
          <div className="grid gap-x-6 gap-y-2 sm:grid-cols-2 lg:grid-cols-3">
            {fields.map((f) => (
              <div key={f.key} className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={(data[f.key] as number | null) === 1}
                  onChange={(e) => onFieldChange(f.key, e.target.checked ? 1 : 0)}
                  className="h-4 w-4 rounded border-[hsl(var(--border))] text-[hsl(var(--tone-accent-600))]"
                />
                <label className="text-sm text-[hsl(var(--foreground))]">{f.label}</label>
              </div>
            ))}
          </div>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {fields.map((f) => (
              <div key={f.key}>
                <label className="block text-xs font-medium text-[hsl(var(--muted-foreground))] mb-1.5">{f.label}</label>
                <input
                  type={f.type === 'date' ? 'date' : 'text'}
                  value={f.type === 'date' ? toDateInputValue(String(data[f.key] ?? '')) : String(data[f.key] ?? '')}
                  onChange={(e) => onFieldChange(f.key, e.target.value)}
                  className="house-input w-full text-sm"
                />
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Echo record detail (editable: parameter table + info cards)
// ---------------------------------------------------------------------------

function EchoRecordDetail({
  record,
  hn,
  isNew,
  onSaved,
  onCancel,
}: {
  record: Partial<EchoRecord>
  hn: string
  isNew: boolean
  onSaved: () => void
  onCancel: () => void
}) {
  const [form, setForm] = useState<Record<string, unknown>>({ ...EMPTY_ECHO, hn, ...record })
  const [saving, setSaving] = useState(false)

  const handleValueChange = useCallback((key: string, value: number | null) => {
    setForm((prev) => ({ ...prev, [key]: value }))
  }, [])

  const handleFieldChange = useCallback((key: string, value: unknown) => {
    setForm((prev) => ({ ...prev, [key]: value }))
  }, [])

  const handleSave = async () => {
    setSaving(true)
    try {
      if (isNew) {
        await createRecord('echo', form)
      } else {
        await updateRecord('echo', record.id!, form)
      }
      onSaved()
    } catch {
      // keep form on failure
    } finally {
      setSaving(false)
    }
  }

  const textFieldCards = (
    <div className="space-y-3">
      {TEXT_FIELD_GROUPS.map((group) => (
        <InfoCardEditable
          key={group.title}
          title={group.title}
          fields={group.fields}
          data={form}
          onFieldChange={handleFieldChange}
        />
      ))}
    </div>
  )

  return (
    <div className="space-y-4 py-4">
      {isNew && textFieldCards}

      {/* Parameter table */}
      <ParameterTable
        sections={ECHO_SECTIONS}
        data={form}
        editable
        onValueChange={handleValueChange}
      />

      {/* Text field info cards (editable) */}
      {!isNew && textFieldCards}

      {/* AI / read-only fields */}
      <div className="rounded-lg border border-[hsl(var(--stroke-soft)/0.72)] bg-[hsl(var(--card))]">
        <div className="border-b border-[hsl(var(--stroke-soft)/0.5)] bg-[hsl(var(--tone-neutral-50))] px-4 py-2">
          <h4 className="text-sm font-semibold tracking-tight text-[hsl(var(--muted-foreground))]">AI & Source Data</h4>
        </div>
        <div className="space-y-3 px-4 py-3">
          {[
            { key: 'meas_table', label: 'Measurements Table' },
            { key: 'uncertain', label: 'Uncertain' },
            { key: 'ai_warnings', label: 'AI Warnings' },
            { key: 'ai_conf', label: 'AI Confidence' },
            { key: 'ai_raw_text', label: 'AI Raw Text' },
          ].map(({ key, label }) => (
            <div key={key}>
              <label className="block text-xs font-medium text-[hsl(var(--muted-foreground))] mb-1.5">{label}</label>
              <textarea
                value={String(form[key] ?? '')}
                readOnly
                rows={3}
                className="house-input w-full text-sm resize-y bg-[hsl(var(--tone-neutral-50))] cursor-not-allowed"
              />
            </div>
          ))}
        </div>
      </div>

      {/* Actions */}
      <div className="flex items-center gap-3 pt-2">
        <button
          type="button"
          onClick={() => void handleSave()}
          disabled={saving}
          className="inline-flex items-center gap-1.5 rounded-md bg-[hsl(var(--tone-positive-500))] px-4 py-2 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-[hsl(var(--tone-positive-600))] disabled:opacity-50"
        >
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
          {isNew ? 'Create' : 'Save'}
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="inline-flex items-center gap-1.5 rounded-md border border-[hsl(var(--border))] bg-[hsl(var(--background))] px-4 py-2 text-sm font-medium text-[hsl(var(--foreground))] shadow-sm transition-colors hover:bg-[hsl(var(--tone-neutral-50))]"
        >
          <X className="h-4 w-4" />
          Cancel
        </button>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Demographics builder (matches RHC pattern)
// ---------------------------------------------------------------------------

function buildDemographics(record: EchoRecord, patient: Record<string, unknown> | null): DemographicPill[] {
  const pills: DemographicPill[] = []
  // Gender from patient
  if (patient?.gender) pills.push({ label: String(patient.gender) })
  // Age from patient DOB + study date
  if (patient?.dob && record.study_date) {
    const dob = new Date(String(patient.dob))
    const study = new Date(record.study_date)
    if (!isNaN(dob.getTime()) && !isNaN(study.getTime())) {
      const age = Math.floor((study.getTime() - dob.getTime()) / (365.25 * 24 * 60 * 60 * 1000))
      if (age > 0 && age < 150) pills.push({ label: `${age} years` })
    }
  }
  // BMI (height, weight)
  if (record.height && record.weight) {
    const hCm = Math.round(Number(record.height))
    const wKg = Math.round(Number(record.weight))
    const hM = Number(record.height) / 100
    if (hM > 0 && wKg > 0) {
      const bmi = (wKg / (hM * hM)).toFixed(0)
      pills.push({ label: `BMI ${bmi} (${hCm} cm, ${wKg} kg)` })
    }
  } else if (record.height) {
    pills.push({ label: `${Math.round(Number(record.height))} cm` })
  } else if (record.weight) {
    pills.push({ label: `${Math.round(Number(record.weight))} kg` })
  }
  return pills
}

// ---------------------------------------------------------------------------
// Toggle box (collapsed by default — matches RHC pattern)
// ---------------------------------------------------------------------------

function ToggleBox({ label, defaultOpen = false, children }: { label: string; defaultOpen?: boolean; children: React.ReactNode }) {
  const [open, setOpen] = useState(defaultOpen)
  return (
    <div className="rounded-lg border border-[hsl(var(--stroke-soft)/0.72)] overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="flex w-full items-center gap-2 px-3.5 py-2.5 text-left text-sm font-medium text-[hsl(var(--foreground))] bg-[hsl(var(--tone-neutral-50))] hover:bg-[hsl(var(--tone-neutral-100))] transition-colors"
      >
        <svg
          className={cn('h-3.5 w-3.5 shrink-0 text-[hsl(var(--muted-foreground))] transition-transform duration-150', open && 'rotate-90')}
          viewBox="0 0 16 16"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M6 4l4 4-4 4" />
        </svg>
        {label}
      </button>
      {open && <div className="px-3.5 py-3 border-t border-[hsl(var(--stroke-soft)/0.5)]">{children}</div>}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Read-only view (parameter table + info cards + toggle boxes)
// ---------------------------------------------------------------------------

function EchoRecordReadOnly({ record, patient, onFieldUpdated }: { record: EchoRecord; patient: Record<string, unknown> | null; onFieldUpdated?: (key: string, value: unknown) => void }) {
  const [data, setData] = useState<Record<string, unknown>>(record as unknown as Record<string, unknown>)
  const saveTimer = useRef<ReturnType<typeof setTimeout>>()
  const demographics = buildDemographics(record, patient)

  // Auto-save on data changes (debounced) - silent save, no list reload
  const handleFieldChange = useCallback((key: string, value: unknown) => {
    setData((prev) => ({ ...prev, [key]: value }))
    onFieldUpdated?.(key, value)
    if (saveTimer.current) clearTimeout(saveTimer.current)
    saveTimer.current = setTimeout(() => {
      void updateRecord('echo', record.id, { [key]: value })
    }, 600)
  }, [record.id, onFieldUpdated])

  const handleValueChange = useCallback((key: string, value: number | null) => {
    handleFieldChange(key, value !== null ? String(value) : '')
  }, [handleFieldChange])

  return (
    <div className="space-y-4 py-4">
      {/* Demographics pills + PH probability pill (right-aligned) */}
      <div className="flex flex-wrap items-center gap-2">
        {demographics.map((d) => (
          <span
            key={d.label}
            className="inline-flex items-center rounded-full border border-[hsl(var(--tone-neutral-300))] bg-white px-3 py-1 text-[0.8rem] font-medium text-[hsl(var(--foreground))]"
          >
            {d.label}
          </span>
        ))}
      </div>

      {/* Conclusions — numbered list at the top */}
      {Boolean(data.conc_items) && (() => {
        let items: string[] = []
        try {
          const parsed = JSON.parse(String(data.conc_items))
          if (Array.isArray(parsed)) items = parsed.filter((s: string) => s && s.trim())
        } catch {
          const raw = String(data.conc_items).trim()
          if (raw) items = raw.split('\n').filter((s) => s.trim())
        }
        if (items.length === 0) return null
        return (
          <div className="rounded-2xl border border-[hsl(var(--stroke-soft)/0.72)] bg-[hsl(var(--card))] overflow-hidden">
            <div className="border-b border-[hsl(var(--stroke-soft)/0.5)] bg-[hsl(var(--tone-neutral-50))] px-5 py-2.5">
              <h3 className="text-sm font-semibold tracking-tight text-[hsl(var(--foreground))]">Conclusions</h3>
            </div>
            <ol className="divide-y divide-[hsl(var(--stroke-soft)/0.3)]">
              {items.map((item, i) => (
                <li key={i} className="flex gap-3.5 px-5 py-3">
                  <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[hsl(var(--tone-danger-100))] text-[11px] font-bold text-[hsl(var(--tone-danger-700))]">
                    {i + 1}
                  </span>
                  <span className="text-sm leading-relaxed text-[hsl(var(--foreground))]">{item}</span>
                </li>
              ))}
            </ol>
          </div>
        )
      })()}

      {/* Parameter table (inline editable) */}
      <ParameterTable
        sections={ECHO_SECTIONS}
        data={data}
        editable
        onValueChange={handleValueChange}
      />

      {/* Info cards (inline editable pills) */}
      <div className="space-y-3">
        {TEXT_FIELD_GROUPS_READONLY.map((group) => (
          <InfoCardInline
            key={group.title}
            title={group.title}
            fields={group.fields}
            data={data}
            onFieldChange={handleFieldChange}
          />
        ))}
      </div>

      {/* Conclusions toggle box */}
      {(['conclusion', 'conc_items', 'narrative'] as const).some(
        (k) => data[k] && String(data[k]).trim(),
      ) && (
        <ToggleBox label="Conclusions" defaultOpen={false}>
          <div className="space-y-3">
            {[
              { key: 'conclusion', label: 'Conclusion' },
              { key: 'conc_items', label: 'Conclusion Items' },
              { key: 'narrative', label: 'Narrative' },
            ]
              .filter(({ key }) => data[key] && String(data[key]).trim())
              .map(({ key, label }) => (
                <div key={key}>
                  <span className="text-xs font-medium text-[hsl(var(--muted-foreground))]">{label}</span>
                  <div className="mt-1 rounded-md border border-[hsl(var(--stroke-soft)/0.72)] bg-[hsl(var(--tone-neutral-50))] px-3 py-2 text-sm whitespace-pre-wrap">
                    {String(data[key])}
                  </div>
                </div>
              ))}
          </div>
        </ToggleBox>
      )}

      {/* Study context — editable */}
      <ToggleBox label="Study context" defaultOpen={false}>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {[
            { key: 'study_date', label: 'Study date', type: 'date' },
            { key: 'report_date', label: 'Report date', type: 'date' },
            { key: 'consultant', label: 'Consultant' },
            { key: 'ward_op', label: 'Ward / outpatient' },
            { key: 'study_reason', label: 'Indication' },
            { key: 'rhythm', label: 'Rhythm' },
            { key: 'hr', label: 'Heart rate (bpm)' },
            { key: 'bp_text', label: 'Blood pressure' },
            { key: 'image_quality', label: 'Image quality' },
            { key: 'height', label: 'Height (cm)' },
            { key: 'weight', label: 'Weight (kg)' },
            { key: 'bsa', label: 'BSA (m\u00B2)' },
            { key: 'reported_by', label: 'Reported by' },
          ].map((f) => (
            <div key={f.key}>
              <label className="block text-xs font-medium text-[hsl(var(--muted-foreground))] mb-1.5">{f.label}</label>
              <input
                type={f.type === 'date' ? 'date' : 'text'}
                value={f.type === 'date' ? toDateInputValue(String(data[f.key] ?? '')) : String(data[f.key] ?? '')}
                onChange={(e) => handleFieldChange(f.key, e.target.value)}
                className="house-input rounded-lg w-full text-xs py-1.5 px-2.5"
              />
            </div>
          ))}
        </div>
      </ToggleBox>

      {/* AI extraction data toggle box */}
      {(['ai_warnings', 'ai_conf', 'ai_raw_text', 'uncertain', 'meas_table'] as const).some(
        (k) => data[k] && String(data[k]).trim(),
      ) && (
        <ToggleBox label="AI extraction data" defaultOpen={false}>
          <div className="space-y-3">
            {[
              { key: 'ai_warnings', label: 'AI Warnings' },
              { key: 'ai_conf', label: 'AI Confidence' },
              { key: 'uncertain', label: 'Uncertain' },
              { key: 'meas_table', label: 'Measurements Table' },
              { key: 'ai_raw_text', label: 'AI Raw Text' },
            ]
              .filter(({ key }) => data[key] && String(data[key]).trim())
              .map(({ key, label }) => (
                <div key={key}>
                  <span className="text-xs font-medium text-[hsl(var(--muted-foreground))]">{label}</span>
                  <div className="mt-1 rounded-md border border-[hsl(var(--stroke-soft)/0.72)] bg-[hsl(var(--tone-neutral-50))] px-3 py-2 text-sm whitespace-pre-wrap max-h-40 overflow-y-auto">
                    {String(data[key])}
                  </div>
                </div>
              ))}
          </div>
        </ToggleBox>
      )}

      {/* Source toggle box */}
      {(['source_file', 'reported_by'] as const).some(
        (k) => data[k] && String(data[k]).trim(),
      ) && (
        <ToggleBox label="Source" defaultOpen={false}>
          <div className="grid gap-x-6 gap-y-1.5 sm:grid-cols-2">
            {[
              { key: 'source_file', label: 'Source File' },
              { key: 'reported_by', label: 'Reported By' },
            ]
              .filter(({ key }) => data[key] && String(data[key]).trim())
              .map(({ key, label }) => (
                <div key={key} className="flex items-baseline gap-2 text-sm">
                  <span className="shrink-0 text-xs font-medium text-[hsl(var(--muted-foreground))]">{label}:</span>
                  <span className="truncate text-[hsl(var(--foreground))]">{String(data[key] ?? '\u2014')}</span>
                </div>
              ))}
          </div>
        </ToggleBox>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export default function ExtractPatientEcho() {
  const { patient, reload: reloadPatient } = usePatientContext()
  const hn = patient?.hn ?? ''

  const [records, setRecords] = useState<EchoRecord[]>([])
  const [loading, setLoading] = useState(true)
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [isCreating, setIsCreating] = useState(false)
  const [editRecord, setEditRecord] = useState<Partial<EchoRecord> | null>(null)
  const [editMode, setEditMode] = useState(false)
  const { openMenu, MenuPortal } = useRecordContextMenu()

  const loadRecords = useCallback(() => {
    if (!hn) return
    setLoading(true)
    void fetchRecords('echo', { hn })
      .then((data) => {
        const arr = Array.isArray(data) ? data : (data as { items?: unknown[] }).items ?? []
        setRecords(arr as EchoRecord[])
      })
      .catch(() => setRecords([]))
      .finally(() => setLoading(false))
  }, [hn])

  useEffect(() => {
    loadRecords()
  }, [loadRecords])

  const handleRowClick = (rec: EchoRecord) => {
    if (expandedId === rec.id) {
      setExpandedId(null)
      setEditRecord(null)
      setEditMode(false)
    } else {
      setIsCreating(false)
      setExpandedId(rec.id)
      setEditMode(false)
      // Load full record detail
      void fetchRecord('echo', rec.id)
        .then((full) => setEditRecord(full as EchoRecord))
        .catch(() => setEditRecord(rec))
    }
  }

  const handleAddNew = () => {
    setExpandedId(null)
    setEditRecord(null)
    setEditMode(false)
    setIsCreating(true)
  }

  const handleSaved = () => {
    setIsCreating(false)
    setExpandedId(null)
    setEditRecord(null)
    setEditMode(false)
    loadRecords()
    reloadPatient()
  }

  const handleDelete = async (id: string) => {
    await deleteRecord('echo', id)
    setExpandedId(null)
    setEditRecord(null)
    loadRecords()
    reloadPatient()
  }

  const handleCancel = () => {
    if (editMode) {
      setEditMode(false)
    } else {
      setIsCreating(false)
      setExpandedId(null)
      setEditRecord(null)
    }
  }

  if (loading) {
    return (
      <div className="space-y-4">
        <div className="h-6 w-48 animate-pulse rounded bg-[hsl(var(--tone-neutral-200))]" />
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="h-12 w-full animate-pulse rounded-lg bg-[hsl(var(--tone-neutral-200))]" />
        ))}
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold uppercase tracking-[0.05em] text-[hsl(var(--muted-foreground))]">
          Echo Records
        </h2>
        <button
          type="button"
          onClick={handleAddNew}
          className="inline-flex items-center gap-1.5 rounded-md bg-[hsl(var(--tone-accent-600))] px-4 py-2 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-[hsl(var(--tone-accent-700))]"
        >
          <Plus className="h-4 w-4" />
          Add Echo Record
        </button>
      </div>

      {/* New record form */}
      {isCreating && (
        <div className="rounded-lg border-2 border-dashed border-[hsl(var(--tone-accent-300))] bg-[hsl(var(--tone-accent-50)/0.3)] px-5">
          <EchoRecordDetail
            record={{}}
            hn={hn}
            isNew
            onSaved={handleSaved}
            onCancel={handleCancel}
          />
        </div>
      )}

      {/* Records table */}
      {records.length === 0 && !isCreating ? (
        <div className="rounded-lg border border-[hsl(var(--stroke-soft)/0.72)] bg-[hsl(var(--card))] px-6 py-12 text-center shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
          <p className="text-sm text-[hsl(var(--muted-foreground))]">
            No Echo records found for this patient.
          </p>
        </div>
      ) : (
        <div className="overflow-hidden rounded-2xl border border-[hsl(var(--stroke-soft)/0.72)] bg-[hsl(var(--card))] text-sm">
          {/* Header row */}
          <div
            className="grid border-b-2 border-[hsl(var(--tone-neutral-300))] bg-[hsl(var(--tone-neutral-50))]"
            style={{ gridTemplateColumns: '2rem repeat(5, 1fr) 56px' }}
          >
            <div />
            {[
              { label: 'Date' },
              { label: 'PH probability' },
              { label: 'Case type' },
              { label: 'Primary diagnosis' },
              { label: 'Secondary pathology' },
            ].map((h, i) => (
              <div key={h.label} className={cn('flex items-center gap-1.5 px-4 py-2.5 font-semibold text-[hsl(var(--tone-neutral-700))]', i === 0 ? 'justify-start' : 'justify-center')}>
                <span>{h.label}</span>
              </div>
            ))}
            <SourceFileHeaderCell />
          </div>
          {/* Data rows */}
          {records.map((rec) => {
            const handleRowFieldChange = (key: string, value: string) => {
              setRecords((prev) => prev.map((r) => r.id === rec.id ? { ...r, [key]: value } as EchoRecord : r))
              void updateRecord('echo', rec.id, { [key]: value })
            }
            return (
            <Fragment key={rec.id}>
              <div
                onContextMenu={(e) => openMenu(e, [DeleteMenuItem({ onDelete: () => void handleDelete(rec.id) })])}
                className={cn(
                  'grid border-b border-[hsl(var(--stroke-soft)/0.4)] transition-colors duration-100',
                  expandedId === rec.id
                    ? 'bg-[hsl(var(--tone-neutral-50))]'
                    : 'hover:bg-[hsl(var(--tone-neutral-50)/0.65)]',
                )}
                style={{ gridTemplateColumns: '2rem repeat(5, 1fr) 56px' }}
              >
                <button
                  type="button"
                  onClick={() => handleRowClick(rec)}
                  className="flex items-center justify-center text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--foreground))] cursor-pointer"
                >
                  <svg className={cn('h-3.5 w-3.5 transition-transform duration-150', expandedId === rec.id && 'rotate-90')} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M6 4l4 4-4 4" /></svg>
                </button>
                <div className="flex items-center px-4 py-1.5">
                  <input
                    type="date"
                    value={toDateInputValue(rec.study_date)}
                    onChange={(e) => handleRowFieldChange('study_date', e.target.value)}
                    className="house-input rounded-lg text-xs py-1.5 px-2.5 w-full"
                  />
                </div>
                <div className="flex items-center justify-center px-4 py-2.5" onClick={(e) => e.stopPropagation()}>
                  <EditablePill label="" value={rec.ph_prob || ''} options={PH_PROB_OPTIONS} onChange={(v) => handleRowFieldChange('ph_prob', v)} />
                </div>
                <div className="flex items-center justify-center px-4 py-2.5" onClick={(e) => e.stopPropagation()}>
                  <EditablePill label="" value={rec.case_type ? shortCaseType(rec.case_type) : ''} options={CASE_TYPE_OPTIONS} onChange={(v) => handleRowFieldChange('case_type', v)} />
                </div>
                <div className="flex items-center justify-center px-4 py-2.5" onClick={(e) => e.stopPropagation()}>
                  <EditablePill label="" value={rec.primary_dx || ''} options={PRIMARY_DX_OPTIONS} onChange={(v) => handleRowFieldChange('primary_dx', v)} allowFreeText />
                </div>
                <div className="flex items-center justify-center px-4 py-2.5" onClick={(e) => e.stopPropagation()}>
                  <EditablePill label="" value={rec.secondary_path || ''} options={SECONDARY_PATH_OPTIONS} onChange={(v) => handleRowFieldChange('secondary_path', v)} allowFreeText />
                </div>
                <SourceFileCell modality="echo" recordId={rec.id} />
              </div>
              {expandedId === rec.id && editRecord && (
                <div className="border-t border-[hsl(var(--stroke-soft)/0.4)] px-5 bg-[hsl(var(--tone-neutral-50)/0.3)]">
                    <EchoRecordReadOnly
                      record={editRecord as EchoRecord}
                      patient={patient as Record<string, unknown> | null}
                      onFieldUpdated={(key, value) => {
                        setRecords((prev) => prev.map((r) => r.id === rec.id ? { ...r, [key]: value } as EchoRecord : r))
                      }}
                    />
                </div>
              )}
            </Fragment>
          )})}

        </div>
      )}
      {MenuPortal}
    </div>
  )
}
