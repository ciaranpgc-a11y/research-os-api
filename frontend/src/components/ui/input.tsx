import * as React from 'react'
import { cva, type VariantProps } from 'class-variance-authority'

import { cn } from '@/lib/utils'

const inputVariants = cva(
  'flex w-full rounded-md border border-border bg-background text-foreground placeholder:text-muted-foreground shadow-sm transition-colors duration-ui file:border-0 file:bg-transparent file:text-sm file:font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:cursor-not-allowed disabled:opacity-50 aria-[invalid=true]:border-status-danger',
  {
    variants: {
      size: {
        sm: 'h-9 px-2.5 text-sm',
        default: 'h-9 px-3 py-1 text-sm',
        lg: 'h-10 px-4 text-sm',
      },
    },
    defaultVariants: {
      size: 'default',
    },
  },
)

export interface InputProps
  extends Omit<React.ComponentProps<'input'>, 'size'>,
    VariantProps<typeof inputVariants> {}

const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className, type, size, ...props }, ref) => {
    const resolvedSize = size ?? 'default'
    return (
      <input
        type={type}
        data-ui="input"
        data-house-role="form-input"
        data-ui-size={resolvedSize}
        className={cn(inputVariants({ size }), className)}
        ref={ref}
        {...props}
      />
    )
  },
)
Input.displayName = 'Input'

export { Input, inputVariants }
