import { useCallback, useRef } from 'react'
import { NavLink } from 'react-router-dom'

import { ScrollArea } from '@/components/ui/scroll-area'
import { getAuthSessionToken } from '@/lib/auth-session'
import { fetchOrcidStatus, fetchPersonaState } from '@/lib/impact-api'
import { writeCachedPersonaState } from '@/lib/persona-cache'
import { cn } from '@/lib/utils'

type AccountNavigatorProps = {
  onNavigate?: () => void
}

const INTEGRATIONS_ORCID_STATUS_CACHE_KEY = 'aawe_integrations_orcid_status_cache'
const PROFILE_PREFETCH_LAST_AT_KEY = 'aawe_profile_prefetch_last_at'
const PROFILE_PREFETCH_MIN_INTERVAL_MS = 45_000

const ACCOUNT_LINKS = [
  { label: 'Profile home', path: '/profile', end: true },
  { label: 'Publications', path: '/profile/publications' },
  { label: 'Collaboration', path: '/account/collaboration' },
  { label: 'Impact', path: '/impact' },
  { label: 'Settings & preferences', path: '/settings' },
  { label: 'Personal details', path: '/profile/personal-details' },
  { label: 'Integrations', path: '/profile/integrations' },
]

const accountNavItemBase =
  'relative flex items-center rounded-md border px-3 py-1.5 text-label font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--tone-accent-500))]'
const accountNavItemIdle =
  'border-transparent text-[hsl(var(--tone-neutral-700))] hover:border-[hsl(var(--tone-accent-200))] hover:bg-[hsl(var(--tone-accent-50))] hover:text-[hsl(var(--tone-accent-800))]'
const accountNavItemActive =
  'border-[hsl(var(--tone-accent-200))] bg-[hsl(var(--tone-accent-100))] text-[hsl(var(--tone-accent-900))]'

export function AccountNavigator({ onNavigate }: AccountNavigatorProps) {
  const prefetchInFlight = useRef(false)
  const prefetchProfileData = useCallback(async () => {
    if (prefetchInFlight.current) {
      return
    }
    const token = getAuthSessionToken()
    if (!token) {
      return
    }
    const lastAtRaw = window.localStorage.getItem(PROFILE_PREFETCH_LAST_AT_KEY) || '0'
    const lastAt = Number(lastAtRaw)
    if (!Number.isNaN(lastAt) && Date.now() - lastAt < PROFILE_PREFETCH_MIN_INTERVAL_MS) {
      return
    }

    prefetchInFlight.current = true
    try {
      const settled = await Promise.allSettled([fetchPersonaState(token), fetchOrcidStatus(token)])
      const [personaResult, orcidResult] = settled
      if (personaResult.status === 'fulfilled') {
        writeCachedPersonaState(personaResult.value)
      }
      if (orcidResult.status === 'fulfilled') {
        window.localStorage.setItem(
          INTEGRATIONS_ORCID_STATUS_CACHE_KEY,
          JSON.stringify(orcidResult.value),
        )
      }
      window.localStorage.setItem(PROFILE_PREFETCH_LAST_AT_KEY, String(Date.now()))
    } finally {
      prefetchInFlight.current = false
    }
  }, [])

  return (
    <aside className="flex h-full flex-col bg-card">
      <div className="border-b border-[hsl(var(--tone-neutral-200))] px-4 py-3.5">
        <h1 className="text-label font-semibold text-[hsl(var(--tone-neutral-900))]">Profile sections</h1>
      </div>
      <ScrollArea className="flex-1">
        <nav className="space-y-1.5 p-3">
          {ACCOUNT_LINKS.map((item) => {
            const shouldPrefetch =
              item.path === '/profile' ||
              item.path === '/profile/personal-details' ||
              item.path === '/profile/integrations' ||
              item.path === '/profile/publications'
            return (
              <NavLink
                key={item.path}
                to={item.path}
                end={item.end}
                onClick={onNavigate}
                onMouseEnter={() => {
                  if (shouldPrefetch) {
                    void prefetchProfileData()
                  }
                }}
                onFocus={() => {
                  if (shouldPrefetch) {
                    void prefetchProfileData()
                  }
                }}
                className={({ isActive }) =>
                  cn(accountNavItemBase, accountNavItemIdle, isActive && accountNavItemActive)
                }
              >
                {({ isActive }) => (
                  <>
                    <span
                      aria-hidden
                      className={cn(
                        'absolute left-1.5 top-1/2 h-4 w-0.5 -translate-y-1/2 rounded-full bg-transparent transition-colors',
                        isActive && 'bg-[hsl(var(--tone-accent-500))]',
                      )}
                    />
                    <span className="truncate pl-2">{item.label}</span>
                  </>
                )}
              </NavLink>
            )
          })}
        </nav>
      </ScrollArea>
    </aside>
  )
}
