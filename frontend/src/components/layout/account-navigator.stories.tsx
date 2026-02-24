import type { Meta, StoryObj } from '@storybook/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'

import { cn } from '@/lib/utils'

import { AccountNavigator } from './account-navigator'

type AccountNavigatorPreviewProps = {
  initialPath: string
  panelWidthClass: string
  darkMode: boolean
}

const PATH_PRESETS: Array<{ label: string; path: string }> = [
  { label: 'Profile home', path: '/profile' },
  { label: 'Integrations', path: '/profile/integrations' },
  { label: 'Publications', path: '/profile/publications' },
  { label: 'Collaboration', path: '/account/collaboration' },
  { label: 'Impact', path: '/impact' },
  { label: 'Settings & preferences', path: '/settings' },
]

function AccountNavigatorPreview({ initialPath, panelWidthClass, darkMode }: AccountNavigatorPreviewProps) {
  return (
    <div className={cn('min-h-screen bg-background p-6', darkMode && 'dark')}>
      <div className="overflow-hidden rounded-lg border border-[hsl(var(--tone-neutral-200))] bg-card">
        <div className={cn(panelWidthClass, 'h-sz-420')}>
          <MemoryRouter initialEntries={[initialPath]}>
            <Routes>
              <Route path="*" element={<AccountNavigator />} />
            </Routes>
          </MemoryRouter>
        </div>
      </div>
    </div>
  )
}

const meta: Meta<typeof AccountNavigatorPreview> = {
  title: 'Navigation/ProfileSidebar',
  component: AccountNavigatorPreview,
  args: {
    initialPath: '/profile/publications',
    panelWidthClass: 'w-sz-260',
    darkMode: false,
  },
  parameters: {
    layout: 'fullscreen',
  },
}

export default meta

type Story = StoryObj<typeof AccountNavigatorPreview>

export const Default: Story = {}

export const NarrowViewport: Story = {
  args: {
    initialPath: '/settings',
    panelWidthClass: 'w-sz-220',
  },
}

export const DarkMode: Story = {
  args: {
    darkMode: true,
  },
}

export const ActiveItemMatrix: Story = {
  render: (args) => (
    <div className={cn('min-h-screen bg-background p-6', args.darkMode && 'dark')}>
      <div className="grid gap-4 lg:grid-cols-2 xl:grid-cols-3">
        {PATH_PRESETS.map((preset) => (
          <section key={preset.path} className="overflow-hidden rounded-lg border border-[hsl(var(--tone-neutral-200))] bg-card">
            <header className="border-b border-[hsl(var(--tone-neutral-200))] px-3 py-2">
              <p className="text-caption uppercase tracking-[0.12em] text-[hsl(var(--tone-neutral-500))]">{preset.label}</p>
            </header>
            <div className={cn(args.panelWidthClass, 'h-sz-420')}>
              <MemoryRouter initialEntries={[preset.path]}>
                <Routes>
                  <Route path="*" element={<AccountNavigator />} />
                </Routes>
              </MemoryRouter>
            </div>
          </section>
        ))}
      </div>
    </div>
  ),
}
