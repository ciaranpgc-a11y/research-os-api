import { useEffect, useMemo, useState } from 'react'
import { ChevronDown, ChevronUp, ChevronsUpDown, Download, Eye, EyeOff, FileText, Filter, Hammer, Lightbulb, Search, Settings, Share2, Sparkles } from 'lucide-react'
import { useNavigate, useSearchParams } from 'react-router-dom'

import {
  PageHeader,
  Row,
  Section,
  SectionHeader,
  Stack,
  CardPrimitive as Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  TextareaPrimitive as Textarea,
} from '@/components/primitives'
import { SectionMarker, SectionToolDivider, SectionTools } from '@/components/patterns'
import { getSectionMarkerTone } from '@/lib/section-tone'
import { houseLayout, houseTables } from '@/lib/house-style'
import { cn } from '@/lib/utils'
import { UKCollaborationMap } from '@/components/collaboration/UKCollaborationMap'
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
  deleteCollaborator,
  exportCollaboratorsCsv,
  fetchCollaborationMetricsSummary,
  generateCollaborationAiAffiliationsNormaliser,
  generateCollaborationAiAuthorSuggestions,
  generateCollaborationAiContributionStatement,
  generateCollaborationAiInsights,
  getCollaborator,
  updateCollaborator,
} from '@/lib/impact-api'
import type {
  CollaborationAiAffiliationsNormalisePayload,
  CollaborationAiAuthorSuggestionsPayload,
  CollaborationAiContributionDraftPayload,
  CollaborationAiInsightsPayload,
  CollaborationEnrichOpenAlexPayload,
  CollaboratorPayload,
  CollaboratorsListPayload,
  CollaborationImportOpenAlexPayload,
  CollaborationMetricsSummaryPayload,
} from '@/types/impact'

type CollaboratorFormState = {
  full_name: string
  preferred_name: string
  email: string
  orcid_id: string
  openalex_author_id: string
  primary_institution: string
  department: string
  country: string
  current_position: string
  research_domains: string
  notes: string
}

type CollaboratorCanonical = CollaboratorPayload & {
  institution_labels: string[]
  duplicate_count: number
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
  | 'domains'
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
type SortDirection = 'asc' | 'desc'
type CollaborationTableColumnPreference = {
  visible: boolean
}

type MockMetricsSeed = Pick<
  CollaboratorPayload['metrics'],
  'coauthored_works_count' | 'last_collaboration_year' | 'collaboration_strength_score'
>

const EMPTY_FORM: CollaboratorFormState = {
  full_name: '',
  preferred_name: '',
  email: '',
  orcid_id: '',
  openalex_author_id: '',
  primary_institution: '',
  department: '',
  country: '',
  current_position: '',
  research_domains: '',
  notes: '',
}

const HOUSE_SECTION_ANCHOR_CLASS = houseLayout.sectionAnchor
const HOUSE_TABLE_SORT_TRIGGER_CLASS = houseTables.sortTrigger
const COLLABORATORS_PAGE_SIZE_DEFAULT: CollaborationTablePageSize = 50
const HEATMAP_TOP_CELL_LIMIT = 24
const HEATMAP_OTHERS_KEY = '__others__'
const COLLABORATION_TABLE_COLUMN_ORDER: CollaborationTableColumnKey[] = [
  'name',
  'institution',
  'domains',
  'relationship',
  'activity',
  'last_year',
  'coauthored_works',
  'collaboration_score',
]
const COLLABORATION_TABLE_COLUMN_DEFINITIONS: Record<
  CollaborationTableColumnKey,
  { label: string; headerClassName?: string; cellClassName?: string }
> = {
  name: { label: 'Name', headerClassName: 'text-left', cellClassName: 'align-top font-medium whitespace-normal break-words leading-tight' },
  institution: { label: 'Institution', headerClassName: 'text-left', cellClassName: 'align-top whitespace-normal break-words leading-tight' },
  domains: { label: 'Domains', headerClassName: 'text-left', cellClassName: 'align-top whitespace-normal break-words leading-tight' },
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
  name: { visible: true },
  institution: { visible: true },
  domains: { visible: true },
  relationship: { visible: true },
  activity: { visible: true },
  last_year: { visible: true },
  coauthored_works: { visible: true },
  collaboration_score: { visible: true },
}

function toFormState(value: CollaboratorPayload): CollaboratorFormState {
  return {
    full_name: value.full_name || '',
    preferred_name: value.preferred_name || '',
    email: value.email || '',
    orcid_id: value.orcid_id || '',
    openalex_author_id: value.openalex_author_id || '',
    primary_institution: value.primary_institution || '',
    department: value.department || '',
    country: value.country || '',
    current_position: value.current_position || '',
    research_domains: (value.research_domains || []).join(', '),
    notes: value.notes || '',
  }
}

function parseDomains(value: string): string[] {
  return value
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean)
}

function parseCommaSeparatedTokens(value: string): string[] {
  return value
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean)
    .slice(0, 20)
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
  return 'name'
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
  const initialCachedLandingData = useMemo(
    () =>
      readCachedCollaborationLandingData({
        query: initialQuery,
        sort: initialSort,
      }),
    [initialQuery, initialSort],
  )
  const [summary, setSummary] = useState<CollaborationMetricsSummaryPayload | null>(initialCachedLandingData?.summary || null)
  const [listing, setListing] = useState<CollaboratorsListPayload | null>(initialCachedLandingData?.listing || null)
  const [query, setQuery] = useState(() => initialQuery)
  const [sort, setSort] = useState<CollaborationSortField>(() => initialSort)
  const [sortDirection, setSortDirection] = useState<SortDirection>(() => (
    initialSort === 'name' ? 'asc' : 'desc'
  ))
  const [page, setPage] = useState(() => parsePositiveInteger(searchParams.get('page'), 1))
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [collaboratorDrilldownOpen, setCollaboratorDrilldownOpen] = useState(false)
  const [form, setForm] = useState<CollaboratorFormState>(EMPTY_FORM)
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [status, setStatus] = useState('')
  const [error, setError] = useState('')
  const [duplicateWarnings, setDuplicateWarnings] = useState<string[]>([])
  const [importResult] = useState<CollaborationImportOpenAlexPayload | null>(null)
  const [enrichmentResult] = useState<CollaborationEnrichOpenAlexPayload | null>(null)
  const [aiTopicKeywords, setAiTopicKeywords] = useState('')
  const [aiMethods, setAiMethods] = useState('')
  const [aiInsights, setAiInsights] = useState<CollaborationAiInsightsPayload | null>(null)
  const [aiAuthorSuggestions, setAiAuthorSuggestions] = useState<CollaborationAiAuthorSuggestionsPayload | null>(null)
  const [aiContributionDraft, setAiContributionDraft] = useState<CollaborationAiContributionDraftPayload | null>(null)
  const [aiAffiliationDraft, setAiAffiliationDraft] = useState<CollaborationAiAffiliationsNormalisePayload | null>(null)
  const [aiLoading, setAiLoading] = useState<string | null>(null)
  const [aiError, setAiError] = useState('')
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
  const [collaborationTableColumns, setCollaborationTableColumns] = useState<
    Record<CollaborationTableColumnKey, CollaborationTableColumnPreference>
  >({ ...COLLABORATION_TABLE_COLUMN_DEFAULTS })
  const [collaborationTableDensity, setCollaborationTableDensity] = useState<CollaborationTableDensity>('default')
  const [collaborationTableAlternateRowColoring, setCollaborationTableAlternateRowColoring] = useState(true)
  const [collaborationTableMetricHighlights, setCollaborationTableMetricHighlights] = useState(true)
  const [collaborationTableAutoFitTick, setCollaborationTableAutoFitTick] = useState(0)
  const [collaborationLibraryPageSize, setCollaborationLibraryPageSize] = useState<CollaborationTablePageSize>(
    COLLABORATORS_PAGE_SIZE_DEFAULT,
  )

  // Mock data for dev visualization
  useEffect(() => {
    if (import.meta.env.DEV && import.meta.env.VITE_AUTH_BYPASS === 'true' && !listing) {
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

  const duplicateRecordDelta = Math.max(0, (listing?.items?.length || 0) - canonicalCollaborators.length)

  const selectedCollaborator = useMemo(() => {
    return canonicalCollaborators.find((item) => item.id === selectedId) || null
  }, [canonicalCollaborators, selectedId])

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

  const aiAuthorDraftSeed = useMemo(() => {
    const seeds: CollaboratorPayload[] = []
    if (selectedCollaborator) {
      seeds.push(selectedCollaborator)
    }
    for (const item of filteredCollaborators) {
      if (seeds.length >= 3) {
        break
      }
      if (seeds.some((seed) => seed.id === item.id)) {
        continue
      }
      seeds.push(item)
    }
    return seeds
  }, [filteredCollaborators, selectedCollaborator])

  const visibleCollaborationTableColumns = useMemo(() => (
    COLLABORATION_TABLE_COLUMN_ORDER.filter((column) => collaborationTableColumns[column].visible)
  ), [collaborationTableColumns])

  const onToggleCollaborationColumnVisibility = (column: CollaborationTableColumnKey) => {
    setCollaborationTableColumns((current) => {
      const visibleCount = COLLABORATION_TABLE_COLUMN_ORDER.reduce(
        (count, key) => count + (current[key].visible ? 1 : 0),
        0,
      )
      if (current[column].visible && visibleCount <= 1) {
        return current
      }
      return {
        ...current,
        [column]: {
          ...current[column],
          visible: !current[column].visible,
        },
      }
    })
  }

  const onResetCollaborationTableSettings = () => {
    setCollaborationTableColumns({ ...COLLABORATION_TABLE_COLUMN_DEFAULTS })
    setCollaborationTableDensity('default')
    setCollaborationTableAlternateRowColoring(true)
    setCollaborationTableMetricHighlights(true)
    setCollaborationLibraryPageSize(COLLABORATORS_PAGE_SIZE_DEFAULT)
    setPage(1)
  }

  const onAutoAdjustCollaborationTableWidths = () => {
    setCollaborationTableAutoFitTick((current) => current + 1)
  }

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

  const totalPages = useMemo(
    () => {
      if (collaborationLibraryPageSize === 'all') {
        return 1
      }
      return Math.max(1, Math.ceil(sortedCollaborators.length / collaborationLibraryPageSize))
    },
    [collaborationLibraryPageSize, sortedCollaborators.length],
  )

  const pagedCollaborators = useMemo(() => {
    if (collaborationLibraryPageSize === 'all') {
      return sortedCollaborators
    }
    const start = (page - 1) * collaborationLibraryPageSize
    return sortedCollaborators.slice(start, start + collaborationLibraryPageSize)
  }, [collaborationLibraryPageSize, page, sortedCollaborators])

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
    if (sort !== 'name') {
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

  const load = async (token: string, options?: { background?: boolean }) => {
    const background = Boolean(options?.background)
    if (!background) {
      setLoading(true)
      setError('')
    }
    try {
      const [summaryPayload, listPayload] = await Promise.all([
        fetchCollaborationMetricsSummary(token),
        fetchAllCollaboratorsForCollaborationPage(token, {
          query,
          sort,
        }),
      ])
      setSummary(summaryPayload)
      setListing(listPayload)
      writeCachedCollaborationLandingData({
        query,
        sort,
        summary: summaryPayload,
        listing: listPayload,
      })
      const selectedStillPresent = selectedId
        ? listPayload.items.some((item) => item.id === selectedId)
        : false
      if (!selectedStillPresent && listPayload.items.length > 0) {
        const first = listPayload.items[0]
        setSelectedId(first.id)
        setForm(toFormState(first))
      }
      if (listPayload.items.length === 0) {
        setSelectedId(null)
        setForm(EMPTY_FORM)
        setDuplicateWarnings([])
      }
    } catch (loadError) {
      if (!background) {
        setError(loadError instanceof Error ? loadError.message : 'Could not load collaboration page.')
      }
    } finally {
      if (!background) {
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
    const cached = readCachedCollaborationLandingData({ query, sort })
    if (cached) {
      setSummary(cached.summary)
      setListing(cached.listing)
    }
    void load(token, { background: Boolean(cached) })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [navigate, sort])

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
      .then((item) => {
        setForm(toFormState(item))
        setDuplicateWarnings(item.duplicate_warnings || [])
      })
      .catch(() => undefined)
  }, [selectedId])

  const onSearch = async () => {
    const token = getAuthSessionToken()
    if (!token) {
      navigate('/auth', { replace: true })
      return
    }
    setPage(1)
    setHeatmapSelection(null)
    const cached = readCachedCollaborationLandingData({ query, sort })
    if (cached) {
      setSummary(cached.summary)
      setListing(cached.listing)
      await load(token, { background: true })
      return
    }
    await load(token)
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
    setForm(toFormState(collaborator))
    setDuplicateWarnings(collaborator.duplicate_warnings || [])
    setStatus('')
    setError('')
    setCollaboratorDrilldownOpen(true)
  }

  const onSave = async () => {
    if (!selectedId) {
      setError('Select a collaborator first.')
      return
    }
    const token = getAuthSessionToken()
    if (!token) {
      navigate('/auth', { replace: true })
      return
    }
    setSaving(true)
    setError('')
    setStatus('')
    try {
      const payload = {
        full_name: form.full_name,
        preferred_name: form.preferred_name || null,
        email: form.email || null,
        orcid_id: form.orcid_id || null,
        openalex_author_id: form.openalex_author_id || null,
        primary_institution: form.primary_institution || null,
        department: form.department || null,
        country: form.country || null,
        current_position: form.current_position || null,
        research_domains: parseDomains(form.research_domains),
        notes: form.notes || null,
      }
      const saved = await updateCollaborator(token, selectedId, payload)
      setSelectedId(saved.id)
      setForm(toFormState(saved))
      setDuplicateWarnings(saved.duplicate_warnings || [])
      setStatus('Collaborator updated.')
      await load(token)
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : 'Could not save collaborator.')
    } finally {
      setSaving(false)
    }
  }

  const onDelete = async () => {
    if (!selectedId) {
      return
    }
    const token = getAuthSessionToken()
    if (!token) {
      navigate('/auth', { replace: true })
      return
    }
    setSaving(true)
    setError('')
    try {
      await deleteCollaborator(token, selectedId)
      setStatus('Collaborator deleted.')
      setSelectedId(null)
      setCollaboratorDrilldownOpen(false)
      setForm(EMPTY_FORM)
      setDuplicateWarnings([])
      await load(token)
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : 'Could not delete collaborator.')
    } finally {
      setSaving(false)
    }
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

  const onGenerateAiInsights = async () => {
    const token = getAuthSessionToken()
    if (!token) {
      navigate('/auth', { replace: true })
      return
    }
    setAiLoading('insights')
    setAiError('')
    try {
      const payload = await generateCollaborationAiInsights(token)
      setAiInsights(payload)
    } catch (aiLoadError) {
      setAiError(aiLoadError instanceof Error ? aiLoadError.message : 'Could not generate insights draft.')
    } finally {
      setAiLoading(null)
    }
  }

  const onGenerateAiAuthorSuggestions = async () => {
    const token = getAuthSessionToken()
    if (!token) {
      navigate('/auth', { replace: true })
      return
    }
    setAiLoading('author-suggestions')
    setAiError('')
    try {
      const payload = await generateCollaborationAiAuthorSuggestions(token, {
        topicKeywords: parseCommaSeparatedTokens(aiTopicKeywords),
        methods: parseCommaSeparatedTokens(aiMethods),
        limit: 6,
      })
      setAiAuthorSuggestions(payload)
    } catch (aiLoadError) {
      setAiError(
        aiLoadError instanceof Error
          ? aiLoadError.message
          : 'Could not generate author suggestion draft.',
      )
    } finally {
      setAiLoading(null)
    }
  }

  const onGenerateAiContributionDraft = async () => {
    if (aiAuthorDraftSeed.length === 0) {
      setAiError('Add or select collaborators first.')
      return
    }
    const token = getAuthSessionToken()
    if (!token) {
      navigate('/auth', { replace: true })
      return
    }
    setAiLoading('contribution')
    setAiError('')
    try {
      const payload = await generateCollaborationAiContributionStatement(token, {
        authors: aiAuthorDraftSeed.map((item, index) => ({
          full_name: item.full_name,
          roles: [],
          is_corresponding: index === 0,
          equal_contribution: false,
          is_external: false,
        })),
      })
      setAiContributionDraft(payload)
    } catch (aiLoadError) {
      setAiError(
        aiLoadError instanceof Error
          ? aiLoadError.message
          : 'Could not generate contribution statement draft.',
      )
    } finally {
      setAiLoading(null)
    }
  }

  const onGenerateAiAffiliationsDraft = async () => {
    if (aiAuthorDraftSeed.length === 0) {
      setAiError('Add or select collaborators first.')
      return
    }
    const token = getAuthSessionToken()
    if (!token) {
      navigate('/auth', { replace: true })
      return
    }
    setAiLoading('affiliations')
    setAiError('')
    try {
      const payload = await generateCollaborationAiAffiliationsNormaliser(token, {
        authors: aiAuthorDraftSeed.map((item) => ({
          full_name: item.full_name,
          institution: item.primary_institution,
          orcid_id: item.orcid_id,
        })),
      })
      setAiAffiliationDraft(payload)
    } catch (aiLoadError) {
      setAiError(
        aiLoadError instanceof Error
          ? aiLoadError.message
          : 'Could not generate affiliations draft.',
      )
    } finally {
      setAiLoading(null)
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
              <p className="house-metric-tile-value !mt-0 text-center">{canonicalCollaborators.length}</p>
            </div>
          </div>
          <div className="house-metric-tile-shell grid min-h-20 grid-rows-[auto_1fr] rounded-md border p-2">
            <p className="house-h2">Core collaborators</p>
            <div className="flex w-full items-center justify-center">
              <p className="house-metric-tile-value !mt-0 text-center">{summary?.core_collaborators ?? 0}</p>
            </div>
          </div>
          <div className="house-metric-tile-shell grid min-h-20 grid-rows-[auto_1fr] rounded-md border p-2">
            <p className="house-h2">Active collaborations (12m)</p>
            <div className="flex w-full items-center justify-center">
              <p className="house-metric-tile-value !mt-0 text-center">{summary?.active_collaborations_12m ?? 0}</p>
            </div>
          </div>
          <div className="house-metric-tile-shell grid min-h-20 grid-rows-[auto_1fr] rounded-md border p-2">
            <p className="house-h2">New collaborators (12m)</p>
            <div className="flex w-full items-center justify-center">
              <p className="house-metric-tile-value !mt-0 text-center">{summary?.new_collaborators_12m ?? 0}</p>
            </div>
          </div>
        </div>
        {duplicateRecordDelta > 0 ? (
          <p className="mt-2 text-xs text-muted-foreground">
            Deduped {duplicateRecordDelta.toLocaleString('en-GB')} duplicate collaborator records across institutions for analytics and table accuracy.
          </p>
        ) : null}

        <SectionHeader
          heading="Collaborators"
          className="house-publications-toolbar-header house-collaboration-toolbar-header mt-[var(--separator-section-content-to-section-header)]"
          actions={(
          <div className="ml-auto flex h-8 w-full items-center justify-end gap-1 overflow-visible self-center md:w-auto">
            <SectionTools tone="publications" framed={false} className="order-1">
              {collaborationLibraryVisible ? (
                <div className="relative order-1 shrink-0">
                  <button
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
                  {collaborationSearchVisible ? (
                    <div className="house-publications-search-popover absolute right-[calc(100%+0.5rem)] top-0 z-30 w-[22.5rem]">
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
                    </div>
                  ) : null}
                </div>
              ) : null}
              {collaborationLibraryVisible ? (
                <div className="relative order-2 shrink-0">
                  <button
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
                  {collaborationFilterVisible ? (
                    <div className="house-publications-filter-popover absolute right-[calc(100%+0.5rem)] top-0 z-30 w-[17.5rem]">
                      <div className="house-publications-filter-header">
                        <p className="house-publications-filter-title">Filter library</p>
                        <button
                          type="button"
                          className="house-publications-filter-clear"
                          onClick={() => {
                            setHeatmapSelection(null)
                            setCollaborationFilterVisible(false)
                          }}
                        >
                          Clear
                        </button>
                      </div>
                      <p className="house-publications-filter-empty">
                        {heatmapSelection ? 'Heat map filter currently applied.' : 'No active collaborator filters.'}
                      </p>
                    </div>
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
                  {collaborationDownloadVisible ? (
                    <div className="house-publications-filter-popover absolute right-[calc(100%+0.5rem)] top-0 z-40 w-[14rem]">
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
                    </div>
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
                  {collaborationSettingsVisible ? (
                    <div className="house-publications-filter-popover absolute right-[calc(100%+0.5rem)] top-0 z-30 w-[18.75rem]">
                      <div className="house-publications-filter-header">
                        <p className="house-publications-filter-title">Table settings</p>
                        <div className="inline-flex items-center gap-2">
                          <button type="button" className="house-publications-filter-clear" onClick={onAutoAdjustCollaborationTableWidths}>
                            Auto fit
                          </button>
                          <button type="button" className="house-publications-filter-clear" onClick={onResetCollaborationTableSettings}>
                            Reset
                          </button>
                        </div>
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
                            <label key={`collaboration-sort-${sortOption}`} className="house-publications-filter-option">
                              <input
                                type="radio"
                                name="collaboration-sort"
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
                          <span>Columns</span>
                          <span className="house-publications-filter-count">
                            {visibleCollaborationTableColumns.length}/{COLLABORATION_TABLE_COLUMN_ORDER.length}
                          </span>
                        </summary>
                        <div className="house-publications-filter-options">
                          {COLLABORATION_TABLE_COLUMN_ORDER.map((columnKey) => {
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
                            <label key={`collaboration-density-${densityOption}`} className="house-publications-filter-option">
                              <input
                                type="radio"
                                name="collaboration-table-density"
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
                            <label key={`collaboration-page-size-${pageSizeOption}`} className="house-publications-filter-option">
                              <input
                                type="radio"
                                name="collaboration-table-page-size"
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
                    </div>
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
              <div className="relative w-full house-table-context-profile">
                <Table
                  key={`collaboration-table-autofit-${collaborationTableAutoFitTick}`}
                  className={cn(
                    'w-full',
                    collaborationTableDensity === 'compact' && 'house-publications-table-density-compact',
                    collaborationTableDensity === 'comfortable' && 'house-publications-table-density-comfortable',
                  )}
                  data-house-no-column-resize="true"
                  data-house-no-column-controls="true"
                >
                  <TableHeader className="house-table-head text-left">
                    <TableRow style={{ backgroundColor: 'transparent' }}>
                      {visibleCollaborationTableColumns.map((columnKey) => {
                        const sortField = COLLABORATION_TABLE_COLUMN_SORT_FIELD[columnKey]
                        const headerClassName = COLLABORATION_TABLE_COLUMN_DEFINITIONS[columnKey].headerClassName || 'text-left'
                        const alignClass = headerClassName.includes('text-center')
                          ? 'justify-center text-center'
                          : headerClassName.includes('text-right')
                            ? 'justify-end text-right'
                            : 'justify-start text-left'
                        return (
                          <TableHead
                            key={`collaboration-head-${columnKey}`}
                            className={cn('house-table-head-text', headerClassName)}
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
                                {item.full_name}
                              </TableCell>
                            )
                          }
                          if (columnKey === 'institution') {
                            return (
                              <TableCell key={`${item.id}-institution`} className="house-table-cell-text align-top whitespace-normal break-words leading-tight">
                                {item.institution_labels.join(' • ') || item.primary_institution || '-'}
                              </TableCell>
                            )
                          }
                          if (columnKey === 'domains') {
                            return (
                              <TableCell key={`${item.id}-domains`} className="house-table-cell-text align-top whitespace-normal break-words leading-tight">
                                <div className="flex flex-wrap gap-1">
                                  {(item.research_domains || []).slice(0, 3).map((domain) => (
                                    <Badge key={domain} variant="outline">
                                      {domain}
                                    </Badge>
                                  ))}
                                </div>
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
                              className={cn(
                                'house-table-cell-text align-top text-center whitespace-nowrap tabular-nums',
                                collaborationTableMetricHighlights && 'font-semibold text-[hsl(var(--tone-accent-800))]',
                              )}
                            >
                              {Number(item.metrics.collaboration_strength_score || 0).toFixed(2)}
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
                    <p className="font-medium">{item.full_name}</p>
                    <div className="flex items-center gap-1">
                      <Badge size="sm" variant={relationshipTone(resolveRelationshipTier(item.metrics))}>
                        {resolveRelationshipTier(item.metrics)}
                      </Badge>
                      <Badge size="sm" variant={activityTone(resolveActivityStatus(item.metrics))}>
                        {resolveActivityStatus(item.metrics)}
                      </Badge>
                    </div>
                  </div>
                  <p className="text-xs text-muted-foreground">{item.primary_institution || 'No institution'}</p>
                  {item.institution_labels.length > 1 ? (
                    <p className="text-xs text-muted-foreground">Institutions: {item.institution_labels.join(' • ')}</p>
                  ) : null}
                  <p className="text-xs text-muted-foreground">
                    Works: {item.metrics.coauthored_works_count} | Last year:{' '}
                    {item.metrics.last_collaboration_year ?? '-'}
                  </p>
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

      <Card>
        <CardHeader className="space-y-2">
          <CardTitle className="flex items-center gap-2">
            <Sparkles className="h-4 w-4" />
            AI tools
          </CardTitle>
          <CardDescription>
            Draft-only helpers powered by your collaborator records. Outputs are editable and include provenance.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-3 lg:grid-cols-2">
            <div className="rounded border border-border p-3">
              <div className="mb-2 flex items-center justify-between gap-2">
                <p className="text-sm font-medium">Collaboration insights</p>
                <Button
                  type="button"
                  size="sm"
                  variant="secondary"
                  onClick={onGenerateAiInsights}
                  disabled={aiLoading !== null}
                >
                  <Lightbulb className="mr-1 h-3.5 w-3.5" />
                  {aiLoading === 'insights' ? 'Generating...' : 'Generate draft'}
                </Button>
              </div>
              {aiInsights ? (
                <div className="space-y-2 text-xs">
                  {aiInsights.insights.map((item) => (
                    <p key={item}>- {item}</p>
                  ))}
                  {aiInsights.suggested_actions.length > 0 ? (
                    <div>
                      <p className="font-medium">Suggested actions</p>
                      {aiInsights.suggested_actions.map((item) => (
                        <p key={item}>- {item}</p>
                      ))}
                    </div>
                  ) : null}
                </div>
              ) : (
                <p className="text-xs text-muted-foreground">No draft generated yet.</p>
              )}
            </div>

            <div className="rounded border border-border p-3">
              <div className="mb-2 flex items-center justify-between gap-2">
                <p className="text-sm font-medium">Author suggestions for manuscript</p>
                <Button
                  type="button"
                  size="sm"
                  variant="secondary"
                  onClick={onGenerateAiAuthorSuggestions}
                  disabled={aiLoading !== null}
                >
                  {aiLoading === 'author-suggestions' ? 'Generating...' : 'Generate draft'}
                </Button>
              </div>
              <div className="mb-2 grid gap-2">
                <Input
                  value={aiTopicKeywords}
                  onChange={(event) => setAiTopicKeywords(event.target.value)}
                  placeholder="Topic keywords (comma-separated)"
                />
                <Input
                  value={aiMethods}
                  onChange={(event) => setAiMethods(event.target.value)}
                  placeholder="Methods (comma-separated)"
                />
              </div>
              {aiAuthorSuggestions ? (
                <div className="space-y-2 text-xs">
                  {aiAuthorSuggestions.suggestions.map((item) => (
                    <div key={item.collaborator_id} className="rounded border border-border/70 p-2">
                      <p className="font-medium">
                        {item.full_name} ({item.score.toFixed(2)})
                      </p>
                      <p className="text-muted-foreground">{item.explanation}</p>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-xs text-muted-foreground">No draft generated yet.</p>
              )}
            </div>
          </div>

          <div className="grid gap-3 lg:grid-cols-2">
            <div className="rounded border border-border p-3">
              <div className="mb-2 flex items-center justify-between gap-2">
                <p className="text-sm font-medium">Contribution statement drafter (CRediT)</p>
                <Button
                  type="button"
                  size="sm"
                  variant="secondary"
                  onClick={onGenerateAiContributionDraft}
                  disabled={aiLoading !== null}
                >
                  {aiLoading === 'contribution' ? 'Generating...' : 'Generate draft'}
                </Button>
              </div>
              <p className="mb-2 text-xs text-muted-foreground">
                Uses selected collaborator plus top collaborators from your list.
              </p>
              {aiContributionDraft ? (
                <pre className="max-h-48 overflow-auto whitespace-pre-wrap rounded bg-muted p-2 text-xs">
                  {aiContributionDraft.draft_text}
                </pre>
              ) : (
                <p className="text-xs text-muted-foreground">No draft generated yet.</p>
              )}
            </div>

            <div className="rounded border border-border p-3">
              <div className="mb-2 flex items-center justify-between gap-2">
                <p className="text-sm font-medium">Affiliation + COI normaliser</p>
                <Button
                  type="button"
                  size="sm"
                  variant="secondary"
                  onClick={onGenerateAiAffiliationsDraft}
                  disabled={aiLoading !== null}
                >
                  {aiLoading === 'affiliations' ? 'Generating...' : 'Generate draft'}
                </Button>
              </div>
              {aiAffiliationDraft ? (
                <div className="space-y-2 text-xs">
                  <pre className="max-h-40 overflow-auto whitespace-pre-wrap rounded bg-muted p-2">
                    {aiAffiliationDraft.affiliations_block}
                  </pre>
                  <p>{aiAffiliationDraft.coi_boilerplate}</p>
                </div>
              ) : (
                <p className="text-xs text-muted-foreground">No draft generated yet.</p>
              )}
            </div>
          </div>
          {aiError ? <p className="text-xs text-destructive">{aiError}</p> : null}
        </CardContent>
      </Card>
      </Section>

      <DrilldownSheet open={collaboratorDrilldownOpen} onOpenChange={setCollaboratorDrilldownOpen}>
        {selectedCollaborator ? (
          <>
            <DrilldownSheet.Header
              title={selectedCollaborator.full_name || 'Collaborator details'}
              subtitle={selectedCollaborator.primary_institution
                ? `${selectedCollaborator.primary_institution}${selectedCollaborator.country ? `, ${selectedCollaborator.country}` : ''}`
                : 'Review and update collaborator details.'}
              variant="profile"
            />
            <DrilldownSheet.Content className="house-drilldown-stack-3">
              <div className="house-drilldown-heading-block">
                <p className="house-drilldown-heading-block-title">Collaborator details</p>
              </div>
              <div className="house-drilldown-content-block">
                <div className="space-y-3 rounded border border-border bg-card p-3">
                  <div className="grid gap-2 sm:grid-cols-2">
                    <Input
                      value={form.full_name}
                      onChange={(event) => setForm((current) => ({ ...current, full_name: event.target.value }))}
                      placeholder="Full name"
                    />
                    <Input
                      value={form.preferred_name}
                      onChange={(event) => setForm((current) => ({ ...current, preferred_name: event.target.value }))}
                      placeholder="Preferred name"
                    />
                  </div>
                  <div className="grid gap-2 sm:grid-cols-2">
                    <Input
                      value={form.email}
                      onChange={(event) => setForm((current) => ({ ...current, email: event.target.value }))}
                      placeholder="Email"
                    />
                    <Input
                      value={form.orcid_id}
                      onChange={(event) => setForm((current) => ({ ...current, orcid_id: event.target.value }))}
                      placeholder="ORCID (0000-0000-0000-0000)"
                    />
                  </div>
                  <div className="grid gap-2 sm:grid-cols-2">
                    <Input
                      value={form.openalex_author_id}
                      onChange={(event) => setForm((current) => ({ ...current, openalex_author_id: event.target.value }))}
                      placeholder="OpenAlex author id"
                    />
                    <Input
                      value={form.primary_institution}
                      onChange={(event) => setForm((current) => ({ ...current, primary_institution: event.target.value }))}
                      placeholder="Primary institution"
                    />
                  </div>
                  <div className="grid gap-2 sm:grid-cols-2">
                    <Input
                      value={form.department}
                      onChange={(event) => setForm((current) => ({ ...current, department: event.target.value }))}
                      placeholder="Department"
                    />
                    <Input
                      value={form.current_position}
                      onChange={(event) => setForm((current) => ({ ...current, current_position: event.target.value }))}
                      placeholder="Current position"
                    />
                  </div>
                  <div className="grid gap-2 sm:grid-cols-2">
                    <Input
                      value={form.country}
                      onChange={(event) => setForm((current) => ({ ...current, country: event.target.value }))}
                      placeholder="Country"
                    />
                    <Input
                      value={form.research_domains}
                      onChange={(event) => setForm((current) => ({ ...current, research_domains: event.target.value }))}
                      placeholder="Domains (comma-separated)"
                    />
                  </div>
                  <Textarea
                    value={form.notes}
                    onChange={(event) => setForm((current) => ({ ...current, notes: event.target.value }))}
                    placeholder="Notes"
                    className="min-h-24 px-3 py-2 text-sm"
                  />
                  {duplicateWarnings.length > 0 ? (
                    <div className="rounded border border-amber-200 bg-amber-50 p-2 text-xs text-amber-800">
                      {duplicateWarnings.map((warning) => (
                        <p key={warning}>{warning}</p>
                      ))}
                    </div>
                  ) : null}
                  <div className="flex flex-wrap items-center gap-2">
                    <Button type="button" size="sm" onClick={onSave} disabled={saving}>
                      Save changes
                    </Button>
                    {selectedId ? (
                      <Button type="button" size="sm" variant="secondary" onClick={onDelete} disabled={saving}>
                        Delete
                      </Button>
                    ) : null}
                    {selectedId ? (
                      <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        onClick={() => {
                          if (selectedCollaborator) {
                            setForm(toFormState(selectedCollaborator))
                          }
                        }}
                      >
                        Reset
                      </Button>
                    ) : null}
                  </div>
                  {status ? <p className="text-xs text-emerald-700">{status}</p> : null}
                  {error ? <p className="text-xs text-destructive">{error}</p> : null}
                  {importResult ? (
                    <p className="text-xs text-muted-foreground">
                      OpenAlex author: {importResult.openalex_author_id || 'n/a'} | Imported:{' '}
                      {importResult.imported_candidates}
                    </p>
                  ) : null}
                  {enrichmentResult ? (
                    <p className="text-xs text-muted-foreground">
                      Enriched: {enrichmentResult.updated_count} updated | Resolved authors:{' '}
                      {enrichmentResult.resolved_author_count} | Missing IDs:{' '}
                      {enrichmentResult.skipped_without_identifier}
                    </p>
                  ) : null}
                </div>
              </div>
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
