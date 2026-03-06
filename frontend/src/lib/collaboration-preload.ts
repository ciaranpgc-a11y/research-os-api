import { fetchCollaborationMetricsSummary, listCollaborators, listCollaboratorsSharedWorks } from '@/lib/impact-api'
import { readScopedStorageItem, removeScopedStorageItem, writeScopedStorageItem } from '@/lib/user-scoped-storage'
import type { CollaboratorSharedWorkPayload, CollaboratorsListPayload, CollaborationMetricsSummaryPayload } from '@/types/impact'

const COLLABORATION_PAGE_CACHE_KEY = 'aawe_collaboration_page_cache_v3'
const COLLABORATION_PAGE_CACHE_MAX_AGE_MS = 1000 * 60 * 5
const DEFAULT_COLLABORATION_QUERY = ''
const DEFAULT_COLLABORATION_SORT = 'strength'
const DEFAULT_COLLABORATION_PAGE = 1
const DEFAULT_COLLABORATION_PAGE_SIZE = 50
const DEFAULT_COLLABORATORS_FETCH_PAGE_SIZE = 200
const DEFAULT_MAX_COLLABORATOR_FETCH_PAGES = 250
const DEFAULT_COLLABORATORS_FETCH_CONCURRENCY = 6

export type CollaborationLandingData = {
  query: string
  sort: string
  page: number
  pageSize: number
  summary: CollaborationMetricsSummaryPayload
  listing: CollaboratorsListPayload
  sharedWorksByCollaboratorId: Record<string, CollaboratorSharedWorkPayload[]>
}

type CollaborationLandingDataCacheSnapshot = CollaborationLandingData & {
  cachedAt: number
}

function normalizeQuery(value: string | null | undefined): string {
  return String(value || '').trim()
}

function normalizeSort(value: string | null | undefined): string {
  const clean = String(value || '').trim()
  return clean || DEFAULT_COLLABORATION_SORT
}

function normalizePage(value: number | string | null | undefined): number {
  const parsed = Number(value || DEFAULT_COLLABORATION_PAGE)
  if (!Number.isFinite(parsed)) {
    return DEFAULT_COLLABORATION_PAGE
  }
  return Math.max(1, Math.round(parsed))
}

function normalizePageSize(value: number | string | null | undefined): number {
  const parsed = Number(value || DEFAULT_COLLABORATION_PAGE_SIZE)
  if (!Number.isFinite(parsed)) {
    return DEFAULT_COLLABORATION_PAGE_SIZE
  }
  return Math.max(1, Math.min(200, Math.round(parsed)))
}

export async function fetchCollaboratorsPageForCollaborationPage(
  token: string,
  options?: {
    query?: string
    sort?: string
    page?: number
    pageSize?: number
  },
): Promise<CollaboratorsListPayload> {
  return listCollaborators(token, {
    query: normalizeQuery(options?.query),
    sort: normalizeSort(options?.sort),
    page: normalizePage(options?.page),
    pageSize: normalizePageSize(options?.pageSize),
  })
}

export async function fetchAllCollaboratorsForCollaborationPage(
  token: string,
  options?: {
    query?: string
    sort?: string
    pageSize?: number
    maxPages?: number
  },
): Promise<CollaboratorsListPayload> {
  const query = normalizeQuery(options?.query)
  const sort = normalizeSort(options?.sort)
  const pageSize = Math.max(1, Math.min(200, Number(options?.pageSize || DEFAULT_COLLABORATORS_FETCH_PAGE_SIZE)))
  const maxPages = Math.max(1, Number(options?.maxPages || DEFAULT_MAX_COLLABORATOR_FETCH_PAGES))

  const firstPage = await fetchCollaboratorsPageForCollaborationPage(token, {
    query,
    sort,
    page: 1,
    pageSize,
  })

  const items = [...firstPage.items]
  const totalPages = Math.max(
    1,
    Math.min(
      maxPages,
      Math.ceil(Math.max(Number(firstPage.total || items.length), items.length) / pageSize),
    ),
  )

  for (let pageStart = 2; pageStart <= totalPages; pageStart += DEFAULT_COLLABORATORS_FETCH_CONCURRENCY) {
    const pageNumbers: number[] = []
    for (
      let pageNumber = pageStart;
      pageNumber < pageStart + DEFAULT_COLLABORATORS_FETCH_CONCURRENCY && pageNumber <= totalPages;
      pageNumber += 1
    ) {
      pageNumbers.push(pageNumber)
    }
    const nextPages = await Promise.all(
      pageNumbers.map((pageNumber) => (
        fetchCollaboratorsPageForCollaborationPage(token, {
          query,
          sort,
          page: pageNumber,
          pageSize,
        })
      )),
    )
    for (const nextPage of nextPages) {
      items.push(...nextPage.items)
    }
  }

  return {
    items,
    total: Number(firstPage.total || items.length),
    page: 1,
    page_size: pageSize,
    has_more: false,
  }
}

export function readCachedCollaborationLandingData(options?: {
  query?: string
  sort?: string
  page?: number
  pageSize?: number
}): CollaborationLandingData | null {
  if (typeof window === 'undefined') {
    return null
  }
  const query = normalizeQuery(options?.query)
  const sort = normalizeSort(options?.sort)
  const page = normalizePage(options?.page)
  const pageSize = normalizePageSize(options?.pageSize)
  const raw = readScopedStorageItem(COLLABORATION_PAGE_CACHE_KEY)
  if (!raw) {
    return null
  }
  try {
    const parsed = JSON.parse(raw) as CollaborationLandingDataCacheSnapshot
    if (
      !parsed ||
      typeof parsed.cachedAt !== 'number' ||
      !parsed.summary ||
      !parsed.listing ||
      normalizePage(parsed.page) !== page ||
      normalizePageSize(parsed.pageSize) !== pageSize
    ) {
      removeScopedStorageItem(COLLABORATION_PAGE_CACHE_KEY)
      return null
    }
    if (Date.now() - parsed.cachedAt > COLLABORATION_PAGE_CACHE_MAX_AGE_MS) {
      removeScopedStorageItem(COLLABORATION_PAGE_CACHE_KEY)
      return null
    }
    if (normalizeQuery(parsed.query) !== query || normalizeSort(parsed.sort) !== sort) {
      return null
    }
    return {
      query,
      sort,
      page,
      pageSize,
      summary: parsed.summary,
      listing: parsed.listing,
      sharedWorksByCollaboratorId: parsed.sharedWorksByCollaboratorId || {},
    }
  } catch {
    removeScopedStorageItem(COLLABORATION_PAGE_CACHE_KEY)
    return null
  }
}

export function writeCachedCollaborationLandingData(payload: CollaborationLandingData): void {
  if (typeof window === 'undefined') {
    return
  }
  const cache: CollaborationLandingDataCacheSnapshot = {
    cachedAt: Date.now(),
    query: normalizeQuery(payload.query),
    sort: normalizeSort(payload.sort),
    page: normalizePage(payload.page),
    pageSize: normalizePageSize(payload.pageSize),
    summary: payload.summary,
    listing: payload.listing,
    sharedWorksByCollaboratorId: payload.sharedWorksByCollaboratorId,
  }
  try {
    writeScopedStorageItem(COLLABORATION_PAGE_CACHE_KEY, JSON.stringify(cache))
  } catch {
    // Best effort: skip cache writes when storage quotas are exceeded.
  }
}

export async function prefetchCollaborationLandingData(token: string): Promise<void> {
  const [summary, listing, sharedWorksPayload] = await Promise.all([
    fetchCollaborationMetricsSummary(token),
    fetchCollaboratorsPageForCollaborationPage(token, {
      query: DEFAULT_COLLABORATION_QUERY,
      sort: DEFAULT_COLLABORATION_SORT,
      page: DEFAULT_COLLABORATION_PAGE,
      pageSize: DEFAULT_COLLABORATION_PAGE_SIZE,
    }),
    listCollaboratorsSharedWorks(token),
  ])
  writeCachedCollaborationLandingData({
    query: DEFAULT_COLLABORATION_QUERY,
    sort: DEFAULT_COLLABORATION_SORT,
    page: DEFAULT_COLLABORATION_PAGE,
    pageSize: DEFAULT_COLLABORATION_PAGE_SIZE,
    summary,
    listing,
    sharedWorksByCollaboratorId: sharedWorksPayload.items_by_collaborator_id || {},
  })
}
