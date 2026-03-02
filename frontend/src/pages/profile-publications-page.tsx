import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { ChevronDown, ChevronUp, ChevronsUpDown, Download, Eye, EyeOff, FileText, Filter, GripVertical, Hammer, Loader2, Paperclip, Search, Settings, Share2 } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import * as XLSX from 'xlsx'

import { PublicationsTopStrip } from '@/components/publications/PublicationsTopStrip'
import { HouseDrilldownHeaderShell, drilldownTabFlexGrow } from '@/components/publications/HouseDrilldownHeaderShell'
import { publicationsHouseDrilldown, publicationsHouseHeadings, publicationsHouseMotion } from '@/components/publications/publications-house-style'
import { ButtonPrimitive as Button } from '@/components/primitives/ButtonPrimitive'
import { Sheet, SheetContent } from '@/components/ui/sheet'
import { TablePrimitive as Table, TableBody, TableCell, TableHead as TableHeader, TableHeaderCell as TableHead, TableRow } from '@/components/primitives/TablePrimitive'
import { Tabs, TabsContent } from '@/components/ui/tabs'
import { houseLayout, houseSurfaces, houseTables, houseTypography } from '@/lib/house-style'
import {
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
  triggerPublicationsTopMetricsRefresh,
  linkPublicationOpenAccessPdf,
  listPersonaSyncJobs,
  uploadPublicationFile,
} from '@/lib/impact-api'
import { cn } from '@/lib/utils'
import { readCachedPersonaState, writeCachedPersonaState } from '@/lib/persona-cache'
import { clearAuthSessionToken, getAuthSessionToken } from '@/lib/auth-session'
import type {
  AuthUser,
  PublicationAiInsightsResponsePayload,
  PublicationAuthorsPayload,
  PublicationDetailPayload,
  PublicationFilePayload,
  PublicationFilesListPayload,
  PublicationImpactResponsePayload,
  PersonaWork,
  PersonaStatePayload,
  PersonaSyncJobPayload,
  PublicationsAnalyticsResponsePayload,
  PublicationsAnalyticsSummaryPayload,
  PublicationsAnalyticsTopDriversPayload,
  PublicationsTopMetricsPayload,
} from '@/types/impact'

type PublicationSortField = 'citations' | 'year' | 'title' | 'venue' | 'work_type'
type SortDirection = 'asc' | 'desc'
type PublicationDetailTab = 'overview' | 'content' | 'impact' | 'files' | 'ai'
type PublicationTableColumnKey = 'title' | 'year' | 'venue' | 'work_type' | 'article_type' | 'citations'
type PublicationTableColumnAlign = 'left' | 'center' | 'right'
type PublicationTablePageSize = 25 | 50 | 100 | 'all'
type PublicationTableDensity = 'compact' | 'default' | 'comfortable'
type PublicationExportFormat = 'xlsx' | 'csv' | 'ris' | 'bibtex' | 'nbib' | 'endnote_xml'
type PublicationExportScope = 'whole_library' | 'filtered_results' | 'current_page' | 'selected_rows'
type PublicationExportFieldKey =
  | 'title'
  | 'authors'
  | 'year'
  | 'journal'
  | 'doi'
  | 'pmid'
  | 'publication_type'
  | 'article_type'
  | 'citations'
  | 'abstract'
  | 'keywords'
  | 'oa_status'
type PublicationTableColumnPreference = {
  visible: boolean
  align: PublicationTableColumnAlign
  width: number
}
type PublicationOaPdfStatus = 'available' | 'missing' | 'checking' | 'unknown'
type PublicationOaPdfStatusRecord = {
  status: PublicationOaPdfStatus
  downloadUrl: string | null
  fileName: string | null
  updatedAt: string
}

const PUBLICATION_DETAIL_TABS: Array<{ id: PublicationDetailTab; label: string }> = [
  { id: 'overview', label: 'Overview' },
  { id: 'content', label: 'Abstract' },
  { id: 'impact', label: 'Impact' },
  { id: 'files', label: 'Files' },
  { id: 'ai', label: 'AI insights' },
]
const PUBLICATION_OVERVIEW_AUTHORS_PREVIEW_LIMIT = 8

const PUBLICATION_TABLE_COLUMN_ORDER: PublicationTableColumnKey[] = ['title', 'year', 'venue', 'work_type', 'article_type', 'citations']
const PUBLICATION_TABLE_COLUMN_DEFINITIONS: Record<PublicationTableColumnKey, { label: string; sortField: PublicationSortField }> = {
  title: { label: 'Title', sortField: 'title' },
  year: { label: 'Year', sortField: 'year' },
  venue: { label: 'Journal', sortField: 'venue' },
  work_type: { label: 'Publication type', sortField: 'work_type' },
  article_type: { label: 'Article type', sortField: 'work_type' },
  citations: { label: 'Citations', sortField: 'citations' },
}
const PUBLICATION_TABLE_COLUMN_DEFAULTS: Record<PublicationTableColumnKey, PublicationTableColumnPreference> = {
  title: { visible: true, align: 'left', width: 360 },
  year: { visible: true, align: 'left', width: 92 },
  venue: { visible: true, align: 'left', width: 280 },
  work_type: { visible: true, align: 'left', width: 200 },
  article_type: { visible: true, align: 'left', width: 168 },
  citations: { visible: true, align: 'left', width: 136 },
}
const PUBLICATION_TABLE_COLUMN_WIDTH_LIMITS: Record<PublicationTableColumnKey, { min: number; max: number; growWeight: number }> = {
  title: { min: 320, max: 760, growWeight: 6.4 },
  year: { min: 96, max: 124, growWeight: 0.6 },
  venue: { min: 180, max: 340, growWeight: 2.1 },
  work_type: { min: 170, max: 260, growWeight: 1.6 },
  article_type: { min: 140, max: 220, growWeight: 1.2 },
  citations: { min: 124, max: 168, growWeight: 0.8 },
}
const PUBLICATION_TABLE_COLUMN_HARD_MIN = 56
const PUBLICATION_TABLE_COLUMN_WIDTH_MIN = 80
const PUBLICATION_TABLE_COLUMN_WIDTH_MAX = 640
const PUBLICATION_EXPORT_FORMAT_OPTIONS: Array<{ value: PublicationExportFormat; label: string; extension: string; mimeType: string }> = [
  {
    value: 'xlsx',
    label: 'Excel (.xlsx)',
    extension: 'xlsx',
    mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  },
  {
    value: 'csv',
    label: 'CSV (.csv)',
    extension: 'csv',
    mimeType: 'text/csv;charset=utf-8',
  },
  {
    value: 'ris',
    label: 'RIS (EndNote / Zotero / Mendeley)',
    extension: 'ris',
    mimeType: 'application/x-research-info-systems',
  },
  {
    value: 'bibtex',
    label: 'BibTeX (.bib)',
    extension: 'bib',
    mimeType: 'application/x-bibtex',
  },
  {
    value: 'nbib',
    label: 'PubMed NBIB (.nbib)',
    extension: 'nbib',
    mimeType: 'text/plain;charset=utf-8',
  },
  {
    value: 'endnote_xml',
    label: 'EndNote XML (.xml)',
    extension: 'xml',
    mimeType: 'application/xml;charset=utf-8',
  },
]
const PUBLICATION_EXPORT_SCOPE_OPTIONS: Array<{ value: PublicationExportScope; label: string }> = [
  { value: 'whole_library', label: 'Whole library' },
  { value: 'filtered_results', label: 'Current filtered results' },
  { value: 'current_page', label: 'Current page' },
  { value: 'selected_rows', label: 'Selected rows' },
]
const PUBLICATION_EXPORT_FIELD_OPTIONS: Array<{ key: PublicationExportFieldKey; label: string; defaultEnabled: boolean }> = [
  { key: 'title', label: 'Title', defaultEnabled: true },
  { key: 'authors', label: 'Authors', defaultEnabled: true },
  { key: 'year', label: 'Year', defaultEnabled: true },
  { key: 'journal', label: 'Journal', defaultEnabled: true },
  { key: 'doi', label: 'DOI', defaultEnabled: true },
  { key: 'pmid', label: 'PMID', defaultEnabled: true },
  { key: 'publication_type', label: 'Publication type', defaultEnabled: true },
  { key: 'article_type', label: 'Article type', defaultEnabled: true },
  { key: 'citations', label: 'Citations', defaultEnabled: true },
  { key: 'abstract', label: 'Abstract', defaultEnabled: false },
  { key: 'keywords', label: 'Keywords', defaultEnabled: false },
  { key: 'oa_status', label: 'Attachment status', defaultEnabled: false },
]

const INTEGRATIONS_USER_CACHE_KEY = 'aawe_integrations_user_cache'
const PUBLICATIONS_ANALYTICS_CACHE_KEY = 'aawe_publications_analytics_cache'
const PUBLICATIONS_TOP_METRICS_CACHE_KEY = 'aawe_publications_top_metrics_cache'
const PUBLICATIONS_ACTIVE_SYNC_JOB_STORAGE_PREFIX = 'aawe_publications_active_sync_job:'
const PUBLICATIONS_LIBRARY_COLUMNS_STORAGE_PREFIX = 'aawe_publications_library_columns:'
const PUBLICATIONS_LIBRARY_PAGE_SIZE_STORAGE_PREFIX = 'aawe_publications_library_page_size:'
const PUBLICATIONS_LIBRARY_COLUMN_ORDER_STORAGE_PREFIX = 'aawe_publications_library_column_order:'
const PUBLICATIONS_LIBRARY_VISUAL_SETTINGS_STORAGE_PREFIX = 'aawe_publications_library_visual_settings:'
const PUBLICATIONS_OA_AUTO_ATTEMPTED_STORAGE_PREFIX = 'aawe_publications_oa_auto_attempted:'
const PUBLICATIONS_OA_STATUS_STORAGE_PREFIX = 'aawe_publications_oa_status:'
const PUBLICATIONS_OA_AUTO_MAX_PER_PASS = 60
const PUBLICATIONS_OA_AUTO_INTER_REQUEST_DELAY_MS = 220
const PUBLICATIONS_OA_AUTO_STATUS_CLEAR_DELAY_MS = 9000
const PUBLICATION_DETAIL_ACTIVE_TAB_STORAGE_KEY = 'aawe.pubDetail.activeTab'
const HOUSE_SECTION_ANCHOR_CLASS = houseLayout.sectionAnchor
const HOUSE_PAGE_HEADER_CLASS = houseLayout.pageHeader
const HOUSE_LEFT_BORDER_CLASS = houseSurfaces.leftBorder
const HOUSE_LEFT_BORDER_PROFILE_CLASS = houseSurfaces.leftBorderProfile
const HOUSE_PAGE_TITLE_CLASS = houseTypography.title
const HOUSE_TABLE_SORT_TRIGGER_CLASS = houseTables.sortTrigger
const HOUSE_TABLE_HEAD_TEXT_CLASS = houseTypography.tableHead
const HOUSE_TABLE_CELL_TEXT_CLASS = houseTypography.tableCell
const HOUSE_BANNER_CLASS = houseSurfaces.banner
const HOUSE_BANNER_INFO_CLASS = houseSurfaces.bannerInfo
const HOUSE_BANNER_DANGER_CLASS = houseSurfaces.bannerDanger
const HOUSE_BANNER_PUBLICATIONS_CLASS = houseSurfaces.bannerPublications
const HOUSE_TABLE_SHELL_CLASS = houseSurfaces.tableShell
const HOUSE_PUBLICATION_TEXT_CLASS = publicationsHouseHeadings.text
const HOUSE_PUBLICATION_DRILLDOWN_STAT_CARD_CLASS = publicationsHouseDrilldown.statCard
const HOUSE_PUBLICATION_DRILLDOWN_ALERT_CLASS = publicationsHouseDrilldown.alert
const HOUSE_PUBLICATION_DRILLDOWN_STAT_TITLE_CLASS = publicationsHouseDrilldown.statTitle
const HOUSE_PUBLICATION_DRILLDOWN_CAPTION_CLASS = publicationsHouseDrilldown.caption
const HOUSE_PUBLICATION_DRILLDOWN_ACTION_CLASS = publicationsHouseDrilldown.action
const HOUSE_PUBLICATION_DRILLDOWN_NOTE_SOFT_CLASS = publicationsHouseDrilldown.noteSoft
const HOUSE_PUBLICATION_DRILLDOWN_NOTE_WARNING_CLASS = publicationsHouseDrilldown.noteWarning
const HOUSE_PUBLICATION_DRILLDOWN_DIVIDER_TOP_CLASS = publicationsHouseDrilldown.dividerTop
const HOUSE_PUBLICATION_DRILLDOWN_LINK_CLASS = publicationsHouseDrilldown.link
const HOUSE_PUBLICATION_DRILLDOWN_SUMMARY_STAT_TITLE_CLASS = publicationsHouseDrilldown.summaryStatTitle
const HOUSE_PUBLICATION_DRILLDOWN_SUMMARY_STAT_VALUE_CLASS = publicationsHouseDrilldown.summaryStatValue
const HOUSE_PUBLICATION_DRILLDOWN_SUMMARY_STAT_VALUE_WRAP_CLASS = publicationsHouseDrilldown.summaryStatValueWrap
const HOUSE_PUBLICATION_DRILLDOWN_FILE_DROP_CLASS = publicationsHouseDrilldown.fileDrop
const HOUSE_PUBLICATION_DRILLDOWN_FILE_DROP_ACTIVE_CLASS = publicationsHouseDrilldown.fileDropActive
const HOUSE_PUBLICATION_DRILLDOWN_TRANSITION_CLASS = publicationsHouseMotion.labelTransition
const HOUSE_PUBLICATION_DRILLDOWN_SHEET_CLASS = publicationsHouseDrilldown.sheet
const HOUSE_PUBLICATION_DRILLDOWN_SHEET_BODY_CLASS = publicationsHouseDrilldown.sheetBody
const HOUSE_PUBLICATION_DRILLDOWN_VALUE_POSITIVE_CLASS = publicationsHouseDrilldown.valuePositive
const HOUSE_PUBLICATION_DRILLDOWN_VALUE_NEGATIVE_CLASS = publicationsHouseDrilldown.valueNegative

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
const ARTICLE_TYPE_META_ANALYSIS_PATTERN =
  /\b(meta[-\s]?analysis|pooled analysis)\b/i
const ARTICLE_TYPE_SCOPING_PATTERN =
  /\b(scoping review|evidence map)\b/i
const ARTICLE_TYPE_SR_PATTERN =
  /\b(systematic review|umbrella review|rapid review)\b/i
const ARTICLE_TYPE_LITERATURE_PATTERN =
  /\b(literature review|narrative review|review article|review)\b/i
const ARTICLE_TYPE_EDITORIAL_PATTERN =
  /\b(editorial|commentary|perspective|viewpoint|opinion)\b/i
const ARTICLE_TYPE_CASE_PATTERN = /\b(case report|case series)\b/i
const ARTICLE_TYPE_PROTOCOL_PATTERN = /\b(protocol|study protocol)\b/i
const ARTICLE_TYPE_LETTER_PATTERN = /\b(letter|correspondence)\b/i

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

function normalizeCompactText(value: string | null | undefined): string {
  return String(value || '').replace(/\s+/g, ' ').trim()
}

function inferArticleTypeFromTitle(title: string | null | undefined): string {
  const clean = normalizeCompactText(title)
  if (!clean) {
    return 'Original'
  }
  if (ARTICLE_TYPE_META_ANALYSIS_PATTERN.test(clean)) {
    return 'Meta-analysis'
  }
  if (ARTICLE_TYPE_SCOPING_PATTERN.test(clean)) {
    return 'Scoping'
  }
  if (ARTICLE_TYPE_SR_PATTERN.test(clean)) {
    return 'Systematic review'
  }
  if (ARTICLE_TYPE_LITERATURE_PATTERN.test(clean)) {
    return 'Literature review'
  }
  if (ARTICLE_TYPE_EDITORIAL_PATTERN.test(clean)) {
    return 'Editorial'
  }
  if (ARTICLE_TYPE_CASE_PATTERN.test(clean)) {
    return 'Case report'
  }
  if (ARTICLE_TYPE_PROTOCOL_PATTERN.test(clean)) {
    return 'Protocol'
  }
  if (ARTICLE_TYPE_LETTER_PATTERN.test(clean)) {
    return 'Letter'
  }
  return 'Original'
}

function deriveArticleTypeLabel(work: {
  work_type?: string | null
  publication_type?: string | null
  title?: string | null
  venue_name?: string | null
}): string {
  const classification = String(work.publication_type || '').trim()
  if (classification) {
    const normalizedClassification = classification.toLowerCase()
    if (normalizedClassification === 'review') {
      return inferArticleTypeFromTitle(work.title)
    }
    if (normalizedClassification === 'review article') {
      return inferArticleTypeFromTitle(work.title)
    }
    if (normalizedClassification === 'sr') {
      return 'Systematic review'
    }
    if (normalizedClassification === 'literature') {
      return 'Literature review'
    }
    if (normalizedClassification === 'meta-analysis') {
      return 'Meta-analysis'
    }
    if (normalizedClassification === 'scoping review') {
      return 'Scoping'
    }
    if (normalizedClassification === 'systematic review') {
      return 'Systematic review'
    }
    if (
      normalizedClassification === 'literature review' ||
      normalizedClassification === 'narrative review'
    ) {
      return 'Literature review'
    }
    return classification
  }
  const publicationType = derivePublicationTypeLabel(work)
  if (
    publicationType === 'Journal article' ||
    publicationType.toLowerCase().startsWith('conference')
  ) {
    return inferArticleTypeFromTitle(work.title)
  }
  return 'n/a'
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

function publicationsLibraryColumnsStorageKey(userId: string): string {
  return `${PUBLICATIONS_LIBRARY_COLUMNS_STORAGE_PREFIX}${userId}`
}

function publicationsLibraryPageSizeStorageKey(userId: string): string {
  return `${PUBLICATIONS_LIBRARY_PAGE_SIZE_STORAGE_PREFIX}${userId}`
}

function publicationsLibraryColumnOrderStorageKey(userId: string): string {
  return `${PUBLICATIONS_LIBRARY_COLUMN_ORDER_STORAGE_PREFIX}${userId}`
}

function publicationsLibraryVisualSettingsStorageKey(userId: string): string {
  return `${PUBLICATIONS_LIBRARY_VISUAL_SETTINGS_STORAGE_PREFIX}${userId}`
}

function parsePublicationTablePageSize(value: unknown): PublicationTablePageSize {
  const parsed = String(value || '').trim().toLowerCase()
  if (parsed === '25') {
    return 25
  }
  if (parsed === '50') {
    return 50
  }
  if (parsed === '100') {
    return 100
  }
  if (parsed === 'all') {
    return 'all'
  }
  return 50
}

function loadPublicationTablePageSizePreference(userId: string): PublicationTablePageSize {
  if (typeof window === 'undefined') {
    return 50
  }
  const raw = window.localStorage.getItem(publicationsLibraryPageSizeStorageKey(userId))
  return parsePublicationTablePageSize(raw)
}

function savePublicationTablePageSizePreference(userId: string, pageSize: PublicationTablePageSize): void {
  if (typeof window === 'undefined') {
    return
  }
  window.localStorage.setItem(publicationsLibraryPageSizeStorageKey(userId), String(pageSize))
}

function loadPublicationTableColumnOrderPreference(userId: string): PublicationTableColumnKey[] {
  if (typeof window === 'undefined') {
    return [...PUBLICATION_TABLE_COLUMN_ORDER]
  }
  const raw = window.localStorage.getItem(publicationsLibraryColumnOrderStorageKey(userId))
  if (!raw) {
    return [...PUBLICATION_TABLE_COLUMN_ORDER]
  }
  try {
    const parsed = JSON.parse(raw)
    if (!Array.isArray(parsed)) {
      return [...PUBLICATION_TABLE_COLUMN_ORDER]
    }
    const seen = new Set<PublicationTableColumnKey>()
    const ordered = parsed
      .map((value) => String(value || '').trim())
      .filter((value): value is PublicationTableColumnKey => (
        PUBLICATION_TABLE_COLUMN_ORDER.includes(value as PublicationTableColumnKey)
      ))
      .filter((value) => {
        if (seen.has(value)) {
          return false
        }
        seen.add(value)
        return true
      })
    for (const key of PUBLICATION_TABLE_COLUMN_ORDER) {
      if (!seen.has(key)) {
        ordered.push(key)
      }
    }
    return ordered
  } catch {
    return [...PUBLICATION_TABLE_COLUMN_ORDER]
  }
}

function savePublicationTableColumnOrderPreference(userId: string, order: PublicationTableColumnKey[]): void {
  if (typeof window === 'undefined') {
    return
  }
  const payload = order.filter((key, index) => order.indexOf(key) === index)
  window.localStorage.setItem(publicationsLibraryColumnOrderStorageKey(userId), JSON.stringify(payload))
}

function parsePublicationTableDensity(value: unknown): PublicationTableDensity {
  const parsed = String(value || '').trim().toLowerCase()
  if (parsed === 'compact' || parsed === 'comfortable' || parsed === 'default') {
    return parsed
  }
  return 'default'
}

function loadPublicationTableVisualSettingsPreference(userId: string): {
  density: PublicationTableDensity
  alternateRowColoring: boolean
  metricHighlights: boolean
  attachmentStatusVisible: boolean
} {
  if (typeof window === 'undefined') {
    return {
      density: 'default',
      alternateRowColoring: true,
      metricHighlights: true,
      attachmentStatusVisible: true,
    }
  }
  const raw = window.localStorage.getItem(publicationsLibraryVisualSettingsStorageKey(userId))
  if (!raw) {
    return {
      density: 'default',
      alternateRowColoring: true,
      metricHighlights: true,
      attachmentStatusVisible: true,
    }
  }
  try {
    const parsed = JSON.parse(raw) as Record<string, unknown>
    return {
      density: parsePublicationTableDensity(parsed.density),
      alternateRowColoring: typeof parsed.alternateRowColoring === 'boolean' ? parsed.alternateRowColoring : true,
      metricHighlights: typeof parsed.metricHighlights === 'boolean' ? parsed.metricHighlights : true,
      attachmentStatusVisible: typeof parsed.attachmentStatusVisible === 'boolean' ? parsed.attachmentStatusVisible : true,
    }
  } catch {
    return {
      density: 'default',
      alternateRowColoring: true,
      metricHighlights: true,
      attachmentStatusVisible: true,
    }
  }
}

function savePublicationTableVisualSettingsPreference(input: {
  userId: string
  density: PublicationTableDensity
  alternateRowColoring: boolean
  metricHighlights: boolean
  attachmentStatusVisible: boolean
}): void {
  if (typeof window === 'undefined') {
    return
  }
  window.localStorage.setItem(
    publicationsLibraryVisualSettingsStorageKey(input.userId),
    JSON.stringify({
      density: input.density,
      alternateRowColoring: input.alternateRowColoring,
      metricHighlights: input.metricHighlights,
      attachmentStatusVisible: input.attachmentStatusVisible,
    }),
  )
}

function clampPublicationTableColumnWidth(value: number, fallback: number): number {
  if (!Number.isFinite(value)) {
    return fallback
  }
  return Math.max(
    PUBLICATION_TABLE_COLUMN_WIDTH_MIN,
    Math.min(PUBLICATION_TABLE_COLUMN_WIDTH_MAX, Math.round(value)),
  )
}

function clampPublicationTableDistributedResize(input: {
  column: PublicationTableColumnKey
  visibleColumns: PublicationTableColumnKey[]
  startWidths: Partial<Record<PublicationTableColumnKey, number>>
  deltaPx: number
}): Partial<Record<PublicationTableColumnKey, number>> {
  const min = PUBLICATION_TABLE_COLUMN_WIDTH_MIN
  const max = PUBLICATION_TABLE_COLUMN_WIDTH_MAX
  const primaryIndex = input.visibleColumns.indexOf(input.column)
  if (primaryIndex < 0 || input.visibleColumns.length <= 1) {
    return input.startWidths
  }

  const normalizedWidths: Partial<Record<PublicationTableColumnKey, number>> = {}
  for (const key of input.visibleColumns) {
    const fallback = PUBLICATION_TABLE_COLUMN_DEFAULTS[key].width
    normalizedWidths[key] = clampPublicationTableColumnWidth(
      Number(input.startWidths[key] ?? fallback),
      fallback,
    )
  }

  const primaryStart = Number(
    normalizedWidths[input.column] ?? PUBLICATION_TABLE_COLUMN_DEFAULTS[input.column].width,
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
    max - primaryStart,
    compensationOrder.reduce(
      (sum, key) => sum + Math.max(0, Number(normalizedWidths[key] ?? min) - min),
      0,
    ),
  )
  const maxPrimaryShrink = Math.min(
    primaryStart - min,
    compensationOrder.reduce(
      (sum, key) => sum + Math.max(0, max - Number(normalizedWidths[key] ?? min)),
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
      const current = Number(normalizedWidths[key] ?? min)
      const reducible = Math.max(0, current - min)
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
      const current = Number(normalizedWidths[key] ?? min)
      const growable = Math.max(0, max - current)
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
    const fallback = PUBLICATION_TABLE_COLUMN_DEFAULTS[key].width
    normalizedWidths[key] = clampPublicationTableColumnWidth(
      Number(normalizedWidths[key] ?? fallback),
      fallback,
    )
  }

  return normalizedWidths
}

function parsePublicationTableColumnAlign(value: unknown): PublicationTableColumnAlign {
  const clean = String(value || '').trim().toLowerCase()
  if (clean === 'center' || clean === 'right' || clean === 'left') {
    return clean
  }
  return 'left'
}

function createDefaultPublicationTableColumnPreferences(): Record<PublicationTableColumnKey, PublicationTableColumnPreference> {
  return {
    title: { ...PUBLICATION_TABLE_COLUMN_DEFAULTS.title },
    year: { ...PUBLICATION_TABLE_COLUMN_DEFAULTS.year },
    venue: { ...PUBLICATION_TABLE_COLUMN_DEFAULTS.venue },
    work_type: { ...PUBLICATION_TABLE_COLUMN_DEFAULTS.work_type },
    article_type: { ...PUBLICATION_TABLE_COLUMN_DEFAULTS.article_type },
    citations: { ...PUBLICATION_TABLE_COLUMN_DEFAULTS.citations },
  }
}

function loadPublicationTableColumnPreferences(userId: string): Record<PublicationTableColumnKey, PublicationTableColumnPreference> {
  const defaults = createDefaultPublicationTableColumnPreferences()
  if (typeof window === 'undefined') {
    return defaults
  }
  const raw = window.localStorage.getItem(publicationsLibraryColumnsStorageKey(userId))
  if (!raw) {
    return defaults
  }
  try {
    const parsed = JSON.parse(raw) as Record<string, unknown>
    for (const key of PUBLICATION_TABLE_COLUMN_ORDER) {
      const candidate = parsed?.[key]
      if (!candidate || typeof candidate !== 'object') {
        continue
      }
      const payload = candidate as Record<string, unknown>
      const parsedAlign = parsePublicationTableColumnAlign(payload.align)
      const parsedVisible = typeof payload.visible === 'boolean' ? payload.visible : PUBLICATION_TABLE_COLUMN_DEFAULTS[key].visible
      defaults[key] = {
        visible: parsedVisible,
        // Migrate prior centered defaults to left alignment for visual consistency.
        align: parsedAlign === 'center' ? 'left' : parsedAlign,
        width: clampPublicationTableColumnWidth(
          Number(payload.width || PUBLICATION_TABLE_COLUMN_DEFAULTS[key].width),
          PUBLICATION_TABLE_COLUMN_DEFAULTS[key].width,
        ),
      }
    }
    if (!PUBLICATION_TABLE_COLUMN_ORDER.some((column) => defaults[column].visible)) {
      defaults.title.visible = true
    }
  } catch {
    return defaults
  }
  return defaults
}

function savePublicationTableColumnPreferences(
  userId: string,
  preferences: Record<PublicationTableColumnKey, PublicationTableColumnPreference>,
): void {
  if (typeof window === 'undefined') {
    return
  }
  const payload = PUBLICATION_TABLE_COLUMN_ORDER.reduce<Record<string, PublicationTableColumnPreference>>(
    (accumulator, key) => {
      accumulator[key] = preferences[key]
      return accumulator
    },
    {},
  )
  window.localStorage.setItem(publicationsLibraryColumnsStorageKey(userId), JSON.stringify(payload))
}

function publicationTableColumnAlignClass(align: PublicationTableColumnAlign): string {
  if (align === 'center') {
    return 'text-center'
  }
  if (align === 'right') {
    return 'text-right'
  }
  return 'text-left'
}

function publicationTableColumnTextForWork(
  column: PublicationTableColumnKey,
  work: PersonaWork,
  metricsByWorkId: Map<string, { citations: number; provider: string }>,
): string {
  if (column === 'title') {
    return String(work.title || '').trim()
  }
  if (column === 'year') {
    return work.year === null || work.year === undefined ? 'n/a' : String(work.year)
  }
  if (column === 'venue') {
    return formatJournalName(work.venue_name)
  }
  if (column === 'work_type') {
    return derivePublicationTypeLabel(work)
  }
  if (column === 'article_type') {
    return deriveArticleTypeLabel(work)
  }
  return String(metricsByWorkId.get(work.id)?.citations ?? 0)
}

function publicationColumnPercentileLength(values: string[]): number {
  if (values.length === 0) {
    return 0
  }
  const lengths = values
    .map((value) => String(value || '').trim().length)
    .filter((value) => Number.isFinite(value))
    .sort((a, b) => a - b)
  if (lengths.length === 0) {
    return 0
  }
  const index = Math.max(0, Math.min(lengths.length - 1, Math.floor((lengths.length - 1) * 0.9)))
  return lengths[index]
}

function estimateWrappedLineCount(text: string, widthPx: number): number {
  const clean = String(text || '').replace(/\s+/g, ' ').trim()
  if (!clean) {
    return 1
  }
  const horizontalPaddingPx = 28
  const charWidthPx = 7.1
  const usableWidthPx = Math.max(36, widthPx - horizontalPaddingPx)
  const charsPerLine = Math.max(6, Math.floor(usableWidthPx / charWidthPx))
  const words = clean.split(' ')
  let lines = 1
  let currentLength = 0
  for (const word of words) {
    const tokenLength = Math.max(1, word.length)
    if (tokenLength > charsPerLine) {
      if (currentLength > 0) {
        lines += 1
      }
      lines += Math.ceil(tokenLength / charsPerLine) - 1
      currentLength = tokenLength % charsPerLine
      continue
    }
    const nextLength = currentLength === 0 ? tokenLength : currentLength + 1 + tokenLength
    if (nextLength > charsPerLine) {
      lines += 1
      currentLength = tokenLength
      continue
    }
    currentLength = nextLength
  }
  return Math.max(1, lines)
}

function publicationTableColumnsEqual(
  left: Record<PublicationTableColumnKey, PublicationTableColumnPreference>,
  right: Record<PublicationTableColumnKey, PublicationTableColumnPreference>,
): boolean {
  return PUBLICATION_TABLE_COLUMN_ORDER.every((column) => (
    left[column].visible === right[column].visible &&
    left[column].align === right[column].align &&
    left[column].width === right[column].width
  ))
}

function clampPublicationTableColumnsToAvailableWidth(input: {
  columns: Record<PublicationTableColumnKey, PublicationTableColumnPreference>
  columnOrder: PublicationTableColumnKey[]
  availableWidth: number
}): Record<PublicationTableColumnKey, PublicationTableColumnPreference> {
  const next: Record<PublicationTableColumnKey, PublicationTableColumnPreference> = {
    title: { ...input.columns.title },
    year: { ...input.columns.year },
    venue: { ...input.columns.venue },
    work_type: { ...input.columns.work_type },
    article_type: { ...input.columns.article_type },
    citations: { ...input.columns.citations },
  }
  const visibleColumns = input.columnOrder.filter((column) => next[column].visible)
  if (visibleColumns.length === 0) {
    return next
  }

  const containerBudget = Math.max(
    visibleColumns.length * PUBLICATION_TABLE_COLUMN_HARD_MIN,
    Math.round(Number(input.availableWidth) || 0),
  )
  const preferredWidths: Record<PublicationTableColumnKey, number> = {
    title: next.title.width,
    year: next.year.width,
    venue: next.venue.width,
    work_type: next.work_type.width,
    article_type: next.article_type.width,
    citations: next.citations.width,
  }
  for (const column of visibleColumns) {
    const limits = PUBLICATION_TABLE_COLUMN_WIDTH_LIMITS[column]
    const currentWidth = Number(next[column].width || PUBLICATION_TABLE_COLUMN_DEFAULTS[column].width)
    const clamped = Math.max(limits.min, Math.min(limits.max, Math.round(currentWidth)))
    preferredWidths[column] = clamped
  }

  let totalWidth = visibleColumns.reduce((sum, column) => sum + preferredWidths[column], 0)
  if (totalWidth > containerBudget) {
    let overflow = totalWidth - containerBudget
    const shrinkOrder = [...visibleColumns].sort((left, right) => {
      const rank = (column: PublicationTableColumnKey): number => {
        if (column === 'title') {
          return 100
        }
        if (column === 'venue') {
          return 60
        }
        if (column === 'work_type') {
          return 50
        }
        if (column === 'article_type') {
          return 40
        }
        if (column === 'year') {
          return 20
        }
        return 10
      }
      return rank(left) - rank(right)
    })

    for (const column of shrinkOrder) {
      if (overflow <= 0) {
        break
      }
      const preferredMin = PUBLICATION_TABLE_COLUMN_WIDTH_LIMITS[column].min
      const reducible = Math.max(0, preferredWidths[column] - preferredMin)
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
        const reducible = Math.max(0, preferredWidths[column] - PUBLICATION_TABLE_COLUMN_HARD_MIN)
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
    const remainingTarget = containerBudget - totalWidth
    const growOrder: PublicationTableColumnKey[] = ['title', 'venue', 'work_type', 'article_type', 'year', 'citations']
    const growColumns = growOrder.filter((column) => visibleColumns.includes(column))
    const totalGrowWeight = growColumns.reduce(
      (sum, column) => sum + (PUBLICATION_TABLE_COLUMN_WIDTH_LIMITS[column].growWeight || 1),
      0,
    )
    if (growColumns.length > 0 && totalGrowWeight > 0) {
      const allocatedByColumn: Partial<Record<PublicationTableColumnKey, number>> = {}
      let allocated = 0
      for (const column of growColumns) {
        const weight = PUBLICATION_TABLE_COLUMN_WIDTH_LIMITS[column].growWeight || 1
        const growth = Math.max(0, Math.floor(remainingTarget * (weight / totalGrowWeight)))
        allocatedByColumn[column] = growth
        allocated += growth
      }
      let remaining = Math.max(0, remainingTarget - allocated)
      const remainderOrder = [...growColumns].sort(
        (left, right) => (PUBLICATION_TABLE_COLUMN_WIDTH_LIMITS[right].growWeight || 1) - (PUBLICATION_TABLE_COLUMN_WIDTH_LIMITS[left].growWeight || 1),
      )
      let index = 0
      while (remaining > 0 && remainderOrder.length > 0) {
        const column = remainderOrder[index % remainderOrder.length]
        allocatedByColumn[column] = Number(allocatedByColumn[column] || 0) + 1
        remaining -= 1
        index += 1
      }
      for (const column of growColumns) {
        preferredWidths[column] += Number(allocatedByColumn[column] || 0)
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

function autoFitPublicationTableColumns(input: {
  works: PersonaWork[]
  metricsByWorkId: Map<string, { citations: number; provider: string }>
  current: Record<PublicationTableColumnKey, PublicationTableColumnPreference>
  availableWidth: number
}): Record<PublicationTableColumnKey, PublicationTableColumnPreference> {
  const next: Record<PublicationTableColumnKey, PublicationTableColumnPreference> = {
    title: { ...input.current.title },
    year: { ...input.current.year },
    venue: { ...input.current.venue },
    work_type: { ...input.current.work_type },
    article_type: { ...input.current.article_type },
    citations: { ...input.current.citations },
  }
  const columnLimits = PUBLICATION_TABLE_COLUMN_WIDTH_LIMITS
  const safeAvailableWidth = Math.max(760, Math.round(input.availableWidth))

  const sampleSize = Math.max(1, Math.min(220, input.works.length))
  const sample = input.works.slice(0, sampleSize)
  const valuesByColumn = PUBLICATION_TABLE_COLUMN_ORDER.reduce<Record<PublicationTableColumnKey, string[]>>(
    (accumulator, column) => {
      accumulator[column] = sample.map((work) => publicationTableColumnTextForWork(column, work, input.metricsByWorkId))
      return accumulator
    },
    {
      title: [],
      year: [],
      venue: [],
      work_type: [],
      article_type: [],
      citations: [],
    },
  )
  const initialWidths = PUBLICATION_TABLE_COLUMN_ORDER.reduce<Record<PublicationTableColumnKey, number>>(
    (accumulator, column) => {
      const headerLength = PUBLICATION_TABLE_COLUMN_DEFINITIONS[column].label.length
      const percentileLength = publicationColumnPercentileLength(valuesByColumn[column])
      const limit = columnLimits[column]
      const charWidthPx = column === 'title' ? 7.6 : 7.2
      const measuredWidth = Math.round(28 + Math.max(headerLength, percentileLength) * charWidthPx)
      accumulator[column] = Math.max(limit.min, Math.min(limit.max, measuredWidth))
      return accumulator
    },
    {
      title: next.title.width,
      year: next.year.width,
      venue: next.venue.width,
      work_type: next.work_type.width,
      article_type: next.article_type.width,
      citations: next.citations.width,
    },
  )
  const measured = { ...initialWidths }

  const visibleColumns = PUBLICATION_TABLE_COLUMN_ORDER.filter((column) => next[column].visible)
  if (visibleColumns.length === 0) {
    return next
  }
  let currentTotal = visibleColumns.reduce((sum, column) => sum + measured[column], 0)
  const targetTotal = Math.max(
    visibleColumns.reduce((sum, column) => sum + columnLimits[column].min, 0),
    safeAvailableWidth - 8,
  )

  if (currentTotal > targetTotal) {
    let remainingOverflow = currentTotal - targetTotal
    const shrinkableTotal = visibleColumns.reduce(
      (sum, column) => sum + Math.max(0, measured[column] - columnLimits[column].min),
      0,
    )
    if (shrinkableTotal > 0) {
      for (const column of visibleColumns) {
        const shrinkable = Math.max(0, measured[column] - columnLimits[column].min)
        if (shrinkable <= 0) {
          continue
        }
        const share = shrinkable / shrinkableTotal
        const deduction = Math.min(shrinkable, Math.round(remainingOverflow * share))
        measured[column] -= deduction
        remainingOverflow -= deduction
      }
    }
    currentTotal = visibleColumns.reduce((sum, column) => sum + measured[column], 0)
  }

  if (currentTotal < targetTotal) {
    let remainingExtra = targetTotal - currentTotal
    const growableColumns = [...visibleColumns]
    while (remainingExtra > 0 && growableColumns.length > 0) {
      const totalGrowWeight = growableColumns.reduce((sum, column) => sum + columnLimits[column].growWeight, 0)
      if (totalGrowWeight <= 0) {
        break
      }
      let consumedThisRound = 0
      for (const column of [...growableColumns]) {
        const limit = columnLimits[column]
        const availableGrow = Math.max(0, limit.max - measured[column])
        if (availableGrow <= 0) {
          const index = growableColumns.indexOf(column)
          if (index >= 0) {
            growableColumns.splice(index, 1)
          }
          continue
        }
        const share = limit.growWeight / totalGrowWeight
        const growth = Math.max(0, Math.min(availableGrow, Math.round(remainingExtra * share)))
        if (growth <= 0) {
          continue
        }
        measured[column] += growth
        remainingExtra -= growth
        consumedThisRound += growth
      }
      if (consumedThisRound <= 0) {
        break
      }
    }
  }

  // Minimize sampled row height by balancing widths across wrapping columns.
  const optimizeColumns = visibleColumns.filter((column) => (
    column === 'title' || column === 'venue' || column === 'work_type' || column === 'article_type'
  ))
  if (optimizeColumns.length >= 2) {
    const optimizeColumnSet = new Set<PublicationTableColumnKey>(optimizeColumns)
    const fixedWidth = visibleColumns.reduce(
      (sum, column) => optimizeColumnSet.has(column) ? sum : sum + measured[column],
      0,
    )
    const optimizeWidthBudget = Math.max(
      optimizeColumns.reduce((sum, column) => sum + columnLimits[column].min, 0),
      Math.min(
        optimizeColumns.reduce((sum, column) => sum + columnLimits[column].max, 0),
        targetTotal - fixedWidth,
      ),
    )
    if (optimizeWidthBudget > 0) {
      const widthStepByColumn: Record<PublicationTableColumnKey, number> = {
        title: 1,
        year: 1,
        venue: 12,
        work_type: 12,
        article_type: 10,
        citations: 1,
      }
      const nonTitleOptimizeColumns = optimizeColumns.filter((column) => column !== 'title')
      const optimizeWidthCandidates = nonTitleOptimizeColumns.map((column) => {
        const limit = columnLimits[column]
        const step = Math.max(1, widthStepByColumn[column] || 1)
        const values: number[] = []
        for (let width = limit.min; width <= limit.max; width += step) {
          values.push(width)
        }
        if (values.length === 0 || values[values.length - 1] !== limit.max) {
          values.push(limit.max)
        }
        return { column, values }
      })
      const remainingMinByIndex = new Array(optimizeWidthCandidates.length + 1).fill(0)
      const remainingMaxByIndex = new Array(optimizeWidthCandidates.length + 1).fill(0)
      for (let index = optimizeWidthCandidates.length - 1; index >= 0; index -= 1) {
        const column = optimizeWidthCandidates[index].column
        remainingMinByIndex[index] = remainingMinByIndex[index + 1] + columnLimits[column].min
        remainingMaxByIndex[index] = remainingMaxByIndex[index + 1] + columnLimits[column].max
      }
      let bestScore = Number.POSITIVE_INFINITY
      let bestTitleWidth = 0
      let bestWidths: Partial<Record<PublicationTableColumnKey, number>> | null = null
      const selectedWidths: Partial<Record<PublicationTableColumnKey, number>> = {}

      const scoreCandidate = () => {
        const candidateWidths: Partial<Record<PublicationTableColumnKey, number>> = { ...selectedWidths }
        const nonTitleTotal = nonTitleOptimizeColumns.reduce((sum, column) => sum + (candidateWidths[column] || 0), 0)
        if (optimizeColumns.includes('title')) {
          const titleWidth = optimizeWidthBudget - nonTitleTotal
          if (titleWidth < columnLimits.title.min || titleWidth > columnLimits.title.max) {
            return
          }
          candidateWidths.title = titleWidth
        } else if (nonTitleTotal !== optimizeWidthBudget) {
          return
        }

        let score = 0
        for (let index = 0; index < sample.length; index += 1) {
          let rowLines = 1
          for (const column of optimizeColumns) {
            const width = candidateWidths[column] || measured[column]
            const text = valuesByColumn[column][index] || ''
            rowLines = Math.max(rowLines, estimateWrappedLineCount(text, width))
          }
          score += rowLines
        }

        const titleWidth = candidateWidths.title || measured.title
        score += Math.max(0, Math.ceil((520 - titleWidth) / 16))

        const articleTypeWidth = candidateWidths.article_type || measured.article_type
        score += Math.max(0, Math.ceil((176 - articleTypeWidth) / 20))

        if (
          score < bestScore ||
          (score === bestScore && titleWidth > bestTitleWidth)
        ) {
          bestScore = score
          bestTitleWidth = titleWidth
          bestWidths = candidateWidths
        }
      }

      const searchWidths = (index: number, usedWidth: number) => {
        if (index >= optimizeWidthCandidates.length) {
          scoreCandidate()
          return
        }
        const entry = optimizeWidthCandidates[index]
        const remainingMin = remainingMinByIndex[index + 1]
        const remainingMax = remainingMaxByIndex[index + 1]
        for (const width of entry.values) {
          const nextUsed = usedWidth + width
          if (nextUsed + remainingMin > optimizeWidthBudget) {
            continue
          }
          if (nextUsed + remainingMax < optimizeWidthBudget) {
            continue
          }
          selectedWidths[entry.column] = width
          searchWidths(index + 1, nextUsed)
        }
      }

      if (optimizeWidthCandidates.length > 0) {
        searchWidths(0, 0)
      } else {
        scoreCandidate()
      }
      if (bestWidths) {
        for (const column of optimizeColumns) {
          const nextWidth = bestWidths[column]
          if (typeof nextWidth === 'number' && Number.isFinite(nextWidth)) {
            measured[column] = Math.round(nextWidth)
          }
        }
      }
    }
  }

  for (const column of PUBLICATION_TABLE_COLUMN_ORDER) {
    next[column] = {
      ...next[column],
      width: measured[column],
    }
  }
  return next
}

function publicationsOaAutoAttemptedStorageKey(userId: string): string {
  return `${PUBLICATIONS_OA_AUTO_ATTEMPTED_STORAGE_PREFIX}${userId}`
}

function publicationsOaStatusStorageKey(userId: string): string {
  return `${PUBLICATIONS_OA_STATUS_STORAGE_PREFIX}${userId}`
}

function loadPublicationsOaAutoAttempted(userId: string): Set<string> {
  if (typeof window === 'undefined') {
    return new Set<string>()
  }
  const raw = window.localStorage.getItem(publicationsOaAutoAttemptedStorageKey(userId))
  if (!raw) {
    return new Set<string>()
  }
  try {
    const parsed = JSON.parse(raw)
    if (!Array.isArray(parsed)) {
      return new Set<string>()
    }
    const values = parsed
      .map((item) => String(item || '').trim())
      .filter(Boolean)
    return new Set<string>(values)
  } catch {
    return new Set<string>()
  }
}

function savePublicationsOaAutoAttempted(userId: string, attempted: Set<string>): void {
  if (typeof window === 'undefined') {
    return
  }
  const values = Array.from(attempted).slice(-4000)
  window.localStorage.setItem(publicationsOaAutoAttemptedStorageKey(userId), JSON.stringify(values))
}

function loadPublicationsOaStatus(userId: string): Record<string, PublicationOaPdfStatusRecord> {
  if (typeof window === 'undefined') {
    return {}
  }
  const raw = window.localStorage.getItem(publicationsOaStatusStorageKey(userId))
  if (!raw) {
    return {}
  }
  try {
    const parsed = JSON.parse(raw) as Record<string, unknown>
    const next: Record<string, PublicationOaPdfStatusRecord> = {}
    for (const [workId, value] of Object.entries(parsed)) {
      if (!value || typeof value !== 'object') {
        continue
      }
      const payload = value as Record<string, unknown>
      const rawStatus = String(payload.status || '').trim().toLowerCase()
      const status: PublicationOaPdfStatus =
        rawStatus === 'available' || rawStatus === 'missing' || rawStatus === 'checking'
          ? rawStatus
          : 'unknown'
      next[workId] = {
        status,
        downloadUrl: String(payload.downloadUrl || '').trim() || null,
        fileName: String(payload.fileName || '').trim() || null,
        updatedAt: String(payload.updatedAt || '').trim() || new Date().toISOString(),
      }
    }
    return next
  } catch {
    return {}
  }
}

function savePublicationsOaStatus(
  userId: string,
  statusByWorkId: Record<string, PublicationOaPdfStatusRecord>,
): void {
  if (typeof window === 'undefined') {
    return
  }
  const entries = Object.entries(statusByWorkId).slice(-5000)
  const payload = entries.reduce<Record<string, PublicationOaPdfStatusRecord>>((accumulator, [workId, value]) => {
    accumulator[workId] = value
    return accumulator
  }, {})
  window.localStorage.setItem(publicationsOaStatusStorageKey(userId), JSON.stringify(payload))
}

function publicationOaStatusVisualStatus(
  work: { doi?: string | null },
  record: PublicationOaPdfStatusRecord | null | undefined,
): PublicationOaPdfStatus {
  if (record?.status) {
    return record.status
  }
  const hasDoi = Boolean((work.doi || '').trim())
  if (!hasDoi) {
    return 'missing'
  }
  return 'unknown'
}

function publicationOaStatusToneClass(status: PublicationOaPdfStatus): string {
  if (status === 'available') {
    return 'text-[hsl(var(--tone-positive-700))]'
  }
  if (status === 'missing') {
    return 'text-[hsl(var(--tone-danger-700))]'
  }
  return 'text-[hsl(var(--tone-neutral-400))]'
}

function publicationOaStatusLabel(status: PublicationOaPdfStatus, hasDoi: boolean): string {
  if (status === 'available') {
    return 'Open-access PDF available'
  }
  if (status === 'checking') {
    return 'Checking for open-access PDF'
  }
  if (status === 'missing' && !hasDoi) {
    return 'Open-access PDF unavailable (missing DOI)'
  }
  if (status === 'missing') {
    return 'Open-access PDF not found'
  }
  return 'Open-access PDF pending background check'
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

function formatAuthorSurnameInitials(value: string): string {
  const clean = String(value || '').replace(/\s+/g, ' ').trim()
  if (!clean) {
    return ''
  }
  const parts = clean.split(' ').filter(Boolean)
  if (parts.length === 1) {
    return parts[0]
  }
  const surname = parts[parts.length - 1]
  const initials = parts
    .slice(0, -1)
    .map((part) => part.charAt(0).toUpperCase())
    .filter(Boolean)
    .join('')
  return initials ? `${surname} ${initials}` : surname
}

function createDefaultPublicationExportFieldSelection(): Record<PublicationExportFieldKey, boolean> {
  return PUBLICATION_EXPORT_FIELD_OPTIONS.reduce<Record<PublicationExportFieldKey, boolean>>(
    (accumulator, option) => {
      accumulator[option.key] = option.defaultEnabled
      return accumulator
    },
    {
      title: true,
      authors: true,
      year: true,
      journal: true,
      doi: true,
      pmid: true,
      publication_type: true,
      article_type: true,
      citations: true,
      abstract: false,
      keywords: false,
      oa_status: false,
    },
  )
}

function publicationExportFileBaseName(scope: PublicationExportScope): string {
  const now = new Date()
  const year = now.getFullYear()
  const month = String(now.getMonth() + 1).padStart(2, '0')
  const day = String(now.getDate()).padStart(2, '0')
  return `publication-library-${scope}-${year}${month}${day}`
}

function normalizePublicationExportText(value: unknown): string {
  return String(value ?? '').replace(/\s+/g, ' ').trim()
}

function csvEscape(value: string): string {
  const clean = String(value ?? '')
  if (/[",\r\n]/.test(clean)) {
    return `"${clean.replace(/"/g, '""')}"`
  }
  return clean
}

function xmlEscape(value: string): string {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
}

function bibtexEscape(value: string): string {
  return String(value ?? '')
    .replace(/\\/g, '\\\\')
    .replace(/\{/g, '\\{')
    .replace(/\}/g, '\\}')
}

function downloadBlob(filename: string, blob: Blob): void {
  const url = window.URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = filename
  document.body.appendChild(anchor)
  anchor.click()
  document.body.removeChild(anchor)
  window.setTimeout(() => {
    window.URL.revokeObjectURL(url)
  }, 0)
}

function publicationExportAuthors(work: PersonaWork): string[] {
  const raw = (work as Record<string, unknown>).authors
  if (Array.isArray(raw)) {
    const names = raw
      .map((item) => {
        if (typeof item === 'string') {
          return item
        }
        if (item && typeof item === 'object') {
          const candidate = item as Record<string, unknown>
          return String(candidate.name || candidate.full_name || '').trim()
        }
        return ''
      })
      .map((item) => item.trim())
      .filter(Boolean)
    if (names.length > 0) {
      return names
    }
  }
  if (typeof raw === 'string') {
    return raw
      .split(/[,;]+/)
      .map((item) => item.trim())
      .filter(Boolean)
  }
  return []
}

function publicationExportKeywords(work: PersonaWork): string[] {
  const raw = (work as Record<string, unknown>).keywords
  if (Array.isArray(raw)) {
    return raw
      .map((item) => String(item || '').trim())
      .filter(Boolean)
  }
  if (typeof raw === 'string') {
    return raw
      .split(/[,;]+/)
      .map((item) => item.trim())
      .filter(Boolean)
  }
  return []
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
    return HOUSE_PUBLICATION_DRILLDOWN_NOTE_SOFT_CLASS
  }
  if (value > 0) {
    return HOUSE_PUBLICATION_DRILLDOWN_VALUE_POSITIVE_CLASS
  }
  if (value < 0) {
    return HOUSE_PUBLICATION_DRILLDOWN_VALUE_NEGATIVE_CLASS
  }
  return HOUSE_PUBLICATION_DRILLDOWN_NOTE_SOFT_CLASS
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
  align = 'left',
  onSort,
}: {
  label: string
  column: PublicationSortField
  sortField: PublicationSortField
  sortDirection: SortDirection
  align?: PublicationTableColumnAlign
  onSort: (column: PublicationSortField) => void
}) {
  const active = sortField === column
  const alignClass =
    align === 'right'
      ? 'justify-end text-right'
      : align === 'center'
        ? 'justify-center text-center'
        : 'justify-start text-left'
  return (
    <button
      type="button"
      onClick={() => onSort(column)}
      className={`inline-flex w-full items-center gap-1 transition-colors hover:text-foreground ${HOUSE_TABLE_SORT_TRIGGER_CLASS} ${alignClass}`}
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
  forceInsightsVisible?: boolean
  initialActiveDetailTab?: PublicationDetailTab
  filesByWorkId?: Record<string, PublicationFilesListPayload>
}

type ProfilePublicationsPageProps = {
  fixture?: ProfilePublicationsPageFixture
}

export function ProfilePublicationsPage({ fixture }: ProfilePublicationsPageProps = {}) {
  const navigate = useNavigate()
  const isLocalRuntime = useMemo(() => {
    if (typeof window === 'undefined') {
      return false
    }
    const host = String(window.location.hostname || '').toLowerCase()
    return host === 'localhost' || host === '127.0.0.1'
  }, [])
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
  const [, setAnalyticsTopDrivers] = useState<PublicationsAnalyticsTopDriversPayload | null>(initialCachedAnalyticsTopDrivers)
  const [topMetricsResponse, setTopMetricsResponse] = useState<PublicationsTopMetricsPayload | null>(initialCachedTopMetricsResponse)
  const [query, setQuery] = useState('')
  const [publicationTableLayoutWidth, setPublicationTableLayoutWidth] = useState(1100)
  const [publicationTableColumnOrder, setPublicationTableColumnOrder] = useState<PublicationTableColumnKey[]>(() => [...PUBLICATION_TABLE_COLUMN_ORDER])
  const [publicationTableColumns, setPublicationTableColumns] = useState<Record<PublicationTableColumnKey, PublicationTableColumnPreference>>(
    () => createDefaultPublicationTableColumnPreferences(),
  )
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
  const [activeDetailTab, setActiveDetailTab] = useState<PublicationDetailTab>(
    () => fixture?.initialActiveDetailTab ?? loadActivePublicationDetailTab(),
  )
  const [detailCacheByWorkId, setDetailCacheByWorkId] = useState<Record<string, PublicationDetailPayload>>({})
  const [authorsCacheByWorkId, setAuthorsCacheByWorkId] = useState<Record<string, PublicationAuthorsPayload>>({})
  const [impactCacheByWorkId, setImpactCacheByWorkId] = useState<Record<string, PublicationImpactResponsePayload>>({})
  const [aiCacheByWorkId, setAiCacheByWorkId] = useState<Record<string, PublicationAiInsightsResponsePayload>>({})
  const [filesCacheByWorkId, setFilesCacheByWorkId] = useState<Record<string, PublicationFilesListPayload>>(
    () => fixture?.filesByWorkId ?? {},
  )
  const [, setPaneLoadingByKey] = useState<Record<string, boolean>>({})
  const [paneErrorByKey, setPaneErrorByKey] = useState<Record<string, string>>({})
  const [expandedAbstractByWorkId, setExpandedAbstractByWorkId] = useState<Record<string, boolean>>({})
  const [contentModeByWorkId] = useState<Record<string, 'plain' | 'highlighted'>>({})
  const [uploadingFile, setUploadingFile] = useState(false)
  const [oaPdfStatusByWorkId, setOaPdfStatusByWorkId] = useState<Record<string, PublicationOaPdfStatusRecord>>({})
  const [autoOaFinding, setAutoOaFinding] = useState(false)
  const [autoOaStatus, setAutoOaStatus] = useState('')
  const [downloadingFileId, setDownloadingFileId] = useState<string | null>(null)
  const [deletingFileId, setDeletingFileId] = useState<string | null>(null)
  const [filesDragOver, setFilesDragOver] = useState(false)
  const [publicationLibraryVisible, setPublicationLibraryVisible] = useState(true)
  const [publicationLibraryFiltersVisible, setPublicationLibraryFiltersVisible] = useState(false)
  const [publicationLibrarySearchVisible, setPublicationLibrarySearchVisible] = useState(false)
  const [publicationLibraryDownloadVisible, setPublicationLibraryDownloadVisible] = useState(false)
  const [publicationLibrarySettingsVisible, setPublicationLibrarySettingsVisible] = useState(false)
  const [publicationLibraryDownloadFormat, setPublicationLibraryDownloadFormat] = useState<PublicationExportFormat>('xlsx')
  const [publicationLibraryDownloadScope, setPublicationLibraryDownloadScope] = useState<PublicationExportScope>('filtered_results')
  const [publicationLibraryDownloadFields, setPublicationLibraryDownloadFields] = useState<Record<PublicationExportFieldKey, boolean>>(
    () => createDefaultPublicationExportFieldSelection(),
  )
  const [publicationLibraryPageSize, setPublicationLibraryPageSize] = useState<PublicationTablePageSize>(50)
  const [publicationLibraryPage, setPublicationLibraryPage] = useState(1)
  const [publicationTableDensity, setPublicationTableDensity] = useState<PublicationTableDensity>('default')
  const [publicationTableAlternateRowColoring, setPublicationTableAlternateRowColoring] = useState(true)
  const [publicationTableMetricHighlights, setPublicationTableMetricHighlights] = useState(true)
  const [publicationTableAttachmentStatusVisible, setPublicationTableAttachmentStatusVisible] = useState(true)
  const [publicationTableResizingColumn, setPublicationTableResizingColumn] = useState<PublicationTableColumnKey | null>(null)
  const [publicationTableDraggingColumn, setPublicationTableDraggingColumn] = useState<PublicationTableColumnKey | null>(null)
  const [selectedPublicationTypes, setSelectedPublicationTypes] = useState<string[]>([])
  const [selectedArticleTypes, setSelectedArticleTypes] = useState<string[]>([])
  const [publicationLibraryToolsOpen, setPublicationLibraryToolsOpen] = useState(false)
  const autoOaInFlightRef = useRef(false)
  const filesWarmupInFlightRef = useRef<Set<string>>(new Set())
  const filesWarmupCompletedRef = useRef<Set<string>>(new Set())
  const autoOaStatusClearTimerRef = useRef<number | null>(null)
  const localTopMetricsBootstrapAttemptedRef = useRef(false)
  const publicationTableLayoutRef = useRef<HTMLDivElement | null>(null)
  const publicationLibraryFilterButtonRef = useRef<HTMLButtonElement | null>(null)
  const publicationLibraryFilterPopoverRef = useRef<HTMLDivElement | null>(null)
  const publicationLibrarySearchButtonRef = useRef<HTMLButtonElement | null>(null)
  const publicationLibrarySearchPopoverRef = useRef<HTMLDivElement | null>(null)
  const publicationLibraryDownloadButtonRef = useRef<HTMLButtonElement | null>(null)
  const publicationLibraryDownloadPopoverRef = useRef<HTMLDivElement | null>(null)
  const publicationLibrarySettingsButtonRef = useRef<HTMLButtonElement | null>(null)
  const publicationLibrarySettingsPopoverRef = useRef<HTMLDivElement | null>(null)
  const publicationTableResizeRef = useRef<{
    column: PublicationTableColumnKey
    visibleColumns: PublicationTableColumnKey[]
    startX: number
    startWidths: Partial<Record<PublicationTableColumnKey, number>>
  } | null>(null)
  const filePickerRef = useRef<HTMLInputElement | null>(null)
  const resolvePublicationTableAvailableWidth = useCallback(() => {
    const measuredClient = publicationTableLayoutRef.current?.clientWidth
    if (Number.isFinite(measuredClient) && Number(measuredClient) > 0) {
      return Math.max(320, Math.round(Number(measuredClient)))
    }
    const measuredRect = publicationTableLayoutRef.current?.getBoundingClientRect().width
    if (Number.isFinite(measuredRect) && Number(measuredRect) > 0) {
      return Math.max(320, Math.round(Number(measuredRect)))
    }
    return Math.max(320, Math.round(Number(publicationTableLayoutWidth) || 320))
  }, [publicationTableLayoutWidth])

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
      const personaPromise = fetchPersonaState(sessionToken)
      const userPromise = fetchMe(sessionToken)
      const jobsPromise = listPersonaSyncJobs(sessionToken, 5)
      const analyticsPromise = fetchPublicationsAnalytics(sessionToken)
      const topMetricsPromise = fetchPublicationsTopMetrics(sessionToken)

      // Prioritize top metrics hydration so the top strip can render while other calls continue.
      void topMetricsPromise
        .then((value) => {
          setTopMetricsResponse(value)
          saveCachedTopMetricsResponse(value)
        })
        .catch((topMetricsError) => {
          const message = topMetricsError instanceof Error ? topMetricsError.message : 'Publications top metrics lookup failed.'
          setStatus(message)
        })

      const settled = await Promise.allSettled([
        personaPromise,
        userPromise,
        jobsPromise,
        analyticsPromise,
        topMetricsPromise,
      ])
      const [stateResult, userResult, jobsResult, analyticsResult, topMetricsResult] = settled
      if (userResult.status === 'rejected') {
        const reason = userResult.reason
        const message = reason instanceof Error ? reason.message : String(reason || '')
        const likelyExpiredSession = /unauthorized|session token|auth|401/i.test(message)
        if (likelyExpiredSession) {
          clearAuthSessionToken()
          setToken('')
          setUser(null)
          setTopMetricsResponse(null)
          setAnalyticsResponse(null)
          setAnalyticsSummary(null)
          setStatus('')
          setError('Your session has expired. Please sign in again.')
          navigate('/auth', { replace: true })
          return
        }
      }
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

  useEffect(() => () => {
    if (autoOaStatusClearTimerRef.current !== null) {
      window.clearTimeout(autoOaStatusClearTimerRef.current)
      autoOaStatusClearTimerRef.current = null
    }
  }, [])

  useEffect(() => {
    if (!user?.id) {
      return
    }
    const loaded = loadPublicationTableColumnPreferences(user.id)
    const availableWidth = resolvePublicationTableAvailableWidth()
    setPublicationTableColumns(() => (
      clampPublicationTableColumnsToAvailableWidth({
        columns: {
          title: { ...loaded.title },
          year: { ...loaded.year },
          venue: { ...loaded.venue },
          work_type: { ...loaded.work_type },
          article_type: { ...loaded.article_type },
          citations: { ...loaded.citations },
        },
        columnOrder: PUBLICATION_TABLE_COLUMN_ORDER,
        availableWidth,
      })
    ))
  }, [resolvePublicationTableAvailableWidth, user?.id])

  useEffect(() => {
    if (!user?.id) {
      return
    }
    setPublicationTableColumnOrder(loadPublicationTableColumnOrderPreference(user.id))
  }, [user?.id])

  useEffect(() => {
    const availableWidth = resolvePublicationTableAvailableWidth()
    setPublicationTableColumns((current) => {
      const normalized = clampPublicationTableColumnsToAvailableWidth({
        columns: current,
        columnOrder: publicationTableColumnOrder,
        availableWidth,
      })
      if (publicationTableColumnsEqual(current, normalized)) {
        return current
      }
      return normalized
    })
  }, [personaState?.works?.length, publicationLibraryVisible, publicationTableColumnOrder, publicationTableLayoutWidth, resolvePublicationTableAvailableWidth])

  useEffect(() => {
    if (!user?.id) {
      return
    }
    setPublicationLibraryPageSize(loadPublicationTablePageSizePreference(user.id))
    setPublicationLibraryPage(1)
  }, [user?.id])

  useEffect(() => {
    if (!user?.id) {
      return
    }
    const settings = loadPublicationTableVisualSettingsPreference(user.id)
    setPublicationTableDensity(settings.density)
    setPublicationTableAlternateRowColoring(settings.alternateRowColoring)
    setPublicationTableMetricHighlights(settings.metricHighlights)
    setPublicationTableAttachmentStatusVisible(settings.attachmentStatusVisible)
  }, [user?.id])

  useEffect(() => {
    if (!user?.id) {
      return
    }
    setOaPdfStatusByWorkId(loadPublicationsOaStatus(user.id))
  }, [user?.id])

  useEffect(() => {
    if (!user?.id) {
      return
    }
    savePublicationTableColumnPreferences(user.id, publicationTableColumns)
  }, [publicationTableColumns, user?.id])

  useEffect(() => {
    if (!user?.id) {
      return
    }
    savePublicationTableColumnOrderPreference(user.id, publicationTableColumnOrder)
  }, [publicationTableColumnOrder, user?.id])

  useEffect(() => {
    if (!user?.id) {
      return
    }
    savePublicationTablePageSizePreference(user.id, publicationLibraryPageSize)
  }, [publicationLibraryPageSize, user?.id])

  useEffect(() => {
    if (!user?.id) {
      return
    }
    savePublicationTableVisualSettingsPreference({
      userId: user.id,
      density: publicationTableDensity,
      alternateRowColoring: publicationTableAlternateRowColoring,
      metricHighlights: publicationTableMetricHighlights,
      attachmentStatusVisible: publicationTableAttachmentStatusVisible,
    })
  }, [
    publicationTableAlternateRowColoring,
    publicationTableAttachmentStatusVisible,
    publicationTableDensity,
    publicationTableMetricHighlights,
    user?.id,
  ])

  useEffect(() => {
    if (!user?.id) {
      return
    }
    savePublicationsOaStatus(user.id, oaPdfStatusByWorkId)
  }, [oaPdfStatusByWorkId, user?.id])

  useEffect(() => {
    const node = publicationTableLayoutRef.current
    if (!node) {
      return
    }
    const updateWidth = () => {
      const measuredWidth = Math.round(node.clientWidth || node.getBoundingClientRect().width || 320)
      setPublicationTableLayoutWidth(Math.max(320, measuredWidth))
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
  }, [publicationLibraryVisible, personaState?.works?.length])

  useEffect(() => {
    if (!publicationLibraryFiltersVisible && !publicationLibrarySearchVisible && !publicationLibraryDownloadVisible && !publicationLibrarySettingsVisible) {
      return
    }
    const onPointerDown = (event: MouseEvent | TouchEvent) => {
      const target = event.target as Node | null
      if (!target) {
        return
      }
      const popoverNode = publicationLibraryFilterPopoverRef.current
      const buttonNode = publicationLibraryFilterButtonRef.current
      const searchPopoverNode = publicationLibrarySearchPopoverRef.current
      const searchButtonNode = publicationLibrarySearchButtonRef.current
      const downloadPopoverNode = publicationLibraryDownloadPopoverRef.current
      const downloadButtonNode = publicationLibraryDownloadButtonRef.current
      const settingsPopoverNode = publicationLibrarySettingsPopoverRef.current
      const settingsButtonNode = publicationLibrarySettingsButtonRef.current
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
      setPublicationLibraryFiltersVisible(false)
      setPublicationLibrarySearchVisible(false)
      setPublicationLibraryDownloadVisible(false)
      setPublicationLibrarySettingsVisible(false)
    }
    document.addEventListener('mousedown', onPointerDown)
    document.addEventListener('touchstart', onPointerDown)
    return () => {
      document.removeEventListener('mousedown', onPointerDown)
      document.removeEventListener('touchstart', onPointerDown)
    }
  }, [publicationLibraryDownloadVisible, publicationLibraryFiltersVisible, publicationLibrarySearchVisible, publicationLibrarySettingsVisible])

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
      const oaFile = (payload.items || []).find((item) => item.source === 'OA_LINK') || null
      const anyFile = (payload.items || [])[0] || null
      const resolvedFile = oaFile || anyFile
      if (resolvedFile) {
        setOaPdfStatusByWorkId((current) => ({
          ...current,
          [workId]: {
            status: 'available',
            downloadUrl: resolvedFile.download_url || resolvedFile.oa_url || null,
            fileName: resolvedFile.file_name || null,
            updatedAt: new Date().toISOString(),
          },
        }))
      } else {
        // When files are explicitly fetched and none exist, mark missing immediately
        // so table attachment icon state updates without waiting for another pass.
        setOaPdfStatusByWorkId((current) => ({
          ...current,
          [workId]: {
            status: 'missing',
            downloadUrl: null,
            fileName: null,
            updatedAt: new Date().toISOString(),
          },
        }))
      }
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
      if (isLocalRuntime) {
        setLoading(false)
        setError('No local auth session token found. Sign in on /auth to load publication metrics.')
        return
      }
      navigate('/auth', { replace: true })
      return
    }
    let cancelled = false

    const validateAndLoad = async () => {
      try {
        const activeUser = await fetchMe(sessionToken)
        if (cancelled) {
          return
        }
        setUser(activeUser)
        saveCachedUser(activeUser)
        await loadData(sessionToken, false, true)
      } catch {
        if (cancelled) {
          return
        }
        clearAuthSessionToken()
        setToken('')
        setUser(null)
        setTopMetricsResponse(null)
        setAnalyticsResponse(null)
        setAnalyticsSummary(null)
        setStatus('')
        setError('Your session has expired. Please sign in again.')
        navigate('/auth', { replace: true })
      }
    }

    void validateAndLoad()
    return () => {
      cancelled = true
    }
  }, [isFixtureMode, isLocalRuntime, loadData, navigate])

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

    const poll = async () => {
      try {
        const job = await fetchPersonaSyncJob(token, activeSyncJob.id)
        if (cancelled) {
          return
        }
        setActiveSyncJob(job)
        if (job.status === 'queued' || job.status === 'running') {
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
    if (isLocalRuntime) {
      return
    }
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
  }, [analyticsResponse?.status, isLocalRuntime, token])

  useEffect(() => {
    if (isLocalRuntime) {
      return
    }
    const tileCount = (topMetricsResponse?.tiles || []).length
    if (!token || topMetricsResponse?.status !== 'RUNNING' || tileCount > 0) {
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
  }, [isLocalRuntime, topMetricsResponse?.status, topMetricsResponse?.tiles, token])

  useEffect(() => {
    if (!isLocalRuntime) {
      return
    }
    localTopMetricsBootstrapAttemptedRef.current = false
  }, [isLocalRuntime, token, user?.id])

  useEffect(() => {
    if (!isLocalRuntime || !token || !user?.id) {
      return
    }
    if (localTopMetricsBootstrapAttemptedRef.current) {
      return
    }
    if ((topMetricsResponse?.tiles || []).length > 0) {
      localTopMetricsBootstrapAttemptedRef.current = true
      return
    }
    localTopMetricsBootstrapAttemptedRef.current = true
    let cancelled = false
    const bootstrap = async () => {
      try {
        await triggerPublicationsTopMetricsRefresh(token)
      } catch {
        // Continue with fetch attempt even if refresh enqueue call fails.
      }
      try {
        const next = await fetchPublicationsTopMetrics(token)
        if (cancelled) {
          return
        }
        setTopMetricsResponse(next)
        saveCachedTopMetricsResponse(next)
      } catch (error) {
        if (cancelled) {
          return
        }
        const message = error instanceof Error ? error.message : 'Could not load publication insight tiles.'
        setStatus(message)
      }
    }
    void bootstrap()
    return () => {
      cancelled = true
    }
  }, [isLocalRuntime, token, topMetricsResponse?.tiles, user?.id])

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

  const publicationTypeFilterOptions = useMemo(() => {
    const values = new Set<string>()
    for (const work of personaState?.works ?? []) {
      const key = derivePublicationTypeLabel(work)
      if (key) {
        values.add(key)
      }
    }
    return Array.from(values).sort((left, right) => left.localeCompare(right))
  }, [personaState?.works])

  const articleTypeFilterOptions = useMemo(() => {
    const values = new Set<string>()
    for (const work of personaState?.works ?? []) {
      const key = deriveArticleTypeLabel(work)
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
      const publicationType = derivePublicationTypeLabel(work)
      if (selectedPublicationTypes.length > 0 && !selectedPublicationTypes.includes(publicationType)) {
        return false
      }
      const articleType = deriveArticleTypeLabel(work)
      if (selectedArticleTypes.length > 0 && !selectedArticleTypes.includes(articleType)) {
        return false
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
  }, [metricsByWorkId, personaState?.works, query, selectedArticleTypes, selectedPublicationTypes, sortDirection, sortField])

  const totalFilteredPublicationWorks = filteredWorks.length
  const publicationLibraryTotalPages = useMemo(() => {
    if (publicationLibraryPageSize === 'all') {
      return 1
    }
    return Math.max(1, Math.ceil(totalFilteredPublicationWorks / publicationLibraryPageSize))
  }, [publicationLibraryPageSize, totalFilteredPublicationWorks])

  useEffect(() => {
    setPublicationLibraryPage((current) => {
      if (publicationLibraryPageSize === 'all') {
        return 1
      }
      const next = Math.max(1, Math.min(current, publicationLibraryTotalPages))
      return next
    })
  }, [publicationLibraryPageSize, publicationLibraryTotalPages])

  const pagedFilteredWorks = useMemo(() => {
    if (publicationLibraryPageSize === 'all') {
      return filteredWorks
    }
    const safePage = Math.max(1, Math.min(publicationLibraryPage, publicationLibraryTotalPages))
    const startIndex = (safePage - 1) * publicationLibraryPageSize
    return filteredWorks.slice(startIndex, startIndex + publicationLibraryPageSize)
  }, [filteredWorks, publicationLibraryPage, publicationLibraryPageSize, publicationLibraryTotalPages])

  const publicationLibraryRangeStart = totalFilteredPublicationWorks === 0
    ? 0
    : publicationLibraryPageSize === 'all'
      ? 1
      : (Math.max(1, Math.min(publicationLibraryPage, publicationLibraryTotalPages)) - 1) * publicationLibraryPageSize + 1
  const publicationLibraryRangeEnd = totalFilteredPublicationWorks === 0
    ? 0
    : publicationLibraryPageSize === 'all'
      ? totalFilteredPublicationWorks
      : Math.min(
        totalFilteredPublicationWorks,
        Math.max(1, Math.min(publicationLibraryPage, publicationLibraryTotalPages)) * publicationLibraryPageSize,
      )

  const effectivePublicationTableColumns = useMemo(() => (
    clampPublicationTableColumnsToAvailableWidth({
      columns: publicationTableColumns,
      columnOrder: publicationTableColumnOrder,
      availableWidth: resolvePublicationTableAvailableWidth(),
    })
  ), [publicationTableColumnOrder, publicationTableColumns, publicationTableLayoutWidth, resolvePublicationTableAvailableWidth])

  const visiblePublicationTableColumns = useMemo(() => (
    publicationTableColumnOrder.filter((key) => effectivePublicationTableColumns[key].visible)
  ), [effectivePublicationTableColumns, publicationTableColumnOrder])

  useEffect(() => {
    const sortColumn = sortField as PublicationTableColumnKey
    if (effectivePublicationTableColumns[sortColumn]?.visible) {
      return
    }
    const fallbackColumn = publicationTableColumnOrder.find(
      (column) => effectivePublicationTableColumns[column].visible,
    )
    if (!fallbackColumn) {
      return
    }
    setSortField(PUBLICATION_TABLE_COLUMN_DEFINITIONS[fallbackColumn].sortField)
  }, [effectivePublicationTableColumns, publicationTableColumnOrder, sortField])

  useEffect(() => {
    if (filteredWorks.length === 0) {
      setSelectedWorkId(null)
      return
    }
    setSelectedWorkId((current) => {
      if (!current) {
        return null
      }
      if (filteredWorks.some((work) => work.id === current)) {
        return current
      }
      return null
    })
  }, [filteredWorks])

  useEffect(() => {
    if (publicationLibraryDownloadScope !== 'selected_rows') {
      return
    }
    if (selectedWorkId) {
      return
    }
    setPublicationLibraryDownloadScope('filtered_results')
  }, [publicationLibraryDownloadScope, selectedWorkId])

  useEffect(() => {
    if (isFixtureMode || !token || !user?.id || autoOaInFlightRef.current) {
      return
    }
    const works = personaState?.works ?? []
    if (works.length === 0) {
      return
    }

    const attempted = loadPublicationsOaAutoAttempted(user.id)
    const candidates = works
      .filter((work) => Boolean((work.doi || '').trim()))
      .filter((work) => !attempted.has(work.id))
      .slice(0, PUBLICATIONS_OA_AUTO_MAX_PER_PASS)
    if (candidates.length === 0) {
      return
    }

    let cancelled = false
    autoOaInFlightRef.current = true
    setAutoOaFinding(true)
    setAutoOaStatus(`Background PDF ingest: 0/${candidates.length}`)
    if (autoOaStatusClearTimerRef.current !== null) {
      window.clearTimeout(autoOaStatusClearTimerRef.current)
      autoOaStatusClearTimerRef.current = null
    }

    const run = async () => {
      let checked = 0
      let linked = 0
      let unchanged = 0
      let unavailable = 0
      try {
        for (const work of candidates) {
          if (cancelled) {
            break
          }
          setOaPdfStatusByWorkId((current) => ({
            ...current,
            [work.id]: {
              status: 'checking',
              downloadUrl: current[work.id]?.downloadUrl || null,
              fileName: current[work.id]?.fileName || null,
              updatedAt: new Date().toISOString(),
            },
          }))
          attempted.add(work.id)
          try {
            const payload = await linkPublicationOpenAccessPdf(token, work.id)
            if (payload.file) {
              const linkedFile = payload.file
              const downloadUrl = linkedFile.download_url || linkedFile.oa_url || null
              setFilesCacheByWorkId((current) => {
                const existing = current[work.id]?.items || []
                if (existing.some((item) => item.id === linkedFile.id)) {
                  return current
                }
                return {
                  ...current,
                  [work.id]: {
                    items: [linkedFile, ...existing],
                  },
                }
              })
              setOaPdfStatusByWorkId((current) => ({
                ...current,
                [work.id]: {
                  status: 'available',
                  downloadUrl,
                  fileName: linkedFile.file_name || null,
                  updatedAt: new Date().toISOString(),
                },
              }))
            } else {
              setOaPdfStatusByWorkId((current) => ({
                ...current,
                [work.id]: {
                  status: 'missing',
                  downloadUrl: null,
                  fileName: null,
                  updatedAt: new Date().toISOString(),
                },
              }))
            }
            if (payload.created && payload.file) {
              linked += 1
            } else {
              unchanged += 1
            }
          } catch {
            setOaPdfStatusByWorkId((current) => ({
              ...current,
              [work.id]: {
                status: 'missing',
                downloadUrl: null,
                fileName: null,
                updatedAt: new Date().toISOString(),
              },
            }))
            unavailable += 1
          }
          checked += 1
          savePublicationsOaAutoAttempted(user.id, attempted)
          if (cancelled) {
            break
          }
          setAutoOaStatus(`Background PDF ingest: ${checked}/${candidates.length} checked`)
          if (checked < candidates.length) {
            await new Promise<void>((resolve) => {
              window.setTimeout(resolve, PUBLICATIONS_OA_AUTO_INTER_REQUEST_DELAY_MS)
            })
          }
        }
      } finally {
        savePublicationsOaAutoAttempted(user.id, attempted)
        autoOaInFlightRef.current = false
        setAutoOaFinding(false)
        if (!cancelled) {
          setAutoOaStatus(
            `Background PDF ingest complete: ${linked} linked, ${unchanged} already linked, ${unavailable} unavailable.`,
          )
          autoOaStatusClearTimerRef.current = window.setTimeout(() => {
            setAutoOaStatus('')
            autoOaStatusClearTimerRef.current = null
          }, PUBLICATIONS_OA_AUTO_STATUS_CLEAR_DELAY_MS)
        }
      }
    }

    void run()
    return () => {
      cancelled = true
    }
  }, [isFixtureMode, personaState?.works, token, user?.id])

  useEffect(() => {
    if (isFixtureMode || !token) {
      return
    }
    const works = personaState?.works ?? []
    if (works.length === 0) {
      return
    }

    let cancelled = false
    const warmFilesInBackground = async () => {
      for (const work of works) {
        if (cancelled) {
          break
        }
        const workId = String(work.id || '').trim()
        if (!workId) {
          continue
        }
        if (
          filesCacheByWorkId[workId] ||
          filesWarmupCompletedRef.current.has(workId) ||
          filesWarmupInFlightRef.current.has(workId)
        ) {
          if (filesCacheByWorkId[workId]) {
            filesWarmupCompletedRef.current.add(workId)
          }
          continue
        }

        filesWarmupInFlightRef.current.add(workId)
        try {
          await loadPublicationFilesData(workId)
        } catch {
          // Ignore warmup errors; explicit tab loads will still surface errors.
        } finally {
          filesWarmupInFlightRef.current.delete(workId)
          filesWarmupCompletedRef.current.add(workId)
        }

        if (cancelled) {
          break
        }
        await new Promise<void>((resolve) => {
          window.setTimeout(resolve, 120)
        })
      }
    }

    void warmFilesInBackground()
    return () => {
      cancelled = true
    }
  }, [filesCacheByWorkId, isFixtureMode, loadPublicationFilesData, personaState?.works, token])

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
  const selectedFiles = useMemo(() => {
    const files = [...(selectedFilesPayload?.items || [])]
    files.sort((left, right) => {
      if (left.source !== right.source) {
        return left.source === 'OA_LINK' ? -1 : 1
      }
      return Date.parse(String(right.created_at || '')) - Date.parse(String(left.created_at || ''))
    })
    return files
  }, [selectedFilesPayload?.items])

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
  const [overviewAuthorsExpanded, setOverviewAuthorsExpanded] = useState(false)
  const overviewAuthorsModel = useMemo(() => {
    const currentOwnerName = user?.name || ''
    const currentOwnerEmail = user?.email || ''
    const roleFromItem = (item: Record<string, unknown>): Array<'First author' | 'Senior author' | 'Corresponding'> => {
      const roles: Array<'First author' | 'Senior author' | 'Corresponding'> = []
      const roleText = String(item.role || item.author_role || item.position_role || '').toLowerCase()
      const correspondingFlag = Boolean(item.corresponding || item.is_corresponding || item.corresponding_author)
      const firstFlag = Boolean(item.first_author || item.is_first_author || item.co_first_author)
      const seniorFlag = Boolean(item.senior_author || item.is_senior_author || item.last_author || item.is_last_author || item.co_senior_author)
      if (firstFlag || roleText.includes('first')) {
        roles.push('First author')
      }
      if (seniorFlag || roleText.includes('senior') || roleText.includes('last')) {
        roles.push('Senior author')
      }
      if (correspondingFlag || roleText.includes('correspond')) {
        roles.push('Corresponding')
      }
      return roles
    }
    const equalContributionFlag = (item: Record<string, unknown>) =>
      Boolean(item.equal_contribution || item.contributed_equally || item.equal_contributor || item.co_first_author || item.co_senior_author)
    const affiliationsFromItem = (item: Record<string, unknown>): string[] => {
      const values: string[] = []
      const append = (value: unknown) => {
        const text = String(value || '').replace(/\s+/g, ' ').trim()
        if (text && !values.includes(text)) {
          values.push(text)
        }
      }
      const rawAffiliations = item.affiliations || item.affiliations_json || item.institutions || item.institution_list
      if (Array.isArray(rawAffiliations)) {
        for (const entry of rawAffiliations) {
          if (typeof entry === 'string') {
            append(entry)
          } else if (entry && typeof entry === 'object') {
            const record = entry as Record<string, unknown>
            append(record.name || record.institution || record.affiliation || record.display_name || record.label)
          }
        }
      } else {
        append(item.affiliation)
        append(item.institution)
        append(item.organization)
      }
      return values
    }

    const fromJson = (selectedAuthorsPayload?.authors_json?.length
      ? selectedAuthorsPayload.authors_json
      : selectedDetail?.authors_json?.length
        ? selectedDetail.authors_json
        : []) as Array<Record<string, unknown>>
    const rawNames = selectedAuthorNames
    const jsonByName = new Map<string, Record<string, unknown>>()
    for (const item of fromJson) {
      const rawName = String(item?.name || item?.full_name || '').trim()
      if (!rawName) continue
      jsonByName.set(rawName.toLowerCase(), item)
    }
    const affiliationIndexByText = new Map<string, number>()
    const affiliationLegend: Array<{ index: number; label: string }> = []
    const ensureAffiliationIndex = (label: string): number => {
      const existing = affiliationIndexByText.get(label)
      if (existing) return existing
      const next = affiliationLegend.length + 1
      affiliationIndexByText.set(label, next)
      affiliationLegend.push({ index: next, label })
      return next
    }

    const authors = rawNames.map((rawName) => {
      const item = jsonByName.get(rawName.toLowerCase())
      const roles = item ? roleFromItem(item) : []
      const hasEqualContribution = item ? equalContributionFlag(item) : false
      const affiliationIndices = item
        ? affiliationsFromItem(item).map((label) => ensureAffiliationIndex(label))
        : []
      return {
        rawName,
        displayName: formatAuthorSurnameInitials(rawName),
        isYou: isOwnerAuthor(rawName, currentOwnerName, currentOwnerEmail),
        roles,
        hasEqualContribution,
        affiliationIndices,
      }
    })
    return { authors, affiliationLegend }
  }, [selectedAuthorNames, selectedAuthorsPayload?.authors_json, selectedDetail?.authors_json, user?.email, user?.name])
  const overviewAuthors = overviewAuthorsModel.authors
  const overviewAuthorAffiliations = overviewAuthorsModel.affiliationLegend
  const overviewOwnerAuthorIndex = useMemo(
    () => overviewAuthors.findIndex((author) => author.isYou),
    [overviewAuthors],
  )
  const overviewOwnerAuthorPosition = useMemo(() => {
    if (overviewOwnerAuthorIndex < 0 || overviewAuthors.length === 0) {
      return 'n/a'
    }
    return `${overviewOwnerAuthorIndex + 1}/${overviewAuthors.length}`
  }, [overviewAuthors.length, overviewOwnerAuthorIndex])
  const overviewOwnerContribution = useMemo(() => {
    if (overviewOwnerAuthorIndex < 0 || overviewAuthors.length === 0) {
      return 'Not identified'
    }
    const ownerAuthor = overviewAuthors[overviewOwnerAuthorIndex]
    if (overviewAuthors.length === 1) {
      return 'Leading'
    }
    if (overviewOwnerAuthorIndex === 0) {
      if (ownerAuthor?.hasEqualContribution) {
        return 'Co-leading'
      }
      return 'Leading'
    }
    if (overviewOwnerAuthorIndex === overviewAuthors.length - 1) {
      return 'Senior'
    }
    return 'Contributor'
  }, [overviewAuthors, overviewAuthors.length, overviewOwnerAuthorIndex])
  const overviewOwnerContributionToneClass = useMemo(() => {
    switch (overviewOwnerContribution) {
      case 'Leading':
        return 'house-publication-contribution-leading'
      case 'Co-leading':
        return 'house-publication-contribution-co-leading'
      case 'Senior':
        return 'house-publication-contribution-senior'
      case 'Contributor':
        return 'house-publication-contribution-contributor'
      default:
        return 'house-publication-contribution-not-identified'
    }
  }, [overviewOwnerContribution])
  useEffect(() => {
    setOverviewAuthorsExpanded(false)
  }, [selectedWorkId])

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

  const hIndex = analyticsSummary?.h_index ?? 0

  const onSortColumn = (column: PublicationSortField) => {
    if (sortField === column) {
      setSortDirection((current) => (current === 'desc' ? 'asc' : 'desc'))
      return
    }
    setSortField(column)
    setSortDirection('desc')
  }

  const onReorderPublicationColumn = useCallback((fromColumn: PublicationTableColumnKey, toColumn: PublicationTableColumnKey) => {
    if (fromColumn === toColumn) {
      return
    }
    setPublicationTableColumnOrder((current) => {
      const visibleOrder = current.filter((columnKey) => publicationTableColumns[columnKey].visible)
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
        publicationTableColumns[columnKey].visible ? (queue.shift() || columnKey) : columnKey
      ))
    })
  }, [publicationTableColumns])

  const onTogglePublicationColumnVisibility = useCallback((column: PublicationTableColumnKey) => {
    const availableWidth = resolvePublicationTableAvailableWidth()
    setPublicationTableColumns((current) => {
      const visibleCount = PUBLICATION_TABLE_COLUMN_ORDER.reduce(
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
      return clampPublicationTableColumnsToAvailableWidth({
        columns: next,
        columnOrder: publicationTableColumnOrder,
        availableWidth,
      })
    })
  }, [publicationTableColumnOrder, resolvePublicationTableAvailableWidth])

  const onResetPublicationTableSettings = useCallback(() => {
    const availableWidth = resolvePublicationTableAvailableWidth()
    setPublicationTableColumns((current) => {
      const reset = PUBLICATION_TABLE_COLUMN_ORDER.reduce<Record<PublicationTableColumnKey, PublicationTableColumnPreference>>(
        (accumulator, column) => {
          accumulator[column] = {
            ...current[column],
            visible: true,
          }
          return accumulator
        },
        {
          title: { ...current.title },
          year: { ...current.year },
          venue: { ...current.venue },
          work_type: { ...current.work_type },
          article_type: { ...current.article_type },
          citations: { ...current.citations },
        },
      )
      return clampPublicationTableColumnsToAvailableWidth({
        columns: reset,
        columnOrder: PUBLICATION_TABLE_COLUMN_ORDER,
        availableWidth,
      })
    })
    setPublicationTableColumnOrder([...PUBLICATION_TABLE_COLUMN_ORDER])
    setPublicationTableDensity('default')
    setPublicationTableAlternateRowColoring(true)
    setPublicationTableMetricHighlights(true)
    setPublicationTableAttachmentStatusVisible(true)
    setPublicationLibraryPageSize(50)
    setPublicationLibraryPage(1)
  }, [resolvePublicationTableAvailableWidth])

  const onAutoAdjustPublicationTableWidths = useCallback(() => {
    const works = filteredWorks.length > 0 ? filteredWorks : (personaState?.works ?? [])
    if (works.length === 0) {
      return
    }
    if (publicationTableResizingColumn) {
      publicationTableResizeRef.current = null
      setPublicationTableResizingColumn(null)
    }
    const availableWidth = resolvePublicationTableAvailableWidth()
    setPublicationTableColumns((current) => {
      const next = autoFitPublicationTableColumns({
        works,
        metricsByWorkId,
        current,
        availableWidth,
      })
      return clampPublicationTableColumnsToAvailableWidth({
        columns: next,
        columnOrder: publicationTableColumnOrder,
        availableWidth,
      })
    })
  }, [filteredWorks, metricsByWorkId, personaState?.works, publicationTableColumnOrder, publicationTableResizingColumn, resolvePublicationTableAvailableWidth])

  const onDownloadPublicationLibrary = useCallback(() => {
    const selectedFieldKeys = PUBLICATION_EXPORT_FIELD_OPTIONS
      .map((option) => option.key)
      .filter((key) => publicationLibraryDownloadFields[key])
    if (selectedFieldKeys.length === 0) {
      setError('Select at least one field to export.')
      return
    }

    const wholeLibraryWorks = personaState?.works ?? []
    const selectedScopeWorks = (() => {
      if (publicationLibraryDownloadScope === 'whole_library') {
        return wholeLibraryWorks
      }
      if (publicationLibraryDownloadScope === 'filtered_results') {
        return filteredWorks
      }
      if (publicationLibraryDownloadScope === 'current_page') {
        return pagedFilteredWorks
      }
      if (!selectedWorkId) {
        return []
      }
      return wholeLibraryWorks.filter((work) => work.id === selectedWorkId)
    })()

    if (selectedScopeWorks.length === 0) {
      setError('No publications available for the selected export scope.')
      return
    }

    const exportRows = selectedScopeWorks.map((work) => {
      const authors = publicationExportAuthors(work)
      const keywords = publicationExportKeywords(work)
      const citations = Number(metricsByWorkId.get(work.id)?.citations || 0)
      const publicationType = derivePublicationTypeLabel(work)
      const articleType = deriveArticleTypeLabel(work)
      const oaRecord = oaPdfStatusByWorkId[work.id] || null
      const oaStatus = publicationOaStatusLabel(
        publicationOaStatusVisualStatus(work, oaRecord),
        Boolean((work.doi || '').trim()),
      )
      return {
        key: `pub_${String(work.year || 'nd')}_${String(work.id || '').replace(/[^a-zA-Z0-9]+/g, '_').slice(0, 24)}`,
        title: normalizePublicationExportText(work.title || ''),
        authors,
        year: work.year ?? null,
        journal: normalizePublicationExportText(formatJournalName(work.venue_name)),
        doi: normalizePublicationExportText(work.doi || ''),
        pmid: normalizePublicationExportText(work.pmid || ''),
        publicationType,
        articleType,
        citations,
        abstract: normalizePublicationExportText(work.abstract || ''),
        keywords,
        oaStatus,
      }
    })

    const fieldLabelByKey = PUBLICATION_EXPORT_FIELD_OPTIONS.reduce<Record<PublicationExportFieldKey, string>>(
      (accumulator, option) => {
        accumulator[option.key] = option.label
        return accumulator
      },
      {
        title: 'Title',
        authors: 'Authors',
        year: 'Year',
        journal: 'Journal',
        doi: 'DOI',
        pmid: 'PMID',
        publication_type: 'Publication type',
        article_type: 'Article type',
        citations: 'Citations',
        abstract: 'Abstract',
        keywords: 'Keywords',
        oa_status: 'Attachment status',
      },
    )

    const resolveFieldValue = (
      row: (typeof exportRows)[number],
      key: PublicationExportFieldKey,
    ): string | number => {
      if (key === 'title') {
        return row.title
      }
      if (key === 'authors') {
        return row.authors.join('; ')
      }
      if (key === 'year') {
        return row.year ?? ''
      }
      if (key === 'journal') {
        return row.journal
      }
      if (key === 'doi') {
        return row.doi
      }
      if (key === 'pmid') {
        return row.pmid
      }
      if (key === 'publication_type') {
        return row.publicationType
      }
      if (key === 'article_type') {
        return row.articleType
      }
      if (key === 'citations') {
        return row.citations
      }
      if (key === 'abstract') {
        return row.abstract
      }
      if (key === 'keywords') {
        return row.keywords.join('; ')
      }
      return row.oaStatus
    }

    const exportOption = PUBLICATION_EXPORT_FORMAT_OPTIONS.find((option) => option.value === publicationLibraryDownloadFormat)
    if (!exportOption) {
      setError('Unsupported export format.')
      return
    }

    const fileBaseName = publicationExportFileBaseName(publicationLibraryDownloadScope)
    const filename = `${fileBaseName}.${exportOption.extension}`

    try {
      if (publicationLibraryDownloadFormat === 'xlsx') {
        const xlsxRows = exportRows.map((row) => (
          selectedFieldKeys.reduce<Record<string, string | number>>((accumulator, key) => {
            accumulator[fieldLabelByKey[key]] = resolveFieldValue(row, key)
            return accumulator
          }, {})
        ))
        const worksheet = XLSX.utils.json_to_sheet(xlsxRows)
        const workbook = XLSX.utils.book_new()
        XLSX.utils.book_append_sheet(workbook, worksheet, 'Publications')
        const content = XLSX.write(workbook, { bookType: 'xlsx', type: 'array' })
        downloadBlob(filename, new Blob([content], { type: exportOption.mimeType }))
      } else if (publicationLibraryDownloadFormat === 'csv') {
        const header = selectedFieldKeys.map((key) => csvEscape(fieldLabelByKey[key])).join(',')
        const body = exportRows.map((row) => (
          selectedFieldKeys
            .map((key) => csvEscape(String(resolveFieldValue(row, key))))
            .join(',')
        ))
        const content = [header, ...body].join('\n')
        downloadBlob(filename, new Blob([content], { type: exportOption.mimeType }))
      } else if (publicationLibraryDownloadFormat === 'ris') {
        const lines: string[] = []
        for (const row of exportRows) {
          lines.push('TY  - JOUR')
          if (publicationLibraryDownloadFields.title && row.title) lines.push(`TI  - ${row.title}`)
          if (publicationLibraryDownloadFields.authors) {
            for (const author of row.authors) {
              lines.push(`AU  - ${author}`)
            }
          }
          if (publicationLibraryDownloadFields.year && row.year) lines.push(`PY  - ${row.year}`)
          if (publicationLibraryDownloadFields.journal && row.journal) lines.push(`JO  - ${row.journal}`)
          if (publicationLibraryDownloadFields.doi && row.doi) lines.push(`DO  - ${row.doi}`)
          if (publicationLibraryDownloadFields.pmid && row.pmid) lines.push(`AN  - ${row.pmid}`)
          if (publicationLibraryDownloadFields.abstract && row.abstract) lines.push(`N2  - ${row.abstract}`)
          if (publicationLibraryDownloadFields.keywords) {
            for (const keyword of row.keywords) {
              lines.push(`KW  - ${keyword}`)
            }
          }
          if (publicationLibraryDownloadFields.citations) lines.push(`N1  - Citations: ${row.citations}`)
          if (publicationLibraryDownloadFields.oa_status) lines.push(`N1  - Attachment status: ${row.oaStatus}`)
          lines.push('ER  -')
          lines.push('')
        }
        downloadBlob(filename, new Blob([lines.join('\n')], { type: exportOption.mimeType }))
      } else if (publicationLibraryDownloadFormat === 'bibtex') {
        const entries = exportRows.map((row, rowIndex) => {
          const fields: string[] = []
          if (publicationLibraryDownloadFields.title && row.title) fields.push(`  title = {${bibtexEscape(row.title)}}`)
          if (publicationLibraryDownloadFields.authors && row.authors.length > 0) fields.push(`  author = {${bibtexEscape(row.authors.join(' and '))}}`)
          if (publicationLibraryDownloadFields.year && row.year) fields.push(`  year = {${row.year}}`)
          if (publicationLibraryDownloadFields.journal && row.journal) fields.push(`  journal = {${bibtexEscape(row.journal)}}`)
          if (publicationLibraryDownloadFields.doi && row.doi) fields.push(`  doi = {${bibtexEscape(row.doi)}}`)
          if (publicationLibraryDownloadFields.pmid && row.pmid) fields.push(`  pmid = {${bibtexEscape(row.pmid)}}`)
          if (publicationLibraryDownloadFields.abstract && row.abstract) fields.push(`  abstract = {${bibtexEscape(row.abstract)}}`)
          if (publicationLibraryDownloadFields.keywords && row.keywords.length > 0) fields.push(`  keywords = {${bibtexEscape(row.keywords.join(', '))}}`)
          const notes: string[] = []
          if (publicationLibraryDownloadFields.citations) notes.push(`Citations: ${row.citations}`)
          if (publicationLibraryDownloadFields.oa_status) notes.push(`Attachment status: ${row.oaStatus}`)
          if (notes.length > 0) fields.push(`  note = {${bibtexEscape(notes.join('; '))}}`)
          const key = row.key || `pub_${rowIndex + 1}`
          return `@article{${key},\n${fields.join(',\n')}\n}`
        })
        downloadBlob(filename, new Blob([entries.join('\n\n')], { type: exportOption.mimeType }))
      } else if (publicationLibraryDownloadFormat === 'nbib') {
        const lines: string[] = []
        for (const row of exportRows) {
          if (publicationLibraryDownloadFields.pmid && row.pmid) lines.push(`PMID- ${row.pmid}`)
          if (publicationLibraryDownloadFields.title && row.title) lines.push(`TI  - ${row.title}`)
          if (publicationLibraryDownloadFields.authors) {
            for (const author of row.authors) {
              lines.push(`FAU - ${author}`)
            }
          }
          if (publicationLibraryDownloadFields.journal && row.journal) lines.push(`JT  - ${row.journal}`)
          if (publicationLibraryDownloadFields.year && row.year) lines.push(`DP  - ${row.year}`)
          if (publicationLibraryDownloadFields.doi && row.doi) lines.push(`LID - ${row.doi} [doi]`)
          if (publicationLibraryDownloadFields.abstract && row.abstract) lines.push(`AB  - ${row.abstract}`)
          if (publicationLibraryDownloadFields.publication_type && row.publicationType) lines.push(`PT  - ${row.publicationType}`)
          if (publicationLibraryDownloadFields.keywords) {
            for (const keyword of row.keywords) {
              lines.push(`OT  - ${keyword}`)
            }
          }
          if (publicationLibraryDownloadFields.citations) lines.push(`CI  - ${row.citations}`)
          if (publicationLibraryDownloadFields.oa_status) lines.push(`STAT- ${row.oaStatus}`)
          lines.push('')
        }
        downloadBlob(filename, new Blob([lines.join('\n')], { type: exportOption.mimeType }))
      } else {
        const records = exportRows.map((row) => {
          const notes: string[] = []
          if (publicationLibraryDownloadFields.citations) notes.push(`Citations: ${row.citations}`)
          if (publicationLibraryDownloadFields.oa_status) notes.push(`Attachment status: ${row.oaStatus}`)
          return [
            '    <record>',
            '      <ref-type name="Journal Article">17</ref-type>',
            publicationLibraryDownloadFields.authors
              ? `      <contributors><authors>${row.authors.map((author) => `<author>${xmlEscape(author)}</author>`).join('')}</authors></contributors>`
              : '',
            `      <titles>${publicationLibraryDownloadFields.title ? `<title>${xmlEscape(row.title)}</title>` : ''}${publicationLibraryDownloadFields.journal ? `<secondary-title>${xmlEscape(row.journal)}</secondary-title>` : ''}</titles>`,
            publicationLibraryDownloadFields.year && row.year ? `      <dates><year>${row.year}</year></dates>` : '',
            publicationLibraryDownloadFields.abstract && row.abstract ? `      <abstract>${xmlEscape(row.abstract)}</abstract>` : '',
            publicationLibraryDownloadFields.doi && row.doi ? `      <electronic-resource-num>${xmlEscape(row.doi)}</electronic-resource-num>` : '',
            publicationLibraryDownloadFields.pmid && row.pmid ? `      <accession-num>${xmlEscape(row.pmid)}</accession-num>` : '',
            publicationLibraryDownloadFields.keywords && row.keywords.length > 0
              ? `      <keywords>${row.keywords.map((keyword) => `<keyword>${xmlEscape(keyword)}</keyword>`).join('')}</keywords>`
              : '',
            notes.length > 0
              ? `      <notes>${notes.map((note) => `<note>${xmlEscape(note)}</note>`).join('')}</notes>`
              : '',
            '    </record>',
          ].filter(Boolean).join('\n')
        })
        const content = `<?xml version="1.0" encoding="UTF-8"?>\n<xml>\n  <records>\n${records.join('\n')}\n  </records>\n</xml>\n`
        downloadBlob(filename, new Blob([content], { type: exportOption.mimeType }))
      }
      setStatus(`Downloaded ${selectedScopeWorks.length} publication${selectedScopeWorks.length === 1 ? '' : 's'} as ${exportOption.label}.`)
      setPublicationLibraryDownloadVisible(false)
      setError('')
    } catch {
      setError('Could not generate the selected export format.')
    }
  }, [
    filteredWorks,
    metricsByWorkId,
    oaPdfStatusByWorkId,
    pagedFilteredWorks,
    personaState?.works,
    publicationLibraryDownloadFields,
    publicationLibraryDownloadFormat,
    publicationLibraryDownloadScope,
    selectedWorkId,
  ])

  const onStartPublicationHeadingResize = useCallback((
    event: React.PointerEvent<HTMLButtonElement>,
    column: PublicationTableColumnKey,
  ) => {
    if (event.button !== 0) {
      return
    }
    event.preventDefault()
    event.stopPropagation()
    const visibleColumns = publicationTableColumnOrder.filter((key) => effectivePublicationTableColumns[key].visible)
    if (visibleColumns.length <= 1 || !visibleColumns.includes(column)) {
      return
    }
    const startWidths = visibleColumns.reduce<Partial<Record<PublicationTableColumnKey, number>>>((accumulator, key) => {
      accumulator[key] = Number(
        effectivePublicationTableColumns[key].width || PUBLICATION_TABLE_COLUMN_DEFAULTS[key].width,
      )
      return accumulator
    }, {})
    publicationTableResizeRef.current = {
      column,
      visibleColumns,
      startX: event.clientX,
      startWidths,
    }
    setPublicationTableResizingColumn(column)
  }, [effectivePublicationTableColumns, publicationTableColumnOrder])

  const onPublicationHeadingResizeHandleKeyDown = useCallback((
    event: React.KeyboardEvent<HTMLButtonElement>,
    column: PublicationTableColumnKey,
  ) => {
    if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') {
      return
    }
    event.preventDefault()
    event.stopPropagation()
    const deltaPx = event.key === 'ArrowLeft' ? -16 : 16
    const availableWidth = resolvePublicationTableAvailableWidth()
    setPublicationTableColumns((current) => {
      const visibleColumns = publicationTableColumnOrder.filter((key) => current[key].visible)
      if (visibleColumns.length <= 1 || !visibleColumns.includes(column)) {
        return current
      }
      const startWidths = visibleColumns.reduce<Partial<Record<PublicationTableColumnKey, number>>>((accumulator, key) => {
        accumulator[key] = Number(current[key].width || PUBLICATION_TABLE_COLUMN_DEFAULTS[key].width)
        return accumulator
      }, {})
      const resized = clampPublicationTableDistributedResize({
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
      return clampPublicationTableColumnsToAvailableWidth({
        columns: next,
        columnOrder: publicationTableColumnOrder,
        availableWidth,
      })
    })
  }, [publicationTableColumnOrder, resolvePublicationTableAvailableWidth])

  useEffect(() => {
    if (!publicationTableResizingColumn) {
      return
    }
    const onPointerMove = (event: PointerEvent) => {
      const resizeState = publicationTableResizeRef.current
      if (!resizeState) {
        return
      }
      const availableWidth = resolvePublicationTableAvailableWidth()
      const resized = clampPublicationTableDistributedResize({
        column: resizeState.column,
        visibleColumns: resizeState.visibleColumns,
        startWidths: resizeState.startWidths,
        deltaPx: event.clientX - resizeState.startX,
      })
      setPublicationTableColumns((current) => {
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
        return clampPublicationTableColumnsToAvailableWidth({
          columns: next,
          columnOrder: publicationTableColumnOrder,
          availableWidth,
        })
      })
    }
    const stopResize = () => {
      publicationTableResizeRef.current = null
      setPublicationTableResizingColumn(null)
    }
    window.addEventListener('pointermove', onPointerMove)
    window.addEventListener('pointerup', stopResize)
    window.addEventListener('pointercancel', stopResize)
    return () => {
      window.removeEventListener('pointermove', onPointerMove)
      window.removeEventListener('pointerup', stopResize)
      window.removeEventListener('pointercancel', stopResize)
    }
  }, [publicationTableColumnOrder, publicationTableResizingColumn, resolvePublicationTableAvailableWidth])

  const activePaneError = selectedWorkId
    ? paneErrorByKey[publicationPaneKey(selectedWorkId, activeDetailTab)] || ''
    : ''
  const detailYear = selectedDetail?.year ?? selectedWork?.year ?? null
  const detailJournal = selectedDetail?.journal || formatJournalName(selectedWork?.venue_name || '')
  const detailPublicationType = selectedDetail?.publication_type || (selectedWork ? derivePublicationTypeLabel(selectedWork) : 'Not available')
  const detailArticleType = selectedDetail?.article_type || (selectedWork ? deriveArticleTypeLabel(selectedWork) : 'n/a')
  const detailCitations = selectedDetail?.citations_total ?? (selectedWork ? Number(metricsByWorkId.get(selectedWork.id)?.citations || 0) : 0)
  const detailDoi = selectedDetail?.doi || selectedWork?.doi || null
  const detailPmid = selectedDetail?.pmid || selectedWork?.pmid || null
  const detailAbstract = selectedDetail?.abstract || selectedWork?.abstract || ''
  const structuredAbstractSource = String(selectedDetail?.structured_abstract?.source_abstract || '').trim()
  const effectiveDetailAbstract = detailAbstract || structuredAbstractSource
  const structuredAbstractKeywords = Array.isArray(selectedDetail?.structured_abstract?.keywords)
    ? selectedDetail?.structured_abstract?.keywords
    : []
  const detailKeywords = Array.isArray(selectedDetail?.keywords_json) ? selectedDetail.keywords_json : []
  const abstractKeywordList = (structuredAbstractKeywords.length > 0 ? structuredAbstractKeywords : detailKeywords)
    .map((item) => String(item || '').trim())
    .filter((item, index, array) => item.length > 0 && array.findIndex((candidate) => candidate.toLowerCase() === item.toLowerCase()) === index)
  const abstractExpanded = selectedWorkId ? Boolean(expandedAbstractByWorkId[selectedWorkId]) : false
  const abstractPreview = abstractExpanded ? effectiveDetailAbstract : effectiveDetailAbstract.slice(0, 700)

  const onDetailTabChange = (tabValue: string) => {
    if (tabValue === 'overview' || tabValue === 'content' || tabValue === 'impact' || tabValue === 'files' || tabValue === 'ai') {
      setActiveDetailTab(tabValue)
    }
  }

  const openPublicationInDetailPanel = useCallback((workId: string, tab: PublicationDetailTab = activeDetailTab) => {
    const normalizedWorkId = String(workId || '').trim()
    if (!normalizedWorkId) {
      return
    }
    if (tab === 'files') {
      void loadPublicationFilesData(normalizedWorkId)
    }
    setSelectedWorkId(normalizedWorkId)
    setActiveDetailTab(tab)
  }, [activeDetailTab, loadPublicationFilesData])

  const onToggleAbstractExpanded = () => {
    if (!selectedWorkId) {
      return
    }
    setExpandedAbstractByWorkId((current) => ({
      ...current,
      [selectedWorkId]: !current[selectedWorkId],
    }))
  }

  const refreshFilesTab = async (workId: string) => {
    await loadPublicationFilesData(workId, true)
  }

  const onUploadFiles = async (files: FileList | null) => {
    if (!token || !selectedWorkId || !files || files.length === 0) {
      return
    }
    setUploadingFile(true)
    setPaneError(selectedWorkId, 'files', '')
    try {
      const uploadedFiles: PublicationFilePayload[] = []
      for (const file of Array.from(files)) {
        const uploaded = await uploadPublicationFile(token, selectedWorkId, file)
        uploadedFiles.push(uploaded)
      }
      if (uploadedFiles.length > 0) {
        setFilesCacheByWorkId((current) => {
          const existing = current[selectedWorkId]?.items || []
          const existingById = new Map(existing.map((item) => [item.id, item]))
          for (const uploaded of uploadedFiles) {
            existingById.set(uploaded.id, uploaded)
          }
          const nextItems = Array.from(existingById.values()).sort(
            (left, right) => Date.parse(String(right.created_at || '')) - Date.parse(String(left.created_at || '')),
          )
          return {
            ...current,
            [selectedWorkId]: {
              items: nextItems,
            },
          }
        })
        const preferred = uploadedFiles.find((item) => item.source === 'OA_LINK') || uploadedFiles[0]
        setOaPdfStatusByWorkId((current) => ({
          ...current,
          [selectedWorkId]: {
            status: 'available',
            downloadUrl: preferred.download_url || preferred.oa_url || null,
            fileName: preferred.file_name || null,
            updatedAt: new Date().toISOString(),
          },
        }))
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
      const remainingFiles = selectedFiles.filter((file) => file.id !== fileId)
      setFilesCacheByWorkId((current) => ({
        ...current,
        [selectedWorkId]: {
          items: remainingFiles,
        },
      }))
      if (remainingFiles.length > 0) {
        const preferred = remainingFiles.find((file) => file.source === 'OA_LINK') || remainingFiles[0]
        setOaPdfStatusByWorkId((current) => ({
          ...current,
          [selectedWorkId]: {
            status: 'available',
            downloadUrl: preferred.download_url || preferred.oa_url || null,
            fileName: preferred.file_name || null,
            updatedAt: new Date().toISOString(),
          },
        }))
      } else {
        setOaPdfStatusByWorkId((current) => ({
          ...current,
          [selectedWorkId]: {
            status: 'missing',
            downloadUrl: null,
            fileName: null,
            updatedAt: new Date().toISOString(),
          },
        }))
      }
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

  const publicationFileShareContext = (file: PublicationFilePayload): { label: string; url: string | null; body: string } => {
    const label = 'OA Manuscript Download'
    const publicationTitle = (selectedDetail?.title || selectedWork?.title || 'Publication').trim()
    const directUrl = String(file.download_url || file.oa_url || '').trim() || null
    const body = directUrl
      ? `Publication: ${publicationTitle}\nFile: ${label}\nDownload: ${directUrl}`
      : `Publication: ${publicationTitle}\nFile: ${label}\nOpen Publications > Files in Axiomos to access this file.`
    return { label, url: directUrl, body }
  }

  const onSharePublicationFileEmail = (file: PublicationFilePayload, recipientEmail = '') => {
    const context = publicationFileShareContext(file)
    const subject = encodeURIComponent(`${context.label} | ${selectedDetail?.title || selectedWork?.title || 'Publication'}`)
    const mailto = `mailto:${encodeURIComponent(recipientEmail)}?subject=${subject}&body=${encodeURIComponent(context.body)}`
    window.location.href = mailto
  }

  const onSharePublicationFileWithUser = (file: PublicationFilePayload) => {
    const recipient = (window.prompt('Enter collaborator email') || '').trim()
    if (!recipient) {
      return
    }
    onSharePublicationFileEmail(file, recipient)
  }

  return (
    <section data-house-role="page">
      <header
        data-house-role="page-header"
        className={cn(HOUSE_PAGE_HEADER_CLASS, 'house-main-title-block', HOUSE_LEFT_BORDER_CLASS, HOUSE_LEFT_BORDER_PROFILE_CLASS)}
      >
        <h1 data-house-role="page-title" className={HOUSE_PAGE_TITLE_CLASS}>Publications</h1>
        <p data-house-role="page-title-expander" className={houseTypography.titleExpander}>
          Track your research metrics and manage your publication library.
        </p>
      </header>

      <div className={cn(HOUSE_SECTION_ANCHOR_CLASS, 'house-main-content-block')}>
        <PublicationsTopStrip
          metrics={topMetricsResponse}
          loading={
            !topMetricsResponse
            || (topMetricsResponse.status === 'RUNNING' && (topMetricsResponse.tiles || []).length === 0)
          }
          token={token || null}
          forceInsightsVisible={Boolean(fixture?.forceInsightsVisible)}
          onOpenPublication={(workId) => {
            openPublicationInDetailPanel(workId, 'files')
          }}
        />
      </div>

      <div className={cn(HOUSE_SECTION_ANCHOR_CLASS, 'house-main-content-block')}>
        <div className="house-main-heading-block">
          <h2 className={publicationsHouseHeadings.sectionTitle}>Publication library</h2>
          <div className="ml-auto flex h-8 w-[25rem] shrink-0 items-center justify-end gap-1 overflow-visible">
            <div
              className={cn(
                'relative order-3 overflow-visible transition-[max-width,opacity,transform] duration-200 ease-out',
                publicationLibraryVisible && publicationLibraryToolsOpen
                  ? 'z-[70] max-w-[20rem] translate-x-0 opacity-100'
                  : 'pointer-events-none z-0 max-w-0 translate-x-1 opacity-0',
              )}
              aria-hidden={!publicationLibraryVisible || !publicationLibraryToolsOpen}
            >
              <div className="flex min-w-0 flex-nowrap items-center gap-1 whitespace-nowrap">
                <div className="group relative inline-flex">
                  <button
                    type="button"
                    className="house-section-tool-button house-publications-toolbox-item h-8 w-8 inline-flex items-center justify-center"
                    aria-label="Generate publication library report"
                  >
                    <FileText className="h-4 w-4" strokeWidth={2.1} />
                  </button>
                  <span
                    className="house-drilldown-chart-tooltip pointer-events-none absolute left-1/2 top-auto bottom-full mb-[0.35rem] z-[999] -translate-x-1/2 whitespace-nowrap px-2 py-0.5 text-caption leading-none transition-all duration-150 ease-out opacity-0 group-hover:opacity-100 group-focus-within:opacity-100"
                    aria-hidden="true"
                  >
                    Generate report
                  </span>
                </div>
                <div className="house-publications-toolbox-divider" aria-hidden="true" />
                <div className="group relative inline-flex">
                  <button
                    ref={publicationLibraryDownloadButtonRef}
                    type="button"
                    data-state={publicationLibraryDownloadVisible ? 'open' : 'closed'}
                    className={cn(
                      'house-section-tool-button house-publications-toolbox-item h-8 w-8 inline-flex items-center justify-center',
                      publicationLibraryDownloadVisible && 'house-publications-tools-toggle-open',
                    )}
                    onClick={() => {
                      setPublicationLibraryDownloadVisible((current) => {
                        const nextVisible = !current
                        if (nextVisible) {
                          setPublicationLibrarySearchVisible(false)
                          setPublicationLibraryFiltersVisible(false)
                          setPublicationLibrarySettingsVisible(false)
                        }
                        return nextVisible
                      })
                    }}
                    aria-label={publicationLibraryDownloadVisible ? 'Hide publication library download options' : 'Show publication library download options'}
                    aria-expanded={publicationLibraryDownloadVisible}
                  >
                    <Download className="h-4 w-4" strokeWidth={2.1} />
                  </button>
                  {publicationLibraryDownloadVisible ? (
                    <div
                      ref={publicationLibraryDownloadPopoverRef}
                      className="house-publications-filter-popover absolute right-[calc(100%+0.5rem)] top-0 z-40 w-[20.5rem]"
                    >
                      <div className="house-publications-filter-header">
                        <p className="house-publications-filter-title">Download library</p>
                        <button
                          type="button"
                          className="house-publications-filter-clear"
                          onClick={() => {
                            setPublicationLibraryDownloadFields(createDefaultPublicationExportFieldSelection())
                            setPublicationLibraryDownloadScope('filtered_results')
                            setPublicationLibraryDownloadFormat('xlsx')
                          }}
                        >
                          Reset
                        </button>
                      </div>
                      <details className="house-publications-filter-group" open>
                        <summary className="house-publications-filter-summary">
                          <span>Format</span>
                          <span className="house-publications-filter-count">
                            {PUBLICATION_EXPORT_FORMAT_OPTIONS.find((option) => option.value === publicationLibraryDownloadFormat)?.extension?.toUpperCase() || ''}
                          </span>
                        </summary>
                        <div className="house-publications-filter-options">
                          {PUBLICATION_EXPORT_FORMAT_OPTIONS.map((option) => (
                            <label key={`publication-download-format-${option.value}`} className="house-publications-filter-option">
                              <input
                                type="radio"
                                name="publication-library-download-format"
                                className="house-publications-filter-checkbox"
                                checked={publicationLibraryDownloadFormat === option.value}
                                onChange={() => setPublicationLibraryDownloadFormat(option.value)}
                              />
                              <span className="house-publications-filter-option-label">{option.label}</span>
                            </label>
                          ))}
                        </div>
                      </details>
                      <details className="house-publications-filter-group" open>
                        <summary className="house-publications-filter-summary">
                          <span>Scope</span>
                          <span className="house-publications-filter-count">
                            {publicationLibraryDownloadScope === 'whole_library'
                              ? 'Library'
                              : publicationLibraryDownloadScope === 'filtered_results'
                                ? 'Filtered'
                                : publicationLibraryDownloadScope === 'current_page'
                                  ? 'Page'
                                  : 'Selected'}
                          </span>
                        </summary>
                        <div className="house-publications-filter-options">
                          {PUBLICATION_EXPORT_SCOPE_OPTIONS.map((option) => {
                            const disabled = option.value === 'selected_rows' && !selectedWorkId
                            return (
                              <label
                                key={`publication-download-scope-${option.value}`}
                                className={cn('house-publications-filter-option', disabled && 'opacity-60')}
                              >
                                <input
                                  type="radio"
                                  name="publication-library-download-scope"
                                  className="house-publications-filter-checkbox"
                                  checked={publicationLibraryDownloadScope === option.value}
                                  disabled={disabled}
                                  onChange={() => setPublicationLibraryDownloadScope(option.value)}
                                />
                                <span className="house-publications-filter-option-label">{option.label}</span>
                              </label>
                            )
                          })}
                        </div>
                      </details>
                      <details className="house-publications-filter-group" open>
                        <summary className="house-publications-filter-summary">
                          <span>Include fields</span>
                          <span className="house-publications-filter-count">
                            {Object.values(publicationLibraryDownloadFields).filter(Boolean).length}/{PUBLICATION_EXPORT_FIELD_OPTIONS.length}
                          </span>
                        </summary>
                        <div className="house-publications-filter-options">
                          {PUBLICATION_EXPORT_FIELD_OPTIONS.map((option) => {
                            const enabledCount = Object.values(publicationLibraryDownloadFields).filter(Boolean).length
                            const checked = publicationLibraryDownloadFields[option.key]
                            const disabled = checked && enabledCount <= 1
                            return (
                              <label
                                key={`publication-download-field-${option.key}`}
                                className={cn('house-publications-filter-option', disabled && 'opacity-60')}
                              >
                                <input
                                  type="checkbox"
                                  className="house-publications-filter-checkbox"
                                  checked={checked}
                                  disabled={disabled}
                                  onChange={() => {
                                    setPublicationLibraryDownloadFields((current) => ({
                                      ...current,
                                      [option.key]: !current[option.key],
                                    }))
                                  }}
                                />
                                <span className="house-publications-filter-option-label">{option.label}</span>
                              </label>
                            )
                          })}
                        </div>
                      </details>
                      <div className="mt-2 flex items-center justify-end">
                        <button
                          type="button"
                          className="house-section-tool-button inline-flex h-8 items-center justify-center px-2.5 text-[0.69rem] font-semibold uppercase tracking-[0.07em]"
                          onClick={onDownloadPublicationLibrary}
                        >
                          Download
                        </button>
                      </div>
                    </div>
                  ) : null}
                  <span
                    className="house-drilldown-chart-tooltip pointer-events-none absolute left-1/2 top-auto bottom-full mb-[0.35rem] z-[999] -translate-x-1/2 whitespace-nowrap px-2 py-0.5 text-caption leading-none transition-all duration-150 ease-out opacity-0 group-hover:opacity-100 group-focus-within:opacity-100"
                    aria-hidden="true"
                  >
                    Download
                  </span>
                </div>
                <div className="house-publications-toolbox-divider" aria-hidden="true" />
                <div className="group relative inline-flex">
                  <button
                    type="button"
                    className="house-section-tool-button house-publications-toolbox-item h-8 w-8 inline-flex items-center justify-center"
                    aria-label="Share publication library"
                  >
                    <Share2 className="h-4 w-4" strokeWidth={2.1} />
                  </button>
                  <span
                    className="house-drilldown-chart-tooltip pointer-events-none absolute left-1/2 top-auto bottom-full mb-[0.35rem] z-[999] -translate-x-1/2 whitespace-nowrap px-2 py-0.5 text-caption leading-none transition-all duration-150 ease-out opacity-0 group-hover:opacity-100 group-focus-within:opacity-100"
                    aria-hidden="true"
                  >
                    Share
                  </span>
                </div>
              </div>
            </div>
            {publicationLibraryVisible ? (
              <div className="relative order-1 shrink-0">
                <button
                  ref={publicationLibrarySearchButtonRef}
                  type="button"
                  data-state={publicationLibrarySearchVisible ? 'open' : 'closed'}
                  className={cn(
                    'h-8 w-8 house-publications-action-icon house-publications-top-control house-publications-search-toggle house-section-tool-button inline-flex items-center justify-center transition-[background-color,border-color,box-shadow] duration-200 ease-out',
                    publicationLibrarySearchVisible && 'house-publications-tools-toggle-open',
                  )}
                  onClick={() => {
                    setPublicationLibrarySearchVisible((current) => {
                      const nextVisible = !current
                      if (nextVisible) {
                        setPublicationLibraryFiltersVisible(false)
                        setPublicationLibraryDownloadVisible(false)
                        setPublicationLibrarySettingsVisible(false)
                      }
                      return nextVisible
                    })
                  }}
                  aria-pressed={publicationLibrarySearchVisible}
                  aria-expanded={publicationLibrarySearchVisible}
                  aria-label={publicationLibrarySearchVisible ? 'Hide publication library search' : 'Show publication library search'}
                  title="Search"
                >
                  <Search className="house-publications-tools-toggle-icon house-publications-search-toggle-icon h-[1.09rem] w-[1.09rem]" strokeWidth={2.1} />
                </button>
                {publicationLibrarySearchVisible ? (
                  <div
                    ref={publicationLibrarySearchPopoverRef}
                    className="house-publications-search-popover absolute right-[calc(100%+0.5rem)] top-0 z-30 w-[22.5rem]"
                  >
                    <label className="house-publications-search-label" htmlFor="publication-library-search-input">
                      Search library
                    </label>
                    <input
                      id="publication-library-search-input"
                      type="text"
                      autoFocus
                      value={query}
                      onChange={(event) => setQuery(event.target.value)}
                      placeholder="Search by publication name, author, PMID, DOI, journal..."
                      className="house-publications-search-input"
                    />
                  </div>
                ) : null}
              </div>
            ) : null}
            {publicationLibraryVisible ? (
              <div className="relative order-2 shrink-0">
                <button
                  ref={publicationLibraryFilterButtonRef}
                  type="button"
                  data-state={publicationLibraryFiltersVisible ? 'open' : 'closed'}
                  data-filtered={selectedPublicationTypes.length > 0 || selectedArticleTypes.length > 0 ? 'true' : 'false'}
                  className={cn(
                    'h-8 w-8 house-publications-action-icon house-publications-top-control house-publications-filter-toggle house-section-tool-button inline-flex items-center justify-center transition-[background-color,border-color,box-shadow] duration-200 ease-out',
                    publicationLibraryFiltersVisible && 'house-publications-tools-toggle-open',
                  )}
                  onClick={() => {
                    setPublicationLibraryFiltersVisible((current) => {
                      const nextVisible = !current
                      if (nextVisible) {
                        setPublicationLibrarySearchVisible(false)
                        setPublicationLibraryDownloadVisible(false)
                        setPublicationLibrarySettingsVisible(false)
                      }
                      return nextVisible
                    })
                  }}
                  aria-pressed={publicationLibraryFiltersVisible}
                  aria-expanded={publicationLibraryFiltersVisible}
                  aria-label={publicationLibraryFiltersVisible ? 'Hide publication library filters' : 'Show publication library filters'}
                  title="Filters"
                >
                  <Filter className="house-publications-tools-toggle-icon house-publications-filter-toggle-icon h-[1.09rem] w-[1.09rem]" strokeWidth={2.1} />
                </button>
                {publicationLibraryFiltersVisible ? (
                  <div
                    ref={publicationLibraryFilterPopoverRef}
                    className="house-publications-filter-popover absolute right-[calc(100%+0.5rem)] top-0 z-30 w-[17.5rem]"
                  >
                    <div className="house-publications-filter-header">
                      <p className="house-publications-filter-title">Filter library</p>
                      <button
                        type="button"
                        className="house-publications-filter-clear"
                        onClick={() => {
                          setSelectedPublicationTypes([])
                          setSelectedArticleTypes([])
                        }}
                      >
                        Clear
                      </button>
                    </div>
                    <details className="house-publications-filter-group" open>
                      <summary className="house-publications-filter-summary">
                        <span>Publication type</span>
                        <span className="house-publications-filter-count">
                          {selectedPublicationTypes.length > 0 ? selectedPublicationTypes.length : 'All'}
                        </span>
                      </summary>
                      <div className="house-publications-filter-options">
                        {publicationTypeFilterOptions.length > 0 ? (
                          publicationTypeFilterOptions.map((value) => (
                            <label key={`publication-filter-${value}`} className="house-publications-filter-option">
                              <input
                                type="checkbox"
                                className="house-publications-filter-checkbox"
                                checked={selectedPublicationTypes.includes(value)}
                                onChange={() => {
                                  setSelectedPublicationTypes((current) =>
                                    current.includes(value) ? current.filter((entry) => entry !== value) : [...current, value],
                                  )
                                }}
                              />
                              <span className="house-publications-filter-option-label">{value}</span>
                            </label>
                          ))
                        ) : (
                          <p className="house-publications-filter-empty">No publication types available.</p>
                        )}
                      </div>
                    </details>
                    <details className="house-publications-filter-group" open>
                      <summary className="house-publications-filter-summary">
                        <span>Article type</span>
                        <span className="house-publications-filter-count">
                          {selectedArticleTypes.length > 0 ? selectedArticleTypes.length : 'All'}
                        </span>
                      </summary>
                      <div className="house-publications-filter-options">
                        {articleTypeFilterOptions.length > 0 ? (
                          articleTypeFilterOptions.map((value) => (
                            <label key={`article-filter-${value}`} className="house-publications-filter-option">
                              <input
                                type="checkbox"
                                className="house-publications-filter-checkbox"
                                checked={selectedArticleTypes.includes(value)}
                                onChange={() => {
                                  setSelectedArticleTypes((current) =>
                                    current.includes(value) ? current.filter((entry) => entry !== value) : [...current, value],
                                  )
                                }}
                              />
                              <span className="house-publications-filter-option-label">{value}</span>
                            </label>
                          ))
                        ) : (
                          <p className="house-publications-filter-empty">No article types available.</p>
                        )}
                      </div>
                    </details>
                  </div>
                ) : null}
              </div>
            ) : null}
            {publicationLibraryVisible ? (
              <button
                type="button"
                data-state={publicationLibraryToolsOpen ? 'open' : 'closed'}
                className={cn(
                  'order-4 h-8 w-8 shrink-0 house-publications-action-icon house-publications-top-control house-section-tool-button inline-flex items-center justify-center transition-[background-color,border-color,box-shadow] duration-200 ease-out',
                  publicationLibraryToolsOpen && 'house-publications-tools-toggle-open',
                )}
                onClick={() => {
                  setPublicationLibraryToolsOpen((current) => {
                    const nextOpen = !current
                    if (!nextOpen) {
                      setPublicationLibraryDownloadVisible(false)
                    }
                    return nextOpen
                  })
                }}
                aria-pressed={publicationLibraryToolsOpen}
                aria-expanded={publicationLibraryToolsOpen}
                aria-label={publicationLibraryToolsOpen ? 'Hide publication library tools' : 'Show publication library tools'}
                title="Tools"
              >
                <Hammer className="house-publications-tools-toggle-icon h-[1.09rem] w-[1.09rem]" strokeWidth={2.1} />
              </button>
            ) : null}
            {publicationLibraryVisible ? (
              <div className="relative order-5 shrink-0">
                <button
                  ref={publicationLibrarySettingsButtonRef}
                  type="button"
                  data-state={publicationLibrarySettingsVisible ? 'open' : 'closed'}
                  className={cn(
                    'h-8 w-8 house-publications-action-icon house-publications-top-control house-publications-settings-toggle house-section-tool-button inline-flex items-center justify-center transition-[background-color,border-color,box-shadow] duration-200 ease-out',
                    publicationLibrarySettingsVisible && 'house-publications-tools-toggle-open',
                  )}
                  onClick={() => {
                    setPublicationLibrarySettingsVisible((current) => {
                      const nextVisible = !current
                      if (nextVisible) {
                        setPublicationLibraryFiltersVisible(false)
                        setPublicationLibrarySearchVisible(false)
                        setPublicationLibraryDownloadVisible(false)
                      }
                      return nextVisible
                    })
                  }}
                  aria-pressed={publicationLibrarySettingsVisible}
                  aria-expanded={publicationLibrarySettingsVisible}
                  aria-label={publicationLibrarySettingsVisible ? 'Hide publication library settings' : 'Show publication library settings'}
                  title="Settings"
                >
                  <Settings className="house-publications-tools-toggle-icon house-publications-settings-toggle-icon h-[1.09rem] w-[1.09rem]" strokeWidth={2.1} />
                </button>
                {publicationLibrarySettingsVisible ? (
                  <div
                    ref={publicationLibrarySettingsPopoverRef}
                    className="house-publications-filter-popover absolute right-[calc(100%+0.5rem)] top-0 z-30 w-[18.75rem]"
                  >
                      <div className="house-publications-filter-header">
                        <p className="house-publications-filter-title">Table settings</p>
                        <div className="inline-flex items-center gap-2">
                          <button type="button" className="house-publications-filter-clear" onClick={onAutoAdjustPublicationTableWidths}>
                            Auto fit
                          </button>
                          <button type="button" className="house-publications-filter-clear" onClick={onResetPublicationTableSettings}>
                            Reset
                          </button>
                      </div>
                    </div>
                    <details className="house-publications-filter-group" open>
                      <summary className="house-publications-filter-summary">
                        <span>Columns</span>
                        <span className="house-publications-filter-count">
                          {visiblePublicationTableColumns.length}/{PUBLICATION_TABLE_COLUMN_ORDER.length}
                        </span>
                      </summary>
                      <div className="house-publications-filter-options">
                        {publicationTableColumnOrder.map((columnKey) => {
                          const checked = publicationTableColumns[columnKey].visible
                          const visibleCount = visiblePublicationTableColumns.length
                          const disableToggle = checked && visibleCount <= 1
                          const label = PUBLICATION_TABLE_COLUMN_DEFINITIONS[columnKey].label
                          return (
                            <label
                              key={`publication-column-visibility-${columnKey}`}
                              className={cn('house-publications-filter-option', disableToggle && 'opacity-60')}
                            >
                              <input
                                type="checkbox"
                                className="house-publications-filter-checkbox"
                                checked={checked}
                                disabled={disableToggle}
                                onChange={() => onTogglePublicationColumnVisibility(columnKey)}
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
                          {(publicationTableAlternateRowColoring ? 1 : 0) + (publicationTableMetricHighlights ? 1 : 0) + (publicationTableAttachmentStatusVisible ? 1 : 0)}/3
                        </span>
                      </summary>
                      <div className="house-publications-filter-options">
                        <label className="house-publications-filter-option">
                          <input
                            type="checkbox"
                            className="house-publications-filter-checkbox"
                            checked={publicationTableAlternateRowColoring}
                            onChange={() => setPublicationTableAlternateRowColoring((current) => !current)}
                          />
                          <span className="house-publications-filter-option-label">Alternate row shading</span>
                        </label>
                        <label className="house-publications-filter-option">
                          <input
                            type="checkbox"
                            className="house-publications-filter-checkbox"
                            checked={publicationTableMetricHighlights}
                            onChange={() => setPublicationTableMetricHighlights((current) => !current)}
                          />
                          <span className="house-publications-filter-option-label">Metric highlights (citations)</span>
                        </label>
                        <label className="house-publications-filter-option">
                          <input
                            type="checkbox"
                            className="house-publications-filter-checkbox"
                            checked={publicationTableAttachmentStatusVisible}
                            onChange={() => setPublicationTableAttachmentStatusVisible((current) => !current)}
                          />
                          <span className="house-publications-filter-option-label">Attachment status icon</span>
                        </label>
                      </div>
                    </details>
                    <details className="house-publications-filter-group" open>
                      <summary className="house-publications-filter-summary">
                        <span>Density</span>
                        <span className="house-publications-filter-count">
                          {publicationTableDensity === 'default' ? 'Default' : publicationTableDensity === 'compact' ? 'Compact' : 'Comfortable'}
                        </span>
                      </summary>
                      <div className="house-publications-filter-options">
                        {(['compact', 'default', 'comfortable'] as PublicationTableDensity[]).map((densityOption) => (
                          <label key={`publication-density-${densityOption}`} className="house-publications-filter-option">
                            <input
                              type="radio"
                              name="publication-table-density"
                              className="house-publications-filter-checkbox"
                              checked={publicationTableDensity === densityOption}
                              onChange={() => setPublicationTableDensity(densityOption)}
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
                          {publicationLibraryPageSize === 'all' ? 'All' : publicationLibraryPageSize}
                        </span>
                      </summary>
                      <div className="house-publications-filter-options">
                        {([25, 50, 100, 'all'] as PublicationTablePageSize[]).map((pageSizeOption) => (
                          <label key={`publication-page-size-${pageSizeOption}`} className="house-publications-filter-option">
                            <input
                              type="radio"
                              name="publication-table-page-size"
                              className="house-publications-filter-checkbox"
                              checked={publicationLibraryPageSize === pageSizeOption}
                              onChange={() => {
                                setPublicationLibraryPageSize(pageSizeOption)
                                setPublicationLibraryPage(1)
                              }}
                            />
                            <span className="house-publications-filter-option-label">
                              {pageSizeOption === 'all' ? 'All publications' : `${pageSizeOption} publications`}
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
              data-state={publicationLibraryVisible ? 'open' : 'closed'}
              className="order-6 h-8 w-8 shrink-0 house-publications-action-icon house-publications-top-control house-publications-eye-toggle house-section-tool-button inline-flex items-center justify-center"
              onClick={() => {
                setPublicationLibraryVisible((current) => {
                  const nextVisible = !current
                  if (!nextVisible) {
                    setPublicationLibraryToolsOpen(false)
                    setPublicationLibraryFiltersVisible(false)
                    setPublicationLibrarySearchVisible(false)
                    setPublicationLibraryDownloadVisible(false)
                    setPublicationLibrarySettingsVisible(false)
                  }
                  return nextVisible
                })
              }}
              aria-pressed={publicationLibraryVisible}
              aria-label={publicationLibraryVisible ? 'Set publication library not visible' : 'Set publication library visible'}
            >
              {publicationLibraryVisible ? (
                <Eye className="house-publications-eye-toggle-icon h-[1.2rem] w-[1.2rem]" strokeWidth={2.1} />
              ) : (
                <EyeOff className="house-publications-eye-toggle-icon h-[1.2rem] w-[1.2rem]" strokeWidth={2.1} />
              )}
            </button>
          </div>
        </div>
        {publicationLibraryVisible ? (
          <div className="house-main-content-block space-y-1">
          <div className="grid grid-cols-1 items-start gap-4">
            <div className="space-y-1">

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
                <div ref={publicationTableLayoutRef} className={cn('relative w-full house-table-context-profile', HOUSE_TABLE_SHELL_CLASS)}>
                  <Table
                    striped={publicationTableAlternateRowColoring}
                    className={cn(
                      'w-full table-fixed house-table-resizable',
                      publicationTableDensity === 'compact' && 'house-publications-table-density-compact',
                      publicationTableDensity === 'comfortable' && 'house-publications-table-density-comfortable',
                    )}
                    data-house-no-column-resize="true"
                    data-house-no-column-controls="true"
                  >
                    <colgroup>
                      {visiblePublicationTableColumns.map((columnKey) => {
                        const width = effectivePublicationTableColumns[columnKey].width
                        return (
                          <col
                            key={`table-col-${columnKey}`}
                            style={{
                              width: `${width}px`,
                              minWidth: `${width}px`,
                            }}
                          />
                        )
                      })}
                    </colgroup>
                    <TableHeader className="house-table-head text-left">
                      <TableRow style={{ backgroundColor: 'transparent' }}>
                        {visiblePublicationTableColumns.map((columnKey, columnIndex) => {
                          const definition = PUBLICATION_TABLE_COLUMN_DEFINITIONS[columnKey]
                          const isLastVisibleColumn = columnIndex >= visiblePublicationTableColumns.length - 1
                          return (
                            <TableHead
                              key={`table-head-${columnKey}`}
                              className={`${HOUSE_TABLE_HEAD_TEXT_CLASS} group relative text-left`}
                              onDragOver={(event) => {
                                if (!publicationTableDraggingColumn || publicationTableDraggingColumn === columnKey) {
                                  return
                                }
                                event.preventDefault()
                              }}
                              onDrop={(event) => {
                                event.preventDefault()
                                if (!publicationTableDraggingColumn || publicationTableDraggingColumn === columnKey) {
                                  return
                                }
                                onReorderPublicationColumn(publicationTableDraggingColumn, columnKey)
                                setPublicationTableDraggingColumn(null)
                              }}
                            >
                              <SortHeader
                                label={definition.label}
                                column={definition.sortField}
                                sortField={sortField}
                                sortDirection={sortDirection}
                                align="left"
                                onSort={onSortColumn}
                              />
                              <button
                                type="button"
                                draggable
                                className="house-table-reorder-handle"
                                data-house-dragging={publicationTableDraggingColumn === columnKey ? 'true' : undefined}
                                onDragStart={(event) => {
                                  event.dataTransfer.effectAllowed = 'move'
                                  event.dataTransfer.setData('text/plain', columnKey)
                                  setPublicationTableDraggingColumn(columnKey)
                                }}
                                onDragEnd={() => {
                                  setPublicationTableDraggingColumn(null)
                                }}
                                onClick={(event) => {
                                  event.preventDefault()
                                  event.stopPropagation()
                                }}
                                aria-label={`Reorder ${definition.label} column`}
                                title={`Drag to reorder ${definition.label}`}
                              >
                                <GripVertical className="h-3 w-3" />
                              </button>
                              {!isLastVisibleColumn ? (
                                <button
                                  type="button"
                                  className="house-table-resize-handle"
                                  data-house-dragging={publicationTableResizingColumn === columnKey ? 'true' : undefined}
                                  onPointerDown={(event) => onStartPublicationHeadingResize(event, columnKey)}
                                  onKeyDown={(event) => onPublicationHeadingResizeHandleKeyDown(event, columnKey)}
                                  onClick={(event) => {
                                    event.preventDefault()
                                    event.stopPropagation()
                                  }}
                                  aria-label={`Resize ${definition.label} column`}
                                  title={`Resize ${definition.label} column`}
                                />
                              ) : null}
                            </TableHead>
                          )
                        })}
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {pagedFilteredWorks.map((work) => {
                        const metrics = metricsByWorkId.get(work.id)
                        const isSelected = selectedWorkId === work.id
                        const oaRecord = oaPdfStatusByWorkId[work.id] || null
                        const hasDoi = Boolean((work.doi || '').trim())
                        const oaVisualStatus = publicationOaStatusVisualStatus(work, oaRecord)
                        const oaToneClass = publicationOaStatusToneClass(oaVisualStatus)
                        const oaLabel = publicationOaStatusLabel(oaVisualStatus, hasDoi)
                        const oaDownloadUrl = oaRecord?.downloadUrl || null
                        return (
                          <TableRow
                            key={work.id}
                            onClick={() => openPublicationInDetailPanel(work.id, activeDetailTab)}
                            className={`cursor-pointer ${isSelected ? 'bg-emerald-50/70' : 'hover:bg-accent/30'}`}
                          >
                            {visiblePublicationTableColumns.map((columnKey) => {
                              const preference = publicationTableColumns[columnKey]
                              const alignClass = publicationTableColumnAlignClass(preference.align)
                              if (columnKey === 'title') {
                                return (
                                  <TableCell key={`${work.id}-${columnKey}`} className={`align-top font-medium ${HOUSE_TABLE_CELL_TEXT_CLASS} ${alignClass}`}>
                                    <div className={cn('grid items-start gap-1.5', publicationTableAttachmentStatusVisible ? 'grid-cols-[auto_minmax(0,1fr)]' : 'grid-cols-1')}>
                                      {publicationTableAttachmentStatusVisible ? (
                                        oaVisualStatus === 'available' && oaDownloadUrl ? (
                                          <button
                                            type="button"
                                            title={`${oaLabel}. Open in Files panel.`}
                                            className={`inline-flex items-center ${oaToneClass}`}
                                            onClick={(event) => {
                                              event.stopPropagation()
                                              openPublicationInDetailPanel(work.id, 'files')
                                            }}
                                          >
                                            <Paperclip className="h-3.5 w-3.5" />
                                          </button>
                                        ) : (
                                          <span title={oaLabel} className={`inline-flex items-center ${oaToneClass}`}>
                                            {oaVisualStatus === 'checking' ? (
                                              <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                            ) : (
                                              <Paperclip className="h-3.5 w-3.5" />
                                            )}
                                          </span>
                                        )
                                      ) : null}
                                      <span className="min-w-0 whitespace-normal break-words leading-tight">{work.title}</span>
                                    </div>
                                  </TableCell>
                                )
                              }
                              if (columnKey === 'year') {
                                return (
                                  <TableCell key={`${work.id}-${columnKey}`} className={`align-top font-semibold whitespace-normal break-words leading-tight ${HOUSE_TABLE_CELL_TEXT_CLASS} ${alignClass}`}>
                                    {work.year ?? 'n/a'}
                                  </TableCell>
                                )
                              }
                              if (columnKey === 'venue') {
                                return (
                                  <TableCell key={`${work.id}-${columnKey}`} className={`align-top font-medium whitespace-normal break-words leading-tight ${HOUSE_TABLE_CELL_TEXT_CLASS} ${alignClass}`}>
                                    {formatJournalName(work.venue_name) || 'n/a'}
                                  </TableCell>
                                )
                              }
                              if (columnKey === 'work_type') {
                                return (
                                  <TableCell key={`${work.id}-${columnKey}`} className={`align-top whitespace-normal break-words leading-tight ${HOUSE_TABLE_CELL_TEXT_CLASS} ${alignClass}`}>
                                    {derivePublicationTypeLabel(work)}
                                  </TableCell>
                                )
                              }
                              if (columnKey === 'article_type') {
                                return (
                                  <TableCell key={`${work.id}-${columnKey}`} className={`align-top whitespace-normal break-words leading-tight ${HOUSE_TABLE_CELL_TEXT_CLASS} ${alignClass}`}>
                                    {deriveArticleTypeLabel(work)}
                                  </TableCell>
                                )
                              }
                              return (
                                <TableCell
                                  key={`${work.id}-${columnKey}`}
                                  className={cn(
                                    `align-top whitespace-normal break-words leading-tight ${HOUSE_TABLE_CELL_TEXT_CLASS} ${alignClass} transition-colors`,
                                    publicationTableMetricHighlights
                                      ? citationCellTone(metrics?.citations ?? 0, hIndex)
                                      : 'text-[hsl(var(--tone-neutral-750))]',
                                  )}
                                >
                                  {metrics?.citations ?? 0}
                                </TableCell>
                              )
                            })}
                          </TableRow>
                        )
                      })}
                    </TableBody>
                  </Table>
                  <div className="mt-1 flex items-center justify-between gap-2 px-1">
                    <p className="text-[0.68rem] font-semibold uppercase tracking-[0.06em] text-[hsl(var(--tone-neutral-650))]">
                      Showing {publicationLibraryRangeStart}-{publicationLibraryRangeEnd} of {totalFilteredPublicationWorks}
                    </p>
                    {publicationLibraryPageSize === 'all' ? null : (
                      <div className="inline-flex items-center gap-1">
                        <button
                          type="button"
                          className={cn(
                            'house-section-tool-button inline-flex h-7 items-center justify-center px-2 text-[0.68rem] font-semibold uppercase tracking-[0.06em]',
                            publicationLibraryPage <= 1 && 'pointer-events-none opacity-50',
                          )}
                          onClick={() => {
                            setPublicationLibraryPage((current) => Math.max(1, current - 1))
                          }}
                          aria-label="Go to previous page"
                        >
                          Prev
                        </button>
                        <span className="min-w-[4.2rem] text-center text-[0.68rem] font-semibold uppercase tracking-[0.06em] text-[hsl(var(--tone-neutral-700))]">
                          {publicationLibraryPage}/{publicationLibraryTotalPages}
                        </span>
                        <button
                          type="button"
                          className={cn(
                            'house-section-tool-button inline-flex h-7 items-center justify-center px-2 text-[0.68rem] font-semibold uppercase tracking-[0.06em]',
                            publicationLibraryPage >= publicationLibraryTotalPages && 'pointer-events-none opacity-50',
                          )}
                          onClick={() => {
                            setPublicationLibraryPage((current) => Math.min(publicationLibraryTotalPages, current + 1))
                          }}
                          aria-label="Go to next page"
                        >
                          Next
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>

            <Sheet
              open={Boolean(selectedWork)}
              onOpenChange={(open) => {
                if (!open) {
                  setSelectedWorkId(null)
                }
              }}
            >
              <SheetContent side="right" className={HOUSE_PUBLICATION_DRILLDOWN_SHEET_CLASS}>
                {selectedWork ? (
                  <div className={cn(HOUSE_PUBLICATION_DRILLDOWN_SHEET_BODY_CLASS, 'house-drilldown-panel-no-pad')}>
                    <Tabs value={activeDetailTab} onValueChange={onDetailTabChange} className="w-full">
                      <div className="house-drilldown-flow-shell max-h-[78vh] overflow-auto">
                        <HouseDrilldownHeaderShell
                          title={(
                            <p className="house-drilldown-title">
                              {selectedDetail?.title || selectedWork.title}
                            </p>
                          )}
                          subtitle={(
                            <p className="house-drilldown-title-expander">
                              {[detailJournal || 'Publication record', detailYear ? String(detailYear) : null].filter(Boolean).join(' | ')}
                            </p>
                          )}
                          titleBlockClassName={cn(HOUSE_LEFT_BORDER_CLASS, HOUSE_LEFT_BORDER_PROFILE_CLASS)}
                          dividerClassName={HOUSE_PUBLICATION_DRILLDOWN_DIVIDER_TOP_CLASS}
                          navAriaLabel="Publication drilldown sections"
                          tabs={PUBLICATION_DETAIL_TABS}
                          activeTab={activeDetailTab}
                          onTabChange={(tabId) => onDetailTabChange(tabId as PublicationDetailTab)}
                          panelIdPrefix="publication-drilldown-panel-"
                          tabIdPrefix="publication-drilldown-tab-"
                          tabFlexGrow={drilldownTabFlexGrow}
                        />

                        <div className="house-drilldown-content-block house-drilldown-tab-panel">
                        {activePaneError ? (
                          <p className={HOUSE_PUBLICATION_DRILLDOWN_ALERT_CLASS}>{activePaneError}</p>
                        ) : null}

                        <TabsContent value="overview" className="mt-0" role="tabpanel" id="publication-drilldown-panel-overview" aria-labelledby="publication-drilldown-tab-overview">
                          <div className="house-drilldown-heading-block">
                            <p className="house-drilldown-heading-block-title">Publication overview</p>
                          </div>
                          <div className="house-drilldown-content-block house-drilldown-summary-stats-grid" style={{ gridTemplateColumns: 'repeat(2, minmax(0, 1fr))' }}>
                            <div className="house-drilldown-summary-stat-card-small house-publication-overview-stat-card">
                              <p className={cn(HOUSE_PUBLICATION_DRILLDOWN_SUMMARY_STAT_TITLE_CLASS, 'house-drilldown-stat-title house-publication-overview-stat-title')}>Year</p>
                              <div className={cn(HOUSE_PUBLICATION_DRILLDOWN_SUMMARY_STAT_VALUE_WRAP_CLASS, 'house-publication-overview-stat-value-wrap')}>
                                <p className={cn(HOUSE_PUBLICATION_DRILLDOWN_SUMMARY_STAT_VALUE_CLASS, 'house-publication-overview-stat-value')}>{detailYear ?? 'n/a'}</p>
                              </div>
                            </div>
                            <div className="house-drilldown-summary-stat-card-small house-publication-overview-stat-card">
                              <p className={cn(HOUSE_PUBLICATION_DRILLDOWN_SUMMARY_STAT_TITLE_CLASS, 'house-drilldown-stat-title house-publication-overview-stat-title')}>Journal</p>
                              <div className={cn(HOUSE_PUBLICATION_DRILLDOWN_SUMMARY_STAT_VALUE_WRAP_CLASS, 'house-publication-overview-stat-value-wrap')}>
                                <p className={cn(HOUSE_PUBLICATION_DRILLDOWN_SUMMARY_STAT_VALUE_CLASS, 'house-publication-overview-stat-value')}>{detailJournal || 'Not available'}</p>
                              </div>
                            </div>
                            <div className="house-drilldown-summary-stat-card-small house-publication-overview-stat-card">
                              <p className={cn(HOUSE_PUBLICATION_DRILLDOWN_SUMMARY_STAT_TITLE_CLASS, 'house-drilldown-stat-title house-publication-overview-stat-title')}>Type</p>
                              <div className={cn(HOUSE_PUBLICATION_DRILLDOWN_SUMMARY_STAT_VALUE_WRAP_CLASS, 'house-publication-overview-stat-value-wrap')}>
                                <p className={cn(HOUSE_PUBLICATION_DRILLDOWN_SUMMARY_STAT_VALUE_CLASS, 'house-publication-overview-stat-value')}>{detailPublicationType || 'Not available'}</p>
                              </div>
                            </div>
                            <div className="house-drilldown-summary-stat-card-small house-publication-overview-stat-card">
                              <p className={cn(HOUSE_PUBLICATION_DRILLDOWN_SUMMARY_STAT_TITLE_CLASS, 'house-drilldown-stat-title house-publication-overview-stat-title')}>Article type</p>
                              <div className={cn(HOUSE_PUBLICATION_DRILLDOWN_SUMMARY_STAT_VALUE_WRAP_CLASS, 'house-publication-overview-stat-value-wrap')}>
                                <p className={cn(HOUSE_PUBLICATION_DRILLDOWN_SUMMARY_STAT_VALUE_CLASS, 'house-publication-overview-stat-value')}>{detailArticleType || 'n/a'}</p>
                              </div>
                            </div>
                            <div className="house-drilldown-summary-stat-card-small house-publication-overview-stat-card">
                              <p className={cn(HOUSE_PUBLICATION_DRILLDOWN_SUMMARY_STAT_TITLE_CLASS, 'house-drilldown-stat-title house-publication-overview-stat-title')}>DOI</p>
                              <div className={cn(HOUSE_PUBLICATION_DRILLDOWN_SUMMARY_STAT_VALUE_WRAP_CLASS, 'house-publication-overview-stat-value-wrap')}>
                                {detailDoi ? (
                                  <a className={HOUSE_PUBLICATION_DRILLDOWN_LINK_CLASS} href={doiToUrl(detailDoi) || undefined} target="_blank" rel="noreferrer">
                                    {detailDoi}
                                  </a>
                                ) : (
                                  <p className={HOUSE_PUBLICATION_DRILLDOWN_NOTE_SOFT_CLASS}>Not available</p>
                                )}
                              </div>
                            </div>
                            <div className="house-drilldown-summary-stat-card-small house-publication-overview-stat-card">
                              <p className={cn(HOUSE_PUBLICATION_DRILLDOWN_SUMMARY_STAT_TITLE_CLASS, 'house-drilldown-stat-title house-publication-overview-stat-title')}>PMID</p>
                              <div className={cn(HOUSE_PUBLICATION_DRILLDOWN_SUMMARY_STAT_VALUE_WRAP_CLASS, 'house-publication-overview-stat-value-wrap')}>
                                {detailPmid ? (
                                  <a className={HOUSE_PUBLICATION_DRILLDOWN_LINK_CLASS} href={`https://pubmed.ncbi.nlm.nih.gov/${detailPmid}/`} target="_blank" rel="noreferrer">
                                    {detailPmid}
                                  </a>
                                ) : (
                                  <p className={HOUSE_PUBLICATION_DRILLDOWN_NOTE_SOFT_CLASS}>Not available</p>
                                )}
                              </div>
                            </div>
                          </div>
                          <div className="house-drilldown-heading-block">
                            <p className="house-drilldown-heading-block-title">Authors</p>
                          </div>
                          <div className="house-drilldown-content-block">
                            <div className="house-drilldown-summary-stat-card-small house-publication-overview-stat-card">
                              {overviewAuthors.length > 0 ? (
                                <>
                                  <p className="leading-relaxed">
                                    {(overviewAuthorsExpanded ? overviewAuthors : overviewAuthors.slice(0, PUBLICATION_OVERVIEW_AUTHORS_PREVIEW_LIMIT)).map((author, index, list) => (
                                      <span key={`${author.rawName}-${index}`}>
                                        <span className={author.isYou ? 'font-semibold text-[hsl(var(--section-style-profile-accent))]' : undefined}>{author.displayName}</span>
                                        {author.affiliationIndices.length > 0 ? (
                                          <sup className="ml-0.5 text-[0.62rem] leading-none align-super text-muted-foreground">
                                            {author.affiliationIndices.join(',')}
                                          </sup>
                                        ) : null}
                                        {author.hasEqualContribution ? '*' : ''}
                                        {author.roles.map((role) => (
                                          <span key={`${author.rawName}-${role}`} className="ml-1 inline-flex items-center rounded border border-neutral-300 px-1 py-0 text-[0.62rem] leading-none text-neutral-700">{role}</span>
                                        ))}
                                        {index < list.length - 1 ? ', ' : ''}
                                      </span>
                                    ))}
                                    {!overviewAuthorsExpanded && overviewAuthors.length > PUBLICATION_OVERVIEW_AUTHORS_PREVIEW_LIMIT ? (
                                      <>
                                        {' '}
                                        <button
                                          type="button"
                                          className={HOUSE_PUBLICATION_DRILLDOWN_LINK_CLASS}
                                          onClick={() => setOverviewAuthorsExpanded(true)}
                                        >
                                          +{overviewAuthors.length - PUBLICATION_OVERVIEW_AUTHORS_PREVIEW_LIMIT} more
                                        </button>
                                      </>
                                    ) : null}
                                  </p>
                                  {overviewAuthorsExpanded ? (
                                    <div className="mt-1 space-y-1">
                                      {overviewAuthors.some((author) => author.hasEqualContribution) ? (
                                        <p className={HOUSE_PUBLICATION_DRILLDOWN_NOTE_SOFT_CLASS}>* indicates equal contribution.</p>
                                      ) : null}
                                      {overviewAuthors.some((author) => author.roles.length > 0) ? (
                                        <p className={HOUSE_PUBLICATION_DRILLDOWN_NOTE_SOFT_CLASS}>Role badges indicate author position metadata when available.</p>
                                      ) : null}
                                    </div>
                                  ) : null}
                                  {overviewAuthorAffiliations.length > 0 ? (
                                    <div className="mt-2 space-y-1">
                                      {overviewAuthorAffiliations.map((affiliation) => (
                                        <p key={`affiliation-${affiliation.index}`} className={cn(HOUSE_PUBLICATION_DRILLDOWN_NOTE_SOFT_CLASS, 'house-publication-affiliation-line')}>
                                          <sup className="mr-1 text-[0.62rem] leading-none align-super">{affiliation.index}</sup>
                                          {affiliation.label}
                                        </p>
                                      ))}
                                    </div>
                                  ) : null}
                                </>
                              ) : (
                                <p className={HOUSE_PUBLICATION_DRILLDOWN_NOTE_SOFT_CLASS}>Not available</p>
                              )}
                            </div>
                          </div>
                          <div className="house-drilldown-heading-block">
                            <p className="house-drilldown-heading-block-title">Contribution</p>
                          </div>
                          <div className="house-drilldown-content-block">
                            <div className="house-drilldown-summary-stats-grid" style={{ gridTemplateColumns: 'repeat(2, minmax(0, 1fr))' }}>
                              <div className="house-drilldown-summary-stat-card-small house-publication-overview-stat-card">
                                <p className={cn(HOUSE_PUBLICATION_DRILLDOWN_SUMMARY_STAT_TITLE_CLASS, 'house-drilldown-stat-title house-publication-overview-stat-title')}>Author position</p>
                                <div className={cn(HOUSE_PUBLICATION_DRILLDOWN_SUMMARY_STAT_VALUE_WRAP_CLASS, 'house-publication-overview-stat-value-wrap')}>
                                  <p className={cn(HOUSE_PUBLICATION_DRILLDOWN_SUMMARY_STAT_VALUE_CLASS, 'house-publication-overview-stat-value')}>{overviewOwnerAuthorPosition}</p>
                                </div>
                              </div>
                              <div className="house-drilldown-summary-stat-card-small house-publication-overview-stat-card">
                                <p className={cn(HOUSE_PUBLICATION_DRILLDOWN_SUMMARY_STAT_TITLE_CLASS, 'house-drilldown-stat-title house-publication-overview-stat-title')}>Contribution</p>
                                <div className={cn(HOUSE_PUBLICATION_DRILLDOWN_SUMMARY_STAT_VALUE_WRAP_CLASS, 'house-publication-overview-stat-value-wrap')}>
                                  <p className={cn(HOUSE_PUBLICATION_DRILLDOWN_SUMMARY_STAT_VALUE_CLASS, 'house-publication-overview-stat-value', overviewOwnerContributionToneClass)}>{overviewOwnerContribution}</p>
                                </div>
                              </div>
                            </div>
                          </div>

                        </TabsContent>

                        <TabsContent value="content" className="mt-0" role="tabpanel" id="publication-drilldown-panel-content" aria-labelledby="publication-drilldown-tab-content">
                          <div className="house-drilldown-content-block space-y-3">
                            {selectedDetail?.structured_abstract_status === 'RUNNING' ? (
                              <p className={HOUSE_PUBLICATION_DRILLDOWN_NOTE_SOFT_CLASS}>Structuring abstract...</p>
                            ) : null}
                            {selectedDetail?.structured_abstract_status === 'FAILED' ? (
                              <p className={HOUSE_PUBLICATION_DRILLDOWN_NOTE_WARNING_CLASS}>Structured abstract generation failed. Showing raw abstract.</p>
                            ) : null}
                            {selectedDetail?.structured_abstract_last_error ? (
                              <p className={HOUSE_PUBLICATION_DRILLDOWN_NOTE_WARNING_CLASS}>{selectedDetail.structured_abstract_last_error}</p>
                            ) : null}
                            {selectedDetail?.structured_abstract?.sections?.length ? (
                              <div className="space-y-0">
                                {selectedDetail.structured_abstract.sections.map((section, index) => (
                                  <div key={`abstract-section-${section.key || index}`} className="space-y-2">
                                    <div className="house-drilldown-heading-block">
                                      <p className="house-drilldown-heading-block-title">{section.label || 'Summary'}</p>
                                    </div>
                                    <div className="house-drilldown-content-block">
                                      <div className="house-drilldown-summary-stat-card house-drilldown-abstract-metric-card w-full">
                                        <p className="leading-relaxed">{section.content || 'Not available'}</p>
                                      </div>
                                    </div>
                                  </div>
                                ))}
                                {abstractKeywordList.length > 0 ? (
                                  <div className="space-y-2">
                                    <div className="house-drilldown-heading-block">
                                      <p className="house-drilldown-heading-block-title">Keywords</p>
                                    </div>
                                    <div className="house-drilldown-content-block">
                                      <div className="house-drilldown-summary-stat-card house-drilldown-abstract-metric-card w-full">
                                        <p className="leading-relaxed">{abstractKeywordList.join(', ')}</p>
                                      </div>
                                    </div>
                                  </div>
                                ) : null}
                              </div>
                            ) : effectiveDetailAbstract ? (
                              <div className="house-drilldown-content-block">
                                <div className="house-drilldown-summary-stat-card house-drilldown-abstract-metric-card w-full space-y-2">
                                  <p className="leading-relaxed">{abstractPreview}</p>
                                  {effectiveDetailAbstract.length > 700 ? (
                                    <button
                                      type="button"
                                      className={HOUSE_PUBLICATION_DRILLDOWN_LINK_CLASS}
                                      onClick={onToggleAbstractExpanded}
                                    >
                                      {abstractExpanded ? 'Show less' : 'Show more'}
                                    </button>
                                  ) : null}
                                </div>
                              </div>
                            ) : abstractKeywordList.length > 0 ? (
                              <div className="space-y-2">
                                <div className="house-drilldown-heading-block">
                                  <p className="house-drilldown-heading-block-title">Keywords</p>
                                </div>
                                <div className="house-drilldown-content-block">
                                  <div className="house-drilldown-summary-stat-card house-drilldown-abstract-metric-card w-full">
                                    <p className="leading-relaxed">{abstractKeywordList.join(', ')}</p>
                                  </div>
                                </div>
                              </div>
                            ) : (
                              <p className={HOUSE_PUBLICATION_DRILLDOWN_NOTE_SOFT_CLASS}>No abstract available.</p>
                            )}
                          </div>
                        </TabsContent>

                        <TabsContent value="impact" className="mt-0" role="tabpanel" id="publication-drilldown-panel-impact" aria-labelledby="publication-drilldown-tab-impact">
                          <div className="house-drilldown-heading-block">
                            <p className="house-drilldown-heading-block-title">Impact</p>
                          </div>
                          <div className="house-drilldown-content-block space-y-3">
                          {selectedImpactResponse?.status === 'RUNNING' ? <p className={HOUSE_PUBLICATION_DRILLDOWN_NOTE_SOFT_CLASS}>Computing impact insights...</p> : null}
                          {selectedImpactResponse?.status === 'FAILED' ? <p className={HOUSE_PUBLICATION_DRILLDOWN_NOTE_WARNING_CLASS}>Last impact update failed. Showing cached data.</p> : null}
                            <div className="house-drilldown-heading-block">
                              <p className="house-drilldown-heading-block-title">Citation snapshot</p>
                            </div>
                          <div className="house-drilldown-content-block">
                            <div className="house-drilldown-summary-stats-grid">
                            <div className={HOUSE_PUBLICATION_DRILLDOWN_STAT_CARD_CLASS}><p className="house-drilldown-overline">Total citations</p><p className="font-semibold">{selectedImpactResponse?.payload?.citations_total ?? detailCitations}</p></div>
                            <div className={HOUSE_PUBLICATION_DRILLDOWN_STAT_CARD_CLASS}><p className="house-drilldown-overline">Citations (12m)</p><p className="font-semibold">{selectedImpactResponse?.payload?.citations_last_12m ?? 0}</p></div>
                            <div className={HOUSE_PUBLICATION_DRILLDOWN_STAT_CARD_CLASS}><p className="house-drilldown-overline">YoY %</p><p className={`font-semibold ${growthToneClass(selectedImpactResponse?.payload?.yoy_pct ?? null)}`}>{formatSignedPercent(selectedImpactResponse?.payload?.yoy_pct ?? null)}</p></div>
                            <div className={HOUSE_PUBLICATION_DRILLDOWN_STAT_CARD_CLASS}><p className="house-drilldown-overline">Acceleration</p><p className="font-semibold">{selectedImpactResponse?.payload?.acceleration_citations_per_month ?? 0}/month</p></div>
                            </div>
                          </div>
                          <div className={HOUSE_PUBLICATION_DRILLDOWN_DIVIDER_TOP_CLASS} />
                          <div className="house-drilldown-heading-block">
                            <p className="house-drilldown-heading-block-title">Key citing papers</p>
                          </div>
                          <div className={HOUSE_PUBLICATION_DRILLDOWN_STAT_CARD_CLASS}>
                            {(selectedImpactResponse?.payload?.key_citing_papers || []).length === 0 ? <p className={HOUSE_PUBLICATION_DRILLDOWN_NOTE_SOFT_CLASS}>Not available from source.</p> : (selectedImpactResponse?.payload?.key_citing_papers || []).slice(0, 5).map((paper, index) => <p key={`${paper.title}-${index}`}>{paper.year ?? 'n/a'} | {paper.title}</p>)}
                          </div>
                          </div>
                        </TabsContent>

                        <TabsContent value="files" className="mt-0" role="tabpanel" id="publication-drilldown-panel-files" aria-labelledby="publication-drilldown-tab-files">
                          <div className="house-drilldown-heading-block">
                            <p className="house-drilldown-heading-block-title">Files</p>
                          </div>
                          <div className="house-drilldown-content-block space-y-3">
                          {selectedFiles.length === 0 ? (
                            <div className={`${HOUSE_PUBLICATION_DRILLDOWN_STAT_CARD_CLASS} ${HOUSE_PUBLICATION_DRILLDOWN_TRANSITION_CLASS}`}>
                              <p className={HOUSE_PUBLICATION_DRILLDOWN_NOTE_SOFT_CLASS}>No files linked to this publication.</p>
                            </div>
                          ) : (
                            <div className="space-y-3">
                              {selectedFiles.map((file) => {
                                const fileLabel = 'OA Manuscript Download'
                                const sourceLabel = file.source === 'OA_LINK' ? 'OA link' : 'Uploaded'
                                return (
                                  <div key={file.id} className={`${HOUSE_PUBLICATION_DRILLDOWN_STAT_CARD_CLASS} ${HOUSE_PUBLICATION_DRILLDOWN_TRANSITION_CLASS} space-y-2`}>
                                    <p className={HOUSE_PUBLICATION_DRILLDOWN_STAT_TITLE_CLASS}>{fileLabel}</p>
                                    <p className={`truncate ${HOUSE_PUBLICATION_TEXT_CLASS}`} title={file.file_name}>{file.file_name}</p>
                                    <p className={HOUSE_PUBLICATION_DRILLDOWN_CAPTION_CLASS}>{file.file_type} | {sourceLabel} | {formatShortDate(file.created_at)}</p>
                                    <div className={`mt-1 flex flex-wrap items-center gap-1.5 ${HOUSE_PUBLICATION_DRILLDOWN_ACTION_CLASS}`}>
                                      {file.source === 'OA_LINK' && file.download_url ? (
                                        <Button type="button" size="sm" variant="primary" asChild><a href={file.download_url} target="_blank" rel="noreferrer">Open</a></Button>
                                      ) : (
                                        <Button type="button" size="sm" variant="primary" disabled={downloadingFileId === file.id} onClick={() => void onDownloadPublicationFile(file.id, file.file_name)}>{downloadingFileId === file.id ? 'Downloading...' : 'Download'}</Button>
                                      )}
                                      <Button type="button" size="sm" variant="secondary" onClick={() => onSharePublicationFileEmail(file)}>Share (email)</Button>
                                      <Button type="button" size="sm" variant="secondary" onClick={() => onSharePublicationFileWithUser(file)}>Share with user</Button>
                                      <Button type="button" size="sm" variant="secondary" className="ml-auto" disabled={deletingFileId === file.id} onClick={() => void onDeletePublicationFile(file.id)}>{deletingFileId === file.id ? 'Deleting...' : 'Delete'}</Button>
                                    </div>
                                  </div>
                                )
                              })}
                            </div>
                          )}
                          <div data-house-role="files-tab-divider" className={HOUSE_PUBLICATION_DRILLDOWN_DIVIDER_TOP_CLASS} />
                          <div
                            className={cn(
                              HOUSE_PUBLICATION_DRILLDOWN_FILE_DROP_CLASS,
                              HOUSE_PUBLICATION_DRILLDOWN_TRANSITION_CLASS,
                              filesDragOver ? HOUSE_PUBLICATION_DRILLDOWN_FILE_DROP_ACTIVE_CLASS : '',
                            )}
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
                            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                              <div className="space-y-0.5">
                                <p className={HOUSE_PUBLICATION_DRILLDOWN_STAT_TITLE_CLASS}>Add files</p>
                                <p className={HOUSE_PUBLICATION_DRILLDOWN_NOTE_SOFT_CLASS}>Drag and drop files here, or use upload.</p>
                              </div>
                              <div className="flex items-start">
                                <Button type="button" size="sm" variant="secondary" onClick={() => filePickerRef.current?.click()} disabled={uploadingFile}>{uploadingFile ? 'Uploading...' : 'Upload file'}</Button>
                                <input ref={filePickerRef} type="file" multiple className="hidden" onChange={(event) => void onUploadFiles(event.target.files)} />
                              </div>
                            </div>
                          </div>
                          </div>
                        </TabsContent>

                        <TabsContent value="ai" className="mt-0" role="tabpanel" id="publication-drilldown-panel-ai" aria-labelledby="publication-drilldown-tab-ai">
                          <div className="house-drilldown-heading-block">
                            <p className="house-drilldown-heading-block-title">AI insights</p>
                          </div>
                          <div className="house-drilldown-content-block space-y-3">
                          <p className={`${HOUSE_BANNER_CLASS} text-micro`}>AI-generated draft insights. Verify against full text.</p>
                          {selectedAiResponse?.status === 'RUNNING' ? <p className={HOUSE_PUBLICATION_DRILLDOWN_NOTE_SOFT_CLASS}>Generating insights...</p> : null}
                          {selectedAiResponse?.status === 'FAILED' ? <p className={HOUSE_PUBLICATION_DRILLDOWN_NOTE_WARNING_CLASS}>Last AI update failed. Showing cached data.</p> : null}
                            <div className={HOUSE_PUBLICATION_DRILLDOWN_DIVIDER_TOP_CLASS} />
                            <div className="house-drilldown-heading-block">
                              <p className="house-drilldown-heading-block-title">Performance summary</p>
                            </div>
                          <div className={HOUSE_PUBLICATION_DRILLDOWN_STAT_CARD_CLASS}>
                            <p className="leading-relaxed">{selectedAiResponse?.payload?.performance_summary || 'Not available'}</p>
                          </div>
                            <div className={HOUSE_PUBLICATION_DRILLDOWN_DIVIDER_TOP_CLASS} />
                            <div className="house-drilldown-heading-block">
                              <p className="house-drilldown-heading-block-title">Trajectory</p>
                            </div>
                          <div className={HOUSE_PUBLICATION_DRILLDOWN_STAT_CARD_CLASS}>
                            <p className="font-medium">{(selectedAiResponse?.payload?.trajectory_classification || 'UNKNOWN').replace(/_/g, ' ')}</p>
                          </div>
                            <div className={HOUSE_PUBLICATION_DRILLDOWN_DIVIDER_TOP_CLASS} />
                            <div className="house-drilldown-heading-block">
                              <p className="house-drilldown-heading-block-title">Reuse suggestions</p>
                            </div>
                          <div className={`${HOUSE_PUBLICATION_DRILLDOWN_STAT_CARD_CLASS} space-y-1`}>
                            {(selectedAiResponse?.payload?.reuse_suggestions || []).length === 0 ? <p className={HOUSE_PUBLICATION_DRILLDOWN_NOTE_SOFT_CLASS}>No suggestions yet.</p> : (selectedAiResponse?.payload?.reuse_suggestions || []).map((item, index) => <p key={`${item}-${index}`}>- {item}</p>)}
                          </div>
                            <div className={HOUSE_PUBLICATION_DRILLDOWN_DIVIDER_TOP_CLASS} />
                            <div className="house-drilldown-heading-block">
                              <p className="house-drilldown-heading-block-title">Caution flags</p>
                            </div>
                          <div className={`${HOUSE_PUBLICATION_DRILLDOWN_STAT_CARD_CLASS} space-y-1`}>
                            {(selectedAiResponse?.payload?.caution_flags || []).length === 0 ? <p className={HOUSE_PUBLICATION_DRILLDOWN_NOTE_SOFT_CLASS}>No caution flags.</p> : (selectedAiResponse?.payload?.caution_flags || []).map((item, index) => <p key={`${item}-${index}`}>- {item}</p>)}
                          </div>
                          </div>
                        </TabsContent>
                        </div>
                      </div>
                    </Tabs>
                  </div>
                ) : null}
              </SheetContent>
            </Sheet>

          </div>
          </div>
        ) : (
          <div className="house-main-content-block">
            <section className="house-notification-section" aria-live="polite">
              <div className={cn(HOUSE_BANNER_CLASS, HOUSE_BANNER_INFO_CLASS)}>
                <p>Publication library hidden by user.</p>
              </div>
            </section>
          </div>
        )}
      </div>

      {status ? <p className={`${HOUSE_BANNER_CLASS} ${HOUSE_BANNER_PUBLICATIONS_CLASS}`}>{status}</p> : null}
      {error ? <p className={`${HOUSE_BANNER_CLASS} ${HOUSE_BANNER_DANGER_CLASS}`}>{error}</p> : null}
      {(loading || richImporting || syncing || fullSyncing) ? (
        <p className={`${HOUSE_BANNER_CLASS} ${HOUSE_BANNER_PUBLICATIONS_CLASS}`}>Working...</p>
      ) : null}
      {autoOaStatus ? (
        <p className={`${HOUSE_BANNER_CLASS} ${HOUSE_BANNER_PUBLICATIONS_CLASS}`}>
          {autoOaStatus}
          {autoOaFinding ? ' (running in background)' : ''}
        </p>
      ) : null}
    </section>
  )
}




