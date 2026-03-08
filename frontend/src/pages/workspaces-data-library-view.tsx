/**
 * Data library view page
 *
 * Displays files, access controls, and permissions for the personal data library.
 * Supports browsing, filtering, searching, and managing asset visibility and metadata.
 */

import { useCallback, useEffect, useMemo, useRef, useState, type MouseEvent as ReactMouseEvent } from 'react'
import { createPortal } from 'react-dom'
import { Archive, ArrowRight, ChevronDown, ChevronUp, Download, Loader2, Lock, LockOpen, MoreHorizontal, Pencil, Plus, RotateCcw, Save, Search, Send, UserMinus, X } from 'lucide-react'

import {
  Badge,
  Button,
  Input,
  SelectPrimitive,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Sheet,
  SheetContent,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui'
import { DrilldownSheet, PageHeader, Row, SectionHeader, Stack } from '@/components/primitives'
import { SectionMarker } from '@/components/patterns'
import { getSectionMarkerTone } from '@/lib/section-tone'
import { getAuthSessionToken } from '@/lib/auth-session'
import { drilldownTabFlexGrow } from '@/components/publications/house-drilldown-header-utils'
import { houseCollaborators, houseDrilldown, houseForms, houseLayout, houseMotion, houseSurfaces, houseTables, houseTypography } from '@/lib/house-style'
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
  LibraryAssetAccessRole,
  LibraryAssetAuditEntry,
  LibraryAssetOwnership,
  LibraryAssetRecord,
  LibraryAssetScope,
  LibraryAssetSortBy,
  LibraryAssetSortDirection,
} from '@/types/study-core'

const HOUSE_FIELD_HELPER_CLASS = houseTypography.fieldHelper
const HOUSE_SECTION_ANCHOR_CLASS = houseLayout.sectionAnchor
const HOUSE_TABLE_CELL_TEXT_CLASS = houseTypography.tableCell
const HOUSE_INPUT_CLASS = houseForms.input
const HOUSE_TOGGLE_BUTTON_CLASS = houseMotion.toggleButton
const HOUSE_DRILLDOWN_TOGGLE_MUTED_CLASS = houseDrilldown.toggleButtonMuted
const HOUSE_COLLABORATOR_CHIP_CLASS = houseCollaborators.chip
const HOUSE_COLLABORATOR_CHIP_ACTIVE_CLASS = houseCollaborators.chipActive
const HOUSE_COLLABORATOR_CHIP_READONLY_CLASS = houseCollaborators.chipReadOnly
const HOUSE_COLLABORATOR_ACTION_ICON_CLASS = houseCollaborators.actionIcon
const HOUSE_DRILLDOWN_SHEET_CLASS = houseDrilldown.sheet
const HOUSE_DRILLDOWN_SHEET_BODY_CLASS = houseDrilldown.sheetBody
const HOUSE_DRILLDOWN_COLLAPSIBLE_ENTITY_CLASS = houseDrilldown.collapsibleEntity
const HOUSE_COLLABORATOR_CHIP_REMOVED_CLASS = houseCollaborators.chipRemoved
const DATA_LIBRARY_OWNER_BADGE_CLASS = 'border-emerald-300 bg-emerald-50 text-emerald-800'
const DATA_LIBRARY_EDITOR_CHIP_CLASS = 'border-sky-300 bg-sky-50 text-sky-800'
const DATA_LIBRARY_VIEWER_CHIP_CLASS = 'border-slate-300 bg-slate-50 text-slate-700'

const DATA_LIBRARY_SCOPE_OPTIONS: Array<{ value: LibraryAssetOwnership; label: string }> = [
  { value: 'all', label: 'All' },
  { value: 'owned', label: 'Owned' },
  { value: 'shared', label: 'Shared' },
]
const DATA_LIBRARY_ARCHIVE_SCOPE_OPTIONS: Array<{ value: LibraryAssetScope; label: string }> = [
  { value: 'all', label: 'All' },
  { value: 'active', label: 'Active' },
  { value: 'archived', label: 'Archived' },
]
const DATA_LIBRARY_ACCESS_ROLE_OPTIONS: Array<{ value: LibraryAssetAccessRole; label: string }> = [
  { value: 'editor', label: 'Editor' },
  { value: 'viewer', label: 'Viewer' },
]

type WorkspacesDataLibraryViewProps = {
  showPageHeader?: boolean
}

type DataLibraryDrilldownTab = 'overview' | 'access' | 'actions' | 'logs'
type DataLibraryMenuState = {
  assetId: string
  x: number
  y: number
}
type DataLibraryTableDensity = 'compact' | 'default' | 'comfortable'
type DataLibraryTableColumnKey = 'filename' | 'access' | 'uploaded' | 'format' | 'size' | 'actions'
type DataLibraryMemberMenuState = {
  assetId: string
  userId: string
  x: number
  y: number
}

const DATA_LIBRARY_TABLE_COLUMN_ORDER: DataLibraryTableColumnKey[] = [
  'filename',
  'access',
  'uploaded',
  'format',
  'size',
  'actions',
]

const DATA_LIBRARY_TABLE_COLUMN_DEFINITIONS: Record<
  DataLibraryTableColumnKey,
  { label: string; width: string; sortBy?: LibraryAssetSortBy; hideable?: boolean; align?: 'left' | 'center' }
> = {
  filename: { label: 'File name', width: '34%', sortBy: 'filename' },
  access: { label: 'Access', width: '40%', sortBy: 'owner_name', hideable: true },
  uploaded: { label: 'Uploaded', width: '14%', sortBy: 'uploaded_at', hideable: true },
  format: { label: 'Format', width: '8%', sortBy: 'kind', hideable: true },
  size: { label: 'Size', width: '8%', sortBy: 'byte_size', hideable: true },
  actions: { label: 'Actions', width: '7rem', align: 'center' },
}

function normalizeName(value: string | null | undefined): string {
  return (value || '').trim().replace(/\s+/g, ' ')
}

function normalizeUserId(value: string | null | undefined): string {
  return String(value || '').trim()
}

function resolveCollaboratorUserId(candidate: CollaboratorPayload): string {
  return normalizeUserId(candidate.owner_user_id || candidate.id)
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

function isAssetArchivedForCurrentUser(asset: LibraryAssetRecord): boolean {
  return asset.archived_for_current_user === true
}

function isAssetLockedForTeamMembers(asset: LibraryAssetRecord): boolean {
  return asset.locked_for_team_members === true
}

function assetOwnerDisplayName(asset: LibraryAssetRecord): string {
  return normalizeName(asset.owner_name || '') || 'the owner'
}

function assetOwnerCompactReference(asset: LibraryAssetRecord): string {
  return asset.current_user_role === 'owner' ? 'you' : assetOwnerDisplayName(asset)
}

function assetLockedBadgeLabel(asset: LibraryAssetRecord): string {
  return `Locked by ${assetOwnerCompactReference(asset)}`
}

function assetLockActionLabel(asset: LibraryAssetRecord): string {
  return isAssetLockedForTeamMembers(asset) ? 'Unlock for team members' : 'Lock for team members'
}

function assetArchiveActionLabel(asset: LibraryAssetRecord): string {
  return isAssetArchivedForCurrentUser(asset) ? 'Unarchive' : 'Archive'
}

function assetLockStateLabel(asset: LibraryAssetRecord): string {
  return isAssetLockedForTeamMembers(asset) ? assetLockedBadgeLabel(asset) : 'No'
}

function assetArchiveStateLabel(asset: LibraryAssetRecord): string {
  return isAssetArchivedForCurrentUser(asset) ? 'Yes' : 'No'
}

function assetReadOnlyMessage(asset: LibraryAssetRecord): string | null {
  if (!isAssetLockedForTeamMembers(asset)) {
    return null
  }
  if (asset.current_user_role === 'owner') {
    return 'This file is locked by you for team members. You still have full edit access.'
  }
  return `This file is locked by ${assetOwnerDisplayName(asset)} and is view-only.`
}

function assetDownloadUnavailableMessage(asset: LibraryAssetRecord): string {
  if (!isAssetAvailable(asset)) {
    return `'${asset.filename}' is currently unavailable (missing storage).`
  }
  if (isAssetLockedForTeamMembers(asset) && asset.current_user_role !== 'owner') {
    return `This file is locked by ${assetOwnerDisplayName(asset)} for team members.`
  }
  return 'Only file owners and editors can download files.'
}

function formatAuditCompactTimestamp(value: string): string {
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

function humanizeAuditValue(value: string | null | undefined): string {
  const clean = normalizeName(value || '')
  if (!clean) {
    return ''
  }
  return clean.replace(/_/g, ' ').replace(/\b\w/g, (match) => match.toUpperCase())
}

function assetAuditStatePillClassName(rawValue: string | null | undefined): string {
  const clean = normalizeName(rawValue || '').toLowerCase()
  if (clean === 'granted' || clean === 'uploaded' || clean === 'downloaded' || clean === 'editor' || clean === 'owner') {
    return cn(HOUSE_COLLABORATOR_CHIP_CLASS, HOUSE_COLLABORATOR_CHIP_ACTIVE_CLASS)
  }
  if (clean === 'revoked') {
    return cn(HOUSE_COLLABORATOR_CHIP_CLASS, HOUSE_COLLABORATOR_CHIP_REMOVED_CLASS)
  }
  return cn(HOUSE_COLLABORATOR_CHIP_CLASS, HOUSE_COLLABORATOR_CHIP_READONLY_CLASS)
}

function humanizeLibraryAssetAccessRole(role: LibraryAssetAccessRole): string {
  return role === 'editor' ? 'Editor' : 'Viewer'
}

function libraryAssetAccessChipClassName(role: LibraryAssetAccessRole): string {
  return cn(
    HOUSE_COLLABORATOR_CHIP_CLASS,
    role === 'editor' ? DATA_LIBRARY_EDITOR_CHIP_CLASS : DATA_LIBRARY_VIEWER_CHIP_CLASS,
  )
}

function nextSortDirection(
  activeSortBy: LibraryAssetSortBy,
  activeSortDirection: LibraryAssetSortDirection,
  nextSortBy: LibraryAssetSortBy,
): LibraryAssetSortDirection {
  if (activeSortBy === nextSortBy) {
    return activeSortDirection === 'desc' ? 'asc' : 'desc'
  }
  return nextSortBy === 'uploaded_at' || nextSortBy === 'byte_size' ? 'desc' : 'asc'
}

function libraryAssetAccessMembers(asset: LibraryAssetRecord): Array<{ user_id: string; name: string; role: LibraryAssetAccessRole }> {
  if (Array.isArray(asset.shared_with) && asset.shared_with.length > 0) {
    return asset.shared_with.map((item) => ({
      user_id: String(item.user_id || '').trim(),
      name: normalizeName(String(item.name || '')) || 'Unknown user',
      role: item.role === 'editor' ? 'editor' : 'viewer',
    }))
  }
  if (Array.isArray(asset.shared_with_user_ids) && asset.shared_with_user_ids.length > 0) {
    return asset.shared_with_user_ids.map((userId) => ({
      user_id: String(userId || '').trim(),
      name: String(userId || '').trim() || 'Unknown user',
      role: 'viewer',
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

function canViewDataLibraryDrilldownTab(
  asset: LibraryAssetRecord | null,
  tab: DataLibraryDrilldownTab,
): boolean {
  if (!asset) {
    return true
  }
  if (tab === 'access') {
    return Boolean(asset.can_manage_access)
  }
  return true
}

function dataLibraryDrilldownTabRestrictionMessage(tab: DataLibraryDrilldownTab): string | null {
  if (tab === 'access') {
    return 'Only file owners can edit file access.'
  }
  return null
}

function dataLibraryDrilldownTabLabel(
  tab: DataLibraryDrilldownTab,
  asset: LibraryAssetRecord | null,
): string {
  if (tab === 'logs' && asset && !asset.can_manage_access) {
    return 'History'
  }
  switch (tab) {
    case 'overview':
      return 'Overview'
    case 'access':
      return 'Access'
    case 'actions':
      return 'Actions'
    case 'logs':
    default:
      return 'Logs'
  }
}

export function WorkspacesDataLibraryView({
  showPageHeader = true,
}: WorkspacesDataLibraryViewProps = {}) {
  const [assets, setAssets] = useState<LibraryAssetRecord[]>([])
  const [ownershipFilter, setOwnershipFilter] = useState<LibraryAssetOwnership>('all')
  const [archiveScope, setArchiveScope] = useState<LibraryAssetScope>('all')
  const [sortBy, setSortBy] = useState<LibraryAssetSortBy>('uploaded_at')
  const [sortDirection, setSortDirection] = useState<LibraryAssetSortDirection>('desc')
  const [tableDensity, setTableDensity] = useState<DataLibraryTableDensity>('default')
  const [visibleColumns, setVisibleColumns] = useState<Record<DataLibraryTableColumnKey, boolean>>({
    filename: true,
    access: true,
    uploaded: true,
    format: true,
    size: true,
    actions: true,
  })
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(25)
  const [total, setTotal] = useState(0)
  const [hasMore, setHasMore] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState('')
  const [status, setStatus] = useState('')
  const [busyAssetId, setBusyAssetId] = useState<string | null>(null)
  const [renamingAssetId, setRenamingAssetId] = useState<string | null>(null)
  const [renameDraft, setRenameDraft] = useState('')
  const [refreshTick, setRefreshTick] = useState(0)
  const [selectedAssetId, setSelectedAssetId] = useState<string | null>(null)
  const [drilldownTab, setDrilldownTab] = useState<DataLibraryDrilldownTab>('overview')
  const [accessActivityCollapsed, setAccessActivityCollapsed] = useState(true)
  const [assetActivityCollapsed, setAssetActivityCollapsed] = useState(true)
  const [accessActivityActorExpanded, setAccessActivityActorExpanded] = useState<Record<string, boolean>>({})
  const [assetActivityGroupExpanded, setAssetActivityGroupExpanded] = useState<Record<string, boolean>>({})
  const [accessComposerOpen, setAccessComposerOpen] = useState(false)
  const [accessComposerRole, setAccessComposerRole] = useState<LibraryAssetAccessRole>('viewer')
  const [accessEditingUserId, setAccessEditingUserId] = useState<string | null>(null)
  const [accessEditingRole, setAccessEditingRole] = useState<LibraryAssetAccessRole>('viewer')
  const [accessRemovalConfirmUserId, setAccessRemovalConfirmUserId] = useState<string | null>(null)

  const [collaboratorQueryByAssetId, setCollaboratorQueryByAssetId] = useState<Record<string, string>>({})
  const [collaboratorLookupByAssetId, setCollaboratorLookupByAssetId] = useState<Record<string, CollaboratorPayload[]>>({})
  const [selectedCollaboratorByAssetId, setSelectedCollaboratorByAssetId] = useState<Record<string, CollaboratorPayload | null>>({})
  const [lookupErrorByAssetId, setLookupErrorByAssetId] = useState<Record<string, string>>({})
  const [lookupBusyAssetId, setLookupBusyAssetId] = useState<string | null>(null)
  const [menuState, setMenuState] = useState<DataLibraryMenuState | null>(null)
  const [memberMenuState, setMemberMenuState] = useState<DataLibraryMemberMenuState | null>(null)
  const suppressAssetRowClickRef = useRef<string | null>(null)

  const hasSessionToken = Boolean(getAuthSessionToken())

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
          ownership: ownershipFilter,
          scope: archiveScope,
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
  }, [archiveScope, hasSessionToken, ownershipFilter, page, pageSize, refreshTick, sortBy, sortDirection])

  useEffect(() => {
    if (renamingAssetId && !assets.some((asset) => asset.id === renamingAssetId)) {
      setRenamingAssetId(null)
      setRenameDraft('')
    }
    if (selectedAssetId && !assets.some((asset) => asset.id === selectedAssetId)) {
      setSelectedAssetId(null)
    }
    if (menuState && !assets.some((asset) => asset.id === menuState.assetId)) {
      setMenuState(null)
    }
  }, [assets, menuState, renamingAssetId, selectedAssetId])

  useEffect(() => {
    setAccessActivityCollapsed(true)
    setAssetActivityCollapsed(true)
    setAccessActivityActorExpanded({})
    setAssetActivityGroupExpanded({})
    setAccessComposerOpen(false)
    setAccessComposerRole('viewer')
    setAccessEditingUserId(null)
    setAccessEditingRole('viewer')
    setAccessRemovalConfirmUserId(null)
    setMemberMenuState(null)
  }, [selectedAssetId])

  const updateAssetInState = useCallback((nextAsset: LibraryAssetRecord) => {
    setAssets((current) => current.map((item) => (item.id === nextAsset.id ? nextAsset : item)))
  }, [])

  const visibleTableColumns = useMemo(
    () => DATA_LIBRARY_TABLE_COLUMN_ORDER.filter((columnKey) => visibleColumns[columnKey]),
    [visibleColumns],
  )

  const onRefresh = useCallback(() => {
    setRefreshTick((current) => current + 1)
  }, [])

  useEffect(() => {
    if (!hasSessionToken) {
      return
    }

    const handleFocus = () => onRefresh()
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        onRefresh()
      }
    }

    window.addEventListener('focus', handleFocus)
    document.addEventListener('visibilitychange', handleVisibilityChange)

    return () => {
      window.removeEventListener('focus', handleFocus)
      document.removeEventListener('visibilitychange', handleVisibilityChange)
    }
  }, [hasSessionToken, onRefresh])

  const resetAccessComposerForAsset = useCallback((assetId: string) => {
    setAccessComposerOpen(false)
    setAccessComposerRole('viewer')
    setCollaboratorLookupByAssetId((current) => ({ ...current, [assetId]: [] }))
    setSelectedCollaboratorByAssetId((current) => ({ ...current, [assetId]: null }))
    setCollaboratorQueryByAssetId((current) => ({ ...current, [assetId]: '' }))
    setLookupErrorByAssetId((current) => ({ ...current, [assetId]: '' }))
    setLookupBusyAssetId((current) => (current === assetId ? null : current))
  }, [])

  const onCancelRenameAsset = useCallback(() => {
    setRenamingAssetId(null)
    setRenameDraft('')
  }, [])

  const onStartRenameAsset = useCallback((asset: LibraryAssetRecord) => {
    if (!asset.can_edit_metadata) {
      setError('Only the file owner can rename files.')
      return
    }
    setError('')
    setStatus('')
    setRenamingAssetId(asset.id)
    setRenameDraft(asset.filename)
  }, [])

  const onSaveRenameAsset = useCallback(
    async (asset: LibraryAssetRecord) => {
      const nextFilename = String(renameDraft || '').trim()
      if (!asset.can_edit_metadata) {
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
      setError(assetDownloadUnavailableMessage(asset))
      return
    }
    if (!asset.can_download) {
      setError(assetDownloadUnavailableMessage(asset))
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

  const onToggleAssetLock = useCallback(
    async (asset: LibraryAssetRecord) => {
      const token = getAuthSessionToken()
      if (!token) {
        setError('Sign in to manage permissions.')
        return
      }
      if (!asset.can_edit_metadata) {
        setError('Only the file owner can manage lock state.')
        return
      }

      setError('')
      setStatus('')
      setBusyAssetId(asset.id)
      try {
        const updated = await updateLibraryAssetMetadata({
          token,
          assetId: asset.id,
          lockedForTeamMembers: !isAssetLockedForTeamMembers(asset),
        })
        updateAssetInState(updated)
        setStatus(updated.locked_for_team_members ? 'Locked for team members.' : 'Unlocked for team members.')
      } catch (updateError) {
        setError(updateError instanceof Error ? updateError.message : 'Could not update file lock state.')
      } finally {
        setBusyAssetId((current) => (current === asset.id ? null : current))
      }
    },
    [updateAssetInState],
  )

  const onToggleAssetArchive = useCallback(
    async (asset: LibraryAssetRecord) => {
      const token = getAuthSessionToken()
      if (!token) {
        setError('Sign in to manage your library view.')
        return
      }

      setError('')
      setStatus('')
      setBusyAssetId(asset.id)
      try {
        const updated = await updateLibraryAssetMetadata({
          token,
          assetId: asset.id,
          archivedForCurrentUser: !isAssetArchivedForCurrentUser(asset),
        })
        updateAssetInState(updated)
        setStatus(updated.archived_for_current_user ? 'Archived for you.' : 'Returned to active files.')
        onRefresh()
      } catch (updateError) {
        setError(updateError instanceof Error ? updateError.message : 'Could not update archive state.')
      } finally {
        setBusyAssetId((current) => (current === asset.id ? null : current))
      }
    },
    [onRefresh, updateAssetInState],
  )
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
        const existingAccessUserIds = new Set(
          libraryAssetAccessMembers(asset)
            .map((member) => normalizeUserId(member.user_id))
            .filter(Boolean),
        )
        const existingAccessNames = new Set(
          libraryAssetAccessMembers(asset).map((member) => normalizeName(member.name).toLowerCase()),
        )
        const ownerName = normalizeName(asset.owner_name || '').toLowerCase()
        const ownerUserId = normalizeUserId(asset.owner_user_id)
        const seenKeys = new Set<string>()
        const filtered = (payload.items || []).filter((candidate) => {
          const candidateName = normalizeName(candidate.full_name)
          if (!candidateName) {
            return false
          }
          const candidateUserId = resolveCollaboratorUserId(candidate)
          const nameKey = candidateName.toLowerCase()
          const seenKey = candidateUserId || nameKey
          if (seenKeys.has(seenKey)) {
            return false
          }
          seenKeys.add(seenKey)
          if ((candidateUserId && ownerUserId && candidateUserId === ownerUserId) || (!candidateUserId && nameKey === ownerName)) {
            return false
          }
          if ((candidateUserId && existingAccessUserIds.has(candidateUserId)) || (!candidateUserId && existingAccessNames.has(nameKey))) {
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

  const buildAccessCollaboratorsPayload = useCallback(
    (
      members: Array<{ user_id: string; name: string; role: LibraryAssetAccessRole }>,
    ) =>
      members.map((member) => ({
        user_id: member.user_id,
        name: normalizeName(member.name) || null,
        role: member.role,
      })),
    [],
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
      const selectedUserId = resolveCollaboratorUserId(selected)
      if (!selectedName) {
        setError('Selected collaborator is missing a name.')
        return
      }
      if (!selectedUserId) {
        setError('Selected collaborator is missing a valid account identity.')
        return
      }

      const existingAccessUserIds = new Set(
        libraryAssetAccessMembers(asset)
          .map((member) => normalizeUserId(member.user_id))
          .filter(Boolean),
      )
      const existingAccessNames = new Set(
        libraryAssetAccessMembers(asset).map((member) => normalizeName(member.name).toLowerCase()),
      )
      if (existingAccessUserIds.has(selectedUserId) || existingAccessNames.has(selectedName.toLowerCase())) {
        setError(`${selectedName} already has access.`)
        return
      }
      const nextMembers = [
        ...libraryAssetAccessMembers(asset),
        {
          user_id: selectedUserId,
          name: selectedName,
          role: accessComposerRole,
        },
      ]

      setError('')
      setStatus('')
      setBusyAssetId(asset.id)
      try {
        const updated = await updateLibraryAssetAccess({
          token,
          assetId: asset.id,
          collaborators: buildAccessCollaboratorsPayload(nextMembers),
        })
        updateAssetInState(updated)
        resetAccessComposerForAsset(asset.id)
        setStatus(`${humanizeLibraryAssetAccessRole(accessComposerRole)} access granted to ${selectedName}.`)
      } catch (updateError) {
        setError(updateError instanceof Error ? updateError.message : 'Could not update permissions.')
      } finally {
        setBusyAssetId((current) => (current === asset.id ? null : current))
      }
    },
    [accessComposerRole, buildAccessCollaboratorsPayload, resetAccessComposerForAsset, selectedCollaboratorByAssetId, updateAssetInState],
  )

  const onStartEditAccessRole = useCallback((member: { user_id: string; role: LibraryAssetAccessRole }) => {
    const cleanUserId = String(member.user_id || '').trim()
    if (!cleanUserId) {
      return
    }
    setAccessComposerOpen(false)
    setAccessRemovalConfirmUserId(null)
    setAccessEditingUserId(cleanUserId)
    setAccessEditingRole(member.role)
    setError('')
    setStatus('')
  }, [])

  const onCancelAccessRoleEdit = useCallback(() => {
    setAccessEditingUserId(null)
    setAccessEditingRole('viewer')
  }, [])

  const onSaveAccessRole = useCallback(
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
        setError('This collaborator cannot be edited from here.')
        return
      }

      const currentMembers = libraryAssetAccessMembers(asset)
      const currentMember = currentMembers.find((member) => member.user_id === cleanCollaboratorUserId)
      if (!currentMember) {
        setError('This collaborator no longer has access.')
        return
      }
      if (currentMember.role === accessEditingRole) {
        onCancelAccessRoleEdit()
        return
      }

      const nextMembers = currentMembers.map((member) =>
        member.user_id === cleanCollaboratorUserId ? { ...member, role: accessEditingRole } : member,
      )

      setError('')
      setStatus('')
      setBusyAssetId(asset.id)
      try {
        const updated = await updateLibraryAssetAccess({
          token,
          assetId: asset.id,
          collaborators: buildAccessCollaboratorsPayload(nextMembers),
        })
        updateAssetInState(updated)
        setAccessEditingUserId(null)
        setAccessEditingRole('viewer')
        setStatus(`${currentMember.name} is now ${humanizeLibraryAssetAccessRole(accessEditingRole)}.`)
      } catch (updateError) {
        setError(updateError instanceof Error ? updateError.message : 'Could not update permissions.')
      } finally {
        setBusyAssetId((current) => (current === asset.id ? null : current))
      }
    },
    [accessEditingRole, buildAccessCollaboratorsPayload, onCancelAccessRoleEdit, updateAssetInState],
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
        const nextMembers = libraryAssetAccessMembers(asset).filter(
          (member) => String(member.user_id || '').trim() !== cleanCollaboratorUserId,
        )
        const updated = await updateLibraryAssetAccess({
          token,
          assetId: asset.id,
          collaborators: buildAccessCollaboratorsPayload(nextMembers),
        })
        updateAssetInState(updated)
        setAccessRemovalConfirmUserId(null)
        setAccessEditingUserId(null)
        setAccessEditingRole('viewer')
        setStatus('Access updated.')
      } catch (updateError) {
        setError(updateError instanceof Error ? updateError.message : 'Could not update permissions.')
      } finally {
        setBusyAssetId((current) => (current === asset.id ? null : current))
      }
    },
    [buildAccessCollaboratorsPayload, updateAssetInState],
  )

  const selectedAsset = useMemo(
    () => assets.find((asset) => asset.id === selectedAssetId) || null,
    [assets, selectedAssetId],
  )
  const onOpenAssetDrilldown = useCallback((assetId: string, nextTab: 'overview' | 'access' | 'actions' = 'overview') => {
    setSelectedAssetId(assetId)
    setDrilldownTab(nextTab)
  }, [])

  const onAssetRowClick = useCallback((assetId: string) => {
    if (suppressAssetRowClickRef.current === assetId) {
      suppressAssetRowClickRef.current = null
      return
    }
    onOpenAssetDrilldown(assetId)
  }, [onOpenAssetDrilldown])

  const onCloseAssetDrilldown = useCallback(() => {
    setSelectedAssetId(null)
    setMenuState(null)
    setRenamingAssetId(null)
    setRenameDraft('')
    setAccessComposerOpen(false)
    setAccessComposerRole('viewer')
    setAccessEditingUserId(null)
    setAccessEditingRole('viewer')
    setAccessRemovalConfirmUserId(null)
  }, [])

  const selectedAssetAccessMembers = selectedAsset ? libraryAssetAccessMembers(selectedAsset) : []
  const selectedAssetOwnerName = selectedAsset
    ? normalizeName(selectedAsset.owner_name || '') || 'Unknown'
    : 'Unknown'
  const selectedAssetSearchQuery = selectedAsset ? collaboratorQueryByAssetId[selectedAsset.id] || '' : ''
  const selectedAssetMatches = selectedAsset ? collaboratorLookupByAssetId[selectedAsset.id] || [] : []
  const selectedAssetLookupError = selectedAsset ? lookupErrorByAssetId[selectedAsset.id] || '' : ''
  const selectedAssetLookupBusy = selectedAsset ? lookupBusyAssetId === selectedAsset.id : false
  const selectedAssetCandidate = selectedAsset
    ? selectedCandidateByAssetIdValue(selectedCollaboratorByAssetId, selectedAsset.id)
    : null
  const selectedAssetBusy = selectedAsset ? busyAssetId === selectedAsset.id : false
  const canManageSelectedAssetAccess = Boolean(selectedAsset?.can_manage_access)
  const canDownloadSelectedAsset = Boolean(selectedAsset?.can_download)
  const canToggleSelectedAssetLock = Boolean(selectedAsset?.can_edit_metadata)
  const selectedAssetLockMessage = selectedAsset ? assetReadOnlyMessage(selectedAsset) : null
  const accessInlineStateActive = accessComposerOpen || Boolean(accessEditingUserId) || Boolean(accessRemovalConfirmUserId)
  const menuAsset = menuState ? assets.find((asset) => asset.id === menuState.assetId) || null : null
  const selectedAssetAuditEntries = useMemo(
    () => (Array.isArray(selectedAsset?.audit_log_entries) ? selectedAsset.audit_log_entries : []),
    [selectedAsset],
  )
  const showPersonalAssetLogs = Boolean(selectedAsset && !selectedAsset.can_manage_access)
  const accessActivityEntries = useMemo(
    () => selectedAssetAuditEntries.filter((entry) => entry.category === 'access'),
    [selectedAssetAuditEntries],
  )
  const assetActivityEntries = useMemo(
    () => selectedAssetAuditEntries.filter((entry) => entry.category === 'asset'),
    [selectedAssetAuditEntries],
  )
  const accessActivityGroups = useMemo(() => {
    if (showPersonalAssetLogs) {
      return [
        {
          key: 'you',
          title: 'You',
          entries: accessActivityEntries,
        },
      ]
    }

    const groupMap = new Map<string, { key: string; title: string; entries: LibraryAssetAuditEntry[] }>()
    selectedAssetAccessMembers.forEach((member) => {
      const title = normalizeName(member.name) || 'Unknown user'
      const key = title.toLowerCase()
      groupMap.set(key, { key, title, entries: [] })
    })
    accessActivityEntries.forEach((entry) => {
      const title = normalizeName(entry.subject_name || entry.subject_user_id || '') || 'Unknown user'
      const key = title.toLowerCase()
      const existing = groupMap.get(key)
      if (existing) {
        existing.entries.push(entry)
        return
      }
      groupMap.set(key, { key, title, entries: [entry] })
    })
    return Array.from(groupMap.values()).sort((left, right) => left.title.localeCompare(right.title))
  }, [accessActivityEntries, selectedAssetAccessMembers, showPersonalAssetLogs])
  const assetActivityGroups = useMemo(
    () => [
      {
        key: 'uploads',
        title: 'File uploads',
        entries: assetActivityEntries.filter((entry) => entry.event_type === 'asset_uploaded'),
      },
      {
        key: 'name-changes',
        title: 'Name changes',
        entries: assetActivityEntries.filter((entry) => entry.event_type === 'asset_renamed'),
      },
      {
        key: 'downloads',
        title: 'Downloads',
        entries: assetActivityEntries.filter((entry) => entry.event_type === 'asset_downloaded'),
      },
      {
        key: 'other',
        title: 'Other asset activity',
        entries: assetActivityEntries.filter((entry) => (
          entry.event_type !== 'asset_uploaded'
          && entry.event_type !== 'asset_renamed'
          && entry.event_type !== 'asset_downloaded'
        )),
      },
    ].filter((group) => group.entries.length > 0),
    [assetActivityEntries],
  )

  const onToggleAccessActivitySection = useCallback(() => {
    if (accessActivityCollapsed) {
      setAccessActivityCollapsed(false)
      setAssetActivityCollapsed(true)
      return
    }
    setAccessActivityCollapsed(true)
  }, [accessActivityCollapsed])

  useEffect(() => {
    if (!selectedAsset) {
      return
    }
    if (!canViewDataLibraryDrilldownTab(selectedAsset, drilldownTab)) {
      setDrilldownTab('overview')
    }
  }, [drilldownTab, selectedAsset])

  const onToggleAssetActivitySection = useCallback(() => {
    if (assetActivityCollapsed) {
      setAssetActivityCollapsed(false)
      setAccessActivityCollapsed(true)
      return
    }
    setAssetActivityCollapsed(true)
  }, [assetActivityCollapsed])

  const onSort = useCallback((nextSortBy: LibraryAssetSortBy) => {
    const nextDirection = nextSortDirection(sortBy, sortDirection, nextSortBy)
    setSortBy(nextSortBy)
    setSortDirection(nextDirection)
    setPage(1)
  }, [sortBy, sortDirection])

  const onToggleColumnVisibility = useCallback((columnKey: DataLibraryTableColumnKey) => {
    if (!DATA_LIBRARY_TABLE_COLUMN_DEFINITIONS[columnKey].hideable) {
      return
    }
    setVisibleColumns((current) => {
      const visibleHideableCount = DATA_LIBRARY_TABLE_COLUMN_ORDER.filter(
        (candidate) => DATA_LIBRARY_TABLE_COLUMN_DEFINITIONS[candidate].hideable && current[candidate],
      ).length
      if (current[columnKey] && visibleHideableCount <= 1) {
        return current
      }
      return {
        ...current,
        [columnKey]: !current[columnKey],
      }
    })
  }, [])

  const openAssetMenuAtPosition = useCallback((assetId: string, x: number, y: number) => {
    const menuWidth = 212
    const menuHeight = 196
    setMenuState({
      assetId,
      x: Math.max(8, Math.min(x, window.innerWidth - menuWidth - 8)),
      y: Math.max(8, Math.min(y, window.innerHeight - menuHeight - 8)),
    })
  }, [])

  const onOpenAssetContextMenu = useCallback((assetId: string, event: ReactMouseEvent<HTMLElement>) => {
    event.preventDefault()
    event.stopPropagation()
    suppressAssetRowClickRef.current = assetId
    openAssetMenuAtPosition(assetId, event.clientX, event.clientY)
  }, [openAssetMenuAtPosition])

  const onToggleAssetMenu = useCallback((assetId: string, event: ReactMouseEvent<HTMLButtonElement>) => {
    event.preventDefault()
    event.stopPropagation()
    if (menuState?.assetId === assetId) {
      setMenuState(null)
      return
    }
    const rect = event.currentTarget.getBoundingClientRect()
    const menuWidth = 212
    const menuHeight = 196
    const gap = 6
    const x = rect.right - menuWidth
    const openUp = window.innerHeight - rect.bottom < menuHeight + gap
    const y = openUp ? rect.top - menuHeight - gap : rect.bottom + gap
    openAssetMenuAtPosition(assetId, x, y)
  }, [menuState?.assetId, openAssetMenuAtPosition])

  const onOpenAssetAccessFromCell = useCallback((asset: LibraryAssetRecord, event: ReactMouseEvent<HTMLElement>) => {
    event.stopPropagation()
    onOpenAssetDrilldown(asset.id, asset.can_manage_access ? 'access' : 'logs')
  }, [onOpenAssetDrilldown])

  const onStartRenameAssetFromMenu = useCallback((asset: LibraryAssetRecord) => {
    setMenuState(null)
    onOpenAssetDrilldown(asset.id, 'overview')
    onStartRenameAsset(asset)
  }, [onOpenAssetDrilldown, onStartRenameAsset])

  const onDownloadAssetFromMenu = useCallback((asset: LibraryAssetRecord) => {
    setMenuState(null)
    void onDownloadAsset(asset)
  }, [onDownloadAsset])

  const openMemberMenuAtPosition = useCallback((assetId: string, userId: string, x: number, y: number) => {
    const menuWidth = 184
    const menuHeight = 112
    setMemberMenuState({
      assetId,
      userId,
      x: Math.max(8, Math.min(x, window.innerWidth - menuWidth - 8)),
      y: Math.max(8, Math.min(y, window.innerHeight - menuHeight - 8)),
    })
  }, [])

  const onOpenMemberMenu = useCallback((assetId: string, userId: string, event: ReactMouseEvent<HTMLElement>) => {
    event.preventDefault()
    event.stopPropagation()
    if (!assetId || !userId) {
      return
    }
    const rect = event.currentTarget.getBoundingClientRect()
    const x = rect.right - 184
    const y = rect.bottom + 6
    openMemberMenuAtPosition(assetId, userId, x, y)
  }, [openMemberMenuAtPosition])

  const memberMenuAsset = useMemo(
    () => assets.find((asset) => asset.id === memberMenuState?.assetId) || null,
    [assets, memberMenuState?.assetId],
  )

  const activeMember = useMemo(
    () => (memberMenuAsset ? libraryAssetAccessMembers(memberMenuAsset).find((member) => member.user_id === memberMenuState?.userId) || null : null),
    [memberMenuAsset, memberMenuState?.userId],
  )

  const overviewContent = selectedAsset ? (
    <>
      {selectedAssetLockMessage ? (
        <div className={cn(houseSurfaces.sectionPanel, 'house-drilldown-panel-no-pad')}>
          <div className="house-drilldown-content-block">
            <div className="rounded-md border border-[hsl(var(--tone-neutral-300))] bg-[hsl(var(--tone-neutral-50))] px-3 py-2 text-sm text-[hsl(var(--tone-neutral-800))]">
              {selectedAssetLockMessage}
            </div>
          </div>
        </div>
      ) : null}
      <div className={cn(houseSurfaces.sectionPanel, 'house-drilldown-panel-no-pad')}>
        <div className="house-drilldown-heading-block">
          <p className="house-drilldown-heading-block-title">Asset overview</p>
        </div>
        <div
          className="house-drilldown-content-block house-drilldown-summary-stats-grid"
          style={{ gridTemplateColumns: 'repeat(2, minmax(0, 1fr))' }}
        >
          <div className="rounded-md border border-border/60 bg-background/80 p-3">
            <p className={HOUSE_FIELD_HELPER_CLASS}>Owner</p>
            <p className={cn(houseTypography.text, 'mt-1 font-medium')}>{selectedAssetOwnerName}</p>
          </div>
          <div className="rounded-md border border-border/60 bg-background/80 p-3">
            <p className={HOUSE_FIELD_HELPER_CLASS}>File type</p>
            <p className={cn(houseTypography.text, 'mt-1 font-medium')}>{selectedAsset.kind.toUpperCase()}</p>
          </div>
          <div className="rounded-md border border-border/60 bg-background/80 p-3">
            <p className={HOUSE_FIELD_HELPER_CLASS}>Uploaded</p>
            <p className={cn(houseTypography.text, 'mt-1 font-medium')}>{formatTimestamp(selectedAsset.uploaded_at)}</p>
          </div>
          <div className="rounded-md border border-border/60 bg-background/80 p-3">
            <p className={HOUSE_FIELD_HELPER_CLASS}>Size</p>
            <p className={cn(houseTypography.text, 'mt-1 font-medium')}>{formatBytes(selectedAsset.byte_size)}</p>
          </div>
          <div className="rounded-md border border-border/60 bg-background/80 p-3">
            <p className={HOUSE_FIELD_HELPER_CLASS}>Access</p>
            <p className={cn(houseTypography.text, 'mt-1 font-medium')}>
              {selectedAssetAccessMembers.length === 0 ? 'Owner only' : `${selectedAssetAccessMembers.length} team member${selectedAssetAccessMembers.length === 1 ? '' : 's'}`}
            </p>
          </div>
          <div className="rounded-md border border-border/60 bg-background/80 p-3">
            <p className={HOUSE_FIELD_HELPER_CLASS}>Lock</p>
            <p className={cn(houseTypography.text, 'mt-1 font-medium')}>{assetLockStateLabel(selectedAsset)}</p>
          </div>
          <div className="rounded-md border border-border/60 bg-background/80 p-3">
            <p className={HOUSE_FIELD_HELPER_CLASS}>Archived for me</p>
            <p className={cn(houseTypography.text, 'mt-1 font-medium')}>{assetArchiveStateLabel(selectedAsset)}</p>
          </div>
          <div className="rounded-md border border-border/60 bg-background/80 p-3">
            <p className={HOUSE_FIELD_HELPER_CLASS}>Availability</p>
            <p className={cn(houseTypography.text, 'mt-1 font-medium')}>
              {isAssetAvailable(selectedAsset) ? 'Available' : 'Storage missing'}
            </p>
          </div>
        </div>
      </div>
      {selectedAsset.can_edit_metadata ? (
        <div className={cn(houseSurfaces.sectionPanel, 'house-drilldown-panel-no-pad')}>
          <div className="house-drilldown-heading-block">
            <p className="house-drilldown-heading-block-title">File details</p>
          </div>
          <div className="house-drilldown-content-block space-y-2">
            <p className={HOUSE_FIELD_HELPER_CLASS}>File name</p>
            {renamingAssetId === selectedAsset.id ? (
              <div className="flex items-center gap-1.5">
                <Input
                  value={renameDraft}
                  onChange={(event) => setRenameDraft(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter') {
                      event.preventDefault()
                      void onSaveRenameAsset(selectedAsset)
                    } else if (event.key === 'Escape') {
                      event.preventDefault()
                      onCancelRenameAsset()
                    }
                  }}
                  className={cn('h-9 w-full', HOUSE_INPUT_CLASS)}
                  disabled={selectedAssetBusy}
                  autoFocus
                />
                <button
                  type="button"
                  className={cn(HOUSE_COLLABORATOR_ACTION_ICON_CLASS, 'house-collaborator-action-icon-save')}
                  onClick={() => void onSaveRenameAsset(selectedAsset)}
                  disabled={selectedAssetBusy || !String(renameDraft || '').trim() || String(renameDraft || '').trim() === selectedAsset.filename.trim()}
                  aria-label={`Save rename for ${selectedAsset.filename}`}
                >
                  <Save className="h-4 w-4" />
                </button>
                <button
                  type="button"
                  className={cn(HOUSE_COLLABORATOR_ACTION_ICON_CLASS, 'house-collaborator-action-icon-discard')}
                  onClick={onCancelRenameAsset}
                  disabled={selectedAssetBusy}
                  aria-label="Cancel rename"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            ) : (
              <div className="flex items-center justify-between gap-2 rounded-md border border-border/60 bg-background/80 p-3">
                <p className={cn(houseTypography.text, 'font-medium')}>{selectedAsset.filename}</p>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => onStartRenameAsset(selectedAsset)}
                  disabled={selectedAssetBusy}
                >
                  Rename
                </Button>
              </div>
            )}
          </div>
        </div>
      ) : null}
    </>
  ) : null

  const accessContent = selectedAsset ? (
    <div className={cn(houseSurfaces.sectionPanel, 'house-drilldown-panel-no-pad')}>
      <div className="house-drilldown-heading-block">
        <p className="house-drilldown-heading-block-title">File access</p>
      </div>
      {!canManageSelectedAssetAccess ? (
        <div className="house-drilldown-content-block">
          <p className={HOUSE_FIELD_HELPER_CLASS}>Only the file owner can edit file access.</p>
        </div>
      ) : (
        <div className="house-drilldown-content-block space-y-2">
          <div className="w-full house-table-context-profile">
            <Table
              className="w-full table-fixed house-table-resizable"
              data-house-no-column-resize="true"
              data-house-no-column-controls="true"
            >
              <colgroup>
                <col style={{ width: '54%' }} />
                <col style={{ width: '18%' }} />
                <col style={{ width: '28%' }} />
              </colgroup>
              <TableHeader className="house-table-head text-left">
                <TableRow style={{ backgroundColor: 'transparent' }}>
                  <TableHead className="house-table-head-text text-left">Team member</TableHead>
                  <TableHead className="house-table-head-text text-left">Role</TableHead>
                  <TableHead className="house-table-head-text text-center">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                <TableRow className="h-14">
                  <TableCell className={cn('h-14 px-3 py-0 align-middle font-medium', HOUSE_TABLE_CELL_TEXT_CLASS)}>
                    <div className="flex h-14 items-center">
                      <span className={cn(HOUSE_COLLABORATOR_CHIP_CLASS, DATA_LIBRARY_OWNER_BADGE_CLASS)}>
                        {selectedAssetOwnerName} (Owner)
                      </span>
                    </div>
                  </TableCell>
                  <TableCell className={cn('h-14 px-3 py-0 align-middle text-muted-foreground', HOUSE_TABLE_CELL_TEXT_CLASS)}>
                    <div className="flex h-14 items-center">Owner</div>
                  </TableCell>
                  <TableCell className={cn('h-14 px-3 py-0 align-middle', HOUSE_TABLE_CELL_TEXT_CLASS)}>
                    <div className="flex h-14 items-center justify-end" />
                  </TableCell>
                </TableRow>
                {selectedAssetAccessMembers.map((member) => {
                  const cleanUserId = String(member.user_id || '').trim()
                  const isEditingRole = accessEditingUserId === cleanUserId && Boolean(cleanUserId)
                  const isRemovalAwaitingConfirm = accessRemovalConfirmUserId === cleanUserId && Boolean(cleanUserId)
                  const hideMemberActions = accessInlineStateActive && !isEditingRole && !isRemovalAwaitingConfirm
                  const roleChanged = accessEditingRole !== member.role
                  return (
                    <TableRow
                      key={`${selectedAsset.id}-${member.user_id || member.name}`}
                      className="group h-14"
                      onContextMenu={cleanUserId ? (event) => onOpenMemberMenu(selectedAsset.id, cleanUserId, event) : undefined}
                    >
                      <TableCell className={cn('h-14 px-3 py-0 align-middle font-medium', HOUSE_TABLE_CELL_TEXT_CLASS)}>
                        <div className="flex h-14 items-center">
                          <button
                            type="button"
                            onClick={cleanUserId ? (event) => onOpenMemberMenu(selectedAsset.id, cleanUserId, event) : undefined}
                            disabled={!cleanUserId || selectedAssetBusy}
                            className={cn(
                              'inline-flex rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
                              cleanUserId && !selectedAssetBusy && 'group/member-badge',
                            )}
                            aria-label={cleanUserId ? `Open access actions for ${member.name}` : undefined}
                          >
                            <Badge
                              size="sm"
                              variant="outline"
                              className={cn(
                                libraryAssetAccessChipClassName(member.role),
                                cleanUserId &&
                                  !selectedAssetBusy &&
                                  'transition-[transform,box-shadow] duration-[var(--motion-duration-ui)] ease-out hover:-translate-y-px hover:shadow-[0_2px_8px_hsl(var(--foreground)/0.08)]',
                              )}
                            >
                              <span>{member.name}</span>
                              {cleanUserId ? (
                                <ChevronDown
                                  className="ml-1 h-3 w-3 opacity-45 transition-[opacity,transform] duration-[var(--motion-duration-ui)] ease-out group-hover/member-badge:translate-y-px group-hover/member-badge:opacity-80"
                                />
                              ) : null}
                            </Badge>
                          </button>
                        </div>
                      </TableCell>
                      <TableCell className={cn('h-14 px-3 py-0 align-middle text-muted-foreground', HOUSE_TABLE_CELL_TEXT_CLASS)}>
                        <div className="flex h-14 items-center">
                          {isEditingRole ? (
                            <SelectPrimitive
                              value={accessEditingRole}
                              onValueChange={(value) => setAccessEditingRole(value === 'editor' ? 'editor' : 'viewer')}
                              disabled={selectedAssetBusy}
                            >
                              <SelectTrigger className="h-9 w-[10rem] text-sm">
                                <SelectValue aria-label={humanizeLibraryAssetAccessRole(accessEditingRole)}>
                                  {humanizeLibraryAssetAccessRole(accessEditingRole)}
                                </SelectValue>
                              </SelectTrigger>
                              <SelectContent>
                                {DATA_LIBRARY_ACCESS_ROLE_OPTIONS.map((option) => (
                                  <SelectItem key={option.value} value={option.value}>
                                    {option.label}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </SelectPrimitive>
                          ) : (
                            <span className={HOUSE_FIELD_HELPER_CLASS}>{humanizeLibraryAssetAccessRole(member.role)}</span>
                          )}
                        </div>
                      </TableCell>
                      <TableCell className={cn('h-14 px-3 py-0 align-middle', HOUSE_TABLE_CELL_TEXT_CLASS)}>
                        <div className="flex h-14 items-center justify-end">
                          {hideMemberActions || !cleanUserId ? null : isRemovalAwaitingConfirm ? (
                            <div className="flex items-center justify-end gap-1.5">
                              <Button
                                type="button"
                                variant="cta"
                                className="h-8 px-3"
                                onClick={() => void onRemoveAccess(selectedAsset, cleanUserId)}
                                disabled={selectedAssetBusy}
                              >
                                Confirm
                              </Button>
                              <button
                                type="button"
                                className={cn(HOUSE_COLLABORATOR_ACTION_ICON_CLASS, 'house-collaborator-action-icon-discard')}
                                onClick={() => setAccessRemovalConfirmUserId(null)}
                                disabled={selectedAssetBusy}
                                aria-label={`Cancel remove access for ${member.name}`}
                              >
                                <X className="h-4 w-4" />
                              </button>
                            </div>
                          ) : isEditingRole ? (
                            <div className="flex items-center justify-end gap-1.5">
                              {roleChanged ? (
                                <button
                                  type="button"
                                  className={cn(HOUSE_COLLABORATOR_ACTION_ICON_CLASS, 'house-collaborator-action-icon-save')}
                                  onClick={() => void onSaveAccessRole(selectedAsset, cleanUserId)}
                                  disabled={selectedAssetBusy}
                                  aria-label={`Save access role for ${member.name}`}
                                >
                                  <Save className="h-4 w-4" />
                                </button>
                              ) : (
                                <span className={cn(HOUSE_COLLABORATOR_ACTION_ICON_CLASS, 'opacity-0')} aria-hidden="true" />
                              )}
                              <button
                                type="button"
                                className={cn(HOUSE_COLLABORATOR_ACTION_ICON_CLASS, 'house-collaborator-action-icon-discard')}
                                onClick={onCancelAccessRoleEdit}
                                disabled={selectedAssetBusy}
                                aria-label={`Cancel access role edit for ${member.name}`}
                              >
                                <X className="h-4 w-4" />
                              </button>
                            </div>
                          ) : (
                            <div className="flex items-center justify-end gap-1.5" />
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  )
                })}
                {!accessInlineStateActive ? (
                  <TableRow className="h-14">
                    <TableCell className={cn('h-14 px-3 py-0 align-middle', HOUSE_TABLE_CELL_TEXT_CLASS)}>
                      <div className="flex h-14 items-center" />
                    </TableCell>
                    <TableCell className={cn('h-14 px-3 py-0 align-middle', HOUSE_TABLE_CELL_TEXT_CLASS)}>
                      <div className="flex h-14 items-center" />
                    </TableCell>
                    <TableCell className={cn('h-14 px-3 py-0 align-middle', HOUSE_TABLE_CELL_TEXT_CLASS)}>
                      <div className="flex h-14 items-center justify-end">
                        <button
                          type="button"
                          className={cn(HOUSE_COLLABORATOR_ACTION_ICON_CLASS, 'house-collaborator-action-icon-add')}
                          onClick={() => {
                            setAccessComposerOpen(true)
                            setAccessComposerRole('viewer')
                            setAccessEditingUserId(null)
                            setAccessEditingRole('viewer')
                            setError('')
                            setStatus('')
                          }}
                          disabled={selectedAssetBusy}
                          aria-label={`Grant file access for ${displayAssetFilename(selectedAsset.filename)}`}
                        >
                          <Plus className="h-4 w-4" />
                        </button>
                      </div>
                    </TableCell>
                  </TableRow>
                ) : null}
                {accessComposerOpen ? (
                  <TableRow className="h-14">
                    <TableCell className={cn('h-14 px-3 py-0 align-middle', HOUSE_TABLE_CELL_TEXT_CLASS)}>
                      <div className="flex h-14 items-center gap-1.5">
                        <div className="max-w-[28rem] flex-1">
                          <Input
                            value={selectedAssetSearchQuery}
                            onChange={(event) => {
                              const nextValue = event.target.value
                              setCollaboratorQueryByAssetId((current) => ({
                                ...current,
                                [selectedAsset.id]: nextValue,
                              }))
                              setSelectedCollaboratorByAssetId((current) => ({
                                ...current,
                                [selectedAsset.id]: null,
                              }))
                              setLookupErrorByAssetId((current) => ({
                                ...current,
                                [selectedAsset.id]: '',
                              }))
                            }}
                            onKeyDown={(event) => {
                              if (event.key === 'Enter') {
                                event.preventDefault()
                                if (selectedAssetCandidate) {
                                  void onAddAccess(selectedAsset)
                                  return
                                }
                                void onSearchCollaborators(selectedAsset)
                              } else if (event.key === 'Escape') {
                                event.preventDefault()
                                resetAccessComposerForAsset(selectedAsset.id)
                              }
                            }}
                            placeholder="Search by collaborator name"
                            className={HOUSE_INPUT_CLASS}
                            disabled={selectedAssetBusy}
                          />
                        </div>
                        <button
                          type="button"
                          className={cn(HOUSE_COLLABORATOR_ACTION_ICON_CLASS, HOUSE_DRILLDOWN_TOGGLE_MUTED_CLASS)}
                          onClick={() => void onSearchCollaborators(selectedAsset)}
                          disabled={selectedAssetBusy || selectedAssetLookupBusy || normalizeName(selectedAssetSearchQuery).length < 2}
                          aria-label={`Search collaborators for ${displayAssetFilename(selectedAsset.filename)}`}
                        >
                          {selectedAssetLookupBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
                        </button>
                      </div>
                    </TableCell>
                    <TableCell className={cn('h-14 px-3 py-0 align-middle text-muted-foreground', HOUSE_TABLE_CELL_TEXT_CLASS)}>
                      <div className="flex h-14 items-center">
                        <SelectPrimitive
                          value={accessComposerRole}
                          onValueChange={(value) => setAccessComposerRole(value === 'editor' ? 'editor' : 'viewer')}
                          disabled={selectedAssetBusy}
                        >
                          <SelectTrigger className="h-9 w-[10rem] text-sm">
                            <SelectValue aria-label={humanizeLibraryAssetAccessRole(accessComposerRole)}>
                              {humanizeLibraryAssetAccessRole(accessComposerRole)}
                            </SelectValue>
                          </SelectTrigger>
                          <SelectContent>
                            {DATA_LIBRARY_ACCESS_ROLE_OPTIONS.map((option) => (
                              <SelectItem key={option.value} value={option.value}>
                                {option.label}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </SelectPrimitive>
                      </div>
                    </TableCell>
                    <TableCell className={cn('h-14 px-3 py-0 align-middle', HOUSE_TABLE_CELL_TEXT_CLASS)}>
                      <div className="flex h-14 items-center justify-end gap-1.5">
                        {selectedAssetCandidate ? (
                          <button
                            type="button"
                            className={cn(HOUSE_COLLABORATOR_ACTION_ICON_CLASS, 'house-collaborator-action-icon-save')}
                            onClick={() => void onAddAccess(selectedAsset)}
                            disabled={selectedAssetBusy}
                            aria-label={`Grant file access to ${selectedAssetCandidate.full_name}`}
                          >
                            <Send className="h-4 w-4" />
                          </button>
                        ) : (
                          <span className={cn(HOUSE_COLLABORATOR_ACTION_ICON_CLASS, 'opacity-0')} aria-hidden="true" />
                        )}
                        <button
                          type="button"
                          className={cn(HOUSE_COLLABORATOR_ACTION_ICON_CLASS, 'house-collaborator-action-icon-discard')}
                          onClick={() => resetAccessComposerForAsset(selectedAsset.id)}
                          disabled={selectedAssetBusy}
                          aria-label={`Cancel grant access for ${displayAssetFilename(selectedAsset.filename)}`}
                        >
                          <X className="h-4 w-4" />
                        </button>
                      </div>
                    </TableCell>
                  </TableRow>
                ) : null}
              </TableBody>
            </Table>
          </div>
          {selectedAssetLookupError ? <p className="text-xs text-amber-700">{selectedAssetLookupError}</p> : null}
          {selectedAssetMatches.length > 0 ? (
            <div className="space-y-1">
              {selectedAssetMatches.map((candidate) => {
                const isSelected = selectedAssetCandidate?.id === candidate.id
                return (
                  <button
                    key={`${selectedAsset.id}-${candidate.id}`}
                    type="button"
                    onClick={() => {
                      setSelectedCollaboratorByAssetId((current) => ({
                        ...current,
                        [selectedAsset.id]: candidate,
                      }))
                    }}
                    className={cn(
                      'flex w-full items-center justify-between gap-3 rounded-md border border-border/60 px-3 py-2 text-left',
                      isSelected
                        ? 'bg-[hsl(var(--tone-accent-50))] ring-1 ring-[hsl(var(--tone-accent-300))]'
                        : 'bg-background/70 hover:bg-accent/30',
                    )}
                  >
                    <div className="min-w-0">
                      <p className={cn(houseTypography.text, 'truncate font-medium')}>{candidate.full_name}</p>
                      <p className={cn(HOUSE_FIELD_HELPER_CLASS, 'truncate')}>
                        {[candidate.email || '', candidate.primary_institution || ''].filter(Boolean).join(' | ') || 'Directory match'}
                      </p>
                    </div>
                    {isSelected ? (
                      <Badge variant="positive" size="sm">Selected</Badge>
                    ) : null}
                  </button>
                )
              })}
            </div>
          ) : null}
        </div>
      )}
    </div>
  ) : null

  const actionsContent = selectedAsset ? (
    <div className={cn(houseSurfaces.sectionPanel, 'house-drilldown-panel-no-pad')}>
      <div className="house-drilldown-heading-block">
        <p className="house-drilldown-heading-block-title">File actions</p>
      </div>
      <div className="house-drilldown-content-block space-y-4">
        {selectedAssetLockMessage ? (
          <div className="rounded-md border border-[hsl(var(--tone-neutral-300))] bg-[hsl(var(--tone-neutral-50))] px-3 py-2 text-sm text-[hsl(var(--tone-neutral-800))]">
            {selectedAssetLockMessage}
          </div>
        ) : null}
        <div className="space-y-2">
          <p className={HOUSE_FIELD_HELPER_CLASS}>Download</p>
          <Button
            type="button"
            variant="cta"
            size="sm"
            className="inline-flex items-center gap-1.5"
            onClick={() => void onDownloadAsset(selectedAsset)}
            disabled={selectedAssetBusy || !isAssetAvailable(selectedAsset) || !canDownloadSelectedAsset}
          >
            {selectedAssetBusy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5" />}
            {!isAssetAvailable(selectedAsset)
              ? 'Unavailable'
              : canDownloadSelectedAsset
                ? 'Download file'
                : 'Download unavailable'}
          </Button>
          {!canDownloadSelectedAsset ? (
            <p className={HOUSE_FIELD_HELPER_CLASS}>
              {isAssetLockedForTeamMembers(selectedAsset) && selectedAsset.current_user_role !== 'owner'
                ? `This file is locked by ${assetOwnerDisplayName(selectedAsset)} for team members.`
                : 'Viewer access can inspect file history, but only owners and editors can download or analyse the file.'}
            </p>
          ) : null}
        </div>
        <div className="space-y-2">
          <p className={HOUSE_FIELD_HELPER_CLASS}>Lock</p>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="inline-flex items-center gap-1.5"
            onClick={() => void onToggleAssetLock(selectedAsset)}
            disabled={selectedAssetBusy || !canToggleSelectedAssetLock}
          >
            {selectedAssetBusy ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : isAssetLockedForTeamMembers(selectedAsset) ? (
              <LockOpen className="h-3.5 w-3.5" />
            ) : (
              <Lock className="h-3.5 w-3.5" />
            )}
            {assetLockActionLabel(selectedAsset)}
          </Button>
          <p className={HOUSE_FIELD_HELPER_CLASS}>
            {canToggleSelectedAssetLock
              ? 'Locking keeps the file visible to collaborators but blocks team-member download and analysis until you unlock it.'
              : assetReadOnlyMessage(selectedAsset) || 'Only the file owner can change the lock state.'}
          </p>
        </div>
        <div className="space-y-2">
          <p className={HOUSE_FIELD_HELPER_CLASS}>Archive</p>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="inline-flex items-center gap-1.5"
            onClick={() => void onToggleAssetArchive(selectedAsset)}
            disabled={selectedAssetBusy}
          >
            {selectedAssetBusy ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : isAssetArchivedForCurrentUser(selectedAsset) ? (
              <RotateCcw className="h-3.5 w-3.5" />
            ) : (
              <Archive className="h-3.5 w-3.5" />
            )}
            {assetArchiveActionLabel(selectedAsset)}
          </Button>
          <p className={HOUSE_FIELD_HELPER_CLASS}>
            Archiving is personal to your view. It keeps the file and its permissions intact, but moves it out of your active list until you unarchive it.
          </p>
        </div>
      </div>
    </div>
  ) : null

  const logsContent = selectedAsset ? (
    <>
      <div className={cn(houseSurfaces.sectionPanel, 'house-drilldown-panel-no-pad')}>
        <div className="house-drilldown-heading-block">
          <p className="house-drilldown-heading-block-title">
            {showPersonalAssetLogs ? 'Your data access activity' : 'Team member activity'}
          </p>
          <DrilldownSheet.HeadingToggle
            className="ml-auto"
            expanded={!accessActivityCollapsed}
            expandedLabel={showPersonalAssetLogs ? 'Collapse your data access activity' : 'Collapse team member activity'}
            collapsedLabel={showPersonalAssetLogs ? 'Expand your data access activity' : 'Expand team member activity'}
            onClick={onToggleAccessActivitySection}
          />
        </div>
        {accessActivityCollapsed ? null : (
          <div className="house-drilldown-content-block space-y-2">
            {accessActivityGroups.length === 0 ? (
              <p className={HOUSE_FIELD_HELPER_CLASS}>No access events logged yet.</p>
            ) : (
              accessActivityGroups.map((group) => {
                const isExpanded = accessActivityActorExpanded[group.key] ?? false
                return (
                  <div
                    key={group.key}
                    className={cn(
                      'rounded-md border border-border/60 bg-background/70',
                      HOUSE_DRILLDOWN_COLLAPSIBLE_ENTITY_CLASS,
                    )}
                    data-state={isExpanded ? 'open' : 'closed'}
                  >
                    <button
                      type="button"
                      className="flex w-full items-center justify-between gap-2 px-2 py-1.5 text-left"
                      onClick={() => setAccessActivityActorExpanded((current) => ({ ...current, [group.key]: !isExpanded }))}
                      aria-expanded={isExpanded}
                      aria-label={`Toggle ${group.title} asset access activity`}
                    >
                      <p className={cn(houseTypography.text, 'font-medium')}>{group.title}</p>
                      <span className="inline-flex items-center gap-1.5">
                        <span className={HOUSE_FIELD_HELPER_CLASS}>{group.entries.length}</span>
                        {isExpanded ? (
                          <ChevronUp className="h-4 w-4 text-muted-foreground" />
                        ) : (
                          <ChevronDown className="h-4 w-4 text-muted-foreground" />
                        )}
                      </span>
                    </button>
                    {isExpanded ? (
                      <div className="border-t border-border/50">
                        {group.entries.length === 0 ? (
                          <p className={cn(HOUSE_FIELD_HELPER_CLASS, 'px-3 py-2')}>No activity logged yet.</p>
                        ) : (
                          group.entries.map((entry, entryIndex) => (
                            <div
                              key={entry.id}
                              className={cn('px-3 py-2', entryIndex > 0 ? 'border-t border-border/50' : '')}
                            >
                              <div className="flex items-center justify-between gap-2">
                                <div className="flex flex-wrap items-center gap-1.5 text-xs">
                                  {entry.from_value ? (
                                    <span className={assetAuditStatePillClassName(entry.from_value)}>
                                      {humanizeAuditValue(entry.from_value)}
                                    </span>
                                  ) : null}
                                  {entry.from_value ? <ArrowRight className="h-3.5 w-3.5 text-muted-foreground" /> : null}
                                  <span className={assetAuditStatePillClassName(entry.to_value)}>
                                    {humanizeAuditValue(entry.to_value) || humanizeAuditValue(entry.event_type)}
                                  </span>
                                </div>
                                <span className={HOUSE_FIELD_HELPER_CLASS}>
                                  {formatAuditCompactTimestamp(entry.created_at)}
                                </span>
                              </div>
                            </div>
                          ))
                        )}
                      </div>
                    ) : null}
                  </div>
                )
              })
            )}
          </div>
        )}
      </div>

      <div className={cn(houseSurfaces.sectionPanel, 'house-drilldown-panel-no-pad')}>
        <div className="house-drilldown-heading-block">
          <p className="house-drilldown-heading-block-title">Asset activity</p>
          <DrilldownSheet.HeadingToggle
            className="ml-auto"
            expanded={!assetActivityCollapsed}
            expandedLabel="Collapse asset activity"
            collapsedLabel="Expand asset activity"
            onClick={onToggleAssetActivitySection}
          />
        </div>
        {assetActivityCollapsed ? null : (
          <div className="house-drilldown-content-block space-y-2">
            {assetActivityGroups.length === 0 ? (
              <p className={HOUSE_FIELD_HELPER_CLASS}>No asset events logged yet.</p>
            ) : (
              assetActivityGroups.map((group) => {
                const isExpanded = assetActivityGroupExpanded[group.key] ?? false
                return (
                  <div
                    key={group.key}
                    className={cn(
                      'rounded-md border border-border/60 bg-background/70',
                      HOUSE_DRILLDOWN_COLLAPSIBLE_ENTITY_CLASS,
                    )}
                    data-state={isExpanded ? 'open' : 'closed'}
                  >
                    <button
                      type="button"
                      className="flex w-full items-center justify-between gap-2 px-2 py-1.5 text-left"
                      onClick={() => setAssetActivityGroupExpanded((current) => ({ ...current, [group.key]: !isExpanded }))}
                      aria-expanded={isExpanded}
                      aria-label={`Toggle ${group.title.toLowerCase()} asset activity`}
                    >
                      <p className={cn(houseTypography.text, 'font-medium')}>{group.title}</p>
                      <span className="inline-flex items-center gap-1.5">
                        <span className={HOUSE_FIELD_HELPER_CLASS}>{group.entries.length}</span>
                        {isExpanded ? (
                          <ChevronUp className="h-4 w-4 text-muted-foreground" />
                        ) : (
                          <ChevronDown className="h-4 w-4 text-muted-foreground" />
                        )}
                      </span>
                    </button>
                    {isExpanded ? (
                      <div className="border-t border-border/50">
                        {group.entries.map((entry, entryIndex) => (
                          <div
                            key={entry.id}
                            className={cn('px-3 py-2', entryIndex > 0 ? 'border-t border-border/50' : '')}
                          >
                            <div className="flex items-center justify-between gap-2">
                              <div className="min-w-0 flex-1">
                                {entry.event_type === 'asset_renamed' ? (
                                  <div className="flex flex-wrap items-center gap-1.5 text-xs">
                                    {entry.from_value ? (
                                      <span className={assetAuditStatePillClassName(entry.from_value)}>
                                        {entry.from_value}
                                      </span>
                                    ) : null}
                                    {entry.from_value ? <ArrowRight className="h-3.5 w-3.5 text-muted-foreground" /> : null}
                                    <span className={assetAuditStatePillClassName(entry.to_value)}>
                                      {entry.to_value || entry.message}
                                    </span>
                                  </div>
                                ) : (
                                  <div className="flex flex-wrap items-center gap-1.5 text-xs">
                                    <span className={assetAuditStatePillClassName(entry.to_value || entry.event_type)}>
                                      {humanizeAuditValue(entry.to_value) || humanizeAuditValue(entry.event_type)}
                                    </span>
                                    {entry.actor_name ? (
                                      <span className="text-muted-foreground">by {entry.actor_name}</span>
                                    ) : null}
                                  </div>
                                )}
                              </div>
                              <span className={HOUSE_FIELD_HELPER_CLASS}>
                                {formatAuditCompactTimestamp(entry.created_at)}
                              </span>
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : null}
                  </div>
                )
              })
            )}
          </div>
        )}
      </div>
    </>
  ) : null

  const drilldownPanel = selectedAsset ? (
    <div className={cn(HOUSE_DRILLDOWN_SHEET_BODY_CLASS, 'house-drilldown-panel-no-pad')}>
      <div className="relative z-10 house-drilldown-flow-shell">
        <div className="absolute right-0 top-0 z-20 p-3">
          <Button
            type="button"
            variant="outline"
            size="icon"
            className="h-9 w-9"
            onClick={onCloseAssetDrilldown}
            aria-label="Close data-library drilldown"
          >
            <X className="h-4 w-4" />
          </Button>
        </div>

        <DrilldownSheet.Header
          title={displayAssetFilename(selectedAsset.filename)}
          variant="workspace"
        >
          <TooltipProvider delayDuration={120}>
            <DrilldownSheet.Tabs
              activeTab={drilldownTab}
              onTabChange={(tabId) => {
                if (!canViewDataLibraryDrilldownTab(selectedAsset, tabId as DataLibraryDrilldownTab)) {
                  return
                }
                setDrilldownTab(tabId as DataLibraryDrilldownTab)
              }}
              panelIdPrefix="data-library-drilldown-panel-"
              tabIdPrefix="data-library-drilldown-tab-"
              tone="workspace"
              flexGrow={drilldownTabFlexGrow}
              aria-label="Data-library drilldown sections"
              className="house-drilldown-tabs"
            >
              {(['overview', 'access', 'actions', 'logs'] as DataLibraryDrilldownTab[]).map((tab) => {
                const tabEnabled = canViewDataLibraryDrilldownTab(selectedAsset, tab)
                const tabRestrictionMessage = dataLibraryDrilldownTabRestrictionMessage(tab)
                const tabLabel = dataLibraryDrilldownTabLabel(tab, selectedAsset)
                return !tabEnabled && tabRestrictionMessage ? (
                  <Tooltip key={tab}>
                    <TooltipTrigger asChild>
                      <span className="inline-flex flex-1 basis-0">
                        <DrilldownSheet.Tab id={tab} disabled aria-disabled="true">
                          {tabLabel}
                        </DrilldownSheet.Tab>
                      </span>
                    </TooltipTrigger>
                    <TooltipContent side="top" className="max-w-[16rem] text-xs leading-relaxed">
                      {tabRestrictionMessage}
                    </TooltipContent>
                  </Tooltip>
                ) : (
                  <DrilldownSheet.Tab key={tab} id={tab}>
                    {tabLabel}
                  </DrilldownSheet.Tab>
                )
              })}
            </DrilldownSheet.Tabs>
          </TooltipProvider>
        </DrilldownSheet.Header>

        <DrilldownSheet.TabPanel
          id={drilldownTab}
          isActive={true}
          panelIdPrefix="data-library-drilldown-panel-"
          tabIdPrefix="data-library-drilldown-tab-"
        >
          <div className="house-drilldown-stack-3">
            {drilldownTab === 'overview' ? overviewContent : null}
            {drilldownTab === 'access' ? accessContent : null}
            {drilldownTab === 'actions' ? actionsContent : null}
            {drilldownTab === 'logs' ? logsContent : null}
          </div>
        </DrilldownSheet.TabPanel>
      </div>
    </div>
  ) : null

  return (
    <Stack data-house-role="page" space="sm">
      {showPageHeader ? (
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
      ) : null}

      <div className={showPageHeader ? cn(HOUSE_SECTION_ANCHOR_CLASS) : undefined}>
        <SectionHeader
          heading="Library files"
          className="house-publications-toolbar-header house-publications-library-toolbar-header"
          actions={(
            <div className="ml-auto flex h-8 w-full items-center justify-end gap-1 overflow-visible self-center md:w-auto">
              <div className="house-approved-toggle-context order-0 inline-flex items-center">
                <div
                  className="house-segmented-auto-toggle h-8"
                  data-house-role="horizontal-toggle"
                  data-ui="data-library-archive-scope-toggle"
                >
                  {DATA_LIBRARY_ARCHIVE_SCOPE_OPTIONS.map((option) => {
                    const isActive = archiveScope === option.value
                    return (
                      <button
                        key={option.value}
                        type="button"
                        className={cn(
                          HOUSE_TOGGLE_BUTTON_CLASS,
                          'house-segmented-fill-toggle-button relative z-[1] min-w-0 px-3 text-sm text-center',
                          '!rounded-none',
                          isActive
                            ? option.value === 'active'
                              ? 'bg-[hsl(var(--tone-positive-600))] text-white'
                              : option.value === 'archived'
                                ? 'bg-[hsl(var(--tone-neutral-700))] text-white'
                                : 'bg-foreground text-background'
                            : HOUSE_DRILLDOWN_TOGGLE_MUTED_CLASS,
                        )}
                        aria-pressed={isActive}
                        onClick={() => {
                          setArchiveScope(option.value)
                          setPage(1)
                        }}
                      >
                        {option.label}
                      </button>
                    )
                  })}
                </div>
              </div>
              <div className="house-approved-toggle-context order-0 inline-flex items-center">
                <div
                  className="house-segmented-auto-toggle h-8"
                  data-house-role="horizontal-toggle"
                  data-ui="data-library-scope-toggle"
                >
                  {DATA_LIBRARY_SCOPE_OPTIONS.map((option) => {
                    const isActive = ownershipFilter === option.value
                    return (
                      <button
                        key={option.value}
                        type="button"
                        className={cn(
                          HOUSE_TOGGLE_BUTTON_CLASS,
                          'house-segmented-fill-toggle-button relative z-[1] min-w-0 px-3 text-sm text-center',
                          '!rounded-none',
                          isActive ? 'bg-foreground text-background' : HOUSE_DRILLDOWN_TOGGLE_MUTED_CLASS,
                        )}
                        aria-pressed={isActive}
                        onClick={() => {
                          setOwnershipFilter(option.value)
                          setPage(1)
                        }}
                      >
                        {option.label}
                      </button>
                    )
                  })}
                </div>
              </div>
            </div>
          )}
        />

        {status ? (
          <p className={cn('px-1 pb-3 text-sm text-emerald-700', HOUSE_FIELD_HELPER_CLASS)}>{status}</p>
        ) : null}

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
            <Button type="button" variant="outline" size="sm" onClick={onRefresh}>
              Retry
            </Button>
          </div>
        ) : assets.length === 0 ? (
          <div className={cn('p-6', HOUSE_FIELD_HELPER_CLASS)}>
            No files in your data library yet.
          </div>
        ) : (
          <>
            <div className="relative w-full house-table-context-profile">
              <Table
                className={cn(
                  'w-full table-fixed house-table-resizable',
                  tableDensity === 'compact' && 'house-publications-table-density-compact',
                  tableDensity === 'comfortable' && 'house-publications-table-density-comfortable',
                )}
                data-house-no-column-resize="true"
                data-house-no-column-controls="true"
                data-house-table-id="data-library-table"
              >
                <colgroup>
                  {visibleTableColumns.map((columnKey) => (
                    <col key={`data-library-col-${columnKey}`} style={{ width: DATA_LIBRARY_TABLE_COLUMN_DEFINITIONS[columnKey].width }} />
                  ))}
                </colgroup>
                <TableHeader className="house-table-head text-left">
                  <TableRow style={{ backgroundColor: 'transparent' }}>
                    {visibleTableColumns.map((columnKey, columnIndex) => {
                      const definition = DATA_LIBRARY_TABLE_COLUMN_DEFINITIONS[columnKey]
                      const isLastColumn = columnIndex >= visibleTableColumns.length - 1
                      const headClassName = cn(
                        'house-table-head-text px-4 py-3',
                        !isLastColumn && 'border-r border-[hsl(var(--border))]/70',
                        definition.align === 'center' && 'text-center',
                      )
                      return (
                        <TableHead key={`data-library-head-${columnKey}`} className={headClassName}>
                          {definition.sortBy ? (
                            <button
                              type="button"
                              className={cn(
                                'inline-flex w-full items-center gap-1 transition-colors hover:text-foreground',
                                definition.align === 'center' ? 'justify-center text-center' : 'justify-start text-left',
                              )}
                              onClick={() => onSort(definition.sortBy!)}
                            >
                              <span>{definition.label}</span>
                              {sortBy === definition.sortBy ? (
                                sortDirection === 'desc' ? (
                                  <ChevronDown className="h-3.5 w-3.5 text-foreground" />
                                ) : (
                                  <ChevronUp className="h-3.5 w-3.5 text-foreground" />
                                )
                              ) : null}
                            </button>
                          ) : (
                            <span className={cn('inline-flex w-full items-center', definition.align === 'center' ? 'justify-center text-center' : 'justify-start text-left')}>
                              {definition.label}
                            </span>
                          )}
                        </TableHead>
                      )
                    })}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {assets.map((asset) => {
                    const accessMembers = libraryAssetAccessMembers(asset)
                    const available = isAssetAvailable(asset)
                    const ownerName = normalizeName(asset.owner_name || '') || 'Unknown'
                    const isSelected = selectedAssetId === asset.id

                    return (
                      <TableRow
                        key={asset.id}
                        className={cn(
                          'cursor-pointer',
                          isAssetArchivedForCurrentUser(asset) && 'bg-[hsl(var(--tone-neutral-100))] hover:bg-[hsl(var(--tone-neutral-100))]',
                          isSelected && 'bg-[hsl(var(--tone-accent-50))]',
                        )}
                        onClick={() => onAssetRowClick(asset.id)}
                        onContextMenu={(event) => onOpenAssetContextMenu(asset.id, event)}
                      >
                        {visibleTableColumns.map((columnKey, columnIndex) => {
                          const isLastColumn = columnIndex >= visibleTableColumns.length - 1
                          const cellClassName = cn(
                            !isLastColumn && 'border-r border-[hsl(var(--border))]/70',
                            HOUSE_TABLE_CELL_TEXT_CLASS,
                          )
                          if (columnKey === 'filename') {
                            return (
                              <TableCell key={`${asset.id}-${columnKey}`} className={cn('align-middle', cellClassName)}>
                                <div className="min-w-0 space-y-1">
                                  <div className="flex min-w-0 items-center gap-1.5">
                                    <p className="truncate font-medium text-foreground">{displayAssetFilename(asset.filename)}</p>
                                    {isAssetArchivedForCurrentUser(asset) ? (
                                      <Badge
                                        size="sm"
                                        variant="outline"
                                        className="shrink-0 border-[hsl(var(--tone-neutral-500))] bg-[hsl(var(--tone-neutral-50))] text-[hsl(var(--tone-neutral-800))]"
                                      >
                                        Archived
                                      </Badge>
                                    ) : null}
                                    {isAssetLockedForTeamMembers(asset) ? (
                                      <Badge
                                        size="sm"
                                        variant="outline"
                                        className="shrink-0 border-[hsl(var(--tone-neutral-500))] bg-[hsl(var(--tone-neutral-50))] text-[hsl(var(--tone-neutral-800))]"
                                      >
                                        {assetLockedBadgeLabel(asset)}
                                      </Badge>
                                    ) : null}
                                  </div>
                                  {!available ? <p className="text-xs text-[hsl(var(--tone-warning-900))]">Storage missing</p> : null}
                                </div>
                              </TableCell>
                            )
                          }
                          if (columnKey === 'access') {
                            return (
                              <TableCell key={`${asset.id}-${columnKey}`} className={cn('align-middle', cellClassName)}>
                                <div
                                  className="space-y-1.5"
                                  onClick={(event) => onOpenAssetAccessFromCell(asset, event)}
                                >
                                  <div className="flex flex-wrap items-center gap-1.5">
                                    <Badge size="sm" variant="positive" className="font-semibold">
                                      {ownerName} (Owner)
                                    </Badge>
                                  </div>
                                  {accessMembers.length > 0 ? (
                                    <div className="flex flex-wrap items-center gap-1.5">
                                      {accessMembers.map((member) => {
                                        const cleanUserId = String(member.user_id || '').trim()
                                        const canManageAssetAccess = Boolean(asset.can_manage_access && cleanUserId)
                                        return canManageAssetAccess ? (
                                          <button
                                            key={`${asset.id}-${member.user_id || member.name}`}
                                            type="button"
                                            onClick={(event) => onOpenMemberMenu(asset.id, cleanUserId, event)}
                                            className="group/member-badge inline-flex rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                                            aria-label={`Open access actions for ${member.name}`}
                                          >
                                            <Badge
                                              size="sm"
                                              variant="positive"
                                              className="transition-[transform,box-shadow] duration-[var(--motion-duration-ui)] ease-out hover:-translate-y-px hover:shadow-[0_2px_8px_hsl(var(--foreground)/0.08)]"
                                            >
                                              <span>{member.name}</span>
                                              <ChevronDown className="ml-1 h-3 w-3 opacity-45 transition-[opacity,transform] duration-[var(--motion-duration-ui)] ease-out group-hover/member-badge:translate-y-px group-hover/member-badge:opacity-80" />
                                            </Badge>
                                          </button>
                                        ) : (
                                          <Badge key={`${asset.id}-${member.user_id || member.name}`} size="sm" variant="positive">
                                            <span>{member.name}</span>
                                          </Badge>
                                        )
                                      })}
                                    </div>
                                  ) : null}
                                </div>
                              </TableCell>
                            )
                          }
                          if (columnKey === 'uploaded') {
                            return <TableCell key={`${asset.id}-${columnKey}`} className={cn('align-middle text-muted-foreground', cellClassName)}>{formatTimestamp(asset.uploaded_at)}</TableCell>
                          }
                          if (columnKey === 'format') {
                            return <TableCell key={`${asset.id}-${columnKey}`} className={cn('align-middle text-muted-foreground', cellClassName)}>{asset.kind.toUpperCase()}</TableCell>
                          }
                          if (columnKey === 'size') {
                            return <TableCell key={`${asset.id}-${columnKey}`} className={cn('align-middle text-muted-foreground', cellClassName)}>{formatBytes(asset.byte_size)}</TableCell>
                          }
                          return (
                            <TableCell key={`${asset.id}-${columnKey}`} className="align-middle text-center">
                              <div className="flex items-center justify-center gap-1.5">
                                <Button
                                  type="button"
                                  variant="cta"
                                  size="sm"
                                  className="group h-8 w-8 p-0"
                                  onClick={(event) => {
                                    event.stopPropagation()
                                    onOpenAssetDrilldown(asset.id)
                                  }}
                                  aria-label={`Open ${displayAssetFilename(asset.filename)}`}
                                >
                                  <ArrowRight className="h-3.5 w-3.5 transition-transform duration-[var(--motion-duration-ui)] ease-out group-hover:translate-x-0.5 group-focus-visible:translate-x-0.5" />
                                </Button>
                                <Button
                                  type="button"
                                  size="sm"
                                  className="h-8 w-8 p-0"
                                  onClick={(event) => onToggleAssetMenu(asset.id, event)}
                                  aria-label={`Open actions for ${displayAssetFilename(asset.filename)}`}
                                >
                                  <MoreHorizontal className="h-3.5 w-3.5" />
                                </Button>
                              </div>
                            </TableCell>
                          )
                        })}
                      </TableRow>
                    )
                  })}
                </TableBody>
              </Table>

            </div>

            <Sheet
              open={Boolean(selectedAsset)}
              onOpenChange={(open) => {
                if (!open) {
                  onCloseAssetDrilldown()
                }
              }}
            >
              <SheetContent side="right" className={HOUSE_DRILLDOWN_SHEET_CLASS}>
                {drilldownPanel}
              </SheetContent>
            </Sheet>

            {menuState && menuAsset
              ? createPortal(
                  <div className="fixed inset-0 z-50" data-ui="data-library-menu-overlay" onClick={() => setMenuState(null)}>
                    <div
                      data-ui="data-library-menu-shell"
                      className="fixed w-[13.25rem] rounded-md border border-border bg-card p-1 shadow-lg"
                      style={{ left: menuState.x, top: menuState.y }}
                      onClick={(event) => event.stopPropagation()}
                    >
                      <button
                        type="button"
                        className="flex w-full items-center gap-2 whitespace-nowrap rounded px-2 py-1.5 text-left text-sm hover:bg-[hsl(var(--tone-accent-100))] hover:text-[hsl(var(--tone-accent-900))]"
                        onClick={() => {
                          setMenuState(null)
                          onOpenAssetDrilldown(menuAsset.id)
                        }}
                      >
                        <ArrowRight className="h-4 w-4 shrink-0" />
                        <span>Open details</span>
                      </button>
                      <div className="my-1 border-t border-border/70" />
                      {menuAsset.can_edit_metadata ? (
                        <button
                          type="button"
                          className="flex w-full items-center gap-2 whitespace-nowrap rounded px-2 py-1.5 text-left text-sm hover:bg-[hsl(var(--tone-accent-100))] hover:text-[hsl(var(--tone-accent-900))]"
                          onClick={() => onStartRenameAssetFromMenu(menuAsset)}
                        >
                          <Pencil className="h-4 w-4 shrink-0" />
                          <span>Rename file</span>
                        </button>
                      ) : null}
                      <button
                        type="button"
                        className="flex w-full items-center gap-2 whitespace-nowrap rounded px-2 py-1.5 text-left text-sm hover:bg-[hsl(var(--tone-accent-100))] hover:text-[hsl(var(--tone-accent-900))]"
                        onClick={() => {
                          setMenuState(null)
                          void onToggleAssetArchive(menuAsset)
                        }}
                      >
                        {isAssetArchivedForCurrentUser(menuAsset) ? (
                          <RotateCcw className="h-4 w-4 shrink-0" />
                        ) : (
                          <Archive className="h-4 w-4 shrink-0" />
                        )}
                        <span>{assetArchiveActionLabel(menuAsset)}</span>
                      </button>
                      {menuAsset.can_edit_metadata ? (
                        <button
                          type="button"
                          className="flex w-full items-center gap-2 whitespace-nowrap rounded px-2 py-1.5 text-left text-sm hover:bg-[hsl(var(--tone-accent-100))] hover:text-[hsl(var(--tone-accent-900))]"
                          onClick={() => {
                            setMenuState(null)
                            void onToggleAssetLock(menuAsset)
                          }}
                        >
                          {isAssetLockedForTeamMembers(menuAsset) ? (
                            <LockOpen className="h-4 w-4 shrink-0" />
                          ) : (
                            <Lock className="h-4 w-4 shrink-0" />
                          )}
                          <span>{assetLockActionLabel(menuAsset)}</span>
                        </button>
                      ) : null}
                      {(menuAsset.can_edit_metadata || menuAsset.can_download) ? <div className="my-1 border-t border-border/70" /> : null}
                      {menuAsset.can_download ? (
                        <button
                          type="button"
                          className={cn(
                            'flex w-full items-center gap-2 whitespace-nowrap rounded px-2 py-1.5 text-left text-sm hover:bg-[hsl(var(--tone-accent-100))] hover:text-[hsl(var(--tone-accent-900))]',
                            !isAssetAvailable(menuAsset) && 'cursor-not-allowed text-muted-foreground hover:bg-transparent hover:text-muted-foreground',
                          )}
                          onClick={() => {
                            if (!isAssetAvailable(menuAsset)) {
                              return
                            }
                            onDownloadAssetFromMenu(menuAsset)
                          }}
                          disabled={!isAssetAvailable(menuAsset)}
                        >
                          <Download className="h-4 w-4 shrink-0" />
                          <span>Download file</span>
                        </button>
                      ) : null}
                    </div>
                  </div>,
                  document.body,
                )
              : null}

            {memberMenuState && activeMember && memberMenuAsset
              ? createPortal(
                  <div className="fixed inset-0 z-50" data-ui="data-library-member-menu-overlay" onClick={() => setMemberMenuState(null)}>
                    <div
                      data-ui="data-library-member-menu-shell"
                      className="fixed w-[11.5rem] rounded-md border border-border bg-card p-1 shadow-lg"
                      style={{ left: memberMenuState.x, top: memberMenuState.y }}
                      onClick={(event) => event.stopPropagation()}
                    >
                      <button
                        type="button"
                        className="flex w-full items-center gap-2 whitespace-nowrap rounded px-2 py-1.5 text-left text-sm hover:bg-[hsl(var(--tone-accent-100))] hover:text-[hsl(var(--tone-accent-900))]"
                        onClick={() => {
                          setMemberMenuState(null)
                          onOpenAssetDrilldown(memberMenuAsset.id, 'access')
                          onStartEditAccessRole(activeMember)
                        }}
                      >
                        <Pencil className="h-4 w-4 shrink-0" />
                        <span>Change role</span>
                      </button>
                      <div className="my-1 border-t border-border/70" />
                      <button
                        type="button"
                        className="flex w-full items-center gap-2 whitespace-nowrap rounded px-2 py-1.5 text-left text-sm hover:bg-[hsl(var(--tone-accent-100))] hover:text-[hsl(var(--tone-accent-900))]"
                        onClick={() => {
                          setMemberMenuState(null)
                          onOpenAssetDrilldown(memberMenuAsset.id, 'access')
                          setAccessEditingUserId(null)
                          setAccessEditingRole('viewer')
                          setAccessRemovalConfirmUserId(activeMember.user_id)
                        }}
                      >
                        <UserMinus className="h-4 w-4 shrink-0" />
                        <span>Remove access</span>
                      </button>
                    </div>
                  </div>,
                  document.body,
                )
              : null}
          </>
        )}
      </div>
    </Stack>
  )
}
