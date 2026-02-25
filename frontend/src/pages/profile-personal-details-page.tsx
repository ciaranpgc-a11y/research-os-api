import { useEffect, useMemo, useRef, useState, type ChangeEvent } from 'react'
import { GripVertical, Loader2, Plus, Trash2, Upload } from 'lucide-react'
import { useNavigate } from 'react-router-dom'

import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { clearAuthSessionToken, getAuthSessionToken } from '@/lib/auth-session'
import {
  fetchAffiliationAddressForMe,
  fetchAffiliationSuggestionsForMe,
  fetchMe,
  fetchOrcidStatus,
  updateMe,
} from '@/lib/impact-api'
import type {
  AffiliationAddressResolutionPayload,
  AffiliationSuggestionItemPayload,
  AuthUser,
  OrcidStatusPayload,
} from '@/types/impact'

type PersonalDetailsDraft = {
  salutation: string
  firstName: string
  lastName: string
  jobRole: string
  jobRoles: string[]
  organisation: string
  affiliations: string[]
  affiliationAddress: string
  affiliationCity: string
  affiliationRegion: string
  affiliationPostalCode: string
  department: string
  country: string
  website: string
  researchGateUrl: string
  xHandle: string
  profilePhotoDataUrl: string
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
  countryName: string | null
  city: string | null
  region: string | null
  address: string | null
  postalCode: string | null
  source: 'openalex' | 'ror'
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
type PersonalDetailsStringField = Exclude<
  keyof PersonalDetailsDraft,
  'jobRoles' | 'affiliations' | 'publicationAffiliations'
>

type AffiliationMetadataItem = {
  address: string
  city: string
  region: string
  postalCode: string
  country: string
}

const INTEGRATIONS_USER_CACHE_KEY = 'aawe_integrations_user_cache'
const INTEGRATIONS_ORCID_STATUS_CACHE_KEY = 'aawe_integrations_orcid_status_cache'
const PERSONAL_DETAILS_STORAGE_PREFIX = 'aawe_profile_personal_details:'

const FOUNDING_MEMBER_USER_IDS = new Set<string>([])
const FOUNDING_MEMBER_EMAILS = new Set<string>(['researcher@axiomos.studio'])
const FOUNDING_MEMBER_ORCID_IDS = new Set<string>(['0000-0002-8537-0806'])
const SALUTATION_OPTIONS = [
  'Dr',
  'Professor',
  'Mr',
  'Ms',
  'Mrs',
  'Miss',
  'Mx',
  'Sir',
  'Dame',
  'Lord',
  'Lady',
  'Rev',
  'Hon',
] as const
const MAX_JOB_ROLES = 8
const MAX_PUBLICATION_AFFILIATIONS = 12
const MAX_PROFILE_PHOTO_BYTES = 2 * 1024 * 1024

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

function normalizeRole(value: string | null | undefined): string {
  return trimValue(value).replace(/\s+/g, ' ')
}

function toNullableAffiliationPart(value: unknown): string | null {
  const clean = sanitizeAffiliation(String(value || ''))
  return clean || null
}

function buildAffiliationSuggestionLabel(input: {
  name: string
  city?: string | null
  countryName?: string | null
  countryCode?: string | null
}): string {
  const city = toNullableAffiliationPart(input.city)
  const countryName = toNullableAffiliationPart(input.countryName)
  const countryCode = toNullableAffiliationPart(input.countryCode)
  const location = [city, countryName].filter(Boolean).join(', ')
  if (location) {
    return `${input.name} (${location})`
  }
  if (countryCode) {
    return `${input.name} (${countryCode.toUpperCase()})`
  }
  return input.name
}

function mapAffiliationSuggestionItem(
  raw: AffiliationSuggestionItemPayload,
): AffiliationSuggestionItem | null {
  const name = sanitizeAffiliation(raw.name)
  if (!name) {
    return null
  }
  const countryCode = sanitizeAffiliation(raw.country_code).toUpperCase() || null
  const countryName = toNullableAffiliationPart(raw.country_name)
  const city = toNullableAffiliationPart(raw.city)
  const region = toNullableAffiliationPart(raw.region)
  const address = toNullableAffiliationPart(raw.address)
  const postalCode = toNullableAffiliationPart(raw.postal_code)
  const label = sanitizeAffiliation(raw.label) || buildAffiliationSuggestionLabel({
    name,
    city,
    countryName,
    countryCode,
  })
  return {
    name,
    label,
    countryCode,
    countryName,
    city,
    region,
    address,
    postalCode,
    source: raw.source === 'ror' ? 'ror' : 'openalex',
  }
}

function mapAffiliationAddressResolution(
  raw: AffiliationAddressResolutionPayload,
): AffiliationMetadataItem | null {
  if (!raw.resolved) {
    return null
  }
  const line1 = sanitizeAffiliation(raw.line_1)
  const city = sanitizeAffiliation(raw.city)
  const region = sanitizeAffiliation(raw.region)
  const postalCode = sanitizeAffiliation(raw.postal_code)
  const country = sanitizeAffiliation(raw.country_name)
  const address = line1
  if (!address && !city && !region && !postalCode && !country) {
    return null
  }
  return {
    address: sanitizeAffiliation(address),
    city,
    region,
    postalCode,
    country,
  }
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
  const rawJobRole = normalizeRole(value?.jobRole)
  const rawOrganisation = sanitizeAffiliation(value?.organisation)
  const jobRoles = normalizeJobRoles((value as { jobRoles?: unknown } | null | undefined)?.jobRoles)
  const affiliations = normalizeAffiliations((value as { affiliations?: unknown } | null | undefined)?.affiliations)
  const effectiveJobRoles = jobRoles.length > 0
    ? jobRoles
    : rawJobRole
      ? [rawJobRole]
      : []
  const effectiveAffiliations = affiliations.length > 0
    ? affiliations
    : rawOrganisation
      ? [rawOrganisation]
      : []
  return {
    salutation: trimValue(value?.salutation),
    firstName: trimValue(value?.firstName),
    lastName: trimValue(value?.lastName),
    jobRole: rawJobRole || effectiveJobRoles[0] || '',
    jobRoles: effectiveJobRoles,
    organisation: rawOrganisation || effectiveAffiliations[0] || '',
    affiliations: effectiveAffiliations,
    affiliationAddress: trimValue(value?.affiliationAddress),
    affiliationCity: trimValue(value?.affiliationCity),
    affiliationRegion: trimValue(value?.affiliationRegion),
    affiliationPostalCode: trimValue(value?.affiliationPostalCode),
    department: trimValue(value?.department),
    country: trimValue(value?.country),
    website: trimValue(value?.website),
    researchGateUrl: trimValue(value?.researchGateUrl),
    xHandle: trimValue(value?.xHandle),
    profilePhotoDataUrl: trimValue((value as { profilePhotoDataUrl?: string } | null | undefined)?.profilePhotoDataUrl),
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
  const split = looksLikeOrcidPlaceholderName(user?.name) ? { firstName: '', lastName: '' } : splitName(user?.name)
  const storedFirstName = looksLikeOrcidPlaceholderName(stored?.firstName) ? '' : trimValue(stored?.firstName)
  const storedLastName = looksLikeOrcidPlaceholderName(stored?.lastName) ? '' : trimValue(stored?.lastName)
  const seededFirstName =
    orcidLinked
      ? storedFirstName
      : storedFirstName || split.firstName
  const seededLastName =
    orcidLinked
      ? storedLastName
      : storedLastName || split.lastName
  return sanitizeDraft({
    salutation: stored?.salutation || '',
    firstName: seededFirstName,
    lastName: seededLastName,
    jobRole: stored?.jobRole || '',
    jobRoles: stored?.jobRoles || [],
    organisation: stored?.organisation || '',
    affiliations: stored?.affiliations || [],
    affiliationAddress: stored?.affiliationAddress || '',
    affiliationCity: stored?.affiliationCity || '',
    affiliationRegion: stored?.affiliationRegion || '',
    affiliationPostalCode: stored?.affiliationPostalCode || '',
    department: stored?.department || '',
    country: stored?.country || '',
    website: stored?.website || '',
    researchGateUrl: stored?.researchGateUrl || '',
    xHandle: stored?.xHandle || '',
    profilePhotoDataUrl: stored?.profilePhotoDataUrl || '',
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

  if ((input.draft.organisation || input.draft.affiliations[0]) && input.draft.firstName && input.draft.lastName) {
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

async function fetchAffiliationSuggestions(input: {
  token: string
  query: string
  limit?: number
}): Promise<AffiliationSuggestionItem[]> {
  const cleanQuery = sanitizeAffiliation(input.query)
  if (cleanQuery.length < 2) {
    return []
  }
  const cleanToken = trimValue(input.token)
  if (!cleanToken) {
    return []
  }
  const cleanLimit = Math.max(1, Math.min(8, Number(input.limit || 8)))
  const payload = await fetchAffiliationSuggestionsForMe(cleanToken, {
    query: cleanQuery,
    limit: cleanLimit,
  })
  const seen = new Set<string>()
  const output: AffiliationSuggestionItem[] = []
  for (const raw of payload.items || []) {
    const mapped = mapAffiliationSuggestionItem(raw)
    if (!mapped) {
      continue
    }
    const key = `${mapped.name.toLowerCase()}|${sanitizeAffiliation(mapped.countryCode || mapped.countryName || '').toLowerCase()}`
    if (seen.has(key)) {
      continue
    }
    seen.add(key)
    output.push(mapped)
    if (output.length >= cleanLimit) {
      break
    }
  }
  return output
}

function normalizeJobRoles(values: unknown): string[] {
  const source = Array.isArray(values) ? values : []
  const seen = new Set<string>()
  const output: string[] = []
  for (const raw of source) {
    const clean = normalizeRole(String(raw || ''))
    if (!clean) {
      continue
    }
    const key = clean.toLowerCase()
    if (seen.has(key)) {
      continue
    }
    seen.add(key)
    output.push(clean)
    if (output.length >= MAX_JOB_ROLES) {
      break
    }
  }
  return output
}

function buildProfileInitials(input: {
  firstName?: string | null
  lastName?: string | null
  fallbackName?: string | null
}): string {
  const first = trimValue(input.firstName)
  const last = trimValue(input.lastName)
  if (first || last) {
    const initials = `${first ? first[0] : ''}${last ? last[0] : ''}`.trim()
    return initials ? initials.toUpperCase() : 'U'
  }
  const fallbackParts = trimValue(input.fallbackName).split(/\s+/).filter(Boolean)
  if (fallbackParts.length >= 2) {
    return `${fallbackParts[0][0] || ''}${fallbackParts[1][0] || ''}`.toUpperCase() || 'U'
  }
  if (fallbackParts.length === 1) {
    return (fallbackParts[0][0] || 'U').toUpperCase()
  }
  return 'U'
}

function looksLikeOrcidPlaceholderName(value: string | null | undefined): boolean {
  const clean = trimValue(value)
  if (!clean) {
    return false
  }
  return /^orcid\b/i.test(clean) || /\b\d{4}-\d{4}-\d{4}-[\dX]{4}\b/i.test(clean)
}

function resolveEditableAccountEmail(input: {
  email: string | null | undefined
  orcidLinked: boolean
}): string {
  const clean = trimValue(input.email)
  if (!clean) {
    return ''
  }
  if (input.orcidLinked && isGeneratedOAuthEmail(clean)) {
    return ''
  }
  return clean
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
  const initialAccountEmail = resolveEditableAccountEmail({
    email: initialCachedUser?.email,
    orcidLinked: initialOrcidLinked,
  })

  const [token, setToken] = useState(() => fixture?.token ?? getAuthSessionToken())
  const [user, setUser] = useState<AuthUser | null>(initialCachedUser)
  const [orcidStatus, setOrcidStatus] = useState<OrcidStatusPayload | null>(initialCachedOrcidStatus)
  const [draft, setDraft] = useState<PersonalDetailsDraft>(initialDraft)
  const [accountEmail, setAccountEmail] = useState(initialAccountEmail)
  const [jobRoleInput, setJobRoleInput] = useState('')
  const [primaryAffiliationInput, setPrimaryAffiliationInput] = useState(() => sanitizeAffiliation(initialDraft.organisation))
  const [primaryAffiliationSuggestions, setPrimaryAffiliationSuggestions] = useState<AffiliationSuggestionItem[]>([])
  const [primaryAffiliationSuggestionsLoading, setPrimaryAffiliationSuggestionsLoading] = useState(false)
  const [primaryAffiliationSuggestionsError, setPrimaryAffiliationSuggestionsError] = useState('')
  const [publicationAffiliationInput, setPublicationAffiliationInput] = useState('')
  const [publicationAffiliationSuggestions, setPublicationAffiliationSuggestions] = useState<AffiliationSuggestionItem[]>([])
  const [publicationAffiliationSuggestionsLoading, setPublicationAffiliationSuggestionsLoading] = useState(false)
  const [publicationAffiliationSuggestionsError, setPublicationAffiliationSuggestionsError] = useState('')
  const [affiliationMetadataByName, setAffiliationMetadataByName] = useState<Record<string, AffiliationMetadataItem>>({})
  const [affiliationEditorOpen, setAffiliationEditorOpen] = useState(
    () => !Boolean(initialDraft.jobRoles[0] || initialDraft.affiliations[0] || initialDraft.country),
  )
  const [showPublicationAffiliationComposer, setShowPublicationAffiliationComposer] = useState(false)
  const [draggingPublicationAffiliationIndex, setDraggingPublicationAffiliationIndex] = useState<number | null>(null)
  const [primaryAffiliationAddressResolving, setPrimaryAffiliationAddressResolving] = useState(false)
  const [primaryAffiliationAddressError, setPrimaryAffiliationAddressError] = useState('')
  const [loading, setLoading] = useState(Boolean(fixture?.loading ?? !fixture))
  const [saving, setSaving] = useState(false)
  const [status, setStatus] = useState(fixture?.status ?? '')
  const [error, setError] = useState(fixture?.error ?? '')
  const [lastSavedAt, setLastSavedAt] = useState<string | null>(initialStoredDetails?.updatedAt ?? null)
  const draftEditedRef = useRef(false)
  const emailEditedRef = useRef(false)
  const primaryAddressLookupSequenceRef = useRef(0)
  const lastResolvedPrimaryAffiliationKeyRef = useRef('')
  const profilePhotoInputRef = useRef<HTMLInputElement | null>(null)

  useEffect(() => {
    if (!isFixtureMode) {
      return
    }
    const fixtureUser = fixture?.user ?? null
    const stored = fixtureUser?.id ? loadStoredPersonalDetails(fixtureUser.id) : null
    const fixtureOrcidLinked = Boolean(fixture?.orcidStatus?.linked || fixtureUser?.orcid_id)
    const fixtureDraft = sanitizeDraft({
      ...draftFromSources(fixtureUser, stored, fixtureOrcidLinked),
      ...(fixture?.personalDetails || {}),
    })
    setToken(fixture?.token ?? 'storybook-session-token')
    setUser(fixtureUser)
    setOrcidStatus(fixture?.orcidStatus ?? null)
    setDraft(fixtureDraft)
    setPrimaryAffiliationInput(sanitizeAffiliation(fixtureDraft.organisation))
    setJobRoleInput('')
    setAffiliationEditorOpen(!Boolean(fixtureDraft.jobRoles[0] || fixtureDraft.affiliations[0] || fixtureDraft.country))
    setAccountEmail(resolveEditableAccountEmail({
      email: fixtureUser?.email,
      orcidLinked: fixtureOrcidLinked,
    }))
    setPrimaryAffiliationSuggestions([])
    setPrimaryAffiliationSuggestionsLoading(false)
    setPrimaryAffiliationSuggestionsError('')
    setPublicationAffiliationInput('')
    setPublicationAffiliationSuggestions([])
    setPublicationAffiliationSuggestionsLoading(false)
    setPublicationAffiliationSuggestionsError('')
    setAffiliationMetadataByName({})
    setShowPublicationAffiliationComposer(false)
    setDraggingPublicationAffiliationIndex(null)
    setPrimaryAffiliationAddressResolving(false)
    setPrimaryAffiliationAddressError('')
    setLoading(Boolean(fixture?.loading))
    setStatus(fixture?.status ?? '')
    setError(fixture?.error ?? '')
    setLastSavedAt(stored?.updatedAt ?? null)
    draftEditedRef.current = false
    emailEditedRef.current = false
    primaryAddressLookupSequenceRef.current = 0
    lastResolvedPrimaryAffiliationKeyRef.current = ''
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
        const linkedFromSource =
          (orcidResult.status === 'fulfilled' && Boolean(orcidResult.value.linked)) ||
          Boolean(nextUser.orcid_id)
        if (!emailEditedRef.current) {
          setAccountEmail(resolveEditableAccountEmail({
            email: nextUser.email,
            orcidLinked: linkedFromSource,
          }))
        }
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
          setPrimaryAffiliationInput(sanitizeAffiliation(resolvedDraft.organisation))
          setAffiliationEditorOpen(!Boolean(resolvedDraft.jobRoles[0] || resolvedDraft.affiliations[0] || resolvedDraft.country))
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
    const query = sanitizeAffiliation(primaryAffiliationInput)
    if (query.length < 2) {
      setPrimaryAffiliationSuggestions([])
      setPrimaryAffiliationSuggestionsLoading(false)
      setPrimaryAffiliationSuggestionsError('')
      return
    }

    let cancelled = false
    setPrimaryAffiliationSuggestionsLoading(true)
    setPrimaryAffiliationSuggestionsError('')
    const timer = window.setTimeout(() => {
      void fetchAffiliationSuggestions({ token, query, limit: 8 })
        .then((items) => {
          if (cancelled) {
            return
          }
          setPrimaryAffiliationSuggestions(items)
        })
        .catch((lookupError) => {
          if (cancelled) {
            return
          }
          const message =
            lookupError instanceof Error
              ? lookupError.message
              : 'Could not load affiliation suggestions.'
          setPrimaryAffiliationSuggestions([])
          setPrimaryAffiliationSuggestionsError(message)
        })
        .finally(() => {
          if (!cancelled) {
            setPrimaryAffiliationSuggestionsLoading(false)
          }
        })
    }, 260)

    return () => {
      cancelled = true
      window.clearTimeout(timer)
    }
  }, [isFixtureMode, primaryAffiliationInput, token])

  useEffect(() => {
    if (isFixtureMode) {
      return
    }
    const query = sanitizeAffiliation(publicationAffiliationInput)
    if (query.length < 2) {
      setPublicationAffiliationSuggestions([])
      setPublicationAffiliationSuggestionsLoading(false)
      setPublicationAffiliationSuggestionsError('')
      return
    }

    let cancelled = false
    setPublicationAffiliationSuggestionsLoading(true)
    setPublicationAffiliationSuggestionsError('')
    const timer = window.setTimeout(() => {
      void fetchAffiliationSuggestions({ token, query, limit: 8 })
        .then((items) => {
          if (cancelled) {
            return
          }
          const existing = new Set(draft.publicationAffiliations.map((item) => item.toLowerCase()))
          const filtered = items.filter((item) => !existing.has(item.name.toLowerCase()))
          setPublicationAffiliationSuggestions(filtered)
        })
        .catch((lookupError) => {
          if (cancelled) {
            return
          }
          const message =
            lookupError instanceof Error
              ? lookupError.message
              : 'Could not load affiliation suggestions.'
          setPublicationAffiliationSuggestions([])
          setPublicationAffiliationSuggestionsError(message)
        })
        .finally(() => {
          if (!cancelled) {
            setPublicationAffiliationSuggestionsLoading(false)
          }
        })
    }, 260)

    return () => {
      cancelled = true
      window.clearTimeout(timer)
    }
  }, [draft.publicationAffiliations, isFixtureMode, publicationAffiliationInput, token])

  const orcidId = trimValue(orcidStatus?.orcid_id || user?.orcid_id)
  const orcidLinked = Boolean(orcidStatus?.linked || user?.orcid_id)
  const foundingMemberProfile = isFoundingMemberProfile({ user, orcidId })
  const primaryAffiliationKey = sanitizeAffiliation(draft.organisation || draft.affiliations[0] || '').toLowerCase()
  const accountSummaryEmail = resolveEditableAccountEmail({
    email: user?.email,
    orcidLinked,
  })
  const profileInitials = buildProfileInitials({
    firstName: draft.firstName,
    lastName: draft.lastName,
    fallbackName: user?.name,
  })
  const journalByline = useMemo(() => {
    const role = normalizeRole(draft.jobRoles[0] || draft.jobRole)
    const affiliation = sanitizeAffiliation(draft.affiliations[0] || draft.organisation)
    const country = trimValue(draft.country)
    return [role, affiliation, country].filter(Boolean).join(', ')
  }, [draft.affiliations, draft.country, draft.jobRole, draft.jobRoles, draft.organisation])

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

  const onProfilePhotoSelected = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file) {
      return
    }
    if (!file.type.startsWith('image/')) {
      setError('Choose an image file for profile photo.')
      return
    }
    if (file.size > MAX_PROFILE_PHOTO_BYTES) {
      setError('Choose an image under 2MB for profile photo.')
      return
    }
    const reader = new FileReader()
    reader.onload = () => {
      if (typeof reader.result !== 'string' || !reader.result) {
        return
      }
      draftEditedRef.current = true
      setDraft((current) => ({
        ...current,
        profilePhotoDataUrl: reader.result as string,
      }))
      setError('')
      setStatus('Profile photo updated. Save details to keep it.')
    }
    reader.readAsDataURL(file)
  }

  const onRemoveProfilePhoto = () => {
    draftEditedRef.current = true
    setDraft((current) => ({
      ...current,
      profilePhotoDataUrl: '',
    }))
  }

  const onAddJobRole = (value: string) => {
    const clean = normalizeRole(value)
    if (!clean) {
      return
    }
    draftEditedRef.current = true
    setDraft((current) => {
      const nextRoles = normalizeJobRoles([clean, ...current.jobRoles])
      return {
        ...current,
        jobRoles: nextRoles,
        jobRole: nextRoles[0] || clean,
      }
    })
    setJobRoleInput('')
  }

  const onRemoveJobRole = (value: string) => {
    draftEditedRef.current = true
    setDraft((current) => {
      const nextRoles = normalizeJobRoles(current.jobRoles.filter((item) => item.toLowerCase() !== value.toLowerCase()))
      return {
        ...current,
        jobRoles: nextRoles,
        jobRole: nextRoles[0] || '',
      }
    })
  }

  const onAddAffiliation = (value: string, metadata?: AffiliationMetadataItem) => {
    const clean = sanitizeAffiliation(value)
    if (!clean) {
      return
    }
    const metadataPayload = {
      address: sanitizeAffiliation(metadata?.address),
      city: sanitizeAffiliation(metadata?.city),
      region: sanitizeAffiliation(metadata?.region),
      postalCode: sanitizeAffiliation(metadata?.postalCode),
      country: sanitizeAffiliation(metadata?.country),
    }
    const metadataAvailable = Boolean(
      metadataPayload.address
      || metadataPayload.city
      || metadataPayload.region
      || metadataPayload.postalCode
      || metadataPayload.country,
    )
    const cacheKey = clean.toLowerCase()
    draftEditedRef.current = true
    setDraft((current) => {
      const nextAffiliations = normalizeAffiliations([clean, ...current.affiliations])
      return {
        ...current,
        affiliations: nextAffiliations,
        organisation: nextAffiliations[0] || clean,
        affiliationAddress: metadataAvailable ? (metadataPayload.address || current.affiliationAddress) : current.affiliationAddress,
        affiliationCity: metadataAvailable ? (metadataPayload.city || current.affiliationCity) : current.affiliationCity,
        affiliationRegion: metadataAvailable ? (metadataPayload.region || current.affiliationRegion) : current.affiliationRegion,
        affiliationPostalCode: metadataAvailable ? (metadataPayload.postalCode || current.affiliationPostalCode) : current.affiliationPostalCode,
        country: metadataAvailable ? (metadataPayload.country || current.country) : current.country,
      }
    })
    if (metadataAvailable) {
      setAffiliationMetadataByName((current) => ({
        ...current,
        [cacheKey]: {
          address: metadataPayload.address,
          city: metadataPayload.city,
          region: metadataPayload.region,
          postalCode: metadataPayload.postalCode,
          country: metadataPayload.country,
        },
      }))
    }
    setPrimaryAffiliationInput('')
    setPrimaryAffiliationSuggestions([])
    setPrimaryAffiliationSuggestionsError('')
  }

  const onRemoveAffiliationEntry = (value: string) => {
    const clean = sanitizeAffiliation(value)
    if (!clean) {
      return
    }
    draftEditedRef.current = true
    setDraft((current) => {
      const nextAffiliations = normalizeAffiliations(current.affiliations.filter((item) => item.toLowerCase() !== clean.toLowerCase()))
      const nextPrimary = nextAffiliations[0] || ''
      return {
        ...current,
        affiliations: nextAffiliations,
        organisation: nextPrimary,
      }
    })
    setAffiliationMetadataByName((current) => {
      const next = { ...current }
      delete next[clean.toLowerCase()]
      return next
    })
    if (sanitizeAffiliation(primaryAffiliationInput).toLowerCase() === clean.toLowerCase()) {
      setPrimaryAffiliationInput('')
    }
  }

  const onAddPublicationAffiliation = (value: string, metadata?: AffiliationMetadataItem) => {
    const clean = sanitizeAffiliation(value)
    if (!clean) {
      return
    }
    const metadataPayload = {
      address: sanitizeAffiliation(metadata?.address),
      city: sanitizeAffiliation(metadata?.city),
      region: sanitizeAffiliation(metadata?.region),
      postalCode: sanitizeAffiliation(metadata?.postalCode),
      country: sanitizeAffiliation(metadata?.country),
    }
    const metadataAvailable = Boolean(
      metadataPayload.address
      || metadataPayload.city
      || metadataPayload.region
      || metadataPayload.postalCode
      || metadataPayload.country,
    )
    const cacheKey = clean.toLowerCase()
    draftEditedRef.current = true
    setDraft((current) => ({
      ...current,
      publicationAffiliations: normalizeAffiliations([...current.publicationAffiliations, clean]),
      affiliations: current.affiliations.length > 0 ? current.affiliations : [clean],
      organisation: sanitizeAffiliation(current.organisation) || clean,
      affiliationAddress: sanitizeAffiliation(current.affiliationAddress) || metadataPayload.address,
      affiliationCity: sanitizeAffiliation(current.affiliationCity) || metadataPayload.city,
      affiliationRegion: sanitizeAffiliation(current.affiliationRegion) || metadataPayload.region,
      affiliationPostalCode: sanitizeAffiliation(current.affiliationPostalCode) || metadataPayload.postalCode,
      country:
        sanitizeAffiliation(current.country) ||
        (metadataAvailable ? metadataPayload.country : ''),
    }))
    if (metadataAvailable) {
      setAffiliationMetadataByName((current) => ({
        ...current,
        [cacheKey]: {
          address: metadataPayload.address,
          city: metadataPayload.city,
          region: metadataPayload.region,
          postalCode: metadataPayload.postalCode,
          country: metadataPayload.country,
        },
      }))
    }
    setPublicationAffiliationInput('')
    setPublicationAffiliationSuggestions([])
    setPublicationAffiliationSuggestionsError('')
    setShowPublicationAffiliationComposer(false)
  }

  const resolvePrimaryAffiliationAddress = async (input: {
    organisation: string
    seedMetadata?: AffiliationMetadataItem
    replaceExisting: boolean
  }) => {
    const clean = sanitizeAffiliation(input.organisation)
    if (!clean) {
      return
    }
    const cleanToken = trimValue(token)
    if (!cleanToken) {
      return
    }
    const normalizedKey = clean.toLowerCase()
    const requestId = primaryAddressLookupSequenceRef.current + 1
    primaryAddressLookupSequenceRef.current = requestId
    setPrimaryAffiliationAddressResolving(true)
    setPrimaryAffiliationAddressError('')
    try {
      const resolved = await fetchAffiliationAddressForMe(cleanToken, {
        name: clean,
        city: sanitizeAffiliation(input.seedMetadata?.city),
        region: sanitizeAffiliation(input.seedMetadata?.region),
        country: sanitizeAffiliation(input.seedMetadata?.country),
      })
      if (primaryAddressLookupSequenceRef.current !== requestId) {
        return
      }
      const resolvedMetadata = mapAffiliationAddressResolution(resolved)
      if (!resolvedMetadata) {
        return
      }
      setAffiliationMetadataByName((current) => ({
        ...current,
        [normalizedKey]: {
          ...current[normalizedKey],
          ...resolvedMetadata,
        },
      }))
      setDraft((current) => {
        if (sanitizeAffiliation(current.organisation).toLowerCase() !== normalizedKey) {
          return current
        }
        if (input.replaceExisting) {
          return {
            ...current,
            affiliationAddress: resolvedMetadata.address || current.affiliationAddress,
            affiliationCity: resolvedMetadata.city || current.affiliationCity,
            affiliationRegion: resolvedMetadata.region || current.affiliationRegion,
            affiliationPostalCode: resolvedMetadata.postalCode || current.affiliationPostalCode,
            country: resolvedMetadata.country || current.country,
          }
        }
        return {
          ...current,
          affiliationAddress: current.affiliationAddress || resolvedMetadata.address,
          affiliationCity: current.affiliationCity || resolvedMetadata.city,
          affiliationRegion: current.affiliationRegion || resolvedMetadata.region,
          affiliationPostalCode: current.affiliationPostalCode || resolvedMetadata.postalCode,
          country: current.country || resolvedMetadata.country,
        }
      })
      lastResolvedPrimaryAffiliationKeyRef.current = normalizedKey
      setPrimaryAffiliationAddressError('')
    } catch (lookupError) {
      if (primaryAddressLookupSequenceRef.current !== requestId) {
        return
      }
      const message =
        lookupError instanceof Error
          ? lookupError.message
          : 'Address lookup could not resolve more detail.'
      setPrimaryAffiliationAddressError(message)
    } finally {
      if (primaryAddressLookupSequenceRef.current === requestId) {
        setPrimaryAffiliationAddressResolving(false)
      }
    }
  }

  const onApplyPrimaryAffiliationSuggestion = async (suggestion: AffiliationSuggestionItem) => {
    const clean = sanitizeAffiliation(suggestion.name)
    if (!clean) {
      return
    }
    const metadata: AffiliationMetadataItem = {
      address: sanitizeAffiliation(suggestion.address),
      city: sanitizeAffiliation(suggestion.city),
      region: sanitizeAffiliation(suggestion.region),
      postalCode: sanitizeAffiliation(suggestion.postalCode),
      country: sanitizeAffiliation(suggestion.countryName),
    }
    const normalizedKey = clean.toLowerCase()
    draftEditedRef.current = true
    setDraft((current) => ({
      ...current,
      organisation: clean,
      affiliations: normalizeAffiliations([
        clean,
        ...current.affiliations,
      ]),
      affiliationAddress: metadata.address,
      affiliationCity: metadata.city,
      affiliationRegion: metadata.region,
      affiliationPostalCode: metadata.postalCode,
      country: metadata.country,
    }))
    setAffiliationMetadataByName((current) => ({
      ...current,
      [normalizedKey]: metadata,
    }))
    setPrimaryAffiliationInput(clean)
    setPrimaryAffiliationSuggestions([])
    setPrimaryAffiliationSuggestionsError('')
    setPrimaryAffiliationAddressError('')
    await resolvePrimaryAffiliationAddress({
      organisation: clean,
      seedMetadata: metadata,
      replaceExisting: true,
    })
  }

  const onSetPrimaryAffiliation = (value: string) => {
    const clean = sanitizeAffiliation(value)
    if (!clean) {
      return
    }
    const metadata = affiliationMetadataByName[clean.toLowerCase()]
    draftEditedRef.current = true
    setDraft((current) => ({
      ...current,
      organisation: clean,
      affiliations: normalizeAffiliations([
        clean,
        ...current.affiliations.filter((item) => item.toLowerCase() !== clean.toLowerCase()),
      ]),
      affiliationAddress: metadata ? sanitizeAffiliation(metadata.address) : current.affiliationAddress,
      affiliationCity: metadata ? sanitizeAffiliation(metadata.city) : current.affiliationCity,
      affiliationRegion: metadata ? sanitizeAffiliation(metadata.region) : current.affiliationRegion,
      affiliationPostalCode: metadata ? sanitizeAffiliation(metadata.postalCode) : current.affiliationPostalCode,
      country: metadata ? sanitizeAffiliation(metadata.country) : current.country,
    }))
    setPrimaryAffiliationInput(clean)
  }

  const onResolvePrimaryAffiliationFromCurrent = async () => {
    const organisation = sanitizeAffiliation(draft.organisation)
    if (organisation.length < 2) {
      return
    }
    const normalizedKey = organisation.toLowerCase()
    const replaceExisting = lastResolvedPrimaryAffiliationKeyRef.current !== normalizedKey
    let seedMetadata: AffiliationMetadataItem = {
      address: sanitizeAffiliation(draft.affiliationAddress),
      city: sanitizeAffiliation(draft.affiliationCity),
      region: sanitizeAffiliation(draft.affiliationRegion),
      postalCode: sanitizeAffiliation(draft.affiliationPostalCode),
      country: sanitizeAffiliation(draft.country),
    }
    const hasLocationHint = Boolean(seedMetadata.city || seedMetadata.region || seedMetadata.country)
    if (!hasLocationHint) {
      try {
        const topSuggestion = (await fetchAffiliationSuggestions({ token, query: organisation, limit: 1 }))[0]
        if (topSuggestion) {
          seedMetadata = {
            address: sanitizeAffiliation(topSuggestion.address),
            city: sanitizeAffiliation(topSuggestion.city),
            region: sanitizeAffiliation(topSuggestion.region),
            postalCode: sanitizeAffiliation(topSuggestion.postalCode),
            country: sanitizeAffiliation(topSuggestion.countryName),
          }
        }
      } catch {
        // Keep best-effort flow even when suggestion prefetch fails.
      }
    }
    await resolvePrimaryAffiliationAddress({
      organisation,
      seedMetadata,
      replaceExisting,
    })
  }

  const onDragStartPublicationAffiliation = (index: number) => {
    setDraggingPublicationAffiliationIndex(index)
  }

  const onDropPublicationAffiliation = (targetIndex: number) => {
    if (draggingPublicationAffiliationIndex === null || draggingPublicationAffiliationIndex === targetIndex) {
      setDraggingPublicationAffiliationIndex(null)
      return
    }
    draftEditedRef.current = true
    setDraft((current) => {
      const items = [...current.publicationAffiliations]
      if (
        draggingPublicationAffiliationIndex < 0
        || draggingPublicationAffiliationIndex >= items.length
        || targetIndex < 0
        || targetIndex >= items.length
      ) {
        return current
      }
      const [moved] = items.splice(draggingPublicationAffiliationIndex, 1)
      if (!moved) {
        return current
      }
      items.splice(targetIndex, 0, moved)
      return {
        ...current,
        publicationAffiliations: items,
      }
    })
    setDraggingPublicationAffiliationIndex(null)
  }

  const onRemovePublicationAffiliation = (value: string) => {
    const targetKey = sanitizeAffiliation(value).toLowerCase()
    const wasPrimary = sanitizeAffiliation(draft.organisation).toLowerCase() === targetKey
    draftEditedRef.current = true
    setDraft((current) => {
      const nextAffiliations = normalizeAffiliations(current.affiliations.filter((item) => item.toLowerCase() !== targetKey))
      return {
        ...current,
        publicationAffiliations: current.publicationAffiliations.filter(
          (item) => item.toLowerCase() !== targetKey,
        ),
        affiliations: nextAffiliations,
        organisation:
          sanitizeAffiliation(current.organisation).toLowerCase() === targetKey
            ? (nextAffiliations[0] || '')
            : current.organisation,
      }
    })
    setAffiliationMetadataByName((current) => {
      const next = { ...current }
      delete next[targetKey]
      return next
    })
    if (wasPrimary) {
      setPrimaryAffiliationInput('')
    }
  }

  const onResetFromProfile = () => {
    if (!user) {
      return
    }
    const stored = loadStoredPersonalDetails(user.id)
    const resetDraft = draftFromSources(user, stored, orcidLinked)
    setDraft(resetDraft)
    setJobRoleInput('')
    setAffiliationEditorOpen(!Boolean(resetDraft.jobRoles[0] || resetDraft.affiliations[0] || resetDraft.country))
    setPrimaryAffiliationInput(sanitizeAffiliation(resetDraft.organisation))
    setAccountEmail(resolveEditableAccountEmail({
      email: user.email,
      orcidLinked,
    }))
    setPrimaryAffiliationSuggestions([])
    setPrimaryAffiliationSuggestionsLoading(false)
    setPrimaryAffiliationSuggestionsError('')
    setPublicationAffiliationInput('')
    setPublicationAffiliationSuggestions([])
    setPublicationAffiliationSuggestionsLoading(false)
    setPublicationAffiliationSuggestionsError('')
    setAffiliationMetadataByName({})
    setShowPublicationAffiliationComposer(false)
    setDraggingPublicationAffiliationIndex(null)
    setPrimaryAffiliationAddressResolving(false)
    setPrimaryAffiliationAddressError('')
    setLastSavedAt(stored?.updatedAt ?? null)
    setStatus('')
    setError('')
    draftEditedRef.current = false
    emailEditedRef.current = false
    primaryAddressLookupSequenceRef.current += 1
    lastResolvedPrimaryAffiliationKeyRef.current = ''
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
    const existingAccountEmail = trimValue(user.email).toLowerCase()
    if (!cleanEmail && !isGeneratedOAuthEmail(existingAccountEmail)) {
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
      if (cleanEmail && cleanEmail !== existingAccountEmail) {
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
      setAccountEmail(resolveEditableAccountEmail({
        email: nextUser.email,
        orcidLinked: Boolean(orcidStatus?.linked || nextUser.orcid_id),
      }))
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
              Profile
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
                <div className="sm:col-span-2 flex items-start gap-3 rounded-md border border-[hsl(var(--tone-neutral-200))] bg-[hsl(var(--tone-neutral-50))] px-3 py-2.5">
                  {draft.profilePhotoDataUrl ? (
                    <img
                      src={draft.profilePhotoDataUrl}
                      alt="Profile photo"
                      className="h-16 w-16 rounded-full border border-[hsl(var(--tone-neutral-300))] object-cover"
                    />
                  ) : (
                    <div className="inline-flex h-16 w-16 items-center justify-center rounded-full border border-[hsl(var(--tone-neutral-300))] bg-[hsl(var(--tone-neutral-100))] text-lg font-semibold text-[hsl(var(--tone-neutral-700))]">
                      {profileInitials}
                    </div>
                  )}
                  <div className="space-y-2">
                    <p className="text-caption uppercase tracking-[0.08em] text-[hsl(var(--tone-neutral-500))]">Profile photo</p>
                    <input
                      ref={profilePhotoInputRef}
                      type="file"
                      accept="image/*"
                      className="hidden"
                      onChange={onProfilePhotoSelected}
                    />
                    <div className="flex flex-wrap items-center gap-2">
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        onClick={() => profilePhotoInputRef.current?.click()}
                      >
                        <Upload className="mr-1.5 h-4 w-4" />
                        Upload photo
                      </Button>
                      {draft.profilePhotoDataUrl ? (
                        <Button type="button" size="sm" variant="outline" onClick={onRemoveProfilePhoto}>
                          <Trash2 className="mr-1.5 h-4 w-4" />
                          Remove
                        </Button>
                      ) : null}
                    </div>
                  </div>
                </div>

                <label className="space-y-1 sm:col-span-2">
                  <span className="text-caption uppercase tracking-[0.08em] text-[hsl(var(--tone-neutral-500))]">Account email</span>
                  <Input
                    value={accountEmail}
                    onChange={(event) => onAccountEmailChange(event.target.value)}
                    placeholder="you@institution.edu"
                    autoComplete="email"
                    disabled={saving}
                  />
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
                  <span className="inline-flex items-center gap-1.5 text-caption uppercase tracking-[0.08em] text-[hsl(var(--tone-neutral-500))]">
                    <span
                      aria-hidden
                      className="inline-flex h-5 w-5 items-center justify-center rounded-sm border border-[hsl(var(--tone-neutral-300))] bg-[hsl(var(--tone-neutral-100))] text-caption font-semibold text-[hsl(var(--tone-neutral-700))]"
                    >
                      W
                    </span>
                    Website
                  </span>
                  <Input
                    value={draft.website}
                    onChange={(event) => onFieldChange('website', event.target.value)}
                    placeholder="https://"
                    autoComplete="url"
                  />
                </label>

                <label className="space-y-1 sm:col-span-2">
                  <span className="inline-flex items-center gap-1.5 text-caption uppercase tracking-[0.08em] text-[hsl(var(--tone-neutral-500))]">
                    <span
                      aria-hidden
                      className="inline-flex h-5 w-5 items-center justify-center rounded-sm border border-[hsl(var(--tone-neutral-300))] bg-[hsl(var(--tone-neutral-100))] text-[0.58rem] font-semibold text-[hsl(var(--tone-neutral-700))]"
                    >
                      RG
                    </span>
                    ResearchGate page
                  </span>
                  <Input
                    value={draft.researchGateUrl}
                    onChange={(event) => onFieldChange('researchGateUrl', event.target.value)}
                    placeholder="https://www.researchgate.net/profile/..."
                    autoComplete="url"
                  />
                </label>

                <label className="space-y-1 sm:col-span-2">
                  <span className="inline-flex items-center gap-1.5 text-caption uppercase tracking-[0.08em] text-[hsl(var(--tone-neutral-500))]">
                    <span
                      aria-hidden
                      className="inline-flex h-5 w-5 items-center justify-center rounded-sm border border-[hsl(var(--tone-neutral-300))] bg-[hsl(var(--tone-neutral-100))] text-caption font-semibold text-[hsl(var(--tone-neutral-700))]"
                    >
                      X
                    </span>
                    Twitter/X handle
                  </span>
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
                    Email: <span className="font-medium text-[hsl(var(--tone-neutral-900))]">{renderValue(accountSummaryEmail)}</span>
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
              </div>
            </aside>
          </div>

        </CardContent>
      </Card>

      <Card className="border-[hsl(var(--tone-neutral-200))]">
        <CardHeader className="space-y-1 border-b border-[hsl(var(--tone-neutral-200))] pb-3">
          <CardTitle className="text-base font-semibold tracking-tight text-[hsl(var(--tone-neutral-900))]">
            Affiliation
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 pt-3 text-sm">
          <div className="rounded-md border border-[hsl(var(--tone-neutral-200))] bg-[hsl(var(--tone-neutral-50))] px-3 py-2.5">
            <p className="text-caption uppercase tracking-[0.08em] text-[hsl(var(--tone-neutral-500))]">Journal style line</p>
            <div className="mt-1 flex flex-wrap items-center justify-between gap-2">
              <p className="text-sm font-medium text-[hsl(var(--tone-neutral-900))]">
                {journalByline || 'Add job roles and affiliations to build your author line.'}
              </p>
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() => setAffiliationEditorOpen((current) => !current)}
              >
                {affiliationEditorOpen ? 'Hide editor' : 'Edit'}
              </Button>
            </div>
          </div>

          {affiliationEditorOpen ? (
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1 sm:col-span-2">
                <span className="text-caption uppercase tracking-[0.08em] text-[hsl(var(--tone-neutral-500))]">Add job role</span>
                <div className="flex flex-wrap items-center gap-2">
                  <Input
                    value={jobRoleInput}
                    onChange={(event) => setJobRoleInput(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter') {
                        event.preventDefault()
                        onAddJobRole(jobRoleInput)
                      }
                    }}
                    placeholder="e.g., British Heart Foundation Fellow"
                    autoComplete="organization-title"
                  />
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => onAddJobRole(jobRoleInput)}
                    disabled={!normalizeRole(jobRoleInput)}
                  >
                    Add role
                  </Button>
                </div>
              </div>

              {draft.jobRoles.length > 0 ? (
                <div className="flex flex-wrap gap-1.5 rounded-md border border-[hsl(var(--tone-neutral-200))] bg-card p-2 sm:col-span-2">
                  {draft.jobRoles.map((role, index) => (
                    <div key={role} className="inline-flex items-center gap-1 rounded-full border border-[hsl(var(--tone-neutral-200))] bg-[hsl(var(--tone-neutral-50))] px-2 py-0.5 text-xs text-[hsl(var(--tone-neutral-700))]">
                      <span>{role}</span>
                      {index === 0 ? (
                        <span className="rounded-full border border-[hsl(var(--tone-positive-200))] bg-[hsl(var(--tone-positive-50))] px-1.5 py-0.5 text-[0.58rem] uppercase tracking-[0.06em] text-[hsl(var(--tone-positive-700))]">
                          Lead
                        </span>
                      ) : null}
                      <button
                        type="button"
                        className="text-[hsl(var(--tone-neutral-500))] transition-colors hover:text-[hsl(var(--tone-danger-700))]"
                        onClick={() => onRemoveJobRole(role)}
                        aria-label={`Remove role ${role}`}
                      >
                        Remove
                      </button>
                    </div>
                  ))}
                </div>
              ) : null}

              <label className="space-y-1 sm:col-span-2">
                <span className="text-caption uppercase tracking-[0.08em] text-[hsl(var(--tone-neutral-500))]">Affiliation lookup</span>
                <div className="flex flex-wrap items-center gap-2">
                  <Input
                    value={primaryAffiliationInput}
                    onChange={(event) => {
                      const next = event.target.value
                      setPrimaryAffiliationInput(next)
                      onFieldChange('organisation', next)
                    }}
                    onBlur={() => {
                      void onResolvePrimaryAffiliationFromCurrent()
                    }}
                    placeholder="Type institution name for suggestions"
                    autoComplete="organization"
                  />
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => onAddAffiliation(primaryAffiliationInput)}
                    disabled={!sanitizeAffiliation(primaryAffiliationInput)}
                  >
                    Add affiliation
                  </Button>
                </div>
                {primaryAffiliationSuggestionsLoading ? (
                  <p className="text-micro text-[hsl(var(--tone-neutral-500))]">Looking up affiliation suggestions...</p>
                ) : null}
                {primaryAffiliationSuggestions.length > 0 ? (
                  <div className="flex flex-wrap gap-1.5 rounded-md border border-[hsl(var(--tone-neutral-200))] bg-card p-2">
                    {primaryAffiliationSuggestions.map((suggestion) => (
                      <button
                        key={`primary:${suggestion.source}:${suggestion.name}:${suggestion.countryCode || ''}`}
                        type="button"
                        onClick={() => {
                          void onApplyPrimaryAffiliationSuggestion(suggestion)
                        }}
                        className="rounded-full border border-[hsl(var(--tone-neutral-200))] bg-[hsl(var(--tone-neutral-50))] px-2 py-0.5 text-xs text-[hsl(var(--tone-neutral-700))] transition-colors hover:border-[hsl(var(--tone-accent-300))] hover:text-[hsl(var(--tone-accent-800))]"
                        title={suggestion.label}
                      >
                        {suggestion.label}
                      </button>
                    ))}
                  </div>
                ) : null}
                {primaryAffiliationSuggestionsError ? (
                  <p className="text-micro text-[hsl(var(--tone-warning-700))]">{primaryAffiliationSuggestionsError}</p>
                ) : null}
                {primaryAffiliationAddressResolving ? (
                  <p className="text-micro text-[hsl(var(--tone-neutral-500))]">Resolving full address details...</p>
                ) : null}
                {primaryAffiliationAddressError ? (
                  <p className="text-micro text-[hsl(var(--tone-warning-700))]">{primaryAffiliationAddressError}</p>
                ) : null}
              </label>

              {draft.affiliations.length > 0 ? (
                <div className="flex flex-wrap gap-1.5 rounded-md border border-[hsl(var(--tone-neutral-200))] bg-card p-2 sm:col-span-2">
                  {draft.affiliations.map((item, index) => (
                    <div key={`aff-${item}`} className="inline-flex items-center gap-1 rounded-full border border-[hsl(var(--tone-neutral-200))] bg-[hsl(var(--tone-neutral-50))] px-2 py-0.5 text-xs text-[hsl(var(--tone-neutral-700))]">
                      <span>{item}</span>
                      {index === 0 ? (
                        <span className="rounded-full border border-[hsl(var(--tone-positive-200))] bg-[hsl(var(--tone-positive-50))] px-1.5 py-0.5 text-[0.58rem] uppercase tracking-[0.06em] text-[hsl(var(--tone-positive-700))]">
                          Primary
                        </span>
                      ) : (
                        <button
                          type="button"
                          className="text-[hsl(var(--tone-neutral-600))] transition-colors hover:text-[hsl(var(--tone-accent-700))]"
                          onClick={() => onSetPrimaryAffiliation(item)}
                        >
                          Set primary
                        </button>
                      )}
                      <button
                        type="button"
                        className="text-[hsl(var(--tone-neutral-500))] transition-colors hover:text-[hsl(var(--tone-danger-700))]"
                        onClick={() => onRemoveAffiliationEntry(item)}
                        aria-label={`Remove affiliation ${item}`}
                      >
                        Remove
                      </button>
                    </div>
                  ))}
                </div>
              ) : null}

              <label className="space-y-1 sm:col-span-2">
                <span className="text-caption uppercase tracking-[0.08em] text-[hsl(var(--tone-neutral-500))]">Address line 1</span>
                <Input
                  value={draft.affiliationAddress}
                  onChange={(event) => onFieldChange('affiliationAddress', event.target.value)}
                  placeholder="Building, street, or campus"
                  autoComplete="street-address"
                />
              </label>

              <label className="space-y-1">
                <span className="text-caption uppercase tracking-[0.08em] text-[hsl(var(--tone-neutral-500))]">City</span>
                <Input
                  value={draft.affiliationCity}
                  onChange={(event) => onFieldChange('affiliationCity', event.target.value)}
                  placeholder="City"
                  autoComplete="address-level2"
                />
              </label>

              <label className="space-y-1">
                <span className="text-caption uppercase tracking-[0.08em] text-[hsl(var(--tone-neutral-500))]">Region / state</span>
                <Input
                  value={draft.affiliationRegion}
                  onChange={(event) => onFieldChange('affiliationRegion', event.target.value)}
                  placeholder="Region or state"
                  autoComplete="address-level1"
                />
              </label>

              <label className="space-y-1">
                <span className="text-caption uppercase tracking-[0.08em] text-[hsl(var(--tone-neutral-500))]">Postal code</span>
                <Input
                  value={draft.affiliationPostalCode}
                  onChange={(event) => onFieldChange('affiliationPostalCode', event.target.value)}
                  placeholder="Postal code"
                  autoComplete="postal-code"
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

              <label className="space-y-1 sm:col-span-2">
                <span className="text-caption uppercase tracking-[0.08em] text-[hsl(var(--tone-neutral-500))]">Department</span>
                <Input
                  value={draft.department}
                  onChange={(event) => onFieldChange('department', event.target.value)}
                  placeholder="Department"
                  autoComplete="organization-title"
                />
              </label>
            </div>
          ) : null}
        </CardContent>
      </Card>

      <Card className="border-[hsl(var(--tone-neutral-200))]">
        <CardHeader className="space-y-1 border-b border-[hsl(var(--tone-neutral-200))] pb-3">
          <CardTitle className="text-base font-semibold tracking-tight text-[hsl(var(--tone-neutral-900))]">
            Publication affiliation
          </CardTitle>
          <p className="text-xs text-[hsl(var(--tone-neutral-600))]">
            Keep an ordered list of affiliations used for manuscript author lines. Drag to reorder.
          </p>
        </CardHeader>
        <CardContent className="space-y-3 pt-3 text-sm">
          <div className="flex flex-wrap items-center gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => setShowPublicationAffiliationComposer((current) => !current)}
            >
              <Plus className="mr-1.5 h-4 w-4" />
              {showPublicationAffiliationComposer ? 'Hide add form' : 'Add new'}
            </Button>
          </div>

          {showPublicationAffiliationComposer ? (
            <div className="space-y-1 sm:col-span-2">
              <span className="text-caption uppercase tracking-[0.08em] text-[hsl(var(--tone-neutral-500))]">Add publication affiliation</span>
              <div className="flex flex-wrap items-center gap-2">
                <Input
                  value={publicationAffiliationInput}
                  onChange={(event) => setPublicationAffiliationInput(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter') {
                      event.preventDefault()
                      onAddPublicationAffiliation(publicationAffiliationInput)
                    }
                  }}
                  placeholder="Start typing an institution"
                  autoComplete="organization"
                />
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => onAddPublicationAffiliation(publicationAffiliationInput)}
                  disabled={
                    !sanitizeAffiliation(publicationAffiliationInput) ||
                    draft.publicationAffiliations.length >= MAX_PUBLICATION_AFFILIATIONS
                  }
                >
                  Add new
                </Button>
              </div>
              {publicationAffiliationSuggestionsLoading ? (
                <p className="text-micro text-[hsl(var(--tone-neutral-500))]">Looking up affiliations...</p>
              ) : null}
              {publicationAffiliationSuggestions.length > 0 ? (
                <div className="flex flex-wrap gap-1.5 rounded-md border border-[hsl(var(--tone-neutral-200))] bg-card p-2">
                  {publicationAffiliationSuggestions.map((suggestion) => (
                    <button
                      key={`publication:${suggestion.source}:${suggestion.name}:${suggestion.countryCode || ''}`}
                      type="button"
                      onClick={() => onAddPublicationAffiliation(suggestion.name, {
                        address: suggestion.address || '',
                        city: suggestion.city || '',
                        region: suggestion.region || '',
                        postalCode: suggestion.postalCode || '',
                        country: suggestion.countryName || '',
                      })}
                      className="rounded-full border border-[hsl(var(--tone-neutral-200))] bg-[hsl(var(--tone-neutral-50))] px-2 py-0.5 text-xs text-[hsl(var(--tone-neutral-700))] transition-colors hover:border-[hsl(var(--tone-accent-300))] hover:text-[hsl(var(--tone-accent-800))]"
                      title={suggestion.label}
                    >
                      {suggestion.label}
                    </button>
                  ))}
                </div>
              ) : null}
            </div>
          ) : null}

          {draft.publicationAffiliations.length > 0 ? (
            <div className="space-y-2">
              {draft.publicationAffiliations.map((item, index) => {
                const isPrimary = item.toLowerCase() === primaryAffiliationKey
                return (
                  <div
                    key={item}
                    draggable
                    onDragStart={() => onDragStartPublicationAffiliation(index)}
                    onDragOver={(event) => event.preventDefault()}
                    onDrop={() => onDropPublicationAffiliation(index)}
                    onDragEnd={() => setDraggingPublicationAffiliationIndex(null)}
                    className={`flex flex-wrap items-center gap-2 rounded-md border px-2 py-1.5 ${
                      draggingPublicationAffiliationIndex === index
                        ? 'border-[hsl(var(--tone-accent-300))] bg-[hsl(var(--tone-accent-50))]'
                        : 'border-[hsl(var(--tone-neutral-200))] bg-[hsl(var(--tone-neutral-50))]'
                    }`}
                  >
                    <span className="inline-flex items-center text-[hsl(var(--tone-neutral-500))]" title="Drag to reorder">
                      <GripVertical className="h-4 w-4" />
                    </span>
                    <span className="text-xs font-medium text-[hsl(var(--tone-neutral-700))]">{index + 1}.</span>
                    <span className="text-xs text-[hsl(var(--tone-neutral-800))]">{item}</span>
                    {isPrimary ? (
                      <span className="rounded-full border border-[hsl(var(--tone-positive-200))] bg-[hsl(var(--tone-positive-50))] px-1.5 py-0.5 text-micro uppercase tracking-[0.08em] text-[hsl(var(--tone-positive-700))]">
                        Primary
                      </span>
                    ) : (
                      <button
                        type="button"
                        onClick={() => onSetPrimaryAffiliation(item)}
                        className="rounded-full border border-[hsl(var(--tone-neutral-300))] px-1.5 py-0.5 text-micro uppercase tracking-[0.08em] text-[hsl(var(--tone-neutral-600))] transition-colors hover:border-[hsl(var(--tone-accent-300))] hover:text-[hsl(var(--tone-accent-700))]"
                      >
                        Set primary
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => onRemovePublicationAffiliation(item)}
                      className="ml-auto text-[hsl(var(--tone-neutral-500))] transition-colors hover:text-[hsl(var(--tone-danger-700))]"
                      aria-label={`Remove ${item}`}
                    >
                      Remove
                    </button>
                  </div>
                )
              })}
            </div>
          ) : (
            <p className="text-micro text-[hsl(var(--tone-neutral-500))]">
              No publication affiliations saved yet.
            </p>
          )}

          {publicationAffiliationSuggestionsError ? (
            <p className="text-micro text-[hsl(var(--tone-warning-700))]">{publicationAffiliationSuggestionsError}</p>
          ) : null}
        </CardContent>
      </Card>

      <div className="space-y-2">
        <div className="flex flex-wrap items-center gap-2">
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
      </div>
    </section>
  )
}

