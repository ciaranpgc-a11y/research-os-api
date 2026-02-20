import { useEffect, useMemo, useRef, useState } from 'react'
import * as XLSX from 'xlsx'
import { FileSpreadsheet, Loader2, Plus, UploadCloud } from 'lucide-react'

import { AddColumnModal } from '@/components/data-workspace/AddColumnModal'
import { TableHeader } from '@/components/data-workspace/TableHeader'
import { TableTabs } from '@/components/data-workspace/TableTabs'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { PageFrame } from '@/pages/page-frame'
import { useDataWorkspaceStore } from '@/store/use-data-workspace-store'
import type {
  DataAsset,
  SheetData,
  WorkingTable,
  WorkingTableColumnMeta,
  WorkingTableMetadata,
} from '@/types/data-workspace'

const MAX_PREVIEW_ROWS = 50

function createId(prefix: string): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return `${prefix}-${crypto.randomUUID()}`
  }
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
}

function dedupeColumns(columns: string[]): string[] {
  const seen = new Map<string, number>()
  return columns.map((name, index) => {
    const base = name.trim() || `Column ${index + 1}`
    const count = seen.get(base) ?? 0
    seen.set(base, count + 1)
    return count === 0 ? base : `${base}_${count + 1}`
  })
}

function toMatrixFromCsv(text: string): string[][] {
  const lines = text.split(/\r?\n/).filter((line, index, all) => line.trim().length > 0 || index < all.length - 1)
  return lines.map((line) => {
    const values: string[] = []
    let current = ''
    let inQuotes = false
    for (let index = 0; index < line.length; index += 1) {
      const character = line[index]
      const next = line[index + 1]
      if (character === '"' && inQuotes && next === '"') {
        current += '"'
        index += 1
        continue
      }
      if (character === '"') {
        inQuotes = !inQuotes
        continue
      }
      if (character === ',' && !inQuotes) {
        values.push(current.trim())
        current = ''
        continue
      }
      current += character
    }
    values.push(current.trim())
    return values
  })
}

function toSheetData(name: string, matrix: unknown[][]): SheetData {
  if (matrix.length === 0) {
    return { name, columns: ['Column 1'], rows: [] }
  }
  const headerRaw = (matrix[0] ?? []).map((value) => String(value ?? '').trim())
  const maxColumns = Math.max(headerRaw.length, ...matrix.map((row) => row.length))
  const columns = dedupeColumns(Array.from({ length: maxColumns }, (_, index) => headerRaw[index] || `Column ${index + 1}`))
  const rows = matrix.slice(1).map((row) =>
    columns.reduce<Record<string, string>>((accumulator, column, columnIndex) => {
      accumulator[column] = String(row[columnIndex] ?? '')
      return accumulator
    }, {}),
  )
  return {
    name,
    columns,
    rows,
  }
}

function defaultMetadata(): WorkingTableMetadata {
  return {
    tableType: 'Working table',
    description: '',
    provenance: '',
    conventions: '',
    lastEditedAt: new Date().toISOString(),
  }
}

function defaultColumnMeta(columns: string[]): Record<string, WorkingTableColumnMeta> {
  return columns.reduce<Record<string, WorkingTableColumnMeta>>((accumulator, column) => {
    accumulator[column] = { dataType: 'text' }
    return accumulator
  }, {})
}

function normalizeWorkingTable(table: WorkingTable): WorkingTable {
  const meta = table.columnMeta ?? {}
  const normalizedMeta = table.columns.reduce<Record<string, WorkingTableColumnMeta>>((accumulator, column) => {
    accumulator[column] = meta[column] ?? { dataType: 'text' }
    return accumulator
  }, {})
  return {
    ...table,
    metadata: {
      ...defaultMetadata(),
      ...table.metadata,
      lastEditedAt: table.metadata?.lastEditedAt || new Date().toISOString(),
    },
    columnMeta: normalizedMeta,
    footnotes: table.footnotes ?? [],
    abbreviations: table.abbreviations ?? [],
    rows: table.rows.map((row) =>
      table.columns.reduce<Record<string, string>>((accumulator, column) => {
        accumulator[column] = row[column] ?? ''
        return accumulator
      }, {}),
    ),
  }
}

async function parseDataAsset(file: File): Promise<DataAsset> {
  const extension = file.name.split('.').pop()?.toLowerCase()
  if (extension !== 'csv' && extension !== 'xlsx') {
    throw new Error(`${file.name}: only .csv and .xlsx are supported.`)
  }

  if (extension === 'csv') {
    const text = await file.text()
    const matrix = toMatrixFromCsv(text)
    return {
      id: createId('asset'),
      name: file.name,
      kind: 'csv',
      uploadedAt: new Date().toISOString(),
      sheets: [toSheetData('Sheet1', matrix)],
    }
  }

  const arrayBuffer = await file.arrayBuffer()
  const workbook = XLSX.read(arrayBuffer, { type: 'array' })
  const sheets = workbook.SheetNames.map((sheetName) => {
    const worksheet = workbook.Sheets[sheetName]
    const matrix = XLSX.utils.sheet_to_json(worksheet, {
      header: 1,
      raw: false,
      defval: '',
      blankrows: false,
    }) as unknown[][]
    return toSheetData(sheetName, matrix)
  })

  return {
    id: createId('asset'),
    name: file.name,
    kind: 'xlsx',
    uploadedAt: new Date().toISOString(),
    sheets,
  }
}

function stampTable(table: WorkingTable): WorkingTable {
  const normalized = normalizeWorkingTable(table)
  return {
    ...normalized,
    metadata: {
      ...defaultMetadata(),
      ...(normalized.metadata ?? {}),
      lastEditedAt: new Date().toISOString(),
    },
  }
}

export function ResultsPage() {
  const dataAssets = useDataWorkspaceStore((state) => state.dataAssets)
  const workingTables = useDataWorkspaceStore((state) => state.workingTables)
  const manuscriptTables = useDataWorkspaceStore((state) => state.manuscriptTables)
  const addDataAsset = useDataWorkspaceStore((state) => state.addDataAsset)
  const createWorkingTableFromSheet = useDataWorkspaceStore((state) => state.createWorkingTableFromSheet)
  const createWorkingTable = useDataWorkspaceStore((state) => state.createWorkingTable)
  const setWorkingTable = useDataWorkspaceStore((state) => state.setWorkingTable)
  const removeWorkingTable = useDataWorkspaceStore((state) => state.removeWorkingTable)

  const [activeTab, setActiveTab] = useState<'uploads' | 'working'>('uploads')
  const [selectedAssetId, setSelectedAssetId] = useState<string | null>(null)
  const [selectedSheetName, setSelectedSheetName] = useState<string>('')
  const [selectedWorkingTableId, setSelectedWorkingTableId] = useState<string | null>(null)
  const [isUploading, setIsUploading] = useState(false)
  const [isDragActive, setIsDragActive] = useState(false)
  const [uploadError, setUploadError] = useState('')
  const [status, setStatus] = useState('')
  const [addColumnOpen, setAddColumnOpen] = useState(false)

  const fileInputRef = useRef<HTMLInputElement | null>(null)

  useEffect(() => {
    if (dataAssets.length === 0) {
      setSelectedAssetId(null)
      setSelectedSheetName('')
      return
    }
    if (selectedAssetId && dataAssets.some((asset) => asset.id === selectedAssetId)) {
      return
    }
    setSelectedAssetId(dataAssets[0].id)
  }, [dataAssets, selectedAssetId])

  const selectedAsset = useMemo(() => dataAssets.find((asset) => asset.id === selectedAssetId) ?? null, [dataAssets, selectedAssetId])

  useEffect(() => {
    if (!selectedAsset) {
      setSelectedSheetName('')
      return
    }
    if (selectedSheetName && selectedAsset.sheets.some((sheet) => sheet.name === selectedSheetName)) {
      return
    }
    setSelectedSheetName(selectedAsset.sheets[0]?.name ?? '')
  }, [selectedAsset, selectedSheetName])

  useEffect(() => {
    if (workingTables.length === 0) {
      setSelectedWorkingTableId(null)
      return
    }
    if (selectedWorkingTableId && workingTables.some((table) => table.id === selectedWorkingTableId)) {
      return
    }
    setSelectedWorkingTableId(workingTables[0].id)
  }, [selectedWorkingTableId, workingTables])

  const selectedSheet = useMemo(() => {
    if (!selectedAsset) {
      return null
    }
    return selectedAsset.sheets.find((sheet) => sheet.name === selectedSheetName) ?? selectedAsset.sheets[0] ?? null
  }, [selectedAsset, selectedSheetName])

  const selectedWorkingTableRaw = useMemo(
    () => workingTables.find((table) => table.id === selectedWorkingTableId) ?? null,
    [selectedWorkingTableId, workingTables],
  )

  const selectedWorkingTable = useMemo(
    () => (selectedWorkingTableRaw ? normalizeWorkingTable(selectedWorkingTableRaw) : null),
    [selectedWorkingTableRaw],
  )

  useEffect(() => {
    if (!selectedWorkingTableRaw) {
      return
    }
    const normalized = normalizeWorkingTable(selectedWorkingTableRaw)
    if (JSON.stringify(normalized) !== JSON.stringify(selectedWorkingTableRaw)) {
      setWorkingTable(normalized)
    }
  }, [selectedWorkingTableRaw, setWorkingTable])

  const previewRows = useMemo(() => selectedSheet?.rows.slice(0, MAX_PREVIEW_ROWS) ?? [], [selectedSheet])

  const handleFiles = async (files: File[]) => {
    if (files.length === 0) {
      return
    }
    setIsUploading(true)
    setUploadError('')
    setStatus('')
    const errors: string[] = []
    const addedIds: string[] = []
    for (const file of files) {
      try {
        const asset = await parseDataAsset(file)
        addDataAsset(asset)
        addedIds.push(asset.id)
      } catch (error) {
        errors.push(error instanceof Error ? error.message : `Could not parse ${file.name}.`)
      }
    }
    if (addedIds.length > 0) {
      setSelectedAssetId(addedIds[0])
      setStatus(`Uploaded ${addedIds.length} file(s) to Data Library.`)
    }
    if (errors.length > 0) {
      setUploadError(errors.join(' '))
    }
    setIsUploading(false)
  }

  const onPromoteToWorkingTable = () => {
    if (!selectedAsset || !selectedSheet) {
      return
    }
    const id = createWorkingTableFromSheet(selectedAsset.id, selectedSheet.name)
    if (!id) {
      setUploadError('Could not promote selected sheet.')
      return
    }
    setSelectedWorkingTableId(id)
    setActiveTab('working')
    setStatus(`Promoted ${selectedSheet.name} to Working Tables.`)
  }

  const onCreateWorkingTable = () => {
    const id = createWorkingTable()
    setSelectedWorkingTableId(id)
    setActiveTab('working')
    setStatus('Created a new working table.')
  }

  const onUpdateWorkingTable = (table: WorkingTable) => {
    setWorkingTable(stampTable(table))
  }

  const onAddRow = () => {
    if (!selectedWorkingTable) {
      return
    }
    const blankRow = selectedWorkingTable.columns.reduce<Record<string, string>>((accumulator, column) => {
      accumulator[column] = ''
      return accumulator
    }, {})
    onUpdateWorkingTable({
      ...selectedWorkingTable,
      rows: [...selectedWorkingTable.rows, blankRow],
    })
  }

  const onAddColumn = (payload: { name: string; meta: WorkingTableColumnMeta }) => {
    if (!selectedWorkingTable) {
      return
    }
    onUpdateWorkingTable({
      ...selectedWorkingTable,
      columns: [...selectedWorkingTable.columns, payload.name],
      rows: selectedWorkingTable.rows.map((row) => ({ ...row, [payload.name]: '' })),
      columnMeta: {
        ...defaultColumnMeta(selectedWorkingTable.columns),
        ...(selectedWorkingTable.columnMeta ?? {}),
        [payload.name]: payload.meta,
      },
    })
  }

  const onClearRows = () => {
    if (!selectedWorkingTable) {
      return
    }
    onUpdateWorkingTable({
      ...selectedWorkingTable,
      rows: [],
    })
  }

  return (
    <PageFrame
      title="Data Library"
      description="Upload spreadsheets, preview sheets, and curate research-grade working table objects."
    >
      <Tabs value={activeTab} onValueChange={(value) => setActiveTab(value as 'uploads' | 'working')}>
        <TabsList>
          <TabsTrigger value="uploads">Uploads</TabsTrigger>
          <TabsTrigger value="working">Working Tables</TabsTrigger>
        </TabsList>

        <TabsContent value="uploads" className="space-y-3">
          <Card>
            <CardHeader>
              <CardTitle className="text-sm">Upload Data Assets</CardTitle>
              <CardDescription>Drop .csv or .xlsx files to preview sheets and promote them to Working Tables.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <button
                type="button"
                className={`w-full rounded-md border border-dashed p-6 text-left transition-colors ${
                  isDragActive ? 'border-primary bg-primary/5' : 'border-border bg-muted/20 hover:bg-muted/30'
                }`}
                onDragOver={(event) => {
                  event.preventDefault()
                  setIsDragActive(true)
                }}
                onDragLeave={(event) => {
                  event.preventDefault()
                  setIsDragActive(false)
                }}
                onDrop={(event) => {
                  event.preventDefault()
                  setIsDragActive(false)
                  const files = Array.from(event.dataTransfer.files)
                  void handleFiles(files)
                }}
                onClick={() => fileInputRef.current?.click()}
                disabled={isUploading}
              >
                <div className="flex items-center gap-3">
                  <UploadCloud className="h-6 w-6 text-muted-foreground" />
                  <div className="space-y-1">
                    <p className="text-sm font-medium">Drop files here or click to browse</p>
                    <p className="text-xs text-muted-foreground">Accepted formats: .csv and .xlsx</p>
                  </div>
                </div>
              </button>

              <input
                ref={fileInputRef}
                type="file"
                multiple
                accept=".csv,.xlsx"
                className="hidden"
                onChange={(event) => {
                  const files = Array.from(event.target.files ?? [])
                  void handleFiles(files)
                  event.target.value = ''
                }}
              />

              {isUploading ? (
                <p className="flex items-center gap-2 text-xs text-muted-foreground">
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  Uploading and parsing files...
                </p>
              ) : null}
              {uploadError ? <p className="text-xs text-destructive">{uploadError}</p> : null}
              {status ? <p className="text-xs text-emerald-600">{status}</p> : null}
            </CardContent>
          </Card>

          <div className="grid gap-3 lg:grid-cols-[280px_minmax(0,1fr)]">
            <Card>
              <CardHeader>
                <CardTitle className="text-sm">Files</CardTitle>
                <CardDescription>{dataAssets.length} asset(s) uploaded.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-2">
                {dataAssets.length === 0 ? (
                  <p className="text-xs text-muted-foreground">No uploaded files yet.</p>
                ) : (
                  dataAssets.map((asset) => {
                    const isActive = selectedAssetId === asset.id
                    return (
                      <button
                        key={asset.id}
                        type="button"
                        className={`w-full rounded-md border px-3 py-2 text-left text-xs transition-colors ${
                          isActive ? 'border-primary bg-primary/5' : 'border-border hover:bg-muted/40'
                        }`}
                        onClick={() => {
                          setSelectedAssetId(asset.id)
                          setSelectedSheetName(asset.sheets[0]?.name ?? '')
                        }}
                      >
                        <p className="font-medium">{asset.name}</p>
                        <p className="text-muted-foreground">
                          {asset.kind.toUpperCase()} | {new Date(asset.uploadedAt).toLocaleString()}
                        </p>
                        <p className="text-muted-foreground">{asset.sheets.length} sheet(s)</p>
                      </button>
                    )
                  })
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <CardTitle className="text-sm">Preview</CardTitle>
                    <CardDescription>Inspect the selected sheet (first {MAX_PREVIEW_ROWS} rows).</CardDescription>
                  </div>
                  <Button size="sm" onClick={onPromoteToWorkingTable} disabled={!selectedAsset || !selectedSheet}>
                    Promote to Working Table
                  </Button>
                </div>
              </CardHeader>
              <CardContent className="space-y-2">
                {!selectedAsset || !selectedSheet ? (
                  <p className="text-xs text-muted-foreground">Select a file to view and promote sheets.</p>
                ) : (
                  <>
                    {selectedAsset.kind === 'xlsx' ? (
                      <div className="max-w-sm space-y-1">
                        <label htmlFor="sheet-select" className="text-xs font-medium text-muted-foreground">
                          Sheet
                        </label>
                        <select
                          id="sheet-select"
                          className="h-9 w-full rounded-md border border-border bg-background px-3 text-sm"
                          value={selectedSheet.name}
                          onChange={(event) => setSelectedSheetName(event.target.value)}
                        >
                          {selectedAsset.sheets.map((sheet) => (
                            <option key={sheet.name} value={sheet.name}>
                              {sheet.name}
                            </option>
                          ))}
                        </select>
                      </div>
                    ) : null}

                    <ScrollArea className="h-[360px] rounded-md border border-border">
                      <table className="w-full text-xs">
                        <thead className="sticky top-0 bg-muted/60">
                          <tr>
                            <th className="border-b border-border px-2 py-1 text-left">#</th>
                            {selectedSheet.columns.map((column) => (
                              <th key={column} className="border-b border-border px-2 py-1 text-left">
                                {column}
                              </th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {previewRows.map((row, rowIndex) => (
                            <tr key={`${selectedSheet.name}-row-${rowIndex}`} className="odd:bg-muted/20">
                              <td className="border-b border-border/70 px-2 py-1 text-muted-foreground">{rowIndex + 1}</td>
                              {selectedSheet.columns.map((column) => (
                                <td key={`${rowIndex}-${column}`} className="border-b border-border/70 px-2 py-1">
                                  {row[column]}
                                </td>
                              ))}
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </ScrollArea>
                    {selectedSheet.rows.length > MAX_PREVIEW_ROWS ? (
                      <p className="text-xs text-muted-foreground">
                        Showing first {MAX_PREVIEW_ROWS} of {selectedSheet.rows.length} rows.
                      </p>
                    ) : null}
                  </>
                )}
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="working" className="space-y-3">
          <div className="flex items-center justify-between">
            <p className="text-sm text-muted-foreground">Manage structured working table objects for downstream drafting and exports.</p>
            <Button size="sm" onClick={onCreateWorkingTable}>
              <Plus className="mr-1 h-4 w-4" />
              New working table
            </Button>
          </div>

          <div className="grid gap-3 lg:grid-cols-[280px_minmax(0,1fr)]">
            <Card>
              <CardHeader>
                <CardTitle className="text-sm">Working Tables</CardTitle>
                <CardDescription>{workingTables.length} table(s) available.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-2">
                {workingTables.length === 0 ? (
                  <p className="text-xs text-muted-foreground">Promote a sheet or create a blank table.</p>
                ) : (
                  workingTables.map((table) => {
                    const normalized = normalizeWorkingTable(table)
                    return (
                      <button
                        key={normalized.id}
                        type="button"
                        className={`w-full rounded-md border px-3 py-2 text-left text-xs ${
                          selectedWorkingTableId === normalized.id ? 'border-primary bg-primary/5' : 'border-border hover:bg-muted/40'
                        }`}
                        onClick={() => setSelectedWorkingTableId(normalized.id)}
                      >
                        <p className="font-medium">{normalized.name}</p>
                        <p className="text-muted-foreground">
                          {normalized.metadata?.tableType || 'Working table'} | {normalized.columns.length} columns | {normalized.rows.length} rows
                        </p>
                      </button>
                    )
                  })
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-sm">{selectedWorkingTable?.name ?? 'Working Table Editor'}</CardTitle>
                <CardDescription>Research-grade editor for table object metadata, grid, notes, and diagnostics.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                {!selectedWorkingTable ? (
                  <p className="text-xs text-muted-foreground">Select a working table to start editing.</p>
                ) : (
                  <>
                    <TableHeader
                      table={selectedWorkingTable}
                      onUpdateTable={onUpdateWorkingTable}
                      onOpenAddColumn={() => setAddColumnOpen(true)}
                      onAddRow={onAddRow}
                      onClearRows={onClearRows}
                      onRemoveTable={() => removeWorkingTable(selectedWorkingTable.id)}
                    />
                    <TableTabs table={selectedWorkingTable} onUpdateTable={onUpdateWorkingTable} onOpenAddColumn={() => setAddColumnOpen(true)} />
                  </>
                )}
              </CardContent>
            </Card>
          </div>
        </TabsContent>
      </Tabs>

      <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
        <Badge variant="outline" className="gap-1">
          <FileSpreadsheet className="h-3.5 w-3.5" />
          Files: {dataAssets.length}
        </Badge>
        <Badge variant="outline">Working tables: {workingTables.length}</Badge>
        <Badge variant="outline">Manuscript tables: {manuscriptTables.length}</Badge>
      </div>

      <AddColumnModal
        open={addColumnOpen}
        onOpenChange={setAddColumnOpen}
        existingColumns={selectedWorkingTable?.columns ?? []}
        onAddColumn={onAddColumn}
      />
    </PageFrame>
  )
}
