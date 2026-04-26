import {
  BetterAuthTokenError,
  extractTokenFromHeaders as sharedExtractTokenFromHeaders,
  type BetterAuthClaims,
  verifyBetterAuthToken as sharedVerifyBetterAuthToken,
} from '../../../shared/auth/tokens'

import {
  BETTER_AUTH_TOKEN_COOKIE,
  PAYLOAD_ADMIN_TOKEN_COOKIE,
  getAuthBaseUrl,
  getBetterAuthExpectedAudience,
  getBetterAuthExpectedIssuer,
} from './env'

export type BetterAuthTokenPayload = BetterAuthClaims

export const extractTokenFromHeaders = (headers: Headers): string | null => {
  const tokenResult = sharedExtractTokenFromHeaders(headers, [
    BETTER_AUTH_TOKEN_COOKIE,
    PAYLOAD_ADMIN_TOKEN_COOKIE,
  ])

  return tokenResult?.token ?? null
}

export const verifyBetterAuthToken = async (token: string): Promise<BetterAuthTokenPayload> => {
  return sharedVerifyBetterAuthToken(token, {
    authBaseUrl: getAuthBaseUrl(),
    expectedAudience: getBetterAuthExpectedAudience(),
    expectedIssuer: getBetterAuthExpectedIssuer(),
  })
}

export { BetterAuthTokenError }
