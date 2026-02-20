import { Loader2 } from 'lucide-react'
import { useMemo, useState } from 'react'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { estimateGeneration, planSections } from '@/lib/study-core-api'
import type { GenerationEstimate, SectionPlanPayload } from '@/types/study-core'

const CORE_SECTIONS = ['introduction', 'methods', 'results', 'discussion']
const OPTIONAL_SECTIONS = ['abstract', 'conclusion', 'limitations']

type StepPlanProps = {
  targetJournal: string
  answers: Record<string, string>
  selectedSections: string[]
  notesContext: string
  plan: SectionPlanPayload | null
  estimatePreview: GenerationEstimate | null
  onSectionsChange: (sections: string[]) => void
  onPlanChange: (plan: SectionPlanPayload | null) => void
  onEstimateChange: (estimate: GenerationEstimate | null) => void
  onStatus: (message: string) => void
  onError: (message: string) => void
}

function toggleSection(section: string, current: string[]): string[] {
  if (current.includes(section)) {
    return current.filter((item) => item !== section)
  }
  return [...current, section]
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
  const [busy, setBusy] = useState<'plan' | 'estimate' | ''>('')

  const hasSelectionError = attemptedSubmit && selectedSections.length === 0
  const orderedPreviewSections = useMemo(() => (selectedSections.length > 0 ? selectedSections : CORE_SECTIONS), [selectedSections])

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
      onPlanChange(payload)
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

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Step 2: Plan Sections</CardTitle>
        <CardDescription>Select manuscript sections, then build a section plan and preview cost estimates.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-sm text-muted-foreground">Choose the sections you want in this run, then generate a compact plan preview per section.</p>

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
                {section}
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
                {section}
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
          <div className="space-y-2 rounded-md border border-border p-3 text-xs">
            <p className="font-medium">Plan Preview</p>
            {orderedPreviewSections.map((section) => {
              const item = plan.items.find((candidate) => candidate.section === section)
              if (!item) {
                return (
                  <div key={section}>
                    <p className="font-medium">{section}</p>
                    <p className="text-muted-foreground">No plan item returned.</p>
                  </div>
                )
              }
              return (
                <div key={section} className="space-y-1">
                  <p className="font-medium">{section}</p>
                  <ul className="list-disc pl-4 text-muted-foreground">
                    <li>{item.objective}</li>
                    {item.must_include.slice(0, 2).map((point) => (
                      <li key={point}>{point}</li>
                    ))}
                  </ul>
                </div>
              )
            })}
          </div>
        ) : null}
      </CardContent>
    </Card>
  )
}

