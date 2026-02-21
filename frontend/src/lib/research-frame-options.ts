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

export const RESEARCH_TYPE_OPTIONS = [
  'Retrospective observational cohort',
  'Prospective observational cohort',
  'Registry-based observational analysis',
  'Case-control observational study',
  'Case series',
  'Cross-sectional imaging biomarker study',
  'Diagnostic accuracy imaging study',
  'Prognostic imaging model study',
  'Imaging reproducibility and inter-reader variability study',
  'Imaging protocol optimization study',
  'Radiomics or AI imaging model development',
  'Radiomics or AI imaging model external validation',
  'Multimodality imaging comparative study',
  'Methodological or technical validation study',
] as const

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
