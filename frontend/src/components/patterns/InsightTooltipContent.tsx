import * as React from 'react'

import { houseDividers, houseTypography } from '@/lib/house-style'
import { cn } from '@/lib/utils'

export type InsightTooltipSection = {
  key?: string
  label: string
  content: React.ReactNode
}

export type InsightTooltipFact = {
  key?: string
  label: React.ReactNode
  value: React.ReactNode
}

export type InsightTooltipContentProps = {
  summaryLabel?: string
  summaryValue?: React.ReactNode
  sections?: InsightTooltipSection[]
  facts?: InsightTooltipFact[]
  factsLabel?: string
  note?: React.ReactNode
  noteTone?: 'neutral' | 'warning'
  className?: string
}

export function InsightTooltipContent({
  summaryLabel,
  summaryValue,
  sections = [],
  facts = [],
  factsLabel = 'Current signals',
  note,
  noteTone = 'neutral',
  className,
}: InsightTooltipContentProps) {
  const visibleSections = sections.filter((section) => section.content !== null && section.content !== undefined && section.content !== false)
  const hasFacts = facts.length > 0

  return (
    <div className={cn('space-y-2.5', className)}>
      {summaryValue ? (
        <div className="rounded-[0.75rem] border border-[hsl(var(--stroke-soft)/0.9)] bg-[hsl(var(--tone-surface-100)/0.92)] px-2.5 py-2">
          {summaryLabel ? (
            <div className="flex items-center gap-2">
              <p className={cn(houseTypography.h2, 'shrink-0 text-[hsl(var(--tone-neutral-700))]')}>
                {summaryLabel}
              </p>
              <span aria-hidden="true" className={cn(houseDividers.fillSoft, 'h-px flex-1 opacity-90')} />
            </div>
          ) : null}
          <div className="mt-1 text-sm font-semibold leading-snug text-[hsl(var(--tone-neutral-900))]">
            {summaryValue}
          </div>
        </div>
      ) : null}

      {visibleSections.map((section, index) => (
        <div
          key={section.key ?? `${section.label}-${index}`}
          className={cn('space-y-1.5', index > 0 && 'pt-0.5')}
        >
          <div className="flex items-center gap-2">
            <p className={cn(houseTypography.h2, 'shrink-0 text-[hsl(var(--tone-neutral-700))]')}>
              {section.label}
            </p>
            <span aria-hidden="true" className={cn(houseDividers.fillSoft, 'h-px flex-1 opacity-90')} />
          </div>
          <div className="space-y-1 text-[hsl(var(--tone-neutral-700))]">
            {section.content}
          </div>
        </div>
      ))}

      {hasFacts ? (
        <div className={cn('space-y-1.5', (summaryValue || visibleSections.length > 0) && 'pt-0.5')}>
          <div className="flex items-center gap-2">
            <p className={cn(houseTypography.h2, 'shrink-0 text-[hsl(var(--tone-neutral-700))]')}>
              {factsLabel}
            </p>
            <span aria-hidden="true" className={cn(houseDividers.fillSoft, 'h-px flex-1 opacity-90')} />
          </div>
          <dl className="space-y-1.5">
            {facts.map((fact, index) => (
              <div
                key={fact.key ?? `${String(fact.label)}-${index}`}
                className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-x-3"
              >
                <dt className="text-[hsl(var(--tone-neutral-500))]">{fact.label}</dt>
                <dd className="text-right font-medium text-[hsl(var(--tone-neutral-900))]">{fact.value}</dd>
              </div>
            ))}
          </dl>
        </div>
      ) : null}

      {note ? (
        <div
          className={cn(
            'rounded-[0.75rem] border px-2.5 py-2',
            noteTone === 'warning'
              ? 'border-[hsl(var(--tone-warning-200)/0.95)] bg-[hsl(var(--tone-warning-50)/0.96)] text-[hsl(var(--tone-neutral-800))]'
              : 'border-[hsl(var(--stroke-soft)/0.86)] bg-[hsl(var(--tone-surface-100)/0.92)] text-[hsl(var(--tone-neutral-700))]',
          )}
        >
          {note}
        </div>
      ) : null}
    </div>
  )
}
