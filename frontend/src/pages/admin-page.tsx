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
  LifeBuoy,
  Search,
  ServerCog,
  ShieldCheck,
  Users,
  Workflow,
} from 'lucide-react'
import { useNavigate, useParams } from 'react-router-dom'

import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { clearAuthSessionToken, getAuthSessionToken } from '@/lib/auth-session'
import { fetchAdminOverview, fetchAdminUsers } from '@/lib/impact-api'
import { cn } from '@/lib/utils'
import type { AdminOverviewPayload, AdminUsersListPayload } from '@/types/impact'

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
    status: 'planned',
    lane: 'next',
    summary: 'Tenant control plane for plan status, quotas, retention policy, and feature rollout.',
    items: [
      'Org profile, plan, billing status, quotas, and retention policy',
      'Members/roles with last active and monthly usage/cost trend',
      'Feature flags by org and integration health',
      'Internal audited org-admin impersonation',
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
    status: 'planned',
    lane: 'next',
    summary: 'Workspace operations for ownership, data attachments, runs, retries, and exports.',
    items: [
      'Workspace owner/members and status',
      'Data source attachments and storage footprint',
      'Run history with failures/retries',
      'Exports history and collaboration graph',
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
    status: 'planned',
    lane: 'next',
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
    status: 'planned',
    lane: 'next',
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

export function AdminPage() {
  const navigate = useNavigate()
  const params = useParams<{ sectionId?: string }>()
  const [overview, setOverview] = useState<AdminOverviewPayload | null>(null)
  const [users, setUsers] = useState<AdminUsersListPayload | null>(null)
  const [query, setQuery] = useState('')
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
    async (searchQuery: string) => {
      const token = getAuthSessionToken()
      if (!token) {
        navigate('/auth', { replace: true })
        return
      }
      setLoading(true)
      setError('')
      setStatus('')
      try {
        const [overviewPayload, usersPayload] = await Promise.all([
          fetchAdminOverview(token),
          fetchAdminUsers(token, {
            query: searchQuery,
            limit: 50,
            offset: 0,
          }),
        ])
        setOverview(overviewPayload)
        setUsers(usersPayload)
        setStatus(`Loaded ${usersPayload.items.length} of ${usersPayload.total} user accounts.`)
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
    void loadData('')
  }, [loadData])

  const onSearch = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    void loadData(query)
  }

  const usersItems = users?.items || []

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
              <Button type="button" variant="outline" onClick={() => void loadData(query)} disabled={loading}>
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

            {activeCapability.id === 'users' ? (
              <Card className="border-[hsl(var(--tone-neutral-200))]">
                <CardHeader className="pb-2">
                  <CardTitle>User directory</CardTitle>
                  <CardDescription>Search and inspect account status across the system.</CardDescription>
                </CardHeader>
                <CardContent className="space-y-3">
                  <form className="flex flex-wrap items-center gap-2" onSubmit={onSearch}>
                    <div className="relative w-full max-w-md">
                      <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                      <Input
                        value={query}
                        onChange={(event) => setQuery(event.target.value)}
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
                            <th className="px-3 py-2">Email</th>
                            <th className="px-3 py-2">Role</th>
                            <th className="px-3 py-2">Status</th>
                            <th className="px-3 py-2">Last sign-in</th>
                            <th className="px-3 py-2">Created</th>
                          </tr>
                        </thead>
                        <tbody>
                          {usersItems.map((item) => (
                            <tr key={item.id} className="border-t border-[hsl(var(--tone-neutral-200))]">
                              <td className="px-3 py-2">
                                <p className="font-medium text-[hsl(var(--tone-neutral-900))]">{item.name || 'Unnamed user'}</p>
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

            {activeCapability.id !== 'overview' && activeCapability.id !== 'users' ? (
              <Card className="border-[hsl(var(--tone-neutral-200))]">
                <CardHeader className="pb-2">
                  <div className="flex items-center justify-between gap-2">
                    <CardTitle className="flex items-center gap-2 text-base">
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
