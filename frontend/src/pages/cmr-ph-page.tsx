import { useCallback, useEffect, useMemo, useState, useSyncExternalStore } from 'react'
import { ExternalLink } from 'lucide-react'

import { SectionMarker } from '@/components/patterns'
import { DrilldownSheet, PageHeader, Row, Stack } from '@/components/primitives'
import type { CmrCanonicalParam, CmrCanonicalTableResponse } from '@/lib/cmr-api'
import { fetchReferenceParameters } from '@/lib/cmr-api'
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
import { computeSeverity, inferSeverityLabel, type SeverityLabelType, type SeverityResult } from '@/lib/cmr-severity'
import { cn } from '@/lib/utils'

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
type RegurgitationSeverity = 'none' | 'trace' | 'mild' | 'moderate' | 'severe'
type PresenceState = 'not-assessed' | 'absent' | 'present'
type AdvancedSeverity = 'mild' | 'moderate' | 'marked'

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
  helicity: PresenceState
  helicitySeverity: AdvancedSeverity | null
}

type TextState = {
  ancillaryFindings: string
  additionalDetails: string
  flowComment: string
}

type QuantitativeDisplayRow = {
  key: NumericKey
  field: NumericFieldDef
  value: number | null
  canonical: CmrCanonicalParam | null
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
  rpaPercent: { key: 'rpaPercent', label: 'RPA %', unit: '%', decimals: 0 },
  lpaPercent: { key: 'lpaPercent', label: 'LPA %', unit: '%', decimals: 0 },
}

const RV_QUANT_KEYS: NumericKey[] = ['rvEdv', 'rvEdvi', 'rvEsv', 'rvEsvi', 'rvSv', 'rvSvi', 'rvEf', 'rvMass', 'rvMassIndex', 'rvCo', 'rvCi', 'raMaxVolume', 'raMaxVolumeIndex', 'lvEdvi', 'lvSvi', 'tapse']
const PA_QUANT_KEYS: NumericKey[] = ['mainPaDiameter', 'mainPaSystolicArea', 'mainPaDiastolicArea', 'paRelativeAreaChange', 'paDistensibility', 'rpaDiameter', 'lpaDiameter', 'pvEffectiveForwardFlow', 'pvForwardFlow', 'pvBackwardFlow', 'pvRegurgitantFraction', 'peakVelocity', 'maxPressureGradient', 'meanPressureGradient']
const VALVE_QUANT_KEYS: NumericKey[] = ['trRegurgitantFraction', 'trRegurgitantVolume', 'mrRegurgitantFraction', 'mrRegurgitantVolume']
const ADDITIONAL_QUANT_KEYS: NumericKey[] = ['rvLvVolumeRatio', 'rpaDistension', 'lpaDistension']

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

const REGURGITATION_OPTIONS: Option<RegurgitationSeverity>[] = [
  { value: 'none', label: 'None' },
  { value: 'trace', label: 'Trace' },
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

function parseNumber(value: string | number | null | undefined): number | null {
  if (value === null || value === undefined || value === '') return null
  const parsed = typeof value === 'number' ? value : Number(value)
  return Number.isFinite(parsed) ? parsed : null
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
  const demographics = extraction?.demographics ?? {}
  const sex = demographics.sex ?? 'Male'
  const age = demographics.age ?? undefined
  const bsa = demographics.bsa ?? null
  const heartRate = demographics.heart_rate ?? null

  const [referenceData, setReferenceData] = useState<CmrCanonicalTableResponse | null>(null)
  const [referenceLoading, setReferenceLoading] = useState(true)
  const [showFilter, setShowFilter] = useState<'all' | 'recorded'>('recorded')
  const [indexFilter, setIndexFilter] = useState<'all' | 'indexed'>('all')
  const [abnormalFilter, setAbnormalFilter] = useState<'all' | 'abnormal'>('all')
  const [chartMode, setChartMode] = useState<'off' | 'on'>('on')
  const [severityMode, setSeverityMode] = useState<'off' | 'abnormal'>('off')
  const [rangeParams, setRangeParams] = useState<Map<string, RangeParam>>(new Map())
  const [scalingMode, setScalingMode] = useState<'factory' | 'global' | 'per-meas'>('global')
  const [selectedRow, setSelectedRow] = useState<QuantitativeDisplayRow | null>(null)
  const [manualNumeric, setManualNumeric] = useState<Partial<Record<NumericKey, string>>>({})

  const [choices, setChoices] = useState<ChoiceState>({
    septalFlattening: 'none',
    septalMotion: 'normal',
    interatrialSeptalBowing: 'none',
    pericardialEffusion: 'none',
    venaCava: 'normal',
    trSeverity: 'none',
    mrSeverity: 'none',
    prSeverity: 'none',
    vortexFormation: 'not-assessed',
    vortexSeverity: null,
    helicity: 'not-assessed',
    helicitySeverity: null,
  })
  const [texts, setTexts] = useState<TextState>({
    ancillaryFindings: '',
    additionalDetails: '',
    flowComment: '',
  })

  useEffect(() => {
    let cancelled = false
    setReferenceLoading(true)
    void fetchReferenceParameters(sex, age)
      .then((result) => {
        if (!cancelled) setReferenceData(result)
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
  }, [age, sex])

  const extractedNumeric = useMemo(() => {
    const measurements = new Map<string, number>()
    for (const measurement of extraction?.measurements ?? []) {
      measurements.set(measurement.parameter, measurement.value)
    }

    const next: Partial<Record<NumericKey, number>> = {}
    ;(Object.keys(NUMERIC_FIELDS) as NumericKey[]).forEach((key) => {
      const param = NUMERIC_FIELDS[key].extractedParam
      if (!param) return
      const value = measurements.get(param)
      if (value !== undefined) next[key] = value
    })
    return next
  }, [extraction])

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
  const additionalRows = useMemo(() => buildRows(ADDITIONAL_QUANT_KEYS), [buildRows])

  const allQuantRows = useMemo(() => [...rvRows, ...paRows, ...valveRows, ...additionalRows], [additionalRows, paRows, rvRows, valveRows])

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
  const filteredAdditionalRows = useMemo(() => filterRows(additionalRows), [additionalRows, filterRows])

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

      <div className="flex flex-wrap items-start gap-5">
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
            <PillToggle
              options={[
                { key: 'all', label: <BsaOffIcon />, tooltip: 'Absolute + indexed' },
                { key: 'indexed', label: <BsaIcon />, tooltip: 'BSA-indexed only' },
              ]}
              value={indexFilter}
              onChange={(value) => setIndexFilter(value as 'all' | 'indexed')}
            />
            <PillToggle
              options={[
                { key: 'all', label: <SeverityIcon />, tooltip: 'All severities' },
                { key: 'abnormal', label: <svg className="h-3.5 w-3.5" viewBox="0 0 16 16"><circle cx="8" cy="8" r="5" fill="hsl(4 55% 50%)" /></svg>, tooltip: 'Abnormal only' },
              ]}
              value={abnormalFilter}
              onChange={(value) => setAbnormalFilter(value as 'all' | 'abnormal')}
            />
          </div>
        </div>

        <div className="h-10 w-px self-end bg-[hsl(var(--stroke-soft)/0.3)]" />

        <div className="flex flex-col gap-1">
          <div className="flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wider text-[hsl(var(--tone-neutral-400))]">
            <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><rect x="1" y="3" width="14" height="10" rx="1.5" /><path d="M1 6h14" /></svg>
            Viewing
          </div>
          <div className="flex items-center gap-2">
            <PillToggle
              options={[
                { key: 'off', label: <SeverityOffIcon />, tooltip: 'Severity colouring off' },
                { key: 'abnormal', label: <SeverityIcon />, tooltip: 'Colour rows by severity' },
              ]}
              value={severityMode}
              onChange={(value) => setSeverityMode(value as 'off' | 'abnormal')}
            />
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
          </div>
        </div>
      </div>

      <QuantitativeSection title="RV size & function">
        <QuantitativeTable rows={filteredRvRows} chartMode={chartMode} severityMode={severityMode} rangeParams={rangeParams} onSelectRow={setSelectedRow} framed={false} />
      </QuantitativeSection>

      <SectionCard title="Septal / right heart signs">
        <div className="grid gap-6 xl:grid-cols-2">
          <Subsection title="Septal geometry">
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
          </Subsection>

          <Subsection title="Ancillary signs">
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
          </Subsection>
        </div>
      </SectionCard>

      <QuantitativeSection title="Pulmonary artery & flow">
        <QuantitativeTable rows={filteredPaRows} chartMode={chartMode} severityMode={severityMode} rangeParams={rangeParams} onSelectRow={setSelectedRow} framed={false} />
      </QuantitativeSection>

      <SectionCard title="Valvular context">
        <div className="grid gap-6">
          <div className="grid gap-6 xl:grid-cols-3">
            <Subsection title="Tricuspid regurgitation">
              <div className="space-y-2">
                <FieldLabel>Severity</FieldLabel>
                <ChoicePills options={REGURGITATION_OPTIONS} value={choices.trSeverity} onChange={(value) => updateChoice('trSeverity', value)} />
              </div>
            </Subsection>

            <Subsection title="Mitral regurgitation">
              <div className="space-y-2">
                <FieldLabel>Severity</FieldLabel>
                <ChoicePills options={REGURGITATION_OPTIONS} value={choices.mrSeverity} onChange={(value) => updateChoice('mrSeverity', value)} />
              </div>
            </Subsection>

            <Subsection title="Pulmonary regurgitation">
              <div className="space-y-2">
                <FieldLabel>Severity</FieldLabel>
                <ChoicePills options={REGURGITATION_OPTIONS} value={choices.prSeverity} onChange={(value) => updateChoice('prSeverity', value)} />
                <p className="text-xs text-[hsl(var(--muted-foreground))]">
                  Quantitative PR fraction remains visible under Pulmonary Artery &amp; Flow.
                </p>
              </div>
            </Subsection>
          </div>

          <QuantitativeTable rows={filteredValveRows} chartMode={chartMode} severityMode={severityMode} rangeParams={rangeParams} onSelectRow={setSelectedRow} />
        </div>
      </SectionCard>

      <SectionCard title="Additional">
        <div className="grid gap-6">
          <QuantitativeTable rows={filteredAdditionalRows} chartMode={chartMode} severityMode={severityMode} rangeParams={rangeParams} onSelectRow={setSelectedRow} />

          <div className="grid gap-6 xl:grid-cols-2">
            <Subsection title="Additional notes">
              <div className="grid gap-4">
                <TextareaField label="Ancillary findings" value={texts.ancillaryFindings} onChange={(value) => updateText('ancillaryFindings', value)} placeholder="-" />
                <TextareaField label="Additional details" value={texts.additionalDetails} onChange={(value) => updateText('additionalDetails', value)} placeholder="-" />
              </div>
            </Subsection>
          </div>
        </div>
      </SectionCard>

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
                  <div className="space-y-2">
                    <FieldLabel>Vortex severity</FieldLabel>
                    <ChoicePills options={ADVANCED_SEVERITY_OPTIONS} value={choices.vortexSeverity ?? 'mild'} onChange={(value) => updateChoice('vortexSeverity', value)} />
                  </div>
                )}
                <div className="space-y-2">
                  <FieldLabel>Helicity</FieldLabel>
                  <ChoicePills options={PRESENCE_OPTIONS} value={choices.helicity} onChange={(value) => updateChoice('helicity', value)} />
                </div>
                {choices.helicity === 'present' && (
                  <div className="space-y-2">
                    <FieldLabel>Helicity severity</FieldLabel>
                    <ChoicePills options={ADVANCED_SEVERITY_OPTIONS} value={choices.helicitySeverity ?? 'mild'} onChange={(value) => updateChoice('helicitySeverity', value)} />
                  </div>
                )}
              </div>
            </Subsection>

            <Subsection title="Branch flow quantification">
              <div className="space-y-4">
                <MeasurementRow field={NUMERIC_FIELDS.mainPaNetFlow} value={resolveNumericValue('mainPaNetFlow')} onChange={(value) => updateManualNumeric('mainPaNetFlow', value)} />
                <MeasurementRow field={NUMERIC_FIELDS.rpaNetFlow} value={resolveNumericValue('rpaNetFlow')} onChange={(value) => updateManualNumeric('rpaNetFlow', value)} />
                <MeasurementRow field={NUMERIC_FIELDS.lpaNetFlow} value={resolveNumericValue('lpaNetFlow')} onChange={(value) => updateManualNumeric('lpaNetFlow', value)} />
                <MeasurementRow field={NUMERIC_FIELDS.rpaPercent} value={resolveNumericValue('rpaPercent')} onChange={(value) => updateManualNumeric('rpaPercent', value)} />
                <MeasurementRow field={NUMERIC_FIELDS.lpaPercent} value={resolveNumericValue('lpaPercent')} onChange={(value) => updateManualNumeric('lpaPercent', value)} />
              </div>
            </Subsection>
          </div>

          <Subsection title="4D Flow Comment">
            <TextareaField label="Advanced flow note" value={texts.flowComment} onChange={(value) => updateText('flowComment', value)} placeholder="-" />
          </Subsection>
        </div>
      </SectionCard>

      {selectedRow?.canonical && <QuantitativeParameterDrilldown row={selectedRow} onClose={() => setSelectedRow(null)} />}
    </Stack>
  )
}
