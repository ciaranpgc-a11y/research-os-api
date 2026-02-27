import fs from 'node:fs'
import path from 'node:path'

const ROOT = process.cwd()
const TARGET_DIRS = [path.join(ROOT, 'src'), path.join(ROOT, '.storybook')]
const OUTPUT_PATH = path.join(ROOT, 'scripts', 'tone-misuse-baseline.json')
const SCAN_EXTENSIONS = new Set(['.ts', '.tsx', '.js', '.jsx'])
const SCAN_PREFIXES = ['src/components/', 'src/pages/', 'src/stories/', '.storybook/']
const ALLOW_DIRECTIVE = /design-governance:allow-tone/

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
    if (SCAN_EXTENSIONS.has(path.extname(entry.name))) {
      out.push(full)
    }
  }
  return out
}

function shouldScan(relativePath, source) {
  if (!SCAN_PREFIXES.some((prefix) => relativePath.startsWith(prefix))) {
    return false
  }
  if (ALLOW_DIRECTIVE.test(source)) {
    return false
  }
  if (/(^|\/)(charts?|analytics|visualizations?|visualisations?|viz)(\/|[-_.])/i.test(relativePath)) {
    return false
  }
  return true
}

function countToneRefs(source) {
  return [...source.matchAll(/(?<![A-Za-z0-9_])--tone-[a-z0-9-]+(?![A-Za-z0-9_])/gi)].length
}

const baseline = {}

for (const dir of TARGET_DIRS) {
  for (const file of listFiles(dir)) {
    const source = fs.readFileSync(file, 'utf8')
    const relative = path.relative(ROOT, file).replace(/\\/g, '/')
    if (!shouldScan(relative, source)) {
      continue
    }
    baseline[relative] = countToneRefs(source)
  }
}

const ordered = Object.fromEntries(
  Object.entries(baseline).sort(([a], [b]) => a.localeCompare(b)),
)

fs.writeFileSync(OUTPUT_PATH, `${JSON.stringify(ordered, null, 2)}\n`, 'utf8')
console.log(`Wrote ${OUTPUT_PATH}`)
