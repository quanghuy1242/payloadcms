import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { createElement } from 'react'

import { EpubExporter } from '@/components/admin/books/EpubExporter'
import * as pipelineModule from '@/utils/epubExportPipeline'

const exporterMocks = vi.hoisted(() => ({
  createObjectURL: vi.fn().mockReturnValue('blob:mock-url'),
  revokeObjectURL: vi.fn(),
  anchorClick: vi.fn(),
}))

beforeEach(() => {
  URL.createObjectURL = exporterMocks.createObjectURL
  URL.revokeObjectURL = exporterMocks.revokeObjectURL
  exporterMocks.createObjectURL.mockClear()
  exporterMocks.revokeObjectURL.mockClear()
  exporterMocks.anchorClick.mockClear()
  HTMLAnchorElement.prototype.click = exporterMocks.anchorClick
})

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

describe('EpubExporter', () => {
  it('renders start and cancel buttons', () => {
    render(createElement(EpubExporter, { bookId: 'book-1' }))

    expect(screen.getByText('Export as EPUB')).toBeTruthy()
    expect(screen.getByText('Cancel Export')).toBeTruthy()
  })

  it('shows progress updates as events stream in', async () => {
    vi.spyOn(pipelineModule, 'runEpubExportPipeline').mockImplementation(async function* () {
      yield { type: 'phase', phase: 'Fetching Manifest' }
      yield { type: 'status', message: 'Fetching export manifest...' }
      yield { type: 'chapters-known', totalChapters: 2 }
      yield { type: 'phase', phase: 'Serializing Chapters' }
      yield { type: 'chapter-serialized', completed: 1, total: 2 }
      yield { type: 'chapter-serialized', completed: 2, total: 2 }
      yield { type: 'phase', phase: 'Downloading Assets' }
      yield { type: 'asset-downloaded', completed: 1, total: 1 }
      yield { type: 'phase', phase: 'Packaging' }
      yield {
        type: 'done',
        blob: new Blob(['fake-epub']),
        filename: 'my-book.epub',
      }
    })

    render(createElement(EpubExporter, { bookId: 'book-1' }))

    fireEvent.click(screen.getByText('Export as EPUB'))

    await waitFor(() => {
      expect(screen.getByText(/Done/)).toBeTruthy()
    })

    await waitFor(() => {
      expect(screen.getByText(/Export complete: my-book\.epub/)).toBeTruthy()
    })

    expect(screen.getByText('2/2')).toBeTruthy()
    expect(screen.getByText('1/1')).toBeTruthy()
  })

  it('cancel button aborts active export', async () => {
    vi.spyOn(pipelineModule, 'runEpubExportPipeline').mockImplementation(
      async function* ({ signal }: pipelineModule.EpubExportPipelineConfig) {
        yield { type: 'phase', phase: 'Fetching Manifest' }
        yield { type: 'status', message: 'Fetching export manifest...' }

        // Simulate work that checks for abort
        while (true) {
          if (signal.aborted) {
            throw new DOMException('The operation was aborted.', 'AbortError')
          }
          yield { type: 'status', message: 'Working...' }
          await new Promise((r) => setTimeout(r, 10))
        }
      },
    )

    render(createElement(EpubExporter, { bookId: 'book-1' }))

    fireEvent.click(screen.getByText('Export as EPUB'))

    await waitFor(() => {
      expect(screen.getByText(/Fetching Manifest/)).toBeTruthy()
    })

    fireEvent.click(screen.getByText('Cancel Export'))

    await waitFor(() => {
      expect(screen.getByText(/Canceled/)).toBeTruthy()
    })
  })

  it('renders warning list', async () => {
    vi.spyOn(pipelineModule, 'runEpubExportPipeline').mockImplementation(async function* () {
      yield { type: 'phase', phase: 'Serializing Chapters' }
      yield { type: 'warning', message: 'Unresolved internal link: foo.xhtml' }
      yield { type: 'warning', message: 'Failed to download asset 101' }
      yield {
        type: 'done',
        blob: new Blob(['fake-epub']),
        filename: 'my-book.epub',
      }
    })

    render(createElement(EpubExporter, { bookId: 'book-1' }))

    fireEvent.click(screen.getByText('Export as EPUB'))

    await waitFor(() => {
      expect(screen.getByText('Warnings (2)')).toBeTruthy()
    })

    expect(screen.getByText('Unresolved internal link: foo.xhtml')).toBeTruthy()
    expect(screen.getByText('Failed to download asset 101')).toBeTruthy()
  })

  it('triggers blob download on success', async () => {
    vi.spyOn(pipelineModule, 'runEpubExportPipeline').mockImplementation(async function* () {
      yield {
        type: 'done',
        blob: new Blob(['fake-epub-content']),
        filename: 'test-book.epub',
      }
    })

    render(createElement(EpubExporter, { bookId: 'book-1' }))

    fireEvent.click(screen.getByText('Export as EPUB'))

    await waitFor(() => {
      expect(exporterMocks.createObjectURL).toHaveBeenCalled()
    })

    await waitFor(() => {
      expect(screen.getByText(/Export complete: test-book\.epub/)).toBeTruthy()
    })
  })

  it('prevents concurrent exports', async () => {
    const pipelineSpy = vi
      .spyOn(pipelineModule, 'runEpubExportPipeline')
      .mockImplementation(async function* ({ signal }: pipelineModule.EpubExportPipelineConfig) {
        yield { type: 'phase', phase: 'Fetching Manifest' }
        // Yield a few times then wait for abort
        while (true) {
          if (signal.aborted) {
            throw new DOMException('The operation was aborted.', 'AbortError')
          }
          yield { type: 'status', message: 'Working...' }
          await new Promise((r) => setTimeout(r, 10))
        }
      })

    render(createElement(EpubExporter, { bookId: 'book-1' }))

    const startButton = screen.getByText('Export as EPUB')
    fireEvent.click(startButton)

    await waitFor(() => {
      expect(screen.getByText(/Fetching Manifest/)).toBeTruthy()
    })

    // Click again — should not start a second pipeline
    fireEvent.click(startButton)

    expect(pipelineSpy).toHaveBeenCalledTimes(1)
  })

  it('shows error when pipeline throws', async () => {
    vi.spyOn(pipelineModule, 'runEpubExportPipeline').mockImplementation(async function* () {
      yield { type: 'phase', phase: 'Fetching Manifest' }
      throw new Error('Network timeout')
    })

    render(createElement(EpubExporter, { bookId: 'book-1' }))

    fireEvent.click(screen.getByText('Export as EPUB'))

    await waitFor(() => {
      expect(screen.getByText(/Failed/)).toBeTruthy()
    })

    expect(screen.getByText('Network timeout')).toBeTruthy()
  })
})
