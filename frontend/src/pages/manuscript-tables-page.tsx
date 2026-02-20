import { useEffect, useMemo, useState } from 'react'
import { Plus, Trash2 } from 'lucide-react'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { ScrollArea } from '@/components/ui/scroll-area'
import { PageFrame } from '@/pages/page-frame'
import { useDataWorkspaceStore } from '@/store/use-data-workspace-store'
import type { ManuscriptTable } from '@/types/data-workspace'

function uniqueColumnName(base: string, columns: string[]): string {
  const trimmed = base.trim() || 'Column'
  if (!columns.includes(trimmed)) {
    return trimmed
  }
  let suffix = 2
  while (columns.includes(`${trimmed} ${suffix}`)) {
    suffix += 1
  }
  return `${trimmed} ${suffix}`
}

export function ManuscriptTablesPage() {
  const manuscriptTables = useDataWorkspaceStore((state) => state.manuscriptTables)
  const createManuscriptTable = useDataWorkspaceStore((state) => state.createManuscriptTable)
  const setManuscriptTable = useDataWorkspaceStore((state) => state.setManuscriptTable)
  const removeManuscriptTable = useDataWorkspaceStore((state) => state.removeManuscriptTable)

  const [selectedTableId, setSelectedTableId] = useState<string | null>(null)
  const [newColumnName, setNewColumnName] = useState('')

  useEffect(() => {
    if (manuscriptTables.length === 0) {
      setSelectedTableId(null)
      return
    }
    if (selectedTableId && manuscriptTables.some((table) => table.id === selectedTableId)) {
      return
    }
    setSelectedTableId(manuscriptTables[0].id)
  }, [manuscriptTables, selectedTableId])

  const selectedTable = useMemo(
    () => manuscriptTables.find((table) => table.id === selectedTableId) ?? null,
    [manuscriptTables, selectedTableId],
  )

  const updateTable = (table: ManuscriptTable) => {
    setManuscriptTable(table)
  }

  const onAddTable = () => {
    const id = createManuscriptTable()
    setSelectedTableId(id)
  }

  const onAddRow = () => {
    if (!selectedTable) {
      return
    }
    const row = selectedTable.columns.map(() => '')
    updateTable({
      ...selectedTable,
      rows: [...selectedTable.rows, row],
    })
  }

  const onRemoveRow = (rowIndex: number) => {
    if (!selectedTable) {
      return
    }
    updateTable({
      ...selectedTable,
      rows: selectedTable.rows.filter((_, index) => index !== rowIndex),
    })
  }

  const onAddColumn = () => {
    if (!selectedTable) {
      return
    }
    const columnName = uniqueColumnName(
      newColumnName || `Column ${selectedTable.columns.length + 1}`,
      selectedTable.columns,
    )
    updateTable({
      ...selectedTable,
      columns: [...selectedTable.columns, columnName],
      rows: selectedTable.rows.map((row) => [...row, '']),
    })
    setNewColumnName('')
  }

  const onRemoveColumn = (columnIndex: number) => {
    if (!selectedTable || selectedTable.columns.length <= 1) {
      return
    }
    updateTable({
      ...selectedTable,
      columns: selectedTable.columns.filter((_, index) => index !== columnIndex),
      rows: selectedTable.rows.map((row) => row.filter((_, index) => index !== columnIndex)),
    })
  }

  const onUpdateCell = (rowIndex: number, columnIndex: number, value: string) => {
    if (!selectedTable) {
      return
    }
    updateTable({
      ...selectedTable,
      rows: selectedTable.rows.map((row, index) =>
        index === rowIndex ? row.map((cell, cellIndex) => (cellIndex === columnIndex ? value : cell)) : row,
      ),
    })
  }

  const onRenameColumn = (columnIndex: number, value: string) => {
    if (!selectedTable) {
      return
    }
    const nextName = uniqueColumnName(
      value || `Column ${columnIndex + 1}`,
      selectedTable.columns.filter((_, index) => index !== columnIndex),
    )
    updateTable({
      ...selectedTable,
      columns: selectedTable.columns.map((column, index) => (index === columnIndex ? nextName : column)),
    })
  }

  return (
    <PageFrame
      title="Manuscript Tables"
      description="Create publication-ready tables with editable titles, captions, footnotes, and cell content."
    >
      <div className="grid gap-3 lg:grid-cols-[280px_minmax(0,1fr)]">
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between gap-2">
              <div>
                <CardTitle className="text-sm">Tables</CardTitle>
                <CardDescription>{manuscriptTables.length} manuscript table(s)</CardDescription>
              </div>
              <Button size="sm" onClick={onAddTable}>
                <Plus className="mr-1 h-4 w-4" />
                New
              </Button>
            </div>
          </CardHeader>
          <CardContent className="space-y-2">
            {manuscriptTables.length === 0 ? (
              <p className="text-xs text-muted-foreground">Create a manuscript table to begin.</p>
            ) : (
              manuscriptTables.map((table) => (
                <button
                  key={table.id}
                  type="button"
                  className={`w-full rounded-md border px-3 py-2 text-left text-xs ${
                    selectedTableId === table.id ? 'border-primary bg-primary/5' : 'border-border hover:bg-muted/40'
                  }`}
                  onClick={() => setSelectedTableId(table.id)}
                >
                  <p className="font-medium">{table.title}</p>
                  <p className="text-muted-foreground">
                    {table.columns.length} columns • {table.rows.length} rows
                  </p>
                </button>
              ))
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <CardTitle className="text-sm">{selectedTable?.title ?? 'Table Builder'}</CardTitle>
                <CardDescription>Edit publication table metadata and cell values.</CardDescription>
              </div>
              {selectedTable ? (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => removeManuscriptTable(selectedTable.id)}
                >
                  <Trash2 className="mr-1 h-4 w-4" />
                  Remove table
                </Button>
              ) : null}
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            {!selectedTable ? (
              <p className="text-xs text-muted-foreground">No manuscript table selected.</p>
            ) : (
              <>
                <div className="grid gap-2">
                  <Input
                    value={selectedTable.title}
                    onChange={(event) => updateTable({ ...selectedTable, title: event.target.value })}
                    placeholder="Table title"
                  />
                  <Input
                    value={selectedTable.caption ?? ''}
                    onChange={(event) => updateTable({ ...selectedTable, caption: event.target.value })}
                    placeholder="Caption (optional)"
                  />
                  <Input
                    value={selectedTable.footnote ?? ''}
                    onChange={(event) => updateTable({ ...selectedTable, footnote: event.target.value })}
                    placeholder="Footnote (optional)"
                  />
                </div>

                <div className="grid gap-2 md:grid-cols-[220px_auto_auto]">
                  <Input
                    value={newColumnName}
                    onChange={(event) => setNewColumnName(event.target.value)}
                    placeholder="New column name"
                  />
                  <Button variant="outline" onClick={onAddColumn}>
                    Add column
                  </Button>
                  <Button variant="outline" onClick={onAddRow}>
                    Add row
                  </Button>
                </div>

                <ScrollArea className="h-[420px] rounded-md border border-border">
                  <table className="w-full text-xs">
                    <thead className="sticky top-0 bg-muted/60">
                      <tr>
                        <th className="border-b border-border px-2 py-1 text-left">#</th>
                        {selectedTable.columns.map((column, columnIndex) => (
                          <th key={`${selectedTable.id}-column-${columnIndex}`} className="border-b border-border px-2 py-1">
                            <div className="flex items-center gap-1">
                              <Input
                                value={column}
                                onChange={(event) => onRenameColumn(columnIndex, event.target.value)}
                                className="h-7 text-xs"
                              />
                              <Button
                                size="sm"
                                variant="ghost"
                                onClick={() => onRemoveColumn(columnIndex)}
                                disabled={selectedTable.columns.length <= 1}
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </Button>
                            </div>
                          </th>
                        ))}
                        <th className="border-b border-border px-2 py-1 text-right">Row</th>
                      </tr>
                    </thead>
                    <tbody>
                      {selectedTable.rows.map((row, rowIndex) => (
                        <tr key={`${selectedTable.id}-row-${rowIndex}`} className="odd:bg-muted/20">
                          <td className="border-b border-border/70 px-2 py-1 text-muted-foreground">{rowIndex + 1}</td>
                          {selectedTable.columns.map((_, columnIndex) => (
                            <td key={`${selectedTable.id}-cell-${rowIndex}-${columnIndex}`} className="border-b border-border/70 px-2 py-1">
                              <Input
                                value={row[columnIndex] ?? ''}
                                onChange={(event) => onUpdateCell(rowIndex, columnIndex, event.target.value)}
                                className="h-7 text-xs"
                              />
                            </td>
                          ))}
                          <td className="border-b border-border/70 px-2 py-1 text-right">
                            <Button size="sm" variant="ghost" onClick={() => onRemoveRow(rowIndex)}>
                              <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </ScrollArea>
                <div className="flex flex-wrap items-center gap-2">
                  <Badge variant="outline">{selectedTable.columns.length} columns</Badge>
                  <Badge variant="outline">{selectedTable.rows.length} rows</Badge>
                </div>
              </>
            )}
          </CardContent>
        </Card>
      </div>
    </PageFrame>
  )
}

