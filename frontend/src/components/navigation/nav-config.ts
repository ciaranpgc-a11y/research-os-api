export type NavItem = {
  label: string
  path: string
  badge?: string
}

export type NavGroup = {
  title: string
  items: NavItem[]
}

export const NAV_GROUPS: NavGroup[] = [
  {
    title: 'WORKSPACE',
    items: [
      { label: 'Overview', path: '/overview' },
      { label: 'Study Core', path: '/study-core' },
      { label: 'QC Dashboard', path: '/qc', badge: '3' },
    ],
  },
  {
    title: 'STUDY DATA',
    items: [
      { label: 'Results', path: '/results', badge: '2' },
      { label: 'Literature', path: '/literature' },
      { label: 'Figures', path: '/manuscript/figures' },
      { label: 'Tables', path: '/manuscript/tables' },
    ],
  },
  {
    title: 'MANUSCRIPT',
    items: [
      { label: 'Title', path: '/manuscript/title' },
      { label: 'Abstract', path: '/manuscript/abstract' },
      { label: 'Introduction', path: '/manuscript/introduction' },
      { label: 'Methods', path: '/manuscript/methods' },
      { label: 'Results', path: '/manuscript/results' },
      { label: 'Discussion', path: '/manuscript/discussion', badge: '1' },
      { label: 'Limitations', path: '/manuscript/limitations' },
      { label: 'Conclusion', path: '/manuscript/conclusion' },
    ],
  },
  {
    title: 'REVIEW & SYSTEM',
    items: [
      { label: 'Journal Targeting', path: '/journal-targeting' },
      { label: 'Claim Map', path: '/claim-map' },
      { label: 'Version History', path: '/versions' },
      { label: 'Audit Log', path: '/audit' },
      { label: 'Inference Rules', path: '/inference-rules' },
      { label: 'Agent Logs', path: '/agent-logs' },
    ],
  },
]

