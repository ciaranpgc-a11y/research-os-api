import * as React from 'react'
import { cva, type VariantProps } from 'class-variance-authority'

import { cn } from '@/lib/utils'

const sectionVariants = cva('flex w-full flex-col rounded-[var(--radius-md)] border border-transparent', {
  variants: {
    surface: {
      transparent: 'bg-transparent text-[hsl(var(--foreground))]',
      card: 'border-[hsl(var(--border))] bg-[hsl(var(--card))] text-[hsl(var(--card-foreground))]',
      muted: 'border-[hsl(var(--border))] bg-[hsl(var(--muted))] text-[hsl(var(--foreground))]',
    },
    spaceY: {
      none: 'gap-0',
      sm: 'gap-[var(--space-2)]',
      md: 'gap-[var(--space-3)]',
      lg: 'gap-[var(--space-4)]',
    },
    inset: {
      none: 'p-0',
      sm: 'p-[var(--space-3)]',
      md: 'p-[var(--space-4)]',
      lg: 'p-[var(--space-5)]',
    },
  },
  defaultVariants: {
    surface: 'transparent',
    spaceY: 'md',
    inset: 'md',
  },
})

export interface SectionProps
  extends React.HTMLAttributes<HTMLElement>,
    VariantProps<typeof sectionVariants> {}

const Section = React.forwardRef<HTMLElement, SectionProps>(
  ({ className, surface, spaceY, inset, ...props }, ref) => (
    <section
      ref={ref}
      data-ui="layout-section"
      data-house-role="layout-section"
      data-ui-surface={surface ?? 'transparent'}
      data-ui-space-y={spaceY ?? 'md'}
      data-ui-inset={inset ?? 'md'}
      className={cn(sectionVariants({ surface, spaceY, inset }), className)}
      {...props}
    />
  ),
)

Section.displayName = 'Section'

export { Section }
