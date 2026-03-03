import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const ROOT = path.resolve(__dirname, '..')
const SRC_DIR = path.join(ROOT, 'src')
const INDEX_CSS_PATH = path.join(SRC_DIR, 'index.css')
const TAILWIND_CONFIG_PATH = path.join(ROOT, 'tailwind.config.js')
const OUTPUT_DIR = path.join(ROOT, 'reports', 'ui-fit')
const OUTPUT_MD = path.join(OUTPUT_DIR, 'ui-fit-report.md')
const OUTPUT_JSON = path.join(OUTPUT_DIR, 'ui-fit-report.json')

const ALLOWED_EXT = new Set(['.ts', '.tsx', '.js', '.jsx', '.css', '.mdx'])

const CANONICAL_COMPONENTS = new Set([
  'Container', 'Grid', 'PageHeader', 'Row', 'Section', 'SectionHeader', 'Stack',
  'Badge', 'Banner', 'BannerContent', 'BannerDescription', 'BannerTitle', 'Button',
  'IconButton', 'Input', 'Label', 'Modal', 'ModalBody', 'ModalClose', 'ModalContent',
  'ModalDescription', 'ModalFooter', 'ModalHeader', 'ModalTitle', 'ModalTrigger',
  'Select', 'Textarea', 'Tooltip', 'TooltipContent', 'TooltipProvider', 'TooltipTrigger',
  'ChartFrame', 'PanelShell', 'SectionMarker',
])

const LAYOUT_COMPONENTS = new Set(['Container', 'Section', 'Stack', 'Row', 'Grid'])
const SEMANTIC_COMPONENTS = new Set(['PageHeader', 'SectionHeader'])
const CONTROL_COMPONENTS = new Set([
  'Button', 'IconButton', 'Input', 'Select', 'Textarea', 'Tooltip', 'Badge', 'Banner', 'Modal',
])
const PATTERN_COMPONENTS = new Set(['SectionMarker', 'PanelShell', 'ChartFrame'])

function toPosix(value) {
  return value.replace(/\\/g, '/')
}

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true })
}

function listFiles(dir) {
  const files = []
  if (!fs.existsSync(dir)) {
    return files
  }
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === 'node_modules' || entry.name === 'dist' || entry.name === 'storybook-static' || entry.name === 'reports') {
      continue
    }
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) {
      const relDir = toPosix(path.relative(ROOT, full))
      if (relDir.startsWith('src/stories/__archive__') || relDir.startsWith('src/stories/_archive')) {
        continue
      }
      files.push(...listFiles(full))
      continue
    }
    if (ALLOWED_EXT.has(path.extname(entry.name))) {
      files.push(full)
    }
  }
  return files
}

function parseInputs(argv) {
  const rawItems = argv
    .map((value) => String(value || '').trim())
    .filter(Boolean)

  if (!rawItems.length) {
    return []
  }

  const parsed = []
  for (const item of rawItems) {
    if (item.includes('\n')) {
      const nested = item
        .split(/\r?\n/)
        .map((line) => line.replace(/^\s*\d+\)\s*/, '').replace(/^\s*CHECK THIS ELEMENT\s*:?-?\s*/i, '').trim())
        .filter(Boolean)
      parsed.push(...nested.map(parseInputEntry))
      continue
    }
    const cleaned = item.replace(/^\s*\d+\)\s*/, '').replace(/^\s*CHECK THIS ELEMENT\s*:?-?\s*/i, '').trim()
    parsed.push(parseInputEntry(cleaned))
  }
  return parsed.filter((entry) => entry.input)
}

function parseInputEntry(rawInput) {
  const raw = String(rawInput || '').trim()
  if (!raw) {
    return {
      raw: '',
      input: '',
      label: '',
      role: '',
      page: '',
      subtitle: '',
      location: '',
      screenshot: '',
    }
  }

  const hasStructuredPairs = /\b(label|role|page|subtitle|location|screenshot)\s*=\s*/i.test(raw)
  if (!hasStructuredPairs) {
    return {
      raw,
      input: raw,
      label: '',
      role: '',
      page: '',
      subtitle: '',
      location: '',
      screenshot: '',
    }
  }

  const fields = {
    label: '',
    role: '',
    page: '',
    subtitle: '',
    location: '',
    screenshot: '',
  }

  const pairPattern = /([a-zA-Z][a-zA-Z0-9_-]*)\s*=\s*("[^"]*"|'[^']*'|[^;]+)/g
  for (const match of raw.matchAll(pairPattern)) {
    const key = String(match[1] || '').trim().toLowerCase()
    let value = String(match[2] || '').trim()
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1)
    }
    if (Object.prototype.hasOwnProperty.call(fields, key)) {
      fields[key] = value.trim()
    }
  }

  const input = fields.label || fields.role || raw

  return {
    raw,
    input,
    ...fields,
  }
}

function collectCssVariables() {
  if (!fs.existsSync(INDEX_CSS_PATH)) {
    return new Set()
  }
  const source = fs.readFileSync(INDEX_CSS_PATH, 'utf8')
  const out = new Set()
  for (const match of source.matchAll(/--([a-z0-9-]+)\s*:/gi)) {
    const token = `--${String(match[1] || '').trim()}`
    if (token !== '--') {
      out.add(token)
    }
  }
  return out
}

function classifyInput(entry) {
  const value = entry.input.trim()
  if (!value) {
    return 'Unknown'
  }
  if (entry.label || entry.role || entry.page || entry.subtitle) {
    return 'Label'
  }
  if (value.startsWith('--')) {
    return 'Token'
  }
  if (/^[A-Z][A-Za-z0-9]+$/.test(value)) {
    return 'Component'
  }
  if (value.includes(' ')) {
    return 'Class'
  }
  if (/^(m[trblxy]?|p[trblxy]?|space-[xy]|gap|text|leading|tracking|font|rounded|shadow|border|bg)-/.test(value)) {
    return 'Utility'
  }
  if (value.includes('-')) {
    return 'Class'
  }
  return 'Unknown'
}

function inferCanonicalCandidate(entry) {
  const role = String(entry.role || '').toLowerCase()
  if (/main title|page title|h1|page heading|title|heading/.test(role)) {
    return {
      component: 'PageHeader',
      approvalsSection: 'Primitives → Semantic Blocks (PageHeader/SectionHeader)',
      reason: 'Role suggests a top-level page heading which maps to PageHeader.',
    }
  }
  if (/subtitle|description|subheading/.test(role)) {
    return {
      component: 'PageHeader',
      approvalsSection: 'Primitives → Semantic Blocks (PageHeader/SectionHeader)',
      reason: 'Role suggests descriptive copy under a heading, commonly PageHeader description.',
    }
  }
  return null
}

function approvalsSectionFor(entry, classification, canonicalCandidate) {
  const value = entry.input.trim()
  if (canonicalCandidate?.approvalsSection) {
    return canonicalCandidate.approvalsSection
  }
  if (classification === 'Token') {
    if (/^--separator-/.test(value)) {
      return 'Foundations → Spacing'
    }
    if (/^--(tone-|background|foreground|accent|primary|destructive|status|muted|card|border|ring)/.test(value)) {
      return 'Foundations → Colors'
    }
    if (/^--space-/.test(value)) {
      return 'Foundations → Spacing'
    }
    if (/^--radius-|^--elevation-/.test(value)) {
      return 'Foundations → Radius'
    }
    if (/^--motion-|^--ease-/.test(value)) {
      return 'Foundations → Motion'
    }
  }
  if (classification === 'Component') {
    if (LAYOUT_COMPONENTS.has(value)) {
      return 'Primitives → Layout (Container/Section/Stack/Row/Grid)'
    }
    if (SEMANTIC_COMPONENTS.has(value)) {
      return 'Primitives → Semantic Blocks (PageHeader/SectionHeader)'
    }
    if (CONTROL_COMPONENTS.has(value)) {
      return 'Canonical Controls (Button/Input/Select/Textarea/etc)'
    }
    if (PATTERN_COMPONENTS.has(value)) {
      return 'Patterns (PanelShell/ChartFrame/SectionMarker etc)'
    }
  }
  if (/house-|marker|panel|chart/i.test(value)) {
    return 'Patterns (PanelShell/ChartFrame/SectionMarker etc)'
  }
  if (/space-|mt-|mb-|pt-|pb-|gap-|stack|container|section|row|grid/i.test(value)) {
    return 'Primitives → Layout (Container/Section/Stack/Row/Grid)'
  }
  return 'Design System / Approvals (canonical overview)'
}

function deriveTerms(entry) {
  const value = entry.input.trim()
  if (!value) {
    return []
  }
  const terms = [value]
  const label = String(entry.label || '').trim()
  const role = String(entry.role || '').trim()
  const subtitle = String(entry.subtitle || '').trim()
  const page = String(entry.page || '').trim()

  if (label && label !== value) {
    terms.push(label)
  }
  if (subtitle) {
    terms.push(subtitle)
  }

  if (page) {
    terms.push(page)
    const pageSegments = page
      .split('/')
      .map((segment) => segment.trim())
      .filter(Boolean)
    terms.push(...pageSegments)
  }

  if (/title|heading/i.test(role)) {
    terms.push('PageHeader', 'SectionHeader', 'heading')
  }
  if (/subtitle|description/i.test(role)) {
    terms.push('description', 'PageHeader', 'SectionHeader')
  }

  const split = value.split(/\s+/).filter(Boolean)
  if (split.length > 1) {
    for (const token of split) {
      if (token.length >= 3) {
        terms.push(token)
      }
    }
  }
  return [...new Set(terms)]
}

function sourceOrigin(relPath) {
  if (relPath.startsWith('src/pages/')) {
    return 'page (frontend/src/pages/**)'
  }
  if (relPath.startsWith('src/components/layout/')) {
    return 'layout shell (frontend/src/components/layout/**)'
  }
  if (relPath.startsWith('src/components/')) {
    return 'shared component (frontend/src/components/**)'
  }
  if (relPath === 'src/index.css') {
    return 'global CSS (frontend/src/index.css)'
  }
  if (relPath === 'tailwind.config.js') {
    return 'tailwind config (frontend/tailwind.config.js)'
  }
  return 'other source file'
}

function findMatches(entry, files) {
  const terms = deriveTerms(entry)
  if (!terms.length) {
    return []
  }
  const lowerTerms = terms.map((term) => term.toLowerCase())
  const pageHint = String(entry.page || '').toLowerCase().replace(/^\//, '')
  const roleHint = String(entry.role || '').toLowerCase()
  const results = []

  for (const filePath of files) {
    const source = fs.readFileSync(filePath, 'utf8')
    const lines = source.split(/\r?\n/)
    const lineMatches = []
    let score = 0

    for (let index = 0; index < lines.length; index += 1) {
      const line = lines[index]
      const lowerLine = line.toLowerCase()
      const matched = lowerTerms.filter((term) => lowerLine.includes(term))
      if (!matched.length) {
        continue
      }
      score += matched.length
      if (roleHint && /title|heading/.test(roleHint) && /(pageheader|sectionheader|heading|<h1|<h2)/i.test(line)) {
        score += 2
      }
      lineMatches.push({
        line: index + 1,
        snippet: line.trim(),
        matched,
      })
      if (lineMatches.length >= 4) {
        break
      }
    }

    if (!lineMatches.length) {
      continue
    }

    const relPath = toPosix(path.relative(ROOT, filePath))
    if (pageHint && relPath.toLowerCase().includes(pageHint)) {
      score += 3
    }
    results.push({
      file: relPath,
      origin: sourceOrigin(relPath),
      score,
      matches: lineMatches,
    })
  }

  return results
    .sort((left, right) => right.score - left.score)
    .slice(0, 5)
}

function determineStatus(input, classification, cssVars) {
  const value = input.input.trim()

  if (classification === 'Label') {
    const candidate = inferCanonicalCandidate(input)
    if (candidate) {
      return {
        approvedStatus: '✅ Approved (canonical)',
        why: `${candidate.reason} Validate exact composition in Design System / Approvals.`,
      }
    }
    return {
      approvedStatus: '🟡 Allowed temporarily (needs migration)',
      why: 'This is a text-level label without a direct class/token/component identifier; use role/page hints to map to canonical components.',
    }
  }

  if (classification === 'Component') {
    if (CANONICAL_COMPONENTS.has(value)) {
      return {
        approvedStatus: '✅ Approved (canonical)',
        why: 'This component is part of the approved canonical primitives/ui/patterns surface.',
      }
    }
    return {
      approvedStatus: '🟡 Allowed temporarily (needs migration)',
      why: 'This component name is not in the canonical approval list; verify if it is legacy or local-only.',
    }
  }

  if (classification === 'Token') {
    if (!cssVars.has(value)) {
      return {
        approvedStatus: '❌ Not approved (drift / legacy)',
        why: 'This token is not defined in frontend/src/index.css, so it is likely drift or a typo.',
      }
    }
    if (/^--separator-|^--layout-|^--header-/.test(value)) {
      return {
        approvedStatus: '🟡 Allowed temporarily (needs migration)',
        why: 'This is a legacy layout/separator token pattern; move toward Stack/Section spacing recipes where possible.',
      }
    }
    return {
      approvedStatus: '✅ Approved (canonical)',
      why: 'This token is defined in frontend/src/index.css and fits canonical token categories.',
    }
  }

  if (classification === 'Utility') {
    return {
      approvedStatus: '❌ Not approved (drift / legacy)',
      why: 'Utility rhythm classes should be replaced by approved primitive composition (Stack/Section) in canonical UI.',
    }
  }

  if (/house-/.test(value)) {
    return {
      approvedStatus: '🟡 Allowed temporarily (needs migration)',
      why: 'This house-* class indicates a legacy/custom layer that should migrate toward canonical primitives and patterns.',
    }
  }

  if (classification === 'Class') {
    return {
      approvedStatus: '🟡 Allowed temporarily (needs migration)',
      why: 'Class-based styling may be valid now, but canonical approvals prefer primitive and pattern composition.',
    }
  }

  return {
    approvedStatus: '❌ Not approved (drift / legacy)',
    why: 'Unable to confidently map this item to canonical approved primitives/tokens/components.',
  }
}

function recommendedReplacement(input, classification) {
  const value = input.input.trim()
  const candidate = inferCanonicalCandidate(input)

  if (classification === 'Label' && candidate?.component) {
    return {
      replacement: `Map this UI text to ${candidate.component} semantic composition in the canonical approvals story.`,
      snippet: `<PageHeader heading="${input.label || input.input}" description="${input.subtitle || 'Descriptive helper copy'}" />`,
      scope: 'Fix in this page only',
    }
  }
  if (/^--separator-/.test(value)) {
    return {
      replacement: 'Replace separator token dependence with Section + Stack spacing tokens (e.g., --space-3/--space-4).',
      snippet: `<Section surface="card" inset="md" spaceY="sm">\n  <Stack space="md">...</Stack>\n</Section>`,
      scope: 'Fix in global CSS / tokens',
    }
  }
  if (/\b(space-y-|mt-|mb-|pt-|pb-|gap-)\b/.test(value) || classification === 'Utility') {
    return {
      replacement: 'Use Stack/Section recipe for rhythm instead of utility spacing classes.',
      snippet: `<Section surface="card" inset="md" spaceY="sm">\n  <Stack space="md">\n    <SectionHeader heading="Title" />\n    <div>Content</div>\n  </Stack>\n</Section>`,
      scope: 'Fix in this page only',
    }
  }
  if (/house-.*block|house-main|house-nav/i.test(value)) {
    return {
      replacement: 'Migrate house-* layout block to Container → Section → Stack composition.',
      snippet: `<Container size="wide" gutter="default">\n  <Section surface="card" inset="lg" spaceY="md">\n    <Stack space="md">...</Stack>\n  </Section>\n</Container>`,
      scope: 'Fix in shared component',
    }
  }
  if (classification === 'Component' && CANONICAL_COMPONENTS.has(value)) {
    return {
      replacement: `Keep ${value}; verify composition against Design System / Approvals as place of truth.`,
      snippet: '',
      scope: 'Fix in this page only',
    }
  }
  return {
    replacement: 'Replace with canonical primitives/ui/patterns barrel components and tokenized spacing recipes.',
    snippet: '',
    scope: 'Fix in shared component',
  }
}

function sectionMarkdown(result) {
  const {
    input,
    rawInput,
    classification,
    approvedStatus,
    why,
    approvalsSection,
    recommendedReplacement,
    snippet,
    scopeSuggestion,
    sources,
    confidence,
    detectedCanonical,
    context,
  } = result

  const sourceText = sources.length
    ? sources.map((source) => {
      const lines = source.matches
        .map((match) => `  - ${source.file}:${match.line} → ${match.snippet || '(blank line)'}`)
        .join('\n')
      return `- ${source.file} (${source.origin})\n${lines}`
    }).join('\n')
    : '- No direct matches found in scanned frontend source files.'

  const snippetBlock = snippet
    ? ['Suggested snippet:', '', '```tsx', snippet, '```', ''].join('\n')
    : ''

  return [
    `## ${input}`,
    '',
    rawInput && rawInput !== input ? `Input detail: ${rawInput}` : '',
    context ? `Context hint: ${context}` : '',
    detectedCanonical ? `Detected canonical mapping: ${detectedCanonical}` : '',
    `Confidence: ${confidence}`,
    '',
    `**A) What it is**`,
    `- ${classification}`,
    '',
    `**B) Where it comes from in the code**`,
    sourceText,
    '',
    `**C) Approved status**`,
    `- ${approvedStatus}`,
    '',
    `**D) Why**`,
    `- ${why}`,
    '',
    `**E) Where to check it in Storybook**`,
    `- Design System / Approvals → ${approvalsSection}`,
    '',
    `**F) What it should become (recommended replacement)**`,
    `- ${recommendedReplacement}`,
    snippetBlock,
    '',
    `**G) Scope suggestion**`,
    `- ${scopeSuggestion}`,
    '',
  ].join('\n')
}

function buildMarkdown(inputs, results) {
  const summaryRows = results.map((result) => `| ${result.input} | ${result.approvedStatus} | ${result.confidence} | ${result.recommendedReplacement} |`)
  const details = results.map((result) => sectionMarkdown(result)).join('\n')
  const priority = [...results].sort((left, right) => {
    const rank = (status) => {
      if (status.startsWith('❌')) return 0
      if (status.startsWith('🟡')) return 1
      return 2
    }
    return rank(left.approvedStatus) - rank(right.approvedStatus)
  })

  const nextActions = priority.map((result) => `- [ ] ${result.input}: ${result.scopeSuggestion.toLowerCase()} → ${result.recommendedReplacement}`)

  return [
    '# UI Fit Check Report',
    '',
    'This report maps inspected UI elements to the approved Design System. The place of truth for replacements is **Design System / Approvals** in Storybook.',
    '',
    '## Summary',
    '',
    '| Input | Approved status | Confidence | Recommended replacement |',
    '|---|---|---|---|',
    ...summaryRows,
    '',
    '## Detailed results',
    '',
    details,
    '## Next actions (most efficient first)',
    '',
    ...nextActions,
    '',
  ].join('\n')
}

function main() {
  const inputs = parseInputs(process.argv.slice(2))
  if (!inputs.length) {
    console.error('Usage: npm run ui:fit -- "<element1>" "<element2>" ...')
    process.exit(1)
  }

  const files = listFiles(SRC_DIR)
  if (fs.existsSync(TAILWIND_CONFIG_PATH)) {
    files.push(TAILWIND_CONFIG_PATH)
  }
  const cssVars = collectCssVariables()

  const results = inputs.map((inputEntry) => {
    const classification = classifyInput(inputEntry)
    const sources = findMatches(inputEntry, files)
    const { approvedStatus, why } = determineStatus(inputEntry, classification, cssVars)
    const canonicalCandidate = inferCanonicalCandidate(inputEntry)
    const approvalsSection = approvalsSectionFor(inputEntry, classification, canonicalCandidate)
    const replacement = recommendedReplacement(inputEntry, classification)
    const topScore = sources[0]?.score || 0
    const confidence = topScore >= 8 ? 'High' : topScore >= 4 ? 'Medium' : 'Low'

    return {
      input: inputEntry.input,
      rawInput: inputEntry.raw,
      classification,
      approvedStatus,
      why,
      sources,
      approvalsSection,
      recommendedReplacement: replacement.replacement,
      snippet: replacement.snippet,
      scopeSuggestion: replacement.scope,
      confidence,
      detectedCanonical: canonicalCandidate?.component || '',
      context: inputEntry.role ? `role=${inputEntry.role}${inputEntry.page ? `; page=${inputEntry.page}` : ''}` : (inputEntry.page ? `page=${inputEntry.page}` : ''),
    }
  })

  ensureDir(OUTPUT_DIR)
  const markdown = buildMarkdown(inputs, results)
  fs.writeFileSync(OUTPUT_MD, markdown, 'utf8')
  fs.writeFileSync(OUTPUT_JSON, `${JSON.stringify({ generatedAt: new Date().toISOString(), results }, null, 2)}\n`, 'utf8')

  console.log('UI Fit report generated:')
  console.log(`- ${toPosix(path.relative(ROOT, OUTPUT_MD))}`)
  console.log(`- ${toPosix(path.relative(ROOT, OUTPUT_JSON))}`)
}

main()
