import { NavLink } from 'react-router-dom'

import { ScrollArea } from '@/components/ui/scroll-area'
import { cn } from '@/lib/utils'

type AccountNavigatorProps = {
  onNavigate?: () => void
}

const ACCOUNT_LINKS = [
  { label: 'Profile', path: '/profile', helper: 'Identity, integrations, works' },
  { label: 'Impact', path: '/impact', helper: 'Citations, collaborators, themes' },
  { label: 'Settings', path: '/settings', helper: 'Preferences and account defaults' },
]

export function AccountNavigator({ onNavigate }: AccountNavigatorProps) {
  return (
    <aside className="flex h-full flex-col bg-card">
      <div className="space-y-1 border-b border-border p-4">
        <h1 className="text-sm font-semibold leading-tight">Account</h1>
        <p className="text-xs text-muted-foreground">Global profile and impact settings</p>
      </div>
      <ScrollArea className="flex-1">
        <nav className="space-y-1 p-3">
          {ACCOUNT_LINKS.map((item) => (
            <NavLink
              key={item.path}
              to={item.path}
              onClick={onNavigate}
              className={({ isActive }) =>
                cn(
                  'block rounded-md border border-transparent px-3 py-2 text-sm transition-colors',
                  'text-muted-foreground hover:border-border hover:text-foreground',
                  isActive && 'border-border bg-accent/55 text-foreground',
                )
              }
            >
              <p className="font-medium">{item.label}</p>
              <p className="text-xs text-muted-foreground">{item.helper}</p>
            </NavLink>
          ))}
        </nav>
      </ScrollArea>
    </aside>
  )
}
