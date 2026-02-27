import * as React from 'react'
import { cva, type VariantProps } from 'class-variance-authority'

import { cn } from '@/lib/utils'

const textareaVariants = cva(
  'flex w-full rounded-md border border-border bg-background text-foreground placeholder:text-muted-foreground shadow-sm transition-colors duration-ui focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:cursor-not-allowed disabled:opacity-50 aria-[invalid=true]:border-status-danger',
  {
    variants: {
      size: {
        sm: 'min-h-20 px-2.5 py-2 text-sm',
        default: 'min-h-24 px-3 py-2 text-sm',
        lg: 'min-h-28 px-4 py-3 text-sm',
      },
    },
    defaultVariants: {
      size: 'default',
    },
  },
)

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

export { Textarea, textareaVariants }
