import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { chaptersReadAccess, normalizeEntityId, publicBooksReadAccess } from '@/utils/access'

describe('Access utilities', () => {
  beforeEach(() => {
    process.env.AUTHER_BASE_URL = 'https://auth.example.test'
    process.env.PAYLOAD_CLIENT_ID = 'payload-client-id'
  })

  afterEach(() => {
    delete process.env.AUTHER_BASE_URL
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

  it('allows authors to read their own books and chapters', () => {
    expect(publicBooksReadAccess({ req: { user: { id: 9, role: 'user' } } } as never)).toEqual({
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

    expect(chaptersReadAccess({ req: { user: { id: '17', role: 'user' } } } as never)).toEqual({
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
      ],
    })
  })

  it('includes Auther-granted private books when a viewer token is forwarded', async () => {
    const findMock = vi.fn().mockResolvedValue({
      docs: [
        {
          id: '99',
          createdBy: 18,
        },
        {
          id: '100',
          createdBy: 17,
        },
      ],
      hasNextPage: false,
    })

    const fetchMock = vi.fn().mockImplementation(async (_url: string, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body ?? '{}')) as { entityId?: string }

      return new Response(
        JSON.stringify({
          allowed: body.entityId === '99',
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
})