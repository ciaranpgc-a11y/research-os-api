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
  generateImpactReport,
  generatePersonaEmbeddings,
  importOrcidWorks,
  listPersonaWorks,
  logoutAuth,
  recomputeImpact,
  setupTwoFactor,
  syncPersonaMetrics,
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

  const totalHistogramCount = useMemo(() => {
    if (!statePayload) {
      return 0
    }
    return Object.values(statePayload.metrics.histogram).reduce((sum, value) => sum + value, 0)
  }, [statePayload])

  const loadProfileData = useCallback(async (sessionToken: string) => {
    setLoading(true)
    setError('')
    try {
      const [me, workRows, personaState, collaboratorRows, themeRows, contextRows, twoFactor] = await Promise.all([
        fetchMe(sessionToken),
        listPersonaWorks(sessionToken),
        fetchPersonaState(sessionToken),
        fetchImpactCollaborators(sessionToken),
        fetchImpactThemes(sessionToken),
        fetchPersonaContext(sessionToken),
        fetchTwoFactorState(sessionToken),
      ])
      setUser(me)
      setWorks(workRows)
      setStatePayload(personaState)
      setCollaborators(collaboratorRows)
      setThemes(themeRows)
      setPersonaContext(contextRows)
      setTwoFactorState(twoFactor)
      try {
        const snapshot = await recomputeImpact(sessionToken)
        setImpactSnapshot(snapshot)
      } catch (snapshotError) {
        setImpactSnapshot(null)
        setStatus(snapshotError instanceof Error ? snapshotError.message : 'Impact snapshot not available yet.')
      }
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Failed to load impact data.')
      setUser(null)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    if (!token) {
      return
    }
    void loadProfileData(token)
  }, [token, loadProfileData])

  useEffect(() => {
    if (!token) {
      navigate('/auth', { replace: true })
    }
  }, [navigate, token])

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

  const onImportOrcid = async () => {
    if (!token) {
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

  return (
    <section className="space-y-4">
      <header className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">Impact Dashboard</h1>
        <p className="text-sm text-muted-foreground">
          Profile publications, citation traction, collaborations, themes, and AI-supported strategic positioning.
        </p>
      </header>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm">User profile</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {user ? (
            <div className="space-y-3 text-sm">
              <div className="flex flex-wrap items-center gap-2">
                <span className="rounded border border-border px-2 py-1">Signed in: {user.email}</span>
                {user.orcid_id ? <span className="rounded border border-emerald-500/40 bg-emerald-500/10 px-2 py-1">ORCID: {user.orcid_id}</span> : null}
                <span className="rounded border border-slate-300 bg-slate-50 px-2 py-1">
                  2FA: {twoFactorState?.enabled ? 'Enabled' : 'Disabled'}
                </span>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <Button variant="outline" size="sm" onClick={onConnectOrcid} disabled={loading}>
                  Connect ORCID
                </Button>
                <Button variant="outline" size="sm" onClick={onImportOrcid} disabled={loading}>
                  Import ORCID works
                </Button>
                <Button variant="outline" size="sm" onClick={onSyncMetrics} disabled={loading}>
                  Sync metrics
                </Button>
                <Button variant="outline" size="sm" onClick={onGenerateEmbeddings} disabled={loading}>
                  Generate themes
                </Button>
                <Button variant="outline" size="sm" onClick={onRecomputeImpact} disabled={loading}>
                  Recompute impact
                </Button>
                <Button variant="ghost" size="sm" onClick={onLogout} disabled={loading}>
                  Sign out
                </Button>
              </div>
              <div className="rounded-md border border-slate-200 bg-slate-50 p-3">
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-600">Two-factor authentication</p>
                {!twoFactorState?.enabled ? (
                  <div className="mt-2 space-y-2">
                    <Button type="button" size="sm" variant="outline" onClick={onStartTwoFactorSetup} disabled={loading}>
                      Generate 2FA setup
                    </Button>
                    {twoFactorSetup ? (
                      <div className="space-y-2 rounded border border-emerald-200 bg-white p-2">
                        <p className="text-xs text-slate-600">Secret (manual): <span className="font-mono">{twoFactorSetup.secret}</span></p>
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
                  <div className="mt-2 space-y-2">
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
              </div>
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
          <TabsTrigger value="reports">Reports</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="space-y-3">
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
              <Button variant="outline" size="sm" onClick={onAnalyse} disabled={loading || !user}>
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
              {(statePayload?.timeline || []).map((item) => (
                <div key={item.year} className="flex items-center justify-between border-b border-border/60 py-1">
                  <span>{item.year}</span>
                  <span>{item.citations} citations</span>
                </div>
              ))}
              {!statePayload?.timeline?.length ? <p className="text-muted-foreground">No timeline data yet.</p> : null}
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">Most cited works</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-sm">
              {(statePayload?.metrics.works || []).slice(0, 8).map((item) => (
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
              {Object.entries(statePayload?.metrics.histogram || {}).map(([bucket, value]) => (
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
              {(collaborators?.collaborators || []).slice(0, 10).map((item) => (
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
              {Object.entries(collaborators?.new_collaborators_by_year || {}).map(([year, count]) => (
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
              {(themes?.clusters || []).map((cluster) => (
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
              <Button variant="outline" size="sm" onClick={onAnalyse} disabled={loading || !user}>
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

        <TabsContent value="reports" className="space-y-3">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">Downloadable impact reports</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              <div className="flex flex-wrap gap-2">
                <Button variant="outline" size="sm" onClick={onGenerateReport} disabled={loading || !user}>
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
