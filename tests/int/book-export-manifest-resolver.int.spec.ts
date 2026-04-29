import { afterEach, describe, expect, it, vi } from 'vitest'

import { bookExportManifestResolver } from '@/graphql/queries/BookExportManifest/resolver'

const createPayloadMock = (overrides?: {
  book?: Record<string, unknown> | null
  chapters?: Array<Record<string, unknown>>
}) => {
  const book = overrides?.book ?? null
  const chapters = overrides?.chapters ?? []

  return {
    findByID: vi.fn().mockResolvedValue(book),
    find: vi.fn().mockResolvedValue({ docs: chapters, totalPages: Math.ceil(chapters.length / 25) }),
  }
}

describe('bookExportManifestResolver', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('throws when the request is unauthenticated', async () => {
    await expect(
      bookExportManifestResolver(
        null,
        { bookId: 42 },
        { req: { payload: createPayloadMock(), user: null } },
      ),
    ).rejects.toThrow('Unauthorized')
  })

  it('throws when the book does not belong to the current user', async () => {
    const payload = createPayloadMock({
      book: { id: 42, slug: 'my-book', createdBy: 99 },
    })

    await expect(
      bookExportManifestResolver(
        null,
        { bookId: 42 },
        {
          req: {
            payload,
            user: { id: 88, role: 'user' },
          },
        },
      ),
    ).rejects.toThrow('Only the book owner can export this book')
  })

  it('returns manifest for the book owner', async () => {
    const chapters = [
      { id: 1, order: 1, title: 'Intro', slug: 'intro', chapterSourceKey: 'toc::OEBPS/Text/intro.xhtml::1' },
      { id: 2, order: 2, title: 'Chapter 1', slug: 'chapter-1', chapterSourceKey: null },
    ]

    const payload = createPayloadMock({
      book: {
        id: 42,
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
        createdBy: 99,
        cover: {
          id: 100,
          filename: 'cover.jpg',
          mimeType: 'image/jpeg',
          url: 'https://example.com/cover.jpg',
          optimizedUrl: 'https://example.com/cover-optimized.jpg',
          alt: 'Cover image',
        },
      },
      chapters,
    })

    const result = await bookExportManifestResolver(
      null,
      { bookId: 42 },
      {
        req: {
          payload,
          user: { id: 99, role: 'user' },
        },
      },
    )

    expect(result.filename).toBe('my-book.epub')
    expect(result.pageSize).toBe(25)
    expect(result.totalChapters).toBe(2)
    expect(result.totalPages).toBe(1)
    expect(result.book.title).toBe('My Book')
    expect(result.book.slug).toBe('my-book')
    expect(result.book.author).toBe('Jane Doe')
    expect(result.book.language).toBe('en')
    expect(result.book.cover).toMatchObject({
      id: '100',
      filename: 'cover.jpg',
      mimeType: 'image/jpeg',
      url: 'https://example.com/cover.jpg',
      optimizedUrl: 'https://example.com/cover-optimized.jpg',
      alt: 'Cover image',
    })
    expect(result.chapterIndex).toHaveLength(2)
    expect(result.chapterIndex[0]).toMatchObject({
      id: '1',
      order: 1,
      title: 'Intro',
      slug: 'intro',
      chapterSourceKey: 'toc::OEBPS/Text/intro.xhtml::1',
    })
    expect(result.chapterIndex[1]).toMatchObject({
      id: '2',
      order: 2,
      title: 'Chapter 1',
      slug: 'chapter-1',
      chapterSourceKey: null,
    })
  })

  it('returns null cover when book has no cover', async () => {
    const payload = createPayloadMock({
      book: { id: 42, title: 'No Cover', slug: 'no-cover', createdBy: 99 },
      chapters: [],
    })

    const result = await bookExportManifestResolver(
      null,
      { bookId: 42 },
      {
        req: {
          payload,
          user: { id: 99, role: 'user' },
        },
      },
    )

    expect(result.book.cover).toBeNull()
  })

  it('throws when book is not found', async () => {
    const payload = createPayloadMock({ book: null })

    await expect(
      bookExportManifestResolver(
        null,
        { bookId: 42 },
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

    const result = await bookExportManifestResolver(
      null,
      { bookId: 42 },
      {
        req: {
          payload,
          user: { id: 1, role: 'admin' },
        },
      },
    )

    expect(result.book.title).toBe('Admin Book')
  })
})
