import * as React from 'react'
import { cva, type VariantProps } from 'class-variance-authority'

import { cn } from '@/lib/utils'

const containerVariants = cva('mx-auto w-full', {
  variants: {
    size: {
      content: 'max-w-[var(--content-container-max-default)]',
      wide: 'max-w-[var(--content-container-max-wide)]',
      full: 'max-w-none',
    },
    gutter: {
      default: 'px-[var(--content-container-anchor-offset)] md:px-[var(--content-container-anchor-offset-md)]',
      fluid: 'px-[var(--content-container-fluid-anchor-offset)] md:px-[var(--content-container-fluid-anchor-offset-md)]',
      none: 'px-0',
    },
  },
  defaultVariants: {
    size: 'content',
    gutter: 'default',
  },
})

export interface ContainerProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof containerVariants> {}

const Container = React.forwardRef<HTMLDivElement, ContainerProps>(
  ({ className, size, gutter, ...props }, ref) => (
    <div
      ref={ref}
      data-ui="layout-container"
      data-house-role="layout-container"
      data-ui-size={size ?? 'content'}
      data-ui-gutter={gutter ?? 'default'}
      className={cn(containerVariants({ size, gutter }), className)}
      {...props}
    />
  ),
)

Container.displayName = 'Container'

export { Container }
