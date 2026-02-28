import { MemoryRouter } from 'react-router-dom'
import type { Meta, StoryObj } from '@storybook/react'

import { TopBar } from '@/components/layout/top-bar'

type HeaderTopBarVariant = {
  id: string
  label: string
  path: string
  scope: 'account' | 'workspace'
  note: string
  variables?: Record<string, string>
}

const variants: HeaderTopBarVariant[] = [
  {
    id: 'workspace',
    label: '1) Workspace active',
    path: '/workspaces',
    scope: 'workspace' as const,
    note: 'Current section active with Workspace accent fill.',
  },
  {
    id: 'profile',
    label: '2) Profile active',
    path: '/profile',
    scope: 'account' as const,
    note: 'Current section active with Profile accent fill.',
  },
  {
    id: 'learning-centre',
    label: '3) Learning Centre active',
    path: '/learning-centre',
    scope: 'workspace' as const,
    note: 'Current section active with Learning Centre accent fill.',
  },
  {
    id: 'opportunities',
    label: '4) Opportunities active',
    path: '/opportunities',
    scope: 'workspace' as const,
    note: 'Current section active with Opportunities accent fill.',
  },
  {
    id: 'hover-strong',
    label: '5) Hover-state emphasis',
    path: '/workspaces',
    scope: 'workspace' as const,
    note: 'Stronger hover token for non-active section links.',
    variables: { '--top-nav-hover-bg': 'var(--tone-neutral-200)' } as Record<string, string>,
  },
] as const

function HeaderTopBarVariants() {
  return (
    <div className="space-y-6 bg-neutral-100/60 p-4">
      <div className="text-sm text-neutral-600">
        Top bar variants for quick comparison. Hover values differ on the last variant.
      </div>
      {variants.map((variant) => (
        <section key={variant.id} className="rounded-lg border border-neutral-200 bg-white shadow-sm">
          <div className="border-b border-neutral-200 px-4 py-2">
            <div className="text-sm font-semibold text-neutral-900">{variant.label}</div>
            <div className="text-xs text-neutral-600">{variant.note}</div>
          </div>
          <div style={variant.variables}>
            <MemoryRouter initialEntries={[variant.path]}>
              <TopBar scope={variant.scope} onOpenLeftNav={() => undefined} showLeftNavButton />
            </MemoryRouter>
          </div>
        </section>
      ))}
    </div>
  )
}

const meta: Meta<typeof TopBar> = {
  title: 'Design System/Composites/Header TopBar',
  component: TopBar,
  parameters: {
    layout: 'fullscreen',
    chromatic: { disableSnapshot: true },
  },
}

export default meta
type Story = StoryObj<typeof meta>

export const Default: Story = {
  render: () => <HeaderTopBarVariants />,
}
