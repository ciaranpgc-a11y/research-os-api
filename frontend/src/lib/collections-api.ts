import { API_BASE_URL } from '@/lib/api'
import { getAuthSessionToken, getAuthAccountKeyHint } from '@/lib/auth-session'
import type {
  CollectionPayload,
  CollectionColour,
  SubcollectionPayload,
  CollectionPublicationPayload,
  PublicationCollectionSummary,
} from '@/types/collections'

function authHeaders(): Record<string, string> {
  const token = getAuthSessionToken()
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  }
  if (token) {
    headers['Authorization'] = `Bearer ${token}`
  }
  const accountKey = getAuthAccountKeyHint()
  if (accountKey) {
    headers['x-account-key'] = accountKey
  }
  return headers
}

async function requestJson<T>(url: string, init: RequestInit, errorLabel: string): Promise<T> {
  const res = await fetch(url, init)
  if (!res.ok) {
    const text = await res.text().catch(() => '')
    throw new Error(`${errorLabel}: ${res.status} ${text}`)
  }
  return res.json() as Promise<T>
}

async function requestVoid(url: string, init: RequestInit, errorLabel: string): Promise<void> {
  const res = await fetch(url, init)
  if (!res.ok) {
    const text = await res.text().catch(() => '')
    throw new Error(`${errorLabel}: ${res.status} ${text}`)
  }
}

// ---------------------------------------------------------------------------
// Collections
// ---------------------------------------------------------------------------

export async function fetchCollections(): Promise<CollectionPayload[]> {
  const res = await requestJson<{ items: CollectionPayload[] }>(
    `${API_BASE_URL}/v1/collections`,
    { method: 'GET', headers: authHeaders() },
    'Failed to fetch collections',
  )
  return res.items
}

export async function createCollection(input: {
  name: string
  colour: CollectionColour
}): Promise<CollectionPayload> {
  return requestJson<CollectionPayload>(
    `${API_BASE_URL}/v1/collections`,
    { method: 'POST', headers: authHeaders(), body: JSON.stringify(input) },
    'Failed to create collection',
  )
}

export async function updateCollection(
  id: string,
  input: { name?: string; colour?: CollectionColour },
): Promise<CollectionPayload> {
  return requestJson<CollectionPayload>(
    `${API_BASE_URL}/v1/collections/${id}`,
    { method: 'PATCH', headers: authHeaders(), body: JSON.stringify(input) },
    'Failed to update collection',
  )
}

export async function deleteCollection(id: string): Promise<void> {
  return requestVoid(
    `${API_BASE_URL}/v1/collections/${id}`,
    { method: 'DELETE', headers: authHeaders() },
    'Failed to delete collection',
  )
}

export async function reorderCollections(orderedIds: string[]): Promise<void> {
  return requestVoid(
    `${API_BASE_URL}/v1/collections/reorder`,
    { method: 'PATCH', headers: authHeaders(), body: JSON.stringify({ ordered_ids: orderedIds }) },
    'Failed to reorder collections',
  )
}

// ---------------------------------------------------------------------------
// Subcollections
// ---------------------------------------------------------------------------

export async function fetchSubcollections(collectionId: string): Promise<SubcollectionPayload[]> {
  const res = await requestJson<{ items: SubcollectionPayload[] }>(
    `${API_BASE_URL}/v1/collections/${collectionId}/subcollections`,
    { method: 'GET', headers: authHeaders() },
    'Failed to fetch subcollections',
  )
  return res.items
}

export async function createSubcollection(
  collectionId: string,
  input: { name: string },
): Promise<SubcollectionPayload> {
  return requestJson<SubcollectionPayload>(
    `${API_BASE_URL}/v1/collections/${collectionId}/subcollections`,
    { method: 'POST', headers: authHeaders(), body: JSON.stringify(input) },
    'Failed to create subcollection',
  )
}

export async function updateSubcollection(
  collectionId: string,
  subcollectionId: string,
  input: { name?: string },
): Promise<SubcollectionPayload> {
  return requestJson<SubcollectionPayload>(
    `${API_BASE_URL}/v1/collections/${collectionId}/subcollections/${subcollectionId}`,
    { method: 'PATCH', headers: authHeaders(), body: JSON.stringify(input) },
    'Failed to update subcollection',
  )
}

export async function deleteSubcollection(
  collectionId: string,
  subcollectionId: string,
): Promise<void> {
  return requestVoid(
    `${API_BASE_URL}/v1/collections/${collectionId}/subcollections/${subcollectionId}`,
    { method: 'DELETE', headers: authHeaders() },
    'Failed to delete subcollection',
  )
}

// ---------------------------------------------------------------------------
// Collection publications
// ---------------------------------------------------------------------------

export async function fetchCollectionPublications(
  collectionId: string,
): Promise<CollectionPublicationPayload[]> {
  const res = await requestJson<{ items: CollectionPublicationPayload[] }>(
    `${API_BASE_URL}/v1/collections/${collectionId}/publications`,
    { method: 'GET', headers: authHeaders() },
    'Failed to fetch collection publications',
  )
  return res.items
}

export async function addPublicationsToCollection(
  collectionId: string,
  workIds: string[],
): Promise<Array<{ id: string; collection_id: string; subcollection_id: string | null; work_id: string; sort_order: number }>> {
  const res = await requestJson<{ items: Array<{ id: string; collection_id: string; subcollection_id: string | null; work_id: string; sort_order: number }> }>(
    `${API_BASE_URL}/v1/collections/${collectionId}/publications`,
    { method: 'POST', headers: authHeaders(), body: JSON.stringify({ work_ids: workIds }) },
    'Failed to add publications to collection',
  )
  return res.items
}

export async function removePublicationFromCollection(
  collectionId: string,
  workId: string,
): Promise<void> {
  return requestVoid(
    `${API_BASE_URL}/v1/collections/${collectionId}/publications/${workId}`,
    { method: 'DELETE', headers: authHeaders() },
    'Failed to remove publication from collection',
  )
}

export async function reorderCollectionPublications(
  collectionId: string,
  orderedWorkIds: string[],
): Promise<void> {
  return requestVoid(
    `${API_BASE_URL}/v1/collections/${collectionId}/publications/reorder`,
    { method: 'PATCH', headers: authHeaders(), body: JSON.stringify({ ordered_work_ids: orderedWorkIds }) },
    'Failed to reorder collection publications',
  )
}

// ---------------------------------------------------------------------------
// Subcollection publications
// ---------------------------------------------------------------------------

export async function fetchSubcollectionPublications(
  collectionId: string,
  subcollectionId: string,
): Promise<CollectionPublicationPayload[]> {
  return requestJson<CollectionPublicationPayload[]>(
    `${API_BASE_URL}/v1/collections/${collectionId}/subcollections/${subcollectionId}/publications`,
    { method: 'GET', headers: authHeaders() },
    'Failed to fetch subcollection publications',
  )
}

export async function addPublicationsToSubcollection(
  collectionId: string,
  subcollectionId: string,
  workIds: string[],
): Promise<void> {
  return requestVoid(
    `${API_BASE_URL}/v1/collections/${collectionId}/subcollections/${subcollectionId}/publications`,
    { method: 'POST', headers: authHeaders(), body: JSON.stringify({ work_ids: workIds }) },
    'Failed to add publications to subcollection',
  )
}

export async function removePublicationFromSubcollection(
  collectionId: string,
  subcollectionId: string,
  workId: string,
): Promise<void> {
  return requestVoid(
    `${API_BASE_URL}/v1/collections/${collectionId}/subcollections/${subcollectionId}/publications/${workId}`,
    { method: 'DELETE', headers: authHeaders() },
    'Failed to remove publication from subcollection',
  )
}

// ---------------------------------------------------------------------------
// Publication → collections lookup
// ---------------------------------------------------------------------------

export async function fetchPublicationCollections(
  workId: string,
): Promise<PublicationCollectionSummary[]> {
  const res = await requestJson<{ items: PublicationCollectionSummary[] }>(
    `${API_BASE_URL}/v1/publications/${workId}/collections`,
    { method: 'GET', headers: authHeaders() },
    'Failed to fetch publication collections',
  )
  return res.items
}

// ---------------------------------------------------------------------------
// Move publication between subcollections
// ---------------------------------------------------------------------------

export async function movePublicationSubcollection(
  collectionId: string,
  membershipId: string,
  subcollectionId: string | null,
): Promise<{ membership_id: string; work_id: string; collection_id: string; subcollection_id: string | null; sort_order: number }> {
  return requestJson(
    `${API_BASE_URL}/v1/collections/${collectionId}/memberships/${membershipId}/move`,
    { method: 'PATCH', headers: authHeaders(), body: JSON.stringify({ subcollection_id: subcollectionId }) },
    'Failed to move publication',
  )
}
