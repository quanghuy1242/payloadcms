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

vi.mock('payload', () => ({
  getPayload: getPayloadMock,
}))

vi.mock('@payload-config', () => ({
  default: Promise.resolve({}),
}))

vi.mock('@/lib/env', () => ({
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
    getPayloadMock.mockResolvedValue({})
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
  })

  afterEach(() => {
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
          'x-auther-signature-256': `sha256=${signature}`,
          'x-auther-timestamp': String(event.timestamp),
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
})