import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { generateEpubResolver } from '@/graphql/mutations/GenerateEpub/resolver'
import { verifyEpubDownloadToken } from '@/utils/epubExport'

const PAYLOAD_SECRET = 'test-secret'

const createPayloadMock = (book: Record<string, unknown> | null) => ({
  findByID: vi.fn().mockResolvedValue(book),
})

describe('generateEpubResolver', () => {
  beforeEach(() => {
    vi.stubEnv('PAYLOAD_SECRET', PAYLOAD_SECRET)
    vi.stubEnv('NEXT_PUBLIC_SITE_URL', 'https://cms.quanghuy.dev')
  })

  afterEach(() => {
    vi.unstubAllEnvs()
    vi.restoreAllMocks()
  })

  it('throws when the request is unauthenticated', async () => {
    await expect(
      generateEpubResolver(
        null,
        { bookId: 42 },
        { req: { payload: createPayloadMock(null), user: null } },
      ),
    ).rejects.toThrow('Unauthorized')
  })

  it('throws when the book does not belong to the current user', async () => {
    await expect(
      generateEpubResolver(
        null,
        { bookId: 42 },
        {
          req: {
            payload: createPayloadMock({ id: 42, slug: 'my-book', createdBy: 99 }),
            user: { id: 88, role: 'user' },
          },
        },
      ),
    ).rejects.toThrow('Only the book owner can export EPUB')
  })

  it('returns a signed download URL for the book owner', async () => {
    const payload = createPayloadMock({ id: 42, slug: 'my-book', createdBy: 99 })

    const result = await generateEpubResolver(
      null,
      { bookId: 42 },
      {
        req: {
          payload,
          user: { id: 99, role: 'user' },
        },
      },
    )

    expect(payload.findByID).toHaveBeenCalledWith({
      collection: 'books',
      id: 42,
      overrideAccess: false,
      req: expect.objectContaining({
        payload,
        user: { id: 99, role: 'user' },
      }),
    })
    expect(result.filename).toBe('my-book.epub')
    expect(result.downloadUrl).toMatch(/^https:\/\/cms\.quanghuy\.dev\/api\/epub-download\//)

    const token = result.downloadUrl.split('/').pop()
    expect(token).toBeTruthy()

    const decoded = verifyEpubDownloadToken(token!)
    expect(decoded).toMatchObject({
      bookId: '42',
      userId: '99',
    })
    expect(new Date(result.expiresAt).toISOString()).toBe(result.expiresAt)
  })
})
