import { useCallback, useEffect, useState } from 'react'
import { Loader2 } from 'lucide-react'
import { useNavigate } from 'react-router-dom'

import { PageHeader, Row, Section, SectionHeader, Stack } from '@/components/primitives'
import { SectionMarker } from '@/components/patterns'
import { Button, Input } from '@/components/ui'
import { getSectionMarkerTone } from '@/lib/section-tone'
import { houseLayout } from '@/lib/house-style'
import { cn } from '@/lib/utils'
import { clearAuthSessionToken, getAuthSessionToken } from '@/lib/auth-session'
import { deleteMe, fetchMe, updateMe } from '@/lib/impact-api'
import { PageFrame } from '@/pages/page-frame'
import type { AuthUser } from '@/types/impact'

const HOUSE_SECTION_ANCHOR_CLASS = houseLayout.sectionAnchor

const ACCOUNT_CACHE_KEYS = [
  'aawe_integrations_user_cache',
  'aawe_integrations_orcid_status_cache',
  'aawe_profile_prefetch_last_at',
  'aawe_profile_collab_prefetch_last_at',
]

const ACCOUNT_CACHE_PREFIXES = [
  'aawe_collaboration_page_cache_v1:',
  'aawe_profile_personal_details:',
  'aawe_orcid_sync_summary:',
  'aawe_orcid_active_sync_job:',
]

function clearAccountCache(): void {
  if (typeof window === 'undefined') {
    return
  }

  for (const key of ACCOUNT_CACHE_KEYS) {
    window.localStorage.removeItem(key)
  }

  const prefixedKeys: string[] = []
  for (let index = 0; index < window.localStorage.length; index += 1) {
    const key = window.localStorage.key(index)
    if (!key) {
      continue
    }
    if (ACCOUNT_CACHE_PREFIXES.some((prefix) => key.startsWith(prefix))) {
      prefixedKeys.push(key)
    }
  }
  for (const key of prefixedKeys) {
    window.localStorage.removeItem(key)
  }
}

export function ProfileManageAccountPage() {
  const navigate = useNavigate()
  const [token, setToken] = useState(() => getAuthSessionToken())
  const [user, setUser] = useState<AuthUser | null>(null)
  const [loading, setLoading] = useState(true)

  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [passwordBusy, setPasswordBusy] = useState(false)
  const [passwordStatus, setPasswordStatus] = useState('')
  const [passwordError, setPasswordError] = useState('')

  const [deletePhrase, setDeletePhrase] = useState('')
  const [deleteBusy, setDeleteBusy] = useState(false)
  const [deleteError, setDeleteError] = useState('')

  const moveToAuth = useCallback(
    (reason: 'session_expired' | 'account_deleted') => {
      clearAuthSessionToken()
      clearAccountCache()
      navigate(`/auth?reason=${reason}`, { replace: true })
    },
    [navigate],
  )

  useEffect(() => {
    const sessionToken = getAuthSessionToken()
    if (!sessionToken) {
      navigate('/auth', { replace: true })
      return
    }

    setToken(sessionToken)
    const load = async () => {
      setLoading(true)
      setPasswordError('')
      setDeleteError('')
      try {
        const me = await fetchMe(sessionToken)
        setUser(me)
      } catch (loadError) {
        const message = loadError instanceof Error ? loadError.message : 'Could not load account.'
        if (message.toLowerCase().includes('session')) {
          moveToAuth('session_expired')
          return
        }
        setDeleteError(message)
      } finally {
        setLoading(false)
      }
    }
    void load()
  }, [moveToAuth, navigate])

  const onChangePassword = async () => {
    if (!token) {
      setPasswordError('Sign in again to change your password.')
      return
    }
    if (!password) {
      setPasswordError('New password is required.')
      return
    }
    if (password !== confirmPassword) {
      setPasswordError('Password confirmation does not match.')
      return
    }

    setPasswordBusy(true)
    setPasswordStatus('')
    setPasswordError('')
    try {
      const nextUser = await updateMe(token, { password })
      setUser(nextUser)
      setPassword('')
      setConfirmPassword('')
      setPasswordStatus('Password changed successfully.')
    } catch (updateError) {
      const message = updateError instanceof Error ? updateError.message : 'Password change failed.'
      if (message.toLowerCase().includes('session')) {
        moveToAuth('session_expired')
        return
      }
      setPasswordError(message)
    } finally {
      setPasswordBusy(false)
    }
  }

  const onDeleteAccount = async () => {
    if (!token) {
      setDeleteError('Sign in again to delete your account.')
      return
    }
    if (deletePhrase.trim().toUpperCase() !== 'DELETE') {
      setDeleteError('Type DELETE to confirm account deletion.')
      return
    }

    setDeleteBusy(true)
    setDeleteError('')
    try {
      await deleteMe(token, { confirmPhrase: 'DELETE' })
      moveToAuth('account_deleted')
    } catch (deleteAccountError) {
      const message = deleteAccountError instanceof Error ? deleteAccountError.message : 'Account deletion failed.'
      if (message.toLowerCase().includes('session')) {
        moveToAuth('session_expired')
        return
      }
      setDeleteError(message)
    } finally {
      setDeleteBusy(false)
    }
  }

  return (
    <PageFrame tone="profile" hideScaffoldHeader>
      <Stack data-house-role="page" space="sm">
        <Row
          align="center"
          gap="md"
          wrap={false}
          className="house-page-title-row"
        >
          <SectionMarker tone={getSectionMarkerTone('profile')} size="title" className="self-stretch h-auto" />
          <PageHeader
            heading="Manage account"
            description="Password and account lifecycle controls for this profile."
            className="!ml-0 !mt-0"
          />
        </Row>

        <Section className={cn(HOUSE_SECTION_ANCHOR_CLASS)} surface="transparent" inset="none" spaceY="md">
          <SectionHeader
            heading="Change password"
            className="house-section-header-marker-aligned"
          />
          <div className="house-metric-tile-shell rounded-md border p-3 hover:bg-[var(--metric-tile-bg-rest)] focus-visible:bg-[var(--metric-tile-bg-rest)]">
            <div className="space-y-3 text-sm">
              <div className="grid gap-3 md:max-w-xl md:grid-cols-2">
                <label data-house-role="field-group" className="space-y-1 md:col-span-2">
                  <span data-house-role="field-label" className="text-label font-medium text-[hsl(var(--foreground))]">New password</span>
                  <Input
                    type="password"
                    value={password}
                    onChange={(event) => setPassword(event.target.value)}
                    autoComplete="new-password"
                    placeholder="New password"
                    disabled={passwordBusy}
                  />
                </label>
                <label data-house-role="field-group" className="space-y-1 md:col-span-2">
                  <span data-house-role="field-label" className="text-label font-medium text-[hsl(var(--foreground))]">Confirm password</span>
                  <Input
                    type="password"
                    value={confirmPassword}
                    onChange={(event) => setConfirmPassword(event.target.value)}
                    autoComplete="new-password"
                    placeholder="Confirm password"
                    disabled={passwordBusy}
                  />
                </label>
              </div>

              <div data-house-role="action-row" className="flex flex-wrap items-center gap-2">
                <Button type="button" variant="housePrimary" onClick={() => void onChangePassword()} disabled={passwordBusy || loading}>
                  {passwordBusy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                  {passwordBusy ? 'Changing...' : 'Change password'}
                </Button>
              </div>

              {passwordStatus ? (
                <div data-house-role="status-success" className="rounded-md border border-[hsl(var(--tone-positive-200))] bg-[hsl(var(--tone-positive-50))] px-3 py-2 text-sm text-[hsl(var(--tone-positive-700))]">
                  {passwordStatus}
                </div>
              ) : null}
              {passwordError ? (
                <div data-house-role="status-error" className="rounded-md border border-[hsl(var(--tone-danger-200))] bg-[hsl(var(--tone-danger-50))] px-3 py-2 text-sm text-[hsl(var(--tone-danger-700))]">
                  {passwordError}
                </div>
              ) : null}
            </div>
          </div>
        </Section>

        <Section
          className={cn(HOUSE_SECTION_ANCHOR_CLASS, 'rounded-lg border border-[hsl(var(--tone-danger-200))] bg-[hsl(var(--tone-danger-50))]')}
          surface="transparent"
          inset="md"
          spaceY="md"
        >
          <SectionHeader
            heading="Delete account"
            description="This permanently removes your sign-in and profile records. This action cannot be undone."
            className="house-section-header-marker-aligned"
          />
          <p data-house-role="body-text" className="m-0 text-body-secondary text-[hsl(var(--muted-foreground))]">
            Account email: <span className="font-medium text-[hsl(var(--tone-neutral-900))]">{user?.email || 'Not available'}</span>
          </p>
          <label data-house-role="field-group" className="space-y-1 md:max-w-sm">
            <span data-house-role="field-label" className="text-label font-medium text-[hsl(var(--foreground))]">Type DELETE to confirm</span>
            <Input
              value={deletePhrase}
              onChange={(event) => setDeletePhrase(event.target.value)}
              placeholder="DELETE"
              disabled={deleteBusy}
            />
          </label>

          <div data-house-role="action-row" className="flex flex-wrap items-center gap-2">
            <Button
              type="button"
              variant="destructive"
              onClick={() => void onDeleteAccount()}
              disabled={deleteBusy || loading}
            >
              {deleteBusy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              {deleteBusy ? 'Deleting...' : 'Delete account'}
            </Button>
          </div>

          {deleteError ? (
            <div data-house-role="status-error" className="rounded-md border border-[hsl(var(--tone-danger-200))] bg-[hsl(var(--tone-danger-50))] px-3 py-2 text-sm text-[hsl(var(--tone-danger-700))]">
              {deleteError}
            </div>
          ) : null}
        </Section>
      </Stack>
    </PageFrame>
  )
}
