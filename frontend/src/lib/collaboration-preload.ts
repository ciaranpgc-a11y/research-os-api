import { fetchCollaborationMetricsSummary, listCollaborators } from '@/lib/impact-api'
import { readScopedStorageItem, removeScopedStorageItem, writeScopedStorageItem } from '@/lib/user-scoped-storage'
import type { CollaboratorsListPayload, CollaborationMetricsSummaryPayload } from '@/types/impact'

const COLLABORATION_PAGE_CACHE_KEY = 'aawe_collaboration_page_cache_v1'
const COLLABORATION_PAGE_CACHE_MAX_AGE_MS = 1000 * 60 * 5
const DEFAULT_COLLABORATION_QUERY = ''
const DEFAULT_COLLABORATION_SORT = 'name'
const DEFAULT_COLLABORATORS_FETCH_PAGE_SIZE = 200
const DEFAULT_MAX_COLLABORATOR_FETCH_PAGES = 250

export type CollaborationLandingData = {
  query: string
  sort: string
  summary: CollaborationMetricsSummaryPayload
  listing: CollaboratorsListPayload
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

  const firstPage = await listCollaborators(token, {
    query,
    sort,
    page: 1,
    pageSize,
  })

  const items = [...firstPage.items]
  let currentPage = 1
  let hasMore = firstPage.has_more

  while (hasMore && currentPage < maxPages) {
    currentPage += 1
    const nextPage = await listCollaborators(token, {
      query,
      sort,
      page: currentPage,
      pageSize,
    })
    items.push(...nextPage.items)
    hasMore = nextPage.has_more
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
}): CollaborationLandingData | null {
  if (typeof window === 'undefined') {
    return null
  }
  const query = normalizeQuery(options?.query)
  const sort = normalizeSort(options?.sort)
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
      !parsed.listing
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
      summary: parsed.summary,
      listing: parsed.listing,
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
    summary: payload.summary,
    listing: payload.listing,
  }
  try {
    writeScopedStorageItem(COLLABORATION_PAGE_CACHE_KEY, JSON.stringify(cache))
  } catch {
    // Best effort: skip cache writes when storage quotas are exceeded.
  }
}

export async function prefetchCollaborationLandingData(token: string): Promise<void> {
  const [summary, listing] = await Promise.all([
    fetchCollaborationMetricsSummary(token),
    fetchAllCollaboratorsForCollaborationPage(token, {
      query: DEFAULT_COLLABORATION_QUERY,
      sort: DEFAULT_COLLABORATION_SORT,
    }),
  ])
  writeCachedCollaborationLandingData({
    query: DEFAULT_COLLABORATION_QUERY,
    sort: DEFAULT_COLLABORATION_SORT,
    summary,
    listing,
  })
}

