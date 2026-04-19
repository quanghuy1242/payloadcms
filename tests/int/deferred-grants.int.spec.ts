import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const publishJSONMock = vi.hoisted(() => vi.fn())

vi.mock('@upstash/qstash', () => ({
  Client: vi.fn().mockImplementation(() => ({
    publishJSON: publishJSONMock,
  })),
  Receiver: vi.fn().mockImplementation(() => ({
    verify: vi.fn(),
  })),
}))

import {
  cleanupRevocationTombstones,
  enqueueDeferredGrantJob,
  processDeferredGrantJob,
} from '@/utils/deferredGrants'

describe('Deferred grant utilities', () => {
  beforeEach(() => {
    process.env.AUTH_BASE_URL = 'https://auth.example.test'
    process.env.QSTASH_TOKEN = 'test-qstash-token'
    process.env.QSTASH_CURRENT_SIGNING_KEY = 'current-signing-key'
    process.env.QSTASH_NEXT_SIGNING_KEY = 'next-signing-key'
    publishJSONMock.mockReset()
    publishJSONMock.mockResolvedValue({})
  })

  afterEach(() => {
    delete process.env.AUTH_BASE_URL
    delete process.env.QSTASH_TOKEN
    delete process.env.QSTASH_CURRENT_SIGNING_KEY
    delete process.env.QSTASH_NEXT_SIGNING_KEY
    vi.restoreAllMocks()
  })

  it('persists pending deferred grants and publishes a QStash job', async () => {
    const payload = {
      create: vi.fn().mockResolvedValue({ id: 12 }),
      find: vi.fn().mockResolvedValue({ docs: [] }),
      update: vi.fn(),
    }

    await enqueueDeferredGrantJob(payload as never, {
      id: 'event-1',
      betterAuthUserId: 'auth-user-1',
      tupleId: 'tuple-1',
      entityType: 'book',
      entityId: '99',
      relation: 'viewer',
      sourceSubjectType: 'group',
      hasCondition: true,
      timestampMs: 1_717_171_717_000,
    })

    expect(payload.create).toHaveBeenCalledWith({
      collection: 'deferred-grants',
      data: {
        betterAuthUserId: 'auth-user-1',
        tupleId: 'tuple-1',
        entityType: 'book',
        entityId: '99',
        relation: 'viewer',
        sourceSubjectType: 'group',
        hasCondition: true,
        status: 'pending',
        type: 'grant',
      },
      overrideAccess: true,
    })

    expect(publishJSONMock).toHaveBeenCalledWith({
      body: {
        id: 'event-1',
        deferredGrantId: 12,
        betterAuthUserId: 'auth-user-1',
        queuedAt: 1_717_171_717_000,
      },
      retries: 3,
      url: 'http://localhost:3000/api/internal/queues/deferred-grants',
    })
  })

  it('returns pending when the queue worker still cannot resolve the user', async () => {
    const payload = {
      find: vi
        .fn()
        .mockResolvedValueOnce({ docs: [] })
        .mockResolvedValueOnce({ docs: [] }),
      findByID: vi.fn().mockResolvedValue({
        id: 12,
        betterAuthUserId: 'auth-user-1',
        tupleId: 'tuple-1',
        entityType: 'book',
        entityId: '99',
        relation: 'viewer',
        sourceSubjectType: 'user',
        hasCondition: false,
        status: 'pending',
        type: 'grant',
        createdAt: new Date().toISOString(),
      }),
      update: vi.fn(),
    }

    const result = await processDeferredGrantJob(payload as never, {
      id: 'job-1',
      deferredGrantId: 12,
      betterAuthUserId: 'auth-user-1',
      queuedAt: Date.now(),
    })

    expect(result).toBe('pending')
    expect(payload.update).not.toHaveBeenCalled()
  })

  it('expires queued grants that have already been revoked', async () => {
    const payload = {
      find: vi.fn().mockResolvedValue({ docs: [{ id: 99, type: 'revocation_tombstone' }] }),
      findByID: vi.fn().mockResolvedValue({
        id: 12,
        betterAuthUserId: 'auth-user-1',
        tupleId: 'tuple-1',
        entityType: 'book',
        entityId: '99',
        relation: 'viewer',
        sourceSubjectType: 'user',
        hasCondition: false,
        status: 'pending',
        type: 'grant',
        createdAt: new Date().toISOString(),
      }),
      update: vi.fn().mockResolvedValue({}),
    }

    const result = await processDeferredGrantJob(payload as never, {
      id: 'job-1',
      deferredGrantId: 12,
      betterAuthUserId: 'auth-user-1',
      queuedAt: Date.now(),
    })

    expect(result).toBe('expired')
    expect(payload.update).toHaveBeenCalledWith({
      collection: 'deferred-grants',
      id: 12,
      data: {
        status: 'expired',
      },
      overrideAccess: true,
    })
  })

  it('deletes stale revocation tombstones in batches', async () => {
    const payload = {
      delete: vi.fn().mockResolvedValue({}),
      find: vi
        .fn()
        .mockResolvedValueOnce({ docs: [{ id: 1 }, { id: 2 }] })
        .mockResolvedValueOnce({ docs: [] }),
    }

    await expect(cleanupRevocationTombstones(payload as never, 48 * 60 * 60 * 1000)).resolves.toBe(2)

    expect(payload.find).toHaveBeenCalledWith({
      collection: 'deferred-grants',
      where: {
        and: [
          { type: { equals: 'revocation_tombstone' } },
          { createdAt: { less_than: expect.any(String) } },
        ],
      },
      limit: 100,
      page: 1,
      depth: 0,
      overrideAccess: true,
    })

    expect(payload.delete).toHaveBeenNthCalledWith(1, {
      collection: 'deferred-grants',
      id: 1,
      overrideAccess: true,
    })
    expect(payload.delete).toHaveBeenNthCalledWith(2, {
      collection: 'deferred-grants',
      id: 2,
      overrideAccess: true,
    })
  })
})
