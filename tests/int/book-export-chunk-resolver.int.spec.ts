import { afterEach, describe, expect, it, vi } from 'vitest'

import { bookExportChunkResolver } from '@/graphql/queries/BookExportChunk/resolver'

const createPayloadMock = (overrides?: {
  book?: Record<string, unknown> | null
  chapters?: Array<Record<string, unknown>>
  media?: Array<Record<string, unknown>>
}) => {
  const book = overrides?.book ?? null
  const chapters = overrides?.chapters ?? []
  const media = overrides?.media ?? []

  return {
    findByID: vi.fn().mockResolvedValue(book),
    find: vi.fn().mockImplementation(({ collection }: { collection: string }) => {
      if (collection === 'chapters') {
        return Promise.resolve({
          docs: chapters,
          totalPages: Math.ceil(chapters.length / 25),
        })
      }
      if (collection === 'media') {
        return Promise.resolve({ docs: media })
      }
      return Promise.resolve({ docs: [] })
    }),
  }
}

describe('bookExportChunkResolver', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('throws when the request is unauthenticated', async () => {
    await expect(
      bookExportChunkResolver(
        null,
        { bookId: 42, page: 1, limit: 25 },
        { req: { payload: createPayloadMock(), user: null } },
      ),
    ).rejects.toThrow('Unauthorized')
  })

  it('throws when the book does not belong to the current user', async () => {
    const payload = createPayloadMock({
      book: { id: 42, slug: 'my-book', createdBy: 99 },
    })

    await expect(
      bookExportChunkResolver(
        null,
        { bookId: 42, page: 1, limit: 25 },
        {
          req: {
            payload,
            user: { id: 88, role: 'user' },
          },
        },
      ),
    ).rejects.toThrow('Only the book owner can export this book')
  })

  it('returns paginated chapters and referenced media', async () => {
    const chapters = [
      {
        id: 1,
        order: 1,
        title: 'Intro',
        content: {
          root: {
            type: 'root',
            children: [
              {
                type: 'paragraph',
                children: [{ type: 'text', text: 'Hello' }],
              },
            ],
          },
        },
      },
      {
        id: 2,
        order: 2,
        title: 'Chapter 1',
        content: {
          root: {
            type: 'root',
            children: [
              {
                type: 'upload',
                value: 101,
                fields: { alt: 'Cover image' },
              },
            ],
          },
        },
      },
    ]

    const media = [
      {
        id: 101,
        filename: 'cover.png',
        mimeType: 'image/png',
        url: 'https://example.com/cover.png',
        optimizedUrl: 'https://example.com/cover-opt.png',
        alt: 'Cover image',
      },
    ]

    const payload = createPayloadMock({
      book: { id: 42, title: 'My Book', slug: 'my-book', createdBy: 99 },
      chapters,
      media,
    })

    const result = await bookExportChunkResolver(
      null,
      { bookId: 42, page: 1, limit: 25 },
      {
        req: {
          payload,
          user: { id: 99, role: 'user' },
        },
      },
    )

    expect(result.page).toBe(1)
    expect(result.chapters).toHaveLength(2)
    expect(result.chapters[0]?.content).toEqual(chapters[0]?.content)
    expect(result.chapters[1]?.content).toEqual(chapters[1]?.content)
    expect(result.media).toHaveLength(1)
    expect(result.media[0]).toMatchObject({
      id: '101',
      filename: 'cover.png',
      mimeType: 'image/png',
      url: 'https://example.com/cover.png',
      optimizedUrl: 'https://example.com/cover-opt.png',
      alt: 'Cover image',
    })
  })

  it('returns empty media when no uploads are referenced', async () => {
    const chapters = [
      {
        id: 1,
        order: 1,
        title: 'Intro',
        content: {
          root: {
            type: 'root',
            children: [
              {
                type: 'paragraph',
                children: [{ type: 'text', text: 'Hello' }],
              },
            ],
          },
        },
      },
    ]

    const payload = createPayloadMock({
      book: { id: 42, title: 'My Book', slug: 'my-book', createdBy: 99 },
      chapters,
    })

    const result = await bookExportChunkResolver(
      null,
      { bookId: 42, page: 1, limit: 25 },
      {
        req: {
          payload,
          user: { id: 99, role: 'user' },
        },
      },
    )

    expect(result.media).toHaveLength(0)
  })

  it('caps the chunk limit at the shared PAGE_SIZE', async () => {
    const payload = createPayloadMock({
      book: { id: 42, title: 'My Book', slug: 'my-book', createdBy: 99 },
      chapters: [],
    })

    await bookExportChunkResolver(
      null,
      { bookId: 42, page: 1, limit: 999 },
      {
        req: {
          payload,
          user: { id: 99, role: 'user' },
        },
      },
    )

    expect(payload.find).toHaveBeenCalledWith(
      expect.objectContaining({
        limit: 25,
      }),
    )
  })

  it('respects smaller client-provided limits', async () => {
    const payload = createPayloadMock({
      book: { id: 42, title: 'My Book', slug: 'my-book', createdBy: 99 },
      chapters: [],
    })

    await bookExportChunkResolver(
      null,
      { bookId: 42, page: 1, limit: 5 },
      {
        req: {
          payload,
          user: { id: 99, role: 'user' },
        },
      },
    )

    expect(payload.find).toHaveBeenCalledWith(
      expect.objectContaining({
        limit: 5,
      }),
    )
  })

  it('normalizes page to at least 1', async () => {
    const payload = createPayloadMock({
      book: { id: 42, title: 'My Book', slug: 'my-book', createdBy: 99 },
      chapters: [],
    })

    await bookExportChunkResolver(
      null,
      { bookId: 42, page: 0, limit: 25 },
      {
        req: {
          payload,
          user: { id: 99, role: 'user' },
        },
      },
    )

    expect(payload.find).toHaveBeenCalledWith(
      expect.objectContaining({
        page: 1,
      }),
    )
  })

  it('throws when book is not found', async () => {
    const payload = createPayloadMock({ book: null })

    await expect(
      bookExportChunkResolver(
        null,
        { bookId: 42, page: 1, limit: 25 },
        {
          req: {
            payload,
            user: { id: 99, role: 'user' },
          },
        },
      ),
    ).rejects.toThrow('Book not found')
  })

  it('allows admin users to export any book', async () => {
    const payload = createPayloadMock({
      book: { id: 42, title: 'Admin Book', slug: 'admin-book', createdBy: 99 },
      chapters: [],
    })

    const result = await bookExportChunkResolver(
      null,
      { bookId: 42, page: 1, limit: 25 },
      {
        req: {
          payload,
          user: { id: 1, role: 'admin' },
        },
      },
    )

    expect(result.chapters).toHaveLength(0)
  })
})
