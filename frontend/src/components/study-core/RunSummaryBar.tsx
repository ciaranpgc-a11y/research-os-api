import { ArrowRight } from 'lucide-react'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { useDataWorkspaceStore } from '@/store/use-data-workspace-store'
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
  const dataFilesCount = useDataWorkspaceStore((state) => state.dataAssets.length)
  const workingTablesCount = useDataWorkspaceStore((state) => state.workingTables.length)
  const manuscriptTablesCount = useDataWorkspaceStore((state) => state.manuscriptTables.length)

  return (
    <div className="sticky top-0 z-20 rounded-lg border border-border bg-background/95 p-3 shadow-sm backdrop-blur">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="space-y-1">
          <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Run summary</p>
          <p className="text-sm font-medium">{nextActionText}</p>
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
        <Badge variant="outline">Data files: {dataFilesCount}</Badge>
        <Badge variant="outline">Working tables: {workingTablesCount}</Badge>
        <Badge variant="outline">Manuscript tables: {manuscriptTablesCount}</Badge>
      </div>
    </div>
  )
}
