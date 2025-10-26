import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'

import { BETTER_AUTH_TOKEN_COOKIE, getAuthBaseUrl } from '@/lib/betterAuth/env'
import { getNextTokenCookieOptions } from '@/lib/betterAuth/cookies'

const clearTokenCookie = async (
  cookieStore?: Awaited<ReturnType<typeof cookies>>,
) => {
  const store = cookieStore ?? (await cookies())
  const options = getNextTokenCookieOptions(0)

  store.set(BETTER_AUTH_TOKEN_COOKIE, '', {
    ...options,
    maxAge: 0,
  })
}

export async function POST() {
  const cookieStore = await cookies()
  const token = cookieStore.get(BETTER_AUTH_TOKEN_COOKIE)?.value ?? null

  await clearTokenCookie(cookieStore)

  if (token) {
    const logoutEndpoint = new URL('/api/auth/oauth2/logout', getAuthBaseUrl())

    await fetch(logoutEndpoint.toString(), {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
      },
    }).catch(() => {
      // Swallow logout errors to avoid blocking local logout.
    })
  }

  return NextResponse.json({ success: true }, { status: 200 })
}
