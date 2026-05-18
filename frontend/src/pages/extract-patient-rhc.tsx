import { Fragment, useCallback, useEffect, useRef, useState } from 'react'
import { Plus, Save, Loader2, X } from 'lucide-react'

import { fetchRecords, fetchRecord, createRecord, updateRecord, deleteRecord } from '@/lib/extract-api'
import { cn } from '@/lib/utils'
import { usePatientContext } from './extract-patient-detail-page'
import { ParameterTable, type ParameterSection, type DemographicPill } from '@/components/extract/parameter-table'
import { useRecordContextMenu, DeleteMenuItem } from '@/components/extract/record-context-menu'
import { SourceFileCell, SourceFileHeaderCell } from '@/components/extract/source-file-cell'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type RhcRecord = {
  id: string
  hn: string
  // Procedure Info
  date_rhc: string
  height: number | null
  weight: number | null
  source_file: string
  // Right Atrial
  ra_mean: number | null
  ra_a: number | null
  ra_v: number | null
  ra_o2_sat: number | null
  // Right Ventricular
  rv_systolic: number | null
  rv_diastolic: number | null
  rv_mean: number | null
  rv_o2_sat: number | null
  // Pulmonary Artery
  pa_systolic: number | null
  pa_diastolic: number | null
  pa_mean: number | null
  pa_o2_sat: number | null
  // Pulmonary Capillary Wedge
  pcwp_mean: number | null
  pcwp_a: number | null
  pcwp_v: number | null
  pcwp_o2_sat: number | null
  // Aorta
  aorta_systolic: number | null
  aorta_diastolic: number | null
  aorta_mean: number | null
  aorta_o2_sat: number | null
  // Left Ventricle
  lv_systolic: number | null
  lv_diastolic: number | null
  lv_mean: number | null
  lv_o2_sat: number | null
  // Cardiac Function
  cardiac_output: number | null
  cardiac_index: number | null
  pvr_wu: number | null
  pvr_dyn: number | null
  tpg: number | null
  // Comments
  rhc_comments: string
  raw_text: string
  // Meta
  status: string
  status_date: string
  created_at: string
}

const EMPTY_RHC: Omit<RhcRecord, 'id' | 'created_at'> = {
  hn: '',
  date_rhc: '',
  height: null,
  weight: null,
  source_file: '',
  ra_mean: null,
  ra_a: null,
  ra_v: null,
  ra_o2_sat: null,
  rv_systolic: null,
  rv_diastolic: null,
  rv_mean: null,
  rv_o2_sat: null,
  pa_systolic: null,
  pa_diastolic: null,
  pa_mean: null,
  pa_o2_sat: null,
  pcwp_mean: null,
  pcwp_a: null,
  pcwp_v: null,
  pcwp_o2_sat: null,
  aorta_systolic: null,
  aorta_diastolic: null,
  aorta_mean: null,
  aorta_o2_sat: null,
  lv_systolic: null,
  lv_diastolic: null,
  lv_mean: null,
  lv_o2_sat: null,
  cardiac_output: null,
  cardiac_index: null,
  pvr_wu: null,
  pvr_dyn: null,
  tpg: null,
  rhc_comments: '',
  raw_text: '',
  status: 'Pending',
  status_date: '',
}

// ---------------------------------------------------------------------------
// RHC reference range sections
// ---------------------------------------------------------------------------

const RHC_SECTIONS: ParameterSection[] = [
  {
    title: 'Pulmonary haemodynamics',
    params: [
      { key: 'pa_systolic', label: 'PA systolic pressure', unit: 'mmHg', ll: 15, mean: 22, ul: 30, direction: 'high', decimalPlaces: 0, subsection: 'Pulmonary artery pressures', interpretations: ['Normal', 'Mildly elevated PA pressure', 'Moderate PA hypertension', 'Severe PA hypertension'] },
      { key: 'pa_diastolic', label: 'PA diastolic pressure', unit: 'mmHg', ll: 4, mean: 8, ul: 12, direction: 'high', decimalPlaces: 0, interpretations: ['Normal', 'Mildly elevated', 'Elevated diastolic PA pressure', 'Markedly elevated'] },
      { key: 'pa_mean', label: 'PA mean pressure', unit: 'mmHg', ll: 10, mean: 15, ul: 20, direction: 'high', decimalPlaces: 0, interpretations: ['Normal', 'Borderline PH', 'PH', 'Severe PH'] },
      { key: 'pcwp_mean', label: 'PCWP mean', unit: 'mmHg', ll: 6, mean: 9, ul: 12, direction: 'high', decimalPlaces: 0, subsection: 'Wedge pressure', interpretations: ['Normal', 'Mildly elevated wedge', 'Elevated \u2192 post-capillary', 'Markedly elevated wedge'] },
      { key: 'pcwp_a', label: 'PCWP a-wave', unit: 'mmHg', ll: 4, mean: 8, ul: 14, direction: 'high', decimalPlaces: 0, interpretations: ['Normal', 'Mildly elevated', 'Elevated a-wave', 'Markedly elevated'] },
      { key: 'pcwp_v', label: 'PCWP v-wave', unit: 'mmHg', ll: 6, mean: 10, ul: 16, direction: 'high', decimalPlaces: 0, interpretations: ['Normal', 'Mildly prominent v-wave', 'Prominent v-wave', 'Giant v-wave (\u2192 MR)'] },
      { key: 'pvr_wu', label: 'Pulmonary vascular resistance', unit: 'WU', ll: 0.3, mean: 1.0, ul: 2.0, direction: 'high', decimalPlaces: 1, subsection: 'Resistance and gradients', interpretations: ['Normal', 'Mildly elevated', 'Moderately elevated', 'Severely elevated'] },
      { key: 'pvr_dyn', label: 'Pulmonary vascular resistance', unit: 'dyn\u00B7s\u00B7cm\u207B\u2075', ll: 25, mean: 80, ul: 160, direction: 'high', decimalPlaces: 0, interpretations: ['Normal', 'Mildly elevated', 'Moderately elevated', 'Severely elevated'] },
      { key: 'tpg', label: 'Transpulmonary gradient', unit: 'mmHg', ll: 4, mean: 8, ul: 12, direction: 'high', decimalPlaces: 0, interpretations: ['Normal', 'Mildly elevated', 'Pre-capillary component', 'Significant pre-capillary gradient'] },
    ],
  },
  {
    title: 'Cardiac function',
    params: [
      { key: 'cardiac_output', label: 'Cardiac output', unit: 'L/min', ll: 4.0, mean: 6.0, ul: 8.0, direction: 'low', decimalPlaces: 1, subsection: 'Output and index', interpretations: ['Normal', 'Mildly reduced output', 'Low cardiac output', 'Critically low output'] },
      { key: 'cardiac_index', label: 'Cardiac index', unit: 'L/min/m\u00B2', ll: 2.5, mean: 3.2, ul: 4.0, direction: 'low', decimalPlaces: 1, indexed: true, interpretations: ['Normal', 'Mildly impaired', 'Impaired', 'Severely impaired'] },
    ],
  },
  {
    title: 'Right heart pressures',
    params: [
      { key: 'ra_mean', label: 'RA mean pressure', unit: 'mmHg', ll: 1, mean: 3, ul: 5, direction: 'high', decimalPlaces: 0, subsection: 'Right atrium', interpretations: ['Normal', 'Mildly elevated RA pressure', 'Elevated RA \u2192 RV compromise', 'Markedly elevated \u2192 RV failure'] },
      { key: 'ra_a', label: 'RA a-wave', unit: 'mmHg', ll: 2, mean: 6, ul: 10, direction: 'high', decimalPlaces: 0, interpretations: ['Normal', 'Mildly elevated', 'Elevated \u2192 reduced compliance', 'Markedly elevated'] },
      { key: 'ra_v', label: 'RA v-wave', unit: 'mmHg', ll: 2, mean: 6, ul: 10, direction: 'high', decimalPlaces: 0, interpretations: ['Normal', 'Mildly prominent', 'Prominent \u2192 consider TR', 'Giant v-wave \u2192 severe TR'] },
      { key: 'rv_systolic', label: 'RV systolic pressure', unit: 'mmHg', ll: 15, mean: 22, ul: 30, direction: 'high', decimalPlaces: 0, subsection: 'Right ventricle', interpretations: ['Normal', 'Mildly elevated', 'RV pressure overload', 'Severe RV pressure overload'] },
      { key: 'rv_diastolic', label: 'RV end-diastolic pressure', unit: 'mmHg', ll: 0, mean: 4, ul: 8, direction: 'high', decimalPlaces: 0, interpretations: ['Normal', 'Mildly elevated', 'Elevated \u2192 RV stiffness', 'Restrictive RV physiology'] },
      { key: 'rv_mean', label: 'RV mean pressure', unit: 'mmHg', ll: 4, mean: 10, ul: 16, direction: 'high', decimalPlaces: 0, interpretations: ['Normal', 'Mildly elevated', 'Elevated', 'Markedly elevated'] },
    ],
  },
  {
    title: 'Systemic pressures',
    params: [
      { key: 'aorta_systolic', label: 'Aortic systolic pressure', unit: 'mmHg', ll: 90, mean: 120, ul: 140, direction: 'both', decimalPlaces: 0, subsection: 'Aorta', interpretations: ['Normal', 'Borderline hypertensive', 'Hypertensive', 'Severe hypertension'] },
      { key: 'aorta_diastolic', label: 'Aortic diastolic pressure', unit: 'mmHg', ll: 60, mean: 75, ul: 90, direction: 'both', decimalPlaces: 0, interpretations: ['Normal', 'Borderline', 'Elevated', 'Markedly elevated'] },
      { key: 'aorta_mean', label: 'Aortic mean pressure', unit: 'mmHg', ll: 70, mean: 90, ul: 105, direction: 'both', decimalPlaces: 0, interpretations: ['Normal', 'Borderline', 'Elevated MAP', 'Markedly elevated MAP'] },
      { key: 'lv_systolic', label: 'LV systolic pressure', unit: 'mmHg', ll: 90, mean: 120, ul: 140, direction: 'both', decimalPlaces: 0, subsection: 'Left ventricle', interpretations: ['Normal', 'Borderline', 'Elevated', 'Markedly elevated'] },
      { key: 'lv_diastolic', label: 'LV end-diastolic pressure', unit: 'mmHg', ll: 3, mean: 8, ul: 12, direction: 'high', decimalPlaces: 0, interpretations: ['Normal', 'Mildly elevated LVEDP', 'Elevated \u2192 diastolic dysfunction', 'Markedly elevated LVEDP'] },
      { key: 'lv_mean', label: 'LV mean pressure', unit: 'mmHg', ll: 3, mean: 6, ul: 12, direction: 'high', decimalPlaces: 0, interpretations: ['Normal', 'Mildly elevated', 'Elevated', 'Markedly elevated'] },
    ],
  },
  {
    title: 'Oximetry',
    params: [
      { key: 'pa_o2_sat', label: 'PA oxygen saturation', unit: '%', ll: 65, mean: 72, ul: 80, direction: 'low', decimalPlaces: 0, subsection: 'Pulmonary', interpretations: ['Normal', 'Mildly desaturated', 'Low mixed venous O\u2082', 'Severely desaturated'] },
      { key: 'pcwp_o2_sat', label: 'PCWP oxygen saturation', unit: '%', ll: 95, mean: 97, ul: 100, direction: 'low', decimalPlaces: 0, interpretations: ['Normal', 'Mildly desaturated', 'Desaturated', 'Severely desaturated'] },
      { key: 'ra_o2_sat', label: 'RA oxygen saturation', unit: '%', ll: 65, mean: 72, ul: 80, direction: 'low', decimalPlaces: 0, subsection: 'Right heart', interpretations: ['Normal', 'Mildly reduced', 'Low \u2192 reduced delivery', 'Severely reduced'] },
      { key: 'rv_o2_sat', label: 'RV oxygen saturation', unit: '%', ll: 65, mean: 72, ul: 80, direction: 'low', decimalPlaces: 0, interpretations: ['Normal', 'Mildly reduced', 'Low mixed venous O\u2082', 'Severely reduced'] },
      { key: 'aorta_o2_sat', label: 'Aortic oxygen saturation', unit: '%', ll: 95, mean: 97, ul: 100, direction: 'low', decimalPlaces: 0, subsection: 'Systemic', interpretations: ['Normal', 'Mild hypoxaemia', 'Hypoxaemia', 'Severe hypoxaemia'] },
      { key: 'lv_o2_sat', label: 'LV oxygen saturation', unit: '%', ll: 95, mean: 97, ul: 100, direction: 'low', decimalPlaces: 0, interpretations: ['Normal', 'Mild hypoxaemia', 'Hypoxaemia', 'Severe hypoxaemia'] },
    ],
  },
]

// ---------------------------------------------------------------------------
// RHC record detail (parameter table + metadata)
// ---------------------------------------------------------------------------

function RhcRecordDetail({
  record,
  hn,
  isNew,
  onSaved,
  onCancel,
}: {
  record: Partial<RhcRecord>
  hn: string
  isNew: boolean
  onSaved: () => void
  onCancel: () => void
}) {
  const [form, setForm] = useState<Record<string, unknown>>({ ...EMPTY_RHC, hn, ...record })
  const [saving, setSaving] = useState(false)

  const handleValueChange = useCallback((key: string, value: number | null) => {
    setForm((prev) => ({ ...prev, [key]: value }))
  }, [])

  const handleSave = async () => {
    setSaving(true)
    try {
      if (isNew) {
        await createRecord('rhc', form)
      } else {
        await updateRecord('rhc', record.id!, form)
      }
      onSaved()
    } catch {
      // keep form on failure
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="space-y-4 py-4">
      {/* Date (only shown for new records) */}
      {isNew && (
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div>
          <label className="block text-xs font-medium text-[hsl(var(--muted-foreground))] mb-1.5">Date</label>
          <input
            type="date"
            value={(form.date_rhc as string) ?? ''}
            onChange={(e) => setForm((prev) => ({ ...prev, date_rhc: e.target.value }))}
            className="house-input rounded-lg w-full text-xs py-1.5 px-2.5"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-[hsl(var(--muted-foreground))] mb-1.5">Status</label>
          <select
            value={(form.status as string) ?? 'Pending'}
            onChange={(e) => setForm((prev) => ({ ...prev, status: e.target.value }))}
            className="house-input rounded-lg w-full text-xs py-1.5 px-2.5"
          >
            <option value="Pending">Pending</option>
            <option value="Reviewed">Reviewed</option>
            <option value="Archived">Archived</option>
          </select>
        </div>
        <div>
          <label className="block text-xs font-medium text-[hsl(var(--muted-foreground))] mb-1.5">Height (cm)</label>
          <input
            type="number"
            value={(form.height as number | null) ?? ''}
            onChange={(e) => setForm((prev) => ({ ...prev, height: e.target.value === '' ? null : Number(e.target.value) }))}
            className="house-input rounded-lg w-full text-xs py-1.5 px-2.5"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-[hsl(var(--muted-foreground))] mb-1.5">Weight (kg)</label>
          <input
            type="number"
            value={(form.weight as number | null) ?? ''}
            onChange={(e) => setForm((prev) => ({ ...prev, weight: e.target.value === '' ? null : Number(e.target.value) }))}
            className="house-input rounded-lg w-full text-xs py-1.5 px-2.5"
          />
        </div>
      </div>
      )}

      {/* Parameter table */}
      <ParameterTable
        sections={RHC_SECTIONS}
        data={form}
        editable
        onValueChange={handleValueChange}
      />

      {/* Comments section */}
      <div className="flex flex-col gap-4">
        <div>
          <label className="block text-xs font-medium text-[hsl(var(--muted-foreground))] mb-1.5">RHC Comments</label>
          <textarea
            value={(form.rhc_comments as string) ?? ''}
            onChange={(e) => setForm((prev) => ({ ...prev, rhc_comments: e.target.value }))}
            rows={4}
            className="house-input w-full text-sm resize-y"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-[hsl(var(--muted-foreground))] mb-1.5">Raw Text</label>
          <textarea
            value={(form.raw_text as string) ?? ''}
            readOnly={!isNew}
            onChange={(e) => setForm((prev) => ({ ...prev, raw_text: e.target.value }))}
            rows={4}
            className={cn(
              'house-input w-full text-sm resize-y',
              !isNew && 'bg-[hsl(var(--tone-neutral-50))] cursor-not-allowed',
            )}
          />
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
// Read-only parameter table view (for collapsed detail)
// ---------------------------------------------------------------------------

function buildDemographics(record: RhcRecord, patient: Record<string, unknown> | null): DemographicPill[] {
  const pills: DemographicPill[] = []
  // Gender from patient
  if (patient?.gender) pills.push({ label: String(patient.gender) })
  // Age from patient DOB + record date
  if (patient?.dob && record.date_rhc) {
    const dob = new Date(String(patient.dob))
    const study = new Date(record.date_rhc)
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
// PH haemodynamic classification (ESC/ERS 2022 criteria)
// ---------------------------------------------------------------------------

type PhClassification = {
  label: string
  description: string
  tone: 'normal' | 'warning' | 'danger' | 'neutral'
  criteria: { name: string; value: string; met: boolean }[]
  severity: { label: string; met: boolean }[]
}

function classifyPh(record: RhcRecord): PhClassification | null {
  const paMean = record.pa_mean != null ? Number(record.pa_mean) : null
  const pcwp = record.pcwp_mean != null ? Number(record.pcwp_mean) : null
  const pvr = record.pvr_wu != null ? Number(record.pvr_wu) : null
  const ci = record.cardiac_index != null ? Number(record.cardiac_index) : null
  const raMean = record.ra_mean != null ? Number(record.ra_mean) : null

  // Need at minimum PA mean to classify
  if (paMean === null || isNaN(paMean)) return null

  const criteria = [
    { name: 'PA mean', value: paMean != null ? `${Math.round(paMean)} mmHg` : '\u2014', met: paMean > 20 },
    { name: 'PCWP', value: pcwp != null ? `${Math.round(pcwp)} mmHg` : '\u2014', met: pcwp != null },
    { name: 'PVR', value: pvr != null ? `${pvr.toFixed(1)} WU` : '\u2014', met: pvr != null },
  ]

  const severity = [
    { label: 'Impaired cardiac index', met: ci != null && ci < 2.5 },
    { label: 'Elevated RA pressure', met: raMean != null && raMean > 8 },
    { label: 'Severe PVR elevation', met: pvr != null && pvr > 5 },
  ]

  // No PH
  if (paMean <= 20) {
    return {
      label: 'No pulmonary hypertension',
      description: 'PA mean pressure is within normal limits.',
      tone: 'normal',
      criteria,
      severity: [],
    }
  }

  // PH present — classify phenotype
  if (pcwp != null && pvr != null) {
    if (pcwp <= 15 && pvr > 2) {
      return {
        label: 'Pre-capillary pulmonary hypertension',
        description: 'Elevated PA mean with normal wedge pressure and elevated PVR, consistent with pre-capillary PH (WHO Group 1, 3, 4, or 5).',
        tone: 'danger',
        criteria,
        severity,
      }
    }
    if (pcwp > 15 && pvr <= 2) {
      return {
        label: 'Isolated post-capillary pulmonary hypertension',
        description: 'Elevated PA mean with elevated wedge pressure and normal PVR, consistent with isolated post-capillary PH (IpcPH, WHO Group 2).',
        tone: 'warning',
        criteria,
        severity,
      }
    }
    if (pcwp > 15 && pvr > 2) {
      return {
        label: 'Combined pre- and post-capillary pulmonary hypertension',
        description: 'Elevated PA mean with elevated wedge pressure and elevated PVR, consistent with combined pre- and post-capillary PH (CpcPH).',
        tone: 'danger',
        criteria,
        severity,
      }
    }
    // PA mean > 20, PCWP ≤ 15, PVR ≤ 2
    return {
      label: 'Elevated PA pressure',
      description: 'PA mean is elevated but PVR is not above threshold. Consider exercise haemodynamics or borderline pre-capillary physiology.',
      tone: 'warning',
      criteria,
      severity,
    }
  }

  // Incomplete data — can only say PA mean is elevated
  return {
    label: 'Elevated PA mean pressure',
    description: pcwp == null && pvr == null
      ? 'PA mean is elevated. PCWP and PVR are required for haemodynamic phenotyping.'
      : pcwp == null
        ? 'PA mean is elevated. PCWP is required for haemodynamic phenotyping.'
        : 'PA mean is elevated. PVR is required for haemodynamic phenotyping.',
    tone: 'warning',
    criteria,
    severity: [],
  }
}

const TONE_STYLES = {
  normal: {
    bg: 'bg-[hsl(158_30%_94%)]',
    border: 'border-[hsl(158_30%_80%)]',
    accent: 'text-[hsl(164_30%_28%)]',
    badge: 'bg-[hsl(162_22%_90%)] text-[hsl(164_30%_28%)] ring-[hsl(163_22%_80%)]',
  },
  warning: {
    bg: 'bg-[hsl(46_60%_95%)]',
    border: 'border-[hsl(38_50%_78%)]',
    accent: 'text-[hsl(34_50%_30%)]',
    badge: 'bg-[hsl(38_40%_90%)] text-[hsl(34_50%_35%)] ring-[hsl(36_36%_80%)]',
  },
  danger: {
    bg: 'bg-[hsl(4_45%_95%)]',
    border: 'border-[hsl(4_40%_80%)]',
    accent: 'text-[hsl(4_50%_30%)]',
    badge: 'bg-[hsl(2_52%_25%)] text-white ring-[hsl(2_52%_20%)]',
  },
  neutral: {
    bg: 'bg-[hsl(var(--tone-neutral-50))]',
    border: 'border-[hsl(var(--stroke-soft)/0.72)]',
    accent: 'text-[hsl(var(--foreground))]',
    badge: 'bg-[hsl(var(--tone-neutral-200))] text-[hsl(var(--tone-neutral-700))] ring-[hsl(var(--tone-neutral-300))]',
  },
}

// ---------------------------------------------------------------------------
// Read-only view
// ---------------------------------------------------------------------------

function RhcRecordReadOnly({ record, patient, onFieldUpdated }: { record: RhcRecord; patient: Record<string, unknown> | null; onFieldUpdated?: (key: string, value: unknown) => void }) {
  const [data, setData] = useState<Record<string, unknown>>(record as unknown as Record<string, unknown>)
  const saveTimer = useRef<ReturnType<typeof setTimeout>>()
  const demographics = buildDemographics(record, patient)
  const phResult = classifyPh(record)

  const handleValueChange = useCallback((key: string, value: number | null) => {
    const strVal = value !== null ? String(value) : ''
    setData((prev) => ({ ...prev, [key]: strVal }))
    onFieldUpdated?.(key, strVal)
    if (saveTimer.current) clearTimeout(saveTimer.current)
    saveTimer.current = setTimeout(() => {
      void updateRecord('rhc', record.id, { [key]: strVal })
    }, 600)
  }, [record.id, onFieldUpdated])

  const handleFieldChange = useCallback((key: string, value: string) => {
    setData((prev) => ({ ...prev, [key]: value }))
    onFieldUpdated?.(key, value)
    if (saveTimer.current) clearTimeout(saveTimer.current)
    saveTimer.current = setTimeout(() => {
      void updateRecord('rhc', record.id, { [key]: value })
    }, 600)
  }, [record.id, onFieldUpdated])

  return (
    <div className="space-y-4 py-4">
      {/* Demographics + PH classification on one line */}
      <div className="flex flex-wrap items-center gap-2">
        {demographics.map((d) => (
          <span
            key={d.label}
            className="inline-flex items-center rounded-full border border-[hsl(var(--tone-neutral-300))] bg-white px-3 py-1 text-[0.8rem] font-medium text-[hsl(var(--foreground))]"
          >
            {d.label}
          </span>
        ))}
        {phResult && (
          <>
            <div className="flex-1" />
            <span className={cn(
              'inline-flex items-center gap-2 rounded-full px-3.5 py-1 text-[0.8rem] font-semibold ring-1 ring-inset',
              TONE_STYLES[phResult.tone].badge,
            )}>
              {phResult.label}
              {phResult.criteria.some((c) => c.value !== '\u2014') && (
                <span className="font-normal opacity-80">
                  ({phResult.criteria.filter((c) => c.value !== '\u2014').map((c) => `${c.name} ${c.value}`).join(' \u00B7 ')})
                </span>
              )}
            </span>
          </>
        )}
      </div>

      <ParameterTable
        sections={RHC_SECTIONS}
        data={data}
        editable
        onValueChange={handleValueChange}
      />

      {/* Study context — editable */}
      <ToggleBox label="Study context" defaultOpen={false}>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {[
            { key: 'date_rhc', label: 'Study date', type: 'date' },
            { key: 'height', label: 'Height (cm)' },
            { key: 'weight', label: 'Weight (kg)' },
          ].map((f) => (
            <div key={f.key}>
              <label className="block text-xs font-medium text-[hsl(var(--muted-foreground))] mb-1.5">{f.label}</label>
              <input
                type={f.type === 'date' ? 'date' : 'text'}
                value={String(data[f.key] ?? '')}
                onChange={(e) => handleFieldChange(f.key, e.target.value)}
                className="house-input rounded-lg w-full text-xs py-1.5 px-2.5"
              />
            </div>
          ))}
        </div>
      </ToggleBox>

      {/* Comments (read-only, collapsible) */}
      {record.rhc_comments && (
        <ToggleBox label="RHC comments" defaultOpen={false}>
          <div className="rounded-md border border-[hsl(var(--stroke-soft)/0.72)] bg-[hsl(var(--tone-neutral-50))] px-3 py-2 text-sm whitespace-pre-wrap">
            {record.rhc_comments}
          </div>
        </ToggleBox>
      )}
      {record.raw_text && (
        <ToggleBox label="Raw text" defaultOpen={false}>
          <div className="rounded-md border border-[hsl(var(--stroke-soft)/0.72)] bg-[hsl(var(--tone-neutral-50))] px-3 py-2 text-sm whitespace-pre-wrap">
            {record.raw_text}
          </div>
        </ToggleBox>
      )}
    </div>
  )
}

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
// Main component
// ---------------------------------------------------------------------------

export default function ExtractPatientRhc() {
  const { patient, reload: reloadPatient } = usePatientContext()
  const hn = patient?.hn ?? ''

  const [records, setRecords] = useState<RhcRecord[]>([])
  const [loading, setLoading] = useState(true)
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [isCreating, setIsCreating] = useState(false)
  const [editRecord, setEditRecord] = useState<Partial<RhcRecord> | null>(null)
  const [editMode, setEditMode] = useState(false)
  const { openMenu, MenuPortal } = useRecordContextMenu()

  const loadRecords = useCallback(() => {
    if (!hn) return
    setLoading(true)
    void fetchRecords('rhc', { hn })
      .then((data) => {
        const arr = Array.isArray(data) ? data : (data as { items?: unknown[] }).items ?? []
        setRecords(arr as RhcRecord[])
      })
      .catch(() => setRecords([]))
      .finally(() => setLoading(false))
  }, [hn])

  useEffect(() => {
    loadRecords()
  }, [loadRecords])

  const handleRowClick = (rec: RhcRecord) => {
    if (expandedId === rec.id) {
      setExpandedId(null)
      setEditRecord(null)
      setEditMode(false)
    } else {
      setIsCreating(false)
      setExpandedId(rec.id)
      setEditMode(false)
      // Load full record detail
      void fetchRecord('rhc', rec.id)
        .then((full) => setEditRecord(full as RhcRecord))
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
    await deleteRecord('rhc', id)
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
          RHC Records
        </h2>
        <button
          type="button"
          onClick={handleAddNew}
          className="inline-flex items-center gap-1.5 rounded-md bg-[hsl(var(--tone-accent-600))] px-4 py-2 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-[hsl(var(--tone-accent-700))]"
        >
          <Plus className="h-4 w-4" />
          Add RHC Record
        </button>
      </div>

      {/* New record form */}
      {isCreating && (
        <div className="rounded-lg border-2 border-dashed border-[hsl(var(--tone-accent-300))] bg-[hsl(var(--tone-accent-50)/0.3)] px-5">
          <RhcRecordDetail
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
            No RHC records found for this patient.
          </p>
        </div>
      ) : (
        <div className="overflow-hidden rounded-2xl border border-[hsl(var(--stroke-soft)/0.72)] bg-[hsl(var(--card))] text-sm">
          {/* Header row — CSS grid */}
          <div
            className="grid border-b-2 border-[hsl(var(--tone-neutral-300))] bg-[hsl(var(--tone-neutral-50))]"
            style={{ gridTemplateColumns: '2rem repeat(5, 1fr) 56px' }}
          >
            <div />
            {[
              { label: 'Date' },
              { label: 'PH class' },
              { label: 'PA mean', unit: 'mmHg' },
              { label: 'PCWP', unit: 'mmHg' },
              { label: 'PVR', unit: 'WU' },
            ].map((h, i) => (
              <div key={h.label} className={cn('flex items-center gap-1.5 px-4 py-2.5 font-semibold text-[hsl(var(--tone-neutral-700))]', i === 0 ? 'justify-start' : 'justify-center')}>
                <span>{h.label}</span>
                {h.unit && <span className="font-normal text-xs text-[hsl(var(--tone-neutral-400))]">{h.unit}</span>}
              </div>
            ))}
            <SourceFileHeaderCell />
          </div>
          {/* Data rows */}
          {records.map((rec) => {
            const phResult = classifyPh(rec)
            const phTone = phResult ? TONE_STYLES[phResult.tone] : null
            const PH_SHORT: Record<string, string> = {
              'No pulmonary hypertension': 'No PH',
              'Pre-capillary pulmonary hypertension': 'Pre-capillary PH',
              'Isolated post-capillary pulmonary hypertension': 'IpcPH',
              'Combined pre- and post-capillary pulmonary hypertension': 'CpcPH',
              'Elevated PA pressure': 'Elevated mPAP',
              'Elevated PA mean pressure': 'Elevated mPAP',
            }
            const handleRowFieldChange = (key: string, value: string) => {
              setRecords((prev) => prev.map((r) => r.id === rec.id ? { ...r, [key]: value } as RhcRecord : r))
              void updateRecord('rhc', rec.id, { [key]: value })
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
                    value={rec.date_rhc || ''}
                    onChange={(e) => handleRowFieldChange('date_rhc', e.target.value)}
                    className="house-input rounded-lg text-xs py-1.5 px-2.5 w-full"
                  />
                </div>
                <div className="flex items-center justify-center px-4 py-2.5">
                  {phResult && phTone && (
                    <span className={cn('inline-flex items-center rounded-full px-2.5 py-0.5 text-[11px] font-semibold ring-1 ring-inset whitespace-nowrap', phTone.badge)}>
                      {PH_SHORT[phResult.label] ?? phResult.label}
                    </span>
                  )}
                </div>
                <div className="flex items-center justify-center px-4 py-2.5 tabular-nums font-semibold">{rec.pa_mean != null ? Math.round(Number(rec.pa_mean)) : '\u2014'}</div>
                <div className="flex items-center justify-center px-4 py-2.5 tabular-nums font-semibold">{rec.pcwp_mean != null ? Math.round(Number(rec.pcwp_mean)) : '\u2014'}</div>
                <div className="flex items-center justify-center px-4 py-2.5 tabular-nums font-semibold">{rec.pvr_wu != null ? Number(rec.pvr_wu).toFixed(1) : '\u2014'}</div>
                <SourceFileCell modality="rhc" recordId={rec.id} />
              </div>
              {expandedId === rec.id && editRecord && (
                <div className="p-0">
                      <div className="border-t border-[hsl(var(--stroke-soft)/0.4)] px-5 bg-[hsl(var(--tone-neutral-50)/0.3)]">
                            <RhcRecordReadOnly
                              record={editRecord as RhcRecord}
                              patient={patient as Record<string, unknown> | null}
                              onFieldUpdated={(key, value) => {
                                setRecords((prev) => prev.map((r) => r.id === rec.id ? { ...r, [key]: value } as RhcRecord : r))
                              }}
                            />
                      </div>
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
