import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const drainDeferredGrantsForUserMock = vi.hoisted(() => vi.fn())

vi.mock('@/utils/deferredGrants', () => ({
  drainDeferredGrantsForUser: drainDeferredGrantsForUserMock,
}))

import { upsertBetterAuthUser } from '@/lib/betterAuth/users'

describe('upsertBetterAuthUser', () => {
  beforeEach(() => {
    drainDeferredGrantsForUserMock.mockReset()
    drainDeferredGrantsForUserMock.mockResolvedValue(undefined)
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('synchronously drains deferred grants for newly created users', async () => {
    const payload = {
      create: vi.fn().mockResolvedValue({
        betterAuthUserId: 'auth-user-1',
        email: 'reader@example.com',
        fullName: 'Reader',
        id: 101,
        role: 'user',
      }),
      find: vi
        .fn()
        .mockResolvedValueOnce({ docs: [] })
        .mockResolvedValueOnce({ docs: [] }),
    }

    const user = await upsertBetterAuthUser({
      payload: payload as never,
      token: {
        email: 'reader@example.com',
        name: 'Reader',
        roles: ['user'],
        sub: 'auth-user-1',
      },
    })

    expect(user.id).toBe(101)
    expect(drainDeferredGrantsForUserMock).toHaveBeenCalledWith(payload, 'auth-user-1', 101)
  })

  it('synchronously drains deferred grants when an email match is newly linked', async () => {
    const payload = {
      find: vi
        .fn()
        .mockResolvedValueOnce({ docs: [] })
        .mockResolvedValueOnce({
          docs: [
            {
              betterAuthUserId: null,
              email: 'reader@example.com',
              fullName: 'Reader',
              id: 55,
              role: 'user',
            },
          ],
        }),
      update: vi.fn().mockResolvedValue({
        betterAuthUserId: 'auth-user-2',
        email: 'reader@example.com',
        fullName: 'Reader',
        id: 55,
        role: 'user',
      }),
    }

    const user = await upsertBetterAuthUser({
      payload: payload as never,
      token: {
        email: 'reader@example.com',
        name: 'Reader',
        roles: ['user'],
        sub: 'auth-user-2',
      },
    })

    expect(user.id).toBe(55)
    expect(drainDeferredGrantsForUserMock).toHaveBeenCalledWith(payload, 'auth-user-2', 55)
  })

  it('does not drain deferred grants for already linked users', async () => {
    const payload = {
      find: vi.fn().mockResolvedValue({
        docs: [
          {
            betterAuthUserId: 'auth-user-3',
            email: 'reader@example.com',
            fullName: 'Reader',
            id: 77,
            role: 'user',
          },
        ],
      }),
    }

    const user = await upsertBetterAuthUser({
      payload: payload as never,
      token: {
        email: 'reader@example.com',
        name: 'Reader',
        roles: ['user'],
        sub: 'auth-user-3',
      },
    })

    expect(user.id).toBe(77)
    expect(drainDeferredGrantsForUserMock).not.toHaveBeenCalled()
  })
})
