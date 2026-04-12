import { afterEach, describe, expect, it, vi } from 'vitest'

import {
  applyBookImportLifecycleHook,
  enforceUniqueChapterOrderHook,
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
})