import { createDefaultCmrCasePayload, type CmrCasePayload } from '@/lib/cmr-case-defaults'

export type CmrCaseContentSection =
  | 'upload'
  | 'metrics'
  | 'previous-studies'
  | 'rwma'
  | 'lge'
  | 'perfusion'
  | 'valves'
  | 'thrombus'
  | 'ph'

const DEFAULT_PH = createDefaultCmrCasePayload().ph

export const CMR_CASE_CONTENT_LABELS: Record<CmrCaseContentSection, string> = {
  upload: 'Upload',
  metrics: 'Metrics',
  'previous-studies': 'Prev studies',
  rwma: 'Wall motion',
  lge: 'Tissue',
  perfusion: 'Perfusion',
  valves: 'Valves',
  thrombus: 'Thrombus',
  ph: 'PH',
}

function hasNonZeroStates(states: Record<number, number> | null | undefined): boolean {
  return Object.values(states ?? {}).some((value) => Number(value) > 0)
}

function hasValveContent(payload: CmrCasePayload['valves'] | null | undefined): boolean {
  const morphologies = payload?.morphologies ?? {}
  return Object.values(morphologies).some((valve) =>
    Object.values(valve.findings ?? {}).some((finding) =>
      finding.leaflets.length > 0
      || Object.values(finding.detailValues).some((value) => value.trim().length > 0)
      || finding.notes.trim().length > 0,
    ),
  )
}

function hasThrombusContent(payload: CmrCasePayload['thrombus'] | null | undefined): boolean {
  return (payload?.entries ?? []).some((entry) =>
    entry.primary != null
    || entry.sublocation != null
    || entry.otherLocation.trim().length > 0
    || entry.confidence != null
    || (entry.morphology.maxDiameter ?? 0) > 0
    || entry.morphology.shape != null
    || entry.morphology.mobility != null
    || entry.morphology.attachment != null
    || entry.morphology.surface != null,
  )
}

function hasPhContent(payload: CmrCasePayload['ph'] | null | undefined): boolean {
  if (!payload) return false

  if (Object.values(payload.manualNumeric ?? {}).some((value) => value.trim().length > 0)) {
    return true
  }

  if (Object.values(payload.texts ?? {}).some((value) => value.trim().length > 0)) {
    return true
  }

  const defaultChoices = DEFAULT_PH.choices
  return Object.entries(payload.choices ?? {}).some(([key, value]) => value !== defaultChoices[key])
}

export function getCmrCaseContentSections(payload: CmrCasePayload | null | undefined): CmrCaseContentSection[] {
  if (!payload) return []

  const sections: CmrCaseContentSection[] = []

  if (
    payload.reportInput.reportText.trim().length > 0
    || payload.reportInput.fileName != null
    || payload.extractionResult != null
  ) {
    sections.push('upload')
  }

  if (payload.extractionResult != null) {
    sections.push('metrics')
  }

  if (payload.previousStudies.length > 0) {
    sections.push('previous-studies')
  }

  if (hasNonZeroStates(payload.rwma.segStates)) {
    sections.push('rwma')
  }

  if (
    hasNonZeroStates(payload.lge.segStates)
    || hasNonZeroStates(payload.lge.patternStates)
    || (payload.lge.llmProse?.trim().length ?? 0) > 0
  ) {
    sections.push('lge')
  }

  if (
    hasNonZeroStates(payload.perfusion.stressSegStates)
    || hasNonZeroStates(payload.perfusion.restSegStates)
    || payload.perfusion.stressPersistenceBeats > 0
    || payload.perfusion.restPersistenceBeats > 0
    || (payload.perfusion.llmProse?.trim().length ?? 0) > 0
  ) {
    sections.push('perfusion')
  }

  if (hasValveContent(payload.valves)) {
    sections.push('valves')
  }

  if (hasThrombusContent(payload.thrombus)) {
    sections.push('thrombus')
  }

  if (hasPhContent(payload.ph)) {
    sections.push('ph')
  }

  return sections
}
