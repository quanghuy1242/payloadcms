import { cookies } from 'next/headers'
import { NextResponse } from 'next/server'

import { createAuthorizeUrl, getNextAuthorizeCookieOptions } from '@/lib/betterAuth/authorize'
import { BETTER_AUTH_TOKEN_COOKIE } from '@/lib/betterAuth/env'

export async function GET() {
  try {
    const cookieStore = await cookies()

    // Check if user already has a valid session
    const existingToken = cookieStore.get(BETTER_AUTH_TOKEN_COOKIE)?.value
    if (existingToken) {
      // Return error to prevent starting new OAuth flow
      return NextResponse.json(
        {
          error: 'Already authenticated. Please log out first if you want to sign in again.',
        },
        {
          status: 409,
        },
      )
    }

    const { authorizeUrl, cookieName, cookieValue } = await createAuthorizeUrl()
    cookieStore.set(cookieName, cookieValue, getNextAuthorizeCookieOptions())

    return NextResponse.json({
      authorizeURL: authorizeUrl,
    })
  } catch (error) {
    const message =
      error instanceof Error ? error.message : 'Failed to generate Better Auth authorize URL.'

    return NextResponse.json(
      {
        error: message,
      },
      {
        status: 500,
      },
    )
  }
}
