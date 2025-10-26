import { NextResponse, type NextRequest } from 'next/server'

import { BETTER_AUTH_TOKEN_COOKIE } from './lib/betterAuth/env'

const AUTH_MATCHERS = ['/admin/:path*', '/api/:path*', '/graphql', '/rest/:path*']

export const config = {
  matcher: AUTH_MATCHERS,
}

export function middleware(request: NextRequest) {
  const token = request.cookies.get(BETTER_AUTH_TOKEN_COOKIE)?.value

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
