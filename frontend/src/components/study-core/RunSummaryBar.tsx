import { ArrowRight, ChevronDown, ChevronUp } from 'lucide-react'
import { useState } from 'react'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import type { ReadinessScore } from '@/lib/readiness-score'
import type { ContextStatus, JobStatus, PlanStatus, QcStatus } from '@/store/use-study-core-wizard-store'

type RunSummaryBarProps = {
  contextStatus: ContextStatus
  planStatus: PlanStatus
  jobStatus: JobStatus
  acceptedSections: number
  qcStatus: QcStatus
  readinessScore: ReadinessScore
  primaryActionLabel: string
  nextActionText: string
  onPrimaryAction: () => void
}

function statusText(status: string, positiveValue: string): string {
  return status === positiveValue ? positiveValue : status
}

export function RunSummaryBar({
  contextStatus,
  planStatus,
  jobStatus,
  acceptedSections,
  qcStatus,
  readinessScore,
  primaryActionLabel,
  nextActionText,
  onPrimaryAction,
}: RunSummaryBarProps) {
  const [showBreakdown, setShowBreakdown] = useState(false)
  const readinessVariant = readinessScore.status === 'Ready' ? 'default' : readinessScore.status === 'Moderate' ? 'secondary' : 'outline'

  return (
    <div className="sticky top-0 z-20 rounded-lg border border-border bg-background/95 p-3 shadow-sm backdrop-blur">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex min-w-[220px] items-start gap-3">
          <div>
            <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Generation readiness</p>
            <div className="flex items-end gap-2">
              <p className="text-3xl font-semibold leading-none">{readinessScore.total}</p>
              <p className="pb-0.5 text-xs text-muted-foreground">/90</p>
            </div>
          </div>
          <Badge variant={readinessVariant} className="mt-4">
            {readinessScore.status}
          </Badge>
          <Button size="sm" variant="ghost" className="mt-2 h-7 px-2" onClick={() => setShowBreakdown((current) => !current)}>
            View breakdown
            {showBreakdown ? <ChevronUp className="ml-1 h-3.5 w-3.5" /> : <ChevronDown className="ml-1 h-3.5 w-3.5" />}
          </Button>
        </div>

        <Button size="sm" onClick={onPrimaryAction}>
          {primaryActionLabel}
          <ArrowRight className="ml-1 h-4 w-4" />
        </Button>
      </div>

      <div className="mt-2 flex flex-wrap items-center gap-2 text-xs">
        <Badge variant={contextStatus === 'saved' ? 'default' : 'outline'}>
          Context: {contextStatus === 'saved' ? 'set' : 'not set'}
        </Badge>
        <Badge variant={planStatus === 'built' ? 'default' : 'outline'}>
          Plan: {planStatus === 'built' ? 'built' : 'not built'}
        </Badge>
        <Badge variant={jobStatus === 'succeeded' ? 'default' : 'outline'}>
          Last job: {statusText(jobStatus, 'succeeded')}
        </Badge>
        <Badge variant={acceptedSections > 0 ? 'default' : 'outline'}>
          Draft accepted: {acceptedSections}
        </Badge>
        <Badge variant={qcStatus === 'pass' ? 'default' : 'outline'}>
          QC status: {qcStatus}
        </Badge>
      </div>

      {showBreakdown ? (
        <div className="mt-3 grid gap-2 rounded-md border border-border/60 bg-muted/20 p-2 text-xs md:grid-cols-3">
          <p>
            Context: <span className="font-medium">{readinessScore.breakdown.context}/15</span>
          </p>
          <p>
            Plan: <span className="font-medium">{readinessScore.breakdown.plan}/15</span>
          </p>
          <p>
            Draft: <span className="font-medium">{readinessScore.breakdown.draft}/10</span>
          </p>
          <p>
            QC: <span className="font-medium">{readinessScore.breakdown.qc}/25</span>
          </p>
          <p>
            Statistical: <span className="font-medium">{readinessScore.breakdown.statistical}/15</span>
          </p>
          <p>
            Anchoring: <span className="font-medium">{readinessScore.breakdown.anchoring}/10</span>
          </p>
        </div>
      ) : null}

      <p className="mt-2 text-xs text-muted-foreground">{nextActionText}</p>
    </div>
  )
}
