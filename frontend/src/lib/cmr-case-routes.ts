export type CmrCaseSection =
  | 'upload'
  | 'report'
  | 'rwma'
  | 'lge'
  | 'perfusion'
  | 'valves'
  | 'lv-thrombus'
  | 'ph'
  | 'output'

const VALID_SECTIONS = new Set<CmrCaseSection>([
  'upload',
  'report',
  'rwma',
  'lge',
  'perfusion',
  'valves',
  'lv-thrombus',
  'ph',
  'output',
])

export function buildCmrCasePath(caseId: string, section: CmrCaseSection = 'report'): string {
  return `/cmr/cases/${caseId}/${section}`
}

export function resolveCmrCaseSection(pathname: string): CmrCaseSection | null {
  const match = pathname.match(/^\/cmr\/cases\/[^/]+\/([^/?#]+)/)
  const section = match?.[1] ?? ''
  return VALID_SECTIONS.has(section as CmrCaseSection) ? (section as CmrCaseSection) : null
}
