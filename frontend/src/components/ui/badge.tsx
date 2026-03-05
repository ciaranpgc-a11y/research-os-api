import type * as React from 'react'
import { cva, type VariantProps } from 'class-variance-authority'

import { cn } from '@/lib/utils'

const badgeVariants = cva(
  'inline-flex items-center rounded-md border font-medium transition-colors focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2',
  {
    variants: {
      variant: {
        default: 'border-transparent bg-primary text-primary-foreground',
        secondary: 'border-transparent bg-muted text-foreground',
        outline: 'border-border text-foreground',
        destructive: 'border-transparent bg-destructive text-destructive-foreground',
        positive:
          'border-[hsl(var(--tone-positive-300))] bg-[hsl(var(--tone-positive-50))] text-[hsl(var(--tone-positive-800))]',
        yellow:
          'border-[hsl(var(--tone-warning-300))] bg-[hsl(var(--tone-warning-50))] text-[hsl(var(--tone-warning-700))]',
        intermediate:
          'border-[hsl(var(--tone-warning-500))] bg-[hsl(var(--tone-warning-100))] text-[hsl(var(--tone-warning-900))]',
        negative:
          'border-[hsl(var(--tone-danger-300))] bg-[hsl(var(--tone-danger-50))] text-[hsl(var(--tone-danger-800))]',
        userAdmin:
          'border-[hsl(var(--tone-warning-400))] bg-[linear-gradient(135deg,hsl(var(--tone-warning-100)),hsl(var(--tone-warning-200)))] text-[hsl(var(--tone-warning-900))] shadow-[var(--elevation-2)] ring-1 ring-[hsl(var(--tone-warning-300)/0.75)]',
        userMember:
          'border-[hsl(var(--tone-accent-200))] bg-[hsl(var(--tone-accent-50))] text-[hsl(var(--tone-accent-800))]',
        userGuest: 'border-[hsl(var(--tone-neutral-200))] bg-[hsl(var(--tone-neutral-100))] text-[hsl(var(--tone-neutral-700))]',
      },
      size: {
        default: 'px-2 py-1 text-micro',
        sm: 'min-h-5 justify-center rounded-sm px-2 py-0.5 text-xs leading-none font-normal',
      },
    },
    defaultVariants: {
      variant: 'default',
      size: 'default',
    },
  },
)

export interface BadgeProps extends React.HTMLAttributes<HTMLDivElement>, VariantProps<typeof badgeVariants> {}

export function Badge({ className, variant, size, ...props }: BadgeProps) {
  return (
    <div
      data-ui="badge"
      data-house-role="badge"
      data-ui-variant={variant ?? 'default'}
      className={cn(badgeVariants({ variant, size }), className)}
      {...props}
    />
  )
}
