import { Button } from '@/components/ui/button'
import { RecommendationCard } from '@/components/study-core/RecommendationCard'

type RunRecommendations = {
  conservativeWithLimitations: boolean
  uncertaintyInResults: boolean
  mechanisticAsHypothesis: boolean
}

type Step3PanelProps = {
  recommendations: RunRecommendations
  busy: boolean
  onApplyConservative: () => void
  onApplyUncertainty: () => void
  onApplyMechanisticLabel: () => void
  onRunWithRecommended: () => void
  onRunAnyway: () => void
}

export function Step3Panel({
  recommendations,
  busy,
  onApplyConservative,
  onApplyUncertainty,
  onApplyMechanisticLabel,
  onRunWithRecommended,
  onRunAnyway,
}: Step3PanelProps) {
  return (
    <aside className="space-y-3 rounded-lg border border-border bg-card p-3">
      <h3 className="text-sm font-semibold">Pre-Run Checks</h3>

      <RecommendationCard
        title="Apply conservative phrasing + limitations emphasis"
        rationale={recommendations.conservativeWithLimitations ? 'Applied to run settings.' : 'Ensures non-causal language and explicit limitations framing.'}
        actionLabel={recommendations.conservativeWithLimitations ? 'Applied' : 'Apply setting'}
        onApply={onApplyConservative}
        disabled={recommendations.conservativeWithLimitations}
      />

      <RecommendationCard
        title="Ensure uncertainty phrasing in Results"
        rationale={recommendations.uncertaintyInResults ? 'Applied to run settings.' : 'Forces uncertainty framing with primary estimates in Results language.'}
        actionLabel={recommendations.uncertaintyInResults ? 'Applied' : 'Apply setting'}
        onApply={onApplyUncertainty}
        disabled={recommendations.uncertaintyInResults}
      />

      <RecommendationCard
        title="Label mechanistic statements as hypothesis"
        rationale={
          recommendations.mechanisticAsHypothesis
            ? 'Applied to run settings.'
            : 'Prevents mechanistic overclaiming in observational manuscripts.'
        }
        actionLabel={recommendations.mechanisticAsHypothesis ? 'Applied' : 'Apply setting'}
        onApply={onApplyMechanisticLabel}
        disabled={recommendations.mechanisticAsHypothesis}
      />

      <div className="space-y-2 rounded-md border border-border bg-background p-3">
        <Button className="w-full" onClick={onRunWithRecommended} disabled={busy}>
          Run with recommended settings
        </Button>
        <Button variant="outline" className="w-full" onClick={onRunAnyway} disabled={busy}>
          Run anyway
        </Button>
      </div>
    </aside>
  )
}
