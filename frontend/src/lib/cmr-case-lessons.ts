type CmrCaseLessonsSectionKey =
  | 'lv'
  | 'rv'
  | 'tissue'
  | 'perfusion'
  | 'valves'
  | 'ph'
  | 'thrombus'

export type CmrCaseLessonsSections = Record<CmrCaseLessonsSectionKey, string | null>

export type CmrCaseLessonsTheme =
  | 'stress-perfusion-lge-viability'
  | 'stress-scar-without-ischaemia'
  | 'non-ischaemic-tissue-pattern'
  | 'thrombus-characterisation'
  | 'valve-flow-and-morphology'
  | 'ph-physiology-integration'
  | 'ventricular-phenotype'

export type CmrCaseLessonsMode = 'case-discussion' | 'advanced-teaching-point'

export type CmrCaseLessonsInput = {
  reportType: 'standard' | 'stress'
  nonContrast: boolean
  fourDFlow: boolean
  tissueParametersPresent: string[]
  adequateStress: boolean | null
  sectionSummaries: CmrCaseLessonsSections
  conclusionLines: string[]
  notableMeasurements: string[]
}

export type CmrCaseLessonsData = {
  mode: CmrCaseLessonsMode
  deterministicText: string
  reportType: 'standard' | 'stress'
  protocolHighlights: string[]
  confidenceHighlights: string[]
  interpretiveHighlights: string[]
  advancedLearningHighlights: string[]
  reportingPearls: string[]
  teachingThemes: string[]
  notableMeasurements: string[]
  sectionSummaries: CmrCaseLessonsSections
  conclusionLines: string[]
}

function normalizeText(value: string | null | undefined): string | null {
  const candidate = String(value ?? '').trim()
  return candidate.length > 0 ? candidate : null
}

function includesAny(text: string | null | undefined, needles: string[]): boolean {
  const haystack = normalizeText(text)?.toLowerCase()
  if (!haystack) return false
  return needles.some((needle) => haystack.includes(needle))
}

function combineTexts(texts: Array<string | null | undefined>): string | null {
  const combined = texts
    .map((text) => normalizeText(text))
    .filter((text): text is string => Boolean(text))
    .join(' ')
    .trim()
  return combined || null
}

function includesAnyInTexts(texts: Array<string | null | undefined>, needles: string[]): boolean {
  return includesAny(combineTexts(texts), needles)
}

function hasViabilitySignal(texts: Array<string | null | undefined>): boolean {
  return includesAnyInTexts(texts, [
    'viable myocardium',
    'viability',
    'non-viable',
    'nonviable',
    'transmural scar',
    'transmurality',
    '1-25%',
    '26-50%',
    '51-75%',
    '76-100%',
    '<=50%',
    '>50%',
  ])
}

function sentence(value: string): string {
  const trimmed = value.trim()
  if (!trimmed) return ''
  return /[.!?]$/.test(trimmed) ? trimmed : `${trimmed}.`
}

function joinSentences(items: string[], limit: number): string {
  return items
    .map((item) => sentence(item))
    .filter(Boolean)
    .slice(0, limit)
    .join(' ')
}

function extractTerritories(texts: Array<string | null | undefined>): string[] {
  const joined = texts.map((text) => normalizeText(text)?.toUpperCase() ?? '').join(' ')
  const territories: string[] = []
  for (const territory of ['LAD', 'LCX', 'RCA']) {
    if (joined.includes(territory)) territories.push(territory)
  }
  return territories
}

function formatTerritories(territories: string[]): string {
  if (territories.length === 0) return 'the dominant territory'
  if (territories.length === 1) return `the ${territories[0]} territory`
  if (territories.length === 2) return `the ${territories[0]} and ${territories[1]} territories`
  return `${territories.slice(0, -1).join(', ')}, and ${territories[territories.length - 1]} territories`
}

function pickPrimaryTheme(input: CmrCaseLessonsInput): CmrCaseLessonsTheme {
  const { sectionSummaries, reportType } = input
  const perfusion = sectionSummaries.perfusion
  const tissue = sectionSummaries.tissue
  const valves = sectionSummaries.valves
  const ph = sectionSummaries.ph
  const thrombus = sectionSummaries.thrombus
  const perfusionAndConclusions = [perfusion, ...input.conclusionLines]
  const tissueAndConclusions = [tissue, ...input.conclusionLines]
  const valveAndConclusions = [valves, ...input.conclusionLines]
  const phAndConclusions = [ph, ...input.conclusionLines]
  const thrombusAndConclusions = [thrombus, ...input.conclusionLines]

  if (
    reportType === 'stress'
    && includesAnyInTexts(perfusionAndConclusions, [
      'adjacent viable myocardium',
      'peri-infarct',
      'extends beyond',
      'extend beyond',
      'exceeds infarct-pattern lge',
      'consistent with inducible ischaemia',
    ])
    && hasViabilitySignal(tissueAndConclusions)
  ) {
    return 'stress-perfusion-lge-viability'
  }

  if (
    reportType === 'stress'
    && includesAnyInTexts(perfusionAndConclusions, ['no inducible perfusion defect', 'no inducible ischaemia'])
    && includesAnyInTexts(tissueAndConclusions, ['infarction', 'scar', 'fibrosis', 'viability', 'transmural'])
  ) {
    return 'stress-scar-without-ischaemia'
  }

  if (includesAnyInTexts(tissueAndConclusions, ['mid-wall', 'subepicardial', 'non-ischaemic pattern'])) {
    return 'non-ischaemic-tissue-pattern'
  }

  if (normalizeText(thrombus) && !includesAnyInTexts(thrombusAndConclusions, ['no thrombus'])) {
    return 'thrombus-characterisation'
  }

  if (
    normalizeText(valves)
    && !includesAnyInTexts(valveAndConclusions, ['no significant valvular abnormality', 'no moderate or severe valvular abnormality'])
  ) {
    return 'valve-flow-and-morphology'
  }

  if (
    normalizeText(ph)
    && !includesAnyInTexts(phAndConclusions, ['low probability of a pulmonary hypertension phenotype', 'no convincing'])
  ) {
    return 'ph-physiology-integration'
  }

  return 'ventricular-phenotype'
}

function buildProtocolHighlights(
  input: CmrCaseLessonsInput,
  theme: CmrCaseLessonsTheme,
): string[] {
  const highlights: string[] = []

  if (input.reportType === 'stress') {
    highlights.push(
      'This protocol is powerful because cine function, infarct imaging, and vasodilator perfusion can be integrated in one study rather than interpreted as separate fragments.',
    )
  } else if (input.nonContrast) {
    highlights.push(
      'This is a non-contrast CMR study, so interpretation has to lean more heavily on cine phenotype and native tissue information than on LGE.',
    )
  } else {
    highlights.push(
      'Contrast enhancement is important here because it allows the ventricular phenotype to be tested directly against tissue characterisation rather than inferred from cine appearances alone.',
    )
  }

  if (
    input.tissueParametersPresent.length > 0
    && theme !== 'stress-perfusion-lge-viability'
    && theme !== 'stress-scar-without-ischaemia'
  ) {
    highlights.push(
      `Mapping data are available (${input.tissueParametersPresent.join(', ')}), which is useful as supportive tissue context rather than a standalone diagnosis in every case.`,
    )
  }

  if (input.fourDFlow) {
    highlights.push(
      '4D-flow is available alongside 2D phase-contrast flow, which widens the haemodynamic and pulmonary vascular learning available from the case.',
    )
  }

  return highlights
}

function buildConfidenceHighlights(
  input: CmrCaseLessonsInput,
  theme: CmrCaseLessonsTheme,
): string[] {
  const highlights: string[] = []
  const territories = formatTerritories(
    extractTerritories([
      input.sectionSummaries.lv,
      input.sectionSummaries.tissue,
      input.sectionSummaries.perfusion,
      ...input.conclusionLines,
    ]),
  )

  if (input.reportType === 'stress' && input.adequateStress === true) {
    highlights.push(
      'Stress adequacy was established, so a negative or positive perfusion result carries more interpretive weight than it would in a submaximal study.',
    )
  }

  if (
    theme === 'stress-perfusion-lge-viability'
    || theme === 'stress-scar-without-ischaemia'
  ) {
    highlights.push(
      `Confidence is strengthened because regional function, infarct-pattern LGE, and perfusion can be cross-checked in ${territories} rather than inferred from one sequence alone.`,
    )
  }

  if (theme === 'thrombus-characterisation' && includesAny(input.sectionSummaries.thrombus, ['post-contrast imaging', 'internal enhancement'])) {
    highlights.push(
      'Post-contrast thrombus characterisation is especially valuable here because it moves the diagnosis beyond cine morphology alone.',
    )
  }

  if (theme === 'valve-flow-and-morphology') {
    highlights.push(
      'Valve confidence is higher when morphology and flow-derived severity travel together, rather than forcing the case to rely on one domain only.',
    )
  }

  if (theme === 'ph-physiology-integration') {
    highlights.push(
      'PH confidence is strongest when right-heart remodelling, septal signs, pulmonary vascular behaviour, and left-heart loading are read as one physiological pattern.',
    )
  }

  return highlights
}

function buildInterpretiveHighlights(
  input: CmrCaseLessonsInput,
  theme: CmrCaseLessonsTheme,
): string[] {
  const territories = formatTerritories(
    extractTerritories([
      input.sectionSummaries.lv,
      input.sectionSummaries.tissue,
      input.sectionSummaries.perfusion,
      ...input.conclusionLines,
    ]),
  )

  switch (theme) {
    case 'stress-perfusion-lge-viability':
      return [
        `In this case, the main interpretive step is recognising that the stress abnormality in ${territories} extends beyond the infarct-pattern scar, which is the CMR signature of peri-infarct ischaemia in still-viable myocardium rather than infarction alone.`,
      ]
    case 'stress-scar-without-ischaemia':
      return [
        `This is a scar-characterisation and viability case as much as a stress case: when the perfusion abnormality in ${territories} is confined to infarct-pattern LGE, it should be read as matched scar rather than overcalled as residual inducible ischaemia.`,
      ]
    case 'non-ischaemic-tissue-pattern':
      return [
        'The tissue pattern is the real teaching signal here, so the diagnosis has to be read from enhancement distribution and morphology rather than pushed into a coronary-territory template.',
      ]
    case 'thrombus-characterisation':
      return [
        'This is an evidence-led thrombus case: morphology and location matter, but the decisive CMR question is whether post-contrast imaging supports an avascular thrombus rather than an alternative mass or filling defect.',
      ]
    case 'valve-flow-and-morphology':
      return [
        'The value of CMR here is not just naming valve disease, but showing that the morphological mechanism and the flow-derived severity point in the same direction.',
      ]
    case 'ph-physiology-integration':
      return [
        'The teaching point is physiological synthesis: pulmonary hypertension on CMR is not a single-number diagnosis, but a pattern assembled from right-heart remodelling, septal loading, pulmonary vascular behaviour, and left-heart context.',
      ]
    default:
      return [
        'The important lesson is to turn ventricular function, regional dysfunction, and tissue phenotype into one coherent myocardial story rather than reporting each domain as an isolated abnormality.',
      ]
  }
}

function buildAdvancedLearningHighlights(
  input: CmrCaseLessonsInput,
  theme: CmrCaseLessonsTheme,
): string[] {
  const highlights: string[] = []
  const teachingCorpus = combineTexts([
    input.sectionSummaries.tissue,
    input.sectionSummaries.perfusion,
    ...input.conclusionLines,
  ])?.toLowerCase() ?? ''
  const territories = formatTerritories(
    extractTerritories([
      input.sectionSummaries.tissue,
      input.sectionSummaries.perfusion,
      ...input.conclusionLines,
    ]),
  )

  if (
    (theme === 'stress-perfusion-lge-viability' || theme === 'stress-scar-without-ischaemia')
    && input.tissueParametersPresent.length > 0
  ) {
    highlights.push(
      'In ischaemic cases, mapping can add supportive context, but transmural LGE and the perfusion-scar relationship usually remain the decisive CMR teaching points.',
    )
  }

  if (theme === 'stress-perfusion-lge-viability') {
    highlights.push(
      `The viability teaching point in ${territories} is segment-level rather than territory-level shorthand: segments with <=50% transmural scar retain recovery potential, whereas >50% transmural involvement progressively limits recovery.`,
    )
  }

  if (theme === 'stress-scar-without-ischaemia') {
    highlights.push(
      teachingCorpus.includes('76-100% transmural scar') || teachingCorpus.includes('no meaningful viability') || teachingCorpus.includes('non-viable')
        ? 'When the stress defect is confined to dense infarct scar, the key teaching point is that a matched perfusion abnormality does not imply residual ischaemia; 76-100% transmural scar carries no meaningful viability.'
        : teachingCorpus.includes('51-75% transmural scar') || teachingCorpus.includes('limited viability') || teachingCorpus.includes('>50% transmural scar')
          ? 'Matched scar on stress imaging still needs viability language: once scar burden is >50% transmural, the case is about limited recovery potential rather than hidden residual ischaemia.'
          : teachingCorpus.includes('26-50% transmural scar') || teachingCorpus.includes('1-25% transmural scar') || teachingCorpus.includes('preserved viability') || teachingCorpus.includes('<=50% transmural scar')
            ? 'A negative stress result should not make you under-call viability; scar that remains <=50% transmural still retains recovery potential even when no residual inducible ischaemia is demonstrated.'
            : 'A negative stress result should not be mistaken for a normal myocardium study; it means no residual inducible ischaemia, not absence of established infarct scar or viability implications.',
    )
  }

  if (theme === 'valve-flow-and-morphology') {
    highlights.push(
      'Regurgitant fraction and flow-derived volumes keep the valve interpretation quantitative and stop morphology from becoming an ungrounded descriptive label.',
    )
  }

  if (theme === 'thrombus-characterisation') {
    highlights.push(
      'Avascular behaviour on post-contrast imaging is a higher-yield thrombus clue than cine appearance alone, especially for mural lesions.',
    )
  }

  if (theme === 'ph-physiology-integration' && input.fourDFlow) {
    highlights.push(
      '4D-flow findings such as vortex formation are most useful when they reinforce a broader right-heart and pulmonary vascular phenotype, not when they are read in isolation.',
    )
  }

  if (highlights.length === 0 && input.tissueParametersPresent.length > 0) {
    highlights.push(
      'Mapping values are most helpful when they deepen the dominant phenotype or confidence statement, rather than distracting from the primary CMR diagnosis.',
    )
  }

  return highlights
}

function buildTeachingThemeLabels(theme: CmrCaseLessonsTheme): string[] {
  switch (theme) {
    case 'stress-perfusion-lge-viability':
      return ['stress perfusion and viability', 'perfusion-scar correlation', 'ischaemic CMR reasoning']
    case 'stress-scar-without-ischaemia':
      return ['stress perfusion and prior infarction', 'scar without residual inducible ischaemia']
    case 'non-ischaemic-tissue-pattern':
      return ['non-ischaemic tissue pattern recognition', 'pattern-led LGE interpretation']
    case 'thrombus-characterisation':
      return ['thrombus characterisation', 'post-contrast diagnostic confidence']
    case 'valve-flow-and-morphology':
      return ['valve mechanism and flow integration', 'quantitative valve assessment']
    case 'ph-physiology-integration':
      return ['pulmonary hypertension physiology', 'right-heart and pulmonary vascular integration']
    default:
      return ['ventricular phenotype integration', 'functional and tissue synthesis']
  }
}

function buildInterpretivePitfall(
  theme: CmrCaseLessonsTheme,
  input: Pick<CmrCaseLessonsInput, 'fourDFlow' | 'reportType'>,
): string {
  switch (theme) {
    case 'stress-perfusion-lge-viability':
      return 'Do not flatten viability into a territory-wide label when scar transmurality varies by segment; the crucial question is whether inducible ischaemia sits in myocardium that still has recovery potential.'
    case 'stress-scar-without-ischaemia':
      return 'Do not overcall a matched stress defect as residual ischaemia when it is confined to infarct-pattern scar; the real interpretive question is whether any viable myocardium remains and whether perfusion extends beyond scar.'
    case 'non-ischaemic-tissue-pattern':
      return 'Do not force a non-ischaemic enhancement pattern into a coronary explanation just because dysfunction is present; the distribution is the teaching signal.'
    case 'thrombus-characterisation':
      return 'Do not overcall a thrombus from cine appearance alone when post-contrast characterisation is unavailable or indeterminate.'
    case 'valve-flow-and-morphology':
      return 'Do not let descriptive morphology outrun the haemodynamics; the most useful CMR teaching comes when mechanism and flow-derived severity agree.'
    case 'ph-physiology-integration':
      return input.fourDFlow
        ? 'Do not turn 4D-flow signs such as vortex formation into a standalone diagnosis; they are most useful when they reinforce the broader right-heart and pulmonary vascular phenotype.'
        : 'Do not reduce pulmonary hypertension physiology to one loading number or one chamber metric; the phenotype lives in the integrated pattern.'
    default:
      return input.reportType === 'stress'
        ? 'Do not let the headline LVEF hide the explanatory value of the regional and tissue pattern; the case still needs to be reasoned through territory, scar, and perfusion.'
        : 'Do not let a global functional label replace the myocardial story; ventricular phenotype, regional function, and tissue findings have to be read together.'
  }
}

function buildReportingPearls(
  input: CmrCaseLessonsInput,
  theme: CmrCaseLessonsTheme,
): string[] {
  const territories = formatTerritories(
    extractTerritories([
      input.sectionSummaries.lv,
      input.sectionSummaries.tissue,
      input.sectionSummaries.perfusion,
      ...input.conclusionLines,
    ]),
  )

  switch (theme) {
    case 'stress-perfusion-lge-viability':
      return [
        `In the report, say explicitly that the perfusion abnormality in ${territories} extends beyond infarct-pattern scar, because that wording signals peri-infarct ischaemia in viable myocardium rather than scar alone.`,
      ]
    case 'stress-scar-without-ischaemia':
      return [
        `In the report, tie the stress result directly to scar: state that the perfusion abnormality in ${territories} is confined to infarct-pattern LGE with no inducible ischaemia beyond scar, and avoid labelling the territory as residual ischaemia without that qualifier.`,
      ]
    case 'non-ischaemic-tissue-pattern':
      return [
        'In the report, lead with the enhancement pattern and distribution, then let the implied phenotype follow; avoid forcing the wording into a coronary-territory template.',
      ]
    case 'thrombus-characterisation':
      return [
        'In the report, mention the avascular post-contrast appearance when available, because that is usually the decisive feature and is stronger than cine morphology alone.',
      ]
    case 'valve-flow-and-morphology':
      return [
        'In the report, phrase valve disease as mechanism plus quantitative haemodynamic severity, rather than isolated severity labels without flow context.',
      ]
    case 'ph-physiology-integration':
      return [
        'In the report, keep pulmonary hypertension phrasing phenotype-led and concise; state the physiology call directly and avoid replaying every loading metric in the conclusion.',
      ]
    default:
      return [
        'In the report, lead with the dominant myocardial phenotype and keep mapping values or secondary chamber findings in support unless they are diagnosis-defining.',
      ]
  }
}

function buildCaseDiscussionText(data: Omit<CmrCaseLessonsData, 'deterministicText'>): string {
  const sections: string[] = []

  sections.push(
    `Case discussion:\n${joinSentences(data.interpretiveHighlights, 1)}`,
  )

  const acquisitionAndConfidence = [
    ...data.protocolHighlights.slice(0, 1),
    ...data.confidenceHighlights.slice(0, 2),
  ]
  if (acquisitionAndConfidence.length > 0) {
    sections.push(
      `Acquisition and confidence:\n${joinSentences(acquisitionAndConfidence, 2)}`,
    )
  }

  const advancedPoints = [
    ...data.advancedLearningHighlights.slice(0, 2),
  ]
  if (advancedPoints.length > 0) {
    sections.push(
      `CMR learning point:\n${joinSentences(advancedPoints, 2)}`,
    )
  }

  if (data.reportingPearls.length > 0) {
    sections.push(
      `Reporting pearl:\n${joinSentences(data.reportingPearls, 1)}`,
    )
  }

  return sections.filter(Boolean).join('\n\n')
}

function buildAdvancedTeachingPointText(
  data: Omit<CmrCaseLessonsData, 'deterministicText'>,
  input: CmrCaseLessonsInput,
  theme: CmrCaseLessonsTheme,
): string {
  const primaryTeachingPoint = joinSentences(
    [
      data.advancedLearningHighlights[0],
      data.interpretiveHighlights[0],
    ].filter(Boolean),
    2,
  )

  const whyItMatters = joinSentences(
    [
      buildInterpretivePitfall(theme, input),
      data.confidenceHighlights[0],
      data.protocolHighlights[0],
    ].filter(Boolean),
    2,
  )

  return [
    `Advanced teaching point:\n${primaryTeachingPoint}`,
    `Why it matters in CMR:\n${whyItMatters}`,
  ].filter(Boolean).join('\n\n')
}

function buildDeterministicText(
  data: Omit<CmrCaseLessonsData, 'deterministicText'>,
  input: CmrCaseLessonsInput,
  theme: CmrCaseLessonsTheme,
): string {
  return data.mode === 'advanced-teaching-point'
    ? buildAdvancedTeachingPointText(data, input, theme)
    : buildCaseDiscussionText(data)
}

export function buildCmrCaseLessonsData(
  input: CmrCaseLessonsInput,
  mode: CmrCaseLessonsMode = 'case-discussion',
): CmrCaseLessonsData {
  const sectionSummaries: CmrCaseLessonsSections = {
    lv: normalizeText(input.sectionSummaries.lv),
    rv: normalizeText(input.sectionSummaries.rv),
    tissue: normalizeText(input.sectionSummaries.tissue),
    perfusion: normalizeText(input.sectionSummaries.perfusion),
    valves: normalizeText(input.sectionSummaries.valves),
    ph: normalizeText(input.sectionSummaries.ph),
    thrombus: normalizeText(input.sectionSummaries.thrombus),
  }
  const conclusionLines = input.conclusionLines.map((line) => sentence(line)).filter(Boolean)
  const theme = pickPrimaryTheme({ ...input, sectionSummaries, conclusionLines })

  const baseData = {
    mode,
    reportType: input.reportType,
    protocolHighlights: buildProtocolHighlights({ ...input, sectionSummaries, conclusionLines }, theme),
    confidenceHighlights: buildConfidenceHighlights({ ...input, sectionSummaries, conclusionLines }, theme),
    interpretiveHighlights: buildInterpretiveHighlights({ ...input, sectionSummaries, conclusionLines }, theme),
    advancedLearningHighlights: buildAdvancedLearningHighlights({ ...input, sectionSummaries, conclusionLines }, theme),
    reportingPearls: buildReportingPearls({ ...input, sectionSummaries, conclusionLines }, theme),
    teachingThemes: buildTeachingThemeLabels(theme),
    notableMeasurements: input.notableMeasurements.map((item) => normalizeText(item)).filter((item): item is string => Boolean(item)),
    sectionSummaries,
    conclusionLines,
  }

  return {
    deterministicText: buildDeterministicText(baseData, { ...input, sectionSummaries, conclusionLines }, theme),
    ...baseData,
  }
}

export function buildCmrCaseLessonsSignature(data: CmrCaseLessonsData): string {
  return JSON.stringify({
    mode: data.mode,
    reportType: data.reportType,
    protocolHighlights: data.protocolHighlights,
    confidenceHighlights: data.confidenceHighlights,
    interpretiveHighlights: data.interpretiveHighlights,
    advancedLearningHighlights: data.advancedLearningHighlights,
    reportingPearls: data.reportingPearls,
    teachingThemes: data.teachingThemes,
    notableMeasurements: data.notableMeasurements,
    sectionSummaries: data.sectionSummaries,
    conclusionLines: data.conclusionLines,
  })
}

export function normalizeCmrCaseLessonsProse(prose: string | null | undefined): string {
  const normalized = String(prose ?? '')
    .replace(/[\u2013\u2014]/g, '-')
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u201C\u201D]/g, '"')
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()

  return normalized
}
