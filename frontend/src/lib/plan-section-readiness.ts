export type PlanSectionKey = 'introduction' | 'methods' | 'results' | 'discussion'

export type PlanSectionAssessment = {
  ready: boolean
  issue: string
  rationale: string
  fixLabel: string
  fixText: string
}

function normalise(text: string): string {
  return text.trim().toLowerCase()
}

function hasAny(text: string, tokens: string[]): boolean {
  const lowered = normalise(text)
  return tokens.some((token) => lowered.includes(token))
}

function ensureTrailingSentence(text: string, sentence: string): string {
  const compact = text.trim()
  if (!compact) {
    return sentence
  }
  if (normalise(compact).includes(normalise(sentence))) {
    return compact
  }
  return `${compact}${compact.endsWith('.') ? '' : '.'} ${sentence}`
}

export function assessPlanSection(
  section: PlanSectionKey,
  text: string,
  summaryOfResearch: string,
): PlanSectionAssessment {
  const compact = text.trim()
  const summary = summaryOfResearch.trim()

  if (!compact) {
    if (section === 'introduction') {
      return {
        ready: false,
        issue: 'Introduction plan is empty.',
        rationale: 'A clear opening scope is needed before drafting starts.',
        fixLabel: 'Insert objective framing',
        fixText: summary
          ? `Frame the introduction around this research summary: ${summary}`
          : 'State the clinical problem, evidence gap, and manuscript objective.',
      }
    }
    if (section === 'methods') {
      return {
        ready: false,
        issue: 'Methods plan is empty.',
        rationale: 'Draft quality depends on explicit design and analytic structure.',
        fixLabel: 'Insert methods structure',
        fixText:
          'Specify design, eligibility logic, core endpoints, and analysis approach including missing-data handling.',
      }
    }
    if (section === 'results') {
      return {
        ready: false,
        issue: 'Results plan is empty.',
        rationale: 'Results need a predefined reporting structure to avoid drift.',
        fixLabel: 'Insert results structure',
        fixText:
          'Define primary findings first, then report uncertainty and any sensitivity or consistency checks.',
      }
    }
    return {
      ready: false,
      issue: 'Discussion plan is empty.',
      rationale: 'Interpretation boundaries should be fixed before generation.',
      fixLabel: 'Insert discussion structure',
      fixText:
        'Interpret findings conservatively, include alternative explanations, and state explicit limitations.',
    }
  }

  if (section === 'introduction') {
    const hasObjective = hasAny(compact, ['objective', 'aim', 'focus', 'question'])
    if (!hasObjective) {
      return {
        ready: false,
        issue: 'Introduction lacks explicit objective framing.',
        rationale: 'A stated objective improves coherence across all sections.',
        fixLabel: 'Add objective sentence',
        fixText: summary
          ? `The introduction should anchor the manuscript objective in this summary: ${summary}`
          : 'State the exact manuscript objective in one sentence.',
      }
    }
    return {
      ready: true,
      issue: 'Introduction plan is ready.',
      rationale: 'Objective framing is present.',
      fixLabel: '',
      fixText: '',
    }
  }

  if (section === 'methods') {
    const hasDesign = hasAny(compact, ['design', 'cohort', 'registry', 'review', 'selection'])
    const hasAnalysis = hasAny(compact, ['analysis', 'model', 'synthesis', 'missing', 'adjust'])
    if (!hasDesign || !hasAnalysis) {
      return {
        ready: false,
        issue: 'Methods plan is missing design or analysis detail.',
        rationale: 'Readers need design and analytic logic to judge robustness.',
        fixLabel: 'Add design and analysis detail',
        fixText:
          'Clarify design and selection strategy, then define the analysis approach and how uncertainty or missing data are handled.',
      }
    }
    return {
      ready: true,
      issue: 'Methods plan is ready.',
      rationale: 'Design and analysis details are present.',
      fixLabel: '',
      fixText: '',
    }
  }

  if (section === 'results') {
    const hasFinding = hasAny(compact, ['finding', 'result', 'estimate', 'reported'])
    const hasUncertainty = hasAny(compact, ['uncertainty', 'confidence', 'interval', 'variation', 'heterogeneity'])
    if (!hasFinding || !hasUncertainty) {
      return {
        ready: false,
        issue: 'Results plan does not explicitly include uncertainty reporting.',
        rationale: 'Primary findings should be paired with uncertainty framing.',
        fixLabel: 'Add uncertainty wording',
        fixText:
          'Report each primary finding with uncertainty wording and avoid definitive causal language.',
      }
    }
    return {
      ready: true,
      issue: 'Results plan is ready.',
      rationale: 'Findings and uncertainty framing are present.',
      fixLabel: '',
      fixText: '',
    }
  }

  const hasInterpretation = hasAny(compact, ['interpret', 'implication', 'context'])
  const hasLimitations = hasAny(compact, ['limitation', 'constraint', 'alternative'])
  if (!hasInterpretation || !hasLimitations) {
    return {
      ready: false,
      issue: 'Discussion plan is missing interpretation boundaries or limitations.',
      rationale: 'Conservative discussion requires explicit limits of inference.',
      fixLabel: 'Add limitations statement',
      fixText:
        'Interpret findings within scope, include limitations explicitly, and outline alternative explanations.',
    }
  }
  return {
    ready: true,
    issue: 'Discussion plan is ready.',
    rationale: 'Interpretation and limitations are both present.',
    fixLabel: '',
    fixText: '',
  }
}

export function applyRecommendedSectionFix(
  section: PlanSectionKey,
  text: string,
  summaryOfResearch: string,
): string {
  const assessment = assessPlanSection(section, text, summaryOfResearch)
  if (assessment.ready || !assessment.fixText.trim()) {
    return text.trim()
  }
  return ensureTrailingSentence(text, assessment.fixText.trim())
}
