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

  // Get all cookies from the request to forward to Better Auth
  const cookieHeader = request.headers.get('cookie')

  // Call Better Auth's sign-out endpoint with the user's cookies
  // This ensures Better Auth session cookies get cleared
  if (cookieHeader) {
    try {
      await fetch(new URL('/api/auth/sign-out', baseUrl).toString(), {
        method: 'POST',
        headers: {
          Cookie: cookieHeader,
          'Content-Type': 'application/json',
        },
      })
    } catch (err) {
      console.error('Failed to sign out from Better Auth:', err)
    }
  }

  const postLogoutRedirectUri = `${redirectOrigin}/admin?loggedOut=1`

  return NextResponse.json(
    {
      success: true,
      logoutUrl: postLogoutRedirectUri,
    },
    { status: 200 },
  )
}
