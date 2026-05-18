import type { CmrExtractionResult } from '@/lib/cmr-api'
import type { RangeParam } from '@/lib/cmr-chart-scaling'
import type { PreviousStudy } from '@/lib/cmr-previous-study'

export type CmrRangeParamRecord = Record<string, RangeParam>

export type CmrReportInput = {
  reportText: string
  reportType: 'standard' | 'stress'
  fourDFlow: boolean
  nonContrast: boolean
  fileName: string | null
}

export type CmrThrombusMorphology = {
  maxDiameter: number | null
  shape: string | null
  mobility: string | null
  attachment: string | null
  surface: string | null
}

export type CmrThrombusEntryDraft = {
  id: string
  primary: string | null
  sublocation: string | null
  otherLocation: string
  morphology: CmrThrombusMorphology
  confidence: string | null
  postContrast: string | null
}

export type CmrThrombusSummaryDraft = {
  llmProse: string | null
  llmProseSourceSignature: string | null
}

export type CmrValveFindingDraft = {
  leaflets: string[]
  detailValues: Record<string, string>
  notes: string
}

export type CmrValveSummaryDraft = {
  llmProse: string | null
  llmProseSourceSignature: string | null
}

export type CmrOutputValveKey = 'mitral' | 'aortic' | 'tricuspid' | 'pulmonary'

export type CmrOutputUndoRegenerateSnapshot = {
  draftText: string
  generatedPreviewText: string
  reportGenerated: boolean
  conclusionLines: string[]
  conclusionSourceSignature: string | null
  sectionLabel: string | null
  createdAt: string | null
}

export type CmrOutputDraft = {
  vascularArrangementKey: string
  reportGenerated: boolean
  editedReportText: string | null
  undoRegenerateSnapshot: CmrOutputUndoRegenerateSnapshot | null
  conclusionLines: string[]
  conclusionSourceSignature: string | null
  caseDiscussionProse: string | null
  caseDiscussionSourceSignature: string | null
  advancedTeachingProse: string | null
  advancedTeachingSourceSignature: string | null
  caseQaConversation: Array<{
    role: 'user' | 'assistant'
    content: string
  }>
  additionalQuantKeys: string[]
  selectedValveKeys: CmrOutputValveKey[]
  includeValveAssessment: boolean
  includePhAssessment: boolean
}

export type CmrCasePayload = {
  schemaVersion: number
  reportInput: CmrReportInput
  extractionResult: CmrExtractionResult | null
  previousStudies: PreviousStudy[]
  previousStudiesVisible: boolean
  quantitativeUi: {
    showFilter: 'all' | 'recorded'
    indexFilter: 'all' | 'indexed'
    chartMode: 'off' | 'on'
    abnormalFilter: 'all' | 'abnormal'
    severityMode: 'off' | 'abnormal'
    scalingMode: 'factory' | 'global' | 'per-meas'
    rangeParams: CmrRangeParamRecord
  }
  rwma: {
    segStates: Record<number, number>
    activeBrush: number
    llmProse: string | null
    llmProseSourceSignature: string | null
  }
  lge: {
    segStates: Record<number, number>
    patternStates: Record<number, number>
    activePattern: number
    rvInsertionPointFibrosis: boolean
    llmProse: string | null
    llmProseSourceSignature: string | null
  }
  perfusion: {
    stressSegStates: Record<number, number>
    restSegStates: Record<number, number>
    stressPersistenceBeats: number
    restPersistenceBeats: number
    adequateStress: boolean
    showLgeOverlay: boolean
    llmProse: string | null
    llmProseSourceSignature: string | null
    activeBrush: number
  }
  ph: {
    selectedSection: string
    showFilter: 'all' | 'recorded'
    indexFilter: 'all' | 'indexed'
    abnormalFilter: 'all' | 'abnormal'
    chartMode: 'off' | 'on'
    severityMode: 'off' | 'abnormal'
    scalingMode: 'factory' | 'global' | 'per-meas'
    rangeParams: CmrRangeParamRecord
    manualNumeric: Record<string, string>
    choices: Record<string, string | null>
    texts: Record<string, string>
    llmProse: string | null
    llmProseSourceSignature: string | null
  }
  valves: {
    selectedValve: string | null
    morphologies: Record<string, { findings: Record<string, CmrValveFindingDraft> }>
    summaries: Record<string, CmrValveSummaryDraft>
  }
  thrombus: {
    entries: CmrThrombusEntryDraft[]
    activeEntryId: string | null
    llmProse: string | null
    llmProseSourceSignature: string | null
  }
  output: CmrOutputDraft
}

function createId(prefix: string): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return `${prefix}-${crypto.randomUUID()}`
  }
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
}

function createSegState(max: number, value: number = 0): Record<number, number> {
  const next: Record<number, number> = {}
  for (let i = 1; i <= max; i += 1) {
    next[i] = value
  }
  return next
}

function normalizeRangeParams(value: unknown): CmrRangeParamRecord {
  if (!value || typeof value !== 'object') return {}
  const entries = Object.entries(value as Record<string, unknown>)
  const next: CmrRangeParamRecord = {}
  for (const [key, item] of entries) {
    if (!item || typeof item !== 'object') continue
    const rangeStart = Number((item as Record<string, unknown>).rangeStart)
    const rangeWidth = Number((item as Record<string, unknown>).rangeWidth)
    if (!Number.isFinite(rangeStart) || !Number.isFinite(rangeWidth)) continue
    next[key] = { rangeStart, rangeWidth }
  }
  return next
}

function normalizeOutputUndoRegenerateSnapshot(value: unknown): CmrOutputUndoRegenerateSnapshot | null {
  if (!value || typeof value !== 'object') return null
  const source = value as Record<string, unknown>
  const draftText = String(source.draftText ?? '')
  const generatedPreviewText = String(source.generatedPreviewText ?? '')
  const conclusionLines = Array.isArray(source.conclusionLines)
    ? source.conclusionLines.map((item) => String(item))
    : []

  return {
    draftText,
    generatedPreviewText,
    reportGenerated: Boolean(source.reportGenerated),
    conclusionLines,
    conclusionSourceSignature: source.conclusionSourceSignature == null
      ? null
      : String(source.conclusionSourceSignature),
    sectionLabel: source.sectionLabel == null ? null : String(source.sectionLabel),
    createdAt: source.createdAt == null ? null : String(source.createdAt),
  }
}

function normalizeStudies(value: unknown): PreviousStudy[] {
  if (!Array.isArray(value)) return []
  return value.filter((item): item is PreviousStudy => !!item && typeof item === 'object') as PreviousStudy[]
}

function normalizeValveMorphologies(value: unknown): CmrCasePayload['valves']['morphologies'] {
  const defaultMorphologies: CmrCasePayload['valves']['morphologies'] = {
    mitral: { findings: {} },
    aortic: { findings: {} },
    tricuspid: { findings: {} },
    pulmonary: { findings: {} },
  }
  if (!value || typeof value !== 'object') return defaultMorphologies
  const source = value as Record<string, unknown>
  const next: CmrCasePayload['valves']['morphologies'] = {}
  for (const valveKey of Object.keys(defaultMorphologies)) {
    const valveValue = source[valveKey]
    const findingsValue = valveValue && typeof valveValue === 'object'
      ? (valveValue as Record<string, unknown>).findings
      : null
    const findings: Record<string, CmrValveFindingDraft> = {}
    if (findingsValue && typeof findingsValue === 'object') {
      for (const [findingKey, findingValue] of Object.entries(findingsValue as Record<string, unknown>)) {
        if (!findingValue || typeof findingValue !== 'object') continue
        const draft = findingValue as Record<string, unknown>
        findings[findingKey] = {
          leaflets: Array.isArray(draft.leaflets) ? draft.leaflets.map((item) => String(item)) : [],
          detailValues: draft.detailValues && typeof draft.detailValues === 'object'
            ? Object.fromEntries(
                Object.entries(draft.detailValues as Record<string, unknown>).map(([key, item]) => [key, String(item ?? '')]),
              )
            : {},
          notes: String(draft.notes ?? ''),
        }
      }
    }
    next[valveKey] = { findings }
  }
  return next
}

function normalizeValveSummaries(value: unknown): CmrCasePayload['valves']['summaries'] {
  const defaultSummaries: CmrCasePayload['valves']['summaries'] = {
    mitral: { llmProse: null, llmProseSourceSignature: null },
    aortic: { llmProse: null, llmProseSourceSignature: null },
    tricuspid: { llmProse: null, llmProseSourceSignature: null },
    pulmonary: { llmProse: null, llmProseSourceSignature: null },
  }
  if (!value || typeof value !== 'object') return defaultSummaries

  const next = { ...defaultSummaries }
  for (const key of Object.keys(defaultSummaries)) {
    const source = (value as Record<string, unknown>)[key]
    if (!source || typeof source !== 'object') continue
    next[key] = {
      llmProse: (source as Record<string, unknown>).llmProse == null
        ? null
        : String((source as Record<string, unknown>).llmProse),
      llmProseSourceSignature: (source as Record<string, unknown>).llmProseSourceSignature == null
        ? null
        : String((source as Record<string, unknown>).llmProseSourceSignature),
    }
  }

  return next
}

export function createEmptyThrombusEntry(): CmrThrombusEntryDraft {
  return {
    id: createId('thrombus'),
    primary: null,
    sublocation: null,
    otherLocation: '',
    morphology: {
      maxDiameter: null,
      shape: null,
      mobility: null,
      attachment: null,
      surface: null,
    },
    confidence: null,
    postContrast: null,
  }
}

export function createDefaultCmrCasePayload(): CmrCasePayload {
  const defaultThrombusEntry = createEmptyThrombusEntry()
  return {
    schemaVersion: 1,
    reportInput: {
      reportText: '',
      reportType: 'standard',
      fourDFlow: false,
      nonContrast: false,
      fileName: null,
    },
    extractionResult: null,
    previousStudies: [],
    previousStudiesVisible: true,
    quantitativeUi: {
      showFilter: 'recorded',
      indexFilter: 'all',
      chartMode: 'on',
      abnormalFilter: 'all',
      severityMode: 'off',
      scalingMode: 'global',
      rangeParams: {},
    },
    rwma: {
      segStates: createSegState(17),
      activeBrush: 0,
      llmProse: null,
      llmProseSourceSignature: null,
    },
    lge: {
      segStates: createSegState(17),
      patternStates: createSegState(17),
      activePattern: 1,
      rvInsertionPointFibrosis: false,
      llmProse: null,
      llmProseSourceSignature: null,
    },
    perfusion: {
      stressSegStates: createSegState(17),
      restSegStates: createSegState(17),
      stressPersistenceBeats: 0,
      restPersistenceBeats: 0,
      adequateStress: true,
      showLgeOverlay: false,
      llmProse: null,
      llmProseSourceSignature: null,
      activeBrush: 0,
    },
    ph: {
      selectedSection: 'rv',
      showFilter: 'recorded',
      indexFilter: 'all',
      abnormalFilter: 'all',
      chartMode: 'on',
      severityMode: 'off',
      scalingMode: 'global',
      rangeParams: {},
      manualNumeric: {},
      choices: {
        septalFlattening: 'none',
        septalMotion: 'normal',
        interatrialSeptalBowing: 'none',
        pericardialEffusion: 'none',
        venaCava: 'normal',
        trSeverity: 'none',
        mrSeverity: 'none',
        prSeverity: 'none',
        vortexFormation: 'not-assessed',
        vortexSeverity: null,
        vortexLocation: 'not-specified',
        helicity: 'not-assessed',
        helicitySeverity: null,
        helicityLocation: 'not-specified',
      },
      texts: {
        ancillaryFindings: '',
        additionalDetails: '',
        flowComment: '',
      },
      llmProse: null,
      llmProseSourceSignature: null,
    },
    valves: {
      selectedValve: null,
      morphologies: {
        mitral: { findings: {} },
        aortic: { findings: {} },
        tricuspid: { findings: {} },
        pulmonary: { findings: {} },
      },
      summaries: {
        mitral: { llmProse: null, llmProseSourceSignature: null },
        aortic: { llmProse: null, llmProseSourceSignature: null },
        tricuspid: { llmProse: null, llmProseSourceSignature: null },
        pulmonary: { llmProse: null, llmProseSourceSignature: null },
      },
    },
    thrombus: {
      entries: [defaultThrombusEntry],
      activeEntryId: defaultThrombusEntry.id,
      llmProse: null,
      llmProseSourceSignature: null,
    },
    output: {
      vascularArrangementKey: 'normal',
      reportGenerated: false,
      editedReportText: null,
      undoRegenerateSnapshot: null,
      conclusionLines: [],
      conclusionSourceSignature: null,
      caseDiscussionProse: null,
      caseDiscussionSourceSignature: null,
      advancedTeachingProse: null,
      advancedTeachingSourceSignature: null,
      caseQaConversation: [],
      additionalQuantKeys: [],
      selectedValveKeys: ['mitral', 'aortic', 'tricuspid', 'pulmonary'],
      includeValveAssessment: false,
      includePhAssessment: false,
    },
  }
}

export function normalizeCmrCasePayload(payload: Record<string, unknown> | null | undefined): CmrCasePayload {
  const defaults = createDefaultCmrCasePayload()
  const source = payload && typeof payload === 'object' ? payload : {}
  const reportInputValue = source.reportInput
  const reportInputSource = reportInputValue && typeof reportInputValue === 'object'
    ? (reportInputValue as Record<string, unknown>)
    : {}
  const quantitativeUiValue = source.quantitativeUi
  const quantitativeUiSource = quantitativeUiValue && typeof quantitativeUiValue === 'object'
    ? (quantitativeUiValue as Record<string, unknown>)
    : {}
  const rwmaValue = source.rwma
  const rwmaSource = rwmaValue && typeof rwmaValue === 'object' ? (rwmaValue as Record<string, unknown>) : {}
  const lgeValue = source.lge
  const lgeSource = lgeValue && typeof lgeValue === 'object' ? (lgeValue as Record<string, unknown>) : {}
  const perfusionValue = source.perfusion
  const perfusionSource = perfusionValue && typeof perfusionValue === 'object'
    ? (perfusionValue as Record<string, unknown>)
    : {}
  const phValue = source.ph
  const phSource = phValue && typeof phValue === 'object' ? (phValue as Record<string, unknown>) : {}
  const valvesValue = source.valves
  const valvesSource = valvesValue && typeof valvesValue === 'object' ? (valvesValue as Record<string, unknown>) : {}
  const thrombusValue = source.thrombus
  const thrombusSource = thrombusValue && typeof thrombusValue === 'object' ? (thrombusValue as Record<string, unknown>) : {}
  const outputValue = source.output
  const outputSource = outputValue && typeof outputValue === 'object' ? (outputValue as Record<string, unknown>) : {}
  const legacyCaseLessonsProse = outputSource.caseLessonsProse == null
    ? defaults.output.caseDiscussionProse
    : String(outputSource.caseLessonsProse)
  const legacyCaseLessonsSourceSignature = outputSource.caseLessonsSourceSignature == null
    ? defaults.output.caseDiscussionSourceSignature
    : String(outputSource.caseLessonsSourceSignature)

  const thrombusEntriesRaw = Array.isArray(thrombusSource.entries) ? thrombusSource.entries : defaults.thrombus.entries
  const thrombusEntries = thrombusEntriesRaw
    .filter((item): item is Record<string, unknown> => !!item && typeof item === 'object')
    .map((item) => ({
      id: String(item.id ?? createId('thrombus')),
      primary: item.primary == null ? null : String(item.primary),
      sublocation: item.sublocation == null ? null : String(item.sublocation),
      otherLocation: String(item.otherLocation ?? ''),
      morphology: {
        maxDiameter: item.morphology && typeof item.morphology === 'object' && Number.isFinite(Number((item.morphology as Record<string, unknown>).maxDiameter)) && Number((item.morphology as Record<string, unknown>).maxDiameter) > 0
          ? Number((item.morphology as Record<string, unknown>).maxDiameter)
          : null,
        shape: item.morphology && typeof item.morphology === 'object'
          ? ((item.morphology as Record<string, unknown>).shape == null ? null : String((item.morphology as Record<string, unknown>).shape))
          : null,
        mobility: item.morphology && typeof item.morphology === 'object'
          ? ((item.morphology as Record<string, unknown>).mobility == null ? null : String((item.morphology as Record<string, unknown>).mobility))
          : null,
        attachment: item.morphology && typeof item.morphology === 'object'
          ? ((item.morphology as Record<string, unknown>).attachment == null ? null : String((item.morphology as Record<string, unknown>).attachment))
          : null,
        surface: item.morphology && typeof item.morphology === 'object'
          ? ((item.morphology as Record<string, unknown>).surface == null ? null : String((item.morphology as Record<string, unknown>).surface))
          : null,
      },
      confidence: item.confidence == null ? null : String(item.confidence),
      postContrast: item.postContrast == null ? null : String(item.postContrast),
    }))

  const nextThrombusEntries = thrombusEntries.length > 0 ? thrombusEntries : defaults.thrombus.entries
  const activeEntryId = thrombusSource.activeEntryId == null ? null : String(thrombusSource.activeEntryId)

  return {
    schemaVersion: Number(source.schemaVersion ?? defaults.schemaVersion) || defaults.schemaVersion,
    reportInput: {
      reportText: String(reportInputSource.reportText ?? defaults.reportInput.reportText),
      reportType: reportInputSource.reportType === 'stress' ? 'stress' : defaults.reportInput.reportType,
      fourDFlow: Boolean(reportInputSource.fourDFlow ?? defaults.reportInput.fourDFlow),
      nonContrast: Boolean(reportInputSource.nonContrast ?? defaults.reportInput.nonContrast),
      fileName: reportInputSource.fileName == null ? null : String(reportInputSource.fileName),
    },
    extractionResult: (source.extractionResult as CmrExtractionResult | null | undefined) ?? defaults.extractionResult,
    previousStudies: normalizeStudies(source.previousStudies),
    previousStudiesVisible: Boolean(source.previousStudiesVisible ?? defaults.previousStudiesVisible),
    quantitativeUi: {
      showFilter: quantitativeUiSource.showFilter === 'all' ? 'all' : defaults.quantitativeUi.showFilter,
      indexFilter: quantitativeUiSource.indexFilter === 'indexed' ? 'indexed' : defaults.quantitativeUi.indexFilter,
      chartMode: quantitativeUiSource.chartMode === 'off' ? 'off' : defaults.quantitativeUi.chartMode,
      abnormalFilter: quantitativeUiSource.abnormalFilter === 'abnormal' ? 'abnormal' : defaults.quantitativeUi.abnormalFilter,
      severityMode: quantitativeUiSource.severityMode === 'abnormal' ? 'abnormal' : defaults.quantitativeUi.severityMode,
      scalingMode: quantitativeUiSource.scalingMode === 'factory' || quantitativeUiSource.scalingMode === 'per-meas'
        ? (quantitativeUiSource.scalingMode as 'factory' | 'per-meas')
        : defaults.quantitativeUi.scalingMode,
      rangeParams: normalizeRangeParams(quantitativeUiSource.rangeParams),
    },
    rwma: {
      segStates: rwmaSource.segStates && typeof rwmaSource.segStates === 'object'
        ? (rwmaSource.segStates as Record<number, number>)
        : defaults.rwma.segStates,
      activeBrush: Number(rwmaSource.activeBrush ?? defaults.rwma.activeBrush),
      llmProse: rwmaSource.llmProse == null ? null : String(rwmaSource.llmProse),
      llmProseSourceSignature: rwmaSource.llmProseSourceSignature == null
        ? null
        : String(rwmaSource.llmProseSourceSignature),
    },
    lge: {
      segStates: lgeSource.segStates && typeof lgeSource.segStates === 'object'
        ? (lgeSource.segStates as Record<number, number>)
        : defaults.lge.segStates,
      patternStates: lgeSource.patternStates && typeof lgeSource.patternStates === 'object'
        ? (lgeSource.patternStates as Record<number, number>)
        : defaults.lge.patternStates,
      activePattern: Number(lgeSource.activePattern ?? defaults.lge.activePattern),
      rvInsertionPointFibrosis: Boolean(lgeSource.rvInsertionPointFibrosis ?? defaults.lge.rvInsertionPointFibrosis),
      llmProse: lgeSource.llmProse == null ? null : String(lgeSource.llmProse),
      llmProseSourceSignature: lgeSource.llmProseSourceSignature == null ? null : String(lgeSource.llmProseSourceSignature),
    },
    perfusion: {
      stressSegStates: perfusionSource.stressSegStates && typeof perfusionSource.stressSegStates === 'object'
        ? (perfusionSource.stressSegStates as Record<number, number>)
        : defaults.perfusion.stressSegStates,
      restSegStates: perfusionSource.restSegStates && typeof perfusionSource.restSegStates === 'object'
        ? (perfusionSource.restSegStates as Record<number, number>)
        : defaults.perfusion.restSegStates,
      stressPersistenceBeats: Number.isFinite(Number(perfusionSource.stressPersistenceBeats))
        ? Math.max(0, Math.min(15, Number(perfusionSource.stressPersistenceBeats)))
        : defaults.perfusion.stressPersistenceBeats,
      restPersistenceBeats: Number.isFinite(Number(perfusionSource.restPersistenceBeats))
        ? Math.max(0, Math.min(15, Number(perfusionSource.restPersistenceBeats)))
        : defaults.perfusion.restPersistenceBeats,
      adequateStress: perfusionSource.adequateStress == null
        ? defaults.perfusion.adequateStress
        : Boolean(perfusionSource.adequateStress),
      showLgeOverlay: Boolean(perfusionSource.showLgeOverlay ?? defaults.perfusion.showLgeOverlay),
      llmProse: perfusionSource.llmProse == null ? null : String(perfusionSource.llmProse),
      llmProseSourceSignature: perfusionSource.llmProseSourceSignature == null
        ? null
        : String(perfusionSource.llmProseSourceSignature),
      activeBrush: Number(perfusionSource.activeBrush ?? defaults.perfusion.activeBrush),
    },
    ph: {
      selectedSection: phSource.selectedSection == null ? defaults.ph.selectedSection : String(phSource.selectedSection),
      showFilter: phSource.showFilter === 'all' ? 'all' : defaults.ph.showFilter,
      indexFilter: phSource.indexFilter === 'indexed' ? 'indexed' : defaults.ph.indexFilter,
      abnormalFilter: phSource.abnormalFilter === 'abnormal' ? 'abnormal' : defaults.ph.abnormalFilter,
      chartMode: phSource.chartMode === 'off' ? 'off' : defaults.ph.chartMode,
      severityMode: phSource.severityMode === 'abnormal' ? 'abnormal' : defaults.ph.severityMode,
      scalingMode: phSource.scalingMode === 'factory' || phSource.scalingMode === 'per-meas'
        ? (phSource.scalingMode as 'factory' | 'per-meas')
        : defaults.ph.scalingMode,
      rangeParams: normalizeRangeParams(phSource.rangeParams),
      manualNumeric: phSource.manualNumeric && typeof phSource.manualNumeric === 'object'
        ? Object.fromEntries(Object.entries(phSource.manualNumeric as Record<string, unknown>).map(([key, value]) => [key, String(value ?? '')]))
        : defaults.ph.manualNumeric,
      choices: phSource.choices && typeof phSource.choices === 'object'
        ? Object.fromEntries(Object.entries(phSource.choices as Record<string, unknown>).map(([key, value]) => [key, value == null ? null : String(value)]))
        : defaults.ph.choices,
      texts: phSource.texts && typeof phSource.texts === 'object'
        ? Object.fromEntries(Object.entries(phSource.texts as Record<string, unknown>).map(([key, value]) => [key, String(value ?? '')]))
        : defaults.ph.texts,
      llmProse: phSource.llmProse == null ? null : String(phSource.llmProse),
      llmProseSourceSignature: phSource.llmProseSourceSignature == null
        ? null
        : String(phSource.llmProseSourceSignature),
    },
    valves: {
      selectedValve: valvesSource.selectedValve == null ? null : String(valvesSource.selectedValve),
      morphologies: normalizeValveMorphologies(valvesSource.morphologies),
      summaries: normalizeValveSummaries(valvesSource.summaries),
    },
    thrombus: {
      entries: nextThrombusEntries,
      activeEntryId: activeEntryId && nextThrombusEntries.some((entry) => entry.id === activeEntryId)
        ? activeEntryId
        : nextThrombusEntries[0]?.id ?? null,
      llmProse: thrombusSource.llmProse == null
        ? null
        : String(thrombusSource.llmProse),
      llmProseSourceSignature: thrombusSource.llmProseSourceSignature == null
        ? null
        : String(thrombusSource.llmProseSourceSignature),
    },
    output: {
      vascularArrangementKey: outputSource.vascularArrangementKey == null
        ? defaults.output.vascularArrangementKey
        : String(outputSource.vascularArrangementKey),
      reportGenerated: outputSource.reportGenerated == null
        ? defaults.output.reportGenerated
        : Boolean(outputSource.reportGenerated),
      editedReportText: outputSource.editedReportText == null
        ? defaults.output.editedReportText
        : String(outputSource.editedReportText),
      undoRegenerateSnapshot: normalizeOutputUndoRegenerateSnapshot(outputSource.undoRegenerateSnapshot),
      conclusionLines: Array.isArray(outputSource.conclusionLines)
        ? outputSource.conclusionLines.map((item) => String(item)).filter(Boolean)
        : defaults.output.conclusionLines,
      conclusionSourceSignature: outputSource.conclusionSourceSignature == null
        ? defaults.output.conclusionSourceSignature
        : String(outputSource.conclusionSourceSignature),
      caseDiscussionProse: outputSource.caseDiscussionProse == null
        ? legacyCaseLessonsProse
        : String(outputSource.caseDiscussionProse),
      caseDiscussionSourceSignature: outputSource.caseDiscussionSourceSignature == null
        ? legacyCaseLessonsSourceSignature
        : String(outputSource.caseDiscussionSourceSignature),
      advancedTeachingProse: outputSource.advancedTeachingProse == null
        ? defaults.output.advancedTeachingProse
        : String(outputSource.advancedTeachingProse),
      advancedTeachingSourceSignature: outputSource.advancedTeachingSourceSignature == null
        ? defaults.output.advancedTeachingSourceSignature
        : String(outputSource.advancedTeachingSourceSignature),
      caseQaConversation: Array.isArray(outputSource.caseQaConversation)
        ? outputSource.caseQaConversation
            .filter((item): item is Record<string, unknown> => !!item && typeof item === 'object')
            .map((item) => ({
              role: (item.role === 'assistant' ? 'assistant' : 'user') as 'user' | 'assistant',
              content: String(item.content ?? '').trim(),
            }))
            .filter((item) => item.content.length > 0)
        : defaults.output.caseQaConversation,
      additionalQuantKeys: Array.isArray(outputSource.additionalQuantKeys)
        ? outputSource.additionalQuantKeys.map((item) => String(item)).filter(Boolean)
        : defaults.output.additionalQuantKeys,
      selectedValveKeys: Array.isArray(outputSource.selectedValveKeys)
        ? outputSource.selectedValveKeys
            .map((item) => String(item))
            .filter((item): item is CmrOutputValveKey =>
              item === 'mitral' || item === 'aortic' || item === 'tricuspid' || item === 'pulmonary',
            )
            .filter((item, index, source) => source.indexOf(item) === index)
        : defaults.output.selectedValveKeys,
      includeValveAssessment: outputSource.includeValveAssessment == null
        ? defaults.output.includeValveAssessment
        : Boolean(outputSource.includeValveAssessment),
      includePhAssessment: outputSource.includePhAssessment == null
        ? defaults.output.includePhAssessment
        : Boolean(outputSource.includePhAssessment),
    },
  }
}

export function rangeParamMapToRecord(map: Map<string, RangeParam>): CmrRangeParamRecord {
  return Object.fromEntries(map.entries())
}

export function rangeParamRecordToMap(record: CmrRangeParamRecord | null | undefined): Map<string, RangeParam> {
  return new Map(Object.entries(record ?? {}))
}
