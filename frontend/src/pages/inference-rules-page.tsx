import { PageFrame } from '@/pages/page-frame'

export function InferenceRulesPage() {
  return (
    <PageFrame
      title="Inference Rules"
      description="Rule packs for deriving text from result objects and evidence constraints."
    >
      <p className="text-sm text-muted-foreground">
        Future integration: rule simulation, precedence control, and rule-level validation.
      </p>
    </PageFrame>
  )
}
