import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

describe('Better Auth env', () => {
  beforeEach(() => {
    process.env.PAYLOAD_CLIENT_ID = 'payload-client-id'
    process.env.BLOG_CLIENT_ID = 'blog-client-id'
  })

  afterEach(() => {
    delete process.env.PAYLOAD_CLIENT_ID
    delete process.env.BLOG_CLIENT_ID
    delete process.env.BETTER_AUTH_JWT_AUDIENCE
    vi.resetModules()
  })

  it('always includes the payload and blog audiences during the transition', async () => {
    process.env.BETTER_AUTH_JWT_AUDIENCE = 'existing-audience, payload-client-id'

    const { getBetterAuthExpectedAudience } = await import('@/lib/betterAuth/env')

    expect(getBetterAuthExpectedAudience()).toEqual([
      'existing-audience',
      'payload-client-id',
      'blog-client-id',
    ])
  })
})
