import { Button } from '@/components/ui/button'

type Step1PanelProps = {
  objective: string
  studyArchitecture: string
  guardrailsEnabled: boolean
  onReplaceObjective: (value: string) => void
  onApplyArchitecture: (value: string) => void
  onGuardrailsChange: (value: boolean) => void
}

const DEFAULT_OBJECTIVE_OPTIONS = [
  'Evaluate associations between baseline predictors and primary outcomes in a retrospective observational cohort.',
  'Estimate adjusted associations between candidate risk factors and outcomes in a retrospective observational study.',
  'Describe cohort characteristics and quantify associations between exposures and outcomes with uncertainty.',
]

function buildObjectiveOptions(objective: string): string[] {
  const trimmed = objective.trim()
  if (!trimmed) {
    return DEFAULT_OBJECTIVE_OPTIONS
  }
  return [
    `Evaluate whether ${trimmed.replace(/\.$/, '')}, using associative language only.`,
    `Estimate adjusted associations for: ${trimmed.replace(/\.$/, '')}.`,
    `Assess ${trimmed.replace(/\.$/, '')} and report uncertainty with conservative interpretation.`,
  ]
}

function architectureSuggestion(studyArchitecture: string, objective: string): string | null {
  const architecture = studyArchitecture.toLowerCase()
  const objectiveText = objective.toLowerCase()
  const cohortLikeObjective =
    objectiveText.includes('cohort') ||
    objectiveText.includes('association') ||
    objectiveText.includes('adjusted') ||
    objectiveText.includes('risk') ||
    objectiveText.includes('outcome')

  if (!architecture) {
    return 'Retrospective observational'
  }
  if (cohortLikeObjective && architecture !== 'retrospective observational') {
    return 'Retrospective observational'
  }
  return null
}

export function Step1Panel({
  objective,
  studyArchitecture,
  guardrailsEnabled,
  onReplaceObjective,
  onApplyArchitecture,
  onGuardrailsChange,
}: Step1PanelProps) {
  const objectiveOptions = buildObjectiveOptions(objective)
  const suggestedArchitecture = architectureSuggestion(studyArchitecture, objective)

  return (
    <aside className="space-y-3 rounded-lg border border-border bg-card p-3">
      <h3 className="text-sm font-semibold">Framing Recommendations</h3>

      <div className="space-y-2 rounded-md border border-border bg-background p-3">
        <p className="text-sm font-medium">Objective refinement</p>
        <p className="text-xs text-muted-foreground">Choose a tighter objective rewrite.</p>
        <div className="space-y-2">
          {objectiveOptions.slice(0, 3).map((option) => (
            <div key={option} className="rounded border border-border/70 p-2">
              <p className="text-xs text-muted-foreground">{option}</p>
              <Button size="sm" className="mt-2" onClick={() => onReplaceObjective(option)}>
                Replace objective
              </Button>
            </div>
          ))}
        </div>
      </div>

      {suggestedArchitecture ? (
        <div className="space-y-2 rounded-md border border-border bg-background p-3">
          <p className="text-sm font-medium">Architecture suggestion</p>
          <p className="text-xs text-muted-foreground">Objective wording fits {suggestedArchitecture.toLowerCase()} best.</p>
          <Button size="sm" onClick={() => onApplyArchitecture(suggestedArchitecture)}>
            Apply suggested architecture
          </Button>
        </div>
      ) : null}

      <div className="space-y-2 rounded-md border border-border bg-background p-3">
        <p className="text-sm font-medium">Conservative drafting guardrails</p>
        <p className="text-xs text-muted-foreground">Associative inference enforced and limitations language required.</p>
        <Button size="sm" variant={guardrailsEnabled ? 'default' : 'outline'} onClick={() => onGuardrailsChange(!guardrailsEnabled)}>
          {guardrailsEnabled ? 'Guardrails enabled' : 'Enable guardrails'}
        </Button>
      </div>
    </aside>
  )
}
