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

  // Revoke tokens at Better Auth
  await revokeBetterAuthTokens({ token: idToken })

  const baseUrl = getAuthBaseUrl()
  const redirectOrigin = request.headers.get('origin') ?? request.nextUrl.origin

  // Build a logout redirect page URL that will handle the Better Auth sign-out
  const returnUrl = `${redirectOrigin}/admin?loggedOut=1`
  const logoutRedirectUrl = `${redirectOrigin}/auth/logout-redirect?authBaseUrl=${encodeURIComponent(baseUrl)}&returnUrl=${encodeURIComponent(returnUrl)}`

  // Create response with Set-Cookie headers to clear cookies in the browser
  const response = NextResponse.json(
    {
      success: true,
      logoutUrl: logoutRedirectUrl,
    },
    { status: 200 },
  )

  // Clear cookies in the browser by setting them with maxAge: 0
  const cookieOptions = getNextTokenCookieOptions(0)

  response.cookies.set(BETTER_AUTH_TOKEN_COOKIE, '', {
    ...cookieOptions,
    maxAge: 0,
  })

  response.cookies.set(PAYLOAD_ADMIN_TOKEN_COOKIE, '', {
    ...cookieOptions,
    maxAge: 0,
  })

  return response
}
