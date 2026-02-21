import { Loader2 } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'

import { Button } from '@/components/ui/button'
import { estimateGeneration, planSections } from '@/lib/study-core-api'
import type {
  GenerationEstimate,
  OutlinePlanSection,
  OutlinePlanState,
  SectionPlanItem,
  SectionPlanPayload,
} from '@/types/study-core'

const CORE_SECTIONS = ['introduction', 'methods', 'results', 'discussion']

type RefinementMode = 'regenerate' | 'tighten' | 'specificity' | 'mechanistic'

type StepPlanProps = {
  targetJournal: string
  answers: Record<string, string>
  planningContext: {
    targetJournal: string
    researchCategory: string
    studyType: string
    interpretationMode: string
    articleType: string
    wordLength: string
    summary: string
  }
  selectedSections: string[]
  generationBrief: string
  plan: OutlinePlanState | null
  estimatePreview: GenerationEstimate | null
  mechanisticRelevant: boolean
  onSectionsChange: (sections: string[]) => void
  onPlanChange: (plan: OutlinePlanState | null) => void
  onEstimateChange: (estimate: GenerationEstimate | null) => void
  onStatus: (message: string) => void
  onError: (message: string) => void
}

const REFINEMENT_CONFIG: Record<
  RefinementMode,
  {
    label: string
    overwrite: boolean
    instruction: string
  }
> = {
  regenerate: {
    label: 'Regenerate section',
    overwrite: true,
    instruction: 'Regenerate this section outline from scratch for a retrospective observational manuscript.',
  },
  tighten: {
    label: 'Tighten language',
    overwrite: true,
    instruction: 'Rewrite bullets to be shorter, precise, and non-redundant.',
  },
  specificity: {
    label: 'Increase specificity',
    overwrite: false,
    instruction: 'Add concrete analytical details, variable definitions, and reporting expectations.',
  },
  mechanistic: {
    label: 'Add mechanistic framing',
    overwrite: false,
    instruction: 'Add mechanistic hypotheses and ensure they are clearly labeled as hypotheses.',
  },
}

function toggleSection(section: string, current: string[]): string[] {
  if (current.includes(section)) {
    return current.filter((item) => item !== section)
  }
  return [...current, section]
}

function titleCaseSection(section: string): string {
  return section
    .split('_')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ')
}

function dedupeBullets(bullets: string[]): string[] {
  const seen = new Set<string>()
  const deduped: string[] = []
  for (const bullet of bullets) {
    const trimmed = bullet.trim()
    if (!trimmed) {
      continue
    }
    const key = trimmed.toLowerCase()
    if (seen.has(key)) {
      continue
    }
    seen.add(key)
    deduped.push(trimmed)
  }
  return deduped
}

function bulletsFromPlanItem(item?: SectionPlanItem): string[] {
  if (!item) {
    return []
  }
  return dedupeBullets([item.objective, ...item.must_include])
}

function toOutlinePlan(payload: SectionPlanPayload, sections: string[]): OutlinePlanState {
  const itemBySection = new Map(payload.items.map((item) => [item.section.toLowerCase(), item]))
  return {
    sections: sections.map((section) => {
      const item = itemBySection.get(section.toLowerCase())
      return {
        name: section,
        bullets: bulletsFromPlanItem(item),
        tags: item?.qc_focus?.slice(0, 3),
      }
    }),
  }
}

function hasSectionOrderChanged(current: OutlinePlanState, selectedSections: string[]): boolean {
  if (current.sections.length !== selectedSections.length) {
    return true
  }
  return selectedSections.some((section, index) => current.sections[index]?.name !== section)
}

function mergeBullets(existing: string[], additions: string[]): string[] {
  return dedupeBullets([...existing, ...additions])
}

function sectionContextBullets(
  section: string,
  context: StepPlanProps['planningContext'],
): string[] {
  const isReview =
    context.articleType.toLowerCase().includes('review') ||
    context.studyType.toLowerCase().includes('synthesis') ||
    context.summary.toLowerCase().includes('literature review')

  if (section === 'introduction') {
    return dedupeBullets([
      context.summary ? `State the research focus directly: ${context.summary}` : '',
      context.researchCategory ? `Frame the manuscript as: ${context.researchCategory}.` : '',
      context.interpretationMode ? `Set interpretation scope as: ${context.interpretationMode}.` : '',
    ])
  }
  if (section === 'methods') {
    if (isReview) {
      return dedupeBullets([
        'Define literature identification approach, sources, and date range.',
        'Define inclusion and exclusion criteria for evidence selection.',
        'Specify evidence extraction and synthesis method.',
      ])
    }
    return dedupeBullets([
      context.studyType ? `Specify study design as: ${context.studyType}.` : 'Specify study design and study period.',
      'Define inclusion and exclusion criteria.',
      'Define primary and secondary endpoints.',
      'Specify modelling strategy, covariate adjustment, and missing-data handling.',
    ])
  }
  if (section === 'results') {
    if (isReview) {
      return dedupeBullets([
        'Summarise included evidence characteristics and thematic findings.',
        'Report consistency, heterogeneity, and uncertainty in the evidence base.',
      ])
    }
    return dedupeBullets([
      'Report primary estimate for the main endpoint.',
      'Report uncertainty for each primary estimate (for example 95% CI).',
      'Report sensitivity analysis findings.',
    ])
  }
  if (section === 'discussion') {
    return dedupeBullets([
      'Interpret findings within the defined non-causal scope.',
      'State key limitations and alternative explanations.',
      'Define implications for practice and next-step validation work.',
    ])
  }
  return []
}

function buildContextScaffold(
  sections: string[],
  context: StepPlanProps['planningContext'],
): OutlinePlanState {
  return {
    sections: sections.map((section) => ({
      name: section,
      bullets: sectionContextBullets(section, context),
    })),
  }
}

export function StepPlan({
  targetJournal,
  answers,
  planningContext,
  selectedSections,
  generationBrief,
  plan,
  estimatePreview,
  mechanisticRelevant,
  onSectionsChange,
  onPlanChange,
  onEstimateChange,
  onStatus,
  onError,
}: StepPlanProps) {
  const [attemptedSubmit, setAttemptedSubmit] = useState(false)
  const [busy, setBusy] = useState<'plan' | 'estimate' | ''>('')
  const [refineBusyKey, setRefineBusyKey] = useState('')

  const hasSelectionError = attemptedSubmit && selectedSections.length === 0
  const orderedSections = useMemo(() => (selectedSections.length > 0 ? selectedSections : CORE_SECTIONS), [selectedSections])

  useEffect(() => {
    if (!plan) {
      return
    }
    if (!hasSectionOrderChanged(plan, selectedSections)) {
      return
    }
    const existingByName = new Map(plan.sections.map((section) => [section.name, section]))
    onPlanChange({
      sections: selectedSections.map((section) => existingByName.get(section) ?? { name: section, bullets: [] }),
    })
  }, [onPlanChange, plan, selectedSections])

  const updateSection = (sectionName: string, updater: (section: OutlinePlanSection) => OutlinePlanSection) => {
    if (!plan) {
      return
    }
    onPlanChange({
      sections: plan.sections.map((section) => (section.name === sectionName ? updater(section) : section)),
    })
  }

  const onGeneratePlan = async () => {
    setAttemptedSubmit(true)
    if (selectedSections.length === 0) {
      return
    }
    setBusy('plan')
    onError('')
    try {
      const payload = await planSections({
        targetJournal: targetJournal.trim() || 'generic-original',
        answers,
        sections: selectedSections,
      })
      onPlanChange(toOutlinePlan(payload, orderedSections))
      onStatus(`Generated plan for ${payload.items.length} section(s).`)
    } catch (error) {
      onError(error instanceof Error ? error.message : 'Could not generate plan.')
    } finally {
      setBusy('')
    }
  }

  const onEstimatePreview = async () => {
    if (selectedSections.length === 0) {
      return
    }
    setBusy('estimate')
    onError('')
    try {
      const payload = await estimateGeneration({
        sections: selectedSections,
        notesContext: generationBrief,
      })
      onEstimateChange(payload)
      onStatus(`Estimate preview ready (high-side $${payload.estimated_cost_usd_high.toFixed(4)}).`)
    } catch (error) {
      onError(error instanceof Error ? error.message : 'Could not estimate generation.')
    } finally {
      setBusy('')
    }
  }

  const onRefineSection = async (sectionName: string, mode: RefinementMode) => {
    if (!plan) {
      return
    }
    const section = plan.sections.find((item) => item.name === sectionName)
    if (!section) {
      return
    }
    if (mode === 'mechanistic' && !mechanisticRelevant) {
      return
    }
    setRefineBusyKey(`${sectionName}:${mode}`)
    onError('')
    try {
      const config = REFINEMENT_CONFIG[mode]
      const payload = await planSections({
        targetJournal: targetJournal.trim() || 'generic-original',
        answers: {
          ...answers,
          outline_refinement_mode: mode,
          outline_refinement_instruction: config.instruction,
          outline_current_bullets: section.bullets.join('\n'),
        },
        sections: [sectionName],
      })
      const nextSectionItem = payload.items.find((item) => item.section.toLowerCase() === sectionName.toLowerCase())
      const aiBullets = bulletsFromPlanItem(nextSectionItem)
      const nextBullets = config.overwrite ? aiBullets : mergeBullets(section.bullets, aiBullets)
      updateSection(sectionName, (current) => ({ ...current, bullets: nextBullets }))
      onStatus(`${titleCaseSection(sectionName)} plan updated.`)
    } catch (error) {
      onError(error instanceof Error ? error.message : `Could not update ${titleCaseSection(sectionName)}.`)
    } finally {
      setRefineBusyKey('')
    }
  }

  const onBuildContextScaffold = () => {
    if (selectedSections.length === 0) {
      setAttemptedSubmit(true)
      return
    }
    onPlanChange(buildContextScaffold(selectedSections, planningContext))
    onStatus('Context scaffold created from Step 1 framing. Refine or regenerate sections as needed.')
  }

  return (
    <div className="space-y-4 rounded-lg border border-border bg-card p-4">
      <div className="space-y-1">
        <h2 className="text-base font-semibold">Step 2: Plan Sections</h2>
        <p className="text-sm text-muted-foreground">Select sections, generate the outline, and edit inline.</p>
      </div>

      <div className="rounded-md border border-border/80 bg-muted/20 p-3 text-xs text-muted-foreground">
        <p>
          Context in use: {planningContext.targetJournal || 'No journal selected'} |{' '}
          {planningContext.researchCategory || 'No research category'} | {planningContext.studyType || 'No study type'}
        </p>
        <p>
          Article type: {planningContext.articleType || 'Not set'} | Target length: {planningContext.wordLength || 'Not set'}
        </p>
      </div>

      <div className="space-y-2">
        <p className="text-xs font-medium text-muted-foreground">Sections</p>
        <div className="flex flex-wrap gap-2">
          {CORE_SECTIONS.map((section) => (
            <Button
              key={section}
              size="sm"
              variant="outline"
              className={
                selectedSections.includes(section)
                  ? 'border-border bg-muted text-foreground hover:bg-muted/80'
                  : 'text-muted-foreground hover:text-foreground'
              }
              onClick={() => onSectionsChange(toggleSection(section, selectedSections))}
            >
              {titleCaseSection(section)}
            </Button>
          ))}
        </div>
      </div>

      {hasSelectionError ? <p className="text-xs text-destructive">Select at least one section before generating the plan.</p> : null}

      <div className="flex flex-wrap gap-2">
        <Button variant="outline" onClick={onBuildContextScaffold} disabled={busy !== ''}>
          Build contextual scaffold
        </Button>
        <Button onClick={onGeneratePlan} disabled={busy === 'plan'}>
          {busy === 'plan' ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : null}
          Generate Plan
        </Button>
      </div>

      {plan ? (
        <div className="space-y-3 rounded-md border border-border p-3">
          {plan.sections.map((section) => {
            const sectionBusy = refineBusyKey.startsWith(`${section.name}:`)
            return (
              <div key={section.name} className="space-y-2 rounded-md border border-border/80 p-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="text-sm font-semibold">{titleCaseSection(section.name)}</p>
                  <div className="flex flex-wrap gap-1">
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={sectionBusy}
                      onClick={() => void onRefineSection(section.name, 'regenerate')}
                    >
                      {refineBusyKey === `${section.name}:regenerate` ? <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" /> : null}
                      Regenerate section
                    </Button>
                    <Button size="sm" variant="outline" disabled={sectionBusy} onClick={() => void onRefineSection(section.name, 'tighten')}>
                      {refineBusyKey === `${section.name}:tighten` ? <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" /> : null}
                      Tighten language
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={sectionBusy}
                      onClick={() => void onRefineSection(section.name, 'specificity')}
                    >
                      {refineBusyKey === `${section.name}:specificity` ? <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" /> : null}
                      Increase specificity
                    </Button>
                    {mechanisticRelevant ? (
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={sectionBusy}
                        onClick={() => void onRefineSection(section.name, 'mechanistic')}
                      >
                        {refineBusyKey === `${section.name}:mechanistic` ? <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" /> : null}
                        Add mechanistic framing
                      </Button>
                    ) : null}
                  </div>
                </div>

                <div className="space-y-2">
                  {section.bullets.length === 0 ? <p className="text-sm text-muted-foreground">No bullets yet for this section.</p> : null}
                  {section.bullets.map((bullet, index) => (
                    <div key={`${section.name}-${index}`} className="rounded border border-border/60 p-2">
                      <div className="flex items-start gap-2">
                        <span className="pt-2 text-[11px] text-muted-foreground">{index + 1}.</span>
                        <textarea
                          className="min-h-16 flex-1 rounded-md border border-border bg-background px-2 py-1.5 text-xs"
                          value={bullet}
                          onChange={(event) => {
                            const value = event.target.value
                            updateSection(section.name, (current) => ({
                              ...current,
                              bullets: current.bullets.map((item, itemIndex) => (itemIndex === index ? value : item)),
                            }))
                          }}
                        />
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() =>
                            updateSection(section.name, (current) => ({
                              ...current,
                              bullets: current.bullets.filter((_, itemIndex) => itemIndex !== index),
                            }))
                          }
                        >
                          Remove
                        </Button>
                      </div>
                    </div>
                  ))}
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() =>
                      updateSection(section.name, (current) => ({
                        ...current,
                        bullets: [...current.bullets, ''],
                      }))
                    }
                  >
                    + Add bullet
                  </Button>
                </div>
              </div>
            )
          })}
        </div>
      ) : null}

      <details className="rounded-md border border-border/70 bg-muted/20 p-3">
        <summary className="cursor-pointer text-sm font-medium">Details</summary>
        <div className="mt-3 space-y-2">
          <Button variant="outline" size="sm" onClick={() => void onEstimatePreview()} disabled={busy === 'estimate' || selectedSections.length === 0}>
            {busy === 'estimate' ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : null}
            Refresh estimate preview
          </Button>
          {estimatePreview ? (
            <p className="text-xs text-muted-foreground">
              Estimated cost range: ${estimatePreview.estimated_cost_usd_low.toFixed(4)}-${estimatePreview.estimated_cost_usd_high.toFixed(4)}
            </p>
          ) : (
            <p className="text-xs text-muted-foreground">No estimate preview yet.</p>
          )}
        </div>
      </details>
    </div>
  )
}
