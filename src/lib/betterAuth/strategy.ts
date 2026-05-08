import type { AuthStrategy } from 'payload'

import { BetterAuthTokenError, extractTokenFromHeaders, verifyBetterAuthToken } from './tokens'
import { upsertBetterAuthUser } from './users'

const AUTH_HYDRATION_MAX_ATTEMPTS = 2
const AUTH_HYDRATION_RETRY_DELAY_MS = 75

const sleep = (durationMs: number): Promise<void> => {
  return new Promise((resolve) => setTimeout(resolve, durationMs))
}

const collectErrorMessages = (error: unknown): string[] => {
  const messages: string[] = []
  let current: unknown = error

  while (current && typeof current === 'object') {
    const message = (current as { message?: unknown }).message

    if (typeof message === 'string') {
      messages.push(message)
    }

    current = (current as { cause?: unknown }).cause
  }

  if (typeof error === 'string') {
    messages.push(error)
  }

  return messages
}

const isTransientDatabaseTransportError = (error: unknown): boolean => {
  return collectErrorMessages(error).some((message) => {
    const normalized = message.toLowerCase()

    return (
      normalized.includes('fetch failed') ||
      normalized.includes('other side closed') ||
      normalized.includes('econnreset') ||
      normalized.includes('socket hang up')
    )
  })
}

const hydrateUserWithRetry = async (
  args: Parameters<typeof upsertBetterAuthUser>[0],
): ReturnType<typeof upsertBetterAuthUser> => {
  let lastError: unknown

  for (let attempt = 1; attempt <= AUTH_HYDRATION_MAX_ATTEMPTS; attempt += 1) {
    try {
      return await upsertBetterAuthUser(args)
    } catch (error) {
      lastError = error

      if (attempt >= AUTH_HYDRATION_MAX_ATTEMPTS || !isTransientDatabaseTransportError(error)) {
        throw error
      }

      args.payload.logger.warn(
        `[auth] Better Auth user hydration failed due to a transient database transport error. Retrying attempt ${attempt + 1}/${AUTH_HYDRATION_MAX_ATTEMPTS}.`,
      )

      await sleep(AUTH_HYDRATION_RETRY_DELAY_MS)
    }
  }

  throw lastError
}

export const betterAuthStrategy: AuthStrategy = {
  name: 'better-auth',
  authenticate: async ({ headers, payload }) => {
    const token = extractTokenFromHeaders(headers)

    if (!token) {
      return { user: null }
    }

    try {
      const tokenPayload = await verifyBetterAuthToken(token)

      const user = await hydrateUserWithRetry({
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
