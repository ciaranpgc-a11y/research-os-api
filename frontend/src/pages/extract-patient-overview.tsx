import { useCallback, useEffect, useRef, useState } from 'react'
import { Activity, Heart, FileText, Wind, Check, Pencil } from 'lucide-react'

import {
  updatePatient,
  fetchRecords,
  fetchRecruitment,
  updateRecruitment,
  createRecruitment,
  updateRecord,
  fetchBookingEntries,
  type ExtractBookingEntry,
} from '@/lib/extract-api'
import {
  displayInvestigationStatus,
  nextInvestigationStatus,
  normalizeInvestigationStatus,
  type InvestigationStatusValue,
} from '@/lib/extract-investigation-status'
import { cn, formatDate } from '@/lib/utils'
import { usePatientContext } from './extract-patient-detail-page'
import { SourceFileCell, SourceFileHeaderCell } from '@/components/extract/source-file-cell'

// ---------------------------------------------------------------------------
// Inline editable field
// ---------------------------------------------------------------------------

function InlineField({
  label,
  value,
  displayValue,
  field,
  hn,
  onSaved,
}: {
  label: string
  value: string
  displayValue?: string
  field: string
  hn: string
  onSaved: () => void
}) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(value)
  const [saving, setSaving] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  const startEdit = () => {
    setDraft(value)
    setEditing(true)
    requestAnimationFrame(() => inputRef.current?.focus())
  }

  const save = useCallback(async () => {
    if (draft === value) {
      setEditing(false)
      return
    }
    setSaving(true)
    try {
      await updatePatient(hn, { [field]: draft })
      onSaved()
    } catch {
      // revert on failure
      setDraft(value)
    } finally {
      setSaving(false)
      setEditing(false)
    }
  }, [draft, value, hn, field, onSaved])

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      void save()
    } else if (e.key === 'Escape') {
      setDraft(value)
      setEditing(false)
    }
  }

  return (
    <div className="flex items-start justify-between gap-3 py-2.5">
      <span className="w-36 shrink-0 pt-0.5 text-xs font-medium text-[hsl(var(--muted-foreground))]">
        {label}
      </span>
      {editing ? (
        <div className="flex items-center gap-1.5 flex-1">
          <input
            ref={inputRef}
            type={field === 'dob' ? 'date' : 'text'}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onBlur={() => void save()}
            onKeyDown={handleKeyDown}
            disabled={saving}
            className="house-input flex-1 text-sm py-1 px-2"
          />
          <button
            type="button"
            onClick={() => void save()}
            disabled={saving}
            className="inline-flex h-7 w-7 items-center justify-center rounded-md text-[hsl(var(--tone-positive-600))] hover:bg-[hsl(var(--tone-positive-50))] transition-colors"
          >
            <Check className="h-3.5 w-3.5" />
          </button>
        </div>
      ) : (
        <button
          type="button"
          onClick={startEdit}
          className="group flex flex-1 items-center gap-1.5 text-left"
        >
          <span className="text-sm text-[hsl(var(--foreground))]">
            {(displayValue ?? value) || '\u2014'}
          </span>
          <Pencil className="h-3 w-3 text-[hsl(var(--muted-foreground))] opacity-0 group-hover:opacity-100 transition-opacity" />
        </button>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Record count card
// ---------------------------------------------------------------------------

function RecordCountCard({
  label,
  count,
  icon: Icon,
  color,
}: {
  label: string
  count: number
  icon: typeof Activity
  color: string
}) {
  return (
    <div className="flex items-center gap-3 rounded-lg border border-[hsl(var(--stroke-soft)/0.72)] bg-[hsl(var(--card))] px-4 py-3 shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
      <span
        className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full"
        style={{ backgroundColor: `${color}18`, color }}
      >
        <Icon className="h-4 w-4" />
      </span>
      <div className="min-w-0">
        <p className="text-xs font-medium text-[hsl(var(--muted-foreground))]">{label}</p>
        <p className="text-lg font-semibold tabular-nums text-[hsl(var(--foreground))]">{count}</p>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export default function ExtractPatientOverview() {
  const { patient, loading, reload } = usePatientContext()

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="h-6 w-40 animate-pulse rounded bg-[hsl(var(--tone-neutral-200))]" />
        <div className="space-y-3">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="h-10 w-full animate-pulse rounded bg-[hsl(var(--tone-neutral-200))]" />
          ))}
        </div>
      </div>
    )
  }

  if (!patient) {
    return (
      <div className="rounded-lg border border-[hsl(var(--stroke-soft)/0.72)] bg-[hsl(var(--card))] px-6 py-12 text-center">
        <p className="text-sm text-[hsl(var(--muted-foreground))]">Patient not found.</p>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Demographics + Status */}
      <div className="grid gap-6 lg:grid-cols-2">
        {/* Demographics */}
        <div>
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-[0.05em] text-[hsl(var(--muted-foreground))]">
            Demographics
          </h2>
          <div className="rounded-lg border border-[hsl(var(--stroke-soft)/0.72)] bg-[hsl(var(--card))] px-5 py-2 shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
            <div className="divide-y divide-[hsl(var(--stroke-soft)/0.4)]">
              <InlineField label="Name" value={patient.name ?? ''} field="name" hn={patient.hn} onSaved={reload} />
              <InlineField label="Hospital Number" value={patient.hn} field="hn" hn={patient.hn} onSaved={reload} />
              <InlineField label="Date of Birth" value={patient.dob ?? ''} displayValue={formatDate(patient.dob)} field="dob" hn={patient.hn} onSaved={reload} />
              <InlineField label="Gender" value={patient.gender ?? ''} field="gender" hn={patient.hn} onSaved={reload} />
              <InlineField label="Anonymisation Code" value={patient.anonymisation_code ?? ''} field="anonymisation_code" hn={patient.hn} onSaved={reload} />
              <InlineField label="Study ID" value={patient.study_id ?? ''} field="study_id" hn={patient.hn} onSaved={reload} />
            </div>
          </div>
        </div>

        {/* Status */}
        <div>
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-[0.05em] text-[hsl(var(--muted-foreground))]">
            Status
          </h2>
          <CohortStatusCard hn={patient.hn} initialCohort={patient.cohort} initialSource={patient.recruitment_source ?? ''} onSaved={reload} />
        </div>
      </div>

      {/* Record summary */}
      <div>
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-[0.05em] text-[hsl(var(--muted-foreground))]">
          Record Summary
        </h2>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <RecordCountCard
            label="RHC Records"
            count={patient.rhc_count ?? 0}
            icon={Activity}
            color="hsl(var(--tone-accent-500))"
          />
          <RecordCountCard
            label="Echo Records"
            count={patient.echo_count ?? 0}
            icon={Heart}
            color="hsl(var(--tone-warning-500))"
          />
          <RecordCountCard
            label="CMR Records"
            count={patient.cmr_count ?? 0}
            icon={FileText}
            color="hsl(var(--tone-danger-500))"
          />
          <RecordCountCard
            label="CPEX Records"
            count={patient.cpex_count ?? 0}
            icon={Wind}
            color="hsl(var(--tone-neutral-500))"
          />
        </div>
      </div>

      {/* Record tables */}
      <RecordTables hn={patient.hn} name={patient.name ?? ''} />
    </div>
  )
}

// ---------------------------------------------------------------------------
// Cohort status toggle
// ---------------------------------------------------------------------------

const COHORT_OPTIONS = [
  { key: 'Not known', label: 'Not known', style: 'bg-[hsl(var(--tone-neutral-100))] text-[hsl(var(--tone-neutral-600))] ring-[hsl(var(--tone-neutral-300))]' },
  { key: 'Suspected PH', label: 'Suspected PH', style: 'bg-[hsl(38_40%_90%)] text-[hsl(34_50%_35%)] ring-[hsl(36_36%_80%)]' },
  { key: 'Confirmed PH', label: 'Confirmed PH', style: 'bg-[hsl(2_52%_25%)] text-white ring-[hsl(2_52%_20%)]' },
  { key: 'Control', label: 'Healthy control', style: 'bg-[hsl(162_22%_90%)] text-[hsl(164_30%_28%)] ring-[hsl(163_22%_80%)]' },
] as const

const SOURCE_OPTIONS = [
  { key: 'Thoracic', label: 'Thoracic', style: 'bg-[hsl(210_40%_90%)] text-[hsl(210_50%_30%)] ring-[hsl(210_35%_80%)]' },
  { key: 'PREFER-CMR', label: 'PREFER-CMR', style: 'bg-[hsl(280_35%_90%)] text-[hsl(280_45%_30%)] ring-[hsl(280_30%_80%)]' },
  { key: 'Garg clinic', label: 'Garg clinic', style: 'bg-[hsl(162_22%_90%)] text-[hsl(164_30%_28%)] ring-[hsl(163_22%_80%)]' },
  { key: 'PH clinic', label: 'PH clinic', style: 'bg-[hsl(38_40%_90%)] text-[hsl(34_50%_35%)] ring-[hsl(36_36%_80%)]' },
  { key: 'RHC list', label: 'RHC list', style: 'bg-[hsl(358_34%_92%)] text-[hsl(358_42%_34%)] ring-[hsl(358_30%_82%)]' },
  { key: 'RACPC', label: 'RACPC', style: 'bg-[hsl(190_32%_90%)] text-[hsl(190_45%_30%)] ring-[hsl(190_30%_80%)]' },
  { key: 'Echo list', label: 'Echo list', style: 'bg-[hsl(340_35%_92%)] text-[hsl(340_45%_35%)] ring-[hsl(340_30%_82%)]' },
  { key: 'Other', label: 'Other', style: 'bg-[hsl(var(--tone-neutral-100))] text-[hsl(var(--tone-neutral-600))] ring-[hsl(var(--tone-neutral-300))]' },
] as const

function CohortStatusCard({
  hn,
  initialCohort,
  initialSource,
  onSaved,
}: {
  hn: string
  initialCohort: string
  initialSource: string
  onSaved: (options?: { silent?: boolean }) => void
}) {
  const [cohort, setCohort] = useState(initialCohort || 'Not known')
  const [source, setSource] = useState(initialSource || '')
  const [saving, setSaving] = useState(false)

  useEffect(() => { setCohort(initialCohort || 'Not known') }, [initialCohort])
  useEffect(() => { setSource(initialSource || '') }, [initialSource])

  const save = (
    fields: Record<string, string>,
    onError: () => void,
  ) => {
    setSaving(true)
    updateRecruitment(hn, fields)
      .catch(() => createRecruitment(hn, fields))
      .then(() => onSaved({ silent: true }))
      .catch(() => {
        onError()
      })
      .finally(() => {
        setSaving(false)
      })
  }

  const handleCohortChange = (newCohort: string) => {
    if (newCohort === cohort || saving) return
    const previous = cohort
    setCohort(newCohort)
    save({ cohort: newCohort }, () => setCohort(previous))
  }

  const handleSourceChange = (newSource: string) => {
    if (saving) return
    const previous = source
    const val = newSource === source ? '' : newSource
    setSource(val)
    save({ source: val }, () => setSource(previous))
  }

  return (
    <div className="rounded-lg border border-[hsl(var(--stroke-soft)/0.72)] bg-[hsl(var(--card))] px-5 py-4 shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
      <div className="space-y-4">
        <div>
          <span className="text-xs font-medium text-[hsl(var(--muted-foreground))]">Cohort</span>
          <div className="flex flex-wrap gap-2 mt-2">
            {COHORT_OPTIONS.map((opt) => {
              const isActive = cohort === opt.key
              return (
                <button
                  key={opt.key}
                  type="button"
                  onClick={() => handleCohortChange(opt.key)}
                  className={cn(
                    'rounded-full px-3 py-1.5 text-xs font-semibold ring-1 ring-inset transition-all',
                    isActive
                      ? cn(opt.style, 'shadow-sm scale-105')
                      : 'bg-white text-[hsl(var(--tone-neutral-400))] ring-[hsl(var(--tone-neutral-200))] opacity-50 hover:opacity-80',
                  )}
                >
                  {opt.label}
                </button>
              )
            })}
          </div>
        </div>
        <div>
          <span className="text-xs font-medium text-[hsl(var(--muted-foreground))]">Source</span>
          <div className="flex flex-wrap gap-2 mt-2">
            {SOURCE_OPTIONS.map((opt) => {
              const isActive = source === opt.key
              return (
                <button
                  key={opt.key}
                  type="button"
                  onClick={() => handleSourceChange(opt.key)}
                  className={cn(
                    'rounded-full px-3 py-1.5 text-xs font-semibold ring-1 ring-inset transition-all',
                    isActive
                      ? cn(opt.style, 'shadow-sm scale-105')
                      : 'bg-white text-[hsl(var(--tone-neutral-400))] ring-[hsl(var(--tone-neutral-200))] opacity-50 hover:opacity-80',
                  )}
                >
                  {opt.label}
                </button>
              )
            })}
          </div>
        </div>
      </div>
    </div>
  )
}

const CASE_TYPE_SHORT: Record<string, string> = {
  'Pulmonary hypertension / right heart': 'PH / right heart',
  'Heart failure / cardiomyopathy': 'HF / CMP',
  'Post-operative / prosthetic / device': 'Post-op / device',
}
function shortCaseType(raw: string): string {
  return CASE_TYPE_SHORT[raw] ?? raw
}

function normalisePH(raw: string | null | undefined): { label: string; grade: 'severe' | 'moderate' | 'mild' | 'unlikely' } | null {
  if (!raw || !raw.trim()) return null
  const s = raw.toLowerCase().trim()

  if (s === 'high') return { label: 'High', grade: 'severe' }
  if (s === 'intermediate-high') return { label: 'Intermediate-high', grade: 'moderate' }
  if (s === 'intermediate') return { label: 'Intermediate', grade: 'moderate' }
  if (s === 'low-intermediate') return { label: 'Low-intermediate', grade: 'mild' }
  if (s === 'low') return { label: 'Low', grade: 'unlikely' }

  if (s.includes('severe') || s.includes('very high') || s.includes('high prob') || s.includes('high')) return { label: 'High', grade: 'severe' }
  if (s.includes('moderate') && !s.includes('mild') && !s.includes('low')) return { label: 'Intermediate-high', grade: 'moderate' }
  if ((s.includes('mild') && s.includes('moderate')) || s === 'intermediate') return { label: 'Intermediate', grade: 'moderate' }
  if (s.includes('mild') || s.includes('low-intermediate') || s.includes('low intermediate')) return { label: 'Low-intermediate', grade: 'mild' }
  if (s.includes('unlikely') || s.includes('low prob') || s.includes('very low')
    || s.includes('no significant') || s.includes('no ') || s.includes('none')
    || s.includes('normal') || s.includes('ph unlikely')) return { label: 'Low', grade: 'unlikely' }
  if (s.includes('ph') || s.includes('pulmonary')) return { label: 'Low-intermediate', grade: 'mild' }
  return { label: raw.length > 20 ? raw.slice(0, 18) + '\u2026' : raw, grade: 'mild' }
}

function classifyRhcPh(rec: RecordRow): { label: string; tone: string } | null {
  const paMean = rec.pa_mean != null ? Number(rec.pa_mean) : null
  const pcwp = rec.pcwp_mean != null ? Number(rec.pcwp_mean) : null
  const pvr = rec.pvr_wu != null ? Number(rec.pvr_wu) : null
  if (paMean === null || isNaN(paMean)) return null
  if (paMean <= 20) return { label: 'No PH', tone: 'bg-[hsl(162_22%_90%)] text-[hsl(164_30%_28%)] ring-[hsl(163_22%_80%)]' }
  if (pcwp === null) return { label: 'Elevated mPAP', tone: 'bg-[hsl(38_40%_90%)] text-[hsl(34_50%_35%)] ring-[hsl(36_36%_80%)]' }
  if (pcwp <= 15) {
    if (pvr !== null && pvr > 2) return { label: 'Pre-capillary PH', tone: 'bg-[hsl(2_52%_25%)] text-white ring-[hsl(2_52%_20%)]' }
    return { label: 'Elevated mPAP', tone: 'bg-[hsl(38_40%_90%)] text-[hsl(34_50%_35%)] ring-[hsl(36_36%_80%)]' }
  }
  // pcwp > 15
  if (pvr !== null && pvr > 2) return { label: 'CpcPH', tone: 'bg-[hsl(16_45%_86%)] text-[hsl(5_48%_32%)] ring-[hsl(10_32%_76%)]' }
  return { label: 'IpcPH', tone: 'bg-[hsl(16_45%_86%)] text-[hsl(5_48%_32%)] ring-[hsl(10_32%_76%)]' }
}

type RecordRow = Record<string, unknown>

const INX_STATUS_STYLES: Record<string, string> = {
  'Not started': 'bg-[hsl(var(--tone-neutral-100))] text-[hsl(var(--tone-neutral-500))] ring-[hsl(var(--tone-neutral-200))]',
  'Emailed': 'bg-[hsl(38_40%_90%)] text-[hsl(34_50%_35%)] ring-[hsl(36_36%_80%)]',
  'Await report': 'bg-[hsl(38_40%_90%)] text-[hsl(34_50%_35%)] ring-[hsl(36_36%_80%)]',
  'Requested': 'bg-[hsl(38_40%_90%)] text-[hsl(34_50%_35%)] ring-[hsl(36_36%_80%)]',
  'Scheduled': 'bg-[hsl(210_40%_90%)] text-[hsl(210_50%_30%)] ring-[hsl(210_35%_80%)]',
  'Declined': 'bg-[hsl(4_55%_92%)] text-[hsl(4_50%_40%)] ring-[hsl(4_45%_82%)]',
  'Completed': 'bg-[hsl(162_22%_90%)] text-[hsl(164_30%_28%)] ring-[hsl(163_22%_80%)]',
  'Not done': 'bg-[hsl(4_55%_92%)] text-[hsl(4_50%_40%)] ring-[hsl(4_45%_82%)]',
  'Not appropriate': 'bg-[hsl(4_55%_92%)] text-[hsl(4_50%_40%)] ring-[hsl(4_45%_82%)]',
}

function InxStatusPill({
  status,
  bookingLabel,
  onToggle,
}: {
  status: string
  bookingLabel?: string | null
  onToggle: () => void
}) {
  const s = displayInvestigationStatus(status, 0)
  return (
    <span className="inline-flex items-center gap-1.5">
      <button
        type="button"
        onClick={onToggle}
        className={cn('inline-flex items-center rounded-full px-2.5 py-0.5 text-[11px] font-semibold ring-1 ring-inset whitespace-nowrap cursor-pointer transition-all hover:shadow-sm', INX_STATUS_STYLES[s] ?? INX_STATUS_STYLES['Not started'])}
      >
        {s}
      </button>
      {s === 'Scheduled' && bookingLabel && (
        <span className="inline-flex items-center rounded-full bg-[hsl(210_35%_96%)] px-2.5 py-0.5 text-[11px] font-semibold tabular-nums text-[hsl(210_45%_32%)] ring-1 ring-inset ring-[hsl(210_30%_82%)]">
          {bookingLabel}
        </span>
      )}
    </span>
  )
}

function normaliseCmrFlow(value: unknown): '2D-flow' | '4D-flow' | '' {
  const raw = String(value ?? '').trim().toLowerCase()
  if (!raw) return ''
  if (raw.includes('4d')) return '4D-flow'
  if (raw.includes('2d')) return '2D-flow'
  return ''
}

function CmrFlowToggle({
  value,
  onChange,
}: {
  value: unknown
  onChange: (value: '2D-flow' | '4D-flow' | '') => void
}) {
  const current = normaliseCmrFlow(value)
  const next = current === '2D-flow' ? '4D-flow' : current === '4D-flow' ? '' : '2D-flow'

  return (
    <button
      type="button"
      onClick={() => onChange(next)}
      className={cn(
        'inline-flex min-w-[70px] items-center justify-center rounded-full px-2.5 py-0.5 text-[11px] font-semibold ring-1 ring-inset transition-colors',
        current === '2D-flow' && 'bg-[hsl(210_40%_90%)] text-[hsl(210_50%_30%)] ring-[hsl(210_35%_80%)]',
        current === '4D-flow' && 'bg-[hsl(162_22%_90%)] text-[hsl(164_30%_28%)] ring-[hsl(163_22%_80%)]',
        !current && 'bg-[hsl(var(--tone-neutral-100))] text-[hsl(var(--tone-neutral-400))] ring-[hsl(var(--tone-neutral-200))]',
      )}
      title="Toggle CMR flow method"
    >
      {current || '\u2014'}
    </button>
  )
}

function normalizeMatchValue(value: string | null | undefined): string {
  return String(value ?? '').replace(/\s+/g, ' ').trim().toLowerCase()
}

function bookingInvestigationMatches(mod: string, investigation: string): boolean {
  if (mod === 'echo') return investigation === 'Echo'
  return investigation.toLowerCase() === mod
}

function bookingSortValue(entry: ExtractBookingEntry): string {
  return `${entry.booking_date || '9999-99-99'}T${entry.booking_time || '99:99'}`
}

function formatBookingLabel(entry: ExtractBookingEntry | null | undefined): string | null {
  if (!entry) return null
  const dateLabel = formatDate(entry.booking_date)
  if (!entry.booking_time) return dateLabel
  return `${dateLabel} ${entry.booking_time}`
}

function RecordTables({ hn, name }: { hn: string; name: string }) {
  const [rhcRecords, setRhcRecords] = useState<RecordRow[]>([])
  const [echoRecords, setEchoRecords] = useState<RecordRow[]>([])
  const [cmrRecords, setCmrRecords] = useState<RecordRow[]>([])
  const [cpexRecords, setCpexRecords] = useState<RecordRow[]>([])
  const [bookingEntries, setBookingEntries] = useState<ExtractBookingEntry[]>([])
  const [inxStatuses, setInxStatuses] = useState<Record<string, string>>({
    rhc: '', echo: '', cmr: '', cpex: '',
  })

  useEffect(() => {
    if (!hn) return
    void fetchRecords('rhc', { hn }).then((d) => setRhcRecords(Array.isArray(d) ? d : (d as { items?: RecordRow[] }).items ?? []))
    void fetchRecords('echo', { hn }).then((d) => setEchoRecords(Array.isArray(d) ? d : (d as { items?: RecordRow[] }).items ?? []))
    void fetchRecords('cmr', { hn }).then((d) => setCmrRecords(Array.isArray(d) ? d : (d as { items?: RecordRow[] }).items ?? []))
    void fetchRecords('cpex', { hn }).then((d) => setCpexRecords(Array.isArray(d) ? d : (d as { items?: RecordRow[] }).items ?? []))
  }, [hn])

  useEffect(() => {
    if (!hn) return
    void fetchBookingEntries()
      .then((response) => setBookingEntries(response.items ?? []))
      .catch(() => setBookingEntries([]))
  }, [hn])

  // Load inx statuses directly from recruitment (not from patient object which can be stale)
  const inxLoaded = useRef(false)
  useEffect(() => {
    if (!hn || inxLoaded.current) return
    inxLoaded.current = true
    fetchRecruitment(hn)
      .then((rec) => {
        const r = rec as Record<string, unknown>
        setInxStatuses({
          rhc: String(r.inx_rhc ?? ''),
          echo: String(r.inx_echo ?? ''),
          cmr: String(r.inx_cmr ?? ''),
          cpex: String(r.inx_cpex ?? ''),
        })
      })
      .catch(() => {})
  }, [hn])

  const effectiveInx = (mod: string) => {
    // If explicitly set in recruitment, use it
    if (inxStatuses[mod]) return normalizeInvestigationStatus(inxStatuses[mod])
    // Auto-detect from records as fallback
    const records = mod === 'rhc' ? rhcRecords : mod === 'echo' ? echoRecords : mod === 'cmr' ? cmrRecords : cpexRecords
    if (records.length === 0) return 'Not started'
    if (mod === 'cpex') return 'Completed'
    const hasCompleted = records.some((r) => String(r.status ?? '').toLowerCase() === 'completed')
    return hasCompleted ? 'Completed' : 'Await report'
  }

  const toggleInxStatus = (mod: string) => {
    const current = effectiveInx(mod)
    const next = nextInvestigationStatus(current, mod) as InvestigationStatusValue
    // Save the explicit state so "Not started" remains selectable even when records exist.
    setInxStatuses((prev) => ({ ...prev, [mod]: next }))
    updateRecruitment(hn, { [`inx_${mod}`]: next })
      .catch(() => createRecruitment(hn, { [`inx_${mod}`]: next }))
      .catch(() => {})
  }

  const bookingLabelFor = (mod: string): string | null => {
    if (displayInvestigationStatus(effectiveInx(mod), 0) !== 'Scheduled') return null
    const normalizedHn = normalizeMatchValue(hn)
    const normalizedName = normalizeMatchValue(name)
    const booking = bookingEntries
      .filter((entry) => bookingInvestigationMatches(mod, entry.investigation))
      .filter((entry) => {
        const entryHn = normalizeMatchValue(entry.hn)
        const entryName = normalizeMatchValue(entry.name)
        return (entryHn && entryHn === normalizedHn) || (!entryHn && entryName && entryName === normalizedName)
      })
      .sort((a, b) => bookingSortValue(a).localeCompare(bookingSortValue(b)))
      .at(0)
    return formatBookingLabel(booking)
  }

  const s = (row: RecordRow, key: string) => {
    const v = row[key]
    if (v == null || v === '') return '\u2014'
    return String(v)
  }
  const n = (row: RecordRow, key: string, dp = 0) => {
    const v = row[key]
    if (v == null || v === '') return '\u2014'
    const num = Number(v)
    return isNaN(num) ? String(v) : num.toFixed(dp)
  }

  const COL_GRID = '120px 1fr 1fr 1.5fr 1.5fr 56px'
  const CPEX_GRID = '1fr 56px'

  const updateCmrFlow = (record: RecordRow, flow: '2D-flow' | '4D-flow' | '') => {
    const id = s(record, 'id')
    if (id === '\u2014') return
    const previous = record.flow
    setCmrRecords((prev) => prev.map((item) => (
      s(item, 'id') === id ? { ...item, flow } : item
    )))
    void updateRecord('cmr', id, { flow }).catch(() => {
      setCmrRecords((prev) => prev.map((item) => (
        s(item, 'id') === id ? { ...item, flow: previous } : item
      )))
    })
  }

  return (
    <div className="space-y-5">
      {/* RHC */}
        <div>
          <div className="flex items-center gap-3 mb-2">
            <h2 className="text-sm font-semibold uppercase tracking-[0.05em] text-[hsl(var(--muted-foreground))]">
              RHC
            </h2>
            <InxStatusPill status={effectiveInx('rhc')} bookingLabel={bookingLabelFor('rhc')} onToggle={() => toggleInxStatus('rhc')} />
          </div>
          <div className="overflow-hidden rounded-2xl border border-[hsl(var(--stroke-soft)/0.72)] bg-[hsl(var(--card))] text-sm">
            <div className="grid border-b-2 border-[hsl(var(--tone-neutral-300))] bg-[hsl(var(--tone-neutral-50))]" style={{ gridTemplateColumns: COL_GRID }}>
              <div className="flex items-center px-4 py-2.5 font-semibold text-[hsl(var(--tone-neutral-700))]">Date</div>
              <div className="flex items-center justify-center px-4 py-2.5 font-semibold text-[hsl(var(--tone-neutral-700))]">PH class</div>
              <div className="flex items-center justify-center gap-1.5 px-4 py-2.5 font-semibold text-[hsl(var(--tone-neutral-700))]">PA mean <span className="font-normal text-xs text-[hsl(var(--tone-neutral-400))]">mmHg</span></div>
              <div className="flex items-center justify-center gap-1.5 px-4 py-2.5 font-semibold text-[hsl(var(--tone-neutral-700))]">PCWP <span className="font-normal text-xs text-[hsl(var(--tone-neutral-400))]">mmHg</span></div>
              <div className="flex items-center justify-center gap-1.5 px-4 py-2.5 font-semibold text-[hsl(var(--tone-neutral-700))]">PVR <span className="font-normal text-xs text-[hsl(var(--tone-neutral-400))]">WU</span></div>
              <SourceFileHeaderCell />
            </div>
            {rhcRecords.map((rec) => {
              const phClass = classifyRhcPh(rec)
              return (
              <div key={s(rec, 'id')} className="grid border-b border-[hsl(var(--stroke-soft)/0.4)]" style={{ gridTemplateColumns: COL_GRID }}>
                <div className="flex items-center px-4 py-2.5">{formatDate(s(rec, 'date_rhc'))}</div>
                <div className="flex items-center justify-center px-4 py-2.5">
                  {phClass ? (
                    <span className={cn('inline-flex items-center rounded-full px-2.5 py-0.5 text-[11px] font-semibold ring-1 ring-inset whitespace-nowrap', phClass.tone)}>
                      {phClass.label}
                    </span>
                  ) : '\u2014'}
                </div>
                <div className="flex items-center justify-center px-4 py-2.5 tabular-nums font-semibold">{n(rec, 'pa_mean')}</div>
                <div className="flex items-center justify-center px-4 py-2.5 tabular-nums font-semibold">{n(rec, 'pcwp_mean')}</div>
                <div className="flex items-center justify-center px-4 py-2.5 tabular-nums font-semibold">{n(rec, 'pvr_wu', 1)}</div>
                <SourceFileCell modality="rhc" recordId={s(rec, 'id')} />
              </div>
              )
            })}
          </div>
        </div>

      {/* Echo */}
        <div>
          <div className="flex items-center gap-3 mb-2">
            <h2 className="text-sm font-semibold uppercase tracking-[0.05em] text-[hsl(var(--muted-foreground))]">
              Echo
            </h2>
            <InxStatusPill status={effectiveInx('echo')} bookingLabel={bookingLabelFor('echo')} onToggle={() => toggleInxStatus('echo')} />
          </div>
          <div className="overflow-hidden rounded-2xl border border-[hsl(var(--stroke-soft)/0.72)] bg-[hsl(var(--card))] text-sm">
            <div className="grid border-b-2 border-[hsl(var(--tone-neutral-300))] bg-[hsl(var(--tone-neutral-50))]" style={{ gridTemplateColumns: COL_GRID }}>
              <div className="flex items-center px-4 py-2.5 font-semibold text-[hsl(var(--tone-neutral-700))]">Date</div>
              <div className="flex items-center justify-center px-4 py-2.5 font-semibold text-[hsl(var(--tone-neutral-700))]">PH probability</div>
              <div className="flex items-center justify-center px-4 py-2.5 font-semibold text-[hsl(var(--tone-neutral-700))]">Case type</div>
              <div className="flex items-center justify-center px-4 py-2.5 font-semibold text-[hsl(var(--tone-neutral-700))]">Primary diagnosis</div>
              <div className="flex items-center justify-center px-4 py-2.5 font-semibold text-[hsl(var(--tone-neutral-700))]">Secondary pathology</div>
              <SourceFileHeaderCell />
            </div>
            {echoRecords.map((rec) => {
              const phProb = s(rec, 'ph_prob')
              const phPill = phProb !== '\u2014' ? cn(
                'inline-flex items-center rounded-full px-2.5 py-0.5 text-[11px] font-semibold ring-1 ring-inset whitespace-nowrap',
                phProb.toLowerCase() === 'low' && 'bg-[hsl(162_22%_90%)] text-[hsl(164_30%_28%)] ring-[hsl(163_22%_80%)]',
                phProb.toLowerCase() === 'intermediate' && 'bg-[hsl(38_40%_90%)] text-[hsl(34_50%_35%)] ring-[hsl(36_36%_80%)]',
                phProb.toLowerCase() === 'high' && 'bg-[hsl(2_52%_25%)] text-white ring-[hsl(2_52%_20%)]',
                !['low', 'intermediate', 'high'].includes(phProb.toLowerCase()) && 'bg-[hsl(var(--tone-neutral-100))] text-[hsl(var(--tone-neutral-600))] ring-[hsl(var(--tone-neutral-300))]',
              ) : null
              return (
                <div key={s(rec, 'id')} className="grid border-b border-[hsl(var(--stroke-soft)/0.4)]" style={{ gridTemplateColumns: COL_GRID }}>
                  <div className="flex items-center px-4 py-2.5">{formatDate(s(rec, 'study_date'))}</div>
                  <div className="flex items-center justify-center px-4 py-2.5">
                    {phPill ? <span className={phPill}>{phProb}</span> : '\u2014'}
                  </div>
                  <div className="flex items-center justify-center px-4 py-2.5">
                    {s(rec, 'case_type') !== '\u2014' ? (
                      <span className="inline-flex items-center rounded-full px-2.5 py-0.5 text-[11px] font-semibold ring-1 ring-inset bg-white text-[hsl(var(--foreground))] ring-[hsl(var(--tone-neutral-300))]">
                        {shortCaseType(s(rec, 'case_type'))}
                      </span>
                    ) : '\u2014'}
                  </div>
                  <div className="flex items-center justify-center px-4 py-2.5 text-center">{s(rec, 'primary_dx')}</div>
                  <div className="flex items-center justify-center px-4 py-2.5 text-center">{s(rec, 'secondary_path')}</div>
                  <SourceFileCell modality="echo" recordId={s(rec, 'id')} />
                </div>
              )
            })}
          </div>
        </div>

      {/* CMR */}
        <div>
          <div className="flex items-center gap-3 mb-2">
            <h2 className="text-sm font-semibold uppercase tracking-[0.05em] text-[hsl(var(--muted-foreground))]">
              CMR
            </h2>
            <InxStatusPill status={effectiveInx('cmr')} bookingLabel={bookingLabelFor('cmr')} onToggle={() => toggleInxStatus('cmr')} />
          </div>
          <div className="overflow-hidden rounded-2xl border border-[hsl(var(--stroke-soft)/0.72)] bg-[hsl(var(--card))] text-sm">
            <div className="grid border-b-2 border-[hsl(var(--tone-neutral-300))] bg-[hsl(var(--tone-neutral-50))]" style={{ gridTemplateColumns: COL_GRID }}>
              <div className="flex items-center px-4 py-2.5 font-semibold text-[hsl(var(--tone-neutral-700))]">Date</div>
              <div className="flex items-center justify-center px-4 py-2.5 font-semibold text-[hsl(var(--tone-neutral-700))]">PH probability</div>
              <div className="flex items-center justify-center px-4 py-2.5 font-semibold text-[hsl(var(--tone-neutral-700))]">Flow</div>
              <div className="flex items-center justify-center px-4 py-2.5 font-semibold text-[hsl(var(--tone-neutral-700))]">Primary Dx</div>
              <div className="flex items-center justify-center px-4 py-2.5 font-semibold text-[hsl(var(--tone-neutral-700))]">Secondary Dx</div>
              <SourceFileHeaderCell />
            </div>
            {cmrRecords.map((rec) => {
              const phRaw = s(rec, 'ph')
              const phNorm = phRaw !== '\u2014' ? normalisePH(phRaw) : null
              const phToneMap: Record<string, string> = {
                severe:   'bg-[hsl(2_52%_25%)] text-white ring-[hsl(2_52%_20%)]',
                moderate: 'bg-[hsl(16_45%_86%)] text-[hsl(5_48%_32%)] ring-[hsl(10_32%_76%)]',
                mild:     'bg-[hsl(38_40%_90%)] text-[hsl(34_50%_35%)] ring-[hsl(36_36%_80%)]',
                unlikely: 'bg-[hsl(162_22%_90%)] text-[hsl(164_30%_28%)] ring-[hsl(163_22%_80%)]',
              }
              return (
                <div key={s(rec, 'id')} className="grid border-b border-[hsl(var(--stroke-soft)/0.4)]" style={{ gridTemplateColumns: COL_GRID }}>
                  <div className="flex items-center px-4 py-2.5">{formatDate(s(rec, 'date_cmr'))}</div>
                  <div className="flex items-center justify-center px-4 py-2.5">
                    {phNorm ? (
                      <span className={cn('inline-flex items-center rounded-full px-2.5 py-0.5 text-[11px] font-semibold ring-1 ring-inset whitespace-nowrap', phToneMap[phNorm.grade])}>
                        {phNorm.label}
                      </span>
                    ) : '\u2014'}
                  </div>
                  <div className="flex items-center justify-center px-4 py-2.5">
                    <CmrFlowToggle value={rec.flow} onChange={(value) => updateCmrFlow(rec, value)} />
                  </div>
                  <div className="flex items-center justify-center px-4 py-2.5 text-center truncate">{s(rec, 'primary_dx')}</div>
                  <div className="flex items-center justify-center px-4 py-2.5 text-center truncate">{s(rec, 'secondary_dx')}</div>
                  <SourceFileCell modality="cmr" recordId={s(rec, 'id')} />
                </div>
              )
            })}
          </div>
        </div>

      {/* CPEX */}
        <div>
          <div className="flex items-center gap-3 mb-2">
            <h2 className="text-sm font-semibold uppercase tracking-[0.05em] text-[hsl(var(--muted-foreground))]">
              CPEX
            </h2>
            <InxStatusPill status={effectiveInx('cpex')} bookingLabel={bookingLabelFor('cpex')} onToggle={() => toggleInxStatus('cpex')} />
          </div>
          <div className="overflow-hidden rounded-2xl border border-[hsl(var(--stroke-soft)/0.72)] bg-[hsl(var(--card))] text-sm">
            <div className="grid border-b-2 border-[hsl(var(--tone-neutral-300))] bg-[hsl(var(--tone-neutral-50))]" style={{ gridTemplateColumns: CPEX_GRID }}>
              <div className="flex items-center px-4 py-2.5 font-semibold text-[hsl(var(--tone-neutral-700))]">Date</div>
              <SourceFileHeaderCell />
            </div>
            {cpexRecords.map((rec) => (
              <div key={s(rec, 'id')} className="grid border-b border-[hsl(var(--stroke-soft)/0.4)]" style={{ gridTemplateColumns: CPEX_GRID }}>
                <div className="flex items-center px-4 py-2.5">{formatDate(s(rec, 'date_cpex'))}</div>
                <SourceFileCell modality="cpex" recordId={s(rec, 'id')} />
              </div>
            ))}
          </div>
        </div>
    </div>
  )
}
