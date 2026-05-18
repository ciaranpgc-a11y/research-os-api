import { useCallback, useEffect, useRef, useState } from 'react'
import { Download, FileText, Loader2, Trash2, X } from 'lucide-react'

import {
  deleteSourceFile,
  fetchSourceFileBlob,
  listSourceFilesForRecord,
  type ExtractSourceFile,
} from '@/lib/extract-api'
import { cn } from '@/lib/utils'

function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return ''
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

function fileKind(file: ExtractSourceFile): 'pdf' | 'image' | 'text' | 'word' | 'other' {
  const contentType = String(file.content_type ?? '').toLowerCase()
  const name = String(file.filename ?? '').toLowerCase()
  if (contentType.includes('pdf') || name.endsWith('.pdf')) return 'pdf'
  if (contentType.startsWith('image/') || /\.(png|jpe?g|gif|webp)$/i.test(name)) return 'image'
  if (contentType.startsWith('text/') || /\.(txt|csv|json)$/i.test(name)) return 'text'
  if (
    name.endsWith('.doc') ||
    name.endsWith('.docx') ||
    contentType === 'application/msword' ||
    contentType.includes('openxmlformats-officedocument.wordprocessingml.document')
  ) return 'word'
  return 'other'
}

function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = filename || 'source-file'
  document.body.appendChild(anchor)
  anchor.click()
  anchor.remove()
  window.setTimeout(() => URL.revokeObjectURL(url), 1000)
}

export function SourceFileHeaderCell() {
  return (
    <div className="flex items-center justify-center px-3 py-2.5 font-semibold text-[hsl(var(--tone-neutral-700))]" title="Source file">
      <FileText className="h-4 w-4" />
    </div>
  )
}

export function SourceFileCell({
  modality,
  recordId,
  className,
}: {
  modality: string
  recordId: string
  className?: string
}) {
  const [files, setFiles] = useState<ExtractSourceFile[]>([])
  const [loading, setLoading] = useState(false)
  const [viewerFile, setViewerFile] = useState<ExtractSourceFile | null>(null)
  const [viewerUrl, setViewerUrl] = useState<string | null>(null)
  const [viewerLoading, setViewerLoading] = useState(false)
  const [viewerError, setViewerError] = useState<string | null>(null)
  const [viewerIsPdfPreview, setViewerIsPdfPreview] = useState(false)
  const [menu, setMenu] = useState<{ x: number; y: number } | null>(null)
  const menuRef = useRef<HTMLDivElement>(null)

  const loadFiles = useCallback(() => {
    if (!modality || !recordId) {
      setFiles([])
      return
    }
    setLoading(true)
    void listSourceFilesForRecord(modality, recordId)
      .then(setFiles)
      .catch(() => setFiles([]))
      .finally(() => setLoading(false))
  }, [modality, recordId])

  useEffect(() => {
    loadFiles()
  }, [loadFiles])

  useEffect(() => {
    if (!menu) return
    const handlePointerDown = (event: MouseEvent) => {
      if (menuRef.current?.contains(event.target as Node)) return
      setMenu(null)
    }
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setMenu(null)
    }
    document.addEventListener('mousedown', handlePointerDown)
    document.addEventListener('keydown', handleKey)
    return () => {
      document.removeEventListener('mousedown', handlePointerDown)
      document.removeEventListener('keydown', handleKey)
    }
  }, [menu])

  useEffect(() => {
    return () => {
      if (viewerUrl) URL.revokeObjectURL(viewerUrl)
    }
  }, [viewerUrl])

  const file = files[0] ?? null

  const openViewer = async () => {
    if (!file) return
    setViewerFile(file)
    setViewerLoading(true)
    setViewerError(null)
    setViewerIsPdfPreview(false)
    try {
      const kind = fileKind(file)
      const blob = await fetchSourceFileBlob(file.id, kind === 'word' ? { format: 'pdf' } : undefined)
      const url = URL.createObjectURL(blob)
      setViewerIsPdfPreview(kind === 'word')
      setViewerUrl((previous) => {
        if (previous) URL.revokeObjectURL(previous)
        return url
      })
    } catch (error) {
      setViewerError(error instanceof Error ? error.message : 'Failed to load source file')
      setViewerUrl(null)
    } finally {
      setViewerLoading(false)
    }
  }

  const closeViewer = () => {
    setViewerFile(null)
    setViewerError(null)
    setViewerIsPdfPreview(false)
    setViewerUrl((previous) => {
      if (previous) URL.revokeObjectURL(previous)
      return null
    })
  }

  const downloadFile = async () => {
    if (!file) return
    const blob = await fetchSourceFileBlob(file.id)
    downloadBlob(blob, file.filename)
  }

  const deleteFile = async () => {
    if (!file) return
    if (!window.confirm(`Delete uploaded file "${file.filename}"?`)) return
    await deleteSourceFile(file.id)
    closeViewer()
    setMenu(null)
    loadFiles()
  }

  const openMenu = (event: React.MouseEvent) => {
    if (!file) return
    event.preventDefault()
    event.stopPropagation()
    setMenu({ x: event.clientX, y: event.clientY })
  }

  const kind = viewerFile ? fileKind(viewerFile) : 'other'
  const renderAsFrame = kind === 'pdf' || kind === 'text' || (kind === 'word' && viewerIsPdfPreview)

  return (
    <div className={cn('flex items-center justify-center px-3 py-2.5', className)}>
      {loading ? (
        <Loader2 className="h-3.5 w-3.5 animate-spin text-[hsl(var(--tone-neutral-400))]" />
      ) : file ? (
        <button
          type="button"
          onClick={(event) => {
            event.stopPropagation()
            void openViewer()
          }}
          onContextMenu={openMenu}
          className="inline-flex h-8 w-8 items-center justify-center rounded-md text-[hsl(var(--tone-accent-600))] transition-colors hover:bg-[hsl(var(--tone-accent-50))]"
          title={`${file.filename}${file.byte_size ? ` (${formatBytes(file.byte_size)})` : ''}`}
        >
          <FileText className="h-4 w-4" />
        </button>
      ) : (
        <span className="text-[hsl(var(--tone-neutral-300))]">-</span>
      )}

      {menu && file && (
        <div
          ref={menuRef}
          className="fixed z-50 min-w-[150px] rounded-lg border border-[hsl(var(--stroke-soft)/0.72)] bg-[hsl(var(--card))] py-1 shadow-lg"
          style={{ left: menu.x, top: menu.y }}
        >
          <button
            type="button"
            onClick={() => { setMenu(null); void downloadFile() }}
            className="flex w-full items-center gap-2.5 px-3 py-2 text-left text-sm text-[hsl(var(--foreground))] transition-colors hover:bg-[hsl(var(--tone-neutral-50))]"
          >
            <Download className="h-3.5 w-3.5" />
            Download
          </button>
          <button
            type="button"
            onClick={() => void deleteFile()}
            className="flex w-full items-center gap-2.5 px-3 py-2 text-left text-sm text-[hsl(var(--tone-danger-600))] transition-colors hover:bg-[hsl(var(--tone-danger-50))]"
          >
            <Trash2 className="h-3.5 w-3.5" />
            Delete
          </button>
        </div>
      )}

      {viewerFile && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/35 px-4 py-6">
          <div className="flex h-full max-h-[920px] w-full max-w-5xl flex-col rounded-lg border border-[hsl(var(--stroke-soft)/0.72)] bg-[hsl(var(--card))] shadow-2xl">
            <div className="flex items-center justify-between gap-3 border-b border-[hsl(var(--stroke-soft)/0.72)] px-4 py-3">
              <div className="min-w-0">
                <div className="truncate text-sm font-semibold text-[hsl(var(--foreground))]">{viewerFile.filename}</div>
                <div className="text-xs text-[hsl(var(--muted-foreground))]">
                  {[viewerFile.content_type, formatBytes(viewerFile.byte_size)].filter(Boolean).join(' / ')}
                </div>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => void downloadFile()}
                  className="inline-flex items-center gap-1.5 rounded-md border border-[hsl(var(--border))] bg-white px-3 py-1.5 text-xs font-semibold text-[hsl(var(--foreground))] hover:bg-[hsl(var(--tone-neutral-50))]"
                >
                  <Download className="h-3.5 w-3.5" />
                  Download original
                </button>
                <button
                  type="button"
                  onClick={closeViewer}
                  className="inline-flex h-8 w-8 items-center justify-center rounded-md text-[hsl(var(--muted-foreground))] hover:bg-[hsl(var(--tone-neutral-100))] hover:text-[hsl(var(--foreground))]"
                  aria-label="Close source file viewer"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            </div>
            <div className="min-h-0 flex-1 bg-[hsl(var(--tone-neutral-50))] p-4">
              {viewerLoading ? (
                <div className="flex h-full items-center justify-center text-sm text-[hsl(var(--muted-foreground))]">
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Loading file...
                </div>
              ) : viewerUrl && kind === 'image' ? (
                <div className="flex h-full items-center justify-center overflow-auto">
                  <img src={viewerUrl} alt={viewerFile.filename} className="max-h-full max-w-full rounded-md bg-white object-contain shadow-sm" />
                </div>
              ) : viewerUrl && renderAsFrame ? (
                <div className="flex h-full flex-col gap-2">
                  {kind === 'word' && (
                    <div className="rounded-md border border-[hsl(var(--tone-accent-200))] bg-white px-3 py-2 text-xs text-[hsl(var(--muted-foreground))]">
                      Showing a PDF preview generated from the uploaded Word document.
                    </div>
                  )}
                  <iframe
                    title={viewerFile.filename}
                    src={viewerUrl}
                    className="min-h-0 flex-1 rounded-md border border-[hsl(var(--stroke-soft)/0.72)] bg-white"
                  />
                </div>
              ) : (
                <div className="flex h-full flex-col items-center justify-center gap-3 text-center">
                  <FileText className="h-10 w-10 text-[hsl(var(--tone-neutral-400))]" />
                  <div>
                    <p className="text-sm font-semibold text-[hsl(var(--foreground))]">Preview unavailable</p>
                    <p className="mt-1 text-xs text-[hsl(var(--muted-foreground))]">
                      {viewerError ?? 'This file type cannot be rendered in the browser. Use download to open it locally.'}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => void downloadFile()}
                    className="inline-flex items-center gap-1.5 rounded-md bg-[hsl(var(--tone-accent-600))] px-3 py-1.5 text-xs font-semibold text-white hover:bg-[hsl(var(--tone-accent-700))]"
                  >
                    <Download className="h-3.5 w-3.5" />
                    Download
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
