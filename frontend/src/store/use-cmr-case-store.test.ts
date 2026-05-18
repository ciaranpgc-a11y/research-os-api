import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { CmrCaseRecord, CmrCaseSummary } from '@/lib/cmr-case-api'
import { normalizeCmrCasePayload } from '@/lib/cmr-case-defaults'

const cmrCaseApiMocks = vi.hoisted(() => ({
  createCmrCase: vi.fn(),
  deleteCmrCase: vi.fn(),
  getCmrCase: vi.fn(),
  listCmrCases: vi.fn(),
  updateCmrCase: vi.fn(),
}))

vi.mock('@/lib/cmr-case-api', () => cmrCaseApiMocks)

import { useCmrCaseStore } from '@/store/use-cmr-case-store'

function makeRecord(overrides: Partial<CmrCaseRecord> = {}): CmrCaseRecord {
  const now = '2026-04-14T09:15:00.000Z'
  return {
    id: 'case-1',
    title: 'Report 1',
    patient_label: null,
    report_tag: null,
    study_date: '2026-04-14',
    status: 'draft',
    last_completed_step: 'upload',
    created_at: now,
    updated_at: now,
    payload: normalizeCmrCasePayload({}),
    ...overrides,
  }
}

function makeSummary(record: CmrCaseRecord): CmrCaseSummary {
  return {
    id: record.id,
    title: record.title,
    patient_label: record.patient_label,
    report_tag: record.report_tag,
    study_date: record.study_date,
    status: record.status,
    last_completed_step: record.last_completed_step,
    created_at: record.created_at,
    updated_at: record.updated_at,
    content_sections: [],
  }
}

describe('useCmrCaseStore', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    window.localStorage.clear()
    ;(useCmrCaseStore as typeof useCmrCaseStore & { persist?: { clearStorage: () => void } }).persist?.clearStorage()
    useCmrCaseStore.getState().syncSessionScope(null)
    useCmrCaseStore.getState().syncSessionScope('cmr-access:test')
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

  it('returns the current case without re-saving when the requested case is already active', async () => {
    const current = makeRecord({ id: 'case-current', title: 'Current report' })

    useCmrCaseStore.setState({
      activeCaseId: current.id,
      activeCase: current,
      summaries: [makeSummary(current)],
      localCases: { [current.id]: current },
    })

    const loaded = await useCmrCaseStore.getState().loadCase(current.id)

    expect(loaded).toEqual(current)
    expect(cmrCaseApiMocks.updateCmrCase).not.toHaveBeenCalled()
    expect(cmrCaseApiMocks.getCmrCase).not.toHaveBeenCalled()
    expect(useCmrCaseStore.getState().caseError).toBeNull()
  })

  it('keeps saved metadata on the active case so later saves do not restore an old tag', async () => {
    const localPayload = normalizeCmrCasePayload({
      reportInput: {
        reportText: 'Unsaved local report text',
      },
    })
    const serverPayload = normalizeCmrCasePayload({
      reportInput: {
        reportText: 'Persisted server report text',
      },
    })
    const current = makeRecord({
      id: 'case-current',
      title: 'Current report',
      report_tag: null,
      payload: localPayload,
    })
    const saved = makeRecord({
      ...current,
      report_tag: 'Stress testing',
      updated_at: '2026-04-14T10:15:00.000Z',
      payload: serverPayload,
    })

    cmrCaseApiMocks.updateCmrCase.mockResolvedValue(saved)

    useCmrCaseStore.setState({
      activeCaseId: current.id,
      activeCase: current,
      summaries: [makeSummary(current)],
      localCases: { [current.id]: current },
    })

    useCmrCaseStore.getState().syncSavedCaseMetadata(saved)

    const synced = useCmrCaseStore.getState()
    expect(synced.activeCase?.report_tag).toBe('Stress testing')
    expect(synced.activeCase?.updated_at).toBe(saved.updated_at)
    expect(synced.activeCase?.payload).toEqual(localPayload)
    expect(synced.localCases[current.id]?.report_tag).toBe('Stress testing')
    expect(synced.localCases[current.id]?.payload).toEqual(localPayload)
    expect(synced.summaries.find((summary) => summary.id === current.id)?.report_tag).toBe('Stress testing')

    await useCmrCaseStore.getState().flushActiveCase()

    expect(cmrCaseApiMocks.updateCmrCase).toHaveBeenCalledWith(current.id, {
      title: current.title,
      patient_label: current.patient_label,
      report_tag: 'Stress testing',
      study_date: current.study_date,
      status: current.status,
      last_completed_step: current.last_completed_step,
      payload: localPayload,
    })
  })

  it('recovers a missing active report locally before opening the requested report', async () => {
    const missingCurrent = makeRecord({ id: 'case-missing', title: 'Missing report' })
    const target = makeRecord({ id: 'case-target', title: 'Target report' })

    cmrCaseApiMocks.updateCmrCase.mockRejectedValue(new Error('Report not found'))
    cmrCaseApiMocks.getCmrCase.mockResolvedValue(target)

    useCmrCaseStore.setState({
      activeCaseId: missingCurrent.id,
      activeCase: missingCurrent,
      summaries: [makeSummary(missingCurrent)],
      localCases: { [missingCurrent.id]: missingCurrent },
    })

    const loaded = await useCmrCaseStore.getState().loadCase(target.id)
    const state = useCmrCaseStore.getState()
    const localCaseIds = Object.keys(state.localCases).filter((caseId) => caseId.startsWith('local-'))

    expect(loaded?.id).toBe(target.id)
    expect(cmrCaseApiMocks.updateCmrCase).toHaveBeenCalledWith(missingCurrent.id, {
      title: missingCurrent.title,
      patient_label: missingCurrent.patient_label,
      report_tag: missingCurrent.report_tag,
      study_date: missingCurrent.study_date,
      status: missingCurrent.status,
      last_completed_step: missingCurrent.last_completed_step,
      payload: missingCurrent.payload,
    })
    expect(cmrCaseApiMocks.getCmrCase).toHaveBeenCalledWith(target.id)
    expect(state.activeCaseId).toBe(target.id)
    expect(state.activeCase?.id).toBe(target.id)
    expect(state.caseError).toBeNull()
    expect(state.summaries.some((summary) => summary.id === missingCurrent.id)).toBe(false)
    expect(localCaseIds.length).toBe(1)
  })
})
