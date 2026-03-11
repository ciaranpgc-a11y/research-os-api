import { render, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { PublicationPdfViewer } from '@/components/publications/PublicationPdfViewer'

const mockGetDocument = vi.fn()

vi.mock('pdfjs-dist', () => ({
  GlobalWorkerOptions: { workerSrc: '' },
  getDocument: (...args: unknown[]) => mockGetDocument(...args),
}))

vi.mock('pdfjs-dist/build/pdf.worker.min.mjs?url', () => ({
  default: '/mock-pdf-worker.js',
}))

vi.mock('@/lib/api', () => ({
  API_BASE_URL: 'https://api.example.test',
}))

vi.mock('@/lib/auth-session', () => ({
  getAuthAccountKeyHint: () => null,
}))

function buildMockPdfDocument(pageCount: number) {
  return {
    numPages: pageCount,
    getPage: vi.fn(async (pageNumber: number) => ({
      getViewport: ({ scale }: { scale: number }) => ({
        width: 600 * scale,
        height: 840 * scale,
      }),
      render: () => ({
        promise: Promise.resolve(),
        cancel: vi.fn(),
      }),
      pageNumber,
    })),
    destroy: vi.fn(),
  }
}

describe('PublicationPdfViewer', () => {
  let scrollIntoViewMock: ReturnType<typeof vi.fn>

  beforeEach(() => {
    const fetchMock = vi.fn(async () => ({
      ok: true,
      arrayBuffer: async () => new ArrayBuffer(16),
    }))
    vi.stubGlobal('fetch', fetchMock)

    class ResizeObserverMock {
      private readonly callback: ResizeObserverCallback

      constructor(callback: ResizeObserverCallback) {
        this.callback = callback
      }

      observe(target: Element) {
        this.callback(
          [{ contentRect: { width: 960, height: 720 } as DOMRectReadOnly, target } as ResizeObserverEntry],
          this as unknown as ResizeObserver,
        )
      }

      unobserve() {}

      disconnect() {}
    }

    vi.stubGlobal('ResizeObserver', ResizeObserverMock)

    scrollIntoViewMock = vi.fn()
    Object.defineProperty(HTMLElement.prototype, 'scrollIntoView', {
      configurable: true,
      value: scrollIntoViewMock,
    })

    Object.defineProperty(HTMLCanvasElement.prototype, 'getContext', {
      configurable: true,
      value: vi.fn(() => ({
        setTransform: vi.fn(),
        clearRect: vi.fn(),
      })),
    })

    const mockPdfDocument = buildMockPdfDocument(3)
    mockGetDocument.mockReset()
    mockGetDocument.mockReturnValue({
      promise: Promise.resolve(mockPdfDocument),
      destroy: vi.fn(),
    })
  })

  it('renders a continuous stack of PDF pages', async () => {
    const onPageChange = vi.fn()
    const { container } = render(
      <PublicationPdfViewer
        token="test-token"
        publicationId="publication-1"
        fileId="file-1"
        title="Test paper"
        onPageChange={onPageChange}
      />,
    )

    await waitFor(() => {
      expect(container.querySelectorAll('[aria-label^="PDF page "]')).toHaveLength(3)
    })

    expect(onPageChange).toHaveBeenCalledWith(1, 3)
  })

  it('keeps the current page synced when the parent targets a new page', async () => {
    const onPageChange = vi.fn()
    const { rerender } = render(
      <PublicationPdfViewer
        token="test-token"
        publicationId="publication-1"
        fileId="file-1"
        title="Test paper"
        targetPage={1}
        onPageChange={onPageChange}
      />,
    )

    rerender(
      <PublicationPdfViewer
        token="test-token"
        publicationId="publication-1"
        fileId="file-1"
        title="Test paper"
        targetPage={2}
        onPageChange={onPageChange}
      />,
    )

    await waitFor(() => {
      expect(scrollIntoViewMock).toHaveBeenCalled()
    })

    expect(onPageChange).toHaveBeenCalledWith(2, 3)
  })
})
