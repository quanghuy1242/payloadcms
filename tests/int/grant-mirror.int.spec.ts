import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import {
  buildAutherTupleMetadataMap,
  listAutherClientGrants,
  fetchAutherGroupMembers,
  listAutherObjects,
  listAutherProjectionGrants,
  parseAutherProjectionRoutingMetadata,
  parsePayloadMirrorEntityType,
  upsertGrantMirrorRow,
} from '@/utils/grantMirror'

describe('Grant mirror Auther helpers', () => {
  afterEach(() => {
    delete process.env.AUTH_BASE_URL
    delete process.env.AUTHER_API_KEY
    delete process.env.AUTHER_AUTHORIZATION_SPACE_ID
    delete process.env.AUTHER_USE_SPACE_ROUTING
    delete process.env.PAYLOAD_CLIENT_ID
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  beforeEach(() => {
    process.env.AUTH_BASE_URL = 'https://auth.example.test'
    process.env.AUTHER_API_KEY = 'internal-api-key'
    process.env.PAYLOAD_CLIENT_ID = 'payload-client-id'
  })

  it('normalizes ListObjects tuple arrays and ABAC flags', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          items: [
            {
              abac_required: true,
              entityId: 'book-1',
              tupleIds: ['tuple-1', 'tuple-2'],
              tuples: [
                {
                  relation: 'viewer',
                  subjectId: 'group-premium',
                  subjectType: 'group',
                  tupleId: 'tuple-1',
                },
                {
                  relation: 'editor',
                  subjectId: 'auth-user-1',
                  subjectType: 'user',
                  tupleId: 'tuple-2',
                },
              ],
            },
            {
              abacRequired: false,
              entityId: 'book-2',
              tupleId: 'tuple-3',
            },
          ],
        }),
        {
          headers: { 'content-type': 'application/json' },
          status: 200,
        },
      ),
    )

    vi.stubGlobal('fetch', fetchMock)

    await expect(listAutherObjects('auth-user-1', 'book')).resolves.toEqual([
      {
        abacRequired: true,
        entityId: 'book-1',
        tupleId: 'tuple-1',
        tupleIds: ['tuple-1', 'tuple-2'],
        tuples: [
          {
            relation: 'viewer',
            sourceSubjectType: 'group',
            subjectId: 'group-premium',
            subjectRelation: undefined,
            tupleId: 'tuple-1',
          },
          {
            relation: 'editor',
            sourceSubjectType: 'user',
            subjectId: 'auth-user-1',
            subjectRelation: undefined,
            tupleId: 'tuple-2',
          },
        ],
      },
      {
        abacRequired: false,
        entityId: 'book-2',
        tupleId: 'tuple-3',
        tupleIds: ['tuple-3'],
        tuples: [],
      },
    ])

    expect(fetchMock).toHaveBeenCalledTimes(1)

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    const body = JSON.parse(String(init.body)) as {
      entityType?: string
      permission?: string
      userId?: string
    }

    expect(url).toBe('https://auth.example.test/api/auth/list-objects')
    expect(body).toEqual({
      entityType: 'client_payload-client-id:book',
      permission: 'view',
      userId: 'auth-user-1',
    })
  })

  it('lists client grants without requiring an entity filter', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          grants: [
            {
              relation: 'viewer',
              subjectId: 'auth-user-2',
              subjectType: 'user',
              tupleId: 'tuple-2',
              userEmail: 'reader@example.com',
              userId: 'auth-user-2',
            },
          ],
          hasMore: true,
          nextCursor: 'cursor-2',
        }),
        {
          headers: { 'content-type': 'application/json' },
          status: 200,
        },
      ),
    )

    vi.stubGlobal('fetch', fetchMock)

    await expect(listAutherClientGrants({ cursor: 'cursor-1', limit: 50 })).resolves.toEqual({
      grants: [
        {
          relation: 'viewer',
          subjectId: 'auth-user-2',
          subjectType: 'user',
          tupleId: 'tuple-2',
          userEmail: 'reader@example.com',
          userId: 'auth-user-2',
        },
      ],
      hasMore: true,
      nextCursor: 'cursor-2',
    })

    const [rawUrl, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    const url = new URL(rawUrl)

    expect(url.pathname).toBe('/api/internal/clients/payload-client-id/grants')
    expect(url.searchParams.get('cursor')).toBe('cursor-1')
    expect(url.searchParams.get('limit')).toBe('50')
    expect(url.searchParams.get('entityTypeName')).toBeNull()
    expect(url.searchParams.get('entityId')).toBeNull()
    expect(init.headers).toEqual({ 'x-api-key': 'internal-api-key' })
  })

  it('reads expanded group members from Auther memberIds responses', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          groupId: 'group-1',
          memberIds: ['auth-user-1', 'auth-user-2'],
        }),
        {
          headers: { 'content-type': 'application/json' },
          status: 200,
        },
      ),
    )

    vi.stubGlobal('fetch', fetchMock)

    await expect(fetchAutherGroupMembers('group-1')).resolves.toEqual([
      'auth-user-1',
      'auth-user-2',
    ])
  })

  it('uses authorization-space grant sweep when space routing is enabled', async () => {
    process.env.AUTHER_AUTHORIZATION_SPACE_ID = 'space_payload_content'
    process.env.AUTHER_USE_SPACE_ROUTING = 'true'

    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          grants: [
            {
              relation: 'viewer',
              subjectId: 'auth-user-2',
              subjectType: 'user',
              tupleId: 'tuple-2',
              userEmail: 'reader@example.com',
              userId: 'auth-user-2',
            },
          ],
        }),
        {
          headers: { 'content-type': 'application/json' },
          status: 200,
        },
      ),
    )

    vi.stubGlobal('fetch', fetchMock)

    await expect(listAutherProjectionGrants({ entityTypeName: 'book', entityId: 'book-1' }))
      .resolves
      .toMatchObject({
        grants: [
          {
            relation: 'viewer',
            subjectId: 'auth-user-2',
            subjectType: 'user',
            tupleId: 'tuple-2',
          },
        ],
      })

    const [rawUrl] = fetchMock.mock.calls[0] as [string, RequestInit]
    const url = new URL(rawUrl)

    expect(url.pathname).toBe('/api/internal/authorization-spaces/space_payload_content/grants')
    expect(url.searchParams.get('entityTypeName')).toBe('book')
    expect(url.searchParams.get('entityId')).toBe('book-1')
  })

  it('uses authorization-space list-objects when space routing is enabled', async () => {
    process.env.AUTHER_AUTHORIZATION_SPACE_ID = 'space_payload_content'
    process.env.AUTHER_USE_SPACE_ROUTING = 'true'

    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          items: [{ entityId: 'book-1', tupleIds: ['tuple-1'] }],
        }),
        {
          headers: { 'content-type': 'application/json' },
          status: 200,
        },
      ),
    )

    vi.stubGlobal('fetch', fetchMock)

    await expect(listAutherObjects('auth-user-1', 'book')).resolves.toMatchObject([
      {
        entityId: 'book-1',
        tupleIds: ['tuple-1'],
      },
    ])

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    const body = JSON.parse(String(init.body)) as {
      entityTypeName?: string
      entityType?: string
      permission?: string
      userId?: string
    }

    expect(url).toBe(
      'https://auth.example.test/api/internal/authorization-spaces/space_payload_content/list-objects',
    )
    expect(body).toEqual({
      entityTypeName: 'book',
      permission: 'view',
      userId: 'auth-user-1',
    })
  })

  it('builds tuple metadata from client grants', () => {
    expect(
      buildAutherTupleMetadataMap([
        {
          relation: 'viewer',
          subjectId: 'grp_premium',
          subjectType: 'group',
          tupleId: 'tuple-1',
          userEmail: null,
          userId: null,
        },
        {
          relation: 'editor',
          subjectId: 'usr_123',
          subjectType: 'user',
          tupleId: 'tuple-2',
          userEmail: 'reader@example.com',
          userId: 'usr_123',
        },
      ]),
    ).toEqual(
      new Map([
        [
          'tuple-1',
          {
            relation: 'viewer',
            sourceSubjectType: 'group',
            subjectId: 'grp_premium',
          },
        ],
        [
          'tuple-2',
          {
            relation: 'editor',
            sourceSubjectType: 'user',
            subjectId: 'usr_123',
          },
        ],
      ]),
    )
  })

  it('parses client and authorization-space projection routing metadata', () => {
    expect(
      parseAutherProjectionRoutingMetadata({
        authorizationSpaceId: 'space_payload_content',
        clientId: 'payload-client-id',
      }),
    ).toEqual({
      authorizationSpaceId: 'space_payload_content',
      clientId: 'payload-client-id',
    })

    expect(
      parseAutherProjectionRoutingMetadata({
        authorizationSpaceId: '  ',
        clientId: 123,
      }),
    ).toEqual({
      authorizationSpaceId: null,
      clientId: null,
    })

    expect(
      parseAutherProjectionRoutingMetadata({
        authorizationSpaceId: ' space_payload_content ',
        clientId: ' payload-client-id ',
      }),
    ).toEqual({
      authorizationSpaceId: 'space_payload_content',
      clientId: 'payload-client-id',
    })
  })

  it('updates an existing mirror row without overwriting relation or source provenance', async () => {
    const payload = {
      create: vi.fn(),
      find: vi.fn().mockResolvedValue({ docs: [{ id: 42 }] }),
      update: vi.fn().mockResolvedValue({}),
    }

    await upsertGrantMirrorRow(payload as never, {
      autherTupleId: 'tuple-1',
      payloadUserId: 7,
      entityType: 'book',
      entityId: 'book-1',
      relation: 'editor',
      sourceSubjectType: 'group',
      requiresLiveCheck: true,
      syncStatus: 'active',
    })

    expect(payload.find).toHaveBeenCalledWith({
      collection: 'grant-mirror',
      where: {
        and: [
          { autherTupleId: { equals: 'tuple-1' } },
          { payloadUserId: { equals: 7 } },
        ],
      },
      limit: 1,
      depth: 0,
      overrideAccess: true,
    })

    expect(payload.update).toHaveBeenCalledWith({
      collection: 'grant-mirror',
      id: 42,
      data: {
        syncStatus: 'active',
        requiresLiveCheck: true,
        syncedAt: expect.any(String),
      },
      overrideAccess: true,
    })
    expect(payload.create).not.toHaveBeenCalled()
  })

  it('only accepts mirrored entity types scoped to the payload client', () => {
    expect(parsePayloadMirrorEntityType('client_payload-client-id:book')).toBe('book')
    expect(parsePayloadMirrorEntityType('client_payload-client-id:chapter')).toBe('chapter')
    expect(parsePayloadMirrorEntityType('client_blog-client-id:book')).toBeNull()
    expect(parsePayloadMirrorEntityType('book')).toBeNull()
  })

  it('accepts canonical authorization-space entity scopes when space routing is enabled', () => {
    process.env.AUTHER_AUTHORIZATION_SPACE_ID = 'space_payload_content'
    process.env.AUTHER_USE_SPACE_ROUTING = 'true'

    expect(parsePayloadMirrorEntityType('book')).toBe('book')
    expect(parsePayloadMirrorEntityType('space_payload-space:book')).toBe('book')
    expect(parsePayloadMirrorEntityType('space_payload-space:chapter')).toBe('chapter')
    expect(parsePayloadMirrorEntityType('space_payload-space:unknown')).toBeNull()
  })
})
