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
import { ProfileCollectionsPage } from '@/pages/profile-collections-page'
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
import { CmrPerfusionPage } from '@/pages/cmr-perfusion-page'
import { CmrUploadReportPage } from '@/pages/cmr-upload-report-page'
import { CmrValvesPage } from '@/pages/cmr-valves-page'
import { CmrLvThrombusPage } from '@/pages/cmr-lv-thrombus-page'
import { CmrPhPage } from '@/pages/cmr-ph-page'
import { CmrLoginPage } from '@/pages/cmr-login-page'
import { CmrAdminPage } from '@/pages/cmr-admin-page'
import { CmrReportsPage } from '@/pages/cmr-reports-page'
import { CmrReportOutputPage } from '@/pages/cmr-report-output-page'
import {
  getCmrSessionToken,
  cmrCheckSession,
  clearCmrSession,
  isCmrSubdomain,
  setCmrSession,
} from '@/lib/cmr-auth'
import {
  getExtractSessionToken,
  extractCheckSession,
  clearExtractSession,
  isExtractSubdomain,
  setExtractSession,
} from '@/lib/extract-auth'
import { ExtractAdminPage } from '@/pages/extract-admin-page'
import { ExtractCohortPage } from '@/pages/extract-cohort-page'
import { ExtractLoginPage } from '@/pages/extract-login-page'
import ExtractPatientDetailPage from '@/pages/extract-patient-detail-page'
import ExtractPatientOverview from '@/pages/extract-patient-overview'
import ExtractPatientRhc from '@/pages/extract-patient-rhc'
import ExtractPatientEcho from '@/pages/extract-patient-echo'
import ExtractPatientCmr from '@/pages/extract-patient-cmr'
import ExtractPatientCpex from '@/pages/extract-patient-cpex'
import ExtractPatientClinicalData from '@/pages/extract-patient-clinical-data'
import ExtractPatientQuestionnaire from '@/pages/extract-patient-questionnaire'
import ExtractPatientRecruitment from '@/pages/extract-patient-recruitment'
import { ExtractExtractionPage } from '@/pages/extract-extraction-page'
import { ExtractReferenceRhcPage } from '@/pages/extract-reference-rhc-page'
import { ExtractReferenceEchoPage } from '@/pages/extract-reference-echo-page'
import { ExtractLayout } from '@/components/layout/extract-layout'
import { buildCmrCasePath, resolveCmrCaseSection, type CmrCaseSection } from '@/lib/cmr-case-routes'
import { useCmrCaseStore } from '@/store/use-cmr-case-store'
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

  // Extract subdomain goes to login gate (or cohort if authenticated)
  if (isExtractSubdomain()) {
    const extractToken = getExtractSessionToken()
    if (extractToken) {
      return <Navigate to="/extract-cohort" replace />
    }
    return <Navigate to="/extract-login" replace />
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
  const syncSessionScope = useCmrCaseStore((state) => state.syncSessionScope)

  useEffect(() => {
    const token = getCmrSessionToken()
    if (!token) {
      syncSessionScope(null)
      setStatus('denied')
      return
    }
    let cancelled = false
    cmrCheckSession(token).then((user) => {
      if (cancelled) return
      if (user) {
        setCmrSession(token, user.name, user.is_admin, user.access_code_id)
        syncSessionScope(`cmr-access:${user.access_code_id}`)
        setStatus('allowed')
      } else {
        clearCmrSession()
        syncSessionScope(null)
        setStatus('denied')
      }
    })
    return () => { cancelled = true }
  }, [location.pathname, syncSessionScope])

  if (status === 'checking') {
    return <div className="p-6 text-sm text-muted-foreground">Checking session...</div>
  }
  if (status === 'denied') {
    return <Navigate to="/cmr-login" replace />
  }
  return <Outlet />
}

function RequireExtractSession() {
  const [status, setStatus] = useState<'checking' | 'allowed' | 'denied'>('checking')
  const location = useLocation()

  useEffect(() => {
    const token = getExtractSessionToken()
    if (!token) {
      setStatus('denied')
      return
    }
    let cancelled = false
    extractCheckSession(token).then((user) => {
      if (cancelled) return
      if (user) {
        setExtractSession(token, user.name, user.is_admin, user.access_code_id)
        setStatus('allowed')
      } else {
        clearExtractSession()
        setStatus('denied')
      }
    })
    return () => { cancelled = true }
  }, [location.pathname])

  if (status === 'checking') {
    return <div className="p-6 text-sm text-muted-foreground">Checking session...</div>
  }
  if (status === 'denied') {
    return <Navigate to="/extract-login" replace />
  }
  return <Outlet />
}

function LegacyCmrReportRedirect({ section }: { section: CmrCaseSection }) {
  const activeCaseId = useCmrCaseStore((state) => state.activeCaseId)
  if (!activeCaseId) {
    return <Navigate to="/cmr-reports" replace />
  }
  return <Navigate to={buildCmrCasePath(activeCaseId, section)} replace />
}

function RequireCmrCase() {
  const params = useParams<{ caseId: string }>()
  const location = useLocation()
  const caseId = params.caseId || ''
  const activeCase = useCmrCaseStore((state) => state.activeCase)
  const loadingCaseId = useCmrCaseStore((state) => state.loadingCaseId)
  const caseError = useCmrCaseStore((state) => state.caseError)
  const loadCase = useCmrCaseStore((state) => state.loadCase)
  const patchActiveCaseMeta = useCmrCaseStore((state) => state.patchActiveCaseMeta)

  useEffect(() => {
    if (!caseId) return
    void loadCase(caseId)
  }, [caseId, loadCase])

  useEffect(() => {
    if (!activeCase || activeCase.id !== caseId) return
    const section = resolveCmrCaseSection(location.pathname)
    if (!section || activeCase.last_completed_step === section) return
    patchActiveCaseMeta({ last_completed_step: section })
  }, [activeCase, caseId, location.pathname, patchActiveCaseMeta])

  if (!caseId) {
    return <Navigate to="/cmr-reports" replace />
  }
  if (caseError && loadingCaseId === null && (!activeCase || activeCase.id !== caseId)) {
    return <Navigate to="/cmr-reports" replace />
  }
  if (loadingCaseId === caseId || !activeCase || activeCase.id !== caseId) {
    return <div className="p-6 text-sm text-muted-foreground">Loading report...</div>
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
            <Route path="/cmr-reports" element={<CmrReportsPage />} />
            <Route path="/cmr-reference-table" element={<CmrReferenceTablePage />} />
            <Route path="/cmr-reference-database" element={<CmrReferenceDatabasePage />} />
            <Route path="/cmr-upload-report" element={<LegacyCmrReportRedirect section="upload" />} />
            <Route path="/cmr-new-report" element={<LegacyCmrReportRedirect section="report" />} />
            <Route path="/cmr-rwma" element={<LegacyCmrReportRedirect section="rwma" />} />
            <Route path="/cmr-lge" element={<LegacyCmrReportRedirect section="lge" />} />
            <Route path="/cmr-perfusion" element={<LegacyCmrReportRedirect section="perfusion" />} />
            <Route path="/cmr-valves" element={<LegacyCmrReportRedirect section="valves" />} />
            <Route path="/cmr-lv-thrombus" element={<LegacyCmrReportRedirect section="lv-thrombus" />} />
            <Route path="/cmr-ph" element={<LegacyCmrReportRedirect section="ph" />} />
            <Route path="/cmr/cases/:caseId" element={<RequireCmrCase />}>
              <Route path="upload" element={<CmrUploadReportPage />} />
              <Route path="report" element={<CmrNewReportPage />} />
              <Route path="rwma" element={<CmrRwmaPage />} />
              <Route path="lge" element={<CmrLgePage />} />
              <Route path="perfusion" element={<CmrPerfusionPage />} />
              <Route path="valves" element={<CmrValvesPage />} />
              <Route path="lv-thrombus" element={<CmrLvThrombusPage />} />
              <Route path="ph" element={<CmrPhPage />} />
              <Route path="output" element={<CmrReportOutputPage />} />
            </Route>
          </Route>
        </Route>
      ) : (
        <Route element={<CmrReferenceLayout />}>
          <Route path="/cmr-admin" element={<CmrAdminPage />} />
          <Route path="/cmr-reports" element={<CmrReportsPage />} />
          <Route path="/cmr-reference-table" element={<CmrReferenceTablePage />} />
          <Route path="/cmr-reference-database" element={<CmrReferenceDatabasePage />} />
          <Route path="/cmr-upload-report" element={<LegacyCmrReportRedirect section="upload" />} />
          <Route path="/cmr-new-report" element={<LegacyCmrReportRedirect section="report" />} />
          <Route path="/cmr-rwma" element={<LegacyCmrReportRedirect section="rwma" />} />
          <Route path="/cmr-lge" element={<LegacyCmrReportRedirect section="lge" />} />
          <Route path="/cmr-perfusion" element={<LegacyCmrReportRedirect section="perfusion" />} />
          <Route path="/cmr-valves" element={<LegacyCmrReportRedirect section="valves" />} />
          <Route path="/cmr-lv-thrombus" element={<LegacyCmrReportRedirect section="lv-thrombus" />} />
          <Route path="/cmr-ph" element={<LegacyCmrReportRedirect section="ph" />} />
          <Route path="/cmr/cases/:caseId" element={<RequireCmrCase />}>
            <Route path="upload" element={<CmrUploadReportPage />} />
            <Route path="report" element={<CmrNewReportPage />} />
            <Route path="rwma" element={<CmrRwmaPage />} />
            <Route path="lge" element={<CmrLgePage />} />
            <Route path="perfusion" element={<CmrPerfusionPage />} />
            <Route path="valves" element={<CmrValvesPage />} />
            <Route path="lv-thrombus" element={<CmrLvThrombusPage />} />
            <Route path="ph" element={<CmrPhPage />} />
            <Route path="output" element={<CmrReportOutputPage />} />
          </Route>
        </Route>
      )}

      {/* Extract auth routes */}
      <Route path="/extract-login" element={<ExtractLoginPage />} />

      {/* Extract protected routes */}
      <Route element={<RequireExtractSession />}>
        <Route element={<ExtractLayout />}>
          <Route path="/extract-admin" element={<ExtractAdminPage />} />
          <Route path="/extract-cohort" element={<ExtractCohortPage />} />
          <Route path="/extract-new" element={<ExtractExtractionPage />} />
          <Route path="/extract-patient/:hn" element={<ExtractPatientDetailPage />}>
            <Route index element={<ExtractPatientOverview />} />
            <Route path="clinical-data" element={<ExtractPatientClinicalData />} />
            <Route path="rhc" element={<ExtractPatientRhc />} />
            <Route path="echo" element={<ExtractPatientEcho />} />
            <Route path="cmr" element={<ExtractPatientCmr />} />
            <Route path="cpex" element={<ExtractPatientCpex />} />
            <Route path="questionnaire" element={<ExtractPatientQuestionnaire />} />
            <Route path="recruitment" element={<ExtractPatientRecruitment />} />
          </Route>
          <Route path="/extract-reference-rhc" element={<ExtractReferenceRhcPage />} />
          <Route path="/extract-reference-echo" element={<ExtractReferenceEchoPage />} />
        </Route>
      </Route>

      <Route element={<RequireSignIn />}>
        <Route path="/workspaces" element={<WorkspacesPage />} />

        <Route element={<RequireAdmin />}>
          <Route path="/admin" element={<Navigate to="/admin/overview" replace />} />
          <Route path="/admin/:sectionId" element={<AdminPage />} />
        </Route>

        <Route element={<AccountLayout />}>
          <Route path="/profile" element={<ProfilePage />} />
          <Route path="/profile/publications" element={<ProfilePublicationsPage />} />
          <Route path="/profile/collections" element={<ProfileCollectionsPage />} />
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

      <Route path="*" element={<Navigate to={isCmrSubdomain() ? '/cmr-login' : isExtractSubdomain() ? '/extract-login' : '/'} replace />} />
    </Routes>
  )
}
