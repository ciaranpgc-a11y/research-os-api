import { CheckCircle2, Circle } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import type { WizardStep } from '@/store/use-study-core-wizard-store'

export type WizardStepItem = {
  id: WizardStep
  title: string
  helper: string
}

type StudyCoreStepperProps = {
  steps: WizardStepItem[]
  currentStep: WizardStep
  completedSteps: WizardStep[]
  inProgressSteps?: WizardStep[]
  canNavigateToStep: (step: WizardStep) => boolean
  onStepSelect: (step: WizardStep) => void
  devOverride: boolean
}

export function StudyCoreStepper({
  steps,
  currentStep,
  completedSteps,
  inProgressSteps = [],
  canNavigateToStep,
  onStepSelect,
  devOverride,
}: StudyCoreStepperProps) {
  return (
    <aside className="space-y-3 rounded-lg border border-border bg-card p-3">
      <div className="space-y-1">
        <p className="text-sm font-semibold">Run Steps</p>
      </div>

      <div className="space-y-2">
        {steps.map((step) => {
          const isCompleted = completedSteps.includes(step.id)
          const isInProgress = !isCompleted && inProgressSteps.includes(step.id)
          const isActive = currentStep === step.id
          const canAccess = canNavigateToStep(step.id)
          return (
            <Button
              key={step.id}
              variant="ghost"
              className={cn(
                'h-auto w-full items-start justify-start whitespace-normal rounded-md border border-transparent px-2 py-2 text-left',
                isActive && 'border-border bg-accent',
                isInProgress && !isActive && 'border-amber-200 bg-amber-50/40',
                !canAccess && !isCompleted && 'opacity-60',
              )}
              onClick={() => onStepSelect(step.id)}
              disabled={!canAccess}
            >
              <div className="mr-2 mt-0.5">
                {isCompleted ? (
                  <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                ) : isInProgress ? (
                  <Circle className="h-4 w-4 fill-amber-100 text-amber-500" />
                ) : (
                  <Circle className="h-4 w-4 text-muted-foreground" />
                )}
              </div>
              <div className="space-y-0.5">
                <p className="break-words text-sm font-medium leading-snug">
                  Step {step.id}: {step.title}
                </p>
              </div>
            </Button>
          )
        })}
      </div>

      {devOverride ? (
        <p className="text-[11px] text-muted-foreground">Dev mode override is active: forward step navigation is unlocked.</p>
      ) : null}
    </aside>
  )
}
