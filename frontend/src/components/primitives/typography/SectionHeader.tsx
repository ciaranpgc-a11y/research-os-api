import * as React from 'react'

import { cn } from '@/lib/utils'

export interface SectionHeaderProps extends Omit<React.HTMLAttributes<HTMLElement>, 'title'> {
  eyebrow?: string
  heading: string
  headingAccessory?: React.ReactNode
  description?: string
  actions?: React.ReactNode
}

const SectionHeader = React.forwardRef<HTMLElement, SectionHeaderProps>(
  ({ className, eyebrow, heading, headingAccessory, description, actions, ...props }, ref) => (
    <header
      ref={ref}
      data-ui="section-header"
      data-house-role="section-header"
      className={cn('flex w-full flex-col gap-[var(--space-2)]', className)}
      {...props}
    >
      {eyebrow ? (
        <p
          data-ui="section-header-eyebrow"
          data-house-role="section-header-eyebrow"
          className="m-0 text-caption font-semibold uppercase tracking-[0.08em] text-[hsl(var(--muted-foreground))]"
        >
          {eyebrow}
        </p>
      ) : null}
      <div
        data-ui="section-header-content"
        data-house-role="section-header-content"
        className="flex w-full flex-col gap-[var(--space-2)] md:flex-row md:items-start md:justify-between"
      >
        <div
          data-ui="section-header-copy"
          data-house-role="section-header-copy"
          className="flex min-w-0 flex-1 flex-col gap-[var(--space-1)]"
        >
          <div className="flex min-w-0 flex-wrap items-center gap-[var(--space-2)]">
            <h2
              data-ui="section-header-heading"
              data-house-role="section-title"
              className="m-0 text-h3 font-semibold text-[hsl(var(--foreground))]"
            >
              {heading}
            </h2>
            {headingAccessory ? (
              <div
                data-ui="section-header-heading-accessory"
                data-house-role="section-header-heading-accessory"
                className="shrink-0"
              >
                {headingAccessory}
              </div>
            ) : null}
          </div>
          {description ? (
            <p
              data-ui="section-header-description"
              data-house-role="section-subtitle"
              className="m-0 text-body-secondary text-[hsl(var(--muted-foreground))]"
            >
              {description}
            </p>
          ) : null}
        </div>
        {actions ? (
          <div
            data-ui="section-header-actions"
            data-house-role="section-header-actions"
            className="flex w-full shrink-0 items-center justify-end gap-[var(--space-2)] md:w-auto"
          >
            {actions}
          </div>
        ) : null}
      </div>
    </header>
  ),
)

SectionHeader.displayName = 'SectionHeader'

export { SectionHeader }
