import { create } from 'zustand'
import { createJSONStorage, persist } from 'zustand/middleware'

import {
  createCmrCase,
  deleteCmrCase,
  getCmrCase,
  listCmrCases,
  updateCmrCase,
  type CmrCaseRecord,
  type CmrCaseSummary,
} from '@/lib/cmr-case-api'
import { getCmrCaseContentSections } from '@/lib/cmr-case-content'
import { normalizeCmrCasePayload, type CmrCasePayload } from '@/lib/cmr-case-defaults'

const SAVE_DELAY_MS = 350

type CmrCaseMetaPatch = Partial<
  Pick<CmrCaseRecord, 'title' | 'patient_label' | 'report_tag' | 'study_date' | 'status' | 'last_completed_step'>
>

type CmrCaseStore = {
  sessionScopeKey: string | null
  activeCaseId: string | null
  activeCase: CmrCaseRecord | null
  summaries: CmrCaseSummary[]
  localCases: Record<string, CmrCaseRecord>
  loadingCaseId: string | null
  loadingSummaries: boolean
  caseError: string | null
  saveStatus: 'idle' | 'saving' | 'error'
  saveError: string | null
  loadSummaries: () => Promise<CmrCaseSummary[]>
  createFreshCase: (title?: string) => Promise<CmrCaseRecord | null>
  loadCase: (caseId: string) => Promise<CmrCaseRecord | null>
  patchActiveCasePayload: (updater: (payload: CmrCasePayload) => CmrCasePayload) => void
  patchActiveCaseMeta: (patch: CmrCaseMetaPatch) => void
  syncSavedCaseMetadata: (record: CmrCaseRecord) => void
  deleteCase: (caseId: string) => Promise<boolean>
  flushActiveCase: () => Promise<boolean>
  syncSessionScope: (scopeKey: string | null) => void
  clearActiveCase: () => void
}

function upsertSummary(items: CmrCaseSummary[], nextItem: CmrCaseSummary): CmrCaseSummary[] {
  const nextItems = [nextItem, ...items.filter((item) => item.id !== nextItem.id)]
  nextItems.sort((left, right) => (right.updated_at ?? '').localeCompare(left.updated_at ?? ''))
  return nextItems
}

function isLocalCmrDevHost(): boolean {
  if (typeof window === 'undefined') return false
  const host = window.location.hostname
  return host === 'localhost' || host === '127.0.0.1'
}

function shouldUseLocalFallback(): boolean {
  return isLocalCmrDevHost()
}

function isLocalCaseId(caseId: string | null | undefined): boolean {
  return typeof caseId === 'string' && caseId.startsWith('local-')
}

function filterLocalOnlyCases<T extends { id: string }>(items: T[]): T[] {
  return items.filter((item) => isLocalCaseId(item.id))
}

function summarizeCase(record: CmrCaseRecord): CmrCaseSummary {
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
    content_sections: getCmrCaseContentSections(record.payload),
  }
}

function mergeCaseMetadata<T extends CmrCaseRecord | CmrCaseSummary>(current: T, saved: CmrCaseRecord): T {
  return {
    ...current,
    title: saved.title,
    patient_label: saved.patient_label,
    report_tag: saved.report_tag,
    study_date: saved.study_date,
    status: saved.status,
    last_completed_step: saved.last_completed_step,
    created_at: saved.created_at,
    updated_at: saved.updated_at,
  }
}

function persistLocalCaseState(
  state: CmrCaseStore,
  record: CmrCaseRecord,
): Pick<CmrCaseStore, 'activeCaseId' | 'activeCase' | 'localCases' | 'summaries' | 'caseError' | 'saveStatus' | 'saveError'> {
  const saved = {
    ...record,
    updated_at: new Date().toISOString(),
  }

  return {
    activeCaseId: saved.id,
    activeCase: saved,
    localCases: {
      ...state.localCases,
      [saved.id]: saved,
    },
    summaries: upsertSummary(state.summaries, summarizeCase(saved)),
    caseError: null,
    saveStatus: 'idle',
    saveError: null,
  }
}

function createLocalCase(title?: string): CmrCaseRecord {
  const now = new Date().toISOString()
  const caseId =
    typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
      ? `local-${crypto.randomUUID()}`
      : `local-${Date.now()}`

  return {
    id: caseId,
    title: title?.trim() || 'Untitled report',
    patient_label: null,
    report_tag: null,
    study_date: null,
    status: 'draft',
    last_completed_step: 'upload',
    created_at: now,
    updated_at: now,
    payload: normalizeCmrCasePayload({}),
  }
}

function cloneAsRecoveredLocalCase(record: CmrCaseRecord): CmrCaseRecord {
  const now = new Date().toISOString()
  const caseId =
    typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
      ? `local-${crypto.randomUUID()}`
      : `local-${Date.now()}`

  return {
    ...record,
    id: caseId,
    created_at: record.created_at ?? now,
    updated_at: now,
  }
}

function buildClearedCaseState(sessionScopeKey: string | null): Pick<
  CmrCaseStore,
  | 'sessionScopeKey'
  | 'activeCaseId'
  | 'activeCase'
  | 'summaries'
  | 'localCases'
  | 'loadingCaseId'
  | 'loadingSummaries'
  | 'caseError'
  | 'saveStatus'
  | 'saveError'
> {
  return {
    sessionScopeKey,
    activeCaseId: null,
    activeCase: null,
    summaries: [],
    localCases: {},
    loadingCaseId: null,
    loadingSummaries: false,
    caseError: null,
    saveStatus: 'idle',
    saveError: null,
  }
}

export const useCmrCaseStore = create<CmrCaseStore>()(
  persist(
    (set, get) => {
      let saveTimer: number | null = null

      const clearSaveTimer = () => {
        if (saveTimer !== null && typeof window !== 'undefined') {
          window.clearTimeout(saveTimer)
        }
        saveTimer = null
      }

      const persistActiveCase = async (): Promise<CmrCaseRecord | null> => {
        clearSaveTimer()
        const activeCase = get().activeCase
        if (!activeCase) return null

        set({ saveStatus: 'saving', saveError: null })
        try {
          if (isLocalCaseId(activeCase.id)) {
            const created = await createCmrCase(activeCase.title)
            const saved = await updateCmrCase(created.id, {
              title: activeCase.title,
              patient_label: activeCase.patient_label,
              report_tag: activeCase.report_tag,
              study_date: activeCase.study_date,
              status: activeCase.status,
              last_completed_step: activeCase.last_completed_step,
              payload: activeCase.payload,
            })
            set((state) => {
              const nextLocalCases = { ...state.localCases }
              delete nextLocalCases[activeCase.id]
              return {
                activeCase: saved,
                activeCaseId: saved.id,
                localCases: {
                  ...nextLocalCases,
                  [saved.id]: saved,
                },
                summaries: upsertSummary(
                  state.summaries.filter((item) => item.id !== activeCase.id),
                  saved,
                ),
                caseError: null,
                saveStatus: 'idle',
                saveError: null,
              }
            })
            return saved
          }

          const saved = await updateCmrCase(activeCase.id, {
            title: activeCase.title,
            patient_label: activeCase.patient_label,
            report_tag: activeCase.report_tag,
            study_date: activeCase.study_date,
            status: activeCase.status,
            last_completed_step: activeCase.last_completed_step,
            payload: activeCase.payload,
          })
          set((state) => ({
            activeCase: saved,
            activeCaseId: saved.id,
            summaries: upsertSummary(state.summaries, saved),
            caseError: null,
            saveStatus: 'idle',
            saveError: null,
          }))
          return saved
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : 'Failed to save report'
          if (errorMessage === 'Report not found' && !isLocalCaseId(activeCase.id)) {
            const recoveredCase = cloneAsRecoveredLocalCase(activeCase)
            set((state) => {
              const nextLocalCases = { ...state.localCases }
              delete nextLocalCases[activeCase.id]
              nextLocalCases[recoveredCase.id] = recoveredCase
              return {
                activeCaseId: recoveredCase.id,
                activeCase: recoveredCase,
                localCases: nextLocalCases,
                summaries: upsertSummary(
                  state.summaries.filter((item) => item.id !== activeCase.id && item.id !== recoveredCase.id),
                  summarizeCase(recoveredCase),
                ),
                caseError: null,
                saveStatus: 'idle',
                saveError: null,
              }
            })
            return recoveredCase
          }
          if (shouldUseLocalFallback()) {
            const saved = {
              ...activeCase,
              updated_at: new Date().toISOString(),
            }
            set((state) => persistLocalCaseState(state, saved))
            return saved
          }
          set({
            caseError: errorMessage,
            saveStatus: 'error',
            saveError: errorMessage,
          })
          return null
        }
      }

      const schedulePersist = () => {
        clearSaveTimer()
        if (typeof window === 'undefined') return
        saveTimer = window.setTimeout(() => {
          void persistActiveCase()
        }, SAVE_DELAY_MS)
      }

      return {
        sessionScopeKey: null,
        activeCaseId: null,
        activeCase: null,
        summaries: [],
        localCases: {},
        loadingCaseId: null,
        loadingSummaries: false,
        caseError: null,
        saveStatus: 'idle',
        saveError: null,
        loadSummaries: async () => {
          set({ loadingSummaries: true, caseError: null })
          try {
            const summaries = await listCmrCases()
            const cachedCases = Object.values(get().localCases)
            const serverCaseIds = new Set(summaries.map((summary) => summary.id))
            const staleRemoteCachedCases = cachedCases.filter(
              (record) => !isLocalCaseId(record.id) && !serverCaseIds.has(record.id),
            )
            const recoveredCases = shouldUseLocalFallback()
              ? staleRemoteCachedCases.map(cloneAsRecoveredLocalCase)
              : []
            const recoveredCaseMap = new Map(
              staleRemoteCachedCases
                .map((record, index) => [record.id, recoveredCases[index]])
                .filter((entry): entry is [string, CmrCaseRecord] => Boolean(entry[1])),
            )
            const localSummaries = [
              ...filterLocalOnlyCases(cachedCases).map(summarizeCase),
              ...recoveredCases.map(summarizeCase),
            ]
            const mergedSummaries = localSummaries.reduce(
              (items, summary) => upsertSummary(items, summary),
              summaries,
            )
            set((state) => ({
              summaries: mergedSummaries,
              localCases: (() => {
                const nextLocalCases = { ...state.localCases }
                for (const record of staleRemoteCachedCases) {
                  delete nextLocalCases[record.id]
                }
                for (const recovered of recoveredCases) {
                  nextLocalCases[recovered.id] = recovered
                }
                return nextLocalCases
              })(),
              activeCase: state.activeCase ? (recoveredCaseMap.get(state.activeCase.id) ?? state.activeCase) : state.activeCase,
              loadingSummaries: false,
              activeCaseId: state.activeCaseId ? (recoveredCaseMap.get(state.activeCaseId)?.id ?? state.activeCaseId) : state.activeCaseId,
            }))
            return mergedSummaries
          } catch (error) {
            if (shouldUseLocalFallback()) {
              const localSummaries = filterLocalOnlyCases(Object.values(get().localCases))
                .map(summarizeCase)
                .sort((left, right) => (right.updated_at ?? '').localeCompare(left.updated_at ?? ''))
              set({
                summaries: localSummaries,
                loadingSummaries: false,
                caseError: null,
              })
              return localSummaries
            }
            set({
              loadingSummaries: false,
              caseError: error instanceof Error ? error.message : 'Failed to load reports',
            })
            return []
          }
        },
        createFreshCase: async (title) => {
          if (get().activeCase) {
            const saved = await persistActiveCase()
            if (!saved) return null
          }
          try {
            const created = await createCmrCase(title)
            set((state) => ({
              activeCaseId: created.id,
              activeCase: created,
              localCases: {
                ...state.localCases,
                [created.id]: created,
              },
              summaries: upsertSummary(state.summaries, created),
              caseError: null,
              saveStatus: 'idle',
              saveError: null,
            }))
            return created
          } catch (error) {
            if (shouldUseLocalFallback()) {
              const created = createLocalCase(title)
              set((state) => persistLocalCaseState(state, created))
              return created
            }
            set({
              caseError: error instanceof Error ? error.message : 'Failed to create report',
            })
            return null
          }
        },
        loadCase: async (caseId) => {
          const current = get().activeCase
          if (current?.id === caseId) {
            set({ loadingCaseId: null, caseError: null })
            return current
          }
          if (current) {
            const saved = await persistActiveCase()
            if (!saved) return null
          }
          if (isLocalCaseId(caseId)) {
            const localCase = get().localCases[caseId]
            if (localCase) {
              set((state) => ({
                activeCaseId: localCase.id,
                activeCase: localCase,
                loadingCaseId: null,
                caseError: null,
                summaries: upsertSummary(state.summaries.filter((item) => item.id !== localCase.id), summarizeCase(localCase)),
              }))
              return localCase
            }
          }
          set({ loadingCaseId: caseId, caseError: null })
          try {
            const loaded = await getCmrCase(caseId)
            set((state) => ({
              activeCaseId: loaded.id,
              activeCase: loaded,
              localCases: {
                ...state.localCases,
                [loaded.id]: loaded,
              },
              loadingCaseId: null,
              caseError: null,
              summaries: upsertSummary(state.summaries, loaded),
            }))
            return loaded
          } catch (error) {
            if (shouldUseLocalFallback()) {
              const localCase = get().localCases[caseId]
              if (localCase) {
                set((state) => ({
                  activeCaseId: localCase.id,
                  activeCase: localCase,
                  loadingCaseId: null,
                  caseError: null,
                  summaries: upsertSummary(state.summaries, summarizeCase(localCase)),
                }))
                return localCase
              }
            }
            const errorMessage = error instanceof Error ? error.message : 'Failed to load report'
            const cachedCase = get().localCases[caseId]
            if (errorMessage === 'Report not found' && cachedCase) {
              const recoveredCase = cloneAsRecoveredLocalCase(cachedCase)
              set((state) => {
                const nextLocalCases = { ...state.localCases }
                delete nextLocalCases[caseId]
                nextLocalCases[recoveredCase.id] = recoveredCase
                return {
                  activeCaseId: recoveredCase.id,
                  activeCase: recoveredCase,
                  localCases: nextLocalCases,
                  loadingCaseId: null,
                  caseError: null,
                  saveStatus: 'idle',
                  saveError: null,
                  summaries: upsertSummary(
                    state.summaries.filter((item) => item.id !== caseId && item.id !== recoveredCase.id),
                    summarizeCase(recoveredCase),
                  ),
                }
              })
              return recoveredCase
            }
            set((state) => {
              const isMissingRemoteCase = errorMessage === 'Report not found' && !isLocalCaseId(caseId)
              const nextLocalCases = isMissingRemoteCase ? { ...state.localCases } : state.localCases
              if (isMissingRemoteCase) {
                delete nextLocalCases[caseId]
              }
              return {
                loadingCaseId: null,
                caseError: errorMessage,
                localCases: nextLocalCases,
                summaries: isMissingRemoteCase ? state.summaries.filter((item) => item.id !== caseId) : state.summaries,
              }
            })
            return null
          }
        },
        patchActiveCasePayload: (updater) => {
          set((state) => {
            if (!state.activeCase) return state
            const nextActiveCase = {
              ...state.activeCase,
              payload: normalizeCmrCasePayload(updater(state.activeCase.payload)),
              updated_at: new Date().toISOString(),
            }
            return {
              activeCase: nextActiveCase,
              localCases: {
                ...state.localCases,
                [nextActiveCase.id]: nextActiveCase,
              },
              summaries: upsertSummary(
                state.summaries.filter((item) => item.id !== nextActiveCase.id),
                summarizeCase(nextActiveCase),
              ),
              saveError: null,
            }
          })
          schedulePersist()
        },
        patchActiveCaseMeta: (patch) => {
          set((state) => {
            if (!state.activeCase) return state
            const nextActiveCase = {
              ...state.activeCase,
              ...patch,
              updated_at: new Date().toISOString(),
            }
            return {
              activeCase: nextActiveCase,
              localCases: {
                ...state.localCases,
                [nextActiveCase.id]: nextActiveCase,
              },
              summaries: upsertSummary(
                state.summaries.filter((item) => item.id !== nextActiveCase.id),
                summarizeCase(nextActiveCase),
              ),
              saveError: null,
            }
          })
          schedulePersist()
        },
        syncSavedCaseMetadata: (record) => {
          set((state) => {
            const activeCase =
              state.activeCase?.id === record.id
                ? mergeCaseMetadata(state.activeCase, record)
                : state.activeCase
            const cachedCase = state.localCases[record.id]
            const nextCachedCase = cachedCase
              ? mergeCaseMetadata(cachedCase, record)
              : activeCase?.id === record.id
                ? activeCase
                : null
            const existingSummary = state.summaries.find((summary) => summary.id === record.id)
            const nextSummary =
              activeCase?.id === record.id
                ? summarizeCase(activeCase)
                : nextCachedCase
                  ? summarizeCase(nextCachedCase)
                  : existingSummary
                    ? mergeCaseMetadata(existingSummary, record)
                    : summarizeCase(record)

            return {
              activeCase,
              localCases: nextCachedCase
                ? {
                    ...state.localCases,
                    [record.id]: nextCachedCase,
                  }
                : state.localCases,
              summaries: upsertSummary(state.summaries, nextSummary),
              caseError: null,
            }
          })
        },
        deleteCase: async (caseId) => {
          clearSaveTimer()
          const current = get().activeCase
          if (current && current.id !== caseId) {
            const saved = await persistActiveCase()
            if (!saved) return false
          }

          const applyDelete = () => {
            set((state) => {
              const nextLocalCases = { ...state.localCases }
              delete nextLocalCases[caseId]
              const deletingActive = state.activeCaseId === caseId
              return {
                activeCaseId: deletingActive ? null : state.activeCaseId,
                activeCase: deletingActive ? null : state.activeCase,
                localCases: nextLocalCases,
                summaries: state.summaries.filter((item) => item.id !== caseId),
                loadingCaseId: state.loadingCaseId === caseId ? null : state.loadingCaseId,
                caseError: null,
                saveStatus: deletingActive ? 'idle' : state.saveStatus,
                saveError: deletingActive ? null : state.saveError,
              }
            })
          }

          try {
            await deleteCmrCase(caseId)
            applyDelete()
            return true
          } catch (error) {
            if (shouldUseLocalFallback() && get().localCases[caseId]) {
              applyDelete()
              return true
            }
            set({
              caseError: error instanceof Error ? error.message : 'Failed to delete report',
            })
            return false
          }
        },
        flushActiveCase: async () => {
          if (!get().activeCase) return true
          const saved = await persistActiveCase()
          return saved !== null
        },
        syncSessionScope: (scopeKey) => {
          clearSaveTimer()
          set((state) => {
            if (state.sessionScopeKey === scopeKey) {
              return state
            }
            return buildClearedCaseState(scopeKey)
          })
        },
        clearActiveCase: () => {
          clearSaveTimer()
          set({
            activeCaseId: null,
            activeCase: null,
            loadingCaseId: null,
            caseError: null,
            saveStatus: 'idle',
            saveError: null,
          })
        },
      }
    },
    {
      name: 'cmr-case-store-v1',
      storage: createJSONStorage(() => window.localStorage),
      partialize: (state) => ({
        sessionScopeKey: state.sessionScopeKey,
        activeCaseId: state.activeCaseId,
        activeCase: state.activeCase,
        summaries: filterLocalOnlyCases(state.summaries),
        localCases: Object.fromEntries(
          Object.entries(state.localCases).filter(([caseId]) => isLocalCaseId(caseId)),
        ),
      }),
    },
  ),
)
