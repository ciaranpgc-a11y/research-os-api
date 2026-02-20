import { PageFrame } from '@/pages/page-frame'

export function AuditLogPage() {
  return (
    <PageFrame
      title="Audit Log"
      description="Immutable trace of edits, agent actions, and QC policy decisions."
    >
      <p className="text-sm text-muted-foreground">
        Future integration: signed event trails for regulated publication environments.
      </p>
    </PageFrame>
  )
}
