import { useEffect, useMemo, useState } from 'react'
import { Download, Loader2, Play, ShieldCheck, Sparkles } from 'lucide-react'
import { useNavigate } from 'react-router-dom'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Separator } from '@/components/ui/separator'
import {
  autofillCitations,
  bootstrapRunContext,
  cancelGeneration,
  enqueueGeneration,
  estimateGeneration,
  exportQcGatedMarkdown,
  exportReferencePack,
  fetchGenerationJob,
  fetchJournalOptions,
  generateGroundedDraft,
  generateSubmissionPack,
  planSections,
  regenerateParagraph,
  retryGeneration,
  runConsistencyCheck,
  runClaimLinker,
  synthesizeTitleAbstract,
} from '@/lib/study-core-api'
import { manuscriptParagraphs } from '@/mock/manuscript'
import { resultObjects } from '@/mock/results'
import { PageFrame } from '@/pages/page-frame'
import { useAaweStore } from '@/store/use-aawe-store'
import type {
  CitationAutofillPayload,
  ClaimLinkSuggestion,
  ConsistencyCheckPayload,
  GenerationEstimate,
  GenerationJobPayload,
  GroundedDraftEvidenceLinkInput,
  GroundedDraftPayload,
  JournalOption,
  ParagraphConstraint,
  ParagraphRegenerationPayload,
  SectionPlanPayload,
  SubmissionPackPayload,
  TitleAbstractPayload,
} from '@/types/study-core'

type RunContext = { projectId: string; manuscriptId: string }

const CONTEXT_KEY = 'aawe-run-context'
const GROUNDED_DRAFT_PREFS_KEY = 'aawe-grounded-draft-prefs'
const GROUNDED_DRAFT_OUTPUTS_KEY = 'aawe-grounded-draft-outputs'
const SECTIONS = ['introduction', 'methods', 'results', 'discussion']
const PARAGRAPH_CONSTRAINTS: ParagraphConstraint[] = ['shorter', 'more_cautious', 'journal_tone', 'keep_stats_unchanged']

function parseOptionalNumber(value: string): number | null {
  if (!value.trim()) {
    return null
  }
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : null
}

function isActive(job: GenerationJobPayload) {
  return job.status === 'queued' || job.status === 'running' || job.status === 'cancel_requested'
}

function downloadText(filename: string, content: string, type: string) {
  const blob = new Blob([content], { type })
  const url = window.URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  window.URL.revokeObjectURL(url)
}

function loadStoredValue<T>(key: string, fallback: T): T {
  const raw = window.localStorage.getItem(key)
  if (!raw) {
    return fallback
  }
  try {
    return JSON.parse(raw) as T
  } catch {
    return fallback
  }
}

export function StudyCorePage() {
  const navigate = useNavigate()
  const setSelectedItem = useAaweStore((state) => state.setSelectedItem)
  const setRightPanelOpen = useAaweStore((state) => state.setRightPanelOpen)

  const [journals, setJournals] = useState<JournalOption[]>([])
  const [runContext, setRunContext] = useState<RunContext | null>(() => loadStoredValue<RunContext | null>(CONTEXT_KEY, null))
  const [targetJournal, setTargetJournal] = useState('generic-original')
  const [projectTitle, setProjectTitle] = useState('AAWE Manuscript Workspace')
  const [answers, setAnswers] = useState({
    disease_focus: 'Heart failure',
    population: 'Adults admitted with decompensated HF',
    primary_outcome: '90-day all-cause readmission',
    analysis_summary: 'Adjusted Cox model with bootstrap validation',
    key_findings: 'Lower readmission risk in intervention group',
  })
  const [selectedSections, setSelectedSections] = useState<string[]>(SECTIONS)
  const [notesContext, setNotesContext] = useState(
    'disease_focus: Heart failure\npopulation: Adults admitted with decompensated HF\nprimary_outcome: 90-day all-cause readmission',
  )
  const [maxCostUsd, setMaxCostUsd] = useState('0.08')
  const [dailyBudgetUsd, setDailyBudgetUsd] = useState('0.25')
  const [referenceStyle, setReferenceStyle] = useState<'vancouver' | 'ama'>('vancouver')
  const [minConfidence, setMinConfidence] = useState<'high' | 'medium' | 'low'>('medium')
  const [styleProfile, setStyleProfile] = useState<'technical' | 'concise' | 'narrative_review'>(() => {
    const payload = loadStoredValue<{ styleProfile?: 'technical' | 'concise' | 'narrative_review' }>(GROUNDED_DRAFT_PREFS_KEY, {})
    return payload.styleProfile ?? 'technical'
  })
  const [generationMode, setGenerationMode] = useState<'full' | 'targeted'>(() => {
    const payload = loadStoredValue<{ generationMode?: 'full' | 'targeted' }>(GROUNDED_DRAFT_PREFS_KEY, {})
    return payload.generationMode ?? 'full'
  })
  const [draftSection, setDraftSection] = useState<string>(() => {
    const payload = loadStoredValue<{ draftSection?: string }>(GROUNDED_DRAFT_PREFS_KEY, {})
    return payload.draftSection ?? 'introduction'
  })
  const [targetInstruction, setTargetInstruction] = useState(() => {
    const payload = loadStoredValue<{ targetInstruction?: string }>(GROUNDED_DRAFT_PREFS_KEY, {})
    return payload.targetInstruction ?? ''
  })
  const [persistGroundedDrafts, setPersistGroundedDrafts] = useState(() => {
    const payload = loadStoredValue<{ persistGroundedDrafts?: boolean }>(GROUNDED_DRAFT_PREFS_KEY, {})
    return payload.persistGroundedDrafts ?? true
  })
  const [synthesisMaxWords, setSynthesisMaxWords] = useState('220')
  const [synthesizedDraft, setSynthesizedDraft] = useState<TitleAbstractPayload | null>(null)
  const [includePlainLanguageSummary, setIncludePlainLanguageSummary] = useState(true)
  const [submissionPack, setSubmissionPack] = useState<SubmissionPackPayload | null>(null)
  const [consistencyReport, setConsistencyReport] = useState<ConsistencyCheckPayload | null>(null)
  const [includeLowConsistencySeverity, setIncludeLowConsistencySeverity] = useState(false)
  const [paragraphSection, setParagraphSection] = useState('introduction')
  const [paragraphIndex, setParagraphIndex] = useState('0')
  const [paragraphConstraint, setParagraphConstraint] = useState<ParagraphConstraint>('more_cautious')
  const [paragraphInstruction, setParagraphInstruction] = useState('')
  const [paragraphRegenResult, setParagraphRegenResult] = useState<ParagraphRegenerationPayload | null>(null)
  const [autofillRequiredSlots, setAutofillRequiredSlots] = useState('2')
  const [autofillOverwriteExisting, setAutofillOverwriteExisting] = useState(false)
  const [autofillPayload, setAutofillPayload] = useState<CitationAutofillPayload | null>(null)

  const [plan, setPlan] = useState<SectionPlanPayload | null>(null)
  const [estimate, setEstimate] = useState<GenerationEstimate | null>(null)
  const [links, setLinks] = useState<ClaimLinkSuggestion[]>([])
  const [groundedDrafts, setGroundedDrafts] = useState<Record<string, GroundedDraftPayload>>(() =>
    loadStoredValue<Record<string, GroundedDraftPayload>>(GROUNDED_DRAFT_OUTPUTS_KEY, {}),
  )
  const [activeJob, setActiveJob] = useState<GenerationJobPayload | null>(null)
  const [busy, setBusy] = useState<string>('')
  const [status, setStatus] = useState('')
  const [error, setError] = useState('')

  const claimIds = useMemo(
    () =>
      manuscriptParagraphs
        .filter((paragraph) => selectedSections.includes(paragraph.section))
        .map((paragraph) => paragraph.id),
    [selectedSections],
  )

  const claimSectionById = useMemo(() => {
    const pairs = manuscriptParagraphs.map((paragraph) => [paragraph.id, paragraph.section] as const)
    return Object.fromEntries(pairs) as Record<string, string>
  }, [])

  const planItemBySection = useMemo(() => {
    if (!plan) {
      return {} as Record<string, SectionPlanPayload['items'][number]>
    }
    return Object.fromEntries(plan.items.map((item) => [item.section, item])) as Record<string, SectionPlanPayload['items'][number]>
  }, [plan])

  useEffect(() => {
    void fetchJournalOptions()
      .then((payload) => {
        setJournals(payload)
        if (!payload.some((journal) => journal.slug === targetJournal)) {
          setTargetJournal(payload[0]?.slug ?? 'generic-original')
        }
      })
      .catch((e: unknown) => setError(e instanceof Error ? e.message : 'Could not load journals.'))
  }, [targetJournal])

  useEffect(() => {
    if (!runContext) {
      window.localStorage.removeItem(CONTEXT_KEY)
      return
    }
    window.localStorage.setItem(CONTEXT_KEY, JSON.stringify(runContext))
  }, [runContext])

  useEffect(() => {
    window.localStorage.setItem(
      GROUNDED_DRAFT_PREFS_KEY,
      JSON.stringify({
        styleProfile,
        generationMode,
        draftSection,
        targetInstruction,
        persistGroundedDrafts,
      }),
    )
  }, [draftSection, generationMode, persistGroundedDrafts, styleProfile, targetInstruction])

  useEffect(() => {
    window.localStorage.setItem(GROUNDED_DRAFT_OUTPUTS_KEY, JSON.stringify(groundedDrafts))
  }, [groundedDrafts])

  useEffect(() => {
    if (selectedSections.length === 0) {
      return
    }
    if (!selectedSections.includes(draftSection)) {
      setDraftSection(selectedSections[0])
    }
  }, [draftSection, selectedSections])

  useEffect(() => {
    if (selectedSections.length === 0) {
      return
    }
    if (!selectedSections.includes(paragraphSection)) {
      setParagraphSection(selectedSections[0])
    }
  }, [paragraphSection, selectedSections])

  useEffect(() => {
    if (!activeJob || !isActive(activeJob)) return
    const timer = window.setInterval(() => {
      void fetchGenerationJob(activeJob.id)
        .then(setActiveJob)
        .catch((e: unknown) => setError(e instanceof Error ? e.message : 'Could not refresh generation job.'))
    }, 1500)
    return () => window.clearInterval(timer)
  }, [activeJob])

  const onBootstrap = async () => {
    setBusy('bootstrap')
    setError('')
    setStatus('')
    try {
      const payload = await bootstrapRunContext({
        title: projectTitle,
        targetJournal,
        answers: { ...answers, manuscript_goal: 'generate_full_manuscript', data_source: 'manual_entry' },
      })
      setRunContext({ projectId: payload.project.id, manuscriptId: payload.manuscript.id })
      setSelectedSections(payload.inference.recommended_sections)
      setStatus(`Context ready: ${payload.project.id.slice(0, 8)} / ${payload.manuscript.id.slice(0, 8)}`)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not create run context.')
    } finally {
      setBusy('')
    }
  }

  const onPlan = async () => {
    setBusy('plan')
    setError('')
    setStatus('')
    try {
      const payload = await planSections({
        targetJournal,
        answers: { ...answers, manuscript_goal: 'generate_full_manuscript', data_source: 'manual_entry' },
        sections: selectedSections,
      })
      setPlan(payload)
      setStatus(`Planned ${payload.items.length} section(s).`)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not build plan.')
    } finally {
      setBusy('')
    }
  }

  const onEstimate = async () => {
    setBusy('estimate')
    setError('')
    setStatus('')
    try {
      const payload = await estimateGeneration({ sections: selectedSections, notesContext })
      setEstimate(payload)
      setStatus(`Estimated high-side cost $${payload.estimated_cost_usd_high.toFixed(4)}`)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not estimate generation.')
    } finally {
      setBusy('')
    }
  }

  const onRun = async () => {
    if (!runContext) {
      setError('Create run context first.')
      return
    }
    const maxCost = parseOptionalNumber(maxCostUsd)
    const dailyBudget = parseOptionalNumber(dailyBudgetUsd)
    if (maxCostUsd.trim() && maxCost === null) {
      setError('Max estimated cost must be numeric.')
      return
    }
    if (dailyBudgetUsd.trim() && dailyBudget === null) {
      setError('Daily budget must be numeric.')
      return
    }
    setBusy('run')
    setError('')
    setStatus('')
    try {
      const job = await enqueueGeneration({
        projectId: runContext.projectId,
        manuscriptId: runContext.manuscriptId,
        sections: selectedSections,
        notesContext,
        maxEstimatedCostUsd: maxCost,
        projectDailyBudgetUsd: dailyBudget,
      })
      setActiveJob(job)
      setStatus(`Generation queued: ${job.id.slice(0, 8)}`)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not run generation.')
    } finally {
      setBusy('')
    }
  }

  const onCancel = async () => {
    if (!activeJob) return
    setBusy('cancel')
    setError('')
    try {
      const payload = await cancelGeneration(activeJob.id)
      setActiveJob(payload)
      setStatus(`Job ${payload.id.slice(0, 8)} is ${payload.status}.`)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not cancel job.')
    } finally {
      setBusy('')
    }
  }

  const onRetry = async () => {
    if (!activeJob || (activeJob.status !== 'failed' && activeJob.status !== 'cancelled')) return
    setBusy('retry')
    setError('')
    try {
      const payload = await retryGeneration(activeJob.id)
      setActiveJob(payload)
      setStatus(`Retry queued: ${payload.id.slice(0, 8)}`)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not retry job.')
    } finally {
      setBusy('')
    }
  }

  const buildEvidenceLinksForSection = (section: string): GroundedDraftEvidenceLinkInput[] =>
    links
      .filter((suggestion) => claimSectionById[suggestion.claim_id] === section)
      .map((suggestion) => ({
        claim_id: suggestion.claim_id,
        claim_heading: suggestion.claim_heading,
        result_id: suggestion.result_id,
        confidence: suggestion.confidence,
        rationale: suggestion.rationale,
        suggested_anchor_label: suggestion.suggested_anchor_label,
      }))

  const onGenerateGrounded = async () => {
    const sections = generationMode === 'targeted' ? [draftSection] : selectedSections.length > 0 ? selectedSections : [draftSection]
    if (sections.length === 0) {
      setError('Select at least one section.')
      return
    }
    if (generationMode === 'targeted' && !targetInstruction.trim()) {
      setError('Target instruction is required for targeted generation.')
      return
    }
    if (persistGroundedDrafts && !runContext) {
      setError('Create run context first if you want to persist generated drafts.')
      return
    }

    setBusy('grounded')
    setError('')
    setStatus('')
    try {
      const nextDrafts = { ...groundedDrafts }
      let unsupportedTotal = 0
      let persistedCount = 0

      for (const section of sections) {
        const planItem = planItemBySection[section]
        const payload = await generateGroundedDraft({
          section,
          notesContext,
          styleProfile,
          generationMode,
          planObjective: planItem?.objective ?? null,
          mustInclude: planItem?.must_include ?? [],
          evidenceLinks: buildEvidenceLinksForSection(section),
          targetInstruction: generationMode === 'targeted' ? targetInstruction : null,
          lockedText: generationMode === 'targeted' ? groundedDrafts[section]?.draft ?? null : null,
          persistToManuscript: persistGroundedDrafts,
          projectId: runContext?.projectId ?? null,
          manuscriptId: runContext?.manuscriptId ?? null,
        })
        nextDrafts[section] = payload
        unsupportedTotal += payload.unsupported_sentences.length
        if (payload.persisted) {
          persistedCount += 1
        }
      }

      setGroundedDrafts(nextDrafts)
      const savedText = persistGroundedDrafts ? ` Saved ${persistedCount} section(s) to manuscript.` : ''
      setStatus(`Generated grounded draft output for ${sections.length} section(s).${savedText} Unsupported sentences flagged: ${unsupportedTotal}.`)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not generate grounded drafts.')
    } finally {
      setBusy('')
    }
  }

  const onSynthesizeTitleAbstract = async () => {
    if (!runContext) {
      setError('Create run context first.')
      return
    }
    const maxWords = parseOptionalNumber(synthesisMaxWords)
    if (maxWords === null || maxWords <= 0) {
      setError('Max abstract words must be numeric.')
      return
    }

    setBusy('synthesize')
    setError('')
    setStatus('')
    try {
      const payload = await synthesizeTitleAbstract({
        projectId: runContext.projectId,
        manuscriptId: runContext.manuscriptId,
        styleProfile,
        maxAbstractWords: Math.round(maxWords),
        persistToManuscript: true,
      })
      setSynthesizedDraft(payload)
      setGroundedDrafts((current) => ({
        ...current,
        title: {
          section: 'title',
          style_profile: payload.style_profile,
          generation_mode: 'full',
          draft: payload.title,
          passes: [],
          evidence_anchor_labels: [],
          citation_ids: [],
          unsupported_sentences: [],
          persisted: payload.persisted,
          manuscript: payload.manuscript,
        },
        abstract: {
          section: 'abstract',
          style_profile: payload.style_profile,
          generation_mode: 'full',
          draft: payload.abstract,
          passes: [],
          evidence_anchor_labels: [],
          citation_ids: [],
          unsupported_sentences: [],
          persisted: payload.persisted,
          manuscript: payload.manuscript,
        },
      }))
      setStatus(`Synthesized title + abstract (${payload.style_profile}).`)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not synthesize title and abstract.')
    } finally {
      setBusy('')
    }
  }

  const onGenerateSubmissionPack = async () => {
    if (!runContext) {
      setError('Create run context first.')
      return
    }
    setBusy('submission-pack')
    setError('')
    setStatus('')
    try {
      const payload = await generateSubmissionPack({
        projectId: runContext.projectId,
        manuscriptId: runContext.manuscriptId,
        styleProfile,
        includePlainLanguageSummary,
      })
      setSubmissionPack(payload)
      setStatus(`Submission pack generated (${payload.style_profile}).`)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not generate submission pack.')
    } finally {
      setBusy('')
    }
  }

  const onDownloadSubmissionPack = () => {
    if (!submissionPack) {
      return
    }
    const lines: string[] = []
    lines.push('# Submission Pack')
    lines.push('')
    lines.push(`- Run: ${submissionPack.run_id}`)
    lines.push(`- Target journal: ${submissionPack.target_journal}`)
    lines.push(`- Style profile: ${submissionPack.style_profile}`)
    lines.push('')
    lines.push('## Cover Letter')
    lines.push('')
    lines.push(submissionPack.cover_letter)
    lines.push('')
    lines.push('## Key Points')
    lines.push('')
    submissionPack.key_points.forEach((point, index) => lines.push(`${index + 1}. ${point}`))
    lines.push('')
    lines.push('## Highlights')
    lines.push('')
    submissionPack.highlights.forEach((point, index) => lines.push(`${index + 1}. ${point}`))
    lines.push('')
    if (submissionPack.plain_language_summary.trim()) {
      lines.push('## Plain-Language Summary')
      lines.push('')
      lines.push(submissionPack.plain_language_summary)
      lines.push('')
    }
    const filename = `submission-pack-${submissionPack.run_id}.md`
    downloadText(filename, lines.join('\n'), 'text/markdown;charset=utf-8')
  }

  const onRunConsistency = async () => {
    if (!runContext) {
      setError('Create run context first.')
      return
    }
    setBusy('consistency')
    setError('')
    setStatus('')
    try {
      const payload = await runConsistencyCheck({
        projectId: runContext.projectId,
        manuscriptId: runContext.manuscriptId,
        includeLowSeverity: includeLowConsistencySeverity,
      })
      setConsistencyReport(payload)
      setStatus(`Consistency check found ${payload.total_issues} issue(s).`)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not run consistency check.')
    } finally {
      setBusy('')
    }
  }

  const onRegenerateParagraph = async () => {
    if (!runContext) {
      setError('Create run context first.')
      return
    }
    const indexValue = parseOptionalNumber(paragraphIndex)
    if (indexValue === null || indexValue < 0) {
      setError('Paragraph index must be numeric and >= 0.')
      return
    }

    setBusy('paragraph')
    setError('')
    setStatus('')
    try {
      const payload = await regenerateParagraph({
        projectId: runContext.projectId,
        manuscriptId: runContext.manuscriptId,
        section: paragraphSection,
        paragraphIndex: Math.floor(indexValue),
        notesContext,
        constraints: [paragraphConstraint],
        freeformInstruction: paragraphInstruction.trim() ? paragraphInstruction : null,
        evidenceLinks: buildEvidenceLinksForSection(paragraphSection),
        citationIds: groundedDrafts[paragraphSection]?.citation_ids ?? [],
        persistToManuscript: true,
      })
      setParagraphRegenResult(payload)
      setGroundedDrafts((current) => ({
        ...current,
        [paragraphSection]: {
          section: paragraphSection,
          style_profile: styleProfile,
          generation_mode: 'targeted',
          draft: payload.updated_section_text,
          passes: [],
          evidence_anchor_labels: current[paragraphSection]?.evidence_anchor_labels ?? [],
          citation_ids: current[paragraphSection]?.citation_ids ?? [],
          unsupported_sentences: payload.unsupported_sentences,
          persisted: payload.persisted,
          manuscript: payload.manuscript,
        },
      }))
      setStatus(`Regenerated paragraph ${payload.paragraph_index} in ${payload.section}.`)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not regenerate paragraph.')
    } finally {
      setBusy('')
    }
  }

  const onAutofillCitations = async () => {
    const slots = parseOptionalNumber(autofillRequiredSlots)
    if (slots === null || slots <= 0) {
      setError('Required slots must be numeric and > 0.')
      return
    }

    setBusy('autofill')
    setError('')
    setStatus('')
    try {
      const payload = await autofillCitations({
        claimIds: claimIds.length > 0 ? claimIds : null,
        requiredSlots: Math.floor(slots),
        overwriteExisting: autofillOverwriteExisting,
      })
      setAutofillPayload(payload)
      setStatus(`Autofilled citations for ${payload.updated_claims.length} claim(s).`)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not autofill citations.')
    } finally {
      setBusy('')
    }
  }

  const onLink = async () => {
    setBusy('link')
    setError('')
    try {
      const payload = await runClaimLinker({
        claimIds: claimIds.length > 0 ? claimIds : manuscriptParagraphs.map((paragraph) => paragraph.id),
        minConfidence,
      })
      setLinks(payload.suggestions)
      setStatus(`Linker returned ${payload.suggestions.length} suggestion(s).`)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not run linker.')
    } finally {
      setBusy('')
    }
  }

  const onInspectLink = (suggestion: ClaimLinkSuggestion) => {
    const claim = manuscriptParagraphs.find((paragraph) => paragraph.id === suggestion.claim_id)
    if (claim) {
      setSelectedItem({ type: 'claim', data: claim })
      setRightPanelOpen(true)
      navigate(`/manuscript/${claim.section}`)
      return
    }
    const result = resultObjects.find((item) => item.id === suggestion.result_id)
    if (result) {
      setSelectedItem({ type: 'result', data: result })
      setRightPanelOpen(true)
      navigate('/results')
    }
  }

  const onExportMarkdown = async () => {
    if (!runContext) {
      setError('Create run context first.')
      return
    }
    setBusy('markdown')
    setError('')
    try {
      const payload = await exportQcGatedMarkdown(runContext.projectId, runContext.manuscriptId)
      downloadText(payload.filename, payload.content, 'text/markdown;charset=utf-8')
      setStatus(`Exported ${payload.filename}`)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not export markdown.')
    } finally {
      setBusy('')
    }
  }

  const onExportReferences = async () => {
    setBusy('refs')
    setError('')
    try {
      const payload = await exportReferencePack({ style: referenceStyle, claimIds: claimIds.length > 0 ? claimIds : manuscriptParagraphs.map((p) => p.id) })
      downloadText(payload.filename, payload.content, 'text/plain;charset=utf-8')
      setStatus(`Reference pack exported (${referenceStyle.toUpperCase()}).`)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not export reference pack.')
    } finally {
      setBusy('')
    }
  }

  return (
    <PageFrame title="Study Core - Generation Run Center" description="Planning, generation, linker suggestions, QC-gated export, and reference pack builder.">
      <div className="grid gap-4">
        <Card>
          <CardHeader><CardTitle className="text-base">Context + Planning</CardTitle><CardDescription>Bootstrap a project/manuscript context and generate section plans with estimated costs.</CardDescription></CardHeader>
          <CardContent className="space-y-3">
            <div className="grid gap-3 md:grid-cols-3">
              <Input value={projectTitle} onChange={(event) => setProjectTitle(event.target.value)} />
              <select className="h-9 rounded-md border border-border bg-background px-3 text-sm" value={targetJournal} onChange={(event) => setTargetJournal(event.target.value)}>{journals.map((journal) => <option key={journal.slug} value={journal.slug}>{journal.display_name}</option>)}</select>
              <Button onClick={onBootstrap} disabled={busy === 'bootstrap'}>{busy === 'bootstrap' ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <Sparkles className="mr-1 h-4 w-4" />}Create Run Context</Button>
            </div>
            <div className="grid gap-3 md:grid-cols-2">
              <Input value={answers.disease_focus} onChange={(event) => setAnswers((current) => ({ ...current, disease_focus: event.target.value }))} />
              <Input value={answers.population} onChange={(event) => setAnswers((current) => ({ ...current, population: event.target.value }))} />
              <Input value={answers.primary_outcome} onChange={(event) => setAnswers((current) => ({ ...current, primary_outcome: event.target.value }))} />
              <Input value={answers.analysis_summary} onChange={(event) => setAnswers((current) => ({ ...current, analysis_summary: event.target.value }))} />
            </div>
            <div className="flex flex-wrap items-center gap-2">{SECTIONS.map((section) => <Button key={section} size="sm" variant={selectedSections.includes(section) ? 'default' : 'outline'} onClick={() => setSelectedSections((current) => current.includes(section) ? current.filter((item) => item !== section) : [...current, section])}>{section}</Button>)}</div>
            <div className="flex flex-wrap items-center gap-2">
              <Button variant="outline" onClick={onPlan} disabled={busy === 'plan'}>{busy === 'plan' ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : null}Build Plan</Button>
              {plan ? <Badge variant="secondary">${plan.total_estimated_cost_usd_low.toFixed(4)}-${plan.total_estimated_cost_usd_high.toFixed(4)}</Badge> : null}
              {runContext ? <Badge variant="outline">{runContext.projectId.slice(0, 8)} / {runContext.manuscriptId.slice(0, 8)}</Badge> : null}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="text-base">Generation Run Center</CardTitle><CardDescription>Estimate, run, monitor, cancel, and retry generation jobs.</CardDescription></CardHeader>
          <CardContent className="space-y-3">
            <textarea className="min-h-24 w-full rounded-md border border-border bg-background px-3 py-2 text-sm" value={notesContext} onChange={(event) => setNotesContext(event.target.value)} />
            <div className="grid gap-3 md:grid-cols-3">
              <Input value={maxCostUsd} onChange={(event) => setMaxCostUsd(event.target.value)} />
              <Input value={dailyBudgetUsd} onChange={(event) => setDailyBudgetUsd(event.target.value)} />
              <div className="flex gap-2">
                <Button variant="outline" onClick={onEstimate} disabled={busy === 'estimate'}>{busy === 'estimate' ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : null}Estimate</Button>
                <Button onClick={onRun} disabled={busy === 'run' || !runContext}>{busy === 'run' ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <Play className="mr-1 h-4 w-4" />}Run</Button>
              </div>
            </div>
            {estimate ? <p className="text-xs text-muted-foreground">Estimated cost: ${estimate.estimated_cost_usd_low.toFixed(4)}-${estimate.estimated_cost_usd_high.toFixed(4)}.</p> : null}
            {activeJob ? <><Separator /><div className="flex flex-wrap items-center justify-between gap-2 text-xs"><span>{activeJob.id.slice(0, 8)} | {activeJob.status} | {activeJob.progress_percent}% | {activeJob.current_section ?? 'n/a'}</span><div className="flex gap-2"><Button size="sm" variant="outline" onClick={onCancel} disabled={!isActive(activeJob) || busy === 'cancel'}>Cancel</Button><Button size="sm" variant="outline" onClick={onRetry} disabled={(activeJob.status !== 'failed' && activeJob.status !== 'cancelled') || busy === 'retry'}>Retry</Button></div></div></> : null}
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="text-base">Grounded Draft Generator</CardTitle><CardDescription>Generate section text from plan + evidence links with style control and targeted regeneration.</CardDescription></CardHeader>
          <CardContent className="space-y-3">
            <div className="grid gap-3 md:grid-cols-4">
              <select className="h-9 rounded-md border border-border bg-background px-3 text-sm" value={draftSection} onChange={(event) => setDraftSection(event.target.value)}>
                {(selectedSections.length > 0 ? selectedSections : SECTIONS).map((section) => <option key={section} value={section}>{section}</option>)}
              </select>
              <select className="h-9 rounded-md border border-border bg-background px-3 text-sm" value={styleProfile} onChange={(event) => setStyleProfile(event.target.value as 'technical' | 'concise' | 'narrative_review')}>
                <option value="technical">technical</option>
                <option value="concise">concise</option>
                <option value="narrative_review">narrative review</option>
              </select>
              <select className="h-9 rounded-md border border-border bg-background px-3 text-sm" value={generationMode} onChange={(event) => setGenerationMode(event.target.value as 'full' | 'targeted')}>
                <option value="full">full run</option>
                <option value="targeted">targeted regen</option>
              </select>
              <label className="flex items-center gap-2 rounded-md border border-border px-3 text-sm">
                <input
                  type="checkbox"
                  checked={persistGroundedDrafts}
                  onChange={(event) => setPersistGroundedDrafts(event.target.checked)}
                />
                persist to manuscript
              </label>
            </div>

            {generationMode === 'targeted' ? (
              <Input
                value={targetInstruction}
                onChange={(event) => setTargetInstruction(event.target.value)}
                placeholder="Targeted instruction: e.g. tighten limitations language in paragraph 2"
              />
            ) : null}

            <div className="flex flex-wrap items-center gap-2">
              <Button variant="outline" onClick={onGenerateGrounded} disabled={busy === 'grounded'}>
                {busy === 'grounded' ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <Sparkles className="mr-1 h-4 w-4" />}
                Generate Grounded Draft
              </Button>
              <Badge variant="secondary">
                {generationMode === 'targeted' ? 'Single section pass' : `${selectedSections.length} sections selected`}
              </Badge>
              <Badge variant="outline">evidence links: {links.length}</Badge>
            </div>

            <div className="space-y-2">
              {(selectedSections.length > 0 ? selectedSections : SECTIONS)
                .filter((section) => Boolean(groundedDrafts[section]))
                .map((section) => (
                  <div key={section} className="space-y-1 rounded-md border border-border p-2">
                    <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                      <span>{section}</span>
                      <span>
                        {groundedDrafts[section].style_profile} | {groundedDrafts[section].generation_mode} | unsupported {groundedDrafts[section].unsupported_sentences.length}
                      </span>
                    </div>
                    <textarea
                      className="min-h-28 w-full rounded-md border border-border bg-background px-3 py-2 text-xs"
                      value={groundedDrafts[section].draft}
                      onChange={(event) =>
                        setGroundedDrafts((current) => ({
                          ...current,
                          [section]: {
                            ...current[section],
                            draft: event.target.value,
                          },
                        }))
                      }
                    />
                  </div>
                ))}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="text-base">Synthesis + Consistency + Paragraph Controls</CardTitle><CardDescription>Generate title/abstract and submission pack, run cross-section consistency checks, and regenerate individual paragraphs.</CardDescription></CardHeader>
          <CardContent className="space-y-3">
            <div className="grid gap-3 md:grid-cols-4">
              <Input value={synthesisMaxWords} onChange={(event) => setSynthesisMaxWords(event.target.value)} />
              <Button variant="outline" onClick={onSynthesizeTitleAbstract} disabled={busy === 'synthesize' || !runContext}>
                {busy === 'synthesize' ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <Sparkles className="mr-1 h-4 w-4" />}
                Synthesize Title + Abstract
              </Button>
              <Button variant="outline" onClick={onGenerateSubmissionPack} disabled={busy === 'submission-pack' || !runContext}>
                {busy === 'submission-pack' ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <Download className="mr-1 h-4 w-4" />}
                Generate Submission Pack
              </Button>
              <label className="flex items-center gap-2 rounded-md border border-border px-3 text-sm">
                <input type="checkbox" checked={includeLowConsistencySeverity} onChange={(event) => setIncludeLowConsistencySeverity(event.target.checked)} />
                include low severity
              </label>
            </div>
            <label className="flex items-center gap-2 rounded-md border border-border px-3 py-2 text-sm">
              <input
                type="checkbox"
                checked={includePlainLanguageSummary}
                onChange={(event) => setIncludePlainLanguageSummary(event.target.checked)}
              />
              include plain-language summary in submission pack
            </label>
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" onClick={onRunConsistency} disabled={busy === 'consistency' || !runContext}>
                {busy === 'consistency' ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : null}
                Run Consistency Check
              </Button>
              {consistencyReport ? (
                <Badge variant="secondary">
                  issues {consistencyReport.total_issues} | high {consistencyReport.high_severity_count}
                </Badge>
              ) : null}
            </div>
            {synthesizedDraft ? (
              <div className="space-y-1 rounded-md border border-border p-2 text-xs">
                <p className="font-medium">Title</p>
                <p>{synthesizedDraft.title}</p>
                <p className="font-medium">Abstract</p>
                <p>{synthesizedDraft.abstract}</p>
              </div>
            ) : null}
            {submissionPack ? (
              <div className="space-y-1 rounded-md border border-border p-2 text-xs">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="font-medium">Submission Pack</p>
                  <Button size="sm" variant="outline" onClick={onDownloadSubmissionPack}>Download</Button>
                </div>
                <p className="font-medium">Cover Letter</p>
                <p>{submissionPack.cover_letter}</p>
                <p className="font-medium">Key Points</p>
                {submissionPack.key_points.map((point, index) => <p key={`kp-${index}`}>{index + 1}. {point}</p>)}
                <p className="font-medium">Highlights</p>
                {submissionPack.highlights.map((point, index) => <p key={`hl-${index}`}>{index + 1}. {point}</p>)}
                {submissionPack.plain_language_summary ? (
                  <>
                    <p className="font-medium">Plain-Language Summary</p>
                    <p>{submissionPack.plain_language_summary}</p>
                  </>
                ) : null}
              </div>
            ) : null}
            {consistencyReport ? (
              <div className="space-y-1">
                {consistencyReport.issues.map((issue) => (
                  <div key={issue.id} className="rounded-md border border-border px-2 py-1 text-xs">
                    [{issue.severity}] {issue.summary}
                  </div>
                ))}
              </div>
            ) : null}

            <Separator />
            <div className="grid gap-3 md:grid-cols-4">
              <select className="h-9 rounded-md border border-border bg-background px-3 text-sm" value={paragraphSection} onChange={(event) => setParagraphSection(event.target.value)}>
                {(selectedSections.length > 0 ? selectedSections : SECTIONS).map((section) => <option key={section} value={section}>{section}</option>)}
              </select>
              <Input value={paragraphIndex} onChange={(event) => setParagraphIndex(event.target.value)} />
              <select className="h-9 rounded-md border border-border bg-background px-3 text-sm" value={paragraphConstraint} onChange={(event) => setParagraphConstraint(event.target.value as ParagraphConstraint)}>
                {PARAGRAPH_CONSTRAINTS.map((constraint) => <option key={constraint} value={constraint}>{constraint}</option>)}
              </select>
              <Button variant="outline" onClick={onRegenerateParagraph} disabled={busy === 'paragraph' || !runContext}>
                {busy === 'paragraph' ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : null}
                Regenerate Paragraph
              </Button>
            </div>
            <Input value={paragraphInstruction} onChange={(event) => setParagraphInstruction(event.target.value)} placeholder="Optional instruction: keep phrasing neutral and avoid overclaiming." />
            {paragraphRegenResult ? (
              <div className="space-y-1 rounded-md border border-border p-2 text-xs">
                <p className="font-medium">Original</p>
                <p>{paragraphRegenResult.original_paragraph}</p>
                <p className="font-medium">Regenerated</p>
                <p>{paragraphRegenResult.regenerated_paragraph}</p>
              </div>
            ) : null}
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="text-base">Evidence-to-Claim Linker</CardTitle><CardDescription>Suggest claim-result links and inspect directly in workspace.</CardDescription></CardHeader>
          <CardContent className="space-y-3">
            <div className="flex flex-wrap items-center gap-2">
              <select className="h-9 rounded-md border border-border bg-background px-3 text-sm" value={minConfidence} onChange={(event) => setMinConfidence(event.target.value as 'high' | 'medium' | 'low')}><option value="high">high</option><option value="medium">medium+</option><option value="low">all</option></select>
              <Button variant="outline" onClick={onLink} disabled={busy === 'link'}>{busy === 'link' ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : null}Run Linker</Button>
            </div>
            <div className="space-y-2">
              {links.map((suggestion) => (
                <div
                  key={`${suggestion.claim_id}-${suggestion.result_id}`}
                  className="flex items-center justify-between rounded-md border border-border px-2 py-1 text-xs"
                >
                  <span>
                    {suggestion.claim_heading}
                    {' -> '}
                    {suggestion.result_id} ({suggestion.confidence})
                  </span>
                  <Button size="sm" variant="outline" onClick={() => onInspectLink(suggestion)}>
                    Inspect
                  </Button>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="text-base">Citations + Export</CardTitle><CardDescription>Autofill citation slots, then export reference packs and QC-gated manuscript markdown.</CardDescription></CardHeader>
          <CardContent className="space-y-3">
            <div className="grid gap-3 md:grid-cols-4">
              <Input value={autofillRequiredSlots} onChange={(event) => setAutofillRequiredSlots(event.target.value)} />
              <label className="flex items-center gap-2 rounded-md border border-border px-3 text-sm">
                <input type="checkbox" checked={autofillOverwriteExisting} onChange={(event) => setAutofillOverwriteExisting(event.target.checked)} />
                overwrite existing
              </label>
              <Button variant="outline" onClick={onAutofillCitations} disabled={busy === 'autofill'}>
                {busy === 'autofill' ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : null}
                Autofill Citation Slots
              </Button>
              {autofillPayload ? <Badge variant="secondary">{autofillPayload.updated_claims.length} claims updated</Badge> : <span />}
            </div>
            {autofillPayload ? (
              <div className="space-y-1">
                {autofillPayload.updated_claims.map((claim) => (
                  <div key={claim.claim_id} className="rounded-md border border-border px-2 py-1 text-xs">
                    {claim.claim_id}: {claim.attached_citation_ids.join(', ')} (missing {claim.missing_slots})
                  </div>
                ))}
              </div>
            ) : null}
            <Separator />
            <div className="flex flex-wrap items-center gap-2">
              <Button variant="outline" onClick={onExportMarkdown} disabled={busy === 'markdown' || !runContext}>{busy === 'markdown' ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <ShieldCheck className="mr-1 h-4 w-4" />}Export Manuscript (QC-gated)</Button>
              <select className="h-9 rounded-md border border-border bg-background px-3 text-sm" value={referenceStyle} onChange={(event) => setReferenceStyle(event.target.value as 'vancouver' | 'ama')}><option value="vancouver">Vancouver</option><option value="ama">AMA</option></select>
              <Button variant="outline" onClick={onExportReferences} disabled={busy === 'refs'}>{busy === 'refs' ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <Download className="mr-1 h-4 w-4" />}Export Reference Pack</Button>
            </div>
          </CardContent>
        </Card>

        {status ? <p className="text-sm text-emerald-600">{status}</p> : null}
        {error ? <p className="text-sm text-destructive">{error}</p> : null}
      </div>
    </PageFrame>
  )
}
