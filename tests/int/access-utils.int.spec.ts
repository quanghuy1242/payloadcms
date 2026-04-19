import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { chaptersReadAccess, normalizeEntityId, publicBooksReadAccess } from '@/utils/access'

describe('Access utilities', () => {
  beforeEach(() => {
    process.env.AUTH_BASE_URL = 'https://auth.example.test'
    process.env.AUTHER_API_KEY = 'internal-api-key'
    process.env.PAYLOAD_CLIENT_ID = 'payload-client-id'
  })

  afterEach(() => {
    delete process.env.AUTH_BASE_URL
    delete process.env.AUTHER_API_KEY
    delete process.env.PAYLOAD_CLIENT_ID
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  it('preserves numeric identifiers as numbers', () => {
    expect(normalizeEntityId(42)).toBe(42)
    expect(normalizeEntityId('42')).toBe(42)
  })

  it('preserves non-numeric identifiers as strings', () => {
    expect(normalizeEntityId('book_abc')).toBe('book_abc')
  })

  it('reads id fields from nested objects', () => {
    expect(normalizeEntityId({ id: '7' })).toBe(7)
  })

  it('allows anonymous users to read public published books only', () => {
    expect(publicBooksReadAccess({ req: { user: null } } as never)).toEqual({
      and: [
        {
          visibility: {
            equals: 'public',
          },
        },
        {
          _status: {
            equals: 'published',
          },
        },
      ],
    })
  })

  it('allows authors to read their own books and chapters', async () => {
    const findMock = vi.fn().mockResolvedValue({
      docs: [],
      hasNextPage: false,
    })

    const request = {
      payload: {
        find: findMock,
      },
      user: {
        id: 9,
        role: 'user',
      },
    }

    await expect(
      publicBooksReadAccess({ req: request as never } as never),
    ).resolves.toEqual({
      or: [
        {
          and: [
            {
              visibility: {
                equals: 'public',
              },
            },
            {
              _status: {
                equals: 'published',
              },
            },
          ],
        },
        {
          createdBy: {
            equals: 9,
          },
        },
      ],
    })

    await expect(chaptersReadAccess({ req: request as never } as never)).resolves.toEqual({
      or: [
        {
          and: [
            {
              'book.visibility': {
                equals: 'public',
              },
            },
            {
              _status: {
                equals: 'published',
              },
            },
          ],
        },
        {
          createdBy: {
            equals: 9,
          },
        },
      ],
    })

    expect(findMock).toHaveBeenCalledTimes(1)
  })

  it('includes Auther-granted private books when a viewer token is forwarded', async () => {
    const findMock = vi.fn().mockResolvedValue({
      docs: [
        {
          entityId: '99',
          requiresLiveCheck: false,
        },
        {
          entityId: '100',
          requiresLiveCheck: true,
        },
      ],
      hasNextPage: false,
    })

    const fetchMock = vi.fn().mockImplementation(async (_url: string, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body ?? '{}')) as { entityIds?: string[] }
      const entityIds = body.entityIds ?? []

      return new Response(
        JSON.stringify({
          results: entityIds.reduce<Record<string, boolean>>((accumulator, entityId) => {
            accumulator[entityId] = entityId === '99'

            return accumulator
          }, {}),
        }),
        {
          headers: {
            'content-type': 'application/json',
          },
          status: 200,
        },
      )
    })

    vi.stubGlobal('fetch', fetchMock)

    const request = {
      headers: new Headers({
        authorization: 'Bearer viewer-token',
      }),
      payload: {
        find: findMock,
      },
      user: {
        betterAuthUserId: 'auth-user-17',
        email: 'reader@example.com',
        id: 17,
        role: 'user',
      },
    }

    const result = await publicBooksReadAccess({
      req: request as never,
    } as never)

    expect(result).toEqual({
      or: [
        {
          and: [
            {
              visibility: {
                equals: 'public',
              },
            },
            {
              _status: {
                equals: 'published',
              },
            },
          ],
        },
        {
          createdBy: {
            equals: 17,
          },
        },
        {
          and: [
            {
              id: {
                in: [99],
              },
            },
            {
              _status: {
                equals: 'published',
              },
            },
          ],
        },
      ],
    })

    expect(findMock).toHaveBeenCalledTimes(1)
    expect(fetchMock).toHaveBeenCalledTimes(1)

    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    const body = JSON.parse(String(init.body)) as {
      context?: {
        resource?: Record<string, unknown>
        user?: Record<string, unknown>
      }
      entityIds?: string[]
    }

    expect(body.entityIds).toEqual(['100'])
    expect(body.context).toEqual({
      resource: {
        entityType: 'book',
        payloadEntityIds: ['100'],
      },
      user: {
        betterAuthUserId: 'auth-user-17',
        payloadEmail: 'reader@example.com',
        payloadRole: 'user',
        payloadUserId: '17',
      },
    })

    const chapterResult = await chaptersReadAccess({
      req: request as never,
    } as never)

    expect(chapterResult).toEqual({
      or: [
        {
          and: [
            {
              'book.visibility': {
                equals: 'public',
              },
            },
            {
              _status: {
                equals: 'published',
              },
            },
          ],
        },
        {
          createdBy: {
            equals: 17,
          },
        },
        {
          and: [
            {
              book: {
                in: [99],
              },
            },
            {
              _status: {
                equals: 'published',
              },
            },
          ],
        },
      ],
    })

    expect(findMock).toHaveBeenCalledTimes(1)
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('still includes unconditional mirror grants when no session token is present', async () => {
    const findMock = vi.fn().mockResolvedValue({
      docs: [
        {
          entityId: '99',
          requiresLiveCheck: false,
        },
        {
          entityId: '100',
          requiresLiveCheck: true,
        },
      ],
      hasNextPage: false,
    })

    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)

    const request = {
      headers: new Headers(),
      payload: {
        find: findMock,
      },
      user: {
        id: 17,
        role: 'user',
      },
    }

    const result = await publicBooksReadAccess({
      req: request as never,
    } as never)

    expect(result).toEqual({
      or: [
        {
          and: [
            {
              visibility: {
                equals: 'public',
              },
            },
            {
              _status: {
                equals: 'published',
              },
            },
          ],
        },
        {
          createdBy: {
            equals: 17,
          },
        },
        {
          and: [
            {
              id: {
                in: [99],
              },
            },
            {
              _status: {
                equals: 'published',
              },
            },
          ],
        },
      ],
    })

    expect(findMock).toHaveBeenCalledTimes(1)
    expect(fetchMock).not.toHaveBeenCalled()
  })
})