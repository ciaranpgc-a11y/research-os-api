import { useCallback, useEffect, useMemo, useState } from 'react'
import type { FormEvent } from 'react'
import './App.css'

type HealthState = 'checking' | 'ok' | 'error'

type ApiErrorPayload = {
  error: {
    message: string
    type: string
    detail: string
  }
}

type JournalOption = {
  slug: string
  display_name: string
  default_voice: string
}

type WizardQuestion = {
  id: string
  label: string
  kind: 'text' | 'textarea' | 'select'
  required: boolean
  options?: string[]
}

type WizardInferResponse = {
  target_journal: string
  journal_voice: string
  inferred_study_type: string
  inferred_primary_endpoint_type: string
  recommended_sections: string[]
  answered_fields: string[]
  next_questions: WizardQuestion[]
}

type ProjectResponse = {
  id: string
  title: string
  target_journal: string
  journal_voice: string | null
  language: string
  study_type: string | null
  study_brief: string | null
  created_at: string
  updated_at: string
}

type ManuscriptResponse = {
  id: string
  project_id: string
  branch_name: string
  status: string
  sections: Record<string, string>
  created_at: string
  updated_at: string
}

type ManuscriptSnapshotResponse = {
  id: string
  project_id: string
  manuscript_id: string
  label: string
  sections: Record<string, string>
  created_at: string
}

type SnapshotRestoreMode = 'replace' | 'merge'

type GenerationJobResponse = {
  id: string
  project_id: string
  manuscript_id: string
  status: 'queued' | 'running' | 'cancel_requested' | 'completed' | 'failed' | 'cancelled'
  cancel_requested: boolean
  run_count: number
  parent_job_id: string | null
  sections: string[]
  notes_context: string
  progress_percent: number
  current_section: string | null
  error_detail: string | null
  started_at: string | null
  completed_at: string | null
  created_at: string
  updated_at: string
  pricing_model: string
  estimated_input_tokens: number
  estimated_output_tokens_low: number
  estimated_output_tokens_high: number
  estimated_cost_usd_low: number
  estimated_cost_usd_high: number
}

type GenerationHistoryFilter = 'all' | GenerationJobResponse['status']

type WizardBootstrapResponse = {
  project: ProjectResponse
  manuscript: ManuscriptResponse
  inference: WizardInferResponse
}

type WizardFieldConfig = {
  id: string
  label: string
  kind: 'text' | 'textarea' | 'select'
  required: boolean
  options?: string[]
}

const API_BASE_URL =
  import.meta.env.VITE_API_BASE_URL?.replace(/\/$/, '') ?? 'http://127.0.0.1:8000'

const MANUSCRIPT_GOAL_LABELS: Record<string, string> = {
  generate_full_manuscript: 'Generate full manuscript',
  revise_existing_draft: 'Revise existing draft',
  journal_reformat_existing_draft: 'Reformat existing draft for journal',
}

const DATA_SOURCE_LABELS: Record<string, string> = {
  csv_or_xlsx: 'CSV or XLSX',
  stats_text_output: 'Statistical text output',
  existing_draft: 'Existing draft',
  manual_entry: 'Manual entry',
}

const ESTIMATE_PROMPT_OVERHEAD_TOKENS = 90
const ESTIMATE_MIN_NOTES_TOKENS = 24
const ESTIMATE_INPUT_USD_PER_1M = 0.4
const ESTIMATE_OUTPUT_USD_PER_1M = 1.6
const ESTIMATE_SECTION_OUTPUT_TOKEN_RANGES: Record<string, [number, number]> = {
  title: [12, 32],
  abstract: [120, 280],
  introduction: [180, 420],
  methods: [220, 520],
  results: [180, 420],
  discussion: [220, 520],
  conclusion: [70, 180],
}

const SECTION_DRAFT_OPTIONS = ['title', 'abstract', 'introduction', 'methods', 'results', 'discussion', 'conclusion']
const GENERATION_HISTORY_FILTER_OPTIONS: Array<{ value: GenerationHistoryFilter; label: string }> = [
  { value: 'all', label: 'All statuses' },
  { value: 'queued', label: 'Queued' },
  { value: 'running', label: 'Running' },
  { value: 'cancel_requested', label: 'Cancel requested' },
  { value: 'completed', label: 'Completed' },
  { value: 'failed', label: 'Failed' },
  { value: 'cancelled', label: 'Cancelled' },
]

const BASE_WIZARD_FIELDS: WizardFieldConfig[] = [
  {
    id: 'disease_focus',
    label: 'Disease focus',
    kind: 'text',
    required: true,
  },
  {
    id: 'population',
    label: 'Population',
    kind: 'text',
    required: true,
  },
  {
    id: 'primary_outcome',
    label: 'Primary outcome',
    kind: 'text',
    required: true,
  },
  {
    id: 'analysis_summary',
    label: 'Analysis summary',
    kind: 'textarea',
    required: true,
  },
  {
    id: 'key_findings',
    label: 'Key findings',
    kind: 'textarea',
    required: true,
  },
  {
    id: 'manuscript_goal',
    label: 'Manuscript goal',
    kind: 'select',
    required: true,
    options: ['generate_full_manuscript', 'revise_existing_draft', 'journal_reformat_existing_draft'],
  },
  {
    id: 'data_source',
    label: 'Data source',
    kind: 'select',
    required: true,
    options: ['csv_or_xlsx', 'stats_text_output', 'existing_draft', 'manual_entry'],
  },
]

async function readApiErrorMessage(response: Response, fallback: string): Promise<string> {
  try {
    const payload = (await response.json()) as ApiErrorPayload
    const detail = payload?.error?.detail ? `: ${payload.error.detail}` : ''
    return `${payload?.error?.message ?? fallback}${detail}`
  } catch {
    return `${fallback} (${response.status})`
  }
}

function normalizeAnswers(answers: Record<string, string>): Record<string, string> {
  const sanitized = Object.entries(answers).reduce<Record<string, string>>((acc, [key, value]) => {
    const trimmed = value.trim()
    if (trimmed) {
      acc[key] = trimmed
    }
    return acc
  }, {})
  return sanitized
}

function parseSections(value: string): string[] | undefined {
  const sections = value
    .split(',')
    .map((part) => part.trim())
    .filter((part) => part.length > 0)
  if (sections.length === 0) {
    return undefined
  }
  return sections
}

function formatUtcDate(value: string): string {
  const timestamp = Date.parse(value)
  if (Number.isNaN(timestamp)) {
    return value
  }
  return new Date(timestamp).toLocaleString()
}

function formatUsd(value: number): string {
  return `$${value.toFixed(4)}`
}

function parseOptionalPositiveNumber(value: string): number | undefined {
  const normalized = value.trim()
  if (!normalized) {
    return undefined
  }
  const parsed = Number(normalized)
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return undefined
  }
  return parsed
}

function estimateGenerationCostRange(sections: string[], notesContext: string) {
  const normalizedSections = sections
    .map((section) => section.trim().toLowerCase())
    .filter((section) => section.length > 0)
  if (normalizedSections.length === 0) {
    return {
      estimatedInputTokens: 0,
      estimatedOutputTokensLow: 0,
      estimatedOutputTokensHigh: 0,
      estimatedCostUsdLow: 0,
      estimatedCostUsdHigh: 0,
    }
  }
  const effectiveSections = normalizedSections
  const notesTokens = Math.max(Math.floor(notesContext.length / 4), ESTIMATE_MIN_NOTES_TOKENS)
  const estimatedInputTokens = effectiveSections.length * (notesTokens + ESTIMATE_PROMPT_OVERHEAD_TOKENS)

  let estimatedOutputTokensLow = 0
  let estimatedOutputTokensHigh = 0
  for (const section of effectiveSections) {
    const [low, high] = ESTIMATE_SECTION_OUTPUT_TOKEN_RANGES[section] ?? [160, 380]
    estimatedOutputTokensLow += low
    estimatedOutputTokensHigh += high
  }

  const estimatedCostUsdLow =
    (estimatedInputTokens / 1_000_000) * ESTIMATE_INPUT_USD_PER_1M +
    (estimatedOutputTokensLow / 1_000_000) * ESTIMATE_OUTPUT_USD_PER_1M
  const estimatedCostUsdHigh =
    (estimatedInputTokens / 1_000_000) * ESTIMATE_INPUT_USD_PER_1M +
    (estimatedOutputTokensHigh / 1_000_000) * ESTIMATE_OUTPUT_USD_PER_1M

  return {
    estimatedInputTokens,
    estimatedOutputTokensLow,
    estimatedOutputTokensHigh,
    estimatedCostUsdLow,
    estimatedCostUsdHigh,
  }
}

function humanizeIdentifier(value: string): string {
  const normalized = value.replace(/[_-]+/g, ' ').trim()
  if (!normalized) {
    return value
  }
  return normalized.replace(/\b\w/g, (char) => char.toUpperCase())
}

function prettyOption(value: string, labelMap?: Record<string, string>): string {
  if (labelMap && labelMap[value]) {
    return labelMap[value]
  }
  return humanizeIdentifier(value)
}

function getFilenameFromContentDisposition(
  contentDisposition: string | null,
  fallback: string,
): string {
  if (!contentDisposition) {
    return fallback
  }
  const quoted = contentDisposition.match(/filename=\"([^\"]+)\"/i)
  if (quoted?.[1]) {
    return quoted[1]
  }
  const unquoted = contentDisposition.match(/filename=([^;]+)/i)
  if (unquoted?.[1]) {
    return unquoted[1].trim()
  }
  return fallback
}

function buildDraftMarkdown(
  sectionOrder: string[],
  drafts: Record<string, string>,
  title = 'Quick Manuscript Draft',
): string {
  const lines: string[] = []
  lines.push(`# ${title}`)
  lines.push('')
  for (const section of sectionOrder) {
    const content = (drafts[section] ?? '').trim()
    if (!content) {
      continue
    }
    lines.push(`## ${humanizeIdentifier(section)}`)
    lines.push('')
    lines.push(content)
    lines.push('')
  }
  if (lines.length <= 2) {
    lines.push('_No section drafts generated yet._')
    lines.push('')
  }
  return `${lines.join('\n').trim()}\n`
}

function App() {
  const [quickGenerationNotes, setQuickGenerationNotes] = useState('')
  const [quickGenerationSections, setQuickGenerationSections] = useState<string[]>([
    'title',
    'abstract',
    'methods',
    'results',
    'discussion',
  ])
  const [quickGenerationDrafts, setQuickGenerationDrafts] = useState<Record<string, string>>({})
  const [quickGenerationProgressPercent, setQuickGenerationProgressPercent] = useState(0)
  const [quickGenerationCurrentSection, setQuickGenerationCurrentSection] = useState('')
  const [isGeneratingQuickDrafts, setIsGeneratingQuickDrafts] = useState(false)
  const [quickGenerationError, setQuickGenerationError] = useState('')
  const [quickGenerationSuccess, setQuickGenerationSuccess] = useState('')
  const [isExportingQuickDrafts, setIsExportingQuickDrafts] = useState(false)
  const [isCopyingQuickDrafts, setIsCopyingQuickDrafts] = useState(false)
  const [notes, setNotes] = useState('')
  const [methods, setMethods] = useState('')
  const [draftSection, setDraftSection] = useState('methods')
  const [lastGeneratedSection, setLastGeneratedSection] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [requestId, setRequestId] = useState('')
  const [errorMessage, setErrorMessage] = useState('')
  const [health, setHealth] = useState<HealthState>('checking')
  const [healthText, setHealthText] = useState('Checking API...')
  const [journals, setJournals] = useState<JournalOption[]>([])
  const [isLoadingJournals, setIsLoadingJournals] = useState(false)
  const [journalsError, setJournalsError] = useState('')
  const [projectTitle, setProjectTitle] = useState('')
  const [targetJournal, setTargetJournal] = useState('generic-original')
  const [wizardAnswers, setWizardAnswers] = useState<Record<string, string>>({
    manuscript_goal: 'generate_full_manuscript',
    data_source: 'manual_entry',
  })
  const [wizardInference, setWizardInference] = useState<WizardInferResponse | null>(null)
  const [wizardBootstrap, setWizardBootstrap] = useState<WizardBootstrapResponse | null>(null)
  const [wizardError, setWizardError] = useState('')
  const [isInferring, setIsInferring] = useState(false)
  const [isBootstrapping, setIsBootstrapping] = useState(false)
  const [projects, setProjects] = useState<ProjectResponse[]>([])
  const [projectsError, setProjectsError] = useState('')
  const [isLoadingProjects, setIsLoadingProjects] = useState(false)
  const [selectedProjectId, setSelectedProjectId] = useState('')
  const [manuscripts, setManuscripts] = useState<ManuscriptResponse[]>([])
  const [selectedManuscriptId, setSelectedManuscriptId] = useState('')
  const [isLoadingManuscripts, setIsLoadingManuscripts] = useState(false)
  const [manuscriptsError, setManuscriptsError] = useState('')
  const [newBranchName, setNewBranchName] = useState('main')
  const [newSectionsInput, setNewSectionsInput] = useState('')
  const [isCreatingManuscript, setIsCreatingManuscript] = useState(false)
  const [createManuscriptError, setCreateManuscriptError] = useState('')
  const [createManuscriptSuccess, setCreateManuscriptSuccess] = useState('')
  const [sectionEditorKey, setSectionEditorKey] = useState('')
  const [sectionEditorContent, setSectionEditorContent] = useState('')
  const [isSavingSection, setIsSavingSection] = useState(false)
  const [saveSectionError, setSaveSectionError] = useState('')
  const [saveSectionSuccess, setSaveSectionSuccess] = useState('')
  const [isExportingManuscript, setIsExportingManuscript] = useState(false)
  const [exportIncludeEmptySections, setExportIncludeEmptySections] = useState(false)
  const [exportManuscriptError, setExportManuscriptError] = useState('')
  const [exportManuscriptSuccess, setExportManuscriptSuccess] = useState('')
  const [sectionGenerationNotes, setSectionGenerationNotes] = useState('')
  const [isGeneratingSection, setIsGeneratingSection] = useState(false)
  const [generateSectionError, setGenerateSectionError] = useState('')
  const [generateSectionSuccess, setGenerateSectionSuccess] = useState('')
  const [snapshotLabel, setSnapshotLabel] = useState('')
  const [snapshots, setSnapshots] = useState<ManuscriptSnapshotResponse[]>([])
  const [isLoadingSnapshots, setIsLoadingSnapshots] = useState(false)
  const [isCreatingSnapshot, setIsCreatingSnapshot] = useState(false)
  const [restoringSnapshotId, setRestoringSnapshotId] = useState('')
  const [snapshotsError, setSnapshotsError] = useState('')
  const [snapshotSuccess, setSnapshotSuccess] = useState('')
  const [snapshotRestoreMode, setSnapshotRestoreMode] = useState<SnapshotRestoreMode>('replace')
  const [snapshotRestoreSectionsInput, setSnapshotRestoreSectionsInput] = useState('')
  const [fullGenerationNotesContext, setFullGenerationNotesContext] = useState('')
  const [fullGenerationSections, setFullGenerationSections] = useState<string[]>([])
  const [fullGenerationMaxCostUsd, setFullGenerationMaxCostUsd] = useState('')
  const [fullGenerationDailyBudgetUsd, setFullGenerationDailyBudgetUsd] = useState('')
  const [isStartingFullGeneration, setIsStartingFullGeneration] = useState(false)
  const [isCancellingGenerationJob, setIsCancellingGenerationJob] = useState(false)
  const [isRetryingGenerationJob, setIsRetryingGenerationJob] = useState(false)
  const [fullGenerationError, setFullGenerationError] = useState('')
  const [fullGenerationSuccess, setFullGenerationSuccess] = useState('')
  const [activeGenerationJob, setActiveGenerationJob] = useState<GenerationJobResponse | null>(null)
  const [generationHistory, setGenerationHistory] = useState<GenerationJobResponse[]>([])
  const [isLoadingGenerationHistory, setIsLoadingGenerationHistory] = useState(false)
  const [generationHistoryError, setGenerationHistoryError] = useState('')
  const [generationHistoryFilter, setGenerationHistoryFilter] = useState<GenerationHistoryFilter>('all')

  const canSubmit = useMemo(
    () => notes.trim().length > 0 && draftSection.trim().length > 0 && !isSubmitting,
    [draftSection, isSubmitting, notes],
  )
  const canBootstrap = useMemo(
    () => projectTitle.trim().length > 0 && targetJournal.trim().length > 0 && !isBootstrapping,
    [isBootstrapping, projectTitle, targetJournal],
  )
  const quickGenerationEstimate = useMemo(
    () => estimateGenerationCostRange(quickGenerationSections, quickGenerationNotes),
    [quickGenerationNotes, quickGenerationSections],
  )
  const quickDraftSectionOrder = useMemo(
    () => SECTION_DRAFT_OPTIONS.filter((section) => quickGenerationSections.includes(section)),
    [quickGenerationSections],
  )
  const canGenerateQuickDrafts = useMemo(
    () =>
      quickGenerationNotes.trim().length > 0 &&
      quickGenerationSections.length > 0 &&
      !isGeneratingQuickDrafts,
    [isGeneratingQuickDrafts, quickGenerationNotes, quickGenerationSections.length],
  )
  const hasQuickGenerationDrafts = useMemo(
    () =>
      quickDraftSectionOrder.some((section) => {
        const draft = quickGenerationDrafts[section] ?? ''
        return draft.trim().length > 0
      }),
    [quickDraftSectionOrder, quickGenerationDrafts],
  )
  const dynamicQuestionIds = useMemo(() => {
    if (!wizardInference) {
      return new Set<string>()
    }
    const baseFieldIds = new Set(BASE_WIZARD_FIELDS.map((field) => field.id))
    const dynamicIds = wizardInference.next_questions
      .map((question) => question.id)
      .filter((questionId) => !baseFieldIds.has(questionId))
    return new Set(dynamicIds)
  }, [wizardInference])
  const dynamicQuestions = useMemo(() => {
    if (!wizardInference) {
      return [] as WizardQuestion[]
    }
    return wizardInference.next_questions.filter((question) => dynamicQuestionIds.has(question.id))
  }, [dynamicQuestionIds, wizardInference])
  const journalDisplayNameBySlug = useMemo(() => {
    return new Map(journals.map((journal) => [journal.slug, journal.display_name]))
  }, [journals])

  const onWizardAnswerChange = (fieldId: string, value: string) => {
    setWizardAnswers((current) => ({
      ...current,
      [fieldId]: value,
    }))
  }

  const toggleQuickGenerationSection = (section: string) => {
    setQuickGenerationSections((current) => {
      if (current.includes(section)) {
        return current.filter((item) => item !== section)
      }
      return [...current, section]
    })
  }

  const selectAllQuickGenerationSections = () => {
    setQuickGenerationSections([...SECTION_DRAFT_OPTIONS])
  }

  const clearQuickGenerationSections = () => {
    setQuickGenerationSections([])
  }

  const generateQuickDrafts = async () => {
    if (!canGenerateQuickDrafts) {
      return
    }
    const orderedSections = SECTION_DRAFT_OPTIONS.filter((section) =>
      quickGenerationSections.includes(section),
    )
    if (orderedSections.length === 0) {
      return
    }

    setIsGeneratingQuickDrafts(true)
    setQuickGenerationError('')
    setQuickGenerationSuccess('')
    setQuickGenerationProgressPercent(0)
    setQuickGenerationCurrentSection('')
    const nextDrafts = { ...quickGenerationDrafts }

    try {
      for (const [index, section] of orderedSections.entries()) {
        setQuickGenerationCurrentSection(section)
        const response = await fetch(`${API_BASE_URL}/v1/draft/section`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            section,
            notes: quickGenerationNotes.trim(),
          }),
        })
        const returnedRequestId = response.headers.get('X-Request-ID') ?? ''
        if (returnedRequestId) {
          setRequestId(returnedRequestId)
        }
        if (!response.ok) {
          throw new Error(await readApiErrorMessage(response, `Could not generate ${section} draft`))
        }
        const payload = (await response.json()) as { section: string; draft: string }
        nextDrafts[payload.section] = payload.draft
        setQuickGenerationDrafts({ ...nextDrafts })
        setQuickGenerationProgressPercent(Math.round(((index + 1) / orderedSections.length) * 100))
      }
      setQuickGenerationSuccess(`Generated ${orderedSections.length} sections in quick mode.`)
      setQuickGenerationError('')
    } catch (error) {
      setQuickGenerationError(error instanceof Error ? error.message : 'Could not generate quick drafts')
    } finally {
      setIsGeneratingQuickDrafts(false)
      setQuickGenerationCurrentSection('')
    }
  }

  const exportQuickDraftsMarkdown = async () => {
    if (!hasQuickGenerationDrafts || isExportingQuickDrafts) {
      return
    }
    setIsExportingQuickDrafts(true)
    setQuickGenerationError('')
    try {
      const markdown = buildDraftMarkdown(quickDraftSectionOrder, quickGenerationDrafts)
      const blob = new Blob([markdown], { type: 'text/markdown;charset=utf-8' })
      const timestamp = new Date().toISOString().replace(/[^\d]/g, '').slice(0, 12)
      const filename = `quick-manuscript-draft-${timestamp}.md`
      const url = window.URL.createObjectURL(blob)
      const anchor = document.createElement('a')
      anchor.href = url
      anchor.download = filename
      document.body.appendChild(anchor)
      anchor.click()
      document.body.removeChild(anchor)
      window.URL.revokeObjectURL(url)
      setQuickGenerationSuccess(`Downloaded ${filename}.`)
    } catch (error) {
      setQuickGenerationError(error instanceof Error ? error.message : 'Could not export quick drafts')
    } finally {
      setIsExportingQuickDrafts(false)
    }
  }

  const copyQuickDraftsToClipboard = async () => {
    if (!hasQuickGenerationDrafts || isCopyingQuickDrafts) {
      return
    }
    if (!navigator.clipboard) {
      setQuickGenerationError('Clipboard is not available in this browser context.')
      return
    }
    setIsCopyingQuickDrafts(true)
    setQuickGenerationError('')
    try {
      const markdown = buildDraftMarkdown(quickDraftSectionOrder, quickGenerationDrafts)
      await navigator.clipboard.writeText(markdown)
      setQuickGenerationSuccess('Copied quick drafts to clipboard.')
    } catch (error) {
      setQuickGenerationError(error instanceof Error ? error.message : 'Could not copy quick drafts')
    } finally {
      setIsCopyingQuickDrafts(false)
    }
  }

  const loadProjects = useCallback(async () => {
    setIsLoadingProjects(true)
    setProjectsError('')
    try {
      const response = await fetch(`${API_BASE_URL}/v1/projects`)
      if (!response.ok) {
        throw new Error(await readApiErrorMessage(response, 'Could not load projects'))
      }
      const payload = (await response.json()) as ProjectResponse[]
      setProjects(payload)
      setSelectedProjectId((current) => {
        if (payload.some((project) => project.id === current)) {
          return current
        }
        return payload[0]?.id ?? ''
      })
    } catch (error) {
      setProjectsError(error instanceof Error ? error.message : 'Could not load projects')
      setProjects([])
      setSelectedProjectId('')
    } finally {
      setIsLoadingProjects(false)
    }
  }, [])

  const loadManuscripts = useCallback(async (projectId: string) => {
    setIsLoadingManuscripts(true)
    setManuscriptsError('')
    try {
      const response = await fetch(`${API_BASE_URL}/v1/projects/${projectId}/manuscripts`)
      if (!response.ok) {
        throw new Error(await readApiErrorMessage(response, 'Could not load manuscripts'))
      }
      const payload = (await response.json()) as ManuscriptResponse[]
      setManuscripts(payload)
      setSelectedManuscriptId((current) => {
        if (payload.some((manuscript) => manuscript.id === current)) {
          return current
        }
        return payload[0]?.id ?? ''
      })
    } catch (error) {
      setManuscriptsError(error instanceof Error ? error.message : 'Could not load manuscripts')
      setManuscripts([])
      setSelectedManuscriptId('')
    } finally {
      setIsLoadingManuscripts(false)
    }
  }, [])

  const loadSnapshots = useCallback(async (projectId: string, manuscriptId: string) => {
    setIsLoadingSnapshots(true)
    setSnapshotsError('')
    try {
      const response = await fetch(
        `${API_BASE_URL}/v1/projects/${projectId}/manuscripts/${manuscriptId}/snapshots?limit=20`,
      )
      if (!response.ok) {
        throw new Error(await readApiErrorMessage(response, 'Could not load snapshots'))
      }
      const payload = (await response.json()) as ManuscriptSnapshotResponse[]
      setSnapshots(payload)
      return payload
    } catch (error) {
      setSnapshotsError(error instanceof Error ? error.message : 'Could not load snapshots')
      setSnapshots([])
      return [] as ManuscriptSnapshotResponse[]
    } finally {
      setIsLoadingSnapshots(false)
    }
  }, [])

  const loadGenerationJobs = useCallback(async (projectId: string, manuscriptId: string) => {
    setIsLoadingGenerationHistory(true)
    setGenerationHistoryError('')
    try {
      const response = await fetch(
        `${API_BASE_URL}/v1/projects/${projectId}/manuscripts/${manuscriptId}/generation-jobs?limit=20`,
      )
      if (!response.ok) {
        throw new Error(await readApiErrorMessage(response, 'Could not load generation jobs'))
      }
      const payload = (await response.json()) as GenerationJobResponse[]
      setGenerationHistory(payload)
      setActiveGenerationJob((current) => {
        if (current && current.manuscript_id === manuscriptId) {
          const refreshedCurrent = payload.find((job) => job.id === current.id)
          if (refreshedCurrent) {
            return refreshedCurrent
          }
        }
        return payload[0] ?? null
      })
      return payload
    } catch (error) {
      setGenerationHistoryError(error instanceof Error ? error.message : 'Could not load generation jobs')
      setGenerationHistory([])
      return [] as GenerationJobResponse[]
    } finally {
      setIsLoadingGenerationHistory(false)
    }
  }, [])

  useEffect(() => {
    setQuickGenerationError('')
    setQuickGenerationSuccess('')
  }, [quickGenerationNotes, quickGenerationSections])

  useEffect(() => {
    const checkHealth = async () => {
      try {
        const response = await fetch(`${API_BASE_URL}/v1/health`)
        if (!response.ok) {
          throw new Error(`Health check failed (${response.status})`)
        }
        setHealth('ok')
        setHealthText('API healthy')
      } catch {
        setHealth('error')
        setHealthText('API unreachable')
      }
    }

    const loadJournals = async () => {
      setIsLoadingJournals(true)
      try {
        const response = await fetch(`${API_BASE_URL}/v1/journals`)
        if (!response.ok) {
          throw new Error(await readApiErrorMessage(response, 'Could not load journal presets'))
        }
        const payload = (await response.json()) as JournalOption[]
        setJournals(payload)
        setTargetJournal((current) => {
          if (payload.some((journal) => journal.slug === current)) {
            return current
          }
          return payload[0]?.slug ?? 'generic-original'
        })
      } catch (error) {
        setJournalsError(error instanceof Error ? error.message : 'Could not load journal presets')
      } finally {
        setIsLoadingJournals(false)
      }
    }

    checkHealth()
    loadJournals()
    loadProjects()
  }, [loadProjects])

  useEffect(() => {
    if (!selectedProjectId) {
      setManuscripts([])
      setManuscriptsError('')
      setSelectedManuscriptId('')
      return
    }
    loadManuscripts(selectedProjectId)
  }, [loadManuscripts, selectedProjectId])

  useEffect(() => {
    if (!selectedProjectId || !selectedManuscriptId) {
      setGenerationHistory([])
      setGenerationHistoryError('')
      return
    }
    loadGenerationJobs(selectedProjectId, selectedManuscriptId)
  }, [loadGenerationJobs, selectedManuscriptId, selectedProjectId])

  useEffect(() => {
    if (!selectedProjectId || !selectedManuscriptId) {
      setSnapshots([])
      setSnapshotsError('')
      return
    }
    loadSnapshots(selectedProjectId, selectedManuscriptId)
  }, [loadSnapshots, selectedManuscriptId, selectedProjectId])

  useEffect(() => {
    setCreateManuscriptError('')
    setCreateManuscriptSuccess('')
    setSaveSectionError('')
    setSaveSectionSuccess('')
    setExportManuscriptError('')
    setExportManuscriptSuccess('')
    setGenerateSectionError('')
    setGenerateSectionSuccess('')
    setSnapshots([])
    setSnapshotsError('')
    setSnapshotSuccess('')
    setSnapshotLabel('')
    setSnapshotRestoreMode('replace')
    setSnapshotRestoreSectionsInput('')
    setExportIncludeEmptySections(false)
    setFullGenerationError('')
    setFullGenerationSuccess('')
    setFullGenerationNotesContext('')
    setFullGenerationMaxCostUsd('')
    setFullGenerationDailyBudgetUsd('')
    setActiveGenerationJob(null)
    setGenerationHistory([])
    setGenerationHistoryError('')
    setGenerationHistoryFilter('all')
  }, [selectedProjectId])

  const onSubmit = async (event: FormEvent) => {
    event.preventDefault()
    if (!canSubmit) {
      return
    }
    setIsSubmitting(true)
    setErrorMessage('')
    setMethods('')
    setLastGeneratedSection('')
    setRequestId('')

    try {
      const response = await fetch(`${API_BASE_URL}/v1/draft/section`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ section: draftSection, notes }),
      })

      const returnedRequestId = response.headers.get('X-Request-ID') ?? ''
      setRequestId(returnedRequestId)

      if (!response.ok) {
        throw new Error(await readApiErrorMessage(response, 'Request failed'))
      }

      const payload = (await response.json()) as { section: string; draft: string }
      setMethods(payload.draft)
      setLastGeneratedSection(payload.section)
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Unexpected error')
    } finally {
      setIsSubmitting(false)
    }
  }

  const inferWizard = async () => {
    setWizardError('')
    setWizardBootstrap(null)
    setIsInferring(true)
    try {
      const response = await fetch(`${API_BASE_URL}/v1/wizard/infer`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          target_journal: targetJournal,
          answers: normalizeAnswers(wizardAnswers),
        }),
      })
      if (!response.ok) {
        throw new Error(await readApiErrorMessage(response, 'Could not infer wizard state'))
      }
      const payload = (await response.json()) as WizardInferResponse
      setWizardInference(payload)
    } catch (error) {
      setWizardError(error instanceof Error ? error.message : 'Could not infer wizard state')
    } finally {
      setIsInferring(false)
    }
  }

  const bootstrapProject = async () => {
    if (!canBootstrap) {
      return
    }
    setWizardError('')
    setIsBootstrapping(true)
    try {
      const response = await fetch(`${API_BASE_URL}/v1/wizard/bootstrap`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          title: projectTitle.trim(),
          target_journal: targetJournal,
          answers: normalizeAnswers(wizardAnswers),
          branch_name: 'main',
        }),
      })
      if (!response.ok) {
        throw new Error(await readApiErrorMessage(response, 'Could not bootstrap project'))
      }
      const payload = (await response.json()) as WizardBootstrapResponse
      setWizardBootstrap(payload)
      setWizardInference(payload.inference)
      setSelectedProjectId(payload.project.id)
      setSelectedManuscriptId(payload.manuscript.id)
      await loadProjects()
      await loadManuscripts(payload.project.id)
    } catch (error) {
      setWizardError(error instanceof Error ? error.message : 'Could not bootstrap project')
    } finally {
      setIsBootstrapping(false)
    }
  }

  const selectedProject = useMemo(
    () => projects.find((project) => project.id === selectedProjectId) ?? null,
    [projects, selectedProjectId],
  )
  const selectedManuscript = useMemo(
    () => manuscripts.find((manuscript) => manuscript.id === selectedManuscriptId) ?? null,
    [manuscripts, selectedManuscriptId],
  )
  const sectionKeys = useMemo(
    () => (selectedManuscript ? Object.keys(selectedManuscript.sections) : []),
    [selectedManuscript],
  )
  const canCreateManuscript = useMemo(
    () => selectedProjectId.trim().length > 0 && newBranchName.trim().length > 0 && !isCreatingManuscript,
    [isCreatingManuscript, newBranchName, selectedProjectId],
  )
  const canSaveSection = useMemo(
    () =>
      selectedProjectId.trim().length > 0 &&
      selectedManuscriptId.trim().length > 0 &&
      sectionEditorKey.trim().length > 0 &&
      !isSavingSection,
    [isSavingSection, sectionEditorKey, selectedManuscriptId, selectedProjectId],
  )
  const canGenerateSection = useMemo(
    () =>
      selectedProjectId.trim().length > 0 &&
      selectedManuscriptId.trim().length > 0 &&
      sectionEditorKey.trim().length > 0 &&
      sectionGenerationNotes.trim().length > 0 &&
      !isSavingSection &&
      !isGeneratingSection,
    [
      isGeneratingSection,
      isSavingSection,
      sectionEditorKey,
      sectionGenerationNotes,
      selectedManuscriptId,
      selectedProjectId,
    ],
  )
  const canExportManuscript = useMemo(
    () =>
      selectedProjectId.trim().length > 0 &&
      selectedManuscriptId.trim().length > 0 &&
      !isExportingManuscript,
    [isExportingManuscript, selectedManuscriptId, selectedProjectId],
  )
  const canCreateSnapshot = useMemo(
    () =>
      selectedProjectId.trim().length > 0 &&
      selectedManuscriptId.trim().length > 0 &&
      !isCreatingSnapshot &&
      !isSavingSection &&
      !isGeneratingSection,
    [
      isCreatingSnapshot,
      isGeneratingSection,
      isSavingSection,
      selectedManuscriptId,
      selectedProjectId,
    ],
  )
  const canStartFullGeneration = useMemo(
    () =>
      selectedProjectId.trim().length > 0 &&
      selectedManuscriptId.trim().length > 0 &&
      fullGenerationSections.length > 0 &&
      fullGenerationNotesContext.trim().length > 0 &&
      !isStartingFullGeneration &&
      !(
        activeGenerationJob !== null &&
        ['queued', 'running', 'cancel_requested'].includes(activeGenerationJob.status)
      ),
    [
      activeGenerationJob,
      fullGenerationNotesContext,
      fullGenerationSections.length,
      isStartingFullGeneration,
      selectedManuscriptId,
      selectedProjectId,
    ],
  )
  const isGenerationJobInFlight = useMemo(
    () =>
      activeGenerationJob !== null &&
      ['queued', 'running', 'cancel_requested'].includes(activeGenerationJob.status),
    [activeGenerationJob],
  )
  const liveGenerationEstimate = useMemo(
    () => estimateGenerationCostRange(fullGenerationSections, fullGenerationNotesContext),
    [fullGenerationNotesContext, fullGenerationSections],
  )
  const filteredGenerationHistory = useMemo(() => {
    if (generationHistoryFilter === 'all') {
      return generationHistory
    }
    return generationHistory.filter((job) => job.status === generationHistoryFilter)
  }, [generationHistory, generationHistoryFilter])
  const generationHistorySummary = useMemo(() => {
    const inFlightCount = generationHistory.filter((job) =>
      ['queued', 'running', 'cancel_requested'].includes(job.status),
    ).length
    const failedCount = generationHistory.filter((job) => job.status === 'failed').length
    const estimatedHighTotalUsd = generationHistory.reduce((total, job) => total + job.estimated_cost_usd_high, 0)
    return {
      totalCount: generationHistory.length,
      inFlightCount,
      failedCount,
      estimatedHighTotalUsd,
    }
  }, [generationHistory])
  const canCancelGenerationJob = useMemo(
    () =>
      activeGenerationJob !== null &&
      ['queued', 'running', 'cancel_requested'].includes(activeGenerationJob.status) &&
      !isCancellingGenerationJob,
    [activeGenerationJob, isCancellingGenerationJob],
  )
  const canRetryGenerationJob = useMemo(
    () =>
      activeGenerationJob !== null &&
      ['failed', 'cancelled'].includes(activeGenerationJob.status) &&
      !isRetryingGenerationJob,
    [activeGenerationJob, isRetryingGenerationJob],
  )

  useEffect(() => {
    setSnapshotsError('')
    setSnapshotSuccess('')
    if (!selectedManuscript) {
      setSectionEditorKey('')
      setSectionEditorContent('')
      setFullGenerationSections([])
      return
    }
    const keys = Object.keys(selectedManuscript.sections)
    if (keys.length === 0) {
      setSectionEditorKey('')
      setSectionEditorContent('')
      setFullGenerationSections([])
      return
    }
    const nextKey = keys.includes(sectionEditorKey) ? sectionEditorKey : keys[0]
    setSectionEditorKey(nextKey)
    setSectionEditorContent(selectedManuscript.sections[nextKey] ?? '')
    setFullGenerationSections((current) => {
      const filtered = current.filter((section) => keys.includes(section))
      if (filtered.length > 0) {
        return filtered
      }
      return keys
    })
    setActiveGenerationJob((current) =>
      current && current.manuscript_id === selectedManuscript.id ? current : null,
    )
  }, [sectionEditorKey, selectedManuscript])

  const createManuscript = async () => {
    if (!canCreateManuscript || !selectedProject) {
      return
    }
    setCreateManuscriptError('')
    setCreateManuscriptSuccess('')
    setIsCreatingManuscript(true)
    try {
      const response = await fetch(`${API_BASE_URL}/v1/projects/${selectedProject.id}/manuscripts`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          branch_name: newBranchName.trim(),
          sections: parseSections(newSectionsInput),
        }),
      })
      if (!response.ok) {
        throw new Error(await readApiErrorMessage(response, 'Could not create manuscript branch'))
      }
      const payload = (await response.json()) as ManuscriptResponse
      setCreateManuscriptSuccess(`Created manuscript branch "${payload.branch_name}".`)
      setCreateManuscriptError('')
      setNewSectionsInput('')
      setNewBranchName('')
      setSelectedManuscriptId(payload.id)
      await loadManuscripts(selectedProject.id)
    } catch (error) {
      setCreateManuscriptError(error instanceof Error ? error.message : 'Could not create manuscript branch')
      setCreateManuscriptSuccess('')
    } finally {
      setIsCreatingManuscript(false)
    }
  }

  const onSectionKeyChange = (nextKey: string) => {
    setSectionEditorKey(nextKey)
    setSaveSectionError('')
    setSaveSectionSuccess('')
    setGenerateSectionError('')
    setGenerateSectionSuccess('')
    if (!selectedManuscript) {
      setSectionEditorContent('')
      return
    }
    setSectionEditorContent(selectedManuscript.sections[nextKey] ?? '')
  }

  const patchManuscriptSection = async (
    projectId: string,
    manuscriptId: string,
    sectionKey: string,
    content: string,
  ): Promise<ManuscriptResponse> => {
    const response = await fetch(`${API_BASE_URL}/v1/projects/${projectId}/manuscripts/${manuscriptId}`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        sections: {
          [sectionKey]: content,
        },
      }),
    })
    if (!response.ok) {
      throw new Error(await readApiErrorMessage(response, 'Could not save manuscript section'))
    }
    return (await response.json()) as ManuscriptResponse
  }

  const saveManuscriptSection = async () => {
    if (!canSaveSection || !selectedProject || !selectedManuscript) {
      return
    }
    setSaveSectionError('')
    setSaveSectionSuccess('')
    setGenerateSectionError('')
    setIsSavingSection(true)
    const normalizedSectionKey = sectionEditorKey.trim()
    try {
      const payload = await patchManuscriptSection(
        selectedProject.id,
        selectedManuscript.id,
        normalizedSectionKey,
        sectionEditorContent,
      )
      setSaveSectionSuccess(`Saved section "${normalizedSectionKey}" on branch "${payload.branch_name}".`)
      setSaveSectionError('')
      await loadManuscripts(selectedProject.id)
      setSelectedManuscriptId(payload.id)
    } catch (error) {
      setSaveSectionError(error instanceof Error ? error.message : 'Could not save manuscript section')
      setSaveSectionSuccess('')
    } finally {
      setIsSavingSection(false)
    }
  }

  const exportManuscriptMarkdown = async () => {
    if (!canExportManuscript || !selectedProject || !selectedManuscript) {
      return
    }
    setExportManuscriptError('')
    setExportManuscriptSuccess('')
    setIsExportingManuscript(true)
    try {
      const params = new URLSearchParams()
      if (exportIncludeEmptySections) {
        params.set('include_empty', 'true')
      }
      const query = params.toString()
      const response = await fetch(
        `${API_BASE_URL}/v1/projects/${selectedProject.id}/manuscripts/${selectedManuscript.id}/export/markdown${
          query ? `?${query}` : ''
        }`,
      )
      if (!response.ok) {
        throw new Error(await readApiErrorMessage(response, 'Could not export manuscript'))
      }
      const blob = await response.blob()
      const filename = getFilenameFromContentDisposition(
        response.headers.get('Content-Disposition'),
        `${selectedManuscript.branch_name}-manuscript.md`,
      )
      const url = window.URL.createObjectURL(blob)
      const anchor = document.createElement('a')
      anchor.href = url
      anchor.download = filename
      document.body.appendChild(anchor)
      anchor.click()
      document.body.removeChild(anchor)
      window.URL.revokeObjectURL(url)
      setExportManuscriptSuccess(`Downloaded ${filename}.`)
    } catch (error) {
      setExportManuscriptError(error instanceof Error ? error.message : 'Could not export manuscript')
    } finally {
      setIsExportingManuscript(false)
    }
  }

  const generateDraftIntoSection = async () => {
    if (!canGenerateSection || !selectedProject || !selectedManuscript) {
      return
    }
    setGenerateSectionError('')
    setGenerateSectionSuccess('')
    setSaveSectionError('')
    setIsGeneratingSection(true)
    const normalizedSectionKey = sectionEditorKey.trim()
    try {
      const draftResponse = await fetch(`${API_BASE_URL}/v1/draft/section`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          section: normalizedSectionKey,
          notes: sectionGenerationNotes.trim(),
        }),
      })
      const returnedRequestId = draftResponse.headers.get('X-Request-ID') ?? ''
      if (returnedRequestId) {
        setRequestId(returnedRequestId)
      }
      if (!draftResponse.ok) {
        throw new Error(await readApiErrorMessage(draftResponse, 'Could not generate section text'))
      }
      const draftPayload = (await draftResponse.json()) as { section: string; draft: string }
      const generatedDraft = draftPayload.draft
      setMethods(generatedDraft)
      setLastGeneratedSection(draftPayload.section)
      setSectionEditorContent(generatedDraft)

      const updatedManuscript = await patchManuscriptSection(
        selectedProject.id,
        selectedManuscript.id,
        normalizedSectionKey,
        generatedDraft,
      )
      setGenerateSectionSuccess(
        `Generated and saved section "${normalizedSectionKey}" on branch "${updatedManuscript.branch_name}".`,
      )
      setGenerateSectionError('')
      await loadManuscripts(selectedProject.id)
      setSelectedManuscriptId(updatedManuscript.id)
    } catch (error) {
      setGenerateSectionError(error instanceof Error ? error.message : 'Could not generate draft for this section')
      setGenerateSectionSuccess('')
    } finally {
      setIsGeneratingSection(false)
    }
  }

  const createSnapshot = async () => {
    if (!canCreateSnapshot || !selectedProject || !selectedManuscript) {
      return
    }
    setSnapshotsError('')
    setSnapshotSuccess('')
    setIsCreatingSnapshot(true)
    try {
      const normalizedLabel = snapshotLabel.trim()
      const response = await fetch(
        `${API_BASE_URL}/v1/projects/${selectedProject.id}/manuscripts/${selectedManuscript.id}/snapshots`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            label: normalizedLabel.length > 0 ? normalizedLabel : undefined,
          }),
        },
      )
      if (!response.ok) {
        throw new Error(await readApiErrorMessage(response, 'Could not create snapshot'))
      }
      const payload = (await response.json()) as ManuscriptSnapshotResponse
      setSnapshots((current) => [payload, ...current.filter((snapshot) => snapshot.id !== payload.id)])
      setSnapshotLabel('')
      setSnapshotSuccess(`Created snapshot "${payload.label}".`)
      await loadSnapshots(selectedProject.id, selectedManuscript.id)
    } catch (error) {
      setSnapshotsError(error instanceof Error ? error.message : 'Could not create snapshot')
    } finally {
      setIsCreatingSnapshot(false)
    }
  }

  const restoreSnapshot = async (snapshot: ManuscriptSnapshotResponse) => {
    if (!selectedProject || !selectedManuscript || restoringSnapshotId) {
      return
    }
    setSnapshotsError('')
    setSnapshotSuccess('')
    setRestoringSnapshotId(snapshot.id)
    try {
      const parsedSections = parseSections(snapshotRestoreSectionsInput)
      const response = await fetch(
        `${API_BASE_URL}/v1/projects/${selectedProject.id}/manuscripts/${selectedManuscript.id}/snapshots/${snapshot.id}/restore`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            mode: snapshotRestoreMode,
            sections: parsedSections,
          }),
        },
      )
      if (!response.ok) {
        throw new Error(await readApiErrorMessage(response, 'Could not restore snapshot'))
      }
      const payload = (await response.json()) as ManuscriptResponse
      if (sectionEditorKey && payload.sections[sectionEditorKey] !== undefined) {
        setSectionEditorContent(payload.sections[sectionEditorKey])
      }
      setSnapshotSuccess(`Restored snapshot "${snapshot.label}".`)
      await loadManuscripts(selectedProject.id)
      setSelectedManuscriptId(payload.id)
      await loadSnapshots(selectedProject.id, payload.id)
    } catch (error) {
      setSnapshotsError(error instanceof Error ? error.message : 'Could not restore snapshot')
    } finally {
      setRestoringSnapshotId('')
    }
  }

  const toggleFullGenerationSection = (section: string) => {
    setFullGenerationSections((current) => {
      if (current.includes(section)) {
        return current.filter((item) => item !== section)
      }
      return [...current, section]
    })
  }

  const selectAllFullGenerationSections = () => {
    setFullGenerationSections(sectionKeys)
  }

  const clearFullGenerationSections = () => {
    setFullGenerationSections([])
  }

  const loadGenerationJobIntoForm = (job: GenerationJobResponse) => {
    setActiveGenerationJob(job)
    setFullGenerationSections(job.sections)
    setFullGenerationNotesContext(job.notes_context)
    setFullGenerationSuccess(`Loaded job ${job.id} settings into the generation form.`)
    setFullGenerationError('')
  }

  const refreshGenerationHistory = async () => {
    if (!selectedProject || !selectedManuscript) {
      return
    }
    await loadGenerationJobs(selectedProject.id, selectedManuscript.id)
  }

  const startFullManuscriptGeneration = async () => {
    if (!canStartFullGeneration || !selectedProject || !selectedManuscript) {
      return
    }
    setFullGenerationError('')
    setFullGenerationSuccess('')
    setIsStartingFullGeneration(true)
    const parsedMaxCostUsd = parseOptionalPositiveNumber(fullGenerationMaxCostUsd)
    const parsedDailyBudgetUsd = parseOptionalPositiveNumber(fullGenerationDailyBudgetUsd)
    try {
      const response = await fetch(
        `${API_BASE_URL}/v1/projects/${selectedProject.id}/manuscripts/${selectedManuscript.id}/generate`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            sections: fullGenerationSections,
            notes_context: fullGenerationNotesContext.trim(),
            max_estimated_cost_usd: parsedMaxCostUsd,
            project_daily_budget_usd: parsedDailyBudgetUsd,
          }),
        },
      )
      const returnedRequestId = response.headers.get('X-Request-ID') ?? ''
      if (returnedRequestId) {
        setRequestId(returnedRequestId)
      }
      if (!response.ok) {
        throw new Error(await readApiErrorMessage(response, 'Could not enqueue full manuscript generation'))
      }
      const payload = (await response.json()) as GenerationJobResponse
      setActiveGenerationJob(payload)
      setGenerationHistory((current) => [payload, ...current.filter((job) => job.id !== payload.id)])
      setFullGenerationSuccess(
        `Queued generation job ${payload.id}. Estimated cost ${formatUsd(payload.estimated_cost_usd_low)}-${formatUsd(payload.estimated_cost_usd_high)}.`,
      )
      setFullGenerationError('')
    } catch (error) {
      setFullGenerationError(
        error instanceof Error ? error.message : 'Could not enqueue full manuscript generation',
      )
      setFullGenerationSuccess('')
    } finally {
      setIsStartingFullGeneration(false)
    }
  }

  useEffect(() => {
    if (!activeGenerationJob || !selectedProject) {
      return
    }
    if (!['queued', 'running', 'cancel_requested'].includes(activeGenerationJob.status)) {
      return
    }

    let cancelled = false
    const timerId = window.setTimeout(async () => {
      try {
        const response = await fetch(`${API_BASE_URL}/v1/generation-jobs/${activeGenerationJob.id}`)
        if (!response.ok) {
          throw new Error(await readApiErrorMessage(response, 'Could not poll generation job'))
        }
        const payload = (await response.json()) as GenerationJobResponse
        if (cancelled) {
          return
        }
        setActiveGenerationJob(payload)
        setGenerationHistory((current) => {
          const remaining = current.filter((job) => job.id !== payload.id)
          return [payload, ...remaining]
        })
        if (payload.status === 'completed') {
          setFullGenerationSuccess(
            `Generation completed (${payload.sections.length} sections). Estimated cost ${formatUsd(payload.estimated_cost_usd_low)}-${formatUsd(payload.estimated_cost_usd_high)}.`,
          )
          setFullGenerationError('')
          await loadManuscripts(selectedProject.id)
          if (selectedManuscript) {
            await loadGenerationJobs(selectedProject.id, selectedManuscript.id)
          }
        } else if (payload.status === 'failed') {
          setFullGenerationError(payload.error_detail || 'Generation job failed.')
          await loadManuscripts(selectedProject.id)
          if (selectedManuscript) {
            await loadGenerationJobs(selectedProject.id, selectedManuscript.id)
          }
        } else if (payload.status === 'cancelled') {
          setFullGenerationSuccess(`Generation job ${payload.id} cancelled.`)
          setFullGenerationError('')
          await loadManuscripts(selectedProject.id)
          if (selectedManuscript) {
            await loadGenerationJobs(selectedProject.id, selectedManuscript.id)
          }
        }
      } catch (error) {
        if (!cancelled) {
          setFullGenerationError(error instanceof Error ? error.message : 'Could not poll generation job')
        }
      }
    }, 1500)

    return () => {
      cancelled = true
      window.clearTimeout(timerId)
    }
  }, [activeGenerationJob, loadGenerationJobs, loadManuscripts, selectedManuscript, selectedProject])

  const cancelActiveGenerationJob = async () => {
    if (!activeGenerationJob || !canCancelGenerationJob) {
      return
    }
    setIsCancellingGenerationJob(true)
    setFullGenerationError('')
    setFullGenerationSuccess('')
    try {
      const response = await fetch(`${API_BASE_URL}/v1/generation-jobs/${activeGenerationJob.id}/cancel`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
      })
      if (!response.ok) {
        throw new Error(await readApiErrorMessage(response, 'Could not cancel generation job'))
      }
      const payload = (await response.json()) as GenerationJobResponse
      setActiveGenerationJob(payload)
      setGenerationHistory((current) => [payload, ...current.filter((job) => job.id !== payload.id)])
      setFullGenerationSuccess(`Job ${payload.id} cancellation requested.`)
      if (selectedProject) {
        await loadManuscripts(selectedProject.id)
      }
      if (selectedProject && selectedManuscript) {
        await loadGenerationJobs(selectedProject.id, selectedManuscript.id)
      }
    } catch (error) {
      setFullGenerationError(error instanceof Error ? error.message : 'Could not cancel generation job')
    } finally {
      setIsCancellingGenerationJob(false)
    }
  }

  const retryActiveGenerationJob = async () => {
    if (!activeGenerationJob || !canRetryGenerationJob) {
      return
    }
    setIsRetryingGenerationJob(true)
    setFullGenerationError('')
    setFullGenerationSuccess('')
    const parsedMaxCostUsd = parseOptionalPositiveNumber(fullGenerationMaxCostUsd)
    const parsedDailyBudgetUsd = parseOptionalPositiveNumber(fullGenerationDailyBudgetUsd)
    try {
      const response = await fetch(`${API_BASE_URL}/v1/generation-jobs/${activeGenerationJob.id}/retry`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          max_estimated_cost_usd: parsedMaxCostUsd,
          project_daily_budget_usd: parsedDailyBudgetUsd,
        }),
      })
      if (!response.ok) {
        throw new Error(await readApiErrorMessage(response, 'Could not retry generation job'))
      }
      const payload = (await response.json()) as GenerationJobResponse
      setActiveGenerationJob(payload)
      setGenerationHistory((current) => [payload, ...current.filter((job) => job.id !== payload.id)])
      setFullGenerationSuccess(
        `Retried as job ${payload.id}. Estimated cost ${formatUsd(payload.estimated_cost_usd_low)}-${formatUsd(payload.estimated_cost_usd_high)}.`,
      )
      setFullGenerationSections(payload.sections)
      setFullGenerationNotesContext(payload.notes_context)
      if (selectedProject && selectedManuscript) {
        await loadGenerationJobs(selectedProject.id, selectedManuscript.id)
      }
    } catch (error) {
      setFullGenerationError(error instanceof Error ? error.message : 'Could not retry generation job')
    } finally {
      setIsRetryingGenerationJob(false)
    }
  }

  return (
    <main className="page">
      <div className="aurora" />
      <section className="panel">
        <header className="panel-header">
          <p className="eyebrow">Research OS</p>
          <h1>Authoring + Project Wizard</h1>
          <p className="subhead">Draft manuscript sections and bootstrap projects from one console.</p>
          <span className={`health-chip health-${health}`}>{healthText}</span>
        </header>

        <section className="section-block">
          <div className="section-heading">
            <h2>Quick Manuscript Generation</h2>
            <span className="chip-inline">No project needed</span>
          </div>
          <p className="section-note">
            Primary workflow: generate multiple manuscript sections directly from your notes without creating or uploading
            a manuscript.
          </p>
          <div className="section-toggle-grid">
            {SECTION_DRAFT_OPTIONS.map((section) => (
              <label key={`quick-${section}`} className="section-toggle">
                <input
                  type="checkbox"
                  checked={quickGenerationSections.includes(section)}
                  onChange={() => toggleQuickGenerationSection(section)}
                  disabled={isGeneratingQuickDrafts}
                />
                <span>{humanizeIdentifier(section)}</span>
              </label>
            ))}
          </div>
          <div className="inline-actions">
            <button type="button" className="ghost-button" onClick={selectAllQuickGenerationSections}>
              Select All
            </button>
            <button type="button" className="ghost-button" onClick={clearQuickGenerationSections}>
              Clear
            </button>
          </div>
          <div className="field-grid">
            <label className="wide">
              Shared notes for selected sections
              <textarea
                rows={8}
                value={quickGenerationNotes}
                onChange={(event) => setQuickGenerationNotes(event.target.value)}
                placeholder="Paste or type your key trial notes once; drafts will be generated for each selected section."
              />
            </label>
          </div>
          <p className="muted">
            Estimate: {formatUsd(quickGenerationEstimate.estimatedCostUsdLow)} -{' '}
            {formatUsd(quickGenerationEstimate.estimatedCostUsdHigh)} ({quickGenerationEstimate.estimatedInputTokens} input
            tokens, {quickGenerationEstimate.estimatedOutputTokensLow} - {quickGenerationEstimate.estimatedOutputTokensHigh}{' '}
            output tokens)
          </p>
          <div className="button-row">
            <button type="button" onClick={generateQuickDrafts} disabled={!canGenerateQuickDrafts}>
              {isGeneratingQuickDrafts ? 'Generating...' : 'Generate Selected Sections'}
            </button>
            <button type="button" className="ghost-button" onClick={exportQuickDraftsMarkdown} disabled={!hasQuickGenerationDrafts || isExportingQuickDrafts}>
              {isExportingQuickDrafts ? 'Exporting...' : 'Export Markdown'}
            </button>
            <button type="button" className="ghost-button" onClick={copyQuickDraftsToClipboard} disabled={!hasQuickGenerationDrafts || isCopyingQuickDrafts}>
              {isCopyingQuickDrafts ? 'Copying...' : 'Copy All'}
            </button>
          </div>
          {isGeneratingQuickDrafts && (
            <p className="muted">
              Generating {quickGenerationCurrentSection ? humanizeIdentifier(quickGenerationCurrentSection) : 'drafts'}...{' '}
              {quickGenerationProgressPercent}%
            </p>
          )}
          {quickGenerationError && (
            <section className="result error compact">
              <p>{quickGenerationError}</p>
            </section>
          )}
          {quickGenerationSuccess && (
            <section className="result success compact">
              <p>{quickGenerationSuccess}</p>
            </section>
          )}
          {hasQuickGenerationDrafts && (
            <div className="quick-draft-list">
              {quickDraftSectionOrder.map((section) => {
                const draft = (quickGenerationDrafts[section] ?? '').trim()
                if (!draft) {
                  return null
                }
                return (
                  <section key={`quick-draft-${section}`} className="result success quick-draft-card">
                    <h3>{humanizeIdentifier(section)}</h3>
                    <pre>{draft}</pre>
                  </section>
                )
              })}
            </div>
          )}
        </section>

        <section className="section-block">
          <h2>Single Section Draft Studio</h2>
          <p className="section-note">Optional: generate one section at a time.</p>
          <form onSubmit={onSubmit} className="composer">
            <label htmlFor="draft-section">Section</label>
            <select
              id="draft-section"
              value={draftSection}
              onChange={(event) => setDraftSection(event.target.value)}
            >
              {SECTION_DRAFT_OPTIONS.map((section) => (
                <option key={section} value={section}>
                  {humanizeIdentifier(section)}
                </option>
              ))}
            </select>
            <label htmlFor="notes">Section Notes</label>
            <textarea
              id="notes"
              value={notes}
              onChange={(event) => setNotes(event.target.value)}
              placeholder="Paste source notes for the selected section..."
              rows={8}
            />
            <button type="submit" disabled={!canSubmit}>
              {isSubmitting ? 'Generating...' : 'Generate Section Draft'}
            </button>
          </form>

          {errorMessage && (
            <section className="result error">
              <h3>Request Failed</h3>
              <p>{errorMessage}</p>
            </section>
          )}

          {methods && (
            <section className="result success">
              <h3>Generated {humanizeIdentifier(lastGeneratedSection || draftSection)} Draft</h3>
              <pre>{methods}</pre>
            </section>
          )}

          {requestId && (
            <footer className="trace">
              Request ID: <code>{requestId}</code>
            </footer>
          )}
        </section>

        <section className="section-block">
          <div className="section-heading">
            <h2>Project Bootstrap Wizard</h2>
          </div>
          <p className="section-note">Infer adapts required questions from your current answers before creating a project.</p>

          <div className="field-grid two-column">
            <label>
              Project title
              <input
                type="text"
                value={projectTitle}
                onChange={(event) => setProjectTitle(event.target.value)}
                placeholder="e.g. Heart Failure Registry Manuscript"
              />
            </label>
            <label>
              Target journal
              <select
                value={targetJournal}
                onChange={(event) => setTargetJournal(event.target.value)}
                disabled={isLoadingJournals || journals.length === 0}
              >
                {journals.map((journal) => (
                  <option key={journal.slug} value={journal.slug}>
                    {journal.display_name}
                  </option>
                ))}
              </select>
            </label>
          </div>

          {journalsError && (
            <section className="result error compact">
              <p>{journalsError}</p>
            </section>
          )}

          <div className="field-grid">
            {BASE_WIZARD_FIELDS.map((field) => {
              const value = wizardAnswers[field.id] ?? ''
              if (field.kind === 'textarea') {
                return (
                  <label key={field.id} className="wide">
                    {field.label}
                    {field.required ? ' *' : ''}
                    <textarea
                      rows={3}
                      value={value}
                      onChange={(event) => onWizardAnswerChange(field.id, event.target.value)}
                    />
                  </label>
                )
              }
              if (field.kind === 'select') {
                return (
                  <label key={field.id}>
                    {field.label}
                    {field.required ? ' *' : ''}
                    <select value={value} onChange={(event) => onWizardAnswerChange(field.id, event.target.value)}>
                      {(field.options ?? []).map((option) => (
                        <option key={option} value={option}>
                          {prettyOption(
                            option,
                            field.id === 'manuscript_goal' ? MANUSCRIPT_GOAL_LABELS : DATA_SOURCE_LABELS,
                          )}
                        </option>
                      ))}
                    </select>
                  </label>
                )
              }
              return (
                <label key={field.id}>
                  {field.label}
                  {field.required ? ' *' : ''}
                  <input type="text" value={value} onChange={(event) => onWizardAnswerChange(field.id, event.target.value)} />
                </label>
              )
            })}
            {dynamicQuestions.map((question) => {
              const value = wizardAnswers[question.id] ?? ''
              if (question.kind === 'select') {
                return (
                  <label key={question.id}>
                    {question.label}
                    {question.required ? ' *' : ''}
                    <select value={value} onChange={(event) => onWizardAnswerChange(question.id, event.target.value)}>
                      <option value="">Select...</option>
                      {(question.options ?? []).map((option) => (
                        <option key={option} value={option}>
                          {prettyOption(option)}
                        </option>
                      ))}
                    </select>
                  </label>
                )
              }
              if (question.kind === 'textarea') {
                return (
                  <label key={question.id} className="wide">
                    {question.label}
                    {question.required ? ' *' : ''}
                    <textarea
                      rows={3}
                      value={value}
                      onChange={(event) => onWizardAnswerChange(question.id, event.target.value)}
                    />
                  </label>
                )
              }
              return (
                <label key={question.id}>
                  {question.label}
                  {question.required ? ' *' : ''}
                  <input
                    type="text"
                    value={value}
                    onChange={(event) => onWizardAnswerChange(question.id, event.target.value)}
                  />
                </label>
              )
            })}
          </div>

          <div className="button-row">
            <button
              type="button"
              className="ghost-button"
              onClick={inferWizard}
              disabled={isInferring || isBootstrapping || targetJournal.trim().length === 0}
            >
              {isInferring ? 'Inferring...' : 'Infer Wizard State'}
            </button>
            <button type="button" onClick={bootstrapProject} disabled={!canBootstrap}>
              {isBootstrapping ? 'Bootstrapping...' : 'Bootstrap Project + Manuscript'}
            </button>
          </div>

          {wizardError && (
            <section className="result error compact">
              <p>{wizardError}</p>
            </section>
          )}

          {wizardInference && (
            <section className="result info">
              <h3>Inference Snapshot</h3>
              <p>
                Study type: <strong>{humanizeIdentifier(wizardInference.inferred_study_type)}</strong>
              </p>
              <p>
                Endpoint type: <strong>{humanizeIdentifier(wizardInference.inferred_primary_endpoint_type)}</strong>
              </p>
              <p>
                Recommended sections: <code>{wizardInference.recommended_sections.join(', ')}</code>
              </p>
              <p>
                Answered fields: <strong>{wizardInference.answered_fields.length}</strong>
              </p>
              {wizardInference.next_questions.length > 0 && (
                <p>
                  Next required fields:{' '}
                  <code>
                    {wizardInference.next_questions.map((question) => humanizeIdentifier(question.id)).join(', ')}
                  </code>
                </p>
              )}
            </section>
          )}

          {wizardBootstrap && (
            <section className="result success">
              <h3>Project Bootstrapped</h3>
              <p>
                Project: <code>{wizardBootstrap.project.id}</code>
              </p>
              <p>
                Manuscript: <code>{wizardBootstrap.manuscript.id}</code>
              </p>
              <p>
                Branch: <code>{wizardBootstrap.manuscript.branch_name}</code>
              </p>
            </section>
          )}
        </section>

        <section className="section-block">
          <div className="section-heading">
            <h2>Project Library</h2>
            <button type="button" className="ghost-button" onClick={loadProjects} disabled={isLoadingProjects}>
              {isLoadingProjects ? 'Refreshing...' : 'Refresh'}
            </button>
          </div>
          <p className="section-note">
            Optional advanced workflow: manage manuscript branches, async generation jobs, snapshots, and exports.
          </p>

          {projectsError && (
            <section className="result error compact">
              <p>{projectsError}</p>
            </section>
          )}

          {projects.length === 0 ? (
            <p className="muted">No projects found yet.</p>
          ) : (
            <div className="project-list">
              {projects.map((project) => (
                <button
                  type="button"
                  key={project.id}
                  className={`project-item ${project.id === selectedProjectId ? 'selected' : ''}`}
                  onClick={() => setSelectedProjectId(project.id)}
                >
                  <strong>{project.title}</strong>
                  <span>{journalDisplayNameBySlug.get(project.target_journal) ?? humanizeIdentifier(project.target_journal)}</span>
                  <span>Updated {formatUtcDate(project.updated_at)}</span>
                </button>
              ))}
            </div>
          )}

          {selectedProject && (
            <section className="result info">
              <h3>Manuscripts for {selectedProject.title}</h3>
              <div className="inline-form">
                <div className="inline-fields">
                  <label>
                    Branch name
                    <input
                      type="text"
                      value={newBranchName}
                      onChange={(event) => setNewBranchName(event.target.value)}
                      placeholder="e.g. jacc-revision-1"
                    />
                  </label>
                  <label>
                    Sections (optional, comma-separated)
                    <input
                      type="text"
                      value={newSectionsInput}
                      onChange={(event) => setNewSectionsInput(event.target.value)}
                      placeholder="title, abstract, methods, results"
                    />
                  </label>
                </div>
                <div className="inline-actions">
                  <button type="button" onClick={createManuscript} disabled={!canCreateManuscript}>
                    {isCreatingManuscript ? 'Creating...' : 'Create Branch Manuscript'}
                  </button>
                </div>
              </div>
              {createManuscriptError && <p>{createManuscriptError}</p>}
              {createManuscriptSuccess && <p>{createManuscriptSuccess}</p>}
              {isLoadingManuscripts && <p>Loading manuscripts...</p>}
              {manuscriptsError && <p>{manuscriptsError}</p>}
              {!isLoadingManuscripts && !manuscriptsError && manuscripts.length === 0 && <p>No manuscripts yet.</p>}
              {!isLoadingManuscripts && !manuscriptsError && manuscripts.length > 0 && (
                <>
                  <div className="manuscript-picker">
                    {manuscripts.map((manuscript) => (
                      <button
                        type="button"
                        key={manuscript.id}
                        className={`manuscript-chip ${manuscript.id === selectedManuscriptId ? 'selected' : ''}`}
                        onClick={() => setSelectedManuscriptId(manuscript.id)}
                      >
                        {manuscript.branch_name} ({manuscript.status})
                      </button>
                    ))}
                  </div>
                  {selectedManuscript && (
                    <div className="section-editor">
                      <p className="muted">Editing branch {selectedManuscript.branch_name}</p>
                      <label>
                        Section
                        <select
                          value={sectionEditorKey}
                          onChange={(event) => onSectionKeyChange(event.target.value)}
                          disabled={sectionKeys.length === 0}
                        >
                          {sectionKeys.map((section) => (
                            <option key={section} value={section}>
                              {humanizeIdentifier(section)}
                            </option>
                          ))}
                        </select>
                      </label>
                      <label>
                        Content
                        <textarea
                          rows={8}
                          value={sectionEditorContent}
                          onChange={(event) => setSectionEditorContent(event.target.value)}
                          disabled={sectionKeys.length === 0}
                        />
                      </label>
                      <div className="inline-actions">
                        <button type="button" onClick={saveManuscriptSection} disabled={!canSaveSection}>
                          {isSavingSection ? 'Saving...' : 'Save Section'}
                        </button>
                      </div>
                      <div className="inline-actions">
                        <label className="checkbox-inline">
                          <input
                            type="checkbox"
                            checked={exportIncludeEmptySections}
                            onChange={(event) => setExportIncludeEmptySections(event.target.checked)}
                            disabled={isExportingManuscript}
                          />
                          <span>Include empty sections</span>
                        </label>
                        <button type="button" onClick={exportManuscriptMarkdown} disabled={!canExportManuscript}>
                          {isExportingManuscript ? 'Exporting...' : 'Export Markdown'}
                        </button>
                      </div>
                      {exportManuscriptError && <p>{exportManuscriptError}</p>}
                      {exportManuscriptSuccess && <p>{exportManuscriptSuccess}</p>}
                      <div className="generation-box">
                        <label>
                          Generation notes for selected section
                          <textarea
                            rows={5}
                            value={sectionGenerationNotes}
                            onChange={(event) => setSectionGenerationNotes(event.target.value)}
                            placeholder="Paste source notes to generate text directly into the selected section."
                          />
                        </label>
                        <div className="inline-actions">
                          <button type="button" onClick={generateDraftIntoSection} disabled={!canGenerateSection}>
                            {isGeneratingSection ? 'Generating...' : 'Generate Draft + Save Section'}
                          </button>
                        </div>
                      </div>
                      <div className="snapshot-box">
                        <h4>Snapshots</h4>
                        <p className="muted">
                          Save manuscript states before edits or generation, then restore when needed.
                        </p>
                        <div className="inline-fields">
                          <label>
                            Snapshot label (optional)
                            <input
                              type="text"
                              value={snapshotLabel}
                              onChange={(event) => setSnapshotLabel(event.target.value)}
                              placeholder="e.g. Before discussion rewrite"
                            />
                          </label>
                        </div>
                        <div className="inline-actions">
                          <button type="button" onClick={createSnapshot} disabled={!canCreateSnapshot}>
                            {isCreatingSnapshot ? 'Saving...' : 'Save Snapshot'}
                          </button>
                          <button
                            type="button"
                            className="ghost-button"
                            onClick={() =>
                              selectedProject &&
                              selectedManuscript &&
                              loadSnapshots(selectedProject.id, selectedManuscript.id)
                            }
                            disabled={isLoadingSnapshots || !selectedProject || !selectedManuscript}
                          >
                            {isLoadingSnapshots ? 'Refreshing...' : 'Refresh'}
                          </button>
                        </div>
                        <div className="inline-fields">
                          <label>
                            Restore mode
                            <select
                              value={snapshotRestoreMode}
                              onChange={(event) => setSnapshotRestoreMode(event.target.value as SnapshotRestoreMode)}
                              disabled={Boolean(restoringSnapshotId)}
                            >
                              <option value="replace">Replace manuscript with snapshot selection</option>
                              <option value="merge">Merge snapshot selection into current manuscript</option>
                            </select>
                          </label>
                          <label>
                            Sections to restore (optional, comma-separated)
                            <input
                              type="text"
                              value={snapshotRestoreSectionsInput}
                              onChange={(event) => setSnapshotRestoreSectionsInput(event.target.value)}
                              placeholder="e.g. methods, results"
                              disabled={Boolean(restoringSnapshotId)}
                            />
                          </label>
                        </div>
                        {snapshotsError && <p>{snapshotsError}</p>}
                        {snapshotSuccess && <p>{snapshotSuccess}</p>}
                        {!snapshotsError && !isLoadingSnapshots && snapshots.length === 0 && (
                          <p className="muted">No snapshots yet.</p>
                        )}
                        {snapshots.length > 0 && (
                          <div className="snapshot-list">
                            {snapshots.map((snapshot) => (
                              <div key={snapshot.id} className="snapshot-item">
                                <div className="snapshot-meta">
                                  <strong>{snapshot.label}</strong>
                                  <span>{formatUtcDate(snapshot.created_at)}</span>
                                </div>
                                <p className="muted">
                                  {Object.keys(snapshot.sections).length} sections captured
                                </p>
                                <div className="inline-actions">
                                  <button
                                    type="button"
                                    className="ghost-button"
                                    onClick={() => restoreSnapshot(snapshot)}
                                    disabled={Boolean(restoringSnapshotId)}
                                  >
                                    {restoringSnapshotId === snapshot.id ? 'Restoring...' : 'Restore'}
                                  </button>
                                </div>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                      <div className="full-generation-box">
                        <h4>Async Full-Manuscript Generation</h4>
                        <p className="muted">
                          Queue multi-section generation in the background with progress tracking and estimated cost.
                        </p>
                        <div className="section-toggle-grid">
                          {sectionKeys.map((section) => (
                            <label key={section} className="section-toggle">
                              <input
                                type="checkbox"
                                checked={fullGenerationSections.includes(section)}
                                onChange={() => toggleFullGenerationSection(section)}
                                disabled={isStartingFullGeneration}
                              />
                              <span>{humanizeIdentifier(section)}</span>
                            </label>
                          ))}
                        </div>
                        <div className="inline-actions">
                          <button type="button" className="ghost-button" onClick={selectAllFullGenerationSections}>
                            Select All
                          </button>
                          <button type="button" className="ghost-button" onClick={clearFullGenerationSections}>
                            Clear
                          </button>
                        </div>
                        <label>
                          Shared notes context for all selected sections
                          <textarea
                            rows={6}
                            value={fullGenerationNotesContext}
                            onChange={(event) => setFullGenerationNotesContext(event.target.value)}
                            placeholder="Provide the common study context used to draft all selected sections."
                          />
                        </label>
                        <div className="inline-fields">
                          <label>
                            Max estimated job cost (USD, optional)
                            <input
                              type="number"
                              min="0"
                              step="0.0001"
                              value={fullGenerationMaxCostUsd}
                              onChange={(event) => setFullGenerationMaxCostUsd(event.target.value)}
                              placeholder="e.g. 0.0500"
                            />
                          </label>
                          <label>
                            Project daily budget cap (USD, optional)
                            <input
                              type="number"
                              min="0"
                              step="0.0001"
                              value={fullGenerationDailyBudgetUsd}
                              onChange={(event) => setFullGenerationDailyBudgetUsd(event.target.value)}
                              placeholder="e.g. 0.2000"
                            />
                          </label>
                        </div>
                        <p className="muted">
                          Live estimate: {formatUsd(liveGenerationEstimate.estimatedCostUsdLow)} -{' '}
                          {formatUsd(liveGenerationEstimate.estimatedCostUsdHigh)} ({liveGenerationEstimate.estimatedInputTokens}{' '}
                          input tokens, {liveGenerationEstimate.estimatedOutputTokensLow} -{' '}
                          {liveGenerationEstimate.estimatedOutputTokensHigh} output tokens)
                        </p>
                        <div className="inline-actions">
                          <button type="button" onClick={startFullManuscriptGeneration} disabled={!canStartFullGeneration}>
                            {isStartingFullGeneration ? 'Queuing...' : 'Generate Selected Sections (Async)'}
                          </button>
                        </div>
                        {activeGenerationJob && (
                          <div className="job-status">
                            <p>
                              Job: <code>{activeGenerationJob.id}</code>
                            </p>
                            {activeGenerationJob.parent_job_id && (
                              <p>
                                Parent job: <code>{activeGenerationJob.parent_job_id}</code>
                              </p>
                            )}
                            <p>
                              Status: <strong>{humanizeIdentifier(activeGenerationJob.status)}</strong> | Progress:{' '}
                              <strong>{activeGenerationJob.progress_percent}%</strong>
                            </p>
                            <p>
                              Run: <strong>{activeGenerationJob.run_count}</strong>
                            </p>
                            {activeGenerationJob.cancel_requested && (
                              <p className="muted">Cancellation requested. Waiting for job to stop safely.</p>
                            )}
                            {activeGenerationJob.current_section && (
                              <p>
                                Current section: <strong>{humanizeIdentifier(activeGenerationJob.current_section)}</strong>
                              </p>
                            )}
                            <p>
                              Estimated cost ({activeGenerationJob.pricing_model}):{' '}
                              <strong>
                                {formatUsd(activeGenerationJob.estimated_cost_usd_low)} -{' '}
                                {formatUsd(activeGenerationJob.estimated_cost_usd_high)}
                              </strong>
                            </p>
                            {activeGenerationJob.error_detail && <p>{activeGenerationJob.error_detail}</p>}
                            {isGenerationJobInFlight && <p className="muted">Polling job status...</p>}
                            <div className="inline-actions">
                              <button type="button" onClick={cancelActiveGenerationJob} disabled={!canCancelGenerationJob}>
                                {isCancellingGenerationJob ? 'Cancelling...' : 'Cancel Job'}
                              </button>
                              <button type="button" onClick={retryActiveGenerationJob} disabled={!canRetryGenerationJob}>
                                {isRetryingGenerationJob ? 'Retrying...' : 'Retry Job'}
                              </button>
                            </div>
                          </div>
                        )}
                        <div className="job-history-box">
                          <div className="history-header">
                            <h5>Recent Jobs</h5>
                            <div className="history-header-actions">
                              <label>
                                Status
                                <select
                                  value={generationHistoryFilter}
                                  onChange={(event) =>
                                    setGenerationHistoryFilter(event.target.value as GenerationHistoryFilter)
                                  }
                                >
                                  {GENERATION_HISTORY_FILTER_OPTIONS.map((option) => (
                                    <option key={option.value} value={option.value}>
                                      {option.label}
                                    </option>
                                  ))}
                                </select>
                              </label>
                              <button
                                type="button"
                                className="ghost-button"
                                onClick={refreshGenerationHistory}
                                disabled={isLoadingGenerationHistory}
                              >
                                {isLoadingGenerationHistory ? 'Refreshing...' : 'Refresh'}
                              </button>
                            </div>
                          </div>
                          <p className="muted">
                            {generationHistorySummary.totalCount} total jobs, {generationHistorySummary.inFlightCount} in-flight,{' '}
                            {generationHistorySummary.failedCount} failed, estimated high-total{' '}
                            {formatUsd(generationHistorySummary.estimatedHighTotalUsd)}.
                          </p>
                          {isLoadingGenerationHistory && <p className="muted">Loading generation jobs...</p>}
                          {generationHistoryError && <p>{generationHistoryError}</p>}
                          {!generationHistoryError && !isLoadingGenerationHistory && filteredGenerationHistory.length === 0 && (
                            <p className="muted">No generation jobs found for this manuscript.</p>
                          )}
                          {filteredGenerationHistory.length > 0 && (
                            <div className="job-history-list">
                              {filteredGenerationHistory.map((job) => (
                                <div
                                  key={job.id}
                                  className={`job-history-item ${activeGenerationJob?.id === job.id ? 'selected' : ''}`}
                                >
                                  <div className="job-history-meta">
                                    <code>{job.id}</code>
                                    <span className={`job-pill job-pill-${job.status}`}>
                                      {humanizeIdentifier(job.status)}
                                    </span>
                                  </div>
                                  <p className="muted">
                                    {formatUtcDate(job.created_at)} | Run {job.run_count} | {job.sections.length} sections
                                  </p>
                                  <p className="muted">
                                    Estimate: {formatUsd(job.estimated_cost_usd_low)} - {formatUsd(job.estimated_cost_usd_high)}
                                  </p>
                                  <div className="inline-actions">
                                    <button
                                      type="button"
                                      className="ghost-button"
                                      onClick={() => loadGenerationJobIntoForm(job)}
                                    >
                                      Load Settings
                                    </button>
                                  </div>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      </div>
                      {saveSectionError && <p>{saveSectionError}</p>}
                      {saveSectionSuccess && <p>{saveSectionSuccess}</p>}
                      {generateSectionError && <p>{generateSectionError}</p>}
                      {generateSectionSuccess && <p>{generateSectionSuccess}</p>}
                      {fullGenerationError && <p>{fullGenerationError}</p>}
                      {fullGenerationSuccess && <p>{fullGenerationSuccess}</p>}
                      <p className="muted">Available sections: {sectionKeys.join(', ')}</p>
                    </div>
                  )}
                </>
              )}
            </section>
          )}
        </section>
      </section>
      <section className="api-hint">
        <p>API base URL</p>
        <code>{API_BASE_URL}</code>
      </section>
    </main>
  )
}

export default App
