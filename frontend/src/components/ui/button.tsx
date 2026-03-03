import * as React from 'react'
import { Slot } from '@radix-ui/react-slot'
import type { VariantProps } from 'class-variance-authority'

import { cn } from '@/lib/utils'
import { buttonVariants } from './button.variants'

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean
  isLoading?: boolean
  loadingText?: string
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  (
    { className, variant, size, asChild = false, isLoading = false, loadingText, children, disabled, ...props },
    ref,
  ) => {
    const Comp = asChild ? Slot : 'button'
    const resolvedVariant = variant ?? 'default'
    const resolvedSize = size ?? 'default'
    const resolvedDisabled = Boolean(disabled || isLoading)
    const resolvedChildren = isLoading ? (
      <span className="inline-flex items-center gap-2">
        <span
          aria-hidden="true"
          className="inline-flex h-4 w-4 animate-spin rounded-full border-2 border-current border-r-transparent"
        />
        <span>{loadingText ?? children}</span>
      </span>
    ) : (
      children
    )

    return (
      <Comp
        data-ui="button"
        data-house-role="action-button"
        data-ui-variant={resolvedVariant}
        data-ui-size={resolvedSize}
        aria-busy={isLoading || undefined}
        className={cn(buttonVariants({ variant, size, className }))}
        ref={ref}
        disabled={asChild ? disabled : resolvedDisabled}
        {...props}
      >
        {resolvedChildren}
      </Comp>
    )
  },
)
Button.displayName = 'Button'

export { Button }
