import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { ArrowUpRight, Loader2, Minus, Plus, RotateCcw } from 'lucide-react'
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

type PublicationPdfPageMetric = {
  pageNumber: number
  width: number
  height: number
}

type PublicationPdfCanvasPageProps = {
  pdfDocument: PDFDocumentProxy
  pageNumber: number
  displayWidth: number
  displayHeight: number
  scale: number
  onRenderingChange?: ((pageNumber: number, rendering: boolean) => void) | null
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

function buildFallbackPublicationPdfPageMetrics(
  pageCount: number,
  width: number,
  height: number,
): PublicationPdfPageMetric[] {
  return Array.from({ length: pageCount }, (_, index) => ({
    pageNumber: index + 1,
    width,
    height,
  }))
}

function PublicationPdfCanvasPage({
  pdfDocument,
  pageNumber,
  displayWidth,
  displayHeight,
  scale,
  onRenderingChange,
}: PublicationPdfCanvasPageProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const [pageError, setPageError] = useState('')

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) {
      return
    }

    let cancelled = false
    let renderTask: { cancel: () => void; promise: Promise<unknown> } | null = null

    const renderPage = async () => {
      onRenderingChange?.(pageNumber, true)
      try {
        const page = await pdfDocument.getPage(pageNumber)
        if (cancelled) {
          return
        }
        const viewport = page.getViewport({ scale })
        const outputScale = typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1
        const context = canvas.getContext('2d')
        if (!context) {
          throw new Error('Canvas context is unavailable for PDF rendering.')
        }
        canvas.width = Math.floor(viewport.width * outputScale)
        canvas.height = Math.floor(viewport.height * outputScale)
        canvas.style.width = `${displayWidth}px`
        canvas.style.height = `${displayHeight}px`
        context.setTransform(outputScale, 0, 0, outputScale, 0, 0)
        context.clearRect(0, 0, viewport.width, viewport.height)
        renderTask = page.render({ canvas, canvasContext: context, viewport })
        await renderTask.promise
        if (!cancelled) {
          setPageError('')
        }
      } catch (renderError) {
        if (cancelled) {
          return
        }
        setPageError(
          renderError instanceof Error
            ? renderError.message
            : `Could not render page ${pageNumber}.`,
        )
      } finally {
        if (!cancelled) {
          onRenderingChange?.(pageNumber, false)
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
          // Swallow cancellation noise from rapid zoom changes.
        }
      }
      onRenderingChange?.(pageNumber, false)
    }
  }, [displayHeight, displayWidth, onRenderingChange, pageNumber, pdfDocument, scale])

  return (
    <>
      <canvas
        ref={canvasRef}
        className="block rounded-[0.9rem] bg-white"
        style={{ width: `${displayWidth}px`, height: `${displayHeight}px` }}
      />
      {pageError ? (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center rounded-[0.9rem] bg-[hsl(var(--tone-danger-50)/0.92)] px-5 py-4 text-center">
          <p className="max-w-xs text-sm leading-relaxed text-[hsl(var(--tone-danger-800))]">
            {pageError}
          </p>
        </div>
      ) : null}
    </>
  )
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
  const frameRef = useRef<HTMLDivElement | null>(null)
  const documentRef = useRef<PDFDocumentProxy | null>(null)
  const pageRefs = useRef<Record<number, HTMLDivElement | null>>({})
  const documentMetricsTaskRef = useRef<Promise<void> | null>(null)
  const [documentProxy, setDocumentProxy] = useState<PDFDocumentProxy | null>(null)
  const [loadingDocument, setLoadingDocument] = useState(false)
  const [error, setError] = useState('')
  const [pageCount, setPageCount] = useState(0)
  const [pageMetrics, setPageMetrics] = useState<PublicationPdfPageMetric[]>([])
  const [currentPage, setCurrentPage] = useState(1)
  const [fitWidth, setFitWidth] = useState(true)
  const [manualZoomPercent, setManualZoomPercent] = useState(110)
  const [frameWidth, setFrameWidth] = useState(0)
  const [renderingPages, setRenderingPages] = useState<Record<number, boolean>>({})

  const contentUrl = useMemo(
    () => buildPublicationFileContentUrl(publicationId, fileId),
    [fileId, publicationId],
  )

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
    documentMetricsTaskRef.current = null
    setDocumentProxy(null)
    setPageCount(0)
    setPageMetrics([])
    setRenderingPages({})
    setError('')
    setLoadingDocument(true)
    setCurrentPage(1)
    if (previousDocument) {
      void previousDocument.destroy()
    }

    const loadDocumentPromise = (async () => {
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

        const firstPage = await nextDocument.getPage(1)
        const firstViewport = firstPage.getViewport({ scale: 1 })
        const fallbackMetrics = buildFallbackPublicationPdfPageMetrics(
          nextDocument.numPages,
          firstViewport.width,
          firstViewport.height,
        )

        documentRef.current = nextDocument
        setDocumentProxy(nextDocument)
        setPageCount(nextDocument.numPages)
        setPageMetrics(fallbackMetrics)
        setCurrentPage((current) => clampPage(current, nextDocument.numPages))
        setLoadingDocument(false)

        documentMetricsTaskRef.current = (async () => {
          try {
            const resolvedMetrics: PublicationPdfPageMetric[] = []
            for (let pageNumber = 1; pageNumber <= nextDocument.numPages; pageNumber += 1) {
              const page = pageNumber === 1 ? firstPage : await nextDocument.getPage(pageNumber)
              const viewport = page.getViewport({ scale: 1 })
              resolvedMetrics.push({
                pageNumber,
                width: viewport.width,
                height: viewport.height,
              })
            }
            if (!cancelled) {
              setPageMetrics(resolvedMetrics)
            }
          } catch {
            // Keep using the first-page fallback sizes if per-page metrics fail to resolve.
          }
        })()
      } catch (loadError) {
        if (cancelled || abortController.signal.aborted) {
          return
        }
        setError(
          loadError instanceof Error
            ? loadError.message
            : 'Could not load this PDF into the in-app viewer.',
        )
        setLoadingDocument(false)
      }
    })()

    return () => {
      cancelled = true
      abortController.abort()
      void loadDocumentPromise
      void documentMetricsTaskRef.current
      const currentDocument = documentRef.current
      documentRef.current = null
      if (currentDocument) {
        void currentDocument.destroy()
      }
    }
  }, [contentUrl, token])

  const availableWidth = Math.max(320, frameWidth - 32)

  const pageLayouts = useMemo(() => (
    pageMetrics.map((metric) => {
      const scale = fitWidth ? availableWidth / metric.width : manualZoomPercent / 100
      return {
        ...metric,
        scale,
        displayWidth: metric.width * scale,
        displayHeight: metric.height * scale,
        zoomPercent: Math.round(scale * 100),
      }
    })
  ), [availableWidth, fitWidth, manualZoomPercent, pageMetrics])

  const currentPageLayout = pageLayouts.find((layout) => layout.pageNumber === currentPage) || pageLayouts[0] || null
  const effectiveZoomPercent = fitWidth
    ? currentPageLayout?.zoomPercent ?? 100
    : manualZoomPercent

  const renderingPageCount = Object.keys(renderingPages).length
  const navigationDisabled = loadingDocument || !pageCount

  const scrollToPage = useCallback((pageNumber: number, behavior: ScrollBehavior = 'smooth'): boolean => {
    const pageNode = pageRefs.current[pageNumber]
    if (!pageNode) {
      return false
    }
    try {
      pageNode.scrollIntoView({ behavior, block: 'start' })
    } catch {
      pageNode.scrollIntoView()
    }
    return true
  }, [])

  useEffect(() => {
    if (!pageCount || !Number.isFinite(targetPage)) {
      return
    }
    const nextPage = clampPage(Number(targetPage), pageCount)
    if (nextPage === currentPage) {
      return
    }
    if (scrollToPage(nextPage)) {
      setCurrentPage(nextPage)
    }
  }, [currentPage, pageCount, scrollToPage, targetPage])

  const updateCurrentPageFromScroll = useCallback(() => {
    const frame = frameRef.current
    if (!frame || !pageLayouts.length) {
      return
    }
    const frameRect = frame.getBoundingClientRect()
    if (frameRect.height <= 0) {
      return
    }

    let bestPage = currentPage
    let bestVisibleRatio = 0
    let bestDistance = Number.POSITIVE_INFINITY

    for (const layout of pageLayouts) {
      const pageNode = pageRefs.current[layout.pageNumber]
      if (!pageNode) {
        continue
      }
      const rect = pageNode.getBoundingClientRect()
      if (rect.height <= 0) {
        continue
      }
      const visibleTop = Math.max(rect.top, frameRect.top)
      const visibleBottom = Math.min(rect.bottom, frameRect.bottom)
      const visibleHeight = Math.max(0, visibleBottom - visibleTop)
      const visibleRatio = visibleHeight / rect.height
      const distanceFromTop = Math.abs(rect.top - frameRect.top)

      if (
        visibleRatio > bestVisibleRatio + 0.001
        || (
          Math.abs(visibleRatio - bestVisibleRatio) <= 0.001
          && distanceFromTop < bestDistance
        )
      ) {
        bestPage = layout.pageNumber
        bestVisibleRatio = visibleRatio
        bestDistance = distanceFromTop
      }
    }

    if (bestVisibleRatio > 0 && bestPage !== currentPage) {
      setCurrentPage(bestPage)
    }
  }, [currentPage, pageLayouts])

  useEffect(() => {
    const frame = frameRef.current
    if (!frame || !pageLayouts.length) {
      return
    }

    let frameId = 0
    const scheduleSync = () => {
      if (frameId) {
        return
      }
      frameId = window.requestAnimationFrame(() => {
        frameId = 0
        updateCurrentPageFromScroll()
      })
    }

    scheduleSync()
    frame.addEventListener('scroll', scheduleSync, { passive: true })
    window.addEventListener('resize', scheduleSync)

    return () => {
      frame.removeEventListener('scroll', scheduleSync)
      window.removeEventListener('resize', scheduleSync)
      if (frameId) {
        window.cancelAnimationFrame(frameId)
      }
    }
  }, [pageLayouts, updateCurrentPageFromScroll])

  const nudgeZoom = (delta: number) => {
    const base = fitWidth ? effectiveZoomPercent : manualZoomPercent
    setFitWidth(false)
    setManualZoomPercent(clampZoom(base + delta))
  }

  const handleRenderingChange = useCallback((pageNumber: number, rendering: boolean) => {
    setRenderingPages((current) => {
      const alreadyRendering = Boolean(current[pageNumber])
      if (alreadyRendering === rendering) {
        return current
      }
      if (rendering) {
        return {
          ...current,
          [pageNumber]: true,
        }
      }
      const next = { ...current }
      delete next[pageNumber]
      return next
    })
  }, [])

  return (
    <div className={cn('flex h-full min-h-0 flex-col gap-4', className)}>
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-[1.1rem] border border-[hsl(var(--tone-neutral-200))] bg-[hsl(var(--tone-neutral-50)/0.96)] px-4 py-3 shadow-[0_12px_30px_hsl(var(--tone-neutral-900)/0.05)]">
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
            disabled={navigationDisabled}
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
            disabled={navigationDisabled}
            onClick={() => nudgeZoom(ZOOM_STEP_PERCENT)}
          >
            <Plus className="h-4 w-4" />
          </Button>
          <Button
            type="button"
            variant="outline"
            size="icon"
            className="h-9 w-9 rounded-full"
            disabled={navigationDisabled}
            onClick={() => {
              setFitWidth(true)
              setManualZoomPercent(110)
              if (scrollToPage(1)) {
                setCurrentPage(1)
              }
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
          <div className="flex flex-col items-center gap-5">
            {pageLayouts.map((layout) => (
              <div
                key={`pdf-page-${layout.pageNumber}`}
                ref={(node) => {
                  pageRefs.current[layout.pageNumber] = node
                }}
                className="relative overflow-hidden rounded-[0.9rem] bg-white shadow-[0_16px_38px_hsl(var(--tone-neutral-900)/0.16)]"
                style={{
                  width: `${layout.displayWidth}px`,
                  minHeight: `${layout.displayHeight}px`,
                }}
                aria-label={`PDF page ${layout.pageNumber}`}
              >
                <div className="pointer-events-none absolute left-3 top-3 z-[1] rounded-full border border-[hsl(var(--tone-neutral-200))] bg-[hsl(var(--tone-neutral-50)/0.92)] px-2.5 py-1 text-[0.68rem] font-semibold uppercase tracking-[0.08em] text-[hsl(var(--tone-neutral-600))] shadow-[0_6px_16px_hsl(var(--tone-neutral-900)/0.08)]">
                  Page {layout.pageNumber}
                </div>
                {documentProxy ? (
                  <PublicationPdfCanvasPage
                    pdfDocument={documentProxy}
                    pageNumber={layout.pageNumber}
                    displayWidth={layout.displayWidth}
                    displayHeight={layout.displayHeight}
                    scale={layout.scale}
                    onRenderingChange={handleRenderingChange}
                  />
                ) : null}
              </div>
            ))}
          </div>
        </div>

        {loadingDocument ? (
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center bg-[hsl(var(--tone-neutral-50)/0.58)] backdrop-blur-[1px]">
            <div className="flex items-center gap-3 rounded-full border border-[hsl(var(--tone-neutral-200))] bg-white px-4 py-2 text-sm text-[hsl(var(--tone-neutral-700))] shadow-[0_10px_24px_hsl(var(--tone-neutral-900)/0.08)]">
              <Loader2 className="h-4 w-4 animate-spin" />
              <span>Loading PDF...</span>
            </div>
          </div>
        ) : null}

        {!loadingDocument && renderingPageCount > 0 ? (
          <div className="pointer-events-none absolute right-4 top-4">
            <div className="flex items-center gap-2 rounded-full border border-[hsl(var(--tone-neutral-200))] bg-white/95 px-3 py-1.5 text-xs font-medium text-[hsl(var(--tone-neutral-700))] shadow-[0_10px_24px_hsl(var(--tone-neutral-900)/0.08)]">
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
              <span>Rendering pages...</span>
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
