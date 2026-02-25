import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { ChevronDown, ChevronUp, ChevronsUpDown } from 'lucide-react'
import { useNavigate } from 'react-router-dom'

import { PublicationsTopStrip } from '@/components/publications/PublicationsTopStrip'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
  bootstrapPublicationsInsightsFromOrcid,
  deletePublicationFile,
  downloadPublicationFile,
  fetchPublicationAiInsights,
  fetchPublicationAuthors,
  fetchPublicationDetail,
  fetchPublicationFiles,
  fetchPublicationImpact,
  fetchPersonaSyncJob,
  fetchMe,
  fetchPersonaState,
  fetchPublicationsAnalytics,
  fetchPublicationsTopMetrics,
  linkPublicationOpenAccessPdf,
  listPersonaSyncJobs,
  uploadPublicationFile,
} from '@/lib/impact-api'
import { readCachedPersonaState, writeCachedPersonaState } from '@/lib/persona-cache'
import { getAuthSessionToken } from '@/lib/auth-session'
import type {
  AuthUser,
  PublicationAiInsightsResponsePayload,
  PublicationAuthorsPayload,
  PublicationDetailPayload,
  PublicationFilesListPayload,
  PublicationImpactResponsePayload,
  PersonaStatePayload,
  PersonaSyncJobPayload,
  PublicationsAnalyticsResponsePayload,
  PublicationsAnalyticsSummaryPayload,
  PublicationsAnalyticsTopDriversPayload,
  PublicationsTopMetricsPayload,
} from '@/types/impact'

type PublicationFilterKey = 'all' | 'cited' | 'with_doi' | 'with_abstract' | 'with_pmid'
type PublicationSortField = 'citations' | 'year' | 'title' | 'venue' | 'work_type'
type SortDirection = 'asc' | 'desc'
type PublicationDetailTab = 'overview' | 'content' | 'impact' | 'files' | 'ai'
const INTEGRATIONS_USER_CACHE_KEY = 'aawe_integrations_user_cache'
const PUBLICATIONS_ANALYTICS_CACHE_KEY = 'aawe_publications_analytics_cache'
const PUBLICATIONS_TOP_METRICS_CACHE_KEY = 'aawe_publications_top_metrics_cache'
const PUBLICATIONS_ACTIVE_SYNC_JOB_STORAGE_PREFIX = 'aawe_publications_active_sync_job:'
const PUBLICATION_DETAIL_ACTIVE_TAB_STORAGE_KEY = 'aawe.pubDetail.activeTab'

const WORK_TYPE_LABELS: Record<string, string> = {
  'journal-article': 'Journal article',
  'conference-paper': 'Conference paper',
  'conference-abstract': 'Conference abstract',
  'conference-poster': 'Conference poster',
  'conference-presentation': 'Conference presentation',
  'meeting-abstract': 'Conference abstract',
  'proceedings-article': 'Conference paper',
  proceedings: 'Conference paper',
  'book-chapter': 'Book chapter',
  book: 'Book',
  preprint: 'Preprint',
  dissertation: 'Dissertation',
  'data-set': 'Dataset',
  'review-article': 'Review article',
}

const CONFERENCE_HINT_PATTERN =
  /\b(conference|congress|symposium|workshop|annual meeting|scientific sessions|proceedings|poster session)\b/i
const CONFERENCE_TYPE_HINT_PATTERN =
  /\b(conference|proceedings|meeting|congress|symposium|workshop)\b/i
const NUMERIC_TITLE_START_PATTERN = /^\s*\d+([)\].,:;-]|\s|th\b|st\b|nd\b|rd\b)/i

function normalizeWorkType(value: string | null | undefined): string {
  return (value || '')
    .trim()
    .toLowerCase()
    .replace(/[_\s]+/g, '-')
}

function derivePublicationTypeLabel(work: {
  work_type?: string | null
  title?: string | null
  venue_name?: string | null
}): string {
  const raw = normalizeWorkType(work.work_type)
  const mapped = WORK_TYPE_LABELS[raw]
  if (mapped) {
    return mapped
  }
  if (raw && CONFERENCE_TYPE_HINT_PATTERN.test(raw)) {
    return 'Conference paper'
  }
  const title = (work.title || '').trim()
  const venue = (work.venue_name || '').trim()
  if (
    (!raw || raw === 'other') &&
    CONFERENCE_HINT_PATTERN.test(`${title} ${venue}`)
  ) {
    return 'Conference paper'
  }
  if (raw === 'other' && NUMERIC_TITLE_START_PATTERN.test(title)) {
    return 'Conference paper'
  }
  if (!raw) {
    return 'Other'
  }
  const text = raw.replace(/[_-]+/g, ' ').replace(/\s+/g, ' ').trim()
  if (!text) {
    return 'Other'
  }
  return text.replace(/\b\w/g, (letter) => letter.toUpperCase())
}

function formatShortDate(value: string | null | undefined): string {
  if (!value) {
    return 'Not available'
  }
  const parsed = Date.parse(value)
  if (Number.isNaN(parsed)) {
    return 'Not available'
  }
  return new Date(parsed).toLocaleDateString('en-GB', {
    year: 'numeric',
    month: 'short',
    day: '2-digit',
  })
}

function doiToUrl(doi: string | null | undefined): string | null {
  const clean = (doi || '').trim()
  if (!clean) {
    return null
  }
  if (clean.startsWith('https://') || clean.startsWith('http://')) {
    return clean
  }
  return `https://doi.org/${clean}`
}

function formatJournalName(value: string | null | undefined): string {
  const clean = (value || '').trim()
  if (!clean) {
    return 'Not available'
  }
  const lowerCaseJoiners = new Set([
    'a',
    'an',
    'and',
    'as',
    'at',
    'by',
    'for',
    'from',
    'in',
    'of',
    'on',
    'or',
    'the',
    'to',
    'via',
    'with',
  ])
  const acronymMap: Record<string, string> = {
    esc: 'ESC',
    ehj: 'EHJ',
    jacc: 'JACC',
    bmj: 'BMJ',
    ajrccm: 'AJRCCM',
    erj: 'ERJ',
    cmr: 'CMR',
    mri: 'MRI',
    ct: 'CT',
  }
  const words = clean.split(/\s+/)
  return clean
    .split(/\s+/)
    .map((word, index) => {
      if (!word) {
        return word
      }
      const leading = word.match(/^[^A-Za-z0-9]*/) ? word.match(/^[^A-Za-z0-9]*/)![0] : ''
      const trailing = word.match(/[^A-Za-z0-9]*$/) ? word.match(/[^A-Za-z0-9]*$/)![0] : ''
      const core = word.slice(leading.length, Math.max(leading.length, word.length - trailing.length))
      if (!core) {
        return word
      }
      const lowerCore = core.toLowerCase()
      if (acronymMap[lowerCore]) {
        return `${leading}${acronymMap[lowerCore]}${trailing}`
      }
      if (/^[A-Z0-9&.\-]{2,}$/.test(core)) {
        return `${leading}${core}${trailing}`
      }
      const isJoiner = lowerCaseJoiners.has(lowerCore)
      const isEdgeWord = index === 0 || index === words.length - 1
      if (isJoiner && !isEdgeWord) {
        return `${leading}${lowerCore}${trailing}`
      }
      return `${leading}${core.charAt(0).toUpperCase()}${core.slice(1).toLowerCase()}${trailing}`
    })
    .join(' ')
}

function loadCachedUser(): AuthUser | null {
  if (typeof window === 'undefined') {
    return null
  }
  const raw = window.localStorage.getItem(INTEGRATIONS_USER_CACHE_KEY)
  if (!raw) {
    return null
  }
  try {
    return JSON.parse(raw) as AuthUser
  } catch {
    return null
  }
}

function saveCachedUser(value: AuthUser): void {
  if (typeof window === 'undefined') {
    return
  }
  window.localStorage.setItem(INTEGRATIONS_USER_CACHE_KEY, JSON.stringify(value))
}

function loadCachedAnalyticsResponse(): PublicationsAnalyticsResponsePayload | null {
  if (typeof window === 'undefined') {
    return null
  }
  const raw = window.localStorage.getItem(PUBLICATIONS_ANALYTICS_CACHE_KEY)
  if (!raw) {
    return null
  }
  try {
    return JSON.parse(raw) as PublicationsAnalyticsResponsePayload
  } catch {
    return null
  }
}

function saveCachedAnalyticsResponse(value: PublicationsAnalyticsResponsePayload): void {
  if (typeof window === 'undefined') {
    return
  }
  window.localStorage.setItem(PUBLICATIONS_ANALYTICS_CACHE_KEY, JSON.stringify(value))
}

function loadCachedTopMetricsResponse(): PublicationsTopMetricsPayload | null {
  if (typeof window === 'undefined') {
    return null
  }
  const raw = window.localStorage.getItem(PUBLICATIONS_TOP_METRICS_CACHE_KEY)
  if (!raw) {
    return null
  }
  try {
    return JSON.parse(raw) as PublicationsTopMetricsPayload
  } catch {
    return null
  }
}

function saveCachedTopMetricsResponse(value: PublicationsTopMetricsPayload): void {
  if (typeof window === 'undefined') {
    return
  }
  window.localStorage.setItem(PUBLICATIONS_TOP_METRICS_CACHE_KEY, JSON.stringify(value))
}

function analyticsSummaryFromResponse(
  response: PublicationsAnalyticsResponsePayload | null,
): PublicationsAnalyticsSummaryPayload | null {
  const summary = response?.payload?.summary
  return summary ? summary : null
}

function analyticsTopDriversFromResponse(
  response: PublicationsAnalyticsResponsePayload | null,
): PublicationsAnalyticsTopDriversPayload | null {
  const topDrivers = response?.payload?.top_drivers
  if (!topDrivers) {
    return null
  }
  const drivers = Array.isArray(topDrivers.drivers) ? topDrivers.drivers.slice(0, 5) : []
  return {
    ...topDrivers,
    drivers,
  }
}

function publicationsActiveSyncJobStorageKey(userId: string): string {
  return `${PUBLICATIONS_ACTIVE_SYNC_JOB_STORAGE_PREFIX}${userId}`
}

function loadPublicationsActiveSyncJobId(userId: string): string | null {
  if (typeof window === 'undefined') {
    return null
  }
  const raw = window.localStorage.getItem(publicationsActiveSyncJobStorageKey(userId))
  const clean = (raw || '').trim()
  return clean || null
}

function savePublicationsActiveSyncJobId(userId: string, jobId: string): void {
  if (typeof window === 'undefined') {
    return
  }
  window.localStorage.setItem(publicationsActiveSyncJobStorageKey(userId), jobId)
}

function clearPublicationsActiveSyncJobId(userId: string): void {
  if (typeof window === 'undefined') {
    return
  }
  window.localStorage.removeItem(publicationsActiveSyncJobStorageKey(userId))
}

function loadActivePublicationDetailTab(): PublicationDetailTab {
  if (typeof window === 'undefined') {
    return 'overview'
  }
  const raw = (window.localStorage.getItem(PUBLICATION_DETAIL_ACTIVE_TAB_STORAGE_KEY) || '').trim()
  if (raw === 'overview' || raw === 'content' || raw === 'impact' || raw === 'files' || raw === 'ai') {
    return raw
  }
  return 'overview'
}

function saveActivePublicationDetailTab(tab: PublicationDetailTab): void {
  if (typeof window === 'undefined') {
    return
  }
  window.localStorage.setItem(PUBLICATION_DETAIL_ACTIVE_TAB_STORAGE_KEY, tab)
}

function publicationPaneKey(workId: string, tab: PublicationDetailTab): string {
  return `${workId}:${tab}`
}

function extractAuthorNamesFromAuthorsJson(items: Array<Record<string, unknown>>): string[] {
  const names: string[] = []
  for (const item of items || []) {
    const name = String(item?.name || item?.full_name || '').trim()
    if (!name || names.includes(name)) {
      continue
    }
    names.push(name)
  }
  return names
}

function formatVancouverCitation(input: {
  title: string
  journal: string
  year: number | null
  authors: string[]
  doi: string | null
}): string {
  const names = (input.authors || []).filter((item) => item.trim())
  const authorText =
    names.length === 0
      ? 'Author unavailable.'
      : names.length > 6
        ? `${names.slice(0, 6).join(', ')}, et al.`
        : names.join(', ')
  const title = input.title.trim() || 'Untitled'
  const journal = input.journal.trim() || 'Journal unavailable'
  const year = input.year ?? 'n.d.'
  const doi = (input.doi || '').trim()
  return `${authorText} ${title}. ${journal}. ${year}.${doi ? ` doi:${doi}.` : ''}`
}

function normalizeAuthorName(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function nameTokens(value: string): string[] {
  return normalizeAuthorName(value)
    .split(' ')
    .map((token) => token.trim())
    .filter(Boolean)
}

function initials(tokens: string[]): string {
  return tokens
    .map((token) => token.charAt(0))
    .join('')
    .toLowerCase()
}

function isOwnerAuthor(author: string, userName: string, userEmail: string): boolean {
  const authorKey = normalizeAuthorName(author)
  const userKey = normalizeAuthorName(userName)
  const authorTokens = nameTokens(author)
  const userTokens = nameTokens(userName)
  if (!authorKey || (!userKey && !userEmail)) {
    return false
  }
  if (authorKey === userKey) {
    return true
  }
  if (userKey && (authorKey.includes(userKey) || userKey.includes(authorKey))) {
    return true
  }

  // Match by token subset so "Ciaran Clarke" maps to "Ciaran Grafton Clarke".
  if (
    userTokens.length >= 2 &&
    userTokens.every((token) => authorTokens.includes(token))
  ) {
    return true
  }

  if (
    userTokens.length >= 2 &&
    authorTokens.length >= 2 &&
    userTokens[0] === authorTokens[0] &&
    userTokens[userTokens.length - 1] === authorTokens[authorTokens.length - 1]
  ) {
    return true
  }

  // Initials fallback for names like "Ciaran GC".
  const userInitials = initials(userTokens)
  const authorInitials = initials(authorTokens)
  if (
    userTokens.length >= 1 &&
    authorTokens.length >= 2 &&
    userTokens[0] === authorTokens[0] &&
    userInitials.length >= 2
  ) {
    const authorTailInitials = initials(authorTokens.slice(1))
    if (
      authorTailInitials === userInitials.slice(1) ||
      authorInitials === userInitials ||
      authorTailInitials.includes(userInitials.slice(1))
    ) {
      return true
    }
  }

  // Email fallback: "ciaran.clarke@..." should match "Ciaran ... Clarke".
  const emailLocal = (userEmail || '').split('@')[0] || ''
  const emailTokens = emailLocal
    .toLowerCase()
    .split(/[._-]+/)
    .map((token) => token.trim())
    .filter(Boolean)
  if (
    emailTokens.length >= 2 &&
    emailTokens.every((token) => authorTokens.includes(token))
  ) {
    return true
  }

  return false
}

function citationCellTone(citations: number, hIndex: number): string {
  const value = Math.max(0, Number(citations || 0))
  if (value <= 0) {
    return 'text-muted-foreground'
  }
  if (hIndex <= 0) {
    return 'bg-emerald-50 text-emerald-800 font-medium'
  }
  if (value >= hIndex * 2) {
    return 'bg-emerald-100 text-emerald-900 font-semibold'
  }
  if (value >= hIndex) {
    return 'bg-emerald-50 text-emerald-800 font-semibold'
  }
  if (value >= Math.max(1, Math.ceil(hIndex / 2))) {
    return 'bg-amber-50 text-amber-800 font-medium'
  }
  return 'bg-slate-50 text-slate-700'
}

function growthToneClass(value: number | null): string {
  if (value === null || Number.isNaN(value)) {
    return 'text-muted-foreground'
  }
  if (value > 0) {
    return 'text-emerald-700'
  }
  if (value < 0) {
    return 'text-rose-700'
  }
  return 'text-muted-foreground'
}

function formatSignedPercent(value: number | null): string {
  if (value === null || Number.isNaN(value)) {
    return 'n/a'
  }
  const rounded = Math.round(value * 10) / 10
  if (rounded > 0) {
    return `+${rounded}%`
  }
  return `${rounded}%`
}

function SortHeader({
  label,
  column,
  sortField,
  sortDirection,
  onSort,
}: {
  label: string
  column: PublicationSortField
  sortField: PublicationSortField
  sortDirection: SortDirection
  onSort: (column: PublicationSortField) => void
}) {
  const active = sortField === column
  return (
    <button
      type="button"
      onClick={() => onSort(column)}
      className="inline-flex items-center gap-1 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
    >
      <span>{label}</span>
      {active ? (
        sortDirection === 'desc' ? (
          <ChevronDown className="h-3.5 w-3.5 text-foreground" />
        ) : (
          <ChevronUp className="h-3.5 w-3.5 text-foreground" />
        )
      ) : (
        <ChevronsUpDown className="h-3.5 w-3.5" />
      )}
    </button>
  )
}

export type ProfilePublicationsPageFixture = {
  token?: string
  user?: AuthUser | null
  personaState?: PersonaStatePayload | null
  analyticsResponse?: PublicationsAnalyticsResponsePayload | null
  topMetricsResponse?: PublicationsTopMetricsPayload | null
}

type ProfilePublicationsPageProps = {
  fixture?: ProfilePublicationsPageFixture
}

export function ProfilePublicationsPage({ fixture }: ProfilePublicationsPageProps = {}) {
  const navigate = useNavigate()
  const isFixtureMode = Boolean(fixture)
  const initialCachedPersonaState = fixture?.personaState ?? readCachedPersonaState()
  const initialCachedUser = fixture?.user ?? loadCachedUser()
  const initialCachedAnalyticsResponse = fixture?.analyticsResponse ?? loadCachedAnalyticsResponse()
  const initialCachedAnalyticsSummary = analyticsSummaryFromResponse(initialCachedAnalyticsResponse)
  const initialCachedAnalyticsTopDrivers = analyticsTopDriversFromResponse(initialCachedAnalyticsResponse)
  const initialCachedTopMetricsResponse = fixture?.topMetricsResponse ?? loadCachedTopMetricsResponse()
  const [token, setToken] = useState<string>(() => fixture?.token ?? getAuthSessionToken())
  const [user, setUser] = useState<AuthUser | null>(initialCachedUser)
  const [personaState, setPersonaState] = useState<PersonaStatePayload | null>(initialCachedPersonaState)
  const [analyticsResponse, setAnalyticsResponse] = useState<PublicationsAnalyticsResponsePayload | null>(initialCachedAnalyticsResponse)
  const [analyticsSummary, setAnalyticsSummary] = useState<PublicationsAnalyticsSummaryPayload | null>(initialCachedAnalyticsSummary)
  const [analyticsTopDrivers, setAnalyticsTopDrivers] = useState<PublicationsAnalyticsTopDriversPayload | null>(initialCachedAnalyticsTopDrivers)
  const [topMetricsResponse, setTopMetricsResponse] = useState<PublicationsTopMetricsPayload | null>(initialCachedTopMetricsResponse)
  const [query, setQuery] = useState('')
  const [filterKey, setFilterKey] = useState<PublicationFilterKey>('all')
  const [typeFilter, setTypeFilter] = useState<string>('all')
  const [sortField, setSortField] = useState<PublicationSortField>('year')
  const [sortDirection, setSortDirection] = useState<SortDirection>('desc')
  const [selectedWorkId, setSelectedWorkId] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [richImporting, setRichImporting] = useState(false)
  const [syncing, setSyncing] = useState(false)
  const [fullSyncing, setFullSyncing] = useState(false)
  const [activeSyncJob, setActiveSyncJob] = useState<PersonaSyncJobPayload | null>(null)
  const [status, setStatus] = useState('')
  const [error, setError] = useState('')
  const [activeDetailTab, setActiveDetailTab] = useState<PublicationDetailTab>(() => loadActivePublicationDetailTab())
  const [detailCacheByWorkId, setDetailCacheByWorkId] = useState<Record<string, PublicationDetailPayload>>({})
  const [authorsCacheByWorkId, setAuthorsCacheByWorkId] = useState<Record<string, PublicationAuthorsPayload>>({})
  const [impactCacheByWorkId, setImpactCacheByWorkId] = useState<Record<string, PublicationImpactResponsePayload>>({})
  const [aiCacheByWorkId, setAiCacheByWorkId] = useState<Record<string, PublicationAiInsightsResponsePayload>>({})
  const [filesCacheByWorkId, setFilesCacheByWorkId] = useState<Record<string, PublicationFilesListPayload>>({})
  const [paneLoadingByKey, setPaneLoadingByKey] = useState<Record<string, boolean>>({})
  const [paneErrorByKey, setPaneErrorByKey] = useState<Record<string, string>>({})
  const [expandedAbstractByWorkId, setExpandedAbstractByWorkId] = useState<Record<string, boolean>>({})
  const [contentModeByWorkId, setContentModeByWorkId] = useState<Record<string, 'plain' | 'highlighted'>>({})
  const [uploadingFile, setUploadingFile] = useState(false)
  const [findingOa, setFindingOa] = useState(false)
  const [downloadingFileId, setDownloadingFileId] = useState<string | null>(null)
  const [deletingFileId, setDeletingFileId] = useState<string | null>(null)
  const [filesDragOver, setFilesDragOver] = useState(false)
  const [bootstrapOrcidId, setBootstrapOrcidId] = useState(initialCachedUser?.orcid_id || '')
  const [bootstrapFullName, setBootstrapFullName] = useState(initialCachedUser?.name || '')
  const [bootstrappingInsights, setBootstrappingInsights] = useState(false)
  const filePickerRef = useRef<HTMLInputElement | null>(null)

  const loadData = useCallback(async (
    sessionToken: string,
    resetMessages = true,
    background = false,
  ) => {
    if (!background) {
      setLoading(true)
      setError('')
    }
    if (resetMessages) {
      setStatus('')
    }
    try {
      const settled = await Promise.allSettled([
        fetchPersonaState(sessionToken),
        fetchMe(sessionToken),
        listPersonaSyncJobs(sessionToken, 5),
        fetchPublicationsAnalytics(sessionToken),
        fetchPublicationsTopMetrics(sessionToken),
      ])
      const [stateResult, userResult, jobsResult, analyticsResult, topMetricsResult] = settled
      if (stateResult.status === 'fulfilled') {
        setPersonaState(stateResult.value)
        writeCachedPersonaState(stateResult.value)
      } else {
        const cached = readCachedPersonaState()
        setPersonaState(cached)
        if (cached) {
          setStatus('Showing cached publications while live data reloads.')
        }
      }
      if (userResult.status === 'fulfilled') {
        setUser(userResult.value)
        saveCachedUser(userResult.value)
        const activeJobId = loadPublicationsActiveSyncJobId(userResult.value.id)
        if (activeJobId) {
          setActiveSyncJob((current) => current || {
            id: activeJobId,
            user_id: userResult.value.id,
            job_type: 'metrics_sync',
            status: 'queued',
            overwrite_user_metadata: false,
            run_metrics_sync: false,
            refresh_analytics: true,
            refresh_metrics: false,
            providers: [],
            progress_percent: 0,
            current_stage: 'queued',
            result_json: {},
            error_detail: null,
            started_at: null,
            completed_at: null,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          })
        }
      }
      if (jobsResult.status === 'fulfilled') {
        const activeJob = (jobsResult.value || []).find((item) => item.status === 'queued' || item.status === 'running') || null
        if (activeJob) {
          setActiveSyncJob(activeJob)
          if (activeJob.user_id) {
            savePublicationsActiveSyncJobId(activeJob.user_id, activeJob.id)
          }
        } else if (userResult.status === 'fulfilled') {
          clearPublicationsActiveSyncJobId(userResult.value.id)
          setActiveSyncJob(null)
        }
      }
      if (analyticsResult.status === 'fulfilled') {
        setAnalyticsResponse(analyticsResult.value)
        saveCachedAnalyticsResponse(analyticsResult.value)
        setAnalyticsSummary(analyticsSummaryFromResponse(analyticsResult.value))
        setAnalyticsTopDrivers(analyticsTopDriversFromResponse(analyticsResult.value))
      }
      if (topMetricsResult.status === 'fulfilled') {
        setTopMetricsResponse(topMetricsResult.value)
        saveCachedTopMetricsResponse(topMetricsResult.value)
      }
      const failedCount = settled.filter((item) => item.status === 'rejected').length
      if (failedCount > 0) {
        setStatus(`Publications loaded with ${failedCount} unavailable source${failedCount === 1 ? '' : 's'}.`)
      }
    } catch (loadError) {
      if (!background) {
        setError(loadError instanceof Error ? loadError.message : 'Could not load publications.')
      }
    } finally {
      if (!background) {
        setLoading(false)
      }
    }
  }, [])

  useEffect(() => {
    saveActivePublicationDetailTab(activeDetailTab)
  }, [activeDetailTab])

  const setPaneLoading = useCallback((workId: string, tab: PublicationDetailTab, loadingValue: boolean) => {
    const key = publicationPaneKey(workId, tab)
    setPaneLoadingByKey((current) => ({ ...current, [key]: loadingValue }))
  }, [])

  const setPaneError = useCallback((workId: string, tab: PublicationDetailTab, message: string) => {
    const key = publicationPaneKey(workId, tab)
    setPaneErrorByKey((current) => ({ ...current, [key]: message }))
  }, [])

  const loadPublicationDetailData = useCallback(async (workId: string, force = false) => {
    if (!token || !workId) {
      return
    }
    if (!force && detailCacheByWorkId[workId]) {
      return
    }
    setPaneLoading(workId, 'overview', true)
    setPaneError(workId, 'overview', '')
    try {
      const payload = await fetchPublicationDetail(token, workId)
      setDetailCacheByWorkId((current) => ({ ...current, [workId]: payload }))
    } catch (loadError) {
      setPaneError(workId, 'overview', loadError instanceof Error ? loadError.message : 'Could not load publication details.')
    } finally {
      setPaneLoading(workId, 'overview', false)
    }
  }, [detailCacheByWorkId, setPaneError, setPaneLoading, token])

  const loadPublicationAuthorsData = useCallback(async (workId: string, force = false) => {
    if (!token || !workId) {
      return
    }
    if (!force && authorsCacheByWorkId[workId] && authorsCacheByWorkId[workId].status !== 'RUNNING') {
      return
    }
    setPaneLoading(workId, 'overview', true)
    try {
      const payload = await fetchPublicationAuthors(token, workId)
      setAuthorsCacheByWorkId((current) => ({ ...current, [workId]: payload }))
    } catch (loadError) {
      setPaneError(workId, 'overview', loadError instanceof Error ? loadError.message : 'Could not load publication authors.')
    } finally {
      setPaneLoading(workId, 'overview', false)
    }
  }, [authorsCacheByWorkId, setPaneError, setPaneLoading, token])

  const loadPublicationImpactData = useCallback(async (workId: string, force = false) => {
    if (!token || !workId) {
      return
    }
    if (!force && impactCacheByWorkId[workId] && impactCacheByWorkId[workId].status !== 'RUNNING') {
      return
    }
    setPaneLoading(workId, 'impact', true)
    setPaneError(workId, 'impact', '')
    try {
      const payload = await fetchPublicationImpact(token, workId)
      setImpactCacheByWorkId((current) => ({ ...current, [workId]: payload }))
    } catch (loadError) {
      setPaneError(workId, 'impact', loadError instanceof Error ? loadError.message : 'Could not load impact insights.')
    } finally {
      setPaneLoading(workId, 'impact', false)
    }
  }, [impactCacheByWorkId, setPaneError, setPaneLoading, token])

  const loadPublicationAiData = useCallback(async (workId: string, force = false) => {
    if (!token || !workId) {
      return
    }
    if (!force && aiCacheByWorkId[workId] && aiCacheByWorkId[workId].status !== 'RUNNING') {
      return
    }
    setPaneLoading(workId, 'ai', true)
    setPaneError(workId, 'ai', '')
    try {
      const payload = await fetchPublicationAiInsights(token, workId)
      setAiCacheByWorkId((current) => ({ ...current, [workId]: payload }))
    } catch (loadError) {
      setPaneError(workId, 'ai', loadError instanceof Error ? loadError.message : 'Could not load AI insights.')
    } finally {
      setPaneLoading(workId, 'ai', false)
    }
  }, [aiCacheByWorkId, setPaneError, setPaneLoading, token])

  const loadPublicationFilesData = useCallback(async (workId: string, force = false) => {
    if (!token || !workId) {
      return
    }
    if (!force && filesCacheByWorkId[workId]) {
      return
    }
    setPaneLoading(workId, 'files', true)
    setPaneError(workId, 'files', '')
    try {
      const payload = await fetchPublicationFiles(token, workId)
      setFilesCacheByWorkId((current) => ({ ...current, [workId]: payload }))
    } catch (loadError) {
      setPaneError(workId, 'files', loadError instanceof Error ? loadError.message : 'Could not load files.')
    } finally {
      setPaneLoading(workId, 'files', false)
    }
  }, [filesCacheByWorkId, setPaneError, setPaneLoading, token])

  const ensureActiveTabData = useCallback(async (workId: string, tab: PublicationDetailTab) => {
    if (!workId) {
      return
    }
    if (tab === 'overview') {
      await loadPublicationDetailData(workId)
      await loadPublicationAuthorsData(workId)
      return
    }
    if (tab === 'content') {
      await loadPublicationDetailData(workId)
      const mode = contentModeByWorkId[workId] || 'plain'
      if (mode === 'highlighted') {
        await loadPublicationAiData(workId)
      }
      return
    }
    if (tab === 'impact') {
      await loadPublicationImpactData(workId)
      return
    }
    if (tab === 'files') {
      await loadPublicationFilesData(workId)
      return
    }
    await loadPublicationAiData(workId)
  }, [contentModeByWorkId, loadPublicationAiData, loadPublicationAuthorsData, loadPublicationDetailData, loadPublicationFilesData, loadPublicationImpactData])

  useEffect(() => {
    if (isFixtureMode) {
      return
    }
    const sessionToken = getAuthSessionToken()
    setToken(sessionToken)
    if (!sessionToken) {
      navigate('/auth', { replace: true })
      return
    }
    void loadData(sessionToken, false, true)
  }, [isFixtureMode, loadData, navigate])

  useEffect(() => {
    if (!activeSyncJob || activeSyncJob.status === 'completed' || activeSyncJob.status === 'failed') {
      setRichImporting(false)
      setSyncing(false)
      setFullSyncing(false)
      return
    }
    if (activeSyncJob.job_type === 'orcid_import') {
      setRichImporting(true)
      return
    }
    const providers = new Set((activeSyncJob.providers || []).map((value) => String(value).trim().toLowerCase()))
    if (providers.has('semantic_scholar') && providers.has('manual')) {
      setFullSyncing(true)
      return
    }
    setSyncing(true)
  }, [activeSyncJob])

  useEffect(() => {
    if (!token || !activeSyncJob?.id) {
      return
    }
    let cancelled = false

    const stageLabel = (value: string | null | undefined): string => {
      const clean = (value || '').trim().replace(/[_-]+/g, ' ')
      if (!clean) {
        return 'processing'
      }
      return clean
    }

    const poll = async () => {
      try {
        const job = await fetchPersonaSyncJob(token, activeSyncJob.id)
        if (cancelled) {
          return
        }
        setActiveSyncJob(job)
        if (job.status === 'queued' || job.status === 'running') {
          setStatus(
            `Background sync running (${job.progress_percent}% • ${stageLabel(job.current_stage)}).`,
          )
          return
        }
        if (job.status === 'completed') {
          if (user?.id) {
            clearPublicationsActiveSyncJobId(user.id)
          }
          setActiveSyncJob(null)
          setStatus('Background sync completed.')
          await loadData(token, false, true)
          return
        }
        if (user?.id) {
          clearPublicationsActiveSyncJobId(user.id)
        }
        setActiveSyncJob(null)
        setStatus('')
        setError(job.error_detail || 'Background sync failed.')
      } catch (pollError) {
        if (cancelled) {
          return
        }
      }
    }

    void poll()
    const timer = window.setInterval(() => {
      void poll()
    }, 2500)
    return () => {
      cancelled = true
      window.clearInterval(timer)
    }
  }, [activeSyncJob?.id, loadData, token, user?.id])

  useEffect(() => {
    if (!token || analyticsResponse?.status !== 'RUNNING') {
      return
    }
    let cancelled = false

    const poll = async () => {
      try {
        const next = await fetchPublicationsAnalytics(token)
        if (cancelled) {
          return
        }
        setAnalyticsResponse(next)
        saveCachedAnalyticsResponse(next)
        setAnalyticsSummary(analyticsSummaryFromResponse(next))
        setAnalyticsTopDrivers(analyticsTopDriversFromResponse(next))
      } catch {
        if (cancelled) {
          return
        }
      }
    }

    void poll()
    const timer = window.setInterval(() => {
      void poll()
    }, 7000)
    return () => {
      cancelled = true
      window.clearInterval(timer)
    }
  }, [analyticsResponse?.status, token])

  useEffect(() => {
    if (!token || topMetricsResponse?.status !== 'RUNNING') {
      return
    }
    let cancelled = false

    const poll = async () => {
      try {
        const next = await fetchPublicationsTopMetrics(token)
        if (cancelled) {
          return
        }
        setTopMetricsResponse(next)
        saveCachedTopMetricsResponse(next)
      } catch {
        if (cancelled) {
          return
        }
      }
    }

    void poll()
    const timer = window.setInterval(() => {
      void poll()
    }, 7000)
    return () => {
      cancelled = true
      window.clearInterval(timer)
    }
  }, [topMetricsResponse?.status, token])

  useEffect(() => {
    if (!user) {
      return
    }
    setBootstrapOrcidId((current) => current || (user.orcid_id || ''))
    setBootstrapFullName((current) => current || (user.name || ''))
  }, [user?.id, user?.name, user?.orcid_id])

  const metricsByWorkId = useMemo(() => {
    const map = new Map<string, { citations: number; provider: string }>()
    for (const row of personaState?.metrics.works ?? []) {
      map.set(row.work_id, {
        citations: Number(row.citations || 0),
        provider: row.provider,
      })
    }
    return map
  }, [personaState?.metrics.works])

  const typeFilterOptions = useMemo(() => {
    const values = new Set<string>()
    for (const work of personaState?.works ?? []) {
      const key = derivePublicationTypeLabel(work)
      if (key) {
        values.add(key)
      }
    }
    return Array.from(values).sort((left, right) => left.localeCompare(right))
  }, [personaState?.works])

  const filteredWorks = useMemo(() => {
    const cleanQuery = query.trim().toLowerCase()
    const works = [...(personaState?.works ?? [])]
    const filtered = works.filter((work) => {
      const matchesQuery =
        !cleanQuery ||
        work.title.toLowerCase().includes(cleanQuery) ||
        work.venue_name.toLowerCase().includes(cleanQuery) ||
        (work.doi || '').toLowerCase().includes(cleanQuery) ||
        (work.pmid || '').toLowerCase().includes(cleanQuery) ||
        (work.authors || []).join(' ').toLowerCase().includes(cleanQuery)
      if (!matchesQuery) {
        return false
      }
      if (typeFilter !== 'all' && derivePublicationTypeLabel(work) !== typeFilter) {
        return false
      }
      if (filterKey === 'cited') {
        return Number(metricsByWorkId.get(work.id)?.citations || 0) > 0
      }
      if (filterKey === 'with_doi') {
        return Boolean((work.doi || '').trim())
      }
      if (filterKey === 'with_abstract') {
        return Boolean((work.abstract || '').trim())
      }
      if (filterKey === 'with_pmid') {
        return Boolean((work.pmid || '').trim())
      }
      return true
    })

    const direction = sortDirection === 'asc' ? 1 : -1
    filtered.sort((left, right) => {
      if (sortField === 'citations') {
        const leftCitations = Number(metricsByWorkId.get(left.id)?.citations || 0)
        const rightCitations = Number(metricsByWorkId.get(right.id)?.citations || 0)
        return (leftCitations - rightCitations) * direction
      }
      if (sortField === 'year') {
        const leftYear = left.year ?? 0
        const rightYear = right.year ?? 0
        return (leftYear - rightYear) * direction
      }
      if (sortField === 'title') {
        return left.title.localeCompare(right.title) * direction
      }
      if (sortField === 'venue') {
        return left.venue_name.localeCompare(right.venue_name) * direction
      }
      return (
        derivePublicationTypeLabel(left).localeCompare(derivePublicationTypeLabel(right)) *
        direction
      )
    })
    return filtered
  }, [filterKey, metricsByWorkId, personaState?.works, query, sortDirection, sortField, typeFilter])

  useEffect(() => {
    if (filteredWorks.length === 0) {
      setSelectedWorkId(null)
      return
    }
    setSelectedWorkId((current) => {
      if (current && filteredWorks.some((work) => work.id === current)) {
        return current
      }
      return filteredWorks[0].id
    })
  }, [filteredWorks])

  const selectedWork = useMemo(() => {
    if (!selectedWorkId) {
      return null
    }
    return (personaState?.works ?? []).find((work) => work.id === selectedWorkId) ?? null
  }, [personaState?.works, selectedWorkId])

  useEffect(() => {
    if (!selectedWorkId) {
      return
    }
    void ensureActiveTabData(selectedWorkId, activeDetailTab)
  }, [activeDetailTab, ensureActiveTabData, selectedWorkId])

  const selectedDetail = selectedWorkId ? detailCacheByWorkId[selectedWorkId] || null : null
  const selectedAuthorsPayload = selectedWorkId ? authorsCacheByWorkId[selectedWorkId] || null : null
  const selectedImpactResponse = selectedWorkId ? impactCacheByWorkId[selectedWorkId] || null : null
  const selectedAiResponse = selectedWorkId ? aiCacheByWorkId[selectedWorkId] || null : null
  const selectedFilesPayload = selectedWorkId ? filesCacheByWorkId[selectedWorkId] || null : null

  const selectedAuthorNames = useMemo(() => {
    if (selectedAuthorsPayload?.authors_json?.length) {
      const extracted = extractAuthorNamesFromAuthorsJson(selectedAuthorsPayload.authors_json)
      if (extracted.length > 0) {
        return extracted
      }
    }
    if (selectedDetail?.authors_json?.length) {
      const extracted = extractAuthorNamesFromAuthorsJson(selectedDetail.authors_json)
      if (extracted.length > 0) {
        return extracted
      }
    }
    return selectedWork?.authors || []
  }, [selectedAuthorsPayload?.authors_json, selectedDetail?.authors_json, selectedWork?.authors])

  useEffect(() => {
    if (!token || !selectedWorkId || activeDetailTab !== 'overview') {
      return
    }
    if (selectedAuthorsPayload?.status !== 'RUNNING') {
      return
    }
    let cancelled = false
    let attempts = 0
    const timer = window.setInterval(() => {
      attempts += 1
      if (cancelled || attempts > 20) {
        window.clearInterval(timer)
        return
      }
      void loadPublicationAuthorsData(selectedWorkId, true)
    }, 4000)
    return () => {
      cancelled = true
      window.clearInterval(timer)
    }
  }, [activeDetailTab, loadPublicationAuthorsData, selectedAuthorsPayload?.status, selectedWorkId, token])

  useEffect(() => {
    if (!token || !selectedWorkId || activeDetailTab !== 'impact') {
      return
    }
    if (selectedImpactResponse?.status !== 'RUNNING') {
      return
    }
    let cancelled = false
    let attempts = 0
    const timer = window.setInterval(() => {
      attempts += 1
      if (cancelled || attempts > 20) {
        window.clearInterval(timer)
        return
      }
      void loadPublicationImpactData(selectedWorkId, true)
    }, 7000)
    return () => {
      cancelled = true
      window.clearInterval(timer)
    }
  }, [activeDetailTab, loadPublicationImpactData, selectedImpactResponse?.status, selectedWorkId, token])

  useEffect(() => {
    if (!token || !selectedWorkId || activeDetailTab !== 'ai') {
      return
    }
    if (selectedAiResponse?.status !== 'RUNNING') {
      return
    }
    let cancelled = false
    let attempts = 0
    const timer = window.setInterval(() => {
      attempts += 1
      if (cancelled || attempts > 20) {
        window.clearInterval(timer)
        return
      }
      void loadPublicationAiData(selectedWorkId, true)
    }, 7000)
    return () => {
      cancelled = true
      window.clearInterval(timer)
    }
  }, [activeDetailTab, loadPublicationAiData, selectedAiResponse?.status, selectedWorkId, token])

  const ownerName = user?.name || ''
  const ownerEmail = user?.email || ''
  const hIndex = analyticsSummary?.h_index ?? 0
  const analyticsComputedAt = analyticsResponse?.computed_at || analyticsSummary?.computed_at || null
  const analyticsUpdating = analyticsResponse?.status === 'RUNNING'
  const analyticsFailed = analyticsResponse?.status === 'FAILED' || analyticsResponse?.last_update_failed
  const topDrivers = (analyticsTopDrivers?.drivers || []).slice(0, 5)
  const publicationsPerYearPoints = useMemo(() => {
    const countsByYear = new Map<number, number>()
    for (const work of personaState?.works || []) {
      const rawYear = work.year
      if (typeof rawYear !== 'number' || Number.isNaN(rawYear)) {
        continue
      }
      const year = Math.trunc(rawYear)
      if (year < 1900 || year > 2100) {
        continue
      }
      countsByYear.set(year, (countsByYear.get(year) || 0) + 1)
    }
    return Array.from(countsByYear.entries())
      .sort((a, b) => a[0] - b[0])
      .map(([year, papers]) => ({ year, papers }))
  }, [personaState?.works])
  const maxYearlyPublications = Math.max(1, ...publicationsPerYearPoints.map((point) => Number(point.papers || 0)))
  const latestPublicationYearPoint = publicationsPerYearPoints.at(-1) || null
  const worksWithKnownYear = publicationsPerYearPoints.reduce((sum, point) => sum + point.papers, 0)
  const authorshipRoleMix = useMemo(() => {
    let first = 0
    let second = 0
    let last = 0
    let other = 0
    let unknown = 0
    const works = personaState?.works || []
    for (const work of works) {
      const rawPosition = work.user_author_position
      const rawAuthorCount = work.author_count
      const userPosition = typeof rawPosition === 'number' && Number.isFinite(rawPosition) ? Math.trunc(rawPosition) : null
      const authorCount = typeof rawAuthorCount === 'number' && Number.isFinite(rawAuthorCount)
        ? Math.trunc(rawAuthorCount)
        : Array.isArray(work.authors)
          ? work.authors.length
          : 0
      if (!userPosition || userPosition <= 0 || authorCount <= 0) {
        unknown += 1
        continue
      }
      if (userPosition === 1) {
        first += 1
        continue
      }
      if (userPosition === 2) {
        second += 1
        continue
      }
      if (authorCount > 1 && userPosition === authorCount) {
        last += 1
        continue
      }
      other += 1
    }
    return {
      first,
      second,
      last,
      other,
      unknown,
      known: first + second + last + other,
      total: works.length,
    }
  }, [personaState?.works])
  const authorshipRoleSegments = useMemo(() => {
    const known = Math.max(0, authorshipRoleMix.known)
    if (known === 0) {
      return []
    }
    const segments = [
      { key: 'first', label: '1st', count: authorshipRoleMix.first, tone: 'bg-emerald-500' },
      { key: 'second', label: '2nd', count: authorshipRoleMix.second, tone: 'bg-sky-500' },
      { key: 'last', label: 'Last', count: authorshipRoleMix.last, tone: 'bg-violet-500' },
      { key: 'other', label: 'Other', count: authorshipRoleMix.other, tone: 'bg-slate-500' },
    ].filter((item) => item.count > 0)
    return segments.map((item) => ({
      ...item,
      pct: (item.count / known) * 100,
    }))
  }, [authorshipRoleMix])

  const hasActiveSyncJob = Boolean(
    activeSyncJob && (activeSyncJob.status === 'queued' || activeSyncJob.status === 'running'),
  )
  const canBootstrapInsights = Boolean(token) && !isFixtureMode && !hasActiveSyncJob && !bootstrappingInsights

  const onSortColumn = (column: PublicationSortField) => {
    if (sortField === column) {
      setSortDirection((current) => (current === 'desc' ? 'asc' : 'desc'))
      return
    }
    setSortField(column)
    setSortDirection('desc')
  }

  const onBootstrapPublicationInsights = async () => {
    if (!token || isFixtureMode) {
      return
    }
    setError('')
    setStatus('')
    setBootstrappingInsights(true)
    try {
      const payload = await bootstrapPublicationsInsightsFromOrcid(token, {
        orcidId: bootstrapOrcidId,
        fullName: bootstrapFullName,
        providers: ['openalex', 'semantic_scholar'],
        refreshAnalytics: true,
        refreshMetrics: true,
        maxWorks: 500,
      })
      if (payload.sync_job) {
        setActiveSyncJob(payload.sync_job)
        if (payload.sync_job.user_id) {
          savePublicationsActiveSyncJobId(payload.sync_job.user_id, payload.sync_job.id)
        }
      }
      setStatus(payload.message || `Imported ${payload.imported_count} works from ORCID/OpenAlex.`)
      await loadData(token, false, true)
    } catch (bootstrapError) {
      setError(
        bootstrapError instanceof Error
          ? bootstrapError.message
          : 'Could not populate publication insights from ORCID.',
      )
    } finally {
      setBootstrappingInsights(false)
    }
  }

  const activePaneLoading = selectedWorkId
    ? Boolean(paneLoadingByKey[publicationPaneKey(selectedWorkId, activeDetailTab)])
    : false
  const activePaneError = selectedWorkId
    ? paneErrorByKey[publicationPaneKey(selectedWorkId, activeDetailTab)] || ''
    : ''
  const detailYear = selectedDetail?.year ?? selectedWork?.year ?? null
  const detailJournal = selectedDetail?.journal || formatJournalName(selectedWork?.venue_name || '')
  const detailPublicationType = selectedDetail?.publication_type || (selectedWork ? derivePublicationTypeLabel(selectedWork) : 'Not available')
  const detailCitations = selectedDetail?.citations_total ?? (selectedWork ? Number(metricsByWorkId.get(selectedWork.id)?.citations || 0) : 0)
  const detailDoi = selectedDetail?.doi || selectedWork?.doi || null
  const detailPmid = selectedDetail?.pmid || selectedWork?.pmid || null
  const detailAbstract = selectedDetail?.abstract || selectedWork?.abstract || ''
  const detailKeywords = selectedDetail?.keywords_json?.length ? selectedDetail.keywords_json : (selectedWork?.keywords || [])
  const contentMode = selectedWorkId ? (contentModeByWorkId[selectedWorkId] || 'plain') : 'plain'
  const abstractExpanded = selectedWorkId ? Boolean(expandedAbstractByWorkId[selectedWorkId]) : false
  const abstractPreview = abstractExpanded ? detailAbstract : detailAbstract.slice(0, 700)

  const onDetailTabChange = (tabValue: string) => {
    if (tabValue === 'overview' || tabValue === 'content' || tabValue === 'impact' || tabValue === 'files' || tabValue === 'ai') {
      setActiveDetailTab(tabValue)
    }
  }

  const onToggleAbstractExpanded = () => {
    if (!selectedWorkId) {
      return
    }
    setExpandedAbstractByWorkId((current) => ({
      ...current,
      [selectedWorkId]: !current[selectedWorkId],
    }))
  }

  const onContentModeChange = async (nextMode: 'plain' | 'highlighted') => {
    if (!selectedWorkId) {
      return
    }
    setContentModeByWorkId((current) => ({ ...current, [selectedWorkId]: nextMode }))
    if (nextMode === 'highlighted') {
      await loadPublicationAiData(selectedWorkId)
    }
  }

  const onCopyVancouverCitation = async () => {
    if (!selectedWork) {
      return
    }
    const citation = formatVancouverCitation({
      title: selectedDetail?.title || selectedWork.title,
      journal: detailJournal,
      year: detailYear,
      authors: selectedAuthorNames,
      doi: detailDoi,
    })
    try {
      await navigator.clipboard.writeText(citation)
      setStatus('Citation copied to clipboard.')
    } catch {
      setError('Could not copy citation to clipboard.')
    }
  }

  const refreshFilesTab = async (workId: string) => {
    await loadPublicationFilesData(workId, true)
  }

  const onFindOpenAccessPdf = async () => {
    if (!token || !selectedWorkId) {
      return
    }
    setFindingOa(true)
    setPaneError(selectedWorkId, 'files', '')
    try {
      const payload = await linkPublicationOpenAccessPdf(token, selectedWorkId)
      if (payload.file) {
        setStatus(payload.message || 'Open-access PDF link added.')
      } else {
        setStatus(payload.message || 'Open-access PDF link checked.')
      }
      await refreshFilesTab(selectedWorkId)
    } catch (linkError) {
      setPaneError(selectedWorkId, 'files', linkError instanceof Error ? linkError.message : 'Could not resolve open-access PDF.')
    } finally {
      setFindingOa(false)
    }
  }

  const onUploadFiles = async (files: FileList | null) => {
    if (!token || !selectedWorkId || !files || files.length === 0) {
      return
    }
    setUploadingFile(true)
    setPaneError(selectedWorkId, 'files', '')
    try {
      for (const file of Array.from(files)) {
        await uploadPublicationFile(token, selectedWorkId, file)
      }
      setStatus('File upload completed.')
      await refreshFilesTab(selectedWorkId)
    } catch (uploadError) {
      setPaneError(selectedWorkId, 'files', uploadError instanceof Error ? uploadError.message : 'Could not upload publication file.')
    } finally {
      setUploadingFile(false)
      if (filePickerRef.current) {
        filePickerRef.current.value = ''
      }
    }
  }

  const onDeletePublicationFile = async (fileId: string) => {
    if (!token || !selectedWorkId) {
      return
    }
    setDeletingFileId(fileId)
    setPaneError(selectedWorkId, 'files', '')
    try {
      await deletePublicationFile(token, selectedWorkId, fileId)
      await refreshFilesTab(selectedWorkId)
    } catch (deleteError) {
      setPaneError(selectedWorkId, 'files', deleteError instanceof Error ? deleteError.message : 'Could not delete publication file.')
    } finally {
      setDeletingFileId(null)
    }
  }

  const onDownloadPublicationFile = async (fileId: string, fallbackName: string) => {
    if (!token || !selectedWorkId) {
      return
    }
    setDownloadingFileId(fileId)
    setPaneError(selectedWorkId, 'files', '')
    try {
      const payload = await downloadPublicationFile(token, selectedWorkId, fileId)
      const objectUrl = URL.createObjectURL(payload.blob)
      const link = document.createElement('a')
      link.href = objectUrl
      link.download = payload.fileName || fallbackName
      document.body.appendChild(link)
      link.click()
      document.body.removeChild(link)
      URL.revokeObjectURL(objectUrl)
    } catch (downloadError) {
      setPaneError(selectedWorkId, 'files', downloadError instanceof Error ? downloadError.message : 'Could not download publication file.')
    } finally {
      setDownloadingFileId(null)
    }
  }

  return (
    <section className="space-y-4">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-1">
          <h1 className="text-2xl font-semibold tracking-tight">Publications</h1>
        </div>
        {!isFixtureMode ? (
          <div className="flex flex-wrap items-end gap-2 rounded-md border border-border/70 bg-muted/20 p-2">
            <div className="space-y-1">
              <p className="text-micro uppercase text-muted-foreground">ORCID iD</p>
              <Input
                value={bootstrapOrcidId}
                onChange={(event) => setBootstrapOrcidId(event.target.value)}
                placeholder="0000-0000-0000-0000"
                className="h-8 w-44"
              />
            </div>
            <div className="space-y-1">
              <p className="text-micro uppercase text-muted-foreground">Name</p>
              <Input
                value={bootstrapFullName}
                onChange={(event) => setBootstrapFullName(event.target.value)}
                placeholder="Full name"
                className="h-8 w-48"
              />
            </div>
            <Button
              type="button"
              size="sm"
              onClick={() => {
                void onBootstrapPublicationInsights()
              }}
              disabled={
                !canBootstrapInsights
                || !bootstrapOrcidId.trim()
                || !bootstrapFullName.trim()
              }
            >
              {bootstrappingInsights ? 'Populating...' : 'Populate insights'}
            </Button>
          </div>
        ) : null}
      </header>

      <PublicationsTopStrip metrics={topMetricsResponse} loading={loading || !topMetricsResponse} token={token || null} />

      <div className="grid gap-3 xl:grid-cols-2">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Papers per year</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            <div className="rounded border border-border/70 bg-muted/20 px-2 py-1.5">
              <p className="text-micro text-muted-foreground">Authorship role mix (1st / 2nd / last / other)</p>
              {authorshipRoleMix.known > 0 ? (
                <>
                  <div className="mt-1 flex h-1.5 overflow-hidden rounded bg-muted">
                    {authorshipRoleSegments.map((segment) => (
                      <div
                        key={segment.key}
                        className={segment.tone}
                        style={{ width: `${segment.pct}%` }}
                        title={`${segment.label}: ${segment.count} papers`}
                      />
                    ))}
                  </div>
                  <div className="mt-1 flex flex-wrap items-center gap-2 text-micro text-muted-foreground">
                    <span>1st {authorshipRoleMix.first}</span>
                    <span>2nd {authorshipRoleMix.second}</span>
                    <span>Last {authorshipRoleMix.last}</span>
                    <span>Other {authorshipRoleMix.other}</span>
                    {authorshipRoleMix.unknown > 0 ? <span>Unknown {authorshipRoleMix.unknown}</span> : null}
                  </div>
                </>
              ) : (
                <p className="mt-1 text-micro text-muted-foreground">No authorship position data available yet.</p>
              )}
            </div>
            {publicationsPerYearPoints.length === 0 ? (
              <p className="text-sm text-muted-foreground">No publication years available yet.</p>
            ) : (
              publicationsPerYearPoints.map((point) => {
                const width = Math.max(2, Math.round((point.papers / maxYearlyPublications) * 100))
                return (
                  <div key={point.year} className="grid grid-cols-[56px_1fr_110px] items-center gap-2 text-sm">
                    <span className="text-xs text-muted-foreground">{point.year}</span>
                    <div className="h-2 rounded bg-muted">
                      <div className="h-2 rounded bg-emerald-500" style={{ width: `${width}%` }} />
                    </div>
                    <span className="text-xs text-muted-foreground">{point.papers} paper{point.papers === 1 ? '' : 's'}</span>
                  </div>
                )
              })
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Top 5 growth-driving papers (last 12m)</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            {topDrivers.length === 0 ? (
              <p className="text-muted-foreground">No growth-driving papers identified yet.</p>
            ) : (
              topDrivers.map((driver) => (
                <div key={driver.work_id} className="rounded border border-border px-3 py-2">
                  <p className="font-medium">{driver.title}</p>
                  <p className="text-xs text-muted-foreground">
                    {driver.year ?? 'Year n/a'} | +{driver.citations_last_12_months} in last 12m | total {driver.current_citations}
                  </p>
                </div>
              ))
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardContent className="grid gap-2 p-4 md:grid-cols-3 xl:grid-cols-3">
          <div className="rounded border border-border px-3 py-2 text-sm">
            <p className="text-xs text-muted-foreground">Total works</p>
            <p className="font-semibold">{personaState?.works.length ?? 0}</p>
            <p className="text-xs text-muted-foreground">With known year: {worksWithKnownYear}</p>
          </div>
          <div className="rounded border border-border px-3 py-2 text-sm">
            <p className="text-xs text-muted-foreground">Latest publication year</p>
            <p className="font-semibold">
              {latestPublicationYearPoint ? `${latestPublicationYearPoint.year}: ${latestPublicationYearPoint.papers} paper${latestPublicationYearPoint.papers === 1 ? '' : 's'}` : 'n/a'}
            </p>
          </div>
          <div className="rounded border border-border px-3 py-2 text-sm">
            <p className="text-xs text-muted-foreground">Analytics computed</p>
            <p className="font-semibold">{formatShortDate(analyticsComputedAt)}</p>
            <p className="text-xs text-muted-foreground">Auto-updates daily</p>
            {analyticsUpdating ? <p className="text-xs text-muted-foreground">Updating...</p> : null}
            {analyticsFailed ? <p className="text-xs text-amber-700">Last update failed</p> : null}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">Publication library</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid gap-4 xl:grid-cols-[minmax(0,2fr)_minmax(320px,1fr)]">
            <div className="space-y-3">
              <div className="flex flex-wrap items-center gap-2">
                <Input
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder="Filter by title, journal, DOI, PMID, author"
                  className="w-sz-280"
                />
                <select
                  value={filterKey}
                  onChange={(event) => setFilterKey(event.target.value as PublicationFilterKey)}
                  className="h-9 rounded-md border border-input bg-background px-2 text-sm"
                >
                  <option value="all">All works</option>
                  <option value="cited">Cited only</option>
                  <option value="with_doi">With DOI</option>
                  <option value="with_abstract">With abstract</option>
                  <option value="with_pmid">With PMID</option>
                </select>
                <select
                  value={typeFilter}
                  onChange={(event) => setTypeFilter(event.target.value)}
                  className="h-9 rounded-md border border-input bg-background px-2 text-sm"
                >
                  <option value="all">All types</option>
                  {typeFilterOptions.map((value) => (
                    <option key={value} value={value}>
                      {value}
                    </option>
                  ))}
                </select>
              </div>

              {filteredWorks.length === 0 ? (
                <div className="rounded border border-dashed border-border p-4 text-sm text-muted-foreground">
                  <p className="mb-2 text-foreground">No works in your library yet.</p>
                  <ol className="list-decimal space-y-1 pl-5">
                    <li>Connect ORCID in Integrations.</li>
                    <li>Run ORCID sync from the top-right actions.</li>
                    <li>Select any row to inspect publication details.</li>
                  </ol>
                </div>
              ) : (
                <div className="overflow-x-auto rounded border border-border">
                  <table className="w-full min-w-sz-760 text-sm">
                    <thead className="bg-muted/35 text-left text-xs text-muted-foreground">
                      <tr>
                        <th className="px-2 py-2">
                          <SortHeader
                            label="Title"
                            column="title"
                            sortField={sortField}
                            sortDirection={sortDirection}
                            onSort={onSortColumn}
                          />
                        </th>
                        <th className="px-2 py-2">
                          <SortHeader
                            label="Year"
                            column="year"
                            sortField={sortField}
                            sortDirection={sortDirection}
                            onSort={onSortColumn}
                          />
                        </th>
                        <th className="px-2 py-2">
                          <SortHeader
                            label="Journal"
                            column="venue"
                            sortField={sortField}
                            sortDirection={sortDirection}
                            onSort={onSortColumn}
                          />
                        </th>
                        <th className="px-2 py-2">
                          <SortHeader
                            label="Publication type"
                            column="work_type"
                            sortField={sortField}
                            sortDirection={sortDirection}
                            onSort={onSortColumn}
                          />
                        </th>
                        <th className="px-2 py-2">
                          <SortHeader
                            label="Citations"
                            column="citations"
                            sortField={sortField}
                            sortDirection={sortDirection}
                            onSort={onSortColumn}
                          />
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredWorks.map((work) => {
                        const metrics = metricsByWorkId.get(work.id)
                        const isSelected = selectedWorkId === work.id
                        return (
                          <tr
                            key={work.id}
                            onClick={() => setSelectedWorkId(work.id)}
                            className={`cursor-pointer border-t border-border ${
                              isSelected ? 'bg-emerald-50/70' : 'hover:bg-accent/30'
                            }`}
                          >
                            <td className="px-2 py-2 font-medium">{work.title}</td>
                            <td className="px-2 py-2 font-semibold">{work.year ?? 'n/a'}</td>
                            <td className="px-2 py-2 font-medium">{formatJournalName(work.venue_name) || 'n/a'}</td>
                            <td className="px-2 py-2">{derivePublicationTypeLabel(work)}</td>
                            <td
                              className={`px-2 py-2 transition-colors ${citationCellTone(
                                metrics?.citations ?? 0,
                                hIndex,
                              )}`}
                            >
                              {metrics?.citations ?? 0}
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

                        <Card className="h-fit xl:sticky xl:top-4">
              {!selectedWork ? (
                <CardContent className="p-3 text-sm text-muted-foreground">
                  Select a publication to view details.
                </CardContent>
              ) : (
                <CardContent className="p-0 text-sm">
                  <Tabs value={activeDetailTab} onValueChange={onDetailTabChange} className="w-full">
                    <div className="max-h-[78vh] overflow-auto">
                      <div className="sticky top-0 z-20 border-b border-border bg-card px-3 py-3">
                        <p className="line-clamp-2 text-sm font-semibold leading-snug">
                          {selectedDetail?.title || selectedWork.title}
                        </p>
                        <TabsList className="mt-2 grid h-auto w-full grid-cols-5 gap-1 bg-muted/40 p-1">
                          <TabsTrigger value="overview" className="text-micro">Overview</TabsTrigger>
                          <TabsTrigger value="content" className="text-micro">Content</TabsTrigger>
                          <TabsTrigger value="impact" className="text-micro">Impact</TabsTrigger>
                          <TabsTrigger value="files" className="text-micro">Files</TabsTrigger>
                          <TabsTrigger value="ai" className="text-micro">AI Insights</TabsTrigger>
                        </TabsList>
                      </div>

                      <div className="space-y-3 px-3 pb-3">
                        {activePaneError ? (
                          <p className="rounded border border-rose-200 bg-rose-50 px-2 py-1 text-xs text-rose-700">{activePaneError}</p>
                        ) : null}
                        {activePaneLoading ? (
                          <p className="text-xs text-muted-foreground">Loading...</p>
                        ) : null}

                        <TabsContent value="overview" className="space-y-3">
                          <div className="grid grid-cols-2 gap-2">
                            <div className="rounded border border-border px-2 py-1.5"><p className="text-micro uppercase text-muted-foreground">Year</p><p className="font-semibold">{detailYear ?? 'n/a'}</p></div>
                            <div className="rounded border border-border px-2 py-1.5"><p className="text-micro uppercase text-muted-foreground">Journal</p><p className="font-medium">{detailJournal || 'Not available'}</p></div>
                            <div className="rounded border border-border px-2 py-1.5"><p className="text-micro uppercase text-muted-foreground">Type</p><p className="font-medium">{detailPublicationType || 'Not available'}</p></div>
                            <div className="rounded border border-border px-2 py-1.5"><p className="text-micro uppercase text-muted-foreground">Citations</p><p className="font-semibold">{detailCitations}</p></div>
                            <div className="rounded border border-border px-2 py-1.5"><p className="text-micro uppercase text-muted-foreground">PMID</p>{detailPmid ? <a className="text-emerald-700 underline-offset-2 hover:underline" href={`https://pubmed.ncbi.nlm.nih.gov/${detailPmid}/`} target="_blank" rel="noreferrer">{detailPmid}</a> : <p className="text-muted-foreground">Not available</p>}</div>
                            <div className="rounded border border-border px-2 py-1.5"><p className="text-micro uppercase text-muted-foreground">DOI</p>{detailDoi ? <a className="break-all text-emerald-700 underline-offset-2 hover:underline" href={doiToUrl(detailDoi) || undefined} target="_blank" rel="noreferrer">{detailDoi}</a> : <p className="text-muted-foreground">Not available</p>}</div>
                          </div>

                          <div className="space-y-1">
                            <p className="text-micro uppercase text-muted-foreground">Authors</p>
                            {selectedAuthorsPayload?.status === 'RUNNING' ? <p className="text-xs text-muted-foreground">Fetching authors...</p> : null}
                            {selectedAuthorsPayload?.status === 'FAILED' ? <p className="text-xs text-amber-700">Last author hydration failed. Showing cached data.</p> : null}
                            {selectedAuthorNames.length > 0 ? (
                              <p className="leading-relaxed">
                                {selectedAuthorNames.slice(0, 6).map((author, index) => {
                                  const owner = (Boolean(ownerName) || Boolean(ownerEmail)) && isOwnerAuthor(author, ownerName, ownerEmail)
                                  return (
                                    <span key={`${author}-${index}`} className={owner ? 'font-semibold text-emerald-700' : undefined}>
                                      {author}{owner ? ' (you)' : ''}{index < Math.min(5, selectedAuthorNames.length - 1) ? ', ' : ''}
                                    </span>
                                  )
                                })}
                                {selectedAuthorNames.length > 6 ? <span className="text-muted-foreground"> +{selectedAuthorNames.length - 6} more</span> : null}
                              </p>
                            ) : <p className="text-muted-foreground">Not available</p>}
                          </div>

                          <div className="flex flex-wrap gap-2">
                            <Button type="button" size="sm" variant="outline" disabled={!Boolean(detailDoi)} asChild={Boolean(detailDoi)}>
                              {detailDoi ? <a href={doiToUrl(detailDoi) || undefined} target="_blank" rel="noreferrer">Open DOI</a> : <span>Open DOI</span>}
                            </Button>
                            <Button type="button" size="sm" variant="outline" disabled={!Boolean(detailPmid)} asChild={Boolean(detailPmid)}>
                              {detailPmid ? <a href={`https://pubmed.ncbi.nlm.nih.gov/${detailPmid}/`} target="_blank" rel="noreferrer">Open PubMed</a> : <span>Open PubMed</span>}
                            </Button>
                            <Button type="button" size="sm" variant="outline" onClick={onCopyVancouverCitation}>Copy citation</Button>
                            <Button type="button" size="sm" variant="outline" onClick={() => navigate('/workspace')}>Add to manuscript</Button>
                          </div>

                          <div className="rounded border border-border bg-muted/15 px-2 py-1.5 text-xs text-muted-foreground">
                            <p>Added: {formatShortDate(selectedDetail?.created_at || selectedWork.created_at)}</p>
                            <p>Updated: {formatShortDate(selectedDetail?.updated_at || selectedWork.updated_at)}</p>
                          </div>
                        </TabsContent>

                        <TabsContent value="content" className="space-y-3">
                          <div className="flex items-center gap-2">
                            <Button type="button" size="sm" variant={contentMode === 'plain' ? 'default' : 'outline'} onClick={() => void onContentModeChange('plain')}>Plain</Button>
                            <Button type="button" size="sm" variant={contentMode === 'highlighted' ? 'default' : 'outline'} onClick={() => void onContentModeChange('highlighted')}>Highlighted</Button>
                          </div>
                          <div className="space-y-2 rounded border border-border bg-muted/10 p-2">
                            <p className="text-micro uppercase text-muted-foreground">Abstract</p>
                            <p className="whitespace-pre-wrap text-xs leading-relaxed">{detailAbstract ? abstractPreview : 'No abstract available.'}</p>
                            {detailAbstract.length > 700 ? <Button type="button" size="sm" variant="outline" onClick={onToggleAbstractExpanded}>{abstractExpanded ? 'Collapse' : 'Expand'}</Button> : null}
                          </div>
                          {contentMode === 'highlighted' ? (
                            <div className="space-y-1 rounded border border-border bg-emerald-50/40 p-2 text-xs">
                              <p><span className="font-semibold">Objective:</span> {selectedAiResponse?.payload?.extractive_key_points?.objective || 'Not stated in abstract.'}</p>
                              <p><span className="font-semibold">Methods:</span> {selectedAiResponse?.payload?.extractive_key_points?.methods || 'Not stated in abstract.'}</p>
                              <p><span className="font-semibold">Findings:</span> {selectedAiResponse?.payload?.extractive_key_points?.main_findings || 'Not stated in abstract.'}</p>
                              <p><span className="font-semibold">Conclusion:</span> {selectedAiResponse?.payload?.extractive_key_points?.conclusion || 'Not stated in abstract.'}</p>
                            </div>
                          ) : null}
                          <div className="space-y-1">
                            <p className="text-micro uppercase text-muted-foreground">Keywords</p>
                            {detailKeywords.length > 0 ? (
                              <div className="flex flex-wrap gap-1">
                                {detailKeywords.map((keyword) => <span key={keyword} className="rounded border border-border bg-muted/40 px-1.5 py-0.5 text-xs">{keyword}</span>)}
                              </div>
                            ) : <p className="text-xs text-muted-foreground">No keywords saved.</p>}
                          </div>
                        </TabsContent>

                        <TabsContent value="impact" className="space-y-3">
                          {selectedImpactResponse?.status === 'RUNNING' ? <p className="text-xs text-muted-foreground">Computing impact insights...</p> : null}
                          {selectedImpactResponse?.status === 'FAILED' ? <p className="text-xs text-amber-700">Last impact update failed. Showing cached data.</p> : null}
                          <div className="grid grid-cols-2 gap-2">
                            <div className="rounded border border-border px-2 py-1.5"><p className="text-micro uppercase text-muted-foreground">Total citations</p><p className="font-semibold">{selectedImpactResponse?.payload?.citations_total ?? detailCitations}</p></div>
                            <div className="rounded border border-border px-2 py-1.5"><p className="text-micro uppercase text-muted-foreground">Citations (12m)</p><p className="font-semibold">{selectedImpactResponse?.payload?.citations_last_12m ?? 0}</p></div>
                            <div className="rounded border border-border px-2 py-1.5"><p className="text-micro uppercase text-muted-foreground">YoY %</p><p className={`font-semibold ${growthToneClass(selectedImpactResponse?.payload?.yoy_pct ?? null)}`}>{formatSignedPercent(selectedImpactResponse?.payload?.yoy_pct ?? null)}</p></div>
                            <div className="rounded border border-border px-2 py-1.5"><p className="text-micro uppercase text-muted-foreground">Acceleration</p><p className="font-semibold">{selectedImpactResponse?.payload?.acceleration_citations_per_month ?? 0}/month</p></div>
                          </div>
                          <div className="space-y-1 rounded border border-border px-2 py-1.5">
                            <p className="text-micro uppercase text-muted-foreground">Key citing papers</p>
                            {(selectedImpactResponse?.payload?.key_citing_papers || []).length === 0 ? <p className="text-xs text-muted-foreground">Not available from source.</p> : (selectedImpactResponse?.payload?.key_citing_papers || []).slice(0, 5).map((paper, index) => <p key={`${paper.title}-${index}`} className="text-xs">{paper.year ?? 'n/a'} | {paper.title}</p>)}
                          </div>
                        </TabsContent>

                        <TabsContent value="files" className="space-y-3">
                          <div className="flex flex-wrap gap-2">
                            <Button type="button" size="sm" variant="outline" onClick={onFindOpenAccessPdf} disabled={findingOa}>{findingOa ? 'Finding OA PDF...' : 'Find open access PDF'}</Button>
                            <Button type="button" size="sm" variant="outline" onClick={() => filePickerRef.current?.click()} disabled={uploadingFile}>{uploadingFile ? 'Uploading...' : 'Upload file'}</Button>
                            <input ref={filePickerRef} type="file" multiple className="hidden" onChange={(event) => void onUploadFiles(event.target.files)} />
                          </div>
                          <div
                            className={`rounded border border-dashed p-3 text-xs ${filesDragOver ? 'border-emerald-500 bg-emerald-50/40' : 'border-border bg-muted/10'}`}
                            onDragOver={(event) => {
                              event.preventDefault()
                              setFilesDragOver(true)
                            }}
                            onDragLeave={() => setFilesDragOver(false)}
                            onDrop={(event) => {
                              event.preventDefault()
                              setFilesDragOver(false)
                              void onUploadFiles(event.dataTransfer.files)
                            }}
                          >
                            Drag and drop files here, or use Upload file.
                          </div>
                          {(selectedFilesPayload?.items || []).length === 0 ? (
                            <p className="text-xs text-muted-foreground">No files linked to this publication.</p>
                          ) : (
                            <div className="space-y-2">
                              {(selectedFilesPayload?.items || []).map((file) => (
                                <div key={file.id} className="rounded border border-border px-2 py-1.5">
                                  <p className="truncate text-xs font-medium">{file.file_name}</p>
                                  <p className="text-micro text-muted-foreground">{file.file_type} | {file.source === 'OA_LINK' ? 'OA link' : 'Uploaded'} | {formatShortDate(file.created_at)}</p>
                                  <div className="mt-1 flex gap-1">
                                    {file.source === 'OA_LINK' && file.download_url ? (
                                      <Button type="button" size="sm" variant="outline" asChild><a href={file.download_url} target="_blank" rel="noreferrer">Open</a></Button>
                                    ) : (
                                      <Button type="button" size="sm" variant="outline" disabled={downloadingFileId === file.id} onClick={() => void onDownloadPublicationFile(file.id, file.file_name)}>{downloadingFileId === file.id ? 'Downloading...' : 'Download'}</Button>
                                    )}
                                    <Button type="button" size="sm" variant="outline" disabled={deletingFileId === file.id} onClick={() => void onDeletePublicationFile(file.id)}>{deletingFileId === file.id ? 'Deleting...' : 'Delete'}</Button>
                                  </div>
                                </div>
                              ))}
                            </div>
                          )}
                        </TabsContent>

                        <TabsContent value="ai" className="space-y-3">
                          <p className="rounded border border-border bg-muted/15 px-2 py-1 text-micro text-muted-foreground">AI-generated draft insights. Verify against full text.</p>
                          {selectedAiResponse?.status === 'RUNNING' ? <p className="text-xs text-muted-foreground">Generating insights...</p> : null}
                          {selectedAiResponse?.status === 'FAILED' ? <p className="text-xs text-amber-700">Last AI update failed. Showing cached data.</p> : null}
                          <div className="space-y-1 rounded border border-border px-2 py-1.5">
                            <p className="text-micro uppercase text-muted-foreground">Performance summary</p>
                            <p className="text-xs leading-relaxed">{selectedAiResponse?.payload?.performance_summary || 'Not available'}</p>
                          </div>
                          <div className="rounded border border-border px-2 py-1.5">
                            <p className="text-micro uppercase text-muted-foreground">Trajectory</p>
                            <p className="text-xs font-medium">{(selectedAiResponse?.payload?.trajectory_classification || 'UNKNOWN').replace(/_/g, ' ')}</p>
                          </div>
                          <div className="space-y-1 rounded border border-border px-2 py-1.5">
                            <p className="text-micro uppercase text-muted-foreground">Reuse suggestions</p>
                            {(selectedAiResponse?.payload?.reuse_suggestions || []).length === 0 ? <p className="text-xs text-muted-foreground">No suggestions yet.</p> : (selectedAiResponse?.payload?.reuse_suggestions || []).map((item, index) => <p key={`${item}-${index}`} className="text-xs">- {item}</p>)}
                          </div>
                          <div className="space-y-1 rounded border border-border px-2 py-1.5">
                            <p className="text-micro uppercase text-muted-foreground">Caution flags</p>
                            {(selectedAiResponse?.payload?.caution_flags || []).length === 0 ? <p className="text-xs text-muted-foreground">No caution flags.</p> : (selectedAiResponse?.payload?.caution_flags || []).map((item, index) => <p key={`${item}-${index}`} className="text-xs">- {item}</p>)}
                          </div>
                        </TabsContent>
                      </div>
                    </div>
                  </Tabs>
                </CardContent>
              )}
            </Card>

          </div>
        </CardContent>
      </Card>

      {status ? <p className="text-sm text-emerald-700">{status}</p> : null}
      {error ? <p className="text-sm text-destructive">{error}</p> : null}
      {(loading || richImporting || syncing || fullSyncing || bootstrappingInsights) ? (
        <p className="text-xs text-muted-foreground">Working...</p>
      ) : null}
    </section>
  )
}

