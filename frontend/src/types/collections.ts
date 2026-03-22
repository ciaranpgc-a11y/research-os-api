export type CollectionColour =
  | 'indigo' | 'amber' | 'emerald' | 'red' | 'violet'
  | 'sky' | 'pink' | 'teal' | 'orange' | 'slate'

export const COLLECTION_COLOUR_HEX: Record<CollectionColour, string> = {
  indigo: '#6366f1',
  amber: '#f59e0b',
  emerald: '#10b981',
  red: '#ef4444',
  violet: '#8b5cf6',
  sky: '#0ea5e9',
  pink: '#ec4899',
  teal: '#14b8a6',
  orange: '#f97316',
  slate: '#64748b',
}

export type CollectionPayload = {
  id: string
  user_id: string
  name: string
  colour: CollectionColour
  sort_order: number
  publication_count: number
  created_at: string
  updated_at: string
}

export type SubcollectionPayload = {
  id: string
  collection_id: string
  name: string
  sort_order: number
  publication_count: number
  created_at: string
  updated_at: string
}

export type CollectionPublicationPayload = {
  membership_id: string
  work_id: string
  subcollection_id: string | null
  sort_order: number
  title: string
  year: number | null
  journal: string | null
  citations: number
  doi: string | null
}

export type PublicationCollectionSummary = {
  id: string
  name: string
  colour: CollectionColour
}
