export type InsightSelectionType = 'claim' | 'result' | 'qc'

export type InsightEvidence = {
  id: string
  label: string
  source: string
  confidence?: string | null
}

export type InsightDerivation = {
  dataset: string
  population_filter: string
  model: string
  covariates: string[]
  validation_checks: string[]
  notes: string[]
}

export type SelectionInsight = {
  selection_type: InsightSelectionType
  item_id: string
  title: string
  summary: string
  evidence: InsightEvidence[]
  qc: string[]
  derivation: InsightDerivation
  citations: string[]
}

export type ApiErrorPayload = {
  error?: {
    message?: string
    type?: string
    detail?: string
  }
}
