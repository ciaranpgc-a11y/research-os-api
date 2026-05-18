import { useState } from 'react'

import { PageHeader, Row, Stack } from '@/components/primitives'
import { SectionMarker } from '@/components/patterns'
import { cn } from '@/lib/utils'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type EchoParam = {
  name: string
  normalMale?: string
  normalFemale?: string
  normal?: string
  unit: string
  notes?: string
  direction?: 'high' | 'low' | 'both'
}

type EchoGradingRow = {
  valve: string
  mild: string
  moderate: string
  severe: string
}

type PhProbRow = {
  trVelocity: string
  ancillarySigns: string
  probability: string
  tone: 'positive' | 'warning' | 'danger'
}

type DiastolicRow = {
  parameter: string
  normal: string
  gradeI: string
  gradeII: string
  gradeIII: string
}

type EchoSection = {
  title: string
  type: 'standard' | 'gendered' | 'valve-grading' | 'ph-probability' | 'diastolic'
  params?: EchoParam[]
  valveRows?: EchoGradingRow[]
  phRows?: PhProbRow[]
  diastolicRows?: DiastolicRow[]
}

// ---------------------------------------------------------------------------
// Reference data — ASE/EACVI Guidelines
// ---------------------------------------------------------------------------

const ECHO_SECTIONS: EchoSection[] = [
  {
    title: 'LV Dimensions & Function',
    type: 'gendered',
    params: [
      { name: 'LVEF', normalMale: '52\u201372', normalFemale: '54\u201374', unit: '%', direction: 'low' },
      { name: 'LV Size', normalMale: 'Normal', normalFemale: 'Normal', unit: 'descriptor' },
      { name: 'GLS', normalMale: '\u2264\u201318', normalFemale: '\u2264\u201318', unit: '%', notes: 'More negative = better', direction: 'high' },
      { name: 'MAPSE', normalMale: '\u226510', normalFemale: '\u226510', unit: 'mm', direction: 'low' },
    ],
  },
  {
    title: 'RV Dimensions & Function',
    type: 'standard',
    params: [
      { name: 'TAPSE', normal: '\u226517', unit: 'mm', direction: 'low' },
      { name: 'RV S\u2019 (TDI)', normal: '\u22659.5', unit: 'cm/s', direction: 'low' },
      { name: 'FAC', normal: '\u226535', unit: '%', direction: 'low' },
      { name: 'RV Size', normal: 'Normal', unit: 'descriptor' },
    ],
  },
  {
    title: 'Atrial Sizes',
    type: 'gendered',
    params: [
      { name: 'LA Volume Index', normalMale: '\u226434', normalFemale: '\u226434', unit: 'mL/m\u00B2', direction: 'high' },
      { name: 'LA Diameter', normalMale: '30\u201340', normalFemale: '27\u201338', unit: 'mm', direction: 'both' },
    ],
  },
  {
    title: 'IVC',
    type: 'standard',
    params: [
      { name: 'IVC Diameter', normal: '<21 mm', unit: 'mm', notes: 'with >50% collapse' },
      { name: 'RAP Estimate', normal: '3', unit: 'mmHg', notes: 'if IVC <21mm + >50% collapse' },
    ],
  },
  {
    title: 'Valve Severity Grading',
    type: 'valve-grading',
    valveRows: [
      {
        valve: 'Aortic Stenosis',
        mild: 'Vmax <3.0, MVG <20',
        moderate: 'Vmax 3.0\u20134.0, MVG 20\u201340, AVA 1.0\u20131.5',
        severe: 'Vmax >4.0, MVG >40, AVA <1.0',
      },
      {
        valve: 'Aortic Regurgitation',
        mild: 'PHT >500ms',
        moderate: 'PHT 200\u2013500ms',
        severe: 'PHT <200ms',
      },
      {
        valve: 'Mitral Regurgitation',
        mild: 'Mild jet',
        moderate: 'Moderate jet',
        severe: 'EROA \u22650.4, RV \u226560mL',
      },
      {
        valve: 'Tricuspid Regurgitation',
        mild: 'Mild jet',
        moderate: 'Moderate jet',
        severe: 'EROA \u22650.4, RV \u226545mL',
      },
    ],
  },
  {
    title: 'PH Probability (ESC Criteria)',
    type: 'ph-probability',
    phRows: [
      { trVelocity: '\u22642.8 m/s', ancillarySigns: 'None', probability: 'Low', tone: 'positive' },
      { trVelocity: '\u22642.8 m/s', ancillarySigns: 'Present', probability: 'Intermediate', tone: 'warning' },
      { trVelocity: '2.9\u20133.4 m/s', ancillarySigns: 'None', probability: 'Intermediate', tone: 'warning' },
      { trVelocity: '2.9\u20133.4 m/s', ancillarySigns: 'Present', probability: 'High', tone: 'danger' },
      { trVelocity: '>3.4 m/s', ancillarySigns: 'Any', probability: 'High', tone: 'danger' },
    ],
  },
  {
    title: 'Diastolic Function',
    type: 'diastolic',
    diastolicRows: [
      { parameter: 'E/A', normal: '0.8\u20132.0', gradeI: '<0.8', gradeII: '0.8\u20132.0', gradeIII: '>2.0' },
      { parameter: 'E/e\u2019', normal: '<14', gradeI: '<10', gradeII: '10\u201314', gradeIII: '>14' },
      { parameter: 'DT', normal: '150\u2013220ms', gradeI: '>220ms', gradeII: '150\u2013220ms', gradeIII: '<150ms' },
    ],
  },
]

// ---------------------------------------------------------------------------
// Small components
// ---------------------------------------------------------------------------

function DirectionIndicator({ dir }: { dir?: string }) {
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

function NormalRangePill({ value }: { value: string }) {
  return (
    <span className="inline-flex items-center rounded-full bg-[hsl(var(--tone-positive-100)/0.6)] px-2.5 py-0.5 text-xs font-semibold text-[hsl(var(--tone-positive-700))]">
      {value}
    </span>
  )
}

function SeverityPill({ value, tone }: { value: string; tone: 'positive' | 'warning' | 'danger' }) {
  const toneMap = {
    positive: 'bg-[hsl(var(--tone-positive-100)/0.6)] text-[hsl(var(--tone-positive-700))]',
    warning: 'bg-[hsl(var(--tone-warning-100)/0.6)] text-[hsl(var(--tone-warning-700))]',
    danger: 'bg-[hsl(var(--tone-danger-100)/0.6)] text-[hsl(var(--tone-danger-700))]',
  }
  return (
    <span className={cn('inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold', toneMap[tone])}>
      {value}
    </span>
  )
}

// ---------------------------------------------------------------------------
// Section renderers
// ---------------------------------------------------------------------------

function StandardTable({ params }: { params: EchoParam[] }) {
  return (
    <table data-house-no-column-resize="true" className="w-full table-fixed border-collapse text-sm">
      <colgroup>
        <col style={{ width: '28%' }} />
        <col style={{ width: '22%' }} />
        <col style={{ width: '14%' }} />
        <col style={{ width: '28%' }} />
        <col style={{ width: '8%' }} />
      </colgroup>
      <thead>
        <tr className="border-b-2 border-[hsl(var(--tone-neutral-300))] bg-[hsl(var(--tone-neutral-50))]">
          <th className="house-table-head-text px-3 py-2 text-left">Parameter</th>
          <th className="house-table-head-text px-3 py-2 text-center">Normal</th>
          <th className="house-table-head-text px-3 py-2 text-center">Unit</th>
          <th className="house-table-head-text px-3 py-2 text-left">Notes</th>
          <th className="house-table-head-text px-1 py-2 text-center">Direction</th>
        </tr>
      </thead>
      <tbody>
        {params.map((p, idx) => (
          <tr
            key={`${p.name}-${idx}`}
            className="border-b border-[hsl(var(--stroke-soft)/0.4)] transition-colors duration-100 hover:bg-[hsl(var(--tone-neutral-50)/0.65)]"
          >
            <td className="house-table-cell-text px-3 py-2 font-medium text-[hsl(var(--foreground))]">{p.name}</td>
            <td className="house-table-cell-text whitespace-nowrap px-3 py-2 text-center">
              <NormalRangePill value={p.normal || '\u2014'} />
            </td>
            <td className="house-table-cell-text whitespace-nowrap px-3 py-2 text-center text-[hsl(var(--tone-neutral-500))]">{p.unit}</td>
            <td className="house-table-cell-text px-3 py-2 text-xs text-[hsl(var(--muted-foreground))]">{p.notes || '\u2014'}</td>
            <td className="house-table-cell-text px-1 py-2 text-center"><DirectionIndicator dir={p.direction} /></td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}

function GenderedTable({ params }: { params: EchoParam[] }) {
  return (
    <table data-house-no-column-resize="true" className="w-full table-fixed border-collapse text-sm">
      <colgroup>
        <col style={{ width: '24%' }} />
        <col style={{ width: '18%' }} />
        <col style={{ width: '18%' }} />
        <col style={{ width: '12%' }} />
        <col style={{ width: '20%' }} />
        <col style={{ width: '8%' }} />
      </colgroup>
      <thead>
        <tr className="border-b-2 border-[hsl(var(--tone-neutral-300))] bg-[hsl(var(--tone-neutral-50))]">
          <th className="house-table-head-text px-3 py-2 text-left">Parameter</th>
          <th className="house-table-head-text px-3 py-2 text-center">Normal (Male)</th>
          <th className="house-table-head-text px-3 py-2 text-center">Normal (Female)</th>
          <th className="house-table-head-text px-3 py-2 text-center">Unit</th>
          <th className="house-table-head-text px-3 py-2 text-left">Notes</th>
          <th className="house-table-head-text px-1 py-2 text-center">Direction</th>
        </tr>
      </thead>
      <tbody>
        {params.map((p, idx) => (
          <tr
            key={`${p.name}-${idx}`}
            className="border-b border-[hsl(var(--stroke-soft)/0.4)] transition-colors duration-100 hover:bg-[hsl(var(--tone-neutral-50)/0.65)]"
          >
            <td className="house-table-cell-text px-3 py-2 font-medium text-[hsl(var(--foreground))]">{p.name}</td>
            <td className="house-table-cell-text whitespace-nowrap px-3 py-2 text-center">
              <NormalRangePill value={p.normalMale || '\u2014'} />
            </td>
            <td className="house-table-cell-text whitespace-nowrap px-3 py-2 text-center">
              <NormalRangePill value={p.normalFemale || '\u2014'} />
            </td>
            <td className="house-table-cell-text whitespace-nowrap px-3 py-2 text-center text-[hsl(var(--tone-neutral-500))]">{p.unit}</td>
            <td className="house-table-cell-text px-3 py-2 text-xs text-[hsl(var(--muted-foreground))]">{p.notes || '\u2014'}</td>
            <td className="house-table-cell-text px-1 py-2 text-center"><DirectionIndicator dir={p.direction} /></td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}

function ValveGradingTable({ rows }: { rows: EchoGradingRow[] }) {
  return (
    <table data-house-no-column-resize="true" className="w-full table-fixed border-collapse text-sm">
      <colgroup>
        <col style={{ width: '20%' }} />
        <col style={{ width: '26%' }} />
        <col style={{ width: '27%' }} />
        <col style={{ width: '27%' }} />
      </colgroup>
      <thead>
        <tr className="border-b-2 border-[hsl(var(--tone-neutral-300))] bg-[hsl(var(--tone-neutral-50))]">
          <th className="house-table-head-text px-3 py-2 text-left">Valve</th>
          <th className="house-table-head-text px-3 py-2 text-center">Mild</th>
          <th className="house-table-head-text px-3 py-2 text-center">Moderate</th>
          <th className="house-table-head-text px-3 py-2 text-center">Severe</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((r) => (
          <tr
            key={r.valve}
            className="border-b border-[hsl(var(--stroke-soft)/0.4)] transition-colors duration-100 hover:bg-[hsl(var(--tone-neutral-50)/0.65)]"
          >
            <td className="house-table-cell-text px-3 py-2 font-medium text-[hsl(var(--foreground))]">{r.valve}</td>
            <td className="house-table-cell-text px-3 py-2 text-center text-xs">
              <SeverityPill value={r.mild} tone="positive" />
            </td>
            <td className="house-table-cell-text px-3 py-2 text-center text-xs">
              <SeverityPill value={r.moderate} tone="warning" />
            </td>
            <td className="house-table-cell-text px-3 py-2 text-center text-xs">
              <SeverityPill value={r.severe} tone="danger" />
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}

function PhProbabilityTable({ rows }: { rows: PhProbRow[] }) {
  return (
    <table data-house-no-column-resize="true" className="w-full table-fixed border-collapse text-sm">
      <colgroup>
        <col style={{ width: '30%' }} />
        <col style={{ width: '30%' }} />
        <col style={{ width: '40%' }} />
      </colgroup>
      <thead>
        <tr className="border-b-2 border-[hsl(var(--tone-neutral-300))] bg-[hsl(var(--tone-neutral-50))]">
          <th className="house-table-head-text px-3 py-2 text-left">TR Velocity</th>
          <th className="house-table-head-text px-3 py-2 text-center">Ancillary Signs</th>
          <th className="house-table-head-text px-3 py-2 text-center">Probability</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((r, idx) => (
          <tr
            key={`${r.trVelocity}-${idx}`}
            className="border-b border-[hsl(var(--stroke-soft)/0.4)] transition-colors duration-100 hover:bg-[hsl(var(--tone-neutral-50)/0.65)]"
          >
            <td className="house-table-cell-text px-3 py-2 font-medium text-[hsl(var(--foreground))]">{r.trVelocity}</td>
            <td className="house-table-cell-text px-3 py-2 text-center text-[hsl(var(--tone-neutral-500))]">{r.ancillarySigns}</td>
            <td className="house-table-cell-text px-3 py-2 text-center">
              <SeverityPill value={r.probability} tone={r.tone} />
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}

function DiastolicTable({ rows }: { rows: DiastolicRow[] }) {
  return (
    <table data-house-no-column-resize="true" className="w-full table-fixed border-collapse text-sm">
      <colgroup>
        <col style={{ width: '18%' }} />
        <col style={{ width: '20%' }} />
        <col style={{ width: '20%' }} />
        <col style={{ width: '22%' }} />
        <col style={{ width: '20%' }} />
      </colgroup>
      <thead>
        <tr className="border-b-2 border-[hsl(var(--tone-neutral-300))] bg-[hsl(var(--tone-neutral-50))]">
          <th className="house-table-head-text px-3 py-2 text-left">Parameter</th>
          <th className="house-table-head-text px-3 py-2 text-center">Normal</th>
          <th className="house-table-head-text px-3 py-2 text-center">
            <span className="text-[hsl(var(--tone-positive-600))]">Grade I</span>
          </th>
          <th className="house-table-head-text px-3 py-2 text-center">
            <span className="text-[hsl(var(--tone-warning-600))]">Grade II</span>
          </th>
          <th className="house-table-head-text px-3 py-2 text-center">
            <span className="text-[hsl(var(--tone-danger-600))]">Grade III</span>
          </th>
        </tr>
      </thead>
      <tbody>
        {rows.map((r) => (
          <tr
            key={r.parameter}
            className="border-b border-[hsl(var(--stroke-soft)/0.4)] transition-colors duration-100 hover:bg-[hsl(var(--tone-neutral-50)/0.65)]"
          >
            <td className="house-table-cell-text px-3 py-2 font-medium text-[hsl(var(--foreground))]">{r.parameter}</td>
            <td className="house-table-cell-text px-3 py-2 text-center">
              <NormalRangePill value={r.normal} />
            </td>
            <td className="house-table-cell-text px-3 py-2 text-center">
              <SeverityPill value={r.gradeI} tone="positive" />
            </td>
            <td className="house-table-cell-text px-3 py-2 text-center">
              <SeverityPill value={r.gradeII} tone="warning" />
            </td>
            <td className="house-table-cell-text px-3 py-2 text-center">
              <SeverityPill value={r.gradeIII} tone="danger" />
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}

// ---------------------------------------------------------------------------
// Main page
// ---------------------------------------------------------------------------

export function ExtractReferenceEchoPage() {
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({})

  const toggleCollapse = (key: string) => {
    setCollapsed((prev) => ({ ...prev, [key]: !prev[key] }))
  }

  return (
    <Stack data-house-role="page" space="lg">
      <Row align="center" gap="md" wrap={false} className="house-page-title-row">
        <SectionMarker tone="accent" size="title" className="self-stretch h-auto" />
        <PageHeader
          heading="Echo Reference Table"
          description="Normal echocardiographic ranges (ASE/EACVI Guidelines)"
          className="!ml-0 !mt-0"
        />
      </Row>

      {/* Separator */}
      <div className="border-b border-[hsl(var(--stroke-soft)/0.5)]" />

      <div className="flex flex-col gap-6">
        {ECHO_SECTIONS.map((section) => {
          const isCollapsed = !!collapsed[section.title]

          return (
            <div key={section.title} className="scroll-mt-20">
              {/* Section heading */}
              <button
                type="button"
                onClick={() => toggleCollapse(section.title)}
                className={cn(
                  'flex w-full items-stretch overflow-hidden border border-[hsl(var(--stroke-soft)/0.72)] bg-[hsl(var(--tone-neutral-50))] text-left transition-colors hover:bg-[hsl(var(--tone-neutral-100))]',
                  isCollapsed ? 'rounded-lg' : 'rounded-t-lg border-b border-b-[hsl(var(--stroke-soft))]',
                )}
              >
                <div className="w-1 shrink-0 bg-[hsl(var(--tone-positive-500))]" />
                <div className="flex flex-1 items-center gap-2.5 px-3.5 py-3">
                  <ChevronIcon open={!isCollapsed} />
                  <h2 className="flex-1 text-sm font-semibold tracking-tight text-[hsl(var(--foreground))]">
                    {section.title}
                  </h2>
                </div>
              </button>

              {!isCollapsed && (
                <div className="overflow-x-auto rounded-b-lg border-x border-b border-[hsl(var(--stroke-soft)/0.72)]">
                  {section.type === 'standard' && section.params && <StandardTable params={section.params} />}
                  {section.type === 'gendered' && section.params && <GenderedTable params={section.params} />}
                  {section.type === 'valve-grading' && section.valveRows && <ValveGradingTable rows={section.valveRows} />}
                  {section.type === 'ph-probability' && section.phRows && <PhProbabilityTable rows={section.phRows} />}
                  {section.type === 'diastolic' && section.diastolicRows && <DiastolicTable rows={section.diastolicRows} />}
                </div>
              )}
            </div>
          )
        })}
      </div>

      {/* Source attribution */}
      <div className="rounded-lg border border-[hsl(var(--stroke-soft)/0.5)] bg-[hsl(var(--tone-neutral-50)/0.5)] px-4 py-3">
        <p className="text-xs text-[hsl(var(--muted-foreground))]">
          <span className="font-semibold">Sources:</span> ASE/EACVI Guidelines for Cardiac Chamber Quantification (2015);
          ESC/ERS Guidelines for the diagnosis and treatment of pulmonary hypertension (2022);
          ASE Guidelines for Evaluation of Diastolic Function (2016).
          Values represent adult normal ranges. Clinical interpretation should account for patient context.
        </p>
      </div>
    </Stack>
  )
}
