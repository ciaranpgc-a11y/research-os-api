/**
 * Data library view page
 *
 * Displays files, access controls, and permissions for the personal data library.
 * Supports browsing, filtering, searching, and managing asset visibility and metadata.
 */

import { useCallback, useEffect, useMemo, useState } from 'react'
import { Download, Loader2, PanelRightOpen, RefreshCw, Save, Search, UserPlus, X } from 'lucide-react'

import { Button, Input, ScrollArea, SelectPrimitive, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui'
import { PageHeader, Row, Section, Stack } from '@/components/primitives'
import { SectionMarker } from '@/components/patterns'
import { getSectionMarkerTone } from '@/lib/section-tone'
import { getAuthSessionToken } from '@/lib/auth-session'
import { houseActions, houseCollaborators, houseForms, houseLayout, houseSurfaces, houseTables, houseTypography } from '@/lib/house-style'
import { listCollaborators } from '@/lib/impact-api'
import {
  downloadLibraryAsset,
  listLibraryAssets,
  updateLibraryAssetAccess,
  updateLibraryAssetMetadata,
} from '@/lib/study-core-api'
import { cn } from '@/lib/utils'
import type { CollaboratorPayload } from '@/types/impact'
import type {
  LibraryAssetOwnership,
  LibraryAssetRecord,
  LibraryAssetSortBy,
  LibraryAssetSortDirection,
} from '@/types/study-core'

const HOUSE_FIELD_HELPER_CLASS = houseTypography.fieldHelper
const HOUSE_BUTTON_TEXT_CLASS = houseTypography.buttonText
const HOUSE_SECTION_ANCHOR_CLASS = houseLayout.sectionAnchor
const HOUSE_TABLE_SHELL_CLASS = houseSurfaces.tableShell
const HOUSE_TABLE_HEAD_CLASS = houseSurfaces.tableHead
const HOUSE_TABLE_ROW_CLASS = houseSurfaces.tableRow
const HOUSE_TABLE_HEAD_TEXT_CLASS = houseTypography.tableHead
const HOUSE_TABLE_CELL_TEXT_CLASS = houseTypography.tableCell
const HOUSE_TABLE_FILTER_INPUT_CLASS = houseTables.filterInput
const HOUSE_TABLE_FILTER_SELECT_CLASS = houseTables.filterSelect
const HOUSE_INPUT_CLASS = houseForms.input
const HOUSE_ACTION_BUTTON_CLASS = houseForms.actionButton
const HOUSE_PRIMARY_ACTION_BUTTON_CLASS = houseForms.actionButtonPrimary
const HOUSE_SUCCESS_ACTION_BUTTON_CLASS = houseForms.actionButtonSuccess
const HOUSE_DANGER_ACTION_BUTTON_CLASS = houseForms.actionButtonDanger
const HOUSE_SECTION_TOOLS_CLASS = houseActions.sectionTools
const HOUSE_SECTION_TOOLS_DATA_CLASS = houseActions.sectionToolsData
const HOUSE_SECTION_TOOL_BUTTON_CLASS = houseActions.sectionToolButton
const HOUSE_ACTIONS_PILL_CLASS = houseActions.actionPill
const HOUSE_ACTIONS_PILL_PRIMARY_CLASS = houseActions.actionPillPrimary
const HOUSE_COLLABORATOR_LIST_SHELL_CLASS = houseCollaborators.listShell
const HOUSE_COLLABORATOR_LIST_VIEWPORT_COMPACT_CLASS = houseCollaborators.listViewportCompact
const HOUSE_COLLABORATOR_LIST_BODY_CLASS = houseCollaborators.listBody
const HOUSE_COLLABORATOR_CANDIDATE_CLASS = houseCollaborators.candidate
const HOUSE_COLLABORATOR_CANDIDATE_SELECTED_CLASS = houseCollaborators.candidateSelected
const HOUSE_COLLABORATOR_CANDIDATE_IDLE_CLASS = houseCollaborators.candidateIdle
const HOUSE_COLLABORATOR_CANDIDATE_META_CLASS = houseCollaborators.candidateMeta
const HOUSE_COLLABORATOR_CANDIDATE_SOURCE_CLASS = houseCollaborators.candidateSource
const HOUSE_COLLABORATOR_CHIP_CLASS = houseCollaborators.chip
const HOUSE_COLLABORATOR_CHIP_ACTIVE_CLASS = houseCollaborators.chipActive
const HOUSE_COLLABORATOR_CHIP_MANAGEABLE_CLASS = houseCollaborators.chipManageable
const HOUSE_COLLABORATOR_CHIP_READONLY_CLASS = houseCollaborators.chipReadOnly
const HOUSE_COLLABORATOR_CHIP_ACTION_CLASS = houseCollaborators.chipAction
const DATA_LIBRARY_ICON_BUTTON_DIMENSION_CLASS = 'h-8 w-8 p-0'
const HOUSE_DATA_LIBRARY_FILTER_SELECT_CLASS = cn(
  'h-9 w-auto rounded-md px-2',
  HOUSE_TABLE_FILTER_SELECT_CLASS,
)

type WorkspacesDataLibraryViewProps = {
  onOpenDrilldownMobile?: () => void
}

function normalizeName(value: string | null | undefined): string {
  return (value || '').trim().replace(/\s+/g, ' ')
}

function displayAssetFilename(filename: string): string {
  const clean = String(filename || '').trim()
  if (!clean) {
    return 'Untitled file'
  }
  const stripped = clean.replace(/\.(csv|xls|xlsx)$/i, '')
  return stripped || clean
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

function selectedCandidateByAssetIdValue(
  map: Record<string, CollaboratorPayload | null>,
  assetId: string,
): CollaboratorPayload | null {
  return map[assetId] || null
}

export function WorkspacesDataLibraryView({ onOpenDrilldownMobile }: WorkspacesDataLibraryViewProps = {}) {
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
  const [assetMenuOpenId, setAssetMenuOpenId] = useState<string | null>(null)
  const [renamingAssetId, setRenamingAssetId] = useState<string | null>(null)
  const [renameDraft, setRenameDraft] = useState('')
  const [refreshTick, setRefreshTick] = useState(0)

  const [collaboratorQueryByAssetId, setCollaboratorQueryByAssetId] = useState<Record<string, string>>({})
  const [collaboratorLookupByAssetId, setCollaboratorLookupByAssetId] = useState<Record<string, CollaboratorPayload[]>>({})
  const [selectedCollaboratorByAssetId, setSelectedCollaboratorByAssetId] = useState<Record<string, CollaboratorPayload | null>>({})
  const [lookupErrorByAssetId, setLookupErrorByAssetId] = useState<Record<string, string>>({})
  const [lookupBusyAssetId, setLookupBusyAssetId] = useState<string | null>(null)

  const hasSessionToken = Boolean(getAuthSessionToken())

  useEffect(() => {
    if (!assetMenuOpenId) {
      return
    }
    const onPointerDown = (event: MouseEvent) => {
      const target = event.target as HTMLElement | null
      if (target?.closest('[data-ui="library-asset-menu-root"]')) {
        return
      }
      setAssetMenuOpenId(null)
    }
    window.addEventListener('mousedown', onPointerDown)
    return () => {
      window.removeEventListener('mousedown', onPointerDown)
    }
  }, [assetMenuOpenId])

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

  useEffect(() => {
    if (assetMenuOpenId && !assets.some((asset) => asset.id === assetMenuOpenId)) {
      setAssetMenuOpenId(null)
    }
    if (renamingAssetId && !assets.some((asset) => asset.id === renamingAssetId)) {
      setRenamingAssetId(null)
      setRenameDraft('')
    }
  }, [assetMenuOpenId, assets, renamingAssetId])

  const updateAssetInState = useCallback((nextAsset: LibraryAssetRecord) => {
    setAssets((current) => current.map((item) => (item.id === nextAsset.id ? nextAsset : item)))
  }, [])

  const onRefresh = () => {
    setRefreshTick((current) => current + 1)
  }

  const onCancelRenameAsset = useCallback(() => {
    setRenamingAssetId(null)
    setRenameDraft('')
    setAssetMenuOpenId(null)
  }, [])

  const onStartRenameAsset = useCallback((asset: LibraryAssetRecord) => {
    if (!asset.can_manage_access) {
      setError('Only the file owner can rename files.')
      return
    }
    setError('')
    setStatus('')
    setAssetMenuOpenId(null)
    setRenamingAssetId(asset.id)
    setRenameDraft(asset.filename)
  }, [])

  const onSaveRenameAsset = useCallback(
    async (asset: LibraryAssetRecord) => {
      const nextFilename = String(renameDraft || '').trim()
      if (!asset.can_manage_access) {
        setError('Only the file owner can rename files.')
        return
      }
      if (!nextFilename) {
        setError('File name is required.')
        return
      }
      if (nextFilename === asset.filename) {
        onCancelRenameAsset()
        return
      }
      const token = getAuthSessionToken()
      if (!token) {
        setError('Sign in to manage permissions.')
        return
      }

      setError('')
      setStatus('')
      setBusyAssetId(asset.id)
      try {
        const updated = await updateLibraryAssetMetadata({
          token,
          assetId: asset.id,
          filename: nextFilename,
        })
        updateAssetInState(updated)
        setStatus(`Renamed to ${updated.filename}.`)
        onCancelRenameAsset()
      } catch (renameError) {
        setError(renameError instanceof Error ? renameError.message : 'Could not rename file.')
      } finally {
        setBusyAssetId((current) => (current === asset.id ? null : current))
      }
    },
    [onCancelRenameAsset, renameDraft, updateAssetInState],
  )

  const onDownloadAsset = useCallback(async (asset: LibraryAssetRecord) => {
    if (!isAssetAvailable(asset)) {
      setError(`'${asset.filename}' is currently unavailable (missing storage).`)
      return
    }
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
        const existingAccessNames = new Set(
          libraryAssetAccessMembers(asset).map((member) => normalizeName(member.name).toLowerCase()),
        )
        const ownerName = normalizeName(asset.owner_name || '').toLowerCase()
        const seenNames = new Set<string>()
        const filtered = (payload.items || []).filter((candidate) => {
          const candidateName = normalizeName(candidate.full_name)
          if (!candidateName) {
            return false
          }
          const nameKey = candidateName.toLowerCase()
          if (seenNames.has(nameKey)) {
            return false
          }
          seenNames.add(nameKey)
          if (nameKey === ownerName) {
            return false
          }
          if (existingAccessNames.has(nameKey)) {
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
      if (!selected) {
        setError('Select a collaborator from directory results first.')
        return
      }

      const selectedName = normalizeName(selected.full_name)
      if (!selectedName) {
        setError('Selected collaborator is missing a name.')
        return
      }

      const existingAccessNames = new Set(
        libraryAssetAccessMembers(asset).map((member) => normalizeName(member.name).toLowerCase()),
      )
      if (existingAccessNames.has(selectedName.toLowerCase())) {
        setError(`${selectedName} already has access.`)
        return
      }

      const currentIds = (asset.shared_with_user_ids || []).map((value) => String(value || '').trim()).filter(Boolean)

      setError('')
      setStatus('')
      setBusyAssetId(asset.id)
      try {
        const updated = await updateLibraryAssetAccess({
          token,
          assetId: asset.id,
          collaboratorUserIds: currentIds,
          collaboratorNames: [selectedName],
        })
        updateAssetInState(updated)
        setCollaboratorLookupByAssetId((current) => ({ ...current, [asset.id]: [] }))
        setSelectedCollaboratorByAssetId((current) => ({ ...current, [asset.id]: null }))
        setCollaboratorQueryByAssetId((current) => ({ ...current, [asset.id]: '' }))
        setLookupErrorByAssetId((current) => ({ ...current, [asset.id]: '' }))
        setStatus(`Granted access to ${selectedName}.`)
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
  const unavailableAssetCount = useMemo(
    () => assets.filter((asset) => !isAssetAvailable(asset)).length,
    [assets],
  )
  const sharedAssetCount = Math.max(0, assets.length - ownedAssetCount)
  const totalPages = Math.max(1, Math.ceil(Math.max(0, total) / Math.max(1, pageSize)))
  const visibleStart = total === 0 ? 0 : (page - 1) * pageSize + 1
  const visibleEnd = Math.min(total, page * pageSize)

  return (
    <Stack data-house-role="page" space="sm">
      <Row
        align="center"
        gap="md"
        wrap={false}
        className="house-page-title-row"
      >
        <SectionMarker tone={getSectionMarkerTone('workspace')} size="title" className="self-stretch h-auto" />
        <PageHeader
          heading="Data library"
          description="Display files, access, and permissions in your personal data library."
          className="!ml-0 !mt-0"
        />
      </Row>

      <Section className={cn(HOUSE_SECTION_ANCHOR_CLASS)} surface="transparent" inset="none" spaceY="none">
      <div className="flex flex-wrap items-center gap-2 px-4 py-3 border-b border-border">
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
          onClick={onRefresh}
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
                title="Open data library drilldown"
              >
                <PanelRightOpen className="h-3.5 w-3.5" />
                Drilldown
              </button>
            </div>
          ) : null}
        </div>

      <div className="flex flex-wrap items-center gap-2 border-b border-border px-4 py-3">
        <Input
          value={queryInput}
          onChange={(event) => setQueryInput(event.target.value)}
          placeholder="Search files, owner, or access"
          className={cn('w-sz-280', HOUSE_INPUT_CLASS, HOUSE_TABLE_FILTER_INPUT_CLASS)}
          disabled={!hasSessionToken}
        />
        <SelectPrimitive
          value={ownershipFilter}
          onValueChange={(value) => {
            setOwnershipFilter(value as LibraryAssetOwnership)
            setPage(1)
          }}
          disabled={!hasSessionToken}
        >
          <SelectTrigger className={HOUSE_DATA_LIBRARY_FILTER_SELECT_CLASS}>
            <SelectValue placeholder="All files" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All files</SelectItem>
            <SelectItem value="owned">Owned by me</SelectItem>
            <SelectItem value="shared">Shared with me</SelectItem>
          </SelectContent>
        </SelectPrimitive>
        <SelectPrimitive
          value={sortBy}
          onValueChange={(value) => {
            setSortBy(value as LibraryAssetSortBy)
            setPage(1)
          }}
          disabled={!hasSessionToken}
        >
          <SelectTrigger className={HOUSE_DATA_LIBRARY_FILTER_SELECT_CLASS}>
            <SelectValue placeholder="Sort: Uploaded" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="uploaded_at">Sort: Uploaded</SelectItem>
            <SelectItem value="filename">Sort: File name</SelectItem>
            <SelectItem value="byte_size">Sort: Size</SelectItem>
            <SelectItem value="kind">Sort: Type</SelectItem>
            <SelectItem value="owner_name">Sort: Owner</SelectItem>
          </SelectContent>
        </SelectPrimitive>
        <SelectPrimitive
          value={sortDirection}
          onValueChange={(value) => {
            setSortDirection(value as LibraryAssetSortDirection)
            setPage(1)
          }}
          disabled={!hasSessionToken}
        >
          <SelectTrigger className={HOUSE_DATA_LIBRARY_FILTER_SELECT_CLASS}>
            <SelectValue placeholder="Descending" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="desc">Descending</SelectItem>
            <SelectItem value="asc">Ascending</SelectItem>
          </SelectContent>
        </SelectPrimitive>
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
          <Button type="button" size="sm" className={cn(HOUSE_ACTION_BUTTON_CLASS, HOUSE_BUTTON_TEXT_CLASS)} onClick={onRefresh}>
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
                  const available = isAssetAvailable(asset)
                  const menuOpen = assetMenuOpenId === asset.id
                  const isRenaming = renamingAssetId === asset.id
                  const ownerName = normalizeName(asset.owner_name || '') || 'Unknown'
                  const searchQuery = collaboratorQueryByAssetId[asset.id] || ''
                  const matches = collaboratorLookupByAssetId[asset.id] || []
                  const lookupError = lookupErrorByAssetId[asset.id] || ''
                  const selectedCandidate = selectedCandidateByAssetIdValue(selectedCollaboratorByAssetId, asset.id)

                  return (
                    <tr key={asset.id} className={HOUSE_TABLE_ROW_CLASS}>
                      <td className={cn('px-3 py-2 align-middle', HOUSE_TABLE_CELL_TEXT_CLASS)}>
                        <div className="flex items-center justify-between gap-2">
                          <div className="min-w-0 flex-1">
                            {isRenaming ? (
                              <div className="flex items-center gap-1.5" onClick={(event) => event.stopPropagation()}>
                                <Input
                                  value={renameDraft}
                                  onChange={(event) => setRenameDraft(event.target.value)}
                                  onKeyDown={(event) => {
                                    if (event.key === 'Enter') {
                                      event.preventDefault()
                                      void onSaveRenameAsset(asset)
                                    } else if (event.key === 'Escape') {
                                      event.preventDefault()
                                      onCancelRenameAsset()
                                    }
                                  }}
                                  className={cn('h-8 w-full', HOUSE_INPUT_CLASS)}
                                  disabled={isBusy}
                                  autoFocus
                                />
                                <Button
                                  type="button"
                                  size="sm"
                                  className={cn(HOUSE_SUCCESS_ACTION_BUTTON_CLASS, DATA_LIBRARY_ICON_BUTTON_DIMENSION_CLASS)}
                                  onClick={() => void onSaveRenameAsset(asset)}
                                  disabled={isBusy || !String(renameDraft || '').trim() || String(renameDraft || '').trim() === asset.filename.trim()}
                                  aria-label={`Save rename for ${asset.filename}`}
                                  title="Save rename"
                                >
                                  <Save className="h-4 w-4" />
                                </Button>
                                <Button
                                  type="button"
                                  size="sm"
                                  className={cn(HOUSE_DANGER_ACTION_BUTTON_CLASS, DATA_LIBRARY_ICON_BUTTON_DIMENSION_CLASS)}
                                  onClick={onCancelRenameAsset}
                                  disabled={isBusy}
                                  aria-label="Cancel rename"
                                  title="Cancel rename"
                                >
                                  <X className="h-4 w-4" />
                                </Button>
                              </div>
                            ) : (
                              <>
                                <p className="font-medium">{displayAssetFilename(asset.filename)}</p>
                                <p className="text-xs text-muted-foreground">{asset.kind.toUpperCase()}</p>
                                {!available ? <p className="text-xs text-[hsl(var(--tone-warning-900))]">Storage missing</p> : null}
                              </>
                            )}
                          </div>
                          {asset.can_manage_access ? (
                            <div className="relative shrink-0" data-ui="library-asset-menu-root">
                              <Button
                                type="button"
                                size="sm"
                                className={cn(HOUSE_ACTION_BUTTON_CLASS, HOUSE_BUTTON_TEXT_CLASS, DATA_LIBRARY_ICON_BUTTON_DIMENSION_CLASS)}
                                onClick={(event) => {
                                  event.stopPropagation()
                                  setAssetMenuOpenId((current) => (current === asset.id ? null : asset.id))
                                }}
                                disabled={isBusy}
                                aria-label={`File actions for ${asset.filename}`}
                                title="File actions"
                              >
                                ...
                              </Button>
                              {menuOpen ? (
                                <div className="absolute right-0 top-full z-20 mt-1 min-w-sz-140 rounded-md border border-border bg-background p-1 shadow-sm">
                                  <button
                                    type="button"
                                    onClick={() => onStartRenameAsset(asset)}
                                    className="w-full rounded px-2 py-1 text-left text-sm text-foreground transition-colors hover:bg-muted/70"
                                    disabled={isBusy}
                                  >
                                    Rename
                                  </button>
                                </div>
                              ) : null}
                            </div>
                          ) : null}
                        </div>
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
                                className={cn(
                                  HOUSE_COLLABORATOR_CHIP_CLASS,
                                  HOUSE_COLLABORATOR_CHIP_ACTIVE_CLASS,
                                  asset.can_manage_access ? HOUSE_COLLABORATOR_CHIP_MANAGEABLE_CLASS : HOUSE_COLLABORATOR_CHIP_READONLY_CLASS,
                                )}
                              >
                                <span>{member.name}</span>
                                {asset.can_manage_access && member.user_id ? (
                                  <button
                                    type="button"
                                    className={HOUSE_COLLABORATOR_CHIP_ACTION_CLASS}
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
                            <div className="space-y-1">
                              <div className="flex items-center gap-1.5">
                                <Input
                                  value={searchQuery}
                                  onChange={(event) => {
                                    const nextValue = event.target.value
                                    setCollaboratorQueryByAssetId((current) => ({
                                      ...current,
                                      [asset.id]: nextValue,
                                    }))
                                    setSelectedCollaboratorByAssetId((current) => ({
                                      ...current,
                                      [asset.id]: null,
                                    }))
                                    setLookupErrorByAssetId((current) => ({
                                      ...current,
                                      [asset.id]: '',
                                    }))
                                  }}
                                  placeholder="Search by name or email"
                                  className={cn('h-8', HOUSE_INPUT_CLASS)}
                                  disabled={isBusy}
                                />
                                <Button
                                  type="button"
                                  size="sm"
                                  className={cn(HOUSE_ACTION_BUTTON_CLASS, HOUSE_BUTTON_TEXT_CLASS)}
                                  onClick={() => void onSearchCollaborators(asset)}
                                  disabled={isBusy || lookupBusy || normalizeName(searchQuery).length < 2}
                                >
                                  {lookupBusy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Search className="h-3.5 w-3.5" />}
                                </Button>
                              </div>
                              <p className={HOUSE_FIELD_HELPER_CLASS}>
                                Type at least 2 characters. Access updates are enforced server-side.
                              </p>
                            </div>
                            {lookupError ? <p className="text-xs text-amber-700">{lookupError}</p> : null}
                            {matches.length > 0 ? (
                              <div className={HOUSE_COLLABORATOR_LIST_SHELL_CLASS}>
                                <ScrollArea className={HOUSE_COLLABORATOR_LIST_VIEWPORT_COMPACT_CLASS}>
                                  <div className={HOUSE_COLLABORATOR_LIST_BODY_CLASS}>
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
                                            HOUSE_COLLABORATOR_CANDIDATE_CLASS,
                                            isSelected
                                              ? HOUSE_COLLABORATOR_CANDIDATE_SELECTED_CLASS
                                              : HOUSE_COLLABORATOR_CANDIDATE_IDLE_CLASS,
                                          )}
                                        >
                                          <p className={houseTypography.text}>{candidate.full_name}</p>
                                          <div className={HOUSE_COLLABORATOR_CANDIDATE_META_CLASS}>
                                            <p className={houseTypography.fieldHelper}>
                                              {[candidate.email || '', candidate.primary_institution || ''].filter(Boolean).join(' | ') || 'Directory match'}
                                            </p>
                                            <span className={HOUSE_COLLABORATOR_CANDIDATE_SOURCE_CLASS}>Directory</span>
                                          </div>
                                        </button>
                                      )
                                    })}
                                  </div>
                                </ScrollArea>
                              </div>
                            ) : null}
                            <div className="flex items-center justify-between gap-2">
                              <p className="text-xs text-muted-foreground">
                                {selectedCandidate ? `Selected: ${selectedCandidate.full_name}` : 'No collaborator selected'}
                              </p>
                              <Button
                                type="button"
                                size="sm"
                                className={cn(HOUSE_PRIMARY_ACTION_BUTTON_CLASS, HOUSE_BUTTON_TEXT_CLASS)}
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
                        <div className="flex items-center">
                          <Button
                            type="button"
                            size="sm"
                            className={cn(HOUSE_ACTION_BUTTON_CLASS, HOUSE_BUTTON_TEXT_CLASS)}
                            onClick={() => void onDownloadAsset(asset)}
                            disabled={isBusy || !available || isRenaming}
                          >
                            {isBusy ? <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" /> : <Download className="mr-1 h-3.5 w-3.5" />}
                            {available ? 'Download' : 'Unavailable'}
                          </Button>
                        </div>
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
              <SelectPrimitive
                value={String(pageSize)}
                onValueChange={(value) => {
                  const nextPageSize = Math.max(10, Math.min(100, Number(value || 25)))
                  setPageSize(nextPageSize)
                  setPage(1)
                }}
                disabled={!hasSessionToken || isLoading}
              >
                <SelectTrigger className={cn('h-8 w-auto rounded-md px-2 text-xs', HOUSE_TABLE_FILTER_SELECT_CLASS)}>
                  <SelectValue placeholder="25 / page" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="10">10 / page</SelectItem>
                  <SelectItem value="25">25 / page</SelectItem>
                  <SelectItem value="50">50 / page</SelectItem>
                  <SelectItem value="100">100 / page</SelectItem>
                </SelectContent>
              </SelectPrimitive>
              <Button
                type="button"
                size="sm"
                className={cn(HOUSE_ACTION_BUTTON_CLASS, HOUSE_BUTTON_TEXT_CLASS)}
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
                className={cn(HOUSE_ACTION_BUTTON_CLASS, HOUSE_BUTTON_TEXT_CLASS)}
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
      </Section>
    </Stack>
  )
}
