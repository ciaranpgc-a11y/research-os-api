import { beforeEach, describe, expect, it } from 'vitest'

import type { CmrCaseRecord } from '@/lib/cmr-case-api'
import { normalizeCmrCasePayload } from '@/lib/cmr-case-defaults'
import { setExtractionDemographics } from '@/lib/cmr-report-store'
import { useCmrCaseStore } from '@/store/use-cmr-case-store'

function makeRecord(payload: CmrCaseRecord['payload']): CmrCaseRecord {
  const now = '2026-05-15T12:00:00.000Z'
  return {
    id: 'case-age',
    title: 'Age test',
    patient_label: null,
    report_tag: null,
    study_date: null,
    status: 'draft',
    last_completed_step: 'report',
    created_at: now,
    updated_at: now,
    payload,
  }
}

describe('setExtractionDemographics', () => {
  beforeEach(() => {
    window.localStorage.clear()
    ;(useCmrCaseStore as typeof useCmrCaseStore & { persist?: { clearStorage: () => void } }).persist?.clearStorage()
    useCmrCaseStore.setState({
      activeCaseId: null,
      activeCase: null,
      summaries: [],
      localCases: {},
      loadingCaseId: null,
      loadingSummaries: false,
      caseError: null,
      saveStatus: 'idle',
      saveError: null,
    })
  })

  it('updates demographic age without dropping existing measurements', () => {
    const record = makeRecord(normalizeCmrCasePayload({
      extractionResult: {
        demographics: { sex: 'Male' },
        measurements: [{ parameter: 'LV EF', value: 58 }],
      },
    }))
    useCmrCaseStore.setState({ activeCaseId: record.id, activeCase: record })

    setExtractionDemographics({ age: 54 })

    expect(useCmrCaseStore.getState().activeCase?.payload.extractionResult).toEqual({
      demographics: { sex: 'Male', age: 54 },
      measurements: [{ parameter: 'LV EF', value: 58 }],
    })
  })

  it('creates an extraction result when demographics are added to an empty case', () => {
    const record = makeRecord(normalizeCmrCasePayload({ extractionResult: null }))
    useCmrCaseStore.setState({ activeCaseId: record.id, activeCase: record })

    setExtractionDemographics({ age: 61 })

    expect(useCmrCaseStore.getState().activeCase?.payload.extractionResult).toEqual({
      demographics: { age: 61 },
      measurements: [],
    })
  })
})
