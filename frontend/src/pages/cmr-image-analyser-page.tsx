import { ImagePlus, Trash2 } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'

import { SectionMarker } from '@/components/patterns'
import { PageHeader, Row, Stack } from '@/components/primitives'
import { Button } from '@/components/ui'
import { cn } from '@/lib/utils'

type ViewKey = 'sax' | '2ch' | '3ch' | '4ch'
type ContrastKey = 'pre' | 'post'

type UploadSlotState = {
  file: File | null
  previewUrl: string | null
}

type ViewUploadState = Record<ContrastKey, UploadSlotState>
type UploadState = Record<ViewKey, ViewUploadState>

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

function createEmptyState(): UploadState {
  return {
    sax: { pre: { file: null, previewUrl: null }, post: { file: null, previewUrl: null } },
    '2ch': { pre: { file: null, previewUrl: null }, post: { file: null, previewUrl: null } },
    '3ch': { pre: { file: null, previewUrl: null }, post: { file: null, previewUrl: null } },
    '4ch': { pre: { file: null, previewUrl: null }, post: { file: null, previewUrl: null } },
  }
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
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
    <div className="rounded-xl border border-border/50 bg-background/80 p-4">
      <div className="mb-3 flex items-center justify-between gap-3">
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
            : 'border-border/60 bg-[hsl(var(--tone-neutral-50)/0.55)] hover:border-[hsl(var(--section-style-report-accent)/0.35)] hover:bg-[hsl(var(--tone-neutral-50)/0.8)]',
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
}: {
  view: { key: ViewKey; label: string; description: string }
  slots: ViewUploadState
  onFileSelect: (viewKey: ViewKey, contrastKey: ContrastKey, file: File | null) => void
  onClear: (viewKey: ViewKey, contrastKey: ContrastKey) => void
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

      <div className="grid gap-4 p-5 xl:grid-cols-2">
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
    </section>
  )
}

export function CmrImageAnalyserPage() {
  const [uploads, setUploads] = useState<UploadState>(() => createEmptyState())
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
            <div className="rounded-xl border border-border/40 bg-background/70 px-4 py-3">
              <p className="house-field-label">Images loaded</p>
              <p className="mt-2 text-3xl font-semibold text-foreground">{totalLoaded}</p>
              <p className="mt-1 text-sm text-muted-foreground">of 8 slots populated</p>
            </div>
            <div className="rounded-xl border border-border/40 bg-background/70 px-4 py-3">
              <p className="house-field-label">Matched pairs</p>
              <p className="mt-2 text-3xl font-semibold text-foreground">{completePairs}</p>
              <p className="mt-1 text-sm text-muted-foreground">views ready for later analysis</p>
            </div>
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
          />
        ))}
      </div>
    </Stack>
  )
}
