import { useEffect, useMemo, useState } from 'react'
import { Eye, EyeOff, Loader2 } from 'lucide-react'
import { useNavigate } from 'react-router-dom'

import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { getAuthSessionToken, setAuthSessionToken } from '@/lib/auth-session'
import {
  confirmPasswordReset,
  fetchOAuthConnect,
  fetchOAuthProviderStatuses,
  loginAuth,
  loginAuthChallenge,
  pingApiHealth,
  registerAuth,
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

function providerLabel(provider: SocialProvider): string {
  if (provider === 'orcid') {
    return 'ORCID'
  }
  if (provider === 'google') {
    return 'Google'
  }
  return 'Microsoft'
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

  useEffect(() => {
    if (getAuthSessionToken()) {
      navigate('/profile', { replace: true })
    }
  }, [navigate])

  useEffect(() => {
    if (typeof window === 'undefined') {
      return
    }
    const storedEmail = window.localStorage.getItem(LAST_AUTH_EMAIL_STORAGE_KEY) || ''
    if (storedEmail && !signInEmail) {
      setSignInEmail(storedEmail)
      if (!resetEmail) {
        setResetEmail(storedEmail)
      }
    }
  }, [resetEmail, signInEmail])

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
      setAuthSessionToken(payload.session_token)
      persistLastEmail(payload.user.email)
      setStatus('Account created. Redirecting to profile...')
      navigate('/profile', { replace: true })
    } catch (registerError) {
      setError(registerError instanceof Error ? registerError.message : 'Registration failed.')
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
        setAuthSessionToken(payload.session.session_token)
        persistLastEmail(payload.session.user.email)
        setStatus('Signed in. Redirecting to profile...')
        navigate('/profile', { replace: true })
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
        setAuthSessionToken(session.session_token)
        persistLastEmail(session.user.email)
        setStatus('Signed in. Redirecting to profile...')
        navigate('/profile', { replace: true })
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
      setAuthSessionToken(payload.session_token)
      persistLastEmail(payload.user.email)
      setStatus('Two-factor verification complete. Redirecting...')
      navigate('/profile', { replace: true })
    } catch (verifyError) {
      setError(verifyError instanceof Error ? verifyError.message : 'Two-factor verification failed.')
    } finally {
      setLoading(false)
    }
  }

  const onOAuth = async (provider: SocialProvider) => {
    const providerState = providerByName.get(provider)
    if (!providerState?.configured) {
      setStatus(providerState?.reason || `${providerLabel(provider)} sign-in is not configured.`)
      return
    }
    setLoading(true)
    setError('')
    setStatus('')
    try {
      const payload = await fetchOAuthConnect(provider)
      window.location.assign(payload.url)
    } catch (oauthError) {
      setError(oauthError instanceof Error ? oauthError.message : `${providerLabel(provider)} sign-in failed.`)
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
                  disabled={loading || !!registerValidationMessage}
                  onClick={() => void onRegister()}
                >
                  {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                  Create account
                </Button>
                {attemptedRegister && registerValidationMessage ? <p className="text-xs text-amber-700">{registerValidationMessage}</p> : null}
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
                return (
                  <Button
                    key={provider}
                    type="button"
                    variant="outline"
                    className="w-full"
                    onClick={() => void onOAuth(provider)}
                    disabled={loading || !config?.configured}
                    title={!config?.configured ? config?.reason || `${providerLabel(provider)} is not configured` : ''}
                  >
                    {providerLabel(provider)}
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
