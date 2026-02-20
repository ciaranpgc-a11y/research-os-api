export type CitationRecord = {
  id: string
  title: string
  authors: string
  journal: string
  year: number
  doi: string
  url: string
  citation_text: string
}

export type ClaimCitationState = {
  claim_id: string
  required_slots: number
  attached_citation_ids: string[]
  attached_citations: CitationRecord[]
  missing_slots: number
}

