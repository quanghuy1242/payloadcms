import { NextResponse, type NextRequest } from 'next/server'
import { cookies } from 'next/headers'

import {
  BETTER_AUTH_TOKEN_COOKIE,
  PAYLOAD_ADMIN_TOKEN_COOKIE,
  getAuthBaseUrl,
} from '@/lib/betterAuth/env'
import { getNextTokenCookieOptions } from '@/lib/betterAuth/cookies'
import { revokeBetterAuthTokens } from '@/lib/betterAuth/api'

const clearTokenCookies = async (cookieStore?: Awaited<ReturnType<typeof cookies>>) => {
  const store = cookieStore ?? (await cookies())
  const options = getNextTokenCookieOptions(0)

  store.set(BETTER_AUTH_TOKEN_COOKIE, '', {
    ...options,
    maxAge: 0,
  })

  store.set(PAYLOAD_ADMIN_TOKEN_COOKIE, '', {
    ...options,
    maxAge: 0,
  })
}

export async function POST(request: NextRequest) {
  const cookieStore = await cookies()
  const idToken = cookieStore.get(BETTER_AUTH_TOKEN_COOKIE)?.value ?? null

  // Clear local Payload cookies first
  await clearTokenCookies(cookieStore)

  // Revoke tokens at Better Auth
  await revokeBetterAuthTokens({ token: idToken })

  const baseUrl = getAuthBaseUrl()
  const redirectOrigin = request.headers.get('origin') ?? request.nextUrl.origin

  // Build Better Auth sign-out URL with post-logout redirect
  // This will clear the Better Auth session and redirect to sign-in
  const signOutUrl = new URL('/api/auth/sign-out', baseUrl)

  // After Better Auth signs out, we want to redirect back to Payload login
  const postLogoutRedirectUri = `${redirectOrigin}/admin?loggedOut=1`

  // Return the sign-out URL for the frontend to redirect to
  // Note: Better Auth's /sign-out endpoint doesn't support post_logout_redirect_uri
  // So we'll return the Payload login URL directly and rely on cookie clearing
  return NextResponse.json(
    {
      success: true,
      logoutUrl: postLogoutRedirectUri,
    },
    { status: 200 },
  )
}
