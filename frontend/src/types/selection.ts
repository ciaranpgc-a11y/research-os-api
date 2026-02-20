export type ClaimTag = 'Descriptive' | 'Inferential' | 'Mechanistic' | 'Comparative'

export type ManuscriptSectionSlug =
  | 'title'
  | 'abstract'
  | 'introduction'
  | 'methods'
  | 'results'
  | 'discussion'
  | 'limitations'
  | 'conclusion'
  | 'figures'
  | 'tables'

export type EvidenceAnchor = {
  id: string
  label: string
  source: string
  confidence: 'High' | 'Moderate' | 'Preliminary'
}

export type ManuscriptParagraph = {
  id: string
  section: ManuscriptSectionSlug
  heading: string
  tag: ClaimTag
  text: string
  wordTarget: number
  evidenceAnchors: EvidenceAnchor[]
  citationSlots: number
  claimStrength: number
  suggestedCitations: string[]
}

export type ResultObject = {
  id: string
  type: 'Primary Endpoint' | 'Secondary Endpoint' | 'Subgroup' | 'Safety'
  effect: string
  ci: string
  model: string
  adjusted: boolean
  validated: boolean
  derivation: {
    dataset: string
    populationFilter: string
    covariates: string[]
    estimation: string
    validationChecks: string[]
  }
  citations: string[]
}

export type QCSeverity = 'High' | 'Medium' | 'Low'

export type QCItem = {
  id: string
  category:
    | 'Unsupported claims'
    | 'Missing citations'
    | 'Inconsistent numbers'
    | 'Journal non-compliance'
    | 'Word budget issues'
  severity: QCSeverity
  count: number
  summary: string
  affectedItems: string[]
  recommendation: string
  referenceGuidelines: string[]
}

export type ClaimSelection = {
  type: 'claim'
  data: ManuscriptParagraph
}

export type ResultSelection = {
  type: 'result'
  data: ResultObject
}

export type QCSelection = {
  type: 'qc'
  data: QCItem
}

export type SelectionItem = ClaimSelection | ResultSelection | QCSelection | null
