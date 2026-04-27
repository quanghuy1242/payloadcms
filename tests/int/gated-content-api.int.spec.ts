import * as GraphQL from 'graphql'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const getPayloadMock = vi.hoisted(() => vi.fn())
const headersMock = vi.hoisted(() => vi.fn(async () => new Headers()))

vi.mock('payload', () => ({
  getPayload: getPayloadMock,
}))

vi.mock('next/headers', () => ({
  headers: headersMock,
}))

vi.mock('@payload-config', () => ({
  default: Promise.resolve({}),
}))

import { DELETE as deleteBookAccess, GET as getBookAccess, POST as postBookAccess } from '@/app/api/books/[id]/access/route'
import { mutations } from '@/graphql/mutations'
import { unlockChapterPasswordResolver } from '@/graphql/mutations/UnlockChapterPassword/resolver'
import {
  createChapterPasswordProof,
  hashChapterPassword,
  verifyChapterPasswordProof,
} from '@/utils/chapterPasswords'

describe('Gated content API routes', () => {
  beforeEach(() => {
    process.env.AUTH_BASE_URL = 'https://auth.example.test'
    process.env.AUTHER_API_KEY = 'internal-api-key'
    process.env.PAYLOAD_CLIENT_ID = 'payload-client-id'
    process.env.PAYLOAD_SECRET = 'test-secret'

    headersMock.mockResolvedValue(new Headers())

    getPayloadMock.mockResolvedValue({
      auth: vi.fn().mockResolvedValue({
        user: {
          role: 'admin',
        },
      }),
      find: vi.fn().mockResolvedValue({
        docs: [],
        hasNextPage: false,
      }),
      findByID: vi.fn().mockResolvedValue({
        password: 'open-sesame',
      }),
    })
  })

  afterEach(() => {
    delete process.env.AUTH_BASE_URL
    delete process.env.AUTHER_API_KEY
    delete process.env.PAYLOAD_CLIENT_ID
    delete process.env.PAYLOAD_SECRET
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  it('lists, grants, and revokes book access as an admin proxy', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          grants: [
            {
              relation: 'reader',
              tupleId: 'tuple-1',
              userEmail: 'reader@example.com',
              userId: 'user-1',
            },
          ],
        }),
        {
          headers: {
            'content-type': 'application/json',
          },
          status: 200,
        },
      ),
    )

    vi.stubGlobal('fetch', fetchMock)

    const getResponse = await getBookAccess(new Request('https://example.test/api/books/42/access'), {
      params: Promise.resolve({
        id: '42',
      }),
    })

    expect(getResponse.status).toBe(200)
    await expect(getResponse.json()).resolves.toEqual({
      grants: [
        {
          relation: 'reader',
          scope: 'direct',
          tupleId: 'tuple-1',
          userEmail: 'reader@example.com',
          userId: 'user-1',
        },
      ],
    })

    expect(String(fetchMock.mock.calls[0]?.[0])).toBe(
      'https://auth.example.test/api/internal/clients/payload-client-id/grants?entityTypeName=book&entityId=42',
    )

    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify({ ok: true }), {
        headers: {
          'content-type': 'application/json',
        },
        status: 200,
      }),
    )

    const postResponse = await postBookAccess(
      new Request('https://example.test/api/books/42/access', {
        body: JSON.stringify({
          email: 'Reader@Example.com',
          relation: 'reader',
        }),
        headers: {
          'Content-Type': 'application/json',
        },
        method: 'POST',
      }),
      {
        params: Promise.resolve({
          id: '42',
        }),
      },
    )

    expect(postResponse.status).toBe(200)
    await expect(postResponse.json()).resolves.toEqual({ ok: true })

    const postInit = fetchMock.mock.calls[1]?.[1] as RequestInit
    expect(postInit?.method).toBe('POST')
    expect(String(fetchMock.mock.calls[1]?.[0])).toBe(
      'https://auth.example.test/api/internal/clients/payload-client-id/grants',
    )
    expect(postInit?.body).toContain('reader@example.com')
    expect(postInit?.body).toContain('"subjectType":"user"')
    expect(postInit?.body).toContain('"entityTypeName":"book"')

    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify({ ok: true }), {
        headers: {
          'content-type': 'application/json',
        },
        status: 200,
      }),
    )

    const deleteResponse = await deleteBookAccess(
      new Request('https://example.test/api/books/42/access', {
        body: JSON.stringify({ tupleId: 'tuple-1' }),
        headers: {
          'Content-Type': 'application/json',
        },
        method: 'DELETE',
      }),
    )

    expect(deleteResponse.status).toBe(200)
    await expect(deleteResponse.json()).resolves.toEqual({ ok: true })
    expect(String(fetchMock.mock.calls[2]?.[0])).toBe(
      'https://auth.example.test/api/internal/clients/payload-client-id/grants/tuple-1',
    )
    expect((fetchMock.mock.calls[2]?.[1] as RequestInit | undefined)?.method).toBe('DELETE')
  })

  it('registers and resolves the GraphQL chapter unlock mutation', async () => {
    const chapterPasswordHash = await hashChapterPassword('open-sesame')

    const gqlMutations = mutations(GraphQL, {
      collections: {
        chapters: {
          graphQL: {
            type: new GraphQL.GraphQLObjectType({
              name: 'Chapter',
              fields: {
                id: { type: GraphQL.GraphQLID },
              },
            }),
          },
        },
      },
    } as never)

    expect(gqlMutations.unlockChapterPassword).toEqual(
      expect.objectContaining({
        args: expect.objectContaining({
          chapterId: expect.any(Object),
          password: expect.any(Object),
        }),
      }),
    )

    const findByID = vi.fn().mockResolvedValue({
      id: 7,
      hasPassword: true,
      password: chapterPasswordHash,
      passwordVersion: 3,
    })

    const result = await unlockChapterPasswordResolver(
      undefined,
      {
        chapterId: '7',
        password: 'open-sesame',
      },
      {
        req: {
          payload: {
            findByID,
          },
        },
      },
    )

    expect(result.chapterId).toBe('7')
    expect(result.expiresAt).toContain('T')
    expect(verifyChapterPasswordProof({
      chapterId: '7',
      passwordVersion: 3,
      proof: result.proof,
      secret: process.env.PAYLOAD_SECRET,
    })).toBe(true)
    expect(verifyChapterPasswordProof({
      chapterId: '7',
      passwordVersion: 4,
      proof: result.proof,
      secret: process.env.PAYLOAD_SECRET,
    })).toBe(false)
    expect(findByID).toHaveBeenCalledWith(
      expect.objectContaining({
        collection: 'chapters',
        depth: 0,
        id: '7',
        overrideAccess: true,
      }),
    )
  })

  it('creates a standalone proof helper that expires and validates against the password version', () => {
    const proof = createChapterPasswordProof({
      chapterId: 99,
      passwordVersion: 12,
      secret: process.env.PAYLOAD_SECRET,
      now: 1_700_000_000_000,
    })

    expect(proof.expiresAt).toBe('2023-11-14T23:13:20.000Z')
    expect(
      verifyChapterPasswordProof({
        chapterId: 99,
        passwordVersion: 12,
        proof: proof.proof,
        secret: process.env.PAYLOAD_SECRET,
        now: 1_700_000_000_000,
      }),
    ).toBe(true)
    expect(
      verifyChapterPasswordProof({
        chapterId: 99,
        passwordVersion: 13,
        proof: proof.proof,
        secret: process.env.PAYLOAD_SECRET,
        now: 1_700_000_000_000,
      }),
    ).toBe(false)
  })

  it('rejects invalid chapter passwords and missing chapters', async () => {
    getPayloadMock.mockResolvedValueOnce({
      auth: vi.fn().mockResolvedValue({
        user: {
          role: 'admin',
        },
      }),
      findByID: vi.fn().mockResolvedValue({
        id: 7,
        hasPassword: true,
        password: 'hashed-password',
        passwordVersion: 3,
      }),
    })

    await expect(
      unlockChapterPasswordResolver(
        undefined,
        {
          chapterId: '7',
          password: 'wrong-password',
        },
        {
          req: {
            payload: {
              findByID: vi.fn().mockResolvedValue({
                id: 7,
                hasPassword: true,
                password: 'hashed-password',
                passwordVersion: 3,
              }),
            },
          },
        },
      ),
    ).rejects.toThrow('Wrong password')

    await expect(
      unlockChapterPasswordResolver(
        undefined,
        {
          chapterId: 'missing',
          password: 'open-sesame',
        },
        {
          req: {
            payload: {
              findByID: vi.fn().mockRejectedValue(new Error('not found')),
            },
          },
        },
      ),
    ).rejects.toThrow('Not found')
  })
})
