import { useCallback, useRef } from 'react'
import { NavLink } from 'react-router-dom'

import { ScrollArea } from '@/components/ui/scroll-area'
import { getAuthSessionToken } from '@/lib/auth-session'
import { houseLayout, houseNavigation, houseSurfaces, houseTypography } from '@/lib/house-style'
import { fetchOrcidStatus, fetchPersonaState } from '@/lib/impact-api'
import { writeCachedPersonaState } from '@/lib/persona-cache'
import { cn } from '@/lib/utils'

type AccountNavigatorProps = {
  onNavigate?: () => void
}

type AccountNavItem = {
  label: string
  path: string
  end?: boolean
}

type AccountNavSection = {
  label: string
  items: AccountNavItem[]
}

const INTEGRATIONS_ORCID_STATUS_CACHE_KEY = 'aawe_integrations_orcid_status_cache'
const PROFILE_PREFETCH_LAST_AT_KEY = 'aawe_profile_prefetch_last_at'
const PROFILE_PREFETCH_MIN_INTERVAL_MS = 45_000

const ACCOUNT_SECTIONS: AccountNavSection[] = [
  {
    label: 'Overview',
    items: [{ label: 'Profile home', path: '/profile', end: true }],
  },
  {
    label: 'Research',
    items: [
      { label: 'Publications', path: '/profile/publications' },
      { label: 'Collaboration', path: '/account/collaboration' },
      { label: 'Impact', path: '/impact' },
    ],
  },
  {
    label: 'Account',
    items: [
      { label: 'Personal details', path: '/profile/personal-details' },
      { label: 'Settings & preferences', path: '/settings' },
      { label: 'Integrations', path: '/profile/integrations' },
      { label: 'Manage account', path: '/profile/manage-account' },
    ],
  },
]

const PROFILE_PREFETCH_PATHS = new Set([
  '/profile',
  '/profile/publications',
  '/profile/personal-details',
  '/profile/integrations',
  '/profile/manage-account',
])

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
    <aside className={cn('flex h-full flex-col', houseLayout.sidebar)}>
      <div className={houseLayout.sidebarHeader}>
        <div className={cn(houseLayout.pageHeader, houseSurfaces.leftBorder)}>
          <h1 className={houseTypography.sectionTitle}>Profile</h1>
        </div>
      </div>
      <ScrollArea className="flex-1">
        <nav className="space-y-3 p-3">
          {ACCOUNT_SECTIONS.map((section) => (
            <section key={section.label} className={houseLayout.sidebarSection}>
              <p className={houseNavigation.sectionLabel}>
                {section.label}
              </p>
              <div className="space-y-1">
                {section.items.map((item) => (
                  <NavLink
                    key={item.path}
                    to={item.path}
                    end={item.end}
                    onClick={onNavigate}
                    onMouseEnter={() => {
                      if (PROFILE_PREFETCH_PATHS.has(item.path)) {
                        void prefetchProfileData()
                      }
                    }}
                    onFocus={() => {
                      if (PROFILE_PREFETCH_PATHS.has(item.path)) {
                        void prefetchProfileData()
                      }
                    }}
                    className={({ isActive }) =>
                      cn(houseNavigation.item, isActive && houseNavigation.itemActive)
                    }
                  >
                    <span className="truncate pl-2">{item.label}</span>
                  </NavLink>
                ))}
              </div>
            </section>
          ))}
        </nav>
      </ScrollArea>
    </aside>
  )
}
