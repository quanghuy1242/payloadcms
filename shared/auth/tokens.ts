import { createRemoteJWKSet, errors, jwtVerify, type JWTPayload } from 'jose'

const bearerPrefix = 'bearer '
const jwksCache = new Map<string, ReturnType<typeof createRemoteJWKSet>>()

export class BetterAuthTokenError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'BetterAuthTokenError'
  }
}

export type BetterAuthClaims = JWTPayload & {
  email?: string
  name?: string
  picture?: string
  roles?: string[] | string
  sub: string
}

export type TokenSource = 'bearer' | 'cookie'

export type TokenExtractionResult = {
  source: TokenSource
  token: string
}

export type TokenExtractionHeaders = Pick<Headers, 'get'>

export type BetterAuthVerificationOptions = {
  authBaseUrl: string
  expectedAudience?: string | string[] | null
  expectedIssuer?: string | null
}

const parseCookieHeader = (cookieHeader: string): Map<string, string> => {
  const cookies = new Map<string, string>()

  for (const segment of cookieHeader.split(';')) {
    const separatorIndex = segment.indexOf('=')

    if (separatorIndex < 0) {
      continue
    }

    const name = segment.slice(0, separatorIndex).trim()
    const value = segment.slice(separatorIndex + 1).trim()

    if (name.length === 0 || value.length === 0) {
      continue
    }

    cookies.set(name, decodeURIComponent(value))
  }

  return cookies
}

export const extractTokenFromHeaders = (
  headers: TokenExtractionHeaders,
  cookieNames: readonly string[],
): TokenExtractionResult | null => {
  const authorization = headers.get('authorization')

  if (authorization) {
    const normalized = authorization.trim()

    if (normalized.toLowerCase().startsWith(bearerPrefix)) {
      const token = normalized.slice(bearerPrefix.length).trim()

      if (token.length > 0) {
        return {
          source: 'bearer',
          token,
        }
      }
    }
  }

  const cookieHeader = headers.get('cookie')

  if (!cookieHeader) {
    return null
  }

  const cookies = parseCookieHeader(cookieHeader)

  for (const cookieName of cookieNames) {
    const token = cookies.get(cookieName)

    if (token && token.length > 0) {
      return {
        source: 'cookie',
        token,
      }
    }
  }

  return null
}

const resolveJwks = (baseUrl: string) => {
  const cached = jwksCache.get(baseUrl)

  if (cached) {
    return cached
  }

  const jwks = createRemoteJWKSet(new URL('/api/auth/jwks', baseUrl))
  jwksCache.set(baseUrl, jwks)

  return jwks
}

const parseAudience = (value: string | string[] | null | undefined): string | string[] | undefined => {
  if (!value) {
    return undefined
  }

  if (Array.isArray(value)) {
    const filtered = value.map((part) => part.trim()).filter(Boolean)

    if (filtered.length === 0) {
      return undefined
    }

    return filtered.length === 1 ? filtered[0] : filtered
  }

  const parts = value
    .split(/[\s,]+/g)
    .map((part) => part.trim())
    .filter(Boolean)

  if (parts.length === 0) {
    return undefined
  }

  return parts.length === 1 ? parts[0] : parts
}

export const verifyBetterAuthToken = async (
  token: string,
  options: BetterAuthVerificationOptions,
): Promise<BetterAuthClaims> => {
  if (!options.authBaseUrl) {
    throw new Error('AUTH_BASE_URL is required to verify Better Auth tokens.')
  }

  const issuer = options.expectedIssuer ?? options.authBaseUrl
  const audience = parseAudience(options.expectedAudience)

  try {
    const verificationResult = await jwtVerify(token, resolveJwks(options.authBaseUrl), {
      audience,
      issuer,
    })

    return verificationResult.payload as BetterAuthClaims
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

export const normalizeBetterAuthRoles = (roles: BetterAuthClaims['roles']): string[] => {
  if (!roles) {
    return []
  }

  if (Array.isArray(roles)) {
    return roles.filter((role): role is string => typeof role === 'string' && role.length > 0)
  }

  return roles.length > 0 ? [roles] : []
}

export const pickPreferredBetterAuthRole = (roles: string[]): 'admin' | 'user' | null => {
  if (roles.length === 0) {
    return null
  }

  if (roles.some((role) => role === 'admin')) {
    return 'admin'
  }

  if (roles.some((role) => role === 'user')) {
    return 'user'
  }

  return null
}
