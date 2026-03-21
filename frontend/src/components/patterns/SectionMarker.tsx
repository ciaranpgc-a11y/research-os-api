import * as React from 'react'
import { cva, type VariantProps } from 'class-variance-authority'

import { cn } from '@/lib/utils'

const sectionMarkerVariants = cva(
  'inline-flex shrink-0 rounded-[var(--marker-radius)] opacity-[var(--marker-opacity)]',
  {
    variants: {
      tone: {
        accent: 'bg-[hsl(var(--section-style-profile-accent))]',
        neutral: 'bg-[hsl(var(--tone-neutral-500))]',
        positive: 'bg-[hsl(var(--section-style-workspace-accent))]',
        warning: 'bg-[hsl(var(--section-style-learning-centre-accent))]',
        danger: 'bg-[hsl(var(--section-style-opportunities-accent))]',
        report: 'bg-[hsl(var(--section-style-report-accent))]',
      },
      size: {
        header: 'h-[var(--marker-height-header)] w-[var(--marker-width-header)]',
        title: 'h-[var(--marker-height-title)] w-[var(--marker-width-title)]',
        nav: 'h-[var(--marker-height-left-nav)] w-[var(--marker-width-left-nav)]',
        panel: 'h-[var(--marker-height-left-nav)] w-[var(--marker-width-panel)]',
      },
    },
    defaultVariants: {
      tone: 'accent',
      size: 'header',
    },
  },
)

export interface SectionMarkerProps
  extends React.HTMLAttributes<HTMLSpanElement>,
    VariantProps<typeof sectionMarkerVariants> {}

const SectionMarker = React.forwardRef<HTMLSpanElement, SectionMarkerProps>(
  ({ className, tone, size, ...props }, ref) => (
    <span
      ref={ref}
      data-ui="section-marker"
      data-house-role="section-marker"
      data-ui-tone={tone ?? 'accent'}
      data-ui-size={size ?? 'header'}
      className={cn(sectionMarkerVariants({ tone, size }), className)}
      {...props}
    />
  ),
)
SectionMarker.displayName = 'SectionMarker'

export { SectionMarker }
