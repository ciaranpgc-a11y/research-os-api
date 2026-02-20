export type SheetData = {
  name: string
  columns: string[]
  rows: Record<string, string>[]
}

export type DataAsset = {
  id: string
  name: string
  kind: 'csv' | 'xlsx'
  uploadedAt: string
  sheets: SheetData[]
}

export type WorkingTable = {
  id: string
  name: string
  columns: string[]
  rows: Record<string, string>[]
}

export type ManuscriptTable = {
  id: string
  title: string
  caption?: string
  footnote?: string
  columns: string[]
  rows: string[][]
}

