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
  if (provider === 'orcid') {
    return (
      <span
        aria-hidden
        className="inline-flex h-[1.25rem] w-[1.25rem] items-center justify-center rounded-sm bg-transparent"
      >
        <svg viewBox="0 0 24 24" className="h-[1.05rem] w-[1.05rem]" aria-hidden>
          <circle cx="12" cy="12" r="11" fill="#A6CE39" />
          <text
            x="12"
            y="15.2"
            textAnchor="middle"
            fontSize="10.6"
            fontWeight="700"
            fontFamily="Arial, Helvetica, sans-serif"
            letterSpacing="-0.25"
            fill="#FFFFFF"
          >
            iD
          </text>
        </svg>
      </span>
    )
  }

  if (provider === 'google') {
    return (
      <span
        aria-hidden
        className="inline-flex h-[1.25rem] w-[1.25rem] items-center justify-center rounded-sm bg-transparent"
      >
        <svg viewBox="0 0 24 24" className="h-[1.03rem] w-[1.03rem]" aria-hidden>
          <path fill="#4285F4" d="M23.49 12.27c0-.79-.07-1.55-.2-2.27H12v4.29h6.46a5.52 5.52 0 0 1-2.39 3.62v3h3.86c2.26-2.08 3.56-5.15 3.56-8.64z" />
          <path fill="#34A853" d="M12 24c3.24 0 5.95-1.07 7.94-2.91l-3.86-3a7.16 7.16 0 0 1-10.66-3.76H1.43v3.09A12 12 0 0 0 12 24z" />
          <path fill="#FBBC05" d="M5.42 14.33a7.2 7.2 0 0 1 0-4.66V6.58H1.43a12 12 0 0 0 0 10.84l3.99-3.09z" />
          <path fill="#EA4335" d="M12 4.77c1.76 0 3.34.61 4.58 1.8l3.43-3.43C17.94 1.19 15.23 0 12 0A12 12 0 0 0 1.43 6.58l3.99 3.09A7.16 7.16 0 0 1 12 4.77z" />
        </svg>
      </span>
    )
  }

  return (
    <span
      aria-hidden
      className="inline-flex h-[1.25rem] w-[1.25rem] items-center justify-center rounded-sm bg-transparent"
    >
      <svg viewBox="0 0 24 24" className="h-[0.98rem] w-[0.98rem]" aria-hidden>
        <rect x="2" y="2" width="9" height="9" fill="#F25022" />
        <rect x="13" y="2" width="9" height="9" fill="#7FBA00" />
        <rect x="2" y="13" width="9" height="9" fill="#00A4EF" />
        <rect x="13" y="13" width="9" height="9" fill="#FFB900" />
      </svg>
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
  const [isPrimaryCtaHovered, setIsPrimaryCtaHovered] = useState(false)
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

  const authBrandVars: CSSProperties = {}

  const authLabelClass =
    'text-[0.68rem] font-medium uppercase tracking-[0.08em] text-[hsl(var(--tone-neutral-600))]'
  const authInputClass =
    '!h-7 !min-h-0 border-[hsl(var(--tone-neutral-500))] bg-card !text-[0.84rem] !font-normal !leading-[1.1] text-[hsl(var(--tone-neutral-900))] placeholder:text-[0.8rem] placeholder:text-[hsl(var(--tone-neutral-600))] hover:border-[hsl(var(--tone-neutral-600))] focus-visible:border-[hsl(var(--tone-accent-600))] focus-visible:ring-[hsl(var(--tone-accent-500))]'
  const authPasswordInputClass =
    `${authInputClass} !border-0 !bg-transparent !shadow-none !focus-visible:ring-0 !focus-visible:border-transparent`
  const authPasswordWrapClass =
    'flex h-7 items-center overflow-hidden rounded-md border border-[hsl(var(--tone-neutral-500))] bg-card transition-colors hover:border-[hsl(var(--tone-neutral-600))] focus-within:border-[hsl(var(--tone-neutral-700))] focus-within:ring-0'
  const authPasswordToggleClass =
    'inline-flex !h-full !min-h-0 w-10 shrink-0 items-center justify-center !rounded-none !border-0 border-l border-[hsl(var(--tone-neutral-500))] !bg-transparent !text-[hsl(var(--tone-neutral-500))] !shadow-none !transition-none !duration-0 !ease-linear !transform-none hover:!bg-transparent hover:!text-[hsl(var(--tone-neutral-700))] hover:!shadow-none hover:!transform-none !active:bg-transparent !active:shadow-none !active:scale-100 !active:translate-y-0 focus-visible:!outline-none focus-visible:!ring-0 focus-visible:!border-[hsl(var(--tone-neutral-500))] focus-visible:!shadow-none'
  const authPasswordToggleStyle: CSSProperties = {
    backgroundColor: 'transparent',
    boxShadow: 'none',
    transition: 'none',
    transform: 'none',
  }
  const authInputStyle: CSSProperties = {
    paddingBlock: '0',
    lineHeight: '1.1',
  }
  const authPrimaryButtonClass =
    'w-full !h-[calc(var(--button-auth-height)-6px)] !min-h-[calc(var(--button-auth-height)-6px)] !rounded-[0.25rem] !border px-[var(--space-3)] !text-[0.72rem] !font-medium uppercase tracking-[0.06em] !text-[hsl(var(--tone-neutral-50))] !transition-none !transform-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--tone-accent-500))] focus-visible:ring-offset-2 disabled:opacity-70 disabled:cursor-not-allowed !active:scale-100 !active:translate-y-0'
  const authPrimaryButtonStyle: CSSProperties = {
    height: 'calc(var(--button-auth-height, 2.5rem) - 6px)',
    minHeight: 'calc(var(--button-auth-height, 2.5rem) - 6px)',
    borderRadius: '0.25rem',
    fontSize: '0.72rem',
    fontWeight: 500,
    letterSpacing: '0.06em',
    textTransform: 'uppercase',
    paddingInline: 'var(--space-3)',
    borderColor: isPrimaryCtaHovered ? 'hsl(var(--tone-accent-900))' : 'hsl(var(--tone-accent-800))',
    backgroundColor: isPrimaryCtaHovered ? 'hsl(var(--tone-accent-800))' : 'hsl(var(--tone-accent-700))',
    color: 'hsl(var(--tone-neutral-50))',
    boxShadow: isPrimaryCtaHovered
      ? '0 0 0 2px hsl(var(--tone-neutral-50) / 0.24), var(--elevation-2)'
      : 'none',
    transition: 'none',
    animation: 'none',
    transform: 'none',
  }
  const authSecondaryButtonClassBlock =
    '!h-[calc(var(--button-auth-height)-8px)] !min-h-[calc(var(--button-auth-height)-8px)] w-full !rounded-[0.25rem] !border !border-[hsl(var(--tone-neutral-700))] !bg-white px-[var(--space-3)] !text-[0.74rem] !font-medium tracking-[0.01em] !text-[hsl(var(--tone-neutral-800))] !transition-none !transform-none !shadow-none !hover:bg-[hsl(var(--tone-neutral-100))] !hover:text-[hsl(var(--tone-neutral-900))] !hover:border-[hsl(var(--tone-neutral-800))] !hover:shadow-none !active:scale-100 !active:translate-y-0'
  const authSecondaryButtonClassInline =
    '!h-[calc(var(--button-auth-height)-8px)] !min-h-[calc(var(--button-auth-height)-8px)] !rounded-[0.25rem] !border !border-[hsl(var(--tone-neutral-700))] !bg-white px-[var(--space-3)] !text-[0.74rem] !font-medium tracking-[0.01em] !text-[hsl(var(--tone-neutral-800))] !transition-none !transform-none !shadow-none !hover:bg-[hsl(var(--tone-neutral-100))] !hover:text-[hsl(var(--tone-neutral-900))] !hover:border-[hsl(var(--tone-neutral-800))] !hover:shadow-none !active:scale-100 !active:translate-y-0'
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
        title={mode === 'signin' ? 'Access your research workspace' : 'Create your research workspace'}
        subtitle=""
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
        footer={
          mode === 'signin' ? (
            <div className="mt-3 text-center">
              <p className="text-[0.74rem] font-medium uppercase tracking-[0.08em] text-[hsl(var(--tone-neutral-600))]">
                Ready to start?
              </p>
              <a
                href="/register"
                className="mt-1 inline-block text-label font-medium underline underline-offset-2 !text-[hsl(var(--tone-neutral-900))] visited:!text-[hsl(var(--tone-neutral-900))] hover:!text-[hsl(var(--tone-accent-700))] active:!text-[hsl(var(--tone-accent-700))] transition-colors"
                onClick={(event) => {
                  event.preventDefault()
                  setMode('register')
                }}
              >
                Create your research workspace
              </a>
            </div>
          ) : (
            <div className="mt-3 text-center">
              <p className="text-[0.74rem] font-medium uppercase tracking-[0.08em] text-[hsl(var(--tone-neutral-600))]">
                Already have an account?
              </p>
              <a
                href="/auth"
                className="mt-1 inline-block text-label font-medium underline underline-offset-2 !text-[hsl(var(--tone-neutral-900))] visited:!text-[hsl(var(--tone-neutral-900))] hover:!text-[hsl(var(--tone-accent-700))] active:!text-[hsl(var(--tone-accent-700))] transition-colors"
                onClick={(event) => {
                  event.preventDefault()
                  setMode('signin')
                }}
              >
                Sign in
              </a>
            </div>
          )
        }
      >
        {mode === 'signin' ? (
          <div className="space-y-3">
            <div className="space-y-[0.3rem]">
              <label htmlFor="signin-email" className={authLabelClass}>Email address</label>
              <InputPrimitive
                id="signin-email"
                autoComplete="email"
                placeholder="email@address.com"
                value={signInEmail}
                onChange={(event) => setSignInEmail(event.target.value)}
                className={authInputClass}
                style={authInputStyle}
              />
            </div>

            <div className="space-y-[0.3rem]">
              <label htmlFor="signin-password" className={authLabelClass}>Password</label>
              <div className={authPasswordWrapClass}>
                <InputPrimitive
                  id="signin-password"
                  autoComplete="current-password"
                  type={showSignInPassword ? 'text' : 'password'}
                  placeholder="Enter your password"
                  value={signInPassword}
                  onChange={(event) => setSignInPassword(event.target.value)}
                  className={authPasswordInputClass}
                  style={authInputStyle}
                />
                <ButtonPrimitive
                  type="button"
                  className={authPasswordToggleClass}
                  style={authPasswordToggleStyle}
                  onClick={() => setShowSignInPassword((value) => !value)}
                  aria-label={showSignInPassword ? 'Hide password' : 'Show password'}
                >
                  {showSignInPassword ? <EyeOff className="h-8 w-8" strokeWidth={2} /> : <Eye className="h-8 w-8" strokeWidth={2} />}
                </ButtonPrimitive>
              </div>
            </div>

            <div className="flex items-center justify-between gap-2">
              <a
                href="/forgot-password"
                className={`
                  block
                  text-[0.74rem]
                  font-normal
                  text-[hsl(var(--tone-neutral-600))]
                  no-underline
                  transition-[color,text-decoration-color] duration-[var(--motion-duration-ui)]
                  hover:underline
                  hover:text-[hsl(var(--tone-neutral-800))]
                  focus-visible:underline
                  focus-visible:text-[hsl(var(--tone-neutral-800))]
                `}
                style={{ marginTop: '0' }}
                onClick={(event) => {
                  event.preventDefault()
                  setShowResetPanel((value) => !value)
                  if (!resetEmail) {
                    setResetEmail(signInEmail)
                  }
                }}
              >
                Reset password
              </a>
            </div>

            <ButtonPrimitive
              type="button"
              className={authPrimaryButtonClass}
              style={{ ...authPrimaryButtonStyle, marginTop: '1.3rem' }}
              onMouseEnter={() => setIsPrimaryCtaHovered(true)}
              onMouseLeave={() => setIsPrimaryCtaHovered(false)}
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
                className={authSecondaryButtonClassBlock}
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
                  style={authInputStyle}
                />
                <ButtonPrimitive
                  type="button"
                  variant="secondary"
                  className={authSecondaryButtonClassBlock}
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
                  style={authInputStyle}
                />
                <ButtonPrimitive
                  type="button"
                  variant="secondary"
                  className={authSecondaryButtonClassBlock}
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
                  style={authInputStyle}
                />
                <InputPrimitive
                  id="reset-password"
                  type="password"
                  placeholder="New password"
                  value={resetPassword}
                  onChange={(event) => setResetPassword(event.target.value)}
                  className={authInputClass}
                  style={authInputStyle}
                />
                <ButtonPrimitive
                  type="button"
                  variant="secondary"
                  className={authSecondaryButtonClassBlock}
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
            <p className="text-sm font-semibold text-[hsl(var(--tone-neutral-900))]">Verify your email</p>
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
              style={authInputStyle}
            />
            <div className="flex flex-wrap gap-2">
                <ButtonPrimitive
                  type="button"
                  className={authPrimaryButtonClass}
                  style={authPrimaryButtonStyle}
                  onMouseEnter={() => setIsPrimaryCtaHovered(true)}
                  onMouseLeave={() => setIsPrimaryCtaHovered(false)}
                  onClick={() => void onConfirmVerification()}
                  disabled={loading || !verificationCode.trim()}
                >
                {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                Verify and continue
              </ButtonPrimitive>
              <ButtonPrimitive
                type="button"
                variant="secondary"
                className={authSecondaryButtonClassInline}
                onClick={() => void onResendVerification()}
                disabled={loading}
              >
                Resend code
              </ButtonPrimitive>
              <ButtonPrimitive
                type="button"
                variant="secondary"
                className={authSecondaryButtonClassInline}
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
            <div className="space-y-[0.3rem]">
              <label htmlFor="register-name" className={authLabelClass}>Full name</label>
              <InputPrimitive
                id="register-name"
                autoComplete="name"
                placeholder="Enter your name"
                value={registerName}
                onChange={(event) => setRegisterName(event.target.value)}
                className={authInputClass}
                style={authInputStyle}
              />
            </div>
            <div className="space-y-[0.3rem]">
              <label htmlFor="register-email" className={authLabelClass}>Email address</label>
              <InputPrimitive
                id="register-email"
                autoComplete="email"
                placeholder="email@address.com"
                value={registerEmail}
                onChange={(event) => setRegisterEmail(event.target.value)}
                className={authInputClass}
                style={authInputStyle}
              />
            </div>
            <div className="space-y-[0.3rem]">
              <label htmlFor="register-password" className={authLabelClass}>Password</label>
              <div className={authPasswordWrapClass}>
                <InputPrimitive
                  id="register-password"
                  autoComplete="new-password"
                  type={showRegisterPassword ? 'text' : 'password'}
                  placeholder="Create your password"
                  value={registerPassword}
                  onChange={(event) => setRegisterPassword(event.target.value)}
                  className={authPasswordInputClass}
                  style={authInputStyle}
                />
                <ButtonPrimitive
                  type="button"
                  className={authPasswordToggleClass}
                  style={authPasswordToggleStyle}
                  onClick={() => setShowRegisterPassword((value) => !value)}
                  aria-label={showRegisterPassword ? 'Hide password' : 'Show password'}
                >
                  {showRegisterPassword ? <EyeOff className="h-8 w-8" strokeWidth={2} /> : <Eye className="h-8 w-8" strokeWidth={2} />}
                </ButtonPrimitive>
              </div>
            </div>
            <div className="space-y-[0.3rem]">
              <label htmlFor="register-confirm-password" className={authLabelClass}>Confirm password</label>
              <div className={authPasswordWrapClass}>
                <InputPrimitive
                  id="register-confirm-password"
                  autoComplete="new-password"
                  type={showRegisterConfirmPassword ? 'text' : 'password'}
                  placeholder="Confirm password"
                  value={registerConfirmPassword}
                  onChange={(event) => setRegisterConfirmPassword(event.target.value)}
                  className={authPasswordInputClass}
                  style={authInputStyle}
                />
                <ButtonPrimitive
                  type="button"
                  className={authPasswordToggleClass}
                  style={authPasswordToggleStyle}
                  onClick={() => setShowRegisterConfirmPassword((value) => !value)}
                  aria-label={showRegisterConfirmPassword ? 'Hide confirm password' : 'Show confirm password'}
                >
                  {showRegisterConfirmPassword ? <EyeOff className="h-8 w-8" strokeWidth={2} /> : <Eye className="h-8 w-8" strokeWidth={2} />}
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
              style={{ ...authPrimaryButtonStyle, marginTop: '1.3rem' }}
              onMouseEnter={() => setIsPrimaryCtaHovered(true)}
              onMouseLeave={() => setIsPrimaryCtaHovered(false)}
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








