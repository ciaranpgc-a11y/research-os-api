import { RecommendationCard } from '@/components/study-core/RecommendationCard'

export type QcFix = {
  title: string
  rationale: string
  applyPatch: () => void
  optionalPreview?: string
}

type Step5PanelProps = {
  fixes: QcFix[]
}

export function Step5Panel({ fixes }: Step5PanelProps) {
  return (
    <aside className="space-y-3 rounded-lg border border-border bg-card p-3">
      <h3 className="text-sm font-semibold">QC Fixes</h3>
      {fixes.slice(0, 3).map((fix) => (
        <RecommendationCard
          key={fix.title}
          title={fix.title}
          rationale={fix.rationale}
          actionLabel="Apply"
          onApply={fix.applyPatch}
          optionalPreview={fix.optionalPreview}
        />
      ))}
    </aside>
  )
}
