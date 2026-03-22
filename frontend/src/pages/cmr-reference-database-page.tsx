import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from 'react'

import { PageHeader, Row, Stack } from '@/components/primitives'
import { PanelShell, SectionMarker } from '@/components/patterns'
import type {
  CmrCanonicalParam,
  CmrParameterRangesResponse,
  CmrReferenceRangeUpdate,
  CmrSourceCitation,
} from '@/lib/cmr-api'
import {
  fetchReferenceParameters,
  fetchParameterRanges,
  updateReferenceRanges,
  updateParameterMeta,
  fetchSections,
  saveEditMode,
} from '@/lib/cmr-api'
import { getAllParameterKeys } from '@/lib/cmr-local-data'
import { inferSeverityLabel } from '@/lib/cmr-severity'
import { cn } from '@/lib/utils'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function titleCase(s: string): string {
  return s
    .toLowerCase()
    .split(' ')
    .map((w) => (w.length <= 2 && w !== 'of' ? w.toUpperCase() : w.charAt(0).toUpperCase() + w.slice(1)))
    .join(' ')
}

function displayName(key: string): string {
  return key.replace(/\s*\(i\)\s*$/, '')
}

function fmt(v: number | null): string {
  if (v === null) return ''
  return String(Math.round(v * 100) / 100)
}

function BsaPill() {
  return (
    <span className="ml-1.5 inline-flex items-center rounded-full bg-[hsl(var(--tone-neutral-200))] px-[7px] py-[1px] text-[10px] font-semibold tracking-wide text-[hsl(var(--tone-neutral-600))]">
      BSA
    </span>
  )
}

function PapPill() {
  return (
    <span className="inline-flex items-center rounded-full bg-[hsl(var(--tone-warning-100))] px-[7px] py-[1px] text-[10px] font-semibold tracking-wide text-[hsl(var(--tone-warning-700))]">
      PAP
    </span>
  )
}

function DirectionIndicator({ dir }: { dir: string }) {
  if (dir === 'high')
    return <span className="text-[hsl(var(--tone-danger-500))]" title="Abnormal if high">&#9650;</span>
  if (dir === 'low')
    return <span className="text-[hsl(var(--tone-accent-500))]" title="Abnormal if low">&#9660;</span>
  if (dir === 'both')
    return <span className="text-[hsl(var(--tone-warning-500))]" title="Abnormal if high or low">&#9670;</span>
  return null
}

function DragHandleIcon({ className }: { className?: string }) {
  return (
    <svg className={cn('h-4 w-4 text-[hsl(var(--muted-foreground))]', className)} viewBox="0 0 16 16" fill="currentColor">
      <circle cx="5" cy="3" r="1.2" /><circle cx="11" cy="3" r="1.2" />
      <circle cx="5" cy="8" r="1.2" /><circle cx="11" cy="8" r="1.2" />
      <circle cx="5" cy="13" r="1.2" /><circle cx="11" cy="13" r="1.2" />
    </svg>
  )
}

function ChevronIcon({ open }: { open: boolean }) {
  return (
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
  )
}

// ---------------------------------------------------------------------------
// Nested parameter helpers — derived from `nested_under` in reference data
// ---------------------------------------------------------------------------

function buildNestedParamMap(params: CmrCanonicalParam[]): Record<string, string[]> {
  const map: Record<string, string[]> = {}
  for (const p of params) {
    if (p.nested_under) {
      if (!map[p.nested_under]) map[p.nested_under] = []
      map[p.nested_under].push(p.parameter_key)
    }
  }
  return map
}

function buildNestedChildrenSet(nestedMap: Record<string, string[]>): Set<string> {
  return new Set(Object.values(nestedMap).flat())
}

// ---------------------------------------------------------------------------
// Parameter editor — metadata + all sex x age band ranges for one parameter
// ---------------------------------------------------------------------------

const SEX_PRESETS = ['Male', 'Female', 'All'] as const
const FIELDS = ['ll', 'mean', 'ul', 'sd'] as const
const MASS_FIELDS = ['ll_mass', 'mean_mass', 'ul_mass', 'sd_mass'] as const
const INDEXED_OPTIONS = ['Yes', 'No'] as const

/** Reusable inline field for metadata editing */
function MetaField({
  label,
  value,
  onChange,
  placeholder,
  type = 'text',
  options,
  optionLabels,
  className: extraClass,
}: {
  label: string
  value: string
  onChange: (v: string) => void
  placeholder?: string
  type?: 'text' | 'select'
  options?: readonly string[]
  optionLabels?: Record<string, string>
  className?: string
}) {
  return (
    <div className={cn('space-y-1', extraClass)}>
      <label className="block text-xs font-medium text-[hsl(var(--muted-foreground))]">{label}</label>
      {type === 'select' && options ? (
        <select
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="w-full rounded-md border border-[hsl(var(--border))] bg-[hsl(var(--background))] px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-[hsl(var(--tone-neutral-400))]"
        >
          {options.map((o) => (
            <option key={o} value={o}>{optionLabels?.[o] ?? (o || '\u2014 none')}</option>
          ))}
        </select>
      ) : (
        <input
          type="text"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          className="w-full rounded-md border border-[hsl(var(--border))] bg-[hsl(var(--background))] px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-[hsl(var(--tone-neutral-400))]"
        />
      )}
    </div>
  )
}

const DIRECTION_PICKER_OPTIONS: { value: string; label: string; icon: string; colorClass: string }[] = [
  { value: 'high', label: 'High', icon: '\u25B2', colorClass: 'text-[hsl(var(--tone-danger-500))]' },
  { value: 'low', label: 'Low', icon: '\u25BC', colorClass: 'text-[hsl(var(--tone-accent-500))]' },
  { value: 'both', label: 'Both', icon: '\u25C6', colorClass: 'text-[hsl(var(--tone-warning-500))]' },
  { value: '', label: 'None', icon: '\u2014', colorClass: 'text-[hsl(var(--muted-foreground))]' },
]

function DirectionPicker({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [open])

  const selected = DIRECTION_PICKER_OPTIONS.find((o) => o.value === value) || DIRECTION_PICKER_OPTIONS[3]

  return (
    <div ref={ref} className="relative space-y-1">
      <label className="block text-xs font-medium text-[hsl(var(--muted-foreground))]">Direction</label>
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="flex w-full items-center gap-2 rounded-md border border-[hsl(var(--border))] bg-[hsl(var(--background))] px-2 py-1.5 text-left text-sm focus:outline-none focus:ring-2 focus:ring-[hsl(var(--tone-neutral-400))]"
      >
        <span className={selected.colorClass}>{selected.icon}</span>
        <span className="flex-1">{selected.label}</span>
        <svg className="h-3 w-3 text-[hsl(var(--muted-foreground))]" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 5l3 3 3-3" /></svg>
      </button>
      {open && (
        <div className="absolute left-0 top-full z-50 mt-1 w-full rounded-md border border-[hsl(var(--border))] bg-[hsl(var(--background))] py-1 shadow-lg">
          {DIRECTION_PICKER_OPTIONS.map((o) => (
            <button
              key={o.value}
              type="button"
              onClick={() => { onChange(o.value); setOpen(false) }}
              className={cn(
                'flex w-full items-center gap-2 px-2.5 py-1.5 text-sm transition-colors hover:bg-[hsl(var(--tone-neutral-100))]',
                o.value === value && 'bg-[hsl(var(--tone-neutral-50))] font-medium',
              )}
            >
              <span className={o.colorClass}>{o.icon}</span>
              <span>{o.label}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

function ParameterEditor({
  parameterKey,
  isNew,
  onClose,
  onDeleted,
  sectionsConfig,
}: {
  parameterKey: string
  isNew?: boolean
  onClose: () => void
  onDeleted?: () => void
  sectionsConfig: Record<string, string[]>
}) {
  const [data, setData] = useState<CmrParameterRangesResponse | null>(null)
  const [loading, setLoading] = useState(!isNew)
  const [edits, setEdits] = useState<Record<string, string>>({})
  const [editHistory, setEditHistory] = useState<Array<{ edits: Record<string, string>; metaDirty: boolean; metaUnit: string; metaSection: string; metaSubSection: string; metaIndexed: string; metaDirection: string; metaPapAffected: boolean; metaNestedUnder: string; metaDecimalPlaces: string; metaSeverityLabel: string; metaSeverityThresholds: { mild: string; moderate: string; severe: string }; metaSeverityOverrides: { mild: string; moderate: string; severe: string } }>>([])
  const [saving, setSaving] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)

  // Metadata state — editable fields
  const [metaKey, setMetaKey] = useState(parameterKey)
  const [metaUnit, setMetaUnit] = useState('')
  const [metaSection, setMetaSection] = useState('')
  const [metaSubSection, setMetaSubSection] = useState('')
  const [metaIndexed, setMetaIndexed] = useState<string>('No')
  const [metaDirection, setMetaDirection] = useState<string>('')
  const [metaPapAffected, setMetaPapAffected] = useState(false)

  // Sources
  const [sources, setSources] = useState<CmrSourceCitation[]>([])

  // Severity grading
  const [metaSeverityLabel, setMetaSeverityLabel] = useState<string>('')
  const [metaSeverityThresholds, setMetaSeverityThresholds] = useState<{ mild: string; moderate: string; severe: string }>({ mild: '', moderate: '', severe: '' })
  const [metaSeverityOverrides, setMetaSeverityOverrides] = useState<{ mild: string; moderate: string; severe: string }>({ mild: '', moderate: '', severe: '' })

  // Nesting
  const [metaNestedUnder, setMetaNestedUnder] = useState('')

  // Decimal places
  const [metaDecimalPlaces, setMetaDecimalPlaces] = useState('')

  // Track whether metadata has been modified
  const [metaDirty, setMetaDirty] = useState(false)

  // Flexible sex groups and age bands
  const [sexGroups, setSexGroups] = useState<string[]>([])
  const [bandsBySex, setBandsBySex] = useState<Record<string, string[]>>({})
  const [addingSexGroup, setAddingSexGroup] = useState(false)
  const newBandRef = useRef<HTMLInputElement | null>(null)

  const majorSectionOptions = Object.keys(sectionsConfig) as readonly string[]
  const majorSectionLabels = Object.fromEntries(majorSectionOptions.map((k) => [k, titleCase(k)]))
  const subSectionOptions = (metaSection ? ['', ...(sectionsConfig[metaSection] || [])] : ['']) as readonly string[]

  useEffect(() => {
    if (isNew) {
      setLoading(false)
      setMetaDirty(true)
      setSexGroups([])
      setBandsBySex({})
      return
    }
    setLoading(true)
    setEdits({})
    fetchParameterRanges(parameterKey)
      .then((d) => {
        setData(d)
        setMetaKey(d.parameter_key)
        setMetaUnit(d.unit)
        setMetaSection(d.major_section)
        setMetaSubSection(d.sub_section)
        setMetaIndexed(d.indexing === 'BSA' ? 'Yes' : 'No')
        setMetaDirection(d.abnormal_direction)
        setMetaPapAffected(d.ranges.some((r) => r.ll_mass !== null || r.mean_mass !== null || r.ul_mass !== null || r.sd_mass !== null))
        setSources(d.sources || [])
        setMetaNestedUnder(d.nested_under ?? '')
        setMetaDecimalPlaces(d.decimal_places !== undefined && d.decimal_places !== null ? String(d.decimal_places) : '')
        setMetaSeverityLabel(d.severity_label ?? '')
        setMetaSeverityThresholds({
          mild: d.severity_thresholds?.mild?.toString() ?? '',
          moderate: d.severity_thresholds?.moderate?.toString() ?? '',
          severe: d.severity_thresholds?.severe?.toString() ?? '',
        })
        setMetaSeverityOverrides({
          mild: d.severity_label_override?.mild ?? '',
          moderate: d.severity_label_override?.moderate ?? '',
          severe: d.severity_label_override?.severe ?? '',
        })

        // Derive sex groups and bands from existing data
        const sexMap: Record<string, string[]> = {}
        for (const r of d.ranges) {
          if (!sexMap[r.sex]) sexMap[r.sex] = []
          if (!sexMap[r.sex].includes(r.age_band)) sexMap[r.sex].push(r.age_band)
        }
        const orderedSexes = Object.keys(sexMap).sort((a, b) => {
          const order = ['Male', 'Female', 'All']
          return (order.indexOf(a) === -1 ? 99 : order.indexOf(a)) - (order.indexOf(b) === -1 ? 99 : order.indexOf(b))
        })
        setSexGroups(orderedSexes)
        setBandsBySex(sexMap)
      })
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [parameterKey, isNew])

  const addSexGroup = (sex: string) => {
    if (sexGroups.includes(sex)) return
    setSexGroups((prev) => [...prev, sex])
    setBandsBySex((prev) => ({ ...prev, [sex]: [] }))
    setMetaDirty(true)
    setAddingSexGroup(false)
  }

  const removeSexGroup = (sex: string) => {
    setSexGroups((prev) => prev.filter((s) => s !== sex))
    setBandsBySex((prev) => { const next = { ...prev }; delete next[sex]; return next })
    // Clear edits for this sex
    setEdits((prev) => {
      const next: Record<string, string> = {}
      for (const [k, v] of Object.entries(prev)) {
        if (!k.startsWith(`${sex}|`)) next[k] = v
      }
      return next
    })
    setMetaDirty(true)
  }

  const addBand = (sex: string) => {
    const existing = bandsBySex[sex] || []
    let name = 'New Band'
    let i = 2
    while (existing.includes(name)) { name = `New Band ${i}`; i++ }
    setBandsBySex((prev) => ({
      ...prev,
      [sex]: [...existing, name],
    }))
    setMetaDirty(true)
    // Focus the new band name input after render
    requestAnimationFrame(() => {
      newBandRef.current?.focus()
      newBandRef.current?.select()
    })
  }

  const renameBand = (sex: string, oldName: string, newName: string) => {
    const trimmed = newName.trim()
    if (!trimmed || trimmed === oldName) return
    if (bandsBySex[sex]?.includes(trimmed)) return
    pushUndo()
    setBandsBySex((prev) => ({
      ...prev,
      [sex]: (prev[sex] || []).map((b) => (b === oldName ? trimmed : b)),
    }))
    // Migrate edits from old band name to new
    setEdits((prev) => {
      const next: Record<string, string> = {}
      for (const [k, v] of Object.entries(prev)) {
        if (k.startsWith(`${sex}|${oldName}|`)) {
          const field = k.split('|')[2]
          next[`${sex}|${trimmed}|${field}`] = v
        } else {
          next[k] = v
        }
      }
      return next
    })
    setMetaDirty(true)
  }

  const removeBand = (sex: string, band: string) => {
    setBandsBySex((prev) => ({
      ...prev,
      [sex]: (prev[sex] || []).filter((b) => b !== band),
    }))
    // Clear edits for this band
    setEdits((prev) => {
      const next: Record<string, string> = {}
      for (const [k, v] of Object.entries(prev)) {
        if (k !== `${sex}|${band}|ll` && k !== `${sex}|${band}|mean` && k !== `${sex}|${band}|ul` && k !== `${sex}|${band}|sd`) next[k] = v
      }
      return next
    })
    setMetaDirty(true)
  }

  // Drag-to-reorder age bands
  const dragState = useRef<{ sex: string; fromIdx: number } | null>(null)

  const moveBand = (sex: string, fromIdx: number, toIdx: number) => {
    if (fromIdx === toIdx) return
    pushUndo()
    setBandsBySex((prev) => {
      const arr = [...(prev[sex] || [])]
      const [moved] = arr.splice(fromIdx, 1)
      arr.splice(toIdx, 0, moved)
      return { ...prev, [sex]: arr }
    })
    setMetaDirty(true)
  }

  const cellKey = (sex: string, ageBand: string, field: string) => `${sex}|${ageBand}|${field}`

  const pushUndo = () => {
    setEditHistory((prev) => [...prev.slice(-19), { edits: { ...edits }, metaDirty, metaUnit, metaSection, metaSubSection, metaIndexed, metaDirection, metaPapAffected, metaNestedUnder, metaDecimalPlaces, metaSeverityLabel, metaSeverityThresholds: { ...metaSeverityThresholds }, metaSeverityOverrides: { ...metaSeverityOverrides } }])
  }

  const handleUndo = () => {
    setEditHistory((prev) => {
      if (prev.length === 0) return prev
      const last = prev[prev.length - 1]
      setEdits(last.edits)
      setMetaUnit(last.metaUnit)
      setMetaSection(last.metaSection)
      setMetaSubSection(last.metaSubSection)
      setMetaIndexed(last.metaIndexed)
      setMetaDirection(last.metaDirection)
      setMetaPapAffected(last.metaPapAffected)
      setMetaNestedUnder(last.metaNestedUnder)
      setMetaDecimalPlaces(last.metaDecimalPlaces)
      setMetaSeverityLabel(last.metaSeverityLabel)
      setMetaSeverityThresholds(last.metaSeverityThresholds)
      setMetaSeverityOverrides(last.metaSeverityOverrides)
      setMetaDirty(last.metaDirty)
      return prev.slice(0, -1)
    })
  }

  const handleChange = (sex: string, ageBand: string, field: string, value: string) => {
    pushUndo()
    setEdits((prev) => ({ ...prev, [cellKey(sex, ageBand, field)]: value }))
  }

  const getCellValue = (sex: string, ageBand: string, field: 'll' | 'mean' | 'ul' | 'sd' | 'll_mass' | 'mean_mass' | 'ul_mass' | 'sd_mass') => {
    const key = cellKey(sex, ageBand, field)
    if (key in edits) return edits[key]
    const range = data?.ranges.find((r) => r.sex === sex && r.age_band === ageBand)
    const v = range?.[field]
    return v !== null && v !== undefined ? fmt(v) : ''
  }


  const handleSave = async () => {
    setSaving(true)
    try {
      // Save range edits
      const updateMap = new Map<string, CmrReferenceRangeUpdate>()
      for (const [key, val] of Object.entries(edits)) {
        const parts = key.split('|')
        const sex = parts[0]
        const ageBand = parts[1]
        const field = parts[2] as 'll' | 'mean' | 'ul' | 'sd' | 'll_mass' | 'mean_mass' | 'ul_mass' | 'sd_mass'
        const mapKey = `${sex}|${ageBand}`
        if (!updateMap.has(mapKey)) {
          updateMap.set(mapKey, { parameter: metaKey, sex, age_band: ageBand })
        }
        const entry = updateMap.get(mapKey)!
        const numVal = val.trim() === '' ? null : parseFloat(val)
        entry[field] = isNaN(numVal as number) ? null : numVal
      }
      const updates = Array.from(updateMap.values())
      if (updates.length > 0) {
        await updateReferenceRanges(updates)
      }

      // Save metadata changes
      if (metaDirty) {
        await updateParameterMeta({
          parameter_key: metaKey,
          unit: metaUnit,
          indexing: metaIndexed === 'Yes' ? 'BSA' : 'None',
          abnormal_direction: metaDirection,
          major_section: metaSection,
          sub_section: metaSubSection,
          pap_affected: metaPapAffected,
          sources,
          severity_label: metaSeverityLabel || null,
          severity_thresholds: (metaSeverityThresholds.mild || metaSeverityThresholds.moderate || metaSeverityThresholds.severe)
            ? {
                mild: metaSeverityThresholds.mild ? Number(metaSeverityThresholds.mild) : null,
                moderate: metaSeverityThresholds.moderate ? Number(metaSeverityThresholds.moderate) : null,
                severe: metaSeverityThresholds.severe ? Number(metaSeverityThresholds.severe) : null,
              }
            : null,
          severity_label_override: (metaSeverityOverrides.mild || metaSeverityOverrides.moderate || metaSeverityOverrides.severe)
            ? {
                mild: metaSeverityOverrides.mild || null,
                moderate: metaSeverityOverrides.moderate || null,
                severe: metaSeverityOverrides.severe || null,
              }
            : null,
          nested_under: metaNestedUnder || null,
          decimal_places: metaDecimalPlaces !== '' ? Number(metaDecimalPlaces) : null,
        })
      }

      if (!isNew) {
        const fresh = await fetchParameterRanges(metaKey)
        setData(fresh)
      }
      setEdits({})
      setMetaDirty(false)
      setEditHistory([])
    } catch {
      // ignore
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async () => {
    // TODO: call delete API when endpoint exists
    onDeleted?.()
    onClose()
  }

  const rangeDirtyCount = Object.keys(edits).length
  const totalDirtyCount = rangeDirtyCount + (metaDirty ? 1 : 0)

  return (
    <div className="space-y-4">
      {/* Header bar with back / save / delete */}
      <div className="flex items-center gap-3">
        <button
          onClick={onClose}
          className="rounded px-2 py-1 text-xs font-medium text-[hsl(var(--muted-foreground))] transition-colors hover:bg-[hsl(var(--tone-neutral-100))]"
        >
          &larr; Back
        </button>
        {!isNew && !confirmDelete && (
          <button
            onClick={() => setConfirmDelete(true)}
            className="rounded-md border border-[hsl(var(--tone-danger-200))] px-3 py-1.5 text-xs font-medium text-[hsl(var(--tone-danger-600))] transition-colors hover:bg-[hsl(var(--tone-danger-50))] hover:border-[hsl(var(--tone-danger-400))]"
          >
            Delete
          </button>
        )}
        {!isNew && confirmDelete && (
          <div className="flex items-center gap-2 rounded-md border border-[hsl(var(--tone-danger-200))] bg-[hsl(var(--tone-danger-50))] px-3 py-1">
            <span className="text-xs font-medium text-[hsl(var(--tone-danger-700))]">Delete this parameter?</span>
            <button
              onClick={() => setConfirmDelete(false)}
              className="rounded px-2 py-0.5 text-xs font-medium text-[hsl(var(--foreground))] transition-colors hover:bg-[hsl(var(--tone-neutral-200))]"
            >
              Cancel
            </button>
            <button
              onClick={handleDelete}
              className="rounded bg-[hsl(var(--tone-danger-600))] px-2.5 py-0.5 text-xs font-semibold text-white transition-colors hover:bg-[hsl(var(--tone-danger-700))]"
            >
              Confirm
            </button>
          </div>
        )}
        <div className="flex-1" />
        {totalDirtyCount > 0 && (
          <span className="text-xs font-medium text-[hsl(var(--tone-accent-600))]">
            {totalDirtyCount} unsaved change{totalDirtyCount !== 1 ? 's' : ''}
          </span>
        )}
        <button
          onClick={() => {
            if (data) {
              setMetaUnit(data.unit)
              setMetaSection(data.major_section)
              setMetaSubSection(data.sub_section)
              setMetaIndexed(data.indexing === 'BSA' ? 'Yes' : 'No')
              setMetaDirection(data.abnormal_direction)
              setMetaPapAffected(data.ranges.some((r) => r.ll_mass !== null || r.mean_mass !== null || r.ul_mass !== null || r.sd_mass !== null))
              setSources(data.sources || [])
            }
            setEdits({})
            setMetaDirty(false)
            setEditHistory([])
          }}
          disabled={totalDirtyCount === 0}
          className="rounded-md border border-[hsl(var(--border))] px-3 py-1.5 text-sm font-medium text-[hsl(var(--foreground))] transition-colors hover:bg-[hsl(var(--tone-neutral-100))] disabled:opacity-40"
        >
          Reset
        </button>
        <button
          onClick={handleUndo}
          disabled={editHistory.length === 0}
          className="rounded-md border border-[hsl(var(--border))] px-3 py-1.5 text-sm font-medium text-[hsl(var(--foreground))] transition-colors hover:bg-[hsl(var(--tone-neutral-100))] disabled:opacity-40"
        >
          Undo
        </button>
        <button
          onClick={handleSave}
          disabled={saving || totalDirtyCount === 0}
          className={cn(
            'rounded-md px-4 py-1.5 text-sm font-semibold transition-colors',
            'bg-[hsl(var(--tone-positive-500))] text-white hover:bg-[hsl(var(--tone-positive-600))]',
            'disabled:cursor-not-allowed disabled:opacity-50',
          )}
        >
          {saving ? 'Saving...' : isNew ? 'Create Parameter' : 'Save Changes'}
        </button>
      </div>

      {loading ? (
        <p className="py-6 text-center text-sm text-[hsl(var(--muted-foreground))]">Loading...</p>
      ) : (
        <>
          {/* ---- Metadata card ---- */}
          <PanelShell surface="card" inset="md" spaceY="sm" bodySpace="sm">
            <div className="flex items-center gap-2 pb-2">
              <h3 className="text-sm font-semibold text-[hsl(var(--foreground))]">Parameter Metadata</h3>
              {!isNew && (
                <DirectionIndicator dir={metaDirection} />
              )}
            </div>
            <div className="grid grid-cols-[1fr_1fr_1fr] gap-x-4 gap-y-3">
              <MetaField
                label="Parameter Key"
                value={metaKey}
                onChange={(v) => { pushUndo(); setMetaKey(v); setMetaDirty(true) }}
                placeholder="e.g. LV EDV"
                className=""
              />
              <MetaField
                label="Major Section"
                value={metaSection}
                onChange={(v) => { pushUndo(); setMetaSection(v); setMetaSubSection(''); setMetaDirty(true) }}
                type="select"
                options={majorSectionOptions}
                optionLabels={majorSectionLabels}
              />
              <MetaField
                label="Sub-Section"
                value={metaSubSection}
                onChange={(v) => { pushUndo(); setMetaSubSection(v); setMetaDirty(true) }}
                type="select"
                options={subSectionOptions}
              />
            </div>
            <div className="grid grid-cols-[0.6fr_0.6fr_1fr_0.6fr] gap-x-4">
              <MetaField
                label="Unit"
                value={metaUnit}
                onChange={(v) => { pushUndo(); setMetaUnit(v); setMetaDirty(true) }}
                placeholder="e.g. mL, mm, %"
              />
              <MetaField
                label="Indexed"
                value={metaIndexed}
                onChange={(v) => { pushUndo(); setMetaIndexed(v); setMetaDirty(true) }}
                type="select"
                options={INDEXED_OPTIONS}
              />
              <DirectionPicker
                value={metaDirection}
                onChange={(v) => { pushUndo(); setMetaDirection(v); setMetaDirty(true) }}
              />
              <MetaField
                label="Pap"
                value={metaPapAffected ? 'Yes' : 'No'}
                onChange={(v) => { pushUndo(); setMetaPapAffected(v === 'Yes'); setMetaDirty(true) }}
                type="select"
                options={INDEXED_OPTIONS}
              />
            </div>
            <div className="grid grid-cols-[1fr_auto] gap-x-4">
              <MetaField
                label="Nested under"
                value={metaNestedUnder}
                onChange={(v) => { pushUndo(); setMetaNestedUnder(v); setMetaDirty(true) }}
                placeholder="Parent parameter key (e.g. MAPSE)"
              />
              <MetaField
                label="Decimal places"
                value={metaDecimalPlaces}
                onChange={(v) => { pushUndo(); setMetaDecimalPlaces(v); setMetaDirty(true) }}
                type="select"
                options={['0', '1', '2', '3']}
              />
            </div>
          </PanelShell>

          {/* ---- Severity Grading ---- */}
          <PanelShell className="space-y-3">
            <h3 className="text-sm font-semibold text-[hsl(var(--foreground))]">Severity Grading</h3>
            <div className="grid grid-cols-2 gap-3">
              <MetaField
                label="Label type"
                value={metaSeverityLabel}
                onChange={(v) => { pushUndo(); setMetaSeverityLabel(v); setMetaDirty(true) }}
                type="select"
                options={['', 'impaired', 'dilated', 'enlarged', 'hypertrophied', 'thickened', 'stenosis', 'regurgitation', 'elevated', 'reduced', 'abnormal'] as const}
                optionLabels={{ '': `(auto: ${inferSeverityLabel(metaKey, metaSection, metaSubSection)})` }}
              />
              <div className="flex items-end pb-1 text-xs text-[hsl(var(--tone-neutral-400))]">
                Direction: <strong className="ml-1">{metaDirection || 'none'}</strong>
              </div>
            </div>
            <div className="space-y-1">
              <label className="block text-xs font-medium text-[hsl(var(--muted-foreground))]">
                Custom thresholds
              </label>
              <div className="grid grid-cols-3 gap-2">
                <input type="number" placeholder="Mild" value={metaSeverityThresholds.mild}
                  onChange={(e) => { pushUndo(); setMetaSeverityThresholds(prev => ({ ...prev, mild: e.target.value })); setMetaDirty(true) }}
                  className="w-full rounded-md border border-[hsl(var(--border))] bg-[hsl(var(--background))] px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-[hsl(var(--tone-neutral-400))]" />
                <input type="number" placeholder="Moderate" value={metaSeverityThresholds.moderate}
                  onChange={(e) => { pushUndo(); setMetaSeverityThresholds(prev => ({ ...prev, moderate: e.target.value })); setMetaDirty(true) }}
                  className="w-full rounded-md border border-[hsl(var(--border))] bg-[hsl(var(--background))] px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-[hsl(var(--tone-neutral-400))]" />
                <input type="number" placeholder="Severe" value={metaSeverityThresholds.severe}
                  onChange={(e) => { pushUndo(); setMetaSeverityThresholds(prev => ({ ...prev, severe: e.target.value })); setMetaDirty(true) }}
                  className="w-full rounded-md border border-[hsl(var(--border))] bg-[hsl(var(--background))] px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-[hsl(var(--tone-neutral-400))]" />
              </div>
              <p className="text-[10px] text-[hsl(var(--tone-neutral-400))]">
                Absolute cutoffs. Leave empty for SD-based grading (1/2/2+ SD beyond limit).
              </p>
            </div>
            <div className="space-y-1">
              <label className="block text-xs font-medium text-[hsl(var(--muted-foreground))]">
                Label overrides
              </label>
              <div className="grid grid-cols-3 gap-2">
                <input type="text" placeholder="Mild label" value={metaSeverityOverrides.mild}
                  onChange={(e) => { pushUndo(); setMetaSeverityOverrides(prev => ({ ...prev, mild: e.target.value })); setMetaDirty(true) }}
                  className="w-full rounded-md border border-[hsl(var(--border))] bg-[hsl(var(--background))] px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-[hsl(var(--tone-neutral-400))]" />
                <input type="text" placeholder="Moderate label" value={metaSeverityOverrides.moderate}
                  onChange={(e) => { pushUndo(); setMetaSeverityOverrides(prev => ({ ...prev, moderate: e.target.value })); setMetaDirty(true) }}
                  className="w-full rounded-md border border-[hsl(var(--border))] bg-[hsl(var(--background))] px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-[hsl(var(--tone-neutral-400))]" />
                <input type="text" placeholder="Severe label" value={metaSeverityOverrides.severe}
                  onChange={(e) => { pushUndo(); setMetaSeverityOverrides(prev => ({ ...prev, severe: e.target.value })); setMetaDirty(true) }}
                  className="w-full rounded-md border border-[hsl(var(--border))] bg-[hsl(var(--background))] px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-[hsl(var(--tone-neutral-400))]" />
              </div>
              <p className="text-[10px] text-[hsl(var(--tone-neutral-400))]">
                Override the auto-generated severity label. Leave empty to use default.
              </p>
            </div>
          </PanelShell>

          {/* ---- Range grids per sex group ---- */}
          {sexGroups.map((sex) => {
            const bands = bandsBySex[sex] || []
            return (
              <div key={sex} className="space-y-2">
                <div className="flex items-center gap-2">
                  <p className="pl-1 text-sm font-semibold text-[hsl(var(--foreground))]">{sex}</p>
                  <button
                    type="button"
                    onClick={() => removeSexGroup(sex)}
                    className="rounded px-1.5 py-0.5 text-[10px] font-medium text-[hsl(var(--tone-danger-500))] transition-colors hover:bg-[hsl(var(--tone-danger-50))]"
                    title={`Delete ${sex} group`}
                  >
                    Delete
                  </button>
                </div>
                <div className="overflow-x-auto rounded-md border border-[hsl(var(--stroke-soft)/0.72)]">
                  <table data-house-no-column-resize="true" className="w-full border-collapse text-sm">
                    <thead>
                      <tr className="border-b-2 border-[hsl(var(--tone-neutral-300))] bg-[hsl(var(--tone-neutral-50))]">
                        <th className="w-8 px-1 py-2" />
                        <th className="house-table-head-text px-3 py-2 text-left">Age Band</th>
                        {FIELDS.map((f) => (
                          <th key={f} className="house-table-head-text w-24 px-3 py-2 text-center">
                            {f.toUpperCase()}{metaPapAffected && <span className="text-[9px] font-normal"> (blood)</span>}
                          </th>
                        ))}
                        {metaPapAffected && MASS_FIELDS.map((f) => (
                          <th key={f} className="house-table-head-text w-24 px-3 py-2 text-center text-[hsl(var(--tone-warning-700))]">
                            {f.replace('_mass', '').toUpperCase()} <span className="text-[9px] font-normal">(mass)</span>
                          </th>
                        ))}
                        <th className="w-10 px-1 py-2" />
                      </tr>
                    </thead>
                    <tbody>
                      {bands.map((ab, bandIdx) => (
                        <tr
                          key={ab}
                          draggable
                          onDragStart={(e) => {
                            dragState.current = { sex, fromIdx: bandIdx }
                            e.dataTransfer.effectAllowed = 'move'
                            ;(e.currentTarget as HTMLElement).style.opacity = '0.4'
                          }}
                          onDragEnd={(e) => {
                            dragState.current = null
                            ;(e.currentTarget as HTMLElement).style.opacity = '1'
                          }}
                          onDragOver={(e) => {
                            e.preventDefault()
                            e.dataTransfer.dropEffect = 'move'
                          }}
                          onDrop={(e) => {
                            e.preventDefault()
                            if (dragState.current && dragState.current.sex === sex) {
                              moveBand(sex, dragState.current.fromIdx, bandIdx)
                            }
                            dragState.current = null
                          }}
                          className="border-b border-[hsl(var(--stroke-soft)/0.4)] transition-colors duration-100 hover:bg-[hsl(var(--tone-neutral-50)/0.65)]"
                        >
                          <td className="px-1 py-0.5 text-center cursor-grab active:cursor-grabbing select-none text-[hsl(var(--muted-foreground))]">
                            <svg className="mx-auto h-3.5 w-3.5" viewBox="0 0 16 16" fill="currentColor"><circle cx="5.5" cy="3.5" r="1.5" /><circle cx="10.5" cy="3.5" r="1.5" /><circle cx="5.5" cy="8" r="1.5" /><circle cx="10.5" cy="8" r="1.5" /><circle cx="5.5" cy="12.5" r="1.5" /><circle cx="10.5" cy="12.5" r="1.5" /></svg>
                          </td>
                          <td className="px-1 py-0.5">
                            <input
                              ref={bandIdx === bands.length - 1 ? newBandRef : undefined}
                              type="text"
                              defaultValue={ab}
                              onBlur={(e) => renameBand(sex, ab, e.target.value)}
                              onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur() }}
                              className="w-full rounded border border-transparent bg-transparent px-2 py-0.5 text-sm font-medium focus:border-[hsl(var(--border))] focus:bg-[hsl(var(--background))] focus:outline-none focus:ring-2 focus:ring-[hsl(var(--tone-neutral-400))]"
                            />
                          </td>
                          {FIELDS.map((f) => {
                            const val = getCellValue(sex, ab, f)
                            const isDirty = cellKey(sex, ab, f) in edits
                            return (
                              <td key={f} className="px-1 py-0.5">
                                <input
                                  type="text"
                                  inputMode="decimal"
                                  value={val}
                                  placeholder="–"
                                  onChange={(e) => handleChange(sex, ab, f, e.target.value)}
                                  className={cn(
                                    'w-full rounded border border-transparent bg-transparent px-1.5 py-0.5 text-center text-sm tabular-nums placeholder:text-[hsl(var(--muted-foreground)/0.3)]',
                                    'focus:border-[hsl(var(--border))] focus:bg-[hsl(var(--background))] focus:outline-none focus:ring-2 focus:ring-[hsl(var(--tone-neutral-400))]',
                                    isDirty && 'text-[hsl(var(--tone-accent-700))]',
                                  )}
                                />
                              </td>
                            )
                          })}
                          {metaPapAffected && MASS_FIELDS.map((f) => {
                            const val = getCellValue(sex, ab, f)
                            const isDirty = cellKey(sex, ab, f) in edits
                            return (
                              <td key={f} className="px-1 py-0.5">
                                <input
                                  type="text"
                                  inputMode="decimal"
                                  value={val}
                                  placeholder="–"
                                  onChange={(e) => handleChange(sex, ab, f, e.target.value)}
                                  className={cn(
                                    'w-full rounded border border-transparent bg-transparent px-1.5 py-0.5 text-center text-sm tabular-nums placeholder:text-[hsl(var(--muted-foreground)/0.3)]',
                                    'focus:border-[hsl(var(--border))] focus:bg-[hsl(var(--background))] focus:outline-none focus:ring-2 focus:ring-[hsl(var(--tone-neutral-400))]',
                                    isDirty && 'text-[hsl(var(--tone-warning-700))]',
                                  )}
                                />
                              </td>
                            )
                          })}
                          <td className="px-1 py-0.5 text-center">
                            <button
                              type="button"
                              onClick={() => removeBand(sex, ab)}
                              className="rounded p-0.5 text-[hsl(var(--tone-danger-400))] transition-colors hover:bg-[hsl(var(--tone-danger-50))] hover:text-[hsl(var(--tone-danger-500))]"
                              title="Remove band"
                            >
                              <svg className="h-3 w-3" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M3 3l6 6M9 3l-6 6" /></svg>
                            </button>
                          </td>
                        </tr>
                      ))}
                      {bands.length === 0 && (
                        <tr>
                          <td colSpan={metaPapAffected ? 11 : 7} className="px-3 py-3 text-center text-xs text-[hsl(var(--muted-foreground))]">
                            No age bands yet.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
                <div className="pl-1">
                  <button
                    type="button"
                    onClick={() => addBand(sex)}
                    className="rounded-md border border-dashed border-[hsl(var(--border))] px-3 py-1 text-xs font-medium text-[hsl(var(--muted-foreground))] transition-colors hover:border-[hsl(var(--foreground))] hover:text-[hsl(var(--foreground))]"
                  >
                    + Add Band
                  </button>
                </div>
              </div>
            )
          })}

          {/* ---- Add sex group ---- */}
          {!(sexGroups.includes('Male') && sexGroups.includes('Female')) && (
            <div className="flex items-center gap-2">
            {addingSexGroup ? (
              <>
                {SEX_PRESETS.filter((s) => !sexGroups.includes(s)).map((s) => (
                  <button
                    key={s}
                    type="button"
                    onClick={() => addSexGroup(s)}
                    className="rounded-md border border-[hsl(var(--border))] px-3 py-1.5 text-sm font-medium text-[hsl(var(--foreground))] transition-colors hover:bg-[hsl(var(--tone-neutral-100))]"
                  >
                    {s}
                  </button>
                ))}
                <button
                  type="button"
                  onClick={() => setAddingSexGroup(false)}
                  className="rounded-md px-2 py-1.5 text-xs text-[hsl(var(--muted-foreground))] transition-colors hover:bg-[hsl(var(--tone-neutral-100))]"
                >
                  Cancel
                </button>
              </>
            ) : (
              <button
                type="button"
                onClick={() => setAddingSexGroup(true)}
                className="rounded-md border border-dashed border-[hsl(var(--border))] px-4 py-2 text-sm font-medium text-[hsl(var(--muted-foreground))] transition-colors hover:border-[hsl(var(--foreground))] hover:text-[hsl(var(--foreground))]"
              >
                + Add Sex Group
              </button>
            )}
          </div>
          )}

          {/* ---- Sources ---- */}
          <div className="space-y-2">
            <p className="pl-1 text-sm font-semibold text-[hsl(var(--foreground))]">Sources</p>
            {sources.length > 0 && (
              <div className="space-y-2">
                {sources.map((src, idx) => (
                  <div key={idx} className="rounded-md border border-[hsl(var(--stroke-soft)/0.72)] p-3 space-y-2">
                    <div className="flex items-start justify-between gap-2">
                      <div className="grid grid-cols-[1fr_2fr] gap-x-3 gap-y-1.5 flex-1">
                        <div className="space-y-0.5">
                          <label className="block text-[10px] font-medium text-[hsl(var(--muted-foreground))]">Short Ref</label>
                          <input
                            type="text"
                            value={src.short_ref}
                            onChange={(e) => {
                              pushUndo()
                              const next = [...sources]
                              next[idx] = { ...next[idx], short_ref: e.target.value }
                              setSources(next)
                              setMetaDirty(true)
                            }}
                            className="w-full rounded border border-transparent bg-transparent px-1.5 py-0.5 text-sm focus:border-[hsl(var(--border))] focus:bg-[hsl(var(--background))] focus:outline-none focus:ring-2 focus:ring-[hsl(var(--tone-neutral-400))]"
                          />
                        </div>
                        <div className="space-y-0.5">
                          <label className="block text-[10px] font-medium text-[hsl(var(--muted-foreground))]">Title</label>
                          <input
                            type="text"
                            value={src.title}
                            onChange={(e) => {
                              pushUndo()
                              const next = [...sources]
                              next[idx] = { ...next[idx], title: e.target.value }
                              setSources(next)
                              setMetaDirty(true)
                            }}
                            className="w-full rounded border border-transparent bg-transparent px-1.5 py-0.5 text-sm focus:border-[hsl(var(--border))] focus:bg-[hsl(var(--background))] focus:outline-none focus:ring-2 focus:ring-[hsl(var(--tone-neutral-400))]"
                          />
                        </div>
                        <div className="space-y-0.5">
                          <label className="block text-[10px] font-medium text-[hsl(var(--muted-foreground))]">Authors</label>
                          <input
                            type="text"
                            value={src.authors}
                            onChange={(e) => {
                              pushUndo()
                              const next = [...sources]
                              next[idx] = { ...next[idx], authors: e.target.value }
                              setSources(next)
                              setMetaDirty(true)
                            }}
                            className="w-full rounded border border-transparent bg-transparent px-1.5 py-0.5 text-sm focus:border-[hsl(var(--border))] focus:bg-[hsl(var(--background))] focus:outline-none focus:ring-2 focus:ring-[hsl(var(--tone-neutral-400))]"
                          />
                        </div>
                        <div className="space-y-0.5">
                          <label className="block text-[10px] font-medium text-[hsl(var(--muted-foreground))]">Journal</label>
                          <input
                            type="text"
                            value={src.journal}
                            onChange={(e) => {
                              pushUndo()
                              const next = [...sources]
                              next[idx] = { ...next[idx], journal: e.target.value }
                              setSources(next)
                              setMetaDirty(true)
                            }}
                            className="w-full rounded border border-transparent bg-transparent px-1.5 py-0.5 text-sm focus:border-[hsl(var(--border))] focus:bg-[hsl(var(--background))] focus:outline-none focus:ring-2 focus:ring-[hsl(var(--tone-neutral-400))]"
                          />
                        </div>
                        <div className="space-y-0.5">
                          <label className="block text-[10px] font-medium text-[hsl(var(--muted-foreground))]">DOI</label>
                          <input
                            type="text"
                            value={src.doi}
                            onChange={(e) => {
                              pushUndo()
                              const next = [...sources]
                              next[idx] = { ...next[idx], doi: e.target.value }
                              setSources(next)
                              setMetaDirty(true)
                            }}
                            className="w-full rounded border border-transparent bg-transparent px-1.5 py-0.5 text-sm focus:border-[hsl(var(--border))] focus:bg-[hsl(var(--background))] focus:outline-none focus:ring-2 focus:ring-[hsl(var(--tone-neutral-400))]"
                          />
                        </div>
                        <div className="space-y-0.5">
                          <label className="block text-[10px] font-medium text-[hsl(var(--muted-foreground))]">URL</label>
                          <input
                            type="text"
                            value={src.url}
                            onChange={(e) => {
                              pushUndo()
                              const next = [...sources]
                              next[idx] = { ...next[idx], url: e.target.value }
                              setSources(next)
                              setMetaDirty(true)
                            }}
                            className="w-full rounded border border-transparent bg-transparent px-1.5 py-0.5 text-sm focus:border-[hsl(var(--border))] focus:bg-[hsl(var(--background))] focus:outline-none focus:ring-2 focus:ring-[hsl(var(--tone-neutral-400))]"
                          />
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => {
                          pushUndo()
                          setSources((prev) => prev.filter((_, i) => i !== idx))
                          setMetaDirty(true)
                        }}
                        className="mt-3 rounded p-0.5 text-[hsl(var(--tone-danger-400))] transition-colors hover:bg-[hsl(var(--tone-danger-50))] hover:text-[hsl(var(--tone-danger-500))]"
                        title="Remove source"
                      >
                        <svg className="h-3.5 w-3.5" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M3 3l6 6M9 3l-6 6" /></svg>
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
            <button
              type="button"
              onClick={() => {
                pushUndo()
                setSources((prev) => [...prev, { short_ref: '', title: '', authors: '', journal: '', doi: '', url: '' }])
                setMetaDirty(true)
              }}
              className="rounded-md border border-dashed border-[hsl(var(--border))] px-3 py-1 text-xs font-medium text-[hsl(var(--muted-foreground))] transition-colors hover:border-[hsl(var(--foreground))] hover:text-[hsl(var(--foreground))]"
            >
              + Add Source
            </button>
          </div>

        </>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Main page — search parameters, click to edit all ranges
// ---------------------------------------------------------------------------

export function CmrReferenceDatabasePage() {
  const [allParams, setAllParams] = useState<CmrCanonicalParam[]>([])
  const [loading, setLoading] = useState(true)
  const [editingParam, setEditingParam] = useState<string | null>(null)
  const [isNewParam, setIsNewParam] = useState(false)
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({})
  const [expandedNested, setExpandedNested] = useState<Set<string>>(new Set())
  const [sectionsConfig, setSectionsConfig] = useState<Record<string, string[]>>({})
  const sectionRefs = useRef<Record<string, HTMLDivElement | null>>({})

  // ---- Edit mode state ----
  const [editMode, setEditMode] = useState(false)
  const [editSections, setEditSections] = useState<Record<string, string[]>>({})
  const [editSectionOrder, setEditSectionOrder] = useState<string[]>([])
  const [editParamOrder, setEditParamOrder] = useState<string[]>([])
  const [sectionRenames, setSectionRenames] = useState<Record<string, string>>({}) // old -> new
  const [subSectionRenames, setSubSectionRenames] = useState<Record<string, string>>({}) // "section||old" -> new
  const [editSaving, setEditSaving] = useState(false)
  const [editDirty, setEditDirty] = useState(false)

  const enterEditMode = () => {
    const config = { ...sectionsConfig }
    setEditSections(config)
    setEditSectionOrder(Object.keys(config))
    setEditParamOrder(getAllParameterKeys())
    setSectionRenames({})
    setSubSectionRenames({})
    setEditDirty(false)
    setEditMode(true)
  }

  const exitEditMode = () => {
    setEditMode(false)
    setEditDirty(false)
  }

  const saveEditChanges = async () => {
    setEditSaving(true)
    try {
      // Build ordered sections config
      const newSections: Record<string, string[]> = {}
      for (const key of editSectionOrder) {
        const displayKey = sectionRenames[key] || key
        newSections[displayKey] = (editSections[key] || []).map((sub) => {
          const rKey = `${key}||${sub}`
          return subSectionRenames[rKey] || sub
        })
      }

      // Build rename arrays
      const secRenames = Object.entries(sectionRenames)
        .filter(([old, nw]) => old !== nw)
        .map(([old_name, new_name]) => ({ old_name, new_name }))

      const subRenames: Array<{ section: string; old_name: string; new_name: string }> = []
      for (const [rKey, newName] of Object.entries(subSectionRenames)) {
        const [section, oldName] = rKey.split('||')
        if (oldName !== newName) {
          // Use the renamed section name if applicable
          subRenames.push({ section: sectionRenames[section] || section, old_name: oldName, new_name: newName })
        }
      }

      await saveEditMode({
        sections: newSections,
        section_renames: secRenames.length > 0 ? secRenames : undefined,
        sub_section_renames: subRenames.length > 0 ? subRenames : undefined,
        param_order: editParamOrder,
      })

      // Reload
      loadParams()
      fetchSections().then(setSectionsConfig).catch(() => {})
      exitEditMode()
    } catch (e) {
      console.error('Failed to save edit mode changes', e)
    } finally {
      setEditSaving(false)
    }
  }

  // ---- Edit mode drag state ----
  const editDragRef = useRef<{ type: 'section' | 'sub' | 'param'; section?: string; index: number } | null>(null)

  const toggleCollapse = (key: string) => {
    setCollapsed((prev) => ({ ...prev, [key]: !prev[key] }))
  }

  const loadParams = useCallback(() => {
    setLoading(true)
    fetchReferenceParameters('Male')
      .then((r) => setAllParams(r.parameters))
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => {
    loadParams()
    fetchSections().then(setSectionsConfig).catch(() => {})
  }, [loadParams])

  const filtered = allParams

  // Derive nesting relationships from the data's nested_under field
  const nestedParamMap = useMemo(() => buildNestedParamMap(allParams), [allParams])
  const nestedChildrenSet = useMemo(() => buildNestedChildrenSet(nestedParamMap), [nestedParamMap])

  // Build a lookup of nested child params from the full dataset
  const nestedChildParams = useMemo(() => {
    const map = new Map<string, CmrCanonicalParam[]>()
    for (const [parent, childKeys] of Object.entries(nestedParamMap)) {
      const children = childKeys
        .map((k) => allParams.find((p) => p.parameter_key === k))
        .filter((p): p is CmrCanonicalParam => p !== undefined)
      if (children.length > 0) map.set(parent, children)
    }
    return map
  }, [allParams, nestedParamMap])

  // Group by major_section, preserving sub_section — filter out nested children
  type Group = { major: string; sub: string; params: CmrCanonicalParam[] }
  const groups: Group[] = []
  let cur: Group | null = null
  for (const p of filtered) {
    if (nestedChildrenSet.has(p.parameter_key)) continue
    const key = `${p.major_section}||${p.sub_section}`
    if (!cur || `${cur.major}||${cur.sub}` !== key) {
      cur = { major: p.major_section, sub: p.sub_section, params: [] }
      groups.push(cur)
    }
    cur.params.push(p)
  }

  const majorSections = groups.reduce<string[]>((acc, g) => {
    if (!acc.includes(g.major)) acc.push(g.major)
    return acc
  }, [])

  // -- Parameter editor --
  if (editingParam) {
    return (
      <Stack data-house-role="page" space="lg">
        <Row align="center" gap="md" wrap={false} className="house-page-title-row">
          <SectionMarker tone="warning" size="title" className="self-stretch h-auto" />
          <PageHeader
            heading={isNewParam ? 'New Parameter' : 'Edit Parameter'}
            className="!ml-0 !mt-0"
          />
        </Row>
        <ParameterEditor
          parameterKey={editingParam}
          isNew={isNewParam}
          onClose={() => { setEditingParam(null); setIsNewParam(false); loadParams() }}
          onDeleted={() => { loadParams() }}
          sectionsConfig={sectionsConfig}
        />
      </Stack>
    )
  }

  // -- Edit mode --
  if (editMode) {
    // Build a structured view: for each section, its sub-sections, and within each sub-section its params
    const editGroups: Array<{
      sectionKey: string
      sectionDisplay: string
      subSections: Array<{
        subKey: string
        subDisplay: string
        params: Array<{ key: string; unit: string; indexing: string }>
      }>
    }> = []

    for (const secKey of editSectionOrder) {
      const secDisplay = sectionRenames[secKey] || secKey
      const subs = editSections[secKey] || []
      const subGroups: typeof editGroups[0]['subSections'] = []

      // Params with no sub-section
      const noSubParams = allParams.filter(
        (p) => p.major_section === secKey && !p.sub_section,
      )
      // Only show "no sub-section" group if there are params or no subs at all
      if (noSubParams.length > 0 || subs.length === 0) {
        const orderedNoSub = noSubParams
          .sort((a, b) => editParamOrder.indexOf(a.parameter_key) - editParamOrder.indexOf(b.parameter_key))
        subGroups.push({
          subKey: '',
          subDisplay: '',
          params: orderedNoSub.map((p) => ({ key: p.parameter_key, unit: p.unit, indexing: p.indexing })),
        })
      }

      for (const sub of subs) {
        const rKey = `${secKey}||${sub}`
        const subDisplay = subSectionRenames[rKey] || sub
        const subParams = allParams
          .filter((p) => p.major_section === secKey && p.sub_section === sub)
          .sort((a, b) => editParamOrder.indexOf(a.parameter_key) - editParamOrder.indexOf(b.parameter_key))
        subGroups.push({
          subKey: sub,
          subDisplay,
          params: subParams.map((p) => ({ key: p.parameter_key, unit: p.unit, indexing: p.indexing })),
        })
      }

      editGroups.push({ sectionKey: secKey, sectionDisplay: secDisplay, subSections: subGroups })
    }

    return (
      <Stack data-house-role="page" space="lg">
        <Row align="center" gap="md" wrap={false} className="house-page-title-row">
          <SectionMarker tone="warning" size="title" className="self-stretch h-auto" />
          <PageHeader heading="Edit Sections & Order" className="!ml-0 !mt-0" />
        </Row>

        <div className="flex flex-col gap-4 pb-20">
          {editGroups.map((sg, secIdx) => (
            <div
              key={sg.sectionKey}
              className="rounded-lg border border-[hsl(var(--stroke-soft)/0.72)] bg-[hsl(var(--background))]"
              draggable
              onDragStart={(e) => {
                editDragRef.current = { type: 'section', index: secIdx }
                e.dataTransfer.effectAllowed = 'move'
              }}
              onDragOver={(e) => {
                if (editDragRef.current?.type !== 'section') return
                e.preventDefault()
                e.dataTransfer.dropEffect = 'move'
              }}
              onDrop={(e) => {
                e.preventDefault()
                if (editDragRef.current?.type !== 'section') return
                const fromIdx = editDragRef.current.index
                if (fromIdx === secIdx) return
                setEditSectionOrder((prev) => {
                  const arr = [...prev]
                  const [moved] = arr.splice(fromIdx, 1)
                  arr.splice(secIdx, 0, moved)
                  return arr
                })
                setEditDirty(true)
                editDragRef.current = null
              }}
              onDragEnd={() => { editDragRef.current = null }}
            >
              {/* Section header */}
              <div className="flex items-center gap-2 border-b border-[hsl(var(--stroke-soft)/0.5)] bg-[hsl(var(--tone-neutral-50))] px-3 py-2.5">
                <DragHandleIcon className="cursor-grab" />
                <div className="w-1 self-stretch rounded bg-[hsl(var(--tone-warning-500))]" />
                <input
                  type="text"
                  defaultValue={titleCase(sg.sectionDisplay)}
                  onBlur={(e) => {
                    const newVal = e.target.value.trim().toUpperCase()
                    if (newVal && newVal !== sg.sectionKey) {
                      setSectionRenames((prev) => ({ ...prev, [sg.sectionKey]: newVal }))
                      setEditDirty(true)
                    }
                  }}
                  className="flex-1 border-transparent bg-transparent px-1 py-0.5 text-sm font-semibold tracking-tight text-[hsl(var(--foreground))] focus:rounded focus:border-[hsl(var(--tone-warning-400))] focus:bg-white focus:outline-none focus:ring-1 focus:ring-[hsl(var(--tone-warning-400))]"
                />
                <span className="text-xs text-[hsl(var(--muted-foreground))]">
                  {sg.subSections.reduce((n, s) => n + s.params.length, 0)} params
                </span>
              </div>

              {/* Sub-sections and parameters */}
              <div className="divide-y divide-[hsl(var(--stroke-soft)/0.3)]">
                {sg.subSections.map((sub, subIdx) => (
                  <div
                    key={sub.subKey || '__no_sub__'}
                    className="py-1"
                    draggable={!!sub.subKey}
                    onDragStart={(e) => {
                      if (!sub.subKey) return
                      e.stopPropagation()
                      editDragRef.current = { type: 'sub', section: sg.sectionKey, index: subIdx }
                      e.dataTransfer.effectAllowed = 'move'
                    }}
                    onDragOver={(e) => {
                      if (editDragRef.current?.type !== 'sub' || editDragRef.current.section !== sg.sectionKey) return
                      e.preventDefault()
                      e.stopPropagation()
                      e.dataTransfer.dropEffect = 'move'
                    }}
                    onDrop={(e) => {
                      if (editDragRef.current?.type !== 'sub' || editDragRef.current.section !== sg.sectionKey) return
                      e.preventDefault()
                      e.stopPropagation()
                      const fromIdx = editDragRef.current.index
                      if (fromIdx === subIdx) return
                      setEditSections((prev) => {
                        const arr = [...(prev[sg.sectionKey] || [])]
                        const [moved] = arr.splice(fromIdx, 1)
                        arr.splice(subIdx, 0, moved)
                        return { ...prev, [sg.sectionKey]: arr }
                      })
                      setEditDirty(true)
                      editDragRef.current = null
                    }}
                    onDragEnd={() => { editDragRef.current = null }}
                  >
                    {/* Sub-section header (if named) */}
                    {sub.subKey && (
                      <div className="flex items-center gap-2 px-6 py-1.5">
                        <DragHandleIcon className="h-3.5 w-3.5 cursor-grab" />
                        <input
                          type="text"
                          defaultValue={sub.subDisplay}
                          onBlur={(e) => {
                            const newVal = e.target.value.trim()
                            if (newVal && newVal !== sub.subKey) {
                              const rKey = `${sg.sectionKey}||${sub.subKey}`
                              setSubSectionRenames((prev) => ({ ...prev, [rKey]: newVal }))
                              setEditDirty(true)
                            }
                          }}
                          className="flex-1 border-transparent bg-transparent px-1 py-0.5 text-[0.8rem] font-semibold text-[hsl(var(--tone-warning-900)/0.82)] focus:rounded focus:border-[hsl(var(--tone-warning-400))] focus:bg-white focus:outline-none focus:ring-1 focus:ring-[hsl(var(--tone-warning-400))]"
                        />
                      </div>
                    )}

                    {/* Parameters */}
                    {sub.params.map((p, pIdx) => (
                      <div
                        key={p.key}
                        className="flex items-center gap-2 px-10 py-1"
                        draggable
                        onDragStart={(e) => {
                          e.stopPropagation()
                          editDragRef.current = { type: 'param', section: `${sg.sectionKey}||${sub.subKey}`, index: pIdx }
                          e.dataTransfer.effectAllowed = 'move'
                        }}
                        onDragOver={(e) => {
                          if (editDragRef.current?.type !== 'param' || editDragRef.current.section !== `${sg.sectionKey}||${sub.subKey}`) return
                          e.preventDefault()
                          e.stopPropagation()
                          e.dataTransfer.dropEffect = 'move'
                        }}
                        onDrop={(e) => {
                          if (editDragRef.current?.type !== 'param' || editDragRef.current.section !== `${sg.sectionKey}||${sub.subKey}`) return
                          e.preventDefault()
                          e.stopPropagation()
                          const fromIdx = editDragRef.current.index
                          if (fromIdx === pIdx) return
                          // Reorder within editParamOrder
                          const paramKeys = sub.params.map((pp) => pp.key)
                          const fromKey = paramKeys[fromIdx]
                          setEditParamOrder((prev) => {
                            const arr = [...prev]
                            const globalFrom = arr.indexOf(fromKey)
                            const globalTo = arr.indexOf(paramKeys[pIdx])
                            if (globalFrom === -1 || globalTo === -1) return prev
                            arr.splice(globalFrom, 1)
                            arr.splice(globalTo, 0, fromKey)
                            return arr
                          })
                          setEditDirty(true)
                          editDragRef.current = null
                        }}
                        onDragEnd={() => { editDragRef.current = null }}
                      >
                        <DragHandleIcon className="h-3 w-3 cursor-grab opacity-50" />
                        <span className="text-sm text-[hsl(var(--foreground))]">{displayName(p.key)}</span>
                        {p.indexing === 'BSA' && <BsaPill />}
                        <span className="ml-auto text-xs text-[hsl(var(--muted-foreground))]">{p.unit}</span>
                      </div>
                    ))}
                  </div>
                ))}
              </div>
            </div>
          ))}

          {/* Supplementary: Add new section */}
          <div className="rounded-lg border border-dashed border-[hsl(var(--stroke-soft)/0.72)] p-4">
            <p className="mb-2 text-xs font-medium text-[hsl(var(--muted-foreground))]">Add Section</p>
            <div className="flex gap-2">
              <input
                type="text"
                placeholder="New section name..."
                className="flex-1 rounded-md border border-[hsl(var(--border))] bg-[hsl(var(--background))] px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-[hsl(var(--tone-warning-400))]"
                onKeyDown={(e) => {
                  if (e.key !== 'Enter') return
                  const val = (e.target as HTMLInputElement).value.trim().toUpperCase()
                  if (!val || editSectionOrder.includes(val)) return
                  setEditSectionOrder((prev) => [...prev, val])
                  setEditSections((prev) => ({ ...prev, [val]: [] }))
                  setEditDirty(true)
                  ;(e.target as HTMLInputElement).value = ''
                }}
              />
              <button
                type="button"
                onClick={(e) => {
                  const input = (e.target as HTMLElement).previousElementSibling as HTMLInputElement
                  const val = input.value.trim().toUpperCase()
                  if (!val || editSectionOrder.includes(val)) return
                  setEditSectionOrder((prev) => [...prev, val])
                  setEditSections((prev) => ({ ...prev, [val]: [] }))
                  setEditDirty(true)
                  input.value = ''
                }}
                className="rounded-md bg-[hsl(var(--tone-neutral-100))] px-3 py-1.5 text-sm font-medium text-[hsl(var(--foreground))] hover:bg-[hsl(var(--tone-neutral-200))]"
              >
                Add
              </button>
            </div>
          </div>
        </div>

        {/* Sticky save bar */}
        <div className="fixed inset-x-0 bottom-0 z-50 border-t border-[hsl(var(--stroke-soft))] bg-[hsl(var(--background))] px-6 py-3 shadow-lg">
          <div className="mx-auto flex max-w-4xl items-center justify-between">
            <span className="text-sm text-[hsl(var(--muted-foreground))]">
              {editDirty ? 'You have unsaved changes' : 'Edit mode — drag to reorder, click to rename'}
            </span>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={exitEditMode}
                className="rounded-md border border-[hsl(var(--border))] px-4 py-2 text-sm font-medium text-[hsl(var(--foreground))] hover:bg-[hsl(var(--tone-neutral-100))]"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={saveEditChanges}
                disabled={!editDirty || editSaving}
                className={cn(
                  'rounded-md px-4 py-2 text-sm font-semibold transition-colors',
                  editDirty
                    ? 'bg-[hsl(var(--tone-warning-600))] text-white hover:bg-[hsl(var(--tone-warning-700))]'
                    : 'bg-[hsl(var(--tone-neutral-200))] text-[hsl(var(--muted-foreground))] cursor-not-allowed',
                )}
              >
                {editSaving ? 'Saving...' : 'Save Changes'}
              </button>
            </div>
          </div>
        </div>
      </Stack>
    )
  }

  // -- Main parameter list --
  return (
    <Stack data-house-role="page" space="lg">
      <Row align="center" gap="md" wrap={false} className="house-page-title-row">
        <SectionMarker tone="warning" size="title" className="self-stretch h-auto" />
        <PageHeader
          heading="Reference Database"
          className="!ml-0 !mt-0"
        />
      </Row>

      <div className="flex flex-wrap items-end gap-6">
        <div className="flex-1" />
        <button
          onClick={enterEditMode}
          className={cn(
            'rounded-md border border-[hsl(var(--border))] px-4 py-2 text-sm font-medium transition-colors',
            'text-[hsl(var(--foreground))] hover:bg-[hsl(var(--tone-neutral-100))]',
          )}
        >
          Edit Sections
        </button>
        <button
          onClick={() => { setEditingParam('NEW_PARAMETER'); setIsNewParam(true) }}
          className={cn(
            'rounded-md px-4 py-2 text-sm font-semibold transition-colors',
            'bg-[hsl(var(--tone-warning-600))] text-white hover:bg-[hsl(var(--tone-warning-700))]',
          )}
        >
          + Add Parameter
        </button>
      </div>

      {loading ? (
        <p className="py-8 text-center text-sm text-[hsl(var(--muted-foreground))]">Loading parameters...</p>
      ) : majorSections.length === 0 ? (
        <p className="py-8 text-center text-sm text-[hsl(var(--muted-foreground))]">No parameters match your search.</p>
      ) : (
        <div className="flex flex-col gap-6">
          {majorSections.map((major) => {
            const subGroups = groups.filter((g) => g.major === major)
            const isCollapsed = !!collapsed[major]

            return (
              <div
                key={major}
                ref={(el) => { sectionRefs.current[major] = el }}
                data-section-key={titleCase(major)}
                className="scroll-mt-20"
              >
                <button
                  type="button"
                  onClick={() => toggleCollapse(major)}
                  className={cn(
                    'flex w-full items-stretch overflow-hidden border border-[hsl(var(--stroke-soft)/0.72)] bg-[hsl(var(--tone-neutral-50))] text-left transition-colors hover:bg-[hsl(var(--tone-neutral-100))]',
                    isCollapsed ? 'rounded-lg' : 'rounded-t-lg border-b border-b-[hsl(var(--stroke-soft))]',
                  )}
                >
                  <div className="w-1 shrink-0 bg-[hsl(var(--tone-warning-500))]" />
                  <div className="flex flex-1 items-center gap-2.5 px-3.5 py-3">
                    <ChevronIcon open={!isCollapsed} />
                    <h2 className="flex-1 text-sm font-semibold tracking-tight text-[hsl(var(--foreground))]">
                      {titleCase(major)}
                    </h2>
                  </div>
                </button>

                {!isCollapsed && (
                  <div className="overflow-x-auto rounded-b-lg border-x border-b border-[hsl(var(--stroke-soft)/0.72)]">
                    <table data-house-no-column-resize="true" className="w-full table-fixed border-collapse text-sm">
                      <colgroup>
                        <col style={{ width: '52%' }} />
                        <col style={{ width: '20%' }} />
                        <col style={{ width: '14%' }} />
                        <col style={{ width: '14%' }} />
                      </colgroup>
                      <thead>
                        <tr className="border-b-2 border-[hsl(var(--tone-neutral-300))] bg-[hsl(var(--tone-neutral-50))]">
                          <th className="house-table-head-text px-3 py-2 text-left">Parameter</th>
                          <th className="house-table-head-text px-3 py-2 text-center">Unit</th>
                          <th className="house-table-head-text px-3 py-2 text-center">Pap</th>
                          <th className="house-table-head-text px-3 py-2 text-center">Direction</th>
                        </tr>
                      </thead>
                      <tbody>
                        {subGroups.map((g, gi) => (
                          <Fragment key={`grp-${g.major}|${g.sub}`}>
                            {g.sub && (
                              <tr className="border-b border-[hsl(var(--stroke-soft)/0.5)]">
                                <td
                                  colSpan={4}
                                  className={cn(
                                    'bg-[hsl(var(--tone-warning-100))] px-3 py-1.5 text-[0.8rem] font-semibold tracking-wide text-[hsl(var(--tone-warning-900)/0.82)]',
                                    gi > 0 && 'border-t border-[hsl(var(--tone-warning-200))]',
                                  )}
                                >
                                  {g.sub}
                                </td>
                              </tr>
                            )}
                            {g.params.map((p) => (
                              <Fragment key={p.parameter_key}>
                              <tr
                                className="cursor-pointer border-b border-[hsl(var(--stroke-soft)/0.4)] transition-colors duration-100 hover:bg-[hsl(var(--tone-neutral-50)/0.65)]"
                                onClick={() => setEditingParam(p.parameter_key)}
                              >
                                <td className="house-table-cell-text px-3 py-2 font-medium text-[hsl(var(--foreground))]">
                                  {displayName(p.parameter_key)}
                                  {p.indexing === 'BSA' && <BsaPill />}
                                  {nestedParamMap[p.parameter_key] && nestedChildParams.has(p.parameter_key) && (
                                    <button
                                      type="button"
                                      onClick={(e) => {
                                        e.stopPropagation()
                                        setExpandedNested((prev) => {
                                          const next = new Set(prev)
                                          if (next.has(p.parameter_key)) next.delete(p.parameter_key)
                                          else next.add(p.parameter_key)
                                          return next
                                        })
                                      }}
                                      className="ml-1.5 inline-flex items-center text-[hsl(var(--tone-neutral-400))] hover:text-[hsl(var(--foreground))] transition-colors"
                                    >
                                      <ChevronIcon open={expandedNested.has(p.parameter_key)} />
                                    </button>
                                  )}
                                </td>
                                <td className="house-table-cell-text px-3 py-2 text-center text-[hsl(var(--tone-neutral-500))]">
                                  {p.unit}
                                </td>
                                <td className="house-table-cell-text px-3 py-2 text-center">
                                  {p.pap_differs && <PapPill />}
                                </td>
                                <td className="house-table-cell-text px-3 py-2 text-center">
                                  <DirectionIndicator dir={p.abnormal_direction} />
                                </td>
                              </tr>
                              {/* Nested child rows */}
                              {expandedNested.has(p.parameter_key) && nestedChildParams.get(p.parameter_key)?.map((cp) => (
                                <tr
                                  key={cp.parameter_key}
                                  className="cursor-pointer border-b border-[hsl(var(--stroke-soft)/0.4)] bg-[hsl(var(--tone-neutral-50)/0.35)] transition-colors duration-100 hover:bg-[hsl(var(--tone-neutral-50)/0.65)]"
                                  onClick={() => setEditingParam(cp.parameter_key)}
                                >
                                  <td className="house-table-cell-text px-3 py-2 pl-8 font-medium text-[hsl(var(--foreground))]">
                                    {displayName(cp.parameter_key)}
                                    {cp.indexing === 'BSA' && <BsaPill />}
                                  </td>
                                  <td className="house-table-cell-text px-3 py-2 text-center text-[hsl(var(--tone-neutral-500))]">{cp.unit}</td>
                                  <td className="house-table-cell-text px-3 py-2 text-center">
                                    {cp.pap_differs && <PapPill />}
                                  </td>
                                  <td className="house-table-cell-text px-3 py-2 text-center">
                                    <DirectionIndicator dir={cp.abnormal_direction} />
                                  </td>
                                </tr>
                              ))}
                              </Fragment>
                            ))}
                          </Fragment>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}

    </Stack>
  )
}
