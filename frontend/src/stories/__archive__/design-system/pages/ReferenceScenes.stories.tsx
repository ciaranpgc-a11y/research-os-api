import type { Meta, StoryObj } from '@storybook/react-vite'
import type { ReactNode } from 'react'
import { PageFrame } from '@/pages/page-frame'
import { StoryFrame } from '../_helpers/StoryFrame'
import { mockPublicationRows, mockWorkspaces, mockLogs, mockInvitations } from '../_helpers/mockData'

const meta = {
  title: 'Design System/Pages/Reference Scenes',
  parameters: { layout: 'fullscreen', chromatic: { disableSnapshot: true } },
} satisfies Meta

export default meta

type Story = StoryObj

function Scene({ title, tone, children }: { title: string; tone: 'research'|'workspace'|'data'|'account'; children: ReactNode }) {
  return (
    <StoryFrame padded={false}>
      <div className="p-6">
        <PageFrame title={title} tone={tone} hideScaffoldHeader>
          {children}
        </PageFrame>
      </div>
    </StoryFrame>
  )
}

export const PublicationsPage: Story = { render: () => <Scene title="Publications" tone="research"><div className="grid gap-2 sm:grid-cols-3">{mockPublicationRows.map((row)=><div key={row.id} className="rounded-md border border-border bg-card p-3"><p className="text-sm font-semibold">{row.title}</p><p className="text-caption text-muted-foreground">{row.year} • {row.citations} citations</p></div>)}</div></Scene> }

export const PublicationsDrilldownLarge: Story = { render: () => <Scene title="Publications drilldown" tone="research"><div className="rounded-md border border-border bg-card p-3"><p className="house-h2">Breakdown</p><div className="mt-2 h-[24rem] rounded border border-dashed border-border" /></div></Scene> }

export const WorkspacesList: Story = { render: () => <Scene title="Workspaces" tone="workspace"><div className="space-y-2">{mockWorkspaces.map((ws)=><div key={ws.id} className="rounded-md border border-border bg-card p-3"><p className="font-medium">{ws.name}</p><p className="text-caption text-muted-foreground">v{ws.version} • {ws.health}</p></div>)}</div></Scene> }

export const WorkspaceDetailProject: Story = { render: () => <Scene title="Workspace detail" tone="workspace"><div className="grid gap-2 sm:grid-cols-2"><div className="rounded-md border border-border bg-card p-3">Inbox and tasks</div><div className="rounded-md border border-border bg-card p-3">Results and exports</div></div></Scene> }

export const DataLibraryView: Story = { render: () => <Scene title="Data library" tone="data"><div className="rounded-md border border-border bg-card p-3"><p className="text-sm">Assets, access controls, and linked workspaces</p></div></Scene> }

export const AdminRolesLogsView: Story = { render: () => <Scene title="Admin roles and logs" tone="account"><div className="space-y-2">{mockLogs.map((log)=><div key={log.id} className="rounded-md border border-border bg-card p-3 text-sm">{log.action}</div>)}</div></Scene> }

export const AuthPage: Story = { render: () => <Scene title="Authentication" tone="account"><div className="max-w-md rounded-md border border-border bg-card p-3"><p className="text-sm">Sign-in and register card reference scene</p><div className="mt-2 space-y-2"><input className="house-input h-9 w-full" defaultValue="email@address.com" /><input className="house-input h-9 w-full" defaultValue="password" type="password" /><button className="house-button-action-primary h-9 w-full">Sign in</button></div></div></Scene> }

export const SettingsPage: Story = { render: () => <Scene title="Settings" tone="account"><div className="space-y-2">{mockInvitations.map((item)=><div key={item.id} className="rounded-md border border-border bg-card p-3 text-sm">{item.name} preference: {item.status}</div>)}</div></Scene> }

