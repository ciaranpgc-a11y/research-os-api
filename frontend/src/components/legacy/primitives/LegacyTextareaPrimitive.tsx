import * as React from 'react'
import { cva, type VariantProps } from 'class-variance-authority'
import { cn } from '@/lib/utils'
import { Textarea } from '@/components/ui'

/**
 * TextareaPrimitive token contract:
 * - Radius: --radius-sm
 * - Spacing: --space-2 (horizontal), --space-2 (vertical)
 * - Typography: text-body
 * - Line height: --line-normal
 * - Border: hsl(var(--border))
 * - Motion: --motion-micro (fallback --motion-duration-fast)
 * - Focus ring: --ring-focus
 * - Error ring: --ring-error
 * - Colors: --foreground, --background, --muted-foreground, --tone-accent-500, --tone-danger-500
 */

const legacyTextareaPrimitiveVariants = cva(
  [
    'flex w-full rounded-[var(--radius-sm)]',
    'border border-[hsl(var(--border))]',
    'bg-[hsl(var(--background))] text-[hsl(var(--foreground))]',
    'text-body',
    'placeholder:text-[hsl(var(--muted-foreground))]',
    'transition-[border-color,box-shadow]',
    'focus-visible:outline-none',
    'focus-visible:border-[hsl(var(--tone-accent-500))]',
    'focus-visible:shadow-[var(--ring-focus)]',
    'aria-[invalid=true]:border-[hsl(var(--tone-danger-500))]',
    'aria-[invalid=true]:shadow-[var(--ring-error)]',
    'disabled:cursor-not-allowed disabled:opacity-50',
  ].join(' '),
  {
    variants: {
      size: {
        sm: 'min-h-20',
        md: 'min-h-24',
        lg: 'min-h-32',
      },
      resize: {
        vertical: 'resize-y',
        none: 'resize-none',
      },
    },
    defaultVariants: {
      size: 'md',
      resize: 'vertical',
    },
  },
)

export interface LegacyTextareaPrimitiveProps
  extends Omit<React.TextareaHTMLAttributes<HTMLTextAreaElement>, 'size'>,
    VariantProps<typeof legacyTextareaPrimitiveVariants> {}

const LegacyTextareaPrimitive = React.forwardRef<HTMLTextAreaElement, LegacyTextareaPrimitiveProps>(
  ({ className, size, resize, style, ...props }, ref) => {
    const resolvedSize = size ?? 'md'
    const resolvedResize = resize ?? 'vertical'
    const baseSize = resolvedSize === 'md' ? 'default' : resolvedSize

    return (
      <Textarea
        size={baseSize}
        data-ui="textarea-primitive"
        data-house-role="form-textarea"
        data-ui-size={resolvedSize}
        data-ui-resize={resolvedResize}
        className={cn(legacyTextareaPrimitiveVariants({ size: resolvedSize, resize: resolvedResize }), className)}
        style={{
          paddingInline: 'var(--space-2)',
          paddingBlock: 'var(--space-2)',
          lineHeight: 'var(--line-normal)',
          transitionDuration: 'var(--motion-micro, var(--motion-duration-fast))',
          ...style,
        }}
        ref={ref}
        {...props}
      />
    )
  },
)

LegacyTextareaPrimitive.displayName = 'LegacyTextareaPrimitive'

export { LegacyTextareaPrimitive }
