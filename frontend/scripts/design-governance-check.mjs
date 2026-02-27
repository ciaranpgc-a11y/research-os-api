import fs from 'node:fs'
import path from 'node:path'

const ROOT = process.cwd()
const TARGET_DIRS = [path.join(ROOT, 'src'), path.join(ROOT, '.storybook')]
const ALLOWED_EXTENSIONS = new Set(['.ts', '.tsx', '.js', '.jsx', '.css'])
const JSX_EXTENSIONS = new Set(['.tsx', '.jsx'])
const HOUSE_ROLE_BASELINE_PATH = path.join(ROOT, 'scripts', 'house-role-baseline.json')
const TONE_MISUSE_BASELINE_PATH = path.join(ROOT, 'scripts', 'tone-misuse-baseline.json')
const APP_ENTRY_FILE = path.join(ROOT, 'src', 'App.tsx')
const ALLOWED_DURATION_TOKENS = new Set(['150', '200', '220', '300', '320', '420', '500', '700'])
const ALLOWED_NAV_LEFT_WIDTHS = new Set(['250', '280'])
const ALLOWED_NAV_RIGHT_WIDTHS = new Set(['', '280', '320', '340'])
const TONE_MISUSE_SCAN_EXTENSIONS = new Set(['.ts', '.tsx', '.js', '.jsx'])
const TONE_MISUSE_SCAN_PREFIXES = ['src/components/', 'src/pages/', 'src/stories/', '.storybook/']
const TONE_MISUSE_ALLOW_DIRECTIVE = /design-governance:allow-tone/

const RULES = [
  {
    id: 'inline-hex',
    message: 'Inline hex colors are not allowed. Use design tokens.',
    regex: /#[0-9a-fA-F]{3,8}\b/g,
  },
  {
    id: 'arbitrary-px',
    message: 'Arbitrary px utilities are not allowed. Use spacing/type tokens.',
    regex: /[A-Za-z0-9:-]+-\[[0-9]+px\]/g,
  },
  {
    id: 'arbitrary-rem-type',
    message: 'Arbitrary rem typography utilities are not allowed. Use house typography or text tokens.',
    regex: /!?((text|leading)-\[[0-9.]+rem\])/g,
  },
  {
    id: 'raw-neutral-extreme',
    message: 'Raw white/black surface utilities are not allowed. Use design tokens.',
    regex: /\b(?:bg|border)-(?:white|black)(?:\/[0-9]{1,3})?\b/g,
  },
]

function collectCardTitleSizeOverrides(source) {
  const overrides = []
  const patterns = [
    /<CardTitle[^>]*className\s*=\s*"[^"]*text-(?:xs|sm|base|lg|xl)[^"]*"[^>]*>/g,
    /<CardTitle[^>]*className\s*=\s*'[^']*text-(?:xs|sm|base|lg|xl)[^']*'[^>]*>/g,
    /<CardTitle[^>]*className\s*=\s*\{[^}]*text-(?:xs|sm|base|lg|xl)[^}]*\}[^>]*>/g,
  ]
  for (const pattern of patterns) {
    for (const match of source.matchAll(pattern)) {
      overrides.push({
        index: match.index ?? 0,
        snippet: String(match[0] || '').slice(0, 140),
        message:
          'Do not override CardTitle typography with text size utilities. Use CardTitle defaults or house typography tokens.',
      })
    }
  }
  return overrides
}

function collectTableXsTypography(source) {
  const invalid = []
  const patterns = [
    /<(?:table|thead|th)\b[^>]*className\s*=\s*"[^"]*\btext-xs\b[^"]*"[^>]*>/g,
    /<(?:table|thead|th)\b[^>]*className\s*=\s*'[^']*\btext-xs\b[^']*'[^>]*>/g,
    /<(?:table|thead|th)\b[^>]*className\s*=\s*\{[^}]*\btext-xs\b[^}]*\}[^>]*>/g,
  ]
  for (const pattern of patterns) {
    for (const match of source.matchAll(pattern)) {
      invalid.push({
        index: match.index ?? 0,
        snippet: String(match[0] || '').slice(0, 140),
        message:
          'text-xs is not allowed on table shells/headers. Use house table tokens (`house-table-head-text`, `house-table-cell-text`) or shared Table components.',
      })
    }
  }
  return invalid
}

function collectUnsupportedDurationTokens(source) {
  const unsupported = []
  const durationPattern = /\bduration-(\d{2,4})\b/g
  for (const match of source.matchAll(durationPattern)) {
    const token = String(match[1] || '')
    if (ALLOWED_DURATION_TOKENS.has(token)) {
      continue
    }
    unsupported.push({
      index: match.index ?? 0,
      snippet: String(match[0] || ''),
      message:
        `Duration token ${token} is not approved. Allowed tokens: ${Array.from(ALLOWED_DURATION_TOKENS).join(', ')}`,
    })
  }
  return unsupported
}

function collectUnsupportedNavGridWidths(source) {
  const invalid = []
  const navGridPattern = /\bgrid-cols-\[(\d+)px_minmax\(0,1fr\)(?:_(\d+)px)?\]/g
  for (const match of source.matchAll(navGridPattern)) {
    const leftWidth = String(match[1] || '')
    const rightWidth = String(match[2] || '')
    if (ALLOWED_NAV_LEFT_WIDTHS.has(leftWidth) && ALLOWED_NAV_RIGHT_WIDTHS.has(rightWidth)) {
      continue
    }
    invalid.push({
      index: match.index ?? 0,
      snippet: String(match[0] || ''),
      message:
        `Unsupported nav grid width contract. Allowed left widths: ${Array.from(ALLOWED_NAV_LEFT_WIDTHS).join(', ')}. Allowed right widths: ${Array.from(ALLOWED_NAV_RIGHT_WIDTHS).filter(Boolean).join(', ')}`,
    })
  }
  return invalid
}

function listFiles(dir) {
  const out = []
  if (!fs.existsSync(dir)) {
    return out
  }
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === 'node_modules' || entry.name === 'dist') {
      continue
    }
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) {
      out.push(...listFiles(full))
      continue
    }
    const ext = path.extname(entry.name)
    if (ALLOWED_EXTENSIONS.has(ext)) {
      out.push(full)
    }
  }
  return out
}

function getLineAndCol(source, index) {
  const before = source.slice(0, index)
  const lines = before.split(/\r?\n/)
  const line = lines.length
  const col = lines[lines.length - 1].length + 1
  return { line, col }
}

function loadHouseRoleBaseline() {
  if (!fs.existsSync(HOUSE_ROLE_BASELINE_PATH)) {
    return {}
  }
  try {
    const raw = fs.readFileSync(HOUSE_ROLE_BASELINE_PATH, 'utf8')
    const parsed = JSON.parse(raw)
    return typeof parsed === 'object' && parsed ? parsed : {}
  } catch {
    return {}
  }
}

function loadToneMisuseBaseline() {
  if (!fs.existsSync(TONE_MISUSE_BASELINE_PATH)) {
    return {}
  }
  try {
    const raw = fs.readFileSync(TONE_MISUSE_BASELINE_PATH, 'utf8')
    const parsed = JSON.parse(raw)
    return typeof parsed === 'object' && parsed ? parsed : {}
  } catch {
    return {}
  }
}

function shouldScanToneMisuse(relativePath, extension, source) {
  if (!TONE_MISUSE_SCAN_EXTENSIONS.has(extension)) {
    return false
  }
  if (!TONE_MISUSE_SCAN_PREFIXES.some((prefix) => relativePath.startsWith(prefix))) {
    return false
  }
  if (TONE_MISUSE_ALLOW_DIRECTIVE.test(source)) {
    return false
  }

  // Allow chart/viz modules to reference tone scales explicitly.
  if (/(^|\/)(charts?|analytics|visualizations?|visualisations?|viz)(\/|[-_.])/i.test(relativePath)) {
    return false
  }

  return true
}

function collectToneTokenReferences(source) {
  const refs = []
  const pattern = /(?<![A-Za-z0-9_])--tone-[a-z0-9-]+(?![A-Za-z0-9_])/gi
  for (const match of source.matchAll(pattern)) {
    refs.push({
      index: match.index ?? 0,
      snippet: String(match[0] || ''),
      message:
        'Tone tokens are restricted to chart/viz modules. Use semantic tokens (`--primary`, `--accent`, `--status-*`, etc.) in UI components.',
    })
  }
  return refs
}

function collectUntaggedIntrinsicElements(source) {
  const untagged = []
  const openingTagPattern = /<([a-z][a-z0-9-]*)(\s[^<>]*?)?(\/?)>/g
  const taggedAttrPattern = /\b(data-house-role|data-house-scope|data-ui)\s*=/
  const TYPE_KEYWORD_TAGS = new Set(['typeof', 'keyof', 'infer'])

  for (const match of source.matchAll(openingTagPattern)) {
    const tagName = String(match[1] || '').toLowerCase()
    const fullMatch = String(match[0] || '')
    const attrs = String(match[2] || '')
    const index = match.index ?? 0

    if (fullMatch.startsWith('</') || fullMatch.startsWith('<!--')) {
      continue
    }

    if (TYPE_KEYWORD_TAGS.has(tagName)) {
      continue
    }

    if (!taggedAttrPattern.test(attrs)) {
      untagged.push({
        index,
        snippet: fullMatch,
      })
    }
  }

  return untagged
}

const violations = []
const houseRoleViolations = []
const houseRoleBaseline = loadHouseRoleBaseline()
const toneMisuseViolations = []
const toneMisuseBaseline = loadToneMisuseBaseline()

for (const dir of TARGET_DIRS) {
  const files = listFiles(dir)
  for (const file of files) {
    const source = fs.readFileSync(file, 'utf8')
    const relativePath = path.relative(ROOT, file).replace(/\\/g, '/')
    const extension = path.extname(file)

    for (const rule of RULES) {
      const matches = source.matchAll(rule.regex)
      for (const match of matches) {
        const { line, col } = getLineAndCol(source, match.index ?? 0)
        violations.push({
          file: relativePath,
          line,
          col,
          rule: rule.id,
          snippet: String(match[0]),
          message: rule.message,
        })
      }
    }

    const unsupportedDurationTokens = collectUnsupportedDurationTokens(source)
    for (const item of unsupportedDurationTokens) {
      const { line, col } = getLineAndCol(source, item.index)
      violations.push({
        file: relativePath,
        line,
        col,
        rule: 'unsupported-duration-token',
        snippet: item.snippet,
        message: item.message,
      })
    }

    const unsupportedNavGridWidths = collectUnsupportedNavGridWidths(source)
    for (const item of unsupportedNavGridWidths) {
      const { line, col } = getLineAndCol(source, item.index)
      violations.push({
        file: relativePath,
        line,
        col,
        rule: 'unsupported-nav-grid-width',
        snippet: item.snippet,
        message: item.message,
      })
    }

    const cardTitleOverrides = collectCardTitleSizeOverrides(source)
    for (const item of cardTitleOverrides) {
      const { line, col } = getLineAndCol(source, item.index)
      violations.push({
        file: relativePath,
        line,
        col,
        rule: 'card-title-size-override',
        snippet: item.snippet,
        message: item.message,
      })
    }

    const tableXsViolations = collectTableXsTypography(source)
    for (const item of tableXsViolations) {
      const { line, col } = getLineAndCol(source, item.index)
      violations.push({
        file: relativePath,
        line,
        col,
        rule: 'table-text-xs-disallowed',
        snippet: item.snippet,
        message: item.message,
      })
    }

    if (shouldScanToneMisuse(relativePath, extension, source)) {
      const toneReferences = collectToneTokenReferences(source)
      const baselineCount = Number(toneMisuseBaseline[relativePath] || 0)
      if (toneReferences.length > baselineCount) {
        const overflow = toneReferences.slice(baselineCount)
        for (const item of overflow.slice(0, 10)) {
          const { line, col } = getLineAndCol(source, item.index)
          toneMisuseViolations.push({
            file: relativePath,
            line,
            col,
            rule: 'tone-token-misuse',
            snippet: item.snippet,
            message: item.message,
          })
        }
        if (overflow.length > 10) {
          toneMisuseViolations.push({
            file: relativePath,
            line: 1,
            col: 1,
            rule: 'tone-token-misuse',
            snippet: `+${overflow.length - 10} more`,
            message: 'Additional tone-token references omitted from output.',
          })
        }
      }
    }

    if (JSX_EXTENSIONS.has(extension)) {
      const untagged = collectUntaggedIntrinsicElements(source)
      const baselineCount = Number(houseRoleBaseline[relativePath] || 0)
      if (untagged.length > baselineCount) {
        const overflow = untagged.slice(baselineCount)
        for (const item of overflow.slice(0, 10)) {
          const { line, col } = getLineAndCol(source, item.index)
          houseRoleViolations.push({
            file: relativePath,
            line,
            col,
            snippet: item.snippet,
            message:
              'Every intrinsic JSX element must be tagged (`data-house-role`, `data-house-scope`, or `data-ui`).',
          })
        }
        if (overflow.length > 10) {
          houseRoleViolations.push({
            file: relativePath,
            line: 1,
            col: 1,
            snippet: `+${overflow.length - 10} more`,
            message:
              'Additional untagged intrinsic JSX elements omitted from output.',
          })
        }
      }
    }
  }
}

if (!fs.existsSync(APP_ENTRY_FILE)) {
  violations.push({
    file: 'src/App.tsx',
    line: 1,
    col: 1,
    rule: 'missing-app-entry',
    snippet: 'src/App.tsx',
    message: 'App entry file was not found for house-role bootstrapping.',
  })
} else {
  const appSource = fs.readFileSync(APP_ENTRY_FILE, 'utf8')
  const hasInstallerImport = /from\s+['"]@\/lib\/house-element-tagging['"]/.test(appSource)
  const hasInstallerCall = /installHouseElementTagging\(\)/.test(appSource)
  if (!hasInstallerImport || !hasInstallerCall) {
    violations.push({
      file: 'src/App.tsx',
      line: 1,
      col: 1,
      rule: 'missing-house-role-bootstrap',
      snippet: 'installHouseElementTagging',
      message: 'House element auto-tagging bootstrap must be installed in App.tsx.',
    })
  }
}

if (violations.length > 0 || toneMisuseViolations.length > 0 || houseRoleViolations.length > 0) {
  const total = violations.length + toneMisuseViolations.length + houseRoleViolations.length
  console.error(`Design governance check failed with ${total} violation(s).`)
  for (const violation of violations) {
    console.error(
      `${violation.file}:${violation.line}:${violation.col} [${violation.rule}] ${violation.message} -> ${violation.snippet}`,
    )
  }
  for (const violation of toneMisuseViolations) {
    console.error(
      `${violation.file}:${violation.line}:${violation.col} [${violation.rule}] ${violation.message} -> ${violation.snippet}`,
    )
  }
  for (const violation of houseRoleViolations) {
    console.error(
      `${violation.file}:${violation.line}:${violation.col} [house-role] ${violation.message} -> ${violation.snippet}`,
    )
  }
  process.exit(1)
}

console.log('Design governance check passed.')
