import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'

import { SectionMarker } from '@/components/patterns'
import { PageHeader, Row, Stack } from '@/components/primitives'
import { Select } from '@/components/ui/select'
import { updateCmrCase, type CmrCaseSummary } from '@/lib/cmr-case-api'
import { buildCmrCasePath } from '@/lib/cmr-case-routes'
import { CMR_REPORT_TAG_OPTIONS, getCmrReportTagToneClass } from '@/lib/cmr-report-tags'
import { cn } from '@/lib/utils'
import { useCmrCaseStore } from '@/store/use-cmr-case-store'

const DATE_FORMATTER = new Intl.DateTimeFormat('en-GB', {
  day: '2-digit',
  month: 'short',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
})

const REPORTS_TABLE_GRID =
  'lg:grid-cols-[minmax(0,1.35fr)_minmax(14rem,1.15fr)_minmax(8.75rem,0.8fr)_minmax(10.75rem,0.95fr)_minmax(9.5rem,0.8fr)]'

const REPORT_TAG_OPTION_STYLE = {
  backgroundColor: '#ffffff',
  color: '#18243d',
}

function formatTimestamp(value: string | null): string {
  if (!value) return 'Not saved yet'
  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) return 'Not saved yet'
  return DATE_FORMATTER.format(parsed)
}

function trimText(value: string | null | undefined): string {
  return value?.trim() ?? ''
}

function resolvePrimaryLabel(summary: CmrCaseSummary): string {
  const title = trimText(summary.title)
  const patientLabel = trimText(summary.patient_label)

  if (title && title.toLowerCase() !== 'untitled report') return title
  if (patientLabel) return patientLabel
  return 'Report'
}

function resolveSecondaryLabel(summary: CmrCaseSummary): string | null {
  const title = trimText(summary.title)
  const patientLabel = trimText(summary.patient_label)

  if (!patientLabel) return null
  if (!title || title.toLowerCase() === 'untitled report') return null
  if (patientLabel.toLowerCase() === title.toLowerCase()) return null
  return patientLabel
}

function formatStudyDate(value: string | null): string {
  return trimText(value) || '-'
}

export function CmrReportsPage() {
  const navigate = useNavigate()
  const summaries = useCmrCaseStore((state) => state.summaries)
  const activeCaseId = useCmrCaseStore((state) => state.activeCaseId)
  const loadingSummaries = useCmrCaseStore((state) => state.loadingSummaries)
  const caseError = useCmrCaseStore((state) => state.caseError)
  const loadSummaries = useCmrCaseStore((state) => state.loadSummaries)
  const createFreshCase = useCmrCaseStore((state) => state.createFreshCase)
  const loadCase = useCmrCaseStore((state) => state.loadCase)
  const deleteCase = useCmrCaseStore((state) => state.deleteCase)
  const flushActiveCase = useCmrCaseStore((state) => state.flushActiveCase)
  const syncSavedCaseMetadata = useCmrCaseStore((state) => state.syncSavedCaseMetadata)
  const [creating, setCreating] = useState(false)
  const [openingId, setOpeningId] = useState<string | null>(null)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [taggingId, setTaggingId] = useState<string | null>(null)
  const [pendingTags, setPendingTags] = useState<Record<string, string>>({})
  const [tagError, setTagError] = useState<string | null>(null)

  useEffect(() => {
    void loadSummaries()
  }, [loadSummaries])

  const orderedSummaries = useMemo(
    () => [...summaries].sort((left, right) => (right.updated_at ?? '').localeCompare(left.updated_at ?? '')),
    [summaries],
  )

  const handleCreate = async () => {
    setCreating(true)
    try {
      const created = await createFreshCase()
      if (!created) return
      navigate(buildCmrCasePath(created.id, 'upload'))
    } finally {
      setCreating(false)
    }
  }

  const handleOpen = async (caseId: string) => {
    setOpeningId(caseId)
    try {
      const loaded = await loadCase(caseId)
      if (!loaded) return
      navigate(buildCmrCasePath(loaded.id, 'output'))
    } finally {
      setOpeningId(null)
    }
  }

  const handleDelete = async (caseId: string, title: string | null) => {
    const displayTitle = title?.trim() || 'Untitled report'
    if (typeof window !== 'undefined' && !window.confirm(`Delete "${displayTitle}"? This cannot be undone.`)) {
      return
    }

    setDeletingId(caseId)
    try {
      await deleteCase(caseId)
    } finally {
      setDeletingId(null)
    }
  }

  const handleTagChange = async (caseId: string, nextTag: string) => {
    const normalizedTag = nextTag.trim()
    setPendingTags((current) => ({ ...current, [caseId]: normalizedTag }))
    setTagError(null)
    setTaggingId(caseId)

    try {
      const flushed = await flushActiveCase()
      if (!flushed) throw new Error('Failed to save current report before updating tag')
      const saved = await updateCmrCase(caseId, { report_tag: normalizedTag || null })
      syncSavedCaseMetadata(saved)
      await loadSummaries()
    } catch (error) {
      setTagError(error instanceof Error ? error.message : 'Failed to save tag')
    } finally {
      setPendingTags((current) => {
        const next = { ...current }
        delete next[caseId]
        return next
      })
      setTaggingId((current) => (current === caseId ? null : current))
    }
  }

  const pageError = tagError ?? caseError

  return (
    <Stack data-house-role="page" space="lg">
      <Row align="center" gap="md" wrap={false} className="house-page-title-row">
        <SectionMarker tone="report" size="title" className="self-stretch h-auto" />
        <PageHeader heading="My reports" className="!ml-0 !mt-0" />
      </Row>

      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={handleCreate}
          disabled={creating}
          className="rounded-full bg-[hsl(var(--section-style-report-accent))] px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {creating ? 'Creating...' : 'New Report'}
        </button>
      </div>

      {pageError && (
        <div className="rounded-xl border border-[hsl(var(--tone-danger-200))] bg-[hsl(var(--tone-danger-50))] px-4 py-3 text-sm text-[hsl(var(--tone-danger-700))]">
          {pageError}
        </div>
      )}

      <div className="grid gap-4">
        {loadingSummaries && orderedSummaries.length === 0 && (
          <div className="rounded-xl border border-border/50 bg-card px-5 py-8 text-sm text-[hsl(var(--muted-foreground))]">
            Loading saved reports...
          </div>
        )}

        {!loadingSummaries && orderedSummaries.length === 0 && (
          <div className="rounded-xl border border-dashed border-border/60 bg-card px-5 py-10 text-center">
            <p className="text-sm font-medium text-[hsl(var(--foreground))]">No saved reports yet.</p>
            <p className="mt-2 text-sm text-[hsl(var(--muted-foreground))]">
              Start a new report to create your first persisted draft.
            </p>
          </div>
        )}

        {orderedSummaries.length > 0 && (
          <div className="overflow-hidden rounded-2xl border border-border/50 bg-card">
            <div
              className={cn(
                'hidden gap-4 border-b border-border/50 px-5 py-3 text-[11px] font-semibold uppercase tracking-[0.12em] text-[hsl(var(--tone-neutral-500))] lg:grid',
                REPORTS_TABLE_GRID,
              )}
            >
              <span className="pr-3">Report</span>
              <span className="justify-self-center text-center">Tag</span>
              <span className="justify-self-center text-center">Study date</span>
              <span className="justify-self-center text-center">Last saved</span>
              <span className="justify-self-center text-center">Actions</span>
            </div>

            {orderedSummaries.map((summary, index) => {
              const primaryLabel = resolvePrimaryLabel(summary)
              const secondaryLabel = resolveSecondaryLabel(summary)
              const selectedTag = pendingTags[summary.id] ?? summary.report_tag ?? ''
              return (
                <div
                  key={summary.id}
                  className={cn(
                    'grid gap-4 px-5 py-4 lg:items-center',
                    REPORTS_TABLE_GRID,
                    index > 0 && 'border-t border-border/50',
                    summary.id === activeCaseId && 'bg-[hsl(var(--section-style-report-accent)/0.05)]',
                  )}
                >
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <button
                        type="button"
                        onClick={() => void handleOpen(summary.id)}
                        disabled={deletingId === summary.id || taggingId === summary.id}
                        className="truncate text-left text-base font-semibold text-[hsl(var(--foreground))] transition hover:text-[hsl(var(--section-style-report-accent))] disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        {primaryLabel}
                      </button>
                      {summary.id === activeCaseId && (
                        <span className="rounded-full bg-[hsl(var(--section-style-report-accent))] px-2.5 py-0.5 text-[11px] font-semibold text-white">
                          Current
                        </span>
                      )}
                    </div>
                    {secondaryLabel && (
                      <p className="mt-1 truncate text-sm text-[hsl(var(--muted-foreground))]">{secondaryLabel}</p>
                    )}
                  </div>

                  <div className="min-w-0 lg:justify-self-center lg:w-full lg:max-w-[14rem]">
                    <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[hsl(var(--tone-neutral-500))] lg:hidden">
                      Tag
                    </p>
                    <Select
                      value={selectedTag}
                      onChange={(event) => void handleTagChange(summary.id, event.target.value)}
                      disabled={deletingId === summary.id || taggingId === summary.id}
                      title={selectedTag || 'No tag'}
                      className={cn(
                        'mt-1 h-9 w-full min-w-0 rounded-lg border text-sm lg:mt-0',
                        getCmrReportTagToneClass(selectedTag),
                      )}
                    >
                      <option value="" style={REPORT_TAG_OPTION_STYLE}>
                        No tag
                      </option>
                      {CMR_REPORT_TAG_OPTIONS.map((option) => (
                        <option key={option} value={option} style={REPORT_TAG_OPTION_STYLE}>
                          {option}
                        </option>
                      ))}
                    </Select>
                  </div>

                  <div className="lg:justify-self-center lg:w-full lg:max-w-[8.75rem] lg:text-center">
                    <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[hsl(var(--tone-neutral-500))] lg:hidden">
                      Study date
                    </p>
                    <p className="mt-1 text-sm text-[hsl(var(--foreground))] lg:mt-0">{formatStudyDate(summary.study_date)}</p>
                  </div>

                  <div className="lg:justify-self-center lg:w-full lg:max-w-[10.75rem] lg:text-center">
                    <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[hsl(var(--tone-neutral-500))] lg:hidden">
                      Last saved
                    </p>
                    <p className="mt-1 text-sm text-[hsl(var(--foreground))] lg:mt-0">{formatTimestamp(summary.updated_at)}</p>
                  </div>

                  <div className="flex items-center justify-start gap-3 lg:justify-self-center lg:w-[9.5rem] lg:justify-between">
                    <button
                      type="button"
                      onClick={() => void handleDelete(summary.id, summary.title)}
                      disabled={deletingId === summary.id || taggingId === summary.id}
                      className="rounded-full px-3 py-1 text-xs font-medium text-red-600 ring-1 ring-red-300 transition-all hover:bg-red-50 hover:text-red-700 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      {deletingId === summary.id ? 'Deleting...' : 'Delete'}
                    </button>
                    <button
                      type="button"
                      onClick={() => void handleOpen(summary.id)}
                      disabled={deletingId === summary.id || taggingId === summary.id}
                      className="rounded-full px-3 py-1 text-xs font-medium text-[hsl(var(--section-style-report-accent))] ring-1 ring-[hsl(var(--section-style-report-accent)/0.35)] transition-all hover:bg-[hsl(var(--section-style-report-accent)/0.08)] disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      {openingId === summary.id ? 'Opening...' : 'Open'}
                    </button>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </Stack>
  )
}
