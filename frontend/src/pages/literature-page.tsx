import { PageFrame } from '@/pages/page-frame'

export function LiteraturePage() {
  return (
    <PageFrame
      title="Literature"
      description="Evidence corpus management for retrieval, ranking, and citation slot alignment."
    >
      <ul className="space-y-2 text-sm text-muted-foreground">
        <li>Track source quality tiers and publication recency.</li>
        <li>Map references to manuscript citation slots.</li>
        <li>Surface conflicts between internal and external evidence.</li>
      </ul>
    </PageFrame>
  )
}
