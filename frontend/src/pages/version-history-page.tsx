import { PageFrame } from '@/pages/page-frame'

export function VersionHistoryPage() {
  return (
    <PageFrame
      title="Version History"
      description="Timeline of manuscript snapshots, branch states, and promotion checkpoints."
    >
      <p className="text-sm text-muted-foreground">
        Future integration: diff-aware snapshots, branch comparison, and rollback controls.
      </p>
    </PageFrame>
  )
}
