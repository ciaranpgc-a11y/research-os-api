import { ImagePlus, Trash2 } from 'lucide-react'
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'

import { SectionMarker } from '@/components/patterns'
import { PageHeader, Row, Stack } from '@/components/primitives'
import { Button, Input } from '@/components/ui'
import { cmrAnalyseSaxPair, getCmrSessionToken, type CmrSaxAssistResult } from '@/lib/cmr-auth'
import { cn } from '@/lib/utils'

type ViewKey = 'sax' | '2ch' | '3ch' | '4ch'
type ContrastKey = 'pre' | 'post'

type UploadSlotState = {
  file: File | null
  previewUrl: string | null
}

type ViewUploadState = Record<ContrastKey, UploadSlotState>
type UploadState = Record<ViewKey, ViewUploadState>

type SaxControlKey =
  | 'centerXPct'
  | 'centerYPct'
  | 'innerRadiusPct'
  | 'outerRadiusPct'
  | 'enhancementThreshold'

type SaxControlsState = Record<SaxControlKey, string>

const VIEW_DEFS: Array<{ key: ViewKey; label: string; description: string }> = [
  { key: 'sax', label: 'SAX', description: 'Matched short-axis pre-contrast and post-contrast pair.' },
  { key: '2ch', label: '2CH', description: 'Matched two-chamber pre-contrast and post-contrast pair.' },
  { key: '3ch', label: '3CH', description: 'Matched three-chamber pre-contrast and post-contrast pair.' },
  { key: '4ch', label: '4CH', description: 'Matched four-chamber pre-contrast and post-contrast pair.' },
]

const CONTRAST_DEFS: Array<{ key: ContrastKey; label: string }> = [
  { key: 'pre', label: 'Pre-contrast' },
  { key: 'post', label: 'Post-contrast' },
]

const SAX_CONTROL_DEFS: Array<{ key: SaxControlKey; label: string; helper: string }> = [
  { key: 'centerXPct', label: 'Centre X', helper: '% width' },
  { key: 'centerYPct', label: 'Centre Y', helper: '% height' },
  { key: 'innerRadiusPct', label: 'Inner radius', helper: '% of frame' },
  { key: 'outerRadiusPct', label: 'Outer radius', helper: '% of frame' },
  { key: 'enhancementThreshold', label: 'Threshold', helper: 'delta z-score' },
]

function createEmptyState(): UploadState {
  return {
    sax: { pre: { file: null, previewUrl: null }, post: { file: null, previewUrl: null } },
    '2ch': { pre: { file: null, previewUrl: null }, post: { file: null, previewUrl: null } },
    '3ch': { pre: { file: null, previewUrl: null }, post: { file: null, previewUrl: null } },
    '4ch': { pre: { file: null, previewUrl: null }, post: { file: null, previewUrl: null } },
  }
}

function createDefaultSaxControls(): SaxControlsState {
  return {
    centerXPct: '50',
    centerYPct: '50',
    innerRadiusPct: '18',
    outerRadiusPct: '34',
    enhancementThreshold: '1.6',
  }
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

function parseOrFallback(value: string, fallback: number): number {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : fallback
}

function StatusPill({ label }: { label: string }) {
  return (
    <span className="rounded-full border border-[hsl(var(--stroke-soft)/0.7)] bg-[hsl(var(--tone-neutral-50))] px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.08em] text-[hsl(var(--tone-neutral-500))]">
      {label}
    </span>
  )
}

function UploadSlot({
  viewKey,
  contrastKey,
  contrastLabel,
  slot,
  onFileSelect,
  onClear,
}: {
  viewKey: ViewKey
  contrastKey: ContrastKey
  contrastLabel: string
  slot: UploadSlotState
  onFileSelect: (viewKey: ViewKey, contrastKey: ContrastKey, file: File | null) => void
  onClear: (viewKey: ViewKey, contrastKey: ContrastKey) => void
}) {
  const inputId = `cmr-image-analyser-${viewKey}-${contrastKey}`

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between gap-3 px-1">
        <span className="house-field-label">{contrastLabel}</span>
        {slot.file && (
          <span className="text-[11px] font-medium uppercase tracking-[0.08em] text-muted-foreground">
            {formatFileSize(slot.file.size)}
          </span>
        )}
      </div>

      <label
        htmlFor={inputId}
        className={cn(
          'group flex min-h-[15rem] cursor-pointer flex-col justify-between rounded-xl border border-dashed px-4 py-4 transition-colors',
          slot.previewUrl
            ? 'border-[hsl(var(--section-style-report-accent)/0.4)] bg-[hsl(var(--tone-accent-50)/0.18)]'
            : 'border-border/60 bg-[hsl(var(--tone-neutral-50)/0.4)] hover:border-[hsl(var(--section-style-report-accent)/0.35)] hover:bg-[hsl(var(--tone-neutral-50)/0.65)]',
        )}
      >
        <input
          id={inputId}
          type="file"
          accept="image/png,image/jpeg,image/webp,image/bmp,image/tiff"
          className="hidden"
          onChange={(event) => {
            const file = event.target.files?.[0] ?? null
            onFileSelect(viewKey, contrastKey, file)
            event.currentTarget.value = ''
          }}
        />

        {slot.previewUrl ? (
          <>
            <div className="overflow-hidden rounded-lg border border-border/40 bg-card">
              <img
                src={slot.previewUrl}
                alt={`${contrastLabel} preview`}
                className="h-72 w-full object-contain bg-[hsl(var(--tone-neutral-50))]"
              />
            </div>
            <div className="mt-3 flex items-end justify-between gap-3">
              <div className="min-w-0">
                <p className="truncate text-sm font-medium text-foreground">{slot.file?.name}</p>
                <p className="text-xs text-muted-foreground">Click to replace this image.</p>
              </div>
              <button
                type="button"
                onClick={(event) => {
                  event.preventDefault()
                  event.stopPropagation()
                  onClear(viewKey, contrastKey)
                }}
                className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-[hsl(var(--tone-danger-300))] text-[hsl(var(--tone-danger-500))] transition-colors hover:bg-[hsl(var(--tone-danger-50))]"
                aria-label={`Remove ${contrastLabel.toLowerCase()} image`}
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
          </>
        ) : (
          <>
            <div className="flex flex-1 flex-col items-center justify-center text-center">
              <span className="mb-3 inline-flex h-11 w-11 items-center justify-center rounded-full border border-border/60 bg-card text-[hsl(var(--section-style-report-accent))]">
                <ImagePlus className="h-5 w-5" />
              </span>
              <p className="text-sm font-medium text-foreground">Add {contrastLabel.toLowerCase()} image</p>
              <p className="mt-1 text-xs text-muted-foreground">PNG, JPG, WEBP, BMP, or TIFF</p>
            </div>
            <div className="mt-4 flex justify-center">
              <span className="rounded-full border border-border/60 px-3 py-1 text-xs font-medium text-foreground transition-colors group-hover:bg-card">
                Choose file
              </span>
            </div>
          </>
        )}
      </label>
    </div>
  )
}

function ViewCard({
  view,
  slots,
  onFileSelect,
  onClear,
  children,
}: {
  view: { key: ViewKey; label: string; description: string }
  slots: ViewUploadState
  onFileSelect: (viewKey: ViewKey, contrastKey: ContrastKey, file: File | null) => void
  onClear: (viewKey: ViewKey, contrastKey: ContrastKey) => void
  children?: ReactNode
}) {
  const loadedCount = Number(Boolean(slots.pre.file)) + Number(Boolean(slots.post.file))

  return (
    <section className="overflow-hidden rounded-xl border border-border/50 bg-card">
      <div className="flex items-center gap-3 border-b border-border/30 px-5 py-4">
        <SectionMarker tone="report" size="title" className="self-stretch h-auto" />
        <div className="flex-1">
          <h2 className="text-base font-semibold text-foreground">{view.label}</h2>
          <p className="mt-1 text-sm text-muted-foreground">{view.description}</p>
        </div>
        <StatusPill label={`${loadedCount}/2 loaded`} />
      </div>

      <div className="grid gap-x-8 gap-y-5 p-5 xl:grid-cols-2">
        {CONTRAST_DEFS.map((contrast) => (
          <UploadSlot
            key={contrast.key}
            viewKey={view.key}
            contrastKey={contrast.key}
            contrastLabel={contrast.label}
            slot={slots[contrast.key]}
            onFileSelect={onFileSelect}
            onClear={onClear}
          />
        ))}
      </div>

      {children && <div className="border-t border-border/30 px-5 py-5">{children}</div>}
    </section>
  )
}

function MetricCard({ label, value, helper }: { label: string; value: string; helper: string }) {
  return (
    <div className="rounded-xl border border-border/40 bg-background/70 px-4 py-3">
      <p className="house-field-label">{label}</p>
      <p className="mt-2 text-2xl font-semibold text-foreground">{value}</p>
      <p className="mt-1 text-sm text-muted-foreground">{helper}</p>
    </div>
  )
}

function AnalysisImagePanel({ title, src }: { title: string; src: string }) {
  return (
    <div className="overflow-hidden rounded-xl border border-border/40 bg-background/65">
      <div className="border-b border-border/30 px-4 py-3">
        <p className="house-field-label">{title}</p>
      </div>
      <div className="bg-card p-3">
        <img src={src} alt={title} className="h-72 w-full rounded-lg object-contain bg-[hsl(var(--tone-neutral-50))]" />
      </div>
    </div>
  )
}

export function CmrImageAnalyserPage() {
  const [uploads, setUploads] = useState<UploadState>(() => createEmptyState())
  const [saxControls, setSaxControls] = useState<SaxControlsState>(() => createDefaultSaxControls())
  const [saxResult, setSaxResult] = useState<CmrSaxAssistResult | null>(null)
  const [saxError, setSaxError] = useState<string | null>(null)
  const [saxAnalysing, setSaxAnalysing] = useState(false)
  const uploadsRef = useRef(uploads)

  useEffect(() => {
    uploadsRef.current = uploads
  }, [uploads])

  useEffect(() => {
    return () => {
      for (const view of Object.values(uploadsRef.current)) {
        for (const slot of Object.values(view)) {
          if (slot.previewUrl) URL.revokeObjectURL(slot.previewUrl)
        }
      }
    }
  }, [])

  const totalLoaded = useMemo(
    () =>
      Object.values(uploads).reduce(
        (count, view) => count + Number(Boolean(view.pre.file)) + Number(Boolean(view.post.file)),
        0,
      ),
    [uploads],
  )

  const completePairs = useMemo(
    () =>
      Object.values(uploads).reduce(
        (count, view) => count + Number(Boolean(view.pre.file) && Boolean(view.post.file)),
        0,
      ),
    [uploads],
  )

  const saxReady = Boolean(uploads.sax.pre.file && uploads.sax.post.file)

  const clearSaxAnalysis = () => {
    setSaxResult(null)
    setSaxError(null)
  }

  const handleFileSelect = (viewKey: ViewKey, contrastKey: ContrastKey, file: File | null) => {
    setUploads((current) => {
      const existing = current[viewKey][contrastKey]
      if (existing.previewUrl) URL.revokeObjectURL(existing.previewUrl)

      return {
        ...current,
        [viewKey]: {
          ...current[viewKey],
          [contrastKey]: file
            ? { file, previewUrl: URL.createObjectURL(file) }
            : { file: null, previewUrl: null },
        },
      }
    })

    if (viewKey === 'sax') clearSaxAnalysis()
  }

  const handleClearSlot = (viewKey: ViewKey, contrastKey: ContrastKey) => {
    handleFileSelect(viewKey, contrastKey, null)
  }

  const handleClearAll = () => {
    setUploads((current) => {
      for (const view of Object.values(current)) {
        for (const slot of Object.values(view)) {
          if (slot.previewUrl) URL.revokeObjectURL(slot.previewUrl)
        }
      }
      return createEmptyState()
    })
    clearSaxAnalysis()
  }

  const handleSaxControlChange = (key: SaxControlKey, value: string) => {
    setSaxControls((current) => ({ ...current, [key]: value }))
  }

  const handleRunSaxAssist = async () => {
    if (!uploads.sax.pre.file || !uploads.sax.post.file) return
    const token = getCmrSessionToken()
    if (!token) {
      setSaxError('CMR session not found. Sign in again to run analysis.')
      return
    }

    setSaxAnalysing(true)
    setSaxError(null)
    try {
      const result = await cmrAnalyseSaxPair(token, {
        preImage: uploads.sax.pre.file,
        postImage: uploads.sax.post.file,
        centerXPct: parseOrFallback(saxControls.centerXPct, 50),
        centerYPct: parseOrFallback(saxControls.centerYPct, 50),
        innerRadiusPct: parseOrFallback(saxControls.innerRadiusPct, 18),
        outerRadiusPct: parseOrFallback(saxControls.outerRadiusPct, 34),
        enhancementThreshold: parseOrFallback(saxControls.enhancementThreshold, 1.6),
      })
      setSaxResult(result)
      setSaxControls({
        centerXPct: String(result.roi.center_x_pct),
        centerYPct: String(result.roi.center_y_pct),
        innerRadiusPct: String(result.roi.inner_radius_pct),
        outerRadiusPct: String(result.roi.outer_radius_pct),
        enhancementThreshold: String(result.roi.enhancement_threshold),
      })
    } catch (error) {
      setSaxError(error instanceof Error ? error.message : 'SAX analysis failed')
    } finally {
      setSaxAnalysing(false)
    }
  }

  return (
    <Stack data-house-role="page" space="lg">
      <Row align="center" gap="md" wrap={false} className="house-page-title-row">
        <SectionMarker tone="report" size="title" className="self-stretch h-auto" />
        <PageHeader heading="Image analyser" className="!ml-0 !mt-0" />
      </Row>

      <section className="rounded-xl border border-border/50 bg-card p-5">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
          <div className="max-w-3xl">
            <p className="house-field-label">Supplementary Workspace</p>
            <h2 className="mt-2 text-2xl font-semibold tracking-tight text-foreground">
              Stage matched pre-contrast and post-contrast views separately from the manual LGE page.
            </h2>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-muted-foreground">
              Use this page to load paired screenshots or exported images for SAX, 2CH, 3CH, and 4CH.
              The existing LGE click model remains unchanged.
            </p>
          </div>

          <div className="grid gap-3 sm:grid-cols-2 xl:min-w-[20rem]">
            <MetricCard label="Images loaded" value={String(totalLoaded)} helper="of 8 slots populated" />
            <MetricCard label="Matched pairs" value={String(completePairs)} helper="views ready for later analysis" />
          </div>
        </div>

        <div className="mt-5 flex flex-wrap items-center gap-3">
          <Button
            type="button"
            variant="outline"
            onClick={handleClearAll}
            disabled={totalLoaded === 0}
            className="rounded-full"
          >
            Clear all uploads
          </Button>
          <span className="text-xs text-muted-foreground">
            This workspace is intentionally separate from the current LGE segmentation workflow.
          </span>
        </div>
      </section>

      <div className="flex flex-col gap-5">
        {VIEW_DEFS.map((view) => (
          <ViewCard
            key={view.key}
            view={view}
            slots={uploads[view.key]}
            onFileSelect={handleFileSelect}
            onClear={handleClearSlot}
          >
            {view.key === 'sax' ? (
              <div className="space-y-5">
                <div className="flex flex-col gap-3 xl:flex-row xl:items-start xl:justify-between">
                  <div className="max-w-3xl">
                    <p className="house-field-label">Experimental SAX Assist</p>
                    <h3 className="mt-2 text-lg font-semibold text-foreground">
                      Align the pre/post pair, define a myocardial annulus, and preview candidate enhancement.
                    </h3>
                    <p className="mt-2 text-sm leading-6 text-muted-foreground">
                      This first pass is threshold-assisted only. It does not change the manual LGE page and should be
                      reviewed as a supplementary overlay.
                    </p>
                  </div>

                  <Button
                    type="button"
                    onClick={handleRunSaxAssist}
                    disabled={!saxReady}
                    isLoading={saxAnalysing}
                    loadingText="Analysing..."
                    className="rounded-full"
                  >
                    Run SAX assist
                  </Button>
                </div>

                <div className="grid gap-6 xl:grid-cols-[minmax(0,24rem)_minmax(0,1fr)]">
                  <div className="space-y-5">
                    <div className="grid gap-3 sm:grid-cols-2">
                      {SAX_CONTROL_DEFS.map((field) => (
                        <label key={field.key} className="flex flex-col gap-1.5">
                          <span className="house-field-label">{field.label}</span>
                          <Input
                            type="text"
                            inputMode="decimal"
                            value={saxControls[field.key]}
                            onChange={(event) => handleSaxControlChange(field.key, event.target.value)}
                            className="h-10"
                          />
                          <span className="text-xs text-muted-foreground">{field.helper}</span>
                        </label>
                      ))}
                    </div>

                    {saxError && (
                      <div className="rounded-xl border border-[hsl(var(--tone-danger-300))] bg-[hsl(var(--tone-danger-50))] px-4 py-3 text-sm text-[hsl(var(--tone-danger-600))]">
                        {saxError}
                      </div>
                    )}

                    {saxResult ? (
                      <>
                        <div className="grid gap-3 sm:grid-cols-2">
                          <MetricCard
                            label="Confidence"
                            value={saxResult.metrics.confidence}
                            helper="threshold-assisted classification"
                          />
                          <MetricCard
                            label="Candidate burden"
                            value={`${saxResult.metrics.candidate_fraction_pct}%`}
                            helper="of the annular ROI"
                          />
                          <MetricCard
                            label="Registration shift"
                            value={`${saxResult.registration.shift_x_px}, ${saxResult.registration.shift_y_px}`}
                            helper="x,y pixels"
                          />
                          <MetricCard
                            label="Mean delta"
                            value={String(saxResult.metrics.mean_delta)}
                            helper="post-pre normalized signal change"
                          />
                        </div>

                        <div className="space-y-3">
                          <div>
                            <p className="house-field-label">Suggested sectors</p>
                            <div className="mt-2 flex flex-wrap gap-2">
                              {saxResult.suggested_sectors.length > 0 ? (
                                saxResult.suggested_sectors.map((sector) => (
                                  <span
                                    key={sector.label}
                                    className="rounded-full border border-border/50 bg-background px-3 py-1 text-xs font-medium text-foreground"
                                  >
                                    {sector.label} {sector.coverage_pct}%
                                  </span>
                                ))
                              ) : (
                                <span className="text-sm text-muted-foreground">No sector crossed the current threshold.</span>
                              )}
                            </div>
                          </div>

                          <div>
                            <p className="house-field-label">Notes</p>
                            <div className="mt-2 space-y-1">
                              {saxResult.notes.map((note) => (
                                <p key={note} className="text-sm text-muted-foreground">
                                  {note}
                                </p>
                              ))}
                            </div>
                          </div>
                        </div>
                      </>
                    ) : (
                      <div className="rounded-xl border border-border/40 bg-background/60 px-4 py-4 text-sm text-muted-foreground">
                        {saxReady
                          ? 'Load the paired SAX images, adjust the annulus if needed, and run the assist to generate aligned previews and an enhancement overlay.'
                          : 'Add both SAX images to enable the first-pass assist.'}
                      </div>
                    )}
                  </div>

                  <div>
                    {saxResult ? (
                      <div className="grid gap-4 md:grid-cols-2">
                        <AnalysisImagePanel title="Aligned pre-contrast" src={saxResult.images.aligned_pre} />
                        <AnalysisImagePanel title="Aligned post-contrast" src={saxResult.images.aligned_post} />
                        <AnalysisImagePanel title="Difference map" src={saxResult.images.difference_map} />
                        <AnalysisImagePanel title="Candidate overlay" src={saxResult.images.candidate_overlay} />
                      </div>
                    ) : (
                      <div className="flex h-full min-h-[22rem] items-center justify-center rounded-xl border border-dashed border-border/60 bg-[hsl(var(--tone-neutral-50)/0.4)] px-6 text-center text-sm text-muted-foreground">
                        SAX analysis output will appear here once the paired images are processed.
                      </div>
                    )}
                  </div>
                </div>
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">
                Analysis logic will extend to this view after the SAX workflow is validated.
              </p>
            )}
          </ViewCard>
        ))}
      </div>
    </Stack>
  )
}
