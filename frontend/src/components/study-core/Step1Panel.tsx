import { useMemo, useState } from 'react'

import { Button } from '@/components/ui/button'

type Step1PanelProps = {
  summary: string
  researchType: string
  onReplaceSummary: (value: string) => void
  onApplyResearchType: (value: string) => void
}

const ACTION_BUTTON_CLASS = 'bg-emerald-600 text-white hover:bg-emerald-700 focus-visible:ring-emerald-500'
const OUTLINE_ACTION_BUTTON_CLASS =
  'border-emerald-200 text-emerald-700 hover:bg-emerald-50 focus-visible:ring-emerald-500'
const SUMMARY_RECOMMENDATION_CARD_CLASS = 'space-y-2 rounded-md border border-emerald-200 bg-emerald-50/40 p-3'
const RESEARCH_TYPE_RECOMMENDATION_CARD_CLASS = 'space-y-2 rounded-md border border-sky-200 bg-sky-50/40 p-3'

const DEFAULT_SUMMARY_OPTIONS = [
  'In this retrospective observational cohort, summarise the clinical problem, methods, and key observed results with uncertainty.',
  'Describe the population, imaging method, endpoint, and analytic approach using associative interpretation.',
  'State the primary estimate with uncertainty, and keep the interpretation non-causal.',
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

function detectPopulation(summaryText: string): string {
  if (hasAny(summaryText, ['pulmonary hypertension', 'ph cohort'])) {
    return 'a pulmonary hypertension cohort'
  }
  if (hasAny(summaryText, ['heart failure'])) {
    return 'a heart failure cohort'
  }
  if (hasAny(summaryText, ['registry'])) {
    return 'a registry cohort'
  }
  if (hasAny(summaryText, ['patients', 'adults', 'participants', 'cohort'])) {
    return 'the study cohort'
  }
  return 'the target cohort'
}

function detectMethodStrategy(summaryText: string, researchType: string): string {
  if (hasAny(summaryText, ['multivariable', 'adjusted', 'regression'])) {
    return 'multivariable adjusted analyses'
  }
  if (hasAny(summaryText, ['diagnostic', 'sensitivity', 'specificity', 'auc', 'roc'])) {
    return 'diagnostic performance analysis'
  }
  if (hasAny(summaryText, ['survival', 'time-to-event', 'hazard ratio'])) {
    return 'time-to-event modelling'
  }
  if (hasAny(summaryText, ['machine learning', 'deep learning', 'radiomics', 'ai model'])) {
    return 'model-based analysis with explicit validation'
  }
  if (researchType.includes('diagnostic')) {
    return 'diagnostic performance analysis'
  }
  if (researchType.includes('prognostic')) {
    return 'prognostic modelling'
  }
  return 'pre-specified observational modelling'
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
  const population = detectPopulation(summaryText)
  const imagingMethod = detectImagingMethod(summaryText)
  const endpoint = detectEndpoint(summaryText)
  const design = researchType.trim() ? researchType.trim().toLowerCase() : 'retrospective observational cohort'
  const methods = detectMethodStrategy(summaryText, design)
  const resultsLine = hasQuantifiedResult(summaryText)
    ? 'Report the primary estimate with uncertainty and keep interpretation associative.'
    : 'Add the primary estimate with uncertainty when results are available.'

  return [
    `In this ${design}, we address ${clinicalProblem} in ${population}. We use ${imagingMethod} and ${methods} to evaluate ${endpoint}.`,
    `Objective summary: ${normalized}. Clarify study design, analytic method, and uncertainty around the primary estimate.`,
    `Evaluate associations between ${imagingMethod}-derived findings and ${endpoint} in ${population} with ${clinicalProblem}. ${resultsLine}`,
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
  onReplaceSummary,
  onApplyResearchType,
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

  const onApplySummary = (option: string) => {
    onReplaceSummary(option)
    setGeneratedSummaryOptions((current) => current.filter((candidate) => candidate !== option))
  }

  const onApplyResearchTypeSuggestion = () => {
    if (!generatedResearchType) {
      return
    }
    onApplyResearchType(generatedResearchType.value)
    setGeneratedResearchType(null)
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
      <h3 className="text-sm font-semibold">Research Recommendations</h3>

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

      {refinementsEnabled && generatedSummaryOptions.length > 0 ? (
        <div className={SUMMARY_RECOMMENDATION_CARD_CLASS}>
          <p className="text-sm font-medium">Summary refinement</p>
          <p className="text-xs text-muted-foreground">Choose a tighter summary rewrite.</p>
          <div className="space-y-2">
            {generatedSummaryOptions.slice(0, 3).map((option) => (
              <div key={option} className="rounded border border-emerald-200 bg-white/80 p-2">
                <p className="text-xs text-slate-700">{option}</p>
                <Button size="sm" className={`mt-2 ${ACTION_BUTTON_CLASS}`} onClick={() => onApplySummary(option)}>
                  Replace summary
                </Button>
              </div>
            ))}
          </div>
        </div>
      ) : null}

      {refinementsEnabled && generatedResearchType ? (
        <div className={RESEARCH_TYPE_RECOMMENDATION_CARD_CLASS}>
          <p className="text-sm font-medium">Research type suggestion</p>
          <p className="text-xs text-slate-700">{generatedResearchType.reason}</p>
          <Button size="sm" className={ACTION_BUTTON_CLASS} onClick={onApplyResearchTypeSuggestion}>
            Apply suggested research type
          </Button>
        </div>
      ) : null}

      {refinementsEnabled && hasGenerated && generatedSummaryOptions.length === 0 && !generatedResearchType ? (
        <div className="rounded-md border border-border bg-background p-3">
          <p className="text-sm font-medium">No pending recommendations</p>
          <p className="text-xs text-muted-foreground">Applied suggestions are removed automatically. Use Refresh to generate new options.</p>
        </div>
      ) : null}
    </aside>
  )
}
