import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { ArrowUpRight, BookOpen, ChevronDown, ChevronLeft, ChevronRight, ChevronUp, ChevronsUpDown, Download, Ellipsis, Eye, EyeOff, FileText, FlaskConical, Filter, Hammer, Lightbulb, Loader2, Mail, Paperclip, Pencil, Save, Search, Settings, Share2, Tag, Trash2, X } from 'lucide-react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import * as XLSX from 'xlsx'

import { PageHeader, Row, Section, SectionHeader, Stack } from '@/components/primitives'
import { SectionMarker, SectionToolDivider, SectionTools } from '@/components/patterns'
import { PublicationPdfViewer } from '@/components/publications/PublicationPdfViewer'
import { PublicationsPerYearChart, PublicationsTopStrip } from '@/components/publications/PublicationsTopStrip'
import { drilldownTabFlexGrow } from '@/components/publications/house-drilldown-header-utils'
import { publicationsHouseDrilldown, publicationsHouseHeadings, publicationsHouseMotion } from '@/components/publications/publications-house-style'
import { Badge, Button, DrilldownSheet, Input, SelectContent, SelectItem, SelectPrimitive, SelectTrigger, SelectValue, Sheet, SheetContent, Table, TableBody, TableCell, TableHead, TableHeader, TableRow, Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui'
import { API_BASE_URL } from '@/lib/api'
import { houseForms, houseLayout, houseNavigation, houseSurfaces, houseTables, houseTypography } from '@/lib/house-style'
import {
  deletePublicationFile,
  downloadPublicationFile,
  fetchPublicationAiInsights,
  fetchPublicationAuthors,
  fetchPublicationDetail,
  fetchPublicationFiles,
  fetchPublicationImpact,
  fetchPublicationPaperModel,
  fetchPersonaSyncJob,
  fetchMe,
  fetchPersonaState,
  fetchPublicationsAnalytics,
  fetchPublicationsTopMetrics,
  listPersonaJournals,
  triggerPublicationsTopMetricsRefresh,
  linkPublicationOpenAccessPdf,
  listPersonaSyncJobs,
  renamePublicationFile,
  updatePublicationFile,
  uploadPublicationFile,
} from '@/lib/impact-api'
import { getSectionMarkerTone } from '@/lib/section-tone'
import { cn } from '@/lib/utils'
import { readCachedPersonaState, writeCachedPersonaState } from '@/lib/persona-cache'
import { clearAuthSessionToken, getAuthSessionToken } from '@/lib/auth-session'
import type {
  AuthUser,
  PublicationAiInsightsResponsePayload,
  PublicationAuthorsPayload,
  PublicationDetailPayload,
  PublicationFileClassification,
  PublicationFilePayload,
  PublicationFilesListPayload,
  PublicationImpactResponsePayload,
  PublicationMetricTilePayload,
  PublicationPaperModelResponsePayload,
  PersonaJournal,
  PersonaWork,
  PersonaStatePayload,
  PersonaSyncJobPayload,
  PublicationsAnalyticsResponsePayload,
  PublicationsAnalyticsSummaryPayload,
  PublicationsAnalyticsTopDriversPayload,
  PublicationsTopMetricsPayload,
} from '@/types/impact'

type PublicationLibraryViewMode = 'publications' | 'journals'
type PublicationSortField = 'citations' | 'year' | 'title' | 'venue' | 'work_type'
type JournalSortField =
  | 'journal'
  | 'publication_count'
  | 'share_pct'
  | 'avg_citations'
  | 'median_citations'
  | 'impact_factor'
  | 'five_year_impact_factor'
  | 'journal_citation_indicator'
  | 'cited_half_life'
  | 'is_oa'
  | 'latest_publication_year'
type LibrarySortField = PublicationSortField | JournalSortField
type SortDirection = 'asc' | 'desc'
type PublicationDetailTab = 'overview' | 'content' | 'impact' | 'files' | 'ai'
type PublicationReaderViewMode = 'structured' | 'pdf'
type PublicationsWindowMode = '1y' | '3y' | '5y' | 'all'
type PublicationTrendsVisualMode = 'bars' | 'line'
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
type PublicationOaPdfStatus = 'available' | 'missing' | 'unknown'
type PublicationOaPdfStatusRecord = {
  status: PublicationOaPdfStatus
  downloadUrl: string | null
  fileName: string | null
  updatedAt: string
}
type PublicationFileMenuState = {
  fileId: string
  x: number
  y: number
}
type PublicationFileTagMenuState = {
  fileId: string
  x: number
  y: number
}
type PublicationFileTagEditorState = {
  fileId: string
  open: boolean
  pendingClassification: PublicationFileClassification | null
}
type PublicationFileOtherLabelEditorState = {
  fileId: string
  draft: string
}
type PublicationPaperSectionPayload = PublicationPaperModelResponsePayload['payload']['sections'][number]
type PublicationPaperAssetPayload = PublicationPaperModelResponsePayload['payload']['figures'][number]
type PublicationPaperStructuredGroupPayload = {
  key: string
  label: string
  sections: PublicationPaperSectionPayload[]
  rootSections: PublicationPaperSectionPayload[]
}
type PublicationReaderNavigatorTarget =
  | { kind: 'section'; id: string }
  | { kind: 'asset'; id: string }
  | null
type PublicationReaderNavigatorItemPayload = {
  id: string
  label: string
  indent: number
  target: PublicationReaderNavigatorTarget
}
type PublicationReaderNavigatorGroupPayload = {
  id: string
  label: string
  toneClassName: string
  target: PublicationReaderNavigatorTarget
  items: PublicationReaderNavigatorItemPayload[]
}

const PUBLICATION_READER_STRUCTURED_GROUP_ORDER = [
  'abstract',
  'introduction',
  'methods',
  'results',
  'discussion',
  'conclusions',
  'references',
  'article_information',
] as const
const PUBLICATION_READER_NAVIGATOR_GROUP_DEFINITIONS = [
  {
    key: 'abstract',
    label: 'Abstract',
    toneClassName: 'bg-[#2457a6]',
  },
  {
    key: 'introduction',
    label: 'Introduction',
    toneClassName: 'bg-[#42526b]',
  },
  {
    key: 'methods',
    label: 'Methods',
    toneClassName: 'bg-[#21704a]',
  },
  {
    key: 'results',
    label: 'Results',
    toneClassName: 'bg-[#9a5a0b]',
  },
  {
    key: 'discussion',
    label: 'Discussion',
    toneClassName: 'bg-[#9a4863]',
  },
  {
    key: 'conclusions',
    label: 'Conclusion',
    toneClassName: 'bg-[#5953b2]',
  },
  {
    key: 'tables',
    label: 'Tables',
    toneClassName: 'bg-[#186e83]',
  },
  {
    key: 'figures',
    label: 'Figures',
    toneClassName: 'bg-[#a14c73]',
  },
  {
    key: 'references',
    label: 'References',
    toneClassName: 'bg-[#6b5946]',
  },
  {
    key: 'article_information',
    label: 'Article Information',
    toneClassName: 'bg-[#516170]',
  },
] as const
const PUBLICATION_READER_GROUP_TITLE_ALIASES: Record<string, string[]> = {
  abstract: ['abstract'],
  introduction: ['introduction', 'background'],
  methods: ['methods', 'methodology', 'materials and methods', 'patients and methods'],
  results: ['results'],
  discussion: ['discussion'],
  conclusions: ['conclusion', 'conclusions'],
  references: ['references'],
  article_information: ['article information', 'article information and declarations'],
}

function getPublicationReaderGroupToneClass(groupKey: string | null | undefined): string {
  return (
    PUBLICATION_READER_NAVIGATOR_GROUP_DEFINITIONS.find((definition) => definition.key === groupKey)?.toneClassName
    || 'bg-[hsl(var(--tone-neutral-300))]'
  )
}

function comparePublicationPaperSections(
  left: PublicationPaperSectionPayload,
  right: PublicationPaperSectionPayload,
): number {
  if (left.order !== right.order) {
    return left.order - right.order
  }
  return String(left.title || '').localeCompare(String(right.title || ''))
}

function formatPublicationPaperStructuredGroupLabel(value: string | null | undefined): string {
  switch (String(value || '').trim()) {
    case 'abstract':
      return 'Abstract'
    case 'overview':
      return 'Overview'
    case 'main_text':
      return 'Main text'
    case 'article_information':
      return 'Article Information'
    default:
      return formatPublicationPaperSectionKindLabel(value)
  }
}

function publicationReaderLabelSuggestsAbstractSummary(labelText: string): boolean {
  return (
    labelText.includes('already known')
    || labelText.includes('study adds')
    || labelText.includes('might affect research')
    || labelText.includes('practice or policy')
    || labelText.includes('what this study adds')
    || labelText.includes('what is already known')
  )
}

function normalizePublicationPaperDisplayGroupKey(
  section: Pick<
    PublicationPaperSectionPayload,
    | 'major_section_key'
    | 'canonical_map'
    | 'canonical_kind'
    | 'section_type'
    | 'title'
    | 'raw_label'
    | 'label_original'
    | 'label_normalized'
    | 'document_zone'
    | 'section_role'
  >,
): string | null {
  const majorKey = String(section.major_section_key || '').trim()
  const canonicalMap = String(section.canonical_map || '').trim()
  const canonicalKind = String(section.canonical_kind || '').trim()
  const sectionType = String(section.section_type || '').trim()
  const documentZone = String(section.document_zone || '').trim()
  const sectionRole = String(section.section_role || '').trim()
  const labelText = [
    section.title,
    section.raw_label,
    section.label_original,
    section.label_normalized,
  ]
    .filter(Boolean)
    .join(' ')
    .trim()
    .toLowerCase()

  if (
    canonicalMap === 'abstract'
    || canonicalKind === 'abstract'
    || majorKey === 'overview'
    || sectionRole === 'summary_box'
    || documentZone === 'front'
    || publicationReaderLabelSuggestsAbstractSummary(labelText)
    || labelText === 'abstract'
    || labelText.startsWith('abstract ')
  ) {
    return 'abstract'
  }
  if (majorKey === 'article_information' || documentZone === 'back') {
    return 'article_information'
  }
  if (sectionType === 'metadata') {
    return 'article_information'
  }
  if (sectionType === 'reference' || canonicalMap === 'references' || canonicalKind === 'references') {
    return 'references'
  }
  if (sectionType === 'asset') {
    return 'assets'
  }

  const candidate = majorKey && majorKey !== 'overview' && majorKey !== 'main_text'
    ? majorKey
    : canonicalMap || canonicalKind

  switch (candidate) {
    case 'introduction':
    case 'methods':
    case 'results':
    case 'discussion':
    case 'references':
    case 'article_information':
      return candidate
    case 'conclusion':
    case 'conclusions':
      return 'conclusions'
    default:
      break
  }

  if (labelText.includes('reference')) {
    return 'references'
  }
  if (
    labelText.includes('funding')
    || labelText.includes('conflict')
    || labelText.includes('ethic')
    || labelText.includes('acknowledg')
    || labelText.includes('author contribution')
    || labelText.includes('data availability')
  ) {
    return 'article_information'
  }
  if (labelText.includes('conclusion')) {
    return 'conclusions'
  }
  if (labelText.includes('discussion')) {
    return 'discussion'
  }
  if (labelText.includes('result')) {
    return 'results'
  }
  if (labelText.includes('method')) {
    return 'methods'
  }
  if (labelText.includes('introduction') || labelText.includes('background')) {
    return 'introduction'
  }

  return null
}

function buildPublicationReaderSyntheticAbstractSections(
  abstractText: string,
  sections: PublicationPaperSectionPayload[],
): PublicationPaperSectionPayload[] {
  const normalizedAbstract = normalizeAbstractDisplayText(abstractText).trim()
  if (!normalizedAbstract) {
    return []
  }

  const orderAnchor = sections.length > 0
    ? Math.min(...sections.map((section) => section.order))
    : 0
  const parentParagraphCount = splitLongTextIntoParagraphs(normalizedAbstract, 800).length
  const parentWordCount = normalizedAbstract.split(/\s+/).filter(Boolean).length
  const parentSection: PublicationPaperSectionPayload = {
    id: 'synthetic-reader-abstract',
    title: 'Abstract',
    raw_label: 'Abstract',
    label_original: 'Abstract',
    label_normalized: 'abstract',
    kind: 'abstract',
    canonical_kind: 'abstract',
    section_type: 'canonical',
    canonical_map: 'abstract',
    content: normalizedAbstract,
    source: 'derived',
    source_parser: null,
    order: orderAnchor - 1,
    page_start: null,
    page_end: null,
    level: 0,
    parent_id: null,
    bounding_boxes: [],
    confidence: null,
    is_generated_heading: true,
    word_count: parentWordCount,
    paragraph_count: parentParagraphCount,
    document_zone: 'front',
    section_role: 'abstract_summary',
    journal_section_family: null,
    major_section_key: 'overview',
  }

  const abstractSubsections = extractHeadingSectionsFromAbstractSource(normalizedAbstract)
  if (abstractSubsections.length < 2) {
    return [parentSection]
  }

  const subsectionKeyToCanonicalMap = (value: string): string => {
    switch (value) {
      case 'background':
        return 'introduction'
      case 'objective':
      case 'other':
        return 'abstract'
      case 'study_design':
        return 'methods'
      case 'findings':
        return 'results'
      case 'registration':
        return 'article_information'
      default:
        return value
    }
  }

  const childSections: PublicationPaperSectionPayload[] = abstractSubsections.map((subsection, index) => {
    const canonicalMap = subsectionKeyToCanonicalMap(subsection.key)
    const paragraphCount = splitLongTextIntoParagraphs(subsection.content, 800).length
    const wordCount = subsection.content.split(/\s+/).filter(Boolean).length
    return {
      id: `synthetic-reader-abstract-${subsection.key}-${index}`,
      title: subsection.label || 'Summary',
      raw_label: subsection.label || 'Summary',
      label_original: subsection.label || 'Summary',
      label_normalized: normalizePublicationReaderSectionLabel(subsection.label || 'Summary'),
      kind: canonicalMap,
      canonical_kind: canonicalMap,
      section_type: 'canonical',
      canonical_map: canonicalMap,
      content: normalizeAbstractDisplayText(subsection.content),
      source: 'derived',
      source_parser: null,
      order: orderAnchor - 0.99 + (index * 0.001),
      page_start: null,
      page_end: null,
      level: 1,
      parent_id: parentSection.id,
      bounding_boxes: [],
      confidence: null,
      is_generated_heading: true,
      word_count: wordCount,
      paragraph_count: paragraphCount,
      document_zone: 'front',
      section_role: 'abstract_summary',
      journal_section_family: null,
      major_section_key: 'overview',
    }
  })

  return [
    {
      ...parentSection,
      content: '',
      word_count: 0,
      paragraph_count: 0,
    },
    ...childSections,
  ]
}

function buildPublicationPaperDisplayGroupKeyBySectionId(
  sections: PublicationPaperSectionPayload[],
): Map<string, string> {
  const next = new Map<string, string>()
  let currentBodyGroup: string | null = null
  const orderedSections = [...sections].sort(comparePublicationPaperSections)

  for (const section of orderedSections) {
    const directGroupKey = normalizePublicationPaperDisplayGroupKey(section)
    let resolvedGroupKey = directGroupKey

    if (!resolvedGroupKey) {
      if (section.document_zone === 'front' || section.section_role === 'summary_box') {
        resolvedGroupKey = 'abstract'
      } else if (section.document_zone === 'back' || section.section_type === 'metadata') {
        resolvedGroupKey = 'article_information'
      } else if (currentBodyGroup) {
        resolvedGroupKey = currentBodyGroup
      } else {
        resolvedGroupKey = 'introduction'
      }
    }

    if (['introduction', 'methods', 'results', 'discussion', 'conclusions'].includes(resolvedGroupKey)) {
      currentBodyGroup = resolvedGroupKey
    }
    next.set(section.id, resolvedGroupKey)
  }

  return next
}

function publicationReaderSectionMatchesGroupLabel(
  section: Pick<PublicationPaperSectionPayload, 'title' | 'raw_label' | 'label_original' | 'label_normalized'>,
  groupKey: string,
): boolean {
  const aliases = PUBLICATION_READER_GROUP_TITLE_ALIASES[groupKey] || [groupKey]
  const normalizedTitle = String(
    section.title
      || section.raw_label
      || section.label_original
      || section.label_normalized
      || '',
  )
    .trim()
    .toLowerCase()
  if (!normalizedTitle) {
    return false
  }
  return aliases.includes(normalizedTitle)
}

function publicationFileDirectUrl(file: Pick<PublicationFilePayload, 'download_url' | 'oa_url'>): string {
  return String(file.download_url || file.oa_url || '').trim()
}

function publicationFileOpenAccessSourceLabel(
  file: Pick<PublicationFilePayload, 'source' | 'oa_url'>,
): string | null {
  if (file.source !== 'OA_LINK') {
    return null
  }
  const rawUrl = String(file.oa_url || '').trim()
  if (!rawUrl) {
    return 'Open access'
  }
  try {
    const host = new URL(rawUrl).hostname.toLowerCase()
    if (host === 'pmc.ncbi.nlm.nih.gov' || host === 'ftp.ncbi.nlm.nih.gov') {
      return 'PMC'
    }
    if (host === 'pubmed.ncbi.nlm.nih.gov') {
      return 'PubMed'
    }
    if (host === 'doi.org') {
      return 'DOI'
    }
    if (host.endsWith('tandfonline.com')) {
      return 'Taylor & Francis'
    }
    if (host.startsWith('www.')) {
      return host.slice(4)
    }
    return host
  } catch {
    return 'Open access'
  }
}

function normalizePublicationReaderSectionLabel(value: string | null | undefined): string {
  return String(value || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
}

function getPublicationReaderSpecialSectionTone(
  section: Pick<
    PublicationPaperSectionPayload,
    'title' | 'raw_label' | 'label_original' | 'label_normalized'
  >,
): {
  badge: string
  title: string
  icon: ReactNode
  shellClassName: string
  badgeClassName: string
} | null {
  const normalizedLabel = normalizePublicationReaderSectionLabel(
    section.title
    || section.raw_label
    || section.label_original
    || section.label_normalized,
  )
  if (!normalizedLabel) {
    return null
  }
  if (normalizedLabel.includes('already known')) {
    return {
      badge: 'Context',
      title: 'What Is Already Known',
      icon: <BookOpen className="h-4 w-4" />,
      shellClassName:
        'border-[hsl(var(--tone-accent-200))] bg-[linear-gradient(180deg,hsl(var(--tone-accent-50))_0%,white_100%)]',
      badgeClassName:
        'border-[hsl(var(--tone-accent-200))] bg-[hsl(var(--tone-accent-50))] text-[hsl(var(--tone-accent-800))]',
    }
  }
  if (normalizedLabel.includes('study adds')) {
    return {
      badge: 'Contribution',
      title: 'What This Study Adds',
      icon: <Lightbulb className="h-4 w-4" />,
      shellClassName:
        'border-[hsl(var(--tone-positive-200))] bg-[linear-gradient(180deg,hsl(var(--tone-positive-50))_0%,white_100%)]',
      badgeClassName:
        'border-[hsl(var(--tone-positive-200))] bg-[hsl(var(--tone-positive-50))] text-[hsl(var(--tone-positive-800))]',
    }
  }
  if (
    normalizedLabel.includes('might affect research')
    || normalizedLabel.includes('practice or policy')
  ) {
    return {
      badge: 'Implication',
      title: 'How This Study Might Affect Practice',
      icon: <FlaskConical className="h-4 w-4" />,
      shellClassName:
        'border-[hsl(var(--tone-warning-200))] bg-[linear-gradient(180deg,hsl(var(--tone-warning-50))_0%,white_100%)]',
      badgeClassName:
        'border-[hsl(var(--tone-warning-200))] bg-[hsl(var(--tone-warning-50))] text-[hsl(var(--tone-warning-800))]',
    }
  }
  return null
}

function resolvePublicationAssetUrl(value: string | null | undefined): string {
  const trimmed = String(value || '').trim()
  if (!trimmed) {
    return ''
  }
  if (/^https?:\/\//i.test(trimmed)) {
    return trimmed
  }
  if (trimmed.startsWith('//')) {
    if (typeof window !== 'undefined' && window.location.protocol) {
      return `${window.location.protocol}${trimmed}`
    }
    return `https:${trimmed}`
  }
  try {
    return new URL(trimmed, API_BASE_URL).toString()
  } catch {
    return trimmed
  }
}

function resolvePublicationPdfViewerUrl(value: string | null | undefined): string {
  const resolved = resolvePublicationAssetUrl(value)
  if (!resolved) {
    return ''
  }
  return resolved.includes('#') ? resolved : `${resolved}#view=FitH`
}

function isLinkedPublicationFile(file: Pick<PublicationFilePayload, 'source'>): boolean {
  return file.source === 'OA_LINK' || file.source === 'SUPPLEMENTARY_LINK'
}

function canRenamePublicationFile(file: Pick<PublicationFilePayload, 'source' | 'can_delete'> & { can_rename?: boolean }): boolean {
  return Boolean(file.can_rename ?? file.can_delete) && file.source !== 'SUPPLEMENTARY_LINK'
}

function canClassifyPublicationFile(file: Pick<PublicationFilePayload, 'source'> & { can_classify?: boolean }): boolean {
  return Boolean(file.can_classify ?? file.source !== 'SUPPLEMENTARY_LINK')
}

function formatPublicationPaperSectionKindLabel(value: string | null | undefined): string {
  const clean = String(value || '').trim()
  if (!clean) {
    return 'Section'
  }
  return clean
    .replace(/_/g, ' ')
    .toLowerCase()
    .split(' ')
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ')
}

function formatPublicationPaperSectionPageLabel(
  section: Pick<PublicationPaperSectionPayload, 'page_start' | 'page_end'>,
): string | null {
  if (!Number.isFinite(section.page_start) && !Number.isFinite(section.page_end)) {
    return null
  }
  if (Number.isFinite(section.page_start) && !Number.isFinite(section.page_end)) {
    return `Page ${section.page_start}`
  }
  if (!Number.isFinite(section.page_start) && Number.isFinite(section.page_end)) {
    return `Page ${section.page_end}`
  }
  if (section.page_start === section.page_end) {
    return `Page ${section.page_start}`
  }
  return `Pages ${section.page_start}-${section.page_end}`
}

function resolvePublicationPaperSectionAnchorPage(
  section: Pick<PublicationPaperSectionPayload, 'page_start' | 'page_end'> | null | undefined,
): number | null {
  if (!section) {
    return null
  }
  if (Number.isFinite(section.page_start)) {
    return Math.max(1, Number(section.page_start))
  }
  if (Number.isFinite(section.page_end)) {
    return Math.max(1, Number(section.page_end))
  }
  return null
}

const PUBLICATION_FILE_CLASSIFICATION_OPTIONS: Array<{
  value: PublicationFileClassification
  label: string
  badgeClassName: string
}> = [
  {
    value: 'PUBLISHED_MANUSCRIPT',
    label: 'Published manuscript',
    badgeClassName:
      'border-[hsl(211_44%_68%)] bg-[hsl(210_67%_96%)] text-[hsl(214_52%_29%)] dark:border-[hsl(211_32%_48%)] dark:bg-[hsl(211_24%_28%)] dark:text-[hsl(210_60%_86%)]',
  },
  {
    value: 'SUPPLEMENTARY_MATERIALS',
    label: 'Supplementary materials',
    badgeClassName:
      'border-[hsl(38_58%_66%)] bg-[hsl(40_85%_95%)] text-[hsl(31_62%_28%)] dark:border-[hsl(37_30%_50%)] dark:bg-[hsl(36_22%_30%)] dark:text-[hsl(39_70%_84%)]',
  },
  {
    value: 'DATASETS',
    label: 'Datasets',
    badgeClassName:
      'border-[hsl(160_34%_63%)] bg-[hsl(158_48%_95%)] text-[hsl(164_50%_24%)] dark:border-[hsl(160_24%_46%)] dark:bg-[hsl(160_18%_29%)] dark:text-[hsl(160_42%_82%)]',
  },
  {
    value: 'TABLE',
    label: 'Table',
    badgeClassName:
      'border-[hsl(265_34%_70%)] bg-[hsl(268_78%_97%)] text-[hsl(266_34%_31%)] dark:border-[hsl(266_22%_48%)] dark:bg-[hsl(267_18%_29%)] dark:text-[hsl(267_58%_84%)]',
  },
  {
    value: 'FIGURE',
    label: 'Figure',
    badgeClassName:
      'border-[hsl(188_42%_66%)] bg-[hsl(187_62%_95%)] text-[hsl(191_58%_27%)] dark:border-[hsl(190_24%_48%)] dark:bg-[hsl(191_20%_29%)] dark:text-[hsl(189_52%_83%)]',
  },
  {
    value: 'COVER_LETTER',
    label: 'Cover letter',
    badgeClassName:
      'border-[hsl(340_38%_72%)] bg-[hsl(339_75%_96%)] text-[hsl(338_42%_31%)] dark:border-[hsl(339_24%_50%)] dark:bg-[hsl(339_18%_30%)] dark:text-[hsl(339_56%_84%)]',
  },
  {
    value: 'OTHER',
    label: 'Other',
    badgeClassName:
      'border-[hsl(var(--tone-neutral-300))] bg-[hsl(var(--tone-neutral-50))] text-[hsl(var(--tone-neutral-700))] dark:border-[hsl(var(--tone-neutral-300))] dark:bg-[hsl(var(--tone-neutral-50))] dark:text-[hsl(var(--tone-neutral-800))]',
  },
]

function publicationFileClassificationOption(
  classification: PublicationFileClassification | null | undefined,
): (typeof PUBLICATION_FILE_CLASSIFICATION_OPTIONS)[number] | null {
  if (!classification) {
    return null
  }
  return PUBLICATION_FILE_CLASSIFICATION_OPTIONS.find((option) => option.value === classification) || null
}

const PUBLICATION_DETAIL_TABS: Array<{ id: PublicationDetailTab; label: string }> = [
  { id: 'overview', label: 'Overview' },
  { id: 'content', label: 'Abstract' },
  { id: 'impact', label: 'Impact' },
  { id: 'files', label: 'Files' },
  { id: 'ai', label: 'AI insights' },
]
const PUBLICATIONS_WINDOW_OPTIONS: Array<{ value: PublicationsWindowMode; label: string }> = [
  { value: '1y', label: '1y' },
  { value: '3y', label: '3y' },
  { value: '5y', label: '5y' },
  { value: 'all', label: 'Life' },
]
const PUBLICATION_TRENDS_VISUAL_OPTIONS: Array<{ value: PublicationTrendsVisualMode; label: string }> = [
  { value: 'bars', label: 'Bar view' },
  { value: 'line', label: 'Line view' },
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
  title: { visible: true, align: 'left', width: 440 },
  year: { visible: true, align: 'left', width: 92 },
  venue: { visible: true, align: 'left', width: 240 },
  work_type: { visible: true, align: 'left', width: 176 },
  article_type: { visible: true, align: 'left', width: 136 },
  citations: { visible: true, align: 'left', width: 124 },
}
const PUBLICATION_TABLE_COLUMN_WIDTH_LIMITS: Record<PublicationTableColumnKey, { min: number; max: number; growWeight: number }> = {
  title: { min: 380, max: 960, growWeight: 11.5 },
  year: { min: 96, max: 124, growWeight: 0.6 },
  venue: { min: 170, max: 360, growWeight: 2.8 },
  work_type: { min: 150, max: 220, growWeight: 0.9 },
  article_type: { min: 116, max: 176, growWeight: 0.5 },
  citations: { min: 112, max: 152, growWeight: 0.5 },
}
const PUBLICATION_TABLE_COLUMN_HARD_MIN = 56
const PUBLICATION_TABLE_COLUMN_WIDTH_MIN = 80
const PUBLICATION_TABLE_COLUMN_WIDTH_MAX = 960
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
const PUBLICATIONS_ANALYTICS_CACHE_KEY = 'aawe_publications_analytics_cache_v2'
const PUBLICATIONS_TOP_METRICS_CACHE_KEY = 'aawe_publications_top_metrics_cache_v2'
const PUBLICATIONS_ACTIVE_SYNC_JOB_STORAGE_PREFIX = 'aawe_publications_active_sync_job:'
const PUBLICATIONS_LIBRARY_COLUMNS_STORAGE_PREFIX = 'aawe_publications_library_columns:v2:'
const PUBLICATIONS_LIBRARY_PAGE_SIZE_STORAGE_PREFIX = 'aawe_publications_library_page_size:'
const PUBLICATIONS_LIBRARY_COLUMN_ORDER_STORAGE_PREFIX = 'aawe_publications_library_column_order:'
const PUBLICATIONS_LIBRARY_VISUAL_SETTINGS_STORAGE_PREFIX = 'aawe_publications_library_visual_settings:'
const PUBLICATIONS_OA_STATUS_STORAGE_PREFIX = 'aawe_publications_oa_status:'
const PUBLICATION_DETAIL_ACTIVE_TAB_STORAGE_KEY = 'aawe.pubDetail.activeTab'
const HOUSE_SECTION_ANCHOR_CLASS = houseLayout.sectionAnchor
const HOUSE_TABLE_SORT_TRIGGER_CLASS = houseTables.sortTrigger
const HOUSE_TABLE_HEAD_TEXT_CLASS = houseTypography.tableHead
const HOUSE_TABLE_CELL_TEXT_CLASS = houseTypography.tableCell
const HOUSE_BANNER_CLASS = houseSurfaces.banner
const HOUSE_BANNER_INFO_CLASS = houseSurfaces.bannerInfo
const HOUSE_BANNER_DANGER_CLASS = houseSurfaces.bannerDanger
const HOUSE_BANNER_PUBLICATIONS_CLASS = houseSurfaces.bannerPublications
const HOUSE_PUBLICATION_TEXT_CLASS = publicationsHouseHeadings.text
const HOUSE_PUBLICATION_DRILLDOWN_STAT_CARD_CLASS = publicationsHouseDrilldown.statCard
const HOUSE_PUBLICATION_DRILLDOWN_ALERT_CLASS = publicationsHouseDrilldown.alert
const HOUSE_PUBLICATION_DRILLDOWN_STAT_TITLE_CLASS = publicationsHouseDrilldown.statTitle
const HOUSE_PUBLICATION_DRILLDOWN_NOTE_SOFT_CLASS = publicationsHouseDrilldown.noteSoft
const HOUSE_PUBLICATION_DRILLDOWN_NOTE_WARNING_CLASS = publicationsHouseDrilldown.noteWarning
const HOUSE_PUBLICATION_DRILLDOWN_LINK_CLASS = publicationsHouseDrilldown.link
const HOUSE_PUBLICATION_DRILLDOWN_SUMMARY_STAT_TITLE_CLASS = publicationsHouseDrilldown.summaryStatTitle
const HOUSE_PUBLICATION_DRILLDOWN_SUMMARY_STAT_VALUE_CLASS = publicationsHouseDrilldown.summaryStatValue
const HOUSE_PUBLICATION_DRILLDOWN_SUMMARY_STAT_VALUE_WRAP_CLASS = publicationsHouseDrilldown.summaryStatValueWrap
const HOUSE_PUBLICATION_DRILLDOWN_FILE_DROP_CLASS = publicationsHouseDrilldown.fileDrop
const HOUSE_PUBLICATION_DRILLDOWN_FILE_DROP_ACTIVE_CLASS = publicationsHouseDrilldown.fileDropActive
const HOUSE_PUBLICATION_DRILLDOWN_TRANSITION_CLASS = publicationsHouseMotion.labelTransition
const HOUSE_PUBLICATION_DRILLDOWN_SHEET_CLASS = publicationsHouseDrilldown.sheet
const HOUSE_PUBLICATION_DRILLDOWN_SHEET_BODY_CLASS = publicationsHouseDrilldown.sheetBody
const HOUSE_DRILLDOWN_TOGGLE_MUTED_CLASS = publicationsHouseDrilldown.toggleButtonMuted
const HOUSE_DRILLDOWN_CHART_CONTROLS_ROW_CLASS = publicationsHouseDrilldown.chartControlsRow
const HOUSE_DRILLDOWN_CHART_CONTROLS_LEFT_CLASS = publicationsHouseDrilldown.chartControlsLeft
const HOUSE_TOGGLE_TRACK_CLASS = publicationsHouseMotion.toggleTrack
const HOUSE_TOGGLE_THUMB_CLASS = publicationsHouseMotion.toggleThumb
const HOUSE_TOGGLE_BUTTON_CLASS = publicationsHouseMotion.toggleButton
const HOUSE_TOGGLE_CHART_BAR_CLASS = publicationsHouseMotion.toggleChartBar
const HOUSE_METRIC_TOGGLE_TRACK_CLASS = HOUSE_TOGGLE_TRACK_CLASS
const HOUSE_PUBLICATION_DRILLDOWN_VALUE_POSITIVE_CLASS = publicationsHouseDrilldown.valuePositive
const HOUSE_PUBLICATION_DRILLDOWN_VALUE_NEGATIVE_CLASS = publicationsHouseDrilldown.valueNegative
const HOUSE_INPUT_CLASS = houseForms.input
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
  report: 'Report',
  'working-paper': 'Working paper',
  thesis: 'Dissertation',
  patent: 'Patent',
  standard: 'Standard',
  software: 'Software',
  editorial: 'Editorial',
  letter: 'Letter',
  erratum: 'Erratum',
  retracted: 'Retracted',
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
    return 'Original research'
  }
  if (ARTICLE_TYPE_META_ANALYSIS_PATTERN.test(clean)) {
    return 'Systematic review'
  }
  if (ARTICLE_TYPE_SCOPING_PATTERN.test(clean)) {
    return 'Systematic review'
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
  return 'Original research'
}

function deriveArticleTypeLabel(work: {
  work_type?: string | null
  publication_type?: string | null
  title?: string | null
  venue_name?: string | null
}): string {
  const classification = String(work.publication_type || '').trim()
  if (classification) {
    const normalizedClassification = classification
      .toLowerCase()
      .replace(/[_-]+/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
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
      return 'Systematic review'
    }
    if (normalizedClassification === 'scoping' || normalizedClassification === 'scoping review' || normalizedClassification === 'evidence map') {
      return 'Systematic review'
    }
    if (normalizedClassification === 'systematic review') {
      return 'Systematic review'
    }
    if (
      normalizedClassification === 'original' ||
      normalizedClassification === 'original article' ||
      normalizedClassification === 'original research' ||
      normalizedClassification === 'research article'
    ) {
      return 'Original research'
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
      if (/^[A-Z0-9&.-]{2,}$/.test(core)) {
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

const JOURNAL_TABLE_METRIC_PILL_BASE_CLASS = 'mx-auto inline-flex min-h-7 min-w-[5.15rem] items-center justify-center rounded-md px-2.5 py-1 text-[0.74rem] font-semibold tabular-nums shadow-[0_1px_2px_hsl(var(--tone-neutral-950)/0.04)]'
function renderJournalPlainNumericMetric(value: number | null | undefined, digits = 1): ReactNode {
  if (value == null || Number.isNaN(value)) {
    return <span className="text-[hsl(var(--tone-neutral-400))]">n/a</span>
  }
  return value.toFixed(digits)
}

function renderJournalCitationIndicatorPill(value: number | null | undefined): ReactNode {
  if (value == null || Number.isNaN(value)) {
    return (
      <Badge
        variant="outline"
        className={cn(
          JOURNAL_TABLE_METRIC_PILL_BASE_CLASS,
          'border-[hsl(var(--tone-neutral-250))] bg-[hsl(var(--tone-neutral-50))] text-[hsl(var(--tone-neutral-500))]',
        )}
      >
        n/a
      </Badge>
    )
  }
  const toneClass = value >= 2
    ? 'border-[hsl(var(--tone-positive-400))] bg-[hsl(var(--tone-positive-100))] text-[hsl(var(--tone-positive-900))]'
    : value >= 1
      ? 'border-[hsl(var(--tone-positive-300))] bg-[hsl(var(--tone-positive-50))] text-[hsl(var(--tone-positive-800))]'
      : 'border-[hsl(var(--tone-neutral-300))] bg-[hsl(var(--tone-neutral-100))] text-[hsl(var(--tone-neutral-700))]'
  return (
    <Badge variant="outline" className={cn(JOURNAL_TABLE_METRIC_PILL_BASE_CLASS, toneClass)}>
      {value.toFixed(2)}
    </Badge>
  )
}

function renderJournalPlainTextMetric(value: string | null | undefined): ReactNode {
  const clean = String(value || '').trim()
  if (!clean) {
    return <span className="text-[hsl(var(--tone-neutral-400))]">n/a</span>
  }
  return clean
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

function loadCachedAnalyticsResponseForUser(userId: string | null | undefined): PublicationsAnalyticsResponsePayload | null {
  if (typeof window === 'undefined') {
    return null
  }
  const cleanUserId = String(userId || '').trim()
  const scopedKey = cleanUserId
    ? `${PUBLICATIONS_ANALYTICS_CACHE_KEY}:${cleanUserId}`
    : PUBLICATIONS_ANALYTICS_CACHE_KEY
  const scopedRaw = window.localStorage.getItem(scopedKey)
  if (scopedRaw) {
    try {
      return JSON.parse(scopedRaw) as PublicationsAnalyticsResponsePayload
    } catch {
      // Fall back to legacy key below.
    }
  }
  return loadCachedAnalyticsResponse()
}

function saveCachedAnalyticsResponse(value: PublicationsAnalyticsResponsePayload, userId?: string | null): void {
  if (typeof window === 'undefined') {
    return
  }
  const cleanUserId = String(userId || '').trim()
  const targetKey = cleanUserId
    ? `${PUBLICATIONS_ANALYTICS_CACHE_KEY}:${cleanUserId}`
    : PUBLICATIONS_ANALYTICS_CACHE_KEY
  window.localStorage.setItem(targetKey, JSON.stringify(value))
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

function loadCachedTopMetricsResponseForUser(userId: string | null | undefined): PublicationsTopMetricsPayload | null {
  if (typeof window === 'undefined') {
    return null
  }
  const cleanUserId = String(userId || '').trim()
  const scopedKey = cleanUserId
    ? `${PUBLICATIONS_TOP_METRICS_CACHE_KEY}:${cleanUserId}`
    : PUBLICATIONS_TOP_METRICS_CACHE_KEY
  const scopedRaw = window.localStorage.getItem(scopedKey)
  if (scopedRaw) {
    try {
      return JSON.parse(scopedRaw) as PublicationsTopMetricsPayload
    } catch {
      // Fall back to legacy key below.
    }
  }
  return loadCachedTopMetricsResponse()
}

function saveCachedTopMetricsResponse(value: PublicationsTopMetricsPayload, userId?: string | null): void {
  if (typeof window === 'undefined') {
    return
  }
  const cleanUserId = String(userId || '').trim()
  const targetKey = cleanUserId
    ? `${PUBLICATIONS_TOP_METRICS_CACHE_KEY}:${cleanUserId}`
    : PUBLICATIONS_TOP_METRICS_CACHE_KEY
  window.localStorage.setItem(targetKey, JSON.stringify(value))
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

export function loadPublicationTableColumnOrderPreference(userId: string): PublicationTableColumnKey[] {
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

export function savePublicationTableColumnOrderPreference(userId: string, order: PublicationTableColumnKey[]): void {
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
  const primarySample = input.works.slice(0, Math.min(sampleSize, 140))
  const longestCandidates = [...input.works]
    .sort((left, right) => {
      const leftScore =
        String(left.title || '').length * 2 +
        String(left.venue_name || '').length +
        String(left.work_type || '').length +
        String(left.article_type || '').length
      const rightScore =
        String(right.title || '').length * 2 +
        String(right.venue_name || '').length +
        String(right.work_type || '').length +
        String(right.article_type || '').length
      return rightScore - leftScore
    })
    .slice(0, Math.min(input.works.length, 120))
  const sample: PersonaWork[] = []
  const seenSampleIds = new Set<string>()
  for (const work of [...primarySample, ...longestCandidates]) {
    if (sample.length >= sampleSize) {
      break
    }
    const key = String(work.id || '').trim() || `${work.title || ''}|${work.year || ''}|${work.venue_name || ''}`
    if (seenSampleIds.has(key)) {
      continue
    }
    seenSampleIds.add(key)
    sample.push(work)
  }
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
    column === 'title' || column === 'venue'
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
        let worstRowLines = 1
        let worstTitleLines = 1
        for (let index = 0; index < sample.length; index += 1) {
          let rowLines = 1
          let titleLines = 1
          for (const column of optimizeColumns) {
            const width = candidateWidths[column] || measured[column]
            const text = valuesByColumn[column][index] || ''
            const wrappedLines = estimateWrappedLineCount(text, width)
            rowLines = Math.max(rowLines, wrappedLines)
            if (column === 'title') {
              titleLines = wrappedLines
            }
          }
          worstRowLines = Math.max(worstRowLines, rowLines)
          worstTitleLines = Math.max(worstTitleLines, titleLines)
          score += rowLines * rowLines
          score += Math.max(0, titleLines - 2) * 14
          score += Math.max(0, titleLines - 3) * 28
        }

        const titleWidth = candidateWidths.title || measured.title
        score += worstRowLines * 10
        score += worstTitleLines * 18
        score += Math.max(0, Math.ceil((640 - titleWidth) / 12))

        const venueWidth = candidateWidths.venue || measured.venue
        score += Math.max(0, Math.ceil((240 - venueWidth) / 24))

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

function publicationsOaStatusStorageKey(userId: string): string {
  return `${PUBLICATIONS_OA_STATUS_STORAGE_PREFIX}${userId}`
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
        rawStatus === 'available'
          ? 'available'
          : rawStatus === 'missing' || rawStatus === 'checking'
            ? 'missing'
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
  work: { doi?: string | null; has_open_access_pdf?: boolean | null },
  record: PublicationOaPdfStatusRecord | null | undefined,
): PublicationOaPdfStatus {
  if (record?.status) {
    return record.status
  }
  if (work.has_open_access_pdf) {
    return 'available'
  }
  const hasDoi = Boolean((work.doi || '').trim())
  if (!hasDoi) {
    return 'missing'
  }
  return 'missing'
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
  if (status === 'missing' && !hasDoi) {
    return 'Open-access PDF unavailable (missing DOI)'
  }
  if (status === 'missing') {
    return 'Open-access PDF not found'
  }
  return 'Open-access PDF status pending'
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

function normalizeAbstractDisplayText(value: string): string {
  const decoded = String(value || '')
    .replace(/&lt;br\s*\/?&gt;/gi, '\n')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>\s*<p[^>]*>/gi, '\n\n')
    .replace(/<\/?p[^>]*>/gi, '\n')
    .replace(/\u00a0/g, ' ')
  return decoded
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n[ \t]+/g, '\n')
    .replace(/[ \t]{2,}/g, ' ')
    .trim()
}

function splitLongTextIntoParagraphs(value: string, maxParagraphLength = 800): string[] {
  const raw = normalizeAbstractDisplayText(value).replace(/\r\n/g, '\n').trim()
  if (!raw) {
    return []
  }

  const manualParagraphs = raw
    .split(/\n{2,}/)
    .map((paragraph) => paragraph.replace(/\s*\n+\s*/g, ' ').replace(/\s+/g, ' ').trim())
    .filter(Boolean)
  if (manualParagraphs.length > 1) {
    return manualParagraphs
  }

  const normalized = raw.replace(/\s+/g, ' ').trim()
  if (normalized.length <= Math.round(maxParagraphLength * 1.2)) {
    return [normalized]
  }
  const sentences = normalized
    .split(/(?<=[.!?])\s+/)
    .map((sentence) => sentence.trim())
    .filter(Boolean)
  if (sentences.length < 4) {
    return [normalized]
  }

  const paragraphs: string[] = []
  let current = ''
  const minimumParagraphLength = Math.max(300, Math.floor(maxParagraphLength * 0.6))
  for (const sentence of sentences) {
    if (!current) {
      current = sentence
      continue
    }
    if (
      current.length + sentence.length + 1 <= maxParagraphLength
      || current.length < minimumParagraphLength
    ) {
      current = `${current} ${sentence}`
      continue
    }
    paragraphs.push(current)
    current = sentence
  }
  if (current) {
    paragraphs.push(current)
  }

  return paragraphs
}

function extractRegistrationSectionContent(value: string): string {
  const text = normalizeAbstractDisplayText(value)
  if (!text) {
    return ''
  }
  const sentences = text
    .split(/(?<=[.!?])\s+/)
    .map((sentence) => sentence.trim())
    .filter(Boolean)
  const registrationPattern =
    /\b(prospero|trial registration|registration number|clinicaltrials\.gov|nct\d{8}|crd\d{6,}|isrctn\d+)\b/i
  const matches = sentences.filter((sentence) => registrationPattern.test(sentence))
  return matches.join(' ').trim()
}

type LocalAbstractSection = {
  key: string
  label: string
  content: string
}

function canonicalAbstractSectionKey(value: string): string {
  const clean = String(value || '').trim().toLowerCase()
  if (!clean) {
    return 'other'
  }
  if (/(intro|background|objective|aim|purpose)/i.test(clean)) {
    return 'introduction'
  }
  if (/(method|materials and methods|study design|design)/i.test(clean)) {
    return 'methods'
  }
  if (/(result|finding|outcome|analysis)/i.test(clean)) {
    return 'results'
  }
  if (/(conclusion|discussion|implication|interpretation)/i.test(clean)) {
    return 'conclusions'
  }
  if (/(registration|prospero|clinicaltrials|nct|isrctn|crd)/i.test(clean)) {
    return 'registration'
  }
  return 'other'
}

function normalizeAbstractHeadingLabel(value: string): string {
  const clean = String(value || '').trim().replace(/\s+/g, ' ')
  if (!clean) {
    return 'Summary'
  }
  if (clean.toUpperCase() === clean) {
    return clean.toLowerCase().replace(/\b\w/g, (char) => char.toUpperCase())
  }
  return clean.charAt(0).toUpperCase() + clean.slice(1)
}

function extractHeadingSectionsFromAbstractSource(value: string): LocalAbstractSection[] {
  const text = normalizeAbstractDisplayText(value)
  if (!text) {
    return []
  }
  const headingPattern = /(?:^|(?<=[\n\r])|(?<=[.!?]\s))(background|introduction|aims?|objective|objectives|purpose|methods?|materials and methods|study design|design|results?|findings?|conclusion|conclusions|discussion|trial registration(?: number)?|registration(?: number)?|prospero registration|prospero)\s*:?\s*/gim
  const matches = Array.from(text.matchAll(headingPattern))
  if (!matches.length) {
    return []
  }

  const sections: LocalAbstractSection[] = []
  for (let index = 0; index < matches.length; index += 1) {
    const match = matches[index]
    const heading = normalizeAbstractHeadingLabel(String(match[1] || '').trim())
    const start = Number(match.index || 0) + String(match[0] || '').length
    const end = index + 1 < matches.length ? Number(matches[index + 1].index || text.length) : text.length
    const content = normalizeAbstractDisplayText(text.slice(start, end))
    if (!content) {
      continue
    }
    sections.push({
      key: canonicalAbstractSectionKey(heading),
      label: heading,
      content,
    })
  }
  return sections
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

function openBlobInNewTab(blob: Blob): void {
  const url = window.URL.createObjectURL(blob)
  const opened = window.open(url, '_blank', 'noopener,noreferrer')
  window.setTimeout(() => {
    if (!opened || opened.closed) {
      return
    }
    window.URL.revokeObjectURL(url)
  }, 60_000)
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

function buildTileToggleThumbStyle(activeIndex: number, optionCount: number, isEntryCycle = false): CSSProperties {
  const safeCount = Math.max(1, optionCount)
  const safeIndex = Math.max(0, Math.min(activeIndex, safeCount - 1))
  const widthPercent = 100 / safeCount
  const leftPercent = safeIndex * widthPercent
  const finalWidth = `${safeIndex === safeCount - 1 ? 100 - leftPercent : widthPercent}%`
  return {
    width: finalWidth,
    left: `${leftPercent}%`,
    willChange: 'left,width',
    transitionDuration: isEntryCycle ? '0ms' : undefined,
  }
}

function PublicationTrendsVisualToggle({
  value,
  onChange,
}: {
  value: PublicationTrendsVisualMode
  onChange: (mode: PublicationTrendsVisualMode) => void
}) {
  const activeVisualModeIndex = PUBLICATION_TRENDS_VISUAL_OPTIONS.findIndex((option) => option.value === value)

  return (
    <div className="house-approved-toggle-context inline-flex items-center" data-stop-tile-open="true">
      <div
        className={cn(HOUSE_METRIC_TOGGLE_TRACK_CLASS, 'grid-cols-2')}
        data-stop-tile-open="true"
        data-ui="publications-trends-visual-toggle"
        data-house-role="chart-toggle"
        style={{ width: '5.25rem' }}
      >
        <span
          className={HOUSE_TOGGLE_THUMB_CLASS}
          style={buildTileToggleThumbStyle(activeVisualModeIndex, PUBLICATION_TRENDS_VISUAL_OPTIONS.length, false)}
          aria-hidden="true"
        />
        <button
          type="button"
          data-stop-tile-open="true"
          className={cn(HOUSE_TOGGLE_BUTTON_CLASS, value === 'bars' ? 'text-white' : HOUSE_DRILLDOWN_TOGGLE_MUTED_CLASS)}
          aria-pressed={value === 'bars'}
          onClick={(event) => {
            event.stopPropagation()
            onChange('bars')
          }}
          onMouseDown={(event) => event.stopPropagation()}
        >
          <svg viewBox="0 0 16 16" aria-hidden="true" className={cn(HOUSE_TOGGLE_CHART_BAR_CLASS, 'h-3.5 w-3.5 fill-current')}>
            <rect x="2" y="8.5" width="2.2" height="5.5" rx="0.6" />
            <rect x="6.3" y="5.8" width="2.2" height="8.2" rx="0.6" />
            <rect x="10.6" y="3.5" width="2.2" height="10.5" rx="0.6" />
          </svg>
        </button>
        <button
          type="button"
          data-stop-tile-open="true"
          className={cn(HOUSE_TOGGLE_BUTTON_CLASS, value === 'line' ? 'text-white' : HOUSE_DRILLDOWN_TOGGLE_MUTED_CLASS)}
          aria-pressed={value === 'line'}
          onClick={(event) => {
            event.stopPropagation()
            onChange('line')
          }}
          onMouseDown={(event) => event.stopPropagation()}
        >
          <svg viewBox="0 0 16 16" aria-hidden="true" className="h-3.5 w-3.5">
            <polyline
              points="2,11 6,8 9,9 14,4"
              fill="none"
              className="house-toggle-chart-line"
              stroke="currentColor"
              strokeWidth="1.8"
              strokeLinecap="round"
              strokeLinejoin="round"
              data-expanded="true"
            />
            <circle cx="2" cy="11" r="1.1" fill="currentColor" />
            <circle cx="6" cy="8" r="1.1" fill="currentColor" />
            <circle cx="9" cy="9" r="1.1" fill="currentColor" />
            <circle cx="14" cy="4" r="1.1" fill="currentColor" />
          </svg>
        </button>
      </div>
    </div>
  )
}

function SortHeader({
  label,
  column,
  sortField,
  sortDirection,
  align = 'left',
  onSort,
}: {
  label: ReactNode
  column: LibrarySortField
  sortField: LibrarySortField
  sortDirection: SortDirection
  align?: PublicationTableColumnAlign
  onSort: (column: LibrarySortField) => void
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
      <span className="min-w-0 leading-tight">{label}</span>
      {active ? (
        sortDirection === 'desc' ? (
          <ChevronDown className="h-3.5 w-3.5 shrink-0 self-center text-foreground" />
        ) : (
          <ChevronUp className="h-3.5 w-3.5 shrink-0 self-center text-foreground" />
        )
      ) : (
        <ChevronsUpDown className="h-3.5 w-3.5 shrink-0 self-center" />
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
  const [searchParams, setSearchParams] = useSearchParams()
  const requestedWorkIdFromQuery = String(searchParams.get('work') || '').trim()
  const requestedDetailTabFromQuery = String(searchParams.get('tab') || '').trim()
  const requestedPublicationDetailTab: PublicationDetailTab = (
    requestedDetailTabFromQuery === 'content'
    || requestedDetailTabFromQuery === 'impact'
    || requestedDetailTabFromQuery === 'files'
    || requestedDetailTabFromQuery === 'ai'
  )
    ? requestedDetailTabFromQuery
    : 'overview'
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
  const initialCachedAnalyticsResponse = fixture?.analyticsResponse ?? loadCachedAnalyticsResponseForUser(initialCachedUser?.id)
  const initialCachedAnalyticsSummary = analyticsSummaryFromResponse(initialCachedAnalyticsResponse)
  const initialCachedAnalyticsTopDrivers = analyticsTopDriversFromResponse(initialCachedAnalyticsResponse)
  const initialCachedTopMetricsResponse = fixture?.topMetricsResponse ?? loadCachedTopMetricsResponseForUser(initialCachedUser?.id)
  const [token, setToken] = useState<string>(() => fixture?.token ?? getAuthSessionToken())
  const [user, setUser] = useState<AuthUser | null>(initialCachedUser)
  const [personaState, setPersonaState] = useState<PersonaStatePayload | null>(initialCachedPersonaState)
  const [analyticsResponse, setAnalyticsResponse] = useState<PublicationsAnalyticsResponsePayload | null>(initialCachedAnalyticsResponse)
  const [analyticsSummary, setAnalyticsSummary] = useState<PublicationsAnalyticsSummaryPayload | null>(initialCachedAnalyticsSummary)
  const [, setAnalyticsTopDrivers] = useState<PublicationsAnalyticsTopDriversPayload | null>(initialCachedAnalyticsTopDrivers)
  const [topMetricsResponse, setTopMetricsResponse] = useState<PublicationsTopMetricsPayload | null>(initialCachedTopMetricsResponse)
  const [query, setQuery] = useState('')
  const [publicationTableLayoutWidth, setPublicationTableLayoutWidth] = useState(1100)
  const [publicationTableColumnOrder, setPublicationTableColumnOrder] = useState<PublicationTableColumnKey[]>([...PUBLICATION_TABLE_COLUMN_ORDER])
  const [publicationTableColumns, setPublicationTableColumns] = useState<Record<PublicationTableColumnKey, PublicationTableColumnPreference>>(
    () => (
      initialCachedUser?.id
        ? loadPublicationTableColumnPreferences(initialCachedUser.id)
        : createDefaultPublicationTableColumnPreferences()
    ),
  )
  const [publicationLibraryViewMode, setPublicationLibraryViewMode] = useState<PublicationLibraryViewMode>('publications')
  const [sortField, setSortField] = useState<PublicationSortField>('year')
  const [sortDirection, setSortDirection] = useState<SortDirection>('desc')
  const [journalSortField, setJournalSortField] = useState<JournalSortField>('publication_count')
  const [journalSortDirection, setJournalSortDirection] = useState<SortDirection>('desc')
  const [personaJournals, setPersonaJournals] = useState<PersonaJournal[]>([])
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
  const [publicationTrajectoryWindowMode, setPublicationTrajectoryWindowMode] = useState<PublicationsWindowMode>('all')
  const [publicationTrajectoryVisualMode, setPublicationTrajectoryVisualMode] = useState<PublicationTrendsVisualMode>('bars')
  const [detailCacheByWorkId, setDetailCacheByWorkId] = useState<Record<string, PublicationDetailPayload>>({})
  const [authorsCacheByWorkId, setAuthorsCacheByWorkId] = useState<Record<string, PublicationAuthorsPayload>>({})
  const [impactCacheByWorkId, setImpactCacheByWorkId] = useState<Record<string, PublicationImpactResponsePayload>>({})
  const [aiCacheByWorkId, setAiCacheByWorkId] = useState<Record<string, PublicationAiInsightsResponsePayload>>({})
  const [paperModelCacheByWorkId, setPaperModelCacheByWorkId] = useState<Record<string, PublicationPaperModelResponsePayload>>({})
  const [filesCacheByWorkId, setFilesCacheByWorkId] = useState<Record<string, PublicationFilesListPayload>>(
    () => fixture?.filesByWorkId ?? {},
  )
  const [, setPaneLoadingByKey] = useState<Record<string, boolean>>({})
  const [paneErrorByKey, setPaneErrorByKey] = useState<Record<string, string>>({})
  const [expandedAbstractByWorkId, setExpandedAbstractByWorkId] = useState<Record<string, boolean>>({})
  const [contentModeByWorkId] = useState<Record<string, 'plain' | 'highlighted'>>({})
  const [uploadingFile, setUploadingFile] = useState(false)
  const [findingOaFile, setFindingOaFile] = useState(false)
  const [oaPdfStatusByWorkId, setOaPdfStatusByWorkId] = useState<Record<string, PublicationOaPdfStatusRecord>>({})
  const [downloadingFileId, setDownloadingFileId] = useState<string | null>(null)
  const [deletingFileId, setDeletingFileId] = useState<string | null>(null)
  const [savingPublicationFileId, setSavingPublicationFileId] = useState<string | null>(null)
  const [renamingPublicationFileId, setRenamingPublicationFileId] = useState<string | null>(null)
  const [publicationFileRenameDraft, setPublicationFileRenameDraft] = useState('')
  const [publicationFileMenuState, setPublicationFileMenuState] = useState<PublicationFileMenuState | null>(null)
  const [publicationFileTagMenuState, setPublicationFileTagMenuState] = useState<PublicationFileTagMenuState | null>(null)
  const [publicationFileTagEditorState, setPublicationFileTagEditorState] = useState<PublicationFileTagEditorState | null>(null)
  const [publicationFileOtherLabelEditorState, setPublicationFileOtherLabelEditorState] = useState<PublicationFileOtherLabelEditorState | null>(null)
  const [publicationReaderOpen, setPublicationReaderOpen] = useState(false)
  const [publicationReaderLoading, setPublicationReaderLoading] = useState(false)
  const [publicationReaderError, setPublicationReaderError] = useState('')
  const [publicationReaderActiveSectionId, setPublicationReaderActiveSectionId] = useState<string | null>(null)
  const [publicationReaderPdfPage, setPublicationReaderPdfPage] = useState(1)
  const [publicationReaderViewMode, setPublicationReaderViewMode] = useState<PublicationReaderViewMode>('structured')
  const [publicationReaderAwaitingPdfUpgrade, setPublicationReaderAwaitingPdfUpgrade] = useState(false)
  const [publicationReaderCollapsedNodeIds, setPublicationReaderCollapsedNodeIds] = useState<Record<string, boolean>>({})
  const [publicationReaderInspectorOpen, setPublicationReaderInspectorOpen] = useState(false)
  const [filesDragOver, setFilesDragOver] = useState(false)
  const [publicationLibraryVisible, setPublicationLibraryVisible] = useState(true)
  const [publicationLibraryFiltersVisible, setPublicationLibraryFiltersVisible] = useState(false)
  const [publicationLibrarySearchVisible, setPublicationLibrarySearchVisible] = useState(false)
  const [publicationLibraryDownloadVisible, setPublicationLibraryDownloadVisible] = useState(false)
  const [publicationLibrarySettingsVisible, setPublicationLibrarySettingsVisible] = useState(false)
  const [publicationLibraryDownloadFormat, setPublicationLibraryDownloadFormat] = useState<PublicationExportFormat>('xlsx')
  const [publicationLibraryDownloadScope, setPublicationLibraryDownloadScope] = useState<PublicationExportScope>('filtered_results')
  const [publicationLibrarySearchPopoverPosition, setPublicationLibrarySearchPopoverPosition] = useState({ top: 0, right: 0 })
  const [publicationLibraryFilterPopoverPosition, setPublicationLibraryFilterPopoverPosition] = useState({ top: 0, right: 0 })
  const [publicationLibraryDownloadPopoverPosition, setPublicationLibraryDownloadPopoverPosition] = useState({ top: 0, right: 0 })
  const [publicationLibrarySettingsPopoverPosition, setPublicationLibrarySettingsPopoverPosition] = useState({ top: 0, right: 0 })
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
  const [selectedPublicationTypes, setSelectedPublicationTypes] = useState<string[]>([])
  const [selectedArticleTypes, setSelectedArticleTypes] = useState<string[]>([])
  const [publicationLibraryToolsOpen, setPublicationLibraryToolsOpen] = useState(false)
  const detailWarmupInFlightRef = useRef<Set<string>>(new Set())
  const authorsWarmupInFlightRef = useRef<Set<string>>(new Set())
  const filesWarmupInFlightRef = useRef<Set<string>>(new Set())
  const paperModelWarmupInFlightRef = useRef<Set<string>>(new Set())
  const paperModelRequestCountByWorkIdRef = useRef<Map<string, number>>(new Map())
  const paperModelLatestRequestTokenByWorkIdRef = useRef<Map<string, number>>(new Map())
  const filesWarmupCompletedRef = useRef<Set<string>>(new Set())
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
  const publicationTableAutoFitAppliedRef = useRef(false)
  const publicationTableLastAutoFitWidthRef = useRef<number | null>(null)
  const publicationTablePrefsLoadedRef = useRef(false)
  const publicationTableResizeRef = useRef<{
    column: PublicationTableColumnKey
    visibleColumns: PublicationTableColumnKey[]
    startX: number
    startWidths: Partial<Record<PublicationTableColumnKey, number>>
  } | null>(null)
  const filePickerRef = useRef<HTMLInputElement | null>(null)
  const publicationReaderSectionRefs = useRef<Record<string, HTMLElement | null>>({})
  const publicationReaderScrollViewportRef = useRef<HTMLElement | null>(null)
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
      const journalsPromise = listPersonaJournals(sessionToken)
      const userPromise = fetchMe(sessionToken)
      const jobsPromise = listPersonaSyncJobs(sessionToken, 5)
      const analyticsPromise = fetchPublicationsAnalytics(sessionToken)
      const topMetricsPromise = fetchPublicationsTopMetrics(sessionToken)

      // Prioritize top metrics hydration so the top strip can render while other calls continue.
      void topMetricsPromise
        .then((value) => {
          setTopMetricsResponse(value)
          saveCachedTopMetricsResponse(value, user?.id)
        })
        .catch((topMetricsError) => {
          const message = topMetricsError instanceof Error ? topMetricsError.message : 'Publications top metrics lookup failed.'
          setStatus(message)
        })

      const settled = await Promise.allSettled([
        personaPromise,
        journalsPromise,
        userPromise,
        jobsPromise,
        analyticsPromise,
        topMetricsPromise,
      ])
      const [stateResult, journalsResult, userResult, jobsResult, analyticsResult, topMetricsResult] = settled
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
      if (journalsResult.status === 'fulfilled') {
        setPersonaJournals(journalsResult.value)
      } else if (!background) {
        setPersonaJournals([])
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
        saveCachedAnalyticsResponse(
          analyticsResult.value,
          userResult.status === 'fulfilled' ? userResult.value.id : user?.id,
        )
        setAnalyticsSummary(analyticsSummaryFromResponse(analyticsResult.value))
        setAnalyticsTopDrivers(analyticsTopDriversFromResponse(analyticsResult.value))
      }
      if (topMetricsResult.status === 'fulfilled') {
        setTopMetricsResponse(topMetricsResult.value)
        saveCachedTopMetricsResponse(
          topMetricsResult.value,
          userResult.status === 'fulfilled' ? userResult.value.id : user?.id,
        )
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
  }, [navigate, user?.id])

  useEffect(() => {
    saveActivePublicationDetailTab(activeDetailTab)
  }, [activeDetailTab])

  useEffect(() => {
    if (!user?.id) {
      publicationTablePrefsLoadedRef.current = false
      publicationTableAutoFitAppliedRef.current = false
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
    publicationTablePrefsLoadedRef.current = true
    publicationTableAutoFitAppliedRef.current = false
    publicationTableLastAutoFitWidthRef.current = null
  }, [resolvePublicationTableAvailableWidth, user?.id])

  useEffect(() => {
    if (!user?.id) {
      return
    }
    setPublicationTableColumnOrder([...PUBLICATION_TABLE_COLUMN_ORDER])
    publicationTableAutoFitAppliedRef.current = false
    publicationTableLastAutoFitWidthRef.current = null
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
    const works = personaState?.works || []
    if (!works.length) {
      return
    }
    setOaPdfStatusByWorkId((current) => {
      let changed = false
      const next = { ...current }
      for (const work of works) {
        const existing = current[work.id]
        const nextStatus: PublicationOaPdfStatus = work.has_open_access_pdf ? 'available' : 'missing'
        if (
          existing?.status === nextStatus
          && (nextStatus !== 'missing' || (!existing.downloadUrl && !existing.fileName))
        ) {
          continue
        }
        next[work.id] = {
          status: nextStatus,
          downloadUrl: nextStatus === 'available' ? existing?.downloadUrl || null : null,
          fileName: nextStatus === 'available' ? existing?.fileName || null : null,
          updatedAt: new Date().toISOString(),
        }
        changed = true
      }
      return changed ? next : current
    })
  }, [personaState?.works])

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

  // Calculate popover positions when they become visible
  useEffect(() => {
    if (!publicationLibrarySearchVisible || !publicationLibrarySearchButtonRef.current) return
    const rect = publicationLibrarySearchButtonRef.current.getBoundingClientRect()
    setPublicationLibrarySearchPopoverPosition({
      top: rect.top,
      right: window.innerWidth - rect.left + 8, // 0.5rem = 8px gap
    })
  }, [publicationLibrarySearchVisible])

  useEffect(() => {
    if (!publicationLibraryFiltersVisible || !publicationLibraryFilterButtonRef.current) return
    const rect = publicationLibraryFilterButtonRef.current.getBoundingClientRect()
    setPublicationLibraryFilterPopoverPosition({
      top: rect.top,
      right: window.innerWidth - rect.left + 8,
    })
  }, [publicationLibraryFiltersVisible])

  useEffect(() => {
    if (!publicationLibraryDownloadVisible || !publicationLibraryDownloadButtonRef.current) return
    const rect = publicationLibraryDownloadButtonRef.current.getBoundingClientRect()
    setPublicationLibraryDownloadPopoverPosition({
      top: rect.top,
      right: window.innerWidth - rect.left + 8,
    })
  }, [publicationLibraryDownloadVisible])

  useEffect(() => {
    if (!publicationLibrarySettingsVisible || !publicationLibrarySettingsButtonRef.current) return
    const rect = publicationLibrarySettingsButtonRef.current.getBoundingClientRect()
    setPublicationLibrarySettingsPopoverPosition({
      top: rect.top,
      right: window.innerWidth - rect.left + 8,
    })
  }, [publicationLibrarySettingsVisible])

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

  const invalidatePublicationPaperModelCache = useCallback((workId: string) => {
    if (!workId) {
      return
    }
    setPaperModelCacheByWorkId((current) => {
      if (!current[workId]) {
        return current
      }
      const next = { ...current }
      delete next[workId]
      return next
    })
  }, [])

  const loadPublicationDetailData = useCallback(async (workId: string, force = false) => {
    if (!token || !workId) {
      return
    }
    if (!force && detailCacheByWorkId[workId]) {
      return
    }
    if (detailWarmupInFlightRef.current.has(workId)) {
      return
    }
    detailWarmupInFlightRef.current.add(workId)
    setPaneLoading(workId, 'overview', true)
    setPaneError(workId, 'overview', '')
    try {
      const payload = await fetchPublicationDetail(token, workId)
      setDetailCacheByWorkId((current) => ({ ...current, [workId]: payload }))
    } catch (loadError) {
      setPaneError(workId, 'overview', loadError instanceof Error ? loadError.message : 'Could not load publication details.')
    } finally {
      detailWarmupInFlightRef.current.delete(workId)
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
    if (authorsWarmupInFlightRef.current.has(workId)) {
      return
    }
    authorsWarmupInFlightRef.current.add(workId)
    setPaneLoading(workId, 'overview', true)
    try {
      const payload = await fetchPublicationAuthors(token, workId)
      setAuthorsCacheByWorkId((current) => ({ ...current, [workId]: payload }))
    } catch (loadError) {
      setPaneError(workId, 'overview', loadError instanceof Error ? loadError.message : 'Could not load publication authors.')
    } finally {
      authorsWarmupInFlightRef.current.delete(workId)
      setPaneLoading(workId, 'overview', false)
    }
  }, [authorsCacheByWorkId, setPaneError, setPaneLoading, token])

  const prefetchPublicationOverviewData = useCallback((workId: string) => {
    const normalizedWorkId = String(workId || '').trim()
    if (!normalizedWorkId) {
      return
    }
    void loadPublicationDetailData(normalizedWorkId)
    void loadPublicationAuthorsData(normalizedWorkId)
  }, [loadPublicationAuthorsData, loadPublicationDetailData])

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

  const loadPublicationPaperModelData = useCallback(async (
    workId: string,
    force = false,
    options?: { silent?: boolean; forceReparse?: boolean },
  ) => {
    if (!token || !workId) {
      return null
    }
    const silent = Boolean(options?.silent)
    const forceReparse = Boolean(options?.forceReparse)
    if (!force && paperModelCacheByWorkId[workId]) {
      return paperModelCacheByWorkId[workId]
    }
    if (!forceReparse && paperModelWarmupInFlightRef.current.has(workId)) {
      return paperModelCacheByWorkId[workId] || null
    }
    paperModelWarmupInFlightRef.current.add(workId)
    paperModelRequestCountByWorkIdRef.current.set(
      workId,
      (paperModelRequestCountByWorkIdRef.current.get(workId) ?? 0) + 1,
    )
    const requestToken = (paperModelLatestRequestTokenByWorkIdRef.current.get(workId) ?? 0) + 1
    paperModelLatestRequestTokenByWorkIdRef.current.set(workId, requestToken)
    const isLatestRequest = () => paperModelLatestRequestTokenByWorkIdRef.current.get(workId) === requestToken
    if (selectedWorkId === workId && !silent) {
      setPublicationReaderLoading(true)
      setPublicationReaderError('')
    }
    try {
      const payload = await fetchPublicationPaperModel(token, workId, {
        forceReparse,
      })
      if (isLatestRequest()) {
        setPaperModelCacheByWorkId((current) => ({ ...current, [workId]: payload }))
      }
      return payload
    } catch (loadError) {
      if (selectedWorkId === workId && !silent && isLatestRequest()) {
        setPublicationReaderError(loadError instanceof Error ? loadError.message : 'Could not load paper reader.')
      }
      return null
    } finally {
      const remainingRequests = Math.max(
        0,
        (paperModelRequestCountByWorkIdRef.current.get(workId) ?? 1) - 1,
      )
      if (remainingRequests > 0) {
        paperModelRequestCountByWorkIdRef.current.set(workId, remainingRequests)
      } else {
        paperModelRequestCountByWorkIdRef.current.delete(workId)
        paperModelWarmupInFlightRef.current.delete(workId)
      }
      if (selectedWorkId === workId && !silent && isLatestRequest()) {
        setPublicationReaderLoading(false)
      }
    }
  }, [paperModelCacheByWorkId, selectedWorkId, token])

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
      invalidatePublicationPaperModelCache(workId)
    } catch (loadError) {
      setPaneError(workId, 'files', loadError instanceof Error ? loadError.message : 'Could not load files.')
    } finally {
      setPaneLoading(workId, 'files', false)
    }
  }, [filesCacheByWorkId, invalidatePublicationPaperModelCache, setPaneError, setPaneLoading, token])

  const ensureActiveTabData = useCallback(async (workId: string, tab: PublicationDetailTab) => {
    if (!workId) {
      return
    }
    if (tab === 'overview') {
      await Promise.all([
        loadPublicationDetailData(workId),
        loadPublicationAuthorsData(workId),
      ])
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
    await loadPublicationImpactData(workId)
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
      } catch {
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
        saveCachedAnalyticsResponse(next, user?.id)
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
  }, [analyticsResponse?.status, isLocalRuntime, token, user?.id])

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
        saveCachedTopMetricsResponse(next, user?.id)
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
  }, [isLocalRuntime, topMetricsResponse?.status, topMetricsResponse?.tiles, token, user?.id])

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
        saveCachedTopMetricsResponse(next, user?.id)
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

  const filteredJournals = useMemo(() => {
    const cleanQuery = query.trim().toLowerCase()
    const journals = [...personaJournals]
    const filtered = journals.filter((journal) => {
      if (!cleanQuery) {
        return true
      }
      return [
        journal.display_name,
        journal.publisher,
        journal.issn_l,
        journal.openalex_source_id,
        ...(journal.issns || []),
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase()
        .includes(cleanQuery)
    })

    const direction = journalSortDirection === 'asc' ? 1 : -1
    filtered.sort((left, right) => {
      if (journalSortField === 'publication_count') {
        return (left.publication_count - right.publication_count) * direction
      }
      if (journalSortField === 'share_pct') {
        return (left.share_pct - right.share_pct) * direction
      }
      if (journalSortField === 'avg_citations') {
        return (left.avg_citations - right.avg_citations) * direction
      }
      if (journalSortField === 'median_citations') {
        return (left.median_citations - right.median_citations) * direction
      }
      if (journalSortField === 'impact_factor') {
        return ((left.publisher_reported_impact_factor || 0) - (right.publisher_reported_impact_factor || 0)) * direction
      }
      if (journalSortField === 'five_year_impact_factor') {
        return ((left.five_year_impact_factor || 0) - (right.five_year_impact_factor || 0)) * direction
      }
      if (journalSortField === 'journal_citation_indicator') {
        return ((left.journal_citation_indicator || 0) - (right.journal_citation_indicator || 0)) * direction
      }
      if (journalSortField === 'cited_half_life') {
        const leftValue = Number.parseFloat(String(left.cited_half_life || ''))
        const rightValue = Number.parseFloat(String(right.cited_half_life || ''))
        const normalizedLeft = Number.isFinite(leftValue) ? leftValue : -1
        const normalizedRight = Number.isFinite(rightValue) ? rightValue : -1
        return (normalizedLeft - normalizedRight) * direction
      }
      if (journalSortField === 'is_oa') {
        return ((Number(left.is_oa) || 0) - (Number(right.is_oa) || 0)) * direction
      }
      if (journalSortField === 'latest_publication_year') {
        return ((left.latest_publication_year || 0) - (right.latest_publication_year || 0)) * direction
      }
      return left.display_name.localeCompare(right.display_name) * direction
    })
    return filtered
  }, [journalSortDirection, journalSortField, personaJournals, query])

  const publicationLibraryEmptyState = useMemo(() => {
    const totalWorks = (personaState?.works ?? []).length
    if (filteredWorks.length > 0) {
      return null
    }
    if (totalWorks > 0) {
      return {
        title: 'No publications match your current view.',
        steps: [
          'Adjust the library search.',
          'Clear publication or article-type filters.',
          'Switch to My journals to review venue-level rollups.',
        ],
      }
    }
    if (loading) {
      return {
        title: 'Loading publication library...',
        steps: [
          'Checking your synced publications.',
          'Hydrating publication metrics and analytics.',
          'This should resolve automatically if data is available.',
        ],
      }
    }
    const metricsMessage = String(topMetricsResponse?.last_error || status || '').trim()
    const metricsUnavailable = Boolean(
      topMetricsResponse?.status === 'FAILED'
      || topMetricsResponse?.status === 'RUNNING'
      || /metrics|lookup failed|timed out|unavailable/i.test(metricsMessage),
    )
    if (metricsUnavailable) {
      return {
        title: 'Publication data is still loading.',
        steps: [
          'Your publication metrics request is still running or failed to return in time.',
          'Try refreshing the page or rerunning the publication refresh action.',
          'If this persists, the backend metrics job needs attention rather than an ORCID reconnect.',
        ],
      }
    }
    return {
      title: 'No works in your library yet.',
      steps: [
        'Connect ORCID in Integrations.',
        'Run ORCID sync from the top-right actions.',
        'Select any row to inspect publication details.',
      ],
    }
  }, [filteredWorks.length, loading, personaState?.works, status, topMetricsResponse?.last_error, topMetricsResponse?.status])

  const journalLibraryEmptyState = useMemo(() => {
    if (filteredJournals.length > 0) {
      return null
    }
    if (personaJournals.length > 0) {
      return {
        title: 'No journals match your current view.',
        steps: [
          'Adjust the library search.',
          'Switch back to My publications to inspect individual records.',
          'Resync publications if venue metadata looks incomplete.',
        ],
      }
    }
    if (loading) {
      return {
        title: 'Loading journal view...',
        steps: [
          'Checking your publication venues.',
          'Resolving journal-level identifiers and metrics.',
          'This should resolve automatically if data is available.',
        ],
      }
    }
    if ((personaState?.works ?? []).length > 0) {
      return {
        title: 'No journal rollups available yet.',
        steps: [
          'Run a publications metrics sync to backfill venue metadata.',
          'Check that imported works have journal venues rather than repository-only records.',
          'Refresh the page after the sync completes.',
        ],
      }
    }
    return {
      title: 'No journals in your library yet.',
      steps: [
        'Connect ORCID in Integrations.',
        'Run ORCID sync from the top-right actions.',
        'Return here once your publication library has loaded.',
      ],
    }
  }, [filteredJournals.length, loading, personaJournals.length, personaState?.works])

  const totalFilteredPublicationWorks = publicationLibraryViewMode === 'journals'
    ? filteredJournals.length
    : filteredWorks.length
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

  const pagedFilteredJournals = useMemo(() => {
    if (publicationLibraryPageSize === 'all') {
      return filteredJournals
    }
    const safePage = Math.max(1, Math.min(publicationLibraryPage, publicationLibraryTotalPages))
    const startIndex = (safePage - 1) * publicationLibraryPageSize
    return filteredJournals.slice(startIndex, startIndex + publicationLibraryPageSize)
  }, [filteredJournals, publicationLibraryPage, publicationLibraryPageSize, publicationLibraryTotalPages])

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
  ), [publicationTableColumnOrder, publicationTableColumns, resolvePublicationTableAvailableWidth])

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
    if (publicationLibraryViewMode === 'publications') {
      publicationTableAutoFitAppliedRef.current = false
      publicationTableLastAutoFitWidthRef.current = null
      return
    }
    setSelectedWorkId(null)
    setSelectedPublicationTypes([])
    setSelectedArticleTypes([])
    setPublicationLibraryFiltersVisible(false)
    setPublicationLibraryDownloadVisible(false)
    setPublicationLibrarySettingsVisible(false)
    setPublicationLibraryToolsOpen(false)
  }, [publicationLibraryViewMode])

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
  const selectedPaperModelResponse = selectedWorkId ? paperModelCacheByWorkId[selectedWorkId] || null : null
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
  const selectedOpenAccessFiles = useMemo(() => selectedFiles.filter((file) => file.source === 'OA_LINK'), [selectedFiles])
  const selectedAdditionalFiles = useMemo(() => selectedFiles.filter((file) => file.source !== 'OA_LINK'), [selectedFiles])
  const selectedHasActiveOaFile = selectedOpenAccessFiles.length > 0
  const selectedCanFindOaFile = !selectedHasActiveOaFile
  const selectedPaperModel = selectedPaperModelResponse?.payload || null
  const selectedPaperSections = selectedPaperModel?.sections || []
  const selectedPaperMetadata = selectedPaperModel?.metadata || null
  const selectedPaperDocument = selectedPaperModel?.document || null
  const selectedPaperParsingInProgress = (
    selectedPaperModelResponse?.status === 'RUNNING'
    || selectedPaperDocument?.parser_status === 'PARSING'
  )
  const selectedPaperPrimaryFile = useMemo(
    () => (
      selectedPaperDocument?.primary_pdf_file_id
        ? selectedFiles.find((file) => file.id === selectedPaperDocument.primary_pdf_file_id) || null
        : null
    ),
    [selectedFiles, selectedPaperDocument?.primary_pdf_file_id],
  )
  const selectedPaperPrimaryPdfContentFileId = selectedPaperDocument?.primary_pdf_file_id || selectedPaperPrimaryFile?.id || null
  const selectedPublicationReaderEntryAvailable = selectedPaperDocument?.reader_entry_available ?? true
  const onRetryPublicationReaderParse = useCallback(() => {
    if (!selectedWorkId || !selectedPaperPrimaryPdfContentFileId) {
      return
    }
    setPublicationReaderError('')
    void loadPublicationPaperModelData(selectedWorkId, true, { forceReparse: true })
  }, [loadPublicationPaperModelData, selectedPaperPrimaryPdfContentFileId, selectedWorkId])
  const selectedPaperPrimaryPdfExternalUrl = useMemo(() => {
    const primaryFileUrl = selectedPaperPrimaryFile ? publicationFileDirectUrl(selectedPaperPrimaryFile) : ''
    return resolvePublicationPdfViewerUrl(primaryFileUrl || selectedPaperDocument?.primary_pdf_download_url || '')
  }, [selectedPaperDocument?.primary_pdf_download_url, selectedPaperPrimaryFile])
  const selectedPaperFigures = selectedPaperModel?.figures || []
  const selectedPaperTables = selectedPaperModel?.tables || []
  const selectedPaperDatasets = selectedPaperModel?.datasets || []
  const selectedPaperAttachments = selectedPaperModel?.attachments || []
  const selectedPaperReaderSections = useMemo(() => {
    if (!selectedPaperSections.length) {
      return selectedPaperSections
    }

    const hasExplicitAbstractSection = selectedPaperSections.some((section) => {
      const labelText = [
        section.title,
        section.raw_label,
        section.label_original,
        section.label_normalized,
      ]
        .filter(Boolean)
        .join(' ')
        .trim()
        .toLowerCase()
      const groupKey = normalizePublicationPaperDisplayGroupKey(section)
      return (
        groupKey === 'abstract'
        && !publicationReaderLabelSuggestsAbstractSummary(labelText)
        && (
          labelText === 'abstract'
          || labelText.startsWith('abstract ')
          || section.canonical_kind === 'abstract'
          || section.canonical_map === 'abstract'
        )
      )
    })

    if (hasExplicitAbstractSection) {
      return selectedPaperSections
    }

    const abstractSource = String(
      selectedDetail?.structured_abstract?.source_abstract
      || selectedDetail?.abstract
      || selectedWork?.abstract
      || '',
    ).trim()
    const syntheticAbstractSections = buildPublicationReaderSyntheticAbstractSections(
      abstractSource,
      selectedPaperSections,
    )
    if (!syntheticAbstractSections.length) {
      return selectedPaperSections
    }
    return [...syntheticAbstractSections, ...selectedPaperSections]
  }, [selectedDetail?.abstract, selectedDetail?.structured_abstract?.source_abstract, selectedPaperSections, selectedWork?.abstract])
  const selectedPaperAssetsById = useMemo(() => {
    const next = new Map<string, PublicationPaperAssetPayload>()
    for (const asset of [...selectedPaperFigures, ...selectedPaperTables, ...selectedPaperDatasets, ...selectedPaperAttachments]) {
      if (asset.id) {
        next.set(asset.id, asset)
      }
    }
    return next
  }, [selectedPaperAttachments, selectedPaperDatasets, selectedPaperFigures, selectedPaperTables])
  const selectedPaperComponentSummary = selectedPaperModel?.component_summary || null
  const selectedPaperSectionChildrenByParent = useMemo(() => {
    const next = new Map<string | null, PublicationPaperSectionPayload[]>()
    for (const section of selectedPaperReaderSections) {
      const parentId = section.parent_id || null
      const existing = next.get(parentId)
      if (existing) {
        existing.push(section)
      } else {
        next.set(parentId, [section])
      }
    }
    for (const items of next.values()) {
      items.sort(comparePublicationPaperSections)
    }
    return next
  }, [selectedPaperReaderSections])

  const publicationReaderInlineAssetRefs = useRef<Record<string, HTMLElement | null>>({})

  const selectedPaperInlineAssetsBySectionId = useMemo(() => {
    const allAssets = [...selectedPaperFigures, ...selectedPaperTables]
    if (!allAssets.length || !selectedPaperSections.length) {
      return new Map<string, PublicationPaperAssetPayload[]>()
    }
    const leafSections = selectedPaperSections
      .filter((s) => s.page_start != null)
      .sort((a, b) => (a.page_start ?? 0) - (b.page_start ?? 0))
    if (!leafSections.length) {
      return new Map<string, PublicationPaperAssetPayload[]>()
    }
    const result = new Map<string, PublicationPaperAssetPayload[]>()
    const claimed = new Set<string>()
    for (const asset of allAssets) {
      const assetPage = asset.page_start
      if (assetPage == null) {
        continue
      }
      let bestSection: PublicationPaperSectionPayload | null = null
      for (const section of leafSections) {
        const sPage = section.page_start ?? 0
        const ePage = section.page_end ?? sPage
        if (assetPage >= sPage && assetPage <= ePage) {
          bestSection = section
          break
        }
      }
      if (!bestSection) {
        for (let i = leafSections.length - 1; i >= 0; i--) {
          if ((leafSections[i].page_start ?? 0) <= assetPage) {
            bestSection = leafSections[i]
            break
          }
        }
      }
      if (bestSection && !claimed.has(asset.id)) {
        claimed.add(asset.id)
        const existing = result.get(bestSection.id) || []
        existing.push(asset)
        result.set(bestSection.id, existing)
      }
    }
    return result
  }, [selectedPaperFigures, selectedPaperSections, selectedPaperTables])

  const unplacedInlineAssets = useMemo(() => {
    const allAssets = [...selectedPaperFigures, ...selectedPaperTables]
    if (!allAssets.length) return []
    const placedIds = new Set<string>()
    for (const assets of selectedPaperInlineAssetsBySectionId.values()) {
      for (const a of assets) placedIds.add(a.id)
    }
    const unplaced = allAssets.filter((a) => !placedIds.has(a.id))
    unplaced.sort((a, b) => {
      const kindOrder = (a.asset_kind === 'figure' ? 0 : 1) - (b.asset_kind === 'figure' ? 0 : 1)
      if (kindOrder !== 0) return kindOrder
      return (a.title || a.file_name || '').localeCompare(b.title || b.file_name || '')
    })
    return unplaced
  }, [selectedPaperFigures, selectedPaperInlineAssetsBySectionId, selectedPaperTables])

  const selectedPaperDisplayGroupKeyBySectionId = useMemo(
    () => buildPublicationPaperDisplayGroupKeyBySectionId(selectedPaperReaderSections),
    [selectedPaperReaderSections],
  )
  const selectedStructuredPaperGroups = useMemo<PublicationPaperStructuredGroupPayload[]>(() => {
    if (!selectedPaperReaderSections.length) {
      return []
    }
    const sectionsByGroup = new Map<string, PublicationPaperSectionPayload[]>()
    for (const section of selectedPaperReaderSections) {
      const groupKey = selectedPaperDisplayGroupKeyBySectionId.get(section.id) || null
      if (!groupKey || groupKey === 'assets') {
        continue
      }
      const existing = sectionsByGroup.get(groupKey)
      if (existing) {
        existing.push(section)
      } else {
        sectionsByGroup.set(groupKey, [section])
      }
    }
    return [...sectionsByGroup.entries()]
      .map(([key, sections]) => {
        sections.sort(comparePublicationPaperSections)
        const sectionIds = new Set(sections.map((section) => section.id))
        const rootSections = sections
          .filter((section) => !section.parent_id || !sectionIds.has(section.parent_id))
          .sort(comparePublicationPaperSections)
        return {
          key,
          label: formatPublicationPaperStructuredGroupLabel(key),
          sections,
          rootSections,
        }
      })
      .sort((left, right) => {
        const leftIndex = PUBLICATION_READER_STRUCTURED_GROUP_ORDER.indexOf(
          left.key as typeof PUBLICATION_READER_STRUCTURED_GROUP_ORDER[number],
        )
        const rightIndex = PUBLICATION_READER_STRUCTURED_GROUP_ORDER.indexOf(
          right.key as typeof PUBLICATION_READER_STRUCTURED_GROUP_ORDER[number],
        )
        const safeLeftIndex = leftIndex === -1 ? Number.MAX_SAFE_INTEGER : leftIndex
        const safeRightIndex = rightIndex === -1 ? Number.MAX_SAFE_INTEGER : rightIndex
        if (safeLeftIndex !== safeRightIndex) {
          return safeLeftIndex - safeRightIndex
        }
        const leftOrder = left.sections[0]?.order ?? Number.MAX_SAFE_INTEGER
        const rightOrder = right.sections[0]?.order ?? Number.MAX_SAFE_INTEGER
        if (leftOrder !== rightOrder) {
          return leftOrder - rightOrder
        }
        return left.label.localeCompare(right.label)
      })
  }, [selectedPaperDisplayGroupKeyBySectionId, selectedPaperReaderSections])
  const selectedPublicationReaderNavigatorGroups = useMemo<PublicationReaderNavigatorGroupPayload[]>(() => {
    const buildSectionItems = (
      section: PublicationPaperSectionPayload,
      groupKey: string,
      indent: number,
      items: PublicationReaderNavigatorItemPayload[],
    ) => {
      items.push({
        id: section.id,
        label: section.title || section.raw_label || 'Untitled section',
        indent,
        target: { kind: 'section', id: section.id },
      })
      const children = (selectedPaperSectionChildrenByParent.get(section.id) || [])
        .filter((child) => (selectedPaperDisplayGroupKeyBySectionId.get(child.id) || null) === groupKey)
        .sort(comparePublicationPaperSections)
      for (const child of children) {
        buildSectionItems(child, groupKey, indent + 1, items)
      }
    }

    return PUBLICATION_READER_NAVIGATOR_GROUP_DEFINITIONS.reduce<PublicationReaderNavigatorGroupPayload[]>((groups, definition) => {
      if (definition.key === 'tables' || definition.key === 'figures') {
        const assets = definition.key === 'tables' ? selectedPaperTables : selectedPaperFigures
        if (assets.length === 0) {
          return groups
        }
        groups.push({
          id: definition.key,
          label: definition.label,
          toneClassName: definition.toneClassName,
          target: assets[0]?.id ? { kind: 'asset', id: assets[0].id } : null,
          items: assets.map((asset) => ({
            id: asset.id,
            label: asset.title || asset.file_name || definition.label,
            indent: 1,
            target: { kind: 'asset', id: asset.id },
          })),
        })
        return groups
      }

      const sections = selectedPaperReaderSections
        .filter((section) => (selectedPaperDisplayGroupKeyBySectionId.get(section.id) || null) === definition.key)
        .sort(comparePublicationPaperSections)
      if (sections.length === 0) {
        return groups
      }
      const sectionIds = new Set(sections.map((section) => section.id))
      const rootSections = sections
        .filter((section) => !section.parent_id || !sectionIds.has(section.parent_id))
        .sort(comparePublicationPaperSections)
      const primarySection = rootSections[0] || sections[0] || null
      const promoteSingleRoot = Boolean(
        rootSections.length === 1
        && primarySection
        && publicationReaderSectionMatchesGroupLabel(primarySection, definition.key),
      )
      const items: PublicationReaderNavigatorItemPayload[] = []

      if (promoteSingleRoot && primarySection) {
        const childSections = (selectedPaperSectionChildrenByParent.get(primarySection.id) || [])
          .filter((child) => (selectedPaperDisplayGroupKeyBySectionId.get(child.id) || null) === definition.key)
          .sort(comparePublicationPaperSections)
        for (const childSection of childSections) {
          buildSectionItems(childSection, definition.key, 1, items)
        }
      } else {
        for (const rootSection of rootSections) {
          buildSectionItems(rootSection, definition.key, 1, items)
        }
      }

      groups.push({
        id: definition.key,
        label: definition.label,
        toneClassName: definition.toneClassName,
        target: primarySection?.id ? { kind: 'section', id: primarySection.id } : null,
        items,
      })
      return groups
    }, [])
  }, [
    selectedPaperDisplayGroupKeyBySectionId,
    selectedPaperFigures,
    selectedPaperSectionChildrenByParent,
    selectedPaperReaderSections,
    selectedPaperTables,
  ])
  const selectedPaperFirstReaderSection = useMemo(
    () => selectedStructuredPaperGroups.flatMap((group) => group.rootSections)[0] || selectedPaperReaderSections[0] || null,
    [selectedPaperReaderSections, selectedStructuredPaperGroups],
  )
  const selectedReaderActiveSection = useMemo(
    () => (
      publicationReaderActiveSectionId
        ? selectedPaperReaderSections.find((section) => section.id === publicationReaderActiveSectionId) || null
        : selectedPaperFirstReaderSection
    ),
    [publicationReaderActiveSectionId, selectedPaperFirstReaderSection, selectedPaperReaderSections],
  )
  const selectedReaderActiveSectionAnchorPage = useMemo(
    () => resolvePublicationPaperSectionAnchorPage(selectedReaderActiveSection),
    [selectedReaderActiveSection],
  )
  const publicationFileMenuFile = useMemo(
    () => (publicationFileMenuState ? selectedFiles.find((file) => file.id === publicationFileMenuState.fileId) || null : null),
    [publicationFileMenuState, selectedFiles],
  )
  const publicationFileTagMenuFile = useMemo(
    () => (publicationFileTagMenuState ? selectedFiles.find((file) => file.id === publicationFileTagMenuState.fileId) || null : null),
    [publicationFileTagMenuState, selectedFiles],
  )
  const publicationFileMenuBusy = Boolean(
    publicationFileMenuFile
    && (savingPublicationFileId === publicationFileMenuFile.id || deletingFileId === publicationFileMenuFile.id),
  )
  const publicationFileTagMenuBusy = Boolean(
    publicationFileTagMenuFile
    && (savingPublicationFileId === publicationFileTagMenuFile.id || deletingFileId === publicationFileTagMenuFile.id),
  )

  useEffect(() => {
    if (publicationFileMenuState && !publicationFileMenuFile) {
      setPublicationFileMenuState(null)
    }
    if (publicationFileTagMenuState && !publicationFileTagMenuFile) {
      setPublicationFileTagMenuState(null)
    }
    if (publicationFileTagEditorState && !selectedFiles.some((file) => file.id === publicationFileTagEditorState.fileId)) {
      setPublicationFileTagEditorState(null)
    }
    if (publicationFileOtherLabelEditorState && !selectedFiles.some((file) => file.id === publicationFileOtherLabelEditorState.fileId)) {
      setPublicationFileOtherLabelEditorState(null)
    }
    if (renamingPublicationFileId && !selectedFiles.some((file) => file.id === renamingPublicationFileId)) {
      setRenamingPublicationFileId(null)
      setPublicationFileRenameDraft('')
      setSavingPublicationFileId((current) => (current === renamingPublicationFileId ? null : current))
    }
  }, [publicationFileMenuFile, publicationFileMenuState, publicationFileOtherLabelEditorState, publicationFileTagEditorState, publicationFileTagMenuFile, publicationFileTagMenuState, renamingPublicationFileId, selectedFiles])

  useEffect(() => {
    setPublicationFileMenuState(null)
    setPublicationFileTagMenuState(null)
    setPublicationFileTagEditorState(null)
    setPublicationFileOtherLabelEditorState(null)
    setRenamingPublicationFileId(null)
    setPublicationFileRenameDraft('')
    setSavingPublicationFileId(null)
    setPublicationReaderOpen(false)
    setPublicationReaderLoading(false)
    setPublicationReaderError('')
    setPublicationReaderActiveSectionId(null)
    setPublicationReaderPdfPage(1)
    setPublicationReaderViewMode('structured')
    setPublicationReaderAwaitingPdfUpgrade(false)
    setPublicationReaderCollapsedNodeIds({})
    setPublicationReaderInspectorOpen(false)
    publicationReaderSectionRefs.current = {}
    publicationReaderInlineAssetRefs.current = {}
  }, [selectedWorkId])

  useEffect(() => {
    if (!selectedWorkId) {
      return
    }
    void loadPublicationPaperModelData(selectedWorkId, false, { silent: true })
  }, [loadPublicationPaperModelData, selectedWorkId])

  useEffect(() => {
    if (!publicationFileTagEditorState || publicationFileTagEditorState.open) {
      return
    }
    if (savingPublicationFileId === publicationFileTagEditorState.fileId) {
      return
    }
    const selectedFile = selectedFiles.find((file) => file.id === publicationFileTagEditorState.fileId) || null
    if (!selectedFile) {
      return
    }
    if ((selectedFile.classification ?? null) === publicationFileTagEditorState.pendingClassification) {
      setPublicationFileTagEditorState(null)
    }
  }, [publicationFileTagEditorState, savingPublicationFileId, selectedFiles])

  useEffect(() => {
    if (!publicationReaderOpen) {
      return
    }
    if (selectedPaperReaderSections.length === 0) {
      setPublicationReaderActiveSectionId(null)
      return
    }
    if (
      publicationReaderActiveSectionId
      && selectedPaperReaderSections.some((section) => section.id === publicationReaderActiveSectionId)
    ) {
      return
    }
    setPublicationReaderActiveSectionId(selectedPaperFirstReaderSection?.id || null)
  }, [publicationReaderActiveSectionId, publicationReaderOpen, selectedPaperFirstReaderSection, selectedPaperReaderSections])

  useEffect(() => {
    if (!publicationReaderOpen || selectedPublicationReaderNavigatorGroups.length === 0) {
      return
    }
    setPublicationReaderCollapsedNodeIds((current) => {
      let changed = false
      const next = { ...current }
      for (const group of selectedPublicationReaderNavigatorGroups) {
        if (!(group.id in current)) {
          next[group.id] = false
          changed = true
        }
      }
      return changed ? next : current
    })
  }, [publicationReaderOpen, selectedPublicationReaderNavigatorGroups])

  useEffect(() => {
    if (!publicationReaderOpen) {
      return
    }
    if (publicationReaderViewMode === 'pdf' && !selectedPaperPrimaryPdfContentFileId) {
      setPublicationReaderViewMode('structured')
    }
  }, [publicationReaderOpen, publicationReaderViewMode, selectedPaperPrimaryPdfContentFileId])

  useEffect(() => {
    if (!publicationReaderOpen || !publicationReaderAwaitingPdfUpgrade || !selectedPaperPrimaryPdfContentFileId) {
      return
    }
    setPublicationReaderPdfPage(selectedReaderActiveSectionAnchorPage || 1)
    setPublicationReaderViewMode('pdf')
    setPublicationReaderAwaitingPdfUpgrade(false)
  }, [
    publicationReaderAwaitingPdfUpgrade,
    publicationReaderOpen,
    selectedPaperPrimaryPdfContentFileId,
    selectedReaderActiveSectionAnchorPage,
  ])

  useEffect(() => {
    if (!publicationReaderOpen || !selectedWorkId) {
      return
    }
    const waitingForAssets = (
      selectedPaperDocument?.parser_status === 'FULL_TEXT_READY'
      && selectedPaperDocument?.has_viewable_pdf
      && selectedPaperDocument?.has_full_text_sections
      && selectedPaperFigures.length === 0
      && selectedPaperTables.length === 0
    )
    if (selectedPaperModelResponse?.status !== 'RUNNING' && selectedPaperDocument?.parser_status !== 'PARSING' && !waitingForAssets) {
      return
    }
    const timeoutId = window.setTimeout(() => {
      void loadPublicationPaperModelData(selectedWorkId, true, { silent: true })
    }, waitingForAssets ? 6000 : 2400)
    return () => window.clearTimeout(timeoutId)
  }, [
    loadPublicationPaperModelData,
    publicationReaderOpen,
    selectedPaperDocument?.has_full_text_sections,
    selectedPaperDocument?.has_viewable_pdf,
    selectedPaperDocument?.parser_status,
    selectedPaperFigures.length,
    selectedPaperModelResponse?.status,
    selectedPaperTables.length,
    selectedWorkId,
  ])

  const publicationTrajectoryChartTile = useMemo<PublicationMetricTilePayload | null>(() => {
    const perYear = selectedImpactResponse?.payload?.per_year || []
    const cleaned = perYear
      .map((entry) => ({
        year: Number(entry?.year),
        value: Math.max(0, Number(entry?.citations)),
      }))
      .filter((entry) => Number.isFinite(entry.year) && Number.isFinite(entry.value))
      .sort((left, right) => left.year - right.year)
    if (cleaned.length === 0) {
      return null
    }
    const years = cleaned.map((entry) => entry.year)
    const values = cleaned.map((entry) => entry.value)
    const meanValue = values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0
    const latestYear = years[years.length - 1]
    const latestValue = values[values.length - 1]
    return {
      id: selectedWorkId ? `publication-trajectory-${selectedWorkId}` : 'publication-trajectory',
      key: 'publication-trajectory',
      label: 'Publication trajectory',
      main_value: null,
      value: null,
      main_value_display: 'n/a',
      value_display: 'n/a',
      delta_value: null,
      delta_display: null,
      delta_direction: 'na',
      delta_tone: 'neutral',
      delta_color_code: 'neutral',
      unit: null,
      subtext: '',
      badge: {},
      chart_type: 'bar',
      chart_data: {
        years,
        values,
        mean_value: meanValue,
        projected_year: latestYear,
        current_year_ytd: latestValue,
      },
      sparkline: [],
      sparkline_overlay: [],
      tooltip: '',
      tooltip_details: {},
      data_source: [],
      confidence_score: 0,
      stability: 'stable',
      drilldown: {
        title: '',
        definition: '',
        formula: '',
        confidence_note: '',
        publications: [],
        metadata: {},
      },
    }
  }, [selectedImpactResponse?.payload?.per_year, selectedWorkId])
  const publicationTrajectoryWindowThumbStyle: CSSProperties = publicationTrajectoryWindowMode === 'all'
    ? {
      width: '28%',
      left: '72%',
      willChange: 'left,width',
    }
    : publicationTrajectoryWindowMode === '5y'
      ? {
        width: '24%',
        left: '48%',
        willChange: 'left,width',
      }
      : publicationTrajectoryWindowMode === '3y'
        ? {
          width: '24%',
          left: '24%',
          willChange: 'left,width',
        }
        : {
          width: '24%',
          left: '0%',
          willChange: 'left,width',
        }

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
  }, [overviewAuthors, overviewOwnerAuthorIndex])
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
  }, [overviewAuthors, overviewOwnerAuthorIndex])
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
    setPublicationTrajectoryWindowMode('all')
    setPublicationTrajectoryVisualMode('bars')
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

  const onSortColumn = (column: LibrarySortField) => {
    const nextColumn = column as PublicationSortField
    if (sortField === nextColumn) {
      setSortDirection((current) => (current === 'desc' ? 'asc' : 'desc'))
      return
    }
    setSortField(nextColumn)
    setSortDirection('desc')
  }

  const onSortJournalColumn = (column: JournalSortField) => {
    if (journalSortField === column) {
      setJournalSortDirection((current) => (current === 'desc' ? 'asc' : 'desc'))
      return
    }
    setJournalSortField(column)
    setJournalSortDirection(column === 'journal' || column === 'is_oa' ? 'asc' : 'desc')
  }

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

  useEffect(() => {
    if (!loading) {
      return
    }
    publicationTableAutoFitAppliedRef.current = false
    publicationTableLastAutoFitWidthRef.current = null
  }, [loading])

  useLayoutEffect(() => {
    if (!publicationTablePrefsLoadedRef.current) {
      return
    }
    if (loading || !publicationLibraryVisible || publicationLibraryViewMode !== 'publications') {
      return
    }
    if (!personaState?.works?.length) {
      return
    }
    if (!publicationTableLayoutRef.current) {
      return
    }
    const availableWidth = resolvePublicationTableAvailableWidth()
    const lastAutoFitWidth = publicationTableLastAutoFitWidthRef.current
    const widthChanged = lastAutoFitWidth === null || Math.abs(lastAutoFitWidth - availableWidth) >= 24
    if (publicationTableAutoFitAppliedRef.current && !widthChanged) {
      return
    }
    publicationTableAutoFitAppliedRef.current = true
    publicationTableLastAutoFitWidthRef.current = availableWidth
    onAutoAdjustPublicationTableWidths()
  }, [
    loading,
    onAutoAdjustPublicationTableWidths,
    personaState?.works?.length,
    publicationLibraryViewMode,
    publicationLibraryVisible,
    publicationTableLayoutWidth,
    resolvePublicationTableAvailableWidth,
  ])

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
  const detailPaperLinkTooltip = detailJournal && detailJournal !== 'Not available'
    ? `View at ${detailJournal}`
    : 'View paper'
  const detailPublicationType = selectedDetail?.publication_type
    ? derivePublicationTypeLabel({
      work_type: selectedDetail.publication_type,
      title: selectedDetail?.title,
      venue_name: selectedDetail?.journal,
    })
    : (selectedWork ? derivePublicationTypeLabel(selectedWork) : 'Not available')
  const detailArticleType = selectedDetail?.article_type
    ? deriveArticleTypeLabel({
      publication_type: selectedDetail.article_type,
      work_type: selectedDetail.publication_type,
      title: selectedDetail?.title,
      venue_name: selectedDetail?.journal,
    })
    : (selectedWork ? deriveArticleTypeLabel(selectedWork) : 'n/a')
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
  const structuredSections = useMemo(
    () => selectedDetail?.structured_abstract?.sections || [],
    [selectedDetail?.structured_abstract?.sections],
  )
  const structuredSourceAbstract = normalizeAbstractDisplayText(String(selectedDetail?.structured_abstract?.source_abstract || effectiveDetailAbstract || ''))
  const structuredSectionsJoined = normalizeAbstractDisplayText(
    structuredSections.map((section) => String(section?.content || '')).join(' '),
  )
  const structuredCoverageRatio = structuredSourceAbstract.length > 0
    ? (structuredSectionsJoined.length / structuredSourceAbstract.length)
    : 1
  const fallbackSectionsFromSource = useMemo(
    () => extractHeadingSectionsFromAbstractSource(structuredSourceAbstract),
    [structuredSourceAbstract],
  )
  const resolvedStructuredSections = useMemo(() => {
    if (!structuredSections.length) {
      return []
    }
    if (structuredCoverageRatio < 0.62 && fallbackSectionsFromSource.length >= 2) {
      return fallbackSectionsFromSource
    }
    return structuredSections
  }, [fallbackSectionsFromSource, structuredCoverageRatio, structuredSections])
  const hasStructuredRegistrationSection = resolvedStructuredSections.some((section) =>
    /\b(registration|prospero)\b/i.test(String(section?.label || section?.key || '')),
  )
  const inferredRegistrationSectionContent = hasStructuredRegistrationSection
    ? ''
    : extractRegistrationSectionContent(structuredSourceAbstract)
  const abstractExpanded = selectedWorkId ? Boolean(expandedAbstractByWorkId[selectedWorkId]) : false
  const abstractPreview = abstractExpanded ? effectiveDetailAbstract : effectiveDetailAbstract.slice(0, 700)
  const abstractPreviewParagraphs = useMemo(() => {
    if (!effectiveDetailAbstract) {
      return []
    }
    if (!abstractExpanded && effectiveDetailAbstract.length > 700) {
      const preview = normalizeAbstractDisplayText(abstractPreview)
      return preview ? [preview] : []
    }
    return splitLongTextIntoParagraphs(abstractPreview)
  }, [abstractExpanded, abstractPreview, effectiveDetailAbstract])

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
    prefetchPublicationOverviewData(normalizedWorkId)
    if (tab === 'files') {
      void loadPublicationFilesData(normalizedWorkId)
    }
    setSelectedWorkId(normalizedWorkId)
    setActiveDetailTab(tab)
  }, [activeDetailTab, loadPublicationFilesData, prefetchPublicationOverviewData])

  useEffect(() => {
    if (!requestedWorkIdFromQuery) {
      return
    }
    if (!(personaState?.works || []).some((work) => work.id === requestedWorkIdFromQuery)) {
      return
    }
    openPublicationInDetailPanel(requestedWorkIdFromQuery, requestedPublicationDetailTab)
    const nextParams = new URLSearchParams(searchParams)
    nextParams.delete('work')
    nextParams.delete('tab')
    setSearchParams(nextParams, { replace: true })
  }, [
    openPublicationInDetailPanel,
    personaState?.works,
    requestedPublicationDetailTab,
    requestedWorkIdFromQuery,
    searchParams,
    setSearchParams,
  ])

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

  const onOpenPublicationReader = useCallback(() => {
    if (!selectedWorkId || !selectedPublicationReaderEntryAvailable) {
      return
    }
    const initialSection = selectedPaperFirstReaderSection
    const initialPdfPage = resolvePublicationPaperSectionAnchorPage(initialSection) || 1
    setPublicationReaderOpen(true)
    setPublicationReaderError('')
    setPublicationReaderCollapsedNodeIds({})
    setPublicationReaderInspectorOpen(false)
    setPublicationReaderPdfPage(initialPdfPage)
    setPublicationReaderViewMode('structured')
    setPublicationReaderAwaitingPdfUpgrade(false)
    setPublicationReaderActiveSectionId(initialSection?.id || null)
    void loadPublicationPaperModelData(selectedWorkId, true, {
      forceReparse: Boolean(
        selectedPaperPrimaryPdfContentFileId && selectedPaperDocument?.parser_status === 'FAILED',
      ),
    })
  }, [loadPublicationPaperModelData, selectedPaperDocument?.parser_status, selectedPaperFirstReaderSection, selectedPaperPrimaryPdfContentFileId, selectedPublicationReaderEntryAvailable, selectedWorkId])

  const onSelectPublicationReaderSection = useCallback((sectionId: string) => {
    setPublicationReaderActiveSectionId(sectionId)
    const scrollToSection = () => {
      const node = publicationReaderSectionRefs.current[sectionId]
      if (node) {
        node.scrollIntoView({ behavior: 'smooth', block: 'start' })
      }
    }
    if (publicationReaderViewMode !== 'structured') {
      setPublicationReaderViewMode('structured')
      if (typeof window !== 'undefined') {
        window.requestAnimationFrame(() => {
          window.requestAnimationFrame(scrollToSection)
        })
      }
      return
    }
    scrollToSection()
  }, [publicationReaderViewMode])

  const onTogglePublicationReaderOutlineNode = useCallback((nodeId: string) => {
    setPublicationReaderCollapsedNodeIds((current) => ({
      ...current,
      [nodeId]: !current[nodeId],
    }))
  }, [])

  const onEnterPublicationReaderPdfView = useCallback(() => {
    if (!selectedPaperPrimaryPdfContentFileId) {
      return
    }
    setPublicationReaderPdfPage(selectedReaderActiveSectionAnchorPage || 1)
    setPublicationReaderViewMode('pdf')
  }, [selectedPaperPrimaryPdfContentFileId, selectedReaderActiveSectionAnchorPage])

  const onFindOpenAccessPublicationFile = async () => {
    if (!token || !selectedWorkId) {
      return
    }
    setFindingOaFile(true)
    setPaneError(selectedWorkId, 'files', '')
    setStatus('')
    try {
      const payload = await linkPublicationOpenAccessPdf(token, selectedWorkId, { allowSuppressed: true })
      if (!payload.file) {
        setOaPdfStatusByWorkId((current) => ({
          ...current,
          [selectedWorkId]: {
            status: 'missing',
            downloadUrl: null,
            fileName: null,
            updatedAt: new Date().toISOString(),
          },
        }))
        setPaneError(selectedWorkId, 'files', payload.message || 'No open-access PDF found.')
        return
      }

      const linkedFile = payload.file
      invalidatePublicationPaperModelCache(selectedWorkId)
      setOaPdfStatusByWorkId((current) => ({
        ...current,
        [selectedWorkId]: {
          status: 'available',
          downloadUrl: linkedFile.download_url || linkedFile.oa_url || null,
          fileName: linkedFile.file_name || null,
          updatedAt: new Date().toISOString(),
        },
      }))
      setStatus(payload.message || (payload.created ? 'Open-access PDF added.' : 'Open-access PDF already linked.'))
      await refreshFilesTab(selectedWorkId)
    } catch (linkError) {
      setPaneError(selectedWorkId, 'files', linkError instanceof Error ? linkError.message : 'Could not find an open-access PDF.')
    } finally {
      setFindingOaFile(false)
    }
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
        invalidatePublicationPaperModelCache(selectedWorkId)
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
    const deletedFile = selectedFiles.find((file) => file.id === fileId) || null
    setDeletingFileId(fileId)
    setPaneError(selectedWorkId, 'files', '')
    try {
      await deletePublicationFile(token, selectedWorkId, fileId)
      const remainingFiles = selectedFiles.filter((file) => file.id !== fileId)
      setFilesCacheByWorkId((current) => ({
        ...current,
        [selectedWorkId]: {
          items: remainingFiles,
          has_deleted_oa_file: current[selectedWorkId]?.has_deleted_oa_file || deletedFile?.source === 'OA_LINK',
          has_recoverable_deleted_oa_file:
            current[selectedWorkId]?.has_recoverable_deleted_oa_file
            || Boolean(deletedFile?.source === 'OA_LINK' && deletedFile?.is_stored_locally),
        },
      }))
      invalidatePublicationPaperModelCache(selectedWorkId)
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
      if (deletedFile?.source === 'OA_LINK') {
        setStatus('Open-access file removed. Use retrieve to restore or relink it.')
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

  const onPreviewPublicationFile = async (fileId: string) => {
    if (!token || !selectedWorkId) {
      return
    }
    setDownloadingFileId(fileId)
    setPaneError(selectedWorkId, 'files', '')
    try {
      const payload = await downloadPublicationFile(token, selectedWorkId, fileId)
      openBlobInNewTab(payload.blob)
    } catch (downloadError) {
      setPaneError(selectedWorkId, 'files', downloadError instanceof Error ? downloadError.message : 'Could not open publication file.')
    } finally {
      setDownloadingFileId(null)
    }
  }

  const openPublicationFileMenuAtPosition = useCallback((fileId: string, x: number, y: number) => {
    if (typeof window === 'undefined') {
      return
    }
    const menuWidth = 244
    const menuHeight = 360
    setPublicationFileTagMenuState(null)
    setPublicationFileTagEditorState(null)
    setPublicationFileOtherLabelEditorState(null)
    setPublicationFileMenuState({
      fileId,
      x: Math.max(8, Math.min(x, window.innerWidth - menuWidth - 8)),
      y: Math.max(8, Math.min(y, window.innerHeight - menuHeight - 8)),
    })
  }, [])

  const openPublicationFileTagMenuAtPosition = useCallback((fileId: string, x: number, y: number) => {
    if (typeof window === 'undefined') {
      return
    }
    const menuWidth = 176
    const menuHeight = 136
    setPublicationFileMenuState(null)
    setPublicationFileTagEditorState(null)
    setPublicationFileOtherLabelEditorState(null)
    setPublicationFileTagMenuState({
      fileId,
      x: Math.max(8, Math.min(x, window.innerWidth - menuWidth - 8)),
      y: Math.max(8, Math.min(y, window.innerHeight - menuHeight - 8)),
    })
  }, [])

  const onOpenLinkedPublicationFile = useCallback((file: PublicationFilePayload) => {
    const directUrl = resolvePublicationAssetUrl(publicationFileDirectUrl(file))
    if (!directUrl) {
      return
    }
    const link = document.createElement('a')
    link.href = directUrl
    link.target = '_blank'
    link.rel = 'noreferrer'
    if (file.file_name) {
      link.setAttribute('download', file.file_name)
    }
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
  }, [])

  const onOpenPublicationFile = (file: PublicationFilePayload) => {
    if (isLinkedPublicationFile(file) && publicationFileDirectUrl(file) && !(file.source === 'OA_LINK' && file.is_stored_locally)) {
      onOpenLinkedPublicationFile(file)
      return
    }
    if (file.file_type === 'PDF') {
      void onPreviewPublicationFile(file.id)
      return
    }
    void onDownloadPublicationFile(file.id, file.file_name)
  }

  const onOpenPublicationReaderAsset = (
    asset: PublicationPaperAssetPayload,
  ) => {
    const matchedFile = asset.file_id
      ? selectedFiles.find((file) => file.id === asset.file_id) || null
      : null
    if (matchedFile) {
      onOpenPublicationFile(matchedFile)
      return
    }
    const directUrl = resolvePublicationAssetUrl(asset.download_url)
    if (directUrl) {
      const link = document.createElement('a')
      link.href = directUrl
      link.target = '_blank'
      link.rel = 'noreferrer'
      document.body.appendChild(link)
      link.click()
      document.body.removeChild(link)
      return
    }
    const inlineNode = publicationReaderInlineAssetRefs.current[asset.id]
    if (inlineNode) {
      if (publicationReaderViewMode !== 'structured') {
        setPublicationReaderViewMode('structured')
        if (typeof window !== 'undefined') {
          window.requestAnimationFrame(() => {
            window.requestAnimationFrame(() => {
              inlineNode.scrollIntoView({ behavior: 'smooth', block: 'center' })
            })
          })
        }
      } else {
        inlineNode.scrollIntoView({ behavior: 'smooth', block: 'center' })
      }
      return
    }
    const targetPage = resolvePublicationPaperSectionAnchorPage({
      page_start: asset.page_start,
      page_end: asset.page_end,
    })
    if (targetPage && selectedPaperPrimaryPdfContentFileId) {
      setPublicationReaderPdfPage(targetPage)
      setPublicationReaderViewMode('pdf')
    }
  }

  const onSelectPublicationReaderNavigatorTarget = useCallback((target: PublicationReaderNavigatorTarget) => {
    if (!target) {
      return
    }
    if (target.kind === 'section') {
      onSelectPublicationReaderSection(target.id)
      return
    }
    const matchedAsset = selectedPaperAssetsById.get(target.id)
    if (matchedAsset) {
      onOpenPublicationReaderAsset(matchedAsset)
    }
  }, [onOpenPublicationReaderAsset, onSelectPublicationReaderSection, selectedPaperAssetsById])

  const onOpenPublicationReaderPrimaryPdf = () => {
    if (selectedPaperPrimaryFile) {
      onOpenPublicationFile(selectedPaperPrimaryFile)
      return
    }
    const directUrl = resolvePublicationAssetUrl(selectedPaperDocument?.primary_pdf_download_url)
    if (!directUrl) {
      return
    }
    const link = document.createElement('a')
    link.href = directUrl
    link.target = '_blank'
    link.rel = 'noreferrer'
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
  }

  const onCancelRenamePublicationFile = useCallback(() => {
    setRenamingPublicationFileId(null)
    setPublicationFileRenameDraft('')
    setSavingPublicationFileId(null)
  }, [])

  const onStartRenamePublicationFile = useCallback((file: PublicationFilePayload) => {
    if (!selectedWorkId) {
      return
    }
    if (!canRenamePublicationFile(file)) {
      setPaneError(selectedWorkId, 'files', 'Only saved publication files can be renamed.')
      return
    }
    setPublicationFileMenuState(null)
    setPublicationFileTagMenuState(null)
    setPublicationFileTagEditorState(null)
    setPublicationFileOtherLabelEditorState(null)
    setPaneError(selectedWorkId, 'files', '')
    setStatus('')
    setRenamingPublicationFileId(file.id)
    setPublicationFileRenameDraft(file.file_name)
  }, [selectedWorkId, setPaneError])

  const onStartPublicationFileClassification = useCallback((file: PublicationFilePayload) => {
    if (!selectedWorkId) {
      return
    }
    if (!canClassifyPublicationFile(file)) {
      setPaneError(selectedWorkId, 'files', 'Only saved publication files can be tagged.')
      return
    }
    setPublicationFileMenuState(null)
    setPublicationFileTagMenuState(null)
    setPublicationFileOtherLabelEditorState(null)
    setPaneError(selectedWorkId, 'files', '')
    setStatus('')
    setPublicationFileTagEditorState({
      fileId: file.id,
      open: true,
      pendingClassification: file.classification ?? null,
    })
  }, [selectedWorkId, setPaneError])

  const onStartPublicationFileOtherLabelEdit = useCallback((file: PublicationFilePayload) => {
    if (!selectedWorkId) {
      return
    }
    if (file.classification !== 'OTHER') {
      setPaneError(selectedWorkId, 'files', 'Only files tagged as Other can use a custom label.')
      return
    }
    setPublicationFileMenuState(null)
    setPublicationFileTagMenuState(null)
    setPublicationFileTagEditorState(null)
    setPaneError(selectedWorkId, 'files', '')
    setStatus('')
    setPublicationFileOtherLabelEditorState({
      fileId: file.id,
      draft: String(file.classification_other_label || '').trim(),
    })
  }, [selectedWorkId, setPaneError])

  const mergeUpdatedPublicationFileIntoCache = useCallback((workId: string, updated: PublicationFilePayload) => {
    setFilesCacheByWorkId((current) => {
      const existingPayload = current[workId] || null
      const existingItems = existingPayload?.items || []
      return {
        ...current,
        [workId]: {
          ...existingPayload,
          items: existingItems.map((item) => (item.id === updated.id ? updated : item)),
        },
      }
    })
    invalidatePublicationPaperModelCache(workId)
  }, [invalidatePublicationPaperModelCache])

  const onCancelPublicationFileOtherLabelEdit = useCallback(() => {
    setPublicationFileOtherLabelEditorState(null)
    setSavingPublicationFileId(null)
  }, [])

  const onSaveRenamePublicationFile = useCallback(async (file: PublicationFilePayload) => {
    const nextFileName = String(publicationFileRenameDraft || '').trim()
    if (!token || !selectedWorkId) {
      return
    }
    if (!canRenamePublicationFile(file)) {
      setPaneError(selectedWorkId, 'files', 'Only saved publication files can be renamed.')
      return
    }
    if (!nextFileName) {
      setPaneError(selectedWorkId, 'files', 'File name is required.')
      return
    }
    if (nextFileName === file.file_name) {
      onCancelRenamePublicationFile()
      return
    }

    setPaneError(selectedWorkId, 'files', '')
    setSavingPublicationFileId(file.id)
    try {
      const updated = await renamePublicationFile(token, selectedWorkId, file.id, nextFileName)
      mergeUpdatedPublicationFileIntoCache(selectedWorkId, updated)
      setOaPdfStatusByWorkId((current) => {
        const currentStatus = current[selectedWorkId]
        if (!currentStatus) {
          return current
        }
        const previousUrl = publicationFileDirectUrl(file)
        const nextUrl = publicationFileDirectUrl(updated)
        if (currentStatus.fileName !== file.file_name && currentStatus.downloadUrl !== previousUrl) {
          return current
        }
        return {
          ...current,
          [selectedWorkId]: {
            ...currentStatus,
            fileName: updated.file_name || currentStatus.fileName,
            downloadUrl: nextUrl || currentStatus.downloadUrl,
          },
        }
      })
      setStatus(`Renamed to ${updated.file_name}.`)
      onCancelRenamePublicationFile()
    } catch (renameError) {
      setPaneError(selectedWorkId, 'files', renameError instanceof Error ? renameError.message : 'Could not rename publication file.')
    } finally {
      setSavingPublicationFileId((current) => (current === file.id ? null : current))
    }
  }, [mergeUpdatedPublicationFileIntoCache, onCancelRenamePublicationFile, publicationFileRenameDraft, selectedWorkId, setPaneError, token])

  const onSavePublicationFileOtherLabel = useCallback(async (file: PublicationFilePayload) => {
    const nextOtherLabel = String(publicationFileOtherLabelEditorState?.draft || '').trim()
    const currentOtherLabel = String(file.classification_other_label || '').trim()
    if (!token || !selectedWorkId) {
      return
    }
    if (file.classification !== 'OTHER') {
      setPaneError(selectedWorkId, 'files', 'Only files tagged as Other can use a custom label.')
      return
    }
    if (nextOtherLabel === currentOtherLabel) {
      onCancelPublicationFileOtherLabelEdit()
      return
    }

    setPaneError(selectedWorkId, 'files', '')
    setSavingPublicationFileId(file.id)
    try {
      const updated = await updatePublicationFile(token, selectedWorkId, file.id, {
        classificationOtherLabel: nextOtherLabel || null,
      })
      mergeUpdatedPublicationFileIntoCache(selectedWorkId, updated)
      setStatus(updated.classification_label ? `Tag updated to ${updated.classification_label}.` : 'Tag updated.')
      onCancelPublicationFileOtherLabelEdit()
    } catch (otherLabelError) {
      setPaneError(selectedWorkId, 'files', otherLabelError instanceof Error ? otherLabelError.message : 'Could not update tag label.')
    } finally {
      setSavingPublicationFileId((current) => (current === file.id ? null : current))
    }
  }, [mergeUpdatedPublicationFileIntoCache, onCancelPublicationFileOtherLabelEdit, publicationFileOtherLabelEditorState?.draft, selectedWorkId, setPaneError, token])

  const onSetPublicationFileClassification = useCallback(async (
    file: PublicationFilePayload,
    classification: PublicationFileClassification,
  ) => {
    if (!token || !selectedWorkId) {
      return
    }
    if (!canClassifyPublicationFile(file)) {
      setPaneError(selectedWorkId, 'files', 'Only saved publication files can be tagged.')
      return
    }
    if (file.classification === classification) {
      setPublicationFileTagEditorState(null)
      return
    }

    setPaneError(selectedWorkId, 'files', '')
    setSavingPublicationFileId(file.id)
    try {
      const updated = await updatePublicationFile(token, selectedWorkId, file.id, { classification })
      mergeUpdatedPublicationFileIntoCache(selectedWorkId, updated)
      setStatus(`Tagged as ${updated.classification_label}.`)
      setPublicationFileTagEditorState((current) => (current?.fileId === file.id ? null : current))
      setPublicationFileOtherLabelEditorState(null)
    } catch (classificationError) {
      setPaneError(selectedWorkId, 'files', classificationError instanceof Error ? classificationError.message : 'Could not update file tag.')
      setPublicationFileTagEditorState({
        fileId: file.id,
        open: true,
        pendingClassification: file.classification ?? null,
      })
    } finally {
      setSavingPublicationFileId((current) => (current === file.id ? null : current))
    }
  }, [mergeUpdatedPublicationFileIntoCache, selectedWorkId, setPaneError, token])

  const onClearPublicationFileClassification = useCallback(async (file: PublicationFilePayload) => {
    if (!token || !selectedWorkId) {
      return
    }
    if (!canClassifyPublicationFile(file)) {
      setPaneError(selectedWorkId, 'files', 'Only saved publication files can be tagged.')
      return
    }
    if (!file.classification) {
      setPublicationFileTagMenuState(null)
      return
    }

    setPublicationFileTagMenuState(null)
    setPublicationFileTagEditorState(null)
    setPublicationFileOtherLabelEditorState(null)
    setPaneError(selectedWorkId, 'files', '')
    setSavingPublicationFileId(file.id)
    try {
      const updated = await updatePublicationFile(token, selectedWorkId, file.id, {
        classification: null,
        classificationOtherLabel: null,
      })
      mergeUpdatedPublicationFileIntoCache(selectedWorkId, updated)
      setStatus('Tag removed.')
    } catch (clearClassificationError) {
      setPaneError(selectedWorkId, 'files', clearClassificationError instanceof Error ? clearClassificationError.message : 'Could not remove file tag.')
    } finally {
      setSavingPublicationFileId((current) => (current === file.id ? null : current))
    }
  }, [mergeUpdatedPublicationFileIntoCache, selectedWorkId, setPaneError, token])

  const publicationFileShareContext = (file: PublicationFilePayload): { subject: string; url: string | null; body: string } => {
    const fileName = (file.file_name || file.label || 'Publication file').trim() || 'Publication file'
    const publicationTitle = (selectedDetail?.title || selectedWork?.title || 'Publication').trim()
    const directUrl = publicationFileDirectUrl(file) || null
    const body = directUrl
      ? `Publication: ${publicationTitle}\nFile: ${fileName}\nDownload link: ${directUrl}`
      : `Publication: ${publicationTitle}\nFile: ${fileName}\nDownload the file from Publications > Files in Axiomos and attach it before sending.`
    return { subject: fileName, url: directUrl, body }
  }

  const onSharePublicationFileEmail = (file: PublicationFilePayload, recipientEmail = '') => {
    const context = publicationFileShareContext(file)
    const subject = encodeURIComponent(context.subject)
    const mailto = `mailto:${encodeURIComponent(recipientEmail)}?subject=${subject}&body=${encodeURIComponent(context.body)}`
    setStatus(
      context.url
        ? `Opened an email draft for ${context.subject}.`
        : `Opened an email draft for ${context.subject}. Attach the downloaded file before sending.`,
    )
    window.location.href = mailto
  }

  const renderPublicationFileList = (files: PublicationFilePayload[], emptyMessage: string) => {
    if (files.length === 0) {
      return <p className="house-publications-drilldown-empty-state">{emptyMessage}</p>
    }
    return (
      <div className="house-publications-drilldown-file-list">
        {files.map((file) => {
          const fileLabel = (file.label || 'File').trim() || 'File'
          const normalizedLabel = fileLabel.toLowerCase().replace(/\s+/g, ' ').trim()
          const showFileLabel = normalizedLabel !== 'oa manuscript download'
          const canOpenExternalFile = isLinkedPublicationFile(file) && Boolean(publicationFileDirectUrl(file))
          const isRenamingFile = renamingPublicationFileId === file.id
          const isSavingFile = savingPublicationFileId === file.id
          const isSavingRename = isRenamingFile && isSavingFile
          const isDeletingFile = deletingFileId === file.id
          const isDownloadingFile = !canOpenExternalFile && downloadingFileId === file.id
          const isFileBusy = isDeletingFile || isDownloadingFile || isSavingFile
          const openFileLabel = canOpenExternalFile ? `Open ${file.file_name}` : `Download ${file.file_name}`
          const openAccessSourceLabel = publicationFileOpenAccessSourceLabel(file)
          const persistedClassificationOption = publicationFileClassificationOption(file.classification)
          const persistedClassificationLabel = String(file.classification_label || persistedClassificationOption?.label || '').trim()
          const isEditingTagFile = publicationFileTagEditorState?.fileId === file.id
          const isEditingOtherTagLabel = publicationFileOtherLabelEditorState?.fileId === file.id
          const isTagMenuOpenForFile = publicationFileTagMenuState?.fileId === file.id
          const currentOtherTagLabel = String(file.classification_other_label || '').trim()
          const otherTagDraft = isEditingOtherTagLabel ? publicationFileOtherLabelEditorState?.draft || '' : ''
          const isSavingOtherTagLabel = isEditingOtherTagLabel && isSavingFile
          const classificationControlValue = isEditingTagFile
            ? publicationFileTagEditorState.pendingClassification
            : file.classification ?? null
          const classificationControlOption = publicationFileClassificationOption(classificationControlValue)
          const classificationControlLabel = String(
            (isEditingTagFile
              ? classificationControlOption?.label
              : file.classification_label || classificationControlOption?.label) || '',
          ).trim()
          const showClassificationEditor = canClassifyPublicationFile(file) && isEditingTagFile
          const showPersistedClassificationBadge = Boolean(persistedClassificationLabel) && !isEditingTagFile && !isEditingOtherTagLabel
          return (
            <div
              key={file.id}
              className={cn(
                'house-publications-drilldown-file-entry house-publications-drilldown-file-entry-menuable',
                HOUSE_PUBLICATION_DRILLDOWN_TRANSITION_CLASS,
                isRenamingFile ? 'space-y-3' : 'space-y-2',
              )}
              onContextMenu={(event) => {
                if (isRenamingFile || isEditingTagFile || isEditingOtherTagLabel) {
                  return
                }
                event.preventDefault()
                openPublicationFileMenuAtPosition(file.id, event.clientX, event.clientY)
              }}
            >
              {showFileLabel ? <p className={HOUSE_PUBLICATION_DRILLDOWN_STAT_TITLE_CLASS}>{fileLabel}</p> : null}
              {isRenamingFile ? (
                <div className="house-publications-drilldown-file-rename-shell">
                  <Input
                    value={publicationFileRenameDraft}
                    onChange={(event) => setPublicationFileRenameDraft(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter') {
                        event.preventDefault()
                        void onSaveRenamePublicationFile(file)
                      } else if (event.key === 'Escape') {
                        event.preventDefault()
                        onCancelRenamePublicationFile()
                      }
                    }}
                    className={cn('house-publications-drilldown-file-rename-input h-9', HOUSE_INPUT_CLASS)}
                    disabled={isSavingRename}
                    autoFocus
                  />
                  <button
                    type="button"
                    className="house-collaborator-action-icon house-collaborator-action-icon-save"
                    onClick={() => void onSaveRenamePublicationFile(file)}
                    disabled={isSavingRename || !String(publicationFileRenameDraft || '').trim() || String(publicationFileRenameDraft || '').trim() === file.file_name.trim()}
                    aria-label={`Save rename for ${file.file_name}`}
                  >
                    {isSavingRename ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                  </button>
                  <button
                    type="button"
                    className="house-collaborator-action-icon house-collaborator-action-icon-discard"
                    onClick={onCancelRenamePublicationFile}
                    disabled={isSavingRename}
                    aria-label="Cancel rename"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>
              ) : (
                <div className="group/file-row flex items-start gap-3 rounded-md px-1.5 py-1.5 transition-colors duration-[var(--motion-duration-ui)] ease-out hover:bg-[hsl(var(--tone-neutral-50))] focus-within:bg-[hsl(var(--tone-neutral-50))]">
                  <div className="flex min-w-0 flex-1 items-start gap-2">
                    <button
                      type="button"
                      className={cn(
                        'min-w-0 flex-1 rounded-sm bg-transparent p-0 text-left text-[hsl(var(--tone-neutral-900))] transition-[color] duration-[var(--motion-duration-ui)] ease-out focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring))] focus-visible:ring-offset-2 disabled:cursor-wait disabled:text-[hsl(var(--tone-neutral-500))]',
                        !isFileBusy && 'cursor-pointer',
                      )}
                      onClick={() => onOpenPublicationFile(file)}
                      disabled={isFileBusy}
                      aria-label={openFileLabel}
                    >
                      <span
                        className={cn(
                          `house-publications-drilldown-file-name ${HOUSE_PUBLICATION_TEXT_CLASS}`,
                          'min-w-0 transition-colors duration-[var(--motion-duration-ui)] ease-out',
                          !isFileBusy && 'group-hover/file-row:text-[hsl(var(--tone-accent-700))] group-focus-within/file-row:text-[hsl(var(--tone-accent-700))]',
                        )}
                      >
                        {file.file_name}
                      </span>
                      {openAccessSourceLabel ? (
                        <Badge
                          size="sm"
                          variant="outline"
                          className="ml-2 shrink-0 border-[hsl(var(--tone-neutral-200))] bg-[hsl(var(--tone-neutral-50))] text-[10px] font-medium uppercase tracking-[0.14em] text-[hsl(var(--tone-neutral-600))]"
                        >
                          {openAccessSourceLabel}
                        </Badge>
                      ) : null}
                    </button>
                    {showPersistedClassificationBadge ? (
                      <button
                        type="button"
                        className="group/member-badge inline-flex shrink-0 rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                        aria-label={`Tag options for ${file.file_name}`}
                        onClick={(event) => {
                          event.stopPropagation()
                          if (isTagMenuOpenForFile) {
                            setPublicationFileTagMenuState(null)
                            return
                          }
                          const rect = event.currentTarget.getBoundingClientRect()
                          openPublicationFileTagMenuAtPosition(file.id, rect.left, rect.bottom + 6)
                        }}
                        onKeyDown={(event) => {
                          if (event.key !== 'Enter' && event.key !== ' ') {
                            return
                          }
                          event.preventDefault()
                          event.stopPropagation()
                          if (isTagMenuOpenForFile) {
                            setPublicationFileTagMenuState(null)
                            return
                          }
                          const rect = event.currentTarget.getBoundingClientRect()
                          openPublicationFileTagMenuAtPosition(file.id, rect.left, rect.bottom + 6)
                        }}
                        disabled={isFileBusy}
                      >
                        <Badge
                          size="sm"
                          variant="outline"
                          className={cn(
                            'shrink-0 self-start whitespace-nowrap transition-[transform,box-shadow] duration-[var(--motion-duration-ui)] ease-out hover:-translate-y-px hover:shadow-[0_2px_8px_hsl(var(--foreground)/0.08)]',
                            persistedClassificationOption?.badgeClassName,
                          )}
                        >
                          <span>{persistedClassificationLabel}</span>
                          <ChevronDown
                            className={cn(
                              'ml-1 h-3 w-3 transition-[opacity,transform] duration-[var(--motion-duration-ui)] ease-out group-hover/member-badge:translate-y-px',
                              isTagMenuOpenForFile
                                ? 'opacity-80'
                                : 'opacity-45 group-hover/member-badge:opacity-80',
                            )}
                          />
                        </Badge>
                      </button>
                    ) : null}
                    {isEditingOtherTagLabel ? (
                      <div className="flex shrink-0 items-center gap-1">
                        <Input
                          value={otherTagDraft}
                          onChange={(event) => setPublicationFileOtherLabelEditorState((current) => (current?.fileId === file.id
                            ? {
                                ...current,
                                draft: event.target.value,
                              }
                            : current))}
                          onKeyDown={(event) => {
                            if (event.key === 'Enter') {
                              event.preventDefault()
                              void onSavePublicationFileOtherLabel(file)
                            } else if (event.key === 'Escape') {
                              event.preventDefault()
                              onCancelPublicationFileOtherLabelEdit()
                            }
                          }}
                          placeholder="Custom label"
                          className={cn('h-8 w-[10rem] rounded-sm px-2 text-xs', HOUSE_INPUT_CLASS)}
                          disabled={isSavingOtherTagLabel}
                          autoFocus
                        />
                        <button
                          type="button"
                          className="house-collaborator-action-icon house-collaborator-action-icon-save"
                          onClick={() => void onSavePublicationFileOtherLabel(file)}
                          disabled={isSavingOtherTagLabel || String(otherTagDraft).trim() === currentOtherTagLabel}
                          aria-label={`Save custom Other label for ${file.file_name}`}
                        >
                          {isSavingOtherTagLabel ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                        </button>
                        <button
                          type="button"
                          className="house-collaborator-action-icon house-collaborator-action-icon-discard"
                          onClick={onCancelPublicationFileOtherLabelEdit}
                          disabled={isSavingOtherTagLabel}
                          aria-label="Cancel custom tag label edit"
                        >
                          <X className="h-4 w-4" />
                        </button>
                      </div>
                    ) : null}
                    {showClassificationEditor ? (
                      <SelectPrimitive
                        value={classificationControlValue ?? undefined}
                        open={isEditingTagFile ? publicationFileTagEditorState.open : false}
                        disabled={isFileBusy}
                        onOpenChange={(open) => {
                          if (isFileBusy) {
                            return
                          }
                          setPublicationFileTagEditorState((current) => {
                            if (open) {
                              return {
                                fileId: file.id,
                                open: true,
                                pendingClassification: current?.fileId === file.id
                                  ? current.pendingClassification
                                  : file.classification ?? null,
                              }
                            }
                            if (!current || current.fileId !== file.id) {
                              return current
                            }
                            return {
                              ...current,
                              open: false,
                            }
                          })
                        }}
                        onValueChange={(value) => {
                          const nextClassification = value as PublicationFileClassification
                          setPublicationFileTagEditorState((current) => (current?.fileId === file.id
                            ? {
                                ...current,
                                pendingClassification: nextClassification,
                              }
                            : current))
                          void onSetPublicationFileClassification(file, nextClassification)
                        }}
                      >
                        <SelectTrigger
                          aria-label={classificationControlLabel ? `Change tag for ${file.file_name}` : `Select tag for ${file.file_name}`}
                          className={cn(
                            '!h-5 !min-h-5 w-auto max-w-[14rem] shrink-0 gap-1 rounded-sm px-2 py-0.5 text-xs font-normal leading-none shadow-none ring-offset-0',
                            classificationControlOption?.badgeClassName || 'border-[hsl(var(--tone-neutral-250))] bg-[hsl(var(--tone-neutral-25))] text-[hsl(var(--tone-neutral-500))]',
                            !classificationControlValue && 'data-[placeholder]:text-[hsl(var(--tone-neutral-500))]',
                          )}
                        >
                          <span className="max-w-[10rem] truncate">
                            <SelectValue placeholder="Select tag" />
                          </span>
                        </SelectTrigger>
                        <SelectContent className="min-w-[12rem]">
                          {PUBLICATION_FILE_CLASSIFICATION_OPTIONS.map((option) => (
                            <SelectItem key={`publication-file-classification-${option.value}`} value={option.value}>
                              {option.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </SelectPrimitive>
                    ) : null}
                    {isDownloadingFile ? (
                      <Loader2 className="mt-0.5 h-4 w-4 shrink-0 animate-spin text-[hsl(var(--tone-neutral-500))]" strokeWidth={2.1} />
                    ) : null}
                  </div>
                  <Button
                    type="button"
                    variant="house"
                    size="icon"
                    className={cn(
                      'h-8 w-8 shrink-0 house-publications-toolbox-item transition-[opacity,transform] duration-[var(--motion-duration-ui)] ease-out',
                      isDeletingFile || isSavingFile
                        ? 'pointer-events-auto opacity-100'
                        : 'pointer-events-none translate-x-1 opacity-0 group-hover/file-row:pointer-events-auto group-hover/file-row:translate-x-0 group-hover/file-row:opacity-100 group-focus-within/file-row:pointer-events-auto group-focus-within/file-row:translate-x-0 group-focus-within/file-row:opacity-100',
                    )}
                    aria-label={`More actions for ${file.file_name}`}
                    disabled={isDeletingFile || isSavingFile}
                    onClick={(event) => {
                      event.stopPropagation()
                      const rect = event.currentTarget.getBoundingClientRect()
                      openPublicationFileMenuAtPosition(file.id, rect.right - 8, rect.bottom + 6)
                    }}
                  >
                    {isDeletingFile || isSavingFile ? (
                      <Loader2 className="h-4 w-4 animate-spin" strokeWidth={2.1} />
                    ) : (
                      <Ellipsis className="h-4 w-4" strokeWidth={2.1} />
                    )}
                  </Button>
                </div>
              )}
            </div>
          )
        })}
      </div>
    )
  }

  const shouldKeepPublicationDrilldownOpen = useCallback((target: EventTarget | null) => {
    return target instanceof Element
      && Boolean(
        target.closest('[data-ui="publication-file-menu-overlay"]')
        || target.closest('[data-ui="publication-file-tag-menu-overlay"]')
        || target.closest('[data-ui="publication-paper-reader-overlay"]')
        || target.closest('[data-ui="publication-paper-reader-shell"]')
        || target.closest('[data-ui="select-primitive-content"]'),
      )
  }, [])

  const renderPublicationReaderAssetGroup = (
    items: PublicationPaperAssetPayload[],
    emptyMessage: string,
  ) => {
    if (items.length === 0) {
      return <p className="text-sm leading-relaxed text-[hsl(var(--tone-neutral-500))]">{emptyMessage}</p>
    }
    return (
      <div className="space-y-3">
        {items.map((asset) => (
          <div
            key={asset.id}
            className="overflow-hidden rounded-xl border border-[hsl(var(--tone-neutral-200))] bg-[hsl(var(--tone-neutral-50))] transition-[border-color,background-color] duration-[var(--motion-duration-ui)] ease-out hover:border-[hsl(var(--tone-accent-300))] hover:bg-[hsl(var(--tone-accent-50))]"
          >
            <button
              type="button"
              className="flex w-full items-start justify-between gap-3 px-3 py-2 text-left"
              onClick={() => onOpenPublicationReaderAsset(asset)}
            >
              <div className="min-w-0">
                <p className="line-clamp-2 text-sm font-medium text-[hsl(var(--tone-neutral-900))]">{asset.title || asset.file_name}</p>
                <p className="mt-1 text-[0.72rem] uppercase tracking-[0.08em] text-[hsl(var(--tone-neutral-500))]">
                  {asset.source === 'PARSED'
                    ? `${formatPublicationPaperSectionKindLabel(asset.asset_kind)} · GROBID`
                    : asset.source === 'OA_LINK'
                      ? 'Open access'
                      : asset.source === 'SUPPLEMENTARY_LINK'
                        ? 'Supplementary'
                        : 'Saved file'}
                </p>
                {asset.caption ? (
                  <p className="mt-1 line-clamp-3 text-[0.82rem] leading-relaxed text-[hsl(var(--tone-neutral-600))]">
                    {asset.caption}
                  </p>
                ) : null}
                {formatPublicationPaperSectionPageLabel({ page_start: asset.page_start, page_end: asset.page_end }) ? (
                  <p className="mt-1 text-[0.72rem] text-[hsl(var(--tone-neutral-500))]">
                    {formatPublicationPaperSectionPageLabel({ page_start: asset.page_start, page_end: asset.page_end })}
                  </p>
                ) : null}
              </div>
              {asset.classification_label ? (
                <Badge
                  size="sm"
                  variant="outline"
                  className={cn(
                    'shrink-0 whitespace-nowrap',
                    publicationFileClassificationOption(asset.classification)?.badgeClassName
                      || 'border-[hsl(var(--tone-neutral-300))] bg-[hsl(var(--tone-neutral-50))] text-[hsl(var(--tone-neutral-700))]',
                  )}
                >
                  {asset.classification_label}
                </Badge>
              ) : null}
            </button>
            {asset.image_data ? (
              <div className="border-t border-[hsl(var(--tone-neutral-200))] bg-white px-3 py-2">
                <img
                  src={asset.image_data}
                  alt={asset.title || asset.file_name || 'Figure'}
                  className="max-h-[280px] w-full rounded-md object-contain"
                  loading="lazy"
                />
              </div>
            ) : null}
            {asset.structured_html ? (
              <div className="border-t border-[hsl(var(--tone-neutral-200))] bg-white px-3 py-2">
                <div
                  className="publication-structured-table max-h-[320px] overflow-auto text-[0.78rem] leading-relaxed"
                  dangerouslySetInnerHTML={{ __html: asset.structured_html }}
                />
              </div>
            ) : null}
          </div>
        ))}
      </div>
    )
  }

  const renderPublicationReaderStructuredSection = (
    section: PublicationPaperSectionPayload,
    depth = 0,
    groupKey: string | null = null,
  ): ReactNode => {
    const childSections = selectedPaperSectionChildrenByParent.get(section.id) || []
    const isActiveSection = publicationReaderActiveSectionId === section.id
    const sectionParagraphs = splitLongTextIntoParagraphs(section.content, 800)
    const sectionGroupKey = groupKey || selectedPaperDisplayGroupKeyBySectionId.get(section.id) || null
    const sectionToneClassName = getPublicationReaderGroupToneClass(sectionGroupKey)
    const isMajorHeading = depth === 0 && publicationReaderSectionMatchesGroupLabel(section, sectionGroupKey || '')
    const isSummaryBox = String(section.section_role || '') === 'summary_box' && depth === 0
    const specialSectionTone = depth === 0 ? getPublicationReaderSpecialSectionTone(section) : null
    const isSpecialSection = Boolean(specialSectionTone)
    const isRootSection = depth === 0
    const showMarker = isMajorHeading
    const rawLabelRedundant = !section.raw_label
      || section.raw_label === section.title
      || section.raw_label.trim().toLowerCase() === (section.title || '').trim().toLowerCase()

    const sectionContent = (
      <>
        <div className={cn('flex min-w-0 items-start', showMarker ? 'gap-3' : 'gap-0')}>
          {showMarker ? (
            <span
              className={cn(
                'mt-1 shrink-0 rounded-full opacity-90',
                isRootSection ? 'h-4 w-[0.24rem]' : 'h-3 w-[0.22rem]',
                sectionToneClassName,
              )}
            />
          ) : null}
          <div className={cn('min-w-0 flex-1', showMarker ? '' : depth > 0 ? '' : '')}>
            {specialSectionTone ? (
              <div className="mb-2 flex flex-wrap items-center gap-2">
                <span
                  className={cn(
                    'inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-[0.64rem] font-semibold uppercase tracking-[0.12em]',
                    specialSectionTone.badgeClassName,
                  )}
                >
                  {specialSectionTone.icon}
                  <span>{specialSectionTone.badge}</span>
                </span>
              </div>
            ) : null}
            <h3
              className={cn(
                'leading-tight transition-colors duration-[var(--motion-duration-ui)] ease-out',
                isSummaryBox
                  ? 'text-[0.82rem] font-semibold uppercase tracking-[0.04em]'
                  : isSpecialSection
                    ? 'text-[1rem] font-semibold'
                  : depth === 0
                    ? 'text-[1.05rem] font-semibold'
                    : depth === 1
                      ? 'text-[0.94rem] font-medium'
                      : 'text-[0.88rem] font-medium',
                isActiveSection
                  ? 'text-[hsl(var(--tone-accent-800))]'
                  : isSummaryBox
                    ? 'text-[hsl(var(--tone-neutral-600))]'
                    : isSpecialSection
                      ? 'text-[hsl(var(--tone-neutral-950))]'
                    : depth === 0
                      ? 'text-[hsl(var(--tone-neutral-900))]'
                      : 'text-[hsl(var(--tone-neutral-800))]',
              )}
            >
              {specialSectionTone?.title || section.title}
            </h3>
            {!rawLabelRedundant ? (
              <p className="mt-1 text-sm leading-relaxed text-[hsl(var(--tone-neutral-500))]">
                {section.raw_label}
              </p>
            ) : null}
          </div>
        </div>
        {sectionParagraphs.length > 0 ? (
          <div className={cn('mt-3 space-y-3', showMarker ? 'pl-[0.95rem]' : '')}>
            {sectionParagraphs.map((paragraph, paragraphIndex) => (
              <p
                key={`${section.id}-paragraph-${paragraphIndex}`}
                className={cn(
                  'leading-[1.9] [hyphens:none] [overflow-wrap:normal] [text-align:justify] break-normal',
                  isSummaryBox || isSpecialSection
                    ? 'text-[0.92rem] text-[hsl(var(--tone-neutral-700))]'
                    : 'text-[0.97rem] text-[hsl(var(--tone-neutral-800))]',
                )}
              >
                {paragraph}
              </p>
            ))}
          </div>
        ) : null}
        {(selectedPaperInlineAssetsBySectionId.get(section.id) || []).length > 0 ? (
          <div className={cn('mt-4 space-y-4', showMarker ? 'pl-[0.95rem]' : '')}>
            {(selectedPaperInlineAssetsBySectionId.get(section.id) || []).map((inlineAsset) => (
              <div
                key={`inline-${inlineAsset.id}`}
                ref={(node) => { publicationReaderInlineAssetRefs.current[inlineAsset.id] = node }}
                className="overflow-hidden rounded-lg border border-[hsl(var(--tone-neutral-200))] bg-white shadow-[0_2px_8px_hsl(var(--tone-neutral-900)/0.04)]"
              >
                <div className={cn(
                  'flex items-center gap-2 px-3 py-2',
                  inlineAsset.asset_kind === 'table'
                    ? 'border-l-[3px] border-l-[hsl(var(--tone-accent-400))]'
                    : 'border-l-[3px] border-l-[hsl(var(--tone-positive-400))]',
                )}>
                  <p className="text-[0.82rem] font-semibold text-[hsl(var(--tone-neutral-800))]">
                    {inlineAsset.title || inlineAsset.file_name}
                  </p>
                  {formatPublicationPaperSectionPageLabel({ page_start: inlineAsset.page_start, page_end: inlineAsset.page_end }) ? (
                    <span className="shrink-0 text-[0.68rem] text-[hsl(var(--tone-neutral-400))]">
                      {formatPublicationPaperSectionPageLabel({ page_start: inlineAsset.page_start, page_end: inlineAsset.page_end })}
                    </span>
                  ) : null}
                </div>
                {inlineAsset.image_data ? (
                  <div className="border-t border-[hsl(var(--tone-neutral-100))] bg-[hsl(var(--tone-neutral-50))] px-3 py-3">
                    <img
                      src={inlineAsset.image_data}
                      alt={inlineAsset.title || inlineAsset.file_name || 'Figure'}
                      className="max-h-[400px] w-full rounded object-contain"
                      loading="lazy"
                    />
                  </div>
                ) : null}
                {inlineAsset.structured_html ? (
                  <div className="border-t border-[hsl(var(--tone-neutral-100))] bg-[hsl(var(--tone-neutral-50))] px-3 py-3">
                    <div
                      className="publication-structured-table overflow-auto text-[0.78rem] leading-relaxed"
                      dangerouslySetInnerHTML={{ __html: inlineAsset.structured_html }}
                    />
                  </div>
                ) : null}
                {inlineAsset.caption ? (
                  <div className="border-t border-[hsl(var(--tone-neutral-100))] px-3 py-2">
                    <p className="text-[0.78rem] leading-relaxed text-[hsl(var(--tone-neutral-600))]">
                      {inlineAsset.caption}
                    </p>
                  </div>
                ) : null}
              </div>
            ))}
          </div>
        ) : null}
        {childSections.length > 0 ? (
          <div className={cn('mt-5 space-y-5', depth === 0 ? 'pl-4' : 'pl-3')}>
            {childSections.map((childSection) => renderPublicationReaderStructuredSection(childSection, depth + 1, sectionGroupKey))}
          </div>
        ) : null}
      </>
    )

    return (
      <section
        key={section.id}
        ref={(node) => {
          publicationReaderSectionRefs.current[section.id] = node
        }}
        className={cn(
          'scroll-mt-6',
          isSpecialSection
            ? cn(
              'rounded-[1.2rem] border px-4 py-4 shadow-[0_14px_34px_hsl(var(--tone-neutral-900)/0.05)]',
              specialSectionTone?.shellClassName,
            )
            : isSummaryBox
              ? 'rounded-lg border border-[hsl(var(--tone-neutral-200))] bg-[hsl(var(--tone-neutral-50))] px-4 py-3.5'
              : isRootSection
                ? 'rounded-[1.45rem] border border-[hsl(var(--tone-neutral-200))] bg-[linear-gradient(180deg,white_0%,hsl(var(--tone-neutral-50)/0.72)_100%)] px-6 py-6 shadow-[0_20px_44px_hsl(var(--tone-neutral-900)/0.05)]'
                : '',
        )}
      >
        {sectionContent}
      </section>
    )
  }

  const renderPublicationReaderNavigator = (): ReactNode => {
    if (selectedPublicationReaderNavigatorGroups.length === 0) {
      return (
        <p className="px-1 text-sm leading-relaxed text-[hsl(var(--tone-neutral-500))]">
          Structured navigation will appear here as the manuscript model fills in.
        </p>
      )
    }

    return (
      <div className="space-y-2.5">
        {selectedPublicationReaderNavigatorGroups.map((group) => {
          const isCollapsed = group.items.length > 0 && (publicationReaderCollapsedNodeIds[group.id] ?? false)
          return (
            <section key={group.id} className="space-y-1.5">
              <div
                className={cn(
                  'rounded-[0.95rem] border border-[hsl(var(--tone-neutral-200))] bg-white px-2.5 py-1.5 transition-[background-color,border-color,box-shadow,transform] duration-[var(--motion-duration-ui)] ease-out',
                  'hover:border-[hsl(var(--tone-neutral-250))] hover:bg-[hsl(var(--tone-neutral-50)/0.55)]',
                )}
              >
                <div className="flex items-center gap-2">
                  <span
                    className={cn(
                      'h-6 w-[0.22rem] shrink-0 rounded-full transition-[transform,opacity] duration-[var(--motion-duration-ui)] ease-out',
                      group.toneClassName,
                      'opacity-85',
                    )}
                  />
                  <button
                    type="button"
                    className="min-w-0 flex-1 rounded-md bg-transparent text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring))] focus-visible:ring-offset-2"
                    onClick={() => onSelectPublicationReaderNavigatorTarget(group.target)}
                    disabled={!group.target}
                  >
                    <span className={cn(houseNavigation.sectionLabel, 'truncate text-[0.66rem] tracking-[0.12em]')}>
                      {group.label}
                    </span>
                  </button>
                  {group.items.length > 0 ? (
                    <button
                      type="button"
                      className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[hsl(var(--tone-neutral-50))] text-[hsl(var(--tone-neutral-500))] transition-[background-color,color,transform] duration-[var(--motion-duration-ui)] ease-out hover:bg-white hover:text-[hsl(var(--tone-neutral-800))]"
                      onClick={() => onTogglePublicationReaderOutlineNode(group.id)}
                      aria-label={`${isCollapsed ? 'Expand' : 'Collapse'} ${group.label}`}
                    >
                      <ChevronDown
                        className={cn(
                          'h-3.5 w-3.5 transition-transform duration-[var(--motion-duration-ui)] ease-out',
                          isCollapsed ? '-rotate-90' : 'rotate-0',
                        )}
                      />
                    </button>
                  ) : null}
                </div>
              </div>
              {group.items.length > 0 && !isCollapsed ? (
                <div className="ml-2 space-y-0.5 border-l border-[hsl(var(--tone-neutral-200))] pl-3">
                  {group.items.map((item) => (
                    <button
                      key={item.id}
                      type="button"
                      className={cn(
                        houseNavigation.item,
                        'w-full rounded-[0.85rem] border border-transparent bg-transparent px-2.5 py-2 text-left shadow-none',
                        'hover:border-[hsl(var(--tone-neutral-200))] hover:bg-white',
                      )}
                      style={{ paddingLeft: `${0.75 + (item.indent * 0.8)}rem` }}
                      onClick={() => onSelectPublicationReaderNavigatorTarget(item.target)}
                    >
                      <span className="flex min-w-0 items-center gap-2">
                        <span className={cn(houseNavigation.itemLabel, 'text-[0.84rem]', item.indent > 1 && 'text-[0.8rem]')}>
                          {item.label}
                        </span>
                      </span>
                    </button>
                  ))}
                </div>
              ) : null}
            </section>
          )
        })}
      </div>
    )
  }

  return (
    <Stack data-house-role="page" space="sm">
      <Row align="center" gap="md" wrap={false} className="house-page-title-row">
        <SectionMarker tone={getSectionMarkerTone('profile')} size="title" className="self-stretch h-auto" />
        <PageHeader
          heading="Publications"
          description="Track your research metrics and manage your publication library."
          className="!ml-0 !mt-0"
        />
      </Row>

      <Section className={cn(HOUSE_SECTION_ANCHOR_CLASS)} surface="transparent" inset="none" spaceY="none">
        <PublicationsTopStrip
          metrics={topMetricsResponse}
          personaJournals={personaJournals}
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
      </Section>

      <Section className={cn(HOUSE_SECTION_ANCHOR_CLASS)} surface="transparent" inset="none" spaceY="none">
        <SectionHeader
          heading="Publication library"
          headingAccessory={(
            <div className="house-approved-toggle-context inline-flex items-center">
              <div
                className={cn(HOUSE_TOGGLE_TRACK_CLASS, 'overflow-hidden')}
                data-ui="publication-library-view-toggle"
                data-house-role="chart-toggle"
                style={{ width: '15.25rem', minWidth: '15.25rem', maxWidth: '15.25rem', gridTemplateColumns: '1fr 1fr' }}
              >
                {([
                  { value: 'publications', label: 'My publications' },
                  { value: 'journals', label: 'My journals' },
                ] as Array<{ value: PublicationLibraryViewMode; label: string }>).map((option) => {
                  const active = publicationLibraryViewMode === option.value
                  return (
                    <button
                      key={option.value}
                      type="button"
                      className={cn(
                        HOUSE_TOGGLE_BUTTON_CLASS,
                        'relative z-[1] min-w-0 px-3 text-center',
                        option.value === 'publications' ? '!rounded-l-full !rounded-r-none' : '!rounded-l-none !rounded-r-full',
                        active ? 'bg-foreground text-background shadow-sm' : HOUSE_DRILLDOWN_TOGGLE_MUTED_CLASS,
                      )}
                      aria-pressed={active}
                      onClick={() => {
                        setPublicationLibraryViewMode(option.value)
                        setPublicationLibraryPage(1)
                      }}
                    >
                      {option.label}
                    </button>
                  )
                })}
              </div>
            </div>
          )}
          className="house-publications-toolbar-header house-publications-library-toolbar-header [&_[data-house-role=section-header-content]]:md:items-center"
          actions={(
            <div className="flex min-w-[13.75rem] items-center justify-end gap-1 overflow-visible self-center">
            <SectionTools tone="publications" framed={false} className="order-2">
            {publicationLibraryVisible ? (
              <div className="relative order-1 shrink-0">
                <button
                  ref={publicationLibrarySearchButtonRef}
                  type="button"
                  data-state={publicationLibrarySearchVisible ? 'open' : 'closed'}
                  className={cn(
                    'h-8 w-8 house-publications-action-icon house-publications-top-control house-publications-search-toggle house-section-tool-button inline-flex items-center justify-center transition-[background-color,border-color,box-shadow] duration-[var(--motion-duration-ui)] ease-out',
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
                >
                  <Search className="house-publications-tools-toggle-icon house-publications-search-toggle-icon h-[1.09rem] w-[1.09rem]" strokeWidth={2.1} />
                </button>
                {publicationLibrarySearchVisible ? createPortal(
                  <div
                    ref={publicationLibrarySearchPopoverRef}
                    className="house-publications-search-popover fixed z-50 w-[22.5rem]"
                    style={{
                      top: `${publicationLibrarySearchPopoverPosition.top}px`,
                      right: `${publicationLibrarySearchPopoverPosition.right}px`,
                    }}
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
                      placeholder={publicationLibraryViewMode === 'journals'
                        ? 'Search by journal, publisher, ISSN, OpenAlex source...'
                        : 'Search by publication name, author, PMID, DOI, journal...'}
                      className="house-publications-search-input"
                    />
                  </div>,
                  document.body
                ) : null}
              </div>
            ) : null}
            {publicationLibraryVisible && publicationLibraryViewMode === 'publications' ? (
              <div className="relative order-2 shrink-0">
                <button
                  ref={publicationLibraryFilterButtonRef}
                  type="button"
                  data-state={publicationLibraryFiltersVisible ? 'open' : 'closed'}
                  data-filtered={selectedPublicationTypes.length > 0 || selectedArticleTypes.length > 0 ? 'true' : 'false'}
                  className={cn(
                    'h-8 w-8 house-publications-action-icon house-publications-top-control house-publications-filter-toggle house-section-tool-button inline-flex items-center justify-center transition-[background-color,border-color,box-shadow] duration-[var(--motion-duration-ui)] ease-out',
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
                >
                  <Filter className="house-publications-tools-toggle-icon house-publications-filter-toggle-icon h-[1.09rem] w-[1.09rem]" strokeWidth={2.1} />
                </button>
                {publicationLibraryFiltersVisible ? createPortal(
                  <div
                    ref={publicationLibraryFilterPopoverRef}
                    className="house-publications-filter-popover fixed z-50 w-[17.5rem]"
                    style={{
                      top: `${publicationLibraryFilterPopoverPosition.top}px`,
                      right: `${publicationLibraryFilterPopoverPosition.right}px`,
                    }}
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
                  </div>,
                  document.body
                ) : null}
              </div>
            ) : null}
            </SectionTools>
            <div
              className={cn(
                'relative order-2 overflow-visible transition-[max-width,opacity,transform] duration-[var(--motion-duration-ui)] ease-out',
                publicationLibraryVisible && publicationLibraryViewMode === 'publications' && publicationLibraryToolsOpen
                  ? 'z-30 max-w-[20rem] translate-x-0 opacity-100'
                  : 'pointer-events-none z-0 max-w-0 translate-x-1 opacity-0',
                )}
              aria-hidden={!publicationLibraryVisible || publicationLibraryViewMode !== 'publications' || !publicationLibraryToolsOpen}
            >
              <div className="flex min-w-0 flex-nowrap whitespace-nowrap gap-1">
                <div className="relative inline-flex">
                  <Button
                    type="button"
                    variant="house"
                    size="icon"
                    className="peer h-8 w-8 house-publications-toolbox-item"
                    aria-label="Generate publication library report"
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
                    ref={publicationLibraryDownloadButtonRef}
                    type="button"
                    variant="house"
                    size="icon"
                    data-state={publicationLibraryDownloadVisible ? 'open' : 'closed'}
                    className={cn(
                      'peer h-8 w-8 house-publications-toolbox-item',
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
                  </Button>
                  {publicationLibraryDownloadVisible ? createPortal(
                    <div
                      ref={publicationLibraryDownloadPopoverRef}
                      className="house-publications-filter-popover fixed z-50 w-[20.5rem]"
                      style={{
                        top: `${publicationLibraryDownloadPopoverPosition.top}px`,
                        right: `${publicationLibraryDownloadPopoverPosition.right}px`,
                      }}
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
                    aria-label="Share publication library"
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
            {publicationLibraryVisible && publicationLibraryViewMode === 'publications' ? (
              <button
                type="button"
                data-state={publicationLibraryToolsOpen ? 'open' : 'closed'}
                className={cn(
                    'order-4 h-8 w-8 shrink-0 house-publications-action-icon house-publications-top-control house-section-tool-button inline-flex items-center justify-center transition-[background-color,border-color,box-shadow] duration-[var(--motion-duration-ui)] ease-out',
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
              >
                <Hammer className="house-publications-tools-toggle-icon h-[1.09rem] w-[1.09rem]" strokeWidth={2.1} />
              </button>
            ) : null}
            {publicationLibraryVisible && publicationLibraryViewMode === 'publications' ? (
              <div className="relative order-5 shrink-0">
                <button
                  ref={publicationLibrarySettingsButtonRef}
                  type="button"
                  data-state={publicationLibrarySettingsVisible ? 'open' : 'closed'}
                  className={cn(
                    'h-8 w-8 house-publications-action-icon house-publications-top-control house-publications-settings-toggle house-section-tool-button inline-flex items-center justify-center transition-[background-color,border-color,box-shadow] duration-[var(--motion-duration-ui)] ease-out',
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
                >
                  <Settings className="house-publications-tools-toggle-icon house-publications-settings-toggle-icon h-[1.09rem] w-[1.09rem]" strokeWidth={2.1} />
                </button>
                {publicationLibrarySettingsVisible ? createPortal(
                  <div
                    ref={publicationLibrarySettingsPopoverRef}
                    className="house-publications-filter-popover fixed z-50 w-[18.75rem]"
                    style={{
                      top: `${publicationLibrarySettingsPopoverPosition.top}px`,
                      right: `${publicationLibrarySettingsPopoverPosition.right}px`,
                    }}
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
                  </div>,
                  document.body
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
            </SectionTools>
            </div>
          )}
        />
        {publicationLibraryVisible ? (
          <Section surface="transparent" inset="none" spaceY="none" className="space-y-1">
          <div className="grid grid-cols-1 items-start gap-4">
            <div className="space-y-1">

              {(publicationLibraryViewMode === 'journals' ? filteredJournals.length === 0 : filteredWorks.length === 0) ? (
                <div className="rounded border border-dashed border-border p-4 text-sm text-muted-foreground">
                  <p className="mb-2 text-foreground">
                    {publicationLibraryViewMode === 'journals'
                      ? (journalLibraryEmptyState?.title || 'No journals in your library yet.')
                      : (publicationLibraryEmptyState?.title || 'No works in your library yet.')}
                  </p>
                  <ol className="list-decimal space-y-1 pl-5">
                    {((publicationLibraryViewMode === 'journals'
                      ? journalLibraryEmptyState?.steps
                      : publicationLibraryEmptyState?.steps) || [
                      'Connect ORCID in Integrations.',
                      'Run ORCID sync from the top-right actions.',
                      'Select any row to inspect publication details.',
                    ]).map((step) => (
                      <li key={step}>{step}</li>
                    ))}
                  </ol>
                </div>
              ) : publicationLibraryViewMode === 'journals' ? (
                <div className="w-full house-table-context-profile">
                  <Table
                    className={cn(
                      'min-w-[72rem] w-full table-auto',
                      publicationTableDensity === 'compact' && 'house-publications-table-density-compact',
                      publicationTableDensity === 'comfortable' && 'house-publications-table-density-comfortable',
                    )}
                    data-house-no-column-resize="true"
                    data-house-no-column-controls="true"
                  >
                    <TableHeader className="house-table-head text-left">
                      <TableRow style={{ backgroundColor: 'transparent' }}>
                        <TableHead className={`${HOUSE_TABLE_HEAD_TEXT_CLASS} border-r border-[hsl(var(--border))] pr-4 text-left`}>
                          <SortHeader
                            label="Journal"
                            column="journal"
                            sortField={journalSortField}
                            sortDirection={journalSortDirection}
                            align="left"
                            onSort={(column) => onSortJournalColumn(column as JournalSortField)}
                          />
                        </TableHead>
                        <TableHead className={`${HOUSE_TABLE_HEAD_TEXT_CLASS} w-[1%] whitespace-nowrap text-center`}>
                          <SortHeader
                            label="Count"
                            column="publication_count"
                            sortField={journalSortField}
                            sortDirection={journalSortDirection}
                            align="center"
                            onSort={(column) => onSortJournalColumn(column as JournalSortField)}
                          />
                        </TableHead>
                        <TableHead className={`${HOUSE_TABLE_HEAD_TEXT_CLASS} w-[1%] whitespace-nowrap text-center`}>
                          <SortHeader
                            label="Share"
                            column="share_pct"
                            sortField={journalSortField}
                            sortDirection={journalSortDirection}
                            align="center"
                            onSort={(column) => onSortJournalColumn(column as JournalSortField)}
                          />
                        </TableHead>
                        <TableHead className={`${HOUSE_TABLE_HEAD_TEXT_CLASS} w-[6.75rem] text-center`}>
                          <SortHeader
                            label={<span className="inline-flex flex-col"><span>Average</span><span>citations</span></span>}
                            column="avg_citations"
                            sortField={journalSortField}
                            sortDirection={journalSortDirection}
                            align="center"
                            onSort={(column) => onSortJournalColumn(column as JournalSortField)}
                          />
                        </TableHead>
                        <TableHead className={`${HOUSE_TABLE_HEAD_TEXT_CLASS} w-[6.75rem] text-center`}>
                          <SortHeader
                            label={<span className="inline-flex flex-col"><span>Median</span><span>citations</span></span>}
                            column="median_citations"
                            sortField={journalSortField}
                            sortDirection={journalSortDirection}
                            align="center"
                            onSort={(column) => onSortJournalColumn(column as JournalSortField)}
                          />
                        </TableHead>
                        <TableHead className={`${HOUSE_TABLE_HEAD_TEXT_CLASS} w-[7.75rem] border-l border-[hsl(var(--border))] pl-4 text-center`}>
                          <SortHeader
                            label={<span className="inline-flex flex-col"><span>Impact</span><span>factor</span></span>}
                            column="impact_factor"
                            sortField={journalSortField}
                            sortDirection={journalSortDirection}
                            align="center"
                            onSort={(column) => onSortJournalColumn(column as JournalSortField)}
                          />
                        </TableHead>
                        <TableHead className={`${HOUSE_TABLE_HEAD_TEXT_CLASS} w-[7.5rem] text-center`}>
                          <SortHeader
                            label={<span className="inline-flex flex-col"><span>5 year</span><span>IF</span></span>}
                            column="five_year_impact_factor"
                            sortField={journalSortField}
                            sortDirection={journalSortDirection}
                            align="center"
                            onSort={(column) => onSortJournalColumn(column as JournalSortField)}
                          />
                        </TableHead>
                        <TableHead className={`${HOUSE_TABLE_HEAD_TEXT_CLASS} w-[8.5rem] text-center`}>
                          <SortHeader
                            label={<span className="inline-flex flex-col"><span>Citation</span><span>indicator</span></span>}
                            column="journal_citation_indicator"
                            sortField={journalSortField}
                            sortDirection={journalSortDirection}
                            align="center"
                            onSort={(column) => onSortJournalColumn(column as JournalSortField)}
                          />
                        </TableHead>
                        <TableHead className={`${HOUSE_TABLE_HEAD_TEXT_CLASS} w-[6.5rem] text-center`}>
                          <SortHeader
                            label={<span className="inline-flex flex-col"><span>Cited</span><span>half-life</span></span>}
                            column="cited_half_life"
                            sortField={journalSortField}
                            sortDirection={journalSortDirection}
                            align="center"
                            onSort={(column) => onSortJournalColumn(column as JournalSortField)}
                          />
                        </TableHead>
                        <TableHead className={`${HOUSE_TABLE_HEAD_TEXT_CLASS} w-[6rem] text-center`}>
                          <SortHeader
                            label={<span className="inline-flex flex-col"><span>Open</span><span>access</span></span>}
                            column="is_oa"
                            sortField={journalSortField}
                            sortDirection={journalSortDirection}
                            align="center"
                            onSort={(column) => onSortJournalColumn(column as JournalSortField)}
                          />
                        </TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {pagedFilteredJournals.map((journal) => (
                        <TableRow
                          key={journal.journal_key}
                          className={cn(
                            publicationTableAlternateRowColoring && 'odd:bg-[hsl(var(--tone-neutral-50))] even:bg-[hsl(var(--tone-neutral-100))]',
                          )}
                        >
                          <TableCell className={`align-top border-r border-[hsl(var(--border))] pr-4 font-medium ${HOUSE_TABLE_CELL_TEXT_CLASS}`}>
                            <div className="grid gap-1">
                              <span className="min-w-0 whitespace-normal break-words leading-tight">
                                {formatJournalName(journal.display_name) || 'n/a'}
                              </span>
                              {journal.publisher ? (
                                <span className="text-[0.68rem] font-medium uppercase tracking-[0.06em] text-[hsl(var(--tone-neutral-500))]">
                                  {journal.publisher}
                                </span>
                              ) : null}
                            </div>
                          </TableCell>
                          <TableCell className={`${HOUSE_TABLE_CELL_TEXT_CLASS} whitespace-nowrap align-top text-center`}>
                            {journal.publication_count}
                          </TableCell>
                          <TableCell className={`${HOUSE_TABLE_CELL_TEXT_CLASS} whitespace-nowrap align-top text-center`}>
                            {journal.share_pct.toFixed(1)}%
                          </TableCell>
                          <TableCell className={`${HOUSE_TABLE_CELL_TEXT_CLASS} whitespace-nowrap align-top text-center`}>
                            {journal.avg_citations.toFixed(1)}
                          </TableCell>
                          <TableCell className={`${HOUSE_TABLE_CELL_TEXT_CLASS} whitespace-nowrap align-top text-center`}>
                            {journal.median_citations.toFixed(1)}
                          </TableCell>
                          <TableCell className={`${HOUSE_TABLE_CELL_TEXT_CLASS} whitespace-nowrap align-top border-l border-[hsl(var(--border))] pl-4 text-center`}>
                            {renderJournalPlainNumericMetric(journal.publisher_reported_impact_factor, 1)}
                          </TableCell>
                          <TableCell className={`${HOUSE_TABLE_CELL_TEXT_CLASS} whitespace-nowrap align-top text-center`}>
                            {renderJournalPlainNumericMetric(journal.five_year_impact_factor, 1)}
                          </TableCell>
                          <TableCell className={`${HOUSE_TABLE_CELL_TEXT_CLASS} whitespace-nowrap align-top text-center`}>
                            {renderJournalCitationIndicatorPill(journal.journal_citation_indicator)}
                          </TableCell>
                          <TableCell className={`${HOUSE_TABLE_CELL_TEXT_CLASS} whitespace-nowrap align-top text-center`}>
                            {renderJournalPlainTextMetric(journal.cited_half_life)}
                          </TableCell>
                          <TableCell className={`${HOUSE_TABLE_CELL_TEXT_CLASS} whitespace-nowrap align-top text-center`}>
                            <span className={cn(journal.is_oa == null && 'text-[hsl(var(--tone-neutral-400))]')}>
                              {journal.is_oa == null ? 'Unknown' : journal.is_oa ? 'Yes' : 'No'}
                            </span>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                  <div className="mt-1 flex items-center justify-between gap-2 px-1">
                    <p className="text-[0.68rem] font-semibold uppercase tracking-[0.06em] text-[hsl(var(--tone-neutral-500))]">
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
              ) : (
                <div ref={publicationTableLayoutRef} className="w-full house-table-context-profile">
                  <Table
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
                            >
                              <SortHeader
                                label={definition.label}
                                column={definition.sortField}
                                sortField={sortField}
                                sortDirection={sortDirection}
                                align="left"
                                onSort={onSortColumn}
                              />
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
                            onMouseEnter={() => prefetchPublicationOverviewData(work.id)}
                            onPointerDown={() => prefetchPublicationOverviewData(work.id)}
                            onClick={() => openPublicationInDetailPanel(work.id, 'overview')}
                            className={cn(
                              'cursor-pointer',
                              publicationTableAlternateRowColoring && 'odd:bg-[hsl(var(--tone-neutral-50))] even:bg-[hsl(var(--tone-neutral-100))]',
                              isSelected ? 'bg-emerald-50/70' : 'hover:bg-accent/30',
                            )}
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
                                            <Paperclip className="h-3.5 w-3.5" />
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
                                      : 'text-[hsl(var(--tone-neutral-700))]',
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
                    <p className="text-[0.68rem] font-semibold uppercase tracking-[0.06em] text-[hsl(var(--tone-neutral-500))]">
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
              <SheetContent
                side="right"
                className={HOUSE_PUBLICATION_DRILLDOWN_SHEET_CLASS}
                onInteractOutside={(event) => {
                  if (shouldKeepPublicationDrilldownOpen(event.target)) {
                    event.preventDefault()
                  }
                }}
                onPointerDownOutside={(event) => {
                  if (shouldKeepPublicationDrilldownOpen(event.target)) {
                    event.preventDefault()
                  }
                }}
              >
                {selectedWork ? (
                  <div className={cn(HOUSE_PUBLICATION_DRILLDOWN_SHEET_BODY_CLASS, 'house-drilldown-panel-no-pad')}>
                    <DrilldownSheet.Header
                          title={selectedDetail?.title || selectedWork.title}
                          subtitle={[detailJournal || 'Publication record', detailYear ? String(detailYear) : null].filter(Boolean).join(' | ')}
                          variant="profile"
                          alert={activePaneError ? <p className={HOUSE_PUBLICATION_DRILLDOWN_ALERT_CLASS}>{activePaneError}</p> : undefined}
                        >
                          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                            <DrilldownSheet.Tabs
                              activeTab={activeDetailTab}
                              onTabChange={(tabId) => onDetailTabChange(tabId as PublicationDetailTab)}
                              panelIdPrefix="publication-drilldown-panel-"
                              tabIdPrefix="publication-drilldown-tab-"
                              tone="profile"
                              flexGrow={drilldownTabFlexGrow}
                              aria-label="Publication drilldown sections"
                              className="house-drilldown-tabs"
                            >
                              {PUBLICATION_DETAIL_TABS.map((tab) => (
                                <DrilldownSheet.Tab key={tab.id} id={tab.id}>
                                  {tab.label}
                                </DrilldownSheet.Tab>
                              ))}
                            </DrilldownSheet.Tabs>
                          </div>
                      </DrilldownSheet.Header>

                      <DrilldownSheet.TabPanel id={activeDetailTab} isActive={true}>
                          <div className="house-drilldown-stack-3" data-metric-key="publication-library-drilldown">
                            <div className={cn(houseSurfaces.sectionPanel, 'house-drilldown-panel-no-pad')}>
                        {activeDetailTab === 'overview' ? (
                          <>
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
                              <p className={cn(HOUSE_PUBLICATION_DRILLDOWN_SUMMARY_STAT_TITLE_CLASS, 'house-drilldown-stat-title house-publication-overview-stat-title')}>Publication type</p>
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
                              <p className={cn(HOUSE_PUBLICATION_DRILLDOWN_SUMMARY_STAT_TITLE_CLASS, 'house-drilldown-stat-title house-publication-overview-stat-title')}>Link to paper</p>
                              <div className={cn(HOUSE_PUBLICATION_DRILLDOWN_SUMMARY_STAT_VALUE_WRAP_CLASS, 'house-publication-overview-stat-value-wrap')}>
                                {detailDoi ? (
                                  <TooltipProvider delayDuration={120}>
                                    <Tooltip>
                                      <TooltipTrigger asChild>
                                        <a
                                          className="group inline-flex h-8 w-8 items-center justify-center rounded-md border border-transparent bg-[hsl(var(--background))] text-[hsl(var(--tone-neutral-700))] shadow-[0_1px_2px_hsl(var(--tone-neutral-950)/0.03)] transition-[background-color,border-color,color,box-shadow] duration-[var(--motion-duration-ui)] ease-out hover:border-transparent hover:bg-[hsl(var(--tone-neutral-50))] hover:text-[hsl(var(--tone-neutral-900))] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring))] focus-visible:ring-offset-2"
                                          href={doiToUrl(detailDoi) || undefined}
                                          target="_blank"
                                          rel="noreferrer"
                                          aria-label={detailPaperLinkTooltip}
                                        >
                                          <ArrowUpRight className="h-4 w-4 transition-transform duration-[var(--motion-duration-ui)] ease-out group-hover:-translate-y-0.5 group-hover:translate-x-0.5" strokeWidth={2.1} />
                                        </a>
                                      </TooltipTrigger>
                                      <TooltipContent side="top" align="center" className="house-approved-tooltip max-w-[16rem] whitespace-normal px-2.5 py-2 text-xs leading-relaxed text-[hsl(var(--tone-neutral-700))] shadow-none">
                                        {detailPaperLinkTooltip}
                                      </TooltipContent>
                                    </Tooltip>
                                  </TooltipProvider>
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
                                      {overviewAuthors.length > PUBLICATION_OVERVIEW_AUTHORS_PREVIEW_LIMIT ? (
                                        <>
                                          {' '}
                                          <button
                                            type="button"
                                            className={HOUSE_PUBLICATION_DRILLDOWN_LINK_CLASS}
                                            onClick={() => setOverviewAuthorsExpanded((current) => !current)}
                                          >
                                            {overviewAuthorsExpanded
                                              ? 'Show less'
                                              : `+${overviewAuthors.length - PUBLICATION_OVERVIEW_AUTHORS_PREVIEW_LIMIT} more`}
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
                                <p className={cn(HOUSE_PUBLICATION_DRILLDOWN_SUMMARY_STAT_TITLE_CLASS, 'house-drilldown-stat-title house-publication-overview-stat-title')}>My contribution</p>
                                <div className={cn(HOUSE_PUBLICATION_DRILLDOWN_SUMMARY_STAT_VALUE_WRAP_CLASS, 'house-publication-overview-stat-value-wrap')}>
                                  <p className={cn(HOUSE_PUBLICATION_DRILLDOWN_SUMMARY_STAT_VALUE_CLASS, 'house-publication-overview-stat-value', overviewOwnerContributionToneClass)}>{overviewOwnerContribution}</p>
                                </div>
                              </div>
                            </div>
                          </div>
                          {selectedPublicationReaderEntryAvailable ? (
                            <>
                              <div className="house-drilldown-heading-block">
                                <p className="house-drilldown-heading-block-title">Reader</p>
                              </div>
                              <div className="house-drilldown-content-block">
                                <div className="house-drilldown-summary-stat-card house-drilldown-abstract-metric-card w-full">
                                  <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                                    <div className="min-w-0">
                                      <p className="text-sm font-medium text-[hsl(var(--tone-neutral-900))]">
                                        Continue in the publication reader
                                      </p>
                                      <p className="mt-1 text-sm leading-relaxed text-[hsl(var(--tone-neutral-600))]">
                                        {selectedPaperPrimaryPdfContentFileId
                                          ? 'Open the continuous-scroll PDF reader with the structured outline alongside it.'
                                          : 'Open the structured reader for this paper now. If a PDF becomes available, the reader will switch into PDF view automatically.'}
                                      </p>
                                    </div>
                                    <Button
                                      type="button"
                                      variant="outline"
                                      size="sm"
                                      className="shrink-0 gap-2 rounded-full border-[hsl(var(--tone-accent-300))] bg-[hsl(var(--tone-accent-50))] px-4 text-[hsl(var(--tone-accent-800))] hover:bg-[hsl(var(--tone-accent-100))]"
                                      onClick={onOpenPublicationReader}
                                    >
                                      {publicationReaderLoading && publicationReaderOpen ? (
                                        <Loader2 className="h-4 w-4 animate-spin" />
                                      ) : (
                                        <FileText className="h-4 w-4" />
                                      )}
                                      <span>{selectedPaperPrimaryPdfContentFileId ? 'Open reader' : 'Open structured reader'}</span>
                                    </Button>
                                  </div>
                                </div>
                              </div>
                            </>
                          ) : null}

                        </>
                        ) : null}

                        {activeDetailTab === 'content' ? (
                          <>
                            {selectedDetail?.structured_abstract_status === 'FAILED' ? (
                              <div className="house-drilldown-content-block">
                                <div className="house-drilldown-summary-stat-card house-drilldown-abstract-metric-card w-full">
                                  <p className={HOUSE_PUBLICATION_DRILLDOWN_NOTE_WARNING_CLASS}>Structured abstract generation failed. Showing raw abstract.</p>
                                </div>
                              </div>
                            ) : null}
                            {selectedDetail?.structured_abstract_last_error ? (
                              <div className="house-drilldown-content-block">
                                <div className="house-drilldown-summary-stat-card house-drilldown-abstract-metric-card w-full">
                                  <p className={HOUSE_PUBLICATION_DRILLDOWN_NOTE_WARNING_CLASS}>{selectedDetail.structured_abstract_last_error}</p>
                                </div>
                              </div>
                            ) : null}
                            {resolvedStructuredSections.length ? (
                              <>
                                {resolvedStructuredSections.map((section, index) => {
                                  const sectionParagraphs = splitLongTextIntoParagraphs(section.content || '')
                                  return [
                                    <div key={`abstract-section-heading-${section.key || index}`} className="house-drilldown-heading-block">
                                      <p className="house-drilldown-heading-block-title">{section.label || 'Summary'}</p>
                                    </div>,
                                    <div key={`abstract-section-content-${section.key || index}`} className="house-drilldown-content-block">
                                      <div className="house-drilldown-summary-stat-card house-drilldown-abstract-metric-card w-full">
                                        {sectionParagraphs.length > 0 ? (
                                          <div className="house-drilldown-abstract-paragraph-stack">
                                            {sectionParagraphs.map((paragraph, paragraphIndex) => (
                                              <p key={`abstract-section-paragraph-${section.key || index}-${paragraphIndex}`} className="text-sm leading-relaxed">{paragraph}</p>
                                            ))}
                                          </div>
                                        ) : (
                                          <p className="text-sm leading-relaxed">Not available</p>
                                        )}
                                      </div>
                                    </div>,
                                  ]
                                })}
                                {inferredRegistrationSectionContent ? (
                                  <>
                                    <div className="house-drilldown-heading-block">
                                      <p className="house-drilldown-heading-block-title">Registration</p>
                                    </div>
                                    <div className="house-drilldown-content-block">
                                      <div className="house-drilldown-summary-stat-card house-drilldown-abstract-metric-card w-full">
                                        <p className="text-sm leading-relaxed">{inferredRegistrationSectionContent}</p>
                                      </div>
                                    </div>
                                  </>
                                ) : null}
                                {abstractKeywordList.length > 0 ? (
                                  <>
                                    <div className="house-drilldown-heading-block">
                                      <p className="house-drilldown-heading-block-title">Keywords</p>
                                    </div>
                                    <div className="house-drilldown-content-block">
                                      <div className="house-drilldown-summary-stat-card house-drilldown-abstract-metric-card w-full">
                                        <p className="text-sm leading-relaxed">{abstractKeywordList.join(', ')}</p>
                                      </div>
                                    </div>
                                  </>
                                ) : null}
                              </>
                            ) : effectiveDetailAbstract ? (
                              <div className="house-drilldown-content-block">
                                <div className="house-drilldown-summary-stat-card house-drilldown-abstract-metric-card w-full">
                                  <div className="house-drilldown-abstract-paragraph-stack">
                                    {abstractPreviewParagraphs.map((paragraph, paragraphIndex) => (
                                      <p key={`abstract-preview-paragraph-${paragraphIndex}`} className="text-sm leading-relaxed">{paragraph}</p>
                                    ))}
                                  </div>
                                  {effectiveDetailAbstract.length > 700 ? (
                                    <button
                                      type="button"
                                      className={HOUSE_PUBLICATION_DRILLDOWN_LINK_CLASS}
                                      style={{ marginTop: '0.5rem' }}
                                      onClick={onToggleAbstractExpanded}
                                    >
                                      {abstractExpanded ? 'Show less' : 'Show more'}
                                    </button>
                                  ) : null}
                                </div>
                              </div>
                            ) : abstractKeywordList.length > 0 ? (
                              <>
                                <div className="house-drilldown-heading-block">
                                  <p className="house-drilldown-heading-block-title">Keywords</p>
                                </div>
                                <div className="house-drilldown-content-block">
                                  <div className="house-drilldown-summary-stat-card house-drilldown-abstract-metric-card w-full">
                                    <p className="text-sm leading-relaxed">{abstractKeywordList.join(', ')}</p>
                                  </div>
                                </div>
                              </>
                            ) : (
                              <div className="house-drilldown-content-block">
                                <div className="house-drilldown-summary-stat-card house-drilldown-abstract-metric-card w-full">
                                  <p className={HOUSE_PUBLICATION_DRILLDOWN_NOTE_SOFT_CLASS}>No abstract available.</p>
                                </div>
                              </div>
                            )}
                          </>
                        ) : null}

                        {activeDetailTab === 'impact' ? (
                          <>
                          <div className="house-drilldown-heading-block">
                            <p className="house-drilldown-heading-block-title">Impact</p>
                          </div>
                          {selectedImpactResponse?.status === 'RUNNING' ? (
                            <div className="house-drilldown-content-block">
                              <div className={HOUSE_PUBLICATION_DRILLDOWN_STAT_CARD_CLASS}>
                                <p className={HOUSE_PUBLICATION_DRILLDOWN_NOTE_SOFT_CLASS}>Computing impact insights...</p>
                              </div>
                            </div>
                          ) : null}
                          {selectedImpactResponse?.status === 'FAILED' ? (
                            <div className="house-drilldown-content-block">
                              <div className={HOUSE_PUBLICATION_DRILLDOWN_STAT_CARD_CLASS}>
                                <p className={HOUSE_PUBLICATION_DRILLDOWN_NOTE_WARNING_CLASS}>Last impact update failed. Showing cached data.</p>
                              </div>
                            </div>
                          ) : null}
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
                          <div className="house-drilldown-heading-block">
                            <p className="house-drilldown-heading-block-title">Key citing papers</p>
                          </div>
                          <div className="house-drilldown-content-block">
                            <div className={HOUSE_PUBLICATION_DRILLDOWN_STAT_CARD_CLASS}>
                              {(selectedImpactResponse?.payload?.key_citing_papers || []).length === 0 ? <p className={HOUSE_PUBLICATION_DRILLDOWN_NOTE_SOFT_CLASS}>Not available from source.</p> : (selectedImpactResponse?.payload?.key_citing_papers || []).slice(0, 5).map((paper, index) => <p key={`${paper.title}-${index}`}>{paper.year ?? 'n/a'} | {paper.title}</p>)}
                            </div>
                          </div>
                        </>
                        ) : null}

                        {activeDetailTab === 'files' ? (
                          <>
                            <div className="house-publications-drilldown-bounded-section">
                              <div className="house-drilldown-heading-block">
                                <p className="house-drilldown-heading-block-title">Open Access Files</p>
                                {selectedCanFindOaFile ? (
                                  <TooltipProvider delayDuration={120}>
                                    <Tooltip>
                                      <TooltipTrigger asChild>
                                        <div className="inline-flex">
                                          <Button
                                            type="button"
                                            variant="house"
                                            size="icon"
                                            className="h-8 w-8 house-publications-toolbox-item"
                                            onClick={() => void onFindOpenAccessPublicationFile()}
                                            disabled={findingOaFile}
                                            aria-label="Find OA PDF"
                                          >
                                            {findingOaFile ? (
                                              <Loader2 className="h-4 w-4 animate-spin" strokeWidth={2.1} />
                                            ) : (
                                              <Search className="h-4 w-4" strokeWidth={2.1} />
                                            )}
                                          </Button>
                                        </div>
                                      </TooltipTrigger>
                                      <TooltipContent side="top" align="center" className="house-approved-tooltip px-2.5 py-2 text-xs leading-relaxed text-[hsl(var(--tone-neutral-700))] shadow-none">
                                        Find OA PDF
                                      </TooltipContent>
                                    </Tooltip>
                                  </TooltipProvider>
                                ) : null}
                              </div>
                              <div className="house-drilldown-content-block house-drilldown-heading-content-block">
                                {renderPublicationFileList(selectedOpenAccessFiles, 'No open-access file linked to this publication.')}
                              </div>
                            </div>
                            <div className="house-publications-drilldown-bounded-section">
                              <div className="house-drilldown-heading-block">
                                <p className="house-drilldown-heading-block-title">Additional Files</p>
                              </div>
                              <div className="house-drilldown-content-block house-drilldown-heading-content-block">
                                {renderPublicationFileList(selectedAdditionalFiles, 'No additional files attached yet.')}
                                <div className="mt-4">
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
                                      <p className={HOUSE_PUBLICATION_DRILLDOWN_STAT_TITLE_CLASS}>Upload files</p>
                                      <p className={HOUSE_PUBLICATION_DRILLDOWN_NOTE_SOFT_CLASS}>Drag and drop files here or use upload. Additional files will stack here under the publication.</p>
                                    </div>
                                    <div className="flex items-start gap-2">
                                      <TooltipProvider delayDuration={120}>
                                        <Tooltip>
                                          <TooltipTrigger asChild>
                                            <div className="inline-flex">
                                              <Button
                                                type="button"
                                                variant="house"
                                                size="icon"
                                                className="h-8 w-8 house-publications-toolbox-item"
                                                onClick={() => filePickerRef.current?.click()}
                                                disabled={uploadingFile || findingOaFile}
                                                aria-label="Upload file"
                                              >
                                                {uploadingFile ? (
                                                  <Loader2 className="h-4 w-4 animate-spin" strokeWidth={2.1} />
                                                ) : (
                                                  <Paperclip className="h-4 w-4" strokeWidth={2.1} />
                                                )}
                                              </Button>
                                            </div>
                                          </TooltipTrigger>
                                          <TooltipContent side="top" align="center" className="house-approved-tooltip px-2.5 py-2 text-xs leading-relaxed text-[hsl(var(--tone-neutral-700))] shadow-none">
                                            Upload file
                                          </TooltipContent>
                                        </Tooltip>
                                      </TooltipProvider>
                                      <input ref={filePickerRef} type="file" multiple className="hidden" onChange={(event) => void onUploadFiles(event.target.files)} />
                                    </div>
                                  </div>
                                </div>
                                </div>
                              </div>
                            </div>
                          </>
                        ) : null}

                        {publicationFileMenuState && publicationFileMenuFile ? createPortal(
                          <div className="pointer-events-auto fixed inset-0 z-[80]" data-ui="publication-file-menu-overlay" onClick={() => setPublicationFileMenuState(null)}>
                            <div
                              data-ui="publication-file-menu-shell"
                              className="pointer-events-auto fixed w-[15.25rem] rounded-md border border-border bg-card p-1 shadow-lg"
                              role="menu"
                              aria-label={`${publicationFileMenuFile.file_name} file actions`}
                              style={{ left: publicationFileMenuState.x, top: publicationFileMenuState.y }}
                              onClick={(event) => event.stopPropagation()}
                            >
                              <button
                                type="button"
                                role="menuitem"
                                className="flex w-full items-center gap-2 whitespace-nowrap rounded px-2 py-1.5 text-left text-sm hover:bg-[hsl(var(--tone-accent-100))] hover:text-[hsl(var(--tone-accent-900))]"
                                onClick={() => {
                                  setPublicationFileMenuState(null)
                                  onOpenPublicationFile(publicationFileMenuFile)
                                }}
                              >
                                <Download className="h-4 w-4 shrink-0" />
                                <span>Download file</span>
                              </button>
                              <button
                                type="button"
                                role="menuitem"
                                className="flex w-full items-center gap-2 whitespace-nowrap rounded px-2 py-1.5 text-left text-sm hover:bg-[hsl(var(--tone-accent-100))] hover:text-[hsl(var(--tone-accent-900))]"
                                onClick={() => {
                                  setPublicationFileMenuState(null)
                                  onSharePublicationFileEmail(publicationFileMenuFile)
                                }}
                              >
                                <Mail className="h-4 w-4 shrink-0" />
                                <span>Email file</span>
                              </button>
                              {canRenamePublicationFile(publicationFileMenuFile) || (canClassifyPublicationFile(publicationFileMenuFile) && !publicationFileMenuFile.classification) || publicationFileMenuFile.can_delete ? <div className="my-1 border-t border-border/70" /> : null}
                              {canRenamePublicationFile(publicationFileMenuFile) ? (
                                <button
                                  type="button"
                                  role="menuitem"
                                  className="flex w-full items-center gap-2 whitespace-nowrap rounded px-2 py-1.5 text-left text-sm hover:bg-[hsl(var(--tone-accent-100))] hover:text-[hsl(var(--tone-accent-900))]"
                                  onClick={() => onStartRenamePublicationFile(publicationFileMenuFile)}
                                >
                                  <Pencil className="h-4 w-4 shrink-0" />
                                  <span>Rename file</span>
                                </button>
                              ) : null}
                              {canClassifyPublicationFile(publicationFileMenuFile) && !publicationFileMenuFile.classification ? (
                                <button
                                  type="button"
                                  role="menuitem"
                                  className={cn(
                                    'flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-sm hover:bg-[hsl(var(--tone-accent-100))] hover:text-[hsl(var(--tone-accent-900))]',
                                    publicationFileMenuBusy && 'cursor-not-allowed text-muted-foreground hover:bg-transparent hover:text-muted-foreground',
                                  )}
                                  disabled={publicationFileMenuBusy}
                                  onClick={() => onStartPublicationFileClassification(publicationFileMenuFile)}
                                >
                                  <Tag className="h-4 w-4 shrink-0" />
                                  <span>Tag</span>
                                </button>
                              ) : null}
                              {(canRenamePublicationFile(publicationFileMenuFile) || (canClassifyPublicationFile(publicationFileMenuFile) && !publicationFileMenuFile.classification)) && publicationFileMenuFile.can_delete ? <div className="my-1 border-t border-border/70" /> : null}
                              {publicationFileMenuFile.can_delete ? (
                                <button
                                  type="button"
                                  role="menuitem"
                                  className={cn(
                                    'flex w-full items-center gap-2 whitespace-nowrap rounded px-2 py-1.5 text-left text-sm hover:bg-[hsl(var(--tone-accent-100))] hover:text-[hsl(var(--tone-accent-900))]',
                                    deletingFileId === publicationFileMenuFile.id && 'cursor-not-allowed text-muted-foreground hover:bg-transparent hover:text-muted-foreground',
                                  )}
                                  onClick={() => {
                                    if (deletingFileId === publicationFileMenuFile.id) {
                                      return
                                    }
                                    setPublicationFileMenuState(null)
                                    void onDeletePublicationFile(publicationFileMenuFile.id)
                                  }}
                                  disabled={deletingFileId === publicationFileMenuFile.id}
                                >
                                  <Trash2 className="h-4 w-4 shrink-0" />
                                  <span>Delete file</span>
                                </button>
                              ) : null}
                            </div>
                          </div>,
                          document.body,
                        ) : null}

                        {publicationFileTagMenuState && publicationFileTagMenuFile ? createPortal(
                          <div className="pointer-events-auto fixed inset-0 z-[81]" data-ui="publication-file-tag-menu-overlay" onClick={() => setPublicationFileTagMenuState(null)}>
                            <div
                              data-ui="publication-file-tag-menu-shell"
                              className="pointer-events-auto fixed w-[11rem] rounded-md border border-border bg-card p-1 shadow-lg"
                              role="menu"
                              aria-label={`${publicationFileTagMenuFile.file_name} tag actions`}
                              style={{ left: publicationFileTagMenuState.x, top: publicationFileTagMenuState.y }}
                              onClick={(event) => event.stopPropagation()}
                            >
                              <button
                                type="button"
                                role="menuitem"
                                className={cn(
                                  'flex w-full items-center gap-2 whitespace-nowrap rounded px-2 py-1.5 text-left text-sm hover:bg-[hsl(var(--tone-accent-100))] hover:text-[hsl(var(--tone-accent-900))]',
                                  publicationFileTagMenuBusy && 'cursor-not-allowed text-muted-foreground hover:bg-transparent hover:text-muted-foreground',
                                )}
                                disabled={publicationFileTagMenuBusy}
                                onClick={() => onStartPublicationFileClassification(publicationFileTagMenuFile)}
                              >
                                <Pencil className="h-4 w-4 shrink-0" />
                                <span>Edit tag</span>
                              </button>
                              {publicationFileTagMenuFile.classification === 'OTHER' ? (
                                <button
                                  type="button"
                                  role="menuitem"
                                  className={cn(
                                    'flex w-full items-center gap-2 whitespace-nowrap rounded px-2 py-1.5 text-left text-sm hover:bg-[hsl(var(--tone-accent-100))] hover:text-[hsl(var(--tone-accent-900))]',
                                    publicationFileTagMenuBusy && 'cursor-not-allowed text-muted-foreground hover:bg-transparent hover:text-muted-foreground',
                                  )}
                                  disabled={publicationFileTagMenuBusy}
                                  onClick={() => onStartPublicationFileOtherLabelEdit(publicationFileTagMenuFile)}
                                >
                                  <Tag className="h-4 w-4 shrink-0" />
                                  <span>Edit custom label</span>
                                </button>
                              ) : null}
                              <div className="my-1 border-t border-border/70" />
                              <button
                                type="button"
                                role="menuitem"
                                className={cn(
                                  'flex w-full items-center gap-2 whitespace-nowrap rounded px-2 py-1.5 text-left text-sm hover:bg-[hsl(var(--tone-accent-100))] hover:text-[hsl(var(--tone-accent-900))]',
                                  publicationFileTagMenuBusy && 'cursor-not-allowed text-muted-foreground hover:bg-transparent hover:text-muted-foreground',
                                )}
                                disabled={publicationFileTagMenuBusy}
                                onClick={() => void onClearPublicationFileClassification(publicationFileTagMenuFile)}
                              >
                                <Trash2 className="h-4 w-4 shrink-0" />
                                <span>Delete tag</span>
                              </button>
                            </div>
                          </div>,
                          document.body,
                        ) : null}

                        {activeDetailTab === 'ai' ? (
                          <>
                          <div className="house-drilldown-heading-block">
                            <p className="house-drilldown-heading-block-title">AI insights</p>
                          </div>
                          <div className="house-drilldown-content-block">
                            <p className={`${HOUSE_BANNER_CLASS} text-micro`}>AI-generated draft insights. Verify against full text.</p>
                          </div>
                          {selectedAiResponse?.status === 'RUNNING' ? (
                            <div className="house-drilldown-content-block">
                              <div className={HOUSE_PUBLICATION_DRILLDOWN_STAT_CARD_CLASS}>
                                <p className={HOUSE_PUBLICATION_DRILLDOWN_NOTE_SOFT_CLASS}>Generating insights...</p>
                              </div>
                            </div>
                          ) : null}
                          {selectedAiResponse?.status === 'FAILED' ? (
                            <div className="house-drilldown-content-block">
                              <div className={HOUSE_PUBLICATION_DRILLDOWN_STAT_CARD_CLASS}>
                                <p className={HOUSE_PUBLICATION_DRILLDOWN_NOTE_WARNING_CLASS}>Last AI update failed. Showing cached data.</p>
                              </div>
                            </div>
                          ) : null}
                          <div className="house-drilldown-heading-block">
                            <p className="house-drilldown-heading-block-title">Trajectory</p>
                          </div>
                          <div className="house-drilldown-content-block">
                            <div className="space-y-3">
                              <div className={HOUSE_PUBLICATION_DRILLDOWN_STAT_CARD_CLASS}>
                                <p className="leading-relaxed">{selectedAiResponse?.payload?.performance_summary || 'Not available'}</p>
                              </div>
                              <div className={HOUSE_PUBLICATION_DRILLDOWN_STAT_CARD_CLASS}>
                                <div className={cn(HOUSE_DRILLDOWN_CHART_CONTROLS_ROW_CLASS, 'house-publications-trends-controls-row justify-between')}>
                                  <div className={HOUSE_DRILLDOWN_CHART_CONTROLS_LEFT_CLASS}>
                                    <div className="house-approved-toggle-context inline-flex items-center" data-stop-tile-open="true">
                                      <div
                                        className={cn(HOUSE_METRIC_TOGGLE_TRACK_CLASS, 'grid-cols-[24%_24%_24%_28%]')}
                                        data-stop-tile-open="true"
                                        data-ui="publication-trajectory-window-toggle"
                                        data-house-role="chart-toggle"
                                        style={{ width: '8.75rem', minWidth: '8.75rem', maxWidth: '8.75rem' }}
                                      >
                                        <span
                                          className={HOUSE_TOGGLE_THUMB_CLASS}
                                          style={publicationTrajectoryWindowThumbStyle}
                                          aria-hidden="true"
                                        />
                                        {PUBLICATIONS_WINDOW_OPTIONS.map((option) => (
                                          <button
                                            key={`pub-trajectory-window-${option.value}`}
                                            type="button"
                                            data-stop-tile-open="true"
                                            className={cn(
                                              HOUSE_TOGGLE_BUTTON_CLASS,
                                              publicationTrajectoryWindowMode === option.value ? 'text-white' : HOUSE_DRILLDOWN_TOGGLE_MUTED_CLASS,
                                            )}
                                            onClick={(event) => {
                                              event.stopPropagation()
                                              if (publicationTrajectoryWindowMode === option.value) {
                                                return
                                              }
                                              setPublicationTrajectoryWindowMode(option.value)
                                            }}
                                            onMouseDown={(event) => event.stopPropagation()}
                                            aria-pressed={publicationTrajectoryWindowMode === option.value}
                                          >
                                            {option.label}
                                          </button>
                                        ))}
                                      </div>
                                    </div>
                                  </div>
                                  <PublicationTrendsVisualToggle
                                    value={publicationTrajectoryVisualMode}
                                    onChange={setPublicationTrajectoryVisualMode}
                                  />
                                </div>
                                {publicationTrajectoryChartTile ? (
                                  <div className="house-drilldown-content-block house-drilldown-summary-trend-chart house-publications-drilldown-summary-trend-chart-tall w-full">
                                    <PublicationsPerYearChart
                                      tile={publicationTrajectoryChartTile}
                                      animate
                                      showAxes
                                      enableWindowToggle
                                      showPeriodHint
                                      showCurrentPeriodSemantic
                                      useCompletedMonthWindowLabels
                                      autoScaleByWindow
                                      showMeanLine
                                      showMeanValueLabel
                                      subtleGrid
                                      activeWindowMode={publicationTrajectoryWindowMode}
                                      onWindowModeChange={setPublicationTrajectoryWindowMode}
                                      visualMode={publicationTrajectoryVisualMode}
                                      onVisualModeChange={(mode) => setPublicationTrajectoryVisualMode(mode === 'table' ? 'bars' : mode)}
                                      showWindowToggle={false}
                                    />
                                  </div>
                                ) : (
                                  <div className="rounded-md border border-dashed border-[hsl(var(--tone-neutral-300))] px-3 py-4 text-sm text-muted-foreground">No trajectory data available.</div>
                                )}
                              </div>
                              <div className={HOUSE_PUBLICATION_DRILLDOWN_STAT_CARD_CLASS}>
                                <p className="font-medium">{(selectedAiResponse?.payload?.trajectory_classification || 'UNKNOWN').replace(/_/g, ' ')}</p>
                              </div>
                            </div>
                          </div>
                          <div className="house-drilldown-heading-block">
                            <p className="house-drilldown-heading-block-title">Reuse suggestions</p>
                          </div>
                          <div className="house-drilldown-content-block">
                            <div className={`${HOUSE_PUBLICATION_DRILLDOWN_STAT_CARD_CLASS} space-y-1`}>
                              {(selectedAiResponse?.payload?.reuse_suggestions || []).length === 0 ? <p className={HOUSE_PUBLICATION_DRILLDOWN_NOTE_SOFT_CLASS}>No suggestions yet.</p> : (selectedAiResponse?.payload?.reuse_suggestions || []).map((item, index) => <p key={`${item}-${index}`}>- {item}</p>)}
                            </div>
                          </div>
                          <div className="house-drilldown-heading-block">
                            <p className="house-drilldown-heading-block-title">Caution flags</p>
                          </div>
                          <div className="house-drilldown-content-block">
                            <div className={`${HOUSE_PUBLICATION_DRILLDOWN_STAT_CARD_CLASS} space-y-1`}>
                              {(selectedAiResponse?.payload?.caution_flags || []).length === 0 ? <p className={HOUSE_PUBLICATION_DRILLDOWN_NOTE_SOFT_CLASS}>No caution flags.</p> : (selectedAiResponse?.payload?.caution_flags || []).map((item, index) => <p key={`${item}-${index}`}>- {item}</p>)}
                            </div>
                          </div>
                        </>
                        ) : null}
                            </div>
                          </div>
                    </DrilldownSheet.TabPanel>
                  </div>
                ) : null}
              </SheetContent>
            </Sheet>

            <Sheet
              open={publicationReaderOpen}
              onOpenChange={(open) => {
                setPublicationReaderOpen(open)
                if (!open) {
                  setPublicationReaderActiveSectionId(null)
                  setPublicationReaderPdfPage(1)
                  setPublicationReaderError('')
                  setPublicationReaderViewMode('structured')
                  setPublicationReaderCollapsedNodeIds({})
                  setPublicationReaderInspectorOpen(false)
                }
              }}
            >
              <SheetContent
                side="right"
                data-ui="publication-paper-reader-shell"
                className="inset-[1.2vh_1vw_1.2vh_2vw] h-auto max-w-none overflow-hidden rounded-[1.55rem] border border-[hsl(var(--tone-neutral-300))] bg-[hsl(var(--surface-drilldown-elevated))] p-0 shadow-[0_28px_90px_hsl(var(--tone-neutral-900)/0.18)]"
              >
                {selectedWork ? (
                  <div
                    data-ui="publication-paper-reader-overlay"
                    className="flex h-full min-h-0 flex-col bg-[hsl(var(--surface-drilldown-elevated))]"
                  >
                    <div className="border-b border-[hsl(var(--tone-neutral-200))] bg-[linear-gradient(180deg,hsl(var(--tone-neutral-50))_0%,hsl(var(--tone-neutral-100)/0.7)_100%)] px-7 py-6">
                      <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
                        <div className="min-w-0 space-y-1.5">
                          <h2 className="text-[1.35rem] font-semibold leading-tight text-[hsl(var(--tone-neutral-900))]">
                            {selectedPaperMetadata?.title || selectedDetail?.title || selectedWork.title}
                          </h2>
                          <p className="text-sm leading-relaxed text-[hsl(var(--tone-neutral-600))]">
                            {[
                              selectedPaperMetadata?.journal || detailJournal || 'Publication record',
                              selectedPaperMetadata?.year ? String(selectedPaperMetadata.year) : detailYear ? String(detailYear) : null,
                              selectedPaperDocument?.page_count ? `${selectedPaperDocument.page_count} pages` : null,
                              selectedPaperParsingInProgress
                                ? 'Parsing full paper...'
                                : selectedPaperSections.length > 0
                                  ? `${selectedPaperSections.length} sections`
                                  : null,
                            ].filter(Boolean).join(' | ')}
                          </p>
                        </div>
                        <div className="flex flex-wrap items-center justify-end gap-2">
                          <div className="inline-flex items-center rounded-full border border-[hsl(var(--tone-neutral-300))] bg-[hsl(var(--tone-neutral-50)/0.92)] p-1 shadow-[0_10px_24px_hsl(var(--tone-neutral-900)/0.05)]">
                            <button
                              type="button"
                              className={cn(
                                'inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium transition-[background-color,color,transform] duration-[var(--motion-duration-ui)] ease-out',
                                publicationReaderViewMode === 'pdf'
                                  ? 'bg-[hsl(var(--tone-accent-600))] text-white shadow-[0_10px_22px_hsl(var(--tone-accent-700)/0.28)]'
                                  : 'text-[hsl(var(--tone-neutral-600))] hover:bg-[hsl(var(--tone-neutral-100))] hover:text-[hsl(var(--tone-neutral-900))]',
                              )}
                              onClick={onEnterPublicationReaderPdfView}
                              disabled={!selectedPaperPrimaryPdfContentFileId}
                            >
                              <Eye className="h-3.5 w-3.5" />
                              <span>PDF</span>
                            </button>
                            <button
                              type="button"
                              className={cn(
                                'inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium transition-[background-color,color,transform] duration-[var(--motion-duration-ui)] ease-out',
                                publicationReaderViewMode === 'structured'
                                  ? 'bg-[hsl(var(--tone-neutral-900))] text-white shadow-[0_10px_22px_hsl(var(--tone-neutral-900)/0.16)]'
                                  : 'text-[hsl(var(--tone-neutral-600))] hover:bg-[hsl(var(--tone-neutral-100))] hover:text-[hsl(var(--tone-neutral-900))]',
                              )}
                              onClick={() => setPublicationReaderViewMode('structured')}
                            >
                              <FileText className="h-3.5 w-3.5" />
                              <span>Structured</span>
                            </button>
                          </div>
                          {selectedPaperDocument?.has_viewable_pdf ? (
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              className="gap-2 rounded-full border-[hsl(var(--tone-accent-300))] bg-[hsl(var(--tone-accent-50))] text-[hsl(var(--tone-accent-800))] hover:bg-[hsl(var(--tone-accent-100))]"
                              onClick={onOpenPublicationReaderPrimaryPdf}
                            >
                              <Download className="h-4 w-4" />
                              <span>Open PDF</span>
                            </Button>
                          ) : null}
                        </div>
                      </div>
                      {publicationReaderError ? (
                        <div className="mt-4 rounded-xl border border-[hsl(var(--tone-danger-200))] bg-[hsl(var(--tone-danger-50))] px-4 py-3">
                          <p className="text-sm leading-relaxed text-[hsl(var(--tone-danger-800))]">{publicationReaderError}</p>
                        </div>
                      ) : null}
                    </div>

                    <div
                      className={cn(
                        'grid min-h-0 flex-1 grid-cols-1',
                        publicationReaderInspectorOpen
                          ? 'xl:grid-cols-[15.25rem_minmax(0,1fr)_18.5rem]'
                          : 'xl:grid-cols-[15.25rem_minmax(0,1fr)_4.5rem]',
                      )}
                    >
                      <aside className="min-h-0 overflow-y-auto border-b border-[hsl(var(--tone-neutral-200))] bg-[linear-gradient(180deg,hsl(var(--tone-neutral-50))_0%,hsl(var(--tone-neutral-100)/0.45)_100%)] xl:border-b-0 xl:border-r">
                        <div className="p-4 sm:p-5">
                          <p className={cn(houseNavigation.sectionLabel, 'mb-3 px-1 text-[0.68rem] tracking-[0.12em]')}>
                            Navigator
                          </p>
                          {selectedPaperParsingInProgress ? (
                            <div className="rounded-[1rem] border border-[hsl(var(--tone-neutral-200))] bg-white px-3 py-3">
                              <div className="h-1.5 overflow-hidden rounded-full bg-[hsl(var(--tone-neutral-150))]">
                                <div className="h-full w-1/3 animate-pulse rounded-full bg-[linear-gradient(90deg,hsl(var(--tone-accent-500))_0%,hsl(var(--tone-positive-500))_100%)]" />
                              </div>
                              <p className="mt-3 text-sm leading-relaxed text-[hsl(var(--tone-neutral-600))]">
                                Parsing the full paper. The navigator will appear once the manuscript model is ready.
                              </p>
                            </div>
                          ) : publicationReaderLoading && selectedPublicationReaderNavigatorGroups.length === 0 ? (
                            <div className="flex items-center gap-2 rounded-xl border border-[hsl(var(--tone-neutral-200))] bg-white px-3 py-3 text-sm text-[hsl(var(--tone-neutral-600))]">
                              <Loader2 className="h-4 w-4 animate-spin" />
                              <span>Building navigator...</span>
                            </div>
                          ) : (
                            renderPublicationReaderNavigator()
                          )}
                        </div>
                      </aside>
                      <main
                        ref={publicationReaderScrollViewportRef}
                        className={cn(
                          'min-h-0',
                          publicationReaderViewMode === 'pdf'
                            ? 'overflow-hidden bg-[radial-gradient(circle_at_top,hsl(var(--tone-accent-100)/0.68)_0%,hsl(var(--tone-neutral-100)/0.78)_32%,hsl(var(--tone-neutral-100))_100%)]'
                            : 'overflow-y-auto bg-[linear-gradient(180deg,hsl(var(--tone-neutral-50)/0.86)_0%,hsl(var(--tone-neutral-100)/0.38)_100%)]',
                        )}
                      >
                        {publicationReaderViewMode === 'pdf' ? (
                          <div className="flex h-full flex-col gap-5 p-6 sm:p-8">
                            {publicationReaderLoading && !selectedPaperPrimaryPdfContentFileId ? (
                              <div className="flex items-center gap-3 rounded-2xl border border-[hsl(var(--tone-neutral-200))] bg-[hsl(var(--tone-neutral-50))] px-5 py-4 text-sm text-[hsl(var(--tone-neutral-600))]">
                                <Loader2 className="h-4 w-4 animate-spin" />
                                <span>Building the structured paper model...</span>
                              </div>
                            ) : null}
                            {selectedPaperPrimaryPdfContentFileId ? (
                              <>
                                <PublicationPdfViewer
                                  key={selectedPaperPrimaryPdfContentFileId}
                                  token={token}
                                  publicationId={selectedWork.id}
                                  fileId={selectedPaperPrimaryPdfContentFileId}
                                  title={selectedPaperMetadata?.title || selectedDetail?.title || selectedWork.title}
                                  className="min-h-0 flex-1"
                                  targetPage={publicationReaderPdfPage}
                                  onPageChange={(page) => setPublicationReaderPdfPage(page)}
                                  onOpenExternal={selectedPaperPrimaryPdfExternalUrl ? onOpenPublicationReaderPrimaryPdf : null}
                                />
                              </>
                            ) : !publicationReaderLoading ? (
                              <div className="flex h-full items-center justify-center">
                                <div className="max-w-xl rounded-[1.1rem] border border-dashed border-[hsl(var(--tone-neutral-300))] bg-[hsl(var(--tone-neutral-50))] px-6 py-8 text-center shadow-[0_12px_30px_hsl(var(--tone-neutral-900)/0.05)]">
                                  <p className="text-base font-medium text-[hsl(var(--tone-neutral-900))]">
                                    No PDF is attached yet for this publication.
                                  </p>
                                  <p className="mt-2 text-sm leading-relaxed text-[hsl(var(--tone-neutral-600))]">
                                    You can still read the structured paper scaffold now, and this same popup will turn into the full-paper viewer as soon as a PDF is available.
                                  </p>
                                  <Button
                                    type="button"
                                    variant="outline"
                                    size="sm"
                                    className="mt-4 rounded-full"
                                    onClick={() => setPublicationReaderViewMode('structured')}
                                  >
                                    Open structured view
                                  </Button>
                                </div>
                              </div>
                            ) : null}
                          </div>
                        ) : (
                          <div className="mx-auto flex w-full max-w-[58rem] flex-col gap-6 px-7 py-7 sm:px-10 sm:py-8">
                            {selectedPaperParsingInProgress ? (
                              <div className="overflow-hidden rounded-[1.4rem] border border-[hsl(var(--tone-neutral-200))] bg-white shadow-[0_18px_48px_hsl(var(--tone-neutral-900)/0.06)]">
                                <div className="border-b border-[hsl(var(--tone-neutral-150))] bg-[linear-gradient(180deg,hsl(var(--tone-accent-50))_0%,white_100%)] px-5 py-4">
                                  <div className="flex items-center gap-3">
                                    <Loader2 className="h-4 w-4 animate-spin text-[hsl(var(--tone-accent-700))]" />
                                    <div className="min-w-0">
                                      <p className="text-sm font-medium text-[hsl(var(--tone-neutral-900))]">
                                        Parsing full paper
                                      </p>
                                      <p className="text-sm leading-relaxed text-[hsl(var(--tone-neutral-600))]">
                                        The structured reader will appear once the manuscript model is complete. Tables and figures can continue filling in just after that.
                                      </p>
                                    </div>
                                  </div>
                                  <div className="mt-4 h-2 overflow-hidden rounded-full bg-[hsl(var(--tone-neutral-150))]">
                                    <div className="h-full w-1/3 animate-pulse rounded-full bg-[linear-gradient(90deg,hsl(var(--tone-accent-500))_0%,hsl(var(--tone-positive-500))_100%)]" />
                                  </div>
                                </div>
                                <div className="grid gap-4 px-5 py-5 sm:grid-cols-3">
                                  {['Resolving sections', 'Anchoring pages', 'Recovering tables & figures'].map((step, index) => (
                                    <div
                                      key={step}
                                      className={cn(
                                        'rounded-[1rem] border px-4 py-4',
                                        index === 0
                                          ? 'border-[hsl(var(--tone-accent-200))] bg-[hsl(var(--tone-accent-50)/0.6)]'
                                          : 'border-[hsl(var(--tone-neutral-200))] bg-[hsl(var(--tone-neutral-50))]',
                                      )}
                                    >
                                      <p className="text-[0.68rem] font-semibold uppercase tracking-[0.12em] text-[hsl(var(--tone-neutral-500))]">
                                        Step {index + 1}
                                      </p>
                                      <p className="mt-2 text-sm font-medium text-[hsl(var(--tone-neutral-900))]">
                                        {step}
                                      </p>
                                    </div>
                                  ))}
                                </div>
                              </div>
                            ) : publicationReaderLoading && !selectedPaperModel ? (
                              <div className="flex items-center gap-3 rounded-2xl border border-[hsl(var(--tone-neutral-200))] bg-[hsl(var(--tone-neutral-50))] px-5 py-4 text-sm text-[hsl(var(--tone-neutral-600))]">
                                <Loader2 className="h-4 w-4 animate-spin" />
                                <span>Building the structured paper model...</span>
                              </div>
                            ) : selectedStructuredPaperGroups.length > 0 ? (
                              selectedStructuredPaperGroups.map((group) => {
                                const primaryRootSection = group.rootSections[0] || null
                                const showGroupLabel = !(
                                  primaryRootSection
                                  && group.rootSections.length === 1
                                  && publicationReaderSectionMatchesGroupLabel(primaryRootSection, group.key)
                                )
                                return (
                                  <section
                                    key={`publication-paper-group-${group.key}`}
                                    className={cn(
                                      'relative',
                                      group.key === 'abstract'
                                        ? 'pb-6'
                                        : 'pt-6',
                                      group.key !== 'abstract' && 'first:pt-0',
                                    )}
                                  >
                                    {showGroupLabel ? (
                                      <div className="min-w-0 px-1">
                                        <p className="text-[0.72rem] font-semibold uppercase tracking-[0.12em] text-[hsl(var(--tone-neutral-500))]">
                                          {group.label}
                                        </p>
                                      </div>
                                    ) : null}
                                    <div className={cn('space-y-6', showGroupLabel && 'mt-4')}>
                                      {group.rootSections.map((section) => renderPublicationReaderStructuredSection(section, 0, group.key))}
                                    </div>
                                  </section>
                                )
                              })
                            ) : !publicationReaderLoading ? (
                              <div className="rounded-[1.1rem] border border-dashed border-[hsl(var(--tone-neutral-300))] bg-[hsl(var(--tone-neutral-50))] px-5 py-8 text-center">
                                <p className="text-sm leading-relaxed text-[hsl(var(--tone-neutral-600))]">
                                  No GROBID-derived full-paper sections are available yet for this publication. The reader shell is ready, and the stored PDF can be parsed as soon as GROBID succeeds.
                                </p>
                              </div>
                            ) : null}
                            {unplacedInlineAssets.length > 0 ? (
                              <section className="border-t border-[hsl(var(--tone-neutral-200))] pt-7">
                                <div className="min-w-0">
                                  <p className="text-[0.72rem] font-semibold uppercase tracking-[0.1em] text-[hsl(var(--tone-neutral-500))]">
                                    Figures & Tables
                                  </p>
                                </div>
                                <div className="mt-4 space-y-4">
                                  {unplacedInlineAssets.map((inlineAsset) => (
                                    <div
                                      key={`inline-${inlineAsset.id}`}
                                      ref={(node) => { publicationReaderInlineAssetRefs.current[inlineAsset.id] = node }}
                                      className="overflow-hidden rounded-lg border border-[hsl(var(--tone-neutral-200))] bg-white shadow-[0_2px_8px_hsl(var(--tone-neutral-900)/0.04)]"
                                    >
                                      <div className={cn(
                                        'flex items-center gap-2 px-3 py-2',
                                        inlineAsset.asset_kind === 'table'
                                          ? 'border-l-[3px] border-l-[hsl(var(--tone-accent-400))]'
                                          : 'border-l-[3px] border-l-[hsl(var(--tone-positive-400))]',
                                      )}>
                                        <p className="text-[0.82rem] font-semibold text-[hsl(var(--tone-neutral-800))]">
                                          {inlineAsset.title || inlineAsset.file_name}
                                        </p>
                                        {formatPublicationPaperSectionPageLabel({ page_start: inlineAsset.page_start, page_end: inlineAsset.page_end }) ? (
                                          <span className="shrink-0 text-[0.68rem] text-[hsl(var(--tone-neutral-400))]">
                                            {formatPublicationPaperSectionPageLabel({ page_start: inlineAsset.page_start, page_end: inlineAsset.page_end })}
                                          </span>
                                        ) : null}
                                      </div>
                                      {inlineAsset.image_data ? (
                                        <div className="border-t border-[hsl(var(--tone-neutral-100))] bg-[hsl(var(--tone-neutral-50))] px-3 py-3">
                                          <img
                                            src={inlineAsset.image_data}
                                            alt={inlineAsset.title || inlineAsset.file_name || 'Figure'}
                                            className="max-h-[400px] w-full rounded object-contain"
                                            loading="lazy"
                                          />
                                        </div>
                                      ) : null}
                                      {inlineAsset.structured_html ? (
                                        <div className="border-t border-[hsl(var(--tone-neutral-100))] bg-[hsl(var(--tone-neutral-50))] px-3 py-3">
                                          <div
                                            className="publication-structured-table overflow-auto text-[0.78rem] leading-relaxed"
                                            dangerouslySetInnerHTML={{ __html: inlineAsset.structured_html }}
                                          />
                                        </div>
                                      ) : null}
                                      {inlineAsset.caption ? (
                                        <div className="border-t border-[hsl(var(--tone-neutral-100))] px-3 py-2">
                                          <p className="text-[0.78rem] leading-relaxed text-[hsl(var(--tone-neutral-600))]">
                                            {inlineAsset.caption}
                                          </p>
                                        </div>
                                      ) : null}
                                    </div>
                                  ))}
                                </div>
                              </section>
                            ) : null}
                          </div>
                        )}
                      </main>

                      <aside className="min-h-0 border-t border-[hsl(var(--tone-neutral-200))] bg-[hsl(var(--tone-neutral-50))] xl:border-l xl:border-t-0">
                        {publicationReaderInspectorOpen ? (
                          <div className="h-full overflow-y-auto p-4">
                            <div className="mb-4 flex items-center justify-between">
                              <p className={cn(houseNavigation.sectionLabel, 'px-1 text-[0.68rem] tracking-[0.12em]')}>
                                Details
                              </p>
                              <button
                                type="button"
                                className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-[hsl(var(--tone-neutral-250))] bg-white text-[hsl(var(--tone-neutral-600))] transition-[background-color,color,border-color] duration-[var(--motion-duration-ui)] ease-out hover:border-[hsl(var(--tone-neutral-300))] hover:text-[hsl(var(--tone-neutral-900))]"
                                onClick={() => setPublicationReaderInspectorOpen(false)}
                                aria-label="Collapse reader details"
                              >
                                <ChevronRight className="h-4 w-4" />
                              </button>
                            </div>
                            <div className="space-y-5">
                          <section className="rounded-2xl border border-[hsl(var(--tone-neutral-200))] bg-[hsl(var(--tone-neutral-50))] p-4">
                            <p className="text-[0.72rem] font-semibold uppercase tracking-[0.08em] text-[hsl(var(--tone-neutral-500))]">
                              Document map
                            </p>
                            <div className="mt-3 space-y-2 text-sm leading-relaxed text-[hsl(var(--tone-neutral-700))]">
                              <p><span className="font-medium text-[hsl(var(--tone-neutral-900))]">Parser:</span> {selectedPaperDocument?.parser_status ? formatPublicationPaperSectionKindLabel(selectedPaperDocument.parser_status) : 'Not available'}</p>
                              <p><span className="font-medium text-[hsl(var(--tone-neutral-900))]">Pages:</span> {selectedPaperDocument?.page_count ?? 'n/a'}</p>
                              {publicationReaderViewMode === 'pdf' && selectedPaperDocument?.page_count ? (
                                <p><span className="font-medium text-[hsl(var(--tone-neutral-900))]">Current PDF page:</span> {publicationReaderPdfPage} / {selectedPaperDocument.page_count}</p>
                              ) : null}
                              <p><span className="font-medium text-[hsl(var(--tone-neutral-900))]">Sections:</span> {selectedPaperComponentSummary?.section_count ?? selectedPaperSections.length}</p>
                              <p><span className="font-medium text-[hsl(var(--tone-neutral-900))]">References:</span> {selectedPaperComponentSummary?.reference_count ?? selectedPaperModel?.references?.length ?? 0}</p>
                            </div>
                            {selectedPaperDocument?.parser_last_error ? (
                              <>
                                <p className="mt-3 text-sm leading-relaxed text-[hsl(var(--tone-danger-700))]">
                                  {selectedPaperDocument.parser_last_error}
                                </p>
                                {selectedPaperPrimaryPdfContentFileId && selectedPaperDocument?.parser_status === 'FAILED' ? (
                                  <Button
                                    type="button"
                                    variant="outline"
                                    size="sm"
                                    className="mt-3 w-full gap-2 rounded-full"
                                    disabled={publicationReaderLoading}
                                    onClick={onRetryPublicationReaderParse}
                                  >
                                    {publicationReaderLoading ? (
                                      <Loader2 className="h-4 w-4 animate-spin" />
                                    ) : (
                                      <Hammer className="h-4 w-4" />
                                    )}
                                    <span>Retry full-paper parse</span>
                                  </Button>
                                ) : null}
                              </>
                            ) : null}
                          </section>

                          <section className="rounded-2xl border border-[hsl(var(--tone-neutral-200))] bg-[hsl(var(--tone-neutral-50))] p-4">
                            <p className="text-[0.72rem] font-semibold uppercase tracking-[0.08em] text-[hsl(var(--tone-neutral-500))]">
                              Current focus
                            </p>
                            <p className="mt-2 text-sm font-medium leading-relaxed text-[hsl(var(--tone-neutral-900))]">
                              {selectedReaderActiveSection?.title || 'No section selected'}
                            </p>
                            {selectedReaderActiveSection ? (
                              <p className="mt-2 text-[0.72rem] uppercase tracking-[0.08em] text-[hsl(var(--tone-neutral-500))]">
                                {formatPublicationPaperSectionKindLabel(selectedReaderActiveSection.canonical_kind || selectedReaderActiveSection.kind)}
                              </p>
                            ) : null}
                            <p className="mt-2 text-sm leading-relaxed text-[hsl(var(--tone-neutral-600))]">
                              {selectedReaderActiveSection
                                ? 'This right rail can later hold AI prompts, notes, highlights, and linked knowledge objects against the active section.'
                                : 'Open a section from the outline to anchor notes and tools here.'}
                            </p>
                          </section>

                          <section className="rounded-2xl border border-[hsl(var(--tone-neutral-200))] bg-[hsl(var(--tone-neutral-50))] p-4">
                            <p className="text-[0.72rem] font-semibold uppercase tracking-[0.08em] text-[hsl(var(--tone-neutral-500))]">
                              Paper record
                            </p>
                            <div className="mt-3 space-y-2 text-sm leading-relaxed text-[hsl(var(--tone-neutral-700))]">
                              <p><span className="font-medium text-[hsl(var(--tone-neutral-900))]">Type:</span> {selectedPaperMetadata?.publication_type || detailPublicationType || 'Not available'}</p>
                              <p><span className="font-medium text-[hsl(var(--tone-neutral-900))]">Article type:</span> {selectedPaperMetadata?.article_type || detailArticleType || 'n/a'}</p>
                              <p><span className="font-medium text-[hsl(var(--tone-neutral-900))]">DOI:</span> {selectedPaperMetadata?.doi || 'n/a'}</p>
                              <p><span className="font-medium text-[hsl(var(--tone-neutral-900))]">PMID:</span> {selectedPaperMetadata?.pmid || 'n/a'}</p>
                              <p><span className="font-medium text-[hsl(var(--tone-neutral-900))]">Citations:</span> {selectedPaperMetadata?.citations_total ?? detailCitations}</p>
                            </div>
                            {selectedPaperMetadata?.authors?.length ? (
                              <div className="mt-4">
                                <p className="text-[0.72rem] font-semibold uppercase tracking-[0.08em] text-[hsl(var(--tone-neutral-500))]">
                                  Authors
                                </p>
                                <p className="mt-2 text-sm leading-relaxed text-[hsl(var(--tone-neutral-700))]">
                                  {selectedPaperMetadata.authors.join(', ')}
                                </p>
                              </div>
                            ) : null}
                            {selectedPaperMetadata?.keywords?.length ? (
                              <div className="mt-4">
                                <p className="text-[0.72rem] font-semibold uppercase tracking-[0.08em] text-[hsl(var(--tone-neutral-500))]">
                                  Keywords
                                </p>
                                <div className="mt-2 flex flex-wrap gap-2">
                                  {selectedPaperMetadata.keywords.map((keyword) => (
                                    <Badge
                                      key={keyword}
                                      size="sm"
                                      variant="outline"
                                      className="border-[hsl(var(--tone-neutral-300))] bg-[hsl(var(--tone-neutral-50))] text-[hsl(var(--tone-neutral-700))]"
                                    >
                                      {keyword}
                                    </Badge>
                                  ))}
                                </div>
                              </div>
                            ) : null}
                          </section>

                          <section className="rounded-2xl border border-[hsl(var(--tone-neutral-200))] bg-[hsl(var(--tone-neutral-50))] p-4">
                            <p className="text-[0.72rem] font-semibold uppercase tracking-[0.08em] text-[hsl(var(--tone-neutral-500))]">
                              Figures
                            </p>
                            <div className="mt-3">
                              {renderPublicationReaderAssetGroup(selectedPaperFigures, 'No figures surfaced yet.')}
                            </div>
                          </section>

                          <section className="rounded-2xl border border-[hsl(var(--tone-neutral-200))] bg-[hsl(var(--tone-neutral-50))] p-4">
                            <p className="text-[0.72rem] font-semibold uppercase tracking-[0.08em] text-[hsl(var(--tone-neutral-500))]">
                              Tables
                            </p>
                            <div className="mt-3">
                              {renderPublicationReaderAssetGroup(selectedPaperTables, 'No tables surfaced yet.')}
                            </div>
                          </section>

                          <section className="rounded-2xl border border-[hsl(var(--tone-neutral-200))] bg-[hsl(var(--tone-neutral-50))] p-4">
                            <p className="text-[0.72rem] font-semibold uppercase tracking-[0.08em] text-[hsl(var(--tone-neutral-500))]">
                              Datasets
                            </p>
                            <div className="mt-3">
                              {renderPublicationReaderAssetGroup(selectedPaperDatasets, 'No datasets surfaced yet.')}
                            </div>
                          </section>

                          <section className="rounded-2xl border border-[hsl(var(--tone-neutral-200))] bg-[hsl(var(--tone-neutral-50))] p-4">
                            <p className="text-[0.72rem] font-semibold uppercase tracking-[0.08em] text-[hsl(var(--tone-neutral-500))]">
                              Attachments
                            </p>
                            <div className="mt-3">
                              {renderPublicationReaderAssetGroup(selectedPaperAttachments, 'No additional attachments surfaced yet.')}
                            </div>
                          </section>
                            </div>
                          </div>
                        ) : (
                          <div className="flex h-full items-start justify-center p-2 pt-4">
                            <button
                              type="button"
                              className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-[hsl(var(--tone-neutral-250))] bg-white text-[hsl(var(--tone-neutral-600))] shadow-[0_10px_24px_hsl(var(--tone-neutral-900)/0.05)] transition-[background-color,color,border-color,transform] duration-[var(--motion-duration-ui)] ease-out hover:border-[hsl(var(--tone-neutral-300))] hover:text-[hsl(var(--tone-neutral-900))] hover:translate-y-[-1px]"
                              onClick={() => setPublicationReaderInspectorOpen(true)}
                              aria-label="Expand reader details"
                            >
                              <ChevronLeft className="h-4 w-4" />
                            </button>
                          </div>
                        )}
                      </aside>
                    </div>
                  </div>
                ) : null}
              </SheetContent>
            </Sheet>

          </div>
          </Section>
        ) : (
          <Section surface="transparent" inset="none" spaceY="none">
            <section className="house-notification-section" aria-live="polite">
              <div className={cn(HOUSE_BANNER_CLASS, HOUSE_BANNER_INFO_CLASS)}>
                <p>Publication library hidden by user.</p>
              </div>
            </section>
          </Section>
        )}
      </Section>

      {status ? <p className={`${HOUSE_BANNER_CLASS} ${HOUSE_BANNER_PUBLICATIONS_CLASS}`}>{status}</p> : null}
      {error ? <p className={`${HOUSE_BANNER_CLASS} ${HOUSE_BANNER_DANGER_CLASS}`}>{error}</p> : null}
      {(loading || richImporting || syncing || fullSyncing) ? (
        <p className={`${HOUSE_BANNER_CLASS} ${HOUSE_BANNER_PUBLICATIONS_CLASS}`}>Working...</p>
      ) : null}
    </Stack>
  )
}





