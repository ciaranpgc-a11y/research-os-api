import fs from 'node:fs'
import path from 'node:path'

const ROOT = process.cwd()
const SRC_DIR = path.join(ROOT, 'src')
const ALLOWED_EXTENSIONS = new Set(['.ts', '.tsx', '.js', '.jsx', '.css', '.mdx'])
const LEGACY_SEPARATOR_TOKENS = [
  '--separator-drilldown-title-expander-to-navigation-block',
  '--separator-drilldown-navigation-block-to-heading',
]

const ALLOWLIST = new Set([])

function toPosixPath(value) {
  return value.replace(/\\/g, '/')
}

function listFiles(dir) {
  const out = []
  if (!fs.existsSync(dir)) {
    return out
  }
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === 'node_modules' || entry.name === 'dist' || entry.name === 'storybook-static') {
      continue
    }
    const fullPath = path.join(dir, entry.name)
    if (entry.isDirectory()) {
      const relDir = toPosixPath(path.relative(ROOT, fullPath))
      if (relDir.startsWith('src/stories/__archive__') || relDir.startsWith('src/stories/_archive')) {
        continue
      }
      out.push(...listFiles(fullPath))
      continue
    }
    if (ALLOWED_EXTENSIONS.has(path.extname(entry.name))) {
      out.push(fullPath)
    }
  }
  return out
}

function lineFromIndex(source, index) {
  let line = 1
  for (let i = 0; i < index; i += 1) {
    if (source.charCodeAt(i) === 10) {
      line += 1
    }
  }
  return line
}

function buildTokenRegex(token) {
  return new RegExp(token.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g')
}

function main() {
  const files = listFiles(SRC_DIR)
  const violations = []

  for (const filePath of files) {
    const rel = toPosixPath(path.relative(ROOT, filePath))
    if (ALLOWLIST.has(rel)) {
      continue
    }
    const source = fs.readFileSync(filePath, 'utf8')
    for (const token of LEGACY_SEPARATOR_TOKENS) {
      const regex = buildTokenRegex(token)
      for (const match of source.matchAll(regex)) {
        const line = lineFromIndex(source, match.index ?? 0)
        violations.push({ file: rel, line, token })
      }
    }
  }

  if (!violations.length) {
    console.log('✅ Separator legacy guard passed: no unauthorized legacy separator token usage found.')
    return
  }

  console.error('❌ Separator legacy guard failed. Legacy separator tokens are restricted to compatibility files only.')
  if (ALLOWLIST.size) {
    console.error('Allowed files:')
    for (const allowed of ALLOWLIST) {
      console.error(`  - ${allowed}`)
    }
  } else {
    console.error('Allowed files: none')
  }
  console.error('Violations:')
  for (const violation of violations) {
    console.error(`  - ${violation.file}:${violation.line} uses ${violation.token}`)
  }
  process.exit(1)
}

main()
