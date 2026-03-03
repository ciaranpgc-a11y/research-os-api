import * as React from 'react'
import type { VariantProps } from 'class-variance-authority'

import { cn } from '@/lib/utils'
import { inputVariants } from './input.variants'

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

export { Input }
