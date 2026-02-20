import type { JournalOption } from '@/types/study-core'

export const CURATED_CARDIOLOGY_IMAGING_JOURNALS: JournalOption[] = [
  { slug: 'circulation', display_name: 'Circulation', default_voice: 'technical' },
  { slug: 'european-heart-journal', display_name: 'European Heart Journal', default_voice: 'technical' },
  { slug: 'jacc', display_name: 'Journal of the American College of Cardiology', default_voice: 'technical' },
  { slug: 'jacc-cardiovascular-imaging', display_name: 'JACC: Cardiovascular Imaging', default_voice: 'technical' },
  { slug: 'jacc-heart-failure', display_name: 'JACC: Heart Failure', default_voice: 'technical' },
  { slug: 'jacc-clinical-electrophysiology', display_name: 'JACC: Clinical Electrophysiology', default_voice: 'technical' },
  { slug: 'heart-bmj', display_name: 'Heart', default_voice: 'technical' },
  { slug: 'ehj-cardiovascular-imaging', display_name: 'European Heart Journal - Cardiovascular Imaging', default_voice: 'technical' },
  {
    slug: 'international-journal-of-cardiovascular-imaging',
    display_name: 'International Journal of Cardiovascular Imaging',
    default_voice: 'technical',
  },
  {
    slug: 'journal-of-cardiovascular-magnetic-resonance',
    display_name: 'Journal of Cardiovascular Magnetic Resonance',
    default_voice: 'technical',
  },
  { slug: 'journal-of-nuclear-cardiology', display_name: 'Journal of Nuclear Cardiology', default_voice: 'technical' },
  { slug: 'circ-cardiovascular-imaging', display_name: 'Circulation: Cardiovascular Imaging', default_voice: 'technical' },
  { slug: 'radiology', display_name: 'Radiology', default_voice: 'technical' },
  { slug: 'radiology-cardiothoracic-imaging', display_name: 'Radiology: Cardiothoracic Imaging', default_voice: 'technical' },
  { slug: 'european-radiology', display_name: 'European Radiology', default_voice: 'technical' },
  { slug: 'american-journal-of-roentgenology', display_name: 'American Journal of Roentgenology', default_voice: 'technical' },
  { slug: 'insights-into-imaging', display_name: 'Insights into Imaging', default_voice: 'technical' },
  { slug: 'clinical-radiology', display_name: 'Clinical Radiology', default_voice: 'technical' },
  { slug: 'echocardiography', display_name: 'Echocardiography', default_voice: 'technical' },
  { slug: 'echo-research-practice', display_name: 'Echo Research and Practice', default_voice: 'technical' },
  { slug: 'cardiovascular-ultrasound', display_name: 'Cardiovascular Ultrasound', default_voice: 'technical' },
  { slug: 'catheterization-cardiovascular-interventions', display_name: 'Catheterization and Cardiovascular Interventions', default_voice: 'technical' },
  { slug: 'heart-rhythm', display_name: 'Heart Rhythm', default_voice: 'technical' },
  { slug: 'heart-lung-circulation', display_name: 'Heart, Lung and Circulation', default_voice: 'technical' },
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
  'Associative risk or prognostic inference',
  'Diagnostic performance interpretation',
  'Predictive model development interpretation',
  'Predictive model external validation interpretation',
  'Comparative effectiveness interpretation (non-causal)',
  'Hypothesis-generating mechanistic interpretation',
  'Replication or confirmatory association interpretation',
  'Safety and feasibility characterization',
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
