type MeasurementMap = Map<string, number>

import {
  type RegurgitationSeverity as MitralValveSeverity,
  rfToRegurgitationSeverity as rfToSeverity,
} from '@/lib/cmr-valve-severity'

type MitralValveFindingDraft = {
  leaflets: Iterable<string> | null | undefined
  detailValues: Record<string, string>
  notes: string
}

type MitralValveMorphology = {
  findings: Record<string, MitralValveFindingDraft>
}

export type MitralValveSummaryData = {
  deterministicText: string
  severity: MitralValveSeverity | null
  severityLabel: string | null
  regurgitantFraction: number | null
  regurgitantVolume: number | null
  primaryMechanism: string | null
  primaryMechanismLabel: string | null
  descriptors: string[]
  findingKeys: string[]
  lvef: number | null
  lvedvi: number | null
  laMaxVolumeIndex: number | null
}

function volumeToSeverity(volume: number): MitralValveSeverity {
  if (volume >= 60) return 'severe'
  if (volume >= 30) return 'moderate'
  if (volume >= 15) return 'mild'
  if (volume > 0) return 'trivial'
  return 'none'
}

function formatNumber(value: number, decimals: number = 0): string {
  return new Intl.NumberFormat('en-GB', {
    minimumFractionDigits: 0,
    maximumFractionDigits: decimals,
  }).format(value)
}

function formatLeaflets(leaflets: Iterable<string> | null | undefined): string | null {
  const cleaned = Array.from(leaflets ?? []).filter(Boolean)
  if (cleaned.length === 0) return null
  if (cleaned.length === 1) return `${cleaned[0].toLowerCase()} leaflet`
  if (cleaned.length === 2 && cleaned.includes('Anterior') && cleaned.includes('Posterior')) {
    return 'bileaflet'
  }
  return `${cleaned.map((leaflet) => leaflet.toLowerCase()).join(' and ')} leaflets`
}

function getFinding(
  morphology: MitralValveMorphology,
  key: string,
): MitralValveFindingDraft | null {
  return morphology.findings[key] ?? null
}

function getDetailValue(finding: MitralValveFindingDraft | null, label: string): string | null {
  if (!finding) return null
  const value = finding.detailValues?.[label]
  if (value == null) return null
  const trimmed = String(value).trim()
  return trimmed || null
}

function getDetailNumber(finding: MitralValveFindingDraft | null, label: string): number | null {
  const value = getDetailValue(finding, label)
  if (value == null) return null
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : null
}

function formatMeasurement(label: string, value: number | null, unit: string, decimals: number = 0): string | null {
  if (value == null) return null
  return `${label} ${formatNumber(value, decimals)} ${unit}`
}

function buildQualifiedLeafletDescriptor(
  finding: MitralValveFindingDraft | null,
  noun: string,
): string | null {
  if (!finding) return null
  const severity = getDetailValue(finding, 'Severity')?.toLowerCase() ?? null
  const extent = getDetailValue(finding, 'Extent')?.toLowerCase() ?? null
  const leafletPhrase = formatLeaflets(finding.leaflets)
  const qualifiers = [severity, extent].filter((value): value is string => value != null)

  if (leafletPhrase) {
    if (leafletPhrase === 'bileaflet') {
      return [...qualifiers, leafletPhrase, noun].join(' ')
    }
    return [...qualifiers, leafletPhrase, noun].join(' ')
  }

  return [...qualifiers, 'leaflet', noun].join(' ')
}

function buildProlapseDescriptor(finding: MitralValveFindingDraft | null): string | null {
  if (!finding) return null
  const type = getDetailValue(finding, 'Type')
  const leafletPhrase = formatLeaflets(finding.leaflets ?? [])
  if (type === 'flail') {
    return leafletPhrase ? `flail ${leafletPhrase}` : 'flail leaflet'
  }
  if (type === 'prolapse') {
    return leafletPhrase ? `${leafletPhrase} prolapse` : 'leaflet prolapse'
  }
  return leafletPhrase ? `${leafletPhrase} prolapse/flail` : 'leaflet prolapse/flail'
}

function buildRestrictedDescriptor(finding: MitralValveFindingDraft | null): string | null {
  if (!finding) return null
  const carpentier = getDetailValue(finding, 'Carpentier')
  return carpentier
    ? `restricted leaflet motion (Carpentier ${carpentier})`
    : 'restricted leaflet motion'
}

function buildTetheringDescriptor(finding: MitralValveFindingDraft | null): string | null {
  if (!finding) return null
  const tentingHeight = getDetailNumber(finding, 'Tenting height')
  const tentingArea = getDetailNumber(finding, 'Tenting area')
  const parts = [
    formatMeasurement('tenting height', tentingHeight, 'mm'),
    formatMeasurement('tenting area', tentingArea, 'cm^2', 1),
  ].filter((value): value is string => value != null)
  if (parts.length === 0) return 'leaflet tethering'
  return `leaflet tethering (${parts.join('; ')})`
}

function buildAnnularDilatationDescriptor(finding: MitralValveFindingDraft | null): string | null {
  if (!finding) return null
  const diameter = getDetailNumber(finding, 'Diameter')
  const diameterText = formatMeasurement('annular diameter', diameter, 'mm')
  return diameterText ? `annular dilatation (${diameterText})` : 'annular dilatation'
}

function buildVegetationDescriptor(finding: MitralValveFindingDraft | null): string | null {
  if (!finding) return null
  const size = getDetailNumber(finding, 'Size')
  const mobility = getDetailValue(finding, 'Mobility')
  const parts = [
    size == null ? null : `${formatNumber(size)} mm`,
    mobility,
  ].filter((value): value is string => value != null)
  if (parts.length === 0) return 'mitral valve vegetation'
  return `mitral valve vegetation (${parts.join('; ')})`
}

function buildPerforationDescriptor(finding: MitralValveFindingDraft | null): string | null {
  if (!finding) return null
  const leafletPhrase = formatLeaflets(finding.leaflets ?? [])
  const size = getDetailNumber(finding, 'Size')
  const sizeText = size == null ? null : `${formatNumber(size)} mm`
  const base = leafletPhrase ? `${leafletPhrase} perforation` : 'leaflet perforation'
  return sizeText ? `${base} (${sizeText})` : base
}

function buildMyxomatousDescriptor(finding: MitralValveFindingDraft | null): string | null {
  if (!finding) return null
  const type = getDetailValue(finding, 'Type')
  if (type === 'barlow') return 'myxomatous degeneration (Barlow phenotype)'
  if (type === 'fed') return 'myxomatous degeneration (fibroelastic deficiency)'
  return 'myxomatous degeneration'
}

function buildAnnularDisjunctionDescriptor(finding: MitralValveFindingDraft | null): string | null {
  if (!finding) return null
  const distance = getDetailNumber(finding, 'Distance')
  return distance == null
    ? 'mitral annular disjunction'
    : `mitral annular disjunction (${formatNumber(distance)} mm)`
}

function resolveSeverity(
  measurementMap: MeasurementMap,
): { severity: MitralValveSeverity | null; regurgitantFraction: number | null; regurgitantVolume: number | null } {
  const regurgitantFraction = measurementMap.get('MR regurgitant fraction') ?? null
  const regurgitantVolume = measurementMap.get('MR volume (per heartbeat)') ?? null
  if (regurgitantFraction != null) {
    return {
      severity: rfToSeverity(regurgitantFraction),
      regurgitantFraction,
      regurgitantVolume,
    }
  }
  if (regurgitantVolume != null) {
    return {
      severity: volumeToSeverity(regurgitantVolume),
      regurgitantFraction,
      regurgitantVolume,
    }
  }
  return { severity: null, regurgitantFraction: null, regurgitantVolume: null }
}

function dedupe(items: Array<string | null | undefined>): string[] {
  const next: string[] = []
  for (const item of items) {
    if (!item) continue
    if (!next.includes(item)) next.push(item)
  }
  return next
}

function resolvePrimaryMechanism(
  morphology: MitralValveMorphology,
): { key: string | null; label: string | null } {
  const has = (key: string) => getFinding(morphology, key) != null
  const restricted = getFinding(morphology, 'restricted')
  const restrictedCarpentier = getDetailValue(restricted, 'Carpentier')

  if (has('vegetation') || has('perforation')) {
    return { key: 'infective-destructive', label: 'Infective / destructive' }
  }
  if (has('cleft')) {
    return { key: 'congenital-cleft', label: 'Congenital cleft' }
  }
  if (has('sam')) {
    return { key: 'sam-related', label: 'SAM-related' }
  }
  if (has('rheumatic') || has('commissuralFusion') || restrictedCarpentier === 'IIIa') {
    return { key: 'rheumatic', label: 'Rheumatic' }
  }
  if (has('prolapse') || has('chordalRupture') || has('myxomatous') || has('annularDisjunction')) {
    return { key: 'degenerative', label: 'Degenerative' }
  }
  if (has('tethering') || has('annularDilatation') || restrictedCarpentier === 'IIIb') {
    return { key: 'functional', label: 'Functional' }
  }
  if (has('thickened') || has('calcified') || has('restricted')) {
    return { key: 'structural', label: 'Structural' }
  }
  return { key: null, label: null }
}

function buildDescriptors(morphology: MitralValveMorphology): string[] {
  const prolapse = getFinding(morphology, 'prolapse')
  const chordalRupture = getFinding(morphology, 'chordalRupture')
  const tethering = getFinding(morphology, 'tethering')
  const annularDilatation = getFinding(morphology, 'annularDilatation')
  const restricted = getFinding(morphology, 'restricted')
  const vegetation = getFinding(morphology, 'vegetation')
  const perforation = getFinding(morphology, 'perforation')
  const myxomatous = getFinding(morphology, 'myxomatous')
  const annularDisjunction = getFinding(morphology, 'annularDisjunction')
  const thickened = getFinding(morphology, 'thickened')
  const calcified = getFinding(morphology, 'calcified')
  const commissuralFusion = getFinding(morphology, 'commissuralFusion')
  const cleft = getFinding(morphology, 'cleft')
  const sam = getFinding(morphology, 'sam')
  const rheumatic = getFinding(morphology, 'rheumatic')

  return dedupe([
    buildProlapseDescriptor(prolapse),
    chordalRupture ? 'chordal rupture' : null,
    buildTetheringDescriptor(tethering),
    buildAnnularDilatationDescriptor(annularDilatation),
    buildRestrictedDescriptor(restricted),
    buildVegetationDescriptor(vegetation),
    buildPerforationDescriptor(perforation),
    buildMyxomatousDescriptor(myxomatous),
    buildAnnularDisjunctionDescriptor(annularDisjunction),
    buildQualifiedLeafletDescriptor(thickened, 'thickening'),
    buildQualifiedLeafletDescriptor(calcified, 'calcification'),
    commissuralFusion ? 'commissural fusion' : null,
    cleft ? 'mitral cleft' : null,
    sam ? 'systolic anterior motion' : null,
    rheumatic ? 'rheumatic morphology' : null,
  ])
}

function buildSeverityLeadIn(
  severity: MitralValveSeverity | null,
  primaryMechanism: string | null,
): string {
  if (severity == null || severity === 'none') {
    return primaryMechanism === 'infective-destructive'
      ? 'Mitral valve abnormality'
      : 'No significant mitral regurgitation'
  }

  const severityLabel = `${severity.charAt(0).toUpperCase()}${severity.slice(1)} mitral regurgitation`
  if (primaryMechanism === 'infective-destructive') {
    return `${severityLabel} with destructive mitral valve morphology`
  }
  return severityLabel
}

function buildDeterministicText(data: Omit<MitralValveSummaryData, 'deterministicText'>): string {
  const {
    severity,
    regurgitantFraction,
    regurgitantVolume,
    primaryMechanism,
    descriptors,
  } = data

  if ((severity == null || severity === 'none') && descriptors.length === 0) {
    return 'No significant mitral valve abnormality.'
  }

  let sentence = buildSeverityLeadIn(severity, primaryMechanism)

  const dominantDescriptors = descriptors.slice(0, 3)
  if (severity != null && severity !== 'none') {
    if (primaryMechanism === 'degenerative' && dominantDescriptors.length > 0) {
      sentence += ` due to ${dominantDescriptors.join(' with ')}`
    } else if (primaryMechanism === 'functional' && dominantDescriptors.length > 0) {
      sentence += ` with ${dominantDescriptors.join(' and ')}`
    } else if (primaryMechanism === 'rheumatic' && dominantDescriptors.length > 0) {
      sentence += ` with ${dominantDescriptors.join(' and ')}`
    } else if (primaryMechanism === 'infective-destructive' && dominantDescriptors.length > 0) {
      sentence = `${dominantDescriptors.join(' with ')} and ${sentence.charAt(0).toLowerCase()}${sentence.slice(1)}`
    } else if (dominantDescriptors.length > 0) {
      sentence += ` with ${dominantDescriptors.join(' and ')}`
    }
  } else if (dominantDescriptors.length > 0) {
    sentence = `${dominantDescriptors[0].charAt(0).toUpperCase()}${dominantDescriptors[0].slice(1)}`
    if (dominantDescriptors.length > 1) {
      sentence += ` with ${dominantDescriptors.slice(1).join(' and ')}`
    }
  }

  const quantParts = [
    regurgitantFraction == null ? null : `RF ${formatNumber(regurgitantFraction, 1)}%`,
    regurgitantVolume == null ? null : `MR volume ${formatNumber(regurgitantVolume)} mL`,
  ].filter((value): value is string => value != null)

  if (quantParts.length > 0 && severity != null && severity !== 'none') {
    sentence += ` (${quantParts.join(', ')})`
  }

  return sentence.endsWith('.') ? sentence : `${sentence}.`
}

export function buildMitralValveSummaryData(
  measurementMap: MeasurementMap,
  morphology: MitralValveMorphology,
): MitralValveSummaryData {
  const { severity, regurgitantFraction, regurgitantVolume } = resolveSeverity(measurementMap)
  const { key: primaryMechanism, label: primaryMechanismLabel } = resolvePrimaryMechanism(morphology)
  const descriptors = buildDescriptors(morphology)
  const findingKeys = Object.keys(morphology.findings).sort()

  const summaryData: Omit<MitralValveSummaryData, 'deterministicText'> = {
    severity,
    severityLabel: severity == null ? null : `${severity.charAt(0).toUpperCase()}${severity.slice(1)}`,
    regurgitantFraction,
    regurgitantVolume,
    primaryMechanism,
    primaryMechanismLabel,
    descriptors,
    findingKeys,
    lvef: measurementMap.get('LV EF') ?? null,
    lvedvi: measurementMap.get('LV EDV (i)') ?? null,
    laMaxVolumeIndex: measurementMap.get('LA max volume (i)') ?? null,
  }

  return {
    ...summaryData,
    deterministicText: buildDeterministicText(summaryData),
  }
}

export function buildMitralValveSummarySignature(data: MitralValveSummaryData): string {
  return JSON.stringify({
    severity: data.severity,
    regurgitantFraction: data.regurgitantFraction,
    regurgitantVolume: data.regurgitantVolume,
    primaryMechanism: data.primaryMechanism,
    descriptors: data.descriptors,
    findingKeys: data.findingKeys,
    lvef: data.lvef,
    lvedvi: data.lvedvi,
    laMaxVolumeIndex: data.laMaxVolumeIndex,
  })
}
