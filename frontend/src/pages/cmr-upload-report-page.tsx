import { useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'

import { PageHeader, Row, Stack } from '@/components/primitives'
import { SectionMarker } from '@/components/patterns'
import { extractFromReport } from '@/lib/cmr-api'
import { setExtractionResult } from '@/lib/cmr-report-store'
import { cn } from '@/lib/utils'

export function CmrUploadReportPage() {
  const [reportText, setReportText] = useState('')
  const [extracting, setExtracting] = useState(false)
  const [extractionError, setExtractionError] = useState<string | null>(null)
  const [reportType, setReportType] = useState<'standard' | 'stress'>('standard')
  const [fourDFlow, setFourDFlow] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const navigate = useNavigate()

  const handleExtract = async () => {
    if (!reportText.trim()) return
    setExtracting(true)
    setExtractionError(null)
    try {
      const result = await extractFromReport(reportText)
      setExtractionResult(result)
      navigate('/cmr-new-report')
    } catch (e) {
      setExtractionError(e instanceof Error ? e.message : 'Extraction failed')
    } finally {
      setExtracting(false)
    }
  }

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = (ev) => {
      const text = ev.target?.result
      if (typeof text === 'string') setReportText(text)
    }
    reader.readAsText(file)
    // Reset so the same file can be re-selected
    e.target.value = ''
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
              onClick={() => setReportType('standard')}
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
              onClick={() => setReportType('stress')}
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
            onClick={() => setFourDFlow((v) => !v)}
            className={cn(
              'flex items-center gap-2 rounded-md border px-4 py-2 text-sm font-medium transition-colors',
              fourDFlow
                ? 'border-[hsl(var(--section-style-report-accent))] bg-[hsl(var(--section-style-report-accent))] text-white'
                : 'border-[hsl(var(--border))] text-[hsl(var(--muted-foreground))] hover:bg-[hsl(var(--tone-neutral-100))]',
            )}
          >
            4D flow
          </button>
        </div>

        <textarea
          value={reportText}
          onChange={(e) => setReportText(e.target.value)}
          placeholder="Paste your CMR report text here (e.g. from CVI42, Medis, TomTec)..."
          rows={14}
          className="w-full rounded-md border border-[hsl(var(--border))] bg-[hsl(var(--background))] px-3 py-2 text-sm font-mono placeholder:text-[hsl(var(--muted-foreground)/0.5)] focus:outline-none focus:ring-2 focus:ring-[hsl(var(--section-style-report-accent))]"
        />

        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={handleExtract}
            disabled={!reportText.trim() || extracting}
            className={cn(
              'rounded-md px-6 py-2.5 text-sm font-semibold shadow-sm transition-colors',
              reportText.trim() && !extracting
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
        </div>
      </div>
    </Stack>
  )
}
