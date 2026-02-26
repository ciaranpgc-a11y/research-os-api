import { useCallback, useEffect, useMemo, useState } from 'react'
import { useParams } from 'react-router-dom'
import * as XLSX from 'xlsx'
import { Download, Loader2, RefreshCw, UserPlus, X } from 'lucide-react'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Sheet, SheetContent } from '@/components/ui/sheet'
import { getAuthSessionToken } from '@/lib/auth-session'
import { houseForms, houseLayout, houseSurfaces, houseTypography } from '@/lib/house-style'
import { getHouseLeftBorderToneClass } from '@/lib/section-tone'
import {
  downloadLibraryAsset as downloadPersistedLibraryAsset,
  fetchWorkspaceRunContext,
  listLibraryAssets as listPersistedLibraryAssets,
  updateLibraryAssetAccess as updatePersistedLibraryAssetAccess,
} from '@/lib/study-core-api'
import { cn } from '@/lib/utils'
import { PageFrame } from '@/pages/page-frame'
import { useDataWorkspaceStore } from '@/store/use-data-workspace-store'
import { useWorkspaceStore } from '@/store/use-workspace-store'
import type { LibraryAssetRecord } from '@/types/study-core'
import type { DataAsset, SheetData } from '@/types/data-workspace'
const HOUSE_LEFT_BORDER_DATA_CLASS = getHouseLeftBorderToneClass('data')

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
  const addDataAsset = useDataWorkspaceStore((state) => state.addDataAsset)

  const [libraryFilterQuery, setLibraryFilterQuery] = useState('')
  const [persistSyncError, setPersistSyncError] = useState('')
  const [persistedProjectId, setPersistedProjectId] = useState<string | null>(null)
  const [persistedAssets, setPersistedAssets] = useState<LibraryAssetRecord[]>([])
  const [persistSyncBusy, setPersistSyncBusy] = useState(false)
  const [libraryActionError, setLibraryActionError] = useState('')
  const [libraryActionStatus, setLibraryActionStatus] = useState('')
  const [libraryActionBusyAssetId, setLibraryActionBusyAssetId] = useState<string | null>(null)
  const [accessDraftByAssetId, setAccessDraftByAssetId] = useState<Record<string, string>>({})
  const [libraryPickerOpen, setLibraryPickerOpen] = useState(false)
  const [libraryPickerQuery, setLibraryPickerQuery] = useState('')
  const [libraryPickerSelection, setLibraryPickerSelection] = useState<string[]>([])
  const [libraryPickerPulling, setLibraryPickerPulling] = useState(false)
  const [rightPanelCollapsed, setRightPanelCollapsed] = useState(false)

  const hasSessionToken = Boolean(getAuthSessionToken())
  const activeWorkspace = useMemo(
    () => workspaces.find((workspace) => workspace.id === workspaceId) ?? null,
    [workspaceId, workspaces],
  )
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

  const normalizedLibraryFilterQuery = libraryFilterQuery.trim().toLowerCase()
  const normalizedLibraryPickerQuery = libraryPickerQuery.trim().toLowerCase()

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

  const pickerFilteredPersistedAssets = useMemo(() => {
    if (!normalizedLibraryPickerQuery) {
      return persistedAssets
    }
    return persistedAssets.filter((asset) => {
      const sharedNames = libraryAssetAccessMembers(asset).map((item) => item.name).join(' ')
      const haystack = `${asset.filename} ${asset.kind} ${asset.mime_type || ''} ${asset.owner_name || ''} ${sharedNames}`.toLowerCase()
      return haystack.includes(normalizedLibraryPickerQuery)
    })
  }, [normalizedLibraryPickerQuery, persistedAssets])

  const selectedLibraryAssetSet = useMemo(() => new Set(libraryPickerSelection), [libraryPickerSelection])
  const allPickerFilteredSelected = useMemo(() => {
    if (pickerFilteredPersistedAssets.length === 0) {
      return false
    }
    return pickerFilteredPersistedAssets.every((asset) => selectedLibraryAssetSet.has(asset.id))
  }, [pickerFilteredPersistedAssets, selectedLibraryAssetSet])

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

  const onLibraryPickerOpenChange = useCallback((nextOpen: boolean) => {
    setLibraryPickerOpen(nextOpen)
    if (!nextOpen) {
      setLibraryPickerQuery('')
      setLibraryPickerSelection([])
    }
  }, [])

  const onToggleLibraryPickerAsset = useCallback((assetId: string, checked: boolean) => {
    setLibraryPickerSelection((current) => {
      if (checked) {
        if (current.includes(assetId)) {
          return current
        }
        return [...current, assetId]
      }
      return current.filter((value) => value !== assetId)
    })
  }, [])

  const onToggleLibraryPickerSelectAll = useCallback(
    (checked: boolean) => {
      if (checked) {
        setLibraryPickerSelection((current) => {
          const nextSet = new Set(current)
          pickerFilteredPersistedAssets.forEach((asset) => {
            nextSet.add(asset.id)
          })
          return Array.from(nextSet)
        })
        return
      }
      const visibleIds = new Set(pickerFilteredPersistedAssets.map((asset) => asset.id))
      setLibraryPickerSelection((current) => current.filter((assetId) => !visibleIds.has(assetId)))
    },
    [pickerFilteredPersistedAssets],
  )

  const onPullSelectedLibraryAssets = useCallback(async () => {
    const token = getAuthSessionToken()
    if (!token) {
      setLibraryActionError('Sign in to pull files into this workspace.')
      return
    }
    const selectedAssets = persistedAssets.filter((asset) => selectedLibraryAssetSet.has(asset.id))
    if (selectedAssets.length === 0) {
      setLibraryActionError('Select at least one dataset to pull.')
      return
    }

    setLibraryPickerPulling(true)
    setLibraryActionError('')
    setLibraryActionStatus('')
    const errors: string[] = []
    let pulledCount = 0

    for (const asset of selectedAssets) {
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
        pulledCount += 1
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Could not pull file into workspace.'
        errors.push(`${asset.filename}: ${message}`)
      }
    }

    if (pulledCount > 0) {
      setLibraryActionStatus(`Pulled ${pulledCount} dataset${pulledCount === 1 ? '' : 's'} into workspace files.`)
      setLibraryPickerSelection([])
      setLibraryPickerQuery('')
      setLibraryPickerOpen(false)
    }
    if (errors.length > 0) {
      setLibraryActionError(errors.join(' '))
    }
    setLibraryPickerPulling(false)
  }, [addDataAsset, persistedAssets, selectedLibraryAssetSet])

  return (
    <>
      <PageFrame title="Data" description="" hideScaffoldHeader>
        <div
          className={cn(
            'grid gap-3 nav:gap-0',
            rightPanelCollapsed
              ? 'nav:grid-cols-[minmax(0,1fr)_56px]'
              : 'nav:grid-cols-[minmax(0,1fr)_320px]',
          )}
          data-house-role="data-page-layout"
        >
          <div data-house-role="data-main-column" className="nav:pr-3" />

          <aside
            className={cn('border-border nav:border-l', rightPanelCollapsed && 'bg-card')}
            data-house-role="data-right-panel"
          >
            {rightPanelCollapsed ? (
              <div
                className={cn('flex h-full flex-col items-center gap-2 p-2', houseLayout.sidebar)}
                data-house-role="data-right-panel-collapsed"
              >
                <Button
                  type="button"
                  size="sm"
                  variant="house"
                  className="h-8 px-2"
                  onClick={() => setRightPanelCollapsed(false)}
                  data-ui="data-right-panel-expand"
                  aria-label="Expand data sources panel"
                >
                  Expand
                </Button>
                <p className={cn('text-xs uppercase tracking-[0.08em]', houseTypography.fieldHelper)}>
                  Data sources
                </p>
              </div>
            ) : (
              <div className={cn('flex h-full flex-col', houseLayout.sidebar)} data-house-role="data-right-panel-expanded">
                <div className={houseLayout.sidebarHeader}>
                  <div className="flex items-start justify-between gap-2">
                    <div className={cn(houseLayout.pageHeader, houseSurfaces.leftBorder, HOUSE_LEFT_BORDER_DATA_CLASS)}>
                      <h2 className={houseTypography.sectionTitle}>Data sources</h2>
                    </div>
                    <Button
                      type="button"
                      size="sm"
                      variant="house"
                      className="h-8 px-2"
                      onClick={() => setRightPanelCollapsed(true)}
                      data-ui="data-right-panel-collapse"
                      aria-label="Collapse data sources panel"
                    >
                      Collapse
                    </Button>
                  </div>
                </div>

                <div className="grid gap-3 p-3">
                  <Card data-house-role="workspace-card">
                  <CardHeader className="space-y-2">
                    <div data-house-role="library-header-row" className="flex items-center gap-2">
                      <CardTitle data-house-role="section-title">Access from personal library</CardTitle>
                    </div>
                    <div>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => onLibraryPickerOpenChange(true)}
                        disabled={!hasSessionToken || persistSyncBusy}
                        data-ui="data-open-personal-library"
                      >
                        Open personal library
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

                    {persistSyncError ? (
                      <p data-house-role="sync-error" className="text-xs text-destructive">
                        {persistSyncError}
                      </p>
                    ) : null}
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
                </div>
              </div>
            )}
          </aside>
        </div>

      </PageFrame>
      <Sheet open={libraryPickerOpen} onOpenChange={onLibraryPickerOpenChange}>
        <SheetContent side="right" className="w-full max-w-sz-580 p-0 sm:w-sz-580">
          <div className="flex h-full flex-col">
            <div className="space-y-3 border-b border-border px-4 py-4">
              <div className="flex items-center justify-between gap-2">
                <div>
                  <h3 className={houseTypography.sectionTitle}>Personal library</h3>
                  <p className={houseTypography.fieldHelper}>
                    Select datasets to pull into this workspace.
                  </p>
                </div>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => void refreshPersistedAssets()}
                  disabled={!hasSessionToken || persistSyncBusy || libraryPickerPulling}
                >
                  <RefreshCw className="mr-1 h-4 w-4" />
                  Refresh
                </Button>
              </div>
              <div className="space-y-1">
                <label htmlFor="library-picker-search" className={houseTypography.fieldLabel}>Search library</label>
                <Input
                  id="library-picker-search"
                  value={libraryPickerQuery}
                  onChange={(event) => setLibraryPickerQuery(event.target.value)}
                  placeholder="File name, owner, or type"
                  className={houseForms.input}
                  disabled={!hasSessionToken || persistSyncBusy || libraryPickerPulling}
                />
              </div>
              <label className={cn('flex items-center gap-2', houseTypography.fieldHelper)}>
                <input
                  type="checkbox"
                  className="h-4 w-4 rounded border border-border"
                  checked={allPickerFilteredSelected}
                  onChange={(event) => onToggleLibraryPickerSelectAll(event.target.checked)}
                  disabled={!hasSessionToken || pickerFilteredPersistedAssets.length === 0 || libraryPickerPulling}
                />
                Select all shown ({pickerFilteredPersistedAssets.length})
              </label>
            </div>
            <ScrollArea className="flex-1 px-4 py-3">
              {!hasSessionToken ? (
                <p className={houseTypography.fieldHelper}>Sign in to access your personal library.</p>
              ) : persistSyncBusy ? (
                <p className={cn('flex items-center gap-2', houseTypography.fieldHelper)}>
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  Loading...
                </p>
              ) : pickerFilteredPersistedAssets.length === 0 ? (
                <p className={houseTypography.fieldHelper}>No datasets match this search.</p>
              ) : (
                <div className="space-y-2">
                  {pickerFilteredPersistedAssets.map((asset) => {
                    const checked = selectedLibraryAssetSet.has(asset.id)
                    const isBusy = libraryPickerPulling || libraryActionBusyAssetId === asset.id
                    return (
                      <div key={asset.id} className="rounded-md border border-border/70 p-2">
                        <div className="flex items-start gap-2">
                          <input
                            type="checkbox"
                            className="mt-1 h-4 w-4 rounded border border-border"
                            checked={checked}
                            onChange={(event) => onToggleLibraryPickerAsset(asset.id, event.target.checked)}
                            disabled={isBusy}
                            aria-label={`Select ${asset.filename}`}
                          />
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center justify-between gap-2">
                              <p className="truncate text-sm font-medium">{asset.filename}</p>
                              <Badge variant="outline">{asset.kind}</Badge>
                            </div>
                            <p className="text-xs text-muted-foreground">
                              {formatBytes(asset.byte_size)} | {new Date(asset.uploaded_at).toLocaleString()}
                            </p>
                            <p className="text-xs text-muted-foreground">
                              Owner: {normalizeName(String(asset.owner_name || '')) || 'Unknown'}
                            </p>
                            <div className="flex flex-wrap items-center gap-2 pt-2">
                              <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                onClick={() => void onDownloadLibraryAsset(asset)}
                                disabled={isBusy}
                              >
                                <Download className="mr-1 h-3.5 w-3.5" />
                                Download
                              </Button>
                              <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                onClick={() => void onPullLibraryAssetIntoWorkspace(asset)}
                                disabled={isBusy}
                              >
                                Pull now
                              </Button>
                            </div>
                          </div>
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
            </ScrollArea>
            <div className="space-y-2 border-t border-border px-4 py-3">
              {libraryActionError ? (
                <p className="text-xs text-destructive">{libraryActionError}</p>
              ) : null}
              {libraryActionStatus ? (
                <p className="text-xs text-emerald-600">{libraryActionStatus}</p>
              ) : null}
              <div className="flex items-center justify-between gap-2">
                <p className={houseTypography.fieldHelper}>{libraryPickerSelection.length} selected</p>
                <div className="flex items-center gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => onLibraryPickerOpenChange(false)}
                    disabled={libraryPickerPulling}
                  >
                    Close
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    onClick={() => void onPullSelectedLibraryAssets()}
                    disabled={!hasSessionToken || libraryPickerSelection.length === 0 || libraryPickerPulling}
                  >
                    {libraryPickerPulling ? 'Pulling...' : `Pull selected (${libraryPickerSelection.length})`}
                  </Button>
                </div>
              </div>
            </div>
          </div>
        </SheetContent>
      </Sheet>
    </>
  )
}
