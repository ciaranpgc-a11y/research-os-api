import { useCallback, useMemo, useState } from 'react'

import { SectionMarker } from '@/components/patterns'
import { PageHeader, Row, Stack } from '@/components/primitives'
import { THROMBUS_LOCATION_ICONS } from '@/components/icons/thrombus-location-icons'
import { cn } from '@/lib/utils'

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
  riskOverride: EmbolicRisk | null
}

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

const PRIMARY_ICON_COLORS: Record<ThrombusPrimary, string> = {
  LV: 'text-[hsl(var(--section-style-report-accent))]',
  LA: 'text-[hsl(var(--tone-warning-700))]',
  LAA: 'text-[hsl(var(--tone-danger-600))]',
  RV: 'text-[hsl(var(--tone-accent-700))]',
  RA: 'text-[hsl(var(--tone-neutral-600))]',
  Aorta: 'text-[hsl(var(--tone-danger-700))]',
  PA: 'text-[hsl(var(--tone-positive-700))]',
  Device: 'text-[hsl(var(--tone-neutral-700))]',
  Other: 'text-[hsl(var(--tone-warning-700))]',
}

function computeEmbolicRisk(entry: ThrombusEntry): EmbolicRisk | null {
  const m = entry.morphology
  if (m.shape === null && m.mobility === null && m.maxDiameter === null) return null

  if (m.mobility === 'highly-mobile') return 'high'
  if (m.shape === 'pedunculated') return 'high'
  if (m.maxDiameter !== null && m.maxDiameter >= 15 && m.mobility !== 'fixed') return 'high'

  if (m.mobility === 'mildly-mobile') return 'intermediate'
  if (m.shape === 'protruding') return 'intermediate'
  if (m.maxDiameter !== null && m.maxDiameter >= 10) return 'intermediate'

  return 'low'
}

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
    riskOverride: null,
  }
}

function entryLocationLabel(entry: ThrombusEntry): string {
  if (!entry.primary) return 'unspecified location'
  const primary = PRIMARY_OPTIONS.find((option) => option.value === entry.primary)?.label ?? entry.primary
  if (entry.primary === 'Other' && entry.otherLocation) return entry.otherLocation
  if (entry.sublocation) return `${primary.toLowerCase()} (${entry.sublocation.toLowerCase()})`
  return primary.toLowerCase()
}

function entryShortLabel(entry: ThrombusEntry, index: number): string {
  if (entry.primary && entry.sublocation) return `${entry.primary} ${entry.sublocation}`
  if (entry.primary) return PRIMARY_OPTIONS.find((option) => option.value === entry.primary)?.label ?? entry.primary
  return `Thrombus ${index + 1}`
}

function generateThrombusReport(entries: ThrombusEntry[]): string {
  const filled = entries.filter((entry) => entry.primary !== null)
  if (filled.length === 0) return 'No thrombus identified.'

  const parts = filled.map((entry, index) => {
    const location = entryLocationLabel(entry)
    const morphology = entry.morphology
    const descriptors: string[] = []

    if (morphology.shape) {
      descriptors.push(SHAPE_OPTIONS.find((option) => option.value === morphology.shape)?.label.toLowerCase() ?? morphology.shape)
    }
    if (morphology.maxDiameter !== null) descriptors.push(`${morphology.maxDiameter} mm maximal diameter`)
    if (morphology.mobility) {
      descriptors.push(MOBILITY_OPTIONS.find((option) => option.value === morphology.mobility)?.label.toLowerCase() ?? morphology.mobility)
    }
    if (morphology.attachment) {
      descriptors.push(ATTACHMENT_OPTIONS.find((option) => option.value === morphology.attachment)?.label.toLowerCase() ?? morphology.attachment)
    }
    if (morphology.surface) {
      descriptors.push(`${SURFACE_OPTIONS.find((option) => option.value === morphology.surface)?.label.toLowerCase() ?? morphology.surface} surface`)
    }

    const risk = entry.riskOverride ?? computeEmbolicRisk(entry)
    const confidence = entry.confidence
      ? CONFIDENCE_OPTIONS.find((option) => option.value === entry.confidence)?.label.toLowerCase() ?? entry.confidence
      : null

    let text = filled.length > 1 ? `(${index + 1}) ` : ''
    text += `Thrombus identified in the ${location}.`
    if (descriptors.length > 0) text += ` Morphology: ${descriptors.join(', ')}.`
    if (risk) text += ` Embolic risk: ${risk}.`
    if (confidence) text += ` Confidence: ${confidence}.`
    return text
  })

  return filled.length === 1 ? parts[0] : `${filled.length} thrombi identified. ${parts.join(' ')}`
}

function FieldLabel({ children }: { children: React.ReactNode }) {
  return (
    <span className="text-[11px] font-semibold uppercase tracking-wider text-[hsl(var(--tone-neutral-400))]">
      {children}
    </span>
  )
}

function PillSelect<T extends string>({
  options,
  value,
  onChange,
}: {
  options: { value: T; label: string }[]
  value: T | null
  onChange: (value: T | null) => void
}) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          onClick={() => onChange(value === option.value ? null : option.value)}
          className={cn(
            'rounded-full px-3 py-1 text-xs font-medium transition-all',
            value === option.value
              ? 'bg-[hsl(var(--section-style-report-accent))] text-white shadow-sm'
              : 'bg-[hsl(var(--tone-neutral-50))] text-[hsl(var(--tone-neutral-600))] ring-1 ring-inset ring-[hsl(var(--stroke-soft)/0.5)] hover:bg-[hsl(var(--tone-neutral-100))]',
          )}
        >
          {option.label}
        </button>
      ))}
    </div>
  )
}

function getConfidenceLabel(confidence: ThrombusEntry['confidence']): string {
  if (!confidence) return 'None'
  return CONFIDENCE_OPTIONS.find((option) => option.value === confidence)?.label ?? 'None'
}

function getRiskLabel(risk: EmbolicRisk | null): string {
  if (!risk) return 'None'
  return risk.charAt(0).toUpperCase() + risk.slice(1)
}

function getRiskTone(risk: EmbolicRisk | null): 'none' | 'low' | 'intermediate' | 'high' {
  if (!risk) return 'none'
  return risk
}

function SectionBadge({
  label,
  tone = 'none',
}: {
  label: string
  tone?: 'none' | 'low' | 'intermediate' | 'high' | 'active'
}) {
  return (
    <span
      className={cn(
        'rounded-full px-3 py-1 text-xs font-semibold',
        tone === 'active' && 'bg-[hsl(var(--section-style-report-accent))] text-white',
        tone === 'low' && 'bg-[hsl(var(--tone-positive-100))] text-[hsl(var(--tone-positive-700))]',
        tone === 'intermediate' && 'bg-[hsl(var(--tone-warning-100))] text-[hsl(var(--tone-warning-700))]',
        tone === 'high' && 'bg-[hsl(var(--tone-danger-100))] text-[hsl(var(--tone-danger-700))]',
        tone === 'none' && 'bg-[hsl(var(--tone-neutral-100))] text-[hsl(var(--tone-neutral-600))]',
      )}
    >
      {label}
    </span>
  )
}

function ThrombusSection({
  title,
  statusLabel,
  statusTone = 'none',
  children,
}: {
  title: string
  statusLabel: string
  statusTone?: 'none' | 'low' | 'intermediate' | 'high' | 'active'
  children: React.ReactNode
}) {
  return (
    <section className="rounded-xl border border-border/50 bg-card">
      <div className="flex items-center gap-3 border-b border-border/30 px-5 py-3">
        <SectionMarker tone="report" size="title" className="self-stretch h-auto" />
        <h3 className="flex-1 text-sm font-semibold text-foreground">{title}</h3>
        <SectionBadge label={statusLabel} tone={statusTone} />
      </div>
      <div className="p-5">{children}</div>
    </section>
  )
}

export function CmrLvThrombusPage() {
  const [entries, setEntries] = useState<ThrombusEntry[]>(() => [createEmptyEntry()])
  const [activeEntryId, setActiveEntryId] = useState<string>(() => entries[0].id)

  const activeEntry = entries.find((entry) => entry.id === activeEntryId) ?? entries[0]
  const activeIndex = entries.findIndex((entry) => entry.id === activeEntryId)

  const updateEntry = useCallback((id: string, patch: Partial<ThrombusEntry>) => {
    setEntries((prev) => prev.map((entry) => (entry.id === id ? { ...entry, ...patch } : entry)))
  }, [])

  const updateMorphology = useCallback((id: string, patch: Partial<ThrombusMorphology>) => {
    setEntries((prev) =>
      prev.map((entry) =>
        entry.id === id ? { ...entry, morphology: { ...entry.morphology, ...patch } } : entry,
      ),
    )
  }, [])

  const addEntry = useCallback(() => {
    const nextEntry = createEmptyEntry()
    setEntries((prev) => [...prev, nextEntry])
    setActiveEntryId(nextEntry.id)
  }, [])

  const removeEntry = useCallback((id: string) => {
    setEntries((prev) => {
      if (prev.length <= 1) return prev
      const next = prev.filter((entry) => entry.id !== id)
      if (id === activeEntryId) setActiveEntryId(next[0].id)
      return next
    })
  }, [activeEntryId])

  const computedRisk = useMemo(() => computeEmbolicRisk(activeEntry), [activeEntry])
  const effectiveRisk = activeEntry.riskOverride ?? computedRisk
  const reportText = useMemo(() => generateThrombusReport(entries), [entries])
  const filledCount = entries.filter((entry) =>
    entry.primary !== null ||
    entry.morphology.maxDiameter !== null ||
    entry.morphology.shape !== null ||
    entry.morphology.mobility !== null ||
    entry.confidence !== null,
  ).length
  const sublocationOptions = activeEntry.primary && activeEntry.primary !== 'Other'
    ? SUBLOCATION_OPTIONS[activeEntry.primary]
    : []
  const morphologyFieldsSet = [
    activeEntry.morphology.maxDiameter !== null,
    activeEntry.morphology.shape !== null,
    activeEntry.morphology.mobility !== null,
    activeEntry.morphology.attachment !== null,
    activeEntry.morphology.surface !== null,
  ].filter(Boolean).length
  const anatomicalStatus = activeEntry.primary
    ? activeEntry.primary === 'Other'
      ? activeEntry.otherLocation ? 'Set' : 'Other'
      : activeEntry.sublocation ?? activeEntry.primary
    : 'None'
  const morphologyStatus = morphologyFieldsSet === 0 ? 'None' : `${morphologyFieldsSet} set`
  const confidenceStatus = getConfidenceLabel(activeEntry.confidence)
  const riskStatus = getRiskLabel(effectiveRisk)

  return (
    <Stack data-house-role="page" className="gap-6">
      <Row align="center" gap="md" wrap={false} className="house-page-title-row">
        <SectionMarker tone="report" size="title" className="self-stretch h-auto" />
        <PageHeader heading="Thrombus" className="!ml-0 !mt-0" />
      </Row>

      <div className="flex items-center gap-3">
        <span
          className={cn(
            'rounded-full px-3 py-1 text-xs font-semibold',
            filledCount === 0 && 'bg-[hsl(var(--tone-positive-100))] text-[hsl(var(--tone-positive-600))]',
            filledCount > 0 && 'bg-[hsl(var(--tone-danger-100))] text-[hsl(var(--tone-danger-600))]',
          )}
        >
          {filledCount === 0 ? 'No thrombus detected' : filledCount === 1 ? '1 thrombus identified' : `${filledCount} thrombi identified`}
        </span>
      </div>

      <div className="flex items-center gap-2">
        <div className="flex rounded-lg bg-[hsl(var(--tone-neutral-50))] p-1 ring-1 ring-[hsl(var(--stroke-soft)/0.4)]">
          {entries.map((entry, index) => (
            <div key={entry.id} className="group relative flex items-center">
              <button
                type="button"
                onClick={() => setActiveEntryId(entry.id)}
                className={cn(
                  'flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-all',
                  entry.id === activeEntryId
                    ? 'bg-[hsl(var(--section-style-report-accent))] text-white shadow-sm'
                    : 'text-[hsl(var(--tone-neutral-600))] hover:text-[hsl(var(--tone-neutral-900))]',
                )}
              >
                {entry.primary && THROMBUS_LOCATION_ICONS[entry.primary] && (() => {
                  const Icon = THROMBUS_LOCATION_ICONS[entry.primary]
                  return <Icon size={16} />
                })()}
                <span>{entryShortLabel(entry, index)}</span>
              </button>
              {entries.length > 1 && (
                <button
                  type="button"
                  onClick={(event) => {
                    event.stopPropagation()
                    removeEntry(entry.id)
                  }}
                  className="ml-0.5 rounded-full p-0.5 text-[10px] text-[hsl(var(--tone-neutral-400))] opacity-0 transition-opacity hover:text-[hsl(var(--tone-danger-500))] group-hover:opacity-100"
                  title="Remove"
                >
                  x
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

      <div className="space-y-5">
        <ThrombusSection
          title="Anatomical Localisation"
          statusLabel={anatomicalStatus}
          statusTone={activeEntry.primary ? 'active' : 'none'}
        >
          <div className="space-y-4">
            <div className="grid w-full gap-2 [grid-template-columns:repeat(auto-fit,minmax(7.5rem,1fr))]">
              {PRIMARY_OPTIONS.map((option) => {
                const Icon = THROMBUS_LOCATION_ICONS[option.value]
                const selected = activeEntry.primary === option.value
                return (
                  <button
                    key={option.value}
                    type="button"
                    onClick={() =>
                      updateEntry(activeEntry.id, {
                        primary: selected ? null : option.value,
                        sublocation: null,
                        otherLocation: '',
                      })
                    }
                    className={cn(
                      'flex w-full flex-col items-center gap-2 rounded-lg px-3 py-3 text-[10px] font-medium transition-all duration-150',
                      selected
                        ? 'bg-white ring-2 ring-[hsl(var(--tone-danger-300))] shadow-[0_12px_28px_rgba(127,29,29,0.08)] -translate-y-[1px]'
                        : 'bg-[hsl(var(--tone-neutral-50))] ring-1 ring-inset ring-[hsl(var(--stroke-soft)/0.4)] hover:bg-[hsl(var(--tone-neutral-100))] hover:-translate-y-[1px]',
                    )}
                    title={option.label}
                  >
                    {Icon && (
                      <span className={PRIMARY_ICON_COLORS[option.value]}>
                        <Icon size={38} />
                      </span>
                    )}
                    <span className={cn(
                      'tracking-[0.08em]',
                      selected ? 'text-[hsl(var(--tone-accent-900))]' : 'text-[hsl(var(--tone-neutral-600))]',
                    )}>
                      {option.value}
                    </span>
                  </button>
                )
              })}
            </div>

            {activeEntry.primary === 'Other' ? (
              <div className="grid gap-2 md:max-w-xl md:grid-cols-[minmax(10rem,12rem)_minmax(12rem,18rem)] md:items-center">
                <span className="text-sm text-[hsl(var(--foreground))]">Specify location</span>
                <input
                  type="text"
                  value={activeEntry.otherLocation}
                  onChange={(event) => updateEntry(activeEntry.id, { otherLocation: event.target.value })}
                  placeholder="Enter anatomical location..."
                  className="house-input h-8 w-full rounded-md px-2.5 text-xs"
                />
              </div>
            ) : sublocationOptions.length > 0 ? (
              <div className="grid gap-2 md:max-w-xl md:grid-cols-[minmax(10rem,12rem)_minmax(12rem,18rem)] md:items-center">
                <span className="text-sm text-[hsl(var(--foreground))]">Sub-location</span>
                <select
                  value={activeEntry.sublocation ?? ''}
                  onChange={(event) => updateEntry(activeEntry.id, { sublocation: event.target.value || null })}
                  className="house-dropdown h-8 w-full rounded-md px-2.5 text-xs"
                >
                  <option value="">Select...</option>
                  {sublocationOptions.map((option) => (
                    <option key={option} value={option}>{option}</option>
                  ))}
                </select>
              </div>
            ) : null}
          </div>
        </ThrombusSection>

        <ThrombusSection
          title="Morphology & Behaviour"
          statusLabel={morphologyStatus}
          statusTone={morphologyFieldsSet > 0 ? 'active' : 'none'}
        >
          <div className="grid gap-x-8 gap-y-5 md:grid-cols-2">
            <div className="grid gap-2 md:col-span-2 md:grid-cols-[minmax(10rem,12rem)_auto_1fr] md:items-center">
              <span className="text-sm text-[hsl(var(--foreground))]">Maximum diameter</span>
              <input
                type="number"
                min={0}
                step={1}
                value={activeEntry.morphology.maxDiameter ?? ''}
                onChange={(event) => {
                  const nextValue = event.target.value === '' ? null : Number(event.target.value)
                  updateMorphology(activeEntry.id, { maxDiameter: nextValue })
                }}
                placeholder="—"
                className="house-input h-8 w-24 text-center tabular-nums text-xs"
              />
              <span className="text-xs text-muted-foreground">mm</span>
            </div>

            <div className="space-y-2">
              <FieldLabel>Shape</FieldLabel>
              <PillSelect
                options={SHAPE_OPTIONS}
                value={activeEntry.morphology.shape}
                onChange={(value) => updateMorphology(activeEntry.id, { shape: value })}
              />
            </div>

            <div className="space-y-2">
              <FieldLabel>Mobility</FieldLabel>
              <PillSelect
                options={MOBILITY_OPTIONS}
                value={activeEntry.morphology.mobility}
                onChange={(value) => updateMorphology(activeEntry.id, { mobility: value })}
              />
            </div>

            <div className="space-y-2">
              <FieldLabel>Attachment</FieldLabel>
              <PillSelect
                options={ATTACHMENT_OPTIONS}
                value={activeEntry.morphology.attachment}
                onChange={(value) => updateMorphology(activeEntry.id, { attachment: value })}
              />
            </div>

            <div className="space-y-2 md:col-span-2">
              <FieldLabel>Surface</FieldLabel>
              <PillSelect
                options={SURFACE_OPTIONS}
                value={activeEntry.morphology.surface}
                onChange={(value) => updateMorphology(activeEntry.id, { surface: value })}
              />
            </div>
          </div>
        </ThrombusSection>

        <ThrombusSection
          title="Confidence"
          statusLabel={confidenceStatus}
          statusTone={activeEntry.confidence ? 'active' : 'none'}
        >
          <PillSelect
            options={CONFIDENCE_OPTIONS}
            value={activeEntry.confidence}
            onChange={(value) => updateEntry(activeEntry.id, { confidence: value })}
          />
        </ThrombusSection>

        <ThrombusSection
          title="Embolic Risk"
          statusLabel={riskStatus}
          statusTone={getRiskTone(effectiveRisk)}
        >
          <div className="space-y-3">
            <div className="flex items-center gap-3">
              <FieldLabel>Risk level</FieldLabel>
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
            <div className="flex overflow-hidden rounded-lg ring-1 ring-[hsl(var(--stroke-soft)/0.5)]">
              {([
                { value: 'low' as const, label: 'Low', bgActive: 'bg-[hsl(164_40%_45%)]', bgInactive: 'bg-[hsl(var(--tone-neutral-50))]', textActive: 'text-white', textInactive: 'text-[hsl(var(--tone-positive-600))]' },
                { value: 'intermediate' as const, label: 'Intermediate', bgActive: 'bg-[hsl(38_55%_50%)]', bgInactive: 'bg-[hsl(var(--tone-neutral-50))]', textActive: 'text-white', textInactive: 'text-[hsl(var(--tone-warning-600))]' },
                { value: 'high' as const, label: 'High', bgActive: 'bg-[hsl(3_55%_48%)]', bgInactive: 'bg-[hsl(var(--tone-neutral-50))]', textActive: 'text-white', textInactive: 'text-[hsl(var(--tone-danger-600))]' },
              ]).map((segment) => (
                <button
                  key={segment.value}
                  type="button"
                  onClick={() => updateEntry(activeEntry.id, { riskOverride: segment.value })}
                  className={cn(
                    'flex-1 border-r border-[hsl(var(--stroke-soft)/0.3)] px-4 py-2.5 text-xs font-semibold transition-all last:border-r-0',
                    effectiveRisk === segment.value
                      ? `${segment.bgActive} ${segment.textActive}`
                      : `${segment.bgInactive} ${segment.textInactive} hover:bg-[hsl(var(--tone-neutral-100))]`,
                  )}
                >
                  {segment.label}
                  {effectiveRisk === segment.value && !activeEntry.riskOverride && computedRisk && (
                    <span className="ml-1 text-[9px] font-normal opacity-75">(auto)</span>
                  )}
                  {effectiveRisk === segment.value && activeEntry.riskOverride && (
                    <span className="ml-1 text-[9px] font-normal opacity-75">(override)</span>
                  )}
                </button>
              ))}
            </div>
            {!effectiveRisk && (
              <p className="text-[11px] text-[hsl(var(--tone-neutral-400))]">
                Enter morphology data to auto-compute risk, or click to override.
              </p>
            )}
          </div>
        </ThrombusSection>
      </div>

      <div className="rounded-lg border border-[hsl(var(--stroke-soft)/0.72)] bg-[hsl(var(--tone-neutral-50)/0.5)] p-5">
        <div className="flex items-center gap-2">
          <FieldLabel>Report Summary</FieldLabel>
          {activeIndex >= 0 && (
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
