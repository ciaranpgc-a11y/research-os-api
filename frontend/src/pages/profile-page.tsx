import { useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'

import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { fetchImpactCollaborators, fetchMe, fetchOrcidConnect, fetchOrcidStatus, fetchPersonaState, importOrcidWorks, updateMe } from '@/lib/impact-api'
import { getAuthSessionToken } from '@/lib/auth-session'
import type { AuthUser, ImpactCollaboratorsPayload, OrcidStatusPayload, PersonaStatePayload } from '@/types/impact'

const PROFILE_META_STORAGE_KEY = 'aawe-profile-meta'
const WRITING_PREFERENCES_STORAGE_KEY = 'aawe-profile-writing-preferences'

const STUDY_TYPE_OPTIONS = [
  'Retrospective observational cohort',
  'Prospective observational cohort',
  'Imaging biomarker study',
  'Diagnostic accuracy study',
  'Prognostic modelling study',
  'Methodological study',
]

const GUIDELINE_OPTIONS = ['STROBE', 'CONSORT', 'PRISMA', 'TRIPOD', 'STARD']

type ProfileMeta = {
  affiliation: string
  keywords: string[]
}

type WritingPreferences = {
  defaultStudyTypes: string[]
  preferredJournals: string[]
  tone: 'conservative' | 'balanced' | 'assertive'
  reportingGuidelines: string[]
}

function readProfileMeta(): ProfileMeta {
  if (typeof window === 'undefined') {
    return { affiliation: '', keywords: [] }
  }
  const raw = window.localStorage.getItem(PROFILE_META_STORAGE_KEY)
  if (!raw) {
    return { affiliation: '', keywords: [] }
  }
  try {
    const parsed = JSON.parse(raw) as ProfileMeta
    return {
      affiliation: parsed.affiliation || '',
      keywords: Array.isArray(parsed.keywords) ? parsed.keywords.slice(0, 8) : [],
    }
  } catch {
    return { affiliation: '', keywords: [] }
  }
}

function writeProfileMeta(value: ProfileMeta): void {
  window.localStorage.setItem(PROFILE_META_STORAGE_KEY, JSON.stringify(value))
}

function readWritingPreferences(): WritingPreferences {
  if (typeof window === 'undefined') {
    return {
      defaultStudyTypes: [],
      preferredJournals: [],
      tone: 'conservative',
      reportingGuidelines: [],
    }
  }
  const raw = window.localStorage.getItem(WRITING_PREFERENCES_STORAGE_KEY)
  if (!raw) {
    return {
      defaultStudyTypes: [],
      preferredJournals: [],
      tone: 'conservative',
      reportingGuidelines: [],
    }
  }
  try {
    const parsed = JSON.parse(raw) as WritingPreferences
    return {
      defaultStudyTypes: Array.isArray(parsed.defaultStudyTypes) ? parsed.defaultStudyTypes : [],
      preferredJournals: Array.isArray(parsed.preferredJournals) ? parsed.preferredJournals : [],
      tone: parsed.tone || 'conservative',
      reportingGuidelines: Array.isArray(parsed.reportingGuidelines) ? parsed.reportingGuidelines : [],
    }
  } catch {
    return {
      defaultStudyTypes: [],
      preferredJournals: [],
      tone: 'conservative',
      reportingGuidelines: [],
    }
  }
}

function writeWritingPreferences(value: WritingPreferences): void {
  window.localStorage.setItem(WRITING_PREFERENCES_STORAGE_KEY, JSON.stringify(value))
}

function formatTimestamp(value: string | null | undefined): string {
  if (!value) {
    return 'Not available'
  }
  const parsed = Date.parse(value)
  if (Number.isNaN(parsed)) {
    return 'Not available'
  }
  return new Date(parsed).toLocaleString('en-GB', {
    year: 'numeric',
    month: 'short',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  })
}

export function ProfilePage() {
  const navigate = useNavigate()
  const [token, setToken] = useState<string>(() => getAuthSessionToken())
  const [user, setUser] = useState<AuthUser | null>(null)
  const [orcidStatus, setOrcidStatus] = useState<OrcidStatusPayload | null>(null)
  const [personaState, setPersonaState] = useState<PersonaStatePayload | null>(null)
  const [collaborators, setCollaborators] = useState<ImpactCollaboratorsPayload | null>(null)
  const [loading, setLoading] = useState(false)
  const [status, setStatus] = useState('')
  const [error, setError] = useState('')
  const [nameInput, setNameInput] = useState('')
  const [keywordInput, setKeywordInput] = useState('')
  const [journalInput, setJournalInput] = useState('')
  const [meta, setMeta] = useState<ProfileMeta>(() => readProfileMeta())
  const [preferences, setPreferences] = useState<WritingPreferences>(() => readWritingPreferences())

  const loadProfile = useCallback(async (sessionToken: string) => {
    setLoading(true)
    setError('')
    try {
      const settled = await Promise.allSettled([
        fetchMe(sessionToken),
        fetchOrcidStatus(sessionToken),
        fetchPersonaState(sessionToken),
        fetchImpactCollaborators(sessionToken),
      ])
      const [meResult, orcidResult, stateResult, collaboratorResult] = settled
      if (meResult.status === 'fulfilled') {
        setUser(meResult.value)
        setNameInput(meResult.value.name || '')
      } else {
        setUser(null)
      }
      setOrcidStatus(orcidResult.status === 'fulfilled' ? orcidResult.value : null)
      setPersonaState(stateResult.status === 'fulfilled' ? stateResult.value : null)
      setCollaborators(collaboratorResult.status === 'fulfilled' ? collaboratorResult.value : null)
      const failureCount = settled.filter((item) => item.status === 'rejected').length
      if (failureCount > 0) {
        setStatus(`Profile loaded with ${failureCount} source${failureCount === 1 ? '' : 's'} unavailable.`)
      }
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Could not load profile.')
      setUser(null)
      setOrcidStatus(null)
      setPersonaState(null)
      setCollaborators(null)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    const currentToken = getAuthSessionToken()
    setToken(currentToken)
    if (!currentToken) {
      setUser(null)
      setOrcidStatus(null)
      setPersonaState(null)
      setCollaborators(null)
      return
    }
    void loadProfile(currentToken)
  }, [loadProfile])

  const works = personaState?.works ?? []
  const syncStatus = personaState?.sync_status
  const isGuest = !token || !user

  const profileCompleteness = useMemo(() => {
    const checks = [
      Boolean(nameInput.trim()),
      Boolean(meta.affiliation.trim()),
      meta.keywords.length > 0,
      Boolean(orcidStatus?.linked || user?.orcid_id),
      works.length > 0,
      preferences.defaultStudyTypes.length > 0,
      preferences.reportingGuidelines.length > 0,
    ]
    const complete = checks.filter(Boolean).length
    return Math.round((complete / checks.length) * 100)
  }, [meta.affiliation, meta.keywords.length, nameInput, orcidStatus?.linked, preferences.defaultStudyTypes.length, preferences.reportingGuidelines.length, user?.orcid_id, works.length])

  const onSaveIdentity = async () => {
    if (!token) {
      navigate('/auth')
      return
    }
    setError('')
    setStatus('')
    setLoading(true)
    try {
      const nextUser = await updateMe(token, { name: nameInput.trim() })
      setUser(nextUser)
      writeProfileMeta(meta)
      setStatus('Identity details saved.')
    } catch (updateError) {
      setError(updateError instanceof Error ? updateError.message : 'Could not save identity.')
    } finally {
      setLoading(false)
    }
  }

  const onConnectOrcid = async () => {
    if (!token) {
      navigate('/auth')
      return
    }
    if (!user?.email_verified_at) {
      setStatus('Verify your email first, then connect ORCID.')
      return
    }
    if (orcidStatus && !orcidStatus.configured) {
      setStatus(orcidStatus.issues[0] || 'ORCID is not configured in backend environment.')
      return
    }
    setError('')
    setStatus('')
    try {
      const payload = await fetchOrcidConnect(token)
      window.location.assign(payload.url)
    } catch (connectError) {
      setError(connectError instanceof Error ? connectError.message : 'ORCID connect failed.')
    }
  }

  const onImportWorks = async () => {
    if (!token) {
      navigate('/auth')
      return
    }
    if (!(orcidStatus?.linked || user?.orcid_id)) {
      setStatus('Link ORCID first, then import works.')
      return
    }
    setError('')
    setStatus('')
    setLoading(true)
    try {
      const payload = await importOrcidWorks(token)
      setStatus(`Imported ${payload.imported_count} work(s) from ORCID.`)
      await loadProfile(token)
    } catch (importError) {
      setError(importError instanceof Error ? importError.message : 'Could not import works.')
    } finally {
      setLoading(false)
    }
  }

  const onAddKeyword = () => {
    const nextKeyword = keywordInput.trim()
    if (!nextKeyword) {
      return
    }
    if (meta.keywords.includes(nextKeyword) || meta.keywords.length >= 8) {
      setKeywordInput('')
      return
    }
    const next = { ...meta, keywords: [...meta.keywords, nextKeyword] }
    setMeta(next)
    writeProfileMeta(next)
    setKeywordInput('')
  }

  const onAddJournal = () => {
    const nextJournal = journalInput.trim()
    if (!nextJournal) {
      return
    }
    if (preferences.preferredJournals.includes(nextJournal)) {
      setJournalInput('')
      return
    }
    const next = { ...preferences, preferredJournals: [...preferences.preferredJournals, nextJournal] }
    setPreferences(next)
    writeWritingPreferences(next)
    setJournalInput('')
  }

  const onToggleStudyType = (value: string) => {
    const exists = preferences.defaultStudyTypes.includes(value)
    const next = {
      ...preferences,
      defaultStudyTypes: exists
        ? preferences.defaultStudyTypes.filter((item) => item !== value)
        : [...preferences.defaultStudyTypes, value],
    }
    setPreferences(next)
    writeWritingPreferences(next)
  }

  const onToggleGuideline = (value: string) => {
    const exists = preferences.reportingGuidelines.includes(value)
    const next = {
      ...preferences,
      reportingGuidelines: exists
        ? preferences.reportingGuidelines.filter((item) => item !== value)
        : [...preferences.reportingGuidelines, value],
    }
    setPreferences(next)
    writeWritingPreferences(next)
  }

  const onToneChange = (value: 'conservative' | 'balanced' | 'assertive') => {
    const next = { ...preferences, tone: value }
    setPreferences(next)
    writeWritingPreferences(next)
  }

  return (
    <section className="space-y-4">
      <header className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">Profile</h1>
        <p className="text-sm text-muted-foreground">
          Global account context shared across all workspaces and manuscript plans.
        </p>
      </header>

      {isGuest ? (
        <Card className="border-emerald-300 bg-emerald-50/70">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">You are browsing as guest</CardTitle>
            <CardDescription>
              Create an account to save profile details, sync ORCID, and keep publication libraries.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-wrap gap-2">
            <Button type="button" onClick={() => navigate('/auth')}>
              Create account
            </Button>
            <Button type="button" variant="outline" onClick={() => navigate('/auth')}>
              Sign in
            </Button>
          </CardContent>
        </Card>
      ) : null}

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">Identity</CardTitle>
          <CardDescription>Name, affiliation, and keywords used across AAWE.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid gap-2 md:grid-cols-2">
            <div className="space-y-1">
              <label className="text-xs text-muted-foreground">Name</label>
              <Input value={nameInput} onChange={(event) => setNameInput(event.target.value)} placeholder="Full name" />
            </div>
            <div className="space-y-1">
              <label className="text-xs text-muted-foreground">Role / affiliation</label>
              <Input
                value={meta.affiliation}
                onChange={(event) => {
                  const next = { ...meta, affiliation: event.target.value }
                  setMeta(next)
                  writeProfileMeta(next)
                }}
                placeholder="Institution / role"
              />
            </div>
          </div>

          <div className="space-y-1">
            <label className="text-xs text-muted-foreground">Research keywords (max 8)</label>
            <div className="flex flex-wrap gap-1">
              {meta.keywords.map((keyword) => (
                <button
                  key={keyword}
                  type="button"
                  className="rounded border border-border bg-background px-2 py-1 text-xs"
                  onClick={() => {
                    const next = { ...meta, keywords: meta.keywords.filter((item) => item !== keyword) }
                    setMeta(next)
                    writeProfileMeta(next)
                  }}
                >
                  {keyword} x
                </button>
              ))}
            </div>
            <div className="flex gap-2">
              <Input value={keywordInput} onChange={(event) => setKeywordInput(event.target.value)} placeholder="Add keyword" />
              <Button type="button" variant="outline" onClick={onAddKeyword}>
                Add
              </Button>
            </div>
          </div>

          <div className="space-y-1">
            <div className="flex items-center justify-between text-xs">
              <span className="text-muted-foreground">Profile completeness</span>
              <span className="font-medium">{profileCompleteness}%</span>
            </div>
            <div className="h-2 rounded bg-muted">
              <div className="h-2 rounded bg-emerald-600" style={{ width: `${profileCompleteness}%` }} />
            </div>
          </div>

          <div className="flex flex-wrap gap-2">
            <Button type="button" size="sm" onClick={onSaveIdentity} disabled={loading}>
              Save identity
            </Button>
            <Button type="button" size="sm" variant="outline" onClick={onConnectOrcid} disabled={loading}>
              Connect ORCID
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">Integrations</CardTitle>
          <CardDescription>Connection and sync status for profile data sources.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          <div className="rounded border border-border p-2">
            <p className="font-medium">ORCID</p>
            <p>Status: {orcidStatus?.linked ? 'Connected' : 'Not connected'}</p>
            <p>Last sync: {formatTimestamp(syncStatus?.orcid_last_synced_at)}</p>
            <div className="mt-2 flex flex-wrap gap-2">
              <Button type="button" size="sm" variant="outline" onClick={onConnectOrcid} disabled={loading}>
                Connect ORCID
              </Button>
              <Button type="button" size="sm" variant="outline" onClick={onImportWorks} disabled={loading}>
                Sync now
              </Button>
            </div>
          </div>

          <div className="rounded border border-border p-2">
            <p className="font-medium">ResearchGate</p>
            <p className="text-xs text-muted-foreground">Experimental / limited.</p>
            <Button type="button" size="sm" variant="outline" disabled>
              Connect (coming soon)
            </Button>
          </div>

          <div className="rounded border border-border p-2">
            <p className="font-medium">Google Scholar</p>
            <p className="text-xs text-muted-foreground">Import via BibTeX or DOI list (no direct scraping).</p>
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => setStatus('BibTeX / DOI list import flow is the supported path for Google Scholar sources.')}
            >
              Import via BibTeX / DOI list
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">Publications library (AAWE Works)</CardTitle>
          <CardDescription>Works used for collaborator and impact analysis.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex flex-wrap gap-2">
            <Button type="button" size="sm" variant="outline" onClick={onImportWorks} disabled={loading}>
              Import works
            </Button>
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => setStatus('Collections editor will be added next.')}
            >
              Create collection
            </Button>
          </div>

          {works.length === 0 ? (
            <div className="rounded border border-dashed border-border p-3 text-sm">
              <p className="font-medium">No works imported yet</p>
              <ol className="mt-2 list-decimal space-y-1 pl-5 text-muted-foreground">
                <li>Connect ORCID</li>
                <li>Import works</li>
                <li>Build a collection for a manuscript</li>
              </ol>
            </div>
          ) : (
            <div className="overflow-x-auto rounded border border-border">
              <table className="w-full min-w-[760px] text-sm">
                <thead className="bg-muted/40 text-left text-xs text-muted-foreground">
                  <tr>
                    <th className="px-2 py-2">Title</th>
                    <th className="px-2 py-2">Year</th>
                    <th className="px-2 py-2">Venue</th>
                    <th className="px-2 py-2">Role</th>
                    <th className="px-2 py-2">Topic tags</th>
                  </tr>
                </thead>
                <tbody>
                  {works.slice(0, 15).map((work) => (
                    <tr key={work.id} className="border-t border-border">
                      <td className="px-2 py-2">{work.title}</td>
                      <td className="px-2 py-2">{work.year ?? 'n/a'}</td>
                      <td className="px-2 py-2">{work.venue_name || 'n/a'}</td>
                      <td className="px-2 py-2">{work.provenance === 'orcid' ? 'Author' : 'Collaborator'}</td>
                      <td className="px-2 py-2">
                        <div className="flex flex-wrap gap-1">
                          {(work.keywords || []).slice(0, 3).map((keyword) => (
                            <span key={keyword} className="rounded border border-border bg-background px-1.5 py-0.5 text-[11px]">
                              {keyword}
                            </span>
                          ))}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">Collaborators</CardTitle>
          <CardDescription>Derived from publication metadata.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {(collaborators?.collaborators ?? []).length > 0 ? (
            <div className="space-y-1 text-sm">
              {collaborators?.collaborators.slice(0, 8).map((collaborator) => (
                <div key={collaborator.author_id} className="flex items-center justify-between rounded border border-border px-2 py-1">
                  <span>{collaborator.name}</span>
                  <span className="text-xs text-muted-foreground">
                    {collaborator.n_shared_works} shared ({collaborator.first_year ?? 'n/a'}-{collaborator.last_year ?? 'n/a'})
                  </span>
                </div>
              ))}
            </div>
          ) : (
            <div className="rounded border border-dashed border-border p-3 text-sm text-muted-foreground">
              Collaborator graph is empty. Import works to derive collaborator links.
            </div>
          )}
          <Button type="button" size="sm" variant="outline" disabled={isGuest}>
            Invite (coming soon)
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">Writing preferences</CardTitle>
          <CardDescription>Feeds manuscript planning defaults across workspaces.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          <div className="space-y-1">
            <p className="text-xs text-muted-foreground">Default study types</p>
            <div className="grid gap-1 md:grid-cols-2">
              {STUDY_TYPE_OPTIONS.map((option) => (
                <label key={option} className="flex items-center gap-2 rounded border border-border px-2 py-1">
                  <input
                    type="checkbox"
                    checked={preferences.defaultStudyTypes.includes(option)}
                    onChange={() => onToggleStudyType(option)}
                  />
                  <span>{option}</span>
                </label>
              ))}
            </div>
          </div>

          <div className="space-y-1">
            <p className="text-xs text-muted-foreground">Preferred journals</p>
            <div className="flex flex-wrap gap-1">
              {preferences.preferredJournals.map((journal) => (
                <button
                  key={journal}
                  type="button"
                  className="rounded border border-border bg-background px-2 py-1 text-xs"
                  onClick={() => {
                    const next = {
                      ...preferences,
                      preferredJournals: preferences.preferredJournals.filter((item) => item !== journal),
                    }
                    setPreferences(next)
                    writeWritingPreferences(next)
                  }}
                >
                  {journal} x
                </button>
              ))}
            </div>
            <div className="flex gap-2">
              <Input value={journalInput} onChange={(event) => setJournalInput(event.target.value)} placeholder="Add journal" />
              <Button type="button" variant="outline" onClick={onAddJournal}>
                Add
              </Button>
            </div>
          </div>

          <div className="space-y-1">
            <p className="text-xs text-muted-foreground">Tone controls</p>
            <div className="flex flex-wrap gap-2">
              {(['conservative', 'balanced', 'assertive'] as const).map((tone) => (
                <label key={tone} className="flex items-center gap-2 rounded border border-border px-2 py-1">
                  <input
                    type="radio"
                    name="writing-tone"
                    checked={preferences.tone === tone}
                    onChange={() => onToneChange(tone)}
                  />
                  <span className="capitalize">{tone}</span>
                </label>
              ))}
            </div>
          </div>

          <div className="space-y-1">
            <p className="text-xs text-muted-foreground">Reporting guidelines</p>
            <div className="flex flex-wrap gap-2">
              {GUIDELINE_OPTIONS.map((guideline) => (
                <button
                  key={guideline}
                  type="button"
                  onClick={() => onToggleGuideline(guideline)}
                  className={
                    preferences.reportingGuidelines.includes(guideline)
                      ? 'rounded border border-emerald-400 bg-emerald-50 px-2 py-1 text-xs text-emerald-800'
                      : 'rounded border border-border bg-background px-2 py-1 text-xs'
                  }
                >
                  {guideline}
                </button>
              ))}
            </div>
          </div>
        </CardContent>
      </Card>

      {status ? <p className="text-sm text-emerald-700">{status}</p> : null}
      {error ? <p className="text-sm text-destructive">{error}</p> : null}
      {loading ? <p className="text-xs text-muted-foreground">Working...</p> : null}
    </section>
  )
}
