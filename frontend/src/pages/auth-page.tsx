import { useEffect, useMemo, useState } from 'react'
import { ArrowRight, KeyRound, Loader2, LockKeyhole, ShieldCheck } from 'lucide-react'
import { useNavigate } from 'react-router-dom'

import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { getAuthSessionToken, setAuthSessionToken } from '@/lib/auth-session'
import { fetchOAuthConnect, loginAuthChallenge, registerAuth, verifyLoginTwoFactor } from '@/lib/impact-api'

function isLikelyEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim())
}

function isStrongPassword(value: string): boolean {
  const password = value.trim()
  return password.length >= 10 && /[a-z]/.test(password) && /[A-Z]/.test(password) && /\d/.test(password)
}

export function AuthPage() {
  const navigate = useNavigate()
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [challengeToken, setChallengeToken] = useState('')
  const [twoFactorCode, setTwoFactorCode] = useState('')
  const [loading, setLoading] = useState(false)
  const [status, setStatus] = useState('')
  const [error, setError] = useState('')
  const [attemptedSignIn, setAttemptedSignIn] = useState(false)
  const [attemptedRegister, setAttemptedRegister] = useState(false)

  useEffect(() => {
    if (getAuthSessionToken()) {
      navigate('/profile', { replace: true })
    }
  }, [navigate])

  const registerValidationMessage = useMemo(() => {
    if (name.trim().length < 2) {
      return 'Name must be at least 2 characters.'
    }
    if (!isLikelyEmail(email)) {
      return 'Enter a valid email address.'
    }
    if (!isStrongPassword(password)) {
      return 'Password must be 10+ characters with uppercase, lowercase, and numeric characters.'
    }
    if (password !== confirmPassword) {
      return 'Password confirmation does not match.'
    }
    return ''
  }, [confirmPassword, email, name, password])

  const loginValidationMessage = useMemo(() => {
    if (!isLikelyEmail(email)) {
      return 'Enter a valid email address.'
    }
    if (!password.trim()) {
      return 'Password is required.'
    }
    return ''
  }, [email, password])

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
      const payload = await registerAuth({ email, password, name })
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
      const payload = await loginAuthChallenge({ email, password })
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
      setError(loginError instanceof Error ? loginError.message : 'Sign-in failed.')
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

  return (
    <div className="min-h-screen bg-gradient-to-br from-emerald-50 via-white to-slate-100 px-4 py-10">
      <div className="mx-auto grid w-full max-w-6xl gap-6 lg:grid-cols-[1.1fr_minmax(0,520px)]">
        <section className="rounded-xl border border-emerald-200/60 bg-white/80 p-6 shadow-sm backdrop-blur">
          <p className="text-xs uppercase tracking-wide text-emerald-700">AAWE account access</p>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight text-slate-900">Secure profile sign-in</h1>
          <p className="mt-3 max-w-xl text-sm text-slate-600">
            Access your impact profile, ORCID sync, and manuscript planning context with strengthened login controls and optional
            two-factor verification.
          </p>
          <div className="mt-6 grid gap-3 sm:grid-cols-2">
            <div className="rounded-lg border border-slate-200 bg-white p-3">
              <p className="flex items-center gap-2 text-sm font-medium text-slate-900">
                <ShieldCheck className="h-4 w-4 text-emerald-600" />
                Hardened sessions
              </p>
              <p className="mt-1 text-xs text-slate-600">Short-lived session tokens with secure hashing and active-session limits.</p>
            </div>
            <div className="rounded-lg border border-slate-200 bg-white p-3">
              <p className="flex items-center gap-2 text-sm font-medium text-slate-900">
                <LockKeyhole className="h-4 w-4 text-emerald-600" />
                Optional 2FA
              </p>
              <p className="mt-1 text-xs text-slate-600">Authenticator app codes and one-time backup codes are supported.</p>
            </div>
            <div className="rounded-lg border border-slate-200 bg-white p-3">
              <p className="flex items-center gap-2 text-sm font-medium text-slate-900">
                <KeyRound className="h-4 w-4 text-emerald-600" />
                OAuth sign-in
              </p>
              <p className="mt-1 text-xs text-slate-600">Use ORCID now; Google and Microsoft if provider credentials are configured.</p>
            </div>
            <div className="rounded-lg border border-slate-200 bg-white p-3">
              <p className="flex items-center gap-2 text-sm font-medium text-slate-900">
                <ArrowRight className="h-4 w-4 text-emerald-600" />
                Direct to profile
              </p>
              <p className="mt-1 text-xs text-slate-600">After sign-in, you land directly on Profile/Impact without extra navigation.</p>
            </div>
          </div>
        </section>

        <Card className="border border-slate-200 bg-white shadow-sm">
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Sign in</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-2 sm:grid-cols-3">
              <Button type="button" variant="outline" onClick={() => void onOAuth('orcid')} disabled={loading}>
                ORCID
              </Button>
              <Button type="button" variant="outline" onClick={() => void onOAuth('google')} disabled={loading}>
                Google
              </Button>
              <Button type="button" variant="outline" onClick={() => void onOAuth('microsoft')} disabled={loading}>
                Microsoft
              </Button>
            </div>

            <Tabs defaultValue="signin" className="w-full">
              <TabsList className="grid w-full grid-cols-2">
                <TabsTrigger value="signin">Sign in</TabsTrigger>
                <TabsTrigger value="register">Register</TabsTrigger>
              </TabsList>
              <TabsContent value="signin" className="space-y-3 pt-2">
                <Input
                  autoComplete="email"
                  placeholder="Email"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                />
                <Input
                  autoComplete="current-password"
                  type="password"
                  placeholder="Password"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                />
                <Button type="button" className="w-full bg-emerald-600 hover:bg-emerald-700" disabled={loading} onClick={() => void onSignIn()}>
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

                {attemptedSignIn && loginValidationMessage ? <p className="text-xs text-amber-700">{loginValidationMessage}</p> : null}
              </TabsContent>
              <TabsContent value="register" className="space-y-3 pt-2">
                <Input
                  autoComplete="name"
                  placeholder="Full name"
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                />
                <Input
                  autoComplete="email"
                  placeholder="Email"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                />
                <Input
                  autoComplete="new-password"
                  type="password"
                  placeholder="Password"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                />
                <Input
                  autoComplete="new-password"
                  type="password"
                  placeholder="Confirm password"
                  value={confirmPassword}
                  onChange={(event) => setConfirmPassword(event.target.value)}
                />
                <Button type="button" className="w-full bg-emerald-600 hover:bg-emerald-700" disabled={loading} onClick={() => void onRegister()}>
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
