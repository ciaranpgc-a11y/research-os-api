import { useEffect, useMemo, useState } from 'react'
import { Loader2, PanelRightOpen, RefreshCw } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { ScrollArea } from '@/components/ui/scroll-area'
import { getAuthSessionToken } from '@/lib/auth-session'
import { houseActions, houseCollaborators, houseForms, houseSurfaces, houseTables, houseTypography } from '@/lib/house-style'
import { listLibraryAssets } from '@/lib/study-core-api'
import { matchesScopedStorageEventKey, readScopedStorageItem } from '@/lib/user-scoped-storage'
import { cn } from '@/lib/utils'
import type {
  LibraryAssetOwnership,
  LibraryAssetRecord,
  LibraryAssetSortBy,
  LibraryAssetSortDirection,
} from '@/types/study-core'

const HOUSE_SECTION_TITLE_CLASS = houseTypography.sectionTitle
const HOUSE_FIELD_HELPER_CLASS = houseTypography.fieldHelper
const HOUSE_BUTTON_TEXT_CLASS = houseTypography.buttonText
const HOUSE_TABLE_SHELL_CLASS = houseSurfaces.tableShell
const HOUSE_TABLE_HEAD_CLASS = houseSurfaces.tableHead
const HOUSE_TABLE_ROW_CLASS = houseSurfaces.tableRow
const HOUSE_TABLE_HEAD_TEXT_CLASS = houseTypography.tableHead
const HOUSE_TABLE_CELL_TEXT_CLASS = houseTypography.tableCell
const HOUSE_TABLE_FILTER_INPUT_CLASS = houseTables.filterInput
const HOUSE_TABLE_FILTER_SELECT_CLASS = houseTables.filterSelect
const HOUSE_INPUT_CLASS = houseForms.input
const HOUSE_SELECT_CLASS = houseForms.select
const HOUSE_ACTION_BUTTON_CLASS = houseForms.actionButton
const HOUSE_SECTION_TOOLS_CLASS = houseActions.sectionTools
const HOUSE_SECTION_TOOLS_DATA_CLASS = houseActions.sectionToolsData
const HOUSE_SECTION_TOOL_BUTTON_CLASS = houseActions.sectionToolButton
const HOUSE_ACTIONS_PILL_CLASS = houseActions.actionPill
const HOUSE_ACTIONS_PILL_PRIMARY_CLASS = houseActions.actionPillPrimary
const HOUSE_COLLABORATOR_CHIP_CLASS = houseCollaborators.chip
const HOUSE_COLLABORATOR_CHIP_ACTIVE_CLASS = houseCollaborators.chipActive
const HOUSE_COLLABORATOR_CHIP_VIEW_ONLY_CLASS = houseCollaborators.chipViewOnly
const HOUSE_DATA_LIBRARY_FILTER_SELECT_CLASS = cn(
  'h-9 rounded-md px-2',
  HOUSE_SELECT_CLASS,
  HOUSE_TABLE_FILTER_SELECT_CLASS,
)
const DATA_LIBRARY_ACCESS_STATE_STORAGE_KEY = 'aawe-data-library-access-state-v1'
const DATA_LIBRARY_ACCESS_STATE_UPDATED_EVENT = 'data-library-access-state-updated'

type DataLibraryAccessRole = 'full_access' | 'view_only'
type DataLibraryAccessStatus = 'active' | 'pending' | 'removed'

type DataLibraryAccessMember = {
  key: string
  name: string
  userId: string | null
  role: DataLibraryAccessRole
  status: DataLibraryAccessStatus
  lastRole: DataLibraryAccessRole
}

export type DataLibraryAssetTableMeta = {
  total: number
  owned: number
  shared: number
  unavailable: number
  page: number
  pageSize: number
  totalPages: number
}

type WorkspacesDataLibraryViewProps = {
  selectedAssetId?: string | null
  refreshToken?: number
  displayNameByAssetId?: Record<string, string>
  onOpenDrilldownMobile?: () => void
  onSelectAsset?: (assetId: string | null) => void
  onAssetsChange?: (assets: LibraryAssetRecord[], meta: DataLibraryAssetTableMeta) => void
}

function normalizeName(value: string | null | undefined): string {
  return (value || '').trim().replace(/\s+/g, ' ')
}

function normalizeKey(value: string | null | undefined): string {
  return normalizeName(value).toLowerCase()
}

function parseAccessStateMapFromStorage(): Record<string, DataLibraryAccessMember[]> {
  const raw = readScopedStorageItem(DATA_LIBRARY_ACCESS_STATE_STORAGE_KEY)
  if (!raw) {
    return {}
  }
  try {
    const parsed = JSON.parse(raw) as Record<string, unknown>
    const next: Record<string, DataLibraryAccessMember[]> = {}
    for (const [assetId, value] of Object.entries(parsed || {})) {
      if (!Array.isArray(value)) {
        continue
      }
      const rows: DataLibraryAccessMember[] = []
      for (const row of value) {
        if (!row || typeof row !== 'object') {
          continue
        }
        const record = row as Record<string, unknown>
        const name = normalizeName(String(record.name || ''))
        if (!name) {
          continue
        }
        const role = String(record.role || '') === 'view_only' ? 'view_only' : 'full_access'
        const statusRaw = String(record.status || '')
        const status: DataLibraryAccessStatus =
          statusRaw === 'pending' || statusRaw === 'removed' ? statusRaw : 'active'
        rows.push({
          key: normalizeKey(name),
          name,
          userId: String(record.userId || '').trim() || null,
          role,
          status,
          lastRole: String(record.lastRole || '') === 'view_only' ? 'view_only' : 'full_access',
        })
      }
      next[assetId] = rows
    }
    return next
  } catch {
    return {}
  }
}

export function displayAssetFilename(filename: string): string {
  const clean = String(filename || '').trim()
  if (!clean) {
    return 'Untitled file'
  }
  const stripped = clean.replace(/\.(csv|xls|xlsx)$/i, '')
  return stripped || clean
}

export function formatDataLibraryTimestamp(value: string): string {
  const parsed = Date.parse(value)
  if (Number.isNaN(parsed)) {
    return 'Not available'
  }
  return new Date(parsed).toLocaleString('en-GB', {
    year: 'numeric',
    month: 'short',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  })
}

export function formatDataLibraryBytes(bytes: number): string {
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

function isAssetAvailable(asset: LibraryAssetRecord): boolean {
  return asset.is_available !== false
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

export function WorkspacesDataLibraryView({
  selectedAssetId = null,
  refreshToken = 0,
  displayNameByAssetId = {},
  onOpenDrilldownMobile,
  onSelectAsset,
  onAssetsChange,
}: WorkspacesDataLibraryViewProps = {}) {
  const [assets, setAssets] = useState<LibraryAssetRecord[]>([])
  const [queryInput, setQueryInput] = useState('')
  const [query, setQuery] = useState('')
  const [ownershipFilter, setOwnershipFilter] = useState<LibraryAssetOwnership>('all')
  const [sortBy, setSortBy] = useState<LibraryAssetSortBy>('uploaded_at')
  const [sortDirection, setSortDirection] = useState<LibraryAssetSortDirection>('desc')
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(25)
  const [total, setTotal] = useState(0)
  const [hasMore, setHasMore] = useState(false)
  const [refreshTick, setRefreshTick] = useState(0)
  const [accessStateByAssetId, setAccessStateByAssetId] = useState<Record<string, DataLibraryAccessMember[]>>(
    () => parseAccessStateMapFromStorage(),
  )
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState('')
  const hasSessionToken = Boolean(getAuthSessionToken())

  useEffect(() => {
    const refreshAccessState = () => {
      setAccessStateByAssetId(parseAccessStateMapFromStorage())
    }
    const onStorage = (event: StorageEvent) => {
      if (!matchesScopedStorageEventKey(event.key, DATA_LIBRARY_ACCESS_STATE_STORAGE_KEY)) {
        return
      }
      refreshAccessState()
    }
    window.addEventListener(DATA_LIBRARY_ACCESS_STATE_UPDATED_EVENT, refreshAccessState)
    window.addEventListener('storage', onStorage)
    return () => {
      window.removeEventListener(DATA_LIBRARY_ACCESS_STATE_UPDATED_EVENT, refreshAccessState)
      window.removeEventListener('storage', onStorage)
    }
  }, [])

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setPage(1)
      setQuery(queryInput.trim())
    }, 250)
    return () => window.clearTimeout(timer)
  }, [queryInput])

  useEffect(() => {
    let cancelled = false

    if (!hasSessionToken) {
      setAssets([])
      setTotal(0)
      setHasMore(false)
      setError('')
      setIsLoading(false)
      return () => {
        cancelled = true
      }
    }

    const token = getAuthSessionToken()
    if (!token) {
      setAssets([])
      setTotal(0)
      setHasMore(false)
      setError('')
      setIsLoading(false)
      return () => {
        cancelled = true
      }
    }

    const load = async () => {
      setIsLoading(true)
      setError('')
      try {
        const payload = await listLibraryAssets({
          token,
          query,
          ownership: ownershipFilter,
          page,
          pageSize,
          sortBy,
          sortDirection,
        })
        if (cancelled) {
          return
        }

        const totalPages = Math.max(1, Math.ceil(Math.max(0, payload.total) / Math.max(1, payload.page_size)))
        if (payload.total > 0 && page > totalPages) {
          setPage(totalPages)
          return
        }

        setAssets(payload.items || [])
        setTotal(Math.max(0, Number(payload.total || 0)))
        setHasMore(Boolean(payload.has_more))
      } catch (loadError) {
        if (cancelled) {
          return
        }
        setAssets([])
        setTotal(0)
        setHasMore(false)
        setError(loadError instanceof Error ? loadError.message : 'Could not load data library.')
      } finally {
        if (!cancelled) {
          setIsLoading(false)
        }
      }
    }

    void load()

    return () => {
      cancelled = true
    }
  }, [hasSessionToken, ownershipFilter, page, pageSize, query, refreshTick, refreshToken, sortBy, sortDirection])

  const ownedAssetCount = useMemo(
    () => assets.filter((asset) => Boolean(asset.can_manage_access)).length,
    [assets],
  )
  const unavailableAssetCount = useMemo(
    () => assets.filter((asset) => !isAssetAvailable(asset)).length,
    [assets],
  )
  const sharedAssetCount = Math.max(0, assets.length - ownedAssetCount)
  const totalPages = Math.max(1, Math.ceil(Math.max(0, total) / Math.max(1, pageSize)))
  const visibleStart = total === 0 ? 0 : (page - 1) * pageSize + 1
  const visibleEnd = Math.min(total, page * pageSize)

  useEffect(() => {
    onAssetsChange?.(assets, {
      total,
      owned: ownedAssetCount,
      shared: sharedAssetCount,
      unavailable: unavailableAssetCount,
      page,
      pageSize,
      totalPages,
    })
  }, [
    assets,
    onAssetsChange,
    ownedAssetCount,
    page,
    pageSize,
    sharedAssetCount,
    total,
    totalPages,
    unavailableAssetCount,
  ])

  useEffect(() => {
    if (!onSelectAsset) {
      return
    }
    if (assets.length === 0) {
      if (selectedAssetId !== null) {
        onSelectAsset(null)
      }
      return
    }
    if (!selectedAssetId) {
      onSelectAsset(assets[0].id)
      return
    }
    const exists = assets.some((asset) => asset.id === selectedAssetId)
    if (!exists) {
      onSelectAsset(assets[0].id)
    }
  }, [assets, onSelectAsset, selectedAssetId])

  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-4 py-3">
        <h2 className={HOUSE_SECTION_TITLE_CLASS}>Data library</h2>
        <div className="flex flex-wrap items-center gap-2">
          <span className="inline-flex items-center rounded border border-border bg-background px-2 py-1 text-xs text-muted-foreground">
            Total {total}
          </span>
          <span className="inline-flex items-center rounded border border-border bg-background px-2 py-1 text-xs text-muted-foreground">
            Owned {ownedAssetCount}
          </span>
          <span className="inline-flex items-center rounded border border-border bg-background px-2 py-1 text-xs text-muted-foreground">
            Shared {sharedAssetCount}
          </span>
          {unavailableAssetCount > 0 ? (
            <span className="inline-flex items-center rounded border border-[hsl(var(--tone-warning-300))] bg-[hsl(var(--tone-warning-100))] px-2 py-1 text-xs text-[hsl(var(--tone-warning-900))]">
              Missing storage {unavailableAssetCount}
            </span>
          ) : null}
          <Button
            type="button"
            size="sm"
            className={cn(HOUSE_ACTION_BUTTON_CLASS, HOUSE_BUTTON_TEXT_CLASS)}
            onClick={() => setRefreshTick((current) => current + 1)}
            disabled={!hasSessionToken || isLoading}
          >
            <RefreshCw className={cn('mr-1 h-4 w-4', isLoading && 'animate-spin')} />
            Refresh
          </Button>
          {onOpenDrilldownMobile ? (
            <div className={cn(HOUSE_SECTION_TOOLS_CLASS, HOUSE_SECTION_TOOLS_DATA_CLASS, HOUSE_ACTIONS_PILL_CLASS, 'xl:hidden')}>
              <button
                type="button"
                onClick={onOpenDrilldownMobile}
                className={cn(
                  HOUSE_ACTIONS_PILL_PRIMARY_CLASS,
                  HOUSE_SECTION_TOOL_BUTTON_CLASS,
                  HOUSE_BUTTON_TEXT_CLASS,
                  'inline-flex h-8 items-center gap-1.5 px-3',
                )}
                aria-label="Open data library drilldown"
              >
                <PanelRightOpen className="h-3.5 w-3.5" />
                Drilldown
              </button>
            </div>
          ) : null}
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2 border-b border-border px-4 py-3">
        <Input
          value={queryInput}
          onChange={(event) => setQueryInput(event.target.value)}
          placeholder="Search files, owner, or access"
          className={cn('w-sz-280', HOUSE_INPUT_CLASS, HOUSE_TABLE_FILTER_INPUT_CLASS)}
          disabled={!hasSessionToken}
        />
        <select
          value={ownershipFilter}
          onChange={(event) => {
            setOwnershipFilter(event.target.value as LibraryAssetOwnership)
            setPage(1)
          }}
          className={HOUSE_DATA_LIBRARY_FILTER_SELECT_CLASS}
          disabled={!hasSessionToken}
        >
          <option value="all">All files</option>
          <option value="owned">Owned by me</option>
          <option value="shared">Shared with me</option>
        </select>
        <select
          value={sortBy}
          onChange={(event) => {
            setSortBy(event.target.value as LibraryAssetSortBy)
            setPage(1)
          }}
          className={HOUSE_DATA_LIBRARY_FILTER_SELECT_CLASS}
          disabled={!hasSessionToken}
        >
          <option value="uploaded_at">Sort: Uploaded</option>
          <option value="filename">Sort: File name</option>
          <option value="byte_size">Sort: Size</option>
          <option value="kind">Sort: Type</option>
          <option value="owner_name">Sort: Owner</option>
        </select>
        <select
          value={sortDirection}
          onChange={(event) => {
            setSortDirection(event.target.value as LibraryAssetSortDirection)
            setPage(1)
          }}
          className={HOUSE_DATA_LIBRARY_FILTER_SELECT_CLASS}
          disabled={!hasSessionToken}
        >
          <option value="desc">Descending</option>
          <option value="asc">Ascending</option>
        </select>
      </div>

      {!hasSessionToken ? (
        <div className={cn('p-6', HOUSE_FIELD_HELPER_CLASS)}>
          Sign in to view your personal data library.
        </div>
      ) : isLoading ? (
        <div className={cn('p-6 text-sm text-muted-foreground', HOUSE_FIELD_HELPER_CLASS)}>
          <span className="inline-flex items-center gap-2">
            <Loader2 className="h-4 w-4 animate-spin" />
            Loading files...
          </span>
        </div>
      ) : error ? (
        <div className="space-y-2 p-6">
          <p className="text-sm text-red-700">{error}</p>
          <Button
            type="button"
            size="sm"
            className={cn(HOUSE_ACTION_BUTTON_CLASS, HOUSE_BUTTON_TEXT_CLASS)}
            onClick={() => setRefreshTick((current) => current + 1)}
          >
            Retry
          </Button>
        </div>
      ) : assets.length === 0 ? (
        <div className={cn('p-6', HOUSE_FIELD_HELPER_CLASS)}>
          No files match the current filter.
        </div>
      ) : (
        <div className={cn(HOUSE_TABLE_SHELL_CLASS, 'house-workspaces-table-shell')}>
          <ScrollArea className="h-[min(65vh,46rem)]">
            <table className="w-full min-w-sz-920 text-sm">
              <thead className={cn('text-left', HOUSE_TABLE_HEAD_CLASS)}>
                <tr>
                  <th className={cn('px-3 py-2', HOUSE_TABLE_HEAD_TEXT_CLASS)}>File</th>
                  <th className={cn('px-3 py-2', HOUSE_TABLE_HEAD_TEXT_CLASS)}>Owner</th>
                  <th className={cn('px-3 py-2', HOUSE_TABLE_HEAD_TEXT_CLASS)}>Access</th>
                  <th className={cn('px-3 py-2', HOUSE_TABLE_HEAD_TEXT_CLASS)}>Uploaded</th>
                  <th className={cn('px-3 py-2', HOUSE_TABLE_HEAD_TEXT_CLASS)}>Size</th>
                </tr>
              </thead>
              <tbody>
                {assets.map((asset) => {
                  const stagedMembers = accessStateByAssetId[asset.id] || []
                  const activeStagedMembers = stagedMembers.filter((member) => member.status === 'active')
                  const accessMembers =
                    activeStagedMembers.length > 0
                      ? activeStagedMembers.map((member) => ({
                          key: member.key || `${asset.id}-${member.name}`,
                          name: member.name,
                          role: member.role,
                        }))
                      : libraryAssetAccessMembers(asset).map((member) => ({
                          key: member.user_id || `${asset.id}-${member.name}`,
                          name: member.name,
                          role: 'full_access' as const,
                        }))
                  const available = isAssetAvailable(asset)
                  const ownerName = normalizeName(asset.owner_name || '') || 'Unknown'
                  const isSelected = selectedAssetId === asset.id
                  const displayName = displayNameByAssetId[asset.id] || asset.filename
                  return (
                    <tr
                      key={asset.id}
                      className={cn(
                        HOUSE_TABLE_ROW_CLASS,
                        'cursor-pointer',
                        isSelected && 'bg-[hsl(var(--tone-accent-50)/0.72)]',
                      )}
                      onClick={() => onSelectAsset?.(asset.id)}
                      aria-selected={isSelected}
                    >
                      <td className={cn('px-3 py-2 align-middle', HOUSE_TABLE_CELL_TEXT_CLASS)}>
                        <p className="font-medium">{displayAssetFilename(displayName)}</p>
                        <p className="text-xs text-muted-foreground">{asset.kind.toUpperCase()}</p>
                        {!available ? <p className="text-xs text-[hsl(var(--tone-warning-900))]">Storage missing</p> : null}
                      </td>
                      <td className={cn('px-3 py-2 align-middle', HOUSE_TABLE_CELL_TEXT_CLASS)}>
                        <span className="text-sm">{asset.can_manage_access ? 'You' : ownerName}</span>
                      </td>
                      <td className={cn('px-3 py-2 align-middle', HOUSE_TABLE_CELL_TEXT_CLASS)}>
                        {accessMembers.length === 0 ? (
                          <span className="text-xs text-muted-foreground">Private</span>
                        ) : (
                          <div className="flex flex-wrap items-center gap-1">
                            {accessMembers.slice(0, 2).map((member) => (
                              <span
                                key={`${asset.id}-${member.key}`}
                                className={cn(
                                  member.role === 'view_only'
                                    ? cn(HOUSE_COLLABORATOR_CHIP_CLASS, HOUSE_COLLABORATOR_CHIP_VIEW_ONLY_CLASS, 'text-[10px]')
                                    : cn(HOUSE_COLLABORATOR_CHIP_CLASS, HOUSE_COLLABORATOR_CHIP_ACTIVE_CLASS, 'text-[10px]'),
                                )}
                              >
                                {member.name}
                              </span>
                            ))}
                            {accessMembers.length > 2 ? (
                              <span className="rounded border border-border px-1.5 py-0.5 text-[10px] text-muted-foreground">
                                +{accessMembers.length - 2}
                              </span>
                            ) : null}
                          </div>
                        )}
                      </td>
                      <td className={cn('px-3 py-2 align-middle', HOUSE_TABLE_CELL_TEXT_CLASS)}>
                        <span className="text-xs text-muted-foreground">{formatDataLibraryTimestamp(asset.uploaded_at)}</span>
                      </td>
                      <td className={cn('px-3 py-2 align-middle', HOUSE_TABLE_CELL_TEXT_CLASS)}>
                        <span className="text-xs text-muted-foreground">{formatDataLibraryBytes(asset.byte_size)}</span>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </ScrollArea>
        </div>
      )}

      {hasSessionToken && assets.length > 0 ? (
        <div className="flex items-center justify-between border-t border-border px-4 py-3 text-xs text-muted-foreground">
          <span>Showing {visibleStart}-{visibleEnd} of {total}</span>
          <div className="flex items-center gap-2">
            <select
              value={String(pageSize)}
              onChange={(event) => {
                const nextPageSize = Math.max(5, Math.min(100, Number(event.target.value || 25)))
                setPageSize(nextPageSize)
                setPage(1)
              }}
              className={cn('h-8 rounded-md px-2', HOUSE_SELECT_CLASS, HOUSE_TABLE_FILTER_SELECT_CLASS)}
              disabled={isLoading}
            >
              <option value="10">10 / page</option>
              <option value="25">25 / page</option>
              <option value="50">50 / page</option>
              <option value="100">100 / page</option>
            </select>
            <Button
              type="button"
              size="sm"
              className={cn(HOUSE_ACTION_BUTTON_CLASS, HOUSE_BUTTON_TEXT_CLASS)}
              onClick={() => setPage((current) => Math.max(1, current - 1))}
              disabled={page <= 1 || isLoading}
            >
              Previous
            </Button>
            <span>Page {page} / {totalPages}</span>
            <Button
              type="button"
              size="sm"
              className={cn(HOUSE_ACTION_BUTTON_CLASS, HOUSE_BUTTON_TEXT_CLASS)}
              onClick={() => setPage((current) => Math.min(totalPages, current + 1))}
              disabled={!hasMore || page >= totalPages || isLoading}
            >
              Next
            </Button>
          </div>
        </div>
      ) : null}
    </>
  )
}
