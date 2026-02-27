import * as React from 'react'
import { Slot } from '@radix-ui/react-slot'
import { cva, type VariantProps } from 'class-variance-authority'
import { cn } from '@/lib/utils'

/**
 * ButtonPrimitive token contract:
 * - Radius: --radius-sm
 * - Spacing: --space-2, --space-3, --space-4
 * - Typography classes: text-caption, text-label, text-body-large
 * - Motion: --motion-ui (fallback --motion-duration-ui), --ease-standard (fallback --motion-ease-default)
 * - Elevation: --elevation-1 / --elevation-2 (fallbacks --elevation-xs / --elevation-sm)
 * - Focus ring: --ring-focus
 * - Color tokens: --tone-accent-*, --tone-neutral-*
 *
 * Accessibility:
 * - Minimum touch target is 44px (WCAG 2.5.5, mobile guideline baseline)
 * - Focus-visible ring support for keyboard navigation (WCAG 2.4.7)
 * - Disabled state prevents pointer interaction and lowers visual prominence
 */

const buttonPrimitiveVariants = cva(
  [
    'inline-flex min-h-11 items-center justify-center whitespace-nowrap',
    'rounded-[var(--radius-sm)]',
    'border border-transparent',
    'transition-[background-color,border-color,color,box-shadow,transform]',
    'duration-[var(--motion-ui,var(--motion-duration-ui))]',
    'ease-[var(--ease-standard,var(--motion-ease-default))]',
    'shadow-[var(--button-elevation-rest)]',
    'hover:shadow-[var(--button-elevation-hover)] hover:-translate-y-px',
    'active:scale-[0.98] active:shadow-[var(--button-elevation-rest)] active:translate-y-0',
    'focus-visible:outline-none focus-visible:shadow-[var(--ring-focus)]',
    'disabled:pointer-events-none disabled:opacity-50 disabled:transform-none',
  ].join(' '),
  {
    variants: {
      variant: {
        primary: [
          'bg-[hsl(var(--tone-accent-600))] text-[hsl(var(--tone-neutral-50))]',
          'hover:bg-[hsl(var(--tone-accent-700))]',
          'active:bg-[hsl(var(--tone-accent-800))]',
        ].join(' '),
        secondary: [
          'border-[hsl(var(--tone-neutral-300))]',
          'bg-[hsl(var(--tone-neutral-100))]',
          'text-[hsl(var(--tone-neutral-900))]',
          'hover:bg-[hsl(var(--tone-neutral-200))]',
          'active:bg-[hsl(var(--tone-neutral-300))]',
        ].join(' '),
        ghost: [
          'bg-transparent text-[hsl(var(--tone-neutral-800))]',
          'hover:bg-[hsl(var(--tone-neutral-100))]',
          'active:bg-[hsl(var(--tone-neutral-200))]',
        ].join(' '),
      },
      size: {
        sm: 'h-11 text-caption',
        md: 'h-11 text-label',
        lg: 'h-14 text-body-large',
      },
    },
    defaultVariants: {
      variant: 'primary',
      size: 'md',
    },
  },
)

const sizeSpacing: Record<NonNullable<ButtonPrimitiveProps['size']>, React.CSSProperties> = {
  sm: {
    paddingInline: 'var(--space-2)',
    paddingBlock: 'var(--space-2)',
  },
  md: {
    paddingInline: 'var(--space-3)',
    paddingBlock: 'var(--space-2)',
  },
  lg: {
    paddingInline: 'var(--space-4)',
    paddingBlock: 'var(--space-2)',
  },
}

export interface ButtonPrimitiveProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonPrimitiveVariants> {
  asChild?: boolean
}

const ButtonPrimitive = React.forwardRef<HTMLButtonElement, ButtonPrimitiveProps>(
  ({ className, variant, size, asChild = false, style, ...props }, ref) => {
    const Comp = asChild ? Slot : 'button'
    const resolvedVariant = variant ?? 'primary'
    const resolvedSize = size ?? 'md'

    return (
      <Comp
        data-ui="button-primitive"
        data-house-role="action-button"
        data-ui-variant={resolvedVariant}
        data-ui-size={resolvedSize}
        className={cn(buttonPrimitiveVariants({ variant: resolvedVariant, size: resolvedSize }), className)}
        style={{
          ...sizeSpacing[resolvedSize],
          ['--button-elevation-rest' as string]: 'var(--elevation-1, var(--elevation-xs))',
          ['--button-elevation-hover' as string]: 'var(--elevation-2, var(--elevation-sm))',
          ...style,
        }}
        ref={ref}
        {...props}
      />
    )
  },
)

ButtonPrimitive.displayName = 'ButtonPrimitive'

export { ButtonPrimitive, buttonPrimitiveVariants }
