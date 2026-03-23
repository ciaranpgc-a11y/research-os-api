import { useCallback, useMemo, useState, useSyncExternalStore } from 'react'

import { PageHeader, Stack } from '@/components/primitives'
import { SectionMarker } from '@/components/patterns'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import { cn } from '@/lib/utils'
import { getExtractionResult, subscribeExtractionResult } from '@/lib/cmr-report-store'

// ---------------------------------------------------------------------------
// Valve metadata
// ---------------------------------------------------------------------------

type ValveId = 'mitral' | 'aortic' | 'tricuspid' | 'pulmonary'

type ValveInfo = {
  id: ValveId
  label: string
  leaflets: number
  abbr: string
  image: string
}

const VALVES: ValveInfo[] = [
  { id: 'mitral', label: 'Mitral Valve', leaflets: 2, abbr: 'MV', image: '/valves/mitral.png' },
  { id: 'aortic', label: 'Aortic Valve', leaflets: 3, abbr: 'AV', image: '/valves/aortic.png' },
  { id: 'tricuspid', label: 'Tricuspid Valve', leaflets: 3, abbr: 'TV', image: '/valves/tricuspid.png' },
  { id: 'pulmonary', label: 'Pulmonary Valve', leaflets: 3, abbr: 'PV', image: '/valves/pulmonary.png' },
]

// ---------------------------------------------------------------------------
// Mapping: flow field → canonical parameter key per valve
// These keys match the reference database (cmr_reference_data.json)
// ---------------------------------------------------------------------------

type FlowFieldDef = {
  key: string
  label: string
  unit: string
  paramKey: Record<ValveId, string | null>  // canonical parameter key per valve, null if N/A
}

const FLOW_FIELDS: FlowFieldDef[] = [
  {
    key: 'forwardFlow',
    label: 'Forward Flow',
    unit: 'mL/beat',
    paramKey: {
      aortic: 'AV forward flow (per heartbeat)',
      pulmonary: 'PV forward flow (per heartbeat)',
      mitral: null,
      tricuspid: null,
    },
  },
  {
    key: 'effectiveForwardFlow',
    label: 'Effective Forward Flow',
    unit: 'mL/beat',
    paramKey: {
      aortic: 'AV effective forward flow (per heartbeat)',
      pulmonary: 'PV effective forward flow (per heartbeat)',
      mitral: null,
      tricuspid: null,
    },
  },
  {
    key: 'backwardFlow',
    label: 'Backward Flow',
    unit: 'mL/beat',
    paramKey: {
      aortic: 'AV backward flow',
      pulmonary: 'PV backward flow',
      mitral: null,
      tricuspid: null,
    },
  },
  {
    key: 'regurgitantVolume',
    label: 'Regurgitant Volume',
    unit: 'mL',
    paramKey: {
      aortic: 'AV backward flow',         // AV backward flow = regurgitant volume
      pulmonary: 'PV backward flow',
      mitral: 'MR volume (per heartbeat)',
      tricuspid: 'TR volume (per heartbeat)',
    },
  },
  {
    key: 'regurgitantFraction',
    label: 'Regurgitant Fraction',
    unit: '%',
    paramKey: {
      aortic: 'AV regurgitant fraction',
      pulmonary: 'PV regurgitant fraction',
      mitral: 'MR regurgitant fraction',
      tricuspid: 'TR regurgitant fraction',
    },
  },
  {
    key: 'peakVelocity',
    label: 'Peak Velocity',
    unit: 'm/s',
    paramKey: {
      aortic: 'AV maximum velocity',
      pulmonary: 'PV maximum velocity',
      mitral: null,
      tricuspid: null,
    },
  },
  {
    key: 'maxPressureGradient',
    label: 'Max Pressure Gradient',
    unit: 'mmHg',
    paramKey: {
      aortic: 'AV maximum pressure gradient',
      pulmonary: 'PV maximum pressure gradient',
      mitral: null,
      tricuspid: null,
    },
  },
  {
    key: 'meanPressureGradient',
    label: 'Mean Pressure Gradient',
    unit: 'mmHg',
    paramKey: {
      aortic: 'AV mean pressure gradient',
      pulmonary: 'PV mean pressure gradient',
      mitral: null,
      tricuspid: null,
    },
  },
]

// ---------------------------------------------------------------------------
// Morphology findings — per-valve pathology checklist
// ---------------------------------------------------------------------------

// -- Finding-specific detail options --

type DetailOption = { value: string; label: string }

type FindingDetailDef = {
  type: 'select' | 'measurement'
  label: string
  options?: DetailOption[]   // for 'select'
  unit?: string              // for 'measurement'
}

type MorphologyFindingDef = {
  key: string
  label: string
  valves: ValveId[]
  niche?: boolean
  showLeaflets?: boolean     // whether leaflet involvement is relevant (default true)
  details?: FindingDetailDef[]  // finding-specific detail fields
}

const MORPHOLOGY_FINDINGS: MorphologyFindingDef[] = [
  // ---- Standard findings (shown by default) ----
  {
    key: 'thickened', label: 'Thickened',
    valves: ['mitral','aortic','tricuspid','pulmonary'],
    details: [{ type: 'select', label: 'Extent', options: [{ value: 'focal', label: 'Focal' }, { value: 'diffuse', label: 'Diffuse' }] }],
  },
  {
    key: 'calcified', label: 'Calcified',
    valves: ['mitral','aortic','tricuspid','pulmonary'],
    details: [
      { type: 'select', label: 'Extent', options: [{ value: 'focal', label: 'Focal' }, { value: 'diffuse', label: 'Diffuse' }] },
      { type: 'select', label: 'Severity', options: [{ value: 'mild', label: 'Mild' }, { value: 'moderate', label: 'Moderate' }, { value: 'severe', label: 'Severe' }] },
    ],
  },
  {
    key: 'restricted', label: 'Restricted',
    valves: ['mitral','aortic','tricuspid','pulmonary'],
    details: [{ type: 'select', label: 'Carpentier', options: [{ value: 'IIIa', label: 'IIIa' }, { value: 'IIIb', label: 'IIIb' }] }],
  },
  {
    key: 'prolapse', label: 'Prolapse / Flail',
    valves: ['mitral','aortic','tricuspid','pulmonary'],
    details: [
      { type: 'select', label: 'Type', options: [{ value: 'prolapse', label: 'Prolapse' }, { value: 'flail', label: 'Flail' }] },
      { type: 'select', label: 'Carpentier', options: [{ value: 'II', label: 'Type II' }] },
    ],
  },
  {
    key: 'tethering', label: 'Tethering',
    valves: ['mitral','tricuspid'],
    showLeaflets: false,
    details: [
      { type: 'measurement', label: 'Tenting height', unit: 'mm' },
      { type: 'measurement', label: 'Tenting area', unit: 'cm²' },
      { type: 'select', label: 'Carpentier', options: [{ value: 'IIIb', label: 'IIIb' }] },
    ],
  },
  {
    key: 'annularDilatation', label: 'Annular dilatation',
    valves: ['mitral','aortic','tricuspid','pulmonary'],
    showLeaflets: false,
    details: [{ type: 'measurement', label: 'Diameter', unit: 'mm' }],
  },
  {
    key: 'vegetation', label: 'Vegetation / Mass',
    valves: ['mitral','aortic','tricuspid','pulmonary'],
    details: [
      { type: 'measurement', label: 'Size', unit: 'mm' },
      { type: 'select', label: 'Mobility', options: [{ value: 'sessile', label: 'Sessile' }, { value: 'mobile', label: 'Mobile' }] },
    ],
  },
  {
    key: 'commissuralFusion', label: 'Commissural fusion',
    valves: ['mitral','aortic','tricuspid','pulmonary'],
    showLeaflets: false,
  },
  {
    key: 'perforation', label: 'Perforation',
    valves: ['mitral','aortic','tricuspid','pulmonary'],
    details: [{ type: 'measurement', label: 'Size', unit: 'mm' }],
  },
  {
    key: 'doming', label: 'Doming',
    valves: ['aortic','pulmonary'],
    showLeaflets: false,
  },
  {
    key: 'bicuspid', label: 'Bicuspid',
    valves: ['aortic','pulmonary'],
    showLeaflets: false,
    details: [
      { type: 'select', label: 'Fusion', options: [{ value: 'R-L', label: 'R–L' }, { value: 'R-N', label: 'R–N' }, { value: 'L-N', label: 'L–N' }] },
      { type: 'select', label: 'Raphe', options: [{ value: 'none', label: 'No raphe' }, { value: 'low', label: 'Low raphe' }, { value: 'high', label: 'High raphe' }] },
    ],
  },
  {
    key: 'chordalRupture', label: 'Chordal rupture',
    valves: ['mitral','tricuspid'],
  },
  {
    key: 'pacemakerLead', label: 'Pacemaker lead',
    valves: ['tricuspid'],
    details: [{ type: 'select', label: 'Mechanism', options: [{ value: 'impingement', label: 'Impingement' }, { value: 'adhesion', label: 'Adhesion' }, { value: 'perforation', label: 'Perforation' }] }],
  },

  // ---- Niche findings (behind "More ▸") ----
  {
    key: 'rheumatic', label: 'Rheumatic',
    valves: ['mitral','aortic','tricuspid'],
    niche: true,
    showLeaflets: false,
  },
  {
    key: 'cleft', label: 'Cleft',
    valves: ['mitral','tricuspid'],
    niche: true,
  },
  {
    key: 'annularDisjunction', label: 'Annular disjunction',
    valves: ['mitral'],
    niche: true,
    showLeaflets: false,
    details: [{ type: 'measurement', label: 'Distance', unit: 'mm' }],
  },
  {
    key: 'myxomatous', label: 'Myxomatous',
    valves: ['mitral','tricuspid'],
    niche: true,
    details: [{ type: 'select', label: 'Type', options: [{ value: 'barlow', label: 'Barlow' }, { value: 'fed', label: 'FED' }] }],
  },
  {
    key: 'sam', label: 'SAM',
    valves: ['mitral'],
    niche: true,
    showLeaflets: false,
  },
  {
    key: 'ebstein', label: 'Ebstein anomaly',
    valves: ['tricuspid'],
    niche: true,
    showLeaflets: false,
    details: [{ type: 'measurement', label: 'Displacement', unit: 'mm' }],
  },
  {
    key: 'carcinoid', label: 'Carcinoid',
    valves: ['tricuspid','pulmonary'],
    niche: true,
    showLeaflets: false,
  },
  {
    key: 'dysplastic', label: 'Dysplastic',
    valves: ['pulmonary'],
    niche: true,
    showLeaflets: false,
  },
  {
    key: 'absentValve', label: 'Absent valve',
    valves: ['pulmonary'],
    niche: true,
    showLeaflets: false,
    details: [{ type: 'select', label: 'Type', options: [{ value: 'rudimentary', label: 'Rudimentary' }, { value: 'complete', label: 'Complete absence' }] }],
  },
  {
    key: 'annularHypoplasia', label: 'Annular hypoplasia',
    valves: ['pulmonary'],
    niche: true,
    showLeaflets: false,
    details: [{ type: 'measurement', label: 'Diameter', unit: 'mm' }],
  },
  {
    key: 'quadricuspid', label: 'Quadricuspid',
    valves: ['pulmonary','aortic'],
    niche: true,
    showLeaflets: false,
  },
]

const LEAFLET_NAMES: Record<ValveId, string[]> = {
  mitral:    ['Anterior', 'Posterior'],
  aortic:    ['Right coronary cusp', 'Left coronary cusp', 'Non-coronary cusp'],
  tricuspid: ['Anterior', 'Septal', 'Inferior'],
  pulmonary: ['Anterior', 'Left', 'Right'],
}


// -- Per-finding detail state --

type FindingDetail = {
  leaflets: Set<string>
  detailValues: Record<string, string>  // keyed by detail label
  notes: string
}

function emptyFindingDetail(): FindingDetail {
  return { leaflets: new Set(), detailValues: {}, notes: '' }
}

type ValveMorphology = {
  findings: Record<string, FindingDetail>  // keyed by finding key
}

function emptyMorphology(): ValveMorphology {
  return { findings: {} }
}

// ---------------------------------------------------------------------------
// Severity grading (ASE 2017 / ACC 2020)
// ---------------------------------------------------------------------------

type Severity = 'none' | 'trivial' | 'mild' | 'moderate' | 'severe'

const SEVERITY_LABELS: Record<Severity, string> = {
  none: 'None',
  trivial: 'Trivial',
  mild: 'Mild',
  moderate: 'Moderate',
  severe: 'Severe',
}

const SEVERITY_COLORS: Record<Severity, string> = {
  none: 'hsl(164 40% 45%)',
  trivial: 'hsl(164 35% 50%)',
  mild: 'hsl(45 85% 58%)',
  moderate: 'hsl(30 75% 50%)',
  severe: 'hsl(3 55% 48%)',
}

function autoGradeSeverity(values: Record<string, string>): Severity | null {
  const rv = parseFloat(values.regurgitantVolume ?? '')
  const rf = parseFloat(values.regurgitantFraction ?? '')

  if (isNaN(rv) && isNaN(rf)) return null

  // Regurgitant volume thresholds (ASE 2017 — same for MR and AR)
  if (!isNaN(rv)) {
    if (rv >= 60) return 'severe'
    if (rv >= 30) return 'moderate'
    if (rv > 0) return 'mild'
  }

  // Regurgitant fraction thresholds
  if (!isNaN(rf)) {
    if (rf >= 50) return 'severe'
    if (rf >= 30) return 'moderate'
    if (rf > 0) return 'mild'
  }

  return null
}

// ---------------------------------------------------------------------------
// Valve tile component
// ---------------------------------------------------------------------------

function ValveTile({ valve, selected, severity, onClick }: {
  valve: ValveInfo
  selected: boolean
  severity: Severity
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'group relative flex flex-col items-center gap-3 rounded-xl border p-5 transition-all',
        'hover:shadow-md hover:border-foreground/20',
        selected
          ? 'border-foreground/30 bg-muted/60 shadow-sm'
          : 'border-border/50 bg-card',
      )}
    >
      {severity !== 'none' && (
        <span
          className="absolute top-3 right-3 h-3 w-3 rounded-full ring-2 ring-white"
          style={{ backgroundColor: SEVERITY_COLORS[severity] }}
          title={SEVERITY_LABELS[severity]}
        />
      )}
      <img src={valve.image} alt={valve.label} className="h-36 w-36 object-contain" />
      <div className="flex flex-col items-center gap-0.5">
        <span className="text-sm font-semibold text-foreground">{valve.label}</span>
        <span className="text-xs text-muted-foreground">
          {valve.leaflets === 2 ? 'Bileaflet' : 'Trileaflet'} • {valve.abbr}
        </span>
      </div>
    </button>
  )
}

// ---------------------------------------------------------------------------
// Flow detail panel
// ---------------------------------------------------------------------------

function CalculatorIcon() {
  return (
    <span className="ml-1 inline-flex items-center text-muted-foreground/60" title="Calculated from LV/RV stroke volume and forward flow">
      <svg className="h-3.5 w-3.5" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <rect x="2" y="1" width="12" height="14" rx="1.5" />
        <line x1="2" y1="5" x2="14" y2="5" />
        <line x1="5" y1="8" x2="11" y2="8" />
        <line x1="8" y1="5" x2="8" y2="11" />
        <line x1="5" y1="13" x2="11" y2="13" />
      </svg>
    </span>
  )
}

// ---------------------------------------------------------------------------
// Morphology panel component
// ---------------------------------------------------------------------------

function MorphologyPanel({ valveId, morphology, onChange }: {
  valveId: ValveId
  morphology: ValveMorphology
  onChange: (m: ValveMorphology) => void
}) {
  const [showNiche, setShowNiche] = useState(false)

  const relevantFindings = MORPHOLOGY_FINDINGS.filter((f) => f.valves.includes(valveId))
  const standardFindings = relevantFindings.filter((f) => !f.niche)
  const nicheFindings = relevantFindings.filter((f) => f.niche)
  const activeFindings = relevantFindings.filter((f) => f.key in morphology.findings)
  const hasAnyFinding = activeFindings.length > 0
  const leafletNames = LEAFLET_NAMES[valveId]

  const toggleFinding = (key: string) => {
    const next = { ...morphology.findings }
    if (key in next) {
      delete next[key]
    } else {
      next[key] = emptyFindingDetail()
    }
    onChange({ ...morphology, findings: next })
  }

  const updateFindingDetail = (findingKey: string, updater: (d: FindingDetail) => FindingDetail) => {
    const current = morphology.findings[findingKey]
    if (!current) return
    onChange({
      ...morphology,
      findings: { ...morphology.findings, [findingKey]: updater(current) },
    })
  }

  const toggleLeafletForFinding = (findingKey: string, leaflet: string) => {
    updateFindingDetail(findingKey, (d) => {
      const next = new Set(d.leaflets)
      if (next.has(leaflet)) next.delete(leaflet); else next.add(leaflet)
      return { ...d, leaflets: next }
    })
  }

  const setDetailValue = (findingKey: string, detailLabel: string, value: string) => {
    updateFindingDetail(findingKey, (d) => ({
      ...d,
      detailValues: { ...d.detailValues, [detailLabel]: value },
    }))
  }

  const setFindingNotes = (findingKey: string, notes: string) => {
    updateFindingDetail(findingKey, (d) => ({ ...d, notes }))
  }

  return (
    <div className="space-y-4">
      {/* Finding chips */}
      <div className="flex flex-wrap gap-1.5">
        {standardFindings.map((f) => {
          const active = f.key in morphology.findings
          return (
            <button
              key={f.key}
              type="button"
              onClick={() => toggleFinding(f.key)}
              className={cn(
                'rounded-full px-3 py-1 text-xs font-medium transition-all',
                active
                  ? 'bg-foreground text-background'
                  : 'ring-1 ring-border/50 text-muted-foreground hover:text-foreground hover:ring-foreground/20',
              )}
            >
              {f.label}
            </button>
          )
        })}
        {nicheFindings.length > 0 && !showNiche && (
          <button
            type="button"
            onClick={() => setShowNiche(true)}
            className="rounded-full px-3 py-1 text-xs font-medium text-muted-foreground/60 hover:text-muted-foreground ring-1 ring-border/30 hover:ring-border/50 transition-all"
          >
            More ▸
          </button>
        )}
        {showNiche && nicheFindings.map((f) => {
          const active = f.key in morphology.findings
          return (
            <button
              key={f.key}
              type="button"
              onClick={() => toggleFinding(f.key)}
              className={cn(
                'rounded-full px-3 py-1 text-xs font-medium transition-all',
                active
                  ? 'bg-foreground text-background'
                  : 'ring-1 ring-border/30 text-muted-foreground/70 hover:text-foreground hover:ring-foreground/20',
              )}
            >
              {f.label}
            </button>
          )
        })}
        {hasAnyFinding && (
          <button
            type="button"
            onClick={() => onChange({ ...morphology, findings: {} })}
            className="rounded-full px-3 py-1 text-xs font-medium text-red-600 ring-1 ring-red-300 hover:bg-red-50 hover:text-red-700 transition-all"
          >
            Reset All
          </button>
        )}
      </div>

      {/* Detail table — rows appear for each active finding */}
      {hasAnyFinding && (
        <div className="rounded-lg border border-border/40 overflow-hidden">
          <table className="w-full table-fixed text-xs">
            <thead>
              <tr className="border-b border-border/30 bg-muted/30">
                <th style={{ width: '19%' }} className="px-3 py-2 text-left text-xs font-semibold text-muted-foreground">Finding</th>
                <th style={{ width: '20%' }} className="px-3 py-2 text-left text-xs font-semibold text-muted-foreground">Leaflet(s)</th>
                <th style={{ width: '30%' }} className="px-3 py-2 text-left text-xs font-semibold text-muted-foreground">Detail</th>
                <th style={{ width: '31%' }} className="px-3 py-2 text-left text-xs font-semibold text-muted-foreground">Notes</th>
              </tr>
            </thead>
            <tbody>
              {activeFindings.map((f) => {
                const detail = morphology.findings[f.key]
                const showLeaflets = f.showLeaflets !== false
                return (
                  <tr key={f.key} className="border-b border-border/20 last:border-b-0">
                    {/* Finding name */}
                    <td className="px-3 py-2.5 text-xs font-medium text-foreground align-top">
                      {f.label}
                    </td>

                    {/* Leaflet involvement */}
                    <td className="px-3 py-2 align-top">
                      {showLeaflets ? (
                        <div className="flex gap-1">
                          {leafletNames.map((name) => {
                            const active = detail.leaflets.has(name)
                            return (
                              <button
                                key={name}
                                type="button"
                                onClick={() => toggleLeafletForFinding(f.key, name)}
                                className={cn(
                                  'rounded-full px-2.5 py-1 text-xs font-medium transition-all',
                                  active
                                    ? 'bg-foreground/80 text-background'
                                    : 'ring-1 ring-border/40 text-muted-foreground/70 hover:text-foreground hover:ring-foreground/20',
                                )}
                              >
                                {name}
                              </button>
                            )
                          })}
                        </div>
                      ) : (
                        <span className="text-muted-foreground/40">—</span>
                      )}
                    </td>

                    {/* Finding-specific detail fields */}
                    <td className="px-3 py-2 align-top">
                      {f.details && f.details.length > 0 ? (
                        <div className="flex items-center gap-2">
                          {f.details.map((d) => {
                            if (d.type === 'select') {
                              return (
                                <div key={d.label} className="flex items-center gap-1.5">
                                  {d.options!.map((opt) => {
                                    const isActive = detail.detailValues[d.label] === opt.value
                                    return (
                                      <button
                                        key={opt.value}
                                        type="button"
                                        onClick={() => setDetailValue(f.key, d.label, isActive ? '' : opt.value)}
                                        className={cn(
                                          'rounded-full px-2.5 py-1 text-xs font-medium transition-all',
                                          isActive
                                            ? 'bg-foreground/80 text-background'
                                            : 'ring-1 ring-border/40 text-muted-foreground/70 hover:text-foreground hover:ring-foreground/20',
                                        )}
                                      >
                                        {opt.label}
                                      </button>
                                    )
                                  })}
                                </div>
                              )
                            }
                            // measurement
                            return (
                              <div key={d.label} className="flex items-center gap-1.5">
                                <input
                                  type="number"
                                  step="any"
                                  value={detail.detailValues[d.label] ?? ''}
                                  onChange={(e) => setDetailValue(f.key, d.label, e.target.value)}
                                  placeholder={d.label}
                                  className="h-7 w-20 rounded-md border border-border/40 bg-background px-2 text-xs text-foreground placeholder:text-muted-foreground/40 focus:outline-none focus:ring-1 focus:ring-foreground/20"
                                />
                                <span className="text-xs text-muted-foreground/60">{d.unit}</span>
                              </div>
                            )
                          })}
                        </div>
                      ) : (
                        <span className="text-muted-foreground/40">—</span>
                      )}
                    </td>

                    {/* Notes */}
                    <td className="px-3 py-2 align-top">
                      <input
                        type="text"
                        value={detail.notes}
                        onChange={(e) => setFindingNotes(f.key, e.target.value)}
                        placeholder="—"
                        className="h-7 w-full rounded-md border border-border/40 bg-background px-2 text-xs text-foreground placeholder:text-muted-foreground/40 focus:outline-none focus:ring-1 focus:ring-foreground/20"
                      />
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

    </div>
  )
}

// ---------------------------------------------------------------------------
// Morphology section with collapsible header
// ---------------------------------------------------------------------------

function MorphologySection({ valve, morphology, onMorphologyChange }: {
  valve: ValveInfo
  morphology: ValveMorphology
  onMorphologyChange: (m: ValveMorphology) => void
}) {
  const [expanded, setExpanded] = useState(true)

  return (
    <>
      <button
        type="button"
        onClick={() => setExpanded(!expanded)}
        className="flex items-center gap-3 border-t-[3px] border-border/60 px-5 py-3 w-full text-left hover:bg-muted/20 transition-colors"
      >
        <SectionMarker tone="report" size="title" className="self-stretch h-auto" />
        <h3 className="text-sm font-semibold text-foreground flex-1">Morphology</h3>
        <svg
          className={cn('h-4 w-4 text-muted-foreground transition-transform', expanded && 'rotate-180')}
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={2}
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {expanded && (
        <div className="px-5 pb-5 pt-3">
          <MorphologyPanel
            valveId={valve.id}
            morphology={morphology}
            onChange={onMorphologyChange}
          />
        </div>
      )}
    </>
  )
}

// ---------------------------------------------------------------------------
// Flow detail panel
// ---------------------------------------------------------------------------

function FlowViz({ values, severity }: { values: Record<string, string>; severity: Severity }) {
  const forward = parseFloat(values.forwardFlow || '')
  const backward = Math.abs(parseFloat(values.backwardFlow || ''))
  const effective = parseFloat(values.effectiveForwardFlow || '')
  const rf = parseFloat(values.regurgitantFraction || '')

  // Need at least forward and backward to show anything
  const hasFlow = !isNaN(forward) && forward > 0 && !isNaN(backward)
  const hasRF = !isNaN(rf)

  if (!hasFlow && !hasRF) return null

  const effectiveVal = !isNaN(effective) ? effective : (hasFlow ? forward - backward : NaN)
  const rfVal = hasRF ? rf : (hasFlow ? (backward / forward) * 100 : NaN)
  const effectivePct = hasFlow ? ((effectiveVal / forward) * 100) : (hasRF ? 100 - rfVal : NaN)
  const regurgPct = hasFlow ? ((backward / forward) * 100) : rfVal

  // Severity band definitions with RF% breakpoints for marker positioning
  // None: 0–5%, Trivial: 5–10%, Mild: 10–20%, Moderate: 20–40%, Severe: 40%+
  const bandBreakpoints = [0, 5, 10, 20, 40, 100] // RF% thresholds
  const bandWidths = [10, 10, 15, 15, 50] // % of bar width per band
  const bandLabels = ['None', 'Trivial', 'Mild', 'Moderate', 'Severe']
  const bandSeverities: Severity[] = ['none', 'trivial', 'mild', 'moderate', 'severe']

  // Map RF% to position on the bar
  function rfToPosition(rfPct: number): number {
    const clamped = Math.max(0, Math.min(rfPct, 100))
    let cumWidth = 0
    for (let i = 0; i < bandBreakpoints.length - 1; i++) {
      const lo = bandBreakpoints[i]
      const hi = bandBreakpoints[i + 1]
      if (clamped <= hi) {
        const frac = (clamped - lo) / (hi - lo)
        return cumWidth + frac * bandWidths[i]
      }
      cumWidth += bandWidths[i]
    }
    return 100
  }

  const markerPos = !isNaN(rfVal) ? rfToPosition(rfVal) : 0

  // Gradient with smooth transitions between severity colors
  const gradientStops = (() => {
    const colors = bandSeverities.map((s) => SEVERITY_COLORS[s])
    let cum = 0
    const stops: string[] = []
    for (let i = 0; i < bandWidths.length; i++) {
      if (i === 0) {
        stops.push(`${colors[i]} 0%`)
      }
      const midPt = cum + bandWidths[i] * 0.5
      stops.push(`${colors[i]} ${midPt}%`)
      cum += bandWidths[i]
    }
    stops.push(`${colors[colors.length - 1]} 100%`)
    return stops.join(', ')
  })()

  return (
    <TooltipProvider delayDuration={0}>
      <div className="space-y-3">
        {/* Severity scale */}
        <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">Regurgitant Fraction — Severity Scale</p>
        <div className="relative">
          {/* Gradient bar with labels */}
          <div
            className="h-7 rounded-lg overflow-hidden"
            style={{ background: `linear-gradient(90deg, ${gradientStops})` }}
          >
            <div className="flex h-full">
              {bandWidths.map((w, i) => {
                const isActive = severity === bandSeverities[i]
                return (
                  <div
                    key={bandSeverities[i]}
                    className={cn(
                      'flex items-center justify-center text-[9px] font-semibold transition-opacity duration-300',
                      isActive ? 'text-white' : 'text-white/50',
                    )}
                    style={{ width: `${w}%` }}
                  >
                    {bandLabels[i]}
                  </div>
                )
              })}
            </div>
          </div>

          {/* RF marker — circular dot with hover tooltip */}
          {!isNaN(rfVal) && (
            <div
              className="absolute top-0 h-full flex items-center pointer-events-none"
              style={{ left: `${markerPos}%`, transform: 'translateX(-50%)' }}
            >
              <Tooltip>
                <TooltipTrigger asChild>
                  <div className="pointer-events-auto cursor-default group relative">
                    {/* Outer pulse ring */}
                    <div className="absolute inset-0 rounded-full bg-white/40 animate-ping" style={{ animationDuration: '2s' }} />
                    {/* Marker dot */}
                    <div className="relative w-4 h-4 rounded-full bg-white border-2 border-foreground/80 shadow-md transition-transform duration-200 group-hover:scale-150" />
                  </div>
                </TooltipTrigger>
                <TooltipContent side="top" className="px-3 py-2">
                  <div className="text-center">
                    <div className="text-sm font-bold">{rfVal.toFixed(1)}%</div>
                    <div className="text-[10px] text-muted-foreground">Regurgitant Fraction</div>
                  </div>
                </TooltipContent>
              </Tooltip>
            </div>
          )}
        </div>

        {/* Flow composition bar */}
        {hasFlow && !isNaN(effectivePct) && (
          <>
            <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide mt-1">Flow Composition</p>
            <div className="flex h-6 rounded-lg overflow-hidden border border-border/40">
              <Tooltip>
                <TooltipTrigger asChild>
                  <div
                    className="flex items-center justify-center text-[10px] font-bold text-white cursor-default transition-opacity hover:opacity-90"
                    style={{ width: `${effectivePct}%`, background: 'linear-gradient(90deg, hsl(217 70% 58%), hsl(217 70% 44%))' }}
                  >
                    {!isNaN(effectiveVal) && `${effectiveVal.toFixed(0)} mL`}
                  </div>
                </TooltipTrigger>
                <TooltipContent side="top" className="px-3 py-2">
                  <div className="text-center">
                    <div className="text-sm font-bold">{effectiveVal.toFixed(1)} mL</div>
                    <div className="text-[10px] text-muted-foreground">Effective Forward ({effectivePct.toFixed(0)}%)</div>
                  </div>
                </TooltipContent>
              </Tooltip>
              <Tooltip>
                <TooltipTrigger asChild>
                  <div
                    className="flex items-center justify-center text-[10px] font-bold text-white cursor-default transition-opacity hover:opacity-90"
                    style={{ width: `${regurgPct}%`, background: 'linear-gradient(90deg, hsl(3 55% 55%), hsl(3 55% 42%))' }}
                  >
                    {backward > 0 && `${backward.toFixed(0)} mL`}
                  </div>
                </TooltipTrigger>
                <TooltipContent side="top" className="px-3 py-2">
                  <div className="text-center">
                    <div className="text-sm font-bold">{backward.toFixed(1)} mL</div>
                    <div className="text-[10px] text-muted-foreground">Regurgitant ({regurgPct.toFixed(0)}%)</div>
                  </div>
                </TooltipContent>
              </Tooltip>
            </div>

            {/* Legend */}
            <div className="flex gap-5 mt-1">
              <div className="flex items-center gap-1.5">
                <div className="w-2.5 h-2.5 rounded-sm" style={{ background: 'hsl(217 70% 54%)' }} />
                <span className="text-[10px] text-muted-foreground">Effective Forward ({effectivePct.toFixed(0)}%)</span>
              </div>
              <div className="flex items-center gap-1.5">
                <div className="w-2.5 h-2.5 rounded-sm" style={{ background: 'hsl(3 55% 52%)' }} />
                <span className="text-[10px] text-muted-foreground">Regurgitant ({regurgPct.toFixed(0)}%)</span>
              </div>
            </div>
          </>
        )}
      </div>
    </TooltipProvider>
  )
}

// ---------------------------------------------------------------------------
// Flow detail panel
// ---------------------------------------------------------------------------

function FlowPanel({ valve, values, derivedKeys, onValueChange, autoSeverity, manualSeverity, onManualSeverityChange, morphology, onMorphologyChange }: {
  valve: ValveInfo
  values: Record<string, string>
  derivedKeys: Set<string>
  onValueChange: (fieldKey: string, value: string) => void
  autoSeverity: Severity | null
  manualSeverity: Severity | null
  onManualSeverityChange: (s: Severity | null) => void
  morphology: ValveMorphology
  onMorphologyChange: (m: ValveMorphology) => void
}) {
  const effectiveSeverity = manualSeverity ?? autoSeverity ?? 'none'
  const isOverridden = manualSeverity !== null && autoSeverity !== null && manualSeverity !== autoSeverity

  // Only show fields relevant to this valve (where paramKey is not null)
  const relevantFields = FLOW_FIELDS.filter((f) => f.paramKey[valve.id] !== null)

  return (
    <div className="rounded-xl border border-border/50 bg-card">
      {/* Header */}
      <div className="flex items-center gap-3 border-b border-border/30 px-5 py-3">
        <SectionMarker tone="report" size="title" className="self-stretch h-auto" />
        <h3 className="text-sm font-semibold text-foreground flex-1">Flow Assessment</h3>
        <div className="flex items-center gap-2">
          <span
            className={cn(
              'rounded-full px-3 py-1 text-xs font-semibold',
              effectiveSeverity === 'mild' ? 'text-black' : 'text-white',
            )}
            style={{ backgroundColor: SEVERITY_COLORS[effectiveSeverity] }}
          >
            {SEVERITY_LABELS[effectiveSeverity]}
            {isOverridden && ' ✎'}
          </span>
        </div>
      </div>

      <div className="p-5">
        <div className="flex gap-4">
          {/* Flow fields — 2-column grid */}
          <div className="flex-1 min-w-0 grid grid-cols-2 gap-x-6 gap-y-4">
            {relevantFields.map((field) => {
              const paramKey = field.paramKey[valve.id]!
              return (
                <div key={field.key} className="flex items-center gap-2">
                  <label className="text-xs font-medium text-muted-foreground w-36 shrink-0 flex items-center" title={paramKey}>
                    {field.label}
                    {derivedKeys.has(field.key) && <CalculatorIcon />}
                  </label>
                  <div className="flex items-center gap-1.5 flex-1">
                    <input
                      type="number"
                      step="any"
                      value={values[field.key] ?? ''}
                      onChange={(e) => onValueChange(field.key, e.target.value)}
                      placeholder="—"
                      className="h-8 w-20 rounded-md border border-border/50 bg-background px-2.5 text-xs text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:ring-1 focus:ring-foreground/20"
                    />
                    <span className="text-xs text-muted-foreground">{field.unit}</span>
                  </div>
                </div>
              )
            })}
          </div>

          {/* Flow visualisation — right column */}
          <div className="w-[440px] shrink-0 flex flex-col justify-center">
            <FlowViz values={values} severity={effectiveSeverity} />
          </div>
        </div>

        {/* Severity grading */}
        <div className="mt-5 pt-4 border-t border-border/30">
          <div className="flex items-center gap-4">
            <span className="text-xs font-medium text-muted-foreground w-44 shrink-0">Severity</span>
            <div className="flex gap-1.5">
              {(Object.keys(SEVERITY_LABELS) as Severity[]).map((s) => {
                const isActive = effectiveSeverity === s
                const isAuto = autoSeverity === s && manualSeverity === null
                return (
                  <button
                    key={s}
                    type="button"
                    onClick={() => {
                      if (manualSeverity === s) {
                        onManualSeverityChange(null)
                      } else {
                        onManualSeverityChange(s)
                      }
                    }}
                    className={cn(
                      'rounded-full px-3 py-1 text-xs font-medium transition-all',
                      isActive
                        ? s === 'mild' ? 'text-black' : 'text-white'
                        : 'text-muted-foreground hover:text-foreground',
                      !isActive && 'ring-1 ring-border/50 hover:ring-foreground/20',
                    )}
                    style={isActive ? { backgroundColor: SEVERITY_COLORS[s] } : undefined}
                  >
                    {SEVERITY_LABELS[s]}
                    {isAuto && ' •'}
                  </button>
                )
              })}
            </div>
            {autoSeverity && manualSeverity !== null && (
              <button
                type="button"
                onClick={() => onManualSeverityChange(null)}
                className="text-xs text-muted-foreground hover:text-foreground underline"
              >
                Reset to auto
              </button>
            )}
          </div>
        </div>

      </div>

      {/* Morphology section with its own header */}
      <MorphologySection
        valve={valve}
        morphology={morphology}
        onMorphologyChange={onMorphologyChange}
      />
    </div>
  )
}

// ---------------------------------------------------------------------------
// Main page
// ---------------------------------------------------------------------------

export function CmrValvesPage() {
  const [selectedValve, setSelectedValve] = useState<ValveId | null>(null)

  // Read extracted values from shared report store
  const extraction = useSyncExternalStore(subscribeExtractionResult, getExtractionResult)
  const extractedValues = useMemo(() => {
    const map = new Map<string, number>()
    if (extraction?.measurements) {
      for (const m of extraction.measurements) map.set(m.parameter, m.value)
    }
    return map
  }, [extraction])

  // Derived (calculated) values — indirect volumetric method
  const derivedValues = useMemo(() => {
    const derived = new Map<string, number>()
    const lvsv = extractedValues.get('LV SV')
    const rvsv = extractedValues.get('RV SV')
    const avEff = extractedValues.get('AV effective forward flow (per heartbeat)')
    const pvEff = extractedValues.get('PV effective forward flow (per heartbeat)')

    if (lvsv !== undefined && avEff !== undefined && !extractedValues.has('MR volume (per heartbeat)')) {
      const mrVol = lvsv - avEff
      if (mrVol >= 0) {
        derived.set('MR volume (per heartbeat)', Math.round(mrVol * 10) / 10)
        if (lvsv > 0) derived.set('MR regurgitant fraction', Math.round((mrVol / lvsv) * 1000) / 10)
      }
    }

    if (rvsv !== undefined && pvEff !== undefined && !extractedValues.has('TR volume (per heartbeat)')) {
      const trVol = rvsv - pvEff
      if (trVol >= 0) {
        derived.set('TR volume (per heartbeat)', Math.round(trVol * 10) / 10)
        if (rvsv > 0) derived.set('TR regurgitant fraction', Math.round((trVol / rvsv) * 1000) / 10)
      }
    }

    return derived
  }, [extractedValues])

  // Local overrides per valve (user-edited values take precedence over extracted)
  const [overrides, setOverrides] = useState<Record<ValveId, Record<string, string>>>({
    mitral: {},
    aortic: {},
    tricuspid: {},
    pulmonary: {},
  })

  // Manual severity overrides per valve (null = use auto)
  const [manualSeverity, setManualSeverity] = useState<Record<ValveId, Severity | null>>({
    mitral: null,
    aortic: null,
    tricuspid: null,
    pulmonary: null,
  })

  // Morphology findings per valve
  const [morphologies, setMorphologies] = useState<Record<ValveId, ValveMorphology>>({
    mitral: emptyMorphology(),
    aortic: emptyMorphology(),
    tricuspid: emptyMorphology(),
    pulmonary: emptyMorphology(),
  })

  const handleMorphologyChange = useCallback((valveId: ValveId, m: ValveMorphology) => {
    setMorphologies((prev) => ({ ...prev, [valveId]: m }))
  }, [])

  // Resolve values for a valve: override → extracted → derived → empty
  // Returns { values, derivedKeys } so UI can show calculator icon
  const resolveValues = useCallback((valveId: ValveId): { values: Record<string, string>, derivedKeys: Set<string> } => {
    const values: Record<string, string> = {}
    const derivedKeys = new Set<string>()
    for (const field of FLOW_FIELDS) {
      const paramKey = field.paramKey[valveId]
      // Check override first
      if (overrides[valveId][field.key] !== undefined && overrides[valveId][field.key] !== '') {
        values[field.key] = overrides[valveId][field.key]
      } else if (paramKey && extractedValues.has(paramKey)) {
        let val = extractedValues.get(paramKey)!
        // Backward flow & regurgitant volume: strip sign — the label already implies direction
        if (field.key === 'backwardFlow' || field.key === 'regurgitantVolume') val = Math.abs(val)
        values[field.key] = String(val)
      } else if (paramKey && derivedValues.has(paramKey)) {
        values[field.key] = String(derivedValues.get(paramKey)!)
        derivedKeys.add(field.key)
      } else {
        values[field.key] = ''
      }
    }
    return { values, derivedKeys }
  }, [overrides, extractedValues, derivedValues])

  const handleValueChange = useCallback((valveId: ValveId, fieldKey: string, value: string) => {
    setOverrides((prev) => ({
      ...prev,
      [valveId]: { ...prev[valveId], [fieldKey]: value },
    }))
  }, [])

  const handleManualSeverity = useCallback((valveId: ValveId, s: Severity | null) => {
    setManualSeverity((prev) => ({ ...prev, [valveId]: s }))
  }, [])

  // Compute auto severity for each valve
  const autoSeverities = useMemo(() => {
    const result: Record<ValveId, Severity | null> = { mitral: null, aortic: null, tricuspid: null, pulmonary: null }
    for (const v of VALVES) {
      result[v.id] = autoGradeSeverity(resolveValues(v.id).values)
    }
    return result
  }, [resolveValues])

  const effectiveSeverity = useCallback((id: ValveId): Severity => {
    return manualSeverity[id] ?? autoSeverities[id] ?? 'none'
  }, [manualSeverity, autoSeverities])

  const selectedInfo = VALVES.find((v) => v.id === selectedValve)

  return (
    <Stack className="gap-6">
      <PageHeader heading="Valve assessment" />

      {/* Valve tiles */}
      <div className="grid grid-cols-4 gap-4">
        {VALVES.map((v) => (
          <ValveTile
            key={v.id}
            valve={v}
            selected={selectedValve === v.id}
            severity={effectiveSeverity(v.id)}
            onClick={() => setSelectedValve(selectedValve === v.id ? null : v.id)}
          />
        ))}
      </div>

      {/* Flow panel for selected valve */}
      {selectedValve && selectedInfo && (() => {
        const { values, derivedKeys } = resolveValues(selectedValve)
        return (
          <FlowPanel
            valve={selectedInfo}
            values={values}
            derivedKeys={derivedKeys}
            onValueChange={(fieldKey, value) => handleValueChange(selectedValve, fieldKey, value)}
            autoSeverity={autoSeverities[selectedValve]}
            manualSeverity={manualSeverity[selectedValve]}
            onManualSeverityChange={(s) => handleManualSeverity(selectedValve, s)}
            morphology={morphologies[selectedValve]}
            onMorphologyChange={(m) => handleMorphologyChange(selectedValve, m)}
          />
        )
      })()}
    </Stack>
  )
}
