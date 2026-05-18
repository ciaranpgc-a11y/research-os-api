import { useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Search,
  Users,
  Activity,
  Heart,
  FileText,
  Wind,
  LayoutList,
  BarChart3,
  Columns3,
  ClipboardList,
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  Plus,
  X,
  Tag,
  Flag,
} from 'lucide-react'

import { SectionMarker } from '@/components/patterns'
import { PageHeader, Row, Stack } from '@/components/primitives'
import {
  fetchPatients,
  fetchStats,
  createPatient,
  deletePatient,
  updatePatient,
  fetchTrackingEntries,
  createTrackingEntry,
  updateTrackingEntry,
  deleteTrackingEntry,
  fetchBookingEntries,
  createBookingEntry,
  updateBookingEntry,
  deleteBookingEntry,
  type ExtractTrackingEntry,
  type ExtractBookingEntry,
  type ExtractBookingInvestigation,
} from '@/lib/extract-api'
import {
  displayInvestigationStatus,
  shouldShowInvestigationRecordCount,
} from '@/lib/extract-investigation-status'
import { useRecordContextMenu, DeleteMenuItem } from '@/components/extract/record-context-menu'
import { cn } from '@/lib/utils'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type PatientRow = {
  hn: string
  name: string
  dob: string | null
  gender: string | null
  images_uploaded: boolean
  rip_tag: boolean
  action_flag: boolean
  tracking_details: string | null
  cohort: string
  recruitment_status: string
  source: string | null
  rhc_count: number
  echo_count: number
  cmr_count: number
  cpex_count: number
  inx_rhc: string | null
  inx_echo: string | null
  inx_cmr: string | null
  inx_cpex: string | null
  pa_mean: number | null
  pvr: number | null
  pcwp: number | null
  echo_ph_prob: string | null
  cmr_ph: string | null
}

type PatientListResponse = { items: PatientRow[]; total?: number } | PatientRow[]

function normalizePatientListResponse(response: PatientListResponse) {
  if (Array.isArray(response)) {
    return { items: response, total: response.length }
  }

  return {
    items: response.items,
    total: Number(response.total ?? response.items.length),
  }
}

type StatsData = {
  total_patients: number
  rhc_count: number
  echo_count: number
  cmr_count: number
  cpex_count: number
}

// ---------------------------------------------------------------------------
// Stat card
// ---------------------------------------------------------------------------

function StatCard({
  icon: Icon,
  label,
  value,
  color,
}: {
  icon: typeof Users
  label: string
  value: number | string
  color: string
}) {
  return (
    <div className="flex items-center gap-3 rounded-2xl border border-[hsl(var(--stroke-soft)/0.72)] bg-[hsl(var(--card))] px-4 py-3 shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
      <span
        className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full"
        style={{ backgroundColor: `${color}18`, color }}
      >
        <Icon className="h-4 w-4" />
      </span>
      <div className="min-w-0">
        <p className="text-xs font-medium text-[hsl(var(--muted-foreground))]">{label}</p>
        <p className="text-lg font-semibold tabular-nums text-[hsl(var(--foreground))]">{value}</p>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Status badge
// ---------------------------------------------------------------------------

const STATUS_COLORS: Record<string, { bg: string; text: string; border: string }> = {
  identified: {
    bg: 'hsl(210 20% 96%)',
    text: 'hsl(215 18% 34%)',
    border: 'hsl(210 18% 82%)',
  },
  approached: {
    bg: 'hsl(38 40% 90%)',
    text: 'hsl(34 50% 35%)',
    border: 'hsl(36 36% 80%)',
  },
  'pis sent': {
    bg: 'hsl(38 40% 90%)',
    text: 'hsl(34 50% 35%)',
    border: 'hsl(36 36% 80%)',
  },
  screening: {
    bg: 'hsl(38 40% 90%)',
    text: 'hsl(34 50% 35%)',
    border: 'hsl(36 36% 80%)',
  },
  consented: {
    bg: 'hsl(162 22% 90%)',
    text: 'hsl(164 30% 28%)',
    border: 'hsl(163 22% 80%)',
  },
  enrolled: {
    bg: 'hsl(162 22% 90%)',
    text: 'hsl(164 30% 28%)',
    border: 'hsl(163 22% 80%)',
  },
  completed: {
    bg: 'hsl(162 22% 90%)',
    text: 'hsl(164 30% 28%)',
    border: 'hsl(163 22% 80%)',
  },
  declined: {
    bg: 'hsl(4 55% 92%)',
    text: 'hsl(4 50% 40%)',
    border: 'hsl(4 45% 82%)',
  },
  withdrawn: {
    bg: 'hsl(4 55% 92%)',
    text: 'hsl(4 50% 40%)',
    border: 'hsl(4 45% 82%)',
  },
  'not eligible': {
    bg: 'hsl(4 55% 92%)',
    text: 'hsl(4 50% 40%)',
    border: 'hsl(4 45% 82%)',
  },
}

/** Derive a PH dot colour from a text value. */
function phDotColor(ph: string | null): string | null {
  if (!ph) return null
  const s = ph.toLowerCase()
  if (s.includes('severe') || s.includes('very high') || s.includes('high prob') || s.includes('high')) return 'hsl(4 55% 50%)'
  if (s.includes('moderate')) return 'hsl(20 50% 50%)'
  if (s.includes('mild') || s.includes('intermediate') || s.includes('borderline')) return 'hsl(38 60% 50%)'
  if (s.includes('low') || s.includes('no ') || s.includes('none') || s.includes('normal') || s.includes('unlikely')) return 'hsl(158 35% 45%)'
  return 'hsl(var(--tone-neutral-400))'
}

/** Derive RHC PH dot from haemodynamics. */
function rhcPhDot(paMean: number | null): string | null {
  if (paMean == null) return null
  if (paMean <= 20) return 'hsl(158 35% 45%)'  // No PH - green
  return 'hsl(4 55% 50%)'                       // PH - red
}

function InxPill({ status, count, phColor }: { status: string | null; count: number; phColor?: string | null }) {
  // If explicitly set, use it. Otherwise auto-detect from record count.
  const effective = displayInvestigationStatus(status, count)
  const showCount = shouldShowInvestigationRecordCount(effective, count)

  const styles: Record<string, string> = {
    '': 'bg-[hsl(var(--tone-neutral-100))] text-[hsl(var(--tone-neutral-400))] ring-[hsl(var(--tone-neutral-200))]',
    'Not started': 'bg-[hsl(var(--tone-neutral-100))] text-[hsl(var(--tone-neutral-400))] ring-[hsl(var(--tone-neutral-200))]',
    Emailed: 'bg-[hsl(38_40%_90%)] text-[hsl(34_50%_35%)] ring-[hsl(36_36%_80%)]',
    'Await report': 'bg-[hsl(38_40%_90%)] text-[hsl(34_50%_35%)] ring-[hsl(36_36%_80%)]',
    Requested: 'bg-[hsl(38_40%_90%)] text-[hsl(34_50%_35%)] ring-[hsl(36_36%_80%)]',
    Scheduled: 'bg-[hsl(210_40%_90%)] text-[hsl(210_50%_30%)] ring-[hsl(210_35%_80%)]',
    Declined: 'bg-[hsl(4_55%_92%)] text-[hsl(4_50%_40%)] ring-[hsl(4_45%_82%)]',
    Completed: 'bg-[hsl(162_22%_90%)] text-[hsl(164_30%_28%)] ring-[hsl(163_22%_80%)]',
    'Not done': 'bg-[hsl(4_55%_92%)] text-[hsl(4_50%_40%)] ring-[hsl(4_45%_82%)]',
    'Not appropriate': 'bg-[hsl(4_55%_92%)] text-[hsl(4_50%_40%)] ring-[hsl(4_45%_82%)]',
  }
  const labels: Record<string, string> = { '': '\u2014', 'Not started': '\u2014', Emailed: 'Emailed', 'Await report': 'Await report', Requested: 'Requested', Scheduled: 'Scheduled', Declined: 'Declined', Completed: 'Done', 'Not done': 'Not done', 'Not appropriate': 'Inappropriate' }

  return (
    <span className="inline-flex items-center gap-1.5">
      <span className={cn('inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold ring-1 ring-inset', styles[effective] ?? styles[''])}>
        {labels[effective] ?? effective}
        {showCount && <span className="tabular-nums opacity-70">{count}</span>}
      </span>
      {effective === 'Completed' && (
        <span
          className="inline-block h-2 w-2 rounded-full shrink-0"
          style={{ backgroundColor: phColor ?? 'hsl(var(--tone-neutral-300))' }}
          title="PH status"
        />
      )}
    </span>
  )
}

const COHORT_PILL_STYLES: Record<string, string> = {
  'Not known': 'bg-[hsl(var(--tone-neutral-100))] text-[hsl(var(--tone-neutral-600))] ring-[hsl(var(--tone-neutral-300))]',
  'Suspected PH': 'bg-[hsl(38_40%_90%)] text-[hsl(34_50%_35%)] ring-[hsl(36_36%_80%)]',
  'Confirmed PH': 'bg-[hsl(2_52%_25%)] text-white ring-[hsl(2_52%_20%)]',
  'Control': 'bg-[hsl(162_22%_90%)] text-[hsl(164_30%_28%)] ring-[hsl(163_22%_80%)]',
}

const SOURCE_PILL_STYLES: Record<string, string> = {
  'Thoracic': 'bg-[hsl(210_40%_90%)] text-[hsl(210_50%_30%)] ring-[hsl(210_35%_80%)]',
  'PREFER-CMR': 'bg-[hsl(280_35%_90%)] text-[hsl(280_45%_30%)] ring-[hsl(280_30%_80%)]',
  'Garg clinic': 'bg-[hsl(162_22%_90%)] text-[hsl(164_30%_28%)] ring-[hsl(163_22%_80%)]',
  'PH clinic': 'bg-[hsl(38_40%_90%)] text-[hsl(34_50%_35%)] ring-[hsl(36_36%_80%)]',
  'RHC list': 'bg-[hsl(358_34%_92%)] text-[hsl(358_42%_34%)] ring-[hsl(358_30%_82%)]',
  'RACPC': 'bg-[hsl(190_32%_90%)] text-[hsl(190_45%_30%)] ring-[hsl(190_30%_80%)]',
  'Echo list': 'bg-[hsl(340_35%_92%)] text-[hsl(340_45%_35%)] ring-[hsl(340_30%_82%)]',
  'Other': 'bg-[hsl(var(--tone-neutral-100))] text-[hsl(var(--tone-neutral-600))] ring-[hsl(var(--tone-neutral-300))]',
}

function SourcePill({ source }: { source: string | null }) {
  if (!source) return <span className="text-xs text-[hsl(var(--tone-neutral-400))]">{'\u2014'}</span>
  const style = SOURCE_PILL_STYLES[source] ?? SOURCE_PILL_STYLES['Other']
  return (
    <span className={cn('inline-flex items-center justify-center rounded-full w-[90px] py-0.5 text-[11px] font-semibold ring-1 ring-inset whitespace-nowrap', style)}>
      {source}
    </span>
  )
}

function CohortPill({ cohort }: { cohort: string }) {
  const label = cohort || 'Not known'
  const style = COHORT_PILL_STYLES[label] ?? COHORT_PILL_STYLES['Not known']
  return (
    <span className={cn('inline-flex items-center justify-center rounded-full w-[90px] py-0.5 text-[11px] font-semibold ring-1 ring-inset whitespace-nowrap', style)}>
      {label}
    </span>
  )
}

const FILTER_EMPTY_VALUE = '__none__'
const SOURCE_FILTER_OPTIONS = ['Thoracic', 'PREFER-CMR', 'Garg clinic', 'PH clinic', 'RHC list', 'RACPC', 'Echo list', 'Other'] as const
const BOOKING_INVESTIGATIONS: ExtractBookingInvestigation[] = ['RHC', 'CMR', 'CPEX', 'Echo']

function parseStoredDate(value: string | null | undefined): Date | null {
  const raw = String(value ?? '').trim()
  if (!raw) return null

  const isoPrefixMatch = raw.match(/^(\d{4})-(\d{2})-(\d{2})(?:[T\s].*)?$/)
  if (isoPrefixMatch) {
    const [, yyyy, mm, dd] = isoPrefixMatch
    return new Date(Number(yyyy), Number(mm) - 1, Number(dd))
  }

  const slashMatch = raw.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/)
  if (slashMatch) {
    const [, dd, mm, yyyy] = slashMatch
    return new Date(Number(yyyy), Number(mm) - 1, Number(dd))
  }

  const parsed = new Date(raw)
  return Number.isNaN(parsed.getTime()) ? null : parsed
}

function ageFromDob(dob: string | null | undefined): string {
  const birthDate = parseStoredDate(dob)
  if (!birthDate) return '\u2014'

  const today = new Date()
  let age = today.getFullYear() - birthDate.getFullYear()
  const hasHadBirthdayThisYear =
    today.getMonth() > birthDate.getMonth()
    || (today.getMonth() === birthDate.getMonth() && today.getDate() >= birthDate.getDate())
  if (!hasHadBirthdayThisYear) age -= 1

  return age >= 0 ? String(age) : '\u2014'
}

function startOfMonth(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), 1)
}

function addMonths(date: Date, amount: number): Date {
  return new Date(date.getFullYear(), date.getMonth() + amount, 1)
}

function toDateInputValue(date: Date): string {
  const yyyy = date.getFullYear()
  const mm = String(date.getMonth() + 1).padStart(2, '0')
  const dd = String(date.getDate()).padStart(2, '0')
  return `${yyyy}-${mm}-${dd}`
}

function parseBookingDate(value: string | null | undefined): Date | null {
  const raw = String(value ?? '').trim()
  const match = raw.match(/^(\d{4})-(\d{2})-(\d{2})$/)
  if (!match) return null
  const [, yyyy, mm, dd] = match
  return new Date(Number(yyyy), Number(mm) - 1, Number(dd))
}

function formatDisplayDate(value: string | null | undefined): string {
  const parsed = parseBookingDate(value)
  if (!parsed) return value || '-'
  return `${String(parsed.getDate()).padStart(2, '0')}/${String(parsed.getMonth() + 1).padStart(2, '0')}/${parsed.getFullYear()}`
}

function formatMonthLabel(date: Date): string {
  return date.toLocaleDateString('en-GB', { month: 'long', year: 'numeric' })
}

function daysForMonthGrid(month: Date): Date[] {
  const first = startOfMonth(month)
  const gridStart = new Date(first)
  const mondayOffset = (first.getDay() + 6) % 7
  gridStart.setDate(first.getDate() - mondayOffset)
  return Array.from({ length: 42 }, (_, index) => {
    const day = new Date(gridStart)
    day.setDate(gridStart.getDate() + index)
    return day
  })
}

function isSameCalendarDay(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear()
    && a.getMonth() === b.getMonth()
    && a.getDate() === b.getDate()
}

function bookingInvestigationClass(investigation: string): string {
  if (investigation === 'RHC') return 'bg-[hsl(var(--tone-danger-50))] text-[hsl(var(--tone-danger-700))] ring-[hsl(var(--tone-danger-200))]'
  if (investigation === 'CMR') return 'bg-[hsl(280_35%_90%)] text-[hsl(280_45%_30%)] ring-[hsl(280_30%_80%)]'
  if (investigation === 'CPEX') return 'bg-[hsl(210_40%_90%)] text-[hsl(210_50%_30%)] ring-[hsl(210_35%_80%)]'
  return 'bg-[hsl(162_22%_90%)] text-[hsl(164_30%_28%)] ring-[hsl(163_22%_80%)]'
}

function compareBookingEntries(a: ExtractBookingEntry, b: ExtractBookingEntry): number {
  const dateDiff = a.booking_date.localeCompare(b.booking_date)
  if (dateDiff !== 0) return dateDiff
  const timeA = a.booking_time || '99:99'
  const timeB = b.booking_time || '99:99'
  const timeDiff = timeA.localeCompare(timeB)
  if (timeDiff !== 0) return timeDiff
  return (a.name || a.hn || '').localeCompare(b.name || b.hn || '')
}

function genderDotTone(gender: string | null | undefined): string {
  const normalized = String(gender ?? '').trim().toLowerCase()
  if (normalized.startsWith('m')) return 'bg-[hsl(210_65%_52%)]'
  if (normalized.startsWith('f')) return 'bg-[hsl(334_70%_68%)]'
  return 'bg-[hsl(var(--tone-neutral-300))]'
}

function AgeSexCell({ dob, gender }: { dob: string | null; gender: string | null }) {
  const age = ageFromDob(dob)
  const hasGender = Boolean(String(gender ?? '').trim())

  if (age === '\u2014' && !hasGender) {
    return <span className="text-[hsl(var(--tone-neutral-400))]">{'\u2014'}</span>
  }

  return (
    <div className="flex items-center justify-center gap-2">
      <span className="tabular-nums text-[hsl(var(--foreground))]">{age}</span>
      <span
        className={cn('inline-block h-2.5 w-2.5 shrink-0 rounded-full', genderDotTone(gender))}
        title={gender || 'Unknown sex'}
      />
    </div>
  )
}

function RipPill() {
  return (
    <span className="inline-flex shrink-0 items-center rounded-full border border-[hsl(2_52%_42%)] bg-white px-2 py-0.5 text-[10px] font-medium tracking-[0.02em] text-[hsl(2_52%_34%)]">
      RIP
    </span>
  )
}

function StatusBadge({ status }: { status: string }) {
  const normalized = String(status ?? '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase()
  const colors = STATUS_COLORS[normalized] ?? {
    bg: 'hsl(210 20% 96%)',
    text: 'hsl(215 18% 34%)',
    border: 'hsl(210 18% 82%)',
  }
  return (
    <span
      className="inline-flex items-center rounded-full px-2.5 py-0.5 text-[11px] font-semibold whitespace-nowrap"
      style={{
        backgroundColor: colors.bg,
        color: colors.text,
        border: `1px solid ${colors.border}`,
      }}
    >
      {status || '\u2014'}
    </span>
  )
}

const RECRUITMENT_STATUSES = [
  'Identified',
  'Approached',
  'PIS Sent',
  'Consented',
  'Enrolled',
  'Completed',
  'Declined',
  'Withdrawn',
  'Not Eligible',
  'Screening',
]

// ---------------------------------------------------------------------------
// Sort helpers
// ---------------------------------------------------------------------------

type SortKey = keyof PatientRow
type SortDir = 'asc' | 'desc'

function comparePrimitive(a: unknown, b: unknown, dir: SortDir): number {
  const aVal = a ?? ''
  const bVal = b ?? ''
  if (typeof aVal === 'number' && typeof bVal === 'number') {
    return dir === 'asc' ? aVal - bVal : bVal - aVal
  }
  const cmp = String(aVal).localeCompare(String(bVal))
  return dir === 'asc' ? cmp : -cmp
}

// ---------------------------------------------------------------------------
// View types
// ---------------------------------------------------------------------------

type CohortView = 'table' | 'charts' | 'kanban' | 'tracking' | 'bookings'

const VIEW_ITEMS: { key: CohortView; label: string; icon: typeof LayoutList }[] = [
  { key: 'table', label: 'Table', icon: LayoutList },
  { key: 'charts', label: 'Analytics', icon: BarChart3 },
  { key: 'kanban', label: 'Kanban', icon: Columns3 },
]

const TRACKING_VIEW_ITEMS: { key: CohortView; label: string; icon: typeof LayoutList }[] = [
  { key: 'tracking', label: 'Tracking', icon: ClipboardList },
  { key: 'bookings', label: 'Bookings', icon: CalendarDays },
]

export function ExtractCohortPage() {
  const navigate = useNavigate()
  const [activeView, setActiveView] = useState<CohortView>('table')

  // Data
  const [patients, setPatients] = useState<PatientRow[]>([])
  const [total, setTotal] = useState(0)
  const [stats, setStats] = useState<StatsData | null>(null)
  const [loading, setLoading] = useState(true)
  const [deleteStatus, setDeleteStatus] = useState<string>('')
  const [actionFlagStatus, setActionFlagStatus] = useState('')
  const [trackingEntries, setTrackingEntries] = useState<ExtractTrackingEntry[]>([])
  const [trackingLoading, setTrackingLoading] = useState(false)
  const [trackingStatus, setTrackingStatus] = useState('')
  const [bookingEntries, setBookingEntries] = useState<ExtractBookingEntry[]>([])
  const [bookingLoading, setBookingLoading] = useState(false)
  const [bookingStatus, setBookingStatus] = useState('')
  const [bookingView, setBookingView] = useState<'month' | 'list'>('month')
  const [bookingMonth, setBookingMonth] = useState(() => startOfMonth(new Date()))

  // Search and sort
  const [search, setSearch] = useState('')
  const [debouncedSearch, setDebouncedSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [sourceFilter, setSourceFilter] = useState('')
  const [excludeNotEligible, setExcludeNotEligible] = useState(true)
  const [sortKey, setSortKey] = useState<SortKey>('name')
  const [sortDir, setSortDir] = useState<SortDir>('asc')

  // Add patient
  const [addOpen, setAddOpen] = useState(false)
  const [newHn, setNewHn] = useState('')
  const [newName, setNewName] = useState('')
  const [addSaving, setAddSaving] = useState(false)
  const [newTrackingName, setNewTrackingName] = useState('')
  const [newTrackingHn, setNewTrackingHn] = useState('')
  const [newTrackingDetails, setNewTrackingDetails] = useState('')
  const [trackingSaving, setTrackingSaving] = useState(false)
  const [newBookingName, setNewBookingName] = useState('')
  const [newBookingHn, setNewBookingHn] = useState('')
  const [newBookingInvestigation, setNewBookingInvestigation] = useState<ExtractBookingInvestigation>('CMR')
  const [newBookingDate, setNewBookingDate] = useState(() => toDateInputValue(new Date()))
  const [newBookingTime, setNewBookingTime] = useState('')
  const [newBookingDetails, setNewBookingDetails] = useState('')
  const [bookingSaving, setBookingSaving] = useState(false)
  const { openMenu, MenuPortal } = useRecordContextMenu()

  // Debounce search
  useEffect(() => {
    const id = setTimeout(() => {
      setDebouncedSearch(search)
    }, 300)
    return () => clearTimeout(id)
  }, [search])

  // Fetch stats
  useEffect(() => {
    void fetchStats()
      .then((data) => setStats(data as StatsData))
      .catch(() => {})
  }, [])

  // Fetch patients
  const loadPatients = useCallback(async () => {
    setLoading(true)
    try {
      const resp = (await fetchPatients({
        search: debouncedSearch || undefined,
        status: statusFilter || undefined,
        source: sourceFilter || undefined,
        limit: 0,
      })) as PatientListResponse
      const { items, total: responseTotal } = normalizePatientListResponse(resp)
      setPatients(items)
      setTotal(responseTotal)
    } catch {
      // Keep current view on failure
    } finally {
      setLoading(false)
    }
  }, [debouncedSearch, sourceFilter, statusFilter])

  useEffect(() => {
    void loadPatients()
  }, [loadPatients])

  const loadTrackingEntries = useCallback(async () => {
    setTrackingLoading(true)
    try {
      const response = await fetchTrackingEntries()
      setTrackingEntries(response.items ?? [])
    } catch (error) {
      setTrackingStatus(error instanceof Error ? error.message : 'Failed to fetch tracking entries.')
    } finally {
      setTrackingLoading(false)
    }
  }, [])

  useEffect(() => {
    if (activeView === 'tracking') {
      void loadTrackingEntries()
    }
  }, [activeView, loadTrackingEntries])

  const loadBookingEntries = useCallback(async () => {
    setBookingLoading(true)
    try {
      const response = await fetchBookingEntries()
      setBookingEntries(response.items ?? [])
    } catch (error) {
      setBookingStatus(error instanceof Error ? error.message : 'Failed to fetch bookings.')
    } finally {
      setBookingLoading(false)
    }
  }, [])

  useEffect(() => {
    if (activeView === 'bookings') {
      void loadBookingEntries()
    }
  }, [activeView, loadBookingEntries])

  const visiblePatients = useMemo(() => {
    if (!excludeNotEligible) return patients
    return patients.filter((patient) => patient.recruitment_status !== 'Not Eligible')
  }, [excludeNotEligible, patients])

  const visibleStats = useMemo<StatsData>(() => ({
    total_patients: visiblePatients.length,
    rhc_count: visiblePatients.reduce((sum, patient) => sum + (patient.rhc_count ?? 0), 0),
    echo_count: visiblePatients.reduce((sum, patient) => sum + (patient.echo_count ?? 0), 0),
    cmr_count: visiblePatients.reduce((sum, patient) => sum + (patient.cmr_count ?? 0), 0),
    cpex_count: visiblePatients.reduce((sum, patient) => sum + (patient.cpex_count ?? 0), 0),
  }), [visiblePatients])

  const displayStats = loading && patients.length === 0 && stats ? stats : visibleStats
  const displayTotal = excludeNotEligible ? visiblePatients.length : total

  // Sorted patients (client-side secondary sort on top of server pagination)
  const sortedPatients = useMemo(() => {
    const copy = [...visiblePatients]
    copy.sort((a, b) => comparePrimitive(a[sortKey], b[sortKey], sortDir))
    return copy
  }, [visiblePatients, sortKey, sortDir])

  const hasFilteringApplied = Boolean(debouncedSearch || statusFilter || sourceFilter || excludeNotEligible)

  // Sort handler
  const handleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'))
    } else {
      setSortKey(key)
      setSortDir('asc')
    }
  }

  const handleDeletePatient = async (hn: string) => {
    const deletedPatient = patients.find((p) => p.hn === hn) ?? null
    try {
      await deletePatient(hn)
      setDeleteStatus(`Deleted participant ${hn}.`)
      setPatients((prev) => prev.filter((p) => p.hn !== hn))
      setTotal((prev) => Math.max(0, prev - 1))
      if (deletedPatient) {
        setStats((prev) => prev ? ({
          ...prev,
          total_patients: Math.max(0, prev.total_patients - 1),
          rhc_count: Math.max(0, prev.rhc_count - (deletedPatient.rhc_count ?? 0)),
          echo_count: Math.max(0, prev.echo_count - (deletedPatient.echo_count ?? 0)),
          cmr_count: Math.max(0, prev.cmr_count - (deletedPatient.cmr_count ?? 0)),
          cpex_count: Math.max(0, prev.cpex_count - (deletedPatient.cpex_count ?? 0)),
        }) : prev)
      }
      void loadPatients()
    } catch (e) {
      const message = e instanceof Error ? e.message : 'Failed to delete participant.'
      setDeleteStatus(message)
      console.error('Failed to delete patient', e)
    }
  }

  const handleToggleImagesUploaded = async (patient: PatientRow) => {
    const nextValue = !patient.images_uploaded
    setPatients((prev) => prev.map((p) => (
      p.hn === patient.hn ? { ...p, images_uploaded: nextValue } : p
    )))
    try {
      await updatePatient(patient.hn, { images_uploaded: nextValue })
    } catch {
      setPatients((prev) => prev.map((p) => (
        p.hn === patient.hn ? { ...p, images_uploaded: patient.images_uploaded } : p
      )))
    }
  }

  const handleToggleRipTag = async (patient: PatientRow) => {
    const nextValue = !patient.rip_tag
    setPatients((prev) => prev.map((p) => (
      p.hn === patient.hn ? { ...p, rip_tag: nextValue } : p
    )))
    try {
      await updatePatient(patient.hn, { rip_tag: nextValue })
    } catch {
      setPatients((prev) => prev.map((p) => (
        p.hn === patient.hn ? { ...p, rip_tag: patient.rip_tag } : p
      )))
    }
  }

  const handleToggleActionFlag = async (patient: PatientRow) => {
    const nextValue = !patient.action_flag
    setActionFlagStatus('')
    setPatients((prev) => prev.map((p) => (
      p.hn === patient.hn ? { ...p, action_flag: nextValue } : p
    )))
    try {
      await updatePatient(patient.hn, { action_flag: nextValue })
    } catch {
      setPatients((prev) => prev.map((p) => (
        p.hn === patient.hn ? { ...p, action_flag: patient.action_flag } : p
      )))
      setActionFlagStatus(`Could not save action flag for ${patient.hn}.`)
    }
  }

  const handleChangeTrackingEntry = (
    id: string,
    field: 'name' | 'hn' | 'details',
    value: string,
  ) => {
    setTrackingEntries((prev) => prev.map((entry) => (
      entry.id === id ? { ...entry, [field]: value } : entry
    )))
  }

  const handleSaveTrackingEntry = async (entry: ExtractTrackingEntry) => {
    try {
      const saved = await updateTrackingEntry(entry.id, {
        name: entry.name ?? '',
        hn: entry.hn ?? '',
        details: entry.details ?? '',
      })
      setTrackingEntries((prev) => prev.map((item) => item.id === saved.id ? saved : item))
    } catch (error) {
      setTrackingStatus(error instanceof Error ? error.message : 'Failed to update tracking entry.')
      void loadTrackingEntries()
    }
  }

  const handleAddTrackingEntry = async () => {
    if (!newTrackingName.trim() && !newTrackingHn.trim()) return
    setTrackingSaving(true)
    setTrackingStatus('')
    try {
      const created = await createTrackingEntry({
        name: newTrackingName.trim() || undefined,
        hn: newTrackingHn.trim() || undefined,
        details: newTrackingDetails.trim() || undefined,
      })
      setTrackingEntries((prev) => [created, ...prev])
      setNewTrackingName('')
      setNewTrackingHn('')
      setNewTrackingDetails('')
    } catch (error) {
      setTrackingStatus(error instanceof Error ? error.message : 'Failed to add tracking entry.')
    } finally {
      setTrackingSaving(false)
    }
  }

  const handleDeleteTrackingEntry = async (id: string) => {
    try {
      await deleteTrackingEntry(id)
      setTrackingEntries((prev) => prev.filter((entry) => entry.id !== id))
    } catch (error) {
      setTrackingStatus(error instanceof Error ? error.message : 'Failed to delete tracking entry.')
    }
  }

  const handleChangeBookingEntry = (
    id: string,
    field: 'name' | 'hn' | 'investigation' | 'booking_date' | 'booking_time' | 'details',
    value: string,
  ) => {
    setBookingEntries((prev) => prev.map((entry) => (
      entry.id === id ? { ...entry, [field]: value } : entry
    )))
  }

  const handleSaveBookingEntry = async (entry: ExtractBookingEntry) => {
    try {
      const saved = await updateBookingEntry(entry.id, {
        name: entry.name ?? '',
        hn: entry.hn ?? '',
        investigation: entry.investigation,
        booking_date: entry.booking_date,
        booking_time: entry.booking_time ?? '',
        details: entry.details ?? '',
      })
      setBookingEntries((prev) => prev.map((item) => item.id === saved.id ? saved : item))
    } catch (error) {
      setBookingStatus(error instanceof Error ? error.message : 'Failed to update booking.')
      void loadBookingEntries()
    }
  }

  const handleAddBookingEntry = async () => {
    if (!newBookingDate || (!newBookingName.trim() && !newBookingHn.trim())) return
    setBookingSaving(true)
    setBookingStatus('')
    try {
      const created = await createBookingEntry({
        name: newBookingName.trim() || undefined,
        hn: newBookingHn.trim() || undefined,
        investigation: newBookingInvestigation,
        booking_date: newBookingDate,
        booking_time: newBookingTime.trim() || undefined,
        details: newBookingDetails.trim() || undefined,
      })
      setBookingEntries((prev) => [...prev, created].sort(compareBookingEntries))
      setNewBookingName('')
      setNewBookingHn('')
      setNewBookingTime('')
      setNewBookingDetails('')
      setBookingMonth(startOfMonth(parseBookingDate(created.booking_date) ?? new Date()))
    } catch (error) {
      setBookingStatus(error instanceof Error ? error.message : 'Failed to add booking.')
    } finally {
      setBookingSaving(false)
    }
  }

  const handleDeleteBookingEntry = async (id: string) => {
    try {
      await deleteBookingEntry(id)
      setBookingEntries((prev) => prev.filter((entry) => entry.id !== id))
    } catch (error) {
      setBookingStatus(error instanceof Error ? error.message : 'Failed to delete booking.')
    }
  }

  const handleAddPatient = async () => {
    if (!newHn.trim()) return
    setAddSaving(true)
    try {
      await createPatient({ hn: newHn.trim(), name: newName.trim() || undefined })
      setNewHn('')
      setNewName('')
      setAddOpen(false)
      void loadPatients()
    } catch {
      // keep form
    } finally {
      setAddSaving(false)
    }
  }

  // Column sort indicator
  const SortIndicator = ({ col }: { col: SortKey }) => {
    if (sortKey !== col) return null
    return (
      <span className="ml-1 text-[10px]">{sortDir === 'asc' ? '\u25B2' : '\u25BC'}</span>
    )
  }

  const sortableHeaderClass =
    'cursor-pointer select-none transition-colors hover:text-[hsl(var(--foreground))]'

  return (
    <div className="flex h-full">
      {/* Left sidebar navigation — matches extract-patient-detail-page.tsx */}
      <nav
        data-house-role="left-nav-panel"
        className="flex w-56 shrink-0 flex-col border-r border-border bg-background"
      >
        {/* Header */}
        <div className="border-b border-border px-4 py-3">
          <p className="truncate text-sm font-semibold text-foreground">PH Cohort</p>
          <p className="text-xs text-muted-foreground">{displayTotal} patients</p>
        </div>

        {/* Nav links */}
        <div className="flex flex-col gap-0.5 px-2 py-3">
          {VIEW_ITEMS.map((item) => {
            const isActive = activeView === item.key
            return (
              <button
                key={item.key}
                type="button"
                onClick={() => setActiveView(item.key)}
                className={cn(
                  'group relative flex items-center gap-2.5 rounded-md px-3 py-2 text-sm font-medium transition-[background-color,color] duration-100 text-left',
                  isActive
                    ? 'bg-[hsl(var(--tone-danger-50))] text-[hsl(var(--tone-danger-700))] border border-[hsl(var(--tone-danger-700)/0.22)]'
                    : 'text-foreground hover:bg-[hsl(var(--tone-neutral-100))] border border-transparent',
                )}
              >
                {isActive && (
                  <span className="absolute inset-y-1 left-0 w-1 rounded-r bg-[hsl(var(--tone-danger-700))]" />
                )}
                <item.icon className={cn('h-4 w-4 shrink-0', isActive ? 'text-[hsl(var(--tone-danger-700))]' : 'text-muted-foreground')} />
                {item.label}
              </button>
            )
          })}
          <div className="mx-2 my-2 h-px bg-[hsl(var(--border))]" />
          {TRACKING_VIEW_ITEMS.map((item) => {
            const isActive = activeView === item.key
            return (
              <button
                key={item.key}
                type="button"
                onClick={() => setActiveView(item.key)}
                className={cn(
                  'group relative flex items-center gap-2.5 rounded-md px-3 py-2 text-sm font-medium transition-[background-color,color] duration-100 text-left',
                  isActive
                    ? 'bg-[hsl(var(--tone-danger-50))] text-[hsl(var(--tone-danger-700))] border border-[hsl(var(--tone-danger-700)/0.22)]'
                    : 'text-foreground hover:bg-[hsl(var(--tone-neutral-100))] border border-transparent',
                )}
              >
                {isActive && (
                  <span className="absolute inset-y-1 left-0 w-1 rounded-r bg-[hsl(var(--tone-danger-700))]" />
                )}
                <item.icon className={cn('h-4 w-4 shrink-0', isActive ? 'text-[hsl(var(--tone-danger-700))]' : 'text-muted-foreground')} />
                {item.label}
              </button>
            )
          })}
        </div>
      </nav>

      {/* Main content */}
      <div className="flex-1 overflow-y-auto px-6 py-4">
      {activeView === 'table' ? (
    <Stack data-house-role="page" space="lg">
      {/* Title row */}
      <Row align="center" gap="md" wrap={false} className="house-page-title-row">
        <SectionMarker tone="report" size="title" className="self-stretch h-auto" />
        <PageHeader
          heading="PH Cohort"
          description=""
          className="!ml-0 !mt-0"
        />
      </Row>

      {/* Summary strip */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <StatCard
          icon={Users}
          label="Total Patients"
          value={displayStats.total_patients}
          color="hsl(var(--tone-positive-500))"
        />
        <StatCard
          icon={Activity}
          label="RHC Records"
          value={displayStats.rhc_count}
          color="hsl(var(--tone-accent-500))"
        />
        <StatCard
          icon={Heart}
          label="Echo Records"
          value={displayStats.echo_count}
          color="hsl(var(--tone-warning-500))"
        />
        <StatCard
          icon={FileText}
          label="CMR Records"
          value={displayStats.cmr_count}
          color="hsl(var(--tone-danger-500))"
        />
        <StatCard
          icon={Wind}
          label="CPEX Records"
          value={displayStats.cpex_count}
          color="hsl(var(--tone-neutral-500))"
        />
      </div>

      {(deleteStatus || actionFlagStatus) && (
        <div className="rounded-lg border border-[hsl(var(--stroke-soft)/0.72)] bg-[hsl(var(--card))] px-4 py-2 text-sm text-[hsl(var(--foreground))] shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
          {actionFlagStatus || deleteStatus}
        </div>
      )}

      {/* Search + add */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative min-w-[260px] flex-1 max-w-md">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[hsl(var(--muted-foreground))]" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by HN or name..."
            className="house-input w-full pl-9 rounded-lg py-2 text-sm"
          />
        </div>

        <select
          value={statusFilter}
          onChange={(e) => {
            setStatusFilter(e.target.value)
          }}
          aria-label="Filter by recruitment status"
          className="house-input min-w-[170px] rounded-lg px-3 py-2 text-sm"
        >
          <option value="">All statuses</option>
          <option value={FILTER_EMPTY_VALUE}>No status</option>
          {RECRUITMENT_STATUSES.map((status) => (
            <option key={status} value={status}>{status}</option>
          ))}
        </select>

        <select
          value={sourceFilter}
          onChange={(e) => {
            setSourceFilter(e.target.value)
          }}
          aria-label="Filter by source"
          className="house-input min-w-[170px] rounded-lg px-3 py-2 text-sm"
        >
          <option value="">All sources</option>
          <option value={FILTER_EMPTY_VALUE}>No source</option>
          {SOURCE_FILTER_OPTIONS.map((source) => (
            <option key={source} value={source}>{source}</option>
          ))}
        </select>

        <button
          type="button"
          onClick={() => setExcludeNotEligible((current) => !current)}
          aria-pressed={excludeNotEligible}
          className={cn(
            'inline-flex items-center gap-2 rounded-lg border px-3 py-2 text-sm font-medium transition-colors',
            excludeNotEligible
              ? 'border-[hsl(var(--tone-positive-300))] bg-[hsl(var(--tone-positive-50))] text-[hsl(var(--tone-positive-700))]'
              : 'border-[hsl(var(--border))] bg-[hsl(var(--background))] text-[hsl(var(--muted-foreground))] hover:bg-[hsl(var(--tone-neutral-50))]',
          )}
        >
          <span
            className={cn(
              'relative inline-flex h-4 w-7 shrink-0 rounded-full ring-1 ring-inset transition-colors',
              excludeNotEligible
                ? 'bg-[hsl(var(--tone-positive-500))] ring-[hsl(var(--tone-positive-500))]'
                : 'bg-[hsl(var(--tone-neutral-200))] ring-[hsl(var(--tone-neutral-300))]',
            )}
          >
            <span
              className={cn(
                'absolute top-0.5 h-3 w-3 rounded-full bg-white shadow-sm transition-transform',
                excludeNotEligible ? 'translate-x-3.5' : 'translate-x-0.5',
              )}
            />
          </span>
          Exclude not eligible
        </button>

        {(statusFilter || sourceFilter || !excludeNotEligible) && (
          <button
            type="button"
            onClick={() => {
              setStatusFilter('')
              setSourceFilter('')
              setExcludeNotEligible(true)
            }}
            className="inline-flex items-center gap-1.5 rounded-lg border border-[hsl(var(--border))] px-3 py-2 text-sm font-medium text-[hsl(var(--muted-foreground))] transition-colors hover:bg-[hsl(var(--tone-neutral-50))]"
          >
            <X className="h-3.5 w-3.5" />
            Clear filters
          </button>
        )}

        <button
          type="button"
          onClick={() => setAddOpen(!addOpen)}
          className="inline-flex items-center gap-1.5 rounded-lg bg-[hsl(var(--section-style-report-accent))] px-4 py-2 text-sm font-semibold text-white shadow-sm transition-colors hover:opacity-90"
        >
          <Plus className="h-4 w-4" />
          Add patient
        </button>
      </div>

      {/* Add patient inline form */}
      {addOpen && (
        <div className="rounded-lg border border-[hsl(var(--stroke-soft)/0.72)] bg-[hsl(var(--card))] px-5 py-4 shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
          <div className="flex items-end gap-3">
            <label className="grid gap-1.5 flex-1">
              <span className="house-field-label">Hospital number</span>
              <input
                type="text"
                value={newHn}
                onChange={(e) => setNewHn(e.target.value)}
                placeholder="-"
                className="house-input rounded-lg px-3 py-2 text-sm"
                autoFocus
              />
            </label>
            <label className="grid gap-1.5 flex-1">
              <span className="house-field-label">Name</span>
              <input
                type="text"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder="-"
                className="house-input rounded-lg px-3 py-2 text-sm"
                onKeyDown={(e) => { if (e.key === 'Enter') void handleAddPatient() }}
              />
            </label>
            <button
              type="button"
              onClick={() => void handleAddPatient()}
              disabled={!newHn.trim() || addSaving}
              className="rounded-lg bg-[hsl(var(--section-style-report-accent))] px-4 py-2 text-sm font-semibold text-white shadow-sm transition-colors hover:opacity-90 disabled:opacity-50"
            >
              {addSaving ? 'Adding...' : 'Add'}
            </button>
            <button
              type="button"
              onClick={() => { setAddOpen(false); setNewHn(''); setNewName('') }}
              className="rounded-lg border border-[hsl(var(--border))] px-3 py-2 text-sm text-[hsl(var(--muted-foreground))] hover:bg-[hsl(var(--tone-neutral-50))]"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>
      )}

      {/* Table */}
      <div className="rounded-2xl border border-[hsl(var(--stroke-soft)/0.72)] bg-white">
        <div>
          <table data-house-no-column-resize="true" className="w-full table-fixed border-collapse text-sm">
            <colgroup>
              <col style={{ width: '32px' }} />
              <col style={{ width: '36px' }} />
              <col style={{ width: '9%' }} />
              <col style={{ width: '15%' }} />
              <col style={{ width: '8%' }} />
              <col style={{ width: '10%' }} />
              <col style={{ width: '9%' }} />
              <col style={{ width: '9%' }} />
              <col style={{ width: '8%' }} />
              <col style={{ width: '8%' }} />
              <col style={{ width: '8%' }} />
              <col style={{ width: '8%' }} />
            </colgroup>
            <thead className="sticky top-0 z-20">
              <tr className="border-b-2 border-[hsl(var(--tone-neutral-300))] bg-[hsl(var(--tone-neutral-50))] shadow-[0_2px_6px_rgba(15,23,42,0.08)]">
                <th className="px-2 py-2 text-center" title="Action needed">
                  <Flag className="mx-auto h-3.5 w-3.5 text-[hsl(var(--muted-foreground))]" aria-label="Action needed" />
                </th>
                <th className="px-3 py-2 text-center" title="Images uploaded">
                  <span className="text-sm" aria-label="Images uploaded">📷</span>
                </th>
                <th
                  className={cn('house-table-head-text px-3 py-2 text-left', sortableHeaderClass)}
                  onClick={() => handleSort('hn')}
                >
                  HN
                  <SortIndicator col="hn" />
                </th>
                <th
                  className={cn('house-table-head-text px-3 py-2 text-left', sortableHeaderClass)}
                  onClick={() => handleSort('name')}
                >
                  Name
                  <SortIndicator col="name" />
                </th>
                <th className="house-table-head-text px-3 py-2 text-center">
                  Age / Sex
                </th>
                <th
                  className={cn('house-table-head-text px-3 py-2 text-left', sortableHeaderClass)}
                  onClick={() => handleSort('cohort')}
                >
                  Cohort
                  <SortIndicator col="cohort" />
                </th>
                <th
                  className={cn('house-table-head-text px-3 py-2 text-center', sortableHeaderClass)}
                  onClick={() => handleSort('recruitment_status')}
                >
                  Status
                  <SortIndicator col="recruitment_status" />
                </th>
                <th className="house-table-head-text px-3 py-2 text-center">
                  Source
                </th>
                <th
                  className={cn('house-table-head-text px-3 py-2 text-center', sortableHeaderClass)}
                  onClick={() => handleSort('rhc_count')}
                >
                  RHC
                  <SortIndicator col="rhc_count" />
                </th>
                <th
                  className={cn('house-table-head-text px-3 py-2 text-center', sortableHeaderClass)}
                  onClick={() => handleSort('echo_count')}
                >
                  Echo
                  <SortIndicator col="echo_count" />
                </th>
                <th
                  className={cn('house-table-head-text px-3 py-2 text-center', sortableHeaderClass)}
                  onClick={() => handleSort('cmr_count')}
                >
                  CMR
                  <SortIndicator col="cmr_count" />
                </th>
                <th
                  className={cn('house-table-head-text px-3 py-2 text-center', sortableHeaderClass)}
                  onClick={() => handleSort('cpex_count')}
                >
                  CPEX
                  <SortIndicator col="cpex_count" />
                </th>
              </tr>
            </thead>
            <tbody>
              {loading && patients.length === 0 ? (
                Array.from({ length: 8 }).map((_, i) => (
                  <tr key={`skel-${i}`} className="border-b border-[hsl(var(--stroke-soft)/0.4)]">
                    <td colSpan={12} className="px-3 py-3">
                      <div className="h-4 w-full animate-pulse rounded bg-[hsl(var(--tone-neutral-200))]" />
                    </td>
                  </tr>
                ))
              ) : visiblePatients.length === 0 ? (
                <tr>
                  <td colSpan={12} className="px-4 py-12 text-center text-sm text-[hsl(var(--muted-foreground))]">
                    {hasFilteringApplied ? 'No patients match your current search or filters.' : 'No patients in the cohort yet.'}
                  </td>
                </tr>
              ) : (
                sortedPatients.map((p) => (
                  <tr
                    key={p.hn}
                    onClick={(e) => {
                      if ((e.target as HTMLElement).tagName === 'INPUT') return
                      navigate(`/extract-patient/${encodeURIComponent(p.hn)}`)
                    }}
                    onContextMenu={(e) => openMenu(e, [
                      {
                        label: p.rip_tag ? 'Remove RIP tag' : 'Add RIP tag',
                        icon: <Tag className="h-3.5 w-3.5" />,
                        onClick: () => void handleToggleRipTag(p),
                      },
                      DeleteMenuItem({ label: 'Delete participant', onDelete: () => void handleDeletePatient(p.hn) }),
                    ])}
                    className={cn(
                      'cursor-pointer border-b border-[hsl(var(--stroke-soft)/0.4)] transition-colors duration-100',
                      'odd:bg-[hsl(var(--tone-neutral-50)/0.5)] even:bg-white',
                      'hover:bg-[hsl(var(--tone-positive-50)/0.4)]',
                    )}
                  >
                    <td className="px-2 py-2.5 text-center" onClick={(e) => e.stopPropagation()}>
                      <button
                        type="button"
                        onClick={() => void handleToggleActionFlag(p)}
                        className={cn(
                          'inline-flex h-6 w-6 items-center justify-center rounded transition-colors',
                          p.action_flag
                            ? 'text-[hsl(2_72%_48%)] hover:text-[hsl(2_72%_38%)]'
                            : 'text-[hsl(var(--tone-neutral-300))] hover:text-[hsl(var(--tone-neutral-500))]',
                        )}
                        aria-label={p.action_flag ? `Clear action flag for ${p.hn}` : `Flag ${p.hn} for action`}
                        aria-pressed={p.action_flag}
                        title={p.action_flag ? 'Action flagged — click to clear' : 'Flag for action'}
                      >
                        <Flag
                          className="h-3.5 w-3.5"
                          fill={p.action_flag ? 'currentColor' : 'none'}
                          strokeWidth={p.action_flag ? 2 : 1.75}
                        />
                      </button>
                    </td>
                    <td className="px-3 py-2.5 text-center" onClick={(e) => e.stopPropagation()}>
                      <input
                        type="checkbox"
                        checked={Boolean(p.images_uploaded)}
                        onChange={() => void handleToggleImagesUploaded(p)}
                        className="h-4 w-4 accent-[hsl(var(--tone-positive-600))]"
                        aria-label={`Images uploaded for ${p.hn}`}
                      />
                    </td>
                    <td className="house-table-cell-text px-3 py-2.5 font-medium text-[hsl(var(--foreground))]">
                      {p.hn}
                    </td>
                    <td className="house-table-cell-text px-3 py-2.5 text-[hsl(var(--foreground))]">
                      <div className="flex min-w-0 items-center gap-2">
                        <span className="min-w-0 truncate">{p.name || '\u2014'}</span>
                        {p.rip_tag && <RipPill />}
                      </div>
                    </td>
                    <td className="px-3 py-2.5 text-center">
                      <AgeSexCell dob={p.dob} gender={p.gender} />
                    </td>
                    <td className="px-3 py-2.5 text-center">
                      <CohortPill cohort={p.cohort} />
                    </td>
                    <td className="px-3 py-2.5 text-center">
                      <StatusBadge status={p.recruitment_status} />
                    </td>
                    <td className="px-3 py-2.5 text-center">
                      <SourcePill source={p.source} />
                    </td>
                    <td className="px-3 py-2.5 text-center"><InxPill status={p.inx_rhc} count={p.rhc_count ?? 0} phColor={rhcPhDot(p.pa_mean)} /></td>
                    <td className="px-3 py-2.5 text-center"><InxPill status={p.inx_echo} count={p.echo_count ?? 0} phColor={phDotColor(p.echo_ph_prob)} /></td>
                    <td className="px-3 py-2.5 text-center"><InxPill status={p.inx_cmr} count={p.cmr_count ?? 0} phColor={phDotColor(p.cmr_ph)} /></td>
                    <td className="px-3 py-2.5 text-center"><InxPill status={p.inx_cpex} count={p.cpex_count ?? 0} /></td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </Stack>
      ) : activeView === 'charts' ? (
        <CohortChartsView patients={visiblePatients} />
      ) : activeView === 'kanban' ? (
        <CohortKanbanView patients={visiblePatients} navigate={navigate} />
      ) : activeView === 'tracking' ? (
        <CohortTrackingView
          entries={trackingEntries}
          loading={trackingLoading}
          status={trackingStatus}
          newName={newTrackingName}
          newHn={newTrackingHn}
          newDetails={newTrackingDetails}
          saving={trackingSaving}
          onNewNameChange={setNewTrackingName}
          onNewHnChange={setNewTrackingHn}
          onNewDetailsChange={setNewTrackingDetails}
          onAdd={() => void handleAddTrackingEntry()}
          onEntryChange={handleChangeTrackingEntry}
          onEntrySave={(entry) => void handleSaveTrackingEntry(entry)}
          onEntryDelete={(entry) => void handleDeleteTrackingEntry(entry.id)}
          openMenu={openMenu}
        />
      ) : (
        <CohortBookingsView
          entries={bookingEntries}
          patients={patients}
          loading={bookingLoading}
          status={bookingStatus}
          view={bookingView}
          month={bookingMonth}
          newName={newBookingName}
          newHn={newBookingHn}
          newInvestigation={newBookingInvestigation}
          newDate={newBookingDate}
          newTime={newBookingTime}
          newDetails={newBookingDetails}
          saving={bookingSaving}
          onViewChange={setBookingView}
          onMonthChange={setBookingMonth}
          onNewNameChange={setNewBookingName}
          onNewHnChange={setNewBookingHn}
          onNewInvestigationChange={setNewBookingInvestigation}
          onNewDateChange={setNewBookingDate}
          onNewTimeChange={setNewBookingTime}
          onNewDetailsChange={setNewBookingDetails}
          onAdd={() => void handleAddBookingEntry()}
          onEntryChange={handleChangeBookingEntry}
          onEntrySave={(entry) => void handleSaveBookingEntry(entry)}
          onEntryDelete={(entry) => void handleDeleteBookingEntry(entry.id)}
          openMenu={openMenu}
        />
      )}
      </div>
      {MenuPortal}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Charts / Analytics View
// ---------------------------------------------------------------------------

function CohortChartsView({ patients }: { patients: PatientRow[] }) {
  // Recruitment status distribution
  const statusCounts = useMemo(() => {
    const counts: Record<string, number> = {}
    for (const p of patients) {
      const s = p.recruitment_status || 'Not set'
      counts[s] = (counts[s] || 0) + 1
    }
    return Object.entries(counts).sort((a, b) => b[1] - a[1])
  }, [patients])

  // Cohort distribution
  const cohortCounts = useMemo(() => {
    const counts: Record<string, number> = {}
    for (const p of patients) {
      const c = p.cohort || 'Unassigned'
      counts[c] = (counts[c] || 0) + 1
    }
    return Object.entries(counts).sort((a, b) => b[1] - a[1])
  }, [patients])

  // Investigation completion rates
  const inxRates = useMemo(() => {
    const t = patients.length || 1
    return [
      { label: 'RHC', done: patients.filter((p) => (p.rhc_count ?? 0) > 0).length, total: t },
      { label: 'Echo', done: patients.filter((p) => (p.echo_count ?? 0) > 0).length, total: t },
      { label: 'CMR', done: patients.filter((p) => (p.cmr_count ?? 0) > 0).length, total: t },
      { label: 'CPEX', done: patients.filter((p) => (p.cpex_count ?? 0) > 0).length, total: t },
    ]
  }, [patients])

  // PA mean distribution buckets
  const paBuckets = useMemo(() => {
    const buckets = { 'Normal (\u226420)': 0, 'Borderline (21-24)': 0, 'Mild PH (25-34)': 0, 'Moderate (35-44)': 0, 'Severe (\u226545)': 0 }
    for (const p of patients) {
      if (p.pa_mean == null) continue
      const v = p.pa_mean
      if (v <= 20) buckets['Normal (\u226420)']++
      else if (v <= 24) buckets['Borderline (21-24)']++
      else if (v <= 34) buckets['Mild PH (25-34)']++
      else if (v <= 44) buckets['Moderate (35-44)']++
      else buckets['Severe (\u226545)']++
    }
    return Object.entries(buckets)
  }, [patients])

  const maxCount = Math.max(1, ...statusCounts.map(([, c]) => c), ...cohortCounts.map(([, c]) => c))

  const barColors: Record<string, string> = {
    'Normal (\u226420)': 'hsl(158 35% 55%)',
    'Borderline (21-24)': 'hsl(38 60% 55%)',
    'Mild PH (25-34)': 'hsl(20 50% 55%)',
    'Moderate (35-44)': 'hsl(4 55% 50%)',
    'Severe (\u226545)': 'hsl(2 52% 35%)',
  }

  return (
    <div className="p-6 space-y-6">
      <h2 className="text-lg font-semibold text-[hsl(var(--foreground))]">Cohort analytics</h2>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Recruitment status */}
        <div className="rounded-xl border border-[hsl(var(--stroke-soft)/0.72)] bg-[hsl(var(--card))]">
          <div className="border-b border-[hsl(var(--stroke-soft)/0.5)] bg-[hsl(var(--tone-neutral-50))] px-5 py-3">
            <h3 className="text-sm font-semibold text-[hsl(var(--foreground))]">Recruitment status</h3>
          </div>
          <div className="px-5 py-4 space-y-2.5">
            {statusCounts.map(([label, count]) => (
              <div key={label} className="flex items-center gap-3">
                <span className="w-24 shrink-0 text-xs font-medium text-[hsl(var(--muted-foreground))] truncate">{label}</span>
                <div className="flex-1 h-5 rounded-full bg-[hsl(var(--tone-neutral-100))] overflow-hidden">
                  <div
                    className="h-full rounded-full bg-[hsl(var(--section-style-report-accent))] transition-[width]"
                    style={{ width: `${(count / maxCount) * 100}%` }}
                  />
                </div>
                <span className="w-8 text-right text-xs font-bold tabular-nums text-[hsl(var(--foreground))]">{count}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Cohort distribution */}
        <div className="rounded-xl border border-[hsl(var(--stroke-soft)/0.72)] bg-[hsl(var(--card))]">
          <div className="border-b border-[hsl(var(--stroke-soft)/0.5)] bg-[hsl(var(--tone-neutral-50))] px-5 py-3">
            <h3 className="text-sm font-semibold text-[hsl(var(--foreground))]">Cohort distribution</h3>
          </div>
          <div className="px-5 py-4 space-y-2.5">
            {cohortCounts.map(([label, count]) => (
              <div key={label} className="flex items-center gap-3">
                <span className="w-24 shrink-0 text-xs font-medium text-[hsl(var(--muted-foreground))] truncate">{label}</span>
                <div className="flex-1 h-5 rounded-full bg-[hsl(var(--tone-neutral-100))] overflow-hidden">
                  <div
                    className="h-full rounded-full bg-[hsl(var(--tone-accent-500))] transition-[width]"
                    style={{ width: `${(count / maxCount) * 100}%` }}
                  />
                </div>
                <span className="w-8 text-right text-xs font-bold tabular-nums text-[hsl(var(--foreground))]">{count}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Investigation completion */}
        <div className="rounded-xl border border-[hsl(var(--stroke-soft)/0.72)] bg-[hsl(var(--card))]">
          <div className="border-b border-[hsl(var(--stroke-soft)/0.5)] bg-[hsl(var(--tone-neutral-50))] px-5 py-3">
            <h3 className="text-sm font-semibold text-[hsl(var(--foreground))]">Investigation completion</h3>
          </div>
          <div className="px-5 py-4">
            <div className="grid grid-cols-4 gap-4">
              {inxRates.map((m) => {
                const pct = Math.round((m.done / m.total) * 100)
                return (
                  <div key={m.label} className="text-center">
                    <div className="relative mx-auto h-16 w-16">
                      <svg className="h-16 w-16 -rotate-90" viewBox="0 0 36 36">
                        <circle cx="18" cy="18" r="15" fill="none" stroke="hsl(var(--tone-neutral-200))" strokeWidth="3" />
                        <circle cx="18" cy="18" r="15" fill="none" stroke="hsl(var(--section-style-report-accent))" strokeWidth="3"
                          strokeDasharray={`${pct * 0.942} 100`} strokeLinecap="round" />
                      </svg>
                      <span className="absolute inset-0 flex items-center justify-center text-xs font-bold tabular-nums">{pct}%</span>
                    </div>
                    <p className="mt-1.5 text-xs font-semibold text-[hsl(var(--foreground))]">{m.label}</p>
                    <p className="text-[10px] text-[hsl(var(--muted-foreground))]">{m.done}/{m.total}</p>
                  </div>
                )
              })}
            </div>
          </div>
        </div>

        {/* PA mean distribution */}
        <div className="rounded-xl border border-[hsl(var(--stroke-soft)/0.72)] bg-[hsl(var(--card))]">
          <div className="border-b border-[hsl(var(--stroke-soft)/0.5)] bg-[hsl(var(--tone-neutral-50))] px-5 py-3">
            <h3 className="text-sm font-semibold text-[hsl(var(--foreground))]">PA mean pressure distribution</h3>
          </div>
          <div className="px-5 py-4 space-y-2.5">
            {paBuckets.map(([label, count]) => (
              <div key={label} className="flex items-center gap-3">
                <span className="w-28 shrink-0 text-xs font-medium text-[hsl(var(--muted-foreground))]">{label}</span>
                <div className="flex-1 h-5 rounded-full bg-[hsl(var(--tone-neutral-100))] overflow-hidden">
                  <div
                    className="h-full rounded-full transition-[width]"
                    style={{ width: `${(count / Math.max(1, ...paBuckets.map(([, c]) => c))) * 100}%`, backgroundColor: barColors[label] ?? 'hsl(var(--tone-neutral-400))' }}
                  />
                </div>
                <span className="w-8 text-right text-xs font-bold tabular-nums text-[hsl(var(--foreground))]">{count}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Tracking View
// ---------------------------------------------------------------------------

function CohortTrackingView({
  entries,
  loading,
  status,
  newName,
  newHn,
  newDetails,
  saving,
  onNewNameChange,
  onNewHnChange,
  onNewDetailsChange,
  onAdd,
  onEntryChange,
  onEntrySave,
  onEntryDelete,
  openMenu,
}: {
  entries: ExtractTrackingEntry[]
  loading: boolean
  status: string
  newName: string
  newHn: string
  newDetails: string
  saving: boolean
  onNewNameChange: (value: string) => void
  onNewHnChange: (value: string) => void
  onNewDetailsChange: (value: string) => void
  onAdd: () => void
  onEntryChange: (id: string, field: 'name' | 'hn' | 'details', value: string) => void
  onEntrySave: (entry: ExtractTrackingEntry) => void
  onEntryDelete: (entry: ExtractTrackingEntry) => void
  openMenu: ReturnType<typeof useRecordContextMenu>['openMenu']
}) {
  return (
    <div className="p-6 space-y-4">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <SectionMarker tone="report" size="header" />
          <h2 className="text-lg font-semibold text-[hsl(var(--foreground))]">Tracking</h2>
        </div>
        <span className="text-xs font-medium text-[hsl(var(--muted-foreground))]">
          {entries.length} tracked
        </span>
      </div>

      <div className="rounded-2xl border border-[hsl(var(--stroke-soft)/0.72)] bg-white">
        <table data-house-no-column-resize="true" className="w-full table-fixed border-collapse text-sm">
          <colgroup>
            <col style={{ width: '20%' }} />
            <col style={{ width: '13%' }} />
            <col />
          </colgroup>
          <thead className="sticky top-0 z-20">
            <tr className="border-b-2 border-[hsl(var(--tone-neutral-300))] bg-[hsl(var(--tone-neutral-50))] shadow-[0_2px_6px_rgba(15,23,42,0.08)]">
              <th className="house-table-head-text px-4 py-2 text-left">Name</th>
              <th className="house-table-head-text px-4 py-2 text-left">HN</th>
              <th className="house-table-head-text px-4 py-2 text-left">Details</th>
            </tr>
          </thead>
          <tbody>
            <tr className="border-b border-[hsl(var(--stroke-soft)/0.55)] bg-[hsl(var(--tone-neutral-50)/0.55)]">
              <td className="px-3 py-2">
                <input
                  type="text"
                  value={newName}
                  onChange={(event) => onNewNameChange(event.target.value)}
                  className="house-input h-8 w-full rounded-lg px-2.5 text-sm"
                  placeholder="Name"
                />
              </td>
              <td className="px-3 py-2">
                <input
                  type="text"
                  value={newHn}
                  onChange={(event) => onNewHnChange(event.target.value)}
                  className="house-input h-8 w-full rounded-lg px-2.5 text-sm"
                  placeholder="HN"
                />
              </td>
              <td className="px-3 py-2">
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    value={newDetails}
                    onChange={(event) => onNewDetailsChange(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter') onAdd()
                    }}
                    className="house-input h-8 min-w-0 flex-1 rounded-lg px-2.5 text-sm"
                    placeholder="Details"
                  />
                  <button
                    type="button"
                    onClick={onAdd}
                    disabled={saving || (!newName.trim() && !newHn.trim())}
                    className="inline-flex h-8 shrink-0 items-center gap-1.5 rounded-lg bg-[hsl(var(--section-style-report-accent))] px-3 text-xs font-semibold text-white shadow-sm transition-colors hover:opacity-90 disabled:opacity-50"
                  >
                    <Plus className="h-3.5 w-3.5" />
                    Add
                  </button>
                </div>
              </td>
            </tr>

            {status && (
              <tr>
                <td colSpan={3} className="px-4 py-2 text-sm text-[hsl(var(--tone-danger-700))]">
                  {status}
                </td>
              </tr>
            )}

            {loading ? (
              Array.from({ length: 5 }).map((_, index) => (
                <tr key={`tracking-skeleton-${index}`} className="border-b border-[hsl(var(--stroke-soft)/0.4)]">
                  <td colSpan={3} className="px-3 py-2">
                    <div className="h-4 w-full animate-pulse rounded bg-[hsl(var(--tone-neutral-200))]" />
                  </td>
                </tr>
              ))
            ) : entries.length === 0 ? (
              <tr>
                <td colSpan={3} className="px-4 py-8 text-center text-sm text-[hsl(var(--muted-foreground))]">
                  No tracking entries.
                </td>
              </tr>
            ) : (
              entries.map((entry) => (
                <tr
                  key={entry.id}
                  onContextMenu={(event) => openMenu(event, [
                    DeleteMenuItem({
                      label: 'Delete tracking entry',
                      onDelete: () => onEntryDelete(entry),
                    }),
                  ])}
                  className="border-b border-[hsl(var(--stroke-soft)/0.4)] odd:bg-[hsl(var(--tone-neutral-50)/0.5)] even:bg-white"
                >
                  <td className="px-3 py-2">
                    <input
                      type="text"
                      value={entry.name ?? ''}
                      onChange={(event) => onEntryChange(entry.id, 'name', event.target.value)}
                      onBlur={() => onEntrySave(entry)}
                      className="house-input h-8 w-full rounded-lg px-2.5 text-sm"
                      aria-label={`Name for tracking entry ${entry.hn ?? entry.id}`}
                    />
                  </td>
                  <td className="px-3 py-2">
                    <input
                      type="text"
                      value={entry.hn ?? ''}
                      onChange={(event) => onEntryChange(entry.id, 'hn', event.target.value)}
                      onBlur={() => onEntrySave(entry)}
                      className="house-input h-8 w-full rounded-lg px-2.5 text-sm font-medium"
                      aria-label={`HN for tracking entry ${entry.name ?? entry.id}`}
                    />
                  </td>
                  <td className="px-3 py-2">
                    <input
                      type="text"
                      value={entry.details ?? ''}
                      onChange={(event) => onEntryChange(entry.id, 'details', event.target.value)}
                      onBlur={() => onEntrySave(entry)}
                      className="house-input h-8 w-full rounded-lg px-2.5 text-sm"
                      aria-label={`Details for tracking entry ${entry.name || entry.hn || entry.id}`}
                    />
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Bookings View
// ---------------------------------------------------------------------------

function BookingAddRow({
  patients,
  newName,
  newHn,
  newInvestigation,
  newDate,
  newTime,
  newDetails,
  saving,
  onNewNameChange,
  onNewHnChange,
  onNewInvestigationChange,
  onNewDateChange,
  onNewTimeChange,
  onNewDetailsChange,
  onAdd,
}: {
  patients: PatientRow[]
  newName: string
  newHn: string
  newInvestigation: ExtractBookingInvestigation
  newDate: string
  newTime: string
  newDetails: string
  saving: boolean
  onNewNameChange: (value: string) => void
  onNewHnChange: (value: string) => void
  onNewInvestigationChange: (value: ExtractBookingInvestigation) => void
  onNewDateChange: (value: string) => void
  onNewTimeChange: (value: string) => void
  onNewDetailsChange: (value: string) => void
  onAdd: () => void
}) {
  const [suggestionsOpen, setSuggestionsOpen] = useState(false)
  const patientSuggestions = useMemo(() => {
    const query = newName.trim().toLowerCase()
    if (query.length < 2) return []
    return patients
      .filter((patient) => {
        const name = (patient.name || '').toLowerCase()
        const hn = (patient.hn || '').toLowerCase()
        return name.includes(query) || hn.includes(query)
      })
      .slice(0, 8)
  }, [newName, patients])

  const selectPatient = (patient: PatientRow) => {
    onNewNameChange(patient.name || '')
    onNewHnChange(patient.hn || '')
    setSuggestionsOpen(false)
  }

  return (
    <div className="grid gap-2 rounded-2xl border border-[hsl(var(--stroke-soft)/0.72)] bg-white p-3 shadow-[0_1px_3px_rgba(0,0,0,0.04)] lg:grid-cols-[1.2fr_0.75fr_0.75fr_0.8fr_0.65fr_1.7fr_auto]">
      <div className="relative">
        <input
          type="text"
          value={newName}
          onChange={(event) => {
            onNewNameChange(event.target.value)
            setSuggestionsOpen(true)
          }}
          onFocus={() => setSuggestionsOpen(true)}
          onBlur={() => window.setTimeout(() => setSuggestionsOpen(false), 120)}
          className="house-input h-9 w-full rounded-lg px-3 text-sm"
          placeholder="Name"
          autoComplete="off"
        />
        {suggestionsOpen && patientSuggestions.length > 0 && (
          <div className="absolute left-0 right-0 top-[calc(100%+4px)] z-40 max-h-72 overflow-y-auto rounded-lg border border-[hsl(var(--stroke-soft)/0.9)] bg-white py-1 shadow-lg">
            {patientSuggestions.map((patient) => (
              <button
                key={patient.hn}
                type="button"
                onMouseDown={(event) => {
                  event.preventDefault()
                  selectPatient(patient)
                }}
                className="flex w-full items-center justify-between gap-3 px-3 py-2 text-left text-sm hover:bg-[hsl(var(--tone-danger-50)/0.7)]"
              >
                <span className="min-w-0 truncate font-medium text-[hsl(var(--foreground))]">
                  {patient.name || patient.hn}
                </span>
                <span className="shrink-0 text-xs font-semibold text-[hsl(var(--muted-foreground))]">
                  {patient.hn}
                </span>
              </button>
            ))}
          </div>
        )}
      </div>
      <input
        type="text"
        value={newHn}
        onChange={(event) => onNewHnChange(event.target.value)}
        className="house-input h-9 rounded-lg px-3 text-sm"
        placeholder="HN"
      />
      <select
        value={newInvestigation}
        onChange={(event) => onNewInvestigationChange(event.target.value as ExtractBookingInvestigation)}
        className="house-input h-9 rounded-lg px-3 text-sm"
      >
        {BOOKING_INVESTIGATIONS.map((investigation) => (
          <option key={investigation} value={investigation}>{investigation}</option>
        ))}
      </select>
      <input
        type="date"
        value={newDate}
        onChange={(event) => onNewDateChange(event.target.value)}
        className="house-input h-9 rounded-lg px-3 text-sm"
      />
      <input
        type="time"
        value={newTime}
        onChange={(event) => onNewTimeChange(event.target.value)}
        className="house-input h-9 rounded-lg px-3 text-sm"
        aria-label="Booking time"
      />
      <input
        type="text"
        value={newDetails}
        onChange={(event) => onNewDetailsChange(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === 'Enter') onAdd()
        }}
        className="house-input h-9 rounded-lg px-3 text-sm"
        placeholder="Details"
      />
      <button
        type="button"
        onClick={onAdd}
        disabled={saving || !newDate || (!newName.trim() && !newHn.trim())}
        className="inline-flex h-9 items-center justify-center gap-1.5 rounded-lg bg-[hsl(var(--section-style-report-accent))] px-4 text-sm font-semibold text-white shadow-sm transition-colors hover:opacity-90 disabled:opacity-50"
      >
        <Plus className="h-4 w-4" />
        Add
      </button>
    </div>
  )
}

function BookingPill({ investigation }: { investigation: string }) {
  return (
    <span className={cn('inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-semibold ring-1 ring-inset', bookingInvestigationClass(investigation))}>
      {investigation}
    </span>
  )
}

function CohortBookingsView({
  entries,
  patients,
  loading,
  status,
  view,
  month,
  newName,
  newHn,
  newInvestigation,
  newDate,
  newTime,
  newDetails,
  saving,
  onViewChange,
  onMonthChange,
  onNewNameChange,
  onNewHnChange,
  onNewInvestigationChange,
  onNewDateChange,
  onNewTimeChange,
  onNewDetailsChange,
  onAdd,
  onEntryChange,
  onEntrySave,
  onEntryDelete,
  openMenu,
}: {
  entries: ExtractBookingEntry[]
  patients: PatientRow[]
  loading: boolean
  status: string
  view: 'month' | 'list'
  month: Date
  newName: string
  newHn: string
  newInvestigation: ExtractBookingInvestigation
  newDate: string
  newTime: string
  newDetails: string
  saving: boolean
  onViewChange: (value: 'month' | 'list') => void
  onMonthChange: (value: Date) => void
  onNewNameChange: (value: string) => void
  onNewHnChange: (value: string) => void
  onNewInvestigationChange: (value: ExtractBookingInvestigation) => void
  onNewDateChange: (value: string) => void
  onNewTimeChange: (value: string) => void
  onNewDetailsChange: (value: string) => void
  onAdd: () => void
  onEntryChange: (id: string, field: 'name' | 'hn' | 'investigation' | 'booking_date' | 'booking_time' | 'details', value: string) => void
  onEntrySave: (entry: ExtractBookingEntry) => void
  onEntryDelete: (entry: ExtractBookingEntry) => void
  openMenu: ReturnType<typeof useRecordContextMenu>['openMenu']
}) {
  const today = useMemo(() => new Date(), [])
  const monthDays = useMemo(() => daysForMonthGrid(month), [month])
  const bookingsByDate = useMemo(() => {
    const map = new Map<string, ExtractBookingEntry[]>()
    for (const entry of entries) {
      const key = entry.booking_date
      map.set(key, [...(map.get(key) ?? []), entry].sort(compareBookingEntries))
    }
    return map
  }, [entries])
  const sortedEntries = useMemo(
    () => [...entries].sort(compareBookingEntries),
    [entries],
  )
  const upcomingEntries = useMemo(() => {
    const todayKey = toDateInputValue(today)
    return sortedEntries.filter((entry) => entry.booking_date >= todayKey)
  }, [sortedEntries, today])

  return (
    <div className="p-6 space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <SectionMarker tone="report" size="header" />
          <div>
            <h2 className="text-lg font-semibold text-[hsl(var(--foreground))]">Bookings</h2>
          </div>
        </div>
        <div className="inline-flex rounded-lg border border-[hsl(var(--border))] bg-white p-1">
          {(['month', 'list'] as const).map((option) => (
            <button
              key={option}
              type="button"
              onClick={() => onViewChange(option)}
              className={cn(
                'rounded-md px-3 py-1.5 text-sm font-medium transition-colors',
                view === option
                  ? 'bg-[hsl(var(--tone-danger-50))] text-[hsl(var(--tone-danger-700))]'
                  : 'text-[hsl(var(--muted-foreground))] hover:bg-[hsl(var(--tone-neutral-50))]',
              )}
            >
              {option === 'month' ? 'Month' : 'List'}
            </button>
          ))}
        </div>
      </div>

      <BookingAddRow
        patients={patients}
        newName={newName}
        newHn={newHn}
        newInvestigation={newInvestigation}
        newDate={newDate}
        newTime={newTime}
        newDetails={newDetails}
        saving={saving}
        onNewNameChange={onNewNameChange}
        onNewHnChange={onNewHnChange}
        onNewInvestigationChange={onNewInvestigationChange}
        onNewDateChange={onNewDateChange}
        onNewTimeChange={onNewTimeChange}
        onNewDetailsChange={onNewDetailsChange}
        onAdd={onAdd}
      />

      {status && (
        <div className="rounded-lg border border-[hsl(var(--tone-danger-200))] bg-[hsl(var(--tone-danger-50))] px-4 py-2 text-sm text-[hsl(var(--tone-danger-700))]">
          {status}
        </div>
      )}

      {view === 'month' ? (
        <div className="rounded-2xl border border-[hsl(var(--stroke-soft)/0.72)] bg-white shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
          <div className="flex items-center justify-between border-b border-[hsl(var(--stroke-soft)/0.6)] px-4 py-3">
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => onMonthChange(addMonths(month, -1))}
                className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-[hsl(var(--border))] hover:bg-[hsl(var(--tone-neutral-50))]"
                aria-label="Previous month"
              >
                <ChevronLeft className="h-4 w-4" />
              </button>
              <button
                type="button"
                onClick={() => onMonthChange(addMonths(month, 1))}
                className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-[hsl(var(--border))] hover:bg-[hsl(var(--tone-neutral-50))]"
                aria-label="Next month"
              >
                <ChevronRight className="h-4 w-4" />
              </button>
              <button
                type="button"
                onClick={() => onMonthChange(startOfMonth(new Date()))}
                className="h-8 rounded-lg border border-[hsl(var(--border))] px-3 text-xs font-semibold text-[hsl(var(--muted-foreground))] hover:bg-[hsl(var(--tone-neutral-50))]"
              >
                Today
              </button>
            </div>
            <h3 className="text-base font-semibold text-[hsl(var(--foreground))]">{formatMonthLabel(month)}</h3>
            <span className="text-xs font-medium text-[hsl(var(--muted-foreground))]">
              {upcomingEntries.length} upcoming
            </span>
          </div>

          <div className="grid grid-cols-7 border-b border-[hsl(var(--stroke-soft)/0.6)] bg-[hsl(var(--tone-neutral-50))]">
            {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((day) => (
              <div key={day} className="px-3 py-2 text-xs font-semibold text-[hsl(var(--muted-foreground))]">
                {day}
              </div>
            ))}
          </div>

          <div className="grid grid-cols-7">
            {monthDays.map((day) => {
              const dayKey = toDateInputValue(day)
              const dayEntries = bookingsByDate.get(dayKey) ?? []
              const inCurrentMonth = day.getMonth() === month.getMonth()
              return (
                <div
                  key={dayKey}
                  className={cn(
                    'min-h-[122px] border-b border-r border-[hsl(var(--stroke-soft)/0.45)] p-2',
                    inCurrentMonth ? 'bg-white' : 'bg-[hsl(var(--tone-neutral-50)/0.55)] text-[hsl(var(--muted-foreground))]',
                    isSameCalendarDay(day, today) && 'bg-[hsl(var(--tone-danger-50)/0.45)]',
                  )}
                >
                  <div className="mb-2 flex items-center justify-between">
                    <span className={cn('text-xs font-semibold', isSameCalendarDay(day, today) && 'text-[hsl(var(--tone-danger-700))]')}>
                      {day.getDate()}
                    </span>
                    {dayEntries.length > 0 && (
                      <span className="rounded-full bg-[hsl(var(--tone-neutral-100))] px-1.5 py-0.5 text-[10px] font-semibold text-[hsl(var(--muted-foreground))]">
                        {dayEntries.length}
                      </span>
                    )}
                  </div>
                  <div className="space-y-1.5">
                    {dayEntries.map((entry) => (
                      <button
                        key={entry.id}
                        type="button"
                        onContextMenu={(event) => openMenu(event, [
                          DeleteMenuItem({ label: 'Delete booking', onDelete: () => onEntryDelete(entry) }),
                        ])}
                        className="block w-full rounded-lg border border-[hsl(var(--stroke-soft)/0.72)] bg-white px-2 py-1 text-left text-[11px] shadow-[0_1px_2px_rgba(15,23,42,0.05)] hover:border-[hsl(var(--tone-danger-300))]"
                        title={`${entry.booking_time ? `${entry.booking_time} ` : ''}${entry.investigation}: ${entry.name || entry.hn || '-'}`}
                      >
                        <div className="flex items-center gap-1.5">
                          <BookingPill investigation={entry.investigation} />
                          {entry.booking_time && (
                            <span className="shrink-0 font-semibold tabular-nums text-[hsl(var(--muted-foreground))]">
                              {entry.booking_time}
                            </span>
                          )}
                          <span className="min-w-0 truncate font-semibold text-[hsl(var(--foreground))]">
                            {entry.name || entry.hn || '-'}
                          </span>
                        </div>
                        {entry.details && (
                          <div className="mt-0.5 truncate text-[hsl(var(--muted-foreground))]">{entry.details}</div>
                        )}
                      </button>
                    ))}
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      ) : (
        <div className="rounded-2xl border border-[hsl(var(--stroke-soft)/0.72)] bg-white">
          <table data-house-no-column-resize="true" className="w-full table-fixed border-collapse text-sm">
            <colgroup>
              <col style={{ width: '11%' }} />
              <col style={{ width: '9%' }} />
              <col style={{ width: '17%' }} />
              <col style={{ width: '12%' }} />
              <col style={{ width: '12%' }} />
              <col />
            </colgroup>
            <thead className="sticky top-0 z-20">
              <tr className="border-b-2 border-[hsl(var(--tone-neutral-300))] bg-[hsl(var(--tone-neutral-50))] shadow-[0_2px_6px_rgba(15,23,42,0.08)]">
                <th className="house-table-head-text px-4 py-2 text-left">Date</th>
                <th className="house-table-head-text px-4 py-2 text-left">Time</th>
                <th className="house-table-head-text px-4 py-2 text-left">Name</th>
                <th className="house-table-head-text px-4 py-2 text-left">HN</th>
                <th className="house-table-head-text px-4 py-2 text-left">Test</th>
                <th className="house-table-head-text px-4 py-2 text-left">Details</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                Array.from({ length: 6 }).map((_, index) => (
                  <tr key={`booking-skeleton-${index}`} className="border-b border-[hsl(var(--stroke-soft)/0.4)]">
                    <td colSpan={6} className="px-3 py-2">
                      <div className="h-4 w-full animate-pulse rounded bg-[hsl(var(--tone-neutral-200))]" />
                    </td>
                  </tr>
                ))
              ) : sortedEntries.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-4 py-8 text-center text-sm text-[hsl(var(--muted-foreground))]">
                    No bookings.
                  </td>
                </tr>
              ) : (
                sortedEntries.map((entry) => (
                  <tr
                    key={entry.id}
                    onContextMenu={(event) => openMenu(event, [
                      DeleteMenuItem({ label: 'Delete booking', onDelete: () => onEntryDelete(entry) }),
                    ])}
                    className="border-b border-[hsl(var(--stroke-soft)/0.4)] odd:bg-[hsl(var(--tone-neutral-50)/0.5)] even:bg-white"
                  >
                    <td className="px-3 py-2">
                      <input
                        type="date"
                        value={entry.booking_date}
                        onChange={(event) => onEntryChange(entry.id, 'booking_date', event.target.value)}
                        onBlur={() => onEntrySave(entry)}
                        className="house-input h-8 w-full rounded-lg px-2.5 text-sm"
                        title={formatDisplayDate(entry.booking_date)}
                      />
                    </td>
                    <td className="px-3 py-2">
                      <input
                        type="time"
                        value={entry.booking_time ?? ''}
                        onChange={(event) => onEntryChange(entry.id, 'booking_time', event.target.value)}
                        onBlur={() => onEntrySave(entry)}
                        className="house-input h-8 w-full rounded-lg px-2.5 text-sm"
                      />
                    </td>
                    <td className="px-3 py-2">
                      <input
                        type="text"
                        value={entry.name ?? ''}
                        onChange={(event) => onEntryChange(entry.id, 'name', event.target.value)}
                        onBlur={() => onEntrySave(entry)}
                        className="house-input h-8 w-full rounded-lg px-2.5 text-sm"
                      />
                    </td>
                    <td className="px-3 py-2">
                      <input
                        type="text"
                        value={entry.hn ?? ''}
                        onChange={(event) => onEntryChange(entry.id, 'hn', event.target.value)}
                        onBlur={() => onEntrySave(entry)}
                        className="house-input h-8 w-full rounded-lg px-2.5 text-sm font-medium"
                      />
                    </td>
                    <td className="px-3 py-2">
                      <select
                        value={entry.investigation}
                        onChange={(event) => onEntryChange(entry.id, 'investigation', event.target.value)}
                        onBlur={() => onEntrySave(entry)}
                        className="house-input h-8 w-full rounded-lg px-2.5 text-sm"
                      >
                        {BOOKING_INVESTIGATIONS.map((investigation) => (
                          <option key={investigation} value={investigation}>{investigation}</option>
                        ))}
                      </select>
                    </td>
                    <td className="px-3 py-2">
                      <input
                        type="text"
                        value={entry.details ?? ''}
                        onChange={(event) => onEntryChange(entry.id, 'details', event.target.value)}
                        onBlur={() => onEntrySave(entry)}
                        className="house-input h-8 w-full rounded-lg px-2.5 text-sm"
                      />
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Kanban View
// ---------------------------------------------------------------------------

const KANBAN_COLUMNS = [
  { key: 'Identified', label: 'Identified' },
  { key: 'Approached', label: 'Approached' },
  { key: 'PIS Sent', label: 'PIS sent' },
  { key: 'Consented', label: 'Consented' },
  { key: 'Enrolled', label: 'Enrolled' },
  { key: 'Completed', label: 'Completed' },
  { key: '__other__', label: 'Other' },
] as const

function CohortKanbanView({ patients, navigate }: { patients: PatientRow[]; navigate: (path: string) => void }) {
  const columns = useMemo(() => {
    const map = new Map<string, PatientRow[]>()
    for (const col of KANBAN_COLUMNS) map.set(col.key, [])
    for (const p of patients) {
      const status = p.recruitment_status || ''
      const colKey = KANBAN_COLUMNS.find((c) => c.key === status)?.key ?? '__other__'
      map.get(colKey)!.push(p)
    }
    return KANBAN_COLUMNS.map((col) => ({ ...col, patients: map.get(col.key) ?? [] }))
  }, [patients])

  return (
    <div className="p-6 space-y-4">
      <h2 className="text-lg font-semibold text-[hsl(var(--foreground))]">Recruitment pipeline</h2>
      <div className="flex gap-3 overflow-x-auto pb-4">
        {columns.map((col) => (
          <div
            key={col.key}
            className="flex w-56 shrink-0 flex-col rounded-xl border border-[hsl(var(--stroke-soft)/0.72)] bg-[hsl(var(--tone-neutral-50)/0.5)]"
          >
            {/* Column header */}
            <div className="flex items-center justify-between px-3 py-2.5 border-b border-[hsl(var(--stroke-soft)/0.5)]">
              <span className="text-xs font-semibold text-[hsl(var(--foreground))]">{col.label}</span>
              <span className="rounded-full bg-[hsl(var(--tone-neutral-200))] px-1.5 py-0.5 text-[10px] font-bold tabular-nums text-[hsl(var(--tone-neutral-600))]">
                {col.patients.length}
              </span>
            </div>
            {/* Cards */}
            <div className="flex flex-col gap-2 p-2 min-h-[100px]">
              {col.patients.map((p) => (
                <button
                  key={p.hn}
                  type="button"
                  onClick={() => navigate(`/extract-patient/${encodeURIComponent(p.hn)}`)}
                  className="rounded-lg border border-[hsl(var(--stroke-soft)/0.72)] bg-white px-3 py-2.5 text-left shadow-[0_1px_2px_rgba(0,0,0,0.04)] transition-[border-color,box-shadow] hover:shadow-md hover:border-[hsl(var(--tone-neutral-400))]"
                >
                  <p className="text-xs font-semibold text-[hsl(var(--foreground))] truncate">{p.name || p.hn}</p>
                  <p className="text-[10px] text-[hsl(var(--muted-foreground))] mt-0.5">{p.hn}</p>
                  {p.cohort && (
                    <p className="text-[10px] text-[hsl(var(--muted-foreground))] mt-0.5">{p.cohort}</p>
                  )}
                  {/* Investigation mini pills */}
                  <div className="flex gap-1 mt-2">
                    {[
                      { label: 'R', count: p.rhc_count ?? 0 },
                      { label: 'E', count: p.echo_count ?? 0 },
                      { label: 'C', count: p.cmr_count ?? 0 },
                      { label: 'X', count: p.cpex_count ?? 0 },
                    ].map((m) => (
                      <span
                        key={m.label}
                        className={cn(
                          'rounded px-1.5 py-0.5 text-[9px] font-bold',
                          m.count > 0
                            ? 'bg-[hsl(162_22%_90%)] text-[hsl(164_30%_28%)]'
                            : 'bg-[hsl(var(--tone-neutral-100))] text-[hsl(var(--tone-neutral-400))]',
                        )}
                      >
                        {m.label}
                      </span>
                    ))}
                  </div>
                </button>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
