import { houseNavigation, houseSurfaces } from '@/lib/house-style'

export type HouseSectionTone =
  | 'overview'
  | 'research'
  | 'account'
  | 'workspace'
  | 'data'
  | 'manuscript'
  | 'governance'
  | 'neutral'

type ToneRule = {
  pattern: RegExp
  tone: HouseSectionTone
}

const NAV_TONE_CLASS_BY_TONE: Record<HouseSectionTone, string> = {
  overview: houseNavigation.itemOverview,
  research: houseNavigation.itemResearch,
  account: houseNavigation.itemAccount,
  workspace: houseNavigation.itemWorkspace,
  data: houseNavigation.itemData,
  manuscript: houseNavigation.itemManuscript,
  governance: houseNavigation.itemGovernance,
  neutral: '',
}

const LEFT_BORDER_CLASS_BY_TONE: Record<HouseSectionTone, string> = {
  overview: houseSurfaces.leftBorderOverview,
  research: houseSurfaces.leftBorderResearch,
  account: houseSurfaces.leftBorderAccount,
  workspace: houseSurfaces.leftBorderWorkspace,
  data: houseSurfaces.leftBorderData,
  manuscript: houseSurfaces.leftBorderManuscript,
  governance: houseSurfaces.leftBorderGovernance,
  neutral: '',
}

const ACCOUNT_TONE_RULES: ToneRule[] = [
  { pattern: /^\/profile\/?$/i, tone: 'overview' },
  {
    pattern: /^\/(?:profile\/publications(?:\/|$)|account\/collaboration(?:\/|$)|impact(?:\/|$))/i,
    tone: 'research',
  },
  {
    pattern: /^\/(?:profile\/(?:personal-details|integrations|manage-account)(?:\/|$)|settings(?:\/|$))/i,
    tone: 'account',
  },
]

const WORKSPACE_TONE_RULES: ToneRule[] = [
  { pattern: /\/manuscript(?:\/|$)/i, tone: 'manuscript' },
  { pattern: /\/(?:data|results|literature)(?:\/|$)/i, tone: 'data' },
  {
    pattern: /\/(?:qc|claim-map|versions|audit|inference-rules|agent-logs|journal-targeting)(?:\/|$)/i,
    tone: 'governance',
  },
  { pattern: /\/(?:workspaces|overview|inbox|run-wizard|study-core|exports)(?:\/|$)/i, tone: 'workspace' },
]

const LABEL_TONE_RULES: ToneRule[] = [
  {
    pattern: /\b(?:overview|home)\b/i,
    tone: 'overview',
  },
  {
    pattern: /\b(?:research|publications?|collaboration|impact)\b/i,
    tone: 'research',
  },
  {
    pattern: /\b(?:account|settings|integrations|personal|manage)\b/i,
    tone: 'account',
  },
  {
    pattern: /\b(?:manuscript|title|abstract|introduction|methods|results|discussion|limitations|conclusion|figures?|tables?)\b/i,
    tone: 'manuscript',
  },
  {
    pattern: /\b(?:governance|quality|qc|claim|version|audit|inference|journal|agent|states?)\b/i,
    tone: 'governance',
  },
  {
    pattern: /\b(?:study data|data|library)\b/i,
    tone: 'data',
  },
  {
    pattern: /\b(?:workspace|views?|inbox|run wizard|actions?)\b/i,
    tone: 'workspace',
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
  return NAV_TONE_CLASS_BY_TONE[tone]
}

export function getHouseLeftBorderToneClass(tone: HouseSectionTone): string {
  return LEFT_BORDER_CLASS_BY_TONE[tone]
}

export function resolveAccountSectionTone(pathname: string): HouseSectionTone {
  return resolveByRules(normalizePathname(pathname), ACCOUNT_TONE_RULES, 'overview')
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
