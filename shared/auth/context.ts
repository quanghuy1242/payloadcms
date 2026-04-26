import type { SharedDatabase } from '../db/client'
import { loadSharedLocalUserProjection, type SharedLocalUser } from '../db/users'
import {
  BetterAuthTokenError,
  extractTokenFromHeaders,
  type BetterAuthClaims,
  type TokenSource,
  normalizeBetterAuthRoles,
  verifyBetterAuthToken,
} from './tokens'

export type SharedRequestAuth = {
  claims: BetterAuthClaims | null
  isAdmin: boolean
  isAuthenticated: boolean
  localUser: SharedLocalUser | null
  roles: string[]
  tokenSource: TokenSource | null
}

export type SharedAuthEnvironment = {
  authBaseUrl: string
  expectedAudience?: string | string[] | null
  expectedIssuer?: string | null
}

export type SharedAuthResolution =
  | {
      auth: SharedRequestAuth
      kind: 'anonymous' | 'authenticated'
    }
  | {
      kind: 'rejected'
      response: Response
    }

export type SharedAuthOptions = SharedAuthEnvironment & {
  cookieNames: readonly string[]
  db: SharedDatabase
  request: Request
}

const createResponse = (status: number, error: string) => {
  return new Response(JSON.stringify({ error }), {
    headers: {
      'content-type': 'application/json',
    },
    status,
  })
}

export const resolveSharedRequestAuth = async ({
  authBaseUrl,
  cookieNames,
  db,
  expectedAudience,
  expectedIssuer,
  request,
}: SharedAuthOptions): Promise<SharedAuthResolution> => {
  const tokenResult = extractTokenFromHeaders(request.headers, cookieNames)

  if (!tokenResult) {
    return {
      auth: {
        claims: null,
        isAdmin: false,
        isAuthenticated: false,
        localUser: null,
        roles: [],
        tokenSource: null,
      },
      kind: 'anonymous',
    }
  }

  let claims: BetterAuthClaims

  try {
    claims = await verifyBetterAuthToken(tokenResult.token, {
      authBaseUrl,
      expectedAudience,
      expectedIssuer,
    })
  } catch (error) {
    if (error instanceof BetterAuthTokenError) {
      return {
        kind: 'rejected',
        response: createResponse(401, error.message),
      }
    }

    return {
      kind: 'rejected',
      response: createResponse(
        500,
        error instanceof Error ? error.message : 'Unknown error occurred while verifying the auth token.',
      ),
    }
  }

  const localUser = await loadSharedLocalUserProjection(db, claims)
  const tokenRoles = normalizeBetterAuthRoles(claims.roles)
  const role = localUser?.role ?? (tokenRoles.includes('admin') ? 'admin' : 'user')

  return {
    auth: {
      claims,
      isAdmin: role === 'admin',
      isAuthenticated: true,
      localUser,
      roles: tokenRoles,
      tokenSource: tokenResult.source,
    },
    kind: 'authenticated',
  }
}
