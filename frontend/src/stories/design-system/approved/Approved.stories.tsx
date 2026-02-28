import type { Meta, StoryObj } from '@storybook/react'
import { useState } from 'react'
import { MemoryRouter } from 'react-router-dom'
import { Eye, EyeOff, KeyRound, Mail, Menu, Search, Settings, User } from 'lucide-react'

import { AuthPage } from '@/pages/auth-page'
import { TopBar } from '@/components/layout/top-bar'
import { AccountNavigator } from '@/components/layout/account-navigator'
import { WorkspaceNavigator } from '@/components/layout/workspace-navigator'

type HeaderScope = 'account' | 'workspace'
type IconOption = {
  id: string
  label: string
  description: string
  icon: JSX.Element
}

const meta: Meta = {
  title: 'Design System/APPROVED/Approved',
  tags: ['autodocs'],
  parameters: {
    layout: 'fullscreen',
    withRouter: false,
    docs: {
      description: {
        component:
          'Approved production patterns used across auth and global nav. This page shows the canonical header, auth page, and approved icon set.',
      },
    },
  },
}

export default meta

type Story = StoryObj

function ApprovedHeaderBar() {
  const activeScope: HeaderScope = 'workspace'
  const initialPath = '/workspaces'

  return (
    <section>
      <div className="rounded-lg border border-neutral-200 bg-white shadow-sm overflow-hidden">
        <div className="px-4 py-2 border-b border-neutral-200">
          <p className="text-sm font-semibold text-neutral-900">Approved Header Bar (canonical)</p>
          <p className="text-xs text-neutral-600">Workspace scope with approved nav interaction and click-through behavior.</p>
        </div>

        <div className="approved-header-no-motion bg-card">
          <MemoryRouter initialEntries={[initialPath]}>
            <TopBar key={initialPath} scope={activeScope} onOpenLeftNav={() => undefined} showLeftNavButton />
          </MemoryRouter>
        </div>
      </div>

      <style>{`
        .approved-header-no-motion .house-top-nav-item,
        .approved-header-no-motion .house-top-nav-item::before,
        .approved-header-no-motion .house-top-nav-item-active,
        .approved-header-no-motion .house-top-nav-item-active::before,
        .approved-header-no-motion .house-top-utility-button {
          transition: none !important;
        }

        .approved-header-no-motion .house-top-nav-item:hover {
          transform: none !important;
        }
      `}</style>
    </section>
  )
}

function AuthPagePanel() {
  return (
    <section>
      <div className="rounded-lg border border-neutral-200 bg-white shadow-sm overflow-hidden">
        <div className="px-4 py-2 border-b border-neutral-200">
          <p className="text-sm font-semibold text-neutral-900">Approved Auth Page</p>
          <p className="text-xs text-neutral-600">Canonical auth page composition (token-first implementation).</p>
        </div>
        <MemoryRouter initialEntries={["/auth"]}>
          <AuthPage />
        </MemoryRouter>
      </div>
    </section>
  )
}

function ApprovedLeftPanel() {
  const workspaceId = 'workspace-1'
  const workspacePath = `/w/${workspaceId}/overview`
  const inboxPath = `/w/${workspaceId}/inbox`
  const profilePath = '/profile'

  return (
    <section>
      <div className="rounded-lg border border-neutral-200 bg-white shadow-sm overflow-hidden">
        <div className="px-4 py-2 border-b border-neutral-200">
          <p className="text-sm font-semibold text-neutral-900">Approved Left Panels (mirrored canonical)</p>
          <p className="text-xs text-neutral-600">Workspace home and Profile left panels aligned for shared sizing and state behavior.</p>
        </div>
        <div className="bg-card p-4">
          <div className="grid grid-cols-3 gap-4">
            <div>
              <p className="mb-2 text-xs font-semibold uppercase tracking-[0.08em] text-neutral-600">Workspace home</p>
              <div className="approved-left-panel-sync approved-left-panel-canvas w-[var(--layout-left-nav-width)] overflow-hidden rounded-md border border-border">
                <MemoryRouter initialEntries={[workspacePath]}>
                  <WorkspaceNavigator workspaceId={workspaceId} />
                </MemoryRouter>
              </div>
            </div>

            <div>
              <p className="mb-2 text-xs font-semibold uppercase tracking-[0.08em] text-neutral-600">Inbox</p>
              <div className="approved-left-panel-sync approved-left-panel-canvas w-[var(--layout-left-nav-width)] overflow-hidden rounded-md border border-border">
                <MemoryRouter initialEntries={[inboxPath]}>
                  <WorkspaceNavigator workspaceId={workspaceId} />
                </MemoryRouter>
              </div>
            </div>

            <div>
              <p className="mb-2 text-xs font-semibold uppercase tracking-[0.08em] text-neutral-600">Profile</p>
              <div className="approved-left-panel-sync approved-left-panel-canvas w-[var(--layout-left-nav-width)] overflow-hidden rounded-md border border-border">
                <MemoryRouter initialEntries={[profilePath]}>
                  <AccountNavigator />
                </MemoryRouter>
              </div>
            </div>
          </div>
        </div>
      </div>
      <style>{`
        .approved-left-panel-canvas {
          height: 36rem;
          background-color: hsl(var(--card));
        }
      `}</style>
    </section>
  )
}

function ApprovedMarkersSection() {
  return (
    <section>
      <div className="rounded-lg border border-neutral-200 bg-white shadow-sm overflow-hidden">
        <div className="px-4 py-2 border-b border-neutral-200">
          <p className="text-sm font-semibold text-neutral-900">Approved Markers</p>
          <p className="text-xs text-neutral-600">Canonical marker widths for header, left nav, and panel/drilldown accents.</p>
        </div>
        <div className="grid gap-4 p-4 lg:grid-cols-4">
          <article className="rounded-md border border-neutral-200 bg-white p-3">
            <p className="text-xs font-semibold uppercase tracking-[0.08em] text-neutral-600">Header Marker</p>
            <div className="mt-3">
              <button type="button" className="house-top-nav-item house-top-nav-item-workspace house-top-nav-item-active">
                Workspaces
              </button>
            </div>
            <p className="mt-3 text-xs text-neutral-600">Width: <code>var(--marker-width-header)</code></p>
          </article>

          <article className="rounded-md border border-neutral-200 bg-white p-3">
            <p className="text-xs font-semibold uppercase tracking-[0.08em] text-neutral-600">Left Nav Marker</p>
            <div className="mt-3">
              <button type="button" className="house-nav-item house-nav-item-workspace house-nav-item-active w-full">
                <span className="house-nav-item-label">Overview</span>
              </button>
            </div>
            <p className="mt-3 text-xs text-neutral-600">Width: <code>var(--marker-width-left-nav)</code></p>
          </article>

          <article className="rounded-md border border-neutral-200 bg-white p-3">
            <p className="text-xs font-semibold uppercase tracking-[0.08em] text-neutral-600">Panel / Drilldown Marker</p>
            <div className="mt-3">
              <div className="house-left-border house-left-border-publications rounded-md border border-border bg-card p-3">
                <p className="text-sm font-semibold text-neutral-900">Publication drilldown</p>
                <p className="text-xs text-neutral-600">Marker follows shared panel token.</p>
              </div>
            </div>
            <p className="mt-3 text-xs text-neutral-600">Width: <code>var(--marker-width-panel)</code></p>
          </article>
        </div>
      </div>
    </section>
  )
}

function ApprovedLayoutTitlePositioning() {
  return (
    <section>
      <div className="rounded-lg border border-neutral-200 bg-white shadow-sm overflow-hidden">
        <div className="px-4 py-2 border-b border-neutral-200">
          <p className="text-sm font-semibold text-neutral-900">Layout</p>
          <p className="text-xs text-neutral-600">Title positioning (CSS source-of-truth tokens)</p>
        </div>
        <div className="p-4 space-y-4">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <div className="rounded-md border border-neutral-200 bg-white p-3">
              <p className="text-xs font-semibold uppercase tracking-[0.08em] text-neutral-600">Desktop top offset</p>
              <p className="mt-1 text-sm font-medium text-neutral-900">
                <code>--content-container-anchor-offset</code>
              </p>
            </div>
            <div className="rounded-md border border-neutral-200 bg-white p-3">
              <p className="text-xs font-semibold uppercase tracking-[0.08em] text-neutral-600">Desktop +md top offset</p>
              <p className="mt-1 text-sm font-medium text-neutral-900">
                <code>--content-container-anchor-offset-md</code>
              </p>
            </div>
            <div className="rounded-md border border-neutral-200 bg-white p-3">
              <p className="text-xs font-semibold uppercase tracking-[0.08em] text-neutral-600">Fluid top offset</p>
              <p className="mt-1 text-sm font-medium text-neutral-900">
                <code>--content-container-fluid-anchor-offset</code>
              </p>
            </div>
            <div className="rounded-md border border-neutral-200 bg-white p-3">
              <p className="text-xs font-semibold uppercase tracking-[0.08em] text-neutral-600">Fluid +md top offset</p>
              <p className="mt-1 text-sm font-medium text-neutral-900">
                <code>--content-container-fluid-anchor-offset-md</code>
              </p>
            </div>
            <div className="rounded-md border border-neutral-200 bg-white p-3">
              <p className="text-xs font-semibold uppercase tracking-[0.08em] text-neutral-600">Title marker inset</p>
              <p className="mt-1 text-sm font-medium text-neutral-900">
                <code>--page-title-marker-inset-block</code>
              </p>
            </div>
            <div className="rounded-md border border-neutral-200 bg-white p-3">
              <p className="text-xs font-semibold uppercase tracking-[0.08em] text-neutral-600">Title expander style</p>
              <p className="mt-1 text-sm font-medium text-neutral-900">
                <code>.house-title-expander</code>
              </p>
            </div>
            <div className="rounded-md border border-neutral-200 bg-white p-3">
              <p className="text-xs font-semibold uppercase tracking-[0.08em] text-neutral-600">Left nav width</p>
              <p className="mt-1 text-sm font-medium text-neutral-900">
                <code>--layout-left-nav-width</code>
              </p>
            </div>
            <div className="rounded-md border border-neutral-200 bg-white p-3">
              <p className="text-xs font-semibold uppercase tracking-[0.08em] text-neutral-600">Left nav width (mobile)</p>
              <p className="mt-1 text-sm font-medium text-neutral-900">
                <code>--layout-left-nav-width-mobile</code>
              </p>
            </div>
          </div>

          <div className="rounded-md border border-neutral-200 bg-card p-4">
            <p className="text-xs text-neutral-600 mb-3">
              Preview: title anchor spacing to top header and left panel uses the same layout token family.
            </p>
            <div className="grid grid-cols-[var(--layout-left-nav-width)_1fr] gap-4">
              <aside className="rounded-md border border-border bg-background p-3">
                <p className="text-xs font-semibold uppercase tracking-[0.08em] text-neutral-600">Left panel</p>
              </aside>
              <main className="rounded-md border border-border bg-background p-3">
                <div data-house-role="page-header" className="house-page-header house-left-border house-left-border-workspace">
                  <h1 data-house-role="page-title" className="house-title text-[1.35rem] leading-[1.5rem]">Publications</h1>
                  <p data-house-role="page-title-expander" className="house-title-expander">Canonical content title placement</p>
                </div>
              </main>
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}

function ApprovedTypographySection() {
  return (
    <section>
      <div className="rounded-lg border border-neutral-200 bg-white shadow-sm overflow-hidden">
        <div className="px-4 py-2 border-b border-neutral-200">
          <p className="text-sm font-semibold text-neutral-900">Approved Typography</p>
          <p className="text-xs text-neutral-600">Canonical typography sets for main content, left panel, and drilldown.</p>
        </div>

        <div className="grid gap-4 p-4 lg:grid-cols-3">
          <article className="rounded-md border border-neutral-200 bg-background p-4 space-y-2">
            <p className="text-xs font-semibold uppercase tracking-[0.08em] text-neutral-600">Main content</p>
            <h2 className="house-title text-[1.8rem] leading-[2rem]">Publications</h2>
            <p className="house-title-expander">Track your research metrics and manage your publication library.</p>
            <p className="house-section-title mt-1">Publication insights</p>
            <p className="house-text">This paragraph uses the main body text tier for core reading content.</p>
            <p className="house-label">Metric label</p>
            <p className="house-field-label">Field label</p>
            <p className="house-field-helper">Helper copy and validation guidance live here.</p>
          </article>

          <article className="rounded-md border border-neutral-200 bg-background p-4 space-y-2">
            <p className="text-xs font-semibold uppercase tracking-[0.08em] text-neutral-600">Left panel</p>
            <p className="house-nav-section-label">Workspace</p>
            <button type="button" className="house-nav-item house-nav-item-workspace house-nav-item-active w-full">
              <span className="house-nav-item-label">Overview</span>
              <span className="house-nav-item-count">12</span>
            </button>
            <button type="button" className="house-nav-item house-nav-item-workspace w-full">
              <span className="house-nav-item-label">Data library</span>
              <span className="house-nav-item-meta">New</span>
            </button>
            <p className="house-nav-item-meta">Meta tier for supplementary nav context.</p>
          </article>

          <article className="rounded-md border border-neutral-200 bg-background p-4 space-y-2">
            <p className="text-xs font-semibold uppercase tracking-[0.08em] text-neutral-600">Drilldown</p>
            <p className="house-drilldown-overline">Publication drilldown</p>
            <p className="house-drilldown-section-label">Citation momentum</p>
            <p className="house-drilldown-summary-stat-title">Current citation pace</p>
            <p className="house-drilldown-summary-stat-value">+87%</p>
            <p className="house-drilldown-caption">Compared with prior 12-month period.</p>
            <p className="house-drilldown-note-soft">Context tier for non-primary explanatory text.</p>
          </article>

          <article className="rounded-md border border-neutral-200 bg-background p-4 space-y-2">
            <p className="text-xs font-semibold uppercase tracking-[0.08em] text-neutral-600">Metric tiles</p>
            <p className="house-metric-tile-title">Total publications</p>
            <p className="house-metric-tile-value">150</p>
            <p className="house-metric-subtitle">Lifetime publications</p>
            <p className="house-metric-narrative">Last 5 years shown</p>
            <p className="house-text-soft">Title/value gap token: <code>--metric-tile-title-value-gap</code></p>
          </article>
        </div>
      </div>
    </section>
  )
}

function ApprovedMetricTilesSection() {
  const [hIndexMode, setHIndexMode] = useState<'trend' | 'needed'>('trend')

  return (
    <section>
      <div className="rounded-lg border border-neutral-200 bg-white shadow-sm overflow-hidden">
        <div className="px-4 py-2 border-b border-neutral-200">
          <p className="text-sm font-semibold text-neutral-900">Approved Metric Tiles</p>
          <p className="text-xs text-neutral-600">Canonical publication tile surface, separator, and state behavior.</p>
        </div>
        <div className="grid gap-4 p-4 lg:grid-cols-2">
          <article className="house-metric-tile-shell min-h-36 rounded-md border p-3">
            <div className="grid h-full min-h-[9.5rem] grid-cols-[minmax(0,0.85fr)_minmax(0,1.32fr)] gap-3">
              <div className="flex min-h-0 flex-col">
                <p className="house-metric-tile-title">Total publications</p>
                <p className="house-metric-tile-value">150</p>
                <p className="house-metric-subtitle">Lifetime publications</p>
              </div>
              <div className="house-metric-tile-separator min-h-0 border-l pl-3">
                <p className="house-metric-right-chart-title">Publications per year (last 5 years)</p>
                <div className="house-metric-tile-chart-surface mt-1.5 flex min-h-14 flex-1 rounded-sm border border-[hsl(var(--stroke-strong)/0.92)] p-1" />
              </div>
            </div>
          </article>

          <article className="house-metric-tile-shell house-metric-tile-shell-selected min-h-36 rounded-md border p-3">
            <div className="grid h-full min-h-[9.5rem] grid-cols-[minmax(0,0.85fr)_minmax(0,1.32fr)] gap-3">
              <div className="flex min-h-0 flex-col">
                <p className="house-metric-tile-title">Citations</p>
                <p className="house-metric-tile-value">26,382</p>
                <p className="house-metric-subtitle">Lifetime citations</p>
              </div>
              <div className="house-metric-tile-separator min-h-0 border-l pl-3">
                <p className="house-metric-right-chart-title">Citations per year (last 5 years)</p>
                <div className="house-metric-tile-chart-surface mt-1.5 flex min-h-14 flex-1 rounded-sm border border-[hsl(var(--stroke-strong)/0.92)] p-1" />
              </div>
            </div>
          </article>

          <article className="house-metric-tile-shell min-h-36 rounded-md border p-3 lg:col-span-2">
            <p className="mb-2 text-xs font-semibold uppercase tracking-[0.08em] text-neutral-600">
              Alternative Right Header Slot (Toggle Instead Of Title)
            </p>
            <div className="grid h-full min-h-[9.5rem] grid-cols-[minmax(0,0.85fr)_minmax(0,1.32fr)] gap-3">
              <div className="flex min-h-0 flex-col">
                <p className="house-metric-tile-title">H-index</p>
                <p className="house-metric-tile-value">h 23</p>
                <p className="house-metric-subtitle">Progress to h 24</p>
                <p className="house-metric-detail">Toggle moved to right chart header slot.</p>
              </div>
              <div className="house-metric-tile-separator min-h-0 border-l pl-3">
                <div className="house-metric-right-chart-panel house-metric-right-chart-panel-toggle">
                  <div className="house-metric-right-chart-header">
                    <div className="house-toggle-track grid-cols-2">
                      <span
                        className="house-toggle-thumb"
                        style={{
                          width: 'calc(50% - 0.125rem)',
                          left: hIndexMode === 'needed' ? 'calc(50% + 1px)' : '2px',
                          willChange: 'left,width',
                        }}
                        aria-hidden="true"
                      />
                      <button
                        type="button"
                        className={hIndexMode === 'trend' ? 'house-toggle-button text-white' : 'house-toggle-button house-drilldown-toggle-button-muted'}
                        onClick={() => setHIndexMode('trend')}
                        aria-pressed={hIndexMode === 'trend'}
                      >
                        Trend
                      </button>
                      <button
                        type="button"
                        className={hIndexMode === 'needed' ? 'house-toggle-button text-white' : 'house-toggle-button house-drilldown-toggle-button-muted'}
                        onClick={() => setHIndexMode('needed')}
                        aria-pressed={hIndexMode === 'needed'}
                      >
                        Needed
                      </button>
                    </div>
                  </div>
                  <div className="house-metric-right-chart-body">
                    <div className="house-metric-tile-chart-surface mt-1.5 flex min-h-14 flex-1 rounded-sm border border-[hsl(var(--stroke-strong)/0.92)] p-1" />
                  </div>
                </div>
              </div>
            </div>
          </article>

          <article className="house-metric-tile-shell min-h-36 rounded-md border p-3 lg:col-span-2">
            <p className="mb-2 text-xs font-semibold uppercase tracking-[0.08em] text-neutral-600">
              Collaboration Structure (Neutral Facts List Preview)
            </p>
            <div className="grid h-full min-h-[9.5rem] grid-cols-[minmax(0,0.85fr)_minmax(0,1.32fr)] gap-3">
              <div className="flex min-h-0 flex-col">
                <p className="house-metric-tile-title">Collaboration structure</p>
                <p className="house-metric-tile-value">448</p>
                <p className="house-metric-subtitle">Unique collaborators</p>
                <div className="pt-1.5">
                  <p className="house-chart-axis-text mb-1 font-semibold">Repeat collaborator rate</p>
                  <div className="house-drilldown-progress-track h-[0.44rem]">
                    <div className="house-chart-bar-positive h-full rounded-full" style={{ width: '62%' }} />
                  </div>
                  <p className="house-chart-axis-text mt-1 text-right font-semibold">62%</p>
                </div>
              </div>
              <div className="house-metric-tile-separator min-h-0 border-l pl-3">
                <div className="house-metric-tile-chart-surface flex h-full min-h-0 flex-col rounded-sm px-2 py-1.5">
                  <div>
                    <div className="grid grid-cols-[minmax(0,1fr)_3.25rem] items-center gap-x-3 py-1.5">
                      <span className="house-chart-axis-text leading-tight">Institutions</span>
                      <span className="house-chart-axis-text leading-tight text-center">136</span>
                    </div>
                    <div className="my-1 h-px bg-[hsl(var(--stroke-soft)/0.72)]" />
                    <div className="grid grid-cols-[minmax(0,1fr)_3.25rem] items-center gap-x-3 py-1.5">
                      <span className="house-chart-axis-text leading-tight">Countries</span>
                      <span className="house-chart-axis-text leading-tight text-center">16</span>
                    </div>
                    <div className="my-1 h-px bg-[hsl(var(--stroke-soft)/0.72)]" />
                    <div className="grid grid-cols-[minmax(0,1fr)_3.25rem] items-center gap-x-3 py-1.5">
                      <span className="house-chart-axis-text leading-tight">Continents</span>
                      <span className="house-chart-axis-text leading-tight text-center">5</span>
                    </div>
                  </div>
                  <div className="mt-2.5">
                    <p className="house-chart-axis-text mb-1 leading-tight">Repeat collaborator rate</p>
                    <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-2">
                      <div className="house-drilldown-progress-track h-[0.44rem]">
                        <div className="house-chart-bar-positive h-full rounded-full" style={{ width: '62%' }} />
                      </div>
                      <p className="house-chart-axis-text leading-tight">62%</p>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </article>
        </div>
        <div className="px-4 pb-4 text-xs text-neutral-600">
          Tokens: <code>--metric-tile-grid-gap</code>, <code>--metric-tile-grid-padding</code>, <code>--metric-tile-grid-row-min-height</code>, <code>--metric-tile-border-color</code>, <code>--metric-tile-border-width</code>, <code>--metric-tile-bg-rest</code>, <code>--metric-tile-bg-hover</code>, <code>--metric-tile-bg-selected</code>, <code>--metric-tile-chart-bg-rest</code>, <code>--metric-tile-chart-bg-hover</code>, <code>--metric-tile-separator-color</code>, <code>--metric-tile-separator-width</code>.
        </div>
      </div>
    </section>
  )
}

function ApprovedTileTogglesSection() {
  const [hMode, setHMode] = useState<'trend' | 'needed'>('trend')
  const thresholds = [50, 75, 90, 95, 99] as const
  const [vMode, setVMode] = useState<(typeof thresholds)[number]>(75)
  const vIndex = Math.max(0, thresholds.indexOf(vMode))

  return (
    <section>
      <div className="rounded-lg border border-neutral-200 bg-white shadow-sm overflow-hidden">
        <div className="px-4 py-2 border-b border-neutral-200">
          <p className="text-sm font-semibold text-neutral-900">Approved Tile Toggles</p>
          <p className="text-xs text-neutral-600">Canonical toggle controls for metric tiles (horizontal and vertical).</p>
        </div>
        <div className="grid gap-4 p-4 lg:grid-cols-2">
          <article className="rounded-md border border-neutral-200 bg-background p-4">
            <p className="text-xs font-semibold uppercase tracking-[0.08em] text-neutral-600">Horizontal Toggle (Trend / Needed)</p>
            <div className="mt-3 inline-flex items-center">
              <div className="house-toggle-track grid-cols-2">
                <span
                  className="house-toggle-thumb"
                  style={{
                    width: 'calc(50% - 0.125rem)',
                    left: hMode === 'needed' ? 'calc(50% + 1px)' : '2px',
                    willChange: 'left,width',
                  }}
                  aria-hidden="true"
                />
                <button
                  type="button"
                  className={hMode === 'trend' ? 'house-toggle-button text-white' : 'house-toggle-button house-drilldown-toggle-button-muted'}
                  onClick={() => setHMode('trend')}
                  aria-pressed={hMode === 'trend'}
                >
                  Trend
                </button>
                <button
                  type="button"
                  className={hMode === 'needed' ? 'house-toggle-button text-white' : 'house-toggle-button house-drilldown-toggle-button-muted'}
                  onClick={() => setHMode('needed')}
                  aria-pressed={hMode === 'needed'}
                >
                  Needed
                </button>
              </div>
            </div>
          </article>

          <article className="rounded-md border border-neutral-200 bg-background p-4">
            <p className="text-xs font-semibold uppercase tracking-[0.08em] text-neutral-600">Vertical Toggle (Field Percentile)</p>
            <div className="mt-3">
              <div
                className="house-toggle-track relative grid w-10 items-stretch"
                style={{
                  gridTemplateRows: `repeat(${thresholds.length}, minmax(0, 1fr))`,
                  minHeight: `${thresholds.length * 1.785}rem`,
                }}
              >
                <span
                  className="house-toggle-thumb"
                  style={{
                    width: 'calc(100% - 0.25rem)',
                    height: `calc(${100 / thresholds.length}% - 0.125rem)`,
                    top: `calc(${(100 / thresholds.length) * vIndex}% + 2px)`,
                    left: '0.125rem',
                    bottom: 'auto',
                    right: 'auto',
                    transitionProperty: 'top, height',
                    willChange: 'top,height',
                  }}
                  aria-hidden="true"
                />
                {thresholds.map((threshold) => (
                  <button
                    key={`approved-v-toggle-${threshold}`}
                    type="button"
                    className={vMode === threshold ? 'house-toggle-button text-white' : 'house-toggle-button house-drilldown-toggle-button-muted'}
                    onClick={() => setVMode(threshold)}
                    aria-pressed={vMode === threshold}
                  >
                    {threshold}
                  </button>
                ))}
              </div>
            </div>
          </article>
        </div>
      </div>
    </section>
  )
}

function ProviderIcon({ provider }: { provider: 'orcid' | 'google' | 'microsoft' }) {
  if (provider === 'orcid') {
    return (
      <span className="inline-flex h-6 w-6 items-center justify-center rounded-sm bg-transparent" aria-hidden>
        <svg viewBox="0 0 24 24" className="h-6 w-6" aria-hidden>
          <circle cx="12" cy="12" r="11" fill="#A6CE39" />
          <text
            x="12"
            y="15.2"
            textAnchor="middle"
            fontSize="10.6"
            fontWeight="700"
            fontFamily="Arial, Helvetica, sans-serif"
            letterSpacing="-0.25"
            fill="#FFFFFF"
          >
            iD
          </text>
        </svg>
      </span>
    )
  }

  if (provider === 'google') {
    return (
      <span className="inline-flex h-6 w-6 items-center justify-center rounded-sm bg-transparent" aria-hidden>
        <svg viewBox="0 0 24 24" className="h-6 w-6" aria-hidden>
          <path fill="#4285F4" d="M23.49 12.27c0-.79-.07-1.55-.2-2.27H12v4.29h6.46a5.52 5.52 0 0 1-2.39 3.62v3h3.86c2.26-2.08 3.56-5.15 3.56-8.64z" />
          <path fill="#34A853" d="M12 24c3.24 0 5.95-1.07 7.94-2.91l-3.86-3a7.16 7.16 0 0 1-10.66-3.76H1.43v3.09A12 12 0 0 0 12 24z" />
          <path fill="#FBBC05" d="M5.42 14.33a7.2 7.2 0 0 1 0-4.66V6.58H1.43a12 12 0 0 0 0 10.84l3.99-3.09z" />
          <path fill="#EA4335" d="M12 4.77c1.76 0 3.34.61 4.58 1.8l3.43-3.43C17.94 1.19 15.23 0 12 0A12 12 0 0 0 1.43 6.58l3.99 3.09A7.16 7.16 0 0 1 12 4.77z" />
        </svg>
      </span>
    )
  }

  return (
    <span className="inline-flex h-6 w-6 items-center justify-center rounded-sm bg-transparent" aria-hidden>
      <svg viewBox="0 0 24 24" className="h-6 w-6" aria-hidden>
        <rect x="2" y="2" width="9" height="9" fill="#F25022" />
        <rect x="13" y="2" width="9" height="9" fill="#7FBA00" />
        <rect x="2" y="13" width="9" height="9" fill="#00A4EF" />
        <rect x="13" y="13" width="9" height="9" fill="#FFB900" />
      </svg>
    </span>
  )
}

const approvedIcons: IconOption[] = [
  {
    id: 'icon-mail',
    label: 'Mail',
    description: 'Input and communication icon',
    icon: <Mail className="h-5 w-5" />,
  },
  {
    id: 'icon-key',
    label: 'Key',
    description: 'Security / credentials context',
    icon: <KeyRound className="h-5 w-5" />,
  },
  {
    id: 'icon-search',
    label: 'Search',
    description: 'Search field affordance',
    icon: <Search className="h-5 w-5" />,
  },
  {
    id: 'icon-eye',
    label: 'Show',
    description: 'Password reveal control',
    icon: <Eye className="h-5 w-5" />,
  },
  {
    id: 'icon-eye-off',
    label: 'Hide',
    description: 'Password conceal control',
    icon: <EyeOff className="h-5 w-5" />,
  },
  {
    id: 'icon-user',
    label: 'User',
    description: 'Profile context',
    icon: <User className="h-5 w-5" />,
  },
  {
    id: 'icon-settings',
    label: 'Settings',
    description: 'Admin utility',
    icon: <Settings className="h-5 w-5" />,
  },
  {
    id: 'icon-menu',
    label: 'Menu',
    description: 'Navigation toggle',
    icon: <Menu className="h-5 w-5" />,
  },
]

function ProviderIconSection() {
  const [isPasswordVisible, setIsPasswordVisible] = useState(false)

  return (
    <div className="grid gap-3">
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="rounded-md border border-neutral-200 bg-white p-4">
          <p className="text-xs font-semibold text-neutral-900">OAuth identity providers</p>
          <p className="text-xs text-neutral-600 mt-1">Starting approved logo set for auth buttons.</p>
          <div className="mt-3 flex gap-2">
            <ProviderIcon provider="orcid" />
            <ProviderIcon provider="google" />
            <ProviderIcon provider="microsoft" />
          </div>
        </div>
        <div className="rounded-md border border-neutral-200 bg-white p-4">
          <p className="text-xs font-semibold text-neutral-900">Interface icons</p>
          <p className="text-xs text-neutral-600 mt-1">General-purpose icons used in approved interfaces.</p>
          <div className="mt-3 flex flex-wrap gap-2">
            {approvedIcons.map((icon) => (
              <button
                key={icon.id}
                type="button"
                className="approved-icon-chip"
                title={`${icon.label}: ${icon.description}`}
                aria-label={icon.label}
              >
                {icon.icon}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="rounded-md border border-neutral-200 bg-white p-4">
        <p className="text-xs font-semibold text-neutral-900">State behavior preview</p>
        <p className="text-xs text-neutral-600 mt-1">Default, hover, focus, active, and toggled-on icon states.</p>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <span className="approved-icon-chip" aria-hidden>
            <Search className="h-5 w-5" />
          </span>
          <span className="approved-icon-chip is-hover" aria-hidden>
            <Search className="h-5 w-5" />
          </span>
          <span className="approved-icon-chip is-focus" aria-hidden>
            <Search className="h-5 w-5" />
          </span>
          <span className="approved-icon-chip is-active" aria-hidden>
            <Search className="h-5 w-5" />
          </span>
          <button
            type="button"
            className="approved-icon-chip"
            data-state={isPasswordVisible ? 'on' : 'off'}
            aria-label={isPasswordVisible ? 'Hide password' : 'Show password'}
            aria-pressed={isPasswordVisible}
            onClick={() => setIsPasswordVisible((previous) => !previous)}
            title="Eye icon toggle"
          >
            <span className="approved-icon-swap" aria-hidden>
              <Eye className="approved-icon-on h-5 w-5" />
              <EyeOff className="approved-icon-off h-5 w-5" />
            </span>
          </button>
        </div>
      </div>

      <div className="rounded-md border border-neutral-200 bg-white p-4">
        <p className="text-xs font-semibold text-neutral-900">Icon naming and usage</p>
        <p className="text-sm text-neutral-700 mt-2">
          Use token-driven sizing and semantic labels for accessibility. Current approved size baseline for inline controls: 20px (h-5/w-5).
        </p>
        <div className="mt-3 grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
          {approvedIcons.map((icon) => (
            <article key={`${icon.id}-item`} className="rounded-md border border-neutral-100 p-3">
              <p className="text-xs font-medium text-neutral-900">{icon.label}</p>
              <p className="text-xs text-neutral-600">{icon.description}</p>
            </article>
          ))}
        </div>
      </div>
    </div>
  )
}

function ApprovedPage() {
  return (
    <div className="min-h-screen bg-white">
      <div className="mx-auto max-w-6xl space-y-10 p-4">
        <h1 className="text-2xl font-bold text-neutral-900">Approved Library</h1>
        <ApprovedHeaderBar />
        <ApprovedMarkersSection />
        <ApprovedLayoutTitlePositioning />
        <ApprovedTypographySection />
        <ApprovedMetricTilesSection />
        <ApprovedTileTogglesSection />
        <ApprovedLeftPanel />
        <AuthPagePanel />
        <div className="rounded-lg border border-neutral-200 bg-white shadow-sm">
          <div className="px-4 py-2 border-b border-neutral-200">
            <p className="text-sm font-semibold text-neutral-900">Approved Icons</p>
            <p className="text-xs text-neutral-600">Canonical icon definitions for reuse in future approved stories.</p>
          </div>
          <div className="p-4">
            <ProviderIconSection />
          </div>
        </div>
      </div>
    </div>
  )
}

export const Approved: Story = {
  render: () => <ApprovedPage />,
}
