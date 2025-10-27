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

  // Clear local cookies first
  await clearTokenCookies(cookieStore)

  // Try to revoke tokens at Better Auth (non-blocking)
  await revokeBetterAuthTokens({ token: idToken })

  // Build the redirect URL to Better Auth sign-in page
  const baseUrl = getAuthBaseUrl()
  const redirectOrigin = request.headers.get('origin') ?? request.nextUrl.origin

  // Redirect to Better Auth's sign-in page with a return URL
  const signInUrl = new URL('/sign-in', baseUrl)
  signInUrl.searchParams.set('callbackURL', `${redirectOrigin}/admin?loggedOut=1`)

  return NextResponse.json(
    {
      success: true,
      logoutUrl: signInUrl.toString(),
    },
    { status: 200 },
  )
}
