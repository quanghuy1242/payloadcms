import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { Bookmarks } from '@/collections/Bookmarks'
import { ReadingProgress } from '@/collections/ReadingProgress'
import { bookmarksResolver } from '@/graphql/queries/Bookmarks/resolver'
import { readingProgressResolver } from '@/graphql/queries/ReadingProgress/resolver'
import { createBookmarkResolver } from '@/graphql/mutations/CreateBookmark/resolver'
import { deleteBookmarkResolver } from '@/graphql/mutations/DeleteBookmark/resolver'
import { saveReadingProgressResolver } from '@/graphql/mutations/SaveReadingProgress/resolver'
import {
  bookmarksBeforeChangeHook,
  readingProgressBeforeChangeHook,
} from '@/utils/readingFeatures'

afterEach(() => {
  vi.restoreAllMocks()
})

describe('ReadingProgress collection', () => {
  it('has the required fields', () => {
    const fieldNames = ReadingProgress.fields.map((f) => ('name' in f ? f.name : ''))
    expect(fieldNames).toContain('user')
    expect(fieldNames).toContain('book')
    expect(fieldNames).toContain('chapter')
    expect(fieldNames).toContain('progress')
    expect(fieldNames).toContain('completedAt')
  })

  it('uses ownerAccess for read, update, and delete', () => {
    expect(ReadingProgress.access?.read).toEqual(expect.any(Function))
    expect(ReadingProgress.access?.update).toEqual(expect.any(Function))
    expect(ReadingProgress.access?.delete).toEqual(expect.any(Function))

    // Verify the access function behaves like ownerAccess('user')
    const readResult = ReadingProgress.access?.read?.({ req: { user: null } } as never)
    expect(readResult).toBe(false)

    const adminResult = ReadingProgress.access?.read?.({ req: { user: { id: 1, role: 'admin' } } } as never)
    expect(adminResult).toBe(true)

    const userResult = ReadingProgress.access?.read?.({ req: { user: { id: 99, role: 'user' } } } as never)
    expect(userResult).toEqual({ user: { equals: 99 } })
  })

  it('is hidden from the admin navigation', () => {
    expect(ReadingProgress.admin?.hidden).toBe(true)
  })

  it('has a beforeValidate enforceOwnershipHook', () => {
    const beforeValidateHooks = ReadingProgress.hooks?.beforeValidate ?? []
    expect(beforeValidateHooks.length).toBeGreaterThan(0)
  })

  it('has a beforeChange upsert hook', () => {
    const beforeChangeHooks = ReadingProgress.hooks?.beforeChange ?? []
    expect(beforeChangeHooks.length).toBeGreaterThan(0)
  })

  it('upserts on create when the same user and chapter already exist', async () => {
    const findMock = vi.fn().mockResolvedValue({ docs: [{ id: 42 }] })
    const findByIDMock = vi.fn().mockResolvedValue({ id: 7, book: 3 })

    const result = await readingProgressBeforeChangeHook({
      data: { user: 99, book: 3, chapter: 7, progress: 50 },
      operation: 'create',
      req: { payload: { find: findMock, findByID: findByIDMock } },
    } as never)

    expect(result).toEqual(
      expect.objectContaining({
        id: 42,
      }),
    )
    expect(findMock).toHaveBeenCalledWith(
      expect.objectContaining({
        collection: 'reading-progress',
        where: {
          and: [
            { user: { equals: 99 } },
            { chapter: { equals: 7 } },
          ],
        },
      }),
    )
  })

  it('rejects a chapter that does not belong to the selected book', async () => {
    const findByIDMock = vi.fn().mockResolvedValue({ id: 7, book: 4 })

    await expect(
      readingProgressBeforeChangeHook({
        data: { user: 99, book: 3, chapter: 7, progress: 50 },
        operation: 'create',
        req: { payload: { findByID: findByIDMock } },
      } as never),
    ).rejects.toThrow('Chapter does not belong to the selected book')
  })
})

describe('Bookmarks collection', () => {
  it('has the required fields', () => {
    const fieldNames = Bookmarks.fields.map((f) => ('name' in f ? f.name : ''))
    expect(fieldNames).toContain('user')
    expect(fieldNames).toContain('contentType')
    expect(fieldNames).toContain('chapter')
    expect(fieldNames).toContain('book')
  })

  it('uses ownerAccess for read, update, and delete', () => {
    expect(Bookmarks.access?.read).toEqual(expect.any(Function))
    expect(Bookmarks.access?.update).toEqual(expect.any(Function))
    expect(Bookmarks.access?.delete).toEqual(expect.any(Function))

    // Verify the access function behaves like ownerAccess('user')
    const readResult = Bookmarks.access?.read?.({ req: { user: null } } as never)
    expect(readResult).toBe(false)

    const adminResult = Bookmarks.access?.read?.({ req: { user: { id: 1, role: 'admin' } } } as never)
    expect(adminResult).toBe(true)

    const userResult = Bookmarks.access?.read?.({ req: { user: { id: 99, role: 'user' } } } as never)
    expect(userResult).toEqual({ user: { equals: 99 } })
  })

  it('is hidden from the admin navigation', () => {
    expect(Bookmarks.admin?.hidden).toBe(true)
  })

  it('has a beforeValidate enforceOwnershipHook', () => {
    const beforeValidateHooks = Bookmarks.hooks?.beforeValidate ?? []
    expect(beforeValidateHooks.length).toBeGreaterThan(0)
  })

  it('has a beforeChange upsert hook', () => {
    const beforeChangeHooks = Bookmarks.hooks?.beforeChange ?? []
    expect(beforeChangeHooks.length).toBeGreaterThan(0)
  })

  it('rejects inconsistent bookmark payloads', async () => {
    await expect(
      bookmarksBeforeChangeHook({
        data: { user: 99, contentType: 'chapter', chapter: 7, book: 3 },
        operation: 'create',
        req: { payload: { find: vi.fn() } },
      } as never),
    ).rejects.toThrow('Chapter bookmarks require chapterId only')
  })
})

describe('SaveReadingProgress GraphQL resolver', () => {
  it('creates a new reading progress record', async () => {
    const createMock = vi.fn().mockResolvedValue({ id: 1, progress: 45 })
    const findMock = vi.fn().mockResolvedValue({ docs: [] })
    const findByIDMock = vi.fn().mockResolvedValue({ id: 7, book: 3 })

    const result = await saveReadingProgressResolver(
      undefined,
      { chapterId: '7', bookId: '3', progress: 45 },
      {
        req: {
          payload: {
            find: findMock,
            create: createMock,
            findByID: findByIDMock,
          },
          user: { id: 99, role: 'user' },
        },
      },
    )

    expect(result.ok).toBe(true)
    expect(result.progress).toEqual({ id: 1, progress: 45 })
    expect(createMock).toHaveBeenCalledWith(
      expect.objectContaining({
        collection: 'reading-progress',
        data: expect.objectContaining({
          user: 99,
          book: 3,
          chapter: 7,
          progress: 45,
        }),
        overrideAccess: true,
      }),
    )
  })

  it('updates an existing record when progress increases', async () => {
    const updateMock = vi.fn().mockResolvedValue({ id: 1, progress: 60 })
    const findMock = vi.fn().mockResolvedValue({ docs: [{ id: 1, progress: 30 }] })
    const findByIDMock = vi.fn().mockResolvedValue({ id: 7, book: 3 })

    const result = await saveReadingProgressResolver(
      undefined,
      { chapterId: '7', bookId: '3', progress: 60 },
      {
        req: {
          payload: {
            find: findMock,
            update: updateMock,
            findByID: findByIDMock,
          },
          user: { id: 99, role: 'user' },
        },
      },
    )

    expect(result.ok).toBe(true)
    expect(updateMock).toHaveBeenCalledWith(
      expect.objectContaining({
        collection: 'reading-progress',
        id: 1,
        data: expect.objectContaining({ progress: 60 }),
        overrideAccess: true,
      }),
    )
  })

  it('does not update when new progress is lower', async () => {
    const updateMock = vi.fn()
    const findMock = vi.fn().mockResolvedValue({ docs: [{ id: 1, progress: 80 }] })
    const findByIDMock = vi.fn().mockResolvedValue({ id: 7, book: 3 })

    const result = await saveReadingProgressResolver(
      undefined,
      { chapterId: '7', bookId: '3', progress: 50 },
      {
        req: {
          payload: {
            find: findMock,
            update: updateMock,
            findByID: findByIDMock,
          },
          user: { id: 99, role: 'user' },
        },
      },
    )

    expect(result.ok).toBe(true)
    expect(updateMock).not.toHaveBeenCalled()
  })

  it('sets completedAt when progress reaches 95', async () => {
    const createMock = vi.fn().mockResolvedValue({ id: 1, progress: 95 })
    const findMock = vi.fn().mockResolvedValue({ docs: [] })
    const findByIDMock = vi.fn().mockResolvedValue({ id: 7, book: 3 })

    await saveReadingProgressResolver(
      undefined,
      { chapterId: '7', bookId: '3', progress: 95 },
      {
        req: {
          payload: {
            find: findMock,
            create: createMock,
            findByID: findByIDMock,
          },
          user: { id: 99, role: 'user' },
        },
      },
    )

    expect(createMock).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          completedAt: expect.any(String),
        }),
      }),
    )
  })

  it('rejects unauthenticated requests', async () => {
    await expect(
      saveReadingProgressResolver(
        undefined,
        { chapterId: '7', bookId: '3', progress: 50 },
        { req: { payload: {}, user: null } },
      ),
    ).rejects.toThrow('Unauthorized')
  })

  it('rejects a mismatched chapter and book', async () => {
    const findByIDMock = vi.fn().mockResolvedValue({ id: 7, book: 4 })

    await expect(
      saveReadingProgressResolver(
        undefined,
        { chapterId: '7', bookId: '3', progress: 50 },
        {
          req: {
            payload: { findByID: findByIDMock },
            user: { id: 99, role: 'user' },
          },
        },
      ),
    ).rejects.toThrow('Chapter does not belong to the selected book')
  })
})

describe('ReadingProgress GraphQL query resolver', () => {
  it('returns reading progress records for a book', async () => {
    const findMock = vi.fn().mockResolvedValue({
      docs: [
        { chapter: 7, progress: 45, completedAt: null, updatedAt: '2026-01-01T00:00:00Z' },
        { chapter: 8, progress: 100, completedAt: '2026-01-02T00:00:00Z', updatedAt: '2026-01-02T00:00:00Z' },
      ],
    })

    const result = await readingProgressResolver(
      undefined,
      { bookId: '3' },
      {
        req: {
          payload: { find: findMock },
          user: { id: 99, role: 'user' },
        },
      },
    )

    expect(result.records).toHaveLength(2)
    expect(result.records[0].chapterId).toBe(7)
    expect(result.records[0].progress).toBe(45)
    expect(findMock).toHaveBeenCalledWith(
      expect.objectContaining({
        collection: 'reading-progress',
        where: {
          and: [
            { user: { equals: 99 } },
            { book: { equals: 3 } },
          ],
        },
        limit: 1000,
        overrideAccess: true,
      }),
    )
  })

  it('rejects unauthenticated requests', async () => {
    await expect(
      readingProgressResolver(
        undefined,
        { bookId: '3' },
        { req: { payload: {}, user: null } },
      ),
    ).rejects.toThrow('Unauthorized')
  })
})

describe('CreateBookmark GraphQL resolver', () => {
  it('creates a new chapter bookmark', async () => {
    const createMock = vi.fn().mockResolvedValue({ id: 1, contentType: 'chapter', chapter: 7 })
    const findMock = vi.fn().mockResolvedValue({ docs: [] })
    const findByIDMock = vi.fn().mockResolvedValue({ id: 7 })

    const result = await createBookmarkResolver(
      undefined,
      { contentType: 'chapter', chapterId: '7' },
      {
        req: {
          payload: { find: findMock, create: createMock, findByID: findByIDMock },
          user: { id: 99, role: 'user' },
        },
      },
    )

    expect(result.created).toBe(true)
    expect(result.bookmark).toEqual({ id: 1, contentType: 'chapter', chapter: 7 })
    expect(createMock).toHaveBeenCalledWith(
      expect.objectContaining({
        collection: 'bookmarks',
        data: { user: 99, contentType: 'chapter', chapter: 7 },
        overrideAccess: true,
      }),
    )
  })

  it('creates a new book bookmark', async () => {
    const createMock = vi.fn().mockResolvedValue({ id: 2, contentType: 'book', book: 3 })
    const findMock = vi.fn().mockResolvedValue({ docs: [] })
    const findByIDMock = vi.fn().mockResolvedValue({ id: 3 })

    const result = await createBookmarkResolver(
      undefined,
      { contentType: 'book', bookId: '3' },
      {
        req: {
          payload: { find: findMock, create: createMock, findByID: findByIDMock },
          user: { id: 99, role: 'user' },
        },
      },
    )

    expect(result.created).toBe(true)
    expect(result.bookmark).toEqual({ id: 2, contentType: 'book', book: 3 })
  })

  it('returns existing bookmark without creating duplicate', async () => {
    const createMock = vi.fn()
    const findMock = vi.fn().mockResolvedValue({ docs: [{ id: 1, contentType: 'chapter', chapter: 7 }] })
    const findByIDMock = vi.fn().mockResolvedValue({ id: 7 })

    const result = await createBookmarkResolver(
      undefined,
      { contentType: 'chapter', chapterId: '7' },
      {
        req: {
          payload: { find: findMock, create: createMock, findByID: findByIDMock },
          user: { id: 99, role: 'user' },
        },
      },
    )

    expect(result.created).toBe(false)
    expect(result.bookmark).toEqual({ id: 1, contentType: 'chapter', chapter: 7 })
    expect(createMock).not.toHaveBeenCalled()
  })

  it('rejects invalid contentType', async () => {
    await expect(
      createBookmarkResolver(
        undefined,
        { contentType: 'invalid' },
        {
          req: {
            payload: {},
            user: { id: 99, role: 'user' },
          },
        },
      ),
    ).rejects.toThrow('Invalid contentType')
  })

  it('rejects inconsistent bookmark arguments', async () => {
    await expect(
      createBookmarkResolver(
        undefined,
        { contentType: 'chapter', chapterId: '7', bookId: '3' },
        {
          req: {
            payload: {},
            user: { id: 99, role: 'user' },
          },
        },
      ),
    ).rejects.toThrow('Chapter bookmarks require chapterId only')
  })

  it('rejects unauthenticated requests', async () => {
    await expect(
      createBookmarkResolver(
        undefined,
        { contentType: 'chapter', chapterId: '7' },
        { req: { payload: {}, user: null } },
      ),
    ).rejects.toThrow('Unauthorized')
  })
})

describe('DeleteBookmark GraphQL resolver', () => {
  it('deletes the user own bookmark', async () => {
    const deleteMock = vi.fn().mockResolvedValue({})
    const findByIDMock = vi.fn().mockResolvedValue({ id: 1, user: 99 })

    const result = await deleteBookmarkResolver(
      undefined,
      { id: '1' },
      {
        req: {
          payload: { findByID: findByIDMock, delete: deleteMock },
          user: { id: 99, role: 'user' },
        },
      },
    )

    expect(result.ok).toBe(true)
    expect(deleteMock).toHaveBeenCalledWith(
      expect.objectContaining({
        collection: 'bookmarks',
        id: 1,
        overrideAccess: true,
      }),
    )
  })

  it('allows admin to delete any bookmark', async () => {
    const deleteMock = vi.fn().mockResolvedValue({})
    const findByIDMock = vi.fn().mockResolvedValue({ id: 1, user: 88 })

    const result = await deleteBookmarkResolver(
      undefined,
      { id: '1' },
      {
        req: {
          payload: { findByID: findByIDMock, delete: deleteMock },
          user: { id: 1, role: 'admin' },
        },
      },
    )

    expect(result.ok).toBe(true)
  })

  it('rejects deleting another user bookmark', async () => {
    const findByIDMock = vi.fn().mockResolvedValue({ id: 1, user: 88 })

    await expect(
      deleteBookmarkResolver(
        undefined,
        { id: '1' },
        {
          req: {
            payload: { findByID: findByIDMock },
            user: { id: 99, role: 'user' },
          },
        },
      ),
    ).rejects.toThrow('Forbidden')
  })

  it('rejects deleting non-existent bookmark', async () => {
    const findByIDMock = vi.fn().mockResolvedValue(null)

    await expect(
      deleteBookmarkResolver(
        undefined,
        { id: '999' },
        {
          req: {
            payload: { findByID: findByIDMock },
            user: { id: 99, role: 'user' },
          },
        },
      ),
    ).rejects.toThrow('Bookmark not found')
  })
})

describe('Bookmarks GraphQL query resolver', () => {
  it('returns paginated bookmarks for the current user', async () => {
    const findMock = vi
      .fn()
      .mockResolvedValueOnce({
        docs: [{ id: 1, contentType: 'book', book: 11 }, { id: 2, contentType: 'book', book: 12 }],
        totalDocs: 2,
      })
      .mockResolvedValueOnce({
        docs: [{ id: 11, title: 'Book 11' }, { id: 12, title: 'Book 12' }],
        totalDocs: 2,
      })
      .mockResolvedValueOnce({
        docs: [],
        totalDocs: 0,
      })

    const result = await bookmarksResolver(
      undefined,
      {},
      {
        req: {
          payload: { find: findMock },
          user: { id: 99, role: 'user' },
        },
      },
    )

    expect(result.docs).toHaveLength(2)
    expect(result.totalDocs).toBe(2)
    expect(findMock).toHaveBeenCalledWith(
      expect.objectContaining({
        collection: 'bookmarks',
        where: { and: [{ user: { equals: 99 } }] },
        limit: 50,
        page: 1,
        depth: 0,
        overrideAccess: false,
      }),
    )
    expect(findMock).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        collection: 'books',
        where: { id: { in: ['11', '12'] } },
        depth: 1,
        overrideAccess: false,
      }),
    )
  })

  it('returns a single bookmark when contentType and contentId are provided', async () => {
    const findMock = vi
      .fn()
      .mockResolvedValueOnce({
        docs: [{ id: 1, contentType: 'chapter', chapter: 7 }],
        totalDocs: 1,
      })
      .mockResolvedValueOnce({
        docs: [],
        totalDocs: 0,
      })
      .mockResolvedValueOnce({
        docs: [{ id: 7, title: 'Chapter 7', slug: 'chapter-7' }],
        totalDocs: 1,
      })

    const result = await bookmarksResolver(
      undefined,
      { contentType: 'chapter', contentId: '7' },
      {
        req: {
          payload: { find: findMock },
          user: { id: 99, role: 'user' },
        },
      },
    )

    expect(result.docs).toHaveLength(1)
    expect(findMock).toHaveBeenCalledWith(
      expect.objectContaining({
        collection: 'bookmarks',
        where: {
          and: [
            { user: { equals: 99 } },
            { chapter: { equals: 7 } },
          ],
        },
      }),
    )
    expect(findMock).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        collection: 'chapters',
        where: { id: { in: ['7'] } },
        depth: 1,
        overrideAccess: false,
      }),
    )
  })

  it('returns paginated bookmarks when only contentType is provided', async () => {
    const findMock = vi
      .fn()
      .mockResolvedValueOnce({
        docs: [{ id: 1, contentType: 'book', book: 9 }, { id: 2, contentType: 'chapter', chapter: 3 }],
        totalDocs: 2,
      })
      .mockResolvedValueOnce({
        docs: [{ id: 9, title: 'Book 9' }],
        totalDocs: 1,
      })
      .mockResolvedValueOnce({
        docs: [{ id: 3, title: 'Chapter 3', slug: 'chapter-3' }],
        totalDocs: 1,
      })

    const result = await bookmarksResolver(
      undefined,
      { contentType: 'chapter' },
      {
        req: {
          payload: { find: findMock },
          user: { id: 99, role: 'user' },
        },
      },
    )

    expect(result.docs).toHaveLength(2)
    expect(findMock).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { and: [{ user: { equals: 99 } }] },
        limit: 50,
        page: 1,
      }),
    )
  })

  it('returns paginated bookmarks when only contentId is provided', async () => {
    const findMock = vi
      .fn()
      .mockResolvedValueOnce({
        docs: [{ id: 1, contentType: 'book', book: 4 }],
        totalDocs: 1,
      })
      .mockResolvedValueOnce({
        docs: [{ id: 4, title: 'Book 4' }],
        totalDocs: 1,
      })
      .mockResolvedValueOnce({
        docs: [],
        totalDocs: 0,
      })

    const result = await bookmarksResolver(
      undefined,
      { contentId: '7' },
      {
        req: {
          payload: { find: findMock },
          user: { id: 99, role: 'user' },
        },
      },
    )

    expect(result.docs).toHaveLength(1)
    expect(findMock).toHaveBeenCalledWith(
      expect.objectContaining({
        collection: 'bookmarks',
        where: { and: [{ user: { equals: 99 } }] },
        limit: 50,
        page: 1,
      }),
    )
  })

  it('hydrates readable relations for mixed bookmark docs', async () => {
    const findMock = vi
      .fn()
      .mockResolvedValueOnce({
        docs: [
          { id: 1, contentType: 'book', book: 11 },
          { id: 2, contentType: 'chapter', chapter: 21 },
        ],
        totalDocs: 2,
      })
      .mockResolvedValueOnce({
        docs: [{ id: 11, title: 'Book 11', slug: 'book-11' }],
        totalDocs: 1,
      })
      .mockResolvedValueOnce({
        docs: [{ id: 21, title: 'Chapter 21', slug: 'chapter-21', book: { id: 11, title: 'Book 11' } }],
        totalDocs: 1,
      })

    const result = await bookmarksResolver(
      undefined,
      {},
      {
        req: {
          payload: { find: findMock },
          user: { id: 99, role: 'user' },
        },
      },
    )

    expect(result.docs).toEqual([
      expect.objectContaining({
        id: 1,
        contentType: 'book',
        book: expect.objectContaining({ id: 11, title: 'Book 11' }),
        chapter: null,
      }),
      expect.objectContaining({
        id: 2,
        contentType: 'chapter',
        chapter: expect.objectContaining({ id: 21, title: 'Chapter 21' }),
        book: null,
      }),
    ])
  })

  it('rejects invalid bookmark filters', async () => {
    await expect(
      bookmarksResolver(
        undefined,
        { contentType: 'invalid', contentId: '7' },
        {
          req: {
            payload: {},
            user: { id: 99, role: 'user' },
          },
        },
      ),
    ).rejects.toThrow('Invalid contentType')
  })

  it('rejects unauthenticated requests', async () => {
    await expect(
      bookmarksResolver(
        undefined,
        {},
        { req: { payload: {}, user: null } },
      ),
    ).rejects.toThrow('Unauthorized')
  })
})
