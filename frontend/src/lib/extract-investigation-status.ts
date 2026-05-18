export const INVESTIGATION_STATUSES = [
  'Not started',
  'Requested',
  'Scheduled',
  'Await report',
  'Completed',
  'Not done',
  'Not appropriate',
  'Emailed',
  'Declined',
] as const

export type InvestigationStatus = (typeof INVESTIGATION_STATUSES)[number]
export type InvestigationStatusValue = InvestigationStatus | ''

const LEGACY_STATUS_ALIASES: Record<string, InvestigationStatus> = {
  Booked: 'Requested',
  Pending: 'Await report',
}

const COUNTLESS_STATUSES = new Set<string>([
  '',
  'Not started',
  'Requested',
  'Scheduled',
  'Await report',
  'Emailed',
  'Declined',
  'Not done',
])

export function normalizeInvestigationStatus(value: string | null | undefined): string {
  const trimmed = String(value ?? '').trim()
  if (!trimmed) return ''
  return LEGACY_STATUS_ALIASES[trimmed] ?? trimmed
}

export function displayInvestigationStatus(
  value: string | null | undefined,
  recordCount: number,
): string {
  const normalized = normalizeInvestigationStatus(value)
  if (normalized) return normalized
  return recordCount > 0 ? 'Completed' : 'Not started'
}

export function nextInvestigationStatus(
  current: string | null | undefined,
  _modality?: string,
): InvestigationStatusValue {
  const effectiveCurrent = normalizeInvestigationStatus(current) || 'Not started'
  const idx = INVESTIGATION_STATUSES.indexOf(effectiveCurrent as InvestigationStatus)
  if (idx < 0) return INVESTIGATION_STATUSES[0]
  return idx === INVESTIGATION_STATUSES.length - 1
    ? INVESTIGATION_STATUSES[0]
    : INVESTIGATION_STATUSES[idx + 1]
}

export function shouldShowInvestigationRecordCount(
  status: string | null | undefined,
  recordCount: number,
): boolean {
  return recordCount > 0 && !COUNTLESS_STATUSES.has(normalizeInvestigationStatus(status))
}
