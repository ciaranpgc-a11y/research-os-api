import { useEffect, useMemo, useState } from 'react'
import { ArrowRight, KeyRound, Loader2, LockKeyhole, ShieldCheck } from 'lucide-react'
import { useNavigate } from 'react-router-dom'

import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { getAuthSessionToken, setAuthSessionToken } from '@/lib/auth-session'
import {
  confirmPasswordReset,
  fetchOAuthConnect,
  fetchOAuthProviderStatuses,
  loginAuth,
  loginAuthChallenge,
  registerAuth,
  requestPasswordReset,
  verifyLoginTwoFactor,
} from '@/lib/impact-api'
import type { AuthOAuthProviderStatusItem } from '@/types/impact'

function isLikelyEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim())
}

function isStrongPassword(value: string): boolean {
  const password = value.trim()
  return password.length >= 10 && /[a-z]/.test(password) && /[A-Z]/.test(password) && /\d/.test(password)
}

export function AuthPage() {
  const navigate = useNavigate()
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

  useEffect(() => {
    if (getAuthSessionToken()) {
      navigate('/profile', { replace: true })
    }
  }, [navigate])

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

  const configuredProviders = useMemo(
    () => oauthProviders.filter((provider) => provider.configured),
    [oauthProviders],
  )

  const unavailableProviders = useMemo(
    () => oauthProviders.filter((provider) => !provider.configured),
    [oauthProviders],
  )

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
      const fallbackEligible =
        lower.includes('404') ||
        lower.includes('not found') ||
        lower.includes('login challenge')
      if (!fallbackEligible) {
        setError(detail)
        return
      }
      try {
        const session = await loginAuth({ email: signInEmail, password: signInPassword })
        setAuthSessionToken(session.session_token)
        setStatus('Signed in. Redirecting to profile...')
        navigate('/profile', { replace: true })
      } catch (fallbackError) {
        const fallbackDetail = fallbackError instanceof Error ? fallbackError.message : 'Sign-in failed.'
        setError(fallbackDetail)
        if (fallbackDetail.toLowerCase().includes('invalid credentials')) {
          setStatus(
            'Credentials not recognised. If this account was created via ORCID/Google/Microsoft, use that provider or run password reset.',
          )
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
      setStatus('Two-factor verification complete. Redirecting...')
      navigate('/profile', { replace: true })
    } catch (verifyError) {
      setError(verifyError instanceof Error ? verifyError.message : 'Two-factor verification failed.')
    } finally {
      setLoading(false)
    }
  }

  const onOAuth = async (provider: 'orcid' | 'google' | 'microsoft') => {
    setLoading(true)
    setError('')
    setStatus('')
    try {
      const payload = await fetchOAuthConnect(provider)
      window.location.assign(payload.url)
    } catch (oauthError) {
      setError(oauthError instanceof Error ? oauthError.message : `${provider} sign-in failed.`)
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
      setStatus('Password reset complete. You can now sign in with the new password.')
      setSignInEmail(resetEmail)
      setSignInPassword('')
      setResetCode('')
      setResetPassword('')
    } catch (confirmError) {
      setError(confirmError instanceof Error ? confirmError.message : 'Password reset failed.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-emerald-50 via-white to-slate-100 px-4 py-10">
      <div className="mx-auto grid w-full max-w-6xl gap-6 lg:grid-cols-[1.1fr_minmax(0,520px)]">
        <section className="rounded-xl border border-emerald-200/60 bg-white/80 p-6 shadow-sm backdrop-blur">
          <p className="text-xs uppercase tracking-wide text-emerald-700">AAWE account access</p>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight text-slate-900">Secure profile sign-in</h1>
          <p className="mt-3 max-w-xl text-sm text-slate-600">
            Create an account once, then access manuscript planning and your profile in one place. Enhanced security and provider
            sign-in are available when you want them.
          </p>
          <div className="mt-6 grid gap-3 sm:grid-cols-2">
            <div className="rounded-lg border border-slate-200 bg-white p-3">
              <p className="flex items-center gap-2 text-sm font-medium text-slate-900">
                <ShieldCheck className="h-4 w-4 text-emerald-600" />
                Simple sign-in
              </p>
              <p className="mt-1 text-xs text-slate-600">Email + password is the default flow and lands you directly in your profile.</p>
            </div>
            <div className="rounded-lg border border-slate-200 bg-white p-3">
              <p className="flex items-center gap-2 text-sm font-medium text-slate-900">
                <LockKeyhole className="h-4 w-4 text-emerald-600" />
                Optional extra security
              </p>
              <p className="mt-1 text-xs text-slate-600">Two-factor authentication can be enabled later from profile settings.</p>
            </div>
            <div className="rounded-lg border border-slate-200 bg-white p-3">
              <p className="flex items-center gap-2 text-sm font-medium text-slate-900">
                <KeyRound className="h-4 w-4 text-emerald-600" />
                ORCID and provider sign-in
              </p>
              <p className="mt-1 text-xs text-slate-600">Use ORCID for publication sync; Google/Microsoft are available when configured.</p>
            </div>
            <div className="rounded-lg border border-slate-200 bg-white p-3">
              <p className="flex items-center gap-2 text-sm font-medium text-slate-900">
                <ArrowRight className="h-4 w-4 text-emerald-600" />
                Fast setup
              </p>
              <p className="mt-1 text-xs text-slate-600">Register in under a minute, then connect ORCID any time from your profile.</p>
            </div>
          </div>
        </section>

        <Card className="border border-slate-200 bg-white shadow-sm">
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Sign in</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <details className="rounded-md border border-slate-200 bg-slate-50 p-3">
              <summary className="cursor-pointer text-sm font-medium text-slate-900">Other sign-in options</summary>
              {configuredProviders.length ? (
                <div className="mt-2 grid gap-2 sm:grid-cols-3">
                  {configuredProviders.map((provider) => (
                    <Button
                      key={provider.provider}
                      type="button"
                      variant="outline"
                      onClick={() => void onOAuth(provider.provider)}
                      disabled={loading}
                    >
                      {provider.provider.toUpperCase()}
                    </Button>
                  ))}
                </div>
              ) : (
                <p className="mt-2 text-xs text-slate-600">No OAuth providers are configured in the backend environment.</p>
              )}
              {unavailableProviders.length ? (
                <p className="mt-2 text-xs text-slate-500">
                  Unavailable: {unavailableProviders.map((provider) => provider.provider).join(', ')}
                </p>
              ) : null}
              <p className="mt-2 text-xs text-slate-600">Use ORCID if you want to import publications into your profile.</p>
            </details>

            <Tabs defaultValue="signin" className="w-full">
              <TabsList className="grid w-full grid-cols-2">
                <TabsTrigger value="signin">Sign in</TabsTrigger>
                <TabsTrigger value="register">Register</TabsTrigger>
              </TabsList>
              <TabsContent value="signin" className="space-y-3 pt-2">
                <Input
                  autoComplete="email"
                  placeholder="Email"
                  value={signInEmail}
                  onChange={(event) => setSignInEmail(event.target.value)}
                />
                <Input
                  autoComplete="current-password"
                  type="password"
                  placeholder="Password"
                  value={signInPassword}
                  onChange={(event) => setSignInPassword(event.target.value)}
                />
                <Button
                  type="button"
                  className="w-full bg-emerald-600 hover:bg-emerald-700"
                  disabled={loading || !!loginValidationMessage}
                  onClick={() => void onSignIn()}
                >
                  {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                  Continue
                </Button>

                {challengeToken ? (
                  <div className="space-y-2 rounded-md border border-emerald-300 bg-emerald-50/70 p-3">
                    <p className="text-xs font-medium text-emerald-800">Two-factor challenge</p>
                    <Input
                      autoComplete="one-time-code"
                      placeholder="6-digit code or backup code"
                      value={twoFactorCode}
                      onChange={(event) => setTwoFactorCode(event.target.value)}
                    />
                    <Button type="button" variant="outline" className="w-full" onClick={() => void onVerifyTwoFactor()} disabled={loading || !twoFactorCode.trim()}>
                      Verify 2FA
                    </Button>
                  </div>
                ) : null}

                <details className="rounded-md border border-slate-200 bg-slate-50 p-3">
                  <summary className="cursor-pointer text-xs font-medium text-slate-700">Forgot password</summary>
                  <div className="mt-2 space-y-2">
                    <Input
                      autoComplete="email"
                      placeholder="Account email"
                      value={resetEmail}
                      onChange={(event) => setResetEmail(event.target.value)}
                    />
                    <Button type="button" variant="outline" className="w-full" onClick={() => void onRequestReset()} disabled={loading || !isLikelyEmail(resetEmail)}>
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
                </details>

                {attemptedSignIn && loginValidationMessage ? <p className="text-xs text-amber-700">{loginValidationMessage}</p> : null}
              </TabsContent>
              <TabsContent value="register" className="space-y-3 pt-2">
                <Input
                  autoComplete="name"
                  placeholder="Full name"
                  value={registerName}
                  onChange={(event) => setRegisterName(event.target.value)}
                />
                <Input
                  autoComplete="email"
                  placeholder="Email"
                  value={registerEmail}
                  onChange={(event) => setRegisterEmail(event.target.value)}
                />
                <Input
                  autoComplete="new-password"
                  type="password"
                  placeholder="Password"
                  value={registerPassword}
                  onChange={(event) => setRegisterPassword(event.target.value)}
                />
                <Input
                  autoComplete="new-password"
                  type="password"
                  placeholder="Confirm password"
                  value={registerConfirmPassword}
                  onChange={(event) => setRegisterConfirmPassword(event.target.value)}
                />
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
                <p className="text-xs text-slate-500">
                  Password policy: minimum 10 characters with upper/lowercase letters and a number.
                </p>
                {attemptedRegister && registerValidationMessage ? <p className="text-xs text-amber-700">{registerValidationMessage}</p> : null}
              </TabsContent>
            </Tabs>

            {status ? <p className="text-xs text-emerald-700">{status}</p> : null}
            {error ? <p className="text-xs text-red-700">{error}</p> : null}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
