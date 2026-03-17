import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type KeyboardEvent as ReactKeyboardEvent, type PointerEvent as ReactPointerEvent } from 'react'
import { Building2, ChevronDown, ChevronUp, ChevronsUpDown, Download, Eye, EyeOff, FileText, Filter, GripVertical, Hammer, Loader2, Pencil, Plus, Save, Search, Settings, Share2, X } from 'lucide-react'
import { createPortal } from 'react-dom'
import { useNavigate, useSearchParams } from 'react-router-dom'

import {
  PageHeader,
  Row,
  Section,
  SectionHeader,
  Stack,
} from '@/components/primitives'
import { InsightsGlyph, SectionMarker, SectionToolDivider, SectionTools } from '@/components/patterns'
import { getSectionMarkerTone } from '@/lib/section-tone'
import { houseLayout, houseTables } from '@/lib/house-style'
import { cn } from '@/lib/utils'
import { UKCollaborationMap } from '@/components/collaboration/UKCollaborationMap'
import { publicationsHouseDrilldown, publicationsHouseMotion } from '@/components/publications/publications-house-style'
import {
  Badge,
  Button,
  DrilldownSheet,
  Input,
  SelectPrimitive,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui'
import { getAuthSessionToken } from '@/lib/auth-session'
import {
  fetchAllCollaboratorsForCollaborationPage,
  readCachedCollaborationLandingData,
  writeCachedCollaborationLandingData,
} from '@/lib/collaboration-preload'
import {
  fetchAffiliationAddressForMe,
  exportCollaboratorsCsv,
  fetchAffiliationSuggestionsForMe,
  fetchCollaborationLanding,
  fetchCollaborationMetricsSummary,
  getCollaborator,
  listCollaboratorSharedWorks,
  listCollaboratorsSharedWorks,
  updateCollaborator,
} from '@/lib/impact-api'
import type {
  AffiliationSuggestionItemPayload,
  CollaboratorPayload,
  CollaboratorSharedWorkPayload,
  CollaboratorsListPayload,
  CollaborationMetricsSummaryPayload,
} from '@/types/impact'

type CollaboratorFormState = {
  salutation: string
  first_name: string
  middle_initial: string
  surname: string
  preferred_name: string
  email: string
  secondary_email: string
  orcid_id: string
  openalex_author_id: string
  primary_institution: string
  secondary_institution: string
  primary_institution_openalex_id: string
  secondary_institution_openalex_id: string
  primary_affiliation_department: string
  primary_affiliation_address_line_1: string
  primary_affiliation_city: string
  primary_affiliation_region: string
  primary_affiliation_postal_code: string
  primary_affiliation_country: string
  secondary_affiliation_department: string
  secondary_affiliation_address_line_1: string
  secondary_affiliation_city: string
  secondary_affiliation_region: string
  secondary_affiliation_postal_code: string
  secondary_affiliation_country: string
  department: string
  country: string
  current_position: string
  research_domains: string
  notes: string
}

type CollaboratorAffiliationSlotKey = 'primary' | 'secondary'

type CollaboratorIdentityDraft = Pick<
  CollaboratorFormState,
  'salutation' | 'first_name' | 'middle_initial' | 'surname'
>

type CollaboratorAffiliationBylineDraft = {
  department: string
  address_line_1: string
  city: string
  region: string
  postal_code: string
  country: string
}

type CollaboratorCanonical = CollaboratorPayload & {
  institution_labels: string[]
  duplicate_count: number
}

type AffiliationSuggestionItem = {
  name: string
  label: string
  openalexId: string | null
  countryCode: string | null
  countryName: string | null
  city: string | null
  region: string | null
  address: string | null
  postalCode: string | null
  source: 'openai' | 'openalex' | 'ror' | 'openstreetmap' | 'clearbit'
}

type CollaboratorContactUpdateInput = {
  contact_salutation?: string | null
  contact_first_name?: string | null
  contact_middle_initial?: string | null
  contact_surname?: string | null
  contact_email?: string | null
  contact_secondary_email?: string | null
  contact_primary_institution?: string | null
  contact_secondary_institution?: string | null
  contact_primary_institution_openalex_id?: string | null
  contact_secondary_institution_openalex_id?: string | null
  contact_primary_affiliation_department?: string | null
  contact_primary_affiliation_address_line_1?: string | null
  contact_primary_affiliation_city?: string | null
  contact_primary_affiliation_region?: string | null
  contact_primary_affiliation_postal_code?: string | null
  contact_primary_affiliation_country?: string | null
  contact_secondary_affiliation_department?: string | null
  contact_secondary_affiliation_address_line_1?: string | null
  contact_secondary_affiliation_city?: string | null
  contact_secondary_affiliation_region?: string | null
  contact_secondary_affiliation_postal_code?: string | null
  contact_secondary_affiliation_country?: string | null
}

type CollaboratorContactSaveQueueItem = {
  collaboratorId: string
  payload: CollaboratorContactUpdateInput
  snapshot: string
}

type HeatmapMode = 'country' | 'institution' | 'domain'
type HeatmapMetric = 'collaborators' | 'works' | 'strength' | 'citations_last_12m' | 'recency'
type HeatmapSelection = {
  mode: HeatmapMode
  label: string
} | null
type HeatmapCell = {
  key: string
  label: string
  value: number
  collaborators: number
  bucketLabels: string[]
}
type HeatmapQuantiles = {
  q20: number
  q40: number
  q60: number
  q80: number
  max: number
}
type CollaborationTableColumnKey =
  | 'name'
  | 'institution'
  | 'relationship'
  | 'activity'
  | 'last_year'
  | 'coauthored_works'
  | 'collaboration_score'
type CollaborationTableDensity = 'compact' | 'default' | 'comfortable'
type CollaborationTablePageSize = 25 | 50 | 100 | 'all'
type CollaborationSortField =
  | 'name'
  | 'works'
  | 'last_collaboration_year'
  | 'strength'
  | 'relationship_tier'
  | 'activity_status'
type CollaboratorDrilldownTab = 'details' | 'history' | 'actions'
type CollaboratorHistoryWindowMode = '1y' | '3y' | '5y' | 'all'
type CollaboratorSharedWorksSortField = 'title' | 'year' | 'citations_total'
type SortDirection = 'asc' | 'desc'
type CollaborationTableColumnPreference = {
  visible: boolean
  width: number
}

type MockMetricsSeed = Pick<
  CollaboratorPayload['metrics'],
  'coauthored_works_count' | 'last_collaboration_year' | 'collaboration_strength_score'
>

const EMPTY_FORM: CollaboratorFormState = {
  salutation: '',
  first_name: '',
  middle_initial: '',
  surname: '',
  preferred_name: '',
  email: '',
  secondary_email: '',
  orcid_id: '',
  openalex_author_id: '',
  primary_institution: '',
  secondary_institution: '',
  primary_institution_openalex_id: '',
  secondary_institution_openalex_id: '',
  primary_affiliation_department: '',
  primary_affiliation_address_line_1: '',
  primary_affiliation_city: '',
  primary_affiliation_region: '',
  primary_affiliation_postal_code: '',
  primary_affiliation_country: '',
  secondary_affiliation_department: '',
  secondary_affiliation_address_line_1: '',
  secondary_affiliation_city: '',
  secondary_affiliation_region: '',
  secondary_affiliation_postal_code: '',
  secondary_affiliation_country: '',
  department: '',
  country: '',
  current_position: '',
  research_domains: '',
  notes: '',
}

const HOUSE_SECTION_ANCHOR_CLASS = houseLayout.sectionAnchor
const HOUSE_TABLE_SORT_TRIGGER_CLASS = houseTables.sortTrigger
const HOUSE_DRILLDOWN_TOGGLE_MUTED_CLASS = publicationsHouseDrilldown.toggleButtonMuted
const HOUSE_TOGGLE_TRACK_CLASS = publicationsHouseMotion.toggleTrack
const HOUSE_TOGGLE_THUMB_CLASS = publicationsHouseMotion.toggleThumb
const HOUSE_TOGGLE_BUTTON_CLASS = publicationsHouseMotion.toggleButton
const HOUSE_METRIC_TOGGLE_TRACK_CLASS = HOUSE_TOGGLE_TRACK_CLASS
const COLLABORATORS_PAGE_SIZE_DEFAULT = 50
const AFFILIATION_LOOKUP_DEBOUNCE_MS = 60
const HEATMAP_TOP_CELL_LIMIT = 24
const HEATMAP_OTHERS_KEY = '__others__'
const COLLABORATOR_DRILLDOWN_TABS: Array<{ id: CollaboratorDrilldownTab; label: string }> = [
  { id: 'details', label: 'Details' },
  { id: 'history', label: 'Collaboration history' },
  { id: 'actions', label: 'Actions' },
]
const COLLABORATOR_SALUTATION_OPTIONS = [
  'Dr',
  'Professor',
  'Mr',
  'Ms',
  'Mrs',
  'Miss',
  'Mx',
  'Associate Professor',
  'Assistant Professor',
  'Reader',
  'Senior Lecturer',
  'Lecturer',
  'Research Fellow',
  'Postdoctoral Researcher',
  'Professor Emeritus',
  'Sir',
  'Dame',
  'Lord',
  'Lady',
  'Rev',
  'Hon',
] as const
const COLLABORATOR_HISTORY_WINDOW_OPTIONS: Array<{ value: CollaboratorHistoryWindowMode; label: string }> = [
  { value: '1y', label: '1y' },
  { value: '3y', label: '3y' },
  { value: '5y', label: '5y' },
  { value: 'all', label: 'Life' },
]
const COLLABORATION_TABLE_COLUMN_ORDER: CollaborationTableColumnKey[] = [
  'name',
  'institution',
  'relationship',
  'activity',
  'last_year',
  'coauthored_works',
  'collaboration_score',
]

function isCollaborationTableColumnKey(value: string): value is CollaborationTableColumnKey {
  return (COLLABORATION_TABLE_COLUMN_ORDER as string[]).includes(value)
}
const COLLABORATION_TABLE_COLUMN_DEFINITIONS: Record<
  CollaborationTableColumnKey,
  { label: string; headerClassName?: string; cellClassName?: string }
> = {
  name: { label: 'Name', headerClassName: 'text-left', cellClassName: 'align-top font-medium whitespace-normal break-words leading-tight' },
  institution: { label: 'Institution', headerClassName: 'text-left', cellClassName: 'align-top whitespace-normal break-words leading-tight' },
  relationship: { label: 'Relationship', headerClassName: 'text-center', cellClassName: 'align-top text-center whitespace-nowrap' },
  activity: { label: 'Activity', headerClassName: 'text-center', cellClassName: 'align-top text-center whitespace-nowrap' },
  last_year: { label: 'Last year', headerClassName: 'text-center', cellClassName: 'align-top text-center whitespace-nowrap' },
  coauthored_works: { label: 'Coauthored works', headerClassName: 'text-center', cellClassName: 'align-top text-center whitespace-nowrap' },
  collaboration_score: { label: 'Collaboration score', headerClassName: 'text-center', cellClassName: 'align-top text-center whitespace-nowrap tabular-nums' },
}
const COLLABORATION_TABLE_COLUMN_SORT_FIELD: Partial<Record<CollaborationTableColumnKey, CollaborationSortField>> = {
  name: 'name',
  relationship: 'relationship_tier',
  activity: 'activity_status',
  last_year: 'last_collaboration_year',
  coauthored_works: 'works',
  collaboration_score: 'strength',
}
const COLLABORATION_TABLE_COLUMN_DEFAULTS: Record<
  CollaborationTableColumnKey,
  CollaborationTableColumnPreference
> = {
  name: { visible: true, width: 260 },
  institution: { visible: true, width: 240 },
  relationship: { visible: true, width: 170 },
  activity: { visible: true, width: 150 },
  last_year: { visible: true, width: 120 },
  coauthored_works: { visible: true, width: 160 },
  collaboration_score: { visible: true, width: 170 },
}
const COLLABORATION_TABLE_COLUMN_MIN_WIDTH: Record<CollaborationTableColumnKey, number> = {
  name: 180,
  institution: 180,
  relationship: 130,
  activity: 120,
  last_year: 96,
  coauthored_works: 120,
  collaboration_score: 130,
}
const COLLABORATION_TABLE_COLUMN_MAX_WIDTH: Record<CollaborationTableColumnKey, number> = {
  name: 520,
  institution: 460,
  relationship: 260,
  activity: 240,
  last_year: 180,
  coauthored_works: 220,
  collaboration_score: 240,
}
const COLLABORATION_TABLE_COLUMN_HARD_MIN = 56
const COLLABORATION_TABLE_LAYOUT_FALLBACK_WIDTH = 1080
const ENABLE_COLLABORATION_DEV_MOCKS = import.meta.env.DEV && import.meta.env.VITE_USE_COLLABORATION_MOCKS === 'true'

function normalizeSalutationToken(value: string): string {
  return String(value || '').trim().replace(/\.+$/g, '').toLowerCase()
}

function sanitizeAffiliation(value: string | null | undefined): string {
  return String(value || '').trim().replace(/\s+/g, ' ')
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

function mapAffiliationSuggestionItem(raw: AffiliationSuggestionItemPayload): AffiliationSuggestionItem | null {
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
    openalexId: sanitizeAffiliation(raw.openalex_id) || null,
    countryCode,
    countryName,
    city,
    region,
    address,
    postalCode,
    source:
      raw.source === 'openai' ||
      raw.source === 'ror' ||
      raw.source === 'openstreetmap' ||
      raw.source === 'clearbit'
        ? raw.source
        : 'openalex',
  }
}

function parseCollaboratorFullName(value: string): Pick<CollaboratorFormState, 'salutation' | 'first_name' | 'middle_initial' | 'surname'> {
  const clean = String(value || '').trim().replace(/\s+/g, ' ')
  if (!clean) {
    return {
      salutation: '',
      first_name: '',
      middle_initial: '',
      surname: '',
    }
  }

  const rawTokens = clean.split(' ')
  let salutation = ''
  let nameTokens = [...rawTokens]
  const salutationOptionsByLength = [...COLLABORATOR_SALUTATION_OPTIONS].sort(
    (left, right) => right.split(/\s+/).length - left.split(/\s+/).length,
  )

  for (const option of salutationOptionsByLength) {
    const optionTokens = option.split(/\s+/)
    const candidate = rawTokens.slice(0, optionTokens.length)
    if (candidate.length !== optionTokens.length) {
      continue
    }
    const isMatch = candidate.every((token, index) => (
      normalizeSalutationToken(token) === normalizeSalutationToken(optionTokens[index])
    ))
    if (isMatch) {
      salutation = option
      nameTokens = rawTokens.slice(optionTokens.length)
      break
    }
  }

  if (nameTokens.length === 0) {
    return {
      salutation,
      first_name: '',
      middle_initial: '',
      surname: '',
    }
  }

  if (nameTokens.length === 1) {
    return {
      salutation,
      first_name: '',
      middle_initial: '',
      surname: nameTokens[0],
    }
  }

  const first_name = nameTokens[0] || ''
  const surname = nameTokens[nameTokens.length - 1] || ''
  const middleTokens = nameTokens.slice(1, -1)
  const middle_initial = middleTokens
    .filter((token) => /^[A-Za-z]\.?$/.test(token))
    .map((token) => token.replace(/\./g, '').toUpperCase())
    .filter(Boolean)
    .join(' ')

  return {
    salutation,
    first_name,
    middle_initial,
    surname,
  }
}

function toFormState(value: CollaboratorPayload): CollaboratorFormState {
  const hasContactName = Boolean(
    value.contact_salutation ||
    value.contact_first_name ||
    value.contact_middle_initial ||
    value.contact_surname,
  )
  const parsedName = hasContactName
    ? {
        salutation: value.contact_salutation || '',
        first_name: value.contact_first_name || '',
        middle_initial: value.contact_middle_initial || '',
        surname: value.contact_surname || '',
      }
    : parseCollaboratorFullName(value.full_name)
  return {
    salutation: parsedName.salutation,
    first_name: parsedName.first_name,
    middle_initial: parsedName.middle_initial,
    surname: parsedName.surname,
    preferred_name: value.preferred_name || '',
    email: value.contact_email || '',
    secondary_email: value.contact_secondary_email || '',
    orcid_id: value.orcid_id || '',
    openalex_author_id: value.openalex_author_id || '',
    primary_institution: value.contact_primary_institution || '',
    secondary_institution: value.contact_secondary_institution || '',
    primary_institution_openalex_id: value.contact_primary_institution_openalex_id || '',
    secondary_institution_openalex_id: value.contact_secondary_institution_openalex_id || '',
    primary_affiliation_department: value.contact_primary_affiliation_department || '',
    primary_affiliation_address_line_1: value.contact_primary_affiliation_address_line_1 || '',
    primary_affiliation_city: value.contact_primary_affiliation_city || '',
    primary_affiliation_region: value.contact_primary_affiliation_region || '',
    primary_affiliation_postal_code: value.contact_primary_affiliation_postal_code || '',
    primary_affiliation_country: value.contact_primary_affiliation_country || '',
    secondary_affiliation_department: value.contact_secondary_affiliation_department || '',
    secondary_affiliation_address_line_1: value.contact_secondary_affiliation_address_line_1 || '',
    secondary_affiliation_city: value.contact_secondary_affiliation_city || '',
    secondary_affiliation_region: value.contact_secondary_affiliation_region || '',
    secondary_affiliation_postal_code: value.contact_secondary_affiliation_postal_code || '',
    secondary_affiliation_country: value.contact_secondary_affiliation_country || '',
    department: value.department || '',
    country: value.contact_country || value.country || '',
    current_position: value.current_position || '',
    research_domains: (value.research_domains || []).join(', '),
    notes: value.notes || '',
  }
}

function trimmedOrNull(value: string | null | undefined): string | null {
  const clean = String(value || '').trim()
  return clean || null
}

function sanitizedAffiliationOrNull(value: string | null | undefined): string | null {
  const clean = sanitizeAffiliation(value)
  return clean || null
}

function toCollaboratorContactUpdateInput(form: CollaboratorFormState): CollaboratorContactUpdateInput {
  return {
    contact_salutation: trimmedOrNull(form.salutation),
    contact_first_name: trimmedOrNull(form.first_name),
    contact_middle_initial: trimmedOrNull(form.middle_initial)?.toUpperCase() || null,
    contact_surname: trimmedOrNull(form.surname),
    contact_email: trimmedOrNull(form.email),
    contact_secondary_email: trimmedOrNull(form.secondary_email),
    contact_primary_institution: sanitizedAffiliationOrNull(form.primary_institution),
    contact_secondary_institution: sanitizedAffiliationOrNull(form.secondary_institution),
    contact_primary_institution_openalex_id: trimmedOrNull(form.primary_institution_openalex_id),
    contact_secondary_institution_openalex_id: trimmedOrNull(form.secondary_institution_openalex_id),
    contact_primary_affiliation_department: trimmedOrNull(form.primary_affiliation_department),
    contact_primary_affiliation_address_line_1: trimmedOrNull(form.primary_affiliation_address_line_1),
    contact_primary_affiliation_city: trimmedOrNull(form.primary_affiliation_city),
    contact_primary_affiliation_region: trimmedOrNull(form.primary_affiliation_region),
    contact_primary_affiliation_postal_code: trimmedOrNull(form.primary_affiliation_postal_code),
    contact_primary_affiliation_country: trimmedOrNull(form.primary_affiliation_country),
    contact_secondary_affiliation_department: trimmedOrNull(form.secondary_affiliation_department),
    contact_secondary_affiliation_address_line_1: trimmedOrNull(form.secondary_affiliation_address_line_1),
    contact_secondary_affiliation_city: trimmedOrNull(form.secondary_affiliation_city),
    contact_secondary_affiliation_region: trimmedOrNull(form.secondary_affiliation_region),
    contact_secondary_affiliation_postal_code: trimmedOrNull(form.secondary_affiliation_postal_code),
    contact_secondary_affiliation_country: trimmedOrNull(form.secondary_affiliation_country),
  }
}

function serializeCollaboratorContactUpdateInput(input: CollaboratorContactUpdateInput): string {
  return JSON.stringify(input)
}

function composeCollaboratorContactName(value: {
  salutation?: string | null
  first_name?: string | null
  middle_initial?: string | null
  surname?: string | null
}): string {
  return [
    String(value.salutation || '').trim(),
    String(value.first_name || '').trim(),
    String(value.middle_initial || '').trim(),
    String(value.surname || '').trim(),
  ].filter(Boolean).join(' ')
}

function collaboratorDisplayName(value: Pick<
  CollaboratorPayload,
  'full_name' | 'contact_salutation' | 'contact_first_name' | 'contact_middle_initial' | 'contact_surname'
>): string {
  return composeCollaboratorContactName({
    salutation: value.contact_salutation,
    first_name: value.contact_first_name,
    middle_initial: value.contact_middle_initial,
    surname: value.contact_surname,
  }) || value.full_name
}

function collaboratorDisplayInstitution(value: Pick<
  CollaboratorPayload,
  'primary_institution' | 'contact_primary_institution' | 'institution_labels'
>): string {
  return String(value.contact_primary_institution || '').trim()
    || value.institution_labels?.join(' • ')
    || String(value.primary_institution || '').trim()
}

function collaboratorAuthorAffiliations(form: Pick<
  CollaboratorFormState,
  | 'primary_institution'
  | 'secondary_institution'
  | 'primary_institution_openalex_id'
  | 'secondary_institution_openalex_id'
>): Array<{
  slot: CollaboratorAffiliationSlotKey
  label: string
  isPrimary: boolean
  openalexId: string
}> {
  const primary = sanitizeAffiliation(form.primary_institution)
  const secondary = sanitizeAffiliation(form.secondary_institution)
  const items: Array<{
    slot: CollaboratorAffiliationSlotKey
    label: string
    isPrimary: boolean
    openalexId: string
  }> = []
  if (primary) {
    items.push({
      slot: 'primary',
      label: primary,
      isPrimary: true,
      openalexId: sanitizeAffiliation(form.primary_institution_openalex_id),
    })
  }
  if (secondary && secondary.toLowerCase() !== primary.toLowerCase()) {
    items.push({
      slot: 'secondary',
      label: secondary,
      isPrimary: false,
      openalexId: sanitizeAffiliation(form.secondary_institution_openalex_id),
    })
  }
  return items
}

function collaboratorBylineDraftFromForm(
  form: CollaboratorFormState,
  slot: CollaboratorAffiliationSlotKey,
): CollaboratorAffiliationBylineDraft {
  if (slot === 'secondary') {
    return {
      department: form.secondary_affiliation_department,
      address_line_1: form.secondary_affiliation_address_line_1,
      city: form.secondary_affiliation_city,
      region: form.secondary_affiliation_region,
      postal_code: form.secondary_affiliation_postal_code,
      country: form.secondary_affiliation_country,
    }
  }
  return {
    department: form.primary_affiliation_department,
    address_line_1: form.primary_affiliation_address_line_1,
    city: form.primary_affiliation_city,
    region: form.primary_affiliation_region,
    postal_code: form.primary_affiliation_postal_code,
    country: form.primary_affiliation_country,
  }
}

function collaboratorIdentityDraftFromForm(form: CollaboratorFormState): CollaboratorIdentityDraft {
  return {
    salutation: form.salutation,
    first_name: form.first_name,
    middle_initial: form.middle_initial,
    surname: form.surname,
  }
}

function collaboratorBylineDraftFromSuggestion(suggestion: AffiliationSuggestionItem): CollaboratorAffiliationBylineDraft {
  return {
    department: '',
    address_line_1: sanitizeAffiliation(suggestion.address),
    city: sanitizeAffiliation(suggestion.city),
    region: sanitizeAffiliation(suggestion.region),
    postal_code: sanitizeAffiliation(suggestion.postalCode),
    country: sanitizeAffiliation(suggestion.countryName),
  }
}

function collaboratorInstitutionSlotNeedsHydration(
  form: CollaboratorFormState,
  slot: CollaboratorAffiliationSlotKey,
): boolean {
  const institution = sanitizeAffiliation(slot === 'secondary' ? form.secondary_institution : form.primary_institution)
  const openalexId = sanitizeAffiliation(slot === 'secondary' ? form.secondary_institution_openalex_id : form.primary_institution_openalex_id)
  const draft = collaboratorBylineDraftFromForm(form, slot)
  const hasAddress = Boolean(
    sanitizeAffiliation(draft.address_line_1)
    || sanitizeAffiliation(draft.city)
    || sanitizeAffiliation(draft.region)
    || sanitizeAffiliation(draft.postal_code)
    || sanitizeAffiliation(draft.country),
  )
  return Boolean(institution) && (!openalexId || !hasAddress)
}

function institutionSuggestionMatchesValue(
  suggestion: AffiliationSuggestionItem | null | undefined,
  value: string,
): boolean {
  return Boolean(suggestion) && normalizeInstitutionKey(suggestion?.name || '') === normalizeInstitutionKey(value)
}

function applyInstitutionResolutionToForm(
  form: CollaboratorFormState,
  slot: CollaboratorAffiliationSlotKey,
  resolvedInstitution: string,
  openalexId: string,
  metadata: CollaboratorAffiliationBylineDraft,
): CollaboratorFormState {
  if (slot === 'secondary') {
    return {
      ...form,
      secondary_institution: resolvedInstitution,
      secondary_institution_openalex_id: openalexId,
      secondary_affiliation_department: form.secondary_affiliation_department,
      secondary_affiliation_address_line_1: metadata.address_line_1,
      secondary_affiliation_city: metadata.city,
      secondary_affiliation_region: metadata.region,
      secondary_affiliation_postal_code: metadata.postal_code,
      secondary_affiliation_country: metadata.country,
    }
  }
  return {
    ...form,
    primary_institution: resolvedInstitution,
    primary_institution_openalex_id: openalexId,
    primary_affiliation_department: form.primary_affiliation_department,
    primary_affiliation_address_line_1: metadata.address_line_1,
    primary_affiliation_city: metadata.city,
    primary_affiliation_region: metadata.region,
    primary_affiliation_postal_code: metadata.postal_code,
    primary_affiliation_country: metadata.country,
  }
}

function formatCollaboratorAffiliationByline(input: {
  institution: string
  draft: CollaboratorAffiliationBylineDraft
}): string {
  return [
    sanitizeAffiliation(input.draft.department),
    sanitizeAffiliation(input.institution),
    sanitizeAffiliation(input.draft.address_line_1),
    sanitizeAffiliation(input.draft.city),
    sanitizeAffiliation(input.draft.region),
    sanitizeAffiliation(input.draft.postal_code),
    sanitizeAffiliation(input.draft.country),
  ].filter(Boolean).join(', ')
}

function rawCollaboratorInstitutionCandidates(value: Pick<CollaboratorPayload, 'institution_labels' | 'primary_institution'>): string[] {
  const seen = new Set<string>()
  const output: string[] = []
  for (const raw of [...(value.institution_labels || []), value.primary_institution || '']) {
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
    if (output.length >= 2) {
      break
    }
  }
  return output
}

function normalizeInstitutionKey(value: string): string {
  return sanitizeAffiliation(value)
    .toLowerCase()
    .replace(/&/g, 'and')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
}

function pickClearOpenAlexInstitutionMatch(
  candidate: string,
  suggestions: AffiliationSuggestionItem[],
): AffiliationSuggestionItem | null {
  const normalizedCandidate = normalizeInstitutionKey(candidate)
  if (!normalizedCandidate) {
    return null
  }
  const exactOpenAlexMatches = suggestions.filter((item) => (
    item.source === 'openalex'
    && Boolean(item.openalexId)
    && normalizeInstitutionKey(item.name) === normalizedCandidate
  ))
  return exactOpenAlexMatches.length === 1 ? exactOpenAlexMatches[0] : null
}

function openAlexIdentityKey(value: string | null | undefined): string {
  const clean = String(value || '').trim()
  if (!clean) {
    return ''
  }
  const normalizedProtocol = clean.replace(/^http:\/\//i, 'https://')
  const urlMatch = normalizedProtocol.match(/^https:\/\/openalex\.org\/(.+)$/i)
  const suffix = (urlMatch ? urlMatch[1] : normalizedProtocol).trim().replace(/\/+$/, '')
  if (!suffix) {
    return ''
  }
  if (/^a\d+$/i.test(suffix)) {
    return suffix.toUpperCase()
  }
  return suffix.toLowerCase()
}

function collaboratorIdentityTokens(item: CollaboratorPayload): string[] {
  const tokens: string[] = []
  const openAlexId = openAlexIdentityKey(item.openalex_author_id)
  if (openAlexId) {
    tokens.push(`oa:${openAlexId}`)
  }
  const email = String(item.email || '').trim().toLowerCase()
  if (email) {
    tokens.push(`email:${email}`)
  }
  const name = String(item.full_name || '').trim().toLowerCase().replace(/\s+/g, ' ')
  if (name) {
    tokens.push(`name:${name}`)
  }
  return tokens
}

/** Parse a name into [surname, givenParts]. Handles "Last, First" and "First Last" formats. */
const SURNAME_PARTICLES = new Set([
  'van', 'von', 'de', 'den', 'der', 'del', 'della', 'di', 'du',
  'la', 'le', 'el', 'al', 'bin', 'ibn', 'het', 'ten', 'ter', 'op',
])

function parseNameParts(name: string): [string, string[]] {
  const clean = String(name || '').trim().replace(/\s+/g, ' ')
  if (!clean) return ['', []]
  if (clean.includes(',')) {
    const [surnameRaw, ...rest] = clean.split(',')
    const surname = surnameRaw.trim().toLowerCase()
    const given = rest.join(' ').trim().toLowerCase().split(/\s+/).map((p) => p.replace(/\.$/, '')).filter(Boolean)
    return [surname, given]
  }
  const tokens = clean.toLowerCase().split(/\s+/)
  if (tokens.length <= 1) return [tokens[0] || '', []]
  const stripped = tokens.map((t) => t.replace(/\.$/, ''))
  // Detect trailing single-letter initials preceded by compound surname particles
  let trailingStart = stripped.length
  while (trailingStart > 0 && stripped[trailingStart - 1].length === 1) {
    trailingStart--
  }
  if (trailingStart < stripped.length && trailingStart >= 2) {
    const preceding = stripped.slice(0, trailingStart)
    if (preceding.some((t) => SURNAME_PARTICLES.has(t))) {
      return [preceding.join(' '), stripped.slice(trailingStart).filter(Boolean)]
    }
  }
  // Standard: surname is last token plus any preceding particles
  let surnameStart = stripped.length - 1
  while (surnameStart > 0 && SURNAME_PARTICLES.has(stripped[surnameStart - 1])) {
    surnameStart--
  }
  return [stripped.slice(surnameStart).join(' '), stripped.slice(0, surnameStart).filter(Boolean)]
}

/** SequenceMatcher-style similarity ratio between two strings (simple LCS approach). */
function stringSimilarity(a: string, b: string): number {
  if (!a || !b) return 0
  if (a === b) return 1
  const la = a.length
  const lb = b.length
  // Use longest common subsequence ratio (matches Python's SequenceMatcher behaviour closely enough)
  const dp: number[][] = Array.from({ length: la + 1 }, () => Array(lb + 1).fill(0) as number[])
  for (let i = 1; i <= la; i++) {
    for (let j = 1; j <= lb; j++) {
      dp[i][j] = a[i - 1] === b[j - 1] ? dp[i - 1][j - 1] + 1 : Math.max(dp[i - 1][j], dp[i][j - 1])
    }
  }
  return (2 * dp[la][lb]) / (la + lb)
}

/** Check if two names could be the same person (surname + initial match). */
function nameInitialCompatible(a: string, b: string): boolean {
  const [surnameA, givenA] = parseNameParts(a)
  const [surnameB, givenB] = parseNameParts(b)
  if (!surnameA || !surnameB) return false
  if (surnameA !== surnameB && stringSimilarity(surnameA, surnameB) < 0.85) return false
  if (!givenA.length || !givenB.length) return false
  if (givenA[0][0] !== givenB[0][0]) return false
  const shorter = Math.min(givenA.length, givenB.length)
  for (let i = 1; i < shorter; i++) {
    const pa = givenA[i]
    const pb = givenB[i]
    if (pa.length > 1 && pb.length > 1) {
      if (stringSimilarity(pa, pb) < 0.7) return false
    } else if (pa[0] !== pb[0]) {
      return false
    }
  }
  return true
}

function relationshipTone(value: string): 'positive' | 'yellow' | 'intermediate' | 'negative' {
  if (value === 'CORE') {
    return 'positive'
  }
  if (value === 'REGULAR') {
    return 'yellow'
  }
  if (value === 'OCCASIONAL') {
    return 'intermediate'
  }
  return 'negative'
}

function activityTone(value: string): 'positive' | 'yellow' | 'intermediate' | 'negative' {
  if (value === 'ACTIVE') {
    return 'positive'
  }
  if (value === 'RECENT') {
    return 'yellow'
  }
  if (value === 'DORMANT') {
    return 'intermediate'
  }
  return 'negative'
}

function collaboratorHistoryWindowThumbStyle(mode: CollaboratorHistoryWindowMode): CSSProperties {
  if (mode === 'all') {
    return {
      width: '28%',
      left: '72%',
      willChange: 'left,width',
    }
  }
  if (mode === '5y') {
    return {
      width: '24%',
      left: '48%',
      willChange: 'left,width',
    }
  }
  if (mode === '3y') {
    return {
      width: '24%',
      left: '24%',
      willChange: 'left,width',
    }
  }
  return {
    width: '24%',
    left: '0%',
    willChange: 'left,width',
  }
}

function collaborationStrengthTone(rawScore: number): string {
  if (rawScore <= 0) {
    return 'bg-[hsl(var(--tone-neutral-100))] text-[hsl(var(--tone-neutral-700))]'
  }
  if (rawScore >= 0.75) {
    return 'bg-[hsl(var(--tone-positive-600))] text-white'
  }
  if (rawScore >= 0.6) {
    return 'bg-[hsl(var(--tone-positive-400))] text-white'
  }
  if (rawScore >= 0.5) {
    return 'bg-[hsl(var(--tone-positive-200))] text-[hsl(var(--tone-positive-900))]'
  }
  if (rawScore >= 0.4) {
    return 'bg-[hsl(var(--tone-positive-100))] text-[hsl(var(--tone-positive-800))]'
  }
  return 'bg-[hsl(var(--tone-neutral-100))] text-[hsl(var(--tone-neutral-700))]'
}

function relationshipFromClassification(
  classification: CollaboratorPayload['metrics']['classification'],
): 'CORE' | 'REGULAR' | 'OCCASIONAL' | 'UNCLASSIFIED' {
  if (classification === 'CORE') {
    return 'CORE'
  }
  if (classification === 'ACTIVE') {
    return 'REGULAR'
  }
  if (classification === 'OCCASIONAL' || classification === 'HISTORIC') {
    return 'OCCASIONAL'
  }
  return 'UNCLASSIFIED'
}

function activityFromYear(
  lastCollaborationYear: number | null,
  nowYear: number,
): 'ACTIVE' | 'RECENT' | 'DORMANT' | 'HISTORIC' | 'UNCLASSIFIED' {
  if (typeof lastCollaborationYear !== 'number') {
    return 'UNCLASSIFIED'
  }
  const delta = nowYear - lastCollaborationYear
  if (delta <= 2) {
    return 'ACTIVE'
  }
  if (delta === 3) {
    return 'RECENT'
  }
  if (delta === 4) {
    return 'DORMANT'
  }
  return 'HISTORIC'
}

function resolveRelationshipTier(
  metrics: CollaboratorPayload['metrics'],
): 'CORE' | 'REGULAR' | 'OCCASIONAL' | 'UNCLASSIFIED' {
  if (
    metrics.relationship_tier === 'CORE' ||
    metrics.relationship_tier === 'REGULAR' ||
    metrics.relationship_tier === 'OCCASIONAL' ||
    metrics.relationship_tier === 'UNCLASSIFIED'
  ) {
    return metrics.relationship_tier
  }
  if (Number(metrics.coauthored_works_count || 0) <= 0) {
    return 'UNCLASSIFIED'
  }
  return relationshipFromClassification(metrics.classification)
}

function resolveActivityStatus(
  metrics: CollaboratorPayload['metrics'],
): 'ACTIVE' | 'RECENT' | 'DORMANT' | 'HISTORIC' | 'UNCLASSIFIED' {
  if (
    metrics.activity_status === 'ACTIVE' ||
    metrics.activity_status === 'RECENT' ||
    metrics.activity_status === 'DORMANT' ||
    metrics.activity_status === 'HISTORIC' ||
    metrics.activity_status === 'UNCLASSIFIED'
  ) {
    return metrics.activity_status
  }
  if (Number(metrics.coauthored_works_count || 0) <= 0) {
    return 'UNCLASSIFIED'
  }
  const nowYear = new Date().getFullYear()
  const byYear = activityFromYear(metrics.last_collaboration_year, nowYear)
  if (byYear !== 'UNCLASSIFIED') {
    return byYear
  }
  if (metrics.classification === 'ACTIVE') {
    return 'ACTIVE'
  }
  if (metrics.classification === 'HISTORIC') {
    return 'HISTORIC'
  }
  if (metrics.classification === 'CORE' || metrics.classification === 'OCCASIONAL') {
    return 'RECENT'
  }
  return 'UNCLASSIFIED'
}

function heatmapTone(value: number, quantiles: HeatmapQuantiles | null): string {
  if (!quantiles || quantiles.max <= 0 || value <= 0) {
    return 'bg-muted'
  }
  if (value <= quantiles.q20) {
    return 'bg-emerald-100 text-emerald-900'
  }
  if (value <= quantiles.q40) {
    return 'bg-emerald-200 text-emerald-900'
  }
  if (value <= quantiles.q60) {
    return 'bg-emerald-300 text-emerald-950'
  }
  if (value <= quantiles.q80) {
    return 'bg-emerald-500 text-white'
  }
  return 'bg-emerald-700 text-white'
}

function heatmapMetricLabel(metric: HeatmapMetric): string {
  if (metric === 'collaborators') {
    return 'Collaborator count'
  }
  if (metric === 'works') {
    return 'Coauthored works'
  }
  if (metric === 'strength') {
    return 'Strength score'
  }
  if (metric === 'citations_last_12m') {
    return 'Citations (12m)'
  }
  return 'Recency score'
}

function heatmapMetricValue(item: CollaboratorPayload, metric: HeatmapMetric, nowYear: number): number {
  if (metric === 'collaborators') {
    return 1
  }
  if (metric === 'works') {
    return Math.max(0, Number(item.metrics.coauthored_works_count || 0))
  }
  if (metric === 'strength') {
    return Math.max(0, Number(item.metrics.collaboration_strength_score || 0))
  }
  if (metric === 'citations_last_12m') {
    return Math.max(0, Number(item.metrics.citations_last_12m || 0))
  }
  const lastYear = Number(item.metrics.last_collaboration_year || 0)
  if (!lastYear) {
    return 0
  }
  const age = Math.max(0, nowYear - lastYear)
  return Math.max(0, 6 - age)
}

function formatHeatmapMetricValue(value: number, metric: HeatmapMetric): string {
  if (metric === 'strength') {
    return value.toFixed(1)
  }
  return Math.round(value).toLocaleString('en-GB')
}

function normalizeHeatmapBucket(value: string | null | undefined, fallback: string): string {
  return (value || fallback).trim() || fallback
}

function parsePositiveInteger(value: string | null | undefined, fallback: number): number {
  const parsed = Number(value || '')
  if (!Number.isFinite(parsed)) {
    return fallback
  }
  return Math.max(1, Math.floor(parsed))
}

function resolveCollaborationFetchPageSize(pageSize: CollaborationTablePageSize): number {
  return pageSize === 'all' ? COLLABORATORS_PAGE_SIZE_DEFAULT : pageSize
}

function isCollaboratorsListComplete(listing: CollaboratorsListPayload | null | undefined): boolean {
  if (!listing) {
    return false
  }
  if (listing.has_more) {
    return false
  }
  const total = Math.max(0, Number(listing.total || 0))
  return total === 0 || listing.items.length >= total
}

function normalizeSortValue(value: string | null | undefined): CollaborationSortField {
  const clean = String(value || '').trim()
  if (
    clean === 'works' ||
    clean === 'last_collaboration_year' ||
    clean === 'strength' ||
    clean === 'relationship_tier' ||
    clean === 'activity_status'
  ) {
    return clean
  }
  return 'strength'
}

function relationshipSortRank(value: string): number {
  if (value === 'CORE') {
    return 3
  }
  if (value === 'REGULAR') {
    return 2
  }
  if (value === 'OCCASIONAL') {
    return 1
  }
  return 0
}

function activitySortRank(value: string): number {
  if (value === 'ACTIVE') {
    return 4
  }
  if (value === 'RECENT') {
    return 3
  }
  if (value === 'DORMANT') {
    return 2
  }
  if (value === 'HISTORIC') {
    return 1
  }
  return 0
}

function collaborationSortLabel(value: CollaborationSortField): string {
  if (value === 'name') {
    return 'Name'
  }
  if (value === 'works') {
    return 'Coauthored works'
  }
  if (value === 'last_collaboration_year') {
    return 'Last collaboration year'
  }
  if (value === 'strength') {
    return 'Strength score'
  }
  if (value === 'relationship_tier') {
    return 'Relationship'
  }
  return 'Activity'
}

function clampCollaborationTableColumnWidth(
  column: CollaborationTableColumnKey,
  value: number,
): number {
  const min = COLLABORATION_TABLE_COLUMN_MIN_WIDTH[column]
  const max = COLLABORATION_TABLE_COLUMN_MAX_WIDTH[column]
  return Math.max(min, Math.min(max, Math.round(Number(value) || COLLABORATION_TABLE_COLUMN_DEFAULTS[column].width)))
}

function collaborationTableColumnsEqual(
  left: Record<CollaborationTableColumnKey, CollaborationTableColumnPreference>,
  right: Record<CollaborationTableColumnKey, CollaborationTableColumnPreference>,
): boolean {
  return COLLABORATION_TABLE_COLUMN_ORDER.every((column) => (
    left[column].visible === right[column].visible &&
    left[column].width === right[column].width
  ))
}

function clampCollaborationTableDistributedResize(input: {
  column: CollaborationTableColumnKey
  visibleColumns: CollaborationTableColumnKey[]
  startWidths: Partial<Record<CollaborationTableColumnKey, number>>
  deltaPx: number
}): Partial<Record<CollaborationTableColumnKey, number>> {
  const primaryIndex = input.visibleColumns.indexOf(input.column)
  if (primaryIndex < 0 || input.visibleColumns.length <= 1) {
    return input.startWidths
  }

  const normalizedWidths: Partial<Record<CollaborationTableColumnKey, number>> = {}
  for (const key of input.visibleColumns) {
    normalizedWidths[key] = clampCollaborationTableColumnWidth(
      key,
      Number(input.startWidths[key] ?? COLLABORATION_TABLE_COLUMN_DEFAULTS[key].width),
    )
  }

  const primaryStart = Number(
    normalizedWidths[input.column] ?? COLLABORATION_TABLE_COLUMN_DEFAULTS[input.column].width,
  )
  const requestedDelta = Math.round(input.deltaPx)
  if (!requestedDelta) {
    return normalizedWidths
  }

  const rightColumns = input.visibleColumns.slice(primaryIndex + 1)
  const leftColumns = input.visibleColumns.slice(0, primaryIndex).reverse()
  const compensationOrder = [...rightColumns, ...leftColumns]
  if (compensationOrder.length === 0) {
    return normalizedWidths
  }

  const maxPrimaryGrow = Math.min(
    COLLABORATION_TABLE_COLUMN_MAX_WIDTH[input.column] - primaryStart,
    compensationOrder.reduce(
      (sum, key) => sum + Math.max(0, Number(normalizedWidths[key] ?? 0) - COLLABORATION_TABLE_COLUMN_MIN_WIDTH[key]),
      0,
    ),
  )
  const maxPrimaryShrink = Math.min(
    primaryStart - COLLABORATION_TABLE_COLUMN_MIN_WIDTH[input.column],
    compensationOrder.reduce(
      (sum, key) => sum + Math.max(0, COLLABORATION_TABLE_COLUMN_MAX_WIDTH[key] - Number(normalizedWidths[key] ?? 0)),
      0,
    ),
  )

  let appliedDelta = requestedDelta
  if (appliedDelta > 0) {
    appliedDelta = Math.min(appliedDelta, maxPrimaryGrow)
  } else {
    appliedDelta = -Math.min(Math.abs(appliedDelta), maxPrimaryShrink)
  }
  if (!appliedDelta) {
    return normalizedWidths
  }

  let remaining = Math.abs(appliedDelta)
  if (appliedDelta > 0) {
    for (const key of compensationOrder) {
      if (!remaining) {
        break
      }
      const current = Number(normalizedWidths[key] ?? COLLABORATION_TABLE_COLUMN_DEFAULTS[key].width)
      const reducible = Math.max(0, current - COLLABORATION_TABLE_COLUMN_MIN_WIDTH[key])
      if (!reducible) {
        continue
      }
      const step = Math.min(reducible, remaining)
      normalizedWidths[key] = current - step
      remaining -= step
    }
    const actualDelta = Math.abs(appliedDelta) - remaining
    normalizedWidths[input.column] = primaryStart + actualDelta
  } else {
    for (const key of compensationOrder) {
      if (!remaining) {
        break
      }
      const current = Number(normalizedWidths[key] ?? COLLABORATION_TABLE_COLUMN_DEFAULTS[key].width)
      const growable = Math.max(0, COLLABORATION_TABLE_COLUMN_MAX_WIDTH[key] - current)
      if (!growable) {
        continue
      }
      const step = Math.min(growable, remaining)
      normalizedWidths[key] = current + step
      remaining -= step
    }
    const actualDelta = Math.abs(appliedDelta) - remaining
    normalizedWidths[input.column] = primaryStart - actualDelta
  }

  for (const key of input.visibleColumns) {
    normalizedWidths[key] = clampCollaborationTableColumnWidth(
      key,
      Number(normalizedWidths[key] ?? COLLABORATION_TABLE_COLUMN_DEFAULTS[key].width),
    )
  }
  return normalizedWidths
}

function clampCollaborationTableColumnsToAvailableWidth(input: {
  columns: Record<CollaborationTableColumnKey, CollaborationTableColumnPreference>
  columnOrder: CollaborationTableColumnKey[]
  availableWidth: number
}): Record<CollaborationTableColumnKey, CollaborationTableColumnPreference> {
  const next: Record<CollaborationTableColumnKey, CollaborationTableColumnPreference> = {
    name: { ...input.columns.name },
    institution: { ...input.columns.institution },
    relationship: { ...input.columns.relationship },
    activity: { ...input.columns.activity },
    last_year: { ...input.columns.last_year },
    coauthored_works: { ...input.columns.coauthored_works },
    collaboration_score: { ...input.columns.collaboration_score },
  }
  const visibleColumns = input.columnOrder.filter((column) => next[column].visible)
  if (visibleColumns.length === 0) {
    return next
  }

  const containerBudget = Math.max(
    visibleColumns.length * COLLABORATION_TABLE_COLUMN_HARD_MIN,
    Math.round(Number(input.availableWidth) || 0),
  )
  const preferredWidths = visibleColumns.reduce<Record<CollaborationTableColumnKey, number>>((accumulator, column) => {
    accumulator[column] = clampCollaborationTableColumnWidth(
      column,
      Number(next[column].width || COLLABORATION_TABLE_COLUMN_DEFAULTS[column].width),
    )
    return accumulator
  }, {
    name: COLLABORATION_TABLE_COLUMN_DEFAULTS.name.width,
    institution: COLLABORATION_TABLE_COLUMN_DEFAULTS.institution.width,
    relationship: COLLABORATION_TABLE_COLUMN_DEFAULTS.relationship.width,
    activity: COLLABORATION_TABLE_COLUMN_DEFAULTS.activity.width,
    last_year: COLLABORATION_TABLE_COLUMN_DEFAULTS.last_year.width,
    coauthored_works: COLLABORATION_TABLE_COLUMN_DEFAULTS.coauthored_works.width,
    collaboration_score: COLLABORATION_TABLE_COLUMN_DEFAULTS.collaboration_score.width,
  })

  let totalWidth = visibleColumns.reduce((sum, column) => sum + preferredWidths[column], 0)
  if (totalWidth > containerBudget) {
    let overflow = totalWidth - containerBudget
    const shrinkOrder: CollaborationTableColumnKey[] = [
      'institution',
      'name',
      'relationship',
      'activity',
      'coauthored_works',
      'collaboration_score',
      'last_year',
    ].filter(isCollaborationTableColumnKey)

    for (const column of shrinkOrder) {
      if (overflow <= 0) {
        break
      }
      const reducible = Math.max(0, preferredWidths[column] - COLLABORATION_TABLE_COLUMN_MIN_WIDTH[column])
      if (reducible <= 0) {
        continue
      }
      const deduction = Math.min(reducible, overflow)
      preferredWidths[column] -= deduction
      overflow -= deduction
    }

    if (overflow > 0) {
      for (const column of shrinkOrder) {
        if (overflow <= 0) {
          break
        }
        const reducible = Math.max(0, preferredWidths[column] - COLLABORATION_TABLE_COLUMN_HARD_MIN)
        if (reducible <= 0) {
          continue
        }
        const deduction = Math.min(reducible, overflow)
        preferredWidths[column] -= deduction
        overflow -= deduction
      }
    }
    totalWidth = visibleColumns.reduce((sum, column) => sum + preferredWidths[column], 0)
  }

  if (totalWidth < containerBudget) {
    let remaining = containerBudget - totalWidth
    const growOrder: CollaborationTableColumnKey[] = ([
      'name',
      'institution',
      'relationship',
      'activity',
      'coauthored_works',
      'collaboration_score',
      'last_year',
    ] as CollaborationTableColumnKey[]).filter((column) => visibleColumns.includes(column))

    while (remaining > 0) {
      const growColumns = growOrder.filter(
        (column) => preferredWidths[column] < COLLABORATION_TABLE_COLUMN_MAX_WIDTH[column],
      )
      if (growColumns.length === 0) {
        break
      }
      const perColumn = Math.max(1, Math.floor(remaining / growColumns.length))
      let grew = 0
      for (const column of growColumns) {
        if (remaining <= 0) {
          break
        }
        const growable = Math.max(0, COLLABORATION_TABLE_COLUMN_MAX_WIDTH[column] - preferredWidths[column])
        if (growable <= 0) {
          continue
        }
        const step = Math.min(growable, perColumn, remaining)
        if (step <= 0) {
          continue
        }
        preferredWidths[column] += step
        remaining -= step
        grew += step
      }
      if (grew <= 0) {
        break
      }
    }
  }

  for (const column of visibleColumns) {
    next[column] = {
      ...next[column],
      width: Math.round(preferredWidths[column]),
    }
  }
  return next
}

function resolveInitialCollaborationTableLayoutWidth(): number {
  if (typeof window === 'undefined') {
    return COLLABORATION_TABLE_LAYOUT_FALLBACK_WIDTH
  }
  return Math.max(320, Math.round(window.innerWidth || COLLABORATION_TABLE_LAYOUT_FALLBACK_WIDTH))
}

function createDefaultCollaborationTableColumns(
  availableWidth: number,
): Record<CollaborationTableColumnKey, CollaborationTableColumnPreference> {
  return clampCollaborationTableColumnsToAvailableWidth({
    columns: { ...COLLABORATION_TABLE_COLUMN_DEFAULTS },
    columnOrder: COLLABORATION_TABLE_COLUMN_ORDER,
    availableWidth,
  })
}

function normalizeHeatmapMode(value: string | null | undefined): HeatmapMode {
  if (value === 'institution' || value === 'domain') {
    return value
  }
  return 'country'
}

function normalizeHeatmapMetric(value: string | null | undefined): HeatmapMetric {
  if (
    value === 'collaborators' ||
    value === 'strength' ||
    value === 'citations_last_12m' ||
    value === 'recency'
  ) {
    return value
  }
  return 'works'
}

function normalizeGeoView(value: string | null | undefined): 'map' | 'grid' {
  return value === 'grid' ? 'grid' : 'map'
}

function quantile(values: number[], percentile: number): number {
  if (values.length === 0) {
    return 0
  }
  const sorted = [...values].sort((left, right) => left - right)
  const index = Math.min(sorted.length - 1, Math.max(0, Math.ceil(percentile * sorted.length) - 1))
  return sorted[index] || 0
}

function hydrateMockMetrics(metrics: MockMetricsSeed): CollaboratorPayload['metrics'] {
  const score = Number(metrics.collaboration_strength_score || 0)
  const classification =
    score >= 85
      ? 'CORE'
      : score >= 70
        ? 'ACTIVE'
        : score >= 50
          ? 'OCCASIONAL'
          : 'HISTORIC'
  const nowYear = new Date().getFullYear()
  const relationship_tier = relationshipFromClassification(classification)
  const activity_status = activityFromYear(metrics.last_collaboration_year ?? null, nowYear)
  return {
    coauthored_works_count: Number(metrics.coauthored_works_count || 0),
    shared_citations_total: Math.max(0, Math.round(Number(metrics.coauthored_works_count || 0) * 14)),
    first_collaboration_year: metrics.last_collaboration_year ? Math.max(2008, metrics.last_collaboration_year - 2) : null,
    last_collaboration_year: metrics.last_collaboration_year,
    citations_last_12m: Math.max(0, Math.round(Number(metrics.coauthored_works_count || 0) * 1.6)),
    collaboration_strength_score: score,
    classification,
    relationship_tier,
    activity_status,
    computed_at: new Date().toISOString(),
    status: 'READY',
  }
}

function downloadTextFile(filename: string, content: string, mimeType: string): void {
  const blob = new Blob([content], { type: mimeType })
  const url = window.URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = filename
  document.body.appendChild(anchor)
  anchor.click()
  anchor.remove()
  window.URL.revokeObjectURL(url)
}

export function ProfileCollaborationPage() {
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()
  const initialQuery = String(searchParams.get('query') || '').trim()
  const initialSort = normalizeSortValue(searchParams.get('sort'))
  const initialPage = parsePositiveInteger(searchParams.get('page'), 1)
  const initialCachedLandingData = useMemo(
    () =>
      readCachedCollaborationLandingData({
        query: initialQuery,
        sort: initialSort,
        page: initialPage,
        pageSize: COLLABORATORS_PAGE_SIZE_DEFAULT,
      }),
    [initialPage, initialQuery, initialSort],
  )
  const [summary, setSummary] = useState<CollaborationMetricsSummaryPayload | null>(initialCachedLandingData?.summary || null)
  const [listing, setListing] = useState<CollaboratorsListPayload | null>(initialCachedLandingData?.listing || null)
  const [query, setQuery] = useState(() => initialQuery)
  const [sort, setSort] = useState<CollaborationSortField>(() => initialSort)
  const [sortDirection, setSortDirection] = useState<SortDirection>(() => (
    initialSort === 'name' ? 'asc' : 'desc'
  ))
  const [page, setPage] = useState(() => initialPage)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [collaboratorDrilldownOpen, setCollaboratorDrilldownOpen] = useState(false)
  const [activeCollaboratorDrilldownTab, setActiveCollaboratorDrilldownTab] = useState<CollaboratorDrilldownTab>('details')
  const [form, setForm] = useState<CollaboratorFormState>(EMPTY_FORM)
  const [identityDraft, setIdentityDraft] = useState<CollaboratorIdentityDraft>(() => collaboratorIdentityDraftFromForm(EMPTY_FORM))
  const [editingIdentity, setEditingIdentity] = useState(false)
  const [primaryEmailDraft, setPrimaryEmailDraft] = useState('')
  const [editingPrimaryEmail, setEditingPrimaryEmail] = useState(false)
  const [institutionDraft, setInstitutionDraft] = useState('')
  const [editingInstitution, setEditingInstitution] = useState(false)
  const [showSecondaryInstitutionInput, setShowSecondaryInstitutionInput] = useState(false)
  const [secondaryInstitutionDraft, setSecondaryInstitutionDraft] = useState('')
  const [editingSecondaryInstitution, setEditingSecondaryInstitution] = useState(false)
  const [primaryAffiliationBylineDraft, setPrimaryAffiliationBylineDraft] = useState<CollaboratorAffiliationBylineDraft>({
    department: '',
    address_line_1: '',
    city: '',
    region: '',
    postal_code: '',
    country: '',
  })
  const [secondaryAffiliationBylineDraft, setSecondaryAffiliationBylineDraft] = useState<CollaboratorAffiliationBylineDraft>({
    department: '',
    address_line_1: '',
    city: '',
    region: '',
    postal_code: '',
    country: '',
  })
  const [editingAffiliationBylineSlot, setEditingAffiliationBylineSlot] = useState<CollaboratorAffiliationSlotKey | null>(null)
  const [pendingInstitutionReview, setPendingInstitutionReview] = useState<Record<CollaboratorAffiliationSlotKey, boolean>>({
    primary: false,
    secondary: false,
  })
  const [showSecondaryEmailInput, setShowSecondaryEmailInput] = useState(false)
  const [secondaryEmailDraft, setSecondaryEmailDraft] = useState('')
  const [editingSecondaryEmail, setEditingSecondaryEmail] = useState(false)
  const [institutionInputFocused, setInstitutionInputFocused] = useState<'primary' | 'secondary' | null>(null)
  const [institutionSuggestions, setInstitutionSuggestions] = useState<AffiliationSuggestionItem[]>([])
  const [selectedInstitutionSuggestions, setSelectedInstitutionSuggestions] = useState<Record<CollaboratorAffiliationSlotKey, AffiliationSuggestionItem | null>>({
    primary: null,
    secondary: null,
  })
  const [institutionSuggestionsLoading, setInstitutionSuggestionsLoading] = useState(false)
  const [institutionSuggestionsError, setInstitutionSuggestionsError] = useState('')
  const [loading, setLoading] = useState(false)
  const [status, setStatus] = useState('')
  const [error, setError] = useState('')
  const [collaboratorContactSaving, setCollaboratorContactSaving] = useState(false)
  const [, setDuplicateWarnings] = useState<string[]>([])
  const [sharedWorksWindowMode, setSharedWorksWindowMode] = useState<CollaboratorHistoryWindowMode>('all')
  const [sharedWorksSortField, setSharedWorksSortField] = useState<CollaboratorSharedWorksSortField>('year')
  const [sharedWorksSortDirection, setSharedWorksSortDirection] = useState<SortDirection>('desc')
  const [sharedWorksByCollaboratorId, setSharedWorksByCollaboratorId] = useState<Record<string, CollaboratorSharedWorkPayload[]>>(
    () => initialCachedLandingData?.sharedWorksByCollaboratorId || {},
  )
  const [sharedWorksLoadingByCollaboratorId, setSharedWorksLoadingByCollaboratorId] = useState<Record<string, boolean>>({})
  const [sharedWorksErrorByCollaboratorId, setSharedWorksErrorByCollaboratorId] = useState<Record<string, string>>({})
  const collaboratorInstitutionLookupSequenceRef = useRef(0)
  const collaboratorFormRef = useRef<CollaboratorFormState>(EMPTY_FORM)
  const selectedCollaboratorIdRef = useRef<string | null>(null)
  const collaboratorContactSnapshotByIdRef = useRef<Map<string, string>>(new Map())
  const collaboratorContactQueuedSnapshotByIdRef = useRef<Map<string, string>>(new Map())
  const collaboratorContactInFlightSnapshotByIdRef = useRef<Map<string, string>>(new Map())
  const collaboratorContactFailedSnapshotByIdRef = useRef<Map<string, string>>(new Map())
  const collaboratorContactSaveQueueRef = useRef<CollaboratorContactSaveQueueItem[]>([])
  const collaboratorContactSaveInFlightRef = useRef(false)
  const sharedWorksRequestInFlightRef = useRef<Set<string>>(new Set())
  const [heatmapMode, setHeatmapMode] = useState<HeatmapMode>(() => normalizeHeatmapMode(searchParams.get('heatmap_mode')))
  const [heatmapMetric, setHeatmapMetric] = useState<HeatmapMetric>(
    () => normalizeHeatmapMetric(searchParams.get('heatmap_metric')),
  )
  const [heatmapSelection, setHeatmapSelection] = useState<HeatmapSelection>(() => {
    const selectionLabel = String(searchParams.get('heatmap_selection') || '').trim()
    if (!selectionLabel) {
      return null
    }
    return {
      mode: normalizeHeatmapMode(searchParams.get('heatmap_mode')),
      label: selectionLabel,
    }
  })
  const [geoView, setGeoView] = useState<'map' | 'grid'>(() => normalizeGeoView(searchParams.get('geo_view')))
  const [collaborationLibraryVisible, setCollaborationLibraryVisible] = useState(true)
  const [collaborationSearchVisible, setCollaborationSearchVisible] = useState(false)
  const [collaborationFilterVisible, setCollaborationFilterVisible] = useState(false)
  const [collaborationDownloadVisible, setCollaborationDownloadVisible] = useState(false)
  const [collaborationToolsOpen, setCollaborationToolsOpen] = useState(false)
  const [collaborationSettingsVisible, setCollaborationSettingsVisible] = useState(false)
  const [collaborationLibrarySearchPopoverPosition, setCollaborationLibrarySearchPopoverPosition] = useState({ top: 0, right: 0 })
  const [collaborationLibraryFilterPopoverPosition, setCollaborationLibraryFilterPopoverPosition] = useState({ top: 0, right: 0 })
  const [collaborationLibraryDownloadPopoverPosition, setCollaborationLibraryDownloadPopoverPosition] = useState({ top: 0, right: 0 })
  const [collaborationLibrarySettingsPopoverPosition, setCollaborationLibrarySettingsPopoverPosition] = useState({ top: 0, right: 0 })
  const initialCollaborationTableLayoutWidth = useMemo(() => resolveInitialCollaborationTableLayoutWidth(), [])
  const [collaborationTableLayoutWidth, setCollaborationTableLayoutWidth] = useState(initialCollaborationTableLayoutWidth)
  const [collaborationTableColumnOrder, setCollaborationTableColumnOrder] = useState<CollaborationTableColumnKey[]>(
    () => [...COLLABORATION_TABLE_COLUMN_ORDER],
  )
  const [collaborationTableColumns, setCollaborationTableColumns] = useState<
    Record<CollaborationTableColumnKey, CollaborationTableColumnPreference>
  >(() => createDefaultCollaborationTableColumns(initialCollaborationTableLayoutWidth))
  const [collaborationTableDensity, setCollaborationTableDensity] = useState<CollaborationTableDensity>('default')
  const [collaborationTableAlternateRowColoring, setCollaborationTableAlternateRowColoring] = useState(true)
  const [collaborationTableMetricHighlights, setCollaborationTableMetricHighlights] = useState(true)
  const [collaborationTableResizingColumn, setCollaborationTableResizingColumn] = useState<CollaborationTableColumnKey | null>(null)
  const [collaborationTableDraggingColumn, setCollaborationTableDraggingColumn] = useState<CollaborationTableColumnKey | null>(null)
  const [collaborationLibraryPageSize, setCollaborationLibraryPageSize] = useState<CollaborationTablePageSize>(
    COLLABORATORS_PAGE_SIZE_DEFAULT,
  )
  const collaborationTableLayoutRef = useRef<HTMLDivElement | null>(null)
  const collaborationLibrarySearchButtonRef = useRef<HTMLButtonElement | null>(null)
  const collaborationLibrarySearchPopoverRef = useRef<HTMLDivElement | null>(null)
  const collaborationLibraryFilterButtonRef = useRef<HTMLButtonElement | null>(null)
  const collaborationLibraryFilterPopoverRef = useRef<HTMLDivElement | null>(null)
  const collaborationLibraryDownloadButtonRef = useRef<HTMLButtonElement | null>(null)
  const collaborationLibraryDownloadPopoverRef = useRef<HTMLDivElement | null>(null)
  const collaborationLibrarySettingsButtonRef = useRef<HTMLButtonElement | null>(null)
  const collaborationLibrarySettingsPopoverRef = useRef<HTMLDivElement | null>(null)
  const collaborationLoadSequenceRef = useRef(0)
  const collaborationTableResizeRef = useRef<{
    column: CollaborationTableColumnKey
    visibleColumns: CollaborationTableColumnKey[]
    startX: number
    startWidths: Partial<Record<CollaborationTableColumnKey, number>>
  } | null>(null)
  const resolveCollaborationTableAvailableWidth = useCallback(() => {
    const measuredClient = collaborationTableLayoutRef.current?.clientWidth
    if (Number.isFinite(measuredClient) && Number(measuredClient) > 0) {
      return Math.max(320, Math.round(Number(measuredClient)))
    }
    const measuredRect = collaborationTableLayoutRef.current?.getBoundingClientRect().width
    if (Number.isFinite(measuredRect) && Number(measuredRect) > 0) {
      return Math.max(320, Math.round(Number(measuredRect)))
    }
    return Math.max(320, Math.round(Number(collaborationTableLayoutWidth) || 320))
  }, [collaborationTableLayoutWidth])

  // Mock data for dev visualization
  useEffect(() => {
    if (ENABLE_COLLABORATION_DEV_MOCKS && !listing) {
      const mockCollaborators = [
        {
          id: '1',
          user_id: 'mock-user',
          full_name: 'Dr. Sarah Mitchell',
          preferred_name: 'Sarah',
          email: 'sarah.mitchell@imperial.ac.uk',
          orcid_id: '0000-0001-1111-1111',
          openalex_author_id: 'A111',
          primary_institution: 'Imperial College London',
          department: 'Department of Computing',
          country: 'United Kingdom',
          current_position: 'Senior Lecturer',
          research_domains: ['Machine Learning', 'Computer Vision'],
          notes: '',
          metadata_enrichment_status: 'COMPLETE',
          created_at: '2024-01-01T00:00:00Z',
          updated_at: '2024-01-01T00:00:00Z',
          metrics: { coauthored_works_count: 12, last_collaboration_year: 2025, collaboration_strength_score: 85 },
        },
        {
          id: '2',
          user_id: 'mock-user',
          full_name: 'Prof. James Patterson',
          preferred_name: 'James',
          email: 'j.patterson@cam.ac.uk',
          orcid_id: '0000-0002-2222-2222',
          openalex_author_id: 'A222',
          primary_institution: 'University of Cambridge',
          department: 'Department of Engineering',
          country: 'United Kingdom',
          current_position: 'Professor',
          research_domains: ['Robotics', 'AI'],
          notes: '',
          metadata_enrichment_status: 'COMPLETE',
          created_at: '2024-01-01T00:00:00Z',
          updated_at: '2024-01-01T00:00:00Z',
          metrics: { coauthored_works_count: 18, last_collaboration_year: 2025, collaboration_strength_score: 92 },
        },
        {
          id: '3',
          user_id: 'mock-user',
          full_name: 'Dr. Emily Chen',
          preferred_name: 'Emily',
          email: 'emily.chen@ed.ac.uk',
          orcid_id: '0000-0003-3333-3333',
          openalex_author_id: 'A333',
          primary_institution: 'University of Edinburgh',
          department: 'School of Informatics',
          country: 'United Kingdom',
          current_position: 'Research Fellow',
          research_domains: ['Natural Language Processing', 'AI Ethics'],
          notes: '',
          metadata_enrichment_status: 'COMPLETE',
          created_at: '2024-01-01T00:00:00Z',
          updated_at: '2024-01-01T00:00:00Z',
          metrics: { coauthored_works_count: 8, last_collaboration_year: 2024, collaboration_strength_score: 72 },
        },
        {
          id: '4',
          user_id: 'mock-user',
          full_name: 'Dr. Michael Brown',
          preferred_name: 'Mike',
          email: 'm.brown@manchester.ac.uk',
          orcid_id: '0000-0004-4444-4444',
          openalex_author_id: 'A444',
          primary_institution: 'University of Manchester',
          department: 'Department of Computer Science',
          country: 'United Kingdom',
          current_position: 'Lecturer',
          research_domains: ['Distributed Systems', 'Cloud Computing'],
          notes: '',
          metadata_enrichment_status: 'COMPLETE',
          created_at: '2024-01-01T00:00:00Z',
          updated_at: '2024-01-01T00:00:00Z',
          metrics: { coauthored_works_count: 15, last_collaboration_year: 2025, collaboration_strength_score: 88 },
        },
        {
          id: '5',
          user_id: 'mock-user',
          full_name: 'Prof. Rebecca Williams',
          preferred_name: 'Rebecca',
          email: 'r.williams@ucl.ac.uk',
          orcid_id: '0000-0005-5555-5555',
          openalex_author_id: 'A555',
          primary_institution: 'University College London',
          department: 'Department of Computer Science',
          country: 'United Kingdom',
          current_position: 'Professor',
          research_domains: ['Data Science', 'Bioinformatics'],
          notes: '',
          metadata_enrichment_status: 'COMPLETE',
          created_at: '2024-01-01T00:00:00Z',
          updated_at: '2024-01-01T00:00:00Z',
          metrics: { coauthored_works_count: 22, last_collaboration_year: 2025, collaboration_strength_score: 95 },
        },
        {
          id: '6',
          user_id: 'mock-user',
          full_name: 'Dr. David Thompson',
          preferred_name: 'David',
          email: 'd.thompson@ox.ac.uk',
          orcid_id: '0000-0006-6666-6666',
          openalex_author_id: 'A666',
          primary_institution: 'University of Oxford',
          department: 'Department of Computer Science',
          country: 'United Kingdom',
          current_position: 'Associate Professor',
          research_domains: ['Quantum Computing', 'Algorithms'],
          notes: '',
          metadata_enrichment_status: 'COMPLETE',
          created_at: '2024-01-01T00:00:00Z',
          updated_at: '2024-01-01T00:00:00Z',
          metrics: { coauthored_works_count: 10, last_collaboration_year: 2025, collaboration_strength_score: 80 },
        },
        {
          id: '7',
          user_id: 'mock-user',
          full_name: 'Dr. Laura Davies',
          preferred_name: 'Laura',
          email: 'l.davies@bristol.ac.uk',
          orcid_id: '0000-0007-7777-7777',
          openalex_author_id: 'A777',
          primary_institution: 'University of Bristol',
          department: 'Department of Engineering Mathematics',
          country: 'United Kingdom',
          current_position: 'Senior Lecturer',
          research_domains: ['Computational Mathematics', 'Optimization'],
          notes: '',
          metadata_enrichment_status: 'COMPLETE',
          created_at: '2024-01-01T00:00:00Z',
          updated_at: '2024-01-01T00:00:00Z',
          metrics: { coauthored_works_count: 7, last_collaboration_year: 2024, collaboration_strength_score: 68 },
        },
        {
          id: '8',
          user_id: 'mock-user',
          full_name: 'Prof. Andrew Wilson',
          preferred_name: 'Andrew',
          email: 'a.wilson@nottingham.ac.uk',
          orcid_id: '0000-0008-8888-8888',
          openalex_author_id: 'A888',
          primary_institution: 'University of Nottingham',
          department: 'School of Computer Science',
          country: 'United Kingdom',
          current_position: 'Professor',
          research_domains: ['Software Engineering', 'Testing'],
          notes: '',
          metadata_enrichment_status: 'COMPLETE',
          created_at: '2024-01-01T00:00:00Z',
          updated_at: '2024-01-01T00:00:00Z',
          metrics: { coauthored_works_count: 14, last_collaboration_year: 2025, collaboration_strength_score: 86 },
        },
        {
          id: '9',
          user_id: 'mock-user',
          full_name: 'Dr. Sophie Anderson',
          preferred_name: 'Sophie',
          email: 's.anderson@glasgow.ac.uk',
          orcid_id: '0000-0009-9999-9999',
          openalex_author_id: 'A999',
          primary_institution: 'University of Glasgow',
          department: 'School of Computing Science',
          country: 'United Kingdom',
          current_position: 'Lecturer',
          research_domains: ['Human-Computer Interaction', 'Accessibility'],
          notes: '',
          metadata_enrichment_status: 'COMPLETE',
          created_at: '2024-01-01T00:00:00Z',
          updated_at: '2024-01-01T00:00:00Z',
          metrics: { coauthored_works_count: 11, last_collaboration_year: 2025, collaboration_strength_score: 78 },
        },
        {
          id: '10',
          user_id: 'mock-user',
          full_name: 'Dr. Thomas Hughes',
          preferred_name: 'Tom',
          email: 't.hughes@cardiff.ac.uk',
          orcid_id: '0000-0010-1010-1010',
          openalex_author_id: 'A1010',
          primary_institution: 'Cardiff University',
          department: 'School of Computer Science & Informatics',
          country: 'United Kingdom',
          current_position: 'Senior Lecturer',
          research_domains: ['Cybersecurity', 'Networks'],
          notes: '',
          metadata_enrichment_status: 'COMPLETE',
          created_at: '2024-01-01T00:00:00Z',
          updated_at: '2024-01-01T00:00:00Z',
          metrics: { coauthored_works_count: 9, last_collaboration_year: 2024, collaboration_strength_score: 74 },
        },
        {
          id: '11',
          user_id: 'mock-user',
          full_name: 'Prof. Rachel Green',
          preferred_name: 'Rachel',
          email: 'r.green@york.ac.uk',
          orcid_id: '0000-0011-1111-1111',
          openalex_author_id: 'A1111',
          primary_institution: 'University of York',
          department: 'Department of Computer Science',
          country: 'United Kingdom',
          current_position: 'Professor',
          research_domains: ['Autonomous Systems', 'Verification'],
          notes: '',
          metadata_enrichment_status: 'COMPLETE',
          created_at: '2024-01-01T00:00:00Z',
          updated_at: '2024-01-01T00:00:00Z',
          metrics: { coauthored_works_count: 16, last_collaboration_year: 2025, collaboration_strength_score: 90 },
        },
        {
          id: '12',
          user_id: 'mock-user',
          full_name: 'Dr. Oliver Martin',
          preferred_name: 'Oliver',
          email: 'o.martin@qub.ac.uk',
          orcid_id: '0000-0012-1212-1212',
          openalex_author_id: 'A1212',
          primary_institution: 'Queen\'s University Belfast',
          department: 'School of Electronics, Electrical Engineering and Computer Science',
          country: 'United Kingdom',
          current_position: 'Lecturer',
          research_domains: ['IoT', 'Embedded Systems'],
          notes: '',
          metadata_enrichment_status: 'COMPLETE',
          created_at: '2024-01-01T00:00:00Z',
          updated_at: '2024-01-01T00:00:00Z',
          metrics: { coauthored_works_count: 6, last_collaboration_year: 2024, collaboration_strength_score: 65 },
        },
        {
          id: '13',
          user_id: 'mock-user',
          full_name: 'Dr. Hannah Lee',
          preferred_name: 'Hannah',
          email: 'h.lee@durham.ac.uk',
          orcid_id: '0000-0013-1313-1313',
          openalex_author_id: 'A1313',
          primary_institution: 'Durham University',
          department: 'Department of Computer Science',
          country: 'United Kingdom',
          current_position: 'Research Fellow',
          research_domains: ['Data Mining', 'Social Network Analysis'],
          notes: '',
          metadata_enrichment_status: 'COMPLETE',
          created_at: '2024-01-01T00:00:00Z',
          updated_at: '2024-01-01T00:00:00Z',
          metrics: { coauthored_works_count: 5, last_collaboration_year: 2024, collaboration_strength_score: 62 },
        },
        {
          id: '14',
          user_id: 'mock-user',
          full_name: 'Prof. Christopher Jones',
          preferred_name: 'Chris',
          email: 'c.jones@liverpool.ac.uk',
          orcid_id: '0000-0014-1414-1414',
          openalex_author_id: 'A1414',
          primary_institution: 'University of Liverpool',
          department: 'Department of Computer Science',
          country: 'United Kingdom',
          current_position: 'Professor',
          research_domains: ['Knowledge Representation', 'Semantic Web'],
          notes: '',
          metadata_enrichment_status: 'COMPLETE',
          created_at: '2024-01-01T00:00:00Z',
          updated_at: '2024-01-01T00:00:00Z',
          metrics: { coauthored_works_count: 13, last_collaboration_year: 2025, collaboration_strength_score: 84 },
        },
        {
          id: '15',
          user_id: 'mock-user',
          full_name: 'Dr. Jessica Taylor',
          preferred_name: 'Jess',
          email: 'j.taylor@mit.edu',
          orcid_id: '0000-0015-1515-1515',
          openalex_author_id: 'A1515',
          primary_institution: 'Massachusetts Institute of Technology',
          department: 'CSAIL',
          country: 'United States',
          current_position: 'Assistant Professor',
          research_domains: ['Robotics', 'Machine Learning'],
          notes: '',
          metadata_enrichment_status: 'COMPLETE',
          created_at: '2024-01-01T00:00:00Z',
          updated_at: '2024-01-01T00:00:00Z',
          metrics: { coauthored_works_count: 4, last_collaboration_year: 2024, collaboration_strength_score: 58 },
        },
        {
          id: '16',
          user_id: 'mock-user',
          full_name: 'Prof. Marco Rossi',
          preferred_name: 'Marco',
          email: 'm.rossi@unimi.it',
          orcid_id: '0000-0016-1616-1616',
          openalex_author_id: 'A1616',
          primary_institution: 'University of Milan',
          department: 'Department of Computer Science',
          country: 'Italy',
          current_position: 'Professor',
          research_domains: ['Theoretical Computer Science', 'Algorithms'],
          notes: '',
          metadata_enrichment_status: 'COMPLETE',
          created_at: '2024-01-01T00:00:00Z',
          updated_at: '2024-01-01T00:00:00Z',
          metrics: { coauthored_works_count: 3, last_collaboration_year: 2023, collaboration_strength_score: 52 },
        },
      ]

      const ukInstitutions = [
        'Imperial College London',
        'University College London',
        'King\'s College London',
        'University of Oxford',
        'University of Cambridge',
        'University of Manchester',
        'University of Edinburgh',
        'University of Glasgow',
        'University of Bristol',
        'University of Nottingham',
        'Cardiff University',
        'University of York',
        'Durham University',
        'University of Liverpool',
        'University of Leeds',
        'University of Birmingham',
        'University of Warwick',
        'University of Southampton',
        'University of Exeter',
        'Queen\'s University Belfast',
      ]

      const firstNames = [
        'Avery', 'Jordan', 'Morgan', 'Taylor', 'Casey', 'Riley', 'Alex', 'Sam', 'Jamie', 'Cameron',
      ]
      const lastNames = [
        'Campbell', 'Reid', 'Murphy', 'Parker', 'Bailey', 'Shaw', 'Gray', 'Ellis', 'Brooks', 'Turner',
      ]

      const currentUkCount = mockCollaborators.filter((item) => item.country === 'United Kingdom').length
      const targetUkCount = 200
      const toAdd = Math.max(0, targetUkCount - currentUkCount)

      for (let i = 0; i < toAdd; i += 1) {
        const institution = ukInstitutions[i % ukInstitutions.length]
        const first = firstNames[i % firstNames.length]
        const last = `${lastNames[i % lastNames.length]}${Math.floor(i / lastNames.length)}`
        const idNum = mockCollaborators.length + 1
        const strength = 52 + ((i * 9) % 44)

        mockCollaborators.push({
          id: String(idNum),
          user_id: 'mock-user',
          full_name: `Dr. ${first} ${last}`,
          preferred_name: first,
          email: `${first.toLowerCase()}.${last.toLowerCase()}@example.ac.uk`,
          orcid_id: `0000-0000-${String(3000 + idNum).padStart(4, '0')}-${String(7000 + idNum).padStart(4, '0')}`,
          openalex_author_id: `A${20000 + idNum}`,
          primary_institution: institution,
          department: 'Department of Computer Science',
          country: 'United Kingdom',
          current_position: i % 4 === 0 ? 'Professor' : i % 4 === 1 ? 'Senior Lecturer' : i % 4 === 2 ? 'Lecturer' : 'Research Fellow',
          research_domains: i % 2 === 0 ? ['Machine Learning', 'AI'] : ['Data Science', 'Networks'],
          notes: '',
          metadata_enrichment_status: 'COMPLETE',
          created_at: '2024-01-01T00:00:00Z',
          updated_at: '2024-01-01T00:00:00Z',
          metrics: {
            coauthored_works_count: Math.max(3, Math.floor(strength / 7)),
            last_collaboration_year: 2023 + (i % 3),
            collaboration_strength_score: strength,
          },
        })
      }

      const hydratedMockCollaborators: CollaboratorPayload[] = mockCollaborators.map((item) => ({
        ...item,
        owner_user_id: 'mock-user',
        secondary_email: null,
        contact_salutation: null,
        contact_first_name: null,
        contact_middle_initial: null,
        contact_surname: null,
        contact_email: null,
        contact_secondary_email: null,
        contact_primary_institution: null,
        contact_secondary_institution: null,
        contact_primary_institution_openalex_id: null,
        contact_secondary_institution_openalex_id: null,
        contact_primary_affiliation_department: null,
        contact_primary_affiliation_address_line_1: null,
        contact_primary_affiliation_city: null,
        contact_primary_affiliation_region: null,
        contact_primary_affiliation_postal_code: null,
        contact_primary_affiliation_country: null,
        contact_secondary_affiliation_department: null,
        contact_secondary_affiliation_address_line_1: null,
        contact_secondary_affiliation_city: null,
        contact_secondary_affiliation_region: null,
        contact_secondary_affiliation_postal_code: null,
        contact_secondary_affiliation_country: null,
        contact_country: null,
        duplicate_warnings: [],
        metrics: hydrateMockMetrics(item.metrics),
      }))

      setListing({
        items: hydratedMockCollaborators,
        total: hydratedMockCollaborators.length,
        page: 1,
        page_size: 250,
        has_more: false,
      })

      const totalUkCollaborators = hydratedMockCollaborators.filter((item) => item.country === 'United Kingdom').length

      setSummary({
        total_collaborators: hydratedMockCollaborators.length,
        core_collaborators: Math.max(12, Math.floor(totalUkCollaborators * 0.18)),
        active_collaborations_12m: Math.max(20, Math.floor(totalUkCollaborators * 0.7)),
        new_collaborators_12m: Math.max(8, Math.floor(totalUkCollaborators * 0.2)),
        last_computed_at: new Date().toISOString(),
        status: 'READY',
        is_stale: false,
        is_updating: false,
        last_update_failed: false,
      })
    }
  }, [listing])

  const canonicalCollaborators = useMemo<CollaboratorCanonical[]>(() => {
    // Union-find grouping across all identity tokens (OpenAlex, email, name)
    const items = listing?.items || []
    const parent = new Map<string, string>()
    function find(x: string): string {
      let root = x
      while (parent.get(root) !== root) {
        root = parent.get(root) ?? root
      }
      let cur = x
      while (cur !== root) {
        const next = parent.get(cur) ?? cur
        parent.set(cur, root)
        cur = next
      }
      return root
    }
    function union(a: string, b: string) {
      const ra = find(a)
      const rb = find(b)
      if (ra !== rb) parent.set(rb, ra)
    }
    const tokenToIds = new Map<string, string[]>()
    for (const item of items) {
      const id = String(item.id)
      parent.set(id, id)
      for (const token of collaboratorIdentityTokens(item)) {
        const list = tokenToIds.get(token) || []
        list.push(id)
        tokenToIds.set(token, list)
      }
    }
    for (const ids of tokenToIds.values()) {
      if (ids.length <= 1) continue
      for (let i = 1; i < ids.length; i++) {
        union(ids[0], ids[i])
      }
    }
    // Phase 2: fuzzy name + institution matching (initial-aware)
    for (let i = 0; i < items.length; i++) {
      const left = items[i]
      const lid = String(left.id)
      for (let j = i + 1; j < items.length; j++) {
        const right = items[j]
        const rid = String(right.id)
        if (find(lid) === find(rid)) continue
        const leftName = String(left.full_name || '').trim().toLowerCase().replace(/\s+/g, ' ')
        const rightName = String(right.full_name || '').trim().toLowerCase().replace(/\s+/g, ' ')
        const nameSim = stringSimilarity(leftName, rightName)
        if (nameSim >= 0.98) { union(lid, rid); continue }
        const leftInst = String(left.primary_institution || '').trim().toLowerCase().replace(/\s+/g, ' ')
        const rightInst = String(right.primary_institution || '').trim().toLowerCase().replace(/\s+/g, ' ')
        if (nameSim >= 0.94) {
          if (stringSimilarity(leftInst, rightInst) >= 0.82) { union(lid, rid); continue }
        }
        if (nameInitialCompatible(left.full_name || '', right.full_name || '')) {
          const li = String(left.primary_institution || '').trim()
          const ri = String(right.primary_institution || '').trim()
          // Both have institutions → require similarity
          if (li && ri) {
            if (stringSimilarity(li.toLowerCase().replace(/\s+/g, ' '), ri.toLowerCase().replace(/\s+/g, ' ')) >= 0.82) { union(lid, rid) }
          // Exactly one has institution → institution side confirms
          } else if (li || ri) {
            union(lid, rid)
          }
        }
      }
    }
    const groups = new Map<string, CollaboratorPayload[]>()
    for (const item of items) {
      const root = find(String(item.id))
      const group = groups.get(root) || []
      group.push(item)
      groups.set(root, group)
    }

    // Remove singleton groups where no member has an institution —
    // low-quality records that cannot be confirmed as real people.
    for (const [root, members] of groups) {
      if (members.length <= 1 && !members.some(m => (m.primary_institution || '').trim())) {
        groups.delete(root)
      }
    }

    const classificationRank: Record<CollaboratorPayload['metrics']['classification'], number> = {
      CORE: 5,
      ACTIVE: 4,
      OCCASIONAL: 3,
      HISTORIC: 2,
      UNCLASSIFIED: 1,
    }
    const relationshipRank: Record<'CORE' | 'REGULAR' | 'OCCASIONAL' | 'UNCLASSIFIED', number> = {
      CORE: 4,
      REGULAR: 3,
      OCCASIONAL: 2,
      UNCLASSIFIED: 1,
    }
    const activityRank: Record<'ACTIVE' | 'RECENT' | 'DORMANT' | 'HISTORIC' | 'UNCLASSIFIED', number> = {
      ACTIVE: 5,
      RECENT: 4,
      DORMANT: 3,
      HISTORIC: 2,
      UNCLASSIFIED: 1,
    }

    return Array.from(groups.values()).map((group) => {
      const primary = [...group].sort((left, right) => {
        const worksDelta = Number(right.metrics.coauthored_works_count || 0) - Number(left.metrics.coauthored_works_count || 0)
        if (worksDelta !== 0) {
          return worksDelta
        }
        const strengthDelta = Number(right.metrics.collaboration_strength_score || 0) - Number(left.metrics.collaboration_strength_score || 0)
        if (strengthDelta !== 0) {
          return strengthDelta
        }
        return String(left.id).localeCompare(String(right.id))
      })[0]

      const institutionSeen = new Set<string>()
      const institutionLabels: string[] = []
      for (const item of group) {
        const candidates = [...(item.institution_labels || [])]
        const primary = String(item.primary_institution || '').trim()
        if (primary) candidates.unshift(primary)
        for (const label of candidates) {
          const trimmed = label.trim()
          if (!trimmed) continue
          const key = trimmed.toLowerCase()
          if (institutionSeen.has(key)) continue
          institutionSeen.add(key)
          institutionLabels.push(trimmed)
        }
      }

      const domainLabels = Array.from(
        new Set(group.flatMap((item) => item.research_domains || []).map((item) => item.trim()).filter(Boolean)),
      )

      const countryLabels = Array.from(
        new Set(group.map((item) => String(item.country || '').trim()).filter(Boolean)),
      )

      const duplicateWarnings = Array.from(new Set(group.flatMap((item) => item.duplicate_warnings || [])))
      if (group.length > 1) {
        duplicateWarnings.unshift(`Merged ${group.length} records for the same collaborator identity.`)
      }

      const coauthoredWorks = Math.max(...group.map((item) => Number(item.metrics.coauthored_works_count || 0)), 0)
      const sharedCitations = Math.max(...group.map((item) => Number(item.metrics.shared_citations_total || 0)), 0)
      const citations12m = Math.max(...group.map((item) => Number(item.metrics.citations_last_12m || 0)), 0)
      const strength = Math.max(...group.map((item) => Number(item.metrics.collaboration_strength_score || 0)), 0)
      const firstYearCandidates = group
        .map((item) => item.metrics.first_collaboration_year)
        .filter((year): year is number => typeof year === 'number' && Number.isFinite(year))
      const lastYearCandidates = group
        .map((item) => item.metrics.last_collaboration_year)
        .filter((year): year is number => typeof year === 'number' && Number.isFinite(year))
      const classification = group.reduce((best, item) => (
        classificationRank[item.metrics.classification] > classificationRank[best]
          ? item.metrics.classification
          : best
      ), primary.metrics.classification)
      const relationshipTier = group.reduce<'CORE' | 'REGULAR' | 'OCCASIONAL' | 'UNCLASSIFIED'>((best, item) => {
        const next = item.metrics.relationship_tier
        if (next === 'CORE' || next === 'REGULAR' || next === 'OCCASIONAL' || next === 'UNCLASSIFIED') {
          return relationshipRank[next] > relationshipRank[best] ? next : best
        }
        return best
      }, primary.metrics.relationship_tier || 'UNCLASSIFIED')
      const activityStatus = group.reduce<'ACTIVE' | 'RECENT' | 'DORMANT' | 'HISTORIC' | 'UNCLASSIFIED'>((best, item) => {
        const next = item.metrics.activity_status
        if (next === 'ACTIVE' || next === 'RECENT' || next === 'DORMANT' || next === 'HISTORIC' || next === 'UNCLASSIFIED') {
          return activityRank[next] > activityRank[best] ? next : best
        }
        return best
      }, primary.metrics.activity_status || 'UNCLASSIFIED')
      const computedAtCandidates = group.map((item) => item.metrics.computed_at).filter((value): value is string => Boolean(value))
      const computedAt = computedAtCandidates.sort((left, right) => right.localeCompare(left))[0] || null
      const status = group.some((item) => item.metrics.status === 'READY')
        ? 'READY'
        : group.some((item) => item.metrics.status === 'RUNNING')
          ? 'RUNNING'
          : 'FAILED'

      return {
        ...primary,
        country: countryLabels[0] || primary.country,
        research_domains: domainLabels,
        duplicate_warnings: duplicateWarnings,
        metrics: {
          ...primary.metrics,
          coauthored_works_count: coauthoredWorks,
          shared_citations_total: sharedCitations,
          citations_last_12m: citations12m,
          collaboration_strength_score: strength,
          first_collaboration_year: firstYearCandidates.length ? Math.min(...firstYearCandidates) : null,
          last_collaboration_year: lastYearCandidates.length ? Math.max(...lastYearCandidates) : null,
          classification,
          relationship_tier: relationshipTier,
          activity_status: activityStatus,
          computed_at: computedAt,
          status,
        },
        institution_labels: institutionLabels.length
          ? institutionLabels
          : [String(primary.primary_institution || 'Unknown').trim() || 'Unknown'],
        duplicate_count: group.length,
      }
    })
  }, [listing?.items])

  const hasCompleteListing = useMemo(() => isCollaboratorsListComplete(listing), [listing])
  const totalCollaboratorsMetric = summary?.total_collaborators ?? (hasCompleteListing ? canonicalCollaborators.length : null)
  const coreCollaboratorsMetric = summary?.core_collaborators ?? null
  const activeCollaborationsMetric = summary?.active_collaborations_12m ?? null
  const newCollaboratorsMetric = summary?.new_collaborators_12m ?? null

  const selectedCollaborator = useMemo(() => {
    return canonicalCollaborators.find((item) => item.id === selectedId) || null
  }, [canonicalCollaborators, selectedId])
  const selectedCollaboratorRelationship = selectedCollaborator ? resolveRelationshipTier(selectedCollaborator.metrics) : 'UNCLASSIFIED'
  const selectedCollaboratorActivity = selectedCollaborator ? resolveActivityStatus(selectedCollaborator.metrics) : 'UNCLASSIFIED'
  const selectedCollaboratorSharedWorks = useMemo(
    () => (selectedId ? sharedWorksByCollaboratorId[selectedId] || [] : []),
    [selectedId, sharedWorksByCollaboratorId],
  )
  const selectedCollaboratorSharedWorksLoading = selectedId ? Boolean(sharedWorksLoadingByCollaboratorId[selectedId]) : false
  const selectedCollaboratorSharedWorksError = selectedId ? sharedWorksErrorByCollaboratorId[selectedId] || '' : ''
  const filteredSelectedCollaboratorSharedWorks = useMemo(() => {
    if (sharedWorksWindowMode === 'all') {
      return selectedCollaboratorSharedWorks
    }
    const currentYear = new Date().getFullYear()
    const yearFloor = sharedWorksWindowMode === '1y'
      ? currentYear
      : sharedWorksWindowMode === '3y'
        ? currentYear - 2
        : currentYear - 4
    return selectedCollaboratorSharedWorks.filter((item) => (
      typeof item.year === 'number' && item.year >= yearFloor
    ))
  }, [selectedCollaboratorSharedWorks, sharedWorksWindowMode])
  const sortedSelectedCollaboratorSharedWorks = useMemo(() => {
    const collator = new Intl.Collator('en-GB', { numeric: true, sensitivity: 'base' })
    const items = [...filteredSelectedCollaboratorSharedWorks]
    items.sort((left, right) => {
      const titleCompare = collator.compare(left.title, right.title)
      if (sharedWorksSortField === 'title') {
        if (titleCompare !== 0) {
          return sharedWorksSortDirection === 'asc' ? titleCompare : -titleCompare
        }
        return 0
      }
      if (sharedWorksSortField === 'year') {
        if (left.year == null && right.year != null) {
          return 1
        }
        if (left.year != null && right.year == null) {
          return -1
        }
        if (left.year != null && right.year != null && left.year !== right.year) {
          return sharedWorksSortDirection === 'asc'
            ? left.year - right.year
            : right.year - left.year
        }
        return titleCompare
      }
      const leftCitations = Math.max(0, Number(left.citations_total || 0))
      const rightCitations = Math.max(0, Number(right.citations_total || 0))
      if (leftCitations !== rightCitations) {
        return sharedWorksSortDirection === 'asc'
          ? leftCitations - rightCitations
          : rightCitations - leftCitations
      }
      return titleCompare
    })
    return items
  }, [filteredSelectedCollaboratorSharedWorks, sharedWorksSortDirection, sharedWorksSortField])
  const sharedWorksWindowThumbStyle = useMemo(
    () => collaboratorHistoryWindowThumbStyle(sharedWorksWindowMode),
    [sharedWorksWindowMode],
  )
  const onSortSharedWorks = useCallback((field: CollaboratorSharedWorksSortField) => {
    if (sharedWorksSortField === field) {
      setSharedWorksSortDirection((current) => (current === 'desc' ? 'asc' : 'desc'))
      return
    }
    setSharedWorksSortField(field)
    setSharedWorksSortDirection(field === 'title' ? 'asc' : 'desc')
  }, [sharedWorksSortField])
  const collaboratorAffiliations = useMemo(
    () => collaboratorAuthorAffiliations(form),
    [form],
  )
  const identityDraftDirty = useMemo(() => {
    const committed = collaboratorIdentityDraftFromForm(form)
    return (
      committed.salutation !== identityDraft.salutation
      || committed.first_name !== identityDraft.first_name
      || committed.middle_initial !== identityDraft.middle_initial
      || committed.surname !== identityDraft.surname
    )
  }, [form, identityDraft])
  const hasPrimaryEmail = Boolean(primaryEmailDraft.trim())
  const hasPrimaryInstitution = Boolean(sanitizeAffiliation(institutionDraft))
  const primaryInstitutionNeedsHydration = collaboratorInstitutionSlotNeedsHydration(form, 'primary')
  const secondaryInstitutionNeedsHydration = collaboratorInstitutionSlotNeedsHydration(form, 'secondary')
  const primaryInstitutionEditingActive = editingInstitution
  const activeCollaboratorEditor = useMemo(() => {
    if (editingIdentity) {
      return 'identity'
    }
    if (editingPrimaryEmail) {
      return 'primary-email'
    }
    if (editingSecondaryEmail) {
      return 'secondary-email'
    }
    if (editingInstitution) {
      return 'primary-institution'
    }
    if (editingSecondaryInstitution) {
      return 'secondary-institution'
    }
    if (editingAffiliationBylineSlot) {
      return `byline-${editingAffiliationBylineSlot}`
    }
    return null
  }, [
    editingAffiliationBylineSlot,
    editingIdentity,
    editingInstitution,
    editingPrimaryEmail,
    editingSecondaryEmail,
    editingSecondaryInstitution,
  ])

  useEffect(() => {
    collaboratorFormRef.current = form
  }, [form])

  const resetInstitutionSuggestionState = useCallback(() => {
    setInstitutionInputFocused(null)
    setInstitutionSuggestions([])
    setInstitutionSuggestionsError('')
  }, [])

  const onInstitutionDraftInputChange = useCallback((
    slot: CollaboratorAffiliationSlotKey,
    value: string,
  ) => {
    if (slot === 'secondary') {
      setSecondaryInstitutionDraft(value)
    } else {
      setInstitutionDraft(value)
    }
    setSelectedInstitutionSuggestions((current) => {
      if (!institutionSuggestionMatchesValue(current[slot], value)) {
        if (!current[slot]) {
          return current
        }
        return { ...current, [slot]: null }
      }
      return current
    })
  }, [])

  const syncAffiliationBylineDraftsFromForm = useCallback((nextForm: CollaboratorFormState) => {
    setPrimaryAffiliationBylineDraft(collaboratorBylineDraftFromForm(nextForm, 'primary'))
    setSecondaryAffiliationBylineDraft(collaboratorBylineDraftFromForm(nextForm, 'secondary'))
  }, [])

  const markCollaboratorContactSnapshot = useCallback((collaboratorId: string, nextForm: CollaboratorFormState) => {
    collaboratorContactSnapshotByIdRef.current.set(
      collaboratorId,
      serializeCollaboratorContactUpdateInput(toCollaboratorContactUpdateInput(nextForm)),
    )
    collaboratorContactFailedSnapshotByIdRef.current.delete(collaboratorId)
  }, [])

  const updateCollaboratorInListing = useCallback((nextCollaborator: CollaboratorPayload) => {
    setListing((current) => {
      if (!current) {
        return current
      }
      return {
        ...current,
        items: current.items.map((item) => (item.id === nextCollaborator.id ? nextCollaborator : item)),
      }
    })
  }, [])

  const flushCollaboratorContactSaveQueue = useCallback(async () => {
    if (collaboratorContactSaveInFlightRef.current) {
      return
    }
    collaboratorContactSaveInFlightRef.current = true
    try {
      while (collaboratorContactSaveQueueRef.current.length > 0) {
        const next = collaboratorContactSaveQueueRef.current.shift()
        if (!next) {
          continue
        }
        const queuedSnapshot = collaboratorContactQueuedSnapshotByIdRef.current.get(next.collaboratorId)
        if (queuedSnapshot && queuedSnapshot !== next.snapshot) {
          continue
        }
        collaboratorContactQueuedSnapshotByIdRef.current.delete(next.collaboratorId)
        collaboratorContactInFlightSnapshotByIdRef.current.set(next.collaboratorId, next.snapshot)
        const token = getAuthSessionToken()
        if (!token) {
          collaboratorContactInFlightSnapshotByIdRef.current.delete(next.collaboratorId)
          if (selectedCollaboratorIdRef.current === next.collaboratorId) {
            setCollaboratorContactSaving(false)
            setStatus('')
            setError('Could not save collaborator details because your session has expired.')
          }
          continue
        }
        if (selectedCollaboratorIdRef.current === next.collaboratorId) {
          setCollaboratorContactSaving(true)
          setStatus('Saving collaborator details...')
          setError('')
        }
        try {
          const saved = await updateCollaborator(token, next.collaboratorId, next.payload)
          updateCollaboratorInListing(saved)
          markCollaboratorContactSnapshot(saved.id, toFormState(saved))
          if (selectedCollaboratorIdRef.current === saved.id) {
            setStatus('')
            setError('')
          }
        } catch (saveError) {
          collaboratorContactFailedSnapshotByIdRef.current.set(next.collaboratorId, next.snapshot)
          if (selectedCollaboratorIdRef.current === next.collaboratorId) {
            setStatus('')
            setError(saveError instanceof Error ? saveError.message : 'Could not save collaborator details.')
          }
        } finally {
          if (collaboratorContactInFlightSnapshotByIdRef.current.get(next.collaboratorId) === next.snapshot) {
            collaboratorContactInFlightSnapshotByIdRef.current.delete(next.collaboratorId)
          }
          if (selectedCollaboratorIdRef.current === next.collaboratorId) {
            const stillQueued = collaboratorContactSaveQueueRef.current.some((item) => item.collaboratorId === next.collaboratorId)
              || collaboratorContactQueuedSnapshotByIdRef.current.has(next.collaboratorId)
            setCollaboratorContactSaving(stillQueued)
          }
        }
      }
    } finally {
      collaboratorContactSaveInFlightRef.current = false
    }
  }, [markCollaboratorContactSnapshot, updateCollaboratorInListing])

  const queueCollaboratorContactSave = useCallback((
    collaboratorId: string,
    nextForm: CollaboratorFormState,
    options?: { immediate?: boolean },
  ) => {
    const payload = toCollaboratorContactUpdateInput(nextForm)
    const snapshot = serializeCollaboratorContactUpdateInput(payload)
    if (snapshot === collaboratorContactSnapshotByIdRef.current.get(collaboratorId)) {
      return
    }
    if (!options?.immediate && snapshot === collaboratorContactFailedSnapshotByIdRef.current.get(collaboratorId)) {
      return
    }
    if (snapshot === collaboratorContactQueuedSnapshotByIdRef.current.get(collaboratorId)) {
      return
    }
    if (snapshot === collaboratorContactInFlightSnapshotByIdRef.current.get(collaboratorId)) {
      return
    }
    const queue = collaboratorContactSaveQueueRef.current
    const existingIndex = queue.findIndex((item) => item.collaboratorId === collaboratorId)
    const queueItem: CollaboratorContactSaveQueueItem = {
      collaboratorId,
      payload,
      snapshot,
    }
    if (existingIndex >= 0) {
      queue[existingIndex] = queueItem
    } else {
      queue.push(queueItem)
    }
    collaboratorContactQueuedSnapshotByIdRef.current.set(collaboratorId, snapshot)
    if (selectedCollaboratorIdRef.current === collaboratorId) {
      setError('')
      if (options?.immediate) {
        setStatus('Saving collaborator details...')
      }
    }
    if (options?.immediate) {
      void flushCollaboratorContactSaveQueue()
    }
  }, [flushCollaboratorContactSaveQueue])

  const applyCollaboratorFormState = useCallback((
    collaborator: CollaboratorPayload,
    options?: { pendingReview?: Partial<Record<CollaboratorAffiliationSlotKey, boolean>> },
  ) => {
    collaboratorInstitutionLookupSequenceRef.current += 1
    const nextForm = toFormState(collaborator)
    collaboratorFormRef.current = nextForm
    setForm(nextForm)
    setIdentityDraft(collaboratorIdentityDraftFromForm(nextForm))
    setEditingIdentity(false)
    setPrimaryEmailDraft(collaborator.contact_email || '')
    setEditingPrimaryEmail(false)
    setInstitutionDraft(nextForm.primary_institution)
    setEditingInstitution(false)
    setShowSecondaryInstitutionInput(Boolean(nextForm.secondary_institution))
    setSecondaryInstitutionDraft(nextForm.secondary_institution)
    setEditingSecondaryInstitution(false)
    syncAffiliationBylineDraftsFromForm(nextForm)
    setEditingAffiliationBylineSlot(null)
    resetInstitutionSuggestionState()
    setSelectedInstitutionSuggestions({ primary: null, secondary: null })
    setShowSecondaryEmailInput(Boolean(collaborator.contact_secondary_email))
    setSecondaryEmailDraft(collaborator.contact_secondary_email || '')
    setEditingSecondaryEmail(false)
    setDuplicateWarnings(collaborator.duplicate_warnings || [])
    setPendingInstitutionReview({
      primary: Boolean(options?.pendingReview?.primary),
      secondary: Boolean(options?.pendingReview?.secondary),
    })
    markCollaboratorContactSnapshot(collaborator.id, nextForm)
  }, [markCollaboratorContactSnapshot, resetInstitutionSuggestionState, syncAffiliationBylineDraftsFromForm])

  const clearCollaboratorFormState = useCallback(() => {
    collaboratorInstitutionLookupSequenceRef.current += 1
    collaboratorFormRef.current = EMPTY_FORM
    setForm(EMPTY_FORM)
    setIdentityDraft(collaboratorIdentityDraftFromForm(EMPTY_FORM))
    setEditingIdentity(false)
    setPrimaryEmailDraft('')
    setEditingPrimaryEmail(false)
    setInstitutionDraft('')
    setEditingInstitution(false)
    setShowSecondaryInstitutionInput(false)
    setSecondaryInstitutionDraft('')
    setEditingSecondaryInstitution(false)
    syncAffiliationBylineDraftsFromForm(EMPTY_FORM)
    setEditingAffiliationBylineSlot(null)
    resetInstitutionSuggestionState()
    setSelectedInstitutionSuggestions({ primary: null, secondary: null })
    setShowSecondaryEmailInput(false)
    setSecondaryEmailDraft('')
    setEditingSecondaryEmail(false)
    setDuplicateWarnings([])
    setPendingInstitutionReview({ primary: false, secondary: false })
    setCollaboratorContactSaving(false)
  }, [resetInstitutionSuggestionState, syncAffiliationBylineDraftsFromForm])

  const onAffiliationBylineDraftChange = useCallback((
    slot: CollaboratorAffiliationSlotKey,
    field: keyof CollaboratorAffiliationBylineDraft,
    value: string,
  ) => {
    if (slot === 'secondary') {
      setSecondaryAffiliationBylineDraft((current) => ({ ...current, [field]: value }))
      return
    }
    setPrimaryAffiliationBylineDraft((current) => ({ ...current, [field]: value }))
  }, [])

  const applyAffiliationBylineDraft = useCallback((slot: CollaboratorAffiliationSlotKey) => {
    const draft = slot === 'secondary' ? secondaryAffiliationBylineDraft : primaryAffiliationBylineDraft
    const nextForm = slot === 'secondary'
      ? {
          ...form,
          secondary_affiliation_department: draft.department,
          secondary_affiliation_address_line_1: draft.address_line_1,
          secondary_affiliation_city: draft.city,
          secondary_affiliation_region: draft.region,
          secondary_affiliation_postal_code: draft.postal_code,
          secondary_affiliation_country: draft.country,
        }
      : {
          ...form,
          primary_affiliation_department: draft.department,
          primary_affiliation_address_line_1: draft.address_line_1,
          primary_affiliation_city: draft.city,
          primary_affiliation_region: draft.region,
          primary_affiliation_postal_code: draft.postal_code,
          primary_affiliation_country: draft.country,
        }
    setForm(nextForm)
    if (selectedId) {
      queueCollaboratorContactSave(selectedId, nextForm, { immediate: true })
    }
    setEditingAffiliationBylineSlot(null)
  }, [form, primaryAffiliationBylineDraft, queueCollaboratorContactSave, secondaryAffiliationBylineDraft, selectedId])

  const cancelAffiliationBylineDraft = useCallback((slot: CollaboratorAffiliationSlotKey) => {
    setEditingAffiliationBylineSlot(null)
    if (slot === 'secondary') {
      setSecondaryAffiliationBylineDraft(collaboratorBylineDraftFromForm(form, 'secondary'))
      return
    }
    setPrimaryAffiliationBylineDraft(collaboratorBylineDraftFromForm(form, 'primary'))
  }, [form])

  const syncInstitutionSlotFromSuggestion = useCallback(async (
    token: string,
    slot: CollaboratorAffiliationSlotKey,
    sourceName: string,
    options?: {
      clearInstitutionOnFailure?: boolean
      markPending?: boolean
      persist?: boolean
      preferredSuggestion?: AffiliationSuggestionItem | null
    },
  ) => {
    const clean = sanitizeAffiliation(sourceName)
    const requestId = collaboratorInstitutionLookupSequenceRef.current + 1
    collaboratorInstitutionLookupSequenceRef.current = requestId
    const clearInstitutionOnFailure = Boolean(options?.clearInstitutionOnFailure)
    const markPending = Boolean(options?.markPending)
    const persist = Boolean(options?.persist)
    const setSlotState = (
      resolvedInstitution: string,
      openalexId: string,
      metadata: CollaboratorAffiliationBylineDraft,
    ) => {
      const nextForm = applyInstitutionResolutionToForm(
        collaboratorFormRef.current,
        slot,
        resolvedInstitution,
        openalexId,
        metadata,
      )
      collaboratorFormRef.current = nextForm
      setForm(nextForm)
      if (slot === 'secondary') {
        setSecondaryInstitutionDraft(resolvedInstitution)
        setShowSecondaryInstitutionInput(Boolean(resolvedInstitution))
        setSecondaryAffiliationBylineDraft((current) => ({
          ...current,
          address_line_1: metadata.address_line_1,
          city: metadata.city,
          region: metadata.region,
          postal_code: metadata.postal_code,
          country: metadata.country,
        }))
      } else {
        setInstitutionDraft(resolvedInstitution)
        setPrimaryAffiliationBylineDraft((current) => ({
          ...current,
          address_line_1: metadata.address_line_1,
          city: metadata.city,
          region: metadata.region,
          postal_code: metadata.postal_code,
          country: metadata.country,
        }))
      }
      setPendingInstitutionReview((current) => ({ ...current, [slot]: markPending }))
      if (persist && selectedId) {
        queueCollaboratorContactSave(selectedId, nextForm, { immediate: true })
      }
    }
    if (!clean) {
      setSlotState('', '', {
        department: '',
        address_line_1: '',
        city: '',
        region: '',
        postal_code: '',
        country: '',
      })
      return false
    }
    try {
      let matched = institutionSuggestionMatchesValue(options?.preferredSuggestion, clean)
        ? options?.preferredSuggestion || null
        : null
      if (!matched) {
        const suggestionsPayload = await fetchAffiliationSuggestionsForMe(token, {
          query: clean,
          limit: 5,
        })
        if (collaboratorInstitutionLookupSequenceRef.current !== requestId) {
          return false
        }
        const suggestions = suggestionsPayload.items
          .map(mapAffiliationSuggestionItem)
          .filter((item): item is AffiliationSuggestionItem => Boolean(item))
        matched = pickClearOpenAlexInstitutionMatch(clean, suggestions)
      }
      if (!matched) {
        setSlotState(clearInstitutionOnFailure ? '' : clean, '', {
          department: '',
          address_line_1: '',
          city: '',
          region: '',
          postal_code: '',
          country: '',
        })
        return false
      }
      let metadata = collaboratorBylineDraftFromSuggestion(matched)
      const matchedOpenAlexId = sanitizeAffiliation(matched.openalexId)
      setSlotState(matched.name, matchedOpenAlexId, metadata)
      try {
        const resolved = await fetchAffiliationAddressForMe(token, {
          name: matched.name,
          city: matched.city || undefined,
          region: matched.region || undefined,
          country: matched.countryName || undefined,
        })
        if (collaboratorInstitutionLookupSequenceRef.current !== requestId) {
          return false
        }
        metadata = {
          department: '',
          address_line_1: sanitizeAffiliation(resolved.line_1) || metadata.address_line_1,
          city: sanitizeAffiliation(resolved.city) || metadata.city,
          region: sanitizeAffiliation(resolved.region) || metadata.region,
          postal_code: sanitizeAffiliation(resolved.postal_code) || metadata.postal_code,
          country: sanitizeAffiliation(resolved.country_name) || metadata.country,
        }
      } catch {
        // Keep the suggestion metadata when address resolution misses.
      }
      setSlotState(matched.name, matchedOpenAlexId, metadata)
      return true
    } catch {
      if (collaboratorInstitutionLookupSequenceRef.current === requestId) {
        setSlotState(clearInstitutionOnFailure ? '' : clean, '', {
          department: '',
          address_line_1: '',
          city: '',
          region: '',
          postal_code: '',
          country: '',
        })
      }
      return false
    }
  }, [queueCollaboratorContactSave, selectedId])

  const bootstrapCollaboratorAffiliations = useCallback(async (
    token: string,
    collaborator: CollaboratorPayload,
  ) => {
    const initialForm = toFormState(collaborator)
    const rawCandidates = rawCollaboratorInstitutionCandidates(collaborator)
    const existingPrimary = sanitizeAffiliation(initialForm.primary_institution)
    const existingSecondary = sanitizeAffiliation(initialForm.secondary_institution)
    const primarySource = existingPrimary || rawCandidates[0] || ''
    const secondarySource = existingSecondary || rawCandidates.find(
      (candidate) => normalizeInstitutionKey(candidate) !== normalizeInstitutionKey(primarySource),
    ) || ''
    const primaryNeedsHydration = collaboratorInstitutionSlotNeedsHydration(initialForm, 'primary')
    const secondaryNeedsHydration = collaboratorInstitutionSlotNeedsHydration(initialForm, 'secondary')

    if (primarySource && primaryNeedsHydration) {
      await syncInstitutionSlotFromSuggestion(token, 'primary', primarySource, {
        clearInstitutionOnFailure: !existingPrimary,
        markPending: !existingPrimary,
        persist: true,
      })
    }
    if (
      secondarySource
      && normalizeInstitutionKey(secondarySource) !== normalizeInstitutionKey(primarySource)
      && secondaryNeedsHydration
    ) {
      await syncInstitutionSlotFromSuggestion(token, 'secondary', secondarySource, {
        clearInstitutionOnFailure: !existingSecondary,
        markPending: !existingSecondary,
        persist: true,
      })
    }
  }, [syncInstitutionSlotFromSuggestion])

  const nowYear = new Date().getUTCFullYear()
  const heatmapCells = useMemo<HeatmapCell[]>(() => {
    const buckets = new Map<
      string,
      {
        label: string
        value: number
        collaborator_ids: Set<string>
      }
    >()
    for (const item of canonicalCollaborators) {
      const weight = heatmapMetricValue(item, heatmapMetric, nowYear)
      if (heatmapMode === 'country') {
        const key = normalizeHeatmapBucket(item.country, 'Unknown')
        const existing = buckets.get(key) || { label: key, value: 0, collaborator_ids: new Set<string>() }
        existing.value += weight
        existing.collaborator_ids.add(item.id)
        buckets.set(key, existing)
        continue
      }
      if (heatmapMode === 'institution') {
        const institutions = item.institution_labels.length > 0 ? item.institution_labels : [item.primary_institution || 'Unknown']
        for (const institution of institutions) {
          const key = normalizeHeatmapBucket(institution, 'Unknown')
          const existing = buckets.get(key) || { label: key, value: 0, collaborator_ids: new Set<string>() }
          existing.value += weight
          existing.collaborator_ids.add(item.id)
          buckets.set(key, existing)
        }
        continue
      }
      const domains = item.research_domains.length > 0 ? item.research_domains : ['General']
      for (const domain of domains) {
        const key = normalizeHeatmapBucket(domain, 'General')
        const existing = buckets.get(key) || { label: key, value: 0, collaborator_ids: new Set<string>() }
        existing.value += weight
        existing.collaborator_ids.add(item.id)
        buckets.set(key, existing)
      }
    }
    const sortedBuckets = Array.from(buckets.values()).sort((left, right) => {
        if (left.value === right.value) {
          return left.label.localeCompare(right.label)
        }
        return right.value - left.value
      })
    const primaryBuckets = sortedBuckets.slice(0, HEATMAP_TOP_CELL_LIMIT)
    const remainingBuckets = sortedBuckets.slice(HEATMAP_TOP_CELL_LIMIT)
    const cells: HeatmapCell[] = primaryBuckets.map((entry) => ({
      key: entry.label,
      label: entry.label,
      value: entry.value,
      collaborators: entry.collaborator_ids.size,
      bucketLabels: [entry.label],
    }))

    if (remainingBuckets.length > 0) {
      let value = 0
      const collaboratorIds = new Set<string>()
      const bucketLabels: string[] = []
      for (const entry of remainingBuckets) {
        value += entry.value
        bucketLabels.push(entry.label)
        for (const id of entry.collaborator_ids) {
          collaboratorIds.add(id)
        }
      }
      cells.push({
        key: HEATMAP_OTHERS_KEY,
        label: 'Others',
        value,
        collaborators: collaboratorIds.size,
        bucketLabels,
      })
    }

    return cells
  }, [canonicalCollaborators, heatmapMetric, heatmapMode, nowYear])

  const heatmapQuantiles = useMemo<HeatmapQuantiles | null>(() => {
    const values = heatmapCells.map((cell) => cell.value).filter((value) => value > 0)
    if (values.length === 0) {
      return null
    }
    return {
      q20: quantile(values, 0.2),
      q40: quantile(values, 0.4),
      q60: quantile(values, 0.6),
      q80: quantile(values, 0.8),
      max: Math.max(...values),
    }
  }, [heatmapCells])


  const collaborationStrengthToneById = useMemo(() => {
    const fallbackTone = collaborationStrengthTone(0)
    return canonicalCollaborators.reduce<Map<string, string>>((accumulator, item) => {
      const rawScore = Math.max(0, Number(item.metrics.collaboration_strength_score || 0))
      accumulator.set(item.id, rawScore > 0 ? collaborationStrengthTone(rawScore) : fallbackTone)
      return accumulator
    }, new Map<string, string>())
  }, [canonicalCollaborators])
  const activeHeatmapCell = useMemo(() => {
    if (!heatmapSelection || heatmapSelection.mode !== heatmapMode) {
      return null
    }
    return heatmapCells.find((cell) => cell.key === heatmapSelection.label) || null
  }, [heatmapCells, heatmapMode, heatmapSelection])

  const filteredCollaborators = useMemo(() => {
    const items = canonicalCollaborators
    if (!heatmapSelection) {
      return items
    }
    const matchedCell =
      heatmapSelection.mode === heatmapMode
        ? heatmapCells.find((cell) => cell.key === heatmapSelection.label)
        : null
    const selectedBucketLabels = matchedCell ? new Set(matchedCell.bucketLabels) : null
    if (!selectedBucketLabels && heatmapSelection.label === HEATMAP_OTHERS_KEY) {
      return items
    }

    const matchesSingle = (value: string | null | undefined, fallback: string): boolean => {
      const key = normalizeHeatmapBucket(value, fallback)
      if (selectedBucketLabels) {
        return selectedBucketLabels.has(key)
      }
      return key === heatmapSelection.label
    }

    return items.filter((item) => {
      if (heatmapSelection.mode === 'country') {
        return matchesSingle(item.country, 'Unknown')
      }
      if (heatmapSelection.mode === 'institution') {
        const institutions = item.institution_labels.length > 0 ? item.institution_labels : [item.primary_institution || 'Unknown']
        return institutions.some((institution) => matchesSingle(institution, 'Unknown'))
      }
      const domains = item.research_domains.length > 0 ? item.research_domains : ['General']
      if (selectedBucketLabels) {
        return domains.some((domain) => selectedBucketLabels.has(normalizeHeatmapBucket(domain, 'General')))
      }
      return domains.some((domain) => normalizeHeatmapBucket(domain, 'General') === heatmapSelection.label)
    })
  }, [canonicalCollaborators, heatmapCells, heatmapMode, heatmapSelection])

  const visibleCollaborationTableColumns = useMemo(() => (
    collaborationTableColumnOrder.filter((column) => collaborationTableColumns[column].visible)
  ), [collaborationTableColumnOrder, collaborationTableColumns])

  useLayoutEffect(() => {
    const node = collaborationTableLayoutRef.current
    if (!node) {
      return
    }
    const updateWidth = () => {
      const measuredWidth = Math.round(node.clientWidth || node.getBoundingClientRect().width || 320)
      setCollaborationTableLayoutWidth(Math.max(320, measuredWidth))
    }
    updateWidth()
    if (typeof ResizeObserver === 'undefined') {
      window.addEventListener('resize', updateWidth)
      return () => {
        window.removeEventListener('resize', updateWidth)
      }
    }
    const observer = new ResizeObserver(() => {
      updateWidth()
    })
    observer.observe(node)
    return () => {
      observer.disconnect()
    }
  }, [collaborationLibraryVisible, visibleCollaborationTableColumns.length])

  useLayoutEffect(() => {
    const availableWidth = resolveCollaborationTableAvailableWidth()
    setCollaborationTableColumns((current) => {
      const next = clampCollaborationTableColumnsToAvailableWidth({
        columns: current,
        columnOrder: collaborationTableColumnOrder,
        availableWidth,
      })
      if (collaborationTableColumnsEqual(current, next)) {
        return current
      }
      return next
    })
  }, [collaborationTableColumnOrder, collaborationTableLayoutWidth, resolveCollaborationTableAvailableWidth])

  useEffect(() => {
    if (!collaborationSearchVisible || !collaborationLibrarySearchButtonRef.current) return
    const rect = collaborationLibrarySearchButtonRef.current.getBoundingClientRect()
    setCollaborationLibrarySearchPopoverPosition({
      top: rect.top,
      right: window.innerWidth - rect.left + 8,
    })
  }, [collaborationSearchVisible])

  useEffect(() => {
    if (!collaborationFilterVisible || !collaborationLibraryFilterButtonRef.current) return
    const rect = collaborationLibraryFilterButtonRef.current.getBoundingClientRect()
    setCollaborationLibraryFilterPopoverPosition({
      top: rect.top,
      right: window.innerWidth - rect.left + 8,
    })
  }, [collaborationFilterVisible])

  useEffect(() => {
    if (!collaborationDownloadVisible || !collaborationLibraryDownloadButtonRef.current) return
    const rect = collaborationLibraryDownloadButtonRef.current.getBoundingClientRect()
    setCollaborationLibraryDownloadPopoverPosition({
      top: rect.top,
      right: window.innerWidth - rect.left + 8,
    })
  }, [collaborationDownloadVisible])

  useEffect(() => {
    if (!collaborationSettingsVisible || !collaborationLibrarySettingsButtonRef.current) return
    const rect = collaborationLibrarySettingsButtonRef.current.getBoundingClientRect()
    setCollaborationLibrarySettingsPopoverPosition({
      top: rect.top,
      right: window.innerWidth - rect.left + 8,
    })
  }, [collaborationSettingsVisible])

  useEffect(() => {
    if (!collaborationFilterVisible && !collaborationSearchVisible && !collaborationDownloadVisible && !collaborationSettingsVisible) {
      return
    }
    const onPointerDown = (event: MouseEvent | TouchEvent) => {
      const target = event.target as Node | null
      if (!target) {
        return
      }
      const popoverNode = collaborationLibraryFilterPopoverRef.current
      const buttonNode = collaborationLibraryFilterButtonRef.current
      const searchPopoverNode = collaborationLibrarySearchPopoverRef.current
      const searchButtonNode = collaborationLibrarySearchButtonRef.current
      const downloadPopoverNode = collaborationLibraryDownloadPopoverRef.current
      const downloadButtonNode = collaborationLibraryDownloadButtonRef.current
      const settingsPopoverNode = collaborationLibrarySettingsPopoverRef.current
      const settingsButtonNode = collaborationLibrarySettingsButtonRef.current
      if (
        (popoverNode && popoverNode.contains(target)) ||
        (buttonNode && buttonNode.contains(target)) ||
        (searchPopoverNode && searchPopoverNode.contains(target)) ||
        (searchButtonNode && searchButtonNode.contains(target)) ||
        (downloadPopoverNode && downloadPopoverNode.contains(target)) ||
        (downloadButtonNode && downloadButtonNode.contains(target)) ||
        (settingsPopoverNode && settingsPopoverNode.contains(target)) ||
        (settingsButtonNode && settingsButtonNode.contains(target))
      ) {
        return
      }
      setCollaborationFilterVisible(false)
      setCollaborationSearchVisible(false)
      setCollaborationDownloadVisible(false)
      setCollaborationSettingsVisible(false)
    }
    document.addEventListener('mousedown', onPointerDown)
    document.addEventListener('touchstart', onPointerDown)
    return () => {
      document.removeEventListener('mousedown', onPointerDown)
      document.removeEventListener('touchstart', onPointerDown)
    }
  }, [collaborationDownloadVisible, collaborationFilterVisible, collaborationSearchVisible, collaborationSettingsVisible])

  const onReorderCollaborationColumn = useCallback((fromColumn: CollaborationTableColumnKey, toColumn: CollaborationTableColumnKey) => {
    if (fromColumn === toColumn) {
      return
    }
    setCollaborationTableColumnOrder((current) => {
      const visibleOrder = current.filter((columnKey) => collaborationTableColumns[columnKey].visible)
      const fromIndex = visibleOrder.indexOf(fromColumn)
      const toIndex = visibleOrder.indexOf(toColumn)
      if (fromIndex < 0 || toIndex < 0) {
        return current
      }
      const nextVisibleOrder = [...visibleOrder]
      nextVisibleOrder.splice(fromIndex, 1)
      nextVisibleOrder.splice(toIndex, 0, fromColumn)
      const queue = [...nextVisibleOrder]
      return current.map((columnKey) => (
        collaborationTableColumns[columnKey].visible ? (queue.shift() || columnKey) : columnKey
      ))
    })
  }, [collaborationTableColumns])

  const onToggleCollaborationColumnVisibility = (column: CollaborationTableColumnKey) => {
    const availableWidth = resolveCollaborationTableAvailableWidth()
    setCollaborationTableColumns((current) => {
      const visibleCount = collaborationTableColumnOrder.reduce(
        (count, key) => count + (current[key].visible ? 1 : 0),
      0,
      )
      if (current[column].visible && visibleCount <= 1) {
        return current
      }
      const next = {
        ...current,
        [column]: {
          ...current[column],
          visible: !current[column].visible,
        },
      }
      return clampCollaborationTableColumnsToAvailableWidth({
        columns: next,
        columnOrder: collaborationTableColumnOrder,
        availableWidth,
      })
    })
  }

  const onResetCollaborationTableLayout = () => {
    const availableWidth = resolveCollaborationTableAvailableWidth()
    setCollaborationTableColumns(createDefaultCollaborationTableColumns(availableWidth))
    setCollaborationTableColumnOrder([...COLLABORATION_TABLE_COLUMN_ORDER])
  }

  const onResetCollaborationTableFilters = () => {
    setSort('strength')
    setSortDirection('desc')
    setCollaborationTableDensity('default')
    setCollaborationTableAlternateRowColoring(true)
    setCollaborationTableMetricHighlights(true)
    setCollaborationLibraryPageSize(COLLABORATORS_PAGE_SIZE_DEFAULT)
    setPage(1)
  }

  const onAutoAdjustCollaborationTableWidths = useCallback(() => {
    const availableWidth = resolveCollaborationTableAvailableWidth()
    const visibleColumns = collaborationTableColumnOrder.filter((column) => collaborationTableColumns[column].visible)
    if (visibleColumns.length === 0) {
      return
    }
    const perColumnWidth = Math.max(120, Math.floor(availableWidth / visibleColumns.length))
    setCollaborationTableColumns((current) => {
      const next = { ...current }
      for (const column of visibleColumns) {
        next[column] = {
          ...current[column],
          width: clampCollaborationTableColumnWidth(column, perColumnWidth),
        }
      }
      return clampCollaborationTableColumnsToAvailableWidth({
        columns: next,
        columnOrder: collaborationTableColumnOrder,
        availableWidth,
      })
    })
  }, [collaborationTableColumnOrder, collaborationTableColumns, resolveCollaborationTableAvailableWidth])

  const onStartCollaborationHeadingResize = useCallback((
    event: ReactPointerEvent<HTMLButtonElement>,
    column: CollaborationTableColumnKey,
  ) => {
    if (event.button !== 0) {
      return
    }
    event.preventDefault()
    event.stopPropagation()
    const visibleColumns = collaborationTableColumnOrder.filter((key) => collaborationTableColumns[key].visible)
    if (visibleColumns.length <= 1 || !visibleColumns.includes(column)) {
      return
    }
    const startWidths = visibleColumns.reduce<Partial<Record<CollaborationTableColumnKey, number>>>((accumulator, key) => {
      accumulator[key] = Number(collaborationTableColumns[key].width || COLLABORATION_TABLE_COLUMN_DEFAULTS[key].width)
      return accumulator
    }, {})
    collaborationTableResizeRef.current = {
      column,
      visibleColumns,
      startX: event.clientX,
      startWidths,
    }
    setCollaborationTableResizingColumn(column)
  }, [collaborationTableColumnOrder, collaborationTableColumns])

  const onCollaborationHeadingResizeHandleKeyDown = useCallback((
    event: ReactKeyboardEvent<HTMLButtonElement>,
    column: CollaborationTableColumnKey,
  ) => {
    if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') {
      return
    }
    event.preventDefault()
    event.stopPropagation()
    const deltaPx = event.key === 'ArrowLeft' ? -16 : 16
    const availableWidth = resolveCollaborationTableAvailableWidth()
    setCollaborationTableColumns((current) => {
      const visibleColumns = collaborationTableColumnOrder.filter((key) => current[key].visible)
      if (visibleColumns.length <= 1 || !visibleColumns.includes(column)) {
        return current
      }
      const startWidths = visibleColumns.reduce<Partial<Record<CollaborationTableColumnKey, number>>>((accumulator, key) => {
        accumulator[key] = Number(current[key].width || COLLABORATION_TABLE_COLUMN_DEFAULTS[key].width)
        return accumulator
      }, {})
      const resized = clampCollaborationTableDistributedResize({
        column,
        visibleColumns,
        startWidths,
        deltaPx,
      })
      let changed = false
      const next = { ...current }
      for (const key of visibleColumns) {
        const nextWidth = Number(resized[key] ?? current[key].width)
        if (nextWidth === current[key].width) {
          continue
        }
        changed = true
        next[key] = {
          ...current[key],
          width: nextWidth,
        }
      }
      if (!changed) {
        return current
      }
      return clampCollaborationTableColumnsToAvailableWidth({
        columns: next,
        columnOrder: collaborationTableColumnOrder,
        availableWidth,
      })
    })
  }, [collaborationTableColumnOrder, resolveCollaborationTableAvailableWidth])

  useEffect(() => {
    if (!collaborationTableResizingColumn) {
      return
    }
    const onPointerMove = (event: PointerEvent) => {
      const resizeState = collaborationTableResizeRef.current
      if (!resizeState) {
        return
      }
      const availableWidth = resolveCollaborationTableAvailableWidth()
      const resized = clampCollaborationTableDistributedResize({
        column: resizeState.column,
        visibleColumns: resizeState.visibleColumns,
        startWidths: resizeState.startWidths,
        deltaPx: event.clientX - resizeState.startX,
      })
      setCollaborationTableColumns((current) => {
        let changed = false
        const next = { ...current }
        for (const key of resizeState.visibleColumns) {
          const nextWidth = Number(resized[key] ?? current[key].width)
          if (nextWidth === current[key].width) {
            continue
          }
          changed = true
          next[key] = {
            ...current[key],
            width: nextWidth,
          }
        }
        if (!changed) {
          return current
        }
        return clampCollaborationTableColumnsToAvailableWidth({
          columns: next,
          columnOrder: collaborationTableColumnOrder,
          availableWidth,
        })
      })
    }
    const stopResize = () => {
      collaborationTableResizeRef.current = null
      setCollaborationTableResizingColumn(null)
    }
    window.addEventListener('pointermove', onPointerMove)
    window.addEventListener('pointerup', stopResize)
    window.addEventListener('pointercancel', stopResize)
    return () => {
      window.removeEventListener('pointermove', onPointerMove)
      window.removeEventListener('pointerup', stopResize)
      window.removeEventListener('pointercancel', stopResize)
    }
  }, [collaborationTableColumnOrder, collaborationTableResizingColumn, resolveCollaborationTableAvailableWidth])

  const onSortColumn = (column: CollaborationSortField) => {
    if (sort === column) {
      setSortDirection((current) => (current === 'desc' ? 'asc' : 'desc'))
      setPage(1)
      return
    }
    setSort(column)
    setSortDirection(column === 'name' ? 'asc' : 'desc')
    setPage(1)
  }

  const sortedCollaborators = useMemo(() => {
    const items = [...filteredCollaborators]
    const direction = sortDirection === 'asc' ? 1 : -1
    items.sort((left, right) => {
      const tieBreakByName =
        left.full_name.localeCompare(right.full_name, 'en-GB', { sensitivity: 'base' }) * direction
      if (sort === 'works') {
        const delta = (
          (Number(left.metrics.coauthored_works_count || 0) - Number(right.metrics.coauthored_works_count || 0))
          * direction
        )
        return delta !== 0 ? delta : tieBreakByName
      }
      if (sort === 'strength') {
        const delta = (
          (Number(left.metrics.collaboration_strength_score || 0) - Number(right.metrics.collaboration_strength_score || 0))
          * direction
        )
        return delta !== 0 ? delta : tieBreakByName
      }
      if (sort === 'relationship_tier') {
        const delta = (
          relationshipSortRank(resolveRelationshipTier(left.metrics)) -
          relationshipSortRank(resolveRelationshipTier(right.metrics))
        ) * direction
        return delta !== 0 ? delta : tieBreakByName
      }
      if (sort === 'activity_status') {
        const delta = (
          activitySortRank(resolveActivityStatus(left.metrics)) -
          activitySortRank(resolveActivityStatus(right.metrics))
        ) * direction
        return delta !== 0 ? delta : tieBreakByName
      }
      if (sort === 'last_collaboration_year') {
        const delta = (
          (Number(left.metrics.last_collaboration_year || 0) - Number(right.metrics.last_collaboration_year || 0))
          * direction
        )
        return delta !== 0 ? delta : tieBreakByName
      }
      return tieBreakByName
    })
    return items
  }, [filteredCollaborators, sort, sortDirection])

  const useServerVisiblePage = !hasCompleteListing && !heatmapSelection && collaborationLibraryPageSize !== 'all'

  const totalPages = useMemo(
    () => {
      if (collaborationLibraryPageSize === 'all') {
        return 1
      }
      if (useServerVisiblePage) {
        return Math.max(
          1,
          Math.ceil(Math.max(Number(listing?.total || 0), sortedCollaborators.length) / collaborationLibraryPageSize),
        )
      }
      return Math.max(1, Math.ceil(sortedCollaborators.length / collaborationLibraryPageSize))
    },
    [collaborationLibraryPageSize, listing?.total, sortedCollaborators.length, useServerVisiblePage],
  )

  const pagedCollaborators = useMemo(() => {
    if (collaborationLibraryPageSize === 'all') {
      return sortedCollaborators
    }
    if (useServerVisiblePage) {
      return sortedCollaborators
    }
    const start = (page - 1) * collaborationLibraryPageSize
    return sortedCollaborators.slice(start, start + collaborationLibraryPageSize)
  }, [collaborationLibraryPageSize, page, sortedCollaborators, useServerVisiblePage])

  const ensureCollaboratorSharedWorksLoaded = useCallback(async (token: string, collaboratorId: string) => {
    const normalizedCollaboratorId = String(collaboratorId || '').trim()
    if (!normalizedCollaboratorId) {
      return
    }
    if (
      sharedWorksByCollaboratorId[normalizedCollaboratorId] ||
      sharedWorksLoadingByCollaboratorId[normalizedCollaboratorId] ||
      sharedWorksRequestInFlightRef.current.has(normalizedCollaboratorId)
    ) {
      return
    }

    sharedWorksRequestInFlightRef.current.add(normalizedCollaboratorId)
    setSharedWorksLoadingByCollaboratorId((current) => ({ ...current, [normalizedCollaboratorId]: true }))
    setSharedWorksErrorByCollaboratorId((current) => ({ ...current, [normalizedCollaboratorId]: '' }))
    try {
      const payload = await listCollaboratorSharedWorks(token, normalizedCollaboratorId)
      setSharedWorksByCollaboratorId((current) => ({ ...current, [normalizedCollaboratorId]: payload.items || [] }))
    } catch (loadError) {
      setSharedWorksErrorByCollaboratorId((current) => ({
        ...current,
        [normalizedCollaboratorId]: loadError instanceof Error ? loadError.message : 'Could not load co-authored publications.',
      }))
    } finally {
      sharedWorksRequestInFlightRef.current.delete(normalizedCollaboratorId)
      setSharedWorksLoadingByCollaboratorId((current) => ({ ...current, [normalizedCollaboratorId]: false }))
    }
  }, [sharedWorksByCollaboratorId, sharedWorksLoadingByCollaboratorId])

  useEffect(() => {
    if (!listing) {
      return
    }
    if (page > totalPages) {
      setPage(totalPages)
    }
  }, [listing, page, totalPages])

  useEffect(() => {
    setHeatmapSelection((current) => {
      if (!current || current.mode === heatmapMode) {
        return current
      }
      return null
    })
  }, [heatmapMode])

  useEffect(() => {
    const next = new URLSearchParams()
    const cleanQuery = query.trim()
    if (cleanQuery) {
      next.set('query', cleanQuery)
    }
    if (sort !== 'strength') {
      next.set('sort', sort)
    }
    if (page > 1) {
      next.set('page', String(page))
    }
    if (heatmapMode !== 'country') {
      next.set('heatmap_mode', heatmapMode)
    }
    if (heatmapMetric !== 'works') {
      next.set('heatmap_metric', heatmapMetric)
    }
    if (heatmapMode === 'country' && geoView !== 'map') {
      next.set('geo_view', geoView)
    }
    if (heatmapSelection && heatmapSelection.mode === heatmapMode && heatmapSelection.label.trim()) {
      next.set('heatmap_selection', heatmapSelection.label)
    }
    const nextEncoded = next.toString()
    const currentEncoded = searchParams.toString()
    if (nextEncoded !== currentEncoded) {
      setSearchParams(next, { replace: true })
    }
  }, [
    geoView,
    heatmapMetric,
    heatmapMode,
    heatmapSelection,
    page,
    query,
    searchParams,
    setSearchParams,
    sort,
  ])

  const applyLoadedListing = (listPayload: CollaboratorsListPayload) => {
    setListing(listPayload)
    const selectedStillPresent = selectedId
      ? listPayload.items.some((item) => item.id === selectedId)
      : false
    if (!selectedStillPresent && listPayload.items.length > 0) {
      const first = listPayload.items[0]
      setSelectedId(first.id)
      applyCollaboratorFormState(first)
    }
    if (listPayload.items.length === 0) {
      setSelectedId(null)
      clearCollaboratorFormState()
    }
  }

  const load = async (
    token: string,
    options?: { background?: boolean; pageOverride?: number; hydrateFull?: boolean },
  ) => {
    const background = Boolean(options?.background)
    const requestedPage = Math.max(1, Math.floor(options?.pageOverride ?? page))
    const requestedPageSize = resolveCollaborationFetchPageSize(collaborationLibraryPageSize)
    const requestId = collaborationLoadSequenceRef.current + 1
    const shouldHydrateFull = collaborationLibraryPageSize !== 'all'
      && (Boolean(options?.hydrateFull) || requestedPage === 1)
    collaborationLoadSequenceRef.current = requestId
    if (!background) {
      setLoading(true)
      setError('')
    }
    try {
      const sharedWorksPromise = listCollaboratorsSharedWorks(token)
      const landingPayload = await fetchCollaborationLanding(token, {
        query,
        sort,
        page: requestedPage,
        pageSize: requestedPageSize,
      })
      if (requestId !== collaborationLoadSequenceRef.current) {
        return
      }
      setSummary(landingPayload.summary)
      applyLoadedListing(landingPayload.listing)
      if (collaborationLibraryPageSize !== 'all') {
        writeCachedCollaborationLandingData({
          query,
          sort,
          page: requestedPage,
          pageSize: requestedPageSize,
          summary: landingPayload.summary,
          listing: landingPayload.listing,
          sharedWorksByCollaboratorId,
        })
      }
      void sharedWorksPromise
        .then((sharedWorksPayload) => {
          if (requestId !== collaborationLoadSequenceRef.current) {
            return
          }
          const itemsByCollaboratorId = sharedWorksPayload.items_by_collaborator_id || {}
          setSharedWorksByCollaboratorId(itemsByCollaboratorId)
          setSharedWorksLoadingByCollaboratorId((current) => {
            const next = { ...current }
            for (const collaboratorId of Object.keys(itemsByCollaboratorId)) {
              next[collaboratorId] = false
              sharedWorksRequestInFlightRef.current.delete(collaboratorId)
            }
            return next
          })
          setSharedWorksErrorByCollaboratorId((current) => {
            const next = { ...current }
            for (const collaboratorId of Object.keys(itemsByCollaboratorId)) {
              next[collaboratorId] = ''
            }
            return next
          })
          if (collaborationLibraryPageSize !== 'all') {
            writeCachedCollaborationLandingData({
              query,
              sort,
              page: requestedPage,
              pageSize: requestedPageSize,
              summary: landingPayload.summary,
              listing: landingPayload.listing,
              sharedWorksByCollaboratorId: itemsByCollaboratorId,
            })
          }
        })
        .catch(() => undefined)
      if (shouldHydrateFull && !isCollaboratorsListComplete(landingPayload.listing)) {
        void fetchAllCollaboratorsForCollaborationPage(token, {
          query,
          sort,
        })
          .then((fullPayload) => {
            if (requestId !== collaborationLoadSequenceRef.current) {
              return
            }
            applyLoadedListing(fullPayload)
          })
          .catch(() => undefined)
      }
    } catch (loadError) {
      if (!background && requestId === collaborationLoadSequenceRef.current) {
        setError(loadError instanceof Error ? loadError.message : 'Could not load collaboration page.')
      }
    } finally {
      if (!background && requestId === collaborationLoadSequenceRef.current) {
        setLoading(false)
      }
    }
  }

  useEffect(() => {
    const token = getAuthSessionToken()
    if (!token) {
      navigate('/auth', { replace: true })
      return
    }
    if (hasCompleteListing) {
      return
    }
    const cached = readCachedCollaborationLandingData({
      query,
      sort,
      page,
      pageSize: resolveCollaborationFetchPageSize(collaborationLibraryPageSize),
    })
    if (cached) {
      setSummary(cached.summary)
      setListing(cached.listing)
      setSharedWorksByCollaboratorId(cached.sharedWorksByCollaboratorId || {})
    }
    void load(token, { background: Boolean(cached) })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [applyCollaboratorFormState, clearCollaboratorFormState, collaborationLibraryPageSize, hasCompleteListing, navigate, page, sort])

  useEffect(() => {
    if (!summary || summary.status !== 'RUNNING') {
      return
    }
    const token = getAuthSessionToken()
    if (!token) {
      return
    }
    const timer = window.setInterval(() => {
      void fetchCollaborationMetricsSummary(token)
        .then((payload) => setSummary(payload))
        .catch(() => undefined)
    }, 8000)
    return () => window.clearInterval(timer)
  }, [summary])

  useEffect(() => {
    if (!selectedId) {
      return
    }
    const token = getAuthSessionToken()
    if (!token) {
      return
    }
    void getCollaborator(token, selectedId)
      .then(async (item) => {
        applyCollaboratorFormState(item)
        await bootstrapCollaboratorAffiliations(token, item)
      })
      .catch(() => undefined)
  }, [applyCollaboratorFormState, bootstrapCollaboratorAffiliations, selectedId])

  useEffect(() => {
    if (!selectedId) {
      return
    }
    const token = getAuthSessionToken()
    if (!token) {
      return
    }
    void ensureCollaboratorSharedWorksLoaded(token, selectedId)
  }, [ensureCollaboratorSharedWorksLoaded, selectedId])

  useEffect(() => {
    selectedCollaboratorIdRef.current = selectedId
  }, [selectedId])

  useEffect(() => {
    if (!selectedId) {
      return
    }
    const snapshot = serializeCollaboratorContactUpdateInput(toCollaboratorContactUpdateInput(form))
    if (snapshot === collaboratorContactSnapshotByIdRef.current.get(selectedId)) {
      return
    }
    if (snapshot === collaboratorContactQueuedSnapshotByIdRef.current.get(selectedId)) {
      return
    }
    const timer = window.setTimeout(() => {
      queueCollaboratorContactSave(selectedId, form)
      void flushCollaboratorContactSaveQueue()
    }, 700)
    return () => window.clearTimeout(timer)
  }, [flushCollaboratorContactSaveQueue, form, queueCollaboratorContactSave, selectedId])

  useEffect(() => {
    if (!institutionInputFocused) {
      setInstitutionSuggestionsLoading(false)
      setInstitutionSuggestionsError('')
      setInstitutionSuggestions([])
      return
    }
    const query = sanitizeAffiliation(institutionInputFocused === 'secondary' ? secondaryInstitutionDraft : institutionDraft)
    if (query.length < 2) {
      setInstitutionSuggestionsLoading(false)
      setInstitutionSuggestionsError('')
      setInstitutionSuggestions([])
      return
    }
    const token = getAuthSessionToken()
    if (!token) {
      setInstitutionSuggestionsLoading(false)
      setInstitutionSuggestionsError('')
      setInstitutionSuggestions([])
      return
    }
    let cancelled = false
    const timer = window.setTimeout(() => {
      setInstitutionSuggestionsLoading(true)
      setInstitutionSuggestionsError('')
      void fetchAffiliationSuggestionsForMe(token, { query, limit: 8 })
        .then((payload) => {
          if (cancelled) {
            return
          }
          setInstitutionSuggestions(
            payload.items
              .map(mapAffiliationSuggestionItem)
              .filter((item): item is AffiliationSuggestionItem => Boolean(item)),
          )
        })
        .catch((lookupError) => {
          if (cancelled) {
            return
          }
          setInstitutionSuggestions([])
          setInstitutionSuggestionsError(
            lookupError instanceof Error
              ? lookupError.message
              : 'Institution suggestions lookup failed.',
          )
        })
        .finally(() => {
          if (!cancelled) {
            setInstitutionSuggestionsLoading(false)
          }
        })
    }, AFFILIATION_LOOKUP_DEBOUNCE_MS)
    return () => {
      cancelled = true
      window.clearTimeout(timer)
    }
  }, [institutionDraft, institutionInputFocused, secondaryInstitutionDraft])

  const onSearch = async () => {
    const token = getAuthSessionToken()
    if (!token) {
      navigate('/auth', { replace: true })
      return
    }
    setPage(1)
    setHeatmapSelection(null)
    const requestedPageSize = resolveCollaborationFetchPageSize(collaborationLibraryPageSize)
    const cached = collaborationLibraryPageSize === 'all'
      ? null
      : readCachedCollaborationLandingData({
          query,
          sort,
          page: 1,
          pageSize: requestedPageSize,
        })
    if (cached) {
      setSummary(cached.summary)
      setListing(cached.listing)
      await load(token, { background: true, pageOverride: 1, hydrateFull: true })
      return
    }
    await load(token, { pageOverride: 1, hydrateFull: true })
  }

  const onSortChange = (value: CollaborationSortField) => {
    setPage(1)
    setSort(value)
    setSortDirection(value === 'name' ? 'asc' : 'desc')
  }

  const onToggleHeatmapSelection = (cellKey: string) => {
    setPage(1)
    setHeatmapSelection((current) => {
      if (current && current.mode === heatmapMode && current.label === cellKey) {
        return null
      }
      return { mode: heatmapMode, label: cellKey }
    })
  }

  const onMapMarkerDrilldown = (institution: string) => {
    const label = normalizeHeatmapBucket(institution, 'Unknown')
    setHeatmapMode('institution')
    setGeoView('grid')
    setPage(1)
    setHeatmapSelection({ mode: 'institution', label })
  }

  const onSelectCollaborator = (collaborator: CollaboratorPayload) => {
    setSelectedId(collaborator.id)
    setActiveCollaboratorDrilldownTab('details')
    applyCollaboratorFormState(collaborator)
    setStatus('')
    setError('')
    setCollaboratorDrilldownOpen(true)
  }

  const onOpenSharedPublication = useCallback((workId: string) => {
    const normalizedWorkId = String(workId || '').trim()
    if (!normalizedWorkId) {
      return
    }
    navigate(`/profile/publications?work=${encodeURIComponent(normalizedWorkId)}&tab=overview`)
  }, [navigate])

  const saveCurrentCollaboratorContactForm = useCallback((nextForm: CollaboratorFormState, options?: { immediate?: boolean }) => {
    if (!selectedId) {
      return
    }
    queueCollaboratorContactSave(selectedId, nextForm, options)
  }, [queueCollaboratorContactSave, selectedId])

  const onStartIdentityEdit = () => {
    if (activeCollaboratorEditor) {
      return
    }
    setIdentityDraft(collaboratorIdentityDraftFromForm(form))
    setEditingIdentity(true)
  }

  const onCommitIdentityDraft = () => {
    const nextForm = {
      ...form,
      salutation: identityDraft.salutation,
      first_name: identityDraft.first_name,
      middle_initial: identityDraft.middle_initial.trim().toUpperCase(),
      surname: identityDraft.surname,
    }
    setForm(nextForm)
    setIdentityDraft(collaboratorIdentityDraftFromForm(nextForm))
    setEditingIdentity(false)
    saveCurrentCollaboratorContactForm(nextForm, { immediate: true })
  }

  const onCancelIdentityDraft = () => {
    setIdentityDraft(collaboratorIdentityDraftFromForm(form))
    setEditingIdentity(false)
  }

  const onStartPrimaryEmailEdit = () => {
    if (activeCollaboratorEditor) {
      return
    }
    setPrimaryEmailDraft(form.email || '')
    setEditingPrimaryEmail(true)
  }

  const onStartInstitutionEdit = () => {
    if (activeCollaboratorEditor) {
      return
    }
    setInstitutionDraft(form.primary_institution || '')
    setSelectedInstitutionSuggestions((current) => ({ ...current, primary: null }))
    setEditingInstitution(true)
  }

  const onOpenSecondaryInstitutionDraft = () => {
    if (activeCollaboratorEditor) {
      return
    }
    setShowSecondaryInstitutionInput(true)
    setSecondaryInstitutionDraft(form.secondary_institution || '')
    setSelectedInstitutionSuggestions((current) => ({ ...current, secondary: null }))
    setEditingSecondaryInstitution(true)
  }

  const onOpenSecondaryEmailDraft = () => {
    if (activeCollaboratorEditor) {
      return
    }
    setShowSecondaryEmailInput(true)
    setSecondaryEmailDraft(form.secondary_email || '')
    setEditingSecondaryEmail(true)
  }

  const onCommitPrimaryEmailDraft = () => {
    const clean = primaryEmailDraft.trim()
    const nextForm = { ...form, email: clean }
    setForm(nextForm)
    saveCurrentCollaboratorContactForm(nextForm, { immediate: true })
    setPrimaryEmailDraft(clean)
    setEditingPrimaryEmail(false)
  }

  const onCancelPrimaryEmailDraft = () => {
    setPrimaryEmailDraft(form.email || '')
    setEditingPrimaryEmail(false)
  }

  const onCommitInstitutionDraft = async () => {
    const clean = sanitizeAffiliation(institutionDraft)
    const nextForm = {
      ...form,
      primary_institution: clean,
    }
    collaboratorFormRef.current = nextForm
    setInstitutionDraft(clean)
    setEditingInstitution(false)
    resetInstitutionSuggestionState()
    setPendingInstitutionReview((current) => ({ ...current, primary: false }))
    setForm(nextForm)
    const preferredSuggestion = institutionSuggestionMatchesValue(selectedInstitutionSuggestions.primary, clean)
      ? selectedInstitutionSuggestions.primary
      : null
    const token = getAuthSessionToken()
    if (!token) {
      saveCurrentCollaboratorContactForm(nextForm, { immediate: true })
      return
    }
    await syncInstitutionSlotFromSuggestion(token, 'primary', clean, {
      clearInstitutionOnFailure: false,
      markPending: false,
      persist: true,
      preferredSuggestion,
    })
  }

  const onCancelInstitutionDraft = () => {
    setInstitutionDraft(form.primary_institution || '')
    setEditingInstitution(false)
    resetInstitutionSuggestionState()
    setSelectedInstitutionSuggestions((current) => ({ ...current, primary: null }))
  }

  const onStartSecondaryInstitutionEdit = () => {
    if (activeCollaboratorEditor) {
      return
    }
    setShowSecondaryInstitutionInput(true)
    setSecondaryInstitutionDraft(form.secondary_institution || '')
    setSelectedInstitutionSuggestions((current) => ({ ...current, secondary: null }))
    setEditingSecondaryInstitution(true)
  }

  const onCommitSecondaryInstitutionDraft = async () => {
    const clean = sanitizeAffiliation(secondaryInstitutionDraft)
    const nextForm = {
      ...form,
      secondary_institution: clean,
    }
    collaboratorFormRef.current = nextForm
    setSecondaryInstitutionDraft(clean)
    setShowSecondaryInstitutionInput(Boolean(clean))
    setEditingSecondaryInstitution(false)
    resetInstitutionSuggestionState()
    setPendingInstitutionReview((current) => ({ ...current, secondary: false }))
    setForm(nextForm)
    const preferredSuggestion = institutionSuggestionMatchesValue(selectedInstitutionSuggestions.secondary, clean)
      ? selectedInstitutionSuggestions.secondary
      : null
    const token = getAuthSessionToken()
    if (!token) {
      saveCurrentCollaboratorContactForm(nextForm, { immediate: true })
      return
    }
    await syncInstitutionSlotFromSuggestion(token, 'secondary', clean, {
      clearInstitutionOnFailure: false,
      markPending: false,
      persist: true,
      preferredSuggestion,
    })
  }

  const onCancelSecondaryInstitutionDraft = () => {
    const committed = form.secondary_institution || ''
    setSecondaryInstitutionDraft(committed)
    setShowSecondaryInstitutionInput(Boolean(committed))
    setEditingSecondaryInstitution(false)
    resetInstitutionSuggestionState()
    setSelectedInstitutionSuggestions((current) => ({ ...current, secondary: null }))
  }

  const onStartSecondaryEmailEdit = () => {
    if (activeCollaboratorEditor) {
      return
    }
    setShowSecondaryEmailInput(true)
    setSecondaryEmailDraft(form.secondary_email || '')
    setEditingSecondaryEmail(true)
  }

  const onSelectInstitutionSuggestion = (suggestion: AffiliationSuggestionItem) => {
    if (institutionInputFocused === 'secondary') {
      setSecondaryInstitutionDraft(suggestion.name)
      setSelectedInstitutionSuggestions((current) => ({ ...current, secondary: suggestion }))
    } else {
      setInstitutionDraft(suggestion.name)
      setSelectedInstitutionSuggestions((current) => ({ ...current, primary: suggestion }))
    }
    setInstitutionSuggestions([])
    setInstitutionSuggestionsError('')
  }

  const onSetPrimaryInstitution = (value: string) => {
    const clean = sanitizeAffiliation(value)
    const currentPrimary = sanitizeAffiliation(form.primary_institution)
    const currentSecondary = sanitizeAffiliation(form.secondary_institution)
    if (!clean || clean.toLowerCase() === currentPrimary.toLowerCase() || clean.toLowerCase() !== currentSecondary.toLowerCase()) {
      return
    }
    const nextForm: CollaboratorFormState = {
      ...form,
      primary_institution: form.secondary_institution,
      secondary_institution: form.primary_institution,
      primary_institution_openalex_id: form.secondary_institution_openalex_id,
      secondary_institution_openalex_id: form.primary_institution_openalex_id,
      primary_affiliation_department: form.secondary_affiliation_department,
      primary_affiliation_address_line_1: form.secondary_affiliation_address_line_1,
      primary_affiliation_city: form.secondary_affiliation_city,
      primary_affiliation_region: form.secondary_affiliation_region,
      primary_affiliation_postal_code: form.secondary_affiliation_postal_code,
      primary_affiliation_country: form.secondary_affiliation_country,
      secondary_affiliation_department: form.primary_affiliation_department,
      secondary_affiliation_address_line_1: form.primary_affiliation_address_line_1,
      secondary_affiliation_city: form.primary_affiliation_city,
      secondary_affiliation_region: form.primary_affiliation_region,
      secondary_affiliation_postal_code: form.primary_affiliation_postal_code,
      secondary_affiliation_country: form.primary_affiliation_country,
    }
    setForm(nextForm)
    syncAffiliationBylineDraftsFromForm(nextForm)
    setPendingInstitutionReview({
      primary: pendingInstitutionReview.secondary,
      secondary: pendingInstitutionReview.primary,
    })
    setEditingAffiliationBylineSlot(null)
    setInstitutionDraft(nextForm.primary_institution)
    setSecondaryInstitutionDraft(nextForm.secondary_institution)
    setShowSecondaryInstitutionInput(Boolean(nextForm.secondary_institution))
    setEditingInstitution(false)
    setEditingSecondaryInstitution(false)
    resetInstitutionSuggestionState()
    setSelectedInstitutionSuggestions((current) => ({
      primary: current.secondary,
      secondary: current.primary,
    }))
    saveCurrentCollaboratorContactForm(nextForm, { immediate: true })
  }

  const onCommitSecondaryEmailDraft = () => {
    const clean = secondaryEmailDraft.trim()
    const nextForm = { ...form, secondary_email: clean }
    setForm(nextForm)
    saveCurrentCollaboratorContactForm(nextForm, { immediate: true })
    setSecondaryEmailDraft(clean)
    setShowSecondaryEmailInput(Boolean(clean))
    setEditingSecondaryEmail(false)
  }

  const onCancelSecondaryEmailDraft = () => {
    const committed = form.secondary_email || ''
    setSecondaryEmailDraft(committed)
    setShowSecondaryEmailInput(Boolean(committed))
    setEditingSecondaryEmail(false)
  }

  const onExport = async () => {
    const token = getAuthSessionToken()
    if (!token) {
      navigate('/auth', { replace: true })
      return
    }
    setError('')
    try {
      const payload = await exportCollaboratorsCsv(token)
      downloadTextFile(payload.filename, payload.content, 'text/csv;charset=utf-8')
    } catch (exportError) {
      setError(exportError instanceof Error ? exportError.message : 'Could not export collaborators.')
    }
  }

  const renderSharedWorksSortIcon = (field: CollaboratorSharedWorksSortField) => {
    if (sharedWorksSortField === field) {
      return sharedWorksSortDirection === 'desc'
        ? <ChevronDown className="h-3.5 w-3.5 text-foreground" />
        : <ChevronUp className="h-3.5 w-3.5 text-foreground" />
    }
    return <ChevronsUpDown className="h-3.5 w-3.5" />
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
          heading="Collaboration"
          description="View collaborative research metrics and shared impact."
          className="!ml-0 !mt-0"
        />
      </Row>

      <Section className={cn(HOUSE_SECTION_ANCHOR_CLASS)} surface="transparent" inset="none" spaceY="none">
        <SectionHeader heading="My collaborators" className="house-section-header-marker-aligned" />
        <div data-house-role="layout-section" className="grid gap-3 md:grid-cols-4">
          <div className="house-metric-tile-shell grid min-h-20 grid-rows-[auto_1fr] rounded-md border p-2">
            <p className="house-h2">Total collaborators</p>
            <div className="flex w-full items-center justify-center">
              <p className="house-metric-tile-value !mt-0 text-center">
                {totalCollaboratorsMetric === null ? '...' : totalCollaboratorsMetric.toLocaleString('en-GB')}
              </p>
            </div>
          </div>
          <div className="house-metric-tile-shell grid min-h-20 grid-rows-[auto_1fr] rounded-md border p-2">
            <p className="house-h2">Core collaborators</p>
            <div className="flex w-full items-center justify-center">
              <p className="house-metric-tile-value !mt-0 text-center">
                {coreCollaboratorsMetric === null ? '...' : coreCollaboratorsMetric.toLocaleString('en-GB')}
              </p>
            </div>
          </div>
          <div className="house-metric-tile-shell grid min-h-20 grid-rows-[auto_1fr] rounded-md border p-2">
            <p className="house-h2">Active collaborations (12m)</p>
            <div className="flex w-full items-center justify-center">
              <p className="house-metric-tile-value !mt-0 text-center">
                {activeCollaborationsMetric === null ? '...' : activeCollaborationsMetric.toLocaleString('en-GB')}
              </p>
            </div>
          </div>
          <div className="house-metric-tile-shell grid min-h-20 grid-rows-[auto_1fr] rounded-md border p-2">
            <p className="house-h2">New collaborators (12m)</p>
            <div className="flex w-full items-center justify-center">
              <p className="house-metric-tile-value !mt-0 text-center">
                {newCollaboratorsMetric === null ? '...' : newCollaboratorsMetric.toLocaleString('en-GB')}
              </p>
            </div>
          </div>
        </div>
        <SectionHeader
          heading="Collaborators"
          className="house-publications-toolbar-header house-collaboration-toolbar-header mt-[var(--separator-section-content-to-section-header)]"
          actions={(
          <div className="ml-auto flex h-8 w-full items-center justify-end gap-1 overflow-visible self-center md:w-auto">
            <SectionTools tone="publications" framed={false} className="order-1">
              {collaborationLibraryVisible ? (
                <div className="relative order-1 shrink-0">
                  <button
                    ref={collaborationLibrarySearchButtonRef}
                    type="button"
                    data-state={collaborationSearchVisible ? 'open' : 'closed'}
                    className={cn(
                      'h-8 w-8 house-publications-action-icon house-publications-top-control house-publications-search-toggle house-section-tool-button inline-flex items-center justify-center transition-[background-color,border-color,box-shadow] duration-[var(--motion-duration-ui)] ease-out',
                      collaborationSearchVisible && 'house-publications-tools-toggle-open',
                    )}
                    onClick={() => {
                      setCollaborationSearchVisible((current) => {
                        const nextVisible = !current
                        if (nextVisible) {
                          setCollaborationFilterVisible(false)
                          setCollaborationDownloadVisible(false)
                          setCollaborationSettingsVisible(false)
                        }
                        return nextVisible
                      })
                    }}
                    aria-pressed={collaborationSearchVisible}
                    aria-expanded={collaborationSearchVisible}
                    aria-label={collaborationSearchVisible ? 'Hide collaborators search' : 'Show collaborators search'}
                  >
                    <Search className="house-publications-tools-toggle-icon house-publications-search-toggle-icon h-[1.09rem] w-[1.09rem]" strokeWidth={2.1} />
                  </button>
                  {collaborationSearchVisible ? createPortal(
                    <div
                      ref={collaborationLibrarySearchPopoverRef}
                      className="house-publications-search-popover fixed z-50 w-[22.5rem]"
                      style={{
                        top: `${collaborationLibrarySearchPopoverPosition.top}px`,
                        right: `${collaborationLibrarySearchPopoverPosition.right}px`,
                      }}
                    >
                      <label className="house-publications-search-label" htmlFor="collaboration-library-search-input">
                        Search collaborators
                      </label>
                      <input
                        id="collaboration-library-search-input"
                        type="text"
                        autoFocus
                        value={query}
                        onChange={(event) => setQuery(event.target.value)}
                        onKeyDown={(event) => {
                          if (event.key === 'Enter') {
                            event.preventDefault()
                            void onSearch()
                          }
                        }}
                        placeholder="Search by collaborator name, email, ORCID, institution..."
                        className="house-publications-search-input"
                      />
                    </div>,
                    document.body
                  ) : null}
                </div>
              ) : null}
              {collaborationLibraryVisible ? (
                <div className="relative order-2 shrink-0">
                  <button
                    ref={collaborationLibraryFilterButtonRef}
                    type="button"
                    data-state={collaborationFilterVisible ? 'open' : 'closed'}
                    className={cn(
                      'h-8 w-8 house-publications-action-icon house-publications-top-control house-publications-filter-toggle house-section-tool-button inline-flex items-center justify-center transition-[background-color,border-color,box-shadow] duration-[var(--motion-duration-ui)] ease-out',
                      collaborationFilterVisible && 'house-publications-tools-toggle-open',
                    )}
                    onClick={() => {
                      setCollaborationFilterVisible((current) => {
                        const nextVisible = !current
                        if (nextVisible) {
                          setCollaborationSearchVisible(false)
                          setCollaborationDownloadVisible(false)
                          setCollaborationSettingsVisible(false)
                        }
                        return nextVisible
                      })
                    }}
                    aria-pressed={collaborationFilterVisible}
                    aria-expanded={collaborationFilterVisible}
                    aria-label={collaborationFilterVisible ? 'Hide collaborator filters' : 'Show collaborator filters'}
                  >
                    <Filter className="house-publications-tools-toggle-icon house-publications-filter-toggle-icon h-[1.09rem] w-[1.09rem]" strokeWidth={2.1} />
                  </button>
                  {collaborationFilterVisible ? createPortal(
                    <div
                      ref={collaborationLibraryFilterPopoverRef}
                      className="house-publications-filter-popover fixed z-50 w-[18.75rem]"
                      style={{
                        top: `${collaborationLibraryFilterPopoverPosition.top}px`,
                        right: `${collaborationLibraryFilterPopoverPosition.right}px`,
                      }}
                    >
                      <div className="house-publications-filter-header">
                        <p className="house-publications-filter-title">Filter table</p>
                        <button
                          type="button"
                          className="house-publications-filter-clear"
                          onClick={() => {
                            onResetCollaborationTableFilters()
                            setCollaborationFilterVisible(false)
                          }}
                        >
                          Clear
                        </button>
                      </div>
                      <details className="house-publications-filter-group" open>
                        <summary className="house-publications-filter-summary">
                          <span>Sort</span>
                          <span className="house-publications-filter-count">
                            {collaborationSortLabel(sort)}
                          </span>
                        </summary>
                        <div className="house-publications-filter-options">
                          {(['name', 'relationship_tier', 'activity_status', 'works', 'last_collaboration_year', 'strength'] as const).map((sortOption) => (
                            <label key={`collaboration-filter-sort-${sortOption}`} className="house-publications-filter-option">
                              <input
                                type="radio"
                                name="collaboration-filter-sort"
                                className="house-publications-filter-checkbox"
                                checked={sort === sortOption}
                                onChange={() => onSortChange(sortOption)}
                              />
                              <span className="house-publications-filter-option-label">{collaborationSortLabel(sortOption)}</span>
                            </label>
                          ))}
                        </div>
                      </details>
                      <details className="house-publications-filter-group" open>
                        <summary className="house-publications-filter-summary">
                          <span>Visuals</span>
                          <span className="house-publications-filter-count">
                            {(collaborationTableAlternateRowColoring ? 1 : 0) + (collaborationTableMetricHighlights ? 1 : 0)}/2
                          </span>
                        </summary>
                        <div className="house-publications-filter-options">
                          <label className="house-publications-filter-option">
                            <input
                              type="checkbox"
                              className="house-publications-filter-checkbox"
                              checked={collaborationTableAlternateRowColoring}
                              onChange={() => setCollaborationTableAlternateRowColoring((current) => !current)}
                            />
                            <span className="house-publications-filter-option-label">Alternate row shading</span>
                          </label>
                          <label className="house-publications-filter-option">
                            <input
                              type="checkbox"
                              className="house-publications-filter-checkbox"
                              checked={collaborationTableMetricHighlights}
                              onChange={() => setCollaborationTableMetricHighlights((current) => !current)}
                            />
                            <span className="house-publications-filter-option-label">Metric highlights (score)</span>
                          </label>
                        </div>
                      </details>
                      <details className="house-publications-filter-group" open>
                        <summary className="house-publications-filter-summary">
                          <span>Density</span>
                          <span className="house-publications-filter-count">
                            {collaborationTableDensity === 'default'
                              ? 'Default'
                              : collaborationTableDensity === 'compact'
                                ? 'Compact'
                                : 'Comfortable'}
                          </span>
                        </summary>
                        <div className="house-publications-filter-options">
                          {(['compact', 'default', 'comfortable'] as CollaborationTableDensity[]).map((densityOption) => (
                            <label key={`collaboration-filter-density-${densityOption}`} className="house-publications-filter-option">
                              <input
                                type="radio"
                                name="collaboration-filter-density"
                                className="house-publications-filter-checkbox"
                                checked={collaborationTableDensity === densityOption}
                                onChange={() => setCollaborationTableDensity(densityOption)}
                              />
                              <span className="house-publications-filter-option-label">
                                {densityOption === 'default'
                                  ? 'Default'
                                  : densityOption === 'compact'
                                    ? 'Compact'
                                    : 'Comfortable'}
                              </span>
                            </label>
                          ))}
                        </div>
                      </details>
                      <details className="house-publications-filter-group" open>
                        <summary className="house-publications-filter-summary">
                          <span>Rows per page</span>
                          <span className="house-publications-filter-count">
                            {collaborationLibraryPageSize === 'all' ? 'All' : collaborationLibraryPageSize}
                          </span>
                        </summary>
                        <div className="house-publications-filter-options">
                          {([25, 50, 100, 'all'] as CollaborationTablePageSize[]).map((pageSizeOption) => (
                            <label key={`collaboration-filter-page-size-${pageSizeOption}`} className="house-publications-filter-option">
                              <input
                                type="radio"
                                name="collaboration-filter-page-size"
                                className="house-publications-filter-checkbox"
                                checked={collaborationLibraryPageSize === pageSizeOption}
                                onChange={() => {
                                  setCollaborationLibraryPageSize(pageSizeOption)
                                  setPage(1)
                                }}
                              />
                              <span className="house-publications-filter-option-label">
                                {pageSizeOption === 'all' ? 'All collaborators' : `${pageSizeOption} collaborators`}
                              </span>
                            </label>
                          ))}
                        </div>
                      </details>
                    </div>,
                    document.body
                  ) : null}
                </div>
              ) : null}
            </SectionTools>
            <div
              className={cn(
                'relative order-2 overflow-visible transition-[max-width,opacity,transform] duration-[var(--motion-duration-ui)] ease-out',
                collaborationLibraryVisible && collaborationToolsOpen
                  ? 'z-30 max-w-[20rem] translate-x-0 opacity-100'
                  : 'pointer-events-none z-0 max-w-0 translate-x-1 opacity-0',
              )}
              aria-hidden={!collaborationLibraryVisible || !collaborationToolsOpen}
            >
              <div className="flex min-w-0 flex-nowrap whitespace-nowrap gap-1">
                <div className="relative inline-flex">
                  <Button
                    ref={collaborationLibraryDownloadButtonRef}
                    type="button"
                    variant="house"
                    size="icon"
                    className="peer h-8 w-8 house-publications-toolbox-item"
                    aria-label="Generate collaborator report"
                  >
                    <FileText className="h-4 w-4" strokeWidth={2.1} />
                  </Button>
                  <span
                    className="house-drilldown-chart-tooltip pointer-events-none absolute left-1/2 top-auto bottom-full mb-[0.35rem] z-50 -translate-x-1/2 whitespace-nowrap px-2 py-0.5 text-caption leading-none transition-opacity duration-[var(--motion-duration-ui)] ease-out opacity-0 peer-hover:opacity-100 peer-focus-visible:opacity-100"
                    aria-hidden="true"
                  >
                    Generate report
                  </span>
                </div>
                <SectionToolDivider />
                <div className="relative inline-flex">
                  <Button
                    type="button"
                    variant="house"
                    size="icon"
                    data-state={collaborationDownloadVisible ? 'open' : 'closed'}
                    className={cn(
                      'peer h-8 w-8 house-publications-toolbox-item',
                      collaborationDownloadVisible && 'house-publications-tools-toggle-open',
                    )}
                    onClick={() => {
                      setCollaborationDownloadVisible((current) => {
                        const nextVisible = !current
                        if (nextVisible) {
                          setCollaborationSearchVisible(false)
                          setCollaborationFilterVisible(false)
                          setCollaborationSettingsVisible(false)
                        }
                        return nextVisible
                      })
                    }}
                    aria-label={collaborationDownloadVisible ? 'Hide collaborator download options' : 'Show collaborator download options'}
                    aria-expanded={collaborationDownloadVisible}
                  >
                    <Download className="h-4 w-4" strokeWidth={2.1} />
                  </Button>
                  {collaborationDownloadVisible ? createPortal(
                    <div
                      ref={collaborationLibraryDownloadPopoverRef}
                      className="house-publications-filter-popover fixed z-50 w-[14rem]"
                      style={{
                        top: `${collaborationLibraryDownloadPopoverPosition.top}px`,
                        right: `${collaborationLibraryDownloadPopoverPosition.right}px`,
                      }}
                    >
                      <div className="house-publications-filter-header">
                        <p className="house-publications-filter-title">Download</p>
                      </div>
                      <div className="mt-2 flex items-center justify-end">
                        <button
                          type="button"
                          className="house-section-tool-button inline-flex h-8 items-center justify-center px-2.5 text-[0.69rem] font-semibold uppercase tracking-[0.07em]"
                          onClick={onExport}
                        >
                          Download CSV
                        </button>
                      </div>
                    </div>,
                    document.body
                  ) : null}
                  <span
                    className="house-drilldown-chart-tooltip pointer-events-none absolute left-1/2 top-auto bottom-full mb-[0.35rem] z-50 -translate-x-1/2 whitespace-nowrap px-2 py-0.5 text-caption leading-none transition-opacity duration-[var(--motion-duration-ui)] ease-out opacity-0 peer-hover:opacity-100 peer-focus-visible:opacity-100"
                    aria-hidden="true"
                  >
                    Download
                  </span>
                </div>
                <SectionToolDivider />
                <div className="relative inline-flex">
                  <Button
                    type="button"
                    variant="house"
                    size="icon"
                    className="peer h-8 w-8 house-publications-toolbox-item"
                    aria-label="Share collaborator library"
                  >
                    <Share2 className="h-4 w-4" strokeWidth={2.1} />
                  </Button>
                  <span
                    className="house-drilldown-chart-tooltip pointer-events-none absolute left-1/2 top-auto bottom-full mb-[0.35rem] z-50 -translate-x-1/2 whitespace-nowrap px-2 py-0.5 text-caption leading-none transition-opacity duration-[var(--motion-duration-ui)] ease-out opacity-0 peer-hover:opacity-100 peer-focus-visible:opacity-100"
                    aria-hidden="true"
                  >
                    Share
                  </span>
                </div>
              </div>
            </div>
            <SectionTools tone="publications" framed={false} className="order-3">
              {collaborationLibraryVisible ? (
                <button
                  type="button"
                  data-state={collaborationToolsOpen ? 'open' : 'closed'}
                  className={cn(
                    'order-4 h-8 w-8 shrink-0 house-publications-action-icon house-publications-top-control house-section-tool-button inline-flex items-center justify-center transition-[background-color,border-color,box-shadow] duration-[var(--motion-duration-ui)] ease-out',
                    collaborationToolsOpen && 'house-publications-tools-toggle-open',
                  )}
                  onClick={() => {
                    setCollaborationToolsOpen((current) => {
                      const nextOpen = !current
                      if (!nextOpen) {
                        setCollaborationDownloadVisible(false)
                      }
                      return nextOpen
                    })
                  }}
                  aria-pressed={collaborationToolsOpen}
                  aria-expanded={collaborationToolsOpen}
                  aria-label={collaborationToolsOpen ? 'Hide collaborator tools' : 'Show collaborator tools'}
                >
                  <Hammer className="house-publications-tools-toggle-icon h-[1.09rem] w-[1.09rem]" strokeWidth={2.1} />
                </button>
              ) : null}
              {collaborationLibraryVisible ? (
                <div className="relative order-5 shrink-0">
                  <button
                    ref={collaborationLibrarySettingsButtonRef}
                    type="button"
                    data-state={collaborationSettingsVisible ? 'open' : 'closed'}
                    className={cn(
                      'h-8 w-8 house-publications-action-icon house-publications-top-control house-publications-settings-toggle house-section-tool-button inline-flex items-center justify-center transition-[background-color,border-color,box-shadow] duration-[var(--motion-duration-ui)] ease-out',
                      collaborationSettingsVisible && 'house-publications-tools-toggle-open',
                    )}
                    onClick={() => {
                      setCollaborationSettingsVisible((current) => {
                        const nextVisible = !current
                        if (nextVisible) {
                          setCollaborationFilterVisible(false)
                          setCollaborationSearchVisible(false)
                          setCollaborationDownloadVisible(false)
                        }
                        return nextVisible
                      })
                    }}
                    aria-pressed={collaborationSettingsVisible}
                    aria-expanded={collaborationSettingsVisible}
                    aria-label={collaborationSettingsVisible ? 'Hide collaborator settings' : 'Show collaborator settings'}
                  >
                    <Settings className="house-publications-tools-toggle-icon house-publications-settings-toggle-icon h-[1.09rem] w-[1.09rem]" strokeWidth={2.1} />
                  </button>
                  {collaborationSettingsVisible ? createPortal(
                    <div
                      ref={collaborationLibrarySettingsPopoverRef}
                      className="house-publications-filter-popover fixed z-50 w-[18.75rem]"
                      style={{
                        top: `${collaborationLibrarySettingsPopoverPosition.top}px`,
                        right: `${collaborationLibrarySettingsPopoverPosition.right}px`,
                      }}
                    >
                      <div className="house-publications-filter-header">
                        <p className="house-publications-filter-title">Table settings</p>
                        <div className="inline-flex items-center gap-2">
                          <button type="button" className="house-publications-filter-clear" onClick={onAutoAdjustCollaborationTableWidths}>
                            Auto fit
                          </button>
                          <button type="button" className="house-publications-filter-clear" onClick={onResetCollaborationTableLayout}>
                            Reset
                          </button>
                        </div>
                      </div>
                      <details className="house-publications-filter-group" open>
                        <summary className="house-publications-filter-summary">
                          <span>Columns</span>
                          <span className="house-publications-filter-count">
                            {visibleCollaborationTableColumns.length}/{collaborationTableColumnOrder.length}
                          </span>
                        </summary>
                        <div className="house-publications-filter-options">
                          {collaborationTableColumnOrder.map((columnKey) => {
                            const checked = collaborationTableColumns[columnKey].visible
                            const visibleCount = visibleCollaborationTableColumns.length
                            const disableToggle = checked && visibleCount <= 1
                            const label = COLLABORATION_TABLE_COLUMN_DEFINITIONS[columnKey].label
                            return (
                              <label
                                key={`collaboration-column-visibility-${columnKey}`}
                                className={cn('house-publications-filter-option', disableToggle && 'opacity-60')}
                              >
                                <input
                                  type="checkbox"
                                  className="house-publications-filter-checkbox"
                                  checked={checked}
                                  disabled={disableToggle}
                                  onChange={() => onToggleCollaborationColumnVisibility(columnKey)}
                                />
                                <span className="house-publications-filter-option-label">{label}</span>
                              </label>
                            )
                          })}
                        </div>
                      </details>
                    </div>,
                    document.body
                  ) : null}
                </div>
              ) : null}
              <button
                type="button"
                data-state={collaborationLibraryVisible ? 'open' : 'closed'}
                className="order-6 h-8 w-8 shrink-0 house-publications-action-icon house-publications-top-control house-publications-eye-toggle house-section-tool-button inline-flex items-center justify-center"
                onClick={() => {
                  setCollaborationLibraryVisible((current) => {
                    const nextVisible = !current
                    if (!nextVisible) {
                      setCollaborationToolsOpen(false)
                      setCollaborationFilterVisible(false)
                      setCollaborationSearchVisible(false)
                      setCollaborationDownloadVisible(false)
                      setCollaborationSettingsVisible(false)
                    }
                    return nextVisible
                  })
                }}
                aria-pressed={collaborationLibraryVisible}
                aria-label={collaborationLibraryVisible ? 'Set collaborator library not visible' : 'Set collaborator library visible'}
              >
                {collaborationLibraryVisible ? (
                  <Eye className="house-publications-eye-toggle-icon h-[1.2rem] w-[1.2rem]" strokeWidth={2.1} />
                ) : (
                  <EyeOff className="house-publications-eye-toggle-icon h-[1.2rem] w-[1.2rem]" strokeWidth={2.1} />
                )}
              </button>
            </SectionTools>
          </div>
          )}
        />

        <div data-house-role="layout-section" className="space-y-3">
          {collaborationLibraryVisible ? (
            <div className="space-y-3">
            <div className="hidden md:block">
              <div ref={collaborationTableLayoutRef} className="relative w-full house-table-context-profile">
                <Table
                  className={cn(
                    'w-full table-fixed house-table-resizable',
                    collaborationTableDensity === 'compact' && 'house-publications-table-density-compact',
                    collaborationTableDensity === 'comfortable' && 'house-publications-table-density-comfortable',
                  )}
                  data-house-no-column-resize="true"
                  data-house-no-column-controls="true"
                >
                  <colgroup>
                    {visibleCollaborationTableColumns.map((columnKey) => {
                      const width = clampCollaborationTableColumnWidth(
                        columnKey,
                        collaborationTableColumns[columnKey].width,
                      )
                      return (
                        <col
                          key={`collaboration-col-${columnKey}`}
                          style={{
                            width: `${width}px`,
                            minWidth: `${COLLABORATION_TABLE_COLUMN_MIN_WIDTH[columnKey]}px`,
                          }}
                        />
                      )
                    })}
                  </colgroup>
                  <TableHeader className="house-table-head text-left">
                    <TableRow style={{ backgroundColor: 'transparent' }}>
                      {visibleCollaborationTableColumns.map((columnKey, columnIndex) => {
                        const sortField = COLLABORATION_TABLE_COLUMN_SORT_FIELD[columnKey]
                        const headerClassName = COLLABORATION_TABLE_COLUMN_DEFINITIONS[columnKey].headerClassName || 'text-left'
                        const alignClass = headerClassName.includes('text-center')
                          ? 'justify-center text-center'
                          : headerClassName.includes('text-right')
                            ? 'justify-end text-right'
                            : 'justify-start text-left'
                        const isLastVisibleColumn = columnIndex >= visibleCollaborationTableColumns.length - 1
                        return (
                          <TableHead
                            key={`collaboration-head-${columnKey}`}
                            className={cn('house-table-head-text group relative', headerClassName)}
                            onDragOver={(event) => {
                              if (!collaborationTableDraggingColumn || collaborationTableDraggingColumn === columnKey) {
                                return
                              }
                              event.preventDefault()
                            }}
                            onDrop={(event) => {
                              event.preventDefault()
                              if (!collaborationTableDraggingColumn || collaborationTableDraggingColumn === columnKey) {
                                return
                              }
                              onReorderCollaborationColumn(collaborationTableDraggingColumn, columnKey)
                              setCollaborationTableDraggingColumn(null)
                            }}
                          >
                            {sortField ? (
                              <button
                                type="button"
                                className={cn(
                                  'inline-flex w-full items-center gap-1 transition-colors hover:text-foreground',
                                  HOUSE_TABLE_SORT_TRIGGER_CLASS,
                                  alignClass,
                                )}
                                onClick={() => onSortColumn(sortField)}
                              >
                                <span>{COLLABORATION_TABLE_COLUMN_DEFINITIONS[columnKey].label}</span>
                                {sort === sortField ? (
                                  sortDirection === 'desc' ? (
                                    <ChevronDown className="h-3.5 w-3.5 text-foreground" />
                                  ) : (
                                    <ChevronUp className="h-3.5 w-3.5 text-foreground" />
                                  )
                                ) : (
                                  <ChevronsUpDown className="h-3.5 w-3.5" />
                                )}
                              </button>
                            ) : (
                              COLLABORATION_TABLE_COLUMN_DEFINITIONS[columnKey].label
                            )}
                            <button
                              type="button"
                              draggable
                              className="house-table-reorder-handle"
                              data-house-dragging={collaborationTableDraggingColumn === columnKey ? 'true' : undefined}
                              onDragStart={(event) => {
                                event.dataTransfer.effectAllowed = 'move'
                                event.dataTransfer.setData('text/plain', columnKey)
                                setCollaborationTableDraggingColumn(columnKey)
                              }}
                              onDragEnd={() => {
                                setCollaborationTableDraggingColumn(null)
                              }}
                              onClick={(event) => {
                                event.preventDefault()
                                event.stopPropagation()
                              }}
                              aria-label={`Reorder ${COLLABORATION_TABLE_COLUMN_DEFINITIONS[columnKey].label} column`}
                              title={`Drag to reorder ${COLLABORATION_TABLE_COLUMN_DEFINITIONS[columnKey].label} column`}
                            >
                              <GripVertical className="h-3 w-3" />
                            </button>
                            {!isLastVisibleColumn ? (
                              <button
                                type="button"
                                className="house-table-resize-handle"
                                data-house-dragging={collaborationTableResizingColumn === columnKey ? 'true' : undefined}
                                onPointerDown={(event) => onStartCollaborationHeadingResize(event, columnKey)}
                                onKeyDown={(event) => onCollaborationHeadingResizeHandleKeyDown(event, columnKey)}
                                onClick={(event) => {
                                  event.preventDefault()
                                  event.stopPropagation()
                                }}
                                aria-label={`Resize ${COLLABORATION_TABLE_COLUMN_DEFINITIONS[columnKey].label} column`}
                                title={`Resize ${COLLABORATION_TABLE_COLUMN_DEFINITIONS[columnKey].label} column`}
                              />
                            ) : null}
                          </TableHead>
                        )
                      })}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {pagedCollaborators.map((item) => (
                      <TableRow
                        key={item.id}
                        className={cn(
                          'cursor-pointer hover:bg-accent/30',
                          collaborationTableAlternateRowColoring && 'odd:bg-[hsl(var(--tone-neutral-50))] even:bg-[hsl(var(--tone-neutral-100))]',
                        )}
                        onClick={() => onSelectCollaborator(item)}
                      >
                        {visibleCollaborationTableColumns.map((columnKey) => {
                          if (columnKey === 'name') {
                            return (
                              <TableCell key={`${item.id}-name`} className="house-table-cell-text align-top font-medium whitespace-normal break-words leading-tight">
                                {collaboratorDisplayName(item)}
                              </TableCell>
                            )
                          }
                          if (columnKey === 'institution') {
                            return (
                              <TableCell key={`${item.id}-institution`} className="house-table-cell-text align-top whitespace-normal break-words leading-tight">
                                {collaboratorDisplayInstitution(item) || '-'}
                              </TableCell>
                            )
                          }
                          if (columnKey === 'relationship') {
                            return (
                              <TableCell key={`${item.id}-relationship`} className="house-table-cell-text align-top text-center whitespace-nowrap">
                                <Badge size="sm" variant={relationshipTone(resolveRelationshipTier(item.metrics))}>
                                  {resolveRelationshipTier(item.metrics)}
                                </Badge>
                              </TableCell>
                            )
                          }
                          if (columnKey === 'activity') {
                            return (
                              <TableCell key={`${item.id}-activity`} className="house-table-cell-text align-top text-center whitespace-nowrap">
                                <Badge size="sm" variant={activityTone(resolveActivityStatus(item.metrics))}>
                                  {resolveActivityStatus(item.metrics)}
                                </Badge>
                              </TableCell>
                            )
                          }
                          if (columnKey === 'last_year') {
                            return (
                              <TableCell key={`${item.id}-last-year`} className="house-table-cell-text align-top text-center whitespace-nowrap">
                                {item.metrics.last_collaboration_year ?? '-'}
                              </TableCell>
                            )
                          }
                          if (columnKey === 'coauthored_works') {
                            return (
                              <TableCell key={`${item.id}-works`} className="house-table-cell-text align-top text-center whitespace-nowrap">
                                {item.metrics.coauthored_works_count}
                              </TableCell>
                            )
                          }
                          return (
                            <TableCell
                              key={`${item.id}-collaboration-score`}
                              className="house-table-cell-text align-top text-center whitespace-nowrap tabular-nums"
                            >
                              <span
                                className={cn(
                                  'inline-flex min-w-[4.75rem] items-center justify-center rounded-full px-2 py-0.5 text-xs font-semibold tabular-nums',
                                  collaborationStrengthToneById.get(item.id) || collaborationStrengthTone(0),
                                )}
                              >
                                {Number(item.metrics.collaboration_strength_score || 0).toFixed(2)}
                              </span>
                            </TableCell>
                          )
                        })}
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </div>

            <div className="space-y-2 md:hidden">
              {pagedCollaborators.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  className={`w-full rounded border border-border p-3 text-left ${selectedId === item.id ? 'bg-accent/50' : ''}`}
                  onClick={() => onSelectCollaborator(item)}
                >
                  <div className="flex items-center justify-between gap-2">
                    <p className="font-medium">{collaboratorDisplayName(item)}</p>
                    <div className="flex items-center gap-1">
                      <Badge size="sm" variant={relationshipTone(resolveRelationshipTier(item.metrics))}>
                        {resolveRelationshipTier(item.metrics)}
                      </Badge>
                      <Badge size="sm" variant={activityTone(resolveActivityStatus(item.metrics))}>
                        {resolveActivityStatus(item.metrics)}
                      </Badge>
                    </div>
                  </div>
                  <p className="text-xs text-muted-foreground">{collaboratorDisplayInstitution(item) || 'No institution'}</p>
                  {item.institution_labels.length > 1 && !item.contact_primary_institution ? (
                    <p className="text-xs text-muted-foreground">Institutions: {item.institution_labels.join(' • ')}</p>
                  ) : null}
                  <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                    <span>
                      Works: {item.metrics.coauthored_works_count} | Last year:{' '}
                      {item.metrics.last_collaboration_year ?? '-'}
                    </span>
                    <span
                      className={cn(
                        'inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-semibold tabular-nums',
                        collaborationStrengthToneById.get(item.id) || collaborationStrengthTone(0),
                      )}
                    >
                      Score {Number(item.metrics.collaboration_strength_score || 0).toFixed(2)}
                    </span>
                  </div>
                </button>
              ))}
            </div>

            <div className="flex items-center justify-end gap-2">
              <div className="flex items-center gap-2">
                <Button
                  type="button"
                  size="sm"
                  variant="secondary"
                  disabled={collaborationLibraryPageSize === 'all' || page <= 1}
                  onClick={() => setPage((current) => Math.max(1, current - 1))}
                >
                  Previous
                </Button>
                <p className="text-xs text-muted-foreground">
                  Page {page} of {totalPages}
                </p>
                <Button
                  type="button"
                  size="sm"
                  variant="secondary"
                  disabled={collaborationLibraryPageSize === 'all' || page >= totalPages}
                  onClick={() => setPage((current) => current + 1)}
                >
                  Next
                </Button>
              </div>
            </div>
            </div>
          ) : (
            <section className="house-notification-section">
              <div className="house-banner house-banner-info">
                <p>Collaborators hidden by user.</p>
              </div>
            </section>
          )}
        </div>

        {!collaboratorDrilldownOpen && status ? <p className="text-xs text-emerald-700">{status}</p> : null}
        {!collaboratorDrilldownOpen && error ? <p className="text-xs text-destructive">{error}</p> : null}

        <SectionHeader
          heading="Collaboration heat map"
          description="Aggregated across all matching collaborators. Grid shows top 24 buckets plus Others. Click map markers or grid cells to filter the collaborator list."
          className="house-section-header-marker-aligned mt-[var(--separator-section-content-to-section-header)]"
        />
        <div className="house-separator-main-heading-to-content space-y-3 text-sm">
          <div className="house-metric-tile-shell rounded-md border p-3 hover:bg-[var(--metric-tile-bg-rest)] focus-visible:bg-[var(--metric-tile-bg-rest)]">
            <div className="space-y-3">
              <div className="flex flex-wrap gap-2">
                <Button
                  type="button"
                  size="sm"
                  variant={heatmapMode === 'country' ? 'primary' : 'secondary'}
                  onClick={() => setHeatmapMode('country')}
                >
                  Geographic
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant={heatmapMode === 'institution' ? 'primary' : 'secondary'}
                  onClick={() => setHeatmapMode('institution')}
                >
                  Institutional
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant={heatmapMode === 'domain' ? 'primary' : 'secondary'}
                  onClick={() => setHeatmapMode('domain')}
                >
                  Domain
                </Button>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <p className="text-xs text-muted-foreground">Metric:</p>
                <SelectPrimitive value={heatmapMetric} onValueChange={(value) => setHeatmapMetric(value as HeatmapMetric)}>
                  <SelectTrigger className="h-9 w-auto min-w-sz-220 px-3 text-sm">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="collaborators">Collaborator count</SelectItem>
                    <SelectItem value="works">Coauthored works</SelectItem>
                    <SelectItem value="strength">Strength score</SelectItem>
                    <SelectItem value="citations_last_12m">Citations (12m)</SelectItem>
                    <SelectItem value="recency">Recency score</SelectItem>
                  </SelectContent>
                </SelectPrimitive>
              </div>

              {heatmapSelection ? (
                <div className="flex flex-wrap items-center gap-2 text-xs">
                  <Badge variant="secondary">
                    Filter: {activeHeatmapCell?.label || heatmapSelection.label} ({heatmapSelection.mode})
                  </Badge>
                  <Button type="button" size="sm" variant="secondary" onClick={() => setHeatmapSelection(null)}>
                    Clear filter
                  </Button>
                </div>
              ) : null}

              {heatmapQuantiles ? (
                <div className="flex flex-wrap items-center gap-2 text-xs">
                  <span className="text-muted-foreground">Quantile legend ({heatmapMetricLabel(heatmapMetric)}):</span>
                  <span className="inline-flex items-center gap-1">
                    <span className="h-3 w-3 rounded bg-emerald-100" />
                    <span>{`Q1 <= ${formatHeatmapMetricValue(heatmapQuantiles.q20, heatmapMetric)}`}</span>
                  </span>
                  <span className="inline-flex items-center gap-1">
                    <span className="h-3 w-3 rounded bg-emerald-200" />
                    <span>{`Q2 <= ${formatHeatmapMetricValue(heatmapQuantiles.q40, heatmapMetric)}`}</span>
                  </span>
                  <span className="inline-flex items-center gap-1">
                    <span className="h-3 w-3 rounded bg-emerald-300" />
                    <span>{`Q3 <= ${formatHeatmapMetricValue(heatmapQuantiles.q60, heatmapMetric)}`}</span>
                  </span>
                  <span className="inline-flex items-center gap-1">
                    <span className="h-3 w-3 rounded bg-emerald-500" />
                    <span>{`Q4 <= ${formatHeatmapMetricValue(heatmapQuantiles.q80, heatmapMetric)}`}</span>
                  </span>
                  <span className="inline-flex items-center gap-1">
                    <span className="h-3 w-3 rounded bg-emerald-700" />
                    <span>{`Q5 <= ${formatHeatmapMetricValue(heatmapQuantiles.max, heatmapMetric)}`}</span>
                  </span>
                </div>
              ) : null}

              {heatmapMode === 'country' && (
                <div className="flex flex-wrap gap-2">
                  <Button
                    type="button"
                    size="sm"
                    variant={geoView === 'map' ? 'primary' : 'secondary'}
                    onClick={() => setGeoView('map')}
                  >
                    Map
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant={geoView === 'grid' ? 'primary' : 'secondary'}
                    onClick={() => setGeoView('grid')}
                  >
                    Grid
                  </Button>
                </div>
              )}

              {heatmapMode === 'country' && geoView === 'map' ? (
                <UKCollaborationMap
                  collaborators={canonicalCollaborators.flatMap((item) => {
                    const institutions = item.institution_labels.length > 0
                      ? item.institution_labels
                      : [item.primary_institution || '']
                    return institutions.map((institution) => ({
                      country: item.country || '',
                      primary_institution: institution || '',
                      collaboration_strength_score: heatmapMetricValue(item, heatmapMetric, nowYear),
                    }))
                  })}
                  onMarkerClick={onMapMarkerDrilldown}
                />
              ) : (
                <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
                  {heatmapCells.length > 0 ? (
                    heatmapCells.map((cell) => {
                      const active =
                        heatmapSelection?.mode === heatmapMode && heatmapSelection?.label === cell.key
                      return (
                        <button
                          type="button"
                          key={cell.key}
                          className={`rounded border border-border p-2 text-left text-xs ${heatmapTone(cell.value, heatmapQuantiles)} ${active ? 'ring-2 ring-emerald-700 ring-offset-1' : ''}`}
                          onClick={() => onToggleHeatmapSelection(cell.key)}
                          title={`${cell.label}: ${formatHeatmapMetricValue(cell.value, heatmapMetric)} ${heatmapMetricLabel(heatmapMetric)} (${cell.collaborators} collaborators)`}
                        >
                          <p className="truncate font-medium">{cell.label}</p>
                          <p>{formatHeatmapMetricValue(cell.value, heatmapMetric)}</p>
                          <p className="text-[11px] opacity-80">{cell.collaborators} collaborators</p>
                        </button>
                      )
                    })
                  ) : (
                    <p className="text-xs text-muted-foreground">No heat map data yet.</p>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      </Section>

      <DrilldownSheet open={collaboratorDrilldownOpen} onOpenChange={setCollaboratorDrilldownOpen}>
        {selectedCollaborator ? (
          <>
            <DrilldownSheet.Header
              title={collaboratorDisplayName(selectedCollaborator) || 'Collaborator details'}
              subtitle={collaboratorDisplayInstitution(selectedCollaborator)
                ? collaboratorDisplayInstitution(selectedCollaborator)
                : 'Review and update collaborator details.'}
              variant="profile"
            >
              <DrilldownSheet.Tabs
                activeTab={activeCollaboratorDrilldownTab}
                onTabChange={(tabId) => setActiveCollaboratorDrilldownTab(tabId as CollaboratorDrilldownTab)}
                panelIdPrefix="collaborator-drilldown-panel-"
                tabIdPrefix="collaborator-drilldown-tab-"
                tone="profile"
                aria-label="Collaborator drilldown sections"
                className="house-drilldown-tabs"
              >
                {COLLABORATOR_DRILLDOWN_TABS.map((tab) => (
                  <DrilldownSheet.Tab key={tab.id} id={tab.id}>
                    {tab.label}
                  </DrilldownSheet.Tab>
                ))}
              </DrilldownSheet.Tabs>
            </DrilldownSheet.Header>
            <DrilldownSheet.Content className="house-drilldown-stack-3">
              <DrilldownSheet.TabPanel
                id={activeCollaboratorDrilldownTab}
                isActive={true}
                tabIdPrefix="collaborator-drilldown-tab-"
                panelIdPrefix="collaborator-drilldown-panel-"
              >
                {activeCollaboratorDrilldownTab === 'details' ? (
                  <div className="house-section-panel house-drilldown-panel-no-pad">
                    <div className="house-drilldown-heading-block">
                      <p className="house-drilldown-heading-block-title">Collaborator details</p>
                    </div>
                    <div className="house-drilldown-content-block house-drilldown-heading-content-block w-full">
                      <div className="space-y-3">
                        {collaboratorContactSaving || error ? (
                          <div className="space-y-1">
                            {collaboratorContactSaving ? (
                              <p className="text-xs text-emerald-700">
                                Saving collaborator details...
                              </p>
                            ) : null}
                            {error ? <p className="text-xs text-destructive">{error}</p> : null}
                          </div>
                        ) : null}
                        <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_2rem_2rem]">
                          <div className="grid gap-x-2 gap-y-3 sm:col-span-2 [grid-template-columns:4.4rem_minmax(6.25rem,0.72fr)_3.3rem_minmax(6.75rem,0.88fr)]">
                            <label className="space-y-1">
                              <span className="house-field-label">Title</span>
                              <SelectPrimitive
                                value={identityDraft.salutation || undefined}
                                onValueChange={(value) => {
                                  setIdentityDraft((current) => ({ ...current, salutation: value }))
                                }}
                                disabled={!editingIdentity}
                              >
                                <SelectTrigger aria-label="Title">
                                  <SelectValue />
                                </SelectTrigger>
                                <SelectContent showScrollButtons={false} viewportStyle={{ maxHeight: 'none' }}>
                                  {COLLABORATOR_SALUTATION_OPTIONS.map((option) => (
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
                                value={identityDraft.first_name}
                                onChange={(event) => setIdentityDraft((current) => ({ ...current, first_name: event.target.value }))}
                                readOnly={!editingIdentity}
                                autoComplete="given-name"
                              />
                            </label>
                            <label className="space-y-1">
                              <span className="house-field-label">Initial</span>
                              <Input
                                value={identityDraft.middle_initial}
                                onChange={(event) => setIdentityDraft((current) => ({
                                  ...current,
                                  middle_initial: event.target.value.toUpperCase(),
                                }))}
                                readOnly={!editingIdentity}
                                maxLength={4}
                              />
                            </label>
                            <label className="space-y-1">
                              <span className="house-field-label">Surname</span>
                              <Input
                                value={identityDraft.surname}
                                onChange={(event) => setIdentityDraft((current) => ({ ...current, surname: event.target.value }))}
                                readOnly={!editingIdentity}
                                autoComplete="family-name"
                              />
                            </label>
                          </div>
                          {editingIdentity ? (
                            <>
                              <div className="flex h-9 items-center justify-start self-end sm:justify-center">
                                <button
                                  type="button"
                                  className="house-collaborator-action-icon house-collaborator-action-icon-save shrink-0"
                                  aria-label="Save collaborator details"
                                  title="Save collaborator details"
                                  onClick={onCommitIdentityDraft}
                                  disabled={!identityDraftDirty}
                                >
                                  <Save className="h-4 w-4" strokeWidth={2.2} />
                                </button>
                              </div>
                              <div className="flex h-9 items-center justify-start self-end sm:justify-center">
                                <button
                                  type="button"
                                  className="house-collaborator-action-icon house-collaborator-action-icon-discard shrink-0"
                                  aria-label="Discard collaborator details edits"
                                  title="Discard collaborator details edits"
                                  onClick={onCancelIdentityDraft}
                                >
                                  <X className="h-4 w-4" strokeWidth={2.2} />
                                </button>
                              </div>
                            </>
                          ) : (
                            <>
                              <div className="h-9 self-end" aria-hidden="true" />
                              <div className="flex h-9 items-center justify-start self-end sm:justify-center">
                                <button
                                  type="button"
                                  className="house-collaborator-action-icon house-collaborator-action-icon-edit shrink-0"
                                  aria-label="Edit collaborator details"
                                  title="Edit collaborator details"
                                  onClick={onStartIdentityEdit}
                                  disabled={Boolean(activeCollaboratorEditor)}
                                >
                                  <Pencil className="h-4 w-4" strokeWidth={2.2} />
                                </button>
                              </div>
                            </>
                          )}
                        </div>
                        <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_2rem_2rem]">
                          <label className="space-y-1 sm:col-span-2">
                            <span className="house-field-label">Email</span>
                            <Input
                              value={primaryEmailDraft}
                              onChange={(event) => setPrimaryEmailDraft(event.target.value)}
                              readOnly={!editingPrimaryEmail}
                            />
                          </label>
                          {editingPrimaryEmail ? (
                            <>
                              <div className="flex h-9 items-center justify-start self-end sm:justify-center">
                                <button
                                  type="button"
                                  className="house-collaborator-action-icon house-collaborator-action-icon-save shrink-0"
                                  aria-label="Save email draft"
                                  title="Save email draft"
                                  onClick={onCommitPrimaryEmailDraft}
                                  disabled={primaryEmailDraft.trim() === (form.email || '').trim()}
                                >
                                  <Save className="h-4 w-4" strokeWidth={2.2} />
                                </button>
                              </div>
                              <div className="flex h-9 items-center justify-start self-end sm:justify-center">
                                <button
                                  type="button"
                                  className="house-collaborator-action-icon house-collaborator-action-icon-discard shrink-0"
                                  aria-label="Discard email draft"
                                  title="Discard email draft"
                                  onClick={onCancelPrimaryEmailDraft}
                                >
                                  <X className="h-4 w-4" strokeWidth={2.2} />
                                </button>
                              </div>
                            </>
                          ) : (
                            <>
                              <div className="flex h-9 items-center justify-start self-end sm:justify-center">
                                {hasPrimaryEmail ? (
                                  <button
                                    type="button"
                                    className="house-collaborator-action-icon house-collaborator-action-icon-add shrink-0"
                                    aria-label="Add second email"
                                    title="Add second email"
                                    onClick={onOpenSecondaryEmailDraft}
                                    disabled={showSecondaryEmailInput || Boolean(activeCollaboratorEditor)}
                                  >
                                    <Plus className="h-4 w-4" strokeWidth={2.2} />
                                  </button>
                                ) : (
                                  <div className="h-9 self-end" aria-hidden="true" />
                                )}
                              </div>
                              <div className="flex h-9 items-center justify-start self-end sm:justify-center">
                                <button
                                  type="button"
                                  className="house-collaborator-action-icon house-collaborator-action-icon-edit shrink-0"
                                  aria-label="Edit email"
                                  title="Edit email"
                                  onClick={onStartPrimaryEmailEdit}
                                  disabled={Boolean(activeCollaboratorEditor)}
                                >
                                  <Pencil className="h-4 w-4" strokeWidth={2.2} />
                                </button>
                              </div>
                            </>
                          )}
                          {showSecondaryEmailInput ? (
                            <>
                              <label className="space-y-1 sm:col-span-2">
                                <span className="house-field-label">Second email</span>
                                <Input
                                  value={secondaryEmailDraft}
                                  onChange={(event) => setSecondaryEmailDraft(event.target.value)}
                                  readOnly={!editingSecondaryEmail}
                                />
                              </label>
                              {editingSecondaryEmail ? (
                                <>
                                  <div className="flex h-9 items-center justify-start self-end sm:justify-center">
                                    <button
                                      type="button"
                                      className="house-collaborator-action-icon house-collaborator-action-icon-save shrink-0"
                                      aria-label="Save second email"
                                      title="Save second email"
                                      onClick={onCommitSecondaryEmailDraft}
                                      disabled={secondaryEmailDraft.trim() === (form.secondary_email || '').trim()}
                                    >
                                      <Save className="h-4 w-4" strokeWidth={2.2} />
                                    </button>
                                  </div>
                                  <div className="flex h-9 items-center justify-start self-end sm:justify-center">
                                    <button
                                      type="button"
                                      className="house-collaborator-action-icon house-collaborator-action-icon-discard shrink-0"
                                      aria-label="Discard second email"
                                      title="Discard second email"
                                      onClick={onCancelSecondaryEmailDraft}
                                    >
                                      <X className="h-4 w-4" strokeWidth={2.2} />
                                    </button>
                                  </div>
                                </>
                              ) : (
                                <>
                                  <div className="flex h-9 items-center justify-start self-end sm:justify-center">
                                    <button
                                      type="button"
                                      className="house-collaborator-action-icon house-collaborator-action-icon-edit shrink-0"
                                      aria-label="Edit second email"
                                      title="Edit second email"
                                      onClick={onStartSecondaryEmailEdit}
                                      disabled={Boolean(activeCollaboratorEditor)}
                                    >
                                      <Pencil className="h-4 w-4" strokeWidth={2.2} />
                                    </button>
                                  </div>
                                  <div className="h-9 self-end" aria-hidden="true" />
                                </>
                              )}
                            </>
                          ) : null}
                        </div>
                        <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_2rem_2rem]">
                          <label className="space-y-1 sm:col-span-2">
                            <span className="house-field-label">Primary institution</span>
                            <div className="relative">
                              <Input
                                value={institutionDraft}
                                onChange={(event) => onInstitutionDraftInputChange('primary', event.target.value)}
                                onFocus={() => {
                                  if (primaryInstitutionEditingActive) {
                                    setInstitutionInputFocused('primary')
                                  }
                                }}
                                onBlur={() => setInstitutionInputFocused(null)}
                                autoComplete="organization"
                                readOnly={!primaryInstitutionEditingActive}
                                aria-expanded={
                                  primaryInstitutionEditingActive &&
                                  institutionInputFocused === 'primary' &&
                                  (institutionSuggestionsLoading || institutionSuggestions.length > 0 || Boolean(institutionSuggestionsError))
                                }
                                aria-controls="collaborator-institution-suggestion-panel"
                              />
                              {primaryInstitutionEditingActive &&
                              institutionInputFocused === 'primary' &&
                              (institutionSuggestionsLoading ||
                                institutionSuggestions.length > 0 ||
                                Boolean(institutionSuggestionsError)) ? (
                                <div
                                  id="collaborator-institution-suggestion-panel"
                                  role="listbox"
                                  className="absolute left-0 top-[calc(100%+0.35rem)] z-20 w-full overflow-hidden rounded-md border border-[hsl(var(--tone-neutral-200))] bg-card shadow-[var(--elevation-2)]"
                                >
                                  {institutionSuggestionsLoading ? (
                                    <div className="flex items-center gap-2 px-3 py-2 text-xs text-[hsl(var(--tone-neutral-700))]">
                                      <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
                                      <span>Looking up affiliations...</span>
                                    </div>
                                  ) : null}
                                  {!institutionSuggestionsLoading && institutionSuggestions.length > 0 ? (
                                    <div className="max-h-56 divide-y divide-[hsl(var(--tone-neutral-200))] overflow-auto">
                                      {institutionSuggestions.map((suggestion) => (
                                        <button
                                          key={`collaborator-institution:${suggestion.source}:${suggestion.name}:${suggestion.countryCode || ''}`}
                                          type="button"
                                          onMouseDown={(event) => {
                                            event.preventDefault()
                                          }}
                                          onClick={() => onSelectInstitutionSuggestion(suggestion)}
                                          className="w-full px-3 py-2 text-left transition-colors hover:bg-[hsl(var(--tone-neutral-100))] focus-visible:bg-[hsl(var(--tone-neutral-100))]"
                                          title={suggestion.label}
                                        >
                                          <span className="flex items-start gap-2">
                                            <Building2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[hsl(var(--tone-neutral-500))]" aria-hidden />
                                            <span className="min-w-0">
                                              <span className="block truncate text-sm text-[hsl(var(--tone-neutral-900))]">{suggestion.name}</span>
                                              <span className="block truncate text-xs text-[hsl(var(--tone-neutral-600))]">{suggestion.label}</span>
                                            </span>
                                          </span>
                                        </button>
                                      ))}
                                    </div>
                                  ) : null}
                                  {!institutionSuggestionsLoading &&
                                  institutionSuggestions.length === 0 &&
                                  !institutionSuggestionsError &&
                                  sanitizeAffiliation(institutionDraft).length >= 2 ? (
                                    <p className="px-3 py-2 text-xs text-[hsl(var(--tone-neutral-600))]">No institution matches found.</p>
                                  ) : null}
                                  {!institutionSuggestionsLoading && institutionSuggestionsError ? (
                                    <p className="px-3 py-2 text-micro text-[hsl(var(--tone-warning-700))]">{institutionSuggestionsError}</p>
                                  ) : null}
                                </div>
                              ) : null}
                            </div>
                          </label>
                          {primaryInstitutionEditingActive ? (
                            <>
                              <div className="flex h-9 items-center justify-start self-end sm:justify-center">
                                <button
                                  type="button"
                                  className="house-collaborator-action-icon house-collaborator-action-icon-save shrink-0"
                                  aria-label="Save institution draft"
                                  title="Save institution draft"
                                  onClick={onCommitInstitutionDraft}
                                  disabled={
                                    sanitizeAffiliation(institutionDraft) === sanitizeAffiliation(form.primary_institution)
                                    && !primaryInstitutionNeedsHydration
                                    && !institutionSuggestionMatchesValue(selectedInstitutionSuggestions.primary, institutionDraft)
                                  }
                                >
                                  <Save className="h-4 w-4" strokeWidth={2.2} />
                                </button>
                              </div>
                              <div className="flex h-9 items-center justify-start self-end sm:justify-center">
                                <button
                                  type="button"
                                  className="house-collaborator-action-icon house-collaborator-action-icon-discard shrink-0"
                                  aria-label="Discard institution draft"
                                  title="Discard institution draft"
                                  onClick={onCancelInstitutionDraft}
                                >
                                  <X className="h-4 w-4" strokeWidth={2.2} />
                                </button>
                              </div>
                            </>
                          ) : (
                            <>
                              <div className="flex h-9 items-center justify-start self-end sm:justify-center">
                                {hasPrimaryInstitution && !showSecondaryInstitutionInput ? (
                                  <button
                                    type="button"
                                    className="house-collaborator-action-icon house-collaborator-action-icon-add shrink-0"
                                    aria-label="Add second institution"
                                    title="Add second institution"
                                    onClick={onOpenSecondaryInstitutionDraft}
                                    disabled={Boolean(activeCollaboratorEditor)}
                                  >
                                    <Plus className="h-4 w-4" strokeWidth={2.2} />
                                  </button>
                                ) : (
                                  <div className="h-9 self-end" aria-hidden="true" />
                                )}
                              </div>
                              <div className="flex h-9 items-center justify-start self-end sm:justify-center">
                                <button
                                  type="button"
                                  className="house-collaborator-action-icon house-collaborator-action-icon-edit shrink-0"
                                  aria-label="Edit institution"
                                  title="Edit institution"
                                  onClick={onStartInstitutionEdit}
                                  disabled={Boolean(activeCollaboratorEditor)}
                                >
                                  <Pencil className="h-4 w-4" strokeWidth={2.2} />
                                </button>
                              </div>
                            </>
                          )}
                          {showSecondaryInstitutionInput ? (
                            <>
                              <label className="space-y-1 sm:col-span-2">
                                <span className="house-field-label">Second institution</span>
                                <div className="relative">
                                  <Input
                                    value={secondaryInstitutionDraft}
                                    onChange={(event) => onInstitutionDraftInputChange('secondary', event.target.value)}
                                    onFocus={() => {
                                      if (editingSecondaryInstitution) {
                                        setInstitutionInputFocused('secondary')
                                      }
                                    }}
                                    onBlur={() => setInstitutionInputFocused(null)}
                                    autoComplete="organization"
                                    readOnly={!editingSecondaryInstitution}
                                    aria-expanded={
                                      editingSecondaryInstitution &&
                                      institutionInputFocused === 'secondary' &&
                                      (institutionSuggestionsLoading || institutionSuggestions.length > 0 || Boolean(institutionSuggestionsError))
                                    }
                                    aria-controls="collaborator-institution-suggestion-panel"
                                  />
                                  {editingSecondaryInstitution &&
                                  institutionInputFocused === 'secondary' &&
                                  (institutionSuggestionsLoading ||
                                    institutionSuggestions.length > 0 ||
                                    Boolean(institutionSuggestionsError)) ? (
                                    <div
                                      id="collaborator-institution-suggestion-panel"
                                      role="listbox"
                                      className="absolute left-0 top-[calc(100%+0.35rem)] z-20 w-full overflow-hidden rounded-md border border-[hsl(var(--tone-neutral-200))] bg-card shadow-[var(--elevation-2)]"
                                    >
                                      {institutionSuggestionsLoading ? (
                                        <div className="flex items-center gap-2 px-3 py-2 text-xs text-[hsl(var(--tone-neutral-700))]">
                                          <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
                                          <span>Looking up affiliations...</span>
                                        </div>
                                      ) : null}
                                      {!institutionSuggestionsLoading && institutionSuggestions.length > 0 ? (
                                        <div className="max-h-56 divide-y divide-[hsl(var(--tone-neutral-200))] overflow-auto">
                                          {institutionSuggestions.map((suggestion) => (
                                            <button
                                              key={`collaborator-secondary-institution:${suggestion.source}:${suggestion.name}:${suggestion.countryCode || ''}`}
                                              type="button"
                                              onMouseDown={(event) => {
                                                event.preventDefault()
                                              }}
                                              onClick={() => onSelectInstitutionSuggestion(suggestion)}
                                              className="w-full px-3 py-2 text-left transition-colors hover:bg-[hsl(var(--tone-neutral-100))] focus-visible:bg-[hsl(var(--tone-neutral-100))]"
                                              title={suggestion.label}
                                            >
                                              <span className="flex items-start gap-2">
                                                <Building2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[hsl(var(--tone-neutral-500))]" aria-hidden />
                                                <span className="min-w-0">
                                                  <span className="block truncate text-sm text-[hsl(var(--tone-neutral-900))]">{suggestion.name}</span>
                                                  <span className="block truncate text-xs text-[hsl(var(--tone-neutral-600))]">{suggestion.label}</span>
                                                </span>
                                              </span>
                                            </button>
                                          ))}
                                        </div>
                                      ) : null}
                                      {!institutionSuggestionsLoading &&
                                      institutionSuggestions.length === 0 &&
                                      !institutionSuggestionsError &&
                                      sanitizeAffiliation(secondaryInstitutionDraft).length >= 2 ? (
                                        <p className="px-3 py-2 text-xs text-[hsl(var(--tone-neutral-600))]">No institution matches found.</p>
                                      ) : null}
                                      {!institutionSuggestionsLoading && institutionSuggestionsError ? (
                                        <p className="px-3 py-2 text-micro text-[hsl(var(--tone-warning-700))]">{institutionSuggestionsError}</p>
                                      ) : null}
                                    </div>
                                  ) : null}
                                </div>
                              </label>
                              {editingSecondaryInstitution ? (
                                <>
                                  <div className="flex h-9 items-center justify-start self-end sm:justify-center">
                                    <button
                                      type="button"
                                      className="house-collaborator-action-icon house-collaborator-action-icon-save shrink-0"
                                      aria-label="Save second institution draft"
                                      title="Save second institution draft"
                                      onClick={onCommitSecondaryInstitutionDraft}
                                      disabled={
                                        sanitizeAffiliation(secondaryInstitutionDraft) === sanitizeAffiliation(form.secondary_institution)
                                        && !secondaryInstitutionNeedsHydration
                                        && !institutionSuggestionMatchesValue(selectedInstitutionSuggestions.secondary, secondaryInstitutionDraft)
                                      }
                                    >
                                      <Save className="h-4 w-4" strokeWidth={2.2} />
                                    </button>
                                  </div>
                                  <div className="flex h-9 items-center justify-start self-end sm:justify-center">
                                    <button
                                      type="button"
                                      className="house-collaborator-action-icon house-collaborator-action-icon-discard shrink-0"
                                      aria-label="Discard second institution draft"
                                      title="Discard second institution draft"
                                      onClick={onCancelSecondaryInstitutionDraft}
                                    >
                                      <X className="h-4 w-4" strokeWidth={2.2} />
                                    </button>
                                  </div>
                                </>
                              ) : (
                                <>
                                  <div className="h-9 self-end" aria-hidden="true" />
                                  <div className="flex h-9 items-center justify-start self-end sm:justify-center">
                                    <button
                                      type="button"
                                      className="house-collaborator-action-icon house-collaborator-action-icon-edit shrink-0"
                                      aria-label="Edit second institution"
                                      title="Edit second institution"
                                      onClick={onStartSecondaryInstitutionEdit}
                                      disabled={Boolean(activeCollaboratorEditor)}
                                    >
                                      <Pencil className="h-4 w-4" strokeWidth={2.2} />
                                    </button>
                                  </div>
                                </>
                              )}
                            </>
                          ) : null}
                        </div>
                        {collaboratorAffiliations.length > 0 ? (
                          <div className="space-y-2">
                            <span className="house-field-label">Author affiliations</span>
                            <div className="space-y-2">
                              {collaboratorAffiliations.map((institution, index) => (
                                <div
                                  key={`author-affiliation-${institution.slot}-${institution.label}`}
                                  className="flex flex-wrap items-center gap-2 rounded-[var(--radius-sm)] border border-[hsl(var(--tone-neutral-200))] bg-white px-2.5 py-2 shadow-[var(--elevation-1)]"
                                >
                                  <span className="text-xs font-medium text-[hsl(var(--tone-neutral-700))]">{index + 1}.</span>
                                  <div className="min-w-[10rem] flex-1">
                                    <span className="block text-xs font-medium text-[hsl(var(--tone-neutral-800))]">{institution.label}</span>
                                    {pendingInstitutionReview[institution.slot] ? (
                                      <span className="block pt-0.5 text-micro text-[hsl(var(--tone-warning-700))]">
                                        Is this correct? Save to approve this OpenAlex match.
                                      </span>
                                    ) : null}
                                  </div>
                                  {institution.isPrimary ? (
                                    <Badge variant="positive" className="w-[6.75rem] justify-center">
                                      Primary
                                    </Badge>
                                  ) : (
                                    <Button
                                      type="button"
                                      onClick={() => onSetPrimaryInstitution(institution.label)}
                                      disabled={Boolean(activeCollaboratorEditor)}
                                      variant="default"
                                      size="sm"
                                      className="w-[6.75rem] min-h-0 h-auto justify-center px-2 py-1 text-micro font-medium leading-tight hover:border-[hsl(var(--tone-neutral-900))] hover:bg-white hover:text-[hsl(var(--tone-neutral-900))] active:border-[hsl(var(--tone-neutral-900))] active:bg-white active:text-[hsl(var(--tone-neutral-900))]"
                                    >
                                      Set primary
                                    </Button>
                                  )}
                                </div>
                              ))}
                            </div>
                          </div>
                        ) : null}
                        {collaboratorAffiliations.length > 0 ? (
                          <div className="space-y-2">
                            <span className="house-field-label">Author publication byline</span>
                            <div className="space-y-2">
                              {collaboratorAffiliations.map((institution, index) => {
                                const committedDraft = collaboratorBylineDraftFromForm(form, institution.slot)
                                const draft = institution.slot === 'secondary'
                                  ? secondaryAffiliationBylineDraft
                                  : primaryAffiliationBylineDraft
                                const isEditingByline = editingAffiliationBylineSlot === institution.slot
                                const preview = formatCollaboratorAffiliationByline({
                                  institution: institution.label,
                                  draft: committedDraft,
                                }) || institution.label
                                return (
                                  <div
                                    key={`author-byline-${institution.slot}-${institution.label}`}
                                    className="space-y-2 rounded-[var(--radius-sm)] border border-[hsl(var(--tone-neutral-200))] bg-[hsl(var(--tone-neutral-50))] px-3 py-2.5"
                                  >
                                    <div className="flex flex-wrap items-start gap-2">
                                      <div className="min-w-0 flex-1 space-y-1">
                                        <div className="flex flex-wrap items-center gap-2">
                                          <span className="text-xs font-medium text-[hsl(var(--tone-neutral-700))]">{index + 1}.</span>
                                          <span className="text-sm font-medium text-[hsl(var(--tone-neutral-900))]">{institution.label}</span>
                                          {institution.openalexId ? (
                                            <Badge variant="outline" className="text-micro">
                                              OpenAlex mapped
                                            </Badge>
                                          ) : null}
                                        </div>
                                        <p className="text-xs leading-relaxed text-[hsl(var(--tone-neutral-700))]">{preview}</p>
                                      </div>
                                      {isEditingByline ? (
                                        <>
                                          <div className="flex h-9 items-center justify-start sm:justify-center">
                                            <button
                                              type="button"
                                              className="house-collaborator-action-icon house-collaborator-action-icon-save shrink-0"
                                              aria-label={`Save ${institution.label} byline`}
                                              title={`Save ${institution.label} byline`}
                                              onClick={() => applyAffiliationBylineDraft(institution.slot)}
                                            >
                                              <Save className="h-4 w-4" strokeWidth={2.2} />
                                            </button>
                                          </div>
                                          <div className="flex h-9 items-center justify-start sm:justify-center">
                                            <button
                                              type="button"
                                              className="house-collaborator-action-icon house-collaborator-action-icon-discard shrink-0"
                                              aria-label={`Discard ${institution.label} byline edits`}
                                              title={`Discard ${institution.label} byline edits`}
                                              onClick={() => cancelAffiliationBylineDraft(institution.slot)}
                                            >
                                              <X className="h-4 w-4" strokeWidth={2.2} />
                                            </button>
                                          </div>
                                        </>
                                      ) : (
                                        <div className="flex h-9 items-center justify-start sm:justify-center">
                                          <button
                                            type="button"
                                            className="house-collaborator-action-icon house-collaborator-action-icon-edit shrink-0"
                                            aria-label={`Edit ${institution.label} byline`}
                                            title={`Edit ${institution.label} byline`}
                                            onClick={() => {
                                              if (activeCollaboratorEditor) {
                                                return
                                              }
                                              setEditingAffiliationBylineSlot(institution.slot)
                                            }}
                                            disabled={Boolean(activeCollaboratorEditor)}
                                          >
                                            <Pencil className="h-4 w-4" strokeWidth={2.2} />
                                          </button>
                                        </div>
                                      )}
                                    </div>
                                    {isEditingByline ? (
                                      <div className="grid gap-3 sm:grid-cols-2">
                                        <label className="space-y-1">
                                          <span className="house-field-label">Department</span>
                                          <Input
                                            value={draft.department}
                                            onChange={(event) => onAffiliationBylineDraftChange(institution.slot, 'department', event.target.value)}
                                          />
                                        </label>
                                        <label className="space-y-1 sm:col-span-2">
                                          <span className="house-field-label">Address line 1</span>
                                          <Input
                                            value={draft.address_line_1}
                                            onChange={(event) => onAffiliationBylineDraftChange(institution.slot, 'address_line_1', event.target.value)}
                                          />
                                        </label>
                                        <label className="space-y-1">
                                          <span className="house-field-label">City</span>
                                          <Input
                                            value={draft.city}
                                            onChange={(event) => onAffiliationBylineDraftChange(institution.slot, 'city', event.target.value)}
                                          />
                                        </label>
                                        <label className="space-y-1">
                                          <span className="house-field-label">Region / state</span>
                                          <Input
                                            value={draft.region}
                                            onChange={(event) => onAffiliationBylineDraftChange(institution.slot, 'region', event.target.value)}
                                          />
                                        </label>
                                        <label className="space-y-1">
                                          <span className="house-field-label">Postal code</span>
                                          <Input
                                            value={draft.postal_code}
                                            onChange={(event) => onAffiliationBylineDraftChange(institution.slot, 'postal_code', event.target.value)}
                                          />
                                        </label>
                                        <label className="space-y-1">
                                          <span className="house-field-label">Country</span>
                                          <Input
                                            value={draft.country}
                                            onChange={(event) => onAffiliationBylineDraftChange(institution.slot, 'country', event.target.value)}
                                          />
                                        </label>
                                      </div>
                                    ) : null}
                                  </div>
                                )
                              })}
                            </div>
                          </div>
                        ) : null}
                      </div>
                    </div>
                  </div>
                ) : null}

                {activeCollaboratorDrilldownTab === 'history' ? (
                  <>
                    <div className="house-drilldown-heading-block">
                      <p className="house-drilldown-heading-block-title">Headline results</p>
                    </div>
                    <div className="house-drilldown-content-block house-publications-headline-content house-drilldown-heading-content-block w-full">
                      <div
                        className="house-drilldown-summary-stats-grid house-publications-headline-metric-grid mt-0"
                        style={{ gridTemplateColumns: 'repeat(4, minmax(0, 1fr))' }}
                      >
                        <div className="house-drilldown-summary-stat-card">
                          <p className="house-drilldown-summary-stat-title house-drilldown-stat-title">Relationship</p>
                          <div className="house-drilldown-summary-stat-value-wrap">
                            <div className="flex w-full justify-center">
                              <Badge size="sm" variant={relationshipTone(selectedCollaboratorRelationship)}>
                                {selectedCollaboratorRelationship}
                              </Badge>
                            </div>
                          </div>
                        </div>
                        <div className="house-drilldown-summary-stat-card">
                          <p className="house-drilldown-summary-stat-title house-drilldown-stat-title">Activity</p>
                          <div className="house-drilldown-summary-stat-value-wrap">
                            <div className="flex w-full justify-center">
                              <Badge size="sm" variant={activityTone(selectedCollaboratorActivity)}>
                                {selectedCollaboratorActivity}
                              </Badge>
                            </div>
                          </div>
                        </div>
                        <div className="house-drilldown-summary-stat-card">
                          <p className="house-drilldown-summary-stat-title house-drilldown-stat-title">Score</p>
                          <div className="house-drilldown-summary-stat-value-wrap">
                            <div className="flex w-full justify-center">
                              <span
                                className={cn(
                                  'inline-flex min-w-[4.75rem] items-center justify-center rounded-full px-2 py-0.5 text-xs font-semibold tabular-nums',
                                  collaborationStrengthToneById.get(selectedCollaborator.id) || collaborationStrengthTone(0),
                                )}
                              >
                                {Number(selectedCollaborator.metrics.collaboration_strength_score || 0).toFixed(2)}
                              </span>
                            </div>
                          </div>
                        </div>
                        <div className="house-drilldown-summary-stat-card">
                          <p className="house-drilldown-summary-stat-title house-drilldown-stat-title">Co-authored works</p>
                          <div className="house-drilldown-summary-stat-value-wrap">
                            <p className="house-drilldown-summary-stat-value tabular-nums">
                              {selectedCollaborator.metrics.coauthored_works_count}
                            </p>
                          </div>
                        </div>
                        <div className="house-drilldown-summary-stat-card">
                          <p className="house-drilldown-summary-stat-title house-drilldown-stat-title">First year</p>
                          <div className="house-drilldown-summary-stat-value-wrap">
                            <p className="house-drilldown-summary-stat-value tabular-nums">
                              {selectedCollaborator.metrics.first_collaboration_year ?? 'Not available'}
                            </p>
                          </div>
                        </div>
                        <div className="house-drilldown-summary-stat-card">
                          <p className="house-drilldown-summary-stat-title house-drilldown-stat-title">Last year</p>
                          <div className="house-drilldown-summary-stat-value-wrap">
                            <p className="house-drilldown-summary-stat-value tabular-nums">
                              {selectedCollaborator.metrics.last_collaboration_year ?? 'Not available'}
                            </p>
                          </div>
                        </div>
                        <div className="house-drilldown-summary-stat-card">
                          <p className="house-drilldown-summary-stat-title house-drilldown-stat-title">Shared citations</p>
                          <div className="house-drilldown-summary-stat-value-wrap">
                            <p className="house-drilldown-summary-stat-value tabular-nums">
                              {selectedCollaborator.metrics.shared_citations_total.toLocaleString('en-GB')}
                            </p>
                          </div>
                        </div>
                        <div className="house-drilldown-summary-stat-card">
                          <p className="house-drilldown-summary-stat-title house-drilldown-stat-title">Citations (12m)</p>
                          <div className="house-drilldown-summary-stat-value-wrap">
                            <p className="house-drilldown-summary-stat-value tabular-nums">
                              {selectedCollaborator.metrics.citations_last_12m.toLocaleString('en-GB')}
                            </p>
                          </div>
                        </div>
                      </div>
                    </div>
                    <div className="house-drilldown-heading-block">
                      <div className="flex flex-wrap items-center justify-between gap-3">
                        <p className="house-drilldown-heading-block-title">Co-authored publications</p>
                        <div className="ml-auto flex items-center gap-1.5">
                          <div className="house-approved-toggle-context inline-flex items-center">
                            <div
                              className={cn(HOUSE_METRIC_TOGGLE_TRACK_CLASS, 'grid-cols-[24%_24%_24%_28%]')}
                              data-house-role="chart-toggle"
                              style={{ width: '8.75rem', minWidth: '8.75rem', maxWidth: '8.75rem' }}
                            >
                              <span
                                className={HOUSE_TOGGLE_THUMB_CLASS}
                                style={sharedWorksWindowThumbStyle}
                                aria-hidden="true"
                              />
                              {COLLABORATOR_HISTORY_WINDOW_OPTIONS.map((option) => (
                                <button
                                  key={`collaborator-history-window-${option.value}`}
                                  type="button"
                                  className={cn(
                                    HOUSE_TOGGLE_BUTTON_CLASS,
                                    sharedWorksWindowMode === option.value ? 'text-white' : HOUSE_DRILLDOWN_TOGGLE_MUTED_CLASS,
                                  )}
                                  onClick={() => {
                                    if (sharedWorksWindowMode === option.value) {
                                      return
                                    }
                                    setSharedWorksWindowMode(option.value)
                                  }}
                                  aria-pressed={sharedWorksWindowMode === option.value}
                                >
                                  {option.label}
                                </button>
                              ))}
                            </div>
                          </div>
                          <span
                            className={cn(
                              'inline-flex h-7 w-7 items-center justify-center rounded-full border shadow-[var(--elevation-xs)]',
                              'border-[hsl(var(--tone-accent-300))] bg-[hsl(var(--tone-neutral-50)/0.96)]',
                            )}
                            aria-hidden="true"
                          >
                            <InsightsGlyph className="h-4 w-4" />
                          </span>
                        </div>
                      </div>
                    </div>
                    <div className="house-drilldown-content-block house-drilldown-heading-content-block w-full">
                      {selectedCollaboratorSharedWorksError ? (
                        <div className="rounded-md border border-dashed border-[hsl(var(--tone-danger-300))] px-3 py-4 text-sm text-[hsl(var(--tone-danger-700))]">
                          {selectedCollaboratorSharedWorksError}
                        </div>
                      ) : selectedCollaboratorSharedWorksLoading ? (
                        <div className="rounded-md border border-dashed border-[hsl(var(--tone-neutral-300))] px-3 py-4 text-sm text-muted-foreground">
                          Loading co-authored publications...
                        </div>
                      ) : sortedSelectedCollaboratorSharedWorks.length === 0 ? (
                        <div className="rounded-md border border-dashed border-[hsl(var(--tone-neutral-300))] px-3 py-4 text-sm text-muted-foreground">
                          No co-authored publications found for this window.
                        </div>
                      ) : (
                        <div className="w-full overflow-visible">
                          <div
                            className="house-table-shell h-auto w-full overflow-hidden rounded-md bg-background"
                            style={{ overflowX: 'hidden', overflowY: 'visible', maxWidth: '100%' }}
                          >
                            <table className="w-full border-collapse" data-house-no-column-resize="true" data-house-no-column-controls="true">
                              <thead className="house-table-head">
                                <tr>
                                  <th className="house-table-head-text h-10 px-2 text-left align-middle font-semibold whitespace-nowrap">
                                    <button
                                      type="button"
                                      className={cn(
                                        'inline-flex w-full items-center justify-start gap-1 text-left transition-colors hover:text-foreground',
                                        HOUSE_TABLE_SORT_TRIGGER_CLASS,
                                      )}
                                      onClick={() => onSortSharedWorks('title')}
                                    >
                                      <span>Publication</span>
                                      {renderSharedWorksSortIcon('title')}
                                    </button>
                                  </th>
                                  <th className="house-table-head-text h-10 px-1.5 text-center align-middle font-semibold whitespace-nowrap" style={{ width: '1%' }}>
                                    <button
                                      type="button"
                                      className={cn(
                                        'inline-flex w-full items-center justify-center gap-1 text-center transition-colors hover:text-foreground',
                                        HOUSE_TABLE_SORT_TRIGGER_CLASS,
                                      )}
                                      onClick={() => onSortSharedWorks('year')}
                                    >
                                      <span>Year</span>
                                      {renderSharedWorksSortIcon('year')}
                                    </button>
                                  </th>
                                  <th className="house-table-head-text h-10 px-2 text-center align-middle font-semibold whitespace-nowrap" style={{ width: '1%' }}>
                                    <button
                                      type="button"
                                      className={cn(
                                        'inline-flex w-full items-center justify-center gap-1 text-center transition-colors hover:text-foreground',
                                        HOUSE_TABLE_SORT_TRIGGER_CLASS,
                                      )}
                                      onClick={() => onSortSharedWorks('citations_total')}
                                    >
                                      <span>Citations</span>
                                      {renderSharedWorksSortIcon('citations_total')}
                                    </button>
                                  </th>
                                </tr>
                              </thead>
                              <tbody>
                                {sortedSelectedCollaboratorSharedWorks.map((work) => (
                                  <tr key={work.work_id} className="house-table-row">
                                    <td className="house-table-cell-text px-2 py-2">
                                      <button
                                        type="button"
                                        className="block max-w-full break-words text-left leading-snug underline decoration-transparent underline-offset-2 transition hover:decoration-current"
                                        style={{ color: 'hsl(var(--foreground))', WebkitTextFillColor: 'hsl(var(--foreground))' }}
                                        onClick={() => onOpenSharedPublication(work.work_id)}
                                      >
                                        {work.title}
                                      </button>
                                    </td>
                                    <td className="house-table-cell-text px-1.5 py-2 text-center whitespace-nowrap tabular-nums">
                                      {work.year ?? '-'}
                                    </td>
                                    <td className="house-table-cell-text px-2 py-2 text-center whitespace-nowrap tabular-nums">
                                      {Math.max(0, Number(work.citations_total || 0)).toLocaleString('en-GB')}
                                    </td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        </div>
                      )}
                    </div>
                  </>
                ) : null}

                {activeCollaboratorDrilldownTab === 'actions' ? (
                  <div className="house-drilldown-content-block w-full">
                    <div className="rounded-md border border-dashed border-[hsl(var(--tone-neutral-300))] px-3 py-4 text-sm text-muted-foreground">
                      No standalone actions in this drilldown.
                    </div>
                  </div>
                ) : null}
              </DrilldownSheet.TabPanel>
            </DrilldownSheet.Content>
          </>
        ) : (
          <DrilldownSheet.Placeholder className="text-sm text-muted-foreground">
            Select a collaborator to inspect details.
          </DrilldownSheet.Placeholder>
        )}
      </DrilldownSheet>

      {loading ? <p className="text-xs text-muted-foreground">Loading collaboration data...</p> : null}
    </Stack>
  )
}
