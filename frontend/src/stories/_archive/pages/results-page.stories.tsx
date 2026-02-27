import { useEffect, useState } from 'react'
import type { Meta, StoryObj } from '@storybook/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'

import { ResultsPage } from '@/pages/results-page'
import { useDataWorkspaceStore } from '@/store/use-data-workspace-store'
import type { ManuscriptTable, DataAsset, WorkingTable } from '@/types/data-workspace'
import { useWorkspaceStore, type WorkspaceRecord } from '@/store/use-workspace-store'

const AUTH_TOKEN_STORAGE_KEY = 'aawe-impact-session-token'
const WORKSPACES_STORAGE_KEY = 'aawe-workspaces'
const ACTIVE_WORKSPACE_STORAGE_KEY = 'aawe-active-workspace-id'
const AUTHOR_REQUESTS_STORAGE_KEY = 'aawe-workspace-author-requests'
const INVITATIONS_SENT_STORAGE_KEY = 'aawe-workspace-invitations-sent'
const DATA_WORKSPACE_STORAGE_KEY = 'aawe-data-workspace-v1'

type ResultsPageFixture = {
  workspaceId: string
  workspaces: WorkspaceRecord[]
  dataAssets: DataAsset[]
  workingTables: WorkingTable[]
  manuscriptTables: ManuscriptTable[]
}

type ResultsPagePreviewProps = {
  fixture: ResultsPageFixture
}

function createWorkspace(overrides?: Partial<WorkspaceRecord>): WorkspaceRecord {
  return {
    id: '4d-flow-rhc-paper',
    name: '4D flow RHC paper',
    ownerName: 'Ciaran Clarke',
    collaborators: ['J. Meyer', 'S. Wong', 'N. Brooks'],
    removedCollaborators: [],
    pendingCollaborators: [],
    collaboratorRoles: {},
    pendingCollaboratorRoles: {},
    version: '1.1',
    health: 'amber',
    updatedAt: '2026-02-25T19:20:00Z',
    pinned: true,
    archived: false,
    ...overrides,
  }
}

const populatedFixture: ResultsPageFixture = {
  workspaceId: '4d-flow-rhc-paper',
  workspaces: [
    createWorkspace(),
    createWorkspace({
      id: 'af-screening-cohort',
      name: 'AF Screening Cohort',
      collaborators: ['S. Roy', 'L. Santos'],
      health: 'green',
      updatedAt: '2026-02-24T10:10:00Z',
      pinned: false,
    }),
  ],
  dataAssets: [
    {
      id: 'asset-4d-primary',
      name: '4d_flow_primary_dataset.xlsx',
      kind: 'xlsx',
      uploadedAt: '2026-02-25T10:05:00Z',
      sheets: [
        {
          name: 'Primary cohort',
          columns: ['Patient ID', 'Age', 'RHC Baseline', '4D Flow Index', 'Outcome'],
          rows: [
            { 'Patient ID': 'P001', Age: '62', 'RHC Baseline': '18', '4D Flow Index': '2.1', Outcome: 'Event' },
            { 'Patient ID': 'P002', Age: '58', 'RHC Baseline': '15', '4D Flow Index': '1.8', Outcome: 'No event' },
            { 'Patient ID': 'P003', Age: '67', 'RHC Baseline': '21', '4D Flow Index': '', Outcome: 'Event' },
            { 'Patient ID': 'P004', Age: '54', 'RHC Baseline': '13', '4D Flow Index': '1.4', Outcome: 'No event' },
            { 'Patient ID': 'P004', Age: '54', 'RHC Baseline': '13', '4D Flow Index': '1.4', Outcome: 'No event' },
            { 'Patient ID': 'P005', Age: '61', 'RHC Baseline': '20', '4D Flow Index': '2.3', Outcome: 'Event' },
          ],
        },
        {
          name: 'Sensitivity',
          columns: ['Subset', 'HR', 'CI Low', 'CI High', 'p'],
          rows: [
            { Subset: 'Full cohort', HR: '1.42', 'CI Low': '1.11', 'CI High': '1.81', p: '0.005' },
            { Subset: 'Excluding AF', HR: '1.35', 'CI Low': '1.02', 'CI High': '1.74', p: '0.032' },
            { Subset: 'Complete cases', HR: '1.50', 'CI Low': '1.16', 'CI High': '1.95', p: '0.002' },
          ],
        },
      ],
    },
    {
      id: 'asset-4d-dictionary',
      name: '4d_flow_dictionary.csv',
      kind: 'csv',
      uploadedAt: '2026-02-25T10:12:00Z',
      sheets: [
        {
          name: 'Sheet1',
          columns: ['Variable', 'Type', 'Description'],
          rows: [
            { Variable: 'Patient ID', Type: 'text', Description: 'Unique participant identifier' },
            { Variable: 'RHC Baseline', Type: 'integer', Description: 'Baseline RHC pressure value' },
            { Variable: '4D Flow Index', Type: 'number', Description: 'Derived flow biomarker index' },
          ],
        },
      ],
    },
  ],
  workingTables: [
    {
      id: 'worktable-primary',
      name: '4D Flow Primary Cohort',
      columns: ['Patient ID', 'Age', 'RHC Baseline', '4D Flow Index', 'Outcome'],
      rows: [
        { 'Patient ID': 'P001', Age: '62', 'RHC Baseline': '18', '4D Flow Index': '2.1', Outcome: 'Event' },
        { 'Patient ID': 'P002', Age: '58', 'RHC Baseline': '15', '4D Flow Index': '1.8', Outcome: 'No event' },
        { 'Patient ID': 'P003', Age: '67', 'RHC Baseline': '21', '4D Flow Index': '', Outcome: 'Event' },
        { 'Patient ID': 'P004', Age: '54', 'RHC Baseline': '13', '4D Flow Index': '1.4', Outcome: 'No event' },
        { 'Patient ID': 'P004', Age: '54', 'RHC Baseline': '13', '4D Flow Index': '1.4', Outcome: 'No event' },
      ],
      metadata: {
        tableType: 'Imported worksheet',
        description: 'Primary analysis-ready cohort table',
        provenance: '4d_flow_primary_dataset.xlsx / Primary cohort',
        conventions: 'Event coded as Event/No event',
        lastEditedAt: '2026-02-25T11:00:00Z',
      },
      columnMeta: {
        'Patient ID': { dataType: 'text' },
        Age: { dataType: 'integer', unit: 'years' },
        'RHC Baseline': { dataType: 'integer', unit: 'mmHg' },
        '4D Flow Index': { dataType: 'number', unit: 'a.u.' },
        Outcome: { dataType: 'text' },
      },
      footnotes: ['Missing 4D Flow Index values are flagged for review.'],
      abbreviations: [
        { short: 'RHC', long: 'Right heart catheterization' },
      ],
    },
    {
      id: 'worktable-sensitivity',
      name: 'Sensitivity Models',
      columns: ['Subset', 'HR', 'CI Low', 'CI High', 'p'],
      rows: [
        { Subset: 'Full cohort', HR: '1.42', 'CI Low': '1.11', 'CI High': '1.81', p: '0.005' },
        { Subset: 'Excluding AF', HR: '1.35', 'CI Low': '1.02', 'CI High': '1.74', p: '0.032' },
        { Subset: 'Complete cases', HR: '1.50', 'CI Low': '1.16', 'CI High': '1.95', p: '0.002' },
      ],
      metadata: {
        tableType: 'Model output',
        description: 'Sensitivity model estimates',
        provenance: '4d_flow_primary_dataset.xlsx / Sensitivity',
        conventions: 'Hazard ratios with 95% CI',
        lastEditedAt: '2026-02-25T11:05:00Z',
      },
      columnMeta: {
        Subset: { dataType: 'text' },
        HR: { dataType: 'number' },
        'CI Low': { dataType: 'number' },
        'CI High': { dataType: 'number' },
        p: { dataType: 'number' },
      },
      footnotes: [],
      abbreviations: [],
    },
  ],
  manuscriptTables: [
    {
      id: 'mtable-1',
      title: 'Table 1',
      caption: 'Baseline cohort characteristics',
      footnote: 'Values are median (IQR) unless stated.',
      columns: ['Variable', 'Overall', 'Event', 'No event'],
      rows: [
        ['Age', '61 (55-68)', '64 (58-70)', '58 (52-66)'],
        ['RHC Baseline', '17 (14-21)', '19 (16-23)', '15 (13-18)'],
      ],
    },
  ],
}

const emptyFixture: ResultsPageFixture = {
  workspaceId: 'new-data-workspace',
  workspaces: [
    createWorkspace({
      id: 'new-data-workspace',
      name: 'New Data Workspace',
      collaborators: [],
      updatedAt: '2026-02-25T09:00:00Z',
      pinned: false,
    }),
  ],
  dataAssets: [],
  workingTables: [],
  manuscriptTables: [],
}

function ResultsPagePreview({ fixture }: ResultsPagePreviewProps) {
  const [ready, setReady] = useState(false)

  useEffect(() => {
    let cancelled = false
    setReady(false)

    const previousSessionToken = window.sessionStorage.getItem(AUTH_TOKEN_STORAGE_KEY)
    const previousLocalToken = window.localStorage.getItem(AUTH_TOKEN_STORAGE_KEY)
    const previousWorkspaces = window.localStorage.getItem(WORKSPACES_STORAGE_KEY)
    const previousActiveWorkspaceId = window.localStorage.getItem(ACTIVE_WORKSPACE_STORAGE_KEY)
    const previousAuthorRequests = window.localStorage.getItem(AUTHOR_REQUESTS_STORAGE_KEY)
    const previousInvitationsSent = window.localStorage.getItem(INVITATIONS_SENT_STORAGE_KEY)
    const previousDataWorkspace = window.localStorage.getItem(DATA_WORKSPACE_STORAGE_KEY)
    const previousWorkspaceState = useWorkspaceStore.getState()
    const previousDataWorkspaceState = useDataWorkspaceStore.getState()

    const bootstrap = () => {
      window.sessionStorage.removeItem(AUTH_TOKEN_STORAGE_KEY)
      window.localStorage.removeItem(AUTH_TOKEN_STORAGE_KEY)
      window.localStorage.setItem(WORKSPACES_STORAGE_KEY, JSON.stringify(fixture.workspaces))
      window.localStorage.setItem(ACTIVE_WORKSPACE_STORAGE_KEY, fixture.workspaceId)
      window.localStorage.setItem(AUTHOR_REQUESTS_STORAGE_KEY, JSON.stringify([]))
      window.localStorage.setItem(INVITATIONS_SENT_STORAGE_KEY, JSON.stringify([]))
      window.localStorage.removeItem(DATA_WORKSPACE_STORAGE_KEY)

      useWorkspaceStore.setState({
        workspaces: fixture.workspaces,
        activeWorkspaceId: fixture.workspaceId,
        authorRequests: [],
        invitationsSent: [],
      })

      useDataWorkspaceStore.setState({
        dataAssets: fixture.dataAssets,
        workingTables: fixture.workingTables,
        manuscriptTables: fixture.manuscriptTables,
      })

      if (!cancelled) {
        setReady(true)
      }
    }

    bootstrap()

    return () => {
      cancelled = true

      if (previousSessionToken === null) {
        window.sessionStorage.removeItem(AUTH_TOKEN_STORAGE_KEY)
      } else {
        window.sessionStorage.setItem(AUTH_TOKEN_STORAGE_KEY, previousSessionToken)
      }

      if (previousLocalToken === null) {
        window.localStorage.removeItem(AUTH_TOKEN_STORAGE_KEY)
      } else {
        window.localStorage.setItem(AUTH_TOKEN_STORAGE_KEY, previousLocalToken)
      }

      if (previousWorkspaces === null) {
        window.localStorage.removeItem(WORKSPACES_STORAGE_KEY)
      } else {
        window.localStorage.setItem(WORKSPACES_STORAGE_KEY, previousWorkspaces)
      }

      if (previousActiveWorkspaceId === null) {
        window.localStorage.removeItem(ACTIVE_WORKSPACE_STORAGE_KEY)
      } else {
        window.localStorage.setItem(ACTIVE_WORKSPACE_STORAGE_KEY, previousActiveWorkspaceId)
      }

      if (previousAuthorRequests === null) {
        window.localStorage.removeItem(AUTHOR_REQUESTS_STORAGE_KEY)
      } else {
        window.localStorage.setItem(AUTHOR_REQUESTS_STORAGE_KEY, previousAuthorRequests)
      }

      if (previousInvitationsSent === null) {
        window.localStorage.removeItem(INVITATIONS_SENT_STORAGE_KEY)
      } else {
        window.localStorage.setItem(INVITATIONS_SENT_STORAGE_KEY, previousInvitationsSent)
      }

      if (previousDataWorkspace === null) {
        window.localStorage.removeItem(DATA_WORKSPACE_STORAGE_KEY)
      } else {
        window.localStorage.setItem(DATA_WORKSPACE_STORAGE_KEY, previousDataWorkspace)
      }

      useWorkspaceStore.setState(previousWorkspaceState)
      useDataWorkspaceStore.setState(previousDataWorkspaceState)
    }
  }, [fixture])

  if (!ready) {
    return <div data-house-role="results-story-loading" className="p-4 text-sm text-muted-foreground">Preparing data workspace fixture...</div>
  }

  return (
    <MemoryRouter initialEntries={[`/w/${fixture.workspaceId}/data`]}>
      <Routes>
        <Route path="/w/:workspaceId/data" element={<ResultsPage />} />
      </Routes>
    </MemoryRouter>
  )
}

const meta = {
  title: 'Pages/ResultsPage',
  component: ResultsPagePreview,
  parameters: {
    layout: 'fullscreen',
  },
  tags: ['autodocs'],
} satisfies Meta<typeof ResultsPagePreview>

export default meta
type Story = StoryObj<typeof meta>

export const Populated: Story = {
  args: {
    fixture: populatedFixture,
  },
}

export const Empty: Story = {
  args: {
    fixture: emptyFixture,
  },
}
