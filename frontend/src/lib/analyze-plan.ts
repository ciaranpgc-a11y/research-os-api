import type { OutlinePlanSection, OutlinePlanState } from '@/types/study-core'

export type PlanRecommendation = {
  title: string
  rationale: string
  applyPatch: () => void
  optionalPreview?: string
}

type AnalyzePlanState = {
  objective: string
  researchCategory: string
  studyType: string
  articleType: string
  interpretationMode: string
  plan: OutlinePlanState | null
  applySectionPatch: (section: string, bulletsToInsert: string[]) => void
}

type Requirement = {
  keywords: string[]
  bullet: string
}

const STOP_WORDS = new Set([
  'the',
  'and',
  'for',
  'with',
  'from',
  'that',
  'this',
  'were',
  'was',
  'are',
  'into',
  'among',
  'between',
  'using',
  'over',
  'across',
  'patients',
  'study',
])

const METHOD_REQUIREMENTS: Requirement[] = [
  {
    keywords: ['design', 'cohort', 'retrospective', 'prospective', 'registry', 'case series'],
    bullet: 'Define study design and study period explicitly.',
  },
  {
    keywords: ['eligibility', 'inclusion', 'exclusion'],
    bullet: 'Define inclusion and exclusion criteria.',
  },
  {
    keywords: ['endpoint', 'outcome'],
    bullet: 'Define primary and secondary endpoints.',
  },
  {
    keywords: ['model', 'regression', 'adjusted', 'multivariable', 'analysis'],
    bullet: 'Specify statistical modeling strategy and adjustment set.',
  },
  {
    keywords: ['missing data', 'imputation', 'missingness', 'complete-case'],
    bullet: 'Describe missing-data handling and assumptions.',
  },
  {
    keywords: ['sensitivity', 'subgroup', 'robustness'],
    bullet: 'List at least one sensitivity analysis.',
  },
]

const REVIEW_METHOD_REQUIREMENTS: Requirement[] = [
  {
    keywords: ['search', 'database', 'sources', 'identification strategy'],
    bullet: 'Define literature search sources, strategy, and timeframe.',
  },
  {
    keywords: ['inclusion', 'exclusion', 'eligibility'],
    bullet: 'Define evidence inclusion and exclusion criteria.',
  },
  {
    keywords: ['selection', 'screening', 'reviewer'],
    bullet: 'Describe screening and study-selection process.',
  },
  {
    keywords: ['extraction', 'data charting', 'synthesis'],
    bullet: 'Specify data extraction and evidence synthesis approach.',
  },
]

function findSection(plan: OutlinePlanState | null, sectionName: string): OutlinePlanSection | null {
  if (!plan) {
    return null
  }
  return plan.sections.find((section) => section.name.toLowerCase() === sectionName.toLowerCase()) ?? null
}

function sectionText(section: OutlinePlanSection | null): string {
  if (!section) {
    return ''
  }
  return section.bullets.join(' ').toLowerCase()
}

function hasAnyKeyword(value: string, keywords: string[]): boolean {
  return keywords.some((keyword) => value.includes(keyword))
}

function objectiveTerms(objective: string): string[] {
  return objective
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .map((term) => term.trim())
    .filter((term) => term.length >= 5 && !STOP_WORDS.has(term))
    .slice(0, 8)
}

export function analyzePlan(state: AnalyzePlanState): PlanRecommendation[] {
  const recommendations: PlanRecommendation[] = []
  const isReviewFraming =
    state.articleType.toLowerCase().includes('review') ||
    state.studyType.toLowerCase().includes('synthesis') ||
    state.researchCategory.toLowerCase().includes('methodological') ||
    state.objective.toLowerCase().includes('literature review')
  const methods = findSection(state.plan, 'methods')
  const methodsText = sectionText(methods)
  const methodRequirements = isReviewFraming ? REVIEW_METHOD_REQUIREMENTS : METHOD_REQUIREMENTS
  const missingMethodItems = methodRequirements.filter((requirement) => !hasAnyKeyword(methodsText, requirement.keywords))

  if (missingMethodItems.length > 0) {
    const bulletsToInsert = missingMethodItems.map((item) => item.bullet)
    recommendations.push({
      title: 'Methods essentials are missing.',
      rationale: isReviewFraming
        ? 'Review manuscripts still require explicit search, selection, and synthesis methods.'
        : 'Design, eligibility, endpoints, modeling, missing data, and sensitivity details are required for reproducibility.',
      optionalPreview: bulletsToInsert.map((bullet) => `+ Methods: ${bullet}`).join('\n'),
      applyPatch: () => {
        state.applySectionPatch('methods', bulletsToInsert)
      },
    })
  }

  const results = findSection(state.plan, 'results')
  const resultsText = sectionText(results)
  const hasEstimate = hasAnyKeyword(resultsText, [
    'estimate',
    'hazard ratio',
    'odds ratio',
    'risk ratio',
    'mean difference',
    'effect size',
  ])
  const hasUncertainty = hasAnyKeyword(resultsText, [
    'confidence interval',
    '95% ci',
    'uncertainty',
    'standard error',
    'credible interval',
    'p-value',
    'p value',
  ])

  if (!isReviewFraming && (!hasEstimate || !hasUncertainty)) {
    const bulletsToInsert = [
      !hasEstimate ? 'Report the primary estimate for the main endpoint.' : '',
      !hasUncertainty ? 'Report uncertainty for each primary estimate (for example 95% CI).' : '',
    ].filter(Boolean)
    recommendations.push({
      title: 'Results structure is incomplete.',
      rationale: 'Primary estimates and uncertainty are needed to support associative interpretation.',
      optionalPreview: bulletsToInsert.map((bullet) => `+ Results: ${bullet}`).join('\n'),
      applyPatch: () => {
        state.applySectionPatch('results', bulletsToInsert)
      },
    })
  }

  const discussion = findSection(state.plan, 'discussion')
  const discussionText = sectionText(discussion)
  const hasLimitations = hasAnyKeyword(discussionText, ['limitation', 'limitations', 'residual confounding', 'bias'])
  const hasAlternatives = hasAnyKeyword(discussionText, [
    'alternative explanation',
    'competing explanation',
    'unmeasured confounding',
    'selection bias',
    'measurement bias',
  ])
  if (!hasLimitations || !hasAlternatives) {
    const bulletsToInsert = [
      !hasLimitations ? 'State key limitations and how they affect interpretation.' : '',
      !hasAlternatives ? 'Discuss plausible alternative explanations for the observed association.' : '',
    ].filter(Boolean)
    recommendations.push({
      title: 'Discussion constraints are missing.',
      rationale: 'Observational reporting should include limitations and alternative explanations before conclusions.',
      optionalPreview: bulletsToInsert.map((bullet) => `+ Discussion: ${bullet}`).join('\n'),
      applyPatch: () => {
        state.applySectionPatch('discussion', bulletsToInsert)
      },
    })
  }

  const interpretationLower = state.interpretationMode.toLowerCase()
  const requiresAssociativeLanguage =
    interpretationLower.includes('associative') ||
    interpretationLower.includes('non-causal') ||
    interpretationLower.includes('descriptive')
  if (requiresAssociativeLanguage && state.plan) {
    const combinedText = state.plan.sections.map((section) => sectionText(section)).join(' ')
    const hasCausalPhrasing = hasAnyKeyword(combinedText, [
      'causal',
      'causes',
      'caused',
      'cause',
      'leads to',
      'effect of',
      'drives',
    ])
    if (hasCausalPhrasing) {
      const bulletsToInsert = [
        'Use associative wording only and avoid causal phrasing unless explicitly justified.',
      ]
      recommendations.push({
        title: 'Interpretation wording is inconsistent.',
        rationale: 'Current interpretation mode requires non-causal phrasing across the plan.',
        optionalPreview: bulletsToInsert.map((bullet) => `+ Discussion: ${bullet}`).join('\n'),
        applyPatch: () => {
          state.applySectionPatch('discussion', bulletsToInsert)
        },
      })
    }
  }

  const objective = state.objective.trim()
  if (objective && state.plan) {
    const terms = objectiveTerms(objective)
    const coreSections = ['introduction', 'methods', 'results', 'discussion', 'conclusion']
    const mappedSections = coreSections.filter((sectionName) => {
      const text = sectionText(findSection(state.plan, sectionName))
      return terms.some((term) => text.includes(term))
    })
    if (mappedSections.length < 4) {
      const sectionBullets: Record<string, string> = {
        introduction: `State the objective directly: ${objective}`,
        methods: 'Map objective terms to variables, model, and adjustment plan.',
        results: 'Report objective-linked primary estimate and uncertainty together.',
        discussion: 'Interpret objective-linked findings with limitations and alternatives.',
        conclusion: 'Close with a conclusion that stays aligned to the stated objective and interpretation scope.',
      }
      const missingSections = coreSections.filter((sectionName) => !mappedSections.includes(sectionName))
      recommendations.push({
        title: 'Objective is not mapped across sections.',
        rationale: 'Each core section should explicitly trace back to the stated objective.',
        optionalPreview: missingSections
          .map((sectionName) => `+ ${sectionName.charAt(0).toUpperCase()}${sectionName.slice(1)}: ${sectionBullets[sectionName]}`)
          .join('\n'),
        applyPatch: () => {
          for (const sectionName of missingSections) {
            state.applySectionPatch(sectionName, [sectionBullets[sectionName]])
          }
        },
      })
    }
  }

  return recommendations.slice(0, 3)
}
