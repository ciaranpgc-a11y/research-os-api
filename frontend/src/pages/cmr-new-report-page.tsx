import { Fragment, useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react'
import { ExternalLink } from 'lucide-react'

import { PageHeader, Row, Stack, DrilldownSheet } from '@/components/primitives'
import { SectionMarker } from '@/components/patterns'
import type { CmrCanonicalParam, CmrCanonicalTableResponse, PapillaryMode } from '@/lib/cmr-api'
import { fetchConfig, fetchReferenceParameters, updateConfig } from '@/lib/cmr-api'
import { getExtractionResult, subscribeExtractionResult } from '@/lib/cmr-report-store'
import { cn } from '@/lib/utils'
import { computeSeverity, inferSeverityLabel, type SeverityLabelType, type SeverityResult } from '@/lib/cmr-severity'
import {
  type RangeParam,
  factoryBaseline,
  hasValidRange,
  computeMeasuredRel,
  computeMeasuredPos,
  isAbnormal as isAbnormalValue,
  globalAutoAdjust,
  perMeasurementAutoAdjust,
  constrainRange,
} from '@/lib/cmr-chart-scaling'

// ---------------------------------------------------------------------------
// Helpers (shared with reference table)
// ---------------------------------------------------------------------------

type GroupedSection = { major: string; sub: string; params: CmrCanonicalParam[] }

function groupBySections(params: CmrCanonicalParam[]): GroupedSection[] {
  const groups: GroupedSection[] = []
  let current: GroupedSection | null = null
  for (const p of params) {
    const key = `${p.major_section}||${p.sub_section}`
    if (!current || `${current.major}||${current.sub}` !== key) {
      current = { major: p.major_section, sub: p.sub_section, params: [] }
      groups.push(current)
    }
    current.params.push(p)
  }
  return groups
}

function displayName(key: string): string {
  return key.replace(/\s*\(i\)\s*$/, '')
}

function dpNeeded(v: number | null): number {
  if (v === null) return 0
  const rounded = Math.round(v * 100) / 100
  if (rounded % 1 === 0) return 0
  const s = rounded.toString()
  const decimals = s.includes('.') ? s.split('.')[1].length : 0
  return Math.min(decimals, 2)
}

function fmtRow(...values: (number | null)[]): string[] {
  const maxDp = Math.max(...values.map(dpNeeded))
  return values.map((v) => {
    if (v === null) return '\u2014'
    const rounded = Math.round(v * 100) / 100
    return maxDp === 0 ? String(rounded) : rounded.toFixed(maxDp)
  })
}

function titleCase(s: string): string {
  return s
    .toLowerCase()
    .split(' ')
    .map((w) => (w.length <= 2 && w !== 'of' ? w.toUpperCase() : w.charAt(0).toUpperCase() + w.slice(1)))
    .join(' ')
}

// ---------------------------------------------------------------------------
// Reusable pill toggle
// ---------------------------------------------------------------------------

function PillToggle({ options, value, onChange }: {
  options: { key: string; label: string }[]
  value: string
  onChange: (key: string) => void
}) {
  return (
    <div className="flex rounded-full bg-[hsl(var(--tone-danger-100)/0.5)] p-0.5 ring-1 ring-[hsl(var(--tone-danger-200)/0.5)]">
      {options.map((o) => (
        <button
          key={o.key}
          type="button"
          onClick={() => onChange(o.key)}
          className={cn(
            'rounded-full px-4 py-1.5 text-xs font-medium transition-all',
            value === o.key
              ? 'bg-[hsl(var(--section-style-report-accent))] text-white shadow-sm'
              : 'text-[hsl(var(--tone-danger-600))] hover:text-[hsl(var(--tone-danger-800))]',
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Small components
// ---------------------------------------------------------------------------

function BsaPill() {
  return (
    <span className="ml-1.5 inline-flex items-center rounded-full bg-[hsl(var(--tone-neutral-200))] px-[7px] py-[1px] text-[10px] font-semibold tracking-wide text-[hsl(var(--tone-neutral-600))]">
      BSA
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
// Chart components
// ---------------------------------------------------------------------------

function ChartChipIcon({ variant }: { variant: 'global' | 'per-meas' }) {
  return (
    <svg width="16" height="12" viewBox="0 0 16 12" fill="none" className="shrink-0">
      <line x1="0" y1="6" x2="16" y2="6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeOpacity="0.4" />
      <circle cx={variant === 'global' ? 10 : 5} cy="6" r="3" fill="currentColor" />
    </svg>
  )
}

function ChartControlStrip({
  onGlobalAuto,
  onPerMeasAuto,
  scalingMode,
}: {
  onGlobalAuto: () => void
  onPerMeasAuto: () => void
  scalingMode: 'factory' | 'global' | 'per-meas'
}) {
  const chipClass = (active: boolean) =>
    cn(
      'inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1.5 text-[11px] font-medium transition-colors cursor-pointer',
      active
        ? 'border-[hsl(var(--section-style-report-accent))] bg-[hsl(var(--section-style-report-accent))] text-white'
        : 'border-[hsl(var(--stroke-soft)/0.5)] bg-white text-[hsl(var(--tone-neutral-600))] hover:bg-[hsl(var(--tone-neutral-100))]',
    )
  return (
    <div className="flex items-center gap-1">
      <button type="button" onClick={onGlobalAuto} className={chipClass(scalingMode === 'global')}>
        <ChartChipIcon variant="global" /> Global
      </button>
      <button type="button" onClick={onPerMeasAuto} className={chipClass(scalingMode === 'per-meas')}>
        <ChartChipIcon variant="per-meas" /> Per measurement
      </button>
    </div>
  )
}

function RangeChart({
  measured,
  ll,
  ul,
  direction,
  rangeStart,
  rangeWidth,
}: {
  measured: number
  ll: number
  ul: number
  direction: string
  rangeStart: number
  rangeWidth: number
}) {
  const measuredRel = computeMeasuredRel(measured, ll, ul)
  const measuredPos = computeMeasuredPos(measuredRel, rangeStart, rangeWidth)
  const abnormal = isAbnormalValue(measured, ll, ul, direction)

  const bandLeftPct = `${rangeStart * 100}%`
  const bandWidthPct = `${rangeWidth * 100}%`
  const dotPct = `${measuredPos * 100}%`

  return (
    <div className="group/chart relative mx-[5px] h-[22px] w-[calc(100%-10px)]">
      {/* Background track */}
      <div className="absolute inset-x-0 top-1/2 h-[2px] -translate-y-1/2 rounded-sm bg-[hsl(var(--tone-neutral-300))]" />
      {/* Frosted band */}
      <div
        className="absolute top-1/2 h-4 -translate-y-1/2 rounded border border-[hsl(var(--tone-positive-300)/0.18)] bg-[hsl(var(--tone-positive-300)/0.14)] transition-all duration-200 group-hover/chart:border-[hsl(var(--tone-positive-500)/0.25)] group-hover/chart:bg-[hsl(var(--tone-positive-300)/0.28)] group-hover/chart:shadow-[0_0_12px_hsl(var(--tone-positive-300)/0.15)]"
        style={{ left: bandLeftPct, width: bandWidthPct }}
      />
      {/* Ring dot marker */}
      <div
        className={cn(
          'absolute top-1/2 h-[10px] w-[10px] -translate-x-1/2 -translate-y-1/2 rounded-full border-2 transition-all duration-200',
          abnormal
            ? 'border-[hsl(var(--tone-danger-500))] bg-white shadow-[0_1px_3px_hsl(var(--tone-danger-600)/0.15)] group-hover/chart:bg-[hsl(var(--tone-danger-500))] group-hover/chart:shadow-[0_0_0_3px_hsl(var(--tone-danger-500)/0.2),0_0_8px_hsl(var(--tone-danger-500)/0.3)]'
            : 'border-[hsl(var(--tone-positive-500))] bg-white shadow-[0_1px_3px_hsl(var(--tone-positive-600)/0.15)] group-hover/chart:bg-[hsl(var(--tone-positive-500))] group-hover/chart:shadow-[0_0_0_3px_hsl(var(--tone-positive-500)/0.2),0_0_8px_hsl(var(--tone-positive-500)/0.3)]',
        )}
        style={{ left: dotPct }}
      />
    </div>
  )
}

// ---------------------------------------------------------------------------
// Parameter drilldown (with measured value)
// ---------------------------------------------------------------------------

function ParameterDrilldown({
  param,
  sex,
  measuredValue,
  onClose,
}: {
  param: CmrCanonicalParam
  sex: string
  measuredValue?: number
  onClose: () => void
}) {
  const [fLL, fMean, fUL, fSD] = fmtRow(param.ll, param.mean, param.ul, param.sd)

  let status: 'normal' | 'abnormal' | undefined
  if (measuredValue !== undefined) {
    const dir = param.abnormal_direction
    if (dir === 'high' && param.ul !== null && measuredValue > param.ul) status = 'abnormal'
    else if (dir === 'low' && param.ll !== null && measuredValue < param.ll) status = 'abnormal'
    else if (dir === 'both' && ((param.ul !== null && measuredValue > param.ul) || (param.ll !== null && measuredValue < param.ll))) status = 'abnormal'
    else status = 'normal'
  }

  return (
    <DrilldownSheet open onOpenChange={(open) => { if (!open) onClose() }}>
      <DrilldownSheet.Header title={displayName(param.parameter_key)} variant="workspace">
        {param.sub_section && (
          <p className="mt-0.5 text-xs text-[hsl(var(--muted-foreground))]">
            {titleCase(param.major_section)} &rsaquo; {param.sub_section}
          </p>
        )}
        {!param.sub_section && (
          <p className="mt-0.5 text-xs text-[hsl(var(--muted-foreground))]">
            {titleCase(param.major_section)}
          </p>
        )}
      </DrilldownSheet.Header>

      <DrilldownSheet.Content>
        {/* Measured value highlight */}
        {measuredValue !== undefined && (
          <div className="space-y-2">
            <DrilldownSheet.Heading>Measured Value</DrilldownSheet.Heading>
            <div className={cn(
              'rounded-lg border-2 p-4 text-center',
              status === 'abnormal'
                ? 'border-[hsl(var(--tone-danger-300))] bg-[hsl(var(--tone-danger-50))]'
                : 'border-[hsl(var(--tone-positive-300))] bg-[hsl(var(--tone-positive-50))]',
            )}>
              <p className={cn(
                'text-3xl font-bold tabular-nums',
                status === 'abnormal' ? 'text-[hsl(var(--tone-danger-600))]' : 'text-[hsl(var(--tone-positive-600))]',
              )}>
                {measuredValue}
              </p>
              <p className="mt-1 text-sm text-[hsl(var(--muted-foreground))]">
                {param.unit} &middot; {status === 'abnormal' ? 'Outside reference range' : 'Within reference range'}
              </p>
            </div>
          </div>
        )}

        {/* Reference values */}
        <div className="space-y-4">
          <DrilldownSheet.Heading>Reference Values ({sex})</DrilldownSheet.Heading>
          <div className="grid grid-cols-2 gap-3">
            <DrilldownSheet.StatCard title="Lower Limit" value={fLL} />
            <DrilldownSheet.StatCard title="Mean" value={fMean} tone="positive" />
            <DrilldownSheet.StatCard title="Upper Limit" value={fUL} />
            <DrilldownSheet.StatCard title="SD" value={fSD} />
          </div>
          <div className="flex flex-wrap gap-x-6 gap-y-2 text-sm">
            <div>
              <span className="text-[hsl(var(--muted-foreground))]">Unit</span>
              <span className="ml-2 font-medium">{param.unit}</span>
            </div>
            <div>
              <span className="text-[hsl(var(--muted-foreground))]">Band</span>
              <span className="ml-2 font-medium">{param.age_band || 'Adult'}</span>
            </div>
            {param.abnormal_direction && (
              <div>
                <span className="text-[hsl(var(--muted-foreground))]">Direction</span>
                <span className="ml-2 font-medium">
                  <DirectionIndicator dir={param.abnormal_direction} />
                  <span className="ml-1 capitalize">{param.abnormal_direction}</span>
                </span>
              </div>
            )}
          </div>
        </div>

        {/* Sources */}
        <div className="mt-6 space-y-3">
          <DrilldownSheet.Heading>Sources</DrilldownSheet.Heading>
          {param.sources.length > 0 ? (
            <div className="space-y-3">
              {param.sources.map((src) => (
                <a
                  key={src.doi}
                  href={src.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="block rounded-lg border border-[hsl(var(--stroke-soft)/0.72)] p-3 transition-colors hover:border-[hsl(var(--tone-positive-300))] hover:bg-[hsl(var(--tone-positive-50)/0.5)]"
                >
                  <div className="flex items-start gap-2">
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium leading-snug text-[hsl(var(--foreground))]">{src.short_ref}</p>
                      <p className="mt-1 text-xs leading-relaxed text-[hsl(var(--muted-foreground))]">{src.title}</p>
                      <p className="mt-1 text-xs text-[hsl(var(--tone-neutral-400))]">{src.journal}</p>
                    </div>
                    <ExternalLink className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[hsl(var(--muted-foreground))]" />
                  </div>
                </a>
              ))}
            </div>
          ) : (
            <p className="text-sm italic text-[hsl(var(--muted-foreground))]">
              No sources linked yet.
            </p>
          )}
        </div>
      </DrilldownSheet.Content>
    </DrilldownSheet>
  )
}

// ---------------------------------------------------------------------------
// Main page
// ---------------------------------------------------------------------------

export function CmrNewReportPage() {
  const [data, setData] = useState<CmrCanonicalTableResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({})
  const [selectedParam, setSelectedParam] = useState<CmrCanonicalParam | null>(null)
  const [papMode, setPapMode] = useState<PapillaryMode>('mass')
  const [showFilter, setShowFilter] = useState<'all' | 'recorded'>('recorded')
  const [indexFilter, setIndexFilter] = useState<'all' | 'indexed'>('all')
  const [chartMode, setChartMode] = useState<'off' | 'on'>('on')
  const [abnormalFilter, setAbnormalFilter] = useState<'all' | 'abnormal'>('all')
  const [severityMode, setSeverityMode] = useState<'off' | 'abnormal'>('off')
  const [rangeParams, setRangeParams] = useState<Map<string, RangeParam>>(new Map())
  const [scalingMode, setScalingMode] = useState<'factory' | 'global' | 'per-meas'>('global')
  // Pull demographics and measurements from the shared extraction store
  const extraction = useSyncExternalStore(subscribeExtractionResult, getExtractionResult)
  const measuredValues = useMemo(() => {
    const map: Map<string, number> = new Map()
    if (extraction?.measurements) {
      for (const m of extraction.measurements) map.set(m.parameter, m.value)
    }
    return map
  }, [extraction])
  const sex = extraction?.demographics?.sex ?? 'Male'
  const age = extraction?.demographics?.age ?? undefined
  const sectionRefs = useRef<Record<string, HTMLDivElement | null>>({})

  useEffect(() => {
    fetchConfig().then((c) => setPapMode(c.papillary_mode)).catch(() => {})
  }, [])

  const toggleCollapse = (key: string) => {
    setCollapsed((prev) => ({ ...prev, [key]: !prev[key] }))
  }

  const load = useCallback(async () => {
    if (!data) setLoading(true)
    try {
      const result = await fetchReferenceParameters(sex, age)
      setData(result)
    } catch {
      // ignore
    } finally {
      setLoading(false)
    }
  }, [sex, age]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    void load()
  }, [load])

  const allGroups = data ? groupBySections(data.parameters) : []
  const groups = allGroups
    .map((g) => {
      let params = g.params
      if (showFilter === 'recorded') params = params.filter((p) => measuredValues.has(p.parameter_key))
      if (indexFilter === 'indexed') {
        // Build set from the full (unfiltered) group so we know which absolutes have an indexed counterpart
        const indexedKeys = new Set(g.params.filter((p) => p.indexing === 'BSA').map((p) => p.parameter_key.replace(/\s*\(i\)\s*$/, '')))
        // Hide absolute params whose indexed variant exists; keep everything else
        params = params.filter((p) => p.indexing === 'BSA' || !indexedKeys.has(p.parameter_key))
      }
      if (abnormalFilter === 'abnormal') {
        params = params.filter((p) => {
          const m = measuredValues.get(p.parameter_key)
          if (m === undefined) return false
          return isAbnormalValue(m, p.ll, p.ul, p.abnormal_direction)
        })
      }
      return { ...g, params }
    })
    .filter((g) => g.params.length > 0)
  const majorSections = groups.reduce<string[]>((acc, g) => {
    if (!acc.includes(g.major)) acc.push(g.major)
    return acc
  }, [])

  /** Collect all measuredRel values for visible rows with valid ranges. */
  const collectMeasuredRels = useCallback(() => {
    const rels: number[] = []
    for (const g of groups) {
      for (const p of g.params) {
        const m = measuredValues.get(p.parameter_key)
        if (m !== undefined && hasValidRange(p.ll, p.ul)) {
          rels.push(computeMeasuredRel(m, p.ll!, p.ul!))
        }
      }
    }
    return rels
  }, [groups, measuredValues])

  // Apply global auto-adjust on initial load when data becomes available
  const hasAppliedInitialGlobal = useRef(false)
  useEffect(() => {
    if (hasAppliedInitialGlobal.current || scalingMode !== 'global') return
    const rels = collectMeasuredRels()
    if (rels.length === 0) return
    const result = globalAutoAdjust(rels)
    if (result) {
      setRangeParams(new Map([['__global__', constrainRange(result, rels)]]))
      hasAppliedInitialGlobal.current = true
    }
  }, [collectMeasuredRels, scalingMode])

  return (
    <Stack data-house-role="page" space="lg">
      <Row align="center" gap="md" wrap={false} className="house-page-title-row">
        <SectionMarker tone="report" size="title" className="self-stretch h-auto" />
        <PageHeader
          heading="Quantitative"
          className="!ml-0 !mt-0"
        />
      </Row>

      {/* Patient demographics */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="rounded-md border border-[hsl(var(--stroke-soft)/0.72)] bg-[hsl(var(--tone-neutral-50))] px-4 py-2">
          <span className="text-sm font-semibold text-[hsl(var(--foreground))]">{sex}</span>
        </div>
        <div className="rounded-md border border-[hsl(var(--stroke-soft)/0.72)] bg-[hsl(var(--tone-neutral-50))] px-4 py-2">
          <span className="text-sm font-semibold text-[hsl(var(--foreground))]">{age != null ? `${age} years` : '—'}</span>
        </div>
      </div>

      {/* Controls bar */}
      <div className="flex flex-wrap items-start gap-5">
        {/* Preference */}
        <div className="flex flex-col gap-1">
          <div className="flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wider text-[hsl(var(--tone-neutral-400))]">
            <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M12.5 2.5a2 2 0 0 1 0 3l-9.5 9L1 15l.5-2 9.5-9a2 2 0 0 1 3 0z" /></svg>
            Preference
          </div>
          <PillToggle
            options={[
              { key: 'mass', label: 'Pap in LV Mass' },
              { key: 'blood_pool', label: 'Pap in Blood Pool' },
            ]}
            value={papMode}
            onChange={(v) => { setPapMode(v as PapillaryMode); void updateConfig({ papillary_mode: v as PapillaryMode }) }}
          />
        </div>

        <div className="h-10 w-px self-end bg-[hsl(var(--stroke-soft)/0.3)]" />

        {/* Filters */}
        <div className="flex flex-col gap-1">
          <div className="flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wider text-[hsl(var(--tone-neutral-400))]">
            <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M1 2h14M3 6h10M5 10h6M7 14h2" /></svg>
            Filters
          </div>
          <div className="flex items-center gap-2">
            <PillToggle
              options={[
                { key: 'recorded', label: 'Recorded Only' },
                { key: 'all', label: 'All Metrics' },
              ]}
              value={showFilter}
              onChange={(v) => setShowFilter(v as 'all' | 'recorded')}
            />
            <PillToggle
              options={[
                { key: 'all', label: 'All' },
                { key: 'indexed', label: 'Indexed Only' },
              ]}
              value={indexFilter}
              onChange={(v) => setIndexFilter(v as 'all' | 'indexed')}
            />
            <PillToggle
              options={[
                { key: 'all', label: 'All' },
                { key: 'abnormal', label: 'Abnormal Only' },
              ]}
              value={abnormalFilter}
              onChange={(v) => setAbnormalFilter(v as 'all' | 'abnormal')}
            />
          </div>
        </div>

        <div className="h-10 w-px self-end bg-[hsl(var(--stroke-soft)/0.3)]" />

        {/* Viewing */}
        <div className="flex flex-col gap-1">
          <div className="flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wider text-[hsl(var(--tone-neutral-400))]">
            <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><rect x="1" y="3" width="14" height="10" rx="1.5" /><path d="M1 6h14" /></svg>
            Viewing
          </div>
          <div className="flex flex-col gap-1">
            <div className="flex items-center gap-2">
              <PillToggle
                options={[
                  { key: 'on', label: 'Charts' },
                  { key: 'off', label: 'Table Only' },
                ]}
                value={chartMode}
                onChange={(v) => setChartMode(v as 'off' | 'on')}
              />
            {chartMode === 'on' && (
              <ChartControlStrip
                scalingMode={scalingMode}
                onGlobalAuto={() => {
                  if (scalingMode === 'global') {
                    setScalingMode('factory')
                    setRangeParams(new Map())
                    return
                  }
                  const rels = collectMeasuredRels()
                  const result = globalAutoAdjust(rels)
                  if (result) {
                    setScalingMode('global')
                    setRangeParams(new Map([['__global__', constrainRange(result, rels)]]))
                  }
                }}
                onPerMeasAuto={() => {
                  if (scalingMode === 'per-meas') {
                    setScalingMode('factory')
                    setRangeParams(new Map())
                    return
                  }
                  const newMap: Map<string, RangeParam> = new Map()
                  for (const g of groups) {
                    for (const p of g.params) {
                      const m = measuredValues.get(p.parameter_key)
                      if (m !== undefined && hasValidRange(p.ll, p.ul)) {
                        const rel = computeMeasuredRel(m, p.ll!, p.ul!)
                        newMap.set(p.parameter_key, perMeasurementAutoAdjust(rel))
                      }
                    }
                  }
                  setScalingMode('per-meas')
                  setRangeParams(newMap)
                }}
              />
            )}
            </div>
            <PillToggle
              options={[
                { key: 'off', label: 'Off' },
                { key: 'abnormal', label: 'Abnormal' },
              ]}
              value={severityMode}
              onChange={(v) => setSeverityMode(v as 'off' | 'abnormal')}
            />
          </div>
        </div>
      </div>

      {loading ? (
        <p className="py-8 text-center text-sm text-[hsl(var(--muted-foreground))]">Loading reference data...</p>
      ) : (
        <div data-section-key="Numerical" className="flex flex-col gap-6 scroll-mt-20">
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
                {/* Section heading — left accent bar, flush with table */}
                <button
                  type="button"
                  onClick={() => toggleCollapse(major)}
                  className={cn(
                    'flex w-full items-stretch overflow-hidden border border-[hsl(var(--stroke-soft)/0.72)] bg-[hsl(var(--tone-neutral-50))] text-left transition-colors hover:bg-[hsl(var(--tone-neutral-100))]',
                    isCollapsed ? 'rounded-lg' : 'rounded-t-lg border-b border-b-[hsl(var(--stroke-soft))]',
                  )}
                >
                  <div className="w-1 shrink-0 bg-[hsl(var(--section-style-report-accent))]" />
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
                        <col style={{ width: chartMode === 'on' ? '20%' : '28%' }} />
                        <col style={{ width: chartMode === 'on' ? '6%' : '8%' }} />
                        <col style={{ width: chartMode === 'on' ? '7%' : '11%' }} />
                        <col style={{ width: chartMode === 'on' ? '6%' : '9%' }} />
                        <col style={{ width: chartMode === 'on' ? '6%' : '9%' }} />
                        <col style={{ width: chartMode === 'on' ? '6%' : '9%' }} />
                        {severityMode === 'abnormal' && <col style={{ width: chartMode === 'on' ? '19%' : '26%' }} />}
                        {chartMode === 'on' && <col style={{ width: severityMode === 'abnormal' ? '30%' : '40%' }} />}
                      </colgroup>
                      <thead>
                        <tr className="border-b-2 border-[hsl(var(--tone-neutral-300))] bg-[hsl(var(--tone-neutral-50))]">
                          <th className="house-table-head-text px-3 py-2 text-left">Parameter</th>
                          <th className="house-table-head-text px-3 py-2 text-center">Unit</th>
                          <th className="house-table-head-text px-3 py-2 text-center font-bold text-[hsl(var(--section-style-report-accent))]">Measured</th>
                          <th className="house-table-head-text px-3 py-2 text-center">LL</th>
                          <th className="house-table-head-text px-3 py-2 text-center">Mean</th>
                          <th className="house-table-head-text px-3 py-2 text-center">UL</th>
                          {severityMode === 'abnormal' && (
                            <th className="house-table-head-text px-3 py-2 text-center">Interpretation</th>
                          )}
                          {chartMode === 'on' && (
                            <th className="house-table-head-text px-3 py-2 text-center">Range</th>
                          )}
                        </tr>
                      </thead>
                      <tbody>
                        {subGroups.map((g, gi) => (
                          <Fragment key={`grp-${g.major}|${g.sub}`}>
                            {/* Sub-section divider */}
                            {g.sub && (
                              <tr className="border-b border-[hsl(var(--stroke-soft)/0.5)]">
                                <td
                                  colSpan={6 + (severityMode === 'abnormal' ? 1 : 0) + (chartMode === 'on' ? 1 : 0)}
                                  className={cn(
                                    'bg-[hsl(var(--tone-danger-100))] px-3 py-1.5 text-[0.8rem] font-semibold tracking-wide text-[hsl(var(--tone-danger-900)/0.82)]',
                                    gi > 0 && 'border-t border-[hsl(var(--tone-danger-200))]',
                                  )}
                                >
                                  {g.sub}
                                </td>
                              </tr>
                            )}
                            {/* Data rows */}
                            {g.params.map((p) => {
                              const isBsa = p.indexing === 'BSA'
                              const [fLL, fMean, fUL, fSD] = fmtRow(p.ll, p.mean, p.ul, p.sd)
                              const measured = measuredValues.get(p.parameter_key)
                              const hasMeasuredVal = measured !== undefined

                              let severity: SeverityResult = { grade: 'normal', label: 'Normal' }
                              if (hasMeasuredVal) {
                                severity = computeSeverity(
                                  measured!,
                                  p.ll,
                                  p.ul,
                                  p.sd,
                                  p.abnormal_direction,
                                  (p.severity_label as SeverityLabelType) ?? inferSeverityLabel(p.parameter_key, p.major_section, p.sub_section),
                                  p.severity_thresholds ?? null,
                                  p.severity_label_override ?? null,
                                )
                              }
                              return (
                                <tr
                                  key={p.parameter_key}
                                  onClick={() => setSelectedParam(p)}
                                  className={cn(
                                    'cursor-pointer border-b border-[hsl(var(--stroke-soft)/0.4)] transition-colors duration-100 hover:bg-[hsl(var(--tone-neutral-50)/0.65)]',
                                    selectedParam?.parameter_key === p.parameter_key && 'bg-[hsl(var(--tone-danger-50)/0.6)]',
                                    severityMode === 'abnormal' && hasMeasuredVal && severity.grade === 'normal' && 'bg-[hsl(158_30%_94%)]',
                                    severityMode === 'abnormal' && hasMeasuredVal && severity.grade === 'mild' && 'bg-[hsl(46_60%_91%)]',
                                    severityMode === 'abnormal' && hasMeasuredVal && severity.grade === 'moderate' && 'bg-[hsl(20_55%_87%)]',
                                    severityMode === 'abnormal' && hasMeasuredVal && severity.grade === 'severe' && 'bg-[hsl(4_55%_82%)]',
                                  )}
                                >
                                  <td className="house-table-cell-text px-3 py-2 font-medium text-[hsl(var(--foreground))]">
                                    {displayName(p.parameter_key)}
                                    {isBsa && <BsaPill />}
                                  </td>
                                  <td className="house-table-cell-text whitespace-nowrap px-3 py-2 text-center text-[hsl(var(--tone-neutral-500))]">
                                    {p.unit}
                                  </td>
                                  <td className={cn(
                                    'house-table-cell-text whitespace-nowrap px-3 py-2 text-center tabular-nums font-semibold',
                                    !hasMeasuredVal && 'text-[hsl(var(--tone-neutral-300))]',
                                  )}>
                                    {hasMeasuredVal ? measured : '\u2014'}
                                  </td>
                                  <td className="house-table-cell-text whitespace-nowrap px-3 py-2 text-center tabular-nums">
                                    {fLL}
                                  </td>
                                  <td className="house-table-cell-text whitespace-nowrap px-3 py-2 text-center tabular-nums font-medium">
                                    {fMean}
                                  </td>
                                  <td className="house-table-cell-text whitespace-nowrap px-3 py-2 text-center tabular-nums">
                                    {fUL}
                                  </td>
                                  {severityMode === 'abnormal' && (
                                    <td className="house-table-cell-text whitespace-nowrap px-3 py-0 text-center align-middle">
                                      {hasMeasuredVal && (
                                        <span className={cn(
                                          'inline-flex items-center rounded-full px-2.5 py-0.5 text-[11px] font-semibold ring-1 ring-inset',
                                          severity.grade === 'normal' && 'bg-[hsl(162_22%_90%)] text-[hsl(164_30%_28%)] ring-[hsl(163_22%_80%)]',
                                          severity.grade === 'mild' && 'bg-[hsl(38_40%_90%)] text-[hsl(34_50%_35%)] ring-[hsl(36_36%_80%)]',
                                          severity.grade === 'moderate' && 'bg-[hsl(16_45%_86%)] text-[hsl(5_48%_32%)] ring-[hsl(10_32%_76%)]',
                                          severity.grade === 'severe' && 'bg-[hsl(2_52%_25%)] text-white ring-[hsl(2_52%_20%)]',
                                        )}>
                                          {severity.label}
                                        </span>
                                      )}
                                    </td>
                                  )}
                                  {chartMode === 'on' && (
                                    <td className="bg-white px-2 py-1">
                                      {hasMeasuredVal && hasValidRange(p.ll, p.ul) ? (
                                        <RangeChart
                                          measured={measured!}
                                          ll={p.ll!}
                                          ul={p.ul!}
                                          direction={p.abnormal_direction}
                                          rangeStart={
                                            (rangeParams.get(p.parameter_key) ?? rangeParams.get('__global__') ?? factoryBaseline()).rangeStart
                                          }
                                          rangeWidth={
                                            (rangeParams.get(p.parameter_key) ?? rangeParams.get('__global__') ?? factoryBaseline()).rangeWidth
                                          }
                                        />
                                      ) : null}
                                    </td>
                                  )}
                                </tr>
                              )
                            })}
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

      {/* Footer */}
      <div className="mt-4 border-t border-[hsl(var(--stroke-soft)/0.3)] pt-4">
        <p className="text-xs text-[hsl(var(--muted-foreground))]">
          Petersen et al. JCMR 2017;19:51 &middot; Kawel-Boehm et al. JCMR 2015;17:29
        </p>
      </div>

      {/* Parameter drilldown */}
      {selectedParam && (
        <ParameterDrilldown
          param={selectedParam}
          sex={sex}
          measuredValue={measuredValues.get(selectedParam.parameter_key)}
          onClose={() => setSelectedParam(null)}
        />
      )}
    </Stack>
  )
}
