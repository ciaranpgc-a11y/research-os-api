export type MockUser = { id: string; name: string; email: string; role: 'owner' | 'editor' | 'reviewer' | 'viewer' }
export type MockWorkspace = { id: string; name: string; version: string; health: 'green' | 'amber' | 'red' }
export type MockInvitation = { id: string; name: string; role: string; status: 'pending' | 'accepted' | 'declined' }
export type MockLog = { id: string; actor: string; action: string; at: string }

export const mockUsers: MockUser[] = [
  { id: 'u-01', name: 'Ciaran Clarke', email: 'ciaran@example.com', role: 'owner' },
  { id: 'u-02', name: 'Maya Singh', email: 'maya@example.com', role: 'editor' },
  { id: 'u-03', name: 'A. Patel', email: 'apatel@example.com', role: 'reviewer' },
  { id: 'u-04', name: 'L. Santos', email: 'lsantos@example.com', role: 'viewer' },
]

export const mockWorkspaces: MockWorkspace[] = [
  { id: 'ws-01', name: 'HF Registry Manuscript', version: '1.2', health: 'amber' },
  { id: 'ws-02', name: 'Cardio-Oncology Outcomes', version: '0.9', health: 'green' },
  { id: 'ws-03', name: 'Device Safety Review', version: '0.4', health: 'red' },
]

export const mockInvitations: MockInvitation[] = [
  { id: 'inv-01', name: 'R. Khan', role: 'Reviewer', status: 'pending' },
  { id: 'inv-02', name: 'J. Meyer', role: 'Editor', status: 'accepted' },
  { id: 'inv-03', name: 'N. Brooks', role: 'Viewer', status: 'declined' },
]

export const mockLogs: MockLog[] = [
  { id: 'log-01', actor: 'Ciaran Clarke', action: 'Changed role for Maya Singh to Editor', at: '2026-02-20 09:10' },
  { id: 'log-02', actor: 'Maya Singh', action: 'Uploaded file trial_extract.csv', at: '2026-02-20 09:35' },
  { id: 'log-03', actor: 'A. Patel', action: 'Requested workspace access', at: '2026-02-20 11:05' },
]

export const mockBarChartSameCount = [
  { label: '2022', value: 32 },
  { label: '2023', value: 45 },
  { label: '2024', value: 52 },
  { label: '2025', value: 49 },
]

export const mockBarChartDifferentCount = [
  { label: 'Q1', value: 12 },
  { label: 'Q2', value: 18 },
  { label: 'Q3', value: 16 },
  { label: 'Q4', value: 21 },
  { label: 'Q5', value: 13 },
  { label: 'Q6', value: 17 },
]

export const mockRingChart = { value: 74, min: 0, max: 100, label: 'Progress to next threshold' }

export const mockLineChart = [
  { x: 'Jan', y: 12 },
  { x: 'Feb', y: 15 },
  { x: 'Mar', y: 14 },
  { x: 'Apr', y: 18 },
  { x: 'May', y: 21 },
  { x: 'Jun', y: 19 },
]

export const mockTableRows = [
  { id: 'r1', name: 'Longitudinal Echo Markers', owner: 'Ciaran Clarke', status: 'Unread' },
  { id: 'r2', name: 'AI MRI Tissue Tracking', owner: 'Maya Singh', status: 'Read' },
  { id: 'r3', name: 'Registry Outcomes', owner: 'A. Patel', status: 'Action required' },
]

export const mockPublicationRows = [
  { id: 'p1', title: 'Longitudinal Echo Markers', year: 2023, citations: 146 },
  { id: 'p2', title: 'AI MRI Tissue Tracking', year: 2024, citations: 98 },
  { id: 'p3', title: 'Registry Outcomes', year: 2025, citations: 57 },
]
