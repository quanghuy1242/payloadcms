import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'

import {
  BETTER_AUTH_TOKEN_COOKIE,
  PAYLOAD_ADMIN_TOKEN_COOKIE,
  getAuthBaseUrl,
} from '@/lib/betterAuth/env'
import { getNextTokenCookieOptions } from '@/lib/betterAuth/cookies'
import { revokeBetterAuthTokens } from '@/lib/betterAuth/api'

const clearTokenCookies = async (
  cookieStore?: Awaited<ReturnType<typeof cookies>>,
) => {
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

export async function POST() {
  const cookieStore = await cookies()
  const idToken = cookieStore.get(BETTER_AUTH_TOKEN_COOKIE)?.value ?? null

  await clearTokenCookies(cookieStore)

  await revokeBetterAuthTokens({ token: idToken })

  return NextResponse.json({ success: true }, { status: 200 })
}
