import { useRef, useState, useSyncExternalStore } from 'react'
import { useNavigate } from 'react-router-dom'

import { PageHeader, Row, Stack } from '@/components/primitives'
import { SectionMarker } from '@/components/patterns'
import { extractFromReport } from '@/lib/cmr-api'
import { buildCmrCasePath } from '@/lib/cmr-case-routes'
import { getReportInput, setReportInput, setExtractionResult, subscribeReportInput } from '@/lib/cmr-report-store'
import {
  buildRandomSyntheticCmrCase,
  buildSyntheticCmrCase,
  CMR_SYNTHETIC_CASE_LIBRARY,
  enrichSyntheticCmrCaseWithLlm,
  type SyntheticCmrCase,
  RANDOM_CASE_ID,
} from '@/lib/cmr-synthetic-case'
import { cn } from '@/lib/utils'
import { useCmrCaseStore } from '@/store/use-cmr-case-store'

export function CmrUploadReportPage() {
  const reportInput = useSyncExternalStore(subscribeReportInput, getReportInput)
  const activeCaseId = useCmrCaseStore((state) => state.activeCaseId)
  const patchActiveCasePayload = useCmrCaseStore((state) => state.patchActiveCasePayload)
  const patchActiveCaseMeta = useCmrCaseStore((state) => state.patchActiveCaseMeta)
  const activeCase = useCmrCaseStore((state) => state.activeCase)
  const [selectedSyntheticCaseId, setSelectedSyntheticCaseId] = useState<string>(RANDOM_CASE_ID)
  const [extracting, setExtracting] = useState(false)
  const [generatingSyntheticCase, setGeneratingSyntheticCase] = useState(false)
  const [syntheticCaseSeeded, setSyntheticCaseSeeded] = useState(false)
  const [syntheticCaseSuccess, setSyntheticCaseSuccess] = useState(false)
  const [extractionError, setExtractionError] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const navigate = useNavigate()

  const reportText = reportInput.reportText
  const reportType = reportInput.reportType
  const fourDFlow = reportInput.fourDFlow
  const nonContrast = reportInput.nonContrast
  const submitDisabled = !reportText.trim() || extracting || generatingSyntheticCase || syntheticCaseSeeded
  const syntheticCaseGroups = Array.from(
    CMR_SYNTHETIC_CASE_LIBRARY.reduce((map, item) => {
      const entries = map.get(item.group) ?? []
      entries.push(item)
      map.set(item.group, entries)
      return map
    }, new Map<string, typeof CMR_SYNTHETIC_CASE_LIBRARY>()),
  )

  const handleExtract = async () => {
    if (!reportText.trim()) return
    setExtracting(true)
    setSyntheticCaseSuccess(false)
    setExtractionError(null)
    try {
      const result = await extractFromReport(reportText)
      setExtractionResult(result)
      patchActiveCaseMeta({
        title: activeCase?.title && activeCase.title !== 'Untitled report'
          ? activeCase.title
          : (result.demographics.study_date ? `CMR ${result.demographics.study_date}` : 'CMR report'),
        study_date: result.demographics.study_date ?? null,
        last_completed_step: 'report',
      })
      if (activeCaseId) {
        navigate(buildCmrCasePath(activeCaseId, 'report'))
      }
    } catch (e) {
      setExtractionError(e instanceof Error ? e.message : 'Extraction failed')
    } finally {
      setExtracting(false)
    }
  }

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    setSyntheticCaseSeeded(false)
    setSyntheticCaseSuccess(false)
    setReportInput({ fileName: file.name })
    const reader = new FileReader()
    reader.onload = (ev) => {
      const text = ev.target?.result
      if (typeof text === 'string') setReportInput({ reportText: text })
    }
    reader.readAsText(file)
    // Reset so the same file can be re-selected
    e.target.value = ''
  }

  const handleGenerateSyntheticCase = async () => {
    const syntheticCase: SyntheticCmrCase = selectedSyntheticCaseId === RANDOM_CASE_ID
      ? buildRandomSyntheticCmrCase()
      : buildSyntheticCmrCase(selectedSyntheticCaseId)

    patchActiveCasePayload(() => syntheticCase.payload)
    patchActiveCaseMeta({
      title: syntheticCase.title,
      patient_label: syntheticCase.patientLabel,
      study_date: syntheticCase.studyDate,
      last_completed_step: 'report',
    })
    setSyntheticCaseSeeded(true)
    setSyntheticCaseSuccess(false)
    setExtractionError(null)

    setGeneratingSyntheticCase(true)
    try {
      const enriched = await enrichSyntheticCmrCaseWithLlm(syntheticCase)
      patchActiveCasePayload(() => enriched.syntheticCase.payload)
      setSyntheticCaseSuccess(true)
      if (enriched.warnings.length > 0) {
        setExtractionError(`Synthetic case seeded; some summaries used deterministic fallback: ${enriched.warnings.join('; ')}`)
      }
    } catch (error) {
      setSyntheticCaseSuccess(false)
      setExtractionError(
        `Synthetic case seeded, but automatic summary generation failed: ${error instanceof Error ? error.message : String(error)}`,
      )
    } finally {
      setGeneratingSyntheticCase(false)
    }
  }

  return (
    <Stack data-house-role="page" space="lg">
      <Row align="center" gap="md" wrap={false} className="house-page-title-row">
        <SectionMarker tone="report" size="title" className="self-stretch h-auto" />
        <PageHeader
          heading="Upload report"
          className="!ml-0 !mt-0"
        />
      </Row>

      <div className="space-y-4">
        <div className="flex items-center gap-4">
          <div className="flex items-center rounded-md border border-[hsl(var(--border))] overflow-hidden text-sm font-medium">
            <button
              type="button"
              onClick={() => setReportInput({ reportType: 'standard' })}
              className={cn(
                'px-4 py-2 transition-colors',
                reportType === 'standard'
                  ? 'bg-[hsl(var(--section-style-report-accent))] text-white'
                  : 'text-[hsl(var(--muted-foreground))] hover:bg-[hsl(var(--tone-neutral-100))]',
              )}
            >
              Standard
            </button>
            <button
              type="button"
              onClick={() => setReportInput({ reportType: 'stress' })}
              className={cn(
                'px-4 py-2 transition-colors border-l border-[hsl(var(--border))]',
                reportType === 'stress'
                  ? 'bg-[hsl(var(--section-style-report-accent))] text-white'
                  : 'text-[hsl(var(--muted-foreground))] hover:bg-[hsl(var(--tone-neutral-100))]',
              )}
            >
              Stress
            </button>
          </div>

          <button
            type="button"
            onClick={() => setReportInput({ fourDFlow: !fourDFlow })}
            className={cn(
              'flex items-center gap-2 rounded-md border px-4 py-2 text-sm font-medium transition-colors',
              fourDFlow
                ? 'border-[hsl(var(--section-style-report-accent))] bg-[hsl(var(--section-style-report-accent))] text-white'
                : 'border-[hsl(var(--border))] text-[hsl(var(--muted-foreground))] hover:bg-[hsl(var(--tone-neutral-100))]',
            )}
          >
            4D flow
          </button>

          <button
            type="button"
            onClick={() => setReportInput({ nonContrast: !nonContrast })}
            className={cn(
              'flex items-center gap-2 rounded-md border px-4 py-2 text-sm font-medium transition-colors',
              nonContrast
                ? 'border-[hsl(var(--section-style-report-accent))] bg-[hsl(var(--section-style-report-accent))] text-white'
                : 'border-[hsl(var(--border))] text-[hsl(var(--muted-foreground))] hover:bg-[hsl(var(--tone-neutral-100))]',
            )}
          >
            Non-contrast
          </button>
        </div>

        <textarea
          value={reportText}
          onChange={(e) => {
            setSyntheticCaseSeeded(false)
            setSyntheticCaseSuccess(false)
            setReportInput({ reportText: e.target.value })
          }}
          placeholder="Paste your CMR report text here (e.g. from CVI42, Medis, TomTec)..."
          rows={14}
          className="w-full rounded-md border border-[hsl(var(--border))] bg-[hsl(var(--background))] px-3 py-2 text-sm font-mono placeholder:text-[hsl(var(--muted-foreground)/0.5)] focus:outline-none focus:ring-2 focus:ring-[hsl(var(--section-style-report-accent))]"
        />

        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={handleExtract}
            disabled={submitDisabled}
            className={cn(
              'rounded-md px-6 py-2.5 text-sm font-semibold shadow-sm transition-colors',
              !submitDisabled
                ? 'bg-[hsl(var(--section-style-report-accent))] text-white hover:opacity-90'
                : 'bg-[hsl(var(--tone-neutral-200))] text-[hsl(var(--muted-foreground))] cursor-not-allowed',
            )}
          >
            {extracting ? 'Extracting...' : 'Submit'}
          </button>

          <input
            ref={fileInputRef}
            type="file"
            accept=".txt,.csv,.tsv,.text"
            onChange={handleFileUpload}
            className="hidden"
          />
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="rounded-md border border-[hsl(var(--border))] px-4 py-2.5 text-sm font-medium text-[hsl(var(--foreground))] transition-colors hover:bg-[hsl(var(--tone-neutral-100))]"
          >
            Upload File
          </button>

          {extractionError && (
            <span className="text-xs text-[hsl(var(--tone-danger-500))]">
              {extractionError}
            </span>
          )}

          <div className="ml-auto flex items-center gap-2">
            <select
              value={selectedSyntheticCaseId}
              onChange={(e) => setSelectedSyntheticCaseId(e.target.value)}
              disabled={generatingSyntheticCase}
              className="max-w-[24rem] rounded-md border border-[hsl(var(--border))] bg-[hsl(var(--background))] px-3 py-2.5 text-sm text-[hsl(var(--foreground))] focus:outline-none focus:ring-2 focus:ring-[hsl(var(--section-style-report-accent))]"
            >
              <option value={RANDOM_CASE_ID}>Random common case</option>
              {syntheticCaseGroups.map(([group, items]) => (
                <optgroup key={group} label={group}>
                  {items.map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.label}
                    </option>
                  ))}
                </optgroup>
              ))}
            </select>
            <button
              type="button"
              onClick={handleGenerateSyntheticCase}
              disabled={generatingSyntheticCase}
              className="rounded-md border border-dashed border-[hsl(var(--stroke-soft)/0.6)] px-4 py-2.5 text-sm font-medium text-[hsl(var(--tone-neutral-400))] transition-colors hover:border-[hsl(var(--stroke-soft))] hover:text-[hsl(var(--tone-neutral-600))] hover:bg-[hsl(var(--tone-neutral-50))]"
            >
              {generatingSyntheticCase ? 'Generating full test case...' : 'Generate test case'}
            </button>
          </div>
        </div>
        {syntheticCaseSuccess && (
          <div className="rounded-md border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-700">
            Success. Please navigate to report elements.
          </div>
        )}
      </div>
    </Stack>
  )
}
