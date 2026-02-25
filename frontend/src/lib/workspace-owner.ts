const INTEGRATIONS_USER_CACHE_KEY = 'aawe_integrations_user_cache'
const PERSONAL_DETAILS_STORAGE_PREFIX = 'aawe_profile_personal_details:'

type CachedUserRecord = {
  id?: string | null
}

type StoredPersonalDetailsRecord = {
  firstName?: string | null
  lastName?: string | null
}

function trimValue(value: string | null | undefined): string {
  return (value || '').trim()
}

function readCachedUserId(): string {
  if (typeof window === 'undefined') {
    return ''
  }
  const raw = window.localStorage.getItem(INTEGRATIONS_USER_CACHE_KEY)
  if (!raw) {
    return ''
  }
  try {
    const parsed = JSON.parse(raw) as CachedUserRecord
    return trimValue(parsed.id)
  } catch {
    return ''
  }
}

export function readWorkspaceOwnerNameFromProfile(): string | null {
  if (typeof window === 'undefined') {
    return null
  }
  const userId = readCachedUserId()
  if (!userId) {
    return null
  }
  const raw = window.localStorage.getItem(`${PERSONAL_DETAILS_STORAGE_PREFIX}${userId}`)
  if (!raw) {
    return null
  }
  try {
    const parsed = JSON.parse(raw) as StoredPersonalDetailsRecord
    const firstName = trimValue(parsed.firstName)
    const lastName = trimValue(parsed.lastName)
    if (!firstName || !lastName) {
      return null
    }
    return `${firstName} ${lastName}`
  } catch {
    return null
  }
}

export const WORKSPACE_OWNER_REQUIRED_MESSAGE =
  'Enter first and last name in Profile > Personal details before creating a workspace.'
