import { Link, NavLink } from 'react-router-dom'

import { Badge } from '@/components/ui/badge'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Separator } from '@/components/ui/separator'
import { cn } from '@/lib/utils'

type NavItem = {
  label: string
  to: string
}

const projectItems: NavItem[] = [
  { label: 'Overview', to: '/overview' },
  { label: 'Study Core', to: '/study-core' },
  { label: 'Results', to: '/results' },
  { label: 'Literature', to: '/literature' },
  { label: 'Journal Targeting', to: '/journal-targeting' },
  { label: 'QC Dashboard', to: '/qc' },
]

const manuscriptItems: NavItem[] = [
  { label: 'Title', to: '/manuscript/title' },
  { label: 'Abstract', to: '/manuscript/abstract' },
  { label: 'Introduction', to: '/manuscript/introduction' },
  { label: 'Methods', to: '/manuscript/methods' },
  { label: 'Results', to: '/manuscript/results' },
  { label: 'Discussion', to: '/manuscript/discussion' },
  { label: 'Limitations', to: '/manuscript/limitations' },
  { label: 'Conclusion', to: '/manuscript/conclusion' },
  { label: 'Figures', to: '/manuscript/figures' },
  { label: 'Tables', to: '/manuscript/tables' },
]

const advancedItems: NavItem[] = [
  { label: 'Claim Map', to: '/claim-map' },
  { label: 'Version History', to: '/versions' },
  { label: 'Audit Log', to: '/audit' },
  { label: 'Inference Rules', to: '/inference-rules' },
  { label: 'Agent Logs', to: '/agent-logs' },
]

type StudyNavigatorProps = {
  onNavigate?: () => void
}

function Group({ title, items, onNavigate }: { title: string; items: NavItem[]; onNavigate?: () => void }) {
  return (
    <section className="space-y-2">
      <p className="px-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">{title}</p>
      <nav className="space-y-1">
        {items.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            onClick={onNavigate}
            className={({ isActive }) =>
              cn(
                'block rounded-md px-2 py-1.5 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground',
                isActive && 'bg-accent text-accent-foreground',
              )
            }
          >
            {item.label}
          </NavLink>
        ))}
      </nav>
    </section>
  )
}

export function StudyNavigator({ onNavigate }: StudyNavigatorProps) {
  return (
    <aside className="flex h-full flex-col bg-card">
      <div className="space-y-2 border-b border-border p-4">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold">Study Navigator</h2>
          <Badge variant="secondary">v0.1</Badge>
        </div>
        <p className="text-xs text-muted-foreground">Project: HF Registry Manuscript</p>
        <Link to="/overview" className="text-xs text-primary hover:underline" onClick={onNavigate}>
          Open project overview
        </Link>
      </div>
      <ScrollArea className="flex-1">
        <div className="space-y-4 p-3">
          <Group title="Project" items={projectItems} onNavigate={onNavigate} />
          <Separator />
          <Group title="Manuscript" items={manuscriptItems} onNavigate={onNavigate} />
          <Separator />
          <Group title="Advanced" items={advancedItems} onNavigate={onNavigate} />
        </div>
      </ScrollArea>
    </aside>
  )
}
