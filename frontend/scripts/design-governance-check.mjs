import fs from 'node:fs'
import path from 'node:path'

const ROOT = process.cwd()
const TARGET_DIRS = [path.join(ROOT, 'src'), path.join(ROOT, '.storybook')]
const ALLOWED_EXTENSIONS = new Set(['.ts', '.tsx', '.js', '.jsx', '.css'])
const JSX_EXTENSIONS = new Set(['.tsx', '.jsx'])
const HOUSE_ROLE_BASELINE_PATH = path.join(ROOT, 'scripts', 'house-role-baseline.json')
const APP_ENTRY_FILE = path.join(ROOT, 'src', 'App.tsx')

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
]

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

function collectUntaggedIntrinsicElements(source) {
  const untagged = []
  const openingTagPattern = /<([a-z][a-z0-9-]*)(\s[^<>]*?)?(\/?)>/g
  const taggedAttrPattern = /\b(data-house-role|data-house-scope|data-ui)\s*=/

  for (const match of source.matchAll(openingTagPattern)) {
    const fullMatch = String(match[0] || '')
    const attrs = String(match[2] || '')
    const index = match.index ?? 0

    if (fullMatch.startsWith('</') || fullMatch.startsWith('<!--')) {
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

if (violations.length > 0 || houseRoleViolations.length > 0) {
  const total = violations.length + houseRoleViolations.length
  console.error(`Design governance check failed with ${total} violation(s).`)
  for (const violation of violations) {
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
