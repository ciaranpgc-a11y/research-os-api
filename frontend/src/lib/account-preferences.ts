export const ACCOUNT_SETTINGS_STORAGE_KEY = 'aawe-account-settings'

export const STUDY_TYPE_OPTIONS = [
  'Retrospective cohort',
  'Prospective cohort',
  'Registry analysis',
  'Diagnostic accuracy',
  'Imaging biomarker',
  'Prognostic modelling',
] as const

export const REPORTING_GUIDELINE_OPTIONS = [
  'STROBE',
  'CONSORT',
  'PRISMA',
  'TRIPOD',
  'STARD',
] as const

export type AccountSettings = {
  affiliation: string
  defaultLanguage: 'en-GB' | 'en-US'
  notificationsEmail: string
  publicationInsightsDefaultVisibility: 'visible' | 'hidden'
  researchKeywords: string[]
  defaultStudyTypes: string[]
  preferredJournals: string[]
  claimTone: 'conservative' | 'balanced' | 'assertive'
  reportingGuidelines: string[]
}

const DEFAULT_ACCOUNT_SETTINGS: AccountSettings = {
  affiliation: '',
  defaultLanguage: 'en-GB',
  notificationsEmail: '',
  publicationInsightsDefaultVisibility: 'visible',
  researchKeywords: [],
  defaultStudyTypes: [],
  preferredJournals: [],
  claimTone: 'conservative',
  reportingGuidelines: [],
}

function clampUnique(values: string[], limit: number): string[] {
  const seen = new Set<string>()
  const output: string[] = []
  for (const value of values) {
    const clean = value.trim()
    if (!clean) {
      continue
    }
    const key = clean.toLowerCase()
    if (seen.has(key)) {
      continue
    }
    seen.add(key)
    output.push(clean)
    if (output.length >= limit) {
      break
    }
  }
  return output
}

export function parseCsvList(input: string, limit = 12): string[] {
  return clampUnique(
    input
      .split(',')
      .map((value) => value.trim())
      .filter(Boolean),
    limit,
  )
}

export function readAccountSettings(): AccountSettings {
  if (typeof window === 'undefined') {
    return { ...DEFAULT_ACCOUNT_SETTINGS }
  }
  const raw = window.localStorage.getItem(ACCOUNT_SETTINGS_STORAGE_KEY)
  if (!raw) {
    return { ...DEFAULT_ACCOUNT_SETTINGS }
  }
  try {
    const parsed = JSON.parse(raw) as Partial<AccountSettings>
    return {
      affiliation: parsed.affiliation || '',
      defaultLanguage: parsed.defaultLanguage === 'en-US' ? 'en-US' : 'en-GB',
      notificationsEmail: parsed.notificationsEmail || '',
      publicationInsightsDefaultVisibility:
        parsed.publicationInsightsDefaultVisibility === 'visible' ? 'visible' : 'hidden',
      researchKeywords: clampUnique(Array.isArray(parsed.researchKeywords) ? parsed.researchKeywords : [], 8),
      defaultStudyTypes: clampUnique(Array.isArray(parsed.defaultStudyTypes) ? parsed.defaultStudyTypes : [], 12),
      preferredJournals: clampUnique(Array.isArray(parsed.preferredJournals) ? parsed.preferredJournals : [], 20),
      claimTone:
        parsed.claimTone === 'assertive' || parsed.claimTone === 'balanced'
          ? parsed.claimTone
          : 'conservative',
      reportingGuidelines: clampUnique(Array.isArray(parsed.reportingGuidelines) ? parsed.reportingGuidelines : [], 8),
    }
  } catch {
    return { ...DEFAULT_ACCOUNT_SETTINGS }
  }
}

export function writeAccountSettings(settings: AccountSettings): void {
  if (typeof window === 'undefined') {
    return
  }
  const payload: AccountSettings = {
    affiliation: settings.affiliation.trim(),
    defaultLanguage: settings.defaultLanguage === 'en-US' ? 'en-US' : 'en-GB',
    notificationsEmail: settings.notificationsEmail.trim(),
    publicationInsightsDefaultVisibility:
      settings.publicationInsightsDefaultVisibility === 'visible' ? 'visible' : 'hidden',
    researchKeywords: clampUnique(settings.researchKeywords, 8),
    defaultStudyTypes: clampUnique(settings.defaultStudyTypes, 12),
    preferredJournals: clampUnique(settings.preferredJournals, 20),
    claimTone:
      settings.claimTone === 'assertive' || settings.claimTone === 'balanced'
        ? settings.claimTone
        : 'conservative',
    reportingGuidelines: clampUnique(settings.reportingGuidelines, 8),
  }
  window.localStorage.setItem(ACCOUNT_SETTINGS_STORAGE_KEY, JSON.stringify(payload))
}

export function settingsCompleteness(settings: AccountSettings): number {
  const checks = [
    Boolean(settings.affiliation.trim()),
    Boolean(settings.defaultLanguage),
    settings.researchKeywords.length > 0,
    settings.defaultStudyTypes.length > 0,
    settings.preferredJournals.length > 0,
    settings.reportingGuidelines.length > 0,
    Boolean(settings.claimTone),
  ]
  const complete = checks.filter(Boolean).length
  return Math.round((complete / checks.length) * 100)
}

