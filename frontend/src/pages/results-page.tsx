import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useParams } from 'react-router-dom'
import * as XLSX from 'xlsx'
import { Database, Download, FileSpreadsheet, Loader2, RefreshCw, UploadCloud, UserPlus, X } from 'lucide-react'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { ScrollArea } from '@/components/ui/scroll-area'
import { getAuthSessionToken } from '@/lib/auth-session'
import { houseForms, houseTypography } from '@/lib/house-style'
import {
  downloadLibraryAsset as downloadPersistedLibraryAsset,
  fetchWorkspaceRunContext,
  listLibraryAssets as listPersistedLibraryAssets,
  updateLibraryAssetAccess as updatePersistedLibraryAssetAccess,
  uploadLibraryAssets as uploadPersistedLibraryAssets,
} from '@/lib/study-core-api'
import { PageFrame } from '@/pages/page-frame'
import { useDataWorkspaceStore } from '@/store/use-data-workspace-store'
import { useWorkspaceStore } from '@/store/use-workspace-store'
import type { LibraryAssetRecord } from '@/types/study-core'
import type { DataAsset, SheetData } from '@/types/data-workspace'

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

function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) {
    return '0 B'
  }
  const units = ['B', 'KB', 'MB', 'GB']
  let size = bytes
  let unit = units[0]
  for (let index = 1; index < units.length && size >= 1024; index += 1) {
    size /= 1024
    unit = units[index]
  }
  const precision = size >= 100 ? 0 : size >= 10 ? 1 : 2
  return `${size.toFixed(precision)} ${unit}`
}

function normalizeName(value: string): string {
  return value.trim().replace(/\s+/g, ' ')
}

function normalizeNameKey(value: string): string {
  return normalizeName(value).toLowerCase()
}

function libraryAssetAccessMembers(asset: LibraryAssetRecord): Array<{ user_id: string; name: string }> {
  if (Array.isArray(asset.shared_with) && asset.shared_with.length > 0) {
    return asset.shared_with.map((item) => ({
      user_id: String(item.user_id || '').trim(),
      name: normalizeName(String(item.name || '')) || 'Unknown user',
    }))
  }
  if (Array.isArray(asset.shared_with_user_ids) && asset.shared_with_user_ids.length > 0) {
    return asset.shared_with_user_ids.map((userId) => ({
      user_id: String(userId || '').trim(),
      name: String(userId || '').trim() || 'Unknown user',
    }))
  }
  return []
}

export function ResultsPage() {
  const params = useParams<{ workspaceId: string }>()
  const workspaceId = (params.workspaceId || '').trim()
  const workspaces = useWorkspaceStore((state) => state.workspaces)
  const dataAssets = useDataWorkspaceStore((state) => state.dataAssets)
  const addDataAsset = useDataWorkspaceStore((state) => state.addDataAsset)

  const [assetFilterQuery, setAssetFilterQuery] = useState('')
  const [libraryFilterQuery, setLibraryFilterQuery] = useState('')
  const [selectedAssetId, setSelectedAssetId] = useState<string | null>(null)
  const [selectedSheetName, setSelectedSheetName] = useState<string>('')
  const [isUploading, setIsUploading] = useState(false)
  const [isDragActive, setIsDragActive] = useState(false)
  const [uploadError, setUploadError] = useState('')
  const [persistSyncError, setPersistSyncError] = useState('')
  const [status, setStatus] = useState('')
  const [persistedProjectId, setPersistedProjectId] = useState<string | null>(null)
  const [persistedAssets, setPersistedAssets] = useState<LibraryAssetRecord[]>([])
  const [persistSyncBusy, setPersistSyncBusy] = useState(false)
  const [libraryActionError, setLibraryActionError] = useState('')
  const [libraryActionStatus, setLibraryActionStatus] = useState('')
  const [libraryActionBusyAssetId, setLibraryActionBusyAssetId] = useState<string | null>(null)
  const [accessDraftByAssetId, setAccessDraftByAssetId] = useState<Record<string, string>>({})

  const fileInputRef = useRef<HTMLInputElement | null>(null)
  const hasSessionToken = Boolean(getAuthSessionToken())
  const activeWorkspace = useMemo(
    () => workspaces.find((workspace) => workspace.id === workspaceId) ?? null,
    [workspaceId, workspaces],
  )
  const workspaceLabel = activeWorkspace?.name || 'Workspace'
  const workspaceCollaboratorNames = useMemo(() => {
    if (!activeWorkspace) {
      return [] as string[]
    }
    const removed = new Set((activeWorkspace.removedCollaborators || []).map((name) => normalizeNameKey(name)))
    return (activeWorkspace.collaborators || [])
      .map((name) => normalizeName(name))
      .filter((name) => name.length > 0 && !removed.has(normalizeNameKey(name)))
  }, [activeWorkspace])

  const refreshPersistedAssets = useCallback(async () => {
    const token = getAuthSessionToken()
    if (!token) {
      setPersistedAssets([])
      setPersistedProjectId(null)
      return
    }
    setPersistSyncBusy(true)
    setPersistSyncError('')
    try {
      let resolvedProjectId: string | null = null
      if (workspaceId) {
        const context = await fetchWorkspaceRunContext({ token, workspaceId })
        resolvedProjectId = context.project_id || null
      }
      setPersistedProjectId(resolvedProjectId)
      const items = await listPersistedLibraryAssets({
        token,
        projectId: resolvedProjectId || undefined,
      })
      setPersistedAssets(items.items)
    } catch (error) {
      setPersistSyncError(error instanceof Error ? error.message : 'Could not load personal library.')
    } finally {
      setPersistSyncBusy(false)
    }
  }, [workspaceId])

  useEffect(() => {
    void refreshPersistedAssets()
  }, [refreshPersistedAssets])

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

  const selectedSheet = useMemo(() => {
    if (!selectedAsset) {
      return null
    }
    return selectedAsset.sheets.find((sheet) => sheet.name === selectedSheetName) ?? selectedAsset.sheets[0] ?? null
  }, [selectedAsset, selectedSheetName])

  const previewRows = useMemo(() => selectedSheet?.rows.slice(0, MAX_PREVIEW_ROWS) ?? [], [selectedSheet])
  const normalizedAssetFilterQuery = assetFilterQuery.trim().toLowerCase()
  const normalizedLibraryFilterQuery = libraryFilterQuery.trim().toLowerCase()

  const filteredDataAssets = useMemo(() => {
    if (!normalizedAssetFilterQuery) {
      return dataAssets
    }
    return dataAssets.filter((asset) => {
      const haystack = `${asset.name} ${asset.kind} ${asset.sheets.map((sheet) => sheet.name).join(' ')}`.toLowerCase()
      return haystack.includes(normalizedAssetFilterQuery)
    })
  }, [dataAssets, normalizedAssetFilterQuery])

  const filteredPersistedAssets = useMemo(() => {
    if (!normalizedLibraryFilterQuery) {
      return persistedAssets
    }
    return persistedAssets.filter((asset) => {
      const sharedNames = libraryAssetAccessMembers(asset).map((item) => item.name).join(' ')
      const haystack = `${asset.filename} ${asset.kind} ${asset.mime_type || ''} ${asset.owner_name || ''} ${sharedNames}`.toLowerCase()
      return haystack.includes(normalizedLibraryFilterQuery)
    })
  }, [normalizedLibraryFilterQuery, persistedAssets])

  const totalLocalSheetCount = useMemo(
    () => dataAssets.reduce((sum, asset) => sum + asset.sheets.length, 0),
    [dataAssets],
  )

  const totalLocalRowCount = useMemo(
    () => dataAssets.reduce((sum, asset) => sum + asset.sheets.reduce((sheetSum, sheet) => sheetSum + sheet.rows.length, 0), 0),
    [dataAssets],
  )

  const handleFiles = async (files: File[]) => {
    if (files.length === 0) {
      return
    }
    setIsUploading(true)
    setPersistSyncBusy(true)
    setUploadError('')
    setPersistSyncError('')
    setStatus('')
    const errors: string[] = []
    const addedIds: string[] = []
    const parsedFiles: File[] = []

    for (const file of files) {
      try {
        const asset = await parseDataAsset(file)
        addDataAsset(asset)
        addedIds.push(asset.id)
        parsedFiles.push(file)
      } catch (error) {
        errors.push(error instanceof Error ? error.message : `Could not parse ${file.name}.`)
      }
    }

    let persistedSynced = 0
    const token = getAuthSessionToken()
    if (token && parsedFiles.length > 0) {
      try {
        const uploaded = await uploadPersistedLibraryAssets({
          token,
          files: parsedFiles,
          projectId: persistedProjectId || undefined,
        })
        persistedSynced = uploaded.asset_ids.length
        await refreshPersistedAssets()
      } catch (error) {
        setPersistSyncError(error instanceof Error ? error.message : 'Could not sync to personal library.')
      }
    }

    if (addedIds.length > 0) {
      setSelectedAssetId(addedIds[0])
      if (persistedSynced > 0) {
        setStatus(`Uploaded ${addedIds.length} file(s); synced ${persistedSynced} to personal library.`)
      } else {
        setStatus(`Uploaded ${addedIds.length} file(s).`)
      }
    }
    if (errors.length > 0) {
      setUploadError(errors.join(' '))
    }
    setIsUploading(false)
    setPersistSyncBusy(false)
  }

  const updatePersistedAssetInState = useCallback((nextAsset: LibraryAssetRecord) => {
    setPersistedAssets((current) => current.map((item) => (item.id === nextAsset.id ? nextAsset : item)))
  }, [])

  const onDownloadLibraryAsset = useCallback(
    async (asset: LibraryAssetRecord) => {
      const token = getAuthSessionToken()
      if (!token) {
        setLibraryActionError('Sign in to download files.')
        return
      }
      setLibraryActionError('')
      setLibraryActionStatus('')
      setLibraryActionBusyAssetId(asset.id)
      try {
        const payload = await downloadPersistedLibraryAsset({
          token,
          assetId: asset.id,
        })
        const objectUrl = window.URL.createObjectURL(payload.blob)
        const anchor = document.createElement('a')
        anchor.href = objectUrl
        anchor.download = payload.fileName || asset.filename
        document.body.appendChild(anchor)
        anchor.click()
        anchor.remove()
        window.URL.revokeObjectURL(objectUrl)
        setLibraryActionStatus(`Downloaded ${payload.fileName || asset.filename}.`)
      } catch (error) {
        setLibraryActionError(error instanceof Error ? error.message : 'Could not download file.')
      } finally {
        setLibraryActionBusyAssetId((current) => (current === asset.id ? null : current))
      }
    },
    [],
  )

  const onPullLibraryAssetIntoWorkspace = useCallback(
    async (asset: LibraryAssetRecord) => {
      const token = getAuthSessionToken()
      if (!token) {
        setLibraryActionError('Sign in to pull files into this workspace.')
        return
      }
      setLibraryActionError('')
      setLibraryActionStatus('')
      setLibraryActionBusyAssetId(asset.id)
      try {
        const payload = await downloadPersistedLibraryAsset({
          token,
          assetId: asset.id,
        })
        const file = new File([payload.blob], payload.fileName || asset.filename, {
          type: payload.contentType || payload.blob.type || 'application/octet-stream',
        })
        const parsed = await parseDataAsset(file)
        addDataAsset(parsed)
        setSelectedAssetId(parsed.id)
        setLibraryActionStatus(`Pulled ${parsed.name} into workspace files.`)
      } catch (error) {
        setLibraryActionError(error instanceof Error ? error.message : 'Could not pull file into workspace.')
      } finally {
        setLibraryActionBusyAssetId((current) => (current === asset.id ? null : current))
      }
    },
    [addDataAsset],
  )

  const onAddLibraryAccess = useCallback(
    async (asset: LibraryAssetRecord) => {
      const token = getAuthSessionToken()
      if (!token) {
        setLibraryActionError('Sign in to manage file access.')
        return
      }
      const pendingCollaboratorName = normalizeName(accessDraftByAssetId[asset.id] || '')
      if (!pendingCollaboratorName) {
        setLibraryActionError('Select a collaborator to grant access.')
        return
      }
      setLibraryActionError('')
      setLibraryActionStatus('')
      setLibraryActionBusyAssetId(asset.id)
      try {
        const updated = await updatePersistedLibraryAssetAccess({
          token,
          assetId: asset.id,
          collaboratorUserIds: Array.isArray(asset.shared_with_user_ids) ? asset.shared_with_user_ids : [],
          collaboratorNames: [pendingCollaboratorName],
        })
        updatePersistedAssetInState(updated)
        setAccessDraftByAssetId((current) => ({ ...current, [asset.id]: '' }))
        setLibraryActionStatus(`Granted access to ${pendingCollaboratorName}.`)
      } catch (error) {
        setLibraryActionError(error instanceof Error ? error.message : 'Could not update file access.')
      } finally {
        setLibraryActionBusyAssetId((current) => (current === asset.id ? null : current))
      }
    },
    [accessDraftByAssetId, updatePersistedAssetInState],
  )

  const onRemoveLibraryAccess = useCallback(
    async (asset: LibraryAssetRecord, collaboratorUserId: string) => {
      const token = getAuthSessionToken()
      if (!token) {
        setLibraryActionError('Sign in to manage file access.')
        return
      }
      const currentIds = Array.isArray(asset.shared_with_user_ids) ? asset.shared_with_user_ids : []
      const nextIds = currentIds.filter((userId) => String(userId || '').trim() !== String(collaboratorUserId || '').trim())
      setLibraryActionError('')
      setLibraryActionStatus('')
      setLibraryActionBusyAssetId(asset.id)
      try {
        const updated = await updatePersistedLibraryAssetAccess({
          token,
          assetId: asset.id,
          collaboratorUserIds: nextIds,
          collaboratorNames: [],
        })
        updatePersistedAssetInState(updated)
        setLibraryActionStatus('Access updated.')
      } catch (error) {
        setLibraryActionError(error instanceof Error ? error.message : 'Could not update file access.')
      } finally {
        setLibraryActionBusyAssetId((current) => (current === asset.id ? null : current))
      }
    },
    [updatePersistedAssetInState],
  )

  return (
    <PageFrame title="Data" description="" hideScaffoldHeader>
      <div className="grid gap-3 xl:grid-cols-[minmax(0,1fr)_320px]" data-house-role="data-page-layout">
        <div data-house-role="data-main-column" className="space-y-3">
          <Card data-house-role="workspace-card">
            <CardContent className="flex flex-wrap items-center gap-2 pt-5">
              <Badge variant="outline">{workspaceLabel}</Badge>
              <Badge variant="outline">Local files: {dataAssets.length}</Badge>
              <Badge variant="outline">Sheets: {totalLocalSheetCount}</Badge>
              <Badge variant="outline">Rows: {totalLocalRowCount.toLocaleString()}</Badge>
            </CardContent>
          </Card>

          <div data-house-role="data-content-grid" className="grid gap-3 lg:grid-cols-[280px_minmax(0,1fr)]">
            <Card data-house-role="workspace-card">
              <CardHeader>
                <CardTitle data-house-role="section-title">Files</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                <div data-house-role="asset-filter-group" className="space-y-1">
                  <label data-house-role="field-label" htmlFor="asset-filter" className={houseTypography.fieldLabel}>Search files</label>
                  <Input
                    id="asset-filter"
                    value={assetFilterQuery}
                    onChange={(event) => setAssetFilterQuery(event.target.value)}
                    placeholder="File, sheet, or type"
                    className={houseForms.input}
                  />
                </div>
                {dataAssets.length === 0 ? (
                  <p data-house-role="asset-empty-state" className="text-xs text-muted-foreground">No files.</p>
                ) : filteredDataAssets.length === 0 ? (
                  <p data-house-role="asset-empty-state" className="text-xs text-muted-foreground">No matches.</p>
                ) : (
                  filteredDataAssets.map((asset) => {
                    const isActive = selectedAssetId === asset.id
                    return (
                      <button
                        data-house-role="asset-list-item"
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
                        <p data-house-role="asset-list-item-title" className="font-medium">{asset.name}</p>
                        <p data-house-role="asset-list-item-meta" className="text-muted-foreground">
                          {asset.kind.toUpperCase()} | {new Date(asset.uploadedAt).toLocaleString()}
                        </p>
                        <p data-house-role="asset-list-item-meta" className="text-muted-foreground">{asset.sheets.length} sheet(s)</p>
                      </button>
                    )
                  })
                )}
              </CardContent>
            </Card>

            <Card data-house-role="workspace-card">
              <CardHeader>
                <CardTitle data-house-role="section-title">Preview</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                {!selectedAsset || !selectedSheet ? (
                  <p data-house-role="preview-empty-state" className="text-xs text-muted-foreground">Select a file.</p>
                ) : (
                  <>
                    {selectedAsset.kind === 'xlsx' ? (
                      <div data-house-role="sheet-select-group" className="max-w-sm space-y-1">
                        <label htmlFor="sheet-select" className={houseTypography.fieldLabel} data-house-role="field-label">
                          Sheet
                        </label>
                        <select
                          id="sheet-select"
                          data-house-role="form-select"
                          className={`h-9 w-full rounded-md px-3 text-sm ${houseForms.select}`}
                          value={selectedSheet.name}
                          onChange={(event) => setSelectedSheetName(event.target.value)}
                        >
                          {selectedAsset.sheets.map((sheet) => (
                            <option data-house-role="sheet-select-option" key={sheet.name} value={sheet.name}>
                              {sheet.name}
                            </option>
                          ))}
                        </select>
                      </div>
                    ) : null}

                    <div data-house-role="sheet-badge-row" className="flex flex-wrap items-center gap-2">
                      <Badge variant="outline">Rows: {selectedSheet.rows.length.toLocaleString()}</Badge>
                      <Badge variant="outline">Columns: {selectedSheet.columns.length}</Badge>
                    </div>

                    <ScrollArea className="h-sz-360 rounded-md border border-border">
                      <table data-house-role="sheet-preview-table" className="w-full text-sm">
                        <thead data-house-role="sheet-preview-table-head" className="house-table-head sticky top-0">
                          <tr data-house-role="sheet-preview-table-row">
                            <th data-house-role="sheet-preview-table-head-cell" className="house-table-head-text border-b border-border px-2 py-1 text-left">#</th>
                            {selectedSheet.columns.map((column) => (
                              <th data-house-role="sheet-preview-table-head-cell" key={column} className="house-table-head-text border-b border-border px-2 py-1 text-left">
                                {column}
                              </th>
                            ))}
                          </tr>
                        </thead>
                        <tbody data-house-role="sheet-preview-table-body">
                          {previewRows.map((row, rowIndex) => (
                            <tr data-house-role="sheet-preview-table-row" key={`${selectedSheet.name}-row-${rowIndex}`} className="odd:bg-muted/20">
                              <td data-house-role="sheet-preview-table-cell" className="house-table-cell-text border-b border-border/70 px-2 py-1 text-muted-foreground">{rowIndex + 1}</td>
                              {selectedSheet.columns.map((column) => (
                                <td data-house-role="sheet-preview-table-cell" key={`${rowIndex}-${column}`} className="house-table-cell-text border-b border-border/70 px-2 py-1">
                                  {row[column]}
                                </td>
                              ))}
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </ScrollArea>
                    {selectedSheet.rows.length > MAX_PREVIEW_ROWS ? (
                      <p data-house-role="sheet-preview-truncation-note" className="text-xs text-muted-foreground">
                        Showing first {MAX_PREVIEW_ROWS} of {selectedSheet.rows.length} rows.
                      </p>
                    ) : null}
                  </>
                )}
              </CardContent>
            </Card>
          </div>
        </div>

        <aside className="grid gap-3" data-house-role="data-right-panel">
          <Card data-house-role="workspace-card" className="order-2">
            <CardHeader>
              <CardTitle data-house-role="section-title">Upload</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <button
                type="button"
                data-house-role="upload-dropzone"
                className={`w-full rounded-md border border-dashed p-4 text-left transition-colors ${
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
                <div data-house-role="upload-dropzone-row" className="flex items-center gap-3">
                  <UploadCloud className="h-6 w-6 text-muted-foreground" />
                  <p data-house-role="upload-dropzone-label" className={houseTypography.fieldLabel}>Drop files or click</p>
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

              <Button size="sm" onClick={() => fileInputRef.current?.click()} disabled={isUploading}>
                Select files
              </Button>

              {isUploading ? (
                <p data-house-role="upload-status-note" className="flex items-center gap-2 text-xs text-muted-foreground">
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  Uploading...
                </p>
              ) : null}
              {persistSyncBusy ? (
                <p data-house-role="sync-status-note" className="flex items-center gap-2 text-xs text-muted-foreground">
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  Syncing...
                </p>
              ) : null}
              {uploadError ? <p data-house-role="upload-error" className="text-xs text-destructive">{uploadError}</p> : null}
              {persistSyncError ? <p data-house-role="sync-error" className="text-xs text-destructive">{persistSyncError}</p> : null}
              {status ? <p data-house-role="upload-success" className="text-xs text-emerald-600">{status}</p> : null}
            </CardContent>
          </Card>

          <Card data-house-role="workspace-card" className="order-1">
            <CardHeader className="space-y-0">
              <div data-house-role="library-header-row" className="flex items-center justify-between gap-2">
                <CardTitle data-house-role="section-title">Access from personal library</CardTitle>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => void refreshPersistedAssets()}
                  disabled={!hasSessionToken || persistSyncBusy}
                >
                  <RefreshCw className="mr-1 h-4 w-4" />
                  Refresh
                </Button>
              </div>
            </CardHeader>
            <CardContent className="space-y-2">
              <div data-house-role="library-filter-group" className="space-y-1">
                <label data-house-role="field-label" htmlFor="library-filter" className={houseTypography.fieldLabel}>Search library</label>
                <Input
                  id="library-filter"
                  value={libraryFilterQuery}
                  onChange={(event) => setLibraryFilterQuery(event.target.value)}
                  placeholder="File name or type"
                  className={houseForms.input}
                  disabled={!hasSessionToken}
                />
              </div>

              {!hasSessionToken ? (
                <p data-house-role="library-empty-state" className="text-xs text-muted-foreground">Sign in to access your personal library.</p>
              ) : persistSyncBusy ? (
                <p data-house-role="library-loading-state" className="flex items-center gap-2 text-xs text-muted-foreground">
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  Loading...
                </p>
              ) : filteredPersistedAssets.length === 0 ? (
                <p data-house-role="library-empty-state" className="text-xs text-muted-foreground">No assets.</p>
              ) : (
                <ScrollArea className="h-sz-280 rounded-md border border-border/70 p-2">
                  <div data-house-role="library-list" className="space-y-2">
                    {filteredPersistedAssets.map((asset) => {
                      const accessMembers = libraryAssetAccessMembers(asset)
                      const canManageAccess = Boolean(asset.can_manage_access)
                      const accessMemberIds = new Set(accessMembers.map((item) => String(item.user_id || '').trim()))
                      const collaboratorAccessCandidates = workspaceCollaboratorNames.filter((name) => {
                        const normalizedCandidate = normalizeNameKey(name)
                        return !accessMembers.some((member) => normalizeNameKey(member.name) === normalizedCandidate)
                      })
                      const selectedDraftCollaborator = accessDraftByAssetId[asset.id] || ''
                      const isBusy = libraryActionBusyAssetId === asset.id

                      return (
                        <div data-house-role="library-list-item" key={asset.id} className="rounded-md border border-border/70 px-2 py-2 text-xs">
                          <div data-house-role="library-list-item-row" className="flex items-center justify-between gap-2">
                            <p data-house-role="library-list-item-title" className="font-medium">{asset.filename}</p>
                            <Badge variant="outline">{asset.kind}</Badge>
                          </div>
                          <p data-house-role="library-list-item-meta" className="pt-1 text-muted-foreground">{formatBytes(asset.byte_size)}</p>
                          <p data-house-role="library-list-item-meta" className="text-muted-foreground">{new Date(asset.uploaded_at).toLocaleString()}</p>
                          <p data-house-role="library-list-item-meta" className="pt-1 text-muted-foreground">
                            Owner: {normalizeName(String(asset.owner_name || '')) || 'Unknown'}
                          </p>
                          <div data-house-role="library-access-row" className="flex flex-wrap items-center gap-1 pt-1">
                            {accessMembers.length === 0 ? (
                              <Badge variant="outline">Owner only</Badge>
                            ) : (
                              accessMembers.map((member) => (
                                <span
                                  key={`${asset.id}-${member.user_id}`}
                                  className="inline-flex items-center gap-1 rounded border border-border/70 bg-muted/30 px-1.5 py-0.5"
                                >
                                  <span>{member.name}</span>
                                  {canManageAccess ? (
                                    <button
                                      type="button"
                                      className="inline-flex h-4 w-4 items-center justify-center rounded hover:bg-muted"
                                      aria-label={`Remove access for ${member.name}`}
                                      onClick={() => void onRemoveLibraryAccess(asset, member.user_id)}
                                      disabled={isBusy || !accessMemberIds.has(member.user_id)}
                                    >
                                      <X className="h-3 w-3" />
                                    </button>
                                  ) : null}
                                </span>
                              ))
                            )}
                          </div>
                          <div data-house-role="library-item-actions" className="flex flex-wrap items-center gap-2 pt-2">
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => void onDownloadLibraryAsset(asset)}
                              disabled={isBusy}
                            >
                              <Download className="mr-1 h-3.5 w-3.5" />
                              Download
                            </Button>
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => void onPullLibraryAssetIntoWorkspace(asset)}
                              disabled={isBusy}
                            >
                              Pull to workspace
                            </Button>
                          </div>
                          {canManageAccess ? (
                            <div data-house-role="library-access-controls" className="flex items-center gap-2 pt-2">
                              <select
                                value={selectedDraftCollaborator}
                                onChange={(event) => {
                                  const nextValue = event.target.value
                                  setAccessDraftByAssetId((current) => ({ ...current, [asset.id]: nextValue }))
                                }}
                                className={`h-8 flex-1 rounded-md px-2 text-xs ${houseForms.select}`}
                                disabled={isBusy || collaboratorAccessCandidates.length === 0}
                              >
                                <option value="">Add collaborator</option>
                                {collaboratorAccessCandidates.map((candidateName) => (
                                  <option key={`${asset.id}-${candidateName}`} value={candidateName}>
                                    {candidateName}
                                  </option>
                                ))}
                              </select>
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => void onAddLibraryAccess(asset)}
                                disabled={isBusy || !selectedDraftCollaborator}
                              >
                                <UserPlus className="mr-1 h-3.5 w-3.5" />
                                Add
                              </Button>
                            </div>
                          ) : null}
                        </div>
                      )
                    })}
                  </div>
                </ScrollArea>
              )}

              {libraryActionError ? (
                <p data-house-role="library-action-error" className="text-xs text-destructive">
                  {libraryActionError}
                </p>
              ) : null}
              {libraryActionStatus ? (
                <p data-house-role="library-action-status" className="text-xs text-emerald-600">
                  {libraryActionStatus}
                </p>
              ) : null}

              <p data-house-role="library-scope-note" className="text-xs text-muted-foreground">
                {persistedProjectId ? 'Project scope' : 'Workspace scope'} | {persistedAssets.length} asset(s)
              </p>
            </CardContent>
          </Card>
        </aside>
      </div>

      <div data-house-role="results-status-row" className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
        <Badge variant="outline" className="gap-1">
          <FileSpreadsheet className="h-3.5 w-3.5" />
          Local files: {dataAssets.length}
        </Badge>
        <Badge variant="outline">Local sheets: {totalLocalSheetCount}</Badge>
        <Badge variant="outline">Personal assets: {persistedAssets.length}</Badge>
        <Badge variant="outline" className="gap-1">
          <Database className="h-3.5 w-3.5" />
          {persistedProjectId ? 'Project scoped' : 'Workspace scoped'}
        </Badge>
      </div>
    </PageFrame>
  )
}
