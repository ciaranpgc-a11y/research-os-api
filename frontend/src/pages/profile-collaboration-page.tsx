import { useEffect, useMemo, useState } from 'react'
import { Download, Lightbulb, Plus, RefreshCcw, Sparkles, Upload } from 'lucide-react'
import { useNavigate, useSearchParams } from 'react-router-dom'

import {
  PageHeader,
  Row,
  Stack,
  CardPrimitive as Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  TablePrimitive as Table,
  TableBody,
  TableCell,
  TableHead as TableHeader,
  TableHeaderCell as TableHead,
  TableRow,
  TextareaPrimitive as Textarea,
} from '@/components/primitives'
import { SectionMarker } from '@/components/patterns'
import { getSectionMarkerTone } from '@/lib/section-tone'
import { houseLayout } from '@/lib/house-style'
import { cn } from '@/lib/utils'
import { UKCollaborationMap } from '@/components/collaboration/UKCollaborationMap'
import { Badge, Button, Input, SelectPrimitive, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui'
import { getAuthSessionToken } from '@/lib/auth-session'
import {
  createCollaborator,
  deleteCollaborator,
  enrichCollaboratorsFromOpenAlex,
  exportCollaboratorsCsv,
  fetchCollaborationMetricsSummary,
  generateCollaborationAiAffiliationsNormaliser,
  generateCollaborationAiAuthorSuggestions,
  generateCollaborationAiContributionStatement,
  generateCollaborationAiInsights,
  getCollaborator,
  importCollaboratorsFromOpenAlex,
  listCollaborators,
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
const COLLABORATORS_PAGE_SIZE = 50
const COLLABORATORS_FETCH_PAGE_SIZE = 200
const MAX_COLLABORATOR_FETCH_PAGES = 250
const HEATMAP_TOP_CELL_LIMIT = 24
const HEATMAP_OTHERS_KEY = '__others__'

function formatDateTime(value: string | null | undefined): string {
  if (!value) {
    return 'Not computed yet'
  }
  const parsed = Date.parse(value)
  if (Number.isNaN(parsed)) {
    return 'Not computed yet'
  }
  return new Date(parsed).toLocaleString('en-GB', {
    year: 'numeric',
    month: 'short',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  })
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

function classificationTone(value: string): 'default' | 'secondary' | 'outline' {
  if (value === 'CORE') {
    return 'default'
  }
  if (value === 'ACTIVE') {
    return 'secondary'
  }
  return 'outline'
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

function normalizeSortValue(value: string | null | undefined): string {
  const clean = String(value || '').trim()
  if (clean === 'works' || clean === 'last_collaboration_year' || clean === 'strength') {
    return clean
  }
  return 'name'
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

async function fetchAllCollaborators(
  token: string,
  options: {
    query: string
    sort: string
  },
): Promise<CollaboratorsListPayload> {
  const firstPage = await listCollaborators(token, {
    query: options.query,
    sort: options.sort,
    page: 1,
    pageSize: COLLABORATORS_FETCH_PAGE_SIZE,
  })
  const items = [...firstPage.items]
  let currentPage = 1
  let hasMore = firstPage.has_more

  while (hasMore && currentPage < MAX_COLLABORATOR_FETCH_PAGES) {
    currentPage += 1
    const nextPage = await listCollaborators(token, {
      query: options.query,
      sort: options.sort,
      page: currentPage,
      pageSize: COLLABORATORS_FETCH_PAGE_SIZE,
    })
    items.push(...nextPage.items)
    hasMore = nextPage.has_more
  }

  return {
    items,
    total: Number(firstPage.total || items.length),
    page: 1,
    page_size: COLLABORATORS_FETCH_PAGE_SIZE,
    has_more: false,
  }
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
  return {
    coauthored_works_count: Number(metrics.coauthored_works_count || 0),
    shared_citations_total: Math.max(0, Math.round(Number(metrics.coauthored_works_count || 0) * 14)),
    first_collaboration_year: metrics.last_collaboration_year ? Math.max(2008, metrics.last_collaboration_year - 2) : null,
    last_collaboration_year: metrics.last_collaboration_year,
    citations_last_12m: Math.max(0, Math.round(Number(metrics.coauthored_works_count || 0) * 1.6)),
    collaboration_strength_score: score,
    classification,
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
  const [summary, setSummary] = useState<CollaborationMetricsSummaryPayload | null>(null)
  const [listing, setListing] = useState<CollaboratorsListPayload | null>(null)
  const [query, setQuery] = useState(() => String(searchParams.get('query') || '').trim())
  const [sort, setSort] = useState(() => normalizeSortValue(searchParams.get('sort')))
  const [page, setPage] = useState(() => parsePositiveInteger(searchParams.get('page'), 1))
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [isCreating, setIsCreating] = useState(false)
  const [form, setForm] = useState<CollaboratorFormState>(EMPTY_FORM)
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [status, setStatus] = useState('')
  const [error, setError] = useState('')
  const [duplicateWarnings, setDuplicateWarnings] = useState<string[]>([])
  const [importResult, setImportResult] = useState<CollaborationImportOpenAlexPayload | null>(null)
  const [enrichmentResult, setEnrichmentResult] = useState<CollaborationEnrichOpenAlexPayload | null>(null)
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

  const selectedCollaborator = useMemo(() => {
    const items = listing?.items || []
    return items.find((item) => item.id === selectedId) || null
  }, [listing?.items, selectedId])

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

  const strongCollaborations = useMemo(() => {
    const items = [...(listing?.items || [])]
    return items
      .sort((left, right) => {
        const leftScore = Number(left.metrics.collaboration_strength_score || 0)
        const rightScore = Number(right.metrics.collaboration_strength_score || 0)
        if (leftScore === rightScore) {
          return left.full_name.localeCompare(right.full_name)
        }
        return rightScore - leftScore
      })
      .slice(0, 10)
  }, [listing?.items])

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
    for (const item of listing?.items || []) {
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
        const key = normalizeHeatmapBucket(item.primary_institution, 'Unknown')
        const existing = buckets.get(key) || { label: key, value: 0, collaborator_ids: new Set<string>() }
        existing.value += weight
        existing.collaborator_ids.add(item.id)
        buckets.set(key, existing)
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
  }, [heatmapMetric, heatmapMode, listing?.items, nowYear])

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
    const items = listing?.items || []
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
        return matchesSingle(item.primary_institution, 'Unknown')
      }
      const domains = item.research_domains.length > 0 ? item.research_domains : ['General']
      if (selectedBucketLabels) {
        return domains.some((domain) => selectedBucketLabels.has(normalizeHeatmapBucket(domain, 'General')))
      }
      return domains.some((domain) => normalizeHeatmapBucket(domain, 'General') === heatmapSelection.label)
    })
  }, [heatmapCells, heatmapMode, heatmapSelection, listing?.items])

  const totalPages = useMemo(
    () => Math.max(1, Math.ceil(filteredCollaborators.length / COLLABORATORS_PAGE_SIZE)),
    [filteredCollaborators.length],
  )

  const pagedCollaborators = useMemo(() => {
    const start = (page - 1) * COLLABORATORS_PAGE_SIZE
    return filteredCollaborators.slice(start, start + COLLABORATORS_PAGE_SIZE)
  }, [filteredCollaborators, page])

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

  const load = async (token: string) => {
    setLoading(true)
    setError('')
    try {
      const [summaryPayload, listPayload] = await Promise.all([
        fetchCollaborationMetricsSummary(token),
        fetchAllCollaborators(token, {
          query,
          sort,
        }),
      ])
      setSummary(summaryPayload)
      setListing(listPayload)
      if (!isCreating) {
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
      }
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Could not load collaboration page.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    const token = getAuthSessionToken()
    if (!token) {
      navigate('/auth', { replace: true })
      return
    }
    void load(token)
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
    if (!selectedId || isCreating) {
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
  }, [selectedId, isCreating])

  const onSearch = async () => {
    const token = getAuthSessionToken()
    if (!token) {
      navigate('/auth', { replace: true })
      return
    }
    setPage(1)
    setHeatmapSelection(null)
    await load(token)
  }

  const onSortChange = (value: string) => {
    setPage(1)
    setSort(value)
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

  const onAddCollaborator = () => {
    setIsCreating(true)
    setSelectedId(null)
    setForm(EMPTY_FORM)
    setDuplicateWarnings([])
    setStatus('')
    setError('')
  }

  const onSelectCollaborator = (collaborator: CollaboratorPayload) => {
    setIsCreating(false)
    setSelectedId(collaborator.id)
    setForm(toFormState(collaborator))
    setDuplicateWarnings(collaborator.duplicate_warnings || [])
    setStatus('')
    setError('')
  }

  const onSave = async () => {
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
      const saved = isCreating
        ? await createCollaborator(token, payload)
        : await updateCollaborator(token, selectedId || '', payload)
      setIsCreating(false)
      setSelectedId(saved.id)
      setForm(toFormState(saved))
      setDuplicateWarnings(saved.duplicate_warnings || [])
      setStatus(isCreating ? 'Collaborator created.' : 'Collaborator updated.')
      await load(token)
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : 'Could not save collaborator.')
    } finally {
      setSaving(false)
    }
  }

  const onDelete = async () => {
    if (!selectedId || isCreating) {
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
      setForm(EMPTY_FORM)
      setDuplicateWarnings([])
      await load(token)
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : 'Could not delete collaborator.')
    } finally {
      setSaving(false)
    }
  }

  const onImport = async () => {
    const token = getAuthSessionToken()
    if (!token) {
      navigate('/auth', { replace: true })
      return
    }
    setSaving(true)
    setError('')
    setStatus('')
    try {
      const payload = await importCollaboratorsFromOpenAlex(token)
      setImportResult(payload)
      setStatus(
        `Import complete: ${payload.created_count} created, ${payload.updated_count} updated, ${payload.skipped_count} skipped.`,
      )
      await load(token)
    } catch (importError) {
      setError(importError instanceof Error ? importError.message : 'Could not import collaborators.')
    } finally {
      setSaving(false)
    }
  }

  const onEnrichCoverage = async () => {
    const token = getAuthSessionToken()
    if (!token) {
      navigate('/auth', { replace: true })
      return
    }
    setSaving(true)
    setError('')
    setStatus('')
    try {
      const payload = await enrichCollaboratorsFromOpenAlex(token, {
        onlyMissing: true,
        limit: 200,
      })
      setEnrichmentResult(payload)
      setStatus(
        `Coverage enrichment complete: ${payload.updated_count} updated, ${payload.unchanged_count} unchanged, ${payload.failed_count} failed.`,
      )
      await load(token)
    } catch (enrichError) {
      setError(enrichError instanceof Error ? enrichError.message : 'Could not enrich collaborator coverage.')
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

      <div className={cn(HOUSE_SECTION_ANCHOR_CLASS, 'house-main-content-block')}>
        <Card>
        <CardContent className="grid gap-3 p-4 sm:grid-cols-2 lg:grid-cols-4">
          <div className="rounded border border-border px-3 py-2">
            <p className="text-xs text-muted-foreground">Total collaborators</p>
            <p className="text-xl font-semibold">{summary?.total_collaborators ?? 0}</p>
          </div>
          <div className="rounded border border-border px-3 py-2">
            <p className="text-xs text-muted-foreground">Core collaborators</p>
            <p className="text-xl font-semibold">{summary?.core_collaborators ?? 0}</p>
          </div>
          <div className="rounded border border-border px-3 py-2">
            <p className="text-xs text-muted-foreground">Active collaborations (12m)</p>
            <p className="text-xl font-semibold">{summary?.active_collaborations_12m ?? 0}</p>
          </div>
          <div className="rounded border border-border px-3 py-2">
            <p className="text-xs text-muted-foreground">New collaborators (12m)</p>
            <p className="text-xl font-semibold">{summary?.new_collaborators_12m ?? 0}</p>
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
        <Card className="min-h-sz-580">
          <CardHeader className="space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <CardTitle>Collaborators</CardTitle>
              <div className="flex flex-wrap items-center gap-2">
                <Button type="button" size="sm" variant="secondary" onClick={onAddCollaborator}>
                  <Plus className="mr-1 h-3.5 w-3.5" />
                  Add collaborator
                </Button>
                <Button type="button" size="sm" variant="secondary" onClick={onImport} disabled={saving}>
                  <Upload className="mr-1 h-3.5 w-3.5" />
                  Import from publications
                </Button>
                <Button type="button" size="sm" variant="secondary" onClick={onEnrichCoverage} disabled={saving}>
                  <RefreshCcw className="mr-1 h-3.5 w-3.5" />
                  Enrich missing fields
                </Button>
                <Button type="button" size="sm" variant="secondary" onClick={onExport}>
                  <Download className="mr-1 h-3.5 w-3.5" />
                  Export
                </Button>
              </div>
            </div>
            <CardDescription className="flex flex-wrap items-center gap-2">
              <span>Analytics computed: {formatDateTime(summary?.last_computed_at)}</span>
              {summary?.status === 'RUNNING' ? (
                <span className="text-xs text-muted-foreground">Updating...</span>
              ) : null}
              {summary?.status === 'FAILED' ? (
                <span className="text-xs text-amber-700">Last update failed</span>
              ) : null}
            </CardDescription>
            <div className="flex flex-wrap items-center gap-2">
              <Input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search name, email, ORCID, institution..."
                className="max-w-md"
              />
              <SelectPrimitive value={sort} onValueChange={onSortChange}>
                <SelectTrigger className="h-9 w-auto min-w-sz-200 px-3 text-sm">
                  <SelectValue placeholder="Sort" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="name">Sort: Name</SelectItem>
                  <SelectItem value="works">Sort: Coauthored works</SelectItem>
                  <SelectItem value="last_collaboration_year">Sort: Last collaboration</SelectItem>
                  <SelectItem value="strength">Sort: Strength score</SelectItem>
                </SelectContent>
              </SelectPrimitive>
              <Button type="button" size="sm" variant="secondary" onClick={onSearch}>
                <RefreshCcw className="mr-1 h-3.5 w-3.5" />
                Search
              </Button>
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="hidden md:block">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Name</TableHead>
                    <TableHead>Institution</TableHead>
                    <TableHead>Domains</TableHead>
                    <TableHead>Classification</TableHead>
                    <TableHead>Last year</TableHead>
                    <TableHead>Coauthored works</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {pagedCollaborators.map((item) => (
                    <TableRow
                      key={item.id}
                      className={selectedId === item.id && !isCreating ? 'bg-accent/60' : ''}
                      onClick={() => onSelectCollaborator(item)}
                    >
                      <TableCell className="font-medium">{item.full_name}</TableCell>
                      <TableCell>{item.primary_institution || '-'}</TableCell>
                      <TableCell>
                        <div className="flex flex-wrap gap-1">
                          {(item.research_domains || []).slice(0, 3).map((domain) => (
                            <Badge key={domain} variant="outline">
                              {domain}
                            </Badge>
                          ))}
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge variant={classificationTone(item.metrics.classification)}>
                          {item.metrics.classification}
                        </Badge>
                      </TableCell>
                      <TableCell>{item.metrics.last_collaboration_year ?? '-'}</TableCell>
                      <TableCell>{item.metrics.coauthored_works_count}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>

            <div className="space-y-2 md:hidden">
              {pagedCollaborators.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  className={`w-full rounded border border-border p-3 text-left ${selectedId === item.id && !isCreating ? 'bg-accent/50' : ''}`}
                  onClick={() => onSelectCollaborator(item)}
                >
                  <div className="flex items-center justify-between gap-2">
                    <p className="font-medium">{item.full_name}</p>
                    <Badge variant={classificationTone(item.metrics.classification)}>
                      {item.metrics.classification}
                    </Badge>
                  </div>
                  <p className="text-xs text-muted-foreground">{item.primary_institution || 'No institution'}</p>
                  <p className="text-xs text-muted-foreground">
                    Works: {item.metrics.coauthored_works_count} | Last year:{' '}
                    {item.metrics.last_collaboration_year ?? '-'}
                  </p>
                </button>
              ))}
            </div>

            <div className="flex items-center justify-between">
              <p className="text-xs text-muted-foreground">
                {filteredCollaborators.length} shown
                {heatmapSelection ? ` (filtered from ${listing?.total || 0})` : ''}
              </p>
              <div className="flex items-center gap-2">
                <Button
                  type="button"
                  size="sm"
                  variant="secondary"
                  disabled={page <= 1}
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
                  disabled={page >= totalPages}
                  onClick={() => setPage((current) => current + 1)}
                >
                  Next
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>
              {isCreating ? 'Add collaborator' : selectedCollaborator ? 'Collaborator details' : 'Select collaborator'}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
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
                {isCreating ? 'Create collaborator' : 'Save changes'}
              </Button>
              {!isCreating && selectedId ? (
                <Button type="button" size="sm" variant="secondary" onClick={onDelete} disabled={saving}>
                  Delete
                </Button>
              ) : null}
              {!isCreating && selectedId ? (
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  onClick={() => {
                    setIsCreating(false)
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
          </CardContent>
        </Card>
      </div>

      <div className="space-y-4">
        <Card>
          <CardHeader>
            <CardTitle>Strong collaborations</CardTitle>
            <CardDescription>Top 10 collaborators ranked by collaboration strength score.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            {strongCollaborations.length > 0 ? (
              strongCollaborations.map((item) => (
                <div
                  key={item.id}
                  className="flex items-start justify-between gap-2 rounded border border-border p-2 text-sm"
                >
                  <div>
                    <p className="font-medium">{item.full_name}</p>
                    <p className="text-xs text-muted-foreground">
                      {(item.primary_institution || 'No institution')} | Last:{' '}
                      {item.metrics.last_collaboration_year ?? '-'}
                    </p>
                  </div>
                  <div className="text-right text-xs">
                    <p className="font-medium">{item.metrics.collaboration_strength_score.toFixed(2)}</p>
                    <p className="text-muted-foreground">{item.metrics.coauthored_works_count} works</p>
                  </div>
                </div>
              ))
            ) : (
              <p className="text-xs text-muted-foreground">No collaborators yet.</p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Collaboration heat map</CardTitle>
            <CardDescription>
              Aggregated across all matching collaborators. Grid shows top 24 buckets plus Others. Click map markers or grid cells to filter the collaborator list.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
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
                collaborators={(listing?.items || []).map((item) => ({
                  country: item.country || '',
                  primary_institution: item.primary_institution || '',
                  collaboration_strength_score: heatmapMetricValue(item, heatmapMetric, nowYear),
                }))}
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
          </CardContent>
        </Card>
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
      </div>

      {loading ? <p className="text-xs text-muted-foreground">Loading collaboration data...</p> : null}
    </Stack>
  )
}
