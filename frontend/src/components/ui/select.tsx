import * as React from 'react'
import type { VariantProps } from 'class-variance-authority'

import { cn } from '@/lib/utils'
import { selectVariants } from './select.variants'

export interface SelectProps
  extends Omit<React.ComponentProps<'select'>, 'size'>,
    VariantProps<typeof selectVariants> {}

const Select = React.forwardRef<HTMLSelectElement, SelectProps>(
  ({ className, size, ...props }, ref) => {
    const resolvedSize = size ?? 'default'
    return (
      <select
        data-ui="select"
        data-house-role="form-select"
        data-ui-size={resolvedSize}
        className={cn(selectVariants({ size }), className)}
        ref={ref}
        {...props}
      />
    )
  },
)
Select.displayName = 'Select'

export { Select }
