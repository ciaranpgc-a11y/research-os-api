import { useEffect, useState } from 'react'
import { Navigate, Outlet, Route, Routes, useLocation, useParams } from 'react-router-dom'

import { AccountLayout } from '@/components/layout/account-layout'
import { WorkspaceLayout } from '@/components/layout/workspace-layout'
import { clearAuthSessionToken, getAuthSessionToken, getCachedAuthRole, isAuthBypassEnabled, setCachedAuthRole } from '@/lib/auth-session'
import { fetchMe } from '@/lib/impact-api'
import { AdminPage } from '@/pages/admin-page'
import { AgentLogsPage } from '@/pages/agent-logs-page'
import { AuthCallbackPage } from '@/pages/auth-callback-page'
import { AuthPage } from '@/pages/auth-page'
import { AuditLogPage } from '@/pages/audit-log-page'
import { ClaimMapPage } from '@/pages/claim-map-page'
import { InferenceRulesPage } from '@/pages/inference-rules-page'
import { JournalTargetingPage } from '@/pages/journal-targeting-page'
import { LandingPage } from '@/pages/landing-page'
import { LiteraturePage } from '@/pages/literature-page'
import { ManuscriptPage } from '@/pages/manuscript-page'
import { ManuscriptTablesPage } from '@/pages/manuscript-tables-page'
import { OverviewPage } from '@/pages/overview-page'
import { ImpactPage } from '@/pages/impact-page'
import { ProfileIntegrationsPage } from '@/pages/profile-integrations-page'
import { ProfileManageAccountPage } from '@/pages/profile-manage-account-page'
import { ProfilePage } from '@/pages/profile-page'
import { ProfilePersonalDetailsPage } from '@/pages/profile-personal-details-page'
import { ProfileGrantsPage } from '@/pages/profile-grants-page'
import { ProfileCollaborationPage } from '@/pages/profile-collaboration-page'
import { ProfilePublicationsPage } from '@/pages/profile-publications-page'
import { QCDashboardPage } from '@/pages/qc-dashboard-page'
import { ResultsPage } from '@/pages/results-page'
import { SettingsPage } from '@/pages/settings-page'
import { StudyCorePage } from '@/pages/study-core-page'
import { VersionHistoryPage } from '@/pages/version-history-page'
import { WorkspacesPage } from '@/pages/workspaces-page'
import { WorkspaceInboxPage } from '@/pages/workspace-inbox-page'
import { WorkspaceExportsPage } from '@/pages/workspace-exports-page'
import { CmrReferenceLayout } from '@/components/layout/cmr-reference-layout'
import { CmrReferenceTablePage } from '@/pages/cmr-reference-table-page'
import { CmrReferenceDatabasePage } from '@/pages/cmr-reference-database-page'
import { CmrNewReportPage } from '@/pages/cmr-new-report-page'
import { CmrRwmaPage } from '@/pages/cmr-rwma-page'
import { CmrLgePage } from '@/pages/cmr-lge-page'
import { CmrUploadReportPage } from '@/pages/cmr-upload-report-page'
import { CmrValvesPage } from '@/pages/cmr-valves-page'
import { CmrLvThrombusPage } from '@/pages/cmr-lv-thrombus-page'
import { CmrPhPage } from '@/pages/cmr-ph-page'
import { CmrLoginPage } from '@/pages/cmr-login-page'
import { CmrAdminPage } from '@/pages/cmr-admin-page'
import {
  getCmrSessionToken,
  cmrCheckSession,
  clearCmrSession,
  isCmrSubdomain,
} from '@/lib/cmr-auth'
import { useWorkspaceStore } from '@/store/use-workspace-store'

const AUTH_ME_TIMEOUT_MS = 8000

function fetchMeWithTimeout(token: string) {
  return new Promise<Awaited<ReturnType<typeof fetchMe>>>((resolve, reject) => {
    const timer = window.setTimeout(() => {
      reject(new Error('Auth session check timed out.'))
    }, AUTH_ME_TIMEOUT_MS)

    void fetchMe(token)
      .then((user) => {
        window.clearTimeout(timer)
        resolve(user)
      })
      .catch((error) => {
        window.clearTimeout(timer)
        reject(error)
      })
  })
}

function WorkspaceRedirect({ suffix }: { suffix: string }) {
  const activeWorkspaceId = useWorkspaceStore((state) => state.activeWorkspaceId)
  const workspaceId = activeWorkspaceId || 'hf-registry'
  return <Navigate to={`/w/${workspaceId}/${suffix}`} replace />
}

function WorkspaceManuscriptIndexRedirect() {
  const params = useParams<{ workspaceId: string }>()
  const workspaceId = params.workspaceId || 'hf-registry'
  return <Navigate to={`/w/${workspaceId}/manuscript/title`} replace />
}

function LegacyManuscriptSectionRedirect() {
  const params = useParams<{ section: string }>()
  const section = params.section || 'introduction'
  return <WorkspaceRedirect suffix={`manuscript/${section}`} />
}

function LandingOrWorkspace() {
  // CMR subdomain goes to login gate
  if (isCmrSubdomain()) {
    return <Navigate to="/cmr-login" replace />
  }

  if (isAuthBypassEnabled()) {
    return <Navigate to="/profile/publications" replace />
  }

  const token = getAuthSessionToken()
  if (token) {
    return <Navigate to="/workspaces" replace />
  }
  return <LandingPage />
}

function RequireCmrSession() {
  const [status, setStatus] = useState<'checking' | 'allowed' | 'denied'>('checking')
  const location = useLocation()

  useEffect(() => {
    const token = getCmrSessionToken()
    if (!token) {
      setStatus('denied')
      return
    }
    let cancelled = false
    cmrCheckSession(token).then((user) => {
      if (cancelled) return
      if (user) {
        setStatus('allowed')
      } else {
        clearCmrSession()
        setStatus('denied')
      }
    })
    return () => { cancelled = true }
  }, [location.pathname])

  if (status === 'checking') {
    return <div className="p-6 text-sm text-muted-foreground">Checking session...</div>
  }
  if (status === 'denied') {
    return <Navigate to="/cmr-login" replace />
  }
  return <Outlet />
}

function RequireSignIn() {
  const [status, setStatus] = useState<'checking' | 'allowed' | 'signed_out'>('checking')
  const token = getAuthSessionToken()
  const location = useLocation()
  useEffect(() => {
    if (isAuthBypassEnabled()) {
      setStatus('allowed')
      return
    }
    if (!token) {
      setStatus('signed_out')
      return
    }
    let cancelled = false
    setStatus('checking')
    void fetchMeWithTimeout(token)
      .then((user) => {
        if (cancelled) {
          return
        }
        setCachedAuthRole(user.role)
        setStatus('allowed')
      })
      .catch(() => {
        if (cancelled) {
          return
        }
        clearAuthSessionToken()
        setStatus('signed_out')
      })
    return () => {
      cancelled = true
    }
  }, [token])

  if (status === 'checking') {
    return (
      <div data-ui="auth-session-checking" className="p-6 text-sm text-muted-foreground">
        Checking session...
      </div>
    )
  }
  if (status === 'signed_out') {
    return <Navigate to="/auth" replace state={{ from: location.pathname }} />
  }
  return <Outlet />
}

function RequireAdmin() {
  const location = useLocation()
  const token = getAuthSessionToken()
  const [status, setStatus] = useState<'checking' | 'allowed' | 'signed_out' | 'forbidden'>('checking')

  useEffect(() => {
    if (isAuthBypassEnabled()) {
      setStatus('allowed')
      return
    }
    if (!token) {
      setStatus('signed_out')
      return
    }
    let cancelled = false
    setStatus('checking')
    void fetchMeWithTimeout(token)
      .then((user) => {
        if (cancelled) {
          return
        }
        setCachedAuthRole(user.role)
        setStatus(user.role === 'admin' ? 'allowed' : 'forbidden')
      })
      .catch(() => {
        if (cancelled) {
          return
        }
        if (getCachedAuthRole() === 'admin') {
          setStatus('allowed')
          return
        }
        setStatus('signed_out')
      })
    return () => {
      cancelled = true
    }
  }, [token])

  if (status === 'checking') {
    return (
      <div data-ui="admin-access-checking" className="p-6 text-sm text-muted-foreground">
        Checking admin access...
      </div>
    )
  }
  if (status === 'signed_out') {
    return <Navigate to="/" replace state={{ from: location.pathname }} />
  }
  if (status === 'forbidden') {
    return <Navigate to="/workspaces" replace />
  }
  return <Outlet />
}

export function AppRouter() {
  return (
    <Routes>
      <Route path="/" element={<LandingOrWorkspace />} />
      <Route path="/auth" element={<AuthPage />} />
      <Route path="/auth/callback" element={<AuthCallbackPage />} />
      {/* CMR auth routes */}
      <Route path="/cmr-login" element={<CmrLoginPage />} />
      <Route path="/cmr-admin-login" element={<CmrAdminPage standalone />} />

      {isCmrSubdomain() ? (
        <Route element={<RequireCmrSession />}>
          <Route element={<CmrReferenceLayout />}>
            <Route path="/cmr-admin" element={<CmrAdminPage />} />
            <Route path="/cmr-reference-table" element={<CmrReferenceTablePage />} />
            <Route path="/cmr-reference-database" element={<CmrReferenceDatabasePage />} />
            <Route path="/cmr-upload-report" element={<CmrUploadReportPage />} />
            <Route path="/cmr-new-report" element={<CmrNewReportPage />} />
            <Route path="/cmr-rwma" element={<CmrRwmaPage />} />
            <Route path="/cmr-lge" element={<CmrLgePage />} />
            <Route path="/cmr-valves" element={<CmrValvesPage />} />
            <Route path="/cmr-lv-thrombus" element={<CmrLvThrombusPage />} />
            <Route path="/cmr-ph" element={<CmrPhPage />} />
          </Route>
        </Route>
      ) : (
        <Route element={<CmrReferenceLayout />}>
          <Route path="/cmr-admin" element={<CmrAdminPage />} />
          <Route path="/cmr-reference-table" element={<CmrReferenceTablePage />} />
          <Route path="/cmr-reference-database" element={<CmrReferenceDatabasePage />} />
          <Route path="/cmr-upload-report" element={<CmrUploadReportPage />} />
          <Route path="/cmr-new-report" element={<CmrNewReportPage />} />
          <Route path="/cmr-rwma" element={<CmrRwmaPage />} />
          <Route path="/cmr-lge" element={<CmrLgePage />} />
          <Route path="/cmr-valves" element={<CmrValvesPage />} />
          <Route path="/cmr-lv-thrombus" element={<CmrLvThrombusPage />} />
          <Route path="/cmr-ph" element={<CmrPhPage />} />
        </Route>
      )}

      <Route element={<RequireSignIn />}>
        <Route path="/workspaces" element={<WorkspacesPage />} />

        <Route element={<RequireAdmin />}>
          <Route path="/admin" element={<Navigate to="/admin/overview" replace />} />
          <Route path="/admin/:sectionId" element={<AdminPage />} />
        </Route>

        <Route element={<AccountLayout />}>
          <Route path="/profile" element={<ProfilePage />} />
          <Route path="/profile/publications" element={<ProfilePublicationsPage />} />
          <Route path="/profile/grants" element={<ProfileGrantsPage />} />
          <Route path="/profile/personal-details" element={<ProfilePersonalDetailsPage />} />
          <Route path="/profile/integrations" element={<ProfileIntegrationsPage />} />
          <Route path="/profile/manage-account" element={<ProfileManageAccountPage />} />
          <Route path="/account/collaboration" element={<ProfileCollaborationPage />} />
          <Route path="/impact" element={<ImpactPage />} />
          <Route path="/settings" element={<SettingsPage />} />
        </Route>

        <Route path="/w/:workspaceId" element={<WorkspaceLayout />}>
          <Route index element={<Navigate to="overview" replace />} />
          <Route path="overview" element={<OverviewPage />} />
          <Route path="run-wizard" element={<StudyCorePage />} />
          <Route path="data" element={<ResultsPage />} />
          <Route path="results" element={<ResultsPage />} />
          <Route path="manuscript" element={<WorkspaceManuscriptIndexRedirect />} />
          <Route path="manuscript/tables" element={<ManuscriptTablesPage />} />
          <Route path="manuscript/:section" element={<ManuscriptPage />} />
          <Route path="literature" element={<LiteraturePage />} />
          <Route path="journal-targeting" element={<JournalTargetingPage />} />
          <Route path="qc" element={<QCDashboardPage />} />
          <Route path="exports" element={<WorkspaceExportsPage />} />
          <Route path="claim-map" element={<ClaimMapPage />} />
          <Route path="versions" element={<VersionHistoryPage />} />
          <Route path="audit" element={<AuditLogPage />} />
          <Route path="inference-rules" element={<InferenceRulesPage />} />
          <Route path="agent-logs" element={<AgentLogsPage />} />
        </Route>

        <Route path="/w/:workspaceId/inbox" element={<WorkspaceInboxPage />} />

        <Route path="/overview" element={<WorkspaceRedirect suffix="overview" />} />
        <Route path="/inbox" element={<WorkspaceRedirect suffix="inbox" />} />
        <Route path="/study-core" element={<WorkspaceRedirect suffix="run-wizard" />} />
        <Route path="/results" element={<WorkspaceRedirect suffix="results" />} />
        <Route path="/manuscript" element={<WorkspaceRedirect suffix="manuscript/title" />} />
        <Route path="/manuscript/tables" element={<WorkspaceRedirect suffix="manuscript/tables" />} />
        <Route path="/manuscript/:section" element={<LegacyManuscriptSectionRedirect />} />
        <Route path="/literature" element={<WorkspaceRedirect suffix="literature" />} />
        <Route path="/journal-targeting" element={<WorkspaceRedirect suffix="journal-targeting" />} />
        <Route path="/qc" element={<WorkspaceRedirect suffix="qc" />} />
        <Route path="/claim-map" element={<WorkspaceRedirect suffix="claim-map" />} />
        <Route path="/versions" element={<WorkspaceRedirect suffix="versions" />} />
        <Route path="/audit" element={<WorkspaceRedirect suffix="audit" />} />
        <Route path="/inference-rules" element={<WorkspaceRedirect suffix="inference-rules" />} />
        <Route path="/agent-logs" element={<WorkspaceRedirect suffix="agent-logs" />} />
      </Route>

      <Route path="*" element={<Navigate to={isCmrSubdomain() ? '/cmr-login' : '/'} replace />} />
    </Routes>
  )
}
