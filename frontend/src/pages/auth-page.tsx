import { useEffect, useMemo, useState } from 'react'
import { Eye, EyeOff, Loader2 } from 'lucide-react'
import { useNavigate } from 'react-router-dom'

import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { clearAuthSessionToken, getAuthSessionToken, setAuthSessionToken } from '@/lib/auth-session'
import {
  confirmEmailVerification,
  confirmPasswordReset,
  fetchOAuthConnect,
  fetchOAuthProviderStatuses,
  fetchMe,
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
    }
    session_token: string
  }
}
type OAuthErrorMessagePayload = {
  type: 'aawe-oauth-error'
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
        className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-[#A6CE39] text-[10px] font-semibold text-white"
      >
        iD
      </span>
    )
  }
  if (provider === 'google') {
    return (
      <svg aria-hidden viewBox="0 0 24 24" className="h-5 w-5">
        <path
          fill="#EA4335"
          d="M12 10.2v3.9h5.4c-.2 1.2-.9 2.2-2 2.9l3.2 2.5c1.9-1.7 2.9-4.3 2.9-7.5 0-.7-.1-1.2-.2-1.8H12z"
        />
        <path
          fill="#34A853"
          d="M12 22c2.7 0 5-0.9 6.6-2.5l-3.2-2.5c-.9.6-2 1-3.4 1-2.6 0-4.8-1.8-5.6-4.2l-3.3 2.6C4.8 19.8 8.1 22 12 22z"
        />
        <path
          fill="#4A90E2"
          d="M6.4 13.8c-.2-.6-.4-1.2-.4-1.8s.1-1.2.4-1.8L3.1 7.6C2.4 9 2 10.5 2 12s.4 3 1.1 4.4l3.3-2.6z"
        />
        <path
          fill="#FBBC05"
          d="M12 6.8c1.5 0 2.8.5 3.8 1.4l2.8-2.8C17 3.9 14.7 3 12 3 8.1 3 4.8 5.2 3.1 7.6l3.3 2.6C7.2 8.6 9.4 6.8 12 6.8z"
        />
      </svg>
    )
  }
  return (
    <svg aria-hidden viewBox="0 0 24 24" className="h-5 w-5">
      <rect x="2" y="2" width="9" height="9" fill="#F35325" />
      <rect x="13" y="2" width="9" height="9" fill="#81BC06" />
      <rect x="2" y="13" width="9" height="9" fill="#05A6F0" />
      <rect x="13" y="13" width="9" height="9" fill="#FFBA08" />
    </svg>
  )
}

function isLikelyEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim())
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
  const [resetPreviewCode, setResetPreviewCode] = useState('')
  const [showSignInPassword, setShowSignInPassword] = useState(false)
  const [showRegisterPassword, setShowRegisterPassword] = useState(false)
  const [showResetPanel, setShowResetPanel] = useState(false)
  const [awaitingEmailVerification, setAwaitingEmailVerification] = useState(false)
  const [verificationCode, setVerificationCode] = useState('')
  const [verificationPreviewCode, setVerificationPreviewCode] = useState('')
  const [verificationDeliveryHint, setVerificationDeliveryHint] = useState('')
  const [verificationToken, setVerificationToken] = useState('')
  const [oauthPending, setOauthPending] = useState(false)

  const hasTestAccountShortcut = Boolean(TEST_ACCOUNT_EMAIL && TEST_ACCOUNT_PASSWORD)

  const persistLastEmail = (value: string) => {
    if (typeof window === 'undefined') {
      return
    }
    const clean = value.trim()
    if (!clean) {
      return
    }
    window.localStorage.setItem(LAST_AUTH_EMAIL_STORAGE_KEY, clean)
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
      setVerificationPreviewCode(verificationPayload.code_preview || '')
    } catch (verificationError) {
      setVerificationDeliveryHint('')
      setVerificationPreviewCode('')
      setError(verificationError instanceof Error ? verificationError.message : 'Could not request verification code.')
    }
  }

  useEffect(() => {
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
    const handler = (event: MessageEvent<OAuthSuccessMessagePayload | OAuthErrorMessagePayload>) => {
      if (event.origin !== window.location.origin) {
        return
      }
      const payload = event.data
      if (!payload || typeof payload !== 'object' || !('type' in payload)) {
        return
      }
      if (payload.type === 'aawe-oauth-error') {
        setOauthPending(false)
        setLoading(false)
        setError(payload.error || 'OAuth callback failed.')
        return
      }
      if (payload.type === 'aawe-oauth-success') {
        const session = payload.payload
        setOauthPending(false)
        setLoading(false)
        setError('')
        if (session.user.email_verified_at) {
          setAuthSessionToken(session.session_token)
          persistLastEmail(session.user.email)
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
    if (storedEmail) {
      setSignInEmail(storedEmail)
      setResetEmail(storedEmail)
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
      setVerificationPreviewCode(payload.code_preview || '')
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
    try {
      const payload = await fetchOAuthConnect(provider)
      const popup = window.open(
        payload.url,
        `aawe-oauth-${provider}`,
        'popup=yes,width=560,height=760,resizable=yes,scrollbars=yes',
      )
      if (!popup) {
        window.location.assign(payload.url)
        return
      }
      setOauthPending(true)
      setLoading(false)
      setStatus(`${providerLabel(provider)} sign-in window opened. Complete sign-in to continue.`)
      const startedAt = Date.now()
      const monitor = window.setInterval(() => {
        if (!popup.closed) {
          return
        }
        window.clearInterval(monitor)
        if (Date.now() - startedAt < 2500) {
          return
        }
        setOauthPending(false)
        setLoading(false)
      }, 500)
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
      setResetPreviewCode(payload.code_preview || '')
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

  return (
    <div className="min-h-screen bg-slate-100 px-4 py-10">
      <div className="mx-auto flex w-full max-w-[520px] flex-col items-center gap-5">
        <div className="text-3xl font-semibold tracking-tight text-slate-900">AAWE</div>

        <Card className="w-full border border-slate-200 bg-white shadow-sm">
          <CardContent className="space-y-4 p-6 sm:p-8">
            <div className="space-y-1">
              <h1 className="text-3xl font-semibold tracking-tight text-slate-900">
                {mode === 'signin' ? 'Welcome back' : 'Create account'}
              </h1>
              <p className="text-sm text-slate-600">
                {mode === 'signin' ? 'Log in with your AAWE account' : 'Create your AAWE account'}
              </p>
            </div>

            <div className="grid grid-cols-2 gap-1 rounded-md bg-slate-100 p-1">
              <button
                type="button"
                onClick={() => setMode('signin')}
                className={mode === 'signin' ? 'rounded bg-white px-3 py-1.5 text-sm font-medium shadow-sm' : 'rounded px-3 py-1.5 text-sm text-slate-600'}
              >
                Sign in
              </button>
              <button
                type="button"
                onClick={() => setMode('register')}
                className={mode === 'register' ? 'rounded bg-white px-3 py-1.5 text-sm font-medium shadow-sm' : 'rounded px-3 py-1.5 text-sm text-slate-600'}
              >
                Register
              </button>
            </div>

            {mode === 'signin' ? (
              <div className="space-y-3">
                <div className="space-y-1">
                  <label className="text-xs font-semibold tracking-wide text-slate-700">EMAIL ADDRESS</label>
                  <Input
                    autoComplete="email"
                    placeholder="email@address.com"
                    value={signInEmail}
                    onChange={(event) => setSignInEmail(event.target.value)}
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-semibold tracking-wide text-slate-700">PASSWORD</label>
                  <div className="flex rounded-md border border-input bg-background">
                    <Input
                      autoComplete="current-password"
                      type={showSignInPassword ? 'text' : 'password'}
                      placeholder="Enter your password"
                      value={signInPassword}
                      onChange={(event) => setSignInPassword(event.target.value)}
                      className="border-0 shadow-none focus-visible:ring-0"
                    />
                    <button
                      type="button"
                      className="border-l border-input px-3 text-slate-600"
                      onClick={() => setShowSignInPassword((value) => !value)}
                      aria-label={showSignInPassword ? 'Hide password' : 'Show password'}
                    >
                      {showSignInPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>
                </div>

                <button
                  type="button"
                  className="text-sm font-medium text-emerald-700 underline underline-offset-2"
                  onClick={() => {
                    setShowResetPanel((value) => !value)
                    if (!resetEmail) {
                      setResetEmail(signInEmail)
                    }
                  }}
                >
                  Forgot your password?
                </button>

                <Button
                  type="button"
                  className="w-full bg-emerald-600 hover:bg-emerald-700"
                  disabled={loading || !!loginValidationMessage}
                  onClick={() => void onSignIn()}
                >
                  {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                  Log in
                </Button>

                {hasTestAccountShortcut ? (
                  <Button
                    type="button"
                    variant="outline"
                    className="w-full"
                    onClick={onUseTestAccount}
                    disabled={loading}
                  >
                    Use test account
                  </Button>
                ) : null}

                {attemptedSignIn && loginValidationMessage ? <p className="text-xs text-amber-700">{loginValidationMessage}</p> : null}

                {challengeToken ? (
                  <div className="space-y-2 rounded-md border border-emerald-300 bg-emerald-50/70 p-3">
                    <p className="text-xs font-medium text-emerald-800">Two-factor challenge</p>
                    <Input
                      autoComplete="one-time-code"
                      placeholder="6-digit code or backup code"
                      value={twoFactorCode}
                      onChange={(event) => setTwoFactorCode(event.target.value)}
                    />
                    <Button
                      type="button"
                      variant="outline"
                      className="w-full"
                      onClick={() => void onVerifyTwoFactor()}
                      disabled={loading || !twoFactorCode.trim()}
                    >
                      Verify 2FA
                    </Button>
                  </div>
                ) : null}

                {showResetPanel ? (
                  <div className="space-y-2 rounded-md border border-slate-200 bg-slate-50 p-3">
                    <p className="text-xs font-medium text-slate-700">Reset your password</p>
                    <Input
                      autoComplete="email"
                      placeholder="Account email"
                      value={resetEmail}
                      onChange={(event) => setResetEmail(event.target.value)}
                    />
                    <Button
                      type="button"
                      variant="outline"
                      className="w-full"
                      onClick={() => void onRequestReset()}
                      disabled={loading || !isLikelyEmail(resetEmail)}
                    >
                      Request reset code
                    </Button>
                    {resetPreviewCode ? (
                      <p className="text-xs text-emerald-700">
                        Reset code (debug preview): <span className="font-mono">{resetPreviewCode}</span>
                      </p>
                    ) : null}
                    <Input
                      placeholder="Reset code"
                      value={resetCode}
                      onChange={(event) => setResetCode(event.target.value)}
                    />
                    <Input
                      type="password"
                      placeholder="New password"
                      value={resetPassword}
                      onChange={(event) => setResetPassword(event.target.value)}
                    />
                    <Button
                      type="button"
                      variant="outline"
                      className="w-full"
                      onClick={() => void onConfirmReset()}
                      disabled={loading || !resetCode.trim() || !isStrongPassword(resetPassword)}
                    >
                      Confirm password reset
                    </Button>
                    {resetValidationMessage ? <p className="text-xs text-amber-700">{resetValidationMessage}</p> : null}
                  </div>
                ) : null}
              </div>
            ) : awaitingEmailVerification ? (
              <div className="space-y-3 rounded-md border border-emerald-300 bg-emerald-50/70 p-3">
                <p className="text-sm font-medium text-emerald-900">Verify your email</p>
                <p className="text-xs text-emerald-800">
                  We sent a verification code to <span className="font-semibold">{registerEmail.trim()}</span>.
                </p>
                {verificationDeliveryHint ? <p className="text-xs text-slate-700">{verificationDeliveryHint}</p> : null}
                <Input
                  autoComplete="one-time-code"
                  placeholder="Enter verification code"
                  value={verificationCode}
                  onChange={(event) => setVerificationCode(event.target.value)}
                />
                <div className="flex flex-wrap gap-2">
                  <Button
                    type="button"
                    className="bg-emerald-600 hover:bg-emerald-700"
                    onClick={() => void onConfirmVerification()}
                    disabled={loading || !verificationCode.trim()}
                  >
                    {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                    Verify and continue
                  </Button>
                  <Button type="button" variant="outline" onClick={() => void onResendVerification()} disabled={loading}>
                    Resend code
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => {
                      setAwaitingEmailVerification(false)
                      setMode('signin')
                    }}
                    disabled={loading}
                  >
                    Verify later
                  </Button>
                </div>
                {verificationPreviewCode ? (
                  <p className="text-xs text-emerald-700">
                    Verification code (debug preview): <span className="font-mono">{verificationPreviewCode}</span>
                  </p>
                ) : null}
              </div>
            ) : (
              <div className="space-y-3">
                <div className="space-y-1">
                  <label className="text-xs font-semibold tracking-wide text-slate-700">FULL NAME</label>
                  <Input
                    autoComplete="name"
                    placeholder="Jane Researcher"
                    value={registerName}
                    onChange={(event) => setRegisterName(event.target.value)}
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-semibold tracking-wide text-slate-700">EMAIL ADDRESS</label>
                  <Input
                    autoComplete="email"
                    placeholder="email@address.com"
                    value={registerEmail}
                    onChange={(event) => setRegisterEmail(event.target.value)}
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-semibold tracking-wide text-slate-700">PASSWORD</label>
                  <div className="flex rounded-md border border-input bg-background">
                    <Input
                      autoComplete="new-password"
                      type={showRegisterPassword ? 'text' : 'password'}
                      placeholder="Create your password"
                      value={registerPassword}
                      onChange={(event) => setRegisterPassword(event.target.value)}
                      className="border-0 shadow-none focus-visible:ring-0"
                    />
                    <button
                      type="button"
                      className="border-l border-input px-3 text-slate-600"
                      onClick={() => setShowRegisterPassword((value) => !value)}
                      aria-label={showRegisterPassword ? 'Hide password' : 'Show password'}
                    >
                      {showRegisterPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-semibold tracking-wide text-slate-700">CONFIRM PASSWORD</label>
                  <Input
                    autoComplete="new-password"
                    type="password"
                    placeholder="Confirm password"
                    value={registerConfirmPassword}
                    onChange={(event) => setRegisterConfirmPassword(event.target.value)}
                  />
                </div>

                <div className="grid gap-1 text-xs text-slate-600 sm:grid-cols-2">
                  <p className={registerPasswordChecks.length ? 'text-emerald-700' : ''}>10+ characters</p>
                  <p className={registerPasswordChecks.upper ? 'text-emerald-700' : ''}>Uppercase letter</p>
                  <p className={registerPasswordChecks.lower ? 'text-emerald-700' : ''}>Lowercase letter</p>
                  <p className={registerPasswordChecks.number ? 'text-emerald-700' : ''}>Number</p>
                  <p className={registerPasswordChecks.matches ? 'text-emerald-700 sm:col-span-2' : 'sm:col-span-2'}>
                    Passwords match
                  </p>
                </div>

                <Button
                  type="button"
                  className="w-full bg-emerald-600 hover:bg-emerald-700"
                  disabled={loading}
                  onClick={() => void onRegister()}
                >
                  {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                  Create account
                </Button>
                {(attemptedRegister || hasRegisterInput) && registerValidationMessage ? (
                  <p className="text-xs text-amber-700">{registerValidationMessage}</p>
                ) : null}
              </div>
            )}

            <div className="flex items-center gap-2 text-xs text-slate-400">
              <span className="h-px flex-1 bg-slate-200" />
              <span>or</span>
              <span className="h-px flex-1 bg-slate-200" />
            </div>

            <div className="grid grid-cols-3 gap-2">
              {SOCIAL_PROVIDERS.map((provider) => {
                const config = providerByName.get(provider)
                const providerExplicitlyDisabled = Boolean(config && !config.configured)
                return (
                  <Button
                    key={provider}
                    type="button"
                    variant="outline"
                    className="w-full"
                    onClick={() => void onOAuth(provider)}
                    disabled={loading || oauthPending || providerExplicitlyDisabled}
                    title={
                      providerExplicitlyDisabled
                        ? config?.reason || `${providerLabel(provider)} is not configured`
                        : providerLabel(provider)
                    }
                    aria-label={providerLabel(provider)}
                  >
                    <ProviderIcon provider={provider} />
                    <span className="sr-only">{providerLabel(provider)}</span>
                  </Button>
                )
              })}
            </div>

            {status ? <p className="text-xs text-emerald-700">{status}</p> : null}
            {error ? (
              <div className="space-y-2">
                <p className="text-xs text-red-700">{error}</p>
                {error.toLowerCase().includes('could not reach api') ? (
                  <Button type="button" variant="outline" size="sm" onClick={() => void onWakeApi()} disabled={loading}>
                    Retry API connection
                  </Button>
                ) : null}
              </div>
            ) : null}
          </CardContent>
        </Card>

        <p className="text-sm text-slate-600">
          {mode === 'signin' ? (
            <>
              New to AAWE?{' '}
              <button type="button" className="font-semibold text-emerald-700 underline underline-offset-2" onClick={() => setMode('register')}>
                Create an account
              </button>
            </>
          ) : (
            <>
              Already have an account?{' '}
              <button type="button" className="font-semibold text-emerald-700 underline underline-offset-2" onClick={() => setMode('signin')}>
                Sign in
              </button>
            </>
          )}
        </p>
      </div>
    </div>
  )
}
