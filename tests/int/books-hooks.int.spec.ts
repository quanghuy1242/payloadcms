import { afterEach, describe, expect, it, vi } from 'vitest'

import {
  applyBookImportLifecycleHook,
  bookDeleteAccess,
  countBookChapters,
  enforceUniqueChapterOrderHook,
  enforceBookHasNoChaptersBeforeDelete,
  fetchBookChapterCount,
} from '@/utils/books'

afterEach(() => {
  vi.useRealTimers()
  vi.restoreAllMocks()
})

describe('Books hooks', () => {
  it('sets import timestamps when a book starts importing', () => {
    const lifecycleNow = '2026-04-12T10:00:00.000Z'

    vi.useFakeTimers()
    vi.setSystemTime(new Date(lifecycleNow))

    const result = applyBookImportLifecycleHook({
      collection: undefined as never,
      data: {
        title: 'Sample Book',
        importStatus: 'importing',
      },
      context: undefined as never,
      operation: 'create',
      req: {} as never,
    }) as Record<string, unknown>

    expect(result.importStatus).toBe('importing')
    expect(result.importStartedAt).toBe(lifecycleNow)
  })

  it('marks importing books as ready and clears failure fields', () => {
    const lifecycleNow = '2026-04-12T10:15:00.000Z'

    vi.useFakeTimers()
    vi.setSystemTime(new Date(lifecycleNow))

    const result = applyBookImportLifecycleHook({
      collection: undefined as never,
      data: {
        importStatus: 'ready',
        importErrorSummary: 'Previous failure',
        importFailedAt: '2026-04-12T09:00:00.000Z',
      },
      context: undefined as never,
      operation: 'update',
      originalDoc: {
        importStatus: 'importing',
      },
      req: {} as never,
    }) as Record<string, unknown>

    expect(result.importStatus).toBe('ready')
    expect(result.importFinishedAt).toBe(lifecycleNow)
    expect(result.lastImportedAt).toBe(lifecycleNow)
    expect(result.importFailedAt).toBeNull()
    expect(result.importErrorSummary).toBeNull()
  })

  it('sets a failure timestamp when the import fails', () => {
    const lifecycleNow = '2026-04-12T10:30:00.000Z'

    vi.useFakeTimers()
    vi.setSystemTime(new Date(lifecycleNow))

    const result = applyBookImportLifecycleHook({
      collection: undefined as never,
      data: {
        importStatus: 'failed',
      },
      context: undefined as never,
      operation: 'create',
      req: {} as never,
    }) as Record<string, unknown>

    expect(result.importStatus).toBe('failed')
    expect(result.importFailedAt).toBe(lifecycleNow)
  })

  it('allows unique chapter orders and normalizes the stored order', async () => {
    const find = vi.fn().mockResolvedValue({ docs: [] })

    const result = (await enforceUniqueChapterOrderHook({
      collection: undefined as never,
      data: {
        book: '42',
        order: '7',
      },
      context: undefined as never,
      operation: 'create',
      req: {
        payload: {
          find,
        },
      } as never,
    })) as Record<string, unknown>

    expect(result.order).toBe(7)
    expect(find).toHaveBeenCalledTimes(1)
  })

  it('rejects duplicate chapter orders for different chapters in the same book', async () => {
    const find = vi.fn().mockResolvedValue({
      docs: [{ id: 99 }],
    })

    await expect(
      enforceUniqueChapterOrderHook({
        collection: undefined as never,
        data: {
          book: 42,
          order: 3,
        },
        context: undefined as never,
        operation: 'create',
        req: {
          payload: {
            find,
          },
        } as never,
      }),
    ).rejects.toThrow('Each chapter order value must be unique within the same book.')
  })

  it('skips the uniqueness query when updating the same chapter order', async () => {
    const find = vi.fn()

    const result = (await enforceUniqueChapterOrderHook({
      collection: undefined as never,
      data: {
        book: 42,
        order: 3,
      },
      context: undefined as never,
      operation: 'update',
      originalDoc: {
        id: 15,
        book: 42,
        order: 3,
      },
      req: {
        payload: {
          find,
        },
      } as never,
    })) as Record<string, unknown>

    expect(result.order).toBe(3)
    expect(find).not.toHaveBeenCalled()
  })

  it('counts chapters for a book through the Payload API', async () => {
    const find = vi.fn().mockResolvedValue({ totalDocs: 4 })

    const totalDocs = await countBookChapters(
      {
        payload: {
          find,
        },
      } as never,
      42,
    )

    expect(totalDocs).toBe(4)
    expect(find).toHaveBeenCalledWith(
      expect.objectContaining({
        collection: 'chapters',
        depth: 0,
        limit: 0,
        overrideAccess: true,
      }),
    )
  })

  it('keeps the original owner delete access when a book has no chapters', async () => {
    const find = vi.fn().mockResolvedValue({ totalDocs: 0 })

    const result = await bookDeleteAccess({
      id: 7,
      req: {
        payload: {
          find,
        },
        user: {
          id: 7,
          role: 'user',
        },
      },
    } as never)

    expect(result).toEqual({
      createdBy: {
        equals: 7,
      },
    })
  })

  it('blocks book deletion when chapters still exist', async () => {
    const find = vi.fn().mockResolvedValue({ totalDocs: 2 })

    const result = await bookDeleteAccess({
      id: 7,
      req: {
        payload: {
          find,
        },
        user: {
          id: 7,
          role: 'user',
        },
      },
    } as never)

    expect(result).toBe(false)
  })

  it('prevents deleting a book that still has chapters', async () => {
    const find = vi.fn().mockResolvedValue({ totalDocs: 1 })

    await expect(
      enforceBookHasNoChaptersBeforeDelete({
        collection: undefined as never,
        context: undefined as never,
        id: 99,
        req: {
          payload: {
            find,
          },
        } as never,
      }),
    ).rejects.toThrow('Cannot delete book: it has 1 chapter')
  })

  it('fetches chapter counts from the admin REST API', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ totalDocs: 3 }), {
        headers: {
          'content-type': 'application/json',
        },
        status: 200,
      }),
    )

    const totalDocs = await fetchBookChapterCount('book-12')

    expect(totalDocs).toBe(3)
    expect(fetchSpy).toHaveBeenCalledWith(
      '/api/chapters?limit=0&where[book][equals]=book-12',
      expect.objectContaining({
        credentials: 'include',
      }),
    )
  })
})