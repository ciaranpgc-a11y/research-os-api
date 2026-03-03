import * as React from 'react'
import { cva, type VariantProps } from 'class-variance-authority'
import { cn } from '@/lib/utils'

/**
 * BadgePrimitive token contract:
 * - Radius: --radius-full
 * - Spacing: --space-1 horizontal, --space-0 vertical
 * - Typography: text-micro (sm), text-caption (md)
 * - Border: 1px solid tokenized tone/border values
 * - Motion: --motion-micro (fallback --motion-duration-fast)
 * - Color tones by semantic variant:
 *   - default: neutral-100 bg / neutral-700 text
 *   - primary: accent-100 bg / accent-800 text
 *   - secondary: neutral-200 bg / neutral-800 text
 *   - success: positive-100 bg / positive-800 text
 *   - warning: warning-100 bg / warning-900 text
 *   - danger: danger-100 bg / danger-800 text
 *   - outline: transparent bg / border + foreground text
 *
 * Contrast notes (design target):
 * - default: >= 4.5:1
 * - primary: >= 4.5:1
 * - success: >= 4.5:1
 * - warning: >= 4.5:1 (uses warning-900 for stronger contrast)
 * - danger: >= 4.5:1
 * - outline: depends on parent background; intended for neutral surfaces
 */

const legacyBadgePrimitiveVariants = cva(
  [
    'inline-flex items-center rounded-[var(--radius-full)]',
    'border',
    'font-semibold',
    'leading-none',
    'transition-[background-color,border-color,color]',
  ].join(' '),
  {
    variants: {
      variant: {
        default:
          'border-[hsl(var(--tone-neutral-300))] bg-[hsl(var(--tone-neutral-100))] text-[hsl(var(--tone-neutral-700))]',
        primary:
          'border-[hsl(var(--tone-accent-300))] bg-[hsl(var(--tone-accent-100))] text-[hsl(var(--tone-accent-800))]',
        secondary:
          'border-[hsl(var(--tone-neutral-300))] bg-[hsl(var(--tone-neutral-200))] text-[hsl(var(--tone-neutral-800))]',
        success:
          'border-[hsl(var(--tone-positive-300))] bg-[hsl(var(--tone-positive-100))] text-[hsl(var(--tone-positive-800))]',
        warning:
          'border-[hsl(var(--tone-warning-300))] bg-[hsl(var(--tone-warning-100))] text-[hsl(var(--tone-warning-900))]',
        danger:
          'border-[hsl(var(--tone-danger-300))] bg-[hsl(var(--tone-danger-100))] text-[hsl(var(--tone-danger-800))]',
        outline:
          'border-[hsl(var(--border))] bg-transparent text-[hsl(var(--foreground))]',
      },
      size: {
        sm: 'text-micro',
        md: 'text-caption',
      },
    },
    defaultVariants: {
      variant: 'default',
      size: 'sm',
    },
  },
)

export interface LegacyBadgePrimitiveProps
  extends React.HTMLAttributes<HTMLSpanElement>,
    VariantProps<typeof legacyBadgePrimitiveVariants> {}

const LegacyBadgePrimitive = React.forwardRef<HTMLSpanElement, LegacyBadgePrimitiveProps>(
  ({ className, variant, size, style, ...props }, ref) => {
    const resolvedVariant = variant ?? 'default'
    const resolvedSize = size ?? 'sm'
    return (
      <span
        ref={ref}
        data-ui="badge-primitive"
        data-house-role="badge"
        data-ui-variant={resolvedVariant}
        data-ui-size={resolvedSize}
        className={cn(legacyBadgePrimitiveVariants({ variant: resolvedVariant, size: resolvedSize }), className)}
        style={{
          paddingInline: 'var(--space-1)',
          paddingBlock: 'var(--space-0)',
          transitionDuration: 'var(--motion-micro, var(--motion-duration-fast))',
          ...style,
        }}
        {...props}
      />
    )
  },
)
LegacyBadgePrimitive.displayName = 'LegacyBadgePrimitive'

export { LegacyBadgePrimitive }
