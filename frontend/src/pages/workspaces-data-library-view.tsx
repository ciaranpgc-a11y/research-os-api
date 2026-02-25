import { useCallback, useEffect, useMemo, useState } from 'react'
import { Download, Loader2, RefreshCw, Search, UserPlus, X } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { ScrollArea } from '@/components/ui/scroll-area'
import { getAuthSessionToken } from '@/lib/auth-session'
import { houseForms, houseSurfaces, houseTypography } from '@/lib/house-style'
import { listCollaborators } from '@/lib/impact-api'
import {
  downloadLibraryAsset,
  listLibraryAssets,
  updateLibraryAssetAccess,
} from '@/lib/study-core-api'
import { cn } from '@/lib/utils'
import type { CollaboratorPayload } from '@/types/impact'
import type {
  LibraryAssetOwnership,
  LibraryAssetRecord,
  LibraryAssetSortBy,
  LibraryAssetSortDirection,
} from '@/types/study-core'

const HOUSE_SECTION_TITLE_CLASS = houseTypography.sectionTitle
const HOUSE_SECTION_SUBTITLE_CLASS = houseTypography.sectionSubtitle
const HOUSE_FIELD_HELPER_CLASS = houseTypography.fieldHelper
const HOUSE_TABLE_SHELL_CLASS = houseSurfaces.tableShell
const HOUSE_TABLE_HEAD_CLASS = houseSurfaces.tableHead
const HOUSE_TABLE_ROW_CLASS = houseSurfaces.tableRow
const HOUSE_TABLE_HEAD_TEXT_CLASS = houseTypography.tableHead
const HOUSE_TABLE_CELL_TEXT_CLASS = houseTypography.tableCell
const HOUSE_INPUT_CLASS = houseForms.input
const HOUSE_SELECT_CLASS = houseForms.select
const HOUSE_ACTION_BUTTON_CLASS = houseForms.actionButton
const HOUSE_PRIMARY_ACTION_BUTTON_CLASS = houseForms.actionButtonPrimary

function normalizeName(value: string | null | undefined): string {
  return (value || '').trim().replace(/\s+/g, ' ')
}

function formatTimestamp(value: string): string {
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

function selectedCandidateByAssetIdValue(
  map: Record<string, CollaboratorPayload | null>,
  assetId: string,
): CollaboratorPayload | null {
  return map[assetId] || null
}

export function WorkspacesDataLibraryView() {
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
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState('')
  const [status, setStatus] = useState('')
  const [busyAssetId, setBusyAssetId] = useState<string | null>(null)
  const [refreshTick, setRefreshTick] = useState(0)

  const [collaboratorQueryByAssetId, setCollaboratorQueryByAssetId] = useState<Record<string, string>>({})
  const [collaboratorLookupByAssetId, setCollaboratorLookupByAssetId] = useState<Record<string, CollaboratorPayload[]>>({})
  const [selectedCollaboratorByAssetId, setSelectedCollaboratorByAssetId] = useState<Record<string, CollaboratorPayload | null>>({})
  const [lookupErrorByAssetId, setLookupErrorByAssetId] = useState<Record<string, string>>({})
  const [lookupBusyAssetId, setLookupBusyAssetId] = useState<string | null>(null)

  const hasSessionToken = Boolean(getAuthSessionToken())

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
      setStatus('')
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
      setStatus('')
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
  }, [hasSessionToken, ownershipFilter, page, pageSize, query, refreshTick, sortBy, sortDirection])

  const updateAssetInState = useCallback((nextAsset: LibraryAssetRecord) => {
    setAssets((current) => current.map((item) => (item.id === nextAsset.id ? nextAsset : item)))
  }, [])

  const onRefresh = () => {
    setRefreshTick((current) => current + 1)
  }

  const onDownloadAsset = useCallback(async (asset: LibraryAssetRecord) => {
    const token = getAuthSessionToken()
    if (!token) {
      setError('Sign in to download files.')
      return
    }
    setError('')
    setStatus('')
    setBusyAssetId(asset.id)
    try {
      const payload = await downloadLibraryAsset({
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
      setStatus(`Downloaded ${payload.fileName || asset.filename}.`)
    } catch (downloadError) {
      setError(downloadError instanceof Error ? downloadError.message : 'Could not download file.')
    } finally {
      setBusyAssetId((current) => (current === asset.id ? null : current))
    }
  }, [])

  const onSearchCollaborators = useCallback(
    async (asset: LibraryAssetRecord) => {
      const token = getAuthSessionToken()
      if (!token) {
        setError('Sign in to search collaborators.')
        return
      }

      const queryValue = normalizeName(collaboratorQueryByAssetId[asset.id] || '')
      if (queryValue.length < 2) {
        setLookupErrorByAssetId((current) => ({
          ...current,
          [asset.id]: 'Type at least 2 characters to search.',
        }))
        return
      }

      setLookupBusyAssetId(asset.id)
      setLookupErrorByAssetId((current) => ({ ...current, [asset.id]: '' }))
      setStatus('')
      setError('')
      try {
        const payload = await listCollaborators(token, {
          query: queryValue,
          page: 1,
          pageSize: 25,
        })
        const existingIds = new Set((asset.shared_with_user_ids || []).map((value) => String(value || '').trim()))
        const ownerId = String(asset.owner_user_id || '').trim()
        const filtered = (payload.items || []).filter((candidate) => {
          const candidateId = String(candidate.id || '').trim()
          if (!candidateId) {
            return false
          }
          if (candidateId === ownerId) {
            return false
          }
          if (existingIds.has(candidateId)) {
            return false
          }
          return true
        })
        setCollaboratorLookupByAssetId((current) => ({
          ...current,
          [asset.id]: filtered,
        }))
        if (filtered.length === 0) {
          setLookupErrorByAssetId((current) => ({
            ...current,
            [asset.id]: 'No eligible collaborators found.',
          }))
        }
      } catch (lookupError) {
        setCollaboratorLookupByAssetId((current) => ({ ...current, [asset.id]: [] }))
        setLookupErrorByAssetId((current) => ({
          ...current,
          [asset.id]: lookupError instanceof Error ? lookupError.message : 'Directory lookup failed.',
        }))
      } finally {
        setLookupBusyAssetId((current) => (current === asset.id ? null : current))
      }
    },
    [collaboratorQueryByAssetId],
  )

  const onAddAccess = useCallback(
    async (asset: LibraryAssetRecord) => {
      const token = getAuthSessionToken()
      if (!token) {
        setError('Sign in to manage permissions.')
        return
      }
      if (!asset.can_manage_access) {
        setError('Only the file owner can manage access.')
        return
      }

      const selected = selectedCandidateByAssetIdValue(selectedCollaboratorByAssetId, asset.id)
      if (!selected || !String(selected.id || '').trim()) {
        setError('Select a collaborator from directory results first.')
        return
      }

      const selectedId = String(selected.id || '').trim()
      const currentIds = (asset.shared_with_user_ids || []).map((value) => String(value || '').trim()).filter(Boolean)
      if (currentIds.includes(selectedId)) {
        setError(`${selected.full_name} already has access.`)
        return
      }

      setError('')
      setStatus('')
      setBusyAssetId(asset.id)
      try {
        const updated = await updateLibraryAssetAccess({
          token,
          assetId: asset.id,
          collaboratorUserIds: [...currentIds, selectedId],
          collaboratorNames: [],
        })
        updateAssetInState(updated)
        setCollaboratorLookupByAssetId((current) => ({ ...current, [asset.id]: [] }))
        setSelectedCollaboratorByAssetId((current) => ({ ...current, [asset.id]: null }))
        setCollaboratorQueryByAssetId((current) => ({ ...current, [asset.id]: '' }))
        setLookupErrorByAssetId((current) => ({ ...current, [asset.id]: '' }))
        setStatus(`Granted access to ${selected.full_name}.`)
      } catch (updateError) {
        setError(updateError instanceof Error ? updateError.message : 'Could not update permissions.')
      } finally {
        setBusyAssetId((current) => (current === asset.id ? null : current))
      }
    },
    [selectedCollaboratorByAssetId, updateAssetInState],
  )

  const onRemoveAccess = useCallback(
    async (asset: LibraryAssetRecord, collaboratorUserId: string) => {
      const token = getAuthSessionToken()
      if (!token) {
        setError('Sign in to manage permissions.')
        return
      }
      if (!asset.can_manage_access) {
        setError('Only the file owner can manage access.')
        return
      }
      const cleanCollaboratorUserId = String(collaboratorUserId || '').trim()
      if (!cleanCollaboratorUserId) {
        setError('This collaborator cannot be removed from here.')
        return
      }

      setError('')
      setStatus('')
      setBusyAssetId(asset.id)
      try {
        const currentIds = Array.isArray(asset.shared_with_user_ids) ? asset.shared_with_user_ids : []
        const nextIds = currentIds.filter((userId) => String(userId || '').trim() !== cleanCollaboratorUserId)
        const updated = await updateLibraryAssetAccess({
          token,
          assetId: asset.id,
          collaboratorUserIds: nextIds,
          collaboratorNames: [],
        })
        updateAssetInState(updated)
        setStatus('Access updated.')
      } catch (updateError) {
        setError(updateError instanceof Error ? updateError.message : 'Could not update permissions.')
      } finally {
        setBusyAssetId((current) => (current === asset.id ? null : current))
      }
    },
    [updateAssetInState],
  )

  const ownedAssetCount = useMemo(
    () => assets.filter((asset) => Boolean(asset.can_manage_access)).length,
    [assets],
  )
  const sharedAssetCount = Math.max(0, assets.length - ownedAssetCount)
  const totalPages = Math.max(1, Math.ceil(Math.max(0, total) / Math.max(1, pageSize)))
  const visibleStart = total === 0 ? 0 : (page - 1) * pageSize + 1
  const visibleEnd = Math.min(total, page * pageSize)

  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-4 py-3">
        <div>
          <h2 className={HOUSE_SECTION_TITLE_CLASS}>Data library</h2>
          <p className={HOUSE_SECTION_SUBTITLE_CLASS}>
            Display files, access, and permissions in your personal data library.
          </p>
        </div>
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
          <Button
            type="button"
            size="sm"
            className={HOUSE_ACTION_BUTTON_CLASS}
            onClick={onRefresh}
            disabled={!hasSessionToken || isLoading}
          >
            <RefreshCw className={cn('mr-1 h-4 w-4', isLoading && 'animate-spin')} />
            Refresh
          </Button>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2 border-b border-border px-4 py-3">
        <Input
          value={queryInput}
          onChange={(event) => setQueryInput(event.target.value)}
          placeholder="Search files, owner, or access"
          className={cn('w-sz-280', HOUSE_INPUT_CLASS)}
          disabled={!hasSessionToken}
        />
        <select
          value={ownershipFilter}
          onChange={(event) => {
            setOwnershipFilter(event.target.value as LibraryAssetOwnership)
            setPage(1)
          }}
          className={cn('h-9 rounded-md bg-background px-2 text-sm', HOUSE_SELECT_CLASS)}
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
          className={cn('h-9 rounded-md bg-background px-2 text-sm', HOUSE_SELECT_CLASS)}
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
          className={cn('h-9 rounded-md bg-background px-2 text-sm', HOUSE_SELECT_CLASS)}
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
          <Button type="button" size="sm" className={HOUSE_ACTION_BUTTON_CLASS} onClick={onRefresh}>
            Retry
          </Button>
        </div>
      ) : assets.length === 0 ? (
        <div className={cn('p-6', HOUSE_FIELD_HELPER_CLASS)}>
          No files match the current filter.
        </div>
      ) : (
        <div className={HOUSE_TABLE_SHELL_CLASS}>
          <ScrollArea className="h-[min(65vh,46rem)]">
            <table className="w-full min-w-sz-1080 text-sm">
              <thead className={cn('text-left', HOUSE_TABLE_HEAD_CLASS)}>
                <tr>
                  <th className={cn('px-3 py-2', HOUSE_TABLE_HEAD_TEXT_CLASS)}>File</th>
                  <th className={cn('px-3 py-2', HOUSE_TABLE_HEAD_TEXT_CLASS)}>Owner</th>
                  <th className={cn('px-3 py-2', HOUSE_TABLE_HEAD_TEXT_CLASS)}>Access</th>
                  <th className={cn('px-3 py-2', HOUSE_TABLE_HEAD_TEXT_CLASS)}>Uploaded</th>
                  <th className={cn('px-3 py-2', HOUSE_TABLE_HEAD_TEXT_CLASS)}>Size</th>
                  <th className={cn('px-3 py-2', HOUSE_TABLE_HEAD_TEXT_CLASS)}>Permissions</th>
                  <th className={cn('px-3 py-2', HOUSE_TABLE_HEAD_TEXT_CLASS)}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {assets.map((asset) => {
                  const accessMembers = libraryAssetAccessMembers(asset)
                  const isBusy = busyAssetId === asset.id
                  const lookupBusy = lookupBusyAssetId === asset.id
                  const ownerName = normalizeName(asset.owner_name || '') || 'Unknown'
                  const searchQuery = collaboratorQueryByAssetId[asset.id] || ''
                  const matches = collaboratorLookupByAssetId[asset.id] || []
                  const lookupError = lookupErrorByAssetId[asset.id] || ''
                  const selectedCandidate = selectedCandidateByAssetIdValue(selectedCollaboratorByAssetId, asset.id)

                  return (
                    <tr key={asset.id} className={HOUSE_TABLE_ROW_CLASS}>
                      <td className={cn('px-3 py-2 align-middle', HOUSE_TABLE_CELL_TEXT_CLASS)}>
                        <p className="font-medium">{asset.filename}</p>
                        <p className="text-xs text-muted-foreground">{asset.kind.toUpperCase()}</p>
                      </td>
                      <td className={cn('px-3 py-2 align-middle text-muted-foreground', HOUSE_TABLE_CELL_TEXT_CLASS)}>
                        {ownerName}
                      </td>
                      <td className={cn('px-3 py-2 align-middle', HOUSE_TABLE_CELL_TEXT_CLASS)}>
                        <div className="flex flex-wrap items-center gap-1.5">
                          {accessMembers.length === 0 ? (
                            <span className="text-xs text-muted-foreground">Owner only</span>
                          ) : (
                            accessMembers.map((member) => (
                              <span
                                key={`${asset.id}-${member.user_id}-${member.name}`}
                                className="inline-flex items-center gap-1 rounded border border-border bg-background px-1.5 py-0.5 text-xs"
                              >
                                <span>{member.name}</span>
                                {asset.can_manage_access && member.user_id ? (
                                  <button
                                    type="button"
                                    className="rounded border border-transparent p-0.5 text-muted-foreground hover:border-border hover:text-foreground"
                                    onClick={() => void onRemoveAccess(asset, member.user_id)}
                                    disabled={isBusy}
                                    aria-label={`Remove ${member.name} access`}
                                  >
                                    <X className="h-3 w-3" />
                                  </button>
                                ) : null}
                              </span>
                            ))
                          )}
                        </div>
                      </td>
                      <td className={cn('px-3 py-2 align-middle text-muted-foreground', HOUSE_TABLE_CELL_TEXT_CLASS)}>
                        {formatTimestamp(asset.uploaded_at)}
                      </td>
                      <td className={cn('px-3 py-2 align-middle text-muted-foreground', HOUSE_TABLE_CELL_TEXT_CLASS)}>
                        {formatBytes(asset.byte_size)}
                      </td>
                      <td className={cn('px-3 py-2 align-middle', HOUSE_TABLE_CELL_TEXT_CLASS)}>
                        {asset.can_manage_access ? (
                          <div className="min-w-sz-320 space-y-1.5">
                            <div className="flex items-center gap-1.5">
                              <Input
                                value={searchQuery}
                                onChange={(event) => {
                                  const nextValue = event.target.value
                                  setCollaboratorQueryByAssetId((current) => ({
                                    ...current,
                                    [asset.id]: nextValue,
                                  }))
                                }}
                                placeholder="Search collaborator directory"
                                className={cn('h-8', HOUSE_INPUT_CLASS)}
                                disabled={isBusy}
                              />
                              <Button
                                type="button"
                                size="sm"
                                className={HOUSE_ACTION_BUTTON_CLASS}
                                onClick={() => void onSearchCollaborators(asset)}
                                disabled={isBusy || lookupBusy || normalizeName(searchQuery).length < 2}
                              >
                                {lookupBusy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Search className="h-3.5 w-3.5" />}
                              </Button>
                            </div>
                            {lookupError ? <p className="text-xs text-amber-700">{lookupError}</p> : null}
                            {matches.length > 0 ? (
                              <div className="max-h-24 space-y-1 overflow-y-auto rounded border border-border bg-background p-1">
                                {matches.map((candidate) => {
                                  const isSelected = selectedCandidate?.id === candidate.id
                                  return (
                                    <button
                                      key={`${asset.id}-${candidate.id}`}
                                      type="button"
                                      onClick={() => {
                                        setSelectedCollaboratorByAssetId((current) => ({
                                          ...current,
                                          [asset.id]: candidate,
                                        }))
                                      }}
                                      className={cn(
                                        'w-full rounded border px-2 py-1 text-left text-xs',
                                        isSelected
                                          ? 'border-[hsl(var(--tone-accent-300))] bg-[hsl(var(--tone-accent-50))]'
                                          : 'border-transparent hover:border-border hover:bg-accent/30',
                                      )}
                                    >
                                      <p className="font-medium">{candidate.full_name}</p>
                                      <p className="text-muted-foreground">
                                        {[candidate.email || '', candidate.primary_institution || ''].filter(Boolean).join(' | ') || 'Directory match'}
                                      </p>
                                    </button>
                                  )
                                })}
                              </div>
                            ) : null}
                            <div className="flex items-center justify-between gap-2">
                              <p className="text-xs text-muted-foreground">
                                {selectedCandidate ? `Selected: ${selectedCandidate.full_name}` : 'No collaborator selected'}
                              </p>
                              <Button
                                type="button"
                                size="sm"
                                className={HOUSE_PRIMARY_ACTION_BUTTON_CLASS}
                                onClick={() => void onAddAccess(asset)}
                                disabled={isBusy || !selectedCandidate}
                              >
                                <UserPlus className="mr-1 h-3.5 w-3.5" />
                                Grant
                              </Button>
                            </div>
                          </div>
                        ) : (
                          <span className="text-xs text-muted-foreground">View only</span>
                        )}
                      </td>
                      <td className={cn('px-3 py-2 align-middle', HOUSE_TABLE_CELL_TEXT_CLASS)}>
                        <Button
                          type="button"
                          size="sm"
                          className={HOUSE_ACTION_BUTTON_CLASS}
                          onClick={() => void onDownloadAsset(asset)}
                          disabled={isBusy}
                        >
                          {isBusy ? <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" /> : <Download className="mr-1 h-3.5 w-3.5" />}
                          Download
                        </Button>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </ScrollArea>
          <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border px-3 py-2">
            <p className="text-xs text-muted-foreground">
              Showing {visibleStart}-{visibleEnd} of {total}
            </p>
            <div className="flex flex-wrap items-center gap-2">
              <select
                value={String(pageSize)}
                onChange={(event) => {
                  const nextPageSize = Math.max(10, Math.min(100, Number(event.target.value || 25)))
                  setPageSize(nextPageSize)
                  setPage(1)
                }}
                className={cn('h-8 rounded-md bg-background px-2 text-xs', HOUSE_SELECT_CLASS)}
                disabled={!hasSessionToken || isLoading}
              >
                <option value="10">10 / page</option>
                <option value="25">25 / page</option>
                <option value="50">50 / page</option>
                <option value="100">100 / page</option>
              </select>
              <Button
                type="button"
                size="sm"
                className={HOUSE_ACTION_BUTTON_CLASS}
                onClick={() => setPage((current) => Math.max(1, current - 1))}
                disabled={isLoading || page <= 1}
              >
                Previous
              </Button>
              <span className="text-xs text-muted-foreground">
                Page {page} of {totalPages}
              </span>
              <Button
                type="button"
                size="sm"
                className={HOUSE_ACTION_BUTTON_CLASS}
                onClick={() => setPage((current) => current + 1)}
                disabled={isLoading || !hasMore}
              >
                Next
              </Button>
            </div>
          </div>
        </div>
      )}

      {status ? (
        <p className={cn('px-4 py-3 text-sm text-emerald-700', HOUSE_FIELD_HELPER_CLASS)}>{status}</p>
      ) : null}
    </>
  )
}
