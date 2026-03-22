import { useCallback, useMemo, useState, useSyncExternalStore } from 'react'

import { SectionMarker } from '@/components/patterns'
import { PageHeader, Row, Stack } from '@/components/primitives'
import { getExtractionResult, subscribeExtractionResult } from '@/lib/cmr-report-store'
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

const RV_FIELDS: NumericKey[] = [
  'rvEdv', 'rvEdvi', 'rvEsv', 'rvEsvi', 'rvSv', 'rvSvi', 'rvEf', 'rvMass',
  'rvMassIndex', 'rvCo', 'rvCi', 'raMaxVolume', 'raMaxVolumeIndex', 'lvEdvi', 'lvSvi', 'tapse',
]

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

function countDefined(values: Array<string | boolean | null | undefined>): number {
  return values.filter((value) => value !== null && value !== undefined && value !== '' && value !== false).length
}

function StatusPill({ label }: { label: string }) {
  return (
    <span className="rounded-full border border-[hsl(var(--stroke-soft)/0.7)] bg-[hsl(var(--tone-neutral-50))] px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.08em] text-[hsl(var(--tone-neutral-500))]">
      {label}
    </span>
  )
}

function FieldLabel({ children }: { children: React.ReactNode }) {
  return <span className="house-field-label">{children}</span>
}

function SectionCard({ title, statusLabel, children }: { title: string; statusLabel: string; children: React.ReactNode }) {
  return (
    <section className="overflow-hidden rounded-xl border border-border/50 bg-card">
      <div className="flex items-center gap-3 border-b border-border/30 px-5 py-3">
        <SectionMarker tone="report" size="title" className="self-stretch h-auto" />
        <h2 className="flex-1 text-sm font-semibold text-foreground">{title}</h2>
        <StatusPill label={statusLabel} />
      </div>
      <div className="p-5">{children}</div>
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

function MeasurementRow({ field, value, onChange }: { field: NumericFieldDef; value: string; onChange: (value: string) => void }) {
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

function ChoicePills<T extends string>({ options, value, onChange }: { options: Option<T>[]; value: T; onChange: (value: T) => void }) {
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

export function CmrPhPage() {
  const extraction = useSyncExternalStore(subscribeExtractionResult, getExtractionResult)
  const demographics = extraction?.demographics ?? {}
  const bsa = demographics.bsa ?? null
  const heartRate = demographics.heart_rate ?? null

  const extractedNumeric = useMemo(() => {
    const measurements = new Map<string, number>()
    for (const measurement of extraction?.measurements ?? []) measurements.set(measurement.parameter, measurement.value)

    const next: Partial<Record<NumericKey, number>> = {}
    ;(Object.keys(NUMERIC_FIELDS) as NumericKey[]).forEach((key) => {
      const param = NUMERIC_FIELDS[key].extractedParam
      if (!param) return
      const value = measurements.get(param)
      if (value !== undefined) next[key] = value
    })
    return next
  }, [extraction])

  const [numericOverrides, setNumericOverrides] = useState<Partial<Record<NumericKey, string>>>({})
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

  const getBaseNumeric = useCallback((key: NumericKey): number | null => {
    const override = numericOverrides[key]
    if (override !== undefined) return parseNumber(override)
    return extractedNumeric[key] ?? null
  }, [extractedNumeric, numericOverrides])

  const derivedNumeric = useMemo(() => {
    const next: Partial<Record<NumericKey, number>> = {}
    const rvEdv = getBaseNumeric('rvEdv')
    const rvEsv = getBaseNumeric('rvEsv')
    const rvSv = getBaseNumeric('rvSv') ?? (rvEdv !== null && rvEsv !== null ? rvEdv - rvEsv : null)
    const rvCo = getBaseNumeric('rvCo') ?? (rvSv !== null && heartRate !== null ? (rvSv * heartRate) / 1000 : null)
    const mainPaSystolicArea = getBaseNumeric('mainPaSystolicArea')
    const mainPaDiastolicArea = getBaseNumeric('mainPaDiastolicArea')
    const pvForwardFlow = getBaseNumeric('pvForwardFlow')
    const pvBackwardFlow = getBaseNumeric('pvBackwardFlow')
    const peakVelocity = getBaseNumeric('peakVelocity')
    const rpaNetFlow = getBaseNumeric('rpaNetFlow')
    const lpaNetFlow = getBaseNumeric('lpaNetFlow')

    if (getBaseNumeric('rvSv') === null && rvSv !== null) next.rvSv = round(rvSv, 1)
    if (getBaseNumeric('rvEf') === null && rvSv !== null && rvEdv) next.rvEf = round((rvSv / rvEdv) * 100, 1)
    if (getBaseNumeric('rvEdvi') === null && rvEdv !== null && bsa) next.rvEdvi = round(rvEdv / bsa, 1)
    if (getBaseNumeric('rvEsvi') === null && rvEsv !== null && bsa) next.rvEsvi = round(rvEsv / bsa, 1)
    if (getBaseNumeric('rvSvi') === null && rvSv !== null && bsa) next.rvSvi = round(rvSv / bsa, 1)
    if (getBaseNumeric('rvMassIndex') === null && getBaseNumeric('rvMass') !== null && bsa) {
      next.rvMassIndex = round(getBaseNumeric('rvMass')! / bsa, 1)
    }
    if (getBaseNumeric('rvCo') === null && rvCo !== null) next.rvCo = round(rvCo, 1)
    if (getBaseNumeric('rvCi') === null && rvCo !== null && bsa) next.rvCi = round(rvCo / bsa, 1)
    if (getBaseNumeric('raMaxVolumeIndex') === null && getBaseNumeric('raMaxVolume') !== null && bsa) {
      next.raMaxVolumeIndex = round(getBaseNumeric('raMaxVolume')! / bsa, 1)
    }
    if (getBaseNumeric('paRelativeAreaChange') === null && mainPaSystolicArea !== null && mainPaDiastolicArea) {
      next.paRelativeAreaChange = round(((mainPaSystolicArea - mainPaDiastolicArea) / mainPaDiastolicArea) * 100, 1)
    }
    if (getBaseNumeric('paDistensibility') === null && next.paRelativeAreaChange !== undefined) {
      next.paDistensibility = next.paRelativeAreaChange
    }
    if (getBaseNumeric('pvRegurgitantFraction') === null && pvForwardFlow !== null && pvBackwardFlow !== null && pvForwardFlow !== 0) {
      next.pvRegurgitantFraction = round((Math.abs(pvBackwardFlow) / pvForwardFlow) * 100, 1)
    }
    if (getBaseNumeric('maxPressureGradient') === null && peakVelocity !== null) {
      next.maxPressureGradient = round(4 * peakVelocity * peakVelocity, 1)
    }

    const rvEdvi = getBaseNumeric('rvEdvi') ?? next.rvEdvi ?? null
    const lvEdvi = getBaseNumeric('lvEdvi')
    if (getBaseNumeric('rvLvVolumeRatio') === null && rvEdvi !== null && lvEdvi) {
      next.rvLvVolumeRatio = round(rvEdvi / lvEdvi, 2)
    }

    if (getBaseNumeric('rpaPercent') === null && rpaNetFlow !== null && lpaNetFlow !== null && rpaNetFlow + lpaNetFlow !== 0) {
      next.rpaPercent = round((rpaNetFlow / (rpaNetFlow + lpaNetFlow)) * 100, 1)
    }
    if (getBaseNumeric('lpaPercent') === null && rpaNetFlow !== null && lpaNetFlow !== null && rpaNetFlow + lpaNetFlow !== 0) {
      next.lpaPercent = round((lpaNetFlow / (rpaNetFlow + lpaNetFlow)) * 100, 1)
    }

    return next
  }, [bsa, getBaseNumeric, heartRate])

  const resolveNumericValue = useCallback((key: NumericKey): string => {
    const override = numericOverrides[key]
    if (override !== undefined) return override
    if (extractedNumeric[key] !== undefined) return formatNumber(extractedNumeric[key], NUMERIC_FIELDS[key].decimals)
    if (derivedNumeric[key] !== undefined) return formatNumber(derivedNumeric[key], NUMERIC_FIELDS[key].decimals)
    return ''
  }, [derivedNumeric, extractedNumeric, numericOverrides])

  const updateNumeric = useCallback((key: NumericKey, value: string) => {
    setNumericOverrides((prev) => {
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

  const rvStatus = `${countDefined(RV_FIELDS.map((key) => resolveNumericValue(key)))} set`
  const rightHeartStatus = `${countDefined([
    choices.septalFlattening !== 'none',
    choices.septalMotion !== 'normal',
    choices.interatrialSeptalBowing !== 'none',
    choices.pericardialEffusion !== 'none',
    choices.venaCava !== 'normal',
    resolveNumericValue('pericardialEffusionSize'),
  ])} set`
  const paStatus = `${countDefined([
    resolveNumericValue('mainPaDiameter'),
    resolveNumericValue('mainPaSystolicArea'),
    resolveNumericValue('mainPaDiastolicArea'),
    resolveNumericValue('paRelativeAreaChange'),
    resolveNumericValue('paDistensibility'),
    resolveNumericValue('rpaDiameter'),
    resolveNumericValue('lpaDiameter'),
    resolveNumericValue('pvEffectiveForwardFlow'),
    resolveNumericValue('pvForwardFlow'),
    resolveNumericValue('pvBackwardFlow'),
    resolveNumericValue('pvRegurgitantFraction'),
    resolveNumericValue('peakVelocity'),
    resolveNumericValue('maxPressureGradient'),
    resolveNumericValue('meanPressureGradient'),
  ])} set`
  const valveStatus = `${countDefined([
    choices.trSeverity !== 'none',
    resolveNumericValue('trRegurgitantFraction'),
    resolveNumericValue('trRegurgitantVolume'),
    choices.mrSeverity !== 'none',
    resolveNumericValue('mrRegurgitantFraction'),
    resolveNumericValue('mrRegurgitantVolume'),
    choices.prSeverity !== 'none',
    resolveNumericValue('prRegurgitantFraction'),
  ])} set`
  const additionalStatus = `${countDefined([
    resolveNumericValue('rvLvVolumeRatio'),
    resolveNumericValue('rpaDistension'),
    resolveNumericValue('lpaDistension'),
    texts.ancillaryFindings,
    texts.additionalDetails,
  ])} set`
  const flow4dStatus = `${countDefined([
    choices.vortexFormation !== 'not-assessed',
    choices.vortexSeverity,
    choices.helicity !== 'not-assessed',
    choices.helicitySeverity,
    resolveNumericValue('mainPaNetFlow'),
    resolveNumericValue('rpaNetFlow'),
    resolveNumericValue('lpaNetFlow'),
    resolveNumericValue('rpaPercent'),
    resolveNumericValue('lpaPercent'),
    texts.flowComment,
  ])} set`

  const headerActions = (
    <div className="flex flex-wrap items-center gap-2">
      {bsa !== null && <StatusPill label={`BSA ${formatNumber(bsa, 2)} m2`} />}
      {heartRate !== null && <StatusPill label={`HR ${formatNumber(heartRate, 0)} bpm`} />}
      <StatusPill label="Capture only" />
    </div>
  )

  return (
    <Stack className="gap-6">
      <Row align="center" gap="md" wrap={false} className="house-page-title-row">
        <SectionMarker tone="report" size="title" className="self-stretch h-auto" />
        <PageHeader
          heading="Pulmonary Hypertension"
          description="Structured capture of PH-relevant CMR findings, with auto-calculations but no generated conclusion."
          actions={headerActions}
          className="!ml-0 !mt-0"
        />
      </Row>

      <SectionCard title="RV Size & Function" statusLabel={rvStatus}>
        <div className="grid gap-x-8 gap-y-4 xl:grid-cols-2">
          {RV_FIELDS.map((key) => (
            <MeasurementRow key={key} field={NUMERIC_FIELDS[key]} value={resolveNumericValue(key)} onChange={(value) => updateNumeric(key, value)} />
          ))}
        </div>
      </SectionCard>

      <SectionCard title="Septal / Right Heart Signs" statusLabel={rightHeartStatus}>
        <div className="grid gap-6 xl:grid-cols-2">
          <Subsection title="Septal Geometry">
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

          <Subsection title="Ancillary Signs">
            <div className="space-y-4">
              <div className="space-y-2">
                <FieldLabel>Pericardial effusion</FieldLabel>
                <ChoicePills options={PERICARDIAL_EFFUSION_OPTIONS} value={choices.pericardialEffusion} onChange={(value) => updateChoice('pericardialEffusion', value)} />
              </div>
              {choices.pericardialEffusion !== 'none' && (
                <MeasurementRow field={NUMERIC_FIELDS.pericardialEffusionSize} value={resolveNumericValue('pericardialEffusionSize')} onChange={(value) => updateNumeric('pericardialEffusionSize', value)} />
              )}
              <div className="space-y-2">
                <FieldLabel>Vena cava</FieldLabel>
                <ChoicePills options={VENA_CAVA_OPTIONS} value={choices.venaCava} onChange={(value) => updateChoice('venaCava', value)} />
              </div>
            </div>
          </Subsection>
        </div>
      </SectionCard>

      <SectionCard title="Pulmonary Artery & Flow" statusLabel={paStatus}>
        <div className="grid gap-6 xl:grid-cols-2">
          <Subsection title="PA Morphology">
            <div className="space-y-4">
              <MeasurementRow field={NUMERIC_FIELDS.mainPaDiameter} value={resolveNumericValue('mainPaDiameter')} onChange={(value) => updateNumeric('mainPaDiameter', value)} />
              <MeasurementRow field={NUMERIC_FIELDS.mainPaSystolicArea} value={resolveNumericValue('mainPaSystolicArea')} onChange={(value) => updateNumeric('mainPaSystolicArea', value)} />
              <MeasurementRow field={NUMERIC_FIELDS.mainPaDiastolicArea} value={resolveNumericValue('mainPaDiastolicArea')} onChange={(value) => updateNumeric('mainPaDiastolicArea', value)} />
              <MeasurementRow field={NUMERIC_FIELDS.paRelativeAreaChange} value={resolveNumericValue('paRelativeAreaChange')} onChange={(value) => updateNumeric('paRelativeAreaChange', value)} />
              <MeasurementRow field={NUMERIC_FIELDS.paDistensibility} value={resolveNumericValue('paDistensibility')} onChange={(value) => updateNumeric('paDistensibility', value)} />
              <MeasurementRow field={NUMERIC_FIELDS.rpaDiameter} value={resolveNumericValue('rpaDiameter')} onChange={(value) => updateNumeric('rpaDiameter', value)} />
              <MeasurementRow field={NUMERIC_FIELDS.lpaDiameter} value={resolveNumericValue('lpaDiameter')} onChange={(value) => updateNumeric('lpaDiameter', value)} />
            </div>
          </Subsection>

          <Subsection title="Pulmonary Valve / Through-Plane Flow">
            <div className="space-y-4">
              <MeasurementRow field={NUMERIC_FIELDS.pvEffectiveForwardFlow} value={resolveNumericValue('pvEffectiveForwardFlow')} onChange={(value) => updateNumeric('pvEffectiveForwardFlow', value)} />
              <MeasurementRow field={NUMERIC_FIELDS.pvForwardFlow} value={resolveNumericValue('pvForwardFlow')} onChange={(value) => updateNumeric('pvForwardFlow', value)} />
              <MeasurementRow field={NUMERIC_FIELDS.pvBackwardFlow} value={resolveNumericValue('pvBackwardFlow')} onChange={(value) => updateNumeric('pvBackwardFlow', value)} />
              <MeasurementRow field={NUMERIC_FIELDS.pvRegurgitantFraction} value={resolveNumericValue('pvRegurgitantFraction')} onChange={(value) => updateNumeric('pvRegurgitantFraction', value)} />
              <MeasurementRow field={NUMERIC_FIELDS.peakVelocity} value={resolveNumericValue('peakVelocity')} onChange={(value) => updateNumeric('peakVelocity', value)} />
              <MeasurementRow field={NUMERIC_FIELDS.maxPressureGradient} value={resolveNumericValue('maxPressureGradient')} onChange={(value) => updateNumeric('maxPressureGradient', value)} />
              <MeasurementRow field={NUMERIC_FIELDS.meanPressureGradient} value={resolveNumericValue('meanPressureGradient')} onChange={(value) => updateNumeric('meanPressureGradient', value)} />
            </div>
          </Subsection>
        </div>
      </SectionCard>

      <SectionCard title="Valvular Context" statusLabel={valveStatus}>
        <div className="grid gap-6 xl:grid-cols-3">
          <Subsection title="Tricuspid Regurgitation">
            <div className="space-y-4">
              <div className="space-y-2">
                <FieldLabel>Severity</FieldLabel>
                <ChoicePills options={REGURGITATION_OPTIONS} value={choices.trSeverity} onChange={(value) => updateChoice('trSeverity', value)} />
              </div>
              <MeasurementRow field={NUMERIC_FIELDS.trRegurgitantFraction} value={resolveNumericValue('trRegurgitantFraction')} onChange={(value) => updateNumeric('trRegurgitantFraction', value)} />
              <MeasurementRow field={NUMERIC_FIELDS.trRegurgitantVolume} value={resolveNumericValue('trRegurgitantVolume')} onChange={(value) => updateNumeric('trRegurgitantVolume', value)} />
            </div>
          </Subsection>

          <Subsection title="Mitral Regurgitation">
            <div className="space-y-4">
              <div className="space-y-2">
                <FieldLabel>Severity</FieldLabel>
                <ChoicePills options={REGURGITATION_OPTIONS} value={choices.mrSeverity} onChange={(value) => updateChoice('mrSeverity', value)} />
              </div>
              <MeasurementRow field={NUMERIC_FIELDS.mrRegurgitantFraction} value={resolveNumericValue('mrRegurgitantFraction')} onChange={(value) => updateNumeric('mrRegurgitantFraction', value)} />
              <MeasurementRow field={NUMERIC_FIELDS.mrRegurgitantVolume} value={resolveNumericValue('mrRegurgitantVolume')} onChange={(value) => updateNumeric('mrRegurgitantVolume', value)} />
            </div>
          </Subsection>

          <Subsection title="Pulmonary Regurgitation">
            <div className="space-y-4">
              <div className="space-y-2">
                <FieldLabel>Severity</FieldLabel>
                <ChoicePills options={REGURGITATION_OPTIONS} value={choices.prSeverity} onChange={(value) => updateChoice('prSeverity', value)} />
              </div>
              <MeasurementRow field={NUMERIC_FIELDS.prRegurgitantFraction} value={resolveNumericValue('prRegurgitantFraction')} onChange={(value) => updateNumeric('prRegurgitantFraction', value)} />
            </div>
          </Subsection>
        </div>
      </SectionCard>

      <SectionCard title="Additional" statusLabel={additionalStatus}>
        <div className="grid gap-6 xl:grid-cols-[minmax(0,0.95fr)_minmax(0,1.05fr)]">
          <Subsection title="Derived / Ancillary Metrics">
            <div className="space-y-4">
              <MeasurementRow field={NUMERIC_FIELDS.rvLvVolumeRatio} value={resolveNumericValue('rvLvVolumeRatio')} onChange={(value) => updateNumeric('rvLvVolumeRatio', value)} />
              <MeasurementRow field={NUMERIC_FIELDS.rpaDistension} value={resolveNumericValue('rpaDistension')} onChange={(value) => updateNumeric('rpaDistension', value)} />
              <MeasurementRow field={NUMERIC_FIELDS.lpaDistension} value={resolveNumericValue('lpaDistension')} onChange={(value) => updateNumeric('lpaDistension', value)} />
            </div>
          </Subsection>

          <Subsection title="Additional Notes">
            <div className="grid gap-4">
              <TextareaField label="Ancillary findings" value={texts.ancillaryFindings} onChange={(value) => updateText('ancillaryFindings', value)} placeholder="-" />
              <TextareaField label="Additional details" value={texts.additionalDetails} onChange={(value) => updateText('additionalDetails', value)} placeholder="-" />
            </div>
          </Subsection>
        </div>
      </SectionCard>

      <SectionCard title="4D Flow" statusLabel={flow4dStatus}>
        <div className="grid gap-6">
          <div className="grid gap-6 xl:grid-cols-[minmax(0,0.95fr)_minmax(0,1.05fr)]">
            <Subsection title="Qualitative Flow Pattern">
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

            <Subsection title="Branch Flow Quantification">
              <div className="space-y-4">
                <MeasurementRow field={NUMERIC_FIELDS.mainPaNetFlow} value={resolveNumericValue('mainPaNetFlow')} onChange={(value) => updateNumeric('mainPaNetFlow', value)} />
                <MeasurementRow field={NUMERIC_FIELDS.rpaNetFlow} value={resolveNumericValue('rpaNetFlow')} onChange={(value) => updateNumeric('rpaNetFlow', value)} />
                <MeasurementRow field={NUMERIC_FIELDS.lpaNetFlow} value={resolveNumericValue('lpaNetFlow')} onChange={(value) => updateNumeric('lpaNetFlow', value)} />
                <MeasurementRow field={NUMERIC_FIELDS.rpaPercent} value={resolveNumericValue('rpaPercent')} onChange={(value) => updateNumeric('rpaPercent', value)} />
                <MeasurementRow field={NUMERIC_FIELDS.lpaPercent} value={resolveNumericValue('lpaPercent')} onChange={(value) => updateNumeric('lpaPercent', value)} />
              </div>
            </Subsection>
          </div>

          <Subsection title="4D Flow Comment">
            <TextareaField label="Advanced flow note" value={texts.flowComment} onChange={(value) => updateText('flowComment', value)} placeholder="-" />
          </Subsection>
        </div>
      </SectionCard>
    </Stack>
  )
}

