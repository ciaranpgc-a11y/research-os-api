import type { JournalOption } from '@/types/study-core'

export const CURATED_CARDIOLOGY_IMAGING_JOURNALS: JournalOption[] = [
  { slug: 'pulmonary-circulation', display_name: 'Pulmonary Circulation', default_voice: 'technical' },
  {
    slug: 'american-journal-respiratory-critical-care-medicine',
    display_name: 'American Journal of Respiratory and Critical Care Medicine',
    default_voice: 'technical',
  },
  { slug: 'european-respiratory-journal', display_name: 'European Respiratory Journal', default_voice: 'technical' },
  { slug: 'chest', display_name: 'Chest', default_voice: 'technical' },
  {
    slug: 'journal-heart-lung-transplantation',
    display_name: 'Journal of Heart and Lung Transplantation',
    default_voice: 'technical',
  },
  { slug: 'respiration', display_name: 'Respiration', default_voice: 'technical' },
  { slug: 'erj-open-research', display_name: 'ERJ Open Research', default_voice: 'technical' },
  {
    slug: 'advances-pulmonary-hypertension',
    display_name: 'Advances in Pulmonary Hypertension',
    default_voice: 'technical',
  },
  {
    slug: 'journal-of-cardiovascular-magnetic-resonance',
    display_name: 'Journal of Cardiovascular Magnetic Resonance',
    default_voice: 'technical',
  },
  { slug: 'jacc-cardiovascular-imaging', display_name: 'JACC: Cardiovascular Imaging', default_voice: 'technical' },
  { slug: 'circulation-cardiovascular-imaging', display_name: 'Circulation: Cardiovascular Imaging', default_voice: 'technical' },
  {
    slug: 'european-heart-journal-cardiovascular-imaging',
    display_name: 'European Heart Journal - Cardiovascular Imaging',
    default_voice: 'technical',
  },
  { slug: 'magnetic-resonance-in-medicine', display_name: 'Magnetic Resonance in Medicine', default_voice: 'technical' },
  { slug: 'european-radiology', display_name: 'European Radiology', default_voice: 'technical' },
  { slug: 'radiology', display_name: 'Radiology', default_voice: 'technical' },
  { slug: 'insights-into-imaging', display_name: 'Insights into Imaging', default_voice: 'technical' },
  { slug: 'european-heart-journal', display_name: 'European Heart Journal', default_voice: 'technical' },
  { slug: 'circulation', display_name: 'Circulation', default_voice: 'technical' },
  { slug: 'jacc', display_name: 'Journal of the American College of Cardiology', default_voice: 'technical' },
  { slug: 'heart', display_name: 'Heart', default_voice: 'technical' },
  {
    slug: 'european-journal-heart-failure',
    display_name: 'European Journal of Heart Failure',
    default_voice: 'technical',
  },
  { slug: 'circulation-heart-failure', display_name: 'Circulation: Heart Failure', default_voice: 'technical' },
  { slug: 'esc-heart-failure', display_name: 'ESC Heart Failure', default_voice: 'technical' },
  { slug: 'international-journal-cardiology', display_name: 'International Journal of Cardiology', default_voice: 'technical' },
  { slug: 'clinical-research-in-cardiology', display_name: 'Clinical Research in Cardiology', default_voice: 'technical' },
  { slug: 'american-journal-cardiology', display_name: 'American Journal of Cardiology', default_voice: 'technical' },
  { slug: 'cardiology', display_name: 'Cardiology', default_voice: 'technical' },
  { slug: 'jacc-heart-failure', display_name: 'JACC: Heart Failure', default_voice: 'technical' },
  { slug: 'journal-cardiac-failure', display_name: 'Journal of Cardiac Failure', default_voice: 'technical' },
  {
    slug: 'european-journal-preventive-cardiology',
    display_name: 'European Journal of Preventive Cardiology',
    default_voice: 'technical',
  },
  {
    slug: 'frontiers-cardiovascular-medicine',
    display_name: 'Frontiers in Cardiovascular Medicine',
    default_voice: 'technical',
  },
  { slug: 'open-heart', display_name: 'Open Heart', default_voice: 'technical' },
  { slug: 'cardiovascular-research', display_name: 'Cardiovascular Research', default_voice: 'technical' },
  {
    slug: 'basic-research-in-cardiology',
    display_name: 'Basic Research in Cardiology',
    default_voice: 'technical',
  },
  { slug: 'circulation-research', display_name: 'Circulation Research', default_voice: 'technical' },
  {
    slug: 'journal-american-heart-association',
    display_name: 'Journal of the American Heart Association',
    default_voice: 'technical',
  },
  { slug: 'scientific-reports', display_name: 'Scientific Reports', default_voice: 'technical' },
  { slug: 'frontiers-physiology', display_name: 'Frontiers in Physiology', default_voice: 'technical' },
  { slug: 'physiological-reports', display_name: 'Physiological Reports', default_voice: 'technical' },
  { slug: 'journal-thoracic-disease', display_name: 'Journal of Thoracic Disease', default_voice: 'technical' },
  { slug: 'bmc-pulmonary-medicine', display_name: 'BMC Pulmonary Medicine', default_voice: 'technical' },
  { slug: 'lancet-respiratory-medicine', display_name: 'Lancet Respiratory Medicine', default_voice: 'technical' },
  { slug: 'thorax', display_name: 'Thorax', default_voice: 'technical' },
  {
    slug: 'american-journal-physiology-lung-cellular-molecular-physiology',
    display_name: 'American Journal of Physiology - Lung Cellular and Molecular Physiology',
    default_voice: 'technical',
  },
  { slug: 'respirology', display_name: 'Respirology', default_voice: 'technical' },
  { slug: 'respiratory-research', display_name: 'Respiratory Research', default_voice: 'technical' },
  { slug: 'respiratory-medicine', display_name: 'Respiratory Medicine', default_voice: 'technical' },
  { slug: 'journal-nuclear-cardiology', display_name: 'Journal of Nuclear Cardiology', default_voice: 'technical' },
  { slug: 'american-heart-journal', display_name: 'American Heart Journal', default_voice: 'technical' },
  { slug: 'nature-reviews-cardiology', display_name: 'Nature Reviews Cardiology', default_voice: 'technical' },
  { slug: 'plos-one', display_name: 'PLoS ONE', default_voice: 'technical' },
  { slug: 'bmj-open', display_name: 'BMJ Open', default_voice: 'technical' },
]

const JOURNAL_SUBMISSION_GUIDANCE_URLS: Record<string, string> = {
  'pulmonary-circulation': 'https://journals.sagepub.com/home/pul',
  'american-journal-respiratory-critical-care-medicine':
    'https://www.atsjournals.org/action/showAuthorGuidelines?journalCode=ajrccm',
  'european-respiratory-journal': 'https://erj.ersjournals.com/site/misc/ifora.xhtml',
  chest: 'https://journal.chestnet.org/content/authorinfo',
  'journal-heart-lung-transplantation': 'https://www.jhltonline.org/content/authorinfo',
  respiration: 'https://karger.com/res/pages/instructions-for-authors',
  'erj-open-research': 'https://openres.ersjournals.com/site/misc/ifora.xhtml',
  'advances-pulmonary-hypertension': 'https://www.phaonlineuniv.org/journal',
  'journal-of-cardiovascular-magnetic-resonance': 'https://jcmr-online.biomedcentral.com/submission-guidelines',
  'jacc-cardiovascular-imaging': 'https://www.jacc.org/journal/jcmg/for-authors',
  'circulation-cardiovascular-imaging': 'https://www.ahajournals.org/journal/circimaging/pages/instructions-for-authors',
  'european-heart-journal-cardiovascular-imaging': 'https://academic.oup.com/ehjcimaging/pages/General_Instructions',
  'magnetic-resonance-in-medicine': 'https://onlinelibrary.wiley.com/page/journal/15222594/homepage/forauthors.html',
  'european-radiology': 'https://www.springer.com/journal/330/submission-guidelines',
  radiology: 'https://pubs.rsna.org/page/radiology/author-center',
  'insights-into-imaging': 'https://insightsimaging.springeropen.com/submission-guidelines',
  'european-heart-journal': 'https://academic.oup.com/eurheartj/pages/General_Instructions',
  circulation: 'https://www.ahajournals.org/journal/circ/pages/instructions-for-authors',
  jacc: 'https://www.jacc.org/journal/jacc/for-authors',
  heart: 'https://heart.bmj.com/pages/authors/',
  'european-journal-heart-failure': 'https://academic.oup.com/eurjhf/pages/General_Instructions',
  'circulation-heart-failure': 'https://www.ahajournals.org/journal/circheartfailure/pages/instructions-for-authors',
  'esc-heart-failure': 'https://onlinelibrary.wiley.com/page/journal/20555922/homepage/forauthors.html',
  'international-journal-cardiology': 'https://www.journals.elsevier.com/international-journal-of-cardiology/publish/guide-for-authors',
  'clinical-research-in-cardiology': 'https://www.springer.com/journal/392/submission-guidelines',
  'american-journal-cardiology': 'https://www.ajconline.org/content/authorinfo',
  cardiology: 'https://karger.com/crd/pages/instructions-for-authors',
  'jacc-heart-failure': 'https://www.jacc.org/journal/jchf/for-authors',
  'journal-cardiac-failure': 'https://www.onlinejcf.com/content/authorinfo',
  'european-journal-preventive-cardiology': 'https://academic.oup.com/eurjpc/pages/General_Instructions',
  'frontiers-cardiovascular-medicine': 'https://www.frontiersin.org/journals/cardiovascular-medicine#for-authors',
  'open-heart': 'https://openheart.bmj.com/pages/authors/',
  'cardiovascular-research': 'https://academic.oup.com/cardiovascres/pages/General_Instructions',
  'basic-research-in-cardiology': 'https://www.springer.com/journal/395/submission-guidelines',
  'circulation-research': 'https://www.ahajournals.org/journal/res/pages/instructions-for-authors',
  'journal-american-heart-association': 'https://www.ahajournals.org/journal/jaha/pages/instructions-for-authors',
  'scientific-reports': 'https://www.nature.com/srep/author-instructions',
  'frontiers-physiology': 'https://www.frontiersin.org/journals/physiology#for-authors',
  'physiological-reports': 'https://physoc.onlinelibrary.wiley.com/hub/journal/2051817x/about/author-guidelines',
  'journal-thoracic-disease': 'https://jtd.amegroups.org/pages/view/author-instructions',
  'bmc-pulmonary-medicine': 'https://bmcpulmmed.biomedcentral.com/submission-guidelines',
  'lancet-respiratory-medicine': 'https://www.thelancet.com/journals/lanres/for-authors',
  thorax: 'https://thorax.bmj.com/pages/authors/',
  'american-journal-physiology-lung-cellular-molecular-physiology': 'https://journals.physiology.org/journal/ajplung',
  respirology: 'https://onlinelibrary.wiley.com/page/journal/14401843/homepage/forauthors.html',
  'respiratory-research': 'https://respiratory-research.biomedcentral.com/submission-guidelines',
  'respiratory-medicine': 'https://www.journals.elsevier.com/respiratory-medicine/publish/guide-for-authors',
  'journal-nuclear-cardiology': 'https://www.springer.com/journal/12350/submission-guidelines',
  'american-heart-journal': 'https://www.sciencedirect.com/journal/american-heart-journal/publish/guide-for-authors',
  'nature-reviews-cardiology': 'https://www.nature.com/nrcardio/for-authors-and-referees',
  'plos-one': 'https://journals.plos.org/plosone/s/submission-guidelines',
  'bmj-open': 'https://bmjopen.bmj.com/pages/authors/',
}

export type ResearchCategoryOption = {
  category: string
  studyTypes: readonly string[]
}

const BASE_RESEARCH_TYPE_TAXONOMY: readonly ResearchCategoryOption[] = [
  {
    category: 'Observational Clinical Cohort',
    studyTypes: [
      'Retrospective single-centre cohort',
      'Retrospective multi-centre cohort',
      'Retrospective longitudinal follow-up cohort',
      'Prospective observational cohort',
      'Registry-based analysis',
      'Incident pulmonary hypertension cohort study',
      'Prevalent pulmonary hypertension cohort study',
      'Matched cohort comparative study (non-randomised)',
      'Nested case-control cohort study',
      'Case-control study',
      'Case series',
    ],
  },
  {
    category: 'Imaging Biomarker Study',
    studyTypes: [
      'Cross-sectional imaging biomarker study',
      'Longitudinal imaging biomarker study',
      'Imaging-outcome association study',
      'Imaging surrogate endpoint study',
      'Right ventricular-vascular coupling imaging study',
      'Strain-based imaging biomarker study',
      'Mechanistic imaging study',
    ],
  },
  {
    category: 'Prognostic / Risk Modelling',
    studyTypes: [
      'Prognostic imaging model development',
      'Prognostic model internal validation',
      'Prognostic model external validation',
      'Risk score recalibration study',
      'Incremental prognostic value study',
      'Imaging + biomarker integrated model',
      'Dynamic risk prediction update study',
      'Net reclassification improvement study',
    ],
  },
  {
    category: 'Diagnostic Study',
    studyTypes: [
      'Diagnostic accuracy imaging study',
      'Diagnostic threshold optimisation study',
      'Reference-standard concordance study',
      'Differential diagnosis imaging discrimination study',
      'Early disease detection imaging study',
      'Phenotype classification study',
    ],
  },
  {
    category: 'Reproducibility / Technical Validation',
    studyTypes: [
      'Inter-reader reproducibility study',
      'Intra-observer repeatability study',
      'Test-retest repeatability study',
      'Site-to-site reproducibility study',
      'Imaging protocol optimisation study',
      'Sequence parameter sensitivity study',
      'Quantification method comparison study',
      'Post-processing pipeline reproducibility study',
    ],
  },
  {
    category: 'Multimodality Integration',
    studyTypes: [
      'Imaging-haemodynamic integration study',
      'Imaging-haemodynamic concordance profiling study',
      'Imaging-catheterization timing concordance study',
      'Imaging-biomarker integration study',
      'Imaging-exercise physiology integration study',
      'Imaging-echocardiography comparative integration study',
      'Imaging-laboratory composite endpoint study',
      'Multimodality imaging comparison study',
    ],
  },
  {
    category: 'AI / Radiomics',
    studyTypes: [
      'AI imaging model development',
      'AI imaging model internal validation',
      'AI imaging model external validation',
      'Automated segmentation validation study',
      'Radiomics signature development study',
      'Radiomics feature robustness study',
      'AI-assisted phenotype clustering study',
      'AI model fairness and subgroup performance study',
    ],
  },
  {
    category: 'Methodological / Analytical',
    studyTypes: [
      'Narrative literature synthesis study',
      'Scoping evidence synthesis study',
      'Statistical methodology application study',
      'Missing data strategy evaluation study',
      'Confounding adjustment strategy comparison study',
      'Longitudinal mixed-effects modelling study',
      'Time-varying covariate modelling study',
      'Measurement harmonisation study',
      'External data harmonisation study',
      'Data integration methodology study',
    ],
  },
] as const

export const RESEARCH_TYPE_OPTIONS = BASE_RESEARCH_TYPE_TAXONOMY.flatMap((entry) => [...entry.studyTypes]) as readonly string[]

export function getResearchTypeTaxonomy(enableAiRadiomics = true): ResearchCategoryOption[] {
  return BASE_RESEARCH_TYPE_TAXONOMY.filter((entry) => enableAiRadiomics || entry.category !== 'AI / Radiomics').map((entry) => ({
    category: entry.category,
    studyTypes: [...entry.studyTypes],
  }))
}

export const INTERPRETATION_MODE_OPTIONS = [
  'Descriptive phenotype characterization',
  'Descriptive epidemiology and prevalence patterning',
  'Associative risk or prognostic inference',
  'Adjusted association interpretation (multivariable)',
  'Time-to-event prognostic interpretation',
  'Diagnostic performance interpretation',
  'Incremental diagnostic value interpretation',
  'Predictive model development interpretation',
  'Predictive model internal validation interpretation',
  'Predictive model external validation interpretation',
  'Comparative effectiveness interpretation (non-causal)',
  'Treatment-response heterogeneity exploration (non-causal)',
  'Hypothesis-generating mechanistic interpretation',
  'Pathophysiologic plausibility interpretation',
  'Replication or confirmatory association interpretation',
  'Safety and feasibility characterization',
  'Implementation and workflow feasibility interpretation',
] as const

type InterpretationModeOption = (typeof INTERPRETATION_MODE_OPTIONS)[number]

export type StudyTypeDefaults = {
  defaultInterpretationMode: InterpretationModeOption
  enableConservativeGuardrails: boolean
}

const DEFAULT_INTERPRETATION_MODE: InterpretationModeOption = 'Associative risk or prognostic inference'

const CATEGORY_DEFAULT_INTERPRETATION_MODE: Record<string, InterpretationModeOption> = {
  'Observational Clinical Cohort': 'Associative risk or prognostic inference',
  'Imaging Biomarker Study': 'Adjusted association interpretation (multivariable)',
  'Prognostic / Risk Modelling': 'Predictive model development interpretation',
  'Diagnostic Study': 'Diagnostic performance interpretation',
  'Reproducibility / Technical Validation': 'Replication or confirmatory association interpretation',
  'Multimodality Integration': 'Associative risk or prognostic inference',
  'AI / Radiomics': 'Predictive model development interpretation',
  'Methodological / Analytical': 'Replication or confirmatory association interpretation',
}

const RETROSPECTIVE_GUARDRAIL_STUDY_TYPES = new Set([
  'Retrospective single-centre cohort',
  'Retrospective multi-centre cohort',
  'Retrospective longitudinal follow-up cohort',
  'Registry-based analysis',
  'Matched cohort comparative study (non-randomised)',
  'Nested case-control cohort study',
  'Case-control study',
  'Case series',
])

const STUDY_TYPE_DEFAULT_MODES: Record<string, InterpretationModeOption> = {
  'Case series': 'Descriptive phenotype characterization',
  'Narrative literature synthesis study': 'Pathophysiologic plausibility interpretation',
  'Scoping evidence synthesis study': 'Descriptive epidemiology and prevalence patterning',
  'Mechanistic imaging study': 'Hypothesis-generating mechanistic interpretation',
  'Prognostic model internal validation': 'Predictive model internal validation interpretation',
  'Prognostic model external validation': 'Predictive model external validation interpretation',
  'Risk score recalibration study': 'Time-to-event prognostic interpretation',
  'Dynamic risk prediction update study': 'Time-to-event prognostic interpretation',
  'Net reclassification improvement study': 'Time-to-event prognostic interpretation',
  'Prognostic imaging model development': 'Predictive model development interpretation',
  'Incremental prognostic value study': 'Time-to-event prognostic interpretation',
  'Imaging + biomarker integrated model': 'Predictive model development interpretation',
  'Diagnostic threshold optimisation study': 'Incremental diagnostic value interpretation',
  'Phenotype classification study': 'Predictive model development interpretation',
  'Imaging protocol optimisation study': 'Implementation and workflow feasibility interpretation',
  'Sequence parameter sensitivity study': 'Implementation and workflow feasibility interpretation',
  'Imaging-haemodynamic concordance profiling study': 'Replication or confirmatory association interpretation',
  'Imaging-catheterization timing concordance study': 'Replication or confirmatory association interpretation',
  'Imaging-exercise physiology integration study': 'Hypothesis-generating mechanistic interpretation',
  'Multimodality imaging comparison study': 'Comparative effectiveness interpretation (non-causal)',
  'AI imaging model internal validation': 'Predictive model internal validation interpretation',
  'AI imaging model external validation': 'Predictive model external validation interpretation',
  'Automated segmentation validation study': 'Predictive model internal validation interpretation',
  'Measurement harmonisation study': 'Implementation and workflow feasibility interpretation',
  'External data harmonisation study': 'Implementation and workflow feasibility interpretation',
  'Data integration methodology study': 'Implementation and workflow feasibility interpretation',
}

export function getStudyTypeDefaults(studyType: string): StudyTypeDefaults {
  const category = getCategoryForStudyType(studyType, true)
  const defaultMode =
    STUDY_TYPE_DEFAULT_MODES[studyType] ??
    (category ? CATEGORY_DEFAULT_INTERPRETATION_MODE[category] : undefined) ??
    DEFAULT_INTERPRETATION_MODE
  return {
    defaultInterpretationMode: defaultMode,
    enableConservativeGuardrails: RETROSPECTIVE_GUARDRAIL_STUDY_TYPES.has(studyType),
  }
}

export function getCategoryForStudyType(studyType: string, enableAiRadiomics = true): string | null {
  const taxonomy = getResearchTypeTaxonomy(enableAiRadiomics)
  const entry = taxonomy.find((category) => category.studyTypes.includes(studyType))
  return entry?.category ?? null
}

export function getStudyTypesForCategory(category: string, enableAiRadiomics = true): string[] {
  const taxonomy = getResearchTypeTaxonomy(enableAiRadiomics)
  const entry = taxonomy.find((item) => item.category === category)
  return entry ? [...entry.studyTypes] : []
}

export function getJournalSubmissionGuidanceUrl(journalSlug: string): string | null {
  const key = journalSlug.trim()
  if (!key) {
    return null
  }
  return JOURNAL_SUBMISSION_GUIDANCE_URLS[key] ?? null
}

export function mergeJournalOptions(apiJournals: JournalOption[]): JournalOption[] {
  const bySlug = new Map<string, JournalOption>()
  for (const journal of CURATED_CARDIOLOGY_IMAGING_JOURNALS) {
    bySlug.set(journal.slug, journal)
  }
  for (const journal of apiJournals) {
    bySlug.set(journal.slug, journal)
  }
  return Array.from(bySlug.values()).sort((left, right) => left.display_name.localeCompare(right.display_name))
}
