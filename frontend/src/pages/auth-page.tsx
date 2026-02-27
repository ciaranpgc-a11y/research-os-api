import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react'
import { Eye, EyeOff, Loader2 } from 'lucide-react'
import { useNavigate } from 'react-router-dom'

import { LoginCard } from '@/components/auth/LoginCard'
import { ButtonPrimitive } from '@/components/primitives/ButtonPrimitive'
import { InputPrimitive } from '@/components/primitives/InputPrimitive'
import { clearAuthSessionToken, getAuthSessionToken, isAuthBypassEnabled, setAuthSessionToken } from '@/lib/auth-session'
import {
  confirmEmailVerification,
  confirmPasswordReset,
  fetchOAuthConnect,
  fetchOAuthProviderStatuses,
  fetchMe,
  importOrcidWorks,
  loginAuth,
  loginAuthChallenge,
  pingApiHealth,
  registerAuth,
  requestEmailVerification,
  requestPasswordReset,
  verifyLoginTwoFactor,
} from '@/lib/impact-api'
import type { AuthOAuthProviderStatusItem } from '@/types/impact'

const LAST_AUTH_EMAIL_STORAGE_KEY = 'aawe-last-auth-email'
const ORCID_AUTO_SYNC_RESULT_STORAGE_KEY = 'aawe_orcid_auto_sync_result'
const ORCID_AUTO_SYNC_THROTTLE_STORAGE_KEY = 'aawe_orcid_auto_sync_last_at'
const ORCID_AUTO_SYNC_THROTTLE_MS = 1000 * 60 * 15
const TEST_ACCOUNT_EMAIL = String(import.meta.env.VITE_TEST_ACCOUNT_EMAIL || '').trim()
const TEST_ACCOUNT_PASSWORD = String(import.meta.env.VITE_TEST_ACCOUNT_PASSWORD || '').trim()
const SOCIAL_PROVIDERS = ['orcid', 'google', 'microsoft'] as const

type AuthMode = 'signin' | 'register'
type SocialProvider = (typeof SOCIAL_PROVIDERS)[number]
type OAuthSuccessMessagePayload = {
  type: 'aawe-oauth-success'
  payload: {
    provider: SocialProvider
    is_new_user: boolean
    user: {
      email: string
      email_verified_at: string | null
      orcid_id?: string | null
    }
    session_token: string
  }
}
type OAuthErrorMessagePayload = {
  type: 'aawe-oauth-error'
  provider?: SocialProvider
  error?: string
}

function providerLabel(provider: SocialProvider): string {
  if (provider === 'orcid') {
    return 'ORCID'
  }
  if (provider === 'google') {
    return 'Google'
  }
  return 'Microsoft'
}

function ProviderIcon({ provider }: { provider: SocialProvider }) {
  const initials = provider === 'orcid' ? 'OR' : provider === 'google' ? 'G' : 'M'
  return (
    <span
      aria-hidden
      className="inline-flex h-5 w-5 items-center justify-center rounded-sm border border-[hsl(var(--tone-neutral-300))] bg-[hsl(var(--tone-neutral-100))] text-caption font-semibold text-[hsl(var(--tone-neutral-700))]"
    >
      {initials}
    </span>
  )
}

function isLikelyEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim())
}

function isPlaceholderOAuthEmail(value: string): boolean {
  const clean = value.trim().toLowerCase()
  return clean.endsWith('@orcid.local') || clean.endsWith('@oauth.local')
}

function isStrongPassword(value: string): boolean {
  const password = value.trim()
  return password.length >= 10 && /[a-z]/.test(password) && /[A-Z]/.test(password) && /\d/.test(password)
}

export function AuthPage() {
  const navigate = useNavigate()
  const [mode, setMode] = useState<AuthMode>('signin')
  const [signInEmail, setSignInEmail] = useState('')
  const [signInPassword, setSignInPassword] = useState('')
  const [registerName, setRegisterName] = useState('')
  const [registerEmail, setRegisterEmail] = useState('')
  const [registerPassword, setRegisterPassword] = useState('')
  const [registerConfirmPassword, setRegisterConfirmPassword] = useState('')
  const [challengeToken, setChallengeToken] = useState('')
  const [twoFactorCode, setTwoFactorCode] = useState('')
  const [loading, setLoading] = useState(false)
  const [status, setStatus] = useState('')
  const [error, setError] = useState('')
  const [attemptedSignIn, setAttemptedSignIn] = useState(false)
  const [attemptedRegister, setAttemptedRegister] = useState(false)
  const [oauthProviders, setOauthProviders] = useState<AuthOAuthProviderStatusItem[]>([])
  const [resetEmail, setResetEmail] = useState('')
  const [resetCode, setResetCode] = useState('')
  const [resetPassword, setResetPassword] = useState('')
  const [showSignInPassword, setShowSignInPassword] = useState(false)
  const [showRegisterPassword, setShowRegisterPassword] = useState(false)
  const [showRegisterConfirmPassword, setShowRegisterConfirmPassword] = useState(false)
  const [showResetPanel, setShowResetPanel] = useState(false)
  const [awaitingEmailVerification, setAwaitingEmailVerification] = useState(false)
  const [verificationCode, setVerificationCode] = useState('')
  const [verificationDeliveryHint, setVerificationDeliveryHint] = useState('')
  const [verificationToken, setVerificationToken] = useState('')
  const [oauthPending, setOauthPending] = useState(false)
  const oauthPendingRef = useRef(false)
  const oauthPopupRef = useRef<Window | null>(null)
  const oauthPopupMonitorRef = useRef<number | null>(null)
  const oauthPopupClosedAtRef = useRef<number | null>(null)

  const hasTestAccountShortcut = Boolean(TEST_ACCOUNT_EMAIL && TEST_ACCOUNT_PASSWORD)

  const clearOAuthTransientState = () => {
    if (oauthPopupMonitorRef.current !== null) {
      window.clearInterval(oauthPopupMonitorRef.current)
      oauthPopupMonitorRef.current = null
    }
    if (oauthPopupRef.current && !oauthPopupRef.current.closed) {
      try {
        oauthPopupRef.current.close()
      } catch {
        // no-op
      }
    }
    oauthPopupRef.current = null
    oauthPopupClosedAtRef.current = null
    oauthPendingRef.current = false
    setOauthPending(false)
  }

  const persistLastEmail = (value: string) => {
    if (typeof window === 'undefined') {
      return
    }
    const clean = value.trim()
    if (!clean) {
      return
    }
    if (isPlaceholderOAuthEmail(clean)) {
      window.localStorage.removeItem(LAST_AUTH_EMAIL_STORAGE_KEY)
      return
    }
    window.localStorage.setItem(LAST_AUTH_EMAIL_STORAGE_KEY, clean)
  }

  const triggerOrcidAutoSync = (
    sessionToken: string,
    user: { orcid_id?: string | null } | null | undefined,
  ) => {
    if (typeof window === 'undefined') {
      return
    }
    if (!user?.orcid_id) {
      return
    }
    const now = Date.now()
    const lastSyncRaw = window.localStorage.getItem(ORCID_AUTO_SYNC_THROTTLE_STORAGE_KEY)
    const lastSync = Number(lastSyncRaw || '0')
    if (Number.isFinite(lastSync) && now - lastSync < ORCID_AUTO_SYNC_THROTTLE_MS) {
      return
    }
    window.localStorage.setItem(ORCID_AUTO_SYNC_THROTTLE_STORAGE_KEY, String(now))
    void importOrcidWorks(sessionToken)
      .then((payload) => {
        window.sessionStorage.setItem(
          ORCID_AUTO_SYNC_RESULT_STORAGE_KEY,
          JSON.stringify({
            imported_count: payload.imported_count,
            synced_at: payload.last_synced_at || new Date().toISOString(),
          }),
        )
      })
      .catch(() => {
        // Keep sign-in fast even when import sync is unavailable.
      })
  }

  const beginEmailVerificationGate = async (sessionToken: string, email: string, entryMessage: string) => {
    setVerificationToken(sessionToken)
    setAwaitingEmailVerification(true)
    setVerificationCode('')
    setMode('register')
    setRegisterEmail((previous) => previous || email)
    setSignInEmail((previous) => previous || email)
    setStatus(entryMessage)
    try {
      const verificationPayload = await requestEmailVerification(sessionToken)
      setVerificationDeliveryHint(verificationPayload.delivery_hint || 'Verification code generated.')
    } catch (verificationError) {
      setVerificationDeliveryHint('')
      setError(verificationError instanceof Error ? verificationError.message : 'Could not request verification code.')
    }
  }

  useEffect(() => {
    if (isAuthBypassEnabled()) {
      navigate('/profile/publications', { replace: true })
      return
    }

    const token = getAuthSessionToken()
    if (!token) {
      return
    }
    let active = true
    void (async () => {
      try {
        const user = await fetchMe(token)
        if (!active) {
          return
        }
        if (user.email_verified_at) {
          triggerOrcidAutoSync(token, user)
          navigate('/profile', { replace: true })
          return
        }
        await beginEmailVerificationGate(
          token,
          user.email,
          'Email verification is required before you can continue.',
        )
      } catch {
        clearAuthSessionToken()
      }
    })()
    return () => {
      active = false
    }
  }, [navigate])

  useEffect(() => {
    oauthPendingRef.current = oauthPending
  }, [oauthPending])

  useEffect(() => {
    const handler = (event: MessageEvent<OAuthSuccessMessagePayload | OAuthErrorMessagePayload>) => {
      if (event.origin !== window.location.origin) {
        return
      }
      const payload = event.data
      if (!payload || typeof payload !== 'object' || !('type' in payload)) {
        return
      }
      if (payload.type === 'aawe-oauth-error') {
        // Ignore stale OAuth error events unless this page currently has
        // an active OAuth attempt in flight.
        if (!oauthPendingRef.current) {
          return
        }
        clearOAuthTransientState()
        setLoading(false)
        const detail = String(payload.error || 'OAuth callback failed.')
        if (detail.toLowerCase().includes('oauth state has already been used')) {
          const providerName = payload.provider ? providerLabel(payload.provider) : 'OAuth'
          setError('')
          setStatus(`${providerName} sign-in session expired. Start sign-in again.`)
          return
        }
        setError(detail)
        return
      }
      if (payload.type === 'aawe-oauth-success') {
        clearOAuthTransientState()
        const session = payload.payload
        setLoading(false)
        setError('')
        if (session.user.email_verified_at) {
          setAuthSessionToken(session.session_token)
          persistLastEmail(session.user.email)
          triggerOrcidAutoSync(session.session_token, session.user)
          setStatus('Sign-in complete. Redirecting to profile...')
          navigate('/profile', { replace: true })
          return
        }
        void beginEmailVerificationGate(
          session.session_token,
          session.user.email,
          'Email verification is required before you can continue.',
        )
      }
    }
    window.addEventListener('message', handler)
    return () => window.removeEventListener('message', handler)
  }, [navigate])

  useEffect(() => {
    if (typeof window === 'undefined') {
      return
    }
    const storedEmail = window.localStorage.getItem(LAST_AUTH_EMAIL_STORAGE_KEY) || ''
    if (storedEmail && !isPlaceholderOAuthEmail(storedEmail)) {
      setSignInEmail(storedEmail)
      setResetEmail(storedEmail)
      return
    }
    if (storedEmail && isPlaceholderOAuthEmail(storedEmail)) {
      window.localStorage.removeItem(LAST_AUTH_EMAIL_STORAGE_KEY)
    }
  }, [])

  useEffect(() => {
    void (async () => {
      try {
        const payload = await fetchOAuthProviderStatuses()
        setOauthProviders(payload.providers || [])
      } catch {
        setOauthProviders([])
      }
    })()
  }, [])

  const providerByName = useMemo(() => {
    const map = new Map<SocialProvider, AuthOAuthProviderStatusItem>()
    for (const provider of oauthProviders) {
      const key = provider.provider as SocialProvider
      map.set(key, provider)
    }
    return map
  }, [oauthProviders])

  const registerValidationMessage = useMemo(() => {
    if (registerName.trim().length < 2) {
      return 'Name must be at least 2 characters.'
    }
    if (!isLikelyEmail(registerEmail)) {
      return 'Enter a valid email address.'
    }
    if (!isStrongPassword(registerPassword)) {
      return 'Password must be 10+ characters with uppercase, lowercase, and numeric characters.'
    }
    if (registerPassword !== registerConfirmPassword) {
      return 'Password confirmation does not match.'
    }
    return ''
  }, [registerConfirmPassword, registerEmail, registerName, registerPassword])

  const loginValidationMessage = useMemo(() => {
    if (!isLikelyEmail(signInEmail)) {
      return 'Enter a valid email address.'
    }
    if (!signInPassword.trim()) {
      return 'Password is required.'
    }
    return ''
  }, [signInEmail, signInPassword])

  const registerPasswordChecks = useMemo(() => {
    const password = registerPassword.trim()
    return {
      length: password.length >= 10,
      lower: /[a-z]/.test(password),
      upper: /[A-Z]/.test(password),
      number: /\d/.test(password),
      matches: registerPassword === registerConfirmPassword && registerConfirmPassword.length > 0,
    }
  }, [registerConfirmPassword, registerPassword])
  const hasRegisterInput =
    registerName.trim().length > 0 ||
    registerEmail.trim().length > 0 ||
    registerPassword.length > 0 ||
    registerConfirmPassword.length > 0

  const resetValidationMessage = useMemo(() => {
    if (!isLikelyEmail(resetEmail)) {
      return 'Enter a valid email address.'
    }
    if (resetCode.trim() && !isStrongPassword(resetPassword)) {
      return 'Reset password must satisfy the password policy.'
    }
    return ''
  }, [resetCode, resetEmail, resetPassword])

  const onRegister = async () => {
    clearOAuthTransientState()
    setAttemptedRegister(true)
    if (registerValidationMessage) {
      setError(registerValidationMessage)
      setStatus('')
      return
    }
    setLoading(true)
    setError('')
    setStatus('')
    try {
      const payload = await registerAuth({ email: registerEmail, password: registerPassword, name: registerName })
      persistLastEmail(payload.user.email)
      await beginEmailVerificationGate(
        payload.session_token,
        payload.user.email,
        'Account created. Enter the verification code to continue.',
      )
    } catch (registerError) {
      const detail = registerError instanceof Error ? registerError.message : 'Registration failed.'
      if (detail.toLowerCase().includes('already exists')) {
        setMode('signin')
        setSignInEmail(registerEmail.trim())
        setShowResetPanel(false)
        setStatus('An account with this email already exists. Sign in or reset your password.')
        setError('')
      } else {
        setError(detail)
      }
    } finally {
      setLoading(false)
    }
  }

  const onResendVerification = async () => {
    const token = verificationToken || getAuthSessionToken()
    if (!token) {
      setError('Session expired. Sign in again to continue verification.')
      return
    }
    setLoading(true)
    setError('')
    setStatus('')
    try {
      const payload = await requestEmailVerification(token)
      setVerificationDeliveryHint(payload.delivery_hint || 'Verification code generated.')
      setStatus('Verification code refreshed.')
    } catch (verificationError) {
      setError(verificationError instanceof Error ? verificationError.message : 'Could not resend verification code.')
    } finally {
      setLoading(false)
    }
  }

  const onConfirmVerification = async () => {
    const token = verificationToken || getAuthSessionToken()
    if (!token) {
      setError('Session expired. Sign in again to continue verification.')
      return
    }
    if (!verificationCode.trim()) {
      setError('Verification code is required.')
      return
    }
    setLoading(true)
    setError('')
    setStatus('')
    try {
      const user = await confirmEmailVerification({ token, code: verificationCode })
      setAuthSessionToken(token)
      persistLastEmail(user.email)
      triggerOrcidAutoSync(token, user)
      setAwaitingEmailVerification(false)
      setStatus('Email verified. Redirecting to profile...')
      navigate('/profile', { replace: true })
    } catch (verificationError) {
      setError(verificationError instanceof Error ? verificationError.message : 'Email verification failed.')
    } finally {
      setLoading(false)
    }
  }

  const onSignIn = async () => {
    clearOAuthTransientState()
    setAttemptedSignIn(true)
    if (loginValidationMessage) {
      setError(loginValidationMessage)
      setStatus('')
      return
    }
    setLoading(true)
    setError('')
    setStatus('')
    setChallengeToken('')
    try {
      const payload = await loginAuthChallenge({ email: signInEmail, password: signInPassword })
      if (payload.status === 'authenticated' && payload.session) {
        persistLastEmail(payload.session.user.email)
        if (payload.session.user.email_verified_at) {
          setAuthSessionToken(payload.session.session_token)
          triggerOrcidAutoSync(payload.session.session_token, payload.session.user)
          setStatus('Signed in. Redirecting to profile...')
          navigate('/profile', { replace: true })
          return
        }
        await beginEmailVerificationGate(
          payload.session.session_token,
          payload.session.user.email,
          'Email verification is required before you can continue.',
        )
        return
      }
      if (payload.status === 'two_factor_required' && payload.challenge_token) {
        setChallengeToken(payload.challenge_token)
        setStatus('Two-factor code required. Enter your authenticator or backup code.')
        return
      }
      setError('Sign-in flow is incomplete. Please retry.')
    } catch (loginError) {
      const detail = loginError instanceof Error ? loginError.message : 'Sign-in failed.'
      const lower = detail.toLowerCase()
      const fallbackEligible = lower.includes('404') || lower.includes('not found') || lower.includes('login challenge')
      if (!fallbackEligible) {
        setError(detail)
        return
      }
      try {
        const session = await loginAuth({ email: signInEmail, password: signInPassword })
        persistLastEmail(session.user.email)
        if (session.user.email_verified_at) {
          setAuthSessionToken(session.session_token)
          triggerOrcidAutoSync(session.session_token, session.user)
          setStatus('Signed in. Redirecting to profile...')
          navigate('/profile', { replace: true })
          return
        }
        await beginEmailVerificationGate(
          session.session_token,
          session.user.email,
          'Email verification is required before you can continue.',
        )
      } catch (fallbackError) {
        const fallbackDetail = fallbackError instanceof Error ? fallbackError.message : 'Sign-in failed.'
        setError(fallbackDetail)
        if (fallbackDetail.toLowerCase().includes('invalid credentials')) {
          setStatus('Credentials not recognised. Use provider sign-in or reset your password.')
        }
      }
    } finally {
      setLoading(false)
    }
  }

  const onVerifyTwoFactor = async () => {
    if (!challengeToken) {
      return
    }
    setLoading(true)
    setError('')
    setStatus('')
    try {
      const payload = await verifyLoginTwoFactor({ challengeToken, code: twoFactorCode })
      persistLastEmail(payload.user.email)
      if (payload.user.email_verified_at) {
        setAuthSessionToken(payload.session_token)
        triggerOrcidAutoSync(payload.session_token, payload.user)
        setStatus('Two-factor verification complete. Redirecting...')
        navigate('/profile', { replace: true })
        return
      }
      await beginEmailVerificationGate(
        payload.session_token,
        payload.user.email,
        'Two-factor complete. Verify email before continuing.',
      )
    } catch (verifyError) {
      setError(verifyError instanceof Error ? verifyError.message : 'Two-factor verification failed.')
    } finally {
      setLoading(false)
    }
  }

  const onOAuth = async (provider: SocialProvider) => {
    const providerState = providerByName.get(provider)
    if (providerState && !providerState.configured) {
      setStatus(providerState.reason || `${providerLabel(provider)} sign-in is not configured.`)
      return
    }
    setLoading(true)
    setError('')
    setStatus('')
    clearOAuthTransientState()
    try {
      const payload = await fetchOAuthConnect(provider)
      if (provider === 'orcid') {
        setStatus('Redirecting to ORCID sign-in...')
        window.location.assign(payload.url)
        return
      }
      const popup = window.open(
        payload.url,
        `aawe-oauth-${provider}-${Date.now()}`,
        'popup=yes,width=560,height=760,resizable=yes,scrollbars=yes',
      )
      if (!popup) {
        window.location.assign(payload.url)
        return
      }
      oauthPopupRef.current = popup
      oauthPendingRef.current = true
      setOauthPending(true)
      setLoading(false)
      setStatus(`${providerLabel(provider)} sign-in window opened. Complete sign-in to continue.`)
      const startedAt = Date.now()
      const monitor = window.setInterval(() => {
        if (!popup.closed) {
          return
        }
        window.clearInterval(monitor)
        oauthPopupMonitorRef.current = null
        oauthPopupRef.current = null
        oauthPopupClosedAtRef.current = Date.now()
        oauthPendingRef.current = false
        setOauthPending(false)
        setLoading(false)
        if (Date.now() - startedAt < 2500) {
          return
        }
      }, 500)
      oauthPopupMonitorRef.current = monitor
    } catch (oauthError) {
      const detail = oauthError instanceof Error ? oauthError.message : `${providerLabel(provider)} sign-in failed.`
      if (detail.includes('(404)')) {
        setError(`${detail} Check backend deployment/API base configuration.`)
      } else {
        setError(detail)
      }
      setLoading(false)
    }
  }

  const onRequestReset = async () => {
    if (!isLikelyEmail(resetEmail)) {
      setError('Enter a valid email address.')
      setStatus('')
      return
    }
    setLoading(true)
    setError('')
    setStatus('')
    try {
      const payload = await requestPasswordReset(resetEmail)
      setStatus(payload.delivery_hint || 'Password reset request submitted.')
    } catch (resetError) {
      setError(resetError instanceof Error ? resetError.message : 'Password reset request failed.')
    } finally {
      setLoading(false)
    }
  }

  const onConfirmReset = async () => {
    if (!isLikelyEmail(resetEmail)) {
      setError('Enter a valid email address.')
      setStatus('')
      return
    }
    if (!resetCode.trim()) {
      setError('Reset code is required.')
      setStatus('')
      return
    }
    if (!isStrongPassword(resetPassword)) {
      setError('Reset password must satisfy the password policy.')
      setStatus('')
      return
    }
    setLoading(true)
    setError('')
    setStatus('')
    try {
      await confirmPasswordReset({
        email: resetEmail,
        code: resetCode,
        newPassword: resetPassword,
      })
      setStatus('Password reset complete. You can now sign in.')
      setSignInEmail(resetEmail)
      setSignInPassword('')
      setResetCode('')
      setResetPassword('')
      setMode('signin')
      setShowResetPanel(false)
    } catch (confirmError) {
      setError(confirmError instanceof Error ? confirmError.message : 'Password reset failed.')
    } finally {
      setLoading(false)
    }
  }

  const onUseTestAccount = () => {
    setSignInEmail(TEST_ACCOUNT_EMAIL)
    setSignInPassword(TEST_ACCOUNT_PASSWORD)
    setAttemptedSignIn(false)
    setError('')
    setStatus('Test account credentials inserted. Click Log in.')
  }

  const onWakeApi = async () => {
    setLoading(true)
    setStatus('')
    setError('')
    try {
      await pingApiHealth()
      setStatus('API is reachable. Retry sign in.')
    } catch (wakeError) {
      setError(wakeError instanceof Error ? wakeError.message : 'API wake-up failed.')
    } finally {
      setLoading(false)
    }
  }

  const authBrandVars: CSSProperties = {
    ['--auth-brand-navy' as string]: '217 49% 8%',
    ['--auth-brand-accent' as string]: '188 42% 30%',
    ['--auth-brand-accent-strong' as string]: '188 42% 24%',
  }

  const authLabelClass =
    'text-caption font-semibold uppercase tracking-[0.12em] text-[hsl(var(--tone-neutral-600))]'
  const authInputClass =
    'h-10 border-[hsl(var(--tone-neutral-200))] bg-card text-[hsl(var(--auth-brand-navy))] placeholder:text-[hsl(var(--tone-neutral-400))] focus-visible:ring-[hsl(var(--auth-brand-accent))]'
  const authPasswordWrapClass =
    'flex rounded-md border border-[hsl(var(--tone-neutral-200))] bg-card transition-colors focus-within:border-[hsl(var(--auth-brand-accent))] focus-within:ring-2 focus-within:ring-[hsl(var(--auth-brand-accent))]'
  const authPasswordToggleClass =
    'inline-flex h-10 w-10 shrink-0 items-center justify-center border-l border-[hsl(var(--tone-neutral-200))] text-[hsl(var(--tone-neutral-600))] transition-colors hover:text-[hsl(var(--auth-brand-navy))] focus-visible:outline-none'
  const authPrimaryButtonClass =
    'h-10 w-full bg-[hsl(var(--auth-brand-accent))] text-white hover:bg-[hsl(var(--auth-brand-accent-strong))]'
  const authSubtleActionClass =
    'text-label font-medium text-[hsl(var(--tone-neutral-600))] underline underline-offset-2 transition-colors hover:text-[hsl(var(--auth-brand-navy))]'
  const passwordCriteriaClass = (met: boolean): string =>
    met ? 'text-[hsl(var(--tone-accent-700))]' : 'text-[hsl(var(--tone-danger-700))]'

  const oauthActions = SOCIAL_PROVIDERS.map((provider) => {
    const config = providerByName.get(provider)
    const providerExplicitlyDisabled = Boolean(config && !config.configured)
    return {
      id: provider,
      label: providerLabel(provider),
      icon: <ProviderIcon provider={provider} />,
      onClick: () => {
        void onOAuth(provider)
      },
      disabled: loading || oauthPending || providerExplicitlyDisabled,
      title: providerExplicitlyDisabled
        ? config?.reason || `${providerLabel(provider)} is not configured`
        : providerLabel(provider),
    }
  })

  return (
    <div
      className="min-h-screen bg-[hsl(var(--tone-neutral-100))] px-4 py-8 sm:py-12"
      style={authBrandVars}
    >
      <LoginCard
        mode={mode}
        title={mode === 'signin' ? 'Welcome back' : 'Create account'}
        subtitle={
          mode === 'signin'
            ? 'Sign in to continue in your research workspace.'
            : 'Create your account to start in Axiomos.'
        }
        loading={loading}
        status={oauthPending ? '' : status}
        error={error}
        errorAction={
          error.toLowerCase().includes('could not reach api') ? (
            <ButtonPrimitive
              type="button"
              variant="secondary"
              size="sm"
              className="h-8 text-label"
              onClick={() => void onWakeApi()}
              disabled={loading}
            >
              Retry API connection
            </ButtonPrimitive>
          ) : null
        }
        oauthActions={oauthActions}
        onModeChange={(nextMode) => setMode(nextMode)}
        footer={
          mode === 'signin' ? (
            <p>
              New to Axiomos?{' '}
              <ButtonPrimitive
                type="button"
                className={authSubtleActionClass}
                onClick={() => setMode('register')}
              >
                Create an account
              </ButtonPrimitive>
            </p>
          ) : (
            <p>
              Already have an account?{' '}
              <ButtonPrimitive
                type="button"
                className={authSubtleActionClass}
                onClick={() => setMode('signin')}
              >
                Sign in
              </ButtonPrimitive>
            </p>
          )
        }
      >
        {mode === 'signin' ? (
          <div className="space-y-3">
            <div className="space-y-1">
              <label htmlFor="signin-email" className={authLabelClass}>Email address</label>
              <InputPrimitive
                id="signin-email"
                autoComplete="email"
                placeholder="email@address.com"
                value={signInEmail}
                onChange={(event) => setSignInEmail(event.target.value)}
                className={authInputClass}
              />
            </div>

            <div className="space-y-1">
              <label htmlFor="signin-password" className={authLabelClass}>Password</label>
              <div className={authPasswordWrapClass}>
                <InputPrimitive
                  id="signin-password"
                  autoComplete="current-password"
                  type={showSignInPassword ? 'text' : 'password'}
                  placeholder="Enter your password"
                  value={signInPassword}
                  onChange={(event) => setSignInPassword(event.target.value)}
                  className="h-10 border-0 bg-transparent shadow-none focus-visible:ring-0"
                />
                <ButtonPrimitive
                  type="button"
                  className={authPasswordToggleClass}
                  onClick={() => setShowSignInPassword((value) => !value)}
                  aria-label={showSignInPassword ? 'Hide password' : 'Show password'}
                >
                  {showSignInPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </ButtonPrimitive>
              </div>
            </div>

            <div className="flex items-center justify-between gap-2">
              <ButtonPrimitive
                type="button"
                className={authSubtleActionClass}
                onClick={() => {
                  setShowResetPanel((value) => !value)
                  if (!resetEmail) {
                    setResetEmail(signInEmail)
                  }
                }}
              >
                Forgot password?
              </ButtonPrimitive>
            </div>

            <ButtonPrimitive
              type="button"
              className={authPrimaryButtonClass}
              disabled={loading}
              onClick={() => void onSignIn()}
            >
              {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              {loading ? 'Please wait...' : 'Sign in'}
            </ButtonPrimitive>

            {hasTestAccountShortcut ? (
              <ButtonPrimitive
                type="button"
                variant="secondary"
                className="h-10 w-full border-[hsl(var(--tone-neutral-200))] text-label"
                onClick={onUseTestAccount}
                disabled={loading}
              >
                Use test account
              </ButtonPrimitive>
            ) : null}

            {attemptedSignIn && loginValidationMessage ? (
              <p className="text-sm text-[hsl(var(--tone-danger-700))]">{loginValidationMessage}</p>
            ) : null}

            {challengeToken ? (
              <div className="space-y-2 rounded-md border border-[hsl(var(--tone-accent-200))] bg-[hsl(var(--tone-accent-50))] p-3">
                <p className="text-caption font-semibold uppercase tracking-[0.12em] text-[hsl(var(--tone-accent-700))]">
                  Two-factor challenge
                </p>
                <InputPrimitive
                  id="two-factor-code"
                  autoComplete="one-time-code"
                  placeholder="6-digit code or backup code"
                  value={twoFactorCode}
                  onChange={(event) => setTwoFactorCode(event.target.value)}
                  className={authInputClass}
                />
                <ButtonPrimitive
                  type="button"
                  variant="secondary"
                  className="h-10 w-full border-[hsl(var(--tone-neutral-200))] text-label"
                  onClick={() => void onVerifyTwoFactor()}
                  disabled={loading || !twoFactorCode.trim()}
                >
                  Verify 2FA
                </ButtonPrimitive>
              </div>
            ) : null}

            {showResetPanel ? (
              <div className="space-y-2 rounded-md border border-[hsl(var(--tone-neutral-200))] bg-[hsl(var(--tone-neutral-50))] p-3">
                <p className="text-caption font-semibold uppercase tracking-[0.12em] text-[hsl(var(--tone-neutral-600))]">
                  Reset your password
                </p>
                <InputPrimitive
                  id="reset-email"
                  autoComplete="email"
                  placeholder="Account email"
                  value={resetEmail}
                  onChange={(event) => setResetEmail(event.target.value)}
                  className={authInputClass}
                />
                <ButtonPrimitive
                  type="button"
                  variant="secondary"
                  className="h-10 w-full border-[hsl(var(--tone-neutral-200))] text-label"
                  onClick={() => void onRequestReset()}
                  disabled={loading || !isLikelyEmail(resetEmail)}
                >
                  Request reset code
                </ButtonPrimitive>
                <InputPrimitive
                  id="reset-code"
                  placeholder="Reset code"
                  value={resetCode}
                  onChange={(event) => setResetCode(event.target.value)}
                  className={authInputClass}
                />
                <InputPrimitive
                  id="reset-password"
                  type="password"
                  placeholder="New password"
                  value={resetPassword}
                  onChange={(event) => setResetPassword(event.target.value)}
                  className={authInputClass}
                />
                <ButtonPrimitive
                  type="button"
                  variant="secondary"
                  className="h-10 w-full border-[hsl(var(--tone-neutral-200))] text-label"
                  onClick={() => void onConfirmReset()}
                  disabled={loading || !resetCode.trim() || !isStrongPassword(resetPassword)}
                >
                  Confirm password reset
                </ButtonPrimitive>
                {resetValidationMessage ? (
                  <p className="text-sm text-[hsl(var(--tone-danger-700))]">{resetValidationMessage}</p>
                ) : null}
              </div>
            ) : null}
          </div>
        ) : awaitingEmailVerification ? (
          <div className="space-y-3 rounded-md border border-[hsl(var(--tone-accent-200))] bg-[hsl(var(--tone-accent-50))] p-3">
            <p className="text-sm font-semibold text-[hsl(var(--auth-brand-navy))]">Verify your email</p>
            <p className="text-sm text-[hsl(var(--tone-neutral-700))]">
              We sent a verification code to <span className="font-semibold">{registerEmail.trim()}</span>.
            </p>
            {verificationDeliveryHint ? (
              <p className="text-sm text-[hsl(var(--tone-neutral-600))]">{verificationDeliveryHint}</p>
            ) : null}
            <InputPrimitive
              id="verification-code"
              autoComplete="one-time-code"
              placeholder="Enter verification code"
              value={verificationCode}
              onChange={(event) => setVerificationCode(event.target.value)}
              className={authInputClass}
            />
            <div className="flex flex-wrap gap-2">
              <ButtonPrimitive
                type="button"
                className="h-10 bg-[hsl(var(--auth-brand-accent))] text-white hover:bg-[hsl(var(--auth-brand-accent-strong))]"
                onClick={() => void onConfirmVerification()}
                disabled={loading || !verificationCode.trim()}
              >
                {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                Verify and continue
              </ButtonPrimitive>
              <ButtonPrimitive
                type="button"
                variant="secondary"
                className="h-10 border-[hsl(var(--tone-neutral-200))] text-label"
                onClick={() => void onResendVerification()}
                disabled={loading}
              >
                Resend code
              </ButtonPrimitive>
              <ButtonPrimitive
                type="button"
                variant="secondary"
                className="h-10 border-[hsl(var(--tone-neutral-200))] text-label"
                onClick={() => {
                  setAwaitingEmailVerification(false)
                  setMode('signin')
                }}
                disabled={loading}
              >
                Verify later
              </ButtonPrimitive>
            </div>
          </div>
        ) : (
          <div className="space-y-3">
            <div className="space-y-1">
              <label htmlFor="register-name" className={authLabelClass}>Full name</label>
              <InputPrimitive
                id="register-name"
                autoComplete="name"
                placeholder="Enter your name"
                value={registerName}
                onChange={(event) => setRegisterName(event.target.value)}
                className={authInputClass}
              />
            </div>
            <div className="space-y-1">
              <label htmlFor="register-email" className={authLabelClass}>Email address</label>
              <InputPrimitive
                id="register-email"
                autoComplete="email"
                placeholder="email@address.com"
                value={registerEmail}
                onChange={(event) => setRegisterEmail(event.target.value)}
                className={authInputClass}
              />
            </div>
            <div className="space-y-1">
              <label htmlFor="register-password" className={authLabelClass}>Password</label>
              <div className={authPasswordWrapClass}>
                <InputPrimitive
                  id="register-password"
                  autoComplete="new-password"
                  type={showRegisterPassword ? 'text' : 'password'}
                  placeholder="Create your password"
                  value={registerPassword}
                  onChange={(event) => setRegisterPassword(event.target.value)}
                  className="h-10 border-0 bg-transparent shadow-none focus-visible:ring-0"
                />
                <ButtonPrimitive
                  type="button"
                  className={authPasswordToggleClass}
                  onClick={() => setShowRegisterPassword((value) => !value)}
                  aria-label={showRegisterPassword ? 'Hide password' : 'Show password'}
                >
                  {showRegisterPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </ButtonPrimitive>
              </div>
            </div>
            <div className="space-y-1">
              <label htmlFor="register-confirm-password" className={authLabelClass}>Confirm password</label>
              <div className={authPasswordWrapClass}>
                <InputPrimitive
                  id="register-confirm-password"
                  autoComplete="new-password"
                  type={showRegisterConfirmPassword ? 'text' : 'password'}
                  placeholder="Confirm password"
                  value={registerConfirmPassword}
                  onChange={(event) => setRegisterConfirmPassword(event.target.value)}
                  className="h-10 border-0 bg-transparent shadow-none focus-visible:ring-0"
                />
                <ButtonPrimitive
                  type="button"
                  className={authPasswordToggleClass}
                  onClick={() => setShowRegisterConfirmPassword((value) => !value)}
                  aria-label={showRegisterConfirmPassword ? 'Hide confirm password' : 'Show confirm password'}
                >
                  {showRegisterConfirmPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </ButtonPrimitive>
              </div>
            </div>

            <div className="grid gap-1 text-sm sm:grid-cols-2">
              <p className={passwordCriteriaClass(registerPasswordChecks.length)}>10+ characters</p>
              <p className={passwordCriteriaClass(registerPasswordChecks.upper)}>Uppercase letter</p>
              <p className={passwordCriteriaClass(registerPasswordChecks.lower)}>Lowercase letter</p>
              <p className={passwordCriteriaClass(registerPasswordChecks.number)}>Number</p>
              <p className={`${passwordCriteriaClass(registerPasswordChecks.matches)} sm:col-span-2`}>
                Passwords match
              </p>
            </div>

            <ButtonPrimitive
              type="button"
              className={authPrimaryButtonClass}
              disabled={loading}
              onClick={() => void onRegister()}
            >
              {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              Create account
            </ButtonPrimitive>
            {(attemptedRegister || hasRegisterInput) && registerValidationMessage ? (
              <p className="text-sm text-[hsl(var(--tone-danger-700))]">{registerValidationMessage}</p>
            ) : null}
          </div>
        )}
      </LoginCard>
    </div>
  )
}








