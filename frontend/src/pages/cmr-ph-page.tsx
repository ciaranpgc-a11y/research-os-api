import { useCallback, useEffect, useMemo, useState, useSyncExternalStore } from 'react'
import { ExternalLink } from 'lucide-react'

import { SectionMarker } from '@/components/patterns'
import { DrilldownSheet, PageHeader, Row, Stack } from '@/components/primitives'
import type { CmrCanonicalParam, CmrCanonicalTableResponse } from '@/lib/cmr-api'
import { fetchConfig, fetchReferenceParameters } from '@/lib/cmr-api'
import {
  applyCmrReferencePreset,
  normalizeCmrReferencePreset,
  type CmrReferencePreset,
} from '@/lib/cmr-reference-presets'
import {
  buildPhSummaryData,
  buildPhSummarySignature,
  normalizePhRegurgitationChoice,
  type PhSummaryChoices,
} from '@/lib/cmr-ph-summary'
import { rangeParamMapToRecord, rangeParamRecordToMap } from '@/lib/cmr-case-defaults'
import {
  computeMeasuredPos,
  computeMeasuredRel,
  constrainRange,
  factoryBaseline,
  globalAutoAdjust,
  hasValidRange,
  isAbnormal as isAbnormalValue,
  perMeasurementAutoAdjust,
  type RangeParam,
} from '@/lib/cmr-chart-scaling'
import { getExtractionResult, subscribeExtractionResult } from '@/lib/cmr-report-store'
import { generateCmrPhProse } from '@/lib/cmr-summary-api'
import { computeSeverity, inferSeverityLabel, type SeverityLabelType, type SeverityResult } from '@/lib/cmr-severity'
import { cn } from '@/lib/utils'
import {
  type RegurgitationSeverity as ValveRfSeverity,
  REGURGITATION_SEVERITY_LABELS,
  rfToRegurgitationSeverity,
} from '@/lib/cmr-valve-severity'
import { useCmrCaseStore } from '@/store/use-cmr-case-store'

type NumericKey =
  | 'rvEdv'
  | 'rvEdvi'
  | 'rvEsv'
  | 'rvEsvi'
  | 'rvSv'
  | 'rvSvi'
  | 'rvEf'
  | 'rvMass'
  | 'rvMassIndex'
  | 'rvCo'
  | 'rvCi'
  | 'raMaxVolume'
  | 'raMaxVolumeIndex'
  | 'lvEdvi'
  | 'lvSvi'
  | 'tapse'
  | 'pericardialEffusionSize'
  | 'mainPaDiameter'
  | 'mainPaSystolicArea'
  | 'mainPaDiastolicArea'
  | 'paRelativeAreaChange'
  | 'paDistensibility'
  | 'rpaDiameter'
  | 'lpaDiameter'
  | 'pvEffectiveForwardFlow'
  | 'pvForwardFlow'
  | 'pvBackwardFlow'
  | 'pvRegurgitantFraction'
  | 'peakVelocity'
  | 'maxPressureGradient'
  | 'meanPressureGradient'
  | 'trRegurgitantFraction'
  | 'trRegurgitantVolume'
  | 'mrRegurgitantFraction'
  | 'mrRegurgitantVolume'
  | 'prRegurgitantFraction'
  | 'rvLvVolumeRatio'
  | 'rpaDistension'
  | 'lpaDistension'
  | 'mainPaNetFlow'
  | 'rpaNetFlow'
  | 'lpaNetFlow'
  | 'vortexDurationPercent'
  | 'rpaPercent'
  | 'lpaPercent'

type NumericFieldDef = {
  key: NumericKey
  label: string
  unit?: string
  decimals?: number
  extractedParam?: string
}

type Option<T extends string> = { value: T; label: string }

type SeptalFlattening = 'none' | 'systolic' | 'diastolic' | 'both'
type SeptalMotion = 'normal' | 'paradoxical' | 'dyskinetic' | 'not-assessed'
type InteratrialBowing = 'none' | 'toward-la' | 'toward-ra' | 'bidirectional' | 'not-assessed'
type PericardialEffusion = 'none' | 'small' | 'moderate' | 'large'
type VenaCavaState = 'normal' | 'dilated' | 'not-assessed'
type RegurgitationSeverity = ValveRfSeverity
type PresenceState = 'not-assessed' | 'absent' | 'present'
type AdvancedSeverity = 'mild' | 'moderate' | 'marked'
type VortexLocation = 'not-specified' | 'main-pa' | 'main-pa-rpa' | 'main-pa-lpa' | 'branch-only' | 'diffuse-proximal-pa'
type HelicalFlowLocation = 'not-specified' | 'rvot-mpa' | 'central-mpa' | 'rpa' | 'lpa' | 'diffuse-proximal-pa'

type ChoiceState = {
  septalFlattening: SeptalFlattening
  septalMotion: SeptalMotion
  interatrialSeptalBowing: InteratrialBowing
  pericardialEffusion: PericardialEffusion
  venaCava: VenaCavaState
  trSeverity: RegurgitationSeverity
  mrSeverity: RegurgitationSeverity
  prSeverity: RegurgitationSeverity
  vortexFormation: PresenceState
  vortexSeverity: AdvancedSeverity | null
  vortexLocation: VortexLocation
  helicity: PresenceState
  helicitySeverity: AdvancedSeverity | null
  helicityLocation: HelicalFlowLocation
}

type TextState = {
  ancillaryFindings: string
  additionalDetails: string
  flowComment: string
}

type PhSectionId =
  | 'summary'
  | 'rv'
  | 'signs'
  | 'pa-flow'
  | 'valves'
  | '4d-flow'

type QuantitativeDisplayRow = {
  key: NumericKey
  field: NumericFieldDef
  value: number | null
  canonical: CmrCanonicalParam | null
}

type ValveDetailCardMetric = {
  label: string
  value: string
}

const NUMERIC_FIELDS: Record<NumericKey, NumericFieldDef> = {
  rvEdv: { key: 'rvEdv', label: 'RV EDV', unit: 'mL', decimals: 0, extractedParam: 'RV EDV' },
  rvEdvi: { key: 'rvEdvi', label: 'RV EDVi', unit: 'mL/m2', decimals: 0, extractedParam: 'RV EDV (i)' },
  rvEsv: { key: 'rvEsv', label: 'RV ESV', unit: 'mL', decimals: 0, extractedParam: 'RV ESV' },
  rvEsvi: { key: 'rvEsvi', label: 'RV ESVi', unit: 'mL/m2', decimals: 0, extractedParam: 'RV ESV (i)' },
  rvSv: { key: 'rvSv', label: 'RV SV', unit: 'mL', decimals: 0, extractedParam: 'RV SV' },
  rvSvi: { key: 'rvSvi', label: 'RV SVi', unit: 'mL/m2', decimals: 0, extractedParam: 'RV SV (i)' },
  rvEf: { key: 'rvEf', label: 'RV EF', unit: '%', decimals: 0, extractedParam: 'RV EF' },
  rvMass: { key: 'rvMass', label: 'RV mass', unit: 'g', decimals: 0, extractedParam: 'RV mass' },
  rvMassIndex: { key: 'rvMassIndex', label: 'RV mass index', unit: 'g/m2', decimals: 0, extractedParam: 'RV mass (i)' },
  rvCo: { key: 'rvCo', label: 'RV CO', unit: 'L/min', decimals: 1, extractedParam: 'RV CO' },
  rvCi: { key: 'rvCi', label: 'RV CI', unit: 'L/min/m2', decimals: 1, extractedParam: 'RV CI' },
  raMaxVolume: { key: 'raMaxVolume', label: 'RA max volume', unit: 'mL', decimals: 0, extractedParam: 'RA max volume' },
  raMaxVolumeIndex: { key: 'raMaxVolumeIndex', label: 'RA max volume index', unit: 'mL/m2', decimals: 0, extractedParam: 'RA max volume (i)' },
  lvEdvi: { key: 'lvEdvi', label: 'LV EDVi', unit: 'mL/m2', decimals: 0, extractedParam: 'LV EDV (i)' },
  lvSvi: { key: 'lvSvi', label: 'LV SVi', unit: 'mL/m2', decimals: 0, extractedParam: 'LV SV (i)' },
  tapse: { key: 'tapse', label: 'TAPSE', unit: 'mm', decimals: 0, extractedParam: 'TAPSE' },
  pericardialEffusionSize: { key: 'pericardialEffusionSize', label: 'Pericardial effusion size', unit: 'mm', decimals: 0 },
  mainPaDiameter: { key: 'mainPaDiameter', label: 'Main PA diameter', unit: 'mm', decimals: 0, extractedParam: 'MPA systolic diameter' },
  mainPaSystolicArea: { key: 'mainPaSystolicArea', label: 'Main PA systolic area', unit: 'cm2', decimals: 1, extractedParam: 'MPA systolic area' },
  mainPaDiastolicArea: { key: 'mainPaDiastolicArea', label: 'Main PA diastolic area', unit: 'cm2', decimals: 1, extractedParam: 'MPA diastolic area' },
  paRelativeAreaChange: { key: 'paRelativeAreaChange', label: 'PA relative area change', unit: '%', decimals: 0 },
  paDistensibility: { key: 'paDistensibility', label: 'PA distensibility', unit: '%', decimals: 0, extractedParam: 'MPA distension' },
  rpaDiameter: { key: 'rpaDiameter', label: 'RPA diameter', unit: 'mm', decimals: 0, extractedParam: 'RPA systolic diameter' },
  lpaDiameter: { key: 'lpaDiameter', label: 'LPA diameter', unit: 'mm', decimals: 0, extractedParam: 'LPA systolic diameter' },
  pvEffectiveForwardFlow: { key: 'pvEffectiveForwardFlow', label: 'PV effective forward flow', unit: 'mL/beat', decimals: 0, extractedParam: 'PV effective forward flow (per heartbeat)' },
  pvForwardFlow: { key: 'pvForwardFlow', label: 'PV forward flow', unit: 'L/min', decimals: 1, extractedParam: 'PV forward flow (per minute)' },
  pvBackwardFlow: { key: 'pvBackwardFlow', label: 'PV backward flow', unit: 'mL/beat', decimals: 0, extractedParam: 'PV backward flow' },
  pvRegurgitantFraction: { key: 'pvRegurgitantFraction', label: 'PV regurgitant fraction', unit: '%', decimals: 0, extractedParam: 'PV regurgitant fraction' },
  peakVelocity: { key: 'peakVelocity', label: 'Peak velocity', unit: 'm/s', decimals: 1, extractedParam: 'PV maximum velocity' },
  maxPressureGradient: { key: 'maxPressureGradient', label: 'Maximum pressure gradient', unit: 'mmHg', decimals: 0, extractedParam: 'PV maximum pressure gradient' },
  meanPressureGradient: { key: 'meanPressureGradient', label: 'Mean pressure gradient', unit: 'mmHg', decimals: 0, extractedParam: 'PV mean pressure gradient' },
  trRegurgitantFraction: { key: 'trRegurgitantFraction', label: 'TR regurgitant fraction', unit: '%', decimals: 0, extractedParam: 'TR regurgitant fraction' },
  trRegurgitantVolume: { key: 'trRegurgitantVolume', label: 'TR regurgitant volume', unit: 'mL/beat', decimals: 0, extractedParam: 'TR volume (per heartbeat)' },
  mrRegurgitantFraction: { key: 'mrRegurgitantFraction', label: 'MR regurgitant fraction', unit: '%', decimals: 0, extractedParam: 'MR regurgitant fraction' },
  mrRegurgitantVolume: { key: 'mrRegurgitantVolume', label: 'MR regurgitant volume', unit: 'mL/beat', decimals: 0, extractedParam: 'MR volume (per heartbeat)' },
  prRegurgitantFraction: { key: 'prRegurgitantFraction', label: 'PR regurgitant fraction', unit: '%', decimals: 0, extractedParam: 'PV regurgitant fraction' },
  rvLvVolumeRatio: { key: 'rvLvVolumeRatio', label: 'RV/LV volume ratio', decimals: 2 },
  rpaDistension: { key: 'rpaDistension', label: 'RPA distension', unit: '%', decimals: 0, extractedParam: 'RPA distension' },
  lpaDistension: { key: 'lpaDistension', label: 'LPA distension', unit: '%', decimals: 0, extractedParam: 'LPA distension' },
  mainPaNetFlow: { key: 'mainPaNetFlow', label: 'Main PA net flow', unit: 'mL/beat', decimals: 0 },
  rpaNetFlow: { key: 'rpaNetFlow', label: 'RPA net flow', unit: 'mL/beat', decimals: 0 },
  lpaNetFlow: { key: 'lpaNetFlow', label: 'LPA net flow', unit: 'mL/beat', decimals: 0 },
  vortexDurationPercent: { key: 'vortexDurationPercent', label: 'Vortex duration', unit: '% cycle', decimals: 0 },
  rpaPercent: { key: 'rpaPercent', label: 'RPA %', unit: '%', decimals: 0 },
  lpaPercent: { key: 'lpaPercent', label: 'LPA %', unit: '%', decimals: 0 },
}

const RV_QUANT_KEYS: NumericKey[] = ['rvEdv', 'rvEdvi', 'rvEsv', 'rvEsvi', 'rvSv', 'rvSvi', 'rvEf', 'rvMass', 'rvMassIndex', 'rvCo', 'rvCi', 'raMaxVolume', 'raMaxVolumeIndex', 'lvEdvi', 'lvSvi', 'tapse']
const PA_QUANT_KEYS: NumericKey[] = ['mainPaDiameter', 'mainPaSystolicArea', 'mainPaDiastolicArea', 'paRelativeAreaChange', 'paDistensibility', 'rpaDiameter', 'lpaDiameter', 'pvEffectiveForwardFlow', 'pvForwardFlow', 'pvBackwardFlow', 'pvRegurgitantFraction', 'peakVelocity', 'maxPressureGradient', 'meanPressureGradient']
const VALVE_QUANT_KEYS: NumericKey[] = ['trRegurgitantFraction', 'trRegurgitantVolume', 'mrRegurgitantFraction', 'mrRegurgitantVolume']
const SEPTAL_FLATTENING_OPTIONS: Option<SeptalFlattening>[] = [
  { value: 'none', label: 'None' },
  { value: 'systolic', label: 'Systolic' },
  { value: 'diastolic', label: 'Diastolic' },
  { value: 'both', label: 'Both' },
]

const SEPTAL_MOTION_OPTIONS: Option<SeptalMotion>[] = [
  { value: 'normal', label: 'Normal' },
  { value: 'paradoxical', label: 'Paradoxical' },
  { value: 'dyskinetic', label: 'Dyskinetic' },
  { value: 'not-assessed', label: 'Not assessed' },
]

const INTERATRIAL_BOWING_OPTIONS: Option<InteratrialBowing>[] = [
  { value: 'none', label: 'None' },
  { value: 'toward-la', label: 'Toward LA' },
  { value: 'toward-ra', label: 'Toward RA' },
  { value: 'bidirectional', label: 'Bidirectional' },
  { value: 'not-assessed', label: 'Not assessed' },
]

const PERICARDIAL_EFFUSION_OPTIONS: Option<PericardialEffusion>[] = [
  { value: 'none', label: 'None' },
  { value: 'small', label: 'Small' },
  { value: 'moderate', label: 'Moderate' },
  { value: 'large', label: 'Large' },
]

const VENA_CAVA_OPTIONS: Option<VenaCavaState>[] = [
  { value: 'normal', label: 'Normal' },
  { value: 'dilated', label: 'Dilated' },
  { value: 'not-assessed', label: 'Not assessed' },
]

const REGURGITATION_SEVERITY_OPTIONS: Option<RegurgitationSeverity>[] = [
  { value: 'none', label: 'None' },
  { value: 'trivial', label: 'Trace' },
  { value: 'mild', label: 'Mild' },
  { value: 'moderate', label: 'Moderate' },
  { value: 'severe', label: 'Severe' },
]

const PRESENCE_OPTIONS: Option<PresenceState>[] = [
  { value: 'not-assessed', label: 'Not assessed' },
  { value: 'absent', label: 'Absent' },
  { value: 'present', label: 'Present' },
]

const ADVANCED_SEVERITY_OPTIONS: Option<AdvancedSeverity>[] = [
  { value: 'mild', label: 'Mild' },
  { value: 'moderate', label: 'Moderate' },
  { value: 'marked', label: 'Marked' },
]

const VORTEX_LOCATION_OPTIONS: Option<VortexLocation>[] = [
  { value: 'main-pa', label: 'MPA' },
  { value: 'main-pa-rpa', label: 'MPA -> RPA' },
  { value: 'main-pa-lpa', label: 'MPA -> LPA' },
  { value: 'branch-only', label: 'Branch only' },
  { value: 'diffuse-proximal-pa', label: 'Diffuse' },
  { value: 'not-specified', label: 'Unspecified' },
]

const HELICAL_FLOW_LOCATION_OPTIONS: Option<HelicalFlowLocation>[] = [
  { value: 'rvot-mpa', label: 'RVOT-MPA' },
  { value: 'central-mpa', label: 'MPA' },
  { value: 'rpa', label: 'RPA' },
  { value: 'lpa', label: 'LPA' },
  { value: 'diffuse-proximal-pa', label: 'Diffuse' },
  { value: 'not-specified', label: 'Unspecified' },
]

const PH_SECTION_TILES: Array<{ id: PhSectionId; title: string }> = [
  { id: 'summary', title: 'PH summary' },
  { id: 'rv', title: 'RV size & function' },
  { id: 'signs', title: 'Septal / right heart signs' },
  { id: 'pa-flow', title: 'Pulmonary artery & flow' },
  { id: 'valves', title: 'Valvular context' },
  { id: '4d-flow', title: '4D Flow' },
]

function normalizePhSectionId(value: unknown): PhSectionId {
  if (value === 'summary' || value === 'rv' || value === 'signs' || value === 'pa-flow' || value === 'valves' || value === '4d-flow') {
    return value
  }
  return 'rv'
}

function parseNumber(value: string | number | null | undefined): number | null {
  if (value === null || value === undefined || value === '') return null
  const parsed = typeof value === 'number' ? value : Number(value)
  return Number.isFinite(parsed) ? parsed : null
}

function normalizeStoredRegurgitationSeverity(value: unknown): RegurgitationSeverity {
  return normalizePhRegurgitationChoice(value as RegurgitationSeverity | 'trace' | null | undefined) ?? 'none'
}

function normalizeStoredVortexLocation(value: unknown): VortexLocation {
  switch (value) {
    case 'main-pa':
    case 'main-pa-rpa':
    case 'main-pa-lpa':
    case 'branch-only':
    case 'diffuse-proximal-pa':
    case 'not-specified':
      return value
    default:
      return 'not-specified'
  }
}

function normalizeStoredHelicalFlowLocation(value: unknown): HelicalFlowLocation {
  switch (value) {
    case 'rvot-mpa':
    case 'central-mpa':
    case 'rpa':
    case 'lpa':
    case 'diffuse-proximal-pa':
    case 'not-specified':
      return value
    default:
      return 'not-specified'
  }
}

function round(value: number, decimals: number): number {
  const factor = 10 ** decimals
  return Math.round(value * factor) / factor
}

function formatNumber(value: number | null | undefined, decimals: number = 0): string {
  if (value === null || value === undefined || Number.isNaN(value)) return ''
  const rounded = round(value, decimals)
  if (Number.isInteger(rounded)) return String(rounded)
  return rounded.toFixed(decimals).replace(/\.?0+$/, '')
}

function fmtRow(values: (number | null)[], decimals: number = 0): string[] {
  return values.map((value) => {
    if (value === null) return '\u2014'
    return formatNumber(value, decimals)
  })
}

function DirectionIndicator({ dir }: { dir: string }) {
  if (dir === 'high') return <span className="text-[hsl(var(--tone-danger-500))]" title="Abnormal if high">&#9650;</span>
  if (dir === 'low') return <span className="text-[hsl(var(--tone-accent-500))]" title="Abnormal if low">&#9660;</span>
  if (dir === 'both') return <span className="text-[hsl(var(--tone-warning-500))]" title="Abnormal if high or low">&#9670;</span>
  return null
}

function FieldLabel({ children }: { children: React.ReactNode }) {
  return <span className="house-field-label">{children}</span>
}

function SectionCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="overflow-hidden rounded-xl border border-border/50 bg-card">
      <div className="flex items-center gap-3 border-b border-border/30 px-5 py-3">
        <SectionMarker tone="report" size="title" className="self-stretch h-auto" />
        <h2 className="flex-1 text-sm font-semibold text-foreground">{title}</h2>
      </div>
      <div className="p-5">{children}</div>
    </section>
  )
}

function QuantitativeSection({
  title,
  children,
}: {
  title: string
  children: React.ReactNode
}) {
  return (
    <section className="scroll-mt-20">
      <div className="flex w-full items-stretch overflow-hidden rounded-t-lg border border-[hsl(var(--stroke-soft)/0.72)] bg-[hsl(var(--tone-neutral-50))]">
        <div className="w-1 shrink-0 bg-[hsl(var(--section-style-report-accent))]" />
        <div className="flex flex-1 items-center gap-2.5 px-3.5 py-3">
          <h2 className="flex-1 text-sm font-semibold tracking-tight text-[hsl(var(--foreground))]">
            {title}
          </h2>
        </div>
      </div>
      <div className="overflow-hidden rounded-b-lg border-x border-b border-[hsl(var(--stroke-soft)/0.72)] bg-white">
        {children}
      </div>
    </section>
  )
}

function Subsection({ title, children, className }: { title: string; children: React.ReactNode; className?: string }) {
  return (
    <div className={cn('rounded-lg border border-border/40 bg-background/60 p-4', className)}>
      <div className="mb-4">
        <FieldLabel>{title}</FieldLabel>
      </div>
      {children}
    </div>
  )
}

function SectionNavTile({
  title,
  selected,
  onClick,
}: {
  title: string
  selected: boolean
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'group relative flex min-h-[104px] flex-col items-start justify-between rounded-xl border p-4 text-left transition-all',
        'hover:shadow-md hover:border-foreground/20',
        selected
          ? 'border-foreground/30 bg-muted/60 shadow-sm'
          : 'border-border/50 bg-card',
      )}
    >
      <span
        className={cn(
          'h-1.5 w-10 rounded-full transition-colors',
          selected ? 'bg-[hsl(var(--section-style-report-accent))]' : 'bg-[hsl(var(--tone-neutral-200))]',
        )}
      />
      <div className="flex flex-col gap-1">
        <span className="text-sm font-semibold text-foreground">{title}</span>
      </div>
    </button>
  )
}

function ValveDetailCard({
  title,
  metrics,
  severity,
  severityLabel,
  emptyText = 'No valve-specific values available.',
}: {
  title: string
  metrics: ValveDetailCardMetric[]
  severity?: ValveRfSeverity | null
  severityLabel?: string | null
  emptyText?: string
}) {
  const resolvedSeverityLabel =
    severityLabel ?? (severity == null ? null : REGURGITATION_SEVERITY_LABELS[severity])

  return (
    <div className="rounded-lg border border-border/40 bg-background/60 p-4">
      <div className="mb-4 flex items-center justify-between gap-3">
        <FieldLabel>{title}</FieldLabel>
        {resolvedSeverityLabel && (
          <span
            className={cn(
              'rounded-full px-2.5 py-0.5 text-[11px] font-semibold ring-1 ring-inset',
              severity === 'none' && 'bg-[hsl(162_22%_90%)] text-[hsl(164_30%_28%)] ring-[hsl(163_22%_80%)]',
              severity === 'trivial' && 'bg-[hsl(162_22%_90%)] text-[hsl(164_30%_28%)] ring-[hsl(163_22%_80%)]',
              severity === 'mild' && 'bg-[hsl(38_40%_90%)] text-[hsl(34_50%_35%)] ring-[hsl(36_36%_80%)]',
              severity === 'moderate' && 'bg-[hsl(16_45%_86%)] text-[hsl(5_48%_32%)] ring-[hsl(10_32%_76%)]',
              severity === 'severe' && 'bg-[hsl(2_52%_25%)] text-white ring-[hsl(2_52%_20%)]',
            )}
          >
            {resolvedSeverityLabel}
          </span>
        )}
      </div>
      {metrics.length > 0 ? (
        <div className="grid gap-3">
          {metrics.map((metric) => (
            <div key={metric.label} className="flex items-center justify-between gap-4">
              <span className="text-sm text-[hsl(var(--muted-foreground))]">{metric.label}</span>
              <span className="text-sm font-semibold tabular-nums text-[hsl(var(--foreground))]">{metric.value}</span>
            </div>
          ))}
        </div>
      ) : (
        <p className="text-sm italic text-[hsl(var(--muted-foreground))]">{emptyText}</p>
      )}
    </div>
  )
}

function buildValveSeverityPillLabel(
  lesionLabel: 'TR' | 'MR',
  severity: ValveRfSeverity | null | undefined,
): string {
  if (severity == null) return lesionLabel
  if (severity === 'none') return `No ${lesionLabel}`
  return `${REGURGITATION_SEVERITY_LABELS[severity]} ${lesionLabel}`
}

function MeasurementRow({
  field,
  value,
  onChange,
}: {
  field: NumericFieldDef
  value: string
  onChange: (value: string) => void
}) {
  return (
    <label className="grid grid-cols-[minmax(0,1fr)_5.5rem_auto] items-center gap-x-2 gap-y-1">
      <span className="text-sm text-[hsl(var(--foreground))]">{field.label}</span>
      <input
        type="text"
        inputMode="decimal"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder="-"
        className="house-input h-8 w-full rounded-md px-2.5 text-xs"
      />
      <span className="text-sm text-[hsl(var(--muted-foreground))]">{field.unit ?? ''}</span>
    </label>
  )
}

function ChoicePills<T extends string>({
  options,
  value,
  onChange,
}: {
  options: Option<T>[]
  value: T
  onChange: (value: T) => void
}) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {options.map((option) => {
        const selected = value === option.value
        return (
          <button
            key={option.value}
            type="button"
            onClick={() => onChange(option.value)}
            className={cn(
              'rounded-full px-3 py-1 text-xs font-medium transition-all',
              selected
                ? 'bg-[hsl(var(--tone-neutral-900))] text-white shadow-sm'
                : 'bg-[hsl(var(--tone-neutral-50))] text-[hsl(var(--tone-neutral-600))] ring-1 ring-inset ring-[hsl(var(--stroke-soft)/0.5)] hover:bg-[hsl(var(--tone-neutral-100))]',
            )}
          >
            {option.label}
          </button>
        )
      })}
    </div>
  )
}

function TextareaField({
  label,
  value,
  onChange,
  placeholder,
}: {
  label: string
  value: string
  onChange: (value: string) => void
  placeholder: string
}) {
  return (
    <label className="grid gap-2">
      <FieldLabel>{label}</FieldLabel>
      <textarea
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        className="house-textarea min-h-24 rounded-lg px-3 py-2.5 text-sm"
      />
    </label>
  )
}

function CmrTooltip({ text, children }: { text: string; children: React.ReactNode }) {
  return (
    <span className="group/tip relative inline-flex">
      {children}
      <span className="pointer-events-none absolute bottom-full left-1/2 z-50 mb-2 -translate-x-1/2 whitespace-nowrap rounded-md bg-[hsl(var(--foreground))] px-2.5 py-1.5 text-[11px] font-medium text-white opacity-0 shadow-lg transition-opacity duration-150 group-hover/tip:opacity-100">
        {text}
        <span className="absolute left-1/2 -bottom-1 h-2 w-2 -translate-x-1/2 rotate-45 bg-[hsl(var(--foreground))]" />
      </span>
    </span>
  )
}

function PillToggle({
  options,
  value,
  onChange,
  compact,
}: {
  options: { key: string; label: React.ReactNode; tooltip?: string }[]
  value: string
  onChange: (key: string) => void
  compact?: boolean
}) {
  return (
    <div className="flex rounded-full bg-[hsl(var(--tone-danger-100)/0.5)] p-0.5 ring-1 ring-[hsl(var(--tone-danger-200)/0.5)]">
      {options.map((option) => {
        const button = (
          <button
            key={option.key}
            type="button"
            onClick={() => onChange(option.key)}
            className={cn(
              'flex items-center gap-1 rounded-full py-1.5 text-xs font-medium transition-all',
              compact ? 'px-2.5' : 'px-4',
              value === option.key
                ? 'bg-[hsl(var(--section-style-report-accent))] text-white shadow-sm'
                : 'text-[hsl(var(--tone-danger-600))] hover:text-[hsl(var(--tone-danger-800))]',
            )}
          >
            {option.label}
          </button>
        )
        return option.tooltip ? (
          <CmrTooltip key={option.key} text={option.tooltip}>
            {button}
          </CmrTooltip>
        ) : button
      })}
    </div>
  )
}

function ChartIcon({ className }: { className?: string }) {
  return (
    <svg className={cn('h-3.5 w-3.5', className)} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <rect x="1" y="8" width="3" height="7" rx="0.5" />
      <rect x="6.5" y="4" width="3" height="11" rx="0.5" />
      <rect x="12" y="1" width="3" height="14" rx="0.5" />
    </svg>
  )
}

function RecordedIcon() {
  return <span className="text-[10px] font-bold tabular-nums tracking-tight">123</span>
}

function BsaIcon() {
  return <span className="text-[10px] font-semibold tracking-wide">BSA</span>
}

function BsaOffIcon() {
  return <span className="relative text-[10px] font-semibold tracking-wide opacity-60">BSA<span className="absolute inset-0 flex items-center"><span className="block h-[1.5px] w-full rotate-[-20deg] bg-current" /></span></span>
}

function AllRowsIcon({ className }: { className?: string }) {
  return (
    <svg className={cn('h-3.5 w-3.5', className)} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
      <line x1="1" y1="4" x2="15" y2="4" />
      <line x1="1" y1="8" x2="15" y2="8" />
      <line x1="1" y1="12" x2="15" y2="12" />
    </svg>
  )
}

function SeverityIcon({ className }: { className?: string }) {
  return (
    <svg className={cn('h-3.5 w-3.5', className)} viewBox="0 0 16 16" fill="currentColor">
      <circle cx="3.5" cy="3.5" r="3" fill="hsl(158 30% 50%)" />
      <circle cx="12.5" cy="3.5" r="3" fill="hsl(38 60% 55%)" />
      <circle cx="8" cy="12" r="3" fill="hsl(4 55% 50%)" />
    </svg>
  )
}

function SeverityOffIcon({ className }: { className?: string }) {
  return (
    <svg className={cn('h-3.5 w-3.5', className)} viewBox="0 0 16 16" fill="currentColor" stroke="currentColor">
      <circle cx="3.5" cy="3.5" r="3" fill="hsl(158 30% 50%)" opacity="0.35" />
      <circle cx="12.5" cy="3.5" r="3" fill="hsl(38 60% 55%)" opacity="0.35" />
      <circle cx="8" cy="12" r="3" fill="hsl(4 55% 50%)" opacity="0.35" />
      <line x1="1" y1="1" x2="15" y2="15" strokeWidth="2" strokeLinecap="round" />
    </svg>
  )
}

function ChartOffIcon({ className }: { className?: string }) {
  return (
    <svg className={cn('h-3.5 w-3.5', className)} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <rect x="1" y="8" width="3" height="7" rx="0.5" opacity="0.4" />
      <rect x="6.5" y="4" width="3" height="11" rx="0.5" opacity="0.4" />
      <rect x="12" y="1" width="3" height="14" rx="0.5" opacity="0.4" />
      <line x1="2" y1="2" x2="14" y2="14" strokeWidth="2" />
    </svg>
  )
}

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
      'inline-flex cursor-pointer items-center gap-1.5 rounded-md border px-2.5 py-1.5 text-[11px] font-medium transition-colors',
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

function BsaPill() {
  return (
    <span className="ml-1.5 inline-flex items-center rounded-full bg-[hsl(var(--tone-neutral-200))] px-[7px] py-[1px] text-[10px] font-semibold tracking-wide text-[hsl(var(--tone-neutral-600))]">
      BSA
    </span>
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

  return (
    <div className="group/chart relative mx-[5px] h-[22px] w-[calc(100%-10px)]">
      <div className="absolute inset-x-0 top-1/2 h-[2px] -translate-y-1/2 rounded-sm bg-[hsl(var(--tone-neutral-300))]" />
      <div
        className="absolute top-1/2 h-4 -translate-y-1/2 rounded border border-[hsl(var(--tone-positive-300)/0.18)] bg-[hsl(var(--tone-positive-300)/0.14)] transition-all duration-200 group-hover/chart:border-[hsl(var(--tone-positive-500)/0.25)] group-hover/chart:bg-[hsl(var(--tone-positive-300)/0.28)] group-hover/chart:shadow-[0_0_12px_hsl(var(--tone-positive-300)/0.15)]"
        style={{ left: `${rangeStart * 100}%`, width: `${rangeWidth * 100}%` }}
      />
      <div
        className={cn(
          'absolute top-1/2 h-[10px] w-[10px] -translate-x-1/2 -translate-y-1/2 rounded-full border-2 transition-all duration-200',
          abnormal
            ? 'border-[hsl(var(--tone-danger-500))] bg-white shadow-[0_1px_3px_hsl(var(--tone-danger-600)/0.15)] group-hover/chart:bg-[hsl(var(--tone-danger-500))] group-hover/chart:shadow-[0_0_0_3px_hsl(var(--tone-danger-500)/0.2),0_0_8px_hsl(var(--tone-danger-500)/0.3)]'
            : 'border-[hsl(var(--tone-positive-500))] bg-white shadow-[0_1px_3px_hsl(var(--tone-positive-600)/0.15)] group-hover/chart:bg-[hsl(var(--tone-positive-500))] group-hover/chart:shadow-[0_0_0_3px_hsl(var(--tone-positive-500)/0.2),0_0_8px_hsl(var(--tone-positive-500)/0.3)]',
        )}
        style={{ left: `${measuredPos * 100}%` }}
      />
    </div>
  )
}

function QuantitativeParameterDrilldown({
  row,
  onClose,
}: {
  row: QuantitativeDisplayRow
  onClose: () => void
}) {
  const param = row.canonical
  if (!param) return null

  const decimals = param.decimal_places ?? row.field.decimals ?? 0
  const [fLL, fMean, fUL, fSD] = fmtRow([param.ll, param.mean, param.ul, param.sd], decimals)

  let status: 'normal' | 'abnormal' | undefined
  if (row.value !== null) {
    const dir = param.abnormal_direction
    if (dir === 'high' && param.ul !== null && row.value > param.ul) status = 'abnormal'
    else if (dir === 'low' && param.ll !== null && row.value < param.ll) status = 'abnormal'
    else if (dir === 'both' && ((param.ul !== null && row.value > param.ul) || (param.ll !== null && row.value < param.ll))) status = 'abnormal'
    else status = 'normal'
  }

  return (
    <DrilldownSheet open onOpenChange={(open) => { if (!open) onClose() }}>
      <DrilldownSheet.Header title={row.field.label} variant="workspace">
        <p className="mt-0.5 text-xs text-[hsl(var(--muted-foreground))]">
          {param.major_section} &rsaquo; {param.sub_section || 'Reference values'}
        </p>
      </DrilldownSheet.Header>

      <DrilldownSheet.Content>
        {row.value !== null && (
          <div className="space-y-2">
            <DrilldownSheet.Heading>Measured Value</DrilldownSheet.Heading>
            <div
              className={cn(
                'rounded-lg border-2 p-4 text-center',
                status === 'abnormal'
                  ? 'border-[hsl(var(--tone-danger-300))] bg-[hsl(var(--tone-danger-50))]'
                  : 'border-[hsl(var(--tone-positive-300))] bg-[hsl(var(--tone-positive-50))]',
              )}
            >
              <p
                className={cn(
                  'text-3xl font-bold tabular-nums',
                  status === 'abnormal'
                    ? 'text-[hsl(var(--tone-danger-600))]'
                    : 'text-[hsl(var(--tone-positive-600))]',
                )}
              >
                {formatNumber(row.value, decimals)}
              </p>
              <p className="mt-1 text-sm text-[hsl(var(--muted-foreground))]">
                {row.field.unit || param.unit}
                {status ? ` · ${status === 'abnormal' ? 'Outside reference range' : 'Within reference range'}` : ''}
              </p>
            </div>
          </div>
        )}

        <div className="space-y-4">
          <DrilldownSheet.Heading>Reference Values</DrilldownSheet.Heading>
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

        <div className="mt-6 space-y-3">
          <DrilldownSheet.Heading>Sources</DrilldownSheet.Heading>
          {param.sources.length > 0 ? (
            <div className="space-y-3">
              {param.sources.map((source) => (
                <a
                  key={source.doi}
                  href={source.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="block rounded-lg border border-[hsl(var(--stroke-soft)/0.72)] p-3 transition-colors hover:border-[hsl(var(--tone-positive-300))] hover:bg-[hsl(var(--tone-positive-50)/0.5)]"
                >
                  <div className="flex items-start gap-2">
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium leading-snug text-[hsl(var(--foreground))]">{source.short_ref}</p>
                      <p className="mt-1 text-xs leading-relaxed text-[hsl(var(--muted-foreground))]">{source.title}</p>
                      <p className="mt-1 text-xs text-[hsl(var(--tone-neutral-400))]">{source.journal}</p>
                    </div>
                    <ExternalLink className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[hsl(var(--muted-foreground))]" />
                  </div>
                </a>
              ))}
            </div>
          ) : (
            <p className="text-sm italic text-[hsl(var(--muted-foreground))]">No sources linked yet.</p>
          )}
        </div>
      </DrilldownSheet.Content>
    </DrilldownSheet>
  )
}

function QuantitativeTable({
  rows,
  chartMode,
  severityMode,
  rangeParams,
  onSelectRow,
  framed = true,
}: {
  rows: QuantitativeDisplayRow[]
  chartMode: 'off' | 'on'
  severityMode: 'off' | 'abnormal'
  rangeParams: Map<string, RangeParam>
  onSelectRow: (row: QuantitativeDisplayRow) => void
  framed?: boolean
}) {
  return (
    <div className={cn(framed && 'overflow-hidden rounded-lg border border-[hsl(var(--stroke-soft)/0.72)]')}>
      <table data-house-no-column-resize="true" className="w-full table-fixed border-collapse text-sm">
        <colgroup>
          <col style={{ width: chartMode === 'on' ? '28%' : '31%' }} />
          <col style={{ width: chartMode === 'on' ? '8%' : '10%' }} />
          <col style={{ width: chartMode === 'on' ? '9%' : '11%' }} />
          <col style={{ width: chartMode === 'on' ? '8%' : '10%' }} />
          <col style={{ width: chartMode === 'on' ? '8%' : '10%' }} />
          <col style={{ width: chartMode === 'on' ? '8%' : '10%' }} />
          <col style={{ width: chartMode === 'on' ? '15%' : '18%' }} />
          {chartMode === 'on' && <col style={{ width: '24%' }} />}
        </colgroup>
        <thead>
          <tr className="border-b-2 border-[hsl(var(--tone-neutral-300))] bg-[hsl(var(--tone-neutral-50))]">
            <th className="house-table-head-text px-3 py-2 text-left">Parameter</th>
            <th className="house-table-head-text px-3 py-2 text-center">Unit</th>
            <th className="house-table-head-text px-3 py-2 text-center">Measured</th>
            <th className="house-table-head-text px-3 py-2 text-center">LL</th>
            <th className="house-table-head-text px-3 py-2 text-center">Mean</th>
            <th className="house-table-head-text px-3 py-2 text-center">UL</th>
            <th className="house-table-head-text px-3 py-2 text-center">Interpretation</th>
            {chartMode === 'on' && <th className="house-table-head-text px-3 py-2 text-center">Range</th>}
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 ? (
            <tr>
              <td colSpan={chartMode === 'on' ? 8 : 7} className="px-4 py-5 text-center text-sm text-[hsl(var(--muted-foreground))]">
                No quantitative values available for the current filters.
              </td>
            </tr>
          ) : rows.map((row) => {
            const decimals = row.canonical?.decimal_places ?? row.field.decimals ?? 0
            const hasMeasured = row.value !== null
            const [fLL, fMean, fUL] = fmtRow([row.canonical?.ll ?? null, row.canonical?.mean ?? null, row.canonical?.ul ?? null], decimals)

            let severity: SeverityResult | null = null
            if (hasMeasured && row.canonical) {
              severity = computeSeverity(
                row.value!,
                row.canonical.ll,
                row.canonical.ul,
                row.canonical.sd,
                row.canonical.abnormal_direction,
                (row.canonical.severity_label as SeverityLabelType) ?? inferSeverityLabel(row.canonical.parameter_key, row.canonical.major_section, row.canonical.sub_section),
                row.canonical.severity_thresholds ?? null,
                row.canonical.severity_label_override ?? null,
              )
            }

            const interactive = !!row.canonical
            const severityClass =
              severityMode === 'abnormal' && hasMeasured && severity
                ? cn(
                    severity.grade === 'normal' && 'bg-[hsl(158_30%_94%)] hover:bg-[hsl(158_30%_91%)]',
                    severity.grade === 'mild' && 'bg-[hsl(46_60%_91%)] hover:bg-[hsl(46_60%_88%)]',
                    severity.grade === 'moderate' && 'bg-[hsl(20_55%_87%)] hover:bg-[hsl(20_55%_84%)]',
                    severity.grade === 'severe' && 'bg-[hsl(4_55%_82%)] hover:bg-[hsl(4_55%_79%)]',
                  )
                : interactive
                  ? 'hover:bg-[hsl(var(--tone-neutral-50)/0.65)]'
                  : ''

            return (
              <tr
                key={row.key}
                onClick={interactive ? () => onSelectRow(row) : undefined}
                className={cn('border-b border-[hsl(var(--stroke-soft)/0.4)] transition-colors duration-100', interactive && 'cursor-pointer', severityClass)}
              >
                <td className="house-table-cell-text whitespace-nowrap px-3 py-2 font-medium text-[hsl(var(--foreground))]">
                  {row.field.label}
                  {row.canonical?.indexing === 'BSA' && <BsaPill />}
                </td>
                <td className="house-table-cell-text whitespace-nowrap px-3 py-2 text-center text-[hsl(var(--tone-neutral-500))]">
                  {row.canonical?.unit ?? row.field.unit ?? '\u2014'}
                </td>
                <td className={cn('house-table-cell-text whitespace-nowrap px-3 py-2 text-center tabular-nums font-semibold', !hasMeasured && 'text-[hsl(var(--tone-neutral-300))]')}>
                  {hasMeasured ? formatNumber(row.value, decimals) : '\u2014'}
                </td>
                <td className="house-table-cell-text whitespace-nowrap px-3 py-2 text-center tabular-nums">{fLL}</td>
                <td className="house-table-cell-text whitespace-nowrap px-3 py-2 text-center tabular-nums font-medium">{fMean}</td>
                <td className="house-table-cell-text whitespace-nowrap px-3 py-2 text-center tabular-nums">{fUL}</td>
                <td className="house-table-cell-text whitespace-nowrap px-3 py-0 text-center align-middle">
                  {hasMeasured && severity ? (
                    <span
                      className={cn(
                        'inline-flex items-center rounded-full px-2.5 py-0.5 text-[11px] font-semibold ring-1 ring-inset',
                        severity.grade === 'normal' && 'bg-[hsl(162_22%_90%)] text-[hsl(164_30%_28%)] ring-[hsl(163_22%_80%)]',
                        severity.grade === 'mild' && 'bg-[hsl(38_40%_90%)] text-[hsl(34_50%_35%)] ring-[hsl(36_36%_80%)]',
                        severity.grade === 'moderate' && 'bg-[hsl(16_45%_86%)] text-[hsl(5_48%_32%)] ring-[hsl(10_32%_76%)]',
                        severity.grade === 'severe' && 'bg-[hsl(2_52%_25%)] text-white ring-[hsl(2_52%_20%)]',
                      )}
                    >
                      {severity.label}
                    </span>
                  ) : hasMeasured ? (
                    <span className="inline-flex items-center rounded-full bg-[hsl(var(--tone-neutral-100))] px-2.5 py-0.5 text-[11px] font-semibold text-[hsl(var(--tone-neutral-600))] ring-1 ring-inset ring-[hsl(var(--stroke-soft)/0.6)]">
                      Derived
                    </span>
                  ) : (
                    '\u2014'
                  )}
                </td>
                {chartMode === 'on' && (
                  <td className="bg-white px-2 py-1">
                    {hasMeasured && row.canonical && hasValidRange(row.canonical.ll, row.canonical.ul) ? (
                      <RangeChart
                        measured={row.value!}
                        ll={row.canonical.ll!}
                        ul={row.canonical.ul!}
                        direction={row.canonical.abnormal_direction}
                        rangeStart={(rangeParams.get(row.key) ?? rangeParams.get('__global__') ?? factoryBaseline()).rangeStart}
                        rangeWidth={(rangeParams.get(row.key) ?? rangeParams.get('__global__') ?? factoryBaseline()).rangeWidth}
                      />
                    ) : null}
                  </td>
                )}
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

export function CmrPhPage() {
  const extraction = useSyncExternalStore(subscribeExtractionResult, getExtractionResult)
  const activeCase = useCmrCaseStore((state) => state.activeCase)
  const patchActiveCasePayload = useCmrCaseStore((state) => state.patchActiveCasePayload)
  const initialPh = activeCase?.payload.ph
  const demographics = extraction?.demographics ?? {}
  const sex = demographics.sex ?? 'Male'
  const age = demographics.age ?? undefined
  const bsa = demographics.bsa ?? null
  const heartRate = demographics.heart_rate ?? null

  const [referenceData, setReferenceData] = useState<CmrCanonicalTableResponse | null>(null)
  const [referenceLoading, setReferenceLoading] = useState(true)
  const [referencePreset, setReferencePreset] = useState<CmrReferencePreset>('standard')
  const [showFilter, setShowFilter] = useState<'all' | 'recorded'>(() => initialPh?.showFilter ?? 'recorded')
  const [indexFilter, setIndexFilter] = useState<'all' | 'indexed'>(() => initialPh?.indexFilter ?? 'all')
  const [abnormalFilter, setAbnormalFilter] = useState<'all' | 'abnormal'>(() => initialPh?.abnormalFilter ?? 'all')
  const [chartMode, setChartMode] = useState<'off' | 'on'>(() => initialPh?.chartMode ?? 'on')
  const [severityMode, setSeverityMode] = useState<'off' | 'abnormal'>(() => initialPh?.severityMode ?? 'off')
  const [rangeParams, setRangeParams] = useState<Map<string, RangeParam>>(() => rangeParamRecordToMap(initialPh?.rangeParams))
  const [scalingMode, setScalingMode] = useState<'factory' | 'global' | 'per-meas'>(() => initialPh?.scalingMode ?? 'global')
  const [selectedRow, setSelectedRow] = useState<QuantitativeDisplayRow | null>(null)
  const [manualNumeric, setManualNumeric] = useState<Partial<Record<NumericKey, string>>>(() => initialPh?.manualNumeric as Partial<Record<NumericKey, string>> ?? {})
  const [phSummary, setPhSummary] = useState<{ llmProse: string | null; llmProseSourceSignature: string | null }>(() => ({
    llmProse: initialPh?.llmProse ?? null,
    llmProseSourceSignature: initialPh?.llmProseSourceSignature ?? null,
  }))
  const [isGeneratingPhSummary, setIsGeneratingPhSummary] = useState(false)
  const [phSummaryError, setPhSummaryError] = useState<string | null>(null)

  const [choices, setChoices] = useState<ChoiceState>({
    septalFlattening: (initialPh?.choices.septalFlattening as ChoiceState['septalFlattening'] | undefined) ?? 'none',
    septalMotion: (initialPh?.choices.septalMotion as ChoiceState['septalMotion'] | undefined) ?? 'normal',
    interatrialSeptalBowing: (initialPh?.choices.interatrialSeptalBowing as ChoiceState['interatrialSeptalBowing'] | undefined) ?? 'none',
    pericardialEffusion: (initialPh?.choices.pericardialEffusion as ChoiceState['pericardialEffusion'] | undefined) ?? 'none',
    venaCava: (initialPh?.choices.venaCava as ChoiceState['venaCava'] | undefined) ?? 'normal',
    trSeverity: normalizeStoredRegurgitationSeverity(initialPh?.choices.trSeverity),
    mrSeverity: normalizeStoredRegurgitationSeverity(initialPh?.choices.mrSeverity),
    prSeverity: normalizeStoredRegurgitationSeverity(initialPh?.choices.prSeverity),
    vortexFormation: (initialPh?.choices.vortexFormation as ChoiceState['vortexFormation'] | undefined) ?? 'not-assessed',
    vortexSeverity: (initialPh?.choices.vortexSeverity as ChoiceState['vortexSeverity'] | undefined) ?? null,
    vortexLocation: normalizeStoredVortexLocation(initialPh?.choices.vortexLocation),
    helicity: (initialPh?.choices.helicity as ChoiceState['helicity'] | undefined) ?? 'not-assessed',
    helicitySeverity: (initialPh?.choices.helicitySeverity as ChoiceState['helicitySeverity'] | undefined) ?? null,
    helicityLocation: normalizeStoredHelicalFlowLocation(initialPh?.choices.helicityLocation),
  })
  const [texts, setTexts] = useState<TextState>({
    ancillaryFindings: initialPh?.texts.ancillaryFindings ?? '',
    additionalDetails: initialPh?.texts.additionalDetails ?? '',
    flowComment: initialPh?.texts.flowComment ?? '',
  })
  const [selectedSection, setSelectedSection] = useState<PhSectionId>(
    () => normalizePhSectionId(initialPh?.selectedSection),
  )

  useEffect(() => {
    const nextPh = activeCase?.payload.ph
    setShowFilter(nextPh?.showFilter ?? 'recorded')
    setIndexFilter(nextPh?.indexFilter ?? 'all')
    setAbnormalFilter(nextPh?.abnormalFilter ?? 'all')
    setChartMode(nextPh?.chartMode ?? 'on')
    setSeverityMode(nextPh?.severityMode ?? 'off')
    setScalingMode(nextPh?.scalingMode ?? 'global')
    setRangeParams(rangeParamRecordToMap(nextPh?.rangeParams))
    setManualNumeric((nextPh?.manualNumeric as Partial<Record<NumericKey, string>> | undefined) ?? {})
    setPhSummary({
      llmProse: nextPh?.llmProse ?? null,
      llmProseSourceSignature: nextPh?.llmProseSourceSignature ?? null,
    })
    setIsGeneratingPhSummary(false)
    setPhSummaryError(null)
    setChoices({
      septalFlattening: (nextPh?.choices.septalFlattening as ChoiceState['septalFlattening'] | undefined) ?? 'none',
      septalMotion: (nextPh?.choices.septalMotion as ChoiceState['septalMotion'] | undefined) ?? 'normal',
      interatrialSeptalBowing: (nextPh?.choices.interatrialSeptalBowing as ChoiceState['interatrialSeptalBowing'] | undefined) ?? 'none',
      pericardialEffusion: (nextPh?.choices.pericardialEffusion as ChoiceState['pericardialEffusion'] | undefined) ?? 'none',
      venaCava: (nextPh?.choices.venaCava as ChoiceState['venaCava'] | undefined) ?? 'normal',
      trSeverity: normalizeStoredRegurgitationSeverity(nextPh?.choices.trSeverity),
      mrSeverity: normalizeStoredRegurgitationSeverity(nextPh?.choices.mrSeverity),
      prSeverity: normalizeStoredRegurgitationSeverity(nextPh?.choices.prSeverity),
      vortexFormation: (nextPh?.choices.vortexFormation as ChoiceState['vortexFormation'] | undefined) ?? 'not-assessed',
      vortexSeverity: (nextPh?.choices.vortexSeverity as ChoiceState['vortexSeverity'] | undefined) ?? null,
      vortexLocation: normalizeStoredVortexLocation(nextPh?.choices.vortexLocation),
      helicity: (nextPh?.choices.helicity as ChoiceState['helicity'] | undefined) ?? 'not-assessed',
      helicitySeverity: (nextPh?.choices.helicitySeverity as ChoiceState['helicitySeverity'] | undefined) ?? null,
      helicityLocation: normalizeStoredHelicalFlowLocation(nextPh?.choices.helicityLocation),
    })
    setTexts({
      ancillaryFindings: nextPh?.texts.ancillaryFindings ?? '',
      additionalDetails: nextPh?.texts.additionalDetails ?? '',
      flowComment: nextPh?.texts.flowComment ?? '',
    })
    setSelectedSection(normalizePhSectionId(nextPh?.selectedSection))
    setSelectedRow(null)
  }, [activeCase?.id])

  useEffect(() => {
    patchActiveCasePayload((payload) => ({
      ...payload,
      ph: {
        selectedSection,
        showFilter,
        indexFilter,
        abnormalFilter,
        chartMode,
        severityMode,
        scalingMode,
        rangeParams: rangeParamMapToRecord(rangeParams),
        manualNumeric: manualNumeric as Record<string, string>,
        choices: choices as Record<string, string | null>,
        texts,
        llmProse: phSummary.llmProse,
        llmProseSourceSignature: phSummary.llmProseSourceSignature,
      },
    }))
  }, [
    abnormalFilter,
    chartMode,
    choices,
    indexFilter,
    manualNumeric,
    patchActiveCasePayload,
    phSummary.llmProse,
    phSummary.llmProseSourceSignature,
    rangeParams,
    scalingMode,
    selectedSection,
    severityMode,
    showFilter,
    texts,
  ])

  useEffect(() => {
    let cancelled = false
    void fetchConfig().then((config) => {
      if (!cancelled) setReferencePreset(normalizeCmrReferencePreset(config.reference_preset))
    }).catch(() => {})
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    let cancelled = false
    setReferenceLoading(true)
    void fetchReferenceParameters(sex, age)
      .then((result) => {
        if (!cancelled) {
          setReferenceData({
            ...result,
            parameters: applyCmrReferencePreset(result.parameters, sex, referencePreset),
          })
        }
      })
      .catch(() => {
        if (!cancelled) setReferenceData(null)
      })
      .finally(() => {
        if (!cancelled) setReferenceLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [age, referencePreset, sex])

  const extractionMeasurements = useMemo(() => {
    const measurements = new Map<string, number>()
    for (const measurement of extraction?.measurements ?? []) {
      measurements.set(measurement.parameter, measurement.value)
    }
    return measurements
  }, [extraction])

  const readExtractionMeasurement = useCallback((...parameterKeys: string[]): number | null => {
    for (const parameterKey of parameterKeys) {
      const value = extractionMeasurements.get(parameterKey)
      if (value !== undefined) return value
    }
    return null
  }, [extractionMeasurements])

  const extractedNumeric = useMemo(() => {
    const next: Partial<Record<NumericKey, number>> = {}
    ;(Object.keys(NUMERIC_FIELDS) as NumericKey[]).forEach((key) => {
      const param = NUMERIC_FIELDS[key].extractedParam
      if (!param) return
      const value = extractionMeasurements.get(param)
      if (value !== undefined) next[key] = value
    })
    return next
  }, [extractionMeasurements])

  const getBaseNumeric = useCallback((key: NumericKey): number | null => {
    const manual = manualNumeric[key]
    if (manual !== undefined) return parseNumber(manual)
    return extractedNumeric[key] ?? null
  }, [extractedNumeric, manualNumeric])

  const derivedNumeric = useMemo(() => {
    const next: Partial<Record<NumericKey, number>> = {}
    const rvEdv = getBaseNumeric('rvEdv')
    const rvEsv = getBaseNumeric('rvEsv')
    const rvSv = extractedNumeric.rvSv ?? (rvEdv !== null && rvEsv !== null ? rvEdv - rvEsv : null)
    const rvCo = extractedNumeric.rvCo ?? (rvSv !== null && heartRate !== null ? (rvSv * heartRate) / 1000 : null)
    const mainPaSystolicArea = getBaseNumeric('mainPaSystolicArea')
    const mainPaDiastolicArea = getBaseNumeric('mainPaDiastolicArea')
    const pvForwardFlow = getBaseNumeric('pvForwardFlow')
    const pvBackwardFlow = getBaseNumeric('pvBackwardFlow')
    const peakVelocity = getBaseNumeric('peakVelocity')
    const rpaNetFlow = getBaseNumeric('rpaNetFlow')
    const lpaNetFlow = getBaseNumeric('lpaNetFlow')

    if (extractedNumeric.rvSv === undefined && rvSv !== null) next.rvSv = round(rvSv, 1)
    if (extractedNumeric.rvEf === undefined && rvSv !== null && rvEdv) next.rvEf = round((rvSv / rvEdv) * 100, 1)
    if (extractedNumeric.rvEdvi === undefined && rvEdv !== null && bsa) next.rvEdvi = round(rvEdv / bsa, 1)
    if (extractedNumeric.rvEsvi === undefined && rvEsv !== null && bsa) next.rvEsvi = round(rvEsv / bsa, 1)
    if (extractedNumeric.rvSvi === undefined && rvSv !== null && bsa) next.rvSvi = round(rvSv / bsa, 1)
    if (extractedNumeric.rvMassIndex === undefined && getBaseNumeric('rvMass') !== null && bsa) {
      next.rvMassIndex = round(getBaseNumeric('rvMass')! / bsa, 1)
    }
    if (extractedNumeric.rvCo === undefined && rvCo !== null) next.rvCo = round(rvCo, 1)
    if (extractedNumeric.rvCi === undefined && rvCo !== null && bsa) next.rvCi = round(rvCo / bsa, 1)
    if (extractedNumeric.raMaxVolumeIndex === undefined && getBaseNumeric('raMaxVolume') !== null && bsa) {
      next.raMaxVolumeIndex = round(getBaseNumeric('raMaxVolume')! / bsa, 1)
    }
    if (mainPaSystolicArea !== null && mainPaDiastolicArea) {
      next.paRelativeAreaChange = round(((mainPaSystolicArea - mainPaDiastolicArea) / mainPaDiastolicArea) * 100, 1)
    }
    if (extractedNumeric.paDistensibility === undefined && next.paRelativeAreaChange !== undefined) {
      next.paDistensibility = next.paRelativeAreaChange
    }
    if (extractedNumeric.pvRegurgitantFraction === undefined && pvForwardFlow !== null && pvBackwardFlow !== null && pvForwardFlow !== 0) {
      next.pvRegurgitantFraction = round((Math.abs(pvBackwardFlow) / pvForwardFlow) * 100, 1)
    }
    if (extractedNumeric.maxPressureGradient === undefined && peakVelocity !== null) {
      next.maxPressureGradient = round(4 * peakVelocity * peakVelocity, 1)
    }

    const rvEdvi = extractedNumeric.rvEdvi ?? next.rvEdvi ?? null
    const lvEdvi = getBaseNumeric('lvEdvi')
    if (rvEdvi !== null && lvEdvi) {
      next.rvLvVolumeRatio = round(rvEdvi / lvEdvi, 2)
    }

    if (rpaNetFlow !== null && lpaNetFlow !== null && rpaNetFlow + lpaNetFlow !== 0) {
      next.rpaPercent = round((rpaNetFlow / (rpaNetFlow + lpaNetFlow)) * 100, 1)
      next.lpaPercent = round((lpaNetFlow / (rpaNetFlow + lpaNetFlow)) * 100, 1)
    }

    return next
  }, [bsa, extractedNumeric, getBaseNumeric, heartRate])

  const resolveNumericNumber = useCallback((key: NumericKey): number | null => {
    const manual = manualNumeric[key]
    if (manual !== undefined) return parseNumber(manual)
    if (extractedNumeric[key] !== undefined) return extractedNumeric[key] ?? null
    if (derivedNumeric[key] !== undefined) return derivedNumeric[key] ?? null
    return null
  }, [derivedNumeric, extractedNumeric, manualNumeric])

  const resolveNumericValue = useCallback((key: NumericKey): string => {
    const manual = manualNumeric[key]
    if (manual !== undefined) return manual
    return formatNumber(resolveNumericNumber(key), NUMERIC_FIELDS[key].decimals)
  }, [manualNumeric, resolveNumericNumber])

  const phSupplementalMeasurements = useMemo(() => {
    const laMaxVolume = readExtractionMeasurement('LA max volume')
    const laMaxVolumeIndex = readExtractionMeasurement('LA max volume (i)')
      ?? (laMaxVolume !== null && bsa ? round(laMaxVolume / bsa, 1) : null)

    const lvMass = readExtractionMeasurement('LV mass')
    const pcwp = readExtractionMeasurement('PCWP')
      ?? (laMaxVolume !== null && lvMass !== null
        ? round(5.7591 + (0.07505 * laMaxVolume) + (0.05289 * lvMass) - (1.9927 * (sex === 'Male' ? 1 : 0)), 1)
        : null)

    const raMaxVolume = readExtractionMeasurement('RA max volume')
    const mrap = readExtractionMeasurement('mRAP')
      ?? (raMaxVolume !== null ? round(6.4547 + (0.05828 * raMaxVolume), 1) : null)

    return {
      laMaxVolumeIndex,
      pcwp,
      mrap,
      lvEf: readExtractionMeasurement('LV EF'),
    }
  }, [bsa, readExtractionMeasurement, sex])

  const updateManualNumeric = useCallback((key: NumericKey, value: string) => {
    setManualNumeric((prev) => {
      const next = { ...prev }
      if (value.trim() === '') delete next[key]
      else next[key] = value
      return next
    })
  }, [])

  const updateChoice = useCallback(<K extends keyof ChoiceState>(key: K, value: ChoiceState[K]) => {
    setChoices((prev) => ({ ...prev, [key]: value }))
  }, [])

  const updateText = useCallback(<K extends keyof TextState>(key: K, value: TextState[K]) => {
    setTexts((prev) => ({ ...prev, [key]: value }))
  }, [])

  const canonicalLookup = useMemo(() => {
    const map = new Map<string, CmrCanonicalParam>()
    for (const param of referenceData?.parameters ?? []) {
      map.set(param.parameter_key, param)
    }
    return map
  }, [referenceData])

  const buildRows = useCallback((keys: NumericKey[]): QuantitativeDisplayRow[] => (
    keys.map((key) => {
      const field = NUMERIC_FIELDS[key]
      return {
        key,
        field,
        value: resolveNumericNumber(key),
        canonical: field.extractedParam ? canonicalLookup.get(field.extractedParam) ?? null : null,
      }
    })
  ), [canonicalLookup, resolveNumericNumber])

  const rvRows = useMemo(() => buildRows(RV_QUANT_KEYS), [buildRows])
  const paRows = useMemo(() => buildRows(PA_QUANT_KEYS), [buildRows])
  const valveRows = useMemo(() => buildRows(VALVE_QUANT_KEYS), [buildRows])

  const allQuantRows = useMemo(() => [...rvRows, ...paRows, ...valveRows], [paRows, rvRows, valveRows])

  const filterRows = useCallback((rows: QuantitativeDisplayRow[]) => (
    rows.filter((row) => {
      if (showFilter === 'recorded' && row.value === null) return false
      if (indexFilter === 'indexed' && row.canonical?.indexing !== 'BSA') return false
      if (abnormalFilter === 'abnormal') {
        if (row.value === null || !row.canonical) return false
        return isAbnormalValue(row.value, row.canonical.ll, row.canonical.ul, row.canonical.abnormal_direction)
      }
      return true
    })
  ), [abnormalFilter, indexFilter, showFilter])

  const filteredRvRows = useMemo(() => filterRows(rvRows), [filterRows, rvRows])
  const filteredPaRows = useMemo(() => filterRows(paRows), [filterRows, paRows])
  const filteredValveRows = useMemo(() => filterRows(valveRows), [filterRows, valveRows])

  const activeQuantRows = useMemo(() => {
    switch (selectedSection) {
      case 'rv':
        return rvRows
      case 'pa-flow':
        return paRows
      case 'valves':
        return valveRows
      default:
        return []
    }
  }, [paRows, rvRows, selectedSection, valveRows])

  const hasQuantitativeToolbar = activeQuantRows.length > 0
  const supportsIndexFilter = useMemo(
    () => activeQuantRows.some((row) => row.canonical?.indexing === 'BSA'),
    [activeQuantRows],
  )
  const supportsAbnormalFilter = selectedSection === 'valves'
    || activeQuantRows.some((row) => row.canonical != null)
  const supportsSeverityMode = activeQuantRows.some((row) => row.canonical != null)
  const supportsChartMode = activeQuantRows.some(
    (row) => row.canonical != null && hasValidRange(row.canonical.ll, row.canonical.ul),
  )

  const valveDetailCards = useMemo(() => {
    const formatMetric = (key: NumericKey): string | null => {
      const value = resolveNumericNumber(key)
      if (value == null) return null
      const field = NUMERIC_FIELDS[key]
      const unit = field.unit ? ` ${field.unit}` : ''
      return `${formatNumber(value, field.decimals ?? 0)}${unit}`
    }

    const resolveSeverity = (
      key: 'trRegurgitantFraction' | 'mrRegurgitantFraction',
      fallbackSeverity: RegurgitationSeverity,
    ): ValveRfSeverity | null => {
      const rf = resolveNumericNumber(key)
      if (rf != null) return rfToRegurgitationSeverity(rf)
      return fallbackSeverity
    }

    const buildMetrics = (items: Array<{ key: NumericKey; label: string }>): ValveDetailCardMetric[] => (
      items
        .map((item) => {
          const value = formatMetric(item.key)
          return value ? { label: item.label, value } : null
        })
        .filter((item): item is ValveDetailCardMetric => item !== null)
    )

    return [
      {
        title: 'Tricuspid valve',
        severity: resolveSeverity('trRegurgitantFraction', choices.trSeverity),
        get severityLabel() {
          return buildValveSeverityPillLabel('TR', this.severity)
        },
        metrics: buildMetrics([
          { key: 'trRegurgitantFraction', label: 'Regurgitant fraction' },
          { key: 'trRegurgitantVolume', label: 'Regurgitant volume' },
        ]),
      },
      {
        title: 'Mitral valve',
        severity: resolveSeverity('mrRegurgitantFraction', choices.mrSeverity),
        get severityLabel() {
          return buildValveSeverityPillLabel('MR', this.severity)
        },
        metrics: buildMetrics([
          { key: 'mrRegurgitantFraction', label: 'Regurgitant fraction' },
          { key: 'mrRegurgitantVolume', label: 'Regurgitant volume' },
        ]),
      },
    ]
      .filter((card) => {
        const hasMetrics = card.metrics.length > 0
        if (showFilter === 'recorded' && !hasMetrics) return false
        if (abnormalFilter === 'abnormal') {
          return card.severity != null && card.severity !== 'none'
        }
        return true
      })
  }, [abnormalFilter, choices.mrSeverity, choices.trSeverity, resolveNumericNumber, showFilter])

  const branchFlowPercentages = useMemo(
    () => computeBranchFlowPercentages({
      mainPaNetFlow: resolveNumericNumber('mainPaNetFlow'),
      rpaNetFlow: resolveNumericNumber('rpaNetFlow'),
      lpaNetFlow: resolveNumericNumber('lpaNetFlow'),
    }),
    [resolveNumericNumber],
  )

  const phSummaryData = useMemo(() => buildPhSummaryData(
    {
      rvEdvi: resolveNumericNumber('rvEdvi'),
      rvEsvi: resolveNumericNumber('rvEsvi'),
      rvEf: resolveNumericNumber('rvEf'),
      tapse: resolveNumericNumber('tapse'),
      rvMassIndex: resolveNumericNumber('rvMassIndex'),
      rvSvi: resolveNumericNumber('rvSvi'),
      rvCi: resolveNumericNumber('rvCi'),
      rvLvVolumeRatio: resolveNumericNumber('rvLvVolumeRatio'),
      raMaxVolumeIndex: resolveNumericNumber('raMaxVolumeIndex'),
      laMaxVolumeIndex: phSupplementalMeasurements.laMaxVolumeIndex,
      lvEf: phSupplementalMeasurements.lvEf,
      mainPaDiameter: resolveNumericNumber('mainPaDiameter'),
      paDistensibility: resolveNumericNumber('paDistensibility'),
      pcwp: phSupplementalMeasurements.pcwp,
      mrap: phSupplementalMeasurements.mrap,
      trRegurgitantFraction: resolveNumericNumber('trRegurgitantFraction'),
      mrRegurgitantFraction: resolveNumericNumber('mrRegurgitantFraction'),
      pericardialEffusionSize: resolveNumericNumber('pericardialEffusionSize'),
      vortexDurationPercent: resolveNumericNumber('vortexDurationPercent'),
      rpaPercent: branchFlowPercentages.rpaPercent,
      lpaPercent: branchFlowPercentages.lpaPercent,
    },
    canonicalLookup,
    {
      septalFlattening: choices.septalFlattening,
      septalMotion: choices.septalMotion,
      interatrialSeptalBowing: choices.interatrialSeptalBowing,
      pericardialEffusion: choices.pericardialEffusion,
      venaCava: choices.venaCava,
      trSeverity: choices.trSeverity,
      mrSeverity: choices.mrSeverity,
      vortexFormation: choices.vortexFormation,
      vortexSeverity: choices.vortexSeverity,
      vortexLocation: choices.vortexLocation,
      helicity: choices.helicity,
      helicitySeverity: choices.helicitySeverity,
      helicityLocation: choices.helicityLocation,
    } satisfies PhSummaryChoices,
  ), [
    branchFlowPercentages.lpaPercent,
    branchFlowPercentages.rpaPercent,
    canonicalLookup,
    choices.helicity,
    choices.helicityLocation,
    choices.helicitySeverity,
    choices.interatrialSeptalBowing,
    choices.mrSeverity,
    choices.pericardialEffusion,
    choices.septalFlattening,
    choices.septalMotion,
    choices.trSeverity,
    choices.venaCava,
    choices.vortexFormation,
    choices.vortexLocation,
    choices.vortexSeverity,
    phSupplementalMeasurements.laMaxVolumeIndex,
    phSupplementalMeasurements.lvEf,
    phSupplementalMeasurements.mrap,
    phSupplementalMeasurements.pcwp,
    resolveNumericNumber,
  ])

  const phSummarySignature = useMemo(
    () => buildPhSummarySignature(phSummaryData),
    [phSummaryData],
  )
  const isPhSummaryStale = phSummary.llmProse !== null
    && phSummary.llmProseSourceSignature !== phSummarySignature

  const handleGeneratePhSummary = useCallback(async () => {
    setIsGeneratingPhSummary(true)
    setPhSummaryError(null)
    try {
      const prose = await generateCmrPhProse(phSummaryData)
      setPhSummary({
        llmProse: prose,
        llmProseSourceSignature: phSummarySignature,
      })
    } catch (error) {
      setPhSummaryError(error instanceof Error ? error.message : String(error))
    } finally {
      setIsGeneratingPhSummary(false)
    }
  }, [phSummaryData, phSummarySignature])

  const clearPhSummary = useCallback(() => {
    setPhSummary({
      llmProse: null,
      llmProseSourceSignature: null,
    })
    setPhSummaryError(null)
  }, [])

  const collectMeasuredRels = useCallback(() => {
    const rels: number[] = []
    for (const row of allQuantRows) {
      if (row.value === null || !row.canonical || !hasValidRange(row.canonical.ll, row.canonical.ul)) continue
      rels.push(computeMeasuredRel(row.value, row.canonical.ll!, row.canonical.ul!))
    }
    return rels
  }, [allQuantRows])

  useEffect(() => {
    if (scalingMode !== 'global') return
    const rels = collectMeasuredRels()
    if (rels.length === 0) return
    const result = globalAutoAdjust(rels)
    if (result) {
      setRangeParams(new Map([['__global__', constrainRange(result, rels)]]))
    }
  }, [collectMeasuredRels, scalingMode])

  const handleGlobalAuto = useCallback(() => {
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
  }, [collectMeasuredRels, scalingMode])

  const handlePerMeasurementAuto = useCallback(() => {
    if (scalingMode === 'per-meas') {
      setScalingMode('factory')
      setRangeParams(new Map())
      return
    }

    const next = new Map<string, RangeParam>()
    for (const row of allQuantRows) {
      if (row.value === null || !row.canonical || !hasValidRange(row.canonical.ll, row.canonical.ul)) continue
      const rel = computeMeasuredRel(row.value, row.canonical.ll!, row.canonical.ul!)
      next.set(row.key, perMeasurementAutoAdjust(rel))
    }
    setScalingMode('per-meas')
    setRangeParams(next)
  }, [allQuantRows, scalingMode])

  return (
    <Stack className="gap-6">
      <Row align="center" gap="md" wrap={false} className="house-page-title-row">
        <SectionMarker tone="report" size="title" className="self-stretch h-auto" />
        <PageHeader
          heading="Pulmonary hypertension"
          className="!ml-0 !mt-0"
        />
      </Row>

      <div className="flex flex-wrap items-center gap-3">
        <div className="rounded-md border border-[hsl(var(--stroke-soft)/0.72)] bg-[hsl(var(--tone-neutral-50))] px-4 py-2">
          <span className="text-sm font-semibold text-[hsl(var(--foreground))]">{referenceLoading ? 'Loading...' : sex}</span>
        </div>
        <div className="rounded-md border border-[hsl(var(--stroke-soft)/0.72)] bg-[hsl(var(--tone-neutral-50))] px-4 py-2">
          <span className="text-sm font-semibold text-[hsl(var(--foreground))]">{age != null ? `${age} years` : '\u2014'}</span>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {PH_SECTION_TILES.map((section) => (
          <SectionNavTile
            key={section.id}
            title={section.title}
            selected={selectedSection === section.id}
            onClick={() => setSelectedSection(section.id)}
          />
        ))}
      </div>

      {(hasQuantitativeToolbar || supportsSeverityMode || supportsChartMode) && (
        <div className="flex flex-wrap items-start gap-5">
          {hasQuantitativeToolbar && (
            <div className="flex flex-col gap-1">
              <div className="flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wider text-[hsl(var(--tone-neutral-400))]">
                <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M1 2h14M3 6h10M5 10h6M7 14h2" /></svg>
                Filters
              </div>
              <div className="flex items-center gap-2">
                <PillToggle
                  options={[
                    { key: 'recorded', label: <RecordedIcon />, tooltip: 'Recorded values only' },
                    { key: 'all', label: <AllRowsIcon />, tooltip: 'All parameters' },
                  ]}
                  compact
                  value={showFilter}
                  onChange={(value) => setShowFilter(value as 'all' | 'recorded')}
                />
                {supportsIndexFilter && (
                  <PillToggle
                    options={[
                      { key: 'all', label: <BsaOffIcon />, tooltip: 'Absolute + indexed' },
                      { key: 'indexed', label: <BsaIcon />, tooltip: 'BSA-indexed only' },
                    ]}
                    value={indexFilter}
                    onChange={(value) => setIndexFilter(value as 'all' | 'indexed')}
                  />
                )}
                {supportsAbnormalFilter && (
                  <PillToggle
                    options={[
                      { key: 'all', label: <SeverityIcon />, tooltip: 'All severities' },
                      { key: 'abnormal', label: <svg className="h-3.5 w-3.5" viewBox="0 0 16 16"><circle cx="8" cy="8" r="5" fill="hsl(4 55% 50%)" /></svg>, tooltip: 'Abnormal only' },
                    ]}
                    value={abnormalFilter}
                    onChange={(value) => setAbnormalFilter(value as 'all' | 'abnormal')}
                  />
                )}
              </div>
            </div>
          )}

          {(hasQuantitativeToolbar && (supportsSeverityMode || supportsChartMode)) && (
            <div className="h-10 w-px self-end bg-[hsl(var(--stroke-soft)/0.3)]" />
          )}

          {(supportsSeverityMode || supportsChartMode) && (
            <div className="flex flex-col gap-1">
              <div className="flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wider text-[hsl(var(--tone-neutral-400))]">
                <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><rect x="1" y="3" width="14" height="10" rx="1.5" /><path d="M1 6h14" /></svg>
                Viewing
              </div>
              <div className="flex items-center gap-2">
                {supportsSeverityMode && (
                  <PillToggle
                    options={[
                      { key: 'off', label: <SeverityOffIcon />, tooltip: 'Severity colouring off' },
                      { key: 'abnormal', label: <SeverityIcon />, tooltip: 'Colour rows by severity' },
                    ]}
                    value={severityMode}
                    onChange={(value) => setSeverityMode(value as 'off' | 'abnormal')}
                  />
                )}
                {supportsChartMode && (
                  <>
                    <PillToggle
                      options={[
                        { key: 'on', label: <ChartIcon />, tooltip: 'Show range charts' },
                        { key: 'off', label: <ChartOffIcon />, tooltip: 'Table only' },
                      ]}
                      value={chartMode}
                      onChange={(value) => setChartMode(value as 'off' | 'on')}
                    />
                    {chartMode === 'on' && (
                      <ChartControlStrip scalingMode={scalingMode} onGlobalAuto={handleGlobalAuto} onPerMeasAuto={handlePerMeasurementAuto} />
                    )}
                  </>
                )}
              </div>
            </div>
          )}
        </div>
      )}

      {selectedSection === 'summary' && (
        <SectionCard title="PH summary">
          <div className="space-y-4">
            <div className="flex flex-wrap items-center gap-2">
              <span className="rounded-full bg-[hsl(var(--tone-neutral-100))] px-2.5 py-0.5 text-xs font-semibold text-[hsl(var(--tone-neutral-700))]">
                {phSummaryData.probabilityLabel}
              </span>
              {phSummaryData.adaptationLabel && (
                <span className="rounded-full bg-[hsl(var(--tone-neutral-50))] px-2.5 py-0.5 text-xs font-semibold text-[hsl(var(--tone-neutral-700))] ring-1 ring-[hsl(var(--stroke-soft)/0.72)]">
                  {phSummaryData.adaptationLabel}
                </span>
              )}
              <span className="rounded-full bg-[hsl(var(--tone-neutral-50))] px-2.5 py-0.5 text-xs font-semibold text-[hsl(var(--tone-neutral-600))] ring-1 ring-[hsl(var(--stroke-soft)/0.72)]">
                {phSummaryData.phenotypeLabel}
              </span>
            </div>

            {phSummary.llmProse !== null && (
              <p className="text-sm leading-relaxed text-foreground/80 whitespace-pre-wrap">
                {phSummary.llmProse}
              </p>
            )}

            {phSummaryError && (
              <p className="text-xs text-red-500">{phSummaryError}</p>
            )}

            <div className="flex items-center gap-3">
              <button
                type="button"
                disabled={isGeneratingPhSummary}
                onClick={handleGeneratePhSummary}
                className={cn(
                  'rounded-full px-4 py-1.5 text-xs font-medium transition-all',
                  'bg-foreground text-background hover:bg-foreground/90',
                  'disabled:cursor-not-allowed disabled:opacity-40',
                )}
              >
                {isGeneratingPhSummary
                  ? 'Generating...'
                  : phSummary.llmProse !== null
                    ? isPhSummaryStale
                      ? 'Regenerate Summary (Stale)'
                      : 'Regenerate Summary'
                    : 'Generate Summary'}
              </button>
              {phSummary.llmProse !== null && (
                <button
                  type="button"
                  onClick={clearPhSummary}
                  className="rounded-full px-3 py-1 text-xs font-medium text-red-600 ring-1 ring-red-300 transition-all hover:bg-red-50 hover:text-red-700"
                >
                  Clear
                </button>
              )}
            </div>
          </div>
        </SectionCard>
      )}

      {selectedSection === 'rv' && (
        <QuantitativeSection title="RV size & function">
          <QuantitativeTable rows={filteredRvRows} chartMode={chartMode} severityMode={severityMode} rangeParams={rangeParams} onSelectRow={setSelectedRow} framed={false} />
        </QuantitativeSection>
      )}

      {selectedSection === 'signs' && (
        <SectionCard title="Septal / right heart signs">
          <div className="grid gap-8 xl:grid-cols-2">
            <div className="space-y-4">
              <div className="space-y-4">
                <div className="space-y-2">
                  <FieldLabel>Septal flattening</FieldLabel>
                  <ChoicePills options={SEPTAL_FLATTENING_OPTIONS} value={choices.septalFlattening} onChange={(value) => updateChoice('septalFlattening', value)} />
                </div>
                <div className="space-y-2">
                  <FieldLabel>Septal motion</FieldLabel>
                  <ChoicePills options={SEPTAL_MOTION_OPTIONS} value={choices.septalMotion} onChange={(value) => updateChoice('septalMotion', value)} />
                </div>
                <div className="space-y-2">
                  <FieldLabel>Interatrial septal bowing</FieldLabel>
                  <ChoicePills options={INTERATRIAL_BOWING_OPTIONS} value={choices.interatrialSeptalBowing} onChange={(value) => updateChoice('interatrialSeptalBowing', value)} />
                </div>
              </div>
            </div>

            <div className="space-y-4">
              <div className="space-y-4">
                <div className="space-y-2">
                  <FieldLabel>Pericardial effusion</FieldLabel>
                  <ChoicePills options={PERICARDIAL_EFFUSION_OPTIONS} value={choices.pericardialEffusion} onChange={(value) => updateChoice('pericardialEffusion', value)} />
                </div>
                {choices.pericardialEffusion !== 'none' && (
                  <MeasurementRow field={NUMERIC_FIELDS.pericardialEffusionSize} value={resolveNumericValue('pericardialEffusionSize')} onChange={(value) => updateManualNumeric('pericardialEffusionSize', value)} />
                )}
                <div className="space-y-2">
                  <FieldLabel>Vena cava</FieldLabel>
                  <ChoicePills options={VENA_CAVA_OPTIONS} value={choices.venaCava} onChange={(value) => updateChoice('venaCava', value)} />
                </div>
              </div>
            </div>
          </div>
        </SectionCard>
      )}

      {selectedSection === 'pa-flow' && (
        <QuantitativeSection title="Pulmonary artery & flow">
          <QuantitativeTable rows={filteredPaRows} chartMode={chartMode} severityMode={severityMode} rangeParams={rangeParams} onSelectRow={setSelectedRow} framed={false} />
        </QuantitativeSection>
      )}

      {selectedSection === 'valves' && (
        <SectionCard title="Valvular context">
          <div className="grid gap-6">
            <Subsection title="Valve severity">
              <div className="grid gap-6 lg:grid-cols-2">
                <div className="space-y-2">
                  <FieldLabel>Tricuspid regurgitation</FieldLabel>
                  <ChoicePills
                    options={REGURGITATION_SEVERITY_OPTIONS}
                    value={choices.trSeverity}
                    onChange={(value) => updateChoice('trSeverity', value)}
                  />
                </div>
                <div className="space-y-2">
                  <FieldLabel>Mitral regurgitation</FieldLabel>
                  <ChoicePills
                    options={REGURGITATION_SEVERITY_OPTIONS}
                    value={choices.mrSeverity}
                    onChange={(value) => updateChoice('mrSeverity', value)}
                  />
                </div>
              </div>
            </Subsection>
            <QuantitativeTable rows={filteredValveRows} chartMode={chartMode} severityMode={severityMode} rangeParams={rangeParams} onSelectRow={setSelectedRow} framed={false} />
            <div className="grid gap-4 xl:grid-cols-3">
              {valveDetailCards.map((card) => (
                <ValveDetailCard
                  key={card.title}
                  title={card.title}
                  metrics={card.metrics}
                  severity={card.severity}
                  severityLabel={card.severityLabel}
                />
              ))}
            </div>
          </div>
        </SectionCard>
      )}

      {selectedSection === '4d-flow' && (
        <SectionCard title="4D Flow">
          <div className="grid gap-6">
            <div className="grid gap-6 xl:grid-cols-[minmax(0,0.95fr)_minmax(0,1.05fr)]">
              <Subsection title="Qualitative flow pattern">
                <div className="space-y-4">
                  <div className="space-y-2">
                    <FieldLabel>Vortex formation</FieldLabel>
                    <ChoicePills options={PRESENCE_OPTIONS} value={choices.vortexFormation} onChange={(value) => updateChoice('vortexFormation', value)} />
                  </div>
                  {choices.vortexFormation === 'present' && (
                    <>
                      <div className="space-y-2">
                        <FieldLabel>Vortex location</FieldLabel>
                        <ChoicePills options={VORTEX_LOCATION_OPTIONS} value={choices.vortexLocation} onChange={(value) => updateChoice('vortexLocation', value)} />
                      </div>
                      <MeasurementRow
                        field={NUMERIC_FIELDS.vortexDurationPercent}
                        value={resolveNumericValue('vortexDurationPercent')}
                        onChange={(value) => updateManualNumeric('vortexDurationPercent', value)}
                      />
                      <div className="space-y-2">
                        <FieldLabel>Visual prominence</FieldLabel>
                        <ChoicePills options={ADVANCED_SEVERITY_OPTIONS} value={choices.vortexSeverity ?? 'mild'} onChange={(value) => updateChoice('vortexSeverity', value)} />
                      </div>
                    </>
                  )}
                  <div className="space-y-2">
                    <FieldLabel>Helical / disorganised flow</FieldLabel>
                    <ChoicePills options={PRESENCE_OPTIONS} value={choices.helicity} onChange={(value) => updateChoice('helicity', value)} />
                  </div>
                  {choices.helicity === 'present' && (
                    <>
                      <div className="space-y-2">
                        <FieldLabel>Flow disturbance location</FieldLabel>
                        <ChoicePills options={HELICAL_FLOW_LOCATION_OPTIONS} value={choices.helicityLocation} onChange={(value) => updateChoice('helicityLocation', value)} />
                      </div>
                      <div className="space-y-2">
                        <FieldLabel>Severity</FieldLabel>
                        <ChoicePills options={ADVANCED_SEVERITY_OPTIONS} value={choices.helicitySeverity ?? 'mild'} onChange={(value) => updateChoice('helicitySeverity', value)} />
                      </div>
                    </>
                  )}
                </div>
              </Subsection>

              <Subsection title="Branch flow quantification">
                <div className="space-y-4">
                  <BranchFlowRow
                    label={NUMERIC_FIELDS.mainPaNetFlow.label}
                    value={resolveNumericValue('mainPaNetFlow')}
                    unit={NUMERIC_FIELDS.mainPaNetFlow.unit ?? ''}
                    onChange={(value) => updateManualNumeric('mainPaNetFlow', value)}
                  />
                  <BranchFlowRow
                    label={NUMERIC_FIELDS.rpaNetFlow.label}
                    value={resolveNumericValue('rpaNetFlow')}
                    unit={NUMERIC_FIELDS.rpaNetFlow.unit ?? ''}
                    onChange={(value) => updateManualNumeric('rpaNetFlow', value)}
                  />
                  <BranchFlowRow
                    label={NUMERIC_FIELDS.lpaNetFlow.label}
                    value={resolveNumericValue('lpaNetFlow')}
                    unit={NUMERIC_FIELDS.lpaNetFlow.unit ?? ''}
                    onChange={(value) => updateManualNumeric('lpaNetFlow', value)}
                  />
                  <BranchFlowRow
                    label={NUMERIC_FIELDS.rpaPercent.label}
                    value={formatNumber(branchFlowPercentages.rpaPercent, NUMERIC_FIELDS.rpaPercent.decimals)}
                    unit={NUMERIC_FIELDS.rpaPercent.unit ?? ''}
                    readOnly
                  />
                  <BranchFlowRow
                    label={NUMERIC_FIELDS.lpaPercent.label}
                    value={formatNumber(branchFlowPercentages.lpaPercent, NUMERIC_FIELDS.lpaPercent.decimals)}
                    unit={NUMERIC_FIELDS.lpaPercent.unit ?? ''}
                    readOnly
                  />
                </div>
              </Subsection>
            </div>

            <Subsection title="4D Flow Comment">
              <TextareaField label="Advanced flow note" value={texts.flowComment} onChange={(value) => updateText('flowComment', value)} placeholder="-" />
            </Subsection>
          </div>
        </SectionCard>
      )}

      {selectedRow?.canonical && <QuantitativeParameterDrilldown row={selectedRow} onClose={() => setSelectedRow(null)} />}
    </Stack>
  )
}

function BranchFlowRow({
  label,
  value,
  unit,
  onChange,
  readOnly = false,
}: {
  label: string
  value: string
  unit: string
  onChange?: (value: string) => void
  readOnly?: boolean
}) {
  return (
    <label className="grid grid-cols-[minmax(0,1fr)_7rem_4.5rem] items-center gap-x-3 gap-y-1">
      <span className="text-sm text-[hsl(var(--foreground))]">{label}</span>
      {readOnly ? (
        <div className="house-input flex h-8 w-full items-center justify-end rounded-md px-3 text-xs text-[hsl(var(--foreground))]">
          {value || '-'}
        </div>
      ) : (
        <input
          type="text"
          inputMode="decimal"
          value={value}
          onChange={(event) => onChange?.(event.target.value)}
          placeholder="-"
          className="house-input h-8 w-full rounded-md px-3 text-right text-xs"
        />
      )}
      <span className="text-sm text-[hsl(var(--muted-foreground))]">{unit}</span>
    </label>
  )
}

function computeBranchFlowPercentages({
  mainPaNetFlow,
  rpaNetFlow,
  lpaNetFlow,
}: {
  mainPaNetFlow: number | null
  rpaNetFlow: number | null
  lpaNetFlow: number | null
}): { rpaPercent: number | null; lpaPercent: number | null } {
  if (rpaNetFlow !== null && lpaNetFlow !== null) {
    const branchTotal = rpaNetFlow + lpaNetFlow
    if (branchTotal !== 0) {
      return {
        rpaPercent: round((rpaNetFlow / branchTotal) * 100, 1),
        lpaPercent: round((lpaNetFlow / branchTotal) * 100, 1),
      }
    }
  }

  if (mainPaNetFlow !== null && mainPaNetFlow !== 0) {
    return {
      rpaPercent: rpaNetFlow !== null ? round((rpaNetFlow / mainPaNetFlow) * 100, 1) : null,
      lpaPercent: lpaNetFlow !== null ? round((lpaNetFlow / mainPaNetFlow) * 100, 1) : null,
    }
  }

  return { rpaPercent: null, lpaPercent: null }
}
