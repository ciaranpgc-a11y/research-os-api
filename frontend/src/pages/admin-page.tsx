import { useCallback, useEffect, useMemo, useState } from 'react'
import type { FormEvent } from 'react'
import {
  Activity,
  ArrowLeft,
  BadgeDollarSign,
  Building2,
  CheckCircle2,
  Clock3,
  Database,
  Flag,
  Globe2,
  HardDrive,
  KeyRound,
  LifeBuoy,
  LineChart,
  Search,
  ServerCog,
  ShieldCheck,
  TriangleAlert,
  Users,
  Workflow,
} from 'lucide-react'
import { useNavigate, useParams } from 'react-router-dom'

import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { clearAuthSessionToken, getAuthSessionToken } from '@/lib/auth-session'
import {
  cancelAdminJob,
  fetchAdminAuditEvents,
  fetchAdminJobs,
  fetchAdminOrganisations,
  fetchAdminOverview,
  fetchAdminUsageCosts,
  fetchAdminUsers,
  fetchAdminWorkspaces,
  impersonateAdminOrganisation,
  reconcileAdminUserLibrary,
  retryAdminJob,
} from '@/lib/impact-api'
import { cn } from '@/lib/utils'
import type {
  AdminAuditEventsListPayload,
  AdminJobsListPayload,
  AdminOrganisationsListPayload,
  AdminOverviewPayload,
  AdminUsageCostsPayload,
  AdminUsersListPayload,
  AdminWorkspacesListPayload,
} from '@/types/impact'

type AdminCapabilitySection = {
  id: string
  title: string
  icon: typeof Building2
  status: 'live' | 'partial' | 'planned'
  lane: 'now' | 'next' | 'later'
  summary: string
  items: string[]
}

type AdminNavigationGroup = {
  title: string
  items: string[]
}

const CAPABILITY_SECTIONS: AdminCapabilitySection[] = [
  {
    id: 'overview',
    title: 'Overview',
    icon: Activity,
    status: 'partial',
    lane: 'now',
    summary: 'Weekly command surface for growth, reliability, support, and risk telemetry.',
    items: [
      'Active users (24h, 7d, 30d) with retention snapshot',
      'Error rate, latency p95, and queue backlog indicators',
      'Security pulse: failed logins and unusual activity',
      'Support volume and SLA status',
      'Cost vs revenue summary and margin watch',
    ],
  },
  {
    id: 'organisations',
    title: 'Organisations (Tenants)',
    icon: Building2,
    status: 'live',
    lane: 'now',
    summary: 'Tenant control plane for plan status, quotas, retention policy, integrations, and usage margin.',
    items: [
      'Org profile, plan/billing state, quotas, and retention policy',
      'Members/roles with last active and monthly usage/cost trend',
      'Feature flags, integration state, and rate-limit controls',
      'Internal audited org-admin impersonation controls',
    ],
  },
  {
    id: 'users',
    title: 'Users',
    icon: Users,
    status: 'live',
    lane: 'now',
    summary: 'Global user directory for identity, role state, and account lifecycle visibility.',
    items: [
      'Global user search across name/email',
      'Role and account lifecycle visibility',
      'Last login and high-level activity checks',
      'Security events and internal support notes (planned)',
    ],
  },
  {
    id: 'workspaces',
    title: 'Workspaces / Projects',
    icon: Workflow,
    status: 'live',
    lane: 'now',
    summary: 'Workspace operations for ownership, data attachments, runs, retries, exports, and collaboration pressure.',
    items: [
      'Workspace owner/members and status',
      'Data source attachments and storage footprint',
      'Run history with failures/retries and active workload',
      'Snapshot/export history and project-level activity',
    ],
  },
  {
    id: 'billing',
    title: 'Billing & Plans',
    icon: BadgeDollarSign,
    status: 'planned',
    lane: 'later',
    summary: 'Commercial layer for plans, subscriptions, usage metering, and spend controls.',
    items: [
      'Plans, entitlements, quotas, and feature bundles',
      'Subscriptions and invoice/payment lifecycle',
      'Usage-based metering and cost allocation',
      'Runaway spend kill-switch and hard caps',
    ],
  },
  {
    id: 'usage-costs',
    title: 'Usage, Costs, and Limits',
    icon: Database,
    status: 'live',
    lane: 'now',
    summary: 'Margin analytics by model/tool/org with quotas, throttling, and budget alerts.',
    items: [
      'Token usage by model/feature/org/user',
      'Tool call counts and agent-chain length',
      'Cache hit rates and throttling events',
      'Global and per-org budget alerts',
    ],
  },
  {
    id: 'jobs',
    title: 'Jobs & Queues',
    icon: ServerCog,
    status: 'live',
    lane: 'now',
    summary: 'Back-office run pipeline for queues, workers, retries, and dead-letter visibility.',
    items: [
      'Queue health, backlog, worker status',
      'Retries and dead-letter visibility',
      'Job detail with logs/timings',
      'Internal cancel/retry controls',
    ],
  },
  {
    id: 'flags',
    title: 'Feature Flags & Experiments',
    icon: Flag,
    status: 'planned',
    lane: 'later',
    summary: 'Progressive rollout control by environment, org targeting, and experiment auditing.',
    items: [
      'Environment-aware flag management',
      'Targeting by org/plan/rollout percentage',
      'Experiment setup and analysis',
      'Immutable change history for flag flips',
    ],
  },
  {
    id: 'integrations',
    title: 'Integrations',
    icon: CheckCircle2,
    status: 'planned',
    lane: 'later',
    summary: 'Provider health center for credentials, sync jobs, webhooks, and throttling.',
    items: [
      'Credential/scopes state and expiry',
      'Sync health with retry/backoff metrics',
      'Webhook status and conflict resolution rules',
      'Rate limit health per provider',
    ],
  },
  {
    id: 'security',
    title: 'Security & Compliance',
    icon: ShieldCheck,
    status: 'partial',
    lane: 'now',
    summary: 'Security boundary layer with RBAC, MFA posture, audit logs, and data controls.',
    items: [
      'RBAC enforcement and admin boundary controls',
      'MFA policy visibility and auth-event monitoring',
      'Immutable audit logs and export controls',
      'Retention/deletion workflows and incident tracking',
    ],
  },
  {
    id: 'support',
    title: 'Support & Moderation',
    icon: LifeBuoy,
    status: 'planned',
    lane: 'later',
    summary: 'Operational support controls for ticket SLAs, notes, and account freeze workflows.',
    items: [
      'Ticket queue, assignment, and SLA timers',
      'User/org internal notes and escalation context',
      'Account freeze workflows with audit trail',
      'Moderation/flag queue (if enabled)',
    ],
  },
  {
    id: 'system',
    title: 'System Settings (Internal)',
    icon: Clock3,
    status: 'planned',
    lane: 'later',
    summary: 'Internal environment and release observability with health and deployment history.',
    items: [
      'Read-only environment configuration view',
      'Health checks and status-page linkage',
      'Release notes and deployment history',
      'Operational incident timeline',
    ],
  },
]

const ADMIN_NAV_GROUPS: AdminNavigationGroup[] = [
  {
    title: 'Command',
    items: ['overview', 'users', 'security'],
  },
  {
    title: 'Scale',
    items: ['organisations', 'workspaces', 'usage-costs', 'jobs', 'billing'],
  },
  {
    title: 'Governance',
    items: ['integrations', 'flags', 'support', 'system'],
  },
]

const DEFAULT_SECTION_ID = 'overview'

function findCapability(sectionId: string | undefined): AdminCapabilitySection | null {
  const resolved = CAPABILITY_SECTIONS.find((item) => item.id === sectionId)
  return resolved || null
}

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

function formatPercent(value: number | null | undefined): string {
  const numeric = Number(value)
  if (!Number.isFinite(numeric)) {
    return 'n/a'
  }
  return `${Math.round(numeric * 10) / 10}%`
}

function formatInteger(value: number | null | undefined): string {
  const numeric = Number(value)
  if (!Number.isFinite(numeric)) {
    return '0'
  }
  return new Intl.NumberFormat('en-GB').format(Math.max(0, Math.round(numeric)))
}

function formatCurrency(value: number | null | undefined): string {
  const numeric = Number(value)
  if (!Number.isFinite(numeric)) {
    return '£0.00'
  }
  return new Intl.NumberFormat('en-GB', {
    style: 'currency',
    currency: 'GBP',
    maximumFractionDigits: 2,
  }).format(numeric)
}

function formatBytes(value: number | null | undefined): string {
  const numeric = Number(value)
  if (!Number.isFinite(numeric) || numeric <= 0) {
    return '0 B'
  }
  const units = ['B', 'KB', 'MB', 'GB', 'TB']
  let size = numeric
  let unitIndex = 0
  while (size >= 1024 && unitIndex < units.length - 1) {
    size /= 1024
    unitIndex += 1
  }
  const decimals = unitIndex === 0 ? 0 : size >= 100 ? 0 : size >= 10 ? 1 : 2
  return `${size.toFixed(decimals)} ${units[unitIndex]}`
}

function statusChipClass(status: AdminCapabilitySection['status']): string {
  if (status === 'live') {
    return 'border-[hsl(var(--tone-positive-300))] bg-[hsl(var(--tone-positive-50))] text-[hsl(var(--tone-positive-700))]'
  }
  if (status === 'partial') {
    return 'border-[hsl(var(--tone-warning-300))] bg-[hsl(var(--tone-warning-100))] text-[hsl(var(--tone-warning-900))]'
  }
  return 'border-[hsl(var(--tone-neutral-300))] bg-[hsl(var(--tone-neutral-100))] text-[hsl(var(--tone-neutral-700))]'
}

function laneChipClass(lane: AdminCapabilitySection['lane']): string {
  if (lane === 'now') {
    return 'border-[hsl(var(--tone-accent-400))] bg-[hsl(var(--tone-accent-100))] text-[hsl(var(--tone-accent-800))]'
  }
  if (lane === 'next') {
    return 'border-[hsl(var(--tone-warning-300))] bg-[hsl(var(--tone-warning-100))] text-[hsl(var(--tone-warning-900))]'
  }
  return 'border-[hsl(var(--tone-neutral-300))] bg-[hsl(var(--tone-neutral-100))] text-[hsl(var(--tone-neutral-700))]'
}

function laneLabel(lane: AdminCapabilitySection['lane']): string {
  if (lane === 'now') {
    return 'Now'
  }
  if (lane === 'next') {
    return 'Next'
  }
  return 'Later'
}

function integrationStatusClass(status: 'connected' | 'degraded' | 'not_configured'): string {
  if (status === 'connected') {
    return 'border-[hsl(var(--tone-positive-300))] bg-[hsl(var(--tone-positive-50))] text-[hsl(var(--tone-positive-700))]'
  }
  if (status === 'degraded') {
    return 'border-[hsl(var(--tone-warning-300))] bg-[hsl(var(--tone-warning-100))] text-[hsl(var(--tone-warning-900))]'
  }
  return 'border-[hsl(var(--tone-neutral-300))] bg-[hsl(var(--tone-neutral-100))] text-[hsl(var(--tone-neutral-700))]'
}

export function AdminPage() {
  const navigate = useNavigate()
  const params = useParams<{ sectionId?: string }>()
  const [overview, setOverview] = useState<AdminOverviewPayload | null>(null)
  const [users, setUsers] = useState<AdminUsersListPayload | null>(null)
  const [organisations, setOrganisations] = useState<AdminOrganisationsListPayload | null>(null)
  const [workspaces, setWorkspaces] = useState<AdminWorkspacesListPayload | null>(null)
  const [usageCosts, setUsageCosts] = useState<AdminUsageCostsPayload | null>(null)
  const [jobs, setJobs] = useState<AdminJobsListPayload | null>(null)
  const [auditEvents, setAuditEvents] = useState<AdminAuditEventsListPayload | null>(null)
  const [userQuery, setUserQuery] = useState('')
  const [organisationQuery, setOrganisationQuery] = useState('')
  const [workspaceQuery, setWorkspaceQuery] = useState('')
  const [usageQuery, setUsageQuery] = useState('')
  const [jobsQuery, setJobsQuery] = useState('')
  const [jobStatus, setJobStatus] = useState('all')
  const [selectedOrganisationId, setSelectedOrganisationId] = useState('')
  const [selectedWorkspaceId, setSelectedWorkspaceId] = useState('')
  const [impersonatingOrganisationId, setImpersonatingOrganisationId] = useState('')
  const [actingJobId, setActingJobId] = useState('')
  const [reconcilingUserId, setReconcilingUserId] = useState('')
  const [loading, setLoading] = useState(false)
  const [status, setStatus] = useState('')
  const [error, setError] = useState('')
  const activeCapability = findCapability(params.sectionId) || findCapability(DEFAULT_SECTION_ID)

  useEffect(() => {
    if (!params.sectionId) {
      navigate(`/admin/${DEFAULT_SECTION_ID}`, { replace: true })
      return
    }
    if (!findCapability(params.sectionId)) {
      navigate(`/admin/${DEFAULT_SECTION_ID}`, { replace: true })
    }
  }, [navigate, params.sectionId])

  const setActiveSection = useCallback(
    (sectionId: string) => {
      navigate(`/admin/${sectionId}`)
    },
    [navigate],
  )

  const loadData = useCallback(
    async (
      nextUsersQuery: string,
      nextOrganisationsQuery: string,
      nextWorkspacesQuery: string,
      nextUsageQuery: string,
      nextJobsQuery: string,
      nextJobStatus: string,
    ) => {
      const token = getAuthSessionToken()
      if (!token) {
        navigate('/auth', { replace: true })
        return
      }
      setLoading(true)
      setError('')
      setStatus('')
      try {
        const [
          overviewPayload,
          usersPayload,
          organisationsPayload,
          workspacesPayload,
          usagePayload,
          jobsPayload,
          auditPayload,
        ] = await Promise.all([
          fetchAdminOverview(token),
          fetchAdminUsers(token, {
            query: nextUsersQuery,
            limit: 50,
            offset: 0,
          }),
          fetchAdminOrganisations(token, {
            query: nextOrganisationsQuery,
            limit: 50,
            offset: 0,
          }),
          fetchAdminWorkspaces(token, {
            query: nextWorkspacesQuery,
            limit: 50,
            offset: 0,
          }),
          fetchAdminUsageCosts(token, {
            query: nextUsageQuery,
          }),
          fetchAdminJobs(token, {
            query: nextJobsQuery,
            status: nextJobStatus,
            limit: 50,
            offset: 0,
          }),
          fetchAdminAuditEvents(token, {
            limit: 100,
            offset: 0,
          }),
        ])
        setOverview(overviewPayload)
        setUsers(usersPayload)
        setOrganisations(organisationsPayload)
        setWorkspaces(workspacesPayload)
        setUsageCosts(usagePayload)
        setJobs(jobsPayload)
        setAuditEvents(auditPayload)
        setSelectedOrganisationId((current) => {
          if (!current) {
            return organisationsPayload.items[0]?.id || ''
          }
          const exists = organisationsPayload.items.some((item) => item.id === current)
          return exists ? current : organisationsPayload.items[0]?.id || ''
        })
        setSelectedWorkspaceId((current) => {
          if (!current) {
            return workspacesPayload.items[0]?.id || ''
          }
          const exists = workspacesPayload.items.some((item) => item.id === current)
          return exists ? current : workspacesPayload.items[0]?.id || ''
        })
        setStatus(
          `Loaded users ${usersPayload.items.length}/${usersPayload.total}, organisations ${organisationsPayload.items.length}/${organisationsPayload.total}, workspaces ${workspacesPayload.items.length}/${workspacesPayload.total}, jobs ${jobsPayload.items.length}/${jobsPayload.total}, and ${auditPayload.items.length} audit events.`,
        )
      } catch (loadError) {
        const detail = loadError instanceof Error ? loadError.message : 'Could not load admin data.'
        const lowered = detail.toLowerCase()
        if (lowered.includes('unauthorized')) {
          clearAuthSessionToken()
          navigate('/auth', { replace: true })
          return
        }
        if (lowered.includes('forbidden')) {
          navigate('/workspaces', { replace: true })
          return
        }
        setError(detail)
      } finally {
        setLoading(false)
      }
    },
    [navigate],
  )

  useEffect(() => {
    void loadData('', '', '', '', '', 'all')
  }, [loadData])

  const onUsersSearch = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    void loadData(userQuery, organisationQuery, workspaceQuery, usageQuery, jobsQuery, jobStatus)
  }

  const onOrganisationsSearch = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    void loadData(userQuery, organisationQuery, workspaceQuery, usageQuery, jobsQuery, jobStatus)
  }

  const onWorkspacesSearch = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    void loadData(userQuery, organisationQuery, workspaceQuery, usageQuery, jobsQuery, jobStatus)
  }

  const onUsageSearch = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    void loadData(userQuery, organisationQuery, workspaceQuery, usageQuery, jobsQuery, jobStatus)
  }

  const onJobsSearch = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    void loadData(userQuery, organisationQuery, workspaceQuery, usageQuery, jobsQuery, jobStatus)
  }

  const onImpersonateOrganisation = async () => {
    if (!selectedOrganisation) {
      return
    }
    const token = getAuthSessionToken()
    if (!token) {
      navigate('/auth', { replace: true })
      return
    }
    setImpersonatingOrganisationId(selectedOrganisation.id)
    setError('')
    setStatus('')
    try {
      const payload = await impersonateAdminOrganisation(token, selectedOrganisation.id, {
        reason: 'Admin console impersonation launch.',
      })
      setStatus(
        `Impersonation ticket ${payload.impersonation_ticket} created for ${payload.target_user_email} (expires ${formatTimestamp(payload.expires_at)}).`,
      )
      await loadData(userQuery, organisationQuery, workspaceQuery, usageQuery, jobsQuery, jobStatus)
    } catch (actionError) {
      setError(actionError instanceof Error ? actionError.message : 'Could not impersonate organisation admin.')
    } finally {
      setImpersonatingOrganisationId('')
    }
  }

  const onCancelJob = async (jobId: string) => {
    const token = getAuthSessionToken()
    if (!token) {
      navigate('/auth', { replace: true })
      return
    }
    setActingJobId(jobId)
    setError('')
    setStatus('')
    try {
      const payload = await cancelAdminJob(token, jobId, {
        reason: 'Admin console cancel action.',
      })
      setStatus(payload.message)
      await loadData(userQuery, organisationQuery, workspaceQuery, usageQuery, jobsQuery, jobStatus)
    } catch (actionError) {
      setError(actionError instanceof Error ? actionError.message : 'Could not cancel job.')
    } finally {
      setActingJobId('')
    }
  }

  const onRetryJob = async (jobId: string) => {
    const token = getAuthSessionToken()
    if (!token) {
      navigate('/auth', { replace: true })
      return
    }
    setActingJobId(jobId)
    setError('')
    setStatus('')
    try {
      const payload = await retryAdminJob(token, jobId, {
        reason: 'Admin console retry action.',
      })
      setStatus(payload.message)
      await loadData(userQuery, organisationQuery, workspaceQuery, usageQuery, jobsQuery, jobStatus)
    } catch (actionError) {
      setError(actionError instanceof Error ? actionError.message : 'Could not retry job.')
    } finally {
      setActingJobId('')
    }
  }

  const onReconcileUserLibrary = async (userId: string) => {
    const token = getAuthSessionToken()
    if (!token) {
      navigate('/auth', { replace: true })
      return
    }
    setReconcilingUserId(userId)
    setError('')
    setStatus('')
    try {
      const payload = await reconcileAdminUserLibrary(token, userId)
      const beforeCount = Number(payload.owned_assets_before || 0)
      const afterCount = Number(payload.owned_assets_after || 0)
      setStatus(`${payload.message} Owned assets: ${beforeCount} -> ${afterCount}.`)
      await loadData(userQuery, organisationQuery, workspaceQuery, usageQuery, jobsQuery, jobStatus)
    } catch (actionError) {
      setError(actionError instanceof Error ? actionError.message : 'Could not reconcile user library.')
    } finally {
      setReconcilingUserId('')
    }
  }

  const usersItems = users?.items || []
  const organisationItems = organisations?.items || []
  const selectedOrganisation =
    organisationItems.find((item) => item.id === selectedOrganisationId) || organisationItems[0] || null
  const workspaceItems = workspaces?.items || []
  const selectedWorkspace =
    workspaceItems.find((item) => item.id === selectedWorkspaceId) || workspaceItems[0] || null
  const usageSummary = usageCosts?.summary || null
  const usageModelItems = usageCosts?.model_usage || []
  const usageToolItems = usageCosts?.tool_usage || []
  const usageOrganisationItems = usageCosts?.organisation_usage || []
  const usageUserItems = usageCosts?.user_usage || []
  const usageTrendItems = usageCosts?.monthly_trend || []
  const jobsItems = jobs?.items || []
  const auditItems = auditEvents?.items || []

  const metrics = useMemo(
    () => [
      {
        label: 'Active users (24h)',
        value: overview?.active_users_24h ?? 0,
      },
      {
        label: 'Active users (7d)',
        value: overview?.active_users_7d ?? 0,
      },
      {
        label: 'Active users (30d)',
        value: overview?.active_users_30d ?? 0,
      },
      {
        label: '7d retention',
        value: formatPercent(overview?.retention_7d_pct),
      },
      {
        label: '30d retention',
        value: formatPercent(overview?.retention_30d_pct),
      },
    ],
    [overview],
  )

  const organisationMetrics = useMemo(() => {
    const totalMembers = organisationItems.reduce((sum, item) => sum + item.member_count, 0)
    const totalProjects = organisationItems.reduce((sum, item) => sum + item.project_count, 0)
    const totalCurrentCost = organisationItems.reduce((sum, item) => sum + item.cost_usd_current_month, 0)
    const totalStorageBytes = organisationItems.reduce((sum, item) => sum + item.storage_bytes_current, 0)
    return [
      { label: 'Organisations', value: formatInteger(organisations?.total || 0), icon: Building2 },
      { label: 'Members', value: formatInteger(totalMembers), icon: Users },
      { label: 'Projects', value: formatInteger(totalProjects), icon: Workflow },
      { label: 'Current month cost', value: formatCurrency(totalCurrentCost), icon: BadgeDollarSign },
      { label: 'Storage footprint', value: formatBytes(totalStorageBytes), icon: HardDrive },
    ]
  }, [organisationItems, organisations?.total])

  const workspaceMetrics = useMemo(() => {
    const totalProjects = workspaceItems.reduce((sum, item) => sum + item.project_count, 0)
    const totalMembers = workspaceItems.reduce((sum, item) => sum + item.member_count, 0)
    const totalStorageBytes = workspaceItems.reduce((sum, item) => sum + item.storage_bytes, 0)
    const totalActiveRuns = workspaceItems.reduce((sum, item) => sum + item.job_health.active_runs, 0)
    return [
      { label: 'Workspaces', value: formatInteger(workspaces?.total || 0), icon: Workflow },
      { label: 'Projects', value: formatInteger(totalProjects), icon: Database },
      { label: 'Members', value: formatInteger(totalMembers), icon: Users },
      { label: 'Active jobs', value: formatInteger(totalActiveRuns), icon: Activity },
      { label: 'Storage footprint', value: formatBytes(totalStorageBytes), icon: HardDrive },
    ]
  }, [workspaceItems, workspaces?.total])

  const statusCounts = useMemo(() => {
    return {
      live: CAPABILITY_SECTIONS.filter((item) => item.status === 'live').length,
      partial: CAPABILITY_SECTIONS.filter((item) => item.status === 'partial').length,
      planned: CAPABILITY_SECTIONS.filter((item) => item.status === 'planned').length,
    }
  }, [])

  const laneCounts = useMemo(() => {
    return {
      now: CAPABILITY_SECTIONS.filter((item) => item.lane === 'now').length,
      next: CAPABILITY_SECTIONS.filter((item) => item.lane === 'next').length,
      later: CAPABILITY_SECTIONS.filter((item) => item.lane === 'later').length,
    }
  }, [])

  if (!activeCapability) {
    return null
  }

  return (
    <section className="min-h-screen bg-[radial-gradient(circle_at_top_left,hsl(var(--tone-accent-100)/0.42),transparent_42%),linear-gradient(180deg,hsl(var(--tone-neutral-50)),hsl(var(--tone-neutral-100)/0.55))] px-4 py-5 md:px-6 md:py-8">
      <div className="mx-auto w-full max-w-7xl space-y-4">
        <header className="rounded-xl border border-[hsl(var(--tone-neutral-200))] bg-card/90 p-4 shadow-sm backdrop-blur">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="space-y-1">
              <p className="inline-flex items-center gap-1 rounded-full border border-[hsl(var(--tone-warning-300))] bg-[linear-gradient(135deg,hsl(var(--tone-warning-100)),hsl(var(--tone-warning-200)))] px-2.5 py-1 text-micro font-semibold uppercase tracking-[0.16em] text-[hsl(var(--tone-warning-900))] shadow-sm">
                <ShieldCheck className="h-3.5 w-3.5" />
                Admin Mode
              </p>
              <h1 className="text-2xl font-semibold tracking-tight text-[hsl(var(--tone-neutral-900))]">Operations Console</h1>
              <p className="text-sm text-muted-foreground">
                Section: {activeCapability.title} | Last refresh: {formatTimestamp(overview?.generated_at)}
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Button type="button" variant="outline" onClick={() => navigate('/workspaces')}>
                <ArrowLeft className="mr-1.5 h-4 w-4" />
                Return to main site
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={() => void loadData(userQuery, organisationQuery, workspaceQuery, usageQuery, jobsQuery, jobStatus)}
                disabled={loading}
              >
                {loading ? 'Refreshing...' : 'Refresh'}
              </Button>
            </div>
          </div>
        </header>

        <div className="grid gap-4 nav:grid-cols-[280px_minmax(0,1fr)]">
          <aside className="self-start rounded-xl border border-[hsl(var(--tone-neutral-200))] bg-card p-3">
            <div className="space-y-1 border-b border-[hsl(var(--tone-neutral-200))] pb-3">
              <p className="text-sm font-semibold text-[hsl(var(--tone-neutral-900))]">Admin navigation</p>
              <p className="text-sm text-muted-foreground">Modular sections with lane planning for parallel delivery.</p>
            </div>
            <div className="mt-3 space-y-3">
              {ADMIN_NAV_GROUPS.map((group) => (
                <div key={group.title} className="space-y-1.5">
                  <p className="text-sm font-semibold uppercase tracking-[0.08em] text-muted-foreground">{group.title}</p>
                  <div className="space-y-1">
                    {group.items.map((itemId) => {
                      const section = findCapability(itemId)
                      if (!section) {
                        return null
                      }
                      const SectionIcon = section.icon
                      const selected = section.id === activeCapability.id
                      return (
                        <button
                          key={section.id}
                          type="button"
                          className={cn(
                            'flex w-full items-center justify-between gap-2 rounded-md border px-2.5 py-2 text-left transition-colors',
                            selected
                              ? 'border-[hsl(var(--tone-accent-300))] bg-[hsl(var(--tone-accent-50))]'
                              : 'border-[hsl(var(--tone-neutral-200))] bg-[hsl(var(--tone-neutral-50))] hover:bg-[hsl(var(--tone-neutral-100))]',
                          )}
                          onClick={() => setActiveSection(section.id)}
                        >
                          <span className="flex min-w-0 items-center gap-2">
                            <SectionIcon className="h-4 w-4 shrink-0 text-[hsl(var(--tone-accent-700))]" />
                            <span className="truncate text-sm font-medium text-[hsl(var(--tone-neutral-900))]">{section.title}</span>
                          </span>
                          <span className="inline-flex rounded-full border border-[hsl(var(--tone-neutral-300))] bg-card px-1.5 py-0.5 text-micro font-semibold uppercase tracking-[0.06em] text-[hsl(var(--tone-neutral-700))]">
                            {laneLabel(section.lane)}
                          </span>
                        </button>
                      )
                    })}
                  </div>
                </div>
              ))}
            </div>
          </aside>

          <main className="space-y-4">
            <Card className="border-[hsl(var(--tone-neutral-200))]">
              <CardHeader className="pb-2">
                <CardTitle>Parallel delivery board</CardTitle>
                <CardDescription>Live status and lane split across all admin domains.</CardDescription>
              </CardHeader>
              <CardContent className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                <div className="rounded-md border border-[hsl(var(--tone-neutral-200))] bg-[hsl(var(--tone-neutral-50))] px-3 py-2">
                  <p className="text-sm uppercase tracking-wide text-muted-foreground">Live / Partial / Planned</p>
                  <p className="text-xl font-semibold text-[hsl(var(--tone-neutral-900))]">
                    {statusCounts.live} / {statusCounts.partial} / {statusCounts.planned}
                  </p>
                </div>
                <div className="rounded-md border border-[hsl(var(--tone-neutral-200))] bg-[hsl(var(--tone-neutral-50))] px-3 py-2">
                  <p className="text-sm uppercase tracking-wide text-muted-foreground">Now lane</p>
                  <p className="text-xl font-semibold text-[hsl(var(--tone-neutral-900))]">{laneCounts.now}</p>
                </div>
                <div className="rounded-md border border-[hsl(var(--tone-neutral-200))] bg-[hsl(var(--tone-neutral-50))] px-3 py-2">
                  <p className="text-sm uppercase tracking-wide text-muted-foreground">Next / Later lanes</p>
                  <p className="text-xl font-semibold text-[hsl(var(--tone-neutral-900))]">
                    {laneCounts.next} / {laneCounts.later}
                  </p>
                </div>
              </CardContent>
            </Card>

            {activeCapability.id === 'overview' ? (
              <Card className="border-[hsl(var(--tone-neutral-200))]">
                <CardHeader className="pb-2">
                  <CardTitle>What matters this week</CardTitle>
                  <CardDescription>
                    Live metrics where available, plus operational placeholders for pending data sources.
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
                    {metrics.map((item) => (
                      <div key={item.label} className="rounded-md border border-[hsl(var(--tone-neutral-200))] bg-[hsl(var(--tone-neutral-50))] px-3 py-2">
                        <p className="text-sm uppercase tracking-wide text-muted-foreground">{item.label}</p>
                        <p className="text-2xl font-semibold text-[hsl(var(--tone-neutral-900))]">{item.value}</p>
                      </div>
                    ))}
                  </div>
                  <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                    <div className="rounded-md border border-[hsl(var(--tone-neutral-200))] px-3 py-2">
                      <p className="text-sm uppercase tracking-wide text-muted-foreground">Error rate</p>
                      <p className="text-sm text-muted-foreground">Pending service-level metric feed</p>
                    </div>
                    <div className="rounded-md border border-[hsl(var(--tone-neutral-200))] px-3 py-2">
                      <p className="text-sm uppercase tracking-wide text-muted-foreground">Latency p95</p>
                      <p className="text-sm text-muted-foreground">Pending request telemetry feed</p>
                    </div>
                    <div className="rounded-md border border-[hsl(var(--tone-neutral-200))] px-3 py-2">
                      <p className="text-sm uppercase tracking-wide text-muted-foreground">Queue backlog</p>
                      <p className="text-sm text-muted-foreground">Pending worker/queue instrumentation</p>
                    </div>
                    <div className="rounded-md border border-[hsl(var(--tone-neutral-200))] px-3 py-2">
                      <p className="text-sm uppercase tracking-wide text-muted-foreground">Cost vs revenue</p>
                      <p className="text-sm text-muted-foreground">Pending billing model + cost accounting</p>
                    </div>
                    <div className="rounded-md border border-[hsl(var(--tone-neutral-200))] px-3 py-2">
                      <p className="text-sm uppercase tracking-wide text-muted-foreground">Support SLA</p>
                      <p className="text-sm text-muted-foreground">Pending ticketing integration</p>
                    </div>
                    <div className="rounded-md border border-[hsl(var(--tone-neutral-200))] px-3 py-2">
                      <p className="text-sm uppercase tracking-wide text-muted-foreground">Security alerts</p>
                      <p className="text-sm text-muted-foreground">Failed logins visible, anomaly feed planned</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ) : null}

            {activeCapability.id === 'organisations' ? (
              <>
                <Card className="border-[hsl(var(--tone-neutral-200))]">
                  <CardHeader className="pb-2">
                    <CardTitle>Tenant operations snapshot</CardTitle>
                    <CardDescription>Organisation-level scale controls, usage pressure, and margin visibility.</CardDescription>
                  </CardHeader>
                  <CardContent className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
                    {organisationMetrics.map((item) => (
                      <div key={item.label} className="rounded-md border border-[hsl(var(--tone-neutral-200))] bg-[hsl(var(--tone-neutral-50))] px-3 py-2">
                        <div className="flex items-center gap-2">
                          <item.icon className="h-4 w-4 text-[hsl(var(--tone-accent-700))]" />
                          <p className="text-sm uppercase tracking-wide text-muted-foreground">{item.label}</p>
                        </div>
                        <p className="mt-1 text-xl font-semibold text-[hsl(var(--tone-neutral-900))]">{item.value}</p>
                      </div>
                    ))}
                  </CardContent>
                </Card>

                <Card className="border-[hsl(var(--tone-neutral-200))]">
                  <CardHeader className="pb-2">
                    <CardTitle>Organisations index</CardTitle>
                    <CardDescription>Search tenants by domain/plan and inspect control-plane readiness.</CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <form className="flex flex-wrap items-center gap-2" onSubmit={onOrganisationsSearch}>
                      <div className="relative w-full max-w-md">
                        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                        <Input
                          value={organisationQuery}
                          onChange={(event) => setOrganisationQuery(event.target.value)}
                          placeholder="Search by domain or plan"
                          className="pl-9"
                        />
                      </div>
                      <Button type="submit" disabled={loading}>
                        {loading ? 'Loading...' : 'Search'}
                      </Button>
                    </form>

                    {organisationItems.length ? (
                      <div className="overflow-x-auto rounded-lg border border-[hsl(var(--tone-neutral-200))]">
                        <table className="w-full min-w-full text-left text-sm">
                          <thead className="bg-[hsl(var(--tone-neutral-100))] text-sm uppercase tracking-wide text-muted-foreground">
                            <tr>
                              <th className="px-3 py-2">Organisation</th>
                              <th className="px-3 py-2">Plan</th>
                              <th className="px-3 py-2">Members</th>
                              <th className="px-3 py-2">Workspaces</th>
                              <th className="px-3 py-2">Projects</th>
                              <th className="px-3 py-2">Month spend</th>
                              <th className="px-3 py-2">Token trend</th>
                            </tr>
                          </thead>
                          <tbody>
                            {organisationItems.map((item) => {
                              const selected = selectedOrganisation?.id === item.id
                              return (
                                <tr
                                  key={item.id}
                                  className={cn(
                                    'cursor-pointer border-t border-[hsl(var(--tone-neutral-200))]',
                                    selected ? 'bg-[hsl(var(--tone-accent-50))]' : 'hover:bg-[hsl(var(--tone-neutral-50))]',
                                  )}
                                  onClick={() => setSelectedOrganisationId(item.id)}
                                >
                                  <td className="px-3 py-2">
                                    <p className="font-medium text-[hsl(var(--tone-neutral-900))]">{item.name}</p>
                                    <p className="text-xs text-muted-foreground">{item.domain}</p>
                                  </td>
                                  <td className="px-3 py-2">
                                    <span className="inline-flex rounded-full border border-[hsl(var(--tone-neutral-300))] bg-[hsl(var(--tone-neutral-100))] px-2 py-0.5 text-micro font-semibold uppercase tracking-[0.08em] text-[hsl(var(--tone-neutral-700))]">
                                      {item.plan}
                                    </span>
                                  </td>
                                  <td className="px-3 py-2 text-[hsl(var(--tone-neutral-700))]">{formatInteger(item.member_count)}</td>
                                  <td className="px-3 py-2 text-[hsl(var(--tone-neutral-700))]">{formatInteger(item.workspace_count)}</td>
                                  <td className="px-3 py-2 text-[hsl(var(--tone-neutral-700))]">{formatInteger(item.project_count)}</td>
                                  <td className="px-3 py-2 text-[hsl(var(--tone-neutral-700))]">{formatCurrency(item.cost_usd_current_month)}</td>
                                  <td className="px-3 py-2">
                                    <span
                                      className={cn(
                                        'inline-flex rounded-full border px-2 py-0.5 text-micro font-semibold',
                                        item.usage_tokens_trend_pct >= 0
                                          ? 'border-[hsl(var(--tone-positive-300))] bg-[hsl(var(--tone-positive-50))] text-[hsl(var(--tone-positive-700))]'
                                          : 'border-[hsl(var(--tone-danger-300))] bg-[hsl(var(--tone-danger-50))] text-[hsl(var(--tone-danger-700))]',
                                      )}
                                    >
                                      {formatPercent(item.usage_tokens_trend_pct)}
                                    </span>
                                  </td>
                                </tr>
                              )
                            })}
                          </tbody>
                        </table>
                      </div>
                    ) : (
                      <p className="text-sm text-muted-foreground">No organisations matched the current filter.</p>
                    )}
                  </CardContent>
                </Card>

                {selectedOrganisation ? (
                  <div className="grid gap-4 xl:grid-cols-2">
                    <Card className="border-[hsl(var(--tone-neutral-200))]">
                      <CardHeader className="pb-2">
                        <CardTitle className="flex items-center gap-2">
                          <Globe2 className="h-4 w-4 text-[hsl(var(--tone-accent-700))]" />
                          Organisation profile
                        </CardTitle>
                        <CardDescription>{selectedOrganisation.name} ({selectedOrganisation.domain})</CardDescription>
                      </CardHeader>
                      <CardContent className="space-y-2 text-sm">
                        <div className="grid gap-2 sm:grid-cols-2">
                          <div className="rounded-md border border-[hsl(var(--tone-neutral-200))] px-3 py-2">
                            <p className="text-sm uppercase tracking-wide text-muted-foreground">Billing status</p>
                            <p className="font-semibold text-[hsl(var(--tone-neutral-900))]">{selectedOrganisation.billing_status}</p>
                          </div>
                          <div className="rounded-md border border-[hsl(var(--tone-neutral-200))] px-3 py-2">
                            <p className="text-sm uppercase tracking-wide text-muted-foreground">Members / Admins</p>
                            <p className="font-semibold text-[hsl(var(--tone-neutral-900))]">
                              {formatInteger(selectedOrganisation.member_count)} / {formatInteger(selectedOrganisation.admin_count)}
                            </p>
                          </div>
                          <div className="rounded-md border border-[hsl(var(--tone-neutral-200))] px-3 py-2">
                            <p className="text-sm uppercase tracking-wide text-muted-foreground">Rate limit</p>
                            <p className="font-semibold text-[hsl(var(--tone-neutral-900))]">
                              {formatInteger(selectedOrganisation.rate_limit_rpm)} rpm
                            </p>
                          </div>
                          <div className="rounded-md border border-[hsl(var(--tone-neutral-200))] px-3 py-2">
                            <p className="text-sm uppercase tracking-wide text-muted-foreground">Data retention</p>
                            <p className="font-semibold text-[hsl(var(--tone-neutral-900))]">
                              {formatInteger(selectedOrganisation.data_retention_days)} days
                            </p>
                          </div>
                        </div>
                        <div className="rounded-md border border-[hsl(var(--tone-neutral-200))] px-3 py-2">
                          <p className="text-sm uppercase tracking-wide text-muted-foreground">Token / storage quotas</p>
                          <p className="font-semibold text-[hsl(var(--tone-neutral-900))]">
                            {formatInteger(selectedOrganisation.monthly_token_quota)} tokens / {formatInteger(selectedOrganisation.storage_quota_gb)} GB
                          </p>
                        </div>
                        <div className="rounded-md border border-[hsl(var(--tone-neutral-200))] px-3 py-2">
                          <p className="text-sm uppercase tracking-wide text-muted-foreground">Last active</p>
                          <p className="font-semibold text-[hsl(var(--tone-neutral-900))]">{formatTimestamp(selectedOrganisation.last_active_at)}</p>
                        </div>
                      </CardContent>
                    </Card>

                    <Card className="border-[hsl(var(--tone-neutral-200))]">
                      <CardHeader className="pb-2">
                        <CardTitle className="flex items-center gap-2">
                          <LineChart className="h-4 w-4 text-[hsl(var(--tone-accent-700))]" />
                          Usage and cost controls
                        </CardTitle>
                        <CardDescription>Current-month health with previous-month trend deltas.</CardDescription>
                      </CardHeader>
                      <CardContent className="space-y-2 text-sm">
                        <div className="grid gap-2 sm:grid-cols-2">
                          <div className="rounded-md border border-[hsl(var(--tone-neutral-200))] px-3 py-2">
                            <p className="text-sm uppercase tracking-wide text-muted-foreground">Tokens (month)</p>
                            <p className="font-semibold text-[hsl(var(--tone-neutral-900))]">{formatInteger(selectedOrganisation.usage_tokens_current_month)}</p>
                            <p className="text-xs text-muted-foreground">
                              Prev: {formatInteger(selectedOrganisation.usage_tokens_previous_month)} ({formatPercent(selectedOrganisation.usage_tokens_trend_pct)})
                            </p>
                          </div>
                          <div className="rounded-md border border-[hsl(var(--tone-neutral-200))] px-3 py-2">
                            <p className="text-sm uppercase tracking-wide text-muted-foreground">Tool calls (month)</p>
                            <p className="font-semibold text-[hsl(var(--tone-neutral-900))]">{formatInteger(selectedOrganisation.usage_tool_calls_current_month)}</p>
                          </div>
                          <div className="rounded-md border border-[hsl(var(--tone-neutral-200))] px-3 py-2">
                            <p className="text-sm uppercase tracking-wide text-muted-foreground">Cost (month)</p>
                            <p className="font-semibold text-[hsl(var(--tone-neutral-900))]">{formatCurrency(selectedOrganisation.cost_usd_current_month)}</p>
                            <p className="text-xs text-muted-foreground">
                              Prev: {formatCurrency(selectedOrganisation.cost_usd_previous_month)} ({formatPercent(selectedOrganisation.cost_trend_pct)})
                            </p>
                          </div>
                          <div className="rounded-md border border-[hsl(var(--tone-neutral-200))] px-3 py-2">
                            <p className="text-sm uppercase tracking-wide text-muted-foreground">Gross margin snapshot</p>
                            <p className="font-semibold text-[hsl(var(--tone-neutral-900))]">{formatPercent(selectedOrganisation.gross_margin_pct)}</p>
                          </div>
                        </div>
                        <div className="rounded-md border border-[hsl(var(--tone-neutral-200))] px-3 py-2">
                          <p className="text-sm uppercase tracking-wide text-muted-foreground">Storage footprint</p>
                          <p className="font-semibold text-[hsl(var(--tone-neutral-900))]">{formatBytes(selectedOrganisation.storage_bytes_current)}</p>
                        </div>
                        <div className="rounded-md border border-[hsl(var(--tone-neutral-200))] px-3 py-2">
                          <p className="text-sm uppercase tracking-wide text-muted-foreground">3-month usage trend</p>
                          <div className="mt-2 space-y-1">
                            {selectedOrganisation.monthly_usage_trend.map((point) => (
                              <div key={point.month} className="grid grid-cols-[88px_minmax(0,1fr)] gap-2 text-sm text-[hsl(var(--tone-neutral-700))]">
                                <span className="font-medium text-[hsl(var(--tone-neutral-900))]">{point.month}</span>
                                <span>
                                  {formatInteger(point.tokens)} tokens | {formatInteger(point.tool_calls)} calls | {formatCurrency(point.cost_usd)}
                                </span>
                              </div>
                            ))}
                          </div>
                        </div>
                      </CardContent>
                    </Card>

                    <Card className="border-[hsl(var(--tone-neutral-200))] xl:col-span-2">
                      <CardHeader className="pb-2">
                        <CardTitle>Flags, integrations, and internal controls</CardTitle>
                        <CardDescription>Rollout guardrails and operational actions for this tenant.</CardDescription>
                      </CardHeader>
                      <CardContent className="grid gap-4 xl:grid-cols-[1.2fr_1fr_1fr]">
                        <div className="rounded-md border border-[hsl(var(--tone-neutral-200))] px-3 py-2">
                          <p className="mb-2 flex items-center gap-2 text-sm uppercase tracking-wide text-muted-foreground">
                            <Flag className="h-4 w-4" />
                            Feature flags
                          </p>
                          <div className="flex flex-wrap gap-1.5">
                            {selectedOrganisation.feature_flags_enabled.length ? (
                              selectedOrganisation.feature_flags_enabled.map((flag) => (
                                <span
                                  key={flag}
                                  className="inline-flex rounded-full border border-[hsl(var(--tone-accent-300))] bg-[hsl(var(--tone-accent-50))] px-2 py-0.5 text-micro font-semibold uppercase tracking-[0.08em] text-[hsl(var(--tone-accent-800))]"
                                >
                                  {flag}
                                </span>
                              ))
                            ) : (
                              <p className="text-sm text-muted-foreground">No flags are currently enabled.</p>
                            )}
                          </div>
                        </div>

                        <div className="rounded-md border border-[hsl(var(--tone-neutral-200))] px-3 py-2">
                          <p className="mb-2 flex items-center gap-2 text-sm uppercase tracking-wide text-muted-foreground">
                            <KeyRound className="h-4 w-4" />
                            Integrations
                          </p>
                          <div className="space-y-2">
                            {selectedOrganisation.integrations.map((integration) => (
                              <div key={integration.key} className="rounded-md border border-[hsl(var(--tone-neutral-200))] px-2 py-1.5">
                                <div className="flex flex-wrap items-center gap-1.5">
                                  <span className="text-sm font-semibold uppercase tracking-[0.08em] text-[hsl(var(--tone-neutral-900))]">{integration.key}</span>
                                  <span className={`inline-flex rounded-full border px-1.5 py-0.5 text-micro font-semibold uppercase tracking-[0.08em] ${integrationStatusClass(integration.status)}`}>
                                    {integration.status}
                                  </span>
                                </div>
                                <p className="text-xs text-muted-foreground">
                                  {formatInteger(integration.connected_members)} connected | Last sync {formatTimestamp(integration.last_sync_at)}
                                </p>
                              </div>
                            ))}
                          </div>
                        </div>

                        <div className="rounded-md border border-[hsl(var(--tone-neutral-200))] px-3 py-2">
                          <p className="mb-2 flex items-center gap-2 text-sm uppercase tracking-wide text-muted-foreground">
                            <TriangleAlert className="h-4 w-4" />
                            Internal controls
                          </p>
                          <p className="text-sm text-[hsl(var(--tone-neutral-700))]">
                            {selectedOrganisation.impersonation.note}
                          </p>
                          <p className="mt-1 text-xs text-muted-foreground">
                            Last event: {formatTimestamp(selectedOrganisation.impersonation.last_event_at)}
                          </p>
                          <Button
                            type="button"
                            variant="outline"
                            className="mt-3 w-full"
                            disabled={loading || impersonatingOrganisationId === selectedOrganisation.id}
                            onClick={() => void onImpersonateOrganisation()}
                          >
                            {impersonatingOrganisationId === selectedOrganisation.id
                              ? 'Creating ticket...'
                              : 'Impersonate org admin (audited)'}
                          </Button>
                        </div>
                      </CardContent>
                    </Card>
                  </div>
                ) : null}
              </>
            ) : null}

            {activeCapability.id === 'workspaces' ? (
              <>
                <Card className="border-[hsl(var(--tone-neutral-200))]">
                  <CardHeader className="pb-2">
                    <CardTitle>Workspace operations snapshot</CardTitle>
                    <CardDescription>Ownership, project load, dataset footprint, and run pressure.</CardDescription>
                  </CardHeader>
                  <CardContent className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
                    {workspaceMetrics.map((item) => (
                      <div key={item.label} className="rounded-md border border-[hsl(var(--tone-neutral-200))] bg-[hsl(var(--tone-neutral-50))] px-3 py-2">
                        <div className="flex items-center gap-2">
                          <item.icon className="h-4 w-4 text-[hsl(var(--tone-accent-700))]" />
                          <p className="text-sm uppercase tracking-wide text-muted-foreground">{item.label}</p>
                        </div>
                        <p className="mt-1 text-xl font-semibold text-[hsl(var(--tone-neutral-900))]">{item.value}</p>
                      </div>
                    ))}
                  </CardContent>
                </Card>

                <Card className="border-[hsl(var(--tone-neutral-200))]">
                  <CardHeader className="pb-2">
                    <CardTitle>Workspaces index</CardTitle>
                    <CardDescription>Search by workspace slug, owner, or project title.</CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <form className="flex flex-wrap items-center gap-2" onSubmit={onWorkspacesSearch}>
                      <div className="relative w-full max-w-md">
                        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                        <Input
                          value={workspaceQuery}
                          onChange={(event) => setWorkspaceQuery(event.target.value)}
                          placeholder="Search by workspace ID or owner"
                          className="pl-9"
                        />
                      </div>
                      <Button type="submit" disabled={loading}>
                        {loading ? 'Loading...' : 'Search'}
                      </Button>
                    </form>

                    {workspaceItems.length ? (
                      <div className="overflow-x-auto rounded-lg border border-[hsl(var(--tone-neutral-200))]">
                        <table className="w-full min-w-full text-left text-sm">
                          <thead className="bg-[hsl(var(--tone-neutral-100))] text-sm uppercase tracking-wide text-muted-foreground">
                            <tr>
                              <th className="px-3 py-2">Workspace</th>
                              <th className="px-3 py-2">Owner</th>
                              <th className="px-3 py-2">Members</th>
                              <th className="px-3 py-2">Projects</th>
                              <th className="px-3 py-2">Data sources</th>
                              <th className="px-3 py-2">Active jobs</th>
                              <th className="px-3 py-2">Failed (7d)</th>
                              <th className="px-3 py-2">Last activity</th>
                            </tr>
                          </thead>
                          <tbody>
                            {workspaceItems.map((item) => {
                              const selected = selectedWorkspace?.id === item.id
                              return (
                                <tr
                                  key={item.id}
                                  className={cn(
                                    'cursor-pointer border-t border-[hsl(var(--tone-neutral-200))]',
                                    selected ? 'bg-[hsl(var(--tone-accent-50))]' : 'hover:bg-[hsl(var(--tone-neutral-50))]',
                                  )}
                                  onClick={() => setSelectedWorkspaceId(item.id)}
                                >
                                  <td className="px-3 py-2">
                                    <p className="font-medium text-[hsl(var(--tone-neutral-900))]">{item.display_name}</p>
                                    <p className="text-xs text-muted-foreground">{item.id}</p>
                                  </td>
                                  <td className="px-3 py-2 text-[hsl(var(--tone-neutral-700))]">{item.owner_name}</td>
                                  <td className="px-3 py-2 text-[hsl(var(--tone-neutral-700))]">{formatInteger(item.member_count)}</td>
                                  <td className="px-3 py-2 text-[hsl(var(--tone-neutral-700))]">{formatInteger(item.project_count)}</td>
                                  <td className="px-3 py-2 text-[hsl(var(--tone-neutral-700))]">{formatInteger(item.data_sources_count)}</td>
                                  <td className="px-3 py-2 text-[hsl(var(--tone-neutral-700))]">{formatInteger(item.job_health.active_runs)}</td>
                                  <td className="px-3 py-2 text-[hsl(var(--tone-neutral-700))]">{formatInteger(item.job_health.failed_runs_7d)}</td>
                                  <td className="px-3 py-2 text-[hsl(var(--tone-neutral-700))]">{formatTimestamp(item.last_activity_at)}</td>
                                </tr>
                              )
                            })}
                          </tbody>
                        </table>
                      </div>
                    ) : (
                      <p className="text-sm text-muted-foreground">No workspaces matched the current filter.</p>
                    )}
                  </CardContent>
                </Card>

                {selectedWorkspace ? (
                  <div className="grid gap-4 xl:grid-cols-2">
                    <Card className="border-[hsl(var(--tone-neutral-200))]">
                      <CardHeader className="pb-2">
                        <CardTitle>Workspace profile</CardTitle>
                        <CardDescription>{selectedWorkspace.display_name} ({selectedWorkspace.id})</CardDescription>
                      </CardHeader>
                      <CardContent className="space-y-2 text-sm">
                        <div className="grid gap-2 sm:grid-cols-2">
                          <div className="rounded-md border border-[hsl(var(--tone-neutral-200))] px-3 py-2">
                            <p className="text-sm uppercase tracking-wide text-muted-foreground">Owner</p>
                            <p className="font-semibold text-[hsl(var(--tone-neutral-900))]">{selectedWorkspace.owner_name}</p>
                            <p className="text-xs text-muted-foreground">{selectedWorkspace.owner_email || 'No owner email'}</p>
                          </div>
                          <div className="rounded-md border border-[hsl(var(--tone-neutral-200))] px-3 py-2">
                            <p className="text-sm uppercase tracking-wide text-muted-foreground">Members active (30d)</p>
                            <p className="font-semibold text-[hsl(var(--tone-neutral-900))]">
                              {formatInteger(selectedWorkspace.active_members_30d)} / {formatInteger(selectedWorkspace.member_count)}
                            </p>
                          </div>
                          <div className="rounded-md border border-[hsl(var(--tone-neutral-200))] px-3 py-2">
                            <p className="text-sm uppercase tracking-wide text-muted-foreground">Collaboration density</p>
                            <p className="font-semibold text-[hsl(var(--tone-neutral-900))]">{formatPercent(selectedWorkspace.collaboration_density_pct)}</p>
                          </div>
                          <div className="rounded-md border border-[hsl(var(--tone-neutral-200))] px-3 py-2">
                            <p className="text-sm uppercase tracking-wide text-muted-foreground">Storage</p>
                            <p className="font-semibold text-[hsl(var(--tone-neutral-900))]">{formatBytes(selectedWorkspace.storage_bytes)}</p>
                          </div>
                        </div>
                        <div className="rounded-md border border-[hsl(var(--tone-neutral-200))] px-3 py-2">
                          <p className="text-sm uppercase tracking-wide text-muted-foreground">Manuscripts / Exports history</p>
                          <p className="font-semibold text-[hsl(var(--tone-neutral-900))]">
                            {formatInteger(selectedWorkspace.manuscript_count)} / {formatInteger(selectedWorkspace.export_history_count)}
                          </p>
                        </div>
                        <div className="rounded-md border border-[hsl(var(--tone-neutral-200))] px-3 py-2">
                          <p className="text-sm uppercase tracking-wide text-muted-foreground">Last activity</p>
                          <p className="font-semibold text-[hsl(var(--tone-neutral-900))]">{formatTimestamp(selectedWorkspace.last_activity_at)}</p>
                        </div>
                      </CardContent>
                    </Card>

                    <Card className="border-[hsl(var(--tone-neutral-200))]">
                      <CardHeader className="pb-2">
                        <CardTitle>Job and queue health</CardTitle>
                        <CardDescription>Run volume, active load, retries, and failure pressure.</CardDescription>
                      </CardHeader>
                      <CardContent className="space-y-2 text-sm">
                        <div className="grid gap-2 sm:grid-cols-2">
                          <div className="rounded-md border border-[hsl(var(--tone-neutral-200))] px-3 py-2">
                            <p className="text-sm uppercase tracking-wide text-muted-foreground">Total runs</p>
                            <p className="font-semibold text-[hsl(var(--tone-neutral-900))]">{formatInteger(selectedWorkspace.job_health.total_runs)}</p>
                          </div>
                          <div className="rounded-md border border-[hsl(var(--tone-neutral-200))] px-3 py-2">
                            <p className="text-sm uppercase tracking-wide text-muted-foreground">Active runs</p>
                            <p className="font-semibold text-[hsl(var(--tone-neutral-900))]">{formatInteger(selectedWorkspace.job_health.active_runs)}</p>
                          </div>
                          <div className="rounded-md border border-[hsl(var(--tone-neutral-200))] px-3 py-2">
                            <p className="text-sm uppercase tracking-wide text-muted-foreground">Failed runs (7d)</p>
                            <p className="font-semibold text-[hsl(var(--tone-neutral-900))]">{formatInteger(selectedWorkspace.job_health.failed_runs_7d)}</p>
                          </div>
                          <div className="rounded-md border border-[hsl(var(--tone-neutral-200))] px-3 py-2">
                            <p className="text-sm uppercase tracking-wide text-muted-foreground">Retry runs (7d)</p>
                            <p className="font-semibold text-[hsl(var(--tone-neutral-900))]">{formatInteger(selectedWorkspace.job_health.retry_runs_7d)}</p>
                          </div>
                        </div>
                        <div className="rounded-md border border-[hsl(var(--tone-neutral-200))] px-3 py-2">
                          <p className="text-sm uppercase tracking-wide text-muted-foreground">Queue state</p>
                          <p className="font-semibold text-[hsl(var(--tone-neutral-900))]">
                            queued {formatInteger(selectedWorkspace.job_health.queued_runs)} | running {formatInteger(selectedWorkspace.job_health.running_runs)} | completed {formatInteger(selectedWorkspace.job_health.completed_runs)}
                          </p>
                        </div>
                        <div className="rounded-md border border-[hsl(var(--tone-neutral-200))] px-3 py-2">
                          <p className="text-sm uppercase tracking-wide text-muted-foreground">Cost and token averages</p>
                          <p className="font-semibold text-[hsl(var(--tone-neutral-900))]">
                            {formatInteger(selectedWorkspace.job_health.avg_tokens_per_run)} tokens/run | {formatCurrency(selectedWorkspace.job_health.avg_cost_usd_per_run)} / run
                          </p>
                          <p className="text-xs text-muted-foreground">Last run event: {formatTimestamp(selectedWorkspace.job_health.last_job_at)}</p>
                        </div>
                      </CardContent>
                    </Card>

                    <Card className="border-[hsl(var(--tone-neutral-200))] xl:col-span-2">
                      <CardHeader className="pb-2">
                        <CardTitle>Projects in workspace</CardTitle>
                        <CardDescription>Project-level ownership, data/source density, and run activity.</CardDescription>
                      </CardHeader>
                      <CardContent>
                        {selectedWorkspace.projects.length ? (
                          <div className="overflow-x-auto rounded-lg border border-[hsl(var(--tone-neutral-200))]">
                            <table className="w-full min-w-full text-left text-sm">
                              <thead className="bg-[hsl(var(--tone-neutral-100))] text-sm uppercase tracking-wide text-muted-foreground">
                                <tr>
                                  <th className="px-3 py-2">Project</th>
                                  <th className="px-3 py-2">Owner</th>
                                  <th className="px-3 py-2">Collaborators</th>
                                  <th className="px-3 py-2">Manuscripts</th>
                                  <th className="px-3 py-2">Data sources</th>
                                  <th className="px-3 py-2">Job runs</th>
                                  <th className="px-3 py-2">Last run</th>
                                </tr>
                              </thead>
                              <tbody>
                                {selectedWorkspace.projects.map((project) => (
                                  <tr key={project.id} className="border-t border-[hsl(var(--tone-neutral-200))]">
                                    <td className="px-3 py-2">
                                      <p className="font-medium text-[hsl(var(--tone-neutral-900))]">{project.title}</p>
                                      <p className="text-xs text-muted-foreground">{project.id}</p>
                                    </td>
                                    <td className="px-3 py-2 text-[hsl(var(--tone-neutral-700))]">{project.owner_name}</td>
                                    <td className="px-3 py-2 text-[hsl(var(--tone-neutral-700))]">{formatInteger(project.collaborator_count)}</td>
                                    <td className="px-3 py-2 text-[hsl(var(--tone-neutral-700))]">{formatInteger(project.manuscript_count)}</td>
                                    <td className="px-3 py-2 text-[hsl(var(--tone-neutral-700))]">{formatInteger(project.data_sources_count)}</td>
                                    <td className="px-3 py-2 text-[hsl(var(--tone-neutral-700))]">{formatInteger(project.job_runs)}</td>
                                    <td className="px-3 py-2 text-[hsl(var(--tone-neutral-700))]">{project.last_run_status}</td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        ) : (
                          <p className="text-sm text-muted-foreground">No projects are currently attached to this workspace.</p>
                        )}
                      </CardContent>
                    </Card>
                  </div>
                ) : null}
              </>
            ) : null}

            {activeCapability.id === 'users' ? (
              <Card className="border-[hsl(var(--tone-neutral-200))]">
                <CardHeader className="pb-2">
                  <CardTitle>User directory</CardTitle>
                  <CardDescription>Search and inspect account status across the system.</CardDescription>
                </CardHeader>
                <CardContent className="space-y-3">
                  <form className="flex flex-wrap items-center gap-2" onSubmit={onUsersSearch}>
                    <div className="relative w-full max-w-md">
                      <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                      <Input
                        value={userQuery}
                        onChange={(event) => setUserQuery(event.target.value)}
                        placeholder="Search by name or email"
                        className="pl-9"
                      />
                    </div>
                    <Button type="submit" disabled={loading}>
                      {loading ? 'Loading...' : 'Search'}
                    </Button>
                  </form>

                  {usersItems.length ? (
                    <div className="overflow-x-auto rounded-lg border border-[hsl(var(--tone-neutral-200))]">
                      <table className="w-full min-w-full text-left text-sm">
                        <thead className="bg-[hsl(var(--tone-neutral-100))] text-sm uppercase tracking-wide text-muted-foreground">
                          <tr>
                            <th className="px-3 py-2">Name</th>
                            <th className="px-3 py-2">User ID</th>
                            <th className="px-3 py-2">Account key</th>
                            <th className="px-3 py-2">Email</th>
                            <th className="px-3 py-2">Role</th>
                            <th className="px-3 py-2">Status</th>
                            <th className="px-3 py-2">Last sign-in</th>
                            <th className="px-3 py-2">Created</th>
                            <th className="px-3 py-2 text-right">Actions</th>
                          </tr>
                        </thead>
                        <tbody>
                          {usersItems.map((item) => (
                            <tr key={item.id} className="border-t border-[hsl(var(--tone-neutral-200))]">
                              <td className="px-3 py-2">
                                <p className="font-medium text-[hsl(var(--tone-neutral-900))]">{item.name || 'Unnamed user'}</p>
                              </td>
                              <td className="px-3 py-2 text-xs text-[hsl(var(--tone-neutral-700))]">
                                <span className="font-mono">{item.id}</span>
                              </td>
                              <td className="px-3 py-2 text-xs text-[hsl(var(--tone-neutral-700))]">
                                <span className="font-mono">{item.account_key || 'Not set'}</span>
                              </td>
                              <td className="px-3 py-2 text-[hsl(var(--tone-neutral-700))]">{item.email}</td>
                              <td className="px-3 py-2">
                                <span
                                  className={
                                    item.role === 'admin'
                                      ? 'inline-flex rounded-full border border-[hsl(var(--tone-warning-300))] bg-[hsl(var(--tone-warning-100))] px-2 py-0.5 text-micro font-semibold uppercase tracking-[0.08em] text-[hsl(var(--tone-warning-900))]'
                                      : 'inline-flex rounded-full border border-[hsl(var(--tone-neutral-300))] bg-[hsl(var(--tone-neutral-100))] px-2 py-0.5 text-micro font-semibold uppercase tracking-[0.08em] text-[hsl(var(--tone-neutral-700))]'
                                  }
                                >
                                  {item.role}
                                </span>
                              </td>
                              <td className="px-3 py-2">
                                <span
                                  className={
                                    item.is_active
                                      ? 'inline-flex rounded-full border border-[hsl(var(--tone-positive-300))] bg-[hsl(var(--tone-positive-50))] px-2 py-0.5 text-micro font-semibold text-[hsl(var(--tone-positive-700))]'
                                      : 'inline-flex rounded-full border border-[hsl(var(--tone-danger-300))] bg-[hsl(var(--tone-danger-50))] px-2 py-0.5 text-micro font-semibold text-[hsl(var(--tone-danger-700))]'
                                  }
                                >
                                  {item.is_active ? 'active' : 'inactive'}
                                </span>
                              </td>
                              <td className="px-3 py-2 text-[hsl(var(--tone-neutral-700))]">{formatTimestamp(item.last_sign_in_at)}</td>
                              <td className="px-3 py-2 text-[hsl(var(--tone-neutral-700))]">{formatTimestamp(item.created_at)}</td>
                              <td className="px-3 py-2 text-right">
                                <Button
                                  type="button"
                                  size="sm"
                                  variant="outline"
                                  onClick={() => void onReconcileUserLibrary(item.id)}
                                  disabled={reconcilingUserId === item.id}
                                >
                                  {reconcilingUserId === item.id ? 'Reconciling...' : 'Reconcile library'}
                                </Button>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  ) : (
                    <p className="text-sm text-muted-foreground">No users matched the current filter.</p>
                  )}
                </CardContent>
              </Card>
            ) : null}

            {activeCapability.id === 'usage-costs' ? (
              <>
                <Card className="border-[hsl(var(--tone-neutral-200))]">
                  <CardHeader className="pb-2">
                    <CardTitle>Margin and limits snapshot</CardTitle>
                    <CardDescription>Live token, call, cost, quota, and run-health telemetry.</CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <form className="flex flex-wrap items-center gap-2" onSubmit={onUsageSearch}>
                      <div className="relative w-full max-w-md">
                        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                        <Input
                          value={usageQuery}
                          onChange={(event) => setUsageQuery(event.target.value)}
                          placeholder="Filter by org, plan, domain, or user"
                          className="pl-9"
                        />
                      </div>
                      <Button type="submit" disabled={loading}>
                        {loading ? 'Loading...' : 'Apply filter'}
                      </Button>
                    </form>

                    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
                      <div className="rounded-md border border-[hsl(var(--tone-neutral-200))] bg-[hsl(var(--tone-neutral-50))] px-3 py-2">
                        <p className="text-sm uppercase tracking-wide text-muted-foreground">Tokens (month)</p>
                        <p className="text-xl font-semibold text-[hsl(var(--tone-neutral-900))]">
                          {formatInteger(usageSummary?.tokens_current_month || 0)}
                        </p>
                      </div>
                      <div className="rounded-md border border-[hsl(var(--tone-neutral-200))] bg-[hsl(var(--tone-neutral-50))] px-3 py-2">
                        <p className="text-sm uppercase tracking-wide text-muted-foreground">Tool calls (month)</p>
                        <p className="text-xl font-semibold text-[hsl(var(--tone-neutral-900))]">
                          {formatInteger(usageSummary?.tool_calls_current_month || 0)}
                        </p>
                      </div>
                      <div className="rounded-md border border-[hsl(var(--tone-neutral-200))] bg-[hsl(var(--tone-neutral-50))] px-3 py-2">
                        <p className="text-sm uppercase tracking-wide text-muted-foreground">Cost (month)</p>
                        <p className="text-xl font-semibold text-[hsl(var(--tone-neutral-900))]">
                          {formatCurrency(usageSummary?.cost_usd_current_month || 0)}
                        </p>
                      </div>
                      <div className="rounded-md border border-[hsl(var(--tone-neutral-200))] bg-[hsl(var(--tone-neutral-50))] px-3 py-2">
                        <p className="text-sm uppercase tracking-wide text-muted-foreground">Quota breaches</p>
                        <p className="text-xl font-semibold text-[hsl(var(--tone-neutral-900))]">
                          {formatInteger(usageSummary?.quota_breaches_current_month || 0)}
                        </p>
                      </div>
                      <div className="rounded-md border border-[hsl(var(--tone-neutral-200))] bg-[hsl(var(--tone-neutral-50))] px-3 py-2">
                        <p className="text-sm uppercase tracking-wide text-muted-foreground">Budget alerts</p>
                        <p className="text-xl font-semibold text-[hsl(var(--tone-neutral-900))]">
                          {formatInteger(usageSummary?.budget_alerts_current_month || 0)}
                        </p>
                      </div>
                    </div>

                    <div className="grid gap-4 xl:grid-cols-2">
                      <Card className="border-[hsl(var(--tone-neutral-200))]">
                        <CardHeader className="pb-2">
                          <CardTitle>Model and tool usage</CardTitle>
                          <CardDescription>Top drivers for token and cost volume.</CardDescription>
                        </CardHeader>
                        <CardContent className="space-y-3">
                          <div className="overflow-x-auto rounded-lg border border-[hsl(var(--tone-neutral-200))]">
                            <table className="w-full min-w-full text-left text-sm">
                              <thead className="bg-[hsl(var(--tone-neutral-100))] text-sm uppercase tracking-wide text-muted-foreground">
                                <tr>
                                  <th className="px-3 py-2">Model</th>
                                  <th className="px-3 py-2">Tokens</th>
                                  <th className="px-3 py-2">Calls</th>
                                  <th className="px-3 py-2">Cost</th>
                                </tr>
                              </thead>
                              <tbody>
                                {usageModelItems.slice(0, 8).map((item) => (
                                  <tr key={item.model} className="border-t border-[hsl(var(--tone-neutral-200))]">
                                    <td className="px-3 py-2 text-[hsl(var(--tone-neutral-900))]">{item.model}</td>
                                    <td className="px-3 py-2 text-[hsl(var(--tone-neutral-700))]">{formatInteger(item.tokens_current_month)}</td>
                                    <td className="px-3 py-2 text-[hsl(var(--tone-neutral-700))]">{formatInteger(item.tool_calls_current_month)}</td>
                                    <td className="px-3 py-2 text-[hsl(var(--tone-neutral-700))]">{formatCurrency(item.cost_usd_current_month)}</td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>

                          <div className="rounded-md border border-[hsl(var(--tone-neutral-200))] px-3 py-2">
                            <p className="text-sm uppercase tracking-wide text-muted-foreground">Tool classes</p>
                            <div className="mt-1 space-y-1 text-sm text-[hsl(var(--tone-neutral-700))]">
                              {usageToolItems.map((item) => (
                                <p key={item.tool_type}>
                                  {item.tool_type}: {formatInteger(item.calls_current_month)} calls | {formatCurrency(item.cost_usd_current_month)}
                                </p>
                              ))}
                            </div>
                          </div>
                        </CardContent>
                      </Card>

                      <Card className="border-[hsl(var(--tone-neutral-200))]">
                        <CardHeader className="pb-2">
                          <CardTitle>Trend and pressure</CardTitle>
                          <CardDescription>Month-over-month token/cost trend and runtime pressure.</CardDescription>
                        </CardHeader>
                        <CardContent className="space-y-2 text-sm">
                          <div className="rounded-md border border-[hsl(var(--tone-neutral-200))] px-3 py-2">
                            <p className="text-sm uppercase tracking-wide text-muted-foreground">Storage footprint</p>
                            <p className="font-semibold text-[hsl(var(--tone-neutral-900))]">
                              {formatBytes(usageSummary?.storage_bytes_total || 0)}
                            </p>
                          </div>
                          <div className="rounded-md border border-[hsl(var(--tone-neutral-200))] px-3 py-2">
                            <p className="text-sm uppercase tracking-wide text-muted-foreground">Failed / running runs</p>
                            <p className="font-semibold text-[hsl(var(--tone-neutral-900))]">
                              {formatInteger(usageSummary?.failed_runs_current_month || 0)} / {formatInteger(usageSummary?.running_runs_current || 0)}
                            </p>
                          </div>
                          <div className="rounded-md border border-[hsl(var(--tone-neutral-200))] px-3 py-2">
                            <p className="text-sm uppercase tracking-wide text-muted-foreground">Average chain length</p>
                            <p className="font-semibold text-[hsl(var(--tone-neutral-900))]">
                              {(usageSummary?.avg_chain_length || 0).toFixed(2)}
                            </p>
                          </div>
                          <div className="rounded-md border border-[hsl(var(--tone-neutral-200))] px-3 py-2">
                            <p className="text-sm uppercase tracking-wide text-muted-foreground">6-month trend</p>
                            <div className="mt-1 space-y-1 text-[hsl(var(--tone-neutral-700))]">
                              {usageTrendItems.map((item) => (
                                <p key={item.month}>
                                  {item.month}: {formatInteger(item.tokens)} tokens | {formatInteger(item.tool_calls)} calls | {formatCurrency(item.cost_usd)}
                                </p>
                              ))}
                            </div>
                          </div>
                        </CardContent>
                      </Card>
                    </div>

                    <div className="grid gap-4 xl:grid-cols-2">
                      <Card className="border-[hsl(var(--tone-neutral-200))]">
                        <CardHeader className="pb-2">
                          <CardTitle>Organisation usage</CardTitle>
                        </CardHeader>
                        <CardContent>
                          {usageOrganisationItems.length ? (
                            <div className="overflow-x-auto rounded-lg border border-[hsl(var(--tone-neutral-200))]">
                              <table className="w-full min-w-full text-left text-sm">
                                <thead className="bg-[hsl(var(--tone-neutral-100))] text-sm uppercase tracking-wide text-muted-foreground">
                                  <tr>
                                    <th className="px-3 py-2">Org</th>
                                    <th className="px-3 py-2">Plan</th>
                                    <th className="px-3 py-2">Tokens</th>
                                    <th className="px-3 py-2">Cost</th>
                                    <th className="px-3 py-2">Quota used</th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {usageOrganisationItems.slice(0, 10).map((item) => (
                                    <tr key={item.org_id} className="border-t border-[hsl(var(--tone-neutral-200))]">
                                      <td className="px-3 py-2">
                                        <p className="font-medium text-[hsl(var(--tone-neutral-900))]">{item.org_name}</p>
                                        <p className="text-xs text-muted-foreground">{item.domain}</p>
                                      </td>
                                      <td className="px-3 py-2 text-[hsl(var(--tone-neutral-700))]">{item.plan}</td>
                                      <td className="px-3 py-2 text-[hsl(var(--tone-neutral-700))]">{formatInteger(item.tokens_current_month)}</td>
                                      <td className="px-3 py-2 text-[hsl(var(--tone-neutral-700))]">{formatCurrency(item.cost_usd_current_month)}</td>
                                      <td className="px-3 py-2 text-[hsl(var(--tone-neutral-700))]">{formatPercent(item.quota_used_pct)}</td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            </div>
                          ) : (
                            <p className="text-sm text-muted-foreground">No organisation usage matched the current filter.</p>
                          )}
                        </CardContent>
                      </Card>

                      <Card className="border-[hsl(var(--tone-neutral-200))]">
                        <CardHeader className="pb-2">
                          <CardTitle>User usage</CardTitle>
                        </CardHeader>
                        <CardContent>
                          {usageUserItems.length ? (
                            <div className="overflow-x-auto rounded-lg border border-[hsl(var(--tone-neutral-200))]">
                              <table className="w-full min-w-full text-left text-sm">
                                <thead className="bg-[hsl(var(--tone-neutral-100))] text-sm uppercase tracking-wide text-muted-foreground">
                                  <tr>
                                    <th className="px-3 py-2">User</th>
                                    <th className="px-3 py-2">Tokens</th>
                                    <th className="px-3 py-2">Calls</th>
                                    <th className="px-3 py-2">Cost</th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {usageUserItems.slice(0, 10).map((item) => (
                                    <tr key={item.user_id} className="border-t border-[hsl(var(--tone-neutral-200))]">
                                      <td className="px-3 py-2">
                                        <p className="font-medium text-[hsl(var(--tone-neutral-900))]">{item.name}</p>
                                        <p className="text-xs text-muted-foreground">{item.email}</p>
                                      </td>
                                      <td className="px-3 py-2 text-[hsl(var(--tone-neutral-700))]">{formatInteger(item.tokens_current_month)}</td>
                                      <td className="px-3 py-2 text-[hsl(var(--tone-neutral-700))]">{formatInteger(item.tool_calls_current_month)}</td>
                                      <td className="px-3 py-2 text-[hsl(var(--tone-neutral-700))]">{formatCurrency(item.cost_usd_current_month)}</td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            </div>
                          ) : (
                            <p className="text-sm text-muted-foreground">No user usage matched the current filter.</p>
                          )}
                        </CardContent>
                      </Card>
                    </div>
                  </CardContent>
                </Card>
              </>
            ) : null}

            {activeCapability.id === 'jobs' ? (
              <>
                <Card className="border-[hsl(var(--tone-neutral-200))]">
                  <CardHeader className="pb-2">
                    <CardTitle>Queue health and controls</CardTitle>
                    <CardDescription>Live queue backlog, status split, and internal retry/cancel controls.</CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <form className="flex flex-wrap items-center gap-2" onSubmit={onJobsSearch}>
                      <div className="relative w-full max-w-sm">
                        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                        <Input
                          value={jobsQuery}
                          onChange={(event) => setJobsQuery(event.target.value)}
                          placeholder="Search by job, project, workspace, owner"
                          className="pl-9"
                        />
                      </div>
                      <select
                        value={jobStatus}
                        onChange={(event) => setJobStatus(event.target.value)}
                        className="h-10 rounded-md border border-input bg-background px-3 py-2 text-sm"
                      >
                        <option value="all">All statuses</option>
                        <option value="queued">queued</option>
                        <option value="running">running</option>
                        <option value="cancel_requested">cancel_requested</option>
                        <option value="completed">completed</option>
                        <option value="failed">failed</option>
                        <option value="cancelled">cancelled</option>
                      </select>
                      <Button type="submit" disabled={loading}>
                        {loading ? 'Loading...' : 'Apply filter'}
                      </Button>
                    </form>

                    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
                      <div className="rounded-md border border-[hsl(var(--tone-neutral-200))] bg-[hsl(var(--tone-neutral-50))] px-3 py-2">
                        <p className="text-sm uppercase tracking-wide text-muted-foreground">Total</p>
                        <p className="text-xl font-semibold text-[hsl(var(--tone-neutral-900))]">
                          {formatInteger(jobs?.queue_health.total_jobs || 0)}
                        </p>
                      </div>
                      <div className="rounded-md border border-[hsl(var(--tone-neutral-200))] bg-[hsl(var(--tone-neutral-50))] px-3 py-2">
                        <p className="text-sm uppercase tracking-wide text-muted-foreground">Active</p>
                        <p className="text-xl font-semibold text-[hsl(var(--tone-neutral-900))]">
                          {formatInteger(jobs?.queue_health.active_jobs || 0)}
                        </p>
                      </div>
                      <div className="rounded-md border border-[hsl(var(--tone-neutral-200))] bg-[hsl(var(--tone-neutral-50))] px-3 py-2">
                        <p className="text-sm uppercase tracking-wide text-muted-foreground">Backlog</p>
                        <p className="text-xl font-semibold text-[hsl(var(--tone-neutral-900))]">
                          {formatInteger(jobs?.queue_health.backlog_jobs || 0)}
                        </p>
                      </div>
                      <div className="rounded-md border border-[hsl(var(--tone-neutral-200))] bg-[hsl(var(--tone-neutral-50))] px-3 py-2">
                        <p className="text-sm uppercase tracking-wide text-muted-foreground">Retryable</p>
                        <p className="text-xl font-semibold text-[hsl(var(--tone-neutral-900))]">
                          {formatInteger(jobs?.queue_health.retryable_jobs || 0)}
                        </p>
                      </div>
                      <div className="rounded-md border border-[hsl(var(--tone-neutral-200))] bg-[hsl(var(--tone-neutral-50))] px-3 py-2">
                        <p className="text-sm uppercase tracking-wide text-muted-foreground">Failed</p>
                        <p className="text-xl font-semibold text-[hsl(var(--tone-neutral-900))]">
                          {formatInteger(jobs?.queue_health.failed_jobs || 0)}
                        </p>
                      </div>
                    </div>

                    {jobsItems.length ? (
                      <div className="overflow-x-auto rounded-lg border border-[hsl(var(--tone-neutral-200))]">
                        <table className="w-full min-w-full text-left text-sm">
                          <thead className="bg-[hsl(var(--tone-neutral-100))] text-sm uppercase tracking-wide text-muted-foreground">
                            <tr>
                              <th className="px-3 py-2">Job</th>
                              <th className="px-3 py-2">Workspace / Project</th>
                              <th className="px-3 py-2">Owner</th>
                              <th className="px-3 py-2">Status</th>
                              <th className="px-3 py-2">Run</th>
                              <th className="px-3 py-2">Estimates</th>
                              <th className="px-3 py-2">Created</th>
                              <th className="px-3 py-2">Actions</th>
                            </tr>
                          </thead>
                          <tbody>
                            {jobsItems.map((job) => {
                              const canCancel = ['queued', 'running', 'cancel_requested'].includes(job.status)
                              const canRetry = ['failed', 'cancelled'].includes(job.status)
                              return (
                                <tr key={job.id} className="border-t border-[hsl(var(--tone-neutral-200))]">
                                  <td className="px-3 py-2">
                                    <p className="font-medium text-[hsl(var(--tone-neutral-900))]">{job.id}</p>
                                    <p className="text-xs text-muted-foreground">{job.manuscript_id}</p>
                                  </td>
                                  <td className="px-3 py-2">
                                    <p className="text-[hsl(var(--tone-neutral-900))]">{job.workspace_name}</p>
                                    <p className="text-xs text-muted-foreground">{job.project_title || job.project_id}</p>
                                  </td>
                                  <td className="px-3 py-2">
                                    <p className="text-[hsl(var(--tone-neutral-900))]">{job.owner_name || 'Unknown owner'}</p>
                                    <p className="text-xs text-muted-foreground">{job.owner_email || 'No email'}</p>
                                  </td>
                                  <td className="px-3 py-2 text-[hsl(var(--tone-neutral-700))]">{job.status}</td>
                                  <td className="px-3 py-2 text-[hsl(var(--tone-neutral-700))]">
                                    #{formatInteger(job.run_count)} ({formatInteger(job.retry_count)} retries)
                                  </td>
                                  <td className="px-3 py-2 text-[hsl(var(--tone-neutral-700))]">
                                    {formatInteger(job.estimated_tokens)} tokens | {formatCurrency(job.estimated_cost_usd_high)}
                                  </td>
                                  <td className="px-3 py-2 text-[hsl(var(--tone-neutral-700))]">{formatTimestamp(job.created_at)}</td>
                                  <td className="px-3 py-2">
                                    <div className="flex flex-wrap gap-1.5">
                                      <Button
                                        type="button"
                                        variant="outline"
                                        size="sm"
                                        disabled={loading || actingJobId === job.id || !canCancel}
                                        onClick={() => void onCancelJob(job.id)}
                                      >
                                        {actingJobId === job.id && canCancel ? 'Cancelling...' : 'Cancel'}
                                      </Button>
                                      <Button
                                        type="button"
                                        variant="outline"
                                        size="sm"
                                        disabled={loading || actingJobId === job.id || !canRetry}
                                        onClick={() => void onRetryJob(job.id)}
                                      >
                                        {actingJobId === job.id && canRetry ? 'Retrying...' : 'Retry'}
                                      </Button>
                                    </div>
                                  </td>
                                </tr>
                              )
                            })}
                          </tbody>
                        </table>
                      </div>
                    ) : (
                      <p className="text-sm text-muted-foreground">No jobs matched the current filter.</p>
                    )}
                  </CardContent>
                </Card>
              </>
            ) : null}

            {activeCapability.id === 'security' ? (
              <Card className="border-[hsl(var(--tone-neutral-200))]">
                <CardHeader className="pb-2">
                  <CardTitle>Audit log</CardTitle>
                  <CardDescription>Immutable trail for admin controls, including impersonation and job actions.</CardDescription>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="grid gap-3 sm:grid-cols-3">
                    <div className="rounded-md border border-[hsl(var(--tone-neutral-200))] bg-[hsl(var(--tone-neutral-50))] px-3 py-2">
                      <p className="text-sm uppercase tracking-wide text-muted-foreground">Events</p>
                      <p className="text-xl font-semibold text-[hsl(var(--tone-neutral-900))]">{formatInteger(auditEvents?.total || 0)}</p>
                    </div>
                    <div className="rounded-md border border-[hsl(var(--tone-neutral-200))] bg-[hsl(var(--tone-neutral-50))] px-3 py-2">
                      <p className="text-sm uppercase tracking-wide text-muted-foreground">Success</p>
                      <p className="text-xl font-semibold text-[hsl(var(--tone-neutral-900))]">
                        {formatInteger(auditEvents?.summary.success_count || 0)}
                      </p>
                    </div>
                    <div className="rounded-md border border-[hsl(var(--tone-neutral-200))] bg-[hsl(var(--tone-neutral-50))] px-3 py-2">
                      <p className="text-sm uppercase tracking-wide text-muted-foreground">Failure</p>
                      <p className="text-xl font-semibold text-[hsl(var(--tone-neutral-900))]">
                        {formatInteger(auditEvents?.summary.failure_count || 0)}
                      </p>
                    </div>
                  </div>

                  {auditItems.length ? (
                    <div className="overflow-x-auto rounded-lg border border-[hsl(var(--tone-neutral-200))]">
                      <table className="w-full min-w-full text-left text-sm">
                        <thead className="bg-[hsl(var(--tone-neutral-100))] text-sm uppercase tracking-wide text-muted-foreground">
                          <tr>
                            <th className="px-3 py-2">When</th>
                            <th className="px-3 py-2">Action</th>
                            <th className="px-3 py-2">Target</th>
                            <th className="px-3 py-2">Actor</th>
                            <th className="px-3 py-2">Status</th>
                          </tr>
                        </thead>
                        <tbody>
                          {auditItems.slice(0, 100).map((item) => (
                            <tr key={item.id} className="border-t border-[hsl(var(--tone-neutral-200))]">
                              <td className="px-3 py-2 text-[hsl(var(--tone-neutral-700))]">{formatTimestamp(item.created_at)}</td>
                              <td className="px-3 py-2 text-[hsl(var(--tone-neutral-900))]">{item.action}</td>
                              <td className="px-3 py-2">
                                <p className="text-[hsl(var(--tone-neutral-900))]">{item.target_type}</p>
                                <p className="text-xs text-muted-foreground">{item.target_id}</p>
                              </td>
                              <td className="px-3 py-2">
                                <p className="text-[hsl(var(--tone-neutral-900))]">{item.actor_name}</p>
                                <p className="text-xs text-muted-foreground">{item.actor_email || 'System'}</p>
                              </td>
                              <td className="px-3 py-2">
                                <span
                                  className={
                                    item.status === 'success'
                                      ? 'inline-flex rounded-full border border-[hsl(var(--tone-positive-300))] bg-[hsl(var(--tone-positive-50))] px-2 py-0.5 text-micro font-semibold text-[hsl(var(--tone-positive-700))]'
                                      : 'inline-flex rounded-full border border-[hsl(var(--tone-danger-300))] bg-[hsl(var(--tone-danger-50))] px-2 py-0.5 text-micro font-semibold text-[hsl(var(--tone-danger-700))]'
                                  }
                                >
                                  {item.status}
                                </span>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  ) : (
                    <p className="text-sm text-muted-foreground">No audit events available yet.</p>
                  )}
                </CardContent>
              </Card>
            ) : null}

            {activeCapability.id !== 'overview' &&
            activeCapability.id !== 'organisations' &&
            activeCapability.id !== 'workspaces' &&
            activeCapability.id !== 'users' &&
            activeCapability.id !== 'usage-costs' &&
            activeCapability.id !== 'jobs' &&
            activeCapability.id !== 'security' ? (
              <Card className="border-[hsl(var(--tone-neutral-200))]">
                <CardHeader className="pb-2">
                  <div className="flex items-center justify-between gap-2">
                    <CardTitle className="flex items-center gap-2">
                      <activeCapability.icon className="h-4 w-4 text-[hsl(var(--tone-accent-700))]" />
                      {activeCapability.title}
                    </CardTitle>
                    <div className="flex items-center gap-1.5">
                      <span className={`inline-flex rounded-full border px-2 py-0.5 text-micro font-semibold uppercase tracking-[0.08em] ${statusChipClass(activeCapability.status)}`}>
                        {activeCapability.status}
                      </span>
                      <span className={`inline-flex rounded-full border px-2 py-0.5 text-micro font-semibold uppercase tracking-[0.08em] ${laneChipClass(activeCapability.lane)}`}>
                        {laneLabel(activeCapability.lane)}
                      </span>
                    </div>
                  </div>
                  <CardDescription>{activeCapability.summary}</CardDescription>
                </CardHeader>
                <CardContent className="space-y-2">
                  <ul className="space-y-1.5 text-sm text-[hsl(var(--tone-neutral-700))]">
                    {activeCapability.items.map((item) => (
                      <li key={item} className="flex items-start gap-2">
                        <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-[hsl(var(--tone-accent-500))]" />
                        <span>{item}</span>
                      </li>
                    ))}
                  </ul>
                </CardContent>
              </Card>
            ) : null}

            <Card className="border-[hsl(var(--tone-neutral-200))]">
              <CardHeader className="pb-2">
                <CardTitle>Parallel feature controls</CardTitle>
                <CardDescription>
                  Every major admin/site change should ship code, documentation, and verification together.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-2 text-sm text-[hsl(var(--tone-neutral-700))]">
                <p>Minimum delivery bundle:</p>
                <ul className="space-y-1">
                  <li className="flex items-start gap-2">
                    <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-[hsl(var(--tone-accent-500))]" />
                    <span>Feature implementation in the relevant lane</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-[hsl(var(--tone-accent-500))]" />
                    <span>Change log + story documentation update</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-[hsl(var(--tone-accent-500))]" />
                    <span>Verification commands recorded in docs</span>
                  </li>
                </ul>
              </CardContent>
            </Card>
          </main>
        </div>

        {status ? <p className="text-sm text-[hsl(var(--tone-positive-700))]">{status}</p> : null}
        {error ? <p className="text-sm text-destructive">{error}</p> : null}
      </div>
    </section>
  )
}
