import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { MemoryRouter } from 'react-router-dom'

import { ProfileCollaborationPage } from '@/pages/profile-collaboration-page'

const mockNavigate = vi.fn()
const mockFetchSummary = vi.fn()
const mockListCollaborators = vi.fn()
const mockGetCollaborator = vi.fn()
const mockCreateCollaborator = vi.fn()
const mockUpdateCollaborator = vi.fn()
const mockDeleteCollaborator = vi.fn()
const mockImportCollaborators = vi.fn()
const mockEnrichCollaborators = vi.fn()
const mockExportCollaborators = vi.fn()
const mockAiInsights = vi.fn()
const mockAiAuthorSuggestions = vi.fn()
const mockAiContribution = vi.fn()
const mockAiAffiliations = vi.fn()
const collaboratorsFixture = [
  {
    id: 'collab-1',
    owner_user_id: 'user-1',
    full_name: 'Alice Collaborator',
    preferred_name: null,
    email: 'alice@example.com',
    orcid_id: null,
    openalex_author_id: null,
    primary_institution: 'Institution A',
    department: null,
    country: 'GB',
    current_position: null,
    research_domains: ['Cardiology'],
    notes: null,
    created_at: '2026-02-22T10:00:00Z',
    updated_at: '2026-02-23T10:00:00Z',
    metrics: {
      coauthored_works_count: 5,
      shared_citations_total: 120,
      first_collaboration_year: 2019,
      last_collaboration_year: 2025,
      citations_last_12m: 20,
      collaboration_strength_score: 0.88,
      classification: 'CORE',
      computed_at: '2026-02-23T10:00:00Z',
      status: 'READY',
    },
    duplicate_warnings: [],
  },
  {
    id: 'collab-2',
    owner_user_id: 'user-1',
    full_name: 'Bob Collaborator',
    preferred_name: null,
    email: null,
    orcid_id: null,
    openalex_author_id: null,
    primary_institution: 'Institution B',
    department: null,
    country: null,
    current_position: null,
    research_domains: ['Imaging'],
    notes: null,
    created_at: '2026-02-21T10:00:00Z',
    updated_at: '2026-02-23T10:00:00Z',
    metrics: {
      coauthored_works_count: 2,
      shared_citations_total: 35,
      first_collaboration_year: 2021,
      last_collaboration_year: 2024,
      citations_last_12m: 6,
      collaboration_strength_score: 0.41,
      classification: 'ACTIVE',
      computed_at: '2026-02-23T10:00:00Z',
      status: 'READY',
    },
    duplicate_warnings: [],
  },
]

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<Record<string, unknown>>('react-router-dom')
  return {
    ...actual,
    useNavigate: () => mockNavigate,
  }
})

vi.mock('@/lib/auth-session', () => ({
  getAuthSessionToken: () => 'test-session-token',
}))

vi.mock('@/lib/impact-api', () => ({
  fetchCollaborationMetricsSummary: (...args: unknown[]) => mockFetchSummary(...args),
  listCollaborators: (...args: unknown[]) => mockListCollaborators(...args),
  getCollaborator: (...args: unknown[]) => mockGetCollaborator(...args),
  createCollaborator: (...args: unknown[]) => mockCreateCollaborator(...args),
  updateCollaborator: (...args: unknown[]) => mockUpdateCollaborator(...args),
  deleteCollaborator: (...args: unknown[]) => mockDeleteCollaborator(...args),
  importCollaboratorsFromOpenAlex: (...args: unknown[]) => mockImportCollaborators(...args),
  enrichCollaboratorsFromOpenAlex: (...args: unknown[]) => mockEnrichCollaborators(...args),
  exportCollaboratorsCsv: (...args: unknown[]) => mockExportCollaborators(...args),
  generateCollaborationAiInsights: (...args: unknown[]) => mockAiInsights(...args),
  generateCollaborationAiAuthorSuggestions: (...args: unknown[]) => mockAiAuthorSuggestions(...args),
  generateCollaborationAiContributionStatement: (...args: unknown[]) => mockAiContribution(...args),
  generateCollaborationAiAffiliationsNormaliser: (...args: unknown[]) => mockAiAffiliations(...args),
}))

describe('ProfileCollaborationPage', () => {
  const renderPage = () =>
    render(
      <MemoryRouter>
        <ProfileCollaborationPage />
      </MemoryRouter>,
    )

  beforeEach(() => {
    mockNavigate.mockReset()
    mockFetchSummary.mockReset()
    mockListCollaborators.mockReset()
    mockGetCollaborator.mockReset()
    mockCreateCollaborator.mockReset()
    mockUpdateCollaborator.mockReset()
    mockDeleteCollaborator.mockReset()
    mockImportCollaborators.mockReset()
    mockEnrichCollaborators.mockReset()
    mockExportCollaborators.mockReset()
    mockAiInsights.mockReset()
    mockAiAuthorSuggestions.mockReset()
    mockAiContribution.mockReset()
    mockAiAffiliations.mockReset()

    mockFetchSummary.mockResolvedValue({
      total_collaborators: 2,
      core_collaborators: 1,
      active_collaborations_12m: 1,
      new_collaborators_12m: 1,
      last_computed_at: '2026-02-23T10:00:00Z',
      status: 'READY',
      is_stale: false,
      is_updating: false,
      last_update_failed: false,
    })
    mockListCollaborators.mockResolvedValue({
      items: collaboratorsFixture,
      page: 1,
      page_size: 50,
      total: 2,
      has_more: false,
    })
    mockGetCollaborator.mockImplementation(async (_token: string, collaboratorId: string) => {
      const found = collaboratorsFixture.find((item) => item.id === collaboratorId)
      return found || collaboratorsFixture[0]
    })
    mockCreateCollaborator.mockResolvedValue(null)
    mockUpdateCollaborator.mockResolvedValue(null)
    mockDeleteCollaborator.mockResolvedValue({ deleted: true })
    mockImportCollaborators.mockResolvedValue({
      created_count: 1,
      updated_count: 0,
      skipped_count: 0,
      openalex_author_id: 'https://openalex.org/A123',
      imported_candidates: 1,
    })
    mockEnrichCollaborators.mockResolvedValue({
      targeted_count: 2,
      resolved_author_count: 2,
      updated_count: 1,
      unchanged_count: 1,
      skipped_without_identifier: 0,
      failed_count: 0,
      enqueued_metrics_recompute: true,
      field_updates: { primary_institution: 1 },
    })
    mockExportCollaborators.mockResolvedValue({
      filename: 'collaborators.csv',
      content: 'full_name\\nAlice Collaborator',
    })
    mockAiInsights.mockResolvedValue({
      status: 'draft',
      insights: ['Insight one'],
      suggested_actions: ['Action one'],
      provenance: {},
    })
    mockAiAuthorSuggestions.mockResolvedValue({
      status: 'draft',
      topic_keywords: ['cardiology'],
      methods: ['machine learning'],
      suggestions: [],
      provenance: {},
    })
    mockAiContribution.mockResolvedValue({
      status: 'draft',
      credit_statements: [],
      draft_text: 'Draft contribution statement',
      provenance: {},
    })
    mockAiAffiliations.mockResolvedValue({
      status: 'draft',
      normalized_authors: [],
      affiliations: [],
      affiliations_block: 'Draft block',
      coi_boilerplate: 'Draft COI',
      provenance: {},
    })
  })

  it('renders collaborator list and detail panel', async () => {
    renderPage()

    await waitFor(() => {
      expect(screen.getAllByText('Alice Collaborator').length).toBeGreaterThan(0)
      expect(screen.getAllByText('Bob Collaborator').length).toBeGreaterThan(0)
    })

    fireEvent.click(screen.getByRole('cell', { name: 'Bob Collaborator' }))

    await waitFor(() => {
      expect(screen.getByDisplayValue('Bob Collaborator')).toBeInTheDocument()
    })
  })

  it('loads selected collaborator into the editable form', async () => {
    renderPage()

    await waitFor(() => {
      expect(screen.getAllByText('Alice Collaborator').length).toBeGreaterThan(0)
    })

    fireEvent.click(screen.getByRole('cell', { name: 'Alice Collaborator' }))

    await waitFor(() => {
      expect(screen.getByDisplayValue('Alice Collaborator')).toBeInTheDocument()
    })
    expect(screen.getByDisplayValue('Institution A')).toBeInTheDocument()
  })
})
