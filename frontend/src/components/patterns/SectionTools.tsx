import * as React from 'react'

import { cn } from '@/lib/utils'

export type SectionToolsTone = 'default' | 'publications' | 'workspace' | 'data'

const toneClassByTone: Record<SectionToolsTone, string | null> = {
  default: null,
  publications: 'house-section-tools-publications',
  workspace: 'house-section-tools-workspace',
  data: 'house-section-tools-data',
}

export type SectionToolsProps = React.HTMLAttributes<HTMLDivElement> & {
  tone?: SectionToolsTone
  framed?: boolean
}

export const SectionTools = React.forwardRef<HTMLDivElement, SectionToolsProps>(
  ({ className, tone = 'default', framed = true, ...props }, ref) => (
    <div
      ref={ref}
      data-ui="section-tools"
      data-house-role="section-tools"
      className={cn('house-section-tools', !framed && 'house-section-tools-borderless', toneClassByTone[tone], className)}
      {...props}
    />
  ),
)

SectionTools.displayName = 'SectionTools'

export function SectionToolDivider({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('house-publications-toolbox-divider', className)} aria-hidden="true" {...props} />
}

export type SectionToolIconButtonProps = Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, 'children'> & {
  icon: React.ReactNode
  tooltip?: string
  iconClassName?: string
  buttonClassName?: string
  active?: boolean
  wrapperClassName?: string
}

export function SectionToolIconButton({
  icon,
  tooltip,
  iconClassName,
  buttonClassName,
  className,
  active = false,
  wrapperClassName,
  ...props
}: SectionToolIconButtonProps) {
  return (
    <div className={cn('group relative inline-flex', wrapperClassName)}>
      <button
        type="button"
        data-state={active ? 'open' : 'closed'}
        className={cn(
          'house-section-tool-button house-publications-toolbox-item h-8 w-8 inline-flex items-center justify-center house-publications-action-icon house-publications-top-control transition-[background-color,border-color,box-shadow] duration-[var(--motion-duration-ui)] ease-out',
          active && 'house-publications-tools-toggle-open',
          buttonClassName,
          className,
        )}
        {...props}
      >
        <span className={cn('inline-flex', iconClassName)}>{icon}</span>
      </button>
      {tooltip ? (
        <span
          className="house-drilldown-chart-tooltip pointer-events-none absolute left-1/2 top-auto bottom-full mb-[0.35rem] z-50 -translate-x-1/2 whitespace-nowrap px-2 py-0.5 text-caption leading-none transition-opacity duration-[var(--motion-duration-ui)] ease-out opacity-0 group-hover:opacity-100 group-focus-within:opacity-100"
          aria-hidden="true"
        >
          {tooltip}
        </span>
      ) : null}
    </div>
  )
}
