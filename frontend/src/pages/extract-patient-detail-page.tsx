import { useEffect, useMemo, useState } from 'react'
import { Link, NavLink, Outlet, useLocation, useNavigate, useOutletContext, useParams } from 'react-router-dom'
import {
  ArrowLeft,
  ChevronLeft,
  ChevronRight,
  LayoutDashboard,
  Activity,
  Heart,
  FileText,
  Wind,
  Stethoscope,
  ClipboardCheck,
  ClipboardList,
} from 'lucide-react'

import { fetchPatient, fetchPatients } from '@/lib/extract-api'
import { cn } from '@/lib/utils'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type PatientDetail = {
  hn: string
  name: string
  dob: string
  gender: string
  anonymisation_code: string
  images_uploaded: boolean
  study_id: string
  cohort: string
  recruitment_status: string
  recruitment_source: string
  rhc_count: number
  echo_count: number
  cmr_count: number
  cpex_count: number
}

type PatientContextValue = {
  patient: PatientDetail | null
  loading: boolean
  reload: (options?: { silent?: boolean }) => void
}

type PatientNavigatorItem = {
  hn: string
  name: string
}

async function fetchPhNavigatorPatients(): Promise<PatientNavigatorItem[]> {
  const limit = 200
  const items: PatientNavigatorItem[] = []

  for (let offset = 0; offset < 5000; offset += limit) {
    const resp = await fetchPatients({ limit, offset })
    const page = Array.isArray(resp) ? resp : (resp as { items?: unknown[] }).items ?? []
    if (!Array.isArray(page) || page.length === 0) break

    for (const row of page) {
      const data = row as Record<string, unknown>
      const hn = String(data.hn ?? '').trim()
      if (!hn) continue
      items.push({
        hn,
        name: String(data.name ?? '').trim(),
      })
    }

    if (page.length < limit) break
  }

  return items.sort((a, b) => {
    const nameCompare = (a.name || a.hn).localeCompare(b.name || b.hn, undefined, {
      sensitivity: 'base',
    })
    if (nameCompare !== 0) return nameCompare
    return a.hn.localeCompare(b.hn, undefined, { numeric: true, sensitivity: 'base' })
  })
}

export function usePatientContext() {
  return useOutletContext<PatientContextValue>()
}

// ---------------------------------------------------------------------------
// Nav items
// ---------------------------------------------------------------------------

const NAV_ITEMS = [
  { label: 'Overview', to: '', icon: LayoutDashboard, end: true },
  { label: 'Clinical Data', to: 'clinical-data', icon: Stethoscope, end: false },
  { label: 'RHC', to: 'rhc', icon: Activity, end: false },
  { label: 'Echo', to: 'echo', icon: Heart, end: false },
  { label: 'CMR', to: 'cmr', icon: FileText, end: false },
  { label: 'CPEX', to: 'cpex', icon: Wind, end: false },
  { label: 'Questionnaire', to: 'questionnaire', icon: ClipboardCheck, end: false },
  { label: 'Recruitment', to: 'recruitment', icon: ClipboardList, end: false },
]

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function ExtractPatientDetailPage() {
  const { hn } = useParams<{ hn: string }>()
  const navigate = useNavigate()
  const location = useLocation()
  const [patient, setPatient] = useState<PatientDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [phNavigatorPatients, setPhNavigatorPatients] = useState<PatientNavigatorItem[]>([])

  const loadPatient = (options?: { silent?: boolean }) => {
    if (!hn) return
    const shouldShowLoading = !(options?.silent && patient)
    if (shouldShowLoading) setLoading(true)
    void fetchPatient(hn)
      .then((data) => setPatient(data as PatientDetail))
      .catch(() => setPatient(null))
      .finally(() => {
        if (shouldShowLoading) setLoading(false)
      })
  }

  useEffect(() => {
    loadPatient()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hn])

  useEffect(() => {
    let cancelled = false
    void fetchPhNavigatorPatients()
      .then((items) => {
        if (!cancelled) setPhNavigatorPatients(items)
      })
      .catch(() => {
        if (!cancelled) setPhNavigatorPatients([])
      })

    return () => {
      cancelled = true
    }
  }, [])

  const currentPhIndex = useMemo(
    () => phNavigatorPatients.findIndex((item) => item.hn === hn),
    [phNavigatorPatients, hn],
  )
  const previousPhPatient = currentPhIndex > 0 ? phNavigatorPatients[currentPhIndex - 1] : null
  const nextPhPatient = currentPhIndex >= 0 && currentPhIndex < phNavigatorPatients.length - 1
    ? phNavigatorPatients[currentPhIndex + 1]
    : null
  const routeSuffix = useMemo(() => {
    if (!hn) return ''
    const prefix = `/extract-patient/${encodeURIComponent(hn)}`
    return location.pathname.startsWith(prefix) ? location.pathname.slice(prefix.length) : ''
  }, [hn, location.pathname])

  const navigateToPhPatient = (target: PatientNavigatorItem | null) => {
    if (!target) return
    navigate(`/extract-patient/${encodeURIComponent(target.hn)}${routeSuffix}${location.search}`)
  }

  return (
    <div className="flex h-full">
      {/* Left sidebar navigation */}
      <nav
        data-house-role="left-nav-panel"
        className="flex w-56 shrink-0 flex-col border-r border-border bg-background"
      >
        {/* Back link */}
        <div className="border-b border-border px-4 py-3">
          <Link
            to="/extract-cohort"
            className="inline-flex items-center gap-1.5 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            Back to Cohort
          </Link>
        </div>

        {/* Patient header */}
        <div className="border-b border-border px-4 py-3">
          {loading ? (
            <div className="space-y-1.5">
              <div className="h-4 w-28 animate-pulse rounded bg-[hsl(var(--tone-neutral-200))]" />
              <div className="h-3 w-20 animate-pulse rounded bg-[hsl(var(--tone-neutral-200))]" />
            </div>
          ) : patient ? (
            <>
              <p className="truncate text-sm font-semibold text-foreground">
                {patient.name || 'Unnamed Patient'}
              </p>
              <p className="text-xs text-muted-foreground">HN: {patient.hn}</p>
            </>
          ) : (
            <p className="text-xs text-muted-foreground">
              Patient not found
            </p>
          )}
        </div>

        {/* Nav links */}
        <div className="flex flex-col gap-0.5 px-2 py-3">
          {NAV_ITEMS.map((item) => (
            <NavLink
              key={item.label}
              to={item.to}
              end={item.end}
              className={({ isActive }) =>
                cn(
                  'group relative flex items-center gap-2.5 rounded-[var(--radius-sm,6px)] px-3 py-2 text-sm font-medium transition-[background-color,color] duration-100',
                  isActive
                    ? 'bg-[hsl(var(--tone-danger-50))] text-[hsl(var(--tone-danger-700))] border border-[hsl(var(--tone-danger-700)/0.22)]'
                    : 'text-foreground hover:bg-[hsl(var(--tone-neutral-100))] border border-transparent',
                )
              }
            >
              {({ isActive }) => (
                <>
                  {isActive && (
                    <span className="absolute inset-y-1 left-0 w-1 rounded-r bg-[hsl(var(--tone-danger-700))]" />
                  )}
                  <item.icon className={cn('h-4 w-4 shrink-0', isActive ? 'text-[hsl(var(--tone-danger-700))]' : 'text-muted-foreground')} />
                  {item.label}
                </>
              )}
            </NavLink>
          ))}
        </div>
      </nav>

      {/* Main content area */}
      <div className="flex-1 overflow-y-auto">
        {/* Top bar with patient name */}
        <div className="sticky top-0 z-10 border-b border-border bg-background/95 px-6 py-3 backdrop-blur">
          <div className="flex items-center justify-between gap-4">
            <h1 className="min-w-0 text-lg font-semibold text-foreground">
              {loading ? (
                <span className="inline-block h-5 w-40 animate-pulse rounded bg-[hsl(var(--tone-neutral-200))]" />
              ) : patient ? (
                <>
                  <span className="truncate">{patient.name || 'Unnamed Patient'}</span>
                  <span className="ml-2 text-sm font-normal text-muted-foreground">
                    {patient.hn}
                  </span>
                </>
              ) : (
                <span className="text-muted-foreground">Patient not found</span>
              )}
            </h1>
            {currentPhIndex >= 0 && phNavigatorPatients.length > 1 && (
              <div className="flex shrink-0 items-center gap-2">
                <span className="hidden text-xs font-medium text-muted-foreground md:inline">
                  {currentPhIndex + 1} of {phNavigatorPatients.length} participants
                </span>
                <button
                  type="button"
                  onClick={() => navigateToPhPatient(previousPhPatient)}
                  disabled={!previousPhPatient}
                  title={previousPhPatient ? `${previousPhPatient.name || previousPhPatient.hn}` : 'No previous participant'}
                  className="inline-flex h-8 items-center gap-1 rounded-md border border-[hsl(var(--stroke-soft)/0.72)] bg-[hsl(var(--card))] px-3 text-xs font-semibold text-[hsl(var(--foreground))] shadow-[0_1px_2px_rgba(0,0,0,0.04)] transition-colors hover:bg-[hsl(var(--tone-neutral-50))] disabled:cursor-not-allowed disabled:opacity-45"
                >
                  <ChevronLeft className="h-3.5 w-3.5" />
                  Previous
                </button>
                <button
                  type="button"
                  onClick={() => navigateToPhPatient(nextPhPatient)}
                  disabled={!nextPhPatient}
                  title={nextPhPatient ? `${nextPhPatient.name || nextPhPatient.hn}` : 'No next participant'}
                  className="inline-flex h-8 items-center gap-1 rounded-md border border-[hsl(var(--stroke-soft)/0.72)] bg-[hsl(var(--card))] px-3 text-xs font-semibold text-[hsl(var(--foreground))] shadow-[0_1px_2px_rgba(0,0,0,0.04)] transition-colors hover:bg-[hsl(var(--tone-neutral-50))] disabled:cursor-not-allowed disabled:opacity-45"
                >
                  Next
                  <ChevronRight className="h-3.5 w-3.5" />
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Outlet for child routes */}
        <div className="house-content-container house-content-container-wide">
          <Outlet context={{ patient, loading, reload: loadPatient } satisfies PatientContextValue} />
        </div>
      </div>
    </div>
  )
}
