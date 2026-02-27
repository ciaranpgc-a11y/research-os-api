import fs from 'node:fs'
import path from 'node:path'

const ROOT = process.cwd()
const TARGET_DIR = path.join(ROOT, 'src')
const OUTPUT_PATH = path.join(ROOT, 'scripts', 'raw-form-controls-baseline.json')
const JSX_EXTENSIONS = new Set(['.tsx', '.jsx'])
const RAW_FORM_CONTROL_ALLOWLIST = new Set([
  'src/components/ui/textarea.tsx',
  'src/components/ui/select.tsx',
  'src/stories/design-system/primitives/Textarea.stories.tsx',
  'src/stories/design-system/primitives/SelectDropdown.stories.tsx',
])

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

function getLineAndCol(source, index) {
  const before = source.slice(0, index)
  const lines = before.split(/\r?\n/)
  return {
    line: lines.length,
    col: lines[lines.length - 1].length + 1,
  }
}

function normalizeMatchSnippet(value) {
  return String(value || '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 180)
}

function collectRawFormControls(source) {
  const controls = []
  const rawFormControlPattern = /<(textarea|select)\b[^>]*>/g
  for (const match of source.matchAll(rawFormControlPattern)) {
    controls.push({
      index: match.index ?? 0,
      tag: String(match[1] || '').toLowerCase(),
      snippet: normalizeMatchSnippet(match[0]),
    })
  }
  return controls
}

const entries = []

for (const file of listFiles(TARGET_DIR)) {
  const source = fs.readFileSync(file, 'utf8')
  const relative = path.relative(ROOT, file).replace(/\\/g, '/')
  if (RAW_FORM_CONTROL_ALLOWLIST.has(relative)) {
    continue
  }

  for (const item of collectRawFormControls(source)) {
    const { line, col } = getLineAndCol(source, item.index)
    entries.push({
      file: relative,
      line,
      col,
      tag: item.tag,
      snippet: item.snippet,
    })
  }
}

entries.sort((a, b) => {
  if (a.file !== b.file) {
    return a.file.localeCompare(b.file)
  }
  if (a.tag !== b.tag) {
    return a.tag.localeCompare(b.tag)
  }
  return a.line - b.line
})

const payload = {
  version: 1,
  entries,
}

fs.writeFileSync(OUTPUT_PATH, `${JSON.stringify(payload, null, 2)}\n`, 'utf8')
console.log(`Wrote ${OUTPUT_PATH} (${entries.length} entries)`)
