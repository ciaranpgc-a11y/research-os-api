import { useEffect, useMemo, useRef, useState, type ChangeEvent, type DragEvent, type MouseEvent } from 'react'
import { ChevronRight, GripVertical, Loader2, Plus, SlidersHorizontal, Trash2, Upload } from 'lucide-react'
import { useNavigate } from 'react-router-dom'

import { PageHeader, Row, Section, SectionHeader, Stack, Subheading } from '@/components/primitives'
import { SectionMarker } from '@/components/patterns'
import { getSectionMarkerTone } from '@/lib/section-tone'
import { Badge, Button, Input, SelectPrimitive, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui'
import { clearAuthSessionToken, getAuthSessionToken } from '@/lib/auth-session'
import { houseForms, houseLayout, houseTypography } from '@/lib/house-style'
import { cn } from '@/lib/utils'
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
  profilePhotoPositionX: number
  profilePhotoPositionY: number
  publicationAffiliations: string[]
}

type StoredPersonalDetails = PersonalDetailsDraft & {
  updatedAt: string | null
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
  source: 'openalex' | 'ror' | 'openstreetmap' | 'clearbit'
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
  'jobRoles' | 'affiliations' | 'publicationAffiliations' | 'profilePhotoPositionX' | 'profilePhotoPositionY'
>

type AffiliationMetadataItem = {
  address: string
  city: string
  region: string
  postalCode: string
  country: string
}

type AffiliationEditorSnapshot = {
  jobRoles: string[]
  primaryAffiliation: string
  affiliationAddress: string
  affiliationCity: string
  affiliationRegion: string
  affiliationPostalCode: string
  affiliationCountry: string
}

const INTEGRATIONS_USER_CACHE_KEY = 'aawe_integrations_user_cache'
const INTEGRATIONS_ORCID_STATUS_CACHE_KEY = 'aawe_integrations_orcid_status_cache'
const PERSONAL_DETAILS_STORAGE_PREFIX = 'aawe_profile_personal_details:'

const TITLE_OPTIONS = [
  'Professor',
  'Professor Emeritus',
  'Associate Professor',
  'Assistant Professor',
  'Reader',
  'Senior Lecturer',
  'Lecturer',
  'Dr',
  'Research Fellow',
  'Postdoctoral Researcher',
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
const MAX_PROFILE_PHOTO_BYTES = 5 * 1024 * 1024
const DEFAULT_PROFILE_PHOTO_POSITION_X = 50
const DEFAULT_PROFILE_PHOTO_POSITION_Y = 50
const LEGACY_TOP_PROFILE_PHOTO_POSITION_Y = 20
const NEW_AFFILIATION_LABEL = 'New affiliation'
const HOUSE_ACTION_BUTTON_CLASS = `h-9 rounded-md border border-[hsl(var(--tone-accent-300)/0.92)] bg-[hsl(var(--tone-accent-50))] px-3.5 text-[hsl(var(--tone-accent-800))] ${houseTypography.buttonText} shadow-none hover:border-[hsl(var(--tone-accent-400)/0.94)] hover:bg-[hsl(var(--tone-accent-100))] hover:text-[hsl(var(--tone-accent-900))]`
const HOUSE_SECTION_ANCHOR_CLASS = houseLayout.sectionAnchor
const HOUSE_FORM_EXPANDER_SHELL_CLASS = houseForms.expanderShell
const HOUSE_FORM_EXPANDER_TRIGGER_CLASS = houseForms.expanderTrigger
const HOUSE_FORM_EXPANDER_PANEL_CLASS = houseForms.expanderPanel
const HOUSE_PROFILE_PHOTO_EDITOR_CLASS = 'space-y-2 rounded-md border border-[hsl(var(--stroke-strong)/0.92)] bg-[hsl(var(--tone-neutral-50))] p-2.5'
const HOUSE_SOCIAL_LINK_ROW_CLASS = 'sm:col-span-2 flex flex-col gap-2.5 sm:flex-row sm:items-center sm:gap-3.5'
const HOUSE_SOCIAL_LINK_LABEL_CLASS = 'inline-flex w-full shrink-0 items-center gap-2.5 px-2 py-1.5 house-field-label sm:w-[12rem]'
const HOUSE_SOCIAL_LINK_ICON_CLASS = 'inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-sm border border-[hsl(var(--tone-neutral-300))] bg-[hsl(var(--tone-neutral-100))] text-caption font-semibold leading-none tracking-tight text-[hsl(var(--tone-neutral-700))]'

function trimValue(value: string | null | undefined): string {
  return (value || '').trim()
}

function sanitizeAffiliation(value: string | null | undefined): string {
  return trimValue(value).replace(/\s+/g, ' ')
}

function normalizeRole(value: string | null | undefined): string {
  return trimValue(value).replace(/\s+/g, ' ')
}

function clampProfilePhotoPosition(value: unknown, fallback: number): number {
  const numeric = Number(value)
  if (!Number.isFinite(numeric)) {
    return fallback
  }
  return Math.max(0, Math.min(100, numeric))
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
    source:
      raw.source === 'ror' ||
      raw.source === 'openstreetmap' ||
      raw.source === 'clearbit'
        ? raw.source
        : 'openalex',
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

function isAffiliationLookupMiss(error: unknown): boolean {
  if (!(error instanceof Error)) {
    return false
  }
  const message = error.message.toLowerCase()
  return message.includes('not found') || message.includes('no results') || message.includes('no match')
}

async function fetchAffiliationSuggestions(input: {
  token: string | null
  query: string
  limit: number
}): Promise<AffiliationSuggestionItem[]> {
  const cleanToken = input.token || getAuthSessionToken()
  if (!cleanToken) {
    return []
  }
  const response = await fetchAffiliationSuggestionsForMe(cleanToken, {
    query: input.query,
    limit: input.limit,
  })
  return response.items
    .map(mapAffiliationSuggestionItem)
    .filter((item): item is AffiliationSuggestionItem => Boolean(item))
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

function normalizeJobRoles(values: unknown): string[] {
  const source = Array.isArray(values) ? values : []
  const seen = new Set<string>()
  const output: string[] = []
  for (const raw of source) {
    const clean = normalizeRole(raw)
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

function isGeneratedOAuthEmail(value: string | null | undefined): boolean {
  const clean = trimValue(value).toLowerCase()
  return clean.endsWith('@orcid.local') || clean.endsWith('@oauth.local')
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
  const legacyPhotoCentered = (value as { profilePhotoCentered?: boolean } | null | undefined)?.profilePhotoCentered !== false
  const fallbackPhotoPositionY = legacyPhotoCentered
    ? DEFAULT_PROFILE_PHOTO_POSITION_Y
    : LEGACY_TOP_PROFILE_PHOTO_POSITION_Y
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
  const primaryAffiliationOnly = effectiveAffiliations.length > 0
    ? [effectiveAffiliations[0]]
    : []
  return {
    salutation: trimValue(value?.salutation),
    firstName: trimValue(value?.firstName),
    lastName: trimValue(value?.lastName),
    jobRole: rawJobRole || effectiveJobRoles[0] || '',
    jobRoles: effectiveJobRoles,
    organisation: rawOrganisation || primaryAffiliationOnly[0] || '',
    affiliations: primaryAffiliationOnly,
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
    profilePhotoPositionX: clampProfilePhotoPosition(
      (value as { profilePhotoPositionX?: unknown } | null | undefined)?.profilePhotoPositionX,
      DEFAULT_PROFILE_PHOTO_POSITION_X,
    ),
    profilePhotoPositionY: clampProfilePhotoPosition(
      (value as { profilePhotoPositionY?: unknown } | null | undefined)?.profilePhotoPositionY,
      fallbackPhotoPositionY,
    ),
    publicationAffiliations: normalizeAffiliations(value?.publicationAffiliations),
  }
}

function draftFromSources(
  user: AuthUser | null | undefined,
  stored: StoredPersonalDetails | null | undefined,
  orcidLinked: boolean,
): PersonalDetailsDraft {
  const storedDraft: Partial<PersonalDetailsDraft> = stored
    ? (({ updatedAt: _unused, ...rest }: StoredPersonalDetails) => rest)(stored)
    : {}
  const rawName = trimValue(user?.name)
  const canUseUserName = Boolean(rawName) && !(orcidLinked && looksLikeOrcidPlaceholderName(rawName))
  const userNameSeeds: Partial<PersonalDetailsDraft> = canUseUserName
    ? splitName(rawName)
    : {}
  return sanitizeDraft({
    ...storedDraft,
    ...userNameSeeds,
  })
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

function buildProfileInitials(input: {
  firstName: string | null | undefined
  lastName: string | null | undefined
  fallbackName: string | null | undefined
}): string {
  const firstName = trimValue(input.firstName)
  const lastName = trimValue(input.lastName)
  if (firstName || lastName) {
    return `${firstName[0] || ''}${lastName[0] || ''}`.toUpperCase() || 'U'
  }
  const fallback = trimValue(input.fallbackName)
  if (!fallback) {
    return 'U'
  }
  const fallbackParts = fallback.split(/\s+/).filter(Boolean)
  if (fallbackParts.length >= 2) {
    return `${fallbackParts[0][0] || ''}${fallbackParts[1][0] || ''}`.toUpperCase() || 'U'
  }
  if (fallbackParts.length === 1) {
    return (fallbackParts[0][0] || 'U').toUpperCase()
  }
  return 'U'
}

function buildAffiliationEditorSnapshot(input: {
  draft: PersonalDetailsDraft
  primaryAffiliationInput: string
}): AffiliationEditorSnapshot {
  const primaryAffiliation = sanitizeAffiliation(input.primaryAffiliationInput)
  return {
    jobRoles: normalizeJobRoles(input.draft.jobRoles),
    primaryAffiliation,
    affiliationAddress: sanitizeAffiliation(input.draft.affiliationAddress),
    affiliationCity: sanitizeAffiliation(input.draft.affiliationCity),
    affiliationRegion: sanitizeAffiliation(input.draft.affiliationRegion),
    affiliationPostalCode: sanitizeAffiliation(input.draft.affiliationPostalCode),
    affiliationCountry: sanitizeAffiliation(input.draft.country),
  }
}

function areAffiliationEditorSnapshotsEqual(
  left: AffiliationEditorSnapshot,
  right: AffiliationEditorSnapshot,
): boolean {
  if (left.primaryAffiliation !== right.primaryAffiliation) {
    return false
  }
  if (left.affiliationAddress !== right.affiliationAddress) {
    return false
  }
  if (left.affiliationCity !== right.affiliationCity) {
    return false
  }
  if (left.affiliationRegion !== right.affiliationRegion) {
    return false
  }
  if (left.affiliationPostalCode !== right.affiliationPostalCode) {
    return false
  }
  if (left.affiliationCountry !== right.affiliationCountry) {
    return false
  }
  if (left.jobRoles.length !== right.jobRoles.length) {
    return false
  }
  for (let index = 0; index < left.jobRoles.length; index += 1) {
    if (left.jobRoles[index] !== right.jobRoles[index]) {
      return false
    }
  }
  return true
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

function buildJournalBylineFromDraft(draft: PersonalDetailsDraft): string {
  const role = normalizeRole(draft.jobRoles[0] || draft.jobRole)
  const affiliation = sanitizeAffiliation(draft.affiliations[0] || draft.organisation)
  const country = trimValue(draft.country)
  return [role, affiliation, country].filter(Boolean).join(', ')
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
  const [primaryAffiliationInput, setPrimaryAffiliationInput] = useState(() => sanitizeAffiliation(initialDraft.organisation))
  const [primaryAffiliationInputFocused, setPrimaryAffiliationInputFocused] = useState(false)
  const [primaryAffiliationSuggestions, setPrimaryAffiliationSuggestions] = useState<AffiliationSuggestionItem[]>([])
  const [primaryAffiliationSuggestionsLoading, setPrimaryAffiliationSuggestionsLoading] = useState(false)
  const [primaryAffiliationSuggestionsError, setPrimaryAffiliationSuggestionsError] = useState('')
  const [publicationAffiliationInput, setPublicationAffiliationInput] = useState('')
  const [publicationAffiliationSuggestions, setPublicationAffiliationSuggestions] = useState<AffiliationSuggestionItem[]>([])
  const [publicationAffiliationSuggestionsLoading, setPublicationAffiliationSuggestionsLoading] = useState(false)
  const [publicationAffiliationSuggestionsError, setPublicationAffiliationSuggestionsError] = useState('')
  const [profilePhotoEditorOpen, setProfilePhotoEditorOpen] = useState(false)
  const [affiliationMetadataByName, setAffiliationMetadataByName] = useState<Record<string, AffiliationMetadataItem>>({})
  const [affiliationEditorOpen, setAffiliationEditorOpen] = useState(false)
  const [activeAffiliationIndex, setActiveAffiliationIndex] = useState(() => (initialDraft.affiliations.length > 0 ? 0 : -1))
  const [pendingNewAffiliationIndex, setPendingNewAffiliationIndex] = useState<number | null>(null)
  const [showPublicationAffiliationComposer, setShowPublicationAffiliationComposer] = useState(false)
  const [affiliationEditorBaseline, setAffiliationEditorBaseline] = useState<AffiliationEditorSnapshot>(
    () => buildAffiliationEditorSnapshot({
      draft: initialDraft,
      primaryAffiliationInput: sanitizeAffiliation(initialDraft.organisation),
    }),
  )
  const [committedJournalByline, setCommittedJournalByline] = useState(() => buildJournalBylineFromDraft(initialDraft))
  const [affiliationSaveFlashActive, setAffiliationSaveFlashActive] = useState(false)
  const [draggingJobRoleIndex, setDraggingJobRoleIndex] = useState<number | null>(null)
  const [jobRoleDropTargetIndex, setJobRoleDropTargetIndex] = useState<number | null>(null)
  const [jobRoleDropFlashIndex, setJobRoleDropFlashIndex] = useState<number | null>(null)
  const [draggingPublicationAffiliationIndex, setDraggingPublicationAffiliationIndex] = useState<number | null>(null)
  const [publicationAffiliationDropTargetIndex, setPublicationAffiliationDropTargetIndex] = useState<number | null>(null)
  const [publicationAffiliationDropFlashIndex, setPublicationAffiliationDropFlashIndex] = useState<number | null>(null)
  const [primaryAffiliationAddressResolving, setPrimaryAffiliationAddressResolving] = useState(false)
  const [primaryAffiliationAddressError, setPrimaryAffiliationAddressError] = useState('')
  const [loading, setLoading] = useState(Boolean(fixture?.loading ?? !fixture))
  const [saving, setSaving] = useState(false)
  const [, setStatus] = useState(fixture?.status ?? '')
  const [error, setError] = useState(fixture?.error ?? '')
  const [, setLastSavedAt] = useState<string | null>(initialStoredDetails?.updatedAt ?? null)
  const draftRef = useRef<PersonalDetailsDraft>(initialDraft)
  const draftEditedRef = useRef(false)
  const emailEditedRef = useRef(false)
  const primaryAddressLookupSequenceRef = useRef(0)
  const lastResolvedPrimaryAffiliationKeyRef = useRef('')
  const lastAutoPopulateAffiliationKeyRef = useRef('')
  const wasAffiliationEditorOpenRef = useRef(affiliationEditorOpen)
  const affiliationEditorPanelRef = useRef<HTMLDivElement | null>(null)
  const jobRoleInputRefs = useRef<Array<HTMLInputElement | null>>([])
  const affiliationSummaryToggleRef = useRef<HTMLButtonElement | null>(null)
  const affiliationSaveFlashTimerRef = useRef<number | null>(null)
  const jobRoleDropFlashTimerRef = useRef<number | null>(null)
  const publicationAffiliationDropFlashTimerRef = useRef<number | null>(null)
  const profilePhotoInputRef = useRef<HTMLInputElement | null>(null)

  const clearAffiliationSaveFeedbackTimers = () => {
    if (affiliationSaveFlashTimerRef.current !== null) {
      window.clearTimeout(affiliationSaveFlashTimerRef.current)
      affiliationSaveFlashTimerRef.current = null
    }
  }

  const triggerAffiliationSavedFeedback = () => {
    clearAffiliationSaveFeedbackTimers()
    setAffiliationSaveFlashActive(true)
    affiliationSaveFlashTimerRef.current = window.setTimeout(() => {
      setAffiliationSaveFlashActive(false)
      affiliationSaveFlashTimerRef.current = null
    }, 1400)
  }

  const triggerJobRoleDropFlash = (index: number) => {
    if (jobRoleDropFlashTimerRef.current !== null) {
      window.clearTimeout(jobRoleDropFlashTimerRef.current)
      jobRoleDropFlashTimerRef.current = null
    }
    setJobRoleDropFlashIndex(index)
    jobRoleDropFlashTimerRef.current = window.setTimeout(() => {
      setJobRoleDropFlashIndex(null)
      jobRoleDropFlashTimerRef.current = null
    }, 850)
  }

  const triggerPublicationAffiliationDropFlash = (index: number) => {
    if (publicationAffiliationDropFlashTimerRef.current !== null) {
      window.clearTimeout(publicationAffiliationDropFlashTimerRef.current)
      publicationAffiliationDropFlashTimerRef.current = null
    }
    setPublicationAffiliationDropFlashIndex(index)
    publicationAffiliationDropFlashTimerRef.current = window.setTimeout(() => {
      setPublicationAffiliationDropFlashIndex(null)
      publicationAffiliationDropFlashTimerRef.current = null
    }, 850)
  }

  const runAffiliationActionPreservingPagePosition = (action: () => void | Promise<unknown>) => {
    const beforeScrollX = window.scrollX
    const beforeScrollY = window.scrollY
    const restore = () => {
      if (
        Math.abs(window.scrollY - beforeScrollY) <= 1
        && Math.abs(window.scrollX - beforeScrollX) <= 1
      ) {
        return
      }
      window.scrollTo({
        top: beforeScrollY,
        left: beforeScrollX,
        behavior: 'auto',
      })
    }
    const queueRestore = () => {
      window.requestAnimationFrame(() => {
        window.requestAnimationFrame(restore)
      })
    }
    const result = action()
    queueRestore()
    if (result instanceof Promise) {
      void result.finally(() => {
        queueRestore()
      })
    }
  }

  const setAffiliationEditorOpenPreservingPosition = (nextOpen: boolean) => {
    const summaryToggle = affiliationSummaryToggleRef.current
    if (!summaryToggle) {
      setAffiliationEditorOpen(nextOpen)
      return
    }
    runAffiliationActionPreservingPagePosition(() => {
      setAffiliationEditorOpen(nextOpen)
    })
  }

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
    setCommittedJournalByline(buildJournalBylineFromDraft(fixtureDraft))
    setPrimaryAffiliationInput(sanitizeAffiliation(fixtureDraft.organisation))
    setPrimaryAffiliationInputFocused(false)
    setAffiliationEditorOpen(false)
    setActiveAffiliationIndex(fixtureDraft.affiliations.length > 0 ? 0 : -1)
    setPendingNewAffiliationIndex(null)
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
    setProfilePhotoEditorOpen(false)
    setAffiliationMetadataByName({})
    setShowPublicationAffiliationComposer(false)
    setAffiliationEditorBaseline(buildAffiliationEditorSnapshot({
      draft: fixtureDraft,
      primaryAffiliationInput: sanitizeAffiliation(fixtureDraft.organisation),
    }))
    setDraggingJobRoleIndex(null)
    setJobRoleDropTargetIndex(null)
    setJobRoleDropFlashIndex(null)
    setDraggingPublicationAffiliationIndex(null)
    setPublicationAffiliationDropTargetIndex(null)
    setPublicationAffiliationDropFlashIndex(null)
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
    lastAutoPopulateAffiliationKeyRef.current = ''
    wasAffiliationEditorOpenRef.current = false
    if (affiliationSaveFlashTimerRef.current !== null) {
      window.clearTimeout(affiliationSaveFlashTimerRef.current)
      affiliationSaveFlashTimerRef.current = null
    }
    if (jobRoleDropFlashTimerRef.current !== null) {
      window.clearTimeout(jobRoleDropFlashTimerRef.current)
      jobRoleDropFlashTimerRef.current = null
    }
    if (publicationAffiliationDropFlashTimerRef.current !== null) {
      window.clearTimeout(publicationAffiliationDropFlashTimerRef.current)
      publicationAffiliationDropFlashTimerRef.current = null
    }
    setAffiliationSaveFlashActive(false)
  }, [fixture, isFixtureMode])

  useEffect(() => {
    draftRef.current = draft
  }, [draft])

  useEffect(
    () => () => {
      if (affiliationSaveFlashTimerRef.current !== null) {
        window.clearTimeout(affiliationSaveFlashTimerRef.current)
        affiliationSaveFlashTimerRef.current = null
      }
      if (jobRoleDropFlashTimerRef.current !== null) {
        window.clearTimeout(jobRoleDropFlashTimerRef.current)
        jobRoleDropFlashTimerRef.current = null
      }
      if (publicationAffiliationDropFlashTimerRef.current !== null) {
        window.clearTimeout(publicationAffiliationDropFlashTimerRef.current)
        publicationAffiliationDropFlashTimerRef.current = null
      }
    },
    [],
  )

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
          setProfilePhotoEditorOpen(false)
          setCommittedJournalByline(buildJournalBylineFromDraft(resolvedDraft))
          setPrimaryAffiliationInput(sanitizeAffiliation(resolvedDraft.organisation))
          setPrimaryAffiliationInputFocused(false)
          setAffiliationEditorOpen(false)
          setActiveAffiliationIndex(resolvedDraft.affiliations.length > 0 ? 0 : -1)
          setPendingNewAffiliationIndex(null)
          setAffiliationEditorBaseline(buildAffiliationEditorSnapshot({
            draft: resolvedDraft,
            primaryAffiliationInput: sanitizeAffiliation(resolvedDraft.organisation),
          }))
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
    if (!primaryAffiliationInputFocused) {
      setPrimaryAffiliationSuggestions([])
      setPrimaryAffiliationSuggestionsLoading(false)
      setPrimaryAffiliationSuggestionsError('')
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
  }, [isFixtureMode, primaryAffiliationInput, primaryAffiliationInputFocused, token])

  useEffect(() => {
    if (isFixtureMode) {
      return
    }
    if (affiliationEditorOpen && !wasAffiliationEditorOpenRef.current) {
      setAffiliationEditorBaseline(buildAffiliationEditorSnapshot({
        draft,
        primaryAffiliationInput,
      }))
    }
    if (!affiliationEditorOpen && wasAffiliationEditorOpenRef.current) {
      setPrimaryAffiliationInputFocused(false)
      setPrimaryAffiliationSuggestions([])
      setPrimaryAffiliationSuggestionsLoading(false)
      setPrimaryAffiliationSuggestionsError('')
    }
    wasAffiliationEditorOpenRef.current = affiliationEditorOpen
  }, [affiliationEditorOpen, draft, isFixtureMode, primaryAffiliationInput])

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

  useEffect(() => {
    if (affiliationEditorOpen) {
      return
    }
    setCommittedJournalByline(buildJournalBylineFromDraft(draft))
  }, [affiliationEditorOpen, draft])

  const primaryAffiliationKey = sanitizeAffiliation(draft.organisation || draft.affiliations[0] || '').toLowerCase()
  const activeAffiliationLabel = activeAffiliationIndex >= 0
    ? sanitizeAffiliation(draft.affiliations[activeAffiliationIndex] || '')
    : ''
  const activeAffiliationDisplayLabel = activeAffiliationLabel.toLowerCase() === NEW_AFFILIATION_LABEL.toLowerCase()
    ? ''
    : activeAffiliationLabel
  const profileInitials = buildProfileInitials({
    firstName: draft.firstName,
    lastName: draft.lastName,
    fallbackName: user?.name,
  })
  const affiliationEditorSnapshot = useMemo(
    () =>
      buildAffiliationEditorSnapshot({
        draft,
        primaryAffiliationInput,
      }),
    [draft, primaryAffiliationInput],
  )
  const affiliationEditorDirty = useMemo(
    () => !areAffiliationEditorSnapshotsEqual(affiliationEditorBaseline, affiliationEditorSnapshot),
    [affiliationEditorBaseline, affiliationEditorSnapshot],
  )
  const affiliationEditorActionLabel = affiliationEditorBaseline.primaryAffiliation ? 'Update' : 'Save'
  const hasPrimaryRoleEntry = normalizeRole(draft.jobRoles[0] || '').length > 0
  const hasIncompleteRoleEntries = draft.jobRoles.some((role) => normalizeRole(role).length === 0)
  const hasActiveAffiliationEntry = sanitizeAffiliation(primaryAffiliationInput).length > 0
  const affiliationSectionComplete = hasPrimaryRoleEntry && hasActiveAffiliationEntry && !hasIncompleteRoleEntries
  const hasPendingNewAffiliation = pendingNewAffiliationIndex !== null
  const canCreateAdditionalAffiliation =
    !hasPendingNewAffiliation && (!affiliationEditorOpen || (affiliationSectionComplete && !affiliationEditorDirty))
  const canSaveAffiliationSection = affiliationEditorDirty && affiliationSectionComplete
  const isPendingNewAffiliationActive =
    pendingNewAffiliationIndex !== null && activeAffiliationIndex === pendingNewAffiliationIndex
  const activeAffiliationActionLabel = isPendingNewAffiliationActive ? 'Cancel' : 'Delete'
  const publicationAffiliationSummaryLabel = draft.publicationAffiliations.length > 0
    ? `${draft.publicationAffiliations.length} publication affiliation${draft.publicationAffiliations.length === 1 ? '' : 's'} recorded.`
    : 'No publication affiliations recorded.'

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

  const onProfilePhotoPositionSliderChange = (axis: 'x' | 'y', value: string) => {
    const parsed = Number(value)
    if (!Number.isFinite(parsed)) {
      return
    }
    const clamped = clampProfilePhotoPosition(
      parsed,
      axis === 'x' ? DEFAULT_PROFILE_PHOTO_POSITION_X : DEFAULT_PROFILE_PHOTO_POSITION_Y,
    )
    draftEditedRef.current = true
    setDraft((current) => {
      if (!current.profilePhotoDataUrl) {
        return current
      }
      return {
        ...current,
        profilePhotoPositionX: axis === 'x' ? clamped : current.profilePhotoPositionX,
        profilePhotoPositionY: axis === 'y' ? clamped : current.profilePhotoPositionY,
      }
    })
    setStatus('')
  }

  const onResetProfilePhotoPosition = () => {
    draftEditedRef.current = true
    setDraft((current) => {
      if (!current.profilePhotoDataUrl) {
        return current
      }
      return {
        ...current,
        profilePhotoPositionX: DEFAULT_PROFILE_PHOTO_POSITION_X,
        profilePhotoPositionY: DEFAULT_PROFILE_PHOTO_POSITION_Y,
      }
    })
    setStatus('')
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
      setError('Choose an image under 5MB for profile photo.')
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
        profilePhotoPositionX: DEFAULT_PROFILE_PHOTO_POSITION_X,
        profilePhotoPositionY: DEFAULT_PROFILE_PHOTO_POSITION_Y,
      }))
      setProfilePhotoEditorOpen(true)
      setError('')
      setStatus('')
    }
    reader.readAsDataURL(file)
  }

  const onRemoveProfilePhoto = () => {
    draftEditedRef.current = true
    setDraft((current) => ({
      ...current,
      profilePhotoDataUrl: '',
      profilePhotoPositionX: DEFAULT_PROFILE_PHOTO_POSITION_X,
      profilePhotoPositionY: DEFAULT_PROFILE_PHOTO_POSITION_Y,
    }))
    setProfilePhotoEditorOpen(false)
    setStatus('')
  }

  const onToggleProfilePhotoEditor = (event: MouseEvent<HTMLButtonElement>) => {
    event.preventDefault()
    event.stopPropagation()
    if (!draft.profilePhotoDataUrl) {
      return
    }
    setProfilePhotoEditorOpen((current) => !current)
  }

  const onProfilePhotoPreviewClick = (event: MouseEvent<HTMLElement>) => {
    event.preventDefault()
    event.stopPropagation()
  }

  const onAddJobRole = () => {
    const beforeScrollY = window.scrollY
    let focusIndex = 0
    let addedNewRow = false
    setDraft((current) => {
      const existingBlankIndex = current.jobRoles.findIndex((item) => !normalizeRole(item))
      if (existingBlankIndex >= 0) {
        focusIndex = existingBlankIndex
        return current
      }
      const nextRoles = [...current.jobRoles, '']
      focusIndex = nextRoles.length - 1
      addedNewRow = true
      return {
        ...current,
        jobRoles: nextRoles,
        jobRole: nextRoles[0] || '',
      }
    })
    if (addedNewRow) {
      draftEditedRef.current = true
    }
    setDraggingJobRoleIndex(null)
    setJobRoleDropTargetIndex(null)
    window.requestAnimationFrame(() => {
      const input = jobRoleInputRefs.current[focusIndex]
      if (!input) {
        return
      }
      try {
        input.focus({ preventScroll: true })
      } catch {
        input.focus()
      }
      input.select()
      if (Math.abs(window.scrollY - beforeScrollY) > 1) {
        window.scrollTo({
          top: beforeScrollY,
          behavior: 'auto',
        })
      }
    })
  }

  const onRemoveJobRole = (index: number) => {
    draftEditedRef.current = true
    setDraft((current) => {
      if (index < 0 || index >= current.jobRoles.length) {
        return current
      }
      const nextRoles = normalizeJobRoles(current.jobRoles.filter((_, roleIndex) => roleIndex !== index))
      return {
        ...current,
        jobRoles: nextRoles,
        jobRole: nextRoles[0] || '',
      }
    })
    setDraggingJobRoleIndex(null)
    setJobRoleDropTargetIndex(null)
  }

  const onSetPrimaryJobRole = (value: string) => {
    const clean = normalizeRole(value)
    if (!clean) {
      return
    }
    draftEditedRef.current = true
    setDraft((current) => {
      const nextRoles = normalizeJobRoles([
        clean,
        ...current.jobRoles.filter((item) => item.toLowerCase() !== clean.toLowerCase()),
      ])
      return {
        ...current,
        jobRoles: nextRoles,
        jobRole: nextRoles[0] || clean,
      }
    })
    setDraggingJobRoleIndex(null)
  }

  const onJobRoleEntryChange = (index: number, value: string) => {
    draftEditedRef.current = true
    setDraft((current) => {
      if (index < 0) {
        return current
      }
      const nextRoles = [...current.jobRoles]
      while (nextRoles.length <= index) {
        nextRoles.push('')
      }
      nextRoles[index] = value
      return {
        ...current,
        jobRoles: nextRoles,
        jobRole: nextRoles[0] || '',
      }
    })
  }

  const onJobRoleEntryBlur = (index: number) => {
    draftEditedRef.current = true
    setDraft((current) => {
      if (index < 0 || index >= current.jobRoles.length) {
        return current
      }
      const normalized = normalizeJobRoles(current.jobRoles)
      return {
        ...current,
        jobRoles: normalized,
        jobRole: normalized[0] || '',
      }
    })
    setDraggingJobRoleIndex(null)
  }

  const onPrimaryAffiliationEntryChange = (value: string) => {
    const clean = sanitizeAffiliation(value)
    draftEditedRef.current = true
    setPrimaryAffiliationInput(value)
    setDraft((current) => {
      const targetIndex = activeAffiliationIndex >= 0 ? activeAffiliationIndex : current.affiliations.length
      const nextAffiliations = [...current.affiliations]
      while (nextAffiliations.length <= targetIndex) {
        nextAffiliations.push(NEW_AFFILIATION_LABEL)
      }
      nextAffiliations[targetIndex] = clean || NEW_AFFILIATION_LABEL
      return {
        ...current,
        organisation: targetIndex === 0 ? clean : current.organisation,
        affiliations: nextAffiliations,
      }
    })
  }

  const onPrimaryAffiliationEntryBlur = () => {
    const clean = sanitizeAffiliation(primaryAffiliationInput)
    const normalized = clean.toLowerCase()
    draftEditedRef.current = true
    setDraft((current) => {
      const targetIndex = activeAffiliationIndex >= 0 ? activeAffiliationIndex : current.affiliations.length
      const nextAffiliations = [...current.affiliations]
      while (nextAffiliations.length <= targetIndex) {
        nextAffiliations.push(NEW_AFFILIATION_LABEL)
      }
      nextAffiliations[targetIndex] = clean || NEW_AFFILIATION_LABEL
      return {
        ...current,
        organisation: targetIndex === 0 ? clean : current.organisation,
        affiliations: nextAffiliations,
      }
    })
    if (clean.length >= 2) {
      lastAutoPopulateAffiliationKeyRef.current = normalized
      void onResolvePrimaryAffiliationFromCurrent(clean)
    } else {
      lastAutoPopulateAffiliationKeyRef.current = ''
    }
  }

  const onPrimaryAffiliationInputBlur = () => {
    setPrimaryAffiliationInputFocused(false)
    onPrimaryAffiliationEntryBlur()
  }

  const commitJournalBylineFromDraft = (sourceDraft: PersonalDetailsDraft = draftRef.current) => {
    setCommittedJournalByline(buildJournalBylineFromDraft(sourceDraft))
  }

  const onAffiliationEditorPanelBlurCapture = () => {
    window.requestAnimationFrame(() => {
      const panel = affiliationEditorPanelRef.current
      if (!panel) {
        return
      }
      const active = document.activeElement
      if (active instanceof HTMLElement && panel.contains(active)) {
        return
      }
      commitJournalBylineFromDraft()
    })
  }

  const onToggleAffiliationRow = (index: number) => {
    if (index < 0) {
      return
    }
    runAffiliationActionPreservingPagePosition(() => {
      if (pendingNewAffiliationIndex !== null) {
        if (index !== pendingNewAffiliationIndex) {
          return
        }
        if (affiliationEditorOpen && activeAffiliationIndex === pendingNewAffiliationIndex) {
          return
        }
      }
      const isSameRow = activeAffiliationIndex === index
      if (isSameRow && affiliationEditorOpen) {
        commitJournalBylineFromDraft()
        setAffiliationEditorOpen(false)
        return
      }
      const selected = sanitizeAffiliation(draftRef.current.affiliations[index] || '')
      const selectedForInput = selected.toLowerCase() === NEW_AFFILIATION_LABEL.toLowerCase() ? '' : selected
      const metadata = selected ? affiliationMetadataByName[selected.toLowerCase()] : undefined
      setActiveAffiliationIndex(index)
      setPrimaryAffiliationInput(selectedForInput)
      setPrimaryAffiliationInputFocused(false)
      setPrimaryAffiliationSuggestions([])
      setPrimaryAffiliationSuggestionsLoading(false)
      setPrimaryAffiliationSuggestionsError('')
      setPrimaryAffiliationAddressResolving(false)
      setPrimaryAffiliationAddressError('')
      setDraft((current) => ({
        ...current,
        organisation: selectedForInput || current.organisation,
        affiliationAddress: metadata ? sanitizeAffiliation(metadata.address) : current.affiliationAddress,
        affiliationCity: metadata ? sanitizeAffiliation(metadata.city) : current.affiliationCity,
        affiliationRegion: metadata ? sanitizeAffiliation(metadata.region) : current.affiliationRegion,
        affiliationPostalCode: metadata ? sanitizeAffiliation(metadata.postalCode) : current.affiliationPostalCode,
        country: metadata ? sanitizeAffiliation(metadata.country) : current.country,
      }))
      setAffiliationEditorOpen(true)
    })
  }

  const onOpenAffiliationEditor = () => {
    if (pendingNewAffiliationIndex !== null) {
      runAffiliationActionPreservingPagePosition(() => {
        setActiveAffiliationIndex(pendingNewAffiliationIndex)
        setAffiliationEditorOpen(true)
      })
      return
    }
    if (!canCreateAdditionalAffiliation) {
      runAffiliationActionPreservingPagePosition(() => {
        setAffiliationEditorOpen(true)
      })
      return
    }
    runAffiliationActionPreservingPagePosition(() => {
      const currentActiveLabel = activeAffiliationLabel
      if (currentActiveLabel) {
        const cacheKey = currentActiveLabel.toLowerCase()
        setAffiliationMetadataByName((current) => ({
          ...current,
          [cacheKey]: {
            address: sanitizeAffiliation(draftRef.current.affiliationAddress),
            city: sanitizeAffiliation(draftRef.current.affiliationCity),
            region: sanitizeAffiliation(draftRef.current.affiliationRegion),
            postalCode: sanitizeAffiliation(draftRef.current.affiliationPostalCode),
            country: sanitizeAffiliation(draftRef.current.country),
          },
        }))
      }

      let nextAffiliationIndex = 0
      const nextDraft: PersonalDetailsDraft = {
        ...draftRef.current,
        jobRoles: [''],
        jobRole: '',
        organisation: '',
        affiliations: (() => {
          const next = [...draftRef.current.affiliations]
          nextAffiliationIndex = next.length
          next.push(NEW_AFFILIATION_LABEL)
          return next
        })(),
        affiliationAddress: '',
        affiliationCity: '',
        affiliationRegion: '',
        affiliationPostalCode: '',
        country: '',
      }
      draftEditedRef.current = true
      setDraft(nextDraft)
      setPrimaryAffiliationInput('')
      setPrimaryAffiliationInputFocused(false)
      setPrimaryAffiliationSuggestions([])
      setPrimaryAffiliationSuggestionsLoading(false)
      setPrimaryAffiliationSuggestionsError('')
      setPrimaryAffiliationAddressResolving(false)
      setPrimaryAffiliationAddressError('')
      setActiveAffiliationIndex(nextAffiliationIndex)
      setPendingNewAffiliationIndex(nextAffiliationIndex)
      lastAutoPopulateAffiliationKeyRef.current = ''
      lastResolvedPrimaryAffiliationKeyRef.current = ''
      setAffiliationEditorBaseline(buildAffiliationEditorSnapshot({
        draft: nextDraft,
        primaryAffiliationInput: '',
      }))
      setAffiliationEditorOpen(true)
    })
  }

  const onTogglePublicationAffiliationComposer = () => {
    runAffiliationActionPreservingPagePosition(() => {
      setShowPublicationAffiliationComposer((current) => !current)
    })
  }

  const onApplyAffiliationEditorChanges = () => {
    const cleanAffiliation = sanitizeAffiliation(primaryAffiliationInput)
    const normalizedRoles = normalizeJobRoles(draft.jobRoles)
    const normalizedAddress = sanitizeAffiliation(draft.affiliationAddress)
    const normalizedCity = sanitizeAffiliation(draft.affiliationCity)
    const normalizedRegion = sanitizeAffiliation(draft.affiliationRegion)
    const normalizedPostalCode = sanitizeAffiliation(draft.affiliationPostalCode)
    const normalizedCountry = sanitizeAffiliation(draft.country)
    const targetIndex = activeAffiliationIndex >= 0 ? activeAffiliationIndex : draft.affiliations.length
    const rawAffiliations = [...draft.affiliations]
    while (rawAffiliations.length <= targetIndex) {
      rawAffiliations.push(NEW_AFFILIATION_LABEL)
    }
    const previousLabel = sanitizeAffiliation(rawAffiliations[targetIndex])
    if (cleanAffiliation) {
      rawAffiliations[targetIndex] = cleanAffiliation
    } else {
      rawAffiliations.splice(targetIndex, 1)
    }
    const committedAffiliations = normalizeAffiliations(
      rawAffiliations
        .map((value) => sanitizeAffiliation(value))
        .filter((value) => value && value.toLowerCase() !== NEW_AFFILIATION_LABEL.toLowerCase()),
    )
    const nextActiveIndex = cleanAffiliation
      ? Math.max(0, committedAffiliations.findIndex((value) => value.toLowerCase() === cleanAffiliation.toLowerCase()))
      : (committedAffiliations.length > 0 ? Math.max(0, Math.min(targetIndex, committedAffiliations.length - 1)) : -1)
    const nextDraft: PersonalDetailsDraft = {
      ...draft,
      jobRoles: normalizedRoles,
      jobRole: normalizedRoles[0] || '',
      organisation: committedAffiliations[0] || '',
      affiliations: committedAffiliations,
      affiliationAddress: normalizedAddress,
      affiliationCity: normalizedCity,
      affiliationRegion: normalizedRegion,
      affiliationPostalCode: normalizedPostalCode,
      country: normalizedCountry,
    }
    draftEditedRef.current = true
    setDraft(nextDraft)
    setPrimaryAffiliationInput(nextActiveIndex >= 0 ? (committedAffiliations[nextActiveIndex] || '') : '')
    setActiveAffiliationIndex(nextActiveIndex)
    if (previousLabel && previousLabel.toLowerCase() !== cleanAffiliation.toLowerCase()) {
      setAffiliationMetadataByName((current) => {
        const next = { ...current }
        delete next[previousLabel.toLowerCase()]
        return next
      })
    }
    if (cleanAffiliation) {
      setAffiliationMetadataByName((current) => ({
        ...current,
        [cleanAffiliation.toLowerCase()]: {
          address: normalizedAddress,
          city: normalizedCity,
          region: normalizedRegion,
          postalCode: normalizedPostalCode,
          country: normalizedCountry,
        },
      }))
    }
    if (cleanAffiliation.length >= 2) {
      lastAutoPopulateAffiliationKeyRef.current = cleanAffiliation.toLowerCase()
      void onResolvePrimaryAffiliationFromCurrent(cleanAffiliation)
    } else {
      lastAutoPopulateAffiliationKeyRef.current = ''
    }
    setAffiliationEditorBaseline(buildAffiliationEditorSnapshot({
      draft: nextDraft,
      primaryAffiliationInput: cleanAffiliation,
    }))
    setPendingNewAffiliationIndex(null)
    commitJournalBylineFromDraft(nextDraft)
    setPrimaryAffiliationInputFocused(false)
    setPrimaryAffiliationSuggestions([])
    setPrimaryAffiliationSuggestionsError('')
    setPrimaryAffiliationAddressError('')
    setAffiliationEditorOpenPreservingPosition(false)
    triggerAffiliationSavedFeedback()
  }

  const onRemoveAffiliationEntry = (value: string) => {
    runAffiliationActionPreservingPagePosition(() => {
      const clean = sanitizeAffiliation(value)
      if (!clean) {
        return
      }
      draftEditedRef.current = true
      let nextActiveIndex = activeAffiliationIndex
      let nextActiveLabel = ''
      let nextPendingNewIndex = pendingNewAffiliationIndex
      setDraft((current) => {
        const removedIndex = current.affiliations.findIndex((item) => item.toLowerCase() === clean.toLowerCase())
        const nextAffiliations = normalizeAffiliations(current.affiliations.filter((item) => item.toLowerCase() !== clean.toLowerCase()))
        const nextPrimary = nextAffiliations[0] || ''
        if (nextPendingNewIndex !== null) {
          if (removedIndex === nextPendingNewIndex) {
            nextPendingNewIndex = null
          } else if (removedIndex >= 0 && removedIndex < nextPendingNewIndex) {
            nextPendingNewIndex -= 1
          }
        }
        if (nextAffiliations.length === 0) {
          nextActiveIndex = -1
          nextActiveLabel = ''
        } else if (removedIndex >= 0) {
          if (activeAffiliationIndex > removedIndex) {
            nextActiveIndex = activeAffiliationIndex - 1
          } else if (activeAffiliationIndex === removedIndex) {
            nextActiveIndex = Math.min(removedIndex, nextAffiliations.length - 1)
          }
          nextActiveIndex = Math.max(0, Math.min(nextActiveIndex, nextAffiliations.length - 1))
          nextActiveLabel = nextAffiliations[nextActiveIndex] || ''
        } else {
          nextActiveIndex = Math.max(0, Math.min(activeAffiliationIndex, nextAffiliations.length - 1))
          nextActiveLabel = nextAffiliations[nextActiveIndex] || ''
        }
        return {
          ...current,
          affiliations: nextAffiliations,
          organisation: nextPrimary,
        }
      })
      setActiveAffiliationIndex(nextActiveIndex)
      setPendingNewAffiliationIndex(nextPendingNewIndex)
      setPrimaryAffiliationInput(nextActiveLabel)
      setAffiliationMetadataByName((current) => {
        const next = { ...current }
        delete next[clean.toLowerCase()]
        return next
      })
      if (sanitizeAffiliation(primaryAffiliationInput).toLowerCase() === clean.toLowerCase() || nextActiveIndex < 0) {
        setPrimaryAffiliationInput('')
      }
      lastAutoPopulateAffiliationKeyRef.current = ''
    })
  }

  const onDeleteActiveAffiliation = () => {
    runAffiliationActionPreservingPagePosition(() => {
      if (activeAffiliationIndex < 0) {
        return
      }
      const sourceDraft = draftRef.current
      if (activeAffiliationIndex >= sourceDraft.affiliations.length) {
        return
      }

      const removedLabel = sanitizeAffiliation(sourceDraft.affiliations[activeAffiliationIndex] || '')
      const removedIndex = activeAffiliationIndex
      const nextAffiliations = normalizeAffiliations(
        sourceDraft.affiliations
          .filter((_, index) => index !== removedIndex)
          .map((value) => sanitizeAffiliation(value))
          .filter((value) => value && value.toLowerCase() !== NEW_AFFILIATION_LABEL.toLowerCase()),
      )
      const nextActiveIndex = nextAffiliations.length > 0
        ? Math.max(0, Math.min(activeAffiliationIndex, nextAffiliations.length - 1))
        : -1
      const nextActiveLabel = nextActiveIndex >= 0 ? nextAffiliations[nextActiveIndex] || '' : ''
      const nextActiveMetadata = nextActiveLabel ? affiliationMetadataByName[nextActiveLabel.toLowerCase()] : undefined
      const nextDraft: PersonalDetailsDraft = {
        ...sourceDraft,
        affiliations: nextAffiliations,
        organisation: nextAffiliations[0] || '',
        affiliationAddress: nextActiveMetadata ? sanitizeAffiliation(nextActiveMetadata.address) : '',
        affiliationCity: nextActiveMetadata ? sanitizeAffiliation(nextActiveMetadata.city) : '',
        affiliationRegion: nextActiveMetadata ? sanitizeAffiliation(nextActiveMetadata.region) : '',
        affiliationPostalCode: nextActiveMetadata ? sanitizeAffiliation(nextActiveMetadata.postalCode) : '',
        country: nextActiveMetadata ? sanitizeAffiliation(nextActiveMetadata.country) : '',
      }

      draftEditedRef.current = true
      setDraft(nextDraft)
      setActiveAffiliationIndex(nextActiveIndex)
      setPrimaryAffiliationInput(nextActiveLabel)
      setPrimaryAffiliationInputFocused(false)
      setPrimaryAffiliationSuggestions([])
      setPrimaryAffiliationSuggestionsLoading(false)
      setPrimaryAffiliationSuggestionsError('')
      setPrimaryAffiliationAddressResolving(false)
      setPrimaryAffiliationAddressError('')
      setAffiliationEditorBaseline(buildAffiliationEditorSnapshot({
        draft: nextDraft,
        primaryAffiliationInput: nextActiveLabel,
      }))
      setAffiliationEditorOpen(nextActiveIndex >= 0)
      if (pendingNewAffiliationIndex !== null) {
        if (removedIndex === pendingNewAffiliationIndex) {
          setPendingNewAffiliationIndex(null)
        } else if (removedIndex < pendingNewAffiliationIndex) {
          setPendingNewAffiliationIndex(pendingNewAffiliationIndex - 1)
        }
      }
      commitJournalBylineFromDraft(nextDraft)

      if (removedLabel && removedLabel.toLowerCase() !== NEW_AFFILIATION_LABEL.toLowerCase()) {
        setAffiliationMetadataByName((current) => {
          const next = { ...current }
          delete next[removedLabel.toLowerCase()]
          return next
        })
      }
      lastAutoPopulateAffiliationKeyRef.current = nextActiveLabel.toLowerCase()
    })
  }

  const onAddPublicationAffiliation = (value: string, metadata?: AffiliationMetadataItem) => {
    runAffiliationActionPreservingPagePosition(() => {
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
    })
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
      if (isAffiliationLookupMiss(lookupError)) {
        setPrimaryAffiliationAddressError('')
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

  const onApplyPrimaryAffiliationSuggestion = (suggestion: AffiliationSuggestionItem) => {
    runAffiliationActionPreservingPagePosition(async () => {
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
      const targetIndex = activeAffiliationIndex >= 0 ? activeAffiliationIndex : draftRef.current.affiliations.length
      draftEditedRef.current = true
      setDraft((current) => ({
        ...current,
        affiliations: (() => {
          const nextAffiliations = [...current.affiliations]
          while (nextAffiliations.length <= targetIndex) {
            nextAffiliations.push(NEW_AFFILIATION_LABEL)
          }
          nextAffiliations[targetIndex] = clean
          return normalizeAffiliations(
            nextAffiliations
              .map((value) => sanitizeAffiliation(value))
              .filter((value) => value && value.toLowerCase() !== NEW_AFFILIATION_LABEL.toLowerCase()),
          )
        })(),
        organisation: (() => {
          const nextAffiliations = [...current.affiliations]
          while (nextAffiliations.length <= targetIndex) {
            nextAffiliations.push(NEW_AFFILIATION_LABEL)
          }
          nextAffiliations[targetIndex] = clean
          const committed = normalizeAffiliations(
            nextAffiliations
              .map((value) => sanitizeAffiliation(value))
              .filter((value) => value && value.toLowerCase() !== NEW_AFFILIATION_LABEL.toLowerCase()),
          )
          return committed[0] || clean
        })(),
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
      setPrimaryAffiliationInputFocused(false)
      setActiveAffiliationIndex(targetIndex)
      lastAutoPopulateAffiliationKeyRef.current = normalizedKey
      await resolvePrimaryAffiliationAddress({
        organisation: clean,
        seedMetadata: metadata,
        replaceExisting: true,
      })
    })
  }

  const onSetPrimaryAffiliation = (value: string) => {
    runAffiliationActionPreservingPagePosition(() => {
      const clean = sanitizeAffiliation(value)
      if (!clean) {
        return
      }
      const metadata = affiliationMetadataByName[clean.toLowerCase()]
      draftEditedRef.current = true
      setDraft((current) => ({
        ...current,
        affiliations: (() => {
          const nextAffiliations = normalizeAffiliations([
            clean,
            ...current.affiliations.filter((item) => item.toLowerCase() !== clean.toLowerCase()),
          ])
          return nextAffiliations
        })(),
        organisation: clean,
        affiliationAddress: metadata ? sanitizeAffiliation(metadata.address) : current.affiliationAddress,
        affiliationCity: metadata ? sanitizeAffiliation(metadata.city) : current.affiliationCity,
        affiliationRegion: metadata ? sanitizeAffiliation(metadata.region) : current.affiliationRegion,
        affiliationPostalCode: metadata ? sanitizeAffiliation(metadata.postalCode) : current.affiliationPostalCode,
        country: metadata ? sanitizeAffiliation(metadata.country) : current.country,
      }))
      setPrimaryAffiliationInput(clean)
      setActiveAffiliationIndex(0)
      lastAutoPopulateAffiliationKeyRef.current = clean.toLowerCase()
    })
  }

  const onResolvePrimaryAffiliationFromCurrent = async (organisationOverride?: string) => {
    const organisation = sanitizeAffiliation(organisationOverride ?? draft.organisation)
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

  const onDragStartJobRole = (event: DragEvent<HTMLDivElement>, index: number) => {
    event.dataTransfer.effectAllowed = 'move'
    setJobRoleDropFlashIndex(null)
    setDraggingJobRoleIndex(index)
    setJobRoleDropTargetIndex(index)
  }

  const onDragOverJobRole = (event: DragEvent<HTMLDivElement>, index: number) => {
    event.preventDefault()
    event.dataTransfer.dropEffect = 'move'
    if (draggingJobRoleIndex === null) {
      return
    }
    if (jobRoleDropTargetIndex !== index) {
      setJobRoleDropTargetIndex(index)
    }
  }

  const onDropJobRole = (targetIndex: number) => {
    if (draggingJobRoleIndex === null || draggingJobRoleIndex === targetIndex) {
      setDraggingJobRoleIndex(null)
      setJobRoleDropTargetIndex(null)
      return
    }
    let didReorder = false
    draftEditedRef.current = true
    setDraft((current) => {
      const items = [...current.jobRoles]
      if (
        draggingJobRoleIndex < 0
        || draggingJobRoleIndex >= items.length
        || targetIndex < 0
        || targetIndex >= items.length
      ) {
        return current
      }
      const [moved] = items.splice(draggingJobRoleIndex, 1)
      if (!moved) {
        return current
      }
      items.splice(targetIndex, 0, moved)
      const nextRoles = normalizeJobRoles(items)
      didReorder = true
      return {
        ...current,
        jobRoles: nextRoles,
        jobRole: nextRoles[0] || '',
      }
    })
    setDraggingJobRoleIndex(null)
    setJobRoleDropTargetIndex(null)
    if (didReorder) {
      triggerJobRoleDropFlash(targetIndex)
    }
  }

  const onDragStartPublicationAffiliation = (event: DragEvent<HTMLDivElement>, index: number) => {
    event.dataTransfer.effectAllowed = 'move'
    setPublicationAffiliationDropFlashIndex(null)
    setDraggingPublicationAffiliationIndex(index)
    setPublicationAffiliationDropTargetIndex(index)
  }

  const onDragOverPublicationAffiliation = (event: DragEvent<HTMLDivElement>, index: number) => {
    event.preventDefault()
    event.dataTransfer.dropEffect = 'move'
    if (draggingPublicationAffiliationIndex === null) {
      return
    }
    if (publicationAffiliationDropTargetIndex !== index) {
      setPublicationAffiliationDropTargetIndex(index)
    }
  }

  const onDropPublicationAffiliation = (targetIndex: number) => {
    if (draggingPublicationAffiliationIndex === null || draggingPublicationAffiliationIndex === targetIndex) {
      setDraggingPublicationAffiliationIndex(null)
      setPublicationAffiliationDropTargetIndex(null)
      return
    }
    let didReorder = false
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
      didReorder = true
      return {
        ...current,
        publicationAffiliations: items,
      }
    })
    setDraggingPublicationAffiliationIndex(null)
    setPublicationAffiliationDropTargetIndex(null)
    if (didReorder) {
      triggerPublicationAffiliationDropFlash(targetIndex)
    }
  }

  const onRemovePublicationAffiliation = (value: string) => {
    runAffiliationActionPreservingPagePosition(() => {
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
    })
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
    <Stack data-house-role="page" space="sm">
      <Row
        align="center"
        gap="md"
        wrap={false}
        className="house-page-title-row"
      >
        <SectionMarker tone={getSectionMarkerTone('profile')} size="title" className="self-stretch h-auto" />
        <PageHeader
          heading="Personal details"
          description="Your professional information and research affiliations."
          className="!ml-0 !mt-0"
        />
      </Row>

      <Section className={cn(HOUSE_SECTION_ANCHOR_CLASS)} surface="transparent" inset="none" spaceY="md">
        <div className="house-section-header-marker-aligned flex w-full flex-col gap-2">
          <h2 className="m-0 text-h3 font-semibold text-[hsl(var(--foreground))]">Profile</h2>
        </div>
        <div className="space-y-3 text-sm">
          <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,2fr)]">
            <div className="house-metric-tile-shell rounded-md border p-3 hover:bg-[var(--metric-tile-bg-rest)] focus-visible:bg-[var(--metric-tile-bg-rest)]">
              <div className="flex flex-col gap-3">
                <Subheading>Profile photo</Subheading>
                <div className="flex flex-col items-center gap-2">
                  {draft.profilePhotoDataUrl ? (
                    <div
                      className="relative mt-2 h-[9.75rem] w-[9.75rem] shrink-0 overflow-hidden rounded-full border border-[hsl(var(--tone-neutral-500))] bg-[hsl(var(--tone-neutral-200))] shadow-[var(--elevation-1)]"
                      onClick={onProfilePhotoPreviewClick}
                    >
                      <img
                        src={draft.profilePhotoDataUrl}
                        alt="Profile photo"
                        decoding="async"
                        className="pointer-events-none select-none h-full w-full object-cover"
                        draggable={false}
                        style={{
                          objectPosition: `${draft.profilePhotoPositionX}% ${draft.profilePhotoPositionY}%`,
                        }}
                      />
                    </div>
                  ) : (
                    <div className="mt-2 inline-flex h-[9.75rem] w-[9.75rem] items-center justify-center rounded-full border border-[hsl(var(--tone-neutral-500))] bg-[hsl(var(--tone-neutral-100))] text-2xl font-semibold text-[hsl(var(--tone-neutral-700))] shadow-[var(--elevation-1)]">
                      {profileInitials}
                    </div>
                  )}
                  <input
                    ref={profilePhotoInputRef}
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={onProfilePhotoSelected}
                  />
                  <Button
                    type="button"
                    size="sm"
                    variant="default"
                    onClick={() => profilePhotoInputRef.current?.click()}
                  >
                    <Upload className="mr-1.5 h-4 w-4" />
                    {draft.profilePhotoDataUrl ? 'Replace photo' : 'Upload photo'}
                  </Button>
                  {draft.profilePhotoDataUrl ? (
                    <div className="flex flex-wrap items-center justify-center gap-2">
                      <Button
                        type="button"
                        size="sm"
                        variant="secondary"
                        className={HOUSE_ACTION_BUTTON_CLASS}
                        onClick={onToggleProfilePhotoEditor}
                      >
                        <SlidersHorizontal className="mr-1.5 h-4 w-4" />
                        {profilePhotoEditorOpen ? 'Close editor' : 'Adjust framing'}
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        variant="secondary"
                        className={HOUSE_ACTION_BUTTON_CLASS}
                        onClick={onRemoveProfilePhoto}
                      >
                        <Trash2 className="mr-1.5 h-4 w-4" />
                        Remove
                      </Button>
                    </div>
                  ) : null}
                </div>
                {draft.profilePhotoDataUrl && profilePhotoEditorOpen ? (
                  <div className={HOUSE_PROFILE_PHOTO_EDITOR_CLASS}>
                    <p className="house-field-label">Mini photo editor</p>
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-start">
                      <div className="mx-auto h-24 w-24 shrink-0 overflow-hidden rounded-full border border-[hsl(var(--tone-neutral-500))] bg-[hsl(var(--tone-neutral-100))] shadow-[var(--elevation-1)] sm:mx-0">
                        <img
                          src={draft.profilePhotoDataUrl}
                          alt="Profile photo editor preview"
                          decoding="async"
                          className="h-full w-full object-cover"
                          style={{
                            objectPosition: `${draft.profilePhotoPositionX}% ${draft.profilePhotoPositionY}%`,
                          }}
                        />
                      </div>
                      <div className="flex-1 space-y-2">
                        <label className="space-y-1">
                          <span className="house-field-label">Horizontal framing</span>
                          <input
                            type="range"
                            min={0}
                            max={100}
                            step={0.5}
                            value={draft.profilePhotoPositionX}
                            onChange={(event) => onProfilePhotoPositionSliderChange('x', event.target.value)}
                            className="h-2 w-full cursor-pointer accent-[hsl(var(--tone-accent-700))]"
                          />
                        </label>
                        <label className="space-y-1">
                          <span className="house-field-label">Vertical framing</span>
                          <input
                            type="range"
                            min={0}
                            max={100}
                            step={0.5}
                            value={draft.profilePhotoPositionY}
                            onChange={(event) => onProfilePhotoPositionSliderChange('y', event.target.value)}
                            className="h-2 w-full cursor-pointer accent-[hsl(var(--tone-accent-700))]"
                          />
                        </label>
                        <div className="flex flex-wrap gap-2">
                          <Button type="button" size="sm" variant="secondary" className={HOUSE_ACTION_BUTTON_CLASS} onClick={onResetProfilePhotoPosition}>
                            Reset
                          </Button>
                          <Button type="button" size="sm" variant="cta" onClick={() => setProfilePhotoEditorOpen(false)}>
                            Done
                          </Button>
                        </div>
                      </div>
                    </div>
                  </div>
                ) : null}
              </div>
            </div>
            <div className="house-metric-tile-shell rounded-md border p-3 hover:bg-[var(--metric-tile-bg-rest)] focus-visible:bg-[var(--metric-tile-bg-rest)]">
              <div className="grid items-start gap-4">
                <div className="space-y-3 sm:pr-3">
                  <Subheading>Personal details</Subheading>
                  <label className="space-y-1 block">
                    <span className="house-field-label">Account email</span>
                    <Input
                      value={accountEmail}
                      onChange={(event) => onAccountEmailChange(event.target.value)}
                      placeholder="you@institution.edu"
                      autoComplete="email"
                      disabled={saving}
                    />
                  </label>

                  <div className="grid gap-3 sm:grid-cols-[12rem_minmax(0,1fr)_minmax(0,1fr)]">
                    <label className="space-y-1">
                      <span className="house-field-label">Title</span>
                      <SelectPrimitive
                        value={draft.salutation || '__none__'}
                        onValueChange={(value) => onFieldChange('salutation', value === '__none__' ? '' : value)}
                      >
                        <SelectTrigger aria-label="Title">
                          <SelectValue placeholder="Select title" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="__none__">Select title</SelectItem>
                          {TITLE_OPTIONS.map((option) => (
                            <SelectItem key={option} value={option}>
                              {option}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </SelectPrimitive>
                    </label>

                    <label className="space-y-1">
                      <span className="house-field-label">First name</span>
                      <Input
                        value={draft.firstName}
                        onChange={(event) => onFieldChange('firstName', event.target.value)}
                        placeholder="First name"
                        autoComplete="given-name"
                      />
                    </label>

                    <label className="space-y-1">
                      <span className="house-field-label">Last name</span>
                      <Input
                        value={draft.lastName}
                        onChange={(event) => onFieldChange('lastName', event.target.value)}
                        placeholder="Last name"
                        autoComplete="family-name"
                      />
                    </label>
                  </div>

                  <div className={HOUSE_SOCIAL_LINK_ROW_CLASS}>
                    <label
                      htmlFor="personal-website"
                      className={HOUSE_SOCIAL_LINK_LABEL_CLASS}
                    >
                      <span
                        aria-hidden
                        className={HOUSE_SOCIAL_LINK_ICON_CLASS}
                      >
                        W
                      </span>
                      Website
                    </label>
                    <Input
                      id="personal-website"
                      value={draft.website}
                      onChange={(event) => onFieldChange('website', event.target.value)}
                      placeholder="https://"
                      autoComplete="url"
                      className="w-full"
                    />
                  </div>

                  <div className={HOUSE_SOCIAL_LINK_ROW_CLASS}>
                    <label
                      htmlFor="personal-researchgate"
                      className={HOUSE_SOCIAL_LINK_LABEL_CLASS}
                    >
                      <span
                        aria-hidden
                        className={HOUSE_SOCIAL_LINK_ICON_CLASS}
                      >
                        RG
                      </span>
                      ResearchGate page
                    </label>
                    <Input
                      id="personal-researchgate"
                      value={draft.researchGateUrl}
                      onChange={(event) => onFieldChange('researchGateUrl', event.target.value)}
                      placeholder="https://www.researchgate.net/profile/..."
                      autoComplete="url"
                      className="w-full"
                    />
                  </div>

                  <div className={HOUSE_SOCIAL_LINK_ROW_CLASS}>
                    <label
                      htmlFor="personal-x-handle"
                      className={HOUSE_SOCIAL_LINK_LABEL_CLASS}
                    >
                      <span
                        aria-hidden
                        className={HOUSE_SOCIAL_LINK_ICON_CLASS}
                      >
                        X
                      </span>
                      Twitter/X handle
                    </label>
                    <Input
                      id="personal-x-handle"
                      value={draft.xHandle}
                      onChange={(event) => onFieldChange('xHandle', event.target.value)}
                      placeholder="@yourhandle"
                      autoComplete="nickname"
                      className="w-full"
                    />
                  </div>
                </div>
              </div>
            </div>

          </div>
        </div>
      </Section>

      <Section className={cn(HOUSE_SECTION_ANCHOR_CLASS)} surface="transparent" inset="none" spaceY="md">
        <SectionHeader
          heading="Affiliation"
          className="house-section-header-marker-aligned"
        />
        <div className="space-y-3 text-sm">
          <div className="house-metric-tile-shell rounded-md border p-3 hover:bg-[var(--metric-tile-bg-rest)] focus-visible:bg-[var(--metric-tile-bg-rest)]">
            <div className="grid gap-x-2 gap-y-0 md:grid-cols-[minmax(0,1fr)_auto] md:items-start">
              <div className="space-y-1.5 md:col-start-1 md:col-end-2">
                {draft.affiliations.length > 0 ? draft.affiliations.map((affiliation, index) => {
                  const clean = sanitizeAffiliation(affiliation)
                  const isPlaceholder = clean.toLowerCase() === NEW_AFFILIATION_LABEL.toLowerCase()
                  const isOpen = affiliationEditorOpen && activeAffiliationIndex === index
                  const rowLabel = clean && !isPlaceholder ? clean : NEW_AFFILIATION_LABEL
                  return (
                    <div
                      key={`affiliation-row-${index}-${clean || 'new'}`}
                      className={cn(
                        HOUSE_FORM_EXPANDER_SHELL_CLASS,
                        'transition-[background-color,border-color,box-shadow] duration-[var(--motion-duration-long)] ease-[var(--motion-ease-default)]',
                        'bg-[hsl(var(--tone-neutral-50))]',
                        isOpen && affiliationSaveFlashActive ? 'shadow-[var(--elevation-1)]' : '',
                      )}
                      data-state={isOpen ? 'open' : 'closed'}
                    >
                      <button
                        ref={index === 0 ? affiliationSummaryToggleRef : undefined}
                        type="button"
                        className={cn(HOUSE_FORM_EXPANDER_TRIGGER_CLASS, 'w-full rounded-md px-3 py-2.5 text-left')}
                        data-state={isOpen ? 'open' : 'closed'}
                        onClick={() => onToggleAffiliationRow(index)}
                        aria-expanded={isOpen}
                        aria-controls="affiliation-editor-panel"
                      >
                        <span className="flex items-center justify-between gap-3">
                          <span className="flex min-w-0 items-center gap-2">
                            <ChevronRight
                              className={cn(
                                'h-4 w-4 text-[hsl(var(--tone-neutral-500))] transition-transform duration-[var(--motion-duration-ui)]',
                                isOpen
                                  ? 'translate-x-0.5 rotate-90 text-[hsl(var(--tone-neutral-700))]'
                                  : '',
                              )}
                              aria-hidden
                            />
                            <p
                              className={cn(
                                'truncate text-sm font-medium text-[hsl(var(--tone-neutral-900))] transition-transform duration-[var(--motion-duration-ui)]',
                                isOpen ? 'translate-x-0.5' : '',
                              )}
                            >
                              {rowLabel}
                            </p>
                          </span>
                        </span>
                      </button>
                    </div>
                  )
                }) : (
                  <div
                    className={cn(
                      HOUSE_FORM_EXPANDER_SHELL_CLASS,
                      'bg-[hsl(var(--tone-neutral-50))]',
                    )}
                    data-state="closed"
                  >
                    <button
                      ref={affiliationSummaryToggleRef}
                      type="button"
                      className={cn(HOUSE_FORM_EXPANDER_TRIGGER_CLASS, 'w-full rounded-md px-3 py-2.5 text-left')}
                      data-state="closed"
                      onClick={onOpenAffiliationEditor}
                      aria-expanded={false}
                      aria-controls="affiliation-editor-panel"
                    >
                      <span className="flex items-center gap-2">
                        <ChevronRight className="h-4 w-4 text-[hsl(var(--tone-neutral-500))]" aria-hidden />
                        <p className="truncate text-sm font-medium text-[hsl(var(--tone-neutral-900))]">{committedJournalByline || 'No affiliations recorded.'}</p>
                      </span>
                    </button>
                  </div>
                )}
              </div>
              <div className="flex shrink-0 flex-col items-stretch gap-2 self-start md:pt-1">
                <Button
                  type="button"
                  size="sm"
                  variant="default"
                  onClick={onOpenAffiliationEditor}
                  disabled={!canCreateAdditionalAffiliation}
                >
                  <Plus className="mr-1.5 h-4 w-4" />
                  Add new
                </Button>
              </div>
              {affiliationEditorOpen ? (
              <div
                id="affiliation-editor-panel"
                ref={affiliationEditorPanelRef}
                onBlurCapture={onAffiliationEditorPanelBlurCapture}
                className={cn(HOUSE_FORM_EXPANDER_PANEL_CLASS, 'space-y-3 md:col-start-1 md:col-end-2')}
              >
                <div className="space-y-1.5">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="house-field-label text-[hsl(var(--tone-neutral-700))]">Roles</p>
                  </div>

                  <div
                    className={cn(
                      'grid gap-2',
                      normalizeRole(draft.jobRoles[0] || '').length > 0
                        ? 'md:grid-cols-[minmax(0,1fr)_auto] md:items-start md:gap-3'
                        : 'md:max-w-[75%]',
                    )}
                  >
                    <div className="space-y-1.5 w-full">
                      {(draft.jobRoles.length > 0 ? draft.jobRoles : ['']).map((role, index) => {
                        const hasRoleRows = draft.jobRoles.length > 0
                        return (
                          <div
                            key={`role-${index}`}
                            draggable={hasRoleRows}
                            onDragStart={(event) => {
                              if (!hasRoleRows) {
                                return
                              }
                              onDragStartJobRole(event, index)
                            }}
                            onDragOver={(event) => {
                              if (!hasRoleRows) {
                                return
                              }
                              onDragOverJobRole(event, index)
                            }}
                            onDrop={() => {
                              if (!hasRoleRows) {
                                return
                              }
                              onDropJobRole(index)
                            }}
                            onDragEnd={() => {
                              setDraggingJobRoleIndex(null)
                              setJobRoleDropTargetIndex(null)
                            }}
                            className={cn(
                              'group w-full flex flex-wrap items-center gap-2 rounded-md border border-transparent px-2 py-1.5 transition-[transform,background-color,border-color,box-shadow,opacity] duration-[var(--motion-duration-ui)] ease-[var(--motion-ease-default)] will-change-transform',
                              draggingJobRoleIndex === index
                                ? 'border-[hsl(var(--tone-accent-400))] bg-[hsl(var(--tone-accent-50))] shadow-[var(--elevation-3)] scale-[1.015] -translate-y-0.5 opacity-95'
                                : 'bg-background hover:bg-[hsl(var(--tone-neutral-50)/0.7)]',
                              jobRoleDropTargetIndex === index && draggingJobRoleIndex !== index
                                ? 'border-dashed border-[hsl(var(--tone-accent-400))] bg-[hsl(var(--tone-accent-50)/0.8)] shadow-[inset_0_0_0_1px_hsl(var(--tone-accent-300)/0.45)] translate-x-0.5'
                                : '',
                              jobRoleDropFlashIndex === index
                                ? 'ring-2 ring-[hsl(var(--tone-positive-300)/0.75)] ring-offset-1 ring-offset-transparent'
                                : '',
                            )}
                          >
                            <span
                              className={cn(
                                'inline-flex items-center text-[hsl(var(--tone-neutral-500))] transition-transform duration-[var(--motion-duration-fast)]',
                                hasRoleRows
                                  ? 'cursor-grab active:cursor-grabbing'
                                  : 'cursor-default opacity-45',
                                draggingJobRoleIndex === index && hasRoleRows ? 'scale-110 text-[hsl(var(--tone-accent-700))]' : '',
                              )}
                              title={hasRoleRows ? 'Drag to reorder' : undefined}
                            >
                              <GripVertical className="h-4 w-4" />
                            </span>
                            <span className="text-xs font-medium text-[hsl(var(--tone-neutral-700))]">{index + 1}.</span>
                            <Input
                              ref={(element) => {
                                jobRoleInputRefs.current[index] = element
                              }}
                              value={role}
                              onChange={(event) => onJobRoleEntryChange(index, event.target.value)}
                              onBlur={() => onJobRoleEntryBlur(index)}
                              placeholder="Role"
                              autoComplete="organization-title"
                              className="flex-1"
                            />
                            {hasRoleRows && index === 0 ? (
                              <Badge variant="positive" className="w-[6.75rem] justify-center">
                                Primary
                              </Badge>
                            ) : null}
                            {hasRoleRows && index > 0 ? (
                              <Button
                                type="button"
                                onClick={() => onSetPrimaryJobRole(role)}
                                variant="default"
                                size="sm"
                                className="w-[6.75rem] min-h-0 h-auto justify-center px-2 py-1 text-micro font-medium leading-tight hover:border-[hsl(var(--tone-neutral-900))] hover:bg-white hover:text-[hsl(var(--tone-neutral-900))] active:border-[hsl(var(--tone-neutral-900))] active:bg-white active:text-[hsl(var(--tone-neutral-900))]"
                              >
                                Set primary
                              </Button>
                            ) : null}
                            {hasRoleRows ? (
                              <button
                                type="button"
                                onClick={() => onRemoveJobRole(index)}
                                className="ml-auto text-[hsl(var(--tone-neutral-500))] transition-colors hover:text-[hsl(var(--tone-danger-700))]"
                                aria-label={`Remove role ${index + 1}`}
                              >
                                Remove
                              </button>
                            ) : null}
                          </div>
                        )
                      })}
                    </div>

                    {normalizeRole(draft.jobRoles[0] || '').length > 0 ? (
                      <div className="flex justify-end self-start md:rounded-md md:border md:border-transparent md:px-2 md:py-1.5">
                        <Button
                          type="button"
                          variant="default"
                          size="sm"
                          onClick={onAddJobRole}
                        >
                          <Plus className="mr-1.5 h-4 w-4" />
                          Add new role
                        </Button>
                      </div>
                    ) : null}
                  </div>
                </div>

              <div className="house-divider-fill-soft h-px w-full" />

              <div className="space-y-2">
                <p className="house-field-label text-[hsl(var(--tone-neutral-700))]">Affiliation</p>

                <div className="flex flex-wrap items-center gap-2">
                  <Input
                    value={primaryAffiliationInput}
                    onChange={(event) => onPrimaryAffiliationEntryChange(event.target.value)}
                    onFocus={() => setPrimaryAffiliationInputFocused(true)}
                    onBlur={onPrimaryAffiliationInputBlur}
                    placeholder="Start typing to see suggestions"
                    autoComplete="organization"
                    className="min-w-[14rem] flex-1"
                  />
                  {activeAffiliationDisplayLabel ? (
                    <button
                      type="button"
                      onClick={() => onRemoveAffiliationEntry(activeAffiliationDisplayLabel)}
                      className="text-[hsl(var(--tone-neutral-500))] transition-colors hover:text-[hsl(var(--tone-danger-700))]"
                      aria-label={`Remove affiliation ${activeAffiliationDisplayLabel}`}
                    >
                      Remove
                    </button>
                    ) : null}
                </div>

                {primaryAffiliationInputFocused && primaryAffiliationSuggestionsLoading ? (
                  <p className="house-field-helper">Looking up affiliations...</p>
                ) : null}
                {primaryAffiliationInputFocused && primaryAffiliationSuggestions.length > 0 ? (
                  <div className="flex flex-wrap gap-1.5 rounded-md border border-[hsl(var(--tone-neutral-200))] bg-card p-2">
                    {primaryAffiliationSuggestions.map((suggestion) => (
                      <button
                        key={`primary:${suggestion.source}:${suggestion.name}:${suggestion.countryCode || ''}`}
                        type="button"
                        onMouseDown={(event) => {
                          event.preventDefault()
                        }}
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
                  <p className="house-field-helper">Resolving full address details...</p>
                ) : null}
                {primaryAffiliationAddressError ? (
                  <p className="text-micro text-[hsl(var(--tone-warning-700))]">{primaryAffiliationAddressError}</p>
                ) : null}

                <div className="grid gap-3 sm:grid-cols-2">
                  <label className="space-y-1 sm:col-span-2">
                    <span className="house-field-label">Address line 1</span>
                    <Input
                      value={draft.affiliationAddress}
                      onChange={(event) => onFieldChange('affiliationAddress', event.target.value)}
                      placeholder="Building, street, or campus"
                      autoComplete="street-address"
                    />
                  </label>

                  <label className="space-y-1">
                    <span className="house-field-label">City</span>
                    <Input
                      value={draft.affiliationCity}
                      onChange={(event) => onFieldChange('affiliationCity', event.target.value)}
                      placeholder="City"
                      autoComplete="address-level2"
                    />
                  </label>

                  <label className="space-y-1">
                    <span className="house-field-label">Region / state</span>
                    <Input
                      value={draft.affiliationRegion}
                      onChange={(event) => onFieldChange('affiliationRegion', event.target.value)}
                      placeholder="Region or state"
                      autoComplete="address-level1"
                    />
                  </label>

                  <label className="space-y-1">
                    <span className="house-field-label">Postal code</span>
                    <Input
                      value={draft.affiliationPostalCode}
                      onChange={(event) => onFieldChange('affiliationPostalCode', event.target.value)}
                      placeholder="Postal code"
                      autoComplete="postal-code"
                    />
                  </label>

                  <label className="space-y-1">
                    <span className="house-field-label">Country</span>
                    <Input
                      value={draft.country}
                      onChange={(event) => onFieldChange('country', event.target.value)}
                      placeholder="Country"
                      autoComplete="country-name"
                    />
                  </label>

                </div>

                {affiliationEditorOpen ? (
                  <div className="flex justify-end">
                    <Button
                      type="button"
                      size="sm"
                      variant={isPendingNewAffiliationActive ? 'default' : 'destructive'}
                      onClick={onDeleteActiveAffiliation}
                      disabled={activeAffiliationIndex < 0}
                    >
                      {activeAffiliationActionLabel}
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant="cta"
                      onClick={onApplyAffiliationEditorChanges}
                      disabled={!canSaveAffiliationSection}
                      className="ml-2"
                    >
                      {affiliationEditorActionLabel}
                    </Button>
                  </div>
                ) : null}

              </div>
              </div>
            ) : null}
            </div>
          </div>
        </div>
      </Section>

      <Section className={cn(HOUSE_SECTION_ANCHOR_CLASS)} surface="transparent" inset="none" spaceY="md">
        <SectionHeader
          heading="Publication affiliation"
          className="house-section-header-marker-aligned"
        />
        <div className="house-metric-tile-shell rounded-md border p-3 hover:bg-[var(--metric-tile-bg-rest)] focus-visible:bg-[var(--metric-tile-bg-rest)]">
          <div className="space-y-3 text-sm">
            <div className="grid gap-x-2 gap-y-0 md:grid-cols-[minmax(0,1fr)_auto] md:items-start">
              <div
                className={cn(HOUSE_FORM_EXPANDER_SHELL_CLASS, 'bg-[hsl(var(--tone-neutral-50))]')}
                data-state={showPublicationAffiliationComposer ? 'open' : 'closed'}
              >
                <button
                  type="button"
                  className={cn(HOUSE_FORM_EXPANDER_TRIGGER_CLASS, 'w-full rounded-md px-3 py-2.5 text-left')}
                  data-state={showPublicationAffiliationComposer ? 'open' : 'closed'}
                  onClick={onTogglePublicationAffiliationComposer}
                  aria-expanded={showPublicationAffiliationComposer}
                  aria-controls="publication-affiliation-composer"
                >
                  <span className="flex items-center justify-between gap-3">
                    <span className="flex min-w-0 items-center gap-2">
                      <ChevronRight
                        className={cn(
                          'h-4 w-4 text-[hsl(var(--tone-neutral-500))] transition-transform duration-[var(--motion-duration-ui)]',
                          showPublicationAffiliationComposer
                            ? 'translate-x-0.5 rotate-90 text-[hsl(var(--tone-neutral-700))]'
                            : '',
                        )}
                        aria-hidden
                      />
                      <p
                        className={cn(
                          'truncate text-sm font-medium text-[hsl(var(--tone-neutral-900))] transition-transform duration-[var(--motion-duration-ui)]',
                          showPublicationAffiliationComposer ? 'translate-x-0.5' : '',
                        )}
                      >
                        {publicationAffiliationSummaryLabel}
                      </p>
                    </span>
                  </span>
                </button>
              </div>
              <Button
                type="button"
                variant="default"
                size="sm"
                className="shrink-0 self-start md:mt-1"
                onClick={onTogglePublicationAffiliationComposer}
              >
                <Plus className="mr-1.5 h-4 w-4" />
                {showPublicationAffiliationComposer ? 'Hide add form' : 'Add new'}
              </Button>

              {showPublicationAffiliationComposer ? (
                <div id="publication-affiliation-composer" className={cn(HOUSE_FORM_EXPANDER_PANEL_CLASS, 'space-y-1 md:col-start-1 md:col-end-2')}>
                  <span className="house-field-label text-[hsl(var(--tone-neutral-700))]">Add publication affiliation</span>
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
                      placeholder="Start typing to see suggestions"
                      autoComplete="organization"
                    />
                    <Button
                      type="button"
                      variant="default"
                      size="sm"
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
                    <p className="house-field-helper">Looking up affiliations...</p>
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
                  {publicationAffiliationSuggestionsError ? (
                    <p className="text-micro text-[hsl(var(--tone-warning-700))]">{publicationAffiliationSuggestionsError}</p>
                  ) : null}
                </div>
              ) : null}
            </div>

            {draft.publicationAffiliations.length > 0 ? (
              <div className="house-divider-fill-soft h-px w-full" />
            ) : null}

            {draft.publicationAffiliations.length > 0 ? (
              <div className="space-y-2">
                {draft.publicationAffiliations.map((item, index) => {
                  const isPrimary = item.toLowerCase() === primaryAffiliationKey
                  return (
                    <div
                      key={item}
                      draggable
                      onDragStart={(event) => onDragStartPublicationAffiliation(event, index)}
                      onDragOver={(event) => onDragOverPublicationAffiliation(event, index)}
                      onDrop={() => onDropPublicationAffiliation(index)}
                      onDragEnd={() => {
                        setDraggingPublicationAffiliationIndex(null)
                        setPublicationAffiliationDropTargetIndex(null)
                      }}
                      className={cn(
                        'group flex flex-wrap items-center gap-2 rounded-md border px-2 py-1.5 transition-[transform,background-color,border-color,box-shadow,opacity] duration-[var(--motion-duration-ui)] ease-[var(--motion-ease-default)] will-change-transform',
                        draggingPublicationAffiliationIndex === index
                          ? 'border-[hsl(var(--tone-accent-400))] bg-[hsl(var(--tone-accent-50))] shadow-[var(--elevation-3)] scale-[1.015] -translate-y-0.5 opacity-95'
                          : 'border-[hsl(var(--tone-neutral-200))] bg-[hsl(var(--tone-neutral-50))] hover:bg-[hsl(var(--tone-neutral-100)/0.55)]',
                        publicationAffiliationDropTargetIndex === index && draggingPublicationAffiliationIndex !== index
                          ? 'border-dashed border-[hsl(var(--tone-accent-400))] bg-[hsl(var(--tone-accent-50)/0.8)] shadow-[inset_0_0_0_1px_hsl(var(--tone-accent-300)/0.45)] translate-x-0.5'
                          : '',
                        publicationAffiliationDropFlashIndex === index
                          ? 'ring-2 ring-[hsl(var(--tone-positive-300)/0.75)] ring-offset-1 ring-offset-transparent'
                          : '',
                      )}
                    >
                      <span
                        className={cn(
                          'inline-flex cursor-grab items-center text-[hsl(var(--tone-neutral-500))] transition-transform duration-[var(--motion-duration-fast)] active:cursor-grabbing',
                          draggingPublicationAffiliationIndex === index ? 'scale-110 text-[hsl(var(--tone-accent-700))]' : 'group-hover:scale-105',
                        )}
                        title="Drag to reorder"
                      >
                        <GripVertical className="h-4 w-4" />
                      </span>
                      <span className="text-xs font-medium text-[hsl(var(--tone-neutral-700))]">{index + 1}.</span>
                      <span className="min-w-[10rem] flex-1 text-xs text-[hsl(var(--tone-neutral-800))]">{item}</span>
                      {isPrimary ? (
                        <Badge variant="positive" className="w-[6.75rem] justify-center">
                          Primary
                        </Badge>
                      ) : (
                        <Button
                          type="button"
                          onClick={() => onSetPrimaryAffiliation(item)}
                          variant="default"
                          size="sm"
                          className="w-[6.75rem] min-h-0 h-auto justify-center px-2 py-1 text-micro font-medium leading-tight hover:border-[hsl(var(--tone-neutral-900))] hover:bg-white hover:text-[hsl(var(--tone-neutral-900))] active:border-[hsl(var(--tone-neutral-900))] active:bg-white active:text-[hsl(var(--tone-neutral-900))]"
                        >
                          Set primary
                        </Button>
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
            ) : null}
          </div>
        </div>
      </Section>

      <Section className={cn(HOUSE_SECTION_ANCHOR_CLASS)} surface="transparent" inset="none" spaceY="sm">
        <div className="flex flex-wrap items-center gap-2">
          <Button
            type="button"
            variant="cta"
            onClick={() => void onSave()}
            disabled={!user || saving || loading}
          >
            {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
            {saving ? 'Saving...' : 'Save details'}
          </Button>
        </div>

        {error ? (
          <div className="rounded-md border border-[hsl(var(--tone-danger-200))] bg-[hsl(var(--tone-danger-50))] px-3 py-2 text-sm text-[hsl(var(--tone-danger-700))]">
            {error}
          </div>
        ) : null}

        {loading ? <p className="text-xs text-[hsl(var(--tone-neutral-500))]">Loading personal details...</p> : null}
      </Section>
    </Stack>
  )
}


