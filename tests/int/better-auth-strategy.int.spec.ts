import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const extractTokenFromHeadersMock = vi.hoisted(() => vi.fn())
const verifyBetterAuthTokenMock = vi.hoisted(() => vi.fn())
const upsertBetterAuthUserMock = vi.hoisted(() => vi.fn())

vi.mock('@/lib/betterAuth/tokens', async () => {
  const actual = await vi.importActual<typeof import('@/lib/betterAuth/tokens')>(
    '@/lib/betterAuth/tokens',
  )

  return {
    ...actual,
    extractTokenFromHeaders: extractTokenFromHeadersMock,
    verifyBetterAuthToken: verifyBetterAuthTokenMock,
  }
})

vi.mock('@/lib/betterAuth/users', () => ({
  upsertBetterAuthUser: upsertBetterAuthUserMock,
}))

import { betterAuthStrategy } from '@/lib/betterAuth/strategy'

describe('betterAuthStrategy', () => {
  beforeEach(() => {
    extractTokenFromHeadersMock.mockReset()
    verifyBetterAuthTokenMock.mockReset()
    upsertBetterAuthUserMock.mockReset()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('does not authenticate requests without a Better Auth token', async () => {
    extractTokenFromHeadersMock.mockReturnValue(null)

    const result = await betterAuthStrategy.authenticate({
      headers: new Headers(),
      payload: { logger: { debug: vi.fn(), error: vi.fn(), warn: vi.fn() } },
    } as never)

    expect(result.user).toBeNull()
    expect(verifyBetterAuthTokenMock).not.toHaveBeenCalled()
    expect(upsertBetterAuthUserMock).not.toHaveBeenCalled()
  })

  it('retries one transient database transport failure during user hydration', async () => {
    const payload = {
      logger: {
        debug: vi.fn(),
        error: vi.fn(),
        warn: vi.fn(),
      },
    }
    const tokenPayload = {
      email: 'reader@example.com',
      name: 'Reader',
      roles: ['user'],
      sub: 'auth-user-1',
    }
    const user = {
      betterAuthUserId: 'auth-user-1',
      email: 'reader@example.com',
      fullName: 'Reader',
      id: 101,
      role: 'user',
    }
    const transientError = new Error('Failed query: select ...: fetch failed')
    transientError.cause = new Error('SocketError: other side closed')

    extractTokenFromHeadersMock.mockReturnValue('jwt-token')
    verifyBetterAuthTokenMock.mockResolvedValue(tokenPayload)
    upsertBetterAuthUserMock
      .mockRejectedValueOnce(transientError)
      .mockResolvedValueOnce(user)

    const result = await betterAuthStrategy.authenticate({
      headers: new Headers(),
      payload,
    } as never)

    expect(result.user).toEqual(
      expect.objectContaining({
        _strategy: 'better-auth',
        collection: 'users',
        id: 101,
        betterAuthUserId: 'auth-user-1',
      }),
    )
    expect(upsertBetterAuthUserMock).toHaveBeenCalledTimes(2)
    expect(payload.logger.warn).toHaveBeenCalledWith(
      expect.stringContaining('transient database transport error'),
    )
    expect(payload.logger.error).not.toHaveBeenCalled()
  })
})
