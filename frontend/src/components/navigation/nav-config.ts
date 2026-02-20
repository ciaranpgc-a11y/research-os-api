export type NavItem = {
  label: string
  path: string
  badge?: string
  badgeTone?: 'neutral' | 'warning'
  dividerBefore?: boolean
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
      { label: 'Run Wizard', path: '/study-core' },
      { label: 'Quality Check', path: '/qc', badge: '3', badgeTone: 'warning' },
    ],
  },
  {
    title: 'STUDY DATA',
    items: [
      { label: 'Results', path: '/results', badge: '2', badgeTone: 'neutral' },
      { label: 'Literature', path: '/literature' },
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
      { label: 'Discussion', path: '/manuscript/discussion', badge: '1', badgeTone: 'warning' },
      { label: 'Limitations', path: '/manuscript/limitations' },
      { label: 'Conclusion', path: '/manuscript/conclusion' },
      { label: 'Figures', path: '/manuscript/figures', dividerBefore: true },
      { label: 'Tables', path: '/manuscript/tables' },
    ],
  },
  {
    title: 'GOVERNANCE',
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
