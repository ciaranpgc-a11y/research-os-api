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

type SaxRoiState = {
  centerXPct: number
  centerYPct: number
  innerRadiusPct: number
  outerRadiusPct: number
}

type DemoAssetDef = {
  path: string
  fileName: string
}

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

const DEMO_UPLOADS: Partial<Record<ViewKey, Partial<Record<ContrastKey, DemoAssetDef>>>> = {
  sax: {
    pre: { path: '/cmr-image-analyser-demo/sax-pre.png', fileName: 'demo-sax-pre.png' },
    post: { path: '/cmr-image-analyser-demo/sax-post.png', fileName: 'demo-sax-post.png' },
  },
  '4ch': {
    pre: { path: '/cmr-image-analyser-demo/4ch-pre.png', fileName: 'demo-4ch-pre.png' },
    post: { path: '/cmr-image-analyser-demo/4ch-post.png', fileName: 'demo-4ch-post.png' },
  },
  '3ch': {
    post: { path: '/cmr-image-analyser-demo/3ch-post.png', fileName: 'demo-3ch-lge.png' },
  },
  '2ch': {
    post: { path: '/cmr-image-analyser-demo/2ch-post.png', fileName: 'demo-2ch-lge.png' },
  },
}

function createEmptyState(): UploadState {
  return {
    sax: { pre: { file: null, previewUrl: null }, post: { file: null, previewUrl: null } },
    '2ch': { pre: { file: null, previewUrl: null }, post: { file: null, previewUrl: null } },
    '3ch': { pre: { file: null, previewUrl: null }, post: { file: null, previewUrl: null } },
    '4ch': { pre: { file: null, previewUrl: null }, post: { file: null, previewUrl: null } },
  }
}

function createDefaultSaxRoi(): SaxRoiState {
  return {
    centerXPct: 50,
    centerYPct: 50,
    innerRadiusPct: 18,
    outerRadiusPct: 34,
  }
}

function revokeUploadUrls(state: UploadState): void {
  for (const view of Object.values(state)) {
    for (const slot of Object.values(view)) {
      if (slot.previewUrl) URL.revokeObjectURL(slot.previewUrl)
    }
  }
}

async function createFileFromDemoAsset(asset: DemoAssetDef): Promise<File> {
  const response = await fetch(asset.path)
  if (!response.ok) {
    throw new Error(`Failed to load demo asset: ${asset.fileName}`)
  }
  const blob = await response.blob()
  return new File([blob], asset.fileName, { type: blob.type || 'image/png' })
}

async function buildDemoUploadState(): Promise<UploadState> {
  const nextState = createEmptyState()
  const tasks: Promise<void>[] = []

  for (const [viewKey, contrastEntries] of Object.entries(DEMO_UPLOADS) as Array<
    [ViewKey, Partial<Record<ContrastKey, DemoAssetDef>>]
  >) {
    for (const [contrastKey, asset] of Object.entries(contrastEntries) as Array<
      [ContrastKey, DemoAssetDef]
    >) {
      tasks.push(
        (async () => {
          const file = await createFileFromDemoAsset(asset)
          nextState[viewKey][contrastKey] = {
            file,
            previewUrl: URL.createObjectURL(file),
          }
        })(),
      )
    }
  }

  await Promise.all(tasks)
  return nextState
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

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value))
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

function SaxRoiSelector({
  src,
  roi,
  onChange,
  onReset,
}: {
  src: string
  roi: SaxRoiState
  onChange: (next: SaxRoiState) => void
  onReset: () => void
}) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [dragMode, setDragMode] = useState<'move' | 'inner' | 'outer' | null>(null)

  const updateFromPointer = useMemo(
    () => (clientX: number, clientY: number, mode: 'move' | 'inner' | 'outer') => {
      const rect = containerRef.current?.getBoundingClientRect()
      if (!rect || rect.width === 0 || rect.height === 0) return

      const pointerXPct = clamp(((clientX - rect.left) / rect.width) * 100, 0, 100)
      const pointerYPct = clamp(((clientY - rect.top) / rect.height) * 100, 0, 100)

      if (mode === 'move') {
        onChange({
          ...roi,
          centerXPct: clamp(pointerXPct, 25, 75),
          centerYPct: clamp(pointerYPct, 25, 75),
        })
        return
      }

      const dxPx = clientX - (rect.left + (roi.centerXPct / 100) * rect.width)
      const dyPx = clientY - (rect.top + (roi.centerYPct / 100) * rect.height)
      const radiusPct = (Math.sqrt(dxPx * dxPx + dyPx * dyPx) / Math.min(rect.width, rect.height)) * 100

      if (mode === 'inner') {
        onChange({
          ...roi,
          innerRadiusPct: clamp(radiusPct, 6, roi.outerRadiusPct - 4),
        })
        return
      }

      onChange({
        ...roi,
        outerRadiusPct: clamp(radiusPct, roi.innerRadiusPct + 4, 48),
      })
    },
    [onChange, roi],
  )

  useEffect(() => {
    if (!dragMode) return

    const handlePointerMove = (event: PointerEvent) => {
      updateFromPointer(event.clientX, event.clientY, dragMode)
    }
    const handlePointerUp = () => {
      setDragMode(null)
    }

    window.addEventListener('pointermove', handlePointerMove)
    window.addEventListener('pointerup', handlePointerUp)
    return () => {
      window.removeEventListener('pointermove', handlePointerMove)
      window.removeEventListener('pointerup', handlePointerUp)
    }
  }, [dragMode, updateFromPointer])

  const outerHandleX = roi.centerXPct + roi.outerRadiusPct
  const innerHandleX = roi.centerXPct + roi.innerRadiusPct

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="house-field-label">ROI selector</p>
          <p className="mt-1 text-sm text-muted-foreground">
            Drag the centre point or the ring handles to define the myocardial annulus visually.
          </p>
        </div>
        <Button type="button" variant="outline" onClick={onReset} className="rounded-full">
          Reset ROI
        </Button>
      </div>

      <div className="rounded-xl border border-border/40 bg-background/65 p-4">
        <div className="mx-auto w-fit">
          <div ref={containerRef} className="relative inline-block overflow-hidden rounded-xl border border-border/50 bg-card">
            <img src={src} alt="SAX ROI selector" className="block max-h-[28rem] w-auto max-w-full object-contain" />

            <svg
              className={cn('absolute inset-0 h-full w-full touch-none', dragMode && 'cursor-grabbing')}
              viewBox="0 0 100 100"
              preserveAspectRatio="none"
              onPointerDown={(event) => {
                if (event.target !== event.currentTarget) return
                setDragMode('move')
                updateFromPointer(event.clientX, event.clientY, 'move')
              }}
            >
              <defs>
                <mask id="cmr-sax-roi-mask">
                  <rect x="0" y="0" width="100" height="100" fill="white" />
                  <circle cx={roi.centerXPct} cy={roi.centerYPct} r={roi.outerRadiusPct} fill="black" />
                  <circle cx={roi.centerXPct} cy={roi.centerYPct} r={roi.innerRadiusPct} fill="white" />
                </mask>
              </defs>

              <rect x="0" y="0" width="100" height="100" fill="rgba(15, 23, 42, 0.18)" mask="url(#cmr-sax-roi-mask)" />
              <circle
                cx={roi.centerXPct}
                cy={roi.centerYPct}
                r={roi.outerRadiusPct}
                fill="transparent"
                stroke="rgba(199, 77, 77, 0.9)"
                strokeWidth="0.7"
              />
              <circle
                cx={roi.centerXPct}
                cy={roi.centerYPct}
                r={roi.innerRadiusPct}
                fill="transparent"
                stroke="rgba(214, 160, 84, 0.95)"
                strokeWidth="0.7"
              />
              <line
                x1={roi.centerXPct}
                y1={roi.centerYPct}
                x2={roi.centerXPct + roi.outerRadiusPct}
                y2={roi.centerYPct}
                stroke="rgba(199, 77, 77, 0.55)"
                strokeDasharray="1.5 1.5"
                strokeWidth="0.45"
              />
              <line
                x1={roi.centerXPct}
                y1={roi.centerYPct}
                x2={roi.centerXPct + roi.innerRadiusPct}
                y2={roi.centerYPct}
                stroke="rgba(214, 160, 84, 0.65)"
                strokeDasharray="1.5 1.5"
                strokeWidth="0.45"
              />

              <circle
                cx={roi.centerXPct}
                cy={roi.centerYPct}
                r="1.25"
                fill="white"
                stroke="rgba(15, 23, 42, 0.85)"
                strokeWidth="0.5"
                className="cursor-grab"
                onPointerDown={(event) => {
                  event.stopPropagation()
                  setDragMode('move')
                }}
              />
              <circle
                cx={innerHandleX}
                cy={roi.centerYPct}
                r="1.2"
                fill="rgba(214, 160, 84, 1)"
                stroke="white"
                strokeWidth="0.55"
                className="cursor-ew-resize"
                onPointerDown={(event) => {
                  event.stopPropagation()
                  setDragMode('inner')
                }}
              />
              <circle
                cx={outerHandleX}
                cy={roi.centerYPct}
                r="1.25"
                fill="rgba(199, 77, 77, 1)"
                stroke="white"
                strokeWidth="0.55"
                className="cursor-ew-resize"
                onPointerDown={(event) => {
                  event.stopPropagation()
                  setDragMode('outer')
                }}
              />
            </svg>
          </div>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <div className="rounded-xl border border-border/40 bg-background/65 px-4 py-3">
          <p className="house-field-label">Centre</p>
          <p className="mt-2 text-sm font-medium text-foreground">
            {roi.centerXPct.toFixed(1)}% x · {roi.centerYPct.toFixed(1)}% y
          </p>
        </div>
        <div className="rounded-xl border border-border/40 bg-background/65 px-4 py-3">
          <p className="house-field-label">Inner radius</p>
          <p className="mt-2 text-sm font-medium text-foreground">{roi.innerRadiusPct.toFixed(1)}% of frame</p>
        </div>
        <div className="rounded-xl border border-border/40 bg-background/65 px-4 py-3">
          <p className="house-field-label">Outer radius</p>
          <p className="mt-2 text-sm font-medium text-foreground">{roi.outerRadiusPct.toFixed(1)}% of frame</p>
        </div>
      </div>
    </div>
  )
}

export function CmrImageAnalyserPage() {
  const [uploads, setUploads] = useState<UploadState>(() => createEmptyState())
  const [saxRoi, setSaxRoi] = useState<SaxRoiState>(() => createDefaultSaxRoi())
  const [saxThreshold, setSaxThreshold] = useState('1.6')
  const [showAdvancedSaxControls, setShowAdvancedSaxControls] = useState(false)
  const [loadingDemoImages, setLoadingDemoImages] = useState(false)
  const [demoLoadError, setDemoLoadError] = useState<string | null>(null)
  const [saxResult, setSaxResult] = useState<CmrSaxAssistResult | null>(null)
  const [saxError, setSaxError] = useState<string | null>(null)
  const [saxAnalysing, setSaxAnalysing] = useState(false)
  const uploadsRef = useRef(uploads)

  useEffect(() => {
    uploadsRef.current = uploads
  }, [uploads])

  useEffect(() => {
    return () => {
      revokeUploadUrls(uploadsRef.current)
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
    setDemoLoadError(null)
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
    setDemoLoadError(null)
    setUploads((current) => {
      revokeUploadUrls(current)
      return createEmptyState()
    })
    clearSaxAnalysis()
    setSaxRoi(createDefaultSaxRoi())
    setSaxThreshold('1.6')
  }

  const handleLoadDemoImages = async () => {
    setLoadingDemoImages(true)
    setDemoLoadError(null)

    try {
      const demoState = await buildDemoUploadState()
      setUploads((current) => {
        revokeUploadUrls(current)
        return demoState
      })
      clearSaxAnalysis()
      setSaxRoi(createDefaultSaxRoi())
      setSaxThreshold('1.6')
    } catch (error) {
      setDemoLoadError(error instanceof Error ? error.message : 'Failed to load demo images')
    } finally {
      setLoadingDemoImages(false)
    }
  }

  const handleSaxRoiChange = (next: SaxRoiState) => {
    setSaxRoi(next)
    clearSaxAnalysis()
  }

  const handleResetSaxRoi = () => {
    setSaxRoi(createDefaultSaxRoi())
    clearSaxAnalysis()
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
        centerXPct: saxRoi.centerXPct,
        centerYPct: saxRoi.centerYPct,
        innerRadiusPct: saxRoi.innerRadiusPct,
        outerRadiusPct: saxRoi.outerRadiusPct,
        enhancementThreshold: parseOrFallback(saxThreshold, 1.6),
      })
      setSaxResult(result)
      setSaxRoi({
        centerXPct: result.roi.center_x_pct,
        centerYPct: result.roi.center_y_pct,
        innerRadiusPct: result.roi.inner_radius_pct,
        outerRadiusPct: result.roi.outer_radius_pct,
      })
      setSaxThreshold(String(result.roi.enhancement_threshold))
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
            onClick={handleLoadDemoImages}
            isLoading={loadingDemoImages}
            loadingText="Loading demos..."
            className="rounded-full"
          >
            Load demo images
          </Button>
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
            Loads one true SAX pre/post demo pair plus representative long-axis open-access examples.
          </span>
        </div>

        {demoLoadError && (
          <div className="mt-4 rounded-xl border border-[hsl(var(--tone-danger-300))] bg-[hsl(var(--tone-danger-50))] px-4 py-3 text-sm text-[hsl(var(--tone-danger-600))]">
            {demoLoadError}
          </div>
        )}
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
                    {uploads.sax.pre.previewUrl || uploads.sax.post.previewUrl ? (
                      <SaxRoiSelector
                        src={uploads.sax.pre.previewUrl ?? uploads.sax.post.previewUrl ?? ''}
                        roi={saxRoi}
                        onChange={handleSaxRoiChange}
                        onReset={handleResetSaxRoi}
                      />
                    ) : (
                      <div className="rounded-xl border border-dashed border-border/60 bg-[hsl(var(--tone-neutral-50)/0.4)] px-4 py-5 text-sm text-muted-foreground">
                        Add a SAX image to place the myocardial ROI visually.
                      </div>
                    )}

                    <div className="rounded-xl border border-border/40 bg-background/60">
                      <button
                        type="button"
                        onClick={() => setShowAdvancedSaxControls((current) => !current)}
                        className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left"
                      >
                        <div>
                          <p className="house-field-label">Advanced</p>
                          <p className="mt-1 text-sm text-muted-foreground">
                            Threshold sensitivity is the only manual tuning field kept visible.
                          </p>
                        </div>
                        <span className="text-xs font-medium uppercase tracking-[0.08em] text-muted-foreground">
                          {showAdvancedSaxControls ? 'Hide' : 'Show'}
                        </span>
                      </button>

                      {showAdvancedSaxControls && (
                        <div className="border-t border-border/30 px-4 py-4">
                          <label className="flex max-w-[14rem] flex-col gap-1.5">
                            <span className="house-field-label">Threshold</span>
                            <Input
                              type="text"
                              inputMode="decimal"
                              value={saxThreshold}
                              onChange={(event) => {
                                setSaxThreshold(event.target.value)
                                clearSaxAnalysis()
                              }}
                              className="h-10"
                            />
                            <span className="text-xs text-muted-foreground">
                              Higher values are stricter; lower values highlight more candidate enhancement.
                            </span>
                          </label>
                        </div>
                      )}
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
