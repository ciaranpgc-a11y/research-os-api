import * as React from 'react'
import { cva, type VariantProps } from 'class-variance-authority'

import { cn } from '@/lib/utils'

const rowVariants = cva('flex w-full min-w-0', {
  variants: {
    align: {
      start: 'items-start justify-start',
      center: 'items-center justify-start',
      end: 'items-end justify-end',
      between: 'items-center justify-between',
      stretch: 'items-stretch justify-start',
    },
    gap: {
      sm: 'gap-[var(--space-2)]',
      md: 'gap-[var(--space-3)]',
      lg: 'gap-[var(--space-4)]',
    },
    wrap: {
      true: 'flex-wrap',
      false: 'flex-nowrap',
    },
  },
  defaultVariants: {
    align: 'start',
    gap: 'md',
    wrap: true,
  },
})

export interface RowProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof rowVariants> {}

const Row = React.forwardRef<HTMLDivElement, RowProps>(
  ({ className, align, gap, wrap, ...props }, ref) => (
    <div
      ref={ref}
      data-ui="layout-row"
      data-house-role="layout-row"
      data-ui-align={align ?? 'start'}
      data-ui-gap={gap ?? 'md'}
      data-ui-wrap={String(wrap ?? true)}
      className={cn(rowVariants({ align, gap, wrap }), className)}
      {...props}
    />
  ),
)

Row.displayName = 'Row'

export { Row }
