import fs from 'node:fs'
import path from 'node:path'

const ROOT = process.cwd()
const TARGET_DIRS = [path.join(ROOT, 'src'), path.join(ROOT, '.storybook')]
const ALLOWED_EXTENSIONS = new Set(['.ts', '.tsx', '.js', '.jsx', '.css'])

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

const violations = []
for (const dir of TARGET_DIRS) {
  const files = listFiles(dir)
  for (const file of files) {
    const source = fs.readFileSync(file, 'utf8')
    for (const rule of RULES) {
      const matches = source.matchAll(rule.regex)
      for (const match of matches) {
        const { line, col } = getLineAndCol(source, match.index ?? 0)
        violations.push({
          file: path.relative(ROOT, file),
          line,
          col,
          rule: rule.id,
          snippet: String(match[0]),
          message: rule.message,
        })
      }
    }
  }
}

if (violations.length > 0) {
  console.error(`Design governance check failed with ${violations.length} violation(s).`)
  for (const violation of violations) {
    console.error(
      `${violation.file}:${violation.line}:${violation.col} [${violation.rule}] ${violation.message} -> ${violation.snippet}`,
    )
  }
  process.exit(1)
}

console.log('Design governance check passed.')
