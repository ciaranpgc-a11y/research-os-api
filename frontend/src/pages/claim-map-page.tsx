import { PageFrame } from '@/pages/page-frame'

export function ClaimMapPage() {
  return (
    <PageFrame
      title="Claim Map"
      description="Graph-style view of claim hierarchy, supporting evidence nodes, and citation dependencies."
    >
      <p className="text-sm text-muted-foreground">
        This page will host the full claim graph. The Manuscript cards already expose a lightweight claim map mode.
      </p>
    </PageFrame>
  )
}
