import { useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'

import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
  analyseImpact,
  disableTwoFactor,
  enableTwoFactor,
  fetchImpactCollaborators,
  fetchImpactThemes,
  fetchMe,
  fetchOrcidConnect,
  fetchPersonaContext,
  fetchPersonaState,
  fetchTwoFactorState,
  confirmEmailVerification,
  generateImpactReport,
  generatePersonaEmbeddings,
  importOrcidWorks,
  listPersonaWorks,
  logoutAuth,
  recomputeImpact,
  requestEmailVerification,
  setupTwoFactor,
  syncPersonaMetrics,
  updateMe,
} from '@/lib/impact-api'
import { clearAuthSessionToken, getAuthSessionToken } from '@/lib/auth-session'
import type {
  AuthUser,
  AuthTwoFactorSetupPayload,
  AuthTwoFactorStatePayload,
  ImpactAnalysePayload,
  ImpactCollaboratorsPayload,
  ImpactRecomputePayload,
  ImpactReportPayload,
  ImpactThemesPayload,
  PersonaContextPayload,
  PersonaStatePayload,
  PersonaWork,
} from '@/types/impact'

function histogramBar(total: number, value: number): string {
  const width = total <= 0 ? 0 : Math.max(8, Math.round((value / total) * 100))
  return `${Math.min(100, width)}%`
}

function formatTimestamp(value: string | null | undefined): string {
  if (!value) {
    return 'Not available'
  }
  const timestamp = Date.parse(value)
  if (Number.isNaN(timestamp)) {
    return 'Not available'
  }
  return new Date(timestamp).toLocaleString('en-GB', {
    year: 'numeric',
    month: 'short',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function daysSince(value: string | null | undefined): number | null {
  if (!value) {
    return null
  }
  const timestamp = Date.parse(value)
  if (Number.isNaN(timestamp)) {
    return null
  }
  const deltaMs = Date.now() - timestamp
  return Math.max(0, Math.floor(deltaMs / (1000 * 60 * 60 * 24)))
}

export function ImpactPage() {
  const navigate = useNavigate()
  const [token, setToken] = useState<string>(() => getAuthSessionToken())
  const [user, setUser] = useState<AuthUser | null>(null)
  const [works, setWorks] = useState<PersonaWork[]>([])
  const [statePayload, setStatePayload] = useState<PersonaStatePayload | null>(null)
  const [impactSnapshot, setImpactSnapshot] = useState<ImpactRecomputePayload | null>(null)
  const [collaborators, setCollaborators] = useState<ImpactCollaboratorsPayload | null>(null)
  const [themes, setThemes] = useState<ImpactThemesPayload | null>(null)
  const [personaContext, setPersonaContext] = useState<PersonaContextPayload | null>(null)
  const [analysis, setAnalysis] = useState<ImpactAnalysePayload | null>(null)
  const [report, setReport] = useState<ImpactReportPayload | null>(null)
  const [twoFactorState, setTwoFactorState] = useState<AuthTwoFactorStatePayload | null>(null)
  const [twoFactorSetup, setTwoFactorSetup] = useState<AuthTwoFactorSetupPayload | null>(null)
  const [twoFactorCode, setTwoFactorCode] = useState('')
  const [disableTwoFactorCode, setDisableTwoFactorCode] = useState('')
  const [loading, setLoading] = useState(false)
  const [status, setStatus] = useState('')
  const [error, setError] = useState('')
  const [profileName, setProfileName] = useState('')
  const [profileEmail, setProfileEmail] = useState('')
  const [profilePassword, setProfilePassword] = useState('')
  const [verificationCode, setVerificationCode] = useState('')
  const [verificationPreviewCode, setVerificationPreviewCode] = useState('')
  const [hasLoadedOnce, setHasLoadedOnce] = useState(false)

  const totalHistogramCount = useMemo(() => {
    const histogram = statePayload?.metrics?.histogram
    if (!histogram) {
      return 0
    }
    return Object.values(histogram).reduce((sum, value) => sum + value, 0)
  }, [statePayload])

  const verificationRequired = useMemo(
    () => Boolean(user && !user.email_verified_at),
    [user],
  )

  const syncStatus = useMemo(
    () =>
      statePayload?.sync_status || {
        works_last_synced_at: null,
        works_last_updated_at: null,
        metrics_last_synced_at: null,
        themes_last_generated_at: null,
        impact_last_computed_at: impactSnapshot?.computed_at || null,
        orcid_last_synced_at: null,
      },
    [impactSnapshot?.computed_at, statePayload?.sync_status],
  )

  const lastSyncAt = useMemo(() => {
    const candidates = [
      syncStatus.works_last_synced_at,
      syncStatus.metrics_last_synced_at,
      syncStatus.themes_last_generated_at,
      syncStatus.impact_last_computed_at,
      user?.impact_last_computed_at || null,
    ]
      .map((value) => (value ? Date.parse(value) : Number.NaN))
      .filter((value) => Number.isFinite(value))
    if (!candidates.length) {
      return null
    }
    return new Date(Math.max(...candidates)).toISOString()
  }, [syncStatus, user?.impact_last_computed_at])

  const staleWarnings = useMemo(() => {
    const rows = [
      { label: 'Works', value: syncStatus.works_last_synced_at },
      { label: 'Metrics', value: syncStatus.metrics_last_synced_at },
      { label: 'Themes', value: syncStatus.themes_last_generated_at },
      { label: 'Impact', value: syncStatus.impact_last_computed_at },
    ]
    return rows
      .map((row) => {
        const age = daysSince(row.value)
        if (age === null || age <= 30) {
          return null
        }
        return `${row.label} is ${age} day${age === 1 ? '' : 's'} old`
      })
      .filter((value): value is string => Boolean(value))
  }, [syncStatus.impact_last_computed_at, syncStatus.metrics_last_synced_at, syncStatus.themes_last_generated_at, syncStatus.works_last_synced_at])

  const isInitialProfileLoading = Boolean(token) && loading && !hasLoadedOnce && !user
  const timelineRows = statePayload?.timeline ?? []
  const metricsWorks = statePayload?.metrics?.works ?? []
  const metricsHistogram = statePayload?.metrics?.histogram ?? {}
  const collaboratorRows = collaborators?.collaborators ?? []
  const collaboratorsByYear = collaborators?.new_collaborators_by_year ?? {}
  const themeRows = themes?.clusters ?? []

  const loadProfileData = useCallback(async (sessionToken: string) => {
    setLoading(true)
    setError('')
    setStatus('')
    try {
      const me = await fetchMe(sessionToken)
      setUser(me)

      const settled = await Promise.allSettled([
        listPersonaWorks(sessionToken),
        fetchPersonaState(sessionToken),
        fetchImpactCollaborators(sessionToken),
        fetchImpactThemes(sessionToken),
        fetchPersonaContext(sessionToken),
        fetchTwoFactorState(sessionToken),
        recomputeImpact(sessionToken),
      ])

      const [
        worksResult,
        personaStateResult,
        collaboratorsResult,
        themesResult,
        contextResult,
        twoFactorResult,
        snapshotResult,
      ] = settled

      setWorks(worksResult.status === 'fulfilled' ? worksResult.value : [])
      setStatePayload(personaStateResult.status === 'fulfilled' ? personaStateResult.value : null)
      setCollaborators(collaboratorsResult.status === 'fulfilled' ? collaboratorsResult.value : null)
      setThemes(themesResult.status === 'fulfilled' ? themesResult.value : null)
      setPersonaContext(contextResult.status === 'fulfilled' ? contextResult.value : null)
      setTwoFactorState(twoFactorResult.status === 'fulfilled' ? twoFactorResult.value : null)
      setImpactSnapshot(snapshotResult.status === 'fulfilled' ? snapshotResult.value : null)

      const failedCount = settled.filter((item) => item.status === 'rejected').length
      if (failedCount > 0) {
        setStatus(`Profile loaded with ${failedCount} partial data source${failedCount === 1 ? '' : 's'} unavailable.`)
      }
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Failed to load profile.')
      setUser(null)
      setWorks([])
      setStatePayload(null)
      setCollaborators(null)
      setThemes(null)
      setPersonaContext(null)
      setTwoFactorState(null)
      setImpactSnapshot(null)
    } finally {
      setLoading(false)
      setHasLoadedOnce(true)
    }
  }, [])

  useEffect(() => {
    if (!token) {
      setUser(null)
      setWorks([])
      setStatePayload(null)
      setCollaborators(null)
      setThemes(null)
      setPersonaContext(null)
      setTwoFactorState(null)
      setImpactSnapshot(null)
      return
    }
    void loadProfileData(token)
  }, [token, loadProfileData])

  useEffect(() => {
    if (!user) {
      return
    }
    setProfileName(user.name || '')
    setProfileEmail(user.email || '')
  }, [user])

  const onStartTwoFactorSetup = async () => {
    if (!token) {
      return
    }
    setError('')
    setStatus('')
    setLoading(true)
    try {
      const payload = await setupTwoFactor(token)
      setTwoFactorSetup(payload)
      setTwoFactorCode('')
      setStatus('2FA setup generated. Scan in your authenticator and verify one code.')
    } catch (setupError) {
      setError(setupError instanceof Error ? setupError.message : '2FA setup failed.')
    } finally {
      setLoading(false)
    }
  }

  const onEnableTwoFactor = async () => {
    if (!token || !twoFactorSetup) {
      return
    }
    setError('')
    setStatus('')
    setLoading(true)
    try {
      const payload = await enableTwoFactor({
        token,
        secret: twoFactorSetup.secret,
        code: twoFactorCode,
        backupCodes: twoFactorSetup.backup_codes,
      })
      setTwoFactorState(payload)
      setStatus('Two-factor authentication enabled.')
      setTwoFactorSetup(null)
      setTwoFactorCode('')
    } catch (enableError) {
      setError(enableError instanceof Error ? enableError.message : '2FA enable failed.')
    } finally {
      setLoading(false)
    }
  }

  const onDisableTwoFactor = async () => {
    if (!token) {
      return
    }
    setError('')
    setStatus('')
    setLoading(true)
    try {
      const payload = await disableTwoFactor({
        token,
        code: disableTwoFactorCode,
      })
      setTwoFactorState(payload)
      setTwoFactorSetup(null)
      setDisableTwoFactorCode('')
      setStatus('Two-factor authentication disabled.')
    } catch (disableError) {
      setError(disableError instanceof Error ? disableError.message : '2FA disable failed.')
    } finally {
      setLoading(false)
    }
  }

  const onLogout = async () => {
    if (!token) {
      return
    }
    setError('')
    setStatus('')
    setLoading(true)
    try {
      await logoutAuth(token)
    } catch {
      // Continue with client-side cleanup.
    } finally {
      clearAuthSessionToken()
      setToken('')
      setUser(null)
      setWorks([])
      setStatePayload(null)
      setImpactSnapshot(null)
      setCollaborators(null)
      setThemes(null)
      setPersonaContext(null)
      setTwoFactorState(null)
      setTwoFactorSetup(null)
      setAnalysis(null)
      setReport(null)
      setLoading(false)
      setStatus('Signed out.')
      navigate('/auth', { replace: true })
    }
  }

  const onConnectOrcid = async () => {
    if (!token) {
      return
    }
    if (verificationRequired) {
      setStatus('Verify your email before connecting ORCID.')
      return
    }
    setError('')
    setStatus('')
    try {
      const payload = await fetchOrcidConnect(token)
      window.open(payload.url, '_blank', 'noopener,noreferrer')
      setStatus('Opened ORCID authorisation in a new tab.')
    } catch (connectError) {
      setError(connectError instanceof Error ? connectError.message : 'ORCID connect failed.')
    }
  }

  const onUpdateProfile = async () => {
    if (!token) {
      return
    }
    setError('')
    setStatus('')
    setLoading(true)
    try {
      const payload = await updateMe(token, {
        name: profileName.trim(),
        email: profileEmail.trim(),
        password: profilePassword.trim() || undefined,
      })
      setUser(payload)
      setProfilePassword('')
      setStatus('Profile details updated.')
    } catch (updateError) {
      setError(updateError instanceof Error ? updateError.message : 'Profile update failed.')
    } finally {
      setLoading(false)
    }
  }

  const onRequestEmailVerification = async () => {
    if (!token) {
      return
    }
    setError('')
    setStatus('')
    setLoading(true)
    try {
      const payload = await requestEmailVerification(token)
      if (payload.code_preview) {
        setVerificationPreviewCode(payload.code_preview)
      }
      setStatus(payload.delivery_hint || 'Verification code requested.')
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'Email verification request failed.')
    } finally {
      setLoading(false)
    }
  }

  const onConfirmEmailVerification = async () => {
    if (!token || !verificationCode.trim()) {
      return
    }
    setError('')
    setStatus('')
    setLoading(true)
    try {
      const payload = await confirmEmailVerification({
        token,
        code: verificationCode,
      })
      setUser(payload)
      setVerificationCode('')
      setVerificationPreviewCode('')
      setStatus('Email verified. Full profile actions are now available.')
    } catch (confirmError) {
      setError(confirmError instanceof Error ? confirmError.message : 'Email verification failed.')
    } finally {
      setLoading(false)
    }
  }

  const onImportOrcid = async () => {
    if (!token) {
      return
    }
    if (verificationRequired) {
      setStatus('Verify your email before importing ORCID works.')
      return
    }
    setError('')
    setStatus('')
    setLoading(true)
    try {
      const payload = await importOrcidWorks(token)
      setStatus(`Imported ${payload.imported_count} ORCID work(s).`)
      await loadProfileData(token)
    } catch (importError) {
      setError(importError instanceof Error ? importError.message : 'ORCID import failed.')
    } finally {
      setLoading(false)
    }
  }

  const onSyncMetrics = async () => {
    if (!token) {
      return
    }
    if (verificationRequired) {
      setStatus('Verify your email before syncing metrics.')
      return
    }
    setError('')
    setStatus('')
    setLoading(true)
    try {
      const payload = await syncPersonaMetrics(token, ['openalex', 'semantic_scholar', 'manual'])
      setStatus(`Synced ${payload.synced_snapshots} metric snapshot(s).`)
      await loadProfileData(token)
    } catch (syncError) {
      setError(syncError instanceof Error ? syncError.message : 'Metrics sync failed.')
    } finally {
      setLoading(false)
    }
  }

  const onGenerateEmbeddings = async () => {
    if (!token) {
      return
    }
    if (verificationRequired) {
      setStatus('Verify your email before generating themes.')
      return
    }
    setError('')
    setStatus('')
    setLoading(true)
    try {
      const payload = await generatePersonaEmbeddings(token)
      setStatus(`Generated ${payload.generated_embeddings} embedding(s) with ${payload.model_name}.`)
      await loadProfileData(token)
    } catch (embeddingError) {
      setError(embeddingError instanceof Error ? embeddingError.message : 'Embedding generation failed.')
    } finally {
      setLoading(false)
    }
  }

  const onRecomputeImpact = async () => {
    if (!token) {
      return
    }
    if (verificationRequired) {
      setStatus('Verify your email before recomputing impact.')
      return
    }
    setError('')
    setStatus('')
    setLoading(true)
    try {
      const payload = await recomputeImpact(token)
      setImpactSnapshot(payload)
      setStatus('Impact metrics recomputed.')
    } catch (recomputeError) {
      setError(recomputeError instanceof Error ? recomputeError.message : 'Impact recompute failed.')
    } finally {
      setLoading(false)
    }
  }

  const onAnalyse = async () => {
    if (!token) {
      return
    }
    if (verificationRequired) {
      setStatus('Verify your email before running strategy analysis.')
      return
    }
    setError('')
    setStatus('')
    setLoading(true)
    try {
      const payload = await analyseImpact(token)
      setAnalysis(payload)
      setStatus('Strategic impact analysis generated.')
    } catch (analyseError) {
      setError(analyseError instanceof Error ? analyseError.message : 'Impact analysis failed.')
    } finally {
      setLoading(false)
    }
  }

  const onGenerateReport = async () => {
    if (!token) {
      return
    }
    if (verificationRequired) {
      setStatus('Verify your email before generating reports.')
      return
    }
    setError('')
    setStatus('')
    setLoading(true)
    try {
      const payload = await generateImpactReport(token)
      setReport(payload)
      setStatus('Impact report generated.')
    } catch (reportError) {
      setError(reportError instanceof Error ? reportError.message : 'Impact report failed.')
    } finally {
      setLoading(false)
    }
  }

  const onDownloadReport = () => {
    if (!report) {
      return
    }
    const blob = new Blob([JSON.stringify(report, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const anchor = document.createElement('a')
    anchor.href = url
    anchor.download = 'impact-report.json'
    anchor.click()
    URL.revokeObjectURL(url)
  }

  const onUploadWorksCsvStub = () => {
    setStatus('CSV works upload will be added next. Use ORCID import for now.')
  }

  return (
    <section className="space-y-4">
      <header className="space-y-1">
        <div className="space-y-1">
          <h1 className="text-2xl font-semibold tracking-tight">Profile</h1>
          <p className="text-sm text-muted-foreground">
            Account, ORCID, impact metrics, collaborations, themes, and strategy outputs.
          </p>
        </div>
      </header>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm">Account summary</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {isInitialProfileLoading ? (
            <div className="animate-pulse space-y-3">
              <div className="grid gap-2 md:grid-cols-4">
                <div className="h-16 rounded-md bg-slate-100" />
                <div className="h-16 rounded-md bg-slate-100" />
                <div className="h-16 rounded-md bg-slate-100" />
                <div className="h-16 rounded-md bg-slate-100" />
              </div>
              <div className="h-9 rounded-md bg-slate-100" />
            </div>
          ) : user ? (
            <div className="space-y-3 text-sm">
              <div className="grid gap-2 md:grid-cols-4">
                <div className="rounded-md border border-border bg-background p-2">
                  <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Email verification</p>
                  <p className={user.email_verified_at ? 'text-emerald-700' : 'text-amber-700'}>
                    {user.email_verified_at ? 'Verified' : 'Verification required'}
                  </p>
                </div>
                <div className="rounded-md border border-border bg-background p-2">
                  <p className="text-[11px] uppercase tracking-wide text-muted-foreground">ORCID</p>
                  <p className={user.orcid_id ? 'text-emerald-700' : 'text-amber-700'}>
                    {user.orcid_id ? 'Linked' : 'Not linked'}
                  </p>
                </div>
                <div className="rounded-md border border-border bg-background p-2">
                  <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Last sync</p>
                  <p className={staleWarnings.length ? 'text-amber-700' : 'text-slate-800'}>
                    {formatTimestamp(lastSyncAt)}
                  </p>
                </div>
                <div className="rounded-md border border-border bg-background p-2">
                  <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Security level</p>
                  <p className={twoFactorState?.enabled ? 'text-emerald-700' : 'text-slate-800'}>
                    {twoFactorState?.enabled ? 'Enhanced (2FA)' : 'Standard'}
                  </p>
                </div>
              </div>

              {staleWarnings.length ? (
                <div className="rounded-md border border-amber-300 bg-amber-50 p-2 text-xs text-amber-800">
                  {staleWarnings.join(' | ')}
                </div>
              ) : null}

              {verificationRequired ? (
                <div className="space-y-2 rounded-md border border-amber-300 bg-amber-50 p-3">
                  <p className="text-xs font-medium text-amber-900">Verify your email to unlock full profile features.</p>
                  <div className="flex flex-wrap items-center gap-2">
                    <Button variant="outline" size="sm" onClick={onRequestEmailVerification} disabled={loading}>
                      Send verification code
                    </Button>
                    <Input
                      placeholder="Verification code"
                      value={verificationCode}
                      onChange={(event) => setVerificationCode(event.target.value)}
                      className="w-[180px]"
                    />
                    <Button size="sm" onClick={onConfirmEmailVerification} disabled={loading || !verificationCode.trim()}>
                      Verify email
                    </Button>
                  </div>
                  {verificationPreviewCode ? (
                    <p className="text-xs text-amber-900">
                      Verification code (debug preview): <span className="font-mono">{verificationPreviewCode}</span>
                    </p>
                  ) : null}
                </div>
              ) : null}

              <div className="flex flex-wrap items-center gap-2">
                <Button variant="outline" size="sm" onClick={onConnectOrcid} disabled={loading || verificationRequired}>
                  Connect ORCID
                </Button>
                <Button variant="outline" size="sm" onClick={() => (token ? void loadProfileData(token) : navigate('/auth'))} disabled={loading}>
                  Sync now
                </Button>
                <details className="rounded-md border border-border bg-background px-2 py-1">
                  <summary className="cursor-pointer text-xs text-slate-700">More actions</summary>
                  <div className="mt-2 flex flex-wrap items-center gap-2">
                    <Button variant="outline" size="sm" onClick={onImportOrcid} disabled={loading || verificationRequired}>
                      Import ORCID works
                    </Button>
                    <Button variant="ghost" size="sm" onClick={onLogout} disabled={loading}>
                      Sign out
                    </Button>
                  </div>
                </details>
              </div>

              <details className="rounded-md border border-border bg-background p-2">
                <summary className="cursor-pointer text-xs text-slate-700">Edit account details</summary>
                <div className="mt-2 grid gap-2 md:grid-cols-3">
                  <Input
                    autoComplete="name"
                    placeholder="Full name"
                    value={profileName}
                    onChange={(event) => setProfileName(event.target.value)}
                  />
                  <Input
                    autoComplete="email"
                    placeholder="Email"
                    value={profileEmail}
                    onChange={(event) => setProfileEmail(event.target.value)}
                  />
                  <Input
                    autoComplete="new-password"
                    type="password"
                    placeholder="New password (optional)"
                    value={profilePassword}
                    onChange={(event) => setProfilePassword(event.target.value)}
                  />
                </div>
                <div className="mt-2">
                  <Button variant="outline" size="sm" onClick={onUpdateProfile} disabled={loading || !profileName.trim() || !profileEmail.trim()}>
                    Save profile
                  </Button>
                </div>
              </details>
            </div>
          ) : (
            <div className="space-y-2">
              <p className="text-sm text-slate-600">No active session. Continue via the dedicated auth page.</p>
              <Button type="button" onClick={() => navigate('/auth')}>
                Open sign-in
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      <Tabs defaultValue="overview" className="w-full">
        <TabsList className="w-full justify-start overflow-x-auto">
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="citations">Citations</TabsTrigger>
          <TabsTrigger value="collaborations">Collaborations</TabsTrigger>
          <TabsTrigger value="themes">Themes</TabsTrigger>
          <TabsTrigger value="strategy">Strategy</TabsTrigger>
          <TabsTrigger value="security">Security</TabsTrigger>
          <TabsTrigger value="reports">Reports</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="space-y-3">
          {isInitialProfileLoading ? (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm">Loading profile</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="animate-pulse space-y-2">
                  <div className="h-8 rounded bg-slate-100" />
                  <div className="h-8 rounded bg-slate-100" />
                  <div className="h-8 rounded bg-slate-100" />
                </div>
              </CardContent>
            </Card>
          ) : null}

          {!user ? (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm">Sign in required</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2 text-sm">
                <p className="text-muted-foreground">No active account session found for this browser tab.</p>
                <Button type="button" onClick={() => navigate('/auth')}>
                  Open sign-in
                </Button>
              </CardContent>
            </Card>
          ) : null}
          {user ? (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm">Onboarding checklist</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2 text-sm">
                <div className="flex items-center justify-between rounded border border-border/70 p-2">
                  <span>1. Complete profile details</span>
                  <span className={profileName.trim() && profileEmail.trim() ? 'text-emerald-700' : 'text-amber-700'}>
                    {profileName.trim() && profileEmail.trim() ? 'Done' : 'Pending'}
                  </span>
                </div>
                <div className="flex items-center justify-between rounded border border-border/70 p-2">
                  <span>2. Verify email</span>
                  <span className={user.email_verified_at ? 'text-emerald-700' : 'text-amber-700'}>
                    {user.email_verified_at ? 'Done' : 'Pending'}
                  </span>
                </div>
                <div className="flex items-center justify-between rounded border border-border/70 p-2">
                  <span>3. Link ORCID</span>
                  <span className={user.orcid_id ? 'text-emerald-700' : 'text-amber-700'}>
                    {user.orcid_id ? 'Done' : 'Pending'}
                  </span>
                </div>
                <div className="flex items-center justify-between rounded border border-border/70 p-2">
                  <span>4. Run first sync</span>
                  <span className={works.length > 0 ? 'text-emerald-700' : 'text-amber-700'}>
                    {works.length > 0 ? 'Done' : 'Pending'}
                  </span>
                </div>
              </CardContent>
            </Card>
          ) : null}

          {user && works.length === 0 ? (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm">No publications yet</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2 text-sm">
                <p className="text-muted-foreground">Import publications to start citation, collaboration, and theme analytics.</p>
                <div className="flex flex-wrap gap-2">
                  <Button variant="outline" size="sm" onClick={onImportOrcid} disabled={loading || verificationRequired}>
                    Import ORCID works
                  </Button>
                  <Button variant="outline" size="sm" onClick={onUploadWorksCsvStub}>
                    Upload works CSV (coming soon)
                  </Button>
                </div>
              </CardContent>
            </Card>
          ) : null}

          {user ? (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm">Sync status</CardTitle>
              </CardHeader>
              <CardContent className="space-y-1 text-sm">
                <div className="flex items-center justify-between border-b border-border/60 py-1">
                  <span>Works</span>
                  <span>{formatTimestamp(syncStatus.works_last_synced_at)}</span>
                </div>
                <div className="flex items-center justify-between border-b border-border/60 py-1">
                  <span>Metrics</span>
                  <span>{formatTimestamp(syncStatus.metrics_last_synced_at)}</span>
                </div>
                <div className="flex items-center justify-between border-b border-border/60 py-1">
                  <span>Themes</span>
                  <span>{formatTimestamp(syncStatus.themes_last_generated_at)}</span>
                </div>
                <div className="flex items-center justify-between py-1">
                  <span>Impact</span>
                  <span>{formatTimestamp(syncStatus.impact_last_computed_at)}</span>
                </div>
              </CardContent>
            </Card>
          ) : null}

          <div className="grid gap-3 md:grid-cols-4">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-xs text-muted-foreground">Total works</CardTitle>
              </CardHeader>
              <CardContent className="text-2xl font-semibold">{impactSnapshot?.total_works ?? works.length}</CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-xs text-muted-foreground">Total citations</CardTitle>
              </CardHeader>
              <CardContent className="text-2xl font-semibold">{impactSnapshot?.total_citations ?? 0}</CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-xs text-muted-foreground">h-index</CardTitle>
              </CardHeader>
              <CardContent className="text-2xl font-semibold">{impactSnapshot?.h_index ?? 0}</CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-xs text-muted-foreground">Citation velocity</CardTitle>
              </CardHeader>
              <CardContent className="text-2xl font-semibold">{impactSnapshot?.citation_velocity ?? 0}</CardContent>
            </Card>
          </div>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">AI summary</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-sm">
              <p>{analysis?.scholarly_impact_summary || 'Run strategy analysis to generate AI interpretation.'}</p>
              <Button variant="outline" size="sm" onClick={onAnalyse} disabled={loading || !user || verificationRequired}>
                Refresh AI summary
              </Button>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="citations" className="space-y-3">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">Citation timeline</CardTitle>
            </CardHeader>
            <CardContent className="space-y-1 text-sm">
              {timelineRows.map((item) => (
                <div key={item.year} className="flex items-center justify-between border-b border-border/60 py-1">
                  <span>{item.year}</span>
                  <span>{item.citations} citations</span>
                </div>
              ))}
              {!timelineRows.length ? <p className="text-muted-foreground">No timeline data yet.</p> : null}
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">Most cited works</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-sm">
              {metricsWorks.slice(0, 8).map((item) => (
                <div key={item.work_id} className="rounded border border-border/70 p-2">
                  <p className="font-medium">{item.title}</p>
                  <p className="text-xs text-muted-foreground">
                    {item.year ?? 'Year n/a'} | {item.citations} citations | provider: {item.provider}
                  </p>
                </div>
              ))}
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">Citation distribution histogram</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-sm">
              {Object.entries(metricsHistogram).map(([bucket, value]) => (
                <div key={bucket} className="grid grid-cols-[80px_minmax(0,1fr)_40px] items-center gap-2">
                  <span>{bucket}</span>
                  <div className="h-2 rounded bg-muted">
                    <div
                      className="h-2 rounded bg-emerald-600/70"
                      style={{ width: histogramBar(totalHistogramCount, value) }}
                    />
                  </div>
                  <span className="text-right">{value}</span>
                </div>
              ))}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="collaborations" className="space-y-3">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">Top collaborators</CardTitle>
            </CardHeader>
            <CardContent className="space-y-1 text-sm">
              {collaboratorRows.slice(0, 10).map((item) => (
                <div key={item.author_id} className="flex items-center justify-between border-b border-border/60 py-1">
                  <span>{item.name}</span>
                  <span>
                    {item.n_shared_works} shared ({item.first_year ?? 'n/a'}-{item.last_year ?? 'n/a'})
                  </span>
                </div>
              ))}
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">New collaborators by year</CardTitle>
            </CardHeader>
            <CardContent className="space-y-1 text-sm">
              {Object.entries(collaboratorsByYear).map(([year, count]) => (
                <div key={year} className="flex items-center justify-between border-b border-border/60 py-1">
                  <span>{year}</span>
                  <span>{count}</span>
                </div>
              ))}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="themes" className="space-y-3">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">Dominant research themes</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-sm">
              {themeRows.map((cluster) => (
                <div key={cluster.cluster_id} className="rounded border border-border/70 p-2">
                  <p className="font-medium">{cluster.label}</p>
                  <p className="text-xs text-muted-foreground">
                    {cluster.n_works} works | mean citations {cluster.citation_mean}
                  </p>
                </div>
              ))}
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">Theme-informed planner context</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-sm">
              <p>
                Dominant themes: {(personaContext?.dominant_themes || []).join(', ') || 'n/a'}
              </p>
              <p>Common study types: {(personaContext?.common_study_types || []).join(', ') || 'n/a'}</p>
              <p>Top venues: {(personaContext?.top_venues || []).join(', ') || 'n/a'}</p>
              <p>Frequent collaborators: {(personaContext?.frequent_collaborators || []).join(', ') || 'n/a'}</p>
              <p>Methodological patterns: {(personaContext?.methodological_patterns || []).join(', ') || 'n/a'}</p>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="strategy" className="space-y-3">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">Strategic analysis</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              <Button variant="outline" size="sm" onClick={onAnalyse} disabled={loading || !user || verificationRequired}>
                Generate strategy analysis
              </Button>
              <p>{analysis?.collaboration_analysis || 'No strategy analysis generated yet.'}</p>
              <p>{analysis?.thematic_evolution || ''}</p>
              <div className="grid gap-2 md:grid-cols-3">
                <div>
                  <p className="font-medium">Strengths</p>
                  <ul className="list-disc pl-4">
                    {(analysis?.strengths || []).map((item) => (
                      <li key={item}>{item}</li>
                    ))}
                  </ul>
                </div>
                <div>
                  <p className="font-medium">Blind spots</p>
                  <ul className="list-disc pl-4">
                    {(analysis?.blind_spots || []).map((item) => (
                      <li key={item}>{item}</li>
                    ))}
                  </ul>
                </div>
                <div>
                  <p className="font-medium">Strategic suggestions</p>
                  <ul className="list-disc pl-4">
                    {(analysis?.strategic_suggestions || []).map((item) => (
                      <li key={item}>{item}</li>
                    ))}
                  </ul>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="security" className="space-y-3">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">Account security</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              <p>
                Two-factor status: <strong>{twoFactorState?.enabled ? 'Enabled' : 'Disabled'}</strong>
              </p>
              {!twoFactorState?.enabled ? (
                <div className="space-y-2">
                  <Button type="button" size="sm" variant="outline" onClick={onStartTwoFactorSetup} disabled={loading}>
                    Generate 2FA setup
                  </Button>
                  {twoFactorSetup ? (
                    <div className="space-y-2 rounded border border-emerald-200 bg-white p-2">
                      <p className="text-xs text-slate-600">
                        Secret (manual): <span className="font-mono">{twoFactorSetup.secret}</span>
                      </p>
                      <p className="text-xs text-slate-600 break-all">URI: {twoFactorSetup.otpauth_uri}</p>
                      <p className="text-xs text-slate-600">Backup codes: {twoFactorSetup.backup_codes.join(', ')}</p>
                      <Input
                        placeholder="Enter authenticator code"
                        value={twoFactorCode}
                        onChange={(event) => setTwoFactorCode(event.target.value)}
                      />
                      <Button type="button" size="sm" onClick={onEnableTwoFactor} disabled={loading || !twoFactorCode.trim()}>
                        Enable 2FA
                      </Button>
                    </div>
                  ) : null}
                </div>
              ) : (
                <div className="space-y-2">
                  <p className="text-xs text-slate-600">Backup codes remaining: {twoFactorState.backup_codes_remaining}</p>
                  <Input
                    placeholder="Enter authenticator or backup code to disable"
                    value={disableTwoFactorCode}
                    onChange={(event) => setDisableTwoFactorCode(event.target.value)}
                  />
                  <Button type="button" size="sm" variant="outline" onClick={onDisableTwoFactor} disabled={loading || !disableTwoFactorCode.trim()}>
                    Disable 2FA
                  </Button>
                </div>
              )}
              {user ? (
                <div className="rounded-md border border-border/70 bg-background p-2 text-xs">
                  <p>
                    Last sign-in: <span className="font-medium">{formatTimestamp(user.last_sign_in_at)}</span>
                  </p>
                  <p>
                    Last account change: <span className="font-medium">{formatTimestamp(user.updated_at)}</span>
                  </p>
                </div>
              ) : null}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">Data and impact maintenance</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-sm">
              <div className="flex flex-wrap items-center gap-2">
                <Button variant="outline" size="sm" onClick={onSyncMetrics} disabled={loading || verificationRequired}>
                  Sync metrics
                </Button>
                <Button variant="outline" size="sm" onClick={onGenerateEmbeddings} disabled={loading || verificationRequired}>
                  Generate themes
                </Button>
                <Button variant="outline" size="sm" onClick={onRecomputeImpact} disabled={loading || verificationRequired}>
                  Recompute impact
                </Button>
              </div>
              <p className="text-xs text-slate-600">Run these actions when new publications or citation updates are available.</p>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="reports" className="space-y-3">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">Downloadable impact reports</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              <div className="flex flex-wrap gap-2">
                <Button variant="outline" size="sm" onClick={onGenerateReport} disabled={loading || !user || verificationRequired}>
                  Generate report
                </Button>
                <Button variant="outline" size="sm" onClick={onDownloadReport} disabled={!report}>
                  Download JSON report
                </Button>
              </div>
              <div className="space-y-2">
                <p className="font-medium">CV impact paragraph</p>
                <textarea
                  className="min-h-[84px] w-full rounded border border-border bg-background p-2 text-sm"
                  value={report?.executive_summary || ''}
                  readOnly
                />
              </div>
              <div className="space-y-2">
                <p className="font-medium">Fellowship narrative</p>
                <textarea
                  className="min-h-[110px] w-full rounded border border-border bg-background p-2 text-sm"
                  value={`${report?.collaboration_profile || ''}\n\n${report?.thematic_profile || ''}`.trim()}
                  readOnly
                />
              </div>
              <div className="space-y-2">
                <p className="font-medium">2-page impact report draft</p>
                <textarea
                  className="min-h-[220px] w-full rounded border border-border bg-background p-2 text-sm"
                  value={report ? JSON.stringify(report, null, 2) : ''}
                  readOnly
                />
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {status ? <p className="text-sm text-emerald-700">{status}</p> : null}
      {error ? <p className="text-sm text-destructive">{error}</p> : null}
      {loading ? <p className="text-xs text-muted-foreground">Working...</p> : null}
    </section>
  )
}
