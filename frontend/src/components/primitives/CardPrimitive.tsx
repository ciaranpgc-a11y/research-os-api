import * as React from 'react'
import type { VariantProps } from 'class-variance-authority'
import { cn } from '@/lib/utils'
import { cardPrimitiveVariants } from './CardPrimitive.variants'

/**
 * CardPrimitive token contract:
 * - Radius: --radius-md
 * - Spacing: --space-3 (default), --space-2 (header/footer tight edge)
 * - Surface: --card / --card-foreground / --border
 * - Elevation: --elevation-1 (rest), --elevation-2 (hover interactive)
 * - Motion: --motion-duration-ui, --motion-ease-default
 *
 * Usage guidance:
 * - Use `variant="default"` for elevated containers.
 * - Use `variant="flat"` for low-emphasis surfaces.
 * - Use `variant="outlined"` for border-forward separation.
 * - Set `interactive` when the whole card is clickable/hover-reactive.
 */

export interface CardPrimitiveProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof cardPrimitiveVariants> {}

const CardPrimitive = React.forwardRef<HTMLDivElement, CardPrimitiveProps>(
  ({ className, variant, interactive, style, ...props }, ref) => {
    const resolvedVariant = variant ?? 'default'
    const resolvedInteractive = interactive ?? false
    return (
      <div
        ref={ref}
        data-ui="card-primitive"
        data-house-role="card"
        data-ui-variant={resolvedVariant}
        data-ui-interactive={String(resolvedInteractive)}
        className={cn(cardPrimitiveVariants({ variant: resolvedVariant, interactive: resolvedInteractive }), className)}
        style={{
          transitionDuration: 'var(--motion-duration-ui)',
          transitionTimingFunction: 'var(--motion-ease-default)',
          ...style,
        }}
        {...props}
      />
    )
  },
)
CardPrimitive.displayName = 'CardPrimitive'

const CardHeader = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, style, ...props }, ref) => (
    <div
      ref={ref}
      data-ui="card-primitive-header"
      data-house-role="card-header"
      className={cn('flex flex-col gap-1', className)}
      style={{
        paddingInline: 'var(--space-3)',
        paddingTop: 'var(--space-3)',
        paddingBottom: 'var(--space-2)',
        ...style,
      }}
      {...props}
    />
  ),
)
CardHeader.displayName = 'CardHeader'

const CardTitle = React.forwardRef<HTMLHeadingElement, React.HTMLAttributes<HTMLHeadingElement>>(
  ({ className, style, ...props }, ref) => (
    <h3
      ref={ref}
      data-ui="card-primitive-title"
      data-house-role="section-title"
      className={cn('text-h3 font-semibold leading-tight text-[hsl(var(--card-foreground))]', className)}
      style={{
        fontSize: 'var(--text-h3-size, 1.563rem)',
        lineHeight: 'var(--text-h3-line, 1.25)',
        ...style,
      }}
      {...props}
    />
  ),
)
CardTitle.displayName = 'CardTitle'

const CardDescription = React.forwardRef<HTMLParagraphElement, React.HTMLAttributes<HTMLParagraphElement>>(
  ({ className, ...props }, ref) => (
    <p
      ref={ref}
      data-ui="card-primitive-description"
      data-house-role="section-subtitle"
      className={cn('text-caption text-[hsl(var(--muted-foreground))]', className)}
      {...props}
    />
  ),
)
CardDescription.displayName = 'CardDescription'

const CardContent = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, style, ...props }, ref) => (
    <div
      ref={ref}
      data-ui="card-primitive-content"
      data-house-role="card-content"
      className={cn(className)}
      style={{
        padding: 'var(--space-3)',
        ...style,
      }}
      {...props}
    />
  ),
)
CardContent.displayName = 'CardContent'

const CardFooter = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, style, ...props }, ref) => (
    <div
      ref={ref}
      data-ui="card-primitive-footer"
      data-house-role="card-footer"
      className={cn('flex items-center gap-2', className)}
      style={{
        paddingInline: 'var(--space-3)',
        paddingTop: 'var(--space-2)',
        paddingBottom: 'var(--space-3)',
        ...style,
      }}
      {...props}
    />
  ),
)
CardFooter.displayName = 'CardFooter'

export { CardPrimitive, CardHeader, CardTitle, CardDescription, CardContent, CardFooter }
