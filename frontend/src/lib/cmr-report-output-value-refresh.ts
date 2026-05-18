export type ReportOutputSectionKey =
  | 'intro'
  | 'left-ventricle'
  | 'right-ventricle'
  | 'atria'
  | 'quantitative'
  | 'tissue'
  | 'stress-perfusion'
  | 'flow'
  | 'valves'
  | 'ph'
  | 'conclusions'

type SectionDefinition = {
  key: Exclude<ReportOutputSectionKey, 'intro'>
  matches: (line: string) => boolean
}

const SECTION_DEFINITIONS: readonly SectionDefinition[] = [
  { key: 'left-ventricle', matches: (line) => line.trim() === 'Left ventricle:' },
  { key: 'right-ventricle', matches: (line) => line.trim() === 'Right ventricle:' },
  { key: 'atria', matches: (line) => line.trim() === 'Atria:' },
  { key: 'quantitative', matches: (line) => line.trim().startsWith('CMR quantitative') },
  { key: 'tissue', matches: (line) => line.trim() === 'Tissue characterisation:' },
  { key: 'stress-perfusion', matches: (line) => line.trim() === 'Stress perfusion:' },
  { key: 'flow', matches: (line) => line.trim().startsWith('Flow') },
  { key: 'valves', matches: (line) => line.trim() === 'Valves:' },
  { key: 'ph', matches: (line) => line.trim() === 'Pulmonary hypertension assessment:' },
  { key: 'conclusions', matches: (line) => line.trim() === 'Conclusions:' },
]

const TISSUE_VALUE_LINE_PREFIXES = [
  'Native T1',
  'Native myocardial T1',
  'Post-contrast T1',
  'Post contrast T1',
  'Post-gadolinium T1',
  'ECV',
  'Native T2',
  'Native myocardial T2',
  'Myocardial T2*',
] as const

function isTissueValueLine(line: string): boolean {
  const trimmed = line.trim()
  return /\s{2,}\S/.test(line)
    && TISSUE_VALUE_LINE_PREFIXES.some((prefix) => trimmed.startsWith(prefix))
}

function isReportSectionHeading(line: string): boolean {
  return SECTION_DEFINITIONS.some((definition) => definition.matches(line))
}

function getReportSectionBounds(
  lines: readonly string[],
  sectionKey: ReportOutputSectionKey,
): { start: number; end: number } | null {
  if (sectionKey === 'intro') {
    const end = lines.findIndex((line) => isReportSectionHeading(line))
    return { start: 0, end: end === -1 ? lines.length : end }
  }

  const definition = SECTION_DEFINITIONS.find((item) => item.key === sectionKey)
  if (!definition) return null

  const start = lines.findIndex((line) => definition.matches(line))
  if (start === -1) return null
  const end = lines.findIndex((line, index) => index > start && isReportSectionHeading(line))
  return { start, end: end === -1 ? lines.length : end }
}

export function getReportOutputSection(
  reportText: string,
  sectionKey: ReportOutputSectionKey,
): string | null {
  const lines = reportText.split(/\r?\n/)
  const bounds = getReportSectionBounds(lines, sectionKey)
  if (!bounds) return null
  return lines.slice(bounds.start, bounds.end).join('\n')
}

export function replaceReportOutputSection({
  reportText,
  sectionKey,
  replacementText,
}: {
  reportText: string
  sectionKey: ReportOutputSectionKey
  replacementText: string
}): string {
  const lines = reportText.split(/\r?\n/)
  const bounds = getReportSectionBounds(lines, sectionKey)
  if (!bounds) return reportText

  return [
    ...lines.slice(0, bounds.start),
    ...replacementText.split(/\r?\n/),
    ...lines.slice(bounds.end),
  ].join('\n')
}

function findSectionEnd(
  lines: readonly string[],
  startIndex: number,
  isNextSectionStart: (line: string) => boolean,
): number {
  const nextIndex = lines.findIndex((line, index) => index > startIndex && isNextSectionStart(line))
  return nextIndex === -1 ? lines.length : nextIndex
}

export function replaceReportQuantitativeSection(
  reportText: string,
  quantitativeHeaderLine: string,
  quantitativeLines: readonly string[],
): string {
  const lines = reportText.split(/\r?\n/)
  const quantitativeHeaderIndex = lines.findIndex((line) => line === quantitativeHeaderLine)
  if (quantitativeHeaderIndex === -1) {
    return reportText
  }

  const tissueSectionIndex = lines.findIndex(
    (line, index) => index > quantitativeHeaderIndex && line.trim() === 'Tissue characterisation:',
  )
  if (tissueSectionIndex === -1) {
    return reportText
  }

  return [
    ...lines.slice(0, quantitativeHeaderIndex),
    quantitativeHeaderLine,
    ...quantitativeLines,
    '',
    ...lines.slice(tissueSectionIndex),
  ].join('\n')
}

function replaceTissueSection(reportText: string, tissueLines: readonly string[]): string {
  const nextTissueValueLines = tissueLines.filter(isTissueValueLine)
  if (nextTissueValueLines.length === 0) return reportText
  const lines = reportText.split(/\r?\n/)
  const startIndex = lines.findIndex((line) => line.trim() === 'Tissue characterisation:')
  if (startIndex === -1) return reportText

  const endIndex = findSectionEnd(lines, startIndex, (line) => {
    const trimmed = line.trim()
    return trimmed === 'Stress perfusion:' || trimmed.startsWith('Flow')
  })
  const preservedLines = lines
    .slice(startIndex + 1, endIndex)
    .filter((line) => !isTissueValueLine(line))
  while (preservedLines.length > 0 && preservedLines[preservedLines.length - 1]?.trim() === '') {
    preservedLines.pop()
  }

  return [
    ...lines.slice(0, startIndex),
    'Tissue characterisation:',
    ...preservedLines,
    ...nextTissueValueLines,
    '',
    ...lines.slice(endIndex),
  ].join('\n')
}

function replaceFlowSection(reportText: string, flowLines: readonly string[]): string {
  if (flowLines.length === 0) return reportText
  const lines = reportText.split(/\r?\n/)
  const startIndex = lines.findIndex((line) => line.trim().startsWith('Flow'))
  if (startIndex === -1) return reportText

  const endIndex = findSectionEnd(lines, startIndex, (line) => {
    const trimmed = line.trim()
    return trimmed === 'Valves:'
      || trimmed === 'Pulmonary hypertension assessment:'
      || trimmed === 'Conclusions:'
  })
  return [
    ...lines.slice(0, startIndex),
    ...flowLines,
    ...lines.slice(endIndex),
  ].join('\n')
}

export function refreshReportOutputValues({
  reportText,
  quantitativeHeaderLine,
  quantitativeLines,
  tissueLines,
  flowLines,
}: {
  reportText: string
  quantitativeHeaderLine: string
  quantitativeLines: readonly string[]
  tissueLines: readonly string[]
  flowLines: readonly string[]
}): string {
  return replaceFlowSection(
    replaceTissueSection(
      replaceReportQuantitativeSection(reportText, quantitativeHeaderLine, quantitativeLines),
      tissueLines,
    ),
    flowLines,
  )
}
