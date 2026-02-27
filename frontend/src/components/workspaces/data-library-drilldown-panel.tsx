import { useEffect, useMemo, useRef, useState } from 'react'
import {
  ArrowRight,
  Check,
  ChevronDown,
  ChevronUp,
  Download,
  Pencil,
  RotateCcw,
  UserMinus,
  UserPlus,
  X,
} from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { getAuthSessionToken } from '@/lib/auth-session'
import { houseActions, houseCollaborators, houseDrilldown, houseForms, houseSurfaces, houseTypography } from '@/lib/house-style'
import {
  appendLibraryAssetAuditLogEntry,
  downloadLibraryAsset,
  listLibraryAssetAuditLogs,
  updateLibraryAssetAccess,
} from '@/lib/study-core-api'
import { readScopedStorageItem, writeScopedStorageItem } from '@/lib/user-scoped-storage'
import { cn } from '@/lib/utils'
import { displayAssetFilename, formatDataLibraryBytes, formatDataLibraryTimestamp } from '@/pages/workspaces-data-library-view'
import type { WorkspaceRecord } from '@/store/use-workspace-store'
import type {
  LibraryAssetAuditCategory,
  LibraryAssetAuditLogEntry,
  LibraryAssetRecord,
} from '@/types/study-core'

const HOUSE_SECTION_TITLE_CLASS = houseTypography.sectionTitle
const HOUSE_FIELD_HELPER_CLASS = houseTypography.fieldHelper
const HOUSE_BUTTON_TEXT_CLASS = houseTypography.buttonText
const HOUSE_TEXT_CLASS = houseTypography.text
const HOUSE_INPUT_CLASS = houseForms.input
const HOUSE_SELECT_CLASS = houseForms.select
const HOUSE_PRIMARY_ACTION_BUTTON_CLASS = houseForms.actionButtonPrimary
const HOUSE_COLLABORATOR_CHIP_CLASS = houseCollaborators.chip
const HOUSE_COLLABORATOR_CHIP_ACTIVE_CLASS = houseCollaborators.chipActive
const HOUSE_COLLABORATOR_CHIP_PENDING_CLASS = houseCollaborators.chipPending
const HOUSE_COLLABORATOR_CHIP_VIEW_ONLY_CLASS = houseCollaborators.chipViewOnly
const HOUSE_COLLABORATOR_CHIP_REMOVED_CLASS = houseCollaborators.chipRemoved
const HOUSE_COLLABORATOR_CHIP_READONLY_CLASS = houseCollaborators.chipReadOnly
const HOUSE_COLLABORATOR_ACTION_ICON_CLASS = houseCollaborators.actionIcon
const HOUSE_COLLABORATOR_ACTION_ICON_ADD_CLASS = houseCollaborators.actionIconAdd
const HOUSE_COLLABORATOR_ACTION_ICON_CONFIRM_CLASS = houseCollaborators.actionIconConfirm
const HOUSE_COLLABORATOR_ACTION_ICON_EDIT_CLASS = houseCollaborators.actionIconEdit
const HOUSE_COLLABORATOR_ACTION_ICON_REMOVE_CLASS = houseCollaborators.actionIconRemove
const HOUSE_COLLABORATOR_ACTION_ICON_RESTORE_CLASS = houseCollaborators.actionIconRestore
const HOUSE_DRILLDOWN_SHEET_BODY_CLASS = houseDrilldown.sheetBody
const HOUSE_DRILLDOWN_SECTION_LABEL_CLASS = houseDrilldown.sectionLabel
const HOUSE_DRILLDOWN_NAV_TAB_LIST_CLASS = houseDrilldown.navTabList
const HOUSE_DRILLDOWN_NAV_TAB_TRIGGER_CLASS = houseDrilldown.navTabTrigger
const HOUSE_DRILLDOWN_TAB_LIST_CLASS = houseDrilldown.tabList
const HOUSE_DRILLDOWN_TAB_TRIGGER_CLASS = houseDrilldown.tabTrigger
const HOUSE_DRILLDOWN_COLLAPSIBLE_ENTITY_CLASS = houseDrilldown.collapsibleEntity
const HOUSE_DATA_TONE_CLASS = houseSurfaces.leftBorderWorkspace
const HOUSE_SECTION_TOOLS_CLASS = houseActions.sectionTools
const HOUSE_SECTION_TOOLS_DATA_CLASS = houseActions.sectionToolsData
const HOUSE_SECTION_TOOL_BUTTON_CLASS = houseActions.sectionToolButton
const HOUSE_ACTIONS_PILL_CLASS = houseActions.actionPill
const HOUSE_ACTIONS_PILL_PRIMARY_CLASS = houseActions.actionPillPrimary

const DATA_LIBRARY_ACCESS_STATE_STORAGE_KEY = 'aawe-data-library-access-state-v1'
const DATA_LIBRARY_ACCESS_STATE_UPDATED_EVENT = 'data-library-access-state-updated'

type DataLibraryDrilldownTab = 'details' | 'users' | 'logs'
type DataLibraryAccessRole = 'full_access' | 'view_only'
type DataLibraryAccessStatus = 'active' | 'pending' | 'removed'
type DataLibraryAuditFilter = 'all' | 'permissions' | 'invites' | 'activity'

type DataLibraryAccessMember = {
  key: string
  name: string
  userId: string | null
  role: DataLibraryAccessRole
  status: DataLibraryAccessStatus
  lastRole: DataLibraryAccessRole
}

type DataLibraryAuditLogEntry = {
  id: string
  assetId: string
  collaboratorName: string
  collaboratorKey: string
  collaboratorUserId: string | null
  actorName: string
  actorUserId: string | null
  category: LibraryAssetAuditCategory
  fromLabel: string | null
  toLabel: string
  createdAt: string
}

type DataLibraryDrilldownPanelProps = {
  selectedAsset: LibraryAssetRecord | null
  selectedAssetDisplayName: string
  workspaces: WorkspaceRecord[]
  linkedWorkspaceIds: string[]
  currentUserName: string
  onUpdateAssetDisplayName: (assetId: string, displayName: string) => void
  onLinkedWorkspaceIdsChange: (assetId: string, nextWorkspaceIds: string[]) => void
  onOpenWorkspace: (workspaceId: string) => void
  onRequestAssetRefresh: () => void
  onAssetPatched: (asset: LibraryAssetRecord) => void
  dataLeftBorderClassName: string
}

const DATA_LIBRARY_ROLE_OPTIONS: Array<{ value: DataLibraryAccessRole; label: string }> = [
  { value: 'full_access', label: 'Full-access' },
  { value: 'view_only', label: 'View-only' },
]

const DATA_LIBRARY_TABS: Array<{ value: DataLibraryDrilldownTab; label: string }> = [
  { value: 'details', label: 'Details' },
  { value: 'users', label: 'Users' },
  { value: 'logs', label: 'Logs' },
]

const DATA_LIBRARY_AUDIT_FILTER_OPTIONS: Array<{ value: DataLibraryAuditFilter; label: string }> = [
  { value: 'all', label: 'All' },
  { value: 'permissions', label: 'Permissions' },
  { value: 'invites', label: 'Invites' },
  { value: 'activity', label: 'Activity' },
]

function isActivityAuditCategory(category: LibraryAssetAuditCategory): boolean {
  return category === 'activity'
}

function isPermissionAuditCategory(category: LibraryAssetAuditCategory): boolean {
  return category === 'access' || category === 'roles'
}

function toDataLibraryAuditLogEntry(entry: LibraryAssetAuditLogEntry): DataLibraryAuditLogEntry {
  return {
    id: String(entry.id || ''),
    assetId: String(entry.asset_id || ''),
    collaboratorName: normalizeName(entry.collaborator_name) || 'Unknown user',
    collaboratorKey: normalizeKey(entry.collaborator_key || entry.collaborator_name),
    collaboratorUserId: String(entry.collaborator_user_id || '').trim() || null,
    actorName: normalizeName(entry.actor_name) || 'Unknown user',
    actorUserId: String(entry.actor_user_id || '').trim() || null,
    category: entry.category,
    fromLabel: normalizeName(entry.from_label || '') || null,
    toLabel: normalizeName(entry.to_label) || 'Unknown',
    createdAt: String(entry.created_at || ''),
  }
}

function normalizeName(value: string | null | undefined): string {
  return (value || '').trim().replace(/\s+/g, ' ')
}

function normalizeKey(value: string | null | undefined): string {
  return normalizeName(value).toLowerCase()
}

function roleLabel(role: DataLibraryAccessRole): string {
  return role === 'view_only' ? 'View-only' : 'Full-access'
}

function roleStatusLabel(role: DataLibraryAccessRole, status: DataLibraryAccessStatus): string {
  if (status === 'removed') {
    return 'Removed'
  }
  if (status === 'pending') {
    return `${roleLabel(role)} (pending)`
  }
  return roleLabel(role)
}

function isAvailableAsset(asset: LibraryAssetRecord): boolean {
  return asset.is_available !== false
}

function parseScopedJson<T>(baseKey: string, fallback: T): T {
  const raw = readScopedStorageItem(baseKey)
  if (!raw) {
    return fallback
  }
  try {
    return JSON.parse(raw) as T
  } catch {
    return fallback
  }
}

function safeWriteScopedJson(baseKey: string, value: unknown): void {
  try {
    writeScopedStorageItem(baseKey, JSON.stringify(value))
  } catch {
    // Ignore localStorage capacity / availability failures.
  }
}

function accessStatusRank(status: DataLibraryAccessStatus): number {
  if (status === 'active') {
    return 0
  }
  if (status === 'pending') {
    return 1
  }
  return 2
}

function formatCompactTimestamp(value: string): string {
  const parsed = Date.parse(value)
  if (Number.isNaN(parsed)) {
    return 'Not available'
  }
  return new Date(parsed)
    .toLocaleString('en-GB', {
      day: '2-digit',
      month: '2-digit',
      year: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    })
    .replace(',', '')
}

function csvCell(value: string): string {
  const escaped = String(value || '').replace(/"/g, '""')
  return `"${escaped}"`
}

function downloadCsvFile(filename: string, rows: string[]): void {
  const blob = new Blob([rows.join('\n')], { type: 'text/csv;charset=utf-8' })
  const url = window.URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = filename
  document.body.appendChild(anchor)
  anchor.click()
  anchor.remove()
  window.URL.revokeObjectURL(url)
}

function auditRangeStartMs(range: 'all' | '7d' | '30d' | '90d', nowMs: number): number {
  if (range === '7d') {
    return nowMs - 7 * 24 * 60 * 60 * 1000
  }
  if (range === '30d') {
    return nowMs - 30 * 24 * 60 * 60 * 1000
  }
  if (range === '90d') {
    return nowMs - 90 * 24 * 60 * 60 * 1000
  }
  return Number.NEGATIVE_INFINITY
}

function resolveAssetAccessMembers(asset: LibraryAssetRecord): Array<{ name: string; userId: string | null }> {
  if (Array.isArray(asset.shared_with) && asset.shared_with.length > 0) {
    return asset.shared_with
      .map((member) => ({
        name: normalizeName(member.name) || 'Unknown user',
        userId: String(member.user_id || '').trim() || null,
      }))
      .filter((member) => Boolean(member.name))
  }
  if (Array.isArray(asset.shared_with_user_ids) && asset.shared_with_user_ids.length > 0) {
    const output: Array<{ name: string; userId: string | null }> = []
    for (const userId of asset.shared_with_user_ids) {
      const clean = String(userId || '').trim()
      if (!clean) {
        continue
      }
      output.push({
        name: clean,
        userId: clean,
      })
    }
    return output
  }
  return []
}

function mergeAccessMembersFromAsset(
  asset: LibraryAssetRecord,
  currentMembers: DataLibraryAccessMember[],
): DataLibraryAccessMember[] {
  const currentByKey = new Map<string, DataLibraryAccessMember>()
  for (const member of currentMembers) {
    const key = normalizeKey(member.name)
    if (!key) {
      continue
    }
    currentByKey.set(key, {
      ...member,
      key,
      name: normalizeName(member.name),
      userId: member.userId || null,
      role: member.role === 'view_only' ? 'view_only' : 'full_access',
      status: member.status === 'pending' || member.status === 'removed' ? member.status : 'active',
      lastRole: member.lastRole === 'view_only' ? 'view_only' : 'full_access',
    })
  }

  const backendMembers = resolveAssetAccessMembers(asset)
  const backendMemberKeys = new Set<string>()

  for (const backendMember of backendMembers) {
    const key = normalizeKey(backendMember.name)
    if (!key) {
      continue
    }
    backendMemberKeys.add(key)
    const existing = currentByKey.get(key)
    if (!existing) {
      currentByKey.set(key, {
        key,
        name: backendMember.name,
        userId: backendMember.userId,
        role: 'full_access',
        status: 'active',
        lastRole: 'full_access',
      })
      continue
    }
    currentByKey.set(key, {
      ...existing,
      name: backendMember.name,
      userId: backendMember.userId || existing.userId || null,
      status: 'active',
      role: existing.role,
      lastRole: existing.role,
    })
  }

  for (const [key, member] of currentByKey.entries()) {
    if (backendMemberKeys.has(key)) {
      continue
    }
    if (member.status === 'active') {
      currentByKey.set(key, {
        ...member,
        status: 'removed',
        lastRole: member.role,
      })
    }
  }

  return Array.from(currentByKey.values())
    .filter((member) => Boolean(member.name))
    .sort((left, right) => {
      const byStatus = accessStatusRank(left.status) - accessStatusRank(right.status)
      if (byStatus !== 0) {
        return byStatus
      }
      return left.name.localeCompare(right.name, undefined, { sensitivity: 'base' })
    })
}

function toRoleValue(value: string): DataLibraryAccessRole {
  return value === 'view_only' ? 'view_only' : 'full_access'
}

function auditPillClass(label: string): string {
  const clean = normalizeKey(label)
  if (clean.includes('pending')) {
    return cn(HOUSE_COLLABORATOR_CHIP_CLASS, HOUSE_COLLABORATOR_CHIP_PENDING_CLASS)
  }
  if (clean.includes('view-only') || clean.includes('view only')) {
    return cn(HOUSE_COLLABORATOR_CHIP_CLASS, HOUSE_COLLABORATOR_CHIP_VIEW_ONLY_CLASS)
  }
  if (clean.includes('removed') || clean.includes('cancel')) {
    return cn(HOUSE_COLLABORATOR_CHIP_CLASS, HOUSE_COLLABORATOR_CHIP_REMOVED_CLASS)
  }
  if (clean.includes('download') || clean.includes('viewed')) {
    return 'rounded border border-border bg-background px-1.5 py-0.5 text-[11px] text-muted-foreground'
  }
  return cn(HOUSE_COLLABORATOR_CHIP_CLASS, HOUSE_COLLABORATOR_CHIP_ACTIVE_CLASS)
}

function badgeClassForStatus(status: DataLibraryAccessStatus): string {
  if (status === 'pending') {
    return cn(HOUSE_COLLABORATOR_CHIP_CLASS, HOUSE_COLLABORATOR_CHIP_PENDING_CLASS)
  }
  if (status === 'removed') {
    return cn(HOUSE_COLLABORATOR_CHIP_CLASS, HOUSE_COLLABORATOR_CHIP_REMOVED_CLASS)
  }
  return cn(HOUSE_COLLABORATOR_CHIP_CLASS, HOUSE_COLLABORATOR_CHIP_ACTIVE_CLASS)
}

export function DataLibraryDrilldownPanel({
  selectedAsset,
  selectedAssetDisplayName,
  workspaces,
  linkedWorkspaceIds,
  currentUserName,
  onUpdateAssetDisplayName,
  onLinkedWorkspaceIdsChange,
  onOpenWorkspace,
  onRequestAssetRefresh,
  onAssetPatched,
  dataLeftBorderClassName,
}: DataLibraryDrilldownPanelProps) {
  const [activeTab, setActiveTab] = useState<DataLibraryDrilldownTab>('details')
  const [displayNameDraft, setDisplayNameDraft] = useState('')
  const [linkWorkspaceDraft, setLinkWorkspaceDraft] = useState('')
  const [accessStateByAssetId, setAccessStateByAssetId] = useState<Record<string, DataLibraryAccessMember[]>>(() =>
    parseScopedJson<Record<string, DataLibraryAccessMember[]>>(DATA_LIBRARY_ACCESS_STATE_STORAGE_KEY, {}),
  )
  const [auditLogByAssetId, setAuditLogByAssetId] = useState<Record<string, DataLibraryAuditLogEntry[]>>({})
  const [auditLogLoading, setAuditLogLoading] = useState(false)
  const [auditFilter, setAuditFilter] = useState<DataLibraryAuditFilter>('all')
  const [auditGroupExpandedByKey, setAuditGroupExpandedByKey] = useState<Record<string, boolean>>({})
  const [auditExportRange, setAuditExportRange] = useState<'all' | '7d' | '30d' | '90d' | 'custom'>('all')
  const [auditExportCollaboratorKey, setAuditExportCollaboratorKey] = useState('all')
  const [auditExportFromDate, setAuditExportFromDate] = useState('')
  const [auditExportToDate, setAuditExportToDate] = useState('')

  const [addCollaboratorOpen, setAddCollaboratorOpen] = useState(false)
  const [addCollaboratorName, setAddCollaboratorName] = useState('')
  const [addCollaboratorRole, setAddCollaboratorRole] = useState<DataLibraryAccessRole>('full_access')
  const [roleEditorKey, setRoleEditorKey] = useState<string | null>(null)
  const [roleEditorDraft, setRoleEditorDraft] = useState<DataLibraryAccessRole>('full_access')
  const [restoreEditorKey, setRestoreEditorKey] = useState<string | null>(null)
  const [restoreEditorDraft, setRestoreEditorDraft] = useState<DataLibraryAccessRole>('full_access')
  const [removalConfirmKey, setRemovalConfirmKey] = useState<string | null>(null)

  const [busy, setBusy] = useState(false)
  const [downloadBusy, setDownloadBusy] = useState(false)
  const [status, setStatus] = useState('')
  const [error, setError] = useState('')
  const viewedMarkerRef = useRef<string | null>(null)

  const cleanCurrentUserName = useMemo(
    () => normalizeName(currentUserName) || 'You',
    [currentUserName],
  )
  const currentUserKey = normalizeKey(cleanCurrentUserName)
  const assetId = selectedAsset?.id || null
  const assetOwnerName = normalizeName(selectedAsset?.owner_name || '')
  const assetOwnerKey = normalizeKey(assetOwnerName)
  const isOwner = Boolean(assetId && currentUserKey && currentUserKey === assetOwnerKey)
  const ownerDisplayName = isOwner ? 'You' : (assetOwnerName || 'Unknown')
  const canManageAccess = isOwner

  const assetMembers = useMemo(() => {
    if (!assetId) {
      return []
    }
    return accessStateByAssetId[assetId] || []
  }, [accessStateByAssetId, assetId])

  const currentUserAccessMember = useMemo(
    () => assetMembers.find((member) => member.key === currentUserKey) || null,
    [assetMembers, currentUserKey],
  )

  const yourRoleLabel = useMemo(() => {
    if (!assetId) {
      return 'Not available'
    }
    if (isOwner) {
      return 'Owner'
    }
    if (!currentUserAccessMember) {
      return 'No access'
    }
    return roleStatusLabel(currentUserAccessMember.role, currentUserAccessMember.status)
  }, [assetId, currentUserAccessMember, isOwner])

  useEffect(() => {
    setDisplayNameDraft(selectedAssetDisplayName || '')
    setStatus('')
    setError('')
    setAuditFilter('all')
    setRoleEditorKey(null)
    setRestoreEditorKey(null)
    setRemovalConfirmKey(null)
    setAddCollaboratorOpen(false)
    setAddCollaboratorName('')
    setAddCollaboratorRole('full_access')
    setAuditExportRange('all')
    setAuditExportCollaboratorKey('all')
    setAuditExportFromDate('')
    setAuditExportToDate('')
    viewedMarkerRef.current = null
  }, [selectedAsset?.id, selectedAssetDisplayName])

  useEffect(() => {
    if (!selectedAsset) {
      return
    }
    setAccessStateByAssetId((current) => {
      const existing = current[selectedAsset.id] || []
      const merged = mergeAccessMembersFromAsset(selectedAsset, existing)
      if (JSON.stringify(existing) === JSON.stringify(merged)) {
        return current
      }
      return {
        ...current,
        [selectedAsset.id]: merged,
      }
    })
  }, [selectedAsset])

  useEffect(() => {
    safeWriteScopedJson(DATA_LIBRARY_ACCESS_STATE_STORAGE_KEY, accessStateByAssetId)
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new Event(DATA_LIBRARY_ACCESS_STATE_UPDATED_EVENT))
    }
  }, [accessStateByAssetId])

  useEffect(() => {
    if (!assetId) {
      return
    }
    let cancelled = false
    setAuditLogLoading(true)
    void listLibraryAssetAuditLogs({ assetId })
      .then((items) => {
        if (cancelled) {
          return
        }
        const normalized = items
          .map(toDataLibraryAuditLogEntry)
          .filter((entry) => entry.assetId === assetId)
          .sort((left, right) => Date.parse(right.createdAt) - Date.parse(left.createdAt))
        setAuditLogByAssetId((current) => ({
          ...current,
          [assetId]: normalized,
        }))
      })
      .catch(() => {
        if (cancelled) {
          return
        }
        setAuditLogByAssetId((current) => ({
          ...current,
          [assetId]: current[assetId] || [],
        }))
      })
      .finally(() => {
        if (!cancelled) {
          setAuditLogLoading(false)
        }
      })
    return () => {
      cancelled = true
    }
  }, [assetId])

  const appendAuditEntry = async (
    category: LibraryAssetAuditCategory,
    collaboratorName: string,
    toLabel: string,
    fromLabel?: string | null,
    collaboratorUserId?: string | null,
  ) => {
    if (!assetId) {
      return
    }
    const cleanCollaboratorName = normalizeName(collaboratorName) || 'Unknown user'
    const cleanToLabel = normalizeName(toLabel)
    if (!cleanToLabel) {
      return
    }
    const cleanFromLabel = normalizeName(fromLabel || '') || null
    try {
      const saved = await appendLibraryAssetAuditLogEntry({
        assetId,
        collaboratorName: cleanCollaboratorName,
        collaboratorUserId: collaboratorUserId || null,
        category,
        fromLabel: cleanFromLabel,
        toLabel: cleanToLabel,
      })
      const nextEntry = toDataLibraryAuditLogEntry(saved)
      setAuditLogByAssetId((current) => {
        const existing = current[assetId] || []
        const deduped = existing.filter((entry) => entry.id !== nextEntry.id)
        return {
          ...current,
          [assetId]: [nextEntry, ...deduped].sort(
            (left, right) => Date.parse(right.createdAt) - Date.parse(left.createdAt),
          ),
        }
      })
    } catch (appendError) {
      setError(appendError instanceof Error ? appendError.message : 'Could not write audit log entry.')
    }
  }

  const updateAssetMembers = (nextMembers: DataLibraryAccessMember[]) => {
    if (!assetId) {
      return
    }
    setAccessStateByAssetId((current) => ({
      ...current,
      [assetId]: [...nextMembers]
        .map((member) => ({
          ...member,
          name: normalizeName(member.name),
          key: normalizeKey(member.name),
        }))
        .filter((member) => Boolean(member.key))
        .sort((left, right) => {
          const byStatus = accessStatusRank(left.status) - accessStatusRank(right.status)
          if (byStatus !== 0) {
            return byStatus
          }
          return left.name.localeCompare(right.name, undefined, { sensitivity: 'base' })
        }),
    }))
  }

  const syncActiveMembersToBackend = async (nextMembers: DataLibraryAccessMember[]): Promise<boolean> => {
    if (!selectedAsset) {
      return false
    }
    const token = getAuthSessionToken()
    if (!token) {
      setError('Sign in to manage data access.')
      return false
    }
    const activeMembers = nextMembers.filter((member) => member.status === 'active')
    const collaboratorUserIds = activeMembers
      .map((member) => String(member.userId || '').trim())
      .filter(Boolean)
    const collaboratorNames = activeMembers
      .filter((member) => !String(member.userId || '').trim())
      .map((member) => member.name)
    try {
      const updated = await updateLibraryAssetAccess({
        token,
        assetId: selectedAsset.id,
        collaboratorUserIds,
        collaboratorNames,
      })
      onAssetPatched(updated)
      onRequestAssetRefresh()
      return true
    } catch (syncError) {
      setError(syncError instanceof Error ? syncError.message : 'Could not update data access.')
      return false
    }
  }

  const onDownload = async () => {
    if (!selectedAsset) {
      return
    }
    if (!isAvailableAsset(selectedAsset)) {
      setError('File storage is unavailable.')
      return
    }
    const canDownload = isOwner || (
      currentUserAccessMember?.status === 'active' &&
      currentUserAccessMember.role === 'full_access'
    )
    if (!canDownload) {
      setError('Download is limited to owner and full-access collaborators.')
      return
    }
    const token = getAuthSessionToken()
    if (!token) {
      setError('Sign in to download files.')
      return
    }
    setDownloadBusy(true)
    setStatus('')
    setError('')
    try {
      const payload = await downloadLibraryAsset({
        token,
        assetId: selectedAsset.id,
      })
      const objectUrl = window.URL.createObjectURL(payload.blob)
      const anchor = document.createElement('a')
      anchor.href = objectUrl
      anchor.download = payload.fileName || selectedAsset.filename
      document.body.appendChild(anchor)
      anchor.click()
      anchor.remove()
      window.URL.revokeObjectURL(objectUrl)
      await appendAuditEntry('activity', cleanCurrentUserName, 'Downloaded', null, currentUserAccessMember?.userId || null)
      setStatus('Download started.')
    } catch (downloadError) {
      setError(downloadError instanceof Error ? downloadError.message : 'Could not download file.')
    } finally {
      setDownloadBusy(false)
    }
  }

  const onSaveDisplayName = () => {
    if (!selectedAsset) {
      return
    }
    const nextDisplayName = normalizeName(displayNameDraft)
    if (!nextDisplayName) {
      setError('Display name is required.')
      return
    }
    if (nextDisplayName === selectedAssetDisplayName) {
      return
    }
    onUpdateAssetDisplayName(selectedAsset.id, nextDisplayName)
    setStatus('Display name saved.')
    setError('')
  }

  useEffect(() => {
    if (!selectedAsset) {
      return
    }
    const marker = `${selectedAsset.id}:${currentUserKey}`
    if (viewedMarkerRef.current === marker) {
      return
    }
    viewedMarkerRef.current = marker
    void appendAuditEntry('activity', cleanCurrentUserName, 'Viewed', null, currentUserAccessMember?.userId || null)
  }, [cleanCurrentUserName, currentUserAccessMember?.userId, currentUserKey, selectedAsset?.id])

  const onAddCollaborator = () => {
    if (!selectedAsset || !canManageAccess) {
      return
    }
    const name = normalizeName(addCollaboratorName)
    if (!name) {
      setError('Collaborator name is required.')
      return
    }
    if (normalizeKey(name) === assetOwnerKey) {
      setError('Owner already has access.')
      return
    }
    const nameKey = normalizeKey(name)
    const existing = assetMembers.find((member) => member.key === nameKey)
    if (existing?.status === 'active') {
      setError(`${name} already has access.`)
      return
    }
    let nextMembers = [...assetMembers]
    let fromLabel: string | null = null
    if (existing) {
      fromLabel = roleStatusLabel(existing.role, existing.status)
      nextMembers = nextMembers.map((member) => (
        member.key === nameKey
          ? {
              ...member,
              role: addCollaboratorRole,
              status: 'pending',
              lastRole: addCollaboratorRole,
            }
          : member
      ))
    } else {
      nextMembers.push({
        key: nameKey,
        name,
        userId: null,
        role: addCollaboratorRole,
        status: 'pending',
        lastRole: addCollaboratorRole,
      })
    }
    updateAssetMembers(nextMembers)
    void appendAuditEntry(
      'invites',
      name,
      roleStatusLabel(addCollaboratorRole, 'pending'),
      fromLabel,
      existing?.userId || null,
    )
    setStatus('Invitation pending acceptance.')
    setError('')
    setAddCollaboratorName('')
    setAddCollaboratorRole('full_access')
    setAddCollaboratorOpen(false)
  }

  const onSaveRoleChange = async (member: DataLibraryAccessMember) => {
    if (!canManageAccess || !selectedAsset) {
      return
    }
    const nextRole = roleEditorDraft
    if (nextRole === member.role) {
      setRoleEditorKey(null)
      return
    }
    const nextMembers = assetMembers.map((row) => (
      row.key === member.key
        ? {
            ...row,
            role: nextRole,
            lastRole: nextRole,
          }
        : row
    ))
    setBusy(true)
    setError('')
    if (member.status === 'active') {
      const synced = await syncActiveMembersToBackend(nextMembers)
      if (!synced) {
        setBusy(false)
        return
      }
    }
    updateAssetMembers(nextMembers)
    await appendAuditEntry(
      'roles',
      member.name,
      roleStatusLabel(nextRole, member.status),
      roleStatusLabel(member.role, member.status),
      member.userId,
    )
    setStatus('Role updated.')
    setBusy(false)
    setRoleEditorKey(null)
  }

  const onConfirmRemove = async (member: DataLibraryAccessMember) => {
    if (!canManageAccess || !selectedAsset) {
      return
    }
    const nextMembers = assetMembers.map((row) => (
      row.key === member.key
        ? {
            ...row,
            status: 'removed' as const,
            lastRole: row.role,
          }
        : row
    ))
    setBusy(true)
    setError('')
    const synced = await syncActiveMembersToBackend(nextMembers)
    if (!synced) {
      setBusy(false)
      return
    }
    updateAssetMembers(nextMembers)
    await appendAuditEntry(
      'access',
      member.name,
      'Removed',
      roleStatusLabel(member.role, member.status),
      member.userId,
    )
    setStatus('Access removed.')
    setBusy(false)
    setRemovalConfirmKey(null)
    setRoleEditorKey(null)
  }

  const onCancelPending = (member: DataLibraryAccessMember) => {
    if (!canManageAccess) {
      return
    }
    const nextMembers = assetMembers.filter((row) => row.key !== member.key)
    updateAssetMembers(nextMembers)
    void appendAuditEntry(
      'invites',
      member.name,
      'Cancelled',
      roleStatusLabel(member.role, 'pending'),
      member.userId,
    )
    setStatus('Pending invitation cancelled.')
    setError('')
    setRoleEditorKey(null)
  }

  const onConfirmRestore = (member: DataLibraryAccessMember) => {
    if (!canManageAccess) {
      return
    }
    const nextRole = restoreEditorDraft
    const nextMembers = assetMembers.map((row) => (
      row.key === member.key
        ? {
            ...row,
            role: nextRole,
            status: 'pending' as const,
            lastRole: nextRole,
          }
        : row
    ))
    updateAssetMembers(nextMembers)
    void appendAuditEntry(
      'invites',
      member.name,
      roleStatusLabel(nextRole, 'pending'),
      'Removed',
      member.userId,
    )
    setStatus('Restore invitation pending acceptance.')
    setError('')
    setRestoreEditorKey(null)
  }

  const availableWorkspaces = useMemo(
    () => workspaces.filter((workspace) => !workspace.archived),
    [workspaces],
  )
  const linkedWorkspaceSet = useMemo(
    () => new Set(linkedWorkspaceIds),
    [linkedWorkspaceIds],
  )
  const linkedWorkspaceRecords = useMemo(
    () =>
      linkedWorkspaceIds
        .map((workspaceId) => availableWorkspaces.find((workspace) => workspace.id === workspaceId))
        .filter((workspace): workspace is WorkspaceRecord => Boolean(workspace)),
    [availableWorkspaces, linkedWorkspaceIds],
  )

  const onAddLinkedWorkspace = () => {
    if (!selectedAsset || !canManageAccess) {
      return
    }
    const workspaceId = String(linkWorkspaceDraft || '').trim()
    if (!workspaceId || linkedWorkspaceSet.has(workspaceId)) {
      return
    }
    onLinkedWorkspaceIdsChange(selectedAsset.id, [...linkedWorkspaceIds, workspaceId])
    setLinkWorkspaceDraft('')
  }

  const onRemoveLinkedWorkspace = (workspaceId: string) => {
    if (!selectedAsset || !canManageAccess) {
      return
    }
    onLinkedWorkspaceIdsChange(
      selectedAsset.id,
      linkedWorkspaceIds.filter((value) => value !== workspaceId),
    )
  }

  const assetAuditEntries = useMemo(
    () =>
      assetId
        ? [...(auditLogByAssetId[assetId] || [])].sort(
            (left, right) => Date.parse(right.createdAt) - Date.parse(left.createdAt),
          )
        : [],
    [assetId, auditLogByAssetId],
  )

  const visibleAuditEntries = useMemo(() => {
    const scoped = isOwner
      ? assetAuditEntries
      : assetAuditEntries.filter((entry) => entry.collaboratorKey === currentUserKey)
    const relevant = (() => {
      if (auditFilter === 'all') {
        return scoped
      }
      if (auditFilter === 'activity') {
        return scoped.filter((entry) => isActivityAuditCategory(entry.category))
      }
      if (auditFilter === 'permissions') {
        return scoped.filter((entry) => isPermissionAuditCategory(entry.category))
      }
      return scoped.filter((entry) => entry.category === 'invites')
    })()
    return [...relevant].sort((left, right) => Date.parse(right.createdAt) - Date.parse(left.createdAt))
  }, [assetAuditEntries, auditFilter, currentUserKey, isOwner])

  const groupedAuditEntries = useMemo(() => {
    const groups = new Map<string, { key: string; name: string; entries: DataLibraryAuditLogEntry[] }>()
    for (const entry of visibleAuditEntries) {
      const key = entry.collaboratorKey || 'unknown'
      const existing = groups.get(key)
      if (existing) {
        existing.entries.push(entry)
        continue
      }
      groups.set(key, {
        key,
        name: entry.collaboratorName,
        entries: [entry],
      })
    }
    return Array.from(groups.values())
      .map((group) => ({
        ...group,
        entries: [...group.entries].sort((left, right) => Date.parse(right.createdAt) - Date.parse(left.createdAt)),
        latestTimestamp: Date.parse(group.entries[0]?.createdAt || '') || Number.NEGATIVE_INFINITY,
      }))
      .sort((left, right) => {
        const byNewest = right.latestTimestamp - left.latestTimestamp
        if (byNewest !== 0) {
          return byNewest
        }
        return left.name.localeCompare(right.name, undefined, { sensitivity: 'base' })
      })
  }, [visibleAuditEntries])

  const auditExportCollaboratorOptions = useMemo(
    () => [
      { value: 'all', label: 'All collaborators' },
      ...groupedAuditEntries.map((group) => ({ value: group.key, label: group.name })),
    ],
    [groupedAuditEntries],
  )

  const exportReadyAuditEntries = useMemo(() => {
    let entries = [...visibleAuditEntries]
    if (auditExportCollaboratorKey !== 'all') {
      entries = entries.filter((entry) => entry.collaboratorKey === auditExportCollaboratorKey)
    }
    if (auditExportRange === 'custom') {
      const fromMs = auditExportFromDate
        ? Date.parse(`${auditExportFromDate}T00:00:00`)
        : Number.NEGATIVE_INFINITY
      const toMs = auditExportToDate
        ? Date.parse(`${auditExportToDate}T23:59:59`)
        : Number.POSITIVE_INFINITY
      return entries.filter((entry) => {
        const entryMs = Date.parse(entry.createdAt)
        return entryMs >= fromMs && entryMs <= toMs
      })
    }
    const startMs = auditRangeStartMs(auditExportRange, Date.now())
    return entries.filter((entry) => Date.parse(entry.createdAt) >= startMs)
  }, [
    auditExportCollaboratorKey,
    auditExportFromDate,
    auditExportRange,
    auditExportToDate,
    visibleAuditEntries,
  ])

  const onExportAuditLogs = () => {
    if (!selectedAsset) {
      return
    }
    if (exportReadyAuditEntries.length === 0) {
      setStatus('No log entries match the export filters.')
      return
    }
    const rows = [
      [
        'Timestamp',
        'Collaborator',
        'Category',
        'From',
        'To',
        'Actor',
      ].map(csvCell).join(','),
      ...exportReadyAuditEntries.map((entry) =>
        [
          entry.createdAt,
          entry.collaboratorName,
          entry.category,
          entry.fromLabel || '',
          entry.toLabel,
          entry.actorName,
        ]
          .map(csvCell)
          .join(','),
      ),
    ]
    const dateTag = new Date().toISOString().slice(0, 10)
    const filename = `${selectedAsset.id}-audit-log-${dateTag}.csv`
    downloadCsvFile(filename, rows)
    setStatus(`Exported ${exportReadyAuditEntries.length} log entries.`)
  }

  useEffect(() => {
    setAuditGroupExpandedByKey((current) => {
      const next: Record<string, boolean> = {}
      for (const group of groupedAuditEntries) {
        next[group.key] = current[group.key] ?? true
      }
      return next
    })
  }, [groupedAuditEntries])

  if (!selectedAsset) {
    return (
      <div className={cn(HOUSE_DRILLDOWN_SHEET_BODY_CLASS, HOUSE_DATA_TONE_CLASS)}>
        <div className={dataLeftBorderClassName}>
          <h2 className={HOUSE_SECTION_TITLE_CLASS}>Manage data</h2>
        </div>
      </div>
    )
  }

  const canDownload = isAvailableAsset(selectedAsset) && (
    isOwner ||
    (currentUserAccessMember?.status === 'active' && currentUserAccessMember.role === 'full_access')
  )

  return (
    <div className={cn(HOUSE_DRILLDOWN_SHEET_BODY_CLASS, HOUSE_DATA_TONE_CLASS)}>
      <div className={dataLeftBorderClassName}>
        <h2 className={HOUSE_SECTION_TITLE_CLASS}>Manage data</h2>
      </div>

      <div className="space-y-2">
        <Button
          type="button"
          className={cn(HOUSE_PRIMARY_ACTION_BUTTON_CLASS, HOUSE_BUTTON_TEXT_CLASS, 'w-full')}
          onClick={() => void onDownload()}
          disabled={downloadBusy || !canDownload}
        >
          <Download className="mr-1 h-4 w-4" />
          {downloadBusy ? 'Downloading...' : 'Download file'}
        </Button>
        {status ? <p className={HOUSE_FIELD_HELPER_CLASS}>{status}</p> : null}
        {error ? <p className="text-xs text-[hsl(var(--tone-danger-700))]">{error}</p> : null}
      </div>

      <div className={HOUSE_DRILLDOWN_NAV_TAB_LIST_CLASS}>
        {DATA_LIBRARY_TABS.map((tab) => (
          <button
            key={tab.value}
            type="button"
            className={HOUSE_DRILLDOWN_NAV_TAB_TRIGGER_CLASS}
            data-state={activeTab === tab.value ? 'active' : 'inactive'}
            onClick={() => setActiveTab(tab.value)}
            aria-label={`Open ${tab.label} tab`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {activeTab === 'details' ? (
        <div className="space-y-2">
          <div className="grid grid-cols-2 gap-2 rounded-md border border-border bg-background/70 p-2 text-xs">
            <div>
              <p className={HOUSE_FIELD_HELPER_CLASS}>File ID</p>
              <p className={HOUSE_TEXT_CLASS}>{selectedAsset.id}</p>
            </div>
            <div>
              <p className={HOUSE_FIELD_HELPER_CLASS}>Your role</p>
              <p className={HOUSE_TEXT_CLASS}>{yourRoleLabel}</p>
            </div>
            <div>
              <p className={HOUSE_FIELD_HELPER_CLASS}>Owner</p>
              <p className={HOUSE_TEXT_CLASS}>{assetOwnerName || 'Unknown'}</p>
            </div>
            <div>
              <p className={HOUSE_FIELD_HELPER_CLASS}>Status</p>
              <p className={HOUSE_TEXT_CLASS}>{isAvailableAsset(selectedAsset) ? 'Available' : 'Storage missing'}</p>
            </div>
            <div>
              <p className={HOUSE_FIELD_HELPER_CLASS}>Type</p>
              <p className={HOUSE_TEXT_CLASS}>{selectedAsset.kind.toUpperCase()}</p>
            </div>
            <div>
              <p className={HOUSE_FIELD_HELPER_CLASS}>Size</p>
              <p className={HOUSE_TEXT_CLASS}>{formatDataLibraryBytes(selectedAsset.byte_size)}</p>
            </div>
            <div className="col-span-2">
              <p className={HOUSE_FIELD_HELPER_CLASS}>Uploaded</p>
              <p className={HOUSE_TEXT_CLASS}>{formatDataLibraryTimestamp(selectedAsset.uploaded_at)}</p>
            </div>
          </div>

          <div className="space-y-1">
            <p className={cn(HOUSE_DRILLDOWN_SECTION_LABEL_CLASS, 'pl-0')}>Display name</p>
            <div className="flex items-center gap-1.5">
              <Input
                value={displayNameDraft}
                onChange={(event) => setDisplayNameDraft(event.target.value)}
                className={HOUSE_INPUT_CLASS}
              />
              <button
                type="button"
                className={cn(HOUSE_COLLABORATOR_ACTION_ICON_CLASS, HOUSE_COLLABORATOR_ACTION_ICON_CONFIRM_CLASS)}
                onClick={onSaveDisplayName}
                aria-label="Save display name"
                disabled={!normalizeName(displayNameDraft)}
              >
                <Check className="h-4 w-4" />
              </button>
            </div>
            <p className={HOUSE_FIELD_HELPER_CLASS}>Backend filename: {displayAssetFilename(selectedAsset.filename)}</p>
          </div>

          <div className="space-y-1">
            <p className={cn(HOUSE_DRILLDOWN_SECTION_LABEL_CLASS, 'pl-0')}>Linked workspaces</p>
            {linkedWorkspaceRecords.length === 0 ? (
              <p className={HOUSE_FIELD_HELPER_CLASS}>None</p>
            ) : (
              <div className="space-y-1.5">
                {linkedWorkspaceRecords.map((workspace) => (
                  <div key={`${selectedAsset.id}-${workspace.id}`} className="flex items-center justify-between gap-2">
                    <button
                      type="button"
                      onClick={() => onOpenWorkspace(workspace.id)}
                      className="rounded border border-border bg-background px-2 py-1 text-left text-xs text-foreground hover:bg-accent/40"
                    >
                      {workspace.name}
                    </button>
                    {canManageAccess ? (
                      <button
                        type="button"
                        className={cn(HOUSE_COLLABORATOR_ACTION_ICON_CLASS, HOUSE_COLLABORATOR_ACTION_ICON_REMOVE_CLASS)}
                        onClick={() => onRemoveLinkedWorkspace(workspace.id)}
                        aria-label={`Unlink ${workspace.name}`}
                      >
                        <X className="h-4 w-4" />
                      </button>
                    ) : null}
                  </div>
                ))}
              </div>
            )}
            {canManageAccess ? (
              <div className="flex items-center gap-1.5 pt-0.5">
                <select
                  value={linkWorkspaceDraft}
                  onChange={(event) => setLinkWorkspaceDraft(event.target.value)}
                  className={cn('h-8 min-w-sz-180 rounded-md px-2 text-xs', HOUSE_SELECT_CLASS)}
                >
                  <option value="">Select workspace</option>
                  {availableWorkspaces
                    .filter((workspace) => !linkedWorkspaceSet.has(workspace.id))
                    .map((workspace) => (
                      <option key={workspace.id} value={workspace.id}>
                        {workspace.name}
                      </option>
                    ))}
                </select>
                <button
                  type="button"
                  className={cn(HOUSE_COLLABORATOR_ACTION_ICON_CLASS, HOUSE_COLLABORATOR_ACTION_ICON_ADD_CLASS)}
                  onClick={onAddLinkedWorkspace}
                  aria-label="Link workspace"
                  disabled={!linkWorkspaceDraft}
                >
                  <UserPlus className="h-4 w-4" />
                </button>
              </div>
            ) : null}
          </div>
        </div>
      ) : null}

      {activeTab === 'users' ? (
        <div className="space-y-2">
          <div className="space-y-1.5">
            <div className="flex items-center justify-between gap-2">
              <span
                className={cn(
                  HOUSE_COLLABORATOR_CHIP_CLASS,
                  HOUSE_COLLABORATOR_CHIP_ACTIVE_CLASS,
                  HOUSE_COLLABORATOR_CHIP_READONLY_CLASS,
                )}
              >
                {ownerDisplayName}
              </span>
              <div className="flex items-center gap-1.5">
                <span className={HOUSE_FIELD_HELPER_CLASS}>Owner</span>
                <span className="inline-block h-8 w-[4.375rem]" aria-hidden="true" />
              </div>
            </div>
            {assetMembers.map((member) => {
              const isEditingRole = roleEditorKey === member.key
              const isRemoving = removalConfirmKey === member.key
              const isRestoring = restoreEditorKey === member.key
              const roleDisplay = isEditingRole
                ? roleLabel(roleEditorDraft)
                : isRestoring
                  ? roleLabel(restoreEditorDraft)
                  : member.status === 'removed'
                    ? 'Removed'
                    : member.status === 'pending'
                      ? roleLabel(member.role)
                      : roleLabel(member.role)
              return (
                <div key={`${selectedAsset.id}-${member.key}`} className="flex items-center justify-between gap-2">
                  <span
                    className={cn(
                      badgeClassForStatus(member.status),
                      HOUSE_COLLABORATOR_CHIP_READONLY_CLASS,
                    )}
                  >
                    {member.key === currentUserKey ? 'You' : member.name}
                    {member.status === 'pending' ? ' (pending)' : ''}
                  </span>
                  <div className="flex items-center gap-1.5">
                    {isEditingRole ? (
                      <select
                        value={roleEditorDraft}
                        onChange={(event) => setRoleEditorDraft(toRoleValue(event.target.value))}
                        className={cn('h-8 min-w-sz-130 rounded-md px-2 text-xs', HOUSE_SELECT_CLASS)}
                      >
                        {DATA_LIBRARY_ROLE_OPTIONS.map((option) => (
                          <option key={option.value} value={option.value}>
                            {option.label}
                          </option>
                        ))}
                      </select>
                    ) : isRestoring ? (
                      <select
                        value={restoreEditorDraft}
                        onChange={(event) => setRestoreEditorDraft(toRoleValue(event.target.value))}
                        className={cn('h-8 min-w-sz-130 rounded-md px-2 text-xs', HOUSE_SELECT_CLASS)}
                      >
                        {DATA_LIBRARY_ROLE_OPTIONS.map((option) => (
                          <option key={option.value} value={option.value}>
                            {option.label}
                          </option>
                        ))}
                      </select>
                    ) : (
                      <span className={HOUSE_FIELD_HELPER_CLASS}>{roleDisplay}</span>
                    )}

                    {canManageAccess ? (
                      <div className="flex items-center gap-1">
                      {member.status === 'removed' ? (
                        isRestoring ? (
                          <>
                            <button
                              type="button"
                              className={cn(HOUSE_COLLABORATOR_ACTION_ICON_CLASS, HOUSE_COLLABORATOR_ACTION_ICON_CONFIRM_CLASS)}
                              onClick={() => onConfirmRestore(member)}
                              aria-label={`Confirm restore ${member.name}`}
                              disabled={busy}
                            >
                              <Check className="h-4 w-4" />
                            </button>
                            <button
                              type="button"
                              className={cn(HOUSE_COLLABORATOR_ACTION_ICON_CLASS, HOUSE_COLLABORATOR_ACTION_ICON_REMOVE_CLASS)}
                              onClick={() => setRestoreEditorKey(null)}
                              aria-label={`Cancel restore ${member.name}`}
                              disabled={busy}
                            >
                              <X className="h-4 w-4" />
                            </button>
                          </>
                        ) : (
                          <button
                            type="button"
                            className={cn(HOUSE_COLLABORATOR_ACTION_ICON_CLASS, HOUSE_COLLABORATOR_ACTION_ICON_RESTORE_CLASS)}
                            onClick={() => {
                              setRestoreEditorKey(member.key)
                              setRestoreEditorDraft(member.lastRole || member.role)
                              setRoleEditorKey(null)
                              setRemovalConfirmKey(null)
                            }}
                            aria-label={`Restore ${member.name}`}
                            disabled={busy}
                          >
                            <RotateCcw className="h-4 w-4" />
                          </button>
                        )
                      ) : member.status === 'pending' ? (
                        isEditingRole ? (
                          <>
                            <button
                              type="button"
                              className={cn(HOUSE_COLLABORATOR_ACTION_ICON_CLASS, HOUSE_COLLABORATOR_ACTION_ICON_CONFIRM_CLASS)}
                              onClick={() => void onSaveRoleChange(member)}
                              aria-label={`Confirm role change for ${member.name}`}
                              disabled={busy}
                            >
                              <Check className="h-4 w-4" />
                            </button>
                            <button
                              type="button"
                              className={cn(HOUSE_COLLABORATOR_ACTION_ICON_CLASS, HOUSE_COLLABORATOR_ACTION_ICON_REMOVE_CLASS)}
                              onClick={() => setRoleEditorKey(null)}
                              aria-label={`Cancel role change for ${member.name}`}
                              disabled={busy}
                            >
                              <X className="h-4 w-4" />
                            </button>
                          </>
                        ) : (
                          <>
                            <button
                              type="button"
                              className={cn(HOUSE_COLLABORATOR_ACTION_ICON_CLASS, HOUSE_COLLABORATOR_ACTION_ICON_EDIT_CLASS)}
                              onClick={() => {
                                setRoleEditorKey(member.key)
                                setRoleEditorDraft(member.role)
                                setRemovalConfirmKey(null)
                                setRestoreEditorKey(null)
                              }}
                              aria-label={`Edit pending role for ${member.name}`}
                              disabled={busy}
                            >
                              <Pencil className="h-4 w-4" />
                            </button>
                            <button
                              type="button"
                              className={cn(HOUSE_COLLABORATOR_ACTION_ICON_CLASS, HOUSE_COLLABORATOR_ACTION_ICON_REMOVE_CLASS)}
                              onClick={() => {
                                setRoleEditorKey(null)
                                setRemovalConfirmKey(null)
                                setRestoreEditorKey(null)
                                onCancelPending(member)
                              }}
                              aria-label={`Cancel invitation for ${member.name}`}
                              disabled={busy}
                            >
                              <X className="h-4 w-4" />
                            </button>
                          </>
                        )
                      ) : isEditingRole ? (
                        <>
                          <button
                            type="button"
                            className={cn(HOUSE_COLLABORATOR_ACTION_ICON_CLASS, HOUSE_COLLABORATOR_ACTION_ICON_CONFIRM_CLASS)}
                            onClick={() => void onSaveRoleChange(member)}
                            aria-label={`Confirm role change for ${member.name}`}
                            disabled={busy}
                          >
                            <Check className="h-4 w-4" />
                          </button>
                          <button
                            type="button"
                            className={cn(HOUSE_COLLABORATOR_ACTION_ICON_CLASS, HOUSE_COLLABORATOR_ACTION_ICON_REMOVE_CLASS)}
                            onClick={() => setRoleEditorKey(null)}
                            aria-label={`Cancel role change for ${member.name}`}
                            disabled={busy}
                          >
                            <X className="h-4 w-4" />
                          </button>
                        </>
                      ) : isRemoving ? (
                        <>
                          <button
                            type="button"
                            className={cn(HOUSE_COLLABORATOR_ACTION_ICON_CLASS, HOUSE_COLLABORATOR_ACTION_ICON_REMOVE_CLASS)}
                            onClick={() => setRemovalConfirmKey(null)}
                            aria-label={`Cancel remove ${member.name}`}
                            disabled={busy}
                          >
                            <X className="h-4 w-4" />
                          </button>
                          <button
                            type="button"
                            className={cn(HOUSE_COLLABORATOR_ACTION_ICON_CLASS, HOUSE_COLLABORATOR_ACTION_ICON_CONFIRM_CLASS)}
                            onClick={() => void onConfirmRemove(member)}
                            aria-label={`Confirm remove ${member.name}`}
                            disabled={busy}
                          >
                            <Check className="h-4 w-4" />
                          </button>
                        </>
                      ) : (
                        <>
                          <button
                            type="button"
                            className={cn(HOUSE_COLLABORATOR_ACTION_ICON_CLASS, HOUSE_COLLABORATOR_ACTION_ICON_EDIT_CLASS)}
                            onClick={() => {
                              setRoleEditorKey(member.key)
                              setRoleEditorDraft(member.role)
                              setRemovalConfirmKey(null)
                              setRestoreEditorKey(null)
                            }}
                            aria-label={`Edit role for ${member.name}`}
                            disabled={busy}
                          >
                            <Pencil className="h-4 w-4" />
                          </button>
                          <button
                            type="button"
                            className={cn(HOUSE_COLLABORATOR_ACTION_ICON_CLASS, HOUSE_COLLABORATOR_ACTION_ICON_REMOVE_CLASS)}
                            onClick={() => {
                              setRemovalConfirmKey(member.key)
                              setRoleEditorKey(null)
                              setRestoreEditorKey(null)
                            }}
                            aria-label={`Remove ${member.name}`}
                            disabled={busy}
                          >
                            <UserMinus className="h-4 w-4" />
                          </button>
                        </>
                      )}
                      </div>
                    ) : (
                      <span className="inline-block h-8 w-[4.375rem]" aria-hidden="true" />
                    )}
                  </div>
                </div>
              )
            })}
            {canManageAccess ? (
              <div className="flex justify-end pt-0.5">
                <button
                  type="button"
                  className={cn(
                    HOUSE_COLLABORATOR_ACTION_ICON_CLASS,
                    addCollaboratorOpen ? HOUSE_COLLABORATOR_ACTION_ICON_REMOVE_CLASS : HOUSE_COLLABORATOR_ACTION_ICON_ADD_CLASS,
                  )}
                  onClick={() => {
                    setAddCollaboratorOpen((current) => !current)
                    setError('')
                    setStatus('')
                  }}
                  aria-label="Toggle add collaborator"
                  disabled={busy}
                >
                  {addCollaboratorOpen ? <X className="h-4 w-4" /> : <UserPlus className="h-4 w-4" />}
                </button>
              </div>
            ) : null}
          </div>

          {canManageAccess && addCollaboratorOpen ? (
            <div className="space-y-1.5">
              <Input
                value={addCollaboratorName}
                onChange={(event) => setAddCollaboratorName(event.target.value)}
                placeholder="Search by name"
                className={HOUSE_INPUT_CLASS}
              />
              <select
                value={addCollaboratorRole}
                onChange={(event) => setAddCollaboratorRole(toRoleValue(event.target.value))}
                className={cn('h-8 min-w-sz-130 rounded-md px-2 text-xs', HOUSE_SELECT_CLASS)}
              >
                {DATA_LIBRARY_ROLE_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
              <div className="flex justify-end">
                <Button
                  type="button"
                  className={cn(HOUSE_PRIMARY_ACTION_BUTTON_CLASS, HOUSE_BUTTON_TEXT_CLASS)}
                  onClick={onAddCollaborator}
                  disabled={!normalizeName(addCollaboratorName) || busy}
                >
                  Send invite
                </Button>
              </div>
            </div>
          ) : null}
        </div>
      ) : null}

      {activeTab === 'logs' ? (
        <div className="space-y-2">
          <div className={cn(HOUSE_SECTION_TOOLS_CLASS, HOUSE_SECTION_TOOLS_DATA_CLASS, HOUSE_ACTIONS_PILL_CLASS, 'flex-wrap')}>
            <select
              value={auditExportRange}
              onChange={(event) => setAuditExportRange(event.target.value as 'all' | '7d' | '30d' | '90d' | 'custom')}
              className={cn('h-8 min-w-sz-110 rounded-md px-2 text-xs', HOUSE_SELECT_CLASS)}
              aria-label="Select export date range"
            >
              <option value="all">All dates</option>
              <option value="7d">Last 7 days</option>
              <option value="30d">Last 30 days</option>
              <option value="90d">Last 90 days</option>
              <option value="custom">Custom range</option>
            </select>
            <select
              value={auditExportCollaboratorKey}
              onChange={(event) => setAuditExportCollaboratorKey(event.target.value)}
              className={cn('h-8 min-w-sz-120 rounded-md px-2 text-xs', HOUSE_SELECT_CLASS)}
              aria-label="Select collaborator for export"
            >
              {auditExportCollaboratorOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
            {auditExportRange === 'custom' ? (
              <>
                <Input
                  type="date"
                  value={auditExportFromDate}
                  onChange={(event) => setAuditExportFromDate(event.target.value)}
                  className={cn(HOUSE_INPUT_CLASS, 'h-8 min-w-sz-110 text-xs')}
                  aria-label="Export start date"
                />
                <Input
                  type="date"
                  value={auditExportToDate}
                  onChange={(event) => setAuditExportToDate(event.target.value)}
                  className={cn(HOUSE_INPUT_CLASS, 'h-8 min-w-sz-110 text-xs')}
                  aria-label="Export end date"
                />
              </>
            ) : null}
            <Button
              type="button"
              className={cn('h-8 gap-1.5 px-3', HOUSE_ACTIONS_PILL_PRIMARY_CLASS, HOUSE_SECTION_TOOL_BUTTON_CLASS)}
              onClick={onExportAuditLogs}
            >
              <Download className="h-3.5 w-3.5" />
              Export
            </Button>
          </div>

          <div
            className={HOUSE_DRILLDOWN_TAB_LIST_CLASS}
            style={{ gridTemplateColumns: `repeat(${DATA_LIBRARY_AUDIT_FILTER_OPTIONS.length}, minmax(0, 1fr))` }}
          >
            {DATA_LIBRARY_AUDIT_FILTER_OPTIONS.map((option) => (
              <button
                key={option.value}
                type="button"
                className={HOUSE_DRILLDOWN_TAB_TRIGGER_CLASS}
                data-state={auditFilter === option.value ? 'active' : 'inactive'}
                onClick={() => setAuditFilter(option.value)}
                aria-label={`Filter logs by ${option.label}`}
              >
                {option.label}
              </button>
            ))}
          </div>

          {auditLogLoading ? (
            <p className={HOUSE_FIELD_HELPER_CLASS}>Loading logs...</p>
          ) : groupedAuditEntries.length === 0 ? (
            <p className={HOUSE_FIELD_HELPER_CLASS}>No entries.</p>
          ) : (
            <div className="space-y-1.5">
              {groupedAuditEntries.map((group) => {
                const expanded = auditGroupExpandedByKey[group.key] ?? true
                return (
                  <div
                    key={`${selectedAsset.id}-${group.key}`}
                    className={HOUSE_DRILLDOWN_COLLAPSIBLE_ENTITY_CLASS}
                    data-state={expanded ? 'open' : 'closed'}
                  >
                    <button
                      type="button"
                      className="flex w-full items-center justify-between gap-2 px-2 py-1.5 text-left"
                      onClick={() =>
                        setAuditGroupExpandedByKey((current) => ({
                          ...current,
                          [group.key]: !expanded,
                        }))
                      }
                      aria-expanded={expanded}
                      aria-label={`Toggle ${group.name} logs`}
                    >
                      <span className={cn(HOUSE_TEXT_CLASS, 'font-medium')}>{group.name}</span>
                      <span className="inline-flex items-center gap-1">
                        <span className={HOUSE_FIELD_HELPER_CLASS}>{group.entries.length}</span>
                        {expanded ? (
                          <ChevronUp className="h-4 w-4 text-muted-foreground" />
                        ) : (
                          <ChevronDown className="h-4 w-4 text-muted-foreground" />
                        )}
                      </span>
                    </button>
                    {expanded ? (
                      <div className="border-t border-border/50">
                        {group.entries.map((entry, index) => (
                          <div
                            key={entry.id}
                            className={cn(
                              'flex items-center justify-between gap-2 px-2 py-1.5',
                              index > 0 ? 'border-t border-border/40' : '',
                            )}
                          >
                            <div className="flex flex-wrap items-center gap-1.5">
                              {entry.fromLabel ? (
                                <span className={auditPillClass(entry.fromLabel)}>{entry.fromLabel}</span>
                              ) : null}
                              {entry.fromLabel ? (
                                <ArrowRight className="h-3.5 w-3.5 text-muted-foreground" />
                              ) : null}
                              <span className={auditPillClass(entry.toLabel)}>{entry.toLabel}</span>
                            </div>
                            <span className={HOUSE_FIELD_HELPER_CLASS}>{formatCompactTimestamp(entry.createdAt)}</span>
                          </div>
                        ))}
                      </div>
                    ) : null}
                  </div>
                )
              })}
            </div>
          )}
        </div>
      ) : null}
    </div>
  )
}
