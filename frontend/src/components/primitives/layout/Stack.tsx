import * as React from 'react'
import { cva, type VariantProps } from 'class-variance-authority'

import { cn } from '@/lib/utils'

const stackVariants = cva('flex w-full flex-col', {
  variants: {
    space: {
      sm: 'gap-[var(--space-2)]',
      md: 'gap-[var(--space-3)]',
      lg: 'gap-[var(--space-4)]',
      xl: 'gap-[var(--space-5)]',
    },
    align: {
      start: 'items-start',
      center: 'items-center',
      stretch: 'items-stretch',
    },
  },
  defaultVariants: {
    space: 'md',
    align: 'stretch',
  },
})

export interface StackProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof stackVariants> {}

const Stack = React.forwardRef<HTMLDivElement, StackProps>(
  ({ className, space, align, ...props }, ref) => (
    <div
      ref={ref}
      data-ui="layout-stack"
      data-house-role="layout-stack"
      data-ui-space={space ?? 'md'}
      data-ui-align={align ?? 'stretch'}
      className={cn(stackVariants({ space, align }), className)}
      {...props}
    />
  ),
)

Stack.displayName = 'Stack'

export { Stack }
