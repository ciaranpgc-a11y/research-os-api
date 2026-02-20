import { PageFrame } from '@/pages/page-frame'

export function AgentLogsPage() {
  return (
    <PageFrame
      title="Agent Logs"
      description="Operational telemetry for autonomous writing, retrieval, QC, and reconciliation agents."
    >
      <p className="text-sm text-muted-foreground">
        Future integration: per-agent latency, token spend, failure traces, and retry diagnostics.
      </p>
    </PageFrame>
  )
}
