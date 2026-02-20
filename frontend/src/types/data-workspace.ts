export type SheetData = {
  name: string
  columns: string[]
  rows: Record<string, string>[]
}

export type WorkingTableColumnType = 'text' | 'number' | 'integer' | 'boolean' | 'date'

export type WorkingTableColumnMeta = {
  dataType: WorkingTableColumnType
  unit?: string
  roleTag?: string
}

export type WorkingTableMetadata = {
  tableType: string
  description: string
  provenance: string
  conventions: string
  lastEditedAt: string
}

export type WorkingTableAbbreviation = {
  short: string
  long: string
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
  metadata?: WorkingTableMetadata
  columnMeta?: Record<string, WorkingTableColumnMeta>
  footnotes?: string[]
  abbreviations?: WorkingTableAbbreviation[]
}

export type ManuscriptTable = {
  id: string
  title: string
  caption?: string
  footnote?: string
  columns: string[]
  rows: string[][]
}
