import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Plus, Save, Loader2, X, ChevronDown, ChevronRight } from 'lucide-react'

import { fetchRecords, fetchRecord, createRecord, updateRecord, deleteRecord } from '@/lib/extract-api'
import { cn, toDateInputValue } from '@/lib/utils'
import { usePatientContext } from './extract-patient-detail-page'
import { CmrParameterTable } from '@/components/extract/cmr-parameter-table'
import type { PapillaryMode } from '@/lib/cmr-api'
import { resolveReferenceParameters } from '@/lib/cmr-local-data'
import { mapExtractRecordToMeasurements, mapMeasurementsToExtractRecord, autoComputeIndexed, autoComputeRegurgitation } from '@/lib/cmr-extract-mapping'
import { useRecordContextMenu, DeleteMenuItem } from '@/components/extract/record-context-menu'
import { EditablePill, type PillOption } from '@/components/extract/editable-pill'
import { SourceFileCell, SourceFileHeaderCell } from '@/components/extract/source-file-cell'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type CmrRecord = {
  id: string
  hn: string
  // Section 1: Study Setup
  date_cmr: string
  height: string
  weight: string
  heart_rate: string
  indication: string
  contrast: string
  stress: string
  flow: string
  source_file: string
  // Section 2: LV Volumes & Function
  lv_size: string
  lv_function: string
  lvef: string
  lvedv: string
  lvesv: string
  lvsv: string
  lvedvi: string
  lvesvi: string
  lvsvi: string
  lv_mass: string
  lvmi: string
  max_lv_wall: string
  lvh: string
  rwma: string
  mapse: string
  // Section 3: RV Volumes & Function
  rv_size: string
  rv_function: string
  rvef: string
  rvedv: string
  rvesv: string
  rvsv: string
  rvedvi: string
  rvesvi: string
  rvsvi: string
  tapse: string
  rv_lv_ratio: string
  // Section 4: Atria
  la_size: string
  la_volume: string
  ra_size: string
  // Section 5: Septal & RH Physiology
  d_shaped_lv: string
  d_shape_phase: string
  septal_flattening: string
  flattening_phase: string
  septal_bounce: string
  ias_bowing: string
  ias_direction: string
  rap: string
  pcwp: string
  // Section 6: PA & PH
  mpa_size: string
  lpa_size: string
  rpa_size: string
  mpa_vortex: string
  mpa_flow: string
  ph: string
  constrictive_physiology: string
  // Section 7: Tissue Characterisation
  native_t1: string
  t2: string
  t2_star: string
  ecv: string
  // Section 8: LGE / Scar
  lge: string
  fibrosis: string
  rv_insertion_point_lge: string
  lge_pattern: string
  lge_location: string
  lge_transmurality: string
  // Section 9: Perfusion
  perfusion_defect: string
  inducible_ischaemia: string
  fixed_defect: string
  reversible_defect: string
  perfusion_territory: string
  perfusion_coronary_territory: string
  // Section 10: Aortic Valve & Aorta
  asc_aorta: string
  ao_forward_volume: string
  ao_backward_volume: string
  ar_rf: string
  ar_volume: string
  ar_severity: string
  as_severity: string
  ao_vmax: string
  ao_mean_grad: string
  holo_diastolic_reversal: string
  // Section 11: Mitral Valve
  mr_rf: string
  mr_volume: string
  mr_severity: string
  // Section 12: Tricuspid Valve
  tr_rf: string
  tr_volume: string
  tr_severity: string
  // Section 13: Pulmonary Valve
  pulmonary_forward_volume: string
  pulmonary_backward_volume: string
  pr_rf: string
  pr_volume: string
  pr_severity: string
  qp_qs: string
  // Section 14: Pericardium
  pericardial_effusion: string
  pericardial_thickening: string
  pericardial_inflammation: string
  // Section 15: Thrombus & Mass
  thrombus: string
  thrombus_location: string
  mass: string
  mass_location: string
  // Section 16: Congenital
  congenital: string
  congenital_detail: string
  // Section 17: Surgery & Device
  cardiac_surgery: string
  surgery_detail: string
  device_prosthesis: string
  // Section 18: Classification & Conclusions
  cmr_class: string
  primary_dx: string
  secondary_dx: string
  conclusions: string
  classification_note: string
  extracardiac_findings: string
  other_extractable_text: string
  qc_notes: string
  // Meta
  status: string
  status_date: string
  created_at: string
}

const EMPTY_CMR: Omit<CmrRecord, 'id' | 'created_at'> = {
  hn: '',
  date_cmr: '', height: '', weight: '', heart_rate: '', indication: '', contrast: '', stress: '', flow: '', source_file: '',
  lv_size: '', lv_function: '', lvef: '', lvedv: '', lvesv: '', lvsv: '', lvedvi: '', lvesvi: '', lvsvi: '', lv_mass: '', lvmi: '', max_lv_wall: '', lvh: '', rwma: '', mapse: '',
  rv_size: '', rv_function: '', rvef: '', rvedv: '', rvesv: '', rvsv: '', rvedvi: '', rvesvi: '', rvsvi: '', tapse: '', rv_lv_ratio: '',
  la_size: '', la_volume: '', ra_size: '',
  d_shaped_lv: '', d_shape_phase: '', septal_flattening: '', flattening_phase: '', septal_bounce: '', ias_bowing: '', ias_direction: '', rap: '', pcwp: '',
  mpa_size: '', lpa_size: '', rpa_size: '', mpa_vortex: '', mpa_flow: '', ph: '', constrictive_physiology: '',
  native_t1: '', t2: '', t2_star: '', ecv: '',
  lge: '', fibrosis: '', rv_insertion_point_lge: '', lge_pattern: '', lge_location: '', lge_transmurality: '',
  perfusion_defect: '', inducible_ischaemia: '', fixed_defect: '', reversible_defect: '', perfusion_territory: '', perfusion_coronary_territory: '',
  asc_aorta: '', ao_forward_volume: '', ao_backward_volume: '', ar_rf: '', ar_volume: '', ar_severity: '', as_severity: '', ao_vmax: '', ao_mean_grad: '', holo_diastolic_reversal: '',
  mr_rf: '', mr_volume: '', mr_severity: '',
  tr_rf: '', tr_volume: '', tr_severity: '',
  pulmonary_forward_volume: '', pulmonary_backward_volume: '', pr_rf: '', pr_volume: '', pr_severity: '', qp_qs: '',
  pericardial_effusion: '', pericardial_thickening: '', pericardial_inflammation: '',
  thrombus: '', thrombus_location: '', mass: '', mass_location: '',
  congenital: '', congenital_detail: '',
  cardiac_surgery: '', surgery_detail: '', device_prosthesis: '',
  cmr_class: '', primary_dx: '', secondary_dx: '', conclusions: '', classification_note: '', extracardiac_findings: '', other_extractable_text: '', qc_notes: '',
  status: 'Pending', status_date: '',
}

// CMR parameter sections now driven by cmr_reference_data.json via CmrParameterTable

// ---------------------------------------------------------------------------
// Descriptor card sections (TEXT-only fields shown as info cards)
// ---------------------------------------------------------------------------

type DescriptorSection = {
  title: string
  fields: { key: string; label: string }[]
}

const DESCRIPTOR_SECTIONS: DescriptorSection[] = [
  {
    title: 'Septal / RH physiology',
    fields: [
      { key: 'ph', label: 'PH probability' },
      { key: 'd_shaped_lv', label: 'D-shaped LV' },
      { key: 'd_shape_phase', label: 'D-shape phase' },
      { key: 'septal_flattening', label: 'Septal flattening' },
      { key: 'flattening_phase', label: 'Flattening phase' },
      { key: 'septal_bounce', label: 'Septal bounce' },
      { key: 'ias_bowing', label: 'IAS bowing' },
      { key: 'ias_direction', label: 'IAS direction' },
      { key: 'constrictive_physiology', label: 'Constrictive' },
      { key: 'mpa_vortex', label: 'MPA vortex' },
      { key: 'mpa_flow', label: 'MPA flow' },
    ],
  },
  {
    title: 'Additional measurements',
    fields: [
      { key: 'rv_lv_ratio', label: 'RV/LV ratio' },
      { key: 'ar_volume', label: 'AR volume' },
      { key: 'pr_volume', label: 'PR volume' },
      { key: 'holo_diastolic_reversal', label: 'Holo-diastolic reversal' },
    ],
  },
  {
    title: 'LGE / Scar',
    fields: [
      { key: 'lge', label: 'LGE' },
      { key: 'lge_pattern', label: 'Pattern' },
      { key: 'lge_location', label: 'Location' },
      { key: 'lge_transmurality', label: 'Transmurality' },
      { key: 'fibrosis', label: 'Fibrosis' },
      { key: 'rv_insertion_point_lge', label: 'RV insertion point' },
    ],
  },
  {
    title: 'Perfusion',
    fields: [
      { key: 'perfusion_defect', label: 'Defect' },
      { key: 'inducible_ischaemia', label: 'Inducible ischaemia' },
      { key: 'fixed_defect', label: 'Fixed defect' },
      { key: 'reversible_defect', label: 'Reversible defect' },
      { key: 'perfusion_territory', label: 'Territory' },
      { key: 'perfusion_coronary_territory', label: 'Coronary territory' },
    ],
  },
  {
    title: 'Pericardium',
    fields: [
      { key: 'pericardial_effusion', label: 'Effusion' },
      { key: 'pericardial_thickening', label: 'Thickening' },
      { key: 'pericardial_inflammation', label: 'Inflammation' },
    ],
  },
  {
    title: 'Thrombus / Mass',
    fields: [
      { key: 'thrombus', label: 'Thrombus' },
      { key: 'thrombus_location', label: 'Location' },
      { key: 'mass', label: 'Mass' },
      { key: 'mass_location', label: 'Location' },
    ],
  },
  {
    title: 'Congenital',
    fields: [
      { key: 'congenital', label: 'Congenital' },
      { key: 'congenital_detail', label: 'Detail' },
    ],
  },
  {
    title: 'Surgery / Device',
    fields: [
      { key: 'cardiac_surgery', label: 'Surgery' },
      { key: 'surgery_detail', label: 'Detail' },
      { key: 'device_prosthesis', label: 'Device / Prosthesis' },
    ],
  },
  {
    title: 'Classification',
    fields: [
      { key: 'cmr_class', label: 'Case type' },
      { key: 'primary_dx', label: 'Primary diagnosis' },
      { key: 'secondary_dx', label: 'Secondary diagnosis' },
    ],
  },
]

// ---------------------------------------------------------------------------
// CMR field options for right-click pill selection
// ---------------------------------------------------------------------------

// All options below sourced from CMR_SOURCE_OF_TRUTH2.xlsx unique values

const CHAMBER_SIZE_OPTIONS: PillOption[] = [
  { value: 'Normal' }, { value: 'Mildly dilated' }, { value: 'Moderately dilated' },
  { value: 'Severely dilated' }, { value: 'Dilated' },
]
const FUNCTION_OPTIONS: PillOption[] = [
  { value: 'Normal' }, { value: 'Hyperdynamic' }, { value: 'Mildly impaired' },
  { value: 'Moderately impaired' }, { value: 'Severely impaired' }, { value: 'Impaired' },
]
const SEVERITY_OPTIONS: PillOption[] = [
  { value: 'Mild' }, { value: 'Mild-to-moderate' }, { value: 'Moderate' },
  { value: 'Moderate-to-severe' }, { value: 'Severe' },
]
const YES_NO_OPTIONS: PillOption[] = [
  { value: 'Yes' }, { value: 'No' },
]
const PRESENT_ABSENT_OPTIONS: PillOption[] = [
  { value: 'Present' }, { value: 'Absent' },
]
const LGE_YES_NO_OPTIONS: PillOption[] = [
  { value: 'Yes' }, { value: 'No' },
]
const LGE_PATTERN_OPTIONS: PillOption[] = [
  { value: 'None' }, { value: 'Ischaemic' }, { value: 'Non-ischaemic' },
  { value: 'Mixed' }, { value: 'Diffuse' },
]
const LGE_TRANSMURALITY_OPTIONS: PillOption[] = [
  { value: 'Subendocardial' }, { value: 'Mid-wall' }, { value: 'Subepicardial' },
  { value: 'Transmural' }, { value: 'Patchy' },
]
const IAS_DIRECTION_OPTIONS: PillOption[] = [
  { value: 'Right to left' }, { value: 'Left to right' }, { value: 'Bidirectional' },
]
const PHASE_OPTIONS: PillOption[] = [
  { value: 'Systolic' }, { value: 'Diastolic' }, { value: 'Throughout' },
]
const MPA_FLOW_OPTIONS: PillOption[] = [
  { value: 'Laminar' }, { value: 'Abnormal' },
]
const CMR_FLOW_OPTIONS: PillOption[] = [
  { value: '2D-flow' }, { value: '4D-flow' },
]
const PERICARDIAL_OPTIONS: PillOption[] = [
  { value: 'None' }, { value: 'Small' }, { value: 'Mild' }, { value: 'Moderate' }, { value: 'Present' },
]
const CORONARY_TERRITORY_OPTIONS: PillOption[] = [
  { value: 'LAD' }, { value: 'LCx' }, { value: 'RCA' }, { value: 'PDA' },
  { value: 'OM' }, { value: 'D1' }, { value: 'Multi-vessel' },
]
const CMR_CASE_TYPE_OPTIONS: PillOption[] = [
  { value: 'Normal' },
  { value: 'Limited / non-diagnostic' },
  { value: 'Ischaemic' },
  { value: 'Non-ischaemic cardiomyopathy' },
  { value: 'Myocarditis / inflammatory' },
  { value: 'Hypertrophic cardiomyopathy / LVH' },
  { value: 'Infiltrative / storage' },
  { value: 'Pericardial disease' },
  { value: 'Congenital heart disease' },
  { value: 'Valve disease' },
  { value: 'Pulmonary hypertension / right heart' },
  { value: 'Mass / thrombus' },
  { value: 'Post-operative / prosthetic' },
  { value: 'Other' },
]
const PRIMARY_DX_OPTIONS: PillOption[] = [
  { value: 'Normal study' },
  { value: 'Limited / non-diagnostic study' },
  { value: 'Prior myocardial infarction / ischaemic scar' },
  { value: 'Ischaemic cardiomyopathy' },
  { value: 'Inducible myocardial ischaemia' },
  { value: 'Dilated cardiomyopathy' },
  { value: 'Non-dilated LV cardiomyopathy' },
  { value: 'Arrhythmogenic cardiomyopathy' },
  { value: 'Non-ischaemic myocardial fibrosis / scar' },
  { value: 'Myocarditis' },
  { value: 'Myopericarditis' },
  { value: 'Prior myocarditis / post-inflammatory scar' },
  { value: 'Hypertrophic cardiomyopathy' },
  { value: 'Cardiac amyloidosis pattern' },
  { value: 'Cardiac sarcoidosis pattern' },
  { value: 'Pulmonary hypertension phenotype' },
  { value: 'Pericardial disease' },
  { value: 'Congenital heart disease' },
  { value: 'Cardiac mass' },
  { value: 'LV thrombus' },
  { value: 'Severe aortic regurgitation' },
  { value: 'Moderate-to-severe aortic regurgitation' },
  { value: 'Moderate aortic regurgitation' },
  { value: 'Severe aortic stenosis' },
  { value: 'Moderate-to-severe aortic stenosis' },
  { value: 'Moderate aortic stenosis' },
  { value: 'Severe mitral regurgitation' },
  { value: 'Moderate-to-severe mitral regurgitation' },
  { value: 'Moderate mitral regurgitation' },
  { value: 'Severe tricuspid regurgitation' },
  { value: 'Moderate-to-severe tricuspid regurgitation' },
  { value: 'Moderate tricuspid regurgitation' },
]

const PH_PROB_OPTIONS: PillOption[] = [
  { value: 'Low' },
  { value: 'Low-intermediate' },
  { value: 'Intermediate' },
  { value: 'Intermediate-high' },
  { value: 'High' },
]

const CMR_FIELD_OPTIONS: Record<string, PillOption[]> = {
  // Chamber descriptors
  lv_size: CHAMBER_SIZE_OPTIONS,
  lv_function: FUNCTION_OPTIONS,
  rv_size: CHAMBER_SIZE_OPTIONS,
  rv_function: FUNCTION_OPTIONS,
  la_size: CHAMBER_SIZE_OPTIONS,
  ra_size: CHAMBER_SIZE_OPTIONS,
  // Yes/No booleans (from source of truth)
  lvh: YES_NO_OPTIONS,
  rwma: YES_NO_OPTIONS,
  d_shaped_lv: YES_NO_OPTIONS,
  septal_flattening: YES_NO_OPTIONS,
  septal_bounce: YES_NO_OPTIONS,
  ias_bowing: YES_NO_OPTIONS,
  mpa_vortex: YES_NO_OPTIONS,
  lge: LGE_YES_NO_OPTIONS,
  fibrosis: YES_NO_OPTIONS,
  rv_insertion_point_lge: YES_NO_OPTIONS,
  perfusion_defect: YES_NO_OPTIONS,
  inducible_ischaemia: YES_NO_OPTIONS,
  fixed_defect: YES_NO_OPTIONS,
  reversible_defect: YES_NO_OPTIONS,
  thrombus: YES_NO_OPTIONS,
  mass: YES_NO_OPTIONS,
  congenital: YES_NO_OPTIONS,
  cardiac_surgery: YES_NO_OPTIONS,
  // Present/Absent booleans (from source of truth)
  holo_diastolic_reversal: PRESENT_ABSENT_OPTIONS,
  pericardial_thickening: PRESENT_ABSENT_OPTIONS,
  pericardial_inflammation: PRESENT_ABSENT_OPTIONS,
  constrictive_physiology: PRESENT_ABSENT_OPTIONS,
  // Phases / directions
  d_shape_phase: PHASE_OPTIONS,
  flattening_phase: PHASE_OPTIONS,
  ias_direction: IAS_DIRECTION_OPTIONS,
  mpa_flow: MPA_FLOW_OPTIONS,
  // PH probability
  ph: PH_PROB_OPTIONS,
  // LGE / Scar
  lge_pattern: LGE_PATTERN_OPTIONS,
  lge_transmurality: LGE_TRANSMURALITY_OPTIONS,
  // Perfusion coronary territory
  perfusion_coronary_territory: CORONARY_TERRITORY_OPTIONS,
  // Valve severities
  ar_severity: SEVERITY_OPTIONS,
  as_severity: SEVERITY_OPTIONS,
  mr_severity: SEVERITY_OPTIONS,
  tr_severity: SEVERITY_OPTIONS,
  pr_severity: SEVERITY_OPTIONS,
  // Pericardium
  pericardial_effusion: PERICARDIAL_OPTIONS,
  // Classification
  cmr_class: CMR_CASE_TYPE_OPTIONS,
  primary_dx: PRIMARY_DX_OPTIONS,
}

// Fields that are pure free-text (no preset options, just a text input pill)
const FREE_TEXT_ONLY_FIELDS = new Set([
  'lge_location', 'perfusion_territory',
  'thrombus_location', 'mass_location',
  'rv_lv_ratio', 'ar_volume', 'pr_volume',
  'surgery_detail', 'device_prosthesis',
  'congenital_detail', 'secondary_dx',
  'extracardiac_findings', 'other_extractable_text', 'qc_notes',
])

// ---------------------------------------------------------------------------
// Descriptor cards (read-only → now editable with right-click pills)
// ---------------------------------------------------------------------------

// Normalise legacy 0/1 boolean values for display
function normaliseBoolDisplay(raw: string, options: PillOption[]): string {
  const v = raw.trim().toLowerCase()
  // If options are Yes/No, normalise to that
  if (options === YES_NO_OPTIONS || options === LGE_YES_NO_OPTIONS) {
    if (v === '0' || v === 'false' || v === 'no' || v === 'none' || v === 'absent') return 'No'
    if (v === '1' || v === 'true' || v === 'yes' || v === 'present') return 'Yes'
    return raw
  }
  // Present/Absent
  if (v === '0' || v === 'false' || v === 'no' || v === 'none' || v === 'absent') return 'Absent'
  if (v === '1' || v === 'true' || v === 'yes' || v === 'present') return 'Present'
  return raw
}

// No longer needed — using pillStyle from editable-pill.tsx via EditablePill

function ChamberDescriptorCard({ data, onFieldChange }: { data: Record<string, unknown>; onFieldChange: (key: string, value: string) => void }) {
  const str = (key: string) => {
    const v = data[key]
    if (typeof v !== 'string') return ''
    return v
  }

  const lvFields = [
    { key: 'lv_size', label: 'LV size' },
    { key: 'lv_function', label: 'LV function' },
    { key: 'lvh', label: 'LVH' },
    { key: 'rwma', label: 'RWMA' },
  ]
  const rvFields = [
    { key: 'rv_size', label: 'RV size' },
    { key: 'rv_function', label: 'RV function' },
  ]
  const atrialFields = [
    { key: 'la_size', label: 'LA size' },
    { key: 'ra_size', label: 'RA size' },
  ]

  const renderPills = (fields: { key: string; label: string }[]) =>
    fields.map((f) => {
      const raw = str(f.key)
      const options = CMR_FIELD_OPTIONS[f.key]
      // Normalise legacy 0/1 for display
      const isBoolField = options === YES_NO_OPTIONS || options === LGE_YES_NO_OPTIONS || options === PRESENT_ABSENT_OPTIONS
      const display = isBoolField ? normaliseBoolDisplay(raw, options) : raw
      return (
        <EditablePill
          key={f.key}
          label={f.label}
          value={display}
          options={options ?? PRESENT_ABSENT_OPTIONS}
          onChange={(v) => onFieldChange(f.key, v)}
        />
      )
    })

  return (
    <div className="rounded-lg border border-[hsl(var(--stroke-soft)/0.72)] bg-[hsl(var(--card))]">
      <div className="border-b border-[hsl(var(--stroke-soft)/0.5)] bg-[hsl(var(--tone-neutral-50))] px-4 py-2">
        <h4 className="text-sm font-semibold tracking-tight text-[hsl(var(--foreground))]">Chamber descriptors</h4>
      </div>
      <div className="px-4 py-3">
        <div className="flex flex-wrap items-start gap-x-6 gap-y-3">
          {/* LV */}
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs font-semibold text-[hsl(var(--muted-foreground))] uppercase tracking-wider">LV</span>
            {renderPills(lvFields)}
          </div>
          <div className="hidden sm:block h-8 w-px bg-[hsl(var(--stroke-soft)/0.4)] self-center" />
          {/* RV */}
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs font-semibold text-[hsl(var(--muted-foreground))] uppercase tracking-wider">RV</span>
            {renderPills(rvFields)}
          </div>
          <div className="hidden sm:block h-8 w-px bg-[hsl(var(--stroke-soft)/0.4)] self-center" />
          {/* Atria */}
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs font-semibold text-[hsl(var(--muted-foreground))] uppercase tracking-wider">Atria</span>
            {renderPills(atrialFields)}
          </div>
        </div>
      </div>
    </div>
  )
}

/** Derive a severity label from a regurgitant fraction (%). */
function rfToSeverity(rf: number): string {
  if (rf < 15) return 'Trivial'
  if (rf < 25) return 'Mild'
  if (rf < 40) return 'Moderate'
  return 'Severe'
}

function ValveSeveritiesCard({ data, measurements, onFieldChange }: { data: Record<string, unknown>; measurements: Map<string, number>; onFieldChange: (key: string, value: string) => void }) {
  const str = (key: string) => {
    const v = data[key]
    if (typeof v !== 'string' || !v.trim()) return null
    return v
  }

  // Build valve entries — from DB severity fields, or derived from RF
  type ValveEntry = { dbKey: string; label: string; value: string; derived: boolean }
  const entries: ValveEntry[] = []

  const arSev = str('ar_severity')
  if (arSev) entries.push({ dbKey: 'ar_severity', label: 'AR', value: arSev, derived: false })
  else {
    const rf = measurements.get('AV regurgitant fraction')
    entries.push({ dbKey: 'ar_severity', label: 'AR', value: rf != null ? rfToSeverity(rf) : '', derived: rf != null })
  }

  const asSev = str('as_severity')
  entries.push({ dbKey: 'as_severity', label: 'AS', value: asSev ?? '', derived: false })

  const mrSev = str('mr_severity')
  if (mrSev) entries.push({ dbKey: 'mr_severity', label: 'MR', value: mrSev, derived: false })
  else {
    const rf = measurements.get('MR regurgitant fraction')
    entries.push({ dbKey: 'mr_severity', label: 'MR', value: rf != null ? rfToSeverity(rf) : '', derived: rf != null })
  }

  const trSev = str('tr_severity')
  if (trSev) entries.push({ dbKey: 'tr_severity', label: 'TR', value: trSev, derived: false })
  else {
    const rf = measurements.get('TR regurgitant fraction')
    entries.push({ dbKey: 'tr_severity', label: 'TR', value: rf != null ? rfToSeverity(rf) : '', derived: rf != null })
  }

  const prSev = str('pr_severity')
  if (prSev) entries.push({ dbKey: 'pr_severity', label: 'PR', value: prSev, derived: false })
  else {
    const rf = measurements.get('PV regurgitant fraction')
    entries.push({ dbKey: 'pr_severity', label: 'PR', value: rf != null ? rfToSeverity(rf) : '', derived: rf != null })
  }

  return (
    <div className="rounded-lg border border-[hsl(var(--stroke-soft)/0.72)] bg-[hsl(var(--card))]">
      <div className="border-b border-[hsl(var(--stroke-soft)/0.5)] bg-[hsl(var(--tone-neutral-50))] px-4 py-2">
        <h4 className="text-sm font-semibold tracking-tight text-[hsl(var(--foreground))]">Valve severities</h4>
      </div>
      <div className="px-4 py-3">
        <div className="flex flex-wrap gap-2">
          {entries.map((e) => (
            <EditablePill
              key={e.dbKey}
              label={e.label}
              value={e.value}
              options={SEVERITY_OPTIONS}
              onChange={(v) => onFieldChange(e.dbKey, v)}
            />
          ))}
        </div>
      </div>
    </div>
  )
}

function DescriptorCardsInline({ data, onFieldChange }: { data: Record<string, unknown>; onFieldChange: (key: string, value: string) => void }) {
  const str = (key: string) => {
    const v = data[key]
    return typeof v === 'string' ? v : ''
  }

  return (
    <div className="space-y-3">
      {DESCRIPTOR_SECTIONS.map((section) => (
        <div
          key={section.title}
          className="rounded-lg border border-[hsl(var(--stroke-soft)/0.72)] bg-[hsl(var(--card))]"
        >
          <div className="border-b border-[hsl(var(--stroke-soft)/0.5)] bg-[hsl(var(--tone-neutral-50))] px-4 py-2">
            <h4 className="text-sm font-semibold tracking-tight text-[hsl(var(--foreground))]">
              {section.title}
            </h4>
          </div>
          <div className="px-4 py-3">
            <div className="flex flex-wrap gap-2">
              {section.fields.map((f) => {
                const raw = str(f.key)
                const options = CMR_FIELD_OPTIONS[f.key]

                if (options) {
                  // Normalise legacy 0/1 for Present/Absent fields
                  const isBoolField = options === YES_NO_OPTIONS || options === LGE_YES_NO_OPTIONS || options === PRESENT_ABSENT_OPTIONS
      const display = isBoolField ? normaliseBoolDisplay(raw, options) : raw
                  return (
                    <EditablePill
                      key={f.key}
                      label={f.label}
                      value={display}
                      options={options}
                      onChange={(v) => onFieldChange(f.key, v)}
                      allowFreeText={options !== PRESENT_ABSENT_OPTIONS}
                    />
                  )
                }

                // Pure free-text — pill with just free-text input, no preset options
                if (FREE_TEXT_ONLY_FIELDS.has(f.key)) {
                  return (
                    <EditablePill
                      key={f.key}
                      label={f.label}
                      value={raw}
                      options={[]}
                      onChange={(v) => onFieldChange(f.key, v)}
                      allowFreeText
                    />
                  )
                }

                // Fallback — Yes/No
                return (
                  <EditablePill
                    key={f.key}
                    label={f.label}
                    value={normaliseBoolDisplay(raw, YES_NO_OPTIONS)}
                    options={YES_NO_OPTIONS}
                    onChange={(v) => onFieldChange(f.key, v)}
                  />
                )
              })}
            </div>
          </div>
        </div>
      ))}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Descriptor cards (editable)
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Descriptor cards (editable)
// ---------------------------------------------------------------------------

function DescriptorCardsEditable({
  data,
  onFieldChange,
}: {
  data: Record<string, unknown>
  onFieldChange: (key: string, value: string) => void
}) {
  const str = (key: string) => {
    const v = data[key]
    return typeof v === 'string' ? v : ''
  }

  return (
    <div className="space-y-3">
      {DESCRIPTOR_SECTIONS.map((section) => (
        <CollapsibleSection key={section.title} title={section.title} defaultOpen={false}>
          {section.fields.map((f) => {
            const isLongField =
              f.key === 'conclusions' ||
              f.key === 'classification_note' ||
              f.key === 'extracardiac_findings' ||
              f.key === 'other_extractable_text' ||
              f.key === 'qc_notes' ||
              f.key === 'congenital_detail' ||
              f.key === 'surgery_detail'
            if (isLongField) {
              return (
                <div key={f.key} className="sm:col-span-2 lg:col-span-4">
                  <label className="block text-xs font-medium text-[hsl(var(--muted-foreground))] mb-1.5">
                    {f.label}
                  </label>
                  <textarea
                    value={str(f.key)}
                    onChange={(e) => onFieldChange(f.key, e.target.value)}
                    rows={3}
                    className="house-input w-full text-sm resize-y"
                  />
                </div>
              )
            }
            return (
              <div key={f.key}>
                <label className="block text-xs font-medium text-[hsl(var(--muted-foreground))] mb-1.5">
                  {f.label}
                </label>
                <input
                  type="text"
                  value={str(f.key)}
                  onChange={(e) => onFieldChange(f.key, e.target.value)}
                  className="house-input w-full text-sm"
                />
              </div>
            )
          })}
        </CollapsibleSection>
      ))}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Collapsible section (for editable descriptor cards)
// ---------------------------------------------------------------------------

function CollapsibleSection({
  title,
  defaultOpen = true,
  children,
}: {
  title: string
  defaultOpen?: boolean
  children: React.ReactNode
}) {
  const [open, setOpen] = useState(defaultOpen)

  return (
    <div className="rounded-lg border border-[hsl(var(--stroke-soft)/0.72)] bg-[hsl(var(--card))] shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="flex w-full items-center gap-2 px-5 py-3 text-left text-sm font-semibold uppercase tracking-[0.05em] text-[hsl(var(--muted-foreground))] hover:bg-[hsl(var(--tone-neutral-50))] transition-colors rounded-lg"
      >
        {open ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
        {title}
      </button>
      {open && (
        <div className="border-t border-[hsl(var(--stroke-soft)/0.4)] px-5 py-4">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">{children}</div>
        </div>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// CMR record detail (editable: parameter table + descriptor cards)
// ---------------------------------------------------------------------------

function CmrRecordDetail({
  record,
  hn,
  isNew,
  onSaved,
  onCancel,
}: {
  record: Partial<CmrRecord>
  hn: string
  isNew: boolean
  onSaved: () => void
  onCancel: () => void
}) {
  const { patient } = usePatientContext()
  const [form, setForm] = useState<Record<string, unknown>>({ ...EMPTY_CMR, hn, ...record })
  const [saving, setSaving] = useState(false)
  const [sex, setSex] = useState<string>('Male')
  const [age, setAge] = useState<number | undefined>(undefined)
  const [papMode, setPapMode] = useState<PapillaryMode>('blood_pool')
  const [localMeasurements, setLocalMeasurements] = useState<Map<string, number>>(() => {
    const m = mapExtractRecordToMeasurements({ ...EMPTY_CMR, hn, ...record })
    return m
  })

  // Auto-detect sex and age from patient
  useEffect(() => {
    if (patient?.gender) setSex(patient.gender === 'Female' ? 'Female' : 'Male')
    if (patient?.dob && form.date_cmr) {
      const dob = new Date(String(patient.dob))
      const study = new Date(toDateInputValue(String(form.date_cmr)))
      if (!isNaN(dob.getTime()) && !isNaN(study.getTime())) {
        const a = Math.floor((study.getTime() - dob.getTime()) / (365.25 * 24 * 60 * 60 * 1000))
        if (a > 0 && a < 150) setAge(a)
      }
    }
  }, [patient, form.date_cmr])

  const resolved = useMemo(() => resolveReferenceParameters(sex, age, papMode), [sex, age, papMode])

  const measurements = useMemo(() => {
    const m = new Map(localMeasurements)
    const h = Number(form.height), w = Number(form.weight)
    const bsa = (h > 0 && w > 0) ? Math.sqrt((h * w) / 3600) : null
    return autoComputeRegurgitation(autoComputeIndexed(m, bsa))
  }, [localMeasurements, form.height, form.weight])

  const handleMeasurementChange = useCallback((paramKey: string, value: number | null) => {
    setLocalMeasurements((prev) => {
      const next = new Map(prev)
      if (value !== null) next.set(paramKey, value)
      else next.delete(paramKey)
      return next
    })
  }, [])

  const handleFieldChange = useCallback((key: string, value: string) => {
    setForm((prev) => ({ ...prev, [key]: value }))
  }, [])

  const handleSave = async () => {
    setSaving(true)
    try {
      // Merge measurements back into form
      const measFields = mapMeasurementsToExtractRecord(localMeasurements)
      const merged = { ...form, ...measFields }
      if (isNew) {
        await createRecord('cmr', merged)
      } else {
        await updateRecord('cmr', record.id!, merged)
      }
      onSaved()
    } catch {
      // keep form on failure
    } finally {
      setSaving(false)
    }
  }

  // Demographics pills
  const pills = useMemo(() => {
    const p: { label: string }[] = []
    if (patient?.gender) p.push({ label: String(patient.gender) })
    if (age) p.push({ label: `${age} years` })
    const h = Number(form.height), w = Number(form.weight)
    if (h > 0 && w > 0) {
      const hM = h / 100
      const bmi = (w / (hM * hM)).toFixed(0)
      p.push({ label: `BMI ${bmi} (${Math.round(h)} cm, ${Math.round(w)} kg)` })
      p.push({ label: `BSA ${Math.sqrt((h * w) / 3600).toFixed(2)} m\u00B2` })
    } else if (h > 0) {
      p.push({ label: `${Math.round(h)} cm` })
    } else if (w > 0) {
      p.push({ label: `${Math.round(w)} kg` })
    }
    const hr = Number(form.heart_rate)
    if (hr > 0) p.push({ label: `HR ${Math.round(hr)} bpm` })
    const flow = String(form.flow ?? '').trim()
    if (flow) p.push({ label: `Flow: ${flow}` })
    return p
  }, [patient, age, form.height, form.weight, form.heart_rate, form.flow])

  return (
    <div className="space-y-4 py-4">
      <ToggleBox label="Study context" defaultOpen={isNew}>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {[
            { key: 'date_cmr', label: 'Study date', type: 'date' },
            { key: 'height', label: 'Height (cm)' },
            { key: 'weight', label: 'Weight (kg)' },
            { key: 'heart_rate', label: 'Heart rate (bpm)' },
            { key: 'indication', label: 'Indication' },
            { key: 'contrast', label: 'Contrast' },
            { key: 'stress', label: 'Stress' },
            { key: 'flow', label: 'Flow' },
          ].map((f) => (
            <div key={f.key}>
              <label className="block text-xs font-medium text-[hsl(var(--muted-foreground))] mb-1.5">{f.label}</label>
              <input
                type={f.type === 'date' ? 'date' : 'text'}
                value={f.type === 'date' ? toDateInputValue(String(form[f.key] ?? '')) : String(form[f.key] ?? '')}
                onChange={(e) => handleFieldChange(f.key, e.target.value)}
                className="house-input rounded-lg w-full text-xs py-1.5 px-2.5"
              />
            </div>
          ))}
        </div>
      </ToggleBox>

      {/* Parameter table (canonical params with age/sex reference ranges) */}
      <CmrParameterTable
        canonicalParams={resolved.parameters}
        measurements={measurements}
        editable
        onValueChange={handleMeasurementChange}
        demographics={pills}
        papMode={papMode}
        onPapChange={setPapMode}
        initialShowFilter={isNew ? 'all' : 'recorded'}
      />

      <ChamberDescriptorCard data={form} onFieldChange={handleFieldChange} />
      <ValveSeveritiesCard data={form} measurements={measurements} onFieldChange={handleFieldChange} />

      {/* Descriptor cards (text fields) */}
      <DescriptorCardsEditable data={form} onFieldChange={handleFieldChange} />

      <ToggleBox label="Conclusions / QC" defaultOpen={isNew}>
        <div className="space-y-3">
          {[
            { key: 'conclusions', label: 'Conclusions' },
            { key: 'classification_note', label: 'Classification note' },
            { key: 'extracardiac_findings', label: 'Extracardiac findings' },
            { key: 'other_extractable_text', label: 'Other extractable text' },
            { key: 'qc_notes', label: 'QC notes' },
          ].map((f) => (
            <div key={f.key}>
              <label className="block text-xs font-medium text-[hsl(var(--muted-foreground))] mb-1.5">{f.label}</label>
              <textarea
                value={String(form[f.key] ?? '')}
                onChange={(e) => handleFieldChange(f.key, e.target.value)}
                rows={3}
                className="house-input w-full text-sm resize-y"
              />
            </div>
          ))}
        </div>
      </ToggleBox>

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
// Read-only view (parameter table + descriptor cards)
// ---------------------------------------------------------------------------

function CmrRecordReadOnly({ record, onFieldUpdated }: { record: CmrRecord; onFieldUpdated?: (key: string, value: unknown) => void }) {
  const { patient } = usePatientContext()
  const [data, setData] = useState<Record<string, unknown>>(record as unknown as Record<string, unknown>)
  const [sex, setSex] = useState<string>('Male')
  const [age, setAge] = useState<number | undefined>(undefined)
  const [papMode, setPapMode] = useState<PapillaryMode>('blood_pool')
  const saveTimer = useRef<ReturnType<typeof setTimeout>>()
  const [localMeasurements, setLocalMeasurements] = useState<Map<string, number>>(() =>
    mapExtractRecordToMeasurements(record as unknown as Record<string, unknown>),
  )

  // Auto-detect sex and age from patient
  useEffect(() => {
    if (patient?.gender) setSex(patient.gender === 'Female' ? 'Female' : 'Male')
    if (patient?.dob && data.date_cmr) {
      const dob = new Date(String(patient.dob))
      const study = new Date(toDateInputValue(String(data.date_cmr)))
      if (!isNaN(dob.getTime()) && !isNaN(study.getTime())) {
        const a = Math.floor((study.getTime() - dob.getTime()) / (365.25 * 24 * 60 * 60 * 1000))
        if (a > 0 && a < 150) setAge(a)
      }
    }
  }, [patient, data.date_cmr])

  const resolved = useMemo(() => resolveReferenceParameters(sex, age, papMode), [sex, age, papMode])

  const measurements = useMemo(() => {
    const m = new Map(localMeasurements)
    const h = Number(data.height), w = Number(data.weight)
    const bsa = (h > 0 && w > 0) ? Math.sqrt((h * w) / 3600) : null
    return autoComputeRegurgitation(autoComputeIndexed(m, bsa))
  }, [localMeasurements, data.height, data.weight])

  // Auto-save descriptor field changes (debounced) — silent save, no list reload
  const handleFieldChange = useCallback((key: string, value: string) => {
    setData((prev) => ({ ...prev, [key]: value }))
    onFieldUpdated?.(key, value)
    if (saveTimer.current) clearTimeout(saveTimer.current)
    saveTimer.current = setTimeout(() => {
      void updateRecord('cmr', record.id, { [key]: value })
    }, 600)
  }, [record.id, onFieldUpdated])

  // Auto-save measurement changes (debounced)
  const handleMeasurementChange = useCallback((paramKey: string, value: number | null) => {
    setLocalMeasurements((prev) => {
      const next = new Map(prev)
      if (value !== null) next.set(paramKey, value)
      else next.delete(paramKey)
      return next
    })
    // Map measurement back to DB field and save
    if (saveTimer.current) clearTimeout(saveTimer.current)
    saveTimer.current = setTimeout(() => {
      const tempMap = new Map([[paramKey, value ?? 0]])
      if (value === null) tempMap.delete(paramKey)
      // Use the full local measurements to compute DB fields
      setLocalMeasurements((current) => {
        const measFields = mapMeasurementsToExtractRecord(current)
        void updateRecord('cmr', record.id, measFields)
        return current
      })
    }, 600)
  }, [record.id])

  // Demographics pills
  const pills = useMemo(() => {
    const p: { label: string; tone?: 'danger' | 'positive' | 'warning' | 'accent' | 'neutral' }[] = []
    if (patient?.gender) p.push({ label: String(patient.gender) })
    if (age) p.push({ label: `${age} years` })
    const h = Number(data.height), w = Number(data.weight)
    if (h > 0 && w > 0) {
      const hM = h / 100
      const bmi = (w / (hM * hM)).toFixed(0)
      p.push({ label: `BMI ${bmi} (${Math.round(h)} cm, ${Math.round(w)} kg)` })
      p.push({ label: `BSA ${Math.sqrt((h * w) / 3600).toFixed(2)} m\u00B2` })
    } else if (h > 0) {
      p.push({ label: `${Math.round(h)} cm` })
    } else if (w > 0) {
      p.push({ label: `${Math.round(w)} kg` })
    }
    const hr = Number(data.heart_rate)
    if (hr > 0) p.push({ label: `HR ${Math.round(hr)} bpm` })
    const flow = String(data.flow ?? '').trim()
    if (flow) p.push({ label: `Flow: ${flow}` })
    return p
  }, [patient, age, data.height, data.weight, data.heart_rate, data.flow])

  // Parse conclusions into numbered items
  const conclusionItems = useMemo(() => {
    const raw = (String(data.conclusions ?? '')).trim()
    if (!raw) return []
    // Try JSON array first
    try {
      const parsed = JSON.parse(raw)
      if (Array.isArray(parsed)) return parsed.filter((s: string) => s && s.trim())
    } catch { /* not JSON */ }
    // Split on numbered prefixes (1. 2. etc.) — handles mid-sentence line wraps
    const numbered = raw.split(/\n(?=\d+[\.\)]\s)/)
    if (numbered.length > 1) {
      return numbered
        .map((s: string) => s.replace(/^\d+[\.\)]\s*/, '').replace(/\s*\n\s*/g, ' ').trim())
        .filter((s: string) => s)
    }
    // Fallback: plain newline split
    return raw.split('\n').map((s: string) => s.trim()).filter((s: string) => s)
  }, [data.conclusions])

  return (
    <div className="space-y-4 py-4">
      {/* Conclusions — numbered list at the top */}
      {conclusionItems.length > 0 && (
        <div className="rounded-2xl border border-[hsl(var(--stroke-soft)/0.72)] bg-[hsl(var(--card))] overflow-hidden">
          <div className="border-b border-[hsl(var(--stroke-soft)/0.5)] bg-[hsl(var(--tone-neutral-50))] px-5 py-2.5">
            <h3 className="text-sm font-semibold tracking-tight text-[hsl(var(--foreground))]">Conclusions</h3>
          </div>
          <ol className="divide-y divide-[hsl(var(--stroke-soft)/0.3)]">
            {conclusionItems.map((item: string, i: number) => (
              <li key={i} className="flex gap-3.5 px-5 py-3">
                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[hsl(var(--tone-danger-100))] text-[11px] font-bold text-[hsl(var(--tone-danger-700))]">
                  {i + 1}
                </span>
                <span className="text-sm leading-relaxed text-[hsl(var(--foreground))]">{item}</span>
              </li>
            ))}
          </ol>
        </div>
      )}

      <CmrParameterTable
        canonicalParams={resolved.parameters}
        measurements={measurements}
        editable
        onValueChange={handleMeasurementChange}
        demographics={pills}
        papMode={papMode}
        onPapChange={setPapMode}
      />
      <ChamberDescriptorCard data={data} onFieldChange={handleFieldChange} />
      <ValveSeveritiesCard data={data} measurements={measurements} onFieldChange={handleFieldChange} />
      <DescriptorCardsInline data={data} onFieldChange={handleFieldChange} />

      {/* Study context — editable */}
      <ToggleBox label="Study context" defaultOpen={false}>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {[
            { key: 'date_cmr', label: 'Study date', type: 'date' },
            { key: 'height', label: 'Height (cm)' },
            { key: 'weight', label: 'Weight (kg)' },
            { key: 'heart_rate', label: 'Heart rate (bpm)' },
            { key: 'indication', label: 'Indication' },
            { key: 'contrast', label: 'Contrast' },
            { key: 'stress', label: 'Stress' },
            { key: 'flow', label: 'Flow' },
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

      {/* Classification note toggle box */}
      {Boolean(data.classification_note) && String(data.classification_note).trim() && (
        <ToggleBox label="Classification note" defaultOpen={false}>
          <div className="rounded-md border border-[hsl(var(--stroke-soft)/0.72)] bg-[hsl(var(--tone-neutral-50))] px-3 py-2 text-sm whitespace-pre-wrap">
            {String(data.classification_note)}
          </div>
        </ToggleBox>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Toggle box (collapsible)
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
          viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
        >
          <path d="M6 4l4 4-4 4" />
        </svg>
        {label}
      </button>
      {open && <div className="border-t border-[hsl(var(--stroke-soft)/0.4)] px-4 py-3">{children}</div>}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export default function ExtractPatientCmr() {
  const { patient, reload: reloadPatient } = usePatientContext()
  const hn = patient?.hn ?? ''

  const [records, setRecords] = useState<CmrRecord[]>([])
  const [loading, setLoading] = useState(true)
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [isCreating, setIsCreating] = useState(false)
  const [editRecord, setEditRecord] = useState<Partial<CmrRecord> | null>(null)
  const [editMode, setEditMode] = useState(false)
  const { openMenu, MenuPortal } = useRecordContextMenu()

  const loadRecords = useCallback(() => {
    if (!hn) return
    setLoading(true)
    void fetchRecords('cmr', { hn })
      .then((data) => {
        const arr = Array.isArray(data) ? data : (data as { items?: unknown[] }).items ?? []
        setRecords(arr as CmrRecord[])
      })
      .catch(() => setRecords([]))
      .finally(() => setLoading(false))
  }, [hn])

  useEffect(() => {
    loadRecords()
  }, [loadRecords])

  const handleRowClick = (rec: CmrRecord) => {
    if (expandedId === rec.id) {
      setExpandedId(null)
      setEditRecord(null)
      setEditMode(false)
    } else {
      setIsCreating(false)
      setExpandedId(rec.id)
      setEditMode(false)
      void fetchRecord('cmr', rec.id)
        .then((full) => setEditRecord(full as CmrRecord))
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
    await deleteRecord('cmr', id)
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
          CMR Records
        </h2>
        <button
          type="button"
          onClick={handleAddNew}
          className="inline-flex items-center gap-1.5 rounded-md bg-[hsl(var(--tone-accent-600))] px-4 py-2 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-[hsl(var(--tone-accent-700))]"
        >
          <Plus className="h-4 w-4" />
          Add CMR Record
        </button>
      </div>

      {/* New record form */}
      {isCreating && (
        <div className="rounded-lg border-2 border-dashed border-[hsl(var(--tone-accent-300))] bg-[hsl(var(--tone-accent-50)/0.3)] px-5">
          <CmrRecordDetail
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
            No CMR records found for this patient.
          </p>
        </div>
      ) : (
        <div className="overflow-hidden rounded-2xl border border-[hsl(var(--stroke-soft)/0.72)] bg-[hsl(var(--card))] text-sm">
          {/* Header row — CSS grid */}
          <div
            className="grid border-b-2 border-[hsl(var(--tone-neutral-300))] bg-[hsl(var(--tone-neutral-50))]"
            style={{ gridTemplateColumns: '2rem 1fr 1fr 0.85fr 1.5fr 1.5fr 56px' }}
          >
            <div />
            {['Date', 'PH probability', 'Flow', 'Primary Dx', 'Secondary Dx'].map((label, i) => (
              <div key={label} className={cn('flex items-center px-4 py-2.5 font-semibold text-[hsl(var(--tone-neutral-700))]', i === 0 ? 'justify-start' : 'justify-center')}>
                {label}
              </div>
            ))}
            <SourceFileHeaderCell />
          </div>
          {/* Data rows */}
          {records.map((rec) => {
            const handleRowFieldChange = (key: string, value: string) => {
              setRecords((prev) => prev.map((r) => r.id === rec.id ? { ...r, [key]: value } as CmrRecord : r))
              void updateRecord('cmr', rec.id, { [key]: value })
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
                  style={{ gridTemplateColumns: '2rem 1fr 1fr 0.85fr 1.5fr 1.5fr 56px' }}
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
                      value={toDateInputValue(rec.date_cmr)}
                      onChange={(e) => handleRowFieldChange('date_cmr', e.target.value)}
                      className="house-input rounded-lg text-xs py-1.5 px-2.5 w-full"
                    />
                  </div>
                  <div className="flex items-center justify-center px-4 py-2.5">
                    <EditablePill label="" value={rec.ph || ''} options={PH_PROB_OPTIONS} onChange={(v) => handleRowFieldChange('ph', v)} allowFreeText />
                  </div>
                  <div className="flex items-center justify-center px-4 py-2.5">
                    <EditablePill label="" value={rec.flow || ''} options={CMR_FLOW_OPTIONS} onChange={(v) => handleRowFieldChange('flow', v)} />
                  </div>
                  <div className="flex items-center justify-center px-4 py-2.5">
                    <EditablePill label="" value={rec.primary_dx || ''} options={PRIMARY_DX_OPTIONS} onChange={(v) => handleRowFieldChange('primary_dx', v)} allowFreeText />
                  </div>
                  <div className="flex items-center justify-center px-4 py-2.5">
                    <EditablePill label="" value={rec.secondary_dx || ''} options={[]} onChange={(v) => handleRowFieldChange('secondary_dx', v)} allowFreeText />
                  </div>
                  <SourceFileCell modality="cmr" recordId={rec.id} />
                </div>
                {expandedId === rec.id && editRecord && (
                  <div className="border-t border-[hsl(var(--stroke-soft)/0.4)] px-5 bg-[hsl(var(--tone-neutral-50)/0.3)]">
                    <CmrRecordReadOnly
                      record={editRecord as CmrRecord}
                      onFieldUpdated={(key, value) => {
                        setRecords((prev) => prev.map((r) => r.id === rec.id ? { ...r, [key]: value } as CmrRecord : r))
                      }}
                    />
                  </div>
                )}
              </Fragment>
            )
          })}
        </div>
      )}
      {MenuPortal}
    </div>
  )
}
