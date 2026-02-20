import { Loader2 } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { estimateGeneration, planSections } from '@/lib/study-core-api'
import type {
  GenerationEstimate,
  OutlinePlanSection,
  OutlinePlanState,
  SectionPlanItem,
  SectionPlanPayload,
} from '@/types/study-core'

const CORE_SECTIONS = ['introduction', 'methods', 'results', 'discussion']
const OPTIONAL_SECTIONS = ['abstract', 'conclusion', 'limitations']

type RefinementMode = 'suggest' | 'concise' | 'analytical' | 'mechanistic'

type CoherenceFeedback = {
  overall: string
  strengths: string[]
  risks: string[]
  actions: string[]
}

type StepPlanProps = {
  targetJournal: string
  answers: Record<string, string>
  selectedSections: string[]
  notesContext: string
  plan: OutlinePlanState | null
  estimatePreview: GenerationEstimate | null
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
  suggest: {
    label: 'Suggest improvements',
    overwrite: false,
    instruction: 'Improve this section outline while preserving existing user-authored bullets.',
  },
  concise: {
    label: 'Make more concise',
    overwrite: true,
    instruction: 'Rewrite this section outline to be concise and non-redundant.',
  },
  analytical: {
    label: 'Increase analytical depth',
    overwrite: true,
    instruction: 'Rewrite this section outline with stronger analytical framing and argument structure.',
  },
  mechanistic: {
    label: 'Increase mechanistic depth',
    overwrite: true,
    instruction: 'Rewrite this section outline with stronger mechanistic reasoning and explanatory logic.',
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

function reorderBullets(bullets: string[], from: number, to: number): string[] {
  const next = [...bullets]
  const [moved] = next.splice(from, 1)
  next.splice(to, 0, moved)
  return next
}

function buildCoherenceFeedback(plan: OutlinePlanState): CoherenceFeedback {
  const sectionsWithFewBullets = plan.sections.filter((section) => section.bullets.filter((bullet) => bullet.trim()).length < 2)
  const totalBullets = plan.sections.reduce((sum, section) => sum + section.bullets.filter((bullet) => bullet.trim()).length, 0)

  return {
    overall:
      sectionsWithFewBullets.length === 0
        ? 'Outline coverage is balanced across selected sections.'
        : 'Some sections remain sparse and may weaken end-to-end narrative flow.',
    strengths: [
      `${plan.sections.length} section(s) are represented in the outline.`,
      `${totalBullets} total outline bullet(s) are currently defined.`,
      'Section order follows manuscript progression for drafting.',
    ],
    risks:
      sectionsWithFewBullets.length > 0
        ? sectionsWithFewBullets.map((section) => `${titleCaseSection(section.name)} may need more evidentiary detail.`)
        : ['No obvious section-level sparsity detected in this mock check.'],
    actions: [
      'Use per-section AI refinement to tighten weak sections.',
      'Ensure each section has at least 3 concrete bullets before generation.',
      'Run estimate preview again after major outline edits.',
    ],
  }
}

export function StepPlan({
  targetJournal,
  answers,
  selectedSections,
  notesContext,
  plan,
  estimatePreview,
  onSectionsChange,
  onPlanChange,
  onEstimateChange,
  onStatus,
  onError,
}: StepPlanProps) {
  const [attemptedSubmit, setAttemptedSubmit] = useState(false)
  const [busy, setBusy] = useState<'plan' | 'estimate' | 'coherence' | ''>('')
  const [refineBusyKey, setRefineBusyKey] = useState('')
  const [dragState, setDragState] = useState<{ section: string; index: number } | null>(null)
  const [coherenceFeedback, setCoherenceFeedback] = useState<CoherenceFeedback | null>(null)

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

  const onBuildPlan = async () => {
    setAttemptedSubmit(true)
    if (selectedSections.length === 0) {
      return
    }
    setBusy('plan')
    onError('')
    try {
      const payload = await planSections({
        targetJournal,
        answers,
        sections: selectedSections,
      })
      onPlanChange(toOutlinePlan(payload, orderedSections))
      setCoherenceFeedback(null)
      onStatus(`Built plan for ${payload.items.length} section(s).`)
    } catch (error) {
      onError(error instanceof Error ? error.message : 'Could not build plan.')
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
        notesContext,
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
    setRefineBusyKey(`${sectionName}:${mode}`)
    onError('')
    try {
      const config = REFINEMENT_CONFIG[mode]
      const payload = await planSections({
        targetJournal,
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
      const nextBullets =
        config.overwrite && aiBullets.length > 0 ? aiBullets : config.overwrite ? section.bullets : dedupeBullets([...section.bullets, ...aiBullets])

      updateSection(sectionName, (current) => ({ ...current, bullets: nextBullets }))
      onStatus(`${titleCaseSection(sectionName)} outline updated.`)
    } catch (error) {
      onError(error instanceof Error ? error.message : `Could not refine ${titleCaseSection(sectionName)}.`)
    } finally {
      setRefineBusyKey('')
    }
  }

  const onEvaluateCoherence = () => {
    if (!plan) {
      return
    }
    setBusy('coherence')
    setCoherenceFeedback(buildCoherenceFeedback(plan))
    setBusy('')
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Step 2: Plan Sections</CardTitle>
        <CardDescription>Select sections, then build and refine an editable outline.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-sm text-muted-foreground">Choose manuscript sections and edit each section outline before generation.</p>

        <div className="space-y-2">
          <p className="text-xs font-medium text-muted-foreground">Core sections</p>
          <div className="flex flex-wrap gap-2">
            {CORE_SECTIONS.map((section) => (
              <Button
                key={section}
                size="sm"
                variant={selectedSections.includes(section) ? 'default' : 'outline'}
                onClick={() => onSectionsChange(toggleSection(section, selectedSections))}
              >
                {titleCaseSection(section)}
              </Button>
            ))}
          </div>
        </div>

        <div className="space-y-2">
          <p className="text-xs font-medium text-muted-foreground">Optional sections</p>
          <div className="flex flex-wrap gap-2">
            {OPTIONAL_SECTIONS.map((section) => (
              <Button
                key={section}
                size="sm"
                variant={selectedSections.includes(section) ? 'default' : 'outline'}
                onClick={() => onSectionsChange(toggleSection(section, selectedSections))}
              >
                {titleCaseSection(section)}
              </Button>
            ))}
          </div>
        </div>

        {hasSelectionError ? <p className="text-xs text-destructive">Select at least one section before building the plan.</p> : null}

        <div className="flex flex-wrap items-center gap-2">
          <Button onClick={onBuildPlan} disabled={busy === 'plan'}>
            {busy === 'plan' ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : null}
            Build Plan
          </Button>
          <Button variant="outline" onClick={onEstimatePreview} disabled={busy === 'estimate' || selectedSections.length === 0}>
            {busy === 'estimate' ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : null}
            Estimate Preview
          </Button>
          {estimatePreview ? (
            <Badge variant="secondary">
              ${estimatePreview.estimated_cost_usd_low.toFixed(4)}-${estimatePreview.estimated_cost_usd_high.toFixed(4)}
            </Badge>
          ) : null}
        </div>

        {plan ? (
          <div className="space-y-3 rounded-md border border-border p-3 text-xs">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="font-medium">Outline Editor</p>
              <Button variant="outline" size="sm" onClick={onEvaluateCoherence} disabled={busy === 'coherence'}>
                {busy === 'coherence' ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : null}
                Evaluate plan coherence
              </Button>
            </div>

            {plan.sections.map((section) => {
              const sectionBusy = refineBusyKey.startsWith(`${section.name}:`)
              return (
                <div key={section.name} className="space-y-2 rounded-md border border-border/80 p-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="text-sm font-semibold">{titleCaseSection(section.name)}</p>
                    <div className="flex flex-wrap gap-1">
                      {(Object.keys(REFINEMENT_CONFIG) as RefinementMode[]).map((mode) => (
                        <Button
                          key={mode}
                          size="sm"
                          variant="outline"
                          disabled={sectionBusy}
                          onClick={() => void onRefineSection(section.name, mode)}
                        >
                          {refineBusyKey === `${section.name}:${mode}` ? <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" /> : null}
                          {REFINEMENT_CONFIG[mode].label}
                        </Button>
                      ))}
                    </div>
                  </div>

                  {section.tags && section.tags.length > 0 ? (
                    <div className="flex flex-wrap gap-1">
                      {section.tags.map((tag) => (
                        <Badge key={`${section.name}-${tag}`} variant="outline">
                          {tag}
                        </Badge>
                      ))}
                    </div>
                  ) : null}

                  <div className="space-y-2">
                    {section.bullets.length === 0 ? <p className="text-muted-foreground">No bullets yet for this section.</p> : null}
                    {section.bullets.map((bullet, index) => (
                      <div
                        key={`${section.name}-${index}`}
                        draggable
                        onDragStart={() => setDragState({ section: section.name, index })}
                        onDragOver={(event) => event.preventDefault()}
                        onDrop={(event) => {
                          event.preventDefault()
                          if (!plan || !dragState || dragState.section !== section.name || dragState.index === index) {
                            return
                          }
                          const reordered = reorderBullets(section.bullets, dragState.index, index)
                          updateSection(section.name, (current) => ({ ...current, bullets: reordered }))
                          setDragState(null)
                        }}
                        onDragEnd={() => setDragState(null)}
                        className="rounded border border-border/60 p-2"
                      >
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

            {coherenceFeedback ? (
              <div className="space-y-2 rounded-md border border-border/80 bg-muted/30 p-3">
                <p className="text-sm font-semibold">Coherence Feedback (placeholder)</p>
                <p className="text-muted-foreground">{coherenceFeedback.overall}</p>
                <div>
                  <p className="font-medium">Strengths</p>
                  <ul className="list-disc pl-4 text-muted-foreground">
                    {coherenceFeedback.strengths.map((item) => (
                      <li key={item}>{item}</li>
                    ))}
                  </ul>
                </div>
                <div>
                  <p className="font-medium">Risks</p>
                  <ul className="list-disc pl-4 text-muted-foreground">
                    {coherenceFeedback.risks.map((item) => (
                      <li key={item}>{item}</li>
                    ))}
                  </ul>
                </div>
                <div>
                  <p className="font-medium">Recommended actions</p>
                  <ul className="list-disc pl-4 text-muted-foreground">
                    {coherenceFeedback.actions.map((item) => (
                      <li key={item}>{item}</li>
                    ))}
                  </ul>
                </div>
              </div>
            ) : null}
          </div>
        ) : null}
      </CardContent>
    </Card>
  )
}

