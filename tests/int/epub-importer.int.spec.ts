import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { createElement } from 'react'
import type { SerializedEditorState } from 'lexical'

import EpubImporter from '@/components/admin/books/EpubImporter'
import {
  collectFootnoteDefinitionsFromHTML,
  convertHtmlToChapterLexicalState,
} from '@/utils/epubLexical'
import { createImportedBookMediaAltText, createImportedBookSlug } from '@/utils/epubImport'

type MockSection = {
  load: ReturnType<typeof vi.fn>
  unload: ReturnType<typeof vi.fn>
  document?: Document | null
}

type MockNavItem = {
  id: string
  href: string
  label: string
  subitems?: MockNavItem[]
}

type MockMetadata = {
  creator?: string
  description?: string
  identifier?: string
  language?: string
  pubdate?: string
  publisher?: string
  subject?: string[]
  title?: string
}

type MockBook = {
  archive: {
    createUrl: ReturnType<typeof vi.fn>
    getBlob: ReturnType<typeof vi.fn>
    revokeUrl: ReturnType<typeof vi.fn>
  }
  destroy: ReturnType<typeof vi.fn>
  load: ReturnType<typeof vi.fn>
    packaging?: {
      navPath?: string
      ncxPath?: string
    }
  resolve: ReturnType<typeof vi.fn>
  loaded: {
    cover: Promise<string>
      metadata: Promise<MockMetadata>
    navigation: Promise<{ toc: MockNavItem[] }>
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

const simpleLexicalState: SerializedEditorState = {
  root: {
    children: [],
    direction: null,
    format: '',
    indent: 0,
    type: 'root',
    version: 1,
  },
}

let currentMockBook: MockBook
const refreshMock = vi.hoisted(() => vi.fn())

vi.mock('epubjs', () => {
  return {
    default: vi.fn(() => currentMockBook),
  }
})

vi.mock('next/navigation', () => {
  return {
    useRouter: () => ({
      refresh: refreshMock,
    }),
  }
})

vi.mock('@/utils/epubLexical', () => {
  return {
    collectFootnoteDefinitionsFromHTML: vi.fn(() => new Map()),
    convertHtmlToChapterLexicalState: vi.fn(() => simpleLexicalState),
    isSubstantiveChapterContent: vi.fn(() => true),
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
  refreshMock.mockReset()
  currentMockBook = createMockBook([
    '<h1>Chapter 1</h1><p>Intro</p><img src="images/cover.png" alt="Chapter art" />',
  ], {
    navigationToc: [
      {
        href: 'OEBPS/ch1.xhtml#chapter-1',
        id: 'toc-1',
        label: 'Chapter 1',
        subitems: [
          {
            href: 'OEBPS/ch1.xhtml#intro',
            id: 'toc-1-1',
            label: 'Intro',
            subitems: [],
          },
        ],
      },
    ],
  })
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
    unload: vi.fn(() => undefined),
    document: shouldThrow ? undefined : new DOMParser().parseFromString(html, 'text/html'),
  }
}

const createMockBook = (
  chapterHtmls: string[],
  options?: {
    failingChapterIndex?: number
    navigationToc?: MockNavItem[]
    metadata?: MockMetadata
    packaging?: {
      navPath?: string
      ncxPath?: string
    }
  },
): MockBook => {
  const sections = chapterHtmls.map((chapterHtml, index) => {
    return createMockSection(chapterHtml, options?.failingChapterIndex === index)
  })

  const metadata: MockMetadata = {
    creator: 'Peter Brown',
    description: 'A robot escapes into the wild and learns to survive.',
    identifier: '9780316475152',
    language: 'en-GB',
    pubdate: '2021-09-21',
    publisher: 'Farrar, Straus and Giroux',
    subject: ['Children', 'Adventure'],
    title: 'The Wild Robot Escapes',
    ...options?.metadata,
  }

  return {
    archive: {
      createUrl: vi.fn(async () => 'blob:mock-epub-url'),
      getBlob: vi.fn(async () => new Blob([new Uint8Array([137, 80, 78, 71])], { type: 'image/png' })),
      revokeUrl: vi.fn(() => undefined),
    },
    destroy: vi.fn(() => undefined),
    load: vi.fn(async () => undefined),
    packaging: options?.packaging ?? {
      navPath: 'OEBPS/nav.xhtml',
      ncxPath: '',
    },
    resolve: vi.fn((path: string) => path),
    loaded: {
      cover: Promise.resolve(''),
      metadata: Promise.resolve(metadata),
      navigation: Promise.resolve({
        toc: options?.navigationToc ?? [],
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
      return createJsonResponse(
        { doc: { id: 201, url: '/media/chapter-art.png' }, message: 'Media successfully created.' },
        201,
      )
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

    const chapterCreateCall = fetchMock.mock.calls.find(([url, init]) => {
      return String(url) === '/api/chapters' && init?.method === 'POST'
    })

    expect(chapterCreateCall).toBeTruthy()

    const chapterBody = JSON.parse(String(chapterCreateCall?.[1]?.body ?? '{}'))
    const bookCreateCall = fetchMock.mock.calls.find(([url, init]) => {
      return String(url) === '/api/books' && init?.method === 'POST'
    })
    const bookBody = JSON.parse(String(bookCreateCall?.[1]?.body ?? '{}'))

    expect(bookBody.author).toBe('Peter Brown')
    expect(bookBody.description).toBe('A robot escapes into the wild and learns to survive.')
    expect(bookBody.language).toBe('en-GB')
    expect(bookBody.publisher).toBe('Farrar, Straus and Giroux')
    expect(bookBody.publicationDate).toBe('2021-09-21')
    expect(bookBody.isbn).toBe('9780316475152')
    expect(bookBody.subjects).toEqual([{ subject: 'Children' }, { subject: 'Adventure' }])
    expect(bookBody.epubVersion).toBe('3')

    expect(chapterBody.title).toBe('Chapter 1 > Intro')
    expect(chapterBody.chapterSourceKey).toBe('toc-1-1::OEBPS/ch1.xhtml::chapter-1')
    expect(chapterBody.slug).toBe(`${createImportedBookSlug('Chapter 1 > Intro', bookBody.language)}-1`)

    const mediaCall = fetchMock.mock.calls.find(([url, init]) => {
      return String(url) === '/api/media' && init?.method === 'POST'
    })

    expect(mediaCall).toBeTruthy()

    const mediaBody = mediaCall?.[1]?.body as FormData | undefined

    expect(mediaBody).toBeInstanceOf(FormData)
    expect(mediaBody?.get('alt')).toBe(
      createImportedBookMediaAltText(bookBody.title, bookBody.sourceHash, 1, 'Chapter art'),
    )
    expect(JSON.parse(String(mediaBody?.get('_payload') ?? '{}'))).toEqual({
      alt: createImportedBookMediaAltText(bookBody.title, bookBody.sourceHash, 1, 'Chapter art'),
    })

    const bookPatchCalls = fetchMock.mock.calls.filter(([url, init]) => {
      return String(url).startsWith('/api/books/101') && init?.method === 'PATCH'
    })

    expect(bookPatchCalls.length).toBeGreaterThan(0)

    const totalsPatchCall = bookPatchCalls.find(([, init]) => {
      const body = JSON.parse(String(init?.body ?? '{}'))
      return typeof body.chapterCount === 'number' && typeof body.totalWordCount === 'number'
    })

    expect(totalsPatchCall).toBeTruthy()

    const totalsPatchBody = JSON.parse(String(totalsPatchCall?.[1]?.body ?? '{}'))
    expect(totalsPatchBody.chapterCount).toBe(1)
    expect(totalsPatchBody.totalWordCount).toBeGreaterThan(0)

    expect(refreshMock).toHaveBeenCalledTimes(1)

    const finalPatchBody = JSON.parse(String(bookPatchCalls.at(-1)?.[1]?.body ?? '{}'))

    expect(finalPatchBody.importStatus).toBe('ready')
    expect(finalPatchBody.syncStatus).toBe('clean')
    expect(finalPatchBody.importCompletedChapters).toBe(1)
  })

  it('keeps footnotes scoped to the current chapter during conversion', async () => {
    const collectFootnoteDefinitions = vi.mocked(collectFootnoteDefinitionsFromHTML)
    const convertChapterLexicalState = vi.mocked(convertHtmlToChapterLexicalState)
    const observedFootnoteContents: Array<string | null> = []

    collectFootnoteDefinitions.mockReset()
    convertChapterLexicalState.mockReset()

    collectFootnoteDefinitions.mockImplementation((html: string) => {
      if (html.includes('Chapter 1 note')) {
        return new Map([
          ['fn1', { noteId: 'fn1', content: 'Chapter 1 note' }],
        ])
      }

      if (html.includes('Chapter 2 note')) {
        return new Map([
          ['fn1', { noteId: 'fn1', content: 'Chapter 2 note' }],
        ])
      }

      return new Map()
    })

    convertChapterLexicalState.mockImplementation((_html: string, options) => {
      observedFootnoteContents.push(options?.footnotesById?.get('fn1')?.content ?? null)
      return simpleLexicalState
    })

    currentMockBook = createMockBook([
      '<h1>Chapter 1</h1><p>Intro</p><aside epub:type="footnote" id="fn1"><p>Chapter 1 note</p></aside>',
      '<h1>Chapter 2</h1><p>Second chapter</p><aside epub:type="footnote" id="fn1"><p>Chapter 2 note</p></aside>',
    ])

    installFetchMock()

    render(createElement(EpubImporter))

    const input = screen.getByLabelText('Select EPUB file') as HTMLInputElement
    const epubFile = createTestEpubFile()

    fireEvent.change(input, { target: { files: [epubFile] } })

    await waitFor(() => {
      expect(
        screen.getByText((_, element) => element?.textContent === 'Phase: Done'),
      ).toBeTruthy()
    })

    expect(observedFootnoteContents).toEqual(['Chapter 1 note', 'Chapter 2 note'])
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

  // Gap 6 — Import Reliability and Partial Resumption

  it('9.5: patches importStatus as canceled (not failed) when an AbortError is thrown', async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input)
      const method = (init?.method ?? 'GET').toUpperCase()

      if (method === 'GET' && url.startsWith('/api/books?')) {
        return createJsonResponse({ docs: [] })
      }

      if (method === 'POST' && url === '/api/books') {
        return createJsonResponse({ doc: { id: 101, title: 'Test' } }, 201)
      }

      if (method === 'PATCH' && url.startsWith('/api/books/')) {
        return createJsonResponse({ id: 101, updatedAt: new Date().toISOString() })
      }

      if (method === 'GET' && url.startsWith('/api/media?')) {
        return createJsonResponse({ docs: [] })
      }

      if (method === 'GET' && url.startsWith('/api/chapters?')) {
        return createJsonResponse({ docs: [] })
      }

      if (method === 'POST' && url === '/api/media') {
        return createJsonResponse({ doc: { id: 201, url: '/media/img.png' } }, 201)
      }

      if (method === 'POST' && url === '/api/chapters') {
        // Simulate the abort signal firing during chapter creation.
        throw new DOMException('Import canceled by user.', 'AbortError')
      }

      throw new Error(`Unhandled fetch: ${method} ${url}`)
    })

    vi.stubGlobal('fetch', fetchMock)

    render(createElement(EpubImporter))

    const input = screen.getByLabelText('Select EPUB file') as HTMLInputElement
    fireEvent.change(input, { target: { files: [createTestEpubFile()] } })

    await waitFor(() => {
      expect(
        screen.getByText((_, element) => element?.textContent === 'Phase: Canceled'),
      ).toBeTruthy()
    })

    const bookPatchCalls = fetchMock.mock.calls.filter(([url, init]) => {
      return String(url).startsWith('/api/books/101') && init?.method === 'PATCH'
    })

    // The last book PATCH must use 'canceled', never 'failed'.
    const canceledPatch = bookPatchCalls.find(([, init]) => {
      const body = JSON.parse(String(init?.body ?? '{}'))
      return body.importStatus === 'canceled'
    })

    expect(canceledPatch).toBeTruthy()

    for (const [, init] of bookPatchCalls) {
      const body = JSON.parse(String(init?.body ?? '{}'))

      if ('importStatus' in body) {
        expect(body.importStatus).not.toBe('failed')
      }
    }
  })

  it('9.3: includes importFailureLog in the ready patch when chapters fail with an error', async () => {
    const fetchMock = installFetchMock({
      failChapterCreate: true,
    })

    render(createElement(EpubImporter))

    const input = screen.getByLabelText('Select EPUB file') as HTMLInputElement
    fireEvent.change(input, { target: { files: [createTestEpubFile()] } })

    await waitFor(() => {
      expect(
        screen.getByText((_, element) => element?.textContent === 'Phase: Done'),
      ).toBeTruthy()
    })

    const bookPatchCalls = fetchMock.mock.calls.filter(([url, init]) => {
      return String(url).startsWith('/api/books/101') && init?.method === 'PATCH'
    })

    const readyPatch = bookPatchCalls.find(([, init]) => {
      const body = JSON.parse(String(init?.body ?? '{}'))
      return body.importStatus === 'ready'
    })

    expect(readyPatch).toBeTruthy()

    const readyPatchBody = JSON.parse(String(readyPatch?.[1]?.body ?? '{}'))

    // Failed chapters should appear in the structured failure log.
    expect(Array.isArray(readyPatchBody.importFailureLog)).toBe(true)
    expect(readyPatchBody.importFailureLog.length).toBeGreaterThan(0)

    const logEntry = readyPatchBody.importFailureLog[0]
    expect(typeof logEntry.chapterIndex).toBe('number')
    expect(typeof logEntry.chapterTitle).toBe('string')
    expect(typeof logEntry.error).toBe('string')
    expect(typeof logEntry.timestamp).toBe('string')
  })

  it('9.3: omits importFailureLog (null) when all chapters succeed', async () => {
    const fetchMock = installFetchMock()

    render(createElement(EpubImporter))

    const input = screen.getByLabelText('Select EPUB file') as HTMLInputElement
    fireEvent.change(input, { target: { files: [createTestEpubFile()] } })

    await waitFor(() => {
      expect(
        screen.getByText((_, element) => element?.textContent === 'Phase: Done'),
      ).toBeTruthy()
    })

    const bookPatchCalls = fetchMock.mock.calls.filter(([url, init]) => {
      return String(url).startsWith('/api/books/101') && init?.method === 'PATCH'
    })

    const readyPatch = bookPatchCalls.find(([, init]) => {
      const body = JSON.parse(String(init?.body ?? '{}'))
      return body.importStatus === 'ready'
    })

    const readyPatchBody = JSON.parse(String(readyPatch?.[1]?.body ?? '{}'))

    expect(readyPatchBody.importFailureLog).toBeNull()
  })

  it('9.2: pre-warms the media filename cache when resuming an existing book', async () => {
    const fetchMock = installFetchMock({
      existingBooksDocs: [{ id: 900, title: 'The Wild Robot Escapes' }],
    })

    render(createElement(EpubImporter))

    const input = screen.getByLabelText('Select EPUB file') as HTMLInputElement
    fireEvent.change(input, { target: { files: [createTestEpubFile()] } })

    await waitFor(() => {
      expect(
        screen.getByText((_, element) => element?.textContent === 'Phase: Done'),
      ).toBeTruthy()
    })

    // Verify a media GET with the alt[contains] param was made (the pre-warm call).
    const prewarmCall = fetchMock.mock.calls.find(([url, init]) => {
      return (
        String(url).includes('/api/media?') &&
        (init?.method ?? 'GET') === 'GET' &&
        decodeURIComponent(String(url)).includes('where[alt][contains]')
      )
    })

    expect(prewarmCall).toBeTruthy()
  })

  it('9.2: does not pre-warm the media cache for a fresh import (no existing book)', async () => {
    const fetchMock = installFetchMock()

    render(createElement(EpubImporter))

    const input = screen.getByLabelText('Select EPUB file') as HTMLInputElement
    fireEvent.change(input, { target: { files: [createTestEpubFile()] } })

    await waitFor(() => {
      expect(
        screen.getByText((_, element) => element?.textContent === 'Phase: Done'),
      ).toBeTruthy()
    })

    const prewarmCall = fetchMock.mock.calls.find(([url, init]) => {
      return (
        String(url).includes('/api/media?') &&
        (init?.method ?? 'GET') === 'GET' &&
        decodeURIComponent(String(url)).includes('where[alt][contains]')
      )
    })

    expect(prewarmCall).toBeUndefined()
  })

  it('9.1: reuses the chapter document across retry attempts to avoid duplicate image uploads', async () => {
    let chapterCreateAttempts = 0
    let mediaUploadAttempts = 0

    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input)
      const method = (init?.method ?? 'GET').toUpperCase()

      if (method === 'GET' && url.startsWith('/api/books?')) {
        return createJsonResponse({ docs: [] })
      }

      if (method === 'POST' && url === '/api/books') {
        return createJsonResponse({ doc: { id: 101, title: 'Test' } }, 201)
      }

      if (method === 'PATCH' && url.startsWith('/api/books/')) {
        return createJsonResponse({ id: 101, updatedAt: new Date().toISOString() })
      }

      if (method === 'GET' && url.startsWith('/api/media?')) {
        return createJsonResponse({ docs: [] })
      }

      if (method === 'GET' && url.startsWith('/api/chapters?')) {
        return createJsonResponse({ docs: [] })
      }

      if (method === 'POST' && url === '/api/media') {
        mediaUploadAttempts += 1
        return createJsonResponse({ doc: { id: 201, url: '/media/img.png' } }, 201)
      }

      if (method === 'POST' && url === '/api/chapters') {
        chapterCreateAttempts += 1
        // Fail the first attempt to trigger a retry.
        if (chapterCreateAttempts === 1) {
          return createJsonResponse({ message: 'Temporary failure' }, 500)
        }
        return createJsonResponse({ id: 301 }, 201)
      }

      throw new Error(`Unhandled fetch: ${method} ${url}`)
    })

    vi.stubGlobal('fetch', fetchMock)

    render(createElement(EpubImporter))

    const input = screen.getByLabelText('Select EPUB file') as HTMLInputElement
    fireEvent.change(input, { target: { files: [createTestEpubFile()] } })

    await waitFor(() => {
      expect(
        screen.getByText((_, element) => element?.textContent === 'Phase: Done'),
      ).toBeTruthy()
    })

    expect(chapterCreateAttempts).toBe(2)
    // The image should be uploaded exactly once even though the chapter was retried.
    expect(mediaUploadAttempts).toBe(1)
  })
})
