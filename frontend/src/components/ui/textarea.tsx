import * as React from 'react'
import type { VariantProps } from 'class-variance-authority'

import { cn } from '@/lib/utils'
import { textareaVariants } from './textarea.variants'

export interface TextareaProps
  extends React.ComponentProps<'textarea'>,
    VariantProps<typeof textareaVariants> {}

const Textarea = React.forwardRef<HTMLTextAreaElement, TextareaProps>(
  ({ className, size, ...props }, ref) => {
    const resolvedSize = size ?? 'default'
    return (
      <textarea
        data-ui="textarea"
        data-house-role="form-textarea"
        data-ui-size={resolvedSize}
        className={cn(textareaVariants({ size }), className)}
        ref={ref}
        {...props}
      />
    )
  },
)
Textarea.displayName = 'Textarea'

export { Textarea }
