import { NavLink } from 'react-router-dom'

import { NAV_GROUPS, type NavGroup, type NavItem } from '@/components/navigation/nav-config'
import { Badge } from '@/components/ui/badge'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Separator } from '@/components/ui/separator'
import { cn } from '@/lib/utils'

type StudyNavigatorProps = {
  onNavigate?: () => void
}

function badgeClass(item: NavItem): string {
  if (item.badgeTone === 'warning') {
    return 'border-amber-300/70 bg-amber-100 text-amber-700 dark:border-amber-500/50 dark:bg-amber-500/20 dark:text-amber-200'
  }
  return 'border-border bg-muted text-muted-foreground'
}

function Group({ group, onNavigate }: { group: NavGroup; onNavigate?: () => void }) {
  const itemIndent = group.title === 'MANUSCRIPT' ? 'pl-4' : ''
  return (
    <section className="space-y-2.5">
      <p className="px-2 text-xs font-medium uppercase tracking-wider text-muted-foreground/70 opacity-85">{group.title}</p>
      <nav className="space-y-1">
        {group.items.map((item: NavItem) => (
          <NavLink
            key={item.path}
            to={item.path}
            onClick={onNavigate}
            className={({ isActive }) =>
              cn(
                'group flex items-center justify-between rounded-md border-l-[3px] border-transparent px-2 py-1.5 text-sm text-muted-foreground transition-colors hover:bg-accent/70 hover:text-accent-foreground',
                itemIndent,
                item.dividerBefore && 'mt-2 border-t border-border pt-2',
                isActive && 'border-l-primary bg-accent text-accent-foreground font-medium',
              )
            }
          >
            <span>{item.label}</span>
            {item.badge ? (
              <Badge variant="outline" className={cn('h-5 min-w-5 px-1 text-[10px] font-medium', badgeClass(item))}>
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
        <h1 className="text-sm font-semibold leading-tight">HF Registry Manuscript</h1>
        <p className="text-xs text-muted-foreground">Research Workspace</p>
        <p className="text-xs text-muted-foreground">Version 0.1</p>
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
