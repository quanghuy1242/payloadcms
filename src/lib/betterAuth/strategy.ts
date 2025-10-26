import type { AuthStrategy } from 'payload'

import { BetterAuthTokenError, extractTokenFromHeaders, verifyBetterAuthToken } from './tokens'
import { upsertBetterAuthUser } from './users'

export const betterAuthStrategy: AuthStrategy = {
  name: 'better-auth',
  authenticate: async ({ headers, payload }) => {
    const token = extractTokenFromHeaders(headers)
    console.log('Better Auth token extracted:', token?.slice(0, 10) + '...')

    if (!token) {
      return { user: null }
    }

    try {
      const tokenPayload = await verifyBetterAuthToken(token)

      const user = await upsertBetterAuthUser({
        payload,
        token: tokenPayload,
      })

      return {
        user: {
          collection: 'users',
          _strategy: 'better-auth',
          ...user,
        },
      }
    } catch (error) {
      if (error instanceof BetterAuthTokenError) {
        payload.logger.debug(`[auth] Better Auth token rejected: ${error.message}`)

        return {
          user: null,
        }
      }

      payload.logger.error(
        error instanceof Error
          ? error
          : new Error('Unknown error occurred during Better Auth authentication.'),
      )

      return {
        user: null,
      }
    }
  },
}
