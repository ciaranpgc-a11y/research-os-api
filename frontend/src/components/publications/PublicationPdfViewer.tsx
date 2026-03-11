import { useEffect, useMemo, useRef, useState } from 'react'
import { ArrowUpRight, ChevronLeft, ChevronRight, Loader2, Minus, Plus, RotateCcw } from 'lucide-react'
import { getDocument, GlobalWorkerOptions, type PDFDocumentProxy } from 'pdfjs-dist'
import pdfWorkerSrc from 'pdfjs-dist/build/pdf.worker.min.mjs?url'

import { Button } from '@/components/ui'
import { API_BASE_URL } from '@/lib/api'
import { getAuthAccountKeyHint } from '@/lib/auth-session'
import { cn } from '@/lib/utils'

GlobalWorkerOptions.workerSrc = pdfWorkerSrc

const MIN_ZOOM_PERCENT = 60
const MAX_ZOOM_PERCENT = 240
const ZOOM_STEP_PERCENT = 10

type PublicationPdfViewerProps = {
  token: string
  publicationId: string
  fileId: string
  title: string
  className?: string
  targetPage?: number | null
  onPageChange?: ((page: number, pageCount: number) => void) | null
  onOpenExternal?: (() => void) | null
}

function buildPublicationFileContentUrl(publicationId: string, fileId: string): string {
  return `${API_BASE_URL}/v1/publications/${encodeURIComponent(publicationId)}/files/${encodeURIComponent(fileId)}/content`
}

function buildPublicationPdfHeaders(token: string): Record<string, string> {
  const clean = String(token || '').trim()
  const headers: Record<string, string> = {}
  const accountKeyHint = getAuthAccountKeyHint()
  if (accountKeyHint) {
    headers['X-AAWE-Account-Key'] = accountKeyHint
  }
  if (clean) {
    headers.Authorization = `Bearer ${clean}`
  }
  return headers
}

function clampPage(value: number, pageCount: number): number {
  if (!Number.isFinite(value)) {
    return 1
  }
  return Math.max(1, Math.min(pageCount, Math.round(value)))
}

function clampZoom(value: number): number {
  if (!Number.isFinite(value)) {
    return 100
  }
  return Math.max(MIN_ZOOM_PERCENT, Math.min(MAX_ZOOM_PERCENT, Math.round(value)))
}

export function PublicationPdfViewer({
  token,
  publicationId,
  fileId,
  title,
  className,
  targetPage = null,
  onPageChange = null,
  onOpenExternal,
}: PublicationPdfViewerProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const frameRef = useRef<HTMLDivElement | null>(null)
  const documentRef = useRef<PDFDocumentProxy | null>(null)
  const [documentProxy, setDocumentProxy] = useState<PDFDocumentProxy | null>(null)
  const [loadingDocument, setLoadingDocument] = useState(false)
  const [renderingPage, setRenderingPage] = useState(false)
  const [error, setError] = useState('')
  const [pageCount, setPageCount] = useState(0)
  const [currentPage, setCurrentPage] = useState(1)
  const [pageDraft, setPageDraft] = useState('1')
  const [fitWidth, setFitWidth] = useState(true)
  const [manualZoomPercent, setManualZoomPercent] = useState(110)
  const [effectiveZoomPercent, setEffectiveZoomPercent] = useState(100)
  const [frameWidth, setFrameWidth] = useState(0)

  const contentUrl = useMemo(
    () => buildPublicationFileContentUrl(publicationId, fileId),
    [fileId, publicationId],
  )

  useEffect(() => {
    setPageDraft(String(currentPage))
  }, [currentPage])

  useEffect(() => {
    if (!pageCount || !Number.isFinite(targetPage)) {
      return
    }
    const nextPage = clampPage(Number(targetPage), pageCount)
    setCurrentPage((current) => (current === nextPage ? current : nextPage))
  }, [pageCount, targetPage])

  useEffect(() => {
    if (!onPageChange || !pageCount) {
      return
    }
    onPageChange(currentPage, pageCount)
  }, [currentPage, onPageChange, pageCount])

  useEffect(() => {
    const node = frameRef.current
    if (!node || typeof ResizeObserver === 'undefined') {
      return
    }
    const observer = new ResizeObserver((entries) => {
      const nextWidth = entries[0]?.contentRect.width ?? node.clientWidth
      setFrameWidth(nextWidth)
    })
    observer.observe(node)
    setFrameWidth(node.clientWidth)
    return () => observer.disconnect()
  }, [])

  useEffect(() => {
    let cancelled = false
    const abortController = new AbortController()
    const previousDocument = documentRef.current
    documentRef.current = null
    setDocumentProxy(null)
    setPageCount(0)
    setError('')
    setLoadingDocument(true)
    setCurrentPage(1)
    if (previousDocument) {
      void previousDocument.destroy()
    }

    const loadingTaskPromise = (async () => {
      try {
        const response = await fetch(contentUrl, {
          method: 'GET',
          headers: buildPublicationPdfHeaders(token),
          signal: abortController.signal,
        })
        if (!response.ok) {
          throw new Error('Could not load PDF bytes for the in-app viewer.')
        }
        const bytes = new Uint8Array(await response.arrayBuffer())
        const loadingTask = getDocument({ data: bytes })
        const nextDocument = await loadingTask.promise
        if (cancelled) {
          void loadingTask.destroy()
          void nextDocument.destroy()
          return
        }
        documentRef.current = nextDocument
        setDocumentProxy(nextDocument)
        setPageCount(nextDocument.numPages)
        setCurrentPage((current) => clampPage(current, nextDocument.numPages))
      } catch (loadError) {
        if (cancelled || abortController.signal.aborted) {
          return
        }
        setError(
          loadError instanceof Error
            ? loadError.message
            : 'Could not load this PDF into the in-app viewer.',
        )
      } finally {
        if (!cancelled) {
          setLoadingDocument(false)
        }
      }
    })()

    return () => {
      cancelled = true
      abortController.abort()
      void loadingTaskPromise
      const currentDocument = documentRef.current
      documentRef.current = null
      if (currentDocument) {
        void currentDocument.destroy()
      }
    }
  }, [contentUrl, token])

  useEffect(() => {
    const pdfDocument = documentProxy
    const canvas = canvasRef.current
    if (!pdfDocument || !canvas) {
      return
    }

    let cancelled = false
    let renderTask: { cancel: () => void; promise: Promise<unknown> } | null = null

    const renderPage = async () => {
      setRenderingPage(true)
      try {
        const page = await pdfDocument.getPage(clampPage(currentPage, pdfDocument.numPages))
        if (cancelled) {
          return
        }
        const baseViewport = page.getViewport({ scale: 1 })
        const availableWidth = Math.max(320, frameWidth - 32)
        const fitScale = availableWidth > 0 ? availableWidth / baseViewport.width : 1
        const effectiveScale = fitWidth ? fitScale : manualZoomPercent / 100
        const viewport = page.getViewport({ scale: effectiveScale })
        const outputScale = typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1
        const context = canvas.getContext('2d')
        if (!context) {
          throw new Error('Canvas context is unavailable for PDF rendering.')
        }
        canvas.width = Math.floor(viewport.width * outputScale)
        canvas.height = Math.floor(viewport.height * outputScale)
        canvas.style.width = `${viewport.width}px`
        canvas.style.height = `${viewport.height}px`
        context.setTransform(outputScale, 0, 0, outputScale, 0, 0)
        context.clearRect(0, 0, viewport.width, viewport.height)
        renderTask = page.render({ canvas, canvasContext: context, viewport })
        await renderTask.promise
        if (!cancelled) {
          setEffectiveZoomPercent(Math.round(effectiveScale * 100))
        }
      } catch (renderError) {
        if (cancelled) {
          return
        }
        const message =
          renderError instanceof Error
            ? renderError.message
            : 'Could not render this PDF page in the in-app viewer.'
        setError(message)
      } finally {
        if (!cancelled) {
          setRenderingPage(false)
        }
      }
    }

    void renderPage()

    return () => {
      cancelled = true
      if (renderTask) {
        try {
          renderTask.cancel()
        } catch {
          // Swallow cancellation noise from rapid page changes.
        }
      }
    }
  }, [currentPage, documentProxy, fitWidth, frameWidth, manualZoomPercent])

  const canGoBackward = currentPage > 1
  const canGoForward = pageCount > 0 && currentPage < pageCount
  const busy = loadingDocument || renderingPage

  const commitPageDraft = () => {
    if (!pageCount) {
      setPageDraft('1')
      return
    }
    const nextPage = clampPage(Number(pageDraft), pageCount)
    setCurrentPage(nextPage)
    setPageDraft(String(nextPage))
  }

  const nudgeZoom = (delta: number) => {
    const base = fitWidth ? effectiveZoomPercent : manualZoomPercent
    setFitWidth(false)
    setManualZoomPercent(clampZoom(base + delta))
  }

  return (
    <div className={cn('flex h-full min-h-0 flex-col gap-4', className)}>
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-[1.1rem] border border-[hsl(var(--tone-neutral-200))] bg-[hsl(var(--tone-neutral-50)/0.96)] px-4 py-3 shadow-[0_12px_30px_hsl(var(--tone-neutral-900)/0.05)]">
        <div className="flex flex-wrap items-center gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="rounded-full"
            disabled={!canGoBackward || busy}
            onClick={() => setCurrentPage((current) => Math.max(1, current - 1))}
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <div className="inline-flex items-center gap-2 rounded-full border border-[hsl(var(--tone-neutral-300))] bg-white px-3 py-1.5 text-sm text-[hsl(var(--tone-neutral-700))]">
            <span className="text-[0.72rem] font-semibold uppercase tracking-[0.08em] text-[hsl(var(--tone-neutral-500))]">
              Page
            </span>
            <input
              value={pageDraft}
              onChange={(event) => setPageDraft(event.target.value.replace(/[^\d]/g, '').slice(0, 4) || '1')}
              onBlur={commitPageDraft}
              onKeyDown={(event) => {
                if (event.key === 'Enter') {
                  event.preventDefault()
                  commitPageDraft()
                }
              }}
              className="w-12 border-0 bg-transparent text-center font-medium text-[hsl(var(--tone-neutral-900))] outline-none"
              inputMode="numeric"
              aria-label="Current PDF page"
            />
            <span className="text-[hsl(var(--tone-neutral-500))]">/ {pageCount || '--'}</span>
          </div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="rounded-full"
            disabled={!canGoForward || busy}
            onClick={() => setCurrentPage((current) => Math.min(pageCount, current + 1))}
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            className={cn(
              'rounded-full',
              fitWidth && 'border-[hsl(var(--tone-accent-300))] bg-[hsl(var(--tone-accent-50))] text-[hsl(var(--tone-accent-800))]',
            )}
            onClick={() => setFitWidth(true)}
          >
            Fit width
          </Button>
          <Button
            type="button"
            variant="outline"
            size="icon"
            className="h-9 w-9 rounded-full"
            disabled={busy}
            onClick={() => nudgeZoom(-ZOOM_STEP_PERCENT)}
          >
            <Minus className="h-4 w-4" />
          </Button>
          <div className="min-w-[5.2rem] rounded-full border border-[hsl(var(--tone-neutral-300))] bg-white px-3 py-1.5 text-center text-sm font-medium text-[hsl(var(--tone-neutral-900))]">
            {fitWidth ? 'Fit width' : `${effectiveZoomPercent}%`}
          </div>
          <Button
            type="button"
            variant="outline"
            size="icon"
            className="h-9 w-9 rounded-full"
            disabled={busy}
            onClick={() => nudgeZoom(ZOOM_STEP_PERCENT)}
          >
            <Plus className="h-4 w-4" />
          </Button>
          <Button
            type="button"
            variant="outline"
            size="icon"
            className="h-9 w-9 rounded-full"
            disabled={busy}
            onClick={() => {
              setCurrentPage(1)
              setPageDraft('1')
              setFitWidth(true)
              setManualZoomPercent(110)
            }}
          >
            <RotateCcw className="h-4 w-4" />
          </Button>
          {onOpenExternal ? (
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="gap-2 rounded-full"
              onClick={onOpenExternal}
            >
              <ArrowUpRight className="h-4 w-4" />
              <span>Open PDF</span>
            </Button>
          ) : null}
        </div>
      </div>

      <div
        ref={frameRef}
        className="relative min-h-0 flex-1 overflow-auto rounded-[1.25rem] border border-[hsl(var(--tone-neutral-300))] bg-[linear-gradient(180deg,hsl(var(--tone-neutral-900)/0.04)_0%,hsl(var(--tone-neutral-900)/0.08)_100%)] shadow-[0_22px_60px_hsl(var(--tone-neutral-900)/0.12)]"
      >
        <div className="flex min-h-full items-start justify-center px-4 py-5">
          <canvas
            ref={canvasRef}
            className="max-w-full rounded-[0.9rem] bg-white shadow-[0_16px_38px_hsl(var(--tone-neutral-900)/0.16)]"
          />
        </div>

        {busy ? (
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center bg-[hsl(var(--tone-neutral-50)/0.58)] backdrop-blur-[1px]">
            <div className="flex items-center gap-3 rounded-full border border-[hsl(var(--tone-neutral-200))] bg-white px-4 py-2 text-sm text-[hsl(var(--tone-neutral-700))] shadow-[0_10px_24px_hsl(var(--tone-neutral-900)/0.08)]">
              <Loader2 className="h-4 w-4 animate-spin" />
              <span>{loadingDocument ? 'Loading PDF...' : 'Rendering page...'}</span>
            </div>
          </div>
        ) : null}

        {error ? (
          <div className="absolute inset-0 flex items-center justify-center p-6">
            <div className="max-w-lg rounded-[1.1rem] border border-[hsl(var(--tone-danger-200))] bg-[hsl(var(--tone-danger-50))] px-5 py-5 text-center shadow-[0_12px_30px_hsl(var(--tone-neutral-900)/0.06)]">
              <p className="text-base font-medium text-[hsl(var(--tone-danger-900))]">
                The in-app PDF viewer could not open this paper.
              </p>
              <p className="mt-2 text-sm leading-relaxed text-[hsl(var(--tone-danger-800))]">
                {error}
              </p>
              <p className="mt-2 text-sm leading-relaxed text-[hsl(var(--tone-neutral-700))]">
                This can happen when the source host blocks inline retrieval. You can still open the PDF directly.
              </p>
              {onOpenExternal ? (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="mt-4 gap-2 rounded-full"
                  onClick={onOpenExternal}
                >
                  <ArrowUpRight className="h-4 w-4" />
                  <span>Open {title}</span>
                </Button>
              ) : null}
            </div>
          </div>
        ) : null}
      </div>
    </div>
  )
}

export default PublicationPdfViewer
