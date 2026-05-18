import { useCallback, useEffect, useMemo, useState, useSyncExternalStore } from 'react'

import { PageHeader, Stack } from '@/components/primitives'
import { SectionMarker } from '@/components/patterns'
import {
  buildAorticValveSummaryData,
  buildAorticValveSummarySignature,
} from '@/lib/cmr-aortic-valve-summary'
import {
  buildMitralValveSummaryData,
  buildMitralValveSummarySignature,
} from '@/lib/cmr-mitral-valve-summary'
import {
  buildTricuspidValveSummaryData,
  buildTricuspidValveSummarySignature,
} from '@/lib/cmr-tricuspid-valve-summary'
import {
  getEffectiveForwardFlow,
  normalizeValveMeasurementMap,
} from '@/lib/cmr-flow-measurements'
import { cn } from '@/lib/utils'
import { getExtractionResult, subscribeExtractionResult } from '@/lib/cmr-report-store'
import {
  generateCmrAorticValveProse,
  generateCmrMitralValveProse,
  generateCmrTricuspidValveProse,
} from '@/lib/cmr-summary-api'
import {
  type RegurgitationSeverity as Severity,
  REGURGITATION_SEVERITY_COLORS as SEVERITY_COLORS,
  REGURGITATION_SEVERITY_LABELS as SEVERITY_LABELS,
  RF_REGURGITATION_SEVERITY_THRESHOLDS as RF_SEVERITY_THRESHOLDS,
  rfToRegurgitationSeverity as rfToSeverity,
} from '@/lib/cmr-valve-severity'
import { useCmrCaseStore } from '@/store/use-cmr-case-store'

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
  labelOverride?: Partial<Record<ValveId, string>>  // contextual label per valve (if different from default)
  unit: string
  column: 1 | 2  // 1 = left (flow volumes), 2 = right (gradients/velocity)
  paramKey: Record<ValveId, string | null>  // canonical parameter key per valve, null if N/A
  dp: number  // decimal places for display (matches cmr_reference_data.json)
}

const FLOW_FIELDS: FlowFieldDef[] = [
  // Left column — flow volumes
  {
    key: 'forwardFlow',
    label: 'Forward flow',
    unit: 'mL/beat',
    column: 1,
    dp: 0,
    paramKey: {
      aortic: 'AV forward flow (per heartbeat)',
      pulmonary: 'PV forward flow (per heartbeat)',
      mitral: null,
      tricuspid: null,
    },
  },
  {
    key: 'backwardFlow',
    label: 'Backward flow',
    unit: 'mL/beat',
    column: 1,
    dp: 0,
    paramKey: {
      aortic: 'AV backward flow (per heartbeat)',
      pulmonary: 'PV backward flow (per heartbeat)',
      mitral: null,
      tricuspid: null,
    },
  },
  {
    key: 'effectiveForwardFlow',
    label: 'Effective forward flow',
    unit: 'mL/beat',
    column: 1,
    dp: 0,
    paramKey: {
      aortic: 'AV effective forward flow (per heartbeat)',
      pulmonary: 'PV effective forward flow (per heartbeat)',
      mitral: null,
      tricuspid: null,
    },
  },
  // MV/TV: show the input components used to derive regurgitant volume
  {
    key: 'strokeVolume',
    label: 'Stroke volume',
    labelOverride: { mitral: 'LV stroke volume', tricuspid: 'RV stroke volume' },
    unit: 'mL',
    column: 1,
    dp: 0,
    paramKey: {
      aortic: null,
      pulmonary: null,
      mitral: 'LV SV',
      tricuspid: 'RV SV',
    },
  },
  {
    key: 'outflowEffectiveForward',
    label: 'Outflow effective forward flow',
    labelOverride: { mitral: 'Aortic effective forward flow', tricuspid: 'Pulmonary effective forward flow' },
    unit: 'mL/beat',
    column: 1,
    dp: 0,
    paramKey: {
      aortic: null,
      pulmonary: null,
      mitral: 'AV effective forward flow (per heartbeat)',
      tricuspid: 'PV effective forward flow (per heartbeat)',
    },
  },
  {
    key: 'regurgitantVolume',
    label: 'Regurgitant volume',
    unit: 'mL',
    column: 1,
    dp: 0,
    paramKey: {
      aortic: null,                        // same as backward flow for AV — removed
      pulmonary: null,                     // same as backward flow for PV — removed
      mitral: 'MR volume (per heartbeat)',
      tricuspid: 'TR volume (per heartbeat)',
    },
  },
  {
    key: 'regurgitantFraction',
    label: 'Regurgitant fraction',
    unit: '%',
    column: 1,
    dp: 1,
    paramKey: {
      aortic: 'AV regurgitant fraction',
      pulmonary: 'PV regurgitant fraction',
      mitral: 'MR regurgitant fraction',
      tricuspid: 'TR regurgitant fraction',
    },
  },
  // Right column — gradients & velocity
  {
    key: 'maxPressureGradient',
    label: 'Max pressure gradient',
    unit: 'mmHg',
    column: 2,
    dp: 1,
    paramKey: {
      aortic: 'AV maximum pressure gradient',
      pulmonary: 'PV maximum pressure gradient',
      mitral: null,
      tricuspid: null,
    },
  },
  {
    key: 'meanPressureGradient',
    label: 'Mean pressure gradient',
    unit: 'mmHg',
    column: 2,
    dp: 1,
    paramKey: {
      aortic: 'AV mean pressure gradient',
      pulmonary: 'PV mean pressure gradient',
      mitral: null,
      tricuspid: null,
    },
  },
  {
    key: 'peakVelocity',
    label: 'Peak velocity',
    unit: 'm/s',
    column: 2,
    dp: 1,
    paramKey: {
      aortic: 'AV maximum velocity',
      pulmonary: 'PV maximum velocity',
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

const LEAFLET_DISPLAY_NAMES: Partial<Record<ValveId, Record<string, string>>> = {
  aortic: {
    'Right coronary cusp': 'RCC',
    'Left coronary cusp': 'LCC',
    'Non-coronary cusp': 'NCC',
  },
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

function inflateMorphologies(
  source: Record<string, { findings: Record<string, { leaflets: string[]; detailValues: Record<string, string>; notes: string }> }> | undefined,
): Record<ValveId, ValveMorphology> {
  const next: Record<ValveId, ValveMorphology> = {
    mitral: emptyMorphology(),
    aortic: emptyMorphology(),
    tricuspid: emptyMorphology(),
    pulmonary: emptyMorphology(),
  }

  for (const valve of VALVES) {
    const storedValve = source?.[valve.id]
    if (!storedValve) continue
    const findings: Record<string, FindingDetail> = {}
    for (const [findingKey, findingValue] of Object.entries(storedValve.findings ?? {})) {
      findings[findingKey] = {
        leaflets: new Set(findingValue.leaflets ?? []),
        detailValues: { ...(findingValue.detailValues ?? {}) },
        notes: findingValue.notes ?? '',
      }
    }
    next[valve.id] = { findings }
  }

  return next
}

function serializeMorphologies(
  source: Record<ValveId, ValveMorphology>,
): Record<string, { findings: Record<string, { leaflets: string[]; detailValues: Record<string, string>; notes: string }> }> {
  const next: Record<string, { findings: Record<string, { leaflets: string[]; detailValues: Record<string, string>; notes: string }> }> = {}
  for (const valve of VALVES) {
    const valveMorphology = source[valve.id]
    const findings: Record<string, { leaflets: string[]; detailValues: Record<string, string>; notes: string }> = {}
    for (const [findingKey, findingValue] of Object.entries(valveMorphology.findings)) {
      findings[findingKey] = {
        leaflets: Array.from(findingValue.leaflets),
        detailValues: { ...findingValue.detailValues },
        notes: findingValue.notes,
      }
    }
    next[valve.id] = { findings }
  }
  return next
}

type ValveSummaryState = {
  llmProse: string | null
  llmProseSourceSignature: string | null
}

function inflateValveSummaries(
  source: Record<string, { llmProse: string | null; llmProseSourceSignature: string | null }> | undefined,
): Record<ValveId, ValveSummaryState> {
  return {
    mitral: {
      llmProse: source?.mitral?.llmProse ?? null,
      llmProseSourceSignature: source?.mitral?.llmProseSourceSignature ?? null,
    },
    aortic: {
      llmProse: source?.aortic?.llmProse ?? null,
      llmProseSourceSignature: source?.aortic?.llmProseSourceSignature ?? null,
    },
    tricuspid: {
      llmProse: source?.tricuspid?.llmProse ?? null,
      llmProseSourceSignature: source?.tricuspid?.llmProseSourceSignature ?? null,
    },
    pulmonary: {
      llmProse: source?.pulmonary?.llmProse ?? null,
      llmProseSourceSignature: source?.pulmonary?.llmProseSourceSignature ?? null,
    },
  }
}

function serializeValveSummaries(
  source: Record<ValveId, ValveSummaryState>,
): Record<string, ValveSummaryState> {
  return {
    mitral: { ...source.mitral },
    aortic: { ...source.aortic },
    tricuspid: { ...source.tricuspid },
    pulmonary: { ...source.pulmonary },
  }
}

// ---------------------------------------------------------------------------
// Severity grading (ASE 2017 / ACC 2020)
// ---------------------------------------------------------------------------

function autoGradeSeverity(values: Record<string, string>): Severity | null {
  const rv = parseFloat(values.regurgitantVolume ?? '')
  const rf = parseFloat(values.regurgitantFraction ?? '')

  if (isNaN(rv) && isNaN(rf)) return null

  // Prefer RF-based grading (matches the gauge exactly)
  if (!isNaN(rf)) return rfToSeverity(rf)

  // Fallback: regurgitant volume thresholds (ASE 2017)
  if (!isNaN(rv)) {
    if (rv >= 60) return 'severe'
    if (rv >= 30) return 'moderate'
    if (rv >= 15) return 'mild'
    if (rv > 0) return 'trivial'
    return 'none'
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
                <th style={{ width: '16%' }} className="px-3 py-2 text-left text-xs font-semibold text-muted-foreground">Finding</th>
                <th style={{ width: '17%' }} className="px-3 py-2 text-left text-xs font-semibold text-muted-foreground">Leaflet(s)</th>
                <th style={{ width: '42%' }} className="px-3 py-2 text-left text-xs font-semibold text-muted-foreground">Detail</th>
                <th style={{ width: '25%' }} className="px-3 py-2 text-left text-xs font-semibold text-muted-foreground">Notes</th>
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
                        <div className="flex flex-wrap gap-1">
                          {leafletNames.map((name) => {
                            const active = detail.leaflets.has(name)
                            const displayName = LEAFLET_DISPLAY_NAMES[valveId]?.[name] ?? name
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
                                {displayName}
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
                        <div className="flex flex-wrap items-center gap-2">
                          {f.details.map((d) => {
                            if (d.type === 'select') {
                              return (
                                <div key={d.label} className="flex flex-wrap items-center gap-1.5">
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
        className="flex items-center gap-3 border-b border-border/30 px-5 py-3.5 w-full text-left hover:bg-muted/20 transition-colors"
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

const VALVE_REGURG_ABBR: Record<ValveId, string> = {
  mitral: 'MR',
  aortic: 'AR',
  tricuspid: 'TR',
  pulmonary: 'PR',
}

function FlowViz({ values }: { values: Record<string, string> }) {
  const forward = parseFloat(values.forwardFlow || '')
  const backward = Math.abs(parseFloat(values.backwardFlow || ''))
  const rf = parseFloat(values.regurgitantFraction || '')

  const hasFlow = !isNaN(forward) && forward > 0 && !isNaN(backward)
  const hasRF = !isNaN(rf)

  if (!hasFlow && !hasRF) return null

  const rfVal = hasRF ? rf : (hasFlow ? (backward / forward) * 100 : NaN)

  // Gauge geometry — semicircle sweeps left→right through the top
  // 0° = left (9 o'clock), 90° = top (12 o'clock), 180° = right (3 o'clock)
  const CX = 150
  const CY = 130
  const ARC_R = 90

  // Convert gauge degrees (0=left, 180=right) to SVG coordinates
  function gaugePoint(deg: number, r: number): [number, number] {
    // math angle: π at 0°, 0 at 180° (sweeps counterclockwise through top)
    const a = Math.PI * (1 - deg / 180)
    return [CX + r * Math.cos(a), CY - r * Math.sin(a)]
  }

  function arcPath(r: number, startDeg: number, endDeg: number): string {
    const [x1, y1] = gaugePoint(startDeg, r)
    const [x2, y2] = gaugePoint(endDeg, r)
    const largeArc = (endDeg - startDeg) > 180 ? 1 : 0
    // Sweep direction = 1 (clockwise in SVG) matches left→top→right
    return `M ${x1} ${y1} A ${r} ${r} 0 ${largeArc} 1 ${x2} ${y2}`
  }

  // Severity zones — arc width proportional to RF% range
  // Gauge maps 0–60% RF to 0–180° (values beyond 60% pin at the end)
  const RF_MAX = 60
  const sevZones = RF_SEVERITY_THRESHOLDS.map((t) => {
    const lo = t.lo
    const hi = Math.min(t.hi === Infinity ? RF_MAX : t.hi, RF_MAX)
    return {
      label: SEVERITY_LABELS[t.grade],
      lo,
      hi,
      startDeg: (lo / RF_MAX) * 180,
      endDeg: (hi / RF_MAX) * 180,
      color: SEVERITY_COLORS[t.grade],
      grade: t.grade,
    }
  })

  // Linear mapping: RF% → gauge angle (proportional to actual value)
  const gaugeAngle = !isNaN(rfVal) ? Math.min(rfVal / RF_MAX, 1) * 180 : 0
  const [nx, ny] = gaugePoint(gaugeAngle, ARC_R - 22)

  return (
    <div className="flex justify-center">
        <div className="flex flex-col items-center">
          {/* Value and label above the gauge */}
          <div className="text-center mb-1">
            <div className="text-2xl font-bold tabular-nums">{!isNaN(rfVal) ? `${rfVal.toFixed(1)}%` : '—'}</div>
            <div className="text-[11px] text-muted-foreground font-medium">Regurgitant fraction</div>
          </div>
          <svg width="380" height="190" viewBox="20 20 260 130">
            {/* Severity zone arcs — proportional to RF% range, butt caps */}
            {sevZones.map((z) => {
              const isActive = !isNaN(rfVal) && rfVal >= z.lo && rfVal < z.hi
              const op = isActive || isNaN(rfVal) ? 1 : 0.3
              return (
                <path
                  key={z.label}
                  d={arcPath(ARC_R, z.startDeg, z.endDeg)}
                  fill="none"
                  stroke={z.color}
                  strokeWidth="24"
                  strokeLinecap="butt"
                  opacity={op}
                  className="transition-opacity duration-300"
                />
              )
            })}
            {/* Gap lines between zones */}
            {sevZones.slice(1).map((z) => {
              const [gx1, gy1] = gaugePoint(z.startDeg, ARC_R - 12)
              const [gx2, gy2] = gaugePoint(z.startDeg, ARC_R + 12)
              return (
                <line
                  key={`gap-${z.label}`}
                  x1={gx1} y1={gy1} x2={gx2} y2={gy2}
                  stroke="white"
                  strokeWidth="2.5"
                />
              )
            })}
            {/* Needle */}
            {!isNaN(rfVal) && (
              <>
                <line x1={CX} y1={CY} x2={nx} y2={ny} stroke="hsl(0 0% 15%)" strokeWidth="2.5" strokeLinecap="round" />
                <circle cx={CX} cy={CY} r="5" fill="hsl(0 0% 15%)" />
              </>
            )}
          </svg>
        </div>

      </div>
  )
}

// ---------------------------------------------------------------------------
// Flow detail panel
// ---------------------------------------------------------------------------

function FlowPanel({ valve, values, derivedKeys, autoSeverity, manualSeverity, morphology, onMorphologyChange }: {
  valve: ValveInfo
  values: Record<string, string>
  derivedKeys: Set<string>
  autoSeverity: Severity | null
  manualSeverity: Severity | null
  morphology: ValveMorphology
  onMorphologyChange: (m: ValveMorphology) => void
}) {
  const effectiveSeverity = manualSeverity ?? autoSeverity ?? 'none'
  const isOverridden = manualSeverity !== null && autoSeverity !== null && manualSeverity !== autoSeverity

  // Only show fields relevant to this valve (where paramKey is not null)
  const relevantFields = FLOW_FIELDS.filter((f) => f.paramKey[valve.id] !== null)

  return (
    <div className="flex flex-col gap-4">
      {/* Flow assessment card */}
      <section className="rounded-xl border border-border/50 bg-card">
        <div className="flex items-center gap-3 border-b border-border/30 px-5 py-3.5">
          <SectionMarker tone="report" size="title" className="self-stretch h-auto" />
          <h3 className="text-sm font-semibold text-foreground flex-1">Flow assessment</h3>
          <span
            className={cn(
              'rounded-full px-3 py-1 text-xs font-semibold',
              effectiveSeverity === 'mild' ? 'text-black' : 'text-white',
            )}
            style={{ backgroundColor: SEVERITY_COLORS[effectiveSeverity] }}
          >
            {SEVERITY_LABELS[effectiveSeverity]} {VALVE_REGURG_ABBR[valve.id]}
            {isOverridden && ' ✎'}
          </span>
        </div>
        <div className="p-5">
          <div className="flex gap-6">
            {/* Left column — flow volumes */}
            <div className="flex-1 min-w-0 flex flex-col gap-4">
              {relevantFields.filter((f) => f.column === 1).map((field) => {
                const paramKey = field.paramKey[valve.id]!
                const displayVal = values[field.key]
                const fieldLabel = field.labelOverride?.[valve.id] ?? field.label
                return (
                  <div key={field.key} className="flex items-center gap-3">
                    <label className="text-sm text-muted-foreground w-52 shrink-0 flex items-center" title={paramKey}>
                      {fieldLabel}
                      {derivedKeys.has(field.key) && <CalculatorIcon />}
                    </label>
                    <div className="flex items-center gap-2 flex-1">
                      <span className="h-8 w-20 flex items-center px-2.5 text-[0.95rem] font-bold tabular-nums text-foreground">
                        {displayVal || '—'}
                      </span>
                      <span className="text-sm text-muted-foreground/70">{field.unit}</span>
                    </div>
                  </div>
                )
              })}
            </div>
            {/* Right column — gradients & velocity */}
            <div className="flex-1 min-w-0 flex flex-col gap-4">
              {relevantFields.filter((f) => f.column === 2).map((field) => {
                const paramKey = field.paramKey[valve.id]!
                const displayVal = values[field.key]
                const fieldLabel = field.labelOverride?.[valve.id] ?? field.label
                return (
                  <div key={field.key} className="flex items-center gap-3">
                    <label className="text-sm text-muted-foreground w-52 shrink-0 flex items-center" title={paramKey}>
                      {fieldLabel}
                      {derivedKeys.has(field.key) && <CalculatorIcon />}
                    </label>
                    <div className="flex items-center gap-2 flex-1">
                      <span className="h-8 w-20 flex items-center px-2.5 text-[0.95rem] font-bold tabular-nums text-foreground">
                        {displayVal || '—'}
                      </span>
                      <span className="text-sm text-muted-foreground/70">{field.unit}</span>
                    </div>
                  </div>
                )
              })}
            </div>
            {/* Gauge */}
            <div className="w-[380px] shrink-0 flex flex-col justify-center">
              <FlowViz values={values} />
            </div>
          </div>
        </div>
      </section>

      {/* Morphology card */}
      <section className="rounded-xl border border-border/50 bg-card">
        <MorphologySection
          valve={valve}
          morphology={morphology}
          onMorphologyChange={onMorphologyChange}
        />
      </section>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Main page
// ---------------------------------------------------------------------------

export function CmrValvesPage() {
  const activeCase = useCmrCaseStore((state) => state.activeCase)
  const patchActiveCasePayload = useCmrCaseStore((state) => state.patchActiveCasePayload)
  const initialValves = activeCase?.payload.valves
  const [selectedValve, setSelectedValve] = useState<ValveId | null>(
    () => (initialValves?.selectedValve as ValveId | null | undefined) ?? null,
  )

  // Read extracted values from shared report store
  const extraction = useSyncExternalStore(subscribeExtractionResult, getExtractionResult)
  const extractedValues = useMemo(() => {
    const map = new Map<string, number>()
    if (extraction?.measurements) {
      for (const m of extraction.measurements) map.set(m.parameter, m.value)
    }
    return normalizeValveMeasurementMap(map)
  }, [extraction])
  const heartRate = extraction?.demographics?.heart_rate ?? undefined

  // Derived (calculated) values — indirect volumetric method
  const derivedValues = useMemo(() => {
    const derived = new Map<string, number>()
    const lvsv = extractedValues.get('LV SV')
    const rvsv = extractedValues.get('RV SV')
    const avEff = getEffectiveForwardFlow({
      measurements: extractedValues,
      effectiveBeatKeys: ['AV effective forward flow (per heartbeat)'],
      effectiveMinuteKeys: ['AV effective forward flow (per minute)'],
      forwardBeatKeys: ['AV forward flow (per heartbeat)'],
      forwardMinuteKeys: ['AV forward flow (per minute)'],
      backwardBeatKeys: ['AV backward flow (per heartbeat)'],
      backwardMinuteKeys: ['AV backward flow (per minute)'],
      regurgitantFractionKeys: ['AV regurgitant fraction'],
      heartRate,
    })
    const pvEff = getEffectiveForwardFlow({
      measurements: extractedValues,
      effectiveBeatKeys: ['PV effective forward flow (per heartbeat)'],
      effectiveMinuteKeys: ['PV effective forward flow (per minute)'],
      forwardBeatKeys: ['PV forward flow (per heartbeat)'],
      forwardMinuteKeys: ['PV forward flow (per minute)'],
      backwardBeatKeys: ['PV backward flow (per heartbeat)'],
      backwardMinuteKeys: ['PV backward flow (per minute)'],
      regurgitantFractionKeys: ['PV regurgitant fraction'],
      heartRate,
    })

    if (!extractedValues.has('AV effective forward flow (per heartbeat)') && avEff !== undefined) {
      derived.set('AV effective forward flow (per heartbeat)', Math.round(avEff * 10) / 10)
    }
    if (!extractedValues.has('PV effective forward flow (per heartbeat)') && pvEff !== undefined) {
      derived.set('PV effective forward flow (per heartbeat)', Math.round(pvEff * 10) / 10)
    }

    const effectiveAvEff = extractedValues.get('AV effective forward flow (per heartbeat)') ?? avEff
    const effectivePvEff = extractedValues.get('PV effective forward flow (per heartbeat)') ?? pvEff

    if (lvsv !== undefined && effectiveAvEff !== undefined && !extractedValues.has('MR volume (per heartbeat)')) {
      const mrVol = lvsv - effectiveAvEff
      if (mrVol >= 0) {
        derived.set('MR volume (per heartbeat)', Math.round(mrVol * 10) / 10)
        if (lvsv > 0) derived.set('MR regurgitant fraction', Math.round((mrVol / lvsv) * 1000) / 10)
      }
    }

    if (rvsv !== undefined && effectivePvEff !== undefined && !extractedValues.has('TR volume (per heartbeat)')) {
      const trVol = rvsv - effectivePvEff
      if (trVol >= 0) {
        derived.set('TR volume (per heartbeat)', Math.round(trVol * 10) / 10)
        if (rvsv > 0) derived.set('TR regurgitant fraction', Math.round((trVol / rvsv) * 1000) / 10)
      }
    }

    return derived
  }, [extractedValues, heartRate])

  // Manual severity overrides per valve (null = use auto)
  const [manualSeverity] = useState<Record<ValveId, Severity | null>>({
    mitral: null,
    aortic: null,
    tricuspid: null,
    pulmonary: null,
  })

  // Morphology findings per valve
  const [morphologies, setMorphologies] = useState<Record<ValveId, ValveMorphology>>({
    ...inflateMorphologies(initialValves?.morphologies),
  })
  const [summaries, setSummaries] = useState<Record<ValveId, ValveSummaryState>>({
    ...inflateValveSummaries(initialValves?.summaries),
  })
  const [isGeneratingMitralSummary, setIsGeneratingMitralSummary] = useState(false)
  const [mitralSummaryError, setMitralSummaryError] = useState<string | null>(null)
  const [isGeneratingAorticSummary, setIsGeneratingAorticSummary] = useState(false)
  const [aorticSummaryError, setAorticSummaryError] = useState<string | null>(null)
  const [isGeneratingTricuspidSummary, setIsGeneratingTricuspidSummary] = useState(false)
  const [tricuspidSummaryError, setTricuspidSummaryError] = useState<string | null>(null)

  useEffect(() => {
    const nextValves = activeCase?.payload.valves
    setSelectedValve((nextValves?.selectedValve as ValveId | null | undefined) ?? null)
    setMorphologies({
      ...inflateMorphologies(nextValves?.morphologies),
    })
    setSummaries({
      ...inflateValveSummaries(nextValves?.summaries),
    })
    setIsGeneratingMitralSummary(false)
    setMitralSummaryError(null)
    setIsGeneratingAorticSummary(false)
    setAorticSummaryError(null)
    setIsGeneratingTricuspidSummary(false)
    setTricuspidSummaryError(null)
  }, [activeCase?.id])

  useEffect(() => {
    patchActiveCasePayload((payload) => ({
      ...payload,
      valves: {
        selectedValve,
        morphologies: serializeMorphologies(morphologies),
        summaries: serializeValveSummaries(summaries),
      },
    }))
  }, [morphologies, patchActiveCasePayload, selectedValve, summaries])

  const handleMorphologyChange = useCallback((valveId: ValveId, m: ValveMorphology) => {
    setMorphologies((prev) => ({ ...prev, [valveId]: m }))
  }, [])

  const summaryMeasurementMap = useMemo(() => {
    const next = new Map<string, number>(extractedValues)
    for (const [key, value] of derivedValues.entries()) {
      if (!next.has(key)) {
        next.set(key, value)
      }
    }
    return next
  }, [derivedValues, extractedValues])

  const mitralSummaryData = useMemo(
    () => buildMitralValveSummaryData(summaryMeasurementMap, morphologies.mitral),
    [morphologies, summaryMeasurementMap],
  )
  const mitralSummarySignature = useMemo(
    () => buildMitralValveSummarySignature(mitralSummaryData),
    [mitralSummaryData],
  )
  const mitralSummary = summaries.mitral
  const isMitralSummaryStale = mitralSummary.llmProse !== null
    && mitralSummary.llmProseSourceSignature !== mitralSummarySignature

  const aorticSummaryData = useMemo(
    () => buildAorticValveSummaryData(summaryMeasurementMap, morphologies.aortic),
    [morphologies, summaryMeasurementMap],
  )
  const aorticSummarySignature = useMemo(
    () => buildAorticValveSummarySignature(aorticSummaryData),
    [aorticSummaryData],
  )
  const aorticSummary = summaries.aortic
  const isAorticSummaryStale = aorticSummary.llmProse !== null
    && aorticSummary.llmProseSourceSignature !== aorticSummarySignature

  const tricuspidSummaryData = useMemo(
    () => buildTricuspidValveSummaryData(summaryMeasurementMap, morphologies.tricuspid),
    [morphologies, summaryMeasurementMap],
  )
  const tricuspidSummarySignature = useMemo(
    () => buildTricuspidValveSummarySignature(tricuspidSummaryData),
    [tricuspidSummaryData],
  )
  const tricuspidSummary = summaries.tricuspid
  const isTricuspidSummaryStale = tricuspidSummary.llmProse !== null
    && tricuspidSummary.llmProseSourceSignature !== tricuspidSummarySignature

  const handleGenerateMitralSummary = useCallback(async () => {
    setIsGeneratingMitralSummary(true)
    setMitralSummaryError(null)
    try {
      const prose = await generateCmrMitralValveProse(mitralSummaryData)
      setSummaries((prev) => ({
        ...prev,
        mitral: {
          llmProse: prose,
          llmProseSourceSignature: mitralSummarySignature,
        },
      }))
    } catch (error) {
      setMitralSummaryError(error instanceof Error ? error.message : String(error))
    } finally {
      setIsGeneratingMitralSummary(false)
    }
  }, [mitralSummaryData, mitralSummarySignature])

  const clearMitralSummary = useCallback(() => {
    setSummaries((prev) => ({
      ...prev,
      mitral: {
        llmProse: null,
        llmProseSourceSignature: null,
      },
    }))
    setMitralSummaryError(null)
  }, [])

  const handleGenerateAorticSummary = useCallback(async () => {
    setIsGeneratingAorticSummary(true)
    setAorticSummaryError(null)
    try {
      const prose = await generateCmrAorticValveProse(aorticSummaryData)
      setSummaries((prev) => ({
        ...prev,
        aortic: {
          llmProse: prose,
          llmProseSourceSignature: aorticSummarySignature,
        },
      }))
    } catch (error) {
      setAorticSummaryError(error instanceof Error ? error.message : String(error))
    } finally {
      setIsGeneratingAorticSummary(false)
    }
  }, [aorticSummaryData, aorticSummarySignature])

  const clearAorticSummary = useCallback(() => {
    setSummaries((prev) => ({
      ...prev,
      aortic: {
        llmProse: null,
        llmProseSourceSignature: null,
      },
    }))
    setAorticSummaryError(null)
  }, [])

  const handleGenerateTricuspidSummary = useCallback(async () => {
    setIsGeneratingTricuspidSummary(true)
    setTricuspidSummaryError(null)
    try {
      const prose = await generateCmrTricuspidValveProse(tricuspidSummaryData)
      setSummaries((prev) => ({
        ...prev,
        tricuspid: {
          llmProse: prose,
          llmProseSourceSignature: tricuspidSummarySignature,
        },
      }))
    } catch (error) {
      setTricuspidSummaryError(error instanceof Error ? error.message : String(error))
    } finally {
      setIsGeneratingTricuspidSummary(false)
    }
  }, [tricuspidSummaryData, tricuspidSummarySignature])

  const clearTricuspidSummary = useCallback(() => {
    setSummaries((prev) => ({
      ...prev,
      tricuspid: {
        llmProse: null,
        llmProseSourceSignature: null,
      },
    }))
    setTricuspidSummaryError(null)
  }, [])

  // Resolve values for a valve: override → extracted → derived → empty
  // Returns { values, derivedKeys } so UI can show calculator icon
  const resolveValues = useCallback((valveId: ValveId): { values: Record<string, string>, derivedKeys: Set<string> } => {
    const values: Record<string, string> = {}
    const derivedKeys = new Set<string>()
    for (const field of FLOW_FIELDS) {
      const paramKey = field.paramKey[valveId]
      if (paramKey && extractedValues.has(paramKey)) {
        let val = extractedValues.get(paramKey)!
        // Backward flow & regurgitant volume: strip sign — the label already implies direction
        if (field.key === 'backwardFlow' || field.key === 'regurgitantVolume') val = Math.abs(val)
        values[field.key] = val.toFixed(field.dp)
      } else if (paramKey && derivedValues.has(paramKey)) {
        values[field.key] = derivedValues.get(paramKey)!.toFixed(field.dp)
        derivedKeys.add(field.key)
      } else {
        values[field.key] = ''
      }
    }
    return { values, derivedKeys }
  }, [extractedValues, derivedValues])

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
            autoSeverity={autoSeverities[selectedValve]}
            manualSeverity={manualSeverity[selectedValve]}
            morphology={morphologies[selectedValve]}
            onMorphologyChange={(m) => handleMorphologyChange(selectedValve, m)}
          />
        )
      })()}

        {selectedValve === 'mitral' && (
          <section className="rounded-xl border border-border/50 bg-card">
            <div className="flex items-center gap-3 border-b border-border/30 px-5 py-3.5">
              <SectionMarker tone="report" size="title" className="self-stretch h-auto" />
              <h3 className="flex-1 text-sm font-semibold text-foreground">Mitral summary</h3>
            {mitralSummaryData.severityLabel && mitralSummaryData.severity !== 'none' && (
              <span className="rounded-full px-2.5 py-0.5 text-xs font-semibold text-white bg-foreground/70">
                {mitralSummaryData.severityLabel.toUpperCase()} MR
              </span>
            )}
            {mitralSummaryData.primaryMechanismLabel && (
              <span className="rounded-full px-2.5 py-0.5 text-xs font-semibold text-[hsl(var(--tone-neutral-700))] bg-[hsl(var(--tone-neutral-100))]">
                {mitralSummaryData.primaryMechanismLabel}
              </span>
            )}
          </div>
          <div className="p-5">
            {mitralSummary.llmProse !== null && (
              <p className="text-sm leading-relaxed text-foreground/80 whitespace-pre-wrap">
                {mitralSummary.llmProse}
              </p>
            )}

            {mitralSummaryError && (
              <p className="mt-2 text-xs text-red-500">{mitralSummaryError}</p>
            )}

            <div className="mt-3 flex items-center gap-3">
              <button
                type="button"
                disabled={isGeneratingMitralSummary}
                onClick={handleGenerateMitralSummary}
                className={cn(
                  'rounded-full px-4 py-1.5 text-xs font-medium transition-all',
                  'bg-foreground text-background hover:bg-foreground/90',
                  'disabled:opacity-40 disabled:cursor-not-allowed',
                )}
              >
                {isGeneratingMitralSummary
                  ? 'Generating...'
                  : mitralSummary.llmProse !== null
                    ? isMitralSummaryStale
                      ? 'Regenerate Summary (Stale)'
                      : 'Regenerate Summary'
                    : 'Generate Summary'}
              </button>
              {mitralSummary.llmProse !== null && (
                <button
                  type="button"
                  onClick={clearMitralSummary}
                  className="rounded-full px-3 py-1 text-xs font-medium text-red-600 ring-1 ring-red-300 hover:bg-red-50 hover:text-red-700 transition-all"
                >
                  Clear
                </button>
              )}
              </div>
            </div>
          </section>
        )}

        {selectedValve === 'aortic' && (
          <section className="rounded-xl border border-border/50 bg-card">
            <div className="flex items-center gap-3 border-b border-border/30 px-5 py-3.5">
              <SectionMarker tone="report" size="title" className="self-stretch h-auto" />
              <h3 className="flex-1 text-sm font-semibold text-foreground">Aortic summary</h3>
              {aorticSummaryData.phenotype === 'mixed' && (
                <span className="rounded-full px-2.5 py-0.5 text-xs font-semibold text-white bg-foreground/70">
                  MIXED
                </span>
              )}
              {aorticSummaryData.phenotype === 'stenosis' && aorticSummaryData.stenosisSeverityLabel && (
                <span className="rounded-full px-2.5 py-0.5 text-xs font-semibold text-white bg-foreground/70">
                  {aorticSummaryData.stenosisSeverityLabel.toUpperCase()} AS
                </span>
              )}
              {aorticSummaryData.phenotype === 'regurgitation' && aorticSummaryData.regurgitationSeverityLabel && aorticSummaryData.regurgitationSeverity !== 'none' && (
                <span className="rounded-full px-2.5 py-0.5 text-xs font-semibold text-white bg-foreground/70">
                  {aorticSummaryData.regurgitationSeverityLabel.toUpperCase()} AR
                </span>
              )}
              {aorticSummaryData.primaryMechanismLabel && (
                <span className="rounded-full px-2.5 py-0.5 text-xs font-semibold text-[hsl(var(--tone-neutral-700))] bg-[hsl(var(--tone-neutral-100))]">
                  {aorticSummaryData.primaryMechanismLabel}
                </span>
              )}
            </div>
            <div className="p-5">
              {aorticSummary.llmProse !== null && (
                <p className="text-sm leading-relaxed text-foreground/80 whitespace-pre-wrap">
                  {aorticSummary.llmProse}
                </p>
              )}

              {aorticSummaryError && (
                <p className="mt-2 text-xs text-red-500">{aorticSummaryError}</p>
              )}

              <div className="mt-3 flex items-center gap-3">
                <button
                  type="button"
                  disabled={isGeneratingAorticSummary}
                  onClick={handleGenerateAorticSummary}
                  className={cn(
                    'rounded-full px-4 py-1.5 text-xs font-medium transition-all',
                    'bg-foreground text-background hover:bg-foreground/90',
                    'disabled:opacity-40 disabled:cursor-not-allowed',
                  )}
                >
                  {isGeneratingAorticSummary
                    ? 'Generating...'
                    : aorticSummary.llmProse !== null
                      ? isAorticSummaryStale
                        ? 'Regenerate Summary (Stale)'
                        : 'Regenerate Summary'
                      : 'Generate Summary'}
                </button>
                {aorticSummary.llmProse !== null && (
                  <button
                    type="button"
                    onClick={clearAorticSummary}
                    className="rounded-full px-3 py-1 text-xs font-medium text-red-600 ring-1 ring-red-300 hover:bg-red-50 hover:text-red-700 transition-all"
                  >
                    Clear
                  </button>
                )}
              </div>
            </div>
          </section>
        )}

        {selectedValve === 'tricuspid' && (
          <section className="rounded-xl border border-border/50 bg-card">
            <div className="flex items-center gap-3 border-b border-border/30 px-5 py-3.5">
              <SectionMarker tone="report" size="title" className="self-stretch h-auto" />
              <h3 className="flex-1 text-sm font-semibold text-foreground">Tricuspid summary</h3>
              {tricuspidSummaryData.severityLabel && tricuspidSummaryData.severity !== 'none' && (
                <span className="rounded-full px-2.5 py-0.5 text-xs font-semibold text-white bg-foreground/70">
                  {tricuspidSummaryData.severityLabel.toUpperCase()} TR
                </span>
              )}
              {tricuspidSummaryData.primaryMechanismLabel && (
                <span className="rounded-full px-2.5 py-0.5 text-xs font-semibold text-[hsl(var(--tone-neutral-700))] bg-[hsl(var(--tone-neutral-100))]">
                  {tricuspidSummaryData.primaryMechanismLabel}
                </span>
              )}
            </div>
            <div className="p-5">
              {tricuspidSummary.llmProse !== null && (
                <p className="text-sm leading-relaxed text-foreground/80 whitespace-pre-wrap">
                  {tricuspidSummary.llmProse}
                </p>
              )}

              {tricuspidSummaryError && (
                <p className="mt-2 text-xs text-red-500">{tricuspidSummaryError}</p>
              )}

              <div className="mt-3 flex items-center gap-3">
                <button
                  type="button"
                  disabled={isGeneratingTricuspidSummary}
                  onClick={handleGenerateTricuspidSummary}
                  className={cn(
                    'rounded-full px-4 py-1.5 text-xs font-medium transition-all',
                    'bg-foreground text-background hover:bg-foreground/90',
                    'disabled:opacity-40 disabled:cursor-not-allowed',
                  )}
                >
                  {isGeneratingTricuspidSummary
                    ? 'Generating...'
                    : tricuspidSummary.llmProse !== null
                      ? isTricuspidSummaryStale
                        ? 'Regenerate Summary (Stale)'
                        : 'Regenerate Summary'
                      : 'Generate Summary'}
                </button>
                {tricuspidSummary.llmProse !== null && (
                  <button
                    type="button"
                    onClick={clearTricuspidSummary}
                    className="rounded-full px-3 py-1 text-xs font-medium text-red-600 ring-1 ring-red-300 hover:bg-red-50 hover:text-red-700 transition-all"
                  >
                    Clear
                  </button>
                )}
              </div>
            </div>
          </section>
        )}
      </Stack>
    )
  }
