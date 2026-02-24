import { useEffect, useMemo, useRef, useState } from 'react'
import { Loader2 } from 'lucide-react'
import { useNavigate } from 'react-router-dom'

import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { clearAuthSessionToken, getAuthSessionToken } from '@/lib/auth-session'
import { fetchMe, fetchOrcidStatus, updateMe } from '@/lib/impact-api'
import type { AuthUser, OrcidStatusPayload } from '@/types/impact'

type PersonalDetailsDraft = {
  salutation: string
  firstName: string
  lastName: string
  organisation: string
  department: string
  country: string
  website: string
  researchGateUrl: string
  xHandle: string
  publicationAffiliations: string[]
}

type StoredPersonalDetails = PersonalDetailsDraft & {
  updatedAt: string | null
}

type ProfileBadge = {
  id: string
  label: string
  tone: 'neutral' | 'accent' | 'positive' | 'gold'
  detail: string
}

type AffiliationSuggestionItem = {
  name: string
  label: string
  countryCode: string | null
  source: 'openalex'
}

export type ProfilePersonalDetailsPageFixture = {
  token?: string
  user?: AuthUser | null
  orcidStatus?: OrcidStatusPayload | null
  personalDetails?: Partial<PersonalDetailsDraft>
  status?: string
  error?: string
  loading?: boolean
}

type ProfilePersonalDetailsPageProps = {
  fixture?: ProfilePersonalDetailsPageFixture
}
type PersonalDetailsStringField = Exclude<keyof PersonalDetailsDraft, 'publicationAffiliations'>

const INTEGRATIONS_USER_CACHE_KEY = 'aawe_integrations_user_cache'
const INTEGRATIONS_ORCID_STATUS_CACHE_KEY = 'aawe_integrations_orcid_status_cache'
const PERSONAL_DETAILS_STORAGE_PREFIX = 'aawe_profile_personal_details:'

const FOUNDING_MEMBER_USER_IDS = new Set<string>([])
const FOUNDING_MEMBER_EMAILS = new Set<string>(['researcher@axiomos.studio'])
const FOUNDING_MEMBER_ORCID_IDS = new Set<string>(['0000-0002-8537-0806'])
const SALUTATION_OPTIONS = ['Dr', 'Prof', 'Mr', 'Ms', 'Mrs', 'Mx'] as const
const MAX_PUBLICATION_AFFILIATIONS = 12

function formatTimestamp(value: string | null | undefined): string {
  if (!value) {
    return 'Not available'
  }
  const parsed = Date.parse(value)
  if (Number.isNaN(parsed)) {
    return 'Not available'
  }
  return new Date(parsed).toLocaleString('en-GB', {
    year: 'numeric',
    month: 'short',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function formatDate(value: string | null | undefined): string {
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

function trimValue(value: string | null | undefined): string {
  return (value || '').trim()
}

function sanitizeAffiliation(value: string | null | undefined): string {
  return trimValue(value).replace(/\s+/g, ' ')
}

function normalizeAffiliations(values: unknown): string[] {
  const source = Array.isArray(values) ? values : []
  const seen = new Set<string>()
  const output: string[] = []
  for (const raw of source) {
    const clean = sanitizeAffiliation(raw)
    if (!clean) {
      continue
    }
    const key = clean.toLowerCase()
    if (seen.has(key)) {
      continue
    }
    seen.add(key)
    output.push(clean)
    if (output.length >= MAX_PUBLICATION_AFFILIATIONS) {
      break
    }
  }
  return output
}

function isGeneratedOAuthEmail(value: string | null | undefined): boolean {
  const clean = trimValue(value).toLowerCase()
  return clean.endsWith('@orcid.local') || clean.endsWith('@oauth.local')
}

function isFoundingMemberProfile(input: {
  user: AuthUser | null
  orcidId: string | null | undefined
}): boolean {
  const userId = trimValue(input.user?.id)
  const email = trimValue(input.user?.email).toLowerCase()
  const orcidId = trimValue(input.orcidId)

  return (
    Boolean(userId && FOUNDING_MEMBER_USER_IDS.has(userId)) ||
    Boolean(email && FOUNDING_MEMBER_EMAILS.has(email)) ||
    Boolean(orcidId && FOUNDING_MEMBER_ORCID_IDS.has(orcidId))
  )
}
function splitName(value: string | null | undefined): { firstName: string; lastName: string } {
  const clean = trimValue(value)
  if (!clean) {
    return { firstName: '', lastName: '' }
  }
  const parts = clean.split(/\s+/).filter(Boolean)
  if (parts.length === 1) {
    return { firstName: parts[0], lastName: '' }
  }
  return {
    firstName: parts[0],
    lastName: parts.slice(1).join(' '),
  }
}

function sanitizeDraft(value: Partial<PersonalDetailsDraft> | null | undefined): PersonalDetailsDraft {
  return {
    salutation: trimValue(value?.salutation),
    firstName: trimValue(value?.firstName),
    lastName: trimValue(value?.lastName),
    organisation: trimValue(value?.organisation),
    department: trimValue(value?.department),
    country: trimValue(value?.country),
    website: trimValue(value?.website),
    researchGateUrl: trimValue(value?.researchGateUrl),
    xHandle: trimValue(value?.xHandle),
    publicationAffiliations: normalizeAffiliations(value?.publicationAffiliations),
  }
}

function personalDetailsStorageKey(userId: string): string {
  return `${PERSONAL_DETAILS_STORAGE_PREFIX}${userId}`
}

function loadStoredPersonalDetails(userId: string): StoredPersonalDetails | null {
  if (typeof window === 'undefined') {
    return null
  }
  const raw = window.localStorage.getItem(personalDetailsStorageKey(userId))
  if (!raw) {
    return null
  }
  try {
    const parsed = JSON.parse(raw) as Partial<StoredPersonalDetails>
    return {
      ...sanitizeDraft(parsed),
      updatedAt: trimValue(parsed.updatedAt) || null,
    }
  } catch {
    return null
  }
}

function saveStoredPersonalDetails(userId: string, payload: StoredPersonalDetails): void {
  if (typeof window === 'undefined') {
    return
  }
  window.localStorage.setItem(personalDetailsStorageKey(userId), JSON.stringify(payload))
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

function draftFromSources(
  user: AuthUser | null,
  stored: StoredPersonalDetails | null,
  orcidLinked: boolean,
): PersonalDetailsDraft {
  const split = splitName(user?.name)
  const seededFirstName =
    orcidLinked && !trimValue(stored?.firstName)
      ? split.firstName
      : stored?.firstName || split.firstName
  const seededLastName =
    orcidLinked && !trimValue(stored?.lastName)
      ? split.lastName
      : stored?.lastName || split.lastName
  return sanitizeDraft({
    salutation: stored?.salutation || '',
    firstName: seededFirstName,
    lastName: seededLastName,
    organisation: stored?.organisation || '',
    department: stored?.department || '',
    country: stored?.country || '',
    website: stored?.website || '',
    researchGateUrl: stored?.researchGateUrl || '',
    xHandle: stored?.xHandle || '',
    publicationAffiliations: stored?.publicationAffiliations || [],
  })
}

function accountAgeInMonths(createdAt: string | null | undefined): number {
  if (!createdAt) {
    return 0
  }
  const createdMs = Date.parse(createdAt)
  if (Number.isNaN(createdMs)) {
    return 0
  }
  const created = new Date(createdMs)
  const now = new Date()
  let months = (now.getFullYear() - created.getFullYear()) * 12 + (now.getMonth() - created.getMonth())
  if (now.getDate() < created.getDate()) {
    months -= 1
  }
  return Math.max(0, months)
}

function formatAccountAge(createdAt: string | null | undefined): string {
  if (!createdAt) {
    return 'Not available'
  }
  const clampedMonths = accountAgeInMonths(createdAt)
  const years = Math.floor(clampedMonths / 12)
  const remainingMonths = clampedMonths % 12
  if (years > 0 && remainingMonths > 0) {
    return `${years}y ${remainingMonths}m`
  }
  if (years > 0) {
    return `${years}y`
  }
  return `${remainingMonths}m`
}

function buildProfileBadges(input: {
  orcidLinked: boolean
  isFoundingMember: boolean
  draft: PersonalDetailsDraft
}): ProfileBadge[] {
  const badges: ProfileBadge[] = []

  if (input.orcidLinked) {
    badges.push({
      id: 'orcid-linked',
      label: 'ORCID linked',
      tone: 'positive',
      detail: 'Research identity verified via ORCID',
    })
  }

  if (input.isFoundingMember) {
    badges.push({
      id: 'founding-member',
      label: 'Founding member',
      tone: 'gold',
      detail: 'Founding member of Axiomos',
    })
  }

  if (input.draft.organisation && input.draft.firstName && input.draft.lastName) {
    badges.push({
      id: 'profile-complete',
      label: 'Profile complete',
      tone: 'accent',
      detail: 'Core identity fields are filled in',
    })
  }

  if (badges.length === 0) {
    badges.push({
      id: 'new-member',
      label: 'New member',
      tone: 'neutral',
      detail: 'Complete your profile to unlock badges',
    })
  }

  return badges
}

function badgeToneClass(tone: ProfileBadge['tone']): string {
  if (tone === 'positive') {
    return 'border-[hsl(var(--tone-positive-200))] bg-[hsl(var(--tone-positive-50))] text-[hsl(var(--tone-positive-700))]'
  }
  if (tone === 'accent') {
    return 'border-[hsl(var(--tone-accent-200))] bg-[hsl(var(--tone-accent-50))] text-[hsl(var(--tone-accent-800))]'
  }
  if (tone === 'gold') {
    return 'border-[hsl(var(--tone-warning-300))] bg-[hsl(var(--tone-warning-100))] text-[hsl(var(--tone-warning-900))]'
  }
  return 'border-[hsl(var(--tone-neutral-200))] bg-[hsl(var(--tone-neutral-100))] text-[hsl(var(--tone-neutral-700))]'
}

function renderValue(value: string | null | undefined): string {
  const clean = trimValue(value)
  return clean || 'Not available'
}

async function fetchAffiliationSuggestionsOpenAlex(input: {
  query: string
  limit?: number
}): Promise<AffiliationSuggestionItem[]> {
  const cleanQuery = sanitizeAffiliation(input.query)
  if (cleanQuery.length < 2) {
    return []
  }
  const cleanLimit = Math.max(1, Math.min(8, Number(input.limit || 8)))
  const params = new URLSearchParams({
    search: cleanQuery,
    'per-page': String(cleanLimit),
  })
  const response = await fetch(`https://api.openalex.org/institutions?${params.toString()}`)
  if (!response.ok) {
    throw new Error(`Affiliation suggestions failed (${response.status})`)
  }
  const payload = (await response.json()) as { results?: Array<Record<string, unknown>> }
  const seen = new Set<string>()
  const output: AffiliationSuggestionItem[] = []
  for (const raw of payload.results || []) {
    const name = sanitizeAffiliation(String(raw.display_name || ''))
    if (!name) {
      continue
    }
    const countryCode = sanitizeAffiliation(String(raw.country_code || '')).toUpperCase() || null
    const dedupeKey = `${name.toLowerCase()}|${countryCode || ''}`
    if (seen.has(dedupeKey)) {
      continue
    }
    seen.add(dedupeKey)
    output.push({
      name,
      label: countryCode ? `${name} (${countryCode})` : name,
      countryCode,
      source: 'openalex',
    })
    if (output.length >= cleanLimit) {
      break
    }
  }
  return output
}

export function ProfilePersonalDetailsPage({ fixture }: ProfilePersonalDetailsPageProps = {}) {
  const navigate = useNavigate()
  const isFixtureMode = Boolean(fixture)
  const initialCachedUser = fixture?.user ?? loadCachedUser()
  const initialCachedOrcidStatus = fixture?.orcidStatus ?? loadCachedOrcidStatus()
  const initialStoredDetails = initialCachedUser?.id
    ? loadStoredPersonalDetails(initialCachedUser.id)
    : null
  const initialOrcidLinked = Boolean(initialCachedOrcidStatus?.linked || initialCachedUser?.orcid_id)
  const initialDraft = sanitizeDraft({
    ...draftFromSources(initialCachedUser, initialStoredDetails, initialOrcidLinked),
    ...(fixture?.personalDetails || {}),
  })
  const initialAccountEmail = trimValue(initialCachedUser?.email)

  const [token, setToken] = useState(() => fixture?.token ?? getAuthSessionToken())
  const [user, setUser] = useState<AuthUser | null>(initialCachedUser)
  const [orcidStatus, setOrcidStatus] = useState<OrcidStatusPayload | null>(initialCachedOrcidStatus)
  const [draft, setDraft] = useState<PersonalDetailsDraft>(initialDraft)
  const [accountEmail, setAccountEmail] = useState(initialAccountEmail)
  const [affiliationInput, setAffiliationInput] = useState('')
  const [affiliationSuggestions, setAffiliationSuggestions] = useState<AffiliationSuggestionItem[]>([])
  const [affiliationSuggestionsLoading, setAffiliationSuggestionsLoading] = useState(false)
  const [affiliationSuggestionsError, setAffiliationSuggestionsError] = useState('')
  const [loading, setLoading] = useState(Boolean(fixture?.loading ?? !fixture))
  const [saving, setSaving] = useState(false)
  const [status, setStatus] = useState(fixture?.status ?? '')
  const [error, setError] = useState(fixture?.error ?? '')
  const [lastSavedAt, setLastSavedAt] = useState<string | null>(initialStoredDetails?.updatedAt ?? null)
  const draftEditedRef = useRef(false)
  const emailEditedRef = useRef(false)

  useEffect(() => {
    if (!isFixtureMode) {
      return
    }
    const fixtureUser = fixture?.user ?? null
    const stored = fixtureUser?.id ? loadStoredPersonalDetails(fixtureUser.id) : null
    const fixtureOrcidLinked = Boolean(fixture?.orcidStatus?.linked || fixtureUser?.orcid_id)
    setToken(fixture?.token ?? 'storybook-session-token')
    setUser(fixtureUser)
    setOrcidStatus(fixture?.orcidStatus ?? null)
    setDraft(
      sanitizeDraft({
        ...draftFromSources(fixtureUser, stored, fixtureOrcidLinked),
        ...(fixture?.personalDetails || {}),
      }),
    )
    setAccountEmail(trimValue(fixtureUser?.email))
    setAffiliationInput('')
    setAffiliationSuggestions([])
    setAffiliationSuggestionsLoading(false)
    setAffiliationSuggestionsError('')
    setLoading(Boolean(fixture?.loading))
    setStatus(fixture?.status ?? '')
    setError(fixture?.error ?? '')
    setLastSavedAt(stored?.updatedAt ?? null)
    draftEditedRef.current = false
    emailEditedRef.current = false
  }, [fixture, isFixtureMode])

  useEffect(() => {
    if (isFixtureMode) {
      return
    }
    const sessionToken = getAuthSessionToken()
    if (!sessionToken) {
      navigate('/auth', { replace: true })
      return
    }

    setToken(sessionToken)

    const load = async () => {
      setLoading(true)
      setError('')
      try {
        const settled = await Promise.allSettled([fetchMe(sessionToken), fetchOrcidStatus(sessionToken)])
        const [meResult, orcidResult] = settled

        if (meResult.status === 'rejected') {
          throw meResult.reason
        }

        const nextUser = meResult.value
        setUser(nextUser)
        saveCachedUser(nextUser)
        if (!emailEditedRef.current) {
          setAccountEmail(trimValue(nextUser.email))
        }

        const linkedFromSource =
          (orcidResult.status === 'fulfilled' && Boolean(orcidResult.value.linked)) ||
          Boolean(nextUser.orcid_id)
        const stored = loadStoredPersonalDetails(nextUser.id)
        const resolvedDraft = draftFromSources(nextUser, stored, linkedFromSource)
        const shouldPersistOrcidSeed =
          linkedFromSource &&
          (
            trimValue(resolvedDraft.firstName) !== trimValue(stored?.firstName) ||
            trimValue(resolvedDraft.lastName) !== trimValue(stored?.lastName)
          )

        if (shouldPersistOrcidSeed) {
          const seededAt = stored?.updatedAt || new Date().toISOString()
          saveStoredPersonalDetails(nextUser.id, {
            ...resolvedDraft,
            updatedAt: seededAt,
          })
          setLastSavedAt(seededAt)
        } else {
          setLastSavedAt(stored?.updatedAt ?? null)
        }

        if (!draftEditedRef.current) {
          setDraft(resolvedDraft)
        }

        if (orcidResult.status === 'fulfilled') {
          setOrcidStatus(orcidResult.value)
          saveCachedOrcidStatus(orcidResult.value)
        }
      } catch (loadError) {
        const message = loadError instanceof Error ? loadError.message : 'Could not load personal details.'
        if (message.toLowerCase().includes('session')) {
          clearAuthSessionToken()
          navigate('/auth', { replace: true })
          return
        }
        setError(message)
      } finally {
        setLoading(false)
      }
    }

    void load()
  }, [isFixtureMode, navigate])

  useEffect(() => {
    if (isFixtureMode) {
      return
    }
    const query = sanitizeAffiliation(affiliationInput)
    if (query.length < 2) {
      setAffiliationSuggestions([])
      setAffiliationSuggestionsLoading(false)
      setAffiliationSuggestionsError('')
      return
    }

    let cancelled = false
    setAffiliationSuggestionsLoading(true)
    setAffiliationSuggestionsError('')
    const timer = window.setTimeout(() => {
      void fetchAffiliationSuggestionsOpenAlex({ query, limit: 8 })
        .then((items) => {
          if (cancelled) {
            return
          }
          const existing = new Set(draft.publicationAffiliations.map((item) => item.toLowerCase()))
          setAffiliationSuggestions(
            items.filter((item) => !existing.has(item.name.toLowerCase())),
          )
        })
        .catch((lookupError) => {
          if (cancelled) {
            return
          }
          const message =
            lookupError instanceof Error
              ? lookupError.message
              : 'Could not load affiliation suggestions.'
          setAffiliationSuggestions([])
          setAffiliationSuggestionsError(message)
        })
        .finally(() => {
          if (!cancelled) {
            setAffiliationSuggestionsLoading(false)
          }
        })
    }, 280)

    return () => {
      cancelled = true
      window.clearTimeout(timer)
    }
  }, [affiliationInput, draft.publicationAffiliations, isFixtureMode])

  const orcidId = trimValue(orcidStatus?.orcid_id || user?.orcid_id)
  const orcidLinked = Boolean(orcidStatus?.linked || user?.orcid_id)
  const foundingMemberProfile = isFoundingMemberProfile({ user, orcidId })
  const usesGeneratedOAuthEmail = isGeneratedOAuthEmail(accountEmail || user?.email)

  const badges = useMemo(
    () =>
      buildProfileBadges({
        orcidLinked,
        isFoundingMember: foundingMemberProfile,
        draft,
      }),
    [draft, foundingMemberProfile, orcidLinked],
  )

  const onFieldChange = (field: PersonalDetailsStringField, value: string) => {
    draftEditedRef.current = true
    setDraft((current) => ({
      ...current,
      [field]: value,
    }))
  }

  const onAccountEmailChange = (value: string) => {
    emailEditedRef.current = true
    setAccountEmail(value)
  }

  const onAddAffiliation = (value: string) => {
    const clean = sanitizeAffiliation(value)
    if (!clean) {
      return
    }
    draftEditedRef.current = true
    setDraft((current) => ({
      ...current,
      publicationAffiliations: normalizeAffiliations([...current.publicationAffiliations, clean]),
    }))
    setAffiliationInput('')
    setAffiliationSuggestions([])
    setAffiliationSuggestionsError('')
  }

  const onRemoveAffiliation = (value: string) => {
    draftEditedRef.current = true
    setDraft((current) => ({
      ...current,
      publicationAffiliations: current.publicationAffiliations.filter(
        (item) => item.toLowerCase() !== value.toLowerCase(),
      ),
    }))
  }

  const onResetFromProfile = () => {
    if (!user) {
      return
    }
    const stored = loadStoredPersonalDetails(user.id)
    setDraft(draftFromSources(user, stored, orcidLinked))
    setAccountEmail(trimValue(user.email))
    setAffiliationInput('')
    setAffiliationSuggestions([])
    setAffiliationSuggestionsLoading(false)
    setAffiliationSuggestionsError('')
    setLastSavedAt(stored?.updatedAt ?? null)
    setStatus('')
    setError('')
    draftEditedRef.current = false
    emailEditedRef.current = false
  }

  const onSave = async () => {
    if (!user) {
      setError('No active account profile found.')
      return
    }
    if (!token) {
      setError('Sign in again to save personal details.')
      return
    }

    const cleanDraft = sanitizeDraft(draft)
    const fullName = [cleanDraft.firstName, cleanDraft.lastName].filter(Boolean).join(' ').trim()
    const cleanEmail = trimValue(accountEmail).toLowerCase()
    if (!cleanEmail) {
      setError('Account email is required.')
      return
    }

    setSaving(true)
    setStatus('')
    setError('')

    try {
      let nextUser = user
      const updatePayload: { name?: string; email?: string } = {}
      if (fullName && fullName !== trimValue(user.name)) {
        updatePayload.name = fullName
      }
      if (cleanEmail && cleanEmail !== trimValue(user.email).toLowerCase()) {
        updatePayload.email = cleanEmail
      }
      if (Object.keys(updatePayload).length > 0) {
        nextUser = await updateMe(token, updatePayload)
        setUser(nextUser)
        saveCachedUser(nextUser)
      }

      const savedAt = new Date().toISOString()
      saveStoredPersonalDetails(nextUser.id, {
        ...cleanDraft,
        updatedAt: savedAt,
      })
      setDraft(cleanDraft)
      setAccountEmail(trimValue(nextUser.email))
      setLastSavedAt(savedAt)
      setStatus(
        updatePayload.email
          ? 'Personal details saved. Verify your updated email address to keep account access fully enabled.'
          : 'Personal details saved.',
      )
      draftEditedRef.current = false
      emailEditedRef.current = false
    } catch (saveError) {
      const message = saveError instanceof Error ? saveError.message : 'Could not save personal details.'
      if (message.toLowerCase().includes('session')) {
        clearAuthSessionToken()
        navigate('/auth', { replace: true })
        return
      }
      setError(message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <section className="space-y-4">
      <header className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">Personal details</h1>
        <p className="text-sm text-[hsl(var(--tone-neutral-600))]">
          Editable account identity fields used across profile workflows.
        </p>
      </header>

      <Card className="border-[hsl(var(--tone-neutral-200))]">
        <CardHeader className="space-y-2 border-b border-[hsl(var(--tone-neutral-200))] pb-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <CardTitle className="text-base font-semibold tracking-tight text-[hsl(var(--tone-neutral-900))]">
              Profile identity
            </CardTitle>
            <span
              className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium ${
                orcidLinked
                  ? 'border-[hsl(var(--tone-positive-200))] bg-[hsl(var(--tone-positive-50))] text-[hsl(var(--tone-positive-700))]'
                  : 'border-[hsl(var(--tone-neutral-200))] bg-[hsl(var(--tone-neutral-100))] text-[hsl(var(--tone-neutral-700))]'
              }`}
            >
              {orcidLinked ? 'ORCID linked' : 'ORCID not linked'}
            </span>
          </div>
        </CardHeader>
        <CardContent className="space-y-3 pt-3 text-sm">
          <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_280px]">
            <div className="space-y-3">
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="space-y-1 sm:col-span-2">
                  <span className="text-caption uppercase tracking-[0.08em] text-[hsl(var(--tone-neutral-500))]">Account email</span>
                  <Input
                    value={accountEmail}
                    onChange={(event) => onAccountEmailChange(event.target.value)}
                    placeholder="you@institution.edu"
                    autoComplete="email"
                    disabled={saving}
                  />
                  {usesGeneratedOAuthEmail ? (
                    <p className="text-micro text-[hsl(var(--tone-warning-700))]">
                      Replace the temporary ORCID sign-in email with your real email account.
                    </p>
                  ) : null}
                </label>

                <div className="grid gap-3 sm:col-span-2 sm:grid-cols-[140px_minmax(0,1fr)_minmax(0,1fr)]">
                  <label className="space-y-1">
                    <span className="text-caption uppercase tracking-[0.08em] text-[hsl(var(--tone-neutral-500))]">Salutation</span>
                    <select
                      value={draft.salutation}
                      onChange={(event) => onFieldChange('salutation', event.target.value)}
                      className="h-9 w-full rounded-md border border-border bg-background px-3 py-1 text-sm text-foreground shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
                      autoComplete="honorific-prefix"
                    >
                      <option value="">Select</option>
                      {SALUTATION_OPTIONS.map((option) => (
                        <option key={option} value={option}>
                          {option}
                        </option>
                      ))}
                    </select>
                  </label>

                  <label className="space-y-1">
                    <span className="text-caption uppercase tracking-[0.08em] text-[hsl(var(--tone-neutral-500))]">First name</span>
                    <Input
                      value={draft.firstName}
                      onChange={(event) => onFieldChange('firstName', event.target.value)}
                      placeholder="First name"
                      autoComplete="given-name"
                    />
                  </label>

                  <label className="space-y-1">
                    <span className="text-caption uppercase tracking-[0.08em] text-[hsl(var(--tone-neutral-500))]">Last name</span>
                    <Input
                      value={draft.lastName}
                      onChange={(event) => onFieldChange('lastName', event.target.value)}
                      placeholder="Last name"
                      autoComplete="family-name"
                    />
                  </label>
                </div>

                <label className="space-y-1 sm:col-span-2">
                  <span className="text-caption uppercase tracking-[0.08em] text-[hsl(var(--tone-neutral-500))]">Organisation</span>
                  <Input
                    value={draft.organisation}
                    onChange={(event) => onFieldChange('organisation', event.target.value)}
                    placeholder="Organisation"
                    autoComplete="organization"
                  />
                </label>

                <label className="space-y-1">
                  <span className="text-caption uppercase tracking-[0.08em] text-[hsl(var(--tone-neutral-500))]">Department</span>
                  <Input
                    value={draft.department}
                    onChange={(event) => onFieldChange('department', event.target.value)}
                    placeholder="Department"
                    autoComplete="organization-title"
                  />
                </label>

                <label className="space-y-1">
                  <span className="text-caption uppercase tracking-[0.08em] text-[hsl(var(--tone-neutral-500))]">Country</span>
                  <Input
                    value={draft.country}
                    onChange={(event) => onFieldChange('country', event.target.value)}
                    placeholder="Country"
                    autoComplete="country-name"
                  />
                </label>

                <div className="space-y-1 sm:col-span-2">
                  <span className="text-caption uppercase tracking-[0.08em] text-[hsl(var(--tone-neutral-500))]">Publication affiliations</span>
                  <div className="flex flex-wrap items-center gap-2">
                    <Input
                      value={affiliationInput}
                      onChange={(event) => setAffiliationInput(event.target.value)}
                      onKeyDown={(event) => {
                        if (event.key === 'Enter') {
                          event.preventDefault()
                          onAddAffiliation(affiliationInput)
                        }
                      }}
                      placeholder="Start typing an institution"
                      autoComplete="organization"
                    />
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => onAddAffiliation(affiliationInput)}
                      disabled={
                        !sanitizeAffiliation(affiliationInput) ||
                        draft.publicationAffiliations.length >= MAX_PUBLICATION_AFFILIATIONS
                      }
                    >
                      Add
                    </Button>
                  </div>
                  {affiliationSuggestionsLoading ? (
                    <p className="text-micro text-[hsl(var(--tone-neutral-500))]">Looking up affiliations...</p>
                  ) : null}
                  {affiliationSuggestions.length > 0 ? (
                    <div className="flex flex-wrap gap-1.5 rounded-md border border-[hsl(var(--tone-neutral-200))] bg-card p-2">
                      {affiliationSuggestions.map((suggestion) => (
                        <button
                          key={`${suggestion.source}:${suggestion.name}:${suggestion.countryCode || ''}`}
                          type="button"
                          onClick={() => onAddAffiliation(suggestion.name)}
                          className="rounded-full border border-[hsl(var(--tone-neutral-200))] bg-[hsl(var(--tone-neutral-50))] px-2 py-0.5 text-xs text-[hsl(var(--tone-neutral-700))] transition-colors hover:border-[hsl(var(--tone-accent-300))] hover:text-[hsl(var(--tone-accent-800))]"
                          title={suggestion.label}
                        >
                          {suggestion.label}
                        </button>
                      ))}
                    </div>
                  ) : null}
                  {draft.publicationAffiliations.length > 0 ? (
                    <div className="flex flex-wrap gap-1.5">
                      {draft.publicationAffiliations.map((item) => (
                        <span
                          key={item}
                          className="inline-flex items-center gap-1 rounded-full border border-[hsl(var(--tone-neutral-200))] bg-[hsl(var(--tone-neutral-50))] px-2 py-0.5 text-xs text-[hsl(var(--tone-neutral-700))]"
                        >
                          {item}
                          <button
                            type="button"
                            onClick={() => onRemoveAffiliation(item)}
                            className="text-[hsl(var(--tone-neutral-500))] transition-colors hover:text-[hsl(var(--tone-danger-700))]"
                            aria-label={`Remove ${item}`}
                          >
                            x
                          </button>
                        </span>
                      ))}
                    </div>
                  ) : (
                    <p className="text-micro text-[hsl(var(--tone-neutral-500))]">
                      No affiliations saved yet.
                    </p>
                  )}
                  {affiliationSuggestionsError ? (
                    <p className="text-micro text-[hsl(var(--tone-warning-700))]">{affiliationSuggestionsError}</p>
                  ) : (
                    <p className="text-micro text-[hsl(var(--tone-neutral-500))]">
                      Uses OpenAlex institution suggestions while you type.
                    </p>
                  )}
                </div>

                <label className="space-y-1 sm:col-span-2">
                  <span className="text-caption uppercase tracking-[0.08em] text-[hsl(var(--tone-neutral-500))]">Website</span>
                  <Input
                    value={draft.website}
                    onChange={(event) => onFieldChange('website', event.target.value)}
                    placeholder="https://"
                    autoComplete="url"
                  />
                </label>

                <label className="space-y-1 sm:col-span-2">
                  <span className="text-caption uppercase tracking-[0.08em] text-[hsl(var(--tone-neutral-500))]">ResearchGate page</span>
                  <Input
                    value={draft.researchGateUrl}
                    onChange={(event) => onFieldChange('researchGateUrl', event.target.value)}
                    placeholder="https://www.researchgate.net/profile/..."
                    autoComplete="url"
                  />
                </label>

                <label className="space-y-1 sm:col-span-2">
                  <span className="text-caption uppercase tracking-[0.08em] text-[hsl(var(--tone-neutral-500))]">Twitter/X handle</span>
                  <Input
                    value={draft.xHandle}
                    onChange={(event) => onFieldChange('xHandle', event.target.value)}
                    placeholder="@yourhandle"
                    autoComplete="nickname"
                  />
                </label>
              </div>
            </div>

            <aside className="space-y-2">
              <div className="rounded-md border border-[hsl(var(--tone-neutral-200))] bg-card px-3 py-2.5">
                <p className="text-caption uppercase tracking-[0.08em] text-[hsl(var(--tone-neutral-500))]">Account</p>
                <div className="mt-2 space-y-1.5 text-sm">
                  <p className="text-[hsl(var(--tone-neutral-700))]">
                    Email: <span className="font-medium text-[hsl(var(--tone-neutral-900))]">{renderValue(user?.email)}</span>
                  </p>
                  <p className="text-[hsl(var(--tone-neutral-700))]">
                    Member since: <span className="font-medium text-[hsl(var(--tone-neutral-900))]">{formatDate(user?.created_at)}</span>
                  </p>
                  <p className="text-[hsl(var(--tone-neutral-700))]">
                    Account age: <span className="font-medium text-[hsl(var(--tone-neutral-900))]">{formatAccountAge(user?.created_at)}</span>
                  </p>
                  <p className="text-[hsl(var(--tone-neutral-700))]">
                    ORCID iD: <span className="font-medium text-[hsl(var(--tone-neutral-900))]">{renderValue(orcidId)}</span>
                  </p>
                </div>
                {orcidId ? (
                  <a
                    href={`https://orcid.org/${orcidId}`}
                    target="_blank"
                    rel="noreferrer"
                    className="mt-2 inline-flex text-label font-medium text-[hsl(var(--tone-accent-700))] underline underline-offset-2"
                  >
                    Open ORCID profile
                  </a>
                ) : null}
                <div className="mt-2">
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={() => navigate('/profile/manage-account')}
                  >
                    Manage account
                  </Button>
                </div>
              </div>

              <div className="rounded-md border border-[hsl(var(--tone-neutral-200))] bg-card px-3 py-2.5">
                <p className="text-caption uppercase tracking-[0.08em] text-[hsl(var(--tone-neutral-500))]">Badges</p>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {badges.map((badge) => (
                    <span
                      key={badge.id}
                      className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium ${badgeToneClass(badge.tone)}`}
                      title={badge.detail}
                    >
                      {badge.label}
                    </span>
                  ))}
                </div>
                <p className="mt-2 text-micro uppercase tracking-[0.08em] text-[hsl(var(--tone-neutral-500))]">
                  Badge rules are plumbed and ready for status policy.
                </p>
              </div>
            </aside>
          </div>

          <div className="flex flex-wrap items-center gap-2 border-t border-[hsl(var(--tone-neutral-200))] pt-3">
            <Button type="button" onClick={() => void onSave()} disabled={!user || saving || loading}>
              {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              {saving ? 'Saving...' : 'Save details'}
            </Button>
            <Button type="button" variant="outline" onClick={onResetFromProfile} disabled={!user || saving}>
              Reset fields
            </Button>
            {lastSavedAt ? (
              <p className="text-xs text-[hsl(var(--tone-neutral-500))]">Last saved {formatTimestamp(lastSavedAt)}</p>
            ) : null}
          </div>

          {status ? (
            <div className="rounded-md border border-[hsl(var(--tone-positive-200))] bg-[hsl(var(--tone-positive-50))] px-3 py-2 text-sm text-[hsl(var(--tone-positive-700))]">
              {status}
            </div>
          ) : null}

          {error ? (
            <div className="rounded-md border border-[hsl(var(--tone-danger-200))] bg-[hsl(var(--tone-danger-50))] px-3 py-2 text-sm text-[hsl(var(--tone-danger-700))]">
              {error}
            </div>
          ) : null}

          {loading ? <p className="text-xs text-[hsl(var(--tone-neutral-500))]">Loading personal details...</p> : null}
        </CardContent>
      </Card>
    </section>
  )
}
