import * as React from 'react'

import { cn } from '@/lib/utils'

export interface PageHeaderProps extends Omit<React.HTMLAttributes<HTMLElement>, 'title'> {
  eyebrow?: string
  heading: string
  description?: string
  actions?: React.ReactNode
}

const PageHeader = React.forwardRef<HTMLElement, PageHeaderProps>(
  ({ className, eyebrow, heading, description, actions, ...props }, ref) => (
    <header
      ref={ref}
      data-ui="page-header"
      data-house-role="page-header"
      className={cn('flex w-full flex-col gap-[var(--space-3)]', className)}
      {...props}
    >
      {eyebrow ? (
        <p
          data-ui="page-header-eyebrow"
          data-house-role="page-header-eyebrow"
          className="m-0 text-label font-semibold uppercase tracking-[0.08em] text-[hsl(var(--muted-foreground))]"
        >
          {eyebrow}
        </p>
      ) : null}
      <div
        data-ui="page-header-content"
        data-house-role="page-header-content"
        className="flex w-full flex-col gap-[var(--space-3)] md:flex-row md:items-start md:justify-between"
      >
        <div
          data-ui="page-header-copy"
          data-house-role="page-header-copy"
          className="flex min-w-0 flex-1 flex-col gap-[var(--page-header-title-gap)]"
        >
          <h1
            data-ui="page-header-heading"
            data-house-role="page-title"
            className="m-0 text-display font-semibold text-[hsl(var(--foreground))]"
          >
            {heading}
          </h1>
          {description ? (
            <p
              data-ui="page-header-description"
              data-house-role="page-title-expander"
              className="m-0 text-body text-[hsl(var(--muted-foreground))]"
            >
              {description}
            </p>
          ) : null}
        </div>
        {actions ? (
          <div
            data-ui="page-header-actions"
            data-house-role="page-header-actions"
            className="flex shrink-0 items-center gap-[var(--space-2)]"
          >
            {actions}
          </div>
        ) : null}
      </div>
    </header>
  ),
)

PageHeader.displayName = 'PageHeader'

export { PageHeader }
