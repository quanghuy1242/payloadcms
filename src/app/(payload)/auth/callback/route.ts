import { NextRequest, NextResponse } from 'next/server'

import {
  BETTER_AUTH_STATE_COOKIE,
  BETTER_AUTH_TOKEN_COOKIE,
  PAYLOAD_ADMIN_TOKEN_COOKIE,
  getAuthBaseUrl,
  getPayloadClientId,
  getPayloadClientSecret,
  getPayloadRedirectUri,
} from '@/lib/betterAuth/env'
import { getNextAuthorizeCookieOptions, readPkceCookie } from '@/lib/betterAuth/authorize'
import {
  getNextHostOnlyTokenCookieOptions,
  getNextTokenCookieOptions,
} from '@/lib/betterAuth/cookies'

const buildRedirectResponse = (location: string) => {
  return NextResponse.redirect(location)
}

const clearPkceCookie = (response: NextResponse) => {
  const options = getNextAuthorizeCookieOptions()

  response.cookies.set(BETTER_AUTH_STATE_COOKIE, '', {
    ...options,
    maxAge: 0,
  })
}

export async function GET(request: NextRequest) {
  const url = request.nextUrl
  const code = url.searchParams.get('code')
  const state = url.searchParams.get('state')
  const error = url.searchParams.get('error')

  if (error) {
    const response = buildRedirectResponse(`${url.origin}/admin?error=${encodeURIComponent(error)}`)
    clearPkceCookie(response)

    return response
  }

  if (!code || !state) {
    const response = buildRedirectResponse(`${url.origin}/admin?error=missing_code`)
    clearPkceCookie(response)

    return response
  }

  // Keep the existing session intact and avoid reprocessing an already-completed flow.
  const existingToken = request.cookies.get(BETTER_AUTH_TOKEN_COOKIE)?.value
  if (existingToken) {
    const response = buildRedirectResponse(`${url.origin}/admin`)
    clearPkceCookie(response)

    return response
  }

  const pkceCookie = request.cookies.get(BETTER_AUTH_STATE_COOKIE)?.value ?? null
  const pkcePayload = readPkceCookie(pkceCookie)

  if (!pkcePayload || pkcePayload.state !== state) {
    const response = buildRedirectResponse(`${url.origin}/admin?error=invalid_state`)
    clearPkceCookie(response)

    return response
  }

  const redirectUri = getPayloadRedirectUri()

  if (!redirectUri) {
    const response = buildRedirectResponse(`${url.origin}/admin?error=missing_redirect_uri`)
    clearPkceCookie(response)

    return response
  }

  const tokenEndpoint = new URL('/api/auth/oauth2/token', getAuthBaseUrl())

  const clientId = getPayloadClientId()
  const clientSecret = getPayloadClientSecret()

  const basicAuth = Buffer.from(`${clientId}:${clientSecret}`).toString('base64')

  const tokenResponse = await fetch(tokenEndpoint.toString(), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      Authorization: `Basic ${basicAuth}`,
    },
    body: new URLSearchParams({
      grant_type: 'authorization_code',
      code,
      redirect_uri: redirectUri,
      code_verifier: pkcePayload.verifier,
    }),
  })

  if (!tokenResponse.ok) {
    const response = buildRedirectResponse(
      `${url.origin}/admin?error=token_exchange_failed&status=${tokenResponse.status}`,
    )
    clearPkceCookie(response)

    return response
  }

  const tokenData = (await tokenResponse.json().catch(() => null)) as {
    access_token?: string
    id_token?: string
    expires_in?: number
  } | null

  const idToken = tokenData?.id_token

  if (!idToken) {
    const response = buildRedirectResponse(`${url.origin}/admin?error=missing_id_token`)
    clearPkceCookie(response)

    return response
  }

  const expiresInSeconds = tokenData?.expires_in ?? 24 * 60 * 60 // Default to 24 hours
  const response = buildRedirectResponse(`${url.origin}/admin`)

  const cookieOptions = getNextTokenCookieOptions(expiresInSeconds)
  const hostOnlyCookieOptions = getNextHostOnlyTokenCookieOptions(expiresInSeconds)

  response.cookies.set(BETTER_AUTH_TOKEN_COOKIE, idToken, cookieOptions)
  response.cookies.set(PAYLOAD_ADMIN_TOKEN_COOKIE, idToken, cookieOptions)
  response.cookies.set(BETTER_AUTH_TOKEN_COOKIE, '', {
    ...hostOnlyCookieOptions,
    maxAge: 0,
  })
  response.cookies.set(PAYLOAD_ADMIN_TOKEN_COOKIE, '', {
    ...hostOnlyCookieOptions,
    maxAge: 0,
  })
  clearPkceCookie(response)

  response.headers.set('Cache-Control', 'no-store')

  return response
}
