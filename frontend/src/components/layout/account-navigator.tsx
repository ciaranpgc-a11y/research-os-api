import { NavLink } from 'react-router-dom'

import { ScrollArea } from '@/components/ui/scroll-area'
import { cn } from '@/lib/utils'

type AccountNavigatorProps = {
  onNavigate?: () => void
}

const ACCOUNT_LINKS = [
  { label: 'Profile home', path: '/profile', end: true },
  { label: 'Integrations', path: '/profile/integrations' },
  { label: 'Publications', path: '/profile/publications' },
  { label: 'Impact', path: '/impact' },
  { label: 'Settings & preferences', path: '/settings' },
]

export function AccountNavigator({ onNavigate }: AccountNavigatorProps) {
  return (
    <aside className="flex h-full flex-col bg-card">
      <div className="border-b border-border p-4">
        <h1 className="text-sm font-semibold leading-tight">Account</h1>
      </div>
      <ScrollArea className="flex-1">
        <nav className="space-y-1 p-3">
          {ACCOUNT_LINKS.map((item) => (
            <NavLink
              key={item.path}
              to={item.path}
              end={item.end}
              onClick={onNavigate}
              className={({ isActive }) =>
                cn(
                  'block rounded-md border border-transparent px-3 py-2 text-sm font-medium transition-colors',
                  'text-muted-foreground hover:border-border hover:text-foreground',
                  isActive && 'border-border bg-accent/55 text-foreground',
                )
              }
            >
              {item.label}
            </NavLink>
          ))}
        </nav>
      </ScrollArea>
    </aside>
  )
}
