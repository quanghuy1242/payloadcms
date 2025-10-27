import { NextResponse, type NextRequest } from 'next/server'
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

export async function POST(request: NextRequest) {
  const cookieStore = await cookies()
  const idToken = cookieStore.get(BETTER_AUTH_TOKEN_COOKIE)?.value ?? null

  await clearTokenCookies(cookieStore)

  await revokeBetterAuthTokens({ token: idToken })

  let logoutUrl: string | null = null

  try {
    const baseUrl = getAuthBaseUrl()
    const discoveryResponse = await fetch(
      new URL('/.well-known/openid-configuration', baseUrl).toString(),
    )

    if (discoveryResponse.ok) {
      const discovery = (await discoveryResponse.json()) as { end_session_endpoint?: string }
      if (discovery.end_session_endpoint) {
        const redirectOrigin = request.headers.get('origin') ?? request.nextUrl.origin
        const postLogoutRedirect = redirectOrigin
          ? `${redirectOrigin}/admin?loggedOut=1`
          : undefined

        const endSessionUrl = new URL(discovery.end_session_endpoint)

        if (idToken) {
          endSessionUrl.searchParams.set('id_token_hint', idToken)
        }

        if (postLogoutRedirect) {
          endSessionUrl.searchParams.set('post_logout_redirect_uri', postLogoutRedirect)
        }

        logoutUrl = endSessionUrl.toString()
      }
    }
  } catch (error) {
    console.warn('Failed to resolve Better Auth end session endpoint.', error)
  }

  return NextResponse.json({ success: true, logoutUrl }, { status: 200 })
}
