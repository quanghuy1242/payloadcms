import { cookies } from 'next/headers'
import { NextResponse } from 'next/server'

import {
  createAuthorizeUrl,
  getNextAuthorizeCookieOptions,
} from '@/lib/betterAuth/authorize'

export async function GET() {
  try {
    const { authorizeUrl, cookieName, cookieValue } = await createAuthorizeUrl()

    const cookieStore = await cookies()
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
