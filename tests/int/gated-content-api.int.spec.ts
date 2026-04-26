import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest'

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
import { POST as unlockChapter } from '@/app/api/chapters/[id]/unlock/route'
import { POST as validateChapter } from '@/app/api/chapters/[id]/unlock/validate/route'

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
      new Response(JSON.stringify({
        grants: [
          {
            relation: 'reader',
            tupleId: 'tuple-1',
            userEmail: 'reader@example.com',
            userId: 'user-1',
          },
        ],
      }), {
        headers: {
          'content-type': 'application/json',
        },
        status: 200,
      }),
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

  it('mints and validates chapter unlock tokens', async () => {
    const unlockResponse = await unlockChapter(
      new Request('https://example.test/api/chapters/7/unlock', {
        body: JSON.stringify({ password: 'open-sesame' }),
        headers: {
          'Content-Type': 'application/json',
        },
        method: 'POST',
      }),
      {
        params: Promise.resolve({
          id: '7',
        }),
      },
    )

    expect(unlockResponse.status).toBe(200)

    const unlockBody = (await unlockResponse.json()) as { token?: string }
    expect(unlockBody.token).toContain('7:')

    const validateResponse = await validateChapter(
      new Request('https://example.test/api/chapters/7/unlock/validate', {
        body: JSON.stringify({ token: unlockBody.token }),
        headers: {
          'Content-Type': 'application/json',
        },
        method: 'POST',
      }),
      {
        params: Promise.resolve({
          id: '7',
        }),
      },
    )

    expect(validateResponse.status).toBe(200)
    await expect(validateResponse.json()).resolves.toEqual({ valid: true })
  })

  it('returns a 500 when the unlock secret is missing', async () => {
    const previousSecret = process.env.PAYLOAD_SECRET
    delete process.env.PAYLOAD_SECRET

    try {
      const unlockResponse = await unlockChapter(
        new Request('https://example.test/api/chapters/7/unlock', {
          body: JSON.stringify({ password: 'open-sesame' }),
          headers: {
            'Content-Type': 'application/json',
          },
          method: 'POST',
        }),
        {
          params: Promise.resolve({
            id: '7',
          }),
        },
      )

      expect(unlockResponse.status).toBe(500)
      await expect(unlockResponse.json()).resolves.toEqual({ error: 'PAYLOAD_SECRET is not set' })
    } finally {
      if (previousSecret === undefined) {
        delete process.env.PAYLOAD_SECRET
      } else {
        process.env.PAYLOAD_SECRET = previousSecret
      }
    }
  })
})
