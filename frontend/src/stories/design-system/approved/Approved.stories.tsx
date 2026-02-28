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
              <div className="approved-left-panel-sync approved-left-panel-canvas w-[280px] overflow-hidden rounded-md border border-border">
                <MemoryRouter initialEntries={[workspacePath]}>
                  <WorkspaceNavigator workspaceId={workspaceId} />
                </MemoryRouter>
              </div>
            </div>

            <div>
              <p className="mb-2 text-xs font-semibold uppercase tracking-[0.08em] text-neutral-600">Inbox</p>
              <div className="approved-left-panel-sync approved-left-panel-canvas w-[280px] overflow-hidden rounded-md border border-border">
                <MemoryRouter initialEntries={[inboxPath]}>
                  <WorkspaceNavigator workspaceId={workspaceId} />
                </MemoryRouter>
              </div>
            </div>

            <div>
              <p className="mb-2 text-xs font-semibold uppercase tracking-[0.08em] text-neutral-600">Profile</p>
              <div className="approved-left-panel-sync approved-left-panel-canvas w-[280px] overflow-hidden rounded-md border border-border">
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

        .approved-left-panel-sync .house-nav-item {
          --approved-left-nav-hover-bg: hsl(var(--tone-neutral-100) / 0.92);
          --approved-left-nav-active-bg: hsl(var(--tone-neutral-100) / 0.92);
        }

        .approved-left-panel-sync .house-nav-item::before {
          width: var(--marker-width) !important;
          left: var(--left-nav-rail-left) !important;
          border-radius: var(--marker-radius) !important;
        }

        .approved-left-panel-sync .house-left-border::before {
          width: var(--marker-width) !important;
          border-radius: var(--marker-radius) !important;
        }

        .approved-left-panel-sync .house-nav-section-label {
          font-size: 0.8125rem;
          line-height: 1.2rem;
        }

        .approved-left-panel-sync .house-nav-item-workspace,
        .approved-left-panel-sync .house-nav-item-data,
        .approved-left-panel-sync .house-nav-item-manuscript,
        .approved-left-panel-sync .house-nav-item-governance {
          --approved-left-nav-hover-bg: var(--top-nav-hover-bg-workspace);
          --approved-left-nav-active-bg: var(--top-nav-active-bg-workspace);
        }

        .approved-left-panel-sync .house-nav-item-overview,
        .approved-left-panel-sync .house-nav-item-research,
        .approved-left-panel-sync .house-nav-item-account {
          --approved-left-nav-hover-bg: var(--top-nav-hover-bg-profile);
          --approved-left-nav-active-bg: var(--top-nav-active-bg-profile);
        }

        .approved-left-panel-sync .house-nav-item-learning-centre {
          --approved-left-nav-hover-bg: var(--top-nav-hover-bg-learning-centre);
          --approved-left-nav-active-bg: var(--top-nav-active-bg-learning-centre);
        }

        .approved-left-panel-sync .house-nav-item-opportunities {
          --approved-left-nav-hover-bg: var(--top-nav-hover-bg-opportunities);
          --approved-left-nav-active-bg: var(--top-nav-active-bg-opportunities);
        }

        .approved-left-panel-sync .house-nav-item:hover {
          background-color: var(--approved-left-nav-hover-bg);
          color: hsl(var(--tone-neutral-700));
        }

        .approved-left-panel-sync .house-nav-item-active,
        .approved-left-panel-sync .house-nav-item-active:hover {
          background-color: var(--approved-left-nav-active-bg);
          color: hsl(var(--tone-neutral-900));
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
        <div className="grid gap-4 p-4 lg:grid-cols-3">
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
