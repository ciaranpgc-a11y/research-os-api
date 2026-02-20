import { Download, MoreHorizontal, Plus, Trash2 } from 'lucide-react'
import { useMemo } from 'react'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import type { WorkingTable, WorkingTableAbbreviation, WorkingTableColumnMeta } from '@/types/data-workspace'

type TableTabsProps = {
  table: WorkingTable
  onUpdateTable: (table: WorkingTable) => void
  onOpenAddColumn: () => void
}

type ColumnSummary = {
  column: string
  missingCount: number
  missingPercent: number
  uniqueCount: number
  numericCount: number
  numericMin: number | null
  numericMax: number | null
  numericMean: number | null
  numericMedian: number | null
}

function ensureColumnMeta(table: WorkingTable): Record<string, WorkingTableColumnMeta> {
  const next: Record<string, WorkingTableColumnMeta> = {}
  for (const column of table.columns) {
    next[column] = table.columnMeta?.[column] ?? { dataType: 'text' }
  }
  return next
}

function toOrderedRows(columns: string[], rows: Record<string, string>[]): Record<string, string>[] {
  return rows.map((row) =>
    columns.reduce<Record<string, string>>((accumulator, column) => {
      accumulator[column] = row[column] ?? ''
      return accumulator
    }, {}),
  )
}

function uniqueColumnName(name: string, columns: string[], skipIndex?: number): string {
  const base = name.trim() || 'Column'
  const existing = columns.filter((_, index) => index !== skipIndex)
  if (!existing.includes(base)) {
    return base
  }
  let suffix = 2
  while (existing.includes(`${base} ${suffix}`)) {
    suffix += 1
  }
  return `${base} ${suffix}`
}

function alphabetLabel(index: number): string {
  const base = 'abcdefghijklmnopqrstuvwxyz'
  if (index < base.length) {
    return base[index]
  }
  const first = Math.floor(index / base.length) - 1
  const second = index % base.length
  return `${base[first]}${base[second]}`
}

function parseNumeric(values: string[]): number[] {
  return values
    .map((value) => Number(value))
    .filter((value) => Number.isFinite(value))
}

function median(values: number[]): number | null {
  if (values.length === 0) {
    return null
  }
  const sorted = [...values].sort((left, right) => left - right)
  const middle = Math.floor(sorted.length / 2)
  if (sorted.length % 2 === 0) {
    return (sorted[middle - 1] + sorted[middle]) / 2
  }
  return sorted[middle]
}

function downloadFile(filename: string, content: string, mimeType: string) {
  const blob = new Blob([content], { type: mimeType })
  const url = window.URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = filename
  document.body.appendChild(anchor)
  anchor.click()
  anchor.remove()
  window.URL.revokeObjectURL(url)
}

export function TableTabs({ table, onUpdateTable, onOpenAddColumn }: TableTabsProps) {
  const columnMeta = useMemo(() => ensureColumnMeta(table), [table])
  const footnotes = table.footnotes ?? []
  const abbreviations = table.abbreviations ?? []

  const columnSummaries = useMemo<ColumnSummary[]>(() => {
    return table.columns.map((column) => {
      const columnValues = table.rows.map((row) => (row[column] ?? '').trim())
      const missingCount = columnValues.filter((value) => value.length === 0).length
      const nonMissingValues = columnValues.filter((value) => value.length > 0)
      const uniqueCount = new Set(nonMissingValues).size
      const numericValues = parseNumeric(nonMissingValues)
      const numericCount = numericValues.length
      const numericMean =
        numericCount === 0 ? null : numericValues.reduce((sum, value) => sum + value, 0) / numericCount
      return {
        column,
        missingCount,
        missingPercent: table.rows.length === 0 ? 0 : (missingCount / table.rows.length) * 100,
        uniqueCount,
        numericCount,
        numericMin: numericCount === 0 ? null : Math.min(...numericValues),
        numericMax: numericCount === 0 ? null : Math.max(...numericValues),
        numericMean,
        numericMedian: median(numericValues),
      }
    })
  }, [table.columns, table.rows])

  const validationChecks = useMemo(() => {
    const duplicateColumns = table.columns.filter((column, index) => table.columns.indexOf(column) !== index)
    const emptyRows = table.rows.filter((row) => table.columns.every((column) => (row[column] ?? '').trim().length === 0))
    const highMissingColumns = columnSummaries.filter((summary) => summary.missingPercent >= 50)
    return {
      duplicateColumns,
      emptyRowsCount: emptyRows.length,
      highMissingColumns,
    }
  }, [columnSummaries, table.columns, table.rows])

  const updateTable = (next: WorkingTable) => {
    onUpdateTable({
      ...next,
      rows: toOrderedRows(next.columns, next.rows),
      metadata: {
        tableType: next.metadata?.tableType || 'Working table',
        description: next.metadata?.description || '',
        provenance: next.metadata?.provenance || '',
        conventions: next.metadata?.conventions || '',
        lastEditedAt: new Date().toISOString(),
      },
      columnMeta: ensureColumnMeta(next),
    })
  }

  const onRenameColumn = (columnIndex: number, value: string) => {
    const oldColumn = table.columns[columnIndex]
    const nextColumn = uniqueColumnName(value, table.columns, columnIndex)
    const nextColumns = table.columns.map((column, index) => (index === columnIndex ? nextColumn : column))
    const nextRows = table.rows.map((row) =>
      nextColumns.reduce<Record<string, string>>((accumulator, column, index) => {
        const sourceColumn = table.columns[index]
        accumulator[column] = row[sourceColumn] ?? ''
        return accumulator
      }, {}),
    )
    const nextMeta: Record<string, WorkingTableColumnMeta> = {}
    for (const column of table.columns) {
      if (column === oldColumn) {
        nextMeta[nextColumn] = columnMeta[oldColumn] ?? { dataType: 'text' }
      } else {
        nextMeta[column] = columnMeta[column] ?? { dataType: 'text' }
      }
    }
    updateTable({
      ...table,
      columns: nextColumns,
      rows: nextRows,
      columnMeta: nextMeta,
    })
  }

  const onRemoveColumn = (columnIndex: number) => {
    if (table.columns.length <= 1) {
      return
    }
    const removed = table.columns[columnIndex]
    const nextColumns = table.columns.filter((_, index) => index !== columnIndex)
    const nextRows = table.rows.map((row) =>
      nextColumns.reduce<Record<string, string>>((accumulator, column) => {
        accumulator[column] = row[column] ?? ''
        return accumulator
      }, {}),
    )
    const nextMeta = { ...columnMeta }
    delete nextMeta[removed]
    updateTable({
      ...table,
      columns: nextColumns,
      rows: nextRows,
      columnMeta: nextMeta,
    })
  }

  const onUpdateCell = (rowIndex: number, column: string, value: string) => {
    updateTable({
      ...table,
      rows: table.rows.map((row, index) => (index === rowIndex ? { ...row, [column]: value } : row)),
    })
  }

  const onRemoveRow = (rowIndex: number) => {
    updateTable({
      ...table,
      rows: table.rows.filter((_, index) => index !== rowIndex),
    })
  }

  const onAddFootnote = () => {
    updateTable({
      ...table,
      footnotes: [...footnotes, ''],
    })
  }

  const onUpdateFootnote = (index: number, value: string) => {
    updateTable({
      ...table,
      footnotes: footnotes.map((item, itemIndex) => (itemIndex === index ? value : item)),
    })
  }

  const onRemoveFootnote = (index: number) => {
    updateTable({
      ...table,
      footnotes: footnotes.filter((_, itemIndex) => itemIndex !== index),
    })
  }

  const onAddAbbreviation = () => {
    updateTable({
      ...table,
      abbreviations: [...abbreviations, { short: '', long: '' }],
    })
  }

  const onUpdateAbbreviation = (index: number, patch: Partial<WorkingTableAbbreviation>) => {
    updateTable({
      ...table,
      abbreviations: abbreviations.map((item, itemIndex) => (itemIndex === index ? { ...item, ...patch } : item)),
    })
  }

  const onRemoveAbbreviation = (index: number) => {
    updateTable({
      ...table,
      abbreviations: abbreviations.filter((_, itemIndex) => itemIndex !== index),
    })
  }

  const onExportCsv = () => {
    const header = table.columns.join(',')
    const lines = table.rows.map((row) =>
      table.columns
        .map((column) => {
          const value = row[column] ?? ''
          if (value.includes(',') || value.includes('"') || value.includes('\n')) {
            return `"${value.replace(/"/g, '""')}"`
          }
          return value
        })
        .join(','),
    )
    downloadFile(`${table.name || 'working-table'}.csv`, [header, ...lines].join('\n'), 'text/csv;charset=utf-8')
  }

  const onExportJson = () => {
    const payload = {
      name: table.name,
      metadata: table.metadata,
      columns: table.columns,
      columnMeta: columnMeta,
      rows: table.rows,
      footnotes: footnotes,
      abbreviations: abbreviations,
    }
    downloadFile(
      `${table.name || 'working-table'}.json`,
      JSON.stringify(payload, null, 2),
      'application/json;charset=utf-8',
    )
  }

  return (
    <Tabs defaultValue="grid">
      <TabsList className="grid w-full grid-cols-5">
        <TabsTrigger value="grid">Grid</TabsTrigger>
        <TabsTrigger value="footnotes">Footnotes</TabsTrigger>
        <TabsTrigger value="summary">Summary</TabsTrigger>
        <TabsTrigger value="validate">Validate</TabsTrigger>
        <TabsTrigger value="export">Export</TabsTrigger>
      </TabsList>

      <TabsContent value="grid" className="space-y-3">
        <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
          <Badge variant="outline">{table.columns.length} columns</Badge>
          <Badge variant="outline">{table.rows.length} rows</Badge>
          <Button size="sm" variant="outline" onClick={onOpenAddColumn}>
            <Plus className="mr-1 h-3.5 w-3.5" />
            Add column
          </Button>
        </div>

        <div className="max-h-[520px] overflow-auto rounded-md border border-border">
          <table className="w-full min-w-[720px] text-xs">
            <thead className="bg-muted/70">
              <tr>
                <th className="sticky left-0 top-0 z-30 border-b border-r border-border bg-muted px-2 py-1 text-left">#</th>
                {table.columns.map((column, columnIndex) => (
                  <th key={column} className="sticky top-0 z-20 border-b border-r border-border bg-muted px-2 py-1">
                    <div className="space-y-1">
                      <div className="flex items-center gap-1">
                        <Input
                          value={column}
                          onChange={(event) => onRenameColumn(columnIndex, event.target.value)}
                          className="h-7 text-xs"
                        />
                        <details className="relative">
                          <summary className="flex h-7 w-7 cursor-pointer list-none items-center justify-center rounded border border-border bg-background">
                            <MoreHorizontal className="h-3.5 w-3.5" />
                          </summary>
                          <div className="absolute right-0 z-40 mt-1 w-28 rounded border border-border bg-background p-1 shadow-sm">
                            <button
                              type="button"
                              className="w-full rounded px-2 py-1 text-left text-[11px] text-destructive hover:bg-destructive/10"
                              onClick={() => onRemoveColumn(columnIndex)}
                            >
                              Remove
                            </button>
                          </div>
                        </details>
                      </div>
                      <p className="text-[11px] text-muted-foreground">
                        {columnMeta[column]?.dataType || 'text'}
                        {columnMeta[column]?.unit ? ` • ${columnMeta[column]?.unit}` : ''}
                        {columnMeta[column]?.roleTag ? ` • ${columnMeta[column]?.roleTag}` : ''}
                      </p>
                    </div>
                  </th>
                ))}
                <th className="sticky top-0 z-20 border-b border-border bg-muted px-2 py-1 text-right">Row</th>
              </tr>
            </thead>
            <tbody>
              {table.rows.map((row, rowIndex) => (
                <tr key={`${table.id}-row-${rowIndex}`} className="odd:bg-muted/20">
                  <td className="sticky left-0 z-10 border-b border-r border-border bg-background px-2 py-1 text-muted-foreground">
                    {rowIndex + 1}
                  </td>
                  {table.columns.map((column) => (
                    <td key={`${rowIndex}-${column}`} className="border-b border-r border-border/70 px-2 py-1">
                      <Input
                        value={row[column] ?? ''}
                        onChange={(event) => onUpdateCell(rowIndex, column, event.target.value)}
                        className="h-7 text-xs"
                      />
                    </td>
                  ))}
                  <td className="border-b border-border/70 px-2 py-1 text-right">
                    <details className="relative inline-block">
                      <summary className="flex h-7 w-7 cursor-pointer list-none items-center justify-center rounded border border-border bg-background">
                        <MoreHorizontal className="h-3.5 w-3.5" />
                      </summary>
                      <div className="absolute right-0 z-30 mt-1 w-28 rounded border border-border bg-background p-1 shadow-sm">
                        <button
                          type="button"
                          className="w-full rounded px-2 py-1 text-left text-[11px] text-destructive hover:bg-destructive/10"
                          onClick={() => onRemoveRow(rowIndex)}
                        >
                          Delete row
                        </button>
                      </div>
                    </details>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </TabsContent>

      <TabsContent value="footnotes" className="space-y-3">
        <details open className="rounded-md border border-border p-3">
          <summary className="cursor-pointer text-sm font-medium">Footnotes</summary>
          <div className="mt-3 space-y-2">
            {footnotes.length === 0 ? <p className="text-xs text-muted-foreground">No footnotes yet.</p> : null}
            {footnotes.map((footnote, index) => (
              <div key={`footnote-${index}`} className="space-y-1 rounded border border-border/60 p-2">
                <p className="text-xs font-medium">{alphabetLabel(index)})</p>
                <textarea
                  className="min-h-16 w-full rounded-md border border-border bg-background px-2 py-1.5 text-xs"
                  value={footnote}
                  onChange={(event) => onUpdateFootnote(index, event.target.value)}
                />
                <Button size="sm" variant="ghost" onClick={() => onRemoveFootnote(index)}>
                  <Trash2 className="mr-1 h-3.5 w-3.5" />
                  Remove
                </Button>
              </div>
            ))}
            <Button size="sm" variant="outline" onClick={onAddFootnote}>
              <Plus className="mr-1 h-3.5 w-3.5" />
              Add footnote
            </Button>
          </div>
        </details>

        <details open className="rounded-md border border-border p-3">
          <summary className="cursor-pointer text-sm font-medium">Abbreviations</summary>
          <div className="mt-3 space-y-2">
            {abbreviations.length === 0 ? <p className="text-xs text-muted-foreground">No abbreviations yet.</p> : null}
            {abbreviations.map((item, index) => (
              <div key={`abbr-${index}`} className="grid gap-2 rounded border border-border/60 p-2 md:grid-cols-[160px_minmax(0,1fr)_auto]">
                <Input
                  value={item.short}
                  onChange={(event) => onUpdateAbbreviation(index, { short: event.target.value })}
                  placeholder="Abbreviation"
                />
                <Input
                  value={item.long}
                  onChange={(event) => onUpdateAbbreviation(index, { long: event.target.value })}
                  placeholder="Meaning"
                />
                <Button size="sm" variant="ghost" onClick={() => onRemoveAbbreviation(index)}>
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </div>
            ))}
            <Button size="sm" variant="outline" onClick={onAddAbbreviation}>
              <Plus className="mr-1 h-3.5 w-3.5" />
              Add abbreviation
            </Button>
          </div>
        </details>
      </TabsContent>

      <TabsContent value="summary" className="space-y-3">
        <div className="grid gap-2">
          {columnSummaries.map((summary) => (
            <div key={summary.column} className="rounded-md border border-border p-2 text-xs">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="font-medium">{summary.column}</p>
                <p className="text-muted-foreground">
                  Missing {summary.missingCount}/{table.rows.length} ({summary.missingPercent.toFixed(1)}%)
                </p>
              </div>
              <p className="text-muted-foreground">Unique values: {summary.uniqueCount}</p>
              {summary.numericCount > 0 ? (
                <p className="text-muted-foreground">
                  Numeric summary: n={summary.numericCount}, min={summary.numericMin}, median={summary.numericMedian}, mean=
                  {summary.numericMean?.toFixed(3)}, max={summary.numericMax}
                </p>
              ) : (
                <p className="text-muted-foreground">No numeric values detected for summary statistics.</p>
              )}
            </div>
          ))}
        </div>
      </TabsContent>

      <TabsContent value="validate" className="space-y-3">
        <div className="rounded-md border border-border p-3 text-xs">
          <p className="font-medium">Validation checks</p>
          <ul className="mt-2 space-y-1 text-muted-foreground">
            <li>Duplicate columns: {validationChecks.duplicateColumns.length}</li>
            <li>Empty rows: {validationChecks.emptyRowsCount}</li>
            <li>Columns with &gt;=50% missing values: {validationChecks.highMissingColumns.length}</li>
          </ul>
          {validationChecks.highMissingColumns.length > 0 ? (
            <div className="mt-2 space-y-1">
              {validationChecks.highMissingColumns.map((item) => (
                <p key={item.column} className="rounded bg-amber-50 px-2 py-1 text-amber-700">
                  {item.column}: {item.missingPercent.toFixed(1)}% missing
                </p>
              ))}
            </div>
          ) : null}
        </div>
      </TabsContent>

      <TabsContent value="export" className="space-y-3">
        <p className="text-sm text-muted-foreground">Export current table state for downstream analysis or documentation.</p>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={onExportCsv}>
            <Download className="mr-1 h-4 w-4" />
            Export CSV
          </Button>
          <Button variant="outline" onClick={onExportJson}>
            <Download className="mr-1 h-4 w-4" />
            Export JSON
          </Button>
        </div>
      </TabsContent>
    </Tabs>
  )
}

