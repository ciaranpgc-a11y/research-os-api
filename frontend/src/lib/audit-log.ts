import type { WorkspaceAuditLogEntry } from '@/store/use-workspace-store'
import type { LibraryAssetAuditEntry } from '@/types/study-core'

export type AuditTransitionKind =
  | 'access_status'
  | 'invitation_status'
  | 'role'
  | 'pending_role'
  | 'asset_activity'

export type ParsedAuditTransition = {
  subject: string
  fromRawValue: string
  toRawValue: string
  fromValue: string
  toValue: string
  actorName: string
  sectionLabel: string
  transitionKind: AuditTransitionKind
  roleDetail: string | null
}

export type AuditTransitionPillPresentation = {
  fromLabel: string | null
  toLabel: string
  fromRawValue: string | null
  toRawValue: string
  showArrow: boolean
}

export type AuditLogPillTone = 'positive' | 'pending' | 'negative' | 'neutral'

type AuditRoleLabelResolver = (role: string) => string

function normalizeWhitespace(value: string | null | undefined): string {
  return String(value || '').trim().replace(/\s+/g, ' ')
}

function normalizePerson(value: string | null | undefined): string {
  return normalizeWhitespace(value).toLowerCase()
}

function humanizeRawAuditValue(value: string | null | undefined): string {
  const clean = normalizeWhitespace(value)
  if (!clean) {
    return ''
  }
  return clean.replace(/_/g, ' ').replace(/\b\w/g, (match) => match.toUpperCase())
}

function normalizeAuditActorDisplayName(actorName: string): string {
  return normalizeWhitespace(actorName).replace(/\s+\(owner\)$/i, '')
}

function formatAuditTransitionDisplayValue(
  transition: ParsedAuditTransition,
  rawValue: string,
  displayValue: string,
): string {
  void transition
  const raw = normalizeWhitespace(rawValue).toLowerCase()
  if (raw === 'accepted') {
    return 'Active'
  }
  if (raw === 'cancelled') {
    return 'Cancelled'
  }
  if (raw === 'revoked') {
    return 'Removed'
  }
  return displayValue
}

function roleAwareStatusLabel(
  rawValue: string,
  displayValue: string,
  roleDetail: string | null,
): string {
  const raw = normalizeWhitespace(rawValue).toLowerCase()
  if (roleDetail && (raw === 'pending' || raw === 'active' || raw === 'accepted')) {
    return roleDetail
  }
  return displayValue
}

function resolveWorkspaceRoleLabel(
  role: string | null | undefined,
  roleLabel: AuditRoleLabelResolver,
): string | null {
  const clean = normalizeWhitespace(role)
  if (!clean) {
    return null
  }
  return roleLabel(clean)
}

function resolveLibraryAssetRoleLabel(role: string | null | undefined): string | null {
  const clean = normalizeWhitespace(role)
  if (!clean) {
    return null
  }
  return humanizeAuditValue(clean)
}

function resolveLibraryAssetActivityLabel(
  entry: LibraryAssetAuditEntry,
): { fromRawValue: string; fromValue: string; toRawValue: string; toValue: string } {
  const cleanFrom = normalizeWhitespace(entry.from_value).toLowerCase()
  const cleanTo = normalizeWhitespace(entry.to_value).toLowerCase()
  const fromValue = humanizeAuditValue(entry.from_value, '')
  const toValue = humanizeAuditValue(entry.to_value, '')

  switch (entry.event_type) {
    case 'asset_uploaded':
      return {
        fromRawValue: '',
        fromValue: '',
        toRawValue: 'uploaded',
        toValue: 'Uploaded',
      }
    case 'asset_downloaded':
      return {
        fromRawValue: '',
        fromValue: '',
        toRawValue: 'downloaded',
        toValue: 'Downloaded',
      }
    case 'asset_locked':
      return {
        fromRawValue: '',
        fromValue: '',
        toRawValue: 'locked',
        toValue: 'Locked',
      }
    case 'asset_unlocked':
      return {
        fromRawValue: '',
        fromValue: '',
        toRawValue: 'unlocked',
        toValue: 'Unlocked',
      }
    case 'asset_workspace_linked': {
      const workspaceName = toValue || humanizeAuditValue(cleanTo, 'Workspace')
      return {
        fromRawValue: 'none',
        fromValue: 'None',
        toRawValue: 'linked',
        toValue: `Added to ${workspaceName}`,
      }
    }
    case 'asset_workspace_unlinked': {
      const workspaceName = fromValue || humanizeAuditValue(cleanFrom, 'Workspace')
      return {
        fromRawValue: 'none',
        fromValue: 'None',
        toRawValue: 'unlinked',
        toValue: `Removed from ${workspaceName}`,
      }
    }
    case 'asset_renamed':
      return {
        fromRawValue: cleanFrom,
        fromValue: fromValue || 'Unknown',
        toRawValue: cleanTo,
        toValue: toValue || 'Unknown',
      }
    default:
      return {
        fromRawValue: cleanFrom,
        fromValue,
        toRawValue: cleanTo,
        toValue: toValue || humanizeAuditValue(entry.event_type, 'Unknown'),
      }
  }
}

export function humanizeAuditValue(
  value: string | null | undefined,
  fallback = 'Unknown',
): string {
  const clean = humanizeRawAuditValue(value)
  return clean || fallback
}

export function formatAuditCompactTimestamp(value: string): string {
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

export function auditTimestampMs(value: string): number {
  const parsed = Date.parse(value)
  if (Number.isNaN(parsed)) {
    return 0
  }
  return parsed
}

export function compareAuditActorNames(left: string, right: string): number {
  return left.localeCompare(right, undefined, { sensitivity: 'base' })
}

export function formatAuditActorHeaderName(
  actorName: string,
  currentViewerName?: string | null,
): string {
  const clean = normalizeAuditActorDisplayName(actorName)
  if (!clean) {
    return 'System'
  }
  if (normalizePerson(clean) && normalizePerson(clean) === normalizePerson(currentViewerName || null)) {
    return 'You'
  }
  return clean
}

export function auditActorKey(actorName: string): string {
  return normalizeWhitespace(actorName).toLowerCase() || 'system'
}

export function formatAuditMessageForViewer(
  message: string,
  currentViewerName?: string | null,
): string {
  const cleanMessage = normalizeWhitespace(message)
  if (!cleanMessage) {
    return message
  }
  const byMatch = cleanMessage.match(/\bby (.*?)\.(\s|$)/i)
  if (!byMatch) {
    return cleanMessage
  }
  const actorName = normalizeAuditActorDisplayName(byMatch[1] || '')
  if (!actorName || normalizePerson(actorName) !== normalizePerson(currentViewerName || null)) {
    return cleanMessage
  }
  return cleanMessage.replace(/\bby (.*?)\.(\s|$)/i, (_match, _actor, suffix) => `by you.${suffix || ''}`)
}

export function buildAuditTransitionPillPresentation(
  transition: ParsedAuditTransition,
): AuditTransitionPillPresentation {
  if (transition.transitionKind === 'pending_role') {
    return {
      fromLabel: transition.fromValue,
      toLabel: transition.toValue,
      fromRawValue: 'pending',
      toRawValue: 'pending',
      showArrow: true,
    }
  }

  if (transition.transitionKind === 'role') {
    return {
      fromLabel: transition.fromValue,
      toLabel: transition.toValue,
      fromRawValue: 'active',
      toRawValue: 'active',
      showArrow: true,
    }
  }

  if (transition.roleDetail) {
    const fromBaseLabel = formatAuditTransitionDisplayValue(
      transition,
      transition.fromRawValue,
      transition.fromValue,
    )
    const toBaseLabel = formatAuditTransitionDisplayValue(
      transition,
      transition.toRawValue,
      transition.toValue,
    )
    const fromLabel = roleAwareStatusLabel(
      transition.fromRawValue,
      fromBaseLabel,
      transition.roleDetail,
    )
    const toLabel = roleAwareStatusLabel(
      transition.toRawValue,
      toBaseLabel,
      transition.roleDetail,
    )

    if (
      transition.fromRawValue === 'none'
      || !transition.fromRawValue
      || (transition.fromRawValue === transition.toRawValue && fromLabel === toLabel)
    ) {
      return {
        fromLabel: null,
        toLabel,
        fromRawValue: null,
        toRawValue: transition.toRawValue,
        showArrow: false,
      }
    }

    return {
      fromLabel,
      toLabel,
      fromRawValue: transition.fromRawValue,
      toRawValue: transition.toRawValue,
      showArrow: true,
    }
  }

  const fromLabel = formatAuditTransitionDisplayValue(
    transition,
    transition.fromRawValue,
    transition.fromValue,
  )
  const toLabel = formatAuditTransitionDisplayValue(
    transition,
    transition.toRawValue,
    transition.toValue,
  )
  if (
    transition.fromRawValue === 'none'
    || !transition.fromRawValue
    || transition.fromRawValue === transition.toRawValue
  ) {
    return {
      fromLabel: null,
      toLabel,
      fromRawValue: null,
      toRawValue: transition.toRawValue,
      showArrow: false,
    }
  }
  return {
    fromLabel,
    toLabel,
    fromRawValue: transition.fromRawValue,
    toRawValue: transition.toRawValue,
    showArrow: true,
  }
}

export function auditTransitionPillTone(
  transition: ParsedAuditTransition,
  rawValue: string,
): AuditLogPillTone {
  const raw = normalizeWhitespace(rawValue).toLowerCase()
  if (raw === 'pending') {
    return 'pending'
  }
  if (
    raw === 'active'
    || raw === 'accepted'
    || raw === 'unlocked'
    || raw === 'uploaded'
    || raw === 'downloaded'
    || raw === 'editor'
    || raw === 'owner'
    || raw === 'linked'
    || raw === 'granted'
  ) {
    return 'positive'
  }
  if (
    raw === 'removed'
    || raw === 'declined'
    || raw === 'cancelled'
    || raw === 'locked'
    || raw === 'revoked'
    || raw === 'unlinked'
  ) {
    return 'negative'
  }
  if (transition.transitionKind === 'invitation_status' && raw === 'accepted') {
    return 'positive'
  }
  return 'neutral'
}

export function parseWorkspaceAuditTransition(
  entry: WorkspaceAuditLogEntry | string,
  options?: {
    roleLabel?: AuditRoleLabelResolver
  },
): ParsedAuditTransition | null {
  const roleLabel = options?.roleLabel ?? ((role) => humanizeAuditValue(role))

  if (typeof entry !== 'string' && entry.eventType) {
    const subject = normalizeWhitespace(entry.subjectName) || 'Workspace'
    const actorName = normalizeWhitespace(entry.actorName) || 'Unknown user'
    const fromRawValue = normalizeWhitespace(entry.fromValue).toLowerCase()
    const toRawValue = normalizeWhitespace(entry.toValue).toLowerCase()
    const fromValue = humanizeAuditValue(entry.fromValue)
    const toValue = humanizeAuditValue(entry.toValue)

    switch (entry.eventType) {
      case 'member_invited':
      case 'member_reinvited':
      case 'member_removed':
      case 'invitation_accepted':
      case 'invitation_declined':
      case 'invitation_cancelled':
        return {
          subject,
          fromRawValue,
          toRawValue,
          fromValue,
          toValue,
          actorName,
          sectionLabel:
            entry.eventType === 'member_invited'
            || entry.eventType === 'member_reinvited'
            || entry.eventType === 'invitation_cancelled'
            || entry.eventType === 'invitation_accepted'
            || entry.eventType === 'invitation_declined'
              ? 'Invitation status'
              : 'Access status',
          transitionKind:
            entry.eventType === 'member_invited'
            || entry.eventType === 'member_reinvited'
            || entry.eventType === 'invitation_cancelled'
            || entry.eventType === 'invitation_accepted'
            || entry.eventType === 'invitation_declined'
              ? 'invitation_status'
              : 'access_status',
          roleDetail: resolveWorkspaceRoleLabel(entry.role, roleLabel),
        }
      case 'member_role_changed':
      case 'pending_role_changed':
        return {
          subject,
          fromRawValue,
          toRawValue,
          fromValue,
          toValue,
          actorName,
          sectionLabel: entry.eventType === 'pending_role_changed' ? 'Pending role' : 'Role',
          transitionKind: entry.eventType === 'pending_role_changed' ? 'pending_role' : 'role',
          roleDetail: null,
        }
      case 'workspace_locked':
      case 'workspace_unlocked':
      case 'workspace_renamed':
        return {
          subject,
          fromRawValue,
          toRawValue,
          fromValue,
          toValue,
          actorName,
          sectionLabel: 'Workspace',
          transitionKind: 'access_status',
          roleDetail: null,
        }
      default:
        break
    }
  }

  const cleanMessage = normalizeWhitespace(typeof entry === 'string' ? entry : entry.message)
  if (!cleanMessage) {
    return null
  }

  const statusMatch = cleanMessage.match(
    /^(.*?) collaborator(?: invitation)? status switched from ([a-z_]+) to ([a-z_]+) by (.*?)(?: as ([a-z_]+))?\.(?: Role set to ([a-z_]+)\.)?$/i,
  )
  if (statusMatch) {
    const subject = normalizeWhitespace(statusMatch[1]) || 'Collaborator'
    const fromRawValue = normalizeWhitespace(statusMatch[2]).toLowerCase()
    const toRawValue = normalizeWhitespace(statusMatch[3]).toLowerCase()
    const fromValue = humanizeAuditValue(fromRawValue)
    const toValue = humanizeAuditValue(toRawValue)
    const actorName = normalizeWhitespace(statusMatch[4]) || 'Unknown user'
    const roleDetailSource = statusMatch[6] || statusMatch[5] || ''
    const roleDetail = roleDetailSource ? humanizeAuditValue(roleDetailSource) : null
    const isInvitationStatus = cleanMessage.toLowerCase().includes('invitation status')
    return {
      subject,
      fromRawValue,
      toRawValue,
      fromValue,
      toValue,
      actorName,
      sectionLabel: isInvitationStatus ? 'Invitation status' : 'Access status',
      transitionKind: isInvitationStatus ? 'invitation_status' : 'access_status',
      roleDetail,
    }
  }

  const roleMatch = cleanMessage.match(
    /^(.*?) (pending )?collaborator role switched from ([a-z_]+) to ([a-z_]+) by (.*?)\.$/i,
  )
  if (roleMatch) {
    const subject = normalizeWhitespace(roleMatch[1]) || 'Collaborator'
    const isPendingRole = Boolean(normalizeWhitespace(roleMatch[2]))
    const fromRawValue = normalizeWhitespace(roleMatch[3]).toLowerCase()
    const toRawValue = normalizeWhitespace(roleMatch[4]).toLowerCase()
    const fromValue = humanizeAuditValue(fromRawValue)
    const toValue = humanizeAuditValue(toRawValue)
    const actorName = normalizeWhitespace(roleMatch[5]) || 'Unknown user'
    return {
      subject,
      fromRawValue,
      toRawValue,
      fromValue,
      toValue,
      actorName,
      sectionLabel: isPendingRole ? 'Pending role' : 'Role',
      transitionKind: isPendingRole ? 'pending_role' : 'role',
      roleDetail: null,
    }
  }

  return null
}

export function parseLibraryAssetAuditTransition(
  entry: LibraryAssetAuditEntry | string,
): ParsedAuditTransition | null {
  if (typeof entry !== 'string' && entry.event_type) {
    const actorName = normalizeWhitespace(entry.actor_name) || 'Unknown user'
    const subject = normalizeWhitespace(entry.subject_name || entry.subject_user_id) || 'User'

    if (entry.event_type === 'pending_access_role_changed') {
      return {
        subject,
        fromRawValue: normalizeWhitespace(entry.from_value).toLowerCase() || 'viewer',
        toRawValue: normalizeWhitespace(entry.to_value).toLowerCase() || 'viewer',
        fromValue: humanizeAuditValue(entry.from_value),
        toValue: humanizeAuditValue(entry.to_value),
        actorName,
        sectionLabel: 'Pending role',
        transitionKind: 'pending_role',
        roleDetail: null,
      }
    }

    if (entry.event_type === 'access_role_changed') {
      return {
        subject,
        fromRawValue: normalizeWhitespace(entry.from_value).toLowerCase() || 'viewer',
        toRawValue: normalizeWhitespace(entry.to_value).toLowerCase() || 'viewer',
        fromValue: humanizeAuditValue(entry.from_value),
        toValue: humanizeAuditValue(entry.to_value),
        actorName,
        sectionLabel: 'Role',
        transitionKind: 'role',
        roleDetail: null,
      }
    }

    if (entry.event_type === 'access_granted') {
      const grantedRoleLabel = resolveLibraryAssetRoleLabel(entry.role || entry.to_value)
      const grantedFromRawValue = normalizeWhitespace(entry.from_value).toLowerCase()
      if (grantedFromRawValue === 'pending') {
        return {
          subject,
          fromRawValue: 'pending',
          toRawValue: 'accepted',
          fromValue: 'Pending',
          toValue: 'Accepted',
          actorName,
          sectionLabel: 'Invitation status',
          transitionKind: 'invitation_status',
          roleDetail: grantedRoleLabel,
        }
      }
      return {
        subject,
        fromRawValue: 'none',
        toRawValue: 'active',
        fromValue: 'None',
        toValue: 'Active',
        actorName,
        sectionLabel: 'Access status',
        transitionKind: 'access_status',
        roleDetail: grantedRoleLabel,
      }
    }

    if (entry.event_type === 'access_revoked') {
      return {
        subject,
        fromRawValue: 'active',
        toRawValue: 'revoked',
        fromValue: 'Active',
        toValue: 'Removed',
        actorName,
        sectionLabel: 'Access status',
        transitionKind: 'access_status',
        roleDetail: resolveLibraryAssetRoleLabel(entry.role || entry.from_value),
      }
    }

    if (
      entry.event_type === 'access_invited'
      || entry.event_type === 'access_invitation_cancelled'
      || entry.event_type === 'access_invitation_accepted'
      || entry.event_type === 'access_invitation_declined'
    ) {
      return {
        subject,
        fromRawValue: normalizeWhitespace(entry.from_value).toLowerCase() || 'none',
        toRawValue: normalizeWhitespace(entry.to_value).toLowerCase() || 'pending',
        fromValue: humanizeAuditValue(entry.from_value, 'None'),
        toValue: humanizeAuditValue(entry.to_value, 'Pending'),
        actorName,
        sectionLabel: 'Invitation status',
        transitionKind: 'invitation_status',
        roleDetail: resolveLibraryAssetRoleLabel(entry.role),
      }
    }

    if (
      entry.event_type === 'asset_uploaded'
      || entry.event_type === 'asset_renamed'
      || entry.event_type === 'asset_downloaded'
      || entry.event_type === 'asset_locked'
      || entry.event_type === 'asset_unlocked'
      || entry.event_type === 'asset_workspace_linked'
      || entry.event_type === 'asset_workspace_unlinked'
    ) {
      const activity = resolveLibraryAssetActivityLabel(entry)
      return {
        subject: 'File',
        fromRawValue: activity.fromRawValue,
        toRawValue: activity.toRawValue,
        fromValue: activity.fromValue,
        toValue: activity.toValue,
        actorName,
        sectionLabel: 'File',
        transitionKind: 'asset_activity',
        roleDetail: null,
      }
    }
  }

  return null
}
