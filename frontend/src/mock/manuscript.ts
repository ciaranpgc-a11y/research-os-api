import type { ManuscriptParagraph } from '@/types/selection'

export const manuscriptParagraphs: ManuscriptParagraph[] = [
  {
    id: 'intro-p1',
    section: 'introduction',
    heading: 'Clinical Burden',
    tag: 'Descriptive',
    text: 'Hospitalized heart failure remains associated with a high 90-day readmission burden despite guideline-directed therapy.',
    wordTarget: 60,
    evidenceAnchors: [
      {
        id: 'ehr-cohort-overview',
        label: 'Registry baseline report',
        source: 'Internal HF Registry 2019-2024',
        confidence: 'High',
      },
      {
        id: 'aha-epidemiology',
        label: 'National epidemiology benchmark',
        source: 'AHA Scientific Statement 2024',
        confidence: 'Moderate',
      },
    ],
    citationSlots: 2,
    claimStrength: 82,
    suggestedCitations: ['AHA 2024 HF Statement', 'ESC 2023 Heart Failure Guidelines'],
  },
  {
    id: 'methods-p1',
    section: 'methods',
    heading: 'Population Definition',
    tag: 'Mechanistic',
    text: 'Eligible admissions were adults with primary ICD-10 heart failure codes, excluding transplant and palliative-only episodes to preserve treatment comparability.',
    wordTarget: 78,
    evidenceAnchors: [
      {
        id: 'phenotype-logic',
        label: 'Inclusion/exclusion phenotype logic',
        source: 'SQL Phenotype v3.2',
        confidence: 'High',
      },
      {
        id: 'chart-review-kappa',
        label: 'Chart review agreement',
        source: 'Validation Memo kappa=0.89',
        confidence: 'High',
      },
    ],
    citationSlots: 1,
    claimStrength: 91,
    suggestedCitations: ['STROBE Checklist', 'ICD-10 Coding Validation Framework'],
  },
  {
    id: 'results-p1',
    section: 'results',
    heading: 'Primary Endpoint Signal',
    tag: 'Inferential',
    text: 'The intervention cohort showed a lower 90-day readmission risk compared with standard care after multivariable adjustment.',
    wordTarget: 68,
    evidenceAnchors: [
      {
        id: 'res-001',
        label: 'Primary adjusted model output',
        source: 'Result Object RES-001',
        confidence: 'High',
      },
      {
        id: 'bootstrap-valid',
        label: 'Bootstrap calibration check',
        source: 'Validation Pipeline v2',
        confidence: 'Moderate',
      },
    ],
    citationSlots: 1,
    claimStrength: 88,
    suggestedCitations: ['TRIPOD-AI Guidance 2024'],
  },
  {
    id: 'discussion-p1',
    section: 'discussion',
    heading: 'Interpretation in Practice',
    tag: 'Comparative',
    text: 'Observed effect magnitude aligns with contemporary pragmatic heart failure programs while retaining significance after sensitivity analysis.',
    wordTarget: 72,
    evidenceAnchors: [
      {
        id: 'sensitivity-pack',
        label: 'Sensitivity models bundle',
        source: 'Result Objects RES-003 to RES-006',
        confidence: 'Moderate',
      },
      {
        id: 'external-compare',
        label: 'External benchmark cohort',
        source: 'Regional HF Learning Network',
        confidence: 'Preliminary',
      },
    ],
    citationSlots: 2,
    claimStrength: 74,
    suggestedCitations: ['JACC HF Pragmatic Programs Review', 'ESC Pragmatic Trials Position Paper'],
  },
]
