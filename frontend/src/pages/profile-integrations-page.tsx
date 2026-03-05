import { useCallback, useEffect, useState } from 'react'
import { Loader2 } from 'lucide-react'
import { useNavigate } from 'react-router-dom'

import { PageHeader, Row, Section, SectionHeader, Stack, Subheading } from '@/components/primitives'
import { SectionMarker } from '@/components/patterns'
import { getSectionMarkerTone } from '@/lib/section-tone'
import { houseLayout } from '@/lib/house-style'
import { cn } from '@/lib/utils'
import { Button, Input } from '@/components/ui'
import { fetchMe, searchOpenAlexAuthors, updateMe } from '@/lib/impact-api'
import { clearAuthSessionToken, getAuthSessionToken } from '@/lib/auth-session'
import type { AuthUser } from '@/types/impact'

const HOUSE_SECTION_ANCHOR_CLASS = houseLayout.sectionAnchor
const INTEGRATIONS_USER_CACHE_KEY = 'aawe_integrations_user_cache'

type OpenAlexAuthorSearchItem = {
  id: string
  display_name: string
  works_count: number
  cited_by_count: number
  orcid: string | null
}

function loadCachedIntegrationsUser(): AuthUser | null {
  if (typeof window === 'undefined') {
    return null
  }
  const raw = window.localStorage.getItem(INTEGRATIONS_USER_CACHE_KEY)
  if (!raw) {
    return null
  }
  try {
    return JSON.parse(raw) as AuthUser
  } catch {
    return null
  }
}

function saveCachedIntegrationsUser(value: AuthUser): void {
  if (typeof window === 'undefined') {
    return
  }
  window.localStorage.setItem(INTEGRATIONS_USER_CACHE_KEY, JSON.stringify(value))
}

function clearCachedIntegrationsUser(): void {
  if (typeof window === 'undefined') {
    return
  }
  window.localStorage.removeItem(INTEGRATIONS_USER_CACHE_KEY)
}

export type ProfileIntegrationsPageFixture = {
  token?: string
  user?: AuthUser | null
  status?: string
  error?: string
}

type ProfileIntegrationsPageProps = {
  fixture?: ProfileIntegrationsPageFixture
}

export function ProfileIntegrationsPage({ fixture }: ProfileIntegrationsPageProps = {}) {
  const navigate = useNavigate()
  const isFixtureMode = Boolean(fixture)
  const initialCachedUser = fixture?.user ?? loadCachedIntegrationsUser()

  const [token, setToken] = useState<string>(() => fixture?.token ?? getAuthSessionToken())
  const [user, setUser] = useState<AuthUser | null>(initialCachedUser)
  const [loading, setLoading] = useState(false)
  const [updatingOpenAlexSettings, setUpdatingOpenAlexSettings] = useState(false)
  const [openAlexSearchQuery, setOpenAlexSearchQuery] = useState('')
  const [openAlexSearchResults, setOpenAlexSearchResults] = useState<OpenAlexAuthorSearchItem[]>([])
  const [openAlexSearchLoading, setOpenAlexSearchLoading] = useState(false)
  const [openAlexSearchError, setOpenAlexSearchError] = useState('')
  const [openAlexSelectedAuthorId, setOpenAlexSelectedAuthorId] = useState<string | null>(
    String(initialCachedUser?.openalex_author_id || '').trim() || null,
  )
  const [openAlexDraftIntegrationApproved, setOpenAlexDraftIntegrationApproved] = useState(
    Boolean(initialCachedUser?.openalex_integration_approved),
  )
  const [openAlexDraftAutoUpdateEnabled, setOpenAlexDraftAutoUpdateEnabled] = useState(
    Boolean(initialCachedUser?.openalex_auto_update_enabled),
  )
  const [status, setStatus] = useState(fixture?.status ?? '')
  const [error, setError] = useState(fixture?.error ?? '')

  const handleSessionExpiry = useCallback(
    (err: unknown): boolean => {
      const message = err instanceof Error ? err.message : ''
      const lowered = message.toLowerCase()
      const isExpired =
        lowered.includes('session is invalid or expired') ||
        lowered.includes('session was not found') ||
        lowered.includes('session token is required')
      if (!isExpired) {
        return false
      }
      clearAuthSessionToken()
      clearCachedIntegrationsUser()
      setToken('')
      navigate('/auth?next=/profile/integrations&reason=session_expired', { replace: true })
      return true
    },
    [navigate],
  )

  const loadData = useCallback(async (sessionToken: string) => {
    setLoading(true)
    setError('')
    try {
      const payload = await fetchMe(sessionToken)
      setUser(payload)
      saveCachedIntegrationsUser(payload)
    } catch (loadError) {
      if (handleSessionExpiry(loadError)) {
        return
      }
      setError(loadError instanceof Error ? loadError.message : 'Could not load integrations.')
    } finally {
      setLoading(false)
    }
  }, [handleSessionExpiry])

  useEffect(() => {
    if (isFixtureMode) {
      return
    }
    const sessionToken = getAuthSessionToken()
    setToken(sessionToken)
    if (!sessionToken) {
      clearCachedIntegrationsUser()
      navigate('/auth', { replace: true })
      return
    }
    void loadData(sessionToken)
  }, [isFixtureMode, loadData, navigate])

  useEffect(() => {
    if (user) {
      saveCachedIntegrationsUser(user)
      return
    }
    clearCachedIntegrationsUser()
  }, [user])

  useEffect(() => {
    const authorId = String(user?.openalex_author_id || '').trim()
    if (authorId && authorId !== openAlexSelectedAuthorId) {
      setOpenAlexSelectedAuthorId(authorId)
    }
    if (!authorId && openAlexSelectedAuthorId && !openAlexSearchResults.length) {
      setOpenAlexSelectedAuthorId(null)
    }
  }, [openAlexSearchResults.length, openAlexSelectedAuthorId, user?.openalex_author_id])

  useEffect(() => {
    setOpenAlexDraftIntegrationApproved(Boolean(user?.openalex_integration_approved))
    setOpenAlexDraftAutoUpdateEnabled(Boolean(user?.openalex_auto_update_enabled))
  }, [user?.openalex_auto_update_enabled, user?.openalex_integration_approved])

  const openAlexAuthorId = String(user?.openalex_author_id || '').trim()
  const hasConfirmedOpenAlexAuthor = Boolean(openAlexAuthorId)
  const openAlexIntegrationApproved = Boolean(user?.openalex_integration_approved)
  const openAlexAutoUpdateEnabled = Boolean(user?.openalex_auto_update_enabled)
  const openAlexSettingsBusy = Boolean(isFixtureMode) || !token || updatingOpenAlexSettings
  const openAlexPreferencesDirty =
    openAlexDraftIntegrationApproved !== openAlexIntegrationApproved ||
    openAlexDraftAutoUpdateEnabled !== openAlexAutoUpdateEnabled

  const onSearchOpenAlex = async () => {
    if (!token || isFixtureMode) {
      return
    }
    const query = openAlexSearchQuery.trim()
    if (query.length < 3) {
      setOpenAlexSearchError('Enter at least 3 characters to search OpenAlex.')
      return
    }
    setOpenAlexSearchLoading(true)
    setOpenAlexSearchError('')
    try {
      const payload = await searchOpenAlexAuthors(token, query, { limit: 12 })
      const results = Array.isArray(payload.results) ? payload.results : []
      setOpenAlexSearchResults(results)
      if (results.length <= 0) {
        setOpenAlexSearchError('No OpenAlex author profiles matched that name.')
        return
      }
      const existingAuthorId = String(user?.openalex_author_id || '').trim()
      const matchingExisting =
        existingAuthorId &&
        results.some((item) => String(item.id || '').trim() === existingAuthorId)
      if (matchingExisting) {
        setOpenAlexSelectedAuthorId(existingAuthorId)
      } else {
        setOpenAlexSelectedAuthorId(String(results[0]?.id || '').trim() || null)
      }
    } catch (searchError) {
      if (handleSessionExpiry(searchError)) {
        return
      }
      setOpenAlexSearchError(
        searchError instanceof Error
          ? searchError.message
          : 'OpenAlex author search failed.',
      )
    } finally {
      setOpenAlexSearchLoading(false)
    }
  }

  const onConfirmOpenAlexAuthor = async () => {
    if (!token || isFixtureMode) {
      return
    }
    const selectedId = String(openAlexSelectedAuthorId || '').trim()
    if (!selectedId) {
      setOpenAlexSearchError('Select an OpenAlex author profile first.')
      return
    }
    setUpdatingOpenAlexSettings(true)
    setError('')
    setStatus('')
    setOpenAlexSearchError('')
    try {
      const payload = await updateMe(token, { openalex_author_id: selectedId })
      setUser(payload)
      saveCachedIntegrationsUser(payload)
      setStatus(`OpenAlex profile confirmed (${selectedId}).`)
    } catch (confirmError) {
      if (handleSessionExpiry(confirmError)) {
        return
      }
      setError(
        confirmError instanceof Error
          ? confirmError.message
          : 'Could not confirm OpenAlex profile.',
      )
    } finally {
      setUpdatingOpenAlexSettings(false)
    }
  }

  const onClearOpenAlexAuthor = async () => {
    if (!token || isFixtureMode || openAlexSettingsBusy) {
      return
    }
    setUpdatingOpenAlexSettings(true)
    setError('')
    setStatus('')
    try {
      const payload = await updateMe(token, { openalex_author_id: null })
      setUser(payload)
      saveCachedIntegrationsUser(payload)
      setOpenAlexSelectedAuthorId(null)
      setStatus('OpenAlex profile cleared.')
    } catch (clearError) {
      if (handleSessionExpiry(clearError)) {
        return
      }
      setError(
        clearError instanceof Error
          ? clearError.message
          : 'Could not clear OpenAlex profile.',
      )
    } finally {
      setUpdatingOpenAlexSettings(false)
    }
  }

  const applyOpenAlexSettings = async (
    nextApproved: boolean,
    nextAutoUpdateEnabled: boolean,
  ) => {
    if (!token || isFixtureMode) {
      return
    }
    setUpdatingOpenAlexSettings(true)
    setError('')
    setStatus('')
    try {
      const payload = await updateMe(token, {
        openalex_integration_approved: nextApproved,
        openalex_auto_update_enabled: nextAutoUpdateEnabled,
      })
      setUser(payload)
      saveCachedIntegrationsUser(payload)
      setStatus('OpenAlex sync preferences updated.')
    } catch (settingsError) {
      if (handleSessionExpiry(settingsError)) {
        return
      }
      setError(
        settingsError instanceof Error
          ? settingsError.message
          : 'Could not update OpenAlex preferences.',
      )
    } finally {
      setUpdatingOpenAlexSettings(false)
    }
  }

  const onToggleOpenAlexApprovalDraft = (enabled: boolean) => {
    if (openAlexSettingsBusy) {
      return
    }
    if (enabled && !hasConfirmedOpenAlexAuthor) {
      setError('Search OpenAlex and confirm your author profile before approving integration.')
      return
    }
    setError('')
    setStatus('')
    const nextApproved = Boolean(enabled)
    setOpenAlexDraftIntegrationApproved(nextApproved)
    if (!nextApproved) {
      setOpenAlexDraftAutoUpdateEnabled(false)
    }
  }

  const onToggleOpenAlexAutoUpdateDraft = (enabled: boolean) => {
    if (openAlexSettingsBusy) {
      return
    }
    if (!openAlexDraftIntegrationApproved) {
      return
    }
    if (enabled && !hasConfirmedOpenAlexAuthor) {
      setError('Confirm your OpenAlex author profile before enabling auto-update.')
      return
    }
    setError('')
    setStatus('')
    setOpenAlexDraftAutoUpdateEnabled(Boolean(enabled))
  }

  const onSaveOpenAlexPreferences = async () => {
    if (openAlexSettingsBusy || !openAlexPreferencesDirty) {
      return
    }
    if (openAlexDraftIntegrationApproved && !hasConfirmedOpenAlexAuthor) {
      setError('Search OpenAlex and confirm your author profile before approving integration.')
      return
    }
    const nextApproved = Boolean(openAlexDraftIntegrationApproved)
    const nextAutoUpdate = nextApproved ? Boolean(openAlexDraftAutoUpdateEnabled) : false
    await applyOpenAlexSettings(nextApproved, nextAutoUpdate)
  }

  const statusLower = status.toLowerCase()
  const statusToneClass = error
    ? 'border-[hsl(var(--tone-danger-200))] bg-[hsl(var(--tone-danger-50))] text-[hsl(var(--tone-danger-800))]'
    : statusLower.includes('verify') || statusLower.includes('not configured')
      ? 'border-[hsl(var(--tone-warning-200))] bg-[hsl(var(--tone-warning-50))] text-[hsl(var(--tone-warning-800))]'
      : 'border-[hsl(var(--tone-positive-200))] bg-[hsl(var(--tone-positive-50))] text-[hsl(var(--tone-positive-700))]'

  return (
    <Stack data-house-role="page" space="sm">
      <Row
        align="center"
        gap="md"
        wrap={false}
        className="house-page-title-row"
      >
        <SectionMarker tone={getSectionMarkerTone('profile')} size="title" className="self-stretch h-auto" />
        <PageHeader
          heading="Integrations"
          description="Configure publication sync connections for your profile."
          className="!ml-0 !mt-0"
        />
      </Row>

      <Section className={cn(HOUSE_SECTION_ANCHOR_CLASS)} surface="transparent" inset="none" spaceY="none">
        <SectionHeader heading="OpenAlex" className="house-section-header-marker-aligned" />
        <div className="house-separator-main-heading-to-content house-metric-tile-shell rounded-md border p-3 hover:bg-[var(--metric-tile-bg-rest)] focus-visible:bg-[var(--metric-tile-bg-rest)]">
          <div className="space-y-3">
            <div className="flex w-full flex-wrap items-start justify-between gap-3">
              <div className="flex flex-wrap items-center gap-2.5">
                <span className="inline-flex h-7 w-7 items-center justify-center rounded-md bg-[hsl(var(--tone-accent-600))] text-xs font-semibold text-white">
                  OA
                </span>
                <Subheading>OpenAlex integration settings</Subheading>
              </div>
            </div>
          </div>
          <div className="space-y-3 pt-3 text-sm">
            <div className="rounded-md border border-[hsl(var(--tone-neutral-200))] bg-card p-3">
              <p className="text-label font-medium text-[hsl(var(--tone-neutral-900))]">
                Find and confirm your OpenAlex profile
              </p>
              <div className="mt-3 flex flex-wrap gap-2">
                <Input
                  type="text"
                  value={openAlexSearchQuery}
                  onChange={(event) => setOpenAlexSearchQuery(event.target.value)}
                  placeholder="e.g., Jane Smith"
                  className="min-w-[220px] flex-1"
                  disabled={openAlexSearchLoading || openAlexSettingsBusy}
                />
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => void onSearchOpenAlex()}
                  disabled={openAlexSearchLoading || openAlexSettingsBusy}
                >
                  {openAlexSearchLoading ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Searching...
                    </>
                  ) : (
                    'Search'
                  )}
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => void onConfirmOpenAlexAuthor()}
                  disabled={
                    openAlexSettingsBusy ||
                    !openAlexSelectedAuthorId ||
                    openAlexSelectedAuthorId === openAlexAuthorId
                  }
                >
                  Confirm profile
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => void onClearOpenAlexAuthor()}
                  disabled={openAlexSettingsBusy || !hasConfirmedOpenAlexAuthor}
                >
                  Clear profile
                </Button>
              </div>
              {hasConfirmedOpenAlexAuthor ? (
                <p className="mt-2 text-xs text-[hsl(var(--tone-neutral-600))]">
                  Confirmed author ID: <span className="font-semibold">{openAlexAuthorId}</span>
                </p>
              ) : null}
              {openAlexSearchError ? (
                <p className="mt-2 text-xs text-[hsl(var(--tone-danger-700))]">{openAlexSearchError}</p>
              ) : null}
              {openAlexSearchResults.length > 0 ? (
                <div className="mt-3 max-h-56 overflow-auto rounded-md border border-[hsl(var(--tone-neutral-200))]">
                  <ul className="divide-y divide-[hsl(var(--tone-neutral-200))]">
                    {openAlexSearchResults.map((item) => {
                      const itemId = String(item.id || '').trim()
                      return (
                        <li key={itemId} className="px-2.5 py-2">
                          <label className="flex cursor-pointer items-start gap-2">
                            <input
                              type="radio"
                              name="openalex-author-selection"
                              checked={openAlexSelectedAuthorId === itemId}
                              onChange={() => setOpenAlexSelectedAuthorId(itemId)}
                              className="mt-0.5 h-4 w-4 border-[hsl(var(--tone-neutral-300))] text-[hsl(var(--tone-accent-700))] focus:ring-[hsl(var(--tone-accent-500))]"
                            />
                            <span className="min-w-0">
                              <span className="block text-label font-medium text-[hsl(var(--tone-neutral-900))]">
                                {item.display_name || 'Unknown author'}
                              </span>
                              <span className="block text-micro text-[hsl(var(--tone-neutral-600))]">
                                {itemId} • Works {Math.max(0, Number(item.works_count || 0)).toLocaleString('en-GB')} • Citations {Math.max(0, Number(item.cited_by_count || 0)).toLocaleString('en-GB')}
                              </span>
                            </span>
                          </label>
                        </li>
                      )
                    })}
                  </ul>
                </div>
              ) : null}
            </div>

            <div className="rounded-md border border-[hsl(var(--tone-neutral-200))] bg-card p-3">
              <p className="text-label font-medium text-[hsl(var(--tone-neutral-900))]">
                OpenAlex sync eligibility
              </p>
              <div className="mt-3 space-y-2">
                <label className="flex items-start gap-2 rounded-md border border-[hsl(var(--tone-neutral-200))] px-2 py-1.5">
                  <input
                    type="checkbox"
                    checked={openAlexDraftIntegrationApproved}
                    disabled={openAlexSettingsBusy || !hasConfirmedOpenAlexAuthor}
                    onChange={(event) => onToggleOpenAlexApprovalDraft(event.target.checked)}
                    className="mt-0.5 h-4 w-4 rounded border-[hsl(var(--tone-neutral-300))] text-[hsl(var(--tone-accent-700))] focus:ring-[hsl(var(--tone-accent-500))]"
                  />
                  <span className="min-w-0">
                    <span className="block text-label font-medium text-[hsl(var(--tone-neutral-900))]">
                      Approve OpenAlex integration
                    </span>
                    <span className="mt-0.5 block text-micro text-[hsl(var(--tone-neutral-600))]">
                      Required before this account can be auto-synced.
                    </span>
                  </span>
                </label>

                <label className="flex items-start gap-2 rounded-md border border-[hsl(var(--tone-neutral-200))] px-2 py-1.5">
                  <input
                    type="checkbox"
                    checked={openAlexDraftAutoUpdateEnabled}
                    disabled={openAlexSettingsBusy || !openAlexDraftIntegrationApproved || !hasConfirmedOpenAlexAuthor}
                    onChange={(event) => onToggleOpenAlexAutoUpdateDraft(event.target.checked)}
                    className="mt-0.5 h-4 w-4 rounded border-[hsl(var(--tone-neutral-300))] text-[hsl(var(--tone-accent-700))] focus:ring-[hsl(var(--tone-accent-500))]"
                  />
                  <span className="min-w-0">
                    <span className="block text-label font-medium text-[hsl(var(--tone-neutral-900))]">
                      Auto update every 7 days
                    </span>
                    <span className="mt-0.5 block text-micro text-[hsl(var(--tone-neutral-600))]">
                      Enables scheduled weekly publication refresh for this account.
                    </span>
                  </span>
                </label>
              </div>

              <div className="mt-3 flex flex-wrap items-center gap-2">
                <Button
                  type="button"
                  size="sm"
                  variant="cta"
                  onClick={() => void onSaveOpenAlexPreferences()}
                  disabled={openAlexSettingsBusy || !openAlexPreferencesDirty}
                >
                  {updatingOpenAlexSettings ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Saving...
                    </>
                  ) : (
                    'Save preferences'
                  )}
                </Button>
                {openAlexPreferencesDirty ? (
                  <span className="text-xs text-[hsl(var(--tone-neutral-600))]">Unsaved changes.</span>
                ) : null}
              </div>

            </div>

            {status || error ? (
              <div className={`space-y-2 rounded-md border px-3 py-2 ${statusToneClass}`}>
                <p className="text-sm">{error || status}</p>
              </div>
            ) : null}
            {loading ? (
              <p className="text-xs text-[hsl(var(--tone-neutral-500))]">Loading integration state...</p>
            ) : null}
          </div>
        </div>
      </Section>
    </Stack>
  )
}
