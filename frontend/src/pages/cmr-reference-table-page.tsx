import { Fragment, useCallback, useEffect, useRef, useState } from 'react'
import { ExternalLink } from 'lucide-react'

import { PageHeader, Row, Stack, DrilldownSheet } from '@/components/primitives'
import { SectionMarker } from '@/components/patterns'
import type { CmrCanonicalParam, CmrCanonicalTableResponse, PapillaryMode } from '@/lib/cmr-api'
import { fetchReferenceParameters, fetchConfig, updateConfig } from '@/lib/cmr-api'
import { cn } from '@/lib/utils'

// ---------------------------------------------------------------------------
// Helpers
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

/** Determine the number of decimal places needed for a value (max 2). */
function dpNeeded(v: number | null): number {
  if (v === null) return 0
  const rounded = Math.round(v * 100) / 100
  if (rounded % 1 === 0) return 0
  const s = rounded.toString()
  const decimals = s.includes('.') ? s.split('.')[1].length : 0
  return Math.min(decimals, 2)
}

/** Format a row of numeric values with consistent decimal places. */
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

// (Sources are now stored per-parameter in the data as CmrSourceCitation[])

// ---------------------------------------------------------------------------
// Parameter drilldown panel
// ---------------------------------------------------------------------------

function ParameterDrilldown({
  param,
  sex,
  onClose,
}: {
  param: CmrCanonicalParam
  sex: string
  onClose: () => void
}) {
  const [fLL, fMean, fUL, fSD] = fmtRow(param.ll, param.mean, param.ul, param.sd)
  const isBsa = param.indexing === 'BSA'

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
                      <p className="text-sm font-medium leading-snug text-[hsl(var(--foreground))]">
                        {src.short_ref}
                      </p>
                      <p className="mt-1 text-xs leading-relaxed text-[hsl(var(--muted-foreground))]">
                        {src.title}
                      </p>
                      <p className="mt-1 text-xs text-[hsl(var(--tone-neutral-400))]">
                        {src.journal}
                      </p>
                    </div>
                    <ExternalLink className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[hsl(var(--muted-foreground))]" />
                  </div>
                </a>
              ))}
            </div>
          ) : (
            <p className="text-sm italic text-[hsl(var(--muted-foreground))]">
              No sources linked yet. Add sources via the Reference Database editor.
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

export function CmrReferenceTablePage() {
  const [data, setData] = useState<CmrCanonicalTableResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [sex, setSex] = useState('Male')
  const [ageStr, setAgeStr] = useState('55')
  const [papMode, setPapMode] = useState<PapillaryMode>('blood_pool')
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({})
  const [selectedParam, setSelectedParam] = useState<CmrCanonicalParam | null>(null)
  const sectionRefs = useRef<Record<string, HTMLDivElement | null>>({})

  // Load config on mount
  useEffect(() => {
    fetchConfig().then((c) => setPapMode(c.papillary_mode)).catch(() => {})
  }, [])

  const toggleCollapse = (key: string) => {
    setCollapsed((prev) => ({ ...prev, [key]: !prev[key] }))
  }

  const load = useCallback(async () => {
    // Only show loading spinner on initial load — keep existing data visible during filter changes
    if (!data) setLoading(true)
    try {
      const age = ageStr ? parseFloat(ageStr) : undefined
      const result = await fetchReferenceParameters(sex, age)
      setData(result)
    } catch {
      // ignore
    } finally {
      setLoading(false)
    }
  }, [sex, ageStr, papMode]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    void load()
  }, [load])

  const groups = data ? groupBySections(data.parameters) : []
  const majorSections = groups.reduce<string[]>((acc, g) => {
    if (!acc.includes(g.major)) acc.push(g.major)
    return acc
  }, [])


  return (
    <Stack data-house-role="page" space="lg">
      <Row align="center" gap="md" wrap={false} className="house-page-title-row">
        <SectionMarker tone="accent" size="title" className="self-stretch h-auto" />
        <PageHeader
          heading="Reference Table"
          className="!ml-0 !mt-0"
        />
      </Row>

      {/* Filters bar */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex rounded-full bg-[hsl(var(--tone-positive-100)/0.5)] p-0.5 ring-1 ring-[hsl(var(--tone-positive-200)/0.5)]">
          {['Male', 'Female'].map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => setSex(s)}
              className={cn(
                'rounded-full px-4 py-1.5 text-xs font-medium transition-all',
                sex === s
                  ? 'bg-[hsl(var(--tone-positive-500))] text-white shadow-sm'
                  : 'text-[hsl(var(--tone-positive-600))] hover:text-[hsl(var(--tone-positive-800))]',
              )}
            >
              {s}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-3">
          <input
            type="range"
            min={18}
            max={99}
            value={ageStr || '55'}
            onChange={(e) => setAgeStr(e.target.value)}
            className="h-1.5 w-36 cursor-pointer appearance-none rounded-full bg-[hsl(var(--tone-neutral-200))] accent-[hsl(var(--tone-positive-500))]"
          />
          <span className="text-sm tabular-nums text-[hsl(var(--foreground))]"><span className="font-semibold">{ageStr || '55'}</span> <span className="text-xs font-medium text-[hsl(var(--muted-foreground))]">years</span></span>
        </div>

        <div className="h-7 w-px bg-[hsl(var(--stroke-soft)/0.5)]" />

        <div className="flex rounded-full bg-[hsl(var(--tone-positive-100)/0.5)] p-0.5 ring-1 ring-[hsl(var(--tone-positive-200)/0.5)]">
          {([['blood_pool', 'Pap in Blood Pool'], ['mass', 'Pap in LV Mass']] as const).map(([mode, label]) => (
            <button
              key={mode}
              type="button"
              onClick={() => { setPapMode(mode); void updateConfig({ papillary_mode: mode }) }}
              className={cn(
                'rounded-full px-4 py-1.5 text-xs font-medium transition-all',
                papMode === mode
                  ? 'bg-[hsl(var(--tone-positive-500))] text-white shadow-sm'
                  : 'text-[hsl(var(--tone-positive-600))] hover:text-[hsl(var(--tone-positive-800))]',
              )}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* Separator */}
      <div className="border-b border-[hsl(var(--stroke-soft)/0.5)]" />

      {loading ? (
        <p className="py-8 text-center text-sm text-[hsl(var(--muted-foreground))]">Loading reference data...</p>
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
                {/* Section heading — left accent bar, flush with table */}
                <button
                  type="button"
                  onClick={() => toggleCollapse(major)}
                  className={cn(
                    'flex w-full items-stretch overflow-hidden border border-[hsl(var(--stroke-soft)/0.72)] bg-[hsl(var(--tone-neutral-50))] text-left transition-colors hover:bg-[hsl(var(--tone-neutral-100))]',
                    isCollapsed ? 'rounded-lg' : 'rounded-t-lg border-b border-b-[hsl(var(--stroke-soft))]',
                  )}
                >
                  <div className="w-1 shrink-0 bg-[hsl(var(--tone-positive-500))]" />
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
                        <col style={{ width: '33%' }} />
                        <col style={{ width: '11%' }} />
                        <col style={{ width: '10%' }} />
                        <col style={{ width: '10%' }} />
                        <col style={{ width: '10%' }} />
                        <col style={{ width: '9%' }} />
                        <col style={{ width: '9%' }} />
                        <col style={{ width: '8%' }} />
                      </colgroup>
                      <thead>
                        <tr className="border-b-2 border-[hsl(var(--tone-neutral-300))] bg-[hsl(var(--tone-neutral-50))]">
                          <th className="house-table-head-text px-3 py-2 text-left">Parameter</th>
                          <th className="house-table-head-text px-3 py-2 text-center">Unit</th>
                          <th className="house-table-head-text px-3 py-2 text-center">LL</th>
                          <th className="house-table-head-text px-3 py-2 text-center">Mean</th>
                          <th className="house-table-head-text px-3 py-2 text-center">UL</th>
                          <th className="house-table-head-text px-3 py-2 text-center">SD</th>
                          <th className="house-table-head-text px-1 py-2 text-center">Pap</th>
                          <th className="house-table-head-text px-1 py-2 text-center">Direction</th>
                        </tr>
                      </thead>
                      <tbody>
                        {subGroups.map((g, gi) => (
                          <Fragment key={`grp-${g.major}|${g.sub}`}>
                            {/* Sub-section divider — light green */}
                            {g.sub && (
                              <tr className="border-b border-[hsl(var(--stroke-soft)/0.5)]">
                                <td
                                  colSpan={8}
                                  className={cn(
                                    'bg-[hsl(var(--tone-positive-100))] px-3 py-1.5 text-[0.8rem] font-semibold tracking-wide text-[hsl(var(--tone-positive-900)/0.82)]',
                                    gi > 0 && 'border-t border-[hsl(var(--tone-positive-200))]',
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
                              return (
                                <tr
                                  key={p.parameter_key}
                                  onClick={() => setSelectedParam(p)}
                                  className={cn(
                                    'cursor-pointer border-b border-[hsl(var(--stroke-soft)/0.4)] transition-colors duration-100 hover:bg-[hsl(var(--tone-neutral-50)/0.65)]',
                                    selectedParam?.parameter_key === p.parameter_key && 'bg-[hsl(var(--tone-positive-50)/0.6)]',
                                  )}
                                >
                                  <td className="house-table-cell-text px-3 py-2 font-medium text-[hsl(var(--foreground))]">
                                    {displayName(p.parameter_key)}
                                    {isBsa && <BsaPill />}
                                  </td>
                                  <td className="house-table-cell-text whitespace-nowrap px-3 py-2 text-center text-[hsl(var(--tone-neutral-500))]">
                                    {p.unit}
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
                                    {p.pap_differs && <PapPill />}
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
          onClose={() => setSelectedParam(null)}
        />
      )}
    </Stack>
  )
}
