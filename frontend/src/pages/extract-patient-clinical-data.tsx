import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import { Check, Plus, Save, Stethoscope, Trash2 } from 'lucide-react'

import { fetchClinicalData, saveClinicalData } from '@/lib/extract-api'
import { cn } from '@/lib/utils'
import { usePatientContext } from './extract-patient-detail-page'

type ConditionState = 'Known'

type AdditionalConditionRow = {
  id: string
  condition: string
  details: string
}

type MedicationRow = {
  id: string
  name: string
  route: string
  dose: string
  frequency: string
  indication: string
  commenced: string
}

type ClinicalData = {
  clinical_data_completed?: boolean
  conditions?: Record<string, ConditionState>
  additional_conditions?: AdditionalConditionRow[]
  medications?: MedicationRow[]
}

const CONDITION_GROUPS = [
  {
    title: 'Major cardiovascular conditions',
    items: [
      'Systemic hypertension',
      'Coronary artery disease',
      'Myocardial infarction',
      'Heart failure',
      'Cardiomyopathy',
      'Valvular heart disease',
      'Atrial fibrillation / flutter',
      'Other arrhythmia',
      'Congenital heart disease',
      'Peripheral vascular disease',
      'Cerebrovascular disease',
      'Venous thromboembolism',
      'Pulmonary arterial hypertension',
    ],
  },
  {
    title: 'Major respiratory conditions',
    items: [
      'COPD / emphysema',
      'Asthma',
      'Interstitial lung disease',
      'Pulmonary embolism',
      'Obstructive sleep apnoea',
      'Long-term oxygen therapy',
      'Bronchiectasis',
      'Lung cancer / previous lung resection',
    ],
  },
  {
    title: 'Important other conditions',
    items: [
      'Type 1 diabetes',
      'Type 2 diabetes',
      'Other diabetes',
      'CKD stage 1-2',
      'CKD stage 3',
      'CKD stage 4-5',
      'Dialysis / renal replacement therapy',
      'Chronic liver disease',
      'Thyroid disease',
      'Cancer / malignancy',
      'Connective tissue disease',
      'HIV',
      'Portal hypertension',
      'Sickle cell disease / haemolytic disorder',
      'Obesity',
    ],
  },
] as const

const MEDICATION_FIELDS: { key: keyof Omit<MedicationRow, 'id'>; label: string }[] = [
  { key: 'name', label: 'Medication name' },
  { key: 'route', label: 'Route' },
  { key: 'dose', label: 'Dose' },
  { key: 'frequency', label: 'Frequency' },
  { key: 'indication', label: 'Indication' },
  { key: 'commenced', label: 'Commenced' },
]

const ADDITIONAL_CONDITION_FIELDS: { key: keyof Omit<AdditionalConditionRow, 'id'>; label: string }[] = [
  { key: 'condition', label: 'Condition' },
  { key: 'details', label: 'Details' },
]

function makeRowId(prefix: string): string {
  return typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2)}`
}

function newMedicationRow(): MedicationRow {
  return {
    id: makeRowId('med'),
    name: '',
    route: '',
    dose: '',
    frequency: '',
    indication: '',
    commenced: '',
  }
}

function newAdditionalConditionRow(): AdditionalConditionRow {
  return {
    id: makeRowId('condition'),
    condition: '',
    details: '',
  }
}

function normaliseClinicalData(value: unknown): ClinicalData {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {}
  const raw = value as Record<string, unknown>
  const clinical_data_completed = Boolean(raw.clinical_data_completed)
  const conditions: Record<string, ConditionState> = {}
  if (raw.conditions && typeof raw.conditions === 'object' && !Array.isArray(raw.conditions)) {
    Object.entries(raw.conditions as Record<string, unknown>).forEach(([key, value]) => {
      if (value === 'Relevant' || value === 'Key' || value === 'Present' || value === 'Known') {
        conditions[key] = 'Known'
      }
    })
  }
  const additional_conditions = Array.isArray(raw.additional_conditions)
    ? raw.additional_conditions.map((item) => {
      const row = item && typeof item === 'object' ? item as Partial<AdditionalConditionRow> : {}
      return {
        id: String(row.id || `condition-${Math.random().toString(36).slice(2)}`),
        condition: String(row.condition ?? ''),
        details: String(row.details ?? ''),
      }
    })
    : []
  const medications = Array.isArray(raw.medications)
    ? raw.medications.map((item) => {
      const row = item && typeof item === 'object' ? item as Partial<MedicationRow> : {}
      return {
        id: String(row.id || `med-${Math.random().toString(36).slice(2)}`),
        name: String(row.name ?? ''),
        route: String(row.route ?? ''),
        dose: String(row.dose ?? ''),
        frequency: String(row.frequency ?? ''),
        indication: String(row.indication ?? ''),
        commenced: String(row.commenced ?? ''),
      }
    })
    : []
  return { clinical_data_completed, conditions, additional_conditions, medications }
}

function selectedConditions(data: ClinicalData): Record<string, ConditionState> {
  return data.conditions && typeof data.conditions === 'object' ? data.conditions : {}
}

function medications(data: ClinicalData): MedicationRow[] {
  return Array.isArray(data.medications) ? data.medications : []
}

function additionalConditions(data: ClinicalData): AdditionalConditionRow[] {
  return Array.isArray(data.additional_conditions) ? data.additional_conditions : []
}

function nextConditionState(current: ConditionState | undefined): ConditionState | '' {
  if (!current) return 'Known'
  return ''
}

function conditionBadge(state?: ConditionState): string {
  if (state === 'Known') return '✓'
  return ''
}

function Section({
  title,
  subtitle,
  action,
  children,
}: {
  title: string
  subtitle?: string
  action?: ReactNode
  children: ReactNode
}) {
  return (
    <section className="overflow-hidden rounded-lg border border-[hsl(var(--stroke-soft)/0.72)] bg-[hsl(var(--card))]">
      <div className="flex min-h-[3.25rem] items-center justify-between gap-3 border-b border-[hsl(var(--stroke-soft)/0.5)] bg-[hsl(var(--tone-neutral-50))] px-5 py-3">
        <div className="min-w-0">
          <h3 className="text-sm font-semibold tracking-tight text-[hsl(var(--foreground))]">{title}</h3>
          {subtitle && <p className="mt-1 text-xs text-[hsl(var(--muted-foreground))]">{subtitle}</p>}
        </div>
        {action && <div className="shrink-0">{action}</div>}
      </div>
      <div className="px-5 py-4">{children}</div>
    </section>
  )
}

function ConditionToggle({
  label,
  state,
  onClick,
}: {
  label: string
  state?: ConditionState
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'flex min-h-11 items-center justify-between gap-3 rounded-lg border px-3 py-2 text-left text-sm font-medium transition-colors',
        !state && 'border-[hsl(var(--stroke-soft)/0.72)] bg-white text-[hsl(var(--foreground))] hover:bg-[hsl(var(--tone-neutral-50))]',
        state === 'Known' && 'border-[hsl(163_22%_80%)] bg-[hsl(162_22%_90%)] text-[hsl(164_30%_28%)]',
      )}
    >
      <span>{label}</span>
      <span
        data-selected={conditionBadge(state) ? 'true' : 'false'}
        className={cn(
          'inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[10px] font-semibold ring-1 ring-inset',
          !state && 'bg-[hsl(var(--tone-neutral-50))] text-[hsl(var(--tone-neutral-500))] ring-[hsl(var(--tone-neutral-200))]',
          state === 'Known' && 'bg-white/70 text-[hsl(164_30%_28%)] ring-[hsl(163_22%_74%)]',
        )}
      >
        {state ? <Check className="h-3.5 w-3.5" /> : '-'}
      </span>
    </button>
  )
}

export default function ExtractPatientClinicalData() {
  const { patient } = usePatientContext()
  const hn = patient?.hn ?? ''
  const [data, setData] = useState<ClinicalData>({})
  const [loading, setLoading] = useState(true)
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle')
  const initialLoadDone = useRef(false)
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    if (!hn) return
    setLoading(true)
    initialLoadDone.current = false
    void fetchClinicalData(hn)
      .then((resp) => {
        const payload = resp as { data?: unknown }
        setData(normaliseClinicalData(payload.data))
      })
      .catch(() => setData({}))
      .finally(() => {
        setLoading(false)
        setTimeout(() => { initialLoadDone.current = true }, 100)
      })
  }, [hn])

  useEffect(() => {
    if (!initialLoadDone.current || !hn) return
    if (saveTimer.current) clearTimeout(saveTimer.current)
    saveTimer.current = setTimeout(async () => {
      setSaveStatus('saving')
      try {
        await saveClinicalData(hn, data as Record<string, unknown>)
        setSaveStatus('saved')
        setTimeout(() => setSaveStatus('idle'), 1500)
      } catch {
        setSaveStatus('error')
      }
    }, 700)
    return () => {
      if (saveTimer.current) clearTimeout(saveTimer.current)
    }
  }, [data, hn])

  const updateCondition = useCallback((label: string) => {
    setData((prev) => {
      const current = selectedConditions(prev)
      const nextState = nextConditionState(current[label])
      const next = { ...current }
      if (nextState) next[label] = nextState
      else delete next[label]
      return { ...prev, conditions: next }
    })
  }, [])

  const addAdditionalCondition = useCallback(() => {
    setData((prev) => ({
      ...prev,
      additional_conditions: [...additionalConditions(prev), newAdditionalConditionRow()],
    }))
  }, [])

  const updateAdditionalCondition = useCallback((id: string, field: keyof Omit<AdditionalConditionRow, 'id'>, value: string) => {
    setData((prev) => ({
      ...prev,
      additional_conditions: additionalConditions(prev).map((row) => row.id === id ? { ...row, [field]: value } : row),
    }))
  }, [])

  const deleteAdditionalCondition = useCallback((id: string) => {
    setData((prev) => ({
      ...prev,
      additional_conditions: additionalConditions(prev).filter((row) => row.id !== id),
    }))
  }, [])

  const addMedication = useCallback(() => {
    setData((prev) => ({ ...prev, medications: [...medications(prev), newMedicationRow()] }))
  }, [])

  const updateMedication = useCallback((id: string, field: keyof Omit<MedicationRow, 'id'>, value: string) => {
    setData((prev) => ({
      ...prev,
      medications: medications(prev).map((row) => row.id === id ? { ...row, [field]: value } : row),
    }))
  }, [])

  const deleteMedication = useCallback((id: string) => {
    setData((prev) => ({
      ...prev,
      medications: medications(prev).filter((row) => row.id !== id),
    }))
  }, [])

  const conditionValues = selectedConditions(data)
  const additionalConditionRows = additionalConditions(data)
  const medicationRows = medications(data)
  const clinicalDataCompleted = Boolean(data.clinical_data_completed)

  if (loading) {
    return (
      <div className="space-y-4">
        <div className="h-6 w-48 animate-pulse rounded bg-[hsl(var(--tone-neutral-200))]" />
        <div className="h-40 w-full animate-pulse rounded-lg bg-[hsl(var(--tone-neutral-200))]" />
        <div className="h-40 w-full animate-pulse rounded-lg bg-[hsl(var(--tone-neutral-200))]" />
      </div>
    )
  }

  return (
    <div className="space-y-5">
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-center gap-2">
          <Stethoscope className="h-4 w-4 text-[hsl(var(--tone-accent-600))]" />
          <h2 className="text-sm font-semibold uppercase tracking-[0.05em] text-[hsl(var(--muted-foreground))]">
            Clinical Data
          </h2>
          <label className="ml-3 inline-flex items-center gap-2 rounded-full border border-[hsl(var(--stroke-soft)/0.72)] bg-white px-3 py-1.5 text-xs font-semibold text-[hsl(var(--foreground))] shadow-[0_1px_2px_rgba(15,23,42,0.04)]">
            <input
              type="checkbox"
              checked={clinicalDataCompleted}
              onChange={(event) => setData((prev) => ({ ...prev, clinical_data_completed: event.target.checked }))}
              className="h-4 w-4 rounded border-[hsl(var(--border))] accent-[hsl(var(--tone-positive-600))]"
            />
            Clinical data completed
          </label>
        </div>
        <span className={cn(
          'inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold transition-opacity',
          saveStatus === 'saving' && 'bg-[hsl(var(--tone-neutral-100))] text-[hsl(var(--tone-neutral-600))]',
          saveStatus === 'saved' && 'bg-[hsl(162_22%_90%)] text-[hsl(164_30%_28%)]',
          saveStatus === 'error' && 'bg-[hsl(4_55%_92%)] text-[hsl(4_50%_40%)]',
          saveStatus === 'idle' && 'opacity-0',
        )}>
          <Save className="h-3.5 w-3.5" />
          {saveStatus === 'saving' ? 'Saving' : saveStatus === 'saved' ? 'Saved' : saveStatus === 'error' ? 'Save failed' : 'Saved'}
        </span>
      </div>

      <Section title="Conditions">
        <div className="space-y-5">
          {CONDITION_GROUPS.map((group) => (
            <div key={group.title} className="grid gap-2">
              <p className="text-xs font-semibold uppercase tracking-[0.05em] text-[hsl(var(--muted-foreground))]">{group.title}</p>
              <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
                {group.items.map((item) => (
                  <ConditionToggle
                    key={item}
                    label={item}
                    state={conditionValues[item]}
                    onClick={() => updateCondition(item)}
                  />
                ))}
              </div>
            </div>
          ))}
        </div>
      </Section>

      <Section
        title="Additional conditions"
        action={
          <button
            type="button"
            onClick={addAdditionalCondition}
            className="inline-flex items-center gap-1.5 rounded-md bg-[hsl(var(--tone-accent-600))] px-3 py-2 text-xs font-semibold text-white shadow-sm transition-colors hover:bg-[hsl(var(--tone-accent-700))]"
          >
            <Plus className="h-3.5 w-3.5" />
            Add condition
          </button>
        }
      >
        <div className="space-y-3">
          <div className="overflow-hidden rounded-lg border border-[hsl(var(--stroke-soft)/0.72)] bg-white">
            <table className="w-full table-fixed border-collapse text-sm">
              <thead className="bg-[hsl(var(--tone-neutral-50))]">
                <tr>
                  {ADDITIONAL_CONDITION_FIELDS.map((field) => (
                    <th key={field.key} className="border-b border-[hsl(var(--stroke-soft)/0.72)] px-3 py-2.5 text-left text-xs font-semibold text-[hsl(var(--tone-neutral-700))]">
                      {field.label}
                    </th>
                  ))}
                  <th className="w-12 border-b border-[hsl(var(--stroke-soft)/0.72)] px-2 py-2" />
                </tr>
              </thead>
              <tbody>
                {additionalConditionRows.length === 0 ? (
                  <tr>
                    <td colSpan={3} className="px-3 py-8 text-center text-sm text-[hsl(var(--muted-foreground))]">
                      No additional conditions added.
                    </td>
                  </tr>
                ) : additionalConditionRows.map((row) => (
                  <tr key={row.id} className="border-b border-[hsl(var(--stroke-soft)/0.4)] last:border-b-0 hover:bg-[hsl(var(--tone-neutral-50)/0.55)]">
                    {ADDITIONAL_CONDITION_FIELDS.map((field) => (
                      <td key={field.key} className="px-2 py-1.5 align-top">
                        <input
                          type="text"
                          value={row[field.key] ?? ''}
                          onChange={(e) => updateAdditionalCondition(row.id, field.key, e.target.value)}
                          className="house-input w-full rounded-lg border-transparent bg-transparent px-2.5 py-1.5 text-xs shadow-none hover:border-[hsl(var(--stroke-soft)/0.72)] focus:border-[hsl(var(--ring))] focus:bg-white"
                        />
                      </td>
                    ))}
                    <td className="px-2 py-2 align-top">
                      <button
                        type="button"
                        onClick={() => deleteAdditionalCondition(row.id)}
                        className="inline-flex h-8 w-8 items-center justify-center rounded-md text-[hsl(var(--tone-danger-600))] transition-colors hover:bg-[hsl(var(--tone-danger-50))]"
                        title="Delete additional condition"
                        aria-label="Delete additional condition"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </Section>

      <Section
        title="Medications"
        action={
          <button
            type="button"
            onClick={addMedication}
            className="inline-flex items-center gap-1.5 rounded-md bg-[hsl(var(--tone-accent-600))] px-3 py-2 text-xs font-semibold text-white shadow-sm transition-colors hover:bg-[hsl(var(--tone-accent-700))]"
          >
            <Plus className="h-3.5 w-3.5" />
            Add medication
          </button>
        }
      >
        <div className="space-y-3">
          <div className="overflow-hidden rounded-lg border border-[hsl(var(--stroke-soft)/0.72)] bg-white">
            <table className="w-full table-fixed border-collapse text-sm">
              <thead className="bg-[hsl(var(--tone-neutral-50))]">
                <tr>
                  {MEDICATION_FIELDS.map((field) => (
                    <th key={field.key} className="border-b border-[hsl(var(--stroke-soft)/0.72)] px-3 py-2.5 text-left text-xs font-semibold text-[hsl(var(--tone-neutral-700))]">
                      {field.label}
                    </th>
                  ))}
                  <th className="w-12 border-b border-[hsl(var(--stroke-soft)/0.72)] px-2 py-2" />
                </tr>
              </thead>
              <tbody>
                {medicationRows.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="px-3 py-8 text-center text-sm text-[hsl(var(--muted-foreground))]">
                      No medications added.
                    </td>
                  </tr>
                ) : medicationRows.map((row) => (
                  <tr key={row.id} className="border-b border-[hsl(var(--stroke-soft)/0.4)] last:border-b-0 hover:bg-[hsl(var(--tone-neutral-50)/0.55)]">
                    {MEDICATION_FIELDS.map((field) => (
                      <td key={field.key} className="px-2 py-1.5 align-top">
                        <input
                          type="text"
                          value={row[field.key] ?? ''}
                          onChange={(e) => updateMedication(row.id, field.key, e.target.value)}
                          className="house-input w-full rounded-lg border-transparent bg-transparent px-2.5 py-1.5 text-xs shadow-none hover:border-[hsl(var(--stroke-soft)/0.72)] focus:border-[hsl(var(--ring))] focus:bg-white"
                        />
                      </td>
                    ))}
                    <td className="px-2 py-2 align-top">
                      <button
                        type="button"
                        onClick={() => deleteMedication(row.id)}
                        className="inline-flex h-8 w-8 items-center justify-center rounded-md text-[hsl(var(--tone-danger-600))] transition-colors hover:bg-[hsl(var(--tone-danger-50))]"
                        title="Delete medication"
                        aria-label="Delete medication"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </Section>
    </div>
  )
}
