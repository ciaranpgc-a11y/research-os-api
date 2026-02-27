import { clearAuthSessionToken, setAuthSessionToken, setCachedAuthRole } from '@/lib/auth-session'
import {
  pagesReviewManuscriptTables,
  pagesReviewResultsDataAssets,
  pagesReviewUser,
  pagesReviewWorkspaceAuthorRequests,
  pagesReviewWorkspaceInboxMessages,
  pagesReviewWorkspaceInboxReads,
  pagesReviewWorkspaceInvitations,
  pagesReviewWorkspaceRecords,
  PAGES_REVIEW_COLLAB_MODE_KEY,
  PAGES_REVIEW_LIBRARY_MODE_KEY,
  PAGES_REVIEW_RUN_CONTEXT_MODE_KEY,
  type PagesReviewMockMode,
} from '@/mocks/fixtures/pages-review'
import type { DataAsset, ManuscriptTable } from '@/types/data-workspace'
import type { WorkspaceAuthorRequest, WorkspaceInvitationSent, WorkspaceRecord } from '@/store/use-workspace-store'
import type { WorkspaceInboxMessageRecord, WorkspaceInboxReadMap } from '@/store/use-workspace-inbox-store'
import { useAaweStore } from '@/store/use-aawe-store'
import { useDataWorkspaceStore } from '@/store/use-data-workspace-store'
import { useStudyCoreWizardStore } from '@/store/use-study-core-wizard-store'
import { useWorkspaceInboxStore } from '@/store/use-workspace-inbox-store'
import { useWorkspaceStore } from '@/store/use-workspace-store'

const INTEGRATIONS_USER_CACHE_KEY = 'aawe_integrations_user_cache'
const PERSONAL_DETAILS_STORAGE_PREFIX = 'aawe_profile_personal_details:'

type PagesReviewSeedOptions = {
  signedIn?: boolean
  collaborationMode?: PagesReviewMockMode
  libraryMode?: PagesReviewMockMode
  runContextMode?: PagesReviewMockMode
  workspaces?: WorkspaceRecord[]
  activeWorkspaceId?: string | null
  authorRequests?: WorkspaceAuthorRequest[]
  invitationsSent?: WorkspaceInvitationSent[]
  inboxMessages?: WorkspaceInboxMessageRecord[]
  inboxReads?: WorkspaceInboxReadMap
  dataAssets?: DataAsset[]
  manuscriptTables?: ManuscriptTable[]
}

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T
}

function setPagesReviewMockModes(input: {
  collaborationMode: PagesReviewMockMode
  libraryMode: PagesReviewMockMode
  runContextMode: PagesReviewMockMode
}) {
  window.localStorage.setItem(PAGES_REVIEW_COLLAB_MODE_KEY, input.collaborationMode)
  window.localStorage.setItem(PAGES_REVIEW_LIBRARY_MODE_KEY, input.libraryMode)
  window.localStorage.setItem(PAGES_REVIEW_RUN_CONTEXT_MODE_KEY, input.runContextMode)
}

function seedAuthState(signedIn: boolean) {
  if (!signedIn) {
    clearAuthSessionToken()
    window.localStorage.removeItem(INTEGRATIONS_USER_CACHE_KEY)
    window.localStorage.removeItem(`${PERSONAL_DETAILS_STORAGE_PREFIX}${pagesReviewUser.id}`)
    return
  }
  setAuthSessionToken('storybook-pages-review-token')
  setCachedAuthRole('user')
  window.localStorage.setItem(INTEGRATIONS_USER_CACHE_KEY, JSON.stringify({ id: pagesReviewUser.id }))
  window.localStorage.setItem(
    `${PERSONAL_DETAILS_STORAGE_PREFIX}${pagesReviewUser.id}`,
    JSON.stringify({
      firstName: 'Storybook',
      lastName: 'User',
      updatedAt: '2026-02-27T09:00:00Z',
    }),
  )
}

export function seedPagesReviewState(options: PagesReviewSeedOptions = {}) {
  if (typeof window === 'undefined') {
    return
  }

  const signedIn = options.signedIn ?? true
  seedAuthState(signedIn)
  setPagesReviewMockModes({
    collaborationMode: options.collaborationMode ?? 'default',
    libraryMode: options.libraryMode ?? 'default',
    runContextMode: options.runContextMode ?? 'default',
  })

  useAaweStore.setState({
    selectedItem: null,
    rightPanelOpen: false,
    leftPanelOpen: false,
    claimMapView: false,
    searchQuery: '',
  })

  const workspaces = clone(options.workspaces ?? pagesReviewWorkspaceRecords)
  const activeWorkspaceId = options.activeWorkspaceId ?? workspaces[0]?.id ?? null
  useWorkspaceStore.setState({
    workspaces,
    activeWorkspaceId,
    authorRequests: clone(options.authorRequests ?? pagesReviewWorkspaceAuthorRequests),
    invitationsSent: clone(options.invitationsSent ?? pagesReviewWorkspaceInvitations),
  })

  useWorkspaceInboxStore.setState({
    messages: clone(options.inboxMessages ?? pagesReviewWorkspaceInboxMessages),
    reads: clone(options.inboxReads ?? pagesReviewWorkspaceInboxReads),
  })

  useDataWorkspaceStore.setState({
    dataAssets: clone(options.dataAssets ?? pagesReviewResultsDataAssets),
    workingTables: [],
    manuscriptTables: clone(options.manuscriptTables ?? pagesReviewManuscriptTables),
  })

  const wizardState = useStudyCoreWizardStore.getState()
  wizardState.resetWizard()
}
