import JSZip from 'jszip'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { runEpubExportPipeline } from '@/utils/epubExportPipeline'

describe('runEpubExportPipeline', () => {
  let fetchMock: ReturnType<typeof vi.fn>

  beforeEach(() => {
    fetchMock = vi.fn()
    global.fetch = fetchMock
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  const mockFetchResponse = (data: Record<string, unknown>) => {
    const jsonString = JSON.stringify(data)
    return {
      ok: true,
      status: 200,
      text: () => Promise.resolve(jsonString),
      json: () => Promise.resolve(data),
    }
  }

  const createManifestResponse = (overrides?: {
    totalChapters?: number
    chapterIndex?: Array<Record<string, unknown>>
  }) => ({
    data: {
      bookExportManifest: {
        filename: 'my-book.epub',
        pageSize: 2,
        totalChapters: overrides?.totalChapters ?? 2,
        totalPages: Math.ceil((overrides?.totalChapters ?? 2) / 2),
        book: {
          id: 'book-1',
          title: 'My Book',
          slug: 'my-book',
          author: 'Jane Doe',
          description: 'A test book',
          language: 'en',
          publisher: 'Test Press',
          publicationDate: '2024-06-15',
          isbn: '9781234567890',
          epubVersion: '3',
          updatedAt: '2024-01-15T10:30:00.000Z',
          cover: null,
        },
        chapterIndex: overrides?.chapterIndex ?? [
          { id: 'ch-1', order: 1, title: 'Introduction', slug: 'introduction', chapterSourceKey: null },
          { id: 'ch-2', order: 2, title: 'The Forest', slug: 'the-forest', chapterSourceKey: null },
        ],
      },
    },
  })

  const createChunkResponse = (page: number, chapters: Array<Record<string, unknown>>) => ({
    data: {
      bookExportChunk: {
        page,
        totalPages: Math.ceil(chapters.length / 2) || 1,
        chapters,
        media: [],
      },
    },
  })

  it('fetches manifest first and emits chapters-known', async () => {
    fetchMock.mockResolvedValueOnce(mockFetchResponse(createManifestResponse()))
    fetchMock.mockResolvedValueOnce(
      mockFetchResponse(
        createChunkResponse(1, [
          {
            id: 'ch-1',
            order: 1,
            title: 'Introduction',
            content: {
              root: {
                type: 'root',
                children: [
                  {
                    type: 'paragraph',
                    children: [{ type: 'text', text: 'Hello world', format: 0 }],
                  },
                ],
              },
            },
          },
          {
            id: 'ch-2',
            order: 2,
            title: 'The Forest',
            content: {
              root: {
                type: 'root',
                children: [
                  {
                    type: 'paragraph',
                    children: [{ type: 'text', text: 'Deep woods', format: 0 }],
                  },
                ],
              },
            },
          },
        ]),
      ),
    )

    const controller = new AbortController()
    const events: Array<{ type: string; [key: string]: unknown }> = []

    for await (const event of runEpubExportPipeline({ bookId: 'book-1', signal: controller.signal })) {
      events.push(event as never)
    }

    const manifestCall = fetchMock.mock.calls.find((call: unknown[]) =>
      String((call[1] as Record<string, unknown>)?.body).includes('bookExportManifest'),
    )
    expect(manifestCall).toBeTruthy()

    const chaptersKnown = events.find((e) => e.type === 'chapters-known')
    expect(chaptersKnown).toMatchObject({ type: 'chapters-known', totalChapters: 2 })
  })

  it('serializes chunked chapters in order', async () => {
    fetchMock.mockResolvedValueOnce(mockFetchResponse(createManifestResponse()))
    fetchMock.mockResolvedValueOnce(
      mockFetchResponse(
        createChunkResponse(1, [
          {
            id: 'ch-1',
            order: 1,
            title: 'Introduction',
            content: {
              root: {
                type: 'root',
                children: [
                  {
                    type: 'paragraph',
                    children: [{ type: 'text', text: 'First', format: 0 }],
                  },
                ],
              },
            },
          },
          {
            id: 'ch-2',
            order: 2,
            title: 'The Forest',
            content: {
              root: {
                type: 'root',
                children: [
                  {
                    type: 'paragraph',
                    children: [{ type: 'text', text: 'Second', format: 0 }],
                  },
                ],
              },
            },
          },
        ]),
      ),
    )

    const controller = new AbortController()
    const events: Array<{ type: string; [key: string]: unknown }> = []

    for await (const event of runEpubExportPipeline({ bookId: 'book-1', signal: controller.signal })) {
      events.push(event as never)
    }

    const serializedEvents = events.filter((e) => e.type === 'chapter-serialized')
    expect(serializedEvents).toHaveLength(2)
    expect(serializedEvents[0]).toMatchObject({ completed: 1, total: 2 })
    expect(serializedEvents[1]).toMatchObject({ completed: 2, total: 2 })
  })

  it('emits done with a blob and filename', async () => {
    fetchMock.mockResolvedValueOnce(mockFetchResponse(createManifestResponse()))
    fetchMock.mockResolvedValueOnce(
      mockFetchResponse(
        createChunkResponse(1, [
          {
            id: 'ch-1',
            order: 1,
            title: 'Introduction',
            content: {
              root: {
                type: 'root',
                children: [],
              },
            },
          },
        ]),
      ),
    )

    const controller = new AbortController()
    const events: Array<{ type: string; [key: string]: unknown }> = []

    for await (const event of runEpubExportPipeline({ bookId: 'book-1', signal: controller.signal })) {
      events.push(event as never)
    }

    const doneEvent = events.find((e) => e.type === 'done')
    expect(doneEvent).toBeTruthy()
    expect(doneEvent).toMatchObject({ filename: 'my-book.epub' })
    expect((doneEvent as Record<string, unknown>)?.blob).toBeInstanceOf(Blob)
  })

  it('aborts cleanly when signal is triggered', async () => {
    fetchMock.mockImplementation(() =>
      Promise.resolve(
        mockFetchResponse({
          data: {
            bookExportManifest: {
              filename: 'my-book.epub',
              pageSize: 2,
              totalChapters: 2,
              totalPages: 1,
              book: {
                id: 'book-1',
                title: 'My Book',
                slug: 'my-book',
                author: null,
                description: null,
                language: null,
                publisher: null,
                publicationDate: null,
                isbn: null,
                epubVersion: null,
                updatedAt: null,
                cover: null,
              },
              chapterIndex: [
                { id: 'ch-1', order: 1, title: 'Intro', slug: 'intro', chapterSourceKey: null },
              ],
            },
          },
        }),
      ),
    )

    const controller = new AbortController()
    const events: Array<{ type: string; [key: string]: unknown }> = []

    // Abort immediately
    controller.abort()

    for await (const event of runEpubExportPipeline({ bookId: 'book-1', signal: controller.signal })) {
      events.push(event as never)
    }

    const canceledEvent = events.find((e) => e.type === 'phase' && e.phase === 'Canceled')
    expect(canceledEvent).toBeTruthy()
  })

  it('forwards warnings from the serializer', async () => {
    fetchMock.mockResolvedValueOnce(mockFetchResponse(createManifestResponse()))
    fetchMock.mockResolvedValueOnce(
      mockFetchResponse(
        createChunkResponse(1, [
          {
            id: 'ch-1',
            order: 1,
            title: 'Introduction',
            content: {
              root: {
                type: 'root',
                children: [
                  {
                    type: 'epub-internal-link',
                    fields: { epubHref: 'unknown.xhtml' },
                    children: [{ type: 'text', text: 'Missing', format: 0 }],
                  },
                ],
              },
            },
          },
        ]),
      ),
    )

    const controller = new AbortController()
    const events: Array<{ type: string; [key: string]: unknown }> = []

    for await (const event of runEpubExportPipeline({ bookId: 'book-1', signal: controller.signal })) {
      events.push(event as never)
    }

    const warnings = events.filter((e) => e.type === 'warning')
    expect(warnings.length).toBeGreaterThan(0)
    expect(warnings[0]).toMatchObject({
      message: expect.stringContaining('Unresolved'),
    })
  })

  it('deduplicates asset downloads across chunks', async () => {
    fetchMock.mockResolvedValueOnce(mockFetchResponse(createManifestResponse({ totalChapters: 2 })))

    // Page 1: two chapters referencing the same image
    fetchMock.mockResolvedValueOnce(
      mockFetchResponse({
        data: {
          bookExportChunk: {
            page: 1,
            totalPages: 1,
            chapters: [
              {
                id: 'ch-1',
                order: 1,
                title: 'Chapter 1',
                content: {
                  root: {
                    type: 'root',
                    children: [
                      {
                        type: 'upload',
                        value: 101,
                        fields: { alt: 'Image 1' },
                      },
                    ],
                  },
                },
              },
              {
                id: 'ch-2',
                order: 2,
                title: 'Chapter 2',
                content: {
                  root: {
                    type: 'root',
                    children: [
                      {
                        type: 'upload',
                        value: 101,
                        fields: { alt: 'Image 1 again' },
                      },
                    ],
                  },
                },
              },
            ],
            media: [
              {
                id: 101,
                filename: 'image.png',
                mimeType: 'image/png',
                url: 'https://example.com/image.png',
                optimizedUrl: null,
                alt: 'Image 1',
              },
            ],
          },
        },
      }),
    )

    // Mock asset fetch
    fetchMock.mockResolvedValueOnce({
      ok: true,
      text: () => Promise.resolve('fake-image'),
      blob: () => Promise.resolve(new Blob(['fake-image'])),
    })

    const controller = new AbortController()
    const events: Array<{ type: string; [key: string]: unknown }> = []

    for await (const event of runEpubExportPipeline({ bookId: 'book-1', signal: controller.signal })) {
      events.push(event as never)
    }

    // There should be only 1 asset-downloaded event even though 2 chapters reference the same image
    const assetEvents = events.filter((e) => e.type === 'asset-downloaded')
    expect(assetEvents).toHaveLength(1)
    expect(assetEvents[0]).toMatchObject({ completed: 1, total: 1 })

    const unresolvedUploadWarnings = events.filter(
      (e) => e.type === 'warning' && String(e.message).includes('Unresolved upload node'),
    )
    expect(unresolvedUploadWarnings).toHaveLength(0)
  })

  it('iterates multiple chunk pages', async () => {
    fetchMock.mockResolvedValueOnce(
      mockFetchResponse(
        createManifestResponse({
          totalChapters: 4,
          chapterIndex: [
            { id: 'ch-1', order: 1, title: 'A', slug: 'a', chapterSourceKey: null },
            { id: 'ch-2', order: 2, title: 'B', slug: 'b', chapterSourceKey: null },
            { id: 'ch-3', order: 3, title: 'C', slug: 'c', chapterSourceKey: null },
            { id: 'ch-4', order: 4, title: 'D', slug: 'd', chapterSourceKey: null },
          ],
        }),
      ),
    )

    // Page 1
    fetchMock.mockResolvedValueOnce(
      mockFetchResponse({
        data: {
          bookExportChunk: {
            page: 1,
            totalPages: 2,
            chapters: [
              {
                id: 'ch-1',
                order: 1,
                title: 'A',
                content: { root: { type: 'root', children: [{ type: 'paragraph', children: [{ type: 'text', text: 'A', format: 0 }] }] } },
              },
              {
                id: 'ch-2',
                order: 2,
                title: 'B',
                content: { root: { type: 'root', children: [{ type: 'paragraph', children: [{ type: 'text', text: 'B', format: 0 }] }] } },
              },
            ],
            media: [],
          },
        },
      }),
    )

    // Page 2
    fetchMock.mockResolvedValueOnce(
      mockFetchResponse({
        data: {
          bookExportChunk: {
            page: 2,
            totalPages: 2,
            chapters: [
              {
                id: 'ch-3',
                order: 3,
                title: 'C',
                content: { root: { type: 'root', children: [{ type: 'paragraph', children: [{ type: 'text', text: 'C', format: 0 }] }] } },
              },
              {
                id: 'ch-4',
                order: 4,
                title: 'D',
                content: { root: { type: 'root', children: [{ type: 'paragraph', children: [{ type: 'text', text: 'D', format: 0 }] }] } },
              },
            ],
            media: [],
          },
        },
      }),
    )

    const controller = new AbortController()
    const events: Array<{ type: string; [key: string]: unknown }> = []

    for await (const event of runEpubExportPipeline({ bookId: 'book-1', signal: controller.signal })) {
      events.push(event as never)
    }

    const serializedEvents = events.filter((e) => e.type === 'chapter-serialized')
    expect(serializedEvents).toHaveLength(4)
    expect(serializedEvents[3]).toMatchObject({ completed: 4, total: 4 })
  })

  it('downloads cover image when present', async () => {
    fetchMock.mockResolvedValueOnce(
      mockFetchResponse({
        data: {
          bookExportManifest: {
            filename: 'my-book.epub',
            pageSize: 2,
            totalChapters: 1,
            totalPages: 1,
            book: {
              id: 'book-1',
              title: 'My Book',
              slug: 'my-book',
              author: null,
              description: null,
              language: 'en',
              publisher: null,
              publicationDate: null,
              isbn: null,
              epubVersion: null,
              updatedAt: null,
              cover: {
                id: 999,
                filename: 'cover.jpg',
                mimeType: 'image/jpeg',
                url: 'https://example.com/cover.jpg',
                optimizedUrl: null,
                alt: 'Cover',
              },
            },
            chapterIndex: [
              { id: 'ch-1', order: 1, title: 'Intro', slug: 'intro', chapterSourceKey: null },
            ],
          },
        },
      }),
    )

    fetchMock.mockResolvedValueOnce(
      mockFetchResponse({
        data: {
          bookExportChunk: {
            page: 1,
            totalPages: 1,
            chapters: [
              {
                id: 'ch-1',
                order: 1,
                title: 'Intro',
                content: { root: { type: 'root', children: [] } },
              },
            ],
            media: [],
          },
        },
      }),
    )

    // Cover asset fetch
    fetchMock.mockResolvedValueOnce({
      ok: true,
      text: () => Promise.resolve('fake-cover'),
      blob: () => Promise.resolve(new Blob(['fake-cover'])),
    })

    const controller = new AbortController()
    const events: Array<{ type: string; [key: string]: unknown }> = []

    for await (const event of runEpubExportPipeline({ bookId: 'book-1', signal: controller.signal })) {
      events.push(event as never)
    }

    const doneEvent = events.find((e) => e.type === 'done')
    expect(doneEvent).toBeTruthy()

    // Verify cover was fetched
    const coverFetchCall = fetchMock.mock.calls.find((call: unknown[]) =>
      String((call[0] as string)).includes('cover.jpg'),
    )
    expect(coverFetchCall).toBeTruthy()
  })

  it('uses the original asset URL for export when an optimized URL is also available', async () => {
    fetchMock.mockResolvedValueOnce(mockFetchResponse(createManifestResponse({ totalChapters: 1 })))

    fetchMock.mockResolvedValueOnce(
      mockFetchResponse({
        data: {
          bookExportChunk: {
            page: 1,
            totalPages: 1,
            chapters: [
              {
                id: 'ch-1',
                order: 1,
                title: 'Chapter 1',
                content: {
                  root: {
                    type: 'root',
                    children: [
                      {
                        type: 'upload',
                        value: 101,
                        fields: { alt: 'Image 1' },
                      },
                    ],
                  },
                },
              },
            ],
            media: [
              {
                id: 101,
                filename: 'image.jpg',
                mimeType: 'image/jpeg',
                url: 'https://example.com/image.jpg',
                optimizedUrl: 'https://example.com/cdn-cgi/image/width=1920,quality=75,fit=scale-down,format=webp/image.jpg',
                alt: 'Image 1',
              },
            ],
          },
        },
      }),
    )

    fetchMock.mockResolvedValueOnce({
      ok: true,
      text: () => Promise.resolve('fake-image'),
      blob: () => Promise.resolve(new Blob(['fake-image'], { type: 'image/jpeg' })),
    })

    const controller = new AbortController()
    const events: Array<{ type: string; [key: string]: unknown }> = []

    for await (const event of runEpubExportPipeline({ bookId: 'book-1', signal: controller.signal })) {
      events.push(event as never)
    }

    const assetFetchCall = fetchMock.mock.calls.find((call: unknown[]) =>
      String(call[0]).includes('image.jpg') && !String(call[0]).includes('/api/graphql'),
    )
    expect(assetFetchCall?.[0]).toBe('https://example.com/image.jpg')
  })

  it('falls back to the optimized asset URL when the original URL is unavailable', async () => {
    const zipFileSpy = vi.spyOn(JSZip.prototype, 'file')

    fetchMock.mockResolvedValueOnce(mockFetchResponse(createManifestResponse({ totalChapters: 1 })))

    fetchMock.mockResolvedValueOnce(
      mockFetchResponse({
        data: {
          bookExportChunk: {
            page: 1,
            totalPages: 1,
            chapters: [
              {
                id: 'ch-1',
                order: 1,
                title: 'Chapter 1',
                content: {
                  root: {
                    type: 'root',
                    children: [
                      {
                        type: 'upload',
                        value: 101,
                        fields: { alt: 'Image 1' },
                      },
                    ],
                  },
                },
              },
            ],
            media: [
              {
                id: 101,
                filename: 'image.jpg',
                mimeType: 'image/jpeg',
                url: '',
                optimizedUrl: 'https://example.com/cdn-cgi/image/width=1920,quality=75,fit=scale-down,format=webp/image.jpg',
                alt: 'Image 1',
              },
            ],
          },
        },
      }),
    )

    fetchMock.mockResolvedValueOnce({
      ok: true,
      text: () => Promise.resolve('fake-image'),
      blob: () => Promise.resolve(new Blob(['fake-image'], { type: 'image/webp' })),
    })

    const controller = new AbortController()

    for await (const _event of runEpubExportPipeline({ bookId: 'book-1', signal: controller.signal })) {
      // Exhaust the pipeline.
    }

    const assetFetchCall = fetchMock.mock.calls.find((call: unknown[]) =>
      String(call[0]).includes('format=webp/image.jpg'),
    )
    expect(assetFetchCall?.[0]).toBe(
      'https://example.com/cdn-cgi/image/width=1920,quality=75,fit=scale-down,format=webp/image.jpg',
    )
    expect(zipFileSpy).toHaveBeenCalledWith(
      'OEBPS/images/101-image.webp',
      expect.any(Blob),
    )
  })

  it('emits warning when asset download fails', async () => {
    fetchMock.mockResolvedValueOnce(mockFetchResponse(createManifestResponse({ totalChapters: 1 })))

    fetchMock.mockResolvedValueOnce(
      mockFetchResponse({
        data: {
          bookExportChunk: {
            page: 1,
            totalPages: 1,
            chapters: [
              {
                id: 'ch-1',
                order: 1,
                title: 'Chapter 1',
                content: {
                  root: {
                    type: 'root',
                    children: [
                      {
                        type: 'upload',
                        value: 101,
                        fields: { alt: 'Image 1' },
                      },
                    ],
                  },
                },
              },
            ],
            media: [
              {
                id: 101,
                filename: 'image.png',
                mimeType: 'image/png',
                url: 'https://example.com/image.png',
                optimizedUrl: null,
                alt: 'Image 1',
              },
            ],
          },
        },
      }),
    )

    // Asset fetch fails
    fetchMock.mockResolvedValueOnce({
      ok: false,
      status: 404,
      statusText: 'Not Found',
      text: () => Promise.resolve('Not Found'),
    })

    const controller = new AbortController()
    const events: Array<{ type: string; [key: string]: unknown }> = []

    for await (const event of runEpubExportPipeline({ bookId: 'book-1', signal: controller.signal })) {
      events.push(event as never)
    }

    const warning = events.find(
      (e) => e.type === 'warning' && String(e.message).includes('Failed to download asset'),
    )
    expect(warning).toBeTruthy()
  })

  it('cancels cleanly when aborted during asset download', async () => {
    fetchMock.mockResolvedValueOnce(mockFetchResponse(createManifestResponse({ totalChapters: 1 })))

    fetchMock.mockResolvedValueOnce(
      mockFetchResponse({
        data: {
          bookExportChunk: {
            page: 1,
            totalPages: 1,
            chapters: [
              {
                id: 'ch-1',
                order: 1,
                title: 'Chapter 1',
                content: {
                  root: {
                    type: 'root',
                    children: [
                      {
                        type: 'upload',
                        value: 101,
                        fields: { alt: 'Image 1' },
                      },
                    ],
                  },
                },
              },
            ],
            media: [
              {
                id: 101,
                filename: 'image.png',
                mimeType: 'image/png',
                url: 'https://example.com/image.png',
                optimizedUrl: null,
                alt: 'Image 1',
              },
            ],
          },
        },
      }),
    )

    // Asset fetch throws AbortError
    fetchMock.mockImplementationOnce(() =>
      Promise.reject(new DOMException('The operation was aborted.', 'AbortError')),
    )

    const controller = new AbortController()
    const events: Array<{ type: string; [key: string]: unknown }> = []

    for await (const event of runEpubExportPipeline({ bookId: 'book-1', signal: controller.signal })) {
      events.push(event as never)
    }

    const canceledEvent = events.find((e) => e.type === 'phase' && e.phase === 'Canceled')
    expect(canceledEvent).toBeTruthy()

    const warning = events.find(
      (e) => e.type === 'warning' && String(e.message).includes('Failed to download asset'),
    )
    expect(warning).toBeFalsy()
  })
})
