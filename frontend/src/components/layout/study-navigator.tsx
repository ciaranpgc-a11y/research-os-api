import { Link, NavLink } from 'react-router-dom'

import { NAV_GROUPS, type NavGroup, type NavItem } from '@/components/navigation/nav-config'
import { Badge } from '@/components/ui/badge'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Separator } from '@/components/ui/separator'
import { cn } from '@/lib/utils'

type StudyNavigatorProps = {
  onNavigate?: () => void
}

function Group({ group, onNavigate }: { group: NavGroup; onNavigate?: () => void }) {
  const itemIndent = group.title === 'MANUSCRIPT' ? 'pl-3' : ''
  return (
    <section className="space-y-2.5">
      <p className="px-2 text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">{group.title}</p>
      <nav className="space-y-1">
        {group.items.map((item: NavItem) => (
          <NavLink
            key={item.path}
            to={item.path}
            onClick={onNavigate}
            className={({ isActive }) =>
              cn(
                'group flex items-center justify-between rounded-md border-l-2 border-transparent px-2 py-1.5 text-sm text-muted-foreground transition-colors hover:bg-accent/60 hover:text-accent-foreground',
                itemIndent,
                isActive && 'border-l-primary bg-accent/80 text-accent-foreground',
              )
            }
          >
            <span>{item.label}</span>
            {item.badge ? (
              <Badge variant="secondary" className="h-5 min-w-5 px-1 text-[10px] font-medium">
                {item.badge}
              </Badge>
            ) : null}
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
        <div className="space-y-3 p-3">
          {NAV_GROUPS.map((group, index) => (
            <div key={group.title} className="space-y-3">
              <Group group={group} onNavigate={onNavigate} />
              {index < NAV_GROUPS.length - 1 ? <Separator /> : null}
            </div>
          ))}
        </div>
      </ScrollArea>
    </aside>
  )
}
