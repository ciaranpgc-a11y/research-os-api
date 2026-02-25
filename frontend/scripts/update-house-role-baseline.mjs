import fs from 'node:fs'
import path from 'node:path'

const ROOT = process.cwd()
const TARGET_DIRS = [path.join(ROOT, 'src'), path.join(ROOT, '.storybook')]
const OUTPUT_PATH = path.join(ROOT, 'scripts', 'house-role-baseline.json')
const JSX_EXTENSIONS = new Set(['.tsx', '.jsx'])

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
    if (JSX_EXTENSIONS.has(path.extname(entry.name))) {
      out.push(full)
    }
  }
  return out
}

function collectUntaggedIntrinsicElements(source) {
  const openingTagPattern = /<([a-z][a-z0-9-]*)(\s[^<>]*?)?(\/?)>/g
  const taggedAttrPattern = /\b(data-house-role|data-house-scope|data-ui)\s*=/
  let count = 0
  for (const match of source.matchAll(openingTagPattern)) {
    const fullMatch = String(match[0] || '')
    const attrs = String(match[2] || '')
    if (fullMatch.startsWith('</') || fullMatch.startsWith('<!--')) {
      continue
    }
    if (!taggedAttrPattern.test(attrs)) {
      count += 1
    }
  }
  return count
}

const baseline = {}

for (const dir of TARGET_DIRS) {
  for (const file of listFiles(dir)) {
    const source = fs.readFileSync(file, 'utf8')
    const relative = path.relative(ROOT, file).replace(/\\/g, '/')
    baseline[relative] = collectUntaggedIntrinsicElements(source)
  }
}

const ordered = Object.fromEntries(
  Object.entries(baseline).sort(([a], [b]) => a.localeCompare(b)),
)

fs.writeFileSync(OUTPUT_PATH, `${JSON.stringify(ordered, null, 2)}\n`, 'utf8')
console.log(`Wrote ${OUTPUT_PATH}`)
