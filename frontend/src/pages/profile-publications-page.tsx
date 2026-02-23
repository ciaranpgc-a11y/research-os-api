import { useCallback, useEffect, useMemo, useState } from 'react'
import { ChevronDown, ChevronUp, ChevronsUpDown } from 'lucide-react'
import { useNavigate } from 'react-router-dom'

import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import {
  fetchMe,
  fetchOrcidStatus,
  fetchPersonaState,
  fetchPublicationsAnalyticsSummary,
  fetchPublicationsAnalyticsTimeseries,
  fetchPublicationsAnalyticsTopDrivers,
  importOrcidWorks,
  syncPersonaMetrics,
} from '@/lib/impact-api'
import { readCachedPersonaState, writeCachedPersonaState } from '@/lib/persona-cache'
import { getAuthSessionToken } from '@/lib/auth-session'
import type {
  AuthUser,
  OrcidStatusPayload,
  PersonaStatePayload,
  PublicationsAnalyticsSummaryPayload,
  PublicationsAnalyticsTimeseriesPayload,
  PublicationsAnalyticsTopDriversPayload,
} from '@/types/impact'

type PublicationFilterKey = 'all' | 'cited' | 'with_doi' | 'with_abstract' | 'with_pmid'
type PublicationSortField = 'citations' | 'year' | 'title' | 'venue' | 'work_type'
type SortDirection = 'asc' | 'desc'
const INTEGRATIONS_ORCID_STATUS_CACHE_KEY = 'aawe_integrations_orcid_status_cache'
const INTEGRATIONS_USER_CACHE_KEY = 'aawe_integrations_user_cache'
const PUBLICATIONS_ANALYTICS_SUMMARY_CACHE_KEY = 'aawe_publications_analytics_summary_cache'
const PUBLICATIONS_ANALYTICS_TIMESERIES_CACHE_KEY = 'aawe_publications_analytics_timeseries_cache'
const PUBLICATIONS_ANALYTICS_TOP_DRIVERS_CACHE_KEY = 'aawe_publications_analytics_top_drivers_cache'

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

function loadCachedOrcidStatus(): OrcidStatusPayload | null {
  if (typeof window === 'undefined') {
    return null
  }
  const raw = window.localStorage.getItem(INTEGRATIONS_ORCID_STATUS_CACHE_KEY)
  if (!raw) {
    return null
  }
  try {
    return JSON.parse(raw) as OrcidStatusPayload
  } catch {
    return null
  }
}

function saveCachedOrcidStatus(value: OrcidStatusPayload): void {
  if (typeof window === 'undefined') {
    return
  }
  window.localStorage.setItem(INTEGRATIONS_ORCID_STATUS_CACHE_KEY, JSON.stringify(value))
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

function loadCachedAnalyticsSummary(): PublicationsAnalyticsSummaryPayload | null {
  if (typeof window === 'undefined') {
    return null
  }
  const raw = window.localStorage.getItem(PUBLICATIONS_ANALYTICS_SUMMARY_CACHE_KEY)
  if (!raw) {
    return null
  }
  try {
    return JSON.parse(raw) as PublicationsAnalyticsSummaryPayload
  } catch {
    return null
  }
}

function saveCachedAnalyticsSummary(value: PublicationsAnalyticsSummaryPayload): void {
  if (typeof window === 'undefined') {
    return
  }
  window.localStorage.setItem(PUBLICATIONS_ANALYTICS_SUMMARY_CACHE_KEY, JSON.stringify(value))
}

function loadCachedAnalyticsTimeseries(): PublicationsAnalyticsTimeseriesPayload | null {
  if (typeof window === 'undefined') {
    return null
  }
  const raw = window.localStorage.getItem(PUBLICATIONS_ANALYTICS_TIMESERIES_CACHE_KEY)
  if (!raw) {
    return null
  }
  try {
    return JSON.parse(raw) as PublicationsAnalyticsTimeseriesPayload
  } catch {
    return null
  }
}

function saveCachedAnalyticsTimeseries(value: PublicationsAnalyticsTimeseriesPayload): void {
  if (typeof window === 'undefined') {
    return
  }
  window.localStorage.setItem(PUBLICATIONS_ANALYTICS_TIMESERIES_CACHE_KEY, JSON.stringify(value))
}

function loadCachedAnalyticsTopDrivers(): PublicationsAnalyticsTopDriversPayload | null {
  if (typeof window === 'undefined') {
    return null
  }
  const raw = window.localStorage.getItem(PUBLICATIONS_ANALYTICS_TOP_DRIVERS_CACHE_KEY)
  if (!raw) {
    return null
  }
  try {
    return JSON.parse(raw) as PublicationsAnalyticsTopDriversPayload
  } catch {
    return null
  }
}

function saveCachedAnalyticsTopDrivers(value: PublicationsAnalyticsTopDriversPayload): void {
  if (typeof window === 'undefined') {
    return
  }
  window.localStorage.setItem(PUBLICATIONS_ANALYTICS_TOP_DRIVERS_CACHE_KEY, JSON.stringify(value))
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

export function ProfilePublicationsPage() {
  const navigate = useNavigate()
  const initialCachedPersonaState = readCachedPersonaState()
  const initialCachedOrcidStatus = loadCachedOrcidStatus()
  const initialCachedUser = loadCachedUser()
  const initialCachedAnalyticsSummary = loadCachedAnalyticsSummary()
  const initialCachedAnalyticsTimeseries = loadCachedAnalyticsTimeseries()
  const initialCachedAnalyticsTopDrivers = loadCachedAnalyticsTopDrivers()
  const [token, setToken] = useState<string>(() => getAuthSessionToken())
  const [user, setUser] = useState<AuthUser | null>(initialCachedUser)
  const [personaState, setPersonaState] = useState<PersonaStatePayload | null>(initialCachedPersonaState)
  const [orcidStatus, setOrcidStatus] = useState<OrcidStatusPayload | null>(initialCachedOrcidStatus)
  const [analyticsSummary, setAnalyticsSummary] = useState<PublicationsAnalyticsSummaryPayload | null>(initialCachedAnalyticsSummary)
  const [analyticsTimeseries, setAnalyticsTimeseries] = useState<PublicationsAnalyticsTimeseriesPayload | null>(initialCachedAnalyticsTimeseries)
  const [analyticsTopDrivers, setAnalyticsTopDrivers] = useState<PublicationsAnalyticsTopDriversPayload | null>(initialCachedAnalyticsTopDrivers)
  const [query, setQuery] = useState('')
  const [filterKey, setFilterKey] = useState<PublicationFilterKey>('all')
  const [typeFilter, setTypeFilter] = useState<string>('all')
  const [sortField, setSortField] = useState<PublicationSortField>('year')
  const [sortDirection, setSortDirection] = useState<SortDirection>('desc')
  const [selectedWorkId, setSelectedWorkId] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [refreshingAnalytics, setRefreshingAnalytics] = useState(false)
  const [richImporting, setRichImporting] = useState(false)
  const [syncing, setSyncing] = useState(false)
  const [fullSyncing, setFullSyncing] = useState(false)
  const [status, setStatus] = useState('')
  const [error, setError] = useState('')

  const loadData = useCallback(async (
    sessionToken: string,
    resetMessages = true,
    refreshAnalytics = false,
    refreshAnalyticsMetrics = false,
    background = false,
  ) => {
    if (!background && refreshAnalytics) {
      setRefreshingAnalytics(true)
    } else if (!background) {
      setLoading(true)
    }
    if (!background) {
      setError('')
    }
    if (resetMessages) {
      setStatus('')
    }
    try {
      const settled = await Promise.allSettled([
        fetchPersonaState(sessionToken),
        fetchOrcidStatus(sessionToken),
        fetchMe(sessionToken),
        fetchPublicationsAnalyticsSummary(sessionToken, {
          refresh: refreshAnalytics,
          refreshMetrics: refreshAnalyticsMetrics,
        }),
        fetchPublicationsAnalyticsTimeseries(sessionToken, {
          refresh: refreshAnalytics,
          refreshMetrics: refreshAnalyticsMetrics,
        }),
        fetchPublicationsAnalyticsTopDrivers(sessionToken, {
          limit: 5,
          refresh: refreshAnalytics,
          refreshMetrics: refreshAnalyticsMetrics,
        }),
      ])
      const [stateResult, orcidResult, userResult, summaryResult, timeseriesResult, topDriversResult] = settled
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
      if (orcidResult.status === 'fulfilled') {
        setOrcidStatus(orcidResult.value)
        saveCachedOrcidStatus(orcidResult.value)
      }
      if (userResult.status === 'fulfilled') {
        setUser(userResult.value)
        saveCachedUser(userResult.value)
      }
      if (summaryResult.status === 'fulfilled') {
        setAnalyticsSummary(summaryResult.value)
        saveCachedAnalyticsSummary(summaryResult.value)
      }
      if (timeseriesResult.status === 'fulfilled') {
        setAnalyticsTimeseries(timeseriesResult.value)
        saveCachedAnalyticsTimeseries(timeseriesResult.value)
      }
      if (topDriversResult.status === 'fulfilled') {
        setAnalyticsTopDrivers(topDriversResult.value)
        saveCachedAnalyticsTopDrivers(topDriversResult.value)
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
        setRefreshingAnalytics(false)
      }
    }
  }, [])

  useEffect(() => {
    const sessionToken = getAuthSessionToken()
    setToken(sessionToken)
    if (!sessionToken) {
      navigate('/auth', { replace: true })
      return
    }
    void loadData(sessionToken, false, false, false, true)
  }, [loadData, navigate])

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

  const ownerName = user?.name || ''
  const ownerEmail = user?.email || ''
  const totalCitations = analyticsSummary?.total_citations ?? 0
  const hIndex = analyticsSummary?.h_index ?? 0
  const citationsLast12Months = analyticsSummary?.citations_last_12_months ?? 0
  const citationsPrevious12Months = analyticsSummary?.citations_previous_12_months ?? 0
  const yoyGrowthPercent = analyticsSummary?.yoy_percent ?? null
  const citationVelocity12m = analyticsSummary?.citation_velocity_12m ?? 0
  const latestYearGrowth = analyticsTimeseries?.points?.at(-1) || null
  const worksCount = personaState?.works.length ?? 0
  const busy = loading || refreshingAnalytics || richImporting || syncing || fullSyncing
  const canSyncCitations = worksCount > 0 && !busy
  const topDrivers = analyticsTopDrivers?.drivers || []
  const timeseriesPoints = analyticsTimeseries?.points || []
  const maxYearlyCitations = Math.max(1, ...timeseriesPoints.map((point) => Number(point.citations_added || 0)))

  const onSortColumn = (column: PublicationSortField) => {
    if (sortField === column) {
      setSortDirection((current) => (current === 'desc' ? 'asc' : 'desc'))
      return
    }
    setSortField(column)
    setSortDirection('desc')
  }

  const onSyncCitations = async () => {
    if (!token) {
      return
    }
    if (worksCount === 0) {
      setStatus('Import at least one work before syncing citations.')
      return
    }
    setSyncing(true)
    setError('')
    setStatus('')
    try {
      const payload = await syncPersonaMetrics(token, ['openalex'])
      setStatus(`Citations synchronised via OpenAlex (${payload.synced_snapshots} snapshot(s)).`)
      await loadData(token, false, true)
    } catch (syncError) {
      setError(syncError instanceof Error ? syncError.message : 'Could not synchronise citations.')
    } finally {
      setSyncing(false)
    }
  }

  const onRichImportOrcid = async () => {
    if (!token) {
      return
    }
    if (!orcidStatus?.linked) {
      setStatus('Connect ORCID in Integrations before running rich import.')
      return
    }
    setRichImporting(true)
    setError('')
    setStatus('')
    try {
      const importPayload = await importOrcidWorks(token, { overwriteUserMetadata: true })
      const syncPayload = await syncPersonaMetrics(token, ['openalex', 'semantic_scholar'])
      setStatus(
        `Rich import complete: ${importPayload.imported_count} work(s) refreshed, ${syncPayload.synced_snapshots} citation snapshot(s) updated.`,
      )
      await loadData(token, false, true)
    } catch (importError) {
      setError(importError instanceof Error ? importError.message : 'Could not run rich ORCID import.')
    } finally {
      setRichImporting(false)
    }
  }

  const onFullSyncCitations = async () => {
    if (!token) {
      return
    }
    if (worksCount === 0) {
      setStatus('Import at least one work before syncing citations.')
      return
    }
    setFullSyncing(true)
    setError('')
    setStatus('')
    try {
      const payload = await syncPersonaMetrics(token, ['openalex', 'semantic_scholar', 'manual'])
      setStatus(`Full citation sync complete (${payload.synced_snapshots} snapshot(s)).`)
      await loadData(token, false, true)
    } catch (syncError) {
      setError(syncError instanceof Error ? syncError.message : 'Could not run full citation sync.')
    } finally {
      setFullSyncing(false)
    }
  }

  const onRefreshAnalytics = async () => {
    if (!token) {
      return
    }
    setStatus('')
    setError('')
    try {
      await loadData(token, false, true)
      setStatus('Publication analytics refreshed.')
    } catch (refreshError) {
      setError(refreshError instanceof Error ? refreshError.message : 'Could not refresh publication analytics.')
    }
  }

  return (
    <section className="space-y-4">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-1">
          <h1 className="text-2xl font-semibold tracking-tight">Publications</h1>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button type="button" onClick={onRichImportOrcid} disabled={!Boolean(orcidStatus?.can_import) || busy}>
            {richImporting ? 'Syncing ORCID...' : 'Sync ORCID now'}
          </Button>
          <Button type="button" variant="outline" onClick={onRefreshAnalytics} disabled={busy}>
            {refreshingAnalytics ? 'Refreshing analytics...' : 'Refresh analytics'}
          </Button>
          <Button type="button" variant="outline" onClick={onSyncCitations} disabled={!canSyncCitations}>
            {syncing ? 'Syncing citations...' : 'Sync citations'}
          </Button>
          <Button type="button" variant="outline" onClick={onFullSyncCitations} disabled={!canSyncCitations}>
            {fullSyncing ? 'Full sync...' : 'Full sync (slower)'}
          </Button>
          <Button type="button" variant="outline" onClick={() => navigate('/profile/integrations')}>
            Open integrations
          </Button>
        </div>
      </header>

      <Card>
        <CardContent className="grid gap-2 p-4 md:grid-cols-3 xl:grid-cols-6">
          <div className="rounded border border-border px-3 py-2 text-sm">
            <p className="text-xs text-muted-foreground">Total citations</p>
            <p className="font-semibold">{totalCitations}</p>
          </div>
          <div className="rounded border border-border px-3 py-2 text-sm">
            <p className="text-xs text-muted-foreground">h-index</p>
            <p className="font-semibold">{hIndex}</p>
          </div>
          <div className="rounded border border-border px-3 py-2 text-sm">
            <p className="text-xs text-muted-foreground">Citation velocity (12m)</p>
            <p className="font-semibold">{citationVelocity12m}/month</p>
          </div>
          <div className="rounded border border-border px-3 py-2 text-sm">
            <p className="text-xs text-muted-foreground">Citations (last 12 months)</p>
            <p className="font-semibold">{citationsLast12Months}</p>
          </div>
          <div className="rounded border border-border px-3 py-2 text-sm">
            <p className="text-xs text-muted-foreground">Previous 12 months</p>
            <p className="font-semibold">{citationsPrevious12Months}</p>
          </div>
          <div className="rounded border border-border px-3 py-2 text-sm">
            <p className="text-xs text-muted-foreground">YoY %</p>
            <p className={`font-semibold ${growthToneClass(yoyGrowthPercent)}`}>
              {formatSignedPercent(yoyGrowthPercent)}
            </p>
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-3 xl:grid-cols-2">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Per-year citation graph</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {timeseriesPoints.length === 0 ? (
              <p className="text-sm text-muted-foreground">No year-by-year citation history yet.</p>
            ) : (
              timeseriesPoints.map((point) => {
                const width = Math.max(2, Math.round((point.citations_added / maxYearlyCitations) * 100))
                return (
                  <div key={point.year} className="grid grid-cols-[56px_1fr_110px] items-center gap-2 text-sm">
                    <span className="text-xs text-muted-foreground">{point.year}</span>
                    <div className="h-2 rounded bg-muted">
                      <div className="h-2 rounded bg-emerald-500" style={{ width: `${width}%` }} />
                    </div>
                    <span className="text-xs text-muted-foreground">+{point.citations_added} citations</span>
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
            <p className="text-xs text-muted-foreground">Previous 12 months: {citationsPrevious12Months}</p>
          </div>
          <div className="rounded border border-border px-3 py-2 text-sm">
            <p className="text-xs text-muted-foreground">Latest annual growth point</p>
            <p className="font-semibold">
              {latestYearGrowth ? `${latestYearGrowth.year}: +${latestYearGrowth.citations_added}` : 'n/a'}
            </p>
          </div>
          <div className="rounded border border-border px-3 py-2 text-sm">
            <p className="text-xs text-muted-foreground">Analytics computed</p>
            <p className="font-semibold">{formatShortDate(analyticsSummary?.computed_at)}</p>
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
                  className="w-[280px]"
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
                  <table className="w-full min-w-[760px] text-sm">
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
              <CardContent className="space-y-3 text-sm">
                {!selectedWork ? (
                  <p className="text-muted-foreground">Select a publication to view details.</p>
                ) : (
                  <>
                    <p className="text-base font-semibold leading-snug">{selectedWork.title}</p>

                    <div className="grid grid-cols-2 gap-2">
                      <div className="rounded border border-border bg-muted/20 px-2 py-1.5">
                        <p className="text-[11px] uppercase text-muted-foreground">Year</p>
                        <p className="text-2xl font-semibold leading-tight">{selectedWork.year ?? 'n/a'}</p>
                      </div>
                      <div className="rounded border border-border bg-muted/20 px-2 py-1.5">
                        <p className="text-[11px] uppercase text-muted-foreground">Journal</p>
                        <p className="text-sm font-medium leading-tight">{formatJournalName(selectedWork.venue_name)}</p>
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-2">
                      <div className="rounded border border-border px-2 py-1.5">
                        <p className="text-[11px] uppercase text-muted-foreground">Publication type</p>
                        <p className="font-medium">{derivePublicationTypeLabel(selectedWork)}</p>
                      </div>
                      <div className="rounded border border-border px-2 py-1.5">
                        <p className="text-[11px] uppercase text-muted-foreground">Citations</p>
                        <p className="font-medium">{metricsByWorkId.get(selectedWork.id)?.citations ?? 0}</p>
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-2">
                      <div className="rounded border border-border px-2 py-1.5">
                        <p className="text-[11px] uppercase text-muted-foreground">PMID</p>
                        {selectedWork.pmid ? (
                          <a
                            className="text-emerald-700 underline-offset-2 hover:underline"
                            href={`https://pubmed.ncbi.nlm.nih.gov/${selectedWork.pmid}/`}
                            target="_blank"
                            rel="noreferrer"
                          >
                            {selectedWork.pmid}
                          </a>
                        ) : (
                          <p>Not available</p>
                        )}
                      </div>
                      <div className="rounded border border-border px-2 py-1.5">
                        <p className="text-[11px] uppercase text-muted-foreground">DOI</p>
                        {selectedWork.doi ? (
                          <a
                            className="break-all text-emerald-700 underline-offset-2 hover:underline"
                            href={doiToUrl(selectedWork.doi) || undefined}
                            target="_blank"
                            rel="noreferrer"
                          >
                            {selectedWork.doi}
                          </a>
                        ) : (
                          <p className="text-muted-foreground">Not available</p>
                        )}
                      </div>
                    </div>

                    <div className="space-y-1">
                      <p className="text-[11px] uppercase text-muted-foreground">Authors</p>
                      {(selectedWork.authors || []).length > 0 ? (
                        <p className="whitespace-pre-wrap leading-relaxed">
                          {(selectedWork.authors || []).map((author, index, list) => {
                            const owner =
                              (Boolean(ownerName) || Boolean(ownerEmail)) &&
                              isOwnerAuthor(author, ownerName, ownerEmail)
                            return (
                              <span
                                key={`${author}-${index}`}
                                className={owner ? 'font-semibold text-emerald-700' : undefined}
                              >
                                {author}
                                {owner ? ' (you)' : ''}
                                {index < list.length - 1 ? ', ' : ''}
                              </span>
                            )
                          })}
                        </p>
                      ) : (
                        <p className="text-muted-foreground">Not available</p>
                      )}
                    </div>

                    <div className="space-y-1">
                      <p className="text-[11px] uppercase text-muted-foreground">Keywords</p>
                      {selectedWork.keywords.length > 0 ? (
                        <div className="flex flex-wrap gap-1">
                          {selectedWork.keywords.slice(0, 8).map((keyword) => (
                            <span
                              key={keyword}
                              className="rounded border border-border bg-muted/40 px-1.5 py-0.5 text-xs text-foreground"
                            >
                              {keyword}
                            </span>
                          ))}
                        </div>
                      ) : (
                        <p className="text-muted-foreground">No keywords saved.</p>
                      )}
                    </div>

                    <div className="space-y-1">
                      <p className="text-[11px] uppercase text-muted-foreground">Abstract</p>
                      <p className="max-h-44 overflow-auto whitespace-pre-wrap rounded border border-border bg-muted/15 p-2 text-xs leading-relaxed">
                        {selectedWork.abstract || 'No abstract available.'}
                      </p>
                    </div>

                    <div className="rounded border border-border bg-muted/15 px-2 py-1.5 text-xs text-muted-foreground">
                      <p>Added: {formatShortDate(selectedWork.created_at)}</p>
                      <p>Updated: {formatShortDate(selectedWork.updated_at)}</p>
                    </div>
                  </>
                )}
              </CardContent>
            </Card>
          </div>
        </CardContent>
      </Card>

      {status ? <p className="text-sm text-emerald-700">{status}</p> : null}
      {error ? <p className="text-sm text-destructive">{error}</p> : null}
      {(loading || richImporting || syncing || fullSyncing) ? (
        <p className="text-xs text-muted-foreground">Working...</p>
      ) : null}
    </section>
  )
}
