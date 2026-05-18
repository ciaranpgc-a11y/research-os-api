type Listener = () => void

const reportOutputDraftsByCaseId = new Map<string, string>()
const listeners = new Set<Listener>()

function normalizeCaseId(caseId: string | null | undefined): string | null {
  const value = String(caseId ?? '').trim()
  return value.length > 0 ? value : null
}

function emitChange(): void {
  listeners.forEach((listener) => listener())
}

export function getCmrReportOutputDraft(caseId: string | null | undefined): string | null {
  const normalizedCaseId = normalizeCaseId(caseId)
  if (!normalizedCaseId) {
    return null
  }
  return reportOutputDraftsByCaseId.get(normalizedCaseId) ?? null
}

export function setCmrReportOutputDraft(caseId: string | null | undefined, text: string | null | undefined): void {
  const normalizedCaseId = normalizeCaseId(caseId)
  if (!normalizedCaseId) {
    return
  }

  const nextText = String(text ?? '')
  const previousText = reportOutputDraftsByCaseId.get(normalizedCaseId) ?? null
  const normalizedNextText = nextText.length > 0 ? nextText : null
  if (previousText === normalizedNextText) {
    return
  }

  if (normalizedNextText === null) {
    reportOutputDraftsByCaseId.delete(normalizedCaseId)
  } else {
    reportOutputDraftsByCaseId.set(normalizedCaseId, normalizedNextText)
  }
  emitChange()
}

export function subscribeCmrReportOutputDrafts(listener: Listener): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}
