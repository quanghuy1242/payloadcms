import { describe, expect, it } from 'vitest'

import { extractTokenFromHeaders } from '@/lib/betterAuth/tokens'

describe('Better Auth token extraction', () => {
  it('prefers bearer tokens over auth cookies', () => {
    const headers = new Headers({
      authorization: 'Bearer header-token',
      cookie: 'betterAuthToken=cookie-token',
    })

    expect(extractTokenFromHeaders(headers)).toBe('header-token')
  })

  it('extracts URL-encoded cookie values that contain equals signs', () => {
    const token = 'jwt.segment=='
    const headers = new Headers({
      cookie: `theme=dark; betterAuthToken=${encodeURIComponent(token)}`,
    })

    expect(extractTokenFromHeaders(headers)).toBe(token)
  })

  it('falls back to the Payload admin token cookie', () => {
    const headers = new Headers({
      cookie: 'payload-token=payload-cookie-token',
    })

    expect(extractTokenFromHeaders(headers)).toBe('payload-cookie-token')
  })
})
