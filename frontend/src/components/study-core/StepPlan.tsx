import { ChevronDown, ChevronUp, Database, FileText, Loader2, Paperclip, UploadCloud, Wand2 } from 'lucide-react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { getJournalQualityScore, getJournalQualityStars } from '@/lib/research-frame-options'
import { type PlanSectionKey } from '@/lib/plan-section-readiness'
import {
  attachAssetsToManuscript,
  createAnalysisScaffold,
  createDataProfile,
  createFiguresScaffold,
  createTablesScaffold,
  fetchNextPlanClarificationQuestion,
  improveManuscriptPlanSection,
  listLibraryAssets,
  saveManuscriptPlan,
  uploadLibraryAssets,
} from '@/lib/study-core-api'
import type {
  DataProfilePayload,
  LibraryAssetRecord,
  ManuscriptPlanJson,
  ManuscriptPlanSection,
  OutlinePlanState,
  PlannerConfirmedFields,
  PlanClarificationQuestion,
  Step2ClarificationResponse,
} from '@/types/study-core'

type Context = {
  projectTitle: string
  targetJournal: string
  targetJournalLabel: string
  researchCategory: string
  studyType: string
  interpretationMode: string
  articleType: string
  wordLength: string
  summary: string
}

type SelectionRange = { start: number; end: number; text: string }
type Phase = 'data' | 'questions' | 'editor'
type SectionContext = 'RESULTS' | 'TABLES' | 'FIGURES' | 'PLANNER'
type Key =
  | 'TITLE_ABSTRACT'
  | 'INTRODUCTION'
  | 'METHODS'
  | 'RESULTS'
  | 'TABLES'
  | 'FIGURES'
  | 'DISCUSSION'
  | 'LIMITATIONS'
  | 'REFERENCES'

type StepPlanProps = {
  targetJournal: string
  answers: Record<string, string>
  planningContext: Context
  selectedSections: string[]
  plan: OutlinePlanState | null
  aiPlanSummary: string
  aiPlanSections: Record<PlanSectionKey, string>
  showAiPlan: boolean
  activeAiSection: PlanSectionKey | null
  clarificationResponses: Step2ClarificationResponse[]
  onSectionsChange: (sections: string[]) => void
  onPlanChange: (nextPlan: OutlinePlanState | null) => void
  onAiPlanSectionChange: (section: PlanSectionKey, nextText: string, source: 'manual' | 'ai' | 'fix') => void
  onAiPlanSectionSelectionChange: (section: PlanSectionKey, selection: SelectionRange) => void
  onActiveAiSectionChange: (section: PlanSectionKey) => void
  onStatus: (message: string) => void
  onError: (message: string) => void
}

type SuggestionState = { suggestions: string[]; alternatives: string[]; toConfirm: string[]; lastTool: string }

const RUN_CONTEXT_KEY = 'aawe-run-context'
const DEFAULT_RUN_SECTIONS = ['introduction', 'methods', 'results', 'discussion', 'conclusion']

const ORDER: Array<{ key: Key; label: string; optional: boolean; fallback: string }> = [
  { key: 'TITLE_ABSTRACT', label: 'Title & Abstract', optional: true, fallback: 'Optional framing for title and abstract.' },
  { key: 'INTRODUCTION', label: 'Introduction', optional: false, fallback: 'Clinical context, gap, objective.' },
  { key: 'METHODS', label: 'Methods', optional: false, fallback: 'Design, eligibility, variables, models, missing-data handling.' },
  { key: 'RESULTS', label: 'Results', optional: false, fallback: 'Primary estimate plus uncertainty, then sensitivity analyses.' },
  { key: 'TABLES', label: 'Tables', optional: false, fallback: 'Table shells and unresolved table inputs.' },
  { key: 'FIGURES', label: 'Figures', optional: false, fallback: 'Figure placeholders and required inputs.' },
  { key: 'DISCUSSION', label: 'Discussion', optional: false, fallback: 'Conservative interpretation and alternatives.' },
  { key: 'LIMITATIONS', label: 'Limitations', optional: true, fallback: 'Scope limits and uncertainty boundaries.' },
  { key: 'REFERENCES', label: 'References / Reporting checklist notes', optional: true, fallback: 'Reporting checklist notes and references plan.' },
]

function firstLine(text: string, fallback: string): string {
  const line = text.trim().split(/\r?\n/)[0]?.trim() || ''
  if (!line) return fallback
  return line.length > 160 ? `${line.slice(0, 157)}...` : line
}

function toCore(key: Key): PlanSectionKey | null {
  if (key === 'INTRODUCTION') return 'introduction'
  if (key === 'METHODS') return 'methods'
  if (key === 'RESULTS') return 'results'
  if (key === 'DISCUSSION') return 'discussion'
  return null
}

function toCtx(key: Key): SectionContext {
  if (key === 'RESULTS') return 'RESULTS'
  if (key === 'TABLES') return 'TABLES'
  if (key === 'FIGURES') return 'FIGURES'
  return 'PLANNER'
}

function buildOutline(sections: ManuscriptPlanSection[]): OutlinePlanState {
  const map = new Map(sections.map((section) => [section.key, section.content]))
  const bullets = (value: string) => value.split(/\r?\n/).map((line) => line.trim()).filter(Boolean)
  return {
    sections: [
      { name: 'introduction', bullets: bullets(map.get('INTRODUCTION') || '') },
      { name: 'methods', bullets: bullets(map.get('METHODS') || '') },
      { name: 'results', bullets: bullets(map.get('RESULTS') || '') },
      { name: 'discussion', bullets: bullets(map.get('DISCUSSION') || '') },
      { name: 'conclusion', bullets: bullets(map.get('LIMITATIONS') || map.get('DISCUSSION') || '') },
    ],
  }
}

function statusClass(status: ManuscriptPlanSection['status']): string {
  if (status === 'reviewed') return 'border-emerald-300 bg-emerald-50 text-emerald-800'
  if (status === 'locked') return 'border-amber-300 bg-amber-50 text-amber-900'
  return 'border-slate-300 bg-slate-50 text-slate-700'
}

function wordLengthClass(raw: string): string {
  const values = (raw.match(/\d[\d,]*/g) || []).map((v) => Number.parseInt(v.replace(/,/g, ''), 10)).filter(Number.isFinite)
  const high = values.length ? Math.max(...values) : 0
  if (!high) return 'rounded-md border border-border/70 bg-background p-2'
  if (high < 1500) return 'rounded-md border border-emerald-300 bg-emerald-50/70 p-2'
  if (high <= 4000) return 'rounded-md border border-amber-300 bg-amber-50/70 p-2'
  return 'rounded-md border border-rose-300 bg-rose-50/70 p-2'
}

function readRunContext(): { projectId: string; manuscriptId: string } | null {
  try {
    const raw = window.localStorage.getItem(RUN_CONTEXT_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as { projectId?: string; manuscriptId?: string }
    if (!parsed.projectId || !parsed.manuscriptId) return null
    return { projectId: parsed.projectId, manuscriptId: parsed.manuscriptId }
  } catch {
    return null
  }
}

function uniq(values: string[]): string[] {
  const out: string[] = []
  const seen = new Set<string>()
  for (const item of values) {
    const trimmed = item.trim()
    if (!trimmed) continue
    const key = trimmed.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    out.push(trimmed)
  }
  return out
}

function feedbackInit(): Record<Key, SuggestionState> {
  return {
    TITLE_ABSTRACT: { suggestions: [], alternatives: [], toConfirm: [], lastTool: '' },
    INTRODUCTION: { suggestions: [], alternatives: [], toConfirm: [], lastTool: '' },
    METHODS: { suggestions: [], alternatives: [], toConfirm: [], lastTool: '' },
    RESULTS: { suggestions: [], alternatives: [], toConfirm: [], lastTool: '' },
    TABLES: { suggestions: [], alternatives: [], toConfirm: [], lastTool: '' },
    FIGURES: { suggestions: [], alternatives: [], toConfirm: [], lastTool: '' },
    DISCUSSION: { suggestions: [], alternatives: [], toConfirm: [], lastTool: '' },
    LIMITATIONS: { suggestions: [], alternatives: [], toConfirm: [], lastTool: '' },
    REFERENCES: { suggestions: [], alternatives: [], toConfirm: [], lastTool: '' },
  }
}

export function StepPlan(props: StepPlanProps) {
  const {
    targetJournal,
    answers,
    planningContext,
    selectedSections,
    plan,
    aiPlanSummary,
    aiPlanSections,
    showAiPlan,
    activeAiSection,
    clarificationResponses,
    onSectionsChange,
    onPlanChange,
    onAiPlanSectionChange,
    onAiPlanSectionSelectionChange,
    onActiveAiSectionChange,
    onStatus,
    onError,
  } = props

  // Keep legacy props used while Step 2 is internally managed.
  void answers
  void plan
  void showAiPlan
  void activeAiSection

  const [phase, setPhase] = useState<Phase>('data')
  const [runCtx, setRunCtx] = useState<{ projectId: string; manuscriptId: string } | null>(() => readRunContext())

  const [assets, setAssets] = useState<LibraryAssetRecord[]>([])
  const [assetBusy, setAssetBusy] = useState(false)
  const [uploadBusy, setUploadBusy] = useState(false)
  const [profileBusy, setProfileBusy] = useState(false)
  const [selectedAssetIds, setSelectedAssetIds] = useState<string[]>([])
  const [attachedAssetIds, setAttachedAssetIds] = useState<string[]>([])
  const [profile, setProfile] = useState<DataProfilePayload | null>(null)
  const [useProfile, setUseProfile] = useState(false)
  const [confirmed, setConfirmed] = useState<PlannerConfirmedFields>({
    design: '',
    unit_of_analysis: '',
    primary_outcome: '',
    key_exposures: '',
    key_covariates: '',
  })

  const [responses, setResponses] = useState<Step2ClarificationResponse[]>(clarificationResponses)
  const [question, setQuestion] = useState<PlanClarificationQuestion | null>(null)
  const [questionBusy, setQuestionBusy] = useState(false)
  const [questionError, setQuestionError] = useState('')
  const [questionAdvice, setQuestionAdvice] = useState('')
  const [confidence, setConfidence] = useState(0)
  const [answer, setAnswer] = useState<'yes' | 'no' | ''>('')
  const [comment, setComment] = useState('')
  const [adaptiveSummary, setAdaptiveSummary] = useState(planningContext.summary)
  const [seedSummary, setSeedSummary] = useState(aiPlanSummary)
  const [seedSections, setSeedSections] = useState(aiPlanSections)

  const [planJson, setPlanJson] = useState<ManuscriptPlanJson | null>(null)
  const [expanded, setExpanded] = useState<Key>('INTRODUCTION')
  const [saveBusy, setSaveBusy] = useState(false)
  const [toolBusy, setToolBusy] = useState(false)
  const [toolError, setToolError] = useState('')
  const [feedback, setFeedback] = useState<Record<Key, SuggestionState>>(feedbackInit)
  const [sectionUploadBusy, setSectionUploadBusy] = useState(false)
  const sectionInputRef = useRef<HTMLInputElement | null>(null)

  const stars = useMemo(() => getJournalQualityStars(targetJournal), [targetJournal])
  const score = useMemo(() => getJournalQualityScore(targetJournal), [targetJournal])
  const wlClass = useMemo(() => wordLengthClass(planningContext.wordLength), [planningContext.wordLength])
  const active = useMemo(() => planJson?.sections.find((s) => s.key === expanded) ?? null, [expanded, planJson])
  const unresolved = useMemo(
    () => (profile?.data_profile_json.unresolved_questions || []).map((item) => (item.endsWith('?') ? item : `${item}?`)),
    [profile],
  )

  const loadAssets = useCallback(async () => {
    setAssetBusy(true)
    onError('')
    try {
      const data = await listLibraryAssets(runCtx?.projectId)
      setAssets(data)
    } catch (error) {
      onError(error instanceof Error ? error.message : 'Could not load assets.')
    } finally {
      setAssetBusy(false)
    }
  }, [onError, runCtx?.projectId])

  useEffect(() => {
    setRunCtx(readRunContext())
    void loadAssets()
    // initial only
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    setResponses(clarificationResponses)
  }, [clarificationResponses])

  useEffect(() => {
    setAdaptiveSummary(planningContext.summary)
  }, [planningContext.summary])

  useEffect(() => {
    if (selectedSections.join('|') !== DEFAULT_RUN_SECTIONS.join('|')) onSectionsChange(DEFAULT_RUN_SECTIONS)
  }, [onSectionsChange, selectedSections])

  const savePlan = useCallback(
    async (next: ManuscriptPlanJson) => {
      if (!runCtx?.manuscriptId) return
      setSaveBusy(true)
      try {
        await saveManuscriptPlan({ manuscriptId: runCtx.manuscriptId, planJson: next })
      } catch (error) {
        onError(error instanceof Error ? error.message : 'Could not save plan.')
      } finally {
        setSaveBusy(false)
      }
    },
    [onError, runCtx?.manuscriptId],
  )

  const updatePlan = useCallback(
    (mutate: (current: ManuscriptPlanJson) => ManuscriptPlanJson, persist = true) => {
      setPlanJson((current) => {
        if (!current) return current
        const next = mutate(current)
        onPlanChange(buildOutline(next.sections))
        if (persist) void savePlan(next)
        return next
      })
    },
    [onPlanChange, savePlan],
  )

  const pushCore = useCallback(
    (key: Key, text: string, source: 'manual' | 'ai' | 'fix') => {
      const core = toCore(key)
      if (!core) return
      onAiPlanSectionChange(core, text, source)
      onActiveAiSectionChange(core)
    },
    [onActiveAiSectionChange, onAiPlanSectionChange],
  )

  const onUpload = async (files: FileList | null) => {
    if (!files || files.length === 0) return
    setUploadBusy(true)
    onError('')
    try {
      const payload = await uploadLibraryAssets({ files: Array.from(files), projectId: runCtx?.projectId })
      setSelectedAssetIds((current) => uniq([...current, ...payload.asset_ids]))
      await loadAssets()
      onStatus(`Uploaded ${payload.asset_ids.length} file(s) to Data Library.`)
    } catch (error) {
      onError(error instanceof Error ? error.message : 'Upload failed.')
    } finally {
      setUploadBusy(false)
    }
  }

  const profileData = async () => {
    if (!selectedAssetIds.length) {
      onError('Select one or more assets first.')
      return
    }
    setProfileBusy(true)
    onError('')
    try {
      if (runCtx?.manuscriptId) {
        await attachAssetsToManuscript({ manuscriptId: runCtx.manuscriptId, assetIds: selectedAssetIds, sectionContext: 'PLANNER' })
      }
      setAttachedAssetIds((current) => uniq([...current, ...selectedAssetIds]))
      const data = await createDataProfile({ assetIds: selectedAssetIds, maxRows: 200, maxChars: 20000 })
      setProfile(data)
      setUseProfile(true)
      const roles = data.data_profile_json.variable_role_guesses
      const hints = data.data_profile_json.likely_design_hints
      setConfirmed({
        design: hints[0] || 'Observational analysis',
        unit_of_analysis: roles.identifiers.length ? 'Participant-level' : 'Observation-level',
        primary_outcome: roles.outcomes[0] || '',
        key_exposures: roles.exposures.slice(0, 3).join(', '),
        key_covariates: roles.covariates.slice(0, 5).join(', '),
      })
      onStatus('Data profile generated.')
    } catch (error) {
      onError(error instanceof Error ? error.message : 'Profiling failed.')
    } finally {
      setProfileBusy(false)
    }
  }

  const askNext = useCallback(
    async (source: Step2ClarificationResponse[], force = false) => {
      setQuestionBusy(true)
      setQuestionError('')
      try {
        const history = source.filter((item) => item.answer === 'yes' || item.answer === 'no').map((item) => ({
          prompt: item.prompt,
          answer: item.answer as 'yes' | 'no',
          comment: item.comment,
        }))
        const payload = await fetchNextPlanClarificationQuestion({
          projectTitle: planningContext.projectTitle,
          targetJournal: planningContext.targetJournal,
          targetJournalLabel: planningContext.targetJournalLabel,
          researchCategory: planningContext.researchCategory,
          studyType: planningContext.studyType,
          interpretationMode: planningContext.interpretationMode,
          articleType: planningContext.articleType,
          wordLength: planningContext.wordLength,
          summaryOfResearch: adaptiveSummary || planningContext.summary,
          history,
          maxQuestions: 10,
          forceNextQuestion: force,
          dataProfileJson: profile?.data_profile_json ?? null,
          profileUnresolvedQuestions: unresolved,
          useProfileTailoring: useProfile && Boolean(profile),
          studyTypeOptions: [],
        })
        setQuestion(payload.question)
        setQuestionAdvice(payload.advice)
        setConfidence(payload.confidence_percent)
        if (payload.updated_fields?.summary_of_research.trim()) setAdaptiveSummary(payload.updated_fields.summary_of_research.trim())
        if (payload.manuscript_plan_summary.trim()) setSeedSummary(payload.manuscript_plan_summary.trim())
        setSeedSections({
          introduction: payload.manuscript_plan_sections.introduction.trim(),
          methods: payload.manuscript_plan_sections.methods.trim(),
          results: payload.manuscript_plan_sections.results.trim(),
          discussion: payload.manuscript_plan_sections.discussion.trim(),
        })
      } catch (error) {
        setQuestionError(error instanceof Error ? error.message : 'Could not fetch the next question.')
      } finally {
        setQuestionBusy(false)
      }
    },
    [
      adaptiveSummary,
      planningContext.articleType,
      planningContext.interpretationMode,
      planningContext.projectTitle,
      planningContext.researchCategory,
      planningContext.studyType,
      planningContext.summary,
      planningContext.targetJournal,
      planningContext.targetJournalLabel,
      planningContext.wordLength,
      profile,
      unresolved,
      useProfile,
    ],
  )

  const saveAnswerAndNext = async () => {
    if (!question || (answer !== 'yes' && answer !== 'no')) return
    const next = [...responses]
    const idx = next.findIndex((item) => item.id === question.id)
    const row: Step2ClarificationResponse = { id: question.id, prompt: question.prompt, answer, comment: comment.trim() }
    if (idx >= 0) next[idx] = row
    else next.push(row)
    setResponses(next)
    setAnswer('')
    setComment('')
    await askNext(next, false)
  }

  const generatePlan = async () => {
    if (!runCtx?.manuscriptId) {
      onError('Run context missing. Save Step 1 then return to Step 2.')
      return
    }
    setToolBusy(true)
    setToolError('')
    onError('')
    try {
      const profileId = profile?.profile_id || null
      const analysis = await createAnalysisScaffold({ manuscriptId: runCtx.manuscriptId, profileId, confirmedFields: confirmed })
      const tables = await createTablesScaffold({ manuscriptId: runCtx.manuscriptId, profileId, confirmedFields: confirmed })
      const figures = await createFiguresScaffold({ manuscriptId: runCtx.manuscriptId, profileId, confirmedFields: confirmed })
      const assumptions = [
        'Planning scaffold only; no completed results are asserted.',
        planningContext.interpretationMode || 'Use conservative non-causal interpretation.',
      ]
      const unresolvedNow = profile?.data_profile_json.unresolved_questions || []
      const mk = (key: Key, text: string, sub: string[], artifact: ManuscriptPlanSection['section_artifacts'] = {}) =>
        ({
          key,
          status: 'draft',
          summary: firstLine(text, ORDER.find((item) => item.key === key)?.fallback || 'Not started'),
          content: `Plan\n${text.trim() || 'Not started'}\n\nAssumptions\n- ${assumptions.join('\n- ')}\n\nTo confirm\n- ${(unresolvedNow[0] || 'None')}`,
          subheadings: sub.map((title) => ({ title, notes: '' })),
          to_confirm: unresolvedNow.slice(0, 4).map((q) => ({ question: q, why_it_matters: 'Needed to finalise plan accuracy.' })),
          section_assets: { attached_asset_ids: key === 'RESULTS' || key === 'TABLES' || key === 'FIGURES' ? attachedAssetIds : [] },
          section_artifacts: artifact,
        }) as ManuscriptPlanSection

      const sections: ManuscriptPlanSection[] = [
        mk('TITLE_ABSTRACT', seedSummary || 'Optional title and abstract direction.', ['Title direction', 'Abstract structure']),
        mk('INTRODUCTION', seedSections.introduction || planningContext.summary || ORDER[1].fallback, ['Clinical context', 'Evidence gap', 'Objective']),
        mk(
          'METHODS',
          seedSections.methods ||
            analysis.analysis_scaffold_json.methods_analytic_approach.map((item) => `${item.analysis_name}: ${item.model_family}`).join('. ') ||
            ORDER[2].fallback,
          ['Design and setting', 'Variables', 'Statistical analysis'],
        ),
        mk(
          'RESULTS',
          seedSections.results ||
            analysis.analysis_scaffold_json.results_narrative_outline.map((item) => `${item.subheading}: ${item.what_goes_here}`).join('. ') ||
            ORDER[3].fallback,
          ['Primary findings', 'Secondary findings', 'Uncertainty framing'],
        ),
        mk('TABLES', tables.tables_scaffold_json.proposed_tables.map((item) => `${item.table_id}: ${item.title}`).join('\n') || ORDER[4].fallback, ['Table inventory', 'Table inputs'], {
          tables: tables.tables_scaffold_json.proposed_tables,
        }),
        mk('FIGURES', figures.figures_scaffold_json.proposed_figures.map((item) => `${item.figure_id}: ${item.title}`).join('\n') || ORDER[5].fallback, ['Figure inventory', 'Figure inputs'], {
          figures: figures.figures_scaffold_json.proposed_figures,
        }),
        mk('DISCUSSION', seedSections.discussion || ORDER[6].fallback, ['Interpretation', 'Alternative explanations', 'Implications']),
        mk('LIMITATIONS', profile?.data_profile_json.uncertainty.join('. ') || ORDER[7].fallback, ['Design limitations', 'Measurement limitations']),
        mk('REFERENCES', ORDER[8].fallback, ['Reporting checklist notes', 'Reference strategy']),
      ]
      const next: ManuscriptPlanJson = {
        manuscript_id: runCtx.manuscriptId,
        profile_id: profileId,
        confirmed_fields: confirmed,
        sections,
      }
      setPlanJson(next)
      setExpanded('INTRODUCTION')
      setFeedback(feedbackInit())
      setPhase('editor')
      onPlanChange(buildOutline(sections))
      onSectionsChange(DEFAULT_RUN_SECTIONS)
      for (const key of ['INTRODUCTION', 'METHODS', 'RESULTS', 'DISCUSSION'] as Key[]) {
        const section = sections.find((item) => item.key === key)
        if (section) pushCore(key, section.content, 'ai')
      }
      await savePlan(next)
      onStatus('Data-aware manuscript plan generated.')
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Could not generate plan.'
      setToolError(message)
      onError(message)
    } finally {
      setToolBusy(false)
    }
  }

  const runTool = async (tool: 'improve' | 'critique' | 'alternatives' | 'subheadings' | 'link_to_data' | 'checklist') => {
    if (!planJson || !active) return
    if ((tool === 'improve' || tool === 'link_to_data') && active.status === 'locked') {
      setToolError('Unlock this section before applying rewrite tools.')
      return
    }
    setToolBusy(true)
    setToolError('')
    try {
      const out = await improveManuscriptPlanSection({
        manuscriptId: planJson.manuscript_id,
        sectionKey: active.key,
        currentText: active.content,
        context: { profileId: planJson.profile_id, confirmedFields: planJson.confirmed_fields },
        tool,
      })
      const suggestions = uniq(out.suggestions)
      const toConfirm = uniq(out.to_confirm)
      setFeedback((current) => ({
        ...current,
        [active.key as Key]: {
          suggestions,
          alternatives: tool === 'alternatives' ? suggestions.slice(0, 3) : current[active.key as Key].alternatives,
          toConfirm,
          lastTool: tool,
        },
      }))
      updatePlan((current) => {
        const sections = current.sections.map((section) => {
          if (section.key !== active.key) return section
          let next = { ...section }
          if ((tool === 'improve' || tool === 'link_to_data') && out.updated_text.trim()) {
            next = { ...next, content: out.updated_text.trim(), summary: firstLine(out.updated_text.trim(), next.summary) }
            pushCore(active.key as Key, out.updated_text.trim(), 'ai')
          }
          if (tool === 'subheadings' && suggestions.length) {
            next = { ...next, subheadings: suggestions.map((title) => ({ title, notes: 'AI suggested subheading.' })) }
          }
          if (toConfirm.length) {
            next = {
              ...next,
              to_confirm: uniq([...next.to_confirm.map((item) => item.question), ...toConfirm]).map((q) => ({
                question: q,
                why_it_matters: 'Needed for robust planning.',
              })),
            }
          }
          return next
        })
        return { ...current, sections }
      })
      onStatus(`${active.key.replace('_', ' ')} ${tool.replace('_', ' ')} applied.`)
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Section tool failed.'
      setToolError(message)
      onError(message)
    } finally {
      setToolBusy(false)
    }
  }

  const regenerateTableShells = async () => {
    if (!runCtx || !planJson) return
    setToolBusy(true)
    setToolError('')
    try {
      const out = await createTablesScaffold({
        manuscriptId: runCtx.manuscriptId,
        profileId: planJson.profile_id,
        confirmedFields: planJson.confirmed_fields,
      })
      updatePlan((current) => ({
        ...current,
        sections: current.sections.map((section) =>
          section.key === 'TABLES'
            ? {
                ...section,
                content: out.tables_scaffold_json.proposed_tables.map((item) => `${item.table_id}: ${item.title}`).join('\n') || section.content,
                summary: firstLine(out.human_summary || section.content, section.summary),
                section_artifacts: { ...section.section_artifacts, tables: out.tables_scaffold_json.proposed_tables },
              }
            : section,
        ),
      }))
      onStatus('Table shells generated.')
    } catch (error) {
      setToolError(error instanceof Error ? error.message : 'Could not generate table shells.')
    } finally {
      setToolBusy(false)
    }
  }

  const regenerateFigureShells = async () => {
    if (!runCtx || !planJson) return
    setToolBusy(true)
    setToolError('')
    try {
      const out = await createFiguresScaffold({
        manuscriptId: runCtx.manuscriptId,
        profileId: planJson.profile_id,
        confirmedFields: planJson.confirmed_fields,
      })
      updatePlan((current) => ({
        ...current,
        sections: current.sections.map((section) =>
          section.key === 'FIGURES'
            ? {
                ...section,
                content: out.figures_scaffold_json.proposed_figures.map((item) => `${item.figure_id}: ${item.title}`).join('\n') || section.content,
                summary: firstLine(out.human_summary || section.content, section.summary),
                section_artifacts: { ...section.section_artifacts, figures: out.figures_scaffold_json.proposed_figures },
              }
            : section,
        ),
      }))
      onStatus('Figure placeholders generated.')
    } catch (error) {
      setToolError(error instanceof Error ? error.message : 'Could not generate figure placeholders.')
    } finally {
      setToolBusy(false)
    }
  }

  const uploadToSection = async (files: FileList | null) => {
    if (!files?.length || !runCtx || !planJson) return
    setSectionUploadBusy(true)
    onError('')
    try {
      const upload = await uploadLibraryAssets({ files: Array.from(files), projectId: runCtx.projectId })
      if (upload.asset_ids.length) {
        await attachAssetsToManuscript({
          manuscriptId: runCtx.manuscriptId,
          assetIds: upload.asset_ids,
          sectionContext: toCtx(expanded),
        })
      }
      setAttachedAssetIds((current) => uniq([...current, ...upload.asset_ids]))
      await loadAssets()
      updatePlan((current) => ({
        ...current,
        sections: current.sections.map((section) =>
          section.key === expanded
            ? { ...section, section_assets: { attached_asset_ids: uniq([...section.section_assets.attached_asset_ids, ...upload.asset_ids]) } }
            : section,
        ),
      }))
      onStatus(`Attached ${upload.asset_ids.length} asset(s) to ${expanded.toLowerCase()}.`)
    } catch (error) {
      onError(error instanceof Error ? error.message : 'Could not upload and attach section assets.')
    } finally {
      setSectionUploadBusy(false)
    }
  }

  const sectionCards = useMemo(
    () => [
      {
        label: 'Target journal',
        value: planningContext.targetJournalLabel || planningContext.targetJournal || 'Not set',
        meta: `Journal standard: ${stars}`,
        className:
          score >= 4
            ? 'rounded-md border border-emerald-300 bg-emerald-50/60 p-2'
            : score === 3
              ? 'rounded-md border border-amber-300 bg-amber-50/60 p-2'
              : 'rounded-md border border-rose-300 bg-rose-50/60 p-2',
      },
      { label: 'Research category', value: planningContext.researchCategory || 'Not set', meta: '', className: 'rounded-md border border-border/70 bg-background p-2' },
      { label: 'Study type', value: planningContext.studyType || 'Not set', meta: '', className: 'rounded-md border border-border/70 bg-background p-2' },
      { label: 'Interpretation mode', value: planningContext.interpretationMode || 'Not set', meta: '', className: 'rounded-md border border-border/70 bg-background p-2' },
      { label: 'Article type', value: planningContext.articleType || 'Not set', meta: '', className: 'rounded-md border border-border/70 bg-background p-2' },
      { label: 'Target word length', value: planningContext.wordLength || 'Not set', meta: '', className: wlClass },
    ],
    [
      planningContext.articleType,
      planningContext.interpretationMode,
      planningContext.researchCategory,
      planningContext.studyType,
      planningContext.targetJournal,
      planningContext.targetJournalLabel,
      planningContext.wordLength,
      score,
      stars,
      wlClass,
    ],
  )

  return (
    <div className="space-y-4 rounded-lg border border-border bg-card p-4">
      <div className="space-y-1">
        <h2 className="text-base font-semibold">Step 2: Data-aware manuscript planner</h2>
        <p className="text-sm text-muted-foreground">Profile data first (optional), ask focused questions, then edit the sectioned plan.</p>
      </div>

      <section className="space-y-2 rounded-md border border-border/80 bg-muted/20 p-3">
        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Planning context snapshot</p>
        <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
          {sectionCards.map((item) => (
            <div key={item.label} className={item.className}>
              <p className="text-[11px] uppercase tracking-wide text-muted-foreground">{item.label}</p>
              <p className="text-sm">{item.value}</p>
              {item.meta ? <p className="text-xs text-muted-foreground">{item.meta}</p> : null}
            </div>
          ))}
        </div>
      </section>

      <section className="grid gap-2 sm:grid-cols-3">
        <Button type="button" variant={phase === 'data' ? 'default' : 'outline'} onClick={() => setPhase('data')}>Phase 1: Data</Button>
        <Button type="button" variant={phase === 'questions' ? 'default' : 'outline'} onClick={() => setPhase('questions')}>Phase 2: Questions</Button>
        <Button type="button" variant={phase === 'editor' ? 'default' : 'outline'} onClick={() => setPhase('editor')} disabled={!planJson}>Phase 3: Plan editor</Button>
      </section>

      {phase === 'data' ? (
        <section className="space-y-3 rounded-md border border-border/80 p-3">
          <div className="flex flex-wrap gap-2">
            <Button type="button" variant="outline" onClick={() => void loadAssets()} disabled={assetBusy}>
              {assetBusy ? <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" /> : <Database className="mr-1 h-3.5 w-3.5" />}
              Attach from Data Library
            </Button>
            <label className="inline-flex cursor-pointer items-center rounded-md border border-emerald-300 px-3 py-1.5 text-sm text-emerald-800 hover:bg-emerald-50">
              {uploadBusy ? <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" /> : <UploadCloud className="mr-1 h-3.5 w-3.5" />}
              Upload data
              <input type="file" multiple className="hidden" onChange={(event) => void onUpload(event.target.files)} />
            </label>
            <Button type="button" className="bg-emerald-600 text-white hover:bg-emerald-700" onClick={() => void profileData()} disabled={profileBusy || !selectedAssetIds.length}>
              {profileBusy ? <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" /> : <Wand2 className="mr-1 h-3.5 w-3.5" />}
              Run data profiler
            </Button>
          </div>

          <div className="space-y-2 rounded-md border border-border/70 bg-background p-2">
            <p className="text-sm font-semibold">Available assets</p>
            {assets.length === 0 ? <p className="text-xs text-muted-foreground">No assets in Data Library.</p> : null}
            <div className="max-h-48 space-y-1 overflow-auto pr-1">
              {assets.map((asset) => (
                <label key={asset.id} className="flex items-start gap-2 rounded border border-border/60 p-2 text-xs">
                  <input
                    type="checkbox"
                    checked={selectedAssetIds.includes(asset.id)}
                    onChange={(event) =>
                      setSelectedAssetIds((current) =>
                        event.target.checked ? uniq([...current, asset.id]) : current.filter((item) => item !== asset.id),
                      )
                    }
                  />
                  <span>
                    <span className="block font-medium">{asset.filename}</span>
                    <span className="text-muted-foreground">{asset.kind.toUpperCase()} | {asset.id}</span>
                  </span>
                </label>
              ))}
            </div>
          </div>

          {profile ? (
            <div className="space-y-2 rounded-md border border-emerald-300 bg-emerald-50/40 p-3">
              <p className="text-sm font-semibold text-emerald-900">Data profile</p>
              <p className="text-xs text-emerald-900">{profile.human_summary}</p>
              {profile.data_profile_json.uncertainty.length ? (
                <ul className="list-disc pl-5 text-xs text-amber-900">
                  {profile.data_profile_json.uncertainty.map((item) => (
                    <li key={item}>{item}</li>
                  ))}
                </ul>
              ) : null}
              {profile.data_profile_json.unresolved_questions.length ? (
                <ul className="list-disc pl-5 text-xs text-slate-700">
                  {profile.data_profile_json.unresolved_questions.map((item) => (
                    <li key={item}>{item}</li>
                  ))}
                </ul>
              ) : null}
              <div className="grid gap-2 sm:grid-cols-2">
                <div><Label htmlFor="design">Design</Label><Input id="design" value={confirmed.design} onChange={(e) => setConfirmed((c) => ({ ...c, design: e.target.value }))} /></div>
                <div><Label htmlFor="unit">Unit of analysis</Label><Input id="unit" value={confirmed.unit_of_analysis} onChange={(e) => setConfirmed((c) => ({ ...c, unit_of_analysis: e.target.value }))} /></div>
                <div><Label htmlFor="outcome">Primary outcome</Label><Input id="outcome" value={confirmed.primary_outcome} onChange={(e) => setConfirmed((c) => ({ ...c, primary_outcome: e.target.value }))} /></div>
                <div><Label htmlFor="exposures">Key exposures</Label><Input id="exposures" value={confirmed.key_exposures} onChange={(e) => setConfirmed((c) => ({ ...c, key_exposures: e.target.value }))} /></div>
                <div className="sm:col-span-2"><Label htmlFor="covariates">Key covariates</Label><Input id="covariates" value={confirmed.key_covariates} onChange={(e) => setConfirmed((c) => ({ ...c, key_covariates: e.target.value }))} /></div>
              </div>
              <label className="flex items-center gap-2 text-sm text-emerald-900"><input type="checkbox" checked={useProfile} onChange={(e) => setUseProfile(e.target.checked)} />Use this profile to tailor questions + plan</label>
            </div>
          ) : null}
          <div className="flex gap-2">
            <Button
              type="button"
              onClick={() =>
                void (async () => {
                  if (selectedAssetIds.length > 0 && !profile) {
                    await profileData()
                  }
                  setPhase('questions')
                })()
              }
            >
              Continue to questions
            </Button>
            <Button type="button" variant="outline" onClick={() => setPhase('questions')}>
              Skip data
            </Button>
          </div>
        </section>
      ) : null}

      {phase === 'questions' ? (
        <section className="space-y-3 rounded-md border border-border/80 p-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div><p className="text-sm font-semibold">Minimal questions (data-aware)</p><p className="text-xs text-muted-foreground">One question at a time, prioritising unresolved profile items.</p></div>
            <Button type="button" variant="outline" onClick={() => void askNext(responses, false)} disabled={questionBusy}>
              {questionBusy ? <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" /> : <Wand2 className="mr-1 h-3.5 w-3.5" />}Next question
            </Button>
          </div>
          <div className="grid gap-2 sm:grid-cols-3">
            <div className="rounded-md border border-border/70 bg-background p-2"><p className="text-[11px] uppercase tracking-wide text-muted-foreground">Answered</p><p className="text-sm font-semibold">{responses.filter((r) => r.answer === 'yes' || r.answer === 'no').length}</p></div>
            <div className="rounded-md border border-border/70 bg-background p-2"><p className="text-[11px] uppercase tracking-wide text-muted-foreground">AI confidence</p><p className="text-sm font-semibold">{confidence}%</p></div>
            <div className="rounded-md border border-border/70 bg-background p-2"><p className="text-[11px] uppercase tracking-wide text-muted-foreground">Advice</p><p className="text-sm">{questionAdvice || 'Ask next question'}</p></div>
          </div>
          {question ? (
            <div className="space-y-2 rounded-md border border-border/70 bg-background p-3">
              <p className="text-sm font-medium">{question.prompt}</p>
              <p className="text-xs text-muted-foreground">{question.rationale}</p>
              <div className="flex gap-2">
                <Button type="button" size="sm" variant={answer === 'yes' ? 'default' : 'outline'} onClick={() => setAnswer('yes')}>Yes</Button>
                <Button type="button" size="sm" variant={answer === 'no' ? 'default' : 'outline'} onClick={() => setAnswer('no')}>No</Button>
              </div>
              <textarea className="min-h-20 w-full rounded-md border border-border bg-background px-2 py-1.5 text-sm" placeholder="Optional comment" value={comment} onChange={(e) => setComment(e.target.value)} />
              <div className="flex gap-2">
                <Button type="button" className="bg-emerald-600 text-white hover:bg-emerald-700" onClick={() => void saveAnswerAndNext()} disabled={answer !== 'yes' && answer !== 'no'}>Save answer and continue</Button>
                <Button type="button" variant="outline" onClick={() => void askNext(responses, true)} disabled={questionBusy}>Ask another targeted question</Button>
              </div>
            </div>
          ) : (
            <div className="rounded-md border border-border/70 bg-background p-3 text-sm text-muted-foreground">No active question. Click Next question to continue.</div>
          )}
          {questionError ? <p className="text-xs text-destructive">{questionError}</p> : null}
          <div className="rounded-md border border-border/70 bg-muted/20 p-2"><p className="text-xs uppercase tracking-wide text-muted-foreground">Adaptive summary</p><p className="text-sm">{adaptiveSummary || planningContext.summary}</p></div>
          <div className="flex gap-2"><Button type="button" className="bg-emerald-600 text-white hover:bg-emerald-700" onClick={() => void generatePlan()} disabled={toolBusy}>{toolBusy ? <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" /> : <FileText className="mr-1 h-3.5 w-3.5" />}Generate manuscript plan</Button><Button type="button" variant="outline" onClick={() => setPhase('data')}>Back to data</Button></div>
        </section>
      ) : null}

      {phase === 'editor' ? (
        <section className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_320px]">
          <div className="space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-border/80 bg-muted/20 p-3">
              <div><p className="text-sm font-semibold">Manuscript plan editor</p><p className="text-xs text-muted-foreground">No duplicate preview. This accordion is the plan editor.</p></div>
              <Button type="button" variant="outline" onClick={() => planJson && void savePlan(planJson)} disabled={!planJson || saveBusy}>{saveBusy ? <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" /> : null}Save plan</Button>
            </div>

            {planJson?.sections.map((section) => {
              const open = section.key === expanded
              const fb = feedback[section.key as Key]
              return (
                <article key={section.key} className="rounded-md border border-border/80 bg-background">
                  <button type="button" className="flex w-full items-start justify-between gap-2 px-3 py-3 text-left" onClick={() => { setExpanded(section.key as Key); const core = toCore(section.key as Key); if (core) onActiveAiSectionChange(core) }}>
                    <div className="space-y-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="text-sm font-semibold">{ORDER.find((item) => item.key === section.key)?.label || section.key}</p>
                        <span className={`rounded-full border px-2 py-0.5 text-[11px] font-medium ${statusClass(section.status)}`}>{section.status === 'draft' ? 'Draft' : section.status === 'reviewed' ? 'Reviewed' : 'Locked'}</span>
                      </div>
                      <p className="text-xs text-muted-foreground">{section.summary}</p>
                    </div>
                    {open ? <ChevronUp className="h-4 w-4 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
                  </button>
                  {open ? (
                    <div className="space-y-3 border-t border-border/70 px-3 py-3">
                      <div className="flex flex-wrap gap-2">
                        <Button type="button" size="sm" variant="outline" onClick={() => void runTool('improve')} disabled={toolBusy || section.status === 'locked'}>Improve</Button>
                        <Button type="button" size="sm" variant="outline" onClick={() => void runTool('subheadings')} disabled={toolBusy}>Suggest subheadings</Button>
                        <Button type="button" size="sm" variant="outline" onClick={() => void runTool('critique')} disabled={toolBusy}>Critique</Button>
                        <Button type="button" size="sm" variant="outline" onClick={() => void runTool('alternatives')} disabled={toolBusy}>Generate alternatives</Button>
                        <Button type="button" size="sm" variant="outline" onClick={() => void runTool('link_to_data')} disabled={toolBusy || !profile || section.status === 'locked'}>Link to data</Button>
                        <Button type="button" size="sm" variant="outline" onClick={() => void runTool('checklist')} disabled={toolBusy}>Add checklist</Button>
                        {section.key === 'TABLES' ? (
                          <>
                            <Button type="button" size="sm" variant="outline" onClick={() => void regenerateTableShells()} disabled={toolBusy}>Generate table shells</Button>
                            <Button
                              type="button"
                              size="sm"
                              variant="outline"
                              onClick={() =>
                                updatePlan((current) => ({
                                  ...current,
                                  sections: current.sections.map((item) =>
                                    item.key === 'TABLES'
                                      ? { ...item, content: `${item.content}\n\nTable 1: Baseline characteristics\nTable 2: Primary estimate\nTable 3: Sensitivity analyses` }
                                      : item,
                                  ),
                                }))
                              }
                            >
                              Insert Table 1/2/3 skeletons
                            </Button>
                            <Button type="button" size="sm" variant="outline" onClick={() => onStatus('Tables outline export will be added in a subsequent release.')}>Export tables outline</Button>
                          </>
                        ) : null}
                        {section.key === 'FIGURES' ? (
                          <>
                            <Button type="button" size="sm" variant="outline" onClick={() => void regenerateFigureShells()} disabled={toolBusy}>Generate figure placeholders</Button>
                            <Button
                              type="button"
                              size="sm"
                              variant="outline"
                              onClick={() =>
                                updatePlan((current) => ({
                                  ...current,
                                  sections: current.sections.map((item) =>
                                    item.key === 'FIGURES'
                                      ? { ...item, content: `${item.content}\n\nFigure 1: Flow diagram\nFigure 2: Primary endpoint visual summary\nFigure 3: Sensitivity analysis` }
                                      : item,
                                  ),
                                }))
                              }
                            >
                              List required inputs
                            </Button>
                            <Button type="button" size="sm" variant="outline" onClick={() => onStatus('Figures outline export will be added in a subsequent release.')}>Export figures outline</Button>
                          </>
                        ) : null}
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          onClick={() =>
                            updatePlan((current) => ({
                              ...current,
                              sections: current.sections.map((item) =>
                                item.key === section.key
                                  ? { ...item, status: item.status === 'locked' ? 'draft' : 'locked' }
                                  : item,
                              ),
                            }))
                          }
                        >
                          {section.status === 'locked' ? 'Unlock section' : 'Lock section'}
                        </Button>
                      </div>
                      <div className="space-y-2 rounded-md border border-border/70 bg-background p-2">
                        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Subheadings</p>
                        {section.subheadings.map((sub, idx) => (
                          <div key={`${sub.title}-${idx}`} className="flex items-center gap-2">
                            <Input
                              value={sub.title}
                              onChange={(e) =>
                                updatePlan(
                                  (current) => ({
                                    ...current,
                                    sections: current.sections.map((item) =>
                                      item.key === section.key
                                        ? {
                                            ...item,
                                            subheadings: item.subheadings.map((row, rowIdx) =>
                                              rowIdx === idx ? { ...row, title: e.target.value } : row,
                                            ),
                                          }
                                        : item,
                                    ),
                                  }),
                                  false,
                                )
                              }
                            />
                            <Button
                              type="button"
                              size="sm"
                              variant="outline"
                              onClick={() =>
                                updatePlan(
                                  (current) => ({
                                    ...current,
                                    sections: current.sections.map((item) => {
                                      if (item.key !== section.key || idx === 0) return item
                                      const next = [...item.subheadings]
                                      const temp = next[idx - 1]
                                      next[idx - 1] = next[idx]
                                      next[idx] = temp
                                      return { ...item, subheadings: next }
                                    }),
                                  }),
                                  false,
                                )
                              }
                              disabled={idx === 0}
                            >
                              Up
                            </Button>
                            <Button
                              type="button"
                              size="sm"
                              variant="outline"
                              onClick={() =>
                                updatePlan(
                                  (current) => ({
                                    ...current,
                                    sections: current.sections.map((item) => {
                                      if (item.key !== section.key || idx === item.subheadings.length - 1) return item
                                      const next = [...item.subheadings]
                                      const temp = next[idx + 1]
                                      next[idx + 1] = next[idx]
                                      next[idx] = temp
                                      return { ...item, subheadings: next }
                                    }),
                                  }),
                                  false,
                                )
                              }
                              disabled={idx === section.subheadings.length - 1}
                            >
                              Down
                            </Button>
                          </div>
                        ))}
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          onClick={() =>
                            updatePlan(
                              (current) => ({
                                ...current,
                                sections: current.sections.map((item) =>
                                  item.key === section.key
                                    ? { ...item, subheadings: [...item.subheadings, { title: 'New subheading', notes: '' }] }
                                    : item,
                                ),
                              }),
                              false,
                            )
                          }
                        >
                          Add subheading
                        </Button>
                      </div>
                      <textarea className="min-h-44 w-full rounded-md border border-border bg-background px-3 py-2 text-sm" value={section.content} onChange={(e) => updatePlan((current) => ({ ...current, sections: current.sections.map((item) => item.key === section.key ? { ...item, content: e.target.value, summary: firstLine(e.target.value, item.summary) } : item) }), false)} onBlur={() => { pushCore(section.key as Key, section.content, 'manual'); if (planJson) void savePlan(planJson) }} onSelect={(e) => { const core = toCore(section.key as Key); if (!core) return; const t = e.currentTarget; onAiPlanSectionSelectionChange(core, { start: t.selectionStart || 0, end: t.selectionEnd || 0, text: t.value.slice(t.selectionStart || 0, t.selectionEnd || 0) }) }} />
                      <div className="rounded-md border border-border/70 bg-muted/20 p-2">
                        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">To confirm</p>
                        {section.to_confirm.length ? (
                          <ul className="list-disc pl-5 text-xs text-slate-700">
                            {section.to_confirm.map((item) => (
                              <li key={`${item.question}-${item.why_it_matters}`}>{item.question}</li>
                            ))}
                          </ul>
                        ) : (
                          <p className="text-xs text-muted-foreground">No unresolved items recorded.</p>
                        )}
                      </div>
                      {section.key === 'TABLES' ? (
                        <div className="rounded-md border border-border/70 bg-muted/20 p-2">
                          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Table shells</p>
                          {(section.section_artifacts.tables || []).length ? (
                            <ul className="list-disc pl-5 text-xs text-slate-700">
                              {(section.section_artifacts.tables || []).map((table, idx) => (
                                <li key={`table-${idx}`}>{String((table as { title?: string }).title || 'Table')}</li>
                              ))}
                            </ul>
                          ) : (
                            <p className="text-xs text-muted-foreground">No table shells generated yet.</p>
                          )}
                        </div>
                      ) : null}
                      {section.key === 'FIGURES' ? (
                        <div className="rounded-md border border-border/70 bg-muted/20 p-2">
                          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Figure placeholders</p>
                          {(section.section_artifacts.figures || []).length ? (
                            <ul className="list-disc pl-5 text-xs text-slate-700">
                              {(section.section_artifacts.figures || []).map((figure, idx) => (
                                <li key={`figure-${idx}`}>{String((figure as { title?: string }).title || 'Figure')}</li>
                              ))}
                            </ul>
                          ) : (
                            <p className="text-xs text-muted-foreground">No figure placeholders generated yet.</p>
                          )}
                        </div>
                      ) : null}
                      {fb.alternatives.length ? <div className="space-y-2 rounded-md border border-indigo-200 bg-indigo-50/40 p-2">{fb.alternatives.map((alt) => <div key={alt} className="space-y-1 rounded border border-indigo-200 bg-white p-2"><p className="text-xs text-slate-700">{alt}</p><Button type="button" size="sm" variant="outline" onClick={() => updatePlan((current) => ({ ...current, sections: current.sections.map((item) => item.key === section.key ? { ...item, content: alt, summary: firstLine(alt, item.summary) } : item) }))}>Apply alternative</Button></div>)}</div> : null}
                    </div>
                  ) : null}
                </article>
              )
            })}
          </div>
          <aside className="space-y-3 rounded-md border border-border/80 bg-muted/20 p-3">
            <h3 className="text-sm font-semibold">Section AI tools</h3>
            {active ? (
              <>
                <div className="rounded-md border border-border/70 bg-background p-2"><p className="text-xs uppercase tracking-wide text-muted-foreground">Current section</p><p className="text-sm font-medium">{ORDER.find((item) => item.key === active.key)?.label || active.key}</p><p className="text-xs text-muted-foreground">{active.summary}</p></div>
                <div className="rounded-md border border-border/70 bg-background p-2"><p className="text-xs uppercase tracking-wide text-muted-foreground">Context</p><p className="text-xs text-slate-700">Attached assets: {active.section_assets.attached_asset_ids.length}</p><p className="text-xs text-slate-700">Profile linked: {planJson?.profile_id ? 'Yes' : 'No'}</p></div>
                <div className="rounded-md border border-border/70 bg-background p-2">
                  <p className="text-xs uppercase tracking-wide text-muted-foreground">Suggestions</p>
                  {feedback[active.key as Key].suggestions.length ? <ul className="list-disc pl-5 text-xs text-slate-700">{feedback[active.key as Key].suggestions.map((item) => <li key={item}>{item}</li>)}</ul> : <p className="text-xs text-muted-foreground">Run section tools to generate suggestions.</p>}
                </div>
                <div className="rounded-md border border-border/70 bg-background p-2">
                  <p className="text-xs uppercase tracking-wide text-muted-foreground">Upload and attach data</p>
                  <div className="flex flex-wrap gap-2">
                    <Button type="button" size="sm" variant="outline" onClick={() => sectionInputRef.current?.click()} disabled={sectionUploadBusy}>{sectionUploadBusy ? <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" /> : <Paperclip className="mr-1 h-3.5 w-3.5" />}Upload and attach</Button>
                    <Button type="button" size="sm" variant="outline" onClick={() => void loadAssets()} disabled={assetBusy}>Refresh library</Button>
                  </div>
                  <input ref={sectionInputRef} type="file" className="hidden" multiple onChange={(e) => void uploadToSection(e.target.files)} />
                  <p className="text-[11px] text-muted-foreground">Uploads always go to Data Library, then attach by asset reference.</p>
                </div>
              </>
            ) : (
              <p className="text-xs text-muted-foreground">Select a section to view section-specific guidance.</p>
            )}
            {toolError ? <p className="text-xs text-destructive">{toolError}</p> : null}
          </aside>
        </section>
      ) : null}
    </div>
  )
}
