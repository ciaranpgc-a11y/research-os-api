import * as React from 'react'
import { cva, type VariantProps } from 'class-variance-authority'

import { cn } from '@/lib/utils'

const gridVariants = cva('grid w-full min-w-0', {
  variants: {
    cols: {
      1: 'grid-cols-1',
      2: 'grid-cols-2',
      3: 'grid-cols-3',
      4: 'grid-cols-4',
    },
    gap: {
      sm: 'gap-[var(--space-2)]',
      md: 'gap-[var(--space-3)]',
      lg: 'gap-[var(--space-4)]',
    },
  },
  defaultVariants: {
    cols: 1,
    gap: 'md',
  },
})

export interface GridProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof gridVariants> {}

const Grid = React.forwardRef<HTMLDivElement, GridProps>(
  ({ className, cols, gap, ...props }, ref) => (
    <div
      ref={ref}
      data-ui="layout-grid"
      data-house-role="layout-grid"
      data-ui-cols={String(cols ?? 1)}
      data-ui-gap={gap ?? 'md'}
      className={cn(gridVariants({ cols, gap }), className)}
      {...props}
    />
  ),
)

Grid.displayName = 'Grid'

export { Grid }
