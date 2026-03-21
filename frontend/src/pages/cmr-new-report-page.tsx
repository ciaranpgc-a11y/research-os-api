import { Fragment, useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react'
import { ExternalLink } from 'lucide-react'

import { PageHeader, Row, Stack, DrilldownSheet } from '@/components/primitives'
import { SectionMarker } from '@/components/patterns'
import type { CmrCanonicalParam, CmrCanonicalTableResponse, PapillaryMode } from '@/lib/cmr-api'
import { fetchConfig, fetchReferenceParameters, updateConfig } from '@/lib/cmr-api'
import { getExtractionResult, subscribeExtractionResult } from '@/lib/cmr-report-store'
import { cn } from '@/lib/utils'

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
  const [papMode, setPapMode] = useState<PapillaryMode>('blood_pool')
  const [showFilter, setShowFilter] = useState<'all' | 'recorded'>('all')
  // Pull demographics and measurements from the shared extraction store
  const extraction = useSyncExternalStore(subscribeExtractionResult, getExtractionResult)
  const measuredValues = useMemo(() => {
    const map = new Map<string, number>()
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
  const groups = showFilter === 'recorded'
    ? allGroups.map((g) => ({ ...g, params: g.params.filter((p) => measuredValues.has(p.parameter_key)) })).filter((g) => g.params.length > 0)
    : allGroups
  const majorSections = groups.reduce<string[]>((acc, g) => {
    if (!acc.includes(g.major)) acc.push(g.major)
    return acc
  }, [])


  return (
    <Stack data-house-role="page" space="lg">
      <Row align="center" gap="md" wrap={false} className="house-page-title-row">
        <SectionMarker tone="report" size="title" className="self-stretch h-auto" />
        <PageHeader
          heading="Quantitative"
          className="!ml-0 !mt-0"
        />
      </Row>

      {/* Patient demographics and controls */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="rounded-md border border-[hsl(var(--stroke-soft)/0.72)] bg-[hsl(var(--tone-neutral-50))] px-4 py-2">
          <span className="text-sm font-semibold text-[hsl(var(--foreground))]">{sex}</span>
        </div>
        <div className="rounded-md border border-[hsl(var(--stroke-soft)/0.72)] bg-[hsl(var(--tone-neutral-50))] px-4 py-2">
          <span className="text-sm font-semibold text-[hsl(var(--foreground))]">{age != null ? `${age} years` : '—'}</span>
        </div>

        <div className="h-7 w-px bg-[hsl(var(--stroke-soft)/0.5)]" />

        <div className="flex items-center gap-2">
          <div className="flex rounded-full bg-[hsl(var(--tone-danger-100)/0.5)] p-0.5 ring-1 ring-[hsl(var(--tone-danger-200)/0.5)]">
            <button
              type="button"
              onClick={() => { setPapMode('blood_pool'); void updateConfig({ papillary_mode: 'blood_pool' }) }}
              className={cn(
                'rounded-full px-4 py-1.5 text-xs font-medium transition-all',
                papMode === 'blood_pool'
                  ? 'bg-[hsl(var(--section-style-report-accent))] text-white shadow-sm'
                  : 'text-[hsl(var(--tone-danger-600))] hover:text-[hsl(var(--tone-danger-800))]',
              )}
            >
              Pap in Blood Pool
            </button>
            <button
              type="button"
              onClick={() => { setPapMode('mass'); void updateConfig({ papillary_mode: 'mass' }) }}
              className={cn(
                'rounded-full px-4 py-1.5 text-xs font-medium transition-all',
                papMode === 'mass'
                  ? 'bg-[hsl(var(--section-style-report-accent))] text-white shadow-sm'
                  : 'text-[hsl(var(--tone-danger-600))] hover:text-[hsl(var(--tone-danger-800))]',
              )}
            >
              Pap in LV Mass
            </button>
          </div>
        </div>

        <div className="h-7 w-px bg-[hsl(var(--stroke-soft)/0.5)]" />

        <div className="flex items-center gap-2">
          <div className="flex rounded-full bg-[hsl(var(--tone-danger-100)/0.5)] p-0.5 ring-1 ring-[hsl(var(--tone-danger-200)/0.5)]">
            <button
              type="button"
              onClick={() => setShowFilter('all')}
              className={cn(
                'rounded-full px-4 py-1.5 text-xs font-medium transition-all',
                showFilter === 'all'
                  ? 'bg-[hsl(var(--section-style-report-accent))] text-white shadow-sm'
                  : 'text-[hsl(var(--tone-danger-600))] hover:text-[hsl(var(--tone-danger-800))]',
              )}
            >
              All Metrics
            </button>
            <button
              type="button"
              onClick={() => setShowFilter('recorded')}
              className={cn(
                'rounded-full px-4 py-1.5 text-xs font-medium transition-all',
                showFilter === 'recorded'
                  ? 'bg-[hsl(var(--section-style-report-accent))] text-white shadow-sm'
                  : 'text-[hsl(var(--tone-danger-600))] hover:text-[hsl(var(--tone-danger-800))]',
              )}
            >
              Recorded Only
            </button>
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
                        <col style={{ width: '30%' }} />
                        <col style={{ width: '10%' }} />
                        <col style={{ width: '12%' }} />
                        <col style={{ width: '10%' }} />
                        <col style={{ width: '10%' }} />
                        <col style={{ width: '10%' }} />
                        <col style={{ width: '9%' }} />
                        <col style={{ width: '9%' }} />
                      </colgroup>
                      <thead>
                        <tr className="border-b-2 border-[hsl(var(--tone-neutral-300))] bg-[hsl(var(--tone-neutral-50))]">
                          <th className="house-table-head-text px-3 py-2 text-left">Parameter</th>
                          <th className="house-table-head-text px-3 py-2 text-center">Unit</th>
                          <th className="house-table-head-text px-3 py-2 text-center font-bold text-[hsl(var(--section-style-report-accent))]">Measured</th>
                          <th className="house-table-head-text px-3 py-2 text-center">LL</th>
                          <th className="house-table-head-text px-3 py-2 text-center">Mean</th>
                          <th className="house-table-head-text px-3 py-2 text-center">UL</th>
                          <th className="house-table-head-text px-3 py-2 text-center">SD</th>
                          <th className="house-table-head-text px-1 py-2 text-center">Direction</th>
                        </tr>
                      </thead>
                      <tbody>
                        {subGroups.map((g, gi) => (
                          <Fragment key={`grp-${g.major}|${g.sub}`}>
                            {/* Sub-section divider */}
                            {g.sub && (
                              <tr className="border-b border-[hsl(var(--stroke-soft)/0.5)]">
                                <td
                                  colSpan={8}
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

                              let measuredStatus: 'normal' | 'abnormal' | 'none' = 'none'
                              if (hasMeasuredVal) {
                                const dir = p.abnormal_direction
                                if (dir === 'high' && p.ul !== null && measured > p.ul) measuredStatus = 'abnormal'
                                else if (dir === 'low' && p.ll !== null && measured < p.ll) measuredStatus = 'abnormal'
                                else if (dir === 'both') {
                                  if ((p.ul !== null && measured > p.ul) || (p.ll !== null && measured < p.ll)) measuredStatus = 'abnormal'
                                } else measuredStatus = 'normal'
                              }

                              return (
                                <tr
                                  key={p.parameter_key}
                                  onClick={() => setSelectedParam(p)}
                                  className={cn(
                                    'cursor-pointer border-b border-[hsl(var(--stroke-soft)/0.4)] transition-colors duration-100 hover:bg-[hsl(var(--tone-neutral-50)/0.65)]',
                                    selectedParam?.parameter_key === p.parameter_key && 'bg-[hsl(var(--tone-danger-50)/0.6)]',
                                    measuredStatus === 'abnormal' && 'bg-[hsl(var(--tone-danger-50)/0.4)]',
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
                                    measuredStatus === 'abnormal' && 'text-[hsl(var(--tone-danger-600))]',
                                    measuredStatus === 'normal' && 'text-[hsl(var(--tone-positive-600))]',
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
                                  <td className="house-table-cell-text whitespace-nowrap px-3 py-2 text-center tabular-nums text-[hsl(var(--tone-neutral-500))]">
                                    {fSD}
                                  </td>
                                  <td className="house-table-cell-text px-1 py-2 text-center">
                                    <DirectionIndicator dir={p.abnormal_direction} />
                                  </td>
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
