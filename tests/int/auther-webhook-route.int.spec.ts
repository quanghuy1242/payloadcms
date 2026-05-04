import crypto from 'node:crypto'

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const getPayloadMock = vi.hoisted(() => vi.fn())
const enqueueDeferredGrantJobMock = vi.hoisted(() => vi.fn())
const expirePendingDeferredGrantsByTupleIdMock = vi.hoisted(() => vi.fn())
const upsertRevocationTombstoneMock = vi.hoisted(() => vi.fn())
const fetchAutherGroupMembersMock = vi.hoisted(() => vi.fn())
const listAutherObjectsMock = vi.hoisted(() => vi.fn())
const listGrantMirrorTupleMetadataMock = vi.hoisted(() => vi.fn())
const resolvePayloadUserIdMock = vi.hoisted(() => vi.fn())
const revokeGrantMirrorRowsMock = vi.hoisted(() => vi.fn())
const upsertGrantMirrorRowMock = vi.hoisted(() => vi.fn())
const getAutherAuthorizationSpaceIdMock = vi.hoisted(() => vi.fn<() => string | null>(() => null))
const getAutherUseSpaceRoutingMock = vi.hoisted(() => vi.fn(() => false))

vi.mock('payload', () => ({
  getPayload: getPayloadMock,
}))

vi.mock('@payload-config', () => ({
  default: Promise.resolve({}),
}))

vi.mock('@/lib/env', () => ({
  getAutherAuthorizationSpaceId: getAutherAuthorizationSpaceIdMock,
  getAutherClientId: vi.fn(() => 'payload-client-id'),
  getAutherUseSpaceRouting: getAutherUseSpaceRoutingMock,
  getAutherWebhookSecret: vi.fn(() => 'webhook-secret'),
}))

vi.mock('@/utils/deferredGrants', () => ({
  enqueueDeferredGrantJob: enqueueDeferredGrantJobMock,
  expirePendingDeferredGrantsByTupleId: expirePendingDeferredGrantsByTupleIdMock,
  upsertRevocationTombstone: upsertRevocationTombstoneMock,
}))

vi.mock('@/utils/grantMirror', async () => {
  const actual = await vi.importActual<typeof import('@/utils/grantMirror')>('@/utils/grantMirror')

  return {
    ...actual,
    fetchAutherGroupMembers: fetchAutherGroupMembersMock,
    listAutherObjects: listAutherObjectsMock,
    listGrantMirrorTupleMetadata: listGrantMirrorTupleMetadataMock,
    resolvePayloadUserId: resolvePayloadUserIdMock,
    revokeGrantMirrorRows: revokeGrantMirrorRowsMock,
    upsertGrantMirrorRow: upsertGrantMirrorRowMock,
  }
})

import { POST as autherWebhookRoute } from '@/app/api/webhooks/auther/route'

describe('Auther webhook route', () => {
  beforeEach(() => {
    process.env.PAYLOAD_CLIENT_ID = 'payload-client-id'
    getPayloadMock.mockResolvedValue({
      find: vi.fn().mockResolvedValue({ docs: [] }),
    })
    enqueueDeferredGrantJobMock.mockReset()
    enqueueDeferredGrantJobMock.mockResolvedValue(11)
    expirePendingDeferredGrantsByTupleIdMock.mockReset()
    expirePendingDeferredGrantsByTupleIdMock.mockResolvedValue(0)
    upsertRevocationTombstoneMock.mockReset()
    upsertRevocationTombstoneMock.mockResolvedValue(undefined)
    fetchAutherGroupMembersMock.mockReset()
    fetchAutherGroupMembersMock.mockResolvedValue([])
    listGrantMirrorTupleMetadataMock.mockReset()
    listGrantMirrorTupleMetadataMock.mockResolvedValue(new Map())
    listAutherObjectsMock.mockReset()
    listAutherObjectsMock.mockResolvedValue([
      {
        abacRequired: true,
        entityId: 'book-9',
        tupleId: 'tuple-group-1',
        tupleIds: ['tuple-group-1'],
        tuples: [
          {
            relation: 'editor',
            sourceSubjectType: 'group',
            subjectId: 'grp-premium',
            subjectRelation: undefined,
            tupleId: 'tuple-group-1',
          },
        ],
      },
    ])
    resolvePayloadUserIdMock.mockReset()
    resolvePayloadUserIdMock.mockResolvedValue('payload-user-1')
    revokeGrantMirrorRowsMock.mockReset()
    revokeGrantMirrorRowsMock.mockResolvedValue(0)
    upsertGrantMirrorRowMock.mockReset()
    upsertGrantMirrorRowMock.mockResolvedValue(undefined)
    getAutherAuthorizationSpaceIdMock.mockReset()
    getAutherAuthorizationSpaceIdMock.mockReturnValue(null)
    getAutherUseSpaceRoutingMock.mockReset()
    getAutherUseSpaceRoutingMock.mockReturnValue(false)
  })

  afterEach(() => {
    delete process.env.PAYLOAD_CLIENT_ID
    vi.restoreAllMocks()
  })

  it('uses tuple relation and source metadata for group.member.added writes', async () => {
    const event = {
      groupId: 'grp-premium',
      id: 'evt-1',
      timestamp: Date.now(),
      type: 'group.member.added' as const,
      userId: 'auth-user-1',
    }
    const rawBody = JSON.stringify(event)
    const signature = crypto
      .createHmac('sha256', 'webhook-secret')
      .update(`${event.timestamp}.${rawBody}`)
      .digest('hex')

    const response = await autherWebhookRoute(
      new Request('https://example.test/api/webhooks/auther', {
        body: rawBody,
        headers: {
          'content-type': 'application/json',
          'x-webhook-signature': `sha256=${signature}`,
          'x-webhook-timestamp': String(event.timestamp),
        },
        method: 'POST',
      }),
    )

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual({ ok: true })
    expect(upsertGrantMirrorRowMock).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        autherTupleId: 'tuple-group-1',
        entityId: 'book-9',
        entityType: 'book',
        payloadUserId: 'payload-user-1',
        relation: 'editor',
        requiresLiveCheck: true,
        sourceSubjectType: 'group',
      }),
    )
    expect(enqueueDeferredGrantJobMock).not.toHaveBeenCalled()
  })

  it('acknowledges and skips projected events for a different client envelope', async () => {
    const envelope = {
      id: 'evt-2',
      timestamp: Date.now(),
      type: 'grant.created',
      data: {
        clientId: 'blog-client-id',
        tupleId: 'tuple-blog-1',
        subjectType: 'user',
        subjectId: 'auth-user-1',
        entityType: 'client_payload-client-id:book',
        entityId: 'book-9',
        relation: 'viewer',
        hasCondition: false,
      },
    }
    const rawBody = JSON.stringify(envelope)
    const signature = crypto
      .createHmac('sha256', 'webhook-secret')
      .update(`${envelope.timestamp}.${rawBody}`)
      .digest('hex')

    const response = await autherWebhookRoute(
      new Request('https://example.test/api/webhooks/auther', {
        body: rawBody,
        headers: {
          'content-type': 'application/json',
          'x-webhook-signature': `sha256=${signature}`,
          'x-webhook-timestamp': String(envelope.timestamp),
        },
        method: 'POST',
      }),
    )

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual({ ok: true, skipped: 'wrong_client' })
    expect(upsertGrantMirrorRowMock).not.toHaveBeenCalled()
    expect(enqueueDeferredGrantJobMock).not.toHaveBeenCalled()
  })

  it('accepts future authorization space metadata while preserving client routing', async () => {
    const envelope = {
      id: 'evt-space-1',
      timestamp: Date.now(),
      type: 'grant.created',
      data: {
        clientId: 'payload-client-id',
        authorizationSpaceId: 'space_payload_content',
        tupleId: 'tuple-space-1',
        subjectType: 'user',
        subjectId: 'auth-user-1',
        entityType: 'client_payload-client-id:book',
        entityId: 'book-9',
        relation: 'viewer',
        hasCondition: false,
      },
    }
    const rawBody = JSON.stringify(envelope)
    const signature = crypto
      .createHmac('sha256', 'webhook-secret')
      .update(`${envelope.timestamp}.${rawBody}`)
      .digest('hex')

    const response = await autherWebhookRoute(
      new Request('https://example.test/api/webhooks/auther', {
        body: rawBody,
        headers: {
          'content-type': 'application/json',
          'x-webhook-signature': `sha256=${signature}`,
          'x-webhook-timestamp': String(envelope.timestamp),
        },
        method: 'POST',
      }),
    )

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual({ ok: true })
    expect(upsertGrantMirrorRowMock).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        autherTupleId: 'tuple-space-1',
        entityId: 'book-9',
        entityType: 'book',
        payloadUserId: 'payload-user-1',
        relation: 'viewer',
        sourceSubjectType: 'user',
      }),
    )
  })

  it('prefers authorization space metadata when space routing is enabled', async () => {
    getAutherAuthorizationSpaceIdMock.mockReturnValue('space_payload_content')
    getAutherUseSpaceRoutingMock.mockReturnValue(true)

    const envelope = {
      id: 'evt-space-routed-1',
      timestamp: Date.now(),
      type: 'grant.created',
      data: {
        clientId: 'blog-client-id',
        authorizationSpaceId: 'space_payload_content',
        tupleId: 'tuple-space-routed-1',
        subjectType: 'user',
        subjectId: 'auth-user-1',
        entityType: 'client_payload-client-id:book',
        entityId: 'book-9',
        relation: 'viewer',
        hasCondition: false,
      },
    }
    const rawBody = JSON.stringify(envelope)
    const signature = crypto
      .createHmac('sha256', 'webhook-secret')
      .update(`${envelope.timestamp}.${rawBody}`)
      .digest('hex')

    const response = await autherWebhookRoute(
      new Request('https://example.test/api/webhooks/auther', {
        body: rawBody,
        headers: {
          'content-type': 'application/json',
          'x-webhook-signature': `sha256=${signature}`,
          'x-webhook-timestamp': String(envelope.timestamp),
        },
        method: 'POST',
      }),
    )

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual({ ok: true })
    expect(upsertGrantMirrorRowMock).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        autherTupleId: 'tuple-space-routed-1',
        entityType: 'book',
      }),
    )
  })

  it('skips wrong authorization space events when space routing is enabled', async () => {
    getAutherAuthorizationSpaceIdMock.mockReturnValue('space_payload_content')
    getAutherUseSpaceRoutingMock.mockReturnValue(true)

    const envelope = {
      id: 'evt-space-routed-2',
      timestamp: Date.now(),
      type: 'grant.created',
      data: {
        clientId: 'payload-client-id',
        authorizationSpaceId: 'space_other',
        tupleId: 'tuple-space-routed-2',
        subjectType: 'user',
        subjectId: 'auth-user-1',
        entityType: 'client_payload-client-id:book',
        entityId: 'book-9',
        relation: 'viewer',
        hasCondition: false,
      },
    }
    const rawBody = JSON.stringify(envelope)
    const signature = crypto
      .createHmac('sha256', 'webhook-secret')
      .update(`${envelope.timestamp}.${rawBody}`)
      .digest('hex')

    const response = await autherWebhookRoute(
      new Request('https://example.test/api/webhooks/auther', {
        body: rawBody,
        headers: {
          'content-type': 'application/json',
          'x-webhook-signature': `sha256=${signature}`,
          'x-webhook-timestamp': String(envelope.timestamp),
        },
        method: 'POST',
      }),
    )

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual({
      ok: true,
      skipped: 'wrong_authorization_space',
    })
    expect(upsertGrantMirrorRowMock).not.toHaveBeenCalled()
  })

  it('skips mirrored grant writes when the tuple entity scope is not payload-owned', async () => {
    const envelope = {
      id: 'evt-3',
      timestamp: Date.now(),
      type: 'grant.created',
      data: {
        clientId: 'payload-client-id',
        tupleId: 'tuple-blog-2',
        subjectType: 'user',
        subjectId: 'auth-user-1',
        entityType: 'client_blog-client-id:book',
        entityId: 'book-9',
        relation: 'viewer',
        hasCondition: false,
      },
    }
    const rawBody = JSON.stringify(envelope)
    const signature = crypto
      .createHmac('sha256', 'webhook-secret')
      .update(`${envelope.timestamp}.${rawBody}`)
      .digest('hex')

    const response = await autherWebhookRoute(
      new Request('https://example.test/api/webhooks/auther', {
        body: rawBody,
        headers: {
          'content-type': 'application/json',
          'x-webhook-signature': `sha256=${signature}`,
          'x-webhook-timestamp': String(envelope.timestamp),
        },
        method: 'POST',
      }),
    )

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual({ ok: true })
    expect(upsertGrantMirrorRowMock).not.toHaveBeenCalled()
    expect(enqueueDeferredGrantJobMock).not.toHaveBeenCalled()
  })
})
