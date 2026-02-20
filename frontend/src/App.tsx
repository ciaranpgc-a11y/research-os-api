import { useEffect } from 'react'
import { Navigate, Route, Routes } from 'react-router-dom'

import { AppShell } from '@/components/layout/app-shell'
import { AgentLogsPage } from '@/pages/agent-logs-page'
import { AuditLogPage } from '@/pages/audit-log-page'
import { ClaimMapPage } from '@/pages/claim-map-page'
import { InferenceRulesPage } from '@/pages/inference-rules-page'
import { JournalTargetingPage } from '@/pages/journal-targeting-page'
import { LiteraturePage } from '@/pages/literature-page'
import { ManuscriptPage } from '@/pages/manuscript-page'
import { ManuscriptTablesPage } from '@/pages/manuscript-tables-page'
import { OverviewPage } from '@/pages/overview-page'
import { QCDashboardPage } from '@/pages/qc-dashboard-page'
import { ResultsPage } from '@/pages/results-page'
import { StudyCorePage } from '@/pages/study-core-page'
import { VersionHistoryPage } from '@/pages/version-history-page'
import { useAaweStore } from '@/store/use-aawe-store'

function App() {
  const clearSelection = useAaweStore((state) => state.clearSelection)
  const theme = useAaweStore((state) => state.theme)

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        clearSelection()
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => {
      window.removeEventListener('keydown', onKeyDown)
    }
  }, [clearSelection])

  useEffect(() => {
    const root = document.documentElement
    root.classList.toggle('dark', theme === 'dark')
    window.localStorage.setItem('aawe-theme', theme)
  }, [theme])

  return (
    <Routes>
      <Route element={<AppShell />}>
        <Route index element={<Navigate to="/overview" replace />} />
        <Route path="/overview" element={<OverviewPage />} />
        <Route path="/study-core" element={<StudyCorePage />} />
        <Route path="/results" element={<ResultsPage />} />
        <Route path="/manuscript" element={<Navigate to="/manuscript/introduction" replace />} />
        <Route path="/manuscript/tables" element={<ManuscriptTablesPage />} />
        <Route path="/manuscript/:section" element={<ManuscriptPage />} />
        <Route path="/literature" element={<LiteraturePage />} />
        <Route path="/journal-targeting" element={<JournalTargetingPage />} />
        <Route path="/qc" element={<QCDashboardPage />} />
        <Route path="/claim-map" element={<ClaimMapPage />} />
        <Route path="/versions" element={<VersionHistoryPage />} />
        <Route path="/audit" element={<AuditLogPage />} />
        <Route path="/inference-rules" element={<InferenceRulesPage />} />
        <Route path="/agent-logs" element={<AgentLogsPage />} />
      </Route>
      <Route path="*" element={<Navigate to="/overview" replace />} />
    </Routes>
  )
}

export default App
