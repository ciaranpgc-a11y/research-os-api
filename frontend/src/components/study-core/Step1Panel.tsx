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
  'In this retrospective observational cohort, describe the clinical problem, study methods, and key observed results with uncertainty.',
  'Evaluate associations between imaging markers and outcomes using conservative associative interpretation.',
  'Summarise cohort characteristics, analytic methods, and the primary estimate with confidence intervals.',
]

type ResearchTypeRecommendation = {
  value: string
  reason: string
}

const SUGGESTION_MATCH_TOKENS: Record<string, string[]> = {
  'Radiomics or AI imaging model external validation': ['radiomics', 'ai imaging model external validation', 'external validation'],
  'Radiomics or AI imaging model development': ['radiomics', 'ai imaging model development', 'model development'],
  'Imaging reproducibility and inter-reader variability study': ['reproducibility', 'inter-reader', 'variability'],
  'Imaging protocol optimization study': ['protocol optimization', 'protocol'],
  'Multimodality imaging comparative study': ['multimodality', 'comparative'],
  'Diagnostic accuracy imaging study': ['diagnostic accuracy', 'diagnostic'],
  'Prognostic imaging model study': ['prognostic imaging model', 'prognostic'],
  'Registry-based observational analysis': ['registry'],
  'Case series': ['case series'],
  'Prospective observational cohort': ['prospective'],
  'Retrospective observational cohort': ['retrospective'],
  'Cross-sectional imaging biomarker study': ['cross-sectional imaging biomarker', 'cross-sectional'],
}

function hasAny(text: string, terms: string[]): boolean {
  return terms.some((term) => text.includes(term))
}

function uniqueLines(lines: string[]): string[] {
  const seen = new Set<string>()
  const unique: string[] = []
  for (const line of lines) {
    const trimmed = line.trim()
    if (!trimmed) {
      continue
    }
    const key = trimmed.toLowerCase()
    if (seen.has(key)) {
      continue
    }
    seen.add(key)
    unique.push(trimmed)
  }
  return unique
}

function detectClinicalProblem(summaryText: string): string {
  if (hasAny(summaryText, ['pulmonary hypertension', 'ph cohort', 'ph '])) {
    return 'pulmonary hypertension'
  }
  if (hasAny(summaryText, ['heart failure', 'hf'])) {
    return 'heart failure'
  }
  if (hasAny(summaryText, ['coronary', 'ischemic', 'cad'])) {
    return 'coronary artery disease'
  }
  if (hasAny(summaryText, ['valve', 'valvular', 'aortic stenosis', 'mitral'])) {
    return 'valvular heart disease'
  }
  if (hasAny(summaryText, ['arrhythmia', 'atrial fibrillation', 'af'])) {
    return 'cardiac rhythm disorders'
  }
  return 'a cardiovascular clinical problem'
}

function detectImagingMethod(summaryText: string): string {
  if (hasAny(summaryText, ['4d flow', '4d-flow'])) {
    return '4D flow MRI'
  }
  if (hasAny(summaryText, ['cmr', 'cardiac magnetic resonance', 'cardiovascular magnetic resonance'])) {
    return 'cardiac magnetic resonance imaging'
  }
  if (hasAny(summaryText, ['echocardiography', 'echo'])) {
    return 'echocardiography'
  }
  if (hasAny(summaryText, ['cardiac ct', 'ct angiography', 'cta', 'computed tomography'])) {
    return 'cardiac computed tomography'
  }
  if (hasAny(summaryText, ['pet', 'spect', 'nuclear'])) {
    return 'nuclear cardiac imaging'
  }
  if (hasAny(summaryText, ['strain', 't1 mapping', 't2 mapping', 'lge'])) {
    return 'quantitative cardiovascular imaging'
  }
  return 'cardiovascular imaging'
}

function detectEndpoint(summaryText: string): string {
  if (hasAny(summaryText, ['mortality', 'death', 'survival', 'hospitalization', 'time-to-event', 'hazard ratio'])) {
    return 'clinical outcomes'
  }
  if (hasAny(summaryText, ['diagnostic', 'sensitivity', 'specificity', 'auc', 'roc', 'accuracy'])) {
    return 'diagnostic performance'
  }
  if (hasAny(summaryText, ['hemodynamic', 'haemodynamic', 'pressure', 'flow'])) {
    return 'hemodynamic measures'
  }
  if (hasAny(summaryText, ['rv function', 'lv function', 'ejection fraction'])) {
    return 'cardiac function measures'
  }
  return 'the primary study endpoint'
}

function hasQuantifiedResult(summaryText: string): boolean {
  return (
    /\b\d+(\.\d+)?\s*%/.test(summaryText) ||
    /\b(or|odds ratio|hr|hazard ratio|rr|risk ratio|auc|c-index|confidence interval|ci)\b/.test(summaryText)
  )
}

function buildSummaryOptions(summary: string, researchType: string): string[] {
  const trimmed = summary.trim()
  if (!trimmed) {
    return DEFAULT_SUMMARY_OPTIONS
  }
  const normalized = trimmed.replace(/\s+/g, ' ').replace(/\.$/, '')
  const summaryText = normalized.toLowerCase()
  const clinicalProblem = detectClinicalProblem(summaryText)
  const imagingMethod = detectImagingMethod(summaryText)
  const endpoint = detectEndpoint(summaryText)
  const design = researchType.trim() ? researchType.trim().toLowerCase() : 'retrospective observational cohort'
  const resultsLine = hasQuantifiedResult(summaryText)
    ? 'Keep the key observed estimates and uncertainty explicit in the final draft.'
    : 'Add key effect estimates and uncertainty once results are available.'

  return [
    `Assess ${normalized}, using associative interpretation and explicit limitations.`,
    `In this ${design}, we address ${clinicalProblem} using ${imagingMethod}. We estimate associations with ${endpoint} and report uncertainty.`,
    `Summary objective: evaluate ${clinicalProblem} in a ${design} with ${imagingMethod}. ${resultsLine}`,
  ]
    .map((line) => (line.endsWith('.') ? line : `${line}.`))
    .slice(0, 3)
}

function countDetectedModalities(summaryText: string): number {
  let count = 0
  if (hasAny(summaryText, ['cmr', 'cardiac magnetic resonance', 'mri'])) {
    count += 1
  }
  if (hasAny(summaryText, ['echocardiography', 'echo'])) {
    count += 1
  }
  if (hasAny(summaryText, ['cardiac ct', 'ct angiography', 'cta', 'computed tomography'])) {
    count += 1
  }
  if (hasAny(summaryText, ['pet', 'spect', 'nuclear'])) {
    count += 1
  }
  return count
}

function matchesCurrentType(currentType: string, suggestionType: string): boolean {
  const current = currentType.toLowerCase().trim()
  if (!current) {
    return false
  }
  const tokens = SUGGESTION_MATCH_TOKENS[suggestionType] ?? [suggestionType.toLowerCase()]
  return tokens.some((token) => current.includes(token))
}

function researchTypeSuggestion(researchType: string, summary: string): ResearchTypeRecommendation | null {
  const currentType = researchType.toLowerCase()
  const summaryText = summary.toLowerCase()
  if (!summaryText.trim()) {
    return null
  }

  const imagingObjective = hasAny(summaryText, [
    'imaging',
    'cmr',
    'mri',
    'echo',
    'echocardiography',
    'ct',
    'pet',
    'spect',
    'radiomics',
    '4d flow',
  ])
  const aiModelObjective = hasAny(summaryText, [
    'radiomics',
    'machine learning',
    'deep learning',
    'neural network',
    'ai model',
    'prediction model',
  ])
  const externalValidationObjective = hasAny(summaryText, [
    'external validation',
    'independent cohort',
    'validation cohort',
    'temporal validation',
  ])
  const reproducibilityObjective = hasAny(summaryText, [
    'reproducibility',
    'repeatability',
    'inter-reader',
    'intra-reader',
    'variability',
    'agreement',
    'icc',
    'bland-altman',
  ])
  const protocolObjective = hasAny(summaryText, [
    'protocol',
    'acquisition',
    'sequence',
    'reconstruction',
    'optimization',
    'optimisation',
  ])
  const multimodalityObjective =
    hasAny(summaryText, ['multimodality', 'multi-modality', 'comparative']) || countDetectedModalities(summaryText) >= 2
  const diagnosticObjective = hasAny(summaryText, [
    'diagnostic',
    'diagnosis',
    'sensitivity',
    'specificity',
    'auc',
    'roc',
    'accuracy',
    'rule-in',
    'rule-out',
  ])
  const prognosticObjective = hasAny(summaryText, [
    'prognostic',
    'prognosis',
    'mortality',
    'hospitalization',
    'survival',
    'time-to-event',
    'hazard ratio',
  ])
  const registryObjective = hasAny(summaryText, ['registry'])
  const caseSeriesObjective = hasAny(summaryText, ['case series', 'case report'])
  const prospectiveObjective = hasAny(summaryText, ['prospective'])
  const retrospectiveObjective = hasAny(summaryText, ['retrospective'])

  const candidates: ResearchTypeRecommendation[] = []
  if (aiModelObjective && externalValidationObjective) {
    candidates.push({
      value: 'Radiomics or AI imaging model external validation',
      reason: 'Detected AI/radiomics plus explicit external validation terms.',
    })
  } else if (aiModelObjective) {
    candidates.push({
      value: 'Radiomics or AI imaging model development',
      reason: 'Detected AI or radiomics model development language.',
    })
  }

  if (reproducibilityObjective) {
    candidates.push({
      value: 'Imaging reproducibility and inter-reader variability study',
      reason: 'Detected reproducibility or inter/intra-reader variability terms.',
    })
  }

  if (protocolObjective) {
    candidates.push({
      value: 'Imaging protocol optimization study',
      reason: 'Detected protocol, acquisition, or optimisation language.',
    })
  }

  if (multimodalityObjective) {
    candidates.push({
      value: 'Multimodality imaging comparative study',
      reason: 'Detected comparison across two or more imaging modalities.',
    })
  }

  if (diagnosticObjective) {
    candidates.push({
      value: 'Diagnostic accuracy imaging study',
      reason: 'Detected diagnostic performance terms (sensitivity/specificity/AUC/ROC).',
    })
  }

  if (prognosticObjective) {
    candidates.push({
      value: 'Prognostic imaging model study',
      reason: 'Detected prognostic or clinical-outcome language.',
    })
  }

  if (registryObjective) {
    candidates.push({
      value: 'Registry-based observational analysis',
      reason: 'Detected registry-based data language.',
    })
  }

  if (caseSeriesObjective) {
    candidates.push({
      value: 'Case series',
      reason: 'Detected case-series style wording.',
    })
  }

  if (prospectiveObjective) {
    candidates.push({
      value: 'Prospective observational cohort',
      reason: 'Detected prospective study wording.',
    })
  } else if (retrospectiveObjective) {
    candidates.push({
      value: 'Retrospective observational cohort',
      reason: 'Detected retrospective observational wording.',
    })
  }

  if (imagingObjective) {
    candidates.push({
      value: 'Cross-sectional imaging biomarker study',
      reason: 'Detected imaging biomarker-focused wording.',
    })
  } else if (!currentType) {
    candidates.push({
      value: 'Retrospective observational cohort',
      reason: 'Default conservative choice for observational summary framing.',
    })
  }

  const chosen = candidates.find((candidate) => !matchesCurrentType(currentType, candidate.value)) ?? null
  return chosen
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
  const [generatedResearchType, setGeneratedResearchType] = useState<ResearchTypeRecommendation | null>(null)
  const [generatedKey, setGeneratedKey] = useState('')
  const [refinementsEnabled, setRefinementsEnabled] = useState(false)

  const currentKey = useMemo(
    () => `${summary.trim().toLowerCase()}::${researchType.trim().toLowerCase()}`,
    [summary, researchType],
  )
  const hasGenerated = generatedKey.length > 0
  const isStale = hasGenerated && generatedKey !== currentKey

  const onGenerateRefinements = () => {
    setGeneratedSummaryOptions(uniqueLines(buildSummaryOptions(summary, researchType)).slice(0, 3))
    setGeneratedResearchType(researchTypeSuggestion(researchType, summary))
    setGeneratedKey(currentKey)
  }

  const onToggleRefinements = () => {
    if (refinementsEnabled) {
      setRefinementsEnabled(false)
      return
    }
    onGenerateRefinements()
    setRefinementsEnabled(true)
  }

  return (
    <aside className="space-y-3 rounded-lg border border-border bg-card p-3">
      <h3 className="text-sm font-semibold">Framing Recommendations</h3>

      <div className="space-y-2 rounded-md border border-border bg-background p-3">
        <p className="text-sm font-medium">Refinement controls</p>
        <p className="text-xs text-muted-foreground">Show or hide recommendations on demand.</p>
        <div className="flex flex-wrap items-center gap-2">
          <Button className={ACTION_BUTTON_CLASS} size="sm" onClick={onToggleRefinements} disabled={!summary.trim()}>
            {refinementsEnabled ? 'Hide refinements' : 'Show refinements'}
          </Button>
          {refinementsEnabled ? (
            <Button
              size="sm"
              variant="outline"
              className={OUTLINE_ACTION_BUTTON_CLASS}
              onClick={onGenerateRefinements}
              disabled={!summary.trim()}
            >
              Refresh
            </Button>
          ) : null}
        </div>
        {!summary.trim() ? <p className="text-xs text-muted-foreground">Add a summary of research to enable refinements.</p> : null}
        {refinementsEnabled && isStale ? <p className="text-xs text-muted-foreground">Summary changed. Refresh refinements.</p> : null}
      </div>

      {refinementsEnabled && hasGenerated ? (
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

      {refinementsEnabled && hasGenerated && generatedResearchType ? (
        <div className="space-y-2 rounded-md border border-border bg-background p-3">
          <p className="text-sm font-medium">Research type suggestion</p>
          <p className="text-xs text-muted-foreground">{generatedResearchType.reason}</p>
          <Button size="sm" className={ACTION_BUTTON_CLASS} onClick={() => onApplyResearchType(generatedResearchType.value)}>
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
