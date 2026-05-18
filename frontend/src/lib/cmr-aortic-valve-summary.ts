type MeasurementMap = Map<string, number>

import {
  type RegurgitationSeverity as AorticValveSeverity,
  rfToRegurgitationSeverity as rfToSeverity,
} from '@/lib/cmr-valve-severity'

type AorticStenosisSeverity = 'moderate' | 'severe'

type AorticValveFindingDraft = {
  leaflets: Iterable<string> | null | undefined
  detailValues: Record<string, string>
  notes: string
}

type AorticValveMorphology = {
  findings: Record<string, AorticValveFindingDraft>
}

export type AorticValveSummaryData = {
  deterministicText: string
  phenotype: 'normal' | 'regurgitation' | 'stenosis' | 'mixed' | 'morphology'
  phenotypeLabel: string | null
  regurgitationSeverity: AorticValveSeverity | null
  regurgitationSeverityLabel: string | null
  regurgitantFraction: number | null
  regurgitantVolume: number | null
  stenosisSeverity: AorticStenosisSeverity | null
  stenosisSeverityLabel: string | null
  peakVelocity: number | null
  meanGradient: number | null
  peakGradient: number | null
  primaryMechanism: string | null
  primaryMechanismLabel: string | null
  descriptors: string[]
  findingKeys: string[]
}

function volumeToSeverity(volume: number): AorticValveSeverity {
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

function formatCusps(cusps: Iterable<string> | null | undefined): string | null {
  const cleaned = Array.from(cusps ?? []).filter(Boolean)
  if (cleaned.length === 0) return null
  if (cleaned.length === 1) return `the ${cleaned[0].toLowerCase()}`
  if (
    cleaned.length === 3
    && cleaned.includes('Right coronary cusp')
    && cleaned.includes('Left coronary cusp')
    && cleaned.includes('Non-coronary cusp')
  ) {
    return 'all three cusps'
  }

  const ordered = ['Right coronary cusp', 'Left coronary cusp', 'Non-coronary cusp']
    .filter((cusp) => cleaned.includes(cusp))
  if (ordered.length === 2) {
    if (ordered[0] === 'Right coronary cusp' && ordered[1] === 'Left coronary cusp') {
      return 'the right and left coronary cusps'
    }
    if (ordered[0] === 'Right coronary cusp' && ordered[1] === 'Non-coronary cusp') {
      return 'the right and non-coronary cusps'
    }
    if (ordered[0] === 'Left coronary cusp' && ordered[1] === 'Non-coronary cusp') {
      return 'the left and non-coronary cusps'
    }

    const left = ordered[0].replace(/ cusp$/i, '').toLowerCase()
    const right = ordered[1].replace(/ cusp$/i, '').toLowerCase()
    return `the ${left} and ${right} cusps`
  }

  return `the ${cleaned.map((cusp) => cusp.toLowerCase()).join(' and ')}`
}

function getFinding(
  morphology: AorticValveMorphology,
  key: string,
): AorticValveFindingDraft | null {
  return morphology.findings[key] ?? null
}

function getDetailValue(finding: AorticValveFindingDraft | null, label: string): string | null {
  if (!finding) return null
  const value = finding.detailValues?.[label]
  if (value == null) return null
  const trimmed = String(value).trim()
  return trimmed || null
}

function getDetailNumber(finding: AorticValveFindingDraft | null, label: string): number | null {
  const value = getDetailValue(finding, label)
  if (value == null) return null
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : null
}

function dedupe(items: Array<string | null | undefined>): string[] {
  const next: string[] = []
  for (const item of items) {
    if (!item) continue
    if (!next.includes(item)) next.push(item)
  }
  return next
}

function buildQualifiedCuspDescriptor(
  finding: AorticValveFindingDraft | null,
  noun: string,
): string | null {
  if (!finding) return null
  const severity = getDetailValue(finding, 'Severity')?.toLowerCase() ?? null
  const extent = getDetailValue(finding, 'Extent')?.toLowerCase() ?? null
  const cuspPhrase = formatCusps(finding.leaflets)
  const qualifiers = [severity, extent].filter((value): value is string => value != null)
  const qualifierText = qualifiers.join(' ')

  if (cuspPhrase) {
    return `${qualifierText ? `${qualifierText} ` : ''}${noun} of ${cuspPhrase}`
  }
  return `${qualifierText ? `${qualifierText} ` : ''}cusp ${noun}`.trim()
}

function buildRestrictedDescriptor(finding: AorticValveFindingDraft | null): string | null {
  if (!finding) return null
  return 'restricted cusp opening'
}

function buildProlapseDescriptor(finding: AorticValveFindingDraft | null): string | null {
  if (!finding) return null
  const type = getDetailValue(finding, 'Type')
  const cuspPhrase = formatCusps(finding.leaflets)
  if (type === 'flail') {
    return cuspPhrase ? `flail ${cuspPhrase}` : 'flail cusp'
  }
  if (type === 'prolapse') {
    return cuspPhrase ? `${cuspPhrase} prolapse` : 'cusp prolapse'
  }
  return cuspPhrase ? `${cuspPhrase} prolapse/flail` : 'cusp prolapse/flail'
}

function buildAnnularDilatationDescriptor(finding: AorticValveFindingDraft | null): string | null {
  if (!finding) return null
  const diameter = getDetailNumber(finding, 'Diameter')
  if (diameter == null) return 'annular dilatation'
  return `annular dilatation (annular diameter ${formatNumber(diameter)} mm)`
}

function buildVegetationDescriptor(finding: AorticValveFindingDraft | null): string | null {
  if (!finding) return null
  const size = getDetailNumber(finding, 'Size')
  const mobility = getDetailValue(finding, 'Mobility')
  const parts = [
    size == null ? null : `${formatNumber(size)} mm`,
    mobility,
  ].filter((value): value is string => value != null)
  if (parts.length === 0) return 'aortic valve vegetation'
  return `aortic valve vegetation (${parts.join('; ')})`
}

function buildPerforationDescriptor(finding: AorticValveFindingDraft | null): string | null {
  if (!finding) return null
  const cuspPhrase = formatCusps(finding.leaflets)
  const size = getDetailNumber(finding, 'Size')
  const sizeText = size == null ? null : `${formatNumber(size)} mm`
  const base = cuspPhrase ? `perforation of ${cuspPhrase}` : 'cusp perforation'
  return sizeText ? `${base} (${sizeText})` : base
}

function appendSuffixIfMissing(value: string, suffix: string): string {
  const normalizedValue = value.trim()
  if (!normalizedValue) return normalizedValue
  const lowerValue = normalizedValue.toLowerCase()
  const lowerSuffix = suffix.toLowerCase()
  if (lowerValue.endsWith(lowerSuffix)) {
    return normalizedValue
  }
  return `${normalizedValue} ${suffix}`
}

function buildBicuspidDescriptor(finding: AorticValveFindingDraft | null): string | null {
  if (!finding) return null
  const fusion = getDetailValue(finding, 'Fusion')
  const raphe = getDetailValue(finding, 'Raphe')
  const parts = [
    fusion ? appendSuffixIfMissing(fusion, 'fusion') : null,
    raphe ? appendSuffixIfMissing(raphe.toLowerCase(), 'raphe') : null,
  ]
    .filter((value): value is string => value != null && value !== 'none')
  if (parts.length === 0) return 'bicuspid aortic valve'
  return `bicuspid aortic valve with ${parts.join(' and ')}`
}

function resolveRegurgitationSeverity(
  measurementMap: MeasurementMap,
): { severity: AorticValveSeverity | null; regurgitantFraction: number | null; regurgitantVolume: number | null } {
  const regurgitantFraction = measurementMap.get('AV regurgitant fraction') ?? null
  const regurgitantVolume = measurementMap.get('AV backward flow (per heartbeat)') ?? null

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

function resolveStenosisSeverity(
  measurementMap: MeasurementMap,
): { severity: AorticStenosisSeverity | null; peakVelocity: number | null; meanGradient: number | null; peakGradient: number | null } {
  const peakVelocity = measurementMap.get('AV maximum velocity') ?? null
  const meanGradient = measurementMap.get('AV mean pressure gradient') ?? null
  const peakGradient = measurementMap.get('AV maximum pressure gradient') ?? null

  const severe =
    (meanGradient != null && meanGradient >= 40)
    || (peakGradient != null && peakGradient >= 64)
    || (peakVelocity != null && peakVelocity >= 4)
  if (severe) {
    return { severity: 'severe', peakVelocity, meanGradient, peakGradient }
  }

  const moderate =
    (meanGradient != null && meanGradient >= 20)
    || (peakGradient != null && peakGradient >= 36)
    || (peakVelocity != null && peakVelocity >= 3)
  if (moderate) {
    return { severity: 'moderate', peakVelocity, meanGradient, peakGradient }
  }

  return { severity: null, peakVelocity, meanGradient, peakGradient }
}

function resolvePrimaryMechanism(
  morphology: AorticValveMorphology,
): { key: string | null; label: string | null } {
  const has = (key: string) => getFinding(morphology, key) != null
  if (has('vegetation') || has('perforation')) {
    return { key: 'infective-destructive', label: 'Infective / destructive' }
  }
  if (has('bicuspid') || has('quadricuspid')) {
    return { key: 'congenital', label: 'Congenital' }
  }
  if (has('rheumatic') || has('commissuralFusion')) {
    return { key: 'rheumatic', label: 'Rheumatic' }
  }
  if (has('calcified') || has('doming') || has('thickened')) {
    return { key: 'calcific-degenerative', label: 'Calcific / degenerative' }
  }
  if (has('restricted') || has('annularDilatation') || has('prolapse')) {
    return { key: 'structural', label: 'Structural' }
  }
  return { key: null, label: null }
}

function buildDescriptors(morphology: AorticValveMorphology): string[] {
  const thickened = getFinding(morphology, 'thickened')
  const calcified = getFinding(morphology, 'calcified')
  const restricted = getFinding(morphology, 'restricted')
  const prolapse = getFinding(morphology, 'prolapse')
  const annularDilatation = getFinding(morphology, 'annularDilatation')
  const vegetation = getFinding(morphology, 'vegetation')
  const commissuralFusion = getFinding(morphology, 'commissuralFusion')
  const perforation = getFinding(morphology, 'perforation')
  const doming = getFinding(morphology, 'doming')
  const bicuspid = getFinding(morphology, 'bicuspid')
  const rheumatic = getFinding(morphology, 'rheumatic')
  const quadricuspid = getFinding(morphology, 'quadricuspid')

  return dedupe([
    buildBicuspidDescriptor(bicuspid),
    quadricuspid ? 'quadricuspid aortic valve' : null,
    buildQualifiedCuspDescriptor(thickened, 'thickening'),
    buildQualifiedCuspDescriptor(calcified, 'calcification'),
    buildRestrictedDescriptor(restricted),
    buildProlapseDescriptor(prolapse),
    buildAnnularDilatationDescriptor(annularDilatation),
    buildVegetationDescriptor(vegetation),
    commissuralFusion ? 'commissural fusion' : null,
    buildPerforationDescriptor(perforation),
    doming ? 'cusp doming' : null,
    rheumatic ? 'rheumatic morphology' : null,
  ])
}

function buildDeterministicText(data: Omit<AorticValveSummaryData, 'deterministicText'>): string {
  const {
    phenotype,
    regurgitationSeverity,
    regurgitantFraction,
    regurgitantVolume,
    stenosisSeverity,
    peakVelocity,
    meanGradient,
    descriptors,
  } = data

  if (phenotype === 'normal' && descriptors.length === 0) {
    return 'No significant aortic valve abnormality.'
  }

  let sentence: string
    switch (phenotype) {
    case 'mixed':
      sentence = `${stenosisSeverity?.charAt(0).toUpperCase()}${stenosisSeverity?.slice(1)} aortic stenosis with ${regurgationLabel(regurgitationSeverity).toLowerCase()} aortic regurgitation`
      break
    case 'stenosis':
      sentence = `${stenosisSeverity?.charAt(0).toUpperCase()}${stenosisSeverity?.slice(1)} aortic stenosis`
      break
    case 'regurgitation':
      sentence = `${regurgationLabel(regurgitationSeverity)} aortic regurgitation`
      break
    case 'morphology':
      sentence = descriptors[0]?.charAt(0).toUpperCase() + (descriptors[0]?.slice(1) ?? '')
      break
    default:
      sentence = 'No significant aortic valve abnormality'
      break
  }

  const dominantDescriptors = phenotype === 'morphology' ? descriptors.slice(1, 3) : descriptors.slice(0, 3)
  if (dominantDescriptors.length > 0 && phenotype !== 'morphology') {
    const firstDescriptor = dominantDescriptors[0]?.toLowerCase() ?? ''
    const hasCongenitalLead = firstDescriptor.startsWith('bicuspid aortic valve') || firstDescriptor.startsWith('quadricuspid aortic valve')
    if (hasCongenitalLead) {
      sentence += ` in the setting of ${dominantDescriptors[0]}`
      const residualDescriptors = dominantDescriptors.slice(1)
      if (residualDescriptors.length > 0) {
        sentence += `, with ${residualDescriptors.join(' and ')}`
      }
    } else {
      sentence += ` with ${dominantDescriptors.join(' and ')}`
    }
  } else if (dominantDescriptors.length > 0 && phenotype === 'morphology') {
    sentence += ` with ${dominantDescriptors.join(' and ')}`
  }

  const quantParts = [
    stenosisSeverity && peakVelocity != null ? `peak velocity ${formatNumber(peakVelocity, 1)} m/s` : null,
    stenosisSeverity && meanGradient != null ? `mean gradient ${formatNumber(meanGradient, 0)} mmHg` : null,
    regurgitationSeverity && regurgitationSeverity !== 'none' && regurgitantFraction != null ? `RF ${formatNumber(regurgitantFraction, 1)}%` : null,
    regurgitationSeverity && regurgitationSeverity !== 'none' && regurgitantVolume != null ? `regurgitant volume ${formatNumber(regurgitantVolume)} mL` : null,
  ].filter((value): value is string => value != null)

  if (quantParts.length > 0 && phenotype !== 'morphology') {
    sentence += ` (${quantParts.join('; ')})`
  }

  return sentence.endsWith('.') ? sentence : `${sentence}.`
}

function regurgationLabel(severity: AorticValveSeverity | null): string {
  if (!severity || severity === 'none') return 'No significant'
  return `${severity.charAt(0).toUpperCase()}${severity.slice(1)}`
}

export function buildAorticValveSummaryData(
  measurementMap: MeasurementMap,
  morphology: AorticValveMorphology,
): AorticValveSummaryData {
  const {
    severity: regurgitationSeverity,
    regurgitantFraction,
    regurgitantVolume,
  } = resolveRegurgitationSeverity(measurementMap)
  const {
    severity: stenosisSeverity,
    peakVelocity,
    meanGradient,
    peakGradient,
  } = resolveStenosisSeverity(measurementMap)
  const { key: primaryMechanism, label: primaryMechanismLabel } = resolvePrimaryMechanism(morphology)
  const descriptors = buildDescriptors(morphology)
  const findingKeys = Object.keys(morphology.findings).sort()

  const phenotype: AorticValveSummaryData['phenotype'] =
    stenosisSeverity && regurgitationSeverity != null && regurgitationSeverity !== 'none'
      ? 'mixed'
      : stenosisSeverity
        ? 'stenosis'
        : regurgitationSeverity != null && regurgitationSeverity !== 'none'
          ? 'regurgitation'
          : descriptors.length > 0
            ? 'morphology'
            : 'normal'

  const phenotypeLabel = phenotype === 'mixed'
    ? 'Mixed AV disease'
    : phenotype === 'stenosis'
      ? 'Aortic stenosis'
      : phenotype === 'regurgitation'
        ? 'Aortic regurgitation'
        : phenotype === 'morphology'
          ? 'Morphology'
          : null

  const summaryData: Omit<AorticValveSummaryData, 'deterministicText'> = {
    phenotype,
    phenotypeLabel,
    regurgitationSeverity,
    regurgitationSeverityLabel: regurgitationSeverity == null ? null : `${regurgationLabel(regurgitationSeverity)}`,
    regurgitantFraction,
    regurgitantVolume,
    stenosisSeverity,
    stenosisSeverityLabel: stenosisSeverity == null ? null : `${stenosisSeverity.charAt(0).toUpperCase()}${stenosisSeverity.slice(1)}`,
    peakVelocity,
    meanGradient,
    peakGradient,
    primaryMechanism,
    primaryMechanismLabel,
    descriptors,
    findingKeys,
  }

  return {
    ...summaryData,
    deterministicText: buildDeterministicText(summaryData),
  }
}

export function buildAorticValveSummarySignature(data: AorticValveSummaryData): string {
  return JSON.stringify({
    phenotype: data.phenotype,
    regurgitationSeverity: data.regurgitationSeverity,
    regurgitantFraction: data.regurgitantFraction,
    regurgitantVolume: data.regurgitantVolume,
    stenosisSeverity: data.stenosisSeverity,
    peakVelocity: data.peakVelocity,
    meanGradient: data.meanGradient,
    peakGradient: data.peakGradient,
    primaryMechanism: data.primaryMechanism,
    descriptors: data.descriptors,
    findingKeys: data.findingKeys,
  })
}
