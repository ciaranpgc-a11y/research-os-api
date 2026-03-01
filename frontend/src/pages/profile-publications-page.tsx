import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { ChevronDown, ChevronUp, ChevronsUpDown, Loader2, Paperclip } from 'lucide-react'
import { useNavigate } from 'react-router-dom'

import { PublicationsTopStrip } from '@/components/publications/PublicationsTopStrip'
import { publicationsHouseDetail, publicationsHouseDrilldown, publicationsHouseHeadings, publicationsHouseMotion } from '@/components/publications/publications-house-style'
import { ButtonPrimitive as Button } from '@/components/primitives/ButtonPrimitive'
import { InputPrimitive as Input } from '@/components/primitives/InputPrimitive'
import {
  SelectPrimitive,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/primitives/SelectPrimitive'
import { Sheet, SheetContent } from '@/components/ui/sheet'
import { TablePrimitive as Table, TableBody, TableCell, TableHead as TableHeader, TableHeaderCell as TableHead, TableRow } from '@/components/primitives/TablePrimitive'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { houseForms, houseLayout, houseSurfaces, houseTables, houseTypography } from '@/lib/house-style'
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

type PublicationFilterKey = 'all' | 'cited' | 'with_doi' | 'with_abstract' | 'with_pmid'
type PublicationSortField = 'citations' | 'year' | 'title' | 'venue' | 'work_type'
type SortDirection = 'asc' | 'desc'
type PublicationDetailTab = 'overview' | 'content' | 'impact' | 'files' | 'ai'
type PublicationTableColumnKey = 'title' | 'year' | 'venue' | 'work_type' | 'article_type' | 'citations'
type PublicationTableColumnAlign = 'left' | 'center' | 'right'
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
const PUBLICATION_TABLE_COLUMN_WIDTH_MIN = 80
const PUBLICATION_TABLE_COLUMN_WIDTH_MAX = 640

const INTEGRATIONS_USER_CACHE_KEY = 'aawe_integrations_user_cache'
const PUBLICATIONS_ANALYTICS_CACHE_KEY = 'aawe_publications_analytics_cache'
const PUBLICATIONS_TOP_METRICS_CACHE_KEY = 'aawe_publications_top_metrics_cache'
const PUBLICATIONS_ACTIVE_SYNC_JOB_STORAGE_PREFIX = 'aawe_publications_active_sync_job:'
const PUBLICATIONS_LIBRARY_COLUMNS_STORAGE_PREFIX = 'aawe_publications_library_columns:'
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
const HOUSE_INPUT_CLASS = houseForms.input
const HOUSE_TABLE_FILTER_INPUT_CLASS = houseTables.filterInput
const HOUSE_TABLE_FILTER_SELECT_CLASS = houseTables.filterSelect
const HOUSE_TABLE_SORT_TRIGGER_CLASS = houseTables.sortTrigger
const HOUSE_TABLE_HEAD_TEXT_CLASS = houseTypography.tableHead
const HOUSE_TABLE_CELL_TEXT_CLASS = houseTypography.tableCell
const HOUSE_BANNER_CLASS = houseSurfaces.banner
const HOUSE_BANNER_DANGER_CLASS = houseSurfaces.bannerDanger
const HOUSE_BANNER_PUBLICATIONS_CLASS = houseSurfaces.bannerPublications
const HOUSE_PUBLICATION_DETAIL_SCROLL_CLASS = publicationsHouseDetail.scroll
const HOUSE_PUBLICATION_DETAIL_HEADER_CLASS = publicationsHouseDetail.header
const HOUSE_PUBLICATION_DETAIL_TITLE_CLASS = publicationsHouseDetail.title
const HOUSE_PUBLICATION_DETAIL_TABS_CLASS = publicationsHouseDetail.tabs
const HOUSE_PUBLICATION_DETAIL_TAB_CLASS = publicationsHouseDetail.tab
const HOUSE_PUBLICATION_DETAIL_BODY_CLASS = publicationsHouseDetail.body
const HOUSE_PUBLICATION_DETAIL_SECTION_CLASS = publicationsHouseDetail.section
const HOUSE_PUBLICATION_DETAIL_LABEL_CLASS = publicationsHouseDetail.sectionLabel
const HOUSE_PUBLICATION_DETAIL_INFO_CLASS = publicationsHouseDetail.info
const HOUSE_PUBLICATION_TEXT_CLASS = publicationsHouseHeadings.text
const HOUSE_PUBLICATION_DRILLDOWN_STAT_CARD_CLASS = publicationsHouseDrilldown.statCard
const HOUSE_PUBLICATION_DRILLDOWN_STAT_TITLE_CLASS = publicationsHouseDrilldown.statTitle
const HOUSE_PUBLICATION_DRILLDOWN_CAPTION_CLASS = publicationsHouseDrilldown.caption
const HOUSE_PUBLICATION_DRILLDOWN_ACTION_CLASS = publicationsHouseDrilldown.action
const HOUSE_PUBLICATION_DRILLDOWN_ROW_CLASS = publicationsHouseDrilldown.row
const HOUSE_PUBLICATION_DRILLDOWN_NOTE_SOFT_CLASS = publicationsHouseDrilldown.noteSoft
const HOUSE_PUBLICATION_DRILLDOWN_DIVIDER_TOP_CLASS = publicationsHouseDrilldown.dividerTop
const HOUSE_PUBLICATION_DRILLDOWN_TRANSITION_CLASS = publicationsHouseMotion.labelTransition
const HOUSE_PUBLICATION_DRILLDOWN_SHEET_CLASS = publicationsHouseDrilldown.sheet
const HOUSE_PUBLICATION_DRILLDOWN_SHEET_BODY_CLASS = publicationsHouseDrilldown.sheetBody

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

function clampPublicationTableColumnWidth(value: number, fallback: number): number {
  if (!Number.isFinite(value)) {
    return fallback
  }
  return Math.max(
    PUBLICATION_TABLE_COLUMN_WIDTH_MIN,
    Math.min(PUBLICATION_TABLE_COLUMN_WIDTH_MAX, Math.round(value)),
  )
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
      defaults[key] = {
        // Keep all columns visible now that the column-controls UI is removed.
        visible: true,
        // Migrate prior centered defaults to left alignment for visual consistency.
        align: parsedAlign === 'center' ? 'left' : parsedAlign,
        width: clampPublicationTableColumnWidth(
          Number(payload.width || PUBLICATION_TABLE_COLUMN_DEFAULTS[key].width),
          PUBLICATION_TABLE_COLUMN_DEFAULTS[key].width,
        ),
      }
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
  const columnLimits: Record<PublicationTableColumnKey, { min: number; max: number; growWeight: number }> = {
    title: { min: 320, max: 760, growWeight: 6.4 },
    year: { min: 96, max: 124, growWeight: 0.6 },
    venue: { min: 180, max: 340, growWeight: 2.1 },
    work_type: { min: 170, max: 260, growWeight: 1.6 },
    article_type: { min: 140, max: 220, growWeight: 1.2 },
    citations: { min: 124, max: 168, growWeight: 0.8 },
  }
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
  const [filterKey, setFilterKey] = useState<PublicationFilterKey>('all')
  const [typeFilter, setTypeFilter] = useState<string>('all')
  const [publicationTableLayoutWidth, setPublicationTableLayoutWidth] = useState(1100)
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
  const [contentModeByWorkId, setContentModeByWorkId] = useState<Record<string, 'plain' | 'highlighted'>>({})
  const [uploadingFile, setUploadingFile] = useState(false)
  const [oaPdfStatusByWorkId, setOaPdfStatusByWorkId] = useState<Record<string, PublicationOaPdfStatusRecord>>({})
  const [autoOaFinding, setAutoOaFinding] = useState(false)
  const [autoOaStatus, setAutoOaStatus] = useState('')
  const [downloadingFileId, setDownloadingFileId] = useState<string | null>(null)
  const [deletingFileId, setDeletingFileId] = useState<string | null>(null)
  const [filesDragOver, setFilesDragOver] = useState(false)
  const autoOaInFlightRef = useRef(false)
  const filesWarmupInFlightRef = useRef<Set<string>>(new Set())
  const filesWarmupCompletedRef = useRef<Set<string>>(new Set())
  const autoOaStatusClearTimerRef = useRef<number | null>(null)
  const localTopMetricsBootstrapAttemptedRef = useRef(false)
  const publicationTableLayoutRef = useRef<HTMLDivElement | null>(null)
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
    setPublicationTableColumns(loadPublicationTableColumnPreferences(user.id))
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
    savePublicationsOaStatus(user.id, oaPdfStatusByWorkId)
  }, [oaPdfStatusByWorkId, user?.id])

  useEffect(() => {
    const node = publicationTableLayoutRef.current
    if (!node) {
      return
    }
    const updateWidth = () => {
      setPublicationTableLayoutWidth(Math.max(760, Math.round(node.clientWidth || 760)))
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
  }, [])

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
    const works = personaState?.works ?? []
    if (works.length === 0) {
      return
    }
    setPublicationTableColumns((current) => {
      const next = autoFitPublicationTableColumns({
        works,
        metricsByWorkId,
        current,
        availableWidth: publicationTableLayoutWidth,
      })
      if (publicationTableColumnsEqual(current, next)) {
        return current
      }
      return next
    })
  }, [metricsByWorkId, personaState?.works, publicationTableLayoutWidth])

  const visiblePublicationTableColumns = useMemo(() => (
    PUBLICATION_TABLE_COLUMN_ORDER.filter((key) => publicationTableColumns[key].visible)
  ), [publicationTableColumns])

  useEffect(() => {
    const sortColumn = sortField as PublicationTableColumnKey
    if (publicationTableColumns[sortColumn]?.visible) {
      return
    }
    const fallbackColumn = PUBLICATION_TABLE_COLUMN_ORDER.find(
      (column) => publicationTableColumns[column].visible,
    )
    if (!fallbackColumn) {
      return
    }
    setSortField(PUBLICATION_TABLE_COLUMN_DEFINITIONS[fallbackColumn].sortField)
  }, [publicationTableColumns, sortField])

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

  const onSortColumn = (column: PublicationSortField) => {
    if (sortField === column) {
      setSortDirection((current) => (current === 'desc' ? 'asc' : 'desc'))
      return
    }
    setSortField(column)
    setSortDirection('desc')
  }

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
        </div>
        <div className="house-main-content-block space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <Input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Filter by title, journal, DOI, PMID, author"
              className={`w-sz-280 ${HOUSE_INPUT_CLASS} ${HOUSE_TABLE_FILTER_INPUT_CLASS}`}
            />
            <SelectPrimitive value={filterKey} onValueChange={(value) => setFilterKey(value as PublicationFilterKey)}>
              <SelectTrigger className={`h-9 w-auto min-w-[11rem] rounded-md px-2 ${HOUSE_TABLE_FILTER_SELECT_CLASS}`}>
                <SelectValue placeholder="All works" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All works</SelectItem>
                <SelectItem value="cited">Cited only</SelectItem>
                <SelectItem value="with_doi">With DOI</SelectItem>
                <SelectItem value="with_abstract">With abstract</SelectItem>
                <SelectItem value="with_pmid">With PMID</SelectItem>
              </SelectContent>
            </SelectPrimitive>
            <SelectPrimitive value={typeFilter} onValueChange={setTypeFilter}>
              <SelectTrigger className={`h-9 w-auto min-w-[11rem] rounded-md px-2 ${HOUSE_TABLE_FILTER_SELECT_CLASS}`}>
                <SelectValue placeholder="All types" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All types</SelectItem>
                {typeFilterOptions.map((value) => (
                  <SelectItem key={value} value={value}>
                    {value}
                  </SelectItem>
                ))}
              </SelectContent>
            </SelectPrimitive>
          </div>
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
                <div ref={publicationTableLayoutRef} className="relative w-full">
                  <Table
                    className="min-w-sz-760 table-fixed"
                    data-house-no-column-resize="true"
                    data-house-no-column-controls="true"
                  >
                    <colgroup>
                      {visiblePublicationTableColumns.map((columnKey) => {
                        const width = publicationTableColumns[columnKey].width
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
                    <TableHeader className="text-left">
                      <TableRow>
                        {visiblePublicationTableColumns.map((columnKey) => {
                          const definition = PUBLICATION_TABLE_COLUMN_DEFINITIONS[columnKey]
                          return (
                            <TableHead
                              key={`table-head-${columnKey}`}
                              className={`${HOUSE_TABLE_HEAD_TEXT_CLASS} text-left`}
                            >
                              <SortHeader
                                label={definition.label}
                                column={definition.sortField}
                                sortField={sortField}
                                sortDirection={sortDirection}
                                align="left"
                                onSort={onSortColumn}
                              />
                            </TableHead>
                          )
                        })}
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filteredWorks.map((work) => {
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
                                    <div className="grid grid-cols-[auto_minmax(0,1fr)] items-start gap-1.5">
                                      {oaVisualStatus === 'available' && oaDownloadUrl ? (
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
                                      )}
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
                                  className={`align-top whitespace-normal break-words leading-tight ${HOUSE_TABLE_CELL_TEXT_CLASS} ${alignClass} transition-colors ${citationCellTone(
                                    metrics?.citations ?? 0,
                                    hIndex,
                                  )}`}
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
                  <div className={HOUSE_PUBLICATION_DRILLDOWN_SHEET_BODY_CLASS}>
                    <Tabs value={activeDetailTab} onValueChange={onDetailTabChange} className="w-full">
                      <div className={`max-h-[78vh] overflow-auto ${HOUSE_PUBLICATION_DETAIL_SCROLL_CLASS}`}>
                      <div className={HOUSE_PUBLICATION_DETAIL_HEADER_CLASS}>
                        <p className={HOUSE_PUBLICATION_DETAIL_TITLE_CLASS}>
                          {selectedDetail?.title || selectedWork.title}
                        </p>
                        <TabsList className={`mt-2 grid h-auto w-full grid-cols-5 gap-1 ${HOUSE_PUBLICATION_DETAIL_TABS_CLASS}`}>
                          <TabsTrigger value="overview" className={`text-micro ${HOUSE_PUBLICATION_DETAIL_TAB_CLASS}`}>Overview</TabsTrigger>
                          <TabsTrigger value="content" className={`text-micro ${HOUSE_PUBLICATION_DETAIL_TAB_CLASS}`}>Content</TabsTrigger>
                          <TabsTrigger value="impact" className={`text-micro ${HOUSE_PUBLICATION_DETAIL_TAB_CLASS}`}>Impact</TabsTrigger>
                          <TabsTrigger value="files" className={`text-micro ${HOUSE_PUBLICATION_DETAIL_TAB_CLASS}`}>Files</TabsTrigger>
                          <TabsTrigger value="ai" className={`text-micro ${HOUSE_PUBLICATION_DETAIL_TAB_CLASS}`}>AI Insights</TabsTrigger>
                        </TabsList>
                      </div>

                      <div className={`space-y-3 ${HOUSE_PUBLICATION_DETAIL_BODY_CLASS}`}>
                        {activePaneError ? (
                          <p className="rounded border border-rose-200 bg-rose-50 px-2 py-1 text-xs text-rose-700">{activePaneError}</p>
                        ) : null}

                        <TabsContent value="overview" className="space-y-3">
                          <div className="grid grid-cols-2 gap-2">
                            <div className={HOUSE_PUBLICATION_DETAIL_SECTION_CLASS}><p className={HOUSE_PUBLICATION_DETAIL_LABEL_CLASS}>Year</p><p className="font-semibold">{detailYear ?? 'n/a'}</p></div>
                            <div className={HOUSE_PUBLICATION_DETAIL_SECTION_CLASS}><p className={HOUSE_PUBLICATION_DETAIL_LABEL_CLASS}>Journal</p><p className="font-medium">{detailJournal || 'Not available'}</p></div>
                            <div className={HOUSE_PUBLICATION_DETAIL_SECTION_CLASS}><p className={HOUSE_PUBLICATION_DETAIL_LABEL_CLASS}>Type</p><p className="font-medium">{detailPublicationType || 'Not available'}</p></div>
                            <div className={HOUSE_PUBLICATION_DETAIL_SECTION_CLASS}><p className={HOUSE_PUBLICATION_DETAIL_LABEL_CLASS}>Citations</p><p className="font-semibold">{detailCitations}</p></div>
                            <div className={HOUSE_PUBLICATION_DETAIL_SECTION_CLASS}><p className={HOUSE_PUBLICATION_DETAIL_LABEL_CLASS}>PMID</p>{detailPmid ? <a className="text-emerald-700 underline-offset-2 hover:underline" href={`https://pubmed.ncbi.nlm.nih.gov/${detailPmid}/`} target="_blank" rel="noreferrer">{detailPmid}</a> : <p className="text-muted-foreground">Not available</p>}</div>
                            <div className={HOUSE_PUBLICATION_DETAIL_SECTION_CLASS}><p className={HOUSE_PUBLICATION_DETAIL_LABEL_CLASS}>DOI</p>{detailDoi ? <a className="break-all text-emerald-700 underline-offset-2 hover:underline" href={doiToUrl(detailDoi) || undefined} target="_blank" rel="noreferrer">{detailDoi}</a> : <p className="text-muted-foreground">Not available</p>}</div>
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
                            <Button type="button" size="sm" variant="secondary" disabled={!Boolean(detailDoi)} asChild={Boolean(detailDoi)}>
                              {detailDoi ? <a href={doiToUrl(detailDoi) || undefined} target="_blank" rel="noreferrer">Open DOI</a> : <span>Open DOI</span>}
                            </Button>
                            <Button type="button" size="sm" variant="secondary" disabled={!Boolean(detailPmid)} asChild={Boolean(detailPmid)}>
                              {detailPmid ? <a href={`https://pubmed.ncbi.nlm.nih.gov/${detailPmid}/`} target="_blank" rel="noreferrer">Open PubMed</a> : <span>Open PubMed</span>}
                            </Button>
                            <Button type="button" size="sm" variant="secondary" onClick={onCopyVancouverCitation}>Copy citation</Button>
                            <Button type="button" size="sm" variant="secondary" onClick={() => navigate('/workspace')}>Add to manuscript</Button>
                          </div>

                          <div className={`${HOUSE_PUBLICATION_DETAIL_SECTION_CLASS} text-xs text-muted-foreground`}>
                            <p>Added: {formatShortDate(selectedDetail?.created_at || selectedWork.created_at)}</p>
                            <p>Updated: {formatShortDate(selectedDetail?.updated_at || selectedWork.updated_at)}</p>
                          </div>
                        </TabsContent>

                        <TabsContent value="content" className="space-y-3">
                          <div className="flex items-center gap-2">
                            <Button type="button" size="sm" variant={contentMode === 'plain' ? 'primary' : 'secondary'} onClick={() => void onContentModeChange('plain')}>Plain</Button>
                            <Button type="button" size="sm" variant={contentMode === 'highlighted' ? 'primary' : 'secondary'} onClick={() => void onContentModeChange('highlighted')}>Highlighted</Button>
                          </div>
                          <div className={`space-y-2 ${HOUSE_PUBLICATION_DETAIL_SECTION_CLASS}`}>
                            <p className={HOUSE_PUBLICATION_DETAIL_LABEL_CLASS}>Abstract</p>
                            <p className="whitespace-pre-wrap text-xs leading-relaxed">{detailAbstract ? abstractPreview : 'No abstract available.'}</p>
                            {detailAbstract.length > 700 ? <Button type="button" size="sm" variant="secondary" onClick={onToggleAbstractExpanded}>{abstractExpanded ? 'Collapse' : 'Expand'}</Button> : null}
                          </div>
                          {contentMode === 'highlighted' ? (
                            <div className={`space-y-1 text-xs ${HOUSE_PUBLICATION_DETAIL_SECTION_CLASS}`}>
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
                            <div className={HOUSE_PUBLICATION_DETAIL_SECTION_CLASS}><p className={HOUSE_PUBLICATION_DETAIL_LABEL_CLASS}>Total citations</p><p className="font-semibold">{selectedImpactResponse?.payload?.citations_total ?? detailCitations}</p></div>
                            <div className={HOUSE_PUBLICATION_DETAIL_SECTION_CLASS}><p className={HOUSE_PUBLICATION_DETAIL_LABEL_CLASS}>Citations (12m)</p><p className="font-semibold">{selectedImpactResponse?.payload?.citations_last_12m ?? 0}</p></div>
                            <div className={HOUSE_PUBLICATION_DETAIL_SECTION_CLASS}><p className={HOUSE_PUBLICATION_DETAIL_LABEL_CLASS}>YoY %</p><p className={`font-semibold ${growthToneClass(selectedImpactResponse?.payload?.yoy_pct ?? null)}`}>{formatSignedPercent(selectedImpactResponse?.payload?.yoy_pct ?? null)}</p></div>
                            <div className={HOUSE_PUBLICATION_DETAIL_SECTION_CLASS}><p className={HOUSE_PUBLICATION_DETAIL_LABEL_CLASS}>Acceleration</p><p className="font-semibold">{selectedImpactResponse?.payload?.acceleration_citations_per_month ?? 0}/month</p></div>
                          </div>
                          <div className={`space-y-1 ${HOUSE_PUBLICATION_DETAIL_SECTION_CLASS}`}>
                            <p className={HOUSE_PUBLICATION_DETAIL_LABEL_CLASS}>Key citing papers</p>
                            {(selectedImpactResponse?.payload?.key_citing_papers || []).length === 0 ? <p className="text-xs text-muted-foreground">Not available from source.</p> : (selectedImpactResponse?.payload?.key_citing_papers || []).slice(0, 5).map((paper, index) => <p key={`${paper.title}-${index}`} className="text-xs">{paper.year ?? 'n/a'} | {paper.title}</p>)}
                          </div>
                        </TabsContent>

                        <TabsContent value="files" className="space-y-3">
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
                            className={`${HOUSE_PUBLICATION_DRILLDOWN_ROW_CLASS} ${HOUSE_PUBLICATION_DRILLDOWN_TRANSITION_CLASS} border-dashed p-3 ${filesDragOver ? 'border-[hsl(var(--tone-accent-400))] bg-[hsl(var(--tone-accent-50)/0.55)]' : 'bg-[hsl(var(--tone-neutral-50)/0.55)]'}`}
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
                        </TabsContent>

                        <TabsContent value="ai" className="space-y-3">
                          <p className={`${HOUSE_BANNER_CLASS} ${HOUSE_PUBLICATION_DETAIL_INFO_CLASS} text-micro`}>AI-generated draft insights. Verify against full text.</p>
                          {selectedAiResponse?.status === 'RUNNING' ? <p className="text-xs text-muted-foreground">Generating insights...</p> : null}
                          {selectedAiResponse?.status === 'FAILED' ? <p className="text-xs text-amber-700">Last AI update failed. Showing cached data.</p> : null}
                          <div className={`space-y-1 ${HOUSE_PUBLICATION_DETAIL_SECTION_CLASS}`}>
                            <p className={HOUSE_PUBLICATION_DETAIL_LABEL_CLASS}>Performance summary</p>
                            <p className="text-xs leading-relaxed">{selectedAiResponse?.payload?.performance_summary || 'Not available'}</p>
                          </div>
                          <div className={HOUSE_PUBLICATION_DETAIL_SECTION_CLASS}>
                            <p className={HOUSE_PUBLICATION_DETAIL_LABEL_CLASS}>Trajectory</p>
                            <p className="text-xs font-medium">{(selectedAiResponse?.payload?.trajectory_classification || 'UNKNOWN').replace(/_/g, ' ')}</p>
                          </div>
                          <div className={`space-y-1 ${HOUSE_PUBLICATION_DETAIL_SECTION_CLASS}`}>
                            <p className={HOUSE_PUBLICATION_DETAIL_LABEL_CLASS}>Reuse suggestions</p>
                            {(selectedAiResponse?.payload?.reuse_suggestions || []).length === 0 ? <p className="text-xs text-muted-foreground">No suggestions yet.</p> : (selectedAiResponse?.payload?.reuse_suggestions || []).map((item, index) => <p key={`${item}-${index}`} className="text-xs">- {item}</p>)}
                          </div>
                          <div className={`space-y-1 ${HOUSE_PUBLICATION_DETAIL_SECTION_CLASS}`}>
                            <p className={HOUSE_PUBLICATION_DETAIL_LABEL_CLASS}>Caution flags</p>
                            {(selectedAiResponse?.payload?.caution_flags || []).length === 0 ? <p className="text-xs text-muted-foreground">No caution flags.</p> : (selectedAiResponse?.payload?.caution_flags || []).map((item, index) => <p key={`${item}-${index}`} className="text-xs">- {item}</p>)}
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


