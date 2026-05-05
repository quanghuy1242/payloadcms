import { createRemoteJWKSet, errors, jwtVerify, type JWTPayload } from 'jose'

import {
  BETTER_AUTH_TOKEN_COOKIE,
  PAYLOAD_ADMIN_TOKEN_COOKIE,
  getAuthBaseUrl,
  getBetterAuthExpectedAudience,
  getBetterAuthExpectedIssuer,
} from './env'
import { getCookieValue } from '@/utils/cookies'

const bearerPrefix = 'bearer '

export const extractTokenFromHeaders = (headers: Headers): string | null => {
  const authorization = headers.get('authorization')

  if (authorization) {
    const normalized = authorization.trim()

    if (normalized.toLowerCase().startsWith(bearerPrefix)) {
      const token = normalized.slice(bearerPrefix.length).trim()

      if (token.length > 0) {
        return token
      }
    }
  }

  const cookieHeader = headers.get('cookie')

  if (!cookieHeader) {
    return null
  }

  return (
    getCookieValue(cookieHeader, BETTER_AUTH_TOKEN_COOKIE) ??
    getCookieValue(cookieHeader, PAYLOAD_ADMIN_TOKEN_COOKIE)
  )
}

const getJwks = () => {
  const baseUrl = getAuthBaseUrl()

  return createRemoteJWKSet(new URL('/api/auth/jwks', baseUrl))
}

let cachedJwks: ReturnType<typeof getJwks> | null = null

const resolveJwks = () => {
  if (!cachedJwks) {
    cachedJwks = getJwks()
  }

  return cachedJwks
}

export class BetterAuthTokenError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'BetterAuthTokenError'
  }
}

export type BetterAuthTokenPayload = JWTPayload & {
  sub: string
  email?: string
  name?: string
  picture?: string
  roles?: string[] | string
}

export const verifyBetterAuthToken = async (token: string): Promise<BetterAuthTokenPayload> => {
  const jwks = resolveJwks()

  const issuer = getBetterAuthExpectedIssuer() ?? getAuthBaseUrl()
  const audience = getBetterAuthExpectedAudience()

  try {
    const verificationResult = await jwtVerify(token, jwks, {
      issuer: issuer ?? undefined,
      audience: audience && audience.length > 0 ? (audience.length === 1 ? audience[0] : audience) : undefined,
    })

    return verificationResult.payload as BetterAuthTokenPayload
  } catch (error) {
    if (error instanceof errors.JWTExpired) {
      throw new BetterAuthTokenError('Better Auth token has expired.')
    }

    if (error instanceof errors.JOSEError) {
      throw new BetterAuthTokenError(`Failed to verify Better Auth token: ${error.message}`)
    }

    throw error
  }
}
