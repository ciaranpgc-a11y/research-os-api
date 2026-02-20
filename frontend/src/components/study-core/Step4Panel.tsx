import { RecommendationCard } from '@/components/study-core/RecommendationCard'

export type DraftCorrection = {
  title: string
  rationale: string
  applyPatch: () => void
  optionalPreview?: string
}

type Step4PanelProps = {
  corrections: DraftCorrection[]
}

export function Step4Panel({ corrections }: Step4PanelProps) {
  return (
    <aside className="space-y-3 rounded-lg border border-border bg-card p-3">
      <h3 className="text-sm font-semibold">Draft Corrections</h3>
      {corrections.length === 0 ? (
        <p className="rounded-md border border-border bg-background p-3 text-sm text-muted-foreground">No immediate draft corrections detected.</p>
      ) : (
        corrections.slice(0, 3).map((correction) => (
          <RecommendationCard
            key={correction.title}
            title={correction.title}
            rationale={correction.rationale}
            actionLabel="Apply correction"
            onApply={correction.applyPatch}
            optionalPreview={correction.optionalPreview}
          />
        ))
      )}
    </aside>
  )
}
