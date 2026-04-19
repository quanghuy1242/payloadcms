import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const getPayloadMock = vi.hoisted(() => vi.fn())
const headersMock = vi.hoisted(() => vi.fn(async () => new Headers()))
const cleanupRevocationTombstonesMock = vi.hoisted(() => vi.fn())
const enqueueDeferredGrantJobMock = vi.hoisted(() => vi.fn())
const fetchAutherGroupMembersMock = vi.hoisted(() => vi.fn())
const listAutherClientGrantsMock = vi.hoisted(() => vi.fn())
const listAutherObjectsMock = vi.hoisted(() => vi.fn())
const resolvePayloadUserIdMock = vi.hoisted(() => vi.fn())
const upsertGrantMirrorRowMock = vi.hoisted(() => vi.fn())

vi.mock('payload', () => ({
  getPayload: getPayloadMock,
}))

vi.mock('next/headers', () => ({
  headers: headersMock,
}))

vi.mock('@payload-config', () => ({
  default: Promise.resolve({}),
}))

vi.mock('@/utils/deferredGrants', () => ({
  cleanupRevocationTombstones: cleanupRevocationTombstonesMock,
  enqueueDeferredGrantJob: enqueueDeferredGrantJobMock,
}))

vi.mock('@/utils/grantMirror', async () => {
  const actual = await vi.importActual<typeof import('@/utils/grantMirror')>('@/utils/grantMirror')

  return {
    ...actual,
    fetchAutherGroupMembers: fetchAutherGroupMembersMock,
    listAutherClientGrants: listAutherClientGrantsMock,
    listAutherObjects: listAutherObjectsMock,
    resolvePayloadUserId: resolvePayloadUserIdMock,
    upsertGrantMirrorRow: upsertGrantMirrorRowMock,
  }
})

import { POST as reconcileRoute } from '@/app/api/internal/reconcile/route'

describe('Reconcile route', () => {
  beforeEach(() => {
    process.env.CRON_SECRET = 'cron-secret'

    headersMock.mockResolvedValue(
      new Headers({
        authorization: 'Bearer cron-secret',
      }),
    )

    cleanupRevocationTombstonesMock.mockReset()
    cleanupRevocationTombstonesMock.mockResolvedValue(2)
    enqueueDeferredGrantJobMock.mockReset()
    enqueueDeferredGrantJobMock.mockResolvedValue(101)
    fetchAutherGroupMembersMock.mockReset()
    fetchAutherGroupMembersMock.mockResolvedValue(['auth-user-1'])
    listAutherClientGrantsMock.mockReset()
    listAutherClientGrantsMock.mockResolvedValue({
      grants: [
        {
          relation: 'editor',
          subjectId: 'grp-premium',
          subjectType: 'group',
          tupleId: 'tuple-group-1',
          userEmail: null,
          userId: null,
        },
      ],
      hasMore: false,
      nextCursor: null,
    })
    listAutherObjectsMock.mockReset()
    listAutherObjectsMock.mockResolvedValue([
      {
        abacRequired: false,
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
    resolvePayloadUserIdMock.mockResolvedValue(null)
    upsertGrantMirrorRowMock.mockReset()

    getPayloadMock.mockResolvedValue({
      find: vi.fn().mockResolvedValue({ docs: [], hasNextPage: false }),
    })
  })

  afterEach(() => {
    delete process.env.CRON_SECRET
    vi.restoreAllMocks()
  })

  it('bootstraps unknown users into deferred grants with exact tuple metadata and cleans tombstones', async () => {
    const response = await reconcileRoute(
      new Request('https://example.test/api/internal/reconcile', {
        method: 'POST',
      }),
    )

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toMatchObject({
      bootstrapUsersDiscovered: 1,
      deferredEnqueued: 1,
      ok: true,
      tombstonesDeleted: 2,
      usersProcessed: 0,
    })

    expect(enqueueDeferredGrantJobMock).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        betterAuthUserId: 'auth-user-1',
        entityId: 'book-9',
        entityType: 'book',
        relation: 'editor',
        sourceSubjectType: 'group',
        tupleId: 'tuple-group-1',
      }),
    )
    expect(cleanupRevocationTombstonesMock).toHaveBeenCalledTimes(1)
    expect(upsertGrantMirrorRowMock).not.toHaveBeenCalled()
  })
})