import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const signUpBetterAuthUserMock = vi.hoisted(() => vi.fn())
const drainDeferredGrantsForUserMock = vi.hoisted(() => vi.fn())

vi.mock('@/lib/betterAuth/api', () => {
  class BetterAuthRequestError extends Error {
    status: number

    constructor(message: string, status = 500) {
      super(message)
      this.name = 'BetterAuthRequestError'
      this.status = status
    }
  }

  class BetterAuthUserExistsError extends Error {
    status: number

    constructor(message: string, status = 409) {
      super(message)
      this.name = 'BetterAuthUserExistsError'
      this.status = status
    }
  }

  return {
    BetterAuthRequestError,
    BetterAuthUserExistsError,
    signUpBetterAuthUser: signUpBetterAuthUserMock,
  }
})

vi.mock('@/utils/deferredGrants', () => ({
  drainDeferredGrantsForUser: drainDeferredGrantsForUserMock,
}))

import {
  usersAfterOperationHook,
  usersBeforeChangeHook,
  usersBeforeValidateHook,
} from '@/utils/access'

afterEach(() => {
  vi.restoreAllMocks()
})

beforeEach(() => {
  signUpBetterAuthUserMock.mockReset()
  drainDeferredGrantsForUserMock.mockReset()
  drainDeferredGrantsForUserMock.mockResolvedValue(undefined)
})

describe('Users hooks', () => {
  it('forces non-admin users to stay on the user role', () => {
    const createResult = usersBeforeValidateHook({
      data: {
        role: 'admin',
      },
      operation: 'create',
      req: {
        user: {
          id: 1,
          role: 'user',
        },
      },
    } as never) as Record<string, unknown>

    expect(createResult.role).toBe('user')

    const updateResult = usersBeforeValidateHook({
      data: {
        role: 'user',
      },
      operation: 'update',
      originalDoc: {
        role: 'admin',
      },
      req: {
        user: {
          id: 1,
          role: 'user',
        },
      },
    } as never) as Record<string, unknown>

    expect(updateResult.role).toBe('admin')
  })

  it('provisions Better Auth users on create and preserves an existing identifier on update', async () => {
    signUpBetterAuthUserMock.mockResolvedValueOnce({
      id: 'auth-123',
      email: 'reader@example.com',
      name: 'Reader Name',
    })

    const createResult = await usersBeforeChangeHook({
      data: {
        email: ' reader@example.com ',
        fullName: ' Reader Name ',
      },
      operation: 'create',
    } as never)

    expect(signUpBetterAuthUserMock).toHaveBeenCalledWith({
      email: 'reader@example.com',
      name: 'Reader Name',
    })
    expect(createResult).toMatchObject({
      betterAuthUserId: 'auth-123',
      email: 'reader@example.com',
      fullName: 'Reader Name',
    })

    const updateResult = await usersBeforeChangeHook({
      data: {
        email: 'someone-else@example.com',
      },
      operation: 'update',
      originalDoc: {
        betterAuthUserId: 'existing-auth-id',
      },
    } as never)

    expect(updateResult).toMatchObject({
      betterAuthUserId: 'existing-auth-id',
    })
    expect(signUpBetterAuthUserMock).toHaveBeenCalledTimes(1)
  })

  it('requires an email when provisioning a new user without a Better Auth identifier', async () => {
    await expect(
      usersBeforeChangeHook({
        data: {
          fullName: 'No Email User',
        },
        operation: 'create',
      } as never),
    ).rejects.toThrow('Email is required to provision Better Auth users.')

    expect(signUpBetterAuthUserMock).not.toHaveBeenCalled()
  })

  it('drains deferred grants after a new user is created', async () => {
    const result = await usersAfterOperationHook({
      operation: 'create',
      req: {
        payload: {},
      },
      result: {
        betterAuthUserId: 'auth-555',
        id: 55,
      },
    } as never)

    expect(result).toEqual({
      betterAuthUserId: 'auth-555',
      id: 55,
    })
    expect(drainDeferredGrantsForUserMock).toHaveBeenCalledWith({}, 'auth-555', 55)
  })

  it('logs deferred grant drain failures without blocking user creation', async () => {
    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    drainDeferredGrantsForUserMock.mockRejectedValueOnce(new Error('queue worker failed'))

    const result = await usersAfterOperationHook({
      operation: 'create',
      req: {
        payload: {},
      },
      result: {
        betterAuthUserId: 'auth-777',
        id: 77,
      },
    } as never)

    await Promise.resolve()

    expect(result).toEqual({
      betterAuthUserId: 'auth-777',
      id: 77,
    })
    expect(consoleErrorSpy).toHaveBeenCalledWith(
      '[users] Failed to drain deferred grants for user:',
      'auth-777',
      expect.any(Error),
    )
  })
})
