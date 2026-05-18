import { useCallback, useEffect, useRef, useState } from 'react'
import { CalendarDays, Check, Circle, Edit3, Plus, Save, Trash2, X } from 'lucide-react'

import {
  createRecruitment,
  createRecruitmentNote,
  deleteRecruitmentNote,
  fetchRecruitment,
  fetchRecruitmentNotes,
  type RecruitmentNote,
  updateRecruitment,
  updateRecruitmentNote,
} from '@/lib/extract-api'
import {
  displayInvestigationStatus,
  nextInvestigationStatus,
  type InvestigationStatusValue,
} from '@/lib/extract-investigation-status'
import { cn } from '@/lib/utils'
import { usePatientContext } from './extract-patient-detail-page'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type RecruitmentData = {
  recruitment_status: string
  // Consent
  pis_sent: boolean
  date_pis_sent: string
  consent_obtained: boolean
  date_consent: string
  // Dates
  date_identified: string
  date_first_contact: string
  // Contact
  contact_number: string
  email_address: string
  // Source & Notes
  source: string
  notes: string
  // Investigation statuses
  inx_rhc: string
  inx_echo: string
  inx_cmr: string
  inx_cpex: string
}

type RecruitmentDateField =
  | 'date_pis_sent'
  | 'date_consent'
  | 'date_identified'
  | 'date_first_contact'

const EMPTY_RECRUITMENT: RecruitmentData = {
  recruitment_status: '',
  pis_sent: false,
  date_pis_sent: '',
  consent_obtained: false,
  date_consent: '',
  date_identified: '',
  date_first_contact: '',
  contact_number: '',
  email_address: '',
  source: '',
  notes: '',
  inx_rhc: '',
  inx_echo: '',
  inx_cmr: '',
  inx_cpex: '',
}

// ---------------------------------------------------------------------------
// Pipeline stages
// ---------------------------------------------------------------------------

const PIPELINE_STAGES = [
  { key: 'Identified', label: 'Identified' },
  { key: 'Approached', label: 'Approached' },
  { key: 'PIS Sent', label: 'PIS sent' },
  { key: 'Consented', label: 'Consented' },
  { key: 'Enrolled', label: 'Enrolled' },
  { key: 'Completed', label: 'Completed' },
] as const

const DECLINED_STAGES = ['Declined', 'Withdrawn', 'Not Eligible'] as const

function stageIndex(status: string): number {
  const idx = PIPELINE_STAGES.findIndex((s) => s.key === status)
  return idx >= 0 ? idx : -1
}

function formatTodayDate(): string {
  const today = new Date()
  const day = String(today.getDate()).padStart(2, '0')
  const month = String(today.getMonth() + 1).padStart(2, '0')
  return `${day}/${month}/${today.getFullYear()}`
}

function DateEntryField({
  value,
  onChange,
  onToday,
  label,
}: {
  value: string
  onChange: (value: string) => void
  onToday: () => void
  label: string
}) {
  return (
    <div className="flex shrink-0 items-center gap-1.5">
      <button
        type="button"
        onClick={onToday}
        aria-label={`Set ${label} date to today`}
        title="Set to today"
        className="inline-flex h-8 w-8 items-center justify-center rounded-md text-[hsl(var(--tone-neutral-500))] transition-colors hover:bg-[hsl(var(--tone-neutral-100))] hover:text-[hsl(var(--tone-accent-700))] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--tone-accent-500))]"
      >
        <CalendarDays className="h-4 w-4" />
      </button>
      <input
        type="text"
        placeholder="-"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="house-input rounded-lg text-xs py-1.5 px-2.5 w-28 text-center"
      />
    </div>
  )
}

// ---------------------------------------------------------------------------
// Pipeline stepper
// ---------------------------------------------------------------------------

function PipelineStepper({
  currentStatus,
  onStatusChange,
}: {
  currentStatus: string
  onStatusChange: (status: string) => void
}) {
  const currentIdx = stageIndex(currentStatus)
  const isDeclined = (DECLINED_STAGES as readonly string[]).includes(currentStatus)

  return (
    <div className="space-y-4">
      {/* Main pipeline */}
      <div className="flex items-center gap-0">
        {PIPELINE_STAGES.map((stage, i) => {
          const isCompleted = currentIdx > i
          const isCurrent = currentIdx === i && !isDeclined
          const isFuture = currentIdx < i || isDeclined
          const isReached = isCompleted || isCurrent
          const highlightsNextStep = currentIdx === i && !isDeclined

          return (
            <div key={stage.key} className="flex items-center flex-1 last:flex-none">
              <button
                type="button"
                onClick={() => onStatusChange(stage.key)}
                className={cn(
                  'relative flex flex-col items-center gap-1.5 group transition-all',
                  isFuture && 'opacity-40 hover:opacity-70',
                )}
              >
                {/* Circle */}
                <div
                  className={cn(
                    'flex h-8 w-8 items-center justify-center rounded-full border-2 transition-all',
                    isCompleted && 'border-[hsl(var(--tone-positive-500))] bg-[hsl(var(--tone-positive-500))] text-white',
                    isCurrent && 'border-[hsl(var(--tone-positive-500))] bg-[hsl(var(--tone-positive-500))] text-white shadow-[0_0_0_4px_hsl(var(--tone-positive-100))]',
                    isFuture && 'border-[hsl(var(--tone-neutral-300))] bg-white text-[hsl(var(--tone-neutral-400))]',
                  )}
                >
                  {isCompleted ? (
                    <Check className="h-4 w-4" />
                  ) : (
                    <span className="text-xs font-bold">{i + 1}</span>
                  )}
                </div>
                {/* Label */}
                <span
                  className={cn(
                    'text-[11px] font-medium whitespace-nowrap',
                    isReached && 'text-[hsl(var(--tone-positive-600))]',
                    isFuture && 'text-[hsl(var(--tone-neutral-400))]',
                    isCurrent && 'font-semibold',
                  )}
                >
                  {stage.label}
                </span>
              </button>
              {/* Connector line */}
              {i < PIPELINE_STAGES.length - 1 && (
                <div
                  className={cn(
                    'h-0.5 flex-1 mx-1 mt-[-18px]',
                    currentIdx > i && 'bg-[hsl(var(--tone-positive-400))]',
                    highlightsNextStep && 'bg-[hsl(var(--tone-danger-300))]',
                    currentIdx < i && 'bg-[hsl(var(--tone-neutral-200))]',
                    isDeclined && 'bg-[hsl(var(--tone-neutral-200))]',
                  )}
                />
              )}
            </div>
          )
        })}
      </div>

      {/* Declined/Withdrawn/Not Eligible toggles */}
      <div className="flex items-center gap-2 pl-1">
        {DECLINED_STAGES.map((status) => (
          <button
            key={status}
            type="button"
            onClick={() => onStatusChange(currentStatus === status ? '' : status)}
            className={cn(
              'rounded-full px-3 py-1 text-[11px] font-medium ring-1 ring-inset transition-all',
              currentStatus === status
                ? 'bg-[hsl(var(--tone-danger-100))] text-[hsl(var(--tone-danger-700))] ring-[hsl(var(--tone-danger-300))]'
                : 'bg-white text-[hsl(var(--tone-neutral-500))] ring-[hsl(var(--tone-neutral-200))] hover:ring-[hsl(var(--tone-neutral-400))]',
            )}
          >
            {status}
          </button>
        ))}
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Modality indicators (clickable status cycle)
// ---------------------------------------------------------------------------

type InxStatus = InvestigationStatusValue

const INX_STYLES: Record<string, { pill: string; icon: 'check' | 'circle' | 'x' | 'clock' }> = {
  '': { pill: 'bg-white text-[hsl(var(--tone-neutral-500))] ring-[hsl(var(--tone-neutral-200))]', icon: 'circle' },
  'Not started': { pill: 'bg-white text-[hsl(var(--tone-neutral-500))] ring-[hsl(var(--tone-neutral-200))]', icon: 'circle' },
  Emailed: { pill: 'bg-[hsl(38_40%_90%)] text-[hsl(34_50%_35%)] ring-[hsl(36_36%_80%)]', icon: 'clock' },
  'Await report': { pill: 'bg-[hsl(38_40%_90%)] text-[hsl(34_50%_35%)] ring-[hsl(36_36%_80%)]', icon: 'clock' },
  Requested: { pill: 'bg-[hsl(38_40%_90%)] text-[hsl(34_50%_35%)] ring-[hsl(36_36%_80%)]', icon: 'clock' },
  Scheduled: { pill: 'bg-[hsl(210_40%_90%)] text-[hsl(210_50%_30%)] ring-[hsl(210_35%_80%)]', icon: 'clock' },
  Declined: { pill: 'bg-[hsl(4_55%_92%)] text-[hsl(4_50%_40%)] ring-[hsl(4_45%_82%)]', icon: 'x' },
  Completed: { pill: 'bg-[hsl(162_22%_90%)] text-[hsl(164_30%_28%)] ring-[hsl(163_22%_80%)]', icon: 'check' },
  'Not done': { pill: 'bg-[hsl(4_55%_92%)] text-[hsl(4_50%_40%)] ring-[hsl(4_45%_82%)]', icon: 'x' },
  'Not appropriate': { pill: 'bg-[hsl(var(--tone-neutral-100))] text-[hsl(var(--tone-neutral-500))] ring-[hsl(var(--tone-neutral-300))]', icon: 'x' },
}

function ModalityIndicators({
  patient,
  statuses,
  onStatusChange,
}: {
  patient: { rhc_count: number; echo_count: number; cmr_count: number; cpex_count: number }
  statuses: Record<string, string>
  onStatusChange: (modality: string, status: InxStatus) => void
}) {
  const modalities = [
    { key: 'rhc', label: 'RHC', count: patient.rhc_count ?? 0 },
    { key: 'echo', label: 'Echo', count: patient.echo_count ?? 0 },
    { key: 'cmr', label: 'CMR', count: patient.cmr_count ?? 0 },
    { key: 'cpex', label: 'CPEX', count: patient.cpex_count ?? 0 },
  ]

  return (
    <div className="rounded-lg border border-[hsl(var(--stroke-soft)/0.72)] bg-[hsl(var(--card))]">
      <div className="border-b border-[hsl(var(--stroke-soft)/0.5)] bg-[hsl(var(--tone-neutral-50))] px-4 py-2">
        <h4 className="text-sm font-semibold tracking-tight text-[hsl(var(--foreground))]">Investigations</h4>
      </div>
      <div className="px-4 py-3">
        <div className="flex flex-wrap gap-3">
          {modalities.map((m) => {
            const status = statuses[m.key] || ''
            const effectiveStatus = displayInvestigationStatus(status, m.count)
            const style = INX_STYLES[effectiveStatus] ?? INX_STYLES['']
            return (
              <button
                key={m.key}
                type="button"
                onClick={() => onStatusChange(m.key, nextInvestigationStatus(effectiveStatus, m.key))}
                className={cn(
                  'flex items-center gap-2 rounded-full pl-2.5 pr-3 py-1.5 ring-1 ring-inset text-[11px] font-medium cursor-pointer transition-all hover:shadow-sm',
                  style.pill,
                )}
              >
                {style.icon === 'check' && <Check className="h-3.5 w-3.5" />}
                {style.icon === 'clock' && <Circle className="h-3.5 w-3.5" strokeDasharray="3 2" />}
                {style.icon === 'circle' && <Circle className="h-3.5 w-3.5" />}
                {style.icon === 'x' && <span className="text-xs font-bold leading-none">&times;</span>}
                <span>{m.label}</span>
                <span className="text-[10px] opacity-70">{effectiveStatus === 'Not appropriate' ? 'N/A' : effectiveStatus}</span>
                {m.count > 0 && (
                  <span className="rounded-full bg-white/60 px-1.5 py-0.5 text-[10px] font-bold tabular-nums">
                    {m.count}
                  </span>
                )}
              </button>
            )
          })}
        </div>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Notes
// ---------------------------------------------------------------------------

type NoteDraft = {
  body: string
}

function noteInitials(name: string | null | undefined): string {
  const parts = String(name || '').trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return '-'
  return parts.slice(0, 2).map((part) => part[0]?.toUpperCase()).join('')
}

function noteDisplayDate(note: RecruitmentNote): string {
  if (note.note_date) return note.note_date
  if (!note.created_at) return '-'
  const created = new Date(note.created_at)
  if (Number.isNaN(created.getTime())) return '-'
  const day = String(created.getDate()).padStart(2, '0')
  const month = String(created.getMonth() + 1).padStart(2, '0')
  return `${day}/${month}/${created.getFullYear()}`
}

function NoteEditor({
  draft,
  setDraft,
  onSave,
  onCancel,
  saving,
}: {
  draft: NoteDraft
  setDraft: (draft: NoteDraft) => void
  onSave: () => void
  onCancel: () => void
  saving: boolean
}) {
  return (
    <div className="rounded-lg border border-[hsl(var(--tone-accent-200))] bg-white p-3 shadow-[0_1px_3px_rgba(15,23,42,0.06)]">
      <label className="grid gap-1.5">
        <span className="house-field-label">Note</span>
        <textarea
          value={draft.body}
          onChange={(event) => setDraft({ ...draft, body: event.target.value })}
          rows={3}
          placeholder="Add note..."
          className="house-textarea min-h-24 w-full resize-y rounded-lg bg-white px-3 py-2.5 text-sm"
        />
      </label>
      <div className="mt-3 flex items-center justify-end gap-2">
        <button
          type="button"
          onClick={onCancel}
          className="inline-flex items-center gap-1.5 rounded-md border border-[hsl(var(--border))] bg-white px-3 py-1.5 text-xs font-semibold text-[hsl(var(--foreground))] hover:bg-[hsl(var(--tone-neutral-50))]"
        >
          <X className="h-3.5 w-3.5" />
          Cancel
        </button>
        <button
          type="button"
          onClick={onSave}
          disabled={saving || !draft.body.trim()}
          className="inline-flex items-center gap-1.5 rounded-md bg-[hsl(var(--tone-positive-600))] px-3 py-1.5 text-xs font-semibold text-white hover:bg-[hsl(var(--tone-positive-700))] disabled:cursor-not-allowed disabled:opacity-50"
        >
          <Save className="h-3.5 w-3.5" />
          {saving ? 'Saving...' : 'Save note'}
        </button>
      </div>
    </div>
  )
}

function StructuredNotes({ hn }: { hn: string }) {
  const [notes, setNotes] = useState<RecruitmentNote[]>([])
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [adding, setAdding] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [draft, setDraft] = useState<NoteDraft>({ body: '' })
  const [menu, setMenu] = useState<{ x: number; y: number; note: RecruitmentNote } | null>(null)
  const menuRef = useRef<HTMLDivElement>(null)

  const loadNotes = useCallback(() => {
    if (!hn) return
    setLoading(true)
    void fetchRecruitmentNotes(hn)
      .then(setNotes)
      .catch(() => setNotes([]))
      .finally(() => setLoading(false))
  }, [hn])

  useEffect(() => {
    loadNotes()
  }, [loadNotes])

  useEffect(() => {
    if (!menu) return
    const close = (event: MouseEvent) => {
      if (menuRef.current?.contains(event.target as Node)) return
      setMenu(null)
    }
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setMenu(null)
    }
    document.addEventListener('mousedown', close)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', close)
      document.removeEventListener('keydown', onKey)
    }
  }, [menu])

  const beginAdd = () => {
    setEditingId(null)
    setDraft({ body: '' })
    setAdding(true)
  }

  const beginEdit = (note: RecruitmentNote) => {
    setMenu(null)
    setAdding(false)
    setEditingId(note.id)
    setDraft({ body: note.body || '' })
  }

  const cancelEditor = () => {
    setAdding(false)
    setEditingId(null)
    setDraft({ body: '' })
  }

  const saveDraft = async () => {
    if (!draft.body.trim()) return
    setSaving(true)
    try {
      if (editingId) {
        const updated = await updateRecruitmentNote(hn, editingId, { body: draft.body })
        setNotes((prev) => prev.map((note) => (note.id === updated.id ? updated : note)))
      } else {
        const created = await createRecruitmentNote(hn, { body: draft.body })
        setNotes((prev) => [created, ...prev])
      }
      cancelEditor()
    } finally {
      setSaving(false)
    }
  }

  const deleteNote = async (note: RecruitmentNote) => {
    setMenu(null)
    if (!window.confirm('Delete this note?')) return
    await deleteRecruitmentNote(hn, note.id)
    setNotes((prev) => prev.filter((item) => item.id !== note.id))
    if (editingId === note.id) cancelEditor()
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-end">
        <button
          type="button"
          onClick={beginAdd}
          className="inline-flex items-center gap-1.5 rounded-md bg-[hsl(var(--tone-accent-600))] px-3 py-1.5 text-xs font-semibold text-white hover:bg-[hsl(var(--tone-accent-700))]"
        >
          <Plus className="h-3.5 w-3.5" />
          Add note
        </button>
      </div>

      {adding && (
        <NoteEditor
          draft={draft}
          setDraft={setDraft}
          onSave={() => void saveDraft()}
          onCancel={cancelEditor}
          saving={saving}
        />
      )}

      {loading ? (
        <div className="rounded-lg border border-dashed border-[hsl(var(--stroke-soft)/0.72)] px-4 py-6 text-center text-sm text-[hsl(var(--muted-foreground))]">
          Loading notes...
        </div>
      ) : notes.length > 0 ? (
        <div className="space-y-2">
          {notes.map((note) => {
            const isEditing = editingId === note.id
            if (isEditing) {
              return (
                <NoteEditor
                  key={note.id}
                  draft={draft}
                  setDraft={setDraft}
                  onSave={() => void saveDraft()}
                  onCancel={cancelEditor}
                  saving={saving}
                />
              )
            }
            return (
              <article
                key={note.id}
                onContextMenu={(event) => {
                  event.preventDefault()
                  setMenu({
                    x: Math.min(event.clientX, window.innerWidth - 200),
                    y: Math.min(event.clientY, window.innerHeight - 128),
                    note,
                  })
                }}
                className="cursor-context-menu rounded-lg border border-[hsl(var(--stroke-soft)/0.72)] bg-white p-4 shadow-[0_1px_3px_rgba(15,23,42,0.06)] transition-colors hover:border-[hsl(var(--tone-accent-200))] hover:bg-[hsl(var(--tone-neutral-50)/0.45)]"
              >
                <div className="mb-3 flex items-start justify-between gap-3">
                  <div className="flex min-w-0 items-center gap-2">
                    <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[hsl(var(--tone-accent-50))] text-[11px] font-semibold text-[hsl(var(--tone-accent-700))] ring-1 ring-inset ring-[hsl(var(--tone-accent-200))]">
                      {noteInitials(note.author_name)}
                    </div>
                    <div className="min-w-0">
                      <div className="truncate text-sm font-semibold text-[hsl(var(--foreground))]">
                        {note.author_name || 'Unknown'}
                      </div>
                      <div className="flex items-center gap-2 text-xs text-[hsl(var(--muted-foreground))]">
                        <CalendarDays className="h-3.5 w-3.5" />
                        <span>{noteDisplayDate(note)}</span>
                      </div>
                    </div>
                  </div>
                </div>
                <p className="whitespace-pre-wrap text-sm leading-6 text-[hsl(var(--foreground))]">{note.body}</p>
              </article>
            )
          })}
        </div>
      ) : null}

      {menu && (
        <div
          ref={menuRef}
          className="fixed z-50 min-w-[180px] overflow-hidden rounded-lg border border-[hsl(var(--stroke-soft)/0.8)] bg-white shadow-[0_12px_32px_rgba(15,23,42,0.16)]"
          style={{ left: menu.x, top: menu.y }}
        >
          <div className="border-b border-[hsl(var(--stroke-soft)/0.65)] bg-[hsl(var(--tone-neutral-50))] px-3 py-2">
            <div className="text-[10px] font-semibold uppercase tracking-[0.12em] text-[hsl(var(--muted-foreground))]">
              Note actions
            </div>
          </div>
          <div className="p-1">
            <button
              type="button"
              onClick={() => beginEdit(menu.note)}
              className="flex w-full items-center gap-2.5 rounded-md px-3 py-2 text-left text-sm font-medium text-[hsl(var(--foreground))] hover:bg-[hsl(var(--tone-accent-50))] hover:text-[hsl(var(--tone-accent-700))]"
            >
              <Edit3 className="h-4 w-4" />
              Edit note
            </button>
            <button
              type="button"
              onClick={() => void deleteNote(menu.note)}
              className="flex w-full items-center gap-2.5 rounded-md px-3 py-2 text-left text-sm font-medium text-[hsl(var(--tone-danger-600))] hover:bg-[hsl(var(--tone-danger-50))]"
            >
              <Trash2 className="h-4 w-4" />
              Delete note
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export default function ExtractPatientRecruitment() {
  const { patient } = usePatientContext()
  const hn = patient?.hn ?? ''

  const [data, setData] = useState<RecruitmentData>({ ...EMPTY_RECRUITMENT })
  const [isNew, setIsNew] = useState(false)
  const [loading, setLoading] = useState(true)
  const [notFound, setNotFound] = useState(false)
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved'>('idle')
  const initialLoadDone = useRef(false)
  const saveTimer = useRef<ReturnType<typeof setTimeout>>()

  useEffect(() => {
    if (!hn) return
    setLoading(true)
    void fetchRecruitment(hn)
      .then((resp) => {
        const rec = resp as Record<string, unknown>
        setData({
          ...EMPTY_RECRUITMENT,
          recruitment_status: String(rec.recruitment_status ?? ''),
          pis_sent: Boolean(rec.pis_sent),
          date_pis_sent: String(rec.date_pis_sent ?? ''),
          consent_obtained: Boolean(rec.consent_obtained),
          date_consent: String(rec.date_consent ?? ''),
          date_identified: String(rec.date_identified ?? ''),
          date_first_contact: String(rec.date_first_contact ?? ''),
          contact_number: String(rec.contact_number ?? ''),
          email_address: String(rec.email_address ?? ''),
          source: String(rec.source ?? ''),
          notes: String(rec.notes ?? ''),
          inx_rhc: String(rec.inx_rhc ?? ''),
          inx_echo: String(rec.inx_echo ?? ''),
          inx_cmr: String(rec.inx_cmr ?? ''),
          inx_cpex: String(rec.inx_cpex ?? ''),
        })
        setIsNew(false)
        setNotFound(false)
      })
      .catch(() => {
        setNotFound(true)
        setIsNew(true)
      })
      .finally(() => {
        setLoading(false)
        setTimeout(() => { initialLoadDone.current = true }, 100)
      })
  }, [hn])

  const set = useCallback(
    <K extends keyof RecruitmentData>(field: K, value: RecruitmentData[K]) => {
      setData((prev) => ({ ...prev, [field]: value }))
    },
    [],
  )

  const setToday = useCallback(
    (field: RecruitmentDateField) => {
      set(field, formatTodayDate())
    },
    [set],
  )

  // Autosave on data changes (debounced 800ms)
  useEffect(() => {
    if (!initialLoadDone.current || !hn || notFound) return
    if (saveTimer.current) clearTimeout(saveTimer.current)
    saveTimer.current = setTimeout(async () => {
      setSaveStatus('saving')
      try {
        if (isNew) {
          await createRecruitment(hn, data as unknown as Record<string, unknown>)
          setIsNew(false)
        } else {
          await updateRecruitment(hn, data as unknown as Record<string, unknown>)
        }
        setSaveStatus('saved')
        setTimeout(() => setSaveStatus('idle'), 1500)
      } catch {
        setSaveStatus('idle')
      }
    }, 800)
    return () => { if (saveTimer.current) clearTimeout(saveTimer.current) }
  }, [data]) // eslint-disable-line react-hooks/exhaustive-deps

  const handleCreate = () => {
    setNotFound(false)
    setData({ ...EMPTY_RECRUITMENT })
    setIsNew(true)
    setTimeout(() => { initialLoadDone.current = true }, 100)
  }

  const hasLegacyNotes = data.notes.trim().length > 0

  const deleteLegacyNotes = () => {
    if (!window.confirm('Delete these legacy notes?')) return
    set('notes', '')
  }

  if (loading) {
    return (
      <div className="space-y-4">
        <div className="h-6 w-48 animate-pulse rounded bg-[hsl(var(--tone-neutral-200))]" />
        <div className="h-24 w-full animate-pulse rounded-lg bg-[hsl(var(--tone-neutral-200))]" />
      </div>
    )
  }

  if (notFound) {
    return (
      <div className="rounded-lg border border-[hsl(var(--stroke-soft)/0.72)] bg-[hsl(var(--card))] px-6 py-12 text-center shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
        <p className="mb-4 text-sm text-[hsl(var(--muted-foreground))]">
          No recruitment record exists for this patient.
        </p>
        <button
          type="button"
          onClick={handleCreate}
          className="inline-flex items-center gap-1.5 rounded-md bg-[hsl(var(--tone-accent-600))] px-4 py-2 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-[hsl(var(--tone-accent-700))]"
        >
          <Plus className="h-4 w-4" />
          Create Recruitment Record
        </button>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold uppercase tracking-[0.05em] text-[hsl(var(--muted-foreground))]">
          Recruitment
        </h2>
        <span className={cn(
          'text-xs font-medium transition-opacity duration-300',
          saveStatus === 'saving' && 'text-[hsl(var(--tone-neutral-500))]',
          saveStatus === 'saved' && 'text-[hsl(var(--tone-positive-600))]',
          saveStatus === 'idle' && 'opacity-0',
        )}>
          {saveStatus === 'saving' ? 'Saving...' : saveStatus === 'saved' ? 'Saved' : ''}
        </span>
      </div>

      {/* Pipeline stepper */}
      <div className="rounded-lg border border-[hsl(var(--stroke-soft)/0.72)] bg-[hsl(var(--card))] px-6 py-5 shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
        <PipelineStepper
          currentStatus={data.recruitment_status}
          onStatusChange={(status) => set('recruitment_status', status)}
        />
      </div>

      {/* Consent & Dates — compact row */}
      <div className="grid gap-4 sm:grid-cols-2">
        {/* Consent card */}
        <div className="rounded-lg border border-[hsl(var(--stroke-soft)/0.72)] bg-[hsl(var(--card))]">
          <div className="border-b border-[hsl(var(--stroke-soft)/0.5)] bg-[hsl(var(--tone-neutral-50))] px-4 py-2">
            <h4 className="text-sm font-semibold tracking-tight text-[hsl(var(--foreground))]">Consent</h4>
          </div>
          <div className="px-4 py-3 space-y-3">
            <div className="flex items-center justify-between gap-4">
              <label className="flex items-center gap-2 cursor-pointer shrink-0">
                <input
                  type="checkbox"
                  checked={data.pis_sent}
                  onChange={(e) => set('pis_sent', e.target.checked)}
                  className="h-4 w-4 rounded border-[hsl(var(--border))] accent-[hsl(var(--tone-accent-600))]"
                />
                <span className="text-sm text-[hsl(var(--foreground))]">PIS sent</span>
              </label>
              <DateEntryField
                value={data.date_pis_sent}
                onChange={(value) => set('date_pis_sent', value)}
                onToday={() => setToday('date_pis_sent')}
                label="PIS sent"
              />
            </div>
            <div className="flex items-center justify-between gap-4">
              <label className="flex items-center gap-2 cursor-pointer shrink-0">
                <input
                  type="checkbox"
                  checked={data.consent_obtained}
                  onChange={(e) => set('consent_obtained', e.target.checked)}
                  className="h-4 w-4 rounded border-[hsl(var(--border))] accent-[hsl(var(--tone-accent-600))]"
                />
                <span className="text-sm text-[hsl(var(--foreground))]">Consent obtained</span>
              </label>
              <DateEntryField
                value={data.date_consent}
                onChange={(value) => set('date_consent', value)}
                onToday={() => setToday('date_consent')}
                label="consent"
              />
            </div>
          </div>
        </div>

        {/* Key dates card */}
        <div className="rounded-lg border border-[hsl(var(--stroke-soft)/0.72)] bg-[hsl(var(--card))]">
          <div className="border-b border-[hsl(var(--stroke-soft)/0.5)] bg-[hsl(var(--tone-neutral-50))] px-4 py-2">
            <h4 className="text-sm font-semibold tracking-tight text-[hsl(var(--foreground))]">Key dates</h4>
          </div>
          <div className="px-4 py-3 space-y-3">
            <div className="flex items-center justify-between gap-4">
              <span className="text-sm text-[hsl(var(--foreground))] shrink-0">Identified</span>
              <DateEntryField
                value={data.date_identified}
                onChange={(value) => set('date_identified', value)}
                onToday={() => setToday('date_identified')}
                label="identified"
              />
            </div>
            <div className="flex items-center justify-between gap-4">
              <span className="text-sm text-[hsl(var(--foreground))] shrink-0">First contact</span>
              <DateEntryField
                value={data.date_first_contact}
                onChange={(value) => set('date_first_contact', value)}
                onToday={() => setToday('date_first_contact')}
                label="first contact"
              />
            </div>
          </div>
        </div>
      </div>

      {/* Contact */}
      <div className="rounded-lg border border-[hsl(var(--stroke-soft)/0.72)] bg-[hsl(var(--card))]">
        <div className="border-b border-[hsl(var(--stroke-soft)/0.5)] bg-[hsl(var(--tone-neutral-50))] px-4 py-2">
          <h4 className="text-sm font-semibold tracking-tight text-[hsl(var(--foreground))]">Contact</h4>
        </div>
        <div className="px-4 py-3">
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="grid gap-1.5">
              <span className="house-field-label">Contact number</span>
              <input type="text" value={data.contact_number} onChange={(e) => set('contact_number', e.target.value)} placeholder="-" className="house-input rounded-lg px-3 py-2 text-sm" />
            </label>
            <label className="grid gap-1.5">
              <span className="house-field-label">Email address</span>
              <input type="text" value={data.email_address} onChange={(e) => set('email_address', e.target.value)} placeholder="-" className="house-input rounded-lg px-3 py-2 text-sm" />
            </label>
          </div>
        </div>
      </div>

      {/* Modality indicators */}
      {patient && (
        <ModalityIndicators
          patient={patient}
          statuses={{ rhc: data.inx_rhc, echo: data.inx_echo, cmr: data.inx_cmr, cpex: data.inx_cpex }}
          onStatusChange={(mod, status) => set(`inx_${mod}` as keyof RecruitmentData, status)}
        />
      )}

      {/* Notes */}
      <div className="rounded-lg border border-[hsl(var(--stroke-soft)/0.72)] bg-[hsl(var(--card))]">
        <div className="border-b border-[hsl(var(--stroke-soft)/0.5)] bg-[hsl(var(--tone-neutral-50))] px-4 py-2">
          <h4 className="text-sm font-semibold tracking-tight text-[hsl(var(--foreground))]">Notes</h4>
        </div>
        <div className="space-y-5 px-4 py-3">
          <StructuredNotes hn={hn} />

          {hasLegacyNotes && (
            <div className="border-t border-[hsl(var(--stroke-soft)/0.72)] pt-4">
              <div className="mb-2 flex items-center justify-between gap-3">
                <div>
                  <h5 className="text-sm font-semibold text-[hsl(var(--foreground))]">Legacy notes</h5>
                  <p className="mt-0.5 text-xs text-[hsl(var(--muted-foreground))]">
                    Existing free-text notes are kept here until you move them into the note list above.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={deleteLegacyNotes}
                  className="inline-flex shrink-0 items-center gap-1.5 rounded-md border border-[hsl(var(--tone-danger-300))] bg-white px-3 py-1.5 text-xs font-semibold text-[hsl(var(--tone-danger-600))] hover:bg-[hsl(var(--tone-danger-50))]"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                  Delete legacy notes
                </button>
              </div>
              <textarea
                value={data.notes}
                onChange={(e) => set('notes', e.target.value)}
                rows={3}
                placeholder="-"
                className="house-textarea min-h-20 w-full rounded-lg px-3 py-2.5 text-sm resize-y"
              />
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
