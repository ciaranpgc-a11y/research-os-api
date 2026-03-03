import type { Meta, StoryObj } from '@storybook/react-vite'
import {
  LegacyTablePrimitive,
  LegacyTableHead,
  LegacyTableHeaderCell,
  LegacyTableBody,
  LegacyTableRow,
  LegacyTableCell,
} from '@/components/legacy/primitives/LegacyTablePrimitive'
import { StoryFrame } from '../_helpers/StoryFrame'

const meta = {
  title: 'Design System/Composites/Table Primitive',
  component: LegacyTablePrimitive,
  parameters: {
    layout: 'fullscreen',
    docs: {
      description: {
        component:
          'Token-driven table composite with semantic HTML, striped/compact variants, sortable headers, selectable rows, and built-in empty/loading states.',
      },
    },
  },
} satisfies Meta<typeof LegacyTablePrimitive>

export default meta
type Story = StoryObj<typeof meta>

const sampleRows = [
  { id: 'PUB-1001', title: 'Graph Embeddings for Search', status: 'Published', updated: '2026-03-01' },
  { id: 'PUB-1002', title: 'Biomedical Entity Linking', status: 'In Review', updated: '2026-03-01' },
  { id: 'PUB-1003', title: 'Citation Drift Detection', status: 'Draft', updated: '2026-02-18' },
  { id: 'PUB-1004', title: 'Temporal Ranking Signals', status: 'Published', updated: '2026-02-16' },
  { id: 'PUB-1005', title: 'Neural Index Compression', status: 'Archived', updated: '2026-02-14' },
]

export const Showcase: Story = {
  render: () => (
    <StoryFrame
      title="TablePrimitive"
      subtitle="Simple, compact, empty, loading, and selectable/sortable configurations"
    >
      <div className="space-y-6" data-ui="table-primitive-story">
        <section className="space-y-2" data-ui="table-primitive-simple-section">
          <p className="text-label text-muted-foreground" data-ui="table-primitive-simple-label">Simple 5-row table</p>
          <div className="overflow-x-auto" data-ui="table-primitive-simple-wrap">
            <LegacyTablePrimitive>
              <LegacyTableHead>
                <LegacyTableRow>
                  <LegacyTableHeaderCell sortable sortDirection="none">Publication</LegacyTableHeaderCell>
                  <LegacyTableHeaderCell>Status</LegacyTableHeaderCell>
                  <LegacyTableHeaderCell>Updated</LegacyTableHeaderCell>
                </LegacyTableRow>
              </LegacyTableHead>
              <LegacyTableBody>
                {sampleRows.map((row) => (
                  <LegacyTableRow key={row.id}>
                    <LegacyTableCell>{row.title}</LegacyTableCell>
                    <LegacyTableCell secondary>{row.status}</LegacyTableCell>
                    <LegacyTableCell secondary>{row.updated}</LegacyTableCell>
                  </LegacyTableRow>
                ))}
              </LegacyTableBody>
            </LegacyTablePrimitive>
          </div>
        </section>

        <section className="space-y-2" data-ui="table-primitive-compact-section">
          <p className="text-label text-muted-foreground" data-ui="table-primitive-compact-label">Compact variant</p>
          <div className="overflow-x-auto" data-ui="table-primitive-compact-wrap">
            <LegacyTablePrimitive compact>
              <LegacyTableHead>
                <LegacyTableRow>
                  <LegacyTableHeaderCell>Publication ID</LegacyTableHeaderCell>
                  <LegacyTableHeaderCell>State</LegacyTableHeaderCell>
                </LegacyTableRow>
              </LegacyTableHead>
              <LegacyTableBody>
                {sampleRows.slice(0, 3).map((row) => (
                  <LegacyTableRow key={row.id}>
                    <LegacyTableCell>{row.id}</LegacyTableCell>
                    <LegacyTableCell secondary>{row.status}</LegacyTableCell>
                  </LegacyTableRow>
                ))}
              </LegacyTableBody>
            </LegacyTablePrimitive>
          </div>
        </section>

        <section className="space-y-2" data-ui="table-primitive-empty-section">
          <p className="text-label text-muted-foreground" data-ui="table-primitive-empty-label">Empty state</p>
          <div className="overflow-x-auto" data-ui="table-primitive-empty-wrap">
            <LegacyTablePrimitive>
              <LegacyTableHead>
                <LegacyTableRow>
                  <LegacyTableHeaderCell>Publication</LegacyTableHeaderCell>
                  <LegacyTableHeaderCell>Status</LegacyTableHeaderCell>
                </LegacyTableRow>
              </LegacyTableHead>
              <LegacyTableBody isEmpty columnCount={2} emptyMessage="No publications available for this filter." />
            </LegacyTablePrimitive>
          </div>
        </section>

        <section className="space-y-2" data-ui="table-primitive-loading-section">
          <p className="text-label text-muted-foreground" data-ui="table-primitive-loading-label">Loading skeleton rows</p>
          <div className="overflow-x-auto" data-ui="table-primitive-loading-wrap">
            <LegacyTablePrimitive>
              <LegacyTableHead>
                <LegacyTableRow>
                  <LegacyTableHeaderCell>Publication</LegacyTableHeaderCell>
                  <LegacyTableHeaderCell>Status</LegacyTableHeaderCell>
                  <LegacyTableHeaderCell>Updated</LegacyTableHeaderCell>
                </LegacyTableRow>
              </LegacyTableHead>
              <LegacyTableBody isLoading columnCount={3} loadingRowCount={4} />
            </LegacyTablePrimitive>
          </div>
        </section>

        <section className="space-y-2" data-ui="table-primitive-selectable-section">
          <p className="text-label text-muted-foreground" data-ui="table-primitive-selectable-label">Selectable rows (CheckboxPrimitive pending)</p>
          <div className="overflow-x-auto" data-ui="table-primitive-selectable-wrap">
            <LegacyTablePrimitive striped hoverable>
              <LegacyTableHead>
                <LegacyTableRow>
                  <LegacyTableHeaderCell selection />
                  <LegacyTableHeaderCell sortable sortDirection="none">Publication</LegacyTableHeaderCell>
                  <LegacyTableHeaderCell>Status</LegacyTableHeaderCell>
                </LegacyTableRow>
              </LegacyTableHead>
              <LegacyTableBody>
                {sampleRows.slice(0, 4).map((row, index) => (
                  <LegacyTableRow key={row.id}>
                    <LegacyTableCell selection checked={index % 2 === 0} />
                    <LegacyTableCell>{row.title}</LegacyTableCell>
                    <LegacyTableCell secondary>{row.status}</LegacyTableCell>
                  </LegacyTableRow>
                ))}
              </LegacyTableBody>
            </LegacyTablePrimitive>
          </div>
        </section>

        <section className="rounded-[var(--radius-sm)] border border-[hsl(var(--border))] bg-[hsl(var(--tone-neutral-50))] p-3" data-ui="table-primitive-a11y-note">
          <p className="text-label text-[hsl(var(--foreground))]">Accessibility</p>
          <p className="text-body text-[hsl(var(--muted-foreground))]">
            Uses semantic table elements (`table`, `thead`, `tbody`, `th`, `tr`, `td`), sortable headers expose `aria-sort`,
            and cells are keyboard-focusable to support tab navigation across data.
          </p>
        </section>
      </div>
    </StoryFrame>
  ),
}
