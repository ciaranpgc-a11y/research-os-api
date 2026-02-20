import { ArrowRight } from 'lucide-react'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import type { ContextStatus, JobStatus, PlanStatus, QcStatus } from '@/store/use-study-core-wizard-store'

type RunSummaryBarProps = {
  contextStatus: ContextStatus
  planStatus: PlanStatus
  jobStatus: JobStatus
  acceptedSections: number
  qcStatus: QcStatus
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
  primaryActionLabel,
  nextActionText,
  onPrimaryAction,
}: RunSummaryBarProps) {
  return (
    <div className="sticky top-0 z-20 rounded-lg border border-border bg-background/95 p-3 shadow-sm backdrop-blur">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2 text-xs">
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
        <Button size="sm" onClick={onPrimaryAction}>
          {primaryActionLabel}
          <ArrowRight className="ml-1 h-4 w-4" />
        </Button>
      </div>
      <p className="mt-2 text-xs text-muted-foreground">{nextActionText}</p>
    </div>
  )
}

