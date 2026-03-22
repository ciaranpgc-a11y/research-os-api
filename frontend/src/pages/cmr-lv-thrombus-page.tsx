import { useCallback, useMemo, useState } from 'react'

import { PageHeader, Row, Stack } from '@/components/primitives'
import { SectionMarker } from '@/components/patterns'
import { THROMBUS_LOCATION_ICONS } from '@/components/icons/thrombus-location-icons'
import { cn } from '@/lib/utils'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type ThrombusPrimary = 'LV' | 'LA' | 'LAA' | 'RV' | 'RA' | 'Aorta' | 'PA' | 'Device' | 'Other'

type ThrombusMorphology = {
  maxDiameter: number | null
  shape: 'mural' | 'protruding' | 'pedunculated' | null
  mobility: 'fixed' | 'mildly-mobile' | 'highly-mobile' | null
  attachment: 'broad-based' | 'narrow-stalk' | null
  surface: 'smooth' | 'irregular' | null
}

type EmbolicRisk = 'low' | 'intermediate' | 'high'

type ThrombusEntry = {
  id: string
  primary: ThrombusPrimary | null
  sublocation: string | null
  otherLocation: string
  morphology: ThrombusMorphology
  confidence: 'definite' | 'probable' | 'indeterminate' | null
  risk: EmbolicRisk | null
  riskOverride: EmbolicRisk | null
  actionTags: string[]
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const PRIMARY_OPTIONS: { value: ThrombusPrimary; label: string }[] = [
  { value: 'LV', label: 'Left ventricle' },
  { value: 'LA', label: 'Left atrium' },
  { value: 'LAA', label: 'Left atrial appendage' },
  { value: 'RV', label: 'Right ventricle' },
  { value: 'RA', label: 'Right atrium' },
  { value: 'Aorta', label: 'Aorta' },
  { value: 'PA', label: 'Pulmonary artery' },
  { value: 'Device', label: 'Device-related' },
  { value: 'Other', label: 'Other' },
]

const SUBLOCATION_OPTIONS: Record<ThrombusPrimary, string[]> = {
  LV: ['Apex', 'Apical septal', 'Apical anterior', 'Apical inferior', 'Mural', 'Attached to scar region'],
  LA: ['Body', 'Appendage'],
  LAA: ['Tip', 'Body'],
  RV: ['Apex', 'Free wall', 'Septal'],
  RA: ['Body', 'Appendage'],
  Aorta: ['Ascending', 'Arch', 'Descending', 'Root'],
  PA: ['Main', 'Right', 'Left'],
  Device: ['Lead-associated', 'Prosthetic valve'],
  Other: [],
}

const SHAPE_OPTIONS = [
  { value: 'mural' as const, label: 'Mural (laminar)' },
  { value: 'protruding' as const, label: 'Protruding' },
  { value: 'pedunculated' as const, label: 'Pedunculated' },
]

const MOBILITY_OPTIONS = [
  { value: 'fixed' as const, label: 'Fixed' },
  { value: 'mildly-mobile' as const, label: 'Mildly mobile' },
  { value: 'highly-mobile' as const, label: 'Highly mobile' },
]

const ATTACHMENT_OPTIONS = [
  { value: 'broad-based' as const, label: 'Broad-based' },
  { value: 'narrow-stalk' as const, label: 'Narrow stalk' },
]

const SURFACE_OPTIONS = [
  { value: 'smooth' as const, label: 'Smooth' },
  { value: 'irregular' as const, label: 'Irregular' },
]

const CONFIDENCE_OPTIONS = [
  { value: 'definite' as const, label: 'Definite' },
  { value: 'probable' as const, label: 'Probable' },
  { value: 'indeterminate' as const, label: 'Indeterminate' },
]

const ACTION_TAG_OPTIONS = [
  'Anticoagulation indicated',
  'Urgent clinical correlation',
  'Embolic risk present',
  'Incidental finding',
  'Follow-up imaging recommended',
  'Consider alternative diagnosis',
] as const

// ---------------------------------------------------------------------------
// Risk computation
// ---------------------------------------------------------------------------

function computeEmbolicRisk(entry: ThrombusEntry): EmbolicRisk | null {
  const m = entry.morphology
  // Need at least one morphology field to assess
  if (m.shape === null && m.mobility === null && m.maxDiameter === null) return null

  // High: highly mobile, pedunculated, or large + not fixed
  if (m.mobility === 'highly-mobile') return 'high'
  if (m.shape === 'pedunculated') return 'high'
  if (m.maxDiameter !== null && m.maxDiameter >= 15 && m.mobility !== 'fixed') return 'high'

  // Intermediate: mildly mobile, protruding, or ≥10mm
  if (m.mobility === 'mildly-mobile') return 'intermediate'
  if (m.shape === 'protruding') return 'intermediate'
  if (m.maxDiameter !== null && m.maxDiameter >= 10) return 'intermediate'

  return 'low'
}

// ---------------------------------------------------------------------------
// Entry factory
// ---------------------------------------------------------------------------

function createEmptyEntry(): ThrombusEntry {
  return {
    id: crypto.randomUUID(),
    primary: null,
    sublocation: null,
    otherLocation: '',
    morphology: {
      maxDiameter: null,
      shape: null,
      mobility: null,
      attachment: null,
      surface: null,
    },
    confidence: null,
    risk: null,
    riskOverride: null,
    actionTags: [],
  }
}

// ---------------------------------------------------------------------------
// Report summary
// ---------------------------------------------------------------------------

function entryLocationLabel(e: ThrombusEntry): string {
  if (!e.primary) return 'unspecified location'
  const primary = PRIMARY_OPTIONS.find((o) => o.value === e.primary)?.label ?? e.primary
  if (e.primary === 'Other' && e.otherLocation) return e.otherLocation
  if (e.sublocation) return `${primary.toLowerCase()} (${e.sublocation.toLowerCase()})`
  return primary.toLowerCase()
}

function entryShortLabel(e: ThrombusEntry, idx: number): string {
  if (e.primary && e.sublocation) return `${e.primary} ${e.sublocation}`
  if (e.primary) return PRIMARY_OPTIONS.find((o) => o.value === e.primary)?.label ?? e.primary
  return `Thrombus ${idx + 1}`
}

function generateThrombusReport(entries: ThrombusEntry[]): string {
  const filled = entries.filter((e) => e.primary !== null)
  if (filled.length === 0) return 'No thrombus identified.'

  const parts = filled.map((e, i) => {
    const loc = entryLocationLabel(e)
    const m = e.morphology
    const descriptors: string[] = []

    if (m.shape) descriptors.push(SHAPE_OPTIONS.find((o) => o.value === m.shape)?.label.toLowerCase() ?? m.shape)
    if (m.maxDiameter !== null) descriptors.push(`${m.maxDiameter} mm maximal diameter`)
    if (m.mobility) descriptors.push(MOBILITY_OPTIONS.find((o) => o.value === m.mobility)?.label.toLowerCase() ?? m.mobility)
    if (m.attachment) descriptors.push(ATTACHMENT_OPTIONS.find((o) => o.value === m.attachment)?.label.toLowerCase() ?? m.attachment)
    if (m.surface) descriptors.push(`${SURFACE_OPTIONS.find((o) => o.value === m.surface)?.label.toLowerCase() ?? m.surface} surface`)

    const risk = e.riskOverride ?? computeEmbolicRisk(e)
    const confidence = e.confidence ? CONFIDENCE_OPTIONS.find((o) => o.value === e.confidence)?.label.toLowerCase() : null

    let text = filled.length > 1 ? `(${i + 1}) ` : ''
    text += `Thrombus identified in the ${loc}.`
    if (descriptors.length > 0) text += ` Morphology: ${descriptors.join(', ')}.`
    if (risk) text += ` Embolic risk: ${risk}.`
    if (confidence) text += ` Confidence: ${confidence}.`
    if (e.actionTags.length > 0) text += ` ${e.actionTags.join('. ')}.`

    return text
  })

  const count = filled.length
  const prefix = count === 1
    ? 'A single thrombus identified.'
    : `${count} thrombi identified.`

  return count === 1 ? parts[0] : `${prefix} ${parts.join(' ')}`
}

// ---------------------------------------------------------------------------
// Small UI components
// ---------------------------------------------------------------------------

function FieldLabel({ children }: { children: React.ReactNode }) {
  return <span className="text-[11px] font-semibold uppercase tracking-wider text-[hsl(var(--tone-neutral-400))]">{children}</span>
}

function PillSelect<T extends string>({
  options,
  value,
  onChange,
}: {
  options: { value: T; label: string }[]
  value: T | null
  onChange: (v: T | null) => void
}) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          onClick={() => onChange(value === o.value ? null : o.value)}
          className={cn(
            'rounded-full px-3 py-1 text-xs font-medium transition-all',
            value === o.value
              ? 'bg-[hsl(var(--section-style-report-accent))] text-white shadow-sm'
              : 'bg-[hsl(var(--tone-neutral-50))] text-[hsl(var(--tone-neutral-600))] ring-1 ring-inset ring-[hsl(var(--stroke-soft)/0.5)] hover:bg-[hsl(var(--tone-neutral-100))]',
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Main page
// ---------------------------------------------------------------------------

export function CmrLvThrombusPage() {
  const [entries, setEntries] = useState<ThrombusEntry[]>(() => [createEmptyEntry()])
  const [activeEntryId, setActiveEntryId] = useState<string>(() => entries[0].id)

  const activeEntry = entries.find((e) => e.id === activeEntryId) ?? entries[0]
  const activeIdx = entries.findIndex((e) => e.id === activeEntryId)

  // -- Entry CRUD --
  const updateEntry = useCallback((id: string, patch: Partial<ThrombusEntry>) => {
    setEntries((prev) => prev.map((e) => (e.id === id ? { ...e, ...patch } : e)))
  }, [])

  const updateMorphology = useCallback((id: string, patch: Partial<ThrombusMorphology>) => {
    setEntries((prev) =>
      prev.map((e) => (e.id === id ? { ...e, morphology: { ...e.morphology, ...patch } } : e)),
    )
  }, [])

  const addEntry = useCallback(() => {
    const newEntry = createEmptyEntry()
    setEntries((prev) => [...prev, newEntry])
    setActiveEntryId(newEntry.id)
  }, [])

  const removeEntry = useCallback((id: string) => {
    setEntries((prev) => {
      if (prev.length <= 1) return prev
      const next = prev.filter((e) => e.id !== id)
      if (id === activeEntryId) setActiveEntryId(next[0].id)
      return next
    })
  }, [activeEntryId])

  const toggleActionTag = useCallback((id: string, tag: string) => {
    setEntries((prev) =>
      prev.map((e) => {
        if (e.id !== id) return e
        const tags = e.actionTags.includes(tag) ? e.actionTags.filter((t) => t !== tag) : [...e.actionTags, tag]
        return { ...e, actionTags: tags }
      }),
    )
  }, [])

  // -- Derived --
  const computedRisk = useMemo(() => computeEmbolicRisk(activeEntry), [activeEntry])
  const effectiveRisk = activeEntry.riskOverride ?? computedRisk
  const reportText = useMemo(() => generateThrombusReport(entries), [entries])
  const filledCount = entries.filter((e) =>
    e.primary !== null ||
    e.morphology.maxDiameter !== null ||
    e.morphology.shape !== null ||
    e.morphology.mobility !== null ||
    e.confidence !== null,
  ).length
  const sublocOptions = activeEntry.primary && activeEntry.primary !== 'Other'
    ? SUBLOCATION_OPTIONS[activeEntry.primary]
    : []

  return (
    <Stack data-house-role="page" className="gap-6">
      {/* Header */}
      <Row align="center" gap="md" wrap={false} className="house-page-title-row">
        <SectionMarker tone="report" size="title" className="self-stretch h-auto" />
        <PageHeader heading="Thrombus" className="!ml-0 !mt-0" />
      </Row>

      {/* Status banner */}
      <div className="flex items-center gap-3">
        <span className={cn(
          'rounded-full px-3 py-1 text-xs font-semibold',
          filledCount === 0 && 'bg-[hsl(var(--tone-positive-100))] text-[hsl(var(--tone-positive-600))]',
          filledCount > 0 && 'bg-[hsl(var(--tone-danger-100))] text-[hsl(var(--tone-danger-600))]',
        )}>
          {filledCount === 0 ? 'No thrombus detected' : filledCount === 1 ? '1 thrombus identified' : `${filledCount} thrombi identified`}
        </span>
      </div>

      {/* Entry tab strip */}
      <div className="flex items-center gap-2">
        <div className="flex rounded-lg bg-[hsl(var(--tone-neutral-50))] p-1 ring-1 ring-[hsl(var(--stroke-soft)/0.4)]">
          {entries.map((e, i) => (
            <div key={e.id} className="group relative flex items-center">
              <button
                type="button"
                onClick={() => setActiveEntryId(e.id)}
                className={cn(
                  'flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-all',
                  e.id === activeEntryId
                    ? 'bg-[hsl(var(--section-style-report-accent))] text-white shadow-sm'
                    : 'text-[hsl(var(--tone-neutral-600))] hover:text-[hsl(var(--tone-neutral-900))]',
                )}
              >
                {e.primary && THROMBUS_LOCATION_ICONS[e.primary] && (() => {
                  const Icon = THROMBUS_LOCATION_ICONS[e.primary!]
                  return <Icon size={16} />
                })()}
                <span>{entryShortLabel(e, i)}</span>
              </button>
              {entries.length > 1 && (
                <button
                  type="button"
                  onClick={(ev) => { ev.stopPropagation(); removeEntry(e.id) }}
                  className="ml-0.5 rounded-full p-0.5 text-[10px] text-[hsl(var(--tone-neutral-400))] opacity-0 transition-opacity hover:text-[hsl(var(--tone-danger-500))] group-hover:opacity-100"
                  title="Remove"
                >
                  ✕
                </button>
              )}
            </div>
          ))}
        </div>
        <button
          type="button"
          onClick={addEntry}
          className="rounded-md border border-dashed border-[hsl(var(--stroke-soft)/0.6)] px-3 py-1.5 text-xs font-medium text-[hsl(var(--tone-neutral-400))] transition-colors hover:border-[hsl(var(--stroke-soft))] hover:text-[hsl(var(--tone-neutral-600))]"
        >
          + Add
        </button>
      </div>

      {/* Active entry form */}
      <div className="rounded-lg border border-[hsl(var(--stroke-soft)/0.72)] bg-white">
        {/* A. Anatomical Localisation */}
        <div className="border-b border-[hsl(var(--stroke-soft)/0.4)] p-5">
          <FieldLabel>Anatomical Localisation</FieldLabel>
          <div className="mt-3 flex items-start gap-4">
            {/* Primary location — icon grid */}
            <div className="flex flex-col gap-1.5">
              <span className="text-[11px] font-medium text-[hsl(var(--tone-neutral-400))]">Primary</span>
              <div className="flex flex-wrap gap-1.5">
                {PRIMARY_OPTIONS.map((o) => {
                  const Icon = THROMBUS_LOCATION_ICONS[o.value]
                  const selected = activeEntry.primary === o.value
                  return (
                    <button
                      key={o.value}
                      type="button"
                      onClick={() =>
                        updateEntry(activeEntry.id, {
                          primary: selected ? null : o.value,
                          sublocation: null,
                          otherLocation: '',
                        })
                      }
                      className={cn(
                        'flex flex-col items-center gap-1 rounded-lg px-2.5 py-2 text-[10px] font-medium transition-all',
                        selected
                          ? 'bg-[hsl(var(--section-style-report-accent))] text-white shadow-sm'
                          : 'bg-[hsl(var(--tone-neutral-50))] text-[hsl(var(--tone-neutral-500))] ring-1 ring-inset ring-[hsl(var(--stroke-soft)/0.4)] hover:bg-[hsl(var(--tone-neutral-100))]',
                      )}
                      title={o.label}
                    >
                      {Icon && <Icon size={22} />}
                      <span>{o.value}</span>
                    </button>
                  )
                })}
              </div>
            </div>

            {/* Sub-location */}
            {activeEntry.primary === 'Other' ? (
              <div className="flex flex-col gap-1.5">
                <span className="text-[11px] font-medium text-[hsl(var(--tone-neutral-400))]">Specify location</span>
                <input
                  type="text"
                  value={activeEntry.otherLocation}
                  onChange={(ev) => updateEntry(activeEntry.id, { otherLocation: ev.target.value })}
                  placeholder="Enter anatomical location…"
                  className="house-input min-w-[200px]"
                />
              </div>
            ) : sublocOptions.length > 0 && (
              <div className="flex flex-col gap-1.5">
                <span className="text-[11px] font-medium text-[hsl(var(--tone-neutral-400))]">Sub-location</span>
                <select
                  value={activeEntry.sublocation ?? ''}
                  onChange={(ev) => updateEntry(activeEntry.id, { sublocation: ev.target.value || null })}
                  className="house-dropdown min-w-[180px]"
                >
                  <option value="">Select…</option>
                  {sublocOptions.map((s) => (
                    <option key={s} value={s}>{s}</option>
                  ))}
                </select>
              </div>
            )}
          </div>
        </div>

        {/* C. Morphology + Behaviour */}
        <div className="border-b border-[hsl(var(--stroke-soft)/0.4)] p-5">
          <FieldLabel>Morphology &amp; Behaviour</FieldLabel>
          <div className="mt-3 grid grid-cols-[auto_1fr] items-start gap-x-6 gap-y-4">
            {/* Size */}
            <span className="self-center text-xs font-medium text-[hsl(var(--tone-neutral-500))]">Size</span>
            <div className="flex items-center gap-2">
              <input
                type="number"
                min={0}
                step={1}
                value={activeEntry.morphology.maxDiameter ?? ''}
                onChange={(ev) => {
                  const v = ev.target.value === '' ? null : Number(ev.target.value)
                  updateMorphology(activeEntry.id, { maxDiameter: v })
                }}
                placeholder="—"
                className="house-input w-20 text-center tabular-nums"
              />
              <span className="text-xs text-[hsl(var(--tone-neutral-400))]">mm (max diameter)</span>
            </div>

            {/* Shape */}
            <span className="self-center text-xs font-medium text-[hsl(var(--tone-neutral-500))]">Shape</span>
            <PillSelect
              options={SHAPE_OPTIONS}
              value={activeEntry.morphology.shape}
              onChange={(v) => updateMorphology(activeEntry.id, { shape: v })}
            />

            {/* Mobility */}
            <span className="self-center text-xs font-medium text-[hsl(var(--tone-neutral-500))]">Mobility</span>
            <PillSelect
              options={MOBILITY_OPTIONS}
              value={activeEntry.morphology.mobility}
              onChange={(v) => updateMorphology(activeEntry.id, { mobility: v })}
            />

            {/* Attachment */}
            <span className="self-center text-xs font-medium text-[hsl(var(--tone-neutral-500))]">Attachment</span>
            <PillSelect
              options={ATTACHMENT_OPTIONS}
              value={activeEntry.morphology.attachment}
              onChange={(v) => updateMorphology(activeEntry.id, { attachment: v })}
            />

            {/* Surface */}
            <span className="self-center text-xs font-medium text-[hsl(var(--tone-neutral-500))]">Surface</span>
            <PillSelect
              options={SURFACE_OPTIONS}
              value={activeEntry.morphology.surface}
              onChange={(v) => updateMorphology(activeEntry.id, { surface: v })}
            />
          </div>
        </div>

        {/* Confidence */}
        <div className="border-b border-[hsl(var(--stroke-soft)/0.4)] p-5">
          <FieldLabel>Confidence</FieldLabel>
          <div className="mt-3">
            <PillSelect
              options={CONFIDENCE_OPTIONS}
              value={activeEntry.confidence}
              onChange={(v) => updateEntry(activeEntry.id, { confidence: v })}
            />
          </div>
        </div>

        {/* G. Risk Stratification */}
        <div className="border-b border-[hsl(var(--stroke-soft)/0.4)] p-5">
          <div className="flex items-center gap-3">
            <FieldLabel>Embolic Risk</FieldLabel>
            {activeEntry.riskOverride && (
              <button
                type="button"
                onClick={() => updateEntry(activeEntry.id, { riskOverride: null })}
                className="text-[10px] font-medium text-[hsl(var(--tone-neutral-400))] underline hover:text-[hsl(var(--tone-neutral-600))]"
              >
                Reset to auto
              </button>
            )}
          </div>
          <div className="mt-3 flex overflow-hidden rounded-lg ring-1 ring-[hsl(var(--stroke-soft)/0.5)]">
            {([
              { value: 'low' as const, label: 'Low', bgActive: 'bg-[hsl(164_40%_45%)]', bgInactive: 'bg-[hsl(var(--tone-neutral-50))]', textActive: 'text-white', textInactive: 'text-[hsl(var(--tone-positive-600))]' },
              { value: 'intermediate' as const, label: 'Intermediate', bgActive: 'bg-[hsl(38_55%_50%)]', bgInactive: 'bg-[hsl(var(--tone-neutral-50))]', textActive: 'text-white', textInactive: 'text-[hsl(var(--tone-warning-600))]' },
              { value: 'high' as const, label: 'High', bgActive: 'bg-[hsl(3_55%_48%)]', bgInactive: 'bg-[hsl(var(--tone-neutral-50))]', textActive: 'text-white', textInactive: 'text-[hsl(var(--tone-danger-600))]' },
            ]).map((seg) => (
              <button
                key={seg.value}
                type="button"
                onClick={() => updateEntry(activeEntry.id, { riskOverride: seg.value })}
                className={cn(
                  'flex-1 border-r border-[hsl(var(--stroke-soft)/0.3)] px-4 py-2.5 text-xs font-semibold transition-all last:border-r-0',
                  effectiveRisk === seg.value ? `${seg.bgActive} ${seg.textActive}` : `${seg.bgInactive} ${seg.textInactive} hover:bg-[hsl(var(--tone-neutral-100))]`,
                )}
              >
                {seg.label}
                {effectiveRisk === seg.value && !activeEntry.riskOverride && computedRisk && (
                  <span className="ml-1 text-[9px] font-normal opacity-75">(auto)</span>
                )}
                {effectiveRisk === seg.value && activeEntry.riskOverride && (
                  <span className="ml-1 text-[9px] font-normal opacity-75">(override)</span>
                )}
              </button>
            ))}
          </div>
          {!effectiveRisk && (
            <p className="mt-2 text-[11px] text-[hsl(var(--tone-neutral-400))]">
              Enter morphology data to auto-compute risk, or click to override.
            </p>
          )}
        </div>

        {/* H. Action / Implication Tags */}
        <div className="p-5">
          <FieldLabel>Actions &amp; Implications</FieldLabel>
          <div className="mt-3 flex flex-wrap gap-2">
            {ACTION_TAG_OPTIONS.map((tag) => {
              const selected = activeEntry.actionTags.includes(tag)
              return (
                <button
                  key={tag}
                  type="button"
                  onClick={() => toggleActionTag(activeEntry.id, tag)}
                  className={cn(
                    'rounded-full px-3 py-1 text-[11px] font-medium transition-all',
                    selected
                      ? 'bg-[hsl(var(--section-style-report-accent))] text-white shadow-sm'
                      : 'bg-white text-[hsl(var(--tone-neutral-500))] ring-1 ring-inset ring-[hsl(var(--stroke-soft)/0.5)] hover:bg-[hsl(var(--tone-neutral-50))]',
                  )}
                >
                  {tag}
                </button>
              )
            })}
          </div>
        </div>
      </div>

      {/* Report Summary */}
      <div className="rounded-lg border border-[hsl(var(--stroke-soft)/0.72)] bg-[hsl(var(--tone-neutral-50)/0.5)] p-5">
        <div className="flex items-center gap-2">
          <FieldLabel>Report Summary</FieldLabel>
          {activeIdx >= 0 && (
            <span className="text-[10px] text-[hsl(var(--tone-neutral-400))]">
              {entries.length === 1 ? '1 entry' : `${entries.length} entries`}
            </span>
          )}
        </div>
        <p className="mt-2 text-sm leading-relaxed text-[hsl(var(--foreground))]">
          {reportText}
        </p>
      </div>
    </Stack>
  )
}
