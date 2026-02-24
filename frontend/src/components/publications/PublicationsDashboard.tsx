import type { PublicationMetricDetailPayload, PublicationsTopMetricsPayload } from '@/types/impact'
import { cn } from '@/lib/utils'

import { PublicationsTopStrip } from './PublicationsTopStrip'

function formatRefreshedAt(value: string | null | undefined): string {
  if (!value) {
    return 'Not available'
  }
  const parsed = Date.parse(value)
  if (Number.isNaN(parsed)) {
    return 'Not available'
  }
  return new Date(parsed).toLocaleString('en-GB', {
    year: 'numeric',
    month: 'short',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  })
}

type PublicationsDashboardProps = {
  title?: string
  metrics: PublicationsTopMetricsPayload | null
  loading?: boolean
  token?: string | null
  className?: string
  fetchMetricDetail?: (token: string, metricId: string) => Promise<PublicationMetricDetailPayload>
}

export function PublicationsDashboard({
  title = 'Publications',
  metrics,
  loading = false,
  token = null,
  className,
  fetchMetricDetail,
}: PublicationsDashboardProps) {
  const sourceText = (metrics?.data_sources || []).join(', ') || 'Not available'
  const refreshedText = formatRefreshedAt(metrics?.data_last_refreshed || metrics?.computed_at)

  return (
    <section className={cn('space-y-3', className)}>
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div className="space-y-1">
          <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
        </div>
        <div className="space-y-1 text-right text-xs text-muted-foreground">
          <p>Data sources: {sourceText}</p>
          <p>Last refreshed: {refreshedText}</p>
          {metrics?.is_updating ? <p className="text-amber-700">Updating...</p> : null}
        </div>
      </header>

      <PublicationsTopStrip
        metrics={metrics}
        loading={loading}
        token={token}
        fetchMetricDetail={fetchMetricDetail}
        showMeta={false}
      />
    </section>
  )
}