import { Button } from '@/components/ui/button'

type Step1PanelProps = {
  objective: string
  researchType: string
  guardrailsEnabled: boolean
  onReplaceObjective: (value: string) => void
  onApplyResearchType: (value: string) => void
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

function researchTypeSuggestion(researchType: string, objective: string): string | null {
  const currentType = researchType.toLowerCase()
  const objectiveText = objective.toLowerCase()
  const imagingObjective =
    objectiveText.includes('imaging') ||
    objectiveText.includes('cmr') ||
    objectiveText.includes('echo') ||
    objectiveText.includes('ct') ||
    objectiveText.includes('mri')
  const diagnosticObjective =
    objectiveText.includes('diagnostic') ||
    objectiveText.includes('sensitivity') ||
    objectiveText.includes('specificity') ||
    objectiveText.includes('auc')

  if (!currentType) {
    return imagingObjective ? 'Cross-sectional imaging biomarker study' : 'Retrospective observational cohort'
  }
  if (diagnosticObjective && !currentType.includes('diagnostic')) {
    return 'Diagnostic accuracy imaging study'
  }
  if (imagingObjective && !currentType.includes('imaging')) {
    return 'Cross-sectional imaging biomarker study'
  }
  return null
}

export function Step1Panel({
  objective,
  researchType,
  guardrailsEnabled,
  onReplaceObjective,
  onApplyResearchType,
  onGuardrailsChange,
}: Step1PanelProps) {
  const objectiveOptions = buildObjectiveOptions(objective)
  const suggestedResearchType = researchTypeSuggestion(researchType, objective)

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

      {suggestedResearchType ? (
        <div className="space-y-2 rounded-md border border-border bg-background p-3">
          <p className="text-sm font-medium">Research type suggestion</p>
          <p className="text-xs text-muted-foreground">Objective wording fits {suggestedResearchType.toLowerCase()} best.</p>
          <Button size="sm" onClick={() => onApplyResearchType(suggestedResearchType)}>
            Apply suggested research type
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
