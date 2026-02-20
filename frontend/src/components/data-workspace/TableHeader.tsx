import { MoreHorizontal, Plus } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import type { WorkingTable, WorkingTableMetadata } from '@/types/data-workspace'

type TableHeaderProps = {
  table: WorkingTable
  onUpdateTable: (table: WorkingTable) => void
  onOpenAddColumn: () => void
  onAddRow: () => void
  onRemoveTable: () => void
  onClearRows: () => void
}

const TABLE_TYPE_OPTIONS = [
  'Working table',
  'Extracted dataset',
  'Derived analysis table',
  'Reference lookup',
  'Manual curation',
  'Other',
]

function ensureMetadata(table: WorkingTable): WorkingTableMetadata {
  return {
    tableType: table.metadata?.tableType || 'Working table',
    description: table.metadata?.description || '',
    provenance: table.metadata?.provenance || '',
    conventions: table.metadata?.conventions || '',
    lastEditedAt: table.metadata?.lastEditedAt || new Date().toISOString(),
  }
}

function updateMetadata(table: WorkingTable, patch: Partial<WorkingTableMetadata>): WorkingTable {
  return {
    ...table,
    metadata: {
      ...ensureMetadata(table),
      ...patch,
      lastEditedAt: new Date().toISOString(),
    },
  }
}

function formatLastEdited(value?: string): string {
  if (!value) {
    return 'Not yet edited'
  }
  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) {
    return value
  }
  return parsed.toLocaleString()
}

export function TableHeader({
  table,
  onUpdateTable,
  onOpenAddColumn,
  onAddRow,
  onRemoveTable,
  onClearRows,
}: TableHeaderProps) {
  const metadata = ensureMetadata(table)

  return (
    <div className="space-y-3 rounded-md border border-border bg-muted/20 p-3">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-[280px] flex-1 space-y-1">
          <Label htmlFor={`table-name-${table.id}`} className="text-xs uppercase tracking-wide text-muted-foreground">
            Table name
          </Label>
          <Input
            id={`table-name-${table.id}`}
            value={table.name}
            onChange={(event) => onUpdateTable(updateMetadata({ ...table, name: event.target.value }, {}))}
            className="h-10 text-base font-semibold"
            placeholder="Working table name"
          />
        </div>

        <div className="flex items-center gap-2">
          <Button size="sm" variant="outline" onClick={onAddRow}>
            <Plus className="mr-1 h-4 w-4" />
            Add row
          </Button>
          <Button size="sm" variant="outline" onClick={onOpenAddColumn}>
            <Plus className="mr-1 h-4 w-4" />
            Add column
          </Button>
          <details className="relative">
            <summary className="flex h-9 w-9 cursor-pointer list-none items-center justify-center rounded-md border border-border bg-background text-sm hover:bg-muted">
              <MoreHorizontal className="h-4 w-4" />
            </summary>
            <div className="absolute right-0 z-20 mt-1 w-44 rounded-md border border-border bg-background p-1 shadow-md">
              <button
                type="button"
                className="w-full rounded px-2 py-1.5 text-left text-xs hover:bg-muted"
                onClick={onClearRows}
              >
                Clear all rows
              </button>
              <button
                type="button"
                className="w-full rounded px-2 py-1.5 text-left text-xs text-destructive hover:bg-destructive/10"
                onClick={onRemoveTable}
              >
                Delete table
              </button>
            </div>
          </details>
        </div>
      </div>

      <div className="grid gap-2 md:grid-cols-2">
        <div className="space-y-1">
          <Label htmlFor={`table-type-${table.id}`}>Table type</Label>
          <select
            id={`table-type-${table.id}`}
            className="h-9 w-full rounded-md border border-border bg-background px-3 text-sm"
            value={metadata.tableType}
            onChange={(event) => onUpdateTable(updateMetadata(table, { tableType: event.target.value }))}
          >
            {TABLE_TYPE_OPTIONS.map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </select>
        </div>

        <div className="space-y-1">
          <Label htmlFor={`table-provenance-${table.id}`}>Provenance / source</Label>
          <Input
            id={`table-provenance-${table.id}`}
            value={metadata.provenance}
            onChange={(event) => onUpdateTable(updateMetadata(table, { provenance: event.target.value }))}
            placeholder="e.g., imported from source workbook"
          />
        </div>

        <div className="space-y-1 md:col-span-2">
          <Label htmlFor={`table-description-${table.id}`}>Description</Label>
          <textarea
            id={`table-description-${table.id}`}
            className="min-h-20 w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
            value={metadata.description}
            onChange={(event) => onUpdateTable(updateMetadata(table, { description: event.target.value }))}
            placeholder="Describe table purpose and scope."
          />
        </div>

        <div className="space-y-1 md:col-span-2">
          <Label htmlFor={`table-conventions-${table.id}`}>Conventions / units</Label>
          <Input
            id={`table-conventions-${table.id}`}
            value={metadata.conventions}
            onChange={(event) => onUpdateTable(updateMetadata(table, { conventions: event.target.value }))}
            placeholder="e.g., dates ISO-8601, units in mmol/L"
          />
        </div>
      </div>

      <p className="text-xs text-muted-foreground">Last edited: {formatLastEdited(metadata.lastEditedAt)}</p>
    </div>
  )
}

