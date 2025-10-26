import crypto from 'node:crypto'

import {
  BETTER_AUTH_STATE_COOKIE,
  getAuthBaseUrl,
  getPayloadClientId,
  getPayloadRedirectUri,
} from './env'
import {
  BetterAuthPkceCookiePayload,
  PKCE_COOKIE_MAX_AGE_SECONDS,
  createPkceCookieValue,
  getExpressPkceCookieOptions,
  getNextPkceCookieOptions,
  parsePkceCookieValue,
  isPkcePayloadExpired,
} from './cookies'
import { createPkcePair } from './pkce'

const DEFAULT_SCOPE = 'openid email profile'

export type CreateAuthorizeUrlResult = {
  authorizeUrl: string
  state: string
  verifier: string
  cookieValue: string
  cookieName: string
  cookieMaxAgeSeconds: number
}

export const createAuthorizeUrl = async (): Promise<CreateAuthorizeUrlResult> => {
  const clientId = getPayloadClientId()
  const redirectUri = getPayloadRedirectUri()

  if (!redirectUri) {
    throw new Error('PAYLOAD_REDIRECT_URI must be configured to initiate Better Auth flow.')
  }

  const baseUrl = getAuthBaseUrl()
  const state = crypto.randomUUID()
  const { verifier, challenge } = await createPkcePair()

  const authorizeUrl = new URL('/api/auth/oauth2/authorize', baseUrl)
  authorizeUrl.searchParams.set('client_id', clientId)
  authorizeUrl.searchParams.set('redirect_uri', redirectUri)
  authorizeUrl.searchParams.set('response_type', 'code')
  authorizeUrl.searchParams.set('scope', DEFAULT_SCOPE)
  authorizeUrl.searchParams.set('state', state)
  authorizeUrl.searchParams.set('code_challenge', challenge)
  authorizeUrl.searchParams.set('code_challenge_method', 'S256')

  const now = Date.now()
  const cookiePayload: BetterAuthPkceCookiePayload = {
    state,
    verifier,
    createdAt: now,
  }

  return {
    authorizeUrl: authorizeUrl.toString(),
    state,
    verifier,
    cookieValue: createPkceCookieValue(cookiePayload),
    cookieName: BETTER_AUTH_STATE_COOKIE,
    cookieMaxAgeSeconds: PKCE_COOKIE_MAX_AGE_SECONDS,
  }
}

export const getExpressAuthorizeCookieOptions = getExpressPkceCookieOptions
export const getNextAuthorizeCookieOptions = getNextPkceCookieOptions

export const readPkceCookie = (cookieValue: string | null | undefined) => {
  const payload = parsePkceCookieValue(cookieValue)

  if (!payload) {
    return null
  }

  if (isPkcePayloadExpired(payload)) {
    return null
  }

  return payload
}
