#!/usr/bin/env node

import fs from 'node:fs'
import path from 'node:path'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'

const require = createRequire(import.meta.url)

const repoRoot = process.cwd()
const frontendRoot = path.join(repoRoot, 'frontend')
const srcRoot = path.join(frontendRoot, 'src')
const storybookRoot = path.join(frontendRoot, '.storybook')
const outputPath = path.join(repoRoot, 'docs', 'design', 'ELEMENT_INVENTORY_STATIC.md')

let ts
try {
  ts = require(path.join(frontendRoot, 'node_modules', 'typescript', 'lib', 'typescript.js'))
} catch {
  ts = require('typescript')
}

const SCRIPT_REL = toPosix(path.relative(repoRoot, fileURLToPath(import.meta.url)))

function toPosix(value) {
  return value.split(path.sep).join('/')
}

function relFromRepo(absPath) {
  return toPosix(path.relative(repoRoot, absPath))
}

function relFromFrontend(absPath) {
  return toPosix(path.relative(frontendRoot, absPath))
}

function fileExists(filePath) {
  try {
    return fs.statSync(filePath).isFile()
  } catch {
    return false
  }
}

function walkFiles(rootDir, extensions) {
  if (!fs.existsSync(rootDir)) {
    return []
  }
  const results = []
  const stack = [rootDir]
  while (stack.length) {
    const current = stack.pop()
    const entries = fs.readdirSync(current, { withFileTypes: true })
    for (const entry of entries) {
      const abs = path.join(current, entry.name)
      if (entry.isDirectory()) {
        if (entry.name === 'node_modules' || entry.name === 'dist' || entry.name === 'storybook-static') {
          continue
        }
        stack.push(abs)
      } else if (entry.isFile()) {
        if (extensions.includes(path.extname(entry.name))) {
          results.push(abs)
        }
      }
    }
  }
  return results.sort((a, b) => a.localeCompare(b))
}

function resolveLocalModule(specifier, importerFile) {
  let base
  if (specifier.startsWith('@/')) {
    base = path.join(srcRoot, specifier.slice(2))
  } else if (specifier.startsWith('./') || specifier.startsWith('../')) {
    base = path.resolve(path.dirname(importerFile), specifier)
  } else {
    return null
  }

  const ext = path.extname(base)
  const candidates = ext
    ? [base]
    : [
      base,
      `${base}.ts`,
      `${base}.tsx`,
      `${base}.js`,
      `${base}.jsx`,
      `${base}.mjs`,
      path.join(base, 'index.ts'),
      path.join(base, 'index.tsx'),
      path.join(base, 'index.js'),
      path.join(base, 'index.jsx'),
      path.join(base, 'index.mjs'),
    ]

  for (const candidate of candidates) {
    if (fileExists(candidate)) {
      return path.normalize(candidate)
    }
  }
  return null
}

function isPascalCase(name) {
  return /^[A-Z][A-Za-z0-9]*$/.test(name)
}

function containsJsx(node) {
  if (!node) {
    return false
  }
  let found = false
  const visit = (current) => {
    if (found || !current) {
      return
    }
    if (
      ts.isJsxElement(current)
      || ts.isJsxSelfClosingElement(current)
      || ts.isJsxFragment(current)
    ) {
      found = true
      return
    }
    ts.forEachChild(current, visit)
  }
  visit(node)
  return found
}

function unwrapExpression(expression) {
  if (!expression) {
    return expression
  }
  if (ts.isParenthesizedExpression(expression) || ts.isAsExpression(expression)) {
    return unwrapExpression(expression.expression)
  }
  if (ts.isTypeAssertionExpression(expression)) {
    return unwrapExpression(expression.expression)
  }
  if (expression.kind === ts.SyntaxKind.SatisfiesExpression && expression.expression) {
    return unwrapExpression(expression.expression)
  }
  return expression
}

function isComponentInitializer(initializer) {
  if (!initializer) {
    return false
  }
  const node = unwrapExpression(initializer)
  if (!node) {
    return false
  }
  if (ts.isArrowFunction(node) || ts.isFunctionExpression(node)) {
    return containsJsx(node.body)
  }
  if (ts.isCallExpression(node)) {
    const exprText = node.expression.getText()
    if (/forwardRef$/.test(exprText) || /memo$/.test(exprText)) {
      for (const arg of node.arguments) {
        if ((ts.isArrowFunction(arg) || ts.isFunctionExpression(arg)) && containsJsx(arg.body)) {
          return true
        }
      }
    }
    return containsJsx(node)
  }
  return false
}

function readSource(filePath) {
  const text = fs.readFileSync(filePath, 'utf8')
  const sf = ts.createSourceFile(filePath, text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX)
  return { text, sf }
}

function getExportNames(sourceFile) {
  const named = new Set()
  const namespaceExports = []
  let defaultIdentifier = null
  let anonymousDefaultExpression = null

  for (const stmt of sourceFile.statements) {
    if (ts.isExportDeclaration(stmt) && !stmt.moduleSpecifier && stmt.exportClause && ts.isNamedExports(stmt.exportClause)) {
      for (const element of stmt.exportClause.elements) {
        const localName = element.propertyName ? element.propertyName.text : element.name.text
        named.add(localName)
      }
    }
    if (ts.isExportDeclaration(stmt) && stmt.moduleSpecifier && stmt.exportClause && ts.isNamespaceExport(stmt.exportClause)) {
      namespaceExports.push(stmt.exportClause.name.text)
    }
    if (ts.isExportAssignment(stmt) && !stmt.isExportEquals) {
      const expr = unwrapExpression(stmt.expression)
      if (expr && ts.isIdentifier(expr)) {
        defaultIdentifier = expr.text
      } else {
        anonymousDefaultExpression = expr
      }
    }
  }

  return { named, defaultIdentifier, anonymousDefaultExpression, namespaceExports }
}

function parseImportEdges(filePath, sourceFile) {
  const edges = []
  for (const stmt of sourceFile.statements) {
    if (!ts.isImportDeclaration(stmt)) {
      continue
    }
    if (!stmt.moduleSpecifier || !ts.isStringLiteral(stmt.moduleSpecifier)) {
      continue
    }
    const specifier = stmt.moduleSpecifier.text
    const target = resolveLocalModule(specifier, filePath)
    if (!target) {
      continue
    }

    const clause = stmt.importClause
    if (!clause) {
      continue
    }

    if (clause.name) {
      edges.push({
        importer: filePath,
        target,
        kind: 'default',
        importedName: 'default',
        localName: clause.name.text,
      })
    }

    if (clause.namedBindings) {
      if (ts.isNamespaceImport(clause.namedBindings)) {
        edges.push({
          importer: filePath,
          target,
          kind: 'namespace',
          importedName: '*',
          localName: clause.namedBindings.name.text,
        })
      } else if (ts.isNamedImports(clause.namedBindings)) {
        for (const element of clause.namedBindings.elements) {
          edges.push({
            importer: filePath,
            target,
            kind: 'named',
            importedName: element.propertyName ? element.propertyName.text : element.name.text,
            localName: element.name.text,
          })
        }
      }
    }
  }
  return edges
}

function detectFileStylingMethods(text) {
  const methods = []
  if (/\.module\.css['"]/.test(text) || /\.module\.css["']/.test(text)) {
    methods.push('css module')
  }
  if (/from\s+['"]styled-components['"]/.test(text) || /from\s+['"]@emotion\/styled['"]/.test(text) || /\bstyled\(/.test(text)) {
    methods.push('styled')
  }
  if (/\bclassName\s*=/.test(text) || /\bclassName:\s*/.test(text)) {
    methods.push('tailwind')
  }
  if (/\bstyle=\{\{/.test(text)) {
    methods.push('inline')
  }
  return methods.length ? methods : ['unknown']
}

function detectFileMotionUsage(text) {
  const usage = []
  if (/framer-motion|AnimatePresence|\bmotion\./.test(text)) {
    usage.push('framer-motion')
  }
  if (
    /transitionDuration|transitionTimingFunction|transitionDelay|lineTrackTransition/.test(text)
    || /\bhouse-motion\b|\bhouse-toggle\b|\bhouse-chart-scale\b|\bhouse-label-transition\b/.test(text)
    || /\bstyle=\{\{[^}]*transition/.test(text)
  ) {
    usage.push('CSS transitions')
  }
  if (/transition-[A-Za-z0-9_:[\]-]+|duration-[A-Za-z0-9_:[\]-]+|ease-[A-Za-z0-9_:[\]-]+|animate-[A-Za-z0-9_:[\]-]+/.test(text)) {
    usage.push('tailwind transition utilities')
  }
  return usage.length ? usage : ['none detected']
}

function inferCategory(fileRel, name) {
  if (fileRel.startsWith('frontend/src/pages/')) {
    return 'Page'
  }
  if (fileRel.startsWith('frontend/src/components/ui/')) {
    return 'Primitive'
  }
  if (fileRel.startsWith('frontend/src/components/layout/')) {
    return 'Layout'
  }
  if (
    /(Chart|Trend|Trajectory|Donut|Ring|Bars|MiniLine|MiniBars|MiniPairedBars|MiniProgressRing|Spark)/.test(name)
    || (fileRel.includes('/components/publications/') && /(Momentum|HIndex|FieldPercentile|ImpactConcentration|AuthorshipStructure|CollaborationStructure|Influential)/.test(name))
  ) {
    return 'Chart'
  }
  return 'Composite'
}

function pascalFromFilename(filePath) {
  const base = path.basename(filePath).replace(/\.[^.]+$/, '')
  return base
    .split(/[^A-Za-z0-9]/)
    .filter(Boolean)
    .map((token) => `${token.slice(0, 1).toUpperCase()}${token.slice(1)}`)
    .join('')
}

function collectComponents(filePath, sourceFile, fileText) {
  const { named, defaultIdentifier, anonymousDefaultExpression } = getExportNames(sourceFile)
  const found = []
  const seen = new Set()

  const addComponent = (name, node, kind, declFlags) => {
    if (!name || !isPascalCase(name)) {
      return
    }
    const posKey = `${name}:${node.pos}:${node.end}`
    if (seen.has(posKey)) {
      return
    }
    seen.add(posKey)

    const isDefault = Boolean(declFlags.isDefault || name === defaultIdentifier)
    const isNamed = Boolean(declFlags.isNamed || named.has(name))
    let exportType = 'internal'
    if (isDefault && isNamed) {
      exportType = 'default+named'
    } else if (isDefault) {
      exportType = 'default'
    } else if (isNamed) {
      exportType = 'named'
    }

    found.push({
      id: `${filePath}::${name}`,
      name,
      filePath,
      exportType,
      declarationKind: kind,
    })
  }

  const visit = (node) => {
    if (ts.isFunctionDeclaration(node) && node.name && isPascalCase(node.name.text) && node.body && containsJsx(node.body)) {
      const hasDefault = Boolean(node.modifiers?.some((m) => m.kind === ts.SyntaxKind.DefaultKeyword))
      const hasExport = Boolean(node.modifiers?.some((m) => m.kind === ts.SyntaxKind.ExportKeyword))
      addComponent(node.name.text, node, 'function', {
        isDefault: hasDefault,
        isNamed: hasExport && !hasDefault,
      })
    }

    if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && isPascalCase(node.name.text) && isComponentInitializer(node.initializer)) {
      const statement = node.parent?.parent
      const hasDefault = Boolean(statement?.modifiers?.some?.((m) => m.kind === ts.SyntaxKind.DefaultKeyword))
      const hasExport = Boolean(statement?.modifiers?.some?.((m) => m.kind === ts.SyntaxKind.ExportKeyword))
      addComponent(node.name.text, node, 'variable', {
        isDefault: hasDefault,
        isNamed: hasExport && !hasDefault,
      })
    }

    if (ts.isClassDeclaration(node) && node.name && isPascalCase(node.name.text)) {
      const renderMethod = node.members.find((member) => ts.isMethodDeclaration(member) && member.name && member.name.getText() === 'render')
      if (renderMethod && containsJsx(renderMethod)) {
        const hasDefault = Boolean(node.modifiers?.some((m) => m.kind === ts.SyntaxKind.DefaultKeyword))
        const hasExport = Boolean(node.modifiers?.some((m) => m.kind === ts.SyntaxKind.ExportKeyword))
        addComponent(node.name.text, node, 'class', {
          isDefault: hasDefault,
          isNamed: hasExport && !hasDefault,
        })
      }
    }

    ts.forEachChild(node, visit)
  }

  visit(sourceFile)

  if (anonymousDefaultExpression && isComponentInitializer(anonymousDefaultExpression)) {
    const inferredName = pascalFromFilename(filePath) || 'DefaultExportComponent'
    addComponent(inferredName, anonymousDefaultExpression, 'anonymous-default', {
      isDefault: true,
      isNamed: false,
    })
  }

  const fileRel = relFromRepo(filePath)
  const stylingMethods = detectFileStylingMethods(fileText)
  const motionUsage = detectFileMotionUsage(fileText)
  for (const component of found) {
    component.fileRel = fileRel
    component.stylingMethods = stylingMethods
    component.motionUsage = motionUsage
    component.category = inferCategory(fileRel, component.name)
  }

  return found
}

function collectStoryCoverage(storyFilePath, sourceFile, importEdges) {
  const text = fs.readFileSync(storyFilePath, 'utf8')
  const importByLocal = new Map()

  for (const edge of importEdges) {
    if (edge.importer !== storyFilePath) {
      continue
    }
    importByLocal.set(edge.localName, edge)
  }

  let title = null
  let componentLocalRef = null

  const metaObjects = new Map()
  for (const stmt of sourceFile.statements) {
    if (ts.isVariableStatement(stmt)) {
      for (const decl of stmt.declarationList.declarations) {
        if (!ts.isIdentifier(decl.name) || !decl.initializer) {
          continue
        }
        const init = unwrapExpression(decl.initializer)
        if (init && ts.isObjectLiteralExpression(init)) {
          metaObjects.set(decl.name.text, init)
        }
      }
    }
  }

  const parseMetaObject = (obj) => {
    for (const prop of obj.properties) {
      if (!ts.isPropertyAssignment(prop) || !ts.isIdentifier(prop.name)) {
        continue
      }
      const key = prop.name.text
      if (key === 'title' && ts.isStringLiteralLike(prop.initializer)) {
        title = prop.initializer.text
      }
      if (key === 'component' && ts.isIdentifier(prop.initializer)) {
        componentLocalRef = prop.initializer.text
      }
    }
  }

  for (const stmt of sourceFile.statements) {
    if (ts.isExportAssignment(stmt) && !stmt.isExportEquals) {
      const expr = unwrapExpression(stmt.expression)
      if (expr && ts.isObjectLiteralExpression(expr)) {
        parseMetaObject(expr)
      } else if (expr && ts.isIdentifier(expr) && metaObjects.has(expr.text)) {
        parseMetaObject(metaObjects.get(expr.text))
      }
    }
  }

  const localNamesInJsx = new Set()
  const visit = (node) => {
    if (ts.isJsxSelfClosingElement(node) || ts.isJsxOpeningElement(node)) {
      const tag = node.tagName
      if (ts.isIdentifier(tag)) {
        localNamesInJsx.add(tag.text)
      } else if (ts.isPropertyAccessExpression(tag) && ts.isIdentifier(tag.expression)) {
        localNamesInJsx.add(tag.expression.text)
      }
    }
    ts.forEachChild(node, visit)
  }
  visit(sourceFile)

  if (componentLocalRef) {
    localNamesInJsx.add(componentLocalRef)
  }

  const coveredImports = []
  for (const localName of [...localNamesInJsx]) {
    if (importByLocal.has(localName)) {
      coveredImports.push(importByLocal.get(localName))
    }
  }

  return {
    storyFilePath,
    storyFileRel: relFromRepo(storyFilePath),
    title: title || 'unknown',
    coveredImports,
    text,
  }
}

function markdownEscape(value) {
  return String(value).replace(/\|/g, '\\|')
}

function formatList(items, empty = 'unknown') {
  if (!items || items.length === 0) {
    return empty
  }
  return items.join('<br/>')
}

const moduleFiles = [
  ...walkFiles(srcRoot, ['.ts', '.tsx']),
  ...walkFiles(storybookRoot, ['.ts', '.tsx']),
].sort((a, b) => a.localeCompare(b))

const sourceByFile = new Map()
for (const filePath of moduleFiles) {
  sourceByFile.set(filePath, readSource(filePath))
}

const importEdges = []
for (const [filePath, { sf }] of sourceByFile.entries()) {
  importEdges.push(...parseImportEdges(filePath, sf))
}

const tsxFiles = walkFiles(srcRoot, ['.tsx'])
const components = []
for (const filePath of tsxFiles) {
  const source = sourceByFile.get(filePath)
  if (!source) {
    continue
  }
  components.push(...collectComponents(filePath, source.sf, source.text))
}

const componentsByFile = new Map()
for (const component of components) {
  if (!componentsByFile.has(component.filePath)) {
    componentsByFile.set(component.filePath, [])
  }
  componentsByFile.get(component.filePath).push(component)
}

for (const component of components) {
  if (component.exportType === 'internal') {
    component.usedBy = ['n/a (internal component)']
    continue
  }

  const users = new Set()

  if (component.exportType.includes('default')) {
    for (const edge of importEdges) {
      if (edge.target === component.filePath && edge.kind === 'default') {
        users.add(relFromRepo(edge.importer))
      }
    }
  }

  if (component.exportType.includes('named')) {
    for (const edge of importEdges) {
      if (edge.target === component.filePath && edge.kind === 'named' && edge.importedName === component.name) {
        users.add(relFromRepo(edge.importer))
      }
      if (edge.target === component.filePath && edge.kind === 'namespace') {
        const importerSource = sourceByFile.get(edge.importer)
        if (importerSource && new RegExp(`\\b${edge.localName}\\.${component.name}\\b`).test(importerSource.text)) {
          users.add(relFromRepo(edge.importer))
        }
      }
    }
  }

  component.usedBy = users.size ? [...users].sort((a, b) => a.localeCompare(b)) : ['unknown']
}

components.sort((a, b) => {
  if (a.fileRel !== b.fileRel) {
    return a.fileRel.localeCompare(b.fileRel)
  }
  return a.name.localeCompare(b.name)
})

const storyFiles = walkFiles(srcRoot, ['.tsx']).filter((filePath) => filePath.endsWith('.stories.tsx'))
const stories = []
for (const storyFile of storyFiles) {
  const source = sourceByFile.get(storyFile)
  if (!source) {
    continue
  }
  stories.push(collectStoryCoverage(storyFile, source.sf, importEdges))
}

const componentById = new Map(components.map((component) => [component.id, component]))
const storyCoverageByComponentId = new Map()

for (const story of stories) {
  const coveredComponentRefs = []
  for (const imp of story.coveredImports) {
    if (imp.kind === 'named') {
      const id = `${imp.target}::${imp.importedName}`
      if (componentById.has(id)) {
        coveredComponentRefs.push(id)
      }
    } else if (imp.kind === 'default') {
      const targetComponents = componentsByFile.get(imp.target) || []
      for (const component of targetComponents) {
        if (component.exportType.includes('default')) {
          coveredComponentRefs.push(component.id)
        }
      }
    } else if (imp.kind === 'namespace') {
      // Namespace usage requires explicit member match; not resolved in story map.
    }
  }

  story.coveredComponentIds = [...new Set(coveredComponentRefs)].sort((a, b) => a.localeCompare(b))
  story.coveredComponents = story.coveredComponentIds
    .map((id) => componentById.get(id))
    .filter(Boolean)
    .map((component) => `${component.name} (${component.fileRel})`)

  for (const compId of story.coveredComponentIds) {
    if (!storyCoverageByComponentId.has(compId)) {
      storyCoverageByComponentId.set(compId, [])
    }
    storyCoverageByComponentId.get(compId).push(story.storyFileRel)
  }
}

stories.sort((a, b) => a.storyFileRel.localeCompare(b.storyFileRel))

const sharedUtilities = [
  {
    utility: 'Global token variables and house classes',
    file: 'frontend/src/index.css',
    type: 'Tokens + global styling contract',
    notes: 'Defines color/type/radius/motion CSS vars and `.house-*` classes including chart motion keyframes.',
  },
  {
    utility: 'Tailwind token bridge',
    file: 'frontend/tailwind.config.js',
    type: 'Tokens mapping',
    notes: 'Maps Tailwind theme (colors, spacing, type, radius, transitionDuration) to CSS variables.',
  },
  {
    utility: 'Semantic house style map',
    file: 'frontend/src/lib/house-style.ts',
    type: 'Token helper',
    notes: 'Exports semantic class maps (`houseTypography`, `houseSurfaces`, `houseMotion`, etc.).',
  },
  {
    utility: 'Publications semantic style map',
    file: 'frontend/src/components/publications/publications-house-style.ts',
    type: 'Token helper',
    notes: 'Publications-specific aliases over shared house style maps.',
  },
  {
    utility: 'Classname utility',
    file: 'frontend/src/lib/utils.ts',
    type: 'Class helper',
    notes: 'Provides shared class merge helper (`cn`).',
  },
  {
    utility: 'Element tagging helper',
    file: 'frontend/src/lib/house-element-tagging.ts',
    type: 'Class/DOM helper',
    notes: 'Shared tagging helper for house element metadata.',
  },
  {
    utility: 'Theme store',
    file: 'frontend/src/store/use-aawe-store.ts',
    type: 'Theme provider/state',
    notes: 'Holds current UI theme and theme setter used by app + Storybook.',
  },
  {
    utility: 'Storybook theme bridge/providers',
    file: 'frontend/.storybook/preview.ts',
    type: 'Theme provider',
    notes: 'Defines `ThemeBridge`, `StorybookThemeSync`, and `AppProviders` wrappers.',
  },
  {
    utility: 'Chart motion hook: useUnifiedToggleBarAnimation',
    file: 'frontend/src/components/publications/PublicationsTopStrip.tsx',
    type: 'Motion helper',
    notes: 'Shared refresh/toggle gate hook for chart bar expansion.',
  },
  {
    utility: 'Chart motion hook: useHouseBarSetTransition',
    file: 'frontend/src/components/publications/PublicationsTopStrip.tsx',
    type: 'Motion helper',
    notes: 'Handles structure changes when bar count changes.',
  },
  {
    utility: 'Chart motion hook: useQueuedSlotChartTransition',
    file: 'frontend/src/components/publications/PublicationsTopStrip.tsx',
    type: 'Motion helper',
    notes: 'Queues slot-based chart transitions for same-count toggle charts.',
  },
  {
    utility: 'Chart motion hooks: useEasedSeriesByKey / useEasedSeries / useEasedValue',
    file: 'frontend/src/components/publications/PublicationsTopStrip.tsx',
    type: 'Motion helper',
    notes: 'Interpolates values and axis scales over chart motion durations.',
  },
]

const totalByCategory = new Map()
for (const component of components) {
  totalByCategory.set(component.category, (totalByCategory.get(component.category) || 0) + 1)
}

const exportedComponents = components.filter((component) => component.exportType !== 'internal')
const coverageGaps = exportedComponents.filter((component) => !storyCoverageByComponentId.has(component.id))

const lines = []
lines.push('# ELEMENT INVENTORY (STATIC)')
lines.push('')
lines.push('Generated by AST/static analysis script (`TypeScript compiler API`) with import-graph + heuristic enrichment for styling/motion.')
lines.push('')
lines.push(`- Script: \`${SCRIPT_REL}\``)
lines.push(`- Generated at: \`${new Date().toISOString()}\``)
lines.push(`- Component source scope: \`frontend/src/**/*.tsx\``)
lines.push(`- Story scope: \`frontend/src/**/*.stories.tsx\``)
lines.push('')
lines.push('## Method')
lines.push('')
lines.push('1. Parsed TS/TSX files using TypeScript AST.')
lines.push('2. Enumerated PascalCase React component declarations (function/variable/class with JSX return).')
lines.push('3. Resolved local import graph (`@/` alias + relative paths) for usage mapping.')
lines.push('4. Classified styling and motion usage per component file using static heuristics.')
lines.push('5. Linked stories to components using Storybook meta component refs + JSX imported symbol usage.')
lines.push('6. Marked unresolved import usage as `unknown` (no guessing).')
lines.push('')
lines.push('## 1) React Component Inventory')
lines.push('')
lines.push('| Component name | File path | Export type | Where used (parents importing) | Styling method | Motion usage | Category |')
lines.push('|---|---|---|---|---|---|---|')

for (const component of components) {
  lines.push(
    `| ${markdownEscape(component.name)} | ${markdownEscape(component.fileRel)} | ${markdownEscape(component.exportType)} | ${markdownEscape(formatList(component.usedBy))} | ${markdownEscape(component.stylingMethods.join(', '))} | ${markdownEscape(component.motionUsage.join(', '))} | ${markdownEscape(component.category)} |`,
  )
}

lines.push('')
lines.push('## 2) Storybook Story Inventory')
lines.push('')
lines.push('| Story file | Story title | Components covered |')
lines.push('|---|---|---|')
for (const story of stories) {
  const covered = story.coveredComponents.length ? story.coveredComponents : ['unknown']
  lines.push(`| ${markdownEscape(story.storyFileRel)} | ${markdownEscape(story.title)} | ${markdownEscape(covered.join('<br/>'))} |`)
}

lines.push('')
lines.push('## 3) Shared UI Utilities')
lines.push('')
lines.push('| Utility | File | Type | Notes |')
lines.push('|---|---|---|---|')
for (const utility of sharedUtilities) {
  lines.push(`| ${markdownEscape(utility.utility)} | ${markdownEscape(utility.file)} | ${markdownEscape(utility.type)} | ${markdownEscape(utility.notes)} |`)
}

lines.push('')
lines.push('## 4) Summary')
lines.push('')
lines.push(`- Total components discovered: **${components.length}**`)
lines.push(`- Total exported components: **${exportedComponents.length}**`)
lines.push(`- Total stories: **${stories.length}**`)
lines.push('')
lines.push('Totals by category:')
for (const [category, count] of [...totalByCategory.entries()].sort((a, b) => a[0].localeCompare(b[0]))) {
  lines.push(`- ${category}: **${count}**`)
}

lines.push('')
lines.push('Coverage (Storybook):')
const coveredExported = exportedComponents.length - coverageGaps.length
lines.push(`- Exported components with at least one story linkage: **${coveredExported}**`)
lines.push(`- Exported components with no story linkage: **${coverageGaps.length}**`)

lines.push('')
lines.push('## 5) Coverage Gap List (Components with no Storybook stories)')
lines.push('')
if (coverageGaps.length === 0) {
  lines.push('- None')
} else {
  lines.push('| Component | File path | Category |')
  lines.push('|---|---|---|')
  for (const component of coverageGaps.sort((a, b) => a.fileRel.localeCompare(b.fileRel) || a.name.localeCompare(b.name))) {
    lines.push(`| ${markdownEscape(component.name)} | ${markdownEscape(component.fileRel)} | ${markdownEscape(component.category)} |`)
  }
}

lines.push('')
lines.push('## 6) Unknowns')
lines.push('')
const unknownUsageComponents = components.filter((component) => component.usedBy.length === 1 && component.usedBy[0] === 'unknown')
if (unknownUsageComponents.length === 0) {
  lines.push('- No unknown import usage entries.')
} else {
  lines.push('- Components where import usage could not be statically determined:')
  for (const component of unknownUsageComponents) {
    lines.push(`  - ${component.name} (${component.fileRel})`)
  }
}

fs.mkdirSync(path.dirname(outputPath), { recursive: true })
fs.writeFileSync(outputPath, `${lines.join('\n')}\n`, 'utf8')

console.log(`Wrote ${relFromRepo(outputPath)}`)
console.log(`Components: ${components.length}`)
console.log(`Stories: ${stories.length}`)
console.log(`Coverage gaps: ${coverageGaps.length}`)
