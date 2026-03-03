import type { ReactNode } from 'react'

import { Stack } from '@/components/primitives'
import { Banner, BannerContent, BannerDescription, BannerTitle } from '@/components/ui'
import { cn } from '@/lib/utils'
import { PanelShell } from './PanelShell'

export interface ChartFrameProps {
  heading: string
  description?: string
  actions?: ReactNode
  children?: ReactNode
  loading?: boolean
  error?: string | null
  empty?: boolean
  emptyMessage?: string
  className?: string
  bodyClassName?: string
}

export function ChartFrame({
  heading,
  description,
  actions,
  children,
  loading = false,
  error = null,
  empty = false,
  emptyMessage = 'No chart data available yet.',
  className,
  bodyClassName,
}: ChartFrameProps) {
  let body = children
  if (loading) {
    body = (
      <div className="rounded-[var(--radius-sm)] border border-[hsl(var(--border))] bg-[hsl(var(--muted))] p-[var(--space-4)] text-body-secondary text-[hsl(var(--muted-foreground))]">
        Loading chart data…
      </div>
    )
  } else if (error) {
    body = (
      <Banner variant="danger">
        <BannerContent>
          <BannerTitle>Unable to render chart</BannerTitle>
          <BannerDescription>{error}</BannerDescription>
        </BannerContent>
      </Banner>
    )
  } else if (empty) {
    body = (
      <div className="rounded-[var(--radius-sm)] border border-[hsl(var(--border))] bg-[hsl(var(--muted))] p-[var(--space-4)] text-body-secondary text-[hsl(var(--muted-foreground))]">
        {emptyMessage}
      </div>
    )
  }

  return (
    <PanelShell
      heading={heading}
      description={description}
      actions={actions}
      className={className}
      bodyClassName={cn('w-full', bodyClassName)}
    >
      <Stack space="md">{body}</Stack>
    </PanelShell>
  )
}
