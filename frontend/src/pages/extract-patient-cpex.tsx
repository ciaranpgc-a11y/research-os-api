import { Fragment, useCallback, useEffect, useState } from 'react'
import { Plus, Save, Loader2, X } from 'lucide-react'

import { fetchRecords, createRecord, updateRecord } from '@/lib/extract-api'
import { cn } from '@/lib/utils'
import { usePatientContext } from './extract-patient-detail-page'
import { SourceFileCell, SourceFileHeaderCell } from '@/components/extract/source-file-cell'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type CpexRecord = {
  id: string
  hn: string
  date_cpex: string
  source_file: string
  status: string
  status_date: string
  created_at: string
}

const CPEX_STATUSES = ['Pending', 'Reviewed', 'Archived']

// ---------------------------------------------------------------------------
// Form helpers
// ---------------------------------------------------------------------------

function FieldLabel({ children }: { children: React.ReactNode }) {
  return (
    <label className="block text-xs font-medium text-[hsl(var(--muted-foreground))] mb-1.5">
      {children}
    </label>
  )
}

// ---------------------------------------------------------------------------
// CPEX Form
// ---------------------------------------------------------------------------

function CpexForm({
  record,
  hn,
  isNew,
  onSaved,
  onCancel,
}: {
  record: Partial<CpexRecord>
  hn: string
  isNew: boolean
  onSaved: () => void
  onCancel: () => void
}) {
  const [dateCpex, setDateCpex] = useState(record.date_cpex ?? '')
  const [sourceFile, setSourceFile] = useState(record.source_file ?? '')
  const [status, setStatus] = useState(record.status ?? 'Pending')
  const [saving, setSaving] = useState(false)

  const handleSave = async () => {
    setSaving(true)
    try {
      const payload = { hn, date_cpex: dateCpex, source_file: sourceFile, status }
      if (isNew) {
        await createRecord('cpex', payload)
      } else {
        await updateRecord('cpex', record.id!, payload)
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
      <div className="rounded-lg border border-[hsl(var(--stroke-soft)/0.72)] bg-[hsl(var(--card))] px-5 py-4 shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
        <div className="grid gap-4 sm:grid-cols-3">
          <div>
            <FieldLabel>Date</FieldLabel>
            <input
              type="date"
              value={dateCpex}
              onChange={(e) => setDateCpex(e.target.value)}
              className="house-input w-full text-sm"
            />
          </div>
          <div>
            <FieldLabel>Source File</FieldLabel>
            <input
              type="text"
              value={sourceFile}
              onChange={(e) => setSourceFile(e.target.value)}
              className="house-input w-full text-sm"
            />
          </div>
          <div>
            <FieldLabel>Status</FieldLabel>
            <select
              value={status}
              onChange={(e) => setStatus(e.target.value)}
              className="house-input w-full text-sm"
            >
              {CPEX_STATUSES.map((s) => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* Actions */}
      <div className="flex items-center gap-3">
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
// Main component
// ---------------------------------------------------------------------------

export default function ExtractPatientCpex() {
  const { patient } = usePatientContext()
  const hn = patient?.hn ?? ''

  const [records, setRecords] = useState<CpexRecord[]>([])
  const [loading, setLoading] = useState(true)
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [isCreating, setIsCreating] = useState(false)

  const loadRecords = useCallback(() => {
    if (!hn) return
    setLoading(true)
    void fetchRecords('cpex', { hn })
      .then((data) => {
        const arr = Array.isArray(data) ? data : (data as { items?: unknown[] }).items ?? []
        setRecords(arr as CpexRecord[])
      })
      .catch(() => setRecords([]))
      .finally(() => setLoading(false))
  }, [hn])

  useEffect(() => {
    loadRecords()
  }, [loadRecords])

  const handleRowClick = (rec: CpexRecord) => {
    if (expandedId === rec.id) {
      setExpandedId(null)
    } else {
      setIsCreating(false)
      setExpandedId(rec.id)
    }
  }

  const handleAddNew = () => {
    setExpandedId(null)
    setIsCreating(true)
  }

  const handleSaved = () => {
    setIsCreating(false)
    setExpandedId(null)
    loadRecords()
  }

  const handleCancel = () => {
    setIsCreating(false)
    setExpandedId(null)
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
          CPEX Records
        </h2>
        <button
          type="button"
          onClick={handleAddNew}
          className="inline-flex items-center gap-1.5 rounded-md bg-[hsl(var(--tone-accent-600))] px-4 py-2 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-[hsl(var(--tone-accent-700))]"
        >
          <Plus className="h-4 w-4" />
          Add CPEX Record
        </button>
      </div>

      {/* New record form */}
      {isCreating && (
        <div className="rounded-lg border-2 border-dashed border-[hsl(var(--tone-accent-300))] bg-[hsl(var(--tone-accent-50)/0.3)] px-5">
          <CpexForm
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
            No CPEX records found for this patient.
          </p>
        </div>
      ) : (
        <div className="rounded-lg border border-[hsl(var(--stroke-soft)/0.72)] bg-[hsl(var(--card))] shadow-[0_1px_3px_rgba(0,0,0,0.04)] overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-[hsl(var(--stroke-soft)/0.72)] bg-[hsl(var(--tone-neutral-50))]">
                <th className="px-4 py-2.5 text-left text-xs font-semibold uppercase tracking-[0.05em] text-[hsl(var(--muted-foreground))]">Date</th>
                <th className="w-14 px-0 py-0">
                  <SourceFileHeaderCell />
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[hsl(var(--stroke-soft)/0.4)]">
              {records.map((rec) => (
                <Fragment key={rec.id}>
                  <tr>
                    <td className="p-0">
                    <button
                      type="button"
                      onClick={() => handleRowClick(rec)}
                      className={cn(
                        'flex w-full text-left transition-colors',
                        expandedId === rec.id
                          ? 'bg-[hsl(var(--tone-accent-50)/0.5)]'
                          : 'hover:bg-[hsl(var(--tone-neutral-50))]',
                      )}
                    >
                      <span className="px-4 py-2.5">{rec.date_cpex || '\u2014'}</span>
                    </button>
                    </td>
                    <td className="w-14 p-0">
                      <SourceFileCell modality="cpex" recordId={rec.id} />
                    </td>
                  </tr>
                    {expandedId === rec.id && (
                    <tr>
                      <td colSpan={2} className="p-0">
                      <div className="border-t border-[hsl(var(--stroke-soft)/0.4)] px-5 bg-[hsl(var(--tone-neutral-50)/0.3)]">
                        <CpexForm
                          record={rec}
                          hn={hn}
                          isNew={false}
                          onSaved={handleSaved}
                          onCancel={handleCancel}
                        />
                      </div>
                      </td>
                    </tr>
                    )}
                </Fragment>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
