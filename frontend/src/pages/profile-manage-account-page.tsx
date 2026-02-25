import { useCallback, useEffect, useState } from 'react'
import { Loader2 } from 'lucide-react'
import { useNavigate } from 'react-router-dom'

import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { clearAuthSessionToken, getAuthSessionToken } from '@/lib/auth-session'
import { houseLayout, houseSurfaces, houseTypography } from '@/lib/house-style'
import { deleteMe, fetchMe, updateMe } from '@/lib/impact-api'
import { cn } from '@/lib/utils'
import type { AuthUser } from '@/types/impact'

const ACCOUNT_CACHE_KEYS = [
  'aawe_integrations_user_cache',
  'aawe_integrations_orcid_status_cache',
  'aawe_profile_prefetch_last_at',
]

const ACCOUNT_CACHE_PREFIXES = [
  'aawe_profile_personal_details:',
  'aawe_orcid_sync_summary:',
  'aawe_orcid_active_sync_job:',
]
const HOUSE_PAGE_TITLE_CLASS = houseTypography.title
const HOUSE_PAGE_SUBTITLE_CLASS = houseTypography.subtitle
const HOUSE_FIELD_LABEL_CLASS = houseTypography.fieldLabel
const HOUSE_HELPER_TEXT_CLASS = houseTypography.fieldHelper

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
    <section data-house-role="page" className="space-y-4">
      <header
        data-house-role="page-header"
        className={cn(houseLayout.pageHeader, houseSurfaces.leftBorder, houseSurfaces.leftBorderAccount)}
      >
        <h1 data-house-role="page-title" className={HOUSE_PAGE_TITLE_CLASS}>Manage account</h1>
        <p data-house-role="page-subtitle" className={HOUSE_PAGE_SUBTITLE_CLASS}>
          Password and account lifecycle controls for this profile.
        </p>
      </header>

      <Card data-house-role="section-card" className="border-[hsl(var(--tone-neutral-200))]">
        <CardHeader className="pb-2">
          <CardTitle data-house-role="section-title">Change password</CardTitle>
          <CardDescription data-house-role="section-subtitle">
            Use a strong password with uppercase, lowercase, and numeric characters.
          </CardDescription>
        </CardHeader>
        <CardContent data-house-role="section-content" className="space-y-3">
          <div className="grid gap-3 md:max-w-xl md:grid-cols-2">
            <label data-house-role="field-group" className="space-y-1 md:col-span-2">
              <span data-house-role="field-label" className={HOUSE_FIELD_LABEL_CLASS}>New password</span>
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
              <span data-house-role="field-label" className={HOUSE_FIELD_LABEL_CLASS}>Confirm password</span>
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
        </CardContent>
      </Card>

      <Card data-house-role="section-card-danger" className="border-[hsl(var(--tone-danger-200))]">
        <CardHeader className="pb-2">
          <CardTitle data-house-role="section-title-danger" className="text-[hsl(var(--tone-danger-800))]">Delete account</CardTitle>
          <CardDescription data-house-role="section-subtitle">
            This permanently removes your sign-in and profile records. This action cannot be undone.
          </CardDescription>
        </CardHeader>
        <CardContent data-house-role="section-content" className="space-y-3">
          <p data-house-role="body-text" className={HOUSE_HELPER_TEXT_CLASS}>
            Account email: <span className="font-medium text-[hsl(var(--tone-neutral-900))]">{user?.email || 'Not available'}</span>
          </p>
          <label data-house-role="field-group" className="space-y-1 md:max-w-sm">
            <span data-house-role="field-label" className={HOUSE_FIELD_LABEL_CLASS}>Type DELETE to confirm</span>
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
        </CardContent>
      </Card>
    </section>
  )
}
