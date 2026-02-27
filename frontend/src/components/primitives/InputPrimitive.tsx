import * as React from 'react'
import { cva, type VariantProps } from 'class-variance-authority'
import { cn } from '@/lib/utils'

/**
 * InputPrimitive token contract:
 * - Radius: --radius-sm
 * - Spacing: --space-2 (horizontal), --space-1 (vertical)
 * - Typography: text-body
 * - Border: hsl(var(--border))
 * - Motion: --motion-micro (fallback --motion-duration-fast)
 * - Focus ring: --ring-focus
 * - Error ring: --ring-error
 * - Colors: --foreground, --background, --muted-foreground, --tone-accent-500, --tone-danger-500
 *
 * Accessibility:
 * - Minimum touch target baseline (min-height 44px) for pointer/touch use (WCAG 2.5.5 guidance)
 * - Focus-visible indicator uses a dedicated ring token (WCAG 2.4.7)
 * - Error state responds to `aria-invalid="true"` for assistive consistency
 */

const inputPrimitiveVariants = cva(
  [
    'flex w-full min-h-11 rounded-[var(--radius-sm)]',
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
        sm: 'h-10',
        md: 'h-11',
        lg: 'h-14',
      },
    },
    defaultVariants: {
      size: 'md',
    },
  },
)

export interface InputPrimitiveProps
  extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'size'>,
    VariantProps<typeof inputPrimitiveVariants> {}

const InputPrimitive = React.forwardRef<HTMLInputElement, InputPrimitiveProps>(
  ({ className, size, style, ...props }, ref) => {
    const resolvedSize = size ?? 'md'

    return (
      <input
        data-ui="input-primitive"
        data-house-role="form-input"
        data-ui-size={resolvedSize}
        className={cn(inputPrimitiveVariants({ size: resolvedSize }), className)}
        style={{
          paddingInline: 'var(--space-2)',
          paddingBlock: 'var(--space-1)',
          transitionDuration: 'var(--motion-micro, var(--motion-duration-fast))',
          ...style,
        }}
        ref={ref}
        {...props}
      />
    )
  },
)

InputPrimitive.displayName = 'InputPrimitive'

export { InputPrimitive, inputPrimitiveVariants }
