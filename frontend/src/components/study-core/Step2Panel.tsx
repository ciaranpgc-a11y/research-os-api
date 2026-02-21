import { RecommendationCard } from '@/components/study-core/RecommendationCard'
import type { PlanRecommendation } from '@/lib/analyze-plan'

type Step2PanelProps = {
  hasPlan: boolean
  recommendations: PlanRecommendation[]
}

export function Step2Panel({ hasPlan, recommendations }: Step2PanelProps) {
  return (
    <aside className="space-y-3 rounded-lg border border-border bg-card p-3">
      <h3 className="text-sm font-semibold">Plan Fixes</h3>
      {!hasPlan ? (
        <p className="rounded-md border border-border bg-background p-3 text-sm text-muted-foreground">
          Generate or scaffold a plan, then apply targeted fixes here.
        </p>
      ) : recommendations.length === 0 ? (
        <p className="rounded-md border border-border bg-background p-3 text-sm text-muted-foreground">
          Plan looks coherent. Proceed to draft generation.
        </p>
      ) : (
        recommendations.slice(0, 3).map((recommendation) => (
          <RecommendationCard
            key={recommendation.title}
            title={recommendation.title}
            rationale={recommendation.rationale}
            actionLabel="Insert recommended bullets"
            onApply={recommendation.applyPatch}
            optionalPreview={recommendation.optionalPreview}
          />
        ))
      )}
    </aside>
  )
}
