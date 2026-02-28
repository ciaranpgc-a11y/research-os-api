import { houseNavigation, houseSurfaces } from '@/lib/house-style'

export type HouseSectionTone =
  | 'overview'
  | 'research'
  | 'account'
  | 'workspace'
  | 'data'
  | 'manuscript'
  | 'governance'
  | 'learning-centre'
  | 'opportunities'
  | 'profile'
  | 'neutral'

type ToneRule = {
  pattern: RegExp
  tone: HouseSectionTone
}

type CanonicalHouseSectionTone = 'workspace' | 'profile' | 'learning-centre' | 'opportunities' | 'neutral'

const NAV_TONE_CLASS_BY_TONE: Record<CanonicalHouseSectionTone, string> = {
  profile: houseNavigation.itemAccount,
  workspace: houseNavigation.itemWorkspace,
  'learning-centre': houseNavigation.itemLearningCentre,
  opportunities: houseNavigation.itemOpportunities,
  neutral: '',
}

const LEFT_BORDER_CLASS_BY_TONE: Record<CanonicalHouseSectionTone, string> = {
  profile: houseSurfaces.leftBorderPublications,
  workspace: houseSurfaces.leftBorderWorkspace,
  'learning-centre': houseSurfaces.leftBorderLearningCentre,
  opportunities: houseSurfaces.leftBorderOpportunities,
  neutral: '',
}

function toCanonicalSectionTone(tone: HouseSectionTone): CanonicalHouseSectionTone {
  switch (tone) {
    case 'overview':
    case 'research':
    case 'account':
    case 'profile':
      return 'profile'
  case 'workspace':
  case 'data':
  case 'manuscript':
  case 'governance':
    return 'workspace'
  case 'learning-centre':
    return 'learning-centre'
  case 'opportunities':
    return 'opportunities'
  case 'neutral':
  default:
    return 'neutral'
  }
}

const ACCOUNT_TONE_RULES: ToneRule[] = [
  { pattern: /^\/profile\/?$/i, tone: 'profile' },
  {
    pattern: /^\/(?:profile\/publications(?:\/|$)|account\/collaboration(?:\/|$)|impact(?:\/|$))/i,
    tone: 'profile',
  },
  {
    pattern: /^\/(?:profile\/(?:personal-details|integrations|manage-account)(?:\/|$)|settings(?:\/|$))/i,
    tone: 'profile',
  },
]

const WORKSPACE_TONE_RULES: ToneRule[] = [
  { pattern: /\/manuscript(?:\/|$)/i, tone: 'workspace' },
  { pattern: /\/(?:data|results|literature)(?:\/|$)/i, tone: 'workspace' },
  {
    pattern: /\/(?:qc|claim-map|versions|audit|inference-rules|agent-logs|journal-targeting)(?:\/|$)/i,
    tone: 'workspace',
  },
  { pattern: /\/(?:workspaces|overview|inbox|run-wizard|study-core|exports)(?:\/|$)/i, tone: 'workspace' },
  { pattern: /^\/learning-centre(?:\/|$)/i, tone: 'learning-centre' },
  { pattern: /^\/opportunities(?:\/|$)/i, tone: 'opportunities' },
]

const LABEL_TONE_RULES: ToneRule[] = [
  {
    pattern: /\b(?:overview|home)\b/i,
    tone: 'profile',
  },
  {
    pattern: /\b(?:research|publications?|collaboration|impact)\b/i,
    tone: 'profile',
  },
  {
    pattern: /\b(?:account|settings|integrations|personal|manage)\b/i,
    tone: 'profile',
  },
  {
    pattern: /\b(?:manuscript|title|abstract|introduction|methods|results|discussion|limitations|conclusion|figures?|tables?)\b/i,
    tone: 'workspace',
  },
  {
    pattern: /\b(?:governance|quality|qc|claim|version|audit|inference|journal|agent|states?)\b/i,
    tone: 'workspace',
  },
  {
    pattern: /\b(?:study data|data|library)\b/i,
    tone: 'workspace',
  },
  {
    pattern: /\b(?:workspace|views?|inbox|run wizard|actions?)\b/i,
    tone: 'workspace',
  },
  {
    pattern: /\b(?:learning centre|learning-centre)\b/i,
    tone: 'learning-centre',
  },
  {
    pattern: /\bopportunities\b/i,
    tone: 'opportunities',
  },
]

function normalizePathname(pathname: string): string {
  const trimmed = pathname.trim()
  if (!trimmed) {
    return '/'
  }
  return trimmed.endsWith('/') && trimmed.length > 1 ? trimmed.slice(0, -1) : trimmed
}

function resolveByRules(pathname: string, rules: ToneRule[], fallback: HouseSectionTone): HouseSectionTone {
  for (const rule of rules) {
    if (rule.pattern.test(pathname)) {
      return rule.tone
    }
  }
  return fallback
}

export function getHouseNavToneClass(tone: HouseSectionTone): string {
  return NAV_TONE_CLASS_BY_TONE[toCanonicalSectionTone(tone)]
}

export function getHouseLeftBorderToneClass(tone: HouseSectionTone): string {
  return LEFT_BORDER_CLASS_BY_TONE[toCanonicalSectionTone(tone)]
}

export function resolveAccountSectionTone(pathname: string): HouseSectionTone {
  return resolveByRules(normalizePathname(pathname), ACCOUNT_TONE_RULES, 'neutral')
}

export function resolveWorkspaceSectionTone(pathname: string): HouseSectionTone {
  const normalizedPathname = normalizePathname(pathname)
  const fromRules = resolveByRules(normalizedPathname, WORKSPACE_TONE_RULES, 'neutral')
  if (fromRules !== 'neutral') {
    return fromRules
  }
  if (/^\/w\/[^/]+(?:\/|$)/i.test(normalizedPathname)) {
    return 'workspace'
  }
  return 'neutral'
}

export function resolveSectionTone(pathname: string): HouseSectionTone {
  const accountTone = resolveByRules(normalizePathname(pathname), ACCOUNT_TONE_RULES, 'neutral')
  if (accountTone !== 'neutral') {
    return accountTone
  }
  return resolveWorkspaceSectionTone(pathname)
}

export function resolveSectionToneFromLabel(label: string, fallback: HouseSectionTone): HouseSectionTone {
  const normalizedLabel = label.trim()
  if (!normalizedLabel) {
    return fallback
  }
  return resolveByRules(normalizedLabel, LABEL_TONE_RULES, fallback)
}
