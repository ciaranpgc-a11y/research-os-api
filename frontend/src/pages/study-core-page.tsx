import { PageFrame } from '@/pages/page-frame'

export function StudyCorePage() {
  return (
    <PageFrame
      title="Study Core"
      description="Protocol assumptions, population definitions, endpoint strategy, and model constraints."
    >
      <ul className="space-y-2 text-sm text-muted-foreground">
        <li>Primary objective: reduce 90-day readmission risk in high-risk HF admissions.</li>
        <li>Design profile: retrospective observational cohort with pre-specified adjustments.</li>
        <li>Current status: covariate set locked, endpoint adjudication complete.</li>
      </ul>
    </PageFrame>
  )
}
