import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const ROOT = path.resolve(__dirname, '..')
const SRC_DIR = path.join(ROOT, 'src')
const INDEX_CSS_PATH = path.join(SRC_DIR, 'index.css')
const BASELINE_PATH = path.join(__dirname, 'design-governance-baseline.json')
const LEGACY_BACKLOG_PATH = path.resolve(ROOT, '..', 'docs', 'design', 'MIGRATION_BACKLOG.md')
const ALLOWED_EXTENSIONS = new Set(['.ts', '.tsx', '.js', '.jsx', '.css', '.mdx'])

const CHECK_TYPES = {
  HARDCODED_DURATION: 'hardcoded-duration',
  HARDCODED_SHADOW: 'hardcoded-shadow',
  HARDCODED_RADIUS: 'hardcoded-radius',
  UNDEFINED_VARS: 'undefined-vars',
  TRANSITION_ALL: 'transition-all',
}

function toPosixPath(value) {
  return value.replace(/\\/g, '/')
}

function listFiles(dir) {
  const files = []
  if (!fs.existsSync(dir)) {
    return files
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
      files.push(...listFiles(fullPath))
      continue
    }
    if (ALLOWED_EXTENSIONS.has(path.extname(entry.name))) {
      files.push(fullPath)
    }
  }
  return files
}

function getLine(source, lineNumber) {
  const lines = source.split(/\r?\n/)
  return lines[lineNumber - 1] || ''
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

function addViolation(target, type, file, line, pattern, suggestion) {
  target.push({ type, file, line, pattern: pattern.trim(), suggestion })
}

function collectDefinedCssVariables(indexCssSource) {
  const defined = new Set()
  const definitionPattern = /--([a-z0-9-]+)\s*:/gi
  for (const match of indexCssSource.matchAll(definitionPattern)) {
    const token = String(match[1] || '').trim()
    if (token) {
      defined.add(token)
    }
  }
  return defined
}

function scanFile(filePath, definedCssVars) {
  const source = fs.readFileSync(filePath, 'utf8')
  const rel = toPosixPath(path.relative(ROOT, filePath))
  const violations = []

  const durationPattern = /\bduration-(\d{2,4})\b/g
  for (const match of source.matchAll(durationPattern)) {
    const line = lineFromIndex(source, match.index ?? 0)
    addViolation(
      violations,
      CHECK_TYPES.HARDCODED_DURATION,
      rel,
      line,
      match[0],
      'Use a motion token (e.g. duration-[var(--motion-ui)] or duration-[var(--motion-micro)]).',
    )
  }

  const shadowLiteralPattern = /box-shadow\s*:\s*0[^\n;}]*/g
  for (const match of source.matchAll(shadowLiteralPattern)) {
    const line = lineFromIndex(source, match.index ?? 0)
    addViolation(
      violations,
      CHECK_TYPES.HARDCODED_SHADOW,
      rel,
      line,
      match[0],
      'Use elevation tokens (e.g. var(--elevation-1), var(--elevation-2), var(--elevation-3)).',
    )
  }

  const shadowArbitraryPattern = /\bshadow-\[0[^\]]*\]/g
  for (const match of source.matchAll(shadowArbitraryPattern)) {
    const line = lineFromIndex(source, match.index ?? 0)
    addViolation(
      violations,
      CHECK_TYPES.HARDCODED_SHADOW,
      rel,
      line,
      match[0],
      'Use elevation tokens (e.g. shadow-[var(--elevation-2)]).',
    )
  }

  const borderRadiusPattern = /border-radius\s*:\s*(?:0\.[0-9]+(?:rem|px)|[0-9]+px)/g
  for (const match of source.matchAll(borderRadiusPattern)) {
    const line = lineFromIndex(source, match.index ?? 0)
    addViolation(
      violations,
      CHECK_TYPES.HARDCODED_RADIUS,
      rel,
      line,
      match[0],
      'Use radius tokens (e.g. var(--radius-sm), var(--radius-md)).',
    )
  }

  const roundedArbitraryPattern = /\brounded-\[(?:0\.[0-9]+(?:rem|px)|[0-9]+px)\]/g
  for (const match of source.matchAll(roundedArbitraryPattern)) {
    const line = lineFromIndex(source, match.index ?? 0)
    addViolation(
      violations,
      CHECK_TYPES.HARDCODED_RADIUS,
      rel,
      line,
      match[0],
      'Use radius tokens (e.g. rounded-[var(--radius-sm)]).',
    )
  }

  const transitionAllPattern = /\btransition-all\b/g
  for (const match of source.matchAll(transitionAllPattern)) {
    const line = lineFromIndex(source, match.index ?? 0)
    addViolation(
      violations,
      CHECK_TYPES.TRANSITION_ALL,
      rel,
      line,
      match[0],
      'Use explicit transition properties (e.g. transition-[background-color,color]).',
    )
  }

  const cssVarPattern = /var\(--([a-z0-9-]+)(?:\s*,[^\)]*)?\)/gi
  for (const match of source.matchAll(cssVarPattern)) {
    const varName = String(match[1] || '').trim()
    if (!varName || definedCssVars.has(varName)) {
      continue
    }
    const line = lineFromIndex(source, match.index ?? 0)
    addViolation(
      violations,
      CHECK_TYPES.UNDEFINED_VARS,
      rel,
      line,
      `var(--${varName})`,
      `Define --${varName} in src/index.css or replace with an existing token.`,
    )
  }

  return violations
}

function toFingerprint(violation) {
  return `${violation.type}|${violation.file}|${violation.line}|${violation.pattern}`
}

function loadBaselineFingerprints() {
  if (!fs.existsSync(BASELINE_PATH)) {
    return null
  }
  try {
    const parsed = JSON.parse(fs.readFileSync(BASELINE_PATH, 'utf8'))
    if (!parsed || !Array.isArray(parsed.fingerprints)) {
      return null
    }
    return new Set(parsed.fingerprints.map((entry) => String(entry)))
  } catch {
    return null
  }
}

function saveBaseline(violations) {
  const fingerprints = [...new Set(violations.map(toFingerprint))].sort()
  const payload = {
    generatedAt: new Date().toISOString(),
    fingerprints,
  }
  fs.writeFileSync(BASELINE_PATH, `${JSON.stringify(payload, null, 2)}\n`, 'utf8')
  return new Set(fingerprints)
}

function readLegacyBaselineCount() {
  if (!fs.existsSync(LEGACY_BACKLOG_PATH)) {
    return 26
  }
  const raw = fs.readFileSync(LEGACY_BACKLOG_PATH, 'utf8')
  const match = raw.match(/Baseline Violations:\s*(\d+)/i)
  return match ? Number(match[1]) : 26
}

function countByType(violations) {
  const counts = {
    [CHECK_TYPES.HARDCODED_DURATION]: 0,
    [CHECK_TYPES.HARDCODED_SHADOW]: 0,
    [CHECK_TYPES.HARDCODED_RADIUS]: 0,
    [CHECK_TYPES.UNDEFINED_VARS]: 0,
    [CHECK_TYPES.TRANSITION_ALL]: 0,
  }
  for (const violation of violations) {
    counts[violation.type] += 1
  }
  return counts
}

function printHeader(legacyBaselineCount) {
  const generated = new Date().toISOString().slice(0, 10)
  console.log('Design Governance Report')
  console.log('========================')
  console.log(`Generated: ${generated}`)
  console.log(`Baseline violations: ${legacyBaselineCount}`)
  console.log('')
}

function main() {
  if (!fs.existsSync(INDEX_CSS_PATH)) {
    console.error('Missing token source file: src/index.css')
    process.exit(1)
  }

  const indexCss = fs.readFileSync(INDEX_CSS_PATH, 'utf8')
  const definedCssVars = collectDefinedCssVariables(indexCss)

  const allFiles = listFiles(SRC_DIR)
  const violations = []
  for (const file of allFiles) {
    violations.push(...scanFile(file, definedCssVars))
  }

  let baseline = loadBaselineFingerprints()
  const baselineWasCreated = baseline === null
  if (!baseline) {
    baseline = saveBaseline(violations)
  }

  const newViolations = violations.filter((entry) => !baseline.has(toFingerprint(entry)))
  const counts = countByType(newViolations)
  const total = newViolations.length
  const legacyBaselineCount = readLegacyBaselineCount()

  printHeader(legacyBaselineCount)

  if (baselineWasCreated) {
    console.log(`Baseline file created: ${toPosixPath(path.relative(ROOT, BASELINE_PATH))}`)
    console.log('Current findings were frozen as baseline. Re-run governance to detect net-new violations.')
    console.log('')
  }

  if (total === 0) {
    console.log('PASS: No new violations detected')
    console.log('Violations by type:')
    console.log(`- ${CHECK_TYPES.HARDCODED_DURATION}: ${counts[CHECK_TYPES.HARDCODED_DURATION]}`)
    console.log(`- ${CHECK_TYPES.HARDCODED_SHADOW}: ${counts[CHECK_TYPES.HARDCODED_SHADOW]}`)
    console.log(`- ${CHECK_TYPES.HARDCODED_RADIUS}: ${counts[CHECK_TYPES.HARDCODED_RADIUS]}`)
    console.log(`- ${CHECK_TYPES.UNDEFINED_VARS}: ${counts[CHECK_TYPES.UNDEFINED_VARS]}`)
    console.log(`- ${CHECK_TYPES.TRANSITION_ALL}: ${counts[CHECK_TYPES.TRANSITION_ALL]}`)
    console.log('')
    console.log('Exit code: 0')
    process.exit(0)
  }

  console.log(`FAIL: ${total} violations detected`)
  console.log('Violations by type:')
  const orderedTypes = [
    CHECK_TYPES.HARDCODED_DURATION,
    CHECK_TYPES.HARDCODED_SHADOW,
    CHECK_TYPES.HARDCODED_RADIUS,
    CHECK_TYPES.UNDEFINED_VARS,
    CHECK_TYPES.TRANSITION_ALL,
  ]
  for (const type of orderedTypes) {
    const typeViolations = newViolations.filter((entry) => entry.type === type)
    console.log(`- ${type}: ${typeViolations.length}`)
    for (const violation of typeViolations) {
      const lineText = getLine(fs.readFileSync(path.join(ROOT, violation.file), 'utf8'), violation.line)
      const snippet = lineText.trim() || violation.pattern
      console.log(`  ${violation.file}:${violation.line} ${violation.pattern} -> ${violation.suggestion}`)
      console.log(`    snippet: ${snippet}`)
    }
  }
  console.log('')
  console.log('Exit code: 1')
  process.exit(1)
}

main()
