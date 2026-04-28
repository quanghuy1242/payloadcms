import { createHmac } from 'node:crypto'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { previewTokenResolver } from '@/graphql/queries/PreviewToken/resolver'

const PAYLOAD_SECRET = process.env.PAYLOAD_SECRET || 'test-secret'

const decodeBase64Url = (input: string): string => {
  const base64 = input.replace(/-/g, '+').replace(/_/g, '/')
  return Buffer.from(base64, 'base64').toString('utf8')
}

const verifyToken = (token: string, secret: string): Record<string, unknown> | null => {
  const lastDot = token.lastIndexOf('.')
  if (lastDot < 0) return null

  const payloadB64 = token.slice(0, lastDot)
  const sig = token.slice(lastDot + 1)

  const payload = JSON.parse(decodeBase64Url(payloadB64)) as Record<string, unknown>

  const expectedSig = createHmac('sha256', secret).update(JSON.stringify(payload)).digest('base64url')

  if (sig !== expectedSig) return null

  return payload
}

const createPayloadMock = (doc: Record<string, unknown> | null) => {
  return {
    findByID: vi.fn().mockResolvedValue(doc),
  }
}

const createAdminUser = () => ({ id: 1, role: 'admin' })
const createOwnerUser = (id = 99) => ({ id, role: 'user' })
const createOtherUser = () => ({ id: 88, role: 'user' })

describe('previewToken resolver', () => {
  beforeEach(() => {
    vi.stubEnv('PAYLOAD_SECRET', PAYLOAD_SECRET)
  })

  afterEach(() => {
    vi.unstubAllEnvs()
  })

  describe('authentication', () => {
    it('throws when user is not authenticated', async () => {
      await expect(
        previewTokenResolver(
          null,
          { docType: 'books', docId: 42 },
          { req: { payload: createPayloadMock(null), user: null } },
        ),
      ).rejects.toThrow('Unauthorized')
    })
  })

  describe('docType validation', () => {
    it('throws for an invalid docType', async () => {
      await expect(
        previewTokenResolver(
          null,
          { docType: 'invalid', docId: 42 },
          {
            req: {
              payload: createPayloadMock(null),
              user: createAdminUser(),
            },
          },
        ),
      ).rejects.toThrow(/Invalid docType/)
    })
  })

  describe('document resolution', () => {
    it('throws when the document is not found', async () => {
      await expect(
        previewTokenResolver(
          null,
          { docType: 'books', docId: 42 },
          {
            req: {
              payload: createPayloadMock(null),
              user: createAdminUser(),
            },
          },
        ),
      ).rejects.toThrow('Document not found')
    })

    it('throws when the document has no slug', async () => {
      await expect(
        previewTokenResolver(
          null,
          { docType: 'books', docId: 42 },
          {
            req: {
              payload: createPayloadMock({ id: 42, slug: '', createdBy: 99 }),
              user: createAdminUser(),
            },
          },
        ),
      ).rejects.toThrow('Document has no slug')
    })

    it('throws when the document has a null slug', async () => {
      await expect(
        previewTokenResolver(
          null,
          { docType: 'books', docId: 42 },
          {
            req: {
              payload: createPayloadMock({ id: 42, slug: null, createdBy: 99 }),
              user: createAdminUser(),
            },
          },
        ),
      ).rejects.toThrow('Document has no slug')
    })
  })

  describe('access control — books', () => {
    const bookDoc = { id: 42, slug: 'my-book', createdBy: 99 }

    it('allows admin to preview any book', async () => {
      const result = await previewTokenResolver(
        null,
        { docType: 'books', docId: 42 },
        {
          req: {
            payload: createPayloadMock(bookDoc),
            user: createAdminUser(),
          },
        },
      )

      expect(result.slug).toBe('my-book')
      expect(typeof result.token).toBe('string')
      expect(result.token.length).toBeGreaterThan(0)
    })

    it('allows the book owner to preview their own book', async () => {
      const result = await previewTokenResolver(
        null,
        { docType: 'books', docId: 42 },
        {
          req: {
            payload: createPayloadMock(bookDoc),
            user: createOwnerUser(99),
          },
        },
      )

      expect(result.slug).toBe('my-book')
    })

    it('blocks a non-owner from previewing someone else\'s book', async () => {
      await expect(
        previewTokenResolver(
          null,
          { docType: 'books', docId: 42 },
          {
            req: {
              payload: createPayloadMock(bookDoc),
              user: createOtherUser(),
            },
          },
        ),
      ).rejects.toThrow('You are not authorized to preview this document')
    })

    it('blocks a user with numeric mismatch from previewing', async () => {
      await expect(
        previewTokenResolver(
          null,
          { docType: 'books', docId: 42 },
          {
            req: {
              payload: createPayloadMock(bookDoc),
              user: { id: 100, role: 'user' },
            },
          },
        ),
      ).rejects.toThrow('You are not authorized to preview this document')
    })
  })

  describe('access control — posts', () => {
    const postDoc = { id: 7, slug: 'my-post', author: 99 }

    it('allows admin to preview any post', async () => {
      const result = await previewTokenResolver(
        null,
        { docType: 'posts', docId: 7 },
        {
          req: {
            payload: createPayloadMock(postDoc),
            user: createAdminUser(),
          },
        },
      )

      expect(result.slug).toBe('my-post')
    })

    it('allows the post author to preview their own post', async () => {
      const result = await previewTokenResolver(
        null,
        { docType: 'posts', docId: 7 },
        {
          req: {
            payload: createPayloadMock(postDoc),
            user: createOwnerUser(99),
          },
        },
      )

      expect(result.slug).toBe('my-post')
    })

    it('blocks a non-author from previewing someone else\'s post', async () => {
      await expect(
        previewTokenResolver(
          null,
          { docType: 'posts', docId: 7 },
          {
            req: {
              payload: createPayloadMock(postDoc),
              user: createOtherUser(),
            },
          },
        ),
      ).rejects.toThrow('You are not authorized to preview this document')
    })
  })

  describe('token generation', () => {
    const bookDoc = { id: 42, slug: 'my-book', createdBy: 99 }

    it('returns a token with correct format (dot-separated)', async () => {
      const result = await previewTokenResolver(
        null,
        { docType: 'books', docId: 42 },
        {
          req: {
            payload: createPayloadMock(bookDoc),
            user: createAdminUser(),
          },
        },
      )

      const parts = result.token.split('.')
      expect(parts).toHaveLength(2)
      // payload is base64url
      expect(() => decodeBase64Url(parts[0])).not.toThrow()
    })

    it('generates a verifiable token', async () => {
      const result = await previewTokenResolver(
        null,
        { docType: 'books', docId: 42 },
        {
          req: {
            payload: createPayloadMock(bookDoc),
            user: createAdminUser(),
          },
        },
      )

      const decoded = verifyToken(result.token, PAYLOAD_SECRET)
      expect(decoded).not.toBeNull()
      expect(decoded!.docType).toBe('books')
      expect(decoded!.docId).toBe('42')
      expect(decoded!.slug).toBe('my-book')
      expect(typeof decoded!.expiresAt).toBe('number')
    })

    it('token fails verification with the wrong secret', async () => {
      const result = await previewTokenResolver(
        null,
        { docType: 'books', docId: 42 },
        {
          req: {
            payload: createPayloadMock(bookDoc),
            user: createAdminUser(),
          },
        },
      )

      const decoded = verifyToken(result.token, 'wrong-secret')
      expect(decoded).toBeNull()
    })

    it('token expiresAt is set to ~15 minutes in the future', async () => {
      const now = Date.now()
      const result = await previewTokenResolver(
        null,
        { docType: 'books', docId: 42 },
        {
          req: {
            payload: createPayloadMock(bookDoc),
            user: createAdminUser(),
          },
        },
      )

      const decoded = verifyToken(result.token, PAYLOAD_SECRET)
      expect(decoded!.expiresAt).toBeGreaterThan(now)
      expect(decoded!.expiresAt).toBeLessThanOrEqual(now + 16 * 60 * 1000)
    })

    it('generates different tokens for different documents', async () => {
      const result1 = await previewTokenResolver(
        null,
        { docType: 'books', docId: 42 },
        {
          req: {
            payload: createPayloadMock({ id: 42, slug: 'my-book', createdBy: 99 }),
            user: createAdminUser(),
          },
        },
      )

      const result2 = await previewTokenResolver(
        null,
        { docType: 'books', docId: 43 },
        {
          req: {
            payload: createPayloadMock({ id: 43, slug: 'other-book', createdBy: 99 }),
            user: createAdminUser(),
          },
        },
      )

      expect(result1.token).not.toBe(result2.token)
    })
  })

  describe('edge cases', () => {
    it('throws when PAYLOAD_SECRET is not set', async () => {
      vi.stubEnv('PAYLOAD_SECRET', undefined)

      await expect(
        previewTokenResolver(
          null,
          { docType: 'books', docId: 42 },
          {
            req: {
              payload: createPayloadMock({ id: 42, slug: 'my-book', createdBy: 99 }),
              user: createAdminUser(),
            },
          },
        ),
      ).rejects.toThrow('PAYLOAD_SECRET is not set')
    })

    it('allows admin with non-numeric id to access (admin bypass)', async () => {
      const result = await previewTokenResolver(
        null,
        { docType: 'books', docId: 42 },
        {
          req: {
            payload: createPayloadMock({ id: 42, slug: 'my-book', createdBy: 99 }),
            user: { id: 'admin', role: 'admin' },
          },
        },
      )

      expect(result.slug).toBe('my-book')
    })

    it('handles docId passed as string', async () => {
      const result = await previewTokenResolver(
        null,
        { docType: 'books', docId: '42' },
        {
          req: {
            payload: createPayloadMock({ id: 42, slug: 'my-book', createdBy: 99 }),
            user: createAdminUser(),
          },
        },
      )

      expect(result.slug).toBe('my-book')
    })

    it('handles numerical owner id from payload document correctly', async () => {
      const result = await previewTokenResolver(
        null,
        { docType: 'books', docId: 42 },
        {
          req: {
            payload: createPayloadMock({ id: 42, slug: 'my-book', createdBy: '99' }),
            user: createOwnerUser(99),
          },
        },
      )

      expect(result.slug).toBe('my-book')
    })
  })

  describe('token payload integrity', () => {
    it('token payload includes all required fields', async () => {
      const result = await previewTokenResolver(
        null,
        { docType: 'posts', docId: 7 },
        {
          req: {
            payload: createPayloadMock({ id: 7, slug: 'hello-world', author: 99 }),
            user: createAdminUser(),
          },
        },
      )

      const decoded = verifyToken(result.token, PAYLOAD_SECRET)!
      expect(decoded).toHaveProperty('docType', 'posts')
      expect(decoded).toHaveProperty('docId', '7')
      expect(decoded).toHaveProperty('slug', 'hello-world')
      expect(decoded).toHaveProperty('expiresAt')
    })

    it('tampered token payload fails verification', async () => {
      const result = await previewTokenResolver(
        null,
        { docType: 'books', docId: 42 },
        {
          req: {
            payload: createPayloadMock({ id: 42, slug: 'my-book', createdBy: 99 }),
            user: createAdminUser(),
          },
        },
      )

      const parts = result.token.split('.')
      const tamperedPayload = JSON.stringify({
        docType: 'books',
        docId: '42',
        slug: 'hacked',
        expiresAt: Date.now() + 99999,
      })
      const tamperedPayloadB64 = Buffer.from(tamperedPayload).toString('base64url')
      const tamperedToken = tamperedPayloadB64 + '.' + parts[1]

      const decoded = verifyToken(tamperedToken, PAYLOAD_SECRET)
      expect(decoded).toBeNull()
    })
  })
})
