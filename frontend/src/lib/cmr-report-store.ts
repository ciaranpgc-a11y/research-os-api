/**
 * CMR report state helpers backed by the active persisted case.
 */
import type { CmrExtractedDemographics, CmrExtractionResult } from '@/lib/cmr-api'
import { createDefaultCmrCasePayload, type CmrReportInput } from '@/lib/cmr-case-defaults'
import { useCmrCaseStore } from '@/store/use-cmr-case-store'

type Listener = () => void

function getPayload() {
  return useCmrCaseStore.getState().activeCase?.payload ?? createDefaultCmrCasePayload()
}

export function getExtractionResult(): CmrExtractionResult | null {
  return getPayload().extractionResult
}

export function setExtractionResult(result: CmrExtractionResult | null): void {
  useCmrCaseStore.getState().patchActiveCasePayload((payload) => ({
    ...payload,
    extractionResult: result,
  }))
}

export function setExtractionDemographics(update: Partial<CmrExtractedDemographics>): void {
  useCmrCaseStore.getState().patchActiveCasePayload((payload) => {
    const current = payload.extractionResult
    if (!current) {
      return {
        ...payload,
        extractionResult: {
          demographics: { ...update },
          measurements: [],
        },
      }
    }

    return {
      ...payload,
      extractionResult: {
        ...current,
        demographics: {
          ...current.demographics,
          ...update,
        },
      },
    }
  })
}

export function setExtractionMeasurement(parameter: string, value: number | null): void {
  const normalizedParameter = parameter.trim()
  if (!normalizedParameter) return

  useCmrCaseStore.getState().patchActiveCasePayload((payload) => {
    const current = payload.extractionResult
    if (!current) {
      if (value == null) return payload
      return {
        ...payload,
        extractionResult: {
          demographics: {},
          measurements: [{ parameter: normalizedParameter, value }],
        },
      }
    }

    const existingIndex = current.measurements.findIndex((measurement) => measurement.parameter === normalizedParameter)
    const nextMeasurements = [...current.measurements]

    if (value == null) {
      if (existingIndex === -1) return payload
      nextMeasurements.splice(existingIndex, 1)
    } else if (existingIndex === -1) {
      nextMeasurements.push({ parameter: normalizedParameter, value })
    } else {
      nextMeasurements[existingIndex] = { ...nextMeasurements[existingIndex], value }
    }

    return {
      ...payload,
      extractionResult: {
        ...current,
        measurements: nextMeasurements,
      },
    }
  })
}

export function subscribeExtractionResult(fn: Listener): () => void {
  let previous = getExtractionResult()
  return useCmrCaseStore.subscribe((state) => {
    const next = state.activeCase?.payload.extractionResult ?? null
    if (next === previous) return
    previous = next
    fn()
  })
}

export function getNonContrast(): boolean {
  return getPayload().reportInput.nonContrast
}

export function setNonContrast(value: boolean): void {
  useCmrCaseStore.getState().patchActiveCasePayload((payload) => ({
    ...payload,
    reportInput: {
      ...payload.reportInput,
      nonContrast: value,
    },
  }))
}

export function subscribeNonContrast(fn: Listener): () => void {
  let previous = getNonContrast()
  return useCmrCaseStore.subscribe((state) => {
    const next = state.activeCase?.payload.reportInput.nonContrast ?? false
    if (next === previous) return
    previous = next
    fn()
  })
}

export function getReportInput(): CmrReportInput {
  return getPayload().reportInput
}

export function setReportInput(update: Partial<CmrReportInput>): void {
  useCmrCaseStore.getState().patchActiveCasePayload((payload) => ({
    ...payload,
    reportInput: {
      ...payload.reportInput,
      ...update,
    },
  }))
}

export function subscribeReportInput(fn: Listener): () => void {
  let previous = getReportInput()
  return useCmrCaseStore.subscribe((state) => {
    const next = state.activeCase?.payload.reportInput ?? createDefaultCmrCasePayload().reportInput
    if (
      next.reportText === previous.reportText
      && next.reportType === previous.reportType
      && next.fourDFlow === previous.fourDFlow
      && next.nonContrast === previous.nonContrast
      && next.fileName === previous.fileName
    ) {
      return
    }
    previous = next
    fn()
  })
}
