import { useMemo, useState } from 'react'

import { Button } from '@/components/ui/button'

type Step1PanelProps = {
  summary: string
  researchType: string
  guardrailsEnabled: boolean
  onReplaceSummary: (value: string) => void
  onApplyResearchType: (value: string) => void
  onGuardrailsChange: (value: boolean) => void
}

const ACTION_BUTTON_CLASS = 'bg-emerald-600 text-white hover:bg-emerald-700 focus-visible:ring-emerald-500'
const OUTLINE_ACTION_BUTTON_CLASS =
  'border-emerald-200 text-emerald-700 hover:bg-emerald-50 focus-visible:ring-emerald-500'

const DEFAULT_SUMMARY_OPTIONS = [
  'Evaluate associations between baseline predictors and primary outcomes in a retrospective observational cohort.',
  'Estimate adjusted associations between candidate risk factors and outcomes in a retrospective observational study.',
  'Describe cohort characteristics and quantify associations between exposures and outcomes with uncertainty.',
]

function buildSummaryOptions(summary: string): string[] {
  const trimmed = summary.trim()
  if (!trimmed) {
    return DEFAULT_SUMMARY_OPTIONS
  }
  return [
    `Evaluate whether ${trimmed.replace(/\.$/, '')}, using associative language only.`,
    `Estimate adjusted associations for: ${trimmed.replace(/\.$/, '')}.`,
    `Assess ${trimmed.replace(/\.$/, '')} and report uncertainty with conservative interpretation.`,
  ]
}

function researchTypeSuggestion(researchType: string, summary: string): string | null {
  const currentType = researchType.toLowerCase()
  const summaryText = summary.toLowerCase()
  const imagingObjective =
    summaryText.includes('imaging') ||
    summaryText.includes('cmr') ||
    summaryText.includes('echo') ||
    summaryText.includes('ct') ||
    summaryText.includes('mri')
  const diagnosticObjective =
    summaryText.includes('diagnostic') ||
    summaryText.includes('sensitivity') ||
    summaryText.includes('specificity') ||
    summaryText.includes('auc')

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
  summary,
  researchType,
  guardrailsEnabled,
  onReplaceSummary,
  onApplyResearchType,
  onGuardrailsChange,
}: Step1PanelProps) {
  const [generatedSummaryOptions, setGeneratedSummaryOptions] = useState<string[]>([])
  const [generatedResearchType, setGeneratedResearchType] = useState<string | null>(null)
  const [generatedKey, setGeneratedKey] = useState('')

  const currentKey = useMemo(
    () => `${summary.trim().toLowerCase()}::${researchType.trim().toLowerCase()}`,
    [summary, researchType],
  )
  const hasGenerated = generatedKey.length > 0
  const isStale = hasGenerated && generatedKey !== currentKey

  const onGenerateRefinements = () => {
    setGeneratedSummaryOptions(buildSummaryOptions(summary))
    setGeneratedResearchType(researchTypeSuggestion(researchType, summary))
    setGeneratedKey(currentKey)
  }

  return (
    <aside className="space-y-3 rounded-lg border border-border bg-card p-3">
      <h3 className="text-sm font-semibold">Framing Recommendations</h3>

      <div className="space-y-2 rounded-md border border-border bg-background p-3">
        <p className="text-sm font-medium">Refinement controls</p>
        <p className="text-xs text-muted-foreground">Generate recommendations on demand.</p>
        <Button className={ACTION_BUTTON_CLASS} size="sm" onClick={onGenerateRefinements} disabled={!summary.trim()}>
          Generate refinements
        </Button>
        {!summary.trim() ? <p className="text-xs text-muted-foreground">Add a summary of research to enable refinements.</p> : null}
        {isStale ? <p className="text-xs text-muted-foreground">Summary changed. Regenerate refinements.</p> : null}
      </div>

      {hasGenerated ? (
        <div className="space-y-2 rounded-md border border-border bg-background p-3">
          <p className="text-sm font-medium">Summary refinement</p>
          <p className="text-xs text-muted-foreground">Choose a tighter summary rewrite.</p>
          <div className="space-y-2">
            {generatedSummaryOptions.slice(0, 3).map((option) => (
              <div key={option} className="rounded border border-border/70 p-2">
                <p className="text-xs text-muted-foreground">{option}</p>
                <Button size="sm" className={`mt-2 ${ACTION_BUTTON_CLASS}`} onClick={() => onReplaceSummary(option)}>
                  Replace summary
                </Button>
              </div>
            ))}
          </div>
        </div>
      ) : null}

      {hasGenerated && generatedResearchType ? (
        <div className="space-y-2 rounded-md border border-border bg-background p-3">
          <p className="text-sm font-medium">Research type suggestion</p>
          <p className="text-xs text-muted-foreground">Summary wording fits {generatedResearchType.toLowerCase()} best.</p>
          <Button size="sm" className={ACTION_BUTTON_CLASS} onClick={() => onApplyResearchType(generatedResearchType)}>
            Apply suggested research type
          </Button>
        </div>
      ) : null}

      <div className="space-y-2 rounded-md border border-border bg-background p-3">
        <p className="text-sm font-medium">Conservative drafting guardrails</p>
        <p className="text-xs text-muted-foreground">Associative inference enforced and limitations language required.</p>
        <Button
          size="sm"
          variant={guardrailsEnabled ? 'default' : 'outline'}
          className={guardrailsEnabled ? ACTION_BUTTON_CLASS : OUTLINE_ACTION_BUTTON_CLASS}
          onClick={() => onGuardrailsChange(!guardrailsEnabled)}
        >
          {guardrailsEnabled ? 'Guardrails enabled' : 'Enable guardrails'}
        </Button>
      </div>
    </aside>
  )
}
