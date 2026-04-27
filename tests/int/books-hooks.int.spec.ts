import { afterEach, describe, expect, it, vi } from 'vitest'

import { Chapters } from '@/collections/Chapters'
import { booksAfterDeleteGrantMirrorHook, chapterContentReadAccess } from '@/utils/access'
import {
  canReadChapterContent,
  createChapterPasswordProof,
  verifyChapterPasswordProof,
  verifyChapterPassword,
} from '@/utils/chapterPasswords'
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

  it('revokes all grant mirror rows for a deleted book across paginated result sets', async () => {
    const find = vi
      .fn()
      .mockResolvedValueOnce({
        docs: [{ id: 1 }, { id: 2 }],
        hasNextPage: true,
      })
      .mockResolvedValueOnce({
        docs: [{ id: 3 }],
        hasNextPage: false,
      })

    const update = vi.fn().mockResolvedValue({})

    await booksAfterDeleteGrantMirrorHook({
      id: 42,
      req: {
        payload: {
          find,
          update,
        },
      },
    } as never)

    expect(find).toHaveBeenCalledTimes(3)
    expect(update).toHaveBeenCalledTimes(3)
    expect(update.mock.calls[0]?.[0]).toMatchObject({
      collection: 'grant-mirror',
      data: {
        syncStatus: 'revoked',
      },
      id: 1,
      overrideAccess: true,
    })
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

  it('hashes chapter passwords, preserves values when omitted, and hides internals on read', async () => {
    const beforeChangeHook = Chapters.hooks?.beforeChange?.[0]
    const afterReadHook = Chapters.hooks?.afterRead?.[0]

    expect(beforeChangeHook).toEqual(expect.any(Function))
    expect(afterReadHook).toEqual(expect.any(Function))

    const createResult = (await beforeChangeHook?.({
      collection: undefined as never,
      data: {
        password: 'reader-secret',
      },
      context: undefined as never,
      operation: 'create',
      req: {} as never,
    })) as Record<string, unknown>

    expect(createResult.hasPassword).toBe(true)
    expect(typeof createResult.password).toBe('string')
    expect(createResult.password).not.toBe('reader-secret')
    expect(createResult.passwordVersion).toBe(1)
    expect(await verifyChapterPassword('reader-secret', String(createResult.password))).toBe(true)

    const updateResult = (await beforeChangeHook?.({
      collection: undefined as never,
      data: {
        title: 'Updated chapter title',
      },
      context: undefined as never,
      originalDoc: {
        hasPassword: true,
        passwordVersion: 7,
      },
      operation: 'update',
      req: {} as never,
    })) as Record<string, unknown>

    expect(updateResult.hasPassword).toBe(true)
    expect(updateResult.passwordVersion).toBe(7)

    const clearedResult = (await beforeChangeHook?.({
      collection: undefined as never,
      data: {
        password: '',
      },
      context: undefined as never,
      originalDoc: {
        hasPassword: true,
        passwordVersion: 7,
      },
      operation: 'update',
      req: {} as never,
    })) as Record<string, unknown>

    expect(clearedResult.hasPassword).toBe(false)
    expect(clearedResult.password).toBeNull()
    expect(clearedResult.passwordVersion).toBe(8)

    const readResult = await afterReadHook?.({
      collection: undefined as never,
      context: undefined as never,
      doc: {
        content: 'secret chapter text',
        createdBy: 77,
        hasPassword: true,
        password: 'reader-secret',
        passwordVersion: 7,
      },
      req: {
        user: {
          id: 77,
          role: 'user',
        },
      } as never,
    }) as Record<string, unknown>

    expect(readResult.hasPassword).toBe(true)
    expect(readResult.content).toBe('secret chapter text')
    expect(readResult.password).toBeUndefined()
    expect(readResult.passwordVersion).toBeUndefined()

    const rejectedResult = await afterReadHook?.({
      collection: undefined as never,
      context: undefined as never,
      doc: {
        content: 'locked chapter text',
        createdBy: 88,
        hasPassword: true,
        password: 'reader-secret',
        passwordVersion: 7,
      },
      req: {
        user: {
          id: 77,
          role: 'user',
        },
      } as never,
    }) as Record<string, unknown>

    expect(rejectedResult.content).toBeUndefined()
  })

  it('uses raw chapter metadata to honor proof-based access when the version is hidden from the sanitized doc', async () => {
    const afterReadHook = Chapters.hooks?.afterRead?.[0]

    expect(afterReadHook).toEqual(expect.any(Function))

    const previousSecret = process.env.PAYLOAD_SECRET
    process.env.PAYLOAD_SECRET = 'test-secret'

    try {
      const proof = createChapterPasswordProof({
        chapterId: 42,
        passwordVersion: 3,
        secret: 'test-secret',
      })

      const findOne = vi.fn().mockResolvedValue({
        id: 42,
        createdBy: 88,
        hasPassword: true,
        passwordVersion: 3,
      })

      await expect(
        chapterContentReadAccess({
          doc: {
            content: 'secret chapter text',
            createdBy: 88,
            hasPassword: true,
            id: 42,
          } as never,
          req: {
            headers: new Headers({
              'x-chapter-password-proof': proof.proof,
            }),
            payload: {
              db: {
                findOne,
              },
            },
            user: {
              id: 77,
              role: 'user',
            },
          } as never,
        }),
      ).resolves.toBe(true)

      const readResult = (await afterReadHook?.({
        collection: undefined as never,
        context: undefined as never,
        doc: {
          content: 'secret chapter text',
          createdBy: 88,
          hasPassword: true,
          id: 42,
        },
        req: {
          headers: new Headers({
            'x-chapter-password-proof': proof.proof,
          }),
          payload: {
            db: {
              findOne,
            },
          },
          user: {
            id: 77,
            role: 'user',
          },
        } as never,
      })) as Record<string, unknown>

      expect(readResult.content).toBe('secret chapter text')
      expect(findOne).toHaveBeenCalledWith(
        expect.objectContaining({
          collection: 'chapters',
          where: {
            id: {
              equals: 42,
            },
          },
        }),
      )
    } finally {
      if (previousSecret === undefined) {
        delete process.env.PAYLOAD_SECRET
      } else {
        process.env.PAYLOAD_SECRET = previousSecret
      }
    }
  })

  it('allows proof-based access to chapter content and revokes stale proofs', () => {
    const previousSecret = process.env.PAYLOAD_SECRET
    process.env.PAYLOAD_SECRET = 'test-secret'

    try {
      const proof = createChapterPasswordProof({
        chapterId: 42,
        passwordVersion: 3,
        secret: 'test-secret',
      })

      expect(
        canReadChapterContent({
          chapter: {
            id: 42,
            hasPassword: true,
            passwordVersion: 3,
          },
          headers: new Headers({
            'x-chapter-password-proof': proof.proof,
          }),
        }),
      ).toBe(true)

      expect(
        canReadChapterContent({
          chapter: {
            id: 42,
            hasPassword: true,
            passwordVersion: 4,
          },
          headers: new Headers({
            'x-chapter-password-proof': proof.proof,
          }),
        }),
      ).toBe(false)

      expect(
        canReadChapterContent({
          chapter: {
            hasPassword: false,
          },
        }),
      ).toBe(true)

      expect(
        canReadChapterContent({
          chapter: {
            createdBy: 77,
            hasPassword: true,
            passwordVersion: 3,
          },
          user: {
            id: 77,
            role: 'user',
          },
        }),
      ).toBe(true)

      expect(
        canReadChapterContent({
          chapter: {
            hasPassword: true,
            passwordVersion: 3,
          },
          user: {
            id: 1,
            role: 'admin',
          },
        }),
      ).toBe(true)

      expect(
        verifyChapterPasswordProof({
          chapterId: 42,
          passwordVersion: 3,
          proof: proof.proof,
          secret: 'test-secret',
          now: Date.now() + 60 * 60 * 1000 + 1,
        }),
      ).toBe(false)
    } finally {
      if (previousSecret === undefined) {
        delete process.env.PAYLOAD_SECRET
      } else {
        process.env.PAYLOAD_SECRET = previousSecret
      }
    }
  })
})
