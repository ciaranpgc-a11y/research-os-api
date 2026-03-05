import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  AlertTriangle,
  CheckCircle2,
  Clock3,
  Database,
  Loader2,
  Plus,
  RefreshCw,
  Search,
  Trash2,
  UserRound,
} from 'lucide-react'
import { useNavigate } from 'react-router-dom'

import { PageHeader, Row, Section, SectionHeader, Stack } from '@/components/primitives'
import { SectionMarker } from '@/components/patterns'
import { Badge, Button, Input, Tabs, TabsContent, TabsList, TabsTrigger, type BadgeProps } from '@/components/ui'
import { clearAuthSessionToken, getAuthSessionToken } from '@/lib/auth-session'
import { houseLayout } from '@/lib/house-style'
import { fetchMe, fetchPersonaGrants } from '@/lib/impact-api'
import { getSectionMarkerTone } from '@/lib/section-tone'
import { cn } from '@/lib/utils'
import { PageFrame } from '@/pages/page-frame'
import type { PersonaGrantPayload, PersonaGrantsPayload } from '@/types/impact'

const HOUSE_SECTION_ANCHOR_CLASS = houseLayout.sectionAnchor
const MANUAL_GRANTS_STORAGE_PREFIX = 'aawe_profile_manual_grants:'

type GrantsTabKey = 'my_grants' | 'publications_under_grants' | 'needs_review'
type ProviderStatus = 'connected' | 'pending' | 'planned'

type ManualGrantDraft = {
  display_name: string
  funder_display_name: string
  funder_award_id: string
  start_year: string
  end_year: string
  amount: string
  currency: string
  notes: string
}

type ManualGrantRecord = {
  id: string
  display_name: string
  funder_display_name: string
  funder_award_id: string
  start_year: number | null
  end_year: number | null
  amount: number | null
  currency: string | null
  notes: string
  created_at: string
}

const DEFAULT_MANUAL_GRANT_DRAFT: ManualGrantDraft = {
  display_name: '',
  funder_display_name: '',
  funder_award_id: '',
  start_year: '',
  end_year: '',
  amount: '',
  currency: 'GBP',
  notes: '',
}

function normalizeNamePart(value: string): string {
  return value.trim().replace(/\s+/g, ' ')
}

function splitName(fullName: string | null | undefined): { firstName: string; lastName: string } {
  const clean = normalizeNamePart(String(fullName || ''))
  if (!clean) {
    return { firstName: '', lastName: '' }
  }
  const tokens = clean.split(' ').filter(Boolean)
  if (tokens.length < 2) {
    return { firstName: tokens[0] || '', lastName: '' }
  }
  return { firstName: tokens[0], lastName: tokens.slice(1).join(' ') }
}

function formatMoney(amount: number | null, currency: string | null): string {
  if (amount === null || !Number.isFinite(amount)) {
    return '-'
  }
  const code = String(currency || '').trim().toUpperCase() || 'USD'
  try {
    return new Intl.NumberFormat('en-GB', {
      style: 'currency',
      currency: code,
      maximumFractionDigits: 0,
    }).format(amount)
  } catch {
    return `${amount.toLocaleString('en-GB')} ${code}`
  }
}

function formatAwardPeriod(item: {
  start_year: number | null
  end_year: number | null
  start_date: string | null
  end_date: string | null
}): string {
  const startYear = Number(item.start_year || 0)
  const endYear = Number(item.end_year || 0)
  if (startYear > 0 && endYear > 0) {
    return `${startYear} - ${endYear}`
  }
  if (startYear > 0) {
    return `${startYear} -`
  }
  if (endYear > 0) {
    return `- ${endYear}`
  }
  const startDate = String(item.start_date || '').trim()
  const endDate = String(item.end_date || '').trim()
  if (startDate || endDate) {
    return `${startDate || '?'} - ${endDate || '?'}`
  }
  return '-'
}

function formatSourceTimestamp(value: string | null): string {
  const clean = String(value || '').trim()
  if (!clean) {
    return '-'
  }
  const date = new Date(clean)
  if (Number.isNaN(date.getTime())) {
    return clean
  }
  return date.toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short' })
}

function isSessionExpiredError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error || '')
  const lowered = message.toLowerCase()
  return (
    lowered.includes('session is invalid or expired')
    || lowered.includes('session was not found')
    || lowered.includes('session token is required')
    || lowered.includes('unauthorized')
    || lowered.includes('(401)')
  )
}

function parseYearInput(value: string): number | null {
  const clean = String(value || '').trim()
  if (!clean) {
    return null
  }
  const numeric = Math.round(Number(clean))
  if (!Number.isFinite(numeric) || numeric < 1900 || numeric > 3000) {
    return null
  }
  return numeric
}

function parseAmountInput(value: string): number | null {
  const clean = String(value || '').trim().replace(/,/g, '')
  if (!clean) {
    return null
  }
  const numeric = Number(clean)
  if (!Number.isFinite(numeric) || numeric < 0) {
    return null
  }
  return numeric
}

function parseNullableNumber(value: unknown): number | null {
  if (value === null || value === undefined) {
    return null
  }
  const clean = String(value).trim()
  if (!clean) {
    return null
  }
  const numeric = Number(clean)
  if (!Number.isFinite(numeric)) {
    return null
  }
  return numeric
}

function manualGrantsStorageKey(userId: string): string {
  return `${MANUAL_GRANTS_STORAGE_PREFIX}${userId}`
}

function loadManualGrants(userId: string): ManualGrantRecord[] {
  if (typeof window === 'undefined') {
    return []
  }
  const raw = window.localStorage.getItem(manualGrantsStorageKey(userId))
  if (!raw) {
    return []
  }
  try {
    const parsed = JSON.parse(raw) as Array<Partial<ManualGrantRecord>>
    if (!Array.isArray(parsed)) {
      return []
    }
    return parsed
      .map((item) => {
        const rawStartYear = parseNullableNumber(item.start_year)
        const rawEndYear = parseNullableNumber(item.end_year)
        return {
          id: String(item.id || ''),
          display_name: normalizeNamePart(String(item.display_name || '')),
          funder_display_name: normalizeNamePart(String(item.funder_display_name || '')),
          funder_award_id: normalizeNamePart(String(item.funder_award_id || '')),
          start_year: rawStartYear && rawStartYear > 0 ? Math.round(rawStartYear) : null,
          end_year: rawEndYear && rawEndYear > 0 ? Math.round(rawEndYear) : null,
          amount: parseNullableNumber(item.amount),
          currency: normalizeNamePart(String(item.currency || '')).toUpperCase() || null,
          notes: normalizeNamePart(String(item.notes || '')),
          created_at: String(item.created_at || ''),
        }
      })
      .filter((item) => Boolean(item.id && item.display_name))
  } catch {
    return []
  }
}

function saveManualGrants(userId: string, rows: ManualGrantRecord[]): void {
  if (typeof window === 'undefined') {
    return
  }
  window.localStorage.setItem(manualGrantsStorageKey(userId), JSON.stringify(rows))
}

function toManualGrantPayload(row: ManualGrantRecord): PersonaGrantPayload {
  return {
    openalex_award_id: `manual:${row.id}`,
    display_name: row.display_name,
    description: row.notes || null,
    funder_award_id: row.funder_award_id || null,
    funder: {
      id: null,
      display_name: row.funder_display_name || null,
      doi: null,
      ror: null,
    },
    amount: row.amount,
    currency: row.currency || 'GBP',
    funding_type: 'manual',
    funder_scheme: null,
    start_date: null,
    end_date: null,
    start_year: row.start_year,
    end_year: row.end_year,
    landing_page_url: null,
    doi: null,
    updated_date: row.created_at,
    supporting_works_count: 0,
    supporting_works: [],
    relationship_to_person: 'won_by_person',
    grant_owner_name: 'Added manually',
    grant_owner_role: 'manual',
    grant_owner_orcid: null,
    grant_owner_is_target_person: true,
    award_holders: [],
    person_role: null,
    source: 'manual',
    source_timestamp: row.created_at,
  }
}

function sourceLabel(source: string | null | undefined): string {
  const clean = String(source || '').trim().toLowerCase()
  if (!clean) {
    return 'Unknown'
  }
  if (clean === 'openalex') {
    return 'OpenAlex'
  }
  if (clean === 'ukri') {
    return 'UKRI GtR'
  }
  if (clean === 'nih_reporter') {
    return 'NIH RePORTER'
  }
  if (clean === 'nsf') {
    return 'NSF'
  }
  if (clean === 'cordis') {
    return 'CORDIS'
  }
  if (clean === 'manual') {
    return 'Manual'
  }
  return clean.toUpperCase()
}

type ConfidenceModel = {
  label: string
  variant: NonNullable<BadgeProps['variant']>
}

function confidenceForGrant(item: PersonaGrantPayload): ConfidenceModel {
  const source = String(item.source || '').trim().toLowerCase()
  if (source === 'manual') {
    return { label: 'Manual', variant: 'outline' }
  }
  if (item.relationship_to_person === 'won_by_person') {
    return { label: 'High', variant: 'positive' }
  }
  if (item.relationship_to_person === 'published_under_other_grant') {
    return { label: 'Medium', variant: 'intermediate' }
  }
  return { label: 'Low', variant: 'negative' }
}

function reviewReason(item: PersonaGrantPayload): string {
  if (item.relationship_to_person === 'published_under_unknown_grant') {
    return 'Grant owner could not be determined.'
  }
  if (!normalizeNamePart(String(item.grant_owner_name || ''))) {
    return 'Owner metadata is missing.'
  }
  if (!normalizeNamePart(String(item.funder_award_id || ''))) {
    return 'Award identifier is missing.'
  }
  if ((item.supporting_works_count || 0) <= 0) {
    return 'Supporting works count is zero.'
  }
  return 'Relationship attribution should be checked.'
}

function providerStatusBadge(status: ProviderStatus): { label: string; className: string } {
  if (status === 'connected') {
    return {
      label: 'Connected',
      className: 'border-[hsl(var(--tone-positive-200))] bg-[hsl(var(--tone-positive-50))] text-[hsl(var(--tone-positive-800))]',
    }
  }
  if (status === 'pending') {
    return {
      label: 'Pending setup',
      className: 'border-[hsl(var(--tone-warning-200))] bg-[hsl(var(--tone-warning-50))] text-[hsl(var(--tone-warning-800))]',
    }
  }
  return {
    label: 'Planned',
    className: 'border-[hsl(var(--tone-neutral-200))] bg-[hsl(var(--tone-neutral-100))] text-[hsl(var(--tone-neutral-700))]',
  }
}

function rowKey(item: PersonaGrantPayload, index: number): string {
  const stable = [
    item.openalex_award_id,
    item.funder.id,
    item.funder_award_id,
    item.source,
    item.relationship_to_person,
    index,
  ]
    .map((value) => String(value || ''))
    .join(':')
  return stable || `row:${index}`
}

export function ProfileGrantsPage() {
  const navigate = useNavigate()
  const [token, setToken] = useState<string | null>(() => getAuthSessionToken())
  const [userId, setUserId] = useState('')
  const [profileName, setProfileName] = useState('')
  const [openAlexAuthorId, setOpenAlexAuthorId] = useState<string | null>(null)
  const [firstName, setFirstName] = useState('')
  const [lastName, setLastName] = useState('')
  const [initialising, setInitialising] = useState(true)
  const [lookupBusy, setLookupBusy] = useState(false)
  const [error, setError] = useState('')
  const [lookupError, setLookupError] = useState('')
  const [globalSearchQuery, setGlobalSearchQuery] = useState('')
  const [activeSourceFilter, setActiveSourceFilter] = useState('all')
  const [activeTab, setActiveTab] = useState<GrantsTabKey>('my_grants')
  const [payload, setPayload] = useState<PersonaGrantsPayload | null>(null)
  const [manualGrants, setManualGrants] = useState<ManualGrantRecord[]>([])
  const [manualDraft, setManualDraft] = useState<ManualGrantDraft>(DEFAULT_MANUAL_GRANT_DRAFT)
  const [manualError, setManualError] = useState('')
  const autoLookupTriggeredRef = useRef(false)

  useEffect(() => {
    const sessionToken = getAuthSessionToken()
    if (!sessionToken) {
      navigate('/auth', { replace: true })
      return
    }
    setToken(sessionToken)

    const load = async () => {
      setInitialising(true)
      setError('')
      try {
        const me = await fetchMe(sessionToken)
        const parsed = splitName(me.name)
        setUserId(String(me.id || '').trim())
        setProfileName(normalizeNamePart(String(me.name || '')))
        setOpenAlexAuthorId(normalizeNamePart(String(me.openalex_author_id || '')) || null)
        setFirstName(parsed.firstName)
        setLastName(parsed.lastName)
      } catch (loadError) {
        const message = loadError instanceof Error ? loadError.message : 'Could not load profile name.'
        if (isSessionExpiredError(loadError)) {
          clearAuthSessionToken()
          navigate('/auth?next=/profile/grants&reason=session_expired', { replace: true })
          return
        }
        setError(message)
      } finally {
        setInitialising(false)
      }
    }

    void load()
  }, [navigate])

  useEffect(() => {
    if (!userId) {
      setManualGrants([])
      return
    }
    setManualGrants(loadManualGrants(userId))
  }, [userId])

  useEffect(() => {
    if (!userId) {
      return
    }
    saveManualGrants(userId, manualGrants)
  }, [manualGrants, userId])

  const canLookup = useMemo(
    () => Boolean(normalizeNamePart(firstName) && normalizeNamePart(lastName)),
    [firstName, lastName],
  )

  const runLookup = useCallback(async (input?: {
    firstName?: string
    lastName?: string
    refresh?: boolean
  }) => {
    const sessionToken = token || getAuthSessionToken()
    if (!sessionToken) {
      navigate('/auth', { replace: true })
      return
    }
    const cleanFirstName = normalizeNamePart(input?.firstName ?? firstName)
    const cleanLastName = normalizeNamePart(input?.lastName ?? lastName)
    if (!cleanFirstName || !cleanLastName) {
      setLookupError('First name and last name are required to look up grants.')
      return
    }
    setLookupBusy(true)
    setLookupError('')
    try {
      const response = await fetchPersonaGrants(sessionToken, {
        firstName: cleanFirstName,
        lastName: cleanLastName,
        limit: 60,
        relationship: 'all',
        refresh: Boolean(input?.refresh),
      })
      setPayload(response)
    } catch (lookupErr) {
      const message = lookupErr instanceof Error ? lookupErr.message : 'Could not load grants.'
      if (isSessionExpiredError(lookupErr)) {
        clearAuthSessionToken()
        navigate('/auth?next=/profile/grants&reason=session_expired', { replace: true })
        return
      }
      setPayload(null)
      setLookupError(message)
    } finally {
      setLookupBusy(false)
    }
  }, [firstName, lastName, navigate, token])

  useEffect(() => {
    if (initialising || autoLookupTriggeredRef.current) {
      return
    }
    const cleanFirstName = normalizeNamePart(firstName)
    const cleanLastName = normalizeNamePart(lastName)
    if (!cleanFirstName || !cleanLastName) {
      return
    }
    autoLookupTriggeredRef.current = true
    void runLookup({
      firstName: cleanFirstName,
      lastName: cleanLastName,
    })
  }, [firstName, initialising, lastName, runLookup])

  const matchedAuthorLabel = payload?.author?.display_name || null
  const matchedAuthorId = payload?.author?.openalex_author_id || openAlexAuthorId || null
  const manualGrantRows = useMemo(
    () => manualGrants.map(toManualGrantPayload),
    [manualGrants],
  )

  const apiRows = useMemo(
    () => payload?.items || [],
    [payload?.items],
  )
  const myGrantsRaw = useMemo(
    () => [
      ...manualGrantRows,
      ...apiRows.filter((item) => item.relationship_to_person === 'won_by_person'),
    ],
    [apiRows, manualGrantRows],
  )
  const publicationsUnderGrantsRaw = useMemo(
    () => apiRows.filter((item) => item.relationship_to_person !== 'won_by_person'),
    [apiRows],
  )
  const needsReviewRaw = useMemo(
    () => apiRows.filter((item) => (
      item.relationship_to_person === 'published_under_unknown_grant'
      || !normalizeNamePart(String(item.funder_award_id || ''))
      || !normalizeNamePart(String(item.grant_owner_name || ''))
      || (item.supporting_works_count || 0) <= 0
    )),
    [apiRows],
  )

  const sourceOptions = useMemo(() => {
    const seen = new Set<string>()
    for (const item of [...myGrantsRaw, ...publicationsUnderGrantsRaw, ...needsReviewRaw]) {
      const source = normalizeNamePart(String(item.source || 'openalex').toLowerCase()) || 'openalex'
      seen.add(source)
    }
    return ['all', ...Array.from(seen).sort()]
  }, [myGrantsRaw, needsReviewRaw, publicationsUnderGrantsRaw])

  useEffect(() => {
    if (activeSourceFilter === 'all') {
      return
    }
    if (!sourceOptions.includes(activeSourceFilter)) {
      setActiveSourceFilter('all')
    }
  }, [activeSourceFilter, sourceOptions])

  const filterRows = useCallback((rows: PersonaGrantPayload[]): PersonaGrantPayload[] => {
    const query = normalizeNamePart(globalSearchQuery).toLowerCase()
    return rows.filter((item) => {
      const source = normalizeNamePart(String(item.source || 'openalex').toLowerCase()) || 'openalex'
      if (activeSourceFilter !== 'all' && source !== activeSourceFilter) {
        return false
      }
      if (!query) {
        return true
      }
      const haystack = [
        item.display_name,
        item.description,
        item.funder.display_name,
        item.funder.id,
        item.funder_award_id,
        item.grant_owner_name,
        item.grant_owner_role,
        item.person_role,
        item.source,
        ...item.award_holders.map((holder) => holder.name),
      ]
        .map((value) => String(value || '').toLowerCase())
        .join(' ')
      return haystack.includes(query)
    })
  }, [activeSourceFilter, globalSearchQuery])

  const myGrants = useMemo(() => filterRows(myGrantsRaw), [filterRows, myGrantsRaw])
  const publicationsUnderGrants = useMemo(
    () => filterRows(publicationsUnderGrantsRaw),
    [filterRows, publicationsUnderGrantsRaw],
  )
  const needsReview = useMemo(() => filterRows(needsReviewRaw), [filterRows, needsReviewRaw])

  const myGrantTotalFunding = useMemo(() => (
    myGrantsRaw.reduce((sum, item) => {
      const amount = Number(item.amount)
      if (!Number.isFinite(amount)) {
        return sum
      }
      return sum + Math.max(0, amount)
    }, 0)
  ), [myGrantsRaw])

  const publicationsWorkTotal = useMemo(() => (
    publicationsUnderGrantsRaw.reduce((sum, item) => sum + Math.max(0, Number(item.supporting_works_count || 0)), 0)
  ), [publicationsUnderGrantsRaw])

  const lookupGeneratedAtLabel = formatSourceTimestamp(payload?.generated_at || null)
  const liveSourceSet = useMemo(() => {
    const values = new Set<string>()
    for (const item of payload?.items || []) {
      const source = normalizeNamePart(String(item.source || '').toLowerCase())
      if (source) {
        values.add(source)
      }
    }
    return values
  }, [payload?.items])

  const providerCards = useMemo(() => {
    const openAlexStatus: ProviderStatus = matchedAuthorId ? 'connected' : 'pending'
    const ukriStatus: ProviderStatus = liveSourceSet.has('ukri') ? 'connected' : 'pending'
    const nihStatus: ProviderStatus = liveSourceSet.has('nih_reporter') ? 'connected' : 'pending'
    const nsfStatus: ProviderStatus = liveSourceSet.has('nsf') ? 'connected' : 'pending'
    const cordisStatus: ProviderStatus = liveSourceSet.has('cordis') ? 'connected' : 'pending'
    return [
      {
        key: 'openalex',
        label: 'OpenAlex',
        status: openAlexStatus,
        detail: matchedAuthorId
          ? 'Using confirmed author profile to resolve grant-linked publications.'
          : 'Requires confirmed OpenAlex author profile in Integrations.',
        meta: payload ? `Last sync ${lookupGeneratedAtLabel}` : 'No grant sync run yet',
      },
      {
        key: 'ukri',
        label: 'UKRI GtR',
        status: ukriStatus,
        detail: 'Direct lookup for UK grant ownership and project metadata.',
        meta: ukriStatus === 'connected' ? 'Results loaded in current snapshot' : 'No results in current snapshot',
      },
      {
        key: 'nih_reporter',
        label: 'NIH RePORTER',
        status: nihStatus,
        detail: 'Direct lookup for PI and grant history from NIH.',
        meta: nihStatus === 'connected' ? 'Results loaded in current snapshot' : 'No results in current snapshot',
      },
      {
        key: 'nsf',
        label: 'NSF Awards',
        status: nsfStatus,
        detail: 'Direct lookup for NSF award records.',
        meta: nsfStatus === 'connected' ? 'Results loaded in current snapshot' : 'No results in current snapshot',
      },
      {
        key: 'cordis',
        label: 'CORDIS',
        status: cordisStatus,
        detail: 'Direct lookup for matching EU framework programme projects.',
        meta: cordisStatus === 'connected' ? 'Results loaded in current snapshot' : 'No results in current snapshot',
      },
    ]
  }, [liveSourceSet, lookupGeneratedAtLabel, matchedAuthorId, payload])

  const onManualDraftChange = useCallback((key: keyof ManualGrantDraft, value: string) => {
    setManualDraft((current) => ({ ...current, [key]: value }))
    setManualError('')
  }, [])

  const onAddManualGrant = useCallback(() => {
    if (!userId) {
      setManualError('User profile is still loading. Try again in a moment.')
      return
    }
    const grantTitle = normalizeNamePart(manualDraft.display_name)
    if (!grantTitle) {
      setManualError('Grant title is required.')
      return
    }
    const funderName = normalizeNamePart(manualDraft.funder_display_name)
    const awardId = normalizeNamePart(manualDraft.funder_award_id)
    const record: ManualGrantRecord = {
      id:
        typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
          ? crypto.randomUUID()
          : `${Date.now()}-${Math.round(Math.random() * 10000)}`,
      display_name: grantTitle,
      funder_display_name: funderName,
      funder_award_id: awardId,
      start_year: parseYearInput(manualDraft.start_year),
      end_year: parseYearInput(manualDraft.end_year),
      amount: parseAmountInput(manualDraft.amount),
      currency: normalizeNamePart(manualDraft.currency).toUpperCase() || 'GBP',
      notes: normalizeNamePart(manualDraft.notes),
      created_at: new Date().toISOString(),
    }
    setManualGrants((current) => [record, ...current])
    setManualDraft(DEFAULT_MANUAL_GRANT_DRAFT)
    setManualError('')
    setActiveTab('my_grants')
  }, [manualDraft, userId])

  const onRemoveManualGrant = useCallback((manualId: string) => {
    setManualGrants((current) => current.filter((item) => item.id !== manualId))
  }, [])

  const renderGrantTable = useCallback((rows: PersonaGrantPayload[], tab: GrantsTabKey) => {
    const includeReviewReason = tab === 'needs_review'
    const includeActions = tab === 'my_grants'
    return (
      <div className="w-full overflow-visible">
        <div
          className="house-table-shell house-publications-trend-table-shell-plain h-auto w-full overflow-hidden rounded-md bg-background"
          style={{ overflowX: 'auto', overflowY: 'visible', maxWidth: '100%' }}
        >
          <table className="w-full border-collapse" data-house-no-column-resize="true" data-house-no-column-controls="true">
            <thead className="house-table-head">
              <tr>
                <th className="house-table-head-text h-10 px-2 text-left align-middle font-semibold whitespace-nowrap">Grant</th>
                <th className="house-table-head-text h-10 px-2 text-left align-middle font-semibold whitespace-nowrap">Funder</th>
                <th className="house-table-head-text h-10 px-2 text-left align-middle font-semibold whitespace-nowrap">Award ID</th>
                <th className="house-table-head-text h-10 px-2 text-left align-middle font-semibold whitespace-nowrap">Period</th>
                <th className="house-table-head-text h-10 px-2 text-left align-middle font-semibold whitespace-nowrap">Owner</th>
                <th className="house-table-head-text h-10 px-2 text-left align-middle font-semibold whitespace-nowrap">Source</th>
                <th className="house-table-head-text h-10 px-2 text-left align-middle font-semibold whitespace-nowrap">Confidence</th>
                {includeReviewReason ? (
                  <th className="house-table-head-text h-10 px-2 text-left align-middle font-semibold whitespace-nowrap">Needs review</th>
                ) : null}
                <th className="house-table-head-text h-10 px-2 text-right align-middle font-semibold whitespace-nowrap">Amount</th>
                <th className="house-table-head-text h-10 px-2 text-right align-middle font-semibold whitespace-nowrap">Works</th>
                {includeActions ? (
                  <th className="house-table-head-text h-10 px-2 text-left align-middle font-semibold whitespace-nowrap">Action</th>
                ) : null}
              </tr>
            </thead>
            <tbody>
              {rows.length ? rows.map((item, index) => {
                const confidence = confidenceForGrant(item)
                const isManual = String(item.source || '').trim().toLowerCase() === 'manual'
                const manualId = String(item.openalex_award_id || '').startsWith('manual:')
                  ? String(item.openalex_award_id || '').replace('manual:', '')
                  : ''
                return (
                  <tr key={rowKey(item, index)} className="house-table-row">
                    <td className="house-table-cell-text px-2 py-2 align-top">
                      <div className="font-medium">{item.display_name || 'Untitled grant'}</div>
                      {item.description ? (
                        <p className="mt-1 max-w-[36rem] text-xs text-[hsl(var(--muted-foreground))]">
                          {item.description}
                        </p>
                      ) : null}
                    </td>
                    <td className="house-table-cell-text px-2 py-2 align-top">
                      <div>{item.funder.display_name || '-'}</div>
                      {item.funder.id ? (
                        <div className="mt-1 text-xs text-[hsl(var(--muted-foreground))]">{item.funder.id}</div>
                      ) : null}
                    </td>
                    <td className="house-table-cell-text px-2 py-2 align-top whitespace-nowrap">{item.funder_award_id || '-'}</td>
                    <td className="house-table-cell-text px-2 py-2 align-top whitespace-nowrap">{formatAwardPeriod(item)}</td>
                    <td className="house-table-cell-text px-2 py-2 align-top">
                      <div className="font-medium text-[hsl(var(--foreground))]">{item.grant_owner_name || (isManual ? 'Added manually' : 'Unknown')}</div>
                      <div className="mt-1 text-xs text-[hsl(var(--muted-foreground))]">
                        {item.person_role
                          ? `Matched role: ${item.person_role}`
                          : item.grant_owner_role
                            ? item.grant_owner_role.replace(/_/g, ' ')
                            : 'Role not provided'}
                      </div>
                    </td>
                    <td className="house-table-cell-text px-2 py-2 align-top">
                      <div className="font-medium">{sourceLabel(item.source)}</div>
                      <div className="mt-1 text-xs text-[hsl(var(--muted-foreground))]">
                        Snapshot: {formatSourceTimestamp(item.source_timestamp)}
                      </div>
                    </td>
                    <td className="house-table-cell-text px-2 py-2 align-top whitespace-nowrap">
                      <Badge variant={confidence.variant}>{confidence.label}</Badge>
                    </td>
                    {includeReviewReason ? (
                      <td className="house-table-cell-text px-2 py-2 align-top text-[hsl(var(--muted-foreground))]">{reviewReason(item)}</td>
                    ) : null}
                    <td className="house-table-cell-text px-2 py-2 text-right align-top whitespace-nowrap">{formatMoney(item.amount, item.currency)}</td>
                    <td className="house-table-cell-text px-2 py-2 text-right align-top whitespace-nowrap">{item.supporting_works_count || 0}</td>
                    {includeActions ? (
                      <td className="house-table-cell-text px-2 py-2 align-top">
                        {isManual && manualId ? (
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={() => onRemoveManualGrant(manualId)}
                            disabled={lookupBusy}
                            className="h-8 px-2 text-xs"
                          >
                            <Trash2 className="mr-1 h-3.5 w-3.5" />
                            Remove
                          </Button>
                        ) : (
                          <span className="text-xs text-[hsl(var(--muted-foreground))]">-</span>
                        )}
                      </td>
                    ) : null}
                  </tr>
                )
              }) : (
                <tr>
                  <td
                    colSpan={includeReviewReason ? (includeActions ? 11 : 10) : (includeActions ? 10 : 9)}
                    className="house-table-cell-text px-3 py-4 text-center text-[hsl(var(--muted-foreground))]"
                  >
                    No rows for current filters.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    )
  }, [lookupBusy, onRemoveManualGrant])

  return (
    <PageFrame tone="profile" hideScaffoldHeader>
      <Stack data-house-role="page" space="sm">
        <Row align="center" gap="md" wrap={false} className="house-page-title-row">
          <SectionMarker tone={getSectionMarkerTone('profile')} size="title" className="self-stretch h-auto" />
          <PageHeader
            heading="Grants"
            description="Unified grants workspace across profile-linked lookup, publication-linked grants, and manual entries."
            className="!ml-0 !mt-0"
          />
        </Row>

        <Section className={cn(HOUSE_SECTION_ANCHOR_CLASS)} surface="transparent" inset="none" spaceY="none">
          <SectionHeader heading="Researcher & sync" className="house-section-header-marker-aligned" />
          <div className="house-separator-main-heading-to-content space-y-3">
            <div className="grid gap-3 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)]">
              <div className="rounded-md border p-3">
                <div className="flex items-center gap-2 text-sm font-semibold text-[hsl(var(--foreground))]">
                  <UserRound className="h-4 w-4" />
                  Researcher identity
                </div>
                <div className="mt-3 grid gap-2 sm:grid-cols-2">
                  <div className="rounded-md border bg-[hsl(var(--tone-neutral-50))] px-3 py-2">
                    <p className="text-xs uppercase tracking-[0.08em] text-[hsl(var(--tone-neutral-500))]">Profile name</p>
                    <p className="mt-1 text-sm font-medium text-[hsl(var(--tone-neutral-900))]">{profileName || '-'}</p>
                  </div>
                  <div className="rounded-md border bg-[hsl(var(--tone-neutral-50))] px-3 py-2">
                    <p className="text-xs uppercase tracking-[0.08em] text-[hsl(var(--tone-neutral-500))]">OpenAlex author ID</p>
                    <p className="mt-1 text-sm font-medium text-[hsl(var(--tone-neutral-900))]">{matchedAuthorId || '-'}</p>
                  </div>
                  <div className="rounded-md border bg-[hsl(var(--tone-neutral-50))] px-3 py-2 sm:col-span-2">
                    <p className="text-xs uppercase tracking-[0.08em] text-[hsl(var(--tone-neutral-500))]">Matched author for grants lookup</p>
                    <p className="mt-1 text-sm font-medium text-[hsl(var(--tone-neutral-900))]">{matchedAuthorLabel || 'No matched author yet'}</p>
                  </div>
                </div>
                <p className="mt-3 text-xs text-[hsl(var(--muted-foreground))]">
                  Grants lookup runs against the resolved researcher name. Future provider connectors (UKRI/NIH/NSF/CORDIS) can enrich ownership directly from grant systems.
                </p>
              </div>

              <div className="rounded-md border p-3">
                <p className="text-sm font-semibold text-[hsl(var(--foreground))]">Lookup query</p>
                <div className="mt-3 grid gap-3 md:grid-cols-2">
                  <label data-house-role="field-group" className="space-y-1">
                    <span data-house-role="field-label" className="text-label font-medium text-[hsl(var(--foreground))]">First name</span>
                    <Input
                      value={firstName}
                      onChange={(event) => setFirstName(event.target.value)}
                      placeholder="First name"
                      disabled={lookupBusy || initialising}
                    />
                  </label>
                  <label data-house-role="field-group" className="space-y-1">
                    <span data-house-role="field-label" className="text-label font-medium text-[hsl(var(--foreground))]">Last name</span>
                    <Input
                      value={lastName}
                      onChange={(event) => setLastName(event.target.value)}
                      placeholder="Last name"
                      disabled={lookupBusy || initialising}
                    />
                  </label>
                </div>
                <div className="mt-3 flex flex-wrap gap-2">
                  <Button
                    type="button"
                    variant="housePrimary"
                    disabled={!canLookup || lookupBusy || initialising}
                    onClick={() => void runLookup()}
                  >
                    {lookupBusy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Search className="mr-2 h-4 w-4" />}
                    {lookupBusy ? 'Loading grants...' : 'Load grants'}
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    disabled={!canLookup || lookupBusy || initialising}
                    onClick={() => void runLookup({ refresh: true })}
                  >
                    {lookupBusy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-2 h-4 w-4" />}
                    {lookupBusy ? 'Refreshing...' : 'Refresh all sources'}
                  </Button>
                </div>
                {error ? (
                  <p className="mt-3 rounded-md border border-[hsl(var(--tone-danger-200))] bg-[hsl(var(--tone-danger-50))] px-3 py-2 text-sm text-[hsl(var(--tone-danger-700))]">
                    {error}
                  </p>
                ) : null}
                {lookupError ? (
                  <p className="mt-3 rounded-md border border-[hsl(var(--tone-warning-200))] bg-[hsl(var(--tone-warning-50))] px-3 py-2 text-sm text-[hsl(var(--tone-warning-800))]">
                    {lookupError}
                  </p>
                ) : null}
              </div>
            </div>
          </div>
        </Section>

        <Section className={cn(HOUSE_SECTION_ANCHOR_CLASS)} surface="transparent" inset="none" spaceY="none">
          <SectionHeader heading="Grant data providers" className="house-section-header-marker-aligned" />
          <div className="house-separator-main-heading-to-content">
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
              {providerCards.map((provider) => {
                const badge = providerStatusBadge(provider.status)
                return (
                  <div key={provider.key} className="rounded-md border p-3">
                    <div className="flex items-start justify-between gap-2">
                      <div className="space-y-1">
                        <p className="text-sm font-semibold text-[hsl(var(--tone-neutral-900))]">{provider.label}</p>
                        <p className="text-xs text-[hsl(var(--tone-neutral-600))]">{provider.meta}</p>
                      </div>
                      <span className={cn('inline-flex rounded-full border px-2 py-0.5 text-xs font-medium', badge.className)}>
                        {badge.label}
                      </span>
                    </div>
                    <p className="mt-2 text-xs text-[hsl(var(--tone-neutral-600))]">{provider.detail}</p>
                  </div>
                )
              })}
            </div>
          </div>
        </Section>

        <Section className={cn(HOUSE_SECTION_ANCHOR_CLASS)} surface="transparent" inset="none" spaceY="none">
          <SectionHeader heading="Grant workspace" className="house-section-header-marker-aligned" />
          <div className="house-separator-main-heading-to-content space-y-4">
            <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
              <div className="rounded-md border bg-card px-3 py-2.5">
                <p className="text-xs uppercase tracking-[0.08em] text-[hsl(var(--tone-neutral-500))]">My grants</p>
                <p className="mt-1 text-2xl font-semibold text-[hsl(var(--tone-neutral-900))]">{myGrantsRaw.length.toLocaleString('en-GB')}</p>
              </div>
              <div className="rounded-md border bg-card px-3 py-2.5">
                <p className="text-xs uppercase tracking-[0.08em] text-[hsl(var(--tone-neutral-500))]">Publications under grants</p>
                <p className="mt-1 text-2xl font-semibold text-[hsl(var(--tone-neutral-900))]">{publicationsWorkTotal.toLocaleString('en-GB')}</p>
              </div>
              <div className="rounded-md border bg-card px-3 py-2.5">
                <p className="text-xs uppercase tracking-[0.08em] text-[hsl(var(--tone-neutral-500))]">Identified funding</p>
                <p className="mt-1 text-2xl font-semibold text-[hsl(var(--tone-neutral-900))]">{formatMoney(myGrantTotalFunding, 'GBP')}</p>
              </div>
              <div className="rounded-md border bg-card px-3 py-2.5">
                <p className="text-xs uppercase tracking-[0.08em] text-[hsl(var(--tone-neutral-500))]">Needs review</p>
                <p className="mt-1 text-2xl font-semibold text-[hsl(var(--tone-neutral-900))]">{needsReviewRaw.length.toLocaleString('en-GB')}</p>
              </div>
            </div>

            <div className="rounded-md border p-3">
              <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-center">
                <label className="space-y-1">
                  <span className="text-label font-medium text-[hsl(var(--foreground))]">Global search</span>
                  <Input
                    value={globalSearchQuery}
                    onChange={(event) => setGlobalSearchQuery(event.target.value)}
                    placeholder="Search title, funder, award ID, owner, source..."
                    disabled={initialising || lookupBusy}
                  />
                </label>
                <div className="rounded-md border border-dashed px-3 py-2 text-xs text-[hsl(var(--muted-foreground))]">
                  Last completed lookup snapshot: {payload ? lookupGeneratedAtLabel : 'none'}
                </div>
              </div>
              <div className="mt-3 flex flex-wrap gap-2">
                {sourceOptions.map((source) => (
                  <Button
                    key={source}
                    type="button"
                    variant={activeSourceFilter === source ? 'housePrimary' : 'outline'}
                    size="sm"
                    onClick={() => setActiveSourceFilter(source)}
                    disabled={initialising || lookupBusy}
                  >
                    <Database className="mr-1.5 h-3.5 w-3.5" />
                    {source === 'all' ? 'All sources' : sourceLabel(source)}
                  </Button>
                ))}
              </div>
            </div>

            <Tabs value={activeTab} onValueChange={(value) => setActiveTab(value as GrantsTabKey)}>
              <TabsList className="h-auto w-full justify-start gap-1 overflow-x-auto rounded-md border p-1">
                <TabsTrigger value="my_grants">My grants ({myGrantsRaw.length})</TabsTrigger>
                <TabsTrigger value="publications_under_grants">
                  Publications under grants ({publicationsUnderGrantsRaw.length})
                </TabsTrigger>
                <TabsTrigger value="needs_review">Needs review ({needsReviewRaw.length})</TabsTrigger>
              </TabsList>

              <TabsContent value="my_grants" className="space-y-3">
                <div className="rounded-md border p-3">
                  <div className="flex items-center gap-2 text-sm font-semibold text-[hsl(var(--foreground))]">
                    <Plus className="h-4 w-4" />
                    Add manual grant
                  </div>
                  <p className="mt-1 text-xs text-[hsl(var(--muted-foreground))]">
                    Manual entries are saved per user in local browser storage and merged into My grants.
                  </p>
                  <div className="mt-3 grid gap-2 md:grid-cols-2 xl:grid-cols-6">
                    <label className="space-y-1 xl:col-span-2">
                      <span className="text-label font-medium">Grant title</span>
                      <Input
                        value={manualDraft.display_name}
                        onChange={(event) => onManualDraftChange('display_name', event.target.value)}
                        placeholder="Grant title"
                      />
                    </label>
                    <label className="space-y-1">
                      <span className="text-label font-medium">Funder</span>
                      <Input
                        value={manualDraft.funder_display_name}
                        onChange={(event) => onManualDraftChange('funder_display_name', event.target.value)}
                        placeholder="Funder"
                      />
                    </label>
                    <label className="space-y-1">
                      <span className="text-label font-medium">Award ID</span>
                      <Input
                        value={manualDraft.funder_award_id}
                        onChange={(event) => onManualDraftChange('funder_award_id', event.target.value)}
                        placeholder="Award ID"
                      />
                    </label>
                    <label className="space-y-1">
                      <span className="text-label font-medium">Start year</span>
                      <Input
                        value={manualDraft.start_year}
                        onChange={(event) => onManualDraftChange('start_year', event.target.value)}
                        placeholder="YYYY"
                      />
                    </label>
                    <label className="space-y-1">
                      <span className="text-label font-medium">End year</span>
                      <Input
                        value={manualDraft.end_year}
                        onChange={(event) => onManualDraftChange('end_year', event.target.value)}
                        placeholder="YYYY"
                      />
                    </label>
                    <label className="space-y-1">
                      <span className="text-label font-medium">Amount</span>
                      <Input
                        value={manualDraft.amount}
                        onChange={(event) => onManualDraftChange('amount', event.target.value)}
                        placeholder="e.g. 250000"
                      />
                    </label>
                    <label className="space-y-1">
                      <span className="text-label font-medium">Currency</span>
                      <Input
                        value={manualDraft.currency}
                        onChange={(event) => onManualDraftChange('currency', event.target.value)}
                        placeholder="GBP"
                      />
                    </label>
                    <label className="space-y-1 md:col-span-2 xl:col-span-2">
                      <span className="text-label font-medium">Notes</span>
                      <Input
                        value={manualDraft.notes}
                        onChange={(event) => onManualDraftChange('notes', event.target.value)}
                        placeholder="Optional notes"
                      />
                    </label>
                  </div>
                  <div className="mt-3 flex flex-wrap items-center gap-2">
                    <Button type="button" variant="housePrimary" onClick={onAddManualGrant} disabled={initialising}>
                      <Plus className="mr-2 h-4 w-4" />
                      Add to My grants
                    </Button>
                    {manualError ? (
                      <span className="text-sm text-[hsl(var(--tone-danger-700))]">{manualError}</span>
                    ) : null}
                  </div>
                </div>

                {initialising || lookupBusy ? (
                  <div className="rounded-md border px-3 py-5 text-sm text-[hsl(var(--muted-foreground))]">
                    {initialising ? 'Loading profile details...' : 'Looking up grants...'}
                  </div>
                ) : (
                  renderGrantTable(myGrants, 'my_grants')
                )}
              </TabsContent>

              <TabsContent value="publications_under_grants" className="space-y-3">
                <div className="rounded-md border border-[hsl(var(--tone-neutral-200))] bg-[hsl(var(--tone-neutral-50))] px-3 py-2 text-sm text-[hsl(var(--tone-neutral-700))]">
                  Rows in this tab represent grants attached to publications where ownership is someone else or not fully attributable to you.
                </div>
                {initialising || lookupBusy ? (
                  <div className="rounded-md border px-3 py-5 text-sm text-[hsl(var(--muted-foreground))]">
                    {initialising ? 'Loading profile details...' : 'Looking up grants...'}
                  </div>
                ) : (
                  renderGrantTable(publicationsUnderGrants, 'publications_under_grants')
                )}
              </TabsContent>

              <TabsContent value="needs_review" className="space-y-3">
                <div className="rounded-md border border-[hsl(var(--tone-warning-200))] bg-[hsl(var(--tone-warning-50))] px-3 py-2 text-sm text-[hsl(var(--tone-warning-900))]">
                  <div className="flex items-center gap-2 font-medium">
                    <AlertTriangle className="h-4 w-4" />
                    Review queue
                  </div>
                  <p className="mt-1 text-xs text-[hsl(var(--tone-warning-800))]">
                    These rows need confirmation before they should be treated as definitive ownership data.
                  </p>
                </div>
                {initialising || lookupBusy ? (
                  <div className="rounded-md border px-3 py-5 text-sm text-[hsl(var(--muted-foreground))]">
                    {initialising ? 'Loading profile details...' : 'Looking up grants...'}
                  </div>
                ) : (
                  renderGrantTable(needsReview, 'needs_review')
                )}
              </TabsContent>
            </Tabs>

            <div className="rounded-md border bg-[hsl(var(--tone-neutral-50))] px-3 py-2 text-xs text-[hsl(var(--tone-neutral-700))]">
              <div className="flex flex-wrap items-center gap-4">
                <span className="inline-flex items-center gap-1">
                  <CheckCircle2 className="h-3.5 w-3.5 text-[hsl(var(--tone-positive-700))]" />
                  High confidence: grant directly won by matched person.
                </span>
                <span className="inline-flex items-center gap-1">
                  <Clock3 className="h-3.5 w-3.5 text-[hsl(var(--tone-warning-700))]" />
                  Medium confidence: publication linked to grant won by another named holder.
                </span>
                <span className="inline-flex items-center gap-1">
                  <AlertTriangle className="h-3.5 w-3.5 text-[hsl(var(--tone-danger-700))]" />
                  Low confidence: owner not known or key metadata incomplete.
                </span>
              </div>
            </div>
          </div>
        </Section>
      </Stack>
    </PageFrame>
  )
}
