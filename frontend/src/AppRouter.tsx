import { Navigate, Outlet, Route, Routes, useLocation, useParams } from 'react-router-dom'

import { AccountLayout } from '@/components/layout/account-layout'
import { WorkspaceLayout } from '@/components/layout/workspace-layout'
import { getAuthSessionToken, isAuthBypassEnabled } from '@/lib/auth-session'
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
import { OrcidCallbackPage } from '@/pages/orcid-callback-page'
import { OverviewPage } from '@/pages/overview-page'
import { ImpactPage } from '@/pages/impact-page'
import { ProfileIntegrationsPage } from '@/pages/profile-integrations-page'
import { ProfileManageAccountPage } from '@/pages/profile-manage-account-page'
import { ProfilePage } from '@/pages/profile-page'
import { ProfilePersonalDetailsPage } from '@/pages/profile-personal-details-page'
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
import { useWorkspaceStore } from '@/store/use-workspace-store'

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
  if (isAuthBypassEnabled()) {
    return <Navigate to="/profile/publications" replace />
  }

  const token = getAuthSessionToken()
  if (token) {
    return <Navigate to="/workspaces" replace />
  }
  return <LandingPage />
}

function RequireSignIn() {
  const token = getAuthSessionToken()
  const location = useLocation()
  if (!token) {
    return <Navigate to="/" replace state={{ from: location.pathname }} />
  }
  return <Outlet />
}

export function AppRouter() {
  return (
    <Routes>
      <Route path="/" element={<LandingOrWorkspace />} />
      <Route path="/auth" element={<AuthPage />} />
      <Route path="/auth/callback" element={<AuthCallbackPage />} />
      <Route path="/orcid/callback" element={<OrcidCallbackPage />} />

      <Route element={<RequireSignIn />}>
        <Route path="/workspaces" element={<WorkspacesPage />} />

        <Route element={<AccountLayout />}>
          <Route path="/profile" element={<ProfilePage />} />
          <Route path="/profile/publications" element={<ProfilePublicationsPage />} />
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

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}
