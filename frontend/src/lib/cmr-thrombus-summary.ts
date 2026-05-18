type ThrombusPrimary = 'LV' | 'LA' | 'LAA' | 'RV' | 'RA' | 'Aorta' | 'PA' | 'Device' | 'Other'
type ThrombusPostContrastState =
  | 'not-reviewed'
  | 'no-supportive-abnormality'
  | 'non-enhancing-supportive'
  | 'indeterminate'
  | 'enhancement-less-likely'

export type ThrombusSummaryMorphology = {
  maxDiameter: number | null
  shape: 'mural' | 'protruding' | 'pedunculated' | null
  mobility: 'fixed' | 'mildly-mobile' | 'highly-mobile' | null
  attachment: 'broad-based' | 'narrow-stalk' | null
  surface: 'smooth' | 'irregular' | null
}

export type ThrombusSummaryEntryInput = {
  id: string
  primary: ThrombusPrimary | null
  sublocation: string | null
  otherLocation: string
  morphology: ThrombusSummaryMorphology
  confidence: 'definite' | 'probable' | 'indeterminate' | null
  postContrast: ThrombusPostContrastState | null
}

export type ThrombusSummaryEntry = {
  location: string
  confidence: string | null
  maxDiameter: number | null
  descriptors: string[]
  postContrast: ThrombusPostContrastState | null
  postContrastLabel: string | null
}

export type ThrombusSummaryData = {
  deterministicText: string
  hasThrombus: boolean
  thrombusCount: number
  locations: string[]
  confidenceLabels: string[]
  entries: ThrombusSummaryEntry[]
}

const PRIMARY_LOCATION_LABELS: Record<Exclude<ThrombusPrimary, 'Other'>, string> = {
  LV: 'left ventricular',
  LA: 'left atrial',
  LAA: 'left atrial appendage',
  RV: 'right ventricular',
  RA: 'right atrial',
  Aorta: 'aortic',
  PA: 'pulmonary arterial',
  Device: 'device-related',
}

function upperFirst(value: string): string {
  return value ? `${value.charAt(0).toUpperCase()}${value.slice(1)}` : value
}

function formatNumber(value: number, decimals: number = 0): string {
  return new Intl.NumberFormat('en-GB', {
    minimumFractionDigits: 0,
    maximumFractionDigits: decimals,
  }).format(value)
}

function normalizeEntry(input: ThrombusSummaryEntryInput): ThrombusSummaryEntryInput {
  const maxDiameter = input.morphology.maxDiameter
  return {
    ...input,
    morphology: {
      ...input.morphology,
      maxDiameter: maxDiameter != null && Number.isFinite(maxDiameter) && maxDiameter > 0 ? maxDiameter : null,
    },
  }
}

function isFilledEntry(entry: ThrombusSummaryEntryInput): boolean {
  return (
    entry.primary !== null
    || (entry.morphology.maxDiameter != null && entry.morphology.maxDiameter > 0)
    || entry.morphology.shape !== null
    || entry.morphology.mobility !== null
    || entry.morphology.attachment !== null
    || entry.morphology.surface !== null
    || entry.confidence !== null
    || entry.otherLocation.trim().length > 0
  )
}

function buildLocation(entry: ThrombusSummaryEntryInput): string | null {
  if (entry.primary === 'Other') {
    const other = entry.otherLocation.trim()
    return other ? other.toLowerCase() : null
  }
  if (!entry.primary) return null
  if (entry.primary === 'Device') {
    return entry.sublocation ? `${entry.sublocation.toLowerCase()} device-related` : 'device-related'
  }
  const base = PRIMARY_LOCATION_LABELS[entry.primary]
  if (!entry.sublocation) return base
  return `${base} ${entry.sublocation.toLowerCase()}`
}

function buildDescriptors(entry: ThrombusSummaryEntryInput): string[] {
  const descriptors = [
    entry.morphology.shape,
    entry.morphology.mobility === 'mildly-mobile' ? 'mildly mobile' : entry.morphology.mobility === 'highly-mobile' ? 'highly mobile' : entry.morphology.mobility,
    entry.morphology.attachment,
    entry.morphology.surface,
  ].filter((value): value is string => value != null)

  return Array.from(new Set(descriptors))
}

function buildEntrySummary(entry: ThrombusSummaryEntryInput): ThrombusSummaryEntry | null {
  const location = buildLocation(entry)
  if (!location) return null
  return {
    location,
    confidence: entry.confidence,
    maxDiameter: entry.morphology.maxDiameter,
    descriptors: buildDescriptors(entry),
    postContrast: entry.postContrast,
    postContrastLabel: getPostContrastLabel(entry.postContrast),
  }
}

function getPostContrastLabel(state: ThrombusPostContrastState | null): string | null {
  switch (state) {
    case 'not-reviewed':
      return 'Not performed / not reviewed'
    case 'no-supportive-abnormality':
      return 'No supportive post-contrast abnormality'
    case 'non-enhancing-supportive':
      return 'Non-enhancing lesion, supportive of thrombus'
    case 'indeterminate':
      return 'Indeterminate'
    case 'enhancement-less-likely':
      return 'Enhancement present, thrombus less likely'
    default:
      return null
  }
}

function buildPostContrastClause(entry: ThrombusSummaryEntry): string | null {
  switch (entry.postContrast) {
    case 'no-supportive-abnormality':
      return 'with no supportive post-contrast abnormality'
    case 'non-enhancing-supportive':
      return 'without internal enhancement on post-contrast imaging'
    case 'indeterminate':
      return 'with indeterminate post-contrast characterisation'
    case 'enhancement-less-likely':
      return 'with internal enhancement on post-contrast imaging, making thrombus less likely'
    default:
      return null
  }
}

function buildEntryClause(entry: ThrombusSummaryEntry): string {
  const confidenceLead = entry.confidence ? `${entry.confidence} ` : ''
  let clause = `${confidenceLead}${entry.location} thrombus`
  if (entry.maxDiameter != null) {
    clause += ` (${formatNumber(entry.maxDiameter)} mm)`
  }
  if (entry.descriptors.length > 0) {
    clause += `, ${entry.descriptors.join(' and ')}`
  }
  const postContrastClause = buildPostContrastClause(entry)
  if (postContrastClause) {
    clause += entry.descriptors.length > 0 ? `, ${postContrastClause}` : `, ${postContrastClause}`
  }
  return clause
}

function buildDeterministicText(entries: ThrombusSummaryEntry[]): string {
  if (entries.length === 0) {
    return 'No thrombus.'
  }

  if (entries.length === 1) {
    return `${upperFirst(buildEntryClause(entries[0]))}.`
  }

  const lead = entries.length === 2 ? 'Two thrombi are described' : `${upperFirst(formatNumber(entries.length))} thrombi are described`
  return `${lead}: ${entries.map(buildEntryClause).join('; ')}.`
}

export function buildThrombusSummaryData(rawEntries: ThrombusSummaryEntryInput[]): ThrombusSummaryData {
  const entries = rawEntries
    .map(normalizeEntry)
    .filter(isFilledEntry)
    .map(buildEntrySummary)
    .filter((entry): entry is ThrombusSummaryEntry => entry != null)

  return {
    deterministicText: buildDeterministicText(entries),
    hasThrombus: entries.length > 0,
    thrombusCount: entries.length,
    locations: entries.map((entry) => entry.location),
    confidenceLabels: entries
      .map((entry) => entry.confidence)
      .filter((entry): entry is string => entry != null),
    entries,
  }
}

export function buildThrombusSummarySignature(data: ThrombusSummaryData): string {
  return JSON.stringify({
    thrombusCount: data.thrombusCount,
    entries: data.entries,
  })
}
