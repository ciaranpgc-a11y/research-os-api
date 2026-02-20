import { create } from 'zustand'
import { createJSONStorage, persist } from 'zustand/middleware'

import type {
  DataAsset,
  ManuscriptTable,
  SheetData,
  WorkingTable,
  WorkingTableColumnMeta,
  WorkingTableMetadata,
} from '@/types/data-workspace'

type DataWorkspaceStore = {
  dataAssets: DataAsset[]
  workingTables: WorkingTable[]
  manuscriptTables: ManuscriptTable[]
  addDataAsset: (asset: DataAsset) => void
  removeDataAsset: (assetId: string) => void
  createWorkingTableFromSheet: (assetId: string, sheetName: string) => string | null
  createWorkingTable: (name?: string) => string
  setWorkingTable: (table: WorkingTable) => void
  removeWorkingTable: (tableId: string) => void
  createManuscriptTable: () => string
  setManuscriptTable: (table: ManuscriptTable) => void
  removeManuscriptTable: (tableId: string) => void
}

function createId(prefix: string): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return `${prefix}-${crypto.randomUUID()}`
  }
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
}

function dedupeName(name: string, existingNames: string[]): string {
  if (!existingNames.includes(name)) {
    return name
  }
  let suffix = 2
  while (existingNames.includes(`${name} (${suffix})`)) {
    suffix += 1
  }
  return `${name} (${suffix})`
}

function buildWorkingTableFromSheet(assetName: string, sheet: SheetData, existingNames: string[]): WorkingTable {
  const baseName = dedupeName(`${assetName} - ${sheet.name}`, existingNames)
  const columnMeta = sheet.columns.reduce<Record<string, WorkingTableColumnMeta>>((accumulator, column) => {
    accumulator[column] = { dataType: 'text' }
    return accumulator
  }, {})
  const metadata: WorkingTableMetadata = {
    tableType: 'Imported worksheet',
    description: '',
    provenance: `${assetName} / ${sheet.name}`,
    conventions: '',
    lastEditedAt: new Date().toISOString(),
  }
  return {
    id: createId('worktable'),
    name: baseName,
    columns: [...sheet.columns],
    rows: sheet.rows.map((row) =>
      sheet.columns.reduce<Record<string, string>>((accumulator, column) => {
        accumulator[column] = row[column] ?? ''
        return accumulator
      }, {}),
    ),
    metadata,
    columnMeta,
    footnotes: [],
    abbreviations: [],
  }
}

function buildBlankWorkingTable(name: string, existingNames: string[]): WorkingTable {
  const columns = ['Column 1', 'Column 2', 'Column 3']
  const columnMeta = columns.reduce<Record<string, WorkingTableColumnMeta>>((accumulator, column) => {
    accumulator[column] = { dataType: 'text' }
    return accumulator
  }, {})
  return {
    id: createId('worktable'),
    name: dedupeName(name, existingNames),
    columns,
    rows: [
      { 'Column 1': '', 'Column 2': '', 'Column 3': '' },
      { 'Column 1': '', 'Column 2': '', 'Column 3': '' },
    ],
    metadata: {
      tableType: 'Working table',
      description: '',
      provenance: '',
      conventions: '',
      lastEditedAt: new Date().toISOString(),
    },
    columnMeta,
    footnotes: [],
    abbreviations: [],
  }
}

function buildBlankManuscriptTable(index: number): ManuscriptTable {
  return {
    id: createId('mtable'),
    title: `Table ${index}`,
    caption: '',
    footnote: '',
    columns: ['Column 1', 'Column 2', 'Column 3'],
    rows: [
      ['', '', ''],
      ['', '', ''],
      ['', '', ''],
    ],
  }
}

export const useDataWorkspaceStore = create<DataWorkspaceStore>()(
  persist(
    (set, get) => ({
      dataAssets: [],
      workingTables: [],
      manuscriptTables: [],
      addDataAsset: (asset) => {
        set((state) => ({
          dataAssets: [asset, ...state.dataAssets],
        }))
      },
      removeDataAsset: (assetId) => {
        set((state) => ({
          dataAssets: state.dataAssets.filter((asset) => asset.id !== assetId),
        }))
      },
      createWorkingTableFromSheet: (assetId, sheetName) => {
        const state = get()
        const asset = state.dataAssets.find((item) => item.id === assetId)
        if (!asset) {
          return null
        }
        const sheet = asset.sheets.find((item) => item.name === sheetName)
        if (!sheet) {
          return null
        }
        const table = buildWorkingTableFromSheet(
          asset.name,
          sheet,
          state.workingTables.map((item) => item.name),
        )
        set({
          workingTables: [table, ...state.workingTables],
        })
        return table.id
      },
      createWorkingTable: (name = 'Working Table') => {
        const state = get()
        const table = buildBlankWorkingTable(
          name,
          state.workingTables.map((item) => item.name),
        )
        set({
          workingTables: [table, ...state.workingTables],
        })
        return table.id
      },
      setWorkingTable: (table) => {
        set((state) => ({
          workingTables: state.workingTables.map((item) => (item.id === table.id ? table : item)),
        }))
      },
      removeWorkingTable: (tableId) => {
        set((state) => ({
          workingTables: state.workingTables.filter((item) => item.id !== tableId),
        }))
      },
      createManuscriptTable: () => {
        const state = get()
        const table = buildBlankManuscriptTable(state.manuscriptTables.length + 1)
        set({
          manuscriptTables: [table, ...state.manuscriptTables],
        })
        return table.id
      },
      setManuscriptTable: (table) => {
        set((state) => ({
          manuscriptTables: state.manuscriptTables.map((item) => (item.id === table.id ? table : item)),
        }))
      },
      removeManuscriptTable: (tableId) => {
        set((state) => ({
          manuscriptTables: state.manuscriptTables.filter((item) => item.id !== tableId),
        }))
      },
    }),
    {
      name: 'aawe-data-workspace-v1',
      storage: createJSONStorage(() => window.localStorage),
      partialize: (state) => ({
        dataAssets: state.dataAssets,
        workingTables: state.workingTables,
        manuscriptTables: state.manuscriptTables,
      }),
    },
  ),
)
