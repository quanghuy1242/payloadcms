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
    delete process.env.PAYLOAD_RESOURCE_SERVER_AUDIENCE
    delete process.env.PAYLOAD_ACCEPT_CLIENT_AUDIENCES
    vi.resetModules()
  })

  it('defaults to the Payload resource-server audience', async () => {
    const { getBetterAuthExpectedAudience } = await import('@/lib/betterAuth/env')

    expect(getBetterAuthExpectedAudience()).toEqual(['payload-content-api'])
  })

  it('includes configured resource audiences without accepting stale client audiences', async () => {
    process.env.BETTER_AUTH_JWT_AUDIENCE = 'existing-audience, payload-client-id'
    process.env.PAYLOAD_RESOURCE_SERVER_AUDIENCE = 'payload-content-api'

    const { getBetterAuthExpectedAudience } = await import('@/lib/betterAuth/env')

    expect(getBetterAuthExpectedAudience()).toEqual([
      'payload-content-api',
      'existing-audience',
    ])
  })

  it('can temporarily include client audiences for rollback compatibility', async () => {
    process.env.BETTER_AUTH_JWT_AUDIENCE = 'payload-content-api, extra-resource'
    process.env.PAYLOAD_ACCEPT_CLIENT_AUDIENCES = 'true'

    const { getBetterAuthExpectedAudience } = await import('@/lib/betterAuth/env')

    expect(getBetterAuthExpectedAudience()).toEqual([
      'payload-content-api',
      'extra-resource',
      'payload-client-id',
      'blog-client-id',
    ])
  })
})
