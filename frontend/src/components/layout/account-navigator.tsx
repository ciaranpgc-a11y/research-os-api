import { Link, NavLink, useLocation } from 'react-router-dom'

import { ScrollArea } from '@/components/ui/scroll-area'
import { cn } from '@/lib/utils'

type AccountNavigatorProps = {
  onNavigate?: () => void
}

const ACCOUNT_LINKS = [
  { label: 'Profile home', path: '/profile' },
  { label: 'Impact', path: '/impact' },
  { label: 'Settings', path: '/settings' },
]

const PROFILE_SECTION_LINKS = [
  { label: 'Identity', hash: '#identity' },
  { label: 'Integrations', hash: '#integrations' },
  { label: 'Publications', hash: '#publications' },
  { label: 'Collaborators', hash: '#collaborators' },
  { label: 'AI analysis', hash: '#ai-analysis' },
  { label: 'Writing preferences', hash: '#writing-preferences' },
]

export function AccountNavigator({ onNavigate }: AccountNavigatorProps) {
  const location = useLocation()

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

        <div className="space-y-2 border-t border-border px-3 pb-4 pt-3">
          <p className="px-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Profile sections
          </p>
          <div className="space-y-1">
            {PROFILE_SECTION_LINKS.map((item) => {
              const isActiveProfileSection =
                location.pathname === '/profile' && location.hash === item.hash
              return (
                <Link
                  key={item.hash}
                  to={`/profile${item.hash}`}
                  onClick={onNavigate}
                  className={cn(
                    'block rounded-md border border-transparent px-3 py-2 text-sm transition-colors',
                    'text-muted-foreground hover:border-border hover:text-foreground',
                    isActiveProfileSection && 'border-border bg-accent/55 text-foreground',
                  )}
                >
                  {item.label}
                </Link>
              )
            })}
          </div>
        </div>
      </ScrollArea>
    </aside>
  )
}
