import { useCallback, useRef } from 'react'
import { NavLink } from 'react-router-dom'

import { ScrollArea } from '@/components/ui/scroll-area'
import { getAuthSessionToken } from '@/lib/auth-session'
import { fetchOrcidStatus, fetchPersonaState } from '@/lib/impact-api'
import { writeCachedPersonaState } from '@/lib/persona-cache'
import { cn } from '@/lib/utils'

type AccountLink = {
  label: string
  path: string
  end?: boolean
}

type AccountNavigatorProps = {
  onNavigate?: () => void
  links?: AccountLink[]
}

const INTEGRATIONS_ORCID_STATUS_CACHE_KEY = 'aawe_integrations_orcid_status_cache'
const PROFILE_PREFETCH_LAST_AT_KEY = 'aawe_profile_prefetch_last_at'
const PROFILE_PREFETCH_MIN_INTERVAL_MS = 45_000

const ACCOUNT_LINKS: AccountLink[] = [
  { label: 'Profile home', path: '/profile', end: true },
  { label: 'Integrations', path: '/profile/integrations' },
  { label: 'Publications', path: '/profile/publications' },
  { label: 'Collaboration', path: '/account/collaboration' },
  { label: 'Impact', path: '/impact' },
  { label: 'Settings & preferences', path: '/settings' },
]

const sidebarItemBase =
  'block rounded-md border border-transparent px-3 py-2 text-label font-medium leading-5 transition-colors'
const sidebarItemIdle = 'text-muted-foreground hover:bg-muted/45 hover:text-foreground'
const sidebarItemActive = 'border-border bg-accent/45 text-foreground'

export function AccountNavigator({ onNavigate, links }: AccountNavigatorProps) {
  const prefetchInFlight = useRef(false)
  const navLinks = links && links.length > 0 ? links : ACCOUNT_LINKS

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
    <aside className="flex h-full w-full flex-col bg-card">
      <div className="border-b border-border px-4 py-3">
        <h1 className="text-label font-semibold leading-5 text-foreground">Profile</h1>
      </div>
      <ScrollArea className="flex-1">
        <nav className="space-y-1 p-2">
          {navLinks.map((item) => {
            const shouldPrefetch =
              item.path === '/profile' ||
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
                  cn(sidebarItemBase, sidebarItemIdle, isActive && sidebarItemActive)
                }
              >
                {item.label}
              </NavLink>
            )
          })}
        </nav>
      </ScrollArea>
    </aside>
  )
}
