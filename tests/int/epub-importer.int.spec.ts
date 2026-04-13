import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { createElement } from 'react'

import EpubImporter from '@/components/admin/books/EpubImporter'

type MockSection = {
  load: ReturnType<typeof vi.fn>
  render: ReturnType<typeof vi.fn>
  unload: ReturnType<typeof vi.fn>
}

type MockBook = {
  archive: {
    createUrl: ReturnType<typeof vi.fn>
    getBlob: ReturnType<typeof vi.fn>
    revokeUrl: ReturnType<typeof vi.fn>
  }
  destroy: ReturnType<typeof vi.fn>
  load: ReturnType<typeof vi.fn>
  loaded: {
    cover: Promise<string>
    metadata: Promise<{ creator: string; title: string }>
    spine: Promise<{
      spineItems: Array<{ href: string; idref: string; index: number; linear: true }>
    }>
  }
  open: ReturnType<typeof vi.fn>
  ready: Promise<void>
  section: ReturnType<typeof vi.fn>
}

type FetchMockOptions = {
  createdBookID?: number
  existingBooksDocs?: Array<Record<string, unknown>>
  existingChapterDocsByBook?: Array<Record<string, unknown>>
  existingMediaDocs?: Array<Record<string, unknown>>
  bookCreateRetryFailures?: number
  chapterCreateRetryFailures?: number
  failChapterCreate?: boolean
}

const simpleLexicalState = {
  root: {
    children: [],
    direction: null,
    format: '',
    indent: 0,
    type: 'root',
    version: 1,
  },
} as const

let currentMockBook: MockBook

vi.mock('epubjs', () => {
  return {
    default: vi.fn(() => currentMockBook),
  }
})

vi.mock('@/utils/epubLexical', () => {
  return {
    convertHtmlToChapterLexicalState: vi.fn(() => simpleLexicalState),
  }
})

vi.mock('@/utils/epubImport', async () => {
  const actual = await vi.importActual<typeof import('@/utils/epubImport')>('@/utils/epubImport')

  return {
    ...actual,
    sleep: vi.fn(async () => undefined),
  }
})

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

beforeEach(() => {
  currentMockBook = createMockBook([
    '<h1>Chapter 1</h1><p>Intro</p><img src="images/cover.png" alt="Chapter art" />',
  ])
})

const createJsonResponse = (payload: unknown, status = 200): Response => {
  return new Response(JSON.stringify(payload), {
    headers: {
      'Content-Type': 'application/json',
    },
    status,
  })
}

const createTestEpubFile = () => {
  const file = new File(['binary-epub-bytes'], 'The_Wild_Robot_Escapes_vi_book.epub', {
    type: 'application/epub+zip',
  })

  Object.defineProperty(file, 'arrayBuffer', {
    configurable: true,
    value: async () => {
      return new TextEncoder().encode('binary-epub-bytes').buffer
    },
  })

  return file
}

const createMockSection = (html: string, shouldThrow = false): MockSection => {
  return {
    load: vi.fn(async () => undefined),
    render: vi.fn(() => {
      if (shouldThrow) {
        throw new Error('chapter rendering failed')
      }

      return html
    }),
    unload: vi.fn(() => undefined),
  }
}

const createMockBook = (
  chapterHtmls: string[],
  options?: { failingChapterIndex?: number },
): MockBook => {
  const sections = chapterHtmls.map((chapterHtml, index) => {
    return createMockSection(chapterHtml, options?.failingChapterIndex === index)
  })

  return {
    archive: {
      createUrl: vi.fn(async () => 'blob:mock-epub-url'),
      getBlob: vi.fn(async () => new Blob([new Uint8Array([137, 80, 78, 71])], { type: 'image/png' })),
      revokeUrl: vi.fn(() => undefined),
    },
    destroy: vi.fn(() => undefined),
    load: vi.fn(async () => undefined),
    loaded: {
      cover: Promise.resolve(''),
      metadata: Promise.resolve({
        creator: 'Peter Brown',
        title: 'The Wild Robot Escapes',
      }),
      spine: Promise.resolve({
        spineItems: chapterHtmls.map((_, index) => ({
          href: `OEBPS/ch${index + 1}.xhtml`,
          idref: `sec-${index + 1}`,
          index,
          linear: true as const,
        })),
      }),
    },
    open: vi.fn(async () => undefined),
    ready: Promise.resolve(),
    section: vi.fn((index: number) => {
      const section = sections[index]

      if (!section) {
        throw new Error(`Missing mock section for index ${index}`)
      }

      return section
    }),
  }
}

const installFetchMock = (options: FetchMockOptions = {}) => {
  const createdBookID = options.createdBookID ?? 101
  const existingBooksDocs = options.existingBooksDocs ?? []
  const existingMediaDocs = options.existingMediaDocs ?? []
  const existingChapterDocsByBook = options.existingChapterDocsByBook ?? []
  let bookCreateAttempts = 0
  let chapterCreateAttempts = 0

  const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input)
    const method = (init?.method ?? 'GET').toUpperCase()

    if (method === 'GET' && url.startsWith('/api/books?')) {
      return createJsonResponse({ docs: existingBooksDocs })
    }

    if (method === 'POST' && url === '/api/books') {
      bookCreateAttempts += 1

      if (bookCreateAttempts <= (options.bookCreateRetryFailures ?? 0)) {
        return createJsonResponse({ message: 'Temporary book create failure' }, 500)
      }

      return createJsonResponse({ doc: { id: createdBookID, title: 'The Wild Robot Escapes' } }, 201)
    }

    if (method === 'PATCH' && url.startsWith('/api/books/')) {
      const idMatch = url.match(/\/api\/books\/(\d+)/)
      const id = idMatch ? Number(idMatch[1]) : createdBookID

      return createJsonResponse({ id, updatedAt: new Date().toISOString() })
    }

    if (method === 'GET' && url.startsWith('/api/media?')) {
      return createJsonResponse({ docs: existingMediaDocs })
    }

    if (method === 'POST' && url === '/api/media') {
      return createJsonResponse({ id: 201, url: '/media/chapter-art.png' }, 201)
    }

    if (method === 'GET' && url.startsWith('/api/chapters?')) {
      return createJsonResponse({ docs: existingChapterDocsByBook })
    }

    if (method === 'POST' && url === '/api/chapters') {
      chapterCreateAttempts += 1

      if (chapterCreateAttempts <= (options.chapterCreateRetryFailures ?? 0)) {
        return createJsonResponse({ message: 'Temporary chapter create failure' }, 500)
      }

      if (options.failChapterCreate) {
        return createJsonResponse(
          {
            errors: [
              {
                message: 'The following field is invalid: Content',
                name: 'h',
              },
            ],
          },
          400,
        )
      }

      return createJsonResponse({ id: 301, title: 'Chapter 1' }, 201)
    }

    if (method === 'PATCH' && url.startsWith('/api/chapters/')) {
      return createJsonResponse({ id: 301, updatedAt: new Date().toISOString() })
    }

    throw new Error(`Unhandled fetch: ${method} ${url}`)
  })

  vi.stubGlobal('fetch', fetchMock)

  return fetchMock
}

describe('EpubImporter', () => {
  it('uploads media through the normal Payload API and finalizes the book', async () => {
    const fetchMock = installFetchMock()

    render(createElement(EpubImporter))

    const input = screen.getByLabelText('Select EPUB file') as HTMLInputElement
    const epubFile = createTestEpubFile()

    fireEvent.change(input, { target: { files: [epubFile] } })

    await waitFor(() => {
      expect(
        screen.getByText((_, element) => element?.textContent === 'Phase: Done'),
      ).toBeTruthy()
    })

    await waitFor(() => {
      expect(
        screen.getByText((_, element) => element?.textContent === 'Images Uploaded: 1'),
      ).toBeTruthy()
    })

    const mediaCall = fetchMock.mock.calls.find(([url, init]) => {
      return String(url) === '/api/media' && init?.method === 'POST'
    })

    expect(mediaCall).toBeTruthy()

    const mediaBody = mediaCall?.[1]?.body as FormData | undefined

    expect(mediaBody).toBeInstanceOf(FormData)
    expect(mediaBody?.get('alt')).toBe('Chapter art')

    const bookPatchCalls = fetchMock.mock.calls.filter(([url, init]) => {
      return String(url).startsWith('/api/books/101') && init?.method === 'PATCH'
    })

    expect(bookPatchCalls.length).toBeGreaterThan(0)

    const finalPatchBody = JSON.parse(String(bookPatchCalls.at(-1)?.[1]?.body ?? '{}'))

    expect(finalPatchBody.importStatus).toBe('ready')
    expect(finalPatchBody.syncStatus).toBe('clean')
    expect(finalPatchBody.importCompletedChapters).toBe(1)
  })

  it('skips a failed chapter and still completes the import', async () => {
    currentMockBook = createMockBook(
      [
        '<h1>Chapter 1</h1><p>Intro</p><img src="images/cover.png" alt="Chapter art" />',
        '<h1>Chapter 2</h1><p>Broken chapter</p>',
      ],
      {
        failingChapterIndex: 1,
      },
    )

    const fetchMock = installFetchMock()

    render(createElement(EpubImporter))

    const input = screen.getByLabelText('Select EPUB file') as HTMLInputElement
    const epubFile = createTestEpubFile()

    fireEvent.change(input, { target: { files: [epubFile] } })

    await waitFor(() => {
      expect(
        screen.getByText((_, element) => element?.textContent === 'Phase: Done'),
      ).toBeTruthy()
    })

    await waitFor(() => {
      expect(screen.getByText(/Import completed with 1 skipped chapter/)).toBeTruthy()
    })

    const chapterCreates = fetchMock.mock.calls.filter(([url, init]) => {
      return String(url) === '/api/chapters' && init?.method === 'POST'
    })

    expect(chapterCreates.length).toBe(1)

    const bookPatchCalls = fetchMock.mock.calls.filter(([url, init]) => {
      return String(url).startsWith('/api/books/101') && init?.method === 'PATCH'
    })

    const finalPatchBody = JSON.parse(String(bookPatchCalls.at(-1)?.[1]?.body ?? '{}'))

    expect(finalPatchBody.importStatus).toBe('ready')
    expect(finalPatchBody.syncStatus).toBe('pending')
    expect(finalPatchBody.importErrorSummary).toContain('skipped')
  })

  it('reuses an existing book and marks older duplicates as failed', async () => {
    const fetchMock = installFetchMock({
      existingBooksDocs: [
        { id: 900, title: 'The Wild Robot Escapes' },
        { id: 901, title: 'The Wild Robot Escapes (older)' },
      ],
    })

    render(createElement(EpubImporter))

    const input = screen.getByLabelText('Select EPUB file') as HTMLInputElement
    const epubFile = createTestEpubFile()

    fireEvent.change(input, { target: { files: [epubFile] } })

    await waitFor(() => {
      expect(
        screen.getByText((_, element) => element?.textContent === 'Phase: Done'),
      ).toBeTruthy()
    })

    const createBookCalls = fetchMock.mock.calls.filter(([url, init]) => {
      return String(url) === '/api/books' && init?.method === 'POST'
    })

    expect(createBookCalls.length).toBe(0)

    const booksLookupCall = fetchMock.mock.calls.find(([url, init]) => {
      return String(url).startsWith('/api/books?') && (init?.method ?? 'GET') === 'GET'
    })

    expect(booksLookupCall).toBeTruthy()

    const decodedLookupUrl = decodeURIComponent(String(booksLookupCall?.[0] ?? ''))
    expect(decodedLookupUrl).toContain('where[or][0][sourceHash][equals]')
    expect(decodedLookupUrl).toContain('where[or][1][sourceHash][equals]')

    const duplicatePatchCall = fetchMock.mock.calls.find(([url, init]) => {
      return String(url) === '/api/books/901' && init?.method === 'PATCH'
    })

    expect(duplicatePatchCall).toBeTruthy()

    const duplicatePatchBody = JSON.parse(String(duplicatePatchCall?.[1]?.body ?? '{}'))
    expect(duplicatePatchBody.importStatus).toBe('failed')
    expect(duplicatePatchBody.syncStatus).toBe('conflicted')

    const reusablePatchCalls = fetchMock.mock.calls.filter(([url, init]) => {
      return String(url) === '/api/books/900' && init?.method === 'PATCH'
    })
    const finalReusablePatchBody = JSON.parse(String(reusablePatchCalls.at(-1)?.[1]?.body ?? '{}'))

    expect(finalReusablePatchBody.importStatus).toBe('ready')
  })

  it('reuses existing media and updates existing chapter instead of creating duplicates', async () => {
    const fetchMock = installFetchMock({
      existingChapterDocsByBook: [{ id: 444, order: 1, title: 'Existing Chapter 1' }],
      existingMediaDocs: [{ id: 888, url: '/media/existing.png' }],
    })

    render(createElement(EpubImporter))

    const input = screen.getByLabelText('Select EPUB file') as HTMLInputElement
    const epubFile = createTestEpubFile()

    fireEvent.change(input, { target: { files: [epubFile] } })

    await waitFor(() => {
      expect(
        screen.getByText((_, element) => element?.textContent === 'Phase: Done'),
      ).toBeTruthy()
    })

    const mediaPostCalls = fetchMock.mock.calls.filter(([url, init]) => {
      return String(url) === '/api/media' && init?.method === 'POST'
    })

    expect(mediaPostCalls.length).toBe(0)

    await waitFor(() => {
      expect(
        screen.getByText((_, element) => element?.textContent === 'Images Uploaded: 0'),
      ).toBeTruthy()
    })

    const chapterCreateCalls = fetchMock.mock.calls.filter(([url, init]) => {
      return String(url) === '/api/chapters' && init?.method === 'POST'
    })
    const chapterPatchCalls = fetchMock.mock.calls.filter(([url, init]) => {
      return String(url) === '/api/chapters/444' && init?.method === 'PATCH'
    })

    expect(chapterCreateCalls.length).toBe(0)
    expect(chapterPatchCalls.length).toBe(1)

    const chapterLookupCalls = fetchMock.mock.calls.filter(([url, init]) => {
      return String(url).startsWith('/api/chapters?') && (init?.method ?? 'GET') === 'GET'
    })

    expect(chapterLookupCalls.length).toBe(1)
  })

  it('skips chapter creation when content validation fails and still finalizes import', async () => {
    const fetchMock = installFetchMock({
      failChapterCreate: true,
    })

    render(createElement(EpubImporter))

    const input = screen.getByLabelText('Select EPUB file') as HTMLInputElement
    const epubFile = createTestEpubFile()

    fireEvent.change(input, { target: { files: [epubFile] } })

    await waitFor(() => {
      expect(
        screen.getByText((_, element) => element?.textContent === 'Phase: Done'),
      ).toBeTruthy()
    })

    await waitFor(() => {
      expect(screen.getByText(/Import completed with 1 skipped chapter/)).toBeTruthy()
    })

    const finalBookPatch = fetchMock.mock.calls
      .filter(([url, init]) => {
        return String(url).startsWith('/api/books/101') && init?.method === 'PATCH'
      })
      .at(-1)

    const finalPatchBody = JSON.parse(String(finalBookPatch?.[1]?.body ?? '{}'))

    expect(finalPatchBody.importStatus).toBe('ready')
    expect(finalPatchBody.syncStatus).toBe('pending')
    expect(finalPatchBody.importErrorSummary).toContain('skipped')
  })

  it('retries a transient book create failure and still completes the import', async () => {
    const fetchMock = installFetchMock({
      bookCreateRetryFailures: 1,
    })

    render(createElement(EpubImporter))

    const input = screen.getByLabelText('Select EPUB file') as HTMLInputElement
    const epubFile = createTestEpubFile()

    fireEvent.change(input, { target: { files: [epubFile] } })

    await waitFor(() => {
      expect(
        screen.getByText((_, element) => element?.textContent === 'Phase: Done'),
      ).toBeTruthy()
    })

    const bookCreateCalls = fetchMock.mock.calls.filter(([url, init]) => {
      return String(url) === '/api/books' && init?.method === 'POST'
    })

    expect(bookCreateCalls.length).toBe(2)
    expect(screen.getByText((_, element) => element?.textContent === 'Images Uploaded: 1')).toBeTruthy()
  })

  it('retries a transient chapter create failure and still completes the import', async () => {
    const fetchMock = installFetchMock({
      chapterCreateRetryFailures: 1,
    })

    render(createElement(EpubImporter))

    const input = screen.getByLabelText('Select EPUB file') as HTMLInputElement
    const epubFile = createTestEpubFile()

    fireEvent.change(input, { target: { files: [epubFile] } })

    await waitFor(() => {
      expect(
        screen.getByText((_, element) => element?.textContent === 'Phase: Done'),
      ).toBeTruthy()
    })

    const chapterCreateCalls = fetchMock.mock.calls.filter(([url, init]) => {
      return String(url) === '/api/chapters' && init?.method === 'POST'
    })

    expect(chapterCreateCalls.length).toBe(2)

    const finalBookPatch = fetchMock.mock.calls
      .filter(([url, init]) => {
        return String(url).startsWith('/api/books/101') && init?.method === 'PATCH'
      })
      .at(-1)

    const finalPatchBody = JSON.parse(String(finalBookPatch?.[1]?.body ?? '{}'))

    expect(finalPatchBody.importStatus).toBe('ready')
    expect(finalPatchBody.syncStatus).toBe('clean')
    expect(finalPatchBody.importCompletedChapters).toBe(1)
  })

  it('processes chapters in planned batches and keeps chapter lookups prefetched', async () => {
    currentMockBook = createMockBook([
      '<h1>Chapter 1</h1><p>one two three four five six seven eight nine ten</p>',
      '<h1>Chapter 2</h1><p>one two three four five six seven eight nine ten</p>',
      '<h1>Chapter 3</h1><p>one two three four five six seven eight nine ten</p>',
    ])

    const fetchMock = installFetchMock()

    render(createElement(EpubImporter))

    const input = screen.getByLabelText('Select EPUB file') as HTMLInputElement
    const epubFile = createTestEpubFile()

    fireEvent.change(input, { target: { files: [epubFile] } })

    await waitFor(() => {
      expect(
        screen.getByText((_, element) => element?.textContent === 'Phase: Done'),
      ).toBeTruthy()
    })

    const chapterLookupCalls = fetchMock.mock.calls.filter(([url, init]) => {
      return String(url).startsWith('/api/chapters?') && (init?.method ?? 'GET') === 'GET'
    })
    const chapterCreateCalls = fetchMock.mock.calls.filter(([url, init]) => {
      return String(url) === '/api/chapters' && init?.method === 'POST'
    })

    expect(chapterLookupCalls.length).toBe(1)
    expect(chapterCreateCalls.length).toBe(3)
  })
})