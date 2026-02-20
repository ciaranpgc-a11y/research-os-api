export type QCIssueSummary = {
  id: string
  category: string
  severity: "high" | "medium" | "low"
  count: number
  summary: string
}

export type QCRunResponse = {
  run_id: string
  generated_at: string
  total_findings: number
  high_severity_count: number
  medium_severity_count: number
  low_severity_count: number
  issues: QCIssueSummary[]
}
