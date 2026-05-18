import { useState } from 'react'

import { PageHeader, Row, Stack } from '@/components/primitives'
import { SectionMarker } from '@/components/patterns'
import { cn } from '@/lib/utils'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type RhcParam = {
  name: string
  normalRange: string
  unit: string
  notes?: string
  direction?: 'high' | 'low' | 'both'
}

type RhcSection = {
  title: string
  params: RhcParam[]
}

// ---------------------------------------------------------------------------
// Reference data — ESC/ERS PH Guidelines
// ---------------------------------------------------------------------------

const RHC_SECTIONS: RhcSection[] = [
  {
    title: 'Right Atrial Pressure',
    params: [
      { name: 'RA Mean', normalRange: '1\u20135', unit: 'mmHg', direction: 'high' },
      { name: 'RA a-wave', normalRange: '2\u201310', unit: 'mmHg', direction: 'high' },
      { name: 'RA v-wave', normalRange: '2\u201310', unit: 'mmHg', direction: 'high' },
    ],
  },
  {
    title: 'Right Ventricular Pressure',
    params: [
      { name: 'RV Systolic', normalRange: '15\u201330', unit: 'mmHg', direction: 'high' },
      { name: 'RV Diastolic (EDP)', normalRange: '0\u20138', unit: 'mmHg', direction: 'high' },
    ],
  },
  {
    title: 'Pulmonary Artery Pressure',
    params: [
      { name: 'PA Systolic', normalRange: '15\u201330', unit: 'mmHg', direction: 'high' },
      { name: 'PA Diastolic', normalRange: '4\u201312', unit: 'mmHg', direction: 'high' },
      { name: 'PA Mean', normalRange: '10\u201320', unit: 'mmHg', notes: '>20 = elevated; \u226525 = PH', direction: 'high' },
    ],
  },
  {
    title: 'Pulmonary Capillary Wedge Pressure',
    params: [
      { name: 'PCWP Mean', normalRange: '6\u201312', unit: 'mmHg', notes: '>15 = post-capillary', direction: 'high' },
    ],
  },
  {
    title: 'Cardiac Output & Index',
    params: [
      { name: 'Cardiac Output', normalRange: '4.0\u20138.0', unit: 'L/min', direction: 'low' },
      { name: 'Cardiac Index', normalRange: '2.5\u20134.0', unit: 'L/min/m\u00B2', direction: 'low' },
    ],
  },
  {
    title: 'Pulmonary Vascular Resistance',
    params: [
      { name: 'PVR', normalRange: '<2', unit: 'Wood units', notes: '>3 WU = elevated', direction: 'high' },
      { name: 'PVR', normalRange: '<160', unit: 'dyn\u00B7s\u00B7cm\u207B\u2075', direction: 'high' },
    ],
  },
  {
    title: 'Transpulmonary Gradient',
    params: [
      { name: 'TPG', normalRange: '<12', unit: 'mmHg', notes: '>12 = pre-capillary component', direction: 'high' },
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

// ---------------------------------------------------------------------------
// Main page
// ---------------------------------------------------------------------------

export function ExtractReferenceRhcPage() {
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({})

  const toggleCollapse = (key: string) => {
    setCollapsed((prev) => ({ ...prev, [key]: !prev[key] }))
  }

  return (
    <Stack data-house-role="page" space="lg">
      <Row align="center" gap="md" wrap={false} className="house-page-title-row">
        <SectionMarker tone="accent" size="title" className="self-stretch h-auto" />
        <PageHeader
          heading="RHC Reference Table"
          description="Normal haemodynamic ranges (ESC/ERS PH Guidelines)"
          className="!ml-0 !mt-0"
        />
      </Row>

      {/* Separator */}
      <div className="border-b border-[hsl(var(--stroke-soft)/0.5)]" />

      <div className="flex flex-col gap-6">
        {RHC_SECTIONS.map((section) => {
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
                  <table data-house-no-column-resize="true" className="w-full table-fixed border-collapse text-sm">
                    <colgroup>
                      <col style={{ width: '28%' }} />
                      <col style={{ width: '18%' }} />
                      <col style={{ width: '18%' }} />
                      <col style={{ width: '28%' }} />
                      <col style={{ width: '8%' }} />
                    </colgroup>
                    <thead>
                      <tr className="border-b-2 border-[hsl(var(--tone-neutral-300))] bg-[hsl(var(--tone-neutral-50))]">
                        <th className="house-table-head-text px-3 py-2 text-left">Parameter</th>
                        <th className="house-table-head-text px-3 py-2 text-center">Normal Range</th>
                        <th className="house-table-head-text px-3 py-2 text-center">Unit</th>
                        <th className="house-table-head-text px-3 py-2 text-left">Notes</th>
                        <th className="house-table-head-text px-1 py-2 text-center">Direction</th>
                      </tr>
                    </thead>
                    <tbody>
                      {section.params.map((p, idx) => (
                        <tr
                          key={`${p.name}-${idx}`}
                          className="border-b border-[hsl(var(--stroke-soft)/0.4)] transition-colors duration-100 hover:bg-[hsl(var(--tone-neutral-50)/0.65)]"
                        >
                          <td className="house-table-cell-text px-3 py-2 font-medium text-[hsl(var(--foreground))]">
                            {p.name}
                          </td>
                          <td className="house-table-cell-text whitespace-nowrap px-3 py-2 text-center">
                            <span className="inline-flex items-center rounded-full bg-[hsl(var(--tone-positive-100)/0.6)] px-2.5 py-0.5 text-xs font-semibold text-[hsl(var(--tone-positive-700))]">
                              {p.normalRange}
                            </span>
                          </td>
                          <td className="house-table-cell-text whitespace-nowrap px-3 py-2 text-center text-[hsl(var(--tone-neutral-500))]">
                            {p.unit}
                          </td>
                          <td className="house-table-cell-text px-3 py-2 text-xs text-[hsl(var(--muted-foreground))]">
                            {p.notes || '\u2014'}
                          </td>
                          <td className="house-table-cell-text px-1 py-2 text-center">
                            <DirectionIndicator dir={p.direction} />
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )
        })}
      </div>

      {/* Source attribution */}
      <div className="rounded-lg border border-[hsl(var(--stroke-soft)/0.5)] bg-[hsl(var(--tone-neutral-50)/0.5)] px-4 py-3">
        <p className="text-xs text-[hsl(var(--muted-foreground))]">
          <span className="font-semibold">Source:</span> ESC/ERS Guidelines for the diagnosis and treatment of pulmonary hypertension (2022).
          Values represent adult normal ranges. Clinical interpretation should account for patient context.
        </p>
      </div>
    </Stack>
  )
}
