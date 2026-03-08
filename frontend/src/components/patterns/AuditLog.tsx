import type { ReactNode } from 'react'
import { ArrowRight, ChevronDown, ChevronUp } from 'lucide-react'

import { houseCollaborators, houseDrilldown, houseTypography } from '@/lib/house-style'
import {
  auditTransitionPillTone,
  buildAuditTransitionPillPresentation,
  type AuditLogPillTone,
  type ParsedAuditTransition,
} from '@/lib/audit-log'
import { cn } from '@/lib/utils'

const HOUSE_FIELD_HELPER_CLASS = houseTypography.fieldHelper
const HOUSE_TEXT_CLASS = houseTypography.text
const HOUSE_COLLABORATOR_CHIP_CLASS = houseCollaborators.chip
const HOUSE_COLLABORATOR_CHIP_ACTIVE_CLASS = houseCollaborators.chipActive
const HOUSE_COLLABORATOR_CHIP_PENDING_CLASS = houseCollaborators.chipPending
const HOUSE_COLLABORATOR_CHIP_REMOVED_CLASS = houseCollaborators.chipRemoved
const HOUSE_DRILLDOWN_COLLAPSIBLE_ENTITY_CLASS = houseDrilldown.collapsibleEntity

function auditLogToneClassName(tone: AuditLogPillTone): string {
  if (tone === 'positive') {
    return cn(HOUSE_COLLABORATOR_CHIP_CLASS, HOUSE_COLLABORATOR_CHIP_ACTIVE_CLASS)
  }
  if (tone === 'pending') {
    return cn(HOUSE_COLLABORATOR_CHIP_CLASS, HOUSE_COLLABORATOR_CHIP_PENDING_CLASS)
  }
  if (tone === 'negative') {
    return cn(HOUSE_COLLABORATOR_CHIP_CLASS, HOUSE_COLLABORATOR_CHIP_REMOVED_CLASS)
  }
  return cn(HOUSE_COLLABORATOR_CHIP_CLASS, 'border-border/70 bg-background/80 text-foreground')
}

type AuditLogGroupProps = {
  title: string
  count: number
  expanded: boolean
  onToggle: () => void
  ariaLabel: string
  children: ReactNode
  className?: string
}

export function AuditLogGroup({
  title,
  count,
  expanded,
  onToggle,
  ariaLabel,
  children,
  className,
}: AuditLogGroupProps) {
  return (
    <div
      className={cn(
        'rounded-md border border-border/60 bg-background/70',
        HOUSE_DRILLDOWN_COLLAPSIBLE_ENTITY_CLASS,
        className,
      )}
      data-state={expanded ? 'open' : 'closed'}
    >
      <button
        type="button"
        className="flex w-full items-center justify-between gap-2 px-2 py-1.5 text-left"
        onClick={onToggle}
        aria-expanded={expanded}
        aria-label={ariaLabel}
      >
        <p className={cn(HOUSE_TEXT_CLASS, 'font-medium')}>{title}</p>
        <span className="inline-flex items-center gap-1.5">
          <span className={HOUSE_FIELD_HELPER_CLASS}>{count}</span>
          {expanded ? (
            <ChevronUp className="h-4 w-4 text-muted-foreground" />
          ) : (
            <ChevronDown className="h-4 w-4 text-muted-foreground" />
          )}
        </span>
      </button>
      {expanded ? <div className="border-t border-border/50">{children}</div> : null}
    </div>
  )
}

type AuditLogMessageRowProps = {
  message: ReactNode
  timestamp: string
  className?: string
}

export function AuditLogMessageRow({
  message,
  timestamp,
  className,
}: AuditLogMessageRowProps) {
  return (
    <div className={cn('px-3 py-2', className)}>
      <div className="flex items-center justify-between gap-2">
        <p className={HOUSE_TEXT_CLASS}>{message}</p>
        <span className={HOUSE_FIELD_HELPER_CLASS}>{timestamp}</span>
      </div>
    </div>
  )
}

type AuditLogTransitionRowProps = {
  transition: ParsedAuditTransition
  timestamp: string
  className?: string
}

export function AuditLogTransitionRow({
  transition,
  timestamp,
  className,
}: AuditLogTransitionRowProps) {
  const transitionPills = buildAuditTransitionPillPresentation(transition)
  const fromValueClass =
    transitionPills.fromRawValue && transitionPills.fromLabel
      ? auditLogToneClassName(
          auditTransitionPillTone(
            transition,
            transitionPills.fromRawValue,
          ),
        )
      : ''
  const toValueClass = auditLogToneClassName(
    auditTransitionPillTone(transition, transitionPills.toRawValue),
  )

  return (
    <div className={cn('px-3 py-2', className)}>
      <div className="flex items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-1.5 text-xs">
          {transitionPills.fromLabel && transitionPills.fromRawValue ? (
            <span className={fromValueClass}>{transitionPills.fromLabel}</span>
          ) : null}
          {transitionPills.showArrow && transitionPills.fromLabel ? (
            <ArrowRight className="h-3.5 w-3.5 text-muted-foreground" />
          ) : null}
          <span className={toValueClass}>{transitionPills.toLabel}</span>
        </div>
        <span className={HOUSE_FIELD_HELPER_CLASS}>{timestamp}</span>
      </div>
    </div>
  )
}
