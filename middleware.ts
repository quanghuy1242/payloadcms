import { NextResponse, type NextRequest } from 'next/server'

import { BETTER_AUTH_TOKEN_COOKIE, PAYLOAD_ADMIN_TOKEN_COOKIE } from './src/lib/betterAuth/env'

export const config = {
  matcher: ['/admin/:path*', '/api/:path*', '/graphql', '/rest/:path*'],
}

export function middleware(request: NextRequest) {
  const token =
    request.cookies.get(BETTER_AUTH_TOKEN_COOKIE)?.value ??
    request.cookies.get(PAYLOAD_ADMIN_TOKEN_COOKIE)?.value

  if (!token) {
    return NextResponse.next()
  }

  const headers = new Headers(request.headers)

  if (!headers.has('authorization')) {
    headers.set('authorization', `Bearer ${token}`)
  }

  return NextResponse.next({
    request: {
      headers,
    },
  })
}
