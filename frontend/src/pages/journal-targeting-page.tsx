import { PageFrame } from '@/pages/page-frame'

export function JournalTargetingPage() {
  return (
    <PageFrame
      title="Journal Targeting"
      description="Venue-specific formatting, language tuning, and policy compliance planning."
    >
      <ul className="space-y-2 text-sm text-muted-foreground">
        <li>Target profile: General cardiology, clinical outcomes focus.</li>
        <li>Structured abstract and figure count rules can be enforced here.</li>
        <li>Future extension: acceptance likelihood and fit rationale.</li>
      </ul>
    </PageFrame>
  )
}
